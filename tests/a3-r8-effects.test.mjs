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
import {applyPatches} from '../server-plugin/storage.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.createCharacter(seed,{},'a3-score-independent');
const rows=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
const run=async(id,{die}={})=>{
 const document=structuredClone(initial);
 // 产品原则三.2：取消与赎回的前提来自真实施法/典当，不再加载测试债权。
 if(['073','037'].includes(id)){
  const act=(action,slots,eventId)=>({tool:'world_act',args:{action,slots},eventId});
  let before,input;
  if(id==='073'){
   const spell=engine.byId.get('spell_summon_04'),scene=applyIntentSetup(engine,document,{minute:600,location:'bld_hw_school',present:[],coins:0,
    inventory:Object.fromEntries(spell.materials.map(m=>[m.item,m.amount])),abilitiesByActor:{player:{spells:[spell.id],skills:{[spell.skill]:2699}}}});
   assert.deepEqual(scene.setupUnmet,[]);
   for(let n=0;n<20;n++){
    const call=act('core:cast',{spell:spell.id,target:'player'},`r8-summon-${n}`),loaded=await runPrelude(engine,scene.document,[call]);
    assert.deepEqual(loaded.unmet,[]);
    if(loaded.document.state.effects[call.eventId]){before=loaded.document;input=act('core:summon.dismiss',{summon:call.eventId},'r8-dismiss');break;}
   }
   assert.ok(before,'successful real summon required');
  }else{
   const scene=applyIntentSetup(engine,document,{minute:600,location:'bld_hw_post',present:['npc_hw_shendu'],coins:1,inventory:{item_staff:0},
    itemInstances:[{id:'r8-pawn-staff',template:'thing',kind:'item',item:'item_staff',owner:'player',location:'bld_hw_post',carriedBy:'player',condition:100}],
    holdings:[{id:'r8-pawn-title',kind:'owns',holder:'player',subject:'r8-pawn-staff',terms:{share:1}}]});
   assert.deepEqual(scene.setupUnmet,[]);
   // F007: the pawn advance is 50% of the staff's valuation (4 x floor .5 = 2 copper), at most 1 copper (2 on the catalogue price).
   const loaded=await runPrelude(engine,scene.document,[act('core:trade.pawn',{seller:'npc_hw_shendu',item:'item_staff',quantity:1,coins:1,days:1},'r8-pawn')]);
   assert.deepEqual(loaded.unmet,[]);before=loaded.document;
   input=act('core:trade.redeem',{seller:'npc_hw_shendu',contract:'debt_loan_r8-pawn'},'r8-redeem');
  }
  assert.equal((await engine.previewAction(before,input)).receipt.status,'preview');
  const reduced=await engine.reduce(before,input),receipt=reduced.result.receipt;
  return {before,document:applyPatches(before,reduced.patches),receipt,actual:{committed:receipt.status==='committed'},setupUnmet:[]};
 }
 if(die)for(let n=0;;n++){
  const candidate=`a3-r8:${id}:${n}`;
  if(createHash('sha256').update(`${candidate}:a3-score-A3V2-${id}:d20`).digest().readUInt32LE(0)%20+1===die){document.randomSeed=candidate;break;}
 }
 const row=structuredClone(rows.find(r=>r.id===`A3V2-${id}`));
 if(id==='095'){
  // 产品原则三.2：本用例检验处分借物的所有权回执，不依赖买家的精确余款。
  // 使用正常创建角色时已有的钱袋，并显式保留足额付款前提；不导入 3 铜快照。
  assert.ok(document.state.npcs.npc_hw_yanzhe.coins>=3);
  row.setup.accounts=row.setup.accounts.filter(a=>a.resource!=='coin_river');
  row.setup.history=row.setup.history.filter(e=>e.id!=='a3v2_095_account_0');
 }
 return executeIntent(engine,document,row);
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
 // Effects are stamped at the act's start; real redemption takes its native 5 minutes.
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
