import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {aliveHoldings,locationOf,located,auditHoldings} from '../server-plugin/holdings.mjs';
import {heldUnit,physicalItem} from '../server-plugin/items.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import {derivedStats} from '../server-plugin/combat.mjs';
import {environmentCatalog,environmentFeatures} from '../server-plugin/environment.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world),initial=engine.initialFromLegacy(seed,'a3-setup-physical');
const home='bld_hw_qingdeng',npc='npc_hw_linsui';
const setup=input=>applyIntentSetup(engine,initial,{location:home,...input});
const instance=(overrides={})=>({id:'scene_staff',template:'thing',kind:'item',item:'item_staff',owner:'player',location:home,inventoryBinding:{mode:'same_stock',item:'item_staff',quantity:1},...overrides});
const fields=['itemInstances','objects','zones','paths','placements','positions','obstacles','hazards','body','actorStates'];
function books(document){
 assert.deepEqual(auditLedger(document.ledger),[]);
 assert.deepEqual(auditHoldings(engine.primitiveDraft(document),engine),[]);
 const stock=legacyStock(engine,document.state);
 for(const [key,value] of stock.balances)assert.equal(document.ledger.accounts[key],value,key);
}

test('physical: same_stock tracks one original unit, maps condition and keeps stock unchanged',()=>{
 const before=structuredClone(initial),out=setup({inventory:{item_staff:1},itemInstances:[instance({condition:60,carriedBy:'player'})]});
 assert.deepEqual(out.setupUnmet,[]);
 assert.deepEqual(initial,before);
 const unit=out.document.state.itemInstances[out.bindings.scene_staff],d=engine.primitiveDraft(out.document);
 assert.equal(unit.item,'item_staff');assert.equal(unit.owner,'player');
 assert.equal(unit.durability,Math.round(unit.maxDurability*.6));
 assert.equal(heldUnit(d,engine,'player','item_staff').durability,unit.durability);
 assert.equal(engine.quantity(d,'player','item_staff'),1);
 assert.deepEqual(out.document.state.inventory.item_staff.instances,[unit.id]);
 assert.equal(aliveHoldings(d,{kind:'owns',subject:unit.id})[0].holder,'player');
 assert.equal(locationOf(d,unit.id).mode,'carried');
 assert.equal(out.document.ledger.accounts['player|item_staff|inventory'],1);
 books(out.document);
});

test('physical: same_stock detaches the same unit without adding a second placed resource',()=>{
 const out=setup({inventory:{item_staff:1},itemInstances:[instance({carriedBy:null,condition:60})]});
 assert.deepEqual(out.setupUnmet,[]);
 const unit=out.document.state.itemInstances[out.bindings.scene_staff],d=engine.primitiveDraft(out.document);
 assert.equal(engine.quantity(d,'player','item_staff'),0);
 assert.equal(out.document.ledger.accounts['player|item_staff|inventory']??0,0);
 assert.equal(out.document.ledger.accounts[`${home}|item_staff|placed`],1);
 assert.equal(locationOf(d,unit.id).mode,'place');assert.equal(unit.status,'封存');
 assert.equal(aliveHoldings(d,{kind:'owns',subject:unit.id})[0].holder,'player');
 books(out.document);
});

test('physical: native custody and legal title remain distinct for borrowed tools',()=>{
 const out=setup({present:['npc_hw_ayan'],inventory:{item_staff:1},itemInstances:[instance({owner:'npc_hw_ayan',carriedBy:'player'})]});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.scene_staff,d=engine.primitiveDraft(out.document);
 assert.equal(out.document.state.itemInstances[id].owner,'player');
 assert.equal(aliveHoldings(d,{kind:'owns',subject:id})[0].holder,'npc_hw_ayan');
 assert.equal(locationOf(d,id).at,'player');books(out.document);
});

test('physical: moisture is retained as actual inventory moisture, never dry-by-default',()=>{
 const out=setup({inventory:{item_staff:1},itemInstances:[instance({moisture:60})]});
 assert.deepEqual(out.setupUnmet,[]);assert.equal(out.document.state.inventory.item_staff.moisture,60);
 const dry=setup({inventory:{item_staff:1},itemInstances:[instance({moisture:0})]});
 assert.deepEqual(dry.setupUnmet,[]);assert.equal(dry.document.state.inventory.item_staff.moisture,0);
});

