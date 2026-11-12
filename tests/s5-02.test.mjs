import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage,digest} from '../server-plugin/storage.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import path from 'node:path';
import {FIXED_SCALE} from '../server-plugin/rx.mjs';
import {marketQuote,marketSupply,saleableStock,marketGrade,purchasingPower,assertMarketDepth} from '../server-plugin/market.mjs';
import {tradeQuote} from '../server-plugin/shop.mjs';
import {netAssets} from '../server-plugin/finance-assets.mjs';
import {npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {householdResources} from '../server-plugin/household-budget.mjs';
import {handOatsScarcity,handSatiety,handFuelPrice} from './helpers/hand-targets.mjs';
import {localSpare} from '../server-plugin/distribution.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const host='npc_hw_linsui',bread='item_bread',inn='bld_hw_qingdeng';
function fixture(setup={},w=world){
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s502-market');
 // Money, opening shelves and the business window are unrelated premises.
 // F026: with {noCustomers:true} every resident but the tavern keeper is penniless, so nobody walks in and buys down the shelves while the
 // quote/day-rollover mechanics under test run (walk-in customers have their own tests in s5-w4-economy).
 const {noCustomers,...rest}=setup,poor=noCustomers?Object.keys(initial.state.npcs).filter(id=>id!==host).map(id=>({path:['state','npcs',id,'coins'],value:0})):[];
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:inn,coins:10000,...rest,...(poor.length?{facts:[...(rest.facts??[]),...poor]}:{})});
 assert.deepEqual(prepared.setupUnmet,[]);let document=prepared.document;
 return {engine,get document(){return document;},replace(next){document=next;},read(){return {document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)};},
  async act(args,id){const out=await engine.reduce(document,{tool:'world_trade',args,eventId:id});document=applyPatches(document,out.patches);return out;}};
}
const quote=f=>tradeQuote(f.read(),f.engine,{buyer:'player',seller:host,item:bread,quantity:1,location:inn,base:()=>f.engine.byId.get(bread).basePrice});

test('人对人零售不占用不存在的商号日深度，仍检查实际可售库存',()=>{
 const seller='npc_hw_ayan',item='item_s2_talc',f=fixture();
 const setup=applyIntentSetup(f.engine,f.document,{present:[seller],facts:[{path:['state','npcs',seller,'inventory'],value:{...f.document.state.npcs[seller].inventory,[item]:{quantity:10}}}]});
 assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 // 私人10份滑石不进入公开供给；q6>retailFloor5仍是无商号的零售，不能被零公开存量的日限额5拒绝。
 const args={seller,buyer:'player',item,location:inn},q=marketQuote(f.read(),f.engine,{...args,quantity:6});
 assert.deepEqual([q.business,q.supply,q.retail],[null,0,true]);
 assert.doesNotThrow(()=>assertMarketDepth(f.read(),f.engine,q));
 assert.throws(()=>assertMarketDepth(f.read(),f.engine,marketQuote(f.read(),f.engine,{...args,quantity:11})),/库存不足/);
});

test('current stock net assets share market value and S5-01 corrections, not historical cost',()=>{
 const f=fixture(),prepared=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','npcs',host,'inventory'],value:{[bread]:{quantity:10,quality:world.items.find(i=>i.id===bread).quality}}},
  {path:['state','npcs',host,'coins'],value:200}
 ]});assert.deepEqual(prepared.setupUnmet,[]);f.replace(prepared.document);
 // 食物池稀缺度按农事目标持有规律手推（hand-targets.handOatsScarcity：需求 = 货架目标 + 公仓目标持有，供给 = 公仓存粮 + 经营者行囊里的食物，折成燕麦件数；供给按持有量口径，不先扣店主自用留存）。
 // 开局公仓存粮 = 开局日的目标持有，所以此刻（开局日 10:00）比值略大于 1（目标持有按日变化，加上货架目标与店主行囊里的面包）。
 // 价 = 目录基价 2 × 运输因子 1（面包产自本聚落）× 夹取后的稀缺度；10 份面包 = 10 × 价；现金 200 不随成本史变化。
 const [floor,cap]=f.engine.rules.economy.priceFactorLimits.region,ratio=handOatsScarcity(f.engine,f.document.state,f.document.state.settlements.loc_hw.food).ratio,price=2*Math.min(cap,Math.max(floor,ratio));
 assert.ok(ratio>floor&&ratio<cap,'前置：稀缺度在夹取区间内，价随供需连续变化');
 const near=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
 assert.ok(near(netAssets(f.read(),f.engine,host),200+10*price));
 // Registered correction still changes current value: price + 1. 登记修正走定点算术（rx.mjs 的 FIXED_SCALE = 10000，单价精度 1e-4，向下取整），
 // 所以带修正的单价 = floor((价 + 1) × 10000) ÷ 10000；10 份面包 = 10 × 该单价。
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'asset-value',pack:'market',target:'economy:value',stage:'add',value:1}]}};
 const fixedUnit=Math.floor((price+1)*Number(FIXED_SCALE))/Number(FIXED_SCALE);
 assert.ok(near(netAssets(f.read(),new WorldEngine(w),host),200+10*fixedUnit));
});

