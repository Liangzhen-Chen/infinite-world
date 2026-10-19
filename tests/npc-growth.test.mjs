import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {npcPlanFingerprint,npcPlanningContext} from '../server-plugin/npc-autonomy.mjs';
import {scheduleAt,npcAvailability} from '../server-plugin/npc-schedule.mjs';
import {npcSchedule} from '../server-plugin/npc-state.mjs';
import {validateNpcGrowthRules} from '../server-plugin/npc-growth.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_ayan',mill='bld_hw_mill',DAY=1440;
function fixture({player=mill,skills={skill_life_6_core:900,skill_life_3_core:900}}={}){
 const world=structuredClone(source),base=world.npcs.find(n=>n.id===npc);
 base.schedule={default:[{start:0,end:1440,location:mill,activity:'做木工',services:[]}]};base.goals={short:[],medium:[],long:[]};
 const engine=new WorldEngine(world),doc=engine.initialFromLegacy(seed,'npc-growth-test');doc.state.minute=600;doc.state.location=player;
 for(const actor of Object.values(doc.state.npcs))actor.activity??='日常活动';
 Object.assign(doc.state.npcs[npc],{location:mill,activity:'做木工',status:'正常',coins:200,goals:base.goals,skills:{skill_life_6_core:120,skill_life_3_core:200},
  inventory:{item_wood:{quantity:40},item_whittling_knife:{quantity:1,durability:500}}});
 doc.state.professions.life=['profession_life_6','profession_life_3'];
 for(const [skill,proficiency] of Object.entries(skills))doc.state.skills[skill]={proficiency,grade:'中级1等',breakthroughs:[],daily:{}};
 return{world,engine,doc};
}
async function run(s,input){const out=await s.engine.reduce(s.doc,input);s.doc=applyPatches(s.doc,out.patches);return out;}
const teach=(s,entity='skill_life_6_core',extra={})=>run(s,{tool:'world_learn',args:{entity,source:'player',student:npc,...extra},eventId:`teach-${s.doc.state.minute}-${entity}`});
const wait=(s,minutes)=>run(s,{tool:'world_time',args:{minutes},eventId:`wait-${s.doc.state.minute}-${minutes}`});
const plan=(s,actions)=>run(s,{type:'npc_plan',eventId:`plan-${s.doc.state.minute}`,plan:{kind:'npc-plan',version:1,minute:s.doc.state.minute,stateFingerprint:npcPlanFingerprint(s.doc),proposals:[{npc,actions}]}});
const skill=(s,id='skill_life_6_core')=>s.doc.state.npcs[npc].skills[id];
const reload=s=>({...s,engine:new WorldEngine(structuredClone(s.world)),doc:JSON.parse(JSON.stringify(s.doc))});
async function nextMorning(s){await wait(s,DAY-s.doc.state.minute%DAY+600);}
const rejects=async(promise,pattern)=>assert.rejects(promise,pattern);

test('世界规则登记的人物成长参数与营生均有效',()=>{assert.deepEqual(validateNpcGrowthRules(source),[]);assert.ok(source.rules.npcGrowth.vocations.length>=4);});

test('玩家教学花两小时带来有限增长，每天一次，受教者不越过教者与总上限',async()=>{
 const s=fixture(),coins=s.doc.state.player.coins,out=await teach(s);
 assert.equal(out.result.gained,40);assert.equal(out.result.minutes,120);assert.equal(s.doc.state.minute,720);assert.equal(skill(s),160);assert.equal(s.doc.state.player.coins,coins);
 assert.equal(s.doc.state.npcs[npc].growth.skills.skill_life_6_core.teach,40);assert.ok(s.doc.state.npcs[npc].memoryStream.some(m=>m.kind==='learn'&&m.participants.includes('player')));
 const before=structuredClone(s.doc);await rejects(teach(s),/隔日/);assert.deepEqual(s.doc,before);
 await nextMorning(s);s.doc.state.npcs[npc].skills.skill_life_6_core=790;await teach(s);assert.equal(skill(s),800,'教者900减余量100为上限');
 await nextMorning(s);await rejects(teach(s),/接近你的水平/);
 const capped=fixture({skills:{skill_life_6_core:3000}});capped.doc.state.npcs[npc].skills.skill_life_6_core=1190;await teach(capped);assert.equal(skill(capped),1200,'绝对上限');
 const total=fixture({skills:{skill_life_6_core:3000}});total.doc.state.npcs[npc].growth={skills:{skill_life_6_core:{base:120,teach:580,work:0,sessions:20}}};
 await teach(total);assert.equal(skill(total),140,'单项累计增长上限600');await nextMorning(total);await rejects(teach(total),/成长上限/);
});

