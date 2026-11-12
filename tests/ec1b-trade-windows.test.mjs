// EC-1b：客流按营业窗口结算（不再只在正午采样一次）、时钟在窗口起点停下、居民卖方（有可售余量的居民）与店铺同走 customer_flow 与 settleSale。
// 夹具沿用 ec1a-household-pool.test.mjs / s5-law-household-meals.test.mjs 的洛薇（A）与店主林穗；只用真实动作（客流、时钟边界），不加测试专用接口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceCustomerFlow,flowTimesOfDay,customerFlowTimes,settleCustomerFlow,customerWindows} from '../server-plugin/business.mjs';
import {currentShops,nextShopMinute} from '../server-plugin/shop.mjs';
import {residentSellers,SALE_ORDER} from '../server-plugin/market-seller.mjs';
import {actionCostRule} from '../server-plugin/action-costs.mjs';
import {marketQuote} from '../server-plugin/market.mjs';
import {householdBudget} from '../server-plugin/household-budget.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',C='npc_hw_shendu',D='npc_hw_xuling',seller='npc_hw_linsui',item='item_bread',home='bld_hw_qingdeng',DAY=1440;
const at=(start,end,services=[],activity='休息')=>({start,end,location:home,activity,services});
// 店主林穗：早窗 480–720、午饭 720–780（不接待）、晚窗 780–1080（与诊断里 loc_bs 砚者同形）。
// 店主只在 720 起营业（货架清空时只剩居民卖方可买）；用于居民卖方用例：有营业窗口才有客流结算时刻。
const LATE=[at(0,720),at(720,1440,['trade'],'营业')];
const SELLER_DAY=[at(0,480),at(480,720,['trade'],'营业'),at(720,780,[],'午饭'),at(780,1080,['trade'],'营业'),at(1080,1440)];
function fixture({sellerSchedule=SELLER_DAY,residentSale=false,housemateBread=0,emptyShop=false,late=[],playerShop=false,breadPrice=null,keepSubsistence=false}={}){
 const w=structuredClone(world);
 if(breadPrice)w.items.find(i=>i.id===item).basePrice=breadPrice;// 把面包价抬到买不起，使“只看不买”的场景确定
 if(!keepSubsistence)delete w.rules.householdSubsistence;
 for(const n of w.npcs){delete n.tier;delete n.schedule;}
 w.households=[{id:'win-a',members:[A,B],settlement:'loc_hw',homeLocation:home},{id:'win-c',members:[C],settlement:'loc_hw',homeLocation:home},{id:'win-seller',members:[seller],settlement:'loc_hw',homeLocation:home}];
 for(const l of late)w.households.push({id:`win-${l.id}`,members:[l.id],settlement:'loc_hw',homeLocation:home});
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?2.5:0;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];w.marketRules.customerChoice.noisePermille=0;
 const awake={default:[at(0,360,[],'睡眠'),at(360,1440,[],'闲居')]};// 居民真实起居：睡到 6 点，之后醒着
 for(const n of w.npcs.filter(n=>n.id===A)){n.tier='full';n.schedule=awake;}
 for(const n of w.npcs.filter(n=>[B,C].includes(n.id))){n.schedule=awake;}
 for(const n of w.npcs.filter(n=>n.id===seller)){n.tier='full';n.schedule={default:sellerSchedule};}
 // late 的一项带 post/leave：0–leave 在别处（post）值守教书（有 teach 服务，不是顾客段），leave 起回家闲居（要走路）；否则睡到 wake 再闲居。
 for(const l of late)for(const n of w.npcs.filter(n=>n.id===l.id)){n.tier='full';n.schedule={default:l.post?[{start:0,end:l.leave,location:l.post,activity:'教书',services:['teach']},at(l.leave,1440,[],'闲居')]:[at(0,l.wake,[],'睡眠'),at(l.wake,1440,[],'闲居')]};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'ec1b-windows');
 doc.state.minute=0;doc.state.location=home;delete doc.state.records['agriculture:loc_hw'];
 doc.state.npcs=Object.fromEntries([A,B,C,...late.map(l=>l.id),seller].map(id=>[id,{...doc.state.npcs[id],coins:id===A?1000:late.some(l=>l.id===id)?(late.find(l=>l.id===id).coins??1000):id===C?5:0,inventory:{},location:home,status:'正常',activity:'休息'}]));
doc.state.npcs[seller].inventory=emptyShop?{}:{[item]:100};
 if(residentSale)doc.state.npcs[C].inventory={[item]:60};
 // 背包要在 openLedger 之前给：账本开账时才按背包建物品账，开账后再写 inventory 读不到（物理账为准）。
 if(housemateBread)doc.state.npcs[B].inventory={[item]:housemateBread};
 for(const l of late)if(l.bread)doc.state.npcs[l.id].inventory={[item]:l.bread};
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:4,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 if(playerShop){doc.state.records.biz_player_stall={id:'biz_player_stall',category:'business',owner:'player',location:home,status:'营业',suspended:false,openedAt:600};doc.state.visits={...doc.state.visits,places:{...doc.state.visits?.places,[home]:{arrivedAt:600}}};doc.state.location=home;}
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

