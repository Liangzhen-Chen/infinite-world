// Adult family life: a mutual long relationship may become a marriage, and a
// married couple may have a child who joins a real household and the
// settlement population. Everything is decided once per midnight from the
// state at that boundary and a roll keyed by campaign seed, subject and day,
// so long waits, short waits and reloaded saves give the same family history.
// Authored people and their static past are never rewritten; changes live in
// state.family plus ordinary memories, which then spread only through the
// existing NPC conversation and message channels.
import {digest} from './storage.mjs';
import {clockRoll} from './world-clock.mjs';
import {relationView,recordLifeRelation} from './npc-relations.mjs';

const DAY=1440,YEAR=360*DAY,unable=['死亡','濒死'];
const rules=engine=>engine.rules.npcLife;
const key=(...parts)=>digest(parts).slice(0,16);
const pairKey=(a,b)=>[a,b].sort().join('|');

function calendarDate(minute){const day=Math.floor(minute/DAY);return {year:Math.floor(day/360)+1,month:Math.floor(day/30)%12+1,day:day%30+1};}
// Age follows the authored birth date on the world calendar; a person without
// one ages from the authored age at minute 0.
export function npcAgeAt(engine,state,id,minute=state.minute){
 const person=state.family?.people?.[id]??engine.byId.get(id);if(!person)return null;
 if(person.birth){
  const now=calendarDate(minute),b=person.birth;
  return now.year-b.year-((now.month<b.month||now.month===b.month&&now.day<b.day)?1:0);
 }
 return Number.isFinite(person.age)?person.age+Math.floor(minute/YEAR):null;
}
// No known age counts as a minor unless the profile explicitly says otherwise.
export function npcIsMinor(engine,state,id,minute=state.minute){
 const age=npcAgeAt(engine,state,id,minute);
 if(age===null)return (state.family?.people?.[id]??engine.byId.get(id))?.flags?.minor!==false;
 return age<(rules(engine)?.adultAge??18);
}
const alive=(state,id)=>Boolean(state.npcs[id])&&!unable.includes(state.npcs[id].status);

// Registered households plus campaign births. The catalog list is not edited.
export function npcHousehold(engine,state,id){
 const house=engine.world.households?.find(h=>h.members.includes(id)||state.family?.households?.[h.id]?.members?.includes(id));
 return house?{id:house.id,settlement:house.settlement,homeLocation:house.homeLocation,members:[...house.members,...state.family?.households?.[house.id]?.members??[]]}:null;
}
export function householdMembers(engine,state,houseId){
 const house=engine.world.households?.find(h=>h.id===houseId);
 return house?[...house.members,...state.family?.households?.[houseId]?.members??[]]:[];
}

const staticTie=(engine,a,b)=>[...(engine.byId.get(a)?.relationships??[]).filter(r=>r.with===b),...(engine.byId.get(b)?.relationships??[]).filter(r=>r.with===a)];
// Authored spouses are an existing marriage; campaign marriages are added.
function marriagesOf(engine,state,id){
 const rows=Object.values(state.family?.marriages??{}).filter(m=>m.status==='在婚'&&m.partners.includes(id));
 for(const r of engine.byId.get(id)?.relationships??[])if(r.type==='配偶'&&engine.byId.get(r.with)){
  const mid=staticMarriageId(id,r.with);
  if(!rows.some(m=>m.id===mid)&&state.family?.marriages?.[mid]?.status!=='丧偶')rows.push({id:mid,partners:[id,r.with].sort(),status:'在婚',static:true});
 }
 return rows;
}
const staticMarriageId=(a,b)=>`marriage:static:${pairKey(a,b)}`;
// A roster spouse has no simulated state and is taken as living.
const spouseLiving=(engine,state,id)=>state.npcs[id]?alive(state,id):Boolean(engine.byId.get(id));
function livingSpouse(engine,state,id){return marriagesOf(engine,state,id).some(m=>m.partners.some(p=>p!==id&&spouseLiving(engine,state,p)));}
function kin(engine,state,a,b){
 const types=new Set(rules(engine).kinTypes);
 if(staticTie(engine,a,b).some(r=>types.has(r.type)))return true;
 const parents=id=>Object.values(state.family?.people?.[id]?.parents??{});
 return parents(a).includes(b)||parents(b).includes(a)||parents(a).some(p=>parents(b).includes(p));
}
// Each side decides for itself from its own view of the other person.
export function npcWilling(engine,state,from,to,{minimumTrust,minimumAffection}){
 const flags=engine.byId.get(from)?.flags;
 if(flags?.romanceable===false&&flags?.minor!==true)return false;
 const view=relationView(engine,state,from,to);
 return view.trust>=minimumTrust&&view.affection>=minimumAffection;
}

