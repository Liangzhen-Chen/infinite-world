import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup,executeIntent} from '../tools/a3-score.mjs';
import {limitedPermit,currentControllers} from '../server-plugin/action-authority.mjs';
import {consent} from '../server-plugin/action-consent.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';
import {obligationRows,obligationView} from '../server-plugin/obligation-state.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.initialFromLegacy(seed,'jia3-test');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
const row=n=>structuredClone(corpus.find(r=>r.id===`A3V2-${n}`));
const offer=(actor,principal,interest,id)=>({id,verb:'consented',actor,to:'player',scope:'loan',subject:'player',terms:{principal,days:1,interest},at:599,expires:5000,revoked:false,source:{kind:'corpus_premise',row:'A3CR'}});
const loanStep=(operation,seller,coins,eventId,extra={})=>({tool:'world_act',eventId,args:{action:`core:trade.${operation}`,slots:{seller,coins,days:1,...extra}}});
const giveStep=coins=>({tool:'world_propose',eventId:'jia3-give-principal',args:{intent:'赠送林穗借来的铜钱',target:'npc_hw_linsui',effects:[{op:'transfer',resource:'coin',from:'self',to:'npc_hw_linsui',qty:coins}]}});
function realLoanInput(id){
 const input=row(id),receivable='finance:debt_lend_jia3-receivable',payable='finance:debt_loan_jia3-payable',principal=id==='078'?29:9;
 // 产品原则三.2：借款、放款和资金去向均用真实动作；应还30/10包含现行1铜利息。
 input.setup={...input.setup,coins:id==='078'?50:0,inventory:{item_iron:100},accounts:[],obligations:[],history:[offer('npc_hw_linsui',principal,1,'jia3-lender-offer')],prelude:[]};
 if(id==='078'){
  // scheduleAt 的现行预约覆盖至18时，届时两位当事人都回到客栈。
  input.setup.minute=1080;
  input.setup.history.push(offer('npc_hw_wushuo',50,0,'jia3-borrower-offer'),{id:'jia3-repay-offer',verb:'consented',actor:'npc_hw_wushuo',to:'player',scope:'repay',subject:receivable,terms:{amount:50},at:599,expires:5000,revoked:false,source:{kind:'corpus_premise',row:'A3CR'}});
  input.setup.prelude.push(loanStep('lend','npc_hw_wushuo',50,'jia3-receivable',{interest:0}));
  input.proposal.effects[1].id=receivable;input.proposal.effects[3].id=payable;
 }else input.proposal.effects[0].terms.fulfills=payable;
 input.setup.prelude.push(loanStep('borrow','npc_hw_linsui',principal,'jia3-payable',{item:'item_iron',quantity:10}),giveStep(principal));
 return input;
}
const load=n=>applyIntentSetup(engine,initial,row(n).setup);
const clean=document=>assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
const act=async(document,action,slots,eventId)=>{
 const out=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId});
 return {document:applyPatches(document,out.patches),result:out.result};
};

test('jia3: school manager and collective mill issuer load native finite permits without a new office holder',()=>{
 for(const n of ['008','012','014','018','072']){
  const loaded=load(n),permit=row(n).setup.permits[0],document=JSON.parse(JSON.stringify(loaded.document));
  assert.deepEqual(loaded.setupUnmet.filter(x=>/^(history|permits)/.test(x.item)),[],n);
  const grant=limitedPermit({engine,document},'player',permit.subject,permit.scope);
  assert.equal(grant.issuer,n==='012'?'loc_hw':'npc_hw_luqing');
  assert.equal(document.state.records[grant.sourceEvent].actor,grant.issuer);
  const expired=structuredClone(document);expired.state.minute=permit.toMinute;
  assert.equal(limitedPermit({engine,document:expired},'player',permit.subject,permit.scope),null);
  assert.equal(limitedPermit({engine,document},'player',permit.subject,'unlimited'),null);
 }
 const document=load('014').document;
 assert.deepEqual(currentControllers({engine,document},'bld_hw_school'),['npc_hw_luqing']);
 const incapacitated=structuredClone(document);incapacitated.state.npcs.npc_hw_luqing.status='昏迷';
 assert.equal(limitedPermit({engine,document:incapacitated},'player','bld_hw_school','read'),null);
});

