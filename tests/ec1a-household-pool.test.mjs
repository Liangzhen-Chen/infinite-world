// EC-1a：同一登记户共灶的预算按户池只算一次（唯一口径：主观读一律并入同户成员的物品、钱袋与义务），钱袋不足时户内转账守恒；
// 公粮覆盖的饱腹不进采购缺口（份额与午夜 npc-life 同一换算，受 householdSubsistence 规则门控）。
// 夹具沿用 s5-law-household-meals.test.mjs 的两人户（A、B）与店主 seller；只用真实动作（客流）与公开读口，不加测试专用接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld,loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {householdBudget} from '../server-plugin/household-budget.mjs';
import {advanceCustomerFlow} from '../server-plugin/business.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {mealMouthsOf} from '../server-plugin/primitives-body.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng',DAY=1440;
const SAT=(await loadRuntimeWorld()).items.find(i=>i.id===item).nutrition.satiety;
const breadsFor=satiety=>Math.ceil(satiety/SAT);
// three:true 时 A、B、C 同户（三人分摊），否则 A、B 一户、C 另一户；keepSubsistence 保留 householdSubsistence 规则（公粮预算只在规则存在时扣）。
function fixture({coins={},bags={},status={},granaryEnabled=false,publicFood=0,market=false,three=false,keepSubsistence=false,sellerBread=100}={}){
 const w=structuredClone(world);
 if(!keepSubsistence)delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.households=three?[{id:'pool-house',members:[A,B,C],settlement:'loc_hw',homeLocation:home}]
  :[{id:'pool-house',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'pool-stranger',members:[C],settlement:'loc_hw',homeLocation:home}];
 if(market)w.households.push({id:'pool-seller',members:[seller],settlement:'loc_hw',homeLocation:home});
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 if(market)for(const n of w.npcs.filter(n=>[A,seller].includes(n.id))){n.tier='full';n.schedule={default:n.id===seller?[{start:0,end:720,location:home,activity:'休息',services:[]},{start:720,end:1440,location:home,activity:'休息',services:['trade']}]:[{start:0,end:1440,location:home,activity:'休息',services:[]}]};}// 客流按营业窗口起点结算：店主的营业窗口从 720 起
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1a-pool');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 const ids=market?[A,B,C,seller]:[A,B,C];
 doc.state.npcs=Object.fromEntries(ids.map(id=>[id,{...doc.state.npcs[id],coins:coins[id]??0,inventory:bags[id]??{},location:home,status:status[id]??'正常',activity:'休息'}]));
 if(market)doc.state.npcs[seller].inventory={[item]:sellerBread};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:3,granary:granaryEnabled,food:publicFood,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const coinsOf=(f,id)=>f.d.get('state','npcs',id,'coins');
const boughtBy=(f,id)=>Object.values(f.d.get('state','records')).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).filter(r=>r.npc===id&&r.outcome==='bought');
const spentBy=bought=>bought.reduce((n,r)=>n+r.paid+(r.travel?.paid??0),0);
const shortfall=(f,id,options)=>Number(householdBudget(f.d,f.e,id,options).resources.procurementShortfall.satiety);

test('subjective view exposes only the observer household: items, purses and own open obligations, never a stranger or a dead member',()=>{
 const f=fixture({coins:{[A]:3,[B]:40,[C]:500},bags:{[B]:{[item]:5}}});
 const view=subjectiveView(f.e,f.doc,A);
 assert.deepEqual(Object.keys(view.household.people),[B]);
 assert.equal(view.household.people[B].coins,40);
 assert.equal(view.household.people[B].inventory[item],5);
 assert.deepEqual(view.household.people[B].obligations,[]);
 assert.deepEqual(Object.keys(subjectiveView(f.e,f.doc,C).household.people),[],'a one-person household sees nobody else');
 assert.ok(!('memoryStream' in view.household.people[B])&&!('relations' in view.household.people[B]),'no memories or relations of housemates');
 const down=fixture({coins:{[A]:3,[B]:40},status:{[B]:'濒死'}});
 assert.deepEqual(Object.keys(subjectiveView(down.e,down.doc,A).household.people),[],'a dying housemate purse is not usable funds');
});

test('the one household budget counts housemates purses and bags once; the stranger household stays apart and the kernel read pools the same purses',()=>{
 const f=fixture({coins:{[A]:3,[B]:40,[C]:500},bags:{[B]:{[item]:breadsFor(120)*3}}});
 assert.equal(householdBudget(f.d,f.e,A).cash,43,'own purse plus the housemate purse, never the stranger');
 assert.equal(householdBudget(f.d,f.e,B).cash,43,'every member reads the same household pool');
 assert.equal(householdBudget(f.d,f.e,C).cash,500);
 // 客观读（kernel）与主观读同一条现金规则（EC-1b U7，household-budget objectiveCash）：同户共灶成员钱袋合计 3+40，陌生户 C 不入。
 assert.equal(householdBudget(f.d,f.e,A,{kernel:true}).cash,43,'the kernel read pools the same household purses once');
 assert.equal(householdBudget(f.d,f.e,C,{kernel:true}).cash,500,'a one-person household kernel read is its own purse');
 // 手算锚点：B 背包里的面包是同一灶的存粮（3 天份），A 与 B 读到的采购缺口都是 0；陌生户 C 没有存粮，缺口大于 0。
 assert.equal(shortfall(f,A),0);assert.equal(shortfall(f,B),0);
 assert.ok(shortfall(f,C)>0);
});

