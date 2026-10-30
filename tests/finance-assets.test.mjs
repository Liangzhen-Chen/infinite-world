import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cash,clerk,host,worker,post,DAY} from './helpers/finance.mjs';
import {operatingProfit,rentalNeed,recordFinanceSale} from '../server-plugin/finance-assets.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';
import {tradeTax,assessTradeTax,collectRouteTariffs} from '../server-plugin/finance-tax.mjs';
import {personHousehold,homeResidents,personBusiness} from '../server-plugin/entity-view.mjs';
import {npcSchedule} from '../server-plugin/npc-state.mjs';
import {groupAccountView,ensureGroupAccount} from '../server-plugin/group-account.mjs';
import {applyEffect} from '../server-plugin/effects.mjs';
import {toolDefinitions} from '../extension/tools.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
const mill='bld_hw_mill',recipe='recipe_wooden_pegs';
function workshopFixture(){
    const f=fixture({at:mill});f.doc.state.buildings[mill]={owner:'player',condition:100};
    // W8-E8: same 100 wood, stored rather than carried; wage/yield anchors unchanged.
    f.doc.state.records['premises_stock:player:'+mill]={category:'premises_stock',owner:'player',location:mill,inventory:{item_wood:f.doc.state.inventory.item_wood}};
    delete f.doc.state.inventory.item_wood;delete f.doc.state.inventory.item_oats;
    f.doc.state.inventory.item_whittling_knife={quantity:1,durability:80};return f;
}
// F083: a workshop shift is paid and produced only for the minutes the worker really spent at the workshop, so shifts are driven
// by the real clock (the worker's schedule walks them from home to the mill) rather than by a pinned position at 17:00.
const elapse=(f,to)=>f.act({minutes:to-f.doc.state.minute},`elapse_${to}`,'world_time');
const profit=f=>{const d=f.draft(),n=operatingProfit(d,f.e,host);d.done();return n;};

test('FIFO retains 40/27 cost through partial cash and credit sales without per-sale rounding',()=>{
    const f=fixture(),d=f.draft(),item='item_bread';
    // Delivered 27 portions cost40; the buyer inventory is post-delivery.
    d.set(['state','npcs',host,'inventory'],{[item]:{quantity:27}});
    recordFinanceSale(d,f.e,{buyer:host,seller:'player',item,quantity:27,cost:40,eventId:'fraction-buy'});
    assert.deepEqual(d.get('state','records',`finance_profit:${host}`).lots[item],[{quantity:27,price:{numerator:40,denominator:27}}]);
    const sell=(quantity,cost,eventId,extra={})=>recordFinanceSale(d,f.e,{buyer:'player',seller:host,item,quantity,cost,eventId,...extra});
    assert.deepEqual(sell(1,2,'fraction-one'),{numerator:40,denominator:27});
    // 2-40/27=14/27: reporting floor0, remainder survives.
    assert.equal(operatingProfit(d,f.e,host),0);
    assert.deepEqual(sell(1,2,'fraction-two'),{numerator:40,denominator:27});
    assert.equal(operatingProfit(d,f.e,host),1); // floor(28/27), not floor(14/27)*2.
    const basis=sell(25,50,'fraction-credit',{paid:false});
    assert.deepEqual(basis,{numerator:1000,denominator:27});
    assert.equal(operatingProfit(d,f.e,host),1);
    assert.deepEqual(d.get('state','records',`finance_profit:${host}`).lots[item],[]);
    sell(25,50,'fraction-repaid',{settledBasis:structuredClone(basis)});
    // Total bills54 minus exact acquired40 =14, no second stock debit.
    assert.equal(operatingProfit(d,f.e,host),14);
    const row=d.get('state','records',`finance_profit:${host}`);
    assert.equal(row.netExact,14);assert.equal(row.net,14);
    assert.equal(row.entries.length,3);assert.deepEqual(row.lots[item],[]);
});

