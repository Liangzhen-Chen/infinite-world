// PR-01 obligation kinds for the entity-transitions handover registry (K11).
// A death settles the person's own debts from the estate before heirs receive
// anything; liabilities never pass to heirs and any shortfall is bad debt.
// Without heirs the remainder stays under official seal. New contract types
// register one more kind here; entries call settleHolderGone, never these.
import {actorPath} from './npc-state.mjs';
import {financeChange} from './finance-bank.mjs';
import {bankById,bankRow} from './credit.mjs';
import {settleCreditCase} from './law.mjs';
import {entityTransition,registerObligation} from './entity-transitions.mjs';
import {employmentActive} from './employment-state.mjs';
import {personHousehold,placeSettlement,settlementGovernment} from './entity-view.mjs';
import {organizationState} from './organization-state.mjs';
import {reassignGuardian} from './family-inheritance.mjs';

const rec=id=>['state','records',id],records=d=>Object.entries(d.get('state','records')??{});
export const estateKey=deathId=>`estate:${deathId}`;
export const debtClosed=r=>['已还清','坏账'].includes(r?.status)||(r?.amount??0)<=(r?.paid??0);
const rank=(e,kind)=>{const order=e.rules.law?.estate?.debtOrder??[],i=order.indexOf(kind);return i<0?order.length:i;};
function credit(d,e,creditor,amount,source){
    const b=d.get(...rec(creditor))?.category==='bank'?null:bankById(e,creditor,d.get('state'));
    const row=b?bankRow(d,b):d.get(...rec(creditor));
    if(row?.category==='bank'){d.set(rec(row.id??creditor),{...row,coins:(row.coins??0)+amount});return;}
    financeChange(d,e,creditor,amount,source);
}
// Cash first, then the person's deposits; classes in the legal order are paid
// in turn and creditors within one class share pro rata.
function settleDebts(e,d,list,{holder:id,minute,eventId:deathId}){
    const s=d.get('state'),path=actorPath(e.world,id);
    const debts=list.map(([key,row])=>({key,row,due:row.amount-(row.paid??0),rank:rank(e,row.kind)})).sort((a,b)=>a.rank-b.rank||a.key.localeCompare(b.key));
    const deposits=Object.entries(s.records).filter(([,r])=>r.category==='bank'&&(r.accounts?.[id]??0)>0).sort(([a],[b])=>a.localeCompare(b));
    const cash=d.get(...path,'coins')??0;let available=cash+deposits.reduce((n,[,r])=>n+r.accounts[id],0);
    for(const level of [...new Set(debts.map(x=>x.rank))]){
        const group=debts.filter(x=>x.rank===level),total=group.reduce((n,x)=>n+x.due,0),pool=Math.min(available,total);
        let left=pool;
        for(const x of group){x.pay=Math.floor(pool*x.due/total);left-=x.pay;}
        for(const x of group)if(left>0&&x.pay<x.due){x.pay++;left--;}
        available-=pool;
    }
    let owed=debts.reduce((n,x)=>n+x.pay,0);
    const fromCash=Math.min(cash,owed);if(fromCash)d.set([...path,'coins'],cash-fromCash);owed-=fromCash;
    for(const [key,row]of deposits){
        if(!owed)break;const take=Math.min(owed,row.accounts[id]),bank=d.get(...rec(key));
        d.set(rec(key),{...bank,coins:bank.coins-take,accounts:{...bank.accounts,[id]:bank.accounts[id]-take}});owed-=take;
    }
    return debts.map(x=>{
        if(x.pay)credit(d,e,x.row.creditor,x.pay,`${deathId}:${x.key}`);
        const paid=(x.row.paid??0)+x.pay,remaining=x.row.amount-paid,next={...d.get(...rec(x.key)),paid};
        if(!remaining)Object.assign(next,{status:'已还清',paidAt:minute,settledBy:deathId});
        else Object.assign(next,{status:'坏账',badDebt:{minute,remaining,estate:deathId}});
        d.set(rec(x.key),next);
        const claim=x.row.defaulted?.case&&d.get(...rec(x.row.defaulted.case));
        if(claim&&!remaining)settleCreditCase(d,e,claim.id,deathId);
        else if(claim&&claim.status!=='已结案')d.set(rec(claim.id),{...claim,status:'已结案',closed:minute,reason:'债务人已故，遗产按法定顺序清偿，不足部分记坏账',estate:deathId});
        return {debt:x.key,kind:x.row.kind??null,creditor:x.row.creditor,paid:x.pay,remaining};
    });
}
// Without heirs the remaining cash is held under seal by the local government;
// the custodian is read from the settlement's current government when needed.
export function sealEstate(d,e,id,minute,deathId,location){
    const s=d.get('state'),path=actorPath(e.world,id),coins=d.get(...path,'coins')??0,key=estateKey(deathId);
    const settlement=personHousehold(e,s,id).value?.settlement??placeSettlement(e,s,location).value??null;
    const buildings=Object.entries(s.buildings??{}).filter(([,r])=>r.owner===id||Object.hasOwn(r.owners??{},id)).map(([b])=>b).sort();
    d.set(rec(key),{category:'estate',id:key,person:id,death:deathId,status:'官府封存',settlement,coins,buildings,since:minute});
    if(coins)d.set([...path,'coins'],0);
    entityTransition(d,e,{id:`${deathId}:seal`,verb:'transfer',actor:id,target:null,subject:key,minute,location:settlement,tags:['family','estate'],summary:'死者无人继承，遗产由官府封存'});
    return key;
}
export const continuedOnDeath=(row,id)=>row.category==='contract'&&row.kind==='workshop'&&row.laborMarket===1&&row.owner===id&&!row.domainSteward&&employmentActive(row);
const sealed=owner=>String(owner).startsWith('estate:');

