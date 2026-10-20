import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,signatureEffects} from '../tools/a3-score.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {transferItems} from '../server-plugin/items.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.createCharacter(seed,{},'a3-score-independent');
const rows=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2.json',import.meta.url),'utf8'));
const run=(id,{die}={})=>{
 const document=structuredClone(initial);
 if(die)for(let n=0;;n++){
  const candidate=`a3-r8:${id}:${n}`;
  if(createHash('sha256').update(`${candidate}:a3-score-A3V2-${id}:d20`).digest().readUInt32LE(0)%20+1===die){document.randomSeed=candidate;break;}
 }
 return executeIntent(engine,document,rows.find(r=>r.id===`A3V2-${id}`));
};

test('R8: native practice receipt reports the actual span without advancing or learning twice',async()=>{
 for(const id of ['013','016']){
  const r=await run(id),learn=r.receipt.applied.find(e=>e.op==='learn'),time=r.receipt.applied.find(e=>e.op==='time');
  assert.equal(r.actual.committed,true);assert.deepEqual(r.setupUnmet,[]);
  assert.equal(time.mode,'practice');assert.equal(time.minutes,learn.result.minutes);
  assert.equal(time.minutes,r.document.state.minute-r.before.state.minute);
  assert.equal(time.minutes,r.receipt.cost.time);
  assert.equal(r.document.state.skills[learn.subject].proficiency-r.before.state.skills[learn.subject].proficiency,learn.result.gain);
  assert.deepEqual(auditLedger(r.document.ledger),[]);
 }
});

test('R8: spell MP costs are backed by the native debit, with an exact applied/cost match',async()=>{
 for(const id of ['030','067']){
  const r=await run(id),cost=r.receipt.cost.resources.find(e=>e.op==='vital'&&e.need==='mp');
  assert.equal(r.actual.committed,true);assert.equal(cost.role,'additional_cost');
  assert.equal(cost.delta,-r.receipt.legacy.mpCost);
  assert.equal(cost.result.after-cost.result.before,cost.delta);
  assert.deepEqual(r.receipt.applied[cost.index],cost);
  assert.equal(r.document.state.player.mp-r.before.state.player.mp,cost.delta);
  const selected=signatureEffects(r.receipt.applied,r.receipt);
  assert.ok(selected.excluded.some(e=>e.index===cost.index));
  assert.equal(selected.effects.some(e=>id==='030'?e.op==='fact.set'&&e.field==='moisture':e.op==='status'&&e.target==='item_staff'),r.receipt.legacy.success);
  assert.ok(!selected.effects.some(e=>e.op==='vital'&&e.type==='harm'));
  assert.deepEqual(auditLedger(r.document.ledger),[]);
 }
});

test('R8: derived experience stays visible with its native award evidence, never a writable XP primitive',async()=>{
 for(const id of ['006','021']){
  const r=await run(id,id==='021'?{die:20}:{}),change=r.receipt.consequences.find(c=>c.type==='progression'&&c.field==='xp');
  if(id==='021')assert.equal(r.receipt.check.die,20);
  assert.ok(change);assert.equal(change.result.before,r.before.state.player.xp);
  assert.equal(change.result.after,r.document.state.player.xp);
  assert.ok(change.awards.length);assert.ok(change.awards.every(a=>a.eventId===r.receipt.eventId));
  assert.ok(!r.receipt.applied.some(e=>e.op==='fact.set'&&e.field==='xp'));
  assert.deepEqual(auditLedger(r.document.ledger),[]);
 }
});