// Null when both people may court now; otherwise the first unmet condition.
export function marriageBlocker(engine,state,a,b,minute=state.minute){
 const r=rules(engine);if(!r)return '世界规则没有登记成年家庭关系';
 if(a===b)return '须为两个人';
 for(const id of [a,b]){
  if(engine.byId.get(id)?.tier!=='full'||!state.npcs[id])return '须为有独立状态的人物';
  if(npcIsMinor(engine,state,id,minute))return '未成年人不进入恋爱或婚姻';
 }
 for(const id of [a,b])if(!alive(state,id))return '一方已死亡或濒死';
 if(kin(engine,state,a,b))return '双方是亲属';
 if(livingSpouse(engine,state,a)||livingSpouse(engine,state,b))return '一方仍在婚';
 const ha=npcHousehold(engine,state,a),hb=npcHousehold(engine,state,b);
 if(!ha||!hb||ha.settlement!==hb.settlement)return '双方不在同一聚落登记居住';
 if(!npcWilling(engine,state,a,b,r.courtship))return `${engine.byId.get(a).name}不愿意`;
 if(!npcWilling(engine,state,b,a,r.courtship))return `${engine.byId.get(b).name}不愿意`;
 return null;
}

// Pairs with an existing tie in either direction; strangers never court.
function candidatePairs(engine,state){
 const pairs=new Map();
 for(const id of Object.keys(state.npcs).sort()){
  if(engine.byId.get(id)?.tier!=='full')continue;
  const others=[...(engine.byId.get(id).relationships??[]).map(r=>r.with),...Object.keys(state.npcs[id].relationships??{})];
  for(const other of others)if(other!==id&&other.startsWith('npc_')&&state.npcs[other])pairs.set(pairKey(id,other),[id,other].sort());
 }
 for(const c of Object.values(state.family?.courtships??{}))pairs.set(pairKey(...c.partners),[...c.partners]);
 return [...pairs.values()].sort((x,y)=>pairKey(...x).localeCompare(pairKey(...y)));
}

const nameOf=(engine,state,id)=>state.family?.people?.[id]?.name??engine.byId.get(id)?.name??id;
function addMemory(d,who,row){
 const stream=d.get('state','npcs',who,'memoryStream')??[];if(stream.some(m=>(m.rootMemoryId??m.id)===row.rootMemoryId))return;
 d.set(['state','npcs',who,'memoryStream'],[...stream,{...row,id:`${row.rootMemoryId}:${who}`}]);
}
// Those involved remember it first-hand; household members who are actually
// with one of them at that moment witness it. Everyone else hears later, if
// at all, through the daily conversations and carried messages.
function witness(d,engine,eventId,principals,houses,{minute,kind,content,salience=3}){
 const state=d.get('state'),at=new Set(principals.map(p=>state.npcs[p]?.location).filter(Boolean));
 const memory={rootMemoryId:eventId,sourceEvent:eventId,kind,minute,occurredAt:minute,participants:[...principals],content,emotion:'郑重'};
 for(const p of principals)if(alive(state,p))addMemory(d,p,{...memory,location:state.npcs[p].location,sourceType:'亲历',salience});
 const seen=[...new Set(houses.flatMap(h=>householdMembers(engine,state,h)))].filter(id=>!principals.includes(id)&&alive(state,id)&&at.has(state.npcs[id].location)&&!state.npcs[id].scheduleTravel&&!state.npcs[id].cognitionTravel).sort();
 for(const id of seen)addMemory(d,id,{...memory,location:state.npcs[id].location,sourceType:'目击',salience:Math.max(2,salience-1)});
 return seen;
}

function marry(d,engine,[a,b],courtship,minute){
 const state=d.get('state'),id=`marriage_${key(a,b,minute)}`,ha=npcHousehold(engine,state,a),hb=npcHousehold(engine,state,b);
 const content=`${nameOf(engine,state,a)}与${nameOf(engine,state,b)}在${engine.calendar(minute).text.slice(0,-6)}结为夫妻。`;
 d.set(['state','family','marriages',id],{id,partners:[a,b],since:minute,courtshipSince:courtship.since,settlement:ha.settlement,households:[...new Set([ha.id,hb.id])],status:'在婚',sourceEvent:id});
 d.remove(['state','family','courtships',pairKey(a,b)]);
 const delta=rules(engine).marriageRelation;
 for(const [from,to] of [[a,b],[b,a]])recordLifeRelation(d,engine,{key:`${id}:${from}`,sourceEvent:id,eventType:'成婚',from,to,minute,delta},who=>npcIsMinor(engine,d.get('state'),who,minute));
 for(const p of [a,b])d.set(['state','npcs',p,'developments'],[...d.get('state','npcs',p,'developments')??[],{type:'成婚',source:id,minute,with:p===a?b:a}]);
 const witnesses=witness(d,engine,id,[a,b],[ha.id,hb.id],{minute,kind:'family',content});
 d.set(['state','family','marriages',id,'witnesses'],witnesses);
}

