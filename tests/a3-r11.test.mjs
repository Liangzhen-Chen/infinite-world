import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {limitedPermit} from '../server-plugin/action-authority.mjs';
import {worldEvent} from '../server-plugin/world-events.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const engine=new WorldEngine(await loadWorld());
const initial=engine.initialFromLegacy(JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),'a3-r11');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
function setup(){
 const input=structuredClone(corpus.find(r=>r.id==='A3V2-085').setup);
 // A3 r11 concerns identity and source authority, independently of S4 sides.
 for(const item of input.itemInstances){item.owner='npc_hw_linsui';delete item.tableSide;}
 delete input.positions;
 for(const event of input.history)event.actor='npc_hw_linsui';
 for(const permit of input.permits)permit.issuer='npc_hw_linsui';
 return input;
}
test('r11: physical history and permits bind the same original objects and survive JSON reload',()=>{
 const input=setup(),result=applyIntentSetup(engine,initial,input);
 assert.deepEqual(result.setupUnmet,[]);
 const document=JSON.parse(JSON.stringify(result.document)),context={engine,document};
 for(const permit of input.permits){
  const subject=result.bindings[permit.subject];
  assert.notEqual(subject,permit.subject);
  assert.equal(worldEvent(document.state,result.bindings[permit.sourceEvent]).subject,subject);
  assert.equal(limitedPermit(context,'player',subject,'drink')?.id,permit.id);
  assert.equal(limitedPermit(context,'player',subject,'take'),null);
 }
 assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
});
test('r11: resolving physical aliases does not accept a different subject, issuer or scope',()=>{
 for(const field of ['subject','issuer','scope']){
  const input=setup();
  input.permits[0][field]=field==='subject'?input.itemInstances[1].id:field==='issuer'?'npc_hw_wushuo':'take';
  const result=applyIntentSetup(engine,initial,input);
  assert.ok(result.setupUnmet.some(e=>e.item==='permits[0]'&&/mismatch/.test(e.reason)),field);
  assert.equal(result.document.state.records[`limited_permit:${input.permits[0].id}`],undefined);
 }
 const input=setup();for(const event of input.history)event.actor='npc_hw_wushuo';for(const permit of input.permits)permit.issuer='npc_hw_wushuo';
 const denied=applyIntentSetup(engine,initial,input);
 assert.ok(denied.setupUnmet.some(e=>e.item==='permits[0]'&&/current owner\/manager/.test(e.reason)));
});
test('r11: place ownership stays rejected and points to a legal organization or office',()=>{
 const input=setup();input.itemInstances[0].owner='loc_far_huancheng';
 const result=applyIntentSetup(engine,initial,input);
 assert.ok(result.setupUnmet.some(e=>e.item==='itemInstances[0]'&&/owner cannot be a place.*organization or office.*05 §5.3/.test(e.reason)));
 assert.equal(result.bindings[input.itemInstances[0].id],undefined);
});
test('r11: physical provenance still loads before the physical premise that consumes it',()=>{
 const result=applyIntentSetup(engine,initial,{
  location:'loc_hw',minute:600,
  history:[{id:'pool_seen',verb:'observed',at:599,source:{kind:'corpus_premise',row:'A3V2-TEST'},actor:'player',observer:'player',subject:'feature_hw_pool'}],
  objects:[{id:'feature_hw_pool',sourceEvent:'pool_seen'}],
 });
 assert.deepEqual(result.setupUnmet,[]);
 assert.equal(worldEvent(result.document.state,result.bindings.pool_seen).subject,'feature_hw_pool');
});
