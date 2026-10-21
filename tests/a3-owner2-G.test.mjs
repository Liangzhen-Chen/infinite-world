import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {civicAction,contributionTotal,restoreContributionSnapshot} from '../server-plugin/civic.mjs';
import {governanceAction,restoreInstitutionOffice,restoreOfficeRemovalSnapshot,appointOfficeRecord,restoreInstitutionSnapshot,restoreInstitutionDocument,institutionDocumentView,institutionInputsFor} from '../server-plugin/governance.mjs';
import {recordHistoricalEvent} from '../server-plugin/world-events.mjs';
import {obligationView,institutionOriginal} from '../server-plugin/obligation-state.mjs';
import {restoreObligationSnapshot,closeObligation} from '../server-plugin/obligation-runtime.mjs';
import {transportAction} from '../server-plugin/transport.mjs';
import {openHolding,aliveHoldings,closeHolding} from '../server-plugin/holdings.mjs';
import {authority} from '../server-plugin/action-authority.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner2-g');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
const setup=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`).setup);
const run=s=>applyIntentSetup(engine,initial,s);
const errors=(r,field)=>r.setupUnmet.filter(e=>e.item===field||e.item.startsWith(`${field}[`));
const roundtrip=document=>JSON.parse(JSON.stringify(document));
const noDrift=document=>assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});

test('G1: accepted public work enters the local source ledger once and is read without crediting again',()=>{
 const r=run(setup(176));assert.deepEqual(r.setupUnmet,[]);
 let d=engine.primitiveDraft(roundtrip(r.document));
 const view=civicAction.call(engine,d,{operation:'civic_contribution',settlement:'loc_hw'},'view');
 assert.equal(view.total,3);assert.equal(view.sources.length,1);
 assert.equal(view.sources[0].sourceEvent,r.bindings.a3v2_176_event);
 assert.equal(contributionTotal(d.document.state,'loc_bs'),0);
 assert.throws(()=>civicAction.call(engine,d,{operation:'civic_contribution',settlement:'loc_hw',sourceEvent:''},'bad-read'),/sourceEvent/);
 assert.equal(restoreContributionSnapshot(d,engine,{sourceEvent:r.bindings.a3v2_176_event}).duplicate,true);
 assert.equal(contributionTotal(d.document.state,'loc_hw'),3);
 assert.deepEqual(d.document.ledger,r.document.ledger);noDrift(d.document);
 const bad=setup(176);bad.history[0].contribution=-1;
 assert.ok(errors(run(bad),'history').length);assert.equal(contributionTotal(run(bad).document.state,'loc_hw'),0);
 d=engine.primitiveDraft(r.document);
 assert.throws(()=>restoreContributionSnapshot(d,engine,{sourceEvent:'missing'}),/source/);
});

test('G4: overdue payment promise remains promise, retains dates, creates no loan or consent',()=>{
 const r=run(setup(144));assert.deepEqual(r.setupUnmet,[]);
 const document=roundtrip(r.document),view=obligationView(document.state,'a3v2_144_old_promise');
 assert.equal(view.row.kind,'promise');assert.equal(view.owed,10);assert.equal(view.amountDue,10);
 assert.equal(view.row.createdAt,600);assert.equal(view.row.deadline,2040);
 assert.equal(document.state.player.coins,0);
 assert.ok(!document.state.consentEvents?.some(e=>e.scope==='loan'));noDrift(document);
 const bad=setup(144);bad.obligations[0].amount=11;
 assert.ok(errors(run(bad),'obligations').length);
 bad.obligations[0].amount=10;bad.obligations[0].paid=11;
 assert.ok(errors(run(bad),'obligations').length);
});

test('G2: native office has explicit powers and holder; it cannot manufacture a different authority',()=>{
 const d=engine.primitiveDraft(initial),row={id:'g_native_chair',template:'office',name:'Recorded membership chair',organization:'loc_hw',location:'loc_hw',authority:['admit_members']};
 const office=restoreInstitutionOffice(d,engine,row);
 const id=openHolding(d,{kind:'holds_office',holder:'npc_hw_yanzhe',subject:office,terms:{authority:['admit_members']},writer:'governance',source:'recorded-current-office',engine});
 const document=roundtrip(d.document);
 assert.equal(aliveHoldings(engine.primitiveDraft(document),{kind:'holds_office',holder:'npc_hw_yanzhe',subject:office})[0].id,id);
 assert.equal(authority({engine,document},'npc_hw_yanzhe','admit_members',office).allowed,true);
 assert.equal(authority({engine,document},'npc_hw_yanzhe','review_building_application',office).allowed,false);
 assert.equal(authority({engine,document},'player','transfer','loc_hw|coin_river|treasury').allowed,false);
 const removed=engine.primitiveDraft(document);closeHolding(removed,{id,writer:'governance',reason:'vacated',eventId:'remove-native-chair'});
 assert.equal(authority({engine,document:roundtrip(removed.document)},'npc_hw_yanzhe','admit_members',office).allowed,false);
 assert.throws(()=>restoreInstitutionOffice(d,engine,{...row,id:'bad',organization:'nonexistent'}),/organization/);
 assert.throws(()=>restoreInstitutionOffice(d,engine,{...row,id:'bad',authority:[]}),/powers/);
 // No unnamed council, synthetic promotion date or previous incumbent is supplied.
 const missing=run(setup(213));assert.ok(errors(missing,'history').length);
 assert.equal(aliveHoldings(engine.primitiveDraft(missing.document),{kind:'holds_office',holder:'player'}).length,0);
});

test('G3: pending application and ordinance retain source; inspection never approves or charges',()=>{
 const r=run(setup(178));
 // Q owns the built-in instance delegation; S4 owns land and daily review.
 assert.deepEqual(errors(r,'history'),[]);assert.deepEqual(errors(r,'documents'),[]);
 const d=engine.primitiveDraft(roundtrip(r.document));
 const result=governanceAction.call(engine,d,{operation:'governance_inspect',settlement:'loc_hw'},'read-application');
 assert.deepEqual(result.institutionalInputs.applications,[]);
 const inputs=institutionInputsFor(engine,d.document,'loc_hw','npc_hw_anhuai');
 const app=inputs.applications.find(row=>row.id==='a3v2_178_application');
 assert.equal(app.status,'pending');assert.equal(app.applicant,'npc_hw_anhuai');assert.equal(app.plot,'a3v2_178_plot');
 assert.equal(d.document.state.npcs.npc_hw_anhuai.coins,10);assert.equal(d.document.state.player.coins,0);
 const rule=d.document.state.records['institution_document:a3v2_178_rule'];
 assert.equal(rule.sourceEvent,r.bindings.a3v2_178_event);assert.equal(rule.public,false);
 assert.equal(institutionDocumentView(engine,d.document,'a3v2_178_rule'),null);
 assert.throws(()=>restoreInstitutionSnapshot(d,engine,{row:{...setup(178).instances[0],id:'forged'},sourceEvent:r.bindings.a3v2_178_event}),/source/);
 noDrift(d.document);
});

test('G2: historical removal closes the real prior holding at its recorded time, preserves appointment, and rejects a forged issuer',()=>{
 const d=engine.primitiveDraft(run({minute:100}).document),id='governance_office:g-prior';
 appointOfficeRecord(d,engine,{category:'governance_office',id,holder:'player',settlement:'loc_hw',office:'office_g_prior',status:'在任',since:100,appointedBy:'npc_hw_yanzhe',sourceEvent:'recorded-appointment'},'recorded-appointment');
 d.set(['state','minute'],600);const before=roundtrip(d.document);
 const load=(draft,actor,eventId)=>recordHistoricalEvent(draft,engine,{id:eventId,verb:'removed_from_office',actor,minute:599,source:{kind:'corpus_premise',row:'G-removal-protocol'},payload:{subject:'player',office:'office_g_prior'}});
 const source=load(d,'npc_hw_yanzhe','recorded-removal');
 restoreOfficeRemovalSnapshot(d,engine,{sourceEvent:source});
 assert.equal(d.document.state.minute,600);assert.equal(d.document.state.records[id].since,100);assert.equal(d.document.state.records[id].removedAt,599);
 assert.equal(d.document.state.records[id].sourceEvent,'recorded-appointment');
 assert.equal(aliveHoldings(engine.primitiveDraft(roundtrip(d.document)),{kind:'holds_office',holder:'player'}).length,0);
 const forged=engine.primitiveDraft(before),wrong=load(forged,'npc_hw_linsui','forged-removal');
 assert.throws(()=>restoreOfficeRemovalSnapshot(forged,engine,{sourceEvent:wrong}),/appointing institution/);
 assert.equal(aliveHoldings(forged,{kind:'holds_office',holder:'player'}).length,1);
});

test('G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision',()=>{
 const r=run(setup(177)),row=roundtrip(r.document).state.records.a3v2_177_motion;
 assert.deepEqual(errors(r,'history'),[]);assert.deepEqual(row.tally,{yes:1,no:5});assert.equal(row.status,'voting');
 assert.equal(row.voters,undefined);assert.equal(row.authority,undefined);
 assert.ok(errors(r,'permits').length);assert.equal(r.document.state.projects.a3v2_177_motion,undefined);
 const bad=setup(177);bad.history[0].yes=0.5;assert.ok(errors(run(bad),'history').length);
});

test('G3: public notice is visible only at its original; source history and rumors are not exposed',()=>{
 const r=run(setup(212));assert.deepEqual(errors(r,'documents'),[]);
 const document=roundtrip(r.document),notice=institutionDocumentView(engine,document,r.bindings.a3v2_212_notice);
 assert.equal(notice.kind,'notice');assert.equal(notice.public,true);assert.equal(notice.content,'四月初一起每户春税50铜');
 assert.equal(notice.knowsThief,undefined);assert.equal(notice.truth,undefined);
 const inspected=governanceAction.call(engine,engine.primitiveDraft(document),{operation:'governance_inspect',settlement:'loc_hw'},'read-notice');
 assert.equal(inspected.documents.find(row=>row.id===r.bindings.a3v2_212_notice).content,notice.content);
 const unread=roundtrip(document);unread.state.skills.skill_literacy.proficiency=0;
 assert.equal(institutionDocumentView(engine,unread,r.bindings.a3v2_212_notice),null);
 document.state.location='loc_bs';assert.equal(institutionDocumentView(engine,document,r.bindings.a3v2_212_notice),null);
 const bad=setup(212);bad.documents[0].sourceEvent='a3v2_212_rumor';assert.ok(errors(run(bad),'documents').length);
});

test('G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation',()=>{
 const r=run(setup(214));assert.deepEqual(r.setupUnmet,[]);
 const document=roundtrip(r.document),id=r.bindings.a3v2_214_contract;
 const view=transportAction(engine.primitiveDraft(document),engine,{task:'inspect',contract:id},'inspect-cargo');
 assert.equal(view.delayMinutes,12960);assert.equal(view.cause,'storm');assert.equal(view.condition,60);
 assert.equal(view.compensated,false);assert.equal(view.compensation,null);assert.equal(view.carrier,'npc_hw_zhengshuisheng');
 assert.equal(document.state.player.coins,0);assert.equal(document.state.obligations.a3v2_214_cargo,undefined);
 assert.throws(()=>transportAction(engine.primitiveDraft(document),engine,{task:'inspect',contract:id,actor:'npc_hw_yanzhe'},'forged'),/customer/);
 const remote=roundtrip(document);remote.state.location='loc_bs';
 assert.throws(()=>transportAction(engine.primitiveDraft(remote),engine,{task:'inspect',contract:id},'remote'),/original/);
 const bad=setup(214);bad.documents[0].public=true;assert.ok(errors(run(bad),'documents').length);noDrift(document);
});

test('G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption',()=>{
 const s=setup(217);
 // W owns the authored buyer. Exercise the same source protocol with an
 // existing authored actor, without changing the corpus or pretending 217 passes.
 s.instances=[];s.history[0].to='npc_hw_yanzhe';s.itemInstances[0].owner='npc_hw_yanzhe';
 const r=run(s);assert.deepEqual(r.setupUnmet,[]);
 const document=roundtrip(r.document),id=r.bindings.a3v2_217_ticket;
 assert.equal(institutionDocumentView(engine,document,id).valid,false);
 assert.equal(institutionOriginal(engine,document,r.bindings.a3v2_217_sword).owner,'npc_hw_yanzhe');
 assert.equal(authority({engine,document},'player','transfer',r.bindings.a3v2_217_sword).allowed,false);
 const d=engine.primitiveDraft(document);
 assert.throws(()=>restoreInstitutionDocument(d,engine,{id,owner:'player',sourceEvent:r.bindings.a3v2_217_event,content:'forged new redemption',valid:true}),/original|source/);
 noDrift(document);
});

test('G4: rent imports as rent, creditor waiver is local, unauthorised waiver fails; storage export/import and replay preserve source',async t=>{
 const s=setup(220);
 // W provides the tenant identity; this protocol test uses a real world actor.
 s.instances=[];s.history[0].debtor='npc_hw_anhuai';s.obligations[0].debtor='npc_hw_anhuai';
 const r=run(s);assert.deepEqual(r.setupUnmet,[]);
 const rent=r.document.state.obligations.a3v2_220_rent;
 assert.equal(rent.kind,'rent');assert.equal(rent.terms.fieldAreaMu,10);assert.equal(obligationView(r.document.state,rent).owed,100);
 assert.throws(()=>closeObligation(engine.primitiveDraft(r.document),engine,{id:rent.id,actor:'npc_hw_yanzhe',party:'player',reason:'creditor_waiver'},'bad-waiver'),/authority/);
 assert.throws(()=>restoreObligationSnapshot(engine.primitiveDraft(r.document),engine,{...s.obligations[0],id:'other',sourceEvent:r.bindings.a3v2_220_event}),/source/);
 const directory=await fs.mkdtemp(new URL('../.a3-g-storage-',import.meta.url));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(document,input)=>{const d=engine.primitiveDraft(document),result=closeObligation(d,engine,input,'waiver');return {patches:d.patches,result};};
 const store=new CampaignStorage(directory,{reducer,snapshotEvery:2});
 await store.create({id:'g',worldVersion:world.version,document:r.document});
 await store.transact('g',{id:'waiver',anchor:'g',input:{id:rent.id,actor:'player',party:'player',reason:'creditor_waiver'}},reducer);
 const saved=await store.export('g'),fresh=new CampaignStorage(directory,{reducer});
 const imported=await fresh.import(roundtrip(saved),'g-copy');
 assert.equal(obligationView(imported.document.state,rent.id).owed,0);
 assert.equal(imported.document.state.obligations[rent.id].source,r.bindings.a3v2_220_event);
 await fresh.reconcile('g-copy',[]);
 const replayed=await fresh.read('g-copy');assert.equal(obligationView(replayed.document.state,rent.id).owed,100);
 assert.equal(replayed.document.state.obligations[rent.id].kind,'rent');noDrift(replayed.document);
 // Native patches, rather than a second conclusion store, reproduce waiver.
 const d=engine.primitiveDraft(replayed.document);closeObligation(d,engine,{id:rent.id,actor:'player',party:'player',reason:'creditor_waiver'},'waiver');
 assert.deepEqual(applyPatches(replayed.document,d.patches),d.document);noDrift(d.document);
});
