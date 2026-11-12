import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {tradeQuote,shopStores,derivedShops} from '../server-plugin/shop.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {upkeepDemand} from '../server-plugin/market.mjs';
import {isItemClass} from '../server-plugin/item-class.mjs';
import {placeSettlement,personBusinesses} from '../server-plugin/entity-view.mjs';
import {usageItemGrams,upkeepSelfSupplyOf} from '../server-plugin/household-budget.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

// Card E: a household that runs out of firewood (F's npc-life upkeep records the short days) wants to buy fuel;
// that want raises local demand, so the fuel quote rises and residents buy; once supplied, the price falls back.
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,smith='npc_hw_duanyan',forge='bld_hw_forge',item='item_charcoal';
// The forge serves at its door all day, so the noon walk-in market reaches it (the authored smith lunches at noon).
// 自给恒为 0 的夹具：每日出行上限压到 1 分钟，没有任何户够得到公共林地或资源点（下面前置逐户断言），所以每户的柴全额走市场，价格期望可以从规则数据手推。
const w=structuredClone(world);{const n=w.npcs.find(x=>x.id===smith);delete n.tier;n.schedule={default:[{start:0,end:1440,location:forge,activity:'营业',services:['trade']}]};}
w.rules.householdSubsistence.maximumJourneyMinutes=1;
const engine=new WorldEngine(w);
const read=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const quote=doc=>{const d=read(doc);return tradeQuote(d,engine,{buyer:'player',seller:smith,item,quantity:1,location:forge,base:()=>regionalTradeBase(d,engine,item,forge)});};
const villagers=doc=>Object.keys(doc.state.npcs).filter(id=>placeSettlement(engine,doc.state,doc.state.npcs[id].location).value==='loc_hw');
const wait=async(doc,minutes,eventId)=>applyPatches(doc,(await engine.reduce(doc,{tool:'world_time',args:{minutes},eventId})).patches);
const shortWant=doc=>villagers(doc).reduce((n,id)=>n+upkeepDemand(doc.state,engine,id,item),0);
const wood=()=>({quantity:40,quality:'木',durability:100,weight:engine.byId.get('item_wood').weight});

// ---- 手推：炭的报价（玩家买一件，开张后第一张报价，没有成交深度、立场中性）----
// 价 = 目录基价 3 × 环境与运输 1（炭产自本聚落，诊断读到区域基准恰为 3）× 夹取后的稀缺度 × 品质 1 × 深度 1（当日无成交）× 价差（铁匠铺 markup = 1）× 关系 1；
// 稀缺度 = clamp(D ÷ max(1,S))，D、S 都折成"炭件数"（燃料类池按基准克计量，一件炭 = unit 基准克，unit = usageItemGrams(炭)）：
//  · 供给 S = (公仓木料 × 木的基准克 + 本聚落各经营者（店主与带 trade 服务的人）行囊里的燃料类货 × 各自基准克) ÷ unit；
//  · 需求 D = 货架目标 + 经市场的户用 ÷ unit：货架目标 = 本聚落各店燃料类行的 (maximum+reserve) × 基准克 ÷ unit（铁匠铺炭 maximum 8，无 reserve）；
//    经市场的户用（克）= 补给间隔 H × 日用度 N × 聚落户数 + Σ名册户已欠量（自给为 0；燃料按户烧，聚落户数 = 档案 householdCount，名册户日用度都是 N，所以按户外推后与名册户数无关）；
//    N = (炊事 + 当季取暖公斤) × 1000（规则 household.fuelKgPerDay）；H = 补给间隔：类内各货补给间隔的最小值，木料产自本聚落、本地生产周期不超过一个交易周期，
//    各货补给间隔都不小于交易周期，所以 H = economy.tradeCycleDays。
// 没有制造耗料记录（夹具刚开张，没人制造）。
function handQuote(doc){
 const state=doc.state,cycle=engine.rules.economy.tradeCycleDays,cls='fuel';
 const pool=engine.world.items.filter(i=>isItemClass(engine,i.id,cls)&&!(i.nutrition?.satiety>0)&&usageItemGrams(engine,i.id,cls)>0),weight=id=>usageItemGrams(engine,id,cls),unit=weight(item);
 const q=v=>typeof v==='number'?v:v?.quantity??0;
 // 前置：补给间隔 = 交易周期（木料产自本聚落、配方工时不超过一个交易周期）；没有制造耗料记录；经市场的户用确是全额（每户自给 0）。
 assert.equal(placeSettlement(engine,state,engine.byId.get('item_wood').origin).value,'loc_hw');
 assert.ok(engine.world.recipes.filter(r=>r.output?.item==='item_wood').every(r=>r.minutes<=cycle*DAY),'本地生产周期不超过交易周期');
 assert.equal(state.records?.['craft-use:loc_hw'],undefined);
 const roster=villagers(doc),keyOf=id=>engine.world.households.find(h=>h.members.includes(id))?.id??id,keys=[...new Set(roster.map(keyOf))];
 for(const id of roster)assert.equal(upkeepSelfSupplyOf(engine,state,id).fuel??0,0,`前置：${id} 没有可达的公共来源，自给 0`);
 // 前置：夹具里没有按人物派生的店铺或营业者（derivedShops 为空；personBusinesses 里开着店的都已在下面的手推集合里），所以经营者与货架只按登记的店铺手推。
 assert.deepEqual(derivedShops(engine.world),[],'前置：没有按人物派生的店铺');
 const stores=shopStores(engine.world);
 const owners=new Set([...stores.map(s=>s.keeper),...engine.world.npcs.filter(n=>n.shopType||(n.services??[]).includes('trade')).map(n=>n.id)]);
 for(const [id,business] of personBusinesses(engine,state))if(business?.open.value&&business.shopType.value)assert.ok(owners.has(id),`前置：派生的营业者 ${id} 已在手推的经营者集合里`);
 let heldGrams=state.settlements.loc_hw.wood*weight('item_wood');
 for(const id of owners){const npc=state.npcs[id];if(!npc||placeSettlement(engine,state,npc.location).value!=='loc_hw')continue;for(const it of pool)heldGrams+=q(npc.inventory?.[it.id])*weight(it.id);}
 const shelfGrams=stores.filter(s=>s.settlement==='loc_hw').flatMap(s=>s.restock??[]).filter(r=>pool.some(i=>i.id===r.item)).reduce((n,r)=>n+(r.maximum+(r.reserve??0))*weight(r.item),0);
 const fuel=world.balance.crafting.params.find(p=>p.id==='household.fuelKgPerDay').value,N=(fuel.cooking+(fuel.heating[engine.calendar(state.minute).season]??0))*1000;
 const houses=engine.world.settlementProfiles.find(p=>p.id==='loc_hw').householdCount,owed=keys.reduce((n,k)=>n+(state.family?.upkeep?.[k]?.fuelDebtG??0),0);
 const supply=heldGrams/unit,demand=Math.max((shelfGrams+cycle*N*houses+owed)/unit,1);
 const [floor,cap]=engine.rules.economy.priceFactorLimits.region,scarcity=Math.min(cap,Math.max(floor,demand/Math.max(1,supply)));
 return {supply,demand,scarcity,price:engine.byId.get(item).basePrice*scarcity,N,keys};
}
const near=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));

