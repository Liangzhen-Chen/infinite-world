// Server-derived bounds, separate from authority/consent and primitive validation.
import {parseAccount} from './ledger.mjs';
import {reject} from './primitive-policy.mjs';
import {effectSignature,actorKnowledge} from './action-router.mjs';
import {actionReader} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';
import {heldUnit} from './items.mjs';
import {recordsWhere} from './storage.mjs';
import {itemTraits} from './traits.mjs';
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
 const effects=[],sources=[],trimmed=[],blocked=[],used=new Map(),dailyUsed=new Map(),nearestUsed=new Map(),usage=native.usage??{repeats:0,produced:0};
 finite(usage.repeats,'repeat count');finite(usage.produced,'daily usage');
 let minutes=0,difficulty=0;
 for(const [index,original] of proposal.effects.entries()){
  if(original.op==='create'&&original.kind!=='mark'&&!native.improvised?.(original)){
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
   const nearestKey=JSON.stringify([effect.op,field]),nearestBound=reward?native.nearestBounds?.[effect.op]?.[field]:undefined;
   if(nearestBound!==undefined)available=Math.min(available,Math.max(0,finite(nearestBound,'nearest reward')-(nearestUsed.get(nearestKey)??0)));
   if(reward&&source.dailyCap!==undefined)available=Math.min(available,Math.max(0,finite(source.dailyCap,'daily cap')-(usage.producedByKey?.[dailyKey]??usage.produced)-(dailyUsed.get(dailyKey)??0)));
   const amount=Math.min(Math.abs(effect[field]),available);
   used.set(key,(used.get(key)??0)+amount);effect[field]=Math.sign(effect[field])*amount;
   if(reward){dailyUsed.set(dailyKey,(dailyUsed.get(dailyKey)??0)+amount);nearestUsed.set(nearestKey,(nearestUsed.get(nearestKey)??0)+amount);}
   if(effect[field]!==before[field])trimmed.push({index,field,requested:before[field]??before.value,applied:effect[field],reason:'source_or_daily_bound'});
  }
  if(Object.entries(source.bounds??{}).some(([field])=>effect[field]===0))continue;
  effects.push(effect);
  sources.push(structuredClone(source));
  minutes=Math.max(minutes,finite(source.time,'action time'));
  difficulty=Math.max(difficulty,finite(source.difficulty??0,'difficulty'));
 }
 const nearest=native.nearestCost;
 if(nearest!==undefined)minutes=Math.max(minutes,finite(nearest,'nearest cost'));
 else if(effects.length){minutes=Math.ceil(minutes*1.5);difficulty+=2;}
 if(minutes>43200)reject('E-OPEN-DURATION','这项工程需要分阶段完成');
 return {effects,sources,trimmed,blocked,cost:{time:minutes},difficulty:difficulty+(context.modifier??0),context:{modifier:context.modifier??0,reason:context.reason??null}};
}

// Read only finalized receipts, using their actual recorded completion minute.
// A composition root persists openUsage on the same receipt as its effects;
// there is no parallel quota counter to drift on rollback or replay.
export function openUsage(document,signature,{actor='player'}={}){
 const now=document.state.minute,day=Math.floor(now/1440),key=JSON.stringify([...signature].sort()),producedByKey={};let repeats=0;
 for(const record of recordsWhere(document.state.records,'category','primitive_receipt')){
  const receipt=record.receipt,usage=receipt?.openUsage;
  if(receipt.status!=='committed'||receipt.actor!==actor||!usage||!Number.isSafeInteger(usage.minute)||usage.minute>now)continue;
  if(usage.minute>now-1440&&JSON.stringify([...usage.signature].sort())===key)repeats++;
  if(Math.floor(usage.minute/1440)===day)for(const [field,value] of Object.entries(usage.produced??{}))producedByKey[field]=(producedByKey[field]??0)+finite(value,'recorded production');
 }
 return {repeats,produced:0,producedByKey};
}

export function openUsageEntry(prepared,receipt,minute){
 const produced={},consumed=new Set();
 // Count the actual applied gain, including post-check and post-K2 clipping.
 // Scalar work is grouped by its native daily key, not by chosen source id.
 for(const [i,source] of (prepared.sources??[]).entries()){
  if(!source?.rewardFields?.length)continue;
  const effect=prepared.effects[i],index=receipt.applied?.findIndex((e,j)=>!consumed.has(j)&&e.op===effect?.op&&(e.target??e.entity??e.subject)===(effect.target??effect.entity??effect.subject)&&
   ['field','type','status','subject','learningSource'].every(key=>e[key]===effect[key])&&
   (effect.delta===undefined||Math.sign(e.delta)===Math.sign(effect.delta)));
  const applied=index>=0?receipt.applied[index]:null;
  if(!applied||applied.result?.applied===false||applied.result?.resisted)continue;
  consumed.add(index);
  for(const field of source.rewardFields){
  const actual=field==='amount'&&applied.result?.gain!==undefined?applied.result.gain:field==='delta'&&applied.result?.healed!==undefined?applied.result.healed:Math.abs(applied[field]??0);
  const key=source.dailyKey??JSON.stringify([effect.op,field]);produced[key]=(produced[key]??0)+finite(actual,'applied production');
  }
 }
 return {minute,signature:[...prepared.signature],produced};
}

