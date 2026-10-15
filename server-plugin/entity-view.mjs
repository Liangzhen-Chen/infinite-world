// Every field is {value, source, override}. Source names the authoritative
// catalog/state path; override marks an explicit campaign or authored override.
// These projections never persist or cache results. They grant no capabilities.
import {actorId,actorPath} from './npc-state.mjs';
import {npcHousehold,npcAgeAt,npcSchedule,npcServices,beginHouseholdReads} from './npc-state.mjs';
import {organizationState,memberOrganizations} from './organization-state.mjs';
import {rankedOffice,adminLevel} from './promotion-view.mjs';
import {faithOf} from './faith-state.mjs';

const fact=(value,source,override=false)=>({value:structuredClone(value??null),source,override});
const at=(state,path)=>path.reduce((o,k)=>o?.[k],state);
const records=state=>Object.entries(state.records??{});
const recordFacts=(state,predicate)=>records(state).filter(([,r])=>predicate(r)).map(([key,r])=>fact(r,`state.records.${key}`,true));
const baseOf=(engine,state,id)=>state.created?.[id]??state.family?.people?.[id]??engine.byId.get(id);

// Missing vitals mean no accumulated strain. Reading never creates actor state.
export function personMental(engine,state,id){
    const a=at(state,actorPath(engine.world,id).slice(1));
    return fact(a?.mental??{fatigue:0,alertness:50,stress:0,interference:[]},a?.mental?'actor.mental':'unstrained baseline',Boolean(a?.mental));
}

