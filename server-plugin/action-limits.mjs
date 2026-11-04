// Server-derived bounds, separate from authority/consent and primitive validation.
import {parseAccount} from './ledger.mjs';
import {reject} from './primitive-policy.mjs';
import {effectSignature,actorKnowledge} from './action-router.mjs';
import {actionReader} from './action-capacity.mjs';
import {authority,currentControllers} from './action-authority.mjs';
import {heldUnit} from './items.mjs';
import {recordsWhere} from './storage.mjs';
import {itemTraits,traitsOf} from './traits.mjs';
import {aliveHoldings} from './holdings.mjs';
import {consent} from './action-consent.mjs';

// Existing material vocabulary -> resistance points, not durability or value.
// Unknown materials remain unknown; never infer hardness from a name.
const MATERIAL_RESISTANCE=Object.freeze({paper:0,cloth:0,fiber:0,leather:1,earth:1,wood:2,bone:2,ceramic:3,stone:4,metal:5});
// Same boundaries as standingWords: deeper hostility adds more resistance.
const STANCE_RESISTANCE=Object.freeze([{max:-60,bonus:4},{max:-30,bonus:3},{max:-10,bonus:2},{max:9,bonus:1},{max:100,bonus:0}].map(Object.freeze));
// Current owners of an entity: owns holdings (incl. herds), then native
// owner facts; a creature's or a registered unit's owner field is the same title.
export function propertyOwners(context,subject){
 const owners=currentControllers(context,subject,{ownerOnly:true,principals:true});
 const s=context.document.state,row=s.creatures?.[subject]??s.itemInstances?.[subject];
 return owners.length?owners:typeof row?.owner==='string'?[row.owner]:[];
}
const nameOf=(engine,s,id)=>id==='player'?'你':s.npcs?.[id]?.name??engine.byId.get(id)?.name??id;
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

function validateOpenDifficultyInput(proposal){
 // These are server facts, including when nested in means or an effect.
 const forbidden=['resistance','hardness','upperLimit','limit','bounds','sourceCaps','maximum','difficulty','derivedDifficulty','difficultyBreakdown'];
 for(const row of [proposal,proposal?.means,proposal?.context,...proposal?.effects??[]])if(row&&forbidden.some(key=>Object.hasOwn(row,key)))reject('E-OPEN-BOUND','抗性、上限和难度由服务器派生，提案不能自报');
}

