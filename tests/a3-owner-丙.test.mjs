import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup,executeIntent} from '../tools/a3-score.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {physicalItem,writePhysicalItem,equipPhysicalItem,wornItems,purseAccount,consumeLiquid,containerUnits,validatePhysicalAction} from '../server-plugin/items.mjs';
import {setLocation,locationOf} from '../server-plugin/holdings.mjs';
import {environmentCatalog,environmentFeatures,writeEnvironmentPremise,prepareEnvironmentMagic,servantCarryWater} from '../server-plugin/environment.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {auditLedger,openLedger} from '../server-plugin/ledger.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world),initial=engine.initialFromLegacy(seed,'a3-owner-bing');
const home='bld_hw_qingdeng',npc='npc_hw_linsui';
const setup=x=>applyIntentSetup(engine,initial,{location:home,...x});
const generic=(id,facts={})=>({id,template:'thing',kind:'item',name:id,owner:'player',location:home,carriedBy:'player',...facts});
const catalog=(item,id=item,facts={})=>({...generic(id),item,inventoryBinding:{item,quantity:1,mode:'same_stock'},condition:100,...facts});
function books(document){
 assert.deepEqual(auditLedger(document.ledger),[]);
 for(const [key,n] of legacyStock(engine,document.state).balances)assert.equal(document.ledger.accounts[key],n,key);
 for(const [key,n] of legacyMoney(engine,document.state))assert.equal(document.ledger.accounts[key],n,key);
}
async function roundtrip(t,document,input,inspect){
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'a3-owner-bing-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(doc,call)=>engine.reduce(doc,call),store=new CampaignStorage(directory,{reducer,snapshotEvery:2});
 await store.create({id:'physical',worldVersion:world.version??'a3',document});
 if(input){const committed=await store.transact('physical',{id:'action',anchor:'a',input},reducer);inspect?.(committed.result);}
 const bundle=await store.export('physical'),reloaded=await new CampaignStorage(directory,{reducer}).read('physical');
 const imported=await store.import(JSON.parse(JSON.stringify(bundle)),'copy');
 assert.deepEqual(imported.document,reloaded.document);
 assert.deepEqual((await store.read('physical')).document,reloaded.document);
 books(reloaded.document);return reloaded.document;
}

test('J: native damage, contamination and toxicity affect repair/consumption and survive storage',async t=>{
 const out=setup({inventory:{item_ration:1,item_staff:1},itemInstances:[catalog('item_ration','food',{contaminated:true,toxic:false}),catalog('item_staff','staff',{condition:60,damage:{kind:'surface_hairline_crack'}})]});
 assert.deepEqual(out.setupUnmet,[]);
 const d=engine.primitiveDraft(out.document),food=out.bindings.food;
 assert.equal(physicalItem(d,engine,food).contaminated,true);
 assert.throws(()=>engine.itemDelta(d,'player','item_ration',-1,{flow:'sink:consume',purpose:'meal',writer:'daily-actions',eventId:'unsafe'}),/contaminated/);
 assert.equal(engine.quantity(d,'player','item_ration'),1);
 assert.doesNotThrow(()=>validatePhysicalAction(d,engine,'repair',{item:'item_staff'}));
 writePhysicalItem(d,engine,out.bindings.staff,{damage:{kind:'cracked_body'}});
 assert.throws(()=>validatePhysicalAction(d,engine,'repair',{item:'item_staff'}),/cracked/);
 assert.throws(()=>writePhysicalItem(d,engine,food,{toxic:'false'}),/Invalid/);
 assert.throws(()=>writePhysicalItem(d,engine,food,{coins:100}),/Unknown physical fact/);
 const saved=await roundtrip(t,d.document);
 assert.equal(physicalItem(engine.primitiveDraft(saved),engine,food).contaminated,true);
});

