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
