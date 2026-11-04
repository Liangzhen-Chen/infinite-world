import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {assertTransitionInvariants} from '../server-plugin/transition.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {statisticalFoodId,statisticalFoodNeed,statisticalFoodPopulation,statisticalFoodGroups} from '../server-plugin/household-budget.mjs';
import {townShareAmount} from '../server-plugin/town-income.mjs';
import {financeTransfer} from '../server-plugin/finance-bank.mjs';
import {bodyRule} from '../server-plugin/primitives-body.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,SID='loc_bs',ID=statisticalFoodId(SID);
async function start(authored=world){
 const e=new WorldEngine(structuredClone(authored));let doc=e.createCharacter(legacy,{},'food-demand');
 const act=async input=>{const result=await e.reduce(doc,input);doc=applyPatches(doc,result.patches);return result;};
 return {e,act,get doc(){return doc;},replace(next){doc=next;}};
}
function profile(person){return {personality:{traits:['谨慎']},voice:{register:'平常',accent:'本地',habits:[],samples:[]},
 background:`${person.name}一直在本地生活。`,currentConcern:'照料家人。',goals:['安稳生活'],fears:[],knowledge:{unknown:[]},relationships:[]};}
const account=f=>f.doc.state.records[ID];
// I1 §3 replaces the town pool with independent groups. Town-wide demand
// assertions still cover every one of the 694 people, by summing the groups.
const summary=f=>statisticalFoodGroups(f.e,f.doc.state,SID).reduce((out,row)=>{
 for(const key of ['demandSatiety','missingSatiety','consumedSatiety'])out[key]+=row[key];return out;
},{demandSatiety:0,missingSatiety:0,consumedSatiety:0});
function integerAccount(value,path='account'){
 if(typeof value==='number')assert.ok(Number.isSafeInteger(value),`${path}: ${value}`);
 else if(value&&typeof value==='object')for(const [key,v]of Object.entries(value))integerAccount(v,`${path}.${key}`);
}

test('1000 = 306 + 694: real time settles private demand groups and real missing meals',async()=>{
 const f=await start(),p=f.e.world.settlementProfiles.find(p=>p.id===SID),base=bodyRule(f.e,'satiety').drainPerHour.light*24;
 assert.equal(p.population,1000);assert.equal(p.registeredPopulation,306);assert.equal(p.pendingPopulation,694);
 const beforeFood=f.doc.state.settlements[SID].food??0;
 const output=await f.act({tool:'world_time',args:{minutes:DAY},eventId:'demand-day'});
 const row=summary(f);assert.equal(statisticalFoodPopulation(f.e,f.doc.state,SID),694);assert.equal(row.demandSatiety,694*base);
 // TI1b: sourced opening food covers the first day. The same deficit assertion
 // is retained below, after real time consumes the finite opening.
 assert.equal(row.missingSatiety,0);assert.ok(row.consumedSatiety>0);assert.equal(row.demandSatiety,row.missingSatiety+row.consumedSatiety);
 assert.equal(f.doc.state.settlements[SID].food??0,beforeFood);
 assert.ok((f.doc.state.settlements[SID].unmetMeals??0)>=Math.ceil(row.missingSatiety/base));
 const read=f.e.primitiveDraft(f.doc),supply=marketSupply(read,f.e,'item_bread',SID);
 assert.equal(supply.statisticalDemand,Math.ceil(statisticalFoodNeed(f.e,f.doc.state,SID)/f.e.byId.get('item_bread').nutrition.satiety));
 assert.ok(supply.demand>=supply.statisticalDemand);
 // Independent two-step hand calculation from the actual recipe tables:
 // one oat -> one flour -> four flatbreads, each with the authored nutrition.
 const mill=f.e.byId.get('recipe_mill_oats'),bake=f.e.byId.get('recipe_bake_flatbread');
 const perGrain=mill.output.quantity/mill.materials.find(m=>m.item==='item_oats').amount
  *bake.output.quantity/bake.materials.find(m=>m.item==='item_oat_flour').amount*f.e.byId.get(bake.output.item).nutrition.satiety;
 const grain=marketSupply(read,f.e,'item_oats',SID);
 assert.equal(grain.goods,'goods:grain');assert.equal(grain.statisticalDemand,Math.ceil(statisticalFoodNeed(f.e,f.doc.state,SID)/perGrain));
 const publicStockItem=f.e.rules.economy.shops.stockItems.food,publicRow=marketSupply(read,f.e,publicStockItem,SID).rows.find(r=>r.owner===SID&&r.item===publicStockItem);
 assert.ok(publicRow);assert.equal(publicRow.retained,0,'a town without a granary does not demand a phantom public reserve');
 const writes=output.patches.filter(p=>p.path?.[0]==='state'&&p.path?.[1]==='records'&&String(p.path?.[2]).startsWith('food-demand:'));
 assert.ok(writes.length>0);assert.ok(writes.every(p=>!JSON.stringify(p.path).includes('house_pop_')));
 assert.deepEqual(auditLedger(f.doc.ledger),[]);assertTransitionInvariants(f.e.primitiveDraft(f.doc),f.e);
});

