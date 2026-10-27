import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {dedicatedCoinAccount} from '../server-plugin/money.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json',import.meta.url),'utf8'));
const landlord='npc_hw_linsui',worker='npc_hw_ayan',customer='npc_hw_luowei',place='bld_hw_qingdeng';
function fixture({coins=200,inventory={},deposit=0,credit=false}={}){
    const w=structuredClone(world),engine=new WorldEngine(w);
    let document=engine.initialFromLegacy(seed,'business-contracts');
    document.state.minute=600;document.state.location=place;document.state.player.coins=coins;document.state.inventory=inventory;
    document.state.npcs=Object.fromEntries([landlord,worker,customer].map(id=>[id,{...document.state.npcs[id],coins:100,trust:20,location:place,activity:id===worker?'休息':'营业',status:'正常',inventory:id===landlord?{item_bread:{quantity:30}}:{},goals:{},memoryStream:[]}]));
    for(const npc of w.npcs.filter(n=>[landlord,worker,customer].includes(n.id))){
        npc.schedule={default:[{start:0,end:1440,location:place,activity:npc.id===worker?'休息':'营业',services:npc.id===worker?[]:['trade']}]};
        npc.creditPolicy={limitCopper:100,maximumMinutes:1440,minimumTrust:0};
    }
    const inputs=[],results=[];
    const act=async(tool,args,eventId)=>{const input={tool,args,eventId};const result=await engine.reduce(document,input);document=applyPatches(document,result.patches);inputs.push(input);results.push(result.result);return result.result;};
    return {engine,w,act,inputs,results,get doc(){return document;},set doc(value){document=value;},
        // D05 §5.1: operating cash must be transferred into its own counter;
        // retain20 personal copper for the separately examined ordinary trades.
        lease:async()=>{const leased=await act('world_trade',{operation:'lease',seller:landlord,consent:true,days:1,deposit,...(credit?{payment:'credit',creditMinutes:120}:{})},'lease');const capital=Math.max(0,document.state.player.coins-20);await act('world_act',{action:'business:open_counter',slots:{business:leased.business,coins:capital}},'counter-open');return {...leased,capital};},
        manage:(operation,business,eventId=operation)=>act('world_settlement',{operation:`business_${operation}`,business},eventId)};
}
// F010: shopkeepers now pay the source settlement's treasury for their restock (local production and route arrivals), so conservation counts the treasuries too.
const coinTotal=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((sum,n)=>sum+n.coins,0)+Object.values(c.state.settlements??{}).reduce((sum,s)=>sum+(s.treasury??0),0)+Object.values(c.state.records).filter(r=>r.category==='contract'&&r.version===1).reduce((sum,r)=>sum+r.escrow,0)+Object.values(c.state.records).filter(r=>r.category==='money_account').reduce((sum,r)=>sum+r.coins,0);
const amount=(c,actor,item)=>{const row=actor==='player'?c.state.inventory[item]:c.state.npcs[actor].inventory[item];return typeof row==='number'?row:row?.quantity??0;};
const procurement=(f,business,eventId='procure',quantity=2)=>f.act('world_trade',{operation:'procure',business,seller:landlord,consent:true,item:'item_bread',quantity},eventId);
const fulfill=(f,business,contract,eventId='fulfill')=>f.act('world_trade',{operation:'fulfill',business,seller:landlord,contract},eventId);

