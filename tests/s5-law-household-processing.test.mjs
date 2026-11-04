// TOWNFOOD C on the formal world. Premises come only from the published world
// plus the household-crafts law (derived recipes, hearths, opening utensils);
// the only control is switching that law off, and results are read from the
// real clock and its recorded dice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {statisticalFoodGroups} from '../server-plugin/household-budget.mjs';
import {householdFoodConversion} from '../server-plugin/household-food.mjs';
import {homeCraftRecipes,homeCraftKnown,householdUtensils,householdHearth,derivedHearthHomes} from '../server-plugin/household-crafts.mjs';

const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,SEED='TC-food',SID='loc_bs';
const formal=async({law=true}={})=>{
 const w=await loadWorld();if(!law)delete w.rules.householdCrafts;
 const e=new WorldEngine(w);return {w,e,doc:e.createCharacter(structuredClone(legacy),{},SEED)};
};
const draftOf=doc=>({get:(...p)=>p.reduce((v,k)=>v?.[k],doc),document:doc});
const qty=v=>typeof v==='number'?v:v?.quantity??0;

test('home recipes are exactly the table-derived set: life skill, difficulty <= 10, edible or direct input of an edible recipe',async()=>{
 const {w}=await formal(),rule=w.rules.householdCrafts.recipeConditions;
 const edible=new Set(w.items.filter(i=>i.nutrition?.satiety>0).map(i=>i.id)),inputs=new Set(w.recipes.filter(r=>edible.has(r.output.item)).flatMap(r=>r.materials.map(m=>m.item)));
 const expected=w.recipes.filter(r=>r.skill.startsWith(rule.skillPrefix)&&r.difficulty<=rule.maxDifficulty&&(edible.has(r.output.item)||inputs.has(r.output.item))).map(r=>r.id).sort();
 // hand count over world/meta/recipes.json: mill_oats, bake_flatbread, fish_broth, boil_oat_gruel (I3c: skill_life_3_core, difficulty 10, output item_oat_gruel is edible)
 assert.deepEqual(homeCraftRecipes(w).map(r=>r.id).sort(),expected);
 assert.equal(expected.length,4);
 assert.ok(w.recipes.filter(r=>r.difficulty>rule.maxDifficulty).every(r=>!expected.includes(r.id)));
});

test('adults know home recipes; minors and the incapacitated do not; harder recipes still need a teacher',async()=>{
 const {w,e,doc}=await formal(),s=doc.state,bake=e.byId.get('recipe_bake_flatbread'),hard=w.recipes.find(r=>r.skill.startsWith('skill_life_')&&r.difficulty>10&&r.learningRequired);
 const adult='npc_hw_linsui',minor='npc_hw_duanhe';
 assert.ok(e.byId.get(minor).age<e.rules.npcLife.adultAge);
 assert.equal(homeCraftKnown(e,s,adult,bake),true);
 assert.equal(homeCraftKnown(e,s,minor,bake),false);
 assert.equal(homeCraftKnown(e,{...s,npcs:{...s.npcs,[adult]:{...s.npcs[adult],status:'昏迷'}}},adult,bake),false);
 assert.equal(homeCraftKnown(e,{...s,npcs:{...s.npcs,[adult]:{...s.npcs[adult],status:'患病'}}},adult,bake),true,'a mild illness does not stop home cooking');
 assert.equal(homeCraftKnown(e,s,adult,hard),false,'a recipe above the difficulty threshold stays teacher-only');
 const off=await formal({law:false});assert.equal(homeCraftKnown(off.e,off.doc.state,adult,bake),false);
});