// Liabilities are settled before anything is allocated to heirs.
registerObligation({kind:'debt',order:10,stage:'liabilities',reasons:['death'],verb:'transfer',
    list:(e,d,id)=>records(d).filter(([,r])=>r.category==='debt'&&r.debtor===id&&!debtClosed(r)),
    settle:settleDebts,summary:done=>`死者遗产按法定顺序清偿${done.length}笔欠款${done.some(x=>x.remaining)?'，不足部分记坏账':''}`});
// Workers keep their contracts: the heir becomes the employer; without one the
// sealed estate pays wages until it runs dry, then existing arrears rules stop work.
registerObligation({kind:'employment',order:20,reasons:['death'],
    list:(e,d,id)=>records(d).filter(([,r])=>continuedOnDeath(r,id)),
    onHolderGone(e,d,[key,row],{holder,successor,eventId,minute}){
        if(!successor)return null;
        d.set(rec(key),{...row,owner:successor,parties:[row.worker,successor],previousOwner:holder,succession:{death:eventId,minute,mode:sealed(successor)?'官府封存':'继承人承接'}});
        return key;
    },target:(done,{successor})=>sealed(successor)?null:successor,
    summary:(done,{successor})=>sealed(successor)?'雇主身故无继承人，雇佣合同由官府封存的遗产承接，欠薪照常累计':'雇主身故，雇佣合同由继承人承接'});
// Appointees stay in post when their appointer dies or is removed; validity is
// read from the appointment itself and the successor revokes through governance.
registerObligation({kind:'office_appointment',order:30,reasons:['death','removed'],verb:'appoint',
    list:(e,d,id)=>records(d).filter(([,r])=>r.category==='housing_steward'&&!r.employment&&r.grantor===id&&!r.revoked&&r.expires>d.get('state','minute')),
    onHolderGone:(e,d,[key])=>key,summary:()=>'任命人去职，所任管事留任至继任者撤换'});
// A dead guardian is replaced in genealogical order, else the court appoints.
registerObligation({kind:'guardianship',order:40,reasons:['death'],verb:'appoint',visibility:'members',
    list:(e,d,id)=>Object.values(d.get('state','records')??{}).filter(r=>r.category==='guardianship'&&r.guardian===id&&r.status==='代管中'),
    onHolderGone:(e,d,r,{minute})=>reassignGuardian(d,e,r,minute,null).id,
    summary:(done,ctx)=>'监护人身故，按族谱顺位改指定监护人，无合格亲属的交官府待指定'});
// Headships fall to an acting deputy at once; by-elections and charter
// succession then run on the daily advance (elections.mjs, organizations.mjs).
registerObligation({kind:'organization_leadership',order:50,reasons:['death','removed','defected','departed'],verb:'organize',
    list(e,d,id){
        const s=d.get('state'),orgs=records(d).filter(([,r])=>r.category==='organization'&&r.leader===id).map(([,r])=>r.id);
        const factions=(e.world.factions??[]).filter(f=>f.leader===id&&!Object.hasOwn(s.records?.[`organization:${f.id}`]??{},'leader')).map(f=>f.id);
        const heads=[...new Set(records(d).filter(([,r])=>r.category==='governance_office'&&r.holder===id&&r.office==='office_village_head').map(([,r])=>r.settlement)),
            ...(e.world.settlementProfiles??[]).filter(p=>p.details?.governance?.head===id).map(p=>p.id)];
        return [...new Set(orgs.concat(factions))].map(org=>({org})).concat([...new Set(heads)].map(settlement=>({settlement})));
    },
    onHolderGone(e,d,o){
        const s=d.get('state');
        if(o.org){const v=organizationState(e,s,o.org);return v&&!v.leader?{org:o.org,acting:v.acting}:null;}
        const g=settlementGovernment(e,s,o.settlement);return g.head.value?null:{settlement:o.settlement,acting:g.acting?.value??null};
    },summary:()=>'首脑空缺，由副职代理并按章程或推选来源补选'});
// Interfaces kept for PR-02: leases (lessor, tenant or leased building gone)
// and shareholdings. Death already ends a lease and divides equity in the
// existing death commit; these kinds only list what a later handler will settle.
registerObligation({kind:'lease',order:60,reasons:['death','destroyed','departed'],
    list:(e,d,id)=>records(d).filter(([,r])=>r.category==='contract'&&r.kind==='lease'&&r.status==='有效'&&(r.parties?.includes(id)||r.subject===id||r.location===id)),
    onHolderGone:()=>null,summary:()=>'租约随出租方、承租方或标的变化处理'});
registerObligation({kind:'shareholding',order:70,reasons:['death','destroyed','departed'],
    list:(e,d,id)=>records(d).filter(([,r])=>r.category==='equity'&&r.status==='有效'&&(r.holder===id||r.business===id)),
    onHolderGone:()=>null,summary:()=>'股份随持有人或标的变化处理'});
