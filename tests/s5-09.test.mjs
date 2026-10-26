import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {harvestForest,advanceForestWater} from '../server-plugin/forest-water.mjs';
import {waterBasins,waterConnections,basinState} from '../server-plugin/water-cycle.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const species='monster_black_fin_perch',habitat='habitat_hw_water',ecology=`ecology:${habitat}`;
function premise(engine,document,setup){
 const out=applyIntentSetup(engine,document,setup);assert.deepEqual(out.setupUnmet,[]);return out.document;
}
async function act(engine,document,tool,args,eventId){
 const out=await engine.reduce(document,{tool,args,eventId});
 return {document:applyPatches(document,out.patches),result:out.result};
}
function fishScene(compartment){
 const w=structuredClone(world);
 // Disease rates and territory are not examined by the conversion tests.
 // Declare them through the installed correction slots, preserving native
 // tracking, movement, lifecycle protocol and the production ecology clock.
 for(const rate of ['infection','recovery','mortality'])w.derived.modifiers.push({id:`s509-${rate}`,pack:'core',target:`health:${rate}Rate`,stage:'min',value:0,when:`target == '${species}'`});
 w.derived.modifiers.push({id:'s509-territory',pack:'core',target:'ecology:territoryCapacity',stage:'max',value:1});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s509-fish'),p=initial.state.records[ecology].populations[species];
 const document=premise(engine,initial,{minute:540,location:'loc_hw_dock',facts:[
  {path:['state','records',ecology,'populations',species],value:{...p,health:{S:compartment==='S'?30:0,I:compartment==='I'?30:0,R:compartment==='R'?30:0}}},
  {path:['state','player','attributes'],value:{...initial.state.player.attributes,'敏捷':30,'智慧':30}}
 ]});
 return {engine,document};
}
async function track(f,document,prefix){
 for(let i=0;i<10;i++){
  const out=await act(f.engine,document,'world_field',{operation:'wildlife_track',species},`${prefix}:${i}`);
  document=out.document;if(out.result.success)return out;
 }
 assert.fail('native tracking did not find a fish');
}
const pool=doc=>doc.state.records[ecology].populations[species];
function books(engine,doc){const r=reconcile(engine,doc);assert.deepEqual(r.mismatches,[]);assert.deepEqual(r.drift,[]);assert.deepEqual(r.audit,[]);}

for(const compartment of ['S','I','R'])test(`leaving merges a real ${compartment} individual into its native pool exactly once`,async()=>{
 const f=fishScene(compartment),tracked=await track(f,f.document,`track:${compartment}`),id=tracked.result.found.id;
 // Published opening 30; tracking borrows 1, so 29 anonymous + 1 body = 30.
 assert.equal(pool(tracked.document).count,29);
 assert.equal(pool(tracked.document).health[compartment],29);
 assert.equal(tracked.document.ledger.accounts[`${id}|item_live_fish|reserve`],1);
 const away=await act(f.engine,tracked.document,'world_move',{destination:'loc_hw'},`leave:${compartment}`);
 // The existing engine omits unfoldRemoteAt on replays without a county
 // opening receipt. Layer settlement must still perform the identical merge.
 const replay=await f.engine.reduce(tracked.document,{tool:'world_move',args:{destination:'loc_hw'},eventId:`leave:${compartment}`},{replay:true,result:away.result});
 assert.deepEqual(applyPatches(tracked.document,replay.patches),away.document);
 // The same case returns: 29 + 1 = 30 in its original S/I/R compartment.
 assert.deepEqual(pool(away.document).health,{S:compartment==='S'?30:0,I:compartment==='I'?30:0,R:compartment==='R'?30:0});
 assert.equal(pool(away.document).count,30);assert.equal(pool(away.document).withdrawn,1);assert.equal(pool(away.document).immigrated,1);
 assert.equal(away.document.state.creatures[id],undefined);
 assert.equal(away.document.ledger.accounts[`${id}|item_live_fish|reserve`],0);
 const back=await act(f.engine,away.document,'world_move',{destination:'loc_hw_dock'},`back:${compartment}`);
 assert.equal(pool(back.document).count,30);assert.equal(pool(back.document).immigrated,1);
 assert.equal(back.document.state.creatures[id],undefined);
 assert.deepEqual(conservation(f.engine,tracked.document,away.document),[]);books(f.engine,back.document);
});

