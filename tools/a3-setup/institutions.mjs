import {registerSetupLoader} from './index.mjs';
import {recordHistoricalEvent,worldEvent} from '../../server-plugin/world-events.mjs';
import {applyConsentEvent} from '../../server-plugin/action-consent.mjs';
import {resolveAuthoritySelector,grantLimitedPermit} from '../../server-plugin/action-authority.mjs';

// Historical premises are not actions to replay. In particular a paid event
// never calls trade/transfer, and a case event never calls crime/report/judge.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const alias=x=>text(x)&&!['__proto__','constructor','prototype'].includes(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const keys=(row,allowed)=>Object.keys(row).every(k=>allowed.includes(k));
const sections={history:'01 §1.7、06 §6.3（历史事件与本人同意）',accounts:'01 §1.6（账户开账）',obligations:'01 §1.4、05 §5.2.7（旧义务与案件）',documents:'01 §1.2、05 §5.2.7（同一凭证与证据来源）',cases:'05 §5.2.7（案件程序）',permits:'01 §1.3、06 §6.3（有限许可）',examinations:'06 §6.3（真实考官与认证）',appointments:'06 §6.3（服务与预约）',quotes:'01 §1.6（真实报价）',workstationAccess:'06 §6.6（工位与费用）'};
const gap=(ctx,item,field,reason)=>ctx.unmet(item,`${reason}；设计 ${sections[field]}`);
function rows(ctx,setup,field,load,{skipInvalid=false}={}){
 if(!Array.isArray(setup[field])){if(!skipInvalid)ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!object(row)){if(!skipInvalid)ctx.unmet(item,'expected an object');continue;}
  try{load(row,item);}catch(error){ctx.unmet(item,`${error.message}；设计 ${sections[field]}`);}
 }
}
const requireShape=(condition,message)=>{if(!condition)throw Error(message);};
const state=ctx=>ctx.document.state;
const known=(ctx,id)=>alias(id)&&(id==='player'||Boolean(ctx.actor(id)||ctx.engine.byId.get(id)||state(ctx).created?.[id]||ctx.document.holdings?.entities?.[id]||ctx.engine.rules.economy?.credit?.banks?.some(b=>b.id===id)));
function selector(ctx,value){
 if(typeof value==='string')return ctx.ref(value);
 requireShape(object(value)&&['authorized_owner','authorized_manager'].includes(value.role)&&text(value.of)&&keys(value,['role','of']),'unresolved authority selector');
 return resolveAuthoritySelector({engine:ctx.engine,document:ctx.document},{...value,of:ctx.ref(value.of)});
}
function eventSource(ctx,id){
 requireShape(text(id)&&Object.hasOwn(ctx.bindings,id),`unresolved sourceEvent: ${id}`);
 const key=ctx.ref(id),row=worldEvent(state(ctx),key);
 requireShape(row?.category==='world_event',`sourceEvent is not a loaded history event: ${id}`);
 return row;
}
// Only event endpoint fields are references. Text, scope and source.row must
// never be rewritten just because they happen to equal an alias.
function historyPayload(ctx,row){
 const out=structuredClone(row);
 for(const key of ['actor','to','target','owner','observer','debtor','creditor','court','subject','case','location'])if(typeof out[key]==='string')out[key]=ctx.ref(out[key]);
 if(Array.isArray(out.witnesses))out.witnesses=out.witnesses.map(ctx.ref);
 return out;
}
const eventFields=['id','verb','at','source','actor','subject','service','to','resource','item','quantity','totalCoins','principal','fee','owner','balance','purpose','scope','terms','expires','revoked','debtor','creditor','amount','observer','location','currentlyVisible','atBeforeDetention','name','witnesses','court','case','vocation','condition','damage','target','fine','effective','fireIntensity','spell','atDay','netCoins','acquired','openingStockOnly'];
const verbs=new Set(['appointment_agreed','quoted','opening_balance','paid','permission_granted','consented','crafted','obligation_opened','observed','theft','purchase_receipt','case_registered','judged','evidence_found','qualified','accepted_cargo','delivered','arrest_order','hostile_encounter','ignited','summoned','rite_scheduled','ownership_transferred_and_delivered','trade_completed','refused','wanted_issued']);
function loadHistory(ctx,setup,{selectors=false}={}){
 const ids=new Set();
 const physicalIds=new Set(['itemInstances','objects'].flatMap(field=>Array.isArray(setup[field])?setup[field]:[]).map(row=>row?.id).filter(text));
 rows(ctx,setup,'history',(row,item)=>{
  // Physical premises acquire native identities at 40. Import their permits
  // afterwards so the source event and its consumers refer to the same object.
  // Other history can be a physical premise's own source and must load first.
  const deferred=object(row.actor)||row.verb==='permission_granted'&&['actor','to','target','owner','observer','debtor','creditor','court','subject','case','location'].some(key=>physicalIds.has(row[key]));
  if(deferred!==selectors)return;
  requireShape(keys(row,eventFields)&&alias(row.id)&&!ids.has(row.id)&&!Object.hasOwn(ctx.bindings,row.id)&&!state(ctx).records?.[`world_event:${row.id}`]&&verbs.has(row.verb)&&integer(row.at)&&row.at<=state(ctx).minute&&object(row.source)&&keys(row.source,['kind','row'])&&row.source.kind==='corpus_premise'&&text(row.source.row),'invalid history identity, verb, time or corpus premise source');
  ids.add(row.id);
  for(const field of ['balance','amount','quantity','totalCoins','principal','fee','expires','fine','fireIntensity','atDay'])if(Object.hasOwn(row,field))requireShape(integer(row[field]),`invalid history ${field}`);
  if(row.witnesses!==undefined)requireShape(Array.isArray(row.witnesses)&&row.witnesses.every(x=>known(ctx,ctx.ref(x))),'invalid history witnesses');
  if(row.revoked!==undefined)requireShape(typeof row.revoked==='boolean','invalid revoked flag');
  if(['consented','refused'].includes(row.verb))requireShape(text(row.actor)&&text(row.scope)&&text(row.subject??row.spell)&&integer(row.expires)&&row.expires>row.at&&row.revoked===false&&(row.verb==='refused'||text(row.to)&&object(row.terms)),'invalid explicit consent/refusal scope, terms or expiry');
  if(row.verb==='opening_balance')requireShape(text(row.owner)&&text(row.resource)&&integer(row.balance),'opening_balance needs owner/resource/balance');
  if(row.verb==='obligation_opened')requireShape(text(row.subject)&&text(row.debtor)&&text(row.creditor)&&integer(row.amount),'obligation_opened needs claim and parties');
  const actor=row.actor===undefined?null:selector(ctx,row.actor);
  if(actor!==null)requireShape(known(ctx,actor),'history actor does not exist');
  const payload=historyPayload(ctx,row),key=`world_event:${row.id}`;
  if(actor!==null)payload.actor=actor;
  if(ctx.native(item,d=>recordHistoricalEvent(d,ctx.engine,{id:row.id,verb:row.verb,actor,minute:row.at,location:payload.location??null,witnesses:payload.witnesses??[],source:payload.source,payload})))ctx.bindings[row.id]=key;
  else return;
  if(row.verb!=='consented')return;
  if(row.expires<=state(ctx).minute)return;
  ctx.native(item,d=>{
   const now=d.get('state','minute');d.set(['state','minute'],row.at);
   applyConsentEvent(d,{engine:ctx.engine,document:d.document},{actor,eventId:row.id,verb:'consent_given',to:ctx.ref(row.to),payload:{scope:row.scope,purpose:[ctx.ref(row.terms.spell??row.subject)],subject:ctx.ref(row.subject),terms:structuredClone(row.terms),until:row.expires}});
   d.set(['state','minute'],now);
  });
 },{skipInvalid:selectors});
}

