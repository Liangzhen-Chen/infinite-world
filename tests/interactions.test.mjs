import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {interactionRules} from '../world/design/interaction-rules.mjs';
import {resolveInteraction,applyInteraction,creatureCounter,validateInteractionRules,interactionOf} from '../server-plugin/interactions.mjs';
import {creatureTraits,itemTraits,featureTraits,traitsOf} from '../server-plugin/traits.mjs';
import {natureCounter,affinityMultipliers} from '../server-plugin/creature-nature.mjs';
import {prepareMagic,applyMagic} from '../server-plugin/magic.mjs';
import {advanceMagicObjects,douseObjectFire,initialThermalState} from '../server-plugin/magic-object.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
import {servantCarryWater} from '../server-plugin/environment.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world),species=id=>world.monsters.find(m=>m.id===id);
const draft=document=>({document,get:(...p)=>p.reduce((v,k)=>v?.[k],document),set:(p,value)=>{let o=document;for(const k of p.slice(0,-1))o=o[k]??={};o[p.at(-1)]=structuredClone(value);},say(){}});
const fresh=seed=>engine.createCharacter(legacy,{},seed);
const tagElements=['fire','cold','wind','earth','light','water','lightning'];

test('规则表只按标签书写，校验通过且每条都有接入的效果', () => {
 assert.deepEqual(validateInteractionRules(),[]);
 const ids=new Set([...world.monsters.map(m=>m.id),...world.items.map(i=>i.id)]);
 for(const r of interactionRules.rules){
  assert.ok(!JSON.stringify(r.when).match(/(monster|item|feature|loc)_/),r.id);
  assert.ok(![...ids].some(id=>JSON.stringify(r).includes(id)));
 }
 assert.ok(validateInteractionRules([{id:'x',agent:'fire',when:{all:['dragonfire']},effect:{multiplier:9}}]).length>=2);
});

test('全部168种生物按标签或已登记属性参与元素交锋', () => {
 let tagged=0;
 for(const s of world.monsters){
  const traits=creatureTraits(s),hits=tagElements.map(e=>resolveInteraction(e,traits)).filter(r=>r.multiplier!==1);
  if(!s.nature){assert.ok(hits.length,`${s.id} 没有任何元素规则`);tagged++;}
  else for(const t of [...s.nature.affinity.weak,...s.nature.affinity.resist])assert.ok(creatureCounter(traits,t)?.nature,s.id);
 }
 assert.equal(tagged,150);
});

test('元素倍率：易燃身躯怕火，霜体抗寒，冷血怕寒，导体怕雷，硬壳抗土，毛皮御寒', () => {
 const m=(id,tactic)=>creatureCounter(creatureTraits(species(id)),tactic)?.damageMultiplier??1;
 assert.equal(m('monster_resin_lump','magic_fire'),1.5);
 assert.equal(m('monster_frost_ring_cedar','magic_fire'),1.5);
 assert.equal(m('monster_frost_ring_cedar','magic_cold'),0.5);
 assert.equal(m('monster_ice_scale_python','magic_cold'),0.75);
 assert.equal(m('monster_white_notch_viper','magic_cold'),1.5);
 assert.equal(m('monster_white_notch_viper','magic_fire'),0.75);
 assert.equal(m('monster_iron_beak_bird','magic_lightning'),1.5);
 assert.equal(m('monster_iron_beak_bird','magic_wind'),1.5);
 assert.equal(m('monster_black_fin_perch','magic_fire'),0.5);
 assert.equal(m('monster_black_fin_perch','magic_lightning'),1.5);
 assert.equal(m('monster_plate_back_tortoise','magic_earth'),0.5);
 assert.equal(m('monster_grey_ridge_wolf','magic_cold'),0.75);
 assert.equal(m('monster_grey_ridge_wolf','magic_fire'),1);
 assert.equal(m('monster_grey_ridge_wolf','armed'),1);
 assert.equal(m('monster_ember_throat_civet','magic_water'),1.5);
 const ice=resolveInteraction('ice',creatureTraits(species('monster_ice_rib_ram')));
 assert.equal(ice.agent,'cold');assert.equal(ice.multiplier,0.5);
});

test('已登记生物属性是完整交锋档案：原值保持，旧接口兼容', () => {
 for(const s of world.monsters.filter(m=>m.nature)){
  for(const t of s.nature.affinity.weak)assert.deepEqual(natureCounter(s,t),{damageMultiplier:affinityMultipliers.weak,nature:{tactic:t,effect:'weak'}});
  for(const t of s.nature.affinity.resist)assert.deepEqual(natureCounter(s,t),{damageMultiplier:affinityMultipliers.resist,nature:{tactic:t,effect:'resist'}});
  for(const t of ['armed','unarmed','magic_fire','magic_cold','magic_wind','magic_earth','magic_lightning'].filter(x=>![...s.nature.affinity.weak,...s.nature.affinity.resist].includes(x)))assert.equal(natureCounter(s,t),null,`${s.id}:${t}`);
 }
});

