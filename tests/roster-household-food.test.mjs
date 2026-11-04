// I3d: a roster household (members are not campaign actors) lives on and spends its own opening record; a settlement's
// residents may buy in another settlement's shop within a day's travel; a child brought into the simulation does not
// carry the household's purse away; a shop whose keeper has no trade slot stays open only if a real person keeps it.
// One real day of the real engine, with bread on the grocer's shelf (a test-local variation of the authored world: in
// play the food-supply chain, I3c, puts edible stock there).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {assertTransitionInvariants} from '../server-plugin/transition.mjs';
import {rosterReserve,rosterReserves,householdMealPlan} from '../server-plugin/household-budget.mjs';
import {rosterLifeState} from '../server-plugin/population.mjs';
import {holdingSet} from '../server-plugin/holdings.mjs';
import {openShops} from '../server-plugin/business.mjs';
import {customerReachMinutes} from '../server-plugin/market.mjs';

const authored=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,GROCER='npc_hw_yanzhe',SHOP='shop_bs_yanzhe';
function world(mutate=()=>{}){
 const w=structuredClone(authored);
 w.rules.economy.shops.stores.find(s=>s.keeper===GROCER).restock.push({item:'item_bread',source:'route',from:'loc_hw',amount:300,maximum:300});
 w.npcs.find(n=>n.id===GROCER).inventory.item_bread=300;
 mutate(w);return w;
}
function start(mutate){
 const e=new WorldEngine(world(mutate));let doc=e.createCharacter(legacy,{},'i3d-roster');
 return {e,get doc(){return doc;},replace(next){doc=next;},async act(input){const out=await e.reduce(doc,input);doc=applyPatches(doc,out.patches);return out;}};
}
const read=f=>f.e.primitiveDraft(f.doc),amount=v=>typeof v==='number'?v:v?.quantity??0;
const flow=(f,day)=>f.doc.state.records[`customer_flow:${SHOP}:${day}`];

test('a roster household\'s opening record is its pantry in the meal plan and a batch buyer at the shop',{timeout:600000},async()=>{
 const f=start(),homes=authored.households.filter(h=>h.settlement==='loc_bs'&&!h.members.some(m=>f.doc.state.npcs[m]));
 const reserves=rosterReserves(f.e,f.doc.state);
 assert.deepEqual(reserves.map(r=>r.owner).sort(),homes.map(h=>h.id).sort(),'every household without a campaign actor holds a live reserve');
 for(const r of reserves)assert.equal(r.coins,f.doc.state.records[r.owner].coins);
 // house_bs_007 opens with rations and copper in its record; before this law its meal plan saw neither.
 const house=authored.households.find(h=>h.id==='house_bs_007'),record=f.doc.state.records[house.id];
 assert.ok(rosterReserve(f.doc.state,house.id)&&record.coins>0&&record.inventory.item_ration.quantity>0);
 const plan=householdMealPlan(read(f),f.e,house.members[0]);
 assert.ok(plan.rows.some(r=>r.holder===house.id&&r.item==='item_ration'),'the household eats from its own record');
 assert.equal(householdMealPlan(read(f),f.e,house.id).members.join(),house.members.join(),'asked by the record, the same household answers');

 // Day 0: the grocer opens at his first trade slot; reserve households buy bread with their own copper.
 await f.act({tool:'world_time',args:{minutes:330},eventId:'i3d-noon'});
 const visits=flow(f,0).visits.filter(v=>v.npc.startsWith('house_bs_')&&v.outcome==='bought');
 assert.ok(visits.length>0,'roster households bought at the open shop');
 const before=Object.fromEntries(reserves.map(r=>[r.owner,r]));
 for(const v of visits){
  const now=f.doc.state.records[v.npc];
  assert.equal(now.coins,before[v.npc].coins-v.paid,'the household paid from its own record');
  assert.equal(amount(now.inventory.item_bread),v.quantity,'the goods went into the household record');
  assert.equal(f.doc.ledger.accounts[`${v.npc}|item_bread|inventory`],v.quantity,'and into its ledger account');
 }
 assert.deepEqual(auditLedger(f.doc.ledger),[]);assertTransitionInvariants(read(f),f.e);

 // The midnight meal eats what was bought.
 await f.act({tool:'world_time',args:{minutes:DAY-f.doc.state.minute+30},eventId:'i3d-midnight'});
 const meal=Object.values(f.doc.state.family.meals).find(m=>m.household===visits[0].npc);
 assert.ok(meal.consumed.some(c=>c.holder===visits[0].npc),'the record\'s stock was consumed in the household meal');
 assert.deepEqual(auditLedger(f.doc.ledger),[]);
});

