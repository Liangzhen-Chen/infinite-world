import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,run,open} from './fixtures/education.mjs';
import {npcPlanFingerprint} from '../server-plugin/npc-autonomy.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {educationCourses} from '../server-plugin/education-state.mjs';
const skill=p=>({proficiency:p,breakthroughs:[],daily:{}});

test('NPC与玩家均可授业，真实知识而非传闻决定可授内容',async()=>{
 const f=fixture();f.doc.state.npcs[f.student].skills.skill_literacy=0;
 const taught=await run(f,'world_learn',{entity:'skill_literacy',source:f.teacher,student:f.student},'npc-teach');assert.equal(taught.gained,40);
 const no=fixture();no.doc.state.npcs[no.teacher].skills={skill_literacy:0};no.doc.state.npcs[no.teacher].memoryStream=[{content:'听说过识字课',kind:'rumor'}];
 const before=structuredClone(no.doc);await assert.rejects(run(no,'world_learn',{entity:'skill_literacy',source:no.teacher,student:no.student},'rumor'),/掌握/);assert.deepEqual(no.doc,before);
});

test('携带抄本转交后读者按时间和识字能力学习；丢书停学，来源链不变',async()=>{
 const f=fixture(),item='item_literacy_primer',unit='unit_education_copy';f.doc.state.skills.skill_literacy=skill(300);
 f.doc.state.inventory[item]={quantity:1,instances:[unit]};f.doc.state.itemInstances??={};
 f.doc.state.itemInstances[unit]={id:unit,item,owner:'player',status:'持有',durability:100,minute:480,book:{grade:'初级',teaches:['skill_literacy'],edition:2,chain:['catalog:item_literacy_primer']}};
 f.doc.state.npcs[f.student].skills.skill_literacy=100;
 await run(f,'world_learn',{operation:'book_give',source:unit,student:f.student},'give');assert.equal(f.doc.state.itemInstances[unit].owner,f.student);assert.equal(f.doc.state.npcs[f.student].inventory[item].quantity,1);
 await run(f,'world_learn',{operation:'book_study',source:unit,entity:'skill_literacy',student:f.student},'read');
 await run(f,'world_time',{minutes:60},'readhalf');assert.equal(f.doc.state.npcs[f.student].skills.skill_literacy,100);
 await run(f,'world_time',{minutes:60},'readend');assert.equal(f.doc.state.npcs[f.student].skills.skill_literacy,140);
 assert.deepEqual(f.doc.state.itemInstances[unit].book.chain,['catalog:item_literacy_primer']);
 f.doc.state.itemInstances[unit].owner='player';await run(f,'world_time',{minutes:1440},'lost');assert.equal(f.doc.state.npcs[f.student].skills.skill_literacy,140);
});

test('已登记新配方经NPC先生传给学徒并进入真实制作；未受教者不能制造',async()=>{
 const f=fixture(),r={id:'recipe_education_trial',name:'榫片修整法',skill:'skill_life_6_core',minimumProficiency:100,learningRequired:true,learnMinutes:120,materials:[{item:'item_wood',amount:1}],tools:[],output:{item:'item_wood',quantity:1},minutes:30,difficulty:10,toolWear:0,failure:{recoverFraction:0,injury:0},byproducts:[]};
 f.w.recipes.push(r);f.w.npcs.find(n=>n.id===f.student).schedule.default[0].production=true;f.e=new WorldEngine(f.w);
 f.doc.state.npcs[f.teacher].skills={skill_life_6_core:400};f.doc.state.npcs[f.teacher].recipes={[r.id]:{source:{type:'research',id:'registered'},learnedAt:0}};
 f.doc.state.npcs[f.student].skills.skill_life_6_core=200;f.doc.state.npcs[f.student].inventory={item_wood:{quantity:10}};f.doc.state.npcs[f.student].goals={short:[],medium:[],long:[]};
 const plan=()=>({kind:'npc-plan',version:1,minute:f.doc.state.minute,stateFingerprint:npcPlanFingerprint(f.doc),proposals:[{npc:f.student,actions:[{kind:'craft',recipe:r.id}]}]});
 const prior=await f.e.reduce(f.doc,{type:'npc_plan',plan:plan(),eventId:'cannotcraft'});assert.ok(prior.result.results.some(row=>row.accepted===false||row.reason||row.error));
 await run(f,'world_learn',{source:f.teacher,student:f.student,entity:r.id,kind:'recipe'},'diffuse');assert.ok(f.doc.state.npcs[f.student].recipes[r.id]);
 const after=await f.e.reduce(f.doc,{type:'npc_plan',plan:plan(),eventId:'cancraft'});assert.equal(after.result.results[0].status,'进行中',JSON.stringify(after.result));
 f.doc=applyPatches(f.doc,after.patches);await run(f,'world_time',{minutes:30},'craftend');assert.ok(Object.values(f.doc.state.itemInstances??{}).some(u=>u.recipe===r.id&&u.owner===f.student));
});

test('迁居师徒保留掌握记录，课程目的地由新住地派生；传闻不会生成掌握记录',()=>{
 const f=fixture(),recipe=f.w.recipes[0];f.doc.state.npcs[f.teacher].recipes={[recipe.id]:{learnedAt:0}};f.doc.state.npcs[f.student].relationships={[f.teacher]:{type:'师父'}};
 for(const id of [f.teacher,f.student])f.doc.state.npcs[id].residence={home:'bld_hw_school',settlement:'loc_hw',since:480};
 const c=educationCourses(f.e,f.doc.state).find(c=>c.apprentice);assert.equal(c.location,'bld_hw_school');
 for(const id of [f.teacher,f.student])f.doc.state.npcs[id].residence={home:'bld_bs_inn',settlement:'loc_bs',since:600};
 const moved=educationCourses(f.e,f.doc.state).find(c=>c.apprentice);assert.equal(moved.location,'bld_bs_inn');assert.ok(f.doc.state.npcs[f.teacher].recipes[recipe.id]);assert.equal(f.doc.state.npcs[f.student].recipes?.[recipe.id],undefined);
});
