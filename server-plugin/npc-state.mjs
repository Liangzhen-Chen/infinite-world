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
export function npcSchedule(engine,state,id){
    const care=state?.npcs?.[id]?.caring;
    if(care&&engine.byId.get(id)?.schedule)return {default:[{start:0,end:1440,location:care.location,activity:'照护病人',services:[]}]};
    return state?.npcs?.[id]?.vocation?.schedule??engine.byId.get(id)?.schedule;
}
export function npcServices(engine,state,id){return state?.npcs?.[id]?.vocation?.services??engine.byId.get(id)?.services??[];}
