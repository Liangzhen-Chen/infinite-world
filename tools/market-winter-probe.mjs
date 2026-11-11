// 价格倍数整类去除只读探针（MKTW 整类卡第一步；李白 11-11 决定 06a7602d、16:5x 扩大、17:0x 事件 15b5a4ea 调整）。
// 目的：同一世界里取"平时（秋）"与"冬季"、不同粮仓缺口程度，输出干粮类物品的价格、供给、需求、供需比与成交价，
// 输出连续购买时每件的涨幅与深度项；并对各类手写倍数（冬荒、旱情、洪水、青黄不接粮价钟、疫病药草、周贸易季节系数）做"有/无倍数"对比。
// 只读：不写盘、不开服务器、不调模型、不 import 任何测试文件；所有改动只在内存里的文档与世界副本上。
// 时间只用 world_time 真实推进（每步 30 天），不直接改分钟；推进失败则该输出标 fixtureUntrusted，不得当规律证据。
// 注意：从种子日期推进到第二年秋约 545 天，云上跑一次较慢，属预期。
// 用法：node tools/market-winter-probe.mjs [--mode=with|without|both] [--cases=...] [--days=N] [--strip=winter,drought,seasonfactor] [--advance=N] [--levels=a,b,c] [--buys=N] [--no-buys] [--settlement=ID]
//   --mode      with=现状；without=内存副本去掉"本卡删除的那批"倍数（默认 --strip 口径），both=两者都跑（默认）。
//   --strip     without 去掉哪几类：winter（全部 famine 钟的 price_shift，并整段删除 famine:loc_bs 的 tight 阶段）、drought（price:loc_bs_liquan 钟）、
//               seasonfactor（settlementTrade.seasonFactors 置 1）、flood（flood:loc_bs 钟，洪水去留待探针结论）、
//               spring（其余 price:* 青黄不接钟，待替换项）、epidemic（疫病药草，待替换项）。默认 winter,drought,seasonfactor；
//               待替换项（spring、epidemic）默认保留，即 without 模式里它们仍生效，只在对应 cases 里单独切换用来量大小。
//   --cases     winter,buys,spring,spring-bs,drought,flood,epidemic,seasonfactor,bs-tight（默认全部）。--days 为各 cases 逐日推进天数（默认 6）。
//   --advance   winter 矩阵里设好粮仓后推进的天数（默认 8，超过冬荒时钟间隔 7 天；0=只读规律层静态值）。
//   --levels    粮仓存量 = 档位 × (聚落餐口 × reserveDays)；默认 1.5,0.9,0.6,0.4,0.2,0.05。
//   --buys      连续购买件数（默认 10）。--settlement 受测聚落（默认 loc_hw；换聚落时加 --no-buys）。
// 季节：冬 = 种子之后的冬季（season 3），平时 = 第二年秋（season 2）。同一世界、同一规则，只差日期。
// 输出：一份 JSON（stdout），含 modeDiff（有/无倍数逐项比对）。判定规则见 F:/dnd-tmp/mktw/冻结规则.md，探针只给量，不在探针里判通过。
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

const DAY=1440,INN='bld_hw_qingdeng',KEEPER='npc_hw_linsui';
// 干粮类被测物品：口粮、燕麦薄饼、面包（goods:food 池）与燕麦原粮（goods:grain 池，公仓同池）。
const ITEMS=['item_ration','item_oat_flatbread','item_bread','item_oats'];
const arg=(name,def)=>{const a=process.argv.find(x=>x.startsWith(`--${name}=`));return a?a.slice(name.length+3):def;};
const flag=name=>process.argv.includes(`--${name}`);
const SID=arg('settlement','loc_hw'),MODE=arg('mode','both'),ADVANCE=Number(arg('advance','8')),BUYS=Number(arg('buys','10')),NOBUYS=flag('no-buys');
const LEVELS=arg('levels','1.5,0.9,0.6,0.4,0.2,0.05').split(',').map(Number);
const STRIP_DEFAULT=arg('strip','winter,drought,seasonfactor').split(',');
const world0=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
const legacy={state:seed.state,memories:seed.memories};
const errorOf=e=>({message:String(e?.message??e),code:e?.code??null});