test('physical: catalog originals outside inventory open one native placed unit and one legal title',()=>{
 const out=setup({itemInstances:[instance({inventoryBinding:undefined,location:'bld_bs_inn',condition:40})]});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.scene_staff,unit=out.document.state.itemInstances[id];
 assert.equal(unit.status,'封存');assert.equal(unit.location,'bld_bs_inn');
 assert.equal(unit.durability,Math.round(unit.maxDurability*.4));
 assert.equal(out.document.ledger.accounts['bld_bs_inn|item_staff|placed'],1);
 assert.equal(createRoutingContext(engine,out.document).resolve(id).value,null);
 books(out.document);
});

test('physical: catalog originals held by NPCs reuse native inventory and bank custody is not ownership',()=>{
 const held=setup({present:[npc],itemInstances:[instance({inventoryBinding:undefined,carriedBy:npc,owner:npc})]});
 assert.deepEqual(held.setupUnmet,[]);
 const d=engine.primitiveDraft(held.document),id=held.bindings.scene_staff;
 assert.equal(held.document.state.itemInstances[id].owner,npc);
 assert.equal(held.document.state.npcs[npc].inventory.item_staff.instances.filter(x=>x===id).length,1);
 books(held.document);
 const bank=setup({location:'bld_hw_post',itemInstances:[instance({inventoryBinding:undefined,location:'bld_hw_post',carriedBy:'bank_hw_post'})]});
 assert.deepEqual(bank.setupUnmet,[]);
 const bankId=bank.bindings.scene_staff,bankDraft=engine.primitiveDraft(bank.document);
 assert.equal(bank.document.state.itemInstances[bankId].status,'保管');
 assert.equal(bank.document.ledger.accounts['bank_hw_post|item_staff|placed'],1);
 assert.equal(aliveHoldings(bankDraft,{kind:'owns',subject:bankId})[0].holder,'player');
 assert.equal(locationOf(bankDraft,bankId).at,'bld_hw_post');books(bank.document);
});

test('physical: objects.contents moves the original stock into the same crate without counting it twice',()=>{
 const out=setup({inventory:{item_staff:1,item_wood:2},itemInstances:[instance({carriedBy:null})],objects:[
  {id:'scene_staff',contents:[{inventoryBinding:{item:'item_wood',quantity:2,mode:'same_stock'},weightKg:4}]},
 ]});
 assert.deepEqual(out.setupUnmet,[]);
 const container=out.bindings.scene_staff,d=engine.primitiveDraft(out.document);
 assert.equal(engine.quantity(d,'player','item_wood'),0);
 assert.equal(out.document.ledger.accounts[`${container}|item_wood|placed`],2);
 const units=Object.values(out.document.state.itemInstances).filter(u=>u.container===container);
 assert.equal(units.length,2);
 for(const unit of units){assert.equal(unit.status,'袋内');assert.equal(locationOf(d,unit.id).at,container);}
 assert.equal(Object.values(out.document.state.itemInstances).filter(u=>u.item==='item_staff').length,1);
 books(out.document);
 const invalid=setup({inventory:{item_staff:1,item_wood:1},itemInstances:[instance({carriedBy:null})],objects:[{id:'scene_staff',contents:[{inventoryBinding:{item:'item_wood',quantity:2,mode:'same_stock'}}]}]});
 assert.ok(invalid.setupUnmet.some(u=>u.item==='objects[0].contents[0]'));
 assert.equal(engine.quantity(engine.primitiveDraft(invalid.document),'player','item_wood'),1);
});

test('physical: a generic item uses one native entity, legal holding and carrier location',()=>{
 const out=setup({itemInstances:[{id:'old_shoe',template:'thing',kind:'item',name:'旧鞋',owner:'player',location:home,carriedBy:'player',condition:0}]});
 assert.deepEqual(out.setupUnmet,[]);
 const id=out.bindings.old_shoe,d=engine.primitiveDraft(out.document);
 assert.equal(id,'item_old_shoe');assert.equal(out.document.holdings.entities[id].facts.condition,0);
 assert.equal(createRoutingContext(engine,out.document).resolve('旧鞋','item').value,id);
 assert.equal(located(d,id,x=>x==='player'?home:null),home);
 assert.equal(aliveHoldings(d,{kind:'owns',subject:id})[0].holder,'player');
 assert.equal(out.document.state.inventory[id],undefined);books(out.document);
});

