// Native request programs for intentions which do not claim a successful effect.
// Requests record speech, never another person's agreement or a completed service.
import {reject} from './action-rejection.mjs';
import {canAct} from './action-capacity.mjs';
import {subjectiveView,subjectiveFact,conversationLanguage} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {declareHoldingWriter,holdingSet,isPhysicallyDead} from './holdings.mjs';
import {catalogDefinition} from './catalog.mjs';
import {MemoryIndex} from './retrieval.mjs';
import {saveDialogue} from './dialogue.mjs';
const tokenizer=new MemoryIndex();
declareHoldingWriter('routing-programs');

// The proposal's intent is the player's own text; no scorer framing is parsed.
export const intentText=p=>typeof p.intent==='string'?p.intent:'';
// A generic request's subject is classified by the action catalog
// (signature.requestSubjects, via the caller's classify); unknown subjects stay
// a plain request. No subject vocabulary is written here.
export function requestKind(effect,classify=()=>null){
 if(effect?.op!=='emit')return null;
 const {kind,subject}=effect.payload??{};
 if(kind==='confession')return 'confession';
 if(effect.verb==='tell')return kind??'tell';
 if(effect.verb!=='request')return kind;
 if(kind!=='request')return kind;
 return (typeof subject==='string'&&classify(subject))||'request';
}

export function executeRoutingProgram(d,engine,tool,args,eventId){
 if(tool==='settlement'&&args.operation==='festival_plan'&&args.festival===undefined){
  if(args.project!==undefined){
   const project=d.get('state','projects',args.project);
   if(project?.type!=='节庆筹办'||project.actor!=='player'||project.stage!=='征询'||project.location!==d.get('state','location'))reject('E-ACTION-FESTIVAL-PROJECT','须在筹办地点继续本人的征询项目');
   const answer=executeRoutingProgram(d,engine,'remember',{key:'dialogue:ask_request',subject:args.speaker,content:args.content??`是否愿意参与${project.name}或商议场地；尚未承诺付费与参加`},eventId);
   holdingSet(d,engine,['state','projects',args.project,'requests'],[...project.requests??[],{target:answer.dialogue.npc,sourceEvent:eventId,minute:d.get('state','minute')}],'routing-programs');
   return {...answer,project:args.project};
  }
  if(args.authorization!==undefined||args.sponsor&&args.sponsor!=='player'||args.supplier!==undefined||args.cost!==undefined||args.consent!==undefined)reject('E-ACTION-FESTIVAL-SOURCE','筹办构想不能代填公款、收费或参与者同意');
  if(!Number.isSafeInteger(args.budget)||args.budget<0||args.budget>d.get('state','player','coins'))reject('E-ACTION-FESTIVAL-BUDGET','筹办预算须在自己的实际钱袋以内');
  if(args.settlement!==undefined&&args.settlement!==d.get('state','location'))reject('E-ACTION-FESTIVAL-LOCATION','请在拟征询场地提出构想');
  const key=`festival_project:${eventId}`;
  const project={id:key,type:'节庆筹办',name:args.name??'邻里节庆构想',actor:'player',location:d.get('state','location'),budget:args.budget,spent:0,stage:'征询',venueConsent:null,participants:[],sourceEvent:eventId};
  initializeFestivalProject(d,engine,project,{origin:'action',eventId});
  return {project:key,stage:project.stage,actionScope:{kind:'instant'}};
 }
 if(tool!=='remember')return null;
 const kind=({'dialogue:delivery_request':'delivery','dialogue:ask_request':'ask','dialogue:persuade_request':'make_way','dialogue:self_tell':'tell'})[args.key];
 if(!kind)return null;
 const npc=engine.resolve(args.subject,'npc'),state=d.get('state'),body=state.npcs?.[npc];
 if(!body||body.location!==state.location||body.scheduleTravel||body.cognitionTravel||isPhysicallyDead(engine,d,npc)||['昏迷','濒死'].includes(body.status))reject('E-ACTION-TALK-PRESENT','对方须清醒且真实在场');
 for(const actor of ['player',npc]){const permission=canAct({engine,document:d.document},actor,'talk');if(!permission.allowed)reject('E-ACTION-TALK-CAPACITY',permission.reason);}
 if(typeof args.content!=='string'||!args.content.trim()||args.content.length>4000)reject('E-ACTION-TALK-CONTENT','请说明要说的话');
 const view=subjectiveView(engine,d.document,npc),language=conversationLanguage(view,engine,d);
 const decision=npcDecision(view,{kind:kind==='guide'?'带路':kind==='delivery'?'送货':kind,from:'player'});
 let text=language?'已听到你的请求，具体条款仍须另行约定。':'言语不通，需要手势或通译。';
 if(language&&kind==='ask'){
  const playerView=subjectiveView(engine,d.document,'player'),sources=new Set(playerView.knowledge.memories.flatMap(m=>[m.id,m.sourceEvent].filter(Boolean)));
  const shared=m=>m.participants?.includes('player')||sources.has(m.sourceEvent??m.id);
  const candidate=subjectiveFact(view,args.content),known=candidate&&(candidate.kind==='prior'||sources.has(candidate.source))?candidate:null;
  text=known?`我知道：${typeof known.value==='string'?known.value:JSON.stringify(known.value)}`:'这件事我不知道。';
  if(!known){
   const terms=new Set(tokenizer.terms(args.content));
   const recalled=view.knowledge.memories.filter(m=>shared(m)&&typeof m.content==='string').map(m=>({m,score:tokenizer.terms(m.content).filter(t=>terms.has(t)).length})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||(b.m.minute??0)-(a.m.minute??0))[0]?.m;
   if(recalled)text=`我记得：${recalled.content}。至于眼下的情况，还需要看看。`;
  }
 }
 if(kind==='tell')text=language?'我听到你这样说了，尚未核实。':text;
 const action=kind==='tell'?'tell':kind==='ask'?'ask':kind==='make_way'?'persuade':'request';
 const judgement=language&&kind==='make_way'?engine.check(d,{attribute:'魅力',opponent:{npc,attribute:'精神'}},eventId):null;
 const {dialogue}=saveDialogue(d,npc,eventId,action,decision,text,{content:args.content,requestKind:kind,...(judgement?{judgement}:{})});
 holdingSet(d,engine,['state','records',`speech:${eventId}`],{category:'speech',actor:'player',target:npc,content:args.content,kind,minute:state.minute,sourceEvent:eventId,verified:false},'routing-programs');
 return {dialogue,actionScope:{kind:'instant'},socialEvent:{verb:kind==='tell'?'tell':'request',target:npc,visibility:kind==='tell'?'witnessed':'private',witnesses:[npc],tags:['dialogue',kind],payload:{kind,content:args.content,source:'player',verified:false}}};
}

