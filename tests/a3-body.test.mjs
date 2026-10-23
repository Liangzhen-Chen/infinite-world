import {assertActionRejected} from './helpers/action-refusal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {beginSleep,finishSleep} from '../server-plugin/body-needs.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'a3-body');
 document.state.location='bld_hw_qingdeng';
 document.state.player.body={satiety:{value:20,asOf:document.state.minute,activity:'rest'},stamina:{value:100,asOf:document.state.minute,activity:'rest'}};
 return {world,engine,document};
}
function book(f){f.document=withLedger(f.engine,f.document).document;f.document.holdings=openHoldings(f.engine,f.document);return f;}
async function act(f,action,slots,eventId='a3-body-act'){
 const out=await f.engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId});
 return {out,after:applyPatches(f.document,out.patches)};
}
async function sleepPublic(f,minutes,id){
 const clock=f.document.state.minute%1440+minutes;
 return act(f,'core:time.sleep',{until:{dayOffset:Math.floor(clock/1440),hour:Math.floor(clock%1440/60),minute:clock%60}},id);
}

test('A3 D20: 120 minutes of practice deterministically grows skill, charges body/time once and survives JSON replay',async()=>{
 const f=book(fixture()),skill=Object.keys(f.document.state.skills)[0],before=structuredClone(f.document);
 const old=before.state.skills[skill].proficiency;
 const {out,after}=await act(f,'core:practice.session',{skill,minutes:120});
 assert.equal(out.result.receipt.status,'committed');assert.equal(out.result.receipt.check,null);
 assert.equal(after.state.minute-before.state.minute,120);assert.equal(out.result.receipt.cost.time,120);
 assert.equal(readBodyNeed(f.engine,after,'player','stamina'),94);
 assert.equal(readBodyNeed(f.engine,after,'player','satiety'),15);
 assert.ok(after.state.skills[skill].proficiency>old);assert.ok(after.state.skills[skill].proficiency-old<=3);
 assert.deepEqual(after.ledger,before.ledger);assert.deepEqual(f.document,before);
 f.document=JSON.parse(JSON.stringify(after));const again=await act(f,'core:practice.session',{skill,minutes:120});
 assert.deepEqual(again.out.patches,[]);assert.equal(again.out.result.receipt.duplicate,true);
});

test('A3 practice: out-of-bounds time and unknown skills have zero effects; daily cap and repeat decay remain active',async()=>{
 const f=book(fixture()),skill=Object.keys(f.document.state.skills)[0],before=structuredClone(f.document);
 // Invalid practice choices still have zero effects; public business failures
 // now return refusals with an E-* code rather than throwing.
 for(const minutes of [0,29,481])await assertActionRejected(act(f,'core:practice.session',{skill,minutes},`bad-${minutes}`),undefined,null);
 await assertActionRejected(act(f,'core:practice.session',{skill:'skill_not_registered',minutes:120},'unknown-skill'),undefined,null);
 assert.deepEqual(f.document,before);
 const first=await act(f,'core:practice.session',{skill,minutes:120},'practice-first');f.document=first.after;
 const second=await act(f,'core:practice.session',{skill,minutes:120},'practice-second');
 const gain1=first.after.state.skills[skill].proficiency-before.state.skills[skill].proficiency;
 const gain2=second.after.state.skills[skill].proficiency-first.after.state.skills[skill].proficiency;
 assert.ok(gain2<=gain1);
 const cap=book(fixture()),day=String(Math.floor(cap.document.state.minute/1440));
 cap.document.state.skills[skill].daily={[day]:{gain:30,targets:{}}};
 const capped=await act(cap,'core:practice.session',{skill,minutes:120},'practice-cap');
 assert.equal(capped.after.state.skills[skill].proficiency,cap.document.state.skills[skill].proficiency);
 assert.equal(capped.after.state.minute-cap.document.state.minute,120);
});

