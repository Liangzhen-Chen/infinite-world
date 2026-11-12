import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cash,clerk,host,worker,post,DAY} from './helpers/finance.mjs';
import {netAssets,terminateAssetLease} from '../server-plugin/finance-assets.mjs';
import {assessTradeTax} from '../server-plugin/finance-tax.mjs';
import {adoptLegacyObligation,dueObligation} from '../server-plugin/obligation-runtime.mjs';
import {settleFinancialClaim,pawnForActor} from '../server-plugin/finance-bank.mjs';
import {loanTerms} from '../server-plugin/credit.mjs';
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';

function lenderConsent(f,principal,days,eventId){
    // 产品原则二.4：保留代偿/违约消费者断言，真实贷款先由债权人同意精确报价。
    const d=f.draft(),quote=loanTerms(d,f.e,{lender:host,principal,days,collateralValue:0});
    applyConsentEvent(d,{engine:f.e,document:d.document},{actor:host,eventId,verb:'consent_given',to:'player',payload:{scope:'loan',subject:'player',purpose:['player'],terms:{principal,days,interest:quote.interest},until:d.get('state','minute')+10}});d.done();
}

test('E12-2: 一年十二期仅在真实期点尝试；远方不扣款，失败后不逐日写游标',async()=>{
    // 不代填借款人同意；真实放贷动作自行取得 NPC 对当前报价的决策。
    const f=fixture(),loan=await f.act({operation:'lend',seller:host,coins:100,days:360,quantity:12},'annual');
    const row=f.doc.state.records[loan.debt],total=cash(f.doc);
    assert.ok(f.doc.state.consentEvents.some(e=>e.id===row.signedTerms.consent&&e.from===host&&e.scope==='loan'));
    assert.equal(row.installments,12);assert.equal(row.deadline-row.createdAt,360*DAY);
    f.doc.state.location='loc_bs';f.tick(row.createdAt+30*DAY);
    const first=structuredClone(f.doc.state.records[loan.debt]);assert.equal(first.paid,0);assert.equal(first.nextPayment,row.createdAt+60*DAY);
    f.tick(row.createdAt+31*DAY);assert.deepEqual(f.doc.state.records[loan.debt],first);
    f.doc.state.location=post;f.tick(row.createdAt+60*DAY);
    assert.equal(f.doc.state.records[loan.debt].paid,Math.ceil(row.amount*2/12));assert.equal(cash(f.doc),total);
});

test('E18/E3: 规范工资债与旧投影只减一次股值，到期债权先于股东分红',async()=>{
    // 下面的手算锚点（需求 24、48 = 各户自家面包留存）只在没有聚落公粮时成立；有公粮时需求只剩货架上限 14（EC-1a 已批准，见 finance-assets 同名前提）。
    const f=fixture({publicRation:false});
    const equity=await f.act({operation:'invest',seller:host,quantity:20,consent:true},'equity');
    f.doc.state.records[`finance_profit:${host}`]={category:'finance_profit',issuer:host,net:1000};
    const at=f.doc.state.records[equity.contract].nextDividend;
    let d=f.draft();const before=netAssets(d,f.e,host);d.done();
    const amount=f.doc.state.npcs[host].coins;
    // Bread base 2, physical supply 20, no backed forwards: effective supply 20.
    // 面包饱腹改由推导（R1，t-sat：30→16，item-class.mjs satietyFactor）后，各户面包留存约翻倍。探针 tools/probe-rules-a.mjs s3fin：
    // 注资前 netAssets(host)=548=现金500+面包20*2*需求24/供给20=48；需求 24 = 玩家3+shendu4+ayan8+chenbai4+gucen5（旧：2+4+4+4+4=18）。
    // 持股价格 = 注资前净资产/4（20 股占四分之一）= 548/4 = 137（旧：536/4=134；st-5 为 528/4=132，需求被货架上限 14 夹住），所以 amount=500+137=637，
    // 注资后库存估值 48，before = 637+48 = 685（探针 netAssets=685）。
    assert.equal(amount,637);assert.equal(before,637+48);
    f.doc.state.records.wages={category:'debt',kind:'wage',debtor:host,creditor:worker,amount,paid:0,createdAt:600,deadline:at,status:'待偿还'};
    // The known wage extends the creditor's income horizon: his bread reserve
    // rises 8->20. The keeper's market budget cannot release another holder's
    // food. 债权人 ayan 的 20 个面包全部自留，其余四人再没有可买的面包来源，退回各自完整储备（R1 后每人约 8，而不是旧的 4）：
    // 探针：玩家4+shendu8+ayan20+chenbai8+gucen8 = 需求 48；supply stays 20；stock value = 20*2*48/20 = 96（旧：2+4+20+4+4=34 → 68）。
    // Assets = cash637 + 96 - wage637 = 96, both before/after adoption（探针：记债后 96，采纳旧投影后仍 96）。
    // A duplicated canonical+legacy liability would instead hit the floor of 1.
    d=f.draft();assert.equal(netAssets(d,f.e,host),96);
    adoptLegacyObligation(d,f.e,'wages');assert.equal(netAssets(d,f.e,host),96);d.done();
    const total=cash(f.doc);f.tick(at);
    assert.equal(f.doc.state.records[equity.contract].distributed,0);assert.equal(dueObligation(f.doc.state,'wages').owed,amount);assert.equal(cash(f.doc),total);
});

