// L1 transfer protocol. The caller's scheduler determines the order of calls.
import fs from 'node:fs';
import {GONE_BASES,ensureHoldings,aliveHoldings,holdingRow,holdingKind,templatesOf,createEntity,entityRow,endEntity,updateEntity,
    openHoldings,openHolding,closeHolding,transferHolding,rescaleHolding,setLocation,clearLocation,locationOf,auditHoldings,declareHoldingWriter,invalidateHoldings,holdingKindIds,holdingSet,registerLifecycleProtocol} from './holdings.mjs';
import './holding-kinds.mjs';
import {accountKey,parseAccount,transfer,declareLedgerWriter,openLedger} from './ledger.mjs';
import {registerProtocolRunner} from './scheduler.mjs';
import {publishTransitionEvent,SOCIAL_VERBS,registerWorldEventSubscriber,presentWitnesses} from './world-events.mjs';
import {identities} from './identity.mjs';
import {inheritanceRule,inheritanceCandidates,guardianCandidates} from './family-state.mjs';
import {npcAgeAt,npcHousehold} from './npc-state.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {personOffices} from './entity-view.mjs';
import {recordsWhere} from './storage.mjs';
import {obligationGoneRoute,snapshotObligationTerms} from './obligation-kinds.mjs';
import {purse,vault,partyAccount,mirrorPartyCoins} from './money.mjs';

const W='transition';
declareHoldingWriter('transition',{kinds:['*'],entities:['*'],locations:true});
declareLedgerWriter(W,{sinks:['sink:destroy','sink:pack_removed']});
const templates=JSON.parse(fs.readFileSync(new URL('../world/ontology/entity-templates.json',import.meta.url),'utf8')).entries;
const read=(d,...p)=>d.peek?d.peek(...p):d.get(...p);
const now=d=>read(d,'state','minute')??0;
const root=['holdings','protocol'];
const byEntity=(d,x)=>read(d,...root,'entities',x)??null;
export const transitionState=byEntity;
const body=(d,x)=>x==='player'?read(d,'state','player'):read(d,'state','npcs',x)??read(d,'state','creatures',x)??read(d,'state','created',x);
const clean=x=>Object.fromEntries(Object.entries(x).filter(([,v])=>v!==undefined));
const projectFields=(d,engine,path,value,eventId)=>holdingSet(d,engine,path,value,W,eventId,{projection:true});
const writeRecord=(d,engine,id,value)=>holdingSet(d,engine,['state','records',id],value,'transition');