test('R8: native summon dismissal reports its actual contract termination and disappearance',async()=>{
 const r=await run('073'),cancel=r.receipt.applied.find(e=>e.op==='obligation.cancel'),gone=r.receipt.applied.find(e=>e.op==='transition');
 assert.equal(r.actual.committed,true);assert.equal(cancel.id,r.receipt.legacy.obligation);
 assert.equal(cancel.reason,'peaceful_dismissal');assert.equal(cancel.result.before.endedAt,undefined);
 assert.equal(cancel.result.after.endedAt,r.document.state.minute);
 assert.equal(r.document.state.obligations[cancel.id].endedAt,r.document.state.minute);
 assert.equal(gone.entity,r.receipt.legacy.summon);assert.equal(gone.to,'gone');assert.equal(gone.reason,'contract_ended');
 assert.deepEqual(gone.result.before,r.before.state.effects[gone.entity]);assert.equal(gone.result.after,null);
 assert.equal(r.document.state.effects[gone.entity],undefined);
 assert.equal(r.document.state.player.mp,r.before.state.player.mp);
 assert.equal(r.document.state.minute,r.before.state.minute);
 assert.deepEqual(auditLedger(r.document.ledger),[]);
});

test('R8: native redemption includes the closed pledge, while repair keeps its declared fee separate',async()=>{
 const redemption=await run('037'),close=redemption.receipt.applied.find(e=>e.op==='holding.close'&&e.holdingKind==='pledged'&&e.result.before?.until===undefined);
 // Effects are stamped at the act's start; the snapshot redemption then takes its native 5 minutes (A3D-ding2).
 assert.ok(close);assert.equal(close.result.after.until,redemption.before.state.minute);assert.equal(redemption.document.state.minute,redemption.before.state.minute+redemption.receipt.cost.time);assert.equal(redemption.receipt.cost.time,5);
 assert.equal(close.holder,redemption.receipt.legacy.debt);
 assert.equal(redemption.document.holdings.rows[close.holding].until,close.result.after.until);
 const repair=await run('027'),fee=repair.receipt.cost.resources.find(e=>e.op==='transfer');
 assert.equal(fee.role,'additional_cost');assert.equal(fee.qty,repair.receipt.legacy.spent.feePaid);
 assert.deepEqual(fee,repair.receipt.applied[fee.index]);
 assert.ok(repair.receipt.applied.some(e=>e.op==='fact.set'&&e.entity==='item_staff'&&e.field==='durability'));
 for(const r of [redemption,repair])assert.deepEqual(auditLedger(r.document.ledger),[]);
});

test('R8: a sale disposes of the existing title with its real authority tag; physical delivery alone does not',async()=>{
 const r=await run('095'),disposition=r.receipt.applied.find(e=>e.op==='holding.transfer');
 assert.equal(r.actual.committed,true);assert.ok(disposition);
 assert.ok(disposition.tags.includes('unauthorized_disposition'));
 assert.equal(disposition.holder,'npc_hw_ayan');assert.equal(disposition.newHolder,'npc_hw_yanzhe');
 const old=r.document.holdings.rows[disposition.holding],next=r.document.holdings.rows[disposition.newHolding];
 assert.equal(old.until,r.before.state.minute);assert.equal(next.holder,'npc_hw_yanzhe');assert.equal(next.subject,old.subject);
 const event=r.document.state.records[`world_event:${r.receipt.eventId}:ownership:${old.id}`];
 assert.ok(event.tags.includes('unauthorized_disposition'));assert.equal(event.actor,'player');
 assert.deepEqual(r.document.state.consentEvents,r.before.state.consentEvents);
 const d=engine.primitiveDraft(r.before),physical=transferItems(d,engine,'player','npc_hw_yanzhe','item_whittling_knife',1);
 assert.equal(physical.instances[0],old.subject);assert.deepEqual(d.document.holdings.rows[old.id],r.before.holdings.rows[old.id]);
 assert.deepEqual(auditLedger(r.document.ledger),[]);assert.deepEqual(auditLedger(d.document.ledger),[]);
});

test('R8: food consumption keeps native item resource categories in the receipt, not a substituted resource',async()=>{
 const r=await run('009'),food=r.receipt.applied.find(e=>e.op==='transfer'&&e.resource==='item_oats');
 assert.ok(food);assert.deepEqual(food.resourceTags,world.items.find(i=>i.id===food.resource).tags);
 assert.equal(food.from.split('|')[1],food.resource);assert.equal(food.to.split('|')[1],food.resource);
 assert.deepEqual(auditLedger(r.document.ledger),[]);
});