test('E12-3: 实际退租关闭使用权与未来租金，既欠租保留可追收',async()=>{
    const f=fixture({at:'bld_hw_mill'}),subject='bld_hw_mill';f.e.byId.get(subject).purpose='私宅';f.doc.state.buildings[subject]={owner:'player',condition:100};
    // The tenant has a real housing need rather than a fabricated rent record.
    f.doc.state.buildings.bld_hw_riverhome={condition:0};
    const {personHousehold}=await import('../server-plugin/entity-view.mjs');
    const home=personHousehold(f.e,f.doc.state,worker).value.homeLocation;f.doc.state.buildings[home]={condition:0};
    const rent=await f.act({operation:'rent_out',seller:worker,location:subject,days:90,consent:true},'lease');
    f.doc.state.npcs[worker].coins=0;f.tick(600+31*DAY);
    const debts=Object.entries(f.doc.state.records).filter(([,r])=>r.kind==='rent');assert.equal(debts.length,1);
    const old=structuredClone(debts[0][1]);
    await f.act({operation:'dismiss',seller:worker,contract:rent.contract},'vacate');
    assert.equal(f.doc.state.records[rent.contract].status,'已终止');
    f.tick(600+100*DAY);assert.deepEqual(f.doc.state.records[debts[0][0]],old);
    assert.equal(Object.values(f.doc.state.records).filter(r=>r.kind==='rent').length,1);
});

test('E05-3: 同一税款事实重放不重复扣钱，也不随事后税率重估',()=>{
    const f=fixture(),d=f.draft(),args={seller:host,cost:1000,location:post,sourceEvent:'one-sale'};
    const first=assessTradeTax(d,f.e,args),after=structuredClone(d.document);
    assert.deepEqual(assessTradeTax(d,f.e,args),first);assert.deepEqual(d.document,after);
    assert.throws(()=>assessTradeTax(d,f.e,{...args,cost:2000}),/更换交易/);d.done();
});

test('E05-6: 兑票实扣到达网点现金，出票柜余额保留，另记一次柜间清算债权',async()=>{
    const f=fixture(),sid='loc_bs';
    f.doc.state.npcs.npc_hw_yanzhe={coins:50,status:'正常',location:sid,activity:'营业'};
    const {derivedBankAt}=await import('../server-plugin/finance-bank.mjs');
    const b=derivedBankAt(f.e,f.doc.state,sid),keeper=b.keepers[0],source=f.e.rules.economy.credit.banks[0];
    f.doc.state.npcs[keeper]={coins:50,status:'正常',location:b.location,activity:'营业'};delete f.e.byId.get(keeper).schedule;
    const bill=await f.act({operation:'remit',seller:clerk,coins:100,location:b.location},'issue');
    f.doc.state.location=b.location;await f.act({operation:'deposit',seller:keeper,coins:201},'fund');
    const total=cash(f.doc),origin=f.doc.state.records[source.id].coins,destination=f.doc.state.records[b.id].coins;
    await f.act({operation:'cash_bill',seller:keeper,contract:bill.contract},'cash');
    assert.equal(f.doc.state.records[source.id].coins,origin);assert.equal(f.doc.state.records[b.id].coins,destination-100);assert.equal(cash(f.doc),total);
    const clearing=f.doc.state.records[f.doc.state.records[bill.contract].clearing];assert.equal(clearing.debtor,source.id);assert.equal(clearing.creditor,b.id);assert.equal(clearing.amount,100);
    await assert.rejects(f.act({operation:'cash_bill',seller:keeper,contract:bill.contract},'duplicate'),/汇票/);
});

