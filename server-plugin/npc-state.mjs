import {vocabulary} from './domain-rules.mjs';
// Only active catalog people are instantiated. Faction rosters and profile
// prose never become money, inventory or private knowledge in a campaign.
import {personConstraint,personConstraints,personCareer,personRoutine,personLawRoles,personEmployment} from './entity-view.mjs';
import {recordsWhere,digest,persistable,cloneData} from './storage.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {isEffective} from './lifecycle-state.mjs';
const worldEvent=(state,key)=>{const id=key?.replace(/^world_event:/,'');const row=state.records?.[`world_event:${id}`];return row?.category==='world_event'&&row.id===id?row:null;};

const appointmentKey=id=>`service_appointment:${id}`;
// The one relation read model. Legacy scalars seed NPC -> player relations
// until a ledger row exists; they are never a second live value.
export function relationView(engine,state,from,to){
 const person=from==='player'?state.player:state.npcs?.[from]??state.creatures?.[from];
 const current=person?.relationships?.[to];
 const base=engine?.byId?.get(from)?.relationships?.find?.(row=>row.with===to);
 const initial=to==='player'?person:base;
 return {trust:initial?.trust??0,affection:initial?.affection??0,respect:0,fear:0,romance:0,competition:0,favors:[],evidenceKeys:[],...cloneData(current??{})};
}
// Appointment services are reported under the category the world vocabulary gives them.
const serviceNames=(engine,services)=>[...new Set(services.map(s=>vocabulary(engine,'services','categories',s)??s))];
// An appointment changes where/when an existing service is offered. It never
// grants a career, skill, consent to a transaction, or a bilateral obligation.
export function bookServiceAppointment(d,engine,row,{actor=row.actor}={}){
 const state=d.get('state'),source=worldEvent(state,row.sourceEvent);
 const place=engine.world.locations.some(l=>l.id===row.location)||row.location?.startsWith('bld_')&&state.created?.[row.location];
 if(actor!==row.actor||!state.npcs?.[actor]||!row.id||d.get('state','records',appointmentKey(row.id))||!place||!Number.isSafeInteger(row.start)||!Number.isSafeInteger(row.end)||row.start<0||row.end<=row.start||!Array.isArray(row.services)||!row.services.length||row.services.some(s=>typeof s!=='string'||!s)||source?.verb!=='appointment_agreed'||source.actor!==actor||!row.services.includes(source.payload?.service)||source.minute>row.start)throw Error('Invalid service appointment or actor/source');
 if(row.fee!==undefined&&(!Number.isSafeInteger(row.fee)||row.fee<0)||row.minutes!==undefined&&(!Number.isSafeInteger(row.minutes)||row.minutes<1||row.minutes>row.end-row.start))throw Error('Invalid appointment terms');
 const other=serviceAppointments(state,actor).find(r=>r.start<row.end&&row.start<r.end&&r.location!==row.location);
 if(other)throw Error('Conflicting service appointment locations');
 const value={...persistable(row),category:'service_appointment'};
 d.set(['state','records',appointmentKey(row.id)],value);
 d.set(['state','records',`${appointmentKey(row.id)}:source`],{category:'service_appointment_receipt',digest:digest(value)});
 return value;
}
export function serviceAppointments(state,actor){
 return recordsWhere(state?.records,'category','service_appointment').filter(r=>{
  const source=worldEvent(state,r.sourceEvent);
  return r.actor===actor&&state.records[`${appointmentKey(r.id)}:source`]?.digest===digest(r)&&source?.verb==='appointment_agreed'&&source.actor===actor&&r.services.includes(source.payload?.service);
 });
}
export function initialNpcState(npc,{newCharacter=false}={}){
    return{id:npc.id,name:npc.name,location:npc.location,coins:npc.coins??0,
        ...(npc.species?{species:npc.species}:{}),...(npc.society?{society:npc.society}:{}),
        inventory:structuredClone(npc.inventory??{}),trust:newCharacter?0:npc.trust??0,
        affection:newCharacter?0:npc.affection??0,developments:[],relationships:{}};
}