// ---------------------------------------------------------------- 工具
// 钟的归类：famine:* → winter；price:loc_bs_liquan → drought；其余 price:* → spring；flood:* → flood；epidemic:* → epidemic。
const classOf=id=>id.startsWith('famine:')?'winter':id==='price:loc_bs_liquan'?'drought':id.startsWith('price:')?'spring':id.startsWith('flood:')?'flood':id.startsWith('epidemic:')?'epidemic':'other';
// 内存世界副本：按类去掉 price_shift 效果；winter 类另整段删除 famine:loc_bs 的 tight 阶段（李白 17:0x 决定③）；seasonfactor 类把 seasonFactors 置 1。
// 其余效果（famine、crop_damage、route_closure、rumor）一律不动。返回 {removed 条数, stagesDeleted, seasonFactors 是否置 1}。
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
 }
 // closure 类（只给洪水反事实对照用）：去掉 flood 钟里的 route_closure 效果，其余（flood、price_shift）不动。
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
// 真实推进到目标分钟：world_time 每步至多 30 天。任何一步失败即标 fixtureUntrusted，调用方把该输出记为"夹具不可信"。
async function advanceTo(ctx,minute,tag='adv'){
 let i=0;
 while(ctx.doc.state.minute<minute){
  const m=Math.min(30*DAY,minute-ctx.doc.state.minute);
  const r=await attempt(ctx,'world_time',{minutes:m},`probe-${tag}-${i++}`);
  if(!r.ok){ctx.fixtureUntrusted={at:ctx.doc.state.minute,error:r.error};return false;}
 }
 return true;
}
// 公仓设为 quantity 件（只改内存文档；之后重开账本）。该聚落没有农事账（如镇）则返回 false，不设。
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
// 聚落粮仓与灾荒状态。
function granaryView(engine,doc,sid){
 const s=doc.state.settlements?.[sid];if(!s)return {settlement:sid,note:'没有聚落钱粮账'};
 let mouths=null,reserve=null;try{mouths=mouthsOf(engine,doc,sid);reserve=reserveDaysOf(engine,sid);}catch(e){return {settlement:sid,food:s.food,error:errorOf(e)};}
 const clock=doc.state.records?.[`hazard-clock:famine:${sid}`],price=doc.state.records?.[`hazard-price:${sid}`];
 return {food:s.food,population:s.population,mouths,reserveDays:reserve,reserveTarget:mouths*reserve,coverageOfReserve:s.food/Math.max(1,mouths*reserve),daysOfFood:s.food/Math.max(1,mouths),
  starvation:s.starvation??0,famineActive:Boolean(famineAt(doc.state,sid)),famineStages:clock?.history?.map(h=>h.stage)??null,
  priceShifts:price?Object.fromEntries(Object.entries(price.shifts??{}).map(([k,v])=>[k,{factor:v.factor,items:v.items??null,reason:v.reason}])):null};
}
const clockStages=(doc,id)=>doc.state.records?.[`hazard-clock:${id}`]?.history?.map(h=>h.stage)??null;

// ---------------------------------------------------------------- 1. 季节 × 缺口 矩阵（winter）
// 只保留 famine:<聚落> 一个时钟，其余时钟不进（减少推进开销，也不让别的时钟改变粮价读数）。
async function cell(withShift,season,level){
 const b=buildWorld(withShift),w=b.w;
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>r.id===`famine:${SID}`);
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 // 冬 = 种子日期后推进 2 天进入冬；平时 = 推进到第二年秋（第 545 日）。
 const reached=season==='winter'?await advanceTo(ctx,doc.state.minute+2*DAY,'winter'):await advanceTo(ctx,545*DAY+600,'autumn');
 const target=mouthsOf(engine,ctx.doc,SID)*reserveDaysOf(engine,SID);
 const set=setGranary(engine,ctx.doc,SID,Math.round(level*target));
 const before=granaryView(engine,ctx.doc,SID),viewsBefore=ITEMS.map(i=>itemView(engine,ctx.doc,i));
 let advanced=null;
 if(ADVANCE>0)advanced=await attempt(ctx,'world_time',{minutes:ADVANCE*DAY},'probe-advance');
 const cal=engine.calendar(ctx.doc.state.minute);
 return {mode:withShift?'with':'without',strippedClasses:b.strippedClasses,stripped:b.removed,stagesDeleted:b.stagesDeleted,seasonFactorsReset:b.seasonFactorsReset,priceShiftEffectsInWorld:b.shiftCount,
  season,seasonIndex:cal.season,calendar:cal.text,level,granarySet:set,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),
  advance:{days:ADVANCE,ok:advanced?advanced.ok:null,error:advanced?.error},granaryBefore:before,granaryAfter:granaryView(engine,ctx.doc,SID),
  itemsBefore:viewsBefore,itemsAfter:ITEMS.map(i=>itemView(engine,ctx.doc,i))};
}

