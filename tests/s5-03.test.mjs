import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {bankCredit,interestRate,depositRate,regionalCredit,advanceBankFinance,pawnForActor,derivedBankAt} from '../server-plugin/finance-bank.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {nativeDeposit,creditCall} from './helpers/credit-actions.mjs';
import {obligationRows,obligationView,accruedInterest} from '../server-plugin/obligation-state.mjs';
import {currencyValue,exchangeRate,currencyPurchasingPower,issuedCurrency,currencyReserve} from '../server-plugin/currency.mjs';
import {netAssets} from '../server-plugin/finance-assets.mjs';
import {openLoan} from '../server-plugin/credit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const keeper='npc_hw_shendu',post='bld_hw_post',bankId='bank_hw_post';
function fixture(w=world){
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s503-credit');
 // Opening cash, collateral and the business window are not examined here.
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:post,coins:3000,inventory:{item_wood:100}});
 assert.deepEqual(prepared.setupUnmet,[]);let document=prepared.document;
 return {engine,get document(){return document;},replace(d){document=d;},bank:engine.rules.economy.credit.banks[0],
  async act(args,id){const out=await engine.reduce(document,{tool:'world_trade',args:{seller:keeper,...args},eventId:id});document=applyPatches(document,out.patches);return out.result;}};
}
const clean=f=>assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
async function exchange(f,slots,id){
 const out=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:trade.exchange',slots:{seller:keeper,...slots}},eventId:id});
 assert.notEqual(out.result.receipt.status,'rejected',JSON.stringify(out.result));f.replace(applyPatches(f.document,out.patches));return out.result;
}