// A married opposite-sex couple living in a household with a population
// ledger; the bearing parent is an adult within the configured age range.
export function birthBlocker(engine,state,marriage,minute=state.minute){
 const r=rules(engine)?.birth;if(!r)return '世界规则没有登记出生';
 if(marriage.status!=='在婚')return '婚姻已结束';
 const [a,b]=marriage.partners,sex=id=>engine.byId.get(id)?.sex;
 const mother=[a,b].find(id=>sex(id)==='女'),father=[a,b].find(id=>sex(id)==='男');
 if(!mother||!father)return '这对夫妻不会怀孕';
 for(const id of [a,b])if(!alive(state,id)||['昏迷','患病'].includes(state.npcs[id].status))return '一方没有独立人物状态或健康不允许';
 const age=npcAgeAt(engine,state,mother,minute);
 if(age===null||npcIsMinor(engine,state,mother,minute)||npcIsMinor(engine,state,father,minute)||age<r.motherAge[0]||age>r.motherAge[1])return '生育年龄不符';
 if(Object.values(state.family?.pregnancies??{}).some(p=>p.mother===mother&&p.status==='怀孕'))return '已在孕期';
 const last=Math.max(-Infinity,...Object.values(state.family?.births??{}).filter(x=>x.mother===mother).map(x=>x.minute));
 if(minute-last<r.spacingDays*DAY)return '距上次生育太近';
 const house=npcHousehold(engine,state,mother);
 if(!house||!Number.isSafeInteger(state.settlements?.[house.settlement]?.population))return '没有可登记的家户和人口账';
 if(!npcWilling(engine,state,mother,father,r)||!npcWilling(engine,state,father,mother,r))return '夫妻关系不睦';
 return null;
}

function conceive(d,engine,marriage,minute){
 const state=d.get('state'),[a,b]=marriage.partners,mother=engine.byId.get(a).sex==='女'?a:b,father=mother===a?b:a;
 const id=`pregnancy_${key(marriage.id,minute)}`,house=npcHousehold(engine,state,mother);
 d.set(['state','family','pregnancies',id],{id,marriage:marriage.id,mother,father,conceivedAt:minute,dueAt:minute+rules(engine).birth.gestationDays*DAY,household:house.id,status:'怀孕'});
 witness(d,engine,id,[mother,father],[],{minute,kind:'family',content:`${nameOf(engine,state,mother)}有了身孕。`,salience:2});
}

function deliver(d,engine,pregnancy,minute){
 const state=d.get('state'),r=rules(engine).birth;
 if(!alive(state,pregnancy.mother)){d.set(['state','family','pregnancies',pregnancy.id],{...pregnancy,status:'中止',endedAt:minute,reason:'母亲已不在'});return;}
 const house=npcHousehold(engine,state,pregnancy.mother)??{id:pregnancy.household,...engine.world.households.find(h=>h.id===pregnancy.household)};
 const ledger=state.settlements?.[house.settlement];
 if(!Number.isSafeInteger(ledger?.population)){d.set(['state','family','pregnancies',pregnancy.id],{...pregnancy,status:'中止',endedAt:minute,reason:'聚落人口账不存在'});return;}
 const seed=d.document.randomSeed,day=minute/DAY,sex=clockRoll(seed,`${pregnancy.id}:sex`,day)<0.5?'女':'男';
 const given=r.givenNames[Math.floor(clockRoll(seed,`${pregnancy.id}:name`,day)*r.givenNames.length)];
 const child=`npc_born_${key(pregnancy.id)}`,name=`${nameOf(engine,state,pregnancy.father).slice(0,1)}${given}`,birthId=`birth_${key(pregnancy.id)}`;
 d.set(['state','family','people',child],{id:child,name,sex,birth:calendarDate(minute),bornAt:minute,parents:{mother:pregnancy.mother,father:pregnancy.father},
  marriage:pregnancy.marriage,household:house.id,settlement:house.settlement,location:house.homeLocation,status:'正常',flags:{minor:true,romanceable:false},sourceEvent:birthId});
 d.set(['state','family','households',house.id,'members'],[...state.family?.households?.[house.id]?.members??[],child]);
 d.set(['state','settlements',house.settlement,'population'],ledger.population+1);
 d.set(['state','family','pregnancies',pregnancy.id],{...pregnancy,status:'已生产',endedAt:minute,child});
 const content=`${nameOf(engine,state,pregnancy.mother)}在${engine.calendar(minute).text.slice(0,-6)}生下${sex==='女'?'女儿':'儿子'}${name}，入${engine.byId.get(house.homeLocation)?.name??'本'}户。`;
 const witnesses=witness(d,engine,birthId,[pregnancy.mother,pregnancy.father],[house.id],{minute,kind:'family',content});
 d.set(['state','family','births',birthId],{id:birthId,child,mother:pregnancy.mother,father:pregnancy.father,marriage:pregnancy.marriage,minute,household:house.id,settlement:house.settlement,
  population:{before:ledger.population,after:ledger.population+1},witnesses});
}

