// Shared mutation entry points. Records remain compatibility projections of
// the existing protocol obligation; all money uses the existing ledger.
import {canonical,digest} from './storage.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {declareLedgerWriter,resourceKey,ledgerActive} from './ledger.mjs';
import {partyAccount,moveCoins,mirrorPartyCoins,escrow as escrowAccount,fund as fundAccount} from './money.mjs';
import {obligationTransaction,syncObligationClaims} from './transition.mjs';
import {snapshotObligationTerms,obligationKind} from './obligation-kinds.mjs';
import {obligationRow,obligationRows,obligationView} from './obligation-state.mjs';
import {settlementPresent,settlementLocation} from './obligation-presence.mjs';
import {publishTransitionEvent,SOCIAL_VERBS} from './world-events.mjs';
import {isEffective,isPhysicallyDead} from './lifecycle-state.mjs';
import {legalCodeAt,legalCodeById} from './law-codes.mjs';
import {groupView,lawAuthorities,personConstraint} from './entity-view.mjs';
import {identities} from './identity.mjs';
import {npcAgeAt} from './npc-state.mjs';
import {transferItems} from './items.mjs';

const W='obligation-runtime';
declareHoldingWriter(W,{kinds:[]});declareLedgerWriter(W);
const read=(d,...p)=>d.peek?d.peek(...p):d.get(...p);
const integer=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`Invalid ${label}`);return n;};
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));
// Resolve an office from today's facts, never from the signature's old name.
export function obligationRepresentative(e,s,party){
    const base=e.rules.economy?.credit?.banks?.find(b=>b.id===party),stored=s.records?.[party];
    const bank=stored?.category==='bank'?{...base,...stored}:base;
    const candidates=bank?.keepers??[groupView(e,s,party)?.leader.value].filter(Boolean);
    return candidates.find(id=>{
        const n=id==='player'?s.player:s.npcs?.[id];return n&&isEffective(e,s,id)&&!['死亡','昏迷','濒死'].includes(n.status)&&
            !/睡眠|睡觉|熟睡/.test(n.activity??'')&&!personConstraint(e,s,id)&&settlementPresent(e,s,id,party);
    })??null;
}
function receipt(d,e,id,eventId,verb,args,fn){
    if(typeof eventId!=='string'||!eventId)throw Error('Obligation mutation requires eventId');
    const key=`obligation:${id}:${eventId}`,old=read(d,'state','records',`world_event:${key}`),signature=canonical({verb,args});
    if(old){if(old.signature!==signature)throw Error('Obligation eventId reused with different input');return structuredClone(old.result);}
    return obligationTransaction(d,()=>{
        const result=fn();SOCIAL_VERBS.add(verb);
        const row=obligationRow(read(d,'state'),id);
        publishTransitionEvent(d,e,{id:key,verb,actor:args.actor??args.payer??row.debtor,minute:read(d,'state','minute'),
            location:args.signingPlace??settlementLocation(e,read(d,'state'),row.debtor??row.promisor),visibility:'private',witnesses:[],
            participants:[row.debtor??row.promisor,row.creditor??row.promisee].filter(Boolean),tags:['obligation'],obligation:id,signature,result,
            summary:`${id}: ${verb}`});
        return result;
    });
}
function write(d,e,row){
    d.obligationRuntimeVersion=1;
    d.set(['state','obligations',row.id],row);
    if(row.legacyRecord){
        const old=read(d,'state','records',row.legacyRecord)??{};
        if(old.category&&old.category!=='debt')return read(d,'state','obligations',row.id);
        const status=row.status==='settled'?'已还清':['void','cancelled'].includes(row.status)?'已取消':old.status??'履行中';
        holdingSet(d,e,['state','records',row.legacyRecord],clean({...old,id:row.legacyRecord,category:'debt',obligation:row.id,
            debtor:row.debtor,creditor:row.creditor,amount:row.remaining!==undefined?(row.paid??0)+row.remaining:row.amount,
            ...(row.remaining!==undefined?{contractualAmount:row.amount}:{}),paid:row.paid??0,status,
            createdAt:row.createdAt,deadline:row.deadline,kind:row.kind,terms:row.terms,
            ...(row.endedAt!==undefined?{endedAt:row.endedAt}:{}),...(row.amendments?{amendments:row.amendments}:{})}),W);
    }
    return read(d,'state','obligations',row.id);
}
function languages(e,s,id){
    const a=id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id]??s.created?.[id];
    const v=a?.languages??e.byId?.get(id)?.languages??e.rules.languages?.default??['lang:common'];
    return new Map(Array.isArray(v)?v.map(k=>[k,1]):Object.entries(v).map(([k,n])=>[k,typeof n==='number'?n:n.proficiency??0]));
}
export function obligationCommunication(e,s,a,b,{minimum=1,interpreter=null}={}){
    if(!settlementPresent(e,s,a,b))return {degree:0,language:null,interpreter:null};
    const aa=languages(e,s,a),bb=languages(e,s,b);
    const match=[...aa].filter(([k,n])=>n>=minimum&&(bb.get(k)??0)>=minimum).sort(([a],[b])=>a.localeCompare(b));
    if(match.length)return {degree:Math.min(aa.get(match[0][0]),bb.get(match[0][0])),language:match[0][0],interpreter:null};
    if(interpreter&&interpreter!==a&&interpreter!==b&&settlementPresent(e,s,a,interpreter)){
        const n=s.npcs?.[interpreter]??s.creatures?.[interpreter];
        if(n&&!['死亡','昏迷','濒死'].includes(n.status)){
            const c=languages(e,s,interpreter),left=[...aa].find(([k,n])=>n>=minimum&&(c.get(k)??0)>=minimum),right=[...bb].find(([k,n])=>n>=minimum&&(c.get(k)??0)>=minimum);
            if(left&&right)return {degree:Math.min(left[1],right[1],c.get(left[0]),c.get(right[0])),language:[left[0],right[0]],interpreter};
        }
    }
    return {degree:0,language:null,interpreter:null};
}
export function assertObligationAuthority(e,s,{actor,debtor,actedAs,inName},action='contract'){
    if(!actor||!debtor)throw Error('Signing requires actor and debtor');
    const who=actor==='player'?s.player:s.npcs?.[actor]??s.creatures?.[actor]??s.created?.[actor];
    if(!who||!isEffective(e,s,actor)||['死亡','昏迷','濒死'].includes(who.status))throw Error('Signer cannot act');
    const code=legalCodeAt(e,settlementLocation(e,s,actor),s),capacity=code?.civil?.capacity;
    const age=actor==='player'?who.age:npcAgeAt(e,s,actor),majority=code?.civil?.majority?.[action]??capacity?.majority?.[action];
    if(Number.isFinite(majority)&&Number.isFinite(age)&&age<majority)throw Error('Signer lacks legal capacity for this action');
    if(actor!==debtor&&inName&&!identities(e,s,actor).some(i=>i.key===inName))throw Error('Signing identity is not held');
    if(actor===debtor){if(inName&&!identities(e,s,actor).some(i=>i.key===inName))throw Error('Signing identity is not held');return;}
    const grant=actedAs?.source&&s.records?.[actedAs.source];
    const valid=grant&&!grant.revoked&&grant.endedAt===undefined&&(grant.since??grant.createdAt??0)<=(s.minute??0)&&(grant.expires??Infinity)>(s.minute??0)&&
        (grant.grantee===actor||grant.guardian===actor)&&
        (grant.grantor===debtor||grant.ward===debtor)&&
        (grant.category==='guardianship'&&grant.status==='代管中'||grant.category==='authorization'&&(grant.action===action||grant.actions?.includes(action)));
    if(!valid&&obligationRepresentative(e,s,debtor)!==actor)throw Error('Signer lacks current authority for this party');
}
function requireRow(d,id){const row=obligationRow(read(d,'state'),id);if(!row)throw Error('Unknown obligation');return {...row,id:row.id??id};}
// A representative item is a fact in the inventory, not a flag supplied by
// the caller. Delivery adapters keep owner/container up to date as it moves.
export function obligationInstrument(e,s,row,payer){
    const required=row.terms?.requiresInstrument;
    if(!required)return null;
    const items=Object.entries(s.itemInstances??{}).filter(([id,item])=>
        (typeof required!=='string'||id===required)&&
        [row.id,row.legacyRecord].filter(Boolean).includes(item.represents));
    for(const [id,item]of items){
        if(item.status!==undefined&&!['valid','持有','有效'].includes(item.status)||(item.expires??Infinity)<=s.minute)continue;
        const owner=item.owner;
        if(!owner||!row.terms?.bearer&&owner!==row.creditor)continue;
        const inventory=owner==='player'?s.inventory:s.npcs?.[owner]?.inventory??s.creatures?.[owner]?.inventory;
        if(!Object.values(inventory??{}).some(v=>v?.quantity>0&&v.instances?.includes(id)))continue;
        if(item.container&&item.container!==settlementLocation(e,s,payer))continue;
        if(settlementPresent(e,s,payer,owner))return {id,item,owner,holder:owner,custodian:owner,arrival:settlementLocation(e,s,owner),status:item.status??'valid',claim:row.id};
    }
    return null;
}
const instrumentFor=obligationInstrument;
function collectionAt(e,s,row,payer){
    const clause=row.terms?.collection;if(!clause)return null;
    const grant=s.records?.[clause.source],collector=clause.collector,seat=settlementLocation(e,s,collector);
    if(!grant||grant.category!=='authorization'||grant.grantor!==row.creditor||grant.grantee!==collector||
        grant.revoked||grant.endedAt!==undefined||(grant.since??0)>s.minute||(grant.expires??Infinity)<=s.minute||
        !(grant.action==='collect'||grant.actions?.includes('collect'))||grant.obligation&&grant.obligation!==row.id)return null;
    if(!seat||!e.byId.get(seat)||!settlementPresent(e,s,payer,collector))return null;
    return {collector,seat,key:`obligation_collection:${row.id}:${seat}`,account:`${seat}|coin_river|collected:${row.id}`,creditor:row.creditor};
}
function settlementFunding(e,s,row,args,amount){
    if(args.judicial){
        const {case:caseId,authority,source}=args.judicial,c=s.records?.[caseId],code=c&&legalCodeById(e,c.law,s);
        if(!c||c.category!=='legal_case'||c.status!=='已裁定'||!c.judgment||
            ![row.id,row.legacyRecord].includes(c.debt)||c.offender!==row.debtor||!Number.isSafeInteger(c.judgment.compensation)||amount>c.judgment.compensation||isPhysicallyDead(e,s,row.debtor)||
            !code||s.location!==code.court||!lawAuthorities(e,s,code,'officer').includes(authority)||
            settlementLocation(e,s,authority)!==code.court||personConstraint(e,s,authority))throw Error('Judicial settlement requires a current court, judgment and present officer');
        const n=s.npcs?.[authority];if(!n||['死亡','濒死','昏迷'].includes(n.status)||/睡眠|熟睡|睡觉/.test(n.activity??''))throw Error('Officer cannot execute judgment');
        if(source){
            const deposit=s.records?.[source];
            if(source!==`legal_deposit:${caseId}`||deposit?.category!=='legal_deposit'||deposit.case!==caseId||deposit.beneficiary!==row.creditor||deposit.coins<amount||deposit.claimed)throw Error('Judgment deposit is not available for this claim');
            return {from:fundAccount(source),record:source,field:'coins',seat:code.court,caseId};
        }
        const location=row.debtor==='player'?s.location:s.npcs?.[row.debtor]?.location;
        if(location!==code.court)throw Error('Judicial seizure requires assets physically at the court');
        return {from:partyAccount(e,s,row.debtor),payer:row.debtor,seat:code.court,caseId};
    }
    if(args.fundingContract){
        const c=s.records?.[args.fundingContract];
        if(c?.category!=='contract'||c.owner!==row.debtor||c.worker!==row.creditor||row.contract!==args.fundingContract||amount>(c.escrow??0)||
            settlementLocation(e,s,row.creditor)!==c.location)throw Error('Employment guarantee is not pledged to this earned claim');
        return {from:escrowAccount(args.fundingContract),record:args.fundingContract,field:'escrow',seat:c.location};
    }
    return null;
}
export function openObligation(d,e,args,eventId){
    const id=args.id??`obligation_${eventId}`;
    return receipt(d,e,id,eventId,'obligation_opened',args,()=>{
        if(obligationRow(read(d,'state'),id))throw Error('Obligation id already exists');
        const {debtor,creditor,actor=debtor}=args,s=read(d,'state');
        assertObligationAuthority(e,s,{...args,actor,debtor});
        if(!creditor)throw Error('Obligation requires creditor');
        if(!obligationCommunication(e,s,actor,creditor,{interpreter:args.interpreter}).degree)throw Error('Parties cannot communicate signed terms');
        const place=settlementLocation(e,s,actor);
        if(args.signingPlace!==undefined&&args.signingPlace!==place)throw Error('Signing place must be the actual place');
        const exclusive=args.terms?.exclusive??args.exclusive,clashes=[];
        if(exclusive){
            if(!['subject','debtor_subject','debtor'].includes(exclusive.scope)||!['forbid','supersede'].includes(exclusive.policy))throw Error('Invalid exclusive terms');
            for(const o of obligationRows(s)){
                if(obligationView(s,o).closed)continue;
                if(exclusive.family!==undefined&&(o.terms?.exclusive?.family??o.kind)!==exclusive.family)continue;
                if(exclusive.scope!=='debtor'&&o.subject!==args.subject||exclusive.scope!=='subject'&&o.debtor!==debtor)continue;
                clashes.push(o);
            }
            if(clashes.length&&exclusive.policy==='forbid')throw Error('Exclusive obligation already exists');
        }
        const minute=s.minute??0;
        integer(args.amount??0,'obligation amount');
        if(args.deadline!==undefined&&(!Number.isSafeInteger(args.deadline)||args.deadline<minute))throw Error('Invalid obligation deadline');
        const spec=obligationKind(args);
        const row=snapshotObligationTerms(clean({...args,id,actor,runtimeVersion:1,kind:spec.id,amount:args.amount??0,createdAt:minute,paid:0,status:'pending',
            signingPlace:place,terms:{...args.terms},events:[]}));
        const code=legalCodeAt(e,place,s);
        row.terms={...row.terms,actor,actedAs:structuredClone(args.actedAs??null),inName:args.inName??actor,
            signingPlace:row.signingPlace,signingMinute:minute,signingLaw:code?.id??null,signingLawVersion:code?digest(code):null};
        for(const old of clashes)write(d,e,{...old,endedAt:minute,endReason:'superseded',supersededBy:id});
        write(d,e,row);
        return {id,transferred:0,remaining:obligationView(read(d,'state'),id).owed,evidence:eventId};
    });
}
export function amendObligation(d,e,{id,actor,changes,...facts},eventId){
    const args={id,actor,changes,...facts};
    return receipt(d,e,id,eventId,'obligation_amended',args,()=>{
        const row=requireRow(d,id),s=read(d,'state');
        assertObligationAuthority(e,s,{...facts,actor,debtor:row.debtor});
        if(obligationView(s,row).closed)throw Error('Closed obligation cannot be amended');
        const allowed=new Set(['deadline','principal','rate','value','accrual','grace','expires']);
        if(!changes||Object.keys(changes).some(k=>!allowed.has(k)))throw Error('Amendment cannot replace signing facts');
        if(changes.deadline!==undefined&&(!Number.isSafeInteger(changes.deadline)||changes.deadline<s.minute))throw Error('Invalid amended deadline');
        if(changes.expires!==undefined&&(!Number.isSafeInteger(changes.expires)||changes.expires<s.minute))throw Error('Invalid amended expiry');
        const next={...row,amendments:[...row.amendments??[],{...structuredClone(changes),minute:s.minute,eventId,actor}]};
        // Effective procedural deadline is a projection. Original terms remain.
        if(changes.deadline!==undefined)next.deadline=changes.deadline;
        write(d,e,next);return {id,transferred:0,remaining:obligationView(s,next).owed,evidence:eventId};
    });
}
export function closeObligation(d,e,{id,actor,reason,...facts},eventId){
    const args={id,actor,reason,...facts};
    return receipt(d,e,id,eventId,'obligation_closed',args,()=>{
        const row=requireRow(d,id),s=read(d,'state');
        // Either signatory may end future service. Earned claims survive.
        const party=facts.party??row.debtor;
        if(![row.debtor,row.creditor].includes(party))throw Error('Only a party may close an obligation');
        assertObligationAuthority(e,s,{...facts,actor,debtor:party});
        const next={...row,endedAt:row.endedAt??s.minute,endReason:reason??'terminated'};
        write(d,e,next);return {id,transferred:0,remaining:obligationView(s,next).owed,evidence:eventId};
    });
}
// The delivery adapter owns the real stock movement and completion receipt.
// Transport calls this only after its route/arrival checks have succeeded.
export function performObligation(d,e,{id,actor},eventId){
    if(!ledgerActive(d))throw Error('Performance requires an opened ledger transaction');
    return receipt(d,e,id,eventId,'obligation_performed',{id,actor},()=>{
        const row=requireRow(d,id),s=read(d,'state'),debtor=row.debtor??row.promisor,creditor=row.creditor??row.promisee;
        assertObligationAuthority(e,s,{actor,debtor});
        if(row.type!=='送货'&&row.kind!=='delivery')throw Error('This obligation requires its actual service adapter');
        if(obligationView(s,row).closed||row.status==='已完成')throw Error('Performance already closed');
        if(!settlementPresent(e,s,actor,creditor)||row.location&&settlementLocation(e,s,actor)!==row.location)throw Error('Delivery requires the agreed physical recipient and place');
        integer(row.quantity,'delivery quantity');if(!row.item||!row.quantity)throw Error('Delivery requires real goods');
        transferItems(d,e,debtor,creditor,row.item,row.quantity);
        write(d,e,{...row,status:'已完成',resolvedAt:s.minute,completion:{eventId,actor,minute:s.minute,item:row.item,quantity:row.quantity}});
        return {id,transferred:0,delivered:row.quantity,item:row.item,remaining:0,evidence:eventId};
    });
}
export function settleObligation(d,e,args,eventId){
    if(!ledgerActive(d))throw Error('Settlement requires an opened ledger transaction');
    const resolved=requireRow(d,args.id),id=resolved.id;
    args={...args,id};
    return receipt(d,e,id,eventId,'obligation_settled',args,()=>{
        const row=requireRow(d,id),s=read(d,'state'),payer=args.payer??row.debtor,actor=args.actor??payer;
        if(row.resource&&resourceKey(row.resource)!=='coin_river')throw Error('Non-monetary claim requires its performance adapter');
        const view=obligationView(s,row),amount=integer(args.amount??view.owed,'settlement amount');
        if([args.judicial,args.fundingContract,args.escrowContract,args.automatic].filter(Boolean).length>1)throw Error('Conflicting payment authority');
        const funding=settlementFunding(e,s,row,args,amount),escrow=args.escrowContract&&s.records?.[args.escrowContract];
        if(funding){
            if(payer!==row.debtor)throw Error('A pledged source can only settle its own debtor');
        }else if(args.escrowContract){
            if(escrow?.category!=='contract'||![id,row.legacyRecord].includes(escrow.debt)||
                (escrow.parties?.[0]??escrow.owner)!==payer||payer!==row.debtor||amount>(escrow.escrow??0))throw Error('Escrow is not pledged to this debt');
        }else if(args.automatic){
            if(!row.terms?.autoSettle||payer!==row.debtor||amount>view.amountDue)throw Error('Automatic settlement exceeds the signed due authority');
        }else {
            assertObligationAuthority(e,s,{...args,actor,debtor:payer},'payment');
            if(actor!==payer&&!settlementPresent(e,s,actor,payer))throw Error('Payment representative must be at the assets');
        }
        if(!amount||amount>view.owed)throw Error('Payment exceeds outstanding claim');
        if(s.records?.[`transition_procedure:${row.debtor}`]?.phase&&s.records[`transition_procedure:${row.debtor}`].phase!=='closed')throw Error('Claim is controlled by the active lifecycle procedure');
        if(row.inheritanceFrom&&s.records?.[`transition_procedure:${row.inheritanceFrom}`]?.phase!=='closed'&&s.records?.[`transition_procedure:${row.inheritanceFrom}`]?.reopenedClaims?.includes(id))throw Error('Claim is controlled by the reopened lifecycle procedure');
        const instrument=instrumentFor(e,s,row,payer),creditor=instrument?.owner??row.creditor,collection=!instrument&&collectionAt(e,s,row,payer);
        if(row.terms?.requiresInstrument&&!instrument)throw Error('Settlement requires the valid representative instrument physically delivered');
        const deposit=funding?.caseId&&settlementLocation(e,s,creditor)!==funding.seat?`legal_deposit:${funding.caseId}`:null;
        if(!funding&&!escrow&&!collection&&!settlementPresent(e,s,payer,creditor))throw Error('Settlement requires physical presence or delivered remittance');
        if(funding&&!deposit&&settlementLocation(e,s,creditor)!==funding.seat)throw Error('Pledged funds require local receipt');
        if(row.terms?.limitation&&typeof e.obligationClaimEnforceable!=='function')throw Error('Limitation adapter is required');
        if(e.obligationClaimEnforceable&&!e.obligationClaimEnforceable(d,row,s.minute))throw Error('Claim is not enforceable under current procedure');
        const from=funding?.from??(escrow?escrowAccount(args.escrowContract):partyAccount(e,s,payer)),to=deposit?fundAccount(deposit):collection?.account??partyAccount(e,s,creditor);
        if(from===to)throw Error('Settlement accounts must differ');
        if((read(d,'ledger','accounts',from)??0)<amount)throw Error('Settlement source has insufficient booked cash');
        const transferred=moveCoins(d,{from,to,amount,writer:W,eventId});
        if(transferred!==amount)throw Error('Settlement must book the exact receipt amount');
        if(funding?.record){const old=s.records[funding.record];holdingSet(d,e,['state','records',funding.record],{...old,[funding.field]:old[funding.field]-amount},W);}
        else if(escrow)holdingSet(d,e,['state','records',args.escrowContract],{...escrow,escrow:escrow.escrow-amount},W);
        else mirrorPartyCoins(d,e,payer,-amount,eventId,W);
        if(deposit){
            const old=read(d,'state','records',deposit);
            if(old&&(old.category!=='legal_deposit'||old.beneficiary!==creditor))throw Error('Court deposit beneficiary mismatch');
            holdingSet(d,e,['state','records',deposit],{...old,category:'legal_deposit',case:funding.caseId,beneficiary:creditor,location:funding.seat,coins:(old?.coins??0)+amount,units:old?.units??[],payments:[...old?.payments??[],{obligation:id,amount,eventId}]},W);
        }else if(collection){
            const old=read(d,'state','records',collection.key);
            holdingSet(d,e,['state','records',collection.key],{...collection,category:'obligation_collection',obligation:id,coins:(old?.coins??0)+amount},W);
        }else mirrorPartyCoins(d,e,creditor,amount,eventId,W);
        const paid=(row.paid??0)+transferred,remaining=view.owed-transferred;
        const next={...row,creditor,amount:(row.amount??0)+view.accrued,paid,...(row.remaining!==undefined?{remaining}:{}),
            ...(row.inheritanceFrom?{inheritedPaid:(row.inheritedPaid??0)+transferred}:{}),
            ...(row.terms?.accrual?{accrualSettled:(row.accrualSettled??0)+view.accrued}:{}),status:remaining||row.terms?.accrual&&row.endedAt===undefined?'pending':'settled',
            ...(remaining?{}:{settledAt:s.minute}),events:[...row.events??[],{eventId,minute:s.minute,payer,actor,transferred}]};
        write(d,e,next);
        if(instrument&&!remaining)holdingSet(d,e,['state','itemInstances',instrument.id],{...instrument.item,status:'redeemed',redeemedAt:s.minute,settledBy:eventId},W);
        if(!remaining&&row.legacyRecord&&(row.pledgeRecord||row.defaulted?.case))e.protocolDebtSettled?.(d,{...next,unpaid:0},eventId);
        return {id,transferred,remaining,evidence:eventId,accounts:{from,to}};
    });
}
export function adoptLegacyObligation(d,e,id){
    return obligationTransaction(d,()=>{const row=requireRow(d,id);if(read(d,'state','obligations',row.id))return row;
        const next=snapshotObligationTerms({...row,kind:row.kind??'compensation',legacyRecord:id});write(d,e,next);return next;});
}
export function automaticObligationItems(e,d,{after}){
    const s=read(d,'state');
    return Object.values(s.obligations??{}).filter(row=>row.runtimeVersion===1&&row.terms?.autoSettle&&obligationView(s,row,after).amountDue>0)
        .map(row=>({id:row.id,anchorId:row.id,registeredSeq:row.registeredSeq,execute(){
            const current=requireRow(d,row.id),state=read(d,'state'),view=obligationView(state,current,after);
            if(!view.amountDue)return;
            const procedure=state.records?.[`transition_procedure:${current.inheritanceFrom??current.debtor}`];
            if(procedure&&procedure.phase!=='closed')return;
            if(current.terms?.requiresInstrument&&!instrumentFor(e,state,current,current.debtor))return;
            if(current.terms?.limitation&&typeof e.obligationClaimEnforceable!=='function')return;
            if(e.obligationClaimEnforceable&&!e.obligationClaimEnforceable(d,current,after))return;
            if(!settlementPresent(e,state,current.debtor,current.creditor)&&!collectionAt(e,state,current,current.debtor))return;
            // Lack of cash leaves a real outstanding claim. No empty cursor or
            // failure receipt is written when nothing can be paid.
            const amount=Math.min(view.amountDue,read(d,'ledger','accounts',partyAccount(e,state,current.debtor))??0);
            if(!amount)return;
            settleObligation(d,e,{id:row.id,amount,automatic:true},`auto:${row.id}:${after}`);
        }}));
}
// Cash stays at the collecting building until its owner (or a current agent)
// actually arrives. Transport may instead carry it through its normal adapter.
export function receiveObligationCollection(d,e,{id,actor,...facts},eventId){
    return obligationTransaction(d,()=>{
        const row=read(d,'state','records',id);if(row?.category!=='obligation_collection'||!row.coins)throw Error('No collected funds');
        assertObligationAuthority(e,read(d,'state'),{...facts,actor,debtor:row.creditor},'payment');
        if(settlementLocation(e,read(d,'state'),actor)!==row.seat)throw Error('Collected funds must be received at their actual seat');
        const amount=row.coins,to=partyAccount(e,read(d,'state'),row.creditor);
        if(!ledgerActive(d)||(read(d,'ledger','accounts',row.account)??0)<amount)throw Error('Collection requires its actual booked funds');
        // An agent takes custody locally; crediting a remote owner's purse is
        // not a delivery. The owner can receive directly here.
        if(actor!==row.creditor&&!(obligationRepresentative(e,read(d,'state'),row.creditor)===actor&&settlementLocation(e,read(d,'state'),row.creditor)===row.seat))throw Error('Agent collection requires a transport custody adapter');
        moveCoins(d,{from:row.account,to,amount,writer:W,eventId});mirrorPartyCoins(d,e,row.creditor,amount,eventId,W);
        holdingSet(d,e,['state','records',id],{...row,coins:0,receivedAt:read(d,'state','minute'),receivedBy:eventId},W);
        return {id,transferred:amount,evidence:eventId};
    });
}
export {obligationView as dueObligation,obligationRows,syncObligationClaims};
