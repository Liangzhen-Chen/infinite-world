// Body needs are bounded slow facts, not accounts. The timestamp and activity
// make reads closed-form; no per-minute events or copied derived statuses.
import {reject} from './primitive-policy.mjs';
import {fixedUnits,fixedNumber,checkedFixed} from './rx.mjs';
import {physicalItem} from './items.mjs';
import {isPhysicallyDead} from './holdings.mjs';
const pathOf=(document,actor)=>actor==='player'?['state','player']:document.state.npcs?.[actor]?['state','npcs',actor]:document.state.creatures?.[actor]?['state','creatures',actor]:null;
const atPath=(document,path)=>path?.reduce((v,k)=>v?.[k],document);
export function bodyRule(engine,need){
 const row=engine.world.primitiveTables?.body?.rows?.find(r=>r.need===need&&r.selector==='person');
 if(!row)reject('E-BODY-TABLE','The archived body table is required');
 return row;
}
// The single entry for how fast an actor's need falls. The species' nature.metabolism
// scales the person table per need (absent = 1, 0 = never falls); player and
// speciesless actors follow the table as is. Every drain reader goes through here.
export function speciesMetabolism(engine,speciesId,need){
 const factor=engine.byId?.get(speciesId)?.nature?.metabolism?.[need];
 return factor===undefined?1:factor;
}
export function metabolismFactor(engine,state,actor,need){
 if(actor==='player')return 1;
 const row=state?.npcs?.[actor]??state?.creatures?.[actor];
 return speciesMetabolism(engine,row?.species??engine.byId?.get(actor)?.species,need);
}
// Mouths a settlement's granary must feed, derived from the live state: living named residents
// count by their own species factor; the rest of the head count follows the world's authored
// species make-up (pendingSpeciesStructure), or eats as people when there is none.
// Real-valued: callers round once, at the step that removes whole portions.
export function settlementMouths(engine,state,sid,population,need='satiety'){
 const profile=engine.world?.settlementProfiles?.find(p=>p.id===sid);if(!profile)return population;
 const mixed=profile.pendingSpeciesStructure,ids=new Set(profile.residentIds??[]);
 if(mixed)for(const [id,n] of Object.entries(state?.npcs??{}))if(n.materialized?.settlement===sid)ids.add(id);
 let named=0,weighted=0;
 for(const id of ids){if(state?.npcs?.[id]&&isPhysicallyDead(engine,state,id))continue;named++;weighted+=metabolismFactor(engine,state,id,need);}
 let share=1;
 if(mixed){const total=Object.values(mixed).reduce((n,g)=>n+g.population,0);if(total>0)share=Object.entries(mixed).reduce((n,[sp,g])=>n+g.population*speciesMetabolism(engine,sp,need),0)/total;}
 if(weighted===named&&share===1)return population;
 if(population<named)return named>0?weighted*population/named:0;
 return weighted+(population-named)*share;
}
export function settlementMealRatio(engine,state,sid,need='satiety'){
 const population=state?.settlements?.[sid]?.population??0;
 return population>0?settlementMouths(engine,state,sid,population,need)/population:1;
}
// Mouths for a head count after `levy` of them left (soldiers keep the settlement's make-up).
export function mealMouthsOf(engine,state,sid,population,{levy=0,need='satiety'}={}){
 const full=settlementMouths(engine,state,sid,population,need);
 return levy>0&&population>0?full*Math.max(0,population-levy)/population:full;
}
export function bodyDrain(engine,state,actor,need,activity='light'){
 return bodyRule(engine,need).drainPerHour[activity]*metabolismFactor(engine,state,actor,need);
}
export function bodyFact(engine,document,actor,need){
 const path=pathOf(document,actor);if(!path)reject('E-BODY-TARGET','The actor has no body');
 const rule=bodyRule(engine,need),stored=atPath(document,path)?.body?.[need];
 const fact=stored&&typeof stored==='object'?stored:{value:stored??(need==='fatigue'?0:rule.max),asOf:document.state.minute,activity:'rest'};
 if(!Number.isFinite(fact.value)||fact.value<0||fact.value>rule.max||!Number.isSafeInteger(fact.asOf)||fact.asOf>document.state.minute||fact.asOf<0||!Number.isInteger(fact.remainder??0)||(fact.remainder??0)<0||(fact.remainder??0)>=60||!Object.hasOwn(rule.drainPerHour,fact.activity??'rest'))reject('E-BODY-FACT','Invalid body fact');
 return {...fact,activity:fact.activity??'rest'};
}
export function readBodyState(engine,document,actor,need,minute=document.state.minute){
 const fact=bodyFact(engine,document,actor,need),rule=bodyRule(engine,need);
 if(!Number.isSafeInteger(minute)||minute<fact.asOf)reject('E-BODY-TIME','A body read cannot precede its saved fact');
 const rate=fixedUnits(bodyDrain(engine,document.state,actor,need,fact.activity));
 let numerator=checkedFixed(fixedUnits(fact.value)*60n+BigInt(fact.remainder??0)+(need==='fatigue'?1n:-1n)*rate*BigInt(minute-fact.asOf));
 const maximum=fixedUnits(rule.max)*60n;numerator=numerator<0n?0n:numerator>maximum?maximum:numerator;
 // remainder is an integer division carry for minutes/hour, not a second
 // numeric precision. Saving it preserves split/whole-duration equivalence.
 return {value:fixedNumber(numerator/60n),remainder:Number(numerator%60n)};
}
export function readBodyNeed(engine,document,actor,need,minute=document.state.minute){return readBodyState(engine,document,actor,need,minute).value;}
export function writeBodyNeed(d,engine,actor,need,value,{activity='rest',minute=d.get('state','minute'),remainder=0}={}){
 const path=pathOf(d.document,actor),rule=bodyRule(engine,need);
 if(!path||!Number.isFinite(value)||!Number.isSafeInteger(minute)||minute!==d.get('state','minute')||!Number.isInteger(remainder)||remainder<0||remainder>=60||!Object.hasOwn(rule.drainPerHour,activity))reject('E-BODY-FACT','Invalid body update');
 value=Math.max(0,Math.min(rule.max,fixedNumber(fixedUnits(value))));
 if(value===0||value===rule.max)remainder=0;
 d.set([...path,'body',need],{value,asOf:minute,activity,...(remainder?{remainder}:{})});return value;
}
export function beginBodyActivity(d,engine,actor,activity){
 for(const need of ['stamina','satiety','hydration','fatigue']){const state=readBodyState(engine,d.document,actor,need);writeBodyNeed(d,engine,actor,need,state.value,{activity,remainder:state.remainder});}
}
export function endBodyActivity(d,engine,actor){beginBodyActivity(d,engine,actor,'rest');}
// The units this nourishment comes from: those consumed at this minute that
// are food or drink (a caller that knows them passes `consumed`). Without the
// draft's patches, or an explicit list, the source cannot be verified.
function nourishingUnits(d,engine,minute,consumed){
 if(Array.isArray(consumed))return consumed;
 if(!Array.isArray(d.patches))reject('E-BODY-FOOD','The consumed food cannot be verified without the action patches');
 const latest=new Map();
 for(const patch of d.patches)if(patch.op==='set'&&patch.path?.[1]==='itemInstances'&&patch.path.length===3)latest.set(patch.path[2],patch.value);
 return [...latest].filter(([,unit])=>{
  if(unit?.status!=='已消耗'||unit.consumedAt!==minute)return false;
  const catalog=engine.byId.get(unit.item);
  return unit.physicalOnly===true||catalog?.nutrition!==undefined||catalog?.tags?.some(t=>t==='food'||t==='water');
 }).map(([id])=>id);
}
export function applyBodyVital(d,engine,actor,need,delta,bound,{consumed}={}){
 if(delta>0&&['satiety','hydration'].includes(need)){
  for(const id of nourishingUnits(d,engine,d.get('state','minute'),consumed)){
   const facts=physicalItem(d,engine,id);
   if(facts.contaminated===true||facts.toxic===true||facts.condition===0)reject('E-BODY-FOOD','Unsafe consumed food cannot supply this nourishment');
  }
 }
 if(!['stamina','satiety','hydration','fatigue'].includes(need)||!Number.isFinite(delta)||Math.abs(delta)>(bound.body?.[need]??0))reject('E-BODY-BOUND','Body change exceeds its native bound');
 const state=readBodyState(engine,d.document,actor,need),old=state.value,value=writeBodyNeed(d,engine,actor,need,fixedNumber(checkedFixed(fixedUnits(old)+fixedUnits(delta))),{remainder:state.remainder});
 return {target:actor,need,delta:fixedNumber(fixedUnits(value)-fixedUnits(old)),value,asOf:d.get('state','minute')};
}
