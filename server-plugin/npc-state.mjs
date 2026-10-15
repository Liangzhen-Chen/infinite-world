// Only active catalog people are instantiated. Faction rosters and profile
// prose never become money, inventory or private knowledge in a campaign.
import {personConstraint,personCareer,personRoutine,personLawRoles} from './entity-view.mjs';
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
    const hold=state&&personConstraint(engine,state,id,minute,constraints)?.value;
    if(hold)return {default:[{start:0,end:1440,location:hold.location,activity:'依法拘留',services:[]}]};
    const own=state?.npcs?.[id],base=engine.byId.get(id)?.schedule??own?.routine,care=own?.caring;
    if(care&&base)return {default:[{start:0,end:1440,location:care.location,activity:'照护病人',services:[]}]};
    // U12: a levied villager serves at the army's camp until released.
    if(own?.levy)return {default:[{start:0,end:1440,location:own.levy.location,activity:'服役',services:[]}]};
    const job=Object.values(state?.records??{}).find(r=>r.kind==='workshop'&&r.worker===id&&['有效','要求加薪'].includes(r.status)&&r.starts<=minute&&minute<r.deadline);
    if(job){
        const home=npcHousehold(engine,state,id)?.homeLocation??engine.byId.get(id)?.home?.location??job.location;
        const slot=(start,end,location,activity)=>({start,end,location,activity,services:[]});
        return {default:[slot(0,480,home,'睡眠与休息'),slot(480,720,job.location,'受雇工坊生产'),slot(720,780,job.location,'午间休息'),slot(780,1021,job.location,'受雇工坊生产'),slot(1021,1440,home,'家务与休息')],
            restDays:base?.restDays??[],rest:[slot(0,1440,home,'休息')]};
    }
    const routine=state&&personRoutine(engine,state,id,constraints);
    // A move (npc-life) remaps home and work; a later change of livelihood is
    // built from that new home and then takes precedence.
    const residence=own?.residence;
    const schedule=routine??(residence&&base&&!(own.vocation&&own.vocation.since>residence.since)?residence.schedule:own?.vocation?.schedule??base);
    const lease=activeRental(state,id,minute);
    if(!lease||!schedule)return schedule;
    const prior=lease.use==='home'?lease.oldHome:engine.byId.get(id)?.workplace?.location;
    const remap=value=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='location'&&v===prior?lease.subject:remap(v)])):value;
    return remap(schedule);
}
export const activeRental=(state,id,minute=state?.minute)=>Object.values(state?.records??{}).find(r=>r.kind==='asset_lease'&&r.tenant===id&&r.status==='有效'&&r.createdAt<=minute&&minute<r.deadline);
export function npcServices(engine,state,id){
    if(state&&personConstraint(engine,state,id))return [];
    return personCareer(engine,state??{},id).value.services.filter(service=>{
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
export function householdDefinition(engine,state,houseId){
 const authored=engine.world.households?.find(h=>h.id===houseId);if(authored)return authored;
 const people=Object.values(state.created??{}).filter(p=>p.generated==='population'&&p.householdId===houseId);
 if(!people.length)return null;
 return {id:houseId,settlement:people[0].settlement,homeLocation:people[0].home?.location??people[0].home?.district,members:people.map(p=>p.id)};
}
export function npcHousehold(engine,state,id){
 const rental=activeRental(state,id);if(rental?.use==='home')return {id:rental.id,settlement:rental.settlement,homeLocation:rental.subject,members:[id]};
 const entered=Object.entries(state.family?.households??{}).find(([,r])=>r.members?.includes(id))?.[0];
 const entity=state.created?.[id]??engine.byId.get(id);
 const house=entered?householdDefinition(engine,state,entered):(engine.world.households??[]).find(h=>h.members.includes(id)&&!leftOf(state,h.id).includes(id))??(entity?.householdId&&!leftOf(state,entity.householdId).includes(id)?householdDefinition(engine,state,entity.householdId):null);
 return house?{id:house.id,settlement:house.settlement,homeLocation:house.homeLocation,members:householdMembers(engine,state,house.id)}:null;
}
export function householdMembers(engine,state,houseId){
 const house=householdDefinition(engine,state,houseId),left=leftOf(state,houseId);
 return house?[...new Set([...house.members.filter(m=>!left.includes(m)),...state.family?.households?.[houseId]?.members??[]])]:[];
}