test('independent bulk anchor integrates the actual neutral supply curve',async()=>{
 const f=fixture({location:'bld_hw_forge'}),seller='npc_hw_duanyan',item='item_steel_arming_sword';
 // 供给按持有量口径：卖方的全部库存 40 件都是供给 S=40（承诺不从供给里扣，只进需求）。需求 D = 货架上限 2 + 合同承诺 20 = 22。
 // 可售量 = 持有 40 − 承诺 20 = 20 ≥ 6，成交不被库存闸拒绝。稀缺度 D/S = 22/40 = 0.55，在 [.5,3] 内。
 const setup=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','npcs',seller,'inventory',item],value:40},
  {path:['state','records'],value:{...f.document.state.records,'bulk-procurement':{id:'bulk-procurement',category:'contract',kind:'procurement',parties:['player',seller],subject:item,quantity:20,fulfilled:0,status:'待履约'}}}
 ]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 // q6 exceeds retail max(5,40*.05=2)=5 and is within maxShare .3*40=12.
 // All other factors 1; D/(S-x) = 22/(40-x) runs 0.55 → 0.647, inside [.5,3]. Hence
 // integral_0^6 230*22/(40-x) dx = 5060*ln(40/34) = 822.34 → 822 copper, versus flat retail 230 × 0.55 × 6 = 759.
 // 15 §15.2 explicitly gives peer trade the retail value in both directions:
 // base230 * scarcity .55 * neutral depth/quality/corrections1 * 6 = 759.
 assert.equal(marketQuote(f.read(),f.engine,{seller,item,buyer:'npc_hw_ayan',quantity:6,location:'bld_hw_forge'}).totalCoins,759);
 const out=await f.act({seller,item,quantity:6},'anchor-bulk');
 assert.equal(out.result.pricing.retail,false);assert.equal(out.result.cost,Math.trunc(5060*Math.log(40/34)));assert.equal(out.result.cost,822);
});

