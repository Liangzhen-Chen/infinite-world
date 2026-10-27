import {registerEffect,effectConsumer} from './effect-registry.mjs';
export {EFFECT_SOURCES,registerEffect,effectKinds,effectConsumer} from './effect-registry.mjs';
import {damageFacilities} from './facilities.mjs';
import {allFacilities,within} from './facility-state.mjs';
import {isReputationSettlement}from'./reputation-registry.mjs';
import {isPhysicallyDead}from'./holdings.mjs';
// K6 unified effect table. World clocks, faction clocks, festivals and the
// seasonal table all validate and apply stage effects here. A system adds an
// effect kind with registerEffect(kind,{sources,validate,apply}); rules data in
// world/ then names the kind. `sources` limits which callers may use a kind
// (world, faction, festival, season); omitted means every source.
//
// Each apply(d,engine,effect,context) returns {applied:boolean,...}. A refused
// effect is rolled back by clockTransaction together with its stage costs.
import {regionalTradePrice} from './settlement-trade.mjs';
import {toRational} from './det-math.mjs';
import {assertWildlifeAwakeningEffect,applyWildlifeAwakeningEffect} from './wildlife.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';
import {adjustStanding,standingKind} from './standing.mjs';
import {applyInteraction} from './interactions.mjs';
import {environmentFeatures} from './environment.mjs';
import {readObjectState,storeObjectState} from './magic-object.mjs';
import {applyPatches} from './storage.mjs';
import {nativePrimitiveTransaction} from './native-primitives.mjs';
import {traitsOf} from './traits.mjs';
import {declareHoldingWriter,holdingSet,holdingRemove} from './holdings.mjs';
// 事务回放是别的模块写入的转运：可落到任何持有种类。
declareHoldingWriter('effects',{kinds:['*'],entities:['*'],locations:true});

const DAY=1440,int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
export function assertEffect(engine,effect,source='world'){
 const consumer=effectConsumer(engine,effect?.kind,source);
 if(!consumer)throw Error('世界时钟未知效果或缺少贸易消费者，拒绝推进');
 if(typeof consumer.validate!=='function'||typeof consumer.apply!=='function')throw Error(`势力效果消费者未实现：${effect.kind}`);
 return consumer.validate(engine,effect);
}
export function applyEffect(d,engine,effect,context,source='world'){
 assertEffect(engine,effect,source);

 const out=effectTransaction(d,engine,[effect],context,source);
 return out.applied?out.results[0]:out.result;
}
function effectTransaction(d,engine,effects,context,source='world'){
 return nativePrimitiveTransaction(d,{engine,family:`k6:${source}`,sourceEvent:context.sourceEvent,actor:context.faction??'player',program:{effects,context},
  primitives:effects.map(effect=>({op:'emit',verb:'effect_applied',visibility:'private',payload:effect})),
  apply(tx,index){const effect=effects[index];assertEffect(engine,effect,source);const result=effectConsumer(engine,effect.kind,source).apply(tx,engine,effect,context);if(!result||typeof result.applied!=='boolean')throw Error(`效果缺少 applied 回执：${effect.kind}`);return result;}});
}
// A refused effect cannot leave costs or partial identity changes in the draft.
export function clockTransaction(d,apply){
 // Nested native programs must share this transaction's cursor, without
 // advancing the parent's cursor until the whole clock stage commits.
 const scheduler=d.scheduler?Object.assign(Object.create(Object.getPrototypeOf(d.scheduler)),d.scheduler):null;
 const tx={document:d.document,scheduler,patches:[],messages:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){const patch={op:'set',path,value};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},
  remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(content){this.messages.push(content);}};
 const result=apply(tx);if(result?.applied===false)return result;
 // S2a: 回放经持有写入包装，事务里改到的会籍、职位等在正式草稿上双写。
 for(const p of tx.patches)if(p.op==='set')holdingSet(d,null,p.path,p.value,'effects');else holdingRemove(d,null,p.path,'effects');
 if(scheduler)d.scheduler.seq=Math.max(d.scheduler.seq,scheduler.seq);
 for(const message of tx.messages)d.say(message);
 return result;
}
// Runs a list of effects as one transaction: any refusal rolls all of them back.
export function applyEffects(d,engine,effects,context,source){

 if(!effects.length)return {applied:true,effects:[]};
 const out=effectTransaction(d,engine,effects,context,source);
 return out.applied?{applied:true,effects:out.results}:out.result;
}