test('jia3: native known-skill lessons charge the teacher fee, retain fractions and book source, and replay exactly',async()=>{
 for(const n of ['015','018']){
  const r=await executeIntent(engine,initial,row(n));
  assert.deepEqual(r.setupUnmet,[]);assert.equal(r.actual.route,'core:learn');assert.equal(r.actual.committed,true);
  assert.ok(r.document.state.skills.skill_literacy.proficiency>r.before.state.skills.skill_literacy.proficiency);
  const lesson=r.document.state.learning[`a3-score-A3V2-${n}`];
  assert.equal(lesson.source.type,n==='015'?'teacher':'book');
  if(n==='018'){
   assert.equal(lesson.source.id,'item_literacy_primer');
   assert.equal(r.document.state.itemInstances[lesson.source.instance].item,lesson.source.id);
  }
  assert.equal(lesson.cost,n==='015'?2:0);
  assert.equal(r.document.state.minute-r.before.state.minute,n==='015'?60:120);
  assert.equal(r.document.state.player.coins,r.before.state.player.coins-lesson.cost);
  if(n==='015')assert.equal(r.document.state.skills.skill_literacy.practiceCarry,.4);
  const replay=await engine.reduce(r.before,r.submitted);
  assert.deepEqual(applyPatches(r.before,replay.patches),r.document);clean(r.document);
  // The same explicit mode has the same behavior through the old alias.
  // 06 §6.9.1: confirmation retains the proposal; the old alias still receives
  // the same routed native slots, not the proposal's effects as learn args.
  const alias=await engine.reduce(r.before,{tool:'world_learn',eventId:`jia3-alias-${n}`,args:r.prepared.slots});
  const aliased=applyPatches(r.before,alias.patches);
  assert.equal(aliased.state.skills.skill_literacy.proficiency,r.document.state.skills.skill_literacy.proficiency);
  assert.equal(aliased.state.player.coins,r.document.state.player.coins);
  assert.equal(aliased.state.minute,r.document.state.minute);clean(aliased);
 }
 const acquisition=load('015').document;
 await assert.rejects(engine.reduce(acquisition,{tool:'world_learn',eventId:'jia3-repeat-acquire',args:{entity:'skill_literacy',source:'npc_hw_luqing'}}),/已经学会/);
 const document=load('018').document,copy=document.state.inventory.item_literacy_primer.instances[0];
 document.state.itemInstances[copy].durability=0;
 const broken=await act(document,'core:learn',{entity:'skill_literacy',source:copy,mode:'study'},'broken-book');
 assert.equal(broken.result.receipt.code,'E-ACTION-LEARN-SOURCE');assert.deepEqual(broken.document,document);
});

