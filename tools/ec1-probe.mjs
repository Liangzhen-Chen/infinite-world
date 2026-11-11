// EC-1a 第 0 步只读探针（第二版）：完整世界开局（createCharacter 后）的粮库可动用量、粮种与可食性、户日需求与开局存粮缺口、现金与本地粮价、
// 收入来源、无户者、外域未开账本者，以及“店铺补货 / 商贩 / 航线可贩卖的粮食物品是否可直接食用或有配方加工成可食物”（B1 的前置核实）。
// 只读：不写盘、不改世界文件、不调模型；只在内存里 createCharacter，输出到 stdout。
// 用法：node tools/ec1-probe.mjs [--rows]   （--rows 额外逐户输出一行 JSON；云上运行，本机不要运行）
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {stockItem} from '../server-plugin/stock.mjs';
import {mealMouthsOf,bodyDrain} from '../server-plugin/primitives-body.mjs';
import {householdBudget,householdBufferTarget} from '../server-plugin/household-budget.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {personHousehold,placeSettlement,personSimulation} from '../server-plugin/entity-view.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {householdSubsistencePlan} from '../server-plugin/household-subsistence.mjs';

const showRows=process.argv.includes('--rows'),STAPLE_SHELF=3;
const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
const engine=new WorldEngine(world);
const doc=engine.createCharacter(seed,{},'ec1-probe');
const d=engine.primitiveDraft(doc),state=doc.state;
const out=(label,value)=>console.log(`## ${label}\n${JSON.stringify(value,null,1)}`);
const LABEL_NONE='(无聚落)';
const nutrient=id=>engine.byId.get(id)?.nutrition??null;
const edibleNow=id=>{const n=nutrient(id);return Boolean(n&&(n.satiety>0||n.hydration>0));};
const staple=id=>{const i=engine.byId.get(id),n=i?.nutrition;return Boolean(n?.satiety>0)&&(i.shelfLifeDays==null||i.shelfLifeDays>=STAPLE_SHELF);};
const GRAINISH=/oat|grain|wheat|rice|millet|barley|flour|rye|food|bread|meal|cake/;

// 1. 粮库：库存、保留量、可动用量；粮库物品是否可食。粮库“份”按人日计（保留量 = mealMouthsOf × reserveDays）。
const foodItem=stockItem(engine,'food'),def=engine.byId.get(foodItem);
out('粮库物品',{item:foodItem,name:def?.name??null,nutrition:def?.nutrition??null,basePrice:def?.basePrice??null,shelfLifeDays:def?.shelfLifeDays??null,
  directlyEdible:edibleNow(foodItem),note:'粮库 1 份 = 1 人日公粮（保留量 = mealMouthsOf × reserveDays）；饱腹 60/人日'});
const dayNeed=60;
const granaries=[];
for(const p of engine.rules.agriculture?.settlements??[]){
  const s=state.settlements?.[p.settlement];if(!s){granaries.push({settlement:p.settlement,missing:true});continue;}
  const mouths=mealMouthsOf(engine,state,p.settlement,s.population??0),reserve=mouths*p.reserveDays;
  const rec=state.records?.[`agriculture:${p.settlement}`];
  const grain=rec?(rec.batches??[]).filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0):null;
  granaries.push({settlement:p.settlement,granary:s.granary!==false,population:s.population,mouths:Number(mouths.toFixed(1)),reserveDays:p.reserveDays,reserve:Math.ceil(reserve),
    food:s.food,grainBatchesOnly:grain,available:Math.max(0,Math.floor(s.food-reserve)),availableGrainOnly:grain===null?null:Math.max(0,Math.floor(grain-reserve)),mode:rec?.mode??null});
}
out('各聚落粮库可动用量（人日，扣 reserveDays 后）',granaries);
out('无粮仓聚落（granary:false）',Object.entries(state.settlements??{}).filter(([,s])=>s.granary===false).map(([id,s])=>({settlement:id,population:s.population,food:s.food})));