test('A3 eating: real food goes to sink:consume, nutrition changes lazy satiety and no second portion can be eaten',async()=>{
 const f=fixture(),item='item_fish_broth';
 f.document.state.inventory[item]={quantity:1,quality:'木',durability:100,weight:.65};book(f);
 const before=structuredClone(f.document),coins=before.state.player.coins,key=accountKey('player',item,'inventory');
 const {out,after}=await act(f,'core:eat.meal',{item},'eat-soup');
 assert.equal(after.state.minute-before.state.minute,25);assert.equal(out.result.cost.time,25);
 assert.equal(f.engine.quantity(f.engine.primitiveDraft(after),'player',item),0);
 assert.equal(after.ledger.accounts[key],before.ledger.accounts[key]-1);
 assert.equal(after.ledger.flows[accountKey('sink:consume',item,'meal')],1);
 assert.ok(Math.abs(readBodyNeed(f.engine,after,'player','satiety')-(20-25/60+35))<.0002);
 assert.ok(readBodyNeed(f.engine,after,'player','satiety')>30,'hungry threshold is no longer reached');
 assert.equal(after.state.player.coins,coins);assert.equal(after.state.player.hp,before.state.player.hp);
 assert.deepEqual(auditLedger(after.ledger),[]);
 f.document=JSON.parse(JSON.stringify(after));
 const again=await act(f,'core:eat.meal',{item},'eat-soup');assert.deepEqual(again.out.patches,[]);assert.equal(again.out.result.duplicate,true);
 await assertActionRejected(act(f,'core:eat.meal',{item},'eat-another'),/没有持有/);
});

test('A3 eating: cannot consume tools, fabricate nutrition or exceed satiety cap',async()=>{
 const f=fixture();f.document.state.inventory.item_bread={quantity:2,quality:'木',durability:100,weight:.15};book(f);
 const before=structuredClone(f.document);
 await assertActionRejected(act(f,'core:eat.meal',{item:'item_kitchen_knife'},'eat-tool'),/可食用/);
 await assertActionRejected(act(f,'core:eat.meal',{item:'item_bread',satiety:100},'fake-nutrition'),/槽位/);
 assert.deepEqual(f.document,before);
 f.document.state.player.body.satiety.value=95;
 const {after}=await act(f,'core:eat.meal',{item:'item_bread'},'eat-full');
 assert.equal(readBodyNeed(f.engine,after,'player','satiety'),100);
 assert.equal(f.engine.quantity(f.engine.primitiveDraft(after),'player','item_bread'),1);
});

// The sleep boundary is C's native connector for A's locked time executor.
// Keep native connector equivalence and verify D04/D33 through world_act.
function sleepNative(f,minutes,id='native-sleep'){
 const engine=f.engine.scoped(f.document),d=engine.primitiveDraft(f.document),span=beginSleep(d,engine);
 const time=engine.time(d,{minutes,activity:'睡眠'},id),cost=finishSleep(d,engine,span);
 return {after:applyPatches(f.document,d.patches),time,cost};
}
test('A3 sleep connector: a real paid room recovers capped stamina while preserving native HP recovery and hunger drain',async()=>{
 const f=fixture();f.document.state.minute=1250;f.document.state.player.coins=120;
 f.world.rules.economy.rentalCopperPerNight=40;
 Object.assign(f.document.state.player,{hp:50,maxHp:100});
 f.document.state.player.body={stamina:{value:30,asOf:1250,activity:'rest'},satiety:{value:100,asOf:1250,activity:'rest'}};
 book(f);
 const booking=await act(f,'core:trade.lodge',{seller:'npc_hw_linsui',days:1},'sleep-room');
 f.document=booking.after;assert.equal(booking.out.result.cost,40);
 const before=structuredClone(f.document),{out,after}=await sleepPublic(f,540,'paid-nine-hours'),time=out.result,cost=out.result.cost;
 assert.equal(after.state.minute-before.state.minute,540);assert.equal(time.elapsed,540);assert.equal(cost.time,540);
 assert.equal(cost.sleep.lodging,'room');assert.equal(cost.sleep.coveredMinutes,540);
 assert.equal(readBodyNeed(f.engine,after,'player','stamina'),100);
 assert.equal(after.state.player.hp,Math.min(before.state.player.maxHp,before.state.player.hp+18));
 assert.ok(Math.abs(readBodyNeed(f.engine,after,'player','satiety')-(100-550/60))<.0002);
 assert.equal(after.state.player.coins,before.state.player.coins);
 // Nightly grain consumption and NPC payments must still run. The connector
 // adds no resource flow of its own, so compare with the same native sleep.
 const nativeEngine=f.engine.scoped(before),native=nativeEngine.primitiveDraft(before);
 nativeEngine.time(native,{minutes:540,activity:'睡眠'},'native-sleep');
 assert.deepEqual(after.ledger,native.document.ledger);assert.deepEqual(auditLedger(after.ledger),[]);
});

