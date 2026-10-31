import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {educationStatistics,educationCourses} from '../server-plugin/education-state.mjs';
import {organizationState} from '../server-plugin/organization-state.mjs';
import {personCertified} from '../server-plugin/entity-view.mjs';
import {fixture,run,open,world,seed} from './fixtures/education.mjs';
import {applyPatches,PatchCursor,withRecordIndex} from '../server-plugin/storage.mjs';
import {scaleFixture,fixtureDraft} from '../tools/scale-bench.mjs';
import {advanceLayerPlan} from '../server-plugin/advance-layers.mjs';
import {settlePopulationLayers,rosterLifeState} from '../server-plugin/population.mjs';
import {cohortRoster,expandedEducation} from '../server-plugin/education-cohorts.mjs';

test('meal receipts and bag consumption preserve courses; lost teacher literacy still removes school teaching',()=>{
 const f=fixture(),cursor=new PatchCursor(f.doc);
 withRecordIndex(()=>{
  const read=()=>educationCourses(f.e,cursor.expose(cursor.root.state));
  const before=read();assert.ok(before.some(c=>c.school&&c.teacher===f.teacher));
  // Meal metadata and an empty bread bag have no effect on literacy teaching.
  cursor.apply({op:'set',path:['state','family','meals','home'],value:{missingMeals:0}});
  cursor.apply({op:'set',path:['state','family','mealDays','loc_hw'],value:0});
  assert.equal(read(),before);
  cursor.apply({op:'set',path:['state','npcs',f.teacher,'inventory'],value:{}});assert.equal(read(),before);
  cursor.apply({op:'set',path:['state','npcs',f.teacher,'skills','skill_literacy'],value:0});
  const changed=read();assert.ok(changed.every(c=>!c.school||c.teacher!==f.teacher));
 });
});
test('开班、组织、公库雇师按实际课时离屏结算；技能与识字率从当前居民派生',async()=>{
 const f=fixture(),o=await open(f,{coins:100,wage:48});assert.equal(organizationState(f.e,f.doc.state,o.org).seat,'bld_hw_school');
 const money=f.doc.state.npcs[f.teacher].coins,treasury=organizationState(f.e,f.doc.state,o.org).treasury;
 f.doc.state.location='loc_bs';await run(f,'world_time',{minutes:240},'day1');
 assert.equal(f.doc.state.npcs[f.student].skills.skill_literacy,40);
 assert.equal(f.doc.state.records[`education_study:${o.course}:${f.student}`].completedMinutes,120);
 assert.equal(f.doc.state.npcs[f.teacher].coins-money,12);assert.equal(organizationState(f.e,f.doc.state,o.org).treasury,treasury-12);
 const before=educationStatistics(f.e,f.doc.state,'loc_hw');f.doc.state.npcs[f.student].skills.skill_literacy=120;
 const after=educationStatistics(f.e,f.doc.state,'loc_hw');assert.equal(after.literate,before.literate+1);
 const state=structuredClone(f.doc.state);educationStatistics(f.e,f.doc.state,'loc_hw');assert.deepEqual(f.doc.state,state);
});

test('短等待不提前学会；长短步与恢复结算一致；缺席停用、离职和无能力先生均不授业',async()=>{
 const a=fixture();await open(a);const b={...a,doc:structuredClone(a.doc)};
 await run(a,'world_time',{minutes:240},'whole');for(let i=0;i<4;i++)await run(b,'world_time',{minutes:60},`part${i}`);
 assert.deepEqual(a.doc.state.npcs[a.student].skills,b.doc.state.npcs[b.student].skills);
 assert.deepEqual(Object.values(a.doc.state.records).filter(r=>r.category==='education_study'),Object.values(b.doc.state.records).filter(r=>r.category==='education_study'));
 const c=fixture();await open(c);await run(c,'world_time',{minutes:150},'half');assert.equal(c.doc.state.npcs[c.student].skills.skill_literacy,0);
 c.doc.state.buildings.bld_hw_school={condition:0};await run(c,'world_time',{minutes:90},'closed');assert.equal(c.doc.state.npcs[c.student].skills.skill_literacy,0);
 const absent=fixture();await open(absent);absent.doc.state.npcs[absent.teacher].status='昏迷';await run(absent,'world_time',{minutes:240},'absent');assert.equal(absent.doc.state.npcs[absent.student].skills.skill_literacy,0);
 const no=fixture();no.doc.state.npcs[no.teacher].skills={skill_literacy:0};await assert.rejects(open(no),/掌握/);
});

