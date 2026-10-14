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
import {transferItems} from './items.mjs';

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

// ---- Illness, ageing and natural death -------------------------------------
// Each midnight a living, settled person may fall ill or die of old age with
// the rates of their current age band; a grave illness may end in death on a
// later night, less often when a household member is caring for them. The
// illness only adds its own fever to the medical record and restores only its
// own status, so older wounds and conditions are kept as they were.
const incapable=['死亡','濒死','昏迷','患病'];
const healthRules=engine=>rules(engine)?.health;
const perDay=perYear=>1-(1-Math.min(1,perYear))**(1/360);
function ageBand(h,age){let band=null;for(const row of h.bands)if(age>=row.fromAge)band=row;return band;}
// People away with the player are on screen; off-screen life events wait.
const settled=(state,id)=>{const n=state.npcs[id];return Boolean(n?.location)&&!n.scheduleTravel&&!n.cognitionTravel&&!state.player?.companions?.includes(id);};
// Present wounds or low health make a new illness more likely to be grave.
function weakened(npc){
 const m=npc.medical;
 return Boolean(m?.wounds?.some(w=>!w.closed||w.infected)||m?.tendon?.ruptured||Number.isFinite(npc.hp)&&Number.isFinite(npc.maxHp)&&npc.maxHp>0&&npc.hp<npc.maxHp/2);
}
export function npcIllness(state,id){return Object.values(state.family?.illnesses??{}).find(r=>r.patient===id&&r.status==='患病中')??null;}

function addFever(d,engine,id,illness){
 const h=healthRules(engine),old=d.get('state','npcs',id,'medical');
 const m=old?structuredClone(old):{bloodMl:h.bloodMl,pain:0,wounds:[],symptoms:[]};
 m.symptoms=[...(m.symptoms??[]),{kind:'fever',observable:true,temperatureC:illness.severity==='重'?h.feverC[1]:h.feverC[0],illness:illness.id}];
 d.set(['state','npcs',id,'medical'],m);return !old;
}
function removeFever(d,id,illness){
 const m=d.get('state','npcs',id,'medical');if(!m)return;
 const symptoms=(m.symptoms??[]).filter(s=>s.illness!==illness.id);
 if(illness.medicalCreated&&!m.wounds?.length&&!symptoms.length&&!m.tendon&&!m.parasites?.length&&!m.lostBloodMl){d.remove(['state','npcs',id,'medical']);return;}
 d.set(['state','npcs',id,'medical'],{...m,symptoms});
}
function release(d,illness){
 for(const id of Object.keys(d.get('state','npcs')).sort())if(d.get('state','npcs',id,'caring')?.illness===illness.id)d.remove(['state','npcs',id,'caring']);
}
// A household adult who is able and not away with the player stays home to
// care for a gravely ill person; the spouse comes first, then by id.
function caregiverFor(engine,state,illness,minute){
 const house=npcHousehold(engine,state,illness.patient);if(!house)return null;
 const spouse=marriagesOf(engine,state,illness.patient).flatMap(m=>m.partners);
 const able=id=>id!==illness.patient&&Boolean(state.npcs[id])&&engine.byId.get(id)?.tier==='full'&&!incapable.includes(state.npcs[id].status)&&!npcIsMinor(engine,state,id,minute)
  &&!state.npcs[id].cognitionTravel&&!state.player?.companions?.includes(id)&&(!state.npcs[id].caring||state.npcs[id].caring.illness===illness.id);
 const current=Object.keys(state.npcs).find(id=>state.npcs[id].caring?.illness===illness.id);
 if(current&&able(current)&&house.members.includes(current))return current;
 return house.members.filter(able).sort((a,b)=>(spouse.includes(b)-spouse.includes(a))||a.localeCompare(b))[0]??null;
}
function assignCare(d,engine,illness,minute){
 const state=d.get('state'),who=caregiverFor(engine,state,illness,minute),house=npcHousehold(engine,state,illness.patient);
 for(const id of Object.keys(state.npcs).sort())if(state.npcs[id].caring?.illness===illness.id&&id!==who)d.remove(['state','npcs',id,'caring']);
 if(who&&!state.npcs[who].caring)d.set(['state','npcs',who,'caring'],{patient:illness.patient,illness:illness.id,location:house.homeLocation,since:minute});
 const row=d.get('state','family','illnesses',illness.id);
 if(who&&!row.caregivers.includes(who))d.set(['state','family','illnesses',illness.id,'caregivers'],[...row.caregivers,who]);
 return who;
}

