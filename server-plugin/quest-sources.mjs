import {purse,escrow as escrowAccount,treasury as treasuryAccount,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {bag,settlementStock,armyRations,moveStock,BOOKED as BOOKED_STOCK} from './stock.mjs';
// S1b: 委托交付的实物转入受领方（王都木料入聚落库存、军需入军粮）。交付物与受领账户不是同一物品时
// （旧规则把任意交付物折作军粮），交付物在交割处消耗、受领方的增量来自模拟范围外——这是旧结算的折算，账本如实记两笔。
declareLedgerWriter('quest-sources',{sources:{'src:import':{'*':100000}},sinks:['sink:consume']});
function deliverStock(d,engine,from,item,to,n,eventId){
 const src=bag(engine,from,item);
 if(src.split('|')[1]===to.split('|')[1])return moveStock(d,{from:src,to,amount:n,writer:'quest-sources',eventId});
 moveStock(d,{from:src,to:`sink:consume|${src.split('|')[1]}|supply`,amount:n,writer:'quest-sources',eventId});
 moveStock(d,{from:`src:import|${to.split('|')[1]}|supply`,to,amount:n,writer:'quest-sources',eventId});
}
import {personSimulation,questPublisher,questBoards} from './entity-view.mjs';
// U17 任务自动来源（指南3.10）。任务公告栏的来源除玩家与官员手发外，还有：
//   npc_needs     人物按自身短缺与需求目标（口粮、找药、修屋、护送、寻人）出私人委托，
//                 报酬从本人钱里托管，出不起就不出；数量按灵智等级与紧迫度节流。
//   world_events  订阅记录（疫病、受淹、冬荒、首领迁占、聚居地议题）出公事委托，
//                 报酬从聚落公账托管（留底不动），按本月D单位额度折算节流。
//   effect_table  效果表 quest_post：势力时钟阶段、季节、节日、灾害阶段直接出委托；
//                 势力委托完成后可改动该势力时钟的阶段并影响立场。
// 每个来源都是登记的生成器（registerQuestGenerator）；内容只写 rules.questSources
// 与效果表数据，不手工接线。生成的任务与手发任务同一张表（boardVersion 1），
// 过期由 quest-board 撤下并按出资方退回托管；NPC离屏接单规则不变。
import {createHash} from 'node:crypto';
import {registerEffect} from './effects.mjs';
import {presentWitnesses} from './world-events.mjs';
import {intelligenceOf,npcNeedGoals} from './npc-intelligence.mjs';
import {npcHousehold,npcIllness} from './npc-life.mjs';
import {famineAt} from './hazard-calendar.mjs';
import {factionClockRules,spendFactionAssets,creditFactionAssets} from './faction-clock.mjs';
import {adjustStanding} from './standing.mjs';
import {authorityOf} from './governance.mjs';
import {speciesInHabitat} from './wildlife-range.mjs';
import {villageWildlifeFresh} from './quest-wildlife.mjs';

const DAY=1440,GRADES=['D','C','B','A','S'],OBJECTIVES=['deliver','visit','record'],FUNDING=['faction','treasury'];
const OUTCOMES=['pause','resume','redirect','support'],active=q=>['公开','进行中'].includes(q.status);
const int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const rules=engine=>engine.rules.questSources??null;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,16);
const nameOf=(engine,id)=>engine.byId.get(id)?.name??id;
export const QUEST_SOURCES_VERSION=1;
// 旧事件重放不补出任务：只有新结算或重放结果已带本版本号时才生成。
export function questSourcesFresh(engine){return !engine.replaying||engine.replayResult?.questSourcesVersion===QUEST_SOURCES_VERSION;}

// ---- 等级折算：1S=10A=100B=1000C=10000D --------------------------------------
export const gradeUnitsD=(engine,grade)=>engine.rules.quests.quotaUnits[grade];
export function convertGrade(engine,count,from,to){return count*gradeUnitsD(engine,from)/gradeUnitsD(engine,to);}
export function rewardRange(engine,grade){return engine.rules.quests.rewardCopperRanges[grade];}
const inRange=(engine,grade,reward)=>{const [lo,hi]=rewardRange(engine,grade);return Number.isSafeInteger(reward)&&reward>=lo&&reward<=hi;};

