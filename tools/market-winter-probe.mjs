// 价格倍数整类去除只读探针（MKTW 整类卡第一步；李白 11-11 决定 06a7602d、16:5x 扩大、17:0x 事件 15b5a4ea 调整）。
// 目的：同一世界里取"平时（秋）"与"冬季"、不同粮仓缺口程度，输出干粮类物品的价格、供给、需求、供需比与成交价，
// 输出连续购买时每件的涨幅与深度项；并对各类手写倍数（冬荒、旱情、洪水、青黄不接粮价钟、疫病药草、周贸易季节系数）做"有/无倍数"对比。
// 只读：不写盘、不开服务器、不调模型、不 import 任何测试文件；所有改动只在内存里的文档与世界副本上。
//
// 用法（门禁不收以"-"开头的参数，所以只用情形名）：node tools/market-winter-probe.mjs <情形名> [<情形名> ...]
//   无参数：只打印可用情形列表与各自预计推进天数、估算时长，不跑任何情形。
//   输出为 JSON Lines：每完成一个对照点（一个矩阵格、一件购买、一个游戏日读数、一个季节读数）立即 console.log 一行，
//   中途超时也留下已完成部分。行的 kind：start（情形开始，含估算）、cell、buy、day（情形逐日读数，含 mode）、season、meta（情形摘要）、modeDiff、done、error。
//   每行都带 case（情形名）。冻结规则 R5② 的有/无倍数逐项比对：同一次调用里两种模式都跑的情形（如 spring）末尾输出 modeDiff；
//   winter-/autumn- 按模式、档位拆开的子情形，用各行里的 pairKey（season|level|item）离线配对，比对口径与判据不变。
//
// 日历：种子在元年雨月 1 日（日历季节 0 = 春）；日历季节 = floor(月序/3)，0 春 1 夏 2 秋 3 冬；冬荒钟 seasons:[3]，从每年第 270 日起每 7 天一个 tick；seasonFactors 下标即日历季节。
// 时间口径：云上实测完整世界约 1 到 2 分钟/游戏日。从种子日期到各目标季节，真实推进要 450 到 630 天（十几小时以上），云上跑不完，
// 所以到达目标季节的"长跳"用 skipTo（直接设分钟，势力日钟对齐，灾害时钟的上次评估日置为前一天），行里标 jumped:true；
// 跳后粮仓由 setGranary 设定，灾害时钟记录从空开始，之后的逐日推进全部是真实的 world_time。冬格也 skipTo 到第二年冬第 630 日（旧版误用种子后 2 天，那是雨月 3 日）。
// 长跳的取舍已在汇报中说明：它改变了"农事自然演化"，但本探针每个情形都自己设定粮仓并只看紧接着的几天，不依赖跳过的那段农事。
//
// 情形名与预计（天数 = 真实推进的游戏日；时长 = 天数 × 1 到 2 分钟）：
//   winter-<with|without>-<level> 与 yupo-winter-<with|without>-<level>：level ∈ 1.5,0.9,0.6,0.4,0.2,0.05；skipTo 到冬第 630 日 + 8 天，约 8-16 分钟
//   [yupo-]pair-<winter|autumn>-<level>：with 与 without 各跑一格并输出 modeDiff（R5②），约 16-32 分钟
//   famine-hw-<with|without>：河湾冬荒阶段日（R7），10 天，约 10-20 分钟
//   autumn-<with|without>-<level> 与 yupo-autumn-<with|without>-<level>：skipTo 到第二年秋 + 8 天 = 8 天，约 8-16 分钟
//   buys-with、buys-without：skipTo + 两个物品各 10 件购买，真实推进约 0 天，约 5-10 分钟
//   spring、spring-bs、drought、flood、epidemic：各情形两种模式（with、without）各 6 天，合计 12 天，约 12-24 分钟；也可用 -with / -without 后缀只跑一种（6 天，约 6-12 分钟）
//   flood-control：洪水反事实对照（无 route_closure），6 天，约 6-12 分钟
//   season：周贸易季节系数，skipTo 到四个季节只读，约 0 天，约 3-5 分钟（with、without 各一次）
//   bs-tight-with、bs-tight-without：skipTo 到冬前一天（第 629 日）+ 真实推进 20 天，约 20-40 分钟（小于 50 分钟）；不提供两种模式合并的名字（会超 50 分钟）
// 没有超过 50 分钟的单个情形。
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
import {forestWaterPriceFactor} from '../server-plugin/agriculture.mjs';
import {magicPriceFactor} from '../server-plugin/magic-economy.mjs';

