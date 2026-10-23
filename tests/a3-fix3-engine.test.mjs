import test from 'node:test';
import assert from 'node:assert/strict';
import {assertActionRejected} from './helpers/action-refusal.mjs';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {ActionRejection} from '../server-plugin/action-rejection.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'a3-fix3-engine');
const rowFor=id=>structuredClone(corpus.find(row=>row.id===`A3V2-${id}`));
const receiptOf=value=>value.result?.receipt??value.receipt;
const coinsOf=document=>document.state.player.coins;
const held=(document,item)=>{const row=document.state.inventory[item];return typeof row==='number'?row:row?.quantity??0;};

// ---- 1. an order the purse cannot cover is refused with zero writes; one it can cover is sold whole ----
// 06 §6.10.3: a quantity is a structured field (means.quantity); the frozen 122 prose alone buys the
// registered default of one loaf (a3-owner2-R), so the structured two-loaf order is the cash failure.
const order=(row,quantity)=>{row.proposal.means={...row.proposal.means,quantity};return row;};
test('A3-fix3 trade: a two-loaf order with 3 coins is a structured refusal with zero writes in preview, commit and direct call',async()=>{
 const row=order(rowFor(122),2),{document,setupUnmet}=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(setupUnmet,[]);assert.equal(coinsOf(document),3);
 const before=structuredClone(document),input={tool:'world_propose',eventId:'fix3-buy-short',args:row.proposal};
 const preview=receiptOf(await engine.previewAction(document,input));
 assert.equal(preview.status,'rejected');assert.equal(preview.code,'E-ACTION-PRECONDITION');assert.equal(preview.routed,'core:trade.buy');
 assert.match(preview.reason,/余额不足/);assert.deepEqual(preview.applied,[]);assert.ok(preview.missing.length&&preview.repair.length);
 const committed=await engine.reduce(document,input);
 assert.equal(committed.result.ok,false);assert.equal(receiptOf(committed).status,'rejected');assert.deepEqual(committed.patches,[]);
 const direct=await engine.reduce(document,{tool:'world_act',eventId:'fix3-buy-short-direct',args:{action:'core:trade.buy',slots:preview.routing.slots}});
 assert.equal(receiptOf(direct).status,'rejected');assert.deepEqual(direct.patches,[]);
 assert.deepEqual(document,before);assert.equal(coinsOf(document),3);assert.deepEqual(auditLedger(document.ledger),[]);
});

test('A3-fix3 trade: with enough coins the same two-loaf order is sold whole at the quoted total and the ledger stays balanced',async()=>{
 const row=order(rowFor(122),2);row.setup.coins=4;
 const {document,setupUnmet}=applyIntentSetup(engine,initial,row.setup);assert.deepEqual(setupUnmet,[]);
 const before=structuredClone(document),input={tool:'world_propose',eventId:'fix3-buy-enough',args:row.proposal};
 assert.equal(receiptOf(await engine.previewAction(document,input)).status,'preview');assert.deepEqual(document,before);
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches);
 assert.equal(receiptOf(out).status,'committed');
 assert.equal(coinsOf(before)-coinsOf(after),4);assert.equal(held(after,'item_bread')-held(before,'item_bread'),2);
 assert.deepEqual(auditLedger(after.ledger),[]);
});

// ---- 2. a structured move without a source is refused with its basis before any entity is clarified ----
test('A3-fix3 displacement: a structured teleport move is refused (E-OPEN-MOVE) before entity resolution; a spell means keeps the program path',async()=>{
 const row=rowFor(130),{document,setupUnmet}=applyIntentSetup(engine,initial,row.setup);assert.deepEqual(setupUnmet,[]);
 const before=structuredClone(document);
 const propose=(to,means)=>engine.previewAction(document,{tool:'world_propose',eventId:'fix3-teleport',args:{intent:'马上把我送到远方',effects:[{op:'move',entity:'self',to,mode:'teleport'}],...(means?{means}:{})}});
 // A name that would need clarification and an exact id that is not perceivable both meet the same basis first.
 // Unsupported displacement retains its basis and code in the refusal receipt.
 for(const to of ['王都','loc_capital'])await assertActionRejected(propose(to),/传送来源/,'E-OPEN-MOVE');
 assert.deepEqual(document,before);
 // With a spell named as the means the proposal is not refused by this check (the spell program judges it).
 const viaSpell=await propose('王都',{spell:'spell_s1_anchor_cross'}).then(value=>value,error=>error);
 assert.ok(!(viaSpell?.code==='E-OPEN-MOVE'));
});

// ---- 3. combat opponent identity is the creature record, not an id prefix ----
test('A3-fix3 combat: an unowned creature record of a catalogued monster is an opponent whatever its id; an owned one is not',async()=>{
 const row=rowFor(169),{document,setupUnmet}=applyIntentSetup(engine,initial,row.setup);assert.deepEqual(setupUnmet,[]);
 const id=row.proposal.means.opponent;assert.ok(!/^(monster_|boss_)/.test(id));
 const preview=receiptOf(await engine.previewAction(document,{tool:'world_propose',eventId:'fix3-combat',args:row.proposal}));
 assert.equal(preview.status,'preview');assert.equal(preview.routed,'core:combat');
 const owned=structuredClone(document);owned.state.creatures[id].owner='player';
 const refused=receiptOf(await engine.previewAction(owned,{tool:'world_propose',eventId:'fix3-combat-owned',args:row.proposal}));
 assert.equal(refused.status,'rejected');assert.match(refused.reason,/不是交锋对象/);
});

// ---- 5. internal invariants are faults, business preconditions are refusals ----
test('A3-fix3 boundary: a damaged stored record is thrown unchanged; a player-reachable precondition is a structured refusal',async()=>{
 const row=rowFor(122);row.setup.coins=4;
 const {document}=applyIntentSetup(engine,initial,row.setup);
 const day=Math.floor(document.state.minute/1440);
 // Internal invariant: a trade-quote ledger row that is not a quote. The player did nothing wrong.
 const damaged=structuredClone(document);
 damaged.state.records[`trade-quote:${day}:npc_hw_linsui:player:item_water`]={category:'not_a_quote'};
 const bad={tool:'world_act',eventId:'fix3-damaged',args:{action:'core:trade.buy',slots:{seller:'npc_hw_linsui',item:'item_water',quantity:1}}};
 for(const run of [()=>engine.previewAction(damaged,bad),()=>engine.reduce(damaged,bad)])
  await assert.rejects(run(),error=>error instanceof Error&&!(error instanceof ActionRejection)&&/当日报价账无效/.test(error.message));
 // Business precondition: same action, the player simply cannot pay.
 const poor=structuredClone(document);poor.state.player.coins=0;
 const pay={tool:'world_act',eventId:'fix3-poor',args:{action:'core:trade.buy',slots:{seller:'npc_hw_linsui',item:'item_bread',quantity:1}}};
 const refusal=receiptOf(await engine.previewAction(poor,pay));
 assert.equal(refusal.status,'rejected');assert.equal(refusal.code,'E-ACTION-PRECONDITION');assert.ok(refusal.missing.length&&refusal.repair.length);
 assert.deepEqual((await engine.reduce(poor,pay)).patches,[]);
});
