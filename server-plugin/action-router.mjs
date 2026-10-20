// Native routing policy (06 §6.8). Never executes a proposal's declared result.
import {MemoryIndex,bm25TermScore} from './retrieval.mjs';
import {isPhysicallyDead,located} from './holdings.mjs';
import {actionReader} from './action-capacity.mjs';
import {parseAccount} from './ledger.mjs';
import {PrimitiveRejected} from './primitive-policy.mjs';
import {environmentFeatures} from './environment.mjs';

const tokenizer=new MemoryIndex();
const multiset=values=>{const out=new Map();for(const value of values)out.set(value,(out.get(value)??0)+1);return out;};
export function signatureJaccard(left,right){
 const a=multiset(left),b=multiset(right);let common=0,total=0;
 for(const key of new Set([...a.keys(),...b.keys()])){common+=Math.min(a.get(key)??0,b.get(key)??0);total+=Math.max(a.get(key)??0,b.get(key)??0);}
 return total?common/total:0;
}
export function effectSignature(effects,{kindOf=()=>null,bindings={},actor='player'}={}){
 const bind=value=>value==='$actor'?actor:value&&typeof value==='object'&&value.slot?bindings[value.slot]:value;
 return effects.map(effect=>{
  const target=bind(effect.target??effect.entity??effect.subject??effect.to);
  const slot=(effect.target??effect.entity??effect.subject??effect.to)?.slot;
  const kind=(effect.op==='create'?effect.kind:null)??kindOf(target)??(slot?bindings[`kind:${slot}`]:null)??'*';
  const resource=effect.op==='transfer'?String(bind(effect.from)??'').split('|')[1]:null;
  return JSON.stringify([effect.op,kind,effect.field??effect.resource??resource??effect.verb??effect.status??effect.type??'']);
 }).sort();
}
function actionSignature(action,context,slots){
 if(Array.isArray(action.signature))return [...action.signature].sort();
 const effects=Array.isArray(action.outcomes)?action.outcomes:action.outcomes?.success??action.outcomes?.accepted;
 if(!effects)return []; // Legacy definitions need authored signatures, not guessed intent IDs.
 const bindings={...slots};for(const slot of action.slots??[])if(slot.entity)bindings[`kind:${slot.name}`]=slot.entity;
 return effectSignature(effects,{...context,bindings});
}
function textScores(actions,intent){
 const query=new Set(tokenizer.terms(intent)),rows=actions.map(action=>{
  const fields=[action.label,action.verb,...action.synonyms??[],...action.llm?.examples??[]].filter(Boolean);
  const terms=fields.flatMap(text=>tokenizer.terms(text));return {terms,frequencies:multiset(terms)};
 });
 const df=new Map();for(const row of rows)for(const term of row.frequencies.keys())df.set(term,(df.get(term)??0)+1);
 const average=rows.reduce((sum,row)=>sum+row.terms.length,0)/Math.max(1,rows.length);
 // Normalize each term against its theoretical saturation, not the best candidate:
 // an unrelated sole candidate must not acquire a perfect text score.
 const maximum=[...query].reduce((sum,term)=>sum+bm25TermScore(1e9,df.get(term)??0,rows.length,average,average),0);
 return rows.map(row=>maximum?[...query].reduce((sum,term)=>sum+bm25TermScore(row.frequencies.get(term)??0,df.get(term)??0,rows.length,row.terms.length,average),0)/maximum:0);
}
const fits=(action,participants,kindOf)=>Object.entries(action.participants??{}).every(([role,types])=>{
 if(role==='others')return true; // A1 participant slot names, not a kind predicate.
 const entity=participants[role];if(types==='player')return entity==='player';
 const allowed=Array.isArray(types)?types:[types];return entity!==undefined&&allowed.includes(kindOf(entity));
});
export function routeAction(proposal,registry,context){
 if(typeof context?.visible!=='function'||typeof context.kindOf!=='function'||typeof context.slotsFor!=='function')throw Error('Routing requires native visibility, kinds and slot extraction');
 const participants={...proposal.participants,actor:context.actor??'player'};
 // No source, check, effects, consent or cost from a proposal can replace the definition.
 // The proposal gateway describes an entry point, not a concrete neighbour;
 // routing back into it would recurse and distort the BM25 candidate corpus.
 const actions=registry.actions.filter(a=>a.call?.tool!=='world_propose'&&!a.readOnly&&!a.projection&&fits(a,participants,context.kindOf)&&context.visible(a,participants));
 const texts=textScores(actions,proposal.intent??''),signature=effectSignature(proposal.effects??[],context);
 const candidates=actions.map((action,index)=>{
  const slots=context.slotsFor(action,proposal)??{},missing=(action.slots??[]).filter(s=>s.required&&slots[s.name]===undefined&&action.call?.fixed?.[s.name]===undefined).map(s=>s.name);
  const signatureScore=signatureJaccard(signature,actionSignature(action,context,slots)),textScore=texts[index];
  return {id:action.id,score:.6*signatureScore+.4*textScore,signatureScore,textScore,slots,missing};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 const best=candidates[0],matched=best&&best.score>=.7;
 return {signature,candidates,routed:matched&&!best.missing.length?best.id:null,needsSlots:matched&&best.missing.length?{action:best.id,missing:best.missing}:null,nearest:best??null};
}

// Only currently accessible objects enter name resolution. Global engine.resolve
// is intentionally not used here: knowing a private id is not perception.
export function actorKnowledge(engine,document,actor='player'){
 const current=actor==='player'?document.state:document.state.npcs?.[actor]??{},base=actor==='player'?{}:engine.byId.get(actor)??{};
 const skillMap=(value,proficiencies={})=>Array.isArray(value)?Object.fromEntries(value.map(id=>[id,proficiencies[id]??0])):value??{};
 const knownMap=value=>Array.isArray(value)?Object.fromEntries(value.map(id=>[id,true])):value??{};
 return {skills:{...base.proficiencies,...skillMap(base.skills,base.proficiencies),...skillMap(current.skills,base.proficiencies)},spells:{...knownMap(base.spells),...knownMap(current.spells)},recipes:{...knownMap(base.recipes),...knownMap(current.recipes)}};
}
export function createRoutingContext(engine,document,{actor='player'}={}){
 const state=document.state,d=actionReader(document),location=actor==='player'?state.location:state.npcs?.[actor]?.location;
 const pool=new Map(),add=(id,kind,row={})=>{
  if(id!==actor&&(row.hidden||row.private))return;
  if(id)pool.set(id,{id,kind,name:row.name??engine.byId.get(id)?.name??id,aliases:row.aliases??engine.byId.get(id)?.aliases??[]});
 };
 add(actor,'person',actor==='player'?state.player:state.npcs?.[actor]);
 if(actor!=='player'&&state.location===location)add('player','person',state.player);
 for(const [id,row] of Object.entries(state.npcs??{}))if(row.location===location&&!row.scheduleTravel&&!row.cognitionTravel&&!isPhysicallyDead(engine,d,id))add(id,'person',row);
 for(const [id,row] of Object.entries(state.creatures??{}))if(row.location===location&&!isPhysicallyDead(engine,d,id))add(id,'creature',row);
 const bag=actor==='player'?state.inventory:state.npcs?.[actor]?.inventory;
 for(const [id,row] of Object.entries(bag??{}))if((typeof row==='number'?row:row.quantity??0)>0)add(id,'item');
 for(const [id,row] of Object.entries(state.created??{}))if(row.location===location&&document.holdings?.entities?.[id]?.goneAt===undefined)add(id,row.kind,row);
 for(const [id,row] of Object.entries(document.holdings?.entities??{}))if(row.goneAt===undefined&&located(d,id,x=>state.npcs?.[x]?.location??engine.byId.get(x)?.location??null)===location)add(id,row.kind,row.facts);
 for(const row of Object.values(state.records??{}))if(row.category==='rite_project'&&row.actor===actor&&row.status==='active'&&row.location===location)add(row.id,'project',{name:engine.byId.get(row.action)?.name??row.id});
 add(location,'place');
 const place=engine.byId.get(location);
 for(const feature of place?.features??[])if(!feature.hidden&&!feature.private)add(feature.id,feature.kind??'thing',feature);
 for(const route of engine.world.routes??[]){
  const ends=route.ends??route.nodes??[route.from,route.to];
  if(ends.includes(location))for(const id of ends)if(id&&id!==location)add(id,'place');
 }
 const knowledge=actorKnowledge(engine,document,actor);
 for(const [field,kind] of [['skills','skill'],['spells','spell'],['recipes','recipe']])for(const [id,value] of Object.entries(knowledge[field]??{}))if(value||field==='skills'&&value===0)add(id,kind);
 const owner=id=>typeof id==='string'&&id.includes('|')?parseAccount(id).owner:id;
 const kindOf=id=>pool.get(owner(id))?.kind??null;
 const features=environmentFeatures(engine);
 const inaccessible=id=>{
  const feature=features.find(row=>row.id===id),entity=document.holdings?.entities?.[id],row=state.npcs?.[id]??state.creatures?.[id]??state.created?.[id]??feature??engine.byId.get(id);
  if(!row&&!entity&&id!=='player')return 'unknown_entity';
  const at=id==='player'?state.location:located(d,id,x=>state.npcs?.[x]?.location??state.creatures?.[x]?.location??state.created?.[x]?.location??(x===id?row?.location:null)??null);
  if(entity?.goneAt!==undefined||at&&at!==location||row?.scheduleTravel||row?.cognitionTravel||!at&&/^npc_/.test(id))return 'not_present';
  return 'not_perceivable';
 };
 const resolve=(value,kind=null)=>{
  const raw=owner(value),normalize=x=>String(x).trim().normalize('NFKC').toLowerCase(),q=normalize(raw);
  const id=['self','me','myself','i','我','自己','本人','自身','$actor'].includes(q)?actor:raw;
  const exact=pool.get(id),known=exact||id==='player'||engine.byId.has(id)||state.npcs?.[id]||state.creatures?.[id]||state.created?.[id]||document.holdings?.entities?.[id]||features.some(row=>row.id===id);
  const matchesKind=r=>!kind||r.kind===kind||['npc','agent'].includes(kind)&&r.kind==='person';
  // Exact ids (including inaccessible ones) never fall through to name matching.
  const choices=(known?(exact&&matchesKind(exact)?[exact]:[]):[...pool.values()].filter(r=>matchesKind(r)&&[r.name,...r.aliases].some(n=>normalize(n)===q))).map(({aliases,...r})=>r).sort((a,b)=>a.id.localeCompare(b.id));
  if(choices.length===1)return {value:typeof value==='string'&&value.includes('|')?value.replace(raw,choices[0].id):choices[0].id,candidates:choices};
  return {value:null,candidates:choices,...(!choices.length?{reason:known?inaccessible(id):'unknown_entity'}:{})};
 };
 const slotsFor=(action,proposal)=>{
  const slots={},target=proposal.participants?.target;
  for(const slot of action.slots??[]){
   let value=proposal.participants?.[slot.name]??proposal.means?.[slot.name];
   if(value===undefined&&slot.fill==='target')value=target;
   if(value===undefined)for(const e of proposal.effects??[]){
    if(e[slot.name]!==undefined){value=e[slot.name];break;}
    if(e.op==='create'&&e.facts?.[slot.name]!==undefined){value=e.facts[slot.name];break;}
    if(slot.name==='destination'&&e.op==='move'){value=e.to;break;}
    if(slot.name==='source'&&e.op==='learn'){value=e.learningSource;break;}
    if(['skill','spell','recipe'].includes(slot.entity)&&e.op==='learn'&&e.subject!==undefined){
     const subject=resolve(e.subject,slot.entity);if(subject.value!==null){value=subject.value;break;}
    }
    if(slot.name==='quantity'&&e.qty!==undefined){value=e.qty;break;}
    if(slot.entity&&target!==undefined&&kindOf(target)===(slot.entity==='npc'?'person':slot.entity)){value=target;break;}
   }
   if(value===undefined&&slot.name==='intent')value=proposal.intent;
   if(value===undefined)value=slot.default;
   if(value===undefined)continue;
   if(slot.entity){const resolved=resolve(value,slot.entity);if(resolved.value!==null)value=resolved.value;else continue;}
   if(typeof slot.options==='object'&&Array.isArray(slot.options)&&!slot.options.includes(value))continue;
   slots[slot.name]=value;
  }
  return slots;
 };
 return {actor,kindOf,resolve,entities:[...pool.values()].map(({aliases,...r})=>r),slotsFor,visible:(action,participants)=>{
  if(Object.entries(participants).some(([role,id])=>role!=='actor'&&typeof id==='string'&&!kindOf(id)))return false;
  const target=participants.target,catalog=action.visibility?.catalog;
  if(catalog?.startsWith('target:')&&!target)return false;
  if(catalog==='target:npc'&&kindOf(target)!=='person'||catalog==='target:item'&&kindOf(target)!=='item'||catalog==='target:place'&&kindOf(target)!=='place')return false;
  return (action.preconditions??[]).every(condition=>{
   if(typeof condition!=='string')return true;
   if(condition==='present(target)')return kindOf(target)==='person';
   if(condition==='hasItems')return Object.values(bag??{}).some(v=>(typeof v==='number'?v:v.quantity??0)>0);
   if(condition==='hasSkill')return Object.keys(knowledge.skills??{}).length>0;
   return true; // Execution owns the complete precondition/authority check.
  });
 }};
}

export function resolveProposalEntities(proposal,context){
 const resolved=structuredClone(proposal),ambiguities=[],rejections=[];
 const entityFields=new Set(['target','entity','subject','to','from','holder','newHolder','debtor','creditor']);
 const resolve=(value,path)=>{
  if(typeof value!=='string')return value;
  const result=context.resolve(value);
  if(result.value===null){
   if(result.candidates.length>1)ambiguities.push({path,value,candidates:result.candidates});
   else rejections.push({path,value,reason:result.reason??'unknown_entity'});
   return value;
  }
  return result.value;
 };
 for(const [role,value] of Object.entries(resolved.participants??{}))if(role!=='actor')resolved.participants[role]=resolve(value,`participants.${role}`);
 for(const [i,effect] of (resolved.effects??[]).entries())for(const [field,value] of Object.entries(effect))if(entityFields.has(field)){
  // Account owners are entity references; destinations such as coordinates or
  // canonical sink accounts remain the primitive validator's responsibility.
  if(typeof value==='string'&&/^(sink|src):/.test(value))continue;
  effect[field]=resolve(value,`effects.${i}.${field}`);
 }
 // A failed reference takes precedence over clarification of another reference.
 if(rejections.length){
  const error=new PrimitiveRejected('E-OPEN-ENTITY',`${rejections[0].reason}: ${rejections[0].path}`);
  Object.assign(error,{reason:rejections[0].reason,rejections});throw error;
 }
 return {proposal:resolved,ambiguities};
}
