// 卡 HB：热工位绑定热源。锻炉、窑这类要明火的设备，热源绑定由设备类派生（不逐个工位手填）；
// 要火的配方只能在有热源、且烧着的工位上做，冷炉要由用的人添燃料点火并等炉温升上来，没燃料做不了；玩家和人物同一条。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadRuntimeWorld as loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,digest} from '../server-plugin/storage.mjs';
import {materializeWorkstations,fixtureStations} from '../server-plugin/workstation-services.mjs';
import {npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {heatClass} from '../server-plugin/facility-heat.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_duanyan',shop='bld_hw_forge',recipe='recipe_forge_nails';

test('每个锻炉与窑设备都由设备类派生出热源要求和一个同地的炉膛；灶不受影响；重复具现不叠加',()=>{
 const world=structuredClone(source);materializeWorkstations(world);materializeWorkstations(world);
 let heated=0;
 for(const place of world.locations)for(const s of fixtureStations(place,world))if(heatClass(world,s.fixture)&&s.thermalRequirement.feature.startsWith('feature_firebox_')){
  heated++;assert.equal(place.features.filter(f=>f.id===s.thermalRequirement.feature).length,1,s.id);
  assert.ok(box0(place,s).thermalModel.fuels.length>0);
 }
 assert.ok(heated>=6,'世界里的锻炉与窑都应派生出炉膛，实际 '+heated);
 for(const place of world.locations)for(const s of fixtureStations(place,world))if(s.fixture==='hearth')assert.equal(s.thermalRequirement,undefined);
});
const box0=(place,s)=>place.features.find(f=>f.id===s.thermalRequirement.feature);

function craftFixture({fuel=3,nails=true}={}){
 const world=structuredClone(source),engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'khb');
 doc.state.player.coins=1000;doc.state.location=shop;
 const give=(item,quantity)=>{const def=engine.byId.get(item);doc.state.inventory[item]={quantity,quality:def.quality,durability:def.durability,weight:def.weight};};
 const r=engine.byId.get(recipe);for(const m of r.materials)give(m.item,m.amount*3);for(const t of r.tools??[])give(t,1);
 give('item_charcoal',fuel+r.materials.find(m=>m.item==='item_charcoal').amount*3);
 return {engine,doc,world};
}
const charcoal=c=>c.doc.state.inventory.item_charcoal?.quantity??0;
const hearth=c=>c.doc.state.records['physical_feature:feature_firebox_station_hw_anvil'];
test('玩家在冷锻炉做工：自己添燃料点火，升温的时间和燃料都算在这次工作里',async()=>{
 const c=craftFixture(),before=charcoal(c),t0=c.doc.state.minute;
 const out=await c.engine.reduce(c.doc,{tool:'world_craft',args:{recipe},eventId:'khb-1'});
 const doc=applyPatches(c.doc,out.patches);
 assert.ok(doc.state.minute-t0>c.engine.byId.get(recipe).minutes,'含升温分钟');
 assert.ok(before-doc.state.inventory.item_charcoal.quantity>c.engine.byId.get(recipe).materials.find(m=>m.item==='item_charcoal').amount,'除配方用料外还烧了燃料');
 assert.ok(doc.state.records['physical_feature:feature_firebox_station_hw_anvil'].state.thermal.burnedFuelMg>0);
});
test('没有燃料时冷炉做不了，材料和时间都不动',async()=>{
 const c=craftFixture({fuel:0});const r=c.engine.byId.get(recipe);
 c.doc.state.inventory.item_charcoal.quantity=r.materials.find(m=>m.item==='item_charcoal').amount;
 const t0=c.doc.state.minute,inv=structuredClone(c.doc.state.inventory);
 await assert.rejects(c.engine.reduce(c.doc,{tool:'world_craft',args:{recipe},eventId:'khb-2'}));
 assert.equal(c.doc.state.minute,t0);assert.deepEqual(c.doc.state.inventory,inv);assert.equal(hearth(c),undefined);
});

function npcFixture({fuel=3}={}){
 const world=structuredClone(source),engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'khb-npc');
 const base=engine.byId.get(npc),r=engine.byId.get(recipe);
 base.schedule={default:[{start:0,end:1440,location:shop,activity:'打铁',services:[]}]};
 doc.state.minute=600;doc.state.location='loc_capital';
 for(const a of Object.values(doc.state.npcs))a.activity??='日常活动';
 const inv={};for(const m of r.materials)inv[m.item]={quantity:m.amount+(m.item==='item_charcoal'?fuel:0)};
 for(const t of r.tools??[])inv[t]={quantity:1,durability:50};
 Object.assign(doc.state.npcs[npc],{location:shop,activity:'打铁',status:'正常',coins:100,inventory:inv,skills:{...(doc.state.npcs[npc].skills??{}),[r.skill]:2100}});
 return {engine,doc};
}
async function plan(c){
 const out=await c.engine.reduce(c.doc,{type:'npc_plan',eventId:'khb-plan',plan:{kind:'npc-plan',version:1,minute:c.doc.state.minute,stateFingerprint:npcPlanFingerprint(c.doc),proposals:[{npc,actions:[{kind:'craft',recipe}]}]}});
 c.doc=applyPatches(c.doc,out.patches);return out.result.results[0];
}
test('人物在冷锻炉做工同一条：点火升温的时间进工期，燃料从本人行囊出；没燃料则不做',async()=>{
 const ok=npcFixture(),row=await plan(ok),r=ok.engine.byId.get(recipe);
 assert.equal(row.status,'进行中');assert.ok(row.finish-ok.doc.state.minute>r.minutes);
 assert.ok(ok.doc.state.npcs[npc].inventory.item_charcoal.quantity<r.materials.find(m=>m.item==='item_charcoal').amount+3);
 const none=npcFixture({fuel:0}),before=structuredClone(none.doc.state.npcs);
 const rejected=await plan(none);assert.equal(rejected.status,'拒绝');assert.deepEqual(none.doc.state.npcs,before);
});
