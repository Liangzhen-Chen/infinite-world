import {assertActionRejected} from './helpers/action-refusal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage,persistable} from '../server-plugin/storage.mjs';
import {prepareOpenAction,executeOpenSequence} from '../server-plugin/open-actions.mjs';
import {canonicalActionId} from '../server-plugin/action-registry.mjs';
import {primitiveRuntime} from '../server-plugin/primitives-runtime.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.createCharacter(seed,{},'owner2-R');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
const canonical=id=>canonicalActionId(primitiveRuntime.registry(engine),id);
function fixture(n){
 const row=corpus.find(r=>r.id===`A3V2-${n}`),setup=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(setup.setupUnmet,[],`${n} premises`);return {row,document:setup.document};
}
async function run(n,adjust){
 const {row,document}=fixture(n),before=persistable(document);
 if(adjust)adjust(row.proposal);
 const input={tool:'world_propose',args:row.proposal,eventId:`owner2-R-${n}`};
 const preview=await engine.previewAction(document,input),out=await engine.reduce(document,input),after=applyPatches(document,out.patches);
 assert.deepEqual(persistable(document),before);assert.deepEqual(auditLedger(after.ledger),[]);
 return {row,document,after,input,preview,out,receipt:out.result.receipt};
}

test('R1: cash failure, missing spell and fusion prerequisites retain registered routes and zero writes',async()=>{
 // 06 §6.10.3 / review 10-22 P0: a quantity is a structured proposal field (means.quantity), never parsed from
 // the intent's prose. The frozen 122 proposal names "两块面包" only in prose, so it buys the registered default of
 // one and is affordable (negative control below); the structured two-loaf order is the cash failure.
 const prose=await run(122);assert.equal(prose.receipt.routed,'core:trade.buy');assert.equal(prose.receipt.status,'committed');
 assert.equal(prose.document.state.player.coins-prose.after.state.player.coins,2,'prose does not become a larger order');
 for(const [n,route,reason,adjust] of [[122,'core:trade.buy',/余额不足/,p=>{p.means={...p.means,quantity:2};}],[162,'core:cast',/尚未学会/],[166,'core:research',/没有掌握/]]){
  const r=await run(n,adjust);assert.equal(r.preview.receipt.status,'rejected');assert.equal(r.preview.receipt.routing.routed,route);
  assert.equal(r.receipt.routed,route);assert.match(r.receipt.reason,reason);assert.deepEqual(r.out.patches,[]);assert.deepEqual(r.receipt.applied,[]);
 }
 const {document}=fixture(122);
 const p=prepareOpenAction(engine,document,{intent:'购买面包',effects:[]});
 assert.equal(p.status,'routed');assert.equal(p.slots.item,'item_bread');
 assert.equal(p.slots.quantity,1,'unprovided quantities use the registered default, not a fabricated order');
});

test('R1: ledger and interface reads return real data without a clock, receipt record or account change',async()=>{
 for(const n of [155,189]){
  const r=await run(n);assert.equal(r.receipt.routed,r.row.expected.route);assert.deepEqual(r.out.patches,[]);
  assert.deepEqual(r.receipt.applied,[]);assert.equal(r.receipt.cost.time,0);
  if(n===155)assert.equal(r.receipt.data.coins,7);else assert.match(r.receipt.data.help,/角色面板/);
 }
 const {document}=fixture(134),people=await engine.previewAction(document,{tool:'world_act',eventId:'owner2-R-people-read',args:{action:'core:read',slots:{section:'人物',npc:'npc_hw_linsui'}}});
 assert.equal(people.receipt.data.length,1);assert.equal(people.receipt.data[0].id,'npc_hw_linsui');
 assert.equal(people.receipt.data[0].secrets,undefined);
});

