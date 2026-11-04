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
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {officeScene} from './helpers/office-actions.mjs';
import {zoneOf} from '../server-plugin/place-layout.mjs';

// This authority/private-document fixture fixes the on-duty recipient and
// bystanders while its native actions advance time. Household errands belong
// to the separate source/full-world tests; all duty/privacy assertions remain.
const world=await loadWorld();delete world.rules.householdSubsistence;
const engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.createCharacter(seed,{},'owner2-R');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
const canonical=id=>canonicalActionId(primitiveRuntime.registry(engine),id);
function fixture(n){
 const row=corpus.find(r=>r.id===`A3V2-${n}`),scene=structuredClone(row.setup),positions=scene.positions??[];
 // S4-02 makes authored geometry authoritative. 134/140/146/171 need
 // conversational proximity: establish it by actually walking the NPC.
 // 174 tests an incomplete proposal, so its old invented 30m measurement
 // supplies no premise; the routing and zero-write assertions stay intact.
 delete scene.positions;
 // S5-02：题面“至少2份”设为8份：家庭口粮4、已承诺2，仍有2份可售。
 if(n===122){
  scene.accounts=scene.accounts.map(r=>({...r,balance:8}));
  scene.history=scene.history.map(r=>r.verb==='opening_balance'?{...r,balance:8}:r);
 }
 const setup=applyIntentSetup(engine,initial,scene);assert.deepEqual(setup.setupUnmet,[],`${n} premises`);
 let document=setup.document;
 for(const p of positions.filter(p=>p.distanceMeters<=3)){
  const d=engine.primitiveDraft(document),destination=zoneOf(engine,document,p.observer)?.id;
  assert.ok(destination);const moved=engine.primitiveMoveNpc(d,{entity:p.target,destination,mode:'walk'},`R-native-proximity-${n}`);
  assert.equal(moved.arrived,true);document=applyPatches(document,d.patches);
 }
 return {row,document};
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
 // S5-02: unmatched one-unit retail quote = trunc(base2 * scarcity.5)=1; signed two-unit total4 stays frozen.
 const prose=await run(122);assert.equal(prose.receipt.routed,'core:trade.buy');assert.equal(prose.receipt.status,'committed');
 assert.equal(prose.document.state.player.coins-prose.after.state.player.coins,1,'prose does not become a larger order');
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
 // is the record's; 12 §本地 id: a prefix is only the initial judgement). K7 (设计稿 §9 第 4 条): its owner may
 // strike it; someone else's creature is refused as theirs.
 const accepted=await engine.previewAction(document,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-instance'});
 assert.equal(accepted.receipt.routed,'core:combat');assert.equal(accepted.receipt.status,'preview');
 const owned=structuredClone(document);owned.state.creatures.a3v2_169_boar.owner='player';
 const own=await engine.previewAction(owned,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-instance-owned'});
 assert.equal(own.receipt.routed,'core:combat');assert.equal(own.receipt.status,'preview');
 const theirs=structuredClone(document);theirs.state.creatures.a3v2_169_boar.owner='npc_hw_linsui';
 const refused=await engine.previewAction(theirs,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-instance-theirs'});
 assert.equal(refused.receipt.status,'rejected');assert.match(refused.receipt.reason,/没有处分别人/);
});

test('R2: leaving and unavailable participants keep the original native safeguards',async()=>{
 const leaveRow=corpus.find(r=>r.id==='A3V2-050'),leaveSetup=applyIntentSetup(engine,initial,leaveRow.setup);
 assert.deepEqual(leaveSetup.setupUnmet,[]);assert.equal(prepareOpenAction(engine,leaveSetup.document,leaveRow.proposal).routed,'core:dialogue.leave');
 const {document}=fixture(137);document.state.npcs.npc_hw_wushuo.status='昏迷';
 const denied=await engine.previewAction(document,{tool:'world_act',args:{action:'core:dialogue.guide_request',slots:{subject:'npc_hw_wushuo',content:'带我去'}},eventId:'owner2-R-asleep'});
 assert.equal(denied.receipt.status,'rejected');assert.deepEqual(denied.receipt.applied,[]);
});

// These consumers record unverified speech; the native guide-request protocol is tested separately below.
for(const n of [134,138,140,146,171])test(`R2: speech subclass ${n} has a native consumer without fabricated agreement`,async()=>{
  const r=await run(n);assert.equal(canonical(r.receipt.routed),r.row.expected.route,String(n));
  assert.ok(r.receipt.applied.some(e=>e.op==='emit'),String(n));assert.equal(r.after.state.player.coins,r.document.state.player.coins);
  assert.deepEqual(r.after.state.inventory,r.document.state.inventory);assert.deepEqual(r.after.state.obligations,r.document.state.obligations);
  const speech=r.after.state.records[`speech:${r.input.eventId}`];assert.equal(speech.verified,false);assert.ok(speech.content);
  if(n===134)assert.match(r.after.state.dialogues.npc_hw_linsui.text,/屋顶/,'reply consumes only the NPC\'s observed repair memory');
  if(n===146)assert.ok(r.after.state.minute<605,'a short question cannot reserve an NPC through the next appointment');
  if(n===140){assert.equal(speech.kind,'tell');assert.deepEqual(r.after.state.creatures,r.document.state.creatures);}
});

test('R2: speech subclass 137 has a native consumer without fabricated agreement',async()=>{
 // Product principles II.4 / III.1: a request is not a promise. The frozen corpus labels it
 // core:dialogue.guide (world_promise), but the catalog owns the distinct guide_request consumer.
 // The original setup also places Wu at the gate while his current schedule requires northwood;
 // preserve the actual availability refusal rather than fabricating a schedule or agreement.
 const r=await run(137),npc='npc_hw_wushuo',route='core:dialogue.guide_request';
 assert.equal(canonical(r.receipt.routed),route);assert.equal(r.preview.receipt.routing.routed,route);
 assert.equal(r.preview.receipt.status,'rejected');assert.equal(r.receipt.status,'rejected');
 assert.equal(r.receipt.code,'E-ACTION-PRECONDITION');assert.match(r.receipt.reason,/作息/);
 assert.deepEqual(r.receipt.applied,[]);assert.deepEqual(r.out.patches,[]);
 assert.deepEqual(persistable(r.after),persistable(r.document));

 // III.2: reach the real scheduled location through the existing walking action. The same
 // request must now emit and save native dialogue, not the other consumers' speech:* record.
 const destination=scheduleAt(engine,npc,r.document.state.minute,r.document.state).location;
 assert.notEqual(destination,r.document.state.location);
 const move=await engine.reduce(r.document,{tool:'world_act',args:{action:'core:move',slots:{destination}},eventId:'owner2-R-guide-walk'});
 assert.equal(move.result.receipt.status,'committed');
 const arrived=applyPatches(r.document,move.patches),before=persistable(arrived);
 assert.equal(arrived.state.location,destination);assert.equal(arrived.state.npcs[npc].location,destination);
 const input={...r.input,eventId:'owner2-R-guide-request-arrived'};
 const preview=await engine.previewAction(arrived,input),out=await engine.reduce(arrived,input),after=applyPatches(arrived,out.patches);
 assert.deepEqual(persistable(arrived),before);assert.deepEqual(auditLedger(after.ledger),[]);
 assert.equal(preview.receipt.routing.routed,route);assert.equal(preview.receipt.status,'preview');
 assert.equal(out.result.receipt.routed,route);assert.equal(out.result.receipt.status,'committed');
 assert.ok(out.result.receipt.applied.some(e=>e.op==='emit'&&e.verb==='request'&&e.target===npc));
 assert.ok(out.result.receipt.applied.every(e=>!['transfer','holding.open','obligation.create'].includes(e.op)));
 assert.equal(after.state.player.coins,arrived.state.player.coins);
 assert.deepEqual(after.state.inventory,arrived.state.inventory);assert.deepEqual(after.state.obligations,arrived.state.obligations);
 assert.deepEqual(after.holdings,arrived.holdings);
 assert.equal(after.state.location,arrived.state.location);assert.equal(after.state.npcs[npc].location,arrived.state.npcs[npc].location);
 const dialogue=after.state.dialogues[npc];assert.equal(dialogue.action,'request');
 assert.equal(dialogue.sourceEvent,input.eventId);assert.ok(dialogue.text);assert.ok(dialogue.decision);
 assert.ok(after.state.minute>arrived.state.minute);
 const replay=await engine.reduce(persistable(after),input);assert.deepEqual(replay.patches,[]);
});

test('R2: confession preserves the legal entry and refuses to promote a witness into an official',async()=>{
 const row=corpus.find(r=>r.id==='A3V2-180');
 const scene=applyIntentSetup(engine,initial,{location:'bld_hw_qingdeng',minute:600,present:['npc_hw_linsui','npc_hw_gucen','npc_hw_yanzhe']});assert.deepEqual(scene.setupUnmet,[]);
 let document=scene.document,crime;
 for(let i=0;i<30;i++){
  const out=await engine.reduce(document,{tool:'world_act',eventId:`R2-actual-theft-${i}`,args:{action:'core:crime.steal',slots:{target:'npc_hw_linsui',item:'item_bread'}}});
  if(out.result.success){document=applyPatches(document,out.patches);crime=out.result.case;break;}
 }
 assert.ok(crime);
 document=applyIntentSetup(engine,document,{present:['npc_hw_gucen']}).document;
 let out=await engine.reduce(document,{tool:'world_act',eventId:'R2-actual-report',args:{action:'core:law.confess',slots:{case:crime,authority:'npc_hw_gucen'}}});
 assert.equal(out.result.receipt.status,'committed');document=applyPatches(document,out.patches);
 document=officeScene(engine,document,{location:'bld_bs_watch',minute:document.state.minute,present:['npc_bs_035_1','npc_hw_yanzhe']});
 // S406b: the official decides the real filing request; the witness remains
 // a witness and cannot be promoted into a receiver by caller arguments.
 out=await engine.reduce(document,{tool:'world_act',eventId:'R2-actual-accept',args:{action:'law:request_decision',slots:{request:out.result.request,authority:'npc_bs_035_1'}}});
 assert.equal(out.result.receipt.status,'committed');document=applyPatches(document,out.patches);
 assert.equal(out.result.decision.source.kind,'npc_decision');assert.equal(out.result.accepted,true);
 assert.equal(document.state.records[crime].stage,'pending');assert.equal(document.state.records[crime].judgment,undefined);
 const prepared=prepareOpenAction(engine,document,row.proposal);
 assert.equal(prepared.routed,'core:law.confess');assert.equal(prepared.slots.request.kind,'confession');
 const preview=await engine.previewAction(document,{tool:'world_propose',args:row.proposal,eventId:'owner2-R-confess'});
 assert.equal(preview.receipt.routed,'core:law.confess');assert.equal(preview.receipt.status,'rejected');
 assert.match(preview.receipt.reason,/没有办理这件事的职权/);assert.deepEqual(preview.receipt.applied,[]);
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