test('metal content exchange and backed credit use the native counter with independent integer anchors',async()=>{
 const f=fixture(),before=f.document.state.player.coins;
 // Same copper and5g weight; civic fineness.9 => .9 river/coin.
 // ceil(10*.9*1.03)=10 paid; floor(10*.9*.97)=8 returned.
 const bought=await exchange(f,{item:'item_coin_civic',quantity:10,buyer:'player'},'currency-metal-buy');
 assert.equal(bought.paid,10);assert.equal(bought.pricing.from.branch,'metal');
 const sold=await exchange(f,{item:'item_coin_civic',quantity:10},'currency-metal-sell');assert.equal(sold.received,8);
 assert.equal(f.document.state.player.coins,before-2);
 // No recorded goods turnover yet: approved neutral bootstrap. A new note
 // promises100 river; ten cost ceil(10*100*1.03)=1030, not ten free loans.
 const paper=await exchange(f,{item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'currency-credit-issue');
 assert.equal(paper.paid,1030);assert.equal(paper.issued,10);assert.equal(paper.pricing.from.branch,'credit');
 assert.equal(issuedCurrency(f.engine,f.document.state,'coin_hw_note').issued,10);
 const redeemed=await exchange(f,{item:'item_banknote_hw',quantity:1,mode:'redeem'},'currency-credit-redeem');
 // Actual promised100 less3% counter fee=97; one issued unit is destroyed.
 assert.equal(redeemed.received,97);assert.equal(issuedCurrency(f.engine,f.document.state,'coin_hw_note').redeemed,1);
 assert.equal(f.document.state.inventory.item_banknote_hw.quantity,9);
 const view=currencyValue(f.engine.primitiveDraft(f.document),f.engine,{currency:'coin_hw_note'});assert.equal(view.explanation.reserve.outstanding,9);
 assert.throws(()=>currencyValue(f.engine.primitiveDraft(f.document),f.engine,{currency:'coin_hw_note',location:'loc_bs'}),/不接受/);
 clean(f);
 // Exact settlement matters when the bill is an integer: no fee and ten
 // copper coins at4.5g/5g must cost exactly9, never ceil(9+floating noise)=10.
 const noFeeWorld=structuredClone(world);noFeeWorld.rules.economy.credit.banks[0].exchangeFeeRate=0;
 const noFee=fixture(noFeeWorld),exact=await exchange(noFee,{item:'item_coin_civic',quantity:10,buyer:'player'},'currency-exact-nine');
 assert.equal(exact.paid,9);assert.equal(noFee.document.state.player.coins,2991);clean(noFee);
 // The registered S5-01 coin-credit slot is a real price input. An author
 // factor.5 gives market value50, but D15 §15.3 backedBy promises100:
 // new issuance costs ceil(2*100*1.03)=206 regardless of market credit.
 const discountedWorld=structuredClone(world);discountedWorld.derived.modifiers.push({id:'note-credit-half',pack:'credit',target:'economy:coinCredit',stage:'mul',value:0.5,when:"subject == 'item_banknote_hw'"});
 const discounted=fixture(discountedWorld),lower=await exchange(discounted,{item:'item_banknote_hw',quantity:2,buyer:'player',mode:'issue'},'currency-credit-factor');
 assert.equal(lower.paid,206);assert.equal(lower.pricing.from.explanation.credit.value,0.5);assert.equal(lower.pricing.from.value/lower.pricing.from.explanation.peg,0.5);clean(discounted);
});

test('real goods turnover and native issuance explain dilution; unaffordable issuance is atomic',async t=>{
 const f=fixture(),host='npc_hw_linsui';
 // Shelf stock, host cash and travel are outside the examined currency rule.
 const setup=applyIntentSetup(f.engine,f.document,{location:'bld_hw_qingdeng',facts:[
  {path:['state','npcs',host,'inventory'],value:{item_bread:{quantity:100,quality:'木'}}},
  {path:['state','npcs',host,'coins'],value:1000}
 ]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 // Bread2 * scarcity floor.5 * markup1 =1 each; ten remain below
 // the depth limit and the entire integrated curve is clamped at.5: cost10.
 const goods=await f.act({seller:host,item:'item_bread',quantity:10},'currency-real-turnover');assert.equal(goods.cost,10);
 const move=await f.engine.reduce(f.document,{tool:'world_move',args:{destination:post},eventId:'currency-return-counter'});f.replace(applyPatches(f.document,move.patches));
 const first=await exchange(f,{item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'dilution-first');assert.equal(first.paid,1030);
 let d=f.engine.primitiveDraft(f.document),q=exchangeRate(d,f.engine,{from:'coin_hw_note'}),power=currencyPurchasingPower(d,f.engine,{currency:'coin_hw_note'});
 // Turnover10 copper / face100=.1 note-equivalent; active10 notes:
 // abundance.1/10=.01 => 100*.01=1 river per note (confidence1).
 assert.equal(q.from.explanation.turnoverCopper,10);assert.equal(q.from.explanation.active,10);assert.equal(q.from.explanation.abundance,0.01);
 assert.ok(Math.abs(q.rate-1)<1e-12);
 // D15 §15.3: dilution changes third-party value, never the issuer's face price.
 const second=await exchange(f,{item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'dilution-second');assert.equal(second.paid,1030);
 d=f.engine.primitiveDraft(f.document);q=exchangeRate(d,f.engine,{from:'coin_hw_note'});
 // Same actual turnover, twenty notes: abundance.005 => rate.5.
 assert.equal(q.from.explanation.active,20);assert.equal(q.from.explanation.abundance,0.005);assert.ok(Math.abs(q.rate-0.5)<1e-12);
 const afterPower=currencyPurchasingPower(d,f.engine,{currency:'coin_hw_note'});
 assert.ok(Math.abs(afterPower.realValue/power.realValue-0.5)<1e-12);
 // Vault1500 + two face-price issues1030 each =3560; reserve20*100*.2=400.
 assert.equal(f.document.state.records[bankId].coins,3560);assert.equal(bankCredit(f.engine,f.document.state,f.bank).reserve,400);
 // Face issuance itself funds the new reserve. Unlike the former discounted
 // sale, this oversized order now fails cash first (1000*100*1.03=103000).
 // Preserve the rejected transaction and complete zero-write assertion.
 const before=structuredClone(f.document);
 const rejected=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:trade.exchange',slots:{seller:keeper,item:'item_banknote_hw',quantity:1000,buyer:'player',mode:'issue'}},eventId:'dilution-over-reserve'});
 assert.equal(rejected.result.receipt.status,'rejected');assert.deepEqual(applyPatches(f.document,rejected.patches),before);
 assert.equal(issuedCurrency(f.engine,f.document.state,'coin_hw_note').issued,20);clean(f);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'s503-currency-save-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(document,input)=>f.engine.reduce(document,input),store=new CampaignStorage(root,{reducer});
 await store.create({id:'currency',worldVersion:world.version,document:f.document});
 const reopened=await new CampaignStorage(root,{reducer}).read('currency');assert.deepEqual(reopened.document,f.document);f.replace(reopened.document);
 assert.ok(Math.abs(exchangeRate(f.engine.primitiveDraft(f.document),f.engine,{from:'coin_hw_note'}).rate-0.5)<1e-12);
 // Other travel/merchant availability is a declared premise, while the
 // twenty notes still come from the two real issues above. A normal trader
 // cannot buy unrecognized paper at its material catalog price as money.
 const outside=applyIntentSetup(f.engine,f.document,{minute:600,location:'loc_bs',present:['npc_hw_yanzhe']});assert.deepEqual(outside.setupUnmet,[]);f.replace(outside.document);
 const refused=structuredClone(f.document);
 await assert.rejects(f.act({seller:'player',buyer:'npc_hw_yanzhe',item:'item_banknote_hw',quantity:4},'unrecognized-credit-tender'),/不接受/);
 assert.deepEqual(f.document,refused);assert.equal(f.document.state.inventory.item_banknote_hw.quantity,20);clean(f);
 // Mechanism anchor after dilution: two issues cost2060, face redemption
 // returns floor(20*100*.97)=1940. The full round trip loses120, never gains.
 const back=applyIntentSetup(f.engine,f.document,{minute:600,location:post});assert.deepEqual(back.setupUnmet,[]);f.replace(back.document);
 const redeemed=await exchange(f,{item:'item_banknote_hw',quantity:20,mode:'redeem'},'dilution-round-trip');
 assert.equal(redeemed.received,1940);assert.equal(first.paid+second.paid-redeemed.received,120);
 assert.equal(f.document.state.player.coins,2870);assert.equal(issuedCurrency(f.engine,f.document.state,'coin_hw_note').redeemed,20);clean(f);
});

test('face issuance and redemption remain possible at zero market confidence and never earn cash',async()=>{
 for(const fee of [0,0.03]){
  const w=structuredClone(world);w.rules.economy.credit.banks[0].exchangeFeeRate=fee;
  const f=fixture(w);
  await exchange(f,{item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'zero-market-opening');
  await f.act({operation:'deposit',coins:1001},'zero-market-deposit');
  // A depleted vault has cash1000 and owes deposits1000: note confidence0.
  const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:1000}]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
  const before=f.document.state.player.coins;
  const issued=await exchange(f,{item:'item_banknote_hw',quantity:1,buyer:'player',mode:'issue'},'zero-market-issue');
  // Face100, one unit: no fee pays/returns100; 3% pays103/returns97.
  assert.equal(issued.paid,fee?103:100);assert.equal(issued.pricing.from.value,0);
  const redeemed=await exchange(f,{item:'item_banknote_hw',quantity:1,mode:'redeem'},'zero-market-redeem');
  assert.equal(redeemed.received,fee?97:100);assert.equal(f.document.state.player.coins,before-(fee?6:0));
  assert.equal(f.document.state.records[bankId].coins,1000+(fee?6:0));clean(f);
 }
});

test('uncashed bills and subsequent clearing protect the same reserve exactly once',async()=>{
 const f=fixture(),destination=derivedBankAt(f.engine,f.document.state,'loc_bs');assert.ok(destination);
 const remit=await f.act({operation:'remit',coins:100,location:destination.location,buyer:'npc_hw_ayan'},'reserve-bill');
 // Source1500+100+fee2=1602; one bill100 (including its named payable),
 // reserve100*.2=20, loanable1582. Never count the beneficiary claim twice.
 let credit=bankCredit(f.engine,f.document.state,f.bank);
 assert.equal(credit.cash,1602);assert.equal(credit.liabilities,100);assert.equal(credit.reserve,20);assert.equal(credit.loanable,1582);
 const scene=applyIntentSetup(f.engine,f.document,{minute:600,location:destination.location,present:[destination.keepers[0],'npc_hw_ayan']});assert.deepEqual(scene.setupUnmet,[]);f.replace(scene.document);
 await f.act({operation:'deposit',seller:destination.keepers[0],coins:201},'reserve-bill-fund');
 await f.act({operation:'cash_bill',seller:destination.keepers[0],contract:remit.contract},'reserve-bill-cash');
 credit=bankCredit(f.engine,f.document.state,f.bank);
 // Cashed bill0 + unpaid interbank clearing100 = unchanged liability100.
 assert.equal(credit.liabilities,100);assert.equal(credit.reserve,20);assert.equal(credit.loanable,1582);clean(f);
});

test('NPC pawn rate follows the owner default history rather than the player history',async()=>{
 const f=fixture(),owner='npc_hw_linsui';
 const setup=applyIntentSetup(f.engine,f.document,{present:[owner],facts:[{path:['state','npcs',owner,'inventory'],value:{item_bread:{quantity:30}}}]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 let draft=f.engine.primitiveDraft(f.document);
 const old=openLoan(draft,f.engine,{lender:keeper,keeper,bank:f.bank,principal:10,days:1,collateral:{item:'item_bread',quantity:10},debtor:owner,eventId:'old-owner-loan'});
 f.replace(applyPatches(f.document,draft.patches));
 // A signed historical default is outside the examined pricing mechanism.
 // Use the setup writer on the actual loan and its canonical projection.
 const legacy=f.document.state.records[old.debt],claim=f.document.state.obligations[legacy.obligation];
 const history=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','records',old.debt],value:{...legacy,defaulted:{minute:0}}},
  {path:['state','obligations',claim.id],value:{...claim,defaulted:{minute:0}}}
 ]});assert.deepEqual(history.setupUnmet,[]);f.replace(history.document);
 const before=structuredClone(f.document);
 draft=f.engine.primitiveDraft(before);
 const npc=pawnForActor(draft,f.engine,{actor:owner,owner,keeper,bank:bankId,item:'item_bread',quantity:10,coins:10,days:1,consent:true},'owner-rate-pawn');
 // Cash1490, recent principal10, prospective10: .015*(1+20/1490).
 // One owner default multiplies by2; the player has no default.
 assert.equal(npc.monthlyInterest,0.015*(1+20/1490)*2);
 const player=await f.act({operation:'pawn',item:'item_wood',quantity:10,coins:10,days:1},'player-rate-pawn');
 assert.equal(player.monthlyInterest,0.015*(1+20/1490));assert.equal(npc.monthlyInterest,player.monthlyInterest*2);
 clean(f);f.replace(applyPatches(before,draft.patches));clean(f);
});

test('note backing excludes deposit liabilities but face redemption uses actual cash',async()=>{
 const f=fixture();await exchange(f,{item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'backing-issue');
 await f.act({operation:'deposit',coins:1001},'backing-deposit');
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:1100}]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 // Vault1100 less deposits1000 leaves100 for notes1000: ratio.1,
 // confidence .1/.2=.5. Depositors' cash is not pledged a second time.
 const reserve=currencyReserve(f.engine,f.document.state,'coin_hw_note');
 assert.equal(reserve.reserve,100);assert.equal(reserve.ratio,0.1);assert.equal(reserve.confidence,0.5);
 const depleted=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:1000}]});assert.deepEqual(depleted.setupUnmet,[]);f.replace(depleted.document);
 assert.equal(currencyReserve(f.engine,f.document.state,'coin_hw_note').confidence,0);
 assert.equal((await exchange(f,{item:'item_banknote_hw',quantity:1,mode:'redeem'},'backing-redeem')).received,97);clean(f);
});

