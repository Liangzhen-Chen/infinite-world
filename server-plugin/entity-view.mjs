// Every field is {value, source, override}. Source names the authoritative
// catalog/state path; override marks an explicit campaign or authored override.
// These projections never persist or cache results. They grant no capabilities.
import {actorId,actorPath} from './npc-state.mjs';
import {npcHousehold,npcAgeAt,npcSchedule,npcServices} from './npc-state.mjs';
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

// Current physical state is inside the record, never the record envelope.
export function physicalFeature(engine,state,id){
    const place=[...engine.world.locations,...Object.values(state.created??{})].find(p=>p.features?.some(f=>f.id===id));
    const definition=place?.features.find(f=>f.id===id);if(!definition)return null;
    const row=state.records?.[`physical_feature:${id}`];
    return {definition:fact({...definition,location:place.id},`catalog.${place.id}.features.${id}`),
        state:fact(row?.state??definition.state,row?`state.records.physical_feature:${id}.state`:`catalog.${place.id}.features.${id}.state`,Boolean(row))};
}
export function personBody(engine,state,requested){
    const id=actorId(engine.world,requested),path=actorPath(engine.world,id),actor=at(state,path.slice(1)),base=baseOf(engine,state,id);
    if(!actor&&!base)return null;
    const boss=engine.byId.get(actor?.boss??(requested!==id?requested:null)),species=actor?.species??base?.species??boss?.monster;
    return {species:fact(engine.byId.get(species),actor?.species?`${path.join('.')}.species`:`catalog.${id}.species`,Boolean(actor?.species)),
        body:fact(actor?.body??base?.body,actor?.body?`${path.join('.')}.body`:`catalog.${id}.body`,Boolean(actor?.body)),
        form:fact(actor?.form?.until>(state.minute??0)?actor.form:null,`${path.join('.')}.form`,Boolean(actor?.form)),
        boss:fact(boss,`catalog.${boss?.id}`),status:fact(actor?.status,`${path.join('.')}.status`,Boolean(actor))};
}
export function placeSettlement(engine,state,location){
    const seen=new Set(),ids=new Set([...(engine.world.settlementProfiles??[]).map(p=>p.id),...Object.keys(state.settlements??{})]);
    while(location&&!seen.has(location)){if(ids.has(location))return fact(location,'current place ancestry');seen.add(location);location=(state.created?.[location]??engine.byId.get(location))?.parent;}
    return fact(null,'current place ancestry');
}
export function personBusiness(engine,state,id){
    const base=baseOf(engine,state,id),actor=state.npcs?.[id]??state.creatures?.[id];if(!base)return null;
    const vocation=actor?.vocation,rule=engine.rules.npcGrowth?.vocations?.find(v=>v.id===vocation?.id),schedule=npcSchedule(engine,state,id)??actor?.residence?.schedule;
    const slots=Object.values(schedule??{}).filter(Array.isArray).flat().filter(s=>s.services?.includes('trade'));
    const changed=Boolean(vocation||actor?.residence||actor?.workplace),trades=vocation?npcServices(engine,state,id).includes('trade')||slots.length>0:
        (base.services??[]).includes('trade')||(base.serviceCatalog??[]).some(s=>s.kind==='trade');
    const location=actor?.workplace?.location??rule?.location??(changed?slots[0]?.location:null)??base.workplace?.location??base.location;
    const open=Boolean(actor)&&!['死亡','濒死','昏迷','患病'].includes(actor.status)&&!personConstraint(engine,state,id)&&!actor.caring&&!actor.levy&&!actor.scheduleTravel&&!actor.cognitionTravel&&trades&&!(actor.residence?.workChanged&&!vocation);
    return {keeper:fact(id,'identity'),location:fact(location,changed?`state.npcs.${id} + npc-state.npcSchedule`:`catalog.${id}.workplace`,changed),
        settlement:placeSettlement(engine,state,location),shopType:fact(actor?.shopType??rule?.shopType??base.shopType,changed?`state.npcs.${id} + rules.npcGrowth.vocations`:`catalog.${id}.shopType`,changed),
        open:fact(open,'current services + health + legal constraints',changed||Boolean(personConstraint(engine,state,id)))};
}
export function settlementPopulation(engine,state,id){
    const profile=engine.world.settlementProfiles?.find(p=>p.id===id),ledger=state.settlements?.[id];
    const houses=(engine.world.households??[]).filter(h=>h.settlement===id),generated=Object.values(state.created??{}).filter(p=>p.generated==='population'&&p.settlement===id);
    const baseline=new Set([...profile?.residentIds??[],...houses.flatMap(h=>h.members),...generated.map(p=>p.id)]);
    const candidates=new Set([...baseline,...Object.values(state.family?.households??{}).flatMap(h=>h.members??[])]);
    const current=[...candidates].filter(p=>{const h=personHousehold(engine,state,p).value;return state.npcs?.[p]?.status!=='死亡'&&(h?h.settlement===id:baseline.has(p));});
    const count=ledger?.population??Math.max(0,(profile?.population??baseline.size)+current.length-baseline.size);
    const occupied=new Set(current.map(p=>personHousehold(engine,state,p).value?.id).filter(Boolean));
    const initial=new Set([...houses.map(h=>h.id),...generated.map(p=>p.householdId)]);
    return {population:fact(count,ledger?'state.settlements + current households':'catalog population + current households',Boolean(ledger||state.family)),
        householdCount:fact(Math.max(0,(profile?.householdCount??initial.size)+occupied.size-initial.size),'current households + pending population quota',Boolean(state.family)),
        residents:fact(current,'current households',Boolean(state.family))};
}
export function settlementGovernment(engine,state,id){
    const profile=engine.world.settlementProfiles?.find(p=>p.id===id),g=profile?.details?.governance;
    if(profile?.council){const group=groupView(engine,state,profile.council);return {head:group?.leader??fact(null,'current council'),powers:fact(group?.organization.value.charter?.rules??[],'current council charter'),appointment:fact(null,'current council'),enforcers:fact([],'current council')};}
    const remote=state.remote?.[profile?.county]?.skeleton.offices?.find(o=>o.settlement===id),originalHead=g?.head??remote?.holder;
    const rows=records(state).filter(([,r])=>r.category==='governance_office'&&r.settlement===id&&(r.office==='office_village_head'||remote&&r.office===remote.id)).sort((a,b)=>(b[1].appointedAt??b[1].since??0)-(a[1].appointedAt??a[1].since??0));
    const alive=id=>id==='player'?state.player?.status!=='死亡':state.npcs?.[id]?.status!=='死亡'&&state.creatures?.[id]?.status!=='死亡';
    const dismissed=id=>records(state).some(([,r])=>r.category==='legal_dismissal'&&(r.subject??r.npc)===id&&r.status!=='撤销');
    const active=rows.find(([,r])=>r.status==='在任'&&(r.since??r.appointedAt??0)<=(state.minute??0)&&(r.until??Infinity)>(state.minute??0)&&alive(r.holder)&&!dismissed(r.holder));
    const office=engine.rules.governance?.authority?.offices?.[active?.[1].office];
    const head=active?.[1].holder??(rows.length?null:alive(originalHead)&&!dismissed(originalHead)?originalHead:null);
    return {head:fact(head,rows.length?'state.records.governance_office':remote?`state.remote.${profile.county}.skeleton.offices`:`catalog.${id}.details.governance.head`,Boolean(rows.length)),
        powers:fact(active?office?.powers??[]:head?g?.permissions?.head??[]:[],active?'rules.governance.authority.offices':`catalog.${id}.details.governance.permissions`,Boolean(rows.length)),
        appointment:fact(active?.[1]??g?.appointment,active?`state.records.${active[0]}`:`catalog.${id}.details.governance.appointment`,Boolean(active)),
        enforcers:fact((g?.enforcers??[]).filter(p=>alive(p)&&!dismissed(p)),`catalog.${id}.details.governance + legal dismissals`)};
}
export function placeView(engine,state,id){
    const base=state.created?.[id]??engine.byId.get(id);if(!base)return null;
    const source=state.created?.[id]?`state.created.${id}`:`catalog.${id}`,view={};
    for(const field of ['id','parent','region','owner','features'])view[field]=fact(base[field],`${source}.${field}`,Boolean(state.created?.[id]));
    if(Object.hasOwn(state.buildings?.[id]??{},'owner'))view.owner=fact(state.buildings[id].owner,`state.buildings.${id}.owner`,true);
    view.settlement= fact(state.settlements?.[id],`state.settlements.${id}`,Boolean(state.settlements?.[id]));
    view.population=settlementPopulation(engine,state,id);view.government=settlementGovernment(engine,state,id);
    view.physical= (base.features??[]).map(f=>physicalFeature(engine,state,f.id));
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
