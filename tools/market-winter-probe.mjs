// 冬季干粮价格只读探针（MKTW 整类卡第一步；李白 11-11 决定 06a7602d）。
// 目的：在同一世界里取"平时（秋）"与"冬季"、不同粮仓缺口程度，输出干粮类物品的价格、供给、需求、供需比与成交价，
// 并输出连续购买时每件的涨幅；可切换"有/无 price_shift"（读入世界后在内存副本里去掉各时钟阶段的 price_shift 效果，不改任何文件）。
// 只读：不写盘、不开服务器、不调模型、不 import 任何测试文件；所有改动只在内存里的文档与世界副本上。
// 用法：node tools/market-winter-probe.mjs [--mode=with|without|both] [--advance=N] [--levels=a,b,c] [--buys=N] [--no-buys]
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

// ---------------------------------------------------------------- 入口
const modes=MODE==='both'?[true,false]:MODE==='with'?[true]:MODE==='without'?[false]:null;
if(!modes){console.error('--mode 只能是 with、without 或 both');process.exit(2);}
const out={probe:'market-winter-probe',args:{mode:MODE,advance:ADVANCE,levels:LEVELS,buys:BUYS,items:ITEMS,settlement:SID},
 limits:world0.rules?.economy?.priceFactorLimits?.region??null,
 note:'平时=第二年秋（无粮价时钟），冬=种子之后的冬季；两者同世界同规则。with=现状含全部 price_shift，without=内存副本去掉全部 price_shift（其它效果如 famine 保留）。',matrix:[],buySeries:[]};
for(const withShift of modes)for(const season of ['normal','winter'])for(const level of LEVELS){
 try{out.matrix.push(await cell(withShift,season,level));}
 catch(e){out.matrix.push({mode:withShift?'with':'without',season,level,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
if(!NOBUYS)for(const withShift of modes)for(const item of ['item_bread','item_ration']){
 try{out.buySeries.push(await buySeries(withShift,item));}
 catch(e){out.buySeries.push({mode:withShift?'with':'without',item,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
console.log(JSON.stringify(out,(k,v)=>typeof v==='bigint'?v.toString():v,1));