test('district roster remains statistical; accepted household profile transfers population and real cash once',async()=>{
 const f=await start();await f.act({tool:'world_time',args:{minutes:DAY},eventId:'before-materialize'});
 await f.act({tool:'world_move',args:{destination:'loc_bs_luxiang'},eventId:'visit-district'});
 assert.equal(statisticalFoodPopulation(f.e,f.doc.state,SID),694);
 const person=Object.values(f.doc.state.created).find(p=>p.generated==='population'&&p.settlement===SID&&p.age>=18&&account(f).shares[p.householdId]);
 assert.ok(person);assert.equal(f.doc.state.npcs[person.id],undefined);
 // A real, balanced payment through the existing finance route, never a
 // fixture edit to the statistical demand, population, cash or inventory.
 const draft=f.e.primitiveDraft(f.doc),paid=Math.min(37,f.doc.state.player.coins);
 assert.ok(paid>0);financeTransfer(draft,f.e,'player',ID,paid,'food-test-payment');f.replace(draft.document);
 const original=account(f).coins,ownerBefore=f.doc.state.npcs[person.id]?.coins??0,expected=townShareAmount(account(f),person.householdId,original,ID,'coins');
 await f.act({type:'population_profile',person:person.id,profile:profile(person)});
 const house=f.doc.state.family.households[person.householdId],row=account(f);
 const remaining=statisticalFoodPopulation(f.e,f.doc.state,SID);assert.equal(remaining+house.members.length,694);
 assert.equal(row.coins+f.doc.state.npcs[person.id].coins,original+ownerBefore);
 assert.equal(f.doc.state.npcs[person.id].coins,expected);
 const saved=JSON.parse(JSON.stringify(f.doc));f.replace(saved);
 await f.act({tool:'world_time',args:{minutes:1},eventId:'after-save'});
 assert.equal(statisticalFoodPopulation(f.e,f.doc.state,SID),remaining);assert.deepEqual(auditLedger(f.doc.ledger),[]);assertTransitionInvariants(f.e.primitiveDraft(f.doc),f.e);
});

// I3c: raw oats are now food at home (recipe_boil_oat_gruel with water and wood fetched from the world's own sources).
// The two tests below pin the retained-deficit and counter/materialization mechanics of the earlier regime, so they run in
// the world with that one provision law removed (control); the home route itself is asserted by the next test and by
// tests/s5-law-household-processing.test.mjs.
const withoutHomeProvisions=()=>{const w=structuredClone(world);delete w.rules.householdCrafts.provisions;return w;};
test('finite opening food is not income: after depletion repeated real days retain deficits without per-household statistical writes',async()=>{
 const f=await start(withoutHomeProvisions());
 // TI1b: retain the original two genuinely hungry days rather than letting
 // missingSatiety>=0 pass while the newly registered opening still feeds us.
 await f.act({tool:'world_time',args:{minutes:12*DAY},eventId:'empty-opening-exhausted'});
 const openingDemand=account(f).demandSatiety;
 await f.act({tool:'world_time',args:{minutes:DAY},eventId:'empty-one'});
 const first=account(f),prefix=Object.keys(f.doc.state.records).filter(k=>k.startsWith('food-demand:'));
 const r=await f.act({tool:'world_time',args:{minutes:DAY},eventId:'empty-two'});
 assert.ok(first.missingSatiety>0);assert.ok(account(f).missingSatiety>first.missingSatiety);assert.equal(account(f).demandSatiety-openingDemand,2*(first.demandSatiety-openingDemand));
 assert.deepEqual(Object.keys(f.doc.state.records).filter(k=>k.startsWith('food-demand:')),prefix);
 assert.ok(r.patches.filter(p=>p.path?.[0]==='state'&&String(p.path?.[2]).startsWith('food-demand:')).every(p=>p.path[1]==='records'));
 assert.deepEqual(auditLedger(f.doc.ledger),[]);
});

test('with water and wood to fetch, the cohorts cook bought oats into gruel at home and fall behind less than without the route',async()=>{
 const run=async authored=>{const f=await start(authored);await f.act({tool:'world_time',args:{minutes:14*DAY},eventId:'fourteen-days'});return f;};
 const on=await run(world),off=await run(withoutHomeProvisions());
 const gruel=f=>Object.values(f.doc.state.records).filter(r=>r.category==='household_processing'&&r.recipe==='recipe_boil_oat_gruel'&&r.owner.startsWith('food-demand:'));
 assert.ok(gruel(on).some(j=>j.status==='done'),'a cohort cooks purchased oats into gruel');assert.equal(gruel(off).length,0);
 // each done batch makes 4 bowls of satiety 30 (1 oats -> 4 x 30 = 120, as the flatbread chain); the cohorts' unmet meals end lower
 assert.ok(summary(on).missingSatiety<summary(off).missingSatiety);
 assert.ok(summary(on).consumedSatiety>summary(off).consumedSatiety);
 assert.deepEqual(auditLedger(on.doc.ledger),[]);
});