test('mixed S/I/R stock is restored without reclassifying the unborrowed cases',async()=>{
 const f=fishScene('S');
 f.document=premise(f.engine,f.document,{facts:[{path:['state','records',ecology,'populations',species,'health'],value:{S:20,I:8,R:2}}]});
 const tracked=await track(f,f.document,'mixed-track');
 // Largest remainder for one body: 20/30,8/30,2/30 selects S.
 // Borrowing leaves19S/8I/2R; merging19+1 restores20S/8I/2R, total30.
 assert.deepEqual(pool(tracked.document).health,{S:19,I:8,R:2});
 const away=await act(f.engine,tracked.document,'world_move',{destination:'loc_hw'},'mixed-leave');
 assert.deepEqual(pool(away.document).health,{S:20,I:8,R:2});assert.equal(pool(away.document).count,30);
 books(f.engine,away.document);
});

test('invalid individual compartment rejects the entire move without writes',async()=>{
 const f=fishScene('I'),tracked=await track(f,f.document,'invalid-track'),id=tracked.result.found.id;
 const invalid=premise(f.engine,tracked.document,{facts:[{path:['state','creatures',id,'populationHealth'],value:'invalid'}]}),before=structuredClone(invalid);
 await assert.rejects(act(f.engine,invalid,'world_move',{destination:'loc_hw'},'invalid-leave'),/S\/I\/R/);
 assert.deepEqual(invalid,before);assert.equal(pool(invalid).count,29);
});

test('injured individuals remain materialized on departure',async()=>{
 const f=fishScene('R'),tracked=await track(f,f.document,'injured-track'),id=tracked.result.found.id;
 // Injury is not the subject: declare the history, then exercise real movement.
 const injured=premise(f.engine,tracked.document,{facts:[{path:['state','creatures',id,'hp'],value:tracked.document.state.creatures[id].maxHp-1}]});
 const away=await act(f.engine,injured,'world_move',{destination:'loc_hw'},'injured-leave');
 assert.ok(away.document.state.creatures[id]);assert.equal(pool(away.document).count,29);
 assert.equal(away.document.ledger.accounts[`${id}|item_live_fish|reserve`],1);books(f.engine,away.document);
});

test('closed forest regeneration equals thirty native daily steps at a handwritten anchor',()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s509-forest'),key='forest:loc_hw_northwood';
 const opening=premise(engine,initial,{minute:0,facts:[{path:['state','records'],value:{...initial.state.records,[key]:{
  category:'forest',location:'loc_hw_northwood',initial:60000,reserve:33000,harvested:27000,grown:0,updatedAt:0,
  ancient:{initial:6000,reserve:6000,grown:0,harvested:0}
 }}}]});
 // Production catch-up at harvest uses one closed projection; zero harvest
 // isolates regrowth. Daily comparison runs the installed environmental clock.
 const closed=engine.primitiveDraft(opening);
 harvestForest(closed,engine,'loc_hw_northwood',0,30*1440,{to:'player|item_wood|inventory',eventId:'closed'});
 let daily=opening;
 for(let day=0;day<30;day++){
  const d=engine.primitiveDraft(daily);advanceForestWater(d,engine,day);daily=applyPatches(daily,d.patches);
 }
 // D05 §5.5 / published forest: ordinary K54000,N27000,r=.0008.
 // floor(54000/(1+exp(-.0008*30)))=27323; ancient6000 stays full.
 // Total33323, exact regrowth33323-33000=323; no rounding per step.
 for(const doc of [closed.document,daily]){
  assert.equal(doc.state.records[key].reserve,33323);assert.equal(doc.state.records[key].grown,323);
  assert.equal(doc.ledger.accounts[`${key}|item_wood|reserve`],33323);
  assert.equal((doc.ledger.flows['src:regrowth|item_wood|forest']??0)-(opening.ledger.flows['src:regrowth|item_wood|forest']??0),323);
  books(engine,doc);
 }
 assert.deepEqual(closed.document.state.records[key],daily.state.records[key]);
});

