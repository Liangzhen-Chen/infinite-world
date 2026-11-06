import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {initialThermalState,validateThermalState} from '../server-plugin/magic-object.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_ayan',location='bld_hw_mill',recipeId='recipe_furnace_test',feature='feature_furnace_test';
const model={heatCapacityJPerC:1000,maximumC:1000,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:1000,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:true,fuels:[{item:'item_charcoal',milligramsPerUnit:250000}]};
function fixture({fuel=2,initialFuel=1000,kiln=false,minutes=20}={}){
 const world=structuredClone(source),base=world.npcs.find(n=>n.id===npc),place=world.locations.find(l=>l.id===location);
 base.schedule={default:[{start:0,end:1440,location,activity:'照管炉火',services:[]}]};base.goals={short:[],medium:[],long:[]};
 const thermalModel=kiln?{...model,wallOffsetsC:[-30,30],kiln:{safeGradientC:0,safeRiseCPerMinute:0,crackPermillePerStress:100}}:structuredClone(model);
 place.features=[{id:feature,name:'试验炉',kind:'object',owner:npc,access:'consent',position:[0,0],state:{},thermalModel,thermalInitial:{temperatureC:200,fuelMg:initialFuel}}];
 // K5：工位由设备属性派生——磨坊里搭一座窑（kiln→pottery），保留原编号、公开收费与热源绑定。
 place.fixtures=[{fixture:'kiln',id:'station_furnace_test',fee:2,thermalRequirement:{feature,minimumC:100,maximumC:1000,burning:true}}];
 world.recipes.push({id:recipeId,name:'试验烧制',skill:'skill_carpentry',minimumProficiency:0,difficulty:0,minutes,workstation:'pottery',materials:[{item:'item_clay',amount:1}],output:{item:'item_wooden_peg',quantity:4},tools:['item_whittling_knife'],toolWear:1,failure:{recoverFraction:1,injury:0},teachers:[npc]});
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'npc-furnace-test');doc.state.minute=600;doc.state.location='loc_capital';
 for(const actor of Object.values(doc.state.npcs))actor.activity??='日常活动';
 Object.assign(doc.state.npcs[npc],{location,activity:'照管炉火',status:'正常',coins:100,goals:base.goals,skills:{skill_carpentry:2100},inventory:{item_charcoal:{quantity:fuel},item_clay:{quantity:3},item_whittling_knife:{quantity:1,durability:50}}});
 const thermal=initialThermalState({temperatureC:200,fuelMg:initialFuel},thermalModel,600);thermal.burning=true;
 doc.state.records[`physical_feature:${feature}`]={id:feature,category:'physical_feature',location,state:{thermal}};
 // Select a fixed successful craft roll without executing or retrying the work.
 for(let i=0;i<20;i++){doc.randomSeed=`furnace-${i}`;const action={kind:'craft',recipe:recipeId},id=`npc_plan_${digest([npcPlanFingerprint(doc),npc,0,action]).slice(0,24)}`;if(parseInt(digest([doc.randomSeed,id,'npc-craft']).slice(0,8),16)%20!==0)break;}
 // A1：引擎在自己的世界副本上工作；夹具的世界改指引擎世界（断言不动）
 return{world:engine.world,engine,doc,model:thermalModel};
}
const thermal=s=>s.doc.state.records[`physical_feature:${feature}`].state.thermal;
const quantity=(s,item)=>s.doc.state.npcs[npc].inventory[item]?.quantity??0;
async function plan(s){
 const out=await s.engine.reduce(s.doc,{type:'npc_plan',eventId:'furnace-plan',plan:{kind:'npc-plan',version:1,minute:s.doc.state.minute,stateFingerprint:npcPlanFingerprint(s.doc),proposals:[{npc,actions:[{kind:'craft',recipe:recipeId}]}]}});
 s.doc=applyPatches(s.doc,out.patches);return out.result.results[0];
}
async function wait(s,minutes){const out=await s.engine.reduce(s.doc,{tool:'world_time',args:{minutes},eventId:`wait-${s.doc.state.minute}`});s.doc=applyPatches(s.doc,out.patches);}
const reload=s=>({...s,engine:new WorldEngine(structuredClone(s.world)),doc:JSON.parse(JSON.stringify(s.doc))});

test('正常计划从NPC库存添料，持续供热并付费制造，不扣玩家燃料',async()=>{
 const s=fixture(),playerFuel=structuredClone(s.doc.state.inventory.item_charcoal),row=await plan(s);
 assert.equal(row.status,'进行中');assert.equal(quantity(s,'item_charcoal'),1);assert.equal(thermal(s).fuelAddedMg,250000);assert.equal(quantity(s,'item_clay'),3);assert.equal(quantity(s,'item_wooden_peg'),0);
 await wait(s,20);const record=s.doc.state.npcAutonomy.actions[row.id];assert.equal(record.outcome.success,true);assert.equal(quantity(s,'item_wooden_peg'),4);assert.equal(quantity(s,'item_clay'),2);assert.equal(s.doc.state.npcs[npc].coins,98);assert.equal(s.doc.state.workshopFunds.station_furnace_test,2);assert.equal(s.doc.state.npcs[npc].inventory.item_whittling_knife.durability,49);
 assert.deepEqual(record.spent.fuel,[{item:'item_charcoal',quantity:1,milligrams:250000}]);assert.equal(thermal(s).burnedFuelMg,20000);assert.deepEqual(s.doc.state.inventory.item_charcoal,playerFuel);validateThermalState(thermal(s),s.model);
});