test('independent copper anchors: neutral, second/third purchase, next day, quality, correction and total truncation',async()=>{
 const smith='npc_hw_duanyan',item='item_steel_arming_sword',forge='bld_hw_forge';
 const f=fixture({location:forge});
 // Non-examined opening inventory/contract premises use native setup. The
 // published sword costs 230; its shelf ceiling is 2. 供给按持有量口径：六把都是供给 S=6（承诺不从供给里扣）；
 // 需求 D = 货架上限 2 + 合同承诺 3 = 5，开局稀缺度 D/S = 5/6。可售量 = 6 − 3 = 3，恰够下面连买三把。No other
 // local holder initially owns this template; weapons have no food reserve.
 const setup=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','npcs',smith,'inventory',item],value:6},
  {path:['state','records'],value:{...f.document.state.records,'anchor-procurement':{id:'anchor-procurement',category:'contract',kind:'procurement',parties:['player',smith],subject:item,quantity:3,fulfilled:0,status:'待履约'}}}
 ]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 const opening=structuredClone(f.document);
 // Baseline 230 × D/S (5/6) × depth 1 × grade 1 × spread 1 ×
 // neutral regard 1 × corrections 1 = 191.67; truncate the full bill once → 191.
 const one=await f.act({seller:smith,item,quantity:1},'anchor-first');assert.equal(one.result.cost,191);
 // 15 §15.2：买走的剑在个人行囊中，不再是市场供给。第二笔 S=5、D=5、net=1、opening=6；
 // trunc(230×(5/5)×(1+.2×1/6)×既有关系因子.99895)=trunc(237.42)=237。
 const two=await f.act({seller:smith,item,quantity:1},'anchor-second');assert.equal(two.result.cost,237);
 assert.equal(two.result.pricing.relation,.99895);
 // 第三笔 S=4、D=5、net=2、opening=6；既有日内关系快照仍为.99895，
 // trunc(230×(5/4)×(1+.2×2/6)×.99895)=trunc(306.34)=306（本卡不改变关系规则）。
 const three=await f.act({seller:smith,item,quantity:1},'anchor-third');assert.equal(three.result.cost,306);
 assert.equal(three.result.pricing.relation,.99895);
 const next=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes:1440},eventId:'anchor-tomorrow'});f.replace(applyPatches(f.document,next.patches));
 // 新日只清除 net，不把已买走的剑放回市场：S=6−3=3、D=5，稀缺 5/3（在 [.5,3] 内）→ 230×5/3=383.33 → 383。
 const plain=marketQuote(f.read(),f.engine,{seller:smith,buyer:'player',item,location:forge});assert.equal(plain.totalCoins,383);
 // 以下独立检验品质、修正和整笔取整，复用本例起始市场（S=6、D=5），避免混入已发生的去库存。
 f.replace(opening);
 // Published qualityStep=1.25. Native silver baseline → silver 230;
 // next authored tier gives 230 × 5/6 × 1.25 = 239.58 → 239.
 const tiers=world.rules.equipment.qualities,index=tiers.indexOf(f.engine.byId.get(item).quality);
 const fine=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','itemInstances'],value:{...f.document.state.itemInstances,'anchor-fine':{id:'anchor-fine',item,owner:smith,status:'持有',quality:tiers[index+1]}}}]});assert.deepEqual(fine.setupUnmet,[]);f.replace(fine.document);
 assert.equal(marketQuote(f.read(),f.engine,{seller:smith,buyer:'player',item,location:forge,instances:['anchor-fine']}).totalCoins,239);
 // S5-01 production author declaration: add 1 copper after the ordinary
 // price factors, so 230 × 5/6 + 1 = 192.67 → 192; no quote computes the oracle.
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'anchor-handling',pack:'market',target:'economy:price',stage:'add',value:1}]}},corrected=new WorldEngine(w);
 assert.equal(marketQuote(f.read(),corrected,{seller:smith,buyer:'player',item,location:forge}).totalCoins,192);
 // Three silver swords, shop markup 1.375 (within published bounds):
 // 230 × 5/6 × 1 × 1 × 1 × 1.375 × 1 × 1 × 3 = 790.63 → 790;
 // truncating each 263.54 unit instead would wrongly charge 789.
 const retail=marketQuote(f.read(),f.engine,{seller:smith,buyer:'player',item,location:forge,quantity:3,business:{keeper:smith,markup:1.375}});
 assert.equal(retail.totalCoins,790);assert.equal(Math.trunc(retail.listPrice)*3,789);
 const retailWorld=structuredClone(world);retailWorld.rules.economy.shops.stores.find(s=>s.keeper===smith).markup=1.375;
 const native=fixture({location:forge},retailWorld);native.replace(opening);
 const receipt=await native.act({seller:smith,item,quantity:3},'anchor-three-retail');
 assert.equal(receipt.result.cost,790);assert.equal(opening.state.player.coins-native.document.state.player.coins,790);
 // A permitted authored markup 1.001 yields 230 × 5/6 × 1.001 = 191.86. The negotiated
 // integer offer 190 is within ceil(191.86*.9)=173..ceil(191.86*1.1)=212.
 // Three originals cost exactly 190*3=570; converting through a floating
 // discount ratio must not turn 569.9999999999999 into a 569-copper bill.
 const negotiatedWorld=structuredClone(world);negotiatedWorld.rules.economy.shops.stores.find(s=>s.keeper===smith).markup=1.001;
 const negotiated=fixture({location:forge},negotiatedWorld);negotiated.replace(opening);
 const paid=await negotiated.act({seller:smith,item,quantity:3,unitPrice:190},'anchor-three-negotiated');
 assert.equal(paid.result.cost,570);assert.equal(paid.result.pricing.unroundedTotal,570);
});

