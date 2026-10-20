import {isPhysicallyDead} from './lifecycle-state.mjs';
import {knowsKnowledge} from './education-state.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {entityTransition,businessSnapshot,businessTransitions} from './entity-transitions.mjs';
// NPC skill growth comes only from a real lesson by the player or from a
// finished autonomous work action. Both are bounded per day and per skill, and
// a changed livelihood is stored in campaign state (never in world/ people).
import {scheduleAt,advanceWithNpcParticipants}from'./npc-schedule.mjs';
import {effectiveProficiency}from'./professions.mjs';
import {npcSchedule,npcHousehold}from'./npc-state.mjs';
import {growIntelligence,GROWTH_POINTS}from'./npc-intelligence.mjs';
import {personSimulation,personConstraint,personCertified}from'./entity-view.mjs';
import {hiddenCheckBonus}from'./hidden-passives.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('vocation-initial');
// Restores an already qualified livelihood; it is not a new switch and does
// not invent practice sessions, certification, appointment or consent.
export function initializeVocation(d,engine,{actor,id,sourceEvent,conflictOfInterest},{origin,eventId}={}){
 const s=d.get('state'),v=engine.rules.npcGrowth?.vocations?.find(v=>v.id===id),raw=s.records?.[sourceEvent]??s.records?.[`world_event:${sourceEvent}`],event=raw&&{...raw.payload,...raw};
 if(origin!=='initial'||!eventId||!s.npcs?.[actor]||!v||typeof conflictOfInterest!=='boolean'||raw?.category!=='world_event'||![raw.id,`world_event:${raw.id}`].includes(sourceEvent)||event.verb!=='qualified'||event.actor!==actor||event.vocation!==id||!Number.isSafeInteger(event.minute)||event.minute<0||event.minute>s.minute||npcProficiency(engine,s,actor,v.skill)<v.minimumProficiency||s.npcs[actor].vocation)throw Error('Invalid existing vocation or qualification source');
 holdingSet(d,engine,['state','npcs',actor,'vocation'],{id,since:event.minute,sourceEvent:raw.id,conflictOfInterest,home:npcHousehold(engine,s,actor)?.homeLocation??s.npcs[actor].location},'vocation-initial',eventId);
 return {actor,vocation:id};
}
export function assertVocationAction(engine,state,tool,args){
 if(tool==='law'&&args.operation==='hire_advocate'&&args.authority!==undefined){
  const actor=engine.resolve(args.authority,'npc');
  if(state.npcs?.[actor]?.vocation?.conflictOfInterest===true)throw Error('代理人与本案存在利害冲突');
 }
}

const DAY=1440,unable=['濒死','昏迷','患病'],sleeping=/睡眠|睡觉|熟睡/;
const rules=engine=>{const r=engine.rules.npcGrowth;if(!r)throw Error('世界规则没有登记人物成长');return r;};
const full=(engine,id)=>personSimulation(engine,{},id).value;