test('jia3: busy teacher observation reads the timed source, but co-presence never supplies missing range evidence',async()=>{
 const original=await executeIntent(engine,initial,row('017'));
 assert.equal(original.actual.reasonCode,'E-ACTION-LEARN-OBSERVE');
 assert.match(original.actual.reason,/可见|三十米/);
 const loaded=load('017'),d=engine.primitiveDraft(loaded.document);
 // A separate test establishes real physical contact through its native
 // writer. The corpus itself receives no fabricated contact event.
 assert.equal(recordLocalContact(d,engine,'npc_hw_sulan','jia3-contact'),true);
 const document=applyPatches(loaded.document,d.patches),before=structuredClone(document);
 const result=await act(document,'core:learn',{entity:'skill_life_4_core',source:'npc_hw_sulan',mode:'observe'},'jia3-observe');
 assert.equal(result.result.receipt.status,'committed');
 assert.equal(result.result.receipt.legacy.observed,true);
 assert.equal(result.document.state.player.coins,document.state.player.coins);
 assert.equal(result.document.state.skills.skill_life_4_core.practiceCarry,.85);
 assert.equal(result.document.state.skills.skill_life_4_core.proficiency,10);
 assert.equal(result.document.state.learning['jia3-observe'].source.type,'observation');
 assert.equal(consent({engine,document:result.document},'npc_hw_sulan','player','teach',{purpose:'skill_life_4_core'}).allowed,false);
 assert.deepEqual(document,before);clean(result.document);
 const observerEngine=new WorldEngine(world);
 observerEngine.primitiveTeachingConsent=()=>{throw new Error('Observing must not negotiate a paid lesson');};
 const observed=await observerEngine.reduce(document,{tool:'world_propose',eventId:'jia3-explicit-observe',args:row('017').proposal});
 assert.equal(observed.result.receipt.status,'committed');
 assert.equal(observed.result.receipt.legacy.observed,true);
 assert.equal(applyPatches(document,observed.patches).state.player.coins,document.state.player.coins);
 const short=structuredClone(document);short.state.records.a3v2_017_weaving.toMinute=610;
 const refused=await act(short,'core:learn',{entity:'skill_life_4_core',source:'npc_hw_sulan',mode:'observe'},'short-demo');
 assert.equal(refused.result.receipt.code,'E-ACTION-LEARN-OBSERVE');assert.deepEqual(refused.document,short);
});

test('jia3: lending reads the borrower original interest terms and refuses absent, changed, expired or revoked offers',async()=>{
 const r=await executeIntent(engine,initial,row('034'));
 assert.equal(r.actual.route,'core:trade.lend');assert.equal(r.actual.committed,true);
 const loan=obligationRows(r.document.state).find(o=>o.source==='a3-score-A3V2-034');
 assert.equal(loan.principal,50);assert.equal(loan.interest,0);assert.equal(loan.deadline-loan.createdAt,10*1440);
 assert.equal(r.document.state.player.coins,0);assert.equal(r.document.state.npcs.npc_hw_wushuo.coins,r.before.state.npcs.npc_hw_wushuo.coins+50);clean(r.document);
 for(const mutate of [d=>d.state.consentEvents=[],d=>d.state.consentEvents[0].terms.principal=51,d=>d.state.consentEvents[0].terms.interest=10,d=>d.state.consentEvents[0].until=d.state.minute,d=>d.state.consentEvents.push({type:'consent_revoked',from:'npc_hw_wushuo',consent:d.state.consentEvents[0].id,at:d.state.minute})]){
  const document=load('034').document;mutate(document);const before=structuredClone(document);
  const out=await act(document,'core:trade.lend',{seller:'npc_hw_wushuo',coins:50,days:10,interest:0},'invalid-loan');
  assert.equal(out.result.receipt.code,'E-ACTION-CONSENT');assert.equal(out.result.receipt.applied.length,0);
  assert.deepEqual(out.document,before);
 }
});

test('jia3: debt collection settles the canonical old loan before using received funds, and cannot spend without payer consent',async()=>{
 const r=await executeIntent(engine,initial,realLoanInput('078'));
 assert.deepEqual(r.setupUnmet,[]);
 assert.equal(r.actual.route,'open:proposal');assert.equal(r.actual.committed,true);
 assert.equal(r.document.state.player.coins,20);
 assert.equal(obligationView(r.document.state,'finance:debt_lend_jia3-receivable').owed,0);
 assert.equal(obligationView(r.document.state,'finance:debt_loan_jia3-payable').owed,0);
 // 真实抵押借款在还清时另有退还10份铁料；原断言的两笔资金流仍须严格为50、30。
 assert.deepEqual(r.receipt.applied.filter(e=>e.op==='transfer'&&['coin','coin_river'].includes(e.resource)).map(e=>e.qty),[50,30]);
 assert.equal(r.document.state.inventory.item_iron.quantity,100);clean(r.document);
 // 仅移除还款同意，保留建立真实贷款所必需的原始借款同意。
 const missing=realLoanInput('078');missing.setup.history=missing.setup.history.filter(e=>e.scope!=='repay');
 const denied=await executeIntent(engine,initial,missing);
 assert.equal(denied.actual.committed,false);assert.equal(denied.document.state.player.coins,0);
 assert.deepEqual(denied.setupUnmet,[]);
 assert.equal(obligationView(denied.document.state,'finance:debt_loan_jia3-payable').owed,30);
});