test('same-day purchases raise depth and conserve money and goods; no quote truth is saved',async()=>{
 const f=fixture(),before=structuredClone(f.document),first=quote(f);
 // 食物池价按农事目标持有手推（见 #2）：价 = 基价 2 × 夹取(手推比值) × 深度 × 价差 1 × 关系。
 // 第一笔前：无成交，深度 1，关系 1，价 = 2 × 夹取(比值)。第一笔后：深度 = 1 + 深度影响 × 净成交 ÷ 开盘存量，净成交 = 今日已卖 1 个面包 = 1（面包件数），
 // 开盘存量 = max(1, 现供给 + 净成交)，现供给 = 手推持有（燕麦件数）折成面包件数；关系 = 既有的日内熟客因子 0.99895（#4 同一规则）。
 // 大池里深度的增量（约 5e-6）远小于关系因子的降幅（约 1e-3），所以第二张报价的价比第一张略低，不是更高；深度本身严格上升。
 const [floor,cap]=f.engine.rules.economy.priceFactorLimits.region,clampR=r=>Math.min(cap,Math.max(floor,r)),near=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b));
 const hand=state=>handOatsScarcity(f.engine,state,state.settlements.loc_hw.food),satBread=handSatiety(f.engine,bread),sat=handSatiety(f.engine,'item_oats');
 assert.ok(near(first.listPrice,2*clampR(hand(f.document.state).ratio)),'第一张报价 = 2 × 夹取(手推比值)');
 const one=await f.act({seller:host,item:bread,quantity:1},'s502-first');
 assert.equal(one.result.ok,true);
 const second=quote(f),h2=hand(f.document.state),S2=h2.held*sat/satBread;
 assert.ok(second.explanation.depth>first.explanation.depth);
 assert.ok(near(second.explanation.depth,1+f.engine.world.marketRules.depthImpact*1/Math.max(1,S2+1)),'深度 = 1 + 影响 × 净成交 1 ÷ 开盘存量');
 assert.ok(near(second.listPrice,2*clampR(h2.ratio)*(1+f.engine.world.marketRules.depthImpact*1/Math.max(1,S2+1))*0.99895),'第二张报价 = 2 × 夹取(比值) × 深度 × 关系 0.99895');
 const two=await f.act({seller:host,item:bread,quantity:1},'s502-second');assert.equal(two.result.ok,true);
 assert.equal(f.document.state.player.coins,before.state.player.coins-one.result.cost-two.result.cost);
 const stock=document=>{const v=document.state.npcs[host].inventory[bread];return typeof v==='number'?v:v.quantity;};
 assert.equal(stock(f.document),stock(before)-2);
 const itemTotal=document=>Object.entries(document.ledger.accounts).filter(([k])=>k.split('|')[1]===bread).reduce((n,[,v])=>n+v,0);
 const cashTotal=document=>Object.entries(document.ledger.accounts).filter(([k])=>k.split('|')[1]==='coin_river').reduce((n,[,v])=>n+v,0);
 // Open the native ledger without changing the captured state; genesis is a
 // storage concern, whereas this assertion compares the two settled trades.
 const afterOne=applyPatches(before,one.patches);
 assert.equal(itemTotal(f.document),itemTotal(afterOne));assert.equal(cashTotal(f.document),cashTotal(afterOne));
 assert.equal(Object.values(f.document.state.records).some(r=>['trade_quote','regional_quote'].includes(r.category)),false);
 assert.equal(Object.keys(f.document.state.quotes).length,0);
});

