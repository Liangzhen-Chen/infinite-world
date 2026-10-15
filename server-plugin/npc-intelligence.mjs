import {cloneData} from './storage.mjs';
import {registerWorldEventSubscriber}from'./world-events.mjs';
// U7 灵智等级（指南5.3）：人物与已开灵的精怪共用一张等级表。等级不决定说话
// 聪不聪明，只决定主动性、计划几步、看多远、多敢打破惯例、多快识破玩家反复用
// 的手法。成长只来自教导、共同经历和重大世界事件（K3），很慢，有世界内迹象，
// 不向玩家显示数字。精怪的听息、立意两阶就是这张表的第1、2级。
import {sapient,awakeningTotal,awakeningEligible}from'./wildlife-awakening.mjs';
import {famineAt}from'./hazard-calendar.mjs';
import {personSimulation}from'./entity-view.mjs';

const DAY=1440,clone=v=>cloneData(v); // P2: same result as structuredClone, faster
export const INTELLIGENCE_VERSION=1;
// maxActions：智能层一次计划最多几步；horizonDays：看得见多远的目标；
// recipeMinutes/dailyMinutes/offSchedule：日常自主工作能多大程度离开惯例；
// adaptAfter：玩家同一手法对其得手几次后起防备，adaptBonus为防备加值。
export const INTELLIGENCE_LEVELS=Object.freeze({
 0:{name:'懵懂',maxActions:0,horizonDays:1,recipeMinutes:0,dailyMinutes:0,offSchedule:false,adaptAfter:Infinity,adaptBonus:0},
 1:{name:'守常',maxActions:1,horizonDays:30,recipeMinutes:30,dailyMinutes:240,offSchedule:false,adaptAfter:4,adaptBonus:1},
 2:{name:'自主',maxActions:2,horizonDays:180,recipeMinutes:30,dailyMinutes:240,offSchedule:false,adaptAfter:3,adaptBonus:2},
 3:{name:'谋划',maxActions:3,horizonDays:720,recipeMinutes:60,dailyMinutes:300,offSchedule:false,adaptAfter:2,adaptBonus:2},
 4:{name:'觉悟',maxActions:3,horizonDays:1440,recipeMinutes:120,dailyMinutes:360,offSchedule:true,adaptAfter:1,adaptBonus:3},
 5:{name:'超凡',maxActions:4,horizonDays:3600,recipeMinutes:240,dailyMinutes:480,offSchedule:true,adaptAfter:1,adaptBonus:4},
});
// 升到下一级所需成长值；自然成长止于4级，5级只给传奇人物与智能首领。
export const GROWTH_TO_NEXT=Object.freeze({0:20,1:30,2:60,3:120});
export const NATURAL_CAP=4,DAILY_GROWTH=6;
export const GROWTH_POINTS=Object.freeze({teachSkill:6,teachRecipe:8,shared:2,companion:1,majorTarget:3,majorWitness:1});
const SIGNS={
 1:'会停下来留意旁人的动静，开始照着见过的样子学',
 2:'近来会自己拿主意，改了些老习惯，讲价也有了新说法',
 3:'近来常翻书记账，盘算一年半载后的事，也开始学新手艺',
 4:'近来在人前议事时开口，质疑旧规矩，已有人照着这新做法做',
};
const PROGRESS_SIGN='近来常问东问西，对新鲜事格外上心';
export const levelProfile=level=>INTELLIGENCE_LEVELS[Math.max(0,Math.min(5,level|0))];
const clampLevel=v=>Number.isSafeInteger(v)?Math.max(0,Math.min(5,v)):null;

// 旧事件重放时不新增灵智账：只有不重放或重放结果已带本版本号时才生效。
export function intelligenceFresh(engine){return !engine?.replaying||engine.replayResult?.npcIntelligenceVersion===INTELLIGENCE_VERSION;}