test('教学条件不足时拒绝且不改账',async()=>{
 const cases=[
  [fixture({player:'loc_capital'}),{},/不在场/],
  [fixture({skills:{}}),{},/没有掌握/],
  [fixture(),{entity:'spell_light',kind:'spell'},/只能向人物传授技能或配方/],
  [fixture(),{entity:'recipe_wooden_pegs',kind:'recipe'},/没有学会这个配方/],
 ];
 const sleeping=fixture();sleeping.world.npcs.find(n=>n.id===npc).schedule.default=[{start:0,end:660,location:mill,activity:'睡眠',services:[]},{start:660,end:1440,location:mill,activity:'做木工',services:[]}];sleeping.engine=new WorldEngine(sleeping.world);
 cases.push([sleeping,{},/清醒空闲/]);
 const sick=fixture();sick.doc.state.npcs[npc].status='患病';cases.push([sick,{},/患病/]);
 for(const [s,args,pattern] of cases){const before=structuredClone(s.doc);await rejects(teach(s,args.entity,args.kind?{kind:args.kind}:{}),pattern);assert.deepEqual(s.doc,before);}
});

test('玩家可把已会配方教给技能够格的人物，之后人物自主工作会用到',async()=>{
 const s=fixture();s.doc.state.recipes.recipe_w3_fish_broth={source:{type:'teacher',id:'npc_hw_linsui'},learnedAt:0};
 const out=await teach(s,'recipe_w3_fish_broth',{kind:'recipe'});assert.equal(out.result.kind,'recipe');assert.ok(s.doc.state.npcs[npc].recipes.recipe_w3_fish_broth);
 const context=npcPlanningContext(s.engine,s.doc).people.find(p=>p.id===npc);assert.ok(context.knownRecipes.some(r=>r.id==='recipe_w3_fish_broth'));
});

test('实际工作带来小幅增长，每日有上限，失败也只算实作',async()=>{
 const s=fixture({player:'loc_capital'}),gains=[];
 for(let i=0;i<3;i++){const out=await plan(s,[{kind:'craft',recipe:'recipe_wooden_pegs'}]);assert.equal(out.result.results[0].status,'进行中');await wait(s,20);
  const record=s.doc.state.npcAutonomy.actions[out.result.results[0].id];gains.push(record.outcome.growth?.gained??0);
  assert.equal(record.outcome.growth?.gained??0,record.outcome.success?Math.min(6,12-gains.slice(0,-1).reduce((a,b)=>a+b,0)):Math.min(2,12-gains.slice(0,-1).reduce((a,b)=>a+b,0)));}
 const sum=gains.reduce((a,b)=>a+b,0);assert.ok(sum>0&&sum<=12);assert.equal(skill(s),120+sum);assert.equal(s.doc.state.npcs[npc].growth.today.work,sum);
});

test('长步与短步、重放和存档恢复的工作成长一致',async()=>{
 const long=fixture({player:'loc_capital'}),short=reload(long);
 await wait(long,3*DAY);for(let i=0;i<72;i++)await wait(short,60);
 assert.equal(long.doc.state.minute,short.doc.state.minute);
 assert.ok(Object.keys(long.doc.state.npcAutonomy?.actions??{}).length>=3,'每天的规则工作都实际发生');
 assert.deepEqual(long.doc.state.npcs[npc].skills,short.doc.state.npcs[npc].skills);assert.deepEqual(long.doc.state.npcs[npc].growth,short.doc.state.npcs[npc].growth);
 assert.ok(skill(long)>120);
 const a=fixture(),b=reload(a),input={tool:'world_learn',args:{entity:'skill_life_6_core',source:'player',student:npc},eventId:'teach-replay'};
 const first=await a.engine.reduce(a.doc,input),second=await b.engine.reduce(b.doc,input);assert.deepEqual(first.patches,second.patches);
 const saved=reload(a);await teach(a);await teach(saved);assert.deepEqual(a.doc,saved.doc);
});

