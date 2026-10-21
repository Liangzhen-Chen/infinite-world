import {registerObligationProtocol} from './obligation-protocol.mjs';
import {registerObligationCivilGrace} from './obligation-state.mjs';
// Shared mutation entry points. Records remain compatibility projections of
// the existing protocol obligation; all money uses the existing ledger.
import {canonical,digest} from './storage.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings,closeHolding,setLocation} from './holdings.mjs';
import {declareLedgerWriter,resourceKey,ledgerActive,transfer} from './ledger.mjs';
import {partyAccount,moveCoins,mirrorPartyCoins,dedicatedCoinAccount,escrow as escrowAccount,fund as fundAccount} from './money.mjs';
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
import {pledged,placed,UNIT_PLACED} from './stock.mjs';

const W='obligation-runtime';
declareHoldingWriter('obligation-runtime',{kinds:['pledged'],locations:true});declareLedgerWriter(W);
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
        const payment=result.payment;
        publishTransitionEvent(d,e,{id:key,verb,actor:payment?.actor??args.actor??args.payer??row.debtor,minute:read(d,'state','minute'),
            location:payment?.location??args.signingPlace??settlementLocation(e,read(d,'state'),row.debtor??row.promisor),visibility:'private',witnesses:[],
            participants:[...new Set([row.debtor??row.promisor,row.creditor??row.promisee,payment?.payer,payment?.actor,payment?.collector].filter(Boolean))],tags:['obligation'],obligation:id,signature,result,
            ...(payment?{payment}:{}),
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
            createdAt:row.createdAt,deadline:row.deadline,kind:row.snapshotCollateral?'pawn':row.kind,terms:row.snapshotCollateral?{...row.terms,grace:{minutes:row.terms.redeemDeadline-row.deadline}}:row.terms,
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
export function assertObligationAuthority(e,s,{actor,debtor,actedAs,inName},action='contract',authorize=null){
    if(!actor||!debtor)throw Error('Signing requires actor and debtor');
    const who=actor==='player'?s.player:s.npcs?.[actor]??s.creatures?.[actor]??s.created?.[actor];
    // Optional native composition callback: A3 rechecks the current holding,
    // mandate and confinement regime. It is never part of the serialized args.
    if(authorize!==null){
        if(typeof authorize!=='function'||!who||authorize({engine:e,state:s,actor,party:debtor,action}).allowed!==true)throw Error('Signer lacks current primitive authority');
        if(inName&&!identities(e,s,actor).some(i=>i.key===inName))throw Error('Signing identity is not held');
        return;
    }
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
function collectionAt(e,s,row,payer,document){
    if(row.kind==='fine'&&row.terms?.collectionSite){
        const c=s.records?.[row.terms.case];
        if(!c||c.judgment?.sourceEvent!==row.terms.judgmentEvent||c.fineDischarged||c.appeal?.outcome==='overturned')return null;
        const account=dedicatedCoinAccount(s,row.creditor,'legal_treasury');
        if(!account||account.seat!==row.terms.collectionSite||settlementLocation(e,s,payer)!==account.seat)return null;
        const holders=aliveHoldings({get:(...p)=>p.reduce((v,k)=>v?.[k],document)},{kind:'holds_office'});
        for(const h of holders){
            const office=document.holdings?.entities?.[h.subject],facts=office?.facts,a=facts?.authority,n=h.holder==='player'?s.player:s.npcs?.[h.holder];
            if(!office||office.goneAt!==undefined||facts?.organization!==row.creditor||facts.seat!==account.seat||a?.obligation!==row.id||!a.operations?.includes('collect_fine')||
                a.collectionAccount?.owner!==row.creditor||a.collectionAccount?.purpose!=='legal_treasury'||a.collectionAccount?.resource!=='coin_river'||
                !n||facts.onDuty!==true||!isEffective(e,s,h.holder)||personConstraint(e,s,h.holder)||!settlementPresent(e,s,payer,h.holder)||/睡|昏|失能/.test(n.activity??n.status??''))continue;
            return {collector:h.holder,seat:account.seat,account:account.account,dedicated:true,creditor:row.creditor};
        }
        return null;
    }
    const clause=row.terms?.collection;if(!clause)return null;
    const grant=s.records?.[clause.source],collector=clause.collector,seat=settlementLocation(e,s,collector);
    if(!grant||grant.category!=='authorization'||grant.grantor!==row.creditor||grant.grantee!==collector||
        grant.revoked||grant.endedAt!==undefined||(grant.since??0)>s.minute||(grant.expires??Infinity)<=s.minute||
        !(grant.action==='collect'||grant.actions?.includes('collect'))||grant.obligation&&grant.obligation!==row.id)return null;
    if(!seat||!e.byId.get(seat)||!settlementPresent(e,s,payer,collector))return null;
    return {collector,seat,key:`obligation_collection:${row.id}:${seat}`,account:`${seat}|coin_river|collected:${row.id}`,creditor:row.creditor};
}
export function finePaymentContext(e,document,{reference,caseId,payer='player',amount}={}){
    const s=document.state,matches=obligationRows(s).filter(o=>o.snapshotVersion===1&&o.kind==='fine'&&o.debtor===payer&&
        (reference===undefined||o.id===reference||o.name===reference||o.legacyRecord===reference)&&(!caseId||o.terms?.case===caseId)&&!obligationView(s,o).closed);
    if(matches.length!==1)return null;
    const row=matches[0],owed=obligationView(s,row).owed,collection=collectionAt(e,s,row,payer,document),n=amount??owed;
    if(!collection||!Number.isSafeInteger(n)||n<1||n>owed)return null;
    return {id:row.id,case:row.terms.case,collector:collection.collector,site:collection.seat,account:collection.account,owed,amount:n};
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
export function openObligation(d,e,args,eventId,{authorize=null}={}){
    const id=args.id??`obligation_${eventId}`;
    return receipt(d,e,id,eventId,'obligation_opened',args,()=>{
        if(obligationRow(read(d,'state'),id))throw Error('Obligation id already exists');
        const {debtor,creditor,actor=debtor}=args,s=read(d,'state');
        assertObligationAuthority(e,s,{...args,actor,debtor},'contract',authorize);
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
export function closeObligation(d,e,{id,actor,reason,...facts},eventId,{authorize=null}={}){
    const args={id,actor,reason,...facts};
    return receipt(d,e,id,eventId,'obligation_closed',args,()=>{
        const row=requireRow(d,id),s=read(d,'state');
        // Either signatory may end future service. Earned claims survive.
        const party=facts.party??row.debtor;
        if(![row.debtor,row.creditor].includes(party))throw Error('Only a party may close an obligation');
        assertObligationAuthority(e,s,{...facts,actor,debtor:party},'contract',authorize);
        const waived=reason==='creditor_waiver';
        if(waived&&party!==row.creditor)throw Error('Only the current creditor may waive an earned claim');
        if(waived&&row.pledgeRecord)throw Error('A secured claim requires its collateral release protocol before waiver');
        const next={...row,endedAt:row.endedAt??s.minute,endReason:reason??'terminated',
            ...(waived?{status:'cancelled',remaining:0,waiver:{actor,creditor:row.creditor,amount:obligationView(s,row).owed,minute:s.minute,eventId}}:{})};
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
export function settleObligation(d,e,args,eventId,{authorize=null}={}){
    if(!ledgerActive(d))throw Error('Settlement requires an opened ledger transaction');
    const resolved=requireRow(d,args.id),id=resolved.id;
    args={...args,id};
    return receipt(d,e,id,eventId,'obligation_settled',args,()=>{
        const row=requireRow(d,id),s=read(d,'state'),payer=args.payer??row.debtor,actor=args.actor??payer;
        if(row.snapshotVersion===1&&(row.kind==='delivery'||row.kind==='upkeep'))throw Error('Non-monetary obligation requires its actual service adapter');
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
            assertObligationAuthority(e,s,{...args,actor,debtor:payer},'payment',authorize);
            if(actor!==payer&&!settlementPresent(e,s,actor,payer))throw Error('Payment representative must be at the assets');
        }
        if(!amount||amount>view.owed)throw Error('Payment exceeds outstanding claim');
        if(s.records?.[`transition_procedure:${row.debtor}`]?.phase&&s.records[`transition_procedure:${row.debtor}`].phase!=='closed')throw Error('Claim is controlled by the active lifecycle procedure');
        if(row.inheritanceFrom&&s.records?.[`transition_procedure:${row.inheritanceFrom}`]?.phase!=='closed'&&s.records?.[`transition_procedure:${row.inheritanceFrom}`]?.reopenedClaims?.includes(id))throw Error('Claim is controlled by the reopened lifecycle procedure');
        const instrument=instrumentFor(e,s,row,payer),creditor=instrument?.owner??row.creditor,collection=!instrument&&collectionAt(e,s,row,payer,d.document);
        if(row.kind==='fine'&&row.terms?.collectionSite&&!collection)throw Error('Fine requires its present on-duty authorized public collector');
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
        }else if(collection&&!collection.dedicated){
            const old=read(d,'state','records',collection.key);
            holdingSet(d,e,['state','records',collection.key],{...collection,category:'obligation_collection',obligation:id,coins:(old?.coins??0)+amount},W);
        }else if(!collection)mirrorPartyCoins(d,e,creditor,amount,eventId,W);
        const paid=(row.paid??0)+transferred,remaining=view.owed-transferred;
        const next={...row,creditor,amount:(row.amount??0)+view.accrued,paid,...(row.remaining!==undefined?{remaining}:{}),
            ...(row.inheritanceFrom?{inheritedPaid:(row.inheritedPaid??0)+transferred}:{}),
            ...(row.terms?.accrual?{accrualSettled:(row.accrualSettled??0)+view.accrued}:{}),status:remaining||row.terms?.accrual&&row.endedAt===undefined?'pending':'settled',
            ...(remaining?{}:{settledAt:s.minute}),events:[...row.events??[],{eventId,minute:s.minute,payer,actor,transferred}]};
        write(d,e,next);
        if(row.kind==='deposit'&&row.snapshotVersion===1){
            const b=read(d,'state','records',row.debtor);
            holdingSet(d,e,['state','records',row.debtor],{...b,accounts:{...b.accounts,[row.creditor]:remaining}},W);
        }
        if(row.kind==='fine'&&row.snapshotVersion===1){
            const c=read(d,'state','records',row.terms.case);
            holdingSet(d,e,['state','records',row.terms.case],{...c,finePaid:paid,fineDischarged:!remaining},W);
        }
        if(instrument&&!remaining)holdingSet(d,e,['state','itemInstances',instrument.id],{...instrument.item,status:'redeemed',redeemedAt:s.minute,settledBy:eventId},W);
        if(!remaining&&row.legacyRecord&&(row.pledgeRecord||row.defaulted?.case))e.protocolDebtSettled?.(d,{...next,unpaid:0},eventId);
        if(!remaining&&row.snapshotCollateral){
            for(const h of aliveHoldings(d,{kind:'pledged',holder:row.id,subject:row.snapshotCollateral}))closeHolding(d,{id:h.id,reason:'released',writer:W,eventId});
            setLocation(d,{entity:row.snapshotCollateral,at:row.debtor,mode:'carried',writer:W,engine:e});
        }
        if(e.replaying&&e.replayResult?.obligationSettlementVersion!==1)return {id,transferred,remaining,evidence:eventId,accounts:{from,to}};
        d.obligationSettlementVersion=1;
        const payment={payer,actor:args.judicial?.authority??actor,debtor:row.debtor,creditor,
            location:funding?.seat??(escrow?(escrow.location??settlementLocation(e,s,creditor)):settlementLocation(e,s,actor)),accounts:{from,to},
            ...(args.actedAs?{actedAs:structuredClone(args.actedAs)}:{}),...(collection?{collector:collection.collector}:{})};
        return {id,transferred,remaining,evidence:eventId,accounts:{from,to},payment};
    });
}
export function adoptLegacyObligation(d,e,id){
    return obligationTransaction(d,()=>{const row=requireRow(d,id);if(read(d,'state','obligations',row.id))return row;
        const next=snapshotObligationTerms({...row,kind:row.kind??'compensation',legacyRecord:id});write(d,e,next);return next;});
}

// Restore signed facts, never re-sign, pay, charge a fee or run a delivery.
export function restoreObligationSnapshot(d,e,args){
    return obligationTransaction(d,()=>{
        const {id,kind,debtor,creditor,amount,paid,openedAt,dueAt,sourceEvent,terms={}}=args,s=read(d,'state'),event=s.records?.[sourceEvent];
        if(typeof id!=='string'||!id||['__proto__','prototype','constructor'].includes(id)||!['loan','deposit','fine','delivery','upkeep','promise','rent'].includes(kind)||
            !debtor||!creditor||debtor===creditor||![amount,paid,openedAt,dueAt].every(n=>Number.isSafeInteger(n)&&n>=0)||paid>amount||openedAt>s.minute||dueAt<openedAt||
            !terms||typeof terms!=='object'||Array.isArray(terms)||event?.category!=='world_event'||event.verb!=='obligation_opened'||event.minute>s.minute||
            event.payload?.subject!==id||event.payload.debtor!==debtor||event.payload.creditor!==creditor||event.payload.amount!==amount)throw Error('Invalid historical obligation snapshot or source');
        const known=p=>p==='player'||s.npcs?.[p]||s.creatures?.[p]||s.effects?.[p]?.kind==='summon'||e.byId.has(p)||e.rules.economy?.credit?.banks?.some(b=>b.id===p);
        if(!known(debtor)||!known(creditor))throw Error('Unknown historical obligation party');
        if(obligationRow(s,id))throw Error('Historical obligation already exists');
        const bank=e.rules.economy?.credit?.banks?.find(b=>b.id===(kind==='deposit'?debtor:creditor)),collateral=terms.collateral&&s.itemInstances?.[terms.collateral];
        if(kind==='deposit'&&(!bank||typeof terms.withdrawable!=='boolean'))throw Error('Deposit requires its registered bank and withdrawal terms');
        if(terms.collateral!==undefined&&(!bank||kind!=='loan'||!collateral||!aliveHoldings(d,{kind:'owns',holder:debtor,subject:terms.collateral}).length||collateral.owner!==creditor||
            collateral.location!==bank.location||!UNIT_PLACED[collateral.status]||!Number.isSafeInteger(terms.redeemDeadline)||terms.redeemDeadline<dueAt||terms.totalDue!==amount))throw Error('Invalid existing collateral custody or redemption terms');
        if(kind==='fine'){
            const c=s.records?.[terms.case],j=s.records?.[terms.judgmentEvent];
            if(c?.category!=='legal_case'||!c.parties?.includes(debtor)||j?.verb!=='judged'||j.payload?.subject!==terms.case||j.payload.fine!==amount||j.payload.effective!==true||c.court!==terms.collectionSite)throw Error('Fine requires its effective judgment and collection site');
            if(c.judgment?.sourceEvent&&c.judgment.sourceEvent!==terms.judgmentEvent)throw Error('Fine judgment conflicts with its registered case');
        }
        if(kind==='delivery'&&(!s.itemInstances?.[terms.subject]||typeof terms.delivered!=='boolean'||typeof terms.lossAssessed!=='boolean'))throw Error('Delivery snapshot requires its actual cargo and delivery facts');
        if(kind==='upkeep'){
            const effect=s.effects?.[creditor];
            if(effect?.kind!=='summon'||effect.owner!==debtor||effect.expires<=s.minute||typeof terms.peacefulDismissal!=='boolean'||typeof terms.active!=='boolean'||typeof terms.overdue!=='boolean'||typeof terms.thirdPartyRights!=='boolean')throw Error('Upkeep snapshot requires its active owned summon and signed terms');
        }
        const legacyKind=collateral?'pawn':kind,row=snapshotObligationTerms({id,kind,category:kind==='delivery'?'delivery':kind==='upkeep'?'upkeep':'debt',runtimeVersion:1,debtor,creditor,amount,paid,
            createdAt:openedAt,deadline:dueAt,source:sourceEvent,snapshotVersion:1,status:paid===amount&&amount>0?'settled':'pending',events:[],terms:structuredClone(terms),
            ...(['loan','fine'].includes(kind)?{legacyRecord:id}:{}),...(args.name?{name:args.name}:{}),...(bank?{bank:bank.id,location:bank.location}:{}),
            ...(collateral?{pledgeRecord:`pledge:${id}`,snapshotCollateral:terms.collateral}:{}),...(kind==='delivery'?{subject:terms.subject,delivered:terms.delivered,lossAssessed:terms.lossAssessed}:{}),
            ...(kind==='upkeep'?{subject:creditor,contract:s.effects[creditor].contract}: {})});
        write(d,e,row);
        if(kind==='fine'){
            const c=read(d,'state','records',terms.case),j=s.records[terms.judgmentEvent];
            holdingSet(d,e,['state','records',terms.case],{...c,judgment:{...c.judgment,sourceEvent:terms.judgmentEvent,minute:j.minute,fine:amount},finePaid:paid,fineDischarged:paid===amount},W);
        }
        if(collateral){
            holdingSet(d,e,['state','records',row.pledgeRecord],{category:'pledge',owner:debtor,item:collateral.item,quantity:1,instances:[terms.collateral],value:e.byId.get(collateral.item)?.basePrice??0,status:'质押中',createdAt:openedAt,source:sourceEvent},W);
            holdingSet(d,e,['state','itemInstances',terms.collateral],{...collateral,owner:row.pledgeRecord,status:'质押'},W);
            transfer(d,{from:placed(e,collateral[UNIT_PLACED[collateral.status]],collateral.item),to:pledged(e,row.pledgeRecord,collateral.item),amount:1,writer:W,eventId:sourceEvent});
            holdingSet(d,e,['state','records',id],{...read(d,'state','records',id),kind:legacyKind,bank:bank.id,pledgeRecord:row.pledgeRecord,auctionAt:terms.redeemDeadline,location:bank.location},W);
        }
        if(kind==='deposit'){
            const b=s.records?.[bank.id]??{category:'bank',id:bank.id,name:bank.name,location:bank.location,coins:bank.reserveCopper??0,goods:{...bank.reserveCoins??{}},accounts:{}};
            if(Object.values(s.obligations??{}).some(o=>o.id!==id&&o.kind==='deposit'&&o.debtor===debtor&&o.creditor===creditor))throw Error('Existing deposit projection is ambiguous');
            holdingSet(d,e,['state','records',bank.id],{...b,accounts:{...b.accounts,[creditor]:amount-paid}},W);
        }
        if(kind==='upkeep'){
            const key=row.contract,c=read(d,'state','records',key);
            holdingSet(d,e,['state','records',key],{...c,upkeepObligation:id},W);
        }
        return row;
    });
}
// The summon adapter, including natural expiry, ends only its linked future upkeep.
export function endSummonUpkeep(d,e,{id,summon,minute,reason}){
    const row=requireRow(d,id),s=read(d,'state'),effect=s.effects?.[summon],contract=effect&&s.records?.[effect.contract];
    if(row.kind!=='upkeep'||row.creditor!==summon||row.debtor!==effect?.owner||contract?.upkeepObligation!==id||row.contract!==effect.contract||
        !Number.isSafeInteger(minute)||minute<row.createdAt)throw Error('Summon upkeep termination requires its actual contract');
    if(row.endedAt===undefined)write(d,e,{...row,endedAt:minute,endReason:reason,status:'terminated'});
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
            if(!settlementPresent(e,state,current.debtor,current.creditor)&&!collectionAt(e,state,current,current.debtor,d.document))return;
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

registerObligationProtocol({openObligation,settleObligation,closeObligation,performObligation,receiveObligationCollection,dueObligation:obligationView,automaticObligationItems});
registerObligationCivilGrace((engine,state,row,minute)=>legalCodeAt(engine,row.location??state.location,{...state,minute})?.civil?.grace??null);
