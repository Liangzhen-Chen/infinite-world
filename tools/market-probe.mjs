// 市场价格 9 个失败子项的只读探针（MKTPROBE；李白 11-11 选 (a)：按新设计重推期望值前，先看引擎实算的推导链）。
// 只读：不写盘、不开服务器、不调模型；每个子项在内存里用与对应测试相同的前置状态搭出世界，用真实动作推进，
// 打印该子项断言所比较的量，以及推导链上的中间量（需求、供给、供需比、夹取后的价格因子、价格锚点、成交价、深度、预支额、铜钱数）。输出为一份 JSON（stdout）。
// 用法：node tools/market-probe.mjs [子项名 ...]；无参数输出全部。子项名不带 "-" 开头：
//   seasonal-hazards-4  a1-lt-scenarios-7  s5-f-tender-3  s5-f-tender-5  s5-f-tender-6
//   s5-w4-economy-3  s5-w4-economy-11  m3-acceptance-M9  a2-dialogue-7
//   s5-f-tender-3-after  s5-f-tender-5-after  s5-f-tender-6-after（前提改后：请求量取单笔上限整数下界，输出新的断言量，供填入测试的待探针占位）
// 场景参数各自出自哪个测试的哪几行，见每个场景函数上方的注释；这里不 import 任何测试文件，也不复制测试用例，
// 断言本身不在探针里，探针只给出断言所比较的量，期望值由复算者对照推导链自行判断。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from './a3-score.mjs';
import {tradeQuote,assertMarketDepth} from '../server-plugin/shop.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {marketSupply,marketQuote,saleableStock,goodsClass,registerShopShelves,supplyApart,laborValue} from '../server-plugin/market.mjs';
import {regionalTradeBase,regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {hazardPriceFactor} from '../server-plugin/hazard-calendar.mjs';
import {exchangeRate} from '../server-plugin/currency.mjs';
import {turnoverByResource,turnoverReference} from '../server-plugin/tender.mjs';
import {factionClockRules} from '../server-plugin/faction-clock.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';

const DAY=1440;
const world=await loadWorld();
// 种子存档：server-plugin/legacy/seed.json 与 tests/fixtures/legacy/seed.json 内容一致（服务器 /create 读前者）。
const seed=JSON.parse(await fs.readFile(new URL('../server-plugin/legacy/seed.json',import.meta.url),'utf8'));
const legacy={state:seed.state,memories:seed.memories};

// ---------------------------------------------------------------- 通用工具
const errorOf=e=>({message:String(e?.message??e),code:e?.code??null});
const quantityOf=v=>typeof v==='number'?v:v?.quantity??0;
async function step(ctx,tool,args,eventId){
 const out=await ctx.engine.reduce(ctx.doc,{tool,args,eventId});
 ctx.doc=applyPatches(ctx.doc,out.patches);
 return out.result;
}
// 记一步：成功给结果，被拒绝给错误文字（后面的步骤照常继续，推导链不因一处拒绝而断）。
async function attempt(ctx,label,tool,args,eventId){
 const row={label,tool,args};
 try{row.result=await step(ctx,tool,args,eventId);row.ok=true;}catch(e){row.ok=false;row.error=errorOf(e);}
 return row;
}
// 一件货所属“同类货物”的供需快照：marketSupply 的供给与需求、供需比、夹取后的因子，各持有人的存量/留存/可售，货架上限。
function marketView(engine,doc,item,location){
 try{
  const d=engine.primitiveDraft(doc),state=d.get('state'),s=marketSupply(d,engine,item,location);
  const limits=engine.rules.economy.priceFactorLimits.region,ratio=s.demand/Math.max(1,s.supply);
  const items=engine.world.items.filter(i=>goodsClass(engine,i.id)===s.goods).map(i=>i.id);
  const rows=(s.rows??[]).map(r=>({owner:r.owner,item:r.item,stock:r.stock,retained:r.retained,committed:r.committed,available:r.available}));
  const sum=key=>rows.reduce((n,r)=>n+(r[key]??0),0);
  const holders=[];
  for(const id of ['player',...Object.keys(state.npcs??{})])for(const it of items){
   const r=saleableStock(d,engine,id,it);
   if(r.stock||r.retained||r.committed)holders.push({id,at:state.npcs?.[id]?.location??state.location,item:it,stock:r.stock,retained:r.retained,upkeep:r.upkeep,committed:r.committed,available:r.available});
  }
  const shelves=(registerShopShelves.fn?.(engine,s.place)??[]).filter(r=>items.includes(r.item)).map(r=>({item:r.item,maximum:r.maximum,reserve:r.reserve??0}));
  return {item,location,place:s.place,goods:s.goods,classItems:items,supply:s.supply,spotSupply:s.spotSupply,expectedForward:s.expected,demand:s.demand,
   ratio,limits,ratioClamped:Math.min(Math.max(ratio,limits[0]),limits[1]),atFloor:ratio<=limits[0],
   supplyRows:{count:rows.length,stock:sum('stock'),retained:sum('retained'),committed:sum('committed'),available:sum('available'),rows},
   holders,shelfCeiling:shelves.reduce((n,r)=>n+r.maximum+r.reserve,0),shelves};
 }catch(e){return {item,location,error:errorOf(e)};}
}
// 单次报价分解：基准、稀缺度（夹取后）、品质、价差、深度、关系、单价、精确总价、取整总价。
function regionalQuoteView(engine,doc,{item,location,seller,buyer='player',quantity=1,business=null,relation=1}){
 try{
  const d=engine.primitiveDraft(doc),q=marketQuote(d,engine,{item,location,seller,buyer,quantity,business,relation,base:regionalTradeBase(d,engine,item,location)}),x=q.explanation;
  return {item,quantity,side:q.side,retail:q.retail,opening:q.opening,spotSupply:q.spotSupply,supply:q.supply,demand:q.demand,baseline:x.baseline,environment:x.environment,base:x.base,
   scarcity:x.scarcity,quality:x.quality,depth:x.depth,spread:x.spread,relation:x.relation,listPrice:q.listPrice,exactTotal:q.exactTotal,totalCoins:q.totalCoins};
 }catch(e){return {item,quantity,error:errorOf(e)};}
}
// 平民日工资口径（合理性抽查用）：技能阶 0 的典型日收入表区间中点，经 economy:wage 派生；另给表本身。
const wageView=(engine,doc)=>{try{const w=laborValue(engine,doc,{worker:'player'});return {dailyCopper:w.daily,value:w.value,table:engine.rules.economy.dailyIncomeBySkillStage};}catch(e){return {error:errorOf(e)};}};
// 真实交易用的报价（engine.mjs:701 同参数）：shop.tradeQuote，带店铺 business、关系系数、野生因子；并给出 assertMarketDepth 两个分支的全部输入。
// buyer/seller 按动作方向给：玩家买 = buyer 'player'、seller 为 NPC；玩家卖 = 反之。
function quoteView(engine,doc,{item,location,seller,buyer='player',quantity=1}){
 try{
  const d=engine.primitiveDraft(doc),q=tradeQuote(d,engine,{buyer,seller,item,quantity,location,base:()=>regionalTradeBase(d,engine,item,location)*wildlifePriceFactor(engine,d.document,item,location)}),x=q.explanation??{};
  const r=engine.world.marketRules??{},state=d.get('state');
  const deals=Object.values(state.records??{}).filter(row=>row.category==='market_trade'&&row.day===q.day&&row.goods===q.goods&&(q.business?row.business===q.business:row.seller===q.seller&&row.buyer===q.buyer));
  const used=deals.reduce((n,row)=>n+row.quantity,0),spot=q.spotSupply??q.supply;
  const maxShareCap=Math.max(r.retailFloor,spot*r.maxShare),branchA=!q.retail&&q.quantity>maxShareCap;
  const dailyCap=q.business?Math.max(r.retailFloor,q.opening*r.dailyShare):null,branchB=Boolean(q.business)&&used+q.quantity>dailyCap;
  let assertDepth=null;try{assertMarketDepth(d,engine,q);assertDepth={passed:true};}catch(e){assertDepth={passed:false,error:errorOf(e)};}
  return {item,quantity:q.quantity,buyer,seller,business:q.business??null,agreed:q.agreed??false,side:q.side,retail:q.retail,opening:q.opening,spotSupply:q.spotSupply,supply:q.supply,demand:q.demand,
   baseline:x.baseline,environment:x.environment,base:x.base,scarcity:x.scarcity,quality:x.quality,depth:x.depth,spread:x.spread,relation:x.relation,listPrice:q.listPrice,exactTotal:q.exactTotal,totalCoins:q.totalCoins,
   depthCheck:{retailFloor:r.retailFloor,maxShare:r.maxShare,dailyShare:r.dailyShare,maxShareCap,branchA,used,dealsCounted:deals.length,dailyCap,branchB,assertMarketDepth:assertDepth}};
 }catch(e){return {item,quantity,error:errorOf(e)};}
}
// 机械标记：按步骤先后给每个输出量一个角色。第一处失败之前，kind 为 assertion 的量可作比较对象（assertion）、其余为 intermediate；
// 第一处失败本身记 rejection-point；其后的步骤一律 downstream-after-rejection，不作期望值。ok 为该步是否成功。
function fieldRoles(steps){
 let rejected=false;const out={};
 for(const st of steps){
  if(rejected)out[st.path]='downstream-after-rejection';
  else if(!st.ok){out[st.path]='rejection-point';rejected=true;}
  else out[st.path]=st.kind;
 }
 return out;
}
const itemFacts=(engine,id)=>{const it=engine.byId.get(id);return {id,basePrice:it?.basePrice,satiety:it?.nutrition?.satiety??null,tags:it?.tags??null};};
const depthRule=engine=>{const r=engine.world.marketRules??{};return {depthImpact:r.depthImpact,retailFloor:r.retailFloor,retailShare:r.retailShare,maxShare:r.maxShare,dailyShare:r.dailyShare,spread:r.spread};};
// 单笔可成交深度上限（market.mjs assertMarketDepth 的公式）：非零售量 ≤ max(retailFloor, 现货供给 × maxShare)。
const skipTo=(engine,doc,minute)=>{ // 同 tests/fixtures/skip-clock.mjs 的思路：直接跳分钟时，势力日钟也跳到下一个边界
 doc.state.minute=minute;
 for(const rule of factionClockRules(engine)){
  const key=Object.keys(doc.state.records??{}).find(k=>doc.state.records[k]?.category==='faction_clock'&&doc.state.records[k].id===rule.id);
  if(!key)continue;const row=doc.state.records[key];
  if(row.nextAt<minute)doc.state.records[key]={...row,nextAt:Math.ceil(minute/DAY/rule.intervalDays)*rule.intervalDays*DAY};
 }
};

// ---------------------------------------------------------------- 1. seasonal-hazards #4 冬荒
// 场景参数出自 tests/seasonal-hazards.test.mjs：spring() 21-30 行、setup() 31-42 行、#4 用例 115-126 行（等 3 天后读 item_ration 在 loc_hw 的区域价）。
async function seasonalHazards4(){
 const U3=['flood:loc_hw','epidemic:loc_hw','price:loc_bs','famine:loc_hw'];
 const w=structuredClone(world);
 for(const n of w.npcs){delete n.schedule;delete n.tier;}
 w.rules.hazardClock.clocks=w.rules.hazardClock.clocks.filter(r=>U3.includes(r.id));
 for(const r of w.rules.hazardClock.clocks){
  r.seasons=[0];r.intervalDays=r.kind==='epidemic'||r.kind==='famine'?1:r.kind==='flood'?2:2;
  for(const s of r.stages){s.probability=1;if(s.condition.kind==='all')s.condition=s.condition.conditions[0];if(s.condition.kind==='weather')s.condition={kind:'always'};if(s.condition.kind==='granary_short')s.condition.days=1000;}
 }
 const engine=new WorldEngine(w),ctx={engine,doc:engine.createCharacter(legacy,{},'hazard-famine')};
 const waited=await attempt(ctx,'等 3 天','world_time',{minutes:3*DAY},'wait');
 const d=engine.primitiveDraft(ctx.doc),item='item_ration',loc='loc_hw';
 return {compares:'regionalTradePrice(item_ration, loc_hw)（tests/seasonal-hazards.test.mjs:126）',
  waited:{ok:waited.ok,error:waited.error},
  famineStages:ctx.doc.state.records?.['hazard-clock:famine:loc_hw']?.history?.map(h=>h.stage)??null,
  hazardFactor:hazardPriceFactor(engine,ctx.doc.state,item,loc),
  item:itemFacts(engine,item),regionalTradeBase:regionalTradeBase(d,engine,item,loc),regionalTradePrice:regionalTradePrice(d,engine,item,loc),
  market:marketView(engine,ctx.doc,item,loc),quote:regionalQuoteView(engine,ctx.doc,{item,location:loc,seller:null,quantity:1}),priceFactorLimitsRegion:engine.rules.economy.priceFactorLimits.region};
}

// ---------------------------------------------------------------- 2. a1-lt-scenarios #7 L5 部分收购
// 场景参数出自 tests/a1-lt-scenarios.test.mjs：夹具 at()/uiSession 种子 'a1-lt-scenarios' 17-25 行；用例 93-110 行
// （青灯酒馆 10:00，林穗钱袋 6、玩家背包 20 个面包，允许部分收购卖 20 个，比较 result.cost 与成交数量）。
async function a1Partial7(){
 const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui';
 const engine=new WorldEngine(structuredClone(world)),doc=engine.initialFromLegacy(legacy,'a1-lt-scenarios');
 doc.state.location=INN;doc.state.minute=10*60;doc.state.npcs[LINSUI].coins=6;doc.state.inventory.item_bread={quantity:20};
 const ctx={engine,doc},before={market:marketView(engine,doc,'item_bread',INN),quote:quoteView(engine,doc,{item:'item_bread',location:INN,seller:'player',buyer:LINSUI,quantity:20}),item:itemFacts(engine,'item_bread')};
 const docBefore=ctx.doc; // 卖之前的文档状态，供按实际成交量重新报价
 const sell=await attempt(ctx,'卖面包 20，允许部分','world_act',{action:'core:trade.sell_to',slots:{buyer:LINSUI,item:'item_bread',quantity:20,allowPartial:true}},'ui-1');
 const r=sell.result??{};
 const requote=r.quantity?quoteView(engine,docBefore,{item:'item_bread',location:INN,seller:'player',buyer:LINSUI,quantity:r.quantity}):null;
 return {compares:'result.cost 与 result.quantity（tests/a1-lt-scenarios.test.mjs:104）',before:{...before,quoteNote:'before.quote 按请求量 20 报价，部分成交缩量后不与 result.pricing 核对；核对用 requoteAtFilledQuantity'},requoteAtFilledQuantity:requote,
  requoteVsPricing:requote&&r.pricing?{requoteListPrice:requote.listPrice,pricingUnitPrice:r.pricing.unitPrice,pricingListPrice:r.pricing.listPrice,unitDiff:r.pricing.unitPrice===undefined?null:r.pricing.unitPrice-requote.listPrice,requoteExactTotal:requote.exactTotal,pricingUnroundedTotal:r.pricing.unroundedTotal,totalDiff:r.pricing.unroundedTotal===undefined?null:r.pricing.unroundedTotal-requote.exactTotal}:null,
  sell:{ok:sell.ok,error:sell.error,cost:r.cost,quantity:r.quantity,partial:r.partial,requestedQuantity:r.requestedQuantity,pricing:r.pricing},
  after:{playerCoins:ctx.doc.state.player.coins,linsuiCoins:ctx.doc.state.npcs[LINSUI].coins,market:marketView(engine,ctx.doc,'item_bread',INN)}};
}

// ---------------------------------------------------------------- 3-5. s5-f-tender
// 夹具出自 tests/s5-f-tender.test.mjs:19-52（tenderWorld、fixture、atShop、issue、rate）。
const TH={host:'npc_hw_linsui',keeper:'npc_hw_shendu',post:'bld_hw_post',shop:'bld_hw_qingdeng',NOTE:'coin_hw_note'};
function tenderFixture(){
 const w=structuredClone(world);
 w.rules.law.codes.find(c=>c.id==='law_hw_property').recognition.legalTender.unit=TH.NOTE;
 w.rules.law.codes.find(c=>c.id==='law_yp_property').recognition.legalTender.unit='item_wool';
 w.currencyRules.currencies.find(c=>c.resource===TH.NOTE).money.backedBy.ratio=10;
 const engine=new WorldEngine(w),initial=engine.createCharacter(legacy,{},'s5f-tender');
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:TH.post,coins:3000,inventory:{}});
 const f={engine,doc:prepared.document,setupUnmet:prepared.setupUnmet};
 f.trade=(label,args,id)=>attempt(f,label,'world_trade',{seller:TH.host,...args},id);
 f.issue=(quantity,id)=>attempt(f,`发行 ${quantity} 张券`,'world_act',{action:'core:trade.exchange',slots:{seller:TH.keeper,item:'item_banknote_hw',quantity,buyer:'player',mode:'issue'}},id);
 f.atShop=(extra={})=>{
  const s=applyIntentSetup(engine,f.doc,{location:TH.shop,facts:[{path:['state','npcs',TH.host,'inventory'],value:{item_bread:{quantity:100,quality:'木'},...extra}},{path:['state','npcs',TH.host,'coins'],value:1000}]});
  f.doc=s.document;return s.setupUnmet;
 };
 f.notes=id=>(id==='player'?f.doc.state.inventory:f.doc.state.npcs[id].inventory).item_banknote_hw?.quantity??0;
 f.rate=()=>exchangeRate(engine.primitiveDraft(f.doc),engine,{from:TH.NOTE,location:TH.shop}).rate;
 return f;
}
// 一笔面包交易的观察：成交结果摘要 + 交易前的市场与深度上限。
async function breadTrade(f,label,args,id){
 const e=f.engine,view=marketView(e,f.doc,'item_bread',TH.shop),today=Math.floor(f.doc.state.minute/DAY),
  dealsToday=Object.values(f.doc.state.records??{}).filter(r=>r.category==='market_trade'&&r.day===today&&r.goods===view.goods).map(r=>({seller:r.seller,buyer:r.buyer,side:r.side,item:r.item,quantity:r.quantity,totalCoins:r.totalCoins})),
  pre={market:view,dealsToday,dealsTodayQuantity:dealsToday.reduce((n,r)=>n+(r.quantity??0),0),
  quote:quoteView(e,f.doc,{item:'item_bread',location:TH.shop,seller:TH.host,quantity:args.quantity})};
 const row=await f.trade(label,args,id),r=row.result??{};
 return {label,args,pre,ok:row.ok,error:row.error,debt:r.debt,cost:r.cost,paidWith:r.paidWith,tender:r.tender,pricing:r.pricing};
}
// S5F-3：tests/s5-f-tender.test.mjs:91-108。私人羊毛 40，先买 25 个面包付羊毛，再买 21 个（比较第二笔的 paidWith.amount）。
// 前提改后（MKTFIX）：第二笔/冲击笔/用券笔的请求量取引擎此刻单笔上限的整数下界 floor(max(retailFloor, 现货供给×maxShare))，与改后的测试 depthLimit 同公式。
const depthLimitOf=(f)=>{const v=marketView(f.engine,f.doc,'item_bread',TH.shop),r=f.engine.world.marketRules;return Math.floor(Math.max(r.retailFloor,v.spotSupply*r.maxShare));};
async function tender3(after=false){
 const f=tenderFixture(),unmetShop=f.atShop();
 const wool=applyIntentSetup(f.engine,f.doc,{location:TH.shop,inventory:{item_wool:40}});f.doc=wool.document;
 const first=await breadTrade(f,'第 1 笔 面包 25 付羊毛',{item:'item_bread',quantity:25,payCurrency:'item_wool'},'f3-wool');
 const q2=after?depthLimitOf(f):21;
 const second=await breadTrade(f,`第 2 笔 面包 ${q2} 付羊毛`,{item:'item_bread',quantity:q2,payCurrency:'item_wool'},'f3-wool-2');
 return {downstreamNote:'深度拒绝只指步骤条目里 error 为“可成交深度”的那一笔（见各 breadTrade 的 pre.quote.depthCheck）；其后各步（还债、券数、统计、折算等）是在该笔被拒的前提下继续算出的下游数字，不作期望值。',compares:'第二笔 paidWith.amount（tests/s5-f-tender.test.mjs:105）',
  setupUnmet:[...f.setupUnmet,...unmetShop,...wool.setupUnmet],item:itemFacts(f.engine,'item_bread'),depthRule:depthRule(f.engine),first,second,
  woolMarket:marketView(f.engine,f.doc,'item_wool',TH.shop),
  fieldRoles:fieldRoles([{path:'first',kind:'intermediate',ok:first.ok},{path:'second',kind:'assertion',ok:second.ok},{path:'woolMarket',kind:'intermediate',ok:true}])};
}
// S5F-5：tests/s5-f-tender.test.mjs:140-149。发行 10 张券、赊 5 个面包、再用券买 25 个面包、用原币种还债（比较玩家与店主的券数）。
async function tender5(after=false){
 const f=tenderFixture();
 const issued=await f.issue(10,'f5-issue');const setupUnmet=f.atShop();
 const credit=await breadTrade(f,'赊账 面包 5',{item:'item_bread',quantity:5,payment:'credit',creditMinutes:600},'f5-credit');
 const qs=after?depthLimitOf(f):25;
 const shock=await breadTrade(f,`用券买 面包 ${qs}`,{item:'item_bread',quantity:qs,payCurrency:TH.NOTE},'f5-shock');
 const debtId=credit.debt??null;
 const repay=debtId?await f.trade('原币种还债',{debt:debtId,payment:'repay'},'f5-repay'):{ok:false,error:{message:'没有找到债（赊账未成立）'}};
 return {downstreamNote:'深度拒绝只指步骤条目里 error 为“可成交深度”的那一笔（见各 breadTrade 的 pre.quote.depthCheck）；其后各步（还债、券数、统计、折算等）是在该笔被拒的前提下继续算出的下游数字，不作期望值。',compares:'玩家与店主的券数（tests/s5-f-tender.test.mjs:147）',setupUnmet:[...f.setupUnmet,...setupUnmet],issued:{ok:issued.ok,error:issued.error},credit,shock,
  repay:{ok:repay.ok,error:repay.error,status:repay.result?.status},fieldRoles:fieldRoles([{path:'issued',kind:'intermediate',ok:issued.ok},{path:'credit',kind:'intermediate',ok:credit.ok},{path:'shock',kind:'intermediate',ok:shock.ok},{path:'repay',kind:'intermediate',ok:repay.ok},{path:'notes',kind:'assertion',ok:true},{path:'rateNow',kind:'intermediate',ok:true}]),notes:{player:f.notes('player'),host:f.notes(TH.host)},rateNow:(()=>{try{return f.rate();}catch(e){return errorOf(e);}})()};
}
// S5F-6：tests/s5-f-tender.test.mjs:155-173。发行 10 张券，现钱买 10 个面包，再用券买 25 个，比较分币种统计与折算。
async function tender6(after=false){
 const f=tenderFixture();
 const issued=await f.issue(10,'f6-issue');const setupUnmet=f.atShop();
 const cash=await breadTrade(f,'现钱 面包 10',{item:'item_bread',quantity:10},'f6-cash');
 const qn=after?depthLimitOf(f):25;
 const note=await breadTrade(f,`用券买 面包 ${qn}`,{item:'item_bread',quantity:qn,payCurrency:TH.NOTE},'f6-note');
 const place='loc_hw',state=f.doc.state,out={downstreamNote:'深度拒绝只指步骤条目里 error 为“可成交深度”的那一笔（见各 breadTrade 的 pre.quote.depthCheck）；其后各步（还债、券数、统计、折算等）是在该笔被拒的前提下继续算出的下游数字，不作期望值。',compares:'turnoverByResource / 基准账合计 / turnoverReference（tests/s5-f-tender.test.mjs:160-168）',setupUnmet:[...f.setupUnmet,...setupUnmet],issued:{ok:issued.ok,error:issued.error},cash,note};
 try{
  out.turnoverByResource=turnoverByResource(state,{place});
  out.baseLedgerTotalCoins=Object.values(state.records).filter(r=>r.category==='market_trade'&&r.place===place).reduce((n,r)=>n+r.totalCoins,0);
  out.turnoverReference=turnoverReference(f.engine.primitiveDraft(f.doc),f.engine,{place,location:TH.shop});
 }catch(e){out.derivedError=errorOf(e);}
 out.fieldRoles=fieldRoles([{path:'issued',kind:'intermediate',ok:issued.ok},{path:'cash',kind:'intermediate',ok:cash.ok},{path:'note',kind:'intermediate',ok:note.ok},{path:'turnoverByResource',kind:'assertion',ok:true},{path:'baseLedgerTotalCoins',kind:'assertion',ok:true},{path:'turnoverReference',kind:'assertion',ok:true}]);
 return out;
}

