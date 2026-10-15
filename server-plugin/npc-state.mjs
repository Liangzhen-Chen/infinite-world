// Only active catalog people are instantiated. Faction rosters and profile
// prose never become money, inventory or private knowledge in a campaign.
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
export function npcSchedule(engine,state,id){
    const own=state?.npcs?.[id],base=engine.byId.get(id)?.schedule??own?.routine,care=own?.caring;
    if(care&&base)return {default:[{start:0,end:1440,location:care.location,activity:'照护病人',services:[]}]};
    // A move (npc-life) remaps home and work; a later change of livelihood is
    // built from that new home and then takes precedence.
    const residence=own?.residence;
    if(residence&&base&&!(own.vocation&&own.vocation.since>residence.since))return residence.schedule;
    return own?.vocation?.schedule??base;
}
export function npcServices(engine,state,id){return state?.npcs?.[id]?.vocation?.services??engine.byId.get(id)?.services??[];}

// Read-only age and household selectors shared without loading simulation.
const DAY=1440,YEAR=360*DAY;
function calendarDate(minute){const day=Math.floor(minute/DAY);return {year:Math.floor(day/360)+1,month:Math.floor(day/30)%12+1,day:day%30+1};}
export function npcAgeAt(engine,state,id,minute=state.minute){
 const person=state.family?.people?.[id]??engine.byId.get(id);if(!person)return null;
 if(person.birth){
  const now=calendarDate(minute),b=person.birth;
  return now.year-b.year-((now.month<b.month||now.month===b.month&&now.day<b.day)?1:0);
 }
 return Number.isFinite(person.age)?person.age+Math.floor(minute/YEAR):null;
}
const leftOf=(state,houseId)=>state.family?.households?.[houseId]?.left??[];
export function npcHousehold(engine,state,id){
 const house=engine.world.households?.find(h=>h.members.includes(id)&&!leftOf(state,h.id).includes(id)||state.family?.households?.[h.id]?.members?.includes(id));
 return house?{id:house.id,settlement:house.settlement,homeLocation:house.homeLocation,members:householdMembers(engine,state,house.id)}:null;
}
export function householdMembers(engine,state,houseId){
 const house=engine.world.households?.find(h=>h.id===houseId),left=leftOf(state,houseId);
 return house?[...house.members.filter(m=>!left.includes(m)),...state.family?.households?.[houseId]?.members??[]]:[];
}
