// Settlements and factions that keep reputation accounts and receive standing
// through their members. Both lists are derived from world data:
//  settlements: every settlement profile (geo/settlements.json);
//  factions:    every catalog faction (lore/factions.json), members = leader,
//               coreMembers and any person whose `faction` names it, relations
//               as catalogued.
// Monster-society seats and their councils are left out: they already hold a
// collective stance of their own (standing kind 'society').
// Hand-written rules.reputation.settlements / factions stay as overrides: they
// come first, and a hand-written faction entry replaces the derived one.
// Without rules.reputation the reputation system is off and both lists are empty.
const cache=new WeakMap();
const people=world=>[...world.npcs??[],...world.factionPeople??[],...world.residents??[]];
const affiliations=p=>[...(typeof p.faction==='string'?[p.faction]:[]),...(Array.isArray(p.factions)?p.factions:[])];

// Separate relation supplements leave reviewed society council rows intact.
// Existing catalog directions win; campaign account values win at their reader.
export function factionRelations(engine,id){
    const base=engine.world.factions?.find(f=>f.id===id)?.relations??[];
    return [...base,...(engine.rules.factionRelations?.[id]??[]).filter(r=>!base.some(b=>b.faction===r.faction))];
}

export function deriveReputationRegistry(world,rules){
    if(!rules)return{settlements:[],factions:[]};
    const seats=new Set((world.locations??[]).filter(l=>l.monsterSociety).map(l=>l.id));
    const settlements=[...new Set([...rules.settlements??[],...(world.settlementProfiles??[]).map(p=>p.id).filter(id=>id&&!seats.has(id))])];
    const members=new Map();
    for(const p of people(world))for(const f of affiliations(p)){if(!members.has(f))members.set(f,[]);members.get(f).push(p.id);}
    const manual=rules.factions??[],written=new Set(manual.map(f=>f.id));
    const derived=(world.factions??[]).filter(f=>f?.id&&!written.has(f.id)&&!seats.has(f.contactAnchor)).map(f=>({
        id:f.id,members:[...new Set([f.leader,...f.coreMembers??[],...members.get(f.id)??[]].filter(id=>typeof id==='string'&&id))],
        relations:structuredClone(f.relations??[]),source:`world/lore/factions.json#${f.id}`,derived:true}));
    return{settlements,factions:[...manual,...derived]};
}
function registry(engine){
    const rules=engine.rules?.reputation,world=engine.world??{};
    const key=[rules,rules?.settlements,rules?.factions,world.settlementProfiles,world.factions,world.locations,world.npcs,world.factionPeople];
    const hit=cache.get(engine);
    if(hit&&hit.key.every((v,i)=>v===key[i]))return hit.value;
    const value=deriveReputationRegistry(world,rules);
    cache.set(engine,{key,value});
    return value;
}
export const reputationSettlements=engine=>registry(engine).settlements;
export const reputationFactions=engine=>registry(engine).factions;
export const isReputationSettlement=(engine,id)=>registry(engine).settlements.includes(id);