test('R3-E15: 入狱债务由真实到场第三人代偿，仍是原债；远方付款原子拒绝',async()=>{
    const f=fixture();lenderConsent(f,50,10,'prison-lender');
    const loan=await f.act({operation:'borrow',seller:host,coins:50,days:10,quantity:2},'prison');
    f.doc.state.records.detention={category:'legal_detention',subject:'player',status:'生效',minute:600,expires:600+30*DAY};
    f.doc.state.location='loc_bs';const total=cash(f.doc),before=f.doc.state.npcs[worker].coins;
    let d=f.draft();const args={claim:loan.debt,payer:worker,amount:10};
    const receipt=settleFinancialClaim(d,f.e,args,'substitute'),once=structuredClone(d.document);
    assert.equal(receipt.transferred,10);assert.deepEqual(settleFinancialClaim(d,f.e,args,'substitute'),receipt);assert.deepEqual(d.document,once);d.done();
    assert.equal(f.doc.state.npcs[worker].coins,before-10);assert.equal(dueObligation(f.doc.state,loan.debt).row.debtor,'player');assert.equal(cash(f.doc),total);
    f.doc.state.npcs[worker].location='loc_bs';d=f.draft();const saved=structuredClone(d.document);
    assert.throws(()=>settleFinancialClaim(d,f.e,{...args,amount:5},'remote'),/presence|在场/);assert.deepEqual(d.document,saved);d.done();
});

test('E18-2: NPC实际典当扣本人抵押并领取本人本金，冒充其他所有人零写拒绝',()=>{
    const f=fixture(),bank=f.e.rules.economy.credit.banks[0];f.doc.state.location='loc_bs';
    const total=cash(f.doc)+bank.reserveCopper,player=f.doc.state.player.coins,npc=f.doc.state.npcs[host].coins,stock=f.doc.state.npcs[host].inventory.item_bread.quantity;
    let d=f.draft();const args={actor:host,owner:host,representative:host,keeper:clerk,bank:bank.id,item:'item_bread',quantity:20,coins:10,days:1,consent:true};// F007: 20 loaves valued 1 copper each back the 10-copper advance at 50%
    const pawn=pawnForActor(d,f.e,args,'npc-pawn');d.done();
    assert.equal(f.doc.state.player.coins,player);assert.equal(f.doc.state.npcs[host].coins,npc+10);assert.equal(f.doc.state.npcs[host].inventory.item_bread?.quantity??0,stock-20);assert.equal(cash(f.doc),total);
    assert.equal(dueObligation(f.doc.state,pawn.contract).row.debtor,host);assert.equal(f.doc.state.records[pawn.pledge].owner,host);
    d=f.draft();const before=structuredClone(d.document);assert.throws(()=>pawnForActor(d,f.e,{...args,owner:worker},'forged'),/authority/);assert.deepEqual(d.document,before);d.done();
});

test('已诉借款实际清偿只结案一次，回执不再追加第二种结案事实',async()=>{
    const f=fixture();lenderConsent(f,50,2,'case-lender');
    const loan=await f.act({operation:'borrow',seller:host,coins:50,days:2,quantity:2},'case-loan');
    f.tick(600+3*DAY);const key=f.doc.state.records[loan.debt].defaulted.case;
    assert.equal(f.doc.state.records[key].status,'已报案');
    await f.act({seller:host,payment:'repay',debt:loan.debt},'case-repayment');
    const row=f.doc.state.records[key];assert.equal(row.status,'已结案');assert.equal(row.settledBy,'case-repayment');assert.equal(row.compensationSettledBy,undefined);
});

test('兑付后的柜间债仍占用出票柜准备金，不作为可供存款结息的闲钱',async()=>{
    const f=fixture(),b=f.e.rules.economy.credit.banks[0];
    await f.act({operation:'deposit',seller:clerk,coins:1001},'reserve-deposit');
    const bank=f.doc.state.records[b.id],at=bank.interestAt;bank.coins=1100;
    f.doc.state.records.clearing={category:'debt',kind:'bill',debtor:b.id,creditor:'other-bank',amount:100,paid:0,createdAt:at,deadline:at,status:'待偿还'};
    let d=f.draft();adoptLegacyObligation(d,f.e,'clearing');d.done();
    f.tick(at+30*DAY);assert.equal(f.doc.state.records[b.id].interestLedger.at(-1).paid,0);assert.ok(f.doc.state.records[b.id].interestArrears>0);assert.equal(f.doc.state.records[b.id].accounts.player,1000);
});