test('场地容量、课时重叠、现有义务与停办约束持续课程',async()=>{
 const f=fixture();await open(f);const state=structuredClone(f.doc);await assert.rejects(open(f,{},'twice'),/重叠/);assert.deepEqual(f.doc,state);
 await assert.rejects(run(f,'world_promise',{operation:'create',promisor:f.student,promisee:'player',type:'会面',content:'同一课时约见',start:600,deadline:720,location:'bld_hw_school'},'overlap'),/授业/);
 await run(f,'world_settlement',{operation:'school_close',project:'education:open'},'close');await run(f,'world_time',{minutes:240},'closedwait');assert.equal(f.doc.state.npcs[f.student].skills.skill_literacy,0);
 const small=fixture();small.w.locations.find(p=>p.id==='bld_hw_school').capacity=0;small.e=new WorldEngine(small.w);await assert.rejects(open(small),/容量/);
});

test('既有学堂日程自动接入学生，跨日持续识字，不保存识字总分',async()=>{
 const e=new WorldEngine(world),f={e,doc:e.createCharacter(seed,{},'school')};
 const course=educationCourses(e,f.doc.state).find(c=>c.automatic&&c.entity==='skill_literacy');assert.ok(course?.students.length);
 const student=course.students[0],start=f.doc.state.minute;
 const opening=Math.min(...educationCourses(e,f.doc.state).filter(c=>c.students.includes(student)).map(c=>Math.floor(start/1440)*1440+c.start+(start%1440>c.start?1440:0)));
 assert.equal(f.doc.state.npcs[student],undefined);
 f.doc.state.location='loc_bs';await run(f,'world_time',{minutes:4*1440},'schooldays');
 assert.equal(f.doc.state.npcs[student].life.since,opening);
 assert.ok(f.doc.state.npcs[student].skills?.skill_literacy>0);assert.ok(educationStatistics(e,f.doc.state,'loc_hw').literate>0);
});

test('既有雇佣先生的实际工时可自动授业，工资沿用工账结算；停用校舍即停课',async()=>{
 const f=fixture(),org='school:bld_hw_school';
 await run(f,'world_settlement',{operation:'school_fund',business:org,budget:200},'public-school-fund');
 const id='contract:school-teacher';f.doc.state.records[id]={id,category:'contract',kind:'workshop',laborMarket:1,owner:org,worker:f.teacher,location:'bld_hw_school',task:'授业',starts:0,createdAt:0,deadline:10*1440,status:'有效',wage:48,workMinutes:480,nextWork:1020,paid:0,workedMinutes:0,produced:0,targetQuantity:100,shifts:[]};
 const c=educationCourses(f.e,f.doc.state).find(c=>c.employment===id);assert.ok(c?.students.length);assert.equal(c.start,480);assert.equal(c.end,720);
 const student=c.students[0],coins=f.doc.state.npcs[f.teacher].coins;await run(f,'world_time',{minutes:540},'employed-teaching');
 assert.equal(f.doc.state.npcs[student].skills.skill_literacy,40);assert.equal(f.doc.state.records[id].paid,48);assert.equal(f.doc.state.npcs[f.teacher].coins-coins,48);
 f.doc.state.buildings.bld_hw_school={condition:0};const learned=f.doc.state.npcs[student].skills.skill_literacy;await run(f,'world_time',{minutes:1440},'damaged-school');assert.equal(f.doc.state.npcs[student].skills.skill_literacy,learned);
});

test('居民须经真实职业考核认证，资格进入当前职业视图',async()=>{
 const f=fixture(),p=f.w.professions.find(p=>p.kind==='combat'&&p.entry&&f.w.npcs.some(n=>n.services?.includes(p.id)&&f.doc.state.npcs[n.id]));
 const teacher=f.w.npcs.find(n=>n.services?.includes(p.id));assert.ok(teacher);
 f.doc.state.npcs[teacher.id].location=f.doc.state.location;f.doc.state.npcs[teacher.id].status='正常';f.doc.state.npcs[f.student].level=p.minimumLevel;
 f.doc.state.npcs[f.student].skills[p.entry.skill]=p.entry.minimumProficiency;f.doc.state.npcs[f.student].attributes={[p.attribute]:30};f.doc.state.npcs[f.student].coins=1000;
 const result=await run(f,'world_profession',{profession:p.id,teacher:teacher.id,student:f.student},'exam');assert.equal(result.success,true);assert.ok(personCertified(f.e,f.doc.state,f.student,p.entry.skill));
 const saved=structuredClone(f.doc);await assert.rejects(run(f,'world_profession',{profession:p.id,teacher:f.student,student:f.student},'self'),/资格/);assert.deepEqual(f.doc,saved);
});