function targetDifficulty(engine,document,effect,actor){
 const s=document.state,id=effect.target??effect.entity??effect.subject,base=engine.byId.get(id),entity=document.holdings?.entities?.[id],npc=s.npcs?.[id];
 const kind=id===actor?'self':npc?'person':s.creatures?.[id]?'creature':entity?.kind??(base?.tags?'item':'unknown');
 const parts=[],missing=label=>parts.push({kind:label,bonus:null,reason:`${label}：该类抗性无数据`});
 const add=(kind,value,bonus,reason)=>parts.push({kind,value,bonus,reason});
 if(kind==='self')add('self',id,0,'作用于自身，无外部目标抗性');
 else if(npc){
  const attributes={...base?.attributes,...npc.attributes},scores=['智力','精神'].map(key=>attributes[key]).filter(Number.isSafeInteger);
  const intelligence=npc.intelligence?.level??base?.intelligence?.level??(Number.isSafeInteger(base?.intelligence)?base.intelligence:undefined);
  if(scores.length||Number.isSafeInteger(intelligence)){
   const bonus=Math.max(0,...scores.map(score=>Math.floor((score-10)/2)),Number.isSafeInteger(intelligence)?intelligence:0);
   add('mind',{attributes:Object.fromEntries(['智力','精神'].filter(k=>Number.isSafeInteger(attributes[k])).map(k=>[k,attributes[k]])),intelligence},bonus,'灵智/意志取现有属性修正与灵智等级中较高者');
  }else missing('NPC灵智/意志');
  const relation=npc.relationships?.[actor],authored=base?.relationships?.find?.(row=>row.with===actor);
  if(relation?.trust!==undefined||actor==='player'&&npc.trust!==undefined||authored?.trust!==undefined||s.records?.[`standing:${id}:${actor}`]){
   const value=engine.readStanding(s,id,actor);add('stance',value,STANCE_RESISTANCE.find(row=>value<=row.max).bonus,'立场≤-60/-30/-10/9/100分别加4/3/2/1/0');
  }else missing('NPC立场');
  const offices=aliveHoldings(actionReader(document),{kind:'holds_office',holder:id}).map(h=>document.holdings.entities[h.subject]).filter(row=>row?.facts?.authority?.operations?.some(op=>['arrest','detain','enforce','guard'].includes(op)));
  const edges=engine.world.routes??[],checkpoints=engine.rules.smuggling?.checkpoints??[];
  const posts=[...edges.filter(row=>row.guards?.includes(id)).map(row=>row.to),...checkpoints.filter(row=>row.guards?.includes(id)).map(row=>row.location)].filter(Boolean);
  const guard=posts.length>0||(engine.rules.law?.polities??[]).some(row=>row.guards?.includes(id))||offices.length>0;
  if(guard){
   const alertness=npc.mental?.alertness;
   if(Number.isSafeInteger(alertness))add('alertness',alertness,Math.max(0,Math.ceil(alertness/25)),'守卫当前警觉每25点加1');else missing('守卫警觉');
   const duty=offices.map(row=>row.facts.onDuty).filter(value=>typeof value==='boolean');
   // Checkpoint enforcement already uses location + awake/travel state. Read
   // those same facts when no office has an explicit onDuty override.
   if(!duty.length&&posts.length&&typeof npc.location==='string')duty.push(posts.includes(npc.location)&&!npc.scheduleTravel&&!npc.cognitionTravel&&!/睡|昏|濒死|死亡/.test(`${npc.activity??''} ${npc.status??''}`));
   if(duty.length)add('onDuty',duty.some(Boolean),duty.some(Boolean)?2:0,'守卫职责当前在岗加2，离岗加0');else missing('守卫在岗');
  }
 }else if(['item','building','feature','facility'].includes(kind)){
  const material=entity?.facts?.material??s.buildings?.[id]?.material??base?.material;
  const tags=material?[{iron:'metal',copper:'metal',bronze:'metal',clay:'earth',hemp:'fiber'}[material]??material]:traitsOf(engine,document,id)?.tags??itemTraits(base).tags;
  const known=tags.filter(tag=>Object.hasOwn(MATERIAL_RESISTANCE,tag));
  if(known.length)add('material',known,Math.max(...known.map(tag=>MATERIAL_RESISTANCE[tag])),'材质硬度：纸/布/纤维0，皮/土1，木/骨2，陶3，石4，金属5');else missing('物件材质硬度');
 }else missing(`${kind}目标`);
 // Base belongs to the primitive family and target class, never player level.
 const physical=engine.world.openActionRules.generic.physicalDifficulty;
 const bases={vital:{self:physical,person:physical,creature:physical},status:{self:physical,person:physical,creature:physical},'fact.set':{item:physical,building:physical,feature:physical},create:{item:physical}};
 const scope=effect.op==='status'?(['fear','illusion','compulsion'].includes(effect.status)?'mind':'support_magic'):effect.op==='vital'&&effect.delta>0?'healing':null;
 const opposed=Boolean(npc&&id!==actor&&scope&&!consent({engine,document},id,actor,scope,{purpose:'open:proposal',until:s.minute+(effect.op==='status'?effect.duration:0)}).allowed);
 return {target:id??null,targetKind:kind,base:bases[effect.op]?.[kind]??(['vital','status','fact.set'].includes(effect.op)?physical:0),parts:opposed?parts.map(p=>({...p,counted:false,reason:`${p.reason}；沿用对抗的对手属性/技能与适应，不再计入固定抗性`})):parts,...(opposed?{opposed:true,scope}:{})};
}

