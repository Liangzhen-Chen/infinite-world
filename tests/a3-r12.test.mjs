import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const engine=new WorldEngine(await loadWorld());
const initial=engine.initialFromLegacy(JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),'a3-r12');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
function memorial(){
 const row=corpus.find(r=>r.id==='A3V2-117'),setup=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(setup.setupUnmet,[]);
 // The r7 premise supplies the same pre-existing shoe and reachable branch.
 // 01 §1.2/§1.6 and this card replace consuming a shoe with placing that object.
 const mark=structuredClone(row.proposal.effects.find(e=>e.op==='create'));delete mark.materials;
 Object.assign(mark.facts,{object:'a3v2_117_old_shoe',support:'a3v2_117_branch'});
 return {...setup,proposal:{intent:row.intent,effects:[{op:'move',entity:'a3v2_117_old_shoe',to:row.setup.location,mode:'place'},mark]}};
}
test('r12: original carried shoe is placed with its memorial, preserving identity, title, accounts and replay',async()=>{
 const {document,bindings,proposal}=memorial(),before=structuredClone(document),shoe=bindings.a3v2_117_old_shoe,branch=bindings.a3v2_117_branch;
 const input={tool:'world_propose',eventId:'r12-memorial',args:proposal};
 assert.equal(prepareOpenAction(engine,document,proposal).status,'open');
 const preview=await engine.previewAction(document,input);
 assert.equal(preview.receipt.status,'preview');assert.deepEqual(preview.receipt.applied.map(e=>e.op),['move','create']);
 assert.deepEqual(document,before,'preview does not place or consume the shoe');
 const reduced=await engine.reduce(document,input),after=applyPatches(document,reduced.patches),receipt=reduced.result.receipt;
 assert.equal(receipt.source.id,'open:proposal');assert.equal(receipt.status,'committed');
 assert.deepEqual(receipt.applied.map(e=>e.op),['move','create']);
 assert.equal(after.holdings.locations[shoe].at,'loc_hw_orchard');assert.equal(after.holdings.locations[shoe].mode,'place');
 assert.deepEqual(after.holdings.entities[shoe],before.holdings.entities[shoe],'same shoe, no replacement or destruction');
 const title=Object.values(before.holdings.rows).filter(h=>h.kind==='owns'&&h.subject===shoe);
 assert.ok(title.length);for(const h of title)assert.deepEqual(after.holdings.rows[h.id],h);
 const mark=after.state.records[`mark:${receipt.applied[1].result.entity}`];
 assert.equal(mark.object,shoe);assert.equal(mark.support,branch);assert.equal(mark.intent,proposal.intent);
 assert.ok(mark.tags.includes('mark:memorial'));assert.ok(receipt.applied[1].result.reactions.length);
 assert.deepEqual(after.ledger.accounts,before.ledger.accounts);
 assert.deepEqual(reconcile(engine,after),{mismatches:[],lots:[],drift:[],audit:[]});
 assert.deepEqual((await engine.reduce(after,input)).patches,[],'same event cannot duplicate shoe or mark');
 assert.deepEqual((await engine.reduce(document,input)).patches,reduced.patches,'deterministic replay');
});
test('r12: placement cannot move another object, travel remotely, or fabricate an unreachable support',async()=>{
 for(const mode of ['other_owner','remote','unreachable','missing_support']){
  const {document,bindings,proposal}=memorial(),shoe=bindings.a3v2_117_old_shoe,branch=bindings.a3v2_117_branch;
  if(mode==='other_owner')for(const h of Object.values(document.holdings.rows))if(h.kind==='owns'&&h.subject===shoe)h.holder='npc_hw_meiling';
  if(mode==='remote')proposal.effects[0].to='loc_hw';
  if(mode==='unreachable')document.holdings.entities[branch].facts.reachable=false;
  if(mode==='missing_support')proposal.effects[1].facts.support='missing_branch';
  const before=structuredClone(document),plan=mode==='remote'?prepareOpenAction(engine,document,proposal):null;
  if(plan)assert.equal(plan.status,'needs_alternative');
  else await assert.rejects(engine.previewAction(document,{tool:'world_propose',eventId:`r12-${mode}`,args:proposal}),error=>/^E-(AUTHORITY|MARK-LOCATION|OPEN-ENTITY)$/.test(error.code),mode);
  assert.deepEqual(document,before,mode);
 }
});
test('r12: mutually exclusive final fact values ask for a choice without costs, fallback or paper damage',async()=>{
 const row=corpus.find(r=>r.id==='A3V2-087'),setup=structuredClone(row.setup);
 // Contradiction is independent of permission to use a fire. No manager or
 // permission is invented for the r7 unresolved role selectors.
 delete setup.history;delete setup.permits;
 const {document,setupUnmet}=applyIntentSetup(engine,initial,setup);assert.deepEqual(setupUnmet,[]);
 const before=structuredClone(document),input={tool:'world_propose',eventId:'r12-paper',args:row.proposal};
 const plan=prepareOpenAction(engine,document,row.proposal);
 assert.equal(plan.status,'needs_slots');assert.equal(plan.routed,null);assert.equal(plan.fallback,undefined);
 assert.deepEqual(plan.conflicts[0].values,[0,100]);assert.deepEqual(plan.effects,[]);
 const preview=await engine.previewAction(document,input);
 assert.equal(preview.receipt.status,'not_submitted');assert.deepEqual(preview.receipt.applied,[]);
 await assert.rejects(engine.reduce(document,input),{code:'E-OPEN-NOT-ROUTED'});
 assert.deepEqual(document,before);
 const repeated=structuredClone(row.proposal);repeated.effects[1].value=0;
 assert.notEqual(prepareOpenAction(engine,document,repeated).status,'needs_slots','identical writes are not contradictory');
});