test('automatic withdrawal bypasses unavailable originals but explicit claims still require them',async()=>{
 const engine=new WorldEngine(world),f=await nativeDeposit(engine,engine.createCharacter(seed,{},'available-deposit'));
 const paper=structuredClone(f.document.state.itemInstances[f.paper]);paper.durability=0;
 const setup=applyIntentSetup(engine,f.document,{coins:101,facts:[{path:['state','itemInstances',f.paper],value:paper}]});assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
 const second=await creditCall(f,{operation:'deposit',coins:101},'available-second');
 const before=structuredClone(f.document);
 await assert.rejects(creditCall(f,{operation:'withdraw',coins:1,debt:f.claim},'explicit-broken'));assert.deepEqual(f.document,before);
 await assert.rejects(creditCall(f,{operation:'withdraw',coins:101},'not-enough-available'));assert.deepEqual(f.document,before);
 assert.equal((await creditCall(f,{operation:'withdraw',coins:100},'available-withdraw')).withdrawn,100);
 assert.equal(obligationView(f.document.state,f.claim).owed,100);assert.equal(obligationView(f.document.state,second.claim).owed,0);clean(f);
});

test('issued note reserves protect lending but redeem until actual cash is exhausted, then replenish',async()=>{
 const f=fixture();await exchange(f,{item:'item_banknote_hw',quantity:10,buyer:'player',mode:'issue'},'liquidity-issue');
 // Vault depletion is unrelated to the redemption mechanism. Issued10 at
 // face100 and reserve.2 protect200; none of that200 may be lent away.
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:200}]});assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 assert.equal(bankCredit(f.engine,f.document.state,f.bank).reserve,200);assert.equal(bankCredit(f.engine,f.document.state,f.bank).loanable,0);
 let before=structuredClone(f.document);await assert.rejects(f.act({operation:'borrow',coins:1,days:10,item:'item_wood',quantity:100},'issue-reserve-loan'));assert.deepEqual(f.document,before);
 // Each note actually pays100 less fee3=97: 200-97-97=6.
 assert.equal((await exchange(f,{item:'item_banknote_hw',quantity:1,mode:'redeem'},'liquidity-redeem-1')).received,97);
 assert.equal((await exchange(f,{item:'item_banknote_hw',quantity:1,mode:'redeem'},'liquidity-redeem-2')).received,97);
 assert.equal(f.document.state.records[bankId].coins,6);assert.equal(f.document.state.inventory.item_banknote_hw.quantity,8);
 before=structuredClone(f.document);
 const failed=await f.engine.reduce(f.document,{tool:'world_act',args:{action:'core:trade.exchange',slots:{seller:keeper,item:'item_banknote_hw',quantity:1,mode:'redeem'}},eventId:'liquidity-no-cash'});
 assert.equal(failed.result.receipt.status,'rejected');assert.deepEqual(applyPatches(f.document,failed.patches),before);
 await f.act({operation:'deposit',coins:101},'liquidity-refill');
 assert.equal((await exchange(f,{item:'item_banknote_hw',quantity:1,mode:'redeem'},'liquidity-resume')).received,97);
 // 6+101-97=10 vault; issued10-redeemed3=7 physical notes remain.
 assert.equal(f.document.state.records[bankId].coins,10);assert.equal(f.document.state.records[bankId].accounts.player,100);
 assert.equal(issuedCurrency(f.engine,f.document.state,'coin_hw_note').redeemed,3);assert.equal(f.document.state.inventory.item_banknote_hw.quantity,7);clean(f);
 // Zero issuer cash is a declared failure premise. A worthless monetary
 // holding has value0; it must not make ordinary asset queries throw.
 const empty=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:0}]});assert.deepEqual(empty.setupUnmet,[]);f.replace(empty.document);
 assert.equal(currencyValue(f.engine.primitiveDraft(f.document),f.engine,{currency:'coin_hw_note'}).value,0);
 // 3000-1030+97+97-101+97=2160 actual cash, irrespective of the paper.
 assert.equal(f.document.state.player.coins,2160);assert.ok(Number.isFinite(netAssets(f.engine.primitiveDraft(f.document),f.engine,'player')));clean(f);
});