function creatureLevel(engine,seed,id,actor,minute){
 const species=clampLevel(engine.byId.get(actor?.species)?.intelligence)??0;
 if(Number.isSafeInteger(actor?.mind?.intelligence?.level))return actor.mind.intelligence.level;
 if(sapient(actor))return Math.max(2,species);
 const stages=engine.rules.wildlifeAwakening?.stages;
 if(stages&&seed!==undefined&&awakeningEligible(engine,actor)&&awakeningTotal(engine,seed,id,actor,Math.floor(minute/DAY))>=stages.find(s=>s.id==='tingxi').points)return Math.max(1,species);
 return species;
}
// 一个人物或生物的当前灵智。人物：存档覆盖基础档；无登记的名册人物按守常。
export function intelligenceOf(engine,state,id,{seed}={}){
 const npc=state.npcs?.[id],base=engine.byId.get(id);
 if(npc||base?.tier){
  const row=npc?.intelligence,level=clampLevel(row?.level)??clampLevel(base?.intelligence?.level)??clampLevel(base?.intelligence)??1;
  return{kind:'npc',level,growth:row?.growth??base?.intelligence?.growth??0,...levelProfile(level)};
 }
 const actor=state.creatures?.[id];
 if(actor){const level=creatureLevel(engine,seed,id,actor,state.minute??0);return{kind:'creature',level,growth:actor.mind?.intelligence?.growth??0,...levelProfile(level)};}
 return null;
}

function rowPath(d,id){
 if(d.get('state','npcs',id))return['state','npcs',id,'intelligence'];
 const actor=d.get('state','creatures',id);
 if(actor&&sapient(actor))return['state','creatures',id,'mind','intelligence'];
 return null;
}
// 写入成长值并在跨过门槛时升级，迹象以世界内说法记入发展记录。返回实际增量。
export function growIntelligence(d,engine,id,points,source,eventId){
 if(!intelligenceFresh(engine)||!(points>0))return 0;
 const path=rowPath(d,id);if(!path)return 0;
 const state=d.get('state'),now=intelligenceOf(engine,state,id,{seed:d.document.randomSeed});
 if(!now||now.level>=NATURAL_CAP||now.level<1)return 0;
 const minute=state.minute,day=Math.floor(minute/DAY),old=d.get(...path)??{};
 const today=old.today?.day===day?old.today:{day,points:0},gain=Math.min(points,DAILY_GROWTH-today.points);if(gain<=0)return 0;
 const row={...clone(old),level:now.level,growth:now.growth+gain,today:{day,points:today.points+gain},
  sources:[...(old.sources??[]),{source,points:gain,event:eventId,minute}].slice(-20),signs:[...(old.signs??[])]};
 const name=engine.byId.get(id)?.name??state.creatures?.[id]?.name??id,signs=[];
 while(row.level<NATURAL_CAP&&row.growth>=GROWTH_TO_NEXT[row.level]){
  row.growth-=GROWTH_TO_NEXT[row.level];row.level++;
  signs.push({kind:'level',level:row.level,content:SIGNS[row.level],minute,sourceEvent:eventId});
 }
 if(!signs.length&&row.level<NATURAL_CAP&&row.growth*2>=GROWTH_TO_NEXT[row.level]&&!row.signs.some(s=>s.kind==='progress'&&s.level===row.level))
  signs.push({kind:'progress',level:row.level,content:PROGRESS_SIGN,minute,sourceEvent:eventId});
 row.signs.push(...signs);row.signs=row.signs.slice(-8);
 d.set(path,row);
 if(path[1]==='npcs')for(const s of signs.filter(s=>s.kind==='level'))
  d.set(['state','npcs',id,'developments'],[...d.get('state','npcs',id,'developments')??[],{type:'灵智',source:eventId,minute,content:`${name}${s.content}`}]);
 return gain;
}
// 世界内可见迹象（不含数字）：最近一条成长迹象。
export function intelligenceSign(state,id){
 const row=state.npcs?.[id]?.intelligence??state.creatures?.[id]?.mind?.intelligence;
 return row?.signs?.at(-1)?.content??null;
}

