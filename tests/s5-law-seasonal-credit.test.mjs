import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,cash,host,worker,clerk,DAY,seed,post} from './helpers/finance.mjs';
import {bankCredit,borrowerCashFlow,discloseCreditPlan,seasonalCredit,settleFinancialClaim,advanceBankFinance} from '../server-plugin/finance-bank.mjs';
import {loanTerms,openLoan,householdFundingCandidates} from '../server-plugin/credit.mjs';
import {openObligation,closeObligation} from '../server-plugin/obligation-runtime.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {autonomyCandidates,autonomyKind} from '../server-plugin/autonomy-candidates.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {transition,advanceProcedure} from '../server-plugin/transition.mjs';
import creditBalance from '../world/rules/tables/balance/credit.json' with {type:'json'};

function claim(f,{id,debtor=worker,creditor='player',amount=200,days=10,kind='wage',resource='coin_river'}){
 const d=f.draft();openObligation(d,f.e,{id,kind,debtor,creditor,actor:debtor,amount,resource,deadline:f.doc.state.minute+days*DAY},id);d.done();
}
function disclose(f,borrower='player',lender=host,id='statement'){
 const d=f.draft();const flow=discloseCreditPlan(d,f.e,borrower,lender,id);d.done();return flow;
}
function quote(f,{borrower='player',lender=host,days=10,principal=100,collateral=0,unsecured=0}={}){
 return seasonalCredit(f.draft(),f.e,{borrower,lender,days,principal,collateral,unsecured});
}
function zeroNoise(f){f.w.balance={...f.w.balance,credit:structuredClone(creditBalance)};f.w.balance.credit.params.find(r=>r.id==='seasonal.noisePermille').value=0;}

test('100 cash - 200 deposit liabilities * .2 = 60; issuing 30 reduces the next limit to30',async()=>{
 const f=fixture({coins:1000}),b=f.e.rules.economy.credit.banks[0];
 // Hand anchor: bank owns100 and owes200; the reserve is40, not a second purse.
 await f.act({operation:'deposit',seller:clerk,coins:201},'deposit-anchor');
 f.doc.state.records[b.id].coins=100;resyncBooks(f.e,f.doc);
 assert.equal(bankCredit(f.e,f.doc.state,b).loanable,60);
 const before=cash(f.doc),d=f.draft();
 const result=openLoan(d,f.e,{lender:clerk,bank:{...b,collateralRatio:0},keeper:clerk,principal:30,days:10,eventId:'liquidity'});d.done();
 assert.equal(result.principal,30);assert.equal(bankCredit(f.e,f.doc.state,b).loanable,30);assert.equal(cash(f.doc),before);
 assert.throws(()=>openLoan(f.draft(),f.e,{lender:clerk,bank:{...b,collateralRatio:0},principal:31,days:10,eventId:'over'}),/30铜/);
});

test('an older credit table keeps its overrides and reads missing seasonal parameters from installed defaults',()=>{
 const f=fixture();f.w.balance={credit:structuredClone(creditBalance)};
 f.w.balance.credit.params=f.w.balance.credit.params.filter(r=>!r.id.startsWith('seasonal.'));
 f.w.balance.credit.params.find(r=>r.id==='reserve.ratio').value=0.14;
 // Hand anchor: old charter override stays14%; the unchanged unknown-source
 // reputation line80 remains80 when a pre-seasonal credit@1 table is loaded.
 assert.equal(bankCredit(f.e,f.doc.state,f.e.rules.economy.credit.banks[0]).reserveRatio,0.14);
 assert.equal(quote(f,{unsecured:80}).capacity,80);
});