test('real school admission transfers a roster household before the next meal or market read',async()=>{
 // A finite authored school and a real teacher; the generated household and
 // admission are created exclusively by move/time/school_open actions.
 const authored=structuredClone(world),district='loc_bs_luxiang',teacher='npc_hw_luqing';
 Object.assign(authored.locations.find(p=>p.id===district),{type:'bld',facilityType:'school',capacity:1000,owner:'player'});
 authored.npcs.find(p=>p.id===teacher).schedule={default:[{start:0,end:1440,location:district,activity:'trade',services:['trade']}]};
 const f=await start(authored);await f.act({tool:'world_time',args:{minutes:DAY},eventId:'school-before'});
 await f.act({tool:'world_move',args:{destination:district},eventId:'school-roster'});
 const person=Object.values(f.doc.state.created).find(p=>p.generated==='population'&&p.settlement===SID&&p.home.district===district&&p.age>=18&&!f.doc.state.npcs[p.id]&&account(f).shares[p.householdId]);
 assert.ok(person);assert.equal(statisticalFoodPopulation(f.e,f.doc.state,SID),694);
 const draft=f.e.primitiveDraft(f.doc),cash=Math.min(37,f.doc.state.player.coins);assert.ok(cash>0);
 financeTransfer(draft,f.e,'player',ID,cash,'school-funded-share');f.replace(draft.document);
 const before=account(f).coins,minute=f.doc.state.minute,expected=townShareAmount(account(f),person.householdId,account(f).coins,ID,'coins');
 await f.act({tool:'world_settlement',args:{operation:'school_open',plot:'skill_literacy',authority:teacher,beneficiaries:[person.id],due:900,minutes:30,days:1,consent:true},eventId:'school-admit'});
 assert.ok(f.doc.state.npcs[person.id]);assert.equal(f.doc.state.minute,minute);
 const count=person.household.length+1;
 assert.equal(statisticalFoodPopulation(f.e,f.doc.state,SID),694-count);
 assert.equal(account(f).coins+f.doc.state.npcs[person.id].coins,before);
 assert.equal(f.doc.state.npcs[person.id].coins,expected);
 integerAccount(account(f));assert.deepEqual(auditLedger(f.doc.ledger),[]);assertTransitionInvariants(f.e.primitiveDraft(f.doc),f.e);
});

test('a funded statistical buyer uses a real open counter and consumes private food, not the public ledger',async()=>{
 // Authored supply premises; all demand and settlement dates still arise
 // through world_time. No statistical account fields are fixture-written.
 const authored=withoutHomeProvisions(),seller=authored.npcs.find(n=>n.id==='npc_hw_yanzhe');
 // Hard cheese is a crafting ingredient in this world, with no nutrition.
 // Use the existing edible bread definition and an authored finite shelf.
 seller.inventory.item_bread=1000;seller.coins=100000;
 authored.rules.economy.shops.stores.find(s=>s.keeper===seller.id).restock.push({item:'item_bread',source:'route',from:'loc_hw',amount:2,maximum:1000});
 seller.schedule={default:[{start:0,end:1440,location:SID,activity:'trade',services:['trade']}]};
 // TI1b: purchasing is tested only once the formally owned opening food is
 // exhausted by actual days, never by deleting food from a group.
 const f=await start(authored);await f.act({tool:'world_time',args:{minutes:4*DAY},eventId:'counter-first'});
 await f.act({tool:'world_move',args:{destination:'loc_bs_luxiang'},eventId:'counter-district'});
 const d=f.e.primitiveDraft(f.doc),cash=Math.min(50000,f.doc.state.npcs[seller.id].coins);assert.ok(cash>0);
 financeTransfer(d,f.e,seller.id,ID,cash,'counter-payment');f.replace(d.document);
 const publicFood=f.doc.state.settlements[SID].food??0,prior=account(f).consumedSatiety;
 const noon=(Math.floor(f.doc.state.minute/DAY)+(f.doc.state.minute%DAY<720?0:1))*DAY+720;
 await f.act({tool:'world_time',args:{minutes:noon-f.doc.state.minute},eventId:'counter-second'});
 const visits=Object.values(f.doc.state.records).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits??[]).filter(r=>r.npc===ID&&r.outcome==='bought');
 assert.ok(visits.length>0);assert.ok(visits.every(r=>r.paid>0&&r.quantity>0));
 integerAccount(account(f));
 const person=Object.values(f.doc.state.created).find(p=>p.generated==='population'&&p.settlement===SID&&p.age>=18&&account(f).shares[p.householdId]);
 const count=person.household.length+1,coins=account(f).coins,food=f.e.primitiveDraft(f.doc).get('state','records',ID,'inventory','item_bread').quantity;
 const expected=townShareAmount(account(f),person.householdId,food,ID);
 assert.ok(expected>0,'the test exercises a nonzero physical materialization share');
 await f.act({type:'population_profile',person:person.id,profile:profile(person)});
 const held=f.doc.state.npcs[person.id].inventory.item_bread.quantity;
 assert.equal(held,expected);
 assert.equal(held+(account(f).inventory.item_bread?.quantity??0),food);
 assert.equal(f.doc.state.npcs[person.id].coins+account(f).coins,coins);
 await f.act({tool:'world_time',args:{minutes:DAY-f.doc.state.minute%DAY},eventId:'counter-eat'});
 assert.ok(account(f).consumedSatiety>prior);assert.equal(f.doc.state.settlements[SID].food??0,publicFood);
 // TI1b: the actual capital and opening food now cover the early days. Keep
 // the original real-shortage check after exhausting that finite supply.
 await f.act({tool:'world_time',args:{minutes:12*DAY},eventId:'counter-finite-stock-exhausted'});
 assert.ok(account(f).missingSatiety>0);assert.deepEqual(auditLedger(f.doc.ledger),[]);assertTransitionInvariants(f.e.primitiveDraft(f.doc),f.e);
});

