import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cash,clerk,host,worker,post,inn,DAY} from './helpers/finance.mjs';
import {derivedBankAt,depositRate,borrowerTerms,financeBalance} from '../server-plugin/finance-bank.mjs';
import {settlementGovernment} from '../server-plugin/entity-view.mjs';
import {groupAccountView} from '../server-plugin/group-account.mjs';
import {generateCounty,remoteWorld} from '../server-plugin/remote-generation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';

test('存款按期结息，当前季节灾害改变报价；准备金不足或倒闭不凭空支付，重放不重复',async()=>{
    const f=fixture(),b=f.e.rules.economy.credit.banks[0];
    await f.act({operation:'deposit',seller:clerk,coins:1001},'dep');const total=cash(f.doc),base=depositRate(f.e,f.doc.state,b),at=f.doc.state.records[b.id].interestAt;
    f.tick(at+30*DAY);const row=f.doc.state.records[b.id];assert.ok(row.accounts.player>1000);assert.equal(cash(f.doc),total);
    const settled=structuredClone(row);f.tick(at+30*DAY);assert.deepEqual(f.doc.state.records[b.id],settled);
    assert.notEqual(depositRate(f.e,f.doc.state,b,100*DAY),base);
    f.doc.state.records['hazard-price:loc_hw']={category:'hazard_price',shifts:{test:{since:0,until:1e9,factor:2}}};
    assert.ok(depositRate(f.e,f.doc.state,b)>base);
    f.doc.state.records[b.id].coins=row.accounts.player;f.tick(at+60*DAY);assert.equal(f.doc.state.records[b.id].interestLedger.at(-1).paid,0);
    f.doc.state.records[b.id].status='倒闭';await assert.rejects(f.act({operation:'withdraw',seller:clerk,coins:1},'closed'),/倒闭/);
});
test('分期部分还款保留抵押；展期须同意；提前清偿只付已发生利息，金额拒绝原子性',async()=>{
    const f=fixture({at:inn}),before=cash(f.doc);
    const loan=await f.act({operation:'borrow',seller:host,consent:true,coins:100,days:10,quantity:2},'borrow');
    const p=await f.act({seller:host,payment:'repay',debt:loan.debt,coins:20},'partial');assert.notEqual(p.status,'已还清');
    const saved=structuredClone(f.doc);await assert.rejects(f.act({seller:host,payment:'repay',debt:loan.debt,coins:1e6},'over'),/还款金额/);assert.deepEqual(f.doc,saved);
    await assert.rejects(f.act({operation:'extend',seller:host,debt:loan.debt,days:5},'no'),/同意/);
    const ext=await f.act({operation:'extend',seller:host,debt:loan.debt,days:5,consent:true},'ext');assert.ok(ext.deadline>loan.deadline);
    await f.act({operation:'prepay',seller:host,debt:loan.debt,consent:true},'early');assert.equal(f.doc.state.records[loan.debt].status,'已还清');assert.ok(f.doc.state.records[loan.debt].prepayment.waived>0);assert.equal(cash(f.doc),before);
    const second=await f.act({operation:'borrow',seller:host,consent:true,coins:40,days:4,quantity:2},'second');f.tick(f.doc.state.records[second.debt].createdAt+3*DAY);
    assert.ok(f.doc.state.records[second.debt].defaulted,'第一期不付会违约，不等到总借期结束');
});
test('玩家向NPC放贷实际转本金，信用立场灵智收支派生利率，按期偿还及法律抵押追讨守恒',async()=>{
    const f=fixture(),total=cash(f.doc);const d=f.draft(),a=borrowerTerms(d,f.e,host,100,10);d.done();
    f.doc.state.npcs[host].intelligence={level:5};f.doc.state.records.salary={category:'office_salary',holder:host,payments:[{minute:600,copper:1500}]};
    const d2=f.draft(),b=borrowerTerms(d2,f.e,host,100,10);d2.done();assert.ok(b.rate<a.rate);
    await assert.rejects(f.act({operation:'lend',seller:host,coins:100,days:10},'refuse'),/同意/);
    const loan=await f.act({operation:'lend',seller:host,coins:100,days:10,consent:true,quantity:2},'lend');f.tick(600+10*DAY);
    assert.equal(f.doc.state.records[loan.debt].status,'已还清');assert.equal(cash(f.doc),total);
    const bad=await f.act({operation:'lend',seller:worker,coins:100,days:1,consent:true,item:'item_bread',quantity:1},'bad');
    const current=f.doc.state.npcs[worker].coins;f.doc.state.npcs[worker].coins=0;f.doc.state.player.coins+=current;
    f.tick(f.doc.state.records[bad.debt].deadline+DAY);const row=f.doc.state.records[bad.debt];assert.ok(row.defaulted.case);assert.ok(row.paid>0);assert.equal(f.doc.state.records[row.defaulted.case].offender,worker);assert.equal(f.doc.state.records[row.defaulted.case].victim,'player');assert.equal(cash(f.doc),total);
    f.doc.state.location='bld_hw_council';for(const n of ['npc_hw_chenbai','npc_hw_gucen']){f.doc.state.npcs[n].location='bld_hw_council';delete f.w.npcs.find(x=>x.id===n).schedule;}
    await f.act({operation:'hear',case:row.defaulted.case,authority:'npc_hw_chenbai'},'hear','world_law');
    await assert.rejects(f.act({operation:'pay',case:row.defaulted.case,authority:'npc_hw_gucen'},'empty','world_law'),/没有可执行资金/);
    f.doc.state.npcs[worker].coins=200;f.doc.state.player.coins-=200;
    const recovered=await f.act({operation:'pay',case:row.defaulted.case,authority:'npc_hw_gucen'},'recover','world_law');assert.ok(recovered.closed);assert.equal(cash(f.doc),total);
});
test('组织放贷读V4公库与现任代表，不能以代表私款偿还组织债',async()=>{
    const f=fixture(),group=f.w.factions.find(g=>g.leader?.startsWith('npc_'));assert.ok(group);
    const base=f.e.byId.get(group.leader);delete base.schedule;f.doc.state.npcs[group.leader]={coins:300,status:'正常',location:post,activity:'营业',memoryStream:[]};
    const id=group.id,rep=group.leader,balance=groupAccountView(f.e,f.doc.state,id).coins;
    const loan=await f.act({operation:'lend',business:id,seller:rep,coins:40,days:1,consent:true},'org');
    assert.equal(groupAccountView(f.e,f.doc.state,id).coins,balance+40);const total=cash(f.doc),personal=f.doc.state.npcs[rep].coins;
    f.tick(f.doc.state.records[loan.debt].deadline);assert.equal(f.doc.state.npcs[rep].coins,personal);assert.equal(cash(f.doc),total);
    await assert.rejects(f.act({operation:'lend',business:id,seller:worker,coins:10,consent:true},'wrong'),/代表/);
});
test('典当赎回与流当实物拍卖，买方实际付款、超额退回；拒绝重复赎当拍卖',async()=>{
    const f=fixture();await f.act({operation:'deposit',seller:clerk,coins:10},'dep');const total=cash(f.doc);
    const p=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:10,days:1},'pawn');
    await f.act({operation:'redeem',seller:clerk,contract:p.contract},'redeem');assert.equal(f.doc.state.inventory.item_bread.quantity,100);
    await assert.rejects(f.act({operation:'redeem',seller:clerk,contract:p.contract},'again'),/还清/);
    const q=await f.act({operation:'pawn',seller:clerk,item:'item_bread',quantity:10,days:1},'pawn2');
    await assert.rejects(f.act({operation:'auction',seller:clerk,buyer:host,contract:q.contract,coins:100,consent:true},'soon'),/尚不可/);
    f.tick(f.doc.state.records[q.contract].auctionAt);const before=f.doc.state.npcs[host].inventory.item_bread.quantity;
    const sold=await f.act({operation:'auction',seller:clerk,buyer:host,contract:q.contract,coins:100,consent:true},'sold');assert.ok(sold.surplus>0);assert.equal(f.doc.state.npcs[host].inventory.item_bread.quantity,before+10);assert.equal(cash(f.doc),total);
    await assert.rejects(f.act({operation:'auction',seller:clerk,buyer:host,contract:q.contract,coins:100,consent:true},'twice'),/尚不可/);
});
test('组织抵押来自统一公库实物，偿还退回组织，违约处置给债权人，不挪代表私产',async()=>{
    const f=fixture(),group=f.w.factions[0],rep=group.leader;group.resources.items={item_wood:10};
    delete f.e.byId.get(rep).schedule;f.doc.state.npcs[rep]={coins:50,status:'正常',location:post,activity:'营业',memoryStream:[]};
    const loan=await f.act({operation:'lend',business:group.id,seller:rep,coins:20,days:1,item:'item_wood',quantity:2,consent:true},'pledge-org');
    assert.equal(groupAccountView(f.e,f.doc.state,group.id).items.item_wood,8);const total=cash(f.doc);
    f.tick(f.doc.state.records[loan.debt].deadline);assert.equal(groupAccountView(f.e,f.doc.state,group.id).items.item_wood,10);assert.equal(cash(f.doc),total);
    const poor=await f.act({operation:'lend',business:group.id,seller:rep,coins:20,days:1,item:'item_wood',quantity:2,consent:true},'bad-org');
    const balance=groupAccountView(f.e,f.doc.state,group.id).coins;f.doc.state.records[`faction-assets:${group.id}`].coins=0;f.doc.state.player.coins+=balance;
    const before=f.doc.state.inventory.item_wood.quantity;f.tick(f.doc.state.records[poor.debt].deadline+DAY);
    assert.equal(f.doc.state.inventory.item_wood.quantity,before+2);assert.equal(groupAccountView(f.e,f.doc.state,group.id).items.item_wood,8);assert.equal(cash(f.doc),total);
});
test('远方郡治钱庄随生成级别与现任主官派生，免手填地点和准备金',()=>{
    const f=fixture(),county=f.w.regions.find(r=>r.category==='county'&&!r.places?.includes('loc_bs'));
    const skeleton=generateCounty(f.w,county.id,'finance-remote');f.doc.state.remote={[county.id]:{county:county.id,skeleton,profiles:{}}};
    for(const p of skeleton.people)f.doc.state.npcs[p.id]={coins:0,status:'正常',location:p.location};
    const e=new WorldEngine(remoteWorld(f.w,f.doc.state)),gov=settlementGovernment(e,f.doc.state,skeleton.seat),bank=derivedBankAt(e,f.doc.state,gov.seat.value);
    assert.ok(bank);assert.deepEqual(bank.keepers,[gov.head.value]);assert.equal(bank.reserveCopper,0);
    f.doc.state.records[`settlement_rank:${skeleton.seat}`]={category:'settlement_rank',level:'村'};assert.equal(derivedBankAt(e,f.doc.state,gov.seat.value),null);
});
test('聚落级别与现任官员派生白石和远方钱庄，异地汇票兑付、流动性与战乱风险守恒',async()=>{
    const f=fixture(),sid='loc_bs',merchant='npc_hw_yanzhe';
    f.doc.state.npcs[merchant]={coins:50,status:'正常',location:sid,activity:'营业'};
    const b=derivedBankAt(f.e,f.doc.state,sid);
    assert.ok(b,'白石镇公署有派生钱庄');assert.equal(b.reserveCopper,0);
    const keeper=b.keepers[0];f.doc.state.npcs[keeper]={coins:50,status:'正常',location:b.location,activity:'营业'};
    const base=f.w.npcs.find(n=>n.id===keeper);if(base)delete base.schedule;
    const remit=await f.act({operation:'remit',seller:clerk,coins:100,location:b.location},'remit');const total=cash(f.doc);
    f.doc.state.location=b.location;
    await assert.rejects(f.act({operation:'cash_bill',seller:keeper,contract:remit.contract},'dry'),/准备金/);
    await f.act({operation:'deposit',seller:keeper,coins:201},'fund');
    const origin=f.e.rules.economy.credit.banks[0];f.doc.state.records[origin.id].status='倒闭';
    await assert.rejects(f.act({operation:'cash_bill',seller:keeper,contract:remit.contract},'closed'),/倒闭/);delete f.doc.state.records[origin.id].status;
    f.doc.state.records.war={category:'war_disruption',locations:[post],since:0,until:1e9,factor:2};await assert.rejects(f.act({operation:'cash_bill',seller:keeper,contract:remit.contract},'war'),/战乱/);delete f.doc.state.records.war;
    await f.act({operation:'cash_bill',seller:keeper,contract:remit.contract},'cash');assert.equal(cash(f.doc),total);await assert.rejects(f.act({operation:'cash_bill',seller:keeper,contract:remit.contract},'twice'),/汇票/);
    f.doc.state.records[`settlement_rank:${sid}`]={category:'settlement_rank',level:'村'};assert.equal(derivedBankAt(f.e,f.doc.state,b.location),null);
});
