// PR-01: a death settles the person's own debts from the estate before heirs
// receive anything. Liabilities never pass to heirs; any shortfall is written
// off as bad debt. Without heirs the remainder stays under official seal.
import {actorPath} from './npc-state.mjs';
import {financeChange} from './finance-bank.mjs';
import {bankById,bankRow} from './credit.mjs';
import {settleCreditCase} from './law.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {employmentActive} from './employment-state.mjs';
import {personHousehold,placeSettlement} from './entity-view.mjs';

const rec=id=>['state','records',id];
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
export function settleEstateDebts(d,e,id,minute,deathId){
    const s=d.get('state'),path=actorPath(e.world,id);
    const debts=Object.entries(s.records??{}).filter(([,r])=>r.category==='debt'&&r.debtor===id&&!debtClosed(r))
        .map(([key,row])=>({key,row,due:row.amount-(row.paid??0),rank:rank(e,row.kind)})).sort((a,b)=>a.rank-b.rank||a.key.localeCompare(b.key));
    if(!debts.length)return [];
    const deposits=Object.entries(s.records).filter(([,r])=>r.category==='bank'&&(r.accounts?.[id]??0)>0).sort(([a],[b])=>a.localeCompare(b));
    let cash=d.get(...path,'coins')??0,available=cash+deposits.reduce((n,[,r])=>n+r.accounts[id],0);
    const out=[];
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
    for(const x of debts){
        if(x.pay)credit(d,e,x.row.creditor,x.pay,`${deathId}:${x.key}`);
        const paid=(x.row.paid??0)+x.pay,remaining=x.row.amount-paid,next={...d.get(...rec(x.key)),paid};
        if(!remaining)Object.assign(next,{status:'已还清',paidAt:minute,settledBy:deathId});
        else Object.assign(next,{status:'坏账',badDebt:{minute,remaining,estate:deathId}});
        d.set(rec(x.key),next);
        const claim=x.row.defaulted?.case&&d.get(...rec(x.row.defaulted.case));
        if(claim&&!remaining)settleCreditCase(d,e,claim.id,deathId);
        else if(claim&&claim.status!=='已结案')d.set(rec(claim.id),{...claim,status:'已结案',closed:minute,reason:'债务人已故，遗产按法定顺序清偿，不足部分记坏账',estate:deathId});
        out.push({debt:x.key,kind:x.row.kind??null,creditor:x.row.creditor,paid:x.pay,remaining});
    }
    return out;
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
// Workers keep their contracts. The heir becomes the employer; without one the
// sealed estate pays wages until it runs dry, after which the existing arrears
// rules stop work.
export function continueEmployment(d,e,id,owner,deathId,minute){
    const out=[];
    for(const [key,row]of Object.entries(d.get('state','records')??{})){
        if(!continuedOnDeath(row,id))continue;
        d.set(rec(key),{...row,owner,parties:[row.worker,owner],previousOwner:id,succession:{death:deathId,minute,mode:owner.startsWith('estate:')?'官府封存':'继承人承接'}});
        entityTransition(d,e,{id:`${deathId}:employment:${key}`,verb:'transfer',actor:id,target:owner.startsWith('estate:')?null:owner,subject:key,minute,location:row.location,tags:['employment','succession'],
            summary:owner.startsWith('estate:')?'雇主身故无继承人，雇佣合同由官府封存的遗产承接':'雇主身故，雇佣合同由继承人承接'});
        out.push(key);
    }
    return out;
}
export const continuedOnDeath=(row,id)=>row.category==='contract'&&row.kind==='workshop'&&row.laborMarket===1&&row.owner===id&&!row.domainSteward&&employmentActive(row);
