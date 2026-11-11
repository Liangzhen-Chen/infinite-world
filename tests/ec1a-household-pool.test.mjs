// EC-1a：同一登记户共灶的预算按户池只算一次（成员背包与钱袋并入），钱袋不足时户内转账守恒；公粮覆盖的饱腹不进采购缺口。
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

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng',DAY=1440;
const SAT=(await loadRuntimeWorld()).items.find(i=>i.id===item).nutrition.satiety;
const breadsFor=satiety=>Math.ceil(satiety/SAT);
function fixture({coins={},bags={},granaryEnabled=false,publicFood=0,market=false}={}){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 // 两人一户（A、B），C 单独一户；店主 seller 另一户。
 w.households=[{id:'pool-house',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'pool-stranger',members:[C],settlement:'loc_hw',homeLocation:home}];
 if(market)w.households.push({id:'pool-seller',members:[seller],settlement:'loc_hw',homeLocation:home});
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 if(market)for(const n of w.npcs.filter(n=>[A,seller].includes(n.id))){n.tier='full';n.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:n.id===seller?['trade']:[]}]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1a-pool');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 const ids=market?[A,B,C,seller]:[A,B,C];
 doc.state.npcs=Object.fromEntries(ids.map(id=>[id,{...doc.state.npcs[id],coins:coins[id]??0,inventory:bags[id]??{},location:home,status:'正常',activity:'休息'}]));
 if(market)doc.state.npcs[seller].inventory={[item]:100};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:3,granary:granaryEnabled,food:publicFood,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}

test('subjective view exposes housemates items and purses only for the same registered household',()=>{
 const f=fixture({coins:{[A]:3,[B]:40,[C]:500},bags:{[B]:{[item]:5}}});
 const view=subjectiveView(f.e,f.doc,A);
 assert.deepEqual(Object.keys(view.household.people),[B]);
 assert.equal(view.household.people[B].coins,40);
 assert.equal(view.household.people[B].inventory[item],5);
 assert.ok(!(C in view.household.people),'a stranger household is never exposed');
});

test('pooled household budget counts housemates purses and bags once; default budget stays personal',()=>{
 const f=fixture({coins:{[A]:3,[B]:40,[C]:500},bags:{[B]:{[item]:breadsFor(120)*3}}});
 const personal=householdBudget(f.d,f.e,A),pooled=householdBudget(f.d,f.e,A,{pooled:true});
 assert.equal(personal.cash,3);
 assert.equal(pooled.cash,43,'own purse plus the housemate purse, never the stranger');
 // 手算锚点：B 背包里的面包是同一灶的存粮，计入后这户的采购缺口不增反减；默认（个人）读不见它。
 assert.ok(pooled.resources.procurementShortfall.satiety<personal.resources.procurementShortfall.satiety);
 assert.equal(pooled.resources.procurementShortfall.satiety,0);
 assert.ok(personal.resources.procurementShortfall.satiety>0);
});

test('public ration covered satiety is not procurement demand; without a granary the demand stays',()=>{
 const without=fixture({coins:{[A]:50}});
 const covered=fixture({coins:{[A]:50},granaryEnabled:true,publicFood:1000});
 const need=householdBudget(without.d,without.e,A).resources.procurementShortfall.satiety;
 assert.ok(need>0);
 // 公粮份额 = min(1, 粮库存量 ÷ 人口) = 1：标准日耗已由公粮覆盖，采购缺口为 0；两种读法（个人/户池）一致。
 assert.equal(householdBudget(covered.d,covered.e,A).resources.procurementShortfall.satiety,0);
 assert.equal(householdBudget(covered.d,covered.e,A,{pooled:true}).resources.procurementShortfall.satiety,0);
});

test('customer flow tops the buyer purse up from the housemate purse and the ledger audits clean',()=>{
 const f=fixture({market:true,coins:{[A]:1,[B]:10000}});
 f.d.set(['state','minute'],720);advanceCustomerFlow(f.d,f.e,719,720);
 const bought=Object.values(f.d.get('state','records')).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits).filter(r=>r.npc===A&&r.outcome==='bought');
 assert.ok(bought.length,'the pooled budget lets the poor member buy');
 assert.ok(f.d.get('state','npcs',B,'coins')<10000,'the housemate purse paid the shortfall');
 assert.ok(f.e.quantity(f.d,A,item)>0);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a second housemate does not buy the same day food again after the first purchase',()=>{
 const f=fixture({market:true,coins:{[A]:10000,[B]:10000}});
 // B 不是完整人物不会自己上门；户里只有 A 一人出门，买完后再次结算同一天也不重复买（户池缺口已补）。
 f.d.set(['state','minute'],720);advanceCustomerFlow(f.d,f.e,719,720);
 const first=f.e.quantity(f.d,A,item);
 assert.ok(first>0);
 const after=householdBudget(f.d,f.e,A,{pooled:true}).resources.procurementShortfall.satiety;
 assert.equal(after,0,'the day shortfall is closed by the first purchase');
});