test('a resident buys in the next settlement\'s shop when it is within a day there and back, and is home the same day',{timeout:600000},async()=>{
 const f=start();
 await f.act({tool:'world_time',args:{minutes:330},eventId:'i3d-trip'});
 const villagers=new Set(authored.households.filter(h=>h.settlement.startsWith('loc_ms_')).flatMap(h=>h.members));
 const visits=(flow(f,0)?.visits??[]).filter(v=>villagers.has(v.npc)&&v.outcome==='bought');
 assert.ok(visits.length>0,'a mountain villager bought at the Baishi grocer');
 const budget=f.e.rules.travel.dailyTravelMinutes,walk=customerReachMinutes(f.e);
 for(const v of visits){
  const there=v.travel.arriveAt-v.travel.departAt,back=v.travel.returnAt-v.travel.finishAt;
  assert.equal(v.travel.to,'loc_bs');
  assert.ok(there+back<=budget,`round trip ${there+back} fits one day's travel ${budget}`);
  assert.ok(v.travel.returnAt<=DAY,'and is home the same day');
  assert.ok(there>walk,'a journey beyond the town walk');
 }
 assert.deepEqual(auditLedger(f.doc.ledger),[]);
});

test('a child brought into the simulation leaves the household\'s purse and pantry in the household record; an adult takes them',{timeout:600000},async()=>{
 const f=start(),house=authored.households.find(h=>h.id==='house_bs_007');
 const admit=id=>{const d=f.e.primitiveDraft(f.doc);holdingSet(d,f.e,['state','npcs',id],rosterLifeState(f.e,f.doc.state,id,f.doc.state.minute,'报名受教'),'education');f.replace(d.document);};
 const child=house.members.find(m=>f.e.byId.get(m).age<18),adult=house.members.find(m=>f.e.byId.get(m).age>=18),coins=f.doc.state.records[house.id].coins;
 assert.ok(child&&adult&&coins>0);
 admit(child);
 assert.ok(rosterReserve(f.doc.state,house.id),'the reserve is still live');
 assert.equal(f.doc.state.records[house.id].coins,coins,'the child did not take the household\'s copper');
 assert.ok(!f.doc.state.npcs[child].coins);
 assert.ok(rosterReserves(f.e,f.doc.state).some(r=>r.owner===house.id&&r.beneficiaryUnits===house.members.length),'the whole household is still fed and bought for from it');
 admit(adult);
 assert.equal(f.doc.state.npcs[adult].coins,coins,'an adult member takes over the household\'s copper');
 assert.equal(rosterReserve(f.doc.state,house.id),null);
 assert.deepEqual(auditLedger(f.doc.ledger),[]);
});

test('a shop whose keeper has no trade slot today stays open only when an adult of his household or a hand he employs is at the same place',()=>{
 // Day 9 noon: the smith is in his forge clearing the furnace with no trade slot left, and his son tidies the stock records beside him.
 const t=9*DAY+720,forge='shop_hw_forge';
 const closed=start();
 assert.ok(!openShops(read(closed),closed.e,t).some(s=>s.id===forge),'a 16-year-old is not minding the shop');
 const adult=start(w=>{w.npcs.find(n=>n.id==='npc_hw_duanhe').age=22;});
 const shop=openShops(read(adult),adult.e,t).find(s=>s.id===forge);
 assert.ok(shop,'the grown son keeps the counter');
 assert.equal(shop.keeper,'npc_hw_duanyan');assert.equal(shop.minder,'npc_hw_duanhe');
 assert.equal(shop.location,'bld_hw_forge');assert.equal(shop.from,t);
 assert.ok(shop.until>t&&shop.until<=(9+1)*DAY,'only while both are there');
});
