import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {setupLoaderFields,registerSetupLoader} from '../tools/a3-setup/index.mjs';
import {consent} from '../server-plugin/action-consent.mjs';
import {obligationRows,obligationView} from '../server-plugin/obligation-state.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {purseAccount} from '../server-plugin/items.mjs';
import {serviceAppointments} from '../server-plugin/npc-state.mjs';
import {currentAgreedQuotes} from '../server-plugin/shop.mjs';
import {workstationDefinition} from '../server-plugin/workstation-services.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';
const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3e-institutions');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
const fixture=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`).setup);
const run=setup=>applyIntentSetup(engine,initial,setup);
const errors=(result,field)=>result.setupUnmet.filter(e=>e.item===field||e.item.startsWith(`${field}[`));
const history=(id,verb,rest={})=>({id,verb,at:599,source:{kind:'corpus_premise',row:'A3V2-TEST'},actor:'player',...rest});
const clean=result=>assert.deepEqual(reconcile(engine,result.document),{mismatches:[],lots:[],drift:[],audit:[]});

test('institutions: all ten fields register before later modules',()=>{
 for(const field of ['history','accounts','obligations','documents','cases','permits','examinations','appointments','quotes','workstationAccess'])assert.ok(setupLoaderFields().includes(field));
 // The downstream consumer uses the public binding contract, not raw IDs.
 registerSetupLoader({fields:['a3eBindingProbe'],order:31,load(ctx){assert.equal(ctx.ref('old-paid'),'world_event:old-paid');assert.equal(ctx.document.state.records[ctx.ref('old-paid')].minute,599);}});
 assert.deepEqual(run({minute:600,history:[history('old-paid','paid',{amount:5})],a3eBindingProbe:true}).setupUnmet,[]);
});

test('history: native event sources preserve old payment and trade without replaying wealth',()=>{
 const before=structuredClone(initial),setup={minute:2340,coins:5,inventory:{item_bread:1},history:[history('paid-before','paid',{amount:5}),history('earned-before','trade_completed',{at:2339,atDay:1,netCoins:5,acquired:[{item:'item_bread',quantity:1}],openingStockOnly:true})]};
 const result=run(setup);
 assert.deepEqual(result.setupUnmet,[]);assert.equal(result.document.state.player.coins,5);assert.equal(result.document.state.inventory.item_bread.quantity,1);
 const event=result.document.state.records[result.bindings['earned-before']];
 assert.equal(event.category,'world_event');assert.equal(event.minute,2339);assert.deepEqual(event.payload.acquired,setup.history[1].acquired);
 assert.equal(event.visibility,'private');assert.deepEqual(event.witnesses,[]);assert.deepEqual(initial,before);clean(result);
});

test('history: only explicit unconditional donor consent becomes native scoped consent',()=>{
 const result=run({minute:600,present:['npc_hw_sulan'],history:[history('observe-only','consented',{actor:'npc_hw_sulan',to:'player',scope:'observe',subject:'weaving',terms:{},expires:800,revoked:false})]});
 assert.deepEqual(result.setupUnmet,[]);assert.equal(result.document.state.minute,600);
 const context={engine,document:result.document};
 assert.equal(consent(context,'npc_hw_sulan','player','observe',{purpose:'weaving'}).allowed,true);
 assert.equal(consent(context,'npc_hw_sulan','player','teach',{purpose:'weaving'}).allowed,false);
 assert.equal(consent(context,'npc_hw_sulan','player','observe',{purpose:'other'}).allowed,false);
 assert.equal(consent(context,'npc_hw_sulan','player','observe',{purpose:'weaving',until:800}).allowed,false);
 assert.equal(result.document.state.consentEvents[0].at,599);
});

test('history: conditional consent and refusals never grant broader agreement',()=>{
 const conditional=run(fixture('012'));
 // Native conditional consent now exists (06 §6.4); it only covers its terms.
 assert.deepEqual(errors(conditional,'history'),[]);
 const context={engine,document:conditional.document};
 assert.equal(consent(context,'npc_hw_ayan','player','teach',{purpose:'recipe_wooden_pegs',terms:{fee:4,minutes:30},until:630}).allowed,true);
 assert.equal(consent(context,'npc_hw_ayan','player','teach',{purpose:'recipe_wooden_pegs',terms:{fee:3,minutes:30},until:630}).allowed,false);
 assert.equal(consent(context,'npc_hw_ayan','player','teach',{purpose:'other',terms:{fee:4,minutes:30}}).allowed,false);
 const refusal=run(fixture('097'));
 assert.deepEqual(errors(refusal,'history'),[]);
 assert.equal(refusal.document.state.records[refusal.bindings.a3v2_097_refused_heal].payload.verb,'refused');
 assert.ok(!refusal.document.state.consentEvents?.some(e=>e.from==='npc_hw_wushuo'));
});

test('history: illegal/future/duplicate/unknown-donor events are unmet and independent events survive',()=>{
 for(const bad of [history('bad','paid',{at:601}),history('bad','paid',{source:{kind:'proposal_consent',row:'A3V2-TEST'}}),history('bad','paid',{actor:'missing:npc'}),history('bad','paid',{amount:-1})]){
  const result=run({minute:600,history:[bad,history('good','paid')]});
  assert.equal(errors(result,'history').length,1);assert.equal(result.bindings.bad,undefined);assert.equal(result.bindings.good,'world_event:good');
 }
 const duplicate=run({minute:600,history:[history('same','paid'),history('same','paid')]});
 assert.equal(errors(duplicate,'history').length,1);
 assert.equal(Object.values(duplicate.document.state.records).filter(r=>r.id==='same').length,1);
 const noActor=run({minute:600,history:[{id:'fire','verb':'ignited',at:599,source:{kind:'corpus_premise',row:'A3V2-TEST'},subject:'box',fireIntensity:1}]});
 // 01 §1.7 supports actorless physical history without forging an actor.
 assert.deepEqual(errors(noActor,'history'),[]);
 assert.equal(noActor.document.state.records[noActor.bindings.fire].actor,null);
 assert.equal(noActor.document.state.records[noActor.bindings.fire].payload.fireIntensity,1);
});

test('accounts: stock opening stays plain inventory; coin premises require real actions without changing purses',()=>{
 // 产品原则三.2：库存数量仍可声明，货币债权须由真实动作产生。
 // 保留原有玩家不变、库存精确值及账本一致性检查；钱袋改查拒绝后仍为原余额。
 for(const id of ['002','039','044','078']){
  const setup=fixture(id),result=run(setup);
  const coins=setup.accounts.map((account,index)=>({account,index})).filter(({account})=>account.resource==='coin_river');
  assert.deepEqual(errors(result,'accounts').map(e=>e.item),coins.map(({index})=>`accounts[${index}]`),id);
  assert.ok(errors(result,'accounts').every(e=>e.reason.includes('setup.prelude')),id);
  assert.equal(result.document.state.player.coins,setup.coins,id);
  for(const account of setup.accounts){const body=result.document.state.npcs[account.owner];assert.equal(account.resource==='coin_river'?body.coins:body.inventory[account.resource].quantity,account.resource==='coin_river'?initial.state.npcs[account.owner].coins:account.balance,id);}
  clean(result);
 }
 const setup={minute:600,accounts:[{owner:'npc_hw_linsui',resource:'coin_river',purpose:'purse',balance:0,balanceMode:'ensure_existing',sourceEvent:'opening'}],history:[history('opening','opening_balance',{owner:'npc_hw_linsui',resource:'coin_river',balance:0})]};
 const result=run(setup);assert.deepEqual(errors(result,'accounts').map(e=>e.item),['accounts[0]']);assert.match(errors(result,'accounts')[0].reason,/setup\.prelude/);assert.equal(result.document.state.npcs.npc_hw_linsui.coins,initial.state.npcs.npc_hw_linsui.coins);clean(result);
});

test.todo('accounts: native counter opening is separate from purse; invalid/container and mismatched sources stay unmet〔前提待真实动作：独立柜台账户开户；归 S5〕',()=>{
 const setup=fixture('002');setup.accounts[0].balance=-1;assert.equal(errors(run(setup),'accounts').length,1);
 setup.accounts[0].balance=3;assert.match(errors(run(setup),'accounts')[0].reason,/does not match/);
 // N is implemented: 01 §1.6 requires a distinct native counter, not an unmet placeholder.
 const counter=run(fixture('082'));assert.deepEqual(errors(counter,'accounts'),[]);
 assert.equal(counter.document.ledger.accounts['npc_hw_linsui|coin_river|counter'],100);
 assert.equal(counter.document.state.npcs.npc_hw_linsui.coins,initial.state.npcs.npc_hw_linsui.coins);clean(counter);
 // The physical M adapter now binds the original purse (01 §1.2/1.6), not a second coin store.
 const container=run(fixture('096'));assert.deepEqual(errors(container,'accounts'),[]);
 const account=purseAccount(engine.primitiveDraft(container.document),engine,container.bindings.a3v2_096_purse);
 assert.equal(container.document.ledger.accounts[account],10);assert.equal(container.document.state.npcs.npc_hw_yanzhe.coins,10);clean(container);
 const badContainer=fixture('096');badContainer.accounts[0].container='missing:purse';assert.equal(errors(run(badContainer),'accounts').length,1);
 const missing=fixture('002');missing.accounts[0].sourceEvent='missing';assert.match(errors(run(missing),'accounts')[0].reason,/unresolved sourceEvent/);
});

// Product principle III.2: retain amount/time/one-claim checks on genuinely funded loans,
// then round-trip their native signatures instead of injecting historical debt snapshots.
test('obligations: native old loans retain amount/time and share one compatibility claim',async()=>{
 const step=(operation,seller,coins,eventId,extra={})=>({tool:'world_act',eventId,args:{action:`core:trade.${operation}`,slots:{seller,coins,days:1,...extra}}});
 const grant=(actor,principal,interest,id)=>history(id,'consented',{actor,to:'player',scope:'loan',subject:'player',terms:{principal,days:1,interest},expires:5000,revoked:false});
 for(const id of ['035','040','049','078']){
  const original=fixture(id),lending=['040','078'].includes(id),principal=id==='035'||id==='078'?29:9;
  const setup={...original,minute:id==='078'?1080:600,inventory:{item_iron:100},coins:id==='035'?1:id==='040'?10:id==='078'?50:0,obligations:[],accounts:[],history:[],prelude:[]};
  if(lending){const borrower=id==='040'?'npc_hw_ayan':'npc_hw_wushuo',amount=id==='040'?10:50;setup.history.push(grant(borrower,amount,0,'native-borrower-offer'));setup.prelude.push(step('lend',borrower,amount,`native-${id}-lend`,{interest:0}));}
  if(id!=='040'){
   setup.history.push(grant('npc_hw_linsui',principal,1,'native-lender-offer'));
   setup.prelude.push(step('borrow','npc_hw_linsui',principal,`native-${id}-borrow`,{item:'item_iron',quantity:10}));
   if(id!=='035')setup.prelude.push({tool:'world_propose',eventId:`native-${id}-gift`,args:{intent:'give borrowed principal',target:'npc_hw_linsui',effects:[{op:'transfer',resource:'coin',from:'self',to:'npc_hw_linsui',qty:principal}]}});
  }
  const loaded=run(setup);assert.deepEqual(loaded.setupUnmet,[],id);
  const result=await runPrelude(engine,loaded.document,setup.prelude);assert.deepEqual(result.unmet,[],id);
  const document=JSON.parse(JSON.stringify(result.document)),claims=obligationRows(document.state).filter(o=>o.kind==='loan');
  assert.equal(claims.length,original.obligations.length,id);
  assert.deepEqual(claims.map(o=>o.amount).sort((a,b)=>a-b),original.obligations.map(o=>o.amount).sort((a,b)=>a-b),id);
  for(const native of claims){
   assert.equal(native.paid,0);assert.equal(native.createdAt,native.terms.signingMinute);assert.equal(native.deadline-native.createdAt,1440);
   assert.equal(document.state.records[native.legacyRecord].obligation,native.id);
   assert.equal(obligationRows(document.state).filter(o=>o.id===native.id).length,1);
   assert.equal(obligationView(document.state,native.id).owed,native.amount);
   assert.deepEqual(native,JSON.parse(JSON.stringify(result.document.state.obligations[native.id])));
  }
  assert.equal(document.state.player.coins,original.coins);assert.equal(document.state.minute,result.document.state.minute);
  assert.ok(document.state.minute>=setup.minute);clean({document});
 }
});

test.todo('obligations: native old deposits/pawns/fines/delivery/upkeep preserve claims without fresh funding〔前提待真实动作：建立具名存单、质押、罚款、货损及维持债权的真实组合前提；归 S5〕',()=>{
 for(const id of ['032','037','054','056','073']){
  const setup=fixture(id),result=run(setup);assert.deepEqual(errors(result,'obligations'),[],id);
  assert.equal(result.document.state.player.coins,setup.coins,id);
  // O imports existing obligations (01 §1.4, 06 §6.3); it must not open or fund them again.
  for(const row of setup.obligations){
   const native=result.document.state.obligations[result.bindings[row.id]];
   assert.equal(native.amount,row.amount,id);assert.equal(native.paid,row.paid??0,id);
   assert.equal(native.createdAt,row.openedAt,id);assert.equal(native.deadline,row.dueAt,id);
   assert.equal(obligationRows(result.document.state).filter(o=>o.id===native.id).length,1,id);
  }
  clean(result);
 }
 const setup=fixture('035');setup.obligations[0].paid=31;
 // Native O validation now rejects the same overpayment; no assertion of rejection is removed.
 assert.match(errors(run(setup),'obligations')[0].reason,/Invalid historical obligation snapshot or source/);
 setup.obligations[0].paid=0;setup.obligations[0].sourceEvent='missing';assert.match(errors(run(setup),'obligations')[0].reason,/unresolved sourceEvent/);
});

test.todo('documents: native evidence annotates the same original and preserves its source, never creates a second sheet〔前提待真实动作：创建带原始来源及实物指向的证据文书；归 S4〕',()=>{
 const result=run(fixture('051'));
 // P is implemented: 01 §1.2 / 05 §5.2.7 bind evidence to its physical original.
 assert.deepEqual(errors(result,'documents'),[]);
 const id=result.bindings.a3v2_051_evidence,paper=result.document.state.itemInstances[id];
 assert.equal(paper.document.sourceEvent,result.bindings.a3v2_051_purchase_receipt);
 assert.equal(paper.document.describes,result.bindings.a3v2_051_grain_sack);
 assert.equal(result.document.state.inventory.item_parchment.quantity,1);
 assert.equal(Object.values(result.document.state.itemInstances).filter(p=>p.document?.sourceEvent===paper.document.sourceEvent).length,1);clean(result);
 // Native P validates the same malformed reviewed flag at the existing-paper boundary.
 const setup=fixture('051');setup.documents[0].reviewed='yes';assert.match(errors(run(setup),'documents')[0].reason,/Invalid existing paper, holder or document source/);
});

test.todo('cases: native historical registration retains the existing phase and judgment, never convicts from an emit〔前提待真实动作：产生案件登记、判决及上诉期限；归 S4〕',()=>{
 // Q is implemented: 05 §5.2.7 restores registration and judgment sources, not fresh decisions.
 const result=run(fixture('052'));assert.deepEqual(errors(result,'cases'),[]);
 const row=result.document.state.records[result.bindings.a3v2_052_case];
 assert.equal(row.stage,'judged');assert.equal(row.sourceEvent,result.bindings.a3v2_052_case_registered);
 assert.equal(row.judgment.sourceEvent,result.bindings.a3v2_052_judgment);assert.equal(row.appealDeadline,2040);
 assert.equal(row.offense,undefined);assert.equal(row.judgment.fine,undefined);
 assert.equal(Object.values(result.document.state.records).filter(r=>r.category==='legal_case'&&r.sourceEvent===row.sourceEvent).length,1);clean(result);
 const setup=fixture('052');setup.cases[0].stage='erased';assert.match(errors(run(setup),'cases')[0].reason,/Invalid historical case/);
});

test('permits: native existing rental authority is retained; unresolved managers and expanded scopes are unmet',()=>{
 assert.deepEqual(errors(run(fixture('003')),'permits'),[]);
 // The authored school manager now signs a real limited grant (05 §5.3).
 const result=run(fixture('008'));assert.deepEqual(errors(result,'permits'),[]);
 assert.equal(result.document.state.records['limited_permit:a3v2_008_permit_0'].issuer,'npc_hw_luqing');
 const invalid=fixture('008');invalid.permits[0].toMinute=1;assert.match(errors(run(invalid),'permits')[0].reason,/invalid permit interval/);
 invalid.permits[0].toMinute=2040;invalid.permits[0].scope='unlimited';assert.match(errors(run(invalid),'permits')[0].reason,/mismatch/);
 const unknown=fixture('013');unknown.permits[0].issuer={role:'authorized_manager',of:'missing:place'};
 assert.match(errors(run(unknown),'permits')[0].reason,/selector/);
});

test('examinations: valid pending seat never certifies the registrar; passed input is illegal',()=>{
 const result=run(fixture('020'));assert.match(errors(result,'examinations')[0].reason,/考官.*06/);
 assert.deepEqual(result.document.state.professions,initial.state.professions);
 const setup=fixture('020');setup.examinations[0].passed=true;assert.match(errors(run(setup),'examinations')[0].reason,/invalid pending examination/);
});

test('appointments: agreed service windows reach native booking without inventing vocations',()=>{
 // 06 §6.3: the implemented E connector restores a window, not a vocation.
 const result=run(fixture('002'));assert.deepEqual(errors(result,'appointments'),[]);
 assert.ok(serviceAppointments(result.document.state,'npc_hw_linsui').length);
 assert.equal(result.document.state.npcs.npc_hw_linsui.vocation,initial.state.npcs.npc_hw_linsui.vocation);
 const setup=fixture('002');setup.appointments[0].end=setup.appointments[0].start;assert.match(errors(run(setup),'appointments')[0].reason,/invalid service appointment/);
});

test('quotes: real quantity/price/direction/expiry and remittance fees reach native quote consumers',()=>{
 for(const id of ['002','038','039']){
  // 01 §1.6 / 06 §6.8: F imports source-backed terms without replaying trade.
  const result=run(fixture(id));assert.deepEqual(errors(result,'quotes'),[],id);
  assert.ok(currentAgreedQuotes(result.document.state).length,id);
  assert.equal(result.document.state.player.coins,fixture(id).coins,id);
 }
 const setup=fixture('002');setup.quotes[0].quantity=0;assert.match(errors(run(setup),'quotes')[0].reason,/invalid quote terms/);
 setup.quotes[0].quantity=2;setup.quotes[0].totalCoins=999;
 const forged=run(setup);
 // The native quote writer now owns the source comparison and rejects before storing.
 assert.match(errors(forged,'quotes')[0].reason,/Invalid agreed quote actor, source or validity/);
 assert.equal(currentAgreedQuotes(forged.document.state).length,0);
});

test('workstationAccess: public unpaid native station stays chargeable; old prepay is never refunded or charged again',()=>{
 const setup=fixture('021'),result=run(setup);assert.deepEqual(errors(result,'workstationAccess'),[]);assert.equal(result.document.state.player.coins,setup.coins);
 // 06 §6.6: G now restores prepaid access; restoration neither charges nor refunds.
 const paid=run(fixture('025'));assert.deepEqual(errors(paid,'workstationAccess'),[]);assert.equal(paid.document.state.player.coins,0);
 assert.ok(workstationDefinition(engine,paid.document.state,'station_bs_small_kiln'));
 const invalid=fixture('021');invalid.workstationAccess[0].fee=-1;assert.match(errors(run(invalid),'workstationAccess')[0].reason,/invalid workstation access/);
});

test('institutions: every field rejects malformed containers and non-object entries as unmet',()=>{
 for(const field of ['history','accounts','obligations','documents','cases','permits','examinations','appointments','quotes','workstationAccess']){
  assert.equal(errors(run({[field]:{}}),field).length,1,field);
  assert.equal(errors(run({[field]:[null]}),field).length,1,field);
 }
});
