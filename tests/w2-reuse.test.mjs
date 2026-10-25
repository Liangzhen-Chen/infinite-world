import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';import {mechanismMap} from '../tools/w2-mechanism-map.mjs';
import {reuseSpellCandidates} from '../world/design/w2-reuse-candidates.mjs';import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';import {applyPatches} from '../server-plugin/storage.mjs';
import {validateDraft} from '../tools/w2-reuse-content.mjs';
import {objectSpellCandidates} from '../world/design/m4-object-candidates.mjs';
const source=await loadWorld(),spells=reuseSpellCandidates(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
test('复用文案校验器时不会因父命令参数重新运行旧批次流水线',async()=>{
 const files=['world/drafts/m4-batch2/summary.json','world/drafts/m4-batch2/batch-0.json','world/drafts/m4-object/budget.json'];
 const before=await Promise.all(files.map(file=>fs.readFile(file,'utf8'))),argv=[...process.argv],key=process.env.DEEPSEEK_API_KEY,log=console.log,output=[];
 try{
  process.argv[1]=new URL('../tools/w2-reuse-content.mjs',import.meta.url).pathname;process.argv[2]='--draft';process.env.DEEPSEEK_API_KEY='';console.log=(...args)=>output.push(args);
  // A fresh module instance runs the command guard without spawning a process.
  await import(new URL('../tools/m4-batch2-content.mjs?argument-regression',import.meta.url));
 }finally{process.argv.splice(0,process.argv.length,...argv);if(key===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=key;console.log=log;}
 assert.deepEqual(output,[]);assert.deepEqual(await Promise.all(files.map(file=>fs.readFile(file,'utf8'))),before);
});
test('复用文案L1检查实际魔力数字和实现词泄漏，不把原稿当成通过依据',()=>{const e={...spells.find(x=>x.id==='spell_fire_08'),category:'spell'},prose={theory:'朝目标发出火焰。',casting:'指向可见目标。',failure:'失败消耗十四点魔力。',counters:['完整掩体。','超出射程。'],socialConsequences:'使用时承担伤人责任。',proficiencyEffects:['较难成功。','较易成功。','更少失手。','上限不变。']};assert.ok(validateDraft({id:e.id,prose},e).errors.some(x=>x.includes('魔力')));prose.failure='失败消耗十五点魔力。';assert.deepEqual(validateDraft({id:e.id,prose},e).errors,[]);prose.failure='前置不满足则拒绝且不扣款。';assert.ok(validateDraft({id:e.id,prose},e).errors.length);});
function setup(){const world=source;const engine=new WorldEngine(world),d=engine.createCharacter(seed,{},'w2-reuse');d.state.location='loc_hw_dock';d.state.player.mp=1000;d.state.player.maxMp=1000;d.state.player.level=60;d.state.player.attributes.精神=30;d.state.player.hp=500;d.state.player.maxHp=500;d.state.professions.combat='profession_mage';d.state.weather.loc_hw_dock={humidityPercent:70};
 for(const s of spells){d.state.spells[s.id]={source:{type:'fixture'}};d.state.skills[s.skill]={proficiency:120,daily:{},breakthroughs:[]};}for(const id of ['item_resin','item_iron'])d.state.inventory[id]={quantity:5};d.state.records.permit={category:'authorization',action:'mental_magic',subject:'player',grantor:'npc_hw_gucen',location:d.state.location,expires:d.state.minute+100};
 const run=async(document,tool,args,id)=>{const out=await engine.reduce(document,{tool,args,eventId:id});return{document:applyPatches(document,out.patches),result:out.result};};const cast=async(document,spell,args={})=>{for(let i=0;i<60;i++){const out=await run(document,'world_cast',{spell,target:'player',...args},`${spell}_${i}`);if(out.result.success)return out;}throw Error('无成功骰点:'+spell);};return{world,engine,d,run,cast};}
test('154骨架逐条归类；14条正式内容保留审核骨架，缺失机制仍不算实现',async()=>{
 const r=mechanismMap(source),published=new Set(source.spells.map(s=>s.id));
 assert.equal(r.total,154);assert.equal(new Set(r.rows.map(x=>x.id)).size,154);assert.equal(spells.length,14);
 const ids=new Set(spells.map(s=>s.id));assert.equal(source.spells.filter(s=>ids.has(s.id)).length,14);
 const candidate=JSON.parse(await fs.readFile('world/drafts/w2-reuse/candidate.json','utf8'));
 for(const s of spells){
  const actual=source.spells.find(x=>x.id===s.id);assert.deepEqual(actual,candidate.spells.find(x=>x.id===s.id));
  for(const [key,value]of Object.entries(s))assert.deepEqual(actual[key],value);
  assert.deepEqual(validateMagicCatalog(actual,{requireHandler:true}),[]);assert.equal(r.rows.find(x=>x.id===s.id).status,'published');
 }
 // Later consumer cards can make these skeletons ready without publishing them.
 for(const id of ['spell_life_01','spell_life_05','spell_water_08','spell_earth_07','spell_light_03']){
  const row=r.rows.find(x=>x.id===id);assert.equal(row.status,published.has(id)?'published':'consumer-ready');assert.deepEqual(row.validation,[]);assert.ok(row.handler);
 }
 for(const s of objectSpellCandidates){const row=r.rows.find(x=>x.id===s.id);assert.equal(row.status,published.has(s.id)?'published':'reviewed-unpublished');assert.deepEqual(row.validation,[]);}
 // A valid numerical spec alone does not publish an unsupported mechanism.
 for(const row of r.rows.filter(x=>x.status==='missing-consumer'))assert.equal(published.has(row.id),false);
 assert.ok(validateMagicCatalog({...spells[0],effectSpec:undefined},{requireHandler:true}).length,'缺少处理器的骨架仍须拒绝');
});
test('全部14条真实施法改变对应水量、衣物、耐久、防护或契约；没有新增处理器',async()=>{const {world,d,cast}=setup();const water=id=>world.locations.flatMap(l=>l.features??[]).find(f=>f.id===id).state;
 for(const s of spells){const doc=structuredClone(d);let args={};if(s.mechanism==='dry'){doc.state.inventory.item_clothes.moisture=70;args.target='item_clothes';}if(s.mechanism==='repair_metal'){const item=world.items.find(x=>x.tags?.includes('metal')&&x.durability>20);assert.ok(item);doc.state.inventory[item.id]={quantity:1,durability:10,maxDurability:item.durability};args.target=item.id;}
 const targets={condense:'feature_hw_cup',clean_water:'feature_hw_pool',sense_water:'feature_hw_pool',irrigate:'feature_hw_channel',clear_silt:'feature_hw_channel',soil_water:'feature_hw_plot'};if(targets[s.mechanism])args.target=targets[s.mechanism];if(s.school==='精神')args.permit='permit';const out=await cast(doc,s.id,args);assert.equal(out.document.state.player.mp,doc.state.player.mp-s.mp,s.id);assert.equal(out.document.state.minute,doc.state.minute+s.minutes,s.id);
 switch(s.mechanism){case'dry':assert.equal(out.document.state.inventory.item_clothes.moisture,0);break;case'repair_metal':assert.equal(out.document.state.inventory[args.target].durability,30);assert.equal(out.document.state.inventory.item_iron.quantity,4);assert.equal(out.document.state.inventory.item_resin.quantity,4);break;case'damage_fire':assert.ok(out.result.damage>0);break;case'condense':assert.equal(out.result.condensedMl,35);break;case'clean_water':assert.equal(out.document.state.records['physical_feature:feature_hw_pool'].state.toxinUg,water('feature_hw_pool').toxinUg);break;case'sense_water':assert.equal(out.result.observation.salinityPpt,.2);break;case'clear_silt':assert.equal(out.document.state.records['physical_feature:feature_hw_channel'].state.loosenedSiltGrams,2000);break;case'irrigate':case'soil_water':assert.ok(out.document.state.records['physical_feature:feature_hw_plot'].state.waterMl>0);break;case'servant':assert.ok(Object.values(out.document.state.effects).some(e=>e.summonType==='water_cup'));break;default:assert.ok(Object.values(out.document.state.effects).some(e=>e.status===s.effectSpec.status));}
 }
});
test('外部生命目标不在场、精神许可缺失拒绝，原存档钱物时间不变',async()=>{const {d,run}=setup();assert.notEqual(d.state.npcs.npc_hw_linsui.location,d.state.location);const old=structuredClone(d);await assert.rejects(run(d,'world_cast',{spell:'spell_fire_08',target:'npc_hw_linsui'},'no-position'),/法术目标不在场/);await assert.rejects(run(d,'world_cast',{spell:'spell_mind_05',target:'player'},'no-permit'),/许可/);assert.deepEqual(d,old);});


