import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup,scoreRows} from '../tools/a3-score.mjs';
import {dedicatedCoinAccount,spendCounterCoins,partyAccount} from '../server-plugin/money.mjs';
import {obligationRows,obligationView} from '../server-plugin/obligation-state.mjs';
import {settleObligation} from '../server-plugin/obligation-runtime.mjs';
import {caseProcedureView,currentCaseHandler,submitCaseDocument,caseDocumentEvidence,lawView,lawAction} from '../server-plugin/law.mjs';
import {transportAction} from '../server-plugin/transport.mjs';
import {summonAction,advanceSummons} from '../server-plugin/summons.mjs';
import {aliveHoldings,closeHolding} from '../server-plugin/holdings.mjs';
import {transition,advanceProcedure} from '../server-plugin/transition.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';

import {nativeTrial,trialCall,trialScene,trialPeople} from './helpers/trial-actions.mjs';
import {nativeDeposit,creditCall} from './helpers/credit-actions.mjs';
import {documentScene} from './helpers/document-actions.mjs';
import {appointedClaimClerk,officeCall} from './helpers/office-actions.mjs';
import {charteredWorld} from './helpers/charter-world.mjs';
// 05 §5.3: corpus offices must be charter offices; the shipped world has none yet (see helper).
// The office-appointment fixture requires its named authority on duty after
// the review wait; isolate household errands, retaining real office schedules.
const officeWorld=charteredWorld(await loadWorld());delete officeWorld.rules.householdSubsistence;
const engine=new WorldEngine(officeWorld);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner-ding');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
const setup=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`).setup);
const load=(id,change=()=>{})=>{const s=setup(id);change(s);return applyIntentSetup(engine,initial,s);};
const save=d=>JSON.parse(JSON.stringify(d));
const reader=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)});
const ownedErrors=r=>r.setupUnmet.filter(e=>/^(accounts|obligations|documents|cases)(\[|$)/.test(e.item));
const clean=document=>assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
function write(document,fn){const d=engine.primitiveDraft(document),result=fn(d);const out=applyPatches(document,d.patches);assert.deepEqual(save(out),save(d.document));return {document:save(out),result,patches:d.patches};}
async function writeAsync(document,fn){const d=engine.primitiveDraft(document),result=await fn(d);const out=applyPatches(document,d.patches);assert.deepEqual(save(out),save(d.document));return {document:save(out),result,patches:d.patches};}

// 产品原则三.2、13 §13.5：用真实施法创建效果和维持义务，存档后测试原消费者。
async function nativeSummon(){
 const spell=engine.byId.get('spell_summon_04'),scene=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_school',present:[],coins:0,
  inventory:Object.fromEntries(spell.materials.map(m=>[m.item,m.amount])),abilitiesByActor:{player:{spells:[spell.id],skills:{[spell.skill]:2699}}}});
 assert.deepEqual(scene.setupUnmet,[]);
 for(let n=0;n<20;n++){
  const call={tool:'world_act',args:{action:'core:cast',slots:{spell:spell.id,target:'player'}},eventId:`owner-upkeep-${n}`};
  const loaded=await runPrelude(engine,scene.document,[call]);assert.deepEqual(loaded.unmet,[]);
  const summon=Object.keys(loaded.document.state.effects).find(id=>id===call.eventId);
  if(summon){const effect=loaded.document.state.effects[summon];return {document:save(loaded.document),summon,upkeep:loaded.document.state.records[effect.contract].upkeepObligation};}
 }
 assert.fail('successful native summon required');
}

// D05 5.1 / product principle III.2: replace removed account snapshots with
// real leasing and opening transfers. The owner is now the actual player caller;
// the original isolation, authorization, source and probate guarantees remain.
async function nativeCounter(){
 const prepared=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_qingdeng',coins:300,inventory:{item_bread:5},present:['npc_hw_linsui']});
 assert.deepEqual(prepared.setupUnmet,[]);const f={engine,document:prepared.document};
 f.act=async(tool,args,eventId)=>{const out=await engine.reduce(f.document,{tool,args,eventId});if(out.result.receipt?.status==='rejected')assert.deepEqual(out.patches,[]);assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));f.document=applyPatches(f.document,out.patches);return out.result;};
 const leased=await f.act('world_trade',{operation:'lease',seller:'npc_hw_linsui',consent:true,days:1},'owner-counter-lease');f.business=leased.business;
 f.open=(slots={},id='owner-counter-open')=>f.act('world_act',{action:'business:open_counter',slots:{business:f.business,coins:100,...slots}},id);
 return f;
}

test('N: counter opening persists independently from the personal purse; only its owner can spend',async()=>{
 const f=await nativeCounter(),purse=f.document.state.player.coins,npc='npc_hw_linsui',beforeNpc=f.document.state.npcs[npc].coins;await f.open();
 assert.equal(dedicatedCoinAccount(f.document.state,'player','counter').coins,100);assert.equal(f.document.ledger.accounts['player|coin_river|counter'],100);
 assert.equal(f.document.state.player.coins,purse-100);
 assert.throws(()=>write(f.document,d=>spendCounterCoins(d,engine,{owner:'player',actor:npc,to:npc,amount:100,eventId:'forged'})),/owner/);
 assert.throws(()=>write(f.document,d=>spendCounterCoins(d,engine,{owner:'player',actor:'player',to:npc,amount:101,eventId:'overdraw'})),/funds/);
 const out=write(f.document,d=>spendCounterCoins(d,engine,{owner:'player',actor:'player',to:npc,amount:20,eventId:'owner-payment'}));
 // 100-20=80 in counter; only the recipient purse gains20.
 assert.equal(dedicatedCoinAccount(out.document.state,'player','counter').coins,80);assert.equal(out.document.state.npcs[npc].coins,beforeNpc+20);assert.equal(out.document.state.player.coins,purse-100);clean(out.document);
 const replay=write(out.document,d=>spendCounterCoins(d,engine,{owner:'player',actor:'player',to:npc,amount:20,eventId:'owner-payment'}));assert.deepEqual(replay.patches,[]);
 f.document=out.document;const before=save(f.document);await assert.rejects(f.open({},'owner-counter-reopen'));assert.deepEqual(f.document,before);
});

test('N: invalid opening source, purpose, owner and negative balances cannot initialize accounts',async()=>{
 for(const slots of [{coins:-1},{sourceEvent:'missing'},{purpose:'unregistered'},{owner:'npc_hw_linsui'}]){
  const f=await nativeCounter(),before=save(f.document);await assert.rejects(f.open(slots));assert.deepEqual(f.document,before);assert.equal(dedicatedCoinAccount(f.document.state,'player','counter'),null);clean(f.document);
 }
 const f=await nativeCounter();await f.open();assert.equal(dedicatedCoinAccount(f.document.state,'player','counter').sourceEvent,'owner-counter-lease');
 // D05 5.1 /15 15.1.1: moving away cannot make a remote counter spendable.
 const moved=applyIntentSetup(engine,f.document,{location:'bld_hw_post'});assert.deepEqual(moved.setupUnmet,[]);
 assert.throws(()=>write(moved.document,d=>spendCounterCoins(d,engine,{owner:'player',actor:'player',to:'player',amount:1,eventId:'remote-counter'})),/cannot act here/);clean(f.document);
});

test('N: real owner death carries the independent counter into the estate without stale or duplicated cash',async()=>{
 const f=await nativeCounter();await f.open();const before=dedicatedCoinAccount(f.document.state,'player','counter');
 const out=write(f.document,d=>transition(d,engine,{entity:'player',basis:'death',origin:'death_rule',eventId:'counter-owner-death',successors:['npc_hw_linsui']}));
 const estate=out.result.successor;assert.ok(estate);
 assert.equal(out.document.ledger.accounts[before.account]??0,0);assert.equal(out.document.ledger.accounts[`${estate}|coin_river|counter`],100);
 assert.equal(dedicatedCoinAccount(out.document.state,'player','counter').coins,0);assert.equal(dedicatedCoinAccount(out.document.state,estate,'counter').coins,100);clean(out.document);
});

test('N/O: estate repays an existing loan from its owned counter before distributing the remainder',async()=>{
 const f=await nativeCounter();
 let prepared=applyIntentSetup(engine,f.document,{minute:600,location:'bld_hw_post',coins:0,inventory:{item_wood:100}});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 const loan=await f.act('world_trade',{operation:'borrow',seller:'npc_hw_shendu',coins:40,days:1,item:'item_wood',quantity:100},'owner-estate-loan');
 prepared=applyIntentSetup(engine,f.document,{minute:610,location:'bld_hw_qingdeng',coins:100});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;await f.open();
 // S3 signed loans keep their schedule: probate tests an already due loan.
 prepared=applyIntentSetup(engine,f.document,{minute:2050});assert.deepEqual(prepared.setupUnmet,[]);f.document=prepared.document;
 const beforeBank=f.document.state.records.bank_hw_post.coins,heirPurse=f.document.state.npcs.npc_hw_linsui.coins;
 const out=write(f.document,d=>{
  const r=transition(d,engine,{entity:'player',basis:'death',origin:'death_rule',eventId:'estate-counter-debt',successors:['npc_hw_linsui'],durations:{notice:0,filing:0,settlement:0,distribution:0}});
  assert.deepEqual(engine.protocolAdditionalClaimAccounts(d,r.successor),[[`${r.successor}|coin_river|counter`,100]]);advanceProcedure(d,engine,r.successor);return r;
 });
 // Native loan40 + ceil(40 * .0154 /30)=1 interest => debt41;
 // 100-41=59 inherited once, in the same counter purpose, never a purse copy.
 assert.equal(obligationView(out.document.state,loan.debt).paid,41);assert.equal(obligationView(out.document.state,loan.debt).owed,0);
 assert.equal(out.document.state.records.bank_hw_post.coins,beforeBank+41);
 assert.equal(dedicatedCoinAccount(out.document.state,'npc_hw_linsui','counter').coins,59);assert.equal(out.document.state.npcs.npc_hw_linsui.coins,heirPurse);clean(out.document);
});

// S4LAW: 下列三个白石罚款 todo 仍缺真实前提。loc_bs 已按垄渠郡王国归属
// 绑定 law_royal_xichui，但渠阳治所未落地、白石章程只授受理/代收而无裁判权。
// 无法经真实动作产生此处的白石判决与罚款；不得借河湾判决或夹具造出镇公库债权。
test.todo('N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
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

test.todo('N/O: absent, off-duty or unrelated office cannot collect public fines〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 for(const change of [s=>s.status.npc_bs_032_1.onDuty=false,s=>s.instances[0].authority.obligation='other',s=>s.instances[0].authority.collectionAccount.owner='npc_bs_032_1',s=>s.present=[]]){
  const loaded=load('054',change),document=save(loaded.document);
  assert.throws(()=>write(document,d=>settleObligation(d,engine,{id:'a3v2_054_fine',actor:'player',amount:10},'unlawful-fine')),/collector/);
  assert.equal(document.state.player.coins,10);assert.equal(obligationView(document.state,'a3v2_054_fine').owed,10);clean(document);
 }
 const loaded=load('054');
 assert.throws(()=>write(save(loaded.document),d=>lawAction.call(engine,d,{operation:'pay',case:'a3v2_054_case',actor:'npc_bs_032_1',coins:10},'forged-caller')),/caller/);
});

test.todo('N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',async()=>{
 const report=await scoreRows([corpus.find(r=>r.id==='A3V2-054')],{world:engine.world}),row=report.results[0];
 assert.deepEqual(row.setupUnmet,[]);assert.equal(row.actual.route,'core:law.pay');assert.deepEqual(row.actual.signature,['obligation.settle','transfer']);
 const payment=row.actual.signatureEffects.find(e=>e.op==='transfer');
 assert.equal(payment.to,'loc_bs|coin_river|legal_treasury');assert.equal(payment.qty,10);
 assert.ok(row.actual.signatureEffects.some(e=>e.op==='obligation.settle'&&e.id==='a3v2_054_fine'&&e.amount===10));
 // 标杆 B07.4 / review 10-22 P1: constructor credit is the model-free form search (the corpus row
 // carries no builder input), so the same payment route must be reachable from catalog forms alone.
 assert.equal(row.constructorSearch.method,'model-free form');assert.equal(row.constructorSearch.matched.route,'core:law.pay');assert.equal(row.constructorSearch.matched.committed,true);assert.equal(row.constructorSearch.matched.fallbackTaken,false);
 // A3-E r9 / 01 §1.6, 06 §6.3: authorized_collector resolves through the
 // native payment account to loc_bs's legal treasury, never the officer's
 // private purse. The real payment/settlement assertions above stay intact.
 assert.equal(row.scores.signature,true);assert.equal(row.scores.constructor,true);
});

test('N/O: paying a restored fine retains the ordinary ten-minute action cost',async()=>{
 // 05 5.2.7: a real filing and judgment replace the removed snapshot producer;
 // the original ten-minute cost and complete canonical discharge are retained.
 const f=await nativeTrial();await trialCall(f,'request_hearing',{case:f.case,authority:trialPeople.judge},'cost-judgment');
 f.document=save(f.document);
 const before=f.document.state.minute,fine=f.document.state.records[f.case].judgment.fine;
 const paid=await trialCall(f,'core:law.pay',{case:f.case,authority:trialPeople.guard},'timed-fine');
 assert.equal(f.document.state.minute,before+10);assert.equal(paid.detail.fine,fine);
 assert.equal(obligationView(f.document.state,f.document.state.records[f.case].fineObligation).owed,0);
 assert.deepEqual(reconcile(f.engine,f.document),{mismatches:[],lots:[],drift:[],audit:[]});
});

// 15 §15.5 / 05 §5.2.7: real deposits replace the removed snapshot producer.
// Keep the withdrawal, timing, single-claim and failed-write guarantees.
test('O/P: real named deposit withdraws through the bank and updates one canonical claim',async()=>{
 const f=await nativeDeposit(engine,initial,{prefix:'owner-withdraw',vaultCash:50}),before=f.document.state.minute;
 assert.equal(f.document.state.records.bank_hw_post.accounts.player,100);assert.equal(obligationView(f.document.state,f.claim).owed,100);
 const paid=await creditCall(f,{operation:'withdraw',coins:50},'owner-withdraw-pay');
 assert.equal(f.document.state.minute,before+5);assert.equal(paid.withdrawn,50);assert.equal(f.document.state.player.coins,50);
 assert.equal(f.document.state.records.bank_hw_post.coins,0);assert.equal(f.document.state.records.bank_hw_post.accounts.player,50);
 assert.equal(obligationView(f.document.state,f.claim).owed,50);assert.equal(obligationRows(f.document.state).filter(o=>o.kind==='deposit').length,1);clean(f.document);
});

test('O/P: deposit rejects forged receipt, wrong named holder, damage and overdraw',async()=>{
 for(const mutate of [p=>p.document.valid=false,p=>p.document.namedHolder='npc_hw_shendu',p=>p.durability=0]){
  const f=await nativeDeposit(engine,initial,{prefix:'owner-invalid'}),paper=save(f.document.state.itemInstances[f.paper]);mutate(paper);
  const premise=applyIntentSetup(engine,f.document,{facts:[{path:['state','itemInstances',f.paper],value:paper}]});assert.deepEqual(premise.setupUnmet,[]);f.document=premise.document;
  const before=save(f.document);await assert.rejects(creditCall(f,{operation:'withdraw',coins:50},'owner-invalid-pay'));
  assert.deepEqual(f.document,before);assert.equal(f.document.state.player.coins,0);assert.equal(obligationView(f.document.state,f.claim).owed,100);clean(f.document);
 }
 const f=await nativeDeposit(engine,initial,{prefix:'owner-overdraw'}),before=save(f.document);
 await assert.rejects(creditCall(f,{operation:'withdraw',coins:101},'owner-overdraw-pay'));assert.deepEqual(f.document,before);
});

test('O: partial paid deposit saves debt, not cash or a second deposit',async()=>{
 const f=await nativeDeposit(engine,initial,{prefix:'owner-partial',vaultCash:50});
 await creditCall(f,{operation:'withdraw',coins:25},'owner-partial-pay');f.document=save(f.document);
 // 100-25=75 owed; vault50-25=25; the payment exists once in purse.
 assert.equal(f.document.state.player.coins,25);assert.equal(f.document.state.records.bank_hw_post.coins,25);
 assert.equal(f.document.state.records.bank_hw_post.accounts.player,75);assert.equal(obligationView(f.document.state,f.claim).owed,75);
 assert.equal(obligationRows(f.document.state).filter(o=>o.kind==='deposit').length,1);clean(f.document);
});

// O: exact-original pawn redemption moved to a3-prelude.test.mjs. Its premise
// now comes from core:trade.pawn; the remaining snapshot-only cases below are
// still explicit blockers, rather than preventing this real consumer from running.

// O's custody/expiry/overpayment regression also moved to a3-prelude.test.mjs:
// the invalid attempts now target a real pawn contract and the real clock.

test.todo('O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild〔前提待真实动作：给质押债权签入 1440 分钟宽限；归 A3 生产者卡〕',()=>{
 const premise=setup('037').obligations[0],loaded=load('037',s=>{s.obligations=[];s.holdings=s.holdings.filter(h=>h.kind!=='pledged');});
 assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document);clean(document);
 const out=write(document,d=>restoreObligationSnapshot(d,engine,{...premise,sourceEvent:loaded.bindings[premise.sourceEvent],terms:{...premise.terms,collateral:loaded.bindings[premise.terms.collateral]}},{origin:'initial'}));
 assert.equal(obligationView(out.document.state,premise.id).owed,2);assert.equal(out.document.state.player.coins,2);assert.equal(out.document.state.records[premise.id].kind,'pawn');
 assert.equal(out.document.state.records[premise.id].terms.grace.minutes,1440);clean(out.document);
});

test.todo('O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 const loaded=load('056');assert.deepEqual(ownedErrors(loaded),[]);const document=save(loaded.document),before=save(document);
 const result=transportAction(engine.primitiveDraft(document),engine,{task:'inspect',contract:'a3v2_056_delivery'},'inspect-cargo');
 assert.equal(result.delivered,true);assert.equal(result.lossAssessed,false);assert.equal(result.subject,loaded.bindings.a3v2_056_cargo);assert.ok(result.condition<100);
 assert.equal(result.documents.length,1);assert.equal(result.documents[0].links.length,2);assert.equal(result.compensation,null);assert.deepEqual(document,before);clean(document);
 assert.throws(()=>transportAction(engine.primitiveDraft(document),engine,{task:'inspect',contract:'a3v2_056_delivery',actor:'npc_hw_shendu'},'not-customer'),/customer/);
 assert.throws(()=>write(document,d=>settleObligation(d,engine,{id:'a3v2_056_delivery',actor:'npc_bs_016_1',amount:1},'pay-cargo')),/service adapter/);
});

test('O: upkeep survives save and its real dismissal consumer closes it without charging or resummoning',async()=>{
 const {document,summon,upkeep}=await nativeSummon(),mp=document.state.player.mp;
 const out=write(document,d=>summonAction.call(engine,d,{operation:'dismiss',summon},'dismiss-old'));
 assert.equal(out.result.dismissed,true);assert.equal(out.document.state.effects[summon],undefined);assert.equal(out.document.state.player.mp,mp);
 assert.equal(obligationView(out.document.state,upkeep).closed,true);clean(out.document);
 // 原三种拒绝断言保留：破坏真实签约条款以验证消费者，不能靠快照制造一份债权。
 for(const change of [terms=>terms.peacefulDismissal=false,terms=>terms.overdue=true,terms=>terms.thirdPartyRights=true]){
  const bad=save(document);change(bad.state.obligations[upkeep].terms);
  assert.throws(()=>write(bad,d=>summonAction.call(engine,d,{operation:'dismiss',summon},'bad-dismiss')),/terms/);
 }
});

// 15 §15.5: validate real deposit provenance before issuing its named original,
// retaining the old source, parties, value and zero-write assertions.
test('O: deposit source, parties and values are validated before paper issuance',async()=>{
 for(const change of [o=>o.creditor='npc_hw_shendu',o=>o.amount=101,o=>o.terms.principal=101,o=>o.createdAt++,o=>o.terms.sourceEvent='missing',o=>o.terms.bank='missing']){
  const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',coins:101,inventory:{item_parchment:1},abilitiesByActor:{player:{skills:{skill_literacy:500}}}});assert.deepEqual(setup.setupUnmet,[]);
  const f={engine,document:setup.document},deposited=await creditCall(f,{operation:'deposit',coins:101},'owner-source');
  const claim=save(f.document.state.obligations[deposited.claim]);change(claim);
  const premise=applyIntentSetup(engine,f.document,{facts:[{path:['state','obligations',deposited.claim],value:claim}]});assert.deepEqual(premise.setupUnmet,[]);f.document=premise.document;
  const before=save(f.document);
  const out=await engine.reduce(f.document,{tool:'world_act',args:{action:'documents:issue',slots:{source:'owner-source',paper:'item_parchment'}},eventId:'owner-false-source'});
  assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(applyPatches(f.document,out.patches),before);
  assert.equal(f.document.state.player.coins,0);assert.equal(f.document.state.inventory.item_parchment.quantity,1);
 }
});

test('O: natural summon expiry ends the same restored upkeep and never charges a new opening fee',async()=>{
 const {document,summon,upkeep}=await nativeSummon(),expires=document.state.effects[summon].expires;
 const out=write(document,d=>advanceSummons(d,expires));
 assert.equal(out.document.state.effects[summon],undefined);assert.equal(obligationView(out.document.state,upkeep).closed,true);
 assert.equal(out.document.state.obligations[upkeep].endedAt,expires);assert.equal(out.document.state.player.coins,document.state.player.coins);clean(out.document);
});

test.todo('P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
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

test('P: source links identify the same physical subject, and unrelated, missing or forged documents fail',async()=>{
 // S4-05: native issuance derives ownership, subject, content and links from
 // the actual purchase. Caller-supplied provenance cannot replace these facts.
 const f=await documentScene(engine,initial,{prefix:'owner-source'}),paper=f.document.state.itemInstances[f.id];
 assert.equal(paper.document.describes,f.target);assert.equal(paper.document.sourceEvent,f.source);
 const valid={source:'owner-source-goods',paper:'item_parchment',kind:'receipt'};
 const invalid=[{source:'missing-purchase'},{source:'owner-source-issue:issued'},
  {owner:'npc_hw_shendu'},{describes:'missing-item'},{content:{identifies:'wrong-cargo'}},{links:['missing-event']}];
 for(let i=0;i<invalid.length;i++){
  const before=save(f.beforeIssue),out=await engine.reduce(f.beforeIssue,{tool:'world_act',eventId:`invalid-original-${i}`,args:{action:'documents:issue',slots:{...valid,...invalid[i]}}});
  assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(out.patches,[]);assert.deepEqual(save(f.beforeIssue),before);
 }
 const missing=await engine.reduce(f.beforeIssue,{tool:'world_act',eventId:'missing-blank',args:{action:'documents:issue',slots:{...valid,paper:'item_quill_set'}}});
 assert.equal(missing.result.receipt.status,'rejected');assert.deepEqual(missing.patches,[]);clean(f.document);
});

test.todo('Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
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

test('Q: case handler is derived from the present office holding, not a copied incumbent',async()=>{
 // S4-06/05 5.3: replacement and removal are actual appointment actions.
 // This independent trial fixture also keeps the appointing authority on
 // duty through the review wait, matching the office-world isolation above.
 const trialWorld=await loadWorld();delete trialWorld.rules.householdSubsistence;
 const f=await nativeTrial({world:trialWorld}),id=f.case,npc=trialPeople.handler;
 trialScene(f,'bld_bs_watch',[npc]);
 assert.equal(currentCaseHandler(f.engine,f.document,id,npc),true);assert.deepEqual(caseProcedureView(f.engine,f.document,id).handler,[npc]);
 const office=f.document.state.records[id].handlerOffice;
 f.document=(await appointedClaimClerk(f.engine,f.document,{name:office})).document;
 trialScene(f,'bld_bs_watch',[npc]);
 assert.equal(currentCaseHandler(f.engine,f.document,id,npc),false);assert.deepEqual(caseProcedureView(f.engine,f.document,id).handler,['player']);
 trialScene(f,'bld_bs_office',['npc_bs_townhead']);
 f.document=(await officeCall(f.engine,f.document,'remove',{name:office,authority:'npc_bs_townhead'},'handler-removal')).document;
 trialScene(f,'bld_bs_watch',[npc]);
 assert.equal(currentCaseHandler(f.engine,f.document,id,npc),false);assert.deepEqual(caseProcedureView(f.engine,f.document,id).handler,[]);
});

test.todo('Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 for(const change of [s=>s.cases[0].sourceEvent='a3v2_052_judgment',s=>s.cases[0].parties=['missing'],s=>s.cases[0].defendant='npc_hw_shendu',s=>s.history.find(h=>h.verb==='judged').subject='other-case']){
  const bad=load('052',change);assert.ok(ownedErrors(bad).some(e=>e.item==='cases[0]'));assert.equal(bad.document.state.records.a3v2_052_case,undefined);
 }
 const document=save(load('055').document);assert.throws(()=>write(document,d=>restoreCaseSnapshot(d,engine,{id:'forged',court:document.state.location,stage:'pending',parties:['player'],sourceEvent:'missing'},{origin:'initial'})),/registration/);
});

const legalRequests=[['051','report'],['052','appeal'],['053','confess'],['055','hire_advocate'],['056','claim'],['058','bribe']];
const legalArgs=(id,operation)=>{const effect=corpus.find(r=>r.id===`A3V2-${id}`).proposal.effects[0];return {operation,request:{...save(effect.payload),target:effect.target,visibility:effect.visibility}};};

test.todo('P/Q: legal requests consume native incidents, papers, cases and current offices without inventing outcomes〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 for(const [id,operation]of legalRequests){
  const document=save(load(id).document),before=save(document),eventId=`legal-${id}`;
  const out=write(document,d=>lawAction.call(engine,d,legalArgs(id,operation),eventId)),request=lawView(engine,out.document).requests.find(r=>r.id===out.result.request);
  assert.equal(out.result.submitted,true,id);assert.equal(out.result.accepted,null,id);assert.ok(request,id);assert.ok(request.sourceEvents.length,id);
  assert.equal(out.document.state.player.coins,before.state.player.coins,id);assert.equal(out.document.state.minute,before.state.minute,id);
  assert.equal(Object.values(out.document.state.records).filter(r=>r.category==='legal_case').length,Object.values(before.state.records).filter(r=>r.category==='legal_case').length,id);
  for(const [key,row]of Object.entries(before.state.records).filter(([,r])=>r.category==='legal_case')){
   assert.equal(out.document.state.records[key].stage,row.stage,id);assert.deepEqual(out.document.state.records[key].judgment,row.judgment,id);
   assert.equal(out.document.state.records[key].representation,undefined,id);
  }
  if(['051','052','056'].includes(id))assert.equal(request.evidence.length,1,id);
  const replay=write(out.document,d=>lawAction.call(engine,d,legalArgs(id,operation),eventId));assert.deepEqual(replay.patches,[],id);clean(out.document);
 }
});

test.todo('Q: ordinary law actions also read restored cases before demanding adjudication powers〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 for(const [id,operation,authority]of [['052','appeal','npc_bs_031_1'],['055','hire_advocate','npc_hw_luqing'],['058','bribe','npc_bs_032_1']]){
  const document=save(load(id).document),out=write(document,d=>lawAction.call(engine,d,{operation,case:`a3v2_${id}_case`,authority,...(id==='058'?{coins:10}:{})},`direct-${id}`));
  assert.equal(out.result.submitted,true,id);assert.equal(out.result.accepted,null,id);assert.equal(out.document.state.player.coins,document.state.player.coins,id);
  assert.equal(lawView(engine,out.document).requests[0].case,`a3v2_${id}_case`,id);clean(out.document);
 }
});

test.todo('P/Q: absent authority, private incidents, expired appeal, forged paper and unagreed defence remain rejected〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 const badCases=[
  ['051','report',s=>s.status.npc_bs_032_1.onDuty=false],
  ['051','report',s=>{s.history[0].witnesses=[];s.knowledge=[];}],
  ['052','appeal',s=>s.cases[0].appealDeadline=599],
  ['052','appeal',s=>s.documents[0].reviewed=true],
  ['053','confess',s=>{s.history[0].actor='npc_hw_wushuo';s.knowledge=[];}],
  ['055','hire_advocate',s=>s.vocations[0].conflictOfInterest=true],
  ['055','hire_advocate',s=>s.history.find(h=>h.scope==='negotiate_defence').revoked=true],
  ['056','claim',s=>s.documents[0].links=[]],
  ['058','bribe',s=>s.status.npc_bs_032_1.onDuty=false],
 ];
 for(const [id,operation,change]of badCases){
  const document=save(load(id,change).document),before=save(document);
  assert.throws(()=>write(document,d=>lawAction.call(engine,d,legalArgs(id,operation),`bad-${id}`)),undefined,id);assert.deepEqual(document,before,id);clean(document);
 }
 const document=save(load('058').document);
 assert.throws(()=>write(document,d=>lawAction.call(engine,d,{...legalArgs('058','bribe'),actor:'npc_bs_032_1'},'forged-request')),/caller/);
 assert.throws(()=>write(document,d=>lawAction.call(engine,d,{operation:'pay',request:{}},'invalid-kind')),/kind/);
});

test.todo('P/Q: native legal requests survive real campaign export/import and replay〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',async t=>{
 const directory=await fs.mkdtemp(path.join(process.cwd(),'.a3-owner-ding-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=async(document,input)=>{const out=write(document,d=>lawAction.call(engine,d,input.args,input.eventId));return {patches:out.patches,result:out.result};};
 const store=new CampaignStorage(directory,{reducer,snapshotEvery:3});
 for(const [id,operation]of legalRequests){
  const document=save(load(id).document),campaign=`request_${id}`,input={args:legalArgs(id,operation),eventId:`saved-request-${id}`},request={id:input.eventId,input};
  await store.create({id:campaign,worldVersion:'a3-owner-ding2',document});const first=await store.transact(campaign,request,reducer);
  const bundle=save(await store.export(campaign)),fresh=new CampaignStorage(directory,{reducer}),restored=await fresh.import(bundle,`${campaign}_copy`);
  assert.deepEqual(save(restored.document),save((await store.read(campaign)).document));
  assert.deepEqual((await fresh.transact(`${campaign}_copy`,request,reducer)).result,first.result);assert.equal(lawView(engine,restored.document).requests.length,1);clean(restored.document);
 }
});

test.todo('Q: an incapacitated incumbent cannot receive a new request or appear as a current handler〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕',()=>{
 for(const status of ['昏迷','失能']){
  const document=save(load('058').document);document.state.npcs.npc_bs_032_1.status=status;
  assert.equal(currentCaseHandler(engine,document,'a3v2_058_case','npc_bs_032_1'),false);
  assert.throws(()=>write(document,d=>lawAction.call(engine,d,legalArgs('058','bribe'),`incapacitated-${status}`)),/cannot currently/);
  assert.equal(document.state.player.coins,10);assert.equal(lawView(engine,document).requests.length,0);clean(document);
 }
});

// 产品原则三.2：组合用例的前提改由真实动作建立——租约+开柜台（N）、存款+具名存单（O）、
// 当物（O）、施法召唤维持义务（O）；罚款、案件、纸本等机构阶段前提见后面的 S4 todo。
async function nativePawn(prefix='ding-pawn'){
 const scene=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:1,inventory:{item_staff:0},
  itemInstances:[{id:`${prefix}-staff`,template:'thing',kind:'item',item:'item_staff',owner:'player',location:'bld_hw_post',carriedBy:'player',condition:100}],
  holdings:[{id:`${prefix}-title`,kind:'owns',holder:'player',subject:`${prefix}-staff`,terms:{share:1}}]});
 assert.deepEqual(scene.setupUnmet,[]);
 const loaded=await runPrelude(engine,scene.document,[{tool:'world_act',args:{action:'core:trade.pawn',slots:{seller:'npc_hw_shendu',item:'item_staff',quantity:1,coins:1,days:1}},eventId:prefix}]);
 assert.deepEqual(loaded.unmet,[]);return {document:save(loaded.document),contract:`debt_loan_${prefix}`};
}
async function nativePremise(kind){
 if(kind==='counter'){const f=await nativeCounter();await f.open();return {document:save(f.document),input:{kind:'counter'}};}
 if(kind==='withdraw'){const f=await nativeDeposit(engine,initial,{prefix:'ding-deposit',vaultCash:50});return {document:save(f.document),claim:f.claim,input:{kind:'withdraw'}};}
 if(kind==='pawn'){const p=await nativePawn();return {document:p.document,contract:p.contract,input:{kind:'pawn',contract:p.contract}};}
 const s=await nativeSummon();return {document:s.document,upkeep:s.upkeep,input:{kind:'upkeep',summon:s.summon}};
}

test('N–Q: real counter, deposit, pawn and summon-upkeep premises are all loaded without snapshots',async()=>{
 const counter=await nativePremise('counter');
 assert.equal(counter.document.ledger.accounts['player|coin_river|counter'],100);assert.equal(dedicatedCoinAccount(counter.document.state,'player','counter').coins,100);clean(save(counter.document));
 const deposit=await nativePremise('withdraw');
 assert.equal(obligationView(deposit.document.state,deposit.claim).owed,100);assert.equal(obligationRows(deposit.document.state).filter(o=>o.kind==='deposit').length,1);
 assert.equal(deposit.document.state.records.bank_hw_post.accounts.player,100);clean(save(deposit.document));
 const pawn=await nativePremise('pawn'),row=pawn.document.state.records[pawn.contract];
 // W4 F007：旧木杖估值 4×0.5=2 铜，5成放款即本金 1 铜；钱袋 1+1 = 欠款 1+利息1。
 assert.equal(row.principal,1);assert.equal(obligationView(pawn.document.state,pawn.contract).owed,row.amount);assert.equal(pawn.document.state.records[row.pledgeRecord].status,'质押中');
 assert.equal(pawn.document.state.player.coins,row.amount);clean(save(pawn.document));
 const upkeep=await nativePremise('upkeep'),claim=upkeep.document.state.obligations[upkeep.upkeep];
 assert.equal(claim.kind,'upkeep');assert.equal(claim.paid,0);assert.equal(obligationRows(upkeep.document.state).filter(o=>o.kind==='upkeep').length,1);clean(save(upkeep.document));
});

test('N–Q: real campaign export/import and reducer replay retain sources, balances and claims for counter, deposit, pawn and upkeep',async t=>{
 const directory=await fs.mkdtemp(path.join(process.cwd(),'.a3-owner-ding-'));
 assert.equal(path.dirname(directory),process.cwd());
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=async(document,input)=>{
  const d=engine.primitiveDraft(document);let result;
  if(input.kind==='withdraw')result=await engine.trade(d,{operation:'withdraw',seller:'npc_hw_shendu',coins:50},'persist-withdraw');
  if(input.kind==='pawn')result=await engine.trade(d,{operation:'redeem',seller:'npc_hw_shendu',contract:input.contract},'persist-pawn');
  if(input.kind==='upkeep')result=summonAction.call(engine,d,{operation:'dismiss',summon:input.summon},'persist-upkeep');
  if(input.kind==='counter')result=spendCounterCoins(d,engine,{owner:'player',actor:'player',to:'npc_hw_linsui',amount:20,eventId:'persist-counter'});
  return {patches:d.patches,result};
 };
 const store=new CampaignStorage(directory,{reducer,snapshotEvery:3});
 for(const kind of ['withdraw','pawn','upkeep','counter']){
  const premise=await nativePremise(kind),campaign=`ding_${kind}`,input=premise.input;
  await store.create({id:campaign,worldVersion:'a3-owner-ding',document:premise.document});
  const request={id:`native-${kind}`,input},first=await store.transact(campaign,request,reducer),bundle=save(await store.export(campaign));
  const fresh=new CampaignStorage(directory,{reducer}),restored=await fresh.import(bundle,`${campaign}_copy`);
  assert.deepEqual(save(restored.document),save((await store.read(campaign)).document));
  assert.deepEqual((await fresh.transact(`${campaign}_copy`,request,reducer)).result,first.result);clean(restored.document);
 }
});

test.todo('N–Q: the case, fine, paper and office premises of the combined corpus are loaded〔前提待真实动作：S5 能满足的柜台/存单/质押/维持债权已转正式用例；剩余 051/052/054/055/056/057/058/107 需在岗机构身份、已立案阶段、判决/罚款及原始证据纸本；归 S4〕',()=>{
 for(const id of ['051','052','054','055','056','057','058','107']){
  const loaded=load(id);assert.deepEqual(ownedErrors(loaded),[],id);clean(save(loaded.document));
 }
});

test.todo('N–Q: campaign export/import and reducer replay retain the fine claim and the case paper〔前提待真实动作：A3V2-054 罚款需在岗机构与已立案判决，A3V2-052 新收据纸本需机构案件阶段与原始证据文书；柜台/存单/质押/维持债权已转正式用例；归 S4〕',async t=>{
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
 for(const [id,kind] of [['054','fine'],['052','paper']]){
  const loaded=load(id),campaign=`ding_${id}`,input={kind,...(kind==='paper'?{paper:loaded.bindings.a3v2_052_new_receipt}:{}),...(kind==='upkeep'?{summon:loaded.bindings.a3v2_073_water_cup}:{})};
  await store.create({id:campaign,worldVersion:'a3-owner-ding',document:loaded.document});
  const request={id:`native-${id}`,input},first=await store.transact(campaign,request,reducer),bundle=save(await store.export(campaign));
  const fresh=new CampaignStorage(directory,{reducer}),restored=await fresh.import(bundle,`${campaign}_copy`);
  assert.deepEqual(save(restored.document),save((await store.read(campaign)).document));
  assert.deepEqual((await fresh.transact(`${campaign}_copy`,request,reducer)).result,first.result);clean(restored.document);
 }
});
