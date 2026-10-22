import {preconditionFailure} from './precondition.mjs';
// K2: one executor for the interaction table in world/design/interaction-rules.mjs.
// resolveInteraction is pure (traits in, outcome out); applyInteraction also
// writes the resulting state onto the target's existing storage.
import {interactionRules}from'../world/design/interaction-rules.mjs';
import {traitsOf,canonicalElement,ATTACK_MODES,TACTICS,CREATURE_TAGS}from'./traits.mjs';
import {environmentFeatures}from'./environment.mjs';
import {applyFacilityInteraction}from'./facilities.mjs';
import {facilityView}from'./facility-state.mjs';
import {readObjectState,storeObjectState}from'./magic-object.mjs';
import {nativePrimitiveTransaction}from'./native-primitives.mjs';

export const multiplierBounds=Object.freeze({min:0.5,max:1.5});
const MARKS=['char','temper','stain'],STATES=['burning','wet','frozen'];
const agentOf=agent=>ATTACK_MODES.includes(agent)||['rain','ink','flood'].includes(agent)?agent:canonicalElement(agent)??agent;
const tacticOf=agent=>ATTACK_MODES.includes(agent)?agent:`magic_${agentOf(agent)}`;
function matches(rule,agent,traits){
 if(rule.agent!=='*'&&rule.agent!==agent)return false;
 const tags=new Set(traits.tags),w=rule.when??{};
 if(w.affinity&&!(traits.affinity?.[w.affinity]??[]).includes(tacticOf(agent)))return false;
 if(w.all&&!w.all.every(t=>tags.has(t)))return false;
 if(w.any&&!w.any.some(t=>tags.has(t)))return false;
 if(w.none&&w.none.some(t=>tags.has(t)))return false;
 return true;
}
export function resolveInteraction(agentName,traits,{rules=interactionRules.rules}={}){
 const agent=agentOf(agentName);
 const out={agent,target:traits?.id??null,rules:[],multiplier:1,add:[],remove:[],marks:[],minutes:0,moistureMg:0};
 if(!traits)return out;
 const hit=rules.filter(r=>matches(r,agent,traits));
 const override=hit.find(r=>r.effect.override);
 // An authored species nature is the complete combat profile (it matches the
 // published threat prose); body-tag multipliers apply to the other species.
 const combat=override?[override]:traits.source==='nature'?[]:hit.filter(r=>r.effect.multiplier!==undefined);
 let m=1;for(const r of combat)m*=r.effect.multiplier;
 out.multiplier=Math.min(multiplierBounds.max,Math.max(multiplierBounds.min,m));
 for(const r of hit.filter(r=>r.effect.multiplier===undefined||combat.includes(r))){
  out.rules.push(r.id);
  for(const t of r.effect.add??[])if(!out.add.includes(t))out.add.push(t);
  for(const t of r.effect.remove??[])if(!out.remove.includes(t))out.remove.push(t);
  if(r.effect.mark&&!out.marks.includes(r.effect.mark))out.marks.push(r.effect.mark);
  out.minutes=Math.max(out.minutes,r.effect.minutes??0);out.moistureMg=Math.max(out.moistureMg,r.effect.moistureMg??0);
 }
 return out;
}
export const interactionOf=(engine,doc,agent,target)=>resolveInteraction(agent,traitsOf(engine,doc,target));

// Combat: species nature or body tags decide the damage multiplier for a tactic.
export function creatureCounter(traits,tactic){
 const r=resolveInteraction(tactic,traits);
 if(r.multiplier===1)return null;
 const explicit=r.rules.find(id=>id.startsWith('nature-'));
 return{damageMultiplier:r.multiplier,interaction:{agent:r.agent,rules:r.rules},...(explicit?{nature:{tactic,effect:explicit==='nature-weak'?'weak':'resist'}}:{})};
}

