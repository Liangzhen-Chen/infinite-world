import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {applyPatches,CampaignStorage,persistable} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';

const engine=new WorldEngine(await loadWorld());
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.createCharacter(seed,{},'owner2-R2');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
function fixture(n){
 const row=corpus.find(r=>r.id===`A3V2-${n}`),setup=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(setup.setupUnmet,[]);return {row,document:setup.document};
}
const input=(proposal,id)=>({tool:'world_propose',args:proposal,eventId:`owner2-R2-${id}`});

test('R2-130: unavailable teleport is a reasoned refusal in preview and execution, with no writes',async()=>{
 const {row,document}=fixture(130),before=persistable(document),request=input(row.proposal,'130');
 const preview=await engine.previewAction(document,request),out=await engine.reduce(document,request);
 for(const receipt of [preview.receipt,out.result.receipt]){
  assert.equal(receipt.status,'rejected');assert.equal(receipt.code,'E-OPEN-ABILITY');
  assert.match(receipt.reason,/尚未掌握传送法术/);assert.ok(receipt.missing.length);
  assert.ok(receipt.repair.some(r=>/向当地向导询路/.test(r)));
  assert.ok(receipt.repair.every(r=>!/[0-9]+天/.test(r)),'unknown travel duration must not be invented');
  assert.deepEqual(receipt.applied,[]);
 }
 assert.deepEqual(out.patches,[]);assert.deepEqual(persistable(document),before);
 await assert.rejects(()=>engine.previewAction(document,input({intent:'直接改写钱袋',effects:[{op:'fact.set',entity:'player',field:'coins',value:100}]},'policy-error')),{code:'E-FACT-FIELD'},'proposal policy failures must still propagate');
});

test('R2-130: equivalent empty displacement requests cannot bypass ability checks with fabricated means',async()=>{
 const {document}=fixture(130);
 for(const [i,proposal] of [
  {intent:'把我传送到王都',effects:[]},
  {intent:'现在瞬移到城门',effects:[]},
  {intent:'立即到城门',means:{manner:'teleport'},effects:[]},
  {intent:'把我传送到王都',means:{spells:['spell_fake_teleport'],tools:['portal_fake']},effects:[]},
  {intent:'把我传送到王都',means:{spell:'spell_fake_teleport'},effects:[]}
 ].entries()){
  const before=persistable(document);
  const out=await engine.reduce(document,input(proposal,`missing-${i}`));
  assert.equal(out.result.receipt.status,'rejected');assert.equal(out.result.receipt.code,'E-OPEN-ABILITY');assert.deepEqual(out.patches,[]);
  assert.deepEqual(persistable(document),before);
 }
 for(const proposal of [
  {intent:'我没有传送法术，应该怎样学习？',effects:[]},
  {intent:'我想学会传送到王都的法术',effects:[]},
  {intent:'如果我会传送到王都，能带几个人？',effects:[]},
  {intent:'没有传送法术，先问问正常路线需要几天',effects:[]},
  {intent:'【独立场景】马上把我传送到王都【本次意图】看看四周',effects:[]}
 ])assert.doesNotThrow(()=>createRoutingContext(engine,document).assertRequest(proposal));
 const {row:cast,document:castDoc}=fixture(162),out=await engine.reduce(castDoc,input(cast.proposal,'unlearned-cast'));
 assert.equal(out.result.receipt.routed,'core:cast');assert.equal(out.result.receipt.status,'rejected');
 assert.match(out.result.receipt.reason,/尚未学会/);assert.deepEqual(out.patches,[]);
});

test('R2-130: actual learned knowledge, not a textual denial, determines the missing-ability refusal',()=>{
 const {row}=fixture(130),spell=engine.world.spells.find(s=>s.effectSpec?.kind==='teleport');assert.ok(spell);
 const setup=applyIntentSetup(engine,initial,{...row.setup,abilities:{spells:[spell.id]}});assert.deepEqual(setup.setupUnmet,[]);
 assert.ok(setup.document.state.spells[spell.id]);
 assert.doesNotThrow(()=>createRoutingContext(engine,setup.document).assertRequest(row.proposal));
 // Having a spell does not fabricate a destination, anchor, permit or success.
 assert.deepEqual(setup.document.state.obligations,initial.state.obligations);
});