// ---------------------------------------------------------------- 2. 连续购买逐件涨幅（含深度项）
// 场景参数：林穗全天在青灯酒馆营业，玩家钱充足，与 tools/market-probe.mjs 的 a2-dialogue-7 同形；平时（第二年秋），粮仓满仓。
// 逐件输出 depth（marketQuote 的深度项）、opening、稀缺度，并由相邻两次读数算出 expectedRise =（夹取后供需比之比 × 深度项之比）− 1，与 quotedRiseVsPrev（精确总价之比 − 1）并列，
// consistencyError = |quotedRise − expectedRise|，未夹取时应 ≤ 1e-6（冻结规则 R6）。
async function buySeries(withShift,item){
 const b=buildWorld(withShift),w=b.w;
 w.rules.hazardClock.clocks=[];
 w.npcs.find(n=>n.id===KEEPER).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc},rows=[];
 const reached=await advanceTo(ctx,545*DAY+540,'buy');
 ctx.doc.state.location=INN;Object.assign(ctx.doc.state.npcs[KEEPER],{goals:{},trust:20,activity:'营业',location:INN});ctx.doc.state.player.coins=100000;
 const set=setGranary(engine,ctx.doc,SID,Math.round(1.5*mouthsOf(engine,ctx.doc,SID)*reserveDaysOf(engine,SID)));
 await attempt(ctx,'world_act',{action:'core:time',slots:{minutes:1}},'probe-prime');
 const limits=engine.rules.economy.priceFactorLimits.region,clampR=r=>Math.min(Math.max(r,limits[0]),limits[1]);
 const view=()=>{try{
   const d=draftOf(engine,ctx.doc),s=marketSupply(d,engine,item,INN);
   const q=tradeQuote(d,engine,{buyer:'player',seller:KEEPER,item,quantity:1,location:INN,base:()=>regionalTradeBase(d,engine,item,INN)*wildlifePriceFactor(engine,d.document,item,INN)}),x=q.explanation??{};
   const ratio=s.demand/Math.max(1,s.supply);
   return {supply:s.supply,spotSupply:s.spotSupply,demand:s.demand,ratio,ratioClamped:clampR(ratio),atFloor:ratio<=limits[0],atTop:ratio>=limits[1],opening:q.opening,depth:x.depth,scarcity:x.scarcity,
    quotedListPrice:q.listPrice,quotedExactTotal:q.exactTotal};}catch(e){return {error:errorOf(e)};}};
 let prev=null;
 for(let k=1;k<=BUYS;k++){
  const pre=view();
  const buy=await attempt(ctx,'world_act',{action:'core:trade.buy',slots:{seller:KEEPER,item,quantity:1}},`probe-buy-${k}`);
  const unit=buy.result?.pricing?.unitPrice??null,list=buy.result?.pricing?.listPrice??null,last=rows.length?rows[rows.length-1].pre:null;
  const quotedRise=last&&last.quotedExactTotal>0&&pre.quotedExactTotal!==undefined?pre.quotedExactTotal/last.quotedExactTotal-1:null;
  const expectedRise=last&&last.ratioClamped>0&&last.depth>0&&pre.ratioClamped!==undefined&&pre.depth!==undefined?(pre.ratioClamped/last.ratioClamped)*(pre.depth/last.depth)-1:null;
  rows.push({k,ok:buy.ok,error:buy.error,unitPrice:unit,listPrice:list,cost:buy.result?.cost,pre,
   unitRiseVsPrev:prev!==null&&unit!==null&&prev>0?unit/prev-1:null,quotedRiseVsPrev:quotedRise,expectedRise,
   consistencyError:quotedRise!==null&&expectedRise!==null?Math.abs(quotedRise-expectedRise):null,
   supplyDelta:last&&pre.supply!==undefined?pre.supply-last.supply:null,demandDelta:last&&pre.demand!==undefined?pre.demand-last.demand:null,
   depthDelta:last&&pre.depth!==undefined?pre.depth-last.depth:null});
  if(unit!==null)prev=unit;
  if(!buy.ok)break;
 }
 return {mode:withShift?'with':'without',item,granarySet:set,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),rows};
}

