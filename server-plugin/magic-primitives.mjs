// Shared numerical handlers; callers own targeting, consent, costs and death effects.
export const damageTypes=Object.freeze(['physical','fire','cold','wind','earth','light','shadow','mind']);
const fields={damage:['damageType','armorFactor'],heal:[],repair:[],dry:[],status:['status'],light:[],environment:['operation','unit'],summon:['summonType','upkeepMp','upkeepMinutes'],protection:['damageTypes','stacking'],object:['operation','limitC']};
export function validateEffectSpec(spec){
 const errors=[];
 if(!spec||typeof spec!=='object'||Array.isArray(spec))return ['法术效果必须是规则对象'];
 if(!Object.hasOwn(fields,spec.kind))return ['此法术效果类型尚未接入规则，不能叙述已实现'];
 const keys=new Set(['kind','power',...fields[spec.kind]]);
 for(const key of Object.keys(spec))if(!keys.has(key))errors.push(`法术效果含未实现参数:${key}`);
 if(!Number.isSafeInteger(spec.power)||spec.power<1||spec.power>5000)errors.push('法术规则强度非法');
 if(spec.damageType!==undefined&&!damageTypes.includes(spec.damageType))errors.push('伤害门类不在规则表');
 if(spec.armorFactor!==undefined&&(!Number.isFinite(spec.armorFactor)||spec.armorFactor<0||spec.armorFactor>1))errors.push('护甲系数须在0至1之间');
 if(spec.kind==='protection'){
  if(!Array.isArray(spec.damageTypes)||!spec.damageTypes.length||new Set(spec.damageTypes).size!==spec.damageTypes.length||spec.damageTypes.some(x=>!damageTypes.includes(x)))errors.push('防护须列出不重复的有效伤害门类');
  if(spec.stacking!=='strongest')errors.push('防护只支持单次伤害取最强吸收层');
 }
 return errors;
}
const finite=(value,min,max,name)=>{if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${name}超出有效范围`);return value;};
export function resolveVitalityPrimitive({spec,hp,maxHp,defense=0,resistance=0,multiplier=1}){
 const errors=validateEffectSpec(spec);if(errors.length)throw new Error(errors.join('；'));
 if(!['damage','heal'].includes(spec.kind))throw new Error('此处理器只接受伤害或治疗');
 finite(maxHp,1,Number.MAX_SAFE_INTEGER,'生命上限');finite(hp,0,maxHp,'当前生命');finite(defense,0,Number.MAX_SAFE_INTEGER,'防御');finite(resistance,0,1,'抗性');finite(multiplier,0,1,'适应伤害系数');
 const amount=spec.kind==='heal'?spec.power:Math.max(1,Math.round((spec.power-defense*(spec.armorFactor??0.25))*(1-resistance)*multiplier));
 const nextHp=Math.max(0,Math.min(maxHp,hp+(spec.kind==='heal'?amount:-amount)));
 return {amount:Math.abs(nextHp-hp),rawAmount:amount,nextHp,delta:nextHp-hp};
}
export function applyProtectionPrimitive(d,{spec,target,spell,duration},eventId){
 const errors=validateEffectSpec(spec);if(spec.kind!=='protection')errors.push('此处理器只接受防护');if(errors.length)throw new Error(errors.join('；'));
 if(!Number.isSafeInteger(duration)||duration<1||duration>43200)throw new Error('防护持续时间非法');
 if(d.get('state','effects',eventId))throw new Error('效果编号已存在，拒绝重复创建防护');
 const expires=d.get('state','minute')+duration;
 d.set(['state','effects',eventId],{kind:'protection',spell,target,power:spec.power,remaining:spec.power,damageTypes:[...spec.damageTypes],stacking:'strongest',expires,source:eventId});
 return {target,effect:eventId,expires,absorption:spec.power,damageTypes:[...spec.damageTypes]};
}
// One strongest applicable layer per hit. Smaller layers never stack onto it.
// Stable ordering makes ties and replay independent of object insertion order.
export function consumeMagicProtection(d,target,amount,damageType='physical'){
 if(!Number.isSafeInteger(amount)||amount<0)throw new Error('待吸收伤害必须是非负整数');
 if(!damageTypes.includes(damageType))throw new Error('待吸收伤害门类未知');
 const now=d.get('state','minute'),available=[];
 for(const [id,e] of Object.entries(d.get('state','effects')??{})){
  if(e.kind!=='protection'||e.target!==target||e.expires<=now)continue;
  const errors=validateEffectSpec({kind:'protection',power:e.power,damageTypes:e.damageTypes,stacking:e.stacking});
  if(errors.length||!Number.isSafeInteger(e.expires)||!Number.isSafeInteger(e.remaining)||e.remaining<0||e.remaining>e.power)throw new Error('防护记录损坏，拒绝错误抵扣');
  if(e.remaining>0&&e.damageTypes.includes(damageType))available.push({...e,id});
 }
 available.sort((a,b)=>b.remaining-a.remaining||a.expires-b.expires||a.id.localeCompare(b.id));
 const shield=available[0];if(!shield||amount===0)return {damage:amount,absorbed:0};
 const absorbed=Math.min(amount,shield.remaining),remaining=shield.remaining-absorbed;
 d.set(['state','effects',shield.id,'remaining'],remaining);
 return {damage:amount-absorbed,absorbed,effect:shield.id,remaining};
}