test('credit cost fractions survive JSON beyond the safe integer range without changing the profit floor',()=>{
    const f=fixture(),d=f.draft(),basis={numerator:'9007199254740993',denominator:'9007199254740992'};
    // Exact cost1+1/2^53, revenue2: profit is below1 and reports0.
    // A Number conversion rounds the cost to1 and incorrectly reports1.
    const paid=recordFinanceSale(d,f.e,{buyer:'player',seller:host,item:'item_bread',quantity:1,cost:2,settledBasis:basis,eventId:'large-exact-basis'});
    assert.deepEqual(paid,basis);assert.equal(operatingProfit(d,f.e,host),0);
    const row=JSON.parse(JSON.stringify(d.get('state','records',`finance_profit:${host}`)));
    d.set(['state','records',`finance_profit:${host}`],row);
    assert.deepEqual(row.entries[0].cost,basis);assert.equal(row.net,0);
    assert.equal(operatingProfit(d,f.e,host),0);
});

test('商号入股实际转资，按真实成交扣成本和税后利润分红，资本注入不算收入，股份可部分转让',async()=>{
    const f=fixture(),total=cash(f.doc);
    // 15 §15.2：私人行囊不供给市场。林穗的正式薄饼货架提供同类公开食品存量，
    // 面包仍从零开始，经真实交易取得16份、每份成本1；原成本/正利润/分红断言全部保留。
    // 玩家只带本例所需20面包（3kg），不带无关的100木/100粮，买回12份后也不超30kg。
    const setup=applyIntentSetup(f.e,f.doc,{facts:[
        {path:['state','inventory'],value:{item_bread:{quantity:20}}},
        {path:['state','npcs',host,'inventory'],value:{item_oat_flatbread:{quantity:60}}}
    ]});
    assert.deepEqual(setup.setupUnmet,[]);f.doc=setup.document;
    const acquired=await f.act({buyer:host,seller:'player',item:'item_bread',quantity:16,unitPrice:1},'stock-acquired');
    // 薄饼60份即便扣4份家户保留仍有S≥56，D≤28，稀缺钳在.5；16≤56×.3、日内总量16+10+2≤56×.5。
    // 采购报价2×.5×收购价差.6=.6，合法整数价1，16×1=16；随后库存流入后的深度仍使合法整数卖价包含2。
    // 现金卖10、赊卖2后仍留4份面包，FIFO的实际取得成本按1计，不用目录成本2。
    assert.equal(acquired.cost,16);
    await assert.rejects(f.act({operation:'invest',seller:host,quantity:20},'no'),/同意/);
    const own=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'invest');assert.equal(profit(f),0);assert.equal(cash(f.doc),total);
    await assert.rejects(f.act({operation:'dividend',seller:host,contract:own.contract},'soon'),/未到/);
    const sale=await f.act({seller:host,item:'item_bread',quantity:10,unitPrice:2},'sale');
    // Scarcity remains clamped .5 along the lot. Bargained unit2 × 10=20;
    // historical basis is the actual sixteen-at-one acquisition above.
    assert.equal(sale.cost,20);
    const net=sale.cost-10-(sale.tax?.amount??0);assert.equal(profit(f),net);assert.ok(net>0);
    f.e.byId.get(host).creditPolicy={limitCopper:1000,maximumMinutes:30*DAY,minimumTrust:-100};
    const credit=await f.act({seller:host,item:'item_bread',quantity:2,payment:'credit',creditMinutes:7*DAY},'credit-sale');assert.equal(profit(f),net);
    await f.act({seller:host,payment:'repay',debt:credit.debt},'settle-credit');
    const tax=f.doc.state.records['trade_tax:settle-credit:commercial']?.amount??0,totalNet=net+credit.cost-2-tax;assert.equal(profit(f),totalNet);
    const before=f.doc.state.player.coins;f.tick(f.doc.state.records[own.contract].nextDividend);
    const paid=f.doc.state.records[own.contract].distributed;assert.equal(paid,Math.floor(totalNet*.2));assert.equal(f.doc.state.player.coins,before+paid);assert.equal(cash(f.doc),total);
    const snapshot=structuredClone(f.doc.state.records[own.contract]);f.tick(f.doc.state.minute);assert.deepEqual(f.doc.state.records[own.contract],snapshot);
    const transfer=await f.act({operation:'share_transfer',seller:host,buyer:worker,contract:own.contract,quantity:5,consent:true},'transfer');
    assert.equal(f.doc.state.records[transfer.contract].holder,worker);assert.equal(f.doc.state.records[own.contract].share,15);assert.equal(cash(f.doc),total);
    await assert.rejects(f.act({operation:'share_transfer',seller:host,buyer:worker,contract:own.contract,quantity:16,consent:true},'over'),/转让股份/);
    await assert.rejects(f.act({operation:'invest',seller:host,quantity:90,consent:true},'excess'),/发行股份/);
});
test('组织股份使用统一公库，势力实际买卖利润可分红，捐款及借款不计利润，亏损不印钱',async()=>{
    const f=fixture(),issuer=f.w.factions[0],buyer=f.w.factions[1],rep=issuer.leader;
    delete f.e.byId.get(rep).schedule;f.doc.state.npcs[rep]={coins:50,status:'正常',location:post,activity:'营业',memoryStream:[]};
    issuer.resources.items??={};issuer.resources.items.item_wood=20;
    const setup=f.draft();ensureGroupAccount(setup,f.e,buyer.id);setup.done();
    const own=await f.act({operation:'invest',business:issuer.id,seller:rep,quantity:1,consent:true},'group');const total=cash(f.doc),personal=f.doc.state.npcs[rep].coins;
    const d=f.draft();financeTransfer(d,f.e,'player',issuer.id,20,'capital');
    assert.equal(operatingProfit(d,f.e,issuer.id),0);
    const result=applyEffect(d,f.e,{kind:'trade',target:buyer.id,item:'item_wood',quantity:10,unitPrice:100},{faction:issuer.id,sourceEvent:'trade-profit',minute:600},'faction');assert.ok(result.applied);d.done();
    const dd=f.draft(),net=operatingProfit(dd,f.e,issuer.id);dd.done();assert.ok(net>0);const balance=groupAccountView(f.e,f.doc.state,issuer.id).coins;
    f.tick(f.doc.state.records[own.contract].nextDividend);assert.equal(groupAccountView(f.e,f.doc.state,issuer.id).coins,balance-Math.floor(net/100));assert.equal(f.doc.state.npcs[rep].coins,personal);assert.equal(cash(f.doc),total);
    const loss=f.draft();applyEffect(loss,f.e,{kind:'trade',target:buyer.id,item:'item_wood',quantity:10,unitPrice:0},{faction:issuer.id,sourceEvent:'loss',minute:f.doc.state.minute},'faction');
    assert.equal(operatingProfit(loss,f.e,issuer.id),net-10*f.e.byId.get('item_wood').basePrice);loss.done();
    f.tick(f.doc.state.records[own.contract].nextDividend);assert.equal(f.doc.state.records[own.contract].payments.at(-1).paid,0);assert.equal(cash(f.doc),total);
});
test('租房需求来自当前住房，租约进入住户与作息视图；离屏欠租立案并当面追收，钱数守恒',async()=>{
    const f=fixture({at:mill}),building=f.e.byId.get(mill);building.purpose='私宅';f.doc.state.buildings[mill]={owner:'player',condition:100};
    const oldHome=personHousehold(f.e,f.doc.state,worker).value.homeLocation;
    assert.equal(rentalNeed(f.e,f.doc.state,worker,mill),null);
    f.doc.state.buildings[oldHome]={...f.doc.state.buildings[oldHome],condition:0};assert.equal(rentalNeed(f.e,f.doc.state,worker,mill).kind,'home');
    const total=cash(f.doc),r=await f.act({operation:'rent_out',seller:worker,location:mill,days:90,consent:true},'rent');
    assert.equal(personHousehold(f.e,f.doc.state,worker).value.homeLocation,mill);assert.ok(homeResidents(f.e,f.doc.state,mill).value.includes(worker));
    await assert.rejects(f.act({operation:'rent_out',seller:host,location:mill,consent:true},'occupied'),/需求|出租/);
    // Use the native transfer so the insolvency premise and conserved ledger agree.
    const money=f.doc.state.npcs[worker].coins,empty=f.draft();financeTransfer(empty,f.e,worker,'player',money,'rent-empty');empty.done();
    f.tick(600+31*DAY);const debt=Object.entries(f.doc.state.records).find(([,x])=>x.kind==='rent');assert.ok(debt);assert.ok(debt[1].defaulted.case);assert.equal(debt[1].paid,0);
    const fund=f.draft();financeTransfer(fund,f.e,'player',worker,debt[1].amount,'rent-fund');fund.done();
    await f.act({operation:'collect',seller:worker,debt:debt[0],consent:true},'collect');assert.equal(f.doc.state.records[debt[0]].status,'已还清');assert.equal(cash(f.doc),total);
    f.tick(600+90*DAY);assert.equal(f.doc.state.records[r.contract].status,'已到期');assert.equal(personHousehold(f.e,f.doc.state,worker).value.homeLocation,oldHome);
});
test('田地与铺面租客随当前职业和经营需求派生，无产权或不匹配需求不能出租',async()=>{
    // W8-E8: a renamed mill has no area/yield facts. Keep the occupation/title
    // assertions on the real registered field, with a one-mu lease (1700/15
    // portions/year * local grain quote *3/10 /12), not invented mill output.
    const field='loc_hw_fields',farm=fixture({at:field}),landTotal=cash(farm.doc);
    farm.doc.state.buildings[field]={owner:'player',condition:100};farm.doc.state.npcs[worker].occupation='农夫';
    assert.equal(rentalNeed(farm.e,farm.doc.state,worker,field)?.kind,'field');
    const land=await farm.act({operation:'rent_out',seller:worker,location:field,quantity:1,consent:true},'field');assert.equal(farm.doc.state.records[land.contract].use,'field');
    assert.equal(farm.doc.state.records[land.contract].rentBasis.areaMu,1);assert.equal(cash(farm.doc),landTotal);
    const f=fixture({at:mill}),p=f.e.byId.get(mill);f.doc.state.buildings[mill]={owner:'player',condition:100};const total=cash(f.doc);
    p.purpose='铺面';assert.equal(rentalNeed(f.e,f.doc.state,host,mill)?.kind,'commercial');
    const shop=await f.act({operation:'rent_out',seller:host,location:mill,consent:true},'shop');assert.equal(personBusiness(f.e,f.doc.state,host).location.value,mill);
    f.doc.state.buildings[mill].owner=host;await assert.rejects(f.act({operation:'rent_out',seller:clerk,location:mill,consent:true},'no-title'),/合法持有/);
    assert.equal(cash(f.doc),total);assert.ok(shop.contract);
});
test('工坊实际支付工钱和台费、消耗材料工具，技能派生产量品质并保留制造者；重放不复制',async()=>{
    const f=workshopFixture(),total=cash(f.doc),wood=f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood.quantity;
    const job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:100,days:10,consent:true},'hire');
    let row=f.doc.state.records[job.contract];assert.ok(npcSchedule(f.e,f.doc.state,worker,row.starts).default.some(s=>s.location===mill&&/生产/.test(s.activity)));
    await elapse(f,row.nextWork);row=f.doc.state.records[job.contract];const shift=row.shifts[0];assert.ok(shift.batches>0);assert.equal(f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood.quantity,wood-shift.batches);
    // Day wage 100 pro rata: the minutes at work are 480 minus the walk from home to the mill (road table), paid ceil(100*m/480).
    const m=480-f.e.route(f.e.byId.get(worker).home.location,mill,'walk',row.starts,f.doc.randomSeed).minutes;
    assert.equal(shift.minutes,m);assert.equal(f.doc.state.npcs[worker].coins,500+Math.ceil(100*m/480));assert.equal(cash(f.doc),total);
    assert.equal(f.doc.state.records['premises_stock:player:'+mill].inventory.item_wooden_peg.quantity,shift.batches*4);assert.ok(shift.instances.every(id=>f.doc.state.itemInstances[id].maker===worker));
    const snapshot=structuredClone(f.doc);f.tick(f.doc.state.minute);assert.deepEqual(f.doc,snapshot);
    f.doc.state.npcs[worker].proficiencies={skill_life_6_core:2200};await elapse(f,row.nextWork);row=f.doc.state.records[job.contract];assert.equal(row.shifts.at(-1).quality,'杰作');assert.ok(row.shifts.at(-1).batches>shift.batches);assert.equal(cash(f.doc),total);
    delete f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood;const paid=row.paid;await elapse(f,row.nextWork);assert.equal(f.doc.state.records[job.contract].status,'罢工');assert.equal(f.doc.state.records[job.contract].paid,paid);
});
test('低薪要求加薪、拒绝后罢工辞工；加薪须当面同意；拘押与负立场停止生产',async()=>{
    const f=workshopFixture(),job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:1,days:10,consent:true},'cheap'),total=cash(f.doc);
    await elapse(f,f.doc.state.records[job.contract].nextWork);let row=f.doc.state.records[job.contract];assert.equal(row.status,'要求加薪');
    await elapse(f,row.nextWork);row=f.doc.state.records[job.contract];assert.equal(row.status,'罢工');assert.equal(row.shifts.length,1);
    await assert.rejects(f.act({operation:'workshop_terms',seller:worker,contract:job.contract,coins:100},'no'),/同意/);
    await f.act({operation:'workshop_terms',seller:worker,contract:job.contract,coins:100,consent:true},'raise');await elapse(f,row.nextWork);assert.equal(f.doc.state.records[job.contract].status,'有效');
    f.doc.state.records.hold={category:'legal_custody',subject:worker,status:'生效',location:mill,expires:f.doc.state.minute+10*DAY};const before=f.doc.state.records[job.contract].produced;
    await elapse(f,f.doc.state.records[job.contract].nextWork);assert.equal(f.doc.state.records[job.contract].produced,before);assert.equal(f.doc.state.records[job.contract].status,'罢工');delete f.doc.state.records.hold;
    await f.act({operation:'dismiss',seller:worker,contract:job.contract},'dismiss');assert.equal(f.doc.state.records[job.contract].status,'已解雇');assert.equal(cash(f.doc),total);
    const g=workshopFixture(),j=await g.act({operation:'workshop',seller:worker,item:recipe,coins:1,days:10,consent:true},'quit');await elapse(g,g.doc.state.records[j.contract].nextWork);await elapse(g,g.doc.state.records[j.contract].nextWork+3*DAY);assert.equal(g.doc.state.records[j.contract].status,'已辞工');
});
test('world_time真实离屏推进完成工坊班次，受雇者不会同时经营原店，工资材料与输出一致',async()=>{
    const f=workshopFixture(),job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:100,days:10,consent:true},'offline');
    const before=cash(f.doc),row=f.doc.state.records[job.contract],wood=f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood.quantity;
    await f.act({minutes:row.nextWork-f.doc.state.minute},'elapsed','world_time');
    const after=f.doc.state.records[job.contract];assert.equal(after.shifts.length,1);
    // Pro rata: 100 a day for the m minutes actually at the mill (480 less the walk from home), ceil(100*m/480).
    const m=480-f.e.route(f.e.byId.get(worker).home.location,mill,'walk',row.starts,f.doc.randomSeed).minutes;assert.equal(after.attendance[String(Math.floor(row.starts/DAY))],m);assert.equal(after.paid,Math.ceil(100*m/480));assert.equal(f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood.quantity,wood-after.shifts[0].batches);
    assert.equal(cash(f.doc),before);assert.equal(personBusiness(f.e,f.doc.state,worker).open.value,false);
});
test('F083 玩家雇的工坊工人：迟到两小时按实到分钟结薪和产出，整天缺勤不付不产',async()=>{
    const f=workshopFixture(),job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:100,days:10,consent:true},'late'),home=f.e.byId.get(worker).home.location;
    const first=f.doc.state.records[job.contract],D1=Math.floor(first.starts/DAY);
    // 第1日正常：到岗 m1 = 480 - 通勤，工钱 ceil(100*m1/480)。
    await elapse(f,first.nextWork);let row=f.doc.state.records[job.contract];
    const m1=480-f.e.route(home,mill,'walk',first.starts,f.doc.randomSeed).minutes;
    assert.equal(row.shifts[0].minutes,m1);assert.equal(row.paid,Math.ceil(100*m1/480));
    // 第2日：他 08:00 才上路、10:00 到工坊（已在途的行程是前提）：上午120 + 下午240 = 360 分钟（迟到两小时）。
    await elapse(f,(D1+1)*DAY);
    const n=f.doc.state.npcs[worker];Object.assign(n,{location:null,activity:'赶路',scheduleTravel:{from:home,to:mill,depart:(D1+1)*DAY+480,arrive:(D1+1)*DAY+600,edges:[]}});
    await elapse(f,row.nextWork);row=f.doc.state.records[job.contract];
    assert.equal(row.attendance[String(D1+1)],360);assert.equal(row.shifts[1].minutes,360);
    // 累计 (m1+360) 分钟：日薪100折算，ceil(100*(m1+360)/480) 减去前一日已付，产出 batches=floor(360/20×(1+技能/3000))。
    assert.equal(row.paid,Math.ceil(100*(m1+360)/480));
    const skill=row.shifts[1].skill;assert.equal(row.shifts[1].batches,Math.floor(360/20*(1+skill/3000)));
    // 第3日整天缺勤（人在远路上，次日清晨才到）：没有到岗分钟 => 不付工钱、不产出，合同照常有效，只记原因。
    await elapse(f,(D1+2)*DAY);Object.assign(f.doc.state.npcs[worker],{location:null,activity:'赶路',scheduleTravel:{from:home,to:mill,depart:(D1+2)*DAY,arrive:(D1+3)*DAY+10,edges:[]}});
    const before={paid:row.paid,produced:row.produced,shifts:row.shifts.length,wood:f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood.quantity};
    await elapse(f,row.nextWork);row=f.doc.state.records[job.contract];
    assert.equal(row.paid,before.paid);assert.equal(row.produced,before.produced);assert.equal(row.shifts.length,before.shifts);
    assert.equal(f.doc.state.records['premises_stock:player:'+mill].inventory.item_wood.quantity,before.wood);assert.equal(row.status,'有效');assert.equal(row.reason,'没有实际到岗工时');
    // S5 W2b/W4：没有一分钟实际到岗的工作日是工人的缺勤，记一次缺勤违约（与 labor-market 同一 withAbsenceBreach），前两日没有。
    assert.deepEqual(row.breaches.map(b=>[b.kind,b.by,b.day]),[['缺勤',worker,D1+2]]);
});
test('商税及关税随政体与聚落级别派生，缴入公账，走私数量免于合法通关税；不足拒绝',async()=>{
    const f=fixture(),sid='loc_hw',before=tradeTax(f.e,f.doc.state,post),total=cash(f.doc),treasury=f.doc.state.settlements[sid].treasury;
    const d=f.draft(),tax=assessTradeTax(d,f.e,{seller:host,cost:100,location:post,sourceEvent:'tax'});d.done();assert.ok(tax.amount>0);assert.equal(f.doc.state.settlements[sid].treasury,treasury+tax.amount);assert.equal(cash(f.doc),total);
    f.doc.state.records[`settlement_rank:${sid}`]={category:'settlement_rank',level:'城'};assert.ok(tradeTax(f.e,f.doc.state,post).bps>before.bps);
    const edge=f.w.routes.find(r=>r.id==='route_hw_yandu');edge.from='loc_hw';edge.to='loc_bs';edge.toll=1;
    const target=f.doc.state.settlements.loc_bs?.treasury??0,dd=f.draft();collectRouteTariffs(dd,f.e,{edges:[edge.id]},'cross');dd.done();assert.ok(f.doc.state.settlements.loc_bs.treasury>target);assert.equal(cash(f.doc),total);
    const beforeHidden=f.doc.state.player.coins;f.doc.state.records.cargo={category:'smuggling',status:'运输中',item:'item_wood',quantity:100};
    f.doc.state.inventory={item_wood:{quantity:100}};const hidden=f.draft();collectRouteTariffs(hidden,f.e,{edges:[edge.id]},'hidden');hidden.done();assert.equal(f.doc.state.player.coins,beforeHidden);
    f.doc.state.player.coins=0;const poor=f.draft();assert.throws(()=>assessTradeTax(poor,f.e,{seller:'player',cost:1000,location:post,sourceEvent:'poor'}),/不足/);
    assert.equal(toolDefinitions().length,27);
});