test('physical: illegal and duplicate bindings never increase stock or manufacture identity',()=>{
 for(const bad of [instance({item:'missing_item'}),instance({condition:101}),instance({name:{text:'invalid'}}),instance({carriedBy:4}),instance({inventoryBinding:{item:'item_water',quantity:1,mode:'same_stock'}})]){
  const out=setup({inventory:{item_staff:1},itemInstances:[bad]});assert.ok(out.setupUnmet.length);assert.equal(out.bindings.scene_staff,undefined);
 }
 const absent=setup({inventory:{item_staff:0},itemInstances:[instance()]});assert.ok(absent.setupUnmet.some(u=>u.item==='itemInstances[0]'));
 const duplicate=setup({inventory:{item_staff:2},itemInstances:[instance(),instance({id:'second_staff'})]});
 assert.ok(duplicate.setupUnmet.some(u=>u.item==='itemInstances[1]'));
 assert.equal(Object.keys(duplicate.document.state.itemInstances??{}).length,1);
 assert.equal(duplicate.document.state.inventory.item_staff.quantity,2);
});

test('physical: water initial state uses the existing feature, preserving unspecified contamination',()=>{
 const before=structuredClone(world),feature=environmentFeatures(engine).find(f=>f.id==='feature_hw_kitchen_bucket');
 const out=setup({objects:[{id:feature.id,location:home,owner:npc,waterLiters:8,turbidity:55}]});
 assert.deepEqual(out.setupUnmet,[]);
 const state=out.document.state.records[`physical_feature:${feature.id}`].state;
 assert.equal(state.waterMl,8000);assert.equal(state.turbidity,55);
 for(const key of ['toxinUg','saltMg','pathogenRisk','odor'])assert.equal(state[key],feature.state[key],key);
 assert.equal(environmentCatalog(engine,out.document,{entity:feature.id}).waterMl,8000);
 assert.equal(out.bindings[feature.id],feature.id);assert.deepEqual(world,before);books(out.document);
});

test('physical: available capacity and channel connections feed the existing environment consumers',()=>{
 const out=setup({location:'loc_hw_dock',objects:[
  {id:'feature_hw_pool',location:'loc_hw_dock',waterLiters:30},
  {id:'feature_hw_channel',location:'loc_hw_dock',fromObject:'feature_hw_pool',toObject:'feature_hw_plot',blockagePercent:0},
  {id:'feature_hw_plot',location:'loc_hw_dock',waterLiters:0,availableCapacityLiters:20},
 ]});
 assert.deepEqual(out.setupUnmet,[]);
 assert.equal(environmentCatalog(engine,out.document,{entity:'feature_hw_plot'}).capacityMl,20000);
 assert.equal(environmentCatalog(engine,out.document,{entity:'feature_hw_pool'}).waterMl,30000);
 assert.equal(environmentCatalog(engine,out.document,{entity:'feature_hw_channel'}).blockagePercent,0);
 books(out.document);
});

test('physical: invalid water state is atomic, and moving a catalog feature cannot fake new physics or ownership',()=>{
 for(const properties of [{waterLiters:-1},{waterLiters:'8'},{waterLiters:11},{capacityLiters:0},{turbidity:101},{waterLiters:8.0001}]){
  const out=setup({objects:[{id:'feature_hw_kitchen_bucket',...properties}]});
  assert.ok(out.setupUnmet.length,JSON.stringify(properties));
  assert.equal(out.document.state.records['physical_feature:feature_hw_kitchen_bucket'],initial.state.records?.['physical_feature:feature_hw_kitchen_bucket']);
 }
 const moved=setup({objects:[{id:'feature_hw_kitchen_bucket',location:'loc_hw_dock',owner:'player',carriedBy:'player',sourceEvent:'unknown_history'}]});
 // Y now restores placement through the native location protocol. An unknown
 // historical source and unbacked title still fail (01 §1.2–1.3 / 04 §4.2).
 for(const key of ['owner','sourceEvent'])assert.ok(moved.setupUnmet.some(u=>u.item===`objects[0].${key}`),key);
 assert.deepEqual(moved.document.holdings?.locations?.feature_hw_kitchen_bucket,initial.holdings?.locations?.feature_hw_kitchen_bucket);
 const valid=setup({location:'loc_hw_dock',objects:[{id:'feature_hw_kitchen_bucket',location:'loc_hw_dock',carriedBy:'player'}]});
 assert.deepEqual(valid.setupUnmet,[]);
 assert.equal(environmentFeatures(engine,valid.document).find(f=>f.id==='feature_hw_kitchen_bucket').location,'loc_hw_dock');
 assert.equal(environmentFeatures(engine,valid.document).find(f=>f.id==='feature_hw_kitchen_bucket').owner,npc);
 assert.equal(environmentFeatures(engine).find(f=>f.id==='feature_hw_kitchen_bucket').owner,npc);
});

