import {vocabulary} from './domain-rules.mjs';
// Only active catalog people are instantiated. Faction rosters and profile
// prose never become money, inventory or private knowledge in a campaign.
import {personConstraint,personConstraints,personCareer,personRoutine,personLawRoles,personEmployment,personBusiness,institutionOffices} from './entity-view.mjs';
import {recordsWhere,recordsMemo,stateMemo,digest,persistable,cloneData,canonicalEqual} from './storage.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {projectAssignment,PROJECT_ACTIVITY,agriculturalEmployment} from './employment-state.mjs';
import {contractTerms,leaseState} from './contract-state.mjs';
import {facilityView} from './facility-state.mjs';
// Domain-owned daily work uses the same schedule and work budget as employment.
let subsistenceDuties=()=>[];
let subsistenceChores=()=>[];
// The same home routine applies before and after a roster member materializes.
export function lifeRoutine(home,{minor=false,occupation=''}={}){
    const day=minor?'在家中玩耍，由家人照看':`在家操持家务${occupation?`（${occupation}）`:''}`;
    return {default:[{start:0,end:360,location:home,activity:'睡眠',services:[]},{start:360,end:1260,location:home,activity:day,services:[]},{start:1260,end:1440,location:home,activity:'睡眠',services:[]}]};
}
export function registerSubsistenceDuties(resolve,chores=()=>[]){subsistenceDuties=resolve;subsistenceChores=chores;}
// Published counters are staffed posts even when their routine advertises
// only trade. Keep these native consumers distinct from an independent stall.
export function npcServicePosts(engine,state){
 const posts=institutionOffices(engine,state);
 const add=(holder,seat)=>posts.push({holder,seat,receptionHours:[engine.byId.get(seat)?.openHours??engine.rules.governance?.officeHours??[480,1020]]});
 for(const p of engine.rules.agriculture?.settlements??[])if(p.manager&&p.counter)add(p.manager,p.counter);
 for(const b of engine.rules.economy?.credit?.banks??[])for(const id of b.keepers??[])add(id,b.location);
 return posts;
}
export function subsistenceScheduleAt(engine,state,id,minute){
 const offset=minute%1440,rows=subsistenceDuties(engine,state,id,minute,true),row=rows.find(r=>r.start<=offset&&offset<r.end);
 if(row)return {...row,until:minute-offset+row.end,boundaryUntil:minute-offset+(row.boundaryEnd??row.end)};
 return null;
}
const worldEvent=(state,key)=>{const id=key?.replace(/^world_event:/,'');const row=state.records?.[`world_event:${id}`];return row?.category==='world_event'&&row.id===id?row:null;};

const appointmentKey=id=>`service_appointment:${id}`;
const marketTripInputs={categories:['market_trip']};
const appointmentInputs={categories:['service_appointment']},appointmentActors=Symbol('service appointment actors');
// Only the original event actually referenced by a service appointment can
// change its source proof. Unrelated world history never changes a routine.
export function serviceAppointmentSources(state){
 return recordsWhere(state?.records,'category','service_appointment').map(row=>worldEvent(state,row.sourceEvent));
}