// ---- 生成器登记 -----------------------------------------------------------------
const generators=new Map();
export function registerQuestGenerator(spec){
 if(typeof spec?.id!=='string'||!spec.id||!Number.isFinite(spec.order))throw Error('任务生成器需要 id 与 order');
 if(generators.has(spec.id))throw Error(`任务生成器重复：${spec.id}`);
 if(spec.scan!==undefined&&typeof spec.scan!=='function')throw Error(`任务生成器${spec.id}的 scan 必须是函数`);
 generators.set(spec.id,Object.freeze({...spec}));return ()=>generators.delete(spec.id);
}
export const questGenerators=()=>[...generators.values()].sort((a,b)=>a.order-b.order);

// ---- 规则校验 -------------------------------------------------------------------
const locationKnown=(engine,id)=>engine.world.locations.some(l=>l.id===id);
const ref=v=>typeof v==='string'&&v.startsWith('$');
function assertObjective(engine,o,label){
 if(!o||!OBJECTIVES.includes(o.type))throw Error(`${label}完成条件必须可验证`);
 if(o.type==='deliver'&&(!engine.world.items.some(i=>i.id===o.item)||!int(o.quantity,1,100000)))throw Error(`${label}交付物或数量无效`);
 if(o.type==='visit'&&!ref(o.location)&&!locationKnown(engine,o.location))throw Error(`${label}目的地未登记`);
 if(o.type==='record'&&(typeof o.record!=='string'||!o.record||typeof o.field!=='string'||!Array.isArray(o.equals)||!o.equals.length))throw Error(`${label}记录条件无效`);
}
function assertOffer(engine,row,label){
 if(!GRADES.includes(row.grade)||!inRange(engine,row.grade,row.reward))throw Error(`${label}等级或报酬不在规格区间`);
 if(!int(row.days,1,30)||typeof row.content!=='string'||!row.content.trim()||row.content.length>200)throw Error(`${label}期限或内容无效`);
 assertObjective(engine,row.objective,label);
}
function assertOutcome(engine,o,label){
 if(o===undefined)return;
 const clock=factionClockRules(engine).find(r=>r.id===o?.clock);
 if(!clock||!OUTCOMES.includes(o.effect)||o.effect==='redirect'&&!clock.stages.some(s=>s.id===o.nextStage))throw Error(`${label}委托结果的时钟或阶段未登记`);
 if(o.standing!==undefined&&(!Array.isArray(o.standing)||o.standing.some(s=>typeof s?.holder!=='string'||!int(Math.abs(s.delta),1,100))))throw Error(`${label}委托立场变化无效`);
}
export const NEED_KINDS=Object.freeze(['food','medicine','repair','escort','missing']);
const checked=new WeakSet();
export function assertQuestSources(engine){
 const t=rules(engine);if(!t||checked.has(t))return;
 if(t.version!==1||!Array.isArray(t.npcNeeds??[])||!Array.isArray(t.events??[]))throw Error('任务来源规则版本无效');
 const l=t.limits??{};
 if(!int(l.perBoard,1,50)||!int(l.perDay,1,50)||!int(l.cooldownDays,0,360)||!int(l.monthlyUnitsDPerBoard,1,1e6)||
  [0,1,2,3,4,5].some(k=>!int(l.perNpcByLevel?.[k],0,5)||!int(l.minUrgencyByLevel?.[k],1,4)))throw Error('任务来源节流参数无效');
 for(const [board,npc] of Object.entries(t.publishers??{}))if(!locationKnown(engine,board)||!engine.world.npcs.some(n=>n.id===npc))throw Error(`公告栏主事人未登记：${board}`);
 // D1: a board whose public money is an organization treasury (monster settlements, T159).
 for(const [board,faction] of Object.entries(t.funds??{}))if(!questPublisher(engine,{},board).value||!engine.world.factions?.some(f=>f.id===faction))throw Error(`公告栏公库未登记：${board}`);
 for(const row of t.ledgers??[]){const o=row.opening;
  if(!locationKnown(engine,row.settlement)||!o?.name||['population','treasury','wood','iron'].some(k=>!int(o[k],0,1e9)))throw Error(`聚落公账开账无效：${row.settlement}`);}
 const needs=new Set();
 for(const r of t.npcNeeds??[]){
  if(!NEED_KINDS.includes(r.need)||needs.has(r.need))throw Error(`人物需求任务种类无效或重复：${r.need}`);needs.add(r.need);
  assertOffer(engine,r,`需求任务${r.need}`);
  if(r.objective.type==='record')throw Error(`需求任务${r.need}不能用记录条件`);
 }
 const ids=new Set();
 for(const r of t.events??[]){
  if(typeof r.id!=='string'||!/^[a-z0-9_]{1,40}$/.test(r.id)||ids.has(r.id))throw Error(`事件任务编号无效或重复：${r.id}`);ids.add(r.id);
  if(!r.match||typeof r.match.category!=='string'||typeof r.board!=='string')throw Error(`事件任务订阅条件无效：${r.id}`);
  assertOffer(engine,r,`事件任务${r.id}`);
 }
 for(const r of t.wildlife??[]){
  if(typeof r.id!=='string'||ids.has(r.id))throw Error(`生物委托编号无效或重复：${r.id}`);ids.add(r.id);
  if(!questPublisher(engine,{},r.board).value)throw Error(`生物委托没有公告栏主事人：${r.id}`);
  if(r.objective.type==='deliver')assertOffer(engine,r,`生物委托${r.id}`);
  else{
   assertOffer(engine,{...r,objective:{type:'visit',location:r.objective.location}},`生物委托${r.id}`);
   const o=r.objective;
   if(o.type==='creature'){
    const s=engine.world.monsters.find(s=>s.id===o.species),h=engine.rules.wildlife?.habitats.find(h=>h.location===o.location);
    if(!s||!h||!speciesInHabitat(engine.rules,engine.world.monsters,h.id).some(s=>s.id===o.species)||!o.outcomes?.length||o.outcomes.some(x=>!['death','expelled','ferried'].includes(x)))throw Error(`生物委托物种、栖地或结果无效：${r.id}`);
    if(o.outcomes.includes('expelled')&&s.nature?.spirit?.nature!=='malevolent'||o.outcomes.includes('ferried')&&s.nature?.kind!=='游魂')throw Error(`生物委托仪式不适用：${r.id}`);
   }else if(o.type==='pact'){
    const b=engine.world.bosses.find(b=>(b.actor??b.id)===o.target);
    if(!b||b.intelligence<=0||b.residence.location!==o.location||!['respect_territory','nonaggression'].includes(o.pact)||!Array.isArray(o.offer)||!Array.isArray(o.request)||[...o.offer,...o.request].some(x=>!engine.world.items.some(i=>i.id===x.item)||!int(x.quantity,1,100000))||o.offer.some(x=>!b.negotiation?.accepts?.includes(x.item)))throw Error(`生物委托交涉条件无效：${r.id}`);
   }else throw Error(`生物委托目标不支持：${r.id}`);
  }
 }
 checked.add(t);
}
export function validateQuestSources(world){
 if(!world.rules.questSources)return [];
 const byId=new Map();for(const key of ['locations','npcs','items','factions'])for(const x of world[key]??[])byId.set(x.id,x);
 try{assertQuestSources({world,rules:world.rules,byId});return [];}catch(error){return [error.message];}
}