test('dated200 receipt supports100 after day10 but not before it; no future money enters cash',()=>{
 const f=fixture({coins:0});claim(f,{id:'harvest-sale',days:10});
 const before=cash(f.doc);disclose(f);
 // Hand anchor: due day5:0; due day10:200. The current purse stays0.
 const early=quote(f,{days:5}),late=quote(f,{days:10});
 assert.deepEqual([early.capacity,early.nextRepaymentAt],[0,f.doc.state.minute+10*DAY]);
 assert.equal(late.capacity,200);assert.equal(late.expected,200);assert.equal(cash(f.doc),before);assert.equal(f.doc.state.player.coins,0);
 assert.throws(()=>loanTerms(f.draft(),f.e,{lender:host,principal:100,days:5,collateralValue:0}),/晚于/);
 assert.equal(loanTerms(f.draft(),f.e,{lender:host,principal:100,days:10,collateralValue:0}).assessment.capacity,200);
});

test('a disclosed autumn receipt extends the short loan term without changing an existing signed debt',()=>{
 const f=fixture({coins:0});claim(f,{id:'autumn-sale',days:240});disclose(f);
 // Hand anchor:0 now +200 at day240 supports100 then, not the day180 deadline.
 assert.throws(()=>loanTerms(f.draft(),f.e,{lender:host,principal:100,days:180,collateralValue:0}),/晚于/);
 const q=loanTerms(f.draft(),f.e,{lender:host,principal:100,days:240,collateralValue:0});
 assert.equal(q.assessment.capacity,200);
 assert.throws(()=>loanTerms(f.draft(),f.e,{lender:host,principal:100,days:241,collateralValue:0}),/借期天数/);
 const before=cash(f.doc),d=f.draft(),loan=openLoan(d,f.e,{lender:host,principal:100,days:240,eventId:'seasonal-term'});d.done();
 assert.equal(loan.deadline,f.doc.state.minute+240*DAY);assert.equal(cash(f.doc),before);
 const terms=structuredClone(f.doc.state.records[loan.debt].signedTerms);
 f.doc.state.obligations['autumn-sale'].status='completed';disclose(f,'player',host,'no-more-source');
 assert.deepEqual(f.doc.state.records[loan.debt].signedTerms,terms);
 assert.equal(quote(f,{days:240}).capacity,0);
});

test('known senior claims reduce capacity once:200 - 150 =50; closing the claim releases it',()=>{
 const f=fixture({coins:0});claim(f,{id:'receipt'});claim(f,{id:'senior',debtor:'player',creditor:host,amount:150,kind:'loan',days:8});disclose(f);
 // Hand anchor: the lender knows the same150 through both its book and disclosure.
 assert.deepEqual([quote(f).prior,quote(f).capacity],[150,50]);
 f.doc.state.obligations.senior.status='completed';disclose(f,'player',host,'settled-statement');
 assert.equal(quote(f).capacity,200);
});

test('undisclosed wealth and debts do not alter another lender view; new disclosure does',()=>{
 const f=fixture({coins:0});
 // Hand anchor: absent a statement, the inherited trust line is80 in both worlds.
 assert.equal(quote(f,{unsecured:80}).capacity,80);
 f.doc.state.player.coins=9000;claim(f,{id:'hidden-debt',debtor:'player',creditor:worker,amount:8000,kind:'loan'});
 assert.equal(quote(f,{unsecured:80}).capacity,80);
 assert.equal(borrowerCashFlow(f.e,f.doc.state,'player',f.doc.state.minute,{observer:host,document:f.doc}).known,false);
 disclose(f);assert.equal(quote(f).capacity,1000);
 f.doc.state.player.coins=0;assert.equal(quote(f).capacity,1000,'received statement is a version, not a truth pointer');
 disclose(f,'player',host,'new-statement');assert.equal(quote(f).capacity,0);
});

test('a disclosed purse reads the one real account rather than a stale legacy projection',()=>{
 const f=fixture({coins:100});f.doc.ledger=openLedger(f.e,f.doc);f.doc.state.player.coins=0;
 // Hand anchor: ledger100 and stale projection0 still describe only100 real coins.
 assert.equal(disclose(f).cash,100);assert.equal(quote(f).capacity,100);
});