test('retention and signed procurement commitments are subtracted once; goods class aggregates holders',async()=>{
 const f=fixture(),state=f.document.state,npc=state.npcs[host];
 const prepared=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','npcs',host,'inventory'],value:{[bread]:{quantity:12,quality:world.items.find(i=>i.id===bread).quality}}},
  {path:['state','npcs','npc_hw_ayan','inventory'],value:{}},
  {path:['state','records'],value:{...state.records,contract_market_reserve:{id:'contract_market_reserve',category:'contract',kind:'procurement',parties:['player',host],subject:bread,quantity:4,fulfilled:1,status:'待履行'}}}
 ]});assert.deepEqual(prepared.setupUnmet,[]);f.replace(prepared.document);
 const business=saleableStock(f.read(),f.engine,host,bread,{business:true});
 // Authored household house_hw_01 has Lin Sui and A Yan. The unrelated
 // second bag is empty. Body light satiety 2.5/h *24h *1day *2 people
 // =120。面包饱腹按配方推导（handSatiety，约 16，不再是 30），留存 = ceil(120 ÷ 饱腹)。
 // 现金抵扣（K02）要有可指望的来源：店主自己的货架下一次本地补货要向本聚落其他户进货（shop.mjs:382 的 localSpare ≥ 1，distribution.mjs:56-58），
 // 而别户每户的留存 ceil(60 ÷ 饱腹) = 4 份，手上只有 4 份，没有可出让的余量，来源为空，所以现金不抵扣（household-budget.mjs:334、411）。
 // 留存 = ceil(120 ÷ 饱腹)；可售 = 12 − 留存 − 承诺 3（承诺 4 份已履行 1 份，未付 3 份）。
 const satBread=handSatiety(f.engine,bread),retainedBread=Math.ceil(2*60/satBread);
 assert.equal(localSpare(f.read(),f.engine,{settlement:'loc_hw',item:bread,buyer:host}),0,'前置：本聚落别户没有面包余量可出让，现金无来源可抵扣');
 assert.equal(business.stock,12);assert.equal(business.retained,retainedBread);assert.equal(business.committed,3);assert.equal(business.available,12-retainedBread-3);
 // 持有量口径：供给改计店主全部库存（不先扣自用留存），公开供给行里店主的可售存量 = 全部 12 件。
 const personal=saleableStock(f.read(),f.engine,host,bread);
 assert.equal(personal.retained,retainedBread);assert.equal(personal.available,12-retainedBread-3);
 const supply=marketSupply(f.read(),f.engine,bread,inn);assert.ok(supply.rows.some(r=>r.owner===host&&r.available===12));assert.equal(supply.supply,supply.rows.reduce((n,r)=>n+r.available*r.unit,0));
 const before=structuredClone(f.document);
 // 可售量只有 12 − 留存 − 承诺，卖 6 件超过可售量，被库存闸拒绝，物理转移之前就回滚。
 await assert.rejects(f.act({seller:host,item:bread,quantity:6},'household-cannot-sell-promises'),/库存不足/);
 assert.deepEqual(f.document,before,'retained or promised food cannot fund a partial transaction');
 // Split bags allocate the four-meal baseline once, not twice. It now sits
 // in A Yan's bag: Lin Sui's cash cannot release another holder's reserve
 // before an actual food/money transfer.
 const split=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',host,'inventory',bread],value:6},{path:['state','npcs','npc_hw_ayan','inventory'],value:{[bread]:6}}]});assert.deepEqual(split.setupUnmet,[]);f.replace(split.document);
 const pair=[host,'npc_hw_ayan'].map(id=>saleableStock(f.read(),f.engine,id,bread,{business:true}));
 assert.equal(pair.reduce((n,r)=>n+r.retained,0),retainedBread);assert.equal(pair.reduce((n,r)=>n+r.available,0),12-retainedBread-3);
 // 同一两人家户仍保留4份、承诺3份：分到无经营身份成员的行囊不进入市场供给，
 // 但家户的消费/承诺需求不能随分袋方式消失（15 §15.2，有效需求与可售存量分列）。
 const splitSupply=marketSupply(f.read(),f.engine,bread,inn);
 assert.ok(splitSupply.rows.every(r=>r.owner!=='npc_hw_ayan'));
 assert.equal(splitSupply.demand,supply.demand);
 // Registered body:drain multiplier2 doubles each member's 60/day need:
 // 留存 = ceil(2 人 × 120 ÷ 饱腹) = ceil(240 ÷ 16) = 15 份，超过两个行囊合计的 12 份：留存封顶于持有量 12（全部留作口粮），
 // 可售 = max(0, 12 − 12 − 承诺 3) = 0；没有现金来源可抵扣（同上），物理基线与带现金口径相同。
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'household-needs',pack:'market',target:'body:drain',stage:'mul',value:2}]}};
 const corrected=new WorldEngine(w),adjusted=[host,'npc_hw_ayan'].map(id=>saleableStock(f.read(),corrected,id,bread));
 const doubled=Math.min(12,Math.ceil(2*120/satBread));
 assert.equal(adjusted.reduce((n,r)=>n+r.retained,0),doubled);assert.equal(adjusted.reduce((n,r)=>n+r.available,0),Math.max(0,12-doubled-3));
 const physical=householdResources(f.read(),corrected,host,{marketSubstitution:false});
 assert.equal(physical.rows.reduce((n,r)=>n+r.retained,0),doubled);assert.equal(physical.rows.reduce((n,r)=>n+r.available,0),Math.max(0,12-doubled-3));
});