test('every registered home gives its members a hearth; other places and homeless people get none; no location is rewritten',async()=>{
 const {w,e}=await formal(),file=JSON.parse(await fs.readFile('world/geo/locations.json','utf8')),authored=file.locations??file;
 const homes=new Set(w.households.map(h=>h.homeLocation)),derived=derivedHearthHomes(w);
 // a home that already has a cooking station keeps it and gets no second one
 const preset=authored.filter(l=>homes.has(l.id)&&l.workstations?.some(s=>s.kind==='cooking')).map(l=>l.id);
 assert.equal(derived.length,homes.size-preset.length);
 for(const home of derived){
  const first=w.households.find(h=>h.homeLocation===home).members[0],members=w.households.filter(h=>h.homeLocation===home&&h.members.includes(first)).flatMap(h=>h.members),st=householdHearth(e,home,first);
  assert.equal(st.fee,0);assert.equal(st.kind,'cooking');assert.deepEqual(st.members,[...new Set(members)]);
  assert.equal(householdHearth(e,home,'npc_not_in_this_household'),null,'only members of that home use it');
 }
 for(const l of w.locations.filter(l=>!homes.has(l.id)))assert.equal(householdHearth(e,l.id,w.households[0].members[0]),null,l.id);
 assert.ok(preset.every(id=>householdHearth(e,id,w.households.find(h=>h.homeLocation===id).members[0])===null));
 assert.deepEqual(w.locations.map(l=>l.workstations),authored.filter(l=>w.locations.some(x=>x.id===l.id)).map(l=>l.workstations),'derived at use, never written to the catalogue');
 const off=await formal({law:false});assert.equal(householdHearth(off.e,derived[0],w.households.find(h=>h.homeLocation===derived[0]).members[0]),null);
});

test('opening utensils: one of each per household inside the same total M; the cohort holds shares x tools',async()=>{
 const on=await formal(),off=await formal({law:false}),tools=householdUtensils(on.w);
 assert.deepEqual(tools.map(t=>[t.item,t.quantity,t.unitPrice]),[['item_cooking_pot',1,14],['item_kitchen_knife',1,10],['item_wood_spoon',1,8]]);
 const cohorts=statisticalFoodGroups(on.e,on.doc.state,SID);
 for(const g of cohorts)for(const t of tools)assert.equal(qty(g.inventory[t.item]),Object.keys(g.shares).length*t.quantity,`${g.owner} ${t.item}`);
 const opening=on.doc.state.records['town-income:genesis'].openings.find(o=>o.settlement===SID);
 const registered=on.w.households.filter(h=>h.settlement===SID).length,cohortHomes=cohorts.reduce((n,g)=>n+Object.keys(g.shares).length,0);
 // 14+10+8 = 32 coins per household, read from the price table
 assert.equal(opening.utensilValue,32*(registered+cohortHomes),'nobody in Baishi already owns any of the three tools');
 // conservation: the cash given up is exactly the utensils' value, nothing is minted
 const cash=doc=>Object.values(doc.state.records).reduce((n,r)=>n+(r.statisticalPopulation||r.townOpeningHousehold||r.townOpeningPerson?r.coins??0:0),0)+Object.values(doc.state.npcs).reduce((n,x)=>n+(x.coins??0),0);
 assert.equal(cash(off.doc),cash(on.doc)+opening.utensilValue);
 assert.equal(off.doc.state.records['town-income:genesis'].openings.find(o=>o.settlement===SID).utensilValue,0);
 for(const g of statisticalFoodGroups(off.e,off.doc.state,SID))assert.equal(qty(g.inventory.item_cooking_pot),0);
 assert.deepEqual(auditLedger(on.doc.ledger),[]);
});

test('formal-world raw grain: a Baishi cohort turns oats into gruel at home (water and wood fetched, minutes charged); no mill needed',async()=>{
 const {e,doc}=await formal(),group=statisticalFoodGroups(e,doc.state,SID)[3],at=DAY+780;
 const plan=householdFoodConversion(draftOf(doc),e,group.owner,'item_oats',at);
 // 1 oats (0.5 kg) + 3 water + 1 wood -> 4 bowls x satiety 30 = 120, the same 4 x 30 per grain unit as the flatbread chain
 assert.deepEqual(plan.chain,['recipe_boil_oat_gruel']);assert.equal(plan.raw,1);assert.equal(plan.gain,120);
 assert.deepEqual(plan.provided.sort(),['item_water','item_wood']);
 // minutes per batch = 60 cooking + the fetch share; the cohort holds no water or wood, so both are fetched
 assert.equal(plan.minutes,60+plan.prep);assert.ok(plan.prep>0);
 // controls: the whole law switched off, or only the provisions removed (then no water/wood exists in the bag)
 const off=await formal({law:false});
 assert.equal(householdFoodConversion(draftOf(off.doc),off.e,statisticalFoodGroups(off.e,off.doc.state,SID)[3].owner,'item_oats'),null);
 const w=await loadWorld();delete w.rules.householdCrafts.provisions;
 const e2=new WorldEngine(w),d2=e2.createCharacter(structuredClone(legacy),{},SEED);
 assert.equal(householdFoodConversion(draftOf(d2),e2,statisticalFoodGroups(e2,d2.state,SID)[3].owner,'item_oats',at),null);
});