// A social boss is a combat definition of an existing resident, not another body.
export function actorId(world,id){return world.bosses?.find(b=>b.id===id)?.actor??id;}
export function actorPath(world,id){
    id=actorId(world,id);
    return id==='player'?['state','player']:['state',id?.startsWith('npc_')?'npcs':'creatures',id];
}
export function bossCognitionField(actor){return actor?.id?.startsWith('npc_')?'bossCognition':'cognition';}
// A changed livelihood replaces the catalog schedule and teaching services in
// campaign state; the authored catalog stays untouched for other campaigns.
// A household member caring for a gravely ill person stays home all day and
// offers no services until the illness ends (npc-life sets and clears this).
// A roster person or campaign-born child brought into the simulation by
// npc-life keeps a home routine in campaign state instead of a catalog one.
export function npcSchedule(engine,state,id,minute=state?.minute,constraints=null){
 const base=baseNpcSchedule(engine,state,id,minute,constraints);
 if(!state||personConstraint(engine,state,id,minute,constraints)||state.npcs?.[id]?.caring||state.npcs?.[id]?.levy)return base;
 const day=Math.floor(minute/1440)*1440,appointments=serviceAppointments(state,id).filter(r=>r.start<day+1440&&day<r.end);
 // Reception belongs to the current office, not the frozen biography. Keep
 // sleep, meals and rest days, and let an explicit personal booking take priority.
 const calendar=engine.calendar(minute),variant=calendar.market?'market':base?.restDays?.includes(calendar.day)?'rest':'default';
 const receptions=(constraints??personConstraints(engine,state)).examinerReceptions.get(id)??[];
 if(receptions.length&&variant!=='rest'&&isEffective(engine,state,id))for(const office of receptions){
   if(!isEffective(engine,state,office.organization)||!office.authority?.operations?.includes('certify'))continue;
   const role=engine.byId.get(office.authority.profession),actor=state.npcs?.[id],person=engine.byId.get(id);
   if(!role||(actor?.proficiencies?.[role.entry?.skill]??person?.proficiencies?.[role.entry?.skill]??0)<(role.entry?.minimumProficiency??100))continue;
   const slots=base?.seasonal?.[String(calendar.season)]?.[variant]??base?.[variant]??base?.default??[];
   for(const [start,end]of office.receptionHours??[])for(const slot of slots){
    if(slot.location!==person?.workplace?.location||/睡|休息|歇息|吃饭|用餐|早饭|午饭|晚饭|家务/.test(slot.activity??''))continue;
    const from=Math.max(start,slot.start),to=Math.min(end,slot.end);
    if(from<to&&!appointments.some(r=>r.start<day+to&&day+from<r.end))appointments.push({start:day+from,end:day+to,location:office.seat,services:['teach']});
   }
 }
 if(!appointments.length)return base;
 const overlay=slots=>{
  let result=slots??[{start:0,end:1440,location:state.npcs[id]?.location,activity:'日常起居',services:[]}];
  for(const row of appointments){const start=Math.max(0,row.start-day),end=Math.min(1440,row.end-day);
   result=result.flatMap(slot=>slot.end<=start||slot.start>=end?[slot]:[
    ...(slot.start<start?[{...slot,end:start}]:[]),
    {...slot,start:Math.max(slot.start,start),end:Math.min(slot.end,end),location:row.location,activity:'预约接待',services:[...new Set([...(slot.location===row.location?slot.services??[]:[]),...serviceNames(engine,row.services)])]},
    ...(slot.end>end?[{...slot,start:end}]:[])]);
  }
  return result;
 };
 const schedule={...base,default:overlay(base?.default)};
 for(const key of ['market','rest'])if(base?.[key])schedule[key]=overlay(base[key]);
 if(base?.seasonal)schedule.seasonal=Object.fromEntries(Object.entries(base.seasonal).map(([key,value])=>[key,Object.fromEntries(Object.entries(value).map(([variant,slots])=>[variant,Array.isArray(slots)?overlay(slots):slots]))]));
 return schedule;
}
function baseNpcSchedule(engine,state,id,minute=state?.minute,constraints=null){
    const hold=state&&personConstraint(engine,state,id,minute,constraints)?.value;
    if(hold)return {default:[{start:0,end:1440,location:hold.location,activity:'依法拘留',services:[]}]};
    const own=state?.npcs?.[id],base=engine.byId.get(id)?.schedule??own?.routine,care=own?.caring;
    if(care&&base)return {default:[{start:0,end:1440,location:care.location,activity:'照护病人',services:[]}]};
    // U12: a levied villager serves at the army's camp until released.
    if(own?.levy)return {default:[{start:0,end:1440,location:own.levy.location,activity:'服役',services:[]}]};
    const employed=state&&personEmployment(engine,state,id,minute,constraints)?.value;
    const job=employed&&!employed.education&&['有效','要求加薪'].includes(employed.status)&&Math.floor(employed.starts/1440)<=Math.floor(minute/1440)?employed:null;
    if(job){
        const home=npcHousehold(engine,state,id,constraints)?.homeLocation??engine.byId.get(id)?.home?.location??job.location;
        const slot=(start,end,location,activity)=>({start,end,location,activity,services:[]});
        const activity=job.task??'受雇工坊生产',work=job.workMinutes??480,end=480+work+60;
        return {default:[slot(0,480,home,'睡眠与休息'),slot(480,720,job.location,activity),slot(720,780,job.location,'午间休息'),slot(780,end+1,job.location,activity),slot(end+1,1440,home,'家务与休息')],
            restDays:base?.restDays??[],rest:[slot(0,1440,home,'休息')]};
    }
    const routine=state&&personRoutine(engine,state,id,constraints);
    // A move (npc-life) remaps home and work; a later change of livelihood is
    // built from that new home and then takes precedence.
    const residence=own?.residence;
    let schedule=routine??(residence&&base&&!(own.vocation&&own.vocation.since>residence.since)?residence.schedule:own?.vocation?.schedule??base);
    // A hired person with no other routine whose contract does not put them at
    // work today (strike/stoppage, not yet started) stays at home: derived from
    // the contract's current status, never left without a whereabouts.
    if(!schedule&&employed){
        const home=npcHousehold(engine,state,id,constraints)?.homeLocation??engine.byId.get(id)?.home?.location??own?.location??employed.location;
        schedule={default:[{start:0,end:1440,location:home,activity:employed.status==='罢工'?'停工在家':'日常起居',services:[]}]};
    }
    const lease=activeRental(state,id,minute,constraints);
    if(!lease||!schedule)return schedule;
    const prior=lease.use==='home'?lease.oldHome:engine.byId.get(id)?.workplace?.location;
    const remap=value=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='location'&&v===prior?lease.subject:remap(v)])):value;
    return remap(schedule);
}
// A pass over many people may hand in the shared index (entity-view.mjs
// personConstraints) instead of rescanning every record per person.
export const activeRental=(state,id,minute=state?.minute,constraints=null)=>(constraints?.leases?constraints.leases.get(id)??[]:recordsWhere(state?.records,'kind','asset_lease')).find(r=>r.kind==='asset_lease'&&r.tenant===id&&r.status==='有效'&&r.createdAt<=minute&&minute<r.deadline);
export function npcServices(engine,state,id){
    if(state&&personConstraint(engine,state,id))return [];
    return [...new Set([...personCareer(engine,state??{},id).value.services,...(state?currentWorkstationRecipes(engine,state,id).map(r=>r.id):[])])].filter(service=>{
        if(!['judge','officer','law','register'].includes(service))return true;
        return engine.rules.law?.codes?.some(c=>personLawRoles(engine,state??{},id,c).length);
    });
}