test('物品材质响应元素：火炭化纸布木，火给金属回火痕，墨只染干纸，水浸湿行囊物', () => {
 const item=tag=>world.items.find(i=>i.tags?.includes(tag));
 assert.deepEqual(resolveInteraction('fire',itemTraits(item('paper'))).marks,['char']);
 assert.deepEqual(resolveInteraction('fire',itemTraits(item('clothing'))).add,['burning']);
 assert.deepEqual(resolveInteraction('fire',itemTraits(item('metal'))).marks,['temper']);
 assert.deepEqual(resolveInteraction('ink',itemTraits(item('paper'))).marks,['stain']);
 assert.deepEqual(resolveInteraction('ink',itemTraits(item('paper'),{moisture:2})).marks,[]);
 assert.deepEqual(resolveInteraction('fire',itemTraits(item('clothing'),{moisture:2})).add,[]);
 const doc=fresh('ix-item'),cloth=item('clothing');doc.state.inventory[cloth.id]={quantity:1,quality:'木',durability:100};
 const d=draft(doc),out=applyInteraction(d,engine,{agent:'water',target:cloth.id,moistureMg:3});
 assert.deepEqual(out.added,[]);
 const soaked=applyInteraction(d,engine,{agent:'rain',target:cloth.id,traits:{...itemTraits(cloth),tags:[...itemTraits(cloth).tags,'burning']},moistureMg:3});
 assert.deepEqual(soaked.added,['wet']);assert.equal(doc.state.inventory[cloth.id].moisture,3);
 assert.ok(traitsOf(engine,doc,cloth.id).tags.includes('wet'));
});

function strip(seed,{fuelMg}={}){
 const doc=fresh(seed),d=draft(doc);doc.state.location='bld_bs_reed_dao';doc.state.records??={};
 doc.state.records.local_player_position={location:'bld_bs_reed_dao',point:[0,1]};
 doc.state.records.auth_strip={category:'authorization',subject:'feature_s2_fire_strip',action:'environment_use',grantor:'npc_bs_077_1'};
 if(fuelMg!==undefined)doc.state.records['physical_feature:feature_s2_fire_strip']={id:'feature_s2_fire_strip',category:'physical_feature',location:'bld_bs_reed_dao',state:{thermal:null}};
 return{doc,d};
}
const fireBolt=world.spells.find(s=>s.id==='spell_fire_08');
test('焰矢射向干草线即点燃；浇水灭火并浸湿，湿草线再射不燃', () => {
 const {doc,d}=strip('ix-strip');
 const prepared=prepareMagic.call(engine,d,fireBolt,{target:'feature_s2_fire_strip',authorization:'auth_strip'});
 const out=applyMagic.call(engine,d,prepared,'ev-bolt');
 assert.deepEqual(out.added,['burning']);assert.ok(out.rules.includes('fire-ignite'));
 const rec=()=>doc.state.records['physical_feature:feature_s2_fire_strip'].state.thermal;
 assert.equal(rec().burning,true);
 assert.ok(traitsOf(engine,doc,'feature_s2_fire_strip').tags.includes('burning'));
 assert.throws(()=>prepareMagic.call(engine,d,fireBolt,{target:'feature_s2_fire_strip',authorization:'auth_strip'}),/没有可成立的作用/);
 assert.throws(()=>prepareMagic.call(engine,d,fireBolt,{target:'feature_s2_fire_strip'}),/授权/);
 const pool={id:'feature_ix_tub',name:'试验水桶',aliases:[],kind:'container',owner:'player',access:'public',position:[0,1],state:{capacityMl:5000,waterMl:4000,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:''}};
 const w=structuredClone(world);w.locations.find(l=>l.id==='bld_bs_reed_dao').features.push(pool);
 const e2=new WorldEngine(w);
 const doused=douseObjectFire(d,e2,{target:'feature_s2_fire_strip',source:'feature_ix_tub',millilitres:1000,authorization:'auth_strip'});
 assert.equal(doused.extinguished,true);assert.equal(rec().burning,false);assert.equal(rec().moistureMg,1000*1000);assert.equal(rec().moistureAddedMg,1000*1000);
 assert.ok(traitsOf(e2,doc,'feature_s2_fire_strip').tags.includes('wet'));
 assert.throws(()=>prepareMagic.call(e2,d,fireBolt,{target:'feature_s2_fire_strip',authorization:'auth_strip'}),/没有可成立的作用/);
});

