import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,applyIntentSetup} from '../tools/a3-score.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {environmentCatalog} from '../server-plugin/environment.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.initialFromLegacy(seed,'a3-r10');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
// 069 and 079 declare feature distances that contradict native geometry (3 m declared vs 0.5/1.5/1 m native, 01 §1.2;
// corpus-owned, reported to the main session). These mechanism regressions drop only that premise.
const row=id=>{const r=structuredClone(corpus.find(r=>r.id===`A3V2-${id}`));if(['069','079'].includes(id))delete r.setup.positions;
 // S4 now measures visible co-presence; this ambiguity case needs no contact.
 if(id==='086')r.setup.positions[0].distanceMeters=6;
 if(id==='070'){
  // The spell declares a legal permit even for self-casting. Obtain it through
  // the public action, paying the registered authority before relieving fear.
  r.setup.location='bld_bs_still_temple';r.setup.present=['npc_bs_076_3'];r.setup.coins=2;
  r.setup.prelude=[{tool:'world_act',eventId:'r10-mind-permit',args:{action:'core:law.grant_magic_permit',slots:{authority:'npc_bs_076_3',location:r.setup.location,subject:'player',action:'mental_magic',minutes:60}}}];
  r.proposal.means.permit='magic_permission:r10-mind-permit';
 }
 return r;};
const diagnostic=run=>JSON.stringify({actual:run.actual,setupUnmet:run.setupUnmet});

test('r10: clothing repair consumes thread and preserves the same unit and paid workstation',async()=>{
 const input=row('028'),run=await executeIntent(engine,initial,input);
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.actual.route,'core:craft.repair',diagnostic(run));
 const before=run.before.state.itemInstances,after=run.document.state.itemInstances;
 const id=Object.keys(before).find(id=>before[id].item==='item_clothes');
 assert.equal(after[id].item,before[id].item);
 assert.equal(engine.quantity(engine.primitiveDraft(run.document),'player','item_hemp_thread'),0);
 assert.equal(run.document.state.player.coins,0);
 assert.deepEqual(auditLedger(run.document.ledger),[]);
 const missing=row('028');delete missing.setup.inventory.item_hemp_thread;
 const denied=await executeIntent(engine,initial,missing);
 assert.equal(denied.actual.committed,false);
});

test('r10: irrigation binds the real channel and transfers original water',async()=>{
 const run=await executeIntent(engine,initial,row('069'));
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.actual.route,'core:cast',diagnostic(run));
 const source=environmentCatalog(engine,run.document,{entity:'feature_hw_pool'}),dest=environmentCatalog(engine,run.document,{entity:'feature_hw_plot'});
 assert.equal(source.waterMl,10000);assert.equal(dest.waterMl,20000);
 assert.ok(run.receipt.applied.some(e=>e.op==='learn'&&e.learningSource==='practice'&&e.mode==='practice'));
 const blocked=row('069');blocked.setup.objects[1].blockagePercent=100;
 const denied=await executeIntent(engine,initial,blocked);
 assert.equal(denied.actual.committed,false);
 assert.equal(environmentCatalog(engine,denied.document,{entity:'feature_hw_pool'}).waterMl,30000);
});

test('r10: self relief consumes MP and reduces only existing fear',async()=>{
 const run=await executeIntent(engine,initial,row('070'));
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.actual.route,'core:cast',diagnostic(run));
 assert.equal(run.document.state.player.mp,0);
 assert.equal(run.before.state.records['magic_permission:r10-mind-permit'].sourceType,'magic_permit');
 assert.equal(run.before.state.player.coins,0,'the real permit fee was paid');
 assert.ok(run.receipt.applied.some(e=>e.op==='status'&&e.status==='fear'&&e.removed===true));
 assert.equal(Object.values(run.document.state.effects).some(r=>r.target==='player'&&r.status==='fear'&&r.power>0&&r.expires>run.document.state.minute),false);
});

test('r10: drawing and cleaning water uses both native spells and keeps pollution and volume',async()=>{
 const run=await executeIntent(engine,initial,row('079'));
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.actual.route,'open:proposal',diagnostic(run));
 const source=environmentCatalog(engine,run.document,{entity:'feature_hw_pool'}),bucket=environmentCatalog(engine,run.document,{entity:'feature_hw_kitchen_bucket'});
 assert.equal(source.waterMl,20000);assert.equal(bucket.waterMl,10000);
 assert.equal(run.document.state.player.mp,0);
 const original=run.before.state.records['physical_feature:feature_hw_pool'].state;
 const originalBucket=run.before.state.records['physical_feature:feature_hw_kitchen_bucket'].state;
 const rawBucket=run.document.state.records['physical_feature:feature_hw_kitchen_bucket'].state;
 assert.equal(rawBucket.toxinUg,originalBucket.toxinUg+original.toxinUg/3);
 assert.equal(rawBucket.saltMg,originalBucket.saltMg+original.saltMg/3);
 assert.equal(rawBucket.pathogenRisk,Math.max(originalBucket.pathogenRisk,original.pathogenRisk));
 assert.equal(bucket.turbidity,Math.max(0,original.turbidity-engine.byId.get('spell_water_02').effectSpec.power));
 assert.ok(run.receipt.applied.some(e=>e.op==='transfer'&&e.resource==='water'&&e.qty===10));
 assert.ok(run.receipt.applied.some(e=>e.op==='fact.set'&&e.entity==='feature_hw_kitchen_bucket'&&e.field==='turbidity'));
 const insufficient=row('079');insufficient.setup.body.player.mp=4;
 const denied=await executeIntent(engine,initial,insufficient);
 assert.equal(denied.actual.committed,false);
 assert.equal(environmentCatalog(engine,denied.document,{entity:'feature_hw_pool'}).waterMl,30000);
 assert.equal(environmentCatalog(engine,denied.document,{entity:'feature_hw_kitchen_bucket'}).waterMl,0);
 assert.equal(denied.document.state.player.mp,4);
});

test('r10: an unresolved goal asks a question without acting on the person',async()=>{
 const input=row('086'),before=applyIntentSetup(engine,initial,input.setup),run=await executeIntent(engine,initial,input);
 assert.deepEqual(run.setupUnmet,[]);
 assert.equal(run.actual.route,'clarify',diagnostic(run));
 assert.equal(run.actual.committed,false);
 assert.deepEqual(run.document,before.document);
 assert.deepEqual(run.actual.signatureEffects,[]);
 const privateRead=await executeIntent(engine,initial,row('108'));
 assert.equal(privateRead.actual.refused,true);
 assert.equal(privateRead.actual.committed,false);
});

test('r10: a failed water spell retains its attempted cost and cannot run the dependent cleaner',async()=>{
 let failed;
 for(let n=0;n<32;n++){
  const candidate=structuredClone(initial);candidate.randomSeed=`r10-water-failure-${n}`;
  const run=await executeIntent(engine,candidate,row('079'));
  const check=Object.entries(run.document.state.checks??{}).find(([id])=>id.includes(':step:0:'))?.[1];
  if(check?.success===false){failed=run;break;}
 }
 assert.ok(failed,'native d20 seeds include a failed first spell');
 assert.equal(failed.actual.committed,true);
 assert.equal(failed.document.state.player.mp,6-engine.byId.get('spell_water_04').mp);
 assert.equal(failed.receipt.steps.length,1);
 assert.equal(failed.receipt.routing.failedStep,0);
 assert.equal(environmentCatalog(engine,failed.document,{entity:'feature_hw_pool'}).waterMl,30000);
 assert.equal(environmentCatalog(engine,failed.document,{entity:'feature_hw_kitchen_bucket'}).waterMl,0);
});