// One physical purchase trip is shared by scheduling, conflicts and household
// work budgets. Service windows reserve the keeper only while serving.
export function marketTimeWindows(state,id){
 const participants=recordsMemo(state?.records,marketTimeWindows,()=>{
  const out=new Map();
  for(const row of recordsWhere(state?.records,'category','market_trip'))for(const id of new Set([row.actor,row.keeper])){
   const rows=out.get(id)??[];rows.push(row);out.set(id,rows);
  }
  return out;
 },marketTripInputs);
 return (participants.get(id)??[]).flatMap(row=>row.actor===id
  ?[{...row,start:row.departAt,end:row.returnAt}]
  :row.keeper===id?(row.serviceWindows??[]).map(s=>({...row,start:s.start,end:s.end,serving:true})):[]);
}
export function marketScheduleAt(state,id,minute){
 const row=marketTimeWindows(state,id).find(r=>r.start<=minute&&minute<r.end);
 if(!row)return null;
 if(row.serving)return {location:row.to,activity:'接待顾客',services:[],until:row.end,marketTrip:row.id};
 // A multi-day labor trip carries its own day-by-day slots (walking legs, work, nights away).
 const seg=row.segments?.find(s=>s.start<=minute&&minute<s.end);
 if(seg)return {location:seg.travel?null:seg.location,activity:seg.activity,services:[],until:seg.end,marketTrip:row.id,travel:seg.travel?{...seg.travel,depart:seg.start,arrive:seg.end}:null};
 const outbound=minute<row.arriveAt,inbound=minute>=row.finishAt;
 const travel=outbound?{from:row.from,to:row.to,depart:row.departAt,arrive:row.arriveAt,edges:row.outboundEdges??[]}
  :inbound?{from:row.to,to:row.from,depart:row.finishAt,arrive:row.returnAt,edges:row.inboundEdges??[]}:null;
 return {location:travel?null:row.to,activity:travel?(row.travelActivity??'赶集途中'):(row.activity??'赶集采购'),services:[],until:travel?.arrive??row.finishAt,marketTrip:row.id,travel};
}
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
 const participants=recordsMemo(state?.records,appointmentActors,()=>{
  const out=new Map();
  for(const row of recordsWhere(state?.records,'category','service_appointment')){
   const rows=out.get(row.actor)??[];rows.push(row);out.set(row.actor,rows);
  }
  return out;
 },appointmentInputs);
 return (participants.get(actor)??[]).filter(r=>{
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
export function npcSchedule(engine,state,id,minute=state?.minute,constraints=null,subsistence=true){
 let base=baseNpcSchedule(engine,state,id,minute,constraints);
 const duties=state&&subsistence?subsistenceDuties(engine,state,id,minute):[];
 if(base&&duties.length){
   // Both inputs are immutable within this elapsed-time action. Availability
   // above is still checked against live custody/illness before using a duty.
   const cache=engine.scheduleReadCache;
   const overlays=cache?(cache.subsistenceRoutines??=new WeakMap()):null;
   const prior=overlays?.get(base);
   if(prior?.duties===duties){
    if(process.env.FIELDS_INDEX_CHECK==='1'&&!canonicalEqual(prior.schedule,overlaySubsistence(base,duties)))throw Error(`subsistence routine cache mismatch: ${id}`);
    base=prior.schedule;
   }else{
    const schedule=overlaySubsistence(base,duties);
    overlays?.set(base,{duties,schedule});base=schedule;
   }
 }
 if(!state||personConstraint(engine,state,id,minute,constraints)||state.npcs?.[id]?.caring||state.npcs?.[id]?.levy)return base;
 const day=Math.floor(minute/1440)*1440,appointments=serviceAppointments(state,id).filter(r=>r.start<day+1440&&day<r.end);
 // Reception belongs to the current office, not the frozen biography. Keep
 // sleep, meals and rest days, and let an explicit personal booking take priority.
 const receptions=(constraints??personConstraints(engine,state)).examinerReceptions.get(id)??[];
 if(!appointments.length&&!receptions.length)return base;
 const calendar=engine.calendar(minute),variant=calendar.market?'market':base?.restDays?.includes(calendar.day)?'rest':'default';
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
 // Reception overlays used to rebuild every seasonal variant at every slot
 // read. Re-evaluate the live offices/appointments above, then share only the
 // pure overlay while its base, day and effective windows still match.
 const cache=engine.scheduleReadCache,location=state.npcs[id]?.location;
 const overlays=cache&&base?(cache.routines??=new WeakMap()):null;
 const prior=overlays?.get(base);
 if(prior&&prior.day===day&&prior.location===location&&canonicalEqual(prior.appointments,appointments))return prior.schedule;
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
 overlays?.set(base,{day,location,appointments,schedule});
 return schedule;
}
function overlaySubsistence(base,duties){
 const overlay=slots=>duties.reduce((rows,duty)=>rows.flatMap(s=>s.end<=duty.start||s.start>=duty.end?[s]:[
  ...(s.start<duty.start?[{...s,end:duty.start}]:[]),{...duty,start:Math.max(s.start,duty.start),end:Math.min(s.end,duty.end)},...(s.end>duty.end?[{...s,start:duty.end}]:[])
 ]),slots);
 const schedule={...base,default:overlay(base.default??[])};
 for(const key of ['market','rest'])if(base[key])schedule[key]=overlay(base[key]);
 if(base.seasonal)schedule.seasonal=Object.fromEntries(Object.entries(base.seasonal).map(([key,v])=>[key,Object.fromEntries(Object.entries(v).map(([variant,slots])=>[variant,Array.isArray(slots)?overlay(slots):slots]))]));
 return schedule;
}
function baseNpcSchedule(engine,state,id,minute=state?.minute,constraints=null){
    const hold=state&&personConstraint(engine,state,id,minute,constraints)?.value;
    if(hold)return {default:[{start:0,end:1440,location:hold.location,activity:'依法拘留',services:[]}]};
    const own=state?.npcs?.[id],base=engine.byId.get(id)?.schedule??own?.routine,care=own?.caring;
    if(care)return {default:[{start:0,end:1440,location:care.location,activity:'照护病人',services:[]}]};
    // U12: a levied villager serves at the army's camp until released.
    if(own?.levy)return {default:[{start:0,end:1440,location:own.levy.location,activity:'服役',services:[]}]};
    const employed=state&&personEmployment(engine,state,id,minute,constraints)?.value;
    const job=employed&&!employed.education&&['有效','要求加薪'].includes(employed.status)&&Math.floor(employed.starts/1440)<=Math.floor(minute/1440)?employed:null;
    if(job){
        const home=npcHousehold(engine,state,id,constraints)?.homeLocation??engine.byId.get(id)?.home?.location??job.location;
        const slot=(start,end,location,activity)=>({start,end,location,activity,services:[]});
        const activity=job.task??'受雇工坊生产',work=job.workMinutes??480,end=480+work+60;
        const time=householdWorkTime(engine,state,id,minute,{commuteMinutes:job.commuteMinutes??0,workMinutes:work,constraints});
        if(time.reservedMinutes||time.commuteMinutes||work!==480){
            const slots=[slot(0,480,home,'睡眠与休息'),slot(480,1020,job.location,activity),slot(1020,1440,home,'家务与休息')];
            const overlay=row=>{
                const next=slots.flatMap(s=>s.end<=row.start||s.start>=row.end?[s]:[
                    ...(s.start<row.start?[{...s,end:row.start}]:[]),
                    {...row,start:Math.max(s.start,row.start),end:Math.min(s.end,row.end)},
                    ...(s.end>row.end?[{...s,start:row.end}]:[])]);
                slots.splice(0,slots.length,...next);
            };
            overlay(slot(720,780,job.location,'午间休息'));
            for(const row of time.reserved)overlay(row);
            for(const row of time.commute)overlay(slot(row.start,row.end,row.returning?home:job.location,'通勤'));
            for(const row of time.unused)overlay(slot(row.start,row.end,home,'家务与休息'));
            return {default:slots,restDays:base?.restDays??[],rest:[slot(0,1440,home,'休息')]};
        }
        return {default:[slot(0,480,home,'睡眠与休息'),slot(480,720,job.location,activity),slot(720,780,job.location,'午间休息'),slot(780,end+1,job.location,activity),slot(end+1,1440,home,'家务与休息')],
            restDays:base?.restDays??[],rest:[slot(0,1440,home,'休息')]};
    }
    // F083: a member of a public works crew spends the two work windows at the site (never while detained,
    // levied or caring, which returned above). Whether they really are there is measured, not assumed.
    const crew=!job&&!employed&&state&&projectAssignment(state,id);
    if(crew){
        const home=npcHousehold(engine,state,id,constraints)?.homeLocation??engine.byId.get(id)?.home?.location??crew.location;
        const slot=(start,end,location,activity)=>({start,end,location,activity,services:[]});
        return {default:[slot(0,480,home,'睡眠与休息'),slot(480,720,crew.location,PROJECT_ACTIVITY),slot(720,780,crew.location,'午间休息'),slot(780,1021,crew.location,PROJECT_ACTIVITY),slot(1021,1440,home,'家务与休息')],
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
// The household keeps its real routine when a job is considered or signed.
// This is a read-only allocation; employment-state remains the only attendance book.
const workTimeMemo=Symbol('household work time'),tradingPlaceMemo=Symbol('trading place');
export function householdWorkTime(engine,state,id,minute=state.minute,{commuteMinutes=0,workMinutes=480,constraints=null,subsistence=true}={}){
 return stateMemo(state,engine,[workTimeMemo,id,minute,commuteMinutes,workMinutes,constraints,subsistence],()=>readHouseholdWorkTime(engine,state,id,minute,{commuteMinutes,workMinutes,constraints,subsistence}));
}
function readHouseholdWorkTime(engine,state,id,minute,{commuteMinutes,workMinutes,constraints,subsistence}){
 const own=state.npcs?.[id],person=state.created?.[id]??engine.byId.get(id),calendar=engine.calendar(minute);
 const routine=personRoutine(engine,state,id,constraints)??own?.residence?.schedule??own?.vocation?.schedule??person?.schedule??own?.routine;
 const variant=calendar.market?'market':routine?.restDays?.includes(calendar.day)?'rest':'default';
 const seasonal=routine?.seasonal?.[String(calendar.season)];
 const slots=seasonal?.[variant]??routine?.[variant]??seasonal?.default??routine?.default??[];
 const household=npcHousehold(engine,state,id,constraints),home=household?.homeLocation??person?.home?.location??own?.location;
 const members=new Set([id,household?.id,...household?.members??[]].filter(Boolean));
 const fields=new Set((engine.rules.agriculture?.settlements??[]).map(r=>r.fieldLocation));
 const leases=recordsWhere(state.records,'kind','asset_lease').filter(r=>leaseState(engine,state,r,minute).active).map(r=>contractTerms(r,minute));
 const householdField=location=>{
  if(!fields.has(location))return false;
  const rented=leases.filter(r=>r.subject===location);
  if(rented.length)return rented.some(r=>members.has(r.tenant));
  const asset=state.buildings?.[location],base=state.created?.[location]??engine.byId.get(location);
  const owners=asset?.owners&&Object.keys(asset.owners).length?Object.entries(asset.owners).filter(([,share])=>share>0).map(([holder])=>holder):[asset?.owner??base?.owner];
  return owners.some(holder=>members.has(holder))||recordsWhere(state.records,'category','private_farm').some(r=>r.location===location&&members.has(r.owner)&&['growing','ready'].includes(r.status));
 };
 const marketVariant=calendar.market&&Array.isArray(seasonal?.market??routine?.market);
 const atState=minute===state.minute?state:{...state,minute};
 const tradesAt=location=>stateMemo(state,engine,[tradingPlaceMemo,location,minute,constraints],()=>{
  const facility=facilityView(engine,state,location);
  if(facility?.factor===0)return false;
  if((facility?.services??(state.created?.[location]??engine.byId.get(location))?.services??[]).includes('trade'))return true;
  // personBusiness is the L1 source also consumed by currentShops. An employed
  // keeper cannot offer trade; skip it before reading its employment schedule
  // so this household allocation never recursively allocates another job.
  return [...new Set([...engine.world.npcs.map(n=>n.id),...Object.keys(state.npcs??{})])].some(trader=>{
   const n=state.created?.[trader]??state.family?.people?.[trader]??engine.byId.get(trader);
   if(!n||!(n.services??[]).includes('trade')&&!(n.serviceCatalog??[]).some(s=>s.kind==='trade')&&!state.npcs?.[trader]?.vocation)return false;
   const job=personEmployment(engine,atState,trader,minute,constraints)?.value;
   if(job&&job.status!=='罢工'&&Math.floor(job.starts/1440)<=Math.floor(minute/1440))return false;
   const business=personBusiness(engine,atState,trader,constraints);
   return business?.open.value&&business.location.value===location;
  });
 });
 // An unassigned gravely ill dependent cannot be left with an invented substitute.
 const attending=(member,illness)=>{
  const n=state.npcs?.[member];
  return member!==illness.patient&&n?.caring?.illness===illness.id&&n.location===n.caring.location&&!n.scheduleTravel&&!n.cognitionTravel&&!n.levy&&!['患病','濒死','昏迷'].includes(n.status)&&isEffective(engine,state,member)&&!personConstraint(engine,state,member,minute,constraints);
 };
 const unattended=Object.values(state.family?.illnesses??{}).some(r=>r.status==='患病中'&&r.severity==='重'&&r.patient!==id&&household?.members.includes(r.patient)&&r.since<=minute&&minute<r.endsAt&&!household.members.some(m=>attending(m,r)));
 const fullCare=own?.caring||unattended;
 let duties=fullCare?[{start:480,end:1020,location:own?.caring?.location??home,activity:'照护病人',services:[]}]:slots.flatMap(({start,end,location,services})=>{
  if(householdField(location))return [{start,end,location,services,activity:'农事'}];
  return marketVariant&&tradesAt(location)?[{start,end,location,services,activity:'集市行程'}]:[];
 });
 // Near-home chores debit work, without creating a travel/service boundary.
 for(const row of subsistence?subsistenceChores(engine,state,id,minute):[]){
  duties=duties.flatMap(r=>r.end<=row.start||r.start>=row.end?[r]:[...(r.start<row.start?[{...r,end:row.start}]:[]),...(r.end>row.end?[{...r,start:row.end}]:[])]);
  duties.push(row);
 }
 const day=Math.floor(minute/1440)*1440;
 // K08's real trip reserves the traveller for both journeys and shopping;
 // its keeper is reserved only for the actual service windows.
 for(const trip of recordsWhere(state.records,'category','market_trip')){
  const windows=trip.actor===id?[{start:trip.departAt,end:trip.returnAt}]:trip.keeper===id?trip.serviceWindows??[]:[];
  for(const window of windows){
   const start=Math.max(0,window.start-day),end=Math.min(1440,window.end-day);
   if(start>=end)continue;
   // A completed trip replaces overlapping planned duty; a field slot must
   // not swallow its receipt and still count those minutes as farm work.
   duties=duties.flatMap(row=>row.end<=start||row.start>=end?[row]:[
    ...(row.start<start?[{...row,end:start}]:[]),
    ...(row.end>end?[{...row,start:end}]:[])
   ]);
   duties.push({start,end,location:trip.to,activity:'集市行程',services:[]});
  }
 }
 for(const o of Object.values(state.obligations??{}))if(o.reservationVersion===1&&['待履行','进行中'].includes(o.status)&&(o.deliveryVersion===1?o.promisor===id:[o.promisor,o.promisee].includes(id))&&!(o.type==='等候'&&o.promisee===id&&o.attendance?.[id]>0)){
  const start=Math.max(0,(o.departures?.[id]??o.start)-day),end=Math.min(1440,o.deadline-day);
  if(start<end)duties.push({start,end,location:o.location,activity:'已约定事务',services:[]});
 }
 const reserved=[],free=[];
 for(const [lo,hi]of [[480,720],[780,1020]]){
  let cursor=lo;
  for(const row of duties.filter(r=>r.start<hi&&lo<r.end).sort((a,b)=>a.start-b.start)){
   const start=Math.max(cursor,row.start,lo),end=Math.min(hi,row.end);
   if(start>cursor)free.push({start:cursor,end:start});
   if(end>start){reserved.push({...row,start,end});cursor=end;}
  }
  if(cursor<hi)free.push({start:cursor,end:hi});
 }
 const reservedMinutes=reserved.reduce((n,r)=>n+r.end-r.start,0),commute=[];
 let inbound=Math.max(0,Math.ceil(commuteMinutes)),outbound=inbound;
 for(const r of free){const used=Math.min(r.end-r.start,inbound);if(used){commute.push({start:r.start,end:r.start+used,returning:false});r.start+=used;inbound-=used;}}
 for(const r of [...free].reverse()){const used=Math.min(r.end-r.start,outbound);if(used){commute.push({start:r.end-used,end:r.end,returning:true});r.end-=used;outbound-=used;}}
 let left=Math.max(0,Math.floor(workMinutes));const unused=[],work=[];
 for(const r of free){const minutes=Math.min(left,r.end-r.start);if(minutes)work.push({start:r.start,end:r.start+minutes});if(r.end>r.start+minutes)unused.push({start:r.start+minutes,end:r.end});left-=minutes;}
 return {availableMinutes:480,reservedMinutes,reserved,commute,commuteMinutes:commute.reduce((n,r)=>n+r.end-r.start,0),work,unused,workMinutes:work.reduce((n,r)=>n+r.end-r.start,0),unattended};
}
// Shared household/attendance allocation for village output and labor demand.
export function agriculturalWorkforce(engine,state,p,farm,day,population=state.settlements[p.settlement].population){
 const id=p.settlement,hired=agriculturalEmployment(state,id,day);
 let localWorked=0;const commuters=new Map();
 for(const raw of recordsWhere(state.records,'kind','workshop'))if(raw.laborMarket===1){
  const job=contractTerms(raw,day*1440+480),shift=job.shifts?.find(r=>!r.aggregate&&Math.floor(r.start/1440)===day);
  const minutes=job.attendance?.[String(day)]??shift?.minutes??0;
  if(job.settlement===id)localWorked+=minutes/480;
  if(job.settlement===id&&minutes>0)commuters.set(job.worker,job);
 }
 // Farm duties stay in the field budget; care, trips and already attended
 // employment consume the same finite day in both vacancies and daily output.
 let householdMinutes=0;
 for(const [member,own]of Object.entries(state.npcs??{})){
  if(!(npcAgeAt(engine,state,member,day*1440+480)>=18)||own.levy||!isEffective(engine,state,member)||npcHousehold(engine,state,member)?.settlement!==id)continue;
  const job=commuters.get(member),time=householdWorkTime(engine,state,member,day*1440+480,{commuteMinutes:job?.commuteMinutes??0,workMinutes:job?.workMinutes??480});
  householdMinutes+=time.commuteMinutes+time.reserved.filter(r=>r.activity!=='农事').reduce((n,r)=>n+r.end-r.start,0);
 }
 const normalWorkers=Math.floor(population*p.workerFraction),availableWorkers=Math.max(0,normalWorkers-(state.records[`levy:${id}`]?.count??0)-localWorked-householdMinutes/480);
 const laborShare=normalWorkers?availableWorkers/normalWorkers:1,processing=Math.min(p.processingWorkers,availableWorkers);
 const freshWorkers=Math.min(p.freshWorkers*laborShare,Math.max(0,availableWorkers-processing)),fieldWorkers=Math.min(p.farmWorkers*laborShare+hired.hired,farm.tools.capacity,Math.max(0,availableWorkers-processing-freshWorkers)+hired.hired);
 return {availableWorkers,processing,freshWorkers,fieldWorkers,ownFieldWorkers:Math.max(0,fieldWorkers-hired.hired),fieldMinutes:fieldWorkers*480};
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
const householdIdentityMemo=Symbol('household identity'),householdMembersMemo=Symbol('household members');
export const householdIdentityInputs=[['family','households'],['created']];
export function npcHousehold(engine,state,id,constraints=null){
 const rental=activeRental(state,id,undefined,constraints);if(rental?.use==='home')return {id:rental.id,settlement:rental.settlement,homeLocation:rental.subject,members:[id]};
 return stateMemo(state,engine,[householdIdentityMemo,id],()=>readNpcHousehold(engine,state,id),householdIdentityInputs);
}
function readNpcHousehold(engine,state,id){
 const entered=Object.entries(state.family?.households??{}).find(([,r])=>r.members?.includes(id))?.[0];
 const entity=state.created?.[id]??engine.byId.get(id);
 const homes=engine.advanceHouseholds?engine.advanceHouseholds.byMember.get(id)??[]:engine.world.households??[];
 const house=entered?householdDefinition(engine,state,entered):homes.find(h=>h.members.includes(id)&&!leftOf(state,h.id).includes(id))??(entity?.householdId&&!leftOf(state,entity.householdId).includes(id)?householdDefinition(engine,state,entity.householdId):null);
 return house?{id:house.id,settlement:house.settlement,homeLocation:house.homeLocation,members:householdMembers(engine,state,house.id)}:null;
}
export function householdMembers(engine,state,houseId){
 // Existing callers may sort their result; the remembered membership stays
 // read-only even when a seasonal consumer needs a different visit order.
 return [...stateMemo(state,engine,[householdMembersMemo,houseId],()=>readHouseholdMembers(engine,state,houseId),householdIdentityInputs)];
}
function readHouseholdMembers(engine,state,houseId){
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
