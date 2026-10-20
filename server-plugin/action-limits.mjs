// Server-derived bounds, separate from authority/consent and primitive validation.
import {parseAccount} from './ledger.mjs';
import {reject} from './primitive-policy.mjs';
const finite=(value,label)=>{if(!Number.isSafeInteger(value)||value<0)reject('E-OPEN-BOUND',`Missing native ${label}`);return value;};
export function openDuration(definition,slots={}){
 const rule=definition.durationSlot;
 const duration=rule?slots[typeof rule==='string'?rule:rule.slot??rule.name]:definition.cost?.time;
 if(!Number.isSafeInteger(duration)||duration<0||duration>43200||rule&&(duration<(rule.min??1)||duration>(rule.max??43200)))reject('E-OPEN-DURATION','时长须在此动作允许的范围内');
 return duration;
}
export function limitOpenEffects(proposal,native){
 const {actor,sourceFor,currentValue,accountBalance}=native;
 if(!actor||typeof sourceFor!=='function')reject('E-OPEN-BOUND','Native source resolution is required');
 if(!Array.isArray(proposal.effects)||!proposal.effects.length||proposal.effects.length>63)reject('E-OPEN-EFFECTS','开放提案须有 1 至 63 项效果');
 if(proposal.time!==undefined||proposal.cost!==undefined||proposal.effects.some(e=>e.op==='time'))reject('E-OPEN-TIME','耗时由动作派生，不能由提案指定');
 const context=proposal.context??{};
 if(!Number.isSafeInteger(context.modifier??0)||Math.abs(context.modifier??0)>5||context.modifier&&!String(context.reason??'').trim())reject('E-OPEN-CONTEXT','情境修正须在 ±5 内并说明理由');
 const effects=[],trimmed=[],blocked=[],used=new Map(),dailyUsed=new Map(),usage=native.usage??{repeats:0,produced:0};
 finite(usage.repeats,'repeat count');finite(usage.produced,'daily usage');
 let minutes=0,difficulty=0;
 for(const [index,original] of proposal.effects.entries()){
  if(original.op==='create'){
   blocked.push({index,reason:'计量制造须使用已有配方；没有配方可留下无价值的痕迹',alternative:'recipe_or_mark'});continue;
  }
  const source=sourceFor(original,index);
  if(!source){blocked.push({index,reason:'当前手段不能产生这种效果',alternative:'mark'});continue;}
  if(typeof source.id!=='string'||!source.id)reject('E-OPEN-BOUND','Native source identity is required');
  if(finite(source.stage,'source stage')>8)reject('E-OPEN-BOUND','Source stage exceeds core bounds');
  // Item stage is a native property of the item, never the user's skill tier.
  // Native source resolution supplies per-op/field caps from that stage's table.
  let effect=structuredClone(original);const before=structuredClone(effect);
  const numeric={vital:['delta'],status:['duration','magnitude'],'fact.set':[effect.value!==undefined?'value':'delta'],learn:['amount']}[effect.op]??[];
  for(const field of numeric){const boundField=field==='value'?'delta':field;if(typeof effect[field]==='number'&&source.bounds?.[boundField]===undefined)reject('E-OPEN-BOUND',`Missing native bound: ${effect.op}.${boundField}`);}
  if(effect.op==='transfer'){
   const from=parseAccount(effect.from),to=parseAccount(effect.to);
   if(from.owner.startsWith('src:')||from.owner.startsWith('sink:')||to.owner.startsWith('src:')||from.resource!==to.resource)reject('E-OPEN-TRANSFER','不能创造资源或跨资源转移');
   if(from.owner!==actor&&!source.transferAuthorized)reject('E-OPEN-TRANSFER','他人账户须经同意、合法授权或注册盗窃动作');
   // Balance is checked by the transaction; do not silently turn an unaffordable
   // deterministic payment into a smaller payment.
   if(typeof accountBalance==='function'&&effect.qty>accountBalance(effect.from))reject('E-TRANSFER-BALANCE','账户余额不足');
  }
  if(effect.op==='fact.set'&&effect.value!==undefined&&typeof effect.value==='number'){
   const old=currentValue?.(effect);if(!Number.isSafeInteger(old))reject('E-OPEN-BOUND','Fact work requires the current native value');
   effect={...effect,delta:effect.value-old};delete effect.value;
  }
  for(const [field,bound] of Object.entries(source.bounds??{})){
   if(effect[field]===undefined)continue;
   if(!Number.isSafeInteger(effect[field]))reject('E-OPEN-BOUND',`Invalid numeric effect: ${field}`);
   let maximum=finite(bound,`${effect.op}.${field}`);
   const key=JSON.stringify([source.id,effect.op,source.budgetKey??effect.field??effect.type??effect.status??'',field]);
   const reward=source.rewardFields?.includes(field),dailyKey=source.dailyKey??JSON.stringify([effect.op,field]);
   if(reward){
    maximum=Math.min(maximum,Math.floor(maximum*2**-usage.repeats));
    const nearest=native.nearestBounds?.[effect.op]?.[field];if(nearest!==undefined)maximum=Math.min(maximum,finite(nearest,'nearest reward'));
   }
   let available=Math.max(0,maximum-(used.get(key)??0));
   if(reward&&source.dailyCap!==undefined)available=Math.min(available,Math.max(0,finite(source.dailyCap,'daily cap')-usage.produced-(dailyUsed.get(dailyKey)??0)));
   const amount=Math.min(Math.abs(effect[field]),available);
   used.set(key,(used.get(key)??0)+amount);effect[field]=Math.sign(effect[field])*amount;
   if(reward)dailyUsed.set(dailyKey,(dailyUsed.get(dailyKey)??0)+amount);
   if(effect[field]!==before[field])trimmed.push({index,field,requested:before[field]??before.value,applied:effect[field],reason:'source_or_daily_bound'});
  }
  if(Object.entries(source.bounds??{}).some(([field])=>effect[field]===0))continue;
  effects.push(effect);
  minutes=Math.max(minutes,finite(source.time,'action time'));
  difficulty=Math.max(difficulty,finite(source.difficulty??0,'difficulty'));
 }
 const nearest=native.nearestCost;
 if(nearest!==undefined)minutes=Math.max(minutes,finite(nearest,'nearest cost'));
 else if(effects.length){minutes=Math.ceil(minutes*1.5);difficulty+=2;}
 if(minutes>43200)reject('E-OPEN-DURATION','这项工程需要分阶段完成');
 return {effects,trimmed,blocked,cost:{time:minutes},difficulty:difficulty+(context.modifier??0),context:{modifier:context.modifier??0,reason:context.reason??null}};
}