async function qualify(s){
 for(let day=0;day<3;day++){await teach(s,'skill_life_3_core');await nextMorning(s);}
 assert.equal(skill(s,'skill_life_3_core'),320);
}
test('达到条件后换营生：作息、服务与职务改变，存档恢复后仍生效',async()=>{
 const s=fixture();
 let out=await plan(s,[{kind:'switch_vocation',vocation:'vocation_hw_qingdeng_cook'}]);assert.equal(out.result.results[0].status,'拒绝');assert.match(out.result.results[0].reason,/熟练度不足/);
 await qualify(s);
 assert.ok(npcPlanningContext(s.engine,s.doc).people.find(p=>p.id===npc).vocations.some(v=>v.id==='vocation_hw_qingdeng_cook'));
 out=await plan(s,[{kind:'switch_vocation',vocation:'vocation_hw_qingdeng_cook'}]);assert.equal(out.result.results[0].status,'已完成');
 const vocation=s.doc.state.npcs[npc].vocation;assert.equal(vocation.id,'vocation_hw_qingdeng_cook');assert.equal(s.doc.state.npcs[npc].occupation,'青灯酒馆帮厨');assert.equal(vocation.previous.occupation,'修理学徒');
 const day=Math.floor(s.doc.state.minute/DAY)*DAY;
 assert.deepEqual([scheduleAt(s.engine,npc,day+60,s.doc.state).location,scheduleAt(s.engine,npc,day+600,s.doc.state).location],['bld_hw_qingdeng','bld_hw_qingdeng'],'改业基准夜间居所取当前家户，不复制旧工作日程');
 // S3-SV: the vocation still replaces the old authored services exactly;
 // the live slot additionally derives recipes from the cook's current station.
 assert.deepEqual(npcSchedule(s.engine,s.doc.state,npc,day+600).default.find(r=>r.start<=600&&600<r.end).services,['trade']);
 assert.ok(scheduleAt(s.engine,npc,day+600,s.doc.state).services.includes('recipe_bake_flatbread'));
 assert.ok(scheduleAt(s.engine,npc,day+600,s.doc.state).services.includes('teach'));
 const saved=reload(s);await nextMorning(saved);
 assert.equal(saved.doc.state.npcs[npc].location,'bld_hw_qingdeng');assert.equal(saved.doc.state.npcs[npc].activity,'在青灯酒馆后厨帮厨');
 // Restoring a save must retain both the exact vocation and its live services.
 saved.doc.state.location='bld_hw_qingdeng';
 assert.deepEqual(npcSchedule(saved.engine,saved.doc.state,npc).default.find(r=>r.start<=600&&600<r.end).services,['trade']);
 assert.deepEqual(npcAvailability(saved.engine,saved.doc.state,npc).services,scheduleAt(saved.engine,npc,saved.doc.state.minute,saved.doc.state).services);
 assert.ok(npcAvailability(saved.engine,saved.doc.state,npc).services.includes('recipe_bake_flatbread'));
 // The old catalog teaching service is replaced by the new livelihood's.
 const learner=reload(saved);learner.doc.state.skills={};learner.doc.state.recipes={};learner.doc.state.player.coins=500;
 await rejects(run(learner,{tool:'world_learn',args:{entity:'skill_life_6_core',source:npc},eventId:'learn-old'}),/资格/);
 out=await plan(saved,[{kind:'switch_vocation',vocation:'vocation_hw_mill_woodworker'}]);assert.match(out.result.results[0].reason,/尚未做满|熟练度不足/);
});

test('换营生条件不足或对象不合规时拒绝且不改账',async()=>{
 const s=fixture();s.doc.state.npcs[npc].skills.skill_life_3_core=500;
 await teach(s,'skill_life_3_core');await nextMorning(s);await teach(s,'skill_life_3_core');
 const before=structuredClone(s.doc.state.npcs[npc]);
 for(const [vocation,pattern] of [['vocation_hw_qingdeng_cook',/次数不足/],['vocation_missing',/未登记/],['vocation_bs_school_tutor',/熟练度不足/]]){
  const out=await plan(s,[{kind:'switch_vocation',vocation}]);assert.equal(out.result.results[0].status,'拒绝');assert.match(out.result.results[0].reason,pattern);
 }
 assert.deepEqual(s.doc.state.npcs[npc],before);
 const out=await plan(s,[{kind:'switch_vocation',vocation:'vocation_hw_qingdeng_cook',coins:5}]);assert.match(out.result.results[0].reason,/未实现字段/);
 const teacher=fixture(),institution=teacher.world.rules.training.institutions[0].teacher;
 teacher.doc.state.npcs[institution]&&Object.assign(teacher.doc.state.npcs[institution],{skills:{skill_literacy:900},growth:{skills:{skill_literacy:{base:900,teach:0,work:0,sessions:5}}}});
 const result=await run(teacher,{type:'npc_plan',eventId:'plan-institution',plan:{kind:'npc-plan',version:1,minute:teacher.doc.state.minute,stateFingerprint:npcPlanFingerprint(teacher.doc),proposals:[{npc:institution,actions:[{kind:'switch_vocation',vocation:'vocation_bs_school_tutor'}]}]}});
 assert.match(result.result.results[0].reason,/登记机构导师|独立成长/);
});
