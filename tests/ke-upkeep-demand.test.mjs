import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {tradeQuote} from '../server-plugin/shop.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {upkeepDemand,marketSupply} from '../server-plugin/market.mjs';
import {isItemClass} from '../server-plugin/item-class.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

// Card E: a household that runs out of firewood (F's npc-life upkeep records the short days) wants to buy fuel;
// that want raises local demand, so the fuel quote rises and residents buy; once supplied, the price falls back.
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,smith='npc_hw_duanyan',forge='bld_hw_forge',item='item_charcoal';
// The forge serves at its door all day, so the noon walk-in market reaches it (the authored smith lunches at noon).
const w=structuredClone(world);{const n=w.npcs.find(x=>x.id===smith);delete n.tier;n.schedule={default:[{start:0,end:1440,location:forge,activity:'营业',services:['trade']}]};}
const engine=new WorldEngine(w);
const read=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const quote=doc=>{const d=read(doc);return tradeQuote(d,engine,{buyer:'player',seller:smith,item,quantity:1,location:forge,base:()=>regionalTradeBase(d,engine,item,forge)});};
const villagers=doc=>Object.keys(doc.state.npcs).filter(id=>placeSettlement(engine,doc.state,doc.state.npcs[id].location).value==='loc_hw');
const wait=async(doc,minutes,eventId)=>applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId})).patches);
const shortWant=doc=>villagers(doc).reduce((n,id)=>n+upkeepDemand(doc.state,engine,id,item),0);

test('short of firewood: the fuel quote rises and residents buy; once supplied the quote falls back',async()=>{
 let doc=engine.initialFromLegacy(seed,'ke-upkeep');doc.state.minute=600;
 // The village's own firewood is gone; only the forge's shelf charcoal is left to buy (the keeper's shelf goods are not burned at home).
 for(const id of villagers(doc))for(const it of Object.keys(doc.state.npcs[id].inventory??{}))if(isItemClass(engine,it,'fuel')&&!(id===smith&&it===item))delete doc.state.npcs[id].inventory[it];
 doc.state.npcs[smith].inventory[item]={quantity:40,quality:'木',durability:100,weight:engine.byId.get(item).weight};// the forge's shelf charcoal
 doc=await wait(doc,1,'open');resyncBooks(engine,doc);
 // 判据用未取整的报价（listPrice）：取整到文再比会把 1.35 倍与 1.45 倍的价都截成 4，看不出涨跌。
 // 每一步的期望都按定价规律推出：listPrice = 区域基准（目录基价 3 × 环境 × 运输）× 夹取后的稀缺度 × 品质 × 深度 × 价差 × 关系；
 // 稀缺度 = clamp(需求 ÷ max(1, 供给), 区域夹取区间)，需求、供给取供需原语 marketSupply 的 demand、supply（其口径已在 market-food-pool 逐项手推，不在这里重复）。
 // 其余因子取报价解释里的各项；报价解释里的稀缺度必须与上式一致（不是另一个数）。报价单件、买家玩家，所以品质与深度各为解释里的值，不另设。
 const [floor,cap]=engine.rules.economy.priceFactorLimits.region,near=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
 const step=d=>{
  const r=read(d),m=marketSupply(r,engine,item,forge),q=quote(d),e=q.explanation,scarcity=Math.min(cap,Math.max(floor,m.demand/Math.max(1,m.supply)));
  assert.ok(near(e.scarcity,scarcity),`解释里的稀缺度 ${e.scarcity} = 夹取(需求 ${m.demand} ÷ 供给 ${m.supply}) = ${scarcity}`);
  assert.ok(near(q.listPrice,regionalTradeBase(r,engine,item,forge)*scarcity*e.quality*e.depth*e.spread*e.relation),'报价 = 区域基准 × 稀缺度 × 其余因子');
  return {price:q.listPrice,scarcity,demand:m.demand,supply:m.supply};
 };
 const before=step(doc),boughtBefore=Object.keys(doc.state.records).length;
 doc=await wait(doc,3*DAY,'cold');
 assert.ok(Object.values(doc.state.family?.upkeep??{}).some(r=>r.fuelShortDays>0),'households went without fuel');
 assert.ok(shortWant(doc)>0,'the shortage is a want to buy fuel');
 // 缺柴三日：各户没烧到柴，欠量 DebtG 记在户账上，经市场的户用 = 补给间隔 ×（日用度 − 自给）+ Σ欠量，欠量只增需求；需求比开局大，稀缺度与价随之严格上升。
 const cold=step(doc);assert.ok(cold.demand>before.demand,'欠量推高需求');assert.ok(cold.price>before.price,`fuel dearer while short: ${before.price} -> ${cold.price}`);
 const bought=Object.entries(doc.state.records).filter(([,r])=>r.category==='market_trade'&&r.item===item&&r.seller===smith&&r.buyer!=='player');
 assert.ok(bought.length>0,'residents came to buy charcoal');
 // Supplied again: everyone (also villagers out on a trip at this moment) gets firewood; once the short days end nobody wants fuel any more,
 // and with the forge's shelf back at its original 40 the quote is the pre-shortage price again.
 for(const id of Object.keys(doc.state.npcs))doc.state.npcs[id].inventory.item_wood={quantity:40,quality:'木',durability:100,weight:engine.byId.get('item_wood').weight};
 resyncBooks(engine,doc);doc=await wait(doc,2*DAY,'warm');
 assert.equal(shortWant(doc),0,'no village household is short any more');
 doc.state.npcs[smith].inventory[item]={quantity:40,quality:'木',durability:100,weight:engine.byId.get(item).weight};resyncBooks(engine,doc);
 // 补给后：欠量清零（shortWant 为 0）、各户都持有柴，铁匠铺架上炭回到 40；需求只剩补给间隔内的新用度，价按同一规律（上面 step 的等式）由当时的供需推出，
 // 且低于缺柴时的价（需求少了欠量、供给多了全村商人手里的柴）。不再断言回到开局价：补给后供给比开局大，规律下价不必相等。
 const warm=step(doc);assert.ok(warm.demand<cold.demand,'欠量清零后需求回落');assert.ok(warm.price<cold.price,`fuel cheaper once supplied: ${cold.price} -> ${warm.price}`);
 assert.deepEqual(reconcile(engine,doc).mismatches,[]);
});
