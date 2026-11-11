// EC-1a 第 0 步只读探针：完整世界开局（createCharacter 后）的粮库可动用量、粮种与可食性、户日需求与开局存粮缺口、现金与本地粮价、无粮仓聚落。
// 只读：不写盘、不改世界文件、不调模型；只在内存里 createCharacter，输出到 stdout。
// 用法：node tools/ec1-probe.mjs [--rows]   （--rows 额外逐户输出一行 JSON；云上运行，本机不要运行）
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {stockItem} from '../server-plugin/stock.mjs';
import {mealMouthsOf,bodyDrain} from '../server-plugin/primitives-body.mjs';
import {householdBufferTarget} from '../server-plugin/household-budget.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {personHousehold,placeSettlement} from '../server-plugin/entity-view.mjs';

const showRows=process.argv.includes('--rows'),DAY=1440;
const world=await loadWorld();
const seed=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
const engine=new WorldEngine(world);
const doc=engine.createCharacter(seed,{},'ec1-probe');
const d=engine.primitiveDraft(doc),state=doc.state;
const out=(label,value)=>console.log(`## ${label}\n${JSON.stringify(value,null,1)}`);

// 1. 粮库：各聚落库存、保留量（人口口径 mealMouthsOf × reserveDays）、可动用量；粮种与是否可直接食用
const foodItem=stockItem(engine,'food'),def=engine.byId.get(foodItem);
out('粮库物品',{item:foodItem,name:def?.name??null,nutrition:def?.nutrition??null,basePrice:def?.basePrice??null,shelfLifeDays:def?.shelfLifeDays??null,
  directlyEdible:Boolean(def?.nutrition&&(def.nutrition.satiety>0||def.nutrition.hydration>0)),
  note:'directlyEdible=false 表示粮库原粮不能直接吃，方案 A 须配合加工或改拨可食物'});
const granaries=[];
for(const p of engine.rules.agriculture?.settlements??[]){
  const s=state.settlements?.[p.settlement];if(!s){granaries.push({settlement:p.settlement,missing:true});continue;}
  const mouths=mealMouthsOf(engine,state,p.settlement,s.population??0),reserve=mouths*p.reserveDays;
  const rec=state.records?.[`agriculture:${p.settlement}`];
  const grain=rec?(rec.batches??[]).filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0):null;
  granaries.push({settlement:p.settlement,granary:s.granary!==false,population:s.population,mouths:Number(mouths.toFixed(1)),food:s.food,grainBatchesOnly:grain,
    reserveDays:p.reserveDays,reserve:Math.ceil(reserve),available:Math.max(0,Math.floor(s.food-reserve)),availableGrainOnly:grain===null?null:Math.max(0,Math.floor(grain-reserve)),mode:rec?.mode??null});
}
out('各聚落粮库可动用量（扣 reserveDays 后）',granaries);
out('无粮仓聚落（granary:false）',Object.entries(state.settlements??{}).filter(([,s])=>s.granary===false).map(([id,s])=>({settlement:id,population:s.population,food:s.food})));

// 2. 本地粮价：每个聚落可食物品里每铜饱腹最高者（regionalTradeBase，非 basePrice）
const edible=engine.world.items.filter(i=>i.nutrition?.satiety>0&&i.basePrice>0);
const settlements=Object.keys(state.settlements??{});
const price={};
for(const sid of settlements){
  const rows=edible.map(i=>{let base=null;try{base=regionalTradeBase(d,engine,i.id,sid,state.minute);}catch{}return base>0?{item:i.id,price:Number(base.toFixed(2)),satPerCoin:Number((i.nutrition.satiety/base).toFixed(2)),shelfLifeDays:i.shelfLifeDays??null}:null;}).filter(Boolean).sort((a,b)=>b.satPerCoin-a.satPerCoin);
  price[sid]={candidates:rows.length,best:rows[0]??null};
}
out('各聚落本地最优粮价（每铜饱腹）',price);

// 3. 户：日饱腹需求 N、存粮天数 D、现有可食存粮、缺口、现金、一天口粮成本
const seen=new Set(),rows=[],bySettlement={};
for(const id of Object.keys(state.npcs??{}).sort()){
  const npc=state.npcs[id];if(!npc)continue;
  const h=personHousehold(engine,state,id).value;
  const members=(h?.members??[id]).filter(m=>state.npcs?.[m]);
  const key=h?.id??`solo:${id}`;if(seen.has(key))continue;seen.add(key);
  const sid=placeSettlement(engine,state,npc.location).value??null;
  const need=members.reduce((n,m)=>n+bodyDrain(engine,state,m,'satiety')*24,0);
  let days=null,profile=null;
  try{const t=householdBufferTarget(d,engine,id,{});days=t.days;profile=t.profile;}catch{}
  let stock=0,cash=0;
  for(const m of members){
    const n=state.npcs[m];cash+=n.coins??0;
    for(const [item,v] of Object.entries(n.inventory??{})){const q=typeof v==='number'?v:v?.quantity??0,sat=engine.byId.get(item)?.nutrition?.satiety??0;stock+=q*sat;}
  }
  const target=days===null?null:need*days,gap=target===null?null:Math.max(0,target-stock);
  const best=sid?price[sid]?.best:null,dayCost=best?Math.ceil(need/best.satPerCoin):null;
  const row={household:h?.id??null,owner:id,registered:Boolean(h),tier:engine.byId.get(id)?.tier??null,settlement:sid,members:members.length,needSatiety:Number(need.toFixed(1)),days,profile,stockSatiety:Number(stock.toFixed(1)),gapSatiety:gap===null?null:Number(gap.toFixed(1)),cash,dayCostCoins:dayCost,cashDays:dayCost?Number((cash/dayCost).toFixed(2)):null};
  rows.push(row);
  const b=bySettlement[sid??'(无聚落)']??={households:0,people:0,noHousehold:0,withGap:0,gapSatiety:0,cash:0,dayCost:0,noPrice:0};
  b.households++;b.people+=members.length;if(!h)b.noHousehold++;if(gap>0){b.withGap++;b.gapSatiety+=gap;}b.cash+=cash;if(dayCost)b.dayCost+=dayCost;else b.noPrice++;
}
for(const b of Object.values(bySettlement))b.gapSatiety=Math.round(b.gapSatiety);
out('各聚落户汇总（gap = N×D − 现有存粮；cash 与一天口粮成本为户合计）',bySettlement);

// 4. 方案 A 对照：各有粮仓聚落目标拨粮总量 vs 可动用量（按粮库物品每份饱腹折算）
const perUnit=def?.nutrition?.satiety??0;
const demand={};for(const r of rows)if(r.gapSatiety>0)demand[r.settlement]=(demand[r.settlement]??0)+r.gapSatiety;
out('目标拨粮量（份，按粮库物品饱腹折算；perUnit=0 表示粮库物品无饱腹，无法折算）',Object.fromEntries(Object.entries(demand).map(([sid,sat])=>{
  const g=granaries.find(x=>x.settlement===sid);return [sid,{gapSatiety:Math.round(sat),units:perUnit>0?Math.ceil(sat/perUnit):null,available:g?.available??null,covered:g&&perUnit>0?g.available>=Math.ceil(sat/perUnit):null}];})));
out('概览',{households:rows.length,registered:rows.filter(r=>r.registered).length,unregistered:rows.filter(r=>!r.registered).length,withGap:rows.filter(r=>r.gapSatiety>0).length,zeroCash:rows.filter(r=>r.cash<1).length,minute:state.minute});
if(showRows)for(const r of rows)console.log(JSON.stringify(r));