test('a resident never sells to the own household: the housemate bread is the household own larder (EC-1a pool), no sale arises',()=>{
 // 论证（EC-1a 共用口粮池）：同户成员的包裹并入同一份户预算，一件食物要么被户内口粮吃掉（预留，可售量为 0），要么有余量（户内缺口为 0）；
 // 引擎里没有单餐额度生效的夹具时，“同户有可售余量而整户仍有采购缺口”不会同时出现，所以顾客与同户卖方之间没有“要买”的需求可言；
 // 同户的人也不会被登记成顾客（serve 里 keeperHome 再把这一点写成硬规则）。异户邻居的买卖是上一条用例（C 卖给 A）。
 // 本用例核对这条链：B 确是有效的居民卖方（有可售余量、在卖方窗口内）；A 的户预算把 B 的面包算作自家口粮，采购缺口为 0；于是同户内没有任何成交记录。
 const f=fixture({sellerSchedule:LATE,emptyShop:true,housemateBread:600});// 面包要在 openLedger 之前给
 assert.ok(residentSellers(f.d,f.e,720).some(s=>s.keeper===B&&s.goods.includes(item)),'precondition: the housemate is a valid resident seller with a saleable surplus');
 assert.equal(Number(householdBudget(f.d,f.e,A).resources.procurementShortfall.satiety),0,'the housemate bread is the household own food: no procurement need');
 f.d.set(['state','minute'],720);
 advanceCustomerFlow(f.d,f.e,719,720);
 assert.ok(!flowRecords(f).some(r=>r.shop===`trader_${B}`),'the housemate bread is the household bread, not a sale');
 assert.equal(boughtBy(f,A).length,0);
});

test('settleSale keeps each call site its original ledger order: retail, counter and wholesale',()=>{
 // 合并只去掉重复代码，不改账序：店铺客流 付款→转物→税→财务→成交；玩家店柜台与手动售出 付款→税→转物→财务→成交；持货人出让与在场报价进货 转物→付款→成交→税→财务。
 assert.deepEqual(SALE_ORDER.retail,['pay','transfer','tax','finance','deal']);
 assert.deepEqual(SALE_ORDER.counter,['pay','tax','transfer','finance','deal']);
 assert.deepEqual(SALE_ORDER.wholesale,['transfer','pay','deal','tax','finance']);
});

