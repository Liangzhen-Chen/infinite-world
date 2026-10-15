import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {validateMagicCatalog} from '../server-plugin/magic.mjs';
import {studyBook} from '../server-plugin/education.mjs';
import {fixture as educationFixture,run as educationRun} from './fixtures/education.mjs';
const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const skill=p=>({proficiency:p,breakthroughs:[],daily:{}});
function fresh(template='spell_s3_mend_palm',p=600){
 const c=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'spell-research');
 const role=engine.byId.get(engine.byId.get(template).skill).profession;
 if(engine.byId.get(role)?.kind==='life')c.state.professions.life=[role];else c.state.professions.combat=role;
 c.state.location='bld_hw_school';c.state.player.coins=1000;c.state.player.attributes.智力=100;c.state.player.attributes.精神=100;
 const b=engine.byId.get(template);for(const m of b.materials)c.state.inventory[m.item]={quantity:10,quality:'?',durability:100,weight:0.1};c.state.skills[b.skill]=skill(p);c.state.skills.skill_literacy=skill(600);
 c.state.projects.research_test={id:'research_test',type:'研究',name:'掌伤术式',concept:'以既有原语研究伤口处理',skills:[b.skill],stage:'打磨',progress:3,days:[0,1,2],result:null};
 return c;
}
const run=async(c,tool,args,id='test')=>{const out=await engine.reduce(c,{tool,args,eventId:id});return {document:applyPatches(c,out.patches),result:out.result};};
const create=(c,template='spell_s3_mend_palm',data={})=>run(c,'world_create',{type:'spell',name:'拢掌微愈',project:'research_test',data:{template,...data}},'register');
async function success(c,tool,args,label){for(let i=0;i<40;i++){const r=await run(c,tool,args,`${label}_${i}`);if(r.result.success)return r;}throw Error('未找到成功骰');}

test('研究法术登记后由项目学习，再真实施放；重复、越阶和未完成研究被拒绝',async()=>{
 const c=fresh(),registered=await create(c),spell=registered.result.entity;
 assert.equal(registered.document.state.projects.research_test.result,spell);
 const catalog=registered.document.state.created[spell];assert.deepEqual(validateMagicCatalog(catalog,{requireHandler:true}),[]);
 assert.equal(catalog.source,'research_test');assert.equal(catalog.skill,'skill_s3_mend_palm');assert.ok(!registered.document.state.spells[spell]);
 const learned=await success(registered.document,'world_learn',{entity:spell,kind:'spell',source:'research_test'},'learn');
 assert.deepEqual(learned.document.state.spells[spell].source,{type:'research',id:'research_test'});
 learned.document.state.player.hp=10;learned.document.state.player.maxHp=50;
 const cast=await success(learned.document,'world_cast',{spell,target:'player'},'cast');
 assert.equal(cast.document.state.player.hp,14);assert.equal(cast.result.mpCost,catalog.mp);
 await assert.rejects(run(registered.document,'world_create',{type:'spell',name:'另一掌伤法',project:'research_test',data:{template:'spell_s3_mend_palm'}},'duplicate'),/已经登记/);
 const unfinished=fresh();unfinished.state.projects.research_test.stage='原型';await assert.rejects(create(unfinished),/多日研究/);
 await assert.rejects(create(fresh(undefined,200)),/不足以承认|最高阶段减一/);
 await assert.rejects(create(fresh(),undefined,{power:5000}),/强度/);
 await assert.rejects(create(fresh(),undefined,{targeting:{}}),/不支持覆盖/);
 const mismatch=fresh(),otherSkill=world.skills.find(s=>s.profession===mismatch.state.professions.combat&&s.id!=='skill_s3_mend_palm').id;
 mismatch.state.skills[otherSkill]=skill(600);mismatch.state.projects.research_test.skills=[otherSkill];await assert.rejects(create(mismatch),/关联技能/);
});

test('失败仍耗魔与时间，大失败反噬；同意和社会法典边界随研究成果保留',async()=>{
 const r=await create(fresh()),spell=r.result.entity,catalog=r.document.state.created[spell];
 r.document.state.spells[spell]={source:{type:'research',id:'research_test'}};
 let failed;
 for(let i=0;i<120;i++){const out=await run(r.document,'world_cast',{spell,target:'player'},`fail_${i}`);if(out.result.degree==='大失败'){failed=out;break;}}
 assert.ok(failed);assert.equal(failed.result.success,false);assert.equal(failed.document.state.player.mp,r.document.state.player.mp-catalog.mp);
 assert.equal(failed.document.state.player.hp,r.document.state.player.hp-catalog.failureDamage);
 const other=fresh('spell_mind_01'),registered=await create(other,'spell_mind_01'),mental=registered.result.entity;
 assert.deepEqual(registered.document.state.created[mental].targeting,engine.byId.get('spell_mind_01').targeting);
 registered.document.state.spells[mental]={};registered.document.state.npcs.npc_hw_luqing.location=other.state.location;
 await assert.rejects(run(registered.document,'world_cast',{spell:mental,target:'npc_hw_luqing'},'without-consent'),/同意|许可|目标实际/);
 assert.deepEqual(registered.document.state.created[mental].law,engine.byId.get('spell_mind_01').law);
});

