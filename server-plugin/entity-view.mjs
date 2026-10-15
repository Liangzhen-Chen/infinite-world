// Every field is {value, source, override}. Source names the authoritative
// catalog/state path; override marks an explicit campaign or authored override.
// These projections never persist or cache results. They grant no capabilities.
import {actorId,actorPath} from './npc-state.mjs';
import {npcHousehold,npcAgeAt} from './npc-state.mjs';
import {organizationState,memberOrganizations} from './organization-state.mjs';

const fact=(value,source,override=false)=>({value:structuredClone(value??null),source,override});
const at=(state,path)=>path.reduce((o,k)=>o?.[k],state);
const records=state=>Object.entries(state.records??{});
const recordFacts=(state,predicate)=>records(state).filter(([,r])=>predicate(r)).map(([key,r])=>fact(r,`state.records.${key}`,true));
const baseOf=(engine,state,id)=>state.created?.[id]??state.family?.people?.[id]??engine.byId.get(id);

function householdView(engine,state,id){
    const h=npcHousehold(engine,state,id);
    const changed=Object.values(state.family?.households??{}).some(r=>r.members?.includes(id)||r.left?.includes(id));
    return fact(h,changed?'state.family.households + world.households':'world.households',changed);
}
function socialIdentities(engine,state,id){
    return memberOrganizations(engine,state,id).map(org=>{
        const row=state.records?.[`organization:${org.id}`];
        const changed=Object.keys(row?.members??{}).some(m=>actorId(engine.world,m)===id);
        return fact({id:org.id,source:org.source,...org.members[id]},changed?`state.records.organization:${org.id}.members.${id}`:org.source==='household'?'world.households + state.family.households':org.source==='society'?`world.locations.${org.id}.monsterSociety`:`world.factions.${org.id} + rules.reputation.factions`,changed);
    });
}
function legalIdentities(engine,state,id){
    return recordFacts(state,r=>{
        if(!r.category?.startsWith('legal_'))return false;
        const subject=r.subject??r.offender??r.npc??(r.category==='legal_custody'?(state.records?.[r.case]?.offender??'player'):null);
        if(actorId(engine.world,subject)!==id)return false;
        if(r.category==='legal_wanted')return r.status==='生效';
        if(r.category==='legal_custody')return r.status==='生效'&&(r.expires??Infinity)>state.minute;
        if(r.category==='legal_detention')return !r.status||r.status==='生效';
        return ['legal_dismissal','legal_case'].includes(r.category);
    });
}

export function personView(engine,state,requested){
    const id=actorId(engine.world,requested),path=actorPath(engine.world,id),actor=at(state,path.slice(1)),base=baseOf(engine,state,id);
    if(id!=='player'&&!actor&&!base)return null;
    const root=path.join('.'),household=householdView(engine,state,id),h=household.value,residence=actor?.residence;
    const settlement=residence?.settlement??h?.settlement??actor?.settlement??base?.settlement??null;
    const settlementSource=residence?.settlement?`${root}.residence.settlement`:h?.settlement?household.source:actor?.settlement?`${root}.settlement`:`catalog.${id}.settlement`;
    const location=id==='player'?state.location:actor&&Object.hasOwn(actor,'location')?actor.location:base?.location??null;
    return {id:fact(id,requested!==id?`world.bosses.${requested}.actor`:'identity'),
        actorPath:fact(path,'npc-state.actorPath'),
        name:fact(actor?.name??base?.name,actor?.name?`${root}.name`:`catalog.${id}.name`,Boolean(actor?.name)),
        age:fact(id==='player'?state.player?.age:npcAgeAt(engine,state,id,state.minute??0),id==='player'?'state.player.age':`npc-life.npcAgeAt:${id}`,Boolean(state.family?.people?.[id])),
        household,residence:fact(residence??{household:h?.id??base?.householdId,settlement,home:h?.homeLocation??base?.home?.location},residence?`${root}.residence`:household.source,Boolean(residence)),
        settlement:fact(settlement,settlementSource,Boolean(residence||household.override||actor?.settlement)),
        location:fact(location,id==='player'?'state.location':actor&&Object.hasOwn(actor,'location')?`${root}.location`:`catalog.${id}.location`,Boolean(actor)),
        organizations:socialIdentities(engine,state,id),
        offices:recordFacts(state,r=>r.category==='governance_office'&&actorId(engine.world,r.holder)===id&&r.status==='在任'&&(r.until??Infinity)>(state.minute??0)),
        titles:recordFacts(state,r=>r.category==='title'&&actorId(engine.world,r.holder)===id&&r.status!=='已除爵'),
        notables:recordFacts(state,r=>r.category==='notable'&&actorId(engine.world,r.holder)===id&&r.status==='在册'),
        legal:legalIdentities(engine,state,id),
        species:fact(actor?.species??base?.species,actor?.species?`${root}.species`:`catalog.${id}.species`,Boolean(actor?.species)),
        mind:fact(actor?.mind,`${root}.mind`,Boolean(actor?.mind)),
        society:fact(actor?.society??base?.society,actor?.society?`${root}.society`:`catalog.${id}.society`,Boolean(actor?.society))};
}

