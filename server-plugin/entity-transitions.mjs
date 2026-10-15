import {publishTransitionEvent,presentWitnesses} from './world-events.mjs';
import {personName} from './entity-view.mjs';
import {currentShops} from './shop.mjs';

// Called by domain writers after committing a transition. Text is a historical
// fact captured here; projections never rewrite it with a later identity.
export function entityTransition(d,engine,{id,verb,actor,target=null,subject=target??actor,minute=d.get('state','minute'),location=null,visibility='public',witnesses,participants=[actor,target],tags=[],...facts}){
    const event={id,verb,actor,target,subject,minute,location,visibility,participants:participants.filter(Boolean),
        witnesses:witnesses??(location?presentWitnesses(d.get('state'),location):[]),tags:['entity-transition',...tags],tool:'advance',...facts};
    publishTransitionEvent(d,engine,event);return event;
}

// Only mutation sites take these snapshots. Reading shops never writes a row.
export const businessSnapshot=(engine,state)=>currentShops(engine,state);
export function businessTransitions(d,engine,before,sourceEvent,minute=d.get('state','minute')){
    const after=currentShops(engine,{...d.get('state'),minute}),name=id=>personName(engine,d.get('state'),id).value??id;
    for(const shop of before){
        const next=after.find(s=>s.id===shop.id),moved=next&&next.location!==shop.location;
        if(next?.keeper===shop.keeper&&!moved)continue;
        const verb=!next||moved?'close':'transfer';
        entityTransition(d,engine,{id:`${sourceEvent}:shop:${shop.id}`,verb,actor:shop.keeper,target:next?.keeper??null,subject:shop.id,minute,location:shop.location??shop.settlement,
            tags:['shop'],shop:shop.id,previousKeeper:shop.keeper,keeper:next?.keeper??null,
            summary:verb==='close'?`${shop.name}已停业`:`${shop.name}改由${name(next.keeper)}经营`});
    }
}

// PR-01 obligation handover (K11). Each kind of obligation a holder carries
// registers how to find it and what happens when the holder is gone (death,
// removal, destruction, defection, departure). Real transition entries call
// settleHolderGone once, before publishing their own event; each kind that
// actually hands something over publishes one transition through entityTransition.
// var: kinds may register while this module is still in an import cycle.
var obligationKinds;
function kindList(){return obligationKinds??=[];}
export function registerObligation(kind){
    if(!kind||typeof kind.kind!=='string'||typeof kind.list!=='function'||typeof (kind.settle??kind.onHolderGone)!=='function')throw new Error('义务类型需要 kind、list 和 onHolderGone');
    const obligationKinds=kindList();
    if(obligationKinds.some(k=>k.kind===kind.kind))throw new Error(`义务类型重复：${kind.kind}`);
    obligationKinds.push({order:100,stage:'handover',...kind});obligationKinds.sort((a,b)=>a.order-b.order);
}
export const obligationKindNames=()=>kindList().map(k=>k.kind);
export function settleHolderGone(engine,d,holder,reason,{stage='handover',minute=d.get('state','minute'),eventId=`${reason}:${holder}:${minute}`,location=null,...context}={}){
    const out={};
    for(const kind of kindList()){
        if(kind.stage!==stage||kind.reasons&&!kind.reasons.includes(reason))continue;
        const list=kind.list(engine,d,holder,reason);if(!list?.length)continue;
        const ctx={...context,holder,reason,minute,eventId,location};
        const done=(kind.settle?kind.settle(engine,d,list,ctx):list.map(o=>kind.onHolderGone(engine,d,o,ctx)))?.filter(Boolean)??[];
        if(!done.length)continue;out[kind.kind]=done;
        entityTransition(d,engine,{id:`${eventId}:${kind.kind}`,verb:kind.verb??'transfer',actor:holder,target:kind.target?.(done,ctx)??null,minute,location,visibility:kind.visibility??'public',
            tags:['obligation',kind.kind,reason],summary:kind.summary(done,ctx),handover:done});
    }
    return out;
}