// ---- Built-in kinds -------------------------------------------------------
// K2 programs authored by world/faction/festival data retain their physical
// parameters. They use the same interpreter as ordinary and magical contact.
registerEffect('interaction',{
 validate(engine,effect){
  if(!['fire','cold','water','rain','flood','ink'].includes(effect.agent)||!environmentFeatures(engine).some(f=>f.id===effect.target)||effect.minutes!==undefined&&!int(effect.minutes,1,360*DAY)||effect.moistureMg!==undefined&&!int(effect.moistureMg,0,1000000000))throw Error('物理交互的施力、目标或参数无效');
 },
 apply(d,engine,effect,context){return {applied:true,...applyInteraction(d,engine,{agent:effect.agent,target:effect.target,minutes:effect.minutes,moistureMg:effect.moistureMg,minute:context.minute,sourceEvent:context.sourceEvent})};},
});
// Price quote (formerly world-clock regional_quote).
registerEffect('regional_quote',{
 validate(engine,effect){if(effect.item!==engine.rules.settlementTrade?.item)throw Error('世界时钟未知效果或缺少贸易消费者，拒绝推进');},
 apply:(d,engine,effect,context)=>({applied:true,...effect,price:toRational(regionalTradePrice(d,engine,effect.item,context.settlement,context.minute))}),
});
// Spirit awakening (formerly world-clock awakening/awaken), consumed by T160.
for(const kind of ['awakening','awaken'])registerEffect(kind,{
 validate:(engine,effect)=>assertWildlifeAwakeningEffect(engine,effect),
 apply:(d,engine,effect,context)=>applyWildlifeAwakeningEffect(d,engine,effect,context),
});
// Wildlife unrest: encounters at the habitat become likelier until it calms.
const habitat=(engine,id)=>{const h=engine.rules.wildlife?.habitats.find(h=>h.id===id);if(!h)throw Error(`野物效果栖地未登记：${id}`);return h;};
registerEffect('wildlife_stir',{
 validate(engine,effect){habitat(engine,effect.habitat);if(!int(effect.minutes,1,360*DAY)||effect.factor!==undefined&&!(effect.factor>1&&effect.factor<=3))throw Error('野物躁动时长或倍率无效');},
 apply(d,engine,effect,context){
  const key=`wildlife:stir:${effect.habitat}`,factor=effect.factor??2,until=context.minute+effect.minutes;
  holdingSet(d,null,['state','records',key],{category:'wildlife_stir',habitat:effect.habitat,factor,since:context.minute,until,sourceEvent:context.sourceEvent},'effects');
  return {applied:true,...effect,factor,until};
 },
});
// Wildlife migration: part of a species' population leaves one habitat for another.
registerEffect('wildlife_migrate',{
 validate(engine,effect){
  for(const id of [effect.from,effect.to]){habitat(engine,id);if(!speciesInHabitat(engine.rules,engine.world.monsters,id).some(s=>s.id===effect.species))throw Error('迁移物种不在该栖地分布范围');}
  if(effect.from===effect.to||!int(effect.count,1,1000))throw Error('野物迁移参数无效');
 },
 apply(d,engine,effect){
  const path=h=>['state','records',`ecology:${h}`],from=structuredClone(d.get(...path(effect.from))),to=structuredClone(d.get(...path(effect.to)));
  const a=from?.populations?.[effect.species],b=to?.populations?.[effect.species];
  if(!a||!b)return {applied:false,reason:'栖地种群记录缺失'};
  const moved=Math.min(effect.count,a.count);if(!moved)return {applied:false,reason:'迁出栖地已无该物种'};
  a.count-=moved;a.displaced=(a.displaced??0)+moved;b.count+=moved;b.displacedIn=(b.displacedIn??0)+moved;
  holdingSet(d,null,path(effect.from),from,'effects');holdingSet(d,null,path(effect.to),to,'effects');
  return {applied:true,...effect,moved};
 },
});
// Rumor: a witnessed world event carried by named people, retellable through
// the K5 event-rumor path (npcRumors / hearNpcRumor).
registerEffect('rumor',{
 validate(engine,effect){
  if(typeof effect.id!=='string'||!/^[a-z0-9_-]{1,40}$/.test(effect.id)||typeof effect.claim!=='string'||!effect.claim.trim()||effect.claim.length>200)throw Error('传闻效果编号或内容无效');
  if(!Array.isArray(effect.carriers)||!effect.carriers.length||effect.carriers.some(id=>!engine.world.npcs.some(n=>n.id===id)))throw Error('传闻携带者未登记');
  if(effect.salience!==undefined&&!int(effect.salience,1,5))throw Error('传闻显著度无效');
 },
 apply(d,engine,effect,context){
  const id=`${context.sourceEvent}:rumor:${effect.id}`,rumor=`rumor_event:${id}`,state=d.get('state');
  const carriers=effect.carriers.filter(n=>state.npcs?.[n]&&!isPhysicallyDead(null,state,n));
  holdingSet(d,null,['state','records',`world_event:${id}`],{category:'world_event',id,verb:'rumor',actor:context.faction??null,target:null,minute:context.minute,
   location:context.settlement??null,witnesses:carriers,tags:['rumor','effect'],claim:effect.claim,sourceEvent:context.sourceEvent},'effects');
  for(const npc of carriers){
   const stream=d.get('state','npcs',npc,'memoryStream')??[];if(stream.some(m=>m.id===id))continue;
   d.set(['state','npcs',npc,'memoryStream'],[...stream,{id,sourceEvent:context.sourceEvent,kind:'rumor',minute:context.minute,location:context.settlement??null,participants:[],
    content:effect.claim,rumor,rumorSource:npc,eventRumor:true,sourceType:'听说',salience:effect.salience??2,emotion:'平静'}]);
  }
  return {applied:true,...effect,rumor,carriers};
 },
});
// Standing change through the K4 single write entry.
registerEffect('standing',{
 validate(engine,effect){
  const known=id=>id==='player'||engine.byId.has(id)||isReputationSettlement(engine,id)||String(id).startsWith('spirit_society:');
  if(typeof effect.holder!=='string'||typeof effect.target!=='string'||effect.holder===effect.target||!known(effect.holder)||effect.holder==='player'||!known(effect.target))throw Error('立场效果双方未登记');
  if(!int(Math.abs(effect.delta),1,100))throw Error('立场变化幅度无效');
 },
 apply(d,engine,effect,context){
  if(!standingKind(engine,d.get('state'),effect.holder))return {applied:false,reason:'立场持有者不可记账'};
  const row=adjustStanding(d,engine,effect.holder,effect.target,effect.delta,{sourceEvent:context.sourceEvent,reason:effect.reason??'时钟效果',minute:context.minute});
  return {applied:true,...effect,value:row?.value??row?.trust??null};
 },
});
// Element/environment state through the K2 interaction table: a cold snap
// freezes still water; a dry season dries fuel so it can catch fire again.
registerEffect('environment',{
 validate(engine,effect){
  if(!['frozen','dry'].includes(effect.state)||!Array.isArray(effect.locations)||!effect.locations.length||effect.locations.some(id=>!engine.world.locations.some(l=>l.id===id)))throw Error('环境效果状态或地点无效');
  if(effect.state==='frozen'&&!int(effect.minutes,1,360*DAY))throw Error('结冰时长无效');
 },
 apply(d,engine,effect,context){
  const changed=[],now=d.get('state','minute');
  for(const row of environmentFeatures(engine).filter(f=>effect.locations.includes(f.location))){
   if(effect.state==='frozen'){
    const minutes=context.minute+effect.minutes-now;if(minutes<1)continue;
    if(applyInteraction(d,engine,{agent:'cold',target:row.id,minutes}).added.includes('frozen'))changed.push(row.id);
   }else if(row.thermalModel){
    // Recorded wetness (traits) may lag the thermal ledger; drying settles both.
    const wet=traitsOf(engine,d.get('state'),row.id)?.tags.includes('wet'),state=readObjectState(d,row);if(!wet&&!(state.thermal.moistureMg>0))continue;
    // Dry air and sun supply the latent heat, so the object's own heat is unchanged.
    const t=state.thermal,mg=t.moistureMg;t.evaporatedMg+=mg;t.evaporationJ+=mg*3;t.ambientInputJ+=mg*3;t.moistureMg=0;
    storeObjectState(d,row,state);changed.push(row.id);
   }
  }
  return {applied:true,...effect,changed};
 },
});