// ---- 发布 -----------------------------------------------------------------------
const fill=(text,vars)=>text.replace(/\{(\w+)\}/g,(m,k)=>vars[k]??m);
const pick=(record,path)=>path.split('.').reduce((v,k)=>v?.[k],record);
// 一个地点（人物所在、巢穴、建筑）向上找到登记了主事人的公告栏。
function boardOf(engine,place,boards){
 const lair=(engine.world.bosses??[]).find(b=>b.residence?.id===place)?.residence?.location;
 let at=lair??(engine.byId.get(place)?.location&&!locationKnown(engine,place)?engine.byId.get(place).location:place);const seen=new Set();
 while(at&&!seen.has(at)){if(!boards||boards.includes(at))return at;seen.add(at);at=engine.byId.get(at)?.parent;}
 return null;
}
const generated=state=>Object.values(state.quests??{}).filter(q=>q.boardVersion===1&&q.source);
// 托管：人物从自己钱里出，势力从势力公库出，聚落从公账出（不得动用留底）。
function escrow(d,engine,funding,reward,quest){
 if(funding.npc){const account=funding.npc==='player'?['state','player']:['state','npcs',funding.npc],coins=d.get(...account,'coins')??0;if(coins<reward)return false;moveCoins(d,{from:purse(engine,funding.npc),to:escrowAccount(quest),amount:reward,writer:'quest-sources',eventId:quest});d.set([...account,'coins'],coins-reward);return true;}
 if(funding.faction)return spendFactionAssets(d,engine,funding.faction,{coins:reward},{sourceEvent:quest,minute:d.get('state','minute'),kind:'quest_escrow'},{account:escrowAccount(quest),writer:'quest-sources',eventId:quest});
 if(funding.treasury){
  const treasury=d.get('state','settlements',funding.treasury,'treasury'),reserve=authorityOf(engine)?.treasury?.reserveCopper??0;
  if(!Number.isSafeInteger(treasury)||treasury-reward<reserve)return false;
  moveCoins(d,{from:treasuryAccount(funding.treasury),to:escrowAccount(quest),amount:reward,writer:'quest-sources',eventId:quest});d.set(['state','settlements',funding.treasury,'treasury'],treasury-reward);return true;
 }
 return false;
}
// quest-board 关闭未付报酬时调用：势力与公账出资退回原处。返回是否已处理。
export function refundQuestFunding(d,engine,q,amount,minute){
 if(q.fundedBy?.faction){creditFactionAssets(d,engine,q.fundedBy.faction,{coins:amount},{sourceEvent:`${q.id}:refund`,minute,kind:'quest_refund'},{account:escrowAccount(q.id),writer:'quest-sources',eventId:`${q.id}:refund`});return true;}
 if(q.fundedBy?.treasury){moveCoins(d,{from:escrowAccount(q.id),to:treasuryAccount(q.fundedBy.treasury),amount,writer:'quest-sources',eventId:`${q.id}:refund`});d.set(['state','settlements',q.fundedBy.treasury,'treasury'],(d.get('state','settlements',q.fundedBy.treasury,'treasury')??0)+amount);return true;}
 return false;
}
/**
 * 由已登记生成器发布一条委托。offer: {key,generator,label,grade,reward,days,content,objective,
 * board,publisher,funding:{npc|faction|treasury},minute,outcome?,cause?}。出不起或已有同源任务时返回 null。
 */
