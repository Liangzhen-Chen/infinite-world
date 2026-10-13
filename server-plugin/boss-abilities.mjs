import {validateEffectSpec,resolveVitalityPrimitive}from'./magic-primitives.mjs';
import {magicStatuses,magicStatusStats,applyMagicStatus}from'./magic-status.mjs';
import {validateAreaCatalog}from'./magic-area.mjs';
import {actorPath}from'./npc-state.mjs';
const areaCatalog=a=>({id:a.id,effectSpec:a.effectSpec,duration:a.duration,rangeMeters:a.effectSpec.radiusMeters,targeting:{lineOfSight:true}});
const tactics=new Set(['armed','unarmed','defend','flee','shove','magic_fire','magic_cold','magic_wind','magic_earth','magic_light','magic_shadow','magic_mind','magic_physical','magic_untyped']);
export function validateBossMechanics(boss){
 const m=boss.mechanics;if(!m)return[];const errors=[];
 const strict=(o,keys)=>!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k));
 if(strict(m,['adaptation','weaknesses','abilities']))return['首领机制含未实现字段'];
 const a=m.adaptation;if(strict(a,['tactics','threshold','perStep','maximum'])||!Array.isArray(a?.tactics)||!a.tactics.length||new Set(a.tactics).size!==a.tactics.length||a.tactics.some(t=>!tactics.has(t))||!Number.isSafeInteger(a.threshold)||a.threshold<1||a.threshold>10||!Number.isFinite(a.perStep)||a.perStep<=0||a.perStep>.2||!Number.isFinite(a.maximum)||a.maximum<0||a.maximum>.5)errors.push('首领适应模板无效');
 if(!Array.isArray(m.weaknesses)||m.weaknesses.length>3)errors.push('首领弱点列表无效');
 else for(const w of m.weaknesses)if(strict(w,['tactic','requiresStatus','ignoreAdaptation'])||!tactics.has(w.tactic)||!magicStatuses[w.requiresStatus]||w.ignoreAdaptation!==true)errors.push('首领弱点须有战术、实际状态及明确适应解除');
 if(!Array.isArray(m.abilities)||m.abilities.length>3)errors.push('首领能力列表无效');
 else for(const s of m.abilities){
  if(strict(s,['id','every','belowHpPercent','effectSpec','duration'])||!/^ability_[a-z0-9_]+$/.test(s.id)||!Number.isSafeInteger(s.every)||s.every<1||s.every>10||!Number.isFinite(s.belowHpPercent)||s.belowHpPercent<=0||s.belowHpPercent>100)errors.push('首领能力触发规则无效');
  errors.push(...validateEffectSpec(s.effectSpec));
  if(!['damage','status','area'].includes(s.effectSpec?.kind))errors.push('本批首领反击只支持伤害、状态或伤害区域');
  if(s.effectSpec?.kind==='area'){
   errors.push(...validateAreaCatalog(areaCatalog(s)));
   if(s.effectSpec.effect?.kind!=='damage'||s.effectSpec.power>100||s.effectSpec.radiusMeters>10||s.duration>10)errors.push('首领区域只支持有限范围、短时伤害');
  }
  if(s.effectSpec?.kind==='damage'&&(s.effectSpec.power>100||s.duration!==0))errors.push('首领伤害能力超过本批数值范围');
  if(s.effectSpec?.kind==='status'&&(!['fear','dazzle'].includes(s.effectSpec.status)||s.effectSpec.power>magicStatuses[s.effectSpec.status]?.maximum||!Number.isSafeInteger(s.duration)||s.duration<1||s.duration>5))errors.push('首领控制只支持短时恐惧或眩光');
 }
 if(new Set(m.abilities?.map(x=>x.id)).size!==m.abilities?.length)errors.push('首领能力编号重复');
 return errors;
}
export function templateBossCounter(d,definition,actor,tactic,context={}){
 if(!definition?.mechanics)return null;const errors=validateBossMechanics(definition);if(errors.length)throw Error(errors.join('；'));
 const m=definition.mechanics,a=m.adaptation,seen=actor.battleMemory?.tactics?.[tactic]??0;
 if(!Number.isSafeInteger(seen)||seen<0)throw Error('首领战术次数损坏');
 const weakness=m.weaknesses.find(w=>w.tactic===tactic&&(w.requiresStatus!=='dazzle'||context.eyesClosed===false)&&Object.values(d.get('state','effects')??{}).some(e=>e.target===definition.id&&e.kind==='status'&&e.status===w.requiresStatus&&e.power>0&&e.remainingUses!==0&&e.expires>d.get('state','minute')));
 const steps=a.tactics.includes(tactic)&&!weakness?Math.max(0,seen-a.threshold+1):0;
 return{tactic,seen,adapted:steps>0,damageMultiplier:1-Math.min(a.maximum,steps*a.perStep),...(weakness?{weakness:weakness.requiresStatus}:{})};
}
// The combat caller consumes the returned damage through its usual protection path.
export function applyBossCounterAbility(d,engine,target,{eventId,attackIndex,hit,defense=0,remainingHp}){
 const path=actorPath(engine.world??{},target),actor=d.get(...path),definition=engine.byId.get(actor?.boss);
 if(!definition?.mechanics||!hit||actor.hp<=0)return null;
 const errors=validateBossMechanics(definition);if(errors.length)throw Error(errors.join('；'));
 if(!Number.isSafeInteger(attackIndex)||attackIndex<0||attackIndex>8||typeof eventId!=='string')throw Error('首领反击事件无效');
 if(actor.location!==d.get('state','location'))throw Error('首领反击目标不在场');
 const key=`boss_counter:${eventId}:${attackIndex}`;if(d.get('state','records',key))throw Error('首领反击事件重复');
 if(!Number.isSafeInteger(actor.abilityCounters??0)||(actor.abilityCounters??0)<0||!Number.isFinite(actor.maxHp)||actor.maxHp<=0)throw Error('首领能力计数或生命上限损坏');
 const hp=remainingHp??actor.hp;if(!Number.isFinite(hp)||hp<0||hp>actor.maxHp)throw Error('首领反击剩余生命无效');if(!hp)return null;
 const count=(actor.abilityCounters??0)+1;
 const ability=definition.mechanics.abilities.find(a=>count%a.every===0&&hp/actor.maxHp*100<=a.belowHpPercent);
 d.set([...path,'abilityCounters'],count);
 d.set(['state','records',key],{category:'boss_counter',boss:target,count,ability:ability?.id??null});
 if(!ability)return null;
 const s=ability.effectSpec;
 if(s.kind==='area')return{ability:ability.id,pendingArea:{catalog:areaCatalog(ability),id:`boss_ability:${eventId}:${attackIndex}`,source:target}};
 if(s.kind==='damage'){
  const p=d.get('state','player'),resistance=magicStatusStats(d,'player')[`${s.damageType}Resistance`]??0,v=resolveVitalityPrimitive({spec:s,hp:p.hp,maxHp:p.maxHp,defense,resistance});
  return{ability:ability.id,damage:v.rawAmount,damageType:s.damageType??'physical'};
 }
 const effect=`boss_ability:${eventId}:${attackIndex}`;
 return{ability:ability.id,...applyMagicStatus(d,{target:'player',status:s.status,power:s.power,source:target,duration:ability.duration},effect)};
}