function fallIll(d,engine,id,minute,band){
 const h=healthRules(engine),seed=d.document.randomSeed,day=minute/DAY,state=d.get('state'),npc=state.npcs[id];
 const graveChance=Math.min(1,band.graveShare*(weakened(npc)?h.weakenedGraveMultiplier:1));
 const severity=clockRoll(seed,`illness-severity:${id}`,day)<graveChance?'重':'轻',[low,high]=severity==='重'?h.graveDays:h.mildDays;
 const days=low+Math.floor(clockRoll(seed,`illness-days:${id}`,day)*(high-low+1)),illId=`illness_${key(id,minute)}`;
 const illness={id:illId,patient:id,severity,since:minute,endsAt:minute+days*DAY,status:'患病中',previousStatus:npc.status??null,household:npcHousehold(engine,state,id)?.id??null,caregivers:[]};
 illness.medicalCreated=addFever(d,engine,id,illness);
 d.set(['state','family','illnesses',illId],illness);
 d.set(['state','npcs',id,'status'],'患病');d.set(['state','npcs',id,'activity'],'患病');
 d.set(['state','npcs',id,'developments'],[...d.get('state','npcs',id,'developments')??[],{type:'患病',source:illId,minute,severity}]);
 if(severity==='重')assignCare(d,engine,illness,minute);
 const content=`${nameOf(engine,state,id)}在${engine.calendar(minute).text.slice(0,-6)}${severity==='重'?'病重卧床':'染病在家歇着'}。`;
 witness(d,engine,illId,[id],illness.household?[illness.household]:[],{minute,kind:'health',content,salience:severity==='重'?3:1});
}
function recover(d,engine,illness,minute){
 const id=illness.patient;
 if(d.get('state','npcs',id,'status')==='患病'){if(illness.previousStatus===null)d.remove(['state','npcs',id,'status']);else d.set(['state','npcs',id,'status'],illness.previousStatus);}
 removeFever(d,id,illness);release(d,illness);
 d.set(['state','family','illnesses',illness.id],{...d.get('state','family','illnesses',illness.id),status:'痊愈',endedAt:minute});
}

// Natural death uses the status every module already settles: services,
// schedules, contracts, quests and marriages read '死亡'. In addition the
// person's open appointments end without blame, the household ledger loses a
// mouth, and coins and goods pass whole to the closest living adult heir.
function heirOf(engine,state,id,minute){
 const ok=x=>x!==id&&Boolean(state.npcs[x])&&!['死亡','濒死'].includes(state.npcs[x].status)&&!npcIsMinor(engine,state,x,minute);
 const spouse=marriagesOf(engine,state,id).flatMap(m=>m.partners).filter(ok).sort();
 if(spouse.length)return spouse[0];
 const childTypes=new Set(['子女','女儿','儿子']);
 const children=[...(engine.byId.get(id)?.relationships??[]).filter(r=>childTypes.has(r.type)).map(r=>r.with),...Object.values(state.family?.people??{}).filter(p=>Object.values(p.parents??{}).includes(id)).map(p=>p.id)].filter(ok).sort();
 if(children.length)return children[0];
 return npcHousehold(engine,state,id)?.members.filter(ok).sort()[0]??null;
}
function dieNaturally(d,engine,id,minute,cause,illness=null){
 const state=d.get('state'),house=npcHousehold(engine,state,id),deathId=`death_${key(id,minute)}`,name=nameOf(engine,state,id);
 d.set(['state','npcs',id,'status'],'死亡');d.set(['state','npcs',id,'activity'],'已故');d.set(['state','npcs',id,'diedAt'],minute);
 if(state.npcs[id].caring)d.remove(['state','npcs',id,'caring']);
 for(const row of Object.values(state.family?.illnesses??{}).filter(r=>r.patient===id&&r.status==='患病中')){
  release(d,row);d.set(['state','family','illnesses',row.id],{...d.get('state','family','illnesses',row.id),status:'病故',endedAt:minute});
 }
 const obligations=[];
 for(const o of Object.values(state.obligations??{}).sort((a,b)=>a.id.localeCompare(b.id)))if(['待履行','进行中'].includes(o.status)&&[o.promisor,o.promisee].includes(id)){
  d.set(['state','obligations',o.id],{...o,status:'取消',reason:`${name}已${cause}，约定终止`,resolvedAt:minute,endedByDeath:deathId});obligations.push(o.id);
 }
 const heir=heirOf(engine,state,id,minute);
 const estate={heir,coins:state.npcs[id].coins??0,items:{},debts:Object.entries(state.records??{}).filter(([,r])=>r.category==='debt'&&[r.debtor,r.creditor].includes(id)&&r.amount>(r.paid??0)).map(([k])=>k).sort()};
 if(heir){
  for(const item of Object.keys(state.npcs[id].inventory??{}).sort()){const n=engine.quantity(d,id,item);if(n>0){transferItems(d,engine,id,heir,item,n);estate.items[item]=n;}}
  if(estate.coins){d.set(['state','npcs',heir,'coins'],(d.get('state','npcs',heir,'coins')??0)+estate.coins);d.set(['state','npcs',id,'coins'],0);}
  d.set(['state','npcs',heir,'developments'],[...d.get('state','npcs',heir,'developments')??[],{type:'继承',source:deathId,minute,from:id}]);
 }
 const ledger=house?state.settlements?.[house.settlement]:null,population=Number.isSafeInteger(ledger?.population)?{before:ledger.population,after:Math.max(0,ledger.population-1)}:null;
 if(population)d.set(['state','settlements',house.settlement,'population'],population.after);
 const content=`${name}在${engine.calendar(minute).text.slice(0,-6)}${cause}。`;
 const witnesses=witness(d,engine,deathId,[id],house?[house.id]:[],{minute,kind:'health',content,salience:4});
 d.set(['state','family','deaths',deathId],{id:deathId,person:id,minute,cause,illness:illness?.id??null,household:house?.id??null,settlement:house?.settlement??null,population,estate,obligations,witnesses});
}

