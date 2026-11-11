// 冬季干粮价格只读探针（MKTW 整类卡第一步；李白 11-11 决定 06a7602d）。
// 目的：在同一世界里取"平时（秋）"与"冬季"、不同粮仓缺口程度，输出干粮类物品的价格、供给、需求、供需比与成交价，
// 并输出连续购买时每件的涨幅；可切换"有/无 price_shift"（读入世界后在内存副本里去掉各时钟阶段的 price_shift 效果，不改任何文件）。
// 只读：不写盘、不开服务器、不调模型、不 import 任何测试文件；所有改动只在内存里的文档与世界副本上。
// 覆盖全部手写价格倍数情形（李白 11-11 16:5x 扩大范围）：冬荒、青黄不接粮价钟（season 1）、旱情、洪水断路、疫病药草、周贸易季节系数；
// --cases 选择情形（winter,buys,spring,spring-bs,drought,flood,epidemic,seasonfactor），--days 为各 cases 逐日推进天数（默认 6）。
// 用法：node tools/market-winter-probe.mjs [--mode=with|without|both] [--cases=...] [--days=N] [--advance=N] [--levels=a,b,c] [--buys=N] [--no-buys]
//   --mode      with=现状（保留 price_shift），without=内存副本去掉全部 price_shift，both=两者都跑（默认）。
//   --advance   设好粮仓后用 world_time 推进的天数（默认 8，超过冬荒时钟间隔 7 天，使时钟按真实规则自行触发或不触发；0=不推进，只读规律层静态值）。
//   --levels    粮仓存量 = 档位 × (聚落餐口 × reserveDays)；默认 1.5,0.9,0.6,0.4,0.2,0.05（>1 为满仓，<1 进入 tight 阈值，<0.5 进入 famine 阈值）。
//   --buys      连续购买件数（默认 10）。
//   --settlement 受测聚落（默认 loc_hw；换聚落如 loc_bs_yupo 时加 --no-buys，购买场景固定在 loc_hw 青灯酒馆）。
//   --no-buys   不跑连续购买。
// 季节：冬 = 种子之后的冬季（雁月之后，season 3），平时 = 第二年秋（season 2，没有粮价时钟）。两者同一世界、同一规则，只差日期。
// 输出：一份 JSON（stdout）。判定规则见 F:/dnd-tmp/mktw/冻结规则.md，探针只给量，不在探针里判通过。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {marketSupply,marketQuote,goodsClass} from '../server-plugin/market.mjs';
import {regionalTradeBase,regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {hazardPriceFactor,famineAt} from '../server-plugin/hazard-calendar.mjs';
import {mealMouthsOf} from '../server-plugin/primitives-body.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {tradeQuote} from '../server-plugin/shop.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {factionClockRules} from '../server-plugin/faction-clock.mjs';

const DAY=1440,INN='bld_hw_qingdeng',KEEPER='npc_hw_linsui';
// 干粮类被测物品：口粮、燕麦薄饼、面包（goods:food 池）与燕麦原粮（goods:grain 池，公仓同池）。
const ITEMS=['item_ration','item_oat_flatbread','item_bread','item_oats'];
const arg=(name,def)=>{const a=process.argv.find(x=>x.startsWith(`--${name}=`));return a?a.slice(name.length+3):def;};
const flag=name=>process.argv.includes(`--${name}`);
const SID=arg('settlement','loc_hw'),MODE=arg('mode','both'),ADVANCE=Number(arg('advance','8')),BUYS=Number(arg('buys','10')),NOBUYS=flag('no-buys');
const LEVELS=arg('levels','1.5,0.9,0.6,0.4,0.2,0.05').split(',').map(Number);
const world0=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
const legacy={state:seed.state,memories:seed.memories};
const errorOf=e=>({message:String(e?.message??e),code:e?.code??null});

// ---------------------------------------------------------------- 工具
// 内存世界副本：去掉全部时钟阶段里的 price_shift 效果（其余效果如 famine、rumor 不动）。返回被去掉的条数。
function stripPriceShift(w){
 let removed=0;
 for(const clock of w.rules.hazardClock?.clocks??[])for(const stage of clock.stages??[]){
  const before=stage.effects?.length??0;
  stage.effects=(stage.effects??[]).filter(e=>e.kind!=='price_shift');
  removed+=before-stage.effects.length;
 }
 // 周贸易季节系数（settlement-trade.mjs:97）同属手写倍数，一并取消（全设为 1，记 1 条）。
 if(w.rules.settlementTrade?.seasonFactors){w.rules.settlementTrade.seasonFactors=w.rules.settlementTrade.seasonFactors.map(()=>1);removed+=1;}
 return removed;
}
function buildWorld(withShift){
 const w=structuredClone(world0);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const removed=withShift?0:stripPriceShift(w);
 let shiftCount=0;
 for(const clock of w.rules.hazardClock?.clocks??[])for(const stage of clock.stages??[])shiftCount+=(stage.effects??[]).filter(e=>e.kind==='price_shift').length;
 return {w,removed,shiftCount};
}
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
// 同 tests 里"直接跳分钟"的做法：分钟前移时势力日钟一并跳到下一个边界；灾害时钟的上次评估日对齐到前一天。
function skipTo(engine,doc,minute){
 doc.state.minute=minute;
 for(const rule of factionClockRules(engine)){
  const key=Object.keys(doc.state.records??{}).find(k=>doc.state.records[k]?.category==='faction_clock'&&doc.state.records[k].id===rule.id);
  if(!key)continue;const row=doc.state.records[key];
  if(row.nextAt<minute)doc.state.records[key]={...row,nextAt:Math.ceil(minute/DAY/rule.intervalDays)*rule.intervalDays*DAY};
 }
 for(const row of Object.values(doc.state.records??{}))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(minute/DAY)-1;
}
// 公仓设为 quantity 件（只改内存文档；之后重开账本，使价格读账户时与旧字段一致）。
function setGranary(engine,doc,sid,quantity){
 const r=doc.state.records[`agriculture:${sid}`],s=doc.state.settlements[sid],day=Math.floor(doc.state.minute/DAY);
 s.food=quantity;
 r.batches=quantity?[{id:'probe_stock',kind:'grain',amount:quantity,harvestDay:day-30,expiresDay:day+400,source:'probe in-memory granary'}]:[];
 if(r.ledger){r.ledger.openingFood=quantity;r.ledger.freshProduced=0;r.ledger.eaten=0;r.ledger.spoiled=0;r.ledger.overflow=0;}
 if(doc.ledger)doc.ledger=openLedger(engine,doc);
}
const reserveDaysOf=(engine,sid)=>engine.rules.agriculture.settlements.find(p=>p.settlement===sid)?.reserveDays??1;
const mouthsOf=(engine,doc,sid)=>Math.ceil(mealMouthsOf(engine,doc.state,sid,doc.state.settlements[sid].population));
const draftOf=(engine,doc)=>engine.primitiveDraft(doc);
// 一件货的供需与报价分解（只读）。
function itemView(engine,doc,item,location=SID){
 try{
  const d=draftOf(engine,doc),s=marketSupply(d,engine,item,location);
  const limits=engine.rules.economy.priceFactorLimits.region,ratio=s.demand/Math.max(1,s.supply);
  const base=regionalTradeBase(d,engine,item,location),q=marketQuote(d,engine,{item,location,seller:null,buyer:'player',quantity:1,base}),x=q.explanation??{};
  return {item,goods:goodsClass(engine,item),supply:s.supply,spotSupply:s.spotSupply,demand:s.demand,ratio,ratioClamped:Math.min(Math.max(ratio,limits[0]),limits[1]),
   atFloor:ratio<=limits[0],catalogBase:engine.byId.get(item).basePrice,environment:x.environment,regionalBase:base,scarcity:x.scarcity,listPrice:q.listPrice,
   hazardFactor:hazardPriceFactor(engine,doc.state,item,location),regionalTradePrice:regionalTradePrice(d,engine,item,location)};
 }catch(e){return {item,error:errorOf(e)};}
}
// 聚落粮仓与灾荒状态（冬荒记录、tight/famine 阶段史、手写价格记录）。
function granaryView(engine,doc,sid){
 const s=doc.state.settlements[sid],mouths=mouthsOf(engine,doc,sid),reserve=reserveDaysOf(engine,sid);
 const clock=doc.state.records?.[`hazard-clock:famine:${sid}`],price=doc.state.records?.[`hazard-price:${sid}`];
 return {food:s.food,population:s.population,mouths,reserveDays:reserve,reserveTarget:mouths*reserve,coverageOfReserve:s.food/Math.max(1,mouths*reserve),daysOfFood:s.food/Math.max(1,mouths),
  starvation:s.starvation??0,famineActive:Boolean(famineAt(doc.state,sid)),famineStages:clock?.history?.map(h=>h.stage)??null,
  priceShifts:price?Object.fromEntries(Object.entries(price.shifts??{}).map(([k,v])=>[k,{factor:v.factor,items:v.items??null,reason:v.reason}])):null};
}

// ---------------------------------------------------------------- 1. 季节 × 缺口 矩阵
async function cell(withShift,season,level){
 const {w,removed,shiftCount}=buildWorld(withShift);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 const startMinute=season==='winter'?doc.state.minute:600*DAY+600; // 种子起点在秋末；冬 = 起点后推进进入冬；平时 = 第二年秋 600 日（雁月）
 if(season==='normal')skipTo(engine,ctx.doc,startMinute);
 const mouths=mouthsOf(engine,ctx.doc,SID),reserve=reserveDaysOf(engine,SID),target=mouths*reserve;
 // 冬：先推进到冬季第 1 天之后再设粮仓，使"设好后再推进 ADVANCE 天"都落在冬季；平时同理在秋内推进。
 let toWinter=null;
 if(season==='winter'){toWinter=await attempt(ctx,'world_time',{minutes:2*DAY},'probe-to-winter');}
 setGranary(engine,ctx.doc,SID,Math.round(level*target));
 const before=granaryView(engine,ctx.doc,SID);
 const viewsBefore=ITEMS.map(i=>itemView(engine,ctx.doc,i));
 let advanced=null;
 if(ADVANCE>0)advanced=await attempt(ctx,'world_time',{minutes:ADVANCE*DAY},'probe-advance');
 const cal=engine.calendar(ctx.doc.state.minute);
 return {mode:withShift?'with':'without',stripped:removed,priceShiftEffectsInWorld:shiftCount,season,seasonIndex:cal.season,calendar:cal.text,level,
  toWinter:toWinter&&{ok:toWinter.ok,error:toWinter.error},advance:{days:ADVANCE,ok:advanced?advanced.ok:null,error:advanced?.error},
  granaryBefore:before,granaryAfter:granaryView(engine,ctx.doc,SID),itemsBefore:viewsBefore,itemsAfter:ITEMS.map(i=>itemView(engine,ctx.doc,i))};
}

// ---------------------------------------------------------------- 2. 连续购买逐件涨幅
// 场景参数：林穗全天在青灯酒馆营业，玩家钱充足，与 tools/market-probe.mjs 的 a2-dialogue-7 同形；季节取平时（秋），粮仓满仓，不推进时间。
async function buySeries(withShift,item){
 const {w}=buildWorld(withShift);
 w.npcs.find(n=>n.id===KEEPER).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe');
 skipTo(engine,doc,600*DAY+540);
 doc.state.location=INN;Object.assign(doc.state.npcs[KEEPER],{goals:{},trust:20,activity:'营业',location:INN});doc.state.player.coins=100000;
 setGranary(engine,doc,SID,Math.round(1.5*mouthsOf(engine,doc,SID)*reserveDaysOf(engine,SID)));
 const ctx={engine,doc},rows=[];
 await attempt(ctx,'world_act',{action:'core:time',slots:{minutes:1}},'probe-prime');
 const view=()=>{try{const d=draftOf(engine,ctx.doc),s=marketSupply(d,engine,item,INN),q=tradeQuote(d,engine,{buyer:'player',seller:KEEPER,item,quantity:1,location:INN,base:()=>regionalTradeBase(d,engine,item,INN)*wildlifePriceFactor(engine,d.document,item,INN)});
   return {supply:s.supply,demand:s.demand,ratio:s.demand/Math.max(1,s.supply),quotedListPrice:q.listPrice,quotedExactTotal:q.exactTotal};}catch(e){return {error:errorOf(e)};}};
 let prev=null;
 for(let k=1;k<=BUYS;k++){
  const pre=view();
  const buy=await attempt(ctx,'world_act',{action:'core:trade.buy',slots:{seller:KEEPER,item,quantity:1}},`probe-buy-${k}`);
  const unit=buy.result?.pricing?.unitPrice??null,list=buy.result?.pricing?.listPrice??null;
  const row={k,ok:buy.ok,error:buy.error,unitPrice:unit,listPrice:list,cost:buy.result?.cost,pre,
   unitRiseVsPrev:prev!==null&&unit!==null&&prev>0?unit/prev-1:null,
   quotedRiseVsPrev:rows.length&&rows[rows.length-1].pre.quotedListPrice>0&&pre.quotedListPrice!==undefined?pre.quotedListPrice/rows[rows.length-1].pre.quotedListPrice-1:null,
   supplyDelta:rows.length&&pre.supply!==undefined?pre.supply-rows[rows.length-1].pre.supply:null,demandDelta:rows.length&&pre.demand!==undefined?pre.demand-rows[rows.length-1].pre.demand:null};
  rows.push(row);if(unit!==null)prev=unit;
  if(!buy.ok)break;
 }
 return {mode:withShift?'with':'without',item,rows};
}

// ---------------------------------------------------------------- 3. 其它手写倍数情形（春季粮价钟、旱情、洪水断路、疫病药草、周贸易季节系数）
// 每个情形都在内存里做"有倍数 / 无倍数"两份对照。为让按概率或天气触发的时钟在探针里确定地走完，沿用 tests/seasonal-hazards.test.mjs 的夹具思路：
// 只保留该情形的钟、改成目标季节、间隔 1 天、阶段概率 1、天气条件改 always；疫病病例条件按需强制成立。这些只改内存里的世界副本。
// 只读时间序列：逐日（推进 1 天后）记各物品的倍数、供给、需求、供需比、列价与聚落粮仓，不判通过。价格方向由供需变化决定，不与旧倍数比较。
const CASES={
 spring:{label:'春季青黄不接粮价钟（河湾 loc_hw：rise/peak/ease）',settlement:'loc_hw',clock:'price:loc_hw',season:1,items:ITEMS,level:1.0},
 'spring-bs':{label:'春季青黄不接粮价钟（镇 loc_bs）',settlement:'loc_bs',clock:'price:loc_bs',season:1,items:ITEMS},
 drought:{label:'久晴旱情（泉村 loc_bs_liquan：crop_damage 与 price 同阶段）',settlement:'loc_bs_liquan',clock:'price:loc_bs_liquan',season:1,items:ITEMS,level:1.0},
 flood:{label:'洪水断路（镇 loc_bs：route_closure 与 price 同阶段）',settlement:'loc_bs',clock:'flood:loc_bs',season:1,items:ITEMS},
 epidemic:{label:'疫病药草（河湾 loc_hw：spread 病例条件强制成立，只看药草价是否随病例而动）',settlement:'loc_hw',clock:'epidemic:loc_hw',season:1,items:['item_herb','item_ration'],forceCases:true},
};
function forceClock(w,spec){
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>r.id===spec.clock);
 for(const r of w.rules.hazardClock.clocks){
  r.seasons=[spec.season];r.intervalDays=1;
  for(const s of r.stages){
   s.probability=1;
   if(s.condition.kind==='all')s.condition=s.condition.conditions[0];
   if(s.condition.kind==='weather')s.condition={kind:'always'};
   if(spec.forceCases&&s.condition.kind==='epidemic_cases')s.condition={kind:'always'};
  }
 }
}
async function caseRun(withShift,spec,days){
 const {w,removed,shiftCount}=buildWorld(withShift);
 forceClock(w,spec);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 skipTo(engine,ctx.doc,(360+spec.season*90+10)*DAY+600);
 const target=mouthsOf(engine,ctx.doc,spec.settlement)*reserveDaysOf(engine,spec.settlement);
 if(spec.level!==undefined)setGranary(engine,ctx.doc,spec.settlement,Math.round(spec.level*target));
 const snap=day=>({day,calendar:engine.calendar(ctx.doc.state.minute).text,granary:granaryView(engine,ctx.doc,spec.settlement),
  clockHistory:ctx.doc.state.records?.[`hazard-clock:${spec.clock}`]?.history?.map(h=>h.stage)??null,
  items:spec.items.map(i=>itemView(engine,ctx.doc,i,spec.settlement)),
  epidemic:Object.values(ctx.doc.state.records??{}).filter(r=>r?.category==='epidemic').map(r=>({id:r.id,status:r.status,households:Object.keys(r.households??{}).length}))});
 const series=[snap(0)];
 for(let d=1;d<=days;d++){const adv=await attempt(ctx,'world_time',{minutes:DAY},`probe-case-${d}`);const s=snap(d);if(!adv.ok)s.advanceError=adv.error;series.push(s);if(!adv.ok)break;}
 return {case:spec.label,settlement:spec.settlement,clock:spec.clock,mode:withShift?'with':'without',stripped:removed,priceShiftEffectsInWorld:shiftCount,series};
}
// 周贸易季节系数：每条受粮线的买方聚落，燕麦区域基价在四个季节各取一次（只跳日期，不推进时间）；with 含 seasonFactors，without 全为 1。
async function seasonFactorRun(withShift){
 const {w,removed}=buildWorld(withShift);
 const engine=new WorldEngine(w),rows=[],item=w.rules.settlementTrade.item;
 for(const lane of w.rules.settlementTrade.lanes)for(const season of [0,1,2,3]){
  const doc=engine.createCharacter(legacy,{},'mktw-winter-probe');
  skipTo(engine,doc,(360+season*90+10)*DAY+600);
  try{const d=draftOf(engine,doc);rows.push({buyer:lane.buyer,season,seasonFactors:w.rules.settlementTrade.seasonFactors,item,
   regionalBase:regionalTradeBase(d,engine,item,lane.buyer),regionalTradePrice:regionalTradePrice(d,engine,item,lane.buyer),view:itemView(engine,doc,item,lane.buyer)});}
  catch(e){rows.push({buyer:lane.buyer,season,error:errorOf(e)});}
 }
 return {case:'周贸易季节系数',mode:withShift?'with':'without',stripped:removed,rows};
}