test('J: material, scale, appearance and attached laces constrain actual native actions',async t=>{
 const out=setup({itemInstances:[generic('shoe',{condition:0,wearable:false,attachedLaces:true,materialTraits:['old_shoe']}),generic('flower',{materialTraits:['flower'],toxic:false,medicinalEffect:false})],objects:[{id:'branch',template:'thing',kind:'node',name:'branch',owner:'player',location:home,reachable:true},{id:'gate',template:'thing',kind:'building',name:'gate',location:home,material:'stone',scale:'whole_city_gate',condition:40}]});
 assert.deepEqual(out.setupUnmet,[]);
 const d=engine.primitiveDraft(out.document);
 assert.throws(()=>validatePhysicalAction(d,engine,'repair',{instance:out.bindings.gate}),/stone city gate/);
 assert.throws(()=>equipPhysicalItem(d,engine,'player',out.bindings.shoe),/cannot be worn/);
 const tied=await engine.reduce(out.document,{tool:'environment',eventId:'tie-shoe',args:{operation:'tie',target:out.bindings.shoe,destination:out.bindings.branch}});
 assert.equal(tied.result.attachedTo,out.bindings.branch);
 const saved=await roundtrip(t,applyPatches(out.document,tied.patches));
 assert.equal(locationOf(engine.primitiveDraft(saved),out.bindings.shoe).at,out.bindings.branch);
 const bad=setup({itemInstances:[generic('bad',{toxic:1,damage:{kind:'invented'}})]});
 assert.ok(bad.setupUnmet.length);assert.equal(bad.bindings.bad,undefined);
 const ambiguous=setup({itemInstances:[generic('left',{name:'相同的小瓶',appearance:'identical_small_bottle'}),generic('right',{name:'相同的小瓶',appearance:'identical_small_bottle'})]});
 assert.deepEqual(ambiguous.setupUnmet,[]);
 assert.equal(createRoutingContext(engine,ambiguous.document).resolve('相同的小瓶').value,null);
});

test('K: nodes retain armed/lock/fire facts, reject forged outcomes and unauthorized modification',async t=>{
 const out=setup({inventory:{item_water:1},objects:[{...generic('fire',{fireIntensity:1}),kind:'node'},generic('lock',{locked:true,mechanism:'mechanical_lock'}),generic('trap',{armed:true,identified:true,mechanism:'tripwire_falling_log'})]});
 assert.deepEqual(out.setupUnmet,[]);
 const inspected=await engine.reduce(out.document,{tool:'environment',eventId:'inspect-lock',args:{target:out.bindings.lock}});
 assert.equal(inspected.result.physical.locked,true);
 await assert.rejects(engine.reduce(out.document,{tool:'environment',eventId:'forged',args:{operation:'unlock',target:out.bindings.lock,success:true}}),/outcome/);
 await assert.rejects(engine.reduce(out.document,{tool:'environment',eventId:'no-tool',args:{operation:'disarm',target:out.bindings.trap}}),/tool/);
 const saved=await roundtrip(t,out.document,{tool:'environment',eventId:'douse',args:{operation:'douse_fire',target:out.bindings.fire}});
 assert.equal(physicalItem(engine.primitiveDraft(saved),engine,out.bindings.fire).fireIntensity,0);
 assert.equal(engine.quantity(engine.primitiveDraft(saved),'player','item_water'),0);
 const other=setup({present:[npc],objects:[generic('other-fire',{owner:npc,fireIntensity:1})],inventory:{item_water:1}});
 await assert.rejects(engine.reduce(other.document,{tool:'environment',eventId:'unauthorized',args:{operation:'douse_fire',target:other.bindings['other-fire']}}));
 assert.ok(setup({objects:[{...generic('bad-fire'),kind:'node',fireIntensity:-1}]}).setupUnmet.length);
 const larger=engine.primitiveDraft(out.document);writePhysicalItem(larger,engine,out.bindings.fire,{fireIntensity:2});
 await assert.rejects(engine.reduce(larger.document,{tool:'environment',eventId:'too-large',args:{operation:'douse_fire',target:out.bindings.fire}}),/larger fires/);
 assert.equal(engine.quantity(larger,'player','item_water'),1);
 const source=engine.primitiveDraft(out.document);
 source.set(['state','records','forged-ignition'],{category:'world_event',id:'forged-ignition',verb:'ignited',minute:source.get('state','minute'),payload:{subject:'another_object',fireIntensity:1}});
 assert.throws(()=>writePhysicalItem(source,engine,out.bindings.fire,{fireIntensity:1},{source:'forged-ignition'}),/mismatched/);
});