export function postGeneratedQuest(d,engine,offer){
 if(!generators.has(offer.generator))throw Error(`未登记的任务生成器：${offer.generator}`);
 const state=d.get('state'),minute=offer.minute;
 if(!GRADES.includes(offer.grade)||!inRange(engine,offer.grade,offer.reward))throw Error('生成任务的等级或报酬不在规格区间');
 if(generated(state).some(q=>q.source.key===offer.key))return null;
 if(!locationKnown(engine,offer.board)||!state.npcs?.[offer.publisher]&&offer.publisher!=='player')return null;
 const quest=`quest_src_${digest([offer.key])}`;if(state.quests?.[quest])return null;
 if(!escrow(d,engine,offer.funding,offer.reward,quest))return null;
 const label=offer.label,row={id:quest,boardVersion:1,publisher:offer.publisher,personal:Boolean(offer.funding.npc),grade:offer.grade,unitsD:gradeUnitsD(engine,offer.grade),
  reward:offer.reward,escrow:offer.reward,objective:offer.objective,content:offer.content,location:offer.board,deadline:minute+offer.days*DAY,createdAt:minute,status:'公开',taker:null,
  source:{key:offer.key,generator:offer.generator,label,...(offer.cause?{cause:offer.cause}:{}),...(offer.need?{need:offer.need}:{}),...(offer.outcome?{outcome:offer.outcome}:{})},sourceLabel:label,
  ...(offer.funding.npc?{}:{fundedBy:offer.funding})};
 d.set(['state','quests',quest],row);
 // 认知边界：只有当时在告示处醒着的人亲眼看到；他们之后能把告示当传闻转告。
 const id=`${quest}:posted`,witnesses=presentWitnesses(state,offer.board).filter(n=>n!==offer.publisher),carriers=[...new Set([...(state.npcs?.[offer.publisher]?[offer.publisher]:[]),...witnesses])];
 const claim=`${nameOf(engine,offer.board)}贴出告示（${label}）：${offer.content}，酬${offer.reward}铜。`;
 d.set(['state','records',`world_event:${id}`],{category:'world_event',id,verb:'rumor',actor:offer.publisher,target:null,minute,location:offer.board,witnesses:carriers,tags:['rumor','quest'],claim,quest,sourceEvent:id});
 for(const npc of carriers){
  const stream=d.get('state','npcs',npc,'memoryStream')??[];if(stream.some(m=>m.id===id))continue;
  d.set(['state','npcs',npc,'memoryStream'],[...stream,{id,sourceEvent:id,kind:'rumor',minute,location:offer.board,participants:[],content:claim,
   rumor:`rumor_event:${id}`,rumorSource:npc,eventRumor:true,sourceType:npc===offer.publisher?'亲历':'目击',salience:2,emotion:'平静'}]);
 }
 d.set(['state','records',`${quest}:publish`],{category:'quest_receipt',quest,parties:[offer.publisher],minute,location:offer.board,status:'公开',reason:null,escrow:offer.reward,refund:0,rewardPaid:0,source:offer.generator,sourceEvent:`${quest}:publish`});
 return row;
}

