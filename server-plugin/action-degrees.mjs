// 06 §6.6: shared data, used by catalog actions, open proposals and rites.
import {npcDecision} from './npc-decision.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {studyBook} from './primitives-learning.mjs';
import {nativePrimitiveTransaction} from './native-primitives.mjs';
import {reject} from './primitive-policy.mjs';
import {heldUnit,wearItem} from './items.mjs';

export const degreeFamily=effect=>effect.op==='emit'&&effect.verb==='request'?'request':effect.op;
export function familyDegree(engine,family,grade){
 const row=engine.world.openActionRules?.families?.[family]?.[grade];
 if(!row)reject('E-ACTION-DEGREE',`Missing degree table: ${family}/${grade}`);
 return row;
}
const pathOf=(d,actor)=>actor==='player'?['state','player']:['state',d.get('state','npcs',actor)?'npcs':'creatures',actor];
export function degreeConsequences(d,engine,action,effects,slots,actor,receipt,grade,{limits,quote}){
 const families=[...new Set(effects.map(degreeFamily))].filter(f=>['fact.set','vital','request','move','create','learn'].includes(f));
 if(!receipt.check)return;
 for(const family of families){
  const row=familyDegree(engine,family,grade);
  if(row.timeMultiplier!==undefined)quote.duration=Math.floor(quote.duration*row.timeMultiplier);
  if(row.materials!==undefined)quote.materialMultiplier=row.materials;
  if(row.quality){limits.improvised=true;limits.quality=action.id==='open:proposal'&&effects.some(e=>e.op==='create'&&e.facts?.quality==='crude')?'crude':row.quality;}
  if(family==='fact.set'){
   const tool=slots.tool??slots.instrument;
   if(tool&&row.toolWear){
    const old=heldUnit(d,engine,actor,tool);
    if(!old||engine.quantity(d,actor,tool)<1||!Number.isFinite(old.durability)||old.durability<=0)reject('E-ACTION-TOOL','The declared tool must be held and usable');
    const value=Math.max(0,old.durability-row.toolWear);
    const out=nativePrimitiveTransaction(d,{engine,family:'degree:tool',sourceEvent:receipt.eventId,actor,program:{tool,grade},primitives:[{op:'fact.set',entity:tool,field:'durability',value}],
     apply(tx){const after=wearItem(tx,engine,actor,tool,row.toolWear);return {before:old.durability,after,...(old.instance?{instance:old.instance}:{})};}});
    receipt.consequences.push({kind:'tool_wear',tool,amount:old.durability-value,source:out.receipt.eventId});
   }
  }
  if(family==='request')for(const effect of effects.filter(e=>degreeFamily(e)==='request')){
   if(!d.get('state','npcs',effect.target))continue;
   const decision=npcDecision(subjectiveView(engine,d.document,effect.target),{...effect.payload,from:actor,kind:effect.payload?.kind??action.id});
   // A good roll cannot erase red lines, incapacity or an actual conflict.
   if(['agree','conditional'].includes(decision.outcome)){
    if(row.response==='refuse')Object.assign(decision,{outcome:'refuse',reason:'这次请求没有说动对方。',conditions:null});
    else if(row.response==='conditional'&&decision.outcome==='agree')Object.assign(decision,{outcome:'conditional',reason:'对方要求先确认具体条件。',conditions:{confirm:true}});
   }
   const delta=row.standing<0||decision.outcome==='agree'?row.standing:0;
   if(delta){
    const out=nativePrimitiveTransaction(d,{engine,family:'degree:request',sourceEvent:receipt.eventId,actor,program:{target:effect.target,grade,delta},primitives:[effect],
     apply:tx=>engine.primitiveAdjustStanding(tx,effect.target,actor,delta,{sourceEvent:receipt.eventId,reason:`request:${grade}`,minute:tx.get('state','minute')})});
    receipt.consequences.push({kind:'standing',holder:effect.target,target:actor,delta,source:out.receipt.eventId});
   }
   receipt.decisions??=[];receipt.decisions.push({target:effect.target,...decision});
  }
  if(family==='learn'&&row.misunderstanding)for(const effect of effects.filter(e=>e.op==='learn'&&e.learningSource!=='practice'&&!d.get('state','npcs',e.learningSource))){
   const learner=effect.entity??actor;if(learner!==actor)reject('E-LEARN-ACTOR','Misunderstanding belongs to the learner');
   const path=actor==='player'?['state','skills',effect.subject]:[...pathOf(d,actor),'skills',effect.subject],raw=d.get(...path),old=typeof raw==='number'?{proficiency:raw}:raw;
   if(!old)continue;
   const instance=d.get('state','itemInstances',effect.learningSource),book=instance?.book??engine.byId.get(instance?.item??effect.learningSource)?.book;
   if(book)studyBook(d,engine,actor,effect.learningSource,effect.subject);
   else {const project=d.get('state','projects',effect.learningSource),subject=engine.byId.get(effect.subject);if(project?.type!=='研究'||project.stage!=='打磨'||project.result!==effect.subject||subject?.source!==effect.learningSource)reject('E-LEARN-SOURCE','Misunderstanding requires an actual study source');}
   const value=Math.max(0,old.proficiency-row.misunderstanding);
   const out=nativePrimitiveTransaction(d,{engine,family:'degree:misunderstanding',sourceEvent:receipt.eventId,actor,program:{subject:effect.subject,source:effect.learningSource},primitives:[{...effect,amount:-row.misunderstanding}],
    apply(tx){const next={...old,proficiency:value};delete next.grade;tx.set(path,typeof raw==='number'?value:next);return {before:old.proficiency,after:value,gain:value-old.proficiency};}});
   receipt.consequences.push({kind:'misunderstanding',subject:effect.subject,delta:value-old.proficiency,source:out.receipt.eventId});
  }
 }
}
export function finishDegreeConsequences(d,engine,receipt){
 if(receipt.outcome!=='partial')return;
 for(const effect of receipt.applied.filter(e=>e.op==='move')){
  const row=familyDegree(engine,'move','partial'),actor=effect.entity??receipt.actor,key=`degree:${receipt.eventId}:suspected`;
  d.set(['state','effects',key],{kind:'action_status',target:actor,status:row.status,source:receipt.eventId,expires:d.get('state','minute')+row.duration});
  receipt.consequences.push({kind:'suspected',target:actor,effect:key});
 }
}
