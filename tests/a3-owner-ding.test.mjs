import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup,scoreRows} from '../tools/a3-score.mjs';
import {dedicatedCoinAccount,spendCounterCoins,restoreCoinAccount,partyAccount} from '../server-plugin/money.mjs';
import {obligationRows,obligationView} from '../server-plugin/obligation-state.mjs';
import {restoreObligationSnapshot,settleObligation} from '../server-plugin/obligation-runtime.mjs';
import {restoreDocumentSnapshot,restoreCaseSnapshot,caseProcedureView,currentCaseHandler,submitCaseDocument,caseDocumentEvidence,lawView,lawAction} from '../server-plugin/law.mjs';
import {transportAction} from '../server-plugin/transport.mjs';
import {summonAction,advanceSummons} from '../server-plugin/summons.mjs';
import {aliveHoldings,closeHolding} from '../server-plugin/holdings.mjs';
import {transition,advanceProcedure} from '../server-plugin/transition.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const engine=new WorldEngine(await loadWorld());
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner-ding');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
const setup=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`).setup);
const load=(id,change=()=>{})=>{const s=setup(id);change(s);return applyIntentSetup(engine,initial,s);};
const save=d=>JSON.parse(JSON.stringify(d));
const reader=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)});
const ownedErrors=r=>r.setupUnmet.filter(e=>/^(accounts|obligations|documents|cases)(\[|$)/.test(e.item));
const clean=document=>assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
function write(document,fn){const d=engine.primitiveDraft(document),result=fn(d);const out=applyPatches(document,d.patches);assert.deepEqual(save(out),save(d.document));return {document:save(out),result,patches:d.patches};}
async function writeAsync(document,fn){const d=engine.primitiveDraft(document),result=await fn(d);const out=applyPatches(document,d.patches);assert.deepEqual(save(out),save(d.document));return {document:save(out),result,patches:d.patches};}

test('N: counter opening persists independently from the personal purse; only its owner can spend',()=>{
 const loaded=load('082');assert.deepEqual(ownedErrors(loaded),[]);
 const document=save(loaded.document),npc='npc_hw_linsui',row=dedicatedCoinAccount(document.state,npc,'counter'),purse=document.state.npcs[npc].coins;
 assert.equal(row.coins,100);assert.equal(document.ledger.accounts[row.account],100);assert.equal(document.state.player.coins,0);
 assert.throws(()=>write(document,d=>spendCounterCoins(d,engine,{owner:npc,actor:'player',to:'player',amount:100,eventId:'forged'})),/owner/);
 assert.throws(()=>write(document,d=>spendCounterCoins(d,engine,{owner:npc,actor:npc,to:'player',amount:101,eventId:'overdraw'})),/funds/);
 const out=write(document,d=>spendCounterCoins(d,engine,{owner:npc,actor:npc,to:'player',amount:20,eventId:'owner-payment'}));
 assert.equal(dedicatedCoinAccount(out.document.state,npc,'counter').coins,80);assert.equal(out.document.state.player.coins,20);assert.equal(out.document.state.npcs[npc].coins,purse);clean(out.document);
 const replay=write(out.document,d=>spendCounterCoins(d,engine,{owner:npc,actor:npc,to:'player',amount:20,eventId:'owner-payment'}));assert.deepEqual(replay.patches,[]);
 const reopened=write(out.document,d=>restoreCoinAccount(d,engine,{owner:npc,purpose:'counter',balance:100,sourceEvent:'world_event:a3v2_082_account_0'}));
 assert.equal(dedicatedCoinAccount(reopened.document.state,npc,'counter').coins,80);assert.deepEqual(reopened.patches,[]);
 assert.throws(()=>write(document,d=>restoreCoinAccount(d,engine,{owner:npc,purpose:'purse',balance:100,sourceEvent:'world_event:a3v2_082_account_0'})),/already exists/);
});

test('N: invalid opening source, purpose, owner and negative balances cannot initialize accounts',()=>{
 for(const change of [s=>s.accounts[0].balance=-1,s=>s.accounts[0].sourceEvent='missing',s=>s.accounts[0].purpose='unregistered',s=>s.accounts[0].owner='player']){
  const loaded=load('082',change);assert.equal(ownedErrors(loaded).length,1);assert.equal(loaded.document.state.player.coins,0);
 }
 const loaded=load('082'),document=save(loaded.document);
 assert.throws(()=>write(document,d=>restoreCoinAccount(d,engine,{owner:'npc_hw_linsui',purpose:'counter',balance:100,sourceEvent:'not-an-event'})),/source/);
 const remote=load('082',s=>s.accounts[0].seat=engine.world.locations.find(l=>l.id!==s.location).id);
 assert.throws(()=>write(save(remote.document),d=>spendCounterCoins(d,engine,{owner:'npc_hw_linsui',actor:'npc_hw_linsui',to:'player',amount:1,eventId:'remote-counter'})),/cannot act here/);
 clean(document);
});

test('N: real owner death carries the independent counter into the estate without stale or duplicated cash',()=>{
 const loaded=load('082'),document=save(loaded.document),npc='npc_hw_linsui',before=dedicatedCoinAccount(document.state,npc,'counter');
 const out=write(document,d=>transition(d,engine,{entity:npc,basis:'death',origin:'death_rule',eventId:'counter-owner-death'}));
 const estate=out.result.successor;assert.ok(estate);
 assert.equal(out.document.ledger.accounts[before.account]??0,0);assert.equal(out.document.ledger.accounts[`${estate}|coin_river|counter`],100);
 assert.equal(dedicatedCoinAccount(out.document.state,npc,'counter').coins,0);assert.equal(dedicatedCoinAccount(out.document.state,estate,'counter').coins,100);clean(out.document);
});

test('N/O: estate repays an existing loan from its owned counter before distributing the remainder',()=>{
 const npc='npc_hw_linsui',loaded=load('082',s=>{
  const source={kind:'corpus_premise',row:'A3-OWNER-DING-ESTATE'};
  s.history.push({id:'estate-purse',verb:'opening_balance',at:599,source,owner:npc,resource:'coin_river',balance:0},
   {id:'estate-loan-source',verb:'obligation_opened',at:540,source,subject:'estate-old-loan',debtor:npc,creditor:'player',amount:40});
  s.accounts.push({owner:npc,resource:'coin_river',purpose:'purse',balance:0,sourceEvent:'estate-purse'});
  s.obligations=[{id:'estate-old-loan',kind:'loan',debtor:npc,creditor:'player',amount:40,paid:0,openedAt:540,dueAt:600,sourceEvent:'estate-loan-source',terms:{}}];
 });
 assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document);clean(document);
 const out=write(document,d=>{
  const r=transition(d,engine,{entity:npc,basis:'death',origin:'death_rule',eventId:'estate-counter-debt',durations:{notice:0,filing:0,settlement:0,distribution:0}});
  assert.deepEqual(engine.protocolAdditionalClaimAccounts(d,r.successor),[[`${r.successor}|coin_river|counter`,100]]);
  advanceProcedure(d,engine,r.successor);return r;
 });
 const claim=obligationView(out.document.state,'estate-old-loan');
 assert.equal(out.document.state.player.coins,40,JSON.stringify({phase:out.document.state.records[`transition_procedure:${out.result.successor}`].phase,
  paid:claim.paid,owed:claim.owed,badDebt:claim.row.badDebt,counterTotal:Object.values(out.document.state.records).filter(r=>r.category==='money_account'&&r.purpose==='counter').reduce((n,r)=>n+r.coins,0)}));
 assert.equal(obligationView(out.document.state,'estate-old-loan').paid,40);
 assert.equal(obligationView(out.document.state,'estate-old-loan').owed,0);clean(out.document);
});

test('N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection',()=>{
 const loaded=load('054');assert.deepEqual(ownedErrors(loaded),[]);let document=save(loaded.document);
 const beforeNpc=document.state.npcs.npc_bs_032_1.coins,publicAccount=partyAccount(engine,document.state,'loc_bs'),beforeTreasury=document.ledger.accounts[publicAccount]??0;
 const out=write(document,d=>settleObligation(d,engine,{id:'a3v2_054_fine',actor:'player',amount:10},'fine-paid'));
 const account=dedicatedCoinAccount(out.document.state,'loc_bs','legal_treasury');
 assert.equal(out.document.state.player.coins,0);assert.equal(account.coins,10);assert.equal(out.document.ledger.accounts[account.account],10);
 assert.equal(out.document.state.npcs.npc_bs_032_1.coins,beforeNpc);assert.equal(out.document.ledger.accounts[publicAccount]??0,beforeTreasury);
 assert.equal(obligationView(out.document.state,'a3v2_054_fine').owed,0);assert.equal(out.result.payment.collector,'npc_bs_032_1');clean(out.document);
 assert.equal(out.document.state.records.a3v2_054_case.finePaid,10);assert.equal(out.document.state.records.a3v2_054_case.fineDischarged,true);
 assert.equal(caseProcedureView(engine,out.document,'a3v2_054_case').canRequestAppeal,false);
 const replay=write(out.document,d=>settleObligation(d,engine,{id:'a3v2_054_fine',actor:'player',amount:10},'fine-paid'));
 assert.deepEqual(replay.patches,[]);assert.deepEqual(replay.result,out.result);
 assert.throws(()=>write(out.document,d=>settleObligation(d,engine,{id:'a3v2_054_fine',actor:'player',amount:1},'fine-paid')),/reused/);
});

test('N/O: absent, off-duty or unrelated office cannot collect public fines',()=>{
 for(const change of [s=>s.status.npc_bs_032_1.onDuty=false,s=>s.instances[0].authority.obligation='other',s=>s.instances[0].authority.collectionAccount.owner='npc_bs_032_1',s=>s.present=[]]){
  const loaded=load('054',change),document=save(loaded.document);
  assert.throws(()=>write(document,d=>settleObligation(d,engine,{id:'a3v2_054_fine',actor:'player',amount:10},'unlawful-fine')),/collector/);
  assert.equal(document.state.player.coins,10);assert.equal(obligationView(document.state,'a3v2_054_fine').owed,10);clean(document);
 }
 const loaded=load('054');
 assert.throws(()=>write(save(loaded.document),d=>lawAction.call(engine,d,{operation:'pay',case:'a3v2_054_case',actor:'npc_bs_032_1',coins:10},'forged-caller')),/caller/);
});

test('N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement',async()=>{
 const report=await scoreRows([corpus.find(r=>r.id==='A3V2-054')],{world:engine.world}),row=report.results[0];
 assert.deepEqual(row.setupUnmet,[]);assert.equal(row.actual.route,'core:law.pay');assert.deepEqual(row.actual.signature,['obligation.settle','transfer']);
 const payment=row.actual.signatureEffects.find(e=>e.op==='transfer');
 assert.equal(payment.to,'loc_bs|coin_river|legal_treasury');assert.equal(payment.qty,10);
 assert.ok(row.actual.signatureEffects.some(e=>e.op==='obligation.settle'&&e.id==='a3v2_054_fine'&&e.amount===10));
 assert.equal(row.actual.builder.ok,true);assert.equal(row.actual.builder.route,'core:law.pay');
 // The unchanged scorer compares endpoint tokens literally (endpointRules):
 // authorized_collector is not the real public owner loc_bs. Preserve and
 // expose that failure; never redirect public funds to a synthetic owner.
 assert.equal(row.scores.signature,false);assert.equal(row.scores.constructor,false);
});

test('O/P: restored deposit withdraws through the real bank action and updates one canonical claim and bank projection',async()=>{
 const loaded=load('032');assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),bank='bank_hw_post';
 assert.equal(document.state.records[bank].accounts.player,100);assert.equal(obligationView(document.state,'a3v2_032_deposit').owed,100);
 const out=await writeAsync(document,d=>engine.trade(d,{operation:'withdraw',seller:'npc_hw_shendu',coins:50},'withdraw-old'));
 assert.equal(out.result.withdrawn,50);assert.equal(out.document.state.player.coins,50);assert.equal(out.document.state.records[bank].coins,0);
 assert.equal(out.document.state.records[bank].accounts.player,50);assert.equal(obligationView(out.document.state,'a3v2_032_deposit').owed,50);
 assert.equal(obligationRows(out.document.state).filter(o=>o.id==='a3v2_032_deposit').length,1);clean(out.document);
});

test('O/P: deposit cannot withdraw using a forged receipt, wrong named holder or overdraw',async()=>{
 for(const change of [s=>s.documents[0].valid=false,s=>s.documents[0].namedHolder='npc_hw_shendu',s=>s.itemInstances[0].condition=0]){
  const loaded=load('032',change),document=save(loaded.document);
  await assert.rejects(writeAsync(document,d=>engine.trade(d,{operation:'withdraw',seller:'npc_hw_shendu',coins:50},'bad-receipt')),/receipt/);
  assert.equal(document.state.player.coins,0);assert.equal(obligationView(document.state,'a3v2_032_deposit').owed,100);
 }
 const loaded=load('032');await assert.rejects(writeAsync(save(loaded.document),d=>engine.trade(d,{operation:'withdraw',seller:'npc_hw_shendu',coins:101},'overdraw')));
});

test('O: partial paid deposit snapshot restores debt, not cash or a second deposit',()=>{
 const loaded=load('032',s=>s.obligations[0].paid=25);assert.deepEqual(ownedErrors(loaded),[]);
 const document=save(loaded.document);assert.equal(document.state.player.coins,0);assert.equal(document.state.records.bank_hw_post.coins,50);
 assert.equal(document.state.records.bank_hw_post.accounts.player,75);assert.equal(obligationView(document.state,'a3v2_032_deposit').owed,75);clean(document);
});

test('O: restored pawn redemption returns the exact original, clears canonical and compatibility debt and closes its pledge',async()=>{
 // The legacy seed owns a separate staff; this test explicitly starts with an empty bag.
 const loaded=load('037',s=>s.inventory.item_staff=0);assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),unit=loaded.bindings.a3v2_037_staff;
 assert.equal(document.state.inventory.item_staff?.quantity??0,0);assert.equal(document.state.player.coins,2);
 const out=await writeAsync(document,d=>engine.trade(d,{operation:'redeem',seller:'npc_hw_shendu',contract:'a3v2_037_pawn_loan',coins:2},'redeem-old'));
 assert.equal(out.document.state.player.coins,0);assert.equal(out.document.state.inventory.item_staff.quantity,1);assert.ok(out.document.state.inventory.item_staff.instances.includes(unit));
 assert.equal(out.document.state.itemInstances[unit].owner,'player');assert.equal(obligationView(out.document.state,'a3v2_037_pawn_loan').owed,0);
 assert.equal(out.document.state.records.a3v2_037_pawn_loan.paid,2);assert.equal(aliveHoldings(reader(out.document),{kind:'pledged',holder:'a3v2_037_pawn_loan'}).length,0);clean(out.document);
});

test('O: mismatched collateral custody, expired redemption and invalid paid amount are rejected',async()=>{
 const invalid=load('037',s=>s.obligations[0].paid=3);assert.ok(ownedErrors(invalid).some(e=>e.item==='obligations[0]'));
 const wrong=load('037',s=>s.itemInstances[0].carriedBy='npc_hw_shendu');assert.ok(ownedErrors(wrong).some(e=>e.item==='obligations[0]'));
 const expired=load('037',s=>s.obligations[0].terms.redeemDeadline=600);assert.deepEqual(ownedErrors(expired),[]);
 await assert.rejects(writeAsync(save(expired.document),d=>engine.trade(d,{operation:'redeem',seller:'npc_hw_shendu',contract:'a3v2_037_pawn_loan',coins:2},'late-redeem')),/redeemable/);
});

test('O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild',()=>{
 const premise=setup('037').obligations[0],loaded=load('037',s=>{s.obligations=[];s.holdings=s.holdings.filter(h=>h.kind!=='pledged');});
 assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document);clean(document);
 const out=write(document,d=>restoreObligationSnapshot(d,engine,{...premise,sourceEvent:loaded.bindings[premise.sourceEvent],terms:{...premise.terms,collateral:loaded.bindings[premise.terms.collateral]}}));
 assert.equal(obligationView(out.document.state,premise.id).owed,2);assert.equal(out.document.state.player.coins,2);assert.equal(out.document.state.records[premise.id].kind,'pawn');
 assert.equal(out.document.state.records[premise.id].terms.grace.minutes,1440);clean(out.document);
});

test('O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation',()=>{
 const loaded=load('056');assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),before=save(document);
 const result=transportAction(engine.primitiveDraft(document),engine,{task:'inspect',contract:'a3v2_056_delivery'},'inspect-cargo');
 assert.equal(result.delivered,true);assert.equal(result.lossAssessed,false);assert.equal(result.subject,loaded.bindings.a3v2_056_cargo);assert.ok(result.condition<100);
 assert.equal(result.documents.length,1);assert.equal(result.documents[0].links.length,2);assert.equal(result.compensation,null);assert.deepEqual(document,before);clean(document);
 assert.throws(()=>transportAction(engine.primitiveDraft(document),engine,{task:'inspect',contract:'a3v2_056_delivery',actor:'npc_hw_shendu'},'not-customer'),/customer/);
 assert.throws(()=>write(document,d=>settleObligation(d,engine,{id:'a3v2_056_delivery',actor:'npc_bs_016_1',amount:1},'pay-cargo')),/service adapter/);
});

test('O: upkeep survives save and its real dismissal consumer closes it without charging or resummoning',()=>{
 const loaded=load('073');assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),summon=loaded.bindings.a3v2_073_water_cup,mp=document.state.player.mp;
 const out=write(document,d=>summonAction.call(engine,d,{operation:'dismiss',summon},'dismiss-old'));
 assert.equal(out.result.dismissed,true);assert.equal(out.document.state.effects[summon],undefined);assert.equal(out.document.state.player.mp,mp);
 assert.equal(obligationView(out.document.state,'a3v2_073_upkeep').closed,true);clean(out.document);
 for(const change of [s=>s.obligations[0].terms.peacefulDismissal=false,s=>s.obligations[0].terms.overdue=true,s=>s.obligations[0].terms.thirdPartyRights=true]){
  const bad=load('073',change);assert.deepEqual(ownedErrors(bad),[]);
  assert.throws(()=>write(save(bad.document),d=>summonAction.call(engine,d,{operation:'dismiss',summon:bad.bindings.a3v2_073_water_cup},'bad-dismiss')),/terms/);
 }
});

test('O: snapshot provenance, parties and values are validated before native writes',()=>{
 for(const change of [s=>s.obligations[0].creditor='npc_hw_shendu',s=>s.obligations[0].amount=101,s=>s.obligations[0].openedAt=601,s=>s.obligations[0].sourceEvent=s.history[0].id]){
  const loaded=load('032',change);assert.ok(ownedErrors(loaded).some(e=>e.item==='obligations[0]'));assert.equal(loaded.document.state.player.coins,0);
 }
 const document=save(load('032').document),before=save(document);
 assert.throws(()=>write(document,d=>restoreObligationSnapshot(d,engine,{id:'forged',kind:'loan',debtor:'player',creditor:'npc_hw_shendu',amount:10,paid:0,openedAt:540,dueAt:600,sourceEvent:'missing',terms:{}})),/source/);
 assert.deepEqual(document,before);
});

test('O: natural summon expiry ends the same restored upkeep and never charges a new opening fee',()=>{
 const loaded=load('073'),document=save(loaded.document),summon=loaded.bindings.a3v2_073_water_cup,expires=document.state.effects[summon].expires;
 const out=write(document,d=>advanceSummons(d,expires));
 assert.equal(out.document.state.effects[summon],undefined);assert.equal(obligationView(out.document.state,'a3v2_073_upkeep').closed,true);
 assert.equal(out.document.state.obligations.a3v2_073_upkeep.endedAt,expires);assert.equal(out.document.state.player.coins,document.state.player.coins);clean(out.document);
});

test('P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict',()=>{
 const loaded=load('052');assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),id=loaded.bindings.a3v2_052_new_receipt;
 assert.equal(document.state.inventory.item_parchment.quantity,1);assert.equal(document.state.itemInstances[id].document.reviewed,false);
 const judgment=save(document.state.records.a3v2_052_case.judgment),out=write(document,d=>submitCaseDocument(d,engine,{case:'a3v2_052_case',document:id,actor:'player'},'submit-receipt'));
 assert.equal(out.document.state.inventory.item_parchment.quantity,1);assert.equal(caseDocumentEvidence(reader(out.document),'a3v2_052_case',id,'player').source,'world_event:a3v2_052_receipt_found');
 assert.deepEqual(out.document.state.records.a3v2_052_case.judgment,judgment);assert.equal(out.document.state.records.a3v2_052_case.stage,'judged');
 assert.equal(lawView(engine,out.document).cases.find(c=>c.id==='a3v2_052_case').documents.length,1);clean(out.document);
 assert.throws(()=>write(document,d=>submitCaseDocument(d,engine,{case:'a3v2_052_case',document:id,actor:'npc_hw_shendu'},'forged-submit')),/party/);
 const destroyed=load('052',s=>s.itemInstances[0].condition=0);
 assert.throws(()=>write(save(destroyed.document),d=>submitCaseDocument(d,engine,{case:'a3v2_052_case',document:destroyed.bindings.a3v2_052_new_receipt,actor:'player'},'destroyed-paper')),/original paper/);
});

test('P: source links identify the same physical subject, and unrelated, missing or forged documents fail',()=>{
 const good=load('051');assert.deepEqual(ownedErrors(good),[]);const paper=good.document.state.itemInstances[good.bindings.a3v2_051_evidence];
 assert.equal(paper.document.describes,good.bindings.a3v2_051_grain_sack);assert.equal(paper.document.sourceEvent,'world_event:a3v2_051_purchase_receipt');
 for(const change of [s=>s.documents[0].sourceEvent='a3v2_051_theft_missing',s=>s.documents[0].sourceEvent='a3v2_051_theft',s=>s.documents[0].owner='npc_hw_shendu',s=>s.documents[0].describes='missing-item',s=>s.documents[0].content.identifies='wrong-cargo',s=>s.documents[0].links=['missing-event']]){
  const bad=load('051',change);assert.equal(ownedErrors(bad).length,1);
 }
 const document=save(good.document);assert.throws(()=>write(document,d=>restoreDocumentSnapshot(d,engine,{id:'missing',owner:'player',sourceEvent:'world_event:a3v2_051_purchase_receipt',describes:good.bindings.a3v2_051_grain_sack})),/paper/);clean(document);
});

test('Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties',()=>{
 for(const [id,stage] of [['052','judged'],['055','pending'],['057','execution'],['107','prosecution']]){
  const loaded=load(id);assert.deepEqual(ownedErrors(loaded),[],id);const document=save(loaded.document),key=`a3v2_${id}_case`,view=caseProcedureView(engine,document,key);
  assert.equal(view.stage,stage);assert.equal(document.state.records[key].offense,undefined);assert.equal(document.state.records[key].judgment?.fine,undefined);
  assert.equal(document.state.records[key].offender,['055','107'].includes(id)?'player':undefined);clean(document);
 }
 const good=load('052');assert.equal(caseProcedureView(engine,save(good.document),'a3v2_052_case').canRequestAppeal,true);
 assert.equal(caseProcedureView(engine,save(good.document),'a3v2_052_case','npc_hw_shendu').canRequestAppeal,false);
 const late=load('052',s=>s.cases[0].appealDeadline=599);assert.deepEqual(ownedErrors(late),[]);
 assert.throws(()=>write(save(late.document),d=>lawAction.call(engine,d,{operation:'appeal',case:'a3v2_052_case',authority:'npc_bs_031_1'},'late-appeal')),/appeal period/);
 assert.throws(()=>write(save(late.document),d=>lawAction.call(engine,d,{operation:'appeal',case:setup('052').cases[0].name,authority:'npc_bs_031_1'},'late-named-appeal')),/appeal period/);
});

test('Q: case handler is derived from the present office holding, not a copied incumbent',()=>{
 const loaded=load('058');assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),id='a3v2_058_case',npc='npc_bs_032_1';
 assert.equal(currentCaseHandler(engine,document,id,npc),true);assert.deepEqual(caseProcedureView(engine,document,id).handler,[npc]);
 const office=document.state.records[id].handlerOffice,h=aliveHoldings(reader(document),{kind:'holds_office',holder:npc,subject:office})[0];
 const out=write(document,d=>closeHolding(d,{id:h.id,reason:'vacated',writer:h.writer,eventId:'leave-office'}));
 assert.equal(currentCaseHandler(engine,out.document,id,npc),false);assert.deepEqual(caseProcedureView(engine,out.document,id).handler,[]);
});

test('Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case',()=>{
 for(const change of [s=>s.cases[0].sourceEvent='a3v2_052_judgment',s=>s.cases[0].parties=['missing'],s=>s.cases[0].defendant='npc_hw_shendu',s=>s.history.find(h=>h.verb==='judged').subject='other-case']){
  const bad=load('052',change);assert.ok(ownedErrors(bad).some(e=>e.item==='cases[0]'));assert.equal(bad.document.state.records.a3v2_052_case,undefined);
 }
 const document=save(load('055').document);assert.throws(()=>write(document,d=>restoreCaseSnapshot(d,engine,{id:'forged',court:document.state.location,stage:'pending',parties:['player'],sourceEvent:'missing'})),/registration/);
});

test('N–Q: all owned setup premises are loaded; E appointments and S4 spatial premises remain separately owned',()=>{
 for(const id of ['032','037','051','052','054','055','056','057','058','073','082','107']){
  const loaded=load(id);assert.deepEqual(ownedErrors(loaded),[],id);clean(save(loaded.document));
 }
});

test('N–Q: real campaign export/import and reducer replay retain sources, balances, paper and existing stages',async t=>{
 const directory=await fs.mkdtemp(path.join(process.cwd(),'.a3-owner-ding-'));
 assert.equal(path.dirname(directory),process.cwd());
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=async(document,input)=>{
  const d=engine.primitiveDraft(document);let result;
  if(input.kind==='fine')result=settleObligation(d,engine,{id:'a3v2_054_fine',actor:'player',amount:10},'persist-fine');
  if(input.kind==='withdraw')result=await engine.trade(d,{operation:'withdraw',seller:'npc_hw_shendu',coins:50},'persist-withdraw');
  if(input.kind==='pawn')result=await engine.trade(d,{operation:'redeem',seller:'npc_hw_shendu',contract:'a3v2_037_pawn_loan',coins:2},'persist-pawn');
  if(input.kind==='paper')result=submitCaseDocument(d,engine,{case:'a3v2_052_case',document:input.paper,actor:'player'},'persist-paper');
  if(input.kind==='upkeep')result=summonAction.call(engine,d,{operation:'dismiss',summon:input.summon},'persist-upkeep');
  if(input.kind==='counter')result=spendCounterCoins(d,engine,{owner:'npc_hw_linsui',actor:'npc_hw_linsui',to:'player',amount:20,eventId:'persist-counter'});
  return {patches:d.patches,result};
 };
 const store=new CampaignStorage(directory,{reducer,snapshotEvery:3});
 for(const [id,kind] of [['054','fine'],['032','withdraw'],['037','pawn'],['052','paper'],['073','upkeep'],['082','counter']]){
  const loaded=load(id),campaign=`ding_${id}`,input={kind,...(kind==='paper'?{paper:loaded.bindings.a3v2_052_new_receipt}:{}),...(kind==='upkeep'?{summon:loaded.bindings.a3v2_073_water_cup}:{})};
  await store.create({id:campaign,worldVersion:'a3-owner-ding',document:loaded.document});
  const request={id:`native-${id}`,input},first=await store.transact(campaign,request,reducer),bundle=save(await store.export(campaign));
  const fresh=new CampaignStorage(directory,{reducer}),restored=await fresh.import(bundle,`${campaign}_copy`);
  assert.deepEqual(save(restored.document),save((await store.read(campaign)).document));
  assert.deepEqual((await fresh.transact(`${campaign}_copy`,request,reducer)).result,first.result);clean(restored.document);
 }
});