// ---------------------------------------------------------------- 6. s5-w4-economy #3 F007 典当
// 夹具出自 tests/helpers/finance.mjs:12-24（fixture：河湾邮驿、玩家 3000 铜、100 面包、五人同处）与 tests/s5-w4-economy.test.mjs:79-90（存 10 铜后典当 10 个面包 1 天，比较 principal 与押品值）。
function financeFixture(){
 const clerk='npc_hw_shendu',host='npc_hw_linsui',worker='npc_hw_ayan',at='bld_hw_post';
 const w=structuredClone(world),e=new WorldEngine(w);let doc=e.initialFromLegacy(legacy,'finance');
 doc.state.minute=600;doc.state.location=at;doc.state.player.coins=3000;
 doc.state.inventory={item_bread:{quantity:100},item_wood:{quantity:100},item_oats:{quantity:100}};
 const people=[clerk,host,worker,'npc_hw_chenbai','npc_hw_gucen'];
 doc.state.npcs=Object.fromEntries(people.map(id=>[id,{...doc.state.npcs[id],coins:500,location:at,status:'正常',activity:'休息',goals:{},inventory:{item_bread:{quantity:20}},memoryStream:[]}]));
 for(const n of w.npcs.filter(n=>people.includes(n.id))){delete n.schedule;n.schedule={default:[{start:0,end:1440,location:at,activity:'休息',services:['trade']}]};}
 return {engine:e,doc,clerk,host,worker,at};
}
async function pawn3(){
 const f=financeFixture(),ctx=f,item='item_bread';
 const dep=await attempt(ctx,'存 10 铜','world_trade',{operation:'deposit',seller:f.clerk,coins:10},'dep');
 const market=marketView(f.engine,f.doc,item,f.at);
 let apart=null;try{apart=supplyApart(f.engine.primitiveDraft(f.doc),f.engine,{item,location:f.at,owner:'player'});}catch(e){apart={error:errorOf(e)};}
 const pawn=await attempt(ctx,'典当面包 10 个 1 天','world_trade',{operation:'pawn',seller:f.clerk,item,quantity:10,days:1},'pawn');
 const p=pawn.result??{},contract=p.contract?f.doc.state.records[p.contract]:null,pledge=contract?.pledgeRecord?f.doc.state.records[contract.pledgeRecord]:null;
 return {compares:'principal 与押品值 pledgeRecord.value（tests/s5-w4-economy.test.mjs:85-86）',deposit:{ok:dep.ok,error:dep.error},
  advanceRatio:f.engine.rules.economy.credit.pawn.advanceRatio,item:itemFacts(f.engine,item),depthRule:depthRule(f.engine),
  marketBeforePawn:market,supplyApart:apart,pawn:{ok:pawn.ok,error:pawn.error,principal:p.principal,contract:p.contract},pledgeValue:pledge?.value??null,pledgeRecord:pledge,
  priceFactorLimitsRegion:f.engine.rules.economy.priceFactorLimits.region};
}