test('day and anchor share the signed bank basis; changing author terms does not rewrite an existing claim',async()=>{
 const w=structuredClone(world);w.rules.economy.credit.banks[0].rateTerms={per:'day',base:0.001,minRate:0.001,maxRate:0.001};
 const f=fixture(w),deposit=await f.act({operation:'deposit',coins:1001},'day-deposit');
 const loan=await f.act({operation:'borrow',coins:300,days:10,item:'item_wood',quantity:100},'day-loan');
 // .001 per day ×300 ×10 days =3; five days earns1.5 -> ceil2.
 assert.equal(loan.interest,3);assert.equal(loan.per,'day');
 const row=f.document.state.records[loan.debt];assert.equal(row.terms.rateTerms.per,'day');
 assert.equal(f.document.state.obligations[deposit.claim].terms.rateTerms.per,'day');
 assert.equal(accruedInterest(row,row.createdAt+5*1440,{round:'ceil'}),2);
 // Author charter input changes units, not signed obligations. The equivalent
 // new anchor rate.03 converts back to old signed daily deposit .0004.
 f.bank.rateTerms={per:'anchor',base:0.03,minRate:0.03,maxRate:0.03};
 const at=f.document.state.records[bankId].interestAt,draft=f.engine.primitiveDraft(f.document);
 advanceBankFinance(draft,f.engine,at+30*1440);f.replace(applyPatches(f.document,draft.patches));
 // Deposit1000 ×(.03*.4/30) ×30 =12 on its original debt.
 assert.equal(f.document.state.records[bankId].accounts.player,1012);assert.equal(f.document.state.obligations[deposit.claim].amount,1012);
 assert.equal(f.document.state.obligations[deposit.claim].terms.rateTerms.per,'day');assert.equal(row.monthlyInterest,0.001);clean(f);
});