test('缺燃料、冷炉、温度不符或没有热源权限时拒绝，材料和账款不动',async()=>{
 for(const mode of ['fuel','cold','temperature','permission','location','building']){
  const s=fixture({fuel:mode==='fuel'?0:2});
  if(mode==='cold')thermal(s).burning=false;
  if(mode==='temperature')s.world.locations.find(l=>l.id===location).fixtures[0].thermalRequirement.minimumC=800;
  if(mode==='permission')s.world.locations.find(l=>l.id===location).features[0].owner='player';
  if(mode==='location')s.world.locations.find(l=>l.id===location).fixtures[0].thermalRequirement.feature='feature_s1_hearth';
  if(mode==='building')s.doc.state.buildings[location]={condition:0};
  const before=structuredClone(s.doc),row=await plan(s);assert.equal(row.status,'拒绝',mode);assert.deepEqual(s.doc.state.npcs,before.state.npcs);assert.deepEqual(s.doc.state.records,before.state.records);assert.equal(s.doc.state.npcAutonomy?.tasks,undefined);
 }
});

test('燃料同时是配方材料或工具时不得烧掉制造保留量',async()=>{
 for(const use of ['material','tool']){
  const s=fixture({fuel:1}),r=s.world.recipes.find(r=>r.id===recipeId);if(use==='material')r.materials.push({item:'item_charcoal',amount:1});else r.tools.push('item_charcoal');
  const before=structuredClone(s.doc.state.npcs[npc]),row=await plan(s);assert.equal(row.status,'拒绝');assert.equal(quantity(s,'item_charcoal'),1);assert.deepEqual(s.doc.state.npcs[npc],before);assert.equal(thermal(s).fuelAddedMg,0);
 }
});

test('已有炉料够用时不重复添料，重复计划不能重复扣燃料',async()=>{
 const s=fixture({fuel:0,initialFuel:30000});assert.equal((await plan(s)).status,'进行中');assert.equal(thermal(s).fuelAddedMg,0);assert.equal((await plan(s)).status,'拒绝');await wait(s,20);assert.equal(quantity(s,'item_wooden_peg'),4);
});

test('离岗或失能在下次推进停止任务，返回或恢复后不补成品或退已添燃料',async()=>{
 for(const mode of ['location','status','travel','sleep','companion']){
  const s=fixture(),row=await plan(s);
  if(mode==='location')s.doc.state.npcs[npc].location='loc_hw';
  if(mode==='status')s.doc.state.npcs[npc].status='昏迷';
  if(mode==='travel')s.doc.state.npcs[npc].scheduleTravel={from:location,to:'loc_hw',depart:600,arrive:650,edges:[]};
  if(mode==='sleep')s.doc.state.npcs[npc].activity='睡眠';
  if(mode==='companion')s.doc.state.player.companions.push(npc);
  await wait(s,1);assert.equal(s.doc.state.npcAutonomy.tasks[row.id].status,'失败',mode);
  Object.assign(s.doc.state.npcs[npc],{location,status:'正常',activity:'照管炉火'});delete s.doc.state.npcs[npc].scheduleTravel;s.doc.state.player.companions=[];
  await wait(s,19);assert.equal(quantity(s,'item_wooden_peg'),0);assert.equal(quantity(s,'item_clay'),3);assert.equal(quantity(s,'item_charcoal'),1);assert.equal(s.doc.state.npcs[npc].coins,100);validateThermalState(thermal(s),s.model);
 }
});

test('热源中途熄灭或失去权限会失败，重载及分段推进不改变热账和成品',async()=>{
 const s=fixture(),row=await plan(s);await wait(s,5);const split=reload(s),saved=reload(s);await wait(s,15);await wait(split,5);await wait(split,10);await wait(saved,15);
 assert.deepEqual(split.doc,s.doc);assert.deepEqual(saved.doc,s.doc);assert.equal(s.doc.state.npcAutonomy.tasks[row.id].status,'已完成');
 for(const mode of ['extinguish','permission']){const f=fixture(),task=await plan(f);await wait(f,5);if(mode==='extinguish'){thermal(f).burning=false;thermal(f).burnRemainder=0;}else f.world.locations.find(l=>l.id===location).features[0].owner='player';await wait(f,15);assert.equal(f.doc.state.npcAutonomy.tasks[task.id].status,'失败');assert.equal(quantity(f,'item_wooden_peg'),0);assert.equal(quantity(f,'item_clay'),3);}
});