test('native NPC autonomous purchase pays the independent market anchor and records real depth without a quote cache',async()=>{
 // A Yan is Lin Sui's brother (authored trust80), so use the existing smith
 // for this neutral-customer price anchor rather than erasing that relation.
 const buyer='npc_hw_duanyan',w=structuredClone(world);
 // 木料价要手推需求：把每日出行上限压到 1 分钟，没有户够得到公共来源（handFuelPrice 前置逐户断言自给 0），户用全额走市场。
 w.rules.householdSubsistence.maximumJourneyMinutes=1;
 for(const id of [host,buyer])w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:inn,activity:'日常活动',services:id===host?['trade']:[]}]};
 const f=fixture({facts:[{path:['state','npcs',buyer,'location'],value:inn}]},w);
 const neutral=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:{...f.document.state.records,[`standing:${host}:${buyer}`]:{category:'standing',holder:host,target:buyer,value:0,history:[]}}}]});assert.deepEqual(neutral.setupUnmet,[]);f.replace(neutral.document);
 const before=structuredClone(f.document),plan={kind:'npc-plan',version:1,minute:600,stateFingerprint:npcPlanFingerprint(f.document),proposals:[{npc:buyer,actions:[{kind:'trade',seller:host,item:bread,quantity:1}]}]};
 const started=await f.engine.reduce(f.document,{type:'npc_plan',plan,eventId:'market-npc-plan'});f.replace(applyPatches(f.document,started.patches));assert.equal(started.result.results[0].status,'进行中');
 const finished=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes:5},eventId:'market-npc-finish'});f.replace(applyPatches(f.document,finished.patches));
 const task=f.document.state.npcAutonomy.tasks[started.result.results[0].id];assert.equal(task.status,'已完成',task.reason);
 // Bread baseline2 * plentiful supply floor.5 * grade1 * neutral regard1
 // * shop markup1 * first-day-depth1 * correction1 *quantity1 =1 copper.
 assert.equal(before.state.npcs[buyer].coins-f.document.state.npcs[buyer].coins,1);
 assert.equal(f.document.state.npcs[host].coins-before.state.npcs[host].coins,1);
 const deal=Object.values(f.document.state.records).find(r=>r.category==='market_trade'&&r.buyer===buyer&&r.seller===host);assert.ok(deal);assert.equal(deal.totalCoins,1);assert.equal(deal.quantity,1);
 assert.equal(Object.keys(f.document.state.quotes).length,0);
 // The regional wrapper is also a read-only projection: 木料价 = 4 × 夹取(手推需求 ÷ 手推供给)（燃料池：木料与木炭同池，见 hand-targets.handFuelPrice 的推导）。
 const unchanged=structuredClone(f.document),woodHand=handFuelPrice(f.engine,f.document.state,'item_wood');
 assert.ok(Math.abs(regionalTradePrice(f.read(),f.engine,'item_wood','loc_hw')-woodHand.price)<=1e-9*woodHand.price);assert.deepEqual(f.document,unchanged);
});

test('quality and actual liquid composition price the selected original unit',()=>{
 const f=fixture(),water=world.items.find(i=>i.tags?.includes('water'));
 assert.ok(water,'world has a native water portion');
 const quality=world.rules.equipment.qualities,normal=quality.indexOf(water.quality),higher=quality[Math.min(quality.length-1,normal+1)];
 // Unit identity/composition are not under examination here: declared native
 // item-instance facts, exactly as container extraction creates them.
 const setup=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','itemInstances'],value:{...f.document.state.itemInstances,
   's502-clean':{id:'s502-clean',item:water.id,owner:'player',status:'持有',quality:water.quality,liquid:{waterMl:250,saltMg:0,toxinUg:0}},
   's502-salt':{id:'s502-salt',item:water.id,owner:'player',status:'持有',quality:water.quality,liquid:{waterMl:250,saltMg:1000,toxinUg:0}},
   's502-fine':{id:'s502-fine',item:water.id,owner:'player',status:'持有',quality:higher,liquid:{waterMl:250,saltMg:0,toxinUg:0}}}}
 ]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 const grade=id=>marketGrade(f.engine,f.document,water.id,{seller:'player',instances:[id]});
 assert.ok(grade('s502-clean')>grade('s502-salt'));assert.ok(grade('s502-fine')>grade('s502-clean'));
 const read=id=>marketQuote(f.read(),f.engine,{item:water.id,seller:'player',buyer:host,location:inn,instances:[id]});
 assert.ok(read('s502-clean').listPrice>read('s502-salt').listPrice);assert.ok(read('s502-fine').listPrice>read('s502-clean').listPrice);
});

test('retail rounds only the final total; bulk integrates the clamped supply curve',()=>{
 const f=fixture();
 const args={item:bread,location:inn,seller:host,buyer:'player',business:{keeper:host,markup:1.37}};
 const one=marketQuote(f.read(),f.engine,{...args,quantity:1}),three=marketQuote(f.read(),f.engine,{...args,quantity:3});
 assert.equal(three.retail,true);assert.equal(three.totalCoins,Math.trunc(3*one.listPrice));assert.notEqual(three.totalCoins,3*Math.trunc(one.listPrice));
 const bulk=marketQuote(f.read(),f.engine,{...args,quantity:Math.max(6,Math.ceil(one.supply*.06))});
 assert.equal(bulk.retail,false);assert.ok(bulk.explanation.curve>0);assert.ok(bulk.exactTotal>=bulk.listPrice*bulk.quantity);
});