test('真实工具链租铺、托管进货、到货开店、付盘点报酬、顾客买货，亏损与每笔钱物可追溯并重放',async()=>{
    const f=fixture({deposit:3}),initial=structuredClone(f.doc),total=coinTotal(f.doc);
    const lease=await f.lease(),shop=lease.business;
    await assert.rejects(f.manage('open',shop),/现有库存/);
    const order=await procurement(f,shop);
    assert.equal(amount(f.doc,'player','item_bread'),0);assert.equal(amount(f.doc,landlord,'item_bread'),30);
    assert.equal(f.doc.state.records[order.contract].status,'待履行');assert.equal(f.doc.state.records[order.contract].escrow,order.cost);
    await fulfill(f,shop,order.contract);
    assert.equal(amount(f.doc,'player','item_bread'),2);assert.equal(amount(f.doc,landlord,'item_bread'),28);
    assert.equal(f.doc.state.records[order.contract].status,'已完成');assert.equal(f.doc.state.records[order.contract].paid,order.cost);
    await f.manage('open',shop);
    const hire=await f.act('world_trade',{operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:2},'hire');
    assert.equal(f.doc.state.npcs[worker].coins,100);assert.equal(f.doc.state.records[hire.contract].status,'待履行');
    const worked=await f.act('world_trade',{operation:'fulfill',business:shop,seller:worker,contract:hire.contract},'work');
    assert.equal(worked.audit.finish-worked.audit.start,30);assert.equal(worked.audit.quantity,2);
    assert.equal(f.doc.state.npcs[worker].coins,100+hire.cost);assert.equal(f.doc.state.records[hire.contract].escrow,0);
    const sold=await f.act('world_trade',{operation:'sell',business:shop,seller:'player',buyer:customer,consent:true,item:'item_bread',quantity:1},'sale');
    assert.equal(amount(f.doc,customer,'item_bread'),1);assert.equal(amount(f.doc,'player','item_bread'),1);
    assert.equal(f.doc.state.npcs[customer].coins,100-sold.cost);
    const beforeWait=f.doc.state.player.coins;await f.act('world_time',{minutes:30,activity:'工作'},'wait');assert.equal(f.doc.state.player.coins,beforeWait);
    await f.manage('close',shop,'close');assert.equal(coinTotal(f.doc),total);
    const report=await f.manage('report',shop,'report');
    // D05 §5.1: the cash report covers the counter, including real capital;
    // initial rent/deposit were personally funded before counter opening.
    assert.equal(report.cash.reconciled,true);assert.equal(report.cash.net,lease.capital+sold.cost-order.cost-hire.cost);
    assert.deepEqual(report.cash.sources.map(r=>r.source),['lease','counter-open','procure','hire','sale']);
    assert.equal(report.cash.closing,dedicatedCoinAccount(f.doc.state,'player','counter').coins);
    assert.equal(report.goods.item_bread.reconciled,true);assert.equal(report.goods.item_bread.closing,1);
    assert.deepEqual(report.goods.item_bread.sources.map(r=>[r.source,r.quantity]),[['fulfill',2],['sale',-1]]);
    assert.equal(report.profit.revenue,sold.cost);assert.equal(report.profit.stockCostOfSales,order.cost/2);
    assert.equal(report.profit.net,sold.cost-order.cost/2-lease.cost-hire.cost);assert.ok(report.profit.net<0);
    assert.equal(report.escrow.length,0);assert.equal(report.debts.length,0);
    for(const receipt of Object.values(f.doc.state.records).filter(r=>r.category==='business_receipt')){
        assert.ok(f.inputs.some(i=>i.eventId===receipt.source));
        if(receipt.source==='sale')assert.deepEqual(receipt.counterparties,[{actor:customer,coins:-sold.cost,goods:{item_bread:1}}]);
    }
    // 存档重放随事件带回原回执（storage同法）；U7后灵智成长按回执版本号重放。
    let replay=initial;for(const [i,input] of f.inputs.entries()){const step=await f.engine.reduce(replay,input,{replay:true,result:f.results[i]});replay=applyPatches(replay,step.patches);}assert.deepEqual(replay,f.doc);
    // A stopped period retains its closing balances when later personal trades occur.
    await f.act('world_trade',{seller:landlord,item:'item_bread',quantity:1},'personal-after');
    const later=await f.manage('report',shop,'report-after');
    for(const key of ['cash','goods','profit','escrow','debts','period','contracts','status'])assert.deepEqual(later[key],report[key]);
});

test('租金复用原赊账和还款去重，押金仅抵真实欠款，偿还不能二次扣费',async()=>{
    const f=fixture({deposit:2,credit:true}),lease=await f.lease(),shop=lease.business,total=coinTotal(f.doc);
    const paid=await f.act('world_trade',{operation:'pay',business:shop,contract:lease.contract,seller:landlord},'pay');
    assert.equal(paid.cost,lease.cost);assert.equal(f.doc.state.records[lease.debt].status,'已还清');assert.equal(f.doc.state.records[lease.contract].paid,lease.cost);
    const before=structuredClone(f.doc);
    await assert.rejects(f.act('world_trade',{operation:'pay',business:shop,contract:lease.contract,seller:landlord},'pay-again'),/已经还清/);
    assert.deepEqual(f.doc,before);assert.equal(coinTotal(f.doc),total);
    await f.manage('close',shop);assert.equal(f.doc.state.records[lease.contract].escrow,0);
    const report=await f.manage('report',shop);assert.equal(report.cash.reconciled,true);assert.equal(report.debts[0].amount,0);
});

