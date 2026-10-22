import {pruneRecords} from './record-cleanup.mjs';
// Mark reactions are observations, never fulfillment of the original intent.
import {presentWitnesses,publishTransitionEvent,SOCIAL_VERBS,registerWorldEventSubscriber} from './world-events.mjs';
import {digest,recordsWhere} from './storage.mjs';

export function reactToMark(d,engine,mark,{eventId,suppressed=false}={}){
 const stored=d.get('state','records',`mark:${mark.id}`);
 if(!stored?.active||d.get('holdings','entities',mark.id,'goneAt')!==undefined)return {triggered:false,suppressed,reactions:[]};
 suppressed=stored.suppressed;
 const rules=engine.world.openReactions?.rules;
 if(!Array.isArray(rules))throw Error('缺少存档中的留痕反应规则');
 const now=d.get('state','minute'),window=engine.world.openActionRules.mark.reactionWindow;
 const observers=presentWitnesses(d.get('state'),mark.location,[mark.author]).filter(id=>{
  if(mark.zone===null||mark.zone===undefined)return true;
  const state=d.get('state'),position=state.records?.[`local_actor_position:${id}`];
  return state.npcs?.[id]?.zone===mark.zone||position?.location===mark.location&&position.zone===mark.zone;
 });
 const reactions=[];
 for(const tag of mark.tags.filter(t=>t.startsWith('mark:'))){
  const rule=rules.find(r=>r.tag===tag);if(!rule)throw Error(`留痕标签没有反应规则：${tag}`);
  const key=`mark_reaction_batch:${mark.id}:${tag}`,batch=d.get('state','records',key);
  const prior=recordsWhere(d.get('state','records'),'category','mark_reaction_batch').filter(r=>r.mark!==mark.id&&r.author===mark.author&&r.location===mark.location&&r.tag===tag&&r.minute>now-window&&r.minute<=now);
  // One mark is one exposure, irrespective of the number of observers. Keep
  // exposure history when a mark is replaced, so replacement cannot reset it.
  const delta=batch?.delta??(suppressed?0:Math.trunc(rule.standing*2**-prior.length)||0);
  let triggered=false;
  for(const observer of observers){
   const id=`mark_reaction:${digest({mark:mark.id,tag,observer}).slice(0,32)}`;
   if(d.get('state','records',`world_event:${id}`))continue;
   publishTransitionEvent(d,engine,{id,parent:eventId,verb:'tell',actor:observer,target:mark.author,location:mark.location,minute:now,visibility:'witnessed',witnesses:[observer],tags:[tag],payload:{kind:'mark_reaction',mark:mark.id,text:rule.response,delta,suppressed}});
   // The actual observer's tell is persisted now. delta is the bounded input
   // for the standing consumer, not a claim that its projection has changed.
   // C owns that consumer; this L1 producer must not import its L3 writer.
   reactions.push({observer,tag,event:id,delta,text:rule.response});triggered=true;
  }
  if(triggered&&!batch){
   d.set(['state','records',key],{category:'mark_reaction_batch',mark:mark.id,author:mark.author,location:mark.location,tag,minute:now,suppressed,delta});
   // Only batches inside the exposure window matter to later marks; the rest is capped.
   pruneRecords(d,'mark_reaction_batch',{exempt:r=>r.minute>now-window,max:128});
  }
 }
 return {triggered:reactions.length>0,suppressed,reactions};
}

// Existing world events provide the next perception opportunity, including a
// visitor arriving after creation. Stable observer keys also cover save replay.
registerWorldEventSubscriber({id:'open-mark-observation',order:65,on(d,engine,events){
 if(!engine.world.openReactions||!engine.world.openActionRules)return;
 const locations=new Set(events.filter(e=>e.payload?.kind!=='mark_reaction').map(e=>e.location));
 if(!locations.size)return;
 for(const row of recordsWhere(d.get('state','records'),'category','mark'))if(row.active&&locations.has(row.location)){
  const mark=d.get('state','created',row.id);if(mark)reactToMark(d,engine,mark,{eventId:events[0].id,suppressed:row.suppressed});
 }
}});