test('NPC窑炉沿用真实器壁裂损，裂损不能产出或回收已经烧坏的材料',async()=>{
 const s=fixture({kiln:true}),row=await plan(s);await wait(s,20);const record=s.doc.state.npcAutonomy.actions[row.id];assert.equal(record.outcome.degree,'烧制裂损');assert.equal(record.outcome.success,false);assert.equal(record.outcome.thermal.crackedQuantity,4);assert.equal(quantity(s,'item_wooden_peg'),0);assert.equal(quantity(s,'item_clay'),2);assert.equal(quantity(s,'item_charcoal'),1);validateThermalState(thermal(s),s.model);
});

test('离屏每日作息也能照管炉火，日界分段与重载不会重领燃料',async()=>{
 const s=fixture({initialFuel:2000});s.doc.state.minute=599;thermal(s).lastMinute=599;const b=reload(s);await wait(s,22);await wait(b,1);const saved=reload(b);await wait(b,20);await wait(b,1);await wait(saved,21);
 assert.deepEqual(s.doc,b.doc);assert.deepEqual(s.doc,saved.doc);const task=s.doc.state.npcAutonomy.tasks[`npc_daily_0_${npc}`];assert.equal(task.status,'已完成');assert.equal(quantity(s,'item_charcoal'),1);assert.ok(s.doc.state.npcAutonomy.actions[task.id]);
});

test('两名NPC同时照管同一真实热源，时钟只烧一次燃料，各自结算工序',async()=>{
 const s=fixture(),other='npc_hw_duanyan',base=s.world.npcs.find(n=>n.id===other),place=s.world.locations.find(l=>l.id===location);
 base.schedule=structuredClone(s.world.npcs.find(n=>n.id===npc).schedule);place.features[0].access='public';
 s.world.recipes.find(r=>r.id===recipeId).teachers.push(other);
 s.doc.state.npcs[other]={...s.doc.state.npcs[other],...structuredClone(s.doc.state.npcs[npc]),name:base.name};
 const first=await plan(s),out=await s.engine.reduce(s.doc,{type:'npc_plan',eventId:'second',plan:{kind:'npc-plan',version:1,minute:600,stateFingerprint:npcPlanFingerprint(s.doc),proposals:[{npc:other,actions:[{kind:'craft',recipe:recipeId}]}]}});
 s.doc=applyPatches(s.doc,out.patches);const second=out.result.results[0];assert.equal(second.status,'进行中');assert.equal(s.doc.state.npcs[other].inventory.item_charcoal.quantity,2);
 await wait(s,20);assert.ok(s.doc.state.npcAutonomy.actions[first.id]);assert.ok(s.doc.state.npcAutonomy.actions[second.id]);assert.equal(s.doc.state.npcAutonomy.tasks[second.id].reason,undefined);assert.equal(thermal(s).burnedFuelMg,20000);assert.equal(thermal(s).fuelAddedMg,250000);validateThermalState(thermal(s),s.model);
});

test('室内缺氧不能靠添炭绕过，正常通风保留燃料、耗氧和烟尘账',async()=>{
 for(const sufficient of [false,true]){
  const s=fixture(),place=s.world.locations.find(l=>l.id===location);place.features.push({...structuredClone(place.features[0]),id:'feature_furnace_cold',thermalInitial:{temperatureC:20,fuelMg:0}},{id:'feature_furnace_room',name:'试验炉房',kind:'room',owner:npc,access:'consent',position:[0,0],state:{},airModel:{capacityMg:sufficient?100000:1000,ventilationMgPerMinute:sufficient?2000:0},fireLinks:[[feature,'feature_furnace_cold']]});
  const row=await plan(s);assert.equal(row.status,sufficient?'进行中':'拒绝',row.reason);
  if(!sufficient){assert.equal(quantity(s,'item_charcoal'),2);assert.equal(thermal(s).fuelAddedMg,0);continue;}
  await wait(s,20);const air=s.doc.state.records['physical_feature:feature_furnace_room'].state.air;
  assert.equal(air.burnedFuelMg,thermal(s).burnedFuelMg);assert.equal(air.oxygenUsedMg,20000);assert.equal(air.smokeInputMg,thermal(s).exhaustFuelMg);assert.equal(quantity(s,'item_wooden_peg'),4);validateThermalState(thermal(s),s.model);
 }
});

test('节燃及到期仍用实际热账预测，够用时不多烧NPC库存',async()=>{
 const s=fixture({initialFuel:20000,fuel:0});s.doc.state.effects.fuel_saving={kind:'object_process',operation:'fuel',target:feature,power:100,started:600,expires:610,source:'fixture'};
 const row=await plan(s);assert.equal(row.status,'进行中');assert.equal(thermal(s).fuelAddedMg,0);await wait(s,20);assert.equal(thermal(s).burnedFuelMg,19000);assert.equal(thermal(s).fuelMg,1000);assert.equal(quantity(s,'item_wooden_peg'),4);validateThermalState(thermal(s),s.model);
});