// ---------------------------------------------------------------- 3. 其它手写倍数情形（逐日时间序列）
// 夹具：只保留该情形的钟（及其依赖的钟）、目标季节、间隔 1 天、阶段概率 1、天气条件改 always；疫病情形把 all 条件整体换成 always、epidemic_cases 换成 always
// （不再取 all 的第一项，也不把被 hazard_phase 引用的钟过滤成不存在：epidemic 钟的 cases 阶段原条件是 all[hazard_phase flood:loc_hw≥2, hunger]，整体强制成立后才会走到 spread）。
// 每天读数含：倍数、供给、需求、供需比、列价、粮仓、钟的阶段史、疫病记录。价格方向由供需变化决定，不与旧倍数比较。
// strip：该情形 without 模式去掉的类（覆盖默认）；spring、epidemic 为"待替换"项，仅在对应情形里单独切换以量出大小。
const CASES={
 spring:{label:'春季青黄不接粮价钟（河湾 loc_hw：rise/peak/ease，待替换项）',settlement:'loc_hw',clocks:['price:loc_hw'],season:1,items:ITEMS,level:1.0,strip:['spring']},
 'spring-bs':{label:'春季青黄不接粮价钟（镇 loc_bs，待替换项）',settlement:'loc_bs',clocks:['price:loc_bs'],season:1,items:ITEMS,strip:['spring']},
 drought:{label:'久晴旱情（泉村 loc_bs_liquan：crop_damage 与 price 同阶段）',settlement:'loc_bs_liquan',clocks:['price:loc_bs_liquan'],season:1,items:ITEMS,level:1.0,strip:['drought']},
 flood:{label:'洪水断路（镇 loc_bs：route_closure 与 price 同阶段；有无源头原因待此探针结论）',settlement:'loc_bs',clocks:['flood:loc_bs'],season:1,items:ITEMS,strip:['flood'],controlStrip:['flood','closure']},
 epidemic:{label:'疫病药草（河湾 loc_hw：cases、spread 条件整体强制成立；待替换项）',settlement:'loc_hw',clocks:['epidemic:loc_hw'],season:1,items:['item_herb','item_ration'],forceCases:true,strip:['epidemic']},
 'bs-tight':{label:'镇 loc_bs 删除 tight 阶段后缺粮回退检查（famine:loc_bs 与其依赖的 sangban、tanjie 钟，保持原条件）',settlement:'loc_bs',clocks:['famine:loc_bs','famine:loc_bs_sangban','famine:loc_ms_tanjie'],season:3,items:ITEMS,keepConditions:true,sangbanLevel:0.2,strip:['winter'],extraSettlements:['loc_bs_sangban']},
};
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
// control=true：反事实对照（flood 情形：去掉 price_shift 与 route_closure，其余完全相同），输出 mode 记为 'control'。
async function caseRun(withShift,spec,days,control=false){
 const b=control?buildWorld(false,spec.controlStrip):buildWorld(withShift,spec.strip);
 forceClocks(b.w,spec);
 const w=b.w,engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc};
 // 目标季节第 10 日；冬季 bs-tight 取种子后的冬季（推进 2 天）。真实推进，不直接改分钟。
 const target=spec.season===3?doc.state.minute+2*DAY:(360+spec.season*90+10)*DAY+600;
 const reached=await advanceTo(ctx,target,'case');
 const granarySet=spec.level!==undefined?setGranary(engine,ctx.doc,spec.settlement,Math.round(spec.level*mouthsOf(engine,ctx.doc,spec.settlement)*reserveDaysOf(engine,spec.settlement))):null;
 if(spec.sangbanLevel!==undefined)setGranary(engine,ctx.doc,'loc_bs_sangban',Math.round(spec.sangbanLevel*mouthsOf(engine,ctx.doc,'loc_bs_sangban')*reserveDaysOf(engine,'loc_bs_sangban')));
 const snap=day=>({day,calendar:engine.calendar(ctx.doc.state.minute).text,granary:granaryView(engine,ctx.doc,spec.settlement),
  extraGranary:(spec.extraSettlements??[]).map(s=>({settlement:s,...granaryView(engine,ctx.doc,s)})),
  clocks:Object.fromEntries(spec.clocks.map(id=>[id,clockStages(ctx.doc,id)])),
  items:spec.items.map(i=>itemView(engine,ctx.doc,i,spec.settlement)),
  epidemic:Object.values(ctx.doc.state.records??{}).filter(r=>r?.category==='epidemic').map(r=>({id:r.id,status:r.status,households:Object.keys(r.households??{}).length}))});
 const series=[snap(0)];
 const total=spec.keepConditions?Math.max(days,20):days; // bs-tight 保持原条件，钟间隔 7 天，至少看 20 天
 for(let d=1;d<=total;d++){const adv=await attempt(ctx,'world_time',{minutes:DAY},`probe-case-${d}`);const s=snap(d);if(!adv.ok)s.advanceError=adv.error;series.push(s);if(!adv.ok)break;}
 return {case:spec.label,settlement:spec.settlement,clocks:spec.clocks,mode:control?'control':withShift?'with':'without',strippedClasses:b.strippedClasses,stripped:b.removed,stagesDeleted:b.stagesDeleted,priceShiftEffectsInWorld:b.shiftCount,
  granarySet,fixtureUntrusted:ctx.fixtureUntrusted??(reached?null:{error:'未推进到目标日'}),series};
}
// 周贸易季节系数：每条受粮线的买方聚落，燕麦区域基价在四个季节各取一次（真实推进到各季第 10 日后读，不跳日期）；with 含 seasonFactors，without 全为 1。
async function seasonFactorRun(withShift){
 const b=buildWorld(withShift,['seasonfactor']),w=b.w;
 w.rules.hazardClock.clocks=[];
 const engine=new WorldEngine(w),doc=engine.createCharacter(legacy,{},'mktw-winter-probe'),ctx={engine,doc},item=w.rules.settlementTrade.item,rows=[];
 for(const season of [3,0,1,2]){ // 种子在秋末：先冬，再下一年春、夏、秋，依次推进
  const target=season===3?ctx.doc.state.minute+2*DAY:(360+season*90+10)*DAY+600;
  const ok=await advanceTo(ctx,target,`sf${season}`);
  for(const lane of w.rules.settlementTrade.lanes){
   try{const d=draftOf(engine,ctx.doc);rows.push({buyer:lane.buyer,season,seasonFactors:w.rules.settlementTrade.seasonFactors,item,reached:ok,
    regionalBase:regionalTradeBase(d,engine,item,lane.buyer),regionalTradePrice:regionalTradePrice(d,engine,item,lane.buyer),view:itemView(engine,ctx.doc,item,lane.buyer)});}
   catch(e){rows.push({buyer:lane.buyer,season,error:errorOf(e)});}
  }
 }
 return {case:'周贸易季节系数',mode:withShift?'with':'without',strippedClasses:b.strippedClasses,seasonFactorsReset:b.seasonFactorsReset,fixtureUntrusted:ctx.fixtureUntrusted??null,rows};
}