test('short of firewood: the fuel quote rises and residents buy; once supplied the quote falls back',async()=>{
 let doc=engine.initialFromLegacy(seed,'ke-upkeep');doc.state.minute=600;
 // The village's own firewood is gone; only the forge's shelf charcoal is left to buy (the keeper's shelf goods are not burned at home).
 for(const id of villagers(doc))for(const it of Object.keys(doc.state.npcs[id].inventory??{}))if(isItemClass(engine,it,'fuel')&&!(id===smith&&it===item))delete doc.state.npcs[id].inventory[it];
 doc.state.npcs[smith].inventory[item]={quantity:40,quality:'木',durability:100,weight:engine.byId.get(item).weight};// the forge's shelf charcoal
 doc=await wait(doc,1,'open');resyncBooks(engine,doc);
 // 价格的三步期望（见上 handQuote）在三份构造的状态上核对：开局（无欠量）、缺柴（每户欠 3 天的日用度）、补柴（欠量清零、每人持柴 40、铁匠铺炭回到 40）。
 // 构造状态与 npc-life 记录缺柴的方式相同：state.family.upkeep[户].fuelDebtG；不经时间推进，所以没有居民成交带来的深度与库存变化，期望可以精确手推。
 const opening=structuredClone(doc),h0=handQuote(opening);
 assert.ok(near(quote(opening).listPrice,h0.price),`开局：报价 ${quote(opening).listPrice} = 手推 ${h0.price}（稀缺度 ${h0.scarcity}）`);
 const cold=structuredClone(opening);cold.state.family={...cold.state.family,upkeep:{...cold.state.family?.upkeep}};
 for(const k of h0.keys)cold.state.family.upkeep[k]={...cold.state.family.upkeep[k],fuelDebtG:3*h0.N,fuelShortDays:3};
 resyncBooks(engine,cold);const hc=handQuote(cold);
 assert.ok(near(quote(cold).listPrice,hc.price),`缺柴：报价 ${quote(cold).listPrice} = 手推 ${hc.price}`);
 assert.ok(hc.demand>h0.demand&&hc.price>h0.price,'欠量推高需求，价严格上升（附加断言）');
 const warm=structuredClone(cold);
 for(const k of h0.keys)warm.state.family.upkeep[k]={...warm.state.family.upkeep[k],fuelDebtG:0,fuelShortDays:0};
 for(const id of Object.keys(warm.state.npcs))warm.state.npcs[id].inventory.item_wood=wood();
 warm.state.npcs[smith].inventory[item]={quantity:40,quality:'木',durability:100,weight:engine.byId.get(item).weight};
 resyncBooks(engine,warm);const hw=handQuote(warm);
 assert.ok(near(quote(warm).listPrice,hw.price),`补柴：报价 ${quote(warm).listPrice} = 手推 ${hw.price}`);
 assert.ok(hw.price<hc.price,'补柴后价回落（附加断言）');
 // 行为部分（推进时间）：缺柴三日居民没烧到柴、想买柴、来铁匠铺买炭；补给两日后没有户缺柴。
 doc=await wait(doc,3*DAY,'cold');
 assert.ok(Object.values(doc.state.family?.upkeep??{}).some(r=>r.fuelShortDays>0),'households went without fuel');
 assert.ok(shortWant(doc)>0,'the shortage is a want to buy fuel');
 const bought=Object.entries(doc.state.records).filter(([,r])=>r.category==='market_trade'&&r.item===item&&r.seller===smith&&r.buyer!=='player');
 assert.ok(bought.length>0,'residents came to buy charcoal');
 // Supplied again: everyone (also villagers out on a trip at this moment) gets firewood; once the short days end nobody wants fuel any more.
 for(const id of Object.keys(doc.state.npcs))doc.state.npcs[id].inventory.item_wood=wood();
 resyncBooks(engine,doc);doc=await wait(doc,2*DAY,'warm');
 assert.equal(shortWant(doc),0,'no village household is short any more');
 assert.deepEqual(reconcile(engine,doc).mismatches,[]);
});
