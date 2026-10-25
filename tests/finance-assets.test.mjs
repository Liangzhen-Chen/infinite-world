import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cash,clerk,host,worker,post,DAY} from './helpers/finance.mjs';
import {operatingProfit,rentalNeed} from '../server-plugin/finance-assets.mjs';
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
    f.doc.state.inventory.item_whittling_knife={quantity:1,durability:80};return f;
}
const profit=f=>{const d=f.draft(),n=operatingProfit(d,f.e,host);d.done();return n;};

test('商号入股实际转资，按真实成交扣成本和税后利润分红，资本注入不算收入，股份可部分转让',async()=>{
    const f=fixture(),total=cash(f.doc);
    // 15 §15.2: the old 3-copper offer exceeds today's 1-copper market
    // range. Profit is still tested strictly positive, with real acquisition
    // cost: opening stock is an unrelated premise; buy twelve originals at
    // one copper through the native trade before reselling ten at two.
    const setup=applyIntentSetup(f.e,f.doc,{facts:[{path:['state','npcs',host,'inventory'],value:{}}]});
    assert.deepEqual(setup.setupUnmet,[]);f.doc=setup.document;
    const acquired=await f.act({buyer:host,seller:'player',item:'item_bread',quantity:16,unitPrice:1},'stock-acquired');
    // Food scarcity floor .5 × baseline2 × buy spread .6; offered1 is
    // within ceil(.6*.9)..ceil(.6*1.1). Flat clamped curve: 16*1=16; four household portions remain after the 10 cash + 2 credit sale.
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
    const f=fixture({at:mill}),p=f.e.byId.get(mill);f.doc.state.buildings[mill]={owner:'player',condition:100};const total=cash(f.doc);
    p.purpose='田地';f.doc.state.npcs[worker].occupation='农夫';
    assert.equal(rentalNeed(f.e,f.doc.state,worker,mill)?.kind,'field');
    const land=await f.act({operation:'rent_out',seller:worker,location:mill,consent:true},'field');assert.equal(f.doc.state.records[land.contract].use,'field');
    f.doc.state.records[land.contract].status='已到期';p.purpose='铺面';assert.equal(rentalNeed(f.e,f.doc.state,host,mill)?.kind,'commercial');
    const shop=await f.act({operation:'rent_out',seller:host,location:mill,consent:true},'shop');assert.equal(personBusiness(f.e,f.doc.state,host).location.value,mill);
    f.doc.state.buildings[mill].owner=host;await assert.rejects(f.act({operation:'rent_out',seller:clerk,location:mill,consent:true},'no-title'),/合法持有/);
    assert.equal(cash(f.doc),total);assert.ok(shop.contract);
});
test('工坊实际支付工钱和台费、消耗材料工具，技能派生产量品质并保留制造者；重放不复制',async()=>{
    const f=workshopFixture(),total=cash(f.doc),wood=f.doc.state.inventory.item_wood.quantity;
    const job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:100,days:10,consent:true},'hire');
    let row=f.doc.state.records[job.contract];assert.ok(npcSchedule(f.e,f.doc.state,worker,row.starts).default.some(s=>s.location===mill&&/生产/.test(s.activity)));
    f.tick(row.nextWork);row=f.doc.state.records[job.contract];const shift=row.shifts[0];assert.ok(shift.batches>0);assert.equal(f.doc.state.inventory.item_wood.quantity,wood-shift.batches);assert.equal(f.doc.state.npcs[worker].coins,600);assert.equal(cash(f.doc),total);
    assert.equal(f.doc.state.inventory.item_wooden_peg.quantity,shift.batches*4);assert.ok(shift.instances.every(id=>f.doc.state.itemInstances[id].maker===worker));
    const snapshot=structuredClone(f.doc);f.tick(f.doc.state.minute);assert.deepEqual(f.doc,snapshot);
    f.doc.state.npcs[worker].proficiencies={skill_life_6_core:2200};f.tick(row.nextWork);row=f.doc.state.records[job.contract];assert.equal(row.shifts.at(-1).quality,'杰作');assert.ok(row.shifts.at(-1).batches>shift.batches);assert.equal(cash(f.doc),total);
    delete f.doc.state.inventory.item_wood;const paid=row.paid;f.tick(row.nextWork);assert.equal(f.doc.state.records[job.contract].status,'罢工');assert.equal(f.doc.state.records[job.contract].paid,paid);
});
test('低薪要求加薪、拒绝后罢工辞工；加薪须当面同意；拘押与负立场停止生产',async()=>{
    const f=workshopFixture(),job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:1,days:10,consent:true},'cheap'),total=cash(f.doc);
    f.tick(f.doc.state.records[job.contract].nextWork);let row=f.doc.state.records[job.contract];assert.equal(row.status,'要求加薪');
    f.tick(row.nextWork);row=f.doc.state.records[job.contract];assert.equal(row.status,'罢工');assert.equal(row.shifts.length,1);
    await assert.rejects(f.act({operation:'workshop_terms',seller:worker,contract:job.contract,coins:100},'no'),/同意/);
    await f.act({operation:'workshop_terms',seller:worker,contract:job.contract,coins:100,consent:true},'raise');f.tick(row.nextWork);assert.equal(f.doc.state.records[job.contract].status,'有效');
    f.doc.state.records.hold={category:'legal_custody',subject:worker,status:'生效',location:mill,expires:f.doc.state.minute+10*DAY};const before=f.doc.state.records[job.contract].produced;
    f.tick(f.doc.state.records[job.contract].nextWork);assert.equal(f.doc.state.records[job.contract].produced,before);assert.equal(f.doc.state.records[job.contract].status,'罢工');delete f.doc.state.records.hold;
    await f.act({operation:'dismiss',seller:worker,contract:job.contract},'dismiss');assert.equal(f.doc.state.records[job.contract].status,'已解雇');assert.equal(cash(f.doc),total);
    const g=workshopFixture(),j=await g.act({operation:'workshop',seller:worker,item:recipe,coins:1,days:10,consent:true},'quit');g.tick(g.doc.state.records[j.contract].nextWork);g.tick(g.doc.state.records[j.contract].nextWork+3*DAY);assert.equal(g.doc.state.records[j.contract].status,'已辞工');
});
test('world_time真实离屏推进完成工坊班次，受雇者不会同时经营原店，工资材料与输出一致',async()=>{
    const f=workshopFixture(),job=await f.act({operation:'workshop',seller:worker,item:recipe,coins:100,days:10,consent:true},'offline');
    const before=cash(f.doc),row=f.doc.state.records[job.contract],wood=f.doc.state.inventory.item_wood.quantity;
    await f.act({minutes:row.nextWork-f.doc.state.minute},'elapsed','world_time');
    const after=f.doc.state.records[job.contract];assert.equal(after.shifts.length,1);assert.equal(after.paid,100);assert.equal(f.doc.state.inventory.item_wood.quantity,wood-after.shifts[0].batches);
    assert.equal(cash(f.doc),before);assert.equal(personBusiness(f.e,f.doc.state,worker).open.value,false);
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