test('native ecology and rivers match daily subdivisions within the declared iterative tolerance',async()=>{
 const w=structuredClone(world),hare='monster_leaf_hare',hkey='ecology:habitat_hw_wood';
 for(const [name,value] of [['infection',.75],['recovery',.5],['mortality',.25]])w.derived.modifiers.push({id:`s509-hare-${name}`,pack:'core',target:`health:${name}Rate`,stage:'add',value,when:`target == '${hare}'`});
 w.derived.modifiers.push({id:'s509-hare-capacity',pack:'core',target:'ecology:territoryCapacity',stage:'max',value:1},
  {id:'s509-hare-competition',pack:'core',target:'ecology:competition',stage:'min',value:0,when:`holder == '${hare}'`});
 // Weather and local demand are not examined. Retain the actual river graph,
 // native split derivation and propagation, with a declared water-only premise.
 Object.assign(w.rules.forestWater.water,{rainShare:{clear:0,cloudy:0,rain:0,storm:0,snow:0,fog:0},evaporationShare:0,dailyFlowShare:.5,drinkingMlPerPerson:0,irrigationMlPerArea:0});
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s509-iteration'),records=structuredClone(initial.state.records);
 records[hkey].populations[hare].health={S:20,I:8,R:2};
 const basins=waterBasins(engine),up='basin:loc_hw',down='basin:loc_yandu';
 for(const b of basins){
  const water={...basinState(engine,initial.state,b),waterMl:b.id===up?1200:b.id===down?150:0,saltMg:0,toxinUg:0,turbidity:0,pathogenRisk:0};
  if(b.id===up)water.outflow=waterConnections(engine,basins).edges.filter(e=>e.from===up).map(e=>({edge:e.id,share:e.to==='feature_hw_pool'?.25:e.to===down?.75:0}));
  records[`water-cycle:${b.id}`]={category:'water_cycle',location:b.location,initial:water.waterMl,water};
  if(b.feature)records[`physical_feature:${b.id}`]={id:b.id,category:'physical_feature',location:b.location,state:water};
 }
 const opening=premise(engine,initial,{minute:0,location:'loc_hw',facts:[{path:['state','records'],value:records}]}),
  whole=(await act(engine,opening,'world_time',{minutes:2880},'whole')).document;
 let daily=opening;for(let i=0;i<2;i++)daily=(await act(engine,daily,'world_time',{minutes:1440},`day:${i}`)).document;
 // D07 §7.3(3), B05.2: total ±1%, distribution KL <= .02.
 // Native scheduler retains daily substeps inside a long advance, so it meets
 // the tighter zero-error comparison below. Anchors are independently worked:
 // D1 death2/recovery3/infection2 ->18S,5I,5R; D2 death1/recovery2/
 // infection1 ->17S,3I,7R =27. River1200*.5*.5=300 upstream;
 // .75*(600+300)=675 downstream inflow, never charged twice.
 for(const doc of [whole,daily]){
  assert.deepEqual(doc.state.records[hkey].populations[hare].health,{S:17,I:3,R:7});
  assert.equal(doc.state.records[hkey].populations[hare].count,27);
  assert.equal(doc.state.records[`water-cycle:${up}`].water.waterMl,300);
  assert.equal(doc.state.records[`water-cycle:${down}`].inflow,675);
  books(engine,doc);
 }
 for(const [key,row] of Object.entries(whole.state.records))if(['ecology','water_cycle'].includes(row.category))assert.deepEqual(row,daily.state.records[key]);
});