test('future tender-unit wages preserve their quantity and currency instead of inventing copper',()=>{
 const f=fixture({coins:0});claim(f,{id:'note-wage',resource:'coin_hw_note',amount:10});
 // Hand anchor: the statement still describes10 notes, with a separate integer
 // copper estimate. Neither notes nor copper have been delivered by preview.
 const flow=disclose(f),receipt=flow.future.find(r=>r.id==='note-wage');
 assert.equal(receipt.amount,10);assert.equal(receipt.resource,'coin_hw_note');assert.equal(receipt.copper,1000,'10 notes * published neutral counter rate100; catalogue paper12 is not currency value');
 assert.equal(f.doc.state.player.coins,0);assert.equal(f.doc.state.inventory.item_banknote_hw,undefined);
 f.doc.state.location='bld_hw_qingdeng';f.doc.state.npcs[host].location=f.doc.state.location;
 const unknown=disclose(f,'player',host,'remote-note-statement');
 assert.equal(unknown.future.find(r=>r.id==='note-wage').copper,0,'no remote issuer balance may supply an unknown quotation');
});

test('unknown repayment is bounded by own prior exposure; collateral100 recovers80, never cash',()=>{
 const f=fixture({coins:0});claim(f,{id:'prior-loan',debtor:'player',creditor:host,amount:60,kind:'loan'});
 // Hand anchor: reputation line100 - this lender own60 =40; collateral100*.8=80.
 assert.equal(quote(f,{unsecured:100}).capacity,40);
 const before=cash(f.doc),q=quote(f,{unsecured:100,collateral:100});
 assert.equal(q.capacity,80);assert.equal(q.recoverable,80);assert.equal(cash(f.doc),before);
});

test('a private lender reserves its own payable commitments before using its cash share',()=>{
 const f=fixture({coins:1000});
 claim(f,{id:'lender-payable',debtor:host,creditor:worker,amount:480,kind:'loan',days:1});
 // Hand anchor: lender500 - committed480 =20, below its ordinary cash share.
 assert.throws(()=>loanTerms(f.draft(),f.e,{lender:host,principal:21,days:10,collateralValue:0}),/20铜/);
 assert.equal(loanTerms(f.draft(),f.e,{lender:host,principal:20,days:10,collateralValue:0}).assessment.capacity>=20,true);
});

test('own growing crop uses K02 yield/date and known price; lending risk changes with persistent risk aversion',()=>{
 const f=fixture({coins:0});zeroNoise(f);
 const binding=f.w.domainRules.privateField.crops[0],location='bld_hw_qingdeng';
 f.doc.state.location=location;f.doc.state.npcs[host].location=location;
 f.doc.state.buildings[location]={...f.doc.state.buildings[location],owner:'player',condition:100};
 f.doc.state.records.crop={id:'crop',category:'private_farm',owner:'player',location,settlement:'loc_hw',crop:binding.product,seedItem:binding.seed,areaMu:1,grownDays:1,qualitySum:1,qualityDays:1,status:'growing'};
 const flow=disclose(f),crop=flow.future.find(r=>r.source==='harvest');
 assert.ok(crop.copper>0);assert.equal(crop.at,f.doc.state.minute+(f.e.rules.agriculture.crop.growthDays-1)*DAY);
 // Hand anchor: a neutral lender recovers floor(cropValue*.7); aversion2 halves it.
 f.w.npcs.find(n=>n.id===host).personality={riskAversion:1};
 const days=Math.ceil((crop.at-f.doc.state.minute)/DAY);
 assert.equal(quote(f,{days}).expected,Math.floor(crop.copper*700/1000));
 f.w.npcs.find(n=>n.id===host).personality.riskAversion=2;
 assert.equal(quote(f,{days}).expected,Math.floor(crop.copper*350/1000));
 assert.equal(f.doc.state.player.coins,0);
 // A new world with an unobserved distant field must not reveal its yield.
 f.doc.state.location='bld_hw_post';
 assert.equal(borrowerCashFlow(f.e,f.doc.state,'player',f.doc.state.minute,{document:f.doc}).future.some(r=>r.source==='harvest'),false);
});