// 2. 可贩卖粮食物品核实（B1 前置）：店铺补货行、非店铺交易人手上的食物、聚落间贸易航线物品；
//    逐项是否可直接食用，或有配方（至多三步）加工成可食物。
const recipes=engine.world.recipes??[];
function chain(item,depth=0,seen=new Set()){
  if(edibleNow(item))return {steps:[]};
  if(depth>=3||seen.has(item))return null;
  seen.add(item);
  for(const r of recipes.filter(r=>(r.materials??[]).some(m=>m.item===item))){
    const o=r.output?.item;if(!o)continue;
    const step={recipe:r.id,output:o,workstation:r.workstation??null,minutes:r.minutes??null};
    if(edibleNow(o))return {steps:[step]};
    const deeper=chain(o,depth+1,new Set(seen));if(deeper)return {steps:[step,...deeper.steps]};
  }
  return null;
}
const sellable=new Map();
const add=(item,source)=>{const row=sellable.get(item)??{item,name:engine.byId.get(item)?.name??null,sources:[]};if(!row.sources.includes(source))row.sources.push(source);sellable.set(item,row);};
const shops=currentShops(engine,state);
for(const shop of shops)for(const r of shop.restock??[])add(r.item,`店铺货架:${shop.settlement}:${r.source??'?'}`);
for(const id of Object.keys(state.npcs??{}).sort()){
  const base=engine.byId.get(id),trades=(base?.services??[]).includes('trade')||(base?.serviceCatalog??[]).some(s=>s?.kind==='trade');
  if(!trades||shops.some(s=>s.keeper===id))continue;
  for(const [item,v] of Object.entries(state.npcs[id].inventory??{})){
    const q=typeof v==='number'?v:v?.quantity??0;
    if(q>0&&(edibleNow(item)||GRAINISH.test(item)))add(item,`商贩:${placeSettlement(engine,state,state.npcs[id].location).value??LABEL_NONE}`);
  }
}
const trade=engine.rules.settlementTrade;
if(trade?.item)add(trade.item,`聚落间贸易航线:${(trade.lanes??[]).length} 条`);
const verdict=[...sellable.values()].map(r=>{
  const c=chain(r.item);
  return {...r,directlyEdible:edibleNow(r.item),nutrition:nutrient(r.item),shelfLifeDays:engine.byId.get(r.item)?.shelfLifeDays??null,reachesEdible:Boolean(c),processing:c&&c.steps.length?c.steps:null};
});
out('可贩卖物品逐项：可直接食用 / 配方可加工成可食物（B1 前置核实）',verdict.filter(r=>r.directlyEdible||r.reachesEdible||GRAINISH.test(r.item)));
out('B1 落空项：粮食类可贩卖物品既不可直接食用、也没有配方加工成可食物',verdict.filter(r=>!r.directlyEdible&&!r.reachesEdible&&GRAINISH.test(r.item)).map(r=>({item:r.item,name:r.name,sources:r.sources})));

// 3. 本地主粮价：只取本聚落店铺补货行里的主食（shelfLife ≥ 3 天或无期限），每铜饱腹最优；regionalTradeBase 报价。没有店铺主粮的聚落标无价。
const price={};
const sids=new Set([...Object.keys(state.settlements??{}),...shops.map(s=>s.settlement)]);
for(const sid of sids){
  const items=[...new Set(shops.filter(s=>s.settlement===sid).flatMap(s=>(s.restock??[]).map(r=>r.item)))].filter(staple);
  const rows=items.map(i=>{let base=null;try{base=regionalTradeBase(d,engine,i,sid,state.minute);}catch{}return base>0?{item:i,price:Number(base.toFixed(2)),satPerCoin:Number((nutrient(i).satiety/base).toFixed(2))}:null;}).filter(Boolean).sort((a,b)=>b.satPerCoin-a.satPerCoin);
  price[sid]={stapleOnShelves:rows.length,best:rows[0]??null};
}
out('各聚落店铺主粮最优价（best=null 表示本地没有可买主粮）',price);

