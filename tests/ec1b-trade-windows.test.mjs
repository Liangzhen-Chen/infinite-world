// EC-1b：客流按营业窗口结算（不再只在正午采样一次）、时钟在窗口起点停下、居民卖方（有可售余量的居民）与店铺同走 customer_flow 与 settleSale。
// 夹具沿用 ec1a-household-pool.test.mjs / s5-law-household-meals.test.mjs 的洛薇（A）与店主林穗；只用真实动作（客流、时钟边界），不加测试专用接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceCustomerFlow,flowTimesOfDay,customerFlowTimes} from '../server-plugin/business.mjs';
import {currentShops,nextShopMinute} from '../server-plugin/shop.mjs';
import {residentSellers,SALE_ORDER} from '../server-plugin/market-seller.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',D='npc_hw_xuling',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng',DAY=1440;
const at=(start,end,services=[],activity='休息')=>({start,end,location:home,activity,services});
// 店主林穗：早窗 480–720、午饭 720–780（不接待）、晚窗 780–1080（与诊断里 loc_bs 砚者同形）。
// 店主只在 720 起营业（货架清空时只剩居民卖方可买）；用于居民卖方用例：有营业窗口才有客流结算时刻。
const LATE=[at(0,720),at(720,1440,['trade'],'营业')];
const SELLER_DAY=[at(0,480),at(480,720,['trade'],'营业'),at(720,780,[],'午饭'),at(780,1080,['trade'],'营业'),at(1080,1440)];
function fixture({sellerSchedule=SELLER_DAY,residentSale=false,emptyShop=false,lateCustomer=false}={}){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.households=[{id:'win-a',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'win-c',members:[C],settlement:'loc_hw',homeLocation:home},{id:'win-seller',members:[seller],settlement:'loc_hw',homeLocation:home}];
 if(lateCustomer)w.households.push({id:'win-d',members:[D],settlement:'loc_hw',homeLocation:home});
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 const awake={default:[at(0,360,[],'睡眠'),at(360,1440,[],'闲居')]};// 居民真实起居：睡到 6 点，之后醒着
 for(const n of w.npcs.filter(n=>n.id===A)){n.tier='full';n.schedule=awake;}
 for(const n of w.npcs.filter(n=>[B,C].includes(n.id))){n.schedule=awake;}
 for(const n of w.npcs.filter(n=>n.id===seller)){n.tier='full';n.schedule={default:sellerSchedule};}
 if(lateCustomer)for(const n of w.npcs.filter(n=>n.id===D)){n.tier='full';n.schedule={default:[at(0,800,[],'睡眠'),at(800,1440,[],'闲居')]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1b-windows');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries((lateCustomer?[A,B,C,D,seller]:[A,B,C,seller]).map(id=>[id,{...doc.state.npcs[id],coins:id===A||id===D?1000:id===C?5:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
doc.state.npcs[seller].inventory=emptyShop?{}:{[item]:100};
 if(residentSale)doc.state.npcs[C].inventory={[item]:60};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:4,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const flowRecords=f=>Object.values(f.d.get('state','records')).filter(r=>r.category==='customer_flow');
const boughtBy=(f,id)=>flowRecords(f).flatMap(r=>r.visits).filter(r=>r.npc===id&&r.outcome==='bought');
test('flow times are the earliest overlap of a shop window and a customer waking window, once per customer and shop',()=>{
 const f=fixture(),state=f.d.get('state');
 assert.ok(currentShops(f.e,state).some(s=>s.keeper===seller),'the keeper runs a registered shop');
 // 早窗 [480,720) 与居民起床（360）后醒着段的交集，最早时刻是 480；午饭不接待；晚窗 780 起，但同一顾客同店当天只取最早一个时刻。
 assert.deepEqual(flowTimesOfDay(f.e,state,0),[480]);
 assert.deepEqual(flowTimesOfDay(f.e,state,1),[DAY+480],'same schedule every day');
 // 客流结算时刻 = 各（顾客，店）对的最早交集时刻去重，升序；区间半开 (before, after]；没有正午固定采样。
 assert.deepEqual(customerFlowTimes(f.e,state,-1,DAY-1),[480]);
 assert.deepEqual(customerFlowTimes(f.e,state,480,780),[]);
 // 全天营业的店（窗口 [0,1440)）在居民睡眠时不接客，居民 360 起床后才有交集；午夜不是结算时刻。
 const allDay=fixture({sellerSchedule:[at(0,1440,['trade'],'营业')]});
 assert.deepEqual(flowTimesOfDay(allDay.e,allDay.d.get('state'),0),[360],'an all-day shop is first served when the resident wakes, not at midnight');
 assert.deepEqual(customerFlowTimes(allDay.e,allDay.d.get('state'),-1,DAY-1),[360]);
});

test('the shop clock stops at the flow times while residents are about',()=>{
 const f=fixture();
 assert.equal(nextShopMinute(f.e,f.d,0),480);
 assert.equal(nextShopMinute(f.e,f.d,480),720);
 assert.equal(nextShopMinute(f.e,f.d,720),DAY);
 assert.equal(nextShopMinute(f.e,f.d,780),DAY,'the next stop is the midnight grid point');
});

test('customers are served in the morning window although the shop is closed at noon',()=>{
 const f=fixture();
 f.d.set(['state','minute'],720);
 advanceCustomerFlow(f.d,f.e,719,720);
 assert.equal(boughtBy(f,A).length,0,'at noon the keeper is at lunch: nothing is sold');
 f.d.set(['state','minute'],480);
 advanceCustomerFlow(f.d,f.e,479,480);
 const morning=boughtBy(f,A);
 assert.ok(morning.length,'the morning window sells');
 assert.ok(flowRecords(f).some(r=>r.minute===480&&r.day===0),'the visit is recorded at the window start');
 assert.ok(f.e.quantity(f.d,A,item)>0);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a resident with a saleable surplus sells through the same customer flow and settleSale, never as a fake shop',()=>{
 // 店主整天不营业（作息里没有 trade 服务），只有邻居神渡（C）手上有 60 个面包的余量；洛薇（A）缺口户向他买。
  const f=fixture({sellerSchedule:LATE,residentSale:true,emptyShop:true});
 const coinsC=f.d.get('state','npcs',C,'coins'),coinsA=f.d.get('state','npcs',A,'coins');
 assert.ok(residentSellers(f.d,f.e,720).some(s=>s.keeper===C&&s.goods.includes(item)),'precondition: the neighbour is a valid resident seller with a saleable surplus');
 f.d.set(['state','minute'],720);
 advanceCustomerFlow(f.d,f.e,719,720);
 const bought=boughtBy(f,A);
 assert.ok(bought.length,'the poor-in-bread household buys from the resident');
 const record=flowRecords(f).find(r=>r.visits.some(v=>v.npc===A&&v.outcome==='bought'));
 assert.equal(record.shop,`trader_${C}`,'the seller is a resident seller, not a registered shop');
 assert.equal(record.keeper,C);
  // 精确对账：A 付出 = 货款 + 路费；C 收到货款并按应税判定缴商税（visit.tax 是实缴额，不应税时为 0）。
 const paid=bought.reduce((n,r)=>n+r.paid,0),fares=bought.reduce((n,r)=>n+(r.travel?.paid??0),0);
 assert.equal(coinsA-f.d.get('state','npcs',A,'coins'),paid+fares);
assert.equal(f.d.get('state','npcs',C,'coins'),coinsC+paid-bought.reduce((n,r)=>n+(r.tax??0),0),'the seller receives the payment less the sales tax, exactly');
 assert.ok(f.e.quantity(f.d,A,item)>0&&f.e.quantity(f.d,C,item)<60);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
 // 居民卖方不产生经营回执与店铺记录。
 assert.equal(Object.values(f.d.get('state','records')).filter(r=>r.category==='business_receipt'&&r.businesses?.includes(record.shop)).length,0);
});

test('a resident never sells to the own household',()=>{
  const f=fixture({sellerSchedule:LATE,emptyShop:true});
 f.d.set(['state','npcs',B,'inventory'],{[item]:60});
 assert.ok(residentSellers(f.d,f.e,720).some(s=>s.keeper===B&&s.goods.includes(item)),'precondition: the housemate is a valid resident seller, so only the same-household rule can stop the sale');
 f.d.set(['state','minute'],720);
 advanceCustomerFlow(f.d,f.e,719,720);
 assert.ok(!flowRecords(f).some(r=>r.shop===`trader_${B}`),'the housemate bread is the household bread, not a sale');
});

test('settleSale keeps each call site its original ledger order: retail, counter and wholesale',()=>{
 // 合并只去掉重复代码，不改账序：店铺客流 付款→转物→税→财务→成交；玩家店柜台与手动售出 付款→税→转物→财务→成交；持货人出让与在场报价进货 转物→付款→成交→税→财务。
 assert.deepEqual(SALE_ORDER.retail,['pay','transfer','tax','finance','deal']);
 assert.deepEqual(SALE_ORDER.counter,['pay','tax','transfer','finance','deal']);
 assert.deepEqual(SALE_ORDER.wholesale,['transfer','pay','deal','tax','finance']);
});

test('each customer makes at most one trip per shop per day, even when later customers add later flow times',()=>{
 // 第二位顾客（徐凌）睡到 800 才醒：晚窗 [780,1080) 与他醒着段的最早交集是 800，于是当天有两个结算时刻 480 与 800；洛薇在 800 仍醒着，但上午已来过，不再来第二趟。
 const f=fixture({lateCustomer:true}),state=f.d.get('state');
 assert.deepEqual(flowTimesOfDay(f.e,state,0),[480,800]);
 advanceCustomerFlow(f.d,f.e,-1,DAY);
 const shopId=currentShops(f.e,f.d.get('state')).find(s=>s.keeper===seller).id;
 const trips=actor=>Object.values(f.d.get('state','records')).filter(r=>r.category==='market_trip'&&r.actor===actor&&r.id.startsWith(`market_trip:${shopId}:`));
 assert.equal(trips(A).length,1,'the early customer came once');
 assert.equal(trips(D).length,1,'the late customer came once, at his own flow time');
 assert.equal(trips(D)[0].departAt>=800,true);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
