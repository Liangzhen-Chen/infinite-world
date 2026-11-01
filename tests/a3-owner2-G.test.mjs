// todo 的阶段与真实前提逐条登记：docs/A3-后续阶段登记.md S5CT CT01（保留原阶段边界）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {civicAction,contributionTotal} from '../server-plugin/civic.mjs';
import {governanceAction,appointOfficeRecord,institutionDocumentView,institutionInputsFor} from '../server-plugin/governance.mjs';
import {recordHistoricalEvent} from '../server-plugin/world-events.mjs';
import {obligationView,institutionOriginal} from '../server-plugin/obligation-state.mjs';
import {closeObligation} from '../server-plugin/obligation-runtime.mjs';
import {transportAction} from '../server-plugin/transport.mjs';
import {openHolding,aliveHoldings,closeHolding} from '../server-plugin/holdings.mjs';
import {authority} from '../server-plugin/action-authority.mjs';
import {primitiveContext} from '../server-plugin/primitives-runtime.mjs';
import {officeCall,appointedClaimClerk} from './helpers/office-actions.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {documentScene,documentCall} from './helpers/document-actions.mjs';
import {documentAction} from '../server-plugin/documents.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';

// This authority/private-document fixture fixes the on-duty recipient and
// bystanders while its native actions advance time. Household errands belong
// to the separate source/full-world tests; all duty/privacy assertions remain.
const world=await loadWorld();delete world.rules.householdSubsistence;
const engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner2-g');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r12.json',import.meta.url),'utf8'));
const setup=id=>structuredClone(corpus.find(r=>r.id===`A3V2-${id}`).setup);
const run=s=>applyIntentSetup(engine,initial,s);
const errors=(r,field)=>r.setupUnmet.filter(e=>e.item===field||e.item.startsWith(`${field}[`));
const roundtrip=document=>JSON.parse(JSON.stringify(document));
const noDrift=document=>assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});

test.todo('G1: accepted public work enters the local source ledger once and is read without crediting again〔前提待真实动作：通过真实批准、施工、验收建立当地公共工程贡献来源；归 S4〕',()=>{
 const r=run(setup(176));assert.deepEqual(r.setupUnmet,[]);
 let d=engine.primitiveDraft(roundtrip(r.document));
 const view=civicAction.call(engine,d,{operation:'civic_contribution',settlement:'loc_hw'},'view');
 assert.equal(view.total,3);assert.equal(view.sources.length,1);
 assert.equal(view.sources[0].sourceEvent,r.bindings.a3v2_176_event);
 assert.equal(contributionTotal(d.document.state,'loc_bs'),0);
 assert.throws(()=>civicAction.call(engine,d,{operation:'civic_contribution',settlement:'loc_hw',sourceEvent:''},'bad-read'),/sourceEvent/);
 assert.equal(restoreContributionSnapshot(d,engine,{sourceEvent:r.bindings.a3v2_176_event},{origin:'initial'}).duplicate,true);
 assert.equal(contributionTotal(d.document.state,'loc_hw'),3);
 assert.deepEqual(d.document.ledger,r.document.ledger);noDrift(d.document);
 const bad=setup(176);bad.history[0].contribution=-1;
 assert.ok(errors(run(bad),'history').length);assert.equal(contributionTotal(run(bad).document.state,'loc_hw'),0);
 d=engine.primitiveDraft(r.document);
 assert.throws(()=>restoreContributionSnapshot(d,engine,{sourceEvent:'missing'},{origin:'initial'}),/source/);
});

// G4's overdue payment promise moved to a3-prelude.test.mjs: create the real
// promise at minute 600 and wait past its deadline through the ordinary clock.

// S4: preserve the positive office power, unrelated-power denial and public-money
// denial on a published receiving seat. Appointment comes from real actions.
test('G2: native office has explicit powers and holder; it cannot manufacture a different authority',async()=>{
 const adult=engine.initialFromLegacy({...seed,state:{...seed.state,player:{...seed.state.player,age:25}}},'g2-office');
 // Replace the removed snapshot API's invalid-organization/power checks with
 // the public action boundary: neither an unknown seat nor supplied powers
 // can create a grant. Keep both rejection assertions.
 await assert.rejects(officeCall(engine,adult,'apply',{name:'nonexistent'},'g2-unknown-office'),/任免链|rejected/);
 await assert.rejects(officeCall(engine,adult,'apply',{name:'office_bs_claim_desk',powers:['review_building_application']},'g2-forged-powers'),/rejected|未知|槽/);
 const {document,name,authority:issuer}=await appointedClaimClerk(engine,adult);
 const holding=aliveHoldings(engine.primitiveDraft(document),{kind:'holds_office',holder:'player',subject:name})[0];assert.ok(holding);
 assert.equal(authority(primitiveContext(engine,roundtrip(document)),'player','receive_claim',name).allowed,true);
 assert.equal(authority(primitiveContext(engine,document),'player','review_building_application',name).allowed,false);
 assert.equal(authority(primitiveContext(engine,document),'player','transfer','loc_hw|coin_river|treasury').allowed,false);
 const removed=await officeCall(engine,document,'remove',{name,authority:issuer},'g2-remove');
 assert.equal(authority(primitiveContext(engine,roundtrip(removed.document)),'player','receive_claim',name).allowed,false);
 // Unsupported historical snapshots still cannot invent an office or date.
 const missing=run(setup(213));assert.ok(errors(missing,'history').length);
 assert.equal(aliveHoldings(engine.primitiveDraft(missing.document),{kind:'holds_office',holder:'player'}).length,0);
});