// K3 订阅：玩家的帮助、赠予、教学与交易是共同经历；同行者一起经历每件事；
// 分量足够的伤害、偷盗、重礼让当事人和目击者都受震动。
const majorEvent=e=>e.verb==='harm'&&e.tags?.includes('hostile')||e.verb==='steal'&&e.witnesses?.length||e.verb==='gift'&&(e.value??0)>=70;
export function recordIntelligenceEvents(d,engine,events,context){
 // 没有改动任何状态的调用（如重复撤销已撤销的许可）不算共同经历或同行。
 if(context?.legacy||context?.noop||!intelligenceFresh(engine))return;
 for(const e of events){
  if(e.legacy)continue;
  const touched=new Map(),add=(id,points,source)=>{if(id&&id!=='player'&&(touched.get(id)?.points??0)<points)touched.set(id,{points,source});};
  if(e.actor==='player'&&['help','gift','learn','trade'].includes(e.verb))add(e.target,GROWTH_POINTS.shared,'共同经历');
  for(const id of d.get('state','player','companions')??[])add(id,GROWTH_POINTS.companion,'同行');
  if(majorEvent(e)){add(e.target,GROWTH_POINTS.majorTarget,'重大事件');for(const id of e.witnesses??[])add(id,GROWTH_POINTS.majorWitness,'重大事件');}
  for(const [id,{points,source}] of [...touched].sort(([a],[b])=>a.localeCompare(b)))growIntelligence(d,engine,id,points,source,e.id);
 }
}

// 对玩家新花样的适应：同一手法（属性加技能）对同一人得手若干次后，此人起防备。
export const trickKey=(attribute,skill)=>`${attribute}|${skill??''}`;
export function adaptationBonus(engine,state,npc,key){
 const row=state.npcs?.[npc]?.adaptation?.[key],profile=intelligenceOf(engine,state,npc);
 return row&&profile&&row.count>=profile.adaptAfter?profile.adaptBonus:0;
}
export function noteTrick(d,engine,npc,key,eventId){
 if(!intelligenceFresh(engine)||!d.get('state','npcs',npc))return;
 const row=d.get('state','npcs',npc,'adaptation',key)??{count:0};
 d.set(['state','npcs',npc,'adaptation',key],{count:row.count+1,last:d.get('state','minute'),sourceEvent:eventId});
}
export function adaptedTricks(engine,state,npc){
 const profile=intelligenceOf(engine,state,npc);if(!profile)return[];
 return Object.entries(state.npcs?.[npc]?.adaptation??{}).filter(([,r])=>r.count>=profile.adaptAfter).map(([key])=>{
  const [attribute,skill]=key.split('|');return skill?engine.byId.get(skill)?.name??skill:attribute;});
}