// Ablation controls only: the forage law and the public granary are switched off
// and the household's ready-made food is taken away so that a meal deficit
// exists. Flour, salt, water, kindling, pot and hearth are the published ones.
const HOME=['npc_hw_ayan','npc_hw_linsui'];
const ablated=async({dropPot=false}={})=>{
 const w=await loadWorld();w.rules.householdSubsistence.forageTypes={};
 const e=new WorldEngine(w),opening=structuredClone(legacy);opening.state.settlement.granary=false;
 const doc=e.createCharacter(opening,{},SEED);
 for(const id of HOME)for(const item of Object.keys(doc.state.npcs[id].inventory)){
  const def=e.byId.get(item);
  if(def?.nutrition?.satiety>0||dropPot&&item==='item_cooking_pot')delete doc.state.npcs[id].inventory[item];
 }
 return {e,doc};
};
const run=async(e,start,days)=>{let doc=start;const meals=[];
 for(let day=0;day<days;day++){const out=await e.reduce(doc,{tool:'world_time',args:{minutes:DAY},eventId:`tc-abl:${day}`});doc=applyPatches(doc,out.patches);meals.push(structuredClone(doc.state.family?.meals?.house_hw_01));}
 return {doc,meals};
};
const jobsOf=doc=>Object.values(doc.state.records).filter(r=>r.category==='household_processing').sort((a,b)=>a.start-b.start);
const held=(e,doc,item)=>HOME.reduce((n,id)=>n+e.quantity({get:(...p)=>p.reduce((v,k)=>v?.[k],doc)},id,item),0);

test('hw household bakes from housemates pooled stock: flour in one bag, salt, water, pot in another; every batch follows its real die',async()=>{
 const {e,doc:start}=await ablated();
 // Hand count: ayan carries the 4 flour and the kindling; linsui carries pot, salt and water.
 assert.equal(e.quantity(draftOf(start),'npc_hw_linsui','item_oat_flour'),0);
 assert.equal(e.quantity(draftOf(start),'npc_hw_ayan','item_oat_flour'),4);
 const {doc,meals}=await run(e,start,3),jobs=jobsOf(doc);
 assert.ok(jobs.length>0&&jobs.every(j=>j.recipe==='recipe_bake_flatbread'&&j.owner==='npc_hw_linsui'));
 // materials are spent on success and failure alike, nothing is topped up
 assert.equal(held(e,doc,'item_oat_flour'),4-jobs.reduce((n,j)=>n+j.batches,0));
 for(const j of jobs){
  assert.equal(j.status,j.outcome.success?'done':'failed');
  assert.equal(j.outputs?.item_oat_flatbread??0,j.outcome.success?4*j.batches:0,'a failed die leaves no flatbread, a success leaves 4 per batch');
 }
 const done=jobs.filter(j=>j.status==='done');
 assert.ok(done.length>0,'at least one real die succeeds in three days');
 assert.ok(meals.some(m=>m.consumed.some(c=>c.item==='item_oat_flatbread')),'baked food reaches the table');
 assert.deepEqual(auditLedger(doc.ledger),[]);
 // same clock, same result
 const again=await run(e,start,3);assert.deepEqual(jobsOf(again.doc),jobs);
});

test('no pot anywhere in the household: no batch is started, the flour stays and the deficit stays',async()=>{
 const {e,doc:start}=await ablated({dropPot:true});
 const {doc,meals}=await run(e,start,3);
 assert.equal(jobsOf(doc).length,0);
 assert.equal(held(e,doc,'item_oat_flour'),4);
 assert.ok(meals.some(m=>m.shortfall.satiety>0));
 assert.deepEqual(auditLedger(doc.ledger),[]);
});