export function npcProficiency(engine,state,id,skill){
 const v=state.npcs[id]?.skills?.[skill]??engine.byId.get(id)?.skills?.[skill]??engine.byId.get(id)?.proficiencies?.[skill]??0;
 return typeof v==='object'?v.proficiency??0:v;
}
// Remaining growth for one skill: total gain and absolute proficiency caps.
function room(engine,state,id,skill){
 const r=rules(engine),row=state.npcs[id]?.growth?.skills?.[skill],current=npcProficiency(engine,state,id,skill);
 return Math.max(0,Math.min(r.maximumGain-((row?.teach??0)+(row?.work??0)),Math.max(current,personCertified(engine,state,id,skill)?r.maximumProficiency:Math.min(r.maximumProficiency,engine.rules.npcGrowth.uncertifiedMaximumProficiency??r.maximumProficiency))-current));
}
const today=(state,id,minute)=>{const day=Math.floor(minute/DAY),row=state.npcs[id]?.growth?.today;return row?.day===day?row:{day,teach:0,work:0};};
// RW07's resident classes share the existing teaching budget and growth caps.
export function npcLessonGain(engine,state,id,skill,teacher,amount){
 const r=rules(engine).teach;
 if(today(state,id,state.minute).teach>=r.dailySessions)throw Error('今天已经教过这位人物，需隔日再教');
 const gain=Math.min(amount,r.gain,teacher-r.teacherMargin-npcProficiency(engine,state,id,skill),room(engine,state,id,skill));
 if(gain<=0)throw Error('学生已接近主持水平或达到成长上限');return gain;
}
export function settleNpcLesson(d,engine,id,skill,amount,eventId){
 if(isPhysicallyDead(engine,d,id)||unable.includes(d.get('state','npcs',id,'status')))throw Error('教学中途学生失去行动能力');
 const gain=grow(d,engine,id,skill,amount,'teach'),mark=today(d.get('state'),id,d.get('state','minute'));
 d.set(['state','npcs',id,'growth','today'],{...mark,teach:mark.teach+1});
 remember(d,engine,id,eventId,`在寺观义学修习${engine.byId.get(skill)?.name??skill}。`,[id]);return gain;
}
function grow(d,engine,id,skill,amount,source){
 const state=d.get('state'),gain=Math.min(amount,room(engine,state,id,skill));if(gain<=0)return 0;
 const current=npcProficiency(engine,state,id,skill),row=state.npcs[id].growth?.skills?.[skill]??{base:current,teach:0,work:0,sessions:0};
 d.set(['state','npcs',id,'skills'],{...(state.npcs[id].skills&&!Array.isArray(state.npcs[id].skills)?state.npcs[id].skills:{}),[skill]:current+gain});
 d.set(['state','npcs',id,'growth','skills',skill],{...row,[source]:row[source]+gain,sessions:row.sessions+1});
 return gain;
}
function remember(d,engine,id,eventId,content,participants){
 const minute=d.get('state','minute'),location=d.get('state','npcs',id,'location');
 d.set(['state','npcs',id,'memoryStream'],[...d.get('state','npcs',id,'memoryStream')??[],{id:eventId,sourceEvent:eventId,kind:'learn',minute,location,participants,content,sourceType:'亲历',salience:3,emotion:'踏实'}]);
 d.set(['state','npcs',id,'developments'],[...d.get('state','npcs',id,'developments')??[],{type:'成长',source:eventId,minute,content}]);
}
const knowsRecipe=(state,id,recipe)=>recipe.teachers?.includes(id)||Boolean(state.npcs[id]?.recipes?.[recipe.id]);