// ---- Rules effect table (world/meta/rules.json effectTable) ---------------
registerEffect('facility',{
 validate(engine,e){
  if(!Array.isArray(e.locations)||!e.locations.length||e.locations.some(id=>!engine.byId.has(id))||!['damage','fire','water'].includes(e.action)||e.action==='damage'&&!int(e.amount,1,100))throw Error('设施效果地点、动作或损毁量无效');
 },
 apply(d,engine,e,context){
  if(e.action==='damage')return {applied:true,changed:damageFacilities(d,engine,e.locations,e.amount,{cause:'灾害',minute:context.minute,sourceEvent:context.sourceEvent})};
  const state=d.get('state'),changed=allFacilities(engine,state).filter(b=>e.locations.some(id=>within(engine,state,b.id,id))).map(b=>({id:b.id,...applyInteraction(d,engine,{agent:e.action,target:b.id,minute:context.minute,sourceEvent:context.sourceEvent})}));
  return {applied:true,changed};
 },
});

// hooks: extra effects attached to an existing clock stage or festival without
// rewriting its reviewed row. seasons: effects at the first midnight of a season.
export function effectTable(engine){return engine.rules.effectTable??null;}
export function hookedEffects(engine,source,owner,stage=null){
 return (effectTable(engine)?.hooks??[]).filter(h=>h.source===source&&h.owner===owner&&(h.stage??null)===stage).flatMap(h=>h.effects);
}
export function assertEffectTable(engine){
 for(const f of engine.world.festivals??[])if(f.runtime?.status==='active')for(const e of f.runtime.effects??[])assertEffect(engine,e,'festival');
 const t=effectTable(engine);if(!t)return;
 if(t.version!==1||!Array.isArray(t.hooks??[])||!Array.isArray(t.seasons??[]))throw Error('效果表版本无效');
 for(const h of t.hooks??[]){
  if(!['faction','festival'].includes(h.source)||typeof h.owner!=='string'||!Array.isArray(h.effects)||!h.effects.length)throw Error('效果挂接来源无效');
  for(const e of h.effects)assertEffect(engine,e,h.source);
 }
 const ids=new Set();
 for(const s of t.seasons??[]){
  if(!s.id||ids.has(s.id)||!int(s.season,0,3)||!engine.world.locations.some(l=>l.id===s.settlement)||!Array.isArray(s.effects)||!s.effects.length)throw Error('季节效果编号、季节或地点无效');
  ids.add(s.id);for(const e of s.effects)assertEffect(engine,e,'season');
 }
}
const seasonStart=(year,season)=>((year-1)*360+season*90)*DAY;
export function advanceSeasonEffects(d,engine,before,after){
 const seasons=effectTable(engine)?.seasons;if(!seasons?.length)return;
 for(let year=Math.floor(before/DAY/360)+1;seasonStart(year,0)<=after;year++)for(const s of seasons){
  const at=seasonStart(year,s.season),key=`season-effect:${s.id}:${year}`;
  if(at<=before||at>after||d.get('state','records',key))continue;
  const sourceEvent=`season:${s.id}:${year}`,receipt=applyEffects(d,engine,s.effects,{settlement:s.settlement,faction:null,minute:at,sourceEvent},'season');
  holdingSet(d,null,['state','records',key],{category:'season_effect',id:s.id,season:s.season,year,minute:at,settlement:s.settlement,sourceEvent,
   applied:receipt.applied,...(receipt.applied?{effects:receipt.effects}:{reason:receipt.reason??'效果条件未满足'})},'effects');
 }
}