// Draft exposes immutable checkpoints. Restore sequence and caches along with data.
function atomic(d,fn){
    if(d.protocolTransaction)return fn();
    const document=structuredClone(d.document),patches=d.patches?.length??0,messages=d.messages?.length??0,seq=d.scheduler?.seq;
    const reaction=d.reactionTick?structuredClone({...d.reactionTick,queue:[]}):null,queue=d.reactionTick?.queue?.slice();
    d.protocolTransaction=true;
    try{return fn();}catch(error){
        if(!Reflect.set(d,'document',document)){
            for(const key of Object.keys(d.document))if(!Object.hasOwn(document,key))d.remove([key]);
            for(const [key,value]of Object.entries(document))d.set([key],value);
        }
        if(d.patches)d.patches.length=patches;if(d.messages)d.messages.length=messages;
        if(d.scheduler)d.scheduler.seq=seq;
        if(reaction)d.reactionTick={...reaction,queue};else delete d.reactionTick;
        invalidateHoldings(d);throw error;
    }finally{delete d.protocolTransaction;}
}
function emit(d,engine,event){
    SOCIAL_VERBS.add(event.verb);
    const row={minute:now(d),actor:event.entity??event.holder??'core:protocol',visibility:'private',witnesses:[],participants:[],tags:['entity-transition','protocol'],...event};
    const phaseNames={notice:'公告遗产程序',filing:'受理债权申报',settlement:'清偿遗产债务',distribution:'分配遗产',closed:'完成遗产程序'};
    row.summary??=`${engine.byId?.get(row.entity??row.holder)?.name??row.entity??row.holder??'当事人'}：${phaseNames[row.phase]??({transition:'依法办理交接',succession:'职位出现空缺',holding_transferred:'持有关系已交接',holding_closed:'持有关系已结束',restored:'恢复法律身份'}[row.verb]??'登记权利义务变更')}`;
    row.actorAs??=identities(engine,read(d,'state'),row.actor).at(-1)?.key;
    if(event.witnesses===undefined&&event.location)row.witnesses=presentWitnesses(read(d,'state'),event.location,[row.actor]);
    publishTransitionEvent(d,engine,clean(row));return read(d,'state','records',`world_event:${event.id}`)??row;
}
const terminal=o=>['void','settled','bad_debt','cancelled','取消','已完成'].includes(o.status);
const live=(d,e,id)=>{
    if(typeof id!=='string'||byEntity(d,id)?.gone||entityRow(d,id)?.goneAt!==undefined||body(d,id)?.status==='死亡')return false;
    if(templatesOf(d,id,e)?.length)return true;
    const row=read(d,'state','records',id);
    // Freight remains in a shipment's custody account after its vehicle is lost.
    return row?.category==='transport'&&!!row.cargoLocation&&live(d,e,row.cargoLocation);
};
function accountOwnerLive(d,e,id){
    if(live(d,e,id))return true;
    if(byEntity(d,id)?.gone||entityRow(d,id)?.goneAt!==undefined)return false;
    // Workstation inventory is a real S1 account, anchored at its building.
    const stationPlace=[...e.world?.locations??[],...Object.values(read(d,'state','created')??{})].find(p=>p.workstations?.some(s=>s.id===id));
    if(stationPlace)return live(d,e,stationPlace.id);
    const row=read(d,'state','records',id);
    if(['forest','mineral'].includes(row?.category))return live(d,e,row.location);
    if(row?.category==='settlement_trade')return live(d,e,row.seller)&&live(d,e,row.buyer);
    if(row?.category==='army')return !byEntity(d,row.id)?.gone&&live(d,e,row.location);
    return !!read(d,'state','quests',id)||!!read(d,'state','projects',id);
}
export function assertTransitionInvariants(d,e,entity=null){
    const errors=auditHoldings(d);
    if(entity){
        if(aliveHoldings(d,{holder:entity}).length)errors.push(`I6 holdings: ${entity} ${aliveHoldings(d,{holder:entity}).map(h=>`${h.kind}:${h.subject}`).join(',')}`);
        if(Object.values(read(d,'holdings','locations')??{}).some(l=>l.at===entity))errors.push(`I6 contents: ${entity}`);
        if(Object.entries(read(d,'ledger','accounts')??{}).some(([k,n])=>parseAccount(k).owner===entity&&n))errors.push(`I6 accounts: ${entity}`);
        const a=body(d,entity);
        if(byEntity(d,entity)?.gone&&templatesOf(d,entity,e)?.includes('agent')){
            if(personOffices(e,read(d,'state'),entity).length)errors.push(`I6 powers: ${entity}`);
            if(typeof e.protocolScheduleAt!=='function')throw Error('Protocol schedule query is not installed');
            if(e.protocolScheduleAt(e,entity,now(d),read(d,'state'))!==null)errors.push(`I6 schedule effective: ${entity}`);
        }
        if(['scheduleTravel','cognitionTravel','caring'].some(k=>a?.[k]))errors.push(`I6 schedule: ${entity}`);
        if(byEntity(d,entity)?.gone&&recordsWhere(read(d,'state','records')??{},'category','protocol_schedule').some(r=>r.status==='pending'&&r.context?.entity===entity))errors.push(`I6 protocol schedule: ${entity}`);
        if(Object.values(read(d,'state','npcAutonomy','tasks')??{}).some(t=>t.npc===entity&&!['completed','cancelled','已完成','已取消'].includes(t.status)))errors.push(`I6 task: ${entity}`);
    }
    for(const l of Object.values(read(d,'holdings','locations')??{}))if(!live(d,e,l.at))errors.push(`I6 location destination: ${l.at}`);
    for(const [key,n]of Object.entries(read(d,'ledger','accounts')??{})){const a=parseAccount(key);if(n&&!a.owner.startsWith('src:')&&!a.owner.startsWith('sink:')&&!accountOwnerLive(d,e,a.owner))errors.push(`I6 account destination: ${a.owner}`);}
    for(const o of Object.values(read(d,'state','obligations')??{}))if(!terminal(o)){
        for(const keys of [['debtor','promisor'],['creditor','promisee']]){
            const ends=keys.filter(k=>o[k]!==undefined);
            if(!ends.length||ends.some(k=>!live(d,e,o[k])||!templates.some(t=>t.obligationParty&&templatesOf(d,o[k],e)?.includes(t.id))))errors.push(`I7 obligation: ${o.id} ${keys[0]}`);
        }
    }
    const exclusive=new Set();
    for(const o of Object.values(read(d,'state','obligations')??{}))if(!terminal(o)&&o.exclusive){const key=`${o.exclusiveFamily??o.kind}:${o.subject}`;if(exclusive.has(key))errors.push(`I8 exclusive obligation: ${key}`);exclusive.add(key);}
    if(entity&&Object.values(read(d,'holdings','entities')??{}).some(c=>c.kind==='case'&&c.facts?.of===entity&&c.facts.status!=='closed'))errors.push(`I6 unresolved case: ${entity}`);
    if(errors.length)throw Error(errors.join('; '));
}
const invariant=(d,entity=null,e=d.engine)=>assertTransitionInvariants(d,e,entity);
const bands=[['holds_office','appointed','governs','administers','fief','permit'],['guardian_of','custody_of'],['registered'],['operates','employed_by'],['owns','share','leases','tamed_by','commands','pledged'],[]];
const rank=r=>{const i=bands.findIndex(b=>b.includes(r.kind));return i<0?5:i;};
const sorted=rows=>rows.sort((a,b)=>rank(a)-rank(b)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
const successors=(d,ctx,r)=>[...r.terms?.successors??[],...ctx.successors??[]].map(x=>typeof x==='string'?x:x.heir??x.id).filter(x=>x!==ctx.entity&&!byEntity(d,x)?.gone);
function action(d,e,r,template,ctx,side='holder'){
    if(!r||holdingRow(d,r.id)?.until!==undefined)return;
    const options={id:r.id,writer:W,eventId:ctx.eventId,engine:e};
    const close=()=>{closeHolding(d,{...options,reason:ctx.reason??'vacated'});projectHolding(d,e,r,null,ctx);emit(d,e,{id:`${ctx.eventId}:close:${r.id}`,verb:'holding_closed',holder:r.holder,subject:r.subject,cause:ctx.eventId,kind:r.kind,reason:ctx.reason??'vacated'});};
    const move=patch=>{const id=transferHolding(d,{...options,...patch,reason:ctx.reason??'transferred'});projectHolding(d,e,r,holdingRow(d,id),ctx);emit(d,e,{id:`${ctx.eventId}:transfer:${r.id}`,verb:'holding_transferred',holder:patch.holder??r.holder,subject:patch.subject??r.subject,cause:ctx.eventId,kind:r.kind});return id;};
    if(template==null||template==='stay')return;
    if(template==='suspend'){throw Error('suspend is derived, not a protocol action');}
    if(side==='subject'){
        if(template==='estate'&&r.kind==='employed_by'){
            const contract=read(d,'state','records',r.terms?.contract),route=contract?.clauses?.onEmployerGone??contract?.clauses?.onHolderGone;
            if(['terminate','void'].includes(route)){close();return;}
        }
        if(template==='close')close();
        else if(template==='estate'){if(!ctx.successor)throw Error('subject estate requires successor');move({subject:ctx.successor});}
        else if(template==='reparent'){if(ctx.location)move({subject:ctx.location});else close();}
        else throw Error(`Unknown subject hook ${template}`);
        return;
    }
    if(template==='estate'){
        if(ctx.insolvency&&r.terms?.exempt)return;
        const target=ctx.successor??ctx.owner;
        if(!target)throw Error(`No estate or owner for ${r.kind}`);
        move({holder:target});
    }else if(template==='succeed'||template==='revert'){
        let target=template==='revert'?r.grantedBy:successors(d,ctx,r)[0]??r.grantedBy;
        if(r.kind==='fief'&&r.source?.startsWith('title:'))target=aliveHoldings(d,{kind:'holds_office',subject:r.grantedBy})[0]?.holder??target;
        if(template==='succeed'&&r.kind==='guardian_of')target=[...r.terms?.successors??[],...guardianCandidates(e,read(d,'state'),r.subject,r.holder,now(d)),r.grantedBy].map(x=>typeof x==='string'?x:x?.id).find(id=>live(d,e,id)&&id!==ctx.entity);
        // Old title rows used their own office as the grantor. An office that
        // cannot hold this kind is not a lawful recipient of the reverted fief.
        if(templatesOf(d,target,e)?.includes('office')&&!holdingKind(r.kind).holderKinds.includes('office'))target=null;
        if(target)move({holder:target});
        else if(r.kind==='governs')throw Error('governs requires a living polity successor');
        else close();
        if(r.kind==='guardian_of'&&r.source?.startsWith('guardianship:')){
            const id=r.source.slice('guardianship:'.length),row=read(d,'state','records',id);
            if(row)writeRecord(d,e,id,{...row,guardian:target??null,status:target?'代管中':'待指定',previousGuardian:r.holder,reassignedAt:now(d),sourceEvent:ctx.eventId});
        }
    }else if(template==='vacate'){
        const title=r.source?.startsWith('title:')?read(d,'state','records',r.source.slice(6)):null;
        const office=entityRow(d,r.subject),officeRow=Object.values(read(d,'state','records')??{}).find(o=>o.category==='governance_office'&&o.holder===r.holder&&o.office===office?.facts?.office&&o.settlement===office?.facts?.settlement);
        if(title||officeRow?.hereditary){
            const state=read(d,'state'),rule=inheritanceRule(e,state,ctx.entity,ctx.location,legalCodeAt(e,ctx.location,state)),selection=inheritanceCandidates(e,state,ctx.entity,rule,now(d));
            const target=selection.children.find(id=>live(d,e,id))??selection.heirs.find(id=>live(d,e,id));
            if(target&&(title||rule.office==='hereditary')){move({holder:target});return;}
        }
        close();
        emit(d,e,{id:`${ctx.eventId}:vacancy:${r.id}`,verb:'succession',entity:r.subject,subject:r.subject,previousHolder:r.holder,holding:r.id,kind:r.kind,reason:ctx.reason??'vacated',cause:ctx.eventId,rule:r.terms?.succession??office?.facts?.succession??'vacant_until_claimed'});
    }else if(template==='retain_disputed'){
        writeRecord(d,e,`${ctx.eventId}:claim:${r.id}`,{category:'transition_claim',holder:r.holder,subject:r.subject,status:'open',cause:ctx.eventId,minute:now(d)});
        emit(d,e,{id:`${ctx.eventId}:claim:${r.id}`,verb:'claim',holder:r.holder,subject:r.subject,cause:ctx.eventId});
    }else if(template==='close')close();
    else throw Error(`Unknown handover ${template}`);
}
export function evaluateProtocolExpression(expr,ctx,d){
    if(expr===null||typeof expr!=='object'){
        if(typeof expr==='string'&&expr.startsWith('$'))return expr.slice(1).split('.').reduce((v,k)=>v?.[k],ctx);
        if(typeof expr==='string'&&/^(subject|holder)\s*(!=|==)\s*host$/.test(expr)){
            const [,side,op]=expr.match(/^(subject|holder)\s*(!=|==)\s*host$/);return op==='!='?ctx[side]!==ctx.host:ctx[side]===ctx.host;
        }
        return expr;
    }
    if(Array.isArray(expr))return expr.map(x=>evaluateProtocolExpression(x,ctx,d));
    if(expr.ref&&!expr.op)return expr.ref.split('.').reduce((v,k)=>v?.[k],ctx);
    if(expr.path&&!expr.op&&Object.keys(expr).length===1)return read(d,...evaluateProtocolExpression(expr.path,ctx,d));
    const args=(expr.args??[]).map(x=>evaluateProtocolExpression(x,ctx,d));
    switch(expr.op){
        case 'and':return args.every(Boolean);case 'or':return args.some(Boolean);case 'not':return !args[0];
        case 'eq':return args[0]===args[1];case 'ne':return args[0]!==args[1];
        case 'lt':return args[0]<args[1];case 'lte':return args[0]<=args[1];case 'gt':return args[0]>args[1];case 'gte':return args[0]>=args[1];
        case 'includes':return args[0]?.includes(args[1])??false;
        case undefined:return Object.fromEntries(Object.entries(expr).map(([k,v])=>[k,evaluateProtocolExpression(v,ctx,d)]));
        default:return Object.fromEntries(Object.entries(expr).map(([k,v])=>[k,evaluateProtocolExpression(v,ctx,d)]));
    }
}
function condition(h,ctx,e,d){
    if(h.when===undefined)return true;
    if(typeof h.when==='boolean')return h.when;
    if(e.evaluateProtocolCondition)return Boolean(e.evaluateProtocolCondition(h.when,{...ctx,d}));
    const result=evaluateProtocolExpression(h.when,ctx,d);
    if(typeof result!=='boolean')throw Error('Protocol condition must return a boolean');
    return result;
}
export function executeProtocolPrimitive(d,e,p,ctx={}){
    const a={...evaluateProtocolExpression(p,ctx,d),writer:W,eventId:ctx.eventId,engine:e};
    if(p.op==='holding.open')return openHolding(d,a);
    if(p.op==='holding.close')return closeHolding(d,{...a,reason:a.reason??'vacated'});
    if(p.op==='holding.transfer')return transferHolding(d,a);
    if(p.op==='transfer')return transfer(d,a);
    if(p.op==='fact.set'){
        if(a.path?.[0]!=='state')throw Error('I6 fact.set cannot bypass holdings or ledger writers');
        return holdingSet(d,e,a.path,a.value,W,ctx.eventId);
    }
    if(p.op==='emit')return emit(d,e,{...evaluateProtocolExpression(p,ctx,d),entity:a.entity??ctx.entity,id:a.id??`${ctx.eventId}:emit`,cause:ctx.eventId});
    if(p.op==='transition')return transition(d,e,a);
    if(p.op==='holding.rescale')return rescaleHolding(d,a);
    if(p.op==='create')return createEntity(d,a);
    if(p.op==='destroy')return transition(d,e,{...a,entity:a.entity??a.id,basis:'destruction',origin:'destruction'});
    if(p.op==='move')return setLocation(d,a);
    if(p.op==='status'||p.op==='vital'){
        const entity=a.entity??ctx.entity,path=entity==='player'?['state','player']:read(d,'state','npcs',entity)?['state','npcs',entity]:['state','creatures',entity];
        if(!body(d,entity))throw Error('Protocol vital/status target is missing');
        for(const [k,v]of Object.entries(a.values??{}))d.set([...path,k],v);
        if(p.op==='vital'&&(a.values?.status==='死亡'||a.values?.hp<=0))return transition(d,e,{entity,basis:'death',origin:'vital',eventId:ctx.eventId});
        return;
    }
    if(p.op==='obligation.create'){
        const o=a.obligation??a.value;if(!o?.id)throw Error('Obligation id required');
        if(read(d,'state','obligations',o.id))throw Error('Obligation already exists');
        d.set(['state','obligations',o.id],snapshotObligationTerms(o));return o.id;
    }
    if(p.op==='obligation.cancel'||p.op==='obligation.settle'){
        const o=read(d,'state','obligations',a.id);if(!o)throw Error('Obligation missing');
        if(p.op==='obligation.settle'){
            if(!settleClaims(d,e,o.debtor??o.promisor,[o],ctx))throw Error('Cannot settle obligation');
        }else d.set(['state','obligations',a.id],{...o,status:'cancelled',resolvedAt:now(d),cause:ctx.eventId});
        return;
    }
    if(p.op==='schedule'){
        if(!Number.isSafeInteger(a.at)||!Array.isArray(a.do))throw Error('Schedule requires at and primitives');
        const id=a.id??`${ctx.eventId}:schedule`;
        const anchor=byEntity(d,ctx.entity)?.gone?ctx.successor??a.entity:ctx.entity;
        if(!live(d,e,anchor))throw Error('Protocol schedule requires a live anchor');
        writeRecord(d,e,id,{category:'protocol_schedule',id,at:a.at,do:a.do,context:clean({entity:anchor,eventId:ctx.eventId,holder:ctx.holder,subject:ctx.subject,successor:ctx.successor,holding:ctx.holding,obligation:ctx.obligation,location:ctx.location,reason:ctx.reason}),status:'pending',registeredSeq:d.scheduler?.nextSeq()??0});return id;
    }
    if(p.op==='learn'&&a.observer&&a.event){
        const id=a.id??`${ctx.eventId}:learn:${a.observer}`;
        const event=typeof a.event==='string'?read(d,'state','records',`world_event:${a.event}`):a.event;
        if(!event||!live(d,e,a.observer))throw Error('Learning requires an existing event and observer');
        writeRecord(d,e,id,{id,category:'knowledge',observer:a.observer,sourceEvent:event.id,minute:now(d),kind:event.verb??'knowledge',value:structuredClone(event),sourceType:'reveal',cause:ctx.eventId});return id;
    }
    if(p.op==='time'&&Number.isSafeInteger(a.minutes)&&a.minutes>=0&&e.advance)return e.advance(d,a.minutes,ctx.eventId);
    if(e.executeProtocolPrimitive)return e.executeProtocolPrimitive(d,p,ctx);
    throw Error(`Protocol primitive is not installed: ${p.op}`);
}
function hooks(d,e,r,on,ctx,side='holder',declared=null){
    ctx={...ctx,holder:r.holder,subject:r.subject,host:r.subject,holding:r};
    const list=(declared??holdingKind(r.kind)?.hooks??[]).filter(h=>h.on===on||h.on===on.split('(')[0]);
    for(const h of list.sort((a,b)=>(a.packId??'core').localeCompare(b.packId??'core')||(a.id??'').localeCompare(b.id??''))){
        if(!condition(h,ctx,e,d))continue;
        if(typeof h.do==='string')action(d,e,holdingRow(d,r.id),h.do,ctx,side);
        else for(const raw of h.do){
            const p=evaluateProtocolExpression(raw,ctx,d),a={...p,writer:W,eventId:ctx.eventId,engine:e};
            if(p.op==='holding.close'){
                if(p.kind){
                    for(const edge of aliveHoldings(d,{kind:p.kind,holder:r.holder}).filter(edge=>!p.filter||condition({when:p.filter},{...ctx,...edge,host:r.subject},e,d)))closeHolding(d,{...a,id:edge.id,reason:p.reason??'vacated'});
                }else closeHolding(d,{...a,id:p.id??r.id,reason:p.reason??ctx.reason??'vacated'});
            }
            else if(p.op==='holding.open')openHolding(d,a);
            else if(p.op==='holding.transfer')transferHolding(d,{...a,id:p.id??r.id});
            else if(p.op==='transfer')transfer(d,a);
            else if(p.op==='emit')emit(d,e,{...p,entity:ctx.entity,id:p.id??`${ctx.eventId}:${h.id}`,cause:ctx.eventId});
            else if(p.op==='fact.set')executeProtocolPrimitive(d,e,p,ctx);
            else if(p.op==='transition')transition(d,e,p);
            else executeProtocolPrimitive(d,e,p,ctx);
        }
    }
}
function conquest(d,e,r,previous,ctx){
    if(r.kind!=='governs')return;
    const clause=ctx.conquest??{governance:'dissolve',treasury:'seize',fief:'retain_disputed'};
    // Location ancestry makes this work for subtrees as well as the seat itself.
    const within=x=>{const seen=new Set();while(x&&!seen.has(x)){if(x===r.subject)return true;seen.add(x);x=e.byId?.get(x)?.parent??read(d,'state','created',x)?.parent;}return false;};
    const related=h=>within(h.subject)||(['permit','banished','wanted'].includes(h.kind)&&h.holder===previous&&within(h.terms?.jurisdiction??body(d,h.subject)?.location??e.byId?.get(h.subject)?.location));
    for(const h of sorted(aliveHoldings(d).filter(h=>h.id!==r.id&&related(h)))){
        hooks(d,e,h,'subject.transferred(governs)',{...ctx,newHolder:r.holder,previous});
        if(h.kind==='administers'&&clause.governance!=='retain'){
            transition(d,e,{entity:h.holder,basis:'dissolution',origin:'dissolution',causes:[ctx.eventId],successors:[r.holder],treasury:clause.treasury==='seize'?r.holder:undefined});
            if(clause.governance?.replace)openHolding(d,{kind:'administers',holder:clause.governance.replace,subject:h.subject,writer:W,engine:e});
        }else if(h.kind==='fief')action(d,e,h,clause.fief??'retain_disputed',ctx);
        else if(['permit','banished','wanted'].includes(h.kind)&&h.holder===previous)action(d,e,h,'revert',{...ctx,reason:'conquest'});
    }
}
export function changeHolding(d,engine,{op='close',id,...input}){
    return atomic(d,()=>{
        if(op==='rescale'){
            ensureHoldings(d,engine);
            const eventId=input.eventId??`holding:rescale:${input.subject}:${now(d)}`;
            const result=rescaleHolding(d,{...input,writer:W,engine,eventId});
            invariant(d,null,engine);
            emit(d,engine,{id:eventId,verb:'holding_rescaled',subject:input.subject,kind:input.kind,shares:input.shares,reason:'rescaled'});
            return result;
        }
        ensureHoldings(d,engine);const before=id?holdingRow(d,id):null;
        const eventId=input.eventId??`holding:${op}:${id??read(d,'holdings','seq')+1}:${now(d)}`,reason=input.reason??(op==='close'?'vacated':op==='open'?'opened':'transferred');
        const ctx={...input,entity:before?.holder,eventId,reason};
        let result;
        if(op==='open')result=openHolding(d,{...input,writer:W,engine,eventId,reason});
        else if(op==='close'){
            if(!before)throw Error(`Holding not found: ${id}`);
            const handover=reason==='vacated'?holdingKind(before.kind)?.handover.vacated:null;
            if(handover&&!['vacate','close','stay'].includes(handover))action(d,engine,before,handover,{...ctx,reason});
            if(holdingRow(d,id).until===undefined)closeHolding(d,{id,reason,writer:W,eventId});
            // The closed edge still invokes its own vacancy notification.
            if(reason==='vacated'&&holdingKind(before.kind)?.handover.vacated==='vacate'){
                emit(d,engine,{id:`${eventId}:vacancy`,verb:'succession',entity:before.subject,subject:before.subject,previousHolder:before.holder,holding:before.id,kind:before.kind,reason,cause:eventId,rule:before.terms?.succession??entityRow(d,before.subject)?.facts?.succession??'vacant_until_claimed'});
            }
            hooks(d,engine,before,`self.closed(${reason})`,ctx);
            if(before.kind==='member_of'&&reason==='defected')for(const r of sorted(aliveHoldings(d,{holder:before.holder}))){
                action(d,engine,r,holdingKind(r.kind)?.handover.defected,ctx);
                hooks(d,engine,r,'holder.holdingClosed(member_of, defected)',ctx);
            }
            result=id;
        }else if(op==='transfer'){
            result=transferHolding(d,{...input,id,writer:W,engine,eventId,reason});
            conquest(d,engine,holdingRow(d,result),before.holder,ctx);
            if(before.kind!=='governs')for(const h of aliveHoldings(d,{subject:before.subject}))hooks(d,engine,h,`subject.transferred(${before.kind})`,ctx,'subject');
        }else throw Error(`Unknown holding operation ${op}`);
        const row=op==='close'?before:holdingRow(d,result);
        invariant(d,null,engine);emit(d,engine,{id:eventId,verb:`holding_${op==='open'?'opened':op==='close'?'closed':'transferred'}`,entity:row.holder,holder:row.holder,subject:row.subject,kind:row.kind,variant:row.variant,reason});
        return result;
    });
}

// Compatibility boundary: close the selected edges through the protocol, then
// write the old fields in the same transaction. It never closes an agent.
export function changeLegacyHoldings(d,engine,{holder,subject,source,kinds,reason='vacated',eventId},legacy){
    return atomic(d,()=>{
        ensureHoldings(d,engine);
        const rows=sorted(aliveHoldings(d,{holder,subject}).filter(h=>(!source||h.source===source||source.startsWith('contract:')&&h.source===`contract:row|${source.slice(9)}`)&&(!kinds||kinds.includes(h.kind))));
        for(const h of rows)changeHolding(d,engine,{op:'close',id:h.id,reason,eventId:eventId?`${eventId}:${h.id}`:undefined});
        const result=legacy();
        invariant(d,null,engine);
        return result;
    });
}

// The same hooks field handles event subscriptions; unsupported RX never
// silently evaluates true. Only candidate kinds are queried, avoiding a scan
// over every holding for ordinary world events.
export function dispatchProtocolEvent(d,engine,event){
    if(event.verb==='judgment'){
        const result=applyProtocolJudgment(d,engine,event);if(!result||result.replayed)return;
        event={...event,kind:read(d,'state','records',event.case,'judgment','effect'),successor:result.successor??result.id};
    }
    const affected=event.entity??event.target??event.actor;
    const matches=on=>{
        if(typeof on!=='string'||!on.startsWith('event('))return false;
        const selector=on.slice(6,-1).split(',')[0].trim(),[verb,...detail]=selector.split(':');
        return verb===event.verb&&(!detail.length||detail.join(':')===(event.thresholdId??[event.kind,event.variant].filter(Boolean).join(':')));
    };
    const types=templatesOf(d,affected,engine)??[],entityHooks=[...templates.filter(t=>types.includes(t.id)).flatMap(t=>t.hooks??[]),...engine.byId?.get(affected)?.hooks??[],...body(d,affected)?.hooks??[]].filter(h=>matches(h.on));
    const obligationHooks=Object.values(read(d,'state','obligations')??{}).filter(o=>!terminal(o)&&[o.debtor,o.promisor,o.creditor,o.promisee].includes(affected)&&o.hooks?.some(h=>matches(h.on)));
    const candidates=[];
    for(const kind of holdingKindIds())for(const h of holdingKind(kind).hooks??[]){
        if(!h.on.startsWith('event('))continue;
        const [selector,filter]=h.on.slice(6,-1).split(',').map(x=>x.trim());
        const [verb,...detail]=selector.split(':');if(verb!==event.verb)continue;
        const actual=event.thresholdId??[event.kind,event.variant].filter(Boolean).join(':');
        if(detail.length&&detail.join(':')!==actual)continue;
        candidates.push({kind,on:h.on,filter});
    }
    if(!candidates.length&&!entityHooks.length&&!obligationHooks.length)return;
    atomic(d,()=>{
        for(const on of new Set(entityHooks.map(h=>h.on)))hooks(d,engine,{holder:affected,subject:affected},on,{entity:affected,eventId:event.id,event},'holder',entityHooks);
        for(const o of obligationHooks)for(const on of new Set(o.hooks.filter(h=>matches(h.on)).map(h=>h.on)))hooks(d,engine,{holder:o.debtor??o.promisor,subject:o.creditor??o.promisee,id:o.id},on,{entity:affected,eventId:event.id,event,obligation:o},'holder',o.hooks);
        for(const c of candidates)for(const r of aliveHoldings(d,{kind:c.kind})){
            if(c.filter==='entity:holder'&&r.holder!==affected||c.filter==='entity:subject'&&r.subject!==affected||c.filter==='target:holder'&&r.holder!==affected)continue;
            hooks(d,engine,r,c.on,{entity:affected,eventId:event.id,event,insolvency:event.kind==='insolvency',reason:'vacated',successor:event.successor,location:event.location});
        }
        invariant(d);
    });
}
function dispatchProtocolEvents(d,engine,events){for(const event of events)dispatchProtocolEvent(d,engine,event);}
registerWorldEventSubscriber({id:'transition_hooks',order:0,on:(d,engine,events)=>dispatchProtocolEvents(d,engine,events)});

// A judgment event carries a case reference, never authority supplied by a rumor.
export function applyProtocolJudgment(d,e,event){
    const row=read(d,'state','records',event.case),judgment=row?.judgment;
    if(row?.category!=='legal_case'||row.status!=='已裁定'||!judgment||judgment.eventId!==event.id)return;
    const entity=row.subject??row.offender,effect=judgment.effect;
    if(!['declared','declaration_revoked','insolvency','inheritance_distribution'].includes(effect))return;
    const done=read(d,...root,'judgments',event.id);if(done)return {...done,replayed:true};
    return atomic(d,()=>{
        let result;
        if(effect==='inheritance_distribution'){
            const id=row.procedure?.estate,p=read(d,...root,'procedures',id);
            if(!p||p.case!==event.case||!p.frozen)throw Error('Judgment does not resolve this inheritance case');
            for(const h of aliveHoldings(d,{kind:'frozen',holder:p.case}))closeHolding(d,{id:h.id,reason:'vacated',writer:W,eventId:event.id});
            updateEntity(d,{id:p.case,facts:{status:'closed'},writer:W,eventId:event.id});
            d.set([...root,'procedures',id],{...p,frozen:false,caseResolved:true,successors:judgment.procedure?.successors??p.successors,nextAt:now(d)});
            result=advanceProcedure(d,e,id);
        }else if(effect==='declaration_revoked')result=restoreTransition(d,e,{entity,origin:'declaration_revoked',eventId:`${event.id}:restored`,law:judgment.law});
        else if(effect==='insolvency'&&templatesOf(d,entity,e)?.includes('agent'))result=personalInsolvency(d,e,{entity,eventId:event.id,...judgment.procedure});
        else result=transition(d,e,{...judgment.procedure,entity,basis:effect,origin:effect==='declared'?'declaration_judgment':'insolvency_judgment',eventId:`${event.id}:transition`,causes:[event.id]});
        d.set([...root,'judgments',event.id],{entity,effect,eventId:event.id});return result??{entity,effect};
    });
}
function personalInsolvency(d,e,{entity,eventId,exemptAmount=0,discharge=false,...input}){
    const id=`liq_${entity}:${eventId}`;
    if(!Number.isSafeInteger(exemptAmount)||exemptAmount<0)throw Error('Invalid bankruptcy exemption');
    createEntity(d,{id,kind:'liquidation',facts:{of:entity,phase:'notice'},writer:W,eventId});
    for(const h of aliveHoldings(d,{holder:entity}))if(holdingKind(h.kind).handover.gone==='estate'&&!h.terms?.exempt){
        const ctx={entity,eventId,successor:id,insolvency:true,reason:'transferred'};
        hooks(d,e,h,'event(judgment:insolvency,target:holder)',ctx);
        if(holdingRow(d,h.id)?.until===undefined)action(d,e,h,'estate',ctx);
    }
    let exempt=exemptAmount;
    for(const [key,n]of Object.entries(read(d,'ledger','accounts')??{}).sort(([a],[b])=>a.localeCompare(b))){
        const ac=parseAccount(key);if(ac.owner!==entity||!n)continue;
        const keep=ac.resource==='coin_river'?Math.min(exempt,n):0;exempt-=keep;
        if(n>keep)transfer(d,{from:key,to:accountKey(id,ac.resource,ac.purpose),amount:n-keep,writer:W,eventId});
    }
    for(const [oid,o]of Object.entries(read(d,'state','obligations')??{}))if(!terminal(o)&&[o.debtor,o.promisor].includes(entity)){
        const n={...o,bankruptcyOf:entity,goneRoute:'accelerate'};for(const k of ['debtor','promisor'])if(n[k]===entity)n[k]=id;d.set(['state','obligations',oid],n);
    }
    const p={...input,id,entity,phase:'notice',nextAt:now(d),durations:input.durations??{},successors:[entity],bankrupt:entity,discharge,eventId,registeredSeq:d.scheduler?.nextSeq()??0};
    d.set([...root,'procedures',id],p);writeRecord(d,e,`transition_procedure:${id}`,{category:'transition_procedure',...p});
    if(aliveHoldings(d,{holder:entity}).some(h=>holdingKind(h.kind).handover.gone==='estate'&&!h.terms?.exempt))throw Error('I6 bankruptcy property remains');
    let balance=0;
    for(const [key,n]of Object.entries(read(d,'ledger','accounts')??{})){const ac=parseAccount(key);if(ac.owner!==entity||!n)continue;if(ac.resource!=='coin_river')throw Error('I6 bankruptcy stock remains');balance+=n;}
    if(balance>exemptAmount)throw Error('I6 bankruptcy exemption exceeded');
    invariant(d,null,e);return p;
}

// Explicit origins prevent rumor/belief producers from invoking legal transitions.
const origins={death:['vital','death_rule'],dissolution:['dissolution'],destruction:['destruction'],extinction:['extinction'],declared:['declaration_judgment'],insolvency:['insolvency_judgment'],rested:['rested'],reborn:['reborn'],aggregated:['aggregated'],pack_removed:['pack_uninstall']};
export function transition(d,engine,input){
    const {entity,basis,origin,kind='gone'}=input;
    if(kind!=='gone'||!GONE_BASES.includes(basis)||!origins[basis]?.includes(origin))throw Error('I26: unsupported transition source');
    return atomic(d,()=>{
        if(!ensureHoldings(d,engine)&&read(d,'holdings')===undefined)d.set(['holdings'],openHoldings(engine,d.document));
        if(!read(d,'ledger'))d.set(['ledger'],openLedger(engine,d.document));
        importRecordedClaims(d,engine,entity);
        const generation=input.generation??body(d,entity)?.incarnation??byEntity(d,entity)?.generation??0;
        const previous=byEntity(d,entity);
        if(previous&&generation<previous.generation)throw Error('An earlier instance generation cannot be reused');
        const actualDeath=previous?.gone&&previous.generation===generation&&previous.basis==='declared'&&basis==='death'&&previous.actualDeath===undefined;
        if(previous?.gone&&previous.generation===generation&&!actualDeath)return previous;
        const cycle=previous?.generation===generation?(previous.cycle??0)+1:0;
        const eventId=input.eventId??`transition:${entity}:${generation}:${cycle}:${basis}:${now(d)}`;
        const held=sorted(aliveHoldings(d,{holder:entity})),subject=aliveHoldings(d,{subject:entity});
        const a=body(d,entity)??engine.byId?.get(entity)??{},types=templatesOf(d,entity,engine)??[];
        if(!types.length)throw Error(`Missing entity: ${entity}`);
        if(['death','declared','rested','reborn'].includes(basis)&&!types.includes('agent'))throw Error('This basis requires an agent');
        if(['dissolution','insolvency'].includes(basis)&&!types.includes('collective'))throw Error('This basis requires an organization');
        const location=input.location??locationOf(d,entity)?.at??a.location??engine.byId?.get(entity)?.parent;
        const inherit=input.inheritance??a.inheritance??engine.byId?.get(a.species)?.inheritance??(read(d,'state','creatures',entity)?false:templates.find(t=>types.includes(t.id))?.inheritance===true);
        const estate=types.includes('agent')&&inherit&&['death','declared','rested','reborn'].includes(basis);
        const liquidation=types.includes('collective')&&['dissolution','insolvency'].includes(basis);
        const corpse=types.includes('agent')&&basis==='death';
        const debris=['destruction','extinction'].includes(basis)&&!input.consumed;
        const nativeOwner=input.owner??[a.owner,...subject.filter(h=>['owns','tamed_by'].includes(h.kind)).map(h=>h.holder)].find(id=>live(d,engine,id));
        const owner=nativeOwner??(types.includes('agent')&&!inherit?publicRecipient(d,engine,entity,location,input.law??{}):null);
        const suffix=`${generation}${cycle?`:${cycle}`:''}`;
        const affectedObligations=Object.values(read(d,'state','obligations')??{}).some(o=>!terminal(o)&&[o.debtor,o.promisor,o.creditor,o.promisee].includes(entity));
        const successor=actualDeath?previous.successor:estate?(input.successor??`estate_${entity}:${suffix}`):liquidation||affectedObligations?(input.successor??`liq_${entity}:${suffix}`):null;
        const wreck=corpse||debris?`wreck_${entity}:${suffix}`:null;
        const record=clean({category:'transition',entity,generation,cycle,basis,eventId,gone:true,minute:now(d),successor,wreck,location,previousVital:a.status,holdings:[...new Set([...actualDeath?previous.holdings:[],...held.map(r=>r.id)])],subjectHoldings:[...new Set([...actualDeath?previous.subjectHoldings:[],...subject.map(r=>r.id)])],identities:identities(engine,read(d,'state'),entity),successors:input.successors??previous?.successors??[],phase:'transitioning',body:corpse,yields:a.yields??engine.byId?.get(a.species)?.yields??[],...(actualDeath?{actualDeath:now(d),declarationEvent:previous.eventId}: {})});
        record.officeFacts=Object.entries(read(d,'state','records')??{}).filter(([,o])=>o.category==='governance_office'&&o.holder===entity).map(([id,o])=>clean({id,since:o.since,sourceEvent:o.sourceEvent}));
        d.set([...root,'entities',entity],record);
        writeRecord(d,engine,`transition:${entity}`,record);
        const source=`transition:${entity}`;
        const parent=emit(d,engine,{id:eventId,verb:'transition',entity,kind,basis,causes:input.causes??[],location,visibility:input.visibility??'public'});
        if(successor&&!entityRow(d,successor))createEntity(d,{id:successor,kind:estate?'estate':'liquidation',facts:{of:entity,phase:'notice'},source,writer:W,origin:'protocol'});
        if(wreck&&!entityRow(d,wreck)){
            createEntity(d,{id:wreck,kind:'wreck',facts:{of:entity,body:corpse,yields:record.yields},source,writer:W,origin:'protocol'});
            if(location)setLocation(d,{entity:wreck,at:location,mode:'place',source,writer:W,engine});
        }
        const ctx={...input,entity,eventId,successor:successor??input.successor,location,owner,reason:'transferred'};
        const civil=input.law??legalCodeAt(engine,location,read(d,'state'))?.civil?.inheritance??{};
        const entityHooks=[...templates.filter(t=>types.includes(t.id)).flatMap(t=>t.hooks??[]),...engine.byId?.get(entity)?.hooks??[],...a.hooks??[]];
        hooks(d,engine,{holder:entity,subject:entity},`holder.gone(${basis})`,ctx,'holder',entityHooks);
        // Personal appointments terminate by their declaration, before the
        // compatibility receipt is made. The domain no longer performs handover.
        for(const [id,o]of Object.entries(read(d,'state','obligations')??{})){
            if(o.reservationVersion!==1||terminal(o)||!['待履行','进行中'].includes(o.status))continue;
            const debtor=[o.debtor,o.promisor].includes(entity),creditor=[o.creditor,o.promisee].includes(entity);
            if(!(debtor&&obligationGoneRoute(o,'debtor',civil)==='void'||creditor&&obligationGoneRoute(o,'creditor',civil)==='void'))continue;
            const receipt=input.legacyReceipt?.replace(/^estate_/,''),cause=input.causes?.[0]??basis;
            d.set(['state','obligations',id],{...snapshotObligationTerms(o),status:'取消',reason:`${a.name??engine.byId?.get(entity)?.name??entity}已${cause}，约定终止`,resolvedAt:now(d),...(receipt?{endedByDeath:receipt}:{}),resolution:{kind:'void',cause:eventId,minute:now(d)}});
        }
        input.legacy?.(d);
        // Keep the old closed settlement receipt addressable during dual write.
        // Protocol references use the live procedural estate, never that receipt.
        if(input.legacyReceipt&&successor)d.set([...root,'aliases',input.legacyReceipt],successor);
        if(basis==='death'){
            const path=entity==='player'?['state','player']:read(d,'state','npcs',entity)?['state','npcs',entity]:read(d,'state','creatures',entity)?['state','creatures',entity]:null;
            if(path){d.set([...path,'status'],'死亡');d.set([...path,'diedAt'],now(d));if(a.hp!==undefined)d.set([...path,'hp'],0);}
        }
        // Frozen agents cannot retain live travel tasks or autonomy bookings.
        for(const partition of ['npcs','creatures'])if(read(d,'state',partition,entity))for(const field of ['scheduleTravel','cognitionTravel','caring'])if(read(d,'state',partition,entity,field))d.remove(['state',partition,entity,field]);
        for(const [id,task]of Object.entries(read(d,'state','npcAutonomy','tasks')??{}))if(task.npc===entity&&!['completed','cancelled','已完成','已取消'].includes(task.status))d.set(['state','npcAutonomy','tasks',id],{...task,status:'已取消',endedAt:now(d),cause:eventId});
        for(const task of recordsWhere(read(d,'state','records')??{},'category','protocol_schedule'))if(task.status==='pending'&&task.context?.entity===entity){
            const anchor=successor??wreck??input.owner;if(!anchor)throw Error('No successor for protocol schedule');
            writeRecord(d,engine,task.id,{...task,context:{...task.context,entity:anchor}});
        }
        for(const r of held){hooks(d,engine,r,`holder.gone(${basis})`,ctx);action(d,engine,holdingRow(d,r.id),holdingKind(r.kind).handover.gone,ctx);}
        for(const r of subject){hooks(d,engine,r,`subject.gone(${basis})`,ctx,'subject');action(d,engine,holdingRow(d,r.id),holdingKind(r.kind).onSubjectGone,{...ctx,successor:successor??wreck},'subject');}
        routeContracts(d,engine,entity,successor,ctx);
        for(const [id,l] of Object.entries(read(d,'holdings','locations')??{}))if(l.at===entity){
            if(!wreck&&!location)throw Error('No destination for contained objects');
            setLocation(d,{entity:id,at:wreck??location,mode:wreck?'container':'place',writer:W,engine});
        }
        clearLocation(d,{entity,writer:W});
        moveDeposits(d,engine,entity,successor??owner,eventId);
        for(const [key,amount] of Object.entries(read(d,'ledger','accounts')??{})){
            const ac=parseAccount(key);if(ac.owner!==entity||!amount)continue;
            const salvage=Math.max(0,Math.min(1,input.salvage?.[ac.resource]??a.salvage?.[ac.resource]??0));
            const saved=debris?Math.floor(amount*salvage):amount;
            const to=input.treasury??successor??input.successor??(debris?wreck:owner);
            if(saved&&!to&&basis!=='pack_removed')throw Error('No account successor');
            if(saved)bookTransfer(d,engine,{from:key,to:accountKey(basis==='pack_removed'?'sink:pack_removed':to,ac.resource,ac.purpose),amount:saved,writer:W,eventId});
            if(amount>saved)bookTransfer(d,engine,{from:key,to:accountKey('sink:destroy',ac.resource,'destruction'),amount:amount-saved,writer:W,eventId});
        }
        for(const [id,o] of Object.entries(read(d,'state','obligations')??{})){
            if(['void','cancelled','settled','取消','已完成'].includes(o.status))continue;
            const debtor=o.debtor===entity||o.promisor===entity,creditor=o.creditor===entity||o.promisee===entity,carrier=o.carrier===entity;
            if(!debtor&&!creditor&&!carrier)continue;
            hooks(d,engine,{holder:o.debtor??o.promisor,subject:o.creditor??o.promisee,id},debtor?`holder.gone(${basis})`:`subject.gone(${basis})`,{...ctx,obligation:o},'holder',o.hooks??[]);
            const next={...snapshotObligationTerms(o)};
            if(carrier){next.carrier=wreck??successor;next.shortfallAt=now(d);emit(d,engine,{id:`${eventId}:shortfall:${id}`,verb:'shortfall',entity,cause:eventId,obligation:id});}
            if(debtor){
                const route=obligationGoneRoute(o,'debtor',civil);
                const target=route==='pursue'?input.soul??a.soul??Object.entries(read(d,'state','npcs')??{}).find(([id,n])=>n.soulOf===entity&&live(d,engine,id))?.[0]:successor;
                if(route==='void'||route==='pursue'&&!target){next.status='void';next.resolvedAt=now(d);next.goneRoute=route;next.resolutionReason=route==='pursue'?'no_soul_or_reincarnation':'onDebtorGone:void';emit(d,engine,{id:`${eventId}:void:${id}`,verb:'protocol_stage',entity,obligation:id,phase:'obligation_routed',route,reason:next.resolutionReason,cause:eventId});}
                else if(!target||!live(d,engine,target))throw Error(`No living ${route} obligation successor: ${id}`);
                else{if(o.debtor===entity)next.debtor=target;if(o.promisor===entity)next.promisor=target;next.goneRoute=route;if(route==='accelerate')next.acceleratedAt=now(d);}
            }
            if(creditor){
                const route=obligationGoneRoute(o,'creditor',civil),target=successor;
                if(route==='void'){next.status='void';next.resolvedAt=now(d);}
                else if(!target)throw Error(`No creditor successor: ${id}`);
                else{if(o.creditor===entity)next.creditor=target;if(o.promisee===entity)next.promisee=target;next.creditorGoneRoute=route;}
            }
            d.set(['state','obligations',id],next);
            if(debtor&&o.pledgeRecord){const pledge=read(d,'state','records',o.pledgeRecord);if(pledge?.owner===entity)writeRecord(d,engine,o.pledgeRecord,{...pledge,owner:next.debtor??next.promisor});}
            if(creditor&&next.creditorGoneRoute==='heirs'&&!terminal(next)){
                const plan=inheritancePlan(d,engine,{...input,entity,location});
                if(!plan.disputed&&!plan.heirs.some(h=>h.noHeir)){
                    const parts=allocation(next.remaining??next.amount??next.coins,plan.heirs).filter(p=>p.amount);
                    const principal=allocation(next.amount??next.coins,plan.heirs),paid=allocation(next.paid??0,plan.heirs);
                    for(const [i,part]of parts.entries()){
                        const n={...next,id:i?`${id}:heir:${part.heir}`:id,amount:principal.find(p=>p.heir===part.heir).amount,paid:paid.find(p=>p.heir===part.heir).amount,remaining:part.amount};
                        if(next.legacyRecord){n.originalLegacyRecord=next.legacyRecord;n.legacyRecord=i?`${next.legacyRecord}:heir:${part.heir}`:next.legacyRecord;}
                        for(const k of ['creditor','promisee'])if(n[k]===successor)n[k]=part.heir;
                        d.set(['state','obligations',n.id],n);
                    }
                }
            }
        }
        syncRecordedClaims(d,engine);
        const tombstone={...record,phase:'gone'};d.set([...root,'entities',entity],tombstone);
        writeRecord(d,engine,`transition:${entity}`,tombstone);
        d.set([...root,'tombstones',`${entity}:${generation}`],tombstone);
        d.set([...root,'history',`${entity}:${generation}:${cycle}`],tombstone);
        if(entityRow(d,entity))endEntity(d,{id:entity,basis,writer:W,eventId});
        invariant(d,entity,engine);
        if(successor&&(!actualDeath||read(d,...root,'procedures',successor)?.phase==='closed'&&(aliveHoldings(d,{holder:successor}).length||Object.entries(read(d,'ledger','accounts')??{}).some(([k,n])=>parseAccount(k).owner===successor&&n)))){
            const preceding=actualDeath?read(d,...root,'procedures',successor):null;
            const propertyOwners={};for(const h of held.filter(h=>h.kind==='owns'))propertyOwners[h.subject]=Object.fromEntries(aliveHoldings(d,{kind:'owns',subject:h.subject}).filter(x=>x.holder!==successor).map(x=>[x.holder,x.terms.share]));
            const phase=clean({propertyOwners,id:successor,entity,phase:'notice',nextAt:now(d)+(input.durations?.notice??0),durations:input.durations??{},successors:input.successors??preceding?.successors,eventId,registeredSeq:parent.seq??0,law:input.law??preceding?.law,location,escrowCustodian:input.escrowCustodian,kin:[...held,...subject].filter(h=>h.kind==='kin'),...(preceding?{previousDistributions:[...preceding.previousDistributions??[],...preceding.distribution?[preceding.distribution]:[]]}:{})});
            d.set([...root,'procedures',successor],phase);
            writeRecord(d,engine,`transition_procedure:${successor}`,{category:'transition_procedure',...phase});
        }
        configureEstate(d,engine,tombstone,input);
        return tombstone;
    });
}

registerLifecycleProtocol(transition);

const phases=['notice','filing','settlement','distribution','closed'];
// Recorded debts are projections of one claim, identified by record id or an
// explicit link. Equal amounts alone never identify the same debt.
function importRecordedClaims(d,e,entity){
    for(const [id,row]of Object.entries(read(d,'state','records')??{})){
        if(row.category!=='debt'||![row.debtor,row.creditor].includes(entity)||['已还清','坏账','已取消'].includes(row.status))continue;
        const entries=Object.entries(read(d,'state','obligations')??{});
        const found=entries.find(([key,o])=>key===id||key===row.obligation||o.legacyRecord===id||o.record===id);
        const key=found?.[0]??id,old=found?.[1];
        const claim=snapshotObligationTerms({...row,...old,id:key,kind:old?.kind??row.kind??'compensation',legacyRecord:id,
            amount:old?.amount??row.amount,paid:old?.paid??row.paid??0,remaining:old?.remaining??row.amount-(row.paid??0),
            status:old?.status??'pending'});
        // The record's signed route is retained when importing old documents.
        claim.clauses??=row.clauses;
        d.set(['state','obligations',key],claim);
    }
}
function syncRecordedClaims(d,e){
    for(const o of Object.values(read(d,'state','obligations')??{})){
        if(!o.legacyRecord)continue;
        const old=read(d,'state','records',o.legacyRecord)??read(d,'state','records',o.originalLegacyRecord);if(!old)continue;
        const status=o.status==='settled'?'已还清':o.status==='bad_debt'?'坏账':['void','cancelled'].includes(o.status)?'已取消':old.status;
        writeRecord(d,e,o.legacyRecord,{...old,debtor:o.debtor,creditor:o.creditor,amount:o.inheritanceFrom&&o.terms?.liabilityCap!==undefined?(o.paid??0)+(o.remaining??0):o.amount,contractualAmount:o.amount,paid:o.paid??0,status,
            ...(o.badDebt?{badDebt:{remaining:o.badDebt,minute:now(d)}}:{}),obligation:o.id,substitutedAt:now(d),
            ...(terminal(o)?{settledBy:o.cause??o.resolvedAt,paidAt:o.resolvedAt}:{}),
            clauses:{...old.clauses,onDebtorGone:obligationGoneRoute(o,'debtor'),onCreditorGone:obligationGoneRoute(o,'creditor')}});
    }
}
function ensureEstateAssets(d,id,e=d.engine){
    const key=`protocol_assets:${id}`;
    if(!read(d,'state','records',key))projectFields(d,e,['state','records',key],{category:'protocol_assets',owner:id,coins:0,inventory:{}});
    return key;
}
function accountProjection(d,e,key){
    const a=parseAccount(key),s=read(d,'state');
    if(a.owner.startsWith('src:')||a.owner.startsWith('sink:'))return null;
    const estate=read(d,'state','records',`protocol_assets:${a.owner}`);
    if(a.resource==='coin_river'){
        if(a.purpose==='treasury'&&s.settlements?.[a.owner])return ['state','settlements',a.owner,'treasury'];
        if(estate)return ['state','records',`protocol_assets:${a.owner}`,a.purpose==='purse'?'coins':'funds',...(a.purpose==='purse'?[]:[a.purpose])];
        if(a.purpose==='purse')return a.owner==='player'?['state','player','coins']:s.npcs?.[a.owner]?['state','npcs',a.owner,'coins']:s.creatures?.[a.owner]?['state','creatures',a.owner,'coins']:null;
        if(a.purpose==='vault'&&s.records?.[a.owner]?.category==='bank')return ['state','records',a.owner,'coins'];
        if(a.purpose==='treasury'&&s.settlements?.[a.owner])return ['state','settlements',a.owner,'treasury'];
    }else if(a.purpose==='inventory'){
        if(estate)return ['state','records',`protocol_assets:${a.owner}`,'inventory',a.resource];
        if(a.owner==='player')return ['state','inventory',a.resource];
        for(const part of ['npcs','creatures'])if(s[part]?.[a.owner])return ['state',part,a.owner,'inventory',a.resource];
    }
    return null;
}
function bookTransfer(d,e,args){
    const from=parseAccount(args.from),to=parseAccount(args.to);
    const original=accountProjection(d,e,args.from),v=original&&read(d,...original),n=typeof v==='number'?v:v?.quantity??0;
    const mirrored=n>=args.amount;
    if(mirrored&&!accountProjection(d,e,args.to)&&live(d,e,to.owner))ensureEstateAssets(d,to.owner,e);
    transfer(d,args);
    if(!mirrored)return;
    const change=(path,delta)=>{if(!path)return;const old=read(d,...path),value=(typeof old==='number'?old:old?.quantity??0)+delta;
        d.set(path,old&&typeof old==='object'?{...old,quantity:value}:value);};
    change(original,-args.amount);
    const dest=accountProjection(d,e,args.to);
    if(dest)change(dest,args.amount);
    else if(to.resource==='coin_river'&&to.purpose==='treasury')mirrorPartyCoins(d,e,to.owner,args.amount,args.eventId,W);
    // Transfer the corresponding instances, not every copy of this resource.
    if(from.purpose==='inventory'&&to.purpose==='inventory'&&v?.instances?.length){
        const moved=v.instances.slice(0,args.amount),source=read(d,...original),target=read(d,...dest);
        d.set(original,{...source,instances:v.instances.filter(id=>!moved.includes(id))});
        d.set(dest,{...(typeof target==='number'?{quantity:target}:target),instances:[...target?.instances??[],...moved]});
        for(const id of moved){
            const unit=read(d,'state','itemInstances',id);if(!unit)throw Error(`Missing inventory instance: ${id}`);
            const next={...unit,owner:to.owner};
            if(templatesOf(d,to.owner,e)?.includes('agent'))delete next.container;
            else next.container=locationOf(d,id)?.at;
            holdingSet(d,e,['state','itemInstances',id],next,W,args.eventId);
        }
    }
}
function moveDeposits(d,e,from,to,eventId){
    if(!to)return;
    for(const [id,row]of Object.entries(read(d,'state','records')??{}))if(row.category==='bank'&&row.accounts?.[from]){
        const accounts={...row.accounts,[to]:(row.accounts[to]??0)+row.accounts[from]};delete accounts[from];
        writeRecord(d,e,id,{...row,accounts});
    }
}
function splitDeposits(d,e,from,heirs,eventId){
    for(const [id,row]of Object.entries(read(d,'state','records')??{}))if(row.category==='bank'&&row.accounts?.[from]){
        const accounts={...row.accounts};delete accounts[from];
        for(const part of allocation(row.accounts[from],heirs))accounts[part.heir]=(accounts[part.heir]??0)+part.amount;
        writeRecord(d,e,id,{...row,accounts});
    }
}
function projectProperty(d,subject,owners,e=d.engine){
    const old=read(d,'state','buildings',subject);if(!old)return;
    projectFields(d,e,['state','buildings',subject],{...old,owners,owner:Object.keys(owners).length===1?Object.keys(owners)[0]:null});
}
function projectHolding(d,e,before,after,ctx){
    if(before.kind==='holds_office'){
        const office=entityRow(d,before.subject);
        for(const [id,row]of Object.entries(read(d,'state','records')??{})){
            if(row.holder!==before.holder)continue;
            if(!(row.category==='title'&&before.source===`title:${id}`||row.category==='governance_office'&&row.office===office?.facts?.office&&row.settlement===office?.facts?.settlement))continue;
            projectFields(d,e,['state','records',id],{...row,...(after?{holder:after.holder,previousHolder:before.holder,inheritedAt:now(d)}:{status:row.category==='title'?'已除爵':'已免职',removedAt:now(d)})});
        }
    }
    if(before.kind==='owns'){
        const owners={};for(const h of aliveHoldings(d,{kind:'owns',subject:before.subject}))owners[h.holder]=(owners[h.holder]??0)+(h.terms?.share??1);
        projectProperty(d,before.subject,owners);
    }
    if(before.kind==='operates'){
        const shop=read(d,'state','records',before.subject);
        if(shop?.category==='business')projectFields(d,e,['state','records',before.subject],{...shop,owner:after?.holder??shop.owner,...(!after?{status:'封存',sealedAt:now(d),sealedBy:ctx.eventId}:{})});
    }
    if(before.kind==='tamed_by'){
        if(read(d,'state','creatures',before.subject))projectFields(d,e,['state','creatures',before.subject,'owner'],after?.holder??null);
        const pet=read(d,'state','pets',before.subject);if(pet)d.set(['state','pets',before.subject],{...pet,owner:after?.holder??null,following:false,...(!after?{status:'已解除',ended:now(d)}:{})});
    }
    if(before.kind==='employed_by'){
        const id=before.terms?.contract,row=id&&read(d,'state','records',id);if(!row)return;
        const next={...row,substitutedAt:now(d)};
        if(after){for(const field of ['owner','employer'])if(next[field]===before.subject)next[field]=after.subject;
            if(next.worker===before.holder)next.worker=after.holder;
            if(next.parties)next.parties=next.parties.map(x=>x===before.subject?after.subject:x===before.holder?after.holder:x);
        }else Object.assign(next,{status:'已终止',endedAt:now(d)});
        projectFields(d,e,['state','records',id],next);
    }
}
function distributeEmployments(d,e,id,heirs,p){
    const target=heirs.slice().sort((a,b)=>b.share-a.share||a.heir.localeCompare(b.heir))[0];
    for(const h of aliveHoldings(d,{kind:'employed_by',subject:id})){
        if(target.noHeir){closeHolding(d,{id:h.id,reason:'vacated',writer:W,eventId:p.eventId});projectHolding(d,e,h,null,p);}
        else{const hid=transferHolding(d,{id:h.id,subject:target.heir,writer:W,engine:e,eventId:p.eventId});projectHolding(d,e,h,holdingRow(d,hid),p);}
    }
    routeContracts(d,e,id,target.noHeir?null:target.heir,p);
}
function routeContracts(d,e,from,to,ctx){
    for(const [id,row]of Object.entries(read(d,'state','records')??{})){
        if(row.category!=='contract'||!(['owner','employer','worker','tenant','holder','issuer','partner'].some(k=>row[k]===from)||row.parties?.includes(from)))continue;
        const worker=row.worker===from||row.kind==='hire'&&row.parties?.[1]===from;
        const route=row.clauses?.[worker?'onWorkerGone':row.owner===from||row.employer===from?'onEmployerGone':'onHolderGone']??row.clauses?.onHolderGone??(worker?'terminate':'inherit');
        if(!['inherit','continue','terminate','void'].includes(route))throw Error(`Unknown contract gone route: ${route}`);
        if(!to||['terminate','void'].includes(route)||row.endedAt!==undefined||row.resolvedAt!==undefined){
            if(row.endedAt===undefined&&row.resolvedAt===undefined||row.escrow>0){
                if(row.escrow>0){
                    const recipient=row.kind==='employment'?row.employer:row.parties?.[0]??row.owner??'player';
                    const target=recipient===from?to??ctx.owner:recipient;
                    if(!target)throw Error(`Contract escrow has no recipient: ${id}`);
                    const key=accountKey(id,'coin_river','escrow');
                    transfer(d,{from:key,to:partyAccount(e,read(d,'state'),target),amount:row.escrow,writer:W,eventId:ctx.eventId});
                    mirrorPartyCoins(d,e,target,row.escrow,ctx.eventId,W);
                }
                projectFields(d,e,['state','records',id],{...row,status:'已终止',escrow:0,endedAt:row.endedAt??now(d),resolvedAt:row.resolvedAt??now(d),endCause:ctx.eventId});
            }
        }else{
            const next={...row,substitutedAt:now(d)};
            for(const field of ['owner','employer','worker','tenant','holder','issuer','partner'])if(next[field]===from)next[field]=to;
            if(next.parties)next.parties=next.parties.map(id=>id===from?to:id);
            projectFields(d,e,['state','records',id],next);
        }
    }
}
function projectEstateReceipt(d,e,id,p,receipts,rule){
    const allocations=receipts.map(r=>({heir:r.heir,coins:r.accounts.filter(a=>a.resource==='coin_river').reduce((n,a)=>n+a.amount,0),items:Object.fromEntries(r.accounts.filter(a=>a.resource!=='coin_river').map(a=>[a.resource,a.amount])),assets:[],propertyShares:{}}));
    for(const h of aliveHoldings(d,{kind:'owns'})){
        const a=allocations.find(a=>a.heir===h.holder);
        if(a&&receipts.find(r=>r.heir===h.holder)?.holdings.includes(h.id)){a.assets.push(h.subject);a.propertyShares[h.subject]=h.terms.share-(p.propertyOwners?.[h.subject]?.[h.holder]??0);}
    }
    // Pre-holdings equity documents have no issuer endpoint to adapt. Their
    // explicitly supported compatibility records still distribute here once.
    for(const [key,row]of Object.entries(read(d,'state','records')??{}))if(row.category==='equity'&&row.holder===p.entity&&row.status==='有效'){
        projectFields(d,e,['state','records',key],{...row,status:'已继承',inheritance:id});
        for(const r of receipts){const next=`${key}:inherit:${id}:${r.heir}`;projectFields(d,e,['state','records',next],{...row,id:next,holder:r.heir,share:row.share*r.share,stake:(row.stake??0)*r.share,distributed:(row.distributed??0)*r.share,inheritance:id});allocations.find(a=>a.heir===r.heir).assets.push(next);}
    }
    for(const [key,death]of Object.entries(read(d,'state','family','deaths')??{}))if(death.estate?.id===id){
        const guardianships=Object.values(read(d,'state','records')??{}).filter(r=>r.category==='guardianship'&&r.estate===id).map(r=>r.id);
        projectFields(d,e,['state','family','deaths',key],{...death,estate:{...death.estate,heir:receipts[0]?.heir??null,heirs:receipts.filter(r=>!r.noHeir).map(r=>r.heir),rule,allocations,propertyOwners:p.propertyOwners??{},guardianships,phase:'closed'}});
    }
}
function configureEstate(d,e,r,input){
    if(!r.successor||!['death','declared','rested','reborn'].includes(r.basis)||!(aliveHoldings(d,{holder:r.successor,kind:'operates'}).length||aliveHoldings(d,{subject:r.successor,kind:'employed_by'}).length)||!templatesOf(d,r.successor,e)?.includes('interim'))return;
    const key=ensureEstateAssets(d,r.successor,e),p=read(d,...root,'procedures',r.successor),plan=inheritancePlan(d,e,p??{entity:r.entity,location:r.location});
    const executor=plan.heirs.find(h=>!h.noHeir&&npcAgeAt(e,read(d,'state'),h.heir,now(d))>=18)?.heir??plan.heirs.filter(h=>!h.noHeir).flatMap(h=>guardianCandidates(e,read(d,'state'),h.heir,r.entity,now(d)))[0];
    projectFields(d,e,['state','records',key],{...read(d,'state','records',key),executor:executor??null,...(!executor?{sealedAt:now(d)}:{})});
    if(!executor)for(const h of aliveHoldings(d,{holder:r.successor,kind:'operates'})){closeHolding(d,{id:h.id,reason:'vacated',writer:W,eventId:r.eventId});projectHolding(d,e,h,null,r);}
}
const price=(e,resource)=>resource==='coin_river'?1:e.byId?.get(resource)?.basePrice??0;
function publicRecipient(d,e,entity,location,rule){
    const code=legalCodeAt(e,location,read(d,'state'));
    return rule.noHeir?.recipient??rule.escheatTo??[code?.treasury,code?.faction,code?.polity,npcHousehold(e,read(d,'state'),entity)?.settlement,code?.settlement,location].find(id=>live(d,e,id));
}
function allocation(amount,heirs){
    if(!Number.isSafeInteger(amount)||amount<0)throw Error('Distribution requires a nonnegative integer amount');
    const total=heirs.reduce((n,h)=>n+h.share,0);if(!total)return [];
    let used=0;
    const rows=heirs.map(h=>{const exact=amount*h.share/total,part=Math.floor(exact);used+=part;return {...h,amount:part,remainder:exact-part};});
    rows.sort((a,b)=>b.remainder-a.remainder||a.heir.localeCompare(b.heir));
    for(let i=0;i<amount-used;i++)rows[i%rows.length].amount++;
    return rows.sort((a,b)=>a.heir.localeCompare(b.heir));
}
function inheritancePlan(d,e,p){
    if(p.bankrupt)return {rule:{},heirs:[{heir:p.bankrupt,share:1}],bequests:[]};
    const s=read(d,'state'),code=legalCodeAt(e,p.location,s),familyCode=legalCodeAt(e,npcHousehold(e,s,p.entity)?.settlement??p.location,s)??code,rule={...inheritanceRule(e,s,p.entity,p.location,familyCode),...code?.civil?.inheritance,...p.law};
    const eligible=id=>{
        const kin=(p.kin??[]).filter(h=>[h.holder,h.subject].includes(id));
        return id!==p.entity&&live(d,e,id)&&(!kin.length||kin.some(h=>h.terms?.recognized!==false))&&(body(d,id)?.inheritance??e.byId?.get(body(d,id)?.species)?.inheritance??templates.find(t=>templatesOf(d,id,e)?.includes(t.id))?.inheritance)===true;
    };
    let pool=p.successors??inheritanceCandidates(e,s,p.entity,rule,now(d),eligible).heirs;
    // Recognized current kin holdings can supply heirs for entities without old family rows.
    if(p.successors===undefined&&!pool.length){
        const kin=[...aliveHoldings(d,{kind:'kin'}),...p.kin??[]].filter(h=>h.terms?.recognized!==false&&[h.holder,h.subject].includes(p.entity));
        const children=[...new Set(kin.filter(h=>h.variant==='parent'&&h.holder===p.entity).map(h=>h.subject))].filter(eligible).sort((a,b)=>(npcAgeAt(e,s,b,now(d))??-1)-(npcAgeAt(e,s,a,now(d))??-1)||a.localeCompare(b));
        const spouses=[...new Set(kin.filter(h=>h.variant==='spouse').map(h=>h.holder===p.entity?h.subject:h.holder))].filter(eligible).sort();
        pool=rule.property==='equal'?[...children,...spouses]:rule.property==='children'?children.length?children:spouses:spouses.length?spouses:children;
        if(['eldest','spouse-first'].includes(rule.property))pool=pool.slice(0,1);
    }
    let heirs=pool.map(x=>typeof x==='string'?{heir:x,share:1}: {...x,heir:x.heir??x.id,share:x.share??1}).filter(h=>eligible(h.heir)&&!h.renounced);
    heirs=[...new Map(heirs.map(h=>[h.heir,h])).values()];
    if(heirs.some(h=>!Number.isFinite(h.share)||h.share<=0))throw Error('Invalid inheritance share');
    const total=heirs.reduce((n,h)=>n+h.share,0);heirs=heirs.map(h=>({...h,share:h.share/total}));
    const statutoryHeirs=heirs;
    const clause=rule.testament??code?.civil?.testament??{};
    const wills=Object.values(s.records??{}).filter(r=>r.category==='testament'&&r.testator===p.entity&&!r.revoked&&!r.purports&&r.valid!==false&&(r.minute??0)<=now(d)&&new Set(r.witnesses??[]).size>=(clause.witnesses??0)&&(!clause.registrationRequired||r.registered));
    wills.sort((a,b)=>(b.minute??0)-(a.minute??0)||(b.seq??0)-(a.seq??0)||(b.id??'').localeCompare(a.id??''));
    const will=wills[0];
    if(!p.caseResolved&&(will?.disputed||heirs.some(h=>h.disputed)))return {rule,heirs,disputed:true};
    const bequests=[];
    for(const b of will?.bequests??[]){
        if(!eligible(b.heir)||b.renounced||b.accepted===false||rule.legateeAcceptance==='explicit'&&b.accepted!==true)continue;
        if(!Number.isFinite(b.share)||b.share<=0||b.share>1)continue;
        const prior=b.subject&&bequests.find(x=>x.subject===b.subject);
        if(prior){if(rule.conflict==='last')bequests.splice(bequests.indexOf(prior),1);else continue;}
        bequests.push(b);
    }
    const residuary=bequests.filter(b=>!b.subject),reserved=Math.max(0,Math.min(1,clause.reservedShare??0));
    if(residuary.length){
        const sum=residuary.reduce((n,b)=>n+b.share,0),factor=Math.min(1,(1-reserved)/sum),rest=1-sum*factor;
        const merged=new Map(heirs.map(h=>[h.heir,{...h,share:h.share*rest}]));
        for(const b of residuary)merged.set(b.heir,{heir:b.heir,share:(merged.get(b.heir)?.share??0)+b.share*factor});
        heirs=[...merged.values()].filter(h=>h.share>0);
    }
    if(!heirs.length){
        const target=publicRecipient(d,e,p.entity,p.location,rule);
        if(!live(d,e,target))throw Error('No lawful no-heir custodian or treasury');
        heirs=[{heir:target,share:1,noHeir:rule.noHeir?.mode??'escheat'}];
    }
    return {rule,heirs,statutoryHeirs:statutoryHeirs.length?statutoryHeirs:heirs,bequests:bequests.filter(b=>b.subject).map(b=>({...b,share:Math.min(b.share,1-reserved)})).filter(b=>b.share>0),will:will?.id};
}
function distribute(d,e,id,p){
    const plan=inheritancePlan(d,e,p);
    if(plan.disputed){
        const caseId=`case_inheritance:${id}`;
        if(!entityRow(d,caseId))createEntity(d,{id:caseId,kind:'case',facts:{of:id,status:'open'},writer:W,eventId:p.eventId});
        for(const h of aliveHoldings(d,{holder:id}))openHolding(d,{kind:'frozen',holder:caseId,subject:`holding:${h.id}`,writer:W,engine:e,eventId:p.eventId});
        for(const [key,n]of Object.entries(read(d,'ledger','accounts')??{}))if(parseAccount(key).owner===id&&n)openHolding(d,{kind:'frozen',holder:caseId,subject:key,writer:W,engine:e,eventId:p.eventId});
        writeRecord(d,e,caseId,{category:'legal_case',id:caseId,subject:p.entity,civilMatter:'inheritance_distribution',status:'open',evidence:[],procedure:{estate:id}});
        return {...p,frozen:true,case:caseId};
    }
    if(plan.heirs.some(h=>h.noHeir)&&p.noHeirNotice===undefined&&(aliveHoldings(d,{holder:id}).length||Object.entries(read(d,'ledger','accounts')??{}).some(([k,n])=>parseAccount(k).owner===id&&n))){
        emit(d,e,{id:`${p.eventId}:no-heir-notice`,verb:'protocol_stage',entity:id,phase:'notice',cause:p.eventId,visibility:'public'});
        p={...p,noHeirNotice:now(d),nextAt:now(d)+(plan.rule.noHeir?.notice??1)};
        if(p.nextAt>now(d))return p;
    }
    const inherited=Object.values(read(d,'state','obligations')??{}).filter(o=>!terminal(o)&&[o.debtor,o.promisor].includes(id)&&['assume_by_heirs','substitute_performance'].includes(o.goneRoute));
    if(plan.heirs.some(h=>h.noHeir)&&inherited.length){
        for(const o of inherited)d.set(['state','obligations',o.id],{...o,goneRoute:'accelerate',acceleratedAt:now(d)});
        if(!settleClaims(d,e,id,inherited,p))throw Error('No-heir liquidation cannot settle obligations');
    }else if(p.successors?.some(h=>h.renounced)){
        const total=p.successors.reduce((n,h)=>n+(typeof h==='string'?1:h.share??1),0),renounced=p.successors.filter(h=>h.renounced).reduce((n,h)=>n+(h.share??1),0);
        const claims=[];
        for(const o of inherited){
            const amount=o.remaining??o.amount??o.coins,part=Math.floor(amount*renounced/total);if(!part)continue;
            const claim={...o,id:`${o.id}:renounced`,amount:part,remaining:part,goneRoute:'accelerate'};claims.push(claim);
            d.set(['state','obligations',o.id],{...o,amount:(o.amount??amount)-part,remaining:amount-part});
        }
        if(!settleClaims(d,e,id,claims,p))throw Error('Renounced inheritance cannot be liquidated');
    }
    const {heirs,rule}=plan,receipts=heirs.map(h=>({...h,value:0,holdings:[],holdingValues:{},accounts:[]}));
    const receipt=id=>receipts.find(h=>h.heir===id)??(()=>{const r={heir:id,share:0,value:0,holdings:[],holdingValues:{},accounts:[]};receipts.push(r);return r;})();
    const assets=aliveHoldings(d,{holder:id});
    for(const h of assets){
        if(heirs.some(h=>h.noHeir)&&h.kind==='operates'){closeHolding(d,{id:h.id,reason:'vacated',writer:W,eventId:p.eventId});projectHolding(d,e,h,null,p);continue;}
        const bequest=plan.bequests?.find(b=>b.subject===h.subject),dest=bequest?[{heir:bequest.heir,share:bequest.share},...heirs.map(x=>({...x,share:x.share*(1-bequest.share)}))].filter(x=>x.share>0):heirs;
        const assign=dest=>{
        if(holdingKind(h.kind).sum!==undefined){
            const shares={};for(const row of aliveHoldings(d,{kind:h.kind,subject:h.subject}))if(row.holder!==id)shares[row.holder]=(shares[row.holder]??0)+row.terms.share;
            for(const x of dest)shares[x.heir]=(shares[x.heir]??0)+h.terms.share*x.share;
            const ids=rescaleHolding(d,{kind:h.kind,subject:h.subject,shares,writer:W,engine:e,eventId:p.eventId});
            if(h.kind==='owns')projectProperty(d,h.subject,shares);
            for(const hid of ids){const row=holdingRow(d,hid),part=dest.filter(x=>x.heir===row.holder).reduce((n,x)=>n+x.share,0);if(!part)continue;
                const r=receipt(row.holder);r.holdings.push(hid);const value=(h.terms?.value??e.byId?.get(h.subject)?.basePrice??0)*part;r.holdingValues[hid]=value;r.value+=value;}
        }else{
            const target=dest.slice().sort((a,b)=>b.share-a.share||a.heir.localeCompare(b.heir))[0].heir;
            const hid=transferHolding(d,{id:h.id,holder:target,writer:W,engine:e,eventId:p.eventId});projectHolding(d,e,h,holdingRow(d,hid),p);receipt(target).holdings.push(hid);const value=h.terms?.value??e.byId?.get(h.subject)?.basePrice??0;receipt(target).holdingValues[hid]=value;receipt(target).value+=value;
        }
        };
        if(!bequest)assign(dest);
        else{
            const before=structuredClone(d.document),patchCount=d.patches?.length??0;
            try{assign(dest);}catch(error){
                if(!error.code?.startsWith('E-HOLDING-'))throw error;
                d.document=before;if(d.patches)d.patches.length=patchCount;invalidateHoldings(d);
                assign(plan.statutoryHeirs??heirs);
            }
        }
    }
    for(const [key,amount]of Object.entries(read(d,'ledger','accounts')??{})){
        const ac=parseAccount(key);if(ac.owner!==id||!amount)continue;
        for(const part of allocation(amount,heirs))if(part.amount){bookTransfer(d,e,{from:key,to:accountKey(part.heir,ac.resource,ac.purpose),amount:part.amount,writer:W,eventId:p.eventId});
            const r=receipt(part.heir);r.accounts.push({...ac,amount:part.amount});r.value+=part.amount*price(e,ac.resource);}
    }
    distributeEmployments(d,e,id,heirs,p);
    splitDeposits(d,e,id,heirs,p.eventId);
    for(const r of receipts){
        const age=npcAgeAt(e,read(d,'state'),r.heir,now(d));
        if(age!==null&&age<(e.rules.npcLife?.adultAge??18)){
            const current=aliveHoldings(d,{kind:'guardian_of',subject:r.heir})[0];
            const publicGuardian=publicRecipient(d,e,p.entity,p.location,rule);
            const guardian=current?.holder??rule.guardian??guardianCandidates(e,read(d,'state'),r.heir,p.entity,now(d))[0]??(templatesOf(d,publicGuardian,e)?.some(t=>holdingKind('guardian_of').holderKinds.includes(t))?publicGuardian:null);
            if(guardian&&!live(d,e,guardian))throw Error(`Minor heir requires a live guardian: ${r.heir}`);
            if(!current&&guardian)openHolding(d,{kind:'guardian_of',holder:guardian,subject:r.heir,terms:{scope:'property_only'},source:`guardianship:guardianship:${id}:${r.heir}`,writer:W,engine:e,eventId:p.eventId});
            r.guardian=guardian;
            writeRecord(d,e,`custody:${id}:${r.heir}`,{category:'inheritance_custody',ward:r.heir,guardian,estate:id,transferAllowed:false,incomeTo:r.heir});
            const gid=`guardianship:${id}:${r.heir}`,age=npcAgeAt(e,read(d,'state'),r.heir,now(d));
            // The ward owns the assets even when no lawful caretaker is available.
            if(!current)writeRecord(d,e,gid,{scope:'property_only',category:'guardianship',id:gid,ward:r.heir,guardian:guardian??null,estate:id,since:now(d),expires:now(d)+Math.ceil(((e.rules.npcLife?.adultAge??18)-age)*360*1440),status:guardian?'代管中':'待指定',receivedCoins:r.accounts.filter(a=>a.resource==='coin_river').reduce((n,a)=>n+a.amount,0),ledger:[],sourceEvent:p.eventId});
        }
    }
    for(const [oid,o]of Object.entries(read(d,'state','obligations')??{}))if([o.debtor,o.promisor,o.creditor,o.promisee].includes(id)&&!terminal(o)){
        const amount=o.remaining??o.amount??o.coins;
        if(!Number.isSafeInteger(amount))throw Error(`Obligation cannot be divided: ${oid}`);
        const parts=allocation(amount,heirs).filter(h=>h.amount);
        const principal=allocation(o.amount??o.coins??amount,heirs),paid=allocation(o.paid??0,heirs);
        for(const [i,part]of parts.entries()){
            const n={...o,id:i?`${oid}:heir:${part.heir}`:oid,amount:principal.find(h=>h.heir===part.heir).amount,remaining:part.amount,paid:paid.find(h=>h.heir===part.heir).amount,inheritanceFrom:id,originalTerms:o.originalTerms??o.terms??{},originalObligation:oid,originalAmount:amount};
            if(o.coins!==undefined)n.coins=n.amount;
            if(o.legacyRecord){n.originalLegacyRecord=o.legacyRecord;n.legacyRecord=i?`${o.legacyRecord}:heir:${part.heir}`:o.legacyRecord;}
            n.inheritedEndpoints=['debtor','promisor','creditor','promisee'].filter(k=>n[k]===id);
            for(const k of n.inheritedEndpoints)n[k]=part.heir;
            if(['assume_by_heirs','substitute_performance'].includes(o.goneRoute))n.terms={...o.terms,liabilityCap:receipt(part.heir).value,guardian:receipt(part.heir).guardian??null};
            d.set(['state','obligations',n.id],n);
        }
        if(!parts.length)d.set(['state','obligations',oid],{...o,status:'settled',remaining:0});
    }
    // One inheritance budget covers all of an heir's inherited debts, rather
    // than granting each creditor a fresh copy of the same liability cap.
    for(const r of receipts){
        const claims=Object.values(read(d,'state','obligations')??{}).filter(o=>o.inheritanceFrom===id&&[o.debtor,o.promisor].includes(r.heir)&&['assume_by_heirs','substitute_performance'].includes(o.goneRoute)&&!terminal(o));
        const total=claims.reduce((n,o)=>n+(o.remaining??0),0);
        if(total>r.value)for(const part of allocation(r.value,claims.map(o=>({heir:o.id,share:o.remaining})))){
            const o=read(d,'state','obligations',part.heir);
            d.set(['state','obligations',o.id],{...o,remaining:part.amount,badDebt:(o.badDebt??0)+o.remaining-part.amount});
        }
    }
    projectEstateReceipt(d,e,id,p,receipts,rule);
    return {...p,distribution:{heir:receipts[0]?.heir??null,heirs:receipts,value:receipts.reduce((n,r)=>n+r.value,0),holdings:receipts.flatMap(r=>r.holdings),accounts:receipts.flatMap(r=>r.accounts),rule,will:plan.will??null}};
}
function settleClaims(d,e,estate,claims,p){
    const groups=new Map();
    for(const o of claims){
        const amount=o.remaining??o.amount??o.coins;
        if(!Number.isSafeInteger(amount)||amount<0)return false;
        const order=e.rules.law?.estate?.debtOrder,rank=order?.indexOf(o.kind);
        const resource=o.resource??'coin_river',priority=o.priority??(order?(rank>=0?rank:order.length):({funeral:0,wage:1,tax:2}[o.kind]??3)),key=`${priority}:${resource}`;
        if(!groups.has(key))groups.set(key,{priority,resource,rows:[]});groups.get(key).rows.push({o,amount});
    }
    for(const g of [...groups.values()].sort((a,b)=>a.priority-b.priority||a.resource.localeCompare(b.resource))){
        const depositMode=g.resource==='coin_river'&&!!read(d,'state','records',`protocol_assets:${estate}`);
        const accounts=depositMode?legacyClaimAccounts(d,e,estate,g.resource):Object.entries(read(d,'ledger','accounts')??{}).filter(([k,n])=>{const a=parseAccount(k);return a.owner===estate&&a.resource===g.resource&&n>0;}).sort(([a],[b])=>a.localeCompare(b));
        const total=g.rows.reduce((n,r)=>n+r.amount,0),available=Math.min(total,accounts.reduce((n,[,amount])=>n+amount,0));
        let allocated=0;
        const payments=g.rows.map(r=>{const numerator=BigInt(available)*BigInt(r.amount),denominator=BigInt(total||1),paid=Number(numerator/denominator);allocated+=paid;return {...r,paid,remainder:numerator%denominator};});
        payments.sort((a,b)=>a.remainder===b.remainder?a.o.id.localeCompare(b.o.id):a.remainder>b.remainder?-1:1);
        for(let i=0;i<available-allocated;i++)payments[i].paid++;
        for(const r of payments.sort((a,b)=>a.o.id.localeCompare(b.o.id))){
            const creditor=r.o.creditor??r.o.promisee;if(!creditor)return false;
            let left=r.paid;
            for(const [key,n] of accounts){const amount=Math.min(left,depositMode?n:read(d,'ledger','accounts',key)??0);if(!amount)continue;
                if(depositMode){payLegacyClaim(d,e,estate,key,creditor,amount,p.eventId);accounts.find(a=>a[0]===key)[1]-=amount;}
                else bookTransfer(d,e,{from:key,to:g.resource==='coin_river'?partyAccount(e,read(d,'state'),creditor):accountKey(creditor,g.resource,'inventory'),amount,writer:W,eventId:p.eventId});left-=amount;if(!left)break;}
            const unpaid=r.amount-r.paid;
            const result={...r.o,status:!unpaid?'settled':p.bankrupt?p.discharge?'cancelled':'pending':'bad_debt',paid:(r.o.paid??0)+r.paid,badDebt:p.bankrupt?0:unpaid,remaining:p.bankrupt&&!p.discharge?unpaid:0,resolvedAt:now(d)};
            if(p.bankrupt&&unpaid&&!p.discharge){for(const k of ['debtor','promisor'])if(result[k]===estate)result[k]=p.bankrupt;delete result.resolvedAt;result.goneRoute='returned';}
            d.set(['state','obligations',r.o.id],result);
            if(!unpaid&&r.o.legacyRecord)e.protocolDebtSettled?.(d,{...r.o,debtor:estate},p.eventId);
            emit(d,e,{id:`${p.eventId}:settle:${r.o.id}`,verb:'protocol_stage',entity:estate,phase:'settlement',cause:p.eventId,obligation:r.o.id,paid:r.paid,badDebt:r.amount-r.paid});
        }
    }
    return true;
}
function legacyClaimAccounts(d,e,entity,resource){
    if(resource!=='coin_river')throw Error('Recorded debt requires a declared monetary settlement adapter');
    const accounts=[[purse(e,entity),read(d,'ledger','accounts',purse(e,entity))??0]];
    for(const [id,b]of Object.entries(read(d,'state','records')??{}).sort(([a],[b])=>a.localeCompare(b)))if(b.category==='bank'&&b.accounts?.[entity]>0)accounts.push([vault(id),Math.min(b.accounts[entity],b.coins??0)]);
    return accounts;
}
function payLegacyClaim(d,e,entity,from,creditor,amount,eventId){
    const bank=read(d,'state','records',creditor),base=(e.rules.economy?.credit?.banks??[]).find(b=>b.id===creditor);
    const to=bank?.category==='bank'||base?vault(creditor):partyAccount(e,read(d,'state'),creditor);
    // A deposit at the creditor bank is set off against its claim. Its reserve
    // does not move; only the depositor's liability account is reduced.
    if(from===to){writeRecord(d,e,creditor,{...bank,accounts:{...bank.accounts,[entity]:bank.accounts[entity]-amount}});return;}
    if(parseAccount(from).purpose!=='vault'){bookTransfer(d,e,{from,to,amount,writer:W,eventId});return;}
    transfer(d,{from,to,amount,writer:W,eventId});
    const account=parseAccount(from);
    if(account.purpose==='vault'){
        const b=read(d,'state','records',account.owner);
        writeRecord(d,e,account.owner,{...b,coins:b.coins-amount,accounts:{...b.accounts,[entity]:b.accounts[entity]-amount}});
    }else mirrorPartyCoins(d,e,entity,-amount,eventId,W);
    if(bank?.category==='bank'||base)writeRecord(d,e,creditor,{...(bank??{category:'bank',id:creditor,accounts:{},goods:{}}),coins:(bank?.coins??base.reserveCopper)+amount});
    else mirrorPartyCoins(d,e,creditor,amount,eventId,W);
}
function escrowClaims(d,e,estate,claims,p){
    for(const o of claims){
        const amount=o.remaining??o.amount??o.coins,resource=o.resource??'coin_river';
        if(!Number.isSafeInteger(amount)||amount<0)throw Error(`Invalid escrow claim: ${o.id}`);
        const custodian=p.escrowCustodian??`estate_escrow:${estate}`;
        if(!p.escrowCustodian&&!entityRow(d,custodian))createEntity(d,{id:custodian,kind:'estate',facts:{of:estate,phase:'escrow'},writer:W,eventId:p.eventId});
        if(!live(d,e,custodian))throw Error('Escrow custodian is not live');
        let left=amount;
        for(const [key,n]of Object.entries(read(d,'ledger','accounts')??{}).sort(([a],[b])=>a.localeCompare(b))){
            const ac=parseAccount(key);if(ac.owner!==estate||ac.resource!==resource||!n)continue;
            const part=Math.min(n,left);if(part)bookTransfer(d,e,{from:key,to:accountKey(custodian,resource,`escrow:${o.id}`),amount:part,writer:W,eventId:p.eventId});left-=part;if(!left)break;
        }
        const n={...o,escrowCustodian:custodian,escrowAmount:amount-left,badDebt:(o.badDebt??0)+left,remaining:amount-left,status:amount===left?'bad_debt':'pending'};
        for(const k of ['debtor','promisor'])if(n[k]===estate)n[k]=custodian;
        d.set(['state','obligations',o.id],n);
    }
}
export function advanceProcedure(d,e,id,minute=now(d)){
    return atomic(d,()=>{
        let p=read(d,...root,'procedures',id);if(!p||p.phase==='closed'||p.nextAt>minute||p.frozen)return;
        for(let i=0;i<phases.length&&p.nextAt<=minute&&p.phase!=='closed';i++){
            const phase=p.phase;
            if(phase==='settlement'){
                importRecordedClaims(d,e,id);
                // Package obligations require their own registered settlement handler.
                const claims=Object.values(read(d,'state','obligations')??{}).filter(o=>[o.debtor,o.promisor].includes(id)&&(o.goneRoute==='accelerate'||(o.deadline??Infinity)<=minute)&&!terminal(o));
                const owed=claims.filter(o=>o.filed!==false&&o.creditorPresent!==false);
                if(e.settleProtocolObligations)e.settleProtocolObligations(d,id,owed,p);
                else if(!settleClaims(d,e,id,owed,p)){d.set([...root,'procedures',id],{...p,awaiting:'settlement'});return;}
                escrowClaims(d,e,id,claims.filter(o=>o.filed===false||o.creditorPresent===false),p);
            }
            if(phase==='distribution'){
                p=distribute(d,e,id,p);
                if(p.frozen||p.nextAt>minute){d.set([...root,'procedures',id],p);writeRecord(d,e,`transition_procedure:${id}`,{category:'transition_procedure',...p});return;}
            }
            syncRecordedClaims(d,e);
            const next=phases[phases.indexOf(phase)+1];
            emit(d,e,{id:`${p.eventId}:phase:${phase}`,verb:'protocol_stage',entity:id,phase,cause:p.eventId,minute:p.nextAt,visibility:phase==='notice'?'public':'private'});
            p={...p,phase:next,nextAt:p.nextAt+(p.durations[next]??0)};
            if(next==='closed'){invariant(d,id,e);emit(d,e,{id:`${p.eventId}:phase:closed`,verb:'protocol_stage',entity:id,phase:'closed',cause:p.eventId});}
            updateEntity(d,{id,facts:{phase:next},writer:W,eventId:p.eventId});d.set([...root,'procedures',id],p);
            writeRecord(d,e,`transition_procedure:${id}`,{category:'transition_procedure',...p});
        }
    });
}
registerProtocolRunner({
    next:(e,d,at)=>Math.min(Infinity,...Object.values(read(d,...root,'procedures')??{}).filter(p=>p.phase!=='closed'&&!p.frozen&&!p.awaiting).map(p=>Math.max(at+1,p.nextAt)),...recordsWhere(read(d,'state','records')??{},'category','protocol_schedule').filter(r=>r.status==='pending').map(r=>Math.max(at+1,r.at))),
    items:(e,d,c)=>[...Object.values(read(d,...root,'procedures')??{}).filter(p=>p.phase!=='closed'&&p.nextAt<=c.after&&!p.frozen&&!p.awaiting).map(p=>({id:p.id,anchorId:p.id,registeredSeq:p.registeredSeq,execute:()=>advanceProcedure(d,e,p.id,c.after)})),
        ...recordsWhere(read(d,'state','records')??{},'category','protocol_schedule').filter(r=>r.status==='pending'&&r.at<=c.after).map(r=>({id:r.id,anchorId:r.context?.entity??r.id,registeredSeq:r.registeredSeq,execute:()=>atomic(d,()=>{
            writeRecord(d,e,r.id,{...r,status:'completed'});for(const p of r.do)executeProtocolPrimitive(d,e,p,{...r.context,eventId:r.id});invariant(d,null,e);
        })}))],
});

export function restoreTransition(d,engine,{entity,origin,eventId=`restored:${entity}:${now(d)}`,action,location,vital,law={}}){
    if(!['declaration_revoked','registered_action','underworld_case'].includes(origin)||origin==='registered_action'&&action?.produces!=='restored')throw Error('I26: unsupported restored source');
    return atomic(d,()=>{
        const r=byEntity(d,entity);if(!r?.gone)return r;
        if(origin==='declaration_revoked'&&(r.basis!=='declared'||r.actualDeath!==undefined))throw Error('Not a living declared person');
        law={...legalCodeAt(engine,location??r.location,read(d,'state'))?.civil,...law};
        if(origin!=='declaration_revoked'&&law.recognition?.resurrection===false){
            const id=`${entity}:resurrected:${eventId}`,a=body(d,entity)??{};
            holdingSet(d,engine,['state','created',id],{...engine.byId?.get(entity),id,kind:'person',resurrectedFrom:entity,location:location??r.location},W,eventId);
            holdingSet(d,engine,['state','npcs',id],{...a,status:'正常',hp:Math.max(1,vital?.hp??1),location:location??r.location,incarnation:0},W,eventId);
            emit(d,engine,{id:eventId,verb:'restored',entity:id,cause:r.eventId,recognizedAs:entity,recognition:false,visibility:'public'});
            return {entity:id,recognized:false,previous:entity};
        }
        const next={...r,gone:false,restoredAt:now(d),restoredBy:eventId};d.set([...root,'entities',entity],next);
        writeRecord(d,engine,`transition:${entity}`,next);
        const p=r.successor&&read(d,...root,'procedures',r.successor);
        if(p&&p.phase!=='closed'){
            for(const h of aliveHoldings(d,{holder:r.successor})){const hid=transferHolding(d,{id:h.id,holder:entity,writer:W,engine,eventId});projectHolding(d,engine,h,holdingRow(d,hid),{eventId});}
            distributeEmployments(d,engine,r.successor,[{heir:entity,share:1}],{eventId});moveDeposits(d,engine,r.successor,entity,eventId);
            for(const [key,amount] of Object.entries(read(d,'ledger','accounts')??{})){const ac=parseAccount(key);if(ac.owner===r.successor&&amount)bookTransfer(d,engine,{from:key,to:accountKey(entity,ac.resource,ac.purpose),amount,writer:W,eventId});}
            for(const [id,o] of Object.entries(read(d,'state','obligations')??{})){
                const n={...o};let changed=false;for(const k of ['debtor','creditor','promisor','promisee'])if(n[k]===r.successor){n[k]=entity;changed=true;}
                if(changed)d.set(['state','obligations',id],n);
            }
            d.set([...root,'procedures',r.successor],{...p,phase:'closed',restoredBy:eventId});updateEntity(d,{id:r.successor,facts:{phase:'closed'},writer:W,eventId});
            writeRecord(d,engine,`transition_procedure:${r.successor}`,{category:'transition_procedure',...p,phase:'closed',restoredBy:eventId});
        }
        if(p?.phase==='closed'&&p.distribution?.heir){
            const grouped=new Map();
            for(const dist of [...p.previousDistributions??[],p.distribution])for(const part of dist.heirs??[dist]){
                let r=grouped.get(part.heir);if(!r){r={heir:part.heir,value:0,holdings:[],holdingValues:{},accounts:[]};grouped.set(part.heir,r);}
                r.value+=part.value??0;r.holdings=[...new Set([...r.holdings,...part.holdings])];Object.assign(r.holdingValues,part.holdingValues??{});
                for(const ac of part.accounts){const prior=r.accounts.find(x=>x.resource===ac.resource&&x.purpose===ac.purpose);if(prior)prior.amount+=ac.amount;else r.accounts.push({...ac});}
            }
            const receipts=[...grouped.values()];
            for(const receipt of receipts){
                const heir=receipt.heir;let benefit=0;
                for(const ac of receipt.accounts){const present=read(d,'ledger','accounts',accountKey(heir,ac.resource,ac.purpose))??0;
                    benefit+=Math.min(ac.amount,present)*price(engine,ac.resource);}
                for(const hid of receipt.holdings){const h=holdingRow(d,hid);if(h?.until===undefined&&h.holder===heir)benefit+=receipt.holdingValues?.[hid]??h.terms?.value??engine.byId?.get(h.subject)?.basePrice??0;}
                const amount=Math.max(0,Math.floor(law.restitution==='received'?receipt.value:benefit));
                if(amount>0){const id=`${eventId}:compensation:${heir}`;d.set(['state','obligations',id],{id,kind:'compensation',debtor:heir,creditor:entity,resource:'coin_river',amount,remaining:amount,status:'pending',cause:eventId});}
            }
            const restored=new Map();
            for(const [id,o]of Object.entries(read(d,'state','obligations')??{}))if(o.inheritanceFrom===r.successor&&(!terminal(o)||o.terms?.liabilityCap!==undefined&&o.amount>(o.paid??0))){
                const n={...o,terms:o.originalTerms??{}};
                for(const k of o.inheritedEndpoints??['debtor','promisor','creditor','promisee'])if(receipts.some(h=>h.heir===n[k]))n[k]=entity;
                const key=o.originalObligation??id,prior=restored.get(key);
                n.id=key;n.remaining=Math.max(0,n.amount-(n.paid??0));n.status=n.remaining?'pending':'settled';delete n.resolvedAt;
                if(prior){prior.amount+=n.amount;prior.remaining+=n.remaining??n.amount;prior.paid=(prior.paid??0)+(n.paid??0);}
                else restored.set(key,n);
                if(id!==key)d.set(['state','obligations',id],{...o,status:'cancelled',remaining:0,restoredBy:eventId});
            }
            for(const [id,n]of restored){delete n.inheritanceFrom;delete n.originalTerms;delete n.originalObligation;delete n.originalAmount;delete n.inheritedEndpoints;d.set(['state','obligations',id],n);}
        }
        // Restore personal civil facts, never appointments or spent assets.
        for(const id of new Set([...r.holdings,...r.subjectHoldings])){const h=holdingRow(d,id);if(!h||h.until===undefined||!['citizen_of','resident_of','resides','household_member','certified','kin'].includes(h.kind))continue;
            if(h.subject!==entity&&(byEntity(d,h.subject)?.gone||entityRow(d,h.subject)?.goneAt!==undefined))continue;
            if(h.kind==='kin'&&h.variant==='spouse'){
                if(law.marriageOnRestore==='void'||[h.holder,h.subject].some(x=>aliveHoldings(d,{kind:'kin',holder:x}).some(k=>k.variant==='spouse'&&![h.holder,h.subject].includes(k.subject))))continue;
                for(const [oid,o]of Object.entries(read(d,'state','obligations')??{}))if(!terminal(o)&&(o.kind==='betrothal'||o.terms?.kind==='betrothal')&&[o.debtor,o.promisor,o.creditor,o.promisee].some(x=>[h.holder,h.subject].includes(x))){
                    if(law.betrothalOnRestore==='retain')continue;
                    d.set(['state','obligations',oid],{...o,status:'void',resolvedAt:now(d),cause:eventId});
                }
            }
            if(!aliveHoldings(d,{kind:h.kind,holder:h.holder,subject:h.subject}).some(k=>(k.variant??null)===(h.variant??null)))openHolding(d,{...h,writer:W,engine,eventId,reason:'opened',place:h.concluded?.place,lawVersion:h.concluded?.lawVersion,form:h.concluded?.form});}
        if(r.basis==='death'||r.actualDeath!==undefined){
            const path=entity==='player'?['state','player']:read(d,'state','npcs',entity)?['state','npcs',entity]:['state','creatures',entity];
            d.set([...path,'status'],'正常');d.remove([...path,'diedAt']);
            d.set([...path,'incarnation'],r.generation+1);
            if(read(d,...path,'hp')!==undefined)d.set([...path,'hp'],Math.max(1,Math.min(read(d,...path,'maxHp')??1,vital?.hp??read(d,...path,'maxHp')??1)));
            if(r.wreck&&entityRow(d,r.wreck)){
                for(const [id,l]of Object.entries(read(d,'holdings','locations')??{}))if(l.at===r.wreck)setLocation(d,{entity:id,at:entity,mode:'carried',writer:W,engine});
                transition(d,engine,{entity:r.wreck,basis:'destruction',origin:'destruction',owner:entity,location:location??r.location,eventId:`${eventId}:body`,consumed:true});
            }
            for(const [id,a]of Object.entries(read(d,'state','npcs')??{}))if(a.soulOf===entity&&!byEntity(d,id)?.gone){
                for(const [oid,o]of Object.entries(read(d,'state','obligations')??{}))if(o.kind==='grievance'&&[o.creditor,o.promisee].includes(id))d.set(['state','obligations',oid],{...o,onCreditorGone:'void'});
                transition(d,engine,{entity:id,basis:'rested',origin:'rested',eventId:`${eventId}:soul:${id}`,successors:[entity]});
            }
        }
        if(location)d.set(['state',entity==='player'?'location':'npcs',...(entity==='player'?[]:[entity,'location'])],location);
        syncRecordedClaims(d,engine);
        emit(d,engine,{id:eventId,verb:'restored',entity,cause:r.eventId,visibility:'public'});invariant(d,null,engine);return next;
    });
}