// A native source resolver for the present world. It does not grant new spell
// kinds, theft, craft sources or arbitrary facts merely because a skill exists.
export function deriveOpenLimits(engine,document,proposal,nearest,{actor='player',routing}={}){
 const table=engine.world.openActionRules,caps=table?.sourceCaps,generic=table?.generic;
 if(!caps||!generic)reject('E-OPEN-DATA','缺少存档中的开放动作幅度表');
 const d=actionReader(document),s=document.state,body=actor==='player'?s.player:s.npcs?.[actor],knowledge=actorKnowledge(engine,document,actor);
 const bag=actor==='player'?s.inventory:s.npcs?.[actor]?.inventory;
 const skillRaw=id=>knowledge.skills?.[id],tier=id=>{
  const raw=skillRaw(id),value=typeof raw==='number'?raw:raw?.proficiency;
  return Number.isSafeInteger(value)&&value>=0&&value<2700?Math.floor(value/300):null;
 };
 const resolve=(value,kind)=>{if(typeof value!=='string')return null;try{return engine.resolve(value,kind);}catch{return null;}};
 const spellId=resolve(proposal.means?.spell,'spell'),spell=spellId&&knowledge.spells?.[spellId]?engine.byId.get(spellId):null;
 const skillId=resolve(proposal.means?.skill,'skill'),skill=skillId&&tier(skillId)!==null?engine.byId.get(skillId):null;
 const itemId=resolve(proposal.means?.item??proposal.means?.tools?.[0],'item'),item=itemId&&((typeof bag?.[itemId]==='number'?bag[itemId]:bag?.[itemId]?.quantity)??0)>0?engine.byId.get(itemId):null;
 let usableItem=null;
 if(item){
  const unit=heldUnit(d,engine,actor,itemId),grade=engine.rules.equipment.qualities.indexOf(unit.quality??item.quality),level=body?.level??1;
  if((unit.durability??item.durability??0)>0&&grade>=0&&level>=engine.rules.equipment.requiredLevels[grade])usableItem=item;
 }
 const cap=(family,stage)=>finite(caps[family]?.[stage],`${family} stage ${stage}`);
 const consumed=(proposal.effects??[]).filter(e=>e.op==='transfer'&&parseAccount(e.from).owner===actor&&parseAccount(e.to).owner==='sink:consume');
 const improvised=effect=>{
  if(effect.op!=='create'||effect.kind!=='item'||!['thing','core:item'].includes(effect.template)||effect.facts?.quality!=='crude'||!skill||!usableItem?.checkBonus?.skills?.includes(skill.id))return false;
  if((proposal.effects??[]).filter(e=>e.op==='create').length!==1||!Array.isArray(effect.materials)||!effect.materials.length||effect.materials.length>2)return false;
  const profession=engine.byId.get(skill.profession),primary=new Set(profession?.materials??[]);
  if(profession?.kind!=='life')return false;
  const primaryMaterial=item=>[item?.name,...item?.aliases??[]].some(name=>primary.has(name));
  const materials=effect.materials.map(row=>engine.byId.get(row.resource));
  // Work a material belonging to this craft; a second flexible material may
  // bind it. Food, money and arbitrary catalog objects are not raw stock.
  if(!materials.some(primaryMaterial)||materials.some(item=>!item||!primaryMaterial(item)&&!itemTraits(item).tags.some(tag=>['fiber','cloth','leather'].includes(tag))))return false;
  const totals=new Map();
  for(const material of effect.materials){
   if(!engine.world.items.some(row=>row.id===material.resource)||!Number.isSafeInteger(material.qty)||material.qty<1||material.qty>1||totals.has(material.resource))return false;
   totals.set(material.resource,material.qty);
  }
  return consumed.length===totals.size&&consumed.every(e=>totals.get(parseAccount(e.from).resource)===e.qty);
 };
 const sourceFor=effect=>{
  if(effect.op==='schedule'&&effect.action==='open:question'&&Number.isSafeInteger(effect.at)&&effect.at>s.minute){
   engine.primitiveValidateScheduledAction(d,{action:effect.action,slots:effect.args??{}},actor);
   return {id:`schedule:${actor}`,stage:0,time:generic.speechMinutes,bounds:{}};
  }
  if(improvised(effect))return {id:`improvised:${skill.id}`,stage:tier(skill.id),skill:skill.id,time:generic.improvisedMinutes,difficulty:generic.physicalDifficulty,bounds:{},improvised:true};
  if(effect.op==='create'&&effect.kind==='mark')return {id:`mark:${actor}`,stage:0,time:finite(engine.world.openActionRules?.mark?.minutes,'mark time'),bounds:{}};
  if(effect.op==='transfer'){
   const from=parseAccount(effect.from),allowed=from.owner===actor||authority({engine,document},actor,'transfer',effect.from,{effect}).allowed;
   return {id:`account:${effect.from}`,stage:0,time:generic.transferMinutes,bounds:{},transferAuthorized:allowed};
  }
  if(effect.op==='emit'&&['tell','request','claim'].includes(effect.verb))return {id:`speech:${actor}`,stage:0,time:generic.speechMinutes,bounds:{}};
  if(effect.op==='vital'&&effect.target===actor&&effect.type==='body:hydration'&&effect.delta>0&&consumed.length===1&&consumed[0].qty===1){
   const food=engine.byId.get(parseAccount(consumed[0].from).resource),gain=food?.nutrition?.hydration;
   if(Number.isSafeInteger(gain)&&gain>0)return {id:`drink:${food.id}`,stage:0,time:generic.transferMinutes,bounds:{delta:gain}};
  }
  const spec=spell?.effectSpec,stage=spell?tier(spell.skill):null;
  if(spell&&stage!==null&&stage>=spell.stage){
   const common={id:spell.id,stage,time:spell.minutes,difficulty:spell.difficulty??10,rangeMeters:spell.rangeMeters,requirements:{mp:spell.mp??0,materials:spell.materials??[]},skill:spell.skill};
   if(effect.op==='vital'&&(effect.delta<0&&spec.kind==='damage'&&effect.type===(spec.damageType??'physical')||effect.delta>0&&spec.kind==='heal'))return {...common,bounds:{delta:Math.min(Math.floor(spec.power),cap('vital',stage))},rewardFields:effect.delta>0?['delta']:[],dailyKey:'vital:heal'};
   if(effect.op==='status'&&spec.kind==='status'&&effect.status===spec.status)return {...common,bounds:{magnitude:Math.min(Math.floor(spec.power),cap('statusMagnitude',stage)),duration:Math.min(spell.duration,cap('statusDuration',stage))}};
  }
  if(effect.op==='vital'&&effect.delta<0&&(effect.type??'physical')==='physical'&&!spell){
   const weapon=usableItem?.tags?.includes('weapon'),strike=skill?.combatAction?.kind==='strike',stage=weapon?usableItem.stage??0:strike?tier(skill.id):0;
   return {id:weapon?usableItem.id:strike?skill.id:`body:${actor}`,stage,time:generic.physicalMinutes,difficulty:generic.physicalDifficulty,bounds:{delta:cap('vital',stage)},rangeMeters:1.5,...(strike?{skill:skill.id,requirements:{mp:skill.combatAction.mpCost??0,stamina:skill.combatAction.staminaCost??0}}:{})};
  }
  if(effect.op==='fact.set'){
   const row=document.holdings?.entities?.[effect.entity],rule=engine.world.primitiveFacts?.[row?.kind]?.[effect.field],old=row?.facts?.[effect.field],delta=effect.delta??(effect.value-old);
   if(rule?.type!=='number'||!Number.isSafeInteger(old)||!Number.isSafeInteger(delta)||delta>=0)return null;
   const carrier=document.holdings?.locations?.[effect.entity],contact=engine.primitiveTargetFacts({...d,document},actor,effect.entity);
   if(!(carrier?.mode==='carried'&&carrier.at===actor)&&!(contact?.lineOfSight===true&&contact.distanceMeters>=0&&contact.distanceMeters<=1.5))return null;
   const stage=usableItem?.tags?.includes('tool')?usableItem.stage??0:0;
   return {id:usableItem?.tags?.includes('tool')?usableItem.id:`body:${actor}`,stage,time:generic.physicalMinutes,difficulty:generic.physicalDifficulty,bounds:{delta:Math.min(cap('factWork',stage),old-rule.min)}};
  }
  // Learning, movement, repair, manufacture and rites keep their domain-owned
  // cost and source checks until their registered programs provide the adapter.
  return null;
 };
 const nearestAction=nearest&&engine.world.actionDefinitions?.actions?.find(a=>a.id===nearest.id),sameFamily=nearest?.signatureScore>0;
 // A duration slot is part of the registered program. Its default/picked
 // duration must remain a cost floor even when the proposal misses routing.
 const nearestCost=sameFamily&&(nearestAction?.durationSlot||Number.isSafeInteger(nearestAction?.cost?.time))?openDuration(nearestAction,nearest.slots):undefined;
 const nearestBounds={};
 if(sameFamily){
  const effects=Array.isArray(nearestAction?.outcomes)?nearestAction.outcomes:nearestAction?.outcomes?.success??[];
  for(const effect of effects)for(const field of ['delta','amount','magnitude','duration'])if(Number.isSafeInteger(effect[field])){
   nearestBounds[effect.op]??={};nearestBounds[effect.op][field]=(nearestBounds[effect.op][field]??0)+Math.abs(effect[field]);
  }
 }
 const signature=effectSignature(proposal.effects??[],routing??{});
 return {actor,sourceFor,improvised,currentValue:e=>document.holdings?.entities?.[e.entity]?.facts?.[e.field],accountBalance:key=>document.ledger?.accounts?.[key]??0,usage:openUsage(document,signature,{actor}),nearestBounds,...(nearestCost!==undefined?{nearestCost}:{})};
}