test('A3 D33 public sleep: paid lodging reaches 100 and unbooked camp preserves 77.6',async()=>{
 const f=fixture(),now=f.document.state.minute;
 f.document.state.player.body={stamina:{value:20,asOf:now,activity:'rest'},satiety:{value:100,asOf:now,activity:'rest'},fatigue:{value:60,asOf:now,activity:'rest'}};book(f);
 const {after,out}=await sleepPublic(f,480,'camp-eight-hours'),cost=out.result.cost;
 assert.equal(cost.sleep.coveredMinutes,0);assert.equal(readBodyNeed(f.engine,after,'player','stamina'),77.6);
 assert.equal(readBodyNeed(f.engine,after,'player','satiety'),92);assert.equal(readBodyNeed(f.engine,after,'player','fatigue'),0);
 const paid=fixture(),at=paid.document.state.minute;paid.document.state.player.coins=120;paid.document.state.player.body={stamina:{value:20,asOf:at,activity:'rest'},satiety:{value:100,asOf:at,activity:'rest'}};book(paid);
 const booking=await act(paid,'core:trade.lodge',{seller:'npc_hw_linsui',days:1},'d33-room');paid.document=booking.after;
 const room=await sleepPublic(paid,480,'room-eight-hours');assert.equal(readBodyNeed(paid.engine,room.after,'player','stamina'),100);assert.equal(room.out.result.cost.sleep.coveredMinutes,480);assert.deepEqual(auditLedger(room.after.ledger),[]);
});

test('A3 sleep connector: calibration carries and overlapping/expiring rentals preserve split/whole-minute equivalence',()=>{
 const base=fixture(),now=base.document.state.minute;
 base.world.primitiveTables.body.rows.find(r=>r.need==='stamina').sleepRecoverPerHour=7;
 base.document.state.player.body={stamina:{value:0,asOf:now,activity:'rest'}};
 for(const [id,start,end]of [['first',now,now+30],['overlap',now+15,now+40]])
  base.document.state.records[id]={category:'contract',status:'有效',room:'bld_hw_qingdeng',parties:['player','npc_hw_linsui'],starts:start,expires:end};
 book(base);const before=structuredClone(base.document),whole=sleepNative(base,60,'whole');
 assert.equal(whole.cost.sleep.coveredMinutes,40);
 assert.ok(Math.abs(readBodyNeed(base.engine,whole.after,'player','stamina')-(7*40+7*.6*20)/60)<.0002);
 base.document=before;
 for(let i=0;i<60;i++)base.document=sleepNative(base,1,`split-${i}`).after;
 assert.deepEqual(base.document.state.player.body,whole.after.state.player.body);
});

test('A3 sleep connector: an archived world without body tables keeps its legacy sleep behavior',()=>{
 const f=fixture();delete f.world.primitiveTables.body;
 const d=f.engine.primitiveDraft(f.document),before=structuredClone(d.document),span=beginSleep(d,f.engine);
 assert.equal(finishSleep(d,f.engine,span),null);assert.deepEqual(d.document,before);assert.deepEqual(d.patches,[]);
});