// State writers for the storages that already exist; no new save partitions.
function featureRow(engine,id){return environmentFeatures(engine).find(f=>f.id===id);}
function rawState(d,row){const r=d.get('state','records',`physical_feature:${row.id}`);return structuredClone(r?.state??row.state);}
function rawStore(d,row,state){d.set(['state','records',`physical_feature:${row.id}`],{id:row.id,category:'physical_feature',location:row.location,state});}
function writeFeature(d,row,outcome){
 const minute=d.get('state','minute'),changed={added:[],removed:[]};
 if(row.thermalModel){
  const state=readObjectState(d,row),s=state.thermal,m=row.thermalModel;
  if(outcome.remove.includes('burning')&&s.burning){s.burning=false;s.burnRemainder=0;changed.removed.push('burning');}
  if(outcome.add.includes('burning')&&!s.burning&&s.fuelMg>0&&s.fuelMg<=m.ignitionMaximumMg&&!s.moistureMg){s.burning=true;changed.added.push('burning');}
  if(outcome.add.includes('wet')&&outcome.moistureMg>0){s.moistureMg+=outcome.moistureMg;s.moistureAddedMg=(s.moistureAddedMg??0)+outcome.moistureMg;changed.added.push('wet');}
  if(changed.added.length||changed.removed.length)storeObjectState(d,row,state);
  return changed;
 }
 const state=rawState(d,row);
 if(outcome.add.includes('frozen')&&outcome.minutes>0){state.frozenUntil=minute+outcome.minutes;changed.added.push('frozen');}
 if(outcome.remove.includes('frozen')&&state.frozenUntil!==undefined){delete state.frozenUntil;changed.removed.push('frozen');}
 // Soaking (flood) saturates a feature without a thermal ledger; traits read
 // moisturePercent >= 60 as wet.
 if(outcome.add.includes('wet')&&outcome.moistureMg>0&&(state.moisturePercent??0)<100){state.moisturePercent=100;changed.added.push('wet');}
 if(changed.added.length||changed.removed.length)rawStore(d,row,state);
 return changed;
}
function writeItem(d,owner,id,outcome){
 const held=d.get('state','inventory',id),changed={added:[],removed:[]};
 if(owner!=='player'||!held)return changed;
 if(outcome.add.includes('wet')&&outcome.moistureMg>0){d.set(['state','inventory',id,'moisture'],(held.moisture??0)+outcome.moistureMg);changed.added.push('wet');}
 return changed;
}
// applyInteraction(d,engine,{agent,target}) resolves on current traits and
// writes burning/wet/frozen onto existing feature/item state. Creatures only
// receive the combat multiplier, which the caller applies to its own damage.
export function applyInteraction(d,engine,{agent,target,owner='player',traits=null,moistureMg,minutes,minute,sourceEvent}){
 const program={agent,target,owner,traits,moistureMg,minutes,minute,sourceEvent};
 const out=nativePrimitiveTransaction(d,{engine,family:'k2:interaction',sourceEvent,actor:owner,program,
  primitives:[{op:'status',target,status:agentOf(agent),duration:minutes??0,magnitude:0}],
  apply:tx=>applyInteractionState(tx,engine,program),
  describe:(_effect,result)=>({status:result.added[0]??result.removed[0]??result.agent,duration:result.added.includes('frozen')?result.minutes:0,magnitude:result.added.length?1:result.removed.length?-1:0})});
 return out.results[0];
}
function applyInteractionState(d,engine,{agent,target,owner='player',traits=null,moistureMg,minutes,minute,sourceEvent}){
 const t=traits??traitsOf(engine,d.get('state'),target);
 const outcome=resolveInteraction(agent,t);
 if(moistureMg!==undefined)outcome.moistureMg=moistureMg;
 if(minutes!==undefined&&outcome.minutes>0)outcome.minutes=minutes;
 let changed={added:[],removed:[]};
 const asset=d.get('state','records',target);
 if(asset?.category==='transport_asset'){
  if(outcome.add.includes('wet')){d.set(['state','records',target,'wetUntil'],d.get('state','minute')+60);changed.added.push('wet');}
  if(agent==='fire'&&!((asset.wetUntil??0)>d.get('state','minute')))d.set(['state','records',target,'durability'],Math.max(0,asset.durability-25));
 }
 if(target?.startsWith('feature_')){const row=featureRow(engine,target);if(row)changed=writeFeature(d,row,outcome);}
 else if(target?.startsWith('item_'))changed=writeItem(d,owner,target,outcome);
 else if(facilityView(engine,d.get('state'),target))changed=applyFacilityInteraction(d,engine,target,outcome,{minute,sourceEvent});
 return{...outcome,...changed};
}
export function assertLiquidWater(engine,d,row){
 const until=d.get('state','records',`physical_feature:${row.id}`)?.state?.frozenUntil;
 if(Number.isFinite(until)&&until>d.get('state','minute'))throw preconditionFailure('水面已经冻结，须等融化或用火解冻');
}
export function validateInteractionRules(rules=interactionRules.rules){
 const errors=[],ids=new Set(),known=new Set([...CREATURE_TAGS,'creature','item','feature','location','flammable','conductive','wet','burning','frozen','water','metal','paper','cloth','wood','fiber','grass','leather','indoor']);
 const agents=new Set(['*','rain','ink','flood',...ATTACK_MODES,...TACTICS.map(t=>t.slice(6)).filter(Boolean)]);
 for(const r of rules){
  if(!r.id||ids.has(r.id))errors.push(`交互规则编号缺失或重复：${r.id}`);ids.add(r.id);
  if(!agents.has(r.agent))errors.push(`交互规则施动者未知：${r.id}`);
  for(const t of[...r.when?.all??[],...r.when?.any??[],...r.when?.none??[]])if(!known.has(t))errors.push(`交互规则标签未知：${r.id}:${t}`);
  const e=r.effect??{};
  if(e.multiplier!==undefined&&!(e.multiplier>=multiplierBounds.min&&e.multiplier<=multiplierBounds.max))errors.push(`交互倍率越界：${r.id}`);
  if([...e.add??[],...e.remove??[]].some(t=>!STATES.includes(t))||e.mark&&!MARKS.includes(e.mark))errors.push(`交互效果未接入：${r.id}`);
 }
 return errors;
}