test('named deposit original pays only the same canonical debt and survives partial withdrawal/save',async t=>{
 const engine=new WorldEngine(world),f=await nativeDeposit(engine,engine.createCharacter(seed,{},'s503-paper'),{vaultCash:50});
 const before=f.document.state.minute,claim=f.claim;
 // Deposit101-fee1=100. Vault depletion50 is not the examined mechanism.
 assert.equal(f.document.state.records[bankId].accounts.player,100);
 assert.equal(f.document.state.itemInstances[f.paper].represents,claim);
 assert.equal(f.document.state.itemInstances[f.paper].document.issuer,bankId);
 assert.equal(f.document.state.itemInstances[f.paper].document.certifier,keeper);
 const quoted=await creditCall(f,{operation:'bank_inspect'},'paper-inspect');
 assert.deepEqual(quoted.deposits,[{claim,principal:100,paid:0,balance:100,original:f.paper,sourceEvent:'deposit-fund',rateTerms:{per:'anchor',calendar:'core:calendar_default'}}]);
 const paid=await creditCall(f,{operation:'withdraw',coins:25,debt:claim},'paper-partial');
 assert.equal(paid.withdrawn,25);assert.equal(f.document.state.minute,before+5);
 const settlements=paid.receipt.applied.filter(e=>e.op==='obligation.settle'&&e.obligationKind==='deposit');
 assert.equal(settlements.length,1);assert.equal(settlements[0].id,claim);assert.equal(settlements[0].amount,25);
 assert.equal(f.document.state.player.coins,25);assert.equal(f.document.state.records[bankId].coins,25);
 assert.equal(f.document.state.records[bankId].accounts.player,75);assert.equal(obligationView(f.document.state,claim).owed,75);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'s503-paper-save-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(document,input)=>engine.reduce(document,input),store=new CampaignStorage(root,{reducer});
 await store.create({id:'deposit',worldVersion:world.version,document:f.document});
 const restored=await new CampaignStorage(root,{reducer}).read('deposit');assert.deepEqual(restored.document,f.document);f.document=restored.document;
 assert.equal(obligationRows(f.document.state).filter(o=>o.kind==='deposit').length,1);
 assert.equal(f.document.state.obligations[claim].paid,25);assert.equal(f.document.state.itemInstances[f.paper].status,'持有');
 await creditCall(f,{operation:'withdraw',coins:25,debt:claim},'paper-last-cash');
 assert.equal(f.document.state.player.coins,50);assert.equal(obligationView(f.document.state,claim).owed,50);
 const empty=structuredClone(f.document);await assert.rejects(creditCall(f,{operation:'withdraw',coins:1},'paper-empty'));assert.deepEqual(f.document,empty);clean(f);
});