// ---------------------------------------------------------------- 入口
const modes=MODE==='both'?[true,false]:MODE==='with'?[true]:MODE==='without'?[false]:null;
if(!modes){console.error('--mode 只能是 with、without 或 both');process.exit(2);}
const WANT=new Set(arg('cases','winter,buys,spring,spring-bs,drought,flood,epidemic,seasonfactor,bs-tight').split(','));
const CASEDAYS=Number(arg('days','6'));
const out={probe:'market-winter-probe',args:{mode:MODE,advance:ADVANCE,levels:LEVELS,buys:BUYS,items:ITEMS,settlement:SID,cases:[...WANT],caseDays:CASEDAYS,stripDefault:STRIP_DEFAULT},
 limits:world0.rules?.economy?.priceFactorLimits?.region??null,
 note:'with=现状；without=内存副本按 strip 类去掉倍数（默认 winter、drought、seasonfactor；winter 含整段删除 famine:loc_bs 的 tight）。famine、crop_damage、route_closure 等源头效果保留；待替换项（spring、epidemic）只在对应情形单独切换。',
 matrix:[],buySeries:[],cases:[],modeDiff:{matrix:[],cases:[]}};
if(WANT.has('winter'))for(const withShift of modes)for(const season of ['normal','winter'])for(const level of LEVELS){
 try{out.matrix.push(await cell(withShift,season,level));}
 catch(e){out.matrix.push({mode:withShift?'with':'without',season,level,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
if(WANT.has('buys')&&!NOBUYS)for(const withShift of modes)for(const item of ['item_bread','item_ration']){
 try{out.buySeries.push(await buySeries(withShift,item));}
 catch(e){out.buySeries.push({mode:withShift?'with':'without',item,error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
for(const name of Object.keys(CASES))if(WANT.has(name)){
 for(const withShift of modes){
  try{out.cases.push(await caseRun(withShift,CASES[name],CASEDAYS));}
  catch(e){out.cases.push({case:CASES[name].label,mode:withShift?'with':'without',error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
 }
 if(CASES[name].controlStrip){ // 反事实对照只跑一份（mode=control），与 without 同日逐项比较
  try{out.cases.push(await caseRun(false,CASES[name],CASEDAYS,true));}
  catch(e){out.cases.push({case:CASES[name].label,mode:'control',error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
 }
}
if(WANT.has('seasonfactor'))for(const withShift of modes){
 try{out.cases.push(await seasonFactorRun(withShift));}
 catch(e){out.cases.push({case:'周贸易季节系数',mode:withShift?'with':'without',error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)});}
}
// 有/无倍数逐项比对（冻结规则 R5②：不触发倍数的日期应逐项相等）。
if(modes.length===2){
 for(const a of out.matrix.filter(r=>r.mode==='with'&&r.itemsAfter)){
  const b=out.matrix.find(r=>r.mode==='without'&&r.season===a.season&&r.level===a.level&&r.itemsAfter);if(!b)continue;
  for(const ia of a.itemsAfter){const ib=b.itemsAfter.find(x=>x.item===ia.item);out.modeDiff.matrix.push({season:a.season,level:a.level,item:ia.item,withPrice:ia.listPrice,withoutPrice:ib?.listPrice,equal:ia.listPrice===ib?.listPrice,withHazard:ia.hazardFactor,withoutHazard:ib?.hazardFactor});}
 }
 for(const a of out.cases.filter(r=>r.mode==='with'&&r.series)){
  const b=out.cases.find(r=>r.mode==='without'&&r.case===a.case&&r.series);if(!b)continue;
  for(const sa of a.series){const sb=b.series.find(x=>x.day===sa.day);if(!sb)continue;
   for(const ia of sa.items){const ib=sb.items.find(x=>x.item===ia.item);out.modeDiff.cases.push({case:a.case,day:sa.day,item:ia.item,withPrice:ia.listPrice,withoutPrice:ib?.listPrice,equal:ia.listPrice===ib?.listPrice,withHazard:ia.hazardFactor,withoutHazard:ib?.hazardFactor});}}
 }
}
console.log(JSON.stringify(out,(k,v)=>typeof v==='bigint'?v.toString():v,1));
