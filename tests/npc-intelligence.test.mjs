import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyNpcPlan,npcPlanFingerprint,npcPlanningContext} from '../server-plugin/npc-autonomy.mjs';
import {intelligenceOf,growIntelligence,intelligenceSign,recordIntelligenceEvents,advanceNpcNeeds,npcNeedGoals,noteTrick,adaptationBonus,trickKey,goalsWithinHorizon,GROWTH_TO_NEXT} from '../server-plugin/npc-intelligence.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),actor='npc_hw_ayan',other='npc_hw_hezhou',mill='bld_hw_mill',DAY=1440;
function draft(document){return {document,get(...p){return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};}
async function setup(){
 const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'intelligence-test');
 document.state.minute=600;document.state.location=mill;
 Object.assign(document.state.npcs[actor],{location:mill,activity:'修木件',status:'正常'});
 return {world,engine,d:draft(document)};
}
const setLevel=(d,id,level,growth=0)=>d.set(['state','npcs',id,'intelligence'],{level,growth});
const plan=(d,actions)=>({kind:'npc-plan',version:1,minute:d.get('state','minute'),stateFingerprint:npcPlanFingerprint(d.document),proposals:[{npc:actor,actions}]});

test('灵智决定计划步数：守常只做一步，谋划可排三步',async()=>{
 const {engine,d}=await setup(),pegs={kind:'craft',recipe:'recipe_wooden_pegs'};
 setLevel(d,actor,1);let out=applyNpcPlan(d,engine,plan(d,[pegs,pegs]),'p1');
 assert.match(out.results[1].reason,/灵智/);assert.doesNotMatch(out.results[0].reason??'',/灵智/);
 const s=await setup();setLevel(s.d,actor,3);out=applyNpcPlan(s.d,s.engine,plan(s.d,[pegs,pegs,pegs]),'p3');
 assert.equal(out.results.length,3);assert.ok(out.results.every(r=>!/灵智/.test(r.reason??'')));
});

test('灵智决定打破惯例与看多远：觉悟者能在非生产时段做工，智能层只给视野内目标',async()=>{
 for(const [level,ok]of [[2,false],[4,true]]){
  const {world,engine,d}=await setup();world.npcs.find(n=>n.id===actor).schedule={default:[{start:0,end:1440,location:mill,activity:'照看磨坊',services:[],production:false}]};
  setLevel(d,actor,level);const out=applyNpcPlan(d,engine,plan(d,[{kind:'craft',recipe:'recipe_wooden_pegs'}]),'routine');
  if(ok)assert.equal(out.results[0].status,'进行中');else assert.match(out.results[0].reason,/作息/);
 }
 const goals={short:[{id:'a',deadlineDay:30}],mid:[{id:'b',deadlineDay:180}],long:[{id:'c',deadlineDay:720}]};
 assert.deepEqual(Object.values(goalsWithinHorizon(goals,intelligenceOf({byId:new Map()},{npcs:{x:{intelligence:{level:1}}}},'x').horizonDays,0)).flat().map(g=>g.id),['a']);
 assert.deepEqual(Object.values(goalsWithinHorizon(goals,720,0)).flat().map(g=>g.id),['a','b','c']);
 const {engine,d}=await setup(),context=npcPlanningContext(engine,d.document,{limit:8}),first=context.people[0];
 setLevel(d,first.id,1);const narrow=npcPlanningContext(engine,d.document,{limit:8}).people.find(p=>p.id===first.id);
 assert.equal(narrow.intelligence.maxActions,1);assert.ok(Object.values(narrow.goals).flat().every(g=>g.deadlineDay<=30));
});

test('需求驱动目标：钱、安全、地位；守常只对迫切缺口起意，缺口消失目标了结',async()=>{
 const {engine,d}=await setup(),minute=DAY;d.set(['state','minute'],minute);
 setLevel(d,actor,1);d.set(['state','npcs',actor,'coins'],80);advanceNpcNeeds(d,engine,minute);
 assert.equal(npcNeedGoals(d.get('state'),actor).length,0,'守常者对渐进缺口不起意');
 d.set(['state','npcs',actor,'coins'],0);advanceNpcNeeds(d,engine,minute);
 let goal=npcNeedGoals(d.get('state'),actor)[0];assert.equal(goal.need,'money');assert.equal(goal.steps.length,1);assert.ok(goal.deadlineDay-1<=30);
 d.set(['state','npcs',actor,'coins'],200);advanceNpcNeeds(d,engine,2*DAY);
 assert.equal(npcNeedGoals(d.get('state'),actor)[0].status,'已完成');

 setLevel(d,other,2);d.set(['state','npcs',other,'coins'],1);
 d.set(['state','records','world_event:hit'],{category:'world_event',id:'hit',verb:'harm',actor:'player',target:other,harm:3,tags:['combat','hostile'],witnesses:[actor,'npc_hw_linsui'],minute:2*DAY-10,location:mill});
 for(let day=2;day<=4;day++)advanceNpcNeeds(d,engine,day*DAY);
 const needs=npcNeedGoals(d.get('state'),other).filter(g=>g.status==='进行中').map(g=>g.need).sort();
 assert.deepEqual(needs,['money','safety','status']);
 assert.ok(npcNeedGoals(d.get('state'),other).every(g=>g.steps.length===2));

 setLevel(d,'npc_hw_linsui',3);advanceNpcNeeds(d,engine,4*DAY);
 const ambition=npcNeedGoals(d.get('state'),'npc_hw_linsui').find(g=>g.need==='status');assert.ok(ambition?.ambition);assert.equal(ambition.steps.length,4);
});