// What a disposing effect acts on: the thing itself, a creature's body, the
// subject of a holding, or the herd whose stock is debited.
function disposedSubject(document,effect){
 const s=document.state;
 if(['destroy','fact.set'].includes(effect.op))return effect.entity;
 if(effect.op==='move')return ['drop','place'].includes(effect.mode)?effect.entity:null;
 if(effect.op==='vital')return effect.delta<0&&s.creatures?.[effect.target]?effect.target:null;
 if(['holding.close','holding.transfer'].includes(effect.op))return document.holdings?.rows?.[effect.holding??effect.id]?.subject??null;
 if(effect.op==='transfer'&&typeof effect.from==='string'&&effect.from.includes('|')){
  // A malformed key is left to the account validator downstream.
  let owner;try{owner=parseAccount(effect.from).owner;}catch{return null;}
  // Only a herd's stock is disposed of as property here; other entity
  // accounts (wells, shops, treasuries) keep their own transfer authority.
  return document.holdings?.entities?.[owner]?.kind==='population'?owner:null;
 }
 return null;
}
const DISPOSING_OP={vital:'destroy',transfer:'transfer'};
// Owner's power of disposition (K7). Returns true when the actor owns what the
// effect disposes of; refuses someone else's property as theirs (not as an
// unsupported effect) unless a real authority source covers it; otherwise null.
export function refuseOthersProperty(engine,document,effect,actor){
 const subject=disposedSubject(document,effect);
 if(typeof subject!=='string'||subject===actor)return null;
 // A catalogue id names the actor's own carried stack of that thing.
 if(effect.op!=='transfer'&&!document.state.itemInstances?.[subject]&&engine.quantity(actionReader(document),actor,subject)>0)return true;
 const owners=propertyOwners({engine,document},subject);
 if(owners.includes(actor))return true;
 if(!owners.length)return null;
 const holding=document.holdings?.rows?.[effect.holding??effect.id];
 if(authority({engine,document},actor,DISPOSING_OP[effect.op]??effect.op,effect.op==='transfer'?effect.from:subject,{holding,effect}).allowed)return null;
 reject('E-AUTHORITY',`那是${owners.map(id=>nameOf(engine,document.state,id)).join('、')}的，你没有处分别人东西的权利`);
}