// ---------------------------------------------------------------- 入口
const modes=MODE==='both'?[true,false]:MODE==='with'?[true]:MODE==='without'?[false]:null;
if(!modes){console.error('--mode 只能是 with、without 或 both');process.exit(2);}
const WANT=new Set(arg('cases','winter,buys,spring,spring-bs,drought,flood,epidemic,seasonfactor').split(','));
const CASEDAYS=Number(arg('days','6'));
const out={probe:'market-winter-probe',args:{mode:MODE,advance:ADVANCE,levels:LEVELS,buys:BUYS,items:ITEMS,settlement:SID,cases:[...WANT],caseDays:CASEDAYS},
 limits:world0.rules?.economy?.priceFactorLimits?.region??null,
 note:'with=现状（保留全部 price_shift 与 seasonFactors），without=内存副本去掉全部 price_shift 并把 seasonFactors 设为 1（famine、crop_damage、route_closure 等源头效果保留）。冬/平时见 matrix；其它情形见 cases。',matrix:[],buySeries:[],cases:[]};
if(WANT.has('winter'))for(const withShift of modes)for(const season of ['normal','winter'])for(const level of LEVELS){
 try{out.matrix.push(await cell(withShift,season,level));}
 catch(e){out.matrix.push({mode:withShift?'with':'without',season,level,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
if(WANT.has('buys')&&!NOBUYS)for(const withShift of modes)for(const item of ['item_bread','item_ration']){
 try{out.buySeries.push(await buySeries(withShift,item));}
 catch(e){out.buySeries.push({mode:withShift?'with':'without',item,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
for(const name of Object.keys(CASES))if(WANT.has(name))for(const withShift of modes){
 try{out.cases.push(await caseRun(withShift,CASES[name],CASEDAYS));}
 catch(e){out.cases.push({case:CASES[name].label,mode:withShift?'with':'without',error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
if(WANT.has('seasonfactor'))for(const withShift of modes){
 try{out.cases.push(await seasonFactorRun(withShift));}
 catch(e){out.cases.push({case:'周贸易季节系数',mode:withShift?'with':'without',error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
console.log(JSON.stringify(out,(k,v)=>typeof v==='bigint'?v.toString():v,1));
