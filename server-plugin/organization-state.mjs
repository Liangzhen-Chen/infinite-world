import {educationSites} from './education-state.mjs';
import {medicineSites} from './medicine-state.mjs';
// Read-only organization selector, shared by gameplay and entity/reputation views.
import {reputationFactions} from './reputation-catalog.mjs';
import {householdMembers,npcAgeAt} from './npc-state.mjs';
import {actorId,actorPath} from './npc-state.mjs';
import {groupAccountView} from './group-account.mjs';
import {temples,templeById} from './faith-catalog.mjs';
import {familyGroup,natalFamily} from './family-state.mjs';
import {isEffective,isGone} from './lifecycle-state.mjs';
const LEADER={王国:'国王',行会:'会长',帮派:'帮主',商号:'掌柜',教会:'主祭',会社:'会长',家户:'家长'};
const ELDER='长老',MEMBER='成员',key=id=>`organization:${id}`;
const living=(engine,state,id)=>{
    return isEffective(engine,state,actorId(engine.world,id));
};

function factionBase(engine,id){
    const listed=reputationFactions(engine).find(r=>r.id===id);
    const f=engine.world.factions?.find(f=>f.id===id)??(listed?{id,name:id}:null);if(!f)return null;
    const members={},add=(m,position)=>{if(m&&!members[m])members[m]={position,joinedAt:null,arrears:0};};
    add(f.leader,'首领');for(const m of f.coreMembers??[])add(m,ELDER);
    for(const m of listed?.members??[])add(m,MEMBER);
    for(const n of (engine.world.npcs??[]))if(n.faction===id)add(n.id,MEMBER);
    const mode=['地方议会','居民筹备组织'].includes(f.kind)?'vote':['教会','学派','学院'].includes(f.kind)?'elders':'leader';
    return {id,name:f.name,source:'faction',kind:f.kind,seat:f.contactAnchor,leader:f.leader,leaderTitle:'首领',members,treasury:f.resources?.treasuryCopper??0,
        charter:{mode,approval:true,fee:0,dues:0,rules:[f.method,f.demands].filter(Boolean)}};
}
function householdBase(engine,state,id){
    const h=engine.world.households?.find(h=>h.id===id);if(!h)return null;
    const age=m=>npcAgeAt(engine,state,m,state.minute??0)??0;
    const people=householdMembers(engine,state,id).filter(m=>living(engine,state,m)),adults=people.filter(m=>age(m)>=18);
    const head=[...adults].sort((a,b)=>age(b)-age(a)||a.localeCompare(b))[0]??null,members={};
    for(const m of people)members[m]={position:m===head?'家长':adults.includes(m)?ELDER:MEMBER,joinedAt:null,arrears:0};
    return {id,name:`${engine.byId.get(h.homeLocation)?.name??id}一户`,source:'household',kind:'家户',seat:h.homeLocation,leader:head,leaderTitle:'家长',members,treasury:0,
        charter:{mode:'elders',approval:true,fee:0,dues:0,rules:['家事由成年家人商定']}};
}
function societyBase(engine,id){
    const place=engine.world.locations?.find(l=>l.id===id&&l.monsterSociety);if(!place)return null;
    const leader=actorId(engine.world,place.monsterSociety.leader),members={};
    for(const n of [...engine.world.npcs??[],...engine.world.residents??[]])if(n.society===id)members[n.id]={position:n.id===leader?'首领':MEMBER,joinedAt:null,arrears:0};
    return {id,name:place.name,source:'society',kind:'聚居地',seat:place.monsterSociety.meetingPlace??place.id,leader,leaderTitle:'首领',members,treasury:0,
        charter:{mode:'elders',approval:true,fee:0,dues:0,rules:[]}};
}
// Derived view: catalog or household base, then this campaign's record on top.
export function organizationState(engine,state,id){
    if(isGone(engine,state,id))return null;
    const row=state.records?.[key(id)];
    const t=String(id).startsWith('temple:')?templeById(engine,id):null;
    const temple=t?.source==='temple'?{...t,kind:'教会',leader:t.teacher,leaderTitle:'主祭',members:{[t.teacher]:{position:'主祭',joinedAt:null,arrears:0}},treasury:0,charter:{mode:'leader',approval:true,fee:0,dues:0,rules:[t.rule]}}:null;
    const clinic=String(id).startsWith('clinic:')?medicineSites(engine,state).find(o=>o.id===id):null;
    const medical=clinic?{...clinic,source:'medicine',leaderTitle:'医师',treasury:0,charter:{mode:'leader',fee:0,dues:0,rules:[]}}:null;
    // Schools are the last catalogue fallback but one: scan education sites only when nothing earlier matched.
    const education=()=>{const school=educationSites(engine,state).find(o=>o.id===id);return school?{...school,source:'education',leaderTitle:'先生',members:school.leader?{[school.leader]:{position:'先生',joinedAt:null,arrears:0}}:{},treasury:0,charter:{mode:'leader',fee:0,dues:0,rules:[]}}:null;};
    const base=row?.source==='created'?null:(String(id).startsWith('family:')?familyGroup(engine,state,id.slice(7)):null)??factionBase(engine,id)??householdBase(engine,state,id)??societyBase(engine,id)??temple??education()??medical;
    if(!base&&row?.source!=='created')return null;
    const b=base??{id,name:row.name,source:'created',kind:row.kind,seat:row.seat,leader:null,leaderTitle:LEADER[row.kind]??'会长',members:{},treasury:0,charter:{}};
    const members={};
    for(const [m,entry]of Object.entries(b.members))members[actorId(engine.world,m)]={...entry};
    for(const m of Object.keys(row?.removed??{}))delete members[actorId(engine.world,m)];
    for(const [m,entry]of Object.entries(row?.members??{}))members[actorId(engine.world,m)]={...entry};
    for(const m of Object.keys(members))if(!living(engine,state,m))delete members[m];
    const leader=Object.hasOwn(row??{},'leader')?row.leader:b.leader;
    const current=leader&&members[actorId(engine.world,leader)]?actorId(engine.world,leader):null;
    for(const [m,entry]of Object.entries(members)){
        if(m===current)entry.position=b.leaderTitle;
        else if(entry.position===b.leaderTitle)entry.position=MEMBER;
    }
    return {...b,leader:current,members,charter:{...b.charter,...row?.charter},treasury:groupAccountView(engine,state,id)?.coins??b.treasury+(row?.treasury??0),
        ledger:row?.ledger??[],founder:row?.founder??null,nextDues:row?.nextDues??null};
}