// Read-only source query for "inspect before proposing". This calls the same
// resolver as execution; neither callers nor previews duplicate cap formulas.
export function deriveOpenSourceLimits(engine,document,proposal,effect,{actor='player'}={}){
 const source=deriveOpenLimits(engine,document,proposal,null,{actor,inspect:true}).sourceFor(effect);
 return source?freeze(structuredClone(source)):null;
}
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
 const effects=[],sources=[],trimmed=[],blocked=[],details=[],used=new Map(),dailyUsed=new Map(),nearestUsed=new Map(),usage=native.usage??{repeats:0,produced:0};
 finite(usage.repeats,'repeat count');finite(usage.produced,'daily usage');
 let minutes=0,difficulty=0;
 for(const [index,original] of proposal.effects.entries()){
  if(original.op==='create'&&original.kind!=='mark'&&!native.improvised?.(original)&&!native.individuated?.(original)){
   blocked.push({index,reason:'计量制造须使用已有配方；没有配方可留下无价值的痕迹',alternative:'recipe_or_mark'});continue;
  }
  const source=sourceFor(original,index);
  if(!source){blocked.push({index,reason:'当前手段不能产生这种效果',alternative:'mark'});continue;}
  // Missing sources already prevent submission. Keep the existing repair flow
  // for a target that left the scene; validate claims at the actual consumer.
  if(!sources.length)validateOpenDifficultyInput(proposal);
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
  const zero=Object.entries(source.bounds??{}).find(([field,bound])=>effect[field]!==undefined&&bound===0);
  if(zero){blocked.push({index,field:zero[0],reason:'来源上限为0，不能产生此效果'});continue;}
  const amplitudes=[];
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
   if(maximum===0){blocked.push({index,field,reason:'当前可用上限为0，不能产生此效果'});break;}
   let available=Math.max(0,maximum-(used.get(key)??0));
   const nearestKey=JSON.stringify([effect.op,field]),nearestBound=reward?native.nearestBounds?.[effect.op]?.[field]:undefined;
   if(nearestBound!==undefined)available=Math.min(available,Math.max(0,finite(nearestBound,'nearest reward')-(nearestUsed.get(nearestKey)??0)));
   if(reward&&source.dailyCap!==undefined)available=Math.min(available,Math.max(0,finite(source.dailyCap,'daily cap')-(usage.producedByKey?.[dailyKey]??usage.produced)-(dailyUsed.get(dailyKey)??0)));
   const amount=Math.min(Math.abs(effect[field]),available);
   const ratio=amount/maximum;
   amplitudes.push({field,requested:Math.abs(effect[field]),applied:amount,limit:maximum,ratio,bonus:ratio<=.25?0:ratio<=.5?1:ratio<=.75?2:3,reason:'裁剪后幅度/来源上限：≤1/4加0，≤1/2加1，≤3/4加2，≤1加3'});
   used.set(key,(used.get(key)??0)+amount);effect[field]=Math.sign(effect[field])*amount;
   if(reward){dailyUsed.set(dailyKey,(dailyUsed.get(dailyKey)??0)+amount);nearestUsed.set(nearestKey,(nearestUsed.get(nearestKey)??0)+amount);}
   if(effect[field]!==before[field])trimmed.push({index,field,requested:before[field]??before.value,applied:effect[field],reason:'source_or_daily_bound'});
  }
  if(blocked.some(row=>row.index===index))continue;
  if(Object.entries(source.bounds??{}).some(([field])=>effect[field]===0))continue;
  effects.push(effect);
  sources.push(structuredClone(source));
  minutes=Math.max(minutes,finite(source.time,'action time'));
  const target=native.targetDifficulty?.(effect)??{target:effect.target??effect.entity??null,targetKind:'unknown',base:finite(source.difficulty??0,'difficulty'),parts:[{kind:'unknown',bonus:null,reason:'目标抗性：该类抗性无数据'}]};
  const resistance=target.opposed?0:target.parts.reduce((sum,row)=>sum+(row.bonus??0),0),amplitude=Math.max(0,...amplitudes.map(row=>row.bonus)),total=target.base+resistance+amplitude;
  details.push({index,op:effect.op,...target,resistance,amplitudes,amplitude,total,reason:'基础(原语族×目标类)+目标抗性+幅度比；多效果取最大难度'});
  difficulty=Math.max(difficulty,total);
 }
 const nearest=native.nearestCost;
 if(nearest!==undefined)minutes=Math.max(minutes,finite(nearest,'nearest cost'));
 else if(effects.length){minutes=Math.ceil(minutes*1.5);difficulty+=2;}
 if(minutes>43200)reject('E-OPEN-DURATION','这项工程需要分阶段完成');
 return {effects,sources,trimmed,blocked,cost:{time:minutes},difficulty:difficulty+(context.modifier??0),difficultyBreakdown:{effects:details,nearest:{bonus:nearest===undefined&&effects.length?2:0,reason:nearest===undefined?'无可比近邻，通用难度+2':'保留近邻耗时下限'},world:difficulty,context:{modifier:context.modifier??0,reason:context.reason??null}},context:{modifier:context.modifier??0,reason:context.reason??null}};
}