test('寒气冻住水面后不能取水，到时自融或用火解冻', () => {
 const w=structuredClone(world),place=w.locations.find(l=>l.id==='bld_bs_reed_dao');
 place.features.push({id:'feature_ix_vat',name:'试验水缸',aliases:[],kind:'container',owner:'player',access:'public',position:[0,1],state:{capacityMl:5000,waterMl:4000,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:''}},
  {id:'feature_ix_jar',name:'试验空罐',aliases:[],kind:'container',owner:'player',access:'public',position:[0,1],state:{capacityMl:5000,waterMl:0,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:''}});
 const e=new WorldEngine(w),{doc,d}=strip('ix-freeze');
 const frost={...fireBolt,id:'spell_ix_frost',effectSpec:{kind:'damage',power:16,damageType:'cold'}};
 const out=applyMagic.call(e,d,prepareMagic.call(e,d,frost,{target:'feature_ix_vat'}),'ev-frost');
 assert.deepEqual(out.added,['frozen']);
 assert.equal(doc.state.records['physical_feature:feature_ix_vat'].state.frozenUntil,doc.state.minute+120);
 assert.ok(traitsOf(e,doc,'feature_ix_vat').tags.includes('frozen'));
 assert.throws(()=>servantCarryWater.call(e,d,{source:'feature_ix_vat',destination:'feature_ix_jar',millilitres:10},100),/冻结/);
 const thaw=applyMagic.call(e,d,prepareMagic.call(e,d,fireBolt,{target:'feature_ix_vat'}),'ev-thaw');
 assert.deepEqual(thaw.removed,['frozen']);
 assert.equal(servantCarryWater.call(e,d,{source:'feature_ix_vat',destination:'feature_ix_jar',millilitres:10},100).movedMl??10,10);
 applyMagic.call(e,d,prepareMagic.call(e,d,frost,{target:'feature_ix_vat'}),'ev-frost2');
 doc.state.minute+=120;assert.ok(!traitsOf(e,doc,'feature_ix_vat').tags.includes('frozen'));
 assert.throws(()=>prepareMagic.call(e,d,{...frost,effectSpec:{kind:'damage',power:16,damageType:'mind'}},{target:'feature_ix_vat'}),/没有可成立的作用/);
});

test('户外降雨按天气浇灭仍在燃烧的火并浸湿，无雨照常燃烧', () => {
 const w=structuredClone(world),model=w.locations.find(l=>l.id==='bld_bs_reed_dao').features.find(f=>f.id==='feature_s2_fire_strip').thermalModel;
 assert.ok(w.rules.weather.regions.some(r=>r.locations.includes('loc_hw_dock')&&!r.indoor.includes('loc_hw_dock')));
 w.locations.find(l=>l.id==='loc_hw_dock').features.push({id:'feature_ix_bonfire',name:'试验篝火',aliases:[],kind:'object',owner:'player',access:'public',position:[0,0],state:{},thermalModel:structuredClone(model),thermalInitial:{temperatureC:20,fuelMg:3000,moistureMg:0}});
 const e=new WorldEngine(w),seedDoc=fresh('ix-rain');
 let rainy=null,dry=null;
 for(let day=0;day<360&&!(rainy&&dry);day++){const at=day*1440+600,k=weatherAt(e,seedDoc.randomSeed,'loc_hw_dock',at)?.kind;if(['rain','storm'].includes(k))rainy??=at;else if(k==='clear')dry??=at;}
 assert.ok(rainy&&dry);
 for(const[at,expect]of[[rainy,false],[dry,true]]){
  const doc=fresh('ix-rain'),d=draft(doc),thermal=initialThermalState({temperatureC:20,fuelMg:3000,moistureMg:0},model,at-1);thermal.burning=true;
  doc.state.location='loc_hw_dock';doc.state.minute=at;
  doc.state.records['physical_feature:feature_ix_bonfire']={id:'feature_ix_bonfire',category:'physical_feature',location:'loc_hw_dock',state:{thermal}};
  advanceMagicObjects(d,e,at);
  const t=doc.state.records['physical_feature:feature_ix_bonfire'].state.thermal;
  assert.equal(t.burning,expect,`minute ${at}`);
  if(!expect){assert.equal(t.moistureMg,1000);assert.ok(traitsOf(e,doc,'feature_ix_bonfire').tags.includes('wet'));}
 }
});

test('生物交锋倍率按实际在场个体读取，死后不再结算', () => {
 const doc=fresh('ix-actor');doc.state.creatures={monster_ix:{species:'monster_resin_lump',status:'正常',hp:10,location:doc.state.location}};
 assert.equal(interactionOf(engine,doc,'magic_fire','monster_ix').multiplier,1.5);
 doc.state.creatures.monster_ix.status='死亡';
 assert.ok(traitsOf(engine,doc,'monster_ix').tags.includes('dead'));
});