// ---- 完成后果：势力委托改变时钟阶段并影响立场 -----------------------------------
export function settleQuestOutcome(d,engine,q,minute){
 if(q.source?.generator==='effect_table'&&q.source.cause==='royal_commission'&&q.fundedBy?.treasury===engine.rules.governance?.sovereignty?.royal.questBoard&&q.objective.type==='deliver'){
  const prior=d.get('state','records',`${q.id}:outcome`);if(prior)return prior;
  const n=q.objective.quantity,board=q.fundedBy.treasury;
  if(engine.quantity(d,q.publisher,q.objective.item)<n)throw Error('王都委托未收到实际物资');
  engine.itemDelta(d,q.publisher,q.objective.item,-n,BOOKED_STOCK);deliverStock(d,engine,q.publisher,q.objective.item,settlementStock(engine,board,'wood'),n,`${q.id}:outcome`);
  d.set(['state','settlements',board,'wood'],(d.get('state','settlements',board,'wood')??0)+n);
  const result={category:'quest_outcome',quest:q.id,royal:true,settlement:board,supplied:n,minute};d.set(['state','records',`${q.id}:outcome`],result);return result;
 }
 // War commissions use the existing effect-table generator and its funded delivery.
 if(q.source?.generator==='effect_table'&&q.source.cause?.startsWith('war:')&&q.objective.type==='deliver'){
  const war=d.get('state','records',q.source.cause),unit=war?.armyIds.map(id=>d.get('state','records',`army:${id}`)).find(a=>(a?.warSide??a?.party)===war.defender&&(a.regular+a.private+a.levy.count+(a.mercenary?.count??0)>0));
  const n=q.objective.quantity;
  if(war?.status==='交战'&&unit&&engine.quantity(d,q.publisher,q.objective.item)>=n){
   engine.itemDelta(d,q.publisher,q.objective.item,-n,BOOKED_STOCK);deliverStock(d,engine,q.publisher,q.objective.item,armyRations(engine,unit.id),n,`${q.id}:outcome`);
   d.set(['state','records',`army:${unit.id}`],{...unit,food:unit.food+n});
   const result={category:'quest_outcome',quest:q.id,war:war.id,army:unit.id,supplied:n,minute};d.set(['state','records',`${q.id}:outcome`],result);return result;
  }
 }

 const o=q.source?.outcome;if(!o)return null;
 const key=`faction-clock:${o.clock}`,clock=d.get('state','records',key),rule=factionClockRules(engine).find(r=>r.id===o.clock);
 let result={clock:o.clock,effect:o.effect,applied:false};
 if(clock&&rule){
  const next={...clock},stage=rule.stages[clock.phase];
  if(o.effect==='pause')next.paused=true;
  if(o.effect==='resume')next.paused=false;
  if(o.effect==='redirect')next.phase=rule.stages.findIndex(s=>s.id===o.nextStage);
  if(o.effect==='support')next.interventions=[...clock.interventions,{choice:o.choice??q.id,stage:stage?.id??null,sourceEvent:q.id,minute,cost:{},success:true,quest:q.id}];
  d.set(['state','records',key],next);result={...result,applied:true,phase:next.phase,paused:next.paused};
 }
 for(const s of o.standing??[])adjustStanding(d,engine,s.holder,q.taker,s.delta,{sourceEvent:`${q.id}:outcome`,reason:`完成委托：${q.content}`,minute});
 d.set(['state','records',`${q.id}:outcome`],{category:'quest_outcome',quest:q.id,...result,standing:o.standing??[],minute,sourceEvent:`${q.id}:outcome`});
 return result;
}