function loadPermits(ctx,setup){rows(ctx,setup,'permits',(row,item)=>{
 requireShape(keys(row,['id','holder','subject','scope','issuer','fromMinute','toMinute','sourceEvent','source','includedInLessonFee','quantityLiters'])&&text(row.id)&&known(ctx,ctx.ref(row.holder))&&text(row.subject)&&text(row.scope)&&(row.quantityLiters===undefined||integer(row.quantityLiters))&&(row.includedInLessonFee===undefined||typeof row.includedInLessonFee==='boolean'),'invalid permit');
 if(row.source==='setup.facts'&&row.scope==='rent_beds'){
  requireShape(row.sourceEvent===undefined&&row.issuer===undefined,'invalid rental authority snapshot');
  const building=state(ctx).buildings?.[ctx.ref(row.subject)];
  if(building?.owner===ctx.ref(row.holder)&&ctx.engine.byId.get(ctx.ref(row.subject))?.lodging){ctx.note(`${item}: existing native building owner and lodging authority retained`);return;}
  gap(ctx,item,'permits','题述出租资格未被原生建筑所有权与住宿设施共同表示；不生成新租约');return;
 }
 requireShape(integer(row.fromMinute)&&integer(row.toMinute)&&row.fromMinute<row.toMinute,'invalid permit interval');
 const issuer=selector(ctx,row.issuer),event=eventSource(ctx,row.sourceEvent);
 requireShape(known(ctx,issuer)&&event.verb==='permission_granted'&&event.actor===issuer&&event.payload.subject===ctx.ref(row.subject)&&event.payload.to===ctx.ref(row.holder)&&event.payload.scope===row.scope,'permit source/issuer/scope mismatch');
 ctx.native(item,d=>grantLimitedPermit(d,{engine:ctx.engine,document:d.document},{actor:issuer,id:row.id,holder:ctx.ref(row.holder),subject:ctx.ref(row.subject),scope:row.scope,fromMinute:row.fromMinute,toMinute:row.toMinute,sourceEvent:ctx.ref(row.sourceEvent),...(row.quantityLiters!==undefined?{quantityLiters:row.quantityLiters}:{}),...(row.includedInLessonFee!==undefined?{includedInLessonFee:row.includedInLessonFee}:{})}));
});}

export {object,text,alias,integer,keys,gap,rows,requireShape,state,known,selector,eventSource};
registerSetupLoader({fields:['history'],order:10,load:loadHistory});
registerSetupLoader({fields:['history'],order:65,load(ctx,setup){loadHistory(ctx,setup,{selectors:true});}});
registerSetupLoader({fields:['permits'],order:70,load:loadPermits});