test('each customer makes at most one trip per shop per day, even when later customers add later flow times',()=>{
 // 第二位顾客（徐凌）睡到 800 才醒：晚窗 [780,1080) 与他醒着段的最早交集是 800，于是当天有两个结算时刻 480 与 800；洛薇在 800 仍醒着，但上午已来过，不再来第二趟。
 const f=fixture({late:[{id:D,wake:800}]}),state=f.d.get('state');
 assert.deepEqual(flowTimesOfDay(f.e,state,0),[480,800]);
 advanceCustomerFlow(f.d,f.e,-1,DAY);
 const shopId=currentShops(f.e,f.d.get('state')).find(s=>s.keeper===seller).id;
 const allTrips=actor=>Object.values(f.d.get('state','records')).filter(r=>r.category==='market_trip'&&r.actor===actor);
 const trips=actor=>allTrips(actor).filter(r=>r.id.startsWith(`market_trip:${shopId}:`));
 assert.equal(trips(A).length,1,'the early customer came once');
 // 800 时除登记店外还有第二家店开着：洛薇上午买了 8 个面包、户留存只有 3 个，余量成了居民卖方（诊断 trade-windows-7：openShops 含 trader_npc_hw_luowei）。
 // 徐凌的一次需求（4 个面包）在先服务的那家店一次买清，所以他当天只来一趟，可能是登记店也可能是居民卖方；“每人每店每天至多一趟”按（人，店）对核对。
 assert.equal(allTrips(D).length,1,'the late customer came once in total (one purchase meets his need), at his own flow time');
 assert.equal(allTrips(D)[0].departAt>=800,true);
 for(const actor of [A,D]){const perShop={};for(const r of allTrips(actor))perShop[r.id.split(':')[1]]=(perShop[r.id.split(':')[1]]??0)+1;for(const [s,n] of Object.entries(perShop))assert.equal(n,1,`${actor} at most one trip to ${s}`);}
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a customer who looked and bought nothing is not evaluated again the same day at the same shop',()=>{
 // 徐凌（D）800 起床、只有 1 铜，面包被抬到 100 铜：800 到店评估，必然买不起，只看不买（记一条 looked）；陈白（E）1000 起床是第三个结算时刻，此时 D 仍醒着，但今天已来过，不再评估。
 const E='npc_hw_chenbai';
 const f=fixture({late:[{id:D,wake:800,coins:1},{id:E,wake:1000}],breadPrice:100}),state=f.d.get('state');
 // 前置（从引擎读）：D 只有 1 铜且缺口大于 0（有需求）；面包一件的报价大于 1 铜（买不起）——所以结果必然是只看不买。
 assert.equal(f.d.get('state','npcs',D,'coins'),1);
 assert.ok(Number(householdBudget(f.d,f.e,D).resources.procurementShortfall.satiety)>0,'precondition: D has a need');
 assert.ok(marketQuote(f.d,f.e,{item,location:home,seller,buyer:D,quantity:1,business:{keeper:seller,markup:1},minute:800}).totalCoins>1,'precondition: one bread costs more than D can pay');
 assert.deepEqual(flowTimesOfDay(f.e,state,0),[480,800,1000]);
 advanceCustomerFlow(f.d,f.e,-1,DAY);
 // 800 时洛薇（上午买了 8 个面包，留存只有 5 个）的居民卖方店也开着（诊断 trade-windows-8：openShops 含 trader_npc_hw_luowei），D 在两家店各看一次；
 // “同店同日不再评估”按（人，店）对核对：登记店恰一条 looked，每家店至多一条。
 const shopId=currentShops(f.e,f.d.get('state')).find(s=>s.keeper===seller).id;
 const visitsAt=(s,actor)=>flowRecords(f).filter(r=>r.day===0&&r.shop===s).flatMap(r=>r.visits.filter(v=>v.npc===actor));
 assert.deepEqual(visitsAt(shopId,D),[{npc:D,outcome:'looked'}],'D is evaluated exactly once that day at the registered shop, looked and bought nothing');
 for(const s of new Set(flowRecords(f).map(r=>r.shop)))assert.ok(visitsAt(s,D).length<=1,`D is evaluated at most once at ${s}`);
 assert.equal(flowRecords(f).flatMap(r=>r.visits).filter(v=>v.npc===D&&v.outcome==='bought').length,0,'D bought nothing anywhere');
 const at1000=flowRecords(f).find(r=>r.minute===1000&&r.shop===shopId);
 assert.ok(at1000&&at1000.visits.some(v=>v.npc===E&&v.outcome==='bought'),'the third customer is served at 1000');
 assert.ok(!at1000.visits.some(v=>v.npc===D),'D is awake at 1000 but has already been evaluated today');
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('flow times do not change when a purchase writes a market_trip: one long wait equals step-by-step advances',()=>{
 // 成交会写 market_trip，scheduleAt 读它改写顾客当时的槽位；时刻集合按基础作息（baseScheduleAt）派生，不受当日新增出行影响，短步与长等待结果一致。
 const params={late:[{id:D,wake:800},{id:'npc_hw_chenbai',wake:1000}],keepSubsistence:true};// 生计规则开着：生计分段读 market_trip，时刻集合仍不得随成交漂移
 const whole=fixture(params);advanceCustomerFlow(whole.d,whole.e,-1,DAY);
 const stepped=fixture(params);
 for(let before=-1;before<DAY;){const after=Math.min(before+97,DAY);advanceCustomerFlow(stepped.d,stepped.e,before,after);before=after;}
 const records=f=>Object.fromEntries(Object.entries(f.d.get('state','records')).filter(([k])=>k.startsWith('customer_flow:')||k.startsWith('market_trip:')));
 assert.ok(Object.keys(records(whole)).length>=2,'precondition: purchases happened, so trips were written');
 assert.deepEqual(records(stepped),records(whole));
 assert.deepEqual(stepped.d.get('state','npcs'),whole.d.get('state','npcs'));
 assert.deepEqual(auditLedger(stepped.d.get('ledger')),[]);
});

test('a customer who comes off a post elsewhere is available from the minute he arrives, not from the minute he sets out',()=>{
 // 徐凌（D）0–600 在议事厅值守教书（有 teach 服务，不是顾客段），600 起回家闲居：作息一切到家的段他就出发，路程 m 分钟（engine.route，与 npc-schedule 的 scheduleTravel 同一条），赶路期间不是顾客。
 // 手推：店窗 [480,720)；他的顾客段起点是 600+m（到家），交集最早 = 600+m；洛薇（A）与其他居民 480 起就在家醒着，时刻 480。所以当天时刻 = [480, 600+m]，不是 [480, 600]。
 const post='bld_hw_council',leave=600,f=fixture({late:[{id:D,post,leave,wake:0}]}),state=f.d.get('state');
 const m=f.e.route(post,home,'walk',leave,f.d.get('randomSeed')).minutes;
 assert.ok(m>0&&leave+m<720,'precondition (engine): the walk home is a real trip and he is home before the shop window closes');
 assert.deepEqual(customerWindows(f.e,state,0).get(D).map(s=>s.start),[leave+m],'his customer window opens on arrival');
 assert.deepEqual(flowTimesOfDay(f.e,state,0),[480,leave+m]);
 // 先走完他出发之前的时刻 480（洛薇等按需买过，当日对本店已来过一趟）：否则下面 600 的结算会让洛薇成交，占住店主的柜台时间，
 // 他到店那一刻（600+m）店主还在服务洛薇，serve 里的店主义务检查（assertNpcObligationAction）会合法地拒掉他，测不出“到达后可被评估”本身。
 f.d.set(['state','minute'],480);advanceCustomerFlow(f.d,f.e,-1,leave-1);
 assert.ok(flowRecords(f).some(r=>r.minute===480&&r.visits.some(v=>v.npc===A)),'precondition: the early customer was already seen at 480');
 // 在路上不能被评估：600 他刚出发（scheduleTravel，位置空），结算后没有他的访问记录。
 f.d.set(['state','minute'],leave);
 f.d.set(['state','npcs',D],{...f.d.get('state','npcs',D),location:null,activity:'赶路',scheduleTravel:{from:post,to:home,depart:leave,arrive:leave+m,edges:[]}});
 settleCustomerFlow(f.d,f.e,leave);
 assert.ok(!flowRecords(f).some(r=>r.visits.some(v=>v.npc===D)),'a customer on the road is not evaluated');
 // 到达后可以：到家（位置回家、行程清除），在他的时刻结算，他被评估并买到面包（有 1000 铜、缺口大于 0）。
 const arrived={...f.d.get('state','npcs',D),location:home,activity:'闲居'};delete arrived.scheduleTravel;
 f.d.set(['state','npcs',D],arrived);f.d.set(['state','minute'],leave+m);
 settleCustomerFlow(f.d,f.e,leave+m);
 assert.ok(flowRecords(f).some(r=>r.minute===leave+m&&r.visits.some(v=>v.npc===D)),'after arriving he is evaluated');
 assert.equal(boughtBy(f,D).length,1,'and, having a need and money, he buys');
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a player shop window needs the player in the shop: it starts at the later of opening and arrival, and the first awake customer waits one service interval',()=>{
 const f=fixture({sellerSchedule:[at(0,1440)],playerShop:true}),state=f.d.get('state');
 const svc=actionCostRule(f.e,'trade.retail').timeMin;
 // 玩家 600 到铺：洛薇 360 起已醒着，要等一次服务时长后才上门；次日玩家仍在铺，洛薇 360 起床即上门（交集起点在顾客起床）。
 assert.deepEqual(flowTimesOfDay(f.e,state,0),[600+svc]);
 // 次日：洛薇 360 起床即上门；店主林穗（也是完整人物、全天醒着）在零点就醒着，等店主柜台一次服务时长后上门。
 assert.deepEqual(flowTimesOfDay(f.e,state,1),[DAY+svc,DAY+360].sort((a,b)=>a-b));
 // 玩家不在铺内：没有玩家店窗口，没有结算时刻。
 f.d.set(['state','location'],'bld_hw_council');const away=f.d.get('state');
 assert.deepEqual(flowTimesOfDay(f.e,away,0),[]);
 assert.deepEqual(flowTimesOfDay(f.e,away,1),[]);
});

test('a visit already recorded that day is found by day and shop, even when its minute is no longer a flow time',()=>{
 // 模拟“时刻集合变了”（玩家离铺再到铺、店停业等）：当日 530 有一条本店的旧访问记录（530 不在现在的时刻集合里），洛薇记在其中；
 // 之后 800 的结算不得再评估洛薇——去重按日+店取记录，不靠当前时刻集合反推键。
 const f=fixture({late:[{id:D,wake:800}]});
 const shopId=currentShops(f.e,f.d.get('state')).find(s=>s.keeper===seller).id;
 assert.deepEqual(flowTimesOfDay(f.e,f.d.get('state'),0),[480,800]);
 assert.ok(![480,800].includes(530));
 f.d.set(['state','records',`customer_flow:${shopId}:0:530`],{category:'customer_flow',shop:shopId,keeper:seller,day:0,minute:530,visits:[{npc:A,outcome:'looked'}]});
 advanceCustomerFlow(f.d,f.e,500,801);
 const at800=flowRecords(f).find(r=>r.minute===800);
 assert.ok(at800&&at800.visits.some(v=>v.npc===D),'the late customer is served at 800');
 assert.ok(!at800.visits.some(v=>v.npc===A),'A was already recorded that day and is not evaluated again');
 assert.equal(f.e.quantity(f.d,A,item),0);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
