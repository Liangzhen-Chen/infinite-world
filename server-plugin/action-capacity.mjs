import {aliveHoldings} from './holdings.mjs';
import {npcAgeAt} from './npc-state.mjs';
import {legalCodeAt} from './law-codes.mjs';

export const actionReader=document=>({get:(...path)=>path.reduce((v,k)=>v?.[k],document)});
export function actionEntity({document,engine},id){
 const s=document.state??{},catalog=engine?.byId?.get(id);
 return id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id]??document.holdings?.entities?.[id]?.facts??catalog??null;
}
export function actionAge(context,id){
 const row=actionEntity(context,id);
 return id!=='player'&&context.engine?.byId?npcAgeAt(context.engine,context.document.state,id):row?.age;
}
export function capacity(context,actor,family){
 const state=context.document.state??{},row=actor==='player'?state.player:state.npcs?.[actor]??state.creatures?.[actor];
 if(!row)return {level:'none',reason:'找不到当前具身行动者',sources:[]};
 const effects=Object.values(context.document.state?.effects??{}).filter(e=>e.target===actor&&(e.expires===undefined||e.expires>context.document.state.minute)&&e.remainingUses!==0);
 const flags=[row,...effects];
 const none=flags.some(r=>r.capacity==='none'||r.status==='capacity:none'||['死亡','昏迷','失能'].includes(r.status)||r.diedAt!==undefined)||context.document.holdings?.protocol?.entities?.[actor]?.gone;
 if(none)return {level:'none',reason:'当前失能，无法发起行动',sources:['current body/status']};
 const catalog=context.engine?.byId?.get(actor),species=context.engine?.byId?.get(row.species??catalog?.species),maturity=species?.lifecycle?.maturity??catalog?.lifecycle?.maturity??16;
 const location=actor==='player'?state.location:row.location,code=context.engine&&legalCodeAt(context.engine,location,state),action=family.startsWith('obligation.')?'contract':family==='transfer'?'trade':family;
 const majority=code?.civil?.majority?.[action]??code?.civil?.capacity?.majority?.[action]??context.engine?.rules?.actions?.majority?.[family]??(['trade','transfer'].includes(family)?12:16);
 const age=actionAge(context,actor)??catalog?.age;
 const limited=Number.isFinite(age)&&age<majority*maturity/16||flags.some(r=>r.capacity==='limited'&&(r.scope===undefined||r.scope.includes(family))||r.status==='capacity:limited');
 return {level:limited?'limited':'full',reason:limited?'限制行为能力，行为效力待依法判断':null,sources:['current age/status']};
}
const defaultAllows=['talk','communicate','learn','service','obligation.create','transfer','holding.open','appeal','observe','wait','rite'];
export function canAct(context,actor,family,{to}={}){
 const result=capacity(context,actor,family),tags=result.level==='limited'?['capacity:limited']:[];
 if(result.level==='none')return {...result,allowed:false,tags};
 const custody=aliveHoldings(actionReader(context.document),{kind:'guest_of',holder:actor}).filter(h=>h.variant==='detained');
 for(const h of custody){
  const regime=h.terms?.regime,allows=regime?.allows??defaultAllows;
  const host=context.document.holdings?.locations?.[h.subject]?.at??actionEntity(context,h.subject)?.location??h.subject;
  const proof=family==='move'?context.movementAuthority?.({actor,to,custody:h}):null;
  const movement=family==='move'&&(to===host||proof?.allowed===true&&['escape','escort'].includes(proof.kind)&&typeof proof.source==='string');
  if(!movement&&!allows.some(k=>k===family||family.startsWith(`${k}.`)))return {...result,allowed:false,tags,reason:family==='move'?'受限期间不能自行离开东道分区':'当前拘禁制度不允许这类行动',regime:h.id};
 }
 return {...result,allowed:true,tags};
}