// Read-only age and household selectors shared without loading simulation.
const DAY=1440,YEAR=360*DAY;
function calendarDate(minute){const day=Math.floor(minute/DAY);return {year:Math.floor(day/360)+1,month:Math.floor(day/30)%12+1,day:day%30+1};}
export function npcAgeAt(engine,state,id,minute=state.minute){
 const person=state.family?.people?.[id]??state.created?.[id]??engine.byId.get(id);if(!person)return null;
 if(person.birth){
  const now=calendarDate(minute),b=person.birth;
  return now.year-b.year-((now.month<b.month||now.month===b.month&&now.day<b.day)?1:0);
 }
 return Number.isFinite(person.age)?person.age+Math.floor(minute/YEAR):null;
}
const leftOf=(state,houseId)=>state.family?.households?.[houseId]?.left??[];
// Lifetime is one elapsed-time event; the world is fixed and created entities
// are indexed by the current immutable branch, never by a person's old home.
export function beginHouseholdReads(engine){
 const byId=new Map(),byMember=new Map();
 for(const h of engine.world.households??[]){if(!byId.has(h.id))byId.set(h.id,h);for(const id of h.members){const rows=byMember.get(id)??[];rows.push(h);byMember.set(id,rows);}}
 return {byId,byMember,created:null,population:null};
}
export function householdDefinition(engine,state,houseId){
 const split=state.family?.households?.[houseId];if(split?.homeLocation&&split?.settlement)return split;
 const cache=engine.advanceHouseholds,authored=cache?cache.byId.get(houseId):engine.world.households?.find(h=>h.id===houseId);if(authored)return authored;
 if(cache&&cache.created!==state.created){
  cache.created=state.created;cache.population=new Map();
  for(const p of Object.values(state.created??{}))if(p.generated==='population'){const rows=cache.population.get(p.householdId)??[];rows.push(p);cache.population.set(p.householdId,rows);}
 }
 const people=cache?(cache.population?.get(houseId)??[]):Object.values(state.created??{}).filter(p=>p.generated==='population'&&p.householdId===houseId);
 if(!people.length)return null;
 return {id:houseId,settlement:people[0].settlement,homeLocation:people[0].home?.location??people[0].home?.district,members:people.map(p=>p.id)};
}
export function npcHousehold(engine,state,id,constraints=null){
 const rental=activeRental(state,id,undefined,constraints);if(rental?.use==='home')return {id:rental.id,settlement:rental.settlement,homeLocation:rental.subject,members:[id]};
 const entered=Object.entries(state.family?.households??{}).find(([,r])=>r.members?.includes(id))?.[0];
 const entity=state.created?.[id]??engine.byId.get(id);
 const homes=engine.advanceHouseholds?engine.advanceHouseholds.byMember.get(id)??[]:engine.world.households??[];
 const house=entered?householdDefinition(engine,state,entered):homes.find(h=>h.members.includes(id)&&!leftOf(state,h.id).includes(id))??(entity?.householdId&&!leftOf(state,entity.householdId).includes(id)?householdDefinition(engine,state,entity.householdId):null);
 return house?{id:house.id,settlement:house.settlement,homeLocation:house.homeLocation,members:householdMembers(engine,state,house.id)}:null;
}
export function householdMembers(engine,state,houseId){
 const house=householdDefinition(engine,state,houseId),left=leftOf(state,houseId);
 return house?[...new Set([...house.members.filter(m=>!left.includes(m)),...state.family?.households?.[houseId]?.members??[]])]:[];
}

