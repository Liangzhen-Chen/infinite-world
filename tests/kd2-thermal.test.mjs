import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadRuntimeWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {initialThermalState} from '../server-plugin/magic-object.mjs';
import {laborCandidates} from '../server-plugin/npc-labor.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';

// 热工位接入加工行程：铁匠铺的砧台改成要照管炉火的热工位（只改数据：给工位登记 thermalRequirement，绑铺里的炉膛），
// 看打铁的人怎样把炉料、续火、照管与熄火的风险算进行程，结算是否走真实热账。
const world=await loadRuntimeWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const smith='npc_hw_duanyan',forge='bld_hw_forge',hearth='feature_hw_forge_hearth',station='station_hw_anvil';
function heated(){
 const w=structuredClone(world),place=w.locations.find(l=>l.id===forge);
 place.fixtures.find(f=>f.id===station).thermalRequirement={feature:hearth,minimumC:100,maximumC:1000,burning:true};
 return w;
}
function start(w,{burning=true,fuelMg=2000}={}){
 const engine=new WorldEngine(w),doc=engine.createCharacter(seed,{},'kd2-thermal');
 const row=engine.byId.get(forge).features.find(f=>f.id===hearth),thermal=initialThermalState({temperatureC:300,fuelMg},row.thermalModel,doc.state.minute);thermal.burning=burning;
 doc.state.records[`physical_feature:${hearth}`]={id:hearth,category:'physical_feature',location:forge,state:{thermal}};
 return {engine,doc};
}
const forgeTrips=c=>c.filter(x=>x.legacy?.kind==='labor_process'&&x.legacy.station===station);

test('炉膛烧着时，打铁的人排进热工位的行程：工序全程的炉料按热账算，缺的从手上或采买来；炉膛冷着就不去', {timeout:600000}, ()=>{
 const lit=start(heated()),cold=start(heated(),{burning:false});
 const plan=forgeTrips(laborCandidates(lit.engine,subjectiveView(lit.engine,lit.doc,smith),lit.doc));
 assert.ok(plan.length>0,'炉膛烧着、手上有料，打铁的人应排进热工位');
 assert.equal(forgeTrips(laborCandidates(cold.engine,subjectiveView(cold.engine,cold.doc,smith),cold.doc)).length,0,'冷炉点不着，不该排热工位');
 for(const c of plan){
  const craft=c.legacy.stops.at(-1).acts[0];
  assert.equal(craft.heat.feature,hearth);
  const r=lit.engine.byId.get(craft.recipe),model=lit.engine.byId.get(forge).features.find(f=>f.id===hearth).thermalModel;
  // 2000mg 炉料撑不过整个工序：要添炉料，份数按每分钟烧掉的量与工序分钟算。
  assert.ok(craft.minutes*craft.batches*model.burnMgPerMinute+1>2000);
  assert.ok(craft.heat.fuel?.quantity>=1,`${r.id} 应备炉料`);
  assert.ok(model.fuels.some(f=>f.item===craft.heat.fuel.item));
 }
});

test('热工位行程结算走真实热账：到场续火从本人行囊里出，完工按热账出成品；炉火中途熄了就不出成品', {timeout:900000}, async()=>{
 for(const mode of ['lit','doused']){
  // 炉膛里的料够烧几个钟头（每分钟 100mg），打铁的人得在火灭之前把这趟排出来。
  const {engine}=start(heated(),{fuelMg:30000});let {doc}=start(heated(),{fuelMg:30000});
  // 只让打铁的人去自家热工位：给他一笔够用的料与炉料，让这趟行程能排出来。
  Object.assign(doc.state.npcs[smith].inventory,{item_iron:{quantity:4},item_charcoal:{quantity:12}});
  const before=structuredClone(doc.state.npcs[smith].inventory);
  let trip=null;
  for(let i=0;i<5&&!trip;i++){
   const out=await engine.reduce(doc,{tool:'world_act',args:{action:'core:time',slots:{minutes:60}},eventId:`kd2t-${mode}-${i}`});if(out.patches?.length)doc=applyPatches(doc,out.patches);
   trip=Object.values(doc.state.records).find(r=>r.category==='market_trip'&&r.actor===smith&&r.action?.stops?.at(-1)?.acts?.[0]?.heat);
   if(trip&&mode==='doused'){const t=doc.state.records[`physical_feature:${hearth}`].state.thermal;t.burning=false;t.burnRemainder=0;}
  }
  if(!trip){assert.fail('打铁的人一天里没去热工位');}
  const craft=trip.action.stops.at(-1),until=trip.returnAt-doc.state.minute;
  if(until>0){const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:until+1},eventId:`kd2t-${mode}-end`});doc=applyPatches(doc,out.patches);}
  const rec=doc.state.records[trip.id],labor=Object.values(doc.state.records).find(r=>r.category==='labor'&&r.sourceEvent===trip.sourceEvent&&r.recipe);
  if(mode==='lit'){
   assert.ok(rec.furnaces?.[String(trip.action.stops.length-1)]?.plan,'到场应照管上炉火');
   assert.ok(labor.produced.length>0,'炉火一直烧着应出成品');
   const lit=rec.furnaces[String(trip.action.stops.length-1)],planned=craft.acts[0].heat.fuel;
   // 续火的炉料就是计划备下的那份，记在热账的添料里。
   if(planned){assert.deepEqual(lit.fuel.map(f=>[f.item,f.quantity]),[[planned.item,planned.quantity]]);assert.ok(doc.state.records[`physical_feature:${hearth}`].state.thermal.fuelAddedMg>=lit.fuel[0].milligrams);}
  }else{
   assert.equal(labor.produced.length,0,'炉火灭了不出成品');
   assert.ok(labor.reason);
  }
  assert.ok(doc.state.npcs[smith].inventory.item_charcoal?.quantity<=before.item_charcoal.quantity);
 }
});