function healthDay(d,engine,minute){
 const h=healthRules(engine);if(!h)return;
 const seed=d.document.randomSeed,day=minute/DAY,ended=new Set();
 for(const illness of Object.values(d.get('state','family','illnesses')??{}).filter(r=>r.status==='患病中').sort((a,b)=>a.id.localeCompare(b.id))){
  const npc=d.get('state','npcs',illness.patient);
  if(!npc||npc.status==='死亡'){release(d,illness);d.set(['state','family','illnesses',illness.id],{...d.get('state','family','illnesses',illness.id),status:'中止',endedAt:minute});continue;}
  if(minute>=illness.endsAt){recover(d,engine,illness,minute);ended.add(illness.patient);continue;}
  if(illness.severity!=='重'||npc.status!=='患病')continue;
  const carer=assignCare(d,engine,illness,minute);
  if(minute<=illness.since)continue;
  const fatality=carer?h.graveFatality.cared:h.graveFatality.alone,daily=1-(1-fatality)**(DAY/(illness.endsAt-illness.since));
  if(clockRoll(seed,`illness-death:${illness.id}`,day)<daily)dieNaturally(d,engine,illness.patient,minute,'病故',illness);
 }
 for(const id of Object.keys(d.get('state','npcs')).sort()){
  const state=d.get('state'),npc=state.npcs[id];
  if(engine.byId.get(id)?.tier!=='full'||incapable.includes(npc.status)||!settled(state,id)||ended.has(id))continue;
  const age=npcAgeAt(engine,state,id,minute),band=age===null?null:ageBand(h,age);if(!band)continue;
  if(clockRoll(seed,`natural-death:${id}`,day)<perDay(band.suddenDeathPerYear)){dieNaturally(d,engine,id,minute,'寿终');continue;}
  if(clockRoll(seed,`illness:${id}`,day)<Math.min(1,band.illnessPerYear/360))fallIll(d,engine,id,minute,band);
 }
}

// Every midnight in (before, after] is processed once with the state of that
// boundary; the engine already stops at each midnight while time passes.
// Health comes first so a death that night already ends the marriage.
export function advanceNpcLife(d,engine,before,after){
 if(!rules(engine))return;
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){healthDay(d,engine,day*DAY);familyDay(d,engine,day*DAY);}
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
 const h=r.health,rate=v=>Number.isFinite(v)&&v>=0,share=v=>Number.isFinite(v)&&v>=0&&v<=1,span=v=>Array.isArray(v)&&whole(v[0])&&Number.isSafeInteger(v[1])&&v[0]<=v[1];
 if(h){
  if(!Array.isArray(h.bands)||!h.bands.length||h.bands[0].fromAge!==0||h.bands.some((x,i)=>!Number.isSafeInteger(x.fromAge)||i&&x.fromAge<=h.bands[i-1].fromAge||!rate(x.illnessPerYear)||x.illnessPerYear>360||!share(x.graveShare)||!share(x.suddenDeathPerYear)))errors.push('npcLife.health.bands须从0岁起按年龄递增，发病率、重病比例与猝亡率有效');
  if(!span(h.mildDays)||!span(h.graveDays))errors.push('npcLife.health病程天数区间无效');
  if(!share(h.graveFatality?.cared)||!share(h.graveFatality?.alone)||h.graveFatality.cared>h.graveFatality.alone)errors.push('npcLife.health.graveFatality须有照护时不高于无人照护');
  if(!(h.weakenedGraveMultiplier>=1)||!whole(h.bloodMl)||!Array.isArray(h.feverC)||h.feverC.length!==2||h.feverC.some(t=>!(t>37&&t<43)))errors.push('npcLife.health体弱倍数、血量或发热温度无效');
 }
 return errors;
}