test('L: worn slots are separate from custody, exclusive, validated and roundtrip through a real action',async t=>{
 const out=setup({inventory:{item_clothes:1},itemInstances:[catalog('item_clothes','shirt',{wornBy:'player',carriedBy:undefined,moisture:60})]});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.shirt,d=engine.primitiveDraft(out.document);
 assert.deepEqual(wornItems(d,engine,'player'),{body:id});
 assert.equal(locationOf(d,id).mode,'carried');
 assert.throws(()=>equipPhysicalItem(d,engine,npc,id),/carried/);
 assert.throws(()=>equipPhysicalItem(d,engine,'player',id,{slot:'imaginary'}),/slot/);
 const saved=await roundtrip(t,out.document,{tool:'environment',eventId:'unwear',args:{operation:'unwear',target:id}});
 assert.deepEqual(wornItems(engine.primitiveDraft(saved),engine,'player'),{});
 assert.equal(engine.quantity(engine.primitiveDraft(saved),'player','item_clothes'),1);
 const occupied=setup({itemInstances:[generic('one',{wornBy:'player',wearable:true}),generic('two',{wornBy:'player',wearable:true})]});
 assert.ok(occupied.setupUnmet.some(u=>/occupied/.test(u.reason)));
});

test('K: a native mechanism action uses the registered physical check and persists its actual outcome',async t=>{
 // 05 §5.4 / 06 §6.3: the S consumer now requires its native practical premise.
 // Keep the physical/check assertions and prove that an untrained actor fails.
 const premise={inventory:{item_smith_tongs:1},objects:[{...generic('checked_trap',{armed:true,identified:true,mechanism:'tripwire_falling_log'}),kind:'node'}]};
 const untrained=setup(premise);
 await assert.rejects(engine.reduce(untrained.document,{tool:'world_act',eventId:'untrained-disarm',args:{action:'core:site.disarm',slots:{target:untrained.bindings.checked_trap}}}),{code:'E-DISARM-KNOWLEDGE'});
 const out=setup({...premise,abilitiesByActor:{player:{practicalKnowledge:['simple_tripwire_disassembly']}}});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.checked_trap,saved=await roundtrip(t,out.document,{tool:'world_act',eventId:'native-disarm',args:{action:'core:site.disarm',slots:{target:id}}},result=>{
  assert.equal(result.receipt.routed,'core:site.disarm');
  assert.equal(result.success,result.check.success);
  if(result.success)assert.ok(result.receipt.applied.some(e=>e.op==='fact.set'&&e.entity===id&&e.field==='armed'&&e.value===false));
 });
 const check=saved.state.checks['native-disarm'];
 assert.equal(typeof check.success,'boolean');
 assert.equal(physicalItem(engine.primitiveDraft(saved),engine,id).armed,!check.success);
});

test('M: unknown liquid aliases have one original account and no invented water or nutrition',async t=>{
 const out=setup({itemInstances:[generic('bottle',{appearance:'identical_small_bottle',contents:[{resourceAlias:'unknown_drink',quantity:1,drinkable:true,identityKnownToPlayer:false}]})]});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.bottle,key=`${id}|unknown_drink|contents`;
 assert.equal(out.document.ledger.accounts[key],1);
 const inspected=await engine.reduce(out.document,{tool:'environment',eventId:'liquid-view',args:{target:id}});
 assert.deepEqual(inspected.result.contents,[{quantity:1,drinkable:true,identity:'unknown'}]);
 assert.throws(()=>consumeLiquid(engine.primitiveDraft(out.document),engine,id,'item_water',1),/No such/);
 const saved=await roundtrip(t,out.document,{tool:'environment',eventId:'drink',args:{operation:'drink_contents',target:id,resource:'unknown_drink'}});
 assert.equal(saved.ledger.accounts[key],0);
 assert.equal(saved.state.inventory.item_water,undefined);
 assert.ok(setup({itemInstances:[generic('bad',{contents:[{resourceAlias:'fake|account',quantity:1,drinkable:true,identityKnownToPlayer:false}]})]}).setupUnmet.length);
});