test('jia3: a repayment promise refers to the existing principal and later pays it only once at the agreed place',async()=>{
 const r=await executeIntent(engine,initial,realLoanInput('049'));
 assert.deepEqual(r.setupUnmet,[]);
 assert.equal(r.actual.route,'core:dialogue.promise');assert.equal(r.actual.committed,true);
 const promise=r.document.state.obligations['obl_a3-score-A3V2-049'];
 assert.equal(promise.terms.fulfills,'finance:debt_loan_jia3-payable');assert.equal(promise.amount,0);
 assert.equal(obligationRows(r.document.state).reduce((n,o)=>n+obligationView(r.document.state,o).owed,0),10);
 assert.equal(r.document.state.player.coins,0);assert.equal(obligationView(r.document.state,'finance:debt_loan_jia3-payable').owed,10);clean(r.document);
 // Establish funds as an opening snapshot, then use the real delivery consumer.
 const funded=applyIntentSetup(engine,r.document,{coins:10}).document;
 const d=engine.primitiveDraft(funded),before=d.get('state','npcs','npc_hw_linsui','coins');
 engine.deliver(d,promise.id,promise,'fulfill-linked');
 const done=applyPatches(funded,d.patches);
 assert.equal(done.state.player.coins,0);assert.equal(done.state.npcs.npc_hw_linsui.coins,before+10);
 assert.equal(obligationView(done.state,'finance:debt_loan_jia3-payable').owed,0);clean(done);
 const twice=engine.primitiveDraft(done);engine.deliver(twice,promise.id,promise,'fulfill-linked-again');
 assert.equal(twice.get('state','npcs','npc_hw_linsui','coins'),before+10);
 const wrong=structuredClone(funded);wrong.state.location='loc_hw';
 wrong.state.npcs.npc_hw_linsui.location='loc_hw';
 assert.throws(()=>engine.deliver(engine.primitiveDraft(wrong),promise.id,promise,'wrong-place'),/约定交付地点/);
});

test('jia3: owner consent permits only the selected water spell and target, keeping contamination and revoked grants intact',async()=>{
 // Observe a real successful roll; permission never guarantees spell success.
 let r;
 for(let n=0;n<32;n++){
  r=await executeIntent(engine,engine.initialFromLegacy(seed,`jia3-water-${n}`),row('068'));
  if(r.receipt?.check?.success)break;
 }
 assert.equal(r.receipt.check.success,true);
 assert.equal(r.actual.route,'core:cast');assert.equal(r.actual.committed,true);
 const feature=r.document.state.records['physical_feature:feature_hw_kitchen_bucket'].state;
 assert.equal(feature.turbidity,15);assert.equal(feature.waterMl,8000);
 assert.equal(feature.saltMg,800);assert.equal(feature.toxinUg,16000);assert.equal(feature.pathogenRisk,60);
 assert.ok(r.receipt.applied.some(e=>e.op==='fact.set'&&e.field==='turbidity'&&e.entity==='feature_hw_kitchen_bucket'));clean(r.document);
 for(const mutate of [d=>d.state.consentEvents[0].subject='feature_hw_pool',d=>d.state.consentEvents[0].terms.spell='spell_water_01',d=>d.state.consentEvents[0].until=d.state.minute,d=>d.state.consentEvents.push({type:'consent_revoked',from:'npc_hw_linsui',consent:d.state.consentEvents[0].id,at:d.state.minute})]){
  const document=load('068').document;mutate(document);const before=structuredClone(document);
  const out=await act(document,'core:cast',{spell:'spell_water_02',target:'feature_hw_kitchen_bucket'},'bad-water-consent');
  assert.equal(out.result.receipt.code,'E-ACTION-OWNER-AUTHORITY');assert.deepEqual(out.document,before);
 }
});