// ---- 生成器一：人物需求 ------------------------------------------------------------
const alive=n=>n&&!['死亡','濒死'].includes(n.status);
// 每个需求探测返回 {urgency 1–3, cause, vars, place?}；数据行只写报酬、物件与措辞。
const NEED_DETECTORS={
 food(engine,state,id,home,at){
  const goal=npcNeedGoals(state,id).find(g=>g.need==='food'&&g.status==='进行中'),famine=famineAt(state,home,at);
  return goal||famine?{urgency:3,cause:famine?`${npcHousehold(engine,state,id)?.id??id}:${famine.sourceEvent}`:goal.id,vars:{}}:null;
 },
 medicine(engine,state,id){
  const house=npcHousehold(engine,state,id);
  for(const m of [...house?.members??[id]].sort()){const ill=npcIllness(state,m);if(ill)return {urgency:ill.severity==='重'?3:2,cause:ill.id,vars:{patient:nameOf(engine,m)}};}
  return null;
 },
 repair(engine,state,id,home,at,row){
  const below=row.below??50,b=Object.entries(state.buildings??{}).filter(([,b])=>b.owner===id&&Number.isFinite(b.condition)&&b.condition<below).sort(([a],[b])=>a.localeCompare(b))[0];
  return b?{urgency:b[1].condition<below/2?3:2,cause:b[0],vars:{building:nameOf(engine,b[0])}}:null;
 },
 escort(engine,state,id){
  const goal=npcNeedGoals(state,id).find(g=>g.need==='safety'&&g.status==='进行中');
  return goal?{urgency:2,cause:goal.id,vars:{}}:null;
 },
 missing(engine,state,id){
  const house=npcHousehold(engine,state,id);
  for(const m of [...house?.members??[]].sort())if(m!==id&&state.npcs?.[m]?.status==='失踪')
   return {urgency:3,cause:`missing:${m}`,vars:{person:nameOf(engine,m)},place:state.npcs[m].location};
  return null;
 },
};
function resolveObjective(engine,o,vars,board,place){
 if(o.type==='deliver')return {type:'deliver',item:o.item,quantity:o.quantity,location:board};
 if(o.type==='visit'){const location=o.location==='$place'?place:o.location==='$board'?board:o.location;return locationKnown(engine,location)?{type:'visit',location}:null;}
 const record=fill(o.record,vars);return {type:'record',record,field:o.field,equals:[...o.equals]};
}
function scanNpcNeeds(d,engine,at){
 const t=rules(engine);if(!t?.npcNeeds?.length)return [];
 const state=d.get('state'),l=t.limits,posted=[],open=generated(state).filter(active);
 const offers=[];
 for(const id of Object.keys(state.npcs??{}).sort()){
  const npc=state.npcs[id];if(!personSimulation(engine,state,id).value||!alive(npc))continue;
  const {level}=intelligenceOf(engine,state,id),limit=l.perNpcByLevel[level]??0;
  if(open.filter(q=>q.publisher===id&&q.source.generator==='npc_needs').length>=limit)continue;
  const home=npcHousehold(engine,state,id)?.settlement;if(!home||!locationKnown(engine,home))continue;
  for(const row of t.npcNeeds){
   const need=NEED_DETECTORS[row.need](engine,state,id,home,at,row);if(!need||need.urgency<(l.minUrgencyByLevel[level]??4))continue;
   // 同一缺口（同一病人、同一屋、同一户的冬荒）一户只出一单；上一单结束后冷却期内本人也不再出。
   const key=`need:${row.need}:${need.cause}`;
   if(generated(state).some(q=>q.source.key===key||q.publisher===id&&q.source.need===row.need&&(active(q)||at-(q.resolvedAt??q.createdAt)<l.cooldownDays*DAY)))continue;
   const objective=resolveObjective(engine,row.objective,need.vars,home,need.place);if(!objective)continue;
   offers.push({id,level,need,row,home,key,objective});break;
  }
 }
 offers.sort((a,b)=>b.need.urgency-a.need.urgency||a.id.localeCompare(b.id));
 for(const o of offers){
  if(posted.length>=l.perDay)break;
  if(generated(d.get('state')).filter(q=>active(q)&&q.location===o.home).length>=l.perBoard)continue;
  // 只拿手头一半以内的余钱作报酬，不为一张告示把过日子的钱掏空；不够等级下限就不出。
  const coins=d.get('state','npcs',o.id,'coins')??0,[lo]=rewardRange(engine,o.row.grade),reward=Math.min(o.row.reward,Math.floor(coins/2));
  if(reward<lo)continue;
  const vars={...o.need.vars,name:nameOf(engine,o.id),quantity:o.objective.quantity??''};
  const row=postGeneratedQuest(d,engine,{key:o.key,generator:'npc_needs',label:`${nameOf(engine,o.id)}的私人求助`,grade:o.row.grade,reward,days:o.row.days,
   content:fill(o.row.content,vars),objective:o.objective,board:o.home,publisher:o.id,funding:{npc:o.id},minute:at,cause:o.need.cause,need:o.row.need});
  if(row)posted.push(row.id);
 }
 return posted;
}