// ---- 需求驱动目标（指南5.6）：钱、安全、地位 -------------------------------
// 守常者只对迫在眉睫的缺口起意；自主以上会为渐进的缺口和丢脸起意；谋划以上
// 还会主动求名望。步数与期限随等级。饥饿仍由 npc-life 的迁居谋生处理。
const STEPS={
 money:['先缩减不必要的开销','多接几份活计或卖掉余货','向熟人打听来钱的门路','盘算一笔能长久进账的营生'],
 safety:['出门结伴，天黑前回家','把值钱东西收好，门户加固','向乡里或巡守说明遭遇','学些防身本事或另找安稳去处'],
 status:['把手头的事做得叫人挑不出错','在熟人面前讲清自己的理','请有威望的人作证或撑腰','在议事时提出自己的主张'],
 // U3 冬荒：缺粮先省、再借，再起迁居和偷粮的念头（迁居本身由 npc-life 谋生迁居落实）。
 food:['一天少吃一顿，省着口粮','向亲友借粮或拿东西换粮','盘算去外乡投亲谋生','实在撑不住，动了偷别家粮囤的念头'],
};
const NEED_DAYS={money:90,safety:30,status:180,food:30};
const FOOD_MOTIVES=['migrate','steal'];
// 本人现住户所在聚落（含迁居后的户籍）。
function homeSettlement(engine,state,id){
 const moved=Object.entries(state.family?.households??{}).find(([,h])=>h.members?.includes(id))?.[0];
 const house=engine.world.households?.find(h=>h.id===moved||!moved&&h.members.includes(id)&&!(state.family?.households?.[h.id]?.left??[]).includes(id));
 return house?.settlement??null;
}
const hostileTo=(e,id)=>e.target===id&&(e.verb==='harm'&&e.tags?.includes('hostile')||e.verb==='steal');
function detectNeeds(engine,state,id,level,minute,events,debts){
 const npc=state.npcs[id],base=engine.byId.get(id),needs=[];
 const cash=base?.wealth?.cashRange?.[0]??base?.coins??0,coins=npc.coins??base?.coins??0;
 const home=homeSettlement(engine,state,id),famine=home?famineAt(state,home,minute):null;
 if(famine)needs.push({kind:'food',content:'冬荒缺粮，设法弄到过冬的口粮',motives:FOOD_MOTIVES,cause:famine.sourceEvent});
 const overdue=debts.some(r=>r.debtor===id&&r.deadline<minute);
 if(overdue)needs.push({kind:'money',content:'还清逾期的欠款'});
 else if(cash>0&&coins===0)needs.push({kind:'money',content:'先凑够眼下过日子的钱'});
 else if(level>=2&&cash>=10&&coins<Math.floor(cash/2))needs.push({kind:'money',content:'把手头的钱攒回来'});
 if(events.some(e=>hostileTo(e,id)&&minute-e.minute<=7*DAY))needs.push({kind:'safety',content:'提防再遭伤害或偷盗'});
 if(level>=2&&events.some(e=>hostileTo(e,id)&&(e.witnesses?.length??0)>=2&&minute-e.minute<=30*DAY))needs.push({kind:'status',content:'挽回当众丢掉的脸面'});
 else if(level>=3)needs.push({kind:'status',content:'在乡里议事时说得上话',ambition:true});
 return needs;
}
const bucketOf=days=>days<=30?'short':days<=180?'mid':'long';
export function npcNeedGoals(state,id){return Object.values(state.npcs?.[id]?.goals??{}).flat().filter(g=>g?.source==='need');}
// 每个午夜一次：新缺口生成目标（每人每日至多一条），缺口消失的目标记为完成。
export function advanceNpcNeeds(d,engine,minute){
 if(!intelligenceFresh(engine))return;
 const state=d.get('state'),day=Math.floor(minute/DAY),records=Object.values(state.records??{});
 const events=records.filter(r=>r.category==='world_event'&&!r.legacy&&r.minute<=minute&&minute-r.minute<=30*DAY&&(r.verb==='harm'||r.verb==='steal'));
 const debts=records.filter(r=>r.category==='debt'&&r.status!=='已还清'&&Number.isFinite(r.deadline));
 for(const id of Object.keys(state.npcs??{}).sort()){
  const npc=state.npcs[id],base=engine.byId.get(id);
  if(!personSimulation(engine,state,id).value||['死亡','濒死'].includes(npc.status))continue;
  const {level,maxActions,horizonDays}=intelligenceOf(engine,state,id);if(level<1)continue;
  const needs=detectNeeds(engine,state,id,level,minute,events,debts),goals=clone(npc.goals??base.goals??{});let changed=false;
  for(const g of Object.values(goals).flat())if(g?.source==='need'&&g.status==='进行中'&&!needs.some(n=>n.kind===g.need&&(n.ambition??false)===(g.ambition??false))){
   Object.assign(g,{status:'已完成',progress:100,completedAt:minute,evidence:'need-relieved'});changed=true;}
  const open=new Set(Object.values(goals).flat().filter(g=>g?.source==='need'&&g.status==='进行中').map(g=>g.need));
  const need=needs.find(n=>!open.has(n.kind));
  if(need){
   const days=Math.min(horizonDays,NEED_DAYS[need.kind]),bucket=bucketOf(days),steps=STEPS[need.kind].slice(0,Math.max(1,Math.min(4,maxActions+(level>=3?1:0))));
   goals[bucket]=[...(goals[bucket]??[]),{id:`goal_need_${need.kind}_${id}_${day}`,content:need.content,need:need.kind,source:'need',...(need.ambition?{ambition:true}:{}),...(need.motives?{motives:need.motives,cause:need.cause}:{}),
    progress:0,status:'进行中',createdDay:day,deadlineDay:day+days,steps:steps.map(content=>({content,status:'pending'}))}];
   changed=true;
  }
  if(changed)d.set(['state','npcs',id,'goals'],goals);
 }
}
// 智能层只看得见本人视野内的目标；需求目标的期限是绝对日，作者目标是相对日。
export function goalsWithinHorizon(goals,horizonDays,today){
 const out={};
 for(const [k,rows] of Object.entries(goals??{}))out[k]=(Array.isArray(rows)?rows:[]).filter(g=>((g.source==='need'?g.deadlineDay-today:g.deadlineDay)??0)<=horizonDays);
 return out;
}
// World-event subscriber; settlement order is the `order` field.
registerWorldEventSubscriber({id:'npc_intelligence',order:70,on:(d,engine,events,c)=>recordIntelligenceEvents(d,engine,events,c)});