test('采购缺货不算到货，雇工缺库存或未付报酬不完成，到期退款只发生一次',async()=>{
    const f=fixture(),lease=await f.lease(),shop=lease.business,total=coinTotal(f.doc),order=await procurement(f,shop);
    f.doc=applyPatches(f.doc,[{op:'set',path:['state','npcs',landlord,'inventory','item_bread','quantity'],value:0}]);resyncBooks(f.engine,f.doc);
    await assert.rejects(fulfill(f,shop,order.contract),/库存不足/);assert.equal(amount(f.doc,'player','item_bread'),0);
    assert.equal(f.doc.state.records[order.contract].status,'待履行');
    await assert.rejects(f.act('world_trade',{operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',item:'item_bread',quantity:1},'no-stock'),/没有已到货库存/);
    await f.act('world_time',{minutes:1440},'expiry');
    assert.equal(f.doc.state.records[order.contract].status,'已取消');assert.equal(f.doc.state.records[order.contract].escrow,0);
    assert.equal(f.doc.state.records[shop].status,'停业');assert.equal(coinTotal(f.doc),total);
    const cash=f.doc.state.player.coins;await f.act('world_time',{minutes:1440},'again');assert.equal(f.doc.state.player.coins,cash);
    const report=await f.manage('report',shop);assert.ok(Object.values(report.goods).every(row=>row.closing>=0&&row.reconciled));assert.equal(report.cash.reconciled,true);
    const poor=fixture({coins:8,inventory:{item_bread:{quantity:1}}}),rent=await poor.lease();
    await assert.rejects(poor.act('world_trade',{operation:'hire',business:rent.business,seller:worker,consent:true,task:'stocktake',minutes:240,quantity:1,item:'item_bread'},'no-wages'),/资金不足/);
});

test('租金违约关闭营业并抵押金，保留未还原债与库存，破产不印钱或负库存',async()=>{
    const f=fixture({coins:0,inventory:{item_bread:{quantity:2}},credit:true}),lease=await f.lease(),shop=lease.business;
    await f.manage('open',shop);await f.manage('bankrupt',shop);
    assert.equal(f.doc.state.records[shop].status,'破产');assert.equal(amount(f.doc,'player','item_bread'),2);
    assert.equal(f.doc.state.records[lease.debt].paid,0);assert.equal(f.doc.state.player.coins,0);
    await assert.rejects(f.act('world_trade',{operation:'sell',business:shop,seller:'player',buyer:customer,consent:true,item:'item_bread',quantity:1},'bankrupt-sale'),/破产/);
    const report=await f.manage('report',shop);assert.equal(report.cash.reconciled,true);assert.equal(report.debts[0].amount,lease.cost);assert.equal(report.goods.item_bread.closing,2);
    const overdue=fixture({coins:2,deposit:2,inventory:{item_bread:{quantity:1}},credit:true}),owed=await overdue.lease();
    await overdue.manage('open',owed.business);await overdue.act('world_time',{minutes:120},'overdue');
    assert.equal(overdue.doc.state.records[owed.contract].status,'违约');assert.equal(overdue.doc.state.records[owed.contract].breaches[0].reason,'租金未按期偿还');
    assert.equal(overdue.doc.state.records[owed.debt].paid,2);assert.equal(overdue.doc.state.records[owed.debt].status,'逾期');
    assert.equal(overdue.doc.state.records[owed.business].status,'停业');assert.equal(amount(overdue.doc,'player','item_bread'),1);
    assert.equal((await overdue.manage('report',owed.business)).cash.reconciled,true);
});

test('合法出租与明确同意、实际清醒在场、整段雇工空档和义务冲突均保留',async()=>{
    const f=fixture({inventory:{item_bread:{quantity:2}}});
    await assert.rejects(f.act('world_trade',{operation:'lease',seller:landlord},'no-consent'),/明确同意/);
    await assert.rejects(f.act('world_trade',{operation:'lease',seller:worker,consent:true},'wrong-owner'),/不提供|没有.*合法/);
    const lease=await f.lease(),shop=lease.business;
    await assert.rejects(f.act('world_trade',{operation:'hire',business:shop,seller:worker,task:'stocktake',item:'item_bread',quantity:1},'force-hire'),/明确同意/);
    const npc=f.w.npcs.find(n=>n.id===worker);
    npc.schedule.default=[{start:0,end:620,location:place,activity:'休息',services:[]},{start:620,end:1440,location:place,activity:'原有工作',services:['trade']}];
    const args={operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:1};
    await assert.rejects(f.act('world_trade',args,'busy-hire'),/完整空档/);
    npc.schedule.default=[{start:0,end:1440,location:place,activity:'休息',services:[]}];
    await f.act('world_promise',{promisor:worker,promisee:'player',type:'会面',content:'原来的会面',minutes:60},'meeting');
    await assert.rejects(f.act('world_trade',args,'overlap'),/冲突/);
    await f.act('world_promise',{operation:'cancel',obligation:'obl_meeting',actor:'player'},'cancel-meeting');
    f.doc=applyPatches(f.doc,[{op:'set',path:['state','npcs',worker,'status'],value:'昏迷'}]);
    await assert.rejects(f.act('world_trade',args,'unconscious'),/在场且清醒/);
});

test('NPC 顾客只花已有钱且一天消费有限；卖空、赊购和重复交货无副作用',async()=>{
    const f=fixture({inventory:{item_bread:{quantity:30}}});
    // S5-02: bread baseline2 * scarcity floor.5 =1 per portion. Native
    // daily spending is one quarter of actual opening cash:40/4=10.
    // The original ten-portion purchase exhausts it; the repeat must refuse.
    const prepared=applyIntentSetup(f.engine,f.doc,{facts:[{path:['state','npcs',customer,'coins'],value:40}]});assert.deepEqual(prepared.setupUnmet,[]);f.doc=prepared.document;
    const lease=await f.lease(),shop=lease.business;await f.manage('open',shop);
    const sell={operation:'sell',business:shop,seller:'player',buyer:customer,consent:true,item:'item_bread',quantity:10};
    const first=await f.act('world_trade',sell,'first-sale');assert.equal(first.cost,10);const before=structuredClone(f.doc);
    await assert.rejects(f.act('world_trade',sell,'excess-sale'),/当日店铺消费上限/);assert.deepEqual(f.doc,before);
    await assert.rejects(f.act('world_trade',{...sell,quantity:1,payment:'credit'},'credit-sale'),/现有现金/);
    await assert.rejects(f.act('world_trade',{...sell,quantity:100},'sold-out'),/现有库存不足/);
    const order=await procurement(f,shop,'order-once');await fulfill(f,shop,order.contract,'deliver-once');const once=structuredClone(f.doc);
    await assert.rejects(fulfill(f,shop,order.contract,'duplicate-delivery'),/不能重复/);assert.deepEqual(f.doc,once);
    const second=await procurement(f,shop,'order-cancel');
    await f.act('world_trade',{operation:'cancel',business:shop,contract:second.contract,seller:landlord},'cancel-order');const cancelled=structuredClone(f.doc);
    await assert.rejects(f.act('world_trade',{operation:'cancel',business:shop,contract:second.contract,seller:landlord},'cancel-again'),/不能重复/);assert.deepEqual(f.doc,cancelled);
});

test('已托管雇工在履约前失去库存不能完成；营业期其他工具花费和实物都进入同一来源账',async()=>{
    // S5-02: two native perishable stews *35 cover the player's60/day
    // satiety, leaving the examined bread available for the real sale.
    const f=fixture({inventory:{item_bread:{quantity:1},item_mutton_turnip_stew:{quantity:2}}}),lease=await f.lease(),shop=lease.business;
    const hire=await f.act('world_trade',{operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',item:'item_bread',quantity:1},'hire-pending');
    await f.act('world_trade',{buyer:customer,seller:'player',item:'item_bread',quantity:1},'ordinary-sale');
    await assert.rejects(f.act('world_trade',{operation:'fulfill',business:shop,contract:hire.contract,seller:worker},'missing-goods'),/尚未到货或已不足/);
    assert.equal(f.doc.state.records[hire.contract].status,'待履行');assert.equal(f.doc.state.npcs[worker].coins,100);
    await f.act('world_trade',{seller:landlord,item:'item_bread',quantity:2},'ordinary-buy');
    const report=await f.manage('report',shop);
    assert.equal(report.cash.reconciled,true);assert.equal(report.goods.item_bread.reconciled,true);
    assert.deepEqual(report.goods.item_bread.sources.map(r=>r.source),['ordinary-sale','ordinary-buy']);
    // Personal purchases still explain the shared goods, but never the counter.
    assert.ok(!report.cash.sources.some(r=>r.source==='ordinary-buy'));assert.equal(report.profit.revenue,0);
    await assert.rejects(f.manage('bankrupt',shop),/足以偿债/);
});

test('现有公共工具枚举公开全部经营操作，无新增公共工具',()=>{
    const definitions=toolDefinitions(),trade=definitions.find(r=>r.function.name==='world_trade').function.parameters;
    const settlement=definitions.find(r=>r.function.name==='world_settlement').function.parameters;
    for(const op of ['lease','procure','hire','fulfill','sell','pay','cancel'])assert.ok(trade.properties.operation.enum.includes(op));
    for(const op of ['business_open','business_close','business_bankrupt','business_report'])assert.ok(settlement.properties.operation.enum.includes(op));
    assert.equal(definitions.length,27);assert.ok(trade.properties.consent);assert.ok(settlement.properties.business);
});

test('恰在合同截止分钟完成雇工仍只支付一次，未到截止的履约窗口不能越过租期',async()=>{
    const f=fixture({inventory:{item_bread:{quantity:1}}}),lease=await f.lease(),shop=lease.business,total=coinTotal(f.doc);
    const hired=await f.act('world_trade',{operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:1,deadline:f.doc.state.minute+31},'hire-boundary');
    await f.act('world_time',{minutes:1},'minute');
    await f.act('world_trade',{operation:'fulfill',business:shop,seller:worker,contract:hired.contract},'work-at-deadline');
    assert.equal(f.doc.state.records[hired.contract].status,'已完成');assert.equal(f.doc.state.npcs[worker].coins,100+hired.cost);assert.equal(coinTotal(f.doc),total);
    assert.equal((await f.manage('report',shop)).cash.reconciled,true);
    const waiting=await f.act('world_trade',{operation:'hire',business:shop,seller:worker,consent:true,task:'stocktake',minutes:30,item:'item_bread',quantity:1},'hire-late');
    await f.act('world_time',{minutes:f.doc.state.records[lease.contract].deadline-f.doc.state.minute-20},'near-lease-end');
    await assert.rejects(f.act('world_trade',{operation:'fulfill',business:shop,seller:worker,contract:waiting.contract},'work-beyond-lease'),/租期不足/);
});

test('正式世界的新角色沿真实路线采购和携货雇工，使用原作息空档返回铺面成交',async()=>{
    const engine=new WorldEngine(world);let c=engine.createCharacter(seed,{name:'经营测试旅人'},'business-real');
    const act=async(tool,args,eventId)=>{const step=await engine.reduce(c,{tool,args,eventId});c=applyPatches(c,step.patches);return step.result;};
    await act('world_move',{destination:place},'real-enter');
    const lease=await act('world_trade',{operation:'lease',seller:landlord,consent:true,days:1},'real-lease');
    await act('world_act',{action:'business:open_counter',slots:{business:lease.business,coins:Math.max(0,c.state.player.coins-20)}},'real-counter');
    const order=await act('world_trade',{operation:'procure',business:lease.business,seller:landlord,consent:true,item:'item_bread',quantity:2},'real-procure');
    await act('world_trade',{operation:'fulfill',business:lease.business,seller:landlord,contract:order.contract},'real-deliver');
    await act('world_settlement',{operation:'business_open',business:lease.business},'real-open');
    const travelled=await act('world_move',{destination:'bld_hw_herbs'},'real-carry');assert.ok(travelled.minutes>0);
    const counterBefore=dedicatedCoinAccount(c.state,'player','counter').coins,purseBefore=c.state.player.coins;
    const hire=await act('world_trade',{operation:'hire',business:lease.business,seller:'npc_hw_fanrong',consent:true,task:'stocktake',item:'item_bread',quantity:2,minutes:30},'real-hire');
    // D05 §5.1 / D15 §15.1.1: cash stays where it is. Off-site hiring is an
    // actual personal advance; it cannot teleport money from the inn counter.
    assert.equal(c.state.records[hire.contract].fundingAccount,'player|coin_river|purse');
    assert.equal(dedicatedCoinAccount(c.state,'player','counter').coins,counterBefore);assert.equal(c.state.player.coins,purseBefore-hire.cost);
    const worked=await act('world_trade',{operation:'fulfill',business:lease.business,seller:'npc_hw_fanrong',contract:hire.contract},'real-work');
    assert.equal(worked.audit.quantity,2);assert.equal(worked.audit.finish-worked.audit.start,30);
    await act('world_move',{destination:place},'real-return');
    await act('world_time',{until:{dayOffset:0,hour:18,minute:20}},'real-customer-arrive');
    const beforeCustomerCoins=c.state.npcs[customer].coins,beforeCustomerStock=amount(c,customer,'item_bread');
    const sold=await act('world_trade',{operation:'sell',business:lease.business,seller:'player',buyer:customer,consent:true,item:'item_bread',quantity:1},'real-sale');
    assert.equal(c.state.npcs[customer].coins,beforeCustomerCoins-sold.cost);assert.equal(amount(c,customer,'item_bread'),beforeCustomerStock+1);
    const report=await act('world_settlement',{operation:'business_report',business:lease.business},'real-report');
    assert.equal(report.cash.reconciled,true);assert.ok(Object.values(report.goods).every(r=>r.reconciled));assert.ok(report.profit.net<0);
    assert.equal(c.state.records[hire.contract].location,'bld_hw_herbs');
});