test('public ration share: full, partial and rule-gated, same exchange rate as the midnight meals',()=>{
 const without=fixture({coins:{[A]:50},keepSubsistence:true}),need=shortfall(without,A);
 assert.ok(need>0);
 const full=fixture({coins:{[A]:50},granaryEnabled:true,publicFood:1000,keepSubsistence:true});
 assert.equal(shortfall(full,A),0,'a full ration (food ≥ mouths) covers the standard day');
 // 部分份额：份额 = min(1, 粮库存量 ÷ ceil(口数))，采购缺口按 (1 − 份额) 缩小（两人户的需求是线性的）。
 const probe=fixture({keepSubsistence:true}),mouths=Math.max(1,Math.ceil(mealMouthsOf(probe.e,probe.doc.state,'loc_hw',3))),food=Math.floor(mouths/2);
 assert.ok(food>=1,'the population gives at least two mouths');
 const partial=fixture({coins:{[A]:50},granaryEnabled:true,publicFood:food,keepSubsistence:true}),share=Math.min(1,food/mouths);
 assert.ok(Math.abs(shortfall(partial,A)-need*(1-share))<1e-6,`partial share ${share} leaves ${need*(1-share)}`);
 // 规则门控：夹具去掉 householdSubsistence 时 plan 路径不发公粮，预算也不扣，与没有粮库一致。
 const gated=fixture({coins:{[A]:50},granaryEnabled:true,publicFood:1000});
 assert.equal(shortfall(gated,A),shortfall(fixture({coins:{[A]:50}}),A));
 assert.ok(shortfall(gated,A)>0);
});