// world_learn with student: the player teaches a present NPC a skill or recipe.
export function teachNpc(d,engine,args,eventId){
 const r=rules(engine).teach,state=d.get('state'),student=engine.resolve(args.student,'npc'),npc=state.npcs[student];
 const teacherId=args.source===undefined||['player','玩家'].includes(args.source)?'player':engine.resolve(args.source,'npc');
 if(teacherId===student)throw Error('不能向自己授业');
 if(teacherId!=='player'&&(!state.npcs[teacherId]||state.npcs[teacherId].location!==state.location||isPhysicallyDead(engine,state,teacherId)||unable.includes(state.npcs[teacherId].status)||personConstraint(engine,state,teacherId)))throw Error('先生须清醒在场');
 const entity=engine.resolve(args.entity,args.kind),kind=entity.split('_')[0],catalog=engine.byId.get(entity);
 if(!['skill','recipe'].includes(kind))throw Error('只能向人物传授技能或配方');
 if(!engine.byId.get(student)||!npc)throw Error('这位人物没有独立成长记录');
 if(npc.location!==state.location)throw Error('学生不在场');
 if(isPhysicallyDead(engine,state,student)||unable.includes(npc.status))throw Error(`学生此刻${npc.status}，不能受教`);
 if(personConstraint(engine,state,student))throw Error('学生正在依法拘留，不能受教');
 const minutes=kind==='recipe'?catalog.learnMinutes??r.minutes:r.minutes,companion=state.player.companions?.includes(student);
 engine.assertNpcObligationAction?.(d,[teacherId,student],{minutes,location:state.location,kind:'teach'});
 engine.assertNpcAutonomyAction?.(state,[student,...teacherId!=='player'?[teacherId]:[]],{minutes});
 if(!companion)for(let cursor=state.minute;cursor<state.minute+minutes;){
  const slot=scheduleAt(engine,student,cursor,state);if(!slot)break;
  if(slot.location!==npc.location||sleeping.test(slot.activity))throw Error('学生作息没有完整的清醒空闲时段');
  cursor=slot.until;
 }
 if(today(state,student,state.minute).teach>=r.dailySessions)throw Error('今天已经教过这位人物，需隔日再教');
 let gain=0,skill=kind==='skill'?entity:catalog.skill;
 if(kind==='skill'){
  skill=entity;
  if(!knowsKnowledge(engine,state,teacherId,skill))throw Error('你没有掌握这项技能');
  const teacher=teacherId==='player'?effectiveProficiency(d,engine,skill):npcProficiency(engine,state,teacherId,skill),current=npcProficiency(engine,state,student,skill);
  gain=Math.min(r.gain,teacher-r.teacherMargin-current,room(engine,state,student,skill));
  if(gain<=0)throw Error('学生已接近你的水平或达到成长上限，再教也不会进步');
 }else{
  if(!knowsKnowledge(engine,state,teacherId,entity)&&!(teacherId!=='player'&&currentWorkstationRecipes(engine,state,teacherId).some(r=>r.id===entity)))throw Error('你没有学会这个配方');
  if(knowsRecipe(state,student,catalog))throw Error('学生已经会这个配方');
  if(npcProficiency(engine,state,student,catalog.skill)<(catalog.minimumProficiency??0))throw Error('学生的相关技能不足以学这个配方');
 }
 advanceWithNpcParticipants(d,engine,minutes,eventId,[student,...teacherId!=='player'?[teacherId]:[]]);
 if(isPhysicallyDead(engine,d,student)||unable.includes(d.get('state','npcs',student,'status')))throw Error('教学中途学生失去行动能力');
 const at=d.get('state','minute'),mark=today(d.get('state'),student,state.minute);
 const teacherSpecies=teacherId==='player'?state.player.species??'human':state.npcs[teacherId]?.species??engine.byId.get(teacherId)?.species??'human';
 const studentSpecies=npc.species??engine.byId.get(student)?.species??'human';
 let teachingCheck=null;
 if(teacherId==='player'&&teacherSpecies!==studentSpecies&&hiddenCheckBonus(engine,d.get('state'),'player','teaching').bonus){
  if((npc.trust??0)<0)throw Error('学生不愿接受这次授业');
  teachingCheck=engine.check(d,{attribute:'智力',skill, difficulty:10,passiveDomain:'teaching'},eventId);
  if(!teachingCheck.success){d.set(['state','npcs',student,'growth','today'],{...mark,teach:mark.teach+1});return{student,entity,kind,minutes,gained:0,...teachingCheck};}
 }
 if(kind==='skill')gain=grow(d,engine,student,skill,gain,'teach');
 else d.set(['state','npcs',student,'recipes',entity],{source:{type:teacherId==='player'?'player':'teacher',id:teacherId},learnedAt:at,sourceEvent:eventId});
 d.set(['state','npcs',student,'growth','today'],{...mark,teach:mark.teach+1});
 const name=engine.byId.get(student).name,teacherName=teacherId==='player'?'玩家':engine.byId.get(teacherId).name,summary=kind==='skill'?`跟${teacherName}学了${minutes}分钟${catalog.name}，熟练度提高${gain}`:`跟${teacherName}学会配方${catalog.name}`;
 remember(d,engine,student,eventId,`${name}${summary}。`,[teacherId,student]);
 // 被教导是灵智成长的来源之一；学会新配方算接触新事物，比熟练度增长略多。
 growIntelligence(d,engine,student,kind==='recipe'?GROWTH_POINTS.teachRecipe:GROWTH_POINTS.teachSkill,'教导',eventId);
 d.say(`${name}${summary}`);
 return{student,entity,kind,minutes,gained:gain,...(teachingCheck?{teachingCheck}:{}),...(skill?{proficiency:npcProficiency(engine,d.get('state'),student,skill)}:{})};
}

// Called once when an autonomous craft action settles; the action id is the
// only source, so replay and long or short waits give the same growth.
export function npcWorkGrowth(d,engine,id,skill,success,minute){
 const r=engine.rules.npcGrowth?.work;if(!r||!skill)return 0;
 const mark=today(d.get('state'),id,minute),gain=grow(d,engine,id,skill,Math.min(success?r.successGain:r.failureGain,r.dailyGain-mark.work),'work');
 if(gain)d.set(['state','npcs',id,'growth','today'],{...mark,work:mark.work+gain});
 return gain;
}