test('funding candidate is conditional, then real consent and transfer create one debt with conserved cash',()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;resyncBooks(f.e,f.doc);
 // Unlike the legacy quote-only fixture, settlement requires the real books.
 f.doc.ledger=openLedger(f.e,f.doc);
 // These two NPCs speak common; the absent player speaks coast. NPC consent
 // must use their actual shared language rather than require the player's.
 f.doc.state.player.spokenLanguages=['lang:coast'];
 f.doc.state.location='bld_hw_qingdeng';
 claim(f,{id:'household-bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});
 claim(f,{id:'household-wage',creditor:host,amount:200,days:10});
 const view=subjectiveView(f.e,f.doc,host),before=cash(f.doc),balance=f.doc.state.npcs[host].coins;
 const choices=householdFundingCandidates(f.e,view,f.doc),choice=choices.find(c=>c.legacy.seller===clerk);
 // Hand anchor:0 cash - bill50 before wage200 => request50, repay at day10.
 assert.ok(choice);assert.equal(choice.legacy.principal,50);assert.equal(choice.legacy.days,10);assert.equal(choice.fundingOffer.amount,50);
 assert.equal(choice.fundingOffer.at,f.doc.state.minute+5);
 assert.ok(autonomyCandidates(f.e,view,{document:f.doc}).some(c=>c.id===choice.id));
 assert.equal(f.doc.state.npcs[host].coins,balance);assert.equal(cash(f.doc),before);
 const kind=autonomyKind('household_credit'),d=f.draft();kind.validate(d,f.e,host,choice.legacy);kind.execute(d,f.e,host,choice.legacy,{actionId:'household-native'});d.done();
 assert.equal(f.doc.state.npcs[host].coins,50);assert.equal(f.doc.state.npcs[clerk].coins,450);assert.equal(cash(f.doc),before);
 assert.ok(f.doc.state.records['debt_loan_household-native']);
 assert.equal(f.doc.state.records['debt_loan_household-native'].location,f.doc.state.npcs[host].location);
 assert.ok(f.doc.state.consentEvents.some(r=>r.from===clerk&&r.to===host&&r.scope==='loan'));
 assert.ok(f.doc.state.consentEvents.some(r=>r.from===host&&r.to===clerk&&r.scope==='loan'));
 const debt=f.doc.state.records['debt_loan_household-native'];
 // Hand anchor: the original50 stays in the purse; lend another earned200
 // from a real payer, then the due NPC-to-NPC settlement returns50+interest.
 const paid=f.draft();
 paid.set(['state','minute'],debt.deadline);
 settleFinancialClaim(paid,f.e,{claim:'household-wage',payer:worker,actor:worker,amount:200},'earned-wage');paid.done();
 const funded=cash(f.doc);f.tick(debt.deadline);
 assert.equal(f.doc.state.records['debt_loan_household-native'].status,'已还清');
 assert.equal(f.doc.state.npcs[clerk].coins,500+debt.interest);assert.equal(cash(f.doc),funded);
 const balances=[f.doc.state.npcs[host].coins,f.doc.state.npcs[clerk].coins];f.tick(debt.deadline);
 assert.deepEqual([f.doc.state.npcs[host].coins,f.doc.state.npcs[clerk].coins],balances);
});

test('funding execution rejects vanished liquidity, absence or refusal without delivering a principal',()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;
 claim(f,{id:'bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});claim(f,{id:'wage',creditor:host});
 const choice=householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc).find(c=>c.legacy.seller===clerk),kind=autonomyKind('household_credit');
 // Hand anchor: offer50 is a request only; a lender purse0 can deliver0.
 f.doc.state.npcs[clerk].coins=0;
 assert.throws(()=>kind.execute(f.draft(),f.e,host,choice.legacy,{actionId:'empty'}),/至多能借出0/);assert.equal(f.doc.state.npcs[host].coins,0);
 f.doc.state.npcs[clerk].coins=500;f.doc.state.npcs[clerk].location='bld_hw_qingdeng';
 assert.throws(()=>kind.validate(f.draft(),f.e,host,choice.legacy),/实际在场/);
 f.doc.state.npcs[clerk].location=f.doc.state.npcs[host].location;f.w.npcs.find(n=>n.id===clerk).redLines=['loan'];
 assert.throws(()=>kind.execute(f.draft(),f.e,host,choice.legacy,{actionId:'refuse'}),/未同意/);assert.equal(f.doc.state.npcs[host].coins,0);
});

test('a household tender-unit loan binds consent to actual units and repays through the existing conversion interface',()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;
 f.w.rules.law.codes.find(c=>c.id==='law_hw_property').recognition.legalTender.unit='coin_hw_note';
 f.w.currencyRules.currencies.find(c=>c.resource==='coin_hw_note').money.backedBy.ratio=10;
 f.doc.state.npcs[clerk].inventory.item_banknote_hw={quantity:20};f.doc.ledger=openLedger(f.e,f.doc);
 claim(f,{id:'tender-bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});claim(f,{id:'tender-wage',creditor:host});
 const action=householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc).find(c=>c.legacy.seller===clerk).legacy;
 const before=cash(f.doc),d=f.draft();autonomyKind('household_credit').execute(d,f.e,host,action,{actionId:'tender-household'});d.done();
 const debt=f.doc.state.records['debt_loan_tender-household'];
 // Hand anchor:50 reference copper /10 =5 actual notes. Whole-unit interest
 // is1 note, not1 copper; the agreements name the5-note principal explicitly.
 assert.equal(debt.principal,5);assert.equal(debt.interest,1);assert.equal(debt.resource,'coin_hw_note');
 assert.equal(f.doc.state.npcs[host].coins,0);assert.equal(f.doc.state.npcs[host].inventory.item_banknote_hw.quantity,5);
 assert.equal(f.doc.state.npcs[clerk].inventory.item_banknote_hw.quantity,15);assert.equal(cash(f.doc),before);
 for(const person of [host,clerk]){
  const agreement=f.doc.state.consentEvents.find(r=>r.from===person&&r.scope==='loan');
  assert.deepEqual(agreement.terms,{principal:5,days:10,interest:1,item:'item_banknote_hw',quantity:5});
 }
 const pay=f.draft();pay.set(['state','minute'],debt.deadline);
 settleFinancialClaim(pay,f.e,{claim:'tender-wage',payer:worker,actor:worker,amount:200},'tender-earned');
 settleFinancialClaim(pay,f.e,{claim:debt.obligation,payer:host,actor:host,amount:6,payWith:'coin_river'},'tender-repaid');pay.done();
 assert.equal(f.doc.state.npcs[host].coins,140);assert.equal(f.doc.state.npcs[clerk].coins,560);
 assert.equal(cash(f.doc),before);assert.equal(obligationView(f.doc.state,debt.obligation).owed,0);
});

test('a capped household loan preserves the existing protocol projection and cannot pay or forecast beyond it',()=>{
 for(const cap of [0,20]){
 const f=fixture();f.doc.state.npcs[host].coins=0;f.doc.ledger=openLedger(f.e,f.doc);
 claim(f,{id:'cap-bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});claim(f,{id:'cap-wage',creditor:host});
 const action=householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc).find(c=>c.legacy.seller===clerk).legacy;
 const d=f.draft();autonomyKind('household_credit').execute(d,f.e,host,action,{actionId:'capped-household'});d.done();
 const debt=f.doc.state.records['debt_loan_capped-household'];
 // transition.syncRecordedClaims projects amount=paid+remaining and retains
 // contractualAmount. Match both sides of that existing protocol; changing
 // only the canonical cap would manufacture an inconsistent legacy fixture.
 const canonical=f.doc.state.obligations[debt.obligation];
 canonical.terms.liabilityCap=cap;canonical.remaining=cap;
 f.doc.state.records['debt_loan_capped-household']={...debt,amount:cap,contractualAmount:debt.amount};
 const plan=borrowerCashFlow(f.e,f.doc.state,clerk,f.doc.state.minute,{document:f.doc});
 assert.equal(plan.future.find(r=>r.id===debt.obligation)?.amount??0,cap);
 // Hand anchor:50 was delivered, only20 is enforceable: borrower30/lender470.
 const before=cash(f.doc);f.tick(debt.deadline);
 assert.equal(f.doc.state.npcs[host].coins,50-cap);assert.equal(f.doc.state.npcs[clerk].coins,450+cap);assert.equal(cash(f.doc),before);
 if(cap>0)assert.equal(f.doc.state.records['debt_loan_capped-household'].status,'已还清');
 else assert.equal(obligationView(f.doc.state,debt.obligation).owed,0,'zero liability is not a fabricated repayment');
 assert.equal(f.doc.state.records['debt_loan_capped-household'].paid,cap);
 assert.equal(f.doc.state.records['debt_loan_capped-household'].defaulted,undefined);
 f.tick(debt.deadline);assert.equal(f.doc.state.npcs[clerk].coins,450+cap);
 }
});

test('an inherited household loan retains the player heir choice to repay instead of auto-debiting the player',async()=>{
 const f=fixture();f.doc=f.e.createCharacter(seed,{},'household-succession');
 f.doc.state.minute=600;f.doc.state.location=post;f.doc.state.player.coins=3000;
 for(const who of [host,worker,clerk])Object.assign(f.doc.state.npcs[who],{location:post,status:'正常',activity:'休息',coins:500,goals:{},memoryStream:[]});
 f.doc.state.npcs[host].coins=0;f.doc.state.npcs[host].inventory={};f.doc.ledger=openLedger(f.e,f.doc);
 claim(f,{id:'heir-bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});claim(f,{id:'heir-wage',creditor:host});
 const action=householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc).find(c=>c.legacy.seller===clerk).legacy;
 const d=f.draft();autonomyKind('household_credit').execute(d,f.e,host,action,{actionId:'heir-household'});
 settleFinancialClaim(d,f.e,{claim:'heir-wage',payer:worker,actor:worker,amount:200},'heir-earned');
 const gone=transition(d,f.e,{entity:host,basis:'death',origin:'death_rule',successors:['player']});advanceProcedure(d,f.e,gone.successor);d.done();
 const key='debt_loan_heir-household',loan=f.doc.state.records[key];assert.equal(loan.debtor,'player');
 const before=f.doc.state.player.coins,check=f.draft();check.set(['state','minute'],loan.deadline);advanceBankFinance(check,f.e,loan.deadline);check.done();
 // Hand anchor: inheritance grants no new spending authority. Waiting at the
 // due time debits0; the player's later explicit10-copper payment debits10.
 assert.equal(f.doc.state.player.coins,before);assert.ok(obligationView(f.doc.state,loan.obligation).owed>=10);
 await f.act({seller:clerk,payment:'repay',debt:key,coins:10},'heir-chooses');
 assert.equal(f.doc.state.player.coins,before-10);
});

test('a creditor waived household loan keeps its real gift and cannot be repaid or defaulted again',()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;f.doc.ledger=openLedger(f.e,f.doc);
 claim(f,{id:'waiver-bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});claim(f,{id:'waiver-wage',creditor:host});
 const action=householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc).find(c=>c.legacy.seller===clerk).legacy;
 const d=f.draft();autonomyKind('household_credit').execute(d,f.e,host,action,{actionId:'waived-household'});
 const key='debt_loan_waived-household',loan=d.get('state','records',key);
 closeObligation(d,f.e,{id:loan.obligation,actor:clerk,party:clerk,reason:'creditor_waiver'},'actual-creditor-waiver');d.done();
 // Hand anchor: the lender already gave50 and waived its claim: cash remains
 // borrower50/lender450, with0 enforceable debt even after maturity+grace.
 const total=cash(f.doc);f.tick(loan.deadline+2*DAY);
 assert.equal(f.doc.state.npcs[host].coins,50);assert.equal(f.doc.state.npcs[clerk].coins,450);assert.equal(cash(f.doc),total);
 assert.equal(obligationView(f.doc.state,loan.obligation).owed,0);
 assert.equal(f.doc.state.records[key].status,'已取消');assert.equal(f.doc.state.records[key].defaulted,undefined);
 f.tick(loan.deadline+2*DAY);assert.equal(f.doc.state.npcs[clerk].coins,450);
});

test('food shortfall can request funding before any debt exists, without inventing food or cash',()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;f.doc.state.npcs[host].inventory={item_bread:{quantity:0}};
 claim(f,{id:'food-wage',creditor:host,amount:10000,days:10});
 // Hand anchor: no cash/food today and positive dated wages can justify a
 // request. Neither a debt nor a food purchase is created by the preview.
 const before=JSON.stringify(f.doc),choices=householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc);
 assert.ok(choices.length);assert.ok(choices.every(c=>c.legacy.principal>0&&c.conditional));
 assert.equal(JSON.stringify(f.doc),before);
});

test('a five-minute request cannot claim to bridge a bill due in two minutes',()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;
 claim(f,{id:'urgent-bill',debtor:host,creditor:worker,amount:50,days:2/DAY,kind:'loan'});claim(f,{id:'later-wage',creditor:host});
 // Hand anchor: available at minute605 is later than the known gap at602.
 assert.deepEqual(householdFundingCandidates(f.e,subjectiveView(f.e,f.doc,host),f.doc),[]);
});

