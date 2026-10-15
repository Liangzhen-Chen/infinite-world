// Completion evidence for a named individual; callers write after state changes.
export const villageWildlifeFresh=engine=>!engine.replaying||engine.replayResult?.villageWildlifeVersion===1;
export function recordCreatureResolution(d,engine,{target,outcome,eventId,location}){
 if(!engine.rules.questSources?.wildlife?.length||!villageWildlifeFresh(engine))return null;
 const id=`creature_resolution:${eventId}:${target}`;
 if(!d.get('state','records',id))d.set(['state','records',id],{category:'creature_resolution',subject:target,outcome,actor:'player',location,minute:d.get('state','minute'),sourceEvent:eventId});
 return id;
}
const alive=a=>a&&a.hp>0&&a.status==='正常'&&!a.owner;
export function existingWildlifeEvidence(state,o){
 if(o.type==='pact')return (state.creatures?.[o.target]??state.npcs?.[o.target])?.negotiation?.history?.map(h=>`pact:${o.target}:${h.event}`)??[];
 return Object.entries(state.records??{}).filter(([,r])=>r.category==='creature_resolution'&&r.subject===o.target).map(([key])=>key);
}
export function wildlifeQuestEvidence(d,q){
 const o=q.objective,a=d.get('state','creatures',o.target)??d.get('state','npcs',o.target);
 if(!a)return null;
 if(o.type==='creature'){
  if(a.species!==o.species||a.owner)return null;
  const valid={death:()=>a.status==='死亡'&&a.hp===0,expelled:()=>a.location===null&&a.activity==='已驱离',ferried:()=>a.status==='已超度'&&a.spirit?.realm==='beyond'};
  for(const [key,r] of Object.entries(d.get('state','records')??{})){
   if(r.category!=='creature_resolution'||r.subject!==o.target||r.actor!=='player'||r.location!==o.location||r.minute<(q.acceptedAt??Infinity)||!o.outcomes.includes(r.outcome)||!valid[r.outcome]?.())continue;
   if(!q.evidenceBefore?.includes(key)&&!d.get('state','records',`quest_wildlife_claim:${key}`))return {key,outcome:r.outcome,target:o.target};
  }
 }
 if(o.type==='pact'&&alive(a)){
  const n=a.negotiation,r=n?.relation,h=n?.history?.find(h=>h.event===r?.event);
  if(!h?.accepted||h.minute<(q.acceptedAt??Infinity)||r.pact!==o.pact)return null;
  const enough=(actual,required)=>required.every(r=>actual.some(x=>x.item===r.item&&x.quantity>=r.quantity));
  if(!enough(h.terms.offer,o.offer)||!enough(h.terms.request,o.request))return null;
  const key=`pact:${o.target}:${h.event}`;
  if(!q.evidenceBefore?.includes(key)&&!d.get('state','records',`quest_wildlife_claim:${key}`))return {key,outcome:'pact',target:o.target};
 }
 return null;
}
export function claimWildlifeQuest(d,q,evidence){
 d.set(['state','records',`quest_wildlife_claim:${evidence.key}`],{category:'quest_wildlife_claim',quest:q.id,...evidence,minute:d.get('state','minute')});
}
