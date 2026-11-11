// EC-1b：客流按营业窗口结算（不再只在正午采样一次）、时钟在窗口起点停下、居民卖方（有可售余量的居民）与店铺同走 customer_flow 与 settleSale。
// 夹具沿用 ec1a-household-pool.test.mjs / s5-law-household-meals.test.mjs 的洛薇（A）与店主林穗；只用真实动作（客流、时钟边界），不加测试专用接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceCustomerFlow,tradeWindowStarts,customerFlowTimes} from '../server-plugin/business.mjs';
import {currentShops,nextShopMinute} from '../server-plugin/shop.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng',DAY=1440;
const at=(start,end,services=[],activity='休息')=>({start,end,location:home,activity,services});
// 店主林穗：早窗 480–720、午饭 720–780（不接待）、晚窗 780–1080（与诊断里 loc_bs 砚者同形）。
const SELLER_DAY=[at(0,480),at(480,720,['trade'],'营业'),at(720,780,[],'午饭'),at(780,1080,['trade'],'营业'),at(1080,1440)];
function fixture({sellerSchedule=SELLER_DAY,residentSale=false}={}){
 const w=structuredClone(world);
 delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.households=[{id:'win-a',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'win-c',members:[C],settlement:'loc_hw',homeLocation:home},{id:'win-seller',members:[seller],settlement:'loc_hw',homeLocation:home}];
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 const awake={default:[at(0,1440,[],'闲居')]};
 for(const n of w.npcs.filter(n=>n.id===A)){n.tier='full';n.schedule=awake;}
 for(const n of w.npcs.filter(n=>n.id===C)){n.schedule=awake;}
 for(const n of w.npcs.filter(n=>n.id===seller)){n.tier='full';n.schedule={default:sellerSchedule};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1b-windows');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,C,seller].map(id=>[id,{...doc.state.npcs[id],coins:id===A?1000:id===C?5:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
 doc.state.npcs[seller].inventory={[item]:100};
 if(residentSale)doc.state.npcs[C].inventory={[item]:60};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:4,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);
 return {e,doc,d:e.primitiveDraft(doc)};
}
const flowRecords=f=>Object.values(f.d.get('state','records')).filter(r=>r.category==='customer_flow');
const boughtBy=(f,id)=>flowRecords(f).flatMap(r=>r.visits).filter(r=>r.npc===id&&r.outcome==='bought');

test('trade windows come from the keepers schedule: noon-containing windows keep the noon time, others use their start',()=>{
 const f=fixture(),state=f.d.get('state');
 assert.ok(currentShops(f.e,state).some(s=>s.keeper===seller),'the keeper runs a registered shop');
 // 早窗 [480,720) 不含正午 → 起点 480；午饭不接待；晚窗 [780,1080) 起点 780。
 assert.deepEqual(tradeWindowStarts(f.e,state,0),[480,780]);
 assert.deepEqual(tradeWindowStarts(f.e,state,1),[DAY+480,DAY+780],'same schedule every day');
 // 客流结算时刻 = 每日正午 ∪ 窗口起点，升序；区间半开 (before, after]。
 assert.deepEqual(customerFlowTimes(f.e,state,-1,DAY-1),[480,720,780]);
 assert.deepEqual(customerFlowTimes(f.e,state,480,780),[720,780]);
 // 全天营业的店（含正午）只有正午一个时刻，与旧口径一致。
 const allDay=fixture({sellerSchedule:[at(0,1440,['trade'],'营业')]});
 assert.deepEqual(tradeWindowStarts(allDay.e,allDay.d.get('state'),0),[720]);
});

test('the shop clock stops at every window start while residents are about',()=>{
 const f=fixture();
 assert.equal(nextShopMinute(f.e,f.d,0),480);
 assert.equal(nextShopMinute(f.e,f.d,480),720);
 assert.equal(nextShopMinute(f.e,f.d,720),780);
 assert.equal(nextShopMinute(f.e,f.d,780),DAY,'after the evening window the next stop is the midnight grid point');
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
 const f=fixture({sellerSchedule:[at(0,1440)],residentSale:true});
 const coinsC=f.d.get('state','npcs',C,'coins'),coinsA=f.d.get('state','npcs',A,'coins');
 f.d.set(['state','minute'],720);
 advanceCustomerFlow(f.d,f.e,719,720);
 const bought=boughtBy(f,A);
 assert.ok(bought.length,'the poor-in-bread household buys from the resident');
 const record=flowRecords(f).find(r=>r.visits.some(v=>v.npc===A&&v.outcome==='bought'));
 assert.equal(record.shop,`trader_${C}`,'the seller is a resident seller, not a registered shop');
 assert.equal(record.keeper,C);
 // 精确对账：C 的钱增加 = A 付出的货款；A 付出 = 货款 + 路费；商税另走税账（卖家应税时从 C 划出）。
 const paid=bought.reduce((n,r)=>n+r.paid,0),fares=bought.reduce((n,r)=>n+(r.travel?.paid??0),0);
 assert.equal(coinsA-f.d.get('state','npcs',A,'coins'),paid+fares);
 assert.ok(f.d.get('state','npcs',C,'coins')>=coinsC+paid-bought.reduce((n,r)=>n+(r.tax??0),0));
 assert.ok(f.e.quantity(f.d,A,item)>0&&f.e.quantity(f.d,C,item)<60);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
 // 居民卖方不产生经营回执与店铺记录。
 assert.equal(Object.values(f.d.get('state','records')).filter(r=>r.category==='business_receipt'&&r.businesses?.includes(record.shop)).length,0);
});

test('a resident never sells to the own household',()=>{
 const f=fixture({sellerSchedule:[at(0,1440)]});
 f.d.set(['state','npcs',B,'inventory'],{[item]:60});
 f.d.set(['state','minute'],720);
 advanceCustomerFlow(f.d,f.e,719,720);
 assert.ok(!flowRecords(f).some(r=>r.shop===`trader_${B}`),'the housemate bread is the household bread, not a sale');
});
