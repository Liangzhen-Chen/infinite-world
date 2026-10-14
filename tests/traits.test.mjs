import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {traitsOf,itemTraits,creatureTraits,featureTraits,locationTraits,spellTraits,canonicalElement,tacticElement,ELEMENTS,TACTICS,SPELL_DAMAGE_TYPES,CREATURE_TAGS,validateTraits,hasTrait} from '../server-plugin/traits.mjs';
import {damageTypes} from '../server-plugin/magic-primitives.mjs';
import {affinityTactics} from '../server-plugin/creature-nature.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world),doc=engine.createCharacter(legacy,{},'traits-seed');

test('一套元素词表：旧伤害门类与生物战术都由它派生并保留旧名', () => {
 assert.deepEqual([...damageTypes],['physical','fire','cold','wind','earth','light','shadow','mind']);
 assert.deepEqual([...damageTypes],[...SPELL_DAMAGE_TYPES]);
 assert.deepEqual(affinityTactics.slice(0,10),['armed','unarmed','magic_fire','magic_cold','magic_wind','magic_earth','magic_light','magic_shadow','magic_mind','magic_physical']);
 assert.equal(affinityTactics,TACTICS);
 for(const e of ELEMENTS)assert.ok(TACTICS.includes(`magic_${e}`));
 assert.equal(canonicalElement('ice'),'cold');assert.equal(canonicalElement('thunder'),'lightning');assert.equal(canonicalElement('magic_fire'),'fire');
 assert.equal(canonicalElement('untyped'),'physical');assert.equal(canonicalElement('nonsense'),null);
 assert.equal(tacticElement('armed'),null);assert.equal(tacticElement('magic_shadow'),'shadow');
});

test('全部生物都有词表内性状标签，旧生物属性弱点抗性原样进入亲和', () => {
 assert.deepEqual(validateTraits(world),[]);
 assert.equal(world.monsters.length,168);
 for(const s of world.monsters){
  const t=creatureTraits(s);
  assert.ok(t.tags.includes('creature')&&s.tags.every(x=>t.tags.includes(x)),s.id);
  assert.ok(s.tags.every(x=>CREATURE_TAGS.includes(x)));
  if(s.nature){assert.deepEqual(t.affinity,{weak:s.nature.affinity.weak,resist:s.nature.affinity.resist});assert.equal(t.source,'nature');}
  else assert.deepEqual(t.affinity,{weak:[],resist:[]});
 }
 const ember=creatureTraits(world.monsters.find(m=>m.id==='monster_ember_elemental'));
 assert.ok(ember.elements.includes('fire')&&ember.tags.includes('elemental'));
 const ghost=creatureTraits(world.monsters.find(m=>m.id==='monster_mist_flat_soul'));
 assert.ok(ghost.tags.includes('undead')&&ghost.tags.includes('spirit'));
 const broken=structuredClone(world);broken.monsters[0].tags=['dragonfire'];
 assert.match(validateTraits(broken)[0],/词表/);
 broken.monsters[0].tags=[];assert.match(validateTraits(broken)[0],/非空/);
 for(const s of world.monsters)assert.ok(Array.isArray(s.tags)&&s.tags.length,`${s.id} 正式目录须有标签`);
});

test('物品标签派生材质：书即纸、铁即金属、潮湿与可燃互斥', () => {
 const byTag=tag=>world.items.find(i=>i.tags?.includes(tag));
 assert.ok(hasTrait(itemTraits(byTag('book')),'paper'));
 assert.ok(hasTrait(itemTraits(byTag('iron')),'metal'));
 const cloth=byTag('clothing'),dry=itemTraits(cloth),wet=itemTraits(cloth,{moisture:3});
 assert.ok(hasTrait(dry,'clothing')&&hasTrait(dry,'cloth')&&hasTrait(dry,'flammable'));
 assert.ok(hasTrait(wet,'wet')&&!hasTrait(wet,'flammable')&&hasTrait(wet,'conductive'));
 assert.ok(hasTrait(itemTraits(byTag('grain')),'grain'));
 for(const item of world.items)assert.ok(itemTraits(item).tags.includes('item'));
});

test('地点特征、地形、天气与法术都读成同一套标签', () => {
 const rows=world.locations.flatMap(l=>(l.features??[]).map(f=>({...f,location:l.id})));
 const strip=rows.find(f=>f.id==='feature_s2_fire_strip'),latch=rows.find(f=>f.id==='feature_s4_iron_latch'),pool=rows.find(f=>f.kind==='water');
 assert.ok(hasTrait(featureTraits(strip),'grass')&&hasTrait(featureTraits(strip),'flammable'));
 assert.ok(hasTrait(featureTraits(strip,{thermal:{burning:true,moistureMg:0,energyJ:0}}),'burning'));
 assert.ok(hasTrait(featureTraits(strip,{thermal:{burning:false,moistureMg:5,energyJ:0}}),'wet'));
 assert.ok(hasTrait(featureTraits(latch),'metal')&&hasTrait(featureTraits(latch),'conductive'));
 assert.ok(hasTrait(featureTraits(pool),'water'));
 assert.ok(hasTrait(featureTraits(pool,{...pool.state,frozenUntil:100},50),'frozen'));
 assert.ok(!hasTrait(featureTraits(pool,{...pool.state,frozenUntil:100},100),'frozen'));
 const marsh=world.locations.find(l=>l.terrain==='泥炭湿地'),ice=world.locations.find(l=>l.terrain==='冰蚀裂谷');
 assert.ok(hasTrait(locationTraits(marsh),'wet'));assert.ok(hasTrait(locationTraits(ice),'frost'));
 const rain=locationTraits(world.locations.find(l=>l.terrain==='沙丘与砾坡'),{kind:'rain',indoors:false});
 assert.ok(hasTrait(rain,'raining')&&hasTrait(rain,'wet')&&!hasTrait(rain,'dry')&&rain.elements.includes('water'));
 assert.ok(hasTrait(locationTraits(marsh,{kind:'rain',indoors:true}),'indoor'));
 const fire=world.spells.find(s=>s.effectSpec?.kind==='damage'&&s.effectSpec.damageType==='fire');
 assert.deepEqual(spellTraits(fire).elements,['fire']);
 const ink=world.spells.find(s=>s.effectSpec?.medium==='ink');assert.deepEqual(spellTraits(ink).elements,[]);
});

test('traitsOf 按编号分派并读实际状态而不写存档', () => {
 const before=JSON.stringify(doc);
 const item=world.items.find(i=>i.tags?.includes('clothing'));
 const state=structuredClone(doc.state);state.inventory[item.id]={quantity:1,moisture:2};
 assert.ok(hasTrait(traitsOf(engine,state,item.id),'wet'));
 assert.ok(hasTrait(traitsOf(engine,doc,'monster_resin_lump'),'resin'));
 state.creatures={monster_x1:{species:'monster_grey_ridge_wolf',status:'正常'}};
 assert.ok(hasTrait(traitsOf(engine,state,'monster_x1'),'fur'));
 state.records={'physical_feature:feature_s2_fire_strip':{category:'physical_feature',id:'feature_s2_fire_strip',state:{thermal:{burning:true,moistureMg:0,energyJ:0}}}};
 assert.ok(hasTrait(traitsOf(engine,state,'feature_s2_fire_strip'),'burning'));
 assert.ok(hasTrait(traitsOf(engine,doc,'player'),'humanoid'));
 assert.ok(traitsOf(engine,doc,world.locations[0].id).tags.includes('location'));
 assert.equal(traitsOf(engine,doc,'item_missing_thing'),null);
 assert.equal(JSON.stringify(doc),before);
});