test('explanation reproduces quote; native storage roundtrip rederives; next day removes daily pressure',async t=>{
 const f=fixture({noCustomers:true});await f.act({seller:host,item:bread,quantity:1},'s502-roundtrip');
 const q=quote(f),e=q.explanation;
 assert.equal(e.value.base,e.base*e.scarcity*e.quality);assert.equal(e.price.base,e.value.value*e.depth*e.spread*e.relation);
 assert.equal(q.listPrice,e.price.value);assert.equal(q.totalCoins,Math.trunc(q.exactTotal));
 const root=await fs.mkdtemp(path.join(tmpRoot(),'s502-save-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reduce=(document,input)=>f.engine.reduce(document,input),store=new CampaignStorage(root,{reducer:reduce});
 await store.create({id:'market',worldVersion:world.version??'market',document:f.document});
 const saved=await new CampaignStorage(root,{reducer:reduce}).read('market');f.replace(saved.document);assert.deepEqual(quote(f),q);
 const next=await f.engine.reduce(f.document,{tool:'world_time',args:{minutes:1440},eventId:'s502-next-day'});f.replace(applyPatches(f.document,next.patches));
 // 次日只清掉昨日的成交压力（昨天那笔 day 不同，不再计入）；新的一天自己的成交（居民自主采买等，记在 market_trade 记录里）照常计入深度：
 // depth = max(0, 1 + 深度影响 × 净成交 ÷ 开盘存量)，净成交 = Σ今日同池成交（卖 +、买 −）× 各自饱腹 ÷ 报价货饱腹，开盘存量 = max(1, 现供给 + 净成交)（面包件数）；
 // 现供给折成面包件数 = 手推的持有（handOatsScarcity.held，燕麦件数）× 燕麦饱腹 ÷ 面包饱腹。全部读记录与规则数据手推。
 const nowState=f.document.state,today=Math.floor(nowState.minute/1440),deals=Object.values(nowState.records).filter(r=>r.category==='market_trade'&&r.day===today&&r.place==='loc_hw'&&r.goods==='goods:food');
 assert.ok(!deals.some(r=>r.day===today-1),'昨天的成交不计入今天');
 const satBread=handSatiety(f.engine,bread),net=deals.reduce((n,r)=>n+(r.side==='sell'?r.quantity:-r.quantity)*handSatiety(f.engine,r.item)/satBread,0);
 const heldBread=handOatsScarcity(f.engine,nowState,nowState.settlements.loc_hw.food).held*handSatiety(f.engine,'item_oats')/satBread;
 const depthExpected=Math.max(0,1+f.engine.world.marketRules.depthImpact*net/Math.max(1,heldBread+net));
 assert.ok(Math.abs(quote(f).explanation.depth-depthExpected)<=1e-9,`次日深度 ${quote(f).explanation.depth} = 手推 ${depthExpected}（今日净成交 ${net}）`);assert.ok(quote(f).listPrice<q.listPrice);
 const power=purchasingPower(f.read(),f.engine,inn,100);assert.ok(power.ppi>0);assert.equal(power.realValue,100/power.ppi);
});

test('NPC shop buying uses the opposite spread and settles original goods for real cash',async()=>{
 // Eight opening portions cover this two-person household's four retained
 // portions plus the three bought here. The shelf is a non-examined premise.
 const f=fixture({facts:[{path:['state','npcs',host,'inventory',bread],value:8}]});await f.act({seller:host,item:bread,quantity:3},'s502-three');
 const sell=quote(f),buy=tradeQuote(f.read(),f.engine,{buyer:host,seller:'player',item:bread,quantity:1,location:inn,base:()=>f.engine.byId.get(bread).basePrice});
 assert.equal(buy.explanation.spread,world.marketRules.spread.buy);assert.ok(buy.listPrice<sell.listPrice);
 const before=structuredClone(f.document),out=await f.act({buyer:host,seller:'player',item:bread,quantity:1},'s502-sell');
 assert.equal(out.result.cost,buy.totalCoins);assert.equal(f.document.state.player.coins,before.state.player.coins+buy.totalCoins);
 assert.equal(f.document.state.npcs[host].coins,before.state.npcs[host].coins-buy.totalCoins);
 assert.equal(f.document.state.inventory[bread].quantity,before.state.inventory[bread].quantity-1);
});

test('bulk integrates additive derived corrections instead of multiplying the initial price ratio',()=>{
 // S5-01 author declarations are production rule inputs, not test-only APIs.
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'handling',pack:'market',target:'economy:price',stage:'add',value:1}]}};
 const original=fixture(),corrected=fixture({},w),item='item_oats';
 const args={item,location:inn,seller:host,buyer:'player',business:{keeper:host,markup:1}};
 const supply=marketSupply(original.read(),original.engine,item,inn),quantity=Math.max(6,Math.floor(supply.supply*.2));
 const plain=marketQuote(original.read(),original.engine,{...args,quantity}),extra=marketQuote(corrected.read(),corrected.engine,{...args,quantity});
 assert.equal(plain.retail,false);assert.equal(extra.retail,false);assert.ok(extra.explanation.price.contributions.some(r=>r.id==='handling'));
 // rx.fixed 按四位向零截断，而非四舍五入。正价格每个边际点误差在[-1定点单位,0]，
 // 积分误差在[-quantity/FIXED_SCALE,0]；以同宽单边区间替代旧的错误半单位对称区间。
 const truncation=extra.exactTotal-plain.exactTotal-quantity;
 assert.ok(truncation<=1e-7);assert.ok(truncation>=-quantity/Number(FIXED_SCALE)-1e-7);
 assert.equal(extra.totalCoins-plain.totalCoins,quantity);assert.equal(extra.totalCoins,Math.trunc(extra.exactTotal));
});