test('deposit interest and multiple deposits retain one claim per actual principal transfer',async()=>{
 const engine=new WorldEngine(world),f=await nativeDeposit(engine,engine.createCharacter(seed,{},'s503-one-claim'));
 const at=f.document.state.records[bankId].interestAt;
 // 100 *.006 * 2 months = 1.2 -> 1 capitalized copper, .2 carried.
 const draft=engine.primitiveDraft(f.document);
 advanceBankFinance(draft,engine,at+60*1440);
 f.document=applyPatches(f.document,draft.patches);
 assert.equal(f.document.state.obligations[f.claim].amount,101);assert.equal(f.document.state.records[bankId].accounts.player,101);
 assert.equal(obligationRows(f.document.state).filter(o=>o.kind==='deposit').length,1);
 // Keep the calendar, teller availability and cash outside the examined
 // claim settlement; no simulated future passage is needed for the counter.
 const setup=applyIntentSetup(engine,f.document,{minute:700,location:post});assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
 await creditCall(f,{operation:'withdraw',coins:101,debt:f.claim},'interest-redeem');
 assert.equal(f.document.state.obligations[f.claim].paid,101);assert.equal(f.document.state.itemInstances[f.paper].status,'redeemed');
 assert.equal(f.document.state.player.coins,101);assert.equal(f.document.state.records[bankId].accounts.player,0);
 const deposited=await creditCall(f,{operation:'deposit',coins:51},'second-deposit');
 assert.notEqual(deposited.claim,f.claim);assert.equal(f.document.state.records[bankId].accounts.player,50);
 assert.equal(obligationRows(f.document.state).filter(o=>o.kind==='deposit').length,2);
 const before=structuredClone(f.document);await assert.rejects(creditCall(f,{operation:'withdraw',coins:1,debt:f.claim},'spent-original'));assert.deepEqual(f.document,before);clean(f);
});

test('forged, wrong named holder, damaged and excessive deposit requests are atomic',async()=>{
 for(const mutate of [p=>p.document.valid=false,p=>p.document.issuer='missing',p=>p.document.namedHolder=keeper,p=>p.represents='forged',p=>p.document.sourceEvent='world_event:missing',p=>p.durability=0]){
  const engine=new WorldEngine(world),f=await nativeDeposit(engine,engine.createCharacter(seed,{},'s503-reject'));
  // Tampered originals are non-examined premises; verification is native.
  const paper=structuredClone(f.document.state.itemInstances[f.paper]);mutate(paper);
  const setup=applyIntentSetup(engine,f.document,{facts:[{path:['state','itemInstances',f.paper],value:paper}]});assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
  const before=structuredClone(f.document);await assert.rejects(creditCall(f,{operation:'withdraw',coins:50},'reject-paper'));assert.deepEqual(f.document,before);
  assert.equal(obligationView(f.document.state,f.claim).owed,100);assert.equal(f.document.state.player.coins,0);clean(f);
 }
 const engine=new WorldEngine(world),f=await nativeDeposit(engine,engine.createCharacter(seed,{},'s503-overdraw')),before=structuredClone(f.document);
 await assert.rejects(creditCall(f,{operation:'withdraw',coins:101},'overdraw-paper'));assert.deepEqual(f.document,before);
 assert.equal(obligationView(f.document.state,f.claim).owed,100);
});

test('giving away the named original blocks cashing it; a second issue cannot copy the claim',async()=>{
 const engine=new WorldEngine(world),f=await nativeDeposit(engine,engine.createCharacter(seed,{},'s503-custody'));
 const before=structuredClone(f.document);
 const duplicate=await engine.reduce(f.document,{tool:'world_act',args:{action:'documents:issue',slots:{source:'deposit-fund',paper:'item_parchment',kind:'receipt'}},eventId:'duplicate-deposit-paper'});
 assert.equal(duplicate.result.receipt.status,'rejected');assert.deepEqual(applyPatches(f.document,duplicate.patches),before);
 // Custody changes through the real document transfer; no synthetic holder.
 const given=await engine.reduce(f.document,{tool:'world_act',args:{action:'documents:give',slots:{document:f.paper,target:keeper}},eventId:'give-named-deposit'});
 assert.notEqual(given.result.receipt?.status,'rejected');f.document=applyPatches(f.document,given.patches);
 assert.equal(f.document.state.itemInstances[f.paper].owner,keeper);
 const heldElsewhere=structuredClone(f.document);await assert.rejects(creditCall(f,{operation:'withdraw',coins:50},'wrong-physical-holder'));assert.deepEqual(f.document,heldElsewhere);
 // Principal101-fee1=100 remains the sole unpaid debt despite both attempts.
 assert.equal(obligationView(f.document.state,f.claim).owed,100);assert.equal(f.document.state.records[bankId].accounts.player,100);
 assert.equal(obligationRows(f.document.state).filter(o=>o.kind==='deposit').length,1);clean(f);
});