test('physical: native object identity, locks and small fire reach physical consumers',()=>{
 const bed={id:'bed',template:'thing',kind:'item',name:'已租床位',location:home};
 const out=setup({objects:[bed,{...bed,id:'cell_lock',locked:true,mechanism:'mechanical_lock'}]});
 assert.equal(createRoutingContext(engine,out.document).resolve('bed','item').value,'item_bed');
 assert.equal(Object.keys(out.document.holdings.entities).filter(id=>id==='item_bed').length,1);
 // K's implemented facts are consumed by physical action validation (06 §6.3).
 assert.deepEqual(out.setupUnmet,[]);
 assert.equal(physicalItem(engine.primitiveDraft(out.document),engine,out.bindings.cell_lock).locked,true);
 const fire=setup({objects:[{id:'fire',template:'thing',kind:'node',name:'微火',location:home,fireIntensity:1}]});
 assert.deepEqual(fire.setupUnmet,[]);
 assert.equal(physicalItem(engine.primitiveDraft(fire.document),engine,fire.bindings.fire).fireIntensity,1);
 assert.ok(setup({objects:[{id:'bad_fire',template:'thing',kind:'node',name:'bad',location:home,fireIntensity:-1}]}).setupUnmet.length);
 const bad=setup({objects:[{id:'bad'}]});assert.ok(bad.setupUnmet.length);
});

// Every spatial field has a valid declaration and an invalid shape. Existing
// native perception is verified; new geometry still requires an S4 connector.
const spatialExamples={
 zones:{id:'zone_a',name:'门内',location:home},
 paths:{id:'path_a',fromZone:'zone_a',toZone:'zone_b',distanceMeters:1,passable:false,blockedBy:'lock_a'},
 placements:{entity:'player',zone:'zone_a'},
 positions:{observer:'player',target:npc,distanceMeters:2,lineOfSight:true,audibleTo:['player',npc]},
 obstacles:{id:'wall_a',kind:'stone_wall',segmentMeters:[[2,1],[6,1]]},
 hazards:{id:'rocks_a',zone:'zone_b',kind:'falling_rocks',active:true},
};
for(const [field,row] of Object.entries(spatialExamples))test(`physical: ${field} ${field==='positions'?'verifies existing native perception':'diagnoses valid missing native geometry'} and rejects invalid input`,()=>{
 const out=setup({[field]:[row]});
 // The positions connector can verify already available native perception;
 // it does not create coordinates/contact or disable a range boundary.
 if(field==='positions'){
  assert.deepEqual(out.setupUnmet,[]);
  assert.ok(setup({positions:[{...row,lineOfSight:false}]}).setupUnmet.length);
 }else {assert.equal(out.setupUnmet.length,1);assert.match(out.setupUnmet[0].reason,/缺少原生接点.*S4/);}
 assert.equal(out.document.state[field],initial.state[field]);
 assert.deepEqual(out.document.state.records,initial.state.records);
 const invalid=setup({[field]:[{}]});assert.match(invalid.setupUnmet[0].reason,/invalid/);
});

test('physical: spatial declarations cannot forge contact, expand listeners or bypass custody',()=>{
 const out=setup({positions:[spatialExamples.positions],paths:[spatialExamples.paths]});
 const d=engine.primitiveDraft(out.document);
 assert.equal(engine.magicTargetFacts(d,npc),null);
 assert.equal(Object.values(out.document.state.records).some(r=>r.category==='physical_contact'),false);
 const invalid=setup({positions:[{...spatialExamples.positions,rayMeters:[[0,0],[8,0]]}]});
 assert.match(invalid.setupUnmet[0].reason,/invalid/);
});