test('failed transactions return no writes and leave both ledgers untouched',async()=>{
 const f=fixture({coins:0}),before=structuredClone(f.document);
 await assert.rejects(f.act({seller:host,item:bread,quantity:1},'s502-no-cash'),/余额不足/);
 assert.deepEqual(f.document,before);
 await assert.rejects(f.act({seller:host,item:bread,quantity:100000},'s502-too-many'),/深度|库存不足/);
 assert.deepEqual(f.document,before);
});

test('signed total stays frozen while its actual delivery enters daily market depth',async()=>{
 const f=fixture(),minute=f.document.state.minute,id='s502-signed',key=`agreed_quote:${id}`;
 // Contract negotiation is a non-examined premise. Declare its native source
 // event and receipt; shop's unchanged source/digest gate validates the terms.
 const row={id,category:'agreed_quote',actor:host,to:'player',resource:bread,quantity:2,totalCoins:3,direction:'sell_to_player',at:minute,expires:minute+1440,sourceEvent:`world_event:${id}`};
 const source={id,category:'world_event',verb:'quoted',actor:host,minute,payload:{to:'player',resource:bread,quantity:2,totalCoins:3}};
 const prepared=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:{...f.document.state.records,[key]:row,[`${key}:source`]:{category:'agreed_quote_receipt',digest:digest(row)},[`world_event:${id}`]:source}}]});
 assert.deepEqual(prepared.setupUnmet,[]);f.replace(prepared.document);
 const before=quote(f),out=await f.act({seller:host,item:bread,quantity:2},'s502-delivery');
 assert.equal(out.result.cost,3);assert.equal(f.document.state.records['market-trade:s502-delivery'].quantity,2);
 assert.ok(f.document.state.records[`${key}:used`]);assert.ok(quote(f).explanation.depth>before.explanation.depth);
});

test('negotiated native retail receipt explains the actual one-time rounded total',async()=>{
 // The non-examined shelf must cover household reserve4 plus this lot3.
 const f=fixture({facts:[{path:['state','npcs',host,'inventory',bread],value:8}]}),q=tradeQuote(f.read(),f.engine,{buyer:'player',seller:host,item:bread,quantity:3,location:inn,base:()=>f.engine.byId.get(bread).basePrice});
 const offer=Math.ceil(q.listPrice*world.rules.economy.priceFactorLimits.bargain[1]);
 const out=await f.act({seller:host,item:bread,quantity:3,unitPrice:offer},'s502-bargain'),r=out.result;
 assert.equal(r.pricing.unitPrice,offer);assert.equal(r.pricing.bargainFactor,offer/q.listPrice);
 assert.equal(r.pricing.unroundedTotal,q.exactTotal*(offer/q.listPrice));
 assert.equal(r.cost,Math.trunc(r.pricing.unroundedTotal));assert.equal(r.cost,r.pricing.unroundedTotal+r.pricing.rounding);
});

test('native shop depth changes actual paid copper on consecutive high-value purchases',async()=>{
 const f=fixture({location:'bld_hw_forge'}),seller='npc_hw_duanyan',item='item_steel_arming_sword';
 const first=await f.act({seller,item,quantity:1},'s502-sword-1'),afterFirst=structuredClone(f.document);
 const second=await f.act({seller,item,quantity:1},'s502-sword-2');
 assert.ok(second.result.pricing.unitPrice>first.result.pricing.unitPrice);
 assert.ok(second.result.cost>first.result.cost,'depth affects actual settlement, not just a displayed fractional quote');
 const coins=document=>Object.entries(document.ledger.accounts).filter(([key])=>key.split('|')[1]==='coin_river').reduce((n,[,v])=>n+v,0);
 assert.equal(coins(f.document),coins(afterFirst));
 assert.equal(afterFirst.state.player.coins-f.document.state.player.coins,second.result.cost);
});
