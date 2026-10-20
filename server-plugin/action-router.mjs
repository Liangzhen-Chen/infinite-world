// Native routing policy (06 §6.8). Never executes a proposal's declared result.
import {MemoryIndex,bm25TermScore,normalize} from './retrieval.mjs';
import {isPhysicallyDead,located,aliveHoldings} from './holdings.mjs';
import {actionReader} from './action-capacity.mjs';
import {parseAccount,accountKey,LEDGER_COIN} from './ledger.mjs';
import {partyAccount} from './money.mjs';
import {PrimitiveRejected} from './primitive-policy.mjs';
import {environmentFeatures} from './environment.mjs';
import {localWeather} from './weather.mjs';
import {mapView} from './ui-map.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {finePaymentContext} from './obligation-runtime.mjs';
import {npcServices} from './npc-state.mjs';
import {facilityRuntime} from './facility-state.mjs';
import {activeDuel} from './duels.mjs';
import {templeById} from './faith-catalog.mjs';
import {knownWorldEventReference} from './world-events.mjs';

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
  const resource=effect.op==='transfer'?effect.resource??String(bind(effect.from)??'').split('|')[1]:null;
  return JSON.stringify([effect.op,kind,effect.field??(resource==='coin'?LEDGER_COIN:resource)??effect.verb??effect.status??effect.type??'']);
 }).sort();
}
function actionSignature(action,context,slots){
 if(Array.isArray(action.signature))return [...action.signature].sort();
 const effects=Array.isArray(action.outcomes)?action.outcomes:action.outcomes?.success??action.outcomes?.accepted;
 if(!effects)return []; // Legacy definitions need authored signatures, not guessed intent IDs.
 const bindings={...slots};for(const slot of action.slots??[])if(slot.entity)bindings[`kind:${slot.name}`]=slot.entity;
 return effectSignature(effects,{...context,bindings});
}
function actionSignatures(action,context,slots,proposal){
 return [...(action.signature?.variants??[actionSignature(action,context,slots)]),...(context.nativeSignatures?.(action,slots,proposal)??[])];
}
function textScores(actions,intent){
 const termsFor=text=>/^[\u3400-\u9fff]$/.test(text)?[normalize(text)]:tokenizer.terms(text);
 const query=new Set(tokenizer.terms(intent)),rows=actions.map(action=>{
  const fields=[action.label,action.verb,...action.synonyms??[],...action.llm?.examples??[]].filter(Boolean);
  const terms=fields.flatMap(termsFor);return {terms,frequencies:multiset(terms)};
 });
 // The retrieval tokenizer uses Chinese bigrams in a sentence, while the
 // catalogue also authors one-character verbs such as 买/卖/做/偷. Include
 // those authored terms when present so they can receive the same BM25 weight.
 const text=normalize(intent);
 for(const action of actions)for(const field of [action.label,action.verb,...action.synonyms??[]])if(typeof field==='string'&&/^[\u3400-\u9fff]$/.test(field)&&text.includes(normalize(field)))query.add(normalize(field));
 const df=new Map();for(const row of rows)for(const term of row.frequencies.keys())df.set(term,(df.get(term)??0)+1);
 const average=rows.reduce((sum,row)=>sum+row.terms.length,0)/Math.max(1,rows.length);
 // Normalize each authored phrase against its own BM25 score. Extra words in
 // an intent must not dilute a complete action phrase; unrelated text stays 0,
 // including when there is only one candidate.
 return actions.map((action,index)=>Math.max(0,...[action.label,action.verb,...action.synonyms??[],...action.llm?.examples??[]].filter(Boolean).map(field=>{
  const terms=new Set(termsFor(field)),row=rows[index];
  const weight=term=>bm25TermScore(row.frequencies.get(term)??0,df.get(term)??0,rows.length,row.terms.length,average);
  const maximum=[...terms].reduce((sum,term)=>sum+weight(term),0);
  return maximum?[...terms].filter(term=>query.has(term)).reduce((sum,term)=>sum+weight(term),0)/maximum:0;
 })));
}
const fits=(action,participants,kindOf)=>Object.entries(action.participants??{}).every(([role,types])=>{
 if(role==='others')return true; // A1 participant slot names, not a kind predicate.
 const entity=participants[role];if(types==='player')return entity==='player';
 const allowed=Array.isArray(types)?types:[types];return entity!==undefined&&allowed.includes(kindOf(entity));
});
export function routeAction(proposal,registry,context){
 if(typeof context?.visible!=='function'||typeof context.kindOf!=='function'||typeof context.slotsFor!=='function')throw Error('Routing requires native visibility, kinds and slot extraction');
 const actor=context.actor??'player',inferred=proposal.effects?.map(e=>e.target??e.entity).find(id=>typeof id==='string'&&id!==actor),target=proposal.target??inferred;
 const participants={...(target!==undefined?{target}:{}),...proposal.participants,actor};
 // No source, check, effects, consent or cost from a proposal can replace the definition.
 // The proposal gateway describes an entry point, not a concrete neighbour;
 // routing back into it would recurse and distort the BM25 candidate corpus.
 const requestKinds=proposal.effects?.filter(e=>e.op==='emit').map(e=>e.payload?.kind).filter(Boolean)??[];
 const actions=registry.actions.filter(a=>a.call?.tool!=='world_propose'&&(!(a.readOnly||a.projection)||context.canProject?.(a,proposal))&&(!requestKinds.length||!a.signature?.requestKinds||requestKinds.some(kind=>a.signature.requestKinds.includes(kind)))&&fits(a,participants,context.kindOf)&&context.visible(a,participants,proposal));
 const texts=textScores(actions.map(action=>({...action,synonyms:[...action.synonyms??[],...context.labelsFor?.(action,proposal)??[]]})),proposal.intent??''),signature=effectSignature(proposal.effects??[],context);
 const candidates=actions.map((action,index)=>{
  const slots=context.slotsFor(action,proposal)??{},required=new Set(context.requiredSlots?.(action,slots)??[]),missing=(action.slots??[]).filter(s=>(s.required||required.has(s.name))&&slots[s.name]===undefined&&action.call?.fixed?.[s.name]===undefined).map(s=>s.name);
  // A selected read projection has an exactly empty effect footprint. Generic
  // empty proposals still have zero Jaccard and cannot select a write action.
  const signatureScore=context.canProject?.(action,proposal)?1:Math.max(0,...actionSignatures(action,context,slots,proposal).map(value=>signatureJaccard(signature,value))),textScore=texts[index];
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
 const state=document.state,d=actionReader(document);
 const features=environmentFeatures(engine,document),featureById=new Map(features.map(row=>[row.id,row]));
 const currentLocation=id=>located(d,id,x=>x==='player'?state.location:state.npcs?.[x]?.location??state.creatures?.[x]?.location??state.created?.[x]?.location??featureById.get(x)?.location??engine.byId.get(x)?.location??null);
 const location=currentLocation(actor);
 const pool=new Map(),add=(id,kind,row={})=>{
  if(id!==actor&&(row.hidden||row.private))return;
  kind??=pool.get(id)?.kind;
  if(!kind)return;
  if(id)pool.set(id,{id,kind,name:row.name??engine.byId.get(id)?.name??id,aliases:row.aliases??engine.byId.get(id)?.aliases??[]});
 };
 const banks=new Map((engine.rules.economy?.credit?.banks??[]).map(row=>[row.id,row]));
 for(const row of Object.values(state.records??{}))if(row.category==='bank')banks.set(row.id,{...banks.get(row.id),...row});
 add(actor,'person',actor==='player'?state.player:state.npcs?.[actor]);
 if(actor!=='player'&&state.location===location)add('player','person',state.player);
 for(const [id,row] of Object.entries(state.npcs??{}))if(currentLocation(id)===location&&!row.scheduleTravel&&!row.cognitionTravel&&!isPhysicallyDead(engine,d,id))add(id,'person',row);
 for(const [id,row] of Object.entries(state.creatures??{}))if(currentLocation(id)===location&&!isPhysicallyDead(engine,d,id))add(id,'creature',row);
 const bag=actor==='player'?state.inventory:state.npcs?.[actor]?.inventory;
 for(const [id,row] of Object.entries(bag??{}))if((typeof row==='number'?row:row.quantity??0)>0)add(id,'item');
 for(const [id,row] of Object.entries(state.created??{}))if(currentLocation(id)===location&&document.holdings?.entities?.[id]?.goneAt===undefined)add(id,row.kind,row);
 for(const [id,row] of Object.entries(document.holdings?.entities??{}))if(row.goneAt===undefined&&currentLocation(id)===location)add(id,row.kind,row.facts);
 for(const [id,row] of Object.entries(state.itemInstances??{}))if(!row.physicalFeature&&['持有','封存','落地','袋内','保管'].includes(row.status)&&currentLocation(id)===location){
  const physical=state.records?.[`physical_item:${id}`],base=engine.byId.get(row.item);
  add(id,'item',{...physical?.facts,name:physical?.name??(pool.has(row.item)?id:base?.name??id),aliases:physical?.aliases??[]});
 }
 for(const row of Object.values(state.records??{}))if(row.category==='rite_project'&&row.actor===actor&&row.status==='active'&&row.location===location)add(row.id,'project',{name:engine.byId.get(row.action)?.name??row.id});
 add(location,'place');
 for(const row of banks.values())if(row.location===location)add(row.id,'organization',row);
 const place=engine.byId.get(location);
 for(const feature of features)if(currentLocation(feature.id)===location&&!feature.hidden&&!feature.private)add(feature.id,feature.kind??'thing',feature);
 // Use existing public local areas; a relative description never creates a
 // new space, position or passage. Traversal still checks the physical path.
 for(const zone of place?.zones??place?.areas??[])if(zone&&typeof zone==='object'&&zone.visible!==false&&zone.accessible!==false)add(zone.id,'zone',{...zone,name:zone.name??zone.label});
 const summons=new Map(Object.entries(state.effects??{}).filter(([,row])=>row.kind==='summon'&&row.owner===actor&&row.expires>state.minute));
 for(const [id,row] of summons)if(row.location===location){
  const spell=engine.byId.get(row.spell);
  add(id,'creature',{...row,name:row.name??spell?.name??id,aliases:[...row.aliases??[],...spell?.aliases??[]]});
 }
 for(const route of engine.world.routes??[]){
  const ends=route.ends??route.nodes??[route.from,route.to];
  if(ends.includes(location))for(const id of ends)if(id&&id!==location)add(id,'place');
 }
 const knowledge=actorKnowledge(engine,document,actor);
 const catalog=(value,kind)=>{
  const rows=({skill:engine.world.skills,spell:engine.world.spells,recipe:engine.world.recipes,item:engine.world.items})[kind]??[];
  // Catalog identity is public; ownership and learned proficiency are checked
  // by the selected program, never inferred from a proposal's assertion.
  return rows.find(row=>row.id===value)?.id;
 };
 for(const [field,kind] of [['skills','skill'],['spells','spell'],['recipes','recipe']])for(const [id,value] of Object.entries(knowledge[field]??{}))if(value||field==='skills'&&value===0)add(id,kind);
 const owner=id=>typeof id==='string'&&id.includes('|')?parseAccount(id).owner:id;
 const kindOf=id=>pool.get(owner(id))?.kind??null;
 const inaccessible=id=>{
  const feature=features.find(row=>row.id===id),entity=document.holdings?.entities?.[id],row=state.npcs?.[id]??state.creatures?.[id]??state.created?.[id]??state.effects?.[id]??banks.get(id)??feature??engine.byId.get(id);
  if(!row&&!entity&&id!=='player')return 'unknown_entity';
  const at=currentLocation(id)??row?.location;
  if(entity?.goneAt!==undefined||at&&at!==location||row?.scheduleTravel||row?.cognitionTravel||!at&&/^npc_/.test(id))return 'not_present';
  return 'not_perceivable';
 };
 const resolve=(value,kind=null)=>{
  let raw;try{raw=owner(value);}catch{throw new PrimitiveRejected('E-OPEN-ACCOUNT','账户引用格式无效');}
  const normalize=x=>String(x).trim().normalize('NFKC').toLowerCase(),q=normalize(raw);
  const id=['self','me','myself','i','我','自己','本人','自身','$actor'].includes(q)?actor:raw;
  const exact=pool.get(id),known=exact||id==='player'||engine.byId.has(id)||banks.has(id)||state.npcs?.[id]||state.creatures?.[id]||state.created?.[id]||state.effects?.[id]||document.holdings?.entities?.[id]||features.some(row=>row.id===id);
  const matchesKind=r=>!kind||kind==='entity'||r.kind===kind||['npc','agent'].includes(kind)&&r.kind==='person';
  // Exact ids (including inaccessible ones) never fall through to name matching.
  const ownedDescription=q.match(/^(?:本人|我|自己)(?:在场|携带)?的(?:唯一)?(.+)$/)?.[1];
  const localDescription=q.match(/^(?:眼前相邻|眼前|面前|旁边|在场的|现场的)(?:唯一的?|的)?(.+)$/)?.[1];
  const owned=id=>(typeof bag?.[id]==='number'?bag[id]:bag?.[id]?.quantity??0)>0||state.creatures?.[id]?.owner===actor||summons.has(id)||aliveHoldings(d,{kind:'owns',holder:actor,subject:id}).length>0;
  const choices=(known?(exact&&matchesKind(exact)?[exact]:[]):[...pool.values()].filter(r=>matchesKind(r)&&[r.name,...r.aliases].some(n=>normalize(n)===q||ownedDescription&&owned(r.id)&&normalize(n)===ownedDescription||localDescription&&r.id!==actor&&normalize(n)===localDescription))).map(({aliases,...r})=>r).sort((a,b)=>a.id.localeCompare(b.id));
  if(choices.length===1)return {value:typeof value==='string'&&value.includes('|')?value.replace(raw,choices[0].id):choices[0].id,candidates:choices};
  const exactId=known||/^[a-z][a-z0-9]*[_:][a-z0-9_:.-]+$/i.test(String(id));
  return {value:null,candidates:choices,...(!choices.length?{reason:known?inaccessible(id):exactId?'unknown_entity':'unresolved_reference'}:{})};
 };
 let knownDestinations;
 const destinations=()=>{
  if(!knownDestinations){const map=actor==='player'?mapView(engine,document):null;knownDestinations=new Map([...(map?.locations??[]),...(map?.transit??[])].map(row=>[row.id,row]));}
  return knownDestinations;
 };
 const resolveDestination=value=>{
  const local=resolve(value),eligible=row=>['place','zone','person','creature'].includes(row.kind)||features.some(feature=>feature.id===row.id)||document.holdings?.entities?.[row.id]?.kind==='node';
  const candidates=local.candidates.filter(eligible);
  if(local.value===value&&candidates.length===1)return local;
  const known=destinations(),exact=known.get(value);
  if(exact)return {value:exact.id,candidates:[{id:exact.id,kind:'place',name:exact.name}]};
  // Discovery records also cover buildings and other known places omitted by
  // the map UI's hierarchy filter. They identify a destination, not visibility.
  const discovery=state.discoveries?.[value],destination=engine.world.locations.find(row=>row.id===value);
  if(destination&&!destination.hidden&&!destination.private&&discovery&&(discovery.minute??discovery.updated??0)<=state.minute&&(!discovery.private||(discovery.permittedRecipients??discovery.knownBy??[]).includes(actor))&&(!discovery.permittedRecipients||discovery.permittedRecipients.includes(actor)))return {value,candidates:[{id:value,kind:'place',name:destination.name}]};
  // Public map names are travel references, not physical perception. Search
  // only the player's known map and preserve ambiguity between equal names.
  if(engine.byId.has(value))return resolve(value,'place');
  const q=String(value).trim().normalize('NFKC').toLowerCase(),matches=[...known.values()].filter(row=>[row.name,...engine.byId.get(row.id)?.aliases??[]].some(name=>String(name).normalize('NFKC').toLowerCase()===q));
  const choices=[...new Map([...candidates,...matches.map(row=>({id:row.id,kind:'place',name:row.name}))].map(row=>[row.id,row])).values()].sort((a,b)=>a.id.localeCompare(b.id));
  return choices.length?{value:choices.length===1?choices[0].id:null,candidates:choices}:resolve(value,'place');
 };
 const slotsFor=(action,proposal)=>{
  const slots={},target=proposal.participants?.target??proposal.target??proposal.effects?.find(e=>e.target!==undefined||e.entity!==undefined)?.target??proposal.effects?.find(e=>e.entity!==undefined)?.entity;
  for(const slot of action.slots??[]){
   let value=proposal.participants?.[slot.name]??proposal.means?.[slot.name];
   const effects=proposal.effects??[],transfers=effects.filter(e=>e.op==='transfer'),resource=e=>e.resource??(typeof e.from==='string'&&e.from.includes('|')?parseAccount(e.from).resource:null);
   const goods=transfers.find(e=>resource(e)&&!['coin',LEDGER_COIN].includes(resource(e))&&!String(e.to).startsWith('sink:'));
   const money=transfers.find(e=>['coin',LEDGER_COIN].includes(resource(e)));
   const obligation=effects.find(e=>e.op==='obligation.create'),settlement=effects.find(e=>e.op==='obligation.settle');
   if(action.call?.tool==='world_law'&&action.call.operation==='pay'&&settlement){
    const fine=finePaymentContext(engine,document,{reference:settlement.id,payer:actor,amount:settlement.amount});
    if(fine)value??=({case:fine.case,authority:fine.collector,coins:fine.amount})[slot.name];
   }
   const holding=effects.find(e=>e.op==='holding.open');
   if(action.call?.tool==='world_trade'||action.call?.tool==='world_law'&&action.call.operation==='steal'){
    if(slot.name==='item')value??=(goods?catalog(resource(goods),'item'):undefined)??(proposal.means?.manner==='secret_sale'?proposal.means.tools?.[0]:undefined);
    if(slot.name==='quantity'&&goods)value??=goods.qty;
    if(slot.name==='coins'&&money)value??=money.qty;
    if(slot.name==='seller'&&action.call?.operation==='lend')value??=effects.find(e=>e.op==='obligation.create'&&e.obligationKind==='loan')?.debtor;
    if(slot.name==='days'&&action.call?.operation==='lend')value??=effects.find(e=>e.op==='obligation.create'&&e.obligationKind==='loan')?.terms?.days;
    if(slot.fill==='banker'){
     const bank=banks.get(proposal.target);value??=bank?.keepers?.find(id=>kindOf(id)==='person');
    }
    if(slot.name==='seller')value??=banks.get(target)?.keepers?.find(id=>kindOf(id)==='person')??(kindOf(target)==='person'?target:undefined);
    if(slot.name==='coins'&&['deposit','remit'].includes(action.call.operation))value=proposal.means?.coins??obligation?.terms?.principal??money?.qty;
    // The deposit API takes total cash tendered; the debt term names net
    // principal. Fees never become part of the customer's deposit claim.
    if(slot.name==='coins'&&action.call.operation==='deposit'&&obligation?.terms?.principal!==undefined)value=obligation.terms.principal+(banks.get(target)?.depositFeeCopper??0);
    if(slot.name==='days'&&action.call.fixed?.service==='住宿')value??=holding?.terms?.nights;
    if(slot.name==='location'&&action.call.operation==='remit')value??=obligation?.terms?.destination;
    if(slot.name==='buyer'&&action.call.operation==='remit')value??=obligation?.creditor;
    if(['debt','contract'].includes(slot.name)&&settlement){
     const matches=obligationRows(state).filter(row=>!obligationClosed(row)&&row.debtor===actor&&(row.creditor===target||row.bank===target)&&(!settlement.amount||(row.amount??row.principal??row.terms?.principal??0)-(row.paid??0)>=settlement.amount));
     const exact=matches.find(row=>row.id===settlement.id||row.legacyRecord===settlement.id);
     const chosen=exact??(!/^[a-z][a-z0-9_:.-]*$/i.test(settlement.id??'')&&matches.length===1?matches[0]:null);
     value??=chosen?.legacyRecord??chosen?.id;
    }
   }
   if(action.call?.tool==='world_profession'&&action.call.operation==='certify'&&slot.name==='teacher'){
    const profession=proposal.means?.profession??effects.find(e=>e.payload?.kind==='certification')?.payload?.terms?.profession;
    const teachers=[...pool.values()].filter(row=>row.kind==='person'&&row.id!==actor&&npcServices(engine,state,row.id).includes(profession));
    const seats=(facilityRuntime().examinationSeats?.(engine,state,profession)??[]).filter(r=>r.available&&r.location===location&&!state.records[`examination_seat:${r.id}:used`]);
    if(seats.length===1)value??=seats[0].examiner;
    if(teachers.length===1)value??=teachers[0].id;
   }
   if(action.call?.tool==='world_companion'&&action.call.operation==='summon_dismiss'&&slot.name==='summon'&&summons.has(target))value??=target;
   if(action.call?.tool==='world_companion'&&action.call.operation==='pet_feed'&&slot.name==='item')value??=transfers.find(e=>owner(e.from)===actor&&owner(e.to)==='sink:consume')&&resource(transfers.find(e=>owner(e.from)===actor&&owner(e.to)==='sink:consume'));
   if(action.call?.tool==='world_remember'&&action.call.fixed?.key==='dialogue:eat_meal'&&slot.name==='item')value??=transfers.find(e=>owner(e.from)===actor&&owner(e.to)==='sink:consume')&&resource(transfers.find(e=>owner(e.from)===actor&&owner(e.to)==='sink:consume'));
   if(action.call?.tool==='world_field'&&action.call.operation==='environment_douse_fire'&&slot.name==='target')value??=effects.find(e=>e.op==='fact.set'&&e.field==='fire_intensity')?.entity;
   if(action.call?.tool==='world_field'&&action.call.operation==='environment_douse_fire'){
    if(slot.name==='source')value??=proposal.means?.tools?.[0];
    if(slot.name==='millilitres'){
     const water=transfers.find(e=>resource(e)==='item_water'&&owner(e.from)===actor&&owner(e.to)==='sink:consume');
     if(water)value??=water.qty*engine.byId.get('item_water')?.weight*1000;
    }
   }
   if(action.call?.tool==='world_cast'){
    const transfer=transfers[0],spell=engine.byId.get(proposal.means?.spell);
    if(slot.name==='source'&&transfer)value??=transfer.from;
    if(slot.name==='millilitres'&&spell?.effectSpec?.operation==='irrigate'&&transfer)value??=transfer.qty*1000;
    if(slot.name==='target'){
     if(spell?.effectSpec?.operation==='irrigate'&&transfer){
      const channels=environmentFeatures(engine,document).filter(f=>f.kind==='channel'&&f.location===location&&f.links?.source===transfer.from&&f.links?.destination===transfer.to);
      if(channels.length===1)value??=channels[0].id;
     }
     value??=target??transfer?.to??(spell?.effectSpec?.kind==='summon'?actor:undefined);
    }
   }
   if(action.call?.tool==='world_combat'){
    if(slot.name==='intent')value=({guard:'defend',attack:'attack',retreat:'flee',shove:'shove'})[proposal.means?.manner]??value;
    if(slot.name==='weapon')value??=proposal.means?.tools?.[0];
    if(slot.name==='target'&&proposal.target===undefined&&proposal.participants?.target===undefined){
     const opponents=[...pool.values()].filter(row=>row.id!==actor&&activeDuel({...d,document},engine,row.id,actor));
     value=opponents.length===1?opponents[0].id:undefined;
     // A demonstrative enemy reference can bind the single other local agent.
     // Generic guarding cannot turn a bystander into an opponent; multiple
     // agents (or conflicting duels) must still be disambiguated by the player.
     if(!opponents.length&&['guard','retreat'].includes(proposal.means?.manner)&&/(?:眼前|面前|跟前)(?:的)?(?:敌人|对手)/.test(proposal.intent??'')){
      const present=[...pool.values()].filter(row=>row.id!==actor&&['person','creature'].includes(row.kind)&&state.creatures?.[row.id]?.owner!==actor&&!summons.has(row.id));
      if(present.length===1)value=present[0].id;
     }
     if(value===undefined)continue;
    }
   }
   if(action.id==='core:dialogue.guide_request'&&slot.name==='content')value??=proposal.intent;
   if(action.call?.tool==='world_settlement'&&action.call.operation==='faith_rite'&&slot.name==='org')value??=templeById(engine,target??location)?.id;
   if(value===undefined&&slot.fill==='target')value=target;
   if(value===undefined)for(const e of proposal.effects??[]){
    if(slot.name==='destination'&&e.op==='move'){value=e.to;break;}
    if(slot.name==='source'&&e.op==='learn'){value=e.learningSource;break;}
    if(slot.name==='entity'&&e.op==='learn'){value=e.subject;break;}
    if(slot.name==='kind'&&e.op==='learn'){value=engine.byId.get(e.subject)?.kind??(e.subject?.startsWith('spell_')?'spell':e.subject?.startsWith('recipe_')?'recipe':e.subject?.startsWith('skill_')?'skill':undefined);if(value!==undefined)break;}
    if(slot.name==='item'&&e.op==='fact.set'){value=e.entity;break;}
    if(slot.name==='repairPlan'&&proposal.means?.repair){value=proposal.means.repair;break;}
    if(slot.name==='concept'&&e.op==='create'&&e.kind==='project'){value=e.facts?.goal;break;}
    if(slot.name==='obligation'&&e.op==='obligation.cancel'){
     const rows=obligationRows(state).filter(row=>!obligationClosed(row)&&row.creditor===actor&&(!target||row.debtor===target));
     value=rows.find(row=>row.id===e.id||row.legacyRecord===e.id)?.id??(!/^[a-z][a-z0-9_:.-]*$/i.test(e.id??'')&&rows.length===1?rows[0].id:action.id==='open:waive_debt'?undefined:e.id);break;
    }
    if(e.op==='obligation.create'&&e.obligationKind==='promise'){
     if(slot.name==='type'&&['coin',LEDGER_COIN].includes(e.terms?.resource)){value='付款';break;}
     if(slot.name==='coins'){value=e.terms?.amount;if(value!==undefined)break;}
     if(slot.name==='content'){value=proposal.intent;break;}
     if(slot.name==='deadline'&&e.terms?.due==='明天日落前'){
      const tomorrow=(Math.floor(state.minute/1440)+1)*1440,sunset=localWeather(engine,document,location,tomorrow)?.sunsetMinute;
      if(Number.isSafeInteger(sunset)){value=tomorrow+sunset;break;}
     }
    }
    if(slot.name==='content'&&e.op==='emit'){value=e.payload?.content??e.payload?.version??e.payload?.text??e.payload?.terms?.topic; if(value!==undefined)break;}
    if(slot.name==='source'&&e.op==='emit'){value=action.id==='core:dialogue.tell'?knownWorldEventReference(state,actor,{reference:e.payload?.source,content:e.payload?.version??e.payload?.content}):undefined;value??=e.payload?.source==='self'?actor:e.payload?.source;if(value!==undefined)break;}
    if(slot.name==='topic'&&e.op==='emit'){value=e.payload?.terms?.topic;if(value!==undefined)break;}
    if(e.op==='emit'&&e.payload?.terms?.[slot.name]!==undefined){value=e.payload.terms[slot.name];break;}
    if(e.op==='emit'&&e.payload?.kind==='haggle'&&['source','content'].includes(slot.name)){
     const agreed=(facilityRuntime().currentAgreedQuotes?.(state)??[]).filter(r=>!r.service&&r.actor===target&&r.direction==='sell_to_player').map(r=>({item:r.resource,listPrice:r.totalCoins/r.quantity}));
     const quotes=agreed.length?agreed:Object.values(state.records??{}).filter(r=>r.category==='trade_quote'&&r.seller===target&&r.day===Math.floor(state.minute/1440));
     if(quotes.length===1){
      if(slot.name==='source')value=quotes[0].item;
      else if(Number.isSafeInteger(e.payload.terms?.discountCopper))value=String(quotes[0].listPrice-e.payload.terms.discountCopper);
     }
     if(value!==undefined)break;
    }
    if(slot.name==='content'&&e.op==='emit'&&e.payload?.kind!=='haggle'&&['request','tell','claim'].includes(e.verb)){value=proposal.intent;break;}
    if(e[slot.name]!==undefined){value=e[slot.name];break;}
    if(e.op==='create'&&e.facts?.[slot.name]!==undefined){value=e.facts[slot.name];break;}
    if(slot.name==='operation'&&e.op==='create'&&e.kind==='project'&&action.call?.tool==='world_research'){value='start';break;}
    if(slot.name==='skills'&&e.op==='create'&&e.kind==='project'&&e.facts?.skill){value=[e.facts.skill];break;}
    if(['skill','spell','recipe'].includes(slot.entity)&&e.op==='learn'&&e.subject!==undefined){
     const subject=catalog(e.subject,slot.entity)??resolve(e.subject,slot.entity).value;if(subject!==null){value=subject;break;}
    }
    if(slot.name==='quantity'&&e.qty!==undefined&&!(e.op==='transfer'&&['coin',LEDGER_COIN].includes(resource(e)))){value=e.qty;break;}
    if(slot.entity&&slot.required&&target!==undefined&&(slot.entity==='entity'||kindOf(target)===(slot.entity==='npc'?'person':slot.entity))){value=target;break;}
   }
   if(value===undefined&&slot.name==='intent')value=proposal.intent;
   if(value===undefined)value=slot.default;
   if(value===undefined)continue;
   if(slot.name==='until'&&value==='dawn'){
    const todaySunrise=localWeather(engine,document)?.sunriseMinute,now=state.minute;
    if(!Number.isSafeInteger(todaySunrise))continue;
    const dayOffset=now%1440<todaySunrise?0:1,sunrise=localWeather(engine,document,location,now+dayOffset*1440)?.sunriseMinute;
    if(!Number.isSafeInteger(sunrise))continue;
    value={dayOffset,hour:Math.floor(sunrise/60),minute:sunrise%60};
   }
   if(slot.entity){
    if(action.call?.tool==='world_trade'&&action.call.operation==='remit'&&slot.name==='buyer'){
     const recipient=resolveParty(value);if(recipient.value!==null)slots[slot.name]=recipient.value;continue;
    }
    if(action.call?.tool==='world_trade'&&action.call.operation==='remit'&&slot.name==='location'&&engine.world.locations.some(row=>row.id===value&&!row.hidden&&!row.private)){slots[slot.name]=value;continue;}
    const publicKind=['skill','spell','recipe'].includes(slot.entity)||slot.entity==='item'&&slot.name==='item'&&['world_trade','world_law'].includes(action.call?.tool);
    const publicId=publicKind&&catalog(value,slot.entity);
    if(publicId)value=publicId;
    else {const resolved=(action.call?.tool==='world_move'&&slot.name==='destination'||action.call?.tool==='world_trade'&&slot.name==='location')?resolveDestination(value):resolve(value,slot.entity);if(resolved.value!==null)value=resolved.value;else continue;}
   }
   if(typeof slot.options==='object'&&Array.isArray(slot.options)&&!slot.options.includes(value))continue;
   slots[slot.name]=value;
  }
  return slots;
 };
 const transferAccount=(value,resource)=>{
  try{
   if(value.includes('|')){parseAccount(value);return value;}
   if(!resource)throw Error('missing resource');
   resource=resource==='coin'?LEDGER_COIN:resource;
   return /^(sink|src):/.test(value)?accountKey(value,resource,'action'):resource===LEDGER_COIN?partyAccount(engine,state,value):accountKey(value,resource,'inventory');
  }catch{throw new PrimitiveRejected('E-OPEN-ACCOUNT','转移须指定有效的资源与账户');}
 };
 const labelsFor=(action,proposal)=>{
  if(action.call?.tool==='world_law'&&action.call.operation==='pay')return ['缴款','缴清','罚款','罚金'];
  const labels={
   'core:eat.meal':['吃','吃掉','进食'],
   'core:pet.feed':['喂','喂它','喂养','口粮'],
   'core:trade.lodge':['租','床位','住宿'],
   'core:trade.deposit':['存','存进去','存入'],
   'core:trade.repay':['还清','还给'],
   'core:trade.redeem':['赎','取回来','本息付清'],
   'core:trade.remit':['寄','汇票','汇款'],
   'core:promise.cancel':['免掉','免除','不让他再还'],
   'core:environment.douse_fire':['灭火','泼水'],
   'core:settlement.faith_rite':['仪式','参与','供品']
  };
  if(labels[action.id])return labels[action.id];
  if(action.call?.tool==='world_move'){
   const target=proposal.effects?.find(e=>e.op==='move')?.to,row=destinations().get(target);return row?[row.name]:[];
  }
  if(action.call?.tool==='world_craft'&&action.call.operation==='manufacture'){
   const recipe=engine.byId.get(proposal.means?.recipe),item=engine.byId.get(recipe?.output?.item);
   return [recipe?.name,...recipe?.aliases??[],item?.name,...item?.aliases??[]].filter(Boolean);
  }
  const id=action.call?.tool==='world_cast'?proposal.means?.spell:['world_learn','world_practice'].includes(action.call?.tool)?proposal.effects?.find(e=>e.op==='learn')?.subject:null;
  const row=id&&engine.byId.get(id);return row?[row.name,...row.aliases??[]].filter(Boolean):[];
 };
 const resolveParty=value=>{
  const result=resolve(value),row=state.npcs?.[value],base=engine.byId.get(value);
  // A named creditor/debtor must exist, but need not stand at the counter.
  // This grants no physical access, name search or consent on their behalf.
  if(result.value===null&&row&&!row.hidden&&!row.private&&!base?.hidden&&!base?.private&&['not_present','not_perceivable'].includes(result.reason))return {value,candidates:[{id:value,kind:'person'}]};
  return result;
 };
 const resolveSubject=value=>{
  const result=resolve(value);
  if(result.value!==null)return result;
  // A holding's organizational/legal subject need not be physically present.
  // Only an existing subject of the actor's live holdings, or the current
  // place's containing jurisdiction, may be referenced this way. Physical
  // effect targets still use resolve() and get no access from these edges.
  const subjects=new Set(aliveHoldings(d,{holder:actor}).map(row=>row.subject));
  for(const h of aliveHoldings(d,{holder:actor,kind:'holds_office'})){
   const office=document.holdings?.entities?.[h.subject];
   if(office?.goneAt===undefined&&office?.facts?.organization)subjects.add(office.facts.organization);
  }
  let id=location;const seen=new Set();
  while(id&&!seen.has(id)){seen.add(id);subjects.add(id);id=engine.byId.get(id)?.parent;}
  const row=engine.byId.get(value)??document.holdings?.entities?.[value]?.facts;
  if(subjects.has(value)&&row&&!row.hidden&&!row.private&&document.holdings?.entities?.[value]?.goneAt===undefined)return {value,candidates:[{id:value,kind:row.kind??'organization',name:row.name??value}]};
  return result;
 };
 const nativeSignatures=(action,slots,proposal)=>{
  const call=action.call,sign=effects=>effectSignature(effects,{kindOf,actor}),transfer=(resource,from,to)=>({op:'transfer',resource,from,to});
  const owner=value=>typeof value==='string'&&value.includes('|')?parseAccount(value).owner:value;
  const transfers=(proposal.effects??[]).filter(e=>e.op==='transfer'),resource=e=>e.resource??(typeof e.from==='string'&&e.from.includes('|')?parseAccount(e.from).resource:null);
  const money=transfers.find(e=>['coin',LEDGER_COIN].includes(resource(e))),goods=transfers.find(e=>!['coin',LEDGER_COIN].includes(resource(e)));
  // Legacy handlers do not declare primitive outcomes. Derive their request
  // footprints from registered recipes and domain slots, never from requested
  // success, quantity or consent. Execution still owns the complete protocol.
  if(call?.tool==='world_craft'&&call.operation==='manufacture'){
   const recipe=engine.byId.get(slots.recipe);
   return recipe?.materials?[sign(recipe.materials.map(m=>transfer(m.item,actor,'sink:craft')))]:[];
  }
  if(call?.tool==='world_trade'){
   if(action.verb==='trade.buy'&&slots.item&&money&&goods&&owner(money.from)===actor&&owner(goods.to)===actor&&owner(money.to)===owner(goods.from))return [sign([transfer(LEDGER_COIN,actor,slots.seller),transfer(slots.item,slots.seller,actor)])];
   if(call.fixed?.seller==='player'&&slots.item&&money&&owner(money.to)===actor){
    if(goods&&owner(goods.from)===actor&&owner(goods.to)===owner(money.from))return [sign([transfer(slots.item,actor,slots.buyer),transfer(LEDGER_COIN,slots.buyer,actor)])];
    if(proposal.means?.manner==='secret_sale')return [sign([{op:'holding.transfer',newHolder:slots.buyer},transfer(LEDGER_COIN,slots.buyer,actor)])];
   }
   if(call.operation==='withdraw')return [sign([transfer(LEDGER_COIN,proposal.target,actor),{op:'obligation.settle'}])];
   if(call.operation==='lend')return [sign([transfer(LEDGER_COIN,actor,slots.seller),{op:'obligation.create',obligationKind:'loan'}])];
   if(call.fixed?.service==='住宿')return [sign([transfer(LEDGER_COIN,actor,slots.seller),{op:'holding.open',subject:location}])];
   if(call.fixed?.payment==='repay')return [sign([transfer(LEDGER_COIN,actor,slots.seller??proposal.target),{op:'obligation.settle'}])];
   if(call.operation==='redeem')return [sign([transfer(LEDGER_COIN,actor,proposal.target),{op:'obligation.settle'},{op:'holding.close'}])];
   if(['deposit','remit'].includes(call.operation)){
    const bank=banks.get(proposal.target);if(!bank)return [];
    const payments=[transfer(LEDGER_COIN,actor,bank.id)];
    if(call.operation==='remit'||bank.depositFeeCopper>0)payments.push(transfer(LEDGER_COIN,actor,bank.id));
    return [sign([...payments,{op:'obligation.create',obligationKind:call.operation==='deposit'?'deposit':'bill'}])];
   }
  }
  if(call?.tool==='world_remember'&&call.fixed?.key==='dialogue:eat_meal'){
   const consumed=transfers.find(e=>owner(e.from)===actor&&owner(e.to)==='sink:consume'),item=engine.byId.get(slots.item??(consumed&&resource(consumed)));
   if(item?.nutrition?.satiety)return [sign([transfer(item.id,actor,'sink:consume'),{op:'vital',target:actor,type:'body:satiety'}])];
  }
   if(call?.tool==='world_companion'&&call.operation==='pet_feed'){
    const creature=state.creatures?.[slots.target],species=engine.byId.get(creature?.species),food=species?.tamingRule?.food?.find(row=>row.item===slots.item);
    if(creature&&food)return [sign([transfer(food.item,actor,'sink:consume'),{op:'vital',target:slots.target,type:'body:satiety'}])];
   }
  if(call?.tool==='world_promise'&&call.operation==='cancel'&&!proposal.effects?.some(e=>e.reason==='creditor_waiver'))return [sign([{op:'obligation.cancel'}])];
  if(call?.tool==='world_settlement'&&call.operation==='faith_rite'){
   const spec=engine.rules.faith?.ordinaryRite;
   if(!spec)return [];
   return [sign([...Object.entries(spec.offerings??{}).map(([item])=>transfer(item,actor,'sink:consume')),{op:'emit',target:proposal.target,verb:'settlement'}])];
  }
  if(call?.tool==='world_field'&&call.operation==='environment_douse_fire'){
   const target=slots.target??proposal.effects?.find(e=>e.op==='fact.set'&&e.field==='fire_intensity')?.entity;
   return [sign([transfer('item_water',actor,'sink:consume'),{op:'fact.set',entity:target,field:'fire_intensity'}])];
  }
  if(call?.tool==='world_law'&&call.operation==='steal'&&proposal.means?.manner==='steal')return [sign([transfer(slots.item??LEDGER_COIN,slots.target,actor)])];
  if(call?.tool==='world_law'&&call.operation==='pay'){
   const fine=finePaymentContext(engine,document,{caseId:slots.case,payer:actor,amount:slots.coins});
   const settlement=proposal.effects?.find(e=>e.op==='obligation.settle');
   if(fine&&money?.qty===fine.amount&&settlement?.amount===fine.amount&&owner(money.from)===actor&&[fine.site,fine.account].includes(money.to))return [sign([transfer(LEDGER_COIN,actor,money.to===fine.account?fine.account:fine.site),{op:'obligation.settle'}])];
  }
  if(call?.tool==='world_companion'&&call.operation==='summon_dismiss'&&summons.has(slots.summon))return [sign([{op:'obligation.cancel'},{op:'transition',entity:slots.summon}])];
  if(call?.tool==='world_cast'&&engine.byId.get(slots.spell)?.effectSpec?.operation==='irrigate'){
   const channel=environmentFeatures(engine,document).find(f=>f.id===slots.target&&f.kind==='channel');
   return channel?[sign([transfer('water',channel.links?.source,channel.links?.destination)])]:[];
  }
  return [];
 };
 const canProject=(action,proposal)=>action.projection==='scene'&&proposal.effects?.length===0;
 const requiredSlots=(action,slots)=>{
  const call=action.call;
  if(call?.tool==='world_profession'&&call.operation==='certify'&&engine.byId.get(slots.profession)?.kind!=='hidden')return ['teacher'];
  if(call?.tool==='world_trade'&&call.operation==='redeem')return ['contract'];
  if(call?.tool==='world_trade'&&call.operation==='remit')return ['coins','location'];
  if(call?.tool==='world_promise'&&call.operation==='cancel')return ['obligation'];
  if(call?.tool==='world_settlement'&&call.operation==='faith_rite')return ['org'];
  if(call?.tool==='world_companion'&&call.operation==='summon_dismiss')return ['summon'];
  return [];
 };
 return {actor,kindOf,resolve,resolveDestination,resolveParty,resolveSubject,transferAccount,labelsFor,nativeSignatures,canProject,requiredSlots,entities:[...pool.values()].map(({aliases,...r})=>r),slotsFor,visible:(action,participants,proposal)=>{
  if(action.call?.tool==='world_time'&&['sleep','rest'].includes(proposal?.means?.manner)&&action.call.fixed?.activity!==({sleep:'睡眠',rest:'休息'}[proposal.means.manner]))return false;
  if(action.id==='core:dialogue.guide'&&proposal?.effects?.some(e=>e.op==='emit'&&e.verb==='request'&&e.payload?.kind==='guide'))return false;
  const learning=proposal?.effects?.find(e=>e.op==='learn');
  if(learning&&action.call?.tool==='world_learn'&&learning.learningSource==='practice')return false;
  if(learning&&action.call?.tool==='world_practice'&&learning.learningSource!=='practice')return false;
  const traveling=action.call?.tool==='world_move'&&participants.target===proposal?.effects?.find(e=>e.op==='move')?.to&&resolveDestination(participants.target).value!==null;
  if(Object.entries(participants).some(([role,id])=>role!=='actor'&&typeof id==='string'&&!kindOf(id)&&!(role==='target'&&traveling)))return false;
  const target=participants.target,catalog=action.visibility?.catalog;
  if(!target&&action.call?.tool==='world_combat'&&proposal?.means?.manner==='guard')return true; // Missing opponent is a slot question, not an invented fight.
  if(!target&&action.call?.tool==='world_combat'&&['retreat','shove'].includes(proposal?.means?.manner))return true;
  if(catalog?.startsWith('target:')&&!target)return false;
  if(catalog==='target:npc'&&kindOf(target)!=='person'||catalog==='target:item'&&kindOf(target)!=='item'||catalog==='target:place'&&!traveling&&kindOf(target)!=='place')return false;
  return (action.preconditions??[]).every(condition=>{
   if(typeof condition!=='string')return true;
   if(condition==='present(target)')return kindOf(target)==='person';
   if(condition==='hasItems')return Object.values(bag??{}).some(v=>(typeof v==='number'?v:v.quantity??0)>0);
   if(condition==='hasSkill')return proposal?.effects?.some(e=>e.op==='learn')||Object.keys(knowledge.skills??{}).length>0;
   return true; // Execution owns the complete precondition/authority check.
  });
 }};
}

export function resolveProposalEntities(proposal,context,{accounts=false,deferCombatDestination=false}={}){
 const resolved=structuredClone(proposal),ambiguities=[],rejections=[];
 const entityFields=new Set(['actor','target','entity','subject','to','from','holder','newHolder','debtor','creditor']);
 const resolve=(value,path,role=null)=>{
  if(typeof value!=='string')return value;
  const result=role==='subject'&&context.resolveSubject?context.resolveSubject(value):role==='party'&&context.resolveParty?context.resolveParty(value):role==='destination'&&context.resolveDestination?context.resolveDestination(value):context.resolve(value);
  if(result.value===null){
   if(result.candidates.length>1||result.reason==='unresolved_reference')ambiguities.push({path,value,candidates:result.candidates});
   else rejections.push({path,value,reason:result.reason??'unknown_entity'});
   return value;
  }
  return result.value;
 };
 for(const effect of resolved.effects??[]){
  if(effect.op==='learn'&&effect.source!==undefined&&effect.learningSource===undefined){effect.learningSource=effect.source;delete effect.source;}
  if(effect.op==='emit'&&effect.visibility==='present')effect.visibility='witnessed';
 }
 for(const [role,value] of Object.entries(resolved.participants??{}))if(role!=='actor')resolved.participants[role]=resolve(value,`participants.${role}`);
 if(resolved.target!==undefined)resolved.target=resolve(resolved.target,'target',resolved.effects?.some(e=>e.op==='move'&&e.to===resolved.target)?'destination':null);
 for(const [i,effect] of (resolved.effects??[]).entries())for(const [field,value] of Object.entries(effect))if(entityFields.has(field)){
  // A learning subject names catalog knowledge, not a physical target. It need
  // not be known already; the learning program checks its source and teacher.
  if(effect.op==='learn'&&field==='subject')continue;
  // Combat owns disengagement and contested displacement. A descriptive escape
  // direction is not a free-standing world destination or a teleport endpoint.
  if(deferCombatDestination&&effect.op==='move'&&field==='to'&&['shove','disengage'].includes(effect.mode))continue;
  // Account owners are entity references; destinations such as coordinates or
  // canonical sink accounts remain the primitive validator's responsibility.
  if(typeof value==='string'&&/^(sink|src):/.test(value))continue;
  effect[field]=resolve(value,`effects.${i}.${field}`,field==='subject'&&effect.op.startsWith('holding.')?'subject':['debtor','creditor'].includes(field)?'party':effect.op==='move'&&field==='to'?'destination':null);
 }
 // A natural-language material reference names an actual accessible item,
 // never a new ledger resource. Canonical ids retain the account validator's
 // existing strict checks (including unknown resources and empty stock).
 const material=(value,path)=>{
  if(typeof value!=='string'||/^[a-z][a-z0-9_:.-]*$/i.test(value))return value;
  const result=context.resolve(value,'item');
  if(result.value!==null)return result.value;
  ambiguities.push({path,value,candidates:result.candidates});return value;
 };
 for(const [i,effect] of (resolved.effects??[]).entries()){
  if(effect.op==='transfer'&&effect.resource!==undefined)effect.resource=material(effect.resource,`effects.${i}.resource`);
  if(effect.op==='create')for(const [j,row] of (Array.isArray(effect.materials)?effect.materials:[]).entries())if(row&&typeof row==='object')for(const field of ['resource','item'])if(row[field]!==undefined)row[field]=material(row[field],`effects.${i}.materials.${j}.${field}`);
 }
 for(const effect of resolved.effects??[])if(accounts&&!ambiguities.length&&!rejections.length&&effect.op==='transfer'&&context.transferAccount){
  effect.from=context.transferAccount(effect.from,effect.resource);
  effect.to=context.transferAccount(effect.to,effect.resource);
  if(effect.resource==='coin')effect.resource=LEDGER_COIN;
 }
 // A failed reference takes precedence over clarification of another reference.
 if(rejections.length){
  const error=new PrimitiveRejected('E-OPEN-ENTITY',`${rejections[0].reason}: ${rejections[0].path}`);
  Object.assign(error,{reason:rejections[0].reason,rejections});throw error;
 }
 return {proposal:resolved,ambiguities};
}
