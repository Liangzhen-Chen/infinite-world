// Shared mutation entry points. Records remain compatibility projections of
// the existing protocol obligation; all money uses the existing ledger.
import {canonical,digest} from './storage.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {partyAccount,moveCoins,mirrorPartyCoins} from './money.mjs';
import {obligationTransaction,syncObligationClaims} from './transition.mjs';
import {snapshotObligationTerms,obligationKind} from './obligation-kinds.mjs';
import {obligationRow,obligationRows,obligationView} from './obligation-state.mjs';
import {settlementPresent,settlementLocation} from './obligation-presence.mjs';
import {publishTransitionEvent,SOCIAL_VERBS} from './world-events.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {legalCodeAt} from './law-codes.mjs';

const W='obligation-runtime';
declareHoldingWriter(W,{kinds:[]});declareLedgerWriter(W);
const read=(d,...p)=>d.peek?d.peek(...p):d.get(...p);
const integer=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error(`Invalid ${label}`);return n;};
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));
function receipt(d,e,id,eventId,verb,args,fn){
    if(typeof eventId!=='string'||!eventId)throw Error('Obligation mutation requires eventId');
    const key=`obligation:${id}:${eventId}`,old=read(d,'state','records',`world_event:${key}`),signature=canonical({verb,args});
    if(old){if(old.signature!==signature)throw Error('Obligation eventId reused with different input');return structuredClone(old.result);}
    return obligationTransaction(d,()=>{
        const result=fn();SOCIAL_VERBS.add(verb);
        const row=obligationRow(read(d,'state'),id);
        publishTransitionEvent(d,e,{id:key,verb,actor:args.actor??args.payer??row.debtor,minute:read(d,'state','minute'),
            location:args.signingPlace??settlementLocation(e,read(d,'state'),row.debtor),visibility:'private',witnesses:[],
            participants:[row.debtor,row.creditor].filter(Boolean),tags:['obligation'],obligation:id,signature,result,
            summary:`${id}: ${verb}`});
        return result;
    });
}
function write(d,e,row){
    d.set(['state','obligations',row.id],row);
    if(row.legacyRecord){
        const old=read(d,'state','records',row.legacyRecord)??{};
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
    if(actor===debtor){if(inName&&inName!==actor&&!who.identities?.some(i=>i.key===inName&&i.until===undefined))throw Error('Signing identity is not held');return;}
    const grant=actedAs?.source&&s.records?.[actedAs.source];
    const valid=grant&&!grant.revoked&&grant.endedAt===undefined&&(grant.since??grant.createdAt??0)<=(s.minute??0)&&(grant.expires??Infinity)>(s.minute??0)&&
        (grant.grantee===actor||grant.guardian===actor)&&
        (grant.grantor===debtor||grant.ward===debtor)&&
        (grant.category==='guardianship'&&grant.status==='代管中'||grant.category==='authorization'&&(grant.action===action||grant.actions?.includes(action)));
    if(!valid)throw Error('Signer lacks current authority for this party');
}
function requireRow(d,id){const row=obligationRow(read(d,'state'),id);if(!row)throw Error('Unknown obligation');return {...row,id:row.id??id};}
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
        const row=requireRow(d,id),s=read(d,'state');assertObligationAuthority(e,s,{...facts,actor,debtor:row.debtor});
        const next={...row,endedAt:row.endedAt??s.minute,endReason:reason??'terminated'};
        write(d,e,next);return {id,transferred:0,remaining:obligationView(s,next).owed,evidence:eventId};
    });
}
export function settleObligation(d,e,args,eventId){
    const resolved=requireRow(d,args.id),id=resolved.id;
    args={...args,id};
    return receipt(d,e,id,eventId,'obligation_settled',args,()=>{
        const row=requireRow(d,id),s=read(d,'state'),payer=args.payer??row.debtor,actor=args.actor??payer;
        assertObligationAuthority(e,s,{...args,actor,debtor:payer},'payment');
        const view=obligationView(s,row),amount=integer(args.amount??view.owed,'settlement amount');
        if(!amount||amount>view.owed)throw Error('Payment exceeds outstanding claim');
        if(s.records?.[`transition_procedure:${row.debtor}`]?.phase&&s.records[`transition_procedure:${row.debtor}`].phase!=='closed')throw Error('Claim is controlled by the active lifecycle procedure');
        if(!settlementPresent(e,s,payer,row.creditor))throw Error('Settlement requires physical presence or delivered remittance');
        if(row.terms?.requiresInstrument)throw Error('Instrument claim requires its delivery adapter');
        if(row.terms?.limitation&&typeof e.obligationClaimEnforceable!=='function')throw Error('Limitation adapter is required');
        if(e.obligationClaimEnforceable&&!e.obligationClaimEnforceable(d,row,s.minute))throw Error('Claim is not enforceable under current procedure');
        const from=partyAccount(e,s,payer),to=partyAccount(e,s,row.creditor);
        if(from===to)throw Error('Settlement accounts must differ');
        const transferred=moveCoins(d,{from,to,amount,writer:W,eventId});
        mirrorPartyCoins(d,e,payer,-amount,eventId,W);mirrorPartyCoins(d,e,row.creditor,amount,eventId,W);
        const paid=(row.paid??0)+transferred,remaining=view.owed-transferred;
        const next={...row,amount:(row.amount??0)+view.accrued,paid,...(row.remaining!==undefined?{remaining}:{}),
            ...(row.inheritanceFrom?{inheritedPaid:(row.inheritedPaid??0)+transferred}:{}),
            ...(row.terms?.accrual?{accrualSettled:(row.accrualSettled??0)+view.accrued}:{}),status:remaining||row.terms?.accrual&&row.endedAt===undefined?'pending':'settled',
            ...(remaining?{}:{settledAt:s.minute}),events:[...row.events??[],{eventId,minute:s.minute,payer,actor,transferred}]};
        write(d,e,next);
        if(!remaining&&row.legacyRecord&&(row.pledgeRecord||row.defaulted?.case))e.protocolDebtSettled?.(d,{...next,unpaid:0},eventId);
        return {id,transferred,remaining,evidence:eventId,accounts:{from,to}};
    });
}
export function adoptLegacyObligation(d,e,id){
    return obligationTransaction(d,()=>{const row=requireRow(d,id);if(read(d,'state','obligations',row.id))return row;
        const next=snapshotObligationTerms({...row,kind:row.kind??'compensation',legacyRecord:id});write(d,e,next);return next;});
}
export {obligationView as dueObligation,obligationRows,syncObligationClaims};