test('customer flow: the poor member buys, the housemate purse tops it up, and the books balance exactly',()=>{
 const f=fixture({market:true,coins:{[A]:1,[B]:10000}});
 f.d.set(['state','minute'],720);advanceCustomerFlow(f.d,f.e,719,720);
 const bought=boughtBy(f,A);
 assert.ok(bought.length,'the pooled budget lets the poor member buy');
 const lostByB=10000-coinsOf(f,B);
 assert.ok(lostByB>0,'the housemate purse paid the shortfall');
 // 精确对账：A 的最终现金 = 起始 1 + 户内转入 − 自己花的（货款 + 路费）；转出方不为负。
 assert.equal(coinsOf(f,A),1+lostByB-spentBy(bought));
 assert.ok(coinsOf(f,A)>=0&&coinsOf(f,B)>=0);
 assert.ok(f.e.quantity(f.d,A,item)>0);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('customer flow: two housemates share the shortfall in a fixed order and the dying member is never drawn on',()=>{
 const split=fixture({market:true,three:true,coins:{[A]:1,[B]:5,[C]:10000}});
 split.d.set(['state','minute'],720);advanceCustomerFlow(split.d,split.e,719,720);
 const bought=boughtBy(split,A);
 assert.ok(bought.length);
 const fromB=5-coinsOf(split,B),fromC=10000-coinsOf(split,C);
 assert.equal(coinsOf(split,B),0,'the lower id is drained first, and only down to zero');
 assert.ok(fromC>0,'the remainder comes from the next member');
 assert.equal(coinsOf(split,A),1+fromB+fromC-spentBy(bought));
 assert.deepEqual(auditLedger(split.d.get('ledger')),[]);
 // 濒死成员的钱不并入预算也不转出：B 濒死时只剩 C 可补。
 const dying=fixture({market:true,three:true,coins:{[A]:1,[B]:7,[C]:10000},status:{[B]:'濒死'}});
 dying.d.set(['state','minute'],720);advanceCustomerFlow(dying.d,dying.e,719,720);
 assert.equal(coinsOf(dying,B),7,'a dying member purse is untouched');
 assert.deepEqual(auditLedger(dying.d.get('ledger')),[]);
});

test('after the household single purchase trip every member budget sees the day shortfall closed',()=>{
 const f=fixture({market:true,coins:{[A]:10000,[B]:10000}});
 f.d.set(['state','minute'],720);advanceCustomerFlow(f.d,f.e,719,720);
 assert.ok(boughtBy(f,A).length);
 // 户里只有 A 一人出门；买完后 A 与 B（不出门的同户成员）读到的同一户池缺口都已补平，同日不会再买第二遍。
 assert.equal(shortfall(f,A),0);
 assert.equal(shortfall(f,B),0);
 const stock=f.e.quantity(f.d,A,item);
 advanceCustomerFlow(f.d,f.e,720,DAY+720);
 assert.equal(f.e.quantity(f.d,A,item),stock,'no second purchase for the same day');
});

// ---- 有粮库聚落（granary!==false）的客流覆盖：公粮配给进采购缺口，缺口决定顾客买不买、买多少 ----
// 手推依据：公粮份额 share = min(1, 粮库存量 ÷ ceil(口数))（household-subsistence publicShareOf；开局当日没有农业结算记录，预算取这条预测）；
// 采购缺口（饱腹）= 户需求 ×（1 − share）；顾客的需求量 = ceil(缺口 ÷ 面包饱腹)（business.wants，店不在预算来源里时的储备缺口路径）；缺口为 0 则没有需求，不上门、不记客流。
// 顾客读的是主观预算（subjectiveView），期望也用同一读口；时刻取 720（店主营业窗口起点），夹具里只有 A 出门、钱袋充足，所以买到的量就是需求量。
const subjectiveShortfall=(f,id)=>shortfall(f,id,{view:subjectiveView(f.e,f.d.document,id)});
const visitsOf=(f,id)=>Object.values(f.d.get('state','records')).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).filter(r=>r.npc===id);
const noon=f=>f.d.set(['state','minute'],720);
const flow=f=>advanceCustomerFlow(f.d,f.e,719,720);
const marketFixture=o=>fixture({market:true,keepSubsistence:true,sellerBread:600,coins:{[A]:10000},...o});

test('granary ration, full: the shortfall is zero, nobody comes, no flow record (a no-granary control does come and buys)',()=>{
 const control=marketFixture({});noon(control);
 const need=subjectiveShortfall(control,A);
 assert.ok(need>0,'precondition: without a granary the household has a satiety need');
 flow(control);
 assert.ok(boughtBy(control,A).length>0,'precondition: that need brings the customer to the shop');
 const full=marketFixture({granaryEnabled:true,publicFood:1000});noon(full);
 assert.equal(subjectiveShortfall(full,A),0,'food 1000 >= mouths: share is 1, the ration covers the standard day');
 flow(full);
 assert.equal(visitsOf(full,A).length,0,'no need, no trip, no record');
 assert.equal(coinsOf(full,A),10000);
 assert.deepEqual(auditLedger(full.d.get('ledger')),[]);
});

test('granary ration, partial: the shortfall is need minus the ration and the customer buys exactly that many',()=>{
 const probe=marketFixture({}),mouths=Math.max(1,Math.ceil(mealMouthsOf(probe.e,probe.doc.state,'loc_hw',3))),food=Math.floor(mouths/2);
 assert.ok(food>=1,'the population gives at least two mouths');
 const share=Math.min(1,food/mouths);
 const control=marketFixture({});noon(control);
 const need=subjectiveShortfall(control,A);flow(control);
 const full=boughtBy(control,A);assert.equal(full.length,1);
 assert.equal(full[0].quantity,Math.ceil(need/SAT),'control: the whole need is bought');
 const partial=marketFixture({granaryEnabled:true,publicFood:food});noon(partial);
 const gap=subjectiveShortfall(partial,A);
 assert.ok(Math.abs(gap-need*(1-share))<1e-6,`share ${share} leaves ${need*(1-share)}`);
 assert.ok(gap>0,'precondition: a partial ration leaves a gap');
 flow(partial);
 const bought=boughtBy(partial,A);
 assert.equal(bought.length,1,'the customer still comes for the gap');
 assert.equal(bought[0].quantity,Math.ceil(gap/SAT),'bought by the gap, not by the whole need');
 assert.ok(bought[0].quantity<full[0].quantity,'the ration saved part of the purchase');
 assert.deepEqual(auditLedger(partial.d.get('ledger')),[]);
});

test('granary ration, empty store: no stock means no ration share, the household buys exactly as without a granary',()=>{
 // publicShareOf 取库存量折算：food 0 -> share 0（不是“有粮库就有公粮”）
 const control=marketFixture({});noon(control);
 const need=subjectiveShortfall(control,A);flow(control);
 const empty=marketFixture({granaryEnabled:true,publicFood:0});noon(empty);
 assert.equal(subjectiveShortfall(empty,A),need,'an empty granary gives no ration');
 flow(empty);
 const a=boughtBy(control,A),b=boughtBy(empty,A);
 assert.equal(a.length,1);assert.equal(b.length,1);
 assert.equal(b[0].quantity,Math.ceil(need/SAT));
 assert.equal(b[0].quantity,a[0].quantity);
 assert.deepEqual(auditLedger(empty.d.get('ledger')),[]);
});