test('研究书稿携带成果并沿 RW-05 书本学习入口传播',async()=>{
 const r=await create(fresh()),spell=r.result.entity;r.document.state.spells[spell]={};
 r.document.state.inventory.item_parchment={quantity:5,quality:'木',durability:100,weight:0.06};
 const wrote=await success(r.document,'world_research',{operation:'write',name:'掌伤研习录',concept:'掌伤照护记录',entities:[spell]},'write');
 const work=wrote.document.state.works[wrote.result.work];assert.deepEqual(work.knowledge.teaches,[spell]);
 assert.equal(wrote.document.state.created[work.knowledge.teaches[0]].source,'research_test');
 const published=await run(wrote.document,'world_research',{operation:'publish',project:work.id,coins:200},'publish');
 const instance=published.result.instances[0];assert.ok(instance);assert.deepEqual(published.document.state.itemInstances[instance].book.teaches,[spell]);
 const c=published.document;delete c.state.spells[spell];
 const learned=await success(c,'world_learn',{entity:spell,source:instance},'read');assert.equal(learned.document.state.spells[spell].source.type,'book');
 // RW-05's shared book gate accepts the exact same registered formula.
 const scoped=engine.scoped(c),d={get:(...parts)=>parts.reduce((v,k)=>v?.[k],c)};assert.equal(studyBook(d,scoped,'player',instance,spell).book.author,'player');
 const f=educationFixture();f.doc.state.created[spell]=structuredClone(c.state.created[spell]);
 f.doc.state.itemInstances??={};f.doc.state.itemInstances[instance]=structuredClone(c.state.itemInstances[instance]);
 f.doc.state.inventory.item_work_book={quantity:1,instances:[instance]};f.doc.state.npcs[f.student].skills.skill_literacy=100;
 await educationRun(f,'world_learn',{operation:'book_give',source:instance,student:f.student},'give-spell');
 await educationRun(f,'world_learn',{operation:'book_study',source:instance,entity:spell,student:f.student,minutes:480},'study-spell');
 await educationRun(f,'world_time',{minutes:480},'finish-spell');
 assert.ok(f.doc.state.npcs[f.student].spells[spell]);assert.equal(f.doc.state.npcs[f.student].spells[spell].source.type,'book');
});

test('九族和 K10 的实际效果校验均可供研究登记，不接受未实现原语',async()=>{
 for(const template of ['spell_s1_tinder','spell_water_01','spell_s2_soil_read','spell_s2_hush','spell_s3_mend_palm','spell_s3_calm_guard','spell_s3_lamp_dim','spell_s4_home_purify','spell_s4_sleeve_store','spell_summon_04']){
  const r=await create(fresh(template),template);assert.deepEqual(validateMagicCatalog(r.document.state.created[r.result.entity],{requireHandler:true}),[],template);
 }
});

test('研究可用同族原语表达未在150术内的效果；非法操作、移除同意、材料和越阶仍拒绝',async()=>{
 const c=fresh('spell_s1_herb_read',900),spec={mechanism:'healing',effectSpec:{kind:'care',operation:'hemostasis',power:5},duration:0,targeting:{lineOfSight:true,consent:'healing'}};
 const r=await create(c,'spell_s1_herb_read',{spec:JSON.stringify(spec)}),spell=r.document.state.created[r.result.entity];
 assert.equal(spell.effectSpec.operation,'hemostasis');assert.deepEqual(validateMagicCatalog(spell,{requireHandler:true}),[]);
 await assert.rejects(create(c,'spell_s1_herb_read',{spec:JSON.stringify({...spec,effectSpec:{kind:'care',operation:'resurrect_anyone',power:5}})}),/尚未接入/);
 await assert.rejects(create(c,'spell_s1_herb_read',{spec:JSON.stringify({...spec,stage:8})}),/最高阶段减一/);
 const mental=fresh('spell_mind_01');await assert.rejects(create(mental,'spell_mind_01',{spec:JSON.stringify({targeting:{lineOfSight:true}})}),/同意或许可/);
});

test('从立项到实际三日成功研究，作品指标记录完成且仅完成后允许登记',async()=>{
 let c=fresh('spell_s3_mend_palm',600);c.state.projects={};
 const started=await run(c,'world_research',{operation:'start',name:'掌伤研究',concept:'受限照护',skills:['skill_s3_mend_palm']},'start');c=started.document;
 for(let day=0;day<3;day++){
  c.state.minute=day*1440+480;
  const out=await success(c,'world_research',{operation:'work',project:started.result.project,minutes:30,coins:5},`research_day_${day}`);c=out.document;
 }
 assert.equal(c.state.projects[started.result.project].stage,'打磨');assert.equal(c.state.careerMetrics.counters.researchCompleted,1);
 const registered=await run(c,'world_create',{type:'spell',name:'三日掌伤诀',project:started.result.project,data:{template:'spell_s3_mend_palm'}},'three-days');
 assert.equal(registered.document.state.created[registered.result.entity].source,started.result.project);
});

test('154旧骨架均有唯一去向；现有传讯与节拍不再记作缺失',async()=>{
 const map=JSON.parse(await fs.readFile('world/design/m4-skeleton-map.json','utf8'));
 assert.equal(map.rows.length,154);assert.equal(new Set(map.rows.map(r=>r.id)).size,154);
 for(const r of map.rows){
  if(r.disposition==='covered'){assert.ok(r.spells.length);for(const id of r.spells)assert.ok(engine.byId.get(id)?.effectSpec,id);}
  else{assert.equal(r.disposition,'research');assert.ok(r.research.reason);if(r.research.consumerReady)assert.ok(engine.byId.get(r.research.template)?.effectSpec);}
 }
 for(const id of ['spell_mind_04','spell_mind_07','spell_mind_13'])assert.equal(map.rows.find(r=>r.id===id).disposition,'covered');
});