test.todo('G3: pending application and ordinance retain source; inspection never approves or charges〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕',()=>{
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
 assert.throws(()=>restoreInstitutionSnapshot(d,engine,{row:{...setup(178).instances[0],id:'forged'},sourceEvent:r.bindings.a3v2_178_event},{origin:'initial'}),/source/);
 noDrift(d.document);
});

// S4 design C: history is appointment -> wait -> removal, never a backdated snapshot.
test('G2: historical removal closes the real prior holding at its recorded time, preserves appointment, and rejects a forged issuer',async()=>{
 const adult=engine.initialFromLegacy({...seed,state:{...seed.state,player:{...seed.state.player,age:25}}},'g2-history');
 const appointed=await appointedClaimClerk(engine,adult),{name,authority:issuer}=appointed;
 const at=appointed.document.state.minute;
 const waited=await engine.reduce(appointed.document,{tool:'world_time',args:{minutes:10},eventId:'g2-history-wait'});
 const before=applyPatches(appointed.document,waited.patches);
 await assert.rejects(officeCall(engine,before,'remove',{name,authority:'npc_hw_yanzhe'},'g2-forged'),/任免机关|rejected/);
 assert.equal(aliveHoldings(engine.primitiveDraft(before),{kind:'holds_office',holder:'player',subject:name}).length,1);
 const removed=await officeCall(engine,before,'remove',{name,authority:issuer},'g2-history-remove');
 const row=removed.document.state.records['organization:faction_bs_government'].offices[name];
 assert.equal(row.previous.since,at);assert.equal(row.removedAt,at+10);assert.equal(row.previous.sourceEvent,'claim-appoint');
 assert.equal(removed.document.state.minute,at+10);
 assert.equal(aliveHoldings(engine.primitiveDraft(roundtrip(removed.document)),{kind:'holds_office',holder:'player',subject:name}).length,0);
});

test.todo('G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕',()=>{
 const r=run(setup(177)),row=roundtrip(r.document).state.records.a3v2_177_motion;
 assert.deepEqual(errors(r,'history'),[]);assert.deepEqual(row.tally,{yes:1,no:5});assert.equal(row.status,'voting');
 assert.equal(row.voters,undefined);assert.equal(row.authority,undefined);
 assert.ok(errors(r,'permits').length);assert.equal(r.document.state.projects.a3v2_177_motion,undefined);
 const bad=setup(177);bad.history[0].yes=0.5;assert.ok(errors(run(bad),'history').length);
});

test('G3: public notice is visible only at its original; source history and rumors are not exposed',async()=>{
 // 05 §5.4: a notice is written on purchased paper and physically posted.
 const original=await documentScene(engine,initial,{prefix:'notice',kind:'notice',content:'四月初一起每户春税50铜'});
 const moved=await engine.reduce(original.document,{tool:'world_act',eventId:'notice-move',args:{action:'core:move',slots:{destination:'loc_hw'}}});
 assert.notEqual(moved.result.receipt.status,'rejected',JSON.stringify(moved.result));
 const posted=await documentCall(engine,applyPatches(original.document,moved.patches),'post',{document:original.id},'notice-post');
 const r={...posted,bindings:{a3v2_212_notice:original.id}};
 // 原“documents 前提无错误”改验真实张贴动作 committed；地域、识字及不泄漏断言保留。
 assert.equal(r.result.receipt.status,'committed');
 const document=roundtrip(r.document),notice=institutionDocumentView(engine,document,r.bindings.a3v2_212_notice);
 assert.equal(notice.kind,'notice');assert.equal(notice.public,true);assert.equal(notice.content,'四月初一起每户春税50铜');
 assert.equal(notice.knowsThief,undefined);assert.equal(notice.truth,undefined);
 const inspected=governanceAction.call(engine,engine.primitiveDraft(document),{operation:'governance_inspect',settlement:'loc_hw'},'read-notice');
 assert.equal(inspected.documents.find(row=>row.id===r.bindings.a3v2_212_notice).content,notice.content);
 const unread=applyIntentSetup(engine,document,{abilitiesByActor:{player:{skills:{skill_literacy:0}}}}).document;
 assert.equal(institutionDocumentView(engine,unread,r.bindings.a3v2_212_notice),null);
 const away=await engine.reduce(document,{tool:'world_act',eventId:'notice-leave',args:{action:'core:move',slots:{destination:'loc_bs'}}});
 assert.equal(away.result.receipt.status,'committed');
 assert.equal(institutionDocumentView(engine,applyPatches(document,away.patches),r.bindings.a3v2_212_notice),null);
 assert.throws(()=>documentAction(engine.primitiveDraft(r.document),engine,{operation:'governance_document_issue',source:'a3v2_212_rumor',paper:'item_parchment',kind:'notice',text:'传闻'},'rumor-not-source'),/真实交易或机构办理/);
});