const DAY=1440,INN='bld_hw_qingdeng',KEEPER='npc_hw_linsui',HW='loc_hw',YP='loc_bs_yupo';
const ITEMS=['item_ration','item_oat_flatbread','item_bread','item_oats'];
const LEVELS=[1.5,0.9,0.6,0.4,0.2,0.05],ADVANCE=8,BUYS=10,CASEDAYS=6;
const STRIP_DEFAULT=['winter','drought','seasonfactor'];
const world0=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
const legacy={state:seed.state,memories:seed.memories};
const errorOf=e=>({message:String(e?.message??e),code:e?.code??null});
const emit=obj=>console.log(JSON.stringify(obj,(k,v)=>typeof v==='bigint'?v.toString():v));

// ---------------------------------------------------------------- 工具
const classOf=id=>id.startsWith('famine:')?'winter':id==='price:loc_bs_liquan'?'drought':id.startsWith('price:')?'spring':id.startsWith('flood:')?'flood':id.startsWith('epidemic:')?'epidemic':'other';
// 内存世界副本：按类去掉 price_shift；winter 类另整段删除 famine:loc_bs 的 tight 阶段；seasonfactor 类把 seasonFactors 置 1；closure 类只给洪水对照用。
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
 if(classes.includes('closure'))for(const clock of w.rules.hazardClock?.clocks??[]){
  if(!clock.id.startsWith('flood:'))continue;
  for(const stage of clock.stages??[]){const before=stage.effects?.length??0;stage.effects=(stage.effects??[]).filter(e=>e.kind!=='route_closure');stagesDeleted.push(`${clock.id}:${stage.id}:route_closure×${before-stage.effects.length}`);}
 }
 let seasonFactorsReset=false;
 if(classes.includes('seasonfactor')&&w.rules.settlementTrade?.seasonFactors){w.rules.settlementTrade.seasonFactors=w.rules.settlementTrade.seasonFactors.map(()=>1);seasonFactorsReset=true;}
 return {removed,stagesDeleted,seasonFactorsReset};
}
function buildWorld(withShift,classes=STRIP_DEFAULT){
 const w=structuredClone(world0);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const stripped=withShift?{removed:0,stagesDeleted:[],seasonFactorsReset:false}:strip(w,classes);
 let shiftCount=0;
 for(const clock of w.rules.hazardClock?.clocks??[])for(const stage of clock.stages??[])shiftCount+=(stage.effects??[]).filter(e=>e.kind==='price_shift').length;
 return {w,...stripped,shiftCount,strippedClasses:withShift?[]:classes};
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
function itemView(engine,doc,item,location){
 try{
  const d=draftOf(engine,doc),s=marketSupply(d,engine,item,location);
  const limits=engine.rules.economy.priceFactorLimits.region,ratio=s.demand/Math.max(1,s.supply);
  const base=regionalTradeBase(d,engine,item,location),q=marketQuote(d,engine,{item,location,seller:null,buyer:'player',quantity:1,base}),x=q.explanation??{};
  return {item,goods:goodsClass(engine,item),supply:s.supply,spotSupply:s.spotSupply,demand:s.demand,ratio,ratioClamped:Math.min(Math.max(ratio,limits[0]),limits[1]),
   atFloor:ratio<=limits[0],catalogBase:engine.byId.get(item).basePrice,environment:x.environment,regionalBase:base,scarcity:x.scarcity,listPrice:q.listPrice,
   hazardFactor:hazardPriceFactor(engine,doc.state,item,location),magicFactor:magicPriceFactor(engine,doc.state,item,location),forestWaterFactor:forestWaterPriceFactor(engine,doc.state,item,location,d),regionalTradePrice:regionalTradePrice(d,engine,item,location)};
 }catch(e){return {item,error:errorOf(e)};}
}
function granaryView(engine,doc,sid){
 const s=doc.state.settlements?.[sid];if(!s)return {settlement:sid,note:'没有聚落钱粮账'};
 let mouths=null,reserve=null;try{mouths=mouthsOf(engine,doc,sid);reserve=reserveDaysOf(engine,sid);}catch(e){return {settlement:sid,food:s.food,error:errorOf(e)};}
 const clock=doc.state.records?.[`hazard-clock:famine:${sid}`],price=doc.state.records?.[`hazard-price:${sid}`];
 return {food:s.food,population:s.population,mouths,reserveDays:reserve,reserveTarget:mouths*reserve,coverageOfReserve:s.food/Math.max(1,mouths*reserve),daysOfFood:s.food/Math.max(1,mouths),
  starvation:s.starvation??0,famineActive:Boolean(famineAt(doc.state,sid)),famineStages:clock?.history?.map(h=>h.stage)??null,
  priceShifts:price?Object.fromEntries(Object.entries(price.shifts??{}).map(([k,v])=>[k,{factor:v.factor,items:v.items??null,reason:v.reason}])):null};
}
const clockStages=(doc,id)=>doc.state.records?.[`hazard-clock:${id}`]?.history?.map(h=>h.stage)??null;
const modeName=(withShift,control)=>control?'control':withShift?'with':'without';

// ---------------------------------------------------------------- 1. 季节 × 缺口 矩阵格（一个调用一格）
// 只保留 famine:<聚落> 一个时钟。冬 = 种子后真实推进 2 天进冬；平时 = skipTo 到第二年秋（第 545 日）。设好粮仓后真实推进 ADVANCE 天。
async function cellRun(name,withShift,season,level,sid){
 const b=buildWorld(withShift),w=b.w;
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>r.id===`famine:${sid}`);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 // 日历季节 = floor(月序/3)：0 春、1 夏、2 秋、3 冬（冬荒钟 seasons:[3] = 霜月起）。种子在元年雨月 1 日，旧"冬"格（种子后 2 天）其实是雨月 3 日（春），冬荒钟从不运行；
 // 现改为第二年冬第 630 日（霜月 1 日）；其 00:00 的首个 tick 被 skipTo 越过，之后 637 日有 tick。秋 = 第 545 日（穗月）。
 const reached=await advanceTo(ctx,(season==='winter'?630*DAY:545*DAY)+600,season);
 const target=mouthsOf(engine,ctx.doc,sid)*reserveDaysOf(engine,sid);
 const set=setGranary(engine,ctx.doc,sid,Math.round(level*target));
 const head={kind:'cell',case:name,mode:modeName(withShift),settlement:sid,season,level,pairKey:`${sid}|${season}|${level}`,strippedClasses:b.strippedClasses,stripped:b.removed,stagesDeleted:b.stagesDeleted,
  seasonFactorsReset:b.seasonFactorsReset,priceShiftEffectsInWorld:b.shiftCount,granarySet:set,jumped:ctx.jumped??false};
 const rows=[];
 const out=row=>{rows.push(row);emit(row);};
 out({...head,phase:'before-advance',seasonIndex:engine.calendar(ctx.doc.state.minute).season,seasonFactor:w.rules.settlementTrade.seasonFactors[engine.calendar(ctx.doc.state.minute).season],calendar:engine.calendar(ctx.doc.state.minute).text,granary:granaryView(engine,ctx.doc,sid),items:ITEMS.map(i=>itemView(engine,ctx.doc,i,sid))});
 const adv=await attempt(ctx,'world_time',{minutes:ADVANCE*DAY},'probe-advance');
 const cal=engine.calendar(ctx.doc.state.minute);
 out({...head,phase:'after-advance',seasonIndex:cal.season,seasonFactor:w.rules.settlementTrade.seasonFactors[cal.season],calendar:cal.text,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),
  advance:{days:ADVANCE,ok:adv.ok,error:adv.error},granary:granaryView(engine,ctx.doc,sid),items:ITEMS.map(i=>itemView(engine,ctx.doc,i,sid))});
 return rows;
}
// R5②：同一次调用里 with、without 各跑一格，逐物品输出 modeDiff 行。withHazard===1 的行（该物品当时没有被去掉的倍数在起作用）equal 必须为 true；
// equal 只比较 supply、demand、environment、regionalBase、scarcity、listPrice（相对 1e-9）；oats 因 seasonfactor 被一并去掉，regionalBase 会差一个季节系数，
// 故同时给出 seasonFactorWith、baseRatio（with 的 regionalBase ÷ without 的），供判定者核对差异是否只来自季节系数（该系数也属本卡去除项，不属 hazardFactor）。
async function pairRun(name,season,level,sid){
 const a=await cellRun(name,true,season,level,sid),b=await cellRun(name,false,season,level,sid);
 const close=(x,y)=>x===y||Math.abs(x-y)<=1e-9*Math.max(Math.abs(x),Math.abs(y));
 const rows=[];
 for(const phase of ['before-advance','after-advance']){
  const ra=a.find(r=>r.phase===phase),rb=b.find(r=>r.phase===phase);
  for(const ia of ra.items){
   const ib=rb.items.find(x=>x.item===ia.item);if(!ib||ia.error||ib.error){rows.push({phase,item:ia.item,error:ia.error??ib?.error??'缺对照'});continue;}
   const fields=Object.fromEntries(['supply','demand','environment','regionalBase','scarcity','listPrice'].map(f=>[f,close(ia[f],ib[f])]));
   rows.push({phase,item:ia.item,withHazard:ia.hazardFactor,withoutHazard:ib.hazardFactor,seasonFactorWith:ra.seasonFactor,baseRatio:ia.regionalBase/ib.regionalBase,
    withListPrice:ia.listPrice,withoutListPrice:ib.listPrice,fields,equal:Object.values(fields).every(Boolean)});
  }
 }
 emit({kind:'modeDiff',case:name,settlement:sid,season,level,rows});
}