// 4. 户：日饱腹需求 N、存粮天数 D、主食存粮与其他食物、缺口、现金、一天口粮成本、收入来源
const seen=new Set(),rows=[],bySettlement={},income={},unregistered=[],unknownSource=[];
for(const id of Object.keys(state.npcs??{}).sort()){
  const npc=state.npcs[id];if(!npc)continue;
  const h=personHousehold(engine,state,id).value;
  const members=(h?.members??[id]).filter(m=>state.npcs?.[m]);
  const key=h?.id??`solo:${id}`;if(seen.has(key))continue;seen.add(key);
  const sid=placeSettlement(engine,state,npc.location).value??LABEL_NONE;
  const need=members.reduce((n,m)=>n+bodyDrain(engine,state,m,'satiety')*24,0);
  let days=null,profile=null;
  try{const t=householdBufferTarget(d,engine,id,{});days=t.days;profile=t.profile;}catch{}
  let stapleStock=0,otherStock=0,cash=0;
  for(const m of members){
    const n=state.npcs[m];cash+=n.coins??0;
    for(const [item,v] of Object.entries(n.inventory??{})){const q=typeof v==='number'?v:v?.quantity??0,sat=nutrient(item)?.satiety??0;if(staple(item))stapleStock+=q*sat;else otherStock+=q*sat;}
  }
  const target=days===null?null:need*days,gap=target===null?null:Math.max(0,target-stapleStock);
  const best=price[sid]?.best??null,dayCost=best?Math.ceil(need/best.satPerCoin):null;
  let incomeSource=null;
  try{const b=householdBudget(d,engine,id,{kernel:true});incomeSource=b.nextReliableIncome?.source??b.horizonSource??null;}catch{}
  income[sid]??={};income[sid][incomeSource??'无']=(income[sid][incomeSource??'无']??0)+1;
  let sourceStatus=null;try{sourceStatus=householdSubsistencePlan(engine,state,id)?.sourceStatus??null;}catch{}
  const row={household:h?.id??null,owner:id,registered:Boolean(h),full:Boolean(personSimulation(engine,{},id).value),settlement:sid,members:members.length,needSatiety:Number(need.toFixed(1)),days,profile,
    stapleStockSatiety:Number(stapleStock.toFixed(1)),otherStockSatiety:Number(otherStock.toFixed(1)),gapSatiety:gap===null?null:Number(gap.toFixed(1)),cash,dayCostCoins:dayCost,cashDays:dayCost?Number((cash/dayCost).toFixed(2)):null,incomeSource,sourceStatus};
  rows.push(row);
  if(!h)unregistered.push({owner:id,full:row.full,settlement:sid,location:npc.location,coins:npc.coins??0,hasInventory:Object.keys(npc.inventory??{}).length>0,services:engine.byId.get(id)?.services??[]});
  if(sourceStatus==='unknown')unknownSource.push(id);
  const b=bySettlement[sid]??={households:0,people:0,noHousehold:0,withGap:0,gapSatiety:0,gapPersonDays:0,cash:0,dayCost:0,noStaplePrice:0};
  b.households++;b.people+=members.length;if(!h)b.noHousehold++;if(gap>0){b.withGap++;b.gapSatiety+=gap;b.gapPersonDays+=gap/dayNeed;}b.cash+=cash;if(dayCost)b.dayCost+=dayCost;else b.noStaplePrice++;
}
for(const b of Object.values(bySettlement)){b.gapSatiety=Math.round(b.gapSatiety);b.gapPersonDays=Number(b.gapPersonDays.toFixed(1));}
out('各聚落户汇总（gap = max(0,N×D − 主食存粮)，不含配菜；cash 与一天口粮成本为户合计；noStaplePrice=本聚落店铺没有主粮可买的户数）',bySettlement);
out('各聚落下一笔可靠收入来源分布（budget.nextReliableIncome.source，无=没有登记的收入来源）',income);
out('无户者逐人（成因判断：roster/full、位置、现金、服务）',unregistered);
out('外域未开账本者（subsistence plan sourceStatus:unknown，从缺餐指标剔除单列）',unknownSource);

// 5. 目标拨粮量（人日）与粮库可动用量，仅作参考（B1 不拨粮）
const demand={};for(const r of rows)if(r.gapSatiety>0)demand[r.settlement]=(demand[r.settlement]??0)+r.gapSatiety/dayNeed;
out('目标拨粮量（人日）与粮库可动用量',Object.fromEntries(Object.entries(demand).map(([sid,pd])=>{const g=granaries.find(x=>x.settlement===sid);return [sid,{gapPersonDays:Number(pd.toFixed(1)),available:g?.available??null}];})));
out('概览',{households:rows.length,registered:rows.filter(r=>r.registered).length,unregistered:rows.filter(r=>!r.registered).length,withGap:rows.filter(r=>r.gapSatiety>0).length,zeroCash:rows.filter(r=>r.cash<1).length,
  mealsRecords:Object.keys(state.family?.meals??{}).length,minute:state.minute});
if(showRows)for(const r of rows)console.log(JSON.stringify(r));
