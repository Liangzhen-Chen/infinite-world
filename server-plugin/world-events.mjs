// Normalized world events. Every settled tool call yields one event
// {verb,actor,target,harm|gift|value,witnesses,location,tags,minute}; side
// outcomes settled in the same call (an unpaid delivery is a gift) add their
// own. Social systems subscribe by verb and tag, never by tool name, so a spell
// that wounds, a theft and a gift reach the same reactions as a sword blow.
// Social events are kept in records as `world_event:<eventId>[:n]`.
import {eventWeight} from './standing.mjs';
import {recordCareerMetrics} from './career-metrics.mjs';
import {personAge} from './entity-view.mjs';
export const WORLD_EVENT_VERSION=1;
export const SOCIAL_VERBS=new Set(['harm','clash','steal','gift','help','trade','learn','organize','breach','author','deceive','pact','duel','appoint','dismiss','salary','die','detain','release','migrate','close','transfer','promote','marry','vocation']);
const awake=n=>n&&!['死亡','濒死','昏迷'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/(睡眠|熟睡|睡觉)/.test(n.activity??'');
const resolve=(engine,value)=>{if(!value)return null;try{return engine.resolve(value);}catch{return null;}};

export function presentWitnesses(state,location,exclude=[]){
    return Object.entries(state.npcs??{}).filter(([id,n])=>n.location===location&&awake(n)&&!exclude.includes(id)).map(([id])=>id).sort();
}
const valueOf=(engine,item,quantity=1)=>(engine.byId.get(item)?.basePrice??0)*quantity;

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
        rows.push({verb:'gift',actor:o.promisor,target:o.promisee,gift:{item:o.item,quantity:o.quantity},value:valueOf(engine,o.item,o.quantity??1),
            location:o.location??after.location,minute,tags:['gift','obligation'],source:{obligation:id},key:`obligation:${id}:gift`});
    }
    return rows;
}

// Credit contracts (loan, partnership) that went into default during this call:
// the debtor breached against the creditor (the bank's keeper for a bank).
function creditBreaches(before,after){
    const rows=[];
    for(const [id,r]of Object.entries(after.records??{})){
        if(r.category!=='debt'||!r.defaulted||before.records?.[id]?.defaulted)continue;
        rows.push({verb:'breach',actor:r.debtor,target:r.keeper??r.creditor,value:r.defaulted.remaining,location:r.location??after.location,minute:r.defaulted.minute,
            witnesses:[],tags:['contract','breach','debt',r.kind],source:{debt:id},...(r.defaulted.case?{case:r.defaulted.case}:{}),key:`debt:${id}:breach`});
    }
    return rows;
}

export function deriveWorldEvents(engine,before,after,{tool,args={},detail={},eventId,legacy=false}){
    if(tool==='craft'&&args.operation==='repair')tool='repair';
    const location=before.location,minute=after.minute;
    let e={verb:tool,actor:'player',target:null,tags:[tool]};
    if(tool==='combat'&&detail.target){
        const intent=args.intent??'attack',hostile=['attack','shove'].includes(intent);
        e={verb:hostile?'harm':'clash',actor:'player',target:detail.target,harm:Math.max(0,detail.damage??0),tags:['combat',`tactic:${intent}`,...(hostile?['hostile','violence']:[])]};
        if(detail.duel)e={verb:'duel',actor:'player',target:detail.target,harm:Math.max(0,detail.damage??0),tags:['combat','duel',detail.duelRule],duel:detail.duel};
    }else if(tool==='cast'){
        const spell=engine.byId.get(detail.spell??resolve(engine,args.spell)),kind=spell?.effectSpec?.kind;
        const target=typeof detail.target==='string'&&detail.target!=='player'?detail.target:null;
        if(!legacy&&kind==='damage'&&target&&detail.success&&Object.hasOwn(detail,'damage'))
            e={verb:'harm',actor:'player',target,harm:Math.max(0,detail.damage),tags:['magic','hostile','violence',`damage:${spell.effectSpec.damageType??'untyped'}`],spell:spell.id};
        else if(!legacy&&kind==='heal'&&target&&detail.success&&detail.healed>0)
            e={verb:'help',actor:'player',target,value:detail.healed,tags:['magic','heal'],spell:spell.id};
        else e={verb:'cast',actor:'player',target:resolve(engine,args.target),tags:['magic'],...(spell?{spell:spell.id}:{})};
    }else if(tool==='crime'&&detail.target){
        const stolen=detail.stolen,value=stolen?.coins??(stolen?.item?valueOf(engine,stolen.item):0);
        e={verb:'steal',actor:'player',target:detail.target,value,witnesses:[...new Set(detail.witnesses??[])].sort(),
            tags:['crime','hostile','theft',detail.success?'success':'attempt',...(detail.witnesses?.length?['discovered']:[])],case:detail.case};
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
    const {id,order,on}=subscriber??{};
    if(typeof id!=='string'||!id||!Number.isFinite(order)||typeof on!=='function')throw Error('世界事件订阅者须有 id、order 与 on');
    const rows=subscriberStore();
    if(rows.some(s=>s.id===id))throw Error(`世界事件订阅者重复登记：${id}`);
    rows.push({id,order,on});rows.sort((a,b)=>a.order-b.order);
    return()=>{const i=rows.findIndex(s=>s.id===id);if(i>=0)rows.splice(i,1);};
}
export function worldEventSubscribers(){return subscriberStore().map(({id,order})=>({id,order}));}
export function publishWorldEvents(d,engine,events,context,subscribers=subscriberStore().map(s=>s.on)){
    if(!context.legacy)for(const e of events)if(SOCIAL_VERBS.has(e.verb)&&e.actor){
        const key=`world_event:${e.id}`;if(d.get('state','records',key))continue;
        const {legacy:_,...row}=e;d.set(['state','records',key],{category:'world_event',...row});
    }
    for(const s of subscribers)s(d,engine,events,context);
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
    publishWorldEvents(d,engine,[event],{before:d.get('state'),args:{},detail:{},eventId:event.id,tool:event.tool??'advance'});
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
    if(!e||e.legacy||privateWorldEvent(e)||!e.witnesses?.length)return null;
    if(e.tags?.includes('facility'))return `rumor_event:${e.id}`;
    if(publicTransition(engine,state,e))return `rumor_event:${e.id}`;
    if(!['harm','steal','help','gift'].includes(e.verb)&&!e.tags?.includes('npc_crime')||Math.abs(eventWeight(e))<RUMOR_WEIGHT||[e.actor,e.target].some(id=>minor(engine,state,id,e.minute)))return null;
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