test('地方乡课实考凭据进入任职申请，原贡献与举荐仍决定任命；伪造凭据拒绝',async()=>{
 const w=structuredClone(world);for(const n of w.npcs)delete n.schedule;
 const e=new WorldEngine(w),f={e,doc:e.createCharacter(seed,{},'local-exam')},v=w.settlementProfiles.find(p=>p.id==='loc_bs_yupo'),g=v.details.governance;
 Object.assign(f.doc.state,{location:g.meetingPlace,minute:540});f.doc.state.player.age=25;f.doc.state.player.attributes.智力=40;f.doc.state.skills.skill_literacy={proficiency:100};
 Object.assign(f.doc.state.npcs[g.head],{location:g.meetingPlace,activity:'登记'});
 const passed=await run(f,'world_profession',{operation:'examine',profession:'local',teacher:g.head,institution:v.id},'local-pass');assert.equal(passed.success,true);
 assert.equal(Object.values(f.doc.state.records).some(r=>r.category==='governance_office'&&r.holder==='player'),false);
 const charter=w.rules.governance.authority.superiors.auth_bs_office_charter,clerk=w.npcs.find(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation));
 f.doc.state.location=charter.seat;Object.assign(f.doc.state.npcs[clerk.id],{location:charter.seat,activity:'递件'});
 const before=structuredClone(f.doc);f.doc.state.records[passed.qualification].student=g.head;
 await assert.rejects(run(f,'world_settlement',{operation:'governance_apply',settlement:v.id,name:'村长',sourceEvent:passed.qualification},'forged'),/凭据/);f.doc=before;
 const application=await run(f,'world_settlement',{operation:'governance_apply',settlement:v.id,name:'村长',sourceEvent:passed.qualification},'qualified-apply');
 assert.equal(application.pending.qualification,passed.qualification);
 const ready=structuredClone(f.doc);await run(f,'world_time',{minutes:3*1440},'unqualified-wait');assert.equal(f.doc.state.records[application.application].status,'未获任命');
 f.doc=ready;f.doc.state.records[`civic_citizen:${v.id}:player`]={category:'civic_citizen',status:'已登记'};
 f.doc.state.records['civic_source:exam-fixture']={category:'civic_contribution',sourceEvent:'exam-fixture',settlement:v.id,subject:'player',kind:'donation',points:120};
 f.doc.state.records[`standing:${g.head}:player`]={category:'standing',holder:g.head,target:'player',value:30,history:[]};
 await run(f,'world_time',{minutes:3*1440},'qualified-wait');assert.equal(f.doc.state.records[application.application].status,'已任命');
});

test('行会和门派地方考核沿真实职业任务认证，失败不生成合格凭据',async()=>{
 for(const mode of ['guild','sect']){
  const f=fixture();f.doc=f.e.createCharacter(seed,{},`${mode}-candidate`);f.doc.state.location='bld_hw_school';f.doc.state.player.coins=5000;
  const entry=mode==='sect'?f.w.rules.training.institutions.find(t=>f.doc.state.npcs[t.teacher]):null;
  const p=entry?f.w.professions.find(p=>p.id===entry.profession):f.w.professions.find(p=>p.kind==='combat'&&p.entry&&f.w.npcs.some(n=>n.services?.includes(p.id)&&f.doc.state.npcs[n.id]));
  const teacher=entry?.teacher??f.w.npcs.find(n=>n.services?.includes(p.id)).id;
  const b=f.w.npcs.find(n=>n.id===teacher);delete b.schedule;f.e=new WorldEngine(f.w);f.doc.state.npcs[teacher].location=f.doc.state.location;f.doc.state.player.level=p.minimumLevel;f.doc.state.player.attributes[p.attribute]=40;
  f.doc.state.skills[p.entry.skill]={proficiency:p.entry.minimumProficiency};
  const args={operation:'examine',profession:p.id,teacher,institution:'loc_hw',choice:mode};
  if(mode==='guild'){const failed=await run(f,'world_profession',args,'guild-exam');assert.equal(failed.success,false);assert.equal(f.doc.state.records[failed.qualification].success,false);assert.notEqual(f.doc.state.professions.combat,p.id);}
  const r=await run(f,'world_profession',args,mode==='sect'?'exam':'guild-entry');
  assert.equal(r.success,true,JSON.stringify(r));assert.ok(f.doc.state.professions.combat===p.id||f.doc.state.professions.life.includes(p.id));assert.equal(f.doc.state.records[r.qualification].mode,mode);
 }
});