test('reserve deduction, pressure and deposit spread have independent numeric anchors',async()=>{
 const f=fixture();await f.act({operation:'deposit',coins:1001},'reserve-deposit');
 const view=bankCredit(f.engine,f.document.state,f.bank);
 // Cash1500+1001=2501; claim1001-fee1=1000; reserve1000*.2=200.
 assert.equal(view.cash,2501);assert.equal(view.liabilities,1000);assert.equal(view.reserve,200);assert.equal(view.loanable,2301);
 assert.equal(regionalCredit(f.engine,f.document.state,post),2301);
 // Empty recent demand: .015*(1+0/2301)=.015; deposit=.015*.4=.006.
 assert.equal(interestRate(f.engine,f.document.state,f.bank).rate,0.015);assert.equal(depositRate(f.engine,f.document.state,f.bank),0.006);
 const loan=await f.act({operation:'borrow',coins:100,days:30,item:'item_wood',quantity:100},'reserve-loan');
 // Prospective demand100: .015*(1+100/2301)=.015651890482398955.
 assert.equal(loan.monthlyInterest,0.015651890482398955);assert.equal(loan.interest,2);assert.equal(loan.amount,102);
 const after=bankCredit(f.engine,f.document.state,f.bank);
 assert.equal(after.cash,2401);assert.equal(after.loanable,2201);assert.equal(after.demand,100);
 // Completed demand100, reduced loanable2201: .015*(1+100/2201).
 assert.equal(interestRate(f.engine,f.document.state,f.bank).rate,0.01568150840527033);
 clean(f);
});

test('native borrowing transfers existing money once; failure and quote reads do not write',async()=>{
 const f=fixture();await f.act({operation:'deposit',coins:1001},'conserve-deposit');
 const before=structuredClone(f.document),cash=f.document.state.player.coins+f.document.state.records[bankId].coins;
 // Production preview is the application before confirmation. Discarding it
 // withdraws the proposal; reopening it cannot create completed loan demand.
 for(let n=0;n<3;n++){
  const preview=await f.engine.previewAction(f.document,{tool:'world_act',args:{action:'core:trade.borrow',slots:{seller:keeper,coins:100,days:30,item:'item_wood',quantity:100}},eventId:`withdrawn-preview-${n}`});
  assert.equal(preview.receipt.status,'preview');
  assert.equal(interestRate(f.engine,f.document.state,f.bank,{principal:100,document:f.document}).rate,0.015651890482398955);
 }
 assert.deepEqual(f.document,before);
 await assert.rejects(f.act({operation:'borrow',coins:301,days:30,item:'item_wood',quantity:100},'over-limit'));
 assert.deepEqual(f.document,before);
 const result=await f.act({operation:'borrow',coins:100,days:30,item:'item_wood',quantity:100},'conserve-loan');
 assert.equal(f.document.state.player.coins,2099);assert.equal(f.document.state.records[bankId].coins,2401);
 assert.equal(f.document.state.player.coins+f.document.state.records[bankId].coins,cash);
 assert.equal(f.document.state.obligations[`finance:${result.debt}`].principal,100);
 clean(f);
});

test('reserve-bound loan limit and rate corrections cannot spend the protected cash',async()=>{
 const f=fixture();await f.act({operation:'deposit',coins:1001},'tight-deposit');
 // A depleted opening vault is a non-examined cash premise, declared through
 // the production setup writer; all attempted lending remains a real action.
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:220}]});
 assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 // 220 - .2*1000 = 20; rate(.015*(1+20/20))=.03.
 assert.equal(bankCredit(f.engine,f.document.state,f.bank).loanable,20);
 assert.equal(interestRate(f.engine,f.document.state,f.bank,{principal:20}).rate,0.03);
 const before=structuredClone(f.document);
 await assert.rejects(f.act({operation:'borrow',coins:21,days:30,item:'item_wood',quantity:100},'reserve-refuse'));
 assert.deepEqual(f.document,before);
 const loan=await f.act({operation:'borrow',coins:20,days:30,item:'item_wood',quantity:100},'reserve-last');
 assert.equal(loan.interest,1);assert.equal(f.document.state.records[bankId].coins,200);assert.equal(bankCredit(f.engine,f.document.state,f.bank).loanable,0);clean(f);
 const w={...world,derived:{...world.derived,modifiers:[...world.derived.modifiers,{id:'credit-rate',pack:'credit',target:'lending:interestRate',stage:'mul',value:2}]}};
 const corrected=fixture(w);
 // Base .015, no pressure, author factor2 => .03. The correction is a view.
 assert.equal(interestRate(corrected.engine,corrected.document.state,corrected.bank,{document:corrected.document}).rate,0.03);
});