test('R1: capped practice binds the actual skill without a breakthrough, defense binds the actual opponent',async()=>{
 // The registered primitive session is canonical core:practice (06 §6.4).
 const r=await run(165);assert.equal(canonical(r.receipt.routed),'core:practice');
 assert.equal(r.after.state.skills.skill_light.proficiency,299);assert.ok(r.after.state.minute>r.document.state.minute);
 assert.deepEqual(r.after.state.spells,r.document.state.spells);
 const {row,document}=fixture(169),prepared=prepareOpenAction(engine,document,row.proposal);
 assert.equal(prepared.routed,'core:combat');assert.equal(prepared.slots.intent,'defend');assert.equal(prepared.slots.target,'a3v2_169_boar');
 assert.equal(prepared.slots.weapon,'item_staff');
 // Routing preserves the actual instance identity rather than renaming it. The executor used to refuse it
 // by id prefix (a historical restriction left to the executor's owner); an opponent is now the unowned
 // creature record of a catalogued monster, whatever its id (01 世界本体: ids are permanent labels, the kind
 // is the record's; 12 §本地 id: a prefix is only the initial judgement). An owned creature stays refused.
 const accepted=await engine.previewAction(document,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-instance'});
 assert.equal(accepted.receipt.routed,'core:combat');assert.equal(accepted.receipt.status,'preview');
 const owned=structuredClone(document);owned.state.creatures.a3v2_169_boar.owner='player';
 const refused=await engine.previewAction(owned,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-instance-owned'});
 assert.equal(refused.receipt.routed,'core:combat');assert.equal(refused.receipt.status,'rejected');assert.match(refused.receipt.reason,/交锋对象/);
});

test('R2: leaving and unavailable participants keep the original native safeguards',async()=>{
 const leaveRow=corpus.find(r=>r.id==='A3V2-050'),leaveSetup=applyIntentSetup(engine,initial,leaveRow.setup);
 assert.deepEqual(leaveSetup.setupUnmet,[]);assert.equal(prepareOpenAction(engine,leaveSetup.document,leaveRow.proposal).routed,'core:dialogue.leave');
 const {document}=fixture(137);document.state.npcs.npc_hw_wushuo.status='昏迷';
 const denied=await engine.previewAction(document,{tool:'world_act',args:{action:'core:dialogue.guide_request',slots:{subject:'npc_hw_wushuo',content:'带我去'}},eventId:'owner2-R-asleep'});
 assert.equal(denied.receipt.status,'rejected');assert.deepEqual(denied.receipt.applied,[]);
});

// Each original acceptance assertion remains active, including the blocked 137.
// Independent cases let the unchanged assertions for later requests run too.
for(const n of [134,137,138,140,146,171])test(`R2: speech subclass ${n} has a native consumer without fabricated agreement`,async()=>{
  const r=await run(n);assert.equal(canonical(r.receipt.routed),r.row.expected.route,String(n));
  assert.ok(r.receipt.applied.some(e=>e.op==='emit'),String(n));assert.equal(r.after.state.player.coins,r.document.state.player.coins);
  assert.deepEqual(r.after.state.inventory,r.document.state.inventory);assert.deepEqual(r.after.state.obligations,r.document.state.obligations);
  const speech=r.after.state.records[`speech:${r.input.eventId}`];assert.equal(speech.verified,false);assert.ok(speech.content);
  if(n===134)assert.match(r.after.state.dialogues.npc_hw_linsui.text,/屋顶/,'reply consumes only the NPC\'s observed repair memory');
  if(n===146)assert.ok(r.after.state.minute<605,'a short question cannot reserve an NPC through the next appointment');
  if(n===140){assert.equal(speech.kind,'tell');assert.deepEqual(r.after.state.creatures,r.document.state.creatures);}
});

test.todo('R2: confession preserves the legal entry and refuses to promote a witness into an official〔前提待真实动作：形成指定待审案件及在岗机构身份；归 S4〕',async()=>{
 const {row,document}=fixture(180),prepared=prepareOpenAction(engine,document,row.proposal);
 assert.equal(prepared.routed,'core:law.confess');assert.equal(prepared.slots.request.kind,'confession');
 const preview=await engine.previewAction(document,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-confess'});
 assert.equal(preview.receipt.routed,'core:law.confess');assert.equal(preview.receipt.status,'rejected');
 assert.match(preview.receipt.reason,/authorized recipient/);assert.deepEqual(preview.receipt.applied,[]);
});

test('R2: a followup cannot disclose a private NPC memory through exact keys or fuzzy recollection',async()=>{
 const {document}=fixture(134),npc=document.state.npcs.npc_hw_linsui;
 npc.memoryStream=[...npc.memoryStream??[],{id:'private_roof',key:'private_roof',subject:'npc_hw_linsui',private:true,participants:['npc_hw_linsui'],content:'屋顶下面藏有私密凭据',minute:document.state.minute,sourceEvent:'private_roof_event'}];
 for(const content of ['private_roof','屋顶下面藏有什么？']){
  const p=await engine.previewAction(document,{tool:'world_act',eventId:`owner2-R-private-${content.length}`,args:{action:'open:ask_request',slots:{subject:'npc_hw_linsui',content}}});
  assert.equal(p.receipt.status,'preview');assert.doesNotMatch(p.receipt.legacy.dialogue.text,/私密凭据/);
 }
});

test('R3: renting commits one native lodging payment; the next-day enquiry is no longer fabricated into a fixed sequence',async()=>{
 // Review 10-22 P0 (open-actions): the renewal_quote-keyed three-step sequence (rent, wait to checkout, enquire)
 // was a corpus special case. The proposal now routes to the real lodging action alone: one payment, the lodging
 // holding and contract, replay idempotent; the enquiry is a later real action (next test), not a label-built step.
 const r=await run(121);assert.equal(r.receipt.routed,'core:trade.lodge');assert.equal(r.receipt.steps,undefined);
 assert.equal(r.document.state.player.coins-r.after.state.player.coins,6);
 const contract=Object.values(r.after.state.records).find(x=>x.category==='contract'&&x.parties?.includes('player')&&x.room==='bld_hw_qingdeng'&&x.starts===1200);
 assert.ok(contract);assert.ok(r.after.state.minute<contract.expires,'no automatic wait until checkout');
 assert.ok(r.receipt.applied.some(e=>e.op==='holding.open'&&e.holdingKind==='lodges'));
 assert.ok(r.receipt.applied.every(e=>!(e.op==='emit'&&e.verb==='request')),'no renewal enquiry is invented');
 const replay=await engine.reduce(persistable(r.after),r.input);assert.deepEqual(replay.patches,[]);
 assert.equal(Object.values(r.after.state.records).filter(x=>x.category==='contract'&&x.room==='bld_hw_qingdeng'&&x.starts>=1200).length,1);
});

test('R3: a rejected checkout enquiry leaves the completed lodging and elapsed time intact',async()=>{
 // The rent -> wait -> enquire composition was removed with the renewal_quote special case (review 10-22 P0), so the
 // steps are separate real actions: lodging commits, the native wait runs to checkout and expires the holding, and
 // the enquiry then fails alone (the host has left) without touching anything already completed.
 const r=await run(121),contract=Object.values(r.after.state.records).find(x=>x.category==='contract'&&x.room==='bld_hw_qingdeng'&&x.starts===1200);
 const wait=await engine.reduce(r.after,{tool:'world_act',eventId:'owner2-R-checkout-wait',args:{action:'core:time',slots:{minutes:contract.expires-r.after.state.minute}}});
 const waited=applyPatches(r.after,wait.patches);
 assert.equal(waited.state.minute,contract.expires);assert.ok(wait.result.receipt.applied.some(e=>e.op==='holding.close'&&e.reason==='expired'));
 waited.state.npcs.npc_hw_linsui.location='loc_hw_gate';
 const settled=persistable(waited);
 // A3 refusal: preserve the original business code and require a zero-effects receipt.
 await assertActionRejected(engine.reduce(waited,{tool:'world_act',eventId:'owner2-R-checkout-absent',args:{action:'open:question',slots:{target:'npc_hw_linsui',content:'询问下一晚续住报价'}}}),undefined,'E-PRECONDITION');
 assert.deepEqual(persistable(waited),settled);
 assert.equal(r.document.state.player.coins-waited.state.player.coins,6);assert.equal(waited.state.minute,2640);assert.deepEqual(auditLedger(waited.ledger),[]);
});

test('R4: native festival project is only a private budget and pending enquiries; fake sources stay refused',async()=>{
 const r=await run(183);assert.equal(r.receipt.routed,'core:settlement.festival_plan');
 const project=r.after.state.projects[r.receipt.legacy.project];assert.equal(project.type,'节庆筹办');assert.equal(project.budget,50);
 assert.equal(project.stage,'征询');assert.equal(project.venueConsent,null);assert.deepEqual(project.participants,[]);assert.equal(project.spent,0);
 assert.equal(r.after.state.player.coins,50);assert.equal(r.after.state.minute,r.document.state.minute);
 assert.ok(r.receipt.applied.some(e=>e.op==='create'&&e.tags.includes('festival')));
 const request={tool:'world_act',eventId:'owner2-R-festival-enquiry',args:{action:'core:settlement.festival_plan',slots:{project:project.id,speaker:'npc_hw_linsui',content:'愿意参加吗？'}}};
 // No NPC was supplied as present in this fixture. A project cannot summon one.
 const unavailable=await engine.previewAction(r.after,request);assert.equal(unavailable.receipt.status,'rejected');
 const invalid=structuredClone(r.row.proposal);invalid.effects[0].tags.push('permission:granted');
 assert.throws(()=>prepareOpenAction(engine,r.document,invalid),{code:'E-PRIMITIVE-SOURCE'});
 const excess=structuredClone(r.row.proposal);excess.effects[0].facts.budget=51;
 const denied=await engine.previewAction(r.document,{tool:'world_propose',args:excess,eventId:'owner2-R-excess'});
 assert.equal(denied.receipt.status,'rejected');assert.deepEqual(denied.receipt.applied,[]);
 const forged=applyIntentSetup(engine,initial,{location:'loc_hw',coins:50,festivalProjects:[{...project,id:'forged',participants:['npc_hw_linsui']}]});
 assert.ok(forged.setupUnmet.length);assert.equal(forged.document.state.projects.forged,undefined);
});

test('R4: storage reopen and native setup snapshot keep pending project provenance and allow actual enquiries',async t=>{
 const r=await run(183),project=r.after.state.projects[r.receipt.legacy.project];
 const directory=await fs.mkdtemp(path.resolve('.a3-R-storage-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(d,i)=>engine.reduce(d,i),store=new CampaignStorage(directory,{snapshotEvery:1,reducer});
 await store.create({id:'routing',worldVersion:'owner2-R',document:r.document});
 await store.transact('routing',{id:r.input.eventId,input:r.input},reducer);
 const reopened=new CampaignStorage(directory,{reducer});
 const loaded=await reopened.load('routing');
 assert.deepEqual(loaded.document.state.projects[project.id],persistable(project));
 const replay=await engine.reduce(loaded.document,r.input);assert.deepEqual(replay.patches,[]);
 const setup=applyIntentSetup(engine,initial,{location:'loc_hw',coins:50,present:['npc_hw_linsui'],festivalProjects:[{...project,id:'initial-festival'}]});
 assert.deepEqual(setup.setupUnmet,[]);
 const next=await engine.reduce(setup.document,{tool:'world_act',eventId:'owner2-R-query-project',args:{action:'core:settlement.festival_plan',slots:{project:'initial-festival',speaker:'npc_hw_linsui',content:'你愿意参与吗？'}}});
 const after=applyPatches(setup.document,next.patches);
 assert.equal(after.state.projects['initial-festival'].requests.length,1);assert.deepEqual(after.state.projects['initial-festival'].participants,[]);
 assert.equal(after.state.player.coins,50);assert.deepEqual(auditLedger(after.ledger),[]);
});

test('R1: spatial hiding and staged civic applications cannot be silently reduced to looking or fabricate S4 qualification',async()=>{
 const old=corpus.find(r=>r.id==='A3V2-010'),setup=applyIntentSetup(engine,initial,old.setup);
 assert.deepEqual(setup.setupUnmet,[]);assert.equal(prepareOpenAction(engine,setup.document,old.proposal).routed,'core:look');
 for(const n of [174,175]){
  const {row,document}=fixture(n),before=persistable(document),p=prepareOpenAction(engine,document,row.proposal);
  assert.equal(p.status,'needs_slots');assert.equal(p.routed,'open:proposal');assert.deepEqual(p.effects,[]);assert.deepEqual(persistable(document),before);
 }
});