const living=(engine,state,id)=>at(state,actorPath(engine.world,id).slice(1))?.status!=='死亡';
const dismissed=(state,id)=>Object.values(state.records??{}).some(r=>r.category==='legal_dismissal'&&(r.subject??r.npc)===id&&r.status!=='撤销');
const officeRows=state=>Object.entries(state.records??{}).filter(([,r])=>r.category==='governance_office');
function remoteHeadOffice(state,settlement){
    for(const [county,r] of Object.entries(state.remote??{})){
        const office=r.skeleton?.offices?.find(o=>o.settlement===settlement&&o.source==='generated');
        if(office)return {office,source:`state.remote.${county}.skeleton.offices`};
    }
    return null;
}
function currentHeadRow(state,settlement,remote){
    let latest=null;
    for(const entry of officeRows(state)){
        const r=entry[1];if(r.settlement!==settlement||!(r.office==='office_village_head'||remote&&r.office===remote.id)||(r.since??r.appointedAt??0)>(state.minute??0))continue;
        if(!latest||(r.since??r.appointedAt??0)>=(latest[1].since??latest[1].appointedAt??0))latest=entry;
    }
    return latest;
}
function officeFact(engine,state,key,row,override=true){
    const def=engine.rules.governance?.authority?.offices?.[row.office];
    if(!def)return fact({...row,powers:[],monthlyQuotaD:0,monthlyBudgetCopper:0,monthlySalaryCopper:0},`state.records.${key}`,true);
    const ranked=rankedOffice(engine,state,row.settlement,def),gov=settlementGovernment(engine,state,row.settlement);
    const head=row.office==='office_village_head';
    const foundingName=!override&&!state.records?.[`settlement_rank:${row.settlement}`]?baseOf(engine,state,row.holder)?.occupation:null;
    return fact({...row,name:foundingName??ranked.name,monthlyQuotaD:ranked.monthlyQuotaD??0,monthlyBudgetCopper:override?ranked.monthlyBudgetCopper??0:0,
        taxBps:override?ranked.taxBps??null:null,powers:override?[...ranked.powers??[],...(head?['chair','register']:[])]:['quest_publish','chair','register'],workplace:row.workplace??gov.seat.value,
        monthlySalaryCopper:engine.rules.governance?.salaries?.monthlyCopper?.[row.office]?.[adminLevel(engine,state,row.settlement)?.level??'村']??0},
        `${override?`state.records.${key}`:gov.head.source} + rules.governance.authority.offices.${row.office} + promotion + rules.governance.salaries`,override);
}
// Appointment records hold facts. Names, quotas, powers and pay are read from
// the office definition at the settlement's current administrative level.
export function personOffices(engine,state,requested,{settlement=null,power=null}={}){
    const id=actorId(engine.world,requested),rows=officeRows(state),out=[];
    if(!living(engine,state,id)||dismissed(state,id))return out;
    for(const [key,row] of rows){
        if(actorId(engine.world,row.holder)!==id||row.status!=='在任'||(row.since??row.appointedAt??0)>(state.minute??0)||(row.until??Infinity)<=(state.minute??0))continue;
        if(row.office==='office_village_head'||row.office===remoteHeadOffice(state,row.settlement)?.office.id){
            const gov=settlementGovernment(engine,state,row.settlement);
            if(gov.head.value!==id||gov.appointment.source!==`state.records.${key}`)continue;
        }
        const entry=officeFact(engine,state,key,row);if(entry)out.push(entry);
    }
    for(const [key,row] of records(state)){
        if(row.category!=='housing_steward'||row.steward!==id||row.revoked||row.expires<=(state.minute??0)||row.createdAt>(state.minute??0))continue;
        const grantor=rows.find(([,r])=>r.holder===row.grantor&&r.settlement===row.settlement&&r.office==='office_village_head'&&r.status==='在任'&&(r.until??Infinity)>(state.minute??0));
        if(!grantor||settlementHead(engine,state,row.settlement).value!==row.grantor)continue;
        out.push(officeFact(engine,state,key,{...row,office:'office_village_steward',holder:id,status:'在任',since:row.createdAt,until:row.expires,workplace:row.hall}));
    }
    const settlements=new Set([...(engine.world.settlementProfiles??[]).map(p=>p.id),...(engine.rules.agriculture?.settlements??[]).map(p=>p.settlement),...Object.values(state.remote??{}).flatMap(r=>(r.skeleton?.offices??[]).map(o=>o.settlement))]);
    for(const sid of settlements){
        const g=settlementGovernment(engine,state,sid);
        if(g.head.value!==id||g.head.override||engine.world.settlementProfiles?.find(p=>p.id===sid)?.council)continue;
        const entry=officeFact(engine,state,`catalog:${sid}`,{id:`catalog:${sid}`,category:'governance_office',office:'office_village_head',holder:id,settlement:sid,status:'在任',since:0,source:g.source.value},false);
        if(entry)out.push(entry);
    }
    return out.filter(e=>(!settlement||e.value.settlement===settlement)&&(!power||e.value.powers.includes(power)));
}
export function settlementHead(engine,state,settlement){
    return settlementGovernment(engine,state,settlement).head;
}
export function questPublisher(engine,state,board){
    const publishers=engine.rules.questSources?.publishers??{};
    return Object.hasOwn(publishers,board)?fact(publishers[board],'rules.questSources.publishers',true):settlementHead(engine,state,board);
}
export function questBoards(engine,state){
    return [...new Set([...Object.keys(engine.rules.questSources?.publishers??{}),...Object.keys(state.settlements??{}),...(engine.rules.agriculture?.settlements??[]).map(s=>s.settlement),...(engine.world.settlementProfiles??[]).map(s=>s.id)])].filter(b=>questPublisher(engine,state,b).value);
}
export function personCareer(engine,state,requested){
    const id=actorId(engine.world,requested),base=baseOf(engine,state,id),actor=at(state,actorPath(engine.world,id).slice(1));
    const vocation=actor?.vocation,def=engine.rules.npcGrowth?.vocations?.find(v=>v.id===vocation?.id);
    const services=id==='player'?[]:vocation?(def?.teaches??vocation.services??[]):base?.services??[];
    const roles=id==='player'?[state.professions?.combat,...state.professions?.life??[],...state.professions?.hidden??[]].filter(Boolean):[...new Set([...services.filter(s=>s.startsWith('profession_')),...(!vocation?[base?.combatProfession,...base?.lifeProfessions??[]].filter(Boolean):[])])];
    const apprenticeships=id==='player'?Object.entries(state.careers??{}).filter(([,r])=>r.initiation?.status==='守戒中').map(([r])=>r):[];
    return fact({occupation:vocation?(def?.name??vocation.name):actor?.occupation??base?.occupation??'',roles,apprenticeships,services:[...services],vocation:def??vocation??null},
        id==='player'?'state.professions + state.careers':vocation?`state.npcs.${id}.vocation + rules.npcGrowth.vocations`:`catalog.${id}.services`,Boolean(vocation||id==='player'));
}
export function personCertified(engine,state,id,skill){
    const c=personCareer(engine,state,id).value,s=engine.byId.get(skill),roles=s?.learningProfessions??(s?.profession?[s.profession]:[]);
    return !roles.length||roles.some(r=>c.roles.includes(r))||c.services.includes(skill);
}
export function personTeaching(engine,state,id,entity,{stage=null}={}){
    if(!living(engine,state,id)||personConstraint(engine,state,id))return false;
    const c=personCareer(engine,state,id).value,base=baseOf(engine,state,id),catalog=engine.byId.get(entity);
    if(c.services.includes(entity))return true;
    const skill=catalog?.skill?engine.byId.get(catalog.skill):catalog,role=skill?.profession;
    return Boolean(role&&c.roles.includes(role)&&(engine.byId.get(role)?.skillTree??[]).includes(skill.id)&&(stage===null||stage<=(base?.teachingStages?.[role]??0)));
}
export function personOccupation(engine,state,id){
    const offices=personOffices(engine,state,id),career=personCareer(engine,state,id);
    if(offices.length)return fact(offices.map(o=>o.value.name).join('、'),offices.map(o=>o.source).join(' + '),offices.some(o=>o.override));
    const former=officeRows(state).some(([,r])=>r.holder===id&&(r.since??0)<=(state.minute??0))||dismissed(state,id)||[...(engine.world.settlementProfiles??[])].some(p=>p.details?.governance?.head===id&&settlementHead(engine,state,p.id).value!==id);
    return former&&!career.value.vocation?fact('居民','current office vacancy',true):fact(career.value.occupation,career.source,career.override);
}
// Public-facing roles exclude household membership and private associations.
export function personPublicRole(engine,state,id){
    const occupation=personOccupation(engine,state,id),roles=memberOrganizations(engine,state,actorId(engine.world,id))
        .filter(o=>o.source==='faction'&&o.members[actorId(engine.world,id)]?.position!=='成员')
        .map(o=>`${o.name}${o.members[actorId(engine.world,id)].position}`);
    return fact([...new Set([occupation.value,...roles].filter(Boolean))].join('、'),`${occupation.source} + current public organization positions`,occupation.override||roles.length>0);
}
export function personRegistrar(engine,state,id,seat,occupations){
    const offices=personOffices(engine,state,id);
    if(offices.length&&offices.some(o=>o.override))return offices.some(o=>o.value.workplace===seat&&o.value.powers.includes('register'));
    if(dismissed(state,id))return false;
    const career=personCareer(engine,state,id).value,base=baseOf(engine,state,id);
    return (career.vocation?.location??base?.workplace?.location)===seat&&occupations.includes(career.occupation);
}
export function personRemuneration(engine,state,id){
    const offices=personOffices(engine,state,id),debts=records(state).filter(([,r])=>r.category==='office_salary'&&r.holder===id);
    const actor=at(state,actorPath(engine.world,id).slice(1));
    if(!offices.length&&!debts.length&&actor?.morale===undefined)return null;
    return fact({monthlyCopper:offices.reduce((sum,o)=>sum+o.value.monthlySalaryCopper,0),arrearsCopper:debts.reduce((sum,[,r])=>sum+r.arrears,0),
        morale:actor?.morale??engine.rules.governance?.salaries?.moraleBase??60},'personOffices + state.records.office_salary + actor.morale',Boolean(debts.length||actor?.morale!==undefined));
}
export function personLawRoles(engine,state,id,code){
    if(!living(engine,state,id)||dismissed(state,id))return [];
    const rows=officeRows(state).filter(([,r])=>r.holder===id&&(r.law===code.id||r.lawCode===code.id));
    if(rows.length)return personOffices(engine,state,id).filter(e=>e.value.law===code.id||e.value.lawCode===code.id).flatMap(e=>e.value.powers.filter(p=>['judge','officer'].includes(p)));
    return [...(code.judges?.includes(id)?['judge']:[]),...(code.officers?.includes(id)?['officer']:[])];
}
export function lawAuthorities(engine,state,code,kind='officer'){
    const candidates=new Set([...code.judges??[],...code.officers??[],...officeRows(state).map(([,r])=>r.holder)]);
    return [...candidates].filter(id=>personLawRoles(engine,state,id,code).some(p=>p==='judge'||kind!=='judge'&&p==='officer'));
}
export function personQuestRights(engine,state,id,{cultural=false}={}){
    id=actorId(engine.world,id);
    const sources=personOffices(engine,state,id,{power:'quest_publish'}).map(e=>fact(e.value.monthlyQuotaD,e.source,e.override));
    for(const [key,r] of records(state)){
        if(r.holder!==id)continue;
        if(r.category==='title'&&r.status!=='已除爵'){
            const t=engine.rules.governance?.authority?.titles?.find(t=>t.name===r.title||t.id===r.title);
            if(t)sources.push(fact(t.monthlyQuotaD[t.ranks.indexOf(r.rank)]??0,`state.records.${key} + rules.governance.authority.titles`));
        }
        if(cultural&&r.category==='notable'&&r.status==='在册')sources.push(fact(engine.rules.governance?.notables?.rights?.culturalQuotaD??0,`state.records.${key} + rules.governance.notables.rights`));
    }
    for(const org of memberOrganizations(engine,state,id)){
        const position=org.members[id].position,q=engine.rules.governance?.organizationQuestQuotaD?.[position];
        if(org.source!=='household'&&q!==undefined)sources.push(fact(q,`groupView.${org.id}.members.${id}.position + rules.governance.organizationQuestQuotaD`));
    }
    const actor=at(state,actorPath(engine.world,id).slice(1)),base=baseOf(engine,state,id),own=actor?.monthlyQuotaD??base?.monthlyQuotaD;
    const override=own!==undefined?fact(own,actor?.monthlyQuotaD!==undefined?`state.${actorPath(engine.world,id).slice(1).join('.')}.monthlyQuotaD`:`catalog.${id}.monthlyQuotaD`,true):null;
    const limitD=living(engine,state,id)?override?.value??Math.max(0,...sources.map(s=>s.value)):0;
    return {month:Math.floor((state.minute??0)/(1440*30)),limitD,usedD:state.questQuota?.[`${Math.floor((state.minute??0)/(1440*30))}_${id}`]??0,personal:true,
        kinds:[...(limitD>0&&(override||sources.some(s=>s.value>0&&!s.source.includes('notable')))?['official']:[]),'personal',...(cultural&&sources.some(s=>s.source.includes('notable'))?['cultural']:[])],rule:'各身份取最大值；名士仅文化类；monthlyQuotaD 显式覆盖全部身份额度',sources,override};
}
// A changed job gets a fresh baseline; promises are overlaid by npc-schedule.
// No old schedule is copied into an appointment or a vocation record.
export function personRoutine(engine,state,id,constraints=null){
    const actor=state.npcs?.[id],base=baseOf(engine,state,id);
    const rows=constraints?.offices??officeRows(state),ownRows=rows.some(([,r])=>r.holder===id);
    const displaced=(engine.world.settlementProfiles??[]).some(p=>p.details?.governance?.head===id&&settlementHead(engine,state,p.id).value!==id);
    const removed=constraints?.dismissals?constraints.dismissals.has(id):dismissed(state,id);
    const delegated=(constraints?.stewards??Object.values(state.records??{}).filter(r=>r.category==='housing_steward')).some(r=>r.steward===id);
    const orgRow=(constraints?.organizations??Object.values(state.records??{}).filter(r=>r.category==='organization')).find(r=>r.members?.[id]&&r.members[id].position!=='成员'&&!r.removed?.[id]);
    if(!actor?.vocation&&!ownRows&&!displaced&&!removed&&!orgRow&&!delegated)return null;
    const career=personCareer(engine,state,id).value;
    const offices=personOffices(engine,state,id).filter(e=>e.override),office=offices.sort((a,b)=>(b.value.since??0)-(a.value.since??0))[0]?.value;
    const job=career.vocation,changed=Boolean(office||job||ownRows||displaced||removed||orgRow||delegated),residence=actor?.residence;
    if(!changed)return null;
    const home=residence?.home??npcHousehold(engine,state,id)?.homeLocation??actor?.vocation?.home??base?.schedule?.default?.find(s=>s.start===0)?.location??actor?.location;
    const orgJob=orgRow?groupView(engine,state,orgRow.id)?.organization.value:null;
    const location=office?.workplace??job?.location??orgJob?.seat??home,hours=office?(engine.rules.governance?.officeHours??[480,1020]):job?.hours??[480,1020];
    const services=office?['governance','register']:job?.slotServices??[];
    const day=[{start:0,end:hours[0],location:home,activity:'睡眠',services:[]},{start:hours[0],end:hours[1],location,activity:office?`办理${office.name}职务`:job?.activity??'处理营生',services},
        {start:hours[1],end:1440,location:home,activity:'收工歇息、睡眠',services:[]}];
    return {default:day,...(!office&&job?.restDays?.length?{restDays:[...job.restDays],rest:[{start:0,end:1440,location:home,activity:'歇业休息',services:[]}]}:{})};
}
export function personRelationships(engine,state,id){
    id=actorId(engine.world,id);
    const rows=(baseOf(engine,state,id)?.relationships??[]).map(r=>({...r,source:`${id}.relationships`}));
    const actor=at(state,actorPath(engine.world,id).slice(1));
    for(const [withId,r] of Object.entries(actor?.relationships??{}))if(r.type){
        const old=rows.findIndex(row=>row.with===withId&&row.type===r.type);
        const row={...r,with:withId,source:`state.${actorPath(engine.world,id).slice(1).join('.')}.relationships.${withId}`};
        if(old>=0)rows[old]=row;else rows.push(row);
    }
    for(const m of Object.values(state.family?.marriages??{}))if(m.partners?.includes(id)&&(m.since??0)<=(state.minute??0)){
        const other=m.partners.find(p=>p!==id),existing=rows.find(r=>r.with===other&&r.type==='配偶');
        if(existing)Object.assign(existing,{status:m.status,source:`state.family.marriages.${m.id}`});
        else if(m.status==='在婚')rows.push({with:other,type:'配偶',note:'当前婚姻登记',since:m.since,status:m.status,source:`state.family.marriages.${m.id}`});
    }
    if(id==='player')for(const [role,r] of Object.entries(state.careers??{})){
        if(!personCareer(engine,state,id).value.roles.includes(role))continue;
        const teacher=r.initiation?.status==='守戒中'?r.initiation.teacher:r.certification?.teacher;
        if(teacher&&!rows.some(row=>row.with===teacher&&row.type==='师父'))rows.push({with:teacher,type:'师父',profession:role,source:`state.careers.${role}`});
    }
    return fact(rows.filter(r=>(!r.status||['在婚','有效','在任'].includes(r.status))&&
        (r.type!=='配偶'||living(engine,state,id)&&living(engine,state,r.with))),
        'catalog.relationships + current actor relationships + state.family.marriages + state.careers',Boolean(state.family?.marriages||actor?.relationships));
}

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
export function personAge(engine,state,id,minute=state.minute??0){id=actorId(engine.world,id);return fact(id==='player'?state.player?.age:npcAgeAt(engine,state,id,minute),id==='player'?'state.player.age':'npc-state.npcAgeAt');}
export function personName(engine,state,requested){
    const id=actorId(engine.world,requested),path=actorPath(engine.world,id),actor=at(state,path.slice(1)),base=baseOf(engine,state,id);
    // NPC actor.name is an initialization copy. The campaign's current catalog
    // (including created/family overlays) remains the naming authority.
    const own=id==='player'||!base?.name;
    return fact(own?actor?.name:base.name,own?`${path.join('.')}.name`:`${state.created?.[id]?'state.created':state.family?.people?.[id]?'state.family.people':'catalog'}.${id}.name`,Boolean(own||state.created?.[id]||state.family?.people?.[id]));
}
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
    out.offices=[];out.organizations=[];out.dismissals=new Set();out.stewards=[];
    for(const [key,r] of records(state)){
        if(r.category==='governance_office')out.offices.push([key,r]);
        if(r.category==='organization')out.organizations.push(r);
        if(r.category==='housing_steward')out.stewards.push(r);
        if(r.category==='legal_dismissal')out.dismissals.add(r.npc??r.subject);
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
        name:personName(engine,state,id),age:personAge(engine,state,id),relationships:personRelationships(engine,state,id),
        simulation:personSimulation(engine,state,id),constraint:personConstraint(engine,state,id),
        household,residence:fact(residence??{household:h?.id??base?.householdId,settlement,home:h?.homeLocation??base?.home?.location},residence?`${root}.residence`:household.source,Boolean(residence)),
        settlement:fact(settlement,settlementSource,Boolean(residence||household.override||actor?.settlement)),
        location:fact(location,id==='player'?'state.location':actor&&Object.hasOwn(actor,'location')?`${root}.location`:`catalog.${id}.location`,Boolean(actor)),
        organizations:socialIdentities(engine,state,id),faith:faithOf(engine,state,id),
        offices:personOffices(engine,state,id),career:personCareer(engine,state,id),occupation:personOccupation(engine,state,id),remuneration:personRemuneration(engine,state,id),
        titles:recordFacts(state,r=>r.category==='title'&&actorId(engine.world,r.holder)===id&&r.status!=='已除爵'),
        notables:recordFacts(state,r=>r.category==='notable'&&actorId(engine.world,r.holder)===id&&r.status==='在册'),
        legal:legalIdentities(engine,state,id),
        species:fact(actor?.species??base?.species,actor?.species?`${root}.species`:`catalog.${id}.species`,Boolean(actor?.species)),
        mind:fact(actor?.mind,`${root}.mind`,Boolean(actor?.mind)),
        society:fact(actor?.society??base?.society,actor?.society?`${root}.society`:`catalog.${id}.society`,Boolean(actor?.society))};
}

