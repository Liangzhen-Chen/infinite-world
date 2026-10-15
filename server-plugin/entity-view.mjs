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
    const generated=state.created?.[id]?.householdId===h?.id;
    return fact(h,generated?`state.created.${id}.householdId + state.family.households`:changed?'state.family.households + world.households':'world.households',Boolean(changed||generated));
}
function socialIdentities(engine,state,id){
    return memberOrganizations(engine,state,id).map(org=>{
        const row=state.records?.[`organization:${org.id}`];
        const changed=Object.keys(row?.members??{}).some(m=>actorId(engine.world,m)===id);
        return fact({id:org.id,source:org.source,...org.members[id]},changed?`state.records.organization:${org.id}.members.${id}`:org.source==='household'?'world.households + state.family.households':`world.factions.${org.id} + rules.reputation.factions`,changed);
    });
}
function legalIdentities(engine,state,id){
    return recordFacts(state,r=>{
        if(!r.category?.startsWith('legal_'))return false;
        const subject=r.subject??r.offender??r.npc??(r.category==='legal_custody'?(state.records?.[r.case]?.offender??'player'):null);
        if(actorId(engine.world,subject)!==id)return false;
        if(r.category==='legal_wanted')return r.status==='生效';
        if(r.category==='legal_custody')return r.status==='生效'&&(r.expires??Infinity)>state.minute;
        if(r.category==='legal_detention')return (!r.status||r.status==='生效')&&(r.expires??Infinity)>(state.minute??0);
        return ['legal_dismissal','legal_case'].includes(r.category);
    });
}

// Small selectors let movement and capability checks avoid constructing a
// person's social memberships. They read the same authorities as personView.
export function personAge(engine,state,id,minute=state.minute??0){return fact(npcAgeAt(engine,state,actorId(engine.world,id),minute),'npc-state.npcAgeAt');}
export function personHousehold(engine,state,id){return householdView(engine,state,actorId(engine.world,id));}
export function personSimulation(engine,state,id){
    const base=baseOf(engine,state,id),remote=state.remote?.[base?.county]?.profiles?.[id];
    const status=remote?.status??base?.profileStatus;
    return fact(status==='full'||base?.tier==='full',remote?`state.remote.${base.county}.profiles.${id}.status`:`${state.created?.[id]?'state.created':'catalog'}.${id}.${status?'profileStatus':'tier'}`,Boolean(remote||state.created?.[id]));
}
// A caller may build this index for a single read-only movement pass. It is
// never retained on engine/state, so later legal writes are read immediately.
export function personConstraints(engine,state){
    const out=new Map();
    for(const [key,r] of records(state)){
        if(!['legal_detention','legal_custody'].includes(r.category)||r.status&&r.status!=='生效')continue;
        const subject=r.subject??state.records?.[r.case]?.offender??(r.category==='legal_custody'?'player':null),id=actorId(engine.world,subject);
        const entries=out.get(id)??[];entries.push({key,r});out.set(id,entries);
    }
    return out;
}
export function personConstraint(engine,state,id,minute=state.minute??0,index=null){
    id=actorId(engine.world,id);
    for(const {key,r} of (index??personConstraints(engine,state)).get(id)??[]){
        if((r.minute??r.started??0)>minute||(r.expires??Infinity)<=minute)continue;
        return fact(r,`state.records.${key}`,true);
    }
    return null;
}

export function homeResidents(engine,state,location){
    const place=state.created?.[location]??engine.byId.get(location),houses=(engine.world.households??[]).filter(h=>h.homeLocation===location);
    const members=houses.length?houses.flatMap(h=>[...h.members,...state.family?.households?.[h.id]?.members??[]]).filter(id=>personHousehold(engine,state,id).value?.homeLocation===location):[...place?.access?.residents??[]].filter(id=>{
        const h=personHousehold(engine,state,id);return !h.override||h.value?.homeLocation===location;
    });
    const owner=placeView(engine,state,location)?.owner.value;
    if(typeof owner==='string'&&(state.npcs?.[owner]||engine.byId.get(owner)?.tier))members.push(owner);
    return fact([...new Set(members)].filter(id=>at(state,actorPath(engine.world,id).slice(1))?.status!=='死亡'),houses.length?'world.households + state.family.households + place.owner':'place.access.residents + place.owner',Boolean(houses.some(h=>state.family?.households?.[h.id])));
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
        simulation:personSimulation(engine,state,id),constraint:personConstraint(engine,state,id),
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
    const row=state.records?.[`organization:${id}`],source=org.source==='created'?`state.records.organization:${id}`:org.source==='household'?'world.households + state.family.households':`world.factions.${id} + rules.reputation.factions`;
    return {id:fact(id,'identity'),source:fact(org.source,source),
        members:fact(org.members,row?`${source} + state.records.organization:${id}`:source,Boolean(row||org.source==='household'&&state.family?.households?.[id])),
        leader:fact(org.leader,row&&Object.hasOwn(row,'leader')?`state.records.organization:${id}.leader`:source,Boolean(row&&Object.hasOwn(row,'leader'))),
        seat:fact(org.seat,source),kind:fact(org.kind,source)};
}

// V1 mappings only: later cards extend physical, operating and access views.
export function placeView(engine,state,id){
    const base=state.created?.[id]??engine.byId.get(id);if(!base)return null;
    const source=state.created?.[id]?`state.created.${id}`:`catalog.${id}`,view={};
    for(const field of ['id','parent','region','owner','features'])view[field]=fact(base[field],`${source}.${field}`,Boolean(state.created?.[id]));
    if(Object.hasOwn(state.buildings?.[id]??{},'owner'))view.owner=fact(state.buildings[id].owner,`state.buildings.${id}.owner`,true);
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