// Shared relationship ledger mutation; event selection and deltas stay with callers.
const clamp=(n,min=-100,max=100)=>Math.max(min,Math.min(max,n));
const actor=(state,id)=>id==='player'?state.player:state.npcs[id];
const path=id=>id==='player'?['state','player']:['state','npcs',id];
export const relationDimensions=['trust','affection','respect','fear','romance','competition'];
export function applyRelationEvidence(d,engine,evidence){
 if(!actor(d.get('state'),evidence.from)||!actor(d.get('state'),evidence.to))return null;
 const row=relationView(engine,d.get('state'),evidence.from,evidence.to);
 if(row.evidenceKeys.includes(evidence.key))return {duplicate:true,from:evidence.from,to:evidence.to,evidence:evidence.key,delta:{}};
 const delta={};for(const dimension of relationDimensions){
  const before=row[dimension],change=evidence.delta[dimension]??0;
  row[dimension]=clamp(before+change,['fear','romance'].includes(dimension)?0:-100);if(row[dimension]!==before)delta[dimension]=row[dimension]-before;
 }
 if(evidence.favor&&!row.favors.some(f=>f.id===evidence.key))row.favors.push({id:evidence.key,debtor:evidence.from,creditor:evidence.to,what:evidence.favor,sourceEvent:evidence.sourceEvent,minute:evidence.minute,status:'未还'});
 row.evidenceKeys.push(evidence.key);d.set([...path(evidence.from),'relationships',evidence.to],row);
 // Legacy scalar fields are immutable initial values, never live projections.
 const developments=actor(d.get('state'),evidence.from)?.developments??[];
 d.set([...path(evidence.from),'developments'],[...developments,{eventType:evidence.eventType,source:evidence.sourceEvent,evidence:evidence.key,with:evidence.to,minute:evidence.minute,delta}]);
 return {from:evidence.from,to:evidence.to,evidence:evidence.key,delta};
}
function register(d,engine,evidence){
 const old=d.get('state','relationEvidence',evidence.key);
 if(old)return applyRelationEvidence(d,engine,old);
 if(evidence.from===evidence.to||!actor(d.get('state'),evidence.from)||!actor(d.get('state'),evidence.to))return null;
 d.set(['state','relationEvidence',evidence.key],evidence);return applyRelationEvidence(d,engine,evidence);
}

// Standing transmission (standing.mjs) writes a person's share through the same ledger.
export function recordStandingEvidence(d,engine,evidence){return register(d,engine,evidence);}
