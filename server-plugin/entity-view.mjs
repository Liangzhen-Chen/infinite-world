// Every field is {value, source, override}. Source names the authoritative
// catalog/state path; override marks an explicit campaign or authored override.
// These projections never persist results. Advance-only memos are invalidated
// by cursor writes; the projections grant no capabilities.
import {actorId,actorPath} from './npc-state.mjs';
import {npcHousehold,npcAgeAt,npcSchedule,npcServices,activeRental,beginHouseholdReads} from './npc-state.mjs';
import {currentEmployment,employmentActive} from './employment-state.mjs';
import {recordsWhere,recordEntriesWhere,recordsMemo,stateMemo,cloneData} from './storage.mjs';
import {organizationState,memberOrganizations,organizationOffices} from './organization-state.mjs';
import {rankedOffice,adminLevel} from './promotion-view.mjs';
import {upperOffice} from './noble-state.mjs';
import {faithOf} from './faith-state.mjs';
import {hiddenPassives} from './hidden-passives.mjs';
import {isEffective,isLiving} from './lifecycle-state.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {teachingAtStation} from './education-state.mjs';
import {obligationCalendar,obligationDate} from './obligation-calendar.mjs';

const fact=(value,source,override=false)=>({value:cloneData(value??null),source,override});
const at=(state,path)=>path.reduce((o,k)=>o?.[k],state);
const records=state=>Object.entries(state.records??{});
const recordFacts=(state,predicate)=>records(state).filter(([,r])=>predicate(r)).map(([key,r])=>fact(r,`state.records.${key}`,true));
const baseOf=(engine,state,id)=>state.created?.[id]??state.family?.people?.[id]??engine.byId.get(id);

// Missing vitals mean no accumulated strain. Reading never creates actor state.
export function personMental(engine,state,id){
    const a=at(state,actorPath(engine.world,id).slice(1));
    return fact(a?.mental??{fatigue:0,alertness:50,stress:0,interference:[]},a?.mental?'actor.mental':'unstrained baseline',Boolean(a?.mental));
}