export function organizationIds(engine,state){
    return [...new Set([...(engine.world.factions??[]).map(f=>f.id),...reputationFactions(engine).map(f=>f.id),...(engine.world.households??[]).map(h=>h.id),
        ...(engine.world.locations??[]).filter(l=>l.monsterSociety&&!engine.world.factions?.some(f=>f.contactAnchor===l.id)).map(l=>l.id),
        ...temples(engine).map(t=>t.id),...educationSites(engine,state).map(t=>t.id),...medicineSites(engine,state).map(t=>t.id),...Object.values(state.records??{}).filter(r=>r.category==='organization').map(r=>r.id)])];
}
// S2a：组织里“存下的”会籍与首领（作者数据 + 本局记录），不按生死与家户年龄派生——
// 持有适配器（holding-sources.mjs）的开账、双写与对账只读它。家户、学堂、医馆的成员是派生的，不在此列；
// 它们若有本局记录，只取记录里的成员。
export function storedOrganization(engine,state,id){
    const row=state.records?.[key(id)];
    const t=String(id).startsWith('temple:')||engine.world.factions?.some(f=>f.id===id&&f.kind==='教会')?templeById(engine,id):null;
    const temple=t?.teacher?{leader:t.teacher,members:{[t.teacher]:{position:'主祭'}}}:null;
    const base=row?.source==='created'?null:factionBase(engine,id)??societyBase(engine,id)??temple;
    if(!base&&!row)return null;
    const members={};
    for(const [m,entry]of Object.entries(base?.members??{}))members[actorId(engine.world,m)]=entry.position??MEMBER;
    for(const m of Object.keys(row?.removed??{}))delete members[actorId(engine.world,m)];
    for(const [m,entry]of Object.entries(row?.members??{}))members[actorId(engine.world,m)]=entry?.position??MEMBER;
    const leader=Object.hasOwn(row??{},'leader')?row.leader:base?.leader??null,current=leader&&members[actorId(engine.world,leader)]!==undefined?actorId(engine.world,leader):null;
    return {id,members,leader:current};
}
export function storedOrganizationIds(engine,state){
    return [...new Set([...(engine.world.factions??[]).map(f=>f.id),...reputationFactions(engine).map(f=>f.id),
        ...(engine.world.locations??[]).filter(l=>l.monsterSociety&&!engine.world.factions?.some(f=>f.contactAnchor===l.id)).map(l=>l.id),
        ...temples(engine).map(t=>t.id),...Object.values(state.records??{}).filter(r=>r.category==='organization').map(r=>r.id)])].sort();
}
export function memberOrganizations(engine,state,member){
    member=actorId(engine.world,member);
    const ids=organizationIds(engine,state),family=natalFamily(engine,state,member);if(family)ids.push(family);
    return ids.map(id=>organizationState(engine,state,id)).filter(o=>o?.members[member]);
}