test('教导、共同经历与重大事件使人成长，跨门槛后场景卡出现世界内迹象而不显示数字',async()=>{
 const {engine,d}=await setup();setLevel(d,actor,2,GROWTH_TO_NEXT[2]-4);
 recordIntelligenceEvents(d,engine,[{id:'g1',verb:'gift',actor:'player',target:actor,value:100,witnesses:[other],tags:['gift']}],{});
 assert.equal(intelligenceOf(engine,d.get('state'),actor).level,2);assert.equal(d.get('state','npcs',actor,'intelligence','growth'),GROWTH_TO_NEXT[2]-1);
 assert.equal(d.get('state','npcs',other,'intelligence','growth'),1,'目击重大事件');
 assert.equal(growIntelligence(d,engine,actor,6,'教导','t1'),3,'每日成长有上限');
 assert.equal(intelligenceOf(engine,d.get('state'),actor).level,3);
 assert.ok(d.get('state','npcs',actor,'developments').some(r=>r.type==='灵智'&&r.source==='t1'));
 const card=engine.scene(d.document,'阿砚');
 assert.match(card,new RegExp(`近来变化：${intelligenceSign(d.get('state'),actor)}`));assert.doesNotMatch(card,/灵智|守常|谋划/);
});

test('真实教学经引擎记成长；玩家同一手法屡次得手后对手起防备',async()=>{
 const world=await loadWorld(),base=world.npcs.find(n=>n.id===actor);base.schedule={default:[{start:0,end:1440,location:mill,activity:'做木工',services:[]}]};base.goals={short:[],mid:[],long:[]};
 const engine=new WorldEngine(world);let doc=engine.initialFromLegacy(seed,'teach-intel');doc.state.minute=600;doc.state.location=mill;
 for(const a of Object.values(doc.state.npcs))a.activity??='日常活动';
 Object.assign(doc.state.npcs[actor],{location:mill,activity:'做木工',status:'正常',skills:{skill_life_6_core:120}});
 doc.state.professions.life=['profession_life_6'];doc.state.skills.skill_life_6_core={proficiency:900,grade:'中级1等',breakthroughs:[],daily:{}};
 const out=await engine.reduce(doc,{tool:'world_learn',args:{entity:'skill_life_6_core',source:'player',student:actor},eventId:'teach1'});
 doc=applyPatches(doc,out.patches);
 assert.ok(doc.state.npcs[actor].intelligence.growth>=6);assert.ok(doc.state.npcs[actor].intelligence.sources.some(s=>s.source==='教导'&&s.event==='teach1'));

 const d=draft(doc),key=trickKey('魅力',null);setLevel(d,other,1);setLevel(d,actor,2);
 for(let i=0;i<3;i++){noteTrick(d,engine,other,key,`c${i}`);noteTrick(d,engine,actor,key,`c${i}`);}
 assert.equal(adaptationBonus(engine,d.get('state'),actor,key),2);assert.equal(adaptationBonus(engine,d.get('state'),other,key),0,'守常者识破得更慢');
 assert.match(engine.scene(d.document,'阿砚'),/对你惯用的魅力手法已起防备/);
});

test('精怪开灵智与灵智等级打通：听息为1级，立意为2级，同一成长与迹象',async()=>{
 const {engine,d}=await setup(),species='monster_red_ear_fox';
 const base={species,name:'红耳',location:mill,status:'正常',hp:5,since:0};
 d.set(['state','creatures','fox_a'],{...base,mind:{version:1,firstDay:0,points:{experience:0,place:engine.rules.wildlifeAwakening.stages[0].points,item:0,mentor:0,clock:0},placeDays:{},sources:[]}});
 d.set(['state','creatures','fox_b'],{...base,name:'灰尾',mind:{version:1,firstDay:0,points:{experience:0,place:0,item:0,mentor:0,clock:0},placeDays:{},sources:[],awakened:{stage:'立意',kind:'natural',minute:0}}});
 d.set(['state','creatures','fox_c'],{...base,name:'短爪'});
 const level=id=>intelligenceOf(engine,d.get('state'),id,{seed:d.document.randomSeed}).level;
 assert.deepEqual([level('fox_c'),level('fox_a'),level('fox_b')],[0,1,2]);
 assert.equal(growIntelligence(d,engine,'fox_a',6,'教导','x'),0,'未立意的不记灵智账');
 d.set(['state','creatures','fox_b','mind','intelligence'],{level:2,growth:GROWTH_TO_NEXT[2]-2});
 assert.equal(growIntelligence(d,engine,'fox_b',2,'教导','sp1'),2);assert.equal(level('fox_b'),3);
 assert.match(engine.scene(d.document,''),/【精怪近况】灰尾（fox_b）/);
});