test('first arrival borrows private stock once; repeated entry preserves money, goods and census',async()=>{
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'s509-roundtrip');
 const before=premise(engine,initial,{location:'loc_bs'});
 const first=await act(engine,before,'world_move',{destination:'loc_far_tongji'},'county-first');
 const county='county_hanlu_tongji',record=first.document.state.remote[county],sid=record.skeleton.seat;
 const ids=['npc_rg_hanlu_tongji_01','npc_rg_hanlu_tongji_02','npc_rg_hanlu_tongji_03'];
 // This seed opens the three native keepers with 372+268+285 = 925 coins.
 // Their actual stock is 4+3+5 + 3+4+6 + 2+2+2+6 = 37 units.
 assert.equal(ids.reduce((n,id)=>n+first.document.state.npcs[id].coins,0),925);
 assert.equal(ids.reduce((n,id)=>n+Object.values(first.document.state.npcs[id].inventory).reduce((s,v)=>s+(v.quantity??v),0),0),37);
 assert.equal(record.skeleton.census.rostered,2132);
 for(const id of ids)assert.deepEqual(first.document.state.npcs[id].materialized,{county,settlement:sid});
 const aggregate=first.document.state.records[`remote-stock:${sid}`];
 assert.equal(aggregate.coins,0);assert.ok(Object.values(aggregate.inventory).every(n=>n===0));
 const genesis=Object.fromEntries(Object.entries(first.document.ledger.flows).filter(([key])=>key.startsWith('src:genesis|')&&key.endsWith('|remote')));
 const district=record.skeleton.settlements[0].districts[0];let doc=first.document,roster;
 for(let i=0;i<3;i++)for(const destination of [district,sid]){
  const out=await act(engine,doc,'world_move',{destination},`churn:${i}:${destination}`);
  assert.deepEqual(conservation(engine.scoped(out.document),doc,out.document),[]);doc=out.document;
  if(destination===district){
   const identities=Object.values(doc.state.created).filter(p=>p.generated==='population'&&p.home?.district===district);
   if(roster)assert.deepEqual(identities,roster);else{roster=identities;assert.ok(roster.length>0);}
  }
 }
 assert.deepEqual(Object.fromEntries(Object.entries(doc.ledger.flows).filter(([key])=>key.startsWith('src:genesis|')&&key.endsWith('|remote'))),genesis);
 assert.equal(doc.state.remote[county].skeleton.census.rostered,2132);
 assert.equal(ids.reduce((n,id)=>n+doc.state.npcs[id].coins,0),925);
 assert.equal(ids.reduce((n,id)=>n+Object.values(doc.state.npcs[id].inventory).reduce((s,v)=>s+(v.quantity??v),0),0),37);
 books(engine.scoped(doc),doc);
});

test('storage restart/export/import retains returned compartments and continues identically',async t=>{
 const f=fishScene('I'),tracked=await track(f,f.document,'store-track');
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'s509-store-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(doc,input)=>f.engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});
 await store.create({id:'remote',worldVersion:world.version,document:tracked.document});
 await store.transact('remote',{id:'leave',anchor:'leave',input:{tool:'world_move',args:{destination:'loc_hw'},eventId:'stored-leave'}},reducer);
 const saved=(await store.read('remote')).document;
 assert.deepEqual(pool(saved).health,{S:0,I:30,R:0});
 assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('remote')).document,saved);
 const restored=(await store.import(await store.export('remote'),'copy')).document;assert.deepEqual(restored,saved);
 const a=await act(f.engine,saved,'world_move',{destination:'loc_hw_dock'},'resume'),b=await act(f.engine,restored,'world_move',{destination:'loc_hw_dock'},'resume');
 assert.deepEqual(a.document,b.document);books(f.engine,a.document);
});

test('static prompt remains within the authorized ceiling',async()=>{
 assert.ok((await loadPromptBundle()).budget.estimatedTokens<=10593);
});
