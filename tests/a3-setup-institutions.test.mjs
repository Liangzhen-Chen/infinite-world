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
const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3e-institutions');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
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

test('accounts: opening snapshots replace NPC cash/stock once without changing the player',()=>{
 for(const id of ['002','039','044','078']){
  const setup=fixture(id),result=run(setup);
  assert.deepEqual(errors(result,'accounts'),[],id);assert.equal(result.document.state.player.coins,setup.coins,id);
  for(const account of setup.accounts){const body=result.document.state.npcs[account.owner];assert.equal(account.resource==='coin_river'?body.coins:body.inventory[account.resource].quantity,account.balance,id);}
  clean(result);
 }
 const setup={minute:600,accounts:[{owner:'npc_hw_linsui',resource:'coin_river',purpose:'purse',balance:0,balanceMode:'ensure_existing',sourceEvent:'opening'}],history:[history('opening','opening_balance',{owner:'npc_hw_linsui',resource:'coin_river',balance:0})]};
 const result=run(setup);assert.deepEqual(result.setupUnmet,[]);assert.equal(result.document.state.npcs.npc_hw_linsui.coins,initial.state.npcs.npc_hw_linsui.coins);clean(result);
});

test('accounts: native counter opening is separate from purse; invalid/container and mismatched sources stay unmet',()=>{
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

test('obligations: native old loans retain amount/time and share one compatibility claim',()=>{
 for(const id of ['035','040','049','078']){
  const setup=fixture(id),result=run(setup);
  assert.deepEqual(errors(result,'obligations'),[],id);
  for(const row of setup.obligations){
   const native=result.document.state.obligations[result.bindings[row.id]];
   assert.equal(native.amount,row.amount);assert.equal(native.paid,0);assert.equal(native.createdAt,row.openedAt);assert.equal(native.deadline,row.dueAt);
   assert.equal(result.document.state.records[row.id].obligation,native.id);
   assert.equal(obligationRows(result.document.state).filter(o=>o.id===native.id).length,1);
   assert.equal(obligationView(result.document.state,native.id).owed,row.amount);
  }
  assert.equal(result.document.state.player.coins,setup.coins);assert.equal(result.document.state.minute,setup.minute??600);clean(result);
 }
});

test('obligations: native old deposits/pawns/fines/delivery/upkeep preserve claims without fresh funding',()=>{
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

test('documents: native evidence annotates the same original and preserves its source, never creates a second sheet',()=>{
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

test('cases: native historical registration retains the existing phase and judgment, never convicts from an emit',()=>{
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

test('appointments: agreed service windows report missing native service booking without inventing vocations',()=>{
 const result=run(fixture('002'));assert.match(errors(result,'appointments')[0].reason,/createNpcObligation.*06/);
 assert.equal(result.document.state.npcs.npc_hw_linsui.vocation,initial.state.npcs.npc_hw_linsui.vocation);
 const setup=fixture('002');setup.appointments[0].end=setup.appointments[0].start;assert.match(errors(run(setup),'appointments')[0].reason,/invalid service appointment/);
});

test('quotes: real quantity/price/direction/expiry and remittance fees stay unmet until native quote import exists',()=>{
 for(const id of ['002','038','039']){
  const result=run(fixture(id));assert.match(errors(result,'quotes')[0].reason,/原生报价.*01/,id);
  assert.deepEqual(result.document.state.quotes,initial.state.quotes,id);
 }
 const setup=fixture('002');setup.quotes[0].quantity=0;assert.match(errors(run(setup),'quotes')[0].reason,/invalid quote terms/);
 setup.quotes[0].quantity=2;setup.quotes[0].totalCoins=999;assert.match(errors(run(setup),'quotes')[0].reason,/mismatch/);
});

test('workstationAccess: public unpaid native station stays chargeable; old prepay is never refunded or charged again',()=>{
 const setup=fixture('021'),result=run(setup);assert.deepEqual(errors(result,'workstationAccess'),[]);assert.equal(result.document.state.player.coins,setup.coins);
 const paid=run(fixture('025'));assert.ok(errors(paid,'workstationAccess').length);assert.equal(paid.document.state.player.coins,0);
 const invalid=fixture('021');invalid.workstationAccess[0].fee=-1;assert.match(errors(run(invalid),'workstationAccess')[0].reason,/invalid workstation access/);
});

test('institutions: every field rejects malformed containers and non-object entries as unmet',()=>{
 for(const field of ['history','accounts','obligations','documents','cases','permits','examinations','appointments','quotes','workstationAccess']){
  assert.equal(errors(run({[field]:{}}),field).length,1,field);
  assert.equal(errors(run({[field]:[null]}),field).length,1,field);
 }
});