// Initial snapshots contain a pending proposal only. No permit or enrollment
// can be imported by this writer; later execution rechecks actual decisions.
export function initializeFestivalProject(d,engine,row,context){
 const keys=['id','type','name','actor','location','budget','spent','stage','venueConsent','participants','sourceEvent'];
 if(!['initial','action'].includes(context?.origin)||typeof row.id!=='string'||!row.id||!context.eventId||d.get('state','projects',row.id)||Object.keys(row).some(k=>!keys.includes(k))||row.type!=='节庆筹办'||row.actor!=='player'||row.location!==d.get('state','location')||!Number.isSafeInteger(row.budget)||row.budget<0||row.budget>d.get('state','player','coins')||row.spent!==0||row.stage!=='征询'||row.venueConsent!==null||!Array.isArray(row.participants)||row.participants.length)throw Error('Invalid pending festival project');
 holdingSet(d,engine,['state','projects',row.id],{...structuredClone(row),sourceEvent:context.eventId},'routing-programs');
}

export function routingRead(engine,document,action,input,{preview=false}={}){
 if(!action?.readOnly||!['world_read','world_catalog'].includes(action.call?.tool))return null;
 const slots=input.args?.slots??{};
 if(Object.keys(slots).some(k=>!action.slots.some(s=>s.name===k)))throw Error('Invalid read slots');
 if(slots.section!==undefined&&!['行囊','约定','人物'].includes(slots.section))throw Error('Invalid read section');
 if(slots.npc!==undefined&&(slots.section!=='人物'||typeof slots.npc!=='string'))throw Error('npc requires the people section');
 const people=slots.section==='人物'?subjectiveView(engine,document,'player').observable.people.filter(p=>!slots.npc||p.id===slots.npc):null;
 const data=action.call.tool==='world_read'?(people??(slots.section==='约定'?Object.values(document.state.obligations??{}).filter(o=>[o.debtor,o.creditor,o.promisor,o.promisee].includes('player')):{coins:document.state.player.coins,inventory:structuredClone(document.state.inventory)})):slots.entity||slots.kind?catalogDefinition(engine,document,slots):{help:'角色面板：从无限原野扩展菜单选择“角色”；账目与行囊从相应面板查看。'};
 return {patches:[],receipt:{eventId:input.eventId,actor:'player',routed:action.id,status:preview?'preview':'committed',applied:[],cost:{time:0,resources:[]},data}};
}