test('M: same_stock container contents and purse retain original resources without duplication',async t=>{
 const out=setup({present:[npc],inventory:{item_wood:2},itemInstances:[generic('crate',{contents:[{inventoryBinding:{item:'item_wood',quantity:2,mode:'same_stock'}}]}),generic('purse',{owner:npc,carriedBy:npc,access:'loose_open'})]});
 assert.deepEqual(out.setupUnmet,[]);
 const d=engine.primitiveDraft(out.document),purse=out.bindings.purse;
 assert.equal(purseAccount(d,engine,purse),`${npc}|coin_river|purse`);
 assert.equal(engine.quantity(d,'player','item_wood'),0);
 const units=containerUnits(d,out.bindings.crate);assert.equal(units.length,2);
 const saved=await roundtrip(t,out.document,{tool:'environment',eventId:'take',args:{operation:'take_contents',target:out.bindings.crate,instance:units[0].id}});
 assert.equal(engine.quantity(engine.primitiveDraft(saved),'player','item_wood'),1);
 assert.equal(containerUnits(engine.primitiveDraft(saved),out.bindings.crate).length,1);
 const forged=engine.primitiveDraft(out.document);setLocation(forged,{entity:purse,at:'player',mode:'carried',writer:'items',engine});
 assert.throws(()=>purseAccount(forged,engine,purse),/forged/);
});

test('M: purse access and original account authority control actual cash transfer',async t=>{
 const out=setup({present:[npc],coins:10,itemInstances:[generic('own_purse',{access:'loose_open'})]});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.own_purse,before=out.document.state.npcs[npc].coins;
 const saved=await roundtrip(t,out.document,{tool:'environment',eventId:'pay',args:{operation:'transfer_purse',target:id,to:npc,coins:3}});
 assert.equal(saved.state.player.coins,7);assert.equal(saved.state.npcs[npc].coins,before+3);
 const closed=engine.primitiveDraft(out.document);writePhysicalItem(closed,engine,id,{access:'sealed'});
 await assert.rejects(engine.reduce(closed.document,{tool:'environment',eventId:'closed',args:{operation:'transfer_purse',target:id,to:npc,coins:3}}),/not open/);
 const borrowed=setup({present:[npc],itemInstances:[generic('borrowed_purse',{owner:'player',carriedBy:npc,access:'loose_open'})]});
 await assert.rejects(engine.reduce(borrowed.document,{tool:'environment',eventId:'borrowed',args:{operation:'transfer_purse',target:borrowed.bindings.borrowed_purse,to:'player',coins:1}}));
});

test('M: one original water portion is exactly 250 ml, with no duplicate default fill or second withdrawal',async t=>{
 const bucket='feature_hw_kitchen_bucket',other=environmentFeatures(engine).find(f=>f.kind==='container'&&f.id!==bucket);
 assert.ok(other);
 const out=setup({inventory:{item_water:1},objects:[{id:bucket,carriedBy:'player',contents:[{inventoryBinding:{item:'item_water',quantity:1,mode:'same_stock'}}]},{id:other.id,carriedBy:'player',location:home,waterLiters:0}],holdings:[bucket,other.id].map((subject,i)=>({id:`water_owner_${i}`,kind:'owns',holder:'player',subject,terms:{share:1}}))});
 assert.deepEqual(out.setupUnmet,[]);
 const id=containerUnits(engine.primitiveDraft(out.document),bucket)[0].id;
 assert.equal(environmentCatalog(engine,out.document,{entity:bucket}).waterMl,250);
 const taken=await roundtrip(t,out.document,{tool:'environment',eventId:'take-water',args:{operation:'take_contents',target:bucket,instance:id}});
 assert.equal(environmentCatalog(engine,taken,{entity:bucket}).waterMl,0);
 assert.equal(engine.quantity(engine.primitiveDraft(taken),'player','item_water'),1);
 assert.equal(taken.state.itemInstances[id].liquid.waterMl,250);
 const d=engine.primitiveDraft(out.document),flow=servantCarryWater.call(engine,d,{source:bucket,destination:other.id,millilitres:75},75);
 assert.equal(flow.sourceRemainingMl,175);assert.equal(flow.destinationWaterMl,75);
 assert.equal(d.get('state','itemInstances',id,'status'),'散装液体');
 assert.equal(d.get('ledger','accounts',`${bucket}|item_water|placed`),0);
 await assert.rejects(engine.reduce(d.document,{tool:'environment',eventId:'double-water',args:{operation:'take_contents',target:bucket,instance:id}}),/not accessible/);
 await roundtrip(t,d.document);
});