test('统计层按种子人口与学馆容量授业，分段与重放一致，接近后还原技能且不重算',async()=>{
 const scale=await scaleFixture({counties:2,activate:false,compact:false}),doc=structuredClone(scale.document),county=Object.keys(doc.state.remote)[0],sid=doc.state.remote[county].skeleton.settlements[0].id;
 let e=scale.engine.scoped(doc);const far=e.world.locations.find(l=>advanceLayerPlan(e,{...doc.state,location:l.id}).layers.get(county)==='statistics');assert.ok(far);
 doc.state.location=far.id;doc.state.minute=480;settlePopulationLayers(fixtureDraft(doc),e);
 const school='bld_rw05_remote_school',teacher='npc_hw_luqing';doc.state.created[school]={id:school,type:'bld',name:'远行试课私塾',parent:sid,scope:sid,facilityType:'school',capacity:3};
 doc.state.npcs[teacher].location=school;doc.state.npcs[teacher].residence={home:school,settlement:sid,since:0,schedule:{default:[{start:0,end:480,location:school,activity:'休息',services:[]},{start:480,end:720,location:school,activity:'授业',services:['teach']},{start:720,end:1440,location:school,activity:'休息',services:[]}]}};
 e=scale.engine.scoped(doc);const f={e:scale.engine,doc},parts={e:scale.engine,doc:structuredClone(doc)},saved=structuredClone(doc);
 const baseline=educationStatistics(e,doc.state,sid),course=educationCourses(e,doc.state).find(c=>c.cohort?.settlement===sid);assert.equal(course.cohort.roster.length,3);
 const out=await scale.engine.reduce(f.doc,{tool:'world_time',args:{minutes:3*1440},eventId:'remote-lessons'});f.doc=applyPatches(f.doc,out.patches);
 const replay=await scale.engine.reduce(saved,{tool:'world_time',args:{minutes:3*1440},eventId:'remote-lessons'},{replay:true,result:out.result});assert.deepEqual(applyPatches(saved,replay.patches),f.doc);
 for(let i=0;i<6;i++)await run(parts,'world_time',{minutes:720},`remote-part-${i}`);
 assert.deepEqual(expandedEducation(e,f.doc.state,sid),expandedEducation(e,parts.doc.state,sid));
 const stats=educationStatistics(e,f.doc.state,sid);assert.equal(stats.literate-baseline.literate,3);assert.equal(stats.distribution.skill_literacy[0]-(baseline.distribution.skill_literacy?.[0]??0),3);
 const roster=cohortRoster(e,f.doc.state.population[sid]),id=roster[course.cohort.roster[0]].id;assert.equal(f.doc.state.npcs[id],undefined);assert.equal(f.doc.state.created[id],undefined);
 const kept=roster[course.cohort.roster[1]].id;f.doc.state.created[kept]=structuredClone(scale.document.state.created[kept]);assert.equal(educationStatistics(e,f.doc.state,sid).literate,stats.literate);
 f.doc.state.location=doc.state.remote[county].skeleton.seat;settlePopulationLayers(fixtureDraft(f.doc),e);assert.equal(f.doc.state.created[id].skills.skill_literacy,120);
 assert.equal(f.doc.state.created[kept].skills.skill_literacy,120);
 const active=rosterLifeState(scale.engine.scoped(f.doc),f.doc.state,id,f.doc.state.minute,'近处入学',{minor:true});assert.equal(active.skills.skill_literacy,120);assert.equal(active.growth.skills.skill_literacy.teach,120);
 const after=structuredClone(f.doc);settlePopulationLayers(fixtureDraft(f.doc),e);assert.deepEqual(f.doc,after);assert.equal(educationStatistics(e,f.doc.state,sid).literate,stats.literate);
});
