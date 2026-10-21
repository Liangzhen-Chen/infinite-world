// Body needs are bounded slow facts, not accounts. The timestamp and activity
// make reads closed-form; no per-minute events or copied derived statuses.
import {reject} from './primitive-policy.mjs';
import {fixedUnits,fixedNumber,checkedFixed} from './rx.mjs';
import {physicalItem} from './items.mjs';
import {isPhysicallyDead} from './holdings.mjs';
import {revivalPoint} from './rule-state-migration.mjs';
const pathOf=(document,actor)=>actor==='player'?['state','player']:document.state.npcs?.[actor]?['state','npcs',actor]:document.state.creatures?.[actor]?['state','creatures',actor]:null;
const atPath=(document,path)=>path?.reduce((v,k)=>v?.[k],document);
// Campaign initial facts are not action proposals. Keep the explicit override
// and its provenance; never manufacture levels or constitution to reach an HP.
export function restoreBodySnapshot(d,engine,actor,row,{origin,sourceEvent}={}){
 const path=pathOf(d.document,actor),body=atPath(d.document,path);
 if(origin!=='initial'||typeof sourceEvent!=='string'||!sourceEvent||!path||!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['hp','maxHp','conscious','activity'].includes(k))||isPhysicallyDead(engine,d,actor))throw Error('Invalid initial body authority or target');
 const hasHp=Object.hasOwn(row,'hp')||Object.hasOwn(row,'maxHp');
 if(hasHp&&(!Number.isSafeInteger(row.hp)||!Number.isSafeInteger(row.maxHp)||row.maxHp<1||row.maxHp>1000000||row.hp<0||row.hp>row.maxHp))throw Error('Initial hp/maxHp must be a complete bounded pair');
 if(hasHp&&row.maxHp!==body.maxHp){
  const proof=d.get('state','records',sourceEvent);
  if(proof?.category!=='world_event'||proof.verb!=='body_initialized'||proof.actor!==actor||proof.payload?.maxHp!==row.maxHp||proof.minute>d.get('state','minute'))throw Error('Changed maximum HP needs a structured constitution or ability source (initial body contract)');
 }
 if(row.conscious!==undefined&&typeof row.conscious!=='boolean'||row.activity!==undefined&&(!['sleeping','awake'].includes(row.activity)))throw Error('Invalid initial consciousness');
 const sleeping=row.activity==='sleeping'||/睡|sleep/i.test(row.activity??body.activity??'');
 if(sleeping&&row.conscious===true)throw Error('Sleeping actor cannot be declared awake');
 if(hasHp){d.set([...path,'hp'],row.hp);d.set([...path,'maxHp'],row.maxHp);d.set([...path,'vitalOverride'],{maxHp:row.maxHp,sourceEvent,origin});}
 if(row.activity!==undefined)d.set([...path,'activity'],row.activity==='sleeping'?'睡眠':'闲暇');
 if(row.conscious!==undefined){
  if(!row.conscious&&!sleeping)d.set([...path,'status'],'昏迷');
  else if(body.status==='昏迷')d.set([...path,'status'],'正常');
  // Coma uses the existing status/capacity consumers. Services and witnesses
  // distinguish sleeping activity from coma and from waking presence.
  if(!row.conscious&&!sleeping)d.set([...path,'capacity'],'none');
  else if(body.status==='昏迷'&&body.capacity==='none')d.remove([...path,'capacity']);
 }
 return atPath(d.document,path);
}
export function restoreRevivalBinding(d,engine,{actor,location,sourceEvent},{origin}={}){
 const source=d.get('state','records',sourceEvent);
 const point=revivalPoint(engine.rules,location);
 if(origin!=='initial'||actor!=='player'||source?.category!=='world_event'||source.verb!=='revival_bound'||source.actor!==actor||source.payload?.subject!==location||source.minute>d.get('state','minute')||!point||d.get('state','buildings',point.location,'condition')===0)throw Error('Invalid initial revival binding source or point');
 location=point.location;
 d.set(['state','revivalPoints',location],{location,registeredAt:source.minute,source:sourceEvent});d.set(['state','player','revivalAnchor'],location);
 return location;
}
export function restoreDeathSnapshot(d,engine,{sourceEvent},{origin}={}){
 const source=d.get('state','records',sourceEvent),xp=source?.payload?.experienceBeforeDeath;
 if(origin!=='initial'||source?.category!=='world_event'||source.verb!=='died'||source.actor!=='player'||!Number.isSafeInteger(source.minute)||source.minute<0||source.minute>d.get('state','minute')||!Number.isSafeInteger(xp)||xp<0)throw Error('Invalid initial death source');
 if(isPhysicallyDead(engine,d,'player'))throw Error('Death is already settled');
 const minute=d.get('state','minute');
 d.set(['state','player','xp'],xp);d.set(['state','player','hp'],0);d.set(['state','minute'],source.minute);
 engine.death(d);d.set(['state','minute'],minute);
 d.set(['state','player','deathSource'],sourceEvent);return d.get('state','player');
}
export function bodyRule(engine,need){
 const row=engine.world.primitiveTables?.body?.rows?.find(r=>r.need===need&&r.selector==='person');
 if(!row)reject('E-BODY-TABLE','The archived body table is required');
 return row;
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
 const rate=fixedUnits(rule.drainPerHour[fact.activity]);
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
export function applyBodyVital(d,engine,actor,need,delta,bound){
 if(delta>0&&['satiety','hydration'].includes(need)){
  for(const patch of d.patches??[]){
   const unit=patch.path?.[1]==='itemInstances'&&patch.path.length===3?patch.value:null;
   if(unit?.status==='已消耗'){
    const facts=physicalItem(d,engine,unit.id);
    if(facts.contaminated===true||facts.toxic===true||facts.condition===0)reject('E-BODY-FOOD','Unsafe consumed food cannot supply this nourishment');
   }
  }
 }
 if(!['stamina','satiety','hydration','fatigue'].includes(need)||!Number.isFinite(delta)||Math.abs(delta)>(bound.body?.[need]??0))reject('E-BODY-BOUND','Body change exceeds its native bound');
 const state=readBodyState(engine,d.document,actor,need),old=state.value,value=writeBodyNeed(d,engine,actor,need,fixedNumber(checkedFixed(fixedUnits(old)+fixedUnits(delta))),{remainder:state.remainder});
 return {target:actor,need,delta:fixedNumber(fixedUnits(value)-fixedUnits(old)),value,asOf:d.get('state','minute')};
}