// Read only finalized receipts, using their actual recorded completion minute.
// The composition root keeps a per-actor rolling usage record in the same
// transaction as each committed receipt (so rollback and replay cannot drift);
// reads touch that window, not every primitive receipt ever written.
export const openUsageKey=actor=>`open_usage:${actor}`;
export function openUsageEntries(document,actor='player'){
 const rows=[];
 for(const record of recordsWhere(document.state.records,'category','primitive_receipt')){
  const receipt=record.receipt,usage=receipt?.openUsage;
  if(receipt.status!=='committed'||receipt.actor!==actor||!usage||!Number.isSafeInteger(usage.minute))continue;
  rows.push({eventId:receipt.eventId,...usage});
 }
 return rows;
}
export function openUsage(document,signature,{actor='player'}={}){
 const now=document.state.minute,day=Math.floor(now/1440),key=JSON.stringify([...signature].sort()),producedByKey={};let repeats=0;
 const rolling=document.state.records?.[openUsageKey(actor)];
 for(const usage of rolling?.category==='open_usage'?rolling.entries:openUsageEntries(document,actor)){
  if(!Number.isSafeInteger(usage.minute)||usage.minute>now)continue;
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
export function deriveOpenLimits(engine,document,proposal,nearest,{actor='player',routing,inspect=false}={}){
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
 // Leading head out of one's own herd: transfer(herd → sink:individuated)
 // paired with create(creature) of that species, never more than were led out.
 const herdOf=effect=>{
  if(effect.op!=='transfer'||typeof effect.to!=='string'||!effect.to.startsWith('sink:individuated|')||typeof effect.from!=='string')return null;
  const owner=parseAccount(effect.from).owner,row=s.records?.[`husbandry:${owner}`];
  return row&&propertyOwners({engine,document},owner).includes(actor)?row:null;
 };
 const individuated=effect=>{
  if(effect.op!=='create'||effect.kind!=='creature')return false;
  const led=(proposal.effects??[]).filter(e=>herdOf(e)?.species===effect.template).reduce((n,e)=>n+(Number.isSafeInteger(e.qty)?e.qty:0),0);
  return led>0&&(proposal.effects??[]).filter(e=>e.op==='create'&&e.kind==='creature'&&e.template===effect.template).length<=led;
 };
 const nativeSource=effect=>{
  if(individuated(effect))return {id:`herd:${actor}:${effect.template}`,stage:0,time:generic.transferMinutes,bounds:{}};
  if(effect.op==='schedule'&&effect.action==='open:question'&&Number.isSafeInteger(effect.at)&&effect.at>s.minute){
   engine.primitiveValidateScheduledAction(d,{action:effect.action,slots:effect.args??{}},actor);
   return {id:`schedule:${actor}`,stage:0,time:generic.speechMinutes,bounds:{}};
  }
  if(improvised(effect))return {id:`improvised:${skill.id}`,stage:tier(skill.id),skill:skill.id,time:generic.improvisedMinutes,difficulty:generic.physicalDifficulty,bounds:{},improvised:true};
  if(effect.op==='create'&&effect.kind==='mark')return {id:`mark:${actor}`,stage:0,time:finite(engine.world.openActionRules?.mark?.minutes,'mark time'),bounds:{}};
  // Placing a carried object is not travel or manufacture. The primitive
  // rechecks ownership, carriage and the local destination at execution.
  if(effect.op==='move'&&effect.mode==='place'&&document.holdings?.entities?.[effect.entity]?.kind==='item'){
   const at=document.holdings.locations?.[effect.entity],location=actor==='player'?s.location:s.npcs?.[actor]?.location;
   if(at?.mode==='carried'&&at.at===actor&&effect.to===location)return {id:`place:${actor}`,stage:0,time:generic.transferMinutes,bounds:{}};
  }
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
 // Owner's power of disposition (K7): the owner may destroy, abandon or hand
 // over a thing or herd by default (killing uses the ordinary vital source).
 const disposition=effect=>{
  // A read-only inspection lists the means; the authority refusal is shown
  // by the card's own permission check, and submission refuses it as theirs.
  let own=null;
  try{own=refuseOthersProperty(engine,document,effect,actor);}catch(error){if(!inspect||error?.code!=='E-AUTHORITY')throw error;}
  if(!own)return null;
  if(['vital','fact.set','transfer'].includes(effect.op)||effect.op==='move'&&effect.mode==='place')return null;
  return {id:`owner:${actor}`,stage:0,time:effect.op.startsWith('holding.')||effect.op==='move'?generic.transferMinutes:generic.physicalMinutes,difficulty:0,bounds:{}};
 };
 const sourceFor=effect=>disposition(effect)??nativeSource(effect);
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
 return {actor,sourceFor,improvised,individuated,targetDifficulty:effect=>targetDifficulty(engine,document,effect,actor),currentValue:e=>document.holdings?.entities?.[e.entity]?.facts?.[e.field],accountBalance:key=>document.ledger?.accounts?.[key]??0,usage:openUsage(document,signature,{actor}),nearestBounds,...(nearestCost!==undefined?{nearestCost}:{})};
}