test.todo('G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕',()=>{
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

test.todo('G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕',()=>{
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
 assert.throws(()=>restoreInstitutionDocument(d,engine,{id,owner:'player',sourceEvent:r.bindings.a3v2_217_event,content:'forged new redemption',valid:true},{origin:'initial'}),/original|source/);
 noDrift(document);
});

test('G4: real ten-mu rental creates rent; creditor waiver, storage and replay preserve the same source',async t=>{
 // S5CT / A3V2-220: initial ownership/stock are premises; only the actual
 // landlord's offer and tenant decision create the lease and earned claim.
 const tenant='npc_hw_anhuai',field='loc_hw_fields',w=structuredClone(world);
 w.npcs.find(n=>n.id===tenant).schedule={default:[{start:0,end:1440,location:field,activity:'休息',services:['trade']}]};
 const e=new WorldEngine(w),initial=e.initialFromLegacy(seed,'s5ct-rent');
 const r=applyIntentSetup(e,initial,{minute:600,location:field,present:[tenant],coins:1000,inventory:{item_oats:100},facts:[
  {path:['state','buildings'],value:{...initial.state.buildings,[field]:{...initial.state.buildings[field],owner:'player',condition:100}}},
  {path:['state','npcs'],value:{...initial.state.npcs,[tenant]:{...initial.state.npcs[tenant],location:field,status:'正常',activity:'休息',coins:1000,inventory:{item_oats:{quantity:100}}}}}
 ]});assert.deepEqual(r.setupUnmet,[]);
 const loaded=await runPrelude(e,r.document,[{tool:'world_act',eventId:'s5ct-real-rent',args:{action:'core:trade.rent_out',slots:{seller:tenant,location:field,quantity:10,coins:100,days:30,deadline:600+29*1440,deposit:0}}}]);
 assert.deepEqual(loaded.unmet,[]);r.document=roundtrip(loaded.document);
 const rent=Object.values(r.document.state.obligations).find(o=>o.kind==='rent'&&o.debtor===tenant&&o.creditor==='player');assert.ok(rent);
 // Agreed fixed rent100 for10mu, zero paid now: owed100. Waiver moves no cash.
 // The native producer keeps the area on its source lease, rather than the
 // removed snapshot-only terms.fieldAreaMu; retain the same ten-mu assertion.
 assert.equal(rent.kind,'rent');assert.equal(r.document.state.records[rent.contract].rentBasis.areaMu,10);assert.equal(obligationView(r.document.state,rent).owed,100);
 assert.throws(()=>closeObligation(engine.primitiveDraft(r.document),engine,{id:rent.id,actor:'npc_hw_yanzhe',party:'player',reason:'creditor_waiver'},'bad-waiver'),/authority/);
 // Snapshot restoration was removed from the supported producer API. Preserve
 // its old anti-forgery intent at the surviving setup boundary: a copied source
 // cannot manufacture another debt, and does not change the real claim.
 const forged=applyIntentSetup(e,r.document,{obligations:[{...rent,id:'other',sourceEvent:rent.source}]});
 assert.ok(forged.setupUnmet.some(x=>x.item.startsWith('obligations')));
 assert.equal(forged.document.state.obligations.other,undefined);
 assert.deepEqual(forged.document.state.obligations[rent.id],rent);
 const directory=await fs.mkdtemp(new URL('../.a3-g-storage-',import.meta.url));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(document,input)=>{const d=e.primitiveDraft(document),result=closeObligation(d,e,input,'waiver');return {patches:d.patches,result};};
 const store=new CampaignStorage(directory,{reducer,snapshotEvery:2});
 await store.create({id:'g',worldVersion:world.version,document:r.document});
 await store.transact('g',{id:'waiver',anchor:'g',input:{id:rent.id,actor:'player',party:'player',reason:'creditor_waiver'}},reducer);
 const saved=await store.export('g'),fresh=new CampaignStorage(directory,{reducer});
 const imported=await fresh.import(roundtrip(saved),'g-copy');
 assert.equal(obligationView(imported.document.state,rent.id).owed,0);
 assert.equal(imported.document.state.obligations[rent.id].source,rent.source);
 await fresh.reconcile('g-copy',[]);
 const replayed=await fresh.read('g-copy');assert.equal(obligationView(replayed.document.state,rent.id).owed,100);
 assert.equal(replayed.document.state.obligations[rent.id].kind,'rent');noDrift(replayed.document);
 // Native patches, rather than a second conclusion store, reproduce waiver.
 const d=e.primitiveDraft(replayed.document);closeObligation(d,e,{id:rent.id,actor:'player',party:'player',reason:'creditor_waiver'},'waiver');
 assert.deepEqual(applyPatches(replayed.document,d.patches),d.document);noDrift(d.document);
});