// ---- 生成器二：世界事件订阅 --------------------------------------------------------
// 公事出资：聚落公账；登记了组织公库的公告栏（怪物聚居地）由该组织公库托管。
const publicFunding=(t,board)=>t?.funds?.[board]?{faction:t.funds[board]}:{treasury:board};
const matches=(record,match)=>Object.entries(match).every(([k,v])=>Array.isArray(v)?v.includes(pick(record,k)):pick(record,k)===v);
const monthOf=minute=>Math.floor(minute/(DAY*30));
function scanWorldEvents(d,engine,at){
 const t=rules(engine);if(!t?.events?.length)return [];
 const posted=[],boards=questBoards(engine,d.get('state'));
 for(const [key,record] of Object.entries(d.get('state','records')??{}).sort(([a],[b])=>a.localeCompare(b))){
  for(const row of t.events){
   if(!matches(record,row.match))continue;
   const value=ref(row.board)?pick(record,row.board.slice(1)):row.board,board=typeof value==='string'?boardOf(engine,value,boards):null;if(!board)continue;
   const instance=row.instance?pick(record,row.instance):record.sourceEvent??record.since??record.minute??'once';
   const sourceKey=`event:${row.id}:${key}:${instance}`,state=d.get('state');
   if(generated(state).some(q=>q.source.key===sourceKey))continue;
   const open=generated(state).filter(q=>active(q)&&q.location===board);if(open.length>=t.limits.perBoard)continue;
   // 公事委托按本月D单位额度折算：一个C级占10个D。
   const month=monthOf(at),used=generated(state).filter(q=>q.source.generator==='world_events'&&q.location===board&&monthOf(q.createdAt)===month).reduce((n,q)=>n+q.unitsD,0);
   if(used+gradeUnitsD(engine,row.grade)>t.limits.monthlyUnitsDPerBoard)continue;
   const vars={key,board:nameOf(engine,board),place:nameOf(engine,value)},objective=resolveObjective(engine,{...row.objective,record:row.objective.record==='$key'?key:row.objective.record},vars,board,value);
   if(!objective)continue;
   const q=postGeneratedQuest(d,engine,{key:sourceKey,generator:'world_events',label:row.label?fill(row.label,vars):`${nameOf(engine,board)}公事`,grade:row.grade,reward:row.reward,days:row.days,
    content:fill(row.content,vars),objective,board,publisher:questPublisher(engine,d.get('state'),board).value,funding:publicFunding(t,board),minute:at,cause:key});
   if(q)posted.push(q.id);
  }
 }
 return posted;
}

registerQuestGenerator({id:'npc_needs',order:100,scan:scanNpcNeeds});
registerQuestGenerator({id:'world_events',order:200,scan:scanWorldEvents});
registerQuestGenerator({id:'effect_table',order:300});

// Local offers share U17 posting, escrow and expiration. Never spawn a target.
function scanVillageWildlife(d,engine,at){
 if(!villageWildlifeFresh(engine))return [];
 const t=rules(engine),posted=[];
 for(const row of t?.wildlife??[]){
  const o=row.objective,targets=o.type==='creature'?Object.entries(d.get('state','creatures')??{}).filter(([,a])=>a.species===o.species&&a.location===o.location&&a.hp>0&&a.status==='正常'&&!a.owner).map(([id])=>id).sort():[o.target??'once'];
  for(const target of targets){
   const qs=generated(d.get('state'));
   if(posted.length>=t.limits.perDay)return posted;
   if(qs.filter(q=>active(q)&&q.location===row.board).length>=t.limits.perBoard)continue;
   const used=qs.filter(q=>q.location===row.board&&monthOf(q.createdAt)===monthOf(at)).reduce((n,q)=>n+q.unitsD,0);
   if(used+gradeUnitsD(engine,row.grade)>t.limits.monthlyUnitsDPerBoard)continue;
   if(o.type==='creature'&&qs.some(q=>q.objective.type==='creature'&&q.objective.target===target))continue;
   const q=postGeneratedQuest(d,engine,{...row,key:`village:${row.id}:${target}`,generator:'village_wildlife',label:row.name,
    objective:{...structuredClone(o),...(o.type==='creature'?{target}:{})},publisher:questPublisher(engine,d.get('state'),row.board).value,funding:publicFunding(t,row.board),minute:at,
    content:row.content+(o.type==='creature'?` 指定个体：${d.get('state','creatures',target,'name')}（${target}）。`:''),cause:row.id});
   if(q)posted.push(q.id);
  }
 }
 return posted;
}
registerQuestGenerator({id:'village_wildlife',order:275,scan:scanVillageWildlife});

