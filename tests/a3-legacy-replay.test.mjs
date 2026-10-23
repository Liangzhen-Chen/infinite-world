import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {loadActionRegistry,actionOfCall} from '../server-plugin/action-registry.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches,digest} from '../server-plugin/storage.mjs';
import '../server-plugin/primitives-runtime.mjs';

// Captured with master 0c302b5 using its loader, reducer and CampaignStorage.
// A fresh campaign starts five minutes before winter; casting the already
// known light spell and waiting crosses the real seasonal K6 -> K2 pipeline.
// Pin the old world too: later content edits must not change replay inputs.
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/legacy-r2-primitives.json',import.meta.url),'utf8'));
const receipts=document=>Object.fromEntries(Object.entries(document.state.records).filter(([id,row])=>id.startsWith('primitive:')||row.category==='primitive_receipt'));

test('A3 legacy replay: fixture contains successful M4 casting and real K6/K2 winter freezing',()=>{
 const {bundle,projection}=fixture;
 assert.equal(bundle.initial.schemaVersion,2);
 assert.equal(fixture.world.rules.engineRevision,2);
 assert.equal(digest(bundle.initial),bundle.metadata.initialHash);
 assert.equal(bundle.events.length,2);
 assert.equal(bundle.events[0].input.tool,'world_cast');
 assert.equal(bundle.events[0].result.success,true);
 assert.equal(projection.state.effects['legacy-cast'].kind,'light');
 const winter=projection.state.records['season-effect:winter-ice:loc_hw:1'];
 assert.equal(winter.applied,true);
 assert.equal(winter.effects[0].kind,'environment');
 assert.ok(winter.effects[0].changed.includes('feature_hw_pool'));
 assert.equal(projection.state.records['physical_feature:feature_hw_pool'].state.frozenUntil,270*1440+30*1440);
 assert.deepEqual(receipts(projection),{});
 assert.equal(digest(projection),bundle.documentHash);
});

let before=fixture.bundle.initial;
for(const event of fixture.bundle.events){
 const initial=before,expected=applyPatches(initial,event.patches);
 before=expected;
 test(`A3 legacy replay: ${event.id} retains its projection without new receipts`,async()=>{
  const engine=new WorldEngine(structuredClone(fixture.world));
  const out=await engine.reduce(structuredClone(initial),event.input,{replay:true,result:event.result});
  const actual=applyPatches(initial,JSON.parse(JSON.stringify(out.patches)));
  assert.deepEqual(receipts(actual),receipts(expected),`${event.id}: no backfilled receipts`);
  assert.equal(digest(actual),digest(expected),`${event.id}: exact replay hash`);
  assert.deepEqual(actual,expected,`${event.id}: exact saved projection`);
 });
}

test('A3 legacy replay: import, cold reload and export retain old hash and projection',async t=>{
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'a3-legacy-replay-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const engine=new WorldEngine(structuredClone(fixture.world)),reducer=engine.reduce.bind(engine);
 const store=new CampaignStorage(directory,{reducer});
 const imported=await store.import(structuredClone(fixture.bundle),'legacy-copy');
 assert.equal(digest(imported.document),fixture.bundle.documentHash);
 assert.deepEqual(imported.document,fixture.projection);
 assert.deepEqual(receipts(imported.document),{});
 const fresh=new CampaignStorage(directory,{reducer});
 assert.deepEqual((await fresh.read('legacy-copy')).document,fixture.projection);
 const exported=await fresh.export('legacy-copy');
 assert.equal(exported.documentHash,fixture.bundle.documentHash);
 assert.equal(exported.checksum,fixture.bundle.checksum);
 assert.deepEqual(exported.events,fixture.bundle.events);
});

test('A3 native replay: new events and unversioned a3a receipts survive import and cold reload',async t=>{
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'a3-native-replay-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const world=await loadWorld(),engine=new WorldEngine(world),reducer=engine.reduce.bind(engine);
 const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
 seed.state.minute=fixture.provenance.startingMinute;
 const initial=engine.initialFromLegacy(seed,'a3h-new-r2');
 const store=new CampaignStorage(directory,{reducer});
 await store.create({id:'native',worldVersion:world.version,document:initial});
 for(const event of fixture.bundle.events){
  const action=actionOfCall(loadActionRegistry(),event.input.tool,event.input.args);
  assert.ok(action,'the real cast/wait actions remain registered');
  const input={tool:'world_act',eventId:event.id,args:{action:action.id,slots:event.input.args}};
  const {document}=await store.read('native'),before=structuredClone(document);
  await engine.previewAction(document,input);
  assert.deepEqual(document,before,'preview must not mutate the saved document');
  const out=await store.transact('native',{id:event.id,input},reducer);
  assert.equal(out.result.nativePrimitiveVersion,1);
 }
 const {document}=await store.read('native'),bundle=await store.export('native');
 const families=new Set(Object.values(receipts(document)).map(row=>row.receipt.source.id));
 for(const family of ['m4:magic','k2:interaction','k6:season'])assert.ok(families.has(family),family);
 assert.equal(digest(document),bundle.documentHash);
 const unversioned=structuredClone(bundle);
 let head=unversioned.metadata.initialHash;
 // Pre-version a3a had the same real native patches, but no result marker.
 // Rehash only that historical envelope shape; keep every gameplay patch,
 // input, receipt and final projection produced by the real actions above.
 for(const event of unversioned.events){
  delete event.result.nativePrimitiveVersion;
  event.previous=head;
  const {hash,...body}=event;event.hash=digest(body);head=event.hash;
 }
 unversioned.checksum=head;
 for(const [id,source] of [['versioned',bundle],['unversioned',unversioned]])await t.test(id,async()=>{
  const imported=await store.import(source,id);
  assert.equal(digest(imported.document),bundle.documentHash);
  assert.deepEqual(imported.document,document);
  assert.deepEqual(receipts(imported.document),receipts(document));
  const fresh=new CampaignStorage(directory,{reducer});
  assert.deepEqual((await fresh.read(id)).document,document);
  const exported=await fresh.export(id);
  assert.equal(exported.documentHash,bundle.documentHash);
  assert.equal(exported.checksum,source.checksum);
  assert.deepEqual(exported.events,source.events);
 });
});