function vocationBlocker(engine,state,id,vocation){
 const r=rules(engine),npc=state.npcs[id],row=npc?.growth?.skills?.[vocation.skill],minute=state.minute;
 if(!full(engine,id)||!npc)return '人物没有独立成长记录';
 if(isPhysicallyDead(engine,state,id)||unable.includes(npc.status))return `人物此刻${npc.status}`;
 if(personConstraint(engine,state,id))return '人物正在依法拘留';
 if(npc.vocation?.id===vocation.id)return '已经以这门营生为业';
 if((r.institutionTeachersStay??true)&&engine.rules.training?.institutions?.some(e=>e.teacher===id))return '登记机构导师不能自行离职';
 if(npc.vocation&&minute-npc.vocation.since<r.switchCooldownDays*DAY)return '刚换过营生，尚未做满规定天数';
 if(npcProficiency(engine,state,id,vocation.skill)<vocation.minimumProficiency)return `${engine.byId.get(vocation.skill)?.name??vocation.skill}熟练度不足${vocation.minimumProficiency}`;
 if((row?.sessions??0)<r.minimumPractice)return `受教或实作次数不足${r.minimumPractice}次`;
 return null;
}
export function npcVocationOptions(engine,state,id){
 return (engine.rules.npcGrowth?.vocations??[]).filter(v=>!vocationBlocker(engine,state,id,v)).map(v=>({id:v.id,name:v.name}));
}
export function switchVocation(d,engine,id,vocationId,eventId){
 const vocation=engine.rules.npcGrowth?.vocations?.find(v=>v.id===vocationId);if(!vocation)throw Error('营生未登记');
 const state=d.get('state'),blocker=vocationBlocker(engine,state,id,vocation);if(blocker)throw Error(`不能改行：${blocker}`);
 const npc=state.npcs[id],home=npcHousehold(engine,state,id)?.homeLocation??npcSchedule(engine,state,id)?.default?.[0]?.location??npc.location,minute=state.minute;
 const shops=businessSnapshot(engine,state);
 d.set(['state','npcs',id,'vocation'],{id:vocation.id,name:vocation.name,skill:vocation.skill,since:minute,sourceEvent:eventId,home,
  previous:{id:npc.vocation?.id??null,occupation:npc.occupation??engine.byId.get(id).occupation??''}});
 d.set(['state','npcs',id,'occupation'],vocation.name);
 remember(d,engine,id,eventId,`${engine.byId.get(id).name}改行做${vocation.name}，此后按新作息在${engine.byId.get(vocation.location)?.name??vocation.location}做事。`,[id]);
 entityTransition(d,engine,{id:`${eventId}:vocation`,verb:'vocation',actor:id,minute,location:npc.location,summary:`${engine.byId.get(id).name}改行做${vocation.name}`});
 businessTransitions(d,engine,shops,eventId,minute);
 return{npc:id,vocation:vocation.id,name:vocation.name,since:minute};
}

export function validateNpcGrowthRules(world){
 const r=world.rules.npcGrowth,errors=[];if(!r)return errors;
 const positive=v=>Number.isSafeInteger(v)&&v>0,ids=new Set([...world.locations,...world.skills,...world.recipes].map(x=>x.id));
 for(const key of ['maximumGain','maximumProficiency','minimumPractice','switchCooldownDays'])if(!positive(r[key]))errors.push(`npcGrowth.${key}须为正整数`);
 for(const key of ['minutes','gain','teacherMargin','dailySessions'])if(!positive(r.teach?.[key]))errors.push(`npcGrowth.teach.${key}须为正整数`);
 for(const key of ['successGain','failureGain','dailyGain'])if(!positive(r.work?.[key]))errors.push(`npcGrowth.work.${key}须为正整数`);
 for(const v of r.vocations??[]){
  if(!/^vocation_/.test(v.id)||!v.name||!v.activity||!ids.has(v.skill)||!ids.has(v.location)||!positive(v.minimumProficiency))errors.push(`${v.id}:营生字段不完整`);
  if(!Array.isArray(v.hours)||!(v.hours[0]>0&&v.hours[0]<v.hours[1]&&v.hours[1]<1440))errors.push(`${v.id}:工时须在一天之内`);
  if(!v.slotServices?.every(s=>['trade','teach','law'].includes(s))||!v.teaches?.every(s=>ids.has(s)))errors.push(`${v.id}:服务未登记`);
 }
 return errors;
}