test('native counter explanation and campaign reopen retain the signed rate without saving projections',async t=>{
 const f=fixture();await f.act({operation:'deposit',coins:1001},'save-deposit');
 const result=await f.act({operation:'borrow',coins:100,days:30,item:'item_wood',quantity:100},'save-loan');
 const before=structuredClone(f.document),inspected=await f.act({operation:'bank_inspect'},'inspect-credit');
 // The same completed 100-copper loan leaves 2401-200=2201 loanable.
 assert.equal(inspected.credit.loanable,2201);assert.equal(inspected.credit.demand,100);
 assert.equal(inspected.regionalLoanable,2201);
 assert.equal(inspected.credit.rate,0.01568150840527033);
 assert.deepEqual(f.document.state.records[bankId],before.state.records[bankId]);
 assert.equal(Object.hasOwn(f.document.state.records[bankId],'loanable'),false);
 const root=await fs.mkdtemp(path.join(tmpRoot(),'s503-save-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(document,input)=>f.engine.reduce(document,input),store=new CampaignStorage(root,{reducer});
 await store.create({id:'credit',worldVersion:world.version,document:f.document});
 const saved=await new CampaignStorage(root,{reducer}).read('credit');f.replace(saved.document);
 assert.equal(f.document.state.records[result.debt].monthlyInterest,0.015651890482398955);
 assert.equal(bankCredit(f.engine,f.document.state,f.bank).loanable,2201);clean(f);
});

test('loan reserves remain withdrawable until the vault is empty, and real replenishment resumes payment',async()=>{
 const f=fixture();await f.act({operation:'deposit',coins:1001},'redeem-deposit');
 // Non-examined depletion: cash220, deposit1000. Reserve200 leaves loanable20.
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:220}]});
 assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 await f.act({operation:'borrow',coins:20,days:30,item:'item_wood',quantity:100},'redeem-last-loan');
 assert.equal(bankCredit(f.engine,f.document.state,f.bank).loanable,0);
 const paid=await f.act({operation:'withdraw',coins:200},'redeem-reserves');
 assert.equal(paid.withdrawn,200);assert.equal(f.document.state.records[bankId].coins,0);
 assert.equal(f.document.state.records[bankId].accounts.player,800);
 const before=structuredClone(f.document);
 await assert.rejects(f.act({operation:'withdraw',coins:1},'redeem-empty'));
 assert.deepEqual(f.document,before);
 await f.act({operation:'deposit',coins:101},'redeem-refill');
 await f.act({operation:'withdraw',coins:1},'redeem-resume');
 // 1000-200+(101-fee1)-1=899 debt; 0+101-1=100 cash;
 // player3000-1001+20+200-101+1=2119; no money is issued.
 assert.equal(f.document.state.records[bankId].accounts.player,899);
 assert.equal(f.document.state.records[bankId].coins,100);assert.equal(f.document.state.player.coins,2119);clean(f);
});

test('fractional charter reserves do not lose a lendable copper to floating rounding',async()=>{
 const w=structuredClone(world);w.rules.economy.credit.banks[0].reserveRatio=0.14;
 const f=fixture(w);await f.act({operation:'deposit',coins:101},'fraction-deposit');
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records',bankId,'coins'],value:15}]});
 assert.deepEqual(setup.setupUnmet,[]);f.replace(setup.document);
 // Deposit101-fee1=100; reserve100*.14=14; loanable15-14=1.
 const credit=bankCredit(f.engine,f.document.state,f.bank);
 assert.equal(credit.reserve,14);assert.equal(credit.loanable,1);
 const before=structuredClone(f.document);
 await assert.rejects(f.act({operation:'borrow',coins:2,days:30,item:'item_wood',quantity:100},'fraction-over'));
 assert.deepEqual(f.document,before);
 await f.act({operation:'borrow',coins:1,days:30,item:'item_wood',quantity:100},'fraction-one');
 assert.equal(f.document.state.records[bankId].coins,14);assert.equal(bankCredit(f.engine,f.document.state,f.bank).loanable,0);clean(f);
 // A finer charter ratio must not be truncated: 100*.14001=14.001,
 // floor(15-14.001)=0, rather than one copper after rounding the ratio.
 const fineWorld=structuredClone(world);fineWorld.rules.economy.credit.banks[0].reserveRatio=0.14001;
 const fine=fixture(fineWorld);await fine.act({operation:'deposit',coins:101},'fine-fraction-deposit');
 const fineSetup=applyIntentSetup(fine.engine,fine.document,{facts:[{path:['state','records',bankId,'coins'],value:15}]});
 assert.deepEqual(fineSetup.setupUnmet,[]);fine.replace(fineSetup.document);
 assert.equal(bankCredit(fine.engine,fine.document.state,fine.bank).reserve,14.001);
 assert.equal(bankCredit(fine.engine,fine.document.state,fine.bank).loanable,0);
 const unchanged=structuredClone(fine.document);
 await assert.rejects(fine.act({operation:'borrow',coins:1,days:30,item:'item_wood',quantity:100},'fine-fraction-refuse'));
 assert.deepEqual(fine.document,unchanged);clean(fine);
});
