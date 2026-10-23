import test from 'node:test';
import assert from 'node:assert/strict';
import {assertActionRejected} from './helpers/action-refusal.mjs';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.createCharacter(seed,{},'r13-regression');
const rows=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
function fixture(n){
 const row=rows.find(r=>r.id===`A3V2-${n}`),setup=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(setup.setupUnmet,[]);
 return {row,document:setup.document};
}
async function act(n){
 const {row,document}=fixture(n),before=structuredClone(document);
 const input={tool:'world_propose',args:row.proposal,eventId:`r13-${n}`};
 const preview=await engine.previewAction(document,input);
 assert.deepEqual(document,before);
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches);
 assert.deepEqual(document,before);assert.deepEqual(auditLedger(after.ledger),[]);
 return {row,document,after,preview,out,input};
}

test('A3 r13: ordinary requests route without accepting purchases, gifts or NPC commitments',async()=>{
 for(const n of [123,128,136,143,190,192,193,195,196]){
  const r=await act(n);
  assert.equal(r.preview.receipt.routing.routed,r.row.expected.route,String(n));
  assert.equal(r.after.state.player.coins,r.document.state.player.coins,String(n));
  assert.deepEqual(r.after.state.inventory,r.document.state.inventory,String(n));
  assert.deepEqual(r.after.state.obligations,r.document.state.obligations,String(n));
  assert.ok(r.out.result.receipt.applied.every(e=>!['transfer','holding.open','obligation.create'].includes(e.op)),String(n));
 }
 for(const n of [127,163,167]){
  const {row,document}=fixture(n),prepared=prepareOpenAction(engine,document,row.proposal);
  assert.equal(prepared.status,'open',`negotiation ${n} retains its request protocol`);
 }
});

test('A3 r13: known distant walking binds destination and pays actual travel time',async()=>{
 const r=await act(129);
 assert.equal(r.preview.receipt.routing.routed,'core:move');
 assert.equal(r.after.state.location,'loc_bs');
 assert.ok(r.after.state.minute-r.document.state.minute>=360);
 assert.equal(r.after.state.player.coins,0);
});

test('A3 r13: starting research records a concept without precreating its result',async()=>{
 const r=await act(164);
 assert.equal(r.preview.receipt.routing.routed,'core:research');
 const project=Object.values(r.after.state.projects).find(p=>p.name==='rain_grip');
 assert.equal(project.stage,'构想');assert.equal(project.result,null);
 assert.deepEqual(project.skills,['skill_life_6_core']);
 assert.deepEqual(r.after.state.inventory,r.document.state.inventory);
 const {row,document}=fixture(164);delete document.state.skills.skill_life_6_core;
 const refused=await engine.previewAction(document,{tool:'world_propose',args:row.proposal,eventId:'r13-research-unlearned'});
 assert.equal(refused.receipt.status,'rejected');
 assert.match(refused.receipt.reason,/没有掌握/);
 assert.throws(()=>prepareOpenAction(engine,document,{intent:'研究',effects:[{op:'create',kind:'project',tags:['research','permission:granted'],facts:{}}],means:{manner:'research'}}),{code:'E-PRIMITIVE-SOURCE'});
});

test('A3 r13: empty claimed effects still identify an explicit cast, then refuse unlearned magic',async()=>{
 const {row,document}=fixture(162),before=structuredClone(document);
 const input={tool:'world_propose',args:row.proposal,eventId:'r13-unlearned-cast'};
 const preview=await engine.previewAction(document,input);
 assert.equal(preview.receipt.routing.routed,'core:cast');
 assert.equal(preview.receipt.status,'rejected');assert.match(preview.receipt.reason,/尚未学会/);
 const result=await engine.reduce(document,input);
 assert.deepEqual(result.patches,[]);assert.deepEqual(document,before);
});

test('A3 r13: explicit waiting advances a day and does not accept a quest',async()=>{
 const r=await act(185);
 assert.equal(r.preview.receipt.routing.routed,'core:time');
 assert.equal(r.after.state.minute-r.document.state.minute,1440);
 // NPCs may publish new offers during the day; the player accepts none.
 const accepted=state=>Object.values(state.quests??{}).filter(q=>q.taker==='player');
 assert.deepEqual(accepted(r.after.state),accepted(r.document.state));
 const {document}=fixture(185);
 const observation=prepareOpenAction(engine,document,{intent:'观察四周',effects:[]});
 assert.equal(observation.routed,'core:look');
});

test('A3 r13: next-day clock and native paid lodging cover sleep without a second payment',async()=>{
 const r=await act(197);
 assert.equal(r.preview.receipt.routing.routed,'core:time.sleep');
 assert.equal(r.after.state.minute,1740);assert.equal(r.after.state.player.coins,80);
 assert.equal(r.preview.receipt.cost.sleep.coveredMinutes,540);
 assert.equal(r.preview.receipt.cost.sleep.recovery.stamina.value,100);
 const {row,document}=fixture(197);
 for(const h of Object.values(document.holdings.rows))if(h.kind==='lodges'&&h.holder==='player')h.terms.until=1260;
 const limited=await engine.previewAction(document,{tool:'world_propose',args:row.proposal,eventId:'r13-sleep-partial'});
 assert.equal(limited.receipt.cost.sleep.coveredMinutes,60);
 assert.ok(limited.receipt.cost.sleep.recovery.stamina.value<100);
});

test('A3 r13: a custom satire mark keeps its materials and creates no actual debt',async()=>{
 const r=await act(228);
 assert.equal(r.preview.receipt.routing.status,'open');
 const mark=Object.values(r.after.state.created).find(x=>x.kind==='mark'&&x.form==='赖账讽刺纸条');
 assert.ok(mark);assert.ok(mark.tags.includes('mark:satire'));
 const material=createRoutingContext(engine,r.document).resolve('a3v2_228_material').value;
 assert.equal(r.after.state.itemInstances[material].status,'已消耗');
 assert.equal(r.after.state.inventory[material],undefined);
 assert.deepEqual(r.after.state.obligations,r.document.state.obligations);
 assert.equal(r.after.state.player.coins,0);
 const replay=await engine.reduce(JSON.parse(JSON.stringify(r.after)),r.input);assert.deepEqual(replay.patches,[]);
 const before=structuredClone(r.after);
 // Reusing the consumed paper still refuses and preserves the whole prior world.
 await assertActionRejected(engine.reduce(r.after,{...r.input,eventId:'r13-satire-material-already-used'}),undefined,null);
 assert.deepEqual(r.after,before);
});