// ---------------------------------------------------------------- 7. s5-w4-economy #11 F026 玩家先服务
// 夹具出自 tests/s5-w4-economy.test.mjs:213-232（openShop）与 264-280（campaignSeed 'w4-player-flow'，A=npc_hw_xuling 钱袋 40，其余无钱；
// 玩家租下青灯酒馆、开柜台与营业，等过午夜；比较客流 visits 的 [npc,item,quantity,paid,tax,outcome]）。
async function flow11(){
 const landlord='npc_hw_linsui',place='bld_hw_qingdeng',A='npc_hw_xuling';
 const engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(legacy,{},'w4-player-flow');
 const facts=Object.keys(initial.state.npcs).filter(id=>id!==landlord).map(id=>({path:['state','npcs',id,'coins'],value:id===A?40:0}));
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:place,coins:300,inventory:{item_bread:5,item_parchment:1},present:[landlord],abilitiesByActor:{player:{skills:{skill_literacy:500}}},facts});
 const ctx={engine,doc:prepared.document};
 const leased=await attempt(ctx,'租店','world_trade',{operation:'lease',seller:landlord,consent:true,days:2},'w4-lease');
 const business=leased.result?.business;
 const counter=await attempt(ctx,'开柜台','world_act',{action:'business:open_counter',slots:{business,coins:100}},'w4-counter');
 const opened=await attempt(ctx,'营业','world_act',{action:'core:settlement.business_open',slots:{business}},'w4-open');
 const before={ration:marketView(engine,ctx.doc,'item_ration',place),bread:marketView(engine,ctx.doc,'item_bread',place),items:[itemFacts(engine,'item_ration'),itemFacts(engine,'item_bread')]};
 const m=ctx.doc.state.minute,waited=await attempt(ctx,'等过午夜','world_time',{minutes:DAY-(m%DAY)+30},'w4-player-day');
 const flows=Object.values(ctx.doc.state.records).filter(r=>r.category==='customer_flow'&&r.shop===business);
 const acct=Object.values(ctx.doc.state.records).find(r=>r.category==='money_account'&&r.purpose==='counter');
 return {compares:'flow[0].visits 的 [npc,item,quantity,paid,tax,outcome]（tests/s5-w4-economy.test.mjs:270）',
  setupUnmet:prepared.setupUnmet,steps:{leased:{ok:leased.ok,error:leased.error},counter:{ok:counter.ok,error:counter.error},opened:{ok:opened.ok,error:opened.error},waited:{ok:waited.ok,error:waited.error}},
  before,playerShopFlows:flows.map(r=>({shop:r.shop,day:r.day,minute:r.minute,visits:r.visits})),
  allFlows:Object.values(ctx.doc.state.records).filter(r=>r.category==='customer_flow').map(r=>({shop:r.shop,day:r.day,minute:r.minute,visits:r.visits})),
  counterCoins:acct?.coins??null,xulingCoins:ctx.doc.state.npcs[A].coins,playerRation:quantityOf(ctx.doc.state.inventory.item_ration),playerBread:quantityOf(ctx.doc.state.inventory.item_bread),
  rationsNeededForSixtySatiety:(()=>{const s=engine.byId.get('item_ration')?.nutrition?.satiety;return s?{satietyEach:s,count:Math.ceil(60/s)}:null;})(),
  after:{ration:marketView(engine,ctx.doc,'item_ration',place)}};
}