// D1 聚落公账开账：没有农事粮仓的聚落（白石镇）只开公款账，granary:false 让每日口粮结算跳过它；
// 已有账的聚落不覆盖。新战役开局与远方郡展开时调用。
export function settlementLedger(opening){
 return {name:opening.name,population:opening.population,treasury:opening.treasury,wood:opening.wood,iron:opening.iron,
  food:opening.food??0,foodPerDay:opening.foodPerDay??0,woodPerDay:opening.woodPerDay??0,starvation:0,...(opening.granary===false?{granary:false}:{})};
}
export function openSettlementLedgers(engine,document){
 const rows=rules(engine)?.ledgers??[];if(!rows.length)return document;
 const doc=structuredClone(document);doc.state.settlements??={};
 for(const row of rows)if(!doc.state.settlements[row.settlement])doc.state.settlements[row.settlement]=settlementLedger(row.opening);
 return doc;
}

// 推进注册表：每个午夜（含跨日一段推进中的每个午夜）跑一次各生成器。
export function advanceQuestSources(d,engine,{before,after}){
 if(!rules(engine)||!questSourcesFresh(engine))return [];
 assertQuestSources(engine);
 const posted=[];
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
  const at=day*DAY;
  for(const g of questGenerators())if(g.scan)posted.push(...g.scan(d,engine,at));
 }
 return posted;
}

// ---- 生成器三：效果表 quest_post ---------------------------------------------------
// 势力时钟阶段（含 hooks）、季节、节日与灾害阶段都可直接出委托。出不起不阻断阶段，
// 只回执 posted:false。势力出资默认由势力公库托管，其他来源由聚落公账托管。
registerEffect('quest_post',{
 validate(engine,e){
  if(typeof e.id!=='string'||!/^[a-z0-9_]{1,40}$/.test(e.id))throw Error('委托效果编号无效');
  assertOffer(engine,e,`委托效果${e.id}`);
  if(e.board!==undefined&&!locationKnown(engine,e.board)||e.publisher!==undefined&&!engine.world.npcs.some(n=>n.id===e.publisher)||e.funding!==undefined&&!FUNDING.includes(e.funding))throw Error(`委托效果${e.id}地点、发布人或出资方无效`);
  assertOutcome(engine,e.onComplete,`委托效果${e.id}`);
 },
 apply(d,engine,e,context){
  const board=e.board??context.settlement,funding=e.funding??(context.faction?'faction':'treasury');
  if(funding==='faction'&&!context.faction&&!e.faction)return {applied:true,kind:e.kind,id:e.id,posted:false,reason:'没有出资的势力'};
  const owner=e.faction??context.faction,f=owner?engine.world.factions?.find(x=>x.id===owner):null;
  const contact=factionClockRules(engine).find(r=>r.faction===owner)?.contact?.representative;
  const publisher=e.publisher??(funding==='faction'?contact??f?.leader:questPublisher(engine,d.get('state'),board).value);
  const vars={board:nameOf(engine,board),faction:f?.name??''};
  const objective=resolveObjective(engine,e.objective,vars,board,board);
  const row=objective&&publisher?postGeneratedQuest(d,engine,{key:`effect:${context.sourceEvent}:${e.id}`,generator:'effect_table',label:e.label??(f&&funding==='faction'?`${f.name}委托`:`${nameOf(engine,board)}公事`),
   grade:e.grade,reward:e.reward,days:e.days,content:fill(e.content,vars),objective,board,publisher,funding:funding==='faction'?{faction:owner}:publicFunding(rules(engine),board),minute:context.minute,
   cause:context.sourceEvent,outcome:e.onComplete?{...e.onComplete,choice:e.onComplete.choice??e.id}:undefined}):null;
  return {applied:true,kind:e.kind,id:e.id,posted:Boolean(row),...(row?{quest:row.id}:{reason:'出资方出不起或已有同源委托'})};
 },
});