export function groupView(engine,state,id){
    const org=organizationState(engine,state,id);if(!org)return null;
    const row=state.records?.[`organization:${id}`],source=org.source==='created'?`state.records.organization:${id}`:org.source==='temple'?'rules.training.institutions':org.source==='household'?'world.households + state.family.households':org.source==='society'?`world.locations.${id}.monsterSociety`:`world.factions.${id} + rules.reputation.factions`;
    return {organization:fact(org,source,Boolean(row)),id:fact(id,'identity'),source:fact(org.source,source),
        members:fact(org.members,row?`${source} + state.records.organization:${id}`:source,Boolean(row||org.source==='household'&&state.family?.households?.[id])),
        leader:fact(org.leader,row&&Object.hasOwn(row,'leader')?`state.records.organization:${id}.leader`:source,Boolean(row&&Object.hasOwn(row,'leader'))),
        seat:fact(org.seat,source),kind:fact(org.kind,source),
        officials:fact(Object.entries(org.members).filter(([m,r])=>m===org.leader||!['成员'].includes(r.position)).map(([m])=>m),row?`${source} + state.records.organization:${id}.members`:source,Boolean(row)),
        treasury:fact(org.treasury,['faction','temple'].includes(org.source)?`state.records.faction-assets:${id} + world.factions.${id}.resources`:`state.records.organization:${id}.treasury`,Boolean(row||state.records?.[`faction-assets:${id}`]))};
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
export function settlementPopulationCount(engine,state,id){
    const population=state.settlements?.[id]?.population;
    return population!==null&&population!==undefined?fact(population,'state.settlements + current households',true):settlementPopulation(engine,state,id).population;
}
export function settlementPopulation(engine,state,id){
    const reader=Object.create(engine);reader.advanceHouseholds=engine.advanceHouseholds??beginHouseholdReads(engine);
    const profile=engine.world.settlementProfiles?.find(p=>p.id===id),ledger=state.settlements?.[id];
    const houses=(engine.world.households??[]).filter(h=>h.settlement===id),generated=Object.values(state.created??{}).filter(p=>p.generated==='population'&&p.settlement===id);
    const baseline=new Set([...profile?.residentIds??[],...houses.flatMap(h=>h.members),...generated.map(p=>p.id)]);
    const candidates=new Set([...baseline,...Object.values(state.family?.households??{}).flatMap(h=>h.members??[])]);
    const homes=new Map([...candidates].map(p=>[p,personHousehold(reader,state,p).value]));
    const current=[...candidates].filter(p=>{const h=homes.get(p);return state.npcs?.[p]?.status!=='死亡'&&(h?h.settlement===id:baseline.has(p));});
    const count=ledger?.population??Math.max(0,(profile?.population??baseline.size)+current.length-baseline.size);
    const occupied=new Set(current.map(p=>homes.get(p)?.id).filter(Boolean));
    const initial=new Set([...houses.map(h=>h.id),...generated.map(p=>p.householdId)]);
    return {population:fact(count,ledger?'state.settlements + current households':'catalog population + current households',Boolean(ledger||state.family)),
        householdCount:fact(Math.max(0,(profile?.householdCount??initial.size)+occupied.size-initial.size),'current households + pending population quota',Boolean(state.family)),
        residents:fact(current,'current households',Boolean(state.family))};
}
export function settlementGovernment(engine,state,id){
    const profile=engine.world.settlementProfiles?.find(p=>p.id===id),g=profile?.details?.governance;
    if(profile?.council){
        const group=groupView(engine,state,profile.council),leader=group?.leader??fact(null,'current council');
        return {head:fact(leader.value&&!dismissed(state,leader.value)?leader.value:null,leader.source,leader.override),
            powers:fact(group?.organization.value.charter?.rules??[],'current council charter'),appointment:fact(null,'current council'),enforcers:fact([],'current council'),
            seat:group?.seat??fact(id,'current council'),source:fact(profile.council,'current council')};
    }
    const ag=engine.rules.agriculture?.settlements?.find(p=>p.settlement===id),generated=remoteHeadOffice(state,id),remote=generated?.office;
    const originalHead=g?.head??ag?.manager??remote?.holder,current=currentHeadRow(state,id,remote),row=current?.[1];
    const eligible=holder=>Boolean(holder)&&living(engine,state,holder)&&!dismissed(state,actorId(engine.world,holder));
    // Select the last effective appointment before checking its validity. An
    // expired or removed successor leaves a vacancy rather than restoring a predecessor.
    const active=row?.status==='在任'&&(row.until??Infinity)>(state.minute??0)&&eligible(row.holder);
    const office=engine.rules.governance?.authority?.offices?.[row?.office];
    let head=fact(row?active?actorId(engine.world,row.holder):null:eligible(originalHead)?actorId(engine.world,originalHead):null,
        current?`state.records.${current[0]}`:g?.head?`catalog.${id}.details.governance.head`:ag?.manager?`rules.agriculture.${id}.manager`:generated?.source??`catalog.${id}.details.governance.head`,Boolean(current));
    if(!current&&!originalHead){
        const group=engine.rules.questSources?.funds?.[id];
        if(group){const leader=groupView(engine,state,group)?.leader.value;head=fact(eligible(leader)?leader:null,`groupView.${group}.leader`);}
    }
    const seat=row?.workplace??g?.meetingPlace??ag?.counter??baseOf(engine,state,remote?.holder)?.location??id;
    const seatSource=row?.workplace?`state.records.${current[0]}.workplace`:g?.meetingPlace?`catalog.${id}.details.governance.meetingPlace`:ag?.counter?`rules.agriculture.${id}.counter`:generated?.source??`catalog.${id}`;
    return {head,
        powers:fact(active?office?.powers??[]:head.value?g?.permissions?.head??[]:[],active?'rules.governance.authority.offices':`catalog.${id}.details.governance.permissions`,Boolean(current)),
        appointment:fact(row??g?.appointment,current?`state.records.${current[0]}`:`catalog.${id}.details.governance.appointment`,Boolean(current)),
        enforcers:fact((g?.enforcers??[]).filter(eligible),`catalog.${id}.details.governance + legal dismissals`),
        seat:fact(seat,seatSource,Boolean(row?.workplace)),source:fact(row?.source??g?.appointment?.source??generated?.source??head.source,head.source,Boolean(current))};
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