test('world time consumes a household funding candidate through the normal autonomy pipeline',async()=>{
 const f=fixture();f.doc.state.npcs[host].coins=0;resyncBooks(f.e,f.doc);
 // The existing daily autonomy consumer acts offscreen; same-place actors
 // are intentionally reserved for the player's immediate interactions.
 f.doc.state.location='bld_hw_qingdeng';
 claim(f,{id:'autonomy-bill',debtor:host,creditor:worker,amount:50,days:1,kind:'loan'});
 claim(f,{id:'autonomy-wage',creditor:host,amount:200,days:10});
 // Hand anchor: advancing may finish a real request50; no candidate is a grant.
 await f.act({minutes:30},'funding-clock','world_time');
 const loan=Object.values(f.doc.state.records).find(r=>r.kind==='loan'&&r.debtor===host&&r.principal===50);
 assert.ok(loan,'the registered autonomy consumer must actually reach lending');
 assert.ok(loan.createdAt>=605,'the normal pipeline must spend the five-minute request window');
 assert.equal(loan.amount,loan.principal+loan.interest);
 assert.ok(f.doc.state.consentEvents.some(r=>r.from===loan.creditor&&r.to===host));
 assert.ok(f.doc.state.obligations[loan.obligation]);
});

test('previews and serialization reuse the same seeded seasonal judgment',()=>{
 const f=fixture({coins:0});claim(f,{id:'sale',kind:'forward'});disclose(f);
 // Hand anchor: exact same plan/seed/window must yield the same full assessment.
 const a=quote(f),before=JSON.stringify(f.doc);quote(f,{days:5});assert.deepEqual(quote(f),a);assert.equal(JSON.stringify(f.doc),before);
 f.doc=JSON.parse(before);assert.deepEqual(quote(f),a);
 const choices=new Set();for(let seed=0;seed<20;seed++){f.doc.randomSeed=`seasonal:${seed}`;choices.add(quote(f).expected);}
 assert.ok(choices.size>1,'nearby judgments may differ across seeds; no distribution quota is imposed');
});
