import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {initialThermalState,advanceThermalState,validateThermalState,validateObjectCatalog,prepareObjectMagic,applyObjectMagic,advanceMagicObjects,addObjectFuel,inspectObjectProcess,prepareThermalWorkstation} from '../server-plugin/magic-object.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {takeNotedOffenses} from '../server-plugin/offense-notes.mjs';
const model={heatCapacityJPerC:1000,maximumC:1000,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:1000,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:true,fuels:[{item:'item_charcoal',milligramsPerUnit:100000}]};
function draft(document){return{document,get:(...p)=>p.reduce((v,k)=>v?.[k],document),set:(p,value)=>{let o=document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=structuredClone(value);}};}
function setup({privateFeature=false,moistureMg=0,temperatureC=20}={}){
 const row={id:'feature_hearth',name:'试验炉',aliases:[],kind:'object',owner:privateFeature?'npc_owner':'player',access:'consent',position:[0,0],thermalModel:structuredClone(model),thermalInitial:{temperatureC,fuelMg:4000,moistureMg},state:{unrelatedWaterMl:123}};
 const document={state:{minute:0,location:'loc_test',records:{},effects:{},inventory:{item_charcoal:{quantity:2}},npcs:{npc_owner:{status:'正常'}}}};
 const engine={world:{locations:[{id:'loc_test',features:[row]}]},byId:new Map([['item_charcoal',{id:'item_charcoal',weight:.1}]]),quantity:(d,owner,item)=>d.get('state','inventory',item,'quantity')??0,itemDelta:(d,owner,item,n)=>d.set(['state','inventory',item,'quantity'],d.get('state','inventory',item,'quantity')+n)};
 return{row,document,d:draft(document),engine};
}
const spell=(operation,power=100,extra={})=>({id:`spell_${operation}`,duration:operation==='fuel'?3:0,rangeMeters:operation==='sense_heat'?0:3,effectSpec:{kind:'object',operation,power,...(['heat','cool','dry'].includes(operation)?{limitC:20}:{}),...extra}});
function cast(d,engine,catalog,id='cast',args={target:'feature_hearth'}){return applyObjectMagic.call(engine,d,prepareObjectMagic.call(engine,d,catalog,args),id);}
const thermal=d=>d.get('state','records','physical_feature:feature_hearth','state','thermal');
test('点火只接触真实干火绒，火焰耗尽有限燃料并守恒，熄灭不伪造冷却',()=>{
 const {d,engine}=setup();cast(d,engine,spell('ignite',5000));d.set(['state','minute'],1);advanceMagicObjects(d,engine,1);assert.equal(thermal(d).fuelMg,3000);assert.equal(thermal(d).burnedFuelMg,1000);assert.equal(thermal(d).ashMg+thermal(d).exhaustFuelMg,1000);
 const temp=thermal(d).energyJ;const out=cast(d,engine,spell('extinguish'));assert.equal(out.stillHot,true);assert.equal(thermal(d).energyJ,temp);
 d.set(['state','minute'],4);advanceMagicObjects(d,engine,4);assert.equal(thermal(d).fuelMg,3000);assert.equal(thermal(d).burning,false);assert.equal(d.get('state','records','physical_feature:feature_hearth','state','unrelatedWaterMl'),123);validateThermalState(thermal(d),model);
 const other=setup();cast(other.d,other.engine,spell('ignite',5000));other.d.set(['state','minute'],100);advanceMagicObjects(other.d,other.engine,100);assert.equal(thermal(other.d).fuelMg,0);assert.equal(thermal(other.d).burning,false);
 const wet=setup({moistureMg:1});assert.throws(()=>cast(wet.d,wet.engine,spell('ignite',5000)),/干燥/);assert.equal(Object.keys(wet.document.state.records).length,0);
});
test('节燃最多10%，同热量少耗真实燃料且不叠加，跨过期与分段等待一致',()=>{
 const m={...model,passiveExchangeJPerMinute:0},source=initialThermalState({fuelMg:20000},m,0);source.burning=true;
 const effects=[{kind:'object_process',operation:'fuel',target:'test',power:100,started:0,expires:3}];
 const normal=advanceThermalState(source,m,3),saving=advanceThermalState(source,m,3,{effects,target:'test'});
 assert.equal(normal.burnedFuelMg,3000);assert.equal(saving.burnedFuelMg,2700);assert.equal(saving.energyJ,normal.energyJ);assert.deepEqual(advanceThermalState(source,m,3,{effects:[...effects,...effects],target:'test'}),saving);
 const long=advanceThermalState(source,m,5,{effects,target:'test'});let split=source;for(let i=1;i<=5;i++)split=advanceThermalState(split,m,i,{effects,target:'test'});assert.deepEqual(long,split);assert.equal(long.burnedFuelMg,4700);
 assert.ok(validateObjectCatalog(spell('fuel',101)).length);assert.ok(validateObjectCatalog({...spell('fuel'),duration:61}).length);
});
test('加热有热量和温度上限，冷却保留输出热量，干燥同时消耗原水和真实热',()=>{
 const {d,engine}=setup({moistureMg:2000});const hot=cast(d,engine,spell('heat',5000,{limitC:23}));assert.equal(hot.heatInputJ,3000);assert.equal(hot.temperatureC,23);
 const dry=cast(d,engine,spell('dry',5000,{limitC:20}));assert.equal(dry.evaporatedMg,1000);assert.equal(dry.heatUsedJ,3000);assert.equal(thermal(d).moistureMg,1000);assert.equal(thermal(d).evaporatedMg,1000);assert.throws(()=>cast(d,engine,spell('dry',5000)),/热量/);
 cast(d,engine,spell('heat',5000,{limitC:38}));const cool=cast(d,engine,spell('cool',2000,{limitC:22}));assert.equal(cool.temperatureC,23);assert.equal(cool.heatRemovedJ,2000);validateThermalState(thermal(d),model);
});
test('私有热对象无授权或完工前许可失效照样加热并记下擅用，测温须真实接触',()=>{
 // K6 依据（审查 C-b，卡"许可是后果"）：他人炉子无授权照样加热；违背许可的那一处记在本次事务上，由引擎提交为罪名。
 {const p=setup({privateFeature:true});cast(p.d,p.engine,spell('heat',100,{limitC:38}));assert.ok(thermal(p.d));assert.deepEqual(takeNotedOffenses(p.d).map(b=>[b.act,b.victim,b.subject.id]),[['use','npc_owner',p.row.id]]);}
 const {d,engine,row}=setup({privateFeature:true});
 d.set(['state','records','permit'],{category:'authorization',subject:row.id,action:'environment_use',grantor:'npc_owner',expires:1});const args={target:row.id,authorization:'permit'},prepared=prepareObjectMagic.call(engine,d,spell('heat',100,{limitC:38}),args);
 {const p=setup({privateFeature:true});p.d.set(['state','records','permit'],{category:'authorization',subject:p.row.id,action:'environment_use',grantor:'npc_owner',expires:1});const late=prepareObjectMagic.call(p.engine,p.d,spell('heat',100,{limitC:38}),{target:p.row.id,authorization:'permit'});
  p.d.set(['state','minute'],1);takeNotedOffenses(p.d);const out=applyObjectMagic.call(p.engine,p.d,late,'late');assert.equal(out.effectFailed,undefined);assert.ok(thermal(p.d));assert.deepEqual(takeNotedOffenses(p.d).map(b=>b.act),['use']);}
 assert.equal(thermal(d),undefined);
 d.set(['state','records','permit','expires'],10);row.position=[.1,0];assert.throws(()=>cast(d,engine,spell('sense_heat',1),'sense',args),/接触/);row.position=[0,0];assert.equal(cast(d,engine,spell('sense_heat',1),'sense',args).temperatureC,20);assert.equal(thermal(d),undefined);
});
test('真实燃料入炉按目录质量扣库存，坏单位和不适用物料不能添入',()=>{
 const {d,engine,row}=setup();const out=addObjectFuel(d,engine,{target:row.id,item:'item_charcoal',quantity:1},'load');assert.equal(out.fuelMgAdded,100000);assert.equal(engine.quantity(d,'player','item_charcoal'),1);assert.equal(thermal(d).fuelMg,104000);validateThermalState(thermal(d),model);
 const before=structuredClone(d.document);row.thermalModel.fuels[0].milligramsPerUnit=1;assert.throws(()=>addObjectFuel(d,engine,{target:row.id,item:'item_charcoal',quantity:1},'wrong'),/重量不符/);assert.deepEqual(d.document,before);
 assert.throws(()=>cast(d,engine,spell('ignite',5000)),/有限量/);
});
test('制造热需求预检覆盖完整时段，不能开工后才发现燃料不够；检查不改账',()=>{
 const {d,engine}=setup();cast(d,engine,spell('ignite',5000));const station={thermalRequirement:{feature:'feature_hearth',minimumC:20,maximumC:1000,burning:true}},before=structuredClone(d.document);
 assert.equal(prepareThermalWorkstation(d,engine,station,2).projectedFuelMg,2000);assert.throws(()=>prepareThermalWorkstation(d,engine,station,5),/整个工序/);assert.deepEqual(d.document,before);assert.equal(prepareThermalWorkstation(d,engine,{},2),null);
});
test('热对象读数不越过所在地或许可，损坏守恒记录阻止结算',()=>{
 const {d,engine}=setup();cast(d,engine,spell('heat',100,{limitC:38}));d.set(['state','location'],'loc_else');assert.throws(()=>inspectObjectProcess(d,engine,'feature_hearth'),/所在地/);d.set(['state','location'],'loc_test');thermal(d).fuelMg+=1;
 const before=structuredClone(d.document);assert.throws(()=>advanceMagicObjects(d,engine,5),/质量不守恒/);assert.deepEqual(d.document,before);
});
test('未联动的流体热量与伪造无限节燃期限被拒绝',()=>{
 const {row,d,engine}=setup();row.state.waterMl=100;assert.throws(()=>cast(d,engine,spell('heat',100,{limitC:38})),/液态水/);delete row.state.waterMl;row.kind='water';assert.throws(()=>cast(d,engine,spell('heat',100,{limitC:38})),/非活体物件/);
 const source=initialThermalState({fuelMg:1000},model,0);source.burning=true;assert.throws(()=>advanceThermalState(source,model,1,{target:'test',effects:[{kind:'object_process',operation:'fuel',target:'test',power:100,started:0,expires:10000}]}),/期限/);
});
test('真实施法路由扣魔力且改物件热状态，未登记物件或未知工艺在扣费前拒绝',async()=>{
 const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),base=world.spells[0];
 world.skills.push({id:'skill_m4_heat',name:'试验加热',attribute:'精神',profession:null});world.spells.push({...base,...spell('heat',5000,{limitC:38}),id:'spell_m4_heat',name:'试验加热',skill:'skill_m4_heat',mp:2,minutes:1,materials:[]});
 const initial=new WorldEngine(world).initialFromLegacy(seed,'object-magic'),row=setup().row;world.locations.find(x=>x.id===initial.state.location).features??=[];world.locations.find(x=>x.id===initial.state.location).features.push(row);
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'object-magic');document.state.spells.spell_m4_heat={source:{type:'fixture'}};document.state.skills.skill_m4_heat={proficiency:10,daily:{},breakthroughs:[]};
 const run=async(id,args={spell:'spell_m4_heat',target:'feature_hearth'})=>{const out=await engine.reduce(document,{tool:'world_cast',args,eventId:id});return {result:out.result,document:applyPatches(document,out.patches)};};
 let success;for(let i=0;i<100;i++){const out=await run(`heat-${i}`);if(out.result.success){success={...out,id:`heat-${i}`};break;}}
 assert.ok(success);assert.equal(success.result.heatInputJ,5000);assert.equal(success.document.state.player.mp,document.state.player.mp-2);assert.equal(success.document.state.records['physical_feature:feature_hearth'].state.thermal.energyJ,25000);
 assert.deepEqual(await run(success.id),{result:success.result,document:success.document});await assert.rejects(run('missing',{spell:'spell_m4_heat',target:'unregistered'}),/未登记/);
 world.spells.find(x=>x.id==='spell_m4_heat').effectSpec.operation='free_fuel';await assert.rejects(new WorldEngine(world).reduce(document,{tool:'world_cast',args:{spell:'spell_m4_heat',target:'feature_hearth'},eventId:'bad'}),/尚未接入/);
});