test('statistical wages require an actual open production job, materials, tools and a solvent payer',async()=>{
 const authored=structuredClone(world),seller=authored.npcs.find(n=>n.id==='npc_hw_yanzhe');
 seller.inventory.item_wood=10;seller.inventory.item_whittling_knife={quantity:1,durability:100};seller.coins=200;
 seller.schedule={default:[{start:0,end:1440,location:SID,activity:'trade',services:['trade']}]};
 authored.locations.find(l=>l.id===SID).workstations=[{id:'food-test-bench',kind:'woodworking',owner:seller.id,fee:0,access:'public'}];
 authored.rules.economy.shops.stores.find(s=>s.keeper===seller.id).restock.push({item:'item_wooden_peg',source:'route',from:'loc_hw',amount:1,maximum:4});
 const f=await start(authored),openingCash=account(f).coins;await f.act({tool:'world_time',args:{minutes:DAY},eventId:'actual-work'});
 const row=account(f),held=f.doc.state.npcs[seller.id].inventory;
 assert.ok(row.labor.minutes>0);assert.ok(row.labor.earned>0);assert.equal(row.labor.earned,row.labor.paid);
 // TI1b: earnings add to capital, never replace it.
 assert.equal(row.coins,openingCash+row.labor.paid);assert.ok((typeof held.item_wood==='number'?held.item_wood:held.item_wood.quantity)<10);
 assert.ok((typeof held.item_wooden_peg==='number'?held.item_wooden_peg:held.item_wooden_peg?.quantity)>0);
 assert.ok((typeof held.item_wooden_peg==='number'?held.item_wooden_peg:held.item_wooden_peg.quantity)<=4,'all groups share the one finite four-peg production offer');
 assert.deepEqual(auditLedger(f.doc.ledger),[]);assertTransitionInvariants(f.e.primitiveDraft(f.doc),f.e);
});

test('a real public-ration day already includes statistical mouths; no-food cohorts cannot add the same deficit twice',async()=>{
 // An authored public ledger with no food. The real daily action must book
 // the shortage once through the existing settlement ration path.
 const authored=structuredClone(world),opening=authored.rules.questSources.ledgers.find(r=>r.settlement===SID).opening;
 Object.assign(opening,{granary:true,food:0,foodPerDay:0,woodPerDay:0});
 const f=await start(authored);await f.act({tool:'world_time',args:{minutes:DAY},eventId:'public-empty'});
 const base=bodyRule(f.e,'satiety').drainPerHour.light*24;
 // TI1b: private opening meals now reduce the public shortage. Put those
 // actual meals back when checking that the 694 mouths were counted once.
 assert.equal(summary(f).missingSatiety+summary(f).consumedSatiety,694*base);
 assert.ok(summary(f).consumedSatiety>0);assert.equal(f.doc.state.settlements[SID].food,0);
 const missing=f.doc.state.settlements[SID].unmetMeals+summary(f).consumedSatiety/base;
 assert.ok(missing>=694&&missing<=1000,`the 694 statistical mouths are part of the town's 1000 rations: ${missing}`);
 assert.deepEqual(auditLedger(f.doc.ledger),[]);
});
