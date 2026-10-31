import {recordsWhere,recordEntriesWhere} from './storage.mjs';
function perceptionRuntime(){return perceptionRuntime.handler;}
export function installEventPerception(handler){perceptionRuntime.handler=handler;}
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('world-events',{kinds:[]});
import {isPhysicallyDead} from './holdings.mjs';
// Normalized world events. Every settled tool call yields one event
// {verb,actor,target,harm|gift|value,witnesses,location,tags,minute}; side
// outcomes settled in the same call (an unpaid delivery is a gift) add their
// own. Social systems subscribe by verb and tag, never by tool name, so a spell
// that wounds, a theft and a gift reach the same reactions as a sword blow.
// Social events are kept in records as `world_event:<eventId>[:n]`.
import {eventWeight} from './standing.mjs';
import {recordCareerMetrics} from './career-metrics.mjs';
import {personAge} from './entity-view.mjs';
import {reactionSortKey,PHASE} from './scheduler.mjs';
export const WORLD_EVENT_VERSION=1;
// References use record keys; event ids remain domain ids. Consumers may read
// payload facts, but canonical identity/time/actor cannot be overwritten by it.
export function worldEvent(state,reference){
    if(typeof reference!=='string')return null;
    const key=reference.startsWith('world_event:')?reference:`world_event:${reference}`,row=state.records?.[key];
    return row?.category==='world_event'&&key===`world_event:${row.id}`?{...row.payload,...row}:null;
}
export function recordHistoricalEvent(d,engine,event){
    const now=d.get('state','minute'),key=`world_event:${event.id}`;
    if(typeof event.id!=='string'||!event.id||typeof event.verb!=='string'||!event.verb||!Number.isSafeInteger(event.minute)||event.minute<0||event.minute>now||event.source?.kind!=='corpus_premise'||typeof event.source.row!=='string'||!event.source.row)throw Error('Invalid historical event');
    if(d.get('state','records',key))throw Error('Historical event already exists');
    if(event.actor!==null&&event.actor!==undefined&&(typeof event.actor!=='string'||event.actor!=='player'&&!d.get('state','npcs',event.actor)&&!d.get('state','creatures',event.actor)&&!engine.byId?.has(event.actor)&&!d.get('holdings','entities',event.actor)))throw Error('Historical actor does not exist');
    // Importing history never repeats its money, ownership or social effects.
    const observer=event.payload?.observer;
    if(observer!==undefined&&observer!=='player'&&!d.get('state','npcs',observer)&&!d.get('state','creatures',observer))throw Error('Historical observer does not exist');
    const row={...structuredClone(event),category:'world_event',visibility:'private',witnesses:[...new Set([...event.witnesses??[],...observer?[observer]:[]])],...(observer?{observer}:{}),...(typeof event.payload?.name==='string'?{summary:event.payload.name}:{})};
    holdingSet(d,engine,['state','records',key],row,'world-events');
    return key;
}
// "I saw this" resolves only an exact version already known to the speaker.
// This adapter grants neither knowledge nor access to private event records.
export function knownWorldEventReference(state,observer,{reference,content}={}){
    const known=new Set(recordsWhere(state.records,'category','knowledge').filter(r=>r.observer===observer&&r.complete!==false&&(r.minute??0)<=state.minute).map(r=>r.sourceEvent));
    const rows=recordEntriesWhere(state.records,'category','world_event').filter(([key,r])=>key===`world_event:${r.id}`&&r.minute<=state.minute&&(r.actor===observer||r.observer===observer||r.witnesses?.includes(observer)||known.has(r.id))).map(([,r])=>r);
    const matches=rows.filter(r=>reference===r.id||reference===`world_event:${r.id}`||reference==='self'&&typeof content==='string'&&content===(r.summary??r.payload?.name));
    return matches.length===1?matches[0].id:null;
}
export const SOCIAL_VERBS=new Set(['harm','clash','steal','gift','help','trade','learn','organize','breach','author','deceive','pact','duel','appoint','dismiss','salary','die','detain','release','migrate','close','transfer','promote','marry','vocation','contest_win','contest_lose']);
const awake=(state,id,n)=>n&&!isPhysicallyDead(null,state,id)&&!['濒死','昏迷'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/(睡眠|熟睡|睡觉)/.test(n.activity??'');
SOCIAL_VERBS.add('proposal_rejected');
for(const verb of ['obligation_opened','obligation_amended','obligation_closed','obligation_settled','obligation_performed'])SOCIAL_VERBS.add(verb);
// Registered at load, never while an action runs: the verbs published by obligation receipts, protocol stages,
// mark reactions ('tell') and profession entry requests ('request').
for(const verb of ['tell','request'])SOCIAL_VERBS.add(verb);
for(const verb of ['transition','holding_opened','holding_closed','holding_transferred','holding_rescaled','succession','claim','protocol_stage','restored','shortfall','judgment'])SOCIAL_VERBS.add(verb);
const resolve=(engine,value)=>{if(!value)return null;try{return engine.resolve(value);}catch{return null;}};

export function presentWitnesses(state,location,exclude=[]){
    return Object.entries(state.npcs??{}).filter(([id,n])=>n.location===location&&awake(state,id,n)&&!exclude.includes(id)).map(([id])=>id).sort();
}
// 事件里的物品价值：事件发生时所在地的市场估值；未知值保留 null。
// 估值登记在更高层（finance-assets），这里只留安装口，避免低层反向依赖。
function worthRuntime(){return worthRuntime.worth;}
export function installEventWorth(fn){worthRuntime.worth=fn;}
const valueOf=(engine,state,item,quantity=1,location=state.location)=>worthRuntime()?.(engine,state,{item,quantity,location})??null;

// Unpaid deliveries completed in this call: the existing kindness rule for gifts.
function obligationGifts(engine,before,after){
    const rows=[];
    for(const [id,o]of Object.entries(after.obligations??{})){
        const old=before.obligations?.[id];
        if(!old||old.status===o.status||o.status!=='已完成'||o.type!=='送货')continue;
        const kept=o.keptBy??[o.promisor];if(!kept.includes(o.promisor))continue;
        const paid=Object.values(after.obligations).some(x=>x.type==='付款'&&x.promisor===o.promisee&&x.promisee===o.promisor&&Math.abs((x.createdAt??0)-(o.createdAt??0))<=1440)
            ||Object.values(after.records??{}).some(r=>r.category==='debt'&&r.debtor===o.promisee&&r.creditor===o.promisor);
        if(paid)continue;
        const minute=o.resolvedAt??o.completion?.minute??o.deadline??after.minute;
        rows.push({verb:'gift',actor:o.promisor,target:o.promisee,gift:{item:o.item,quantity:o.quantity},value:valueOf(engine,after,o.item,o.quantity??1,o.location??after.location),
            location:o.location??after.location,minute,tags:['gift','obligation'],source:{obligation:id},key:`obligation:${id}:gift`});
    }
    return rows;
}

// Clock producers and the legacy call-level adapter use the same default:
// the debtor breached against the creditor (the bank's keeper for a bank).
export function creditBreachEvent(id,row,location){
    return {verb:'breach',actor:row.debtor,target:row.keeper??row.creditor,value:row.defaulted.remaining,location:row.location??location,minute:row.defaulted.minute,
        witnesses:[],tags:['contract','breach','debt',row.kind],source:{debt:id},...(row.defaulted.case?{case:row.defaulted.case}:{}),key:`debt:${id}:breach`};
}
function creditBreaches(before,after){
    const rows=[];
    for(const [id,r]of Object.entries(after.records??{})){
        if(r.category!=='debt'||!r.defaulted||before.records?.[id]?.defaulted)continue;
        const event=creditBreachEvent(id,r,after.location);
        // Clock producers publish at the default tick. Keep the legacy
        // before/after adapter only for debts without that settled event.
        if(after.records[`world_event:${event.key}`]?.category==='world_event')continue;
        rows.push(event);
    }
    return rows;
}

export function deriveWorldEvents(engine,before,after,{tool,args={},detail={},eventId,legacy=false}){
    if(tool==='craft'&&args.operation==='repair')tool='repair';
    const location=before.location,minute=after.minute;
    let e={verb:tool,actor:'player',target:null,tags:[tool]};
    if(detail.status==='rejected'){
        e={verb:'proposal_rejected',actor:'player',target:detail.seller??null,reason:detail.reason,tags:['proposal_rejected']};
    }else if(tool==='combat'&&detail.target){
        const intent=args.intent??'attack',hostile=['attack','shove'].includes(intent);
        e={verb:hostile?'harm':'clash',actor:detail.actor??'player',target:detail.target,harm:Math.max(0,detail.damage??0),tags:['combat',`tactic:${intent}`,...(hostile?['hostile','violence']:[])]};
        if(detail.duel)e={verb:'duel',actor:detail.actor??'player',target:detail.target,harm:Math.max(0,detail.damage??0),tags:['combat','duel',detail.duelRule],duel:detail.duel};
    }else if(tool==='cast'){
        const spell=engine.byId.get(detail.spell??resolve(engine,args.spell)),kind=spell?.effectSpec?.kind;
        const target=typeof detail.target==='string'&&detail.target!=='player'?detail.target:null;
        if(!legacy&&kind==='damage'&&target&&detail.success&&Object.hasOwn(detail,'damage'))
            e={verb:'harm',actor:'player',target,harm:Math.max(0,detail.damage),tags:['magic','hostile','violence',`damage:${spell.effectSpec.damageType??'untyped'}`],spell:spell.id};
        else if(!legacy&&kind==='heal'&&target&&detail.success&&detail.healed>0)
            e={verb:'help',actor:'player',target,value:detail.healed,tags:['magic','heal'],spell:spell.id};
        else e={verb:'cast',actor:'player',target:resolve(engine,args.target),tags:['magic'],...(spell?{spell:spell.id}:{})};
    }else if(tool==='crime'&&detail.target){
        const stolen=detail.stolen,value=stolen?.coins??after.records?.[detail.case]?.value??(stolen?.item?valueOf(engine,after,stolen.item):0);
        e={verb:'steal',actor:'player',target:detail.target,value,witnesses:[...new Set(detail.witnesses??[])].sort(),
            ...(detail.perception?{perception:detail.perception}:{}),stolen:detail.stolen,tags:['crime','hostile','theft',detail.success?'success':'attempt',...(detail.witnesses?.length?['discovered']:[])],case:detail.case};
    }else if(tool==='trade'){
        const buyer=detail.buyer??resolve(engine,args.buyer??'player'),seller=detail.seller??resolve(engine,args.seller);
        e={verb:'trade',actor:buyer,target:seller,value:detail.cost??0,tags:['trade',args.payment==='repay'?'repay':detail.debt?'credit':'cash']};
    }else if(tool==='law'&&detail.worldEvent){
        // An exposed bribe: the taker breached the office; the briber's own case is filed separately.
        e={...detail.worldEvent,tags:[...detail.worldEvent.tags]};
    }else if(detail.lieEvent){
        // U8: an exposed lie. The liar deceived the target; private lies keep their tag.
        e={...detail.lieEvent,tags:[...detail.lieEvent.tags],witnesses:[...detail.lieEvent.witnesses]};
    }else if(detail.workEvent){
        e={actor:'player',...detail.workEvent};
    }else if(detail.organizationEvent){
        e={actor:'player',...detail.organizationEvent};
    }else if(detail.socialEvent){
        e={actor:'player',...detail.socialEvent};
    }else if(tool==='learn'){
        e={verb:'learn',actor:'player',target:detail.teacher??null,tags:['learn',detail.success?'success':'attempt']};
    }
    const primary={id:eventId,minute,location,witnesses:e.witnesses??presentWitnesses(before,location,[e.target]),tool,...e};
    if(legacy)primary.legacy=true;
    const gifts=obligationGifts(engine,before,after).map((g,i)=>({id:`${eventId}:${i+1}`,sourceEvent:eventId,witnesses:presentWitnesses(after,g.location,[g.actor,g.target]),tool,...g,...(legacy?{legacy:true}:{})}));
    const breaches=legacy?[]:creditBreaches(before,after).map((b,i)=>({id:`${eventId}:${gifts.length+i+1}`,sourceEvent:eventId,tool,...b}));
    return [primary,...gifts,...breaches];
}

// Subscribers register themselves from their own module:
//   registerWorldEventSubscriber({id,order,on(d,engine,events,context)})
// and are settled in ascending order (ties keep registration order). The store
// lives on a hoisted function so modules in an import cycle with this one can
// register while it is still evaluating.
function subscriberStore(){return subscriberStore.rows??=[];}
export function registerWorldEventSubscriber(subscriber){
    const {id,order,on,priorityClass='social',packId='core',ruleId=id}=subscriber??{};
    if(typeof id!=='string'||!id||!Number.isFinite(order)||typeof on!=='function')throw Error('世界事件订阅者须有 id、order 与 on');
    const rows=subscriberStore();
    if(rows.some(s=>s.id===id))throw Error(`世界事件订阅者重复登记：${id}`);
    rows.push({id,order,on,priorityClass,packId,ruleId});rows.sort((a,b)=>a.order-b.order);
    return()=>{const i=rows.findIndex(s=>s.id===id);if(i>=0)rows.splice(i,1);};
}
export function worldEventSubscribers(){return subscriberStore().map(({id,order})=>({id,order}));}
export function beginReactionTick(d){
    if(!d.scheduler)return;
    d.reactionTick={queue:[],cursor:0,count:0,seen:new Set(),active:null};
}
export function drainWorldReactions(d){
    const tick=d.reactionTick;if(!tick||tick.draining)return;
    tick.draining=true;
    try{
        while(tick.cursor<tick.queue.length){
            const {engine,events,context,subscribers,depth,metrics}=tick.queue[tick.cursor++];
            if(depth>16)throw Error('反应总深度超过 16，回滚本次推进');
            for(const s of subscribers){
                const key=`${s.id}:${events.map(e=>e.seq??e.id).join(',')}`;
                if(tick.seen.has(key))continue;
                tick.seen.add(key);
                const limited=['social','autonomy'].includes(s.priorityClass);
                if(limited&&(depth>d.scheduler.config.depthLimit||tick.count>=d.scheduler.config.proposalLimit)){
                    const cause=events[0];
                    const id=`reaction_cut:${cause.seq??cause.id}:${s.id}`;
                    holdingSet(d,engine,['state','records',`world_event:${id}`],{category:'world_event',id,verb:'reaction_cut',cause:cause.seq,depth,rule:s.id,limit:depth>d.scheduler.config.depthLimit?'depth':'proposal',minute:cause.minute,phase:PHASE.reaction},'world-events');
                    continue;
                }
                tick.active={depth,priorityClass:s.priorityClass,cause:events[0].seq};
                s.on(d,engine,events,context);
                tick.active=null;
            }
            if(metrics)recordCareerMetrics(d,engine,metrics,context);
        }
    }finally{tick.active=null;tick.draining=false;}
}
export function publishWorldEvents(d,engine,events,context,subscribers){
    events=events.map(event=>event.value===null&&['gift','steal'].includes(event.verb)?{...event,unvaluable:event.unvaluable??(event.verb==='gift'?'对方无法估值':'无法核定案值'),valuationNote:event.valuationNote??(event.verb==='gift'?'无从估价：对方无法估值，不计价值，只计心意。':'无从估价：无法核定案值。')}:event);
    for(const event of events)if(event.verb==='gift'&&event.unvaluable)d.say?.(event.valuationNote);
    if(!context.legacy)events=events.map(event=>{
        // This card resolves the player's local intelligent layer only. Remote
        // producers keep their existing contract until S7 supplies that model.
        if(event.location!==d.get('state','location')||privateWorldEvent(event))return event;
        let perception=event.perception??perceptionRuntime()?.(engine,d.document,event,{exclude:[event.actor]});
        if(!perception?.sourceZone)return event;
        // Producers also use witnesses:[actor] for the actor's own observation
        // (e.g. a response to a mark). Self knowledge is not an outside sight test.
        if(event.witnesses?.includes(event.actor))perception={...perception,versions:{...perception.versions,[event.actor]:{self:true,visual:false,auditory:false,tactile:false,identified:true,complete:true,zone:perception.sourceZone,sourceZone:perception.sourceZone,distanceMeters:0}}};
        const witnesses=Object.keys(perception.versions).filter(id=>perception.versions[id].identified&&(event.witnesses===undefined||event.witnesses.includes(id)||event.tags?.includes('npc_crime')&&id==='player')).sort();
        return {...event,perception,witnesses};
    });
    events=events.map(e=>e.verb==='steal'?{...e,filingVersion:1,visibility:'private',participants:[e.actor,...e.witnesses??[]]}:e);
    if(d.reactionTick?.active){
        const {depth,cause}=d.reactionTick.active;
        events=events.map(e=>({...e,depth,cause,phase:PHASE.reaction}));
    }
    if(d.scheduler)events=events.map(e=>SOCIAL_VERBS.has(e.verb)?{...e,seq:d.get('state','records',`world_event:${e.id}`)?.seq??e.seq??d.scheduler.nextSeq()}:e);
    if(!context.legacy)for(const e of events)if(SOCIAL_VERBS.has(e.verb)&&e.actor){
        const key=`world_event:${e.id}`;if(d.get('state','records',key))continue;
        const {legacy:_,...row}=e;holdingSet(d,engine,['state','records',key],{category:'world_event',...row},'world-events');
        for(const [observer,version]of Object.entries(e.perception?.versions??{}))if(version.auditory&&!version.identified){
            const id=`perception:${e.id}:${observer}`;
            holdingSet(d,engine,['state','records',id],{category:'knowledge',id,kind:'sound',observer,sourceEvent:e.id,minute:e.perception.minute,location:e.location,zone:version.sourceZone,complete:false,content:'传来动静，听不清是谁',participants:[]},'world-events');
        }
    }
    if(d.scheduler){
        const own=!d.reactionTick;
        if(own)beginReactionTick(d);
        const tick=d.reactionTick;
        if(tick.active)tick.count+=events.length;
        const rows=subscribers?subscribers.map((on,i)=>({id:`explicit:${i}`,on,priorityClass:'social',packId:'core',ruleId:String(i).padStart(6,'0')})):subscriberStore();
        const ordered=[...rows].sort((a,b)=>{const x=reactionSortKey(a),y=reactionSortKey(b);for(let i=0;i<x.length;i++){if(x[i]<y[i])return -1;if(x[i]>y[i])return 1;}return 0;});
        const causes=[...events].sort((a,b)=>(a.seq??0)-(b.seq??0));
        for(const [i,event]of causes.entries())tick.queue.push({engine,events:[event],context,subscribers:ordered,depth:(tick.active?.depth??0)+1,metrics:i===causes.length-1?events:null});
        if(own){try{drainWorldReactions(d);}finally{delete d.reactionTick;}}
        return;
    }
    for(const s of subscribers??subscriberStore().map(s=>s.on))s(d,engine,events,context);
    // Career metrics observe every settled call, after the social subscribers.
    recordCareerMetrics(d,engine,events,context);
}

export function worldEvents(state,filter=()=>true){
    return Object.values(state.records??{}).filter(r=>r.category==='world_event'&&filter(r)).sort((a,b)=>a.minute-b.minute||a.id.localeCompare(b.id));
}

// Offscreen producers call this after committing their domain transition.
// Stable domain ids guard both persistence and subscriber delivery on replay.
export function publishTransitionEvent(d,engine,event){
    if(d.get('state','records',`world_event:${event.id}`))return false;
    // S2b：推进接线后，离屏产生的事件从当前调度器取全局单调序号（14 §14.2）。
    if(d.scheduler&&event.seq===undefined)event={...event,seq:d.scheduler.nextSeq()};
    let before=d.get('state'),detail={};
    // Vital primitives already carry the native, post-resistance HP result.
    // Recover this child's exact HP transition, even when several wounds were
    // settled before the event queue drains; never use requested damage.
    const result=event.result,target=event.target;
    if(event.primitive==='vital'&&event.verb==='harm'&&Number.isFinite(result?.damage)&&result.damage>=0&&Number.isFinite(result.targetHp)&&result.target===target){
        const body=target==='player'?before.player:before.npcs?.[target];
        if(body){
            const old={...body,hp:result.targetHp+result.damage};
            before=target==='player'?{...before,player:old}:{...before,npcs:{...before.npcs,[target]:old}};
            detail={...result};event={...event,harm:result.damage};
        }
    }
    publishWorldEvents(d,engine,[event],{before,args:{},detail,eventId:event.id,tool:event.tool??'advance'});
    return true;
}

// A witnessed event of enough weight becomes a rumor that people can retell
// along the existing conversation and courier routes. Minors are never the
// subject of an event rumor; private facts are excluded where memories are made.
export const RUMOR_WEIGHT=10;
const minor=(engine,state,id,minute)=>{const age=personAge(engine,state,id,minute).value,base=state.created?.[id]??state.family?.people?.[id]??engine.byId.get(id);return Boolean(base?.flags?.minor||base?.minor||age!==null&&age<18);};
export const privateWorldEvent=e=>e?.private||['private','secret','members'].includes(e?.visibility)||e?.tags?.some(t=>['private','secret'].includes(t));
export function publicTransition(engine,state,e){
    return e?.tags?.includes('entity-transition')&&e.visibility==='public'&&!privateWorldEvent(e)&&
        ![e.subject,e.actor,e.target,...e.participants??[]].some(id=>id&&minor(engine,state,id,e.minute));
}
export function eventRumorId(engine,state,e){
    // Filing keeps the incident record private; actual witnesses can still tell
    // their own observations. This grants no access to the private case itself.
    const incident=state.records?.[e?.case],witnessedTheft=e?.verb==='steal'&&incident?.category==='legal_suspicion'&&incident.sourceEvent===e.id&&e.visibility==='private'&&!e.private&&!e.tags?.some(t=>['private','secret'].includes(t));
    if(!e||e.legacy||privateWorldEvent(e)&&!witnessedTheft||!e.witnesses?.length)return null;
    if(e.tags?.includes('facility'))return `rumor_event:${e.id}`;
    if(publicTransition(engine,state,e))return `rumor_event:${e.id}`;
    if(!['harm','steal','help','gift'].includes(e.verb)&&!e.tags?.includes('npc_crime')||Math.abs(eventWeight(e,engine,state))<RUMOR_WEIGHT||[e.actor,e.target].some(id=>minor(engine,state,id,e.minute)))return null;
    return `rumor_event:${e.id}`;
}
export function eventRumorRecorded(state,rumor){
    return typeof rumor==='string'&&rumor.startsWith('rumor_event:')&&state.records?.[`world_event:${rumor.slice(12)}`]?.category==='world_event';
}
// U8: a recorded lie travels as a rumor under its own id while its ledger row exists.
export const lieRumorId=id=>`rumor_${id}`;
export function lieRumorRecorded(state,rumor){
    if(typeof rumor!=='string'||!rumor.startsWith('rumor_lie:'))return false;
    const lie=state.records?.[rumor.slice(6)];return lie?.category==='lie'&&!lie.private;
}