// ---------------------------------------------------------------- 8. m3-acceptance M9 旧世界导入
// 场景出自 tools/playtest-runner.mjs:210-233（preparePlaytestSession 的 world_upgrade 夹具：创建角色，走青灯酒馆，住宿 1 天，买 1 个面包）与
// tests/playtests/world_upgrade.json 第三回合（再买 1 个面包）；tests/m3-acceptance.test.mjs:90-94 比较玩家最终铜钱。
// 内存里不起 HTTP 服务、不导出导入：升级事件不改价格，两笔购买连续在同一份文档上做。种子 PLAYTEST_SEED='playtest-fixed-seed-v1'（tools/playtest-runner.mjs:23）。
async function m3M9(){
 const engine=new WorldEngine(structuredClone(world)),ctx={engine,doc:engine.createCharacter(legacy,{name:'试玩者'},'playtest-fixed-seed-v1')};
 const inn='bld_hw_qingdeng',start=ctx.doc.state.player.coins;
 const move=await attempt(ctx,'走青灯酒馆','world_move',{destination:'青灯酒馆'},'m9-fixture-0');
 const lodge=await attempt(ctx,'住宿 1 天','world_trade',{seller:'林穗',service:'住宿',days:1},'m9-fixture-1');
 const afterLodge=ctx.doc.state.player.coins;
 const b1pre={market:marketView(engine,ctx.doc,'item_bread',inn),quote:quoteView(engine,ctx.doc,{item:'item_bread',location:inn,seller:'npc_hw_linsui',quantity:1})};
 const bread1=await attempt(ctx,'买面包 1（旧世界夹具）','world_trade',{seller:'林穗',item:'面包',quantity:1},'m9-fixture-2');
 const coins1=ctx.doc.state.player.coins;
 const b2pre={market:marketView(engine,ctx.doc,'item_bread',inn),quote:quoteView(engine,ctx.doc,{item:'item_bread',location:inn,seller:'npc_hw_linsui',quantity:1})};
 const bread2=await attempt(ctx,'买面包 1（升级后回合）','world_trade',{seller:'林穗',item:'面包',quantity:1},'m9-turn-3');
 let recorded=null;
 try{ // 运行时只读打开剧本文件，原样输出它对玩家铜钱与面包的记录
  const file='tests/playtests/world_upgrade.json',json=JSON.parse(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'));
  recorded={file,rows:json.turns.flatMap((t,i)=>t.assertions.filter(a=>['state.player.coins','state.inventory.item_bread'].includes(a.path)).map(a=>({turn:i,input:t.input,assertion:a})))};
 }catch(e){recorded={error:errorOf(e)};}
 return {eventIdNote:'本场景的 eventId（m9-fixture-*、m9-turn-3）与真实流程（HTTP 服务器的 anchor 事件号）不同；价格不读 eventId，但不做精确重建。',notForExpectation:'不用于定 M9 期望值：M9 采用 world_upgrade.json 重推并记录的值（见 recordedInWorldUpgradeJson，运行时原样读出）；本输出只作旁证。',recordedInWorldUpgradeJson:recorded,expectationSourceCommits:['ad59698f','bb70871d'],approximate:'近似：原测试前两步在旧世界版本的服务器上做，再导出导入当前世界（写 world_update 记录、升级迁移），第三笔在导入后做；这里全程在当前世界、同一份文档上连做，不经导出导入。差别只在升级迁移是否影响面包价格，需复算者另行确认。',compares:'玩家最终铜钱 finalDocument.state.player.coins（tests/m3-acceptance.test.mjs:93）；第一笔后铜钱对应 world_upgrade.json 第一回合的 equals',
  startCoins:start,afterLodge,afterBread1:coins1,final:ctx.doc.state.player.coins,wage:wageView(engine,ctx.doc),
  bills:{lodge:start-afterLodge,bread1:afterLodge-coins1,bread2:coins1-ctx.doc.state.player.coins},
  steps:{move:{ok:move.ok,error:move.error},lodge:{ok:lodge.ok,error:lodge.error},bread1:{ok:bread1.ok,error:bread1.error,cost:bread1.result?.cost,pricing:bread1.result?.pricing},bread2:{ok:bread2.ok,error:bread2.error,cost:bread2.result?.cost,pricing:bread2.result?.pricing}},
  beforeBread1:b1pre,beforeBread2:b2pre,breadQuantity:quantityOf(ctx.doc.state.inventory.item_bread)};
}

// ---------------------------------------------------------------- 9. a2-dialogue #7 还价
// 场景参数出自 tests/a2-dialogue.test.mjs:7-11（setup：林穗全天在青灯酒馆营业、trust 20、玩家 5000 铜、面包基价 100、时间 540）、
// tests/helpers/daily-b2.mjs:27-34（scene 与 skipTo、种子 'daily-b2-seed'）与用例 70-87 行（先买 1 个面包，再按首笔单价还价两轮，比较第二轮 decision.outcome）。
async function haggle7(){
 const NPC='npc_hw_linsui',INN='bld_hw_qingdeng',SEED='daily-b2-seed';
 const w=structuredClone(world);
 w.npcs.find(n=>n.id===NPC).schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
 w.items.find(i=>i.id==='item_bread').basePrice=100;
 const engine=new WorldEngine(w),doc=engine.initialFromLegacy(legacy,'playtest-fixed-seed-v1'); // 服务器默认创建种子（tools/playtest-runner.mjs:23），scene() 之后才改种子
 doc.randomSeed=SEED;doc.state.location=INN;
 for(const row of Object.values(doc.state.records??{}))if(Number.isSafeInteger(row.lastDay))row.lastDay=Math.floor(540/DAY)-1;
 skipTo(engine,doc,540);
 Object.assign(doc.state.npcs[NPC],{goals:{},trust:20,activity:'营业',location:INN});doc.state.player.coins=5000;
 const ctx={engine,doc};
 const prime=await attempt(ctx,'无害观察（打开账本）','world_act',{action:'core:time',slots:{minutes:1}},'ui-1');
 const pre={market:marketView(engine,ctx.doc,'item_bread',INN),quote:quoteView(engine,ctx.doc,{item:'item_bread',location:INN,seller:NPC,quantity:1}),item:itemFacts(engine,'item_bread')};
 const buy=await attempt(ctx,'买面包 1','world_act',{action:'core:trade.buy',slots:{seller:NPC,item:'item_bread',quantity:1}},'ui-2');
 const unit=buy.result?.pricing?.unitPrice,offered=unit===undefined?null:Math.ceil(unit*.95);
 const observe=()=>{try{return facilityRuntime().currentTradeQuote(engine,ctx.doc,{seller:NPC,item:'item_bread'}).listPrice;}catch(e){return {error:errorOf(e)};}};
 const bargaining=engine.rules.bargaining??null;
 const obs0=observe();
 const opening=unit===undefined?null:await attempt(ctx,'还价第 1 轮（按首笔单价上取整）','world_act',{action:'core:dialogue.haggle',slots:{subject:NPC,content:String(Math.ceil(unit)),source:'item_bread'}},'ui-3');
 const obs1=observe();
 const second=offered===null?null:await attempt(ctx,'还价第 2 轮（首笔单价 ×0.95 上取整）','world_act',{action:'core:dialogue.haggle',slots:{subject:NPC,content:String(offered),source:'item_bread'}},'ui-4');
 return {compares:'第二轮 result.dialogue.decision.outcome（tests/a2-dialogue.test.mjs:85）；首笔 cost（:77）',
  wage:wageView(engine,ctx.doc),pre,buy:{ok:buy.ok,error:buy.error,cost:buy.result?.cost,pricing:buy.result?.pricing},firstUnitPrice:unit??null,offered,
  observedListPriceBeforeRound1:obs0,observedListPriceBeforeRound2:obs1,bargainingRule:bargaining,
  afterBuyMarket:marketView(engine,ctx.doc,'item_bread',INN),
  rounds:{opening:opening&&{ok:opening.ok,error:opening.error,outcome:opening.result?.dialogue?.decision?.outcome,decision:opening.result?.dialogue?.decision},
   second:second&&{ok:second.ok,error:second.error,outcome:second.result?.dialogue?.decision?.outcome,decision:second.result?.dialogue?.decision}},
  primed:{ok:prime.ok,error:prime.error}};
}

// ---------------------------------------------------------------- 入口
const SCENARIOS={
 'seasonal-hazards-4':seasonalHazards4,'a1-lt-scenarios-7':a1Partial7,'s5-f-tender-3':tender3,'s5-f-tender-5':tender5,'s5-f-tender-6':tender6,'s5-f-tender-3-after':()=>tender3(true),'s5-f-tender-5-after':()=>tender5(true),'s5-f-tender-6-after':()=>tender6(true),
 's5-w4-economy-3':pawn3,'s5-w4-economy-11':flow11,'m3-acceptance-M9':m3M9,'a2-dialogue-7':haggle7,
};
const wanted=process.argv.slice(2).filter(a=>!a.startsWith('-'));
const names=wanted.length?wanted:Object.keys(SCENARIOS);
const probe={probe:'market-probe',names,rules:{priceFactorLimitsRegion:world.rules?.economy?.priceFactorLimits?.region??null,marketRules:world.marketRules??null},results:{}};
for(const name of names){
 if(!SCENARIOS[name]){probe.results[name]={error:{message:`未知子项；可用：${Object.keys(SCENARIOS).join(' ')}`}};continue;}
 try{probe.results[name]=await SCENARIOS[name]();}catch(e){probe.results[name]={error:errorOf(e),stack:String(e?.stack??'').split('\n').slice(0,6)};}
}
console.log(JSON.stringify(probe,(k,v)=>typeof v==='bigint'?v.toString():v,1));