test('Y: moved catalog endpoints resolve and environment consumers read their effective location',async t=>{
 const out=setup({location:'loc_hw_dock',objects:[{id:'feature_hw_kitchen_bucket',location:'loc_hw_dock',waterLiters:0,capacityLiters:10}]});
 assert.deepEqual(out.setupUnmet,[]);
 const id='feature_hw_kitchen_bucket';
 assert.equal(createRoutingContext(engine,out.document).resolve(id).value,id);
 assert.equal(environmentCatalog(engine,out.document,{entity:id}).waterMl,0);
 assert.equal(environmentFeatures(engine,out.document).find(f=>f.id===id).location,'loc_hw_dock');
 assert.ok(Number.isFinite(engine.magicTargetFacts(engine.primitiveDraft(out.document),id)?.distanceMeters));
 const saved=await roundtrip(t,out.document,{tool:'environment',eventId:'look-bucket',args:{target:id}});
 assert.equal(environmentFeatures(engine,saved).find(f=>f.id===id).location,'loc_hw_dock');
 const d=engine.primitiveDraft(saved),before=structuredClone(d.document);
 assert.throws(()=>writeEnvironmentPremise(d,engine,id,{location:'unknown'}),/Unknown/);
 assert.deepEqual(d.document,before);
 const remote=setup({objects:[{id,location:'loc_hw_dock'}]});
 assert.equal(createRoutingContext(engine,remote.document).resolve(id).value,null);
 const owned=setup({location:'loc_hw_dock',objects:[{id,location:'loc_hw_dock',waterLiters:1,owner:'player'}],holdings:[{id:'owned_bucket',kind:'owns',holder:'player',subject:id,terms:{share:1}}]});
 assert.deepEqual(owned.setupUnmet,[]);
 const spell=engine.byId.get('spell_water_02'),prepared=prepareEnvironmentMagic.call(engine,engine.primitiveDraft(owned.document),spell,{target:id});
 assert.equal(prepared.target,id);
 assert.equal(environmentCatalog(engine,owned.document,{entity:id}).owner,'player');
});

test('spatial: native co-presence suffices for sight/hearing, while contradictions and rays remain S4',()=>{
 const position={observer:'player',target:npc,distanceMeters:2,lineOfSight:true,audible:true};
 const out=setup({present:[npc],positions:[position]});assert.deepEqual(out.setupUnmet,[]);
 assert.equal(engine.magicTargetFacts(engine.primitiveDraft(out.document),npc),null);
 assert.ok(setup({present:[npc],positions:[{...position,audible:false}]}).setupUnmet.length);
 assert.ok(setup({present:[npc],positions:[{...position,distanceMeters:8,rayMeters:[[0,0],[8,0]]}]}).setupUnmet.length);
 assert.ok(setup({present:[npc],actorStates:{[npc]:{location:'loc_hw_dock'}},positions:[position]}).setupUnmet.some(u=>u.item==='positions[0]'));
 const trap={...generic('near_trap',{armed:true,identified:true,mechanism:'tripwire_falling_log'}),carriedBy:undefined,kind:'node'};
 assert.ok(setup({objects:[trap],positions:[{observer:'player',target:'near_trap',distanceMeters:.5,lineOfSight:true}]}).setupUnmet.some(u=>u.item==='positions[0]'));
});

test('J/M: an explicit original generic item is consumed once by the real mark proposal and roundtrips',async t=>{
 const rows=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8')),row=rows.find(r=>r.id==='A3V2-117');
 const run=await executeIntent(engine,initial,row);
 assert.deepEqual(run.setupUnmet,[]);assert.equal(run.actual.committed,true);
 const shoe=Object.values(run.document.state.itemInstances).find(u=>u.physicalOnly&&u.item.includes('old_shoe'));
 assert.equal(engine.scoped(run.document).world.balance,engine.world.balance);
 assert.equal(shoe.status,'已消耗');
 assert.equal(run.document.ledger.accounts[`player|${shoe.item}|inventory`],0);
 assert.equal(createRoutingContext(engine,run.document).resolve(shoe.id).value,null);
 assert.ok(run.effects.some(e=>e.op==='create'&&e.kind==='mark'&&e.tags.includes('mark:memorial')));
 assert.ok(run.actual.reactions>0);
 const saved=await roundtrip(t,run.before,run.submitted);
 assert.deepEqual(saved,JSON.parse(JSON.stringify(run.document)));
});