test('physical: body scales use native timed facts and real maxima without healing outcomes',()=>{
 const maximum=initial.state.player.maxMp;
 const out=setup({body:{self:{mp:maximum-1,hpDeficit:4,satiety:30,stamina:60,fatigue:40,hydration:50}}});
 assert.deepEqual(out.setupUnmet,[]);
 for(const [key,value] of Object.entries({satiety:30,stamina:60,fatigue:40,hydration:50})){
  assert.equal(readBodyNeed(engine,out.document,'player',key),value);
  assert.equal(out.document.state.player.body[key].asOf,out.document.state.minute);
 }
 assert.equal(out.document.state.player.mp,maximum-1);assert.equal(out.document.state.player.hp,out.document.state.player.maxHp-4);
 assert.equal(out.document.state.records['heal:player'],undefined);books(out.document);
});

test('physical: initial level derives native caps without granting experience; NPC deficit uses native derived maxHp',()=>{
 const out=setup({present:[npc],body:{player:{hpDeficit:4,level:1},[npc]:{hpDeficit:4,conscious:true}}});
 assert.deepEqual(out.setupUnmet,[]);
 const expected=derivedStats({...initial.state.player,level:1},engine.rules);
 assert.equal(out.document.state.player.level,1);assert.equal(out.document.state.player.maxHp,expected.maxHp);
 assert.equal(out.document.state.player.hp,expected.maxHp-4);assert.equal(out.document.state.player.xp,initial.state.player.xp);
 const maximum=derivedStats({level:engine.byId.get(npc).level??1,attributes:engine.byId.get(npc).attributes},engine.rules).maxHp;
 assert.equal(out.document.state.npcs[npc].hp,maximum-4);
});

test('physical: illegal bodies stay unmet instead of clamping, reviving or overriding carry/age identity',()=>{
 for(const body of [{stamina:-1},{fatigue:101},{mp:initial.state.player.maxMp+1},{hpDeficit:-4},{conscious:'yes'},{level:1.5}]){
  const out=setup({body:{player:body}});assert.ok(out.setupUnmet.length);assert.deepEqual(out.document.state.player,initial.state.player);
 }
 for(const body of [{player:{safeCarryKg:3}},{[npc]:{age:1000}},{player:{conscious:false}},{unknown:{mp:1}}])assert.ok(setup({body}).setupUnmet.length);
});

test('physical: actor initial activity and location use native writes without granting services',()=>{
 // This actor is explicitly elsewhere, so do not also declare him present.
 const out=setup({actorStates:{[npc]:{activity:'整理船绳',location:'loc_hw_dock'}}});
 assert.deepEqual(out.setupUnmet,[]);
 assert.equal(out.document.state.npcs[npc].activity,'整理船绳');assert.equal(out.document.state.npcs[npc].location,'loc_hw_dock');
 assert.equal(locationOf(engine.primitiveDraft(out.document),npc).at,'loc_hw_dock');
 assert.equal(out.document.state.npcs[npc].services,undefined);
 const conflict=setup({present:[npc],actorStates:{[npc]:{location:'loc_hw_dock'}}});
 assert.ok(conflict.setupUnmet.some(u=>u.item===`present.${npc}`));
 const bad=setup({actorStates:{[npc]:{location:'unknown',activity:''},unknown:{activity:'忙碌'}}});
 assert.equal(bad.setupUnmet.length,3);
});

test('physical: native teaching flags and unsupported attention/orientation never imply consent',()=>{
 const out=setup({present:[npc],actorStates:{[npc]:{teachingBusy:false,facingAway:true,hearingActive:true,alertness:'normal',attention:'market_stall',demonstrating:false}}});
 // U restores the actual teaching flags; orientation/attention remain S4.
 assert.equal(out.setupUnmet.length,4);
 assert.equal(out.document.state.npcs[npc].facingAway,undefined);assert.equal(out.document.state.npcs[npc].teachingBusy,false);
 assert.equal(out.document.state.npcs[npc].demonstrating,false);
 assert.ok(setup({present:[npc],actorStates:{[npc]:{demonstrating:true}}}).setupUnmet.length);
 assert.equal(Object.values(out.document.state.records).some(r=>r.category==='authorization'),false);
});

for(const field of fields)test(`physical: ${field} rejects a malformed top-level field`,()=>{
 assert.ok(setup({[field]:null}).setupUnmet.some(u=>u.item===field));
});