const living=(engine,state,id)=>isEffective(engine,state,id);
const priorOffice=(state,id,key,row)=>{const t=state.records?.[`transition:${id}`];return t?.restoredAt!==undefined&&(!key||t.officeFacts?.some(o=>o.id===key&&o.since===row?.since&&o.sourceEvent===row?.sourceEvent));};
const dismissed=(state,id)=>recordsWhere(state.records,'category','legal_dismissal').some(r=>(r.subject??r.npc)===id&&r.status!=='撤销');
const officeRows=state=>recordEntriesWhere(state.records,'category','governance_office');
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
    const ranked=upperOffice(engine,state,row,rankedOffice(engine,state,row.settlement,def)),gov=settlementGovernment(engine,state,row.settlement);
    const head=row.office==='office_village_head';
    const maintenance=head?engine.world.settlementProfiles?.find(p=>p.id===row.settlement)?.publicMaintenance:null;
    // A founding identity alone grants no budget. An authored charter may
    // reference the existing ranked office cap; the treasury is checked on spend.
    const maintenanceCharter=maintenance?.budgetFrom==='ranked_office'&&maintenance?.powers?.includes('public_project')&&engine.rules.governance.authority.treasury.settlements?.includes(row.settlement);
    const foundingName=!override&&!state.records?.[`settlement_rank:${row.settlement}`]?baseOf(engine,state,row.holder)?.occupation:null;
    return fact({...row,name:foundingName??ranked.name,monthlyQuotaD:ranked.monthlyQuotaD??0,monthlyBudgetCopper:override||maintenanceCharter?ranked.monthlyBudgetCopper??0:0,
        taxBps:override?ranked.taxBps??null:null,powers:[...new Set([...(override?[...ranked.powers??[],...(head?['chair','register']:[])]:['quest_publish','chair','register']),...(maintenanceCharter?['public_project']:[]),...def.seatPowers??[]])],workplace:row.workplace??gov.seat.value,
        monthlySalaryCopper:engine.rules.governance?.salaries?.monthlyCopper?.[row.office]?.[adminLevel(engine,state,row.settlement)?.level??'村']??0},
        `${override?`state.records.${key}`:gov.head.source} + rules.governance.authority.offices.${row.office} + promotion + rules.governance.salaries${maintenanceCharter?` + catalog.${row.settlement}.publicMaintenance + rules.governance.authority.treasury`:''}`,override);
}
// Appointment records hold facts. Names, quotas, powers and pay are read from
// the office definition at the settlement's current administrative level.
export function personOffices(engine,state,requested,{settlement=null,power=null}={}){
    const id=actorId(engine.world,requested),rows=officeRows(state),out=[];
    const transition=state.records?.[`transition:${id}`];
    if(!living(engine,state,id)||dismissed(state,id))return out;
    for(const [key,row] of rows){
        if(transition?.restoredAt!==undefined&&transition.officeFacts?.some(o=>o.id===key&&o.since===row.since&&o.sourceEvent===row.sourceEvent))continue;
        if(actorId(engine.world,row.holder)!==id||row.status!=='在任'||(row.since??row.appointedAt??0)>(state.minute??0)||(row.until??Infinity)<=(state.minute??0))continue;
        if(row.office==='office_village_head'||row.office===remoteHeadOffice(state,row.settlement)?.office.id){
            const gov=settlementGovernment(engine,state,row.settlement);
            if(gov.head.value!==id||gov.appointment.source!==`state.records.${key}`)continue;
        }
        const entry=officeFact(engine,state,key,row);if(entry)out.push(entry);
    }
    for(const [key,row] of recordEntriesWhere(state.records,'category','housing_steward')){
        if(row.steward!==id||row.revoked||row.expires<=(state.minute??0)||row.createdAt>(state.minute??0))continue;
        out.push(officeFact(engine,state,key,{...row,office:'office_village_steward',holder:id,status:'在任',since:row.createdAt,until:row.expires,workplace:row.hall}));
    }
    const settlements=new Set([...(engine.world.settlementProfiles??[]).map(p=>p.id),...(engine.rules.agriculture?.settlements??[]).map(p=>p.settlement),...Object.values(state.remote??{}).flatMap(r=>(r.skeleton?.offices??[]).map(o=>o.settlement))]);
    for(const sid of settlements){
        if(transition?.restoredAt!==undefined)continue;
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
    const services=id==='player'?[]:[...(vocation?(def?.teaches??vocation.services??[]):base?.services??[])],appointments=[];
    if(id!=='player'&&isEffective(engine,state,id))for(const faction of engine.world.factions??[]){
        if(!faction.offices?.length)continue;
        for(const office of organizationOffices(engine,state,faction.id,faction))if(office.holder===id&&officeOnDuty(engine,state,office,id)&&office.authority?.operations?.includes('certify')){
            if(!isEffective(engine,state,faction.id))continue;
            const role=engine.byId.get(office.authority.profession),skill=role?.entry?.skill;
            if(role&&(actor?.proficiencies?.[skill]??base?.proficiencies?.[skill]??0)>=(role.entry?.minimumProficiency??100)){services.push(role.id);appointments.push(office.id);}
        }
    }
    const roles=id==='player'?[state.professions?.combat,...state.professions?.life??[],...state.professions?.hidden??[]].filter(Boolean):[...new Set([...Object.keys(actor?.certifications??{}),...services.filter(s=>s.startsWith('profession_')),...(!vocation?[base?.combatProfession,...base?.lifeProfessions??[]].filter(Boolean):[])])];
    if(id!=='player')for(const role of actor?.hiddenProfessions??base?.hiddenProfessions??[])if(!roles.includes(role))roles.push(role);
    const apprenticeships=id==='player'?Object.entries(state.careers??{}).filter(([,r])=>r.initiation?.status==='守戒中').map(([r])=>r):[];
    return fact({occupation:vocation?(def?.name??vocation.name):actor?.occupation??base?.occupation??'',roles,apprenticeships,services:[...services],vocation:def??vocation??null},
        (id==='player'?'state.professions + state.careers':vocation?`state.npcs.${id}.vocation + rules.npcGrowth.vocations`:`catalog.${id}.services`)+(appointments.length?` + current organization offices (${appointments.join(',')}) + proficiency`:''),Boolean(vocation||id==='player'));
}
export function personCertified(engine,state,id,skill){
    const c=personCareer(engine,state,id).value,s=engine.byId.get(skill),roles=s?.learningProfessions??(s?.profession?[s.profession]:[]);
    return !roles.length||roles.some(r=>c.roles.includes(r))||c.services.includes(skill);
}
export function personTeaching(engine,state,id,entity,{stage=null}={}){
    if(!living(engine,state,id)||personConstraint(engine,state,id))return false;
    if(entity.startsWith('recipe_')&&currentWorkstationRecipes(engine,state,id).some(r=>r.id===entity))return true;
    // K5: a master present and free at a station of the recipe's kind teaches it.
    if(entity.startsWith('recipe_')&&teachingAtStation(engine,state,id,engine.byId.get(entity)??state.created?.[entity]))return true;
    const c=personCareer(engine,state,id).value,base=baseOf(engine,state,id),catalog=engine.byId.get(entity);
    if(c.services.includes(entity))return true;
    // Certification/skill instruction does not grant every recipe of that skill.
    // Recipes need their own authored service or a currently usable workstation.
    if(entity.startsWith('recipe_'))return false;
    const skill=catalog?.skill?engine.byId.get(catalog.skill):catalog,role=skill?.profession;
    return Boolean(role&&c.roles.includes(role)&&(engine.byId.get(role)?.skillTree??[]).includes(skill.id)&&(stage===null||stage<=(base?.teachingStages?.[role]??0)));
}
export function personOccupation(engine,state,id){
    const offices=personOffices(engine,state,id),career=personCareer(engine,state,id);
    if(offices.length)return fact(offices.map(o=>o.value.name).join('、'),offices.map(o=>o.source).join(' + '),offices.some(o=>o.override));
    const job=personEmployment(engine,state,id)?.value;
    if(job&&job.status!=='罢工'&&job.starts<=(state.minute??0))return fact(`受雇${groupView(engine,state,job.owner)?.organization.value.name??personName(engine,state,job.owner).value??job.owner}：${job.recipe?engine.byId.get(job.recipe)?.name??'生产':job.task??'做工'}`,`state.records.${job.id}`,false);
    const former=officeRows(state).some(([,r])=>r.holder===id&&(r.since??0)<=(state.minute??0))||dismissed(state,id)||[...(engine.world.settlementProfiles??[])].some(p=>p.details?.governance?.head===id&&settlementHead(engine,state,p.id).value!==id);
    return former&&!career.value.vocation?fact('居民','current office vacancy',true):fact(career.value.occupation,career.source,career.override);
}
export function personEmployment(engine,state,id,minute=state.minute,constraints=null){
    // The shared pass index (personConstraints) holds the same active rows in record order.
    const worker=actorId(engine.world,id),row=constraints?.employment?(constraints.employment.get(worker)??[]).find(r=>r.createdAt<=minute&&minute<r.deadline)??null:currentEmployment(state,worker,minute);
    return row?fact(row,`state.records.${row.id}`,false):null;
}
// Public-facing roles exclude household membership and private associations.
export function personPublicRole(engine,state,id){
    const occupation=personOccupation(engine,state,id),roles=memberOrganizations(engine,state,actorId(engine.world,id),{source:'faction'})
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
// The published office is the authority. Campaign appointments replace only
// the holder; an application cannot supply powers, hours or an issuer.
export function institutionOffices(engine,state,organization=null){
    return (engine.world.factions??[]).filter(f=>!organization||f.id===organization).flatMap(f=>organizationOffices(engine,state,f.id,f).map(o=>{
        const change=state.records?.[`organization:${f.id}`]?.offices?.[o.id];
        return {...o,holder:change&&(change.since??0)>(state.minute??0)?null:o.holder,
            since:change?.since??0,sourceEvent:change?.sourceEvent??null};
    }));
}
export function officeOnDuty(engine,state,office,actor=office?.holder){
    const current=institutionOffices(engine,state,office?.organization??office?.org).find(o=>o.id===office?.id);
    if(current){if(current.holder!==actor)return false;office=current;}
    if(!actor||office?.holder!==actor||!living(engine,state,actor)||personConstraint(engine,state,actor))return false;
    const person=actor==='player'?state.player:state.npcs?.[actor],location=actor==='player'?state.location:person?.location;
    const minute=((state.minute??0)%1440+1440)%1440;
    return Boolean(person&&location===office.seat&&!person.scheduleTravel&&!person.cognitionTravel&&
        !['死亡','濒死','昏迷','患病'].includes(person.status)&&!/睡眠|睡觉|熟睡/.test(person.activity??'')&&
        (!office.receptionHours?.length||office.receptionHours.some(([start,end])=>start<=minute&&minute<end)));
}
export function personRemuneration(engine,state,id){
    const salaries=obligationRows(state).filter(o=>o.kind==='salary'&&o.creditor===id);
    const projected=new Set(salaries.map(o=>o.legacyRecord).filter(Boolean));
    const offices=personOffices(engine,state,id),debts=records(state).filter(([key,r])=>r.category==='office_salary'&&r.holder===id&&!projected.has(key)&&!salaries.some(o=>o.id===r.obligation));
    const actor=at(state,actorPath(engine.world,id).slice(1));
    if(!offices.length&&!debts.length&&!salaries.length&&actor?.morale===undefined)return null;
    return fact({monthlyCopper:offices.reduce((sum,o)=>sum+o.value.monthlySalaryCopper,0),arrearsCopper:debts.reduce((sum,[,r])=>sum+(r.arrears??0),0)+salaries.reduce((sum,o)=>sum+obligationView(state,o).owed,0),
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
export function questQuotaMonth(engine,state){
    const calendar=state.records?.['calendar:active']?.calendar??engine.calendarId;
    if(!calendar||calendar==='legacy:30-day')return Math.floor((state.minute??0)/(1440*30));
    const date=obligationDate(state.minute??0,calendar),skipped=date.leap&&obligationCalendar(calendar).leap?.obligationsSkip;
    return `${calendar.split(':')[0]}:${date.year}:${skipped?date.month.replace('leap:',''):date.month}`;
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
        if(!['household','family'].includes(org.source)&&q!==undefined)sources.push(fact(q,`groupView.${org.id}.members.${id}.position + rules.governance.organizationQuestQuotaD`));
    }
    const actor=at(state,actorPath(engine.world,id).slice(1)),base=baseOf(engine,state,id),own=actor?.monthlyQuotaD??base?.monthlyQuotaD;
    const override=own!==undefined?fact(own,actor?.monthlyQuotaD!==undefined?`state.${actorPath(engine.world,id).slice(1).join('.')}.monthlyQuotaD`:`catalog.${id}.monthlyQuotaD`,true):null;
    const limitD=living(engine,state,id)?override?.value??Math.max(0,...sources.map(s=>s.value)):0;
    const month=questQuotaMonth(engine,state);
    return {month,limitD,usedD:state.questQuota?.[`${month}_${id}`]??0,personal:true,
        kinds:[...(limitD>0&&(override||sources.some(s=>s.value>0&&!s.source.includes('notable')))?['official']:[]),'personal',...(cultural&&sources.some(s=>s.source.includes('notable'))?['cultural']:[])],rule:'各身份取最大值；名士仅文化类；monthlyQuotaD 显式覆盖全部身份额度',sources,override};
}
// A changed job gets a fresh baseline; promises are overlaid by npc-schedule.
// No old schedule is copied into an appointment or a vocation record.
export function personRoutine(engine,state,id,constraints=null){
    const shared=constraints??personConstraints(engine,state);
    const actor=state.npcs?.[id],base=baseOf(engine,state,id);
    const rows=shared.offices??officeRows(state),ownRows=rows.some(([,r])=>r.holder===id);
    const displaced=(engine.world.settlementProfiles??[]).some(p=>p.details?.governance?.head===id&&settlementHead(engine,state,p.id).value!==id);
    const removed=constraints?.dismissals?constraints.dismissals.has(id):dismissed(state,id);
    const delegated=(shared.stewards??recordsWhere(state.records,'category','housing_steward')).some(r=>r.steward===id);
    const orgRow=(shared.organizations??recordsWhere(state.records,'category','organization')).find(r=>r.members?.[id]&&r.members[id].position!=='成员'&&!r.removed?.[id]);
    if(!actor?.vocation&&!ownRows&&!displaced&&!removed&&!orgRow&&!delegated)return null;
    const career=personCareer(engine,state,id).value;
    const offices=personOffices(engine,state,id).filter(e=>e.override),office=offices.sort((a,b)=>(b.value.since??0)-(a.value.since??0))[0]?.value;
    const job=career.vocation,changed=Boolean(office||job||ownRows||displaced||removed||orgRow||delegated),residence=actor?.residence;
    if(!changed)return null;
    const home=residence?.home??npcHousehold(engine,state,id,constraints)?.homeLocation??actor?.vocation?.home??base?.schedule?.default?.find(s=>s.start===0)?.location??actor?.location;
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

const householdViewMemo=Symbol('household view');
const householdViewInputs=[['family','households'],['created'],['minute'],{path:['records'],kinds:['asset_lease']}];
function householdView(engine,state,id){
    return stateMemo(state,engine,[householdViewMemo,id],()=>readHouseholdView(engine,state,id),householdViewInputs);
}
function readHouseholdView(engine,state,id){
    const h=npcHousehold(engine,state,id);
    const changed=Object.values(state.family?.households??{}).some(r=>r.members?.includes(id)||r.left?.includes(id));
    const generated=state.created?.[id]?.householdId===h?.id;
    const rental=activeRental(state,id);
    return fact(h,rental?.use==='home'?`state.records.${rental.id}`:generated?`state.created.${id}.householdId + state.family.households`:changed?'state.family.households + world.households':'world.households',Boolean(changed||generated||rental?.use==='home'));
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
export const personConstraintRecordDependencies={categories:['governance_office','organization','housing_steward','legal_dismissal','festival','legal_detention','legal_custody','legal_case'],kinds:['workshop','asset_lease']};
export function personConstraints(engine,state){
    // Only categories this projection reads invalidate its derived constraints.
    return recordsMemo(state.records,engine.world,()=>buildPersonConstraints(engine,state),personConstraintRecordDependencies);
}
function buildPersonConstraints(engine,state){
    const out=new Map();
    out.offices=[];out.organizations=[];out.dismissals=new Set();out.stewards=[];
    // Active employment and leases by person and the festival occurrence rows, in
    // record order, so one pass (schedules, shop derivation, migration) reads them
    // without rescanning the records per person.
    out.employment=new Map();out.leases=new Map();out.festivals=[];
    for(const [key,r] of records(state)){
        if(r.category==='governance_office')out.offices.push([key,r]);
        if(r.category==='organization')out.organizations.push(r);
        if(r.category==='housing_steward')out.stewards.push(r);
        if(r.category==='legal_dismissal')out.dismissals.add(r.npc??r.subject);
        if(r.category==='festival')out.festivals.push(r);
        if(employmentActive(r)){const rows=out.employment.get(r.worker)??[];rows.push(r);out.employment.set(r.worker,rows);}
        if(r.kind==='asset_lease'&&r.status==='有效'){const rows=out.leases.get(r.tenant)??[];rows.push(r);out.leases.set(r.tenant,rows);}
        if(!['legal_detention','legal_custody'].includes(r.category)||r.status&&r.status!=='生效')continue;
        const subject=r.subject??state.records?.[r.case]?.offender??(r.category==='legal_custody'?'player':null),id=actorId(engine.world,subject);
        const entries=out.get(id)??[];entries.push({key,r});out.set(id,entries);
    }
    // Reuse the schedule's existing records memo for current office holders.
    // Transfers/vacancies invalidate it through the organization record writer.
    out.examinerReceptions=new Map();
    for(const faction of engine.world.factions??[]){
        if(!faction.offices?.some(o=>o.receptionHours?.length))continue;
        for(const office of organizationOffices(engine,state,faction.id,faction))if(office.holder&&office.receptionHours?.length){
            const rows=out.examinerReceptions.get(office.holder)??[];rows.push(office);out.examinerReceptions.set(office.holder,rows);
        }
    }
    return out;
}
export function personConstraint(engine,state,id,minute=state.minute??0,index=null){
    id=actorId(engine.world,id);
    const gone=state.records?.[`transition:${id}`];if(gone?.gone&&gone.minute<=minute)return fact(gone,`state.records.transition:${id}`,true);
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
    for(const r of Object.values(state.records??{}))if(r.kind==='asset_lease'&&r.use==='home'&&r.subject===location&&r.status==='有效'&&r.deadline>state.minute)members.push(r.tenant);
    if(typeof owner==='string'&&(state.npcs?.[owner]||engine.byId.get(owner)?.tier))members.push(owner);
    return fact([...new Set(members)].filter(id=>isEffective(engine,state,id)),houses.length?'world.households + state.family.households + place.owner':'place.access.residents + place.owner',Boolean(houses.some(h=>state.family?.households?.[h.id])));
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
        offices:personOffices(engine,state,id),career:personCareer(engine,state,id),hiddenPassives:fact(hiddenPassives(engine,state,id),'current career + passive conditions'),occupation:personOccupation(engine,state,id),employment:personEmployment(engine,state,id),remuneration:personRemuneration(engine,state,id),
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
// Catalogue feature id -> its place, built once per locations array (the catalogue is fixed for a loaded world); created places are searched per call.
const featurePlaces=new WeakMap();
function catalogueFeaturePlace(locations,id){
    let index=featurePlaces.get(locations);
    if(!index||index.length!==locations.length){index={length:locations.length,byId:new Map()};for(const p of locations)for(const f of p.features??[])if(!index.byId.has(f.id))index.byId.set(f.id,p);featurePlaces.set(locations,index);}
    return index.byId.get(id);
}
export function physicalFeature(engine,state,id){
    const place=catalogueFeaturePlace(engine.world.locations,id)??Object.values(state.created??{}).find(p=>p.features?.some(f=>f.id===id));
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
const placeSettlementMemo=Symbol('place settlement'),personBusinessMemo=Symbol('person business');
const placeSettlementInputs=[['created'],['settlements']];
export function placeSettlement(engine,state,location){
    return stateMemo(state,engine,[placeSettlementMemo,location],()=>readPlaceSettlement(engine,state,location),placeSettlementInputs);
}
function readPlaceSettlement(engine,state,location){
    const seen=new Set(),ids=new Set([...(engine.world.settlementProfiles??[]).map(p=>p.id),...Object.keys(state.settlements??{})]);
    while(location&&!seen.has(location)){if(ids.has(location))return fact(location,'current place ancestry');seen.add(location);location=(state.created?.[location]??engine.byId.get(location))?.parent;}
    return fact(null,'current place ancestry');
}
// A read-only pass over many people (shop derivation) hands in one legal index
// (personConstraints) instead of rebuilding it per person.
export function personBusiness(engine,state,id,constraints=null){
    return stateMemo(state,engine,[personBusinessMemo,id,constraints],()=>readPersonBusiness(engine,state,id,constraints));
}
function readPersonBusiness(engine,state,id,constraints){
    const base=baseOf(engine,state,id),actor=state.npcs?.[id]??state.creatures?.[id];if(!base)return null;
    // Only a changed livelihood/home reads trading slots. Authored businesses
    // take both their service and workplace straight from the catalogue.
    const vocation=actor?.vocation,rule=engine.rules.npcGrowth?.vocations?.find(v=>v.id===vocation?.id),schedule=vocation||actor?.residence||actor?.workplace?npcSchedule(engine,state,id,undefined,constraints)??actor?.residence?.schedule:null;
    const slots=Object.values(schedule??{}).filter(Array.isArray).flat().filter(s=>s.services?.includes('trade'));
    const changed=Boolean(vocation||actor?.residence||actor?.workplace),trades=vocation?npcServices(engine,state,id).includes('trade')||slots.length>0:
        (base.services??[]).includes('trade')||(base.serviceCatalog??[]).some(s=>s.kind==='trade');
    const rental=activeRental(state,id),rentedWork=rental&&rental.use!=='home'?rental.subject:null;
    const location=rentedWork??actor?.workplace?.location??rule?.location??(changed?slots[0]?.location:null)??base.workplace?.location??base.location;
    const job=personEmployment(engine,state,id)?.value,employed=job&&job.status!=='罢工'&&job.starts<=state.minute;
    const held=personConstraint(engine,state,id,undefined,constraints);
    const open=Boolean(actor)&&!employed&&!['死亡','濒死','昏迷','患病'].includes(actor.status)&&!held&&!actor.caring&&!actor.levy&&!actor.scheduleTravel&&!actor.cognitionTravel&&trades&&!(actor.residence?.workChanged&&!vocation);
    return {keeper:fact(id,'identity'),location:fact(location,changed?`state.npcs.${id} + npc-state.npcSchedule`:`catalog.${id}.workplace`,changed),
        settlement:placeSettlement(engine,state,location),shopType:fact(actor?.shopType??rule?.shopType??base.shopType,changed?`state.npcs.${id} + rules.npcGrowth.vocations`:`catalog.${id}.shopType`,changed),
        open:fact(open,'current services + health + legal constraints',changed||Boolean(held))};
}
// Every person whose business could be open now, read with one shared legal
// index. Someone with neither a trading catalogue nor a changed livelihood
// (vocation) can never be open, so the pass skips them: the same result as
// computing their view, without the per-person record scans.
const personBusinessesMemo=Symbol('person businesses');
export function personBusinesses(engine,state,keepers=[]){
    return stateMemo(state,engine,[personBusinessesMemo,JSON.stringify(keepers)],()=>readPersonBusinesses(engine,state,keepers));
}
function readPersonBusinesses(engine,state,keepers){
    const constraints=personConstraints(engine,state),out=new Map(),always=new Set(keepers);
    for(const id of new Set([...engine.world.npcs.map(n=>n.id),...Object.keys(state.npcs??{}),...keepers])){
        const base=baseOf(engine,state,id);if(!base)continue;
        const actor=state.npcs?.[id]??state.creatures?.[id];
        if(!actor?.vocation&&!always.has(id)&&!(base.services??[]).includes('trade')&&!(base.serviceCatalog??[]).some(s=>s.kind==='trade'))continue;
        out.set(id,personBusiness(engine,state,id,constraints));
    }
    return out;
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
    const current=[...candidates].filter(p=>{const h=homes.get(p);return isLiving(engine,state,p)&&(h?h.settlement===id:baseline.has(p));});
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
    const active=row?.status==='在任'&&(row.until??Infinity)>(state.minute??0)&&eligible(row.holder)&&!priorOffice(state,row.holder,current?.[0],row);
    const office=engine.rules.governance?.authority?.offices?.[row?.office];
    // Catalog governance stores a head's identity, not an office id. The
    // authority catalog has one chief-seat definition, office_village_head;
    // rankedOffice supplies its administrative-level title and powers. This
    // matches personOffices' founding catalog rows (05 §5.7.3); appointments
    // instead read their own recorded office definition.
    const foundingOffice=engine.rules.governance?.authority?.offices?.office_village_head;
    let head=fact(row?active?actorId(engine.world,row.holder):null:eligible(originalHead)&&!priorOffice(state,originalHead,null,null)?actorId(engine.world,originalHead):null,
        current?`state.records.${current[0]}`:g?.head?`catalog.${id}.details.governance.head`:ag?.manager?`rules.agriculture.${id}.manager`:generated?.source??`catalog.${id}.details.governance.head`,Boolean(current));
    if(!current&&!originalHead){
        const group=engine.rules.questSources?.funds?.[id];
        if(group){const leader=groupView(engine,state,group)?.leader.value;head=fact(eligible(leader)?leader:null,`groupView.${group}.leader`);}
    }
    const seat=row?.workplace??g?.meetingPlace??ag?.counter??baseOf(engine,state,remote?.holder)?.location??id;
    const seatSource=row?.workplace?`state.records.${current[0]}.workplace`:g?.meetingPlace?`catalog.${id}.details.governance.meetingPlace`:ag?.counter?`rules.agriculture.${id}.counter`:generated?.source??`catalog.${id}`;
    return {head,
        powers:fact([...new Set([...(active?office?.powers??[]:head.value?g?.permissions?.head??[]:[]),...(head.value?(active?office:foundingOffice)?.seatPowers??[]:[])])],active?'rules.governance.authority.offices':`catalog.${id}.details.governance.permissions + rules.governance.authority.offices`,Boolean(current)),
        appointment:fact(row??g?.appointment,current?`state.records.${current[0]}`:`catalog.${id}.details.governance.appointment`,Boolean(current)),
        enforcers:fact((g?.enforcers??[]).filter(eligible),`catalog.${id}.details.governance + legal dismissals`),
        seat:fact(seat,seatSource,Boolean(row?.workplace)),source:fact(row?.source??g?.appointment?.source??generated?.source??head.source,head.source,Boolean(current))};
}
import {facilityView,facilityServices} from './facility-state.mjs';
export function placeView(engine,state,id){
    const base=state.created?.[id]??engine.byId.get(id);if(!base)return null;
    const source=state.created?.[id]?`state.created.${id}`:`catalog.${id}`,view={};
    for(const field of ['id','parent','region','owner','features'])view[field]=fact(base[field],`${source}.${field}`,Boolean(state.created?.[id]));
    if(Object.hasOwn(state.buildings?.[id]??{},'owner'))view.owner=fact(state.buildings[id].owner,`state.buildings.${id}.owner`,true);
    view.settlement= fact(state.settlements?.[id],`state.settlements.${id}`,Boolean(state.settlements?.[id]));
    view.population=settlementPopulation(engine,state,id);view.government=settlementGovernment(engine,state,id);
    view.physical= (base.features??[]).map(f=>physicalFeature(engine,state,f.id));
    const facility=facilityView(engine,state,id);
    if(facility)for(const field of ['condition','material','status','services','capacity','workstations'])view[field]=fact(facility[field],'current construction + condition',false);
    view.serviceCapacity=fact(facility?Object.fromEntries(facility.services.map(s=>[s,facility.capacity])):facilityServices(engine,state,id),'current facilities + condition');
    // 该地各项服务眼下排队等候的人数（讲堂座位、诊疗等），来自实际登记的排队号。
    const waiting={};for(const r of recordsWhere(state.records,'category','service_ticket'))if(r.provider===id&&r.status==='排队')waiting[r.service]=(waiting[r.service]??0)+1;
    view.serviceQueue=fact(waiting,'state.records service_ticket');
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

// 灶边判定（开饭、白天预算、钱袋入户池共用这一处，防口径分叉）：hearthPlace = 此人若不在本户住处所在聚落，返回他所在（在途则看去向）的聚落，在灶边返回 null。
// 随身物品与钱跟人走：不在灶边的人在所在之处自成一桌（同一处的同户成员同桌），吃自己的粮、按所在地规则领公粮或买饭，留守者不吃他的粮、他的钱不隔着聚落进户池。
// 住处取聚落一级：同一聚落内日间上工、赶集、串门是日常，晚上仍回灶边，不算离灶；出远门、迁居在途、在外过夜是同一条。
// 按状态版本记忆（同 householdView / placeSettlement 的写法）：依赖 = 户视图与聚落解析已声明的输入 + 人物位置与在途去向；热路径（午夜开饭、预算读、顾客流）反复调用不再每次重扫户与地点。
const hearthMemo=Symbol('hearth place');
const hearthInputs=[...householdViewInputs,...placeSettlementInputs,['npcs','*','location'],['npcs','*','scheduleTravel']];
function readHearthPlace(engine,state,id){
    const npc=state.npcs?.[id];if(!npc)return null;
    const where=npc.location??npc.scheduleTravel?.to;if(!where)return null;
    const h=personHousehold(engine,state,id).value,home=h?.settlement;if(!home)return null;
    const at=placeSettlement(engine,state,where).value;
    // 住处所在聚落 = 户登记的聚落，或户的住处地点（homeLocation）本身所属的聚落（野外住处的户登记聚落与其地点祖先不一定同名）。
    return at&&at!==home&&at!==(h.homeLocation?placeSettlement(engine,state,h.homeLocation).value:null)?at:null;
}
export function hearthPlace(engine,state,id){
    return stateMemo(state,engine,[hearthMemo,id],()=>readHearthPlace(engine,state,id),hearthInputs);
}
export const awayFromHearth=(engine,state,id)=>hearthPlace(engine,state,id)!==null;
// 与 owner 同一桌的成员（list 先由调用方按在世、非征役等筛过）：owner 在灶边则是同在灶边者，owner 在外则是同在那处的同户成员。owner 恒在自己桌上。空表与只有 owner 一人的表不查位置（owner 可能已被调用方剔出列表，单个非 owner 成员仍要过滤）。
export const hearthMates=(engine,state,owner,list)=>{if(list.length===0||list.length===1&&list[0]===owner)return list;const place=hearthPlace(engine,state,owner);return list.filter(id=>id===owner||hearthPlace(engine,state,id)===place);};
// 同户共灶的“可动用资金成员”：在世有效、不是玩家、没有死亡/濒死/昏迷。预算（客观读 objectiveCash、主观视图 household）与户内转账（householdPoolTopUp）共用这一个谓词，防口径分叉（EC-1b U7）。
export function poolMember(engine,state,id){
    return id!=='player'&&Boolean(state.npcs?.[id])&&isEffective(engine,state,id)&&!['死亡','濒死','昏迷'].includes(state.npcs[id].status);
}