// ---------------------------------------------------------------- 2. 连续购买逐件涨幅（含深度项），每件立即输出
async function buyRun(name,withShift){
 for(const item of ['item_bread','item_ration']){
  const b=buildWorld(withShift),w=b.w;
  w.rules.hazardClock.clocks=[];
  w.npcs.find(n=>n.id===KEEPER).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
  const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
  const reached=await advanceTo(ctx,545*DAY+540,'buy');
  ctx.doc.state.location=INN;Object.assign(ctx.doc.state.npcs[KEEPER],{goals:{},trust:20,activity:'营业',location:INN});ctx.doc.state.player.coins=100000;
  const set=setGranary(engine,ctx.doc,HW,Math.round(1.5*mouthsOf(engine,ctx.doc,HW)*reserveDaysOf(engine,HW)));
  await attempt(ctx,'world_act',{action:'core:time',slots:{minutes:1}},'probe-prime');
  const limits=engine.rules.economy.priceFactorLimits.region,clampR=r=>Math.min(Math.max(r,limits[0]),limits[1]);
  const view=()=>{try{
    const d=draftOf(engine,ctx.doc),s=marketSupply(d,engine,item,INN);
    const q=tradeQuote(d,engine,{buyer:'player',seller:KEEPER,item,quantity:1,location:INN,base:()=>regionalTradeBase(d,engine,item,INN)*wildlifePriceFactor(engine,d.document,item,INN)}),x=q.explanation??{};
    const ratio=s.demand/Math.max(1,s.supply);
    return {supply:s.supply,spotSupply:s.spotSupply,demand:s.demand,ratio,ratioClamped:clampR(ratio),atFloor:ratio<=limits[0],atTop:ratio>=limits[1],opening:q.opening,depth:x.depth,scarcity:x.scarcity,
     quotedListPrice:q.listPrice,quotedExactTotal:q.exactTotal};}catch(e){return {error:errorOf(e)};}};
  let prev=null,last=null;
  for(let k=1;k<=BUYS;k++){
   const pre=view();
   const buy=await attempt(ctx,'world_act',{action:'core:trade.buy',slots:{seller:KEEPER,item,quantity:1}},`probe-buy-${k}`);
   const unit=buy.result?.pricing?.unitPrice??null,list=buy.result?.pricing?.listPrice??null;
   const quotedRise=last&&last.quotedExactTotal>0&&pre.quotedExactTotal!==undefined?pre.quotedExactTotal/last.quotedExactTotal-1:null;
   const expectedRise=last&&last.ratioClamped>0&&last.depth>0&&pre.ratioClamped!==undefined&&pre.depth!==undefined?(pre.ratioClamped/last.ratioClamped)*(pre.depth/last.depth)-1:null;
   emit({kind:'buy',case:name,mode:modeName(withShift),item,k,ok:buy.ok,error:buy.error,granarySet:set,jumped:ctx.jumped??false,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),
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
 drought:{label:'久晴旱情（泉村 loc_bs_liquan：crop_damage 与 price 同阶段）',settlement:'loc_bs_liquan',clocks:['price:loc_bs_liquan'],season:1,items:ITEMS,level:1.0,strip:['drought']},
 flood:{label:'洪水断路（镇 loc_bs：route_closure 与 price 同阶段）',settlement:'loc_bs',clocks:['flood:loc_bs'],season:1,items:ITEMS,strip:['flood']},
 epidemic:{label:'疫病药草（河湾 loc_hw：cases、spread 条件整体强制成立；待替换项）',settlement:'loc_hw',clocks:['epidemic:loc_hw'],season:1,items:['item_herb','item_ration'],forceCases:true,strip:['epidemic']},
 // R7 famine 阶段日：河湾 famine:loc_hw 保持原条件，缺口 0.4（36 天口粮：小于 90 天为 tight，小于 45 天为 famine），冬第 630 日 tick（tight）、637 日 tick（famine），推进 10 天。
 'famine-hw':{label:'冬荒阶段日（河湾 loc_hw，保持原条件；with 的 hazardFactor 应为 tight、famine 阶段配置值）',settlement:'loc_hw',clocks:['famine:loc_hw'],season:3,items:ITEMS,keepConditions:true,level:0.4,days:10,strip:['winter']},
 'bs-tight':{label:'镇 loc_bs 删除 tight 阶段后缺粮回退检查（famine:loc_bs 与其依赖的 sangban、tanjie 钟，保持原条件）',settlement:'loc_bs',clocks:['famine:loc_bs','famine:loc_bs_sangban','famine:loc_ms_tanjie'],season:3,items:ITEMS,keepConditions:true,sangbanLevel:0.2,strip:['winter'],extraSettlements:['loc_bs_sangban']},
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
 forceClocks(b.w,spec);
 const w=b.w,engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 const target=(360+spec.season*90-1)*DAY+600;
 const reached=await advanceTo(ctx,target,'case');
 const granarySet=spec.level!==undefined?setGranary(engine,ctx.doc,spec.settlement,Math.round(spec.level*mouthsOf(engine,ctx.doc,spec.settlement)*reserveDaysOf(engine,spec.settlement))):null;
 if(spec.sangbanLevel!==undefined)setGranary(engine,ctx.doc,'loc_bs_sangban',Math.round(spec.sangbanLevel*mouthsOf(engine,ctx.doc,'loc_bs_sangban')*reserveDaysOf(engine,'loc_bs_sangban')));
 const mode=modeName(withShift,control);
 emit({kind:'meta',case:name,mode,label:spec.label,settlement:spec.settlement,clocks:spec.clocks,strippedClasses:b.strippedClasses,stripped:b.removed,stagesDeleted:b.stagesDeleted,priceShiftEffectsInWorld:b.shiftCount,
  granarySet,jumped:ctx.jumped??false,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'})});
 const series=[];
 const snap=day=>{const s={kind:'day',case:name,mode,day,calendar:engine.calendar(ctx.doc.state.minute).text,granary:granaryView(engine,ctx.doc,spec.settlement),
  extraGranary:(spec.extraSettlements??[]).map(x=>({settlement:x,...granaryView(engine,ctx.doc,x)})),
  clocks:Object.fromEntries(spec.clocks.map(id=>[id,clockStages(ctx.doc,id)])),
  items:spec.items.map(i=>itemView(engine,ctx.doc,i,spec.settlement)),
  epidemic:Object.values(ctx.doc.state.records??{}).filter(r=>r?.category==='epidemic').map(r=>({id:r.id,status:r.status,households:Object.keys(r.households??{}).length}))};
  series.push(s);emit(s);return s;};
 snap(0);
 const total=spec.days??(spec.keepConditions?Math.max(days,20):days);
 for(let d=1;d<=total;d++){const adv=await attempt(ctx,'world_time',{minutes:DAY},`probe-case-${d}`);const s=snap(d);if(!adv.ok){s.advanceError=adv.error;emit({kind:'error',case:name,mode,day:d,error:adv.error});break;}}
 return series;
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
   try{const d=draftOf(engine,ctx.doc);emit({kind:'season',case:name,mode:modeName(withShift),buyer:lane.buyer,season,seasonFactors:w.rules.settlementTrade.seasonFactors,seasonFactorsReset:b.seasonFactorsReset,strippedClasses:b.strippedClasses,item,reached:ok,jumped:ctx.jumped??false,
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

// ---------------------------------------------------------------- 情形注册表
const REG={};
const add=(name,estimate,run)=>{REG[name]={estimate,run};};
for(const [tag,sid] of [['',HW],['yupo-',YP]])for(const season of ['winter','autumn'])for(const m of ['with','without'])for(const L of LEVELS)
 add(`${tag}${season}-${m}-${L}`,season==='winter'?'skipTo 到冬第 630 日 + 真实推进 8 天，约 8-16 分钟':'skipTo 到秋第 545 日 + 真实推进 8 天，约 8-16 分钟',name=>cellRun(name,m==='with',season==='winter'?'winter':'normal',L,sid));
for(const [tag,sid] of [['',HW],['yupo-',YP]])for(const season of ['winter','autumn'])for(const L of LEVELS)
 add(`${tag}pair-${season}-${L}`,'skipTo + with、without 各真实推进 8 天，共 16 天，约 16-32 分钟',name=>pairRun(name,season==='winter'?'winter':'normal',L,sid));
for(const m of ['with','without'])add(`famine-hw-${m}`,'skipTo 到冬前一天 + 真实推进 10 天，约 10-20 分钟',name=>caseRun(name,m==='with',CASES['famine-hw'],CASEDAYS));
for(const m of ['with','without'])add(`buys-${m}`,'skipTo + 两物品各 10 件购买，约 5-10 分钟',name=>buyRun(name,m==='with'));
for(const key of ['spring','spring-bs','drought','flood','epidemic']){
 add(`${key}-with`,'真实推进 6 天，约 6-12 分钟',name=>caseRun(name,true,CASES[key],CASEDAYS));
 add(`${key}-without`,'真实推进 6 天，约 6-12 分钟',name=>caseRun(name,false,CASES[key],CASEDAYS));
 add(key,'两种模式各 6 天，约 12-24 分钟',async name=>{const a=await caseRun(name,true,CASES[key],CASEDAYS),b=await caseRun(name,false,CASES[key],CASEDAYS);modeDiff(name,a,b);});
}
add('flood-control','洪水反事实对照（无 route_closure），真实推进 6 天，约 6-12 分钟',name=>caseRun(name,false,CASES.flood,CASEDAYS,true));
add('season-with','skipTo 四季只读，约 3-5 分钟',name=>seasonRun(name,true));
add('season-without','skipTo 四季只读，约 3-5 分钟',name=>seasonRun(name,false));
add('season','with、without 各一次，约 6-10 分钟',async name=>{await seasonRun(name,true);await seasonRun(name,false);});
add('bs-tight-with','skipTo 到冬前一天 + 真实推进 20 天，约 20-40 分钟',name=>caseRun(name,true,CASES['bs-tight'],CASEDAYS));
add('bs-tight-without','skipTo 到冬前一天 + 真实推进 20 天，约 20-40 分钟',name=>caseRun(name,false,CASES['bs-tight'],CASEDAYS));

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
 emit({kind:'start',case:name,estimate:reg.estimate,limits:world0.rules?.economy?.priceFactorLimits?.region??null});
 try{await reg.run(name);}catch(e){emit({kind:'error',case:name,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
 emit({kind:'done',case:name});
}