function familyDay(d,engine,minute){
 const r=rules(engine),seed=d.document.randomSeed,day=minute/DAY;
 for(const m of Object.values(d.get('state','family','marriages')??{}).sort((x,y)=>x.id.localeCompare(y.id))){
  const state=d.get('state');
  if(m.status==='在婚'&&m.partners.some(p=>!alive(state,p)))d.set(['state','family','marriages',m.id],{...m,status:'丧偶',endedAt:minute});
 }
 for(const p of Object.values(d.get('state','family','pregnancies')??{}).sort((x,y)=>x.id.localeCompare(y.id)))if(p.status==='怀孕'&&p.dueAt<=minute)deliver(d,engine,p,minute);
 // Authored spouses who have died end their marriage in campaign state too.
 for(const [a,b] of candidatePairs(engine,d.get('state'))){
  const state=d.get('state'),k=pairKey(a,b),old=state.family?.courtships?.[k];
  if(staticTie(engine,a,b).some(t=>t.type==='配偶')&&!state.family?.marriages?.[staticMarriageId(a,b)]&&(!alive(state,a)||!alive(state,b)))
   d.set(['state','family','marriages',staticMarriageId(a,b)],{id:staticMarriageId(a,b),partners:[a,b],status:'丧偶',static:true,endedAt:minute});
  if(marriageBlocker(engine,state,a,b,minute)){if(old)d.remove(['state','family','courtships',k]);continue;}
  if(!old){d.set(['state','family','courtships',k],{partners:[a,b],since:minute});continue;}
  if(minute-old.since>=r.courtship.days*DAY&&clockRoll(seed,`marriage:${k}`,day)<r.courtship.marriageChancePerDay)marry(d,engine,[a,b],old,minute);
 }
 const seen=new Set();
 for(const id of Object.keys(d.get('state','npcs')).sort())for(const m of marriagesOf(engine,d.get('state'),id)){
  if(seen.has(m.id))continue;seen.add(m.id);
  if(!birthBlocker(engine,d.get('state'),m,minute)&&clockRoll(seed,`conception:${m.id}`,day)<r.birth.conceptionChancePerDay)conceive(d,engine,m,minute);
 }
}

// Every midnight in (before, after] is processed once with the state of that
// boundary; the engine already stops at each midnight while time passes.
export function advanceNpcLife(d,engine,before,after){
 if(!rules(engine))return;
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++)familyDay(d,engine,day*DAY);
}

export function validateNpcLifeRules(world){
 const r=world.rules.npcLife,errors=[];if(!r)return errors;
 const chance=v=>Number.isFinite(v)&&v>0&&v<=1,whole=v=>Number.isSafeInteger(v)&&v>0,level=v=>Number.isSafeInteger(v)&&v>=-100&&v<=100;
 if(!whole(r.adultAge)||r.adultAge<18)errors.push('npcLife.adultAge须为不小于18的整数');
 if(!Array.isArray(r.kinTypes)||!r.kinTypes.includes('配偶'))errors.push('npcLife.kinTypes须列出亲属关系类型');
 if(!level(r.courtship?.minimumTrust)||!level(r.courtship?.minimumAffection)||!whole(r.courtship?.days)||!chance(r.courtship?.marriageChancePerDay))errors.push('npcLife.courtship参数无效');
 if(!['trust','affection','romance'].every(k=>Number.isSafeInteger(r.marriageRelation?.[k])))errors.push('npcLife.marriageRelation参数无效');
 const b=r.birth;
 if(!level(b?.minimumTrust)||!level(b?.minimumAffection)||!chance(b?.conceptionChancePerDay)||!whole(b?.gestationDays)||!whole(b?.spacingDays))errors.push('npcLife.birth参数无效');
 if(!Array.isArray(b?.motherAge)||!(b.motherAge[0]>=r.adultAge&&b.motherAge[0]<b.motherAge[1]))errors.push('npcLife.birth.motherAge须为成年后的年龄区间');
 if(!b?.givenNames?.length||b.givenNames.some(n=>typeof n!=='string'||!n))errors.push('npcLife.birth.givenNames须为非空名字列表');
 return errors;
}