test('R2-171: native request preserves surrender topic and contested judgement without surrendering the NPC',async()=>{
 const {row,document}=fixture(171),request=input(row.proposal,'171'),out=await engine.reduce(document,request),after=applyPatches(document,out.patches);
 assert.equal(out.result.receipt.status,'committed');
 const effect=out.result.receipt.applied.find(e=>e.op==='emit');assert.equal(effect.verb,'request');assert.equal(effect.payload.kind,'surrender');
 assert.equal(after.state.dialogues.npc_hw_wushuo.requestSubject,'surrender');assert.ok(after.state.dialogues.npc_hw_wushuo.judgement);
 assert.equal(after.state.records[`speech:${request.eventId}`].topic,'surrender');
 const event=Object.values(after.state.records).find(r=>r.category==='world_event'&&r.verb==='request'&&r.payload?.kind==='surrender');
 assert.ok(event);assert.equal(event.visibility,'private');assert.deepEqual(event.witnesses,['npc_hw_wushuo']);
 assert.deepEqual(after.state.obligations,document.state.obligations);assert.deepEqual(after.state.inventory,document.state.inventory);
 assert.equal(after.state.npcs.npc_hw_wushuo.location,document.state.npcs.npc_hw_wushuo.location);assert.deepEqual(auditLedger(after.ledger),[]);
 const forged=await engine.reduce(document,{tool:'world_act',eventId:'owner2-R2-forged-topic',args:{action:'open:persuade_request',slots:{subject:'npc_hw_wushuo',content:'放下刀',topic:'surrendered'}}});
 assert.equal(forged.result.receipt.status,'rejected');assert.deepEqual(forged.patches,[]);
 const consent=await engine.reduce(document,{tool:'world_act',eventId:'owner2-R2-forged-consent',args:{action:'open:persuade_request',slots:{subject:'npc_hw_wushuo',content:'放下刀',topic:'surrender',consent:true}}});
 assert.equal(consent.result.receipt.status,'rejected');assert.deepEqual(consent.patches,[]);
});

test('R2-121: checkout emits an actual renewal price question, never a renewal or second payment',async()=>{
 const {row,document}=fixture(121),out=await engine.reduce(document,input(row.proposal,'renewal')),after=applyPatches(document,out.patches);
 const requests=out.result.receipt.applied.filter(e=>e.op==='emit'&&e.verb==='request');
 assert.equal(requests.length,1);assert.equal(requests[0].payload.kind,'renewal_quote');
 assert.equal(requests[0].target,'npc_hw_linsui');assert.equal(document.state.player.coins-after.state.player.coins,6);
 assert.equal(after.state.minute,2640);assert.deepEqual(auditLedger(after.ledger),[]);
 const events=Object.values(after.state.records).filter(r=>r.category==='world_event'&&r.payload?.kind==='renewal_quote');
 assert.ok(events.length);assert.ok(events.every(e=>e.verb==='request'));
 const contracts=Object.values(after.state.records).filter(r=>r.category==='contract'&&r.parties?.includes('player')&&r.starts>=1200);
 assert.equal(contracts.length,1);assert.ok(contracts[0].expires<=after.state.minute);
});

test('R2: save reopen and replay retain real knowledge, refusal and request topic',async t=>{
 const directory=await fs.mkdtemp(path.resolve('.a3-R2-storage-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(d,i)=>engine.reduce(d,i),store=new CampaignStorage(directory,{snapshotEvery:1,reducer});
 const {row,document}=fixture(171),request=input(row.proposal,'persist');
 await store.create({id:'speech',worldVersion:'owner2-R2',document});
 await store.transact('speech',{id:request.eventId,input:request},reducer);
 const reopened=new CampaignStorage(directory,{reducer}),loaded=await reopened.load('speech');
 assert.equal(loaded.document.state.records[`speech:${request.eventId}`].topic,'surrender');
 const replay=await engine.reduce(loaded.document,request);assert.deepEqual(replay.patches,[]);
 const {row:teleport,document:missing}=fixture(130);
 await store.create({id:'missing',worldVersion:'owner2-R2',document:missing});
 const refused=input(teleport.proposal,'persist-refusal');await store.transact('missing',{id:refused.eventId,input:refused},reducer);
 const restored=await reopened.load('missing');assert.deepEqual(persistable(restored.document),persistable(missing));
 assert.equal(restored.events.length,1);assert.equal(restored.events[0].result.receipt.code,'E-OPEN-ABILITY');
 assert.deepEqual(restored.events[0].patches,[]);
 const retried=await engine.reduce(restored.document,refused);assert.equal(retried.result.receipt.code,'E-OPEN-ABILITY');assert.deepEqual(retried.patches,[]);
 const spell=engine.world.spells.find(s=>s.effectSpec?.kind==='teleport');
 const known=applyIntentSetup(engine,initial,{...teleport.setup,abilities:{spells:[spell.id]}});assert.deepEqual(known.setupUnmet,[]);
 await store.create({id:'known',worldVersion:'owner2-R2',document:known.document});
 const learned=await reopened.load('known');assert.deepEqual(learned.document.state.spells,known.document.state.spells);
 assert.doesNotThrow(()=>createRoutingContext(engine,learned.document).assertRequest(teleport.proposal));
});