test('hw household boils its raw oats into gruel: water leaves the basin ledger, wood the forest ledger, the fetch minutes are charged, the books close',async()=>{
 const {e,doc:start}=await ablated(),cook='npc_hw_xuling';
 // premise (control, like the ablation above): the household holds raw oats, as it would after buying at the shop
 start.state.npcs[cook].inventory.item_oats={quantity:3,quality:'木',durability:100,weight:0.5};
 const {doc}=await run(e,start,3),jobs=jobsOf(doc).filter(j=>j.recipe==='recipe_boil_oat_gruel');
 assert.ok(jobs.length>0&&jobs.some(j=>j.owner===cook));
 for(const j of jobs){
  assert.equal(j.status,j.outcome.success?'done':'failed');
  assert.ok(j.finish-j.start>60,'the job is 60 cooking minutes plus the cook own errands');
  assert.equal(j.outputs?.item_oat_gruel??0,j.outcome.success?4*j.batches:0,'4 bowls per batch on success, nothing on a failed die');
 }
 // hand count: each batch draws 3 water portions (750 ml; item_water 0.25 kg) as a harvest, and 1 wood (the village
 // crews cut the same forest, so wood is read against a twin run in which the household holds no oats)
 const batches=jobs.reduce((n,j)=>n+j.batches,0),cut=d=>Object.values(d.state.records).filter(r=>r.category==='forest').reduce((n,r)=>n+r.harvested,0);
 const twin=ablated(),twinRun=await run((await twin).e,(await twin).doc,3);
 assert.equal(jobsOf(twinRun.doc).filter(j=>j.recipe==='recipe_boil_oat_gruel').length,0);
 assert.equal(cut(doc)-cut(twinRun.doc),batches);
 assert.equal(doc.ledger.flows['src:harvest|item_water|draw_water'],3*batches);
 // what was cooked is still in a bag or was eaten at the table (the sink books the meal), nothing else
 const bowls=Object.keys(doc.state.npcs).reduce((n,id)=>n+e.quantity(draftOf(doc),id,'item_oat_gruel'),0);
 assert.equal(bowls+(doc.ledger.flows['sink:consume|item_oat_gruel|meal']??0),4*jobs.filter(j=>j.status==='done').reduce((n,j)=>n+j.batches,0));
 assert.deepEqual(auditLedger(doc.ledger),[]);
 const again=await run(e,start,3);assert.deepEqual(jobsOf(again.doc),jobsOf(doc));
});

test('statistical cohorts: bags hold only rations and utensils, so no raw or ingredient exists to process (verified premise)',async()=>{
 // Not buildable from published data: a cohort would need salt, kindling, water and a flour or fish
 // supplier. The test pins that premise so the gap shows up as soon as such a supply exists.
 const {e,doc}=await formal();
 for(const g of statisticalFoodGroups(e,doc.state,SID))
  assert.deepEqual(Object.keys(g.inventory).filter(k=>qty(g.inventory[k])>0).sort(),['item_cooking_pot','item_kitchen_knife','item_ration','item_wood_spoon']);
});

// Labour already taken: a hired day cannot be built here without the I2 labour market
// (core:trade.hire needs a player-side employer, funds and the worker's consent). The shared
// daily budget itself is covered by tests/s5-law-household-meals.test.mjs and town-income.test.mjs;
// household-food.mjs only ever starts a batch inside householdWorkTime().unused spans (freeMinutes).

test('formal clock: every processing job obeys its recorded die, market-day village sales only cover real surplus, ledger stays closed',async()=>{
 const {e,doc:start}=await formal();let doc=start;
 for(let day=0;day<4;day++){
  const out=await e.reduce(doc,{tool:'world_time',args:{minutes:DAY},eventId:`tc-day:${day}`});doc=applyPatches(doc,out.patches);
 }
 for(const j of Object.values(doc.state.records).filter(r=>r.category==='household_processing')){
  const recipe=e.byId.get(j.recipe);
  if(j.outcome)assert.equal(j.status,j.outcome.success?'done':'failed');
  if(j.status==='failed')assert.ok(!Object.keys(j.outputs??{}).includes(recipe.output.item),'a failed check leaves no finished food');
 }
 for(const r of Object.values(doc.state.records).filter(r=>r.category==='customer_flow'&&r.foodProducer))
  for(const v of r.visits.filter(v=>v.outcome==='bought'))assert.ok(v.quantity>0&&v.paid>0);
 assert.deepEqual(auditLedger(doc.ledger),[]);
});
