import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {advanceSeasonalMigration} from '../server-plugin/seasonal-migration.mjs';
import {settlePopulationPredation,nicheOverlap,populationCapacity,populationBirthFactor} from '../server-plugin/ecology-dynamics.mjs';
import {executeProtocolPrimitive} from '../server-plugin/transition.mjs';
import {aliveHoldings,ensureHoldings} from '../server-plugin/holdings.mjs';
import {holdingsDiscrepancies,auditHoldings} from './helpers/holdings-audit.mjs';
import {advanceTerritoryMigration} from '../server-plugin/wildlife.mjs';
import {actionCall,loadActionRegistry,findAction} from '../server-plugin/action-registry.mjs';
import {resolveToolCall} from '../extension/tools.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const habitat='habitat_hw_wood',species='monster_leaf_hare',key=`ecology:${habitat}`;
const pool=(document,id=species,range=habitat)=>document.state.records[`ecology:${range}`].populations[id];
function premise(engine,document,setup){
 const out=applyIntentSetup(engine,document,setup);assert.deepEqual(out.setupUnmet,[]);return out.document;
}
function setup({infection=.75,recovery=.5,mortality=.25,multiplier=1,fish=false,territory=1,competition=false,modifiers=[]}={}){
 const w=structuredClone(world),target=fish?'monster_black_fin_perch':species;
 // Installed rule corrections exercise S5-01's real public mechanism. No
 // invented species, production test branch, or unapproved content is loaded.
 for(const [name,value] of [['infection',infection],['recovery',recovery],['mortality',mortality]])w.derived.modifiers.push({id:`ecology-${name}`,pack:'core',target:`health:${name}Rate`,stage:'add',value,when:`target == '${target}'`});
 if(multiplier!==1)w.derived.modifiers.push({id:'ecology-exposure',pack:'core',target:'health:infectionRate',stage:'mul',value:multiplier,when:`target == '${target}'`});
 // S/I/R anchors explicitly examine K60, excluding territory compression
 // and the newly published hare/deer competition. Relation cases opt in below.
 // Use the production slot rather than deleting controls or forging a kill.
 if(territory!==null)w.derived.modifiers.push({id:'premise-territory-capacity',pack:'core',target:'ecology:territoryCapacity',stage:'max',value:territory});
 if(!competition)w.derived.modifiers.push({id:'premise-no-competition',pack:'core',target:'ecology:competition',stage:'min',value:0,when:`holder == '${target}'`});
 w.derived.modifiers.push(...modifiers);
 const engine=new WorldEngine(w),initial=engine.createCharacter(seed,{},'s506-disease');
 const h=fish?'habitat_hw_water':habitat,p=pool(initial,target,h);
 // Infection history is a declared premise. Actual transitions, rounding,
 // deaths and all subsequent clocks remain the native production runtime.
 const document=premise(engine,initial,{minute:1200,facts:[{path:['state','records',`ecology:${h}`,'populations',target],value:{...p,health:{S:20,I:8,R:2}}}]});
 assert.equal(pool(document,target,h).count,30); // Published species opening stock.
 return {engine,document,target,habitat:h};
}
async function run(f,document,tool,args,eventId){
 const out=await f.engine.reduce(document,{tool,args,eventId});return {document:applyPatches(document,out.patches),result:out.result};
}
function husbandryCall(operation,slots={}){
 // S506c publication: use the actual catalog and world_act gateway, without
 // injecting draft definitions, items or a replacement registry for tests.
 const registry=loadActionRegistry(),action=findAction(registry,`core:${operation.replace('_','.')}`);
 const call=actionCall(registry,action.id,slots);
 assert.deepEqual(resolveToolCall(call.tool,call.args),{tool:'world_farm',args:{...slots,operation}});
 return {tool:'world_act',args:{action:action.id,slots}};
}
const wait=async(f,document,minutes,id)=>(await run(f,document,'world_time',{minutes},id)).document;
function conserved(document){
 for(const record of Object.values(document.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(record.populations)){
  assert.equal(p.initial+p.born+(p.arisen??0)+(p.immigrated??0)-p.predated-p.starved-p.withdrawn-(p.emigrated??0)-(p.diseaseDeaths??0),p.count);
  if(p.health){assert.equal(p.health.S+p.health.I+p.health.R,p.count);assert.ok(Object.values(p.health).every(n=>Number.isSafeInteger(n)&&n>=0));}
 }
}

test('S/I/R native daily transfers have hand-calculated numeric anchors',async()=>{
 const f=setup(),before=structuredClone(f.document),after=await wait(f,f.document,240,'day');
 // K=60. Death: 8*.25=2. Recovery: (8-2)*.5=3.
 // Infection: 20*.75*8/60=2. Only opening I recovers or dies.
 assert.deepEqual(pool(after).health,{S:18,I:5,R:5});
 assert.equal(pool(after).count,28);assert.equal(pool(after).diseaseDeaths,2);
 assert.deepEqual(f.document,before);conserved(after);
});

test('infection slot applies species-specific exposure corrections',async()=>{
 const low=setup({infection:.375}),high=setup({infection:.375,multiplier:2});
 const a=await wait(low,low.document,240,'low'),b=await wait(high,high.document,240,'high');
 // 20*.375*8/60=1; with exposure multiplier 2, infection=2.
 assert.deepEqual(pool(a).health,{S:19,I:4,R:5});
 assert.deepEqual(pool(b).health,{S:18,I:5,R:5});
 assert.equal(pool(a).count,28);assert.equal(pool(b).count,28);conserved(a);conserved(b);
});

test('healthy and immune populations cannot spontaneously become infected',async()=>{
 const f=setup(),p=pool(f.document);
 f.document=premise(f.engine,f.document,{facts:[{path:['state','records',key,'populations',species],value:{...p,health:{S:20,I:0,R:10}}}]});
 const after=await wait(f,f.document,240,'no-source');
 assert.deepEqual(pool(after).health,{S:20,I:0,R:10});assert.equal(pool(after).count,30);conserved(after);
});

test('published disease course parameters drive the native population clock',async()=>{
 const f=setup({infection:0,recovery:0,mortality:0}),p=pool(f.document);
 f.document=premise(f.engine,f.document,{facts:[{path:['state','records',key,'populations',species],value:{...p,disease:'disease:pox',health:{S:0,I:30,R:0}}}]});
 const after=await wait(f,f.document,240,'registered-disease');
 // Published pox: course=20 days, lethality=.2. Mortality credit
 // 30*.2/20=.3 -> 0 bodies; recovery 30/20=1.5 -> 1 recovered body.
 assert.deepEqual(pool(after).health,{S:0,I:29,R:1});assert.equal(pool(after).count,30);
 assert.equal(pool(after).diseaseDeaths,0);conserved(after);
});

test('Holling-II predation carries fractional kills into the next native step',()=>{
 const f=setup(),h=world.rules.wildlife.habitats.find(h=>h.id===habitat),catalog=world.monsters.filter(s=>s.wildlife?.habitat===habitat);
 const d=f.engine.primitiveDraft(f.document),record=structuredClone(d.get('state','records',key));
 settlePopulationPredation(d,f.engine,h,catalog,record,'spring');
 // Published wolf a=.25/60, h2, four hunters, 30 prey:
 // (.25/60)*4*30/(1+(.25/60)*2*30)=.4 kill per step.
 assert.equal(record.populations[species].count,30);assert.equal(record.populations[species].predated,0);
 settlePopulationPredation(d,f.engine,h,catalog,record,'spring');
 assert.equal(record.populations[species].count,30);assert.equal(record.populations[species].predated,0);
 settlePopulationPredation(d,f.engine,h,catalog,record,'spring');
 // Three .4 credits reach one body. Largest remainder removes S.
 assert.equal(record.populations[species].count,29);assert.equal(record.populations[species].predated,1);
 assert.deepEqual(record.populations[species].health,{S:19,I:8,R:2});
});

test('competition, niche overlap and mutualism change native births and population quantities',async()=>{
 const pair="holder == 'monster_leaf_hare' && target == 'monster_brown_deer'";
 const competition=setup({infection:0,recovery:0,mortality:0,competition:true,modifiers:[{id:'grazing-competition',pack:'core',target:'ecology:competition',stage:'add',value:1,when:pair}]});
 const p=pool(competition.document);
 competition.document=premise(competition.engine,competition.document,{facts:[{path:['state','records',key,'populations',species],value:{...p,health:{S:30,I:0,R:0}}}]});
 const h=world.rules.wildlife.habitats.find(h=>h.id===habitat),catalog=world.monsters.filter(s=>s.wildlife?.habitat===habitat);
 // K60 * (1 - k1 * deer30/K60 * niche1) = 30. Native forestry
 // can only lower this ceiling further; N30 therefore has no birth room.
 assert.equal(populationCapacity(competition.engine.primitiveDraft(competition.document),competition.engine,h,competition.engine.byId.get(species),catalog,competition.document.state.records[key].populations,60,'spring'),30);
 const crowded=await wait(competition,competition.document,6*1440+240,'competition');
 assert.equal(pool(crowded).born,0);assert.equal(pool(crowded).count,30);conserved(crowded);
 const mutualism=setup({infection:0,recovery:0,mortality:0,modifiers:[{id:'mutual-growth',pack:'core',target:'ecology:mutualism',stage:'add',value:1,when:pair}]});
 const helped=await wait(mutualism,mutualism.document,6*1440+240,'mutualism');
 // Weekly3 * (1 + k1 * deer30/K60) = 4.5 -> 4 actual births, .5 credit.
 assert.equal(pool(helped).born,4);assert.equal(pool(helped).count,34);conserved(helped);
 assert.equal(nicheOverlap(world.monsters.find(s=>s.id===species),world.monsters.find(s=>s.id==='monster_brown_deer')),1);
 // Published ecology vectors for hare and goat are both {grass:1}: overlap1.
 // Wolf retains its forest tags, with zero overlap against the grass vector.
 assert.equal(nicheOverlap(world.monsters.find(s=>s.id===species),world.monsters.find(s=>s.id==='monster_bent_horn_goat')),1);
 assert.equal(nicheOverlap(world.monsters.find(s=>s.id===species),world.monsters.find(s=>s.id==='monster_grey_ridge_wolf')),0);
});

test('predator growth reads prey density and published handling uses the full Holling-II denominator',()=>{
 const f=setup(),h=world.rules.wildlife.habitats.find(h=>h.id===habitat),catalog=world.monsters.filter(s=>s.wildlife?.habitat===habitat),wolf=f.engine.byId.get('monster_grey_ridge_wolf');
 let d=f.engine.primitiveDraft(f.document);
 // Thirty prey/K60=.5; with fifteen real remaining prey the factor is .25.
 assert.equal(populationBirthFactor(d,f.engine,h,wolf,catalog,d.get('state','records',key,'populations'),'spring'),.5);
 const p=pool(f.document);
 const depleted=premise(f.engine,f.document,{facts:[{path:['state','records',key,'populations',species],value:{...p,count:15,withdrawn:15,health:{S:15,I:0,R:0}}}]});
 d=f.engine.primitiveDraft(depleted);
 assert.equal(populationBirthFactor(d,f.engine,h,wolf,catalog,d.get('state','records',key,'populations'),'spring'),.25);
 const w=structuredClone(world);
 const e=new WorldEngine(w),preview=premise(e,e.createCharacter(seed,{},'s506-handling'),{}),native=e.primitiveDraft(preview),record=structuredClone(native.get('state','records',key));
 // Published wolf a=.25/K60, h2, hunters4, prey30:
 // (.25/60)*4*30 / (1+(.25/60)*2*30) = .5/1.25 = .4.
 const actual=w.monsters.filter(s=>s.wildlife?.habitat===habitat);
 settlePopulationPredation(native,e,h,actual,record,'spring');settlePopulationPredation(native,e,h,actual,record,'spring');
 assert.equal(record.populations[species].count,30);assert.equal(record.populations[species].predated,0);
 settlePopulationPredation(native,e,h,actual,record,'spring');
 assert.equal(record.populations[species].count,29);assert.equal(record.populations[species].predated,1);
});

test('daily fractional transfers and native time subdivisions are equivalent',async()=>{
 const f=setup(),long=await wait(f,f.document,1680,'long');
 let split=f.document;for(let i=0;i<28;i++)split=await wait(f,split,60,`hour${i}`);
 // Day 2: floor(1.25) death=1; recovery=(5-1)*.5=2;
 // infection=18*.75*5/60=1.125 -> 1, residual .125 persists.
 assert.deepEqual(pool(long).health,{S:17,I:3,R:7});assert.equal(pool(long).count,27);
 for(const h of world.rules.wildlife.habitats)assert.deepEqual(long.state.records[`ecology:${h.id}`],split.state.records[`ecology:${h.id}`]);
 conserved(long);conserved(split);
});

test('a native week equals subdivisions across birth and predator settlement boundaries',async()=>{
 const pair="holder == 'monster_leaf_hare' && target == 'monster_brown_deer'";
 const f=setup({infection:0,recovery:0,mortality:0,competition:true,modifiers:[
  {id:'week-mutualism',pack:'core',target:'ecology:mutualism',stage:'add',value:1,when:pair},
  {id:'week-competition',pack:'core',target:'ecology:competition',stage:'add',value:.2,when:pair}
 ]});
 const minutes=6*1440+240,long=await wait(f,f.document,minutes,'whole-week');let split=f.document;
 for(let left=minutes,i=0;left>0;i++){const step=Math.min(360,left);split=await wait(f,split,step,`week-part:${i}`);left-=step;}
 // Published .1 competition + correction .2 gives K60*(1-.3*30/60)=51.
 // Births floor(3*1.5)=4 still fit; the published h2 wolf rate stays below
 // one kill. Four new S join the opening 20S/8I/2R.
 assert.equal(pool(long).born,4);assert.equal(pool(long).count,34);
 assert.deepEqual(pool(long).health,{S:24,I:8,R:2});
 for(const h of world.rules.wildlife.habitats)assert.deepEqual(long.state.records[`ecology:${h.id}`],split.state.records[`ecology:${h.id}`]);
 conserved(long);conserved(split);
});

test('fish disease deaths consume the same ledger reserve once',async()=>{
 const f=setup({fish:true});
 const actual=world.rules.wildlife.habitats.find(h=>h.id===f.habitat).location+'|item_live_fish|reserve';
 const after=await wait(f,f.document,240,'fish-day'),p=pool(after,f.target,f.habitat);
 assert.deepEqual(p.health,{S:18,I:5,R:5});assert.equal(p.diseaseDeaths,2);
 assert.equal(after.ledger.flows['sink:death|item_live_fish|population']-(f.document.ledger.flows['sink:death|item_live_fish|population']??0),2);
 assert.equal(f.document.ledger.accounts[actual]-after.ledger.accounts[actual],2);
 assert.deepEqual(reconcile(f.engine,after).mismatches,[]);conserved(after);
});

test('invalid S/I/R causes atomic rejection with no writes',async()=>{
 const f=setup(),p=pool(f.document);
 f.document=premise(f.engine,f.document,{facts:[{path:['state','records',key,'populations',species],value:{...p,health:{S:20,I:9,R:2}}}]});
 const before=structuredClone(f.document);
 await assert.rejects(wait(f,f.document,240,'bad-health'),/S\/I\/R/);
 assert.deepEqual(f.document,before);assert.equal(pool(f.document).count,30);
});

test('fishing and release transfer the same infected individual, without curing or copying it',async()=>{
 const f=setup({fish:true,infection:0,recovery:0,mortality:0}),h=world.rules.wildlife.habitats.find(h=>h.id===f.habitat),p=pool(f.document,f.target,f.habitat),rule=world.rules.extraction.fishing;
 f.document=premise(f.engine,f.document,{minute:540,location:h.location,inventory:{[rule.tool]:1,[rule.bait.item]:10},facts:[
  {path:['state','records',`ecology:${f.habitat}`,'populations',f.target],value:{...p,health:{S:0,I:30,R:0}}},
  // Ability is a declared non-examined premise; the native fishing check runs.
  {path:['state','player','attributes'],value:{...f.document.state.player.attributes,'敏捷':30,'智慧':30}}
 ]});
 const before=structuredClone(f.document);let out;
 for(let i=0;i<10;i++){
  out=await run(f,f.document,'world_field',{operation:'wildlife_fish',species:f.target},`infected-catch${i}`);
  f.document=out.document;if(out.result.success)break;
 }
 assert.equal(out.result.success,true);assert.equal(out.result.species,f.target);
 const unitId=out.result.obtained[0].instances[0];
 // 30 infected fish - 1 real catch = 29 in the pool, 1 held body.
 assert.equal(out.result.obtained[0].quantity,1);assert.deepEqual(pool(out.document,f.target,f.habitat).health,{S:0,I:29,R:0});
 assert.equal(out.document.state.itemInstances[unitId].populationHealth,'I');
 const invalid=premise(f.engine,out.document,{facts:[{path:['state','itemInstances',unitId,'populationHealth'],value:'invalid'}]}),snapshot=structuredClone(invalid);
 await assert.rejects(run(f,invalid,'world_field',{operation:'wildlife_release',target:unitId},'invalid-return'),/S\/I\/R/);
 assert.deepEqual(invalid,snapshot);assert.equal(invalid.state.inventory.item_live_fish.quantity,1);
 const released=await run(f,out.document,'world_field',{operation:'wildlife_release',target:unitId},'infected-return');
 // Return reverses that transfer, 29+1=30, without creating an S animal.
 assert.deepEqual(pool(released.document,f.target,f.habitat).health,{S:0,I:30,R:0});
 assert.equal(released.document.state.inventory.item_live_fish?.quantity??0,0);
 assert.equal(released.document.ledger.accounts[`${h.location}|item_live_fish|reserve`],before.ledger.accounts[`${h.location}|item_live_fish|reserve`]);
 assert.deepEqual(reconcile(f.engine,released.document).mismatches,[]);conserved(released.document);
 const stable=structuredClone(released.document);
 await assert.rejects(run(f,released.document,'world_field',{operation:'wildlife_release',target:unitId},'return-twice'),/held living fish/);
 assert.deepEqual(released.document,stable);
});

test('serialized disease accruals resume with the same native next-day result',async()=>{
 const f=setup(),first=await wait(f,f.document,1680,'first'),restored=JSON.parse(JSON.stringify(first));
 const a=await wait(f,first,1440,'next'),b=await wait(f,restored,1440,'next');
 // Day 3 carries .25 mortality credit: .25+3*.25=1 death;
 // recovery (3-1)*.5=1; infection .125+17*.75*3/60=.7625 -> 0.
 assert.deepEqual(pool(a).health,{S:17,I:1,R:8});assert.equal(pool(a).count,26);
 assert.deepEqual(a,b);conserved(a);
});

test('native tracking and aggregation preserve the recovered compartment',async()=>{
 const f=setup({fish:true,infection:0,recovery:0,mortality:0}),h=world.rules.wildlife.habitats.find(h=>h.id===f.habitat),p=pool(f.document,f.target,f.habitat);
 f.document=premise(f.engine,f.document,{minute:540,location:h.location,facts:[
  {path:['state','records',`ecology:${f.habitat}`,'populations',f.target],value:{...p,health:{S:0,I:0,R:30}}},
  {path:['state','player','attributes'],value:{...f.document.state.player.attributes,'敏捷':30,'智慧':30}}
 ]});
 let tracked;
 for(let i=0;i<10;i++){
  tracked=await run(f,f.document,'world_field',{operation:'wildlife_track',species:f.target},`recovered-track${i}`);
  f.document=tracked.document;if(tracked.result.success)break;
 }
 assert.equal(tracked.result.success,true);const id=tracked.result.found.id;
 // 30 recovered - one individual = 29 anonymous recovered; no new body.
 assert.deepEqual(pool(tracked.document,f.target,f.habitat).health,{S:0,I:0,R:29});
 assert.equal(tracked.document.state.creatures[id].populationHealth,'R');
 assert.equal(tracked.document.ledger.accounts[`${id}|item_live_fish|reserve`],1);
 const released=await run(f,tracked.document,'world_field',{operation:'wildlife_release',target:id},'recovered-return');
 assert.deepEqual(pool(released.document,f.target,f.habitat).health,{S:0,I:0,R:30});
 assert.equal(released.document.state.creatures[id],undefined);
 assert.equal(released.document.ledger.accounts[`${id}|item_live_fish|reserve`],0);
 assert.deepEqual(reconcile(f.engine,released.document).mismatches,[]);conserved(released.document);
});

test('native births enter S and weekly predation removes actual health subaccounts',async()=>{
 const f=setup({infection:0,recovery:0,mortality:0}),p=pool(f.document);
 f.document=premise(f.engine,f.document,{facts:[{path:['state','records',key,'populations',species],value:{...p,health:{S:0,I:30,R:0}}}]});
 const after=await wait(f,f.document,6*1440+240,'week');
 // S5-06 replaces the unconditional minimum weekly kill with Holling-II.
 // Births remain 3; with h2, four wolves give
 // (.25/60)*4*33/(1+(.25/60)*2*33)=.43137... < one kill.
 // credit, both below one body. No fractional animal may be consumed.
 assert.equal(pool(after).born,3);assert.equal(pool(after).predated,0);
 assert.equal(pool(after).count,33);assert.deepEqual(pool(after).health,{S:3,I:30,R:0});
 conserved(after);
});

test('native seasonal migration carries S/I/R through transit and into its real destination',()=>{
 const f=setup({infection:0,recovery:0,mortality:0}),deer='monster_brown_deer',p=pool(f.document,deer),migration=f.document.state.records['wildlife:migration'];
 // Historical date and pre-departure disease distribution are premises.
 // This is the production migration solver on the engine's native Draft;
 // background breeding/epidemic clocks are outside this transfer assertion.
 const document=premise(f.engine,f.document,{minute:269*1440+1200,facts:[
  {path:['state','records',key,'populations',deer],value:{...p,health:{S:15,I:10,R:5}}},
  {path:['state','records','wildlife:migration'],value:{...migration,lastDay:268}}
 ]});
 const d=f.engine.primitiveDraft(document);
 advanceSeasonalMigration(d,f.engine,269);
 const departed=structuredClone(d.document),transit=departed.state.records['wildlife:migration'].transit.find(t=>t.species===deer);
 // Published winter route fraction=.4: 30*.4=12, apportioned 6 S,4 I,2 R.
 assert.equal(transit.count,12);assert.deepEqual(transit.health,{S:6,I:4,R:2});
 assert.deepEqual(pool(departed,deer).health,{S:9,I:6,R:3});assert.equal(pool(departed,deer).count,18);
 const arriving=f.engine.primitiveDraft(departed);advanceSeasonalMigration(arriving,f.engine,270);
 const arrived=arriving.document;
 assert.deepEqual(pool(arrived,deer,'habitat_hw_field').health,{S:6,I:4,R:2});
 assert.equal(pool(arrived,deer,'habitat_hw_field').count,12);
 assert.equal(arrived.state.records['wildlife:migration'].transit.some(t=>t.species===deer),false);
 assert.deepEqual(document.state.records['wildlife:migration'].transit,[]);conserved(arrived);
});

test('closing real territory controls restores room but returns only accrued actual animals',async()=>{
 const f=setup({infection:0,recovery:0,mortality:0,territory:null}),goat='monster_bent_horn_goat';
 let document=await wait(f,f.document,240,'territory-opening');
 const origin='habitat_hw_field',p=pool(document,goat,origin);
 // Existing offspring history is a premise. The native controls, transfer,
 // closure and immigration solver are examined, without changing geography.
 document=premise(f.engine,document,{facts:[{path:['state','records',`ecology:${origin}`,'populations',goat],value:{...p,count:22,born:10,health:{S:0,I:22,R:0}}}]});
 const d=f.engine.primitiveDraft(document);advanceTerritoryMigration(d,f.engine,1);
 // Field K24 * published territory share .6 -> floor14.4=14.
 // Excess22-14=8 bodies go to the existing secondary wood range.
 assert.equal(pool(d.document,goat,origin).count,14);assert.equal(pool(d.document,goat).count,8);
 assert.deepEqual(pool(d.document,goat).health,{S:0,I:8,R:0});conserved(d.document);
 const field=f.engine.rules.wildlife.habitats.find(h=>h.id===origin),subjects=new Set([field.id,field.location,...f.engine.world.bosses.filter(b=>b.residence?.habitat===origin).map(b=>b.residence.id)]);
 for(const control of aliveHoldings(d,{kind:'controls'}).filter(h=>subjects.has(h.subject)))executeProtocolPrimitive(d,f.engine,{op:'holding.close',id:control.id,reason:'vacated'},{eventId:`close:${control.id}`});
 // Published .1/year * targetK24 * sourceN8 / sourceK24 / 360=1/450.
 // Keep day/year division rational: day449 gives 449/450 (zero bodies),
 // day450 exactly one. Closing controls does not mint the other nine spaces.
 for(let day=2;day<=450;day++)advanceTerritoryMigration(d,f.engine,day);
 assert.equal(pool(d.document,goat,origin).count,14);assert.equal(pool(d.document,goat).count,8);
 advanceTerritoryMigration(d,f.engine,451);
 assert.equal(pool(d.document,goat,origin).count,15);assert.equal(pool(d.document,goat).count,7);
 assert.deepEqual(pool(d.document,goat,origin).health,{S:0,I:15,R:0});conserved(d.document);
 assert.equal(pool(document,goat,origin).count,22); // input document unchanged.
});

test('published husbandry content uses native feed, birth, product and collection accounts',async()=>{
 // D05 §5.5: exercise the approved game content loaded by production.
 const w=structuredClone(world);
 const engine=new WorldEngine(w),f={engine},id='population_hw_home21_goats',rk=`husbandry:${id}`,milk='item_goat_milk',hair='item_raw_goat_hair';
 let document=premise(engine,engine.createCharacter(seed,{},'s506-herd'),{minute:1200});
 assert.equal(document.state.records[rk].count,4); // Actual authored opening, before first daily tick.
 const opening=document.state.records[rk],snapshot=structuredClone(document);
 await assert.rejects(run(f,document,'world_farm',{operation:'husbandry_collect',target:id,item:milk,quantity:1},'not-owner'));
 assert.deepEqual(document,snapshot);
 // The ordinary native ownership transfer supplies the actual permission.
 const transferred=engine.primitiveDraft(document);ensureHoldings(transferred,engine);
 const title=aliveHoldings(transferred,{kind:'owns',subject:id})[0];
 executeProtocolPrimitive(transferred,engine,{op:'holding.transfer',id:title.id,holder:'player'},{eventId:'give-herd'});
 document=premise(engine,transferred.document,{location:opening.location,inventory:{item_oats:4}});
 document=await wait(f,document,240,'herd-opening');
 const row=document.state.records[rk];
 // Four actual goats consume ceil(4*.25)=1 oats and yield 4*.25=1 milk.
 assert.equal(row.count,4);assert.equal(row.born,0);assert.equal(row.produce[milk],1);
 assert.equal(document.ledger.accounts[`${id}|population_monster_bent_horn_goat|population`],4);
 assert.equal(document.ledger.accounts[`${id}|${milk}|yield`],1);
 assert.equal(document.ledger.flows[`src:husbandry|${milk}|alive`],1);
 assert.deepEqual(reconcile(engine,document).mismatches,[]);
 // Feed and reproductive/productive history are non-examined premises.
 // Daily birth expectation 4*.25/360=1/360. Credit359/360 makes one body.
 document=premise(engine,document,{facts:[
  {path:['state','records',rk,'accruals','birth'],value:{numerator:'359',denominator:'360'}},
  {path:['state','records',rk,'accruals',`yield:${hair}`],value:{numerator:'99',denominator:'100'}}
 ]});
 document=await wait(f,document,1440,'herd-birth');
 assert.equal(document.state.records[rk].count,5);assert.equal(document.state.records[rk].born,1);
 assert.equal(document.state.records[rk].produce[milk],1); // yesterday's milk decayed, today's=1.
 assert.equal(document.ledger.flows[`sink:decay|${milk}|husbandry`],1);
 // Four heads/360=1/90; .99 old credit + 1/90 gives one raw hair.
 assert.equal(document.state.records[rk].produce[hair],1);
 assert.equal(document.ledger.flows[`src:husbandry|${hair}|alive`],1);
 assert.equal(document.state.inventory.item_oats.quantity,2);
 const inspect=husbandryCall('husbandry_inspect');
 const inspected=await run(f,document,inspect.tool,inspect.args,'inspect-herd');
 assert.equal(inspected.result.herds[0].target,id);assert.equal(inspected.result.herds[0].count,5);
 const collect=husbandryCall('husbandry_collect',{target:id,item:milk,quantity:1});
 const collected=await run(f,document,collect.tool,collect.args,'collect-milk');
 assert.equal(collected.result.success,true);assert.equal(collected.document.state.inventory[milk].quantity,1);
 assert.equal(collected.document.state.records[rk].produce[milk],0);
 const unit=collected.result.obtained[0].instances[0];
 assert.equal(collected.document.state.itemInstances[unit].minute,2880);
 assert.equal(collected.document.ledger.accounts[`${id}|population_monster_bent_horn_goat|population`],5);
 // D05 §5.5: a group cannot disappear through the single-object destroy path
 // while leaving five physical animals and their ledger reserve behind.
 const beforeDestroy=structuredClone(collected.document),frame=createRuntimePrimitiveFrame(engine,collected.document,{eventId:'destroy-herd',source:{kind:'catalog',id:'core:husbandry.collect'}});
 assert.throws(()=>commitPrimitives(collected.document,[{op:'destroy',entity:id}],frame),{code:'E-POPULATION-ADAPTER'});
 assert.deepEqual(collected.document,beforeDestroy);
 assert.equal(collected.document.state.records[rk].count,5);
 assert.deepEqual(reconcile(engine,collected.document).mismatches,[]);
 assert.deepEqual(auditHoldings(engine.primitiveDraft(collected.document)),[]);
 assert.deepEqual(holdingsDiscrepancies(engine,document,collected.document),[]);
 const stable=structuredClone(collected.document);
 await assert.rejects(run(f,stable,'world_farm',{operation:'husbandry_collect',target:id,item:milk,quantity:1},'collect-again'));
 assert.deepEqual(collected.document,stable);
 const resumed=JSON.parse(JSON.stringify(collected.document));
 assert.deepEqual(await wait(f,resumed,1435,'herd-next'),await wait(f,collected.document,1435,'herd-next'));
 const long=await wait(f,collected.document,2880,'herd-long');let split=collected.document;
 for(let i=0;i<48;i++)split=await wait(f,split,60,`herd-hour:${i}`);
 // Five heads next day consume ceil(5*.25)=2 remaining oats. The next
 // unfed day produces nothing and its one-day-old milk expires: 0 fresh milk.
 assert.equal(long.state.records[rk].count,5);assert.equal(long.state.records[rk].produce[milk],0);
 assert.equal(long.state.inventory.item_oats?.quantity??0,0);
 assert.deepEqual(long.state.records[rk],split.state.records[rk]);
 assert.deepEqual(long.ledger.accounts,split.ledger.accounts);assert.deepEqual(reconcile(engine,long).mismatches,[]);
});

test('eggs require actual fed birds and keep the same reserve when collected',async()=>{
 const w=structuredClone(world);
 const engine=new WorldEngine(w),f={engine},id='population_hw_home21_pheasants',egg='item_pheasant_egg',rk=`husbandry:${id}`;
 let document=premise(engine,engine.createCharacter(seed,{},'s506-eggs'),{minute:1200,inventory:{item_oats:2},location:'bld_hw_home_21'});
 const d=engine.primitiveDraft(document);ensureHoldings(d,engine);
 executeProtocolPrimitive(d,engine,{op:'holding.transfer',id:aliveHoldings(d,{kind:'owns',subject:id})[0].id,holder:'player'},{eventId:'give-birds'});
 document=await wait(f,d.document,1680,'two-fed-days');
 // Four birds*.25=1 egg/day, two days=2; ceil(4*.05)=1 oats/day.
 assert.equal(document.state.records[rk].count,4);assert.equal(document.state.records[rk].produce[egg],2);
 assert.equal(document.state.inventory.item_oats?.quantity??0,0);
 assert.equal(document.ledger.flows[`src:husbandry|${egg}|alive`],2);
 const collect=husbandryCall('husbandry_collect',{target:id,item:egg,quantity:2});
 const got=await run(f,document,collect.tool,collect.args,'collect-eggs');
 assert.equal(got.result.success,true);assert.equal(got.document.state.inventory[egg].quantity,2);
 assert.equal(got.document.state.records[rk].produce[egg],0);assert.equal(got.document.ledger.accounts[`${id}|${egg}|yield`],0);
 assert.deepEqual(got.result.obtained[0].instances.map(id=>got.document.state.itemInstances[id].minute),[1440,2880]);
 assert.deepEqual(reconcile(engine,got.document).mismatches,[]);
});

test('S/I/R subaccounts and fractional accruals survive storage restart/export/import',async t=>{
 // Use the project's per-process test root (R29), including in sandboxes where
 // the required system TEMP is outside the writable workspace. Assertions stay intact.
 const f=setup(),directory=await fs.mkdtemp(path.join(tmpRoot(),'s506-store-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(document,input)=>f.engine.reduce(document,input),store=new CampaignStorage(directory,{reducer});
 await store.create({id:'ecology',worldVersion:world.version,document:f.document});
 await store.transact('ecology',{id:'first',anchor:'a1',input:{tool:'world_time',args:{minutes:1680},eventId:'first'}},reducer);
 const saved=(await store.read('ecology')).document;
 assert.equal(pool(saved).count,27);assert.deepEqual(pool(saved).health,{S:17,I:3,R:7});
 assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('ecology')).document,saved);
 const imported=(await store.import(await store.export('ecology'),'copy')).document;
 assert.deepEqual(imported,saved);
 const original=await wait(f,saved,1440,'continue'),restored=await wait(f,imported,1440,'continue');
 assert.deepEqual(original,restored);conserved(original);
});