export function groupView(engine,state,id){
    const org=organizationState(engine,state,id);if(!org)return null;
    const row=state.records?.[`organization:${id}`],source=org.source==='created'?`state.records.organization:${id}`:org.source==='household'?'world.households + state.family.households':org.source==='society'?`world.locations.${id}.monsterSociety`:`world.factions.${id} + rules.reputation.factions`;
    return {organization:fact(org,source,Boolean(row)),id:fact(id,'identity'),source:fact(org.source,source),
        members:fact(org.members,row?`${source} + state.records.organization:${id}`:source,Boolean(row||org.source==='household'&&state.family?.households?.[id])),
        leader:fact(org.leader,row&&Object.hasOwn(row,'leader')?`state.records.organization:${id}.leader`:source,Boolean(row&&Object.hasOwn(row,'leader'))),
        seat:fact(org.seat,source),kind:fact(org.kind,source),
        officials:fact(Object.entries(org.members).filter(([m,r])=>m===org.leader||!['成员'].includes(r.position)).map(([m])=>m),row?`${source} + state.records.organization:${id}.members`:source,Boolean(row)),
        treasury:fact(org.treasury,org.source==='faction'?`state.records.faction-assets:${id} + world.factions.${id}.resources`:`state.records.organization:${id}.treasury`,Boolean(row||state.records?.[`faction-assets:${id}`]))};
}

// A contact names a founding office holder. Resolve that office on every read;
// an explicit vacancy must never fall back to the authored former holder.
export function groupRepresentative(engine,state,id,requested){
    const view=groupView(engine,state,id);if(!view)return null;
    const f=engine.world.factions?.find(f=>f.id===id),canonical=actorId(engine.world,requested);
    if(requested===undefined||canonical===actorId(engine.world,f?.leader))return view.leader.value;
    if(view.officials.value.includes(canonical))return canonical;
    if(f?.coreMembers?.some(m=>actorId(engine.world,m)===canonical))return view.officials.value.find(m=>m!==view.leader.value)??view.leader.value;
    return null;
}

// V1 mappings only: later cards extend physical, operating and access views.
export function placeView(engine,state,id){
    const base=state.created?.[id]??engine.byId.get(id);if(!base)return null;
    const source=state.created?.[id]?`state.created.${id}`:`catalog.${id}`,view={};
    for(const field of ['id','parent','region','owner','features'])view[field]=fact(base[field],`${source}.${field}`,Boolean(state.created?.[id]));
    view.settlement= fact(state.settlements?.[id],`state.settlements.${id}`,Boolean(state.settlements?.[id]));
    return view;
}
export function populationView(engine,state,habitat,species){
    const h=engine.rules.wildlife?.habitats?.find(h=>h.id===habitat),row=state.records?.[`ecology:${habitat}`]?.populations?.[species];
    if(!h&&!row)return null;
    return {habitat:fact(h,'rules.wildlife.habitats'),species:fact(engine.byId.get(species),`catalog.${species}`),
        population:fact(row,`state.records.ecology:${habitat}.populations.${species}`,Boolean(row))};
}
export function itemView(engine,state,id){
    const instance=state.itemInstances?.[id],base=engine.byId.get(instance?.item??id);if(!instance&&!base)return null;
    const view={definition:fact(base,`catalog.${instance?.item??id}`)};
    for(const field of ['id','item','owner','status','durability','quality','maker','source']){
        const own=instance&&Object.hasOwn(instance,field);
        view[field]=fact(own?instance[field]:base?.[field],own?`state.itemInstances.${id}.${field}`:`catalog.${id}.${field}`,Boolean(own));
    }
    return view;
}
