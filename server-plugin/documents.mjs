import {preconditionFailure} from './precondition.mjs';
import {declareHoldingWriter,holdingSet,setLocation,locationOf} from './holdings.mjs';
import {trackTransferUnit,changeItems,transferItems} from './items.mjs';
import {bag,placed,moveStock,BOOKED} from './stock.mjs';
import {institutionOriginal,obligationRows,obligationView} from './obligation-state.mjs';
import {obligationRepresentative} from './obligation-runtime.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {canReadLanguage} from './subjective-view.mjs';
import {visibleEntity} from './perception.mjs';
import {placeLayout,zoneOf} from './place-layout.mjs';
import {publishTransitionEvent,worldEvent} from './world-events.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {purse,vault} from './money.mjs';

declareHoldingWriter('documents',{entities:['item'],locations:true});
declareLedgerWriter('documents');
const path=id=>['state','itemInstances',id];
const text=value=>{
 if(typeof value!=='string'||!value.trim()||value.length>1200)throw preconditionFailure('文书需要实际文字，限一千二百字');
 return value.trim();
};
const body=(s,actor)=>actor==='player'?s.player:s.npcs?.[actor];
const here=(s,actor)=>actor==='player'?s.location:s.npcs?.[actor]?.location;
export function canReadDocument(engine,state,actor,paper){
 const reader=body(state,actor);
 return reader&&reader.hasVision!==false&&!reader.eyesClosed&&knowledgeProficiency(engine,state,actor,'skill_literacy')>=engine.rules.books.minimumLiteracy&&canReadLanguage(engine,state,actor,paper.document.language);
}
export function documentAccessible(engine,document,id,actor='player'){
 const paper=institutionOriginal(engine,document,id),s=document.state;
 if(!paper?.document||paper.durability<=0||paper.destroyedAt!==undefined||paper.status==='已消耗')return false;
 const placement=document.holdings?.locations?.[id];
 if(placement?.mode==='carried')return placement.at===actor;
 if(paper.owner===actor&&!paper.document.posted&&s.inventory?.[paper.item]?.instances?.includes(id)&&actor==='player')return true;
 return paper.document.public===true&&paper.location===here(s,actor)&&visibleEntity(engine,document,id,actor);
}
// A read projection has no access to the event payload behind the paper.
export function documentView(engine,document,id,actor='player'){
 if(!documentAccessible(engine,document,id,actor))return null;
 const paper=institutionOriginal(engine,document,id);
 if(!canReadDocument(engine,document.state,actor,paper))return null;
 const row=paper.document;
 return {id,kind:row.kind,content:row.content,valid:row.valid??null,sourceEvent:row.sourceEvent,describes:row.describes??null,public:row.public,language:row.language,annotations:structuredClone(row.annotations??[])};
}
function write(d,id,row,eventId){holdingSet(d,null,path(id),row,'documents',eventId);}
function held(d,engine,id){
 const p=institutionOriginal(engine,d.document,id);
 if(!p?.document||p.owner!=='player'||locationOf(d,id)?.at!=='player'||!d.get('state','inventory',p.item,'instances')?.includes(id)||p.durability<=0)throw preconditionFailure('需要实际持有完好的文书原件');
 return d.get(...path(id));
}
function source(d,engine,reference){
 const event=worldEvent(d.get('state'),reference);
 if(!event||event.source?.kind==='corpus_premise')throw preconditionFailure('须先完成真实交易或机构办理');
 const sale=d.get('state','records',`item_sale:${event.id}`),institution=d.get('state','records',`governance_source:${event.id}`);
 const deposit=obligationRows(d.get('state')).find(o=>o.kind==='deposit'&&o.terms?.sourceEvent===event.id);
 if(deposit){
  const bank=engine.rules.economy.credit.banks.find(b=>b.id===deposit.debtor)??d.get('state','records',deposit.debtor);
  const certifier=obligationRepresentative(engine,d.get('state'),deposit.debtor);
  const opening=worldEvent(d.get('state'),`obligation:${deposit.id}:${event.id}:deposit`);
  const funding=d.get('state','records',`bank_deposit:${event.id}`);
  if(!opening||opening.verb!=='obligation_opened'||opening.result?.id!==deposit.id||opening.result.remaining!==deposit.terms.principal||deposit.amount!==deposit.terms.principal+(deposit.interest??0)||opening.minute!==deposit.createdAt||
     funding?.category!=='bank_deposit'||funding.claim!==deposit.id||funding.bank!==deposit.debtor||funding.depositor!==deposit.creditor||funding.principal!==deposit.terms.principal||funding.fee!==deposit.terms.fee||funding.gross!==funding.principal+funding.fee||funding.minute!==deposit.createdAt||funding.sourceEvent!==event.id||funding.from!==purse(engine,deposit.creditor)||funding.to!==vault(deposit.debtor)||
     deposit.creditor!=='player'||deposit.terms.bank!==deposit.debtor||bank?.location!==d.get('state','location')||!certifier||!obligationView(d.get('state'),deposit).owed)
   throw preconditionFailure('存单须由在场钱庄核验真实存款来源、具名债权与金额');
  const minutes=engine.world.openActionRules.generic.transferMinutes;
  engine.assertNpcObligationAction(d,['player',certifier],{minutes});engine.assertNpcAutonomyAction(d.get('state'),['player',certifier],{minutes});
  return {event,deposit,bank,certifier,describes:deposit.id};
 }
 if(sale?.category==='item_sale'&&event.verb==='trade'&&sale.buyer==='player'&&sale.quantity>0)return {event,sale,describes:sale.instances.length===1?sale.instances[0]:`item_sale:${event.id}`};
 if(institution?.category==='governance_receipt'&&event.actor==='player'&&institution.result?.ok!==false)return {event,institution,describes:`governance_source:${event.id}`};
 throw preconditionFailure('该来源不是玩家已完成的交易或机构办理');
}
// Deposit-receipt loss (挂失): the holder reports at the issuing counter. The
// original is voided at once; the claim still demands a valid named original,
// so only a reissued paper (documents:issue on the same deposit) can redeem it.
export function reportDepositLost(d,engine,{bank,keeper,claim,eventId}){
 const s=d.get('state'),row=obligationRows(s).find(o=>o.id===claim&&o.kind==='deposit');
 if(!row||row.debtor!==bank.id||row.creditor!=='player'||!obligationView(s,row).owed)throw preconditionFailure('没有本人在此钱庄尚存的存款债权可挂失');
 const required=row.terms?.requiresInstrument,old=typeof required==='string'?s.itemInstances?.[required]:null;
 if(!required)throw preconditionFailure('这笔存款没有签发具名存单，无须挂失');
 if(!old?.document||old.document.valid!==true)throw preconditionFailure('该存单已经挂失作废');
 const lost={minute:s.minute,event:`world_event:${eventId}:lost`,keeper,bank:bank.id};
 write(d,required,{...old,document:{...old.document,valid:false,lost}},eventId);
 publishTransitionEvent(d,engine,{id:`${eventId}:lost`,verb:'author',actor:'player',target:required,visibility:'private',witnesses:[],participants:['player',keeper,bank.id],minute:s.minute,location:s.location,tags:['document','lost']});
 engine.advance(d,engine.world.openActionRules.generic.transferMinutes,eventId);
 return {claim,lost:required,balance:obligationView(d.get('state'),row).owed,note:'原件已作废；请凭此存款来源用 documents:issue 补发新存单，新单可支取。'};
}
function blank(d,engine,item,eventId){
 const definition=engine.byId.get(item),held=d.get(...engine.bagPath('player'),item),ids=held?.instances??[];
 if(!definition?.tags?.includes('paper'))throw preconditionFailure('需要实际持有可书写的空白纸');
 const available=ids.find(id=>{const p=d.get(...path(id));return p?.owner==='player'&&p.status==='持有'&&!p.document&&p.durability>0;});
 if(available)return available;
 if(engine.quantity(d,'player',item)<=ids.length)throw preconditionFailure('没有剩余空白纸；已写原件不能当作新纸');
 return trackTransferUnit(d,engine,'player',item,eventId,null,{untracked:true});
}
function remember(d,engine,id,actor,eventId){
 const view=documentView(engine,d.document,id,actor);
 if(!view)throw preconditionFailure('读者无法看见原件，或不识该文书的文字');
 const key=`document_read:${eventId}:${actor}`;
 holdingSet(d,null,['state','records',key],{category:'knowledge',observer:actor,subject:actor,kind:'document',sourceType:'文书',sourceEvent:id,document:id,content:view.content,annotations:view.annotations,minute:d.get('state','minute')},'documents',eventId);
 // Only the reader receives this version; bystanders see no contents.
 publishTransitionEvent(d,engine,{id:`${eventId}:read:${actor}`,verb:'tell',actor,target:actor,source:{document:id},summary:view.content,visibility:'private',witnesses:[],minute:d.get('state','minute'),location:here(d.get('state'),actor),tags:['document','private']});
 return view;
}
export function documentAction(d,engine,args,eventId){
 const operation=args.operation.replace('governance_document_',''),s=d.get('state');
 if(operation==='list')return {documents:Object.values(s.itemInstances??{}).filter(p=>documentAccessible(engine,d.document,p.id)).map(p=>({id:p.id,kind:p.document.kind,readable:canReadDocument(engine,s,'player',p),public:p.document.public})),actionScope:{kind:'instant'}};
 if(operation==='issue'){
  const proof=source(d,engine,args.source),kind=args.kind??'receipt';
  if(!['receipt','notice'].includes(kind))throw preconditionFailure('本流程签发收据或告示');
  if(Object.values(s.itemInstances??{}).some(p=>p.document?.sourceEvent===`world_event:${proof.event.id}`&&p.document.kind===kind&&!p.document.lost))throw preconditionFailure('这次事务已签发原件，请取用原件');
  const content=args.text===undefined?(proof.deposit?`具名存单：${proof.bank.name}收存${s.player.name??'本人'}${proof.deposit.terms.principal}铜，凭此原件支取；已支取部分以柜账核销。`:proof.sale?`${engine.byId.get(proof.sale.item)?.name}×${proof.sale.quantity}，成交${proof.event.value}铜。`:'机构办理凭据'):text(args.text);
  if(!canReadDocument(engine,s,'player',{document:{language:args.language??'lang:common'}}))throw preconditionFailure('你尚不能书写这种文字');
  const item=engine.resolve(args.paper,'item'),id=blank(d,engine,item,eventId),paper=d.get(...path(id));
  // Writing consumes one blank sheet by converting that SAME physical unit.
  // The written sheet remains in the bag; it is never an extra stock output.
  const ruleVersion=engine.replaying?engine.replayResult?.ruleVersion??engine.world.version:engine.world.version;
  const doc={kind,sourceEvent:`world_event:${proof.event.id}`,issuedEvent:`world_event:${eventId}:issued`,ruleVersion,describes:proof.describes,language:args.language??'lang:common',content,records:[{event:`world_event:${proof.event.id}`,version:content}],public:false,annotations:[],reviewed:false};
  if(proof.deposit){
   // A lost original (reported at the counter) no longer counts: the one claim
   // may be reissued once, and only the reissued paper then redeems it.
   const required=proof.deposit.terms.requiresInstrument,prior=typeof required==='string'?s.itemInstances?.[required]:null;
   if(kind!=='receipt'||required&&!(prior?.document?.lost&&prior.document.valid===false))throw preconditionFailure('同一笔存款只能签发一份具名存单；原件未挂失前不能补发');
   doc.valid=true;doc.namedHolder=proof.deposit.creditor;doc.issuer=proof.deposit.debtor;doc.certifier=proof.certifier;
   d.set(['state','obligations',proof.deposit.id],{...proof.deposit,terms:{...proof.deposit.terms,requiresInstrument:id,...(prior?{reissuedFrom:[...proof.deposit.terms.reissuedFrom??[],required]}:{})}});
   if(prior)write(d,required,{...prior,document:{...prior.document,lost:{...prior.document.lost,supersededBy:id}}},eventId);
  }
  write(d,id,{...paper,...(proof.deposit?{represents:proof.deposit.id}:{}),document:doc},eventId);setLocation(d,{entity:id,at:'player',mode:'carried',writer:'documents',engine});
  publishTransitionEvent(d,engine,{id:`${eventId}:issued`,verb:'author',actor:'player',target:id,visibility:'private',witnesses:[],...(proof.deposit?{participants:['player',proof.certifier,proof.deposit.debtor]}:{}),minute:s.minute,location:s.location,tags:['document'],source:{event:doc.sourceEvent},ruleVersion:doc.ruleVersion});
  engine.advance(d,engine.world.openActionRules.generic.transferMinutes,eventId);
  return {document:id,sourceEvent:doc.sourceEvent,describes:doc.describes,ruleVersion,paperUsed:1,minutes:engine.world.openActionRules.generic.transferMinutes};
 }
 const id=args.document;
 if(operation==='read')return {document:remember(d,engine,id,'player',eventId),actionScope:{kind:'instant'}};
 const paper=held(d,engine,id);
 if(operation==='annotate'){
  if(args.reviewed!==undefined&&typeof args.reviewed!=='boolean')throw preconditionFailure('Invalid existing paper, holder or document source: reviewed must be boolean');
  if(!canReadDocument(engine,s,'player',paper))throw preconditionFailure('你尚不能书写这种文字');
  const annotation={text:text(args.text),actor:'player',sourceEvent:`world_event:${eventId}:annotation`,minute:s.minute};
  write(d,id,{...paper,document:{...paper.document,annotations:[...paper.document.annotations,annotation],...(args.reviewed===undefined?{}:{reviewed:args.reviewed})}},eventId);
  publishTransitionEvent(d,engine,{id:`${eventId}:annotation`,verb:'author',actor:'player',target:id,visibility:'private',witnesses:[],minute:s.minute,location:s.location,source:{document:id},tags:['document','annotation']});
  engine.advance(d,engine.world.openActionRules.generic.transferMinutes,eventId);return {document:id,annotation};
 }
 if(operation==='show'){
  const target=engine.resolve(args.target,'npc'),n=body(s,target);
  if(!n||here(s,target)!==s.location||!visibleEntity(engine,d.document,target)||['昏迷','死亡','濒死'].includes(n.status)||/睡眠|睡觉|熟睡/.test(n.activity??''))throw preconditionFailure('须向可见且清醒的在场读者出示');
  // Temporarily presenting the same unit to the reader changes neither custody
  // nor title. Visibility of the holder supplies the line of sight.
  const view=canReadDocument(engine,s,target,paper)?{content:paper.document.content,annotations:paper.document.annotations}:null;
  if(view)holdingSet(d,null,['state','records',`document_read:${eventId}:${target}`],{category:'knowledge',observer:target,subject:target,kind:'document',sourceType:'文书',sourceEvent:id,document:id,...structuredClone(view),minute:s.minute},'documents',eventId);
  return {document:id,target,read:Boolean(view),actionScope:{kind:'instant'}};
 }
 if(operation==='give'){
  const target=engine.resolve(args.target,'npc');
  if(here(s,target)!==s.location||!visibleEntity(engine,d.document,target))throw preconditionFailure('收件人不在可及范围');
  transferItems(d,engine,'player',target,paper.item,1,[id]);
  return {document:id,holder:target};
 }
 if(operation==='post'){
  const layout=placeLayout(engine,d.document),position=zoneOf(engine,d.document);
  if(!position)throw preconditionFailure('需要实际可达的张贴位置');
  changeItems(d,engine,'player',paper.item,-1,{preserve:true,selection:[id],books:BOOKED});
  moveStock(d,{from:bag(engine,'player',paper.item),to:placed(engine,s.location,paper.item),amount:1,writer:'documents',eventId});
  const point=s.records?.local_player_position?.location===s.location?s.records.local_player_position.point:position.point;
  write(d,id,{...paper,status:'落地',location:s.location,document:{...paper.document,public:true,posted:{location:s.location,zone:position.id,point:point??null}}},eventId);
  setLocation(d,{entity:id,at:layout.location,mode:'place',writer:'documents',engine});
  return {document:id,postedAt:s.location,actionScope:{kind:'instant'}};
 }
 throw preconditionFailure('未知文书操作');
}
