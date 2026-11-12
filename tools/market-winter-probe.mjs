// 价格倍数整类去除只读探针（MKTW 整类卡第一步；李白 11-11 决定 06a7602d、16:5x 扩大、17:0x 事件 15b5a4ea 调整）。
// 目的：同一世界里取"平时（秋）"与"冬季"、不同粮仓缺口程度，输出干粮类物品的价格、供给、需求、供需比与成交价，
// 输出连续购买时每件的涨幅与深度项；并对各类手写倍数（冬荒、旱情、洪水、青黄不接粮价钟、疫病药草、周贸易季节系数）做"有/无倍数"对比。
// 只读：不写盘、不开服务器、不调模型、不 import 任何测试文件；所有改动只在内存里的文档与世界副本上。
//
// 用法（门禁不收以"-"开头的参数，所以只用情形名）：node tools/market-winter-probe.mjs <情形名> [<情形名> ...]
//   无参数：只打印可用情形列表与各自预计推进天数、估算时长，不跑任何情形。
//   输出为 JSON Lines：每完成一个对照点（一个矩阵格、一件购买、一个游戏日读数、一个季节读数）立即 console.log 一行，
//   中途超时也留下已完成部分。行的 kind：start（情形开始，含估算）、cell、buy、day（情形逐日读数，含 mode）、season、transport、sowcheck、harvestdone、meta（情形摘要）、modeDiff（仅待替换项 spring/epidemic/flood 的本名情形）、done、error。
//   每行都带 case（情形名）。v8 的 R5② 配对（without 与 noclock）由离线按（聚落、level、phase、物品）完成，行里带 mode、famineStages、clocksRemoved。
//
// 日历：种子在元年雨月 1 日（日历季节 0 = 春）；日历季节 = floor(月序/3)，0 春 1 夏 2 秋 3 冬；冬荒钟 seasons:[3]，从每年第 270 日起每 7 天一个 tick；seasonFactors 下标即日历季节。
// 时间口径：云上实测完整世界约 1 到 2 分钟/游戏日。从种子日期到各目标季节，真实推进要 450 到 630 天（十几小时以上），云上跑不完，
// 所以到达目标季节的"长跳"用 skipTo（直接设分钟，势力日钟对齐，灾害时钟的上次评估日置为前一天），行里标 jumped:true；
// 跳后粮仓由 setGranary 设定，灾害时钟记录从空开始，之后的逐日推进全部是真实的 world_time。冬格也 skipTo 到第二年冬第 630 日（旧版误用种子后 2 天，那是雨月 3 日）。
// 长跳的取舍已在汇报中说明：它改变了"农事自然演化"，但本探针每个情形都自己设定粮仓并只看紧接着的几天，不依赖跳过的那段农事。
//
// 冻结规则 v8（F:/dnd-tmp/mktw/冻结规则.md）+ 情形清单 cases-v8.txt（58 个情形，参数名 = 情形名，各自单独运行）：
//   [yupo-]<winter|autumn>-without-<level>：level ∈ 1.5,1.0,0.75,0.6,0.4,0.2,0.05（C1，同世界不同池 cov）；skipTo 到冬第 630 日 / 秋第 545 日 + 真实推进 8 天
//   [yupo-]winter-noclock-<level>：level ∈ 1.0,0.6,0.2（C2，该聚落冬荒钟及 hazard_phase 传递闭包整段移除）
//   drought-without、drought-noclock：C3，旱情钟有/无；第 364 日 600 分钟开局，观测期读钟复位或收割、上限第 719 日
//   flood-with、flood-without、flood、flood-control；spring[-bs]-with/-without/本名；epidemic-with/-without/本名：同 v7
//   season-without；buys-1.0、buys-0.75；famine-hw-without；bs-tight、bs-tight-noloc_bs；zero-hold-hw、tiny-hold-hw；transport-coverage
// 单个情形耗时的估计见 start 行 estimate；drought 两个与 bs-tight 两个预计超过 8 分钟（见汇报）。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {marketSupply,marketQuote,marketGrade,scarcityIntegral,goodsClass,goodsWeight} from '../server-plugin/market.mjs';
import {regionalTradeBase,regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {hazardPriceFactor,famineAt,pureHazardFires} from '../server-plugin/hazard-calendar.mjs';
import {unitFreight} from '../server-plugin/transport.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
import transportBalance from '../world/rules/tables/balance/transport.json' with {type:'json'};
import {mealMouthsOf} from '../server-plugin/primitives-body.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {tradeQuote,shopOfKeeper} from '../server-plugin/shop.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {factionClockRules} from '../server-plugin/faction-clock.mjs';
import {forestWaterPriceFactor} from '../server-plugin/agriculture.mjs';
import {magicPriceFactor} from '../server-plugin/magic-economy.mjs';

const DAY=1440,INN='bld_hw_qingdeng',KEEPER='npc_hw_linsui',HW='loc_hw',YP='loc_bs_yupo';
const ITEMS=['item_ration','item_oat_flatbread','item_bread','item_oats'];
const LEVELS=[1.5,1.0,0.75,0.6,0.4,0.2,0.05],NOCLOCK_LEVELS=[1.0,0.6,0.2],ADVANCE=8,BUYS=10,CASEDAYS=6;
// v8：默认世界不再剥任何类（价格倍数与季节系数已从实现里删除）；只有待替换项与洪水对照显式传类。
const STRIP_DEFAULT=[];
// C2 写定的闭包清单（冻结规则名词 C2）：探针运行时按 hazard_phase 传递闭包重算并与这里核对，不一致输出 closureMatches:false（探针缺陷）。
const EXPECTED_CLOSURE={'famine:loc_hw':['famine:loc_hw','famine:loc_ms_taideng'],'famine:loc_bs_yupo':['famine:loc_bs_yupo','famine:loc_ms_yugen'],'famine:loc_bs':['famine:loc_bs','famine:loc_ms_tanjie']};
// transport-coverage（冻结规则"档位与参数"）：物品 × 目的聚落。
const TRANSPORT_ITEMS=['item_ration','item_cooking_pot','item_pottery_wheel','item_iron'],TRANSPORT_PLACES=['loc_hw','loc_bs_yupo','loc_bs'];
const world0=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
const legacy={state:seed.state,memories:seed.memories};
const errorOf=e=>({message:String(e?.message??e),code:e?.code??null});
const emit=obj=>console.log(JSON.stringify(obj,(k,v)=>typeof v==='bigint'?v.toString():v));

// ---------------------------------------------------------------- 工具
const classOf=id=>id.startsWith('famine:')?'winter':id==='price:loc_bs_liquan'?'drought':id.startsWith('price:')?'spring':id.startsWith('flood:')?'flood':id.startsWith('epidemic:')?'epidemic':'other';
// 内存世界副本：按类去掉 price_shift（阶段因此没有任何效果的整段去掉；整个钟的阶段全被剥光则整钟去掉，不留 stages 为空的无效钟）；
// winter 类若世界里仍有 famine:loc_bs 的 tight 阶段则整段删除（MKTW 实现后数据里已没有，此时不动作）；seasonfactor 类把 seasonFactors 置 1（实现后表里已无该字段，此时 seasonFactorsReset 为 false、seasonFactorsRemoved 为 true）；closure 类只给洪水对照用。
function strip(w,classes){
 let removed=0;const stagesDeleted=[];
 for(const clock of w.rules.hazardClock?.clocks??[]){
  const cls=classOf(clock.id);if(!classes.includes(cls))continue;
  if(cls==='winter'&&clock.id==='famine:loc_bs'){const i=clock.stages.findIndex(s=>s.id==='tight');if(i>=0){removed+=(clock.stages[i].effects??[]).filter(e=>e.kind==='price_shift').length;clock.stages.splice(i,1);stagesDeleted.push(`${clock.id}:tight`);}}
  for(const stage of clock.stages??[]){
   const before=stage.effects?.length??0;
   stage.effects=(stage.effects??[]).filter(e=>e.kind!=='price_shift');
   removed+=before-stage.effects.length;
  }
  // 阶段只剩 price_shift 时去掉后成空 effects，规则校验拒绝（seasonal-hazards.mjs:179，drought-without/spring-without 第 1 天报错的原因）；这类阶段都在钟尾（旱情 rain、青黄不接 ease、疫病回落），整段去掉不改前面阶段的序号。
  while(clock.stages.length&&!clock.stages.at(-1).effects.length){stagesDeleted.push(`${clock.id}:${clock.stages.at(-1).id}:emptied`);clock.stages.pop();}
 }
 // 阶段全被剥光的钟没有任何可推进的内容，规则校验会拒绝（stages 为空），整钟去掉（只去被剥的类；被别的钟用 hazard_phase 引用的不动，让校验把问题报出来）。
 if(w.rules.hazardClock){
  const referenced=new Set();
  const walk=c=>{if(c?.kind==='all')c.conditions.forEach(walk);else if(c?.kind==='hazard_phase')referenced.add(c.clock);};
  for(const clock of w.rules.hazardClock.clocks??[])for(const s of clock.stages??[])walk(s.condition);
  w.rules.hazardClock.clocks=(w.rules.hazardClock.clocks??[]).filter(clock=>{
   if(!classes.includes(classOf(clock.id))||clock.stages.length||referenced.has(clock.id))return true;
   stagesDeleted.push(`${clock.id}:clock_emptied`);return false;
  });
 }
 if(classes.includes('closure'))for(const clock of w.rules.hazardClock?.clocks??[]){
  if(!clock.id.startsWith('flood:'))continue;
  for(const stage of clock.stages??[]){const before=stage.effects?.length??0;stage.effects=(stage.effects??[]).filter(e=>e.kind!=='route_closure');stagesDeleted.push(`${clock.id}:${stage.id}:route_closure×${before-stage.effects.length}`);}
 }
 let seasonFactorsReset=false;
 if(classes.includes('seasonfactor')&&w.rules.settlementTrade?.seasonFactors){w.rules.settlementTrade.seasonFactors=w.rules.settlementTrade.seasonFactors.map(()=>1);seasonFactorsReset=true;}
 return {removed,stagesDeleted,seasonFactorsReset,seasonFactorsRemoved:!w.rules.settlementTrade?.seasonFactors};
}
function buildWorld(withShift,classes=STRIP_DEFAULT){
 const w=structuredClone(world0);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const stripped=withShift?{removed:0,stagesDeleted:[],seasonFactorsReset:false,seasonFactorsRemoved:!w.rules.settlementTrade?.seasonFactors}:strip(w,classes);
 let shiftCount=0;
 for(const clock of w.rules.hazardClock?.clocks??[])for(const stage of clock.stages??[])shiftCount+=(stage.effects??[]).filter(e=>e.kind==='price_shift').length;
 return {w,...stripped,shiftCount,strippedClasses:withShift?[]:classes};
}
// hazard_phase 传递闭包（seasonal-hazards.mjs:159 校验：前置钟必须存在，缺失即 throw）：移除钟 X 时，凡通过 hazard_phase 引用 X 的钟、及引用它们的钟，一并移除。
function hazardRefs(stage){const out=new Set(),walk=c=>{if(c?.kind==='all')c.conditions.forEach(walk);else if(c?.kind==='hazard_phase')out.add(c.clock);};walk(stage.condition);return out;}
function closureOf(w,id){
 const clocks=w.rules.hazardClock?.clocks??[],set=new Set([id]);
 for(let grew=true;grew;){grew=false;for(const c of clocks){if(set.has(c.id))continue;if(c.stages.some(s=>[...hazardRefs(s)].some(r=>set.has(r)))){set.add(c.id);grew=true;}}}
 return [...set].sort();
}
// 闭包报告（只记录）：闭包内每个钟、每个阶段的 effect 种类与对象（原样列出效果的非大字段）。
function closureReport(w,ids){
 return ids.map(id=>{const c=(w.rules.hazardClock?.clocks??[]).find(r=>r.id===id);return {clock:id,stages:(c?.stages??[]).map(s=>({stage:s.id,effects:(s.effects??[]).map(e=>({kind:e.kind,detail:Object.fromEntries(Object.entries(e).filter(([k,v])=>k!=='kind'&&(typeof v!=='object'||v===null)))}))}))};});
}
const sameSet=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
async function step(ctx,tool,args,eventId){
 const out=await ctx.engine.reduce(ctx.doc,{tool,args,eventId});
 ctx.doc=applyPatches(ctx.doc,out.patches);
 return out.result;
}
async function attempt(ctx,tool,args,eventId){
 const row={tool,args};
 try{row.result=await step(ctx,tool,args,eventId);row.ok=true;}catch(e){row.ok=false;row.error=errorOf(e);}
 return row;
}
// 长跳：直接设分钟（势力日钟对齐下一边界；带 lastDay 的记录置为前一天，避免灾害/农事日结按天补算）。
function skipTo(engine,doc,minute){
 doc.state.minute=minute;
 for(const rule of factionClockRules(engine)){
  const key=Object.keys(doc.state.records??{}).find(k=>doc.state.records[k]?.category==='faction_clock'&&doc.state.records[k].id===rule.id);
  if(!key)continue;const row=doc.state.records[key];
  if(row.nextAt<minute)doc.state.records[key]={...row,nextAt:Math.ceil(minute/DAY/rule.intervalDays)*rule.intervalDays*DAY};
 }
 for(const row of Object.values(doc.state.records??{}))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(minute/DAY)-1;
}
// 到达目标分钟：差距 ≤20 天用真实 world_time（每步至多 30 天）；更远用 skipTo 并记 ctx.jumped。失败标 fixtureUntrusted。
async function advanceTo(ctx,minute,tag='adv'){
 if(minute-ctx.doc.state.minute>20*DAY){skipTo(ctx.engine,ctx.doc,minute);ctx.jumped=true;return true;}
 let i=0;
 while(ctx.doc.state.minute<minute){
  const m=Math.min(30*DAY,minute-ctx.doc.state.minute);
  const r=await attempt(ctx,'world_time',{minutes:m},`probe-${tag}-${i++}`);
  if(!r.ok){ctx.fixtureUntrusted={at:ctx.doc.state.minute,error:r.error};return false;}
 }
 return true;
}
function setGranary(engine,doc,sid,quantity){
 const r=doc.state.records?.[`agriculture:${sid}`],s=doc.state.settlements?.[sid],day=Math.floor(doc.state.minute/DAY);
 if(!r||!s)return false;
 s.food=quantity;
 r.batches=quantity?[{id:'probe_stock',kind:'grain',amount:quantity,harvestDay:day-30,expiresDay:day+400,source:'probe in-memory granary'}]:[];
 if(r.ledger){r.ledger.openingFood=quantity;r.ledger.freshProduced=0;r.ledger.eaten=0;r.ledger.spoiled=0;r.ledger.overflow=0;}
 if(doc.ledger)doc.ledger=openLedger(engine,doc);
 return true;
}
const reserveDaysOf=(engine,sid)=>engine.rules.agriculture.settlements.find(p=>p.settlement===sid)?.reserveDays??1;
const mouthsOf=(engine,doc,sid)=>Math.ceil(mealMouthsOf(engine,doc.state,sid,doc.state.settlements[sid].population));
const draftOf=(engine,doc)=>engine.primitiveDraft(doc);
const GRAIN=engine=>engine.rules.economy.shops.stockItems.food;
// 池 = 可食池（goods:food）；持有量与目标都按饱腹单位计：件数 × goodsWeight。
const poolItemsOf=engine=>{const g=goodsClass(engine,GRAIN(engine));return engine.world.items.filter(i=>goodsClass(engine,i.id)===g);};
const quoteOf=(d,engine,item,location,extra={})=>marketQuote(d,engine,{item,location,seller:null,buyer:'player',quantity:1,base:regionalTradeBase(d,engine,item,location),...extra});
// 池的持有与目标（饱腹单位），取自一次引擎报价的返回（q.supply 含已担保远期，q.spotSupply 是实物）。
function poolNumbers(engine,doc,sid){
 const d=draftOf(engine,doc),q=quoteOf(d,engine,GRAIN(engine),sid),w=goodsWeight(engine,GRAIN(engine));
 return {target:q.demand*w,held:q.supply*w,heldSpot:(q.spotSupply??q.supply)*w};
}
// 夹具：池 cov = level。粮仓持有（饱腹）= level × 池目标 − 粮仓以外的池内持有，下限 0（先把粮仓设 0 读其它持有）。
function setPoolCoverage(engine,doc,sid,level){
 const w=goodsWeight(engine,GRAIN(engine));
 setGranary(engine,doc,sid,0);
 const {target,held}=poolNumbers(engine,doc,sid),granarySatiety=Math.max(0,level*target-held);
 return {set:setGranary(engine,doc,sid,Math.round(granarySatiety/w)),granarySatiety,otherHold:held,target};
}
// 空持有夹具（R10）：本聚落全部可知持有清零——居民（含经营者、玩家）背包里的池内货物清零，粮仓设 satiety 个饱腹单位（0 或 1）。
function setPoolHold(engine,doc,sid,satiety){
 const ids=new Set(poolItemsOf(engine).map(i=>i.id)),here=loc=>placeSettlement(engine,doc.state,loc).value===sid;
 const holders=[doc.state.player,...Object.values(doc.state.npcs??{}),...Object.values(doc.state.creatures??{})].filter(h=>h&&here(h.location));
 let cleared=0;
 for(const h of holders)for(const id of ids)if(h.inventory?.[id]){delete h.inventory[id];cleared++;}
 const set=setGranary(engine,doc,sid,satiety/goodsWeight(engine,GRAIN(engine)));
 return {set,cleared,granarySatiety:satiety};
}
const num=v=>typeof v==='number'?v:0;
// 与引擎同一方向与公式（market.mjs:359、367）：积分区间按报价 side 选——卖出侧 (supply−count, supply)，买入侧 (supply, supply+count)。
const curveInterval=(q,limits,count)=>q.side==='sell'?scarcityIntegral(q,limits,Math.max(0,q.supply-count),q.supply):scarcityIntegral(q,limits,q.supply,q.supply+count);
// 价差的目录/规则派生值：无 business 为 1；有 business 卖出侧 = clamp(店 markup, shop 限位)；其余 = rules 的 spread.buy。
function spreadExpectedOf(engine,state,q){
 if(!q.business)return 1;
 if(q.side!=='sell')return engine.world.marketRules.spread.buy;
 const lim=engine.rules.economy.priceFactorLimits.shop,m=shopOfKeeper(engine,q.business,state)?.markup;
 return Math.min(Math.max(m,lim[0]),lim[1]);
}
function transportInputs(engine,doc,d,item,sid){
 const def=engine.byId.get(item),limits=engine.rules.economy.priceFactorLimits.transport,rate=transportBalance.rows.find(r=>r.key==='carrier:pack').rate;
 const origin=def.origin??null,from=origin?placeSettlement(engine,doc.state,origin).value:null,seed=d.get('randomSeed');
 const billableKg=Math.max(def.weight,(def.volumeM3??def.weight/250)*250,1),months=[];
 if(from&&from!==sid)for(let m=0;m<12;m++){
  try{const r=engine.route(from,sid,'walk',m*30*DAY,seed),km=r.edges.map(id=>engine.world.routes.find(e=>e.id===id).lengthKm);
   months.push({month:m,edges:r.edges,km,routeCost:r.cost??0,cost:km.reduce((n,k)=>n+k*billableKg*rate,0)+(r.cost??0)});}
  catch(e){months.push({month:m,error:errorOf(e)});}
 }
 const ok=months.filter(r=>r.cost!==undefined),best=ok.length?ok.reduce((a,b)=>b.cost<a.cost?b:a):null;
 let engineUnit=null,engineError=null;try{engineUnit=unitFreight(d,engine,{item,to:sid});}catch(e){engineError=errorOf(e);}
 const catalogBase=def.basePrice,unit=best?best.cost:0,expected=Math.min(Math.max(1+unit/catalogBase,limits[0]),limits[1]);
 return {item,settlement:sid,origin,originSettlement:from,weightKg:def.weight,volumeM3:def.volumeM3??null,billableKg,packRate:rate,months,chosenMonth:best?.month??null,routeKm:best?.km??null,routeCost:best?.routeCost??null,unitFreightFromInputs:unit,
  catalogBase,limitsTransport:limits,transportFromInputs:expected,clamped:1+unit/catalogBase!==expected,unitFreightEngine:engineUnit,unitFreightError:engineError,
  transportFromEngineUnit:engineUnit===null?null:Math.min(Math.max(1+engineUnit/catalogBase,limits[0]),limits[1])};
}
function itemView(engine,doc,item,location){
 try{
  const d=draftOf(engine,doc),limits=engine.rules.economy.priceFactorLimits.region,w=goodsWeight(engine,item);
  const base=regionalTradeBase(d,engine,item,location),q=quoteOf(d,engine,item,location),x=q.explanation??{};
  // 持有量取自同一次报价的返回（q.supply、q.demand），换算成饱腹单位（× 池内权重）；不由探针重算。
  const holdTarget=q.demand*w,holdActual=q.supply*w,divZeroCapped=!(q.supply>0),ratio=q.demand/Math.max(1,q.supply);
  // 与引擎同一公式（含分母保护 max(1,supply)，market.mjs 的比值计算）；供给为 0 按 scarcityCap；无保护的纯比值另列。
  const scarcityRaw=divZeroCapped?limits[1]:q.demand/Math.max(1,q.supply),scarcityRawUnprotected=divZeroCapped?null:holdTarget/holdActual,integral=curveInterval(q,limits,1),ratioClamped=Math.min(Math.max(ratio,limits[0]),limits[1]);
  const catalogBase=engine.byId.get(item).basePrice,hazardFactor=hazardPriceFactor(engine,doc.state,item,location),magicFactor=magicPriceFactor(engine,doc.state,item,location),forestWaterFactor=forestWaterPriceFactor(engine,doc.state,item,location,d);
  const environmentFactors=hazardFactor*magicFactor*forestWaterFactor,tin=transportInputs(engine,doc,d,item,location);
  const contributions={value:x.value?.contributions??[],price:x.price?.contributions??[]},additiveSum=[...contributions.value,...contributions.price].filter(c=>c.stage==='add').reduce((n,c)=>n+num(c.value),0);
  const rm=engine.world.marketRules,depthNet=q.opening>1?q.opening-Math.max(1,q.spotSupply??q.supply):0;
  return {item,goods:goodsClass(engine,item),poolWeight:w,supply:q.supply,spotSupply:q.spotSupply,demand:q.demand,ratio,ratioClamped,
   holdTarget,holdActual,holdActualSpot:(q.spotSupply??q.supply)*w,scarcityRaw,scarcityRawUnprotected,scarcityIntegralOne:integral,divZeroCapped,atTop:ratio>=limits[1],atFloor:ratio<=limits[0],
   catalogBase,environment:x.environment,environmentFactors,regionalBase:base,transport:base/(catalogBase*(environmentFactors||1)),transportInputs:tin,
   scarcity:x.scarcity,listPrice:q.listPrice,relPrice:q.listPrice/base,relation:x.relation,
   explanationParts:{baseline:x.baseline,environment:x.environment,scarcity:x.scarcity,quality:x.quality,depth:x.depth,spread:x.spread,relation:x.relation,curve:x.curve,count:q.quantity,rounding:x.rounding,contributionsEmpty:{value:!contributions.value.length,price:!contributions.price.length}},
   contributions,additiveSum,
   qualityExpected:marketGrade(engine,d.document??{state:doc.state},item,{seller:null,quantity:1}),spreadExpected:spreadExpectedOf(engine,d.get('state'),q),depthExpected:Math.max(0,1+rm.depthImpact*depthNet/Math.max(1,q.opening)),
   hazardFactor,magicFactor,forestWaterFactor,regionalTradePrice:regionalTradePrice(d,engine,item,location)};
 }catch(e){return {item,error:errorOf(e)};}
}
// 池覆盖率 = Σ holdActual ÷ Σ holdTarget（同一可食池、饱腹单位）。
const poolCoverageOf=items=>{const ok=items.filter(i=>!i.error);const a=ok.reduce((n,i)=>n+i.holdActual,0),t=ok.reduce((n,i)=>n+i.holdTarget,0);return t>0?a/t:null;};
function granaryView(engine,doc,sid){
 const s=doc.state.settlements?.[sid];if(!s)return {settlement:sid,note:'没有聚落钱粮账'};
 let mouths=null,reserve=null;try{mouths=mouthsOf(engine,doc,sid);reserve=reserveDaysOf(engine,sid);}catch(e){return {settlement:sid,food:s.food,error:errorOf(e)};}
 const clock=doc.state.records?.[`hazard-clock:famine:${sid}`],price=doc.state.records?.[`hazard-price:${sid}`];
 return {food:s.food,population:s.population,mouths,reserveDays:reserve,reserveTarget:mouths*reserve,coverageOfReserve:s.food/Math.max(1,mouths*reserve),daysOfFood:s.food/Math.max(1,mouths),
  starvation:s.starvation??0,famineActive:Boolean(famineAt(doc.state,sid)),famineStages:clock?.history?.map(h=>h.stage)??null,famineClockHistory:clock?.history??null,
  priceShifts:price?Object.fromEntries(Object.entries(price.shifts??{}).map(([k,v])=>[k,{factor:v.factor,items:v.items??null,reason:v.reason}])):null};
}
const clockStages=(doc,id)=>doc.state.records?.[`hazard-clock:${id}`]?.history?.map(h=>h.stage)??null;
// 阶段史原样（含每次进入的 minute 与阶段 id，不截断）。
const clockHistory=(doc,id)=>doc.state.records?.[`hazard-clock:${id}`]?.history??null;
const modeName=(withShift,control)=>control?'control':withShift?'with':'without';

// ---------------------------------------------------------------- 1. 季节 × 缺口 矩阵格（一个调用一格）
// 只保留 famine:<聚落> 一个时钟。冬 = 种子后真实推进 2 天进冬；平时 = skipTo 到第二年秋（第 545 日）。设好粮仓后真实推进 ADVANCE 天。
// v8：mode = without（默认世界，只留该聚落冬荒钟及其依赖闭包，其余钟去掉以隔离）或 noclock（C2：该钟及闭包整段移除，其余与 without 相同）。
// opts.fixture：'zero'|'tiny'（R10，池内全部可知持有清零 / 设为 1 个饱腹单位，只读 before-advance）。
async function cellRun(name,mode,season,level,sid,opts={}){
 const b=buildWorld(true),w=b.w,clockId=`famine:${sid}`;
 const closure=closureOf(w,clockId),keep=new Set(closure);
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>keep.has(r.id));
 const clocksRemoved=mode==='noclock'?closure:[];
 if(mode==='noclock')w.rules.hazardClock.clocks=[];
 const closureMatches=EXPECTED_CLOSURE[clockId]?sameSet(closure,EXPECTED_CLOSURE[clockId]):null;
 let engine;
 try{engine=new WorldEngine(w);}catch(e){emit({kind:'error',case:name,mode,constructFailed:true,verdict:'对照不可构造',clocksRemoved,error:errorOf(e),validation:String(e?.message??e)});return [];}
 const doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 // 日历季节 = floor(月序/3)：0 春、1 夏、2 秋、3 冬（冬荒钟 seasons:[3] = 霜月起）。种子在元年雨月 1 日，旧"冬"格（种子后 2 天）其实是雨月 3 日（春），冬荒钟从不运行；
 // 现改为第二年冬第 630 日（霜月 1 日）；其 00:00 的首个 tick 被 skipTo 越过，之后 637 日有 tick。秋 = 第 545 日（穗月）。
 const reached=await advanceTo(ctx,(season==='winter'?630*DAY:545*DAY)+600,season);
 const fixture=opts.fixture==='zero'?setPoolHold(engine,ctx.doc,sid,0):opts.fixture==='tiny'?setPoolHold(engine,ctx.doc,sid,1):setPoolCoverage(engine,ctx.doc,sid,level);
 const set=fixture.set;
 const head={kind:'cell',case:name,mode,control:mode==='noclock'?'C2':'C1',settlement:sid,season,level:opts.fixture?(opts.fixture==='zero'?0:null):level,fixture:opts.fixture??'coverage',pairKey:`${sid}|${season}|${level}`,strippedClasses:[],stripped:0,stagesDeleted:[],
  seasonFactorsRemoved:b.seasonFactorsRemoved,priceShiftEffectsInWorld:b.shiftCount,clocksRemoved,closure,closureMatches,granarySet:set,fixtureDetail:fixture,jumped:ctx.jumped??false};
 const rows=[];
 const out=row=>{rows.push(row);emit(row);};
 const snap=extra=>{const items=ITEMS.map(i=>itemView(engine,ctx.doc,i,sid));return {...head,...extra,seasonIndex:engine.calendar(ctx.doc.state.minute).season,calendar:engine.calendar(ctx.doc.state.minute).text,minute:ctx.doc.state.minute,
  poolCoverage:poolCoverageOf(items),granary:granaryView(engine,ctx.doc,sid),famineStages:{[clockId]:clockStages(ctx.doc,clockId)},items};};
 out(snap({phase:'before-advance',fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'})}));
 if(opts.fixture)return rows;
 const adv=await attempt(ctx,'world_time',{minutes:ADVANCE*DAY},'probe-advance');
 out(snap({phase:'after-advance',fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),advance:{days:ADVANCE,ok:adv.ok,error:adv.error}}));
 return rows;
}
// R5② 的 without/noclock 配对由离线按（聚落、level、phase、物品）完成（两个情形各自单独输出，行里带 mode 与 famineStages）。

// ---------------------------------------------------------------- 2. 连续购买逐件涨幅（含深度项），每件立即输出
// v8 R6：同世界连续购买序列（池 cov = level，bread 与 ration 各连续购买 BUYS 件）；每行带购买前后的持有（τ 的输入）与逐项乘性/加性分量。
async function buyRun(name,level){
 for(const item of ['item_bread','item_ration']){
  const b=buildWorld(true),w=b.w;
  w.rules.hazardClock.clocks=[];
  w.npcs.find(n=>n.id===KEEPER).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
  const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
  const reached=await advanceTo(ctx,545*DAY+540,'buy');
  ctx.doc.state.location=INN;Object.assign(ctx.doc.state.npcs[KEEPER],{goals:{},trust:20,activity:'营业',location:INN});ctx.doc.state.player.coins=100000;
  await attempt(ctx,'world_act',{action:'core:time',slots:{minutes:1}},'probe-prime');
  const fixture=setPoolCoverage(engine,ctx.doc,HW,level),set=fixture.set;
  const limits=engine.rules.economy.priceFactorLimits.region,clampR=r=>Math.min(Math.max(r,limits[0]),limits[1]),w0=goodsWeight(engine,item),rm=engine.world.marketRules;
  const view=()=>{try{
    const d=draftOf(engine,ctx.doc),s=marketSupply(d,engine,item,INN);
    const q=tradeQuote(d,engine,{buyer:'player',seller:KEEPER,item,quantity:1,location:INN,base:()=>regionalTradeBase(d,engine,item,INN)*wildlifePriceFactor(engine,d.document,item,INN)}),x=q.explanation??{};
    const ratio=s.demand/Math.max(1,s.supply),holdTarget=q.demand*w0,holdActual=q.supply*w0,divZeroCapped=!(q.supply>0);
    const contributions={value:x.value?.contributions??[],price:x.price?.contributions??[]},additiveSum=[...contributions.value,...contributions.price].filter(c=>c.stage==='add').reduce((n,c)=>n+num(c.value),0);
    const depthNet=q.opening>1?q.opening-Math.max(1,q.spotSupply??q.supply):0;
    return {supply:s.supply,spotSupply:s.spotSupply,demand:s.demand,ratio,ratioClamped:clampR(ratio),atFloor:ratio<=limits[0],atTop:ratio>=limits[1],opening:q.opening,depth:x.depth,scarcity:x.scarcity,
     holdTarget,holdActual,poolCoverage:holdTarget>0?holdActual/holdTarget:null,scarcityRaw:divZeroCapped?limits[1]:q.demand/Math.max(1,q.supply),scarcityRawUnprotected:divZeroCapped?null:holdTarget/holdActual,scarcityIntegralOne:curveInterval(q,limits,1),scarcityIntegralCount:curveInterval(q,limits,q.quantity),side:q.side,divZeroCapped,net:depthNet,poolWeight:w0,
     qualityExpected:marketGrade(engine,d.document??{state:ctx.doc.state},item,{seller:null,quantity:1}),spreadExpected:spreadExpectedOf(engine,d.get('state'),q),depthExpected:Math.max(0,1+rm.depthImpact*depthNet/Math.max(1,q.opening)),
     quotedListPrice:q.listPrice,quotedExactTotal:q.exactTotal,count:q.quantity,curve:x.curve,curveAvgScarcity:x.curve/q.quantity,pointScarcity:x.scarcity,
     // 价格公式里 value、price 两个槽的加法型修正（explainDerived 的 contributions）与各槽输入输出；additiveSum 为 stage=add 项数值之和。
     valueSlot:x.value?{base:x.value.base,value:x.value.value,contributions:x.value.contributions}:null,priceSlot:x.price?{base:x.price.base,value:x.price.value,contributions:x.price.contributions}:null,contributions,additiveSum,
     explanationParts:{baseline:x.baseline,environment:x.environment,scarcity:x.scarcity,quality:x.quality,depth:x.depth,spread:x.spread,relation:x.relation,curve:x.curve,count:q.quantity,rounding:x.rounding}};}catch(e){return {error:errorOf(e)};}};
  let prev=null,last=null,carry=null;
  for(let k=1;k<=BUYS;k++){
   const pre=carry??view();
   const buy=await attempt(ctx,'world_act',{action:'core:trade.buy',slots:{seller:KEEPER,item,quantity:1}},`probe-buy-${k}`);
   const post=view();carry=post;
   const unit=buy.result?.pricing?.unitPrice??null,list=buy.result?.pricing?.listPrice??null;
   const quotedRise=last&&last.quotedExactTotal>0&&pre.quotedExactTotal!==undefined?pre.quotedExactTotal/last.quotedExactTotal-1:null;
   const expectedRise=last&&last.ratioClamped>0&&last.depth>0&&pre.ratioClamped!==undefined&&pre.depth!==undefined?(pre.ratioClamped/last.ratioClamped)*(pre.depth/last.depth)-1:null;
   emit({kind:'buy',case:name,mode:'without',level,fixtureDetail:fixture,holdBefore:{holdTarget:pre.holdTarget,holdActual:pre.holdActual,poolCoverage:pre.poolCoverage},holdAfter:{holdTarget:post.holdTarget,holdActual:post.holdActual,poolCoverage:post.poolCoverage},poolCoverage:pre.poolCoverage,item,k,ok:buy.ok,error:buy.error,granarySet:set,jumped:ctx.jumped??false,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),
    unitPrice:unit,listPrice:list,cost:buy.result?.cost,pre,unitRiseVsPrev:prev!==null&&unit!==null&&prev>0?unit/prev-1:null,quotedRiseVsPrev:quotedRise,expectedRise,
    consistencyError:quotedRise!==null&&expectedRise!==null?Math.abs(quotedRise-expectedRise):null,
    supplyDelta:last&&pre.supply!==undefined?pre.supply-last.supply:null,demandDelta:last&&pre.demand!==undefined?pre.demand-last.demand:null,depthDelta:last&&pre.depth!==undefined?pre.depth-last.depth:null});
   if(unit!==null)prev=unit;
   last=pre;
   if(!buy.ok)break;
  }
 }
}

// ---------------------------------------------------------------- 3. 其它手写倍数情形（逐日，每天立即输出）
// 夹具：skipTo 到季节第一个 tick 前一天（(360+季*90-1)*DAY+600），之后真实逐日推进 6 天，使钟触发与阶段推进都走真实 tick；只保留该情形的钟、目标季节、间隔 1 天、阶段概率 1、天气条件改 always；疫病情形把 all 条件整体换成 always、epidemic_cases 换成 always
// （不取 all 的第一项，也不把被 hazard_phase 引用的钟过滤成不存在）。spring、epidemic 为"待替换"项，只量大小。
const CASES={
 spring:{label:'春季青黄不接粮价钟（河湾 loc_hw：rise/peak/ease，待替换项）',settlement:'loc_hw',clocks:['price:loc_hw'],season:1,items:ITEMS,level:1.0,strip:['spring']},
 'spring-bs':{label:'春季青黄不接粮价钟（镇 loc_bs，待替换项）',settlement:'loc_bs',clocks:['price:loc_bs'],season:1,items:ITEMS,strip:['spring']},
 // 旱情（C3）：保持原条件（整季触发表由 pureHazardFires 确定），第 364 日 600 分钟开局，池 cov 1.0；见 droughtRun。
 drought:{label:'久晴旱情（泉村 loc_bs_liquan：灾害年与正常年对照 C3）',settlement:'loc_bs_liquan',clocks:['price:loc_bs_liquan'],season:1,items:ITEMS,level:1.0,keepConditions:true,strip:[]},
 flood:{label:'洪水断路（镇 loc_bs：route_closure 与 price 同阶段）',settlement:'loc_bs',clocks:['flood:loc_bs'],season:1,items:ITEMS,strip:['flood']},
 epidemic:{label:'疫病药草（河湾 loc_hw：cases、spread 条件整体强制成立；待替换项）',settlement:'loc_hw',clocks:['epidemic:loc_hw'],season:1,items:['item_herb','item_ration'],forceCases:true,strip:['epidemic']},
 // R7 famine 阶段日：河湾 famine:loc_hw 保持原条件，缺口 0.4（36 天口粮：小于 90 天为 tight，小于 45 天为 famine），冬第 630 日 tick（tight）、637 日 tick（famine），推进 10 天。
 'famine-hw':{label:'冬荒阶段日（河湾 loc_hw，保持原条件；with 的 hazardFactor 应为 tight、famine 阶段配置值）',settlement:'loc_hw',clocks:['famine:loc_hw'],season:3,items:ITEMS,keepConditions:true,level:0.4,days:10,strip:[]},
 'bs-tight':{label:'镇 loc_bs 删除 tight 阶段后缺粮回退检查（famine:loc_bs 与其依赖的 sangban、tanjie 钟，保持原条件；sangban level 0.4）',settlement:'loc_bs',clocks:['famine:loc_bs','famine:loc_bs_sangban','famine:loc_ms_tanjie'],season:3,items:ITEMS,keepConditions:true,sangbanLevel:0.4,strip:[],extraSettlements:['loc_bs_sangban','loc_ms_tanjie']},
 // R9 ④ 的 C2 特例：同上，但 famine:loc_bs 及其 hazard_phase 闭包（famine:loc_ms_tanjie）整段移除。
 'bs-tight-noloc_bs':{label:'镇 loc_bs 冬荒钟及闭包整段移除（C2 特例，R9 ④）',settlement:'loc_bs',clocks:['famine:loc_bs','famine:loc_bs_sangban','famine:loc_ms_tanjie'],season:3,items:ITEMS,keepConditions:true,sangbanLevel:0.4,strip:[],extraSettlements:['loc_bs_sangban','loc_ms_tanjie'],removeClock:'famine:loc_bs'},
};
const FLOOD_CONTROL_STRIP=['flood','closure'];
function forceClocks(w,spec){
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>spec.clocks.includes(r.id));
 if(spec.keepConditions)return;
 for(const r of w.rules.hazardClock.clocks){
  r.seasons=[spec.season];r.intervalDays=1;
  for(const s of r.stages){
   s.probability=1;
   if(spec.forceCases&&(s.condition.kind==='all'||s.condition.kind==='epidemic_cases'))s.condition={kind:'always'};
   else if(s.condition.kind==='all')s.condition=s.condition.conditions[0];
   if(s.condition.kind==='weather')s.condition={kind:'always'};
  }
 }
}
// 返回逐日 series 以便调用方算 modeDiff；每个游戏日读数当天输出。
async function caseRun(name,withShift,spec,days,control=false){
 const b=control?buildWorld(false,FLOOD_CONTROL_STRIP):buildWorld(withShift,spec.strip);
 // C2 特例（R9 ④）：先在完整钟表上算该钟的 hazard_phase 传递闭包，再在隔离后的钟表里整段移除。
 const closure=spec.removeClock?closureOf(b.w,spec.removeClock):[];
 forceClocks(b.w,spec);
 if(spec.removeClock)b.w.rules.hazardClock.clocks=b.w.rules.hazardClock.clocks.filter(r=>!closure.includes(r.id));
 const w=b.w,mode=modeName(withShift,control),closureMatches=spec.removeClock&&EXPECTED_CLOSURE[spec.removeClock]?sameSet(closure,EXPECTED_CLOSURE[spec.removeClock]):null;
 let engine;
 try{engine=new WorldEngine(w);}catch(e){emit({kind:'error',case:name,mode,constructFailed:true,verdict:'对照不可构造',clocksRemoved:closure,error:errorOf(e),validation:String(e?.message??e)});return [];}
 const doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 const target=spec.startMinute??(360+spec.season*90-1)*DAY+600;
 const reached=await advanceTo(ctx,target,'case');
 const fixtures={};
 if(spec.level!==undefined)fixtures[spec.settlement]=setPoolCoverage(engine,ctx.doc,spec.settlement,spec.level);
 if(spec.sangbanLevel!==undefined)fixtures.loc_bs_sangban=setPoolCoverage(engine,ctx.doc,'loc_bs_sangban',spec.sangbanLevel);
 const granarySet=Object.keys(fixtures).length?Object.fromEntries(Object.entries(fixtures).map(([k,v])=>[k,v.set])):null;
 emit({kind:'meta',case:name,mode,label:spec.label,settlement:spec.settlement,clocks:spec.clocks,strippedClasses:b.strippedClasses,stripped:b.removed,stagesDeleted:b.stagesDeleted,priceShiftEffectsInWorld:b.shiftCount,seasonFactorsRemoved:b.seasonFactorsRemoved,
  clocksRemoved:closure,closure:spec.removeClock?closure:undefined,closureMatches,granarySet,fixtureDetail:fixtures,jumped:ctx.jumped??false,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'})});
 const series=[];
 const snap=day=>{const items=spec.items.map(i=>itemView(engine,ctx.doc,i,spec.settlement));const s={kind:'day',case:name,mode,day,calendar:engine.calendar(ctx.doc.state.minute).text,granary:granaryView(engine,ctx.doc,spec.settlement),
  poolCoverage:poolCoverageOf(items),
  extraGranary:(spec.extraSettlements??[]).map(x=>({settlement:x,...granaryView(engine,ctx.doc,x)})),
  extraItems:Object.fromEntries((spec.extraSettlements??[]).map(x=>[x,ITEMS.map(i=>itemView(engine,ctx.doc,i,x))])),
  clocks:Object.fromEntries(spec.clocks.map(id=>[id,clockStages(ctx.doc,id)])),
  clockHistory:Object.fromEntries(spec.clocks.map(id=>[id,clockHistory(ctx.doc,id)])),
  items,
  epidemic:Object.values(ctx.doc.state.records??{}).filter(r=>r?.category==='epidemic').map(r=>({id:r.id,status:r.status,households:Object.keys(r.households??{}).length}))};
  series.push(s);emit(s);return s;};
 snap(0);
 const total=spec.days??(spec.keepConditions?Math.max(days,20):days);
 for(let d=1;d<=total;d++){const adv=await attempt(ctx,'world_time',{minutes:DAY},`probe-case-${d}`);const s=snap(d);if(!adv.ok){s.advanceError=adv.error;emit({kind:'error',case:name,mode,day:d,error:adv.error});break;}}
 // starvation 非零天数（R9 ④ 报告用）：本聚落与额外聚落逐日 starvation > 0 的天数。
 const starving=pick=>series.filter(s=>pick(s)>0).length;
 emit({kind:'meta',case:name,mode,starvationNonzeroDays:{[spec.settlement]:starving(s=>s.granary?.starvation??0),...Object.fromEntries((spec.extraSettlements??[]).map(x=>[x,starving(s=>s.extraGranary?.find(g=>g.settlement===x)?.starvation??0)]))}});
 return series;
}
// 旱情（R4，C3 灾害年与正常年）：drought-without = 灾害年（钟 price:loc_bs_liquan 保留），drought-noclock = 正常年（该钟及 hazard_phase 闭包整段移除）；
// 同聚落、同种子、同日历、同初始持有（池 cov 1.0）。开局日 = 第 sowDays[0]−1 日 600 分钟（= (sowDays[0] − 1) × DAY + 600，开局年播种窗起点前一天），之后全部真实推进。
// 依据（旧开局 skipTo 到第 364 日不行的原因）：开局种粮批次 expiresDay = initialHarvestDay + protectedStorageDays = −150 + 360 = 210（rules.agriculture.settlements，
// agriculture-migration.mjs seedBatches），跳到第 364 日时种粮已过期、播种（agriculture.mjs sow：需 seed ≤ seedBank）播不下，没有在田批次；
// 开局年播种窗 sowDays [5, 25]（rules.agriculture.crop）整个在 210 之前，所以在播种窗起点前一天落点、真实推进过播种窗，受旱那季作物就在田；成熟日 = 播种日 + growthDays 180。
// 观测窗：受影响批次（播种窗结束后第 1 日 = sowDays[1] + 1 在田的批次）全部收割完（harvestedUnits = areaUnits）之后再 8 天（= 钟 intervalDays），且不超过该农事年末第 359 日。
// 每天输出：天气、四物品持有与价格、聚落粮仓、在田批次（sownDay、readyDay、areaUnits、harvestedUnits）与农事记录 mode、钟阶段史；整年触发表由 pureHazardFires 预算。
async function droughtRun(name,noclock){
 const spec=CASES.drought,mode=noclock?'noclock':'without',sid=spec.settlement,clockId=spec.clocks[0],b=buildWorld(true),w=b.w;
 const closure=closureOf(w,clockId),ruleSource=structuredClone(w.rules.hazardClock.clocks.find(r=>r.id===clockId));
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>spec.clocks.includes(r.id)&&!(noclock&&closure.includes(r.id)));
 let engine;
 try{engine=new WorldEngine(w);}catch(e){emit({kind:'error',case:name,mode,constructFailed:true,verdict:'对照不可构造',clocksRemoved:noclock?closure:[],error:errorOf(e),validation:String(e?.message??e)});return;}
 const doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc},crop=engine.rules.agriculture.crop,startMinute=(crop.sowDays[0]-1)*DAY+600,sowCheckDay=crop.sowDays[1]+1,capDay=359;
 const reached=await advanceTo(ctx,startMinute,'drought');
 const fixture=setPoolCoverage(engine,ctx.doc,sid,spec.level),seed=draftOf(engine,ctx.doc).get('randomSeed'),year=Math.floor(startMinute/DAY/360);
 let fires=null,firesError=null;try{fires=pureHazardFires(engine,seed,ruleSource,year).map(f=>({day:Math.floor(f.minute/DAY),minute:f.minute,phase:f.phase,stage:f.stage}));}catch(e){firesError=errorOf(e);}
 emit({kind:'meta',case:name,mode,control:'C3',label:spec.label,settlement:sid,clocks:noclock?[]:spec.clocks,clocksRemoved:noclock?closure:[],stripped:0,stagesDeleted:[],priceShiftEffectsInWorld:b.shiftCount,seasonFactorsRemoved:b.seasonFactorsRemoved,
  startDay:Math.floor(startMinute/DAY),startMinute,year,firesYear:fires,firesError,D2:fires?.length?fires.at(-1).day:null,intervalDays:ruleSource.intervalDays,affectingMinutes:43200,
  granarySet:fixture.set,fixtureDetail:fixture,jumped:ctx.jumped??false,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'})});
 const cohortsOf=()=>(ctx.doc.state.records?.[`agriculture:${sid}`]?.field?.cohorts??[]).map(c=>({id:c.id,sownDay:c.sownDay,readyDay:c.sownDay+crop.growthDays,areaUnits:c.areaUnits,harvestedUnits:c.harvestedUnits,ready:c.ready,grownDays:c.grownDays}));
 let allDoneAt=null,stop=false;
 while(!stop){
  const day=Math.floor(ctx.doc.state.minute/DAY),items=ITEMS.map(i=>itemView(engine,ctx.doc,i,sid)),cohorts=cohortsOf(),weather=weatherAt(engine,seed,sid,day*DAY+720);
  emit({kind:'day',case:name,mode,day,calendar:engine.calendar(ctx.doc.state.minute).text,weather:weather?.kind??null,weatherDetail:weather??null,poolCoverage:poolCoverageOf(items),granary:granaryView(engine,ctx.doc,sid),
   agriculture:{mode:ctx.doc.state.records?.[`agriculture:${sid}`]?.mode??null,cohorts},clocks:{[clockId]:clockStages(ctx.doc,clockId)},clockHistory:{[clockId]:clockHistory(ctx.doc,clockId)},items});
  if(day===sowCheckDay){emit({kind:'sowcheck',case:name,mode,day,fieldBatches:cohorts.length,verdict:cohorts.length?null:'夹具不足（无在田批次）'});if(!cohorts.length)break;}
  if(allDoneAt===null&&day>sowCheckDay&&cohorts.length&&cohorts.every(c=>c.harvestedUnits>=c.areaUnits)){allDoneAt=day;emit({kind:'harvestdone',case:name,mode,day,cohorts});}
  if(allDoneAt!==null&&day>=allDoneAt+(ruleSource.intervalDays??8))stop=true;
  if(day>=capDay)stop=true;
  if(stop)break;
  const adv=await attempt(ctx,'world_time',{minutes:DAY},`probe-drought-${day}`);
  if(!adv.ok){emit({kind:'error',case:name,mode,day,error:adv.error});break;}
 }
 emit({kind:'meta',case:name,mode,window:{startDay:Math.floor(startMinute/DAY),harvestDoneDay:allDoneAt,endDay:Math.floor(ctx.doc.state.minute/DAY),capDay,sowCheckDay}});
}
// 周贸易季节系数：四个季节各 skipTo 一次只读，每个（季节，买方聚落）立即输出一行。
async function seasonRun(name,withShift){
 const b=buildWorld(withShift,['seasonfactor']),w=b.w;
 w.rules.hazardClock.clocks=[];
 const engine=new WorldEngine(w),item=w.rules.settlementTrade.item;
 for(const season of [3,0,1,2]){
  const doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
  const ok=await advanceTo(ctx,(360+season*90+10)*DAY+600,`sf${season}`);
  for(const lane of w.rules.settlementTrade.lanes){
   try{const d=draftOf(engine,ctx.doc);emit({kind:'season',case:name,mode:modeName(withShift),buyer:lane.buyer,season,seasonFactors:w.rules.settlementTrade.seasonFactors??null,seasonFactorsReset:b.seasonFactorsReset,seasonFactorsRemoved:b.seasonFactorsRemoved,strippedClasses:b.strippedClasses,item,reached:ok,jumped:ctx.jumped??false,
    fixtureUntrusted:ctx.fixtureUntrusted??null,regionalBase:regionalTradeBase(d,engine,item,lane.buyer),regionalTradePrice:regionalTradePrice(d,engine,item,lane.buyer),view:itemView(engine,ctx.doc,item,lane.buyer)});}
   catch(e){emit({kind:'season',case:name,mode:modeName(withShift),buyer:lane.buyer,season,error:errorOf(e)});}
  }
 }
}
// 两种模式都跑的情形，末尾输出 modeDiff（R5②）。
function modeDiff(name,withSeries,withoutSeries){
 const rows=[];
 for(const sa of withSeries){const sb=withoutSeries.find(x=>x.day===sa.day);if(!sb)continue;
  for(const ia of sa.items){const ib=sb.items.find(x=>x.item===ia.item);rows.push({day:sa.day,item:ia.item,withPrice:ia.listPrice,withoutPrice:ib?.listPrice,equal:ia.listPrice===ib?.listPrice,withHazard:ia.hazardFactor,withoutHazard:ib?.hazardFactor});}}
 emit({kind:'modeDiff',case:name,rows});
}

// R5③ 运输覆盖：只读报价，第 545 日；4 物品 × 3 目的聚落共 12 个点，每点一行 kind=transport，带 transport 的推导输入与引擎值；不连通时 unitFreight 的错误原文进 unitFreightError。
async function transportCoverageRun(name){
 const b=buildWorld(true),w=b.w;w.rules.hazardClock.clocks=[];
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 const reached=await advanceTo(ctx,545*DAY+600,'transport'),d=draftOf(engine,ctx.doc);
 for(const item of TRANSPORT_ITEMS)for(const sid of TRANSPORT_PLACES){
  try{
   const tin=transportInputs(engine,ctx.doc,d,item,sid),base=regionalTradeBase(d,engine,item,sid),catalogBase=engine.byId.get(item).basePrice;
   const environmentFactors=hazardPriceFactor(engine,ctx.doc.state,item,sid)*magicPriceFactor(engine,ctx.doc.state,item,sid)*forestWaterPriceFactor(engine,ctx.doc.state,item,sid,d);
   emit({kind:'transport',case:name,...tin,regionalBase:base,environmentFactors,transport:base/(catalogBase*(environmentFactors||1)),reached,jumped:ctx.jumped??false});
  }catch(e){emit({kind:'transport',case:name,item,settlement:sid,error:errorOf(e)});}
 }
}

// ---------------------------------------------------------------- 情形注册表
const REG={};
const add=(name,estimate,run,startExtra=null)=>{REG[name]={estimate,run,startExtra};};
// noclock 与 bs-tight-noloc_bs 的 start 行带闭包报告（只读 rules.json）：闭包内每钟每阶段的 effect 种类与对象。
const closureStart=(clockId)=>{const ids=closureOf(world0,clockId);return {clocksRemoved:ids,closureMatches:EXPECTED_CLOSURE[clockId]?sameSet(ids,EXPECTED_CLOSURE[clockId]):null,closureReport:closureReport(world0,ids)};};
for(const [tag,sid] of [['',HW],['yupo-',YP]])for(const season of ['winter','autumn'])for(const L of LEVELS)
 add(`${tag}${season}-without-${L}`,season==='winter'?'skipTo 到冬第 630 日 + 真实推进 8 天，约 5-10 分钟':'skipTo 到秋第 545 日 + 真实推进 8 天，约 5-10 分钟',name=>cellRun(name,'without',season==='winter'?'winter':'normal',L,sid));
for(const [tag,sid] of [['',HW],['yupo-',YP]])for(const L of NOCLOCK_LEVELS)
 add(`${tag}winter-noclock-${L}`,'C2：钟及闭包整段移除；skipTo 到冬第 630 日 + 真实推进 8 天，约 5-10 分钟',name=>cellRun(name,'noclock','winter',L,sid),()=>closureStart(`famine:${sid}`));
add('drought-without','C3 灾害年：开局年播种窗前一日起真实推进至收割窗末，约 10-20 分钟（超过 8 分钟）',name=>droughtRun(name,false));
add('drought-noclock','C3 正常年：钟整段移除，其余同上，约 10-20 分钟（超过 8 分钟）',name=>droughtRun(name,true),()=>closureStart(CASES.drought.clocks[0]));
add('famine-hw-without','skipTo 到冬前一天 + 真实推进 10 天，约 5-10 分钟',name=>caseRun(name,false,CASES['famine-hw'],CASEDAYS));
add('buys-1.0','池 cov 1.0；两物品各 10 件购买，约 3-6 分钟',name=>buyRun(name,1.0));
add('buys-0.75','池 cov 0.75；两物品各 10 件购买，约 3-6 分钟',name=>buyRun(name,0.75));
add('zero-hold-hw','R10：loc_hw 秋第 545 日，池内全部可知持有清零，只读，约 1-2 分钟',name=>cellRun(name,'without','normal',0,HW,{fixture:'zero'}));
add('tiny-hold-hw','R10：loc_hw 秋第 545 日，池内持有设为 1 个饱腹单位，只读，约 1-2 分钟',name=>cellRun(name,'without','normal',null,HW,{fixture:'tiny'}));
add('transport-coverage','R5③：只读报价，4 物品 × 3 聚落，约 1 分钟',name=>transportCoverageRun(name));
for(const key of ['spring','spring-bs','flood','epidemic']){
 add(`${key}-with`,'真实推进 6 天，约 6-12 分钟',name=>caseRun(name,true,CASES[key],CASEDAYS));
 add(`${key}-without`,'真实推进 6 天，约 6-12 分钟',name=>caseRun(name,false,CASES[key],CASEDAYS));
 add(key,'两种模式各 6 天，约 12-24 分钟',async name=>{const a=await caseRun(name,true,CASES[key],CASEDAYS),b=await caseRun(name,false,CASES[key],CASEDAYS);modeDiff(name,a,b);});
}
add('flood-control','洪水反事实对照（无 route_closure），真实推进 6 天，约 6-12 分钟',name=>caseRun(name,false,CASES.flood,CASEDAYS,true));
add('season-without','R4 季节系数删除形态：skipTo 四季只读，约 3-5 分钟',name=>seasonRun(name,false));
add('bs-tight','skipTo 到冬前一天 + 真实推进 20 天，三聚落四物品逐日，约 10-20 分钟（超过 8 分钟）',name=>caseRun(name,false,CASES['bs-tight'],CASEDAYS));
add('bs-tight-noloc_bs','C2 特例：famine:loc_bs 及闭包整段移除，其余同 bs-tight，约 10-20 分钟（超过 8 分钟）',name=>caseRun(name,false,CASES['bs-tight-noloc_bs'],CASEDAYS),()=>closureStart('famine:loc_bs'));

// ---------------------------------------------------------------- 入口
const names=process.argv.slice(2).filter(a=>!a.startsWith('-'));
if(!names.length){
 console.log('可用情形（无参数只列出，不运行）。用法：node tools/market-winter-probe.mjs <情形名> [...]；输出为 JSON Lines，每个对照点一行。');
 for(const [n,r] of Object.entries(REG))console.log(`${n}\t${r.estimate}`);
 process.exit(0);
}
for(const name of names){
 const reg=REG[name];
 if(!reg){emit({kind:'error',case:name,error:{message:`未知情形；无参数运行可列出全部`}});continue;}
 const pfl=world0.rules?.economy?.priceFactorLimits??{};
 let extra={};try{extra=reg.startExtra?.()??{};}catch(e){extra={startExtraError:errorOf(e)};}
 emit({kind:'start',case:name,estimate:reg.estimate,limits:pfl.region??null,limitsTransport:pfl.transport??null,scarcityCap:pfl.region?.[1]??null,...extra});
 try{await reg.run(name);}catch(e){emit({kind:'error',case:name,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
 emit({kind:'done',case:name});
}
