// L1 transfer protocol. The caller's scheduler determines the order of calls.
import fs from 'node:fs';
import {GONE_BASES,ensureHoldings,aliveHoldings,holdingRow,holdingKind,templatesOf,createEntity,entityRow,endEntity,updateEntity,
    openHolding,closeHolding,transferHolding,setLocation,clearLocation,locationOf,auditHoldings,declareHoldingWriter,invalidateHoldings,holdingKindIds,holdingSet} from './holdings.mjs';
import './holding-kinds.mjs';
import {accountKey,parseAccount,transfer,declareLedgerWriter} from './ledger.mjs';
import {registerProtocolRunner} from './scheduler.mjs';
import {publishTransitionEvent,SOCIAL_VERBS,registerWorldEventSubscriber,presentWitnesses} from './world-events.mjs';
import {identities} from './identity.mjs';

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
const writeRecord=(d,engine,id,value)=>holdingSet(d,engine,['state','records',id],value,'transition');

// Draft exposes immutable checkpoints. Restore sequence and caches along with data.
function atomic(d,fn){
    if(d.protocolTransaction)return fn();
    const document=structuredClone(d.document),patches=d.patches?.length??0,messages=d.messages?.length??0,seq=d.scheduler?.seq;
    const reaction=d.reactionTick?structuredClone({...d.reactionTick,queue:[]}):null,queue=d.reactionTick?.queue?.slice();
    d.protocolTransaction=true;
    try{return fn();}catch(error){
        d.document=document;if(d.patches)d.patches.length=patches;if(d.messages)d.messages.length=messages;
        if(d.scheduler)d.scheduler.seq=seq;
        if(reaction)d.reactionTick={...reaction,queue};else delete d.reactionTick;
        invalidateHoldings(d);throw error;
    }finally{delete d.protocolTransaction;}
}
function emit(d,engine,event){
    SOCIAL_VERBS.add(event.verb);
    const row={minute:now(d),actor:event.entity??event.holder??'core:protocol',visibility:'private',witnesses:[],participants:[],tags:['entity-transition','protocol'],...event};
    row.actorAs??=identities(engine,read(d,'state'),row.actor).at(-1)?.key;
    if(event.witnesses===undefined&&event.location)row.witnesses=presentWitnesses(read(d,'state'),event.location,[row.actor]);
    publishTransitionEvent(d,engine,row);return read(d,'state','records',`world_event:${event.id}`)??row;
}
function invariant(d,entity=null){
    const errors=auditHoldings(d);
    if(entity){
        if(aliveHoldings(d,{holder:entity}).length)errors.push(`I6 holdings: ${entity}`);
        if(Object.values(read(d,'holdings','locations')??{}).some(l=>l.at===entity))errors.push(`I6 contents: ${entity}`);
        if(Object.entries(read(d,'ledger','accounts')??{}).some(([k,n])=>parseAccount(k).owner===entity&&n))errors.push(`I6 accounts: ${entity}`);
        for(const o of Object.values(read(d,'state','obligations')??{}))if(!['void','cancelled','settled','bad_debt','取消','已完成'].includes(o.status)&&[o.debtor,o.creditor,o.promisor,o.promisee].includes(entity))errors.push(`I7 obligation: ${o.id}`);
    }
    if(errors.length)throw Error(errors.join('; '));
}
const bands=[['holds_office','appointed','governs','administers','fief','permit'],['guardian_of','custody_of'],['registered'],['operates','employed_by'],['owns','share','leases','tamed_by','commands','pledged'],[]];
const rank=r=>{const i=bands.findIndex(b=>b.includes(r.kind));return i<0?5:i;};
const sorted=rows=>rows.sort((a,b)=>rank(a)-rank(b)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
const successors=(d,ctx,r)=>[...r.terms?.successors??[],...ctx.successors??[]].filter(x=>x!==ctx.entity&&!byEntity(d,x)?.gone);
function action(d,e,r,template,ctx,side='holder'){
    if(!r||holdingRow(d,r.id)?.until!==undefined)return;
    const options={id:r.id,writer:W,eventId:ctx.eventId,engine:e};
    const close=()=>{closeHolding(d,{...options,reason:ctx.reason??'vacated'});emit(d,e,{id:`${ctx.eventId}:close:${r.id}`,verb:'holding_closed',holder:r.holder,subject:r.subject,cause:ctx.eventId,kind:r.kind,reason:ctx.reason??'vacated'});};
    const move=patch=>{const id=transferHolding(d,{...options,...patch,reason:ctx.reason??'transferred'});emit(d,e,{id:`${ctx.eventId}:transfer:${r.id}`,verb:'holding_transferred',holder:patch.holder??r.holder,subject:patch.subject??r.subject,cause:ctx.eventId,kind:r.kind});return id;};
    if(template==null||template==='stay')return;
    if(template==='suspend'){throw Error('suspend is derived, not a protocol action');}
    if(side==='subject'){
        if(template==='close')close();
        else if(template==='estate'){if(!ctx.successor)throw Error('subject estate requires successor');move({subject:ctx.successor});}
        else if(template==='reparent'){if(ctx.location)move({subject:ctx.location});else close();}
        else throw Error(`Unknown subject hook ${template}`);
        return;
    }
    if(template==='estate'){
        const target=ctx.successor??ctx.owner;
        if(!target)throw Error(`No estate or owner for ${r.kind}`);
        move({holder:target});
    }else if(template==='succeed'||template==='revert'){
        const target=template==='revert'?r.grantedBy:successors(d,ctx,r)[0]??r.grantedBy;
        if(target)move({holder:target});
        else if(r.kind==='governs')throw Error('governs requires a living polity successor');
        else close();
    }else if(template==='vacate'){
        close();const office=entityRow(d,r.subject);
        emit(d,e,{id:`${ctx.eventId}:vacancy:${r.id}`,verb:'succession',entity:r.subject,cause:ctx.eventId,rule:r.terms?.succession??office?.facts?.succession??'vacant_until_claimed'});
    }else if(template==='retain_disputed'){
        writeRecord(d,e,`${ctx.eventId}:claim:${r.id}`,{category:'transition_claim',holder:r.holder,subject:r.subject,status:'open',cause:ctx.eventId,minute:now(d)});
        emit(d,e,{id:`${ctx.eventId}:claim:${r.id}`,verb:'claim',holder:r.holder,subject:r.subject,cause:ctx.eventId});
    }else if(template==='close')close();
    else throw Error(`Unknown handover ${template}`);
}
function condition(h,ctx,e,d){
    if(h.when===undefined)return true;
    if(typeof h.when==='boolean')return h.when;
    if(e.evaluateProtocolCondition)return Boolean(e.evaluateProtocolCondition(h.when,{...ctx,d}));
    throw Error('Hook condition requires the registered RX evaluator');
}
function hooks(d,e,r,on,ctx,side='holder'){
    const list=(holdingKind(r.kind)?.hooks??[]).filter(h=>h.on===on||h.on===on.split('(')[0]);
    for(const h of list.sort((a,b)=>(a.packId??'core').localeCompare(b.packId??'core')||(a.id??'').localeCompare(b.id??''))){
        if(!condition(h,ctx,e,d))continue;
        if(typeof h.do==='string')action(d,e,holdingRow(d,r.id),h.do,ctx,side);
        else for(const p of h.do){
            const a={...p,writer:W,eventId:ctx.eventId,engine:e};
            if(p.op==='holding.close'){
                if(p.kind){
                    if(p.filter&&p.filter!=='subject != host')throw Error('Hook filter requires the registered RX evaluator');
                    for(const edge of aliveHoldings(d,{kind:p.kind,holder:r.holder}).filter(edge=>!p.filter||edge.subject!==r.subject))closeHolding(d,{...a,id:edge.id,reason:p.reason??'vacated'});
                }else closeHolding(d,{...a,id:p.id??r.id,reason:p.reason??ctx.reason??'vacated'});
            }
            else if(p.op==='holding.open')openHolding(d,a);
            else if(p.op==='holding.transfer')transferHolding(d,{...a,id:p.id??r.id});
            else if(p.op==='transfer')transfer(d,a);
            else if(p.op==='emit')emit(d,e,{...p,entity:ctx.entity,id:p.id??`${ctx.eventId}:${h.id}`,cause:ctx.eventId});
            else if(p.op==='fact.set')d.set(p.path,p.value);
            else if(p.op==='transition')transition(d,e,p);
            else if(e.executeProtocolPrimitive)e.executeProtocolPrimitive(d,p,ctx);
            else throw Error(`Protocol primitive is not installed: ${p.op}`);
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
                emit(d,engine,{id:`${eventId}:vacancy`,verb:'succession',entity:before.subject,cause:eventId});
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
        invariant(d);emit(d,engine,{id:eventId,verb:`holding_${op==='open'?'opened':op==='close'?'closed':'transferred'}`,entity:row.holder,holder:row.holder,subject:row.subject,kind:row.kind,variant:row.variant,reason});
        return result;
    });
}

// The same hooks field handles event subscriptions; unsupported RX never
// silently evaluates true. Only candidate kinds are queried, avoiding a scan
// over every holding for ordinary world events.
export function dispatchProtocolEvent(d,engine,event){
    const candidates=[];
    for(const kind of holdingKindIds())for(const h of holdingKind(kind).hooks??[]){
        if(!h.on.startsWith('event('))continue;
        const [selector,filter]=h.on.slice(6,-1).split(',').map(x=>x.trim());
        const [verb,...detail]=selector.split(':');if(verb!==event.verb)continue;
        const actual=event.thresholdId??[event.kind,event.variant].filter(Boolean).join(':');
        if(detail.length&&detail.join(':')!==actual)continue;
        candidates.push({kind,on:h.on,filter});
    }
    if(!candidates.length)return;
    atomic(d,()=>{
        for(const c of candidates)for(const r of aliveHoldings(d,{kind:c.kind})){
            const affected=event.entity??event.target??event.actor;
            if(c.filter==='entity:holder'&&r.holder!==affected||c.filter==='entity:subject'&&r.subject!==affected||c.filter==='target:holder'&&r.holder!==affected)continue;
            hooks(d,engine,r,c.on,{entity:affected,eventId:event.id,reason:'vacated',successor:event.successor,location:event.location});
        }
        invariant(d);
    });
}
function dispatchProtocolEvents(d,engine,events){for(const event of events)dispatchProtocolEvent(d,engine,event);}
registerWorldEventSubscriber({id:'transition_hooks',order:0,on:(d,engine,events)=>dispatchProtocolEvents(d,engine,events)});

// Explicit origins prevent rumor/belief producers from invoking legal transitions.
const origins={death:['vital','death_rule'],dissolution:['dissolution'],destruction:['destruction'],extinction:['extinction'],declared:['declaration_judgment'],insolvency:['insolvency_judgment'],rested:['rested'],reborn:['reborn'],aggregated:['aggregated'],pack_removed:['pack_uninstall']};
export function transition(d,engine,input){
    const {entity,basis,origin,kind='gone'}=input;
    if(kind!=='gone'||!GONE_BASES.includes(basis)||!origins[basis]?.includes(origin))throw Error('I26: unsupported transition source');
    return atomic(d,()=>{
        ensureHoldings(d,engine);
        const generation=input.generation??body(d,entity)?.incarnation??byEntity(d,entity)?.generation??0;
        const previous=byEntity(d,entity);
        if(previous&&generation<previous.generation)throw Error('An earlier instance generation cannot be reused');
        if(previous?.gone&&previous.generation===generation){
            // Legal death and physical death have separate timelines. Learning
            // that a declared person actually died must not open a second estate.
            if(previous.basis==='declared'&&basis==='death'&&!previous.actualDeath){
                const a=body(d,entity)??{},path=read(d,'state','npcs',entity)?['state','npcs',entity]:['state','creatures',entity];
                const wreck=`wreck_${entity}:${generation}`,location=a.location??previous.location;
                createEntity(d,{id:wreck,kind:'wreck',facts:{of:entity,body:true,yields:a.yields??[]},source:`transition:${entity}`,writer:W,origin:'protocol'});
                if(location)setLocation(d,{entity:wreck,at:location,mode:'place',source:`transition:${entity}`,writer:W,engine});
                d.set([...path,'status'],'死亡');d.set([...path,'diedAt'],now(d));if(a.hp!==undefined)d.set([...path,'hp'],0);
                const next={...previous,actualDeath:now(d),wreck,location,body:true,yields:a.yields??[]};
                d.set([...root,'entities',entity],next);writeRecord(d,engine,`transition:${entity}`,next);
                emit(d,engine,{id:input.eventId??`${previous.eventId}:actual-death`,verb:'transition',entity,basis:'death',legalAlreadyGone:true,cause:previous.eventId});return next;
            }
            return previous;
        }
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
        const debris=['destruction','extinction'].includes(basis);
        const suffix=`${generation}${cycle?`:${cycle}`:''}`;
        const successor=estate?(input.successor??`estate_${entity}:${suffix}`):liquidation?(input.successor??`liq_${entity}:${suffix}`):null;
        const wreck=corpse||debris?`wreck_${entity}:${suffix}`:null;
        const record=clean({category:'transition',entity,generation,cycle,basis,eventId,gone:true,minute:now(d),successor,wreck,location,previousVital:a.status,holdings:held.map(r=>r.id),subjectHoldings:subject.map(r=>r.id),identities:identities(engine,read(d,'state'),entity),successors:input.successors??[],phase:'transitioning',body:corpse,yields:a.yields??engine.byId?.get(a.species)?.yields??[]});
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
        const ctx={...input,entity,eventId,successor:successor??input.successor,location,owner:input.owner,reason:'transferred'};
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
        for(const r of held){hooks(d,engine,r,`holder.gone(${basis})`,ctx);action(d,engine,holdingRow(d,r.id),holdingKind(r.kind).handover.gone,ctx);}
        for(const r of subject){hooks(d,engine,r,`subject.gone(${basis})`,ctx,'subject');action(d,engine,holdingRow(d,r.id),holdingKind(r.kind).onSubjectGone,{...ctx,successor:successor??wreck},'subject');}
        for(const [id,l] of Object.entries(read(d,'holdings','locations')??{}))if(l.at===entity){
            if(!wreck&&!location)throw Error('No destination for contained objects');
            setLocation(d,{entity:id,at:wreck??location,mode:wreck?'container':'place',writer:W,engine});
        }
        clearLocation(d,{entity,writer:W});
        for(const [key,amount] of Object.entries(read(d,'ledger','accounts')??{})){
            const ac=parseAccount(key);if(ac.owner!==entity||!amount)continue;
            const salvage=Math.max(0,Math.min(1,input.salvage?.[ac.resource]??a.salvage?.[ac.resource]??0));
            const saved=debris?Math.floor(amount*salvage):amount;
            const to=input.treasury??successor??input.successor??input.owner??(debris?wreck:null);
            if(saved&&!to&&basis!=='pack_removed')throw Error('No account successor');
            if(saved)transfer(d,{from:key,to:accountKey(basis==='pack_removed'?'sink:pack_removed':to,ac.resource,ac.purpose),amount:saved,writer:W,eventId});
            if(amount>saved)transfer(d,{from:key,to:accountKey('sink:destroy',ac.resource,'destruction'),amount:amount-saved,writer:W,eventId});
        }
        for(const [id,o] of Object.entries(read(d,'state','obligations')??{})){
            if(['void','cancelled','settled','取消','已完成'].includes(o.status))continue;
            const debtor=o.debtor===entity||o.promisor===entity,creditor=o.creditor===entity||o.promisee===entity,carrier=o.carrier===entity;
            if(!debtor&&!creditor&&!carrier)continue;
            const next={...o};
            if(carrier){next.carrier=wreck??successor;next.shortfallAt=now(d);emit(d,engine,{id:`${eventId}:shortfall:${id}`,verb:'shortfall',entity,cause:eventId,obligation:id});}
            if(debtor){
                const route=o.onDebtorGone??'accelerate';
                const target=route==='pursue'?input.soul:successor;
                if(route==='void'||!target){next.status='void';next.resolvedAt=now(d);}
                else{if(o.debtor===entity)next.debtor=target;if(o.promisor===entity)next.promisor=target;next.goneRoute=route;if(route==='accelerate')next.acceleratedAt=now(d);}
            }
            if(creditor){
                const route=o.onCreditorGone??'estate',target=route==='heirs'?input.successors?.[0]:successor;
                if(route==='void'||!target){next.status='void';next.resolvedAt=now(d);}
                else{if(o.creditor===entity)next.creditor=target;if(o.promisee===entity)next.promisee=target;}
            }
            d.set(['state','obligations',id],next);
        }
        const tombstone={...record,phase:'gone'};d.set([...root,'entities',entity],tombstone);
        writeRecord(d,engine,`transition:${entity}`,tombstone);
        d.set([...root,'tombstones',`${entity}:${generation}`],tombstone);
        d.set([...root,'history',`${entity}:${generation}:${cycle}`],tombstone);
        if(entityRow(d,entity))endEntity(d,{id:entity,basis,writer:W,eventId});
        invariant(d,entity);
        if(successor){
            const phase={id:successor,entity,phase:'notice',nextAt:now(d)+(input.durations?.notice??0),durations:input.durations??{},successors:input.successors??[],eventId,registeredSeq:parent.seq??0};
            d.set([...root,'procedures',successor],phase);
            writeRecord(d,engine,`transition_procedure:${successor}`,{category:'transition_procedure',...phase});
        }
        return tombstone;
    });
}

const phases=['notice','filing','settlement','distribution','closed'];
const terminal=o=>['void','settled','bad_debt','cancelled','取消','已完成'].includes(o.status);
function settleClaims(d,e,estate,claims,p){
    const groups=new Map();
    for(const o of claims){
        const amount=o.remaining??o.amount??o.coins;
        if(!Number.isSafeInteger(amount)||amount<0)return false;
        const resource=o.resource??'coin_river',priority=o.priority??({funeral:0,wage:1,tax:2}[o.kind]??3),key=`${priority}:${resource}`;
        if(!groups.has(key))groups.set(key,{priority,resource,rows:[]});groups.get(key).rows.push({o,amount});
    }
    for(const g of [...groups.values()].sort((a,b)=>a.priority-b.priority||a.resource.localeCompare(b.resource))){
        const accounts=Object.entries(read(d,'ledger','accounts')??{}).filter(([k,n])=>{const a=parseAccount(k);return a.owner===estate&&a.resource===g.resource&&n>0;}).sort(([a],[b])=>a.localeCompare(b));
        const total=g.rows.reduce((n,r)=>n+r.amount,0),available=Math.min(total,accounts.reduce((n,[,amount])=>n+amount,0));
        let allocated=0;
        const payments=g.rows.map(r=>{const numerator=BigInt(available)*BigInt(r.amount),denominator=BigInt(total||1),paid=Number(numerator/denominator);allocated+=paid;return {...r,paid,remainder:numerator%denominator};});
        payments.sort((a,b)=>a.remainder===b.remainder?a.o.id.localeCompare(b.o.id):a.remainder>b.remainder?-1:1);
        for(let i=0;i<available-allocated;i++)payments[i].paid++;
        for(const r of payments.sort((a,b)=>a.o.id.localeCompare(b.o.id))){
            const creditor=r.o.creditor??r.o.promisee;if(!creditor)return false;
            let left=r.paid;
            for(const [key] of accounts){const amount=Math.min(left,read(d,'ledger','accounts',key)??0);if(!amount)continue;
                transfer(d,{from:key,to:accountKey(creditor,g.resource,g.resource==='coin_river'?'purse':'inventory'),amount,writer:W,eventId:p.eventId});left-=amount;if(!left)break;}
            d.set(['state','obligations',r.o.id],{...r.o,status:r.paid===r.amount?'settled':'bad_debt',paid:(r.o.paid??0)+r.paid,badDebt:r.amount-r.paid,remaining:0,resolvedAt:now(d)});
            emit(d,e,{id:`${p.eventId}:settle:${r.o.id}`,verb:'protocol_stage',entity:estate,phase:'settlement',cause:p.eventId,obligation:r.o.id,paid:r.paid,badDebt:r.amount-r.paid});
        }
    }
    return true;
}
export function advanceProcedure(d,e,id,minute=now(d)){
    return atomic(d,()=>{
        let p=read(d,...root,'procedures',id);if(!p||p.phase==='closed'||p.nextAt>minute||p.frozen)return;
        for(let i=0;i<phases.length&&p.nextAt<=minute&&p.phase!=='closed';i++){
            const phase=p.phase;
            if(phase==='settlement'){
                // Package obligations require their own registered settlement handler.
                const owed=Object.values(read(d,'state','obligations')??{}).filter(o=>[o.debtor,o.promisor].includes(id)&&(o.goneRoute==='accelerate'||(o.deadline??Infinity)<=minute)&&!terminal(o));
                if(e.settleProtocolObligations)e.settleProtocolObligations(d,id,owed,p);
                else if(!settleClaims(d,e,id,owed,p)){d.set([...root,'procedures',id],{...p,awaiting:'settlement'});return;}
            }
            if(phase==='distribution'){
                const heirs=p.successors.filter(x=>!byEntity(d,x)?.gone);
                const assets=aliveHoldings(d,{holder:id}),accounts=Object.entries(read(d,'ledger','accounts')??{}).filter(([k,n])=>parseAccount(k).owner===id&&n);
                // No heir: seal the estate, rather than silently destroy assets.
                if(!heirs.length&&(assets.length||accounts.length)){d.set([...root,'procedures',id],{...p,awaiting:'heirs'});return;}
                let value=accounts.reduce((sum,[key,n])=>sum+n*(parseAccount(key).resource==='coin_river'?1:e.byId?.get(parseAccount(key).resource)?.basePrice??0),0);
                const transferred=[];
                for(const r of assets){value+=r.terms?.value??e.byId?.get(r.subject)?.basePrice??0;transferred.push(transferHolding(d,{id:r.id,holder:heirs[0],writer:W,engine:e,eventId:p.eventId}));}
                for(const [key,amount] of accounts){const ac=parseAccount(key);transfer(d,{from:key,to:accountKey(heirs[0],ac.resource,ac.purpose),amount,writer:W,eventId:p.eventId});}
                for(const [oid,o] of Object.entries(read(d,'state','obligations')??{}))if([o.debtor,o.promisor,o.creditor,o.promisee].includes(id)&&!terminal(o)){
                    if(!heirs.length){d.set([...root,'procedures',id],{...p,awaiting:'obligations'});return;}
                    const n={...o};for(const k of ['debtor','promisor','creditor','promisee'])if(n[k]===id)n[k]=heirs[0];
                    if(['assume_by_heirs','substitute_performance'].includes(o.goneRoute)){n.terms={...o.terms,liabilityCap:value};n.inheritanceFrom=id;n.originalTerms=o.terms??{};}
                    d.set(['state','obligations',oid],n);
                }
                p={...p,distribution:{heir:heirs[0]??null,value,holdings:transferred,accounts:accounts.map(([key,amount])=>({...parseAccount(key),amount}))}};
            }
            const next=phases[phases.indexOf(phase)+1];
            emit(d,e,{id:`${p.eventId}:phase:${phase}`,verb:'protocol_stage',entity:id,phase,cause:p.eventId,minute:p.nextAt,visibility:phase==='notice'?'public':'private'});
            p={...p,phase:next,nextAt:p.nextAt+(p.durations[next]??0)};
            if(next==='closed'){invariant(d,id);emit(d,e,{id:`${p.eventId}:phase:closed`,verb:'protocol_stage',entity:id,phase:'closed',cause:p.eventId});}
            updateEntity(d,{id,facts:{phase:next},writer:W,eventId:p.eventId});d.set([...root,'procedures',id],p);
            writeRecord(d,e,`transition_procedure:${id}`,{category:'transition_procedure',...p});
        }
    });
}
registerProtocolRunner({
    next:(e,d,at)=>Math.min(Infinity,...Object.values(read(d,...root,'procedures')??{}).filter(p=>p.phase!=='closed'&&!p.frozen&&!p.awaiting).map(p=>Math.max(at+1,p.nextAt))),
    items:(e,d,c)=>Object.values(read(d,...root,'procedures')??{}).filter(p=>p.phase!=='closed'&&p.nextAt<=c.after&&!p.frozen&&!p.awaiting).map(p=>({id:p.id,anchorId:p.id,registeredSeq:p.registeredSeq,execute:()=>advanceProcedure(d,e,p.id,c.after)})),
});

export function restoreTransition(d,engine,{entity,origin,eventId=`restored:${entity}:${now(d)}`,action,location,vital}){
    if(!['declaration_revoked','registered_action','underworld_case'].includes(origin)||origin==='registered_action'&&action?.produces!=='restored')throw Error('I26: unsupported restored source');
    return atomic(d,()=>{
        const r=byEntity(d,entity);if(!r?.gone)return r;
        if(origin==='declaration_revoked'&&(r.basis!=='declared'||r.actualDeath!==undefined))throw Error('Not a living declared person');
        const p=r.successor&&read(d,...root,'procedures',r.successor);
        if(p&&p.phase!=='closed'){
            for(const h of aliveHoldings(d,{holder:r.successor}))transferHolding(d,{id:h.id,holder:entity,writer:W,engine,eventId});
            for(const [key,amount] of Object.entries(read(d,'ledger','accounts')??{})){const ac=parseAccount(key);if(ac.owner===r.successor&&amount)transfer(d,{from:key,to:accountKey(entity,ac.resource,ac.purpose),amount,writer:W,eventId});}
            for(const [id,o] of Object.entries(read(d,'state','obligations')??{})){
                const n={...o};let changed=false;for(const k of ['debtor','creditor','promisor','promisee'])if(n[k]===r.successor){n[k]=entity;changed=true;}
                if(changed)d.set(['state','obligations',id],n);
            }
            d.set([...root,'procedures',r.successor],{...p,phase:'closed',restoredBy:eventId});updateEntity(d,{id:r.successor,facts:{phase:'closed'},writer:W,eventId});
            writeRecord(d,engine,`transition_procedure:${r.successor}`,{category:'transition_procedure',...p,phase:'closed',restoredBy:eventId});
        }
        if(p?.phase==='closed'&&p.distribution?.heir){
            const receipt=p.distribution,heir=receipt.heir;
            let benefit=0;
            for(const ac of receipt.accounts){const present=read(d,'ledger','accounts',accountKey(heir,ac.resource,ac.purpose))??0;
                benefit+=Math.min(ac.amount,present)*(ac.resource==='coin_river'?1:engine.byId?.get(ac.resource)?.basePrice??0);}
            for(const hid of receipt.holdings){const h=holdingRow(d,hid);if(h?.until===undefined&&h.holder===heir)benefit+=h.terms?.value??engine.byId?.get(h.subject)?.basePrice??0;}
            if(benefit>0){const id=`${eventId}:compensation:${heir}`;d.set(['state','obligations',id],{id,kind:'compensation',debtor:heir,creditor:entity,resource:'coin_river',amount:benefit,remaining:benefit,status:'pending',cause:eventId});}
            for(const [id,o]of Object.entries(read(d,'state','obligations')??{}))if(o.inheritanceFrom===r.successor&&!terminal(o)){
                const n={...o,terms:o.originalTerms??{}};for(const k of ['debtor','promisor'])if(n[k]===heir)n[k]=entity;
                delete n.inheritanceFrom;delete n.originalTerms;d.set(['state','obligations',id],n);
            }
        }
        // Restore personal civil facts, never appointments or spent assets.
        for(const id of new Set([...r.holdings,...r.subjectHoldings])){const h=holdingRow(d,id);if(!h||h.until===undefined||!['citizen_of','resident_of','resides','household_member','certified','kin'].includes(h.kind))continue;
            if(h.subject!==entity&&(byEntity(d,h.subject)?.gone||entityRow(d,h.subject)?.goneAt!==undefined))continue;
            if(h.kind==='kin'&&h.variant==='spouse'&&[h.holder,h.subject].some(x=>aliveHoldings(d,{kind:'kin',holder:x}).some(k=>k.variant==='spouse'&&![h.holder,h.subject].includes(k.subject))))continue;
            if(!aliveHoldings(d,{kind:h.kind,holder:h.holder,subject:h.subject}).some(k=>(k.variant??null)===(h.variant??null)))openHolding(d,{...h,writer:W,engine,eventId,reason:'opened',place:h.concluded?.place,lawVersion:h.concluded?.lawVersion,form:h.concluded?.form});}
        if(r.basis==='death'||r.actualDeath!==undefined){
            const path=entity==='player'?['state','player']:read(d,'state','npcs',entity)?['state','npcs',entity]:['state','creatures',entity];
            d.set([...path,'status'],'正常');d.remove([...path,'diedAt']);
            d.set([...path,'incarnation'],r.generation+1);
            if(read(d,...path,'hp')!==undefined)d.set([...path,'hp'],Math.max(1,Math.min(read(d,...path,'maxHp')??1,vital?.hp??read(d,...path,'maxHp')??1)));
            if(r.wreck&&entityRow(d,r.wreck)){
                for(const [id,l]of Object.entries(read(d,'holdings','locations')??{}))if(l.at===r.wreck)setLocation(d,{entity:id,at:entity,mode:'carried',writer:W,engine});
                endEntity(d,{id:r.wreck,basis:'destruction',writer:W,eventId});
            }
        }
        const next={...r,gone:false,restoredAt:now(d),restoredBy:eventId};d.set([...root,'entities',entity],next);
        writeRecord(d,engine,`transition:${entity}`,next);
        if(location)d.set(['state',entity==='player'?'location':'npcs',...(entity==='player'?[]:[entity,'location'])],location);
        emit(d,engine,{id:eventId,verb:'restored',entity,cause:r.eventId,visibility:'public'});invariant(d);return next;
    });
}
