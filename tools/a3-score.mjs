import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine,skillGrade} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {PRIMITIVE_IDS,PrimitiveRejected} from '../server-plugin/primitive-policy.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {ActionBuilder,builderStep} from '../extension/action-builder.mjs';
import {builderToolCall} from '../extension/tools.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {isGone,isPhysicallyDead,bookHoldingsUpgrade,openHoldings,aliveHoldings} from '../server-plugin/holdings.mjs';
import {applyMagicStatus} from '../server-plugin/magic-status.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {canonicalActionId} from '../server-plugin/action-registry.mjs';
import {primitiveRuntime} from '../server-plugin/primitives-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const oldCorpusPath=path.join(root,'tests/fixtures/a3-intents.json');
export const v2CorpusPath='F:/dnd/logs/sessions/a3-intents-v2.json';
export async function loadCorpus({corpusPath}={}){
 let selected=corpusPath??v2CorpusPath,raw;
 try{raw=await fs.readFile(selected,'utf8');}
 catch(error){if(corpusPath||error.code!=='ENOENT')throw error;selected=oldCorpusPath;raw=await fs.readFile(selected,'utf8');}
 return {rows:JSON.parse(raw.replace(/^\uFEFF/,'')),corpusPath:selected};
}
const receiptOf=value=>value?.result?.receipt??value?.receipt??null;
const unique=values=>[...new Set(values)].sort();
const sameSet=(a,b)=>JSON.stringify(unique(a))===JSON.stringify(unique(b));
const clarifyStates=new Set(['needs_entities','needs_slots']);
const routeName=(route,registry)=>canonicalActionId(registry,({拒绝:'reject',rejected:'reject',refuse:'reject',澄清:'clarify',clarification:'clarify'}[route]??route));

// Fixture construction before the measured action, using the same balance
// construction + openLedger approach as tests/helpers/ledger-sync.mjs.
// status: player status string, {entityId: statusString}, or an array of
// {target, status, power, duration} for the native magic status writer.
// facts: [{path:['state', ...existingFieldPath], value: ...}].
// abilities are initial player knowledge, not successful learning actions:
// skills/literacy -> state.skills; spells/recipes -> their native partitions;
// profession licenses -> state.professions + the native holding projection.
export function applyIntentSetup(engine,initial,setup){
 const document=structuredClone(initial),setupUnmet=[],notes=[],s=document.state;
 if(setup===undefined)return {document,setupUnmet};
 const unmet=(item,reason)=>setupUnmet.push({item,reason});
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const actor=id=>id==='player'||id==='self'?s.player:Object.hasOwn(s.npcs??{},id)?s.npcs[id]:Object.hasOwn(s.creatures??{},id)?s.creatures[id]:null;
 if(!object(setup)){unmet('setup','expected an object');return {document,setupUnmet};}
 for(const key of Object.keys(setup))if(!['location','present','inventory','coins','minute','status','facts','abilities'].includes(key))unmet(key,'unsupported setup field');
 if(Object.hasOwn(setup,'minute')){
  if(Number.isSafeInteger(setup.minute)&&setup.minute>=0)s.minute=setup.minute;
  else unmet('minute','expected a nonnegative safe integer');
 }
 const move=(id,body,location)=>{
  if(id==='player')s.location=location;else body.location=location;
  if(document.holdings?.locations?.[id])Object.assign(document.holdings.locations[id],{at:location,mode:'place',since:s.minute});
 };
 if(Object.hasOwn(setup,'location')){
  if(engine.world.locations.some(l=>l.id===setup.location))move('player',s.player,setup.location);
  else unmet('location',`unknown location: ${setup.location}`);
 }
 if(Object.hasOwn(setup,'present')){
  if(!Array.isArray(setup.present))unmet('present','expected an array of existing actor IDs');
  else for(const [index,id] of setup.present.entries()){
   const body=actor(id);
   if(typeof id!=='string'||!body||['self','player'].includes(id)){unmet(`present[${index}]`,`missing NPC/creature instance: ${id}`);continue;}
   if(isGone(engine,document,id)||isPhysicallyDead(engine,document,id)||body.hp<=0){unmet(`present[${index}]`,`actor is dead or gone: ${id}`);continue;}
   move(id,body,s.location);
   Object.assign(body,{status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
   delete body.capacity;
   for(const [key,effect] of Object.entries(s.effects??{}))if(effect.target===id&&(effect.capacity==='none'||['capacity:none','昏迷','失能','睡眠'].includes(effect.status)))delete s.effects[key];
  }
 }
 if(Object.hasOwn(setup,'inventory')){
  if(!object(setup.inventory))unmet('inventory','expected item ID to quantity mapping');
  else for(const [id,quantity] of Object.entries(setup.inventory)){
   const item=engine.world.items.find(i=>i.id===id);
   if(!item||!Number.isSafeInteger(quantity)||quantity<0){unmet(`inventory.${id}`,'unknown item or invalid quantity');continue;}
   s.inventory[id]={...s.inventory[id],quantity,quality:item.quality,durability:item.durability,weight:item.weight};
  }
 }
 if(Object.hasOwn(setup,'coins')){
  if(Number.isSafeInteger(setup.coins)&&setup.coins>=0)s.player.coins=setup.coins;
  else unmet('coins','expected a nonnegative safe integer');
 }
 if(Object.hasOwn(setup,'abilities')){
  const a=setup.abilities,validProficiency=value=>Number.isSafeInteger(value)&&value>=0&&value<=2699;
  const setSkill=(id,value,item)=>{
   if(!engine.world.skills.some(row=>row.id===id)||!validProficiency(value)){unmet(item,'unknown skill or proficiency outside 0..2699');return;}
   s.skills??={};
   s.skills[id]={...s.skills[id],proficiency:value,grade:skillGrade(value),daily:s.skills[id]?.daily??{},breakthroughs:s.skills[id]?.breakthroughs??[]};
  };
  if(!object(a))unmet('abilities','expected an object');
  else{
   for(const key of Object.keys(a))if(!['skills','spells','recipes','literacy','licenses'].includes(key))unmet(`abilities.${key}`,'unsupported ability field');
   if(Object.hasOwn(a,'skills')){
    if(!object(a.skills))unmet('abilities.skills','expected skill ID to proficiency mapping');
    else for(const [id,value] of Object.entries(a.skills))setSkill(id,value,`abilities.skills.${id}`);
   }
   if(Object.hasOwn(a,'literacy')){
    const value=typeof a.literacy==='boolean'?(a.literacy?engine.rules.books.minimumLiteracy:0):a.literacy;
    if(Object.hasOwn(a.skills??{},'skill_literacy')&&a.skills.skill_literacy!==value)unmet('abilities.literacy','conflicts with abilities.skills.skill_literacy');
    else setSkill('skill_literacy',value,'abilities.literacy');
   }
   for(const partition of ['spells','recipes'])if(Object.hasOwn(a,partition)){
    if(!Array.isArray(a[partition]))unmet(`abilities.${partition}`,'expected an array of registered IDs');
    else for(const [index,id] of a[partition].entries()){
     const definition=engine.world[partition].find(row=>row.id===id);
     if(!definition||!engine.world.skills.some(row=>row.id===definition.skill)){unmet(`abilities.${partition}[${index}]`,'unknown knowledge or supporting skill');continue;}
     s[partition]??={};s[partition][id]={...s[partition][id],learnedAt:s[partition][id]?.learnedAt??s.minute};
     // Native learn() creates a zero proficiency skill if it is absent. Do not
     // invent proficiency, certification, teachers or successful study records.
     if(!s.skills?.[definition.skill])setSkill(definition.skill,0,`abilities.${partition}[${index}]`);
    }
   }
   if(Object.hasOwn(a,'licenses')){
    if(!Array.isArray(a.licenses))unmet('abilities.licenses','expected an array of profession or loaded license holding IDs');
    else for(const [index,id] of a.licenses.entries()){
     const role=engine.world.professions.find(row=>row.id===id),item=`abilities.licenses[${index}]`;
     if(!role){
      // Non-profession IDs must name an already loaded native right. A string
      // in abilities cannot create an office, authorization or consent event.
      const rights=aliveHoldings(engine.primitiveDraft(document));
      if(!rights.some(row=>row.id===id&&(['certified','holds_office'].includes(row.kind)&&row.holder==='player'||row.kind==='permit'&&row.subject==='player')))unmet(item,'unknown profession or missing active player license holding');
      continue;
     }
     if(!['combat','life'].includes(role.kind)){unmet(item,'expected a combat/life profession certification');continue;}
     s.professions??={combat:'',life:[],hidden:[]};
     if(role.kind==='combat'){
      if(s.professions.combat&&s.professions.combat!==id){unmet(item,'combat profession slot already occupied');continue;}
      s.professions.combat=id;
     }else if(!s.professions.life.includes(id)){
      if(s.professions.life.length>=2){unmet(item,'life profession slots already occupied');continue;}
      s.professions.life.push(id);
     }
    }
   }
  }
 }
 if(Object.hasOwn(setup,'status')){
  if(Array.isArray(setup.status)){
   for(const [index,effect] of setup.status.entries()){
    const target=effect?.target==='self'?'player':effect?.target;
    if(!actor(target)||isGone(engine,document,target)){unmet(`status[${index}]`,'missing or gone status target');continue;}
    try{
     const d=engine.primitiveDraft(document),result=applyMagicStatus(d,{...effect,target,source:'a3-score:setup'},`a3-score:setup-status:${index}`);
     if(result.resisted)unmet(`status[${index}]`,'status resisted by the existing target state');
     else s.effects=structuredClone(d.document.state.effects);
    }catch(error){unmet(`status[${index}]`,error.message);}
   }
  }else{
  const entries=typeof setup.status==='string'?[['player',setup.status]]:object(setup.status)?Object.entries(setup.status):null;
  if(!entries)unmet('status','expected status string or actor ID to status mapping');
  else for(const [id,status] of entries){
   const body=actor(id);
   if(!body||typeof status!=='string'||!status.trim())unmet(`status.${id}`,'missing actor or invalid status');
   else body.status=status;
  }
  }
 }
 if(Object.hasOwn(setup,'facts')){
  if(!Array.isArray(setup.facts))unmet('facts','expected [{path:["state",...],value}]');
  else for(const [index,fact] of setup.facts.entries()){
   // Free-text facts are the corpus author's narrative preconditions (spec: “其它前提，文字说明”); keep them as notes, never as unmet structure.
   if(typeof fact==='string'){notes.push(`facts[${index}]: ${fact}`);continue;}
   const p=fact?.path;
   if(!Array.isArray(p)||p.length<2||p[0]!=='state'||p.some(k=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k))||!Object.hasOwn(fact,'value')){unmet(`facts[${index}]`,'invalid state field path/value');continue;}
   const parent=p.slice(0,-1).reduce((v,k)=>v?.[k],document),key=p.at(-1);
   if(!object(parent)||!Object.hasOwn(parent,key)){unmet(`facts[${index}]`,`unknown state field: ${p.join('.')}`);continue;}
   parent[key]=structuredClone(fact.value);
  }
 }
 for(const id of Array.isArray(setup.present)?setup.present:[]){
  const body=actor(id);
  if(body&&(body.location!==s.location||['死亡','昏迷','失能'].includes(body.status)||/睡|昏迷/.test(body.activity??'')||body.capacity==='none'||isGone(engine,document,id)))unmet(`present.${id}`,'actor is not awake and present after setup');
 }
 try{document.ledger=openLedger(engine,document);for(const reason of auditLedger(document.ledger))unmet('ledger',reason);}
 catch(error){unmet('ledger',error.message);}
 // Keep certification holdings in sync with the same native adapter used by
 // engine.reduce; no generic "licenses" state field is read by the engine.
 let prepared=document;
 if(Array.isArray(setup.abilities?.licenses)&&setup.abilities.licenses.length)try{
  prepared=applyPatches(document,bookHoldingsUpgrade({...initial,holdings:document.holdings},document,engine.world));
  prepared.holdings??=openHoldings(engine,prepared);
 }catch(error){unmet('abilities.licenses',error.message);}
 return {document:prepared,setupUnmet,notes};
}

// routing.signature describes requested effects. Only committed applied effects
// are evidence; the legacy corpus also includes exact entity/field/tag tokens.
// Runtime resource costs are prepended to applied, and explicitly repeated in
// cost.resources (primitives-runtime). actedAs is authority, NOT derivation.
// Match each cost once; never infer cost from a negative delta or sink account.
export function signatureEffects(effects,receipt={},requested=receipt.routing?.proposal?.effects??[]){
 const costs=[...receipt.cost?.resources??[]],excluded=[];
 const selected=effects.filter(effect=>{
  const index=costs.findIndex(cost=>Object.keys(cost).length>0&&Object.entries(cost).every(([key,value])=>JSON.stringify(effect[key])===JSON.stringify(value)));
  if(index<0)return true;
  // Explicitly requested consumption remains part of the adopted signature,
  // even if the registered action implements it as a resource cost.
  const owner=value=>selfId(value?.split('|')[0]);
  const resource=value=>value==='coin'?'coin_river':value;
  const requestedCost=requested.some(request=>request.op==='transfer'&&effect.op==='transfer'&&owner(request.from)===owner(effect.from)&&owner(request.to)===owner(effect.to)&&resource(request.resource??request.from?.split('|')[1])===resource(effect.resource??effect.from?.split('|')[1]));
  if(requestedCost){costs.splice(index,1);return true;}
  excluded.push(effect);costs.splice(index,1);return false;
 });
 return {effects:selected,excluded,unmatchedCosts:costs};
}
const signatureOp=value=>PRIMITIVE_IDS.find(op=>value===op||value.startsWith(`${op}(`));
const selfId=value=>value==='self'?'player':value;
function legacyQualifierMatches(qualifier,effect){
 if(qualifier.includes('+'))return qualifier.split('+').every(q=>legacyQualifierMatches(q,effect));
 if((effect.tags??[]).includes(qualifier))return true;
 if([effect.type,effect.field,effect.verb,effect.status,effect.kind,effect.reason,effect.mode,effect.to,effect.subject].includes(qualifier))return true;
 const [head,...tail]=qualifier.split(':');
 return tail.length>0&&head===effect.verb&&tail.join(':')===effect.payload?.kind;
}
// V2 qualifiers are descriptions, not literal effect values. Extract registered
// world IDs (longest first, including IDs in teacher_/book_ descriptions) and
// self/player references; require ALL of them in ONE adopted effect of this op.
// Direction is an additional from/to check, never an unordered reference check.
// Prose, authority and results are not evidence. Other descriptive words are
// ignored for scoring; expected.signature remains verbatim in every report.
const referenceCatalogs=new WeakMap();
const resourceIds=JSON.parse(await fs.readFile(path.join(root,'world/ontology/resources.json'),'utf8')).entries.map(row=>row.id);
function referenceCatalog(world){
 if(referenceCatalogs.has(world))return referenceCatalogs.get(world);
 const ids=new Set(resourceIds);
 for(const key of ['npcs','residents','items','skills','spells','recipes','locations','monsters','bosses','factions','households']){
  for(const row of world[key]??[])if(row.id)ids.add(row.id);
 }
 const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`(?<![A-Za-z0-9])(?:${[...ids].sort((a,b)=>b.length-a.length).map(escape).join('|')}|self|player|coin)(?![A-Za-z0-9])`,'g');
 referenceCatalogs.set(world,pattern);return pattern;
}
function qualifierMatches(qualifier,effect,receipt,world){
 const actor=receipt.actor??'player';
 const normalize=value=>['self','player'].includes(value)?actor:value==='coin'?'coin_river':value;
 const actualId=value=>value==='self'?actor:value==='coin'?'coin_river':value;
 const references=[...qualifier.matchAll(referenceCatalog(world))].map(m=>normalize(m[0]));
 const atoms=[];
 function collect(value){
  if(typeof value==='string')atoms.push(...value.split('|').map(actualId));
  else if(Array.isArray(value))value.forEach(collect);
  else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
   if(!['text','intent','description','narration','reason','actedAs','result','signatureKind'].includes(key))collect(child);
  }
 }
 collect(effect);
 if(!references.every(id=>atoms.includes(id)))return false;
 if(qualifier.includes('->')){
  const endpoint=value=>normalize(value.trim().replace(/^(person|creature|thing|collective|org|holding|obligation|resource):/,'').replace(/:(?:\d.*|requested_.*|bounded_output)$/,''));
  const parts=qualifier.split('->');
  if(parts.length!==2)return false;
  const owner=value=>actualId(value?.split('|')[0]);
  if(owner(effect.from)!==endpoint(parts[0])||owner(effect.to)!==endpoint(parts[1]))return false;
 }
 return true;
}
export function signatureMatches(expected,effects,receipt={},requested,world){
 const adopted=signatureEffects(effects,receipt,requested).effects;
 if(!sameSet(expected.map(signatureOp).filter(Boolean),adopted.map(e=>e.op)))return false;
 return expected.every(value=>{
  const op=signatureOp(value);
  // Unqualified legacy field/tag tokens retain their exact-value contract.
  if(!op)return adopted.some(effect=>legacyQualifierMatches(value,effect));
  if(value===op)return true;
  if(!value.endsWith(')'))return false;
  const qualifiers=value.slice(op.length+1,-1).split(',').map(q=>q.trim());
  if(!world)throw new TypeError('Qualified signature matching requires the scored world');
  return adopted.some(effect=>effect.op===op&&qualifiers.every(q=>qualifierMatches(q,effect,receipt,world)));
 });
}

// Start each intention from the same campaign: rows cannot spend each other's
// money, move observers or exhaust a later row's daily bounds.
export async function executeIntent(engine,initial,row){
 let {document,setupUnmet}=applyIntentSetup(engine,initial,row.setup),preview=null,receipt=null,adopted=null,error=null,refused=false,clarified=false,submitted=null;
 const signatureContext=engine.byId?createRoutingContext(engine,document):null;
 const previews=[];
 const calls=[],eventId=`a3-score-${row.id}`;
 const input=row.input??(row.action?{tool:'world_act',args:typeof row.action==='string'?{action:row.action,slots:row.slots??{}}:row.action}:{tool:'world_propose',args:row.proposal});
 const invokePreview=async call=>{
  calls.push({phase:'preview',tool:call.tool,action:call.args?.action,eventId:call.eventId});
  try{
   const value=await engine.previewAction(document,call),r=receiptOf(value),routing=value.prepared??r?.routing??value.routing;
   previews.push({status:r?.status??null,reason:r?.reason??routing?.reason??routing?.fallback?.reason??null,ambiguities:r?.ambiguities??routing?.ambiguities??value.ambiguities??null,routingStatus:routing?.status??null});
   return value;
  }catch(error){
   previews.push({status:error instanceof PrimitiveRejected?'rejected':'error',reason:error.message,ambiguities:null,code:error.code??null});throw error;
  }
 };
 const commit=async call=>{
  calls.push({phase:'confirm',tool:call.tool,action:call.args?.action,eventId:call.eventId});
  const reduced=await engine.reduce(document,call);
  document=applyPatches(document,reduced.patches);
  submitted=call;
  // Legacy adapters without a primitive receipt have no provable effect set.
  receipt=receiptOf(reduced)??{...receiptOf(preview),status:'committed',applied:[]};
  adopted=receipt.routed??receipt.source?.id??reduced.result?.action??(call.tool==='world_act'?call.args.action:'open:proposal');
  return {ok:reduced.result?.ok!==false,result:{...reduced.result,receipt}};
 };
 async function construct(actionId,slots,id){
  const target=slots.target??slots.seller??slots.buyer;
  const offered=worldActions(engine.scoped(document),document,{query:actionId,target,limit:100}).actions.find(a=>a.id===actionId);
  if(!offered)return {ok:false,error:'动作未出现在当前构造器目录',steps:[]};
  const steps=[0];
  const builder=new ActionBuilder({newEventId:()=>id,
   preview:async(action,values,event)=>({...await invokePreview({...builderToolCall(action,values),eventId:event}),reference:{sequence:0}}),
   act:async(action,values,{eventId:event,expectedSequence})=>expectedSequence!==0?{ok:false,stale:true}:commit({...builderToolCall(action,values),eventId:event})});
  const fill=(action,values)=>{
   builder.choose(action);
   if(builder.action)for(const step of [1,2,3]){
    builder.step=step;steps.push(step);
    for(const slot of action.slots??[])if(builderStep(slot)===step&&Object.hasOwn(values,slot.name))builder.setSlot(slot.name,values[slot.name]);
   }
  };
  builder.intent=row.intent;fill(offered,slots);
  let quote=builder.action?await builder.preview():null;
  // Model the UI's explicit “leave a trace” choice, then select a form actually
  // offered by the current scene. Requested fictional forms are not enum IDs.
  const fallback=builder.feedback?.fallback;
  if(!quote&&fallback?.available){
   const mark=worldActions(engine.scoped(document),document,{query:fallback.action,target,limit:100}).actions.find(a=>a.id===fallback.action);
   if(mark){
    const requestedMark=slots.effects?.find(e=>e.op==='create'&&e.kind==='mark');
    const forms=mark.slots.find(s=>s.name==='form')?.options??[];
    const form=forms.find(f=>f.value===requestedMark?.facts?.form)?.value??forms[0]?.value;
    fill(mark,{intent:slots.intent??row.intent,form,tags:requestedMark?.tags??[engine.world.openTagging.default]});
    quote=await builder.preview();
   }
  }
  if(!quote)return {ok:false,error:builder.error,steps};
  preview=quote.result;
  const result=await builder.confirm();
  return {ok:result?.ok===true&&receipt?.status==='committed',error:builder.error,steps};
 }
 let builderResult=null,prepared=null;
 try{
  if(setupUnmet.length){const missing=new Error('Unable to establish setup');missing.code='A3-SCORE-SETUP';throw missing;}
  if(!row.builder&&!row.input&&!row.action&&!row.proposal){
   const missing=new Error('语料仅有自然语言；缺少独立生成的 proposal/input/action/builder，不使用 expected 构造执行输入');
   missing.code='A3-SCORE-INPUT';throw missing;
  }
  if(row.builder)builderResult=await construct(row.builder.action,row.builder.slots??{},eventId);
  else{
   const call={...input,eventId};preview=await invokePreview(call);receipt=receiptOf(preview);
   prepared=preview.prepared??receipt?.routing??preview.routing;
   clarified=clarifyStates.has(prepared?.status);refused=receipt?.status==='rejected';
   if(receipt?.status==='preview')await commit(prepared?.status==='routed'?{tool:'world_act',eventId,args:{action:prepared.routed,slots:prepared.slots}}:call);
   else if(prepared?.status==='needs_alternative'&&prepared.fallback?.available){
    // Accept the native alternative explicitly; availability earns no credit.
    const mark=(input.args?.effects??[]).find(e=>e.op==='create'&&e.kind==='mark');
    const slots={intent:prepared.fallback.intent,form:mark?.facts?.form??engine.world.openActionRules.mark.forms[0],tags:mark?.tags??[engine.world.openTagging.default]};
    const fallback={tool:'world_act',eventId:`${eventId}-mark`,args:{action:prepared.fallback.action,slots}};
    preview=await invokePreview(fallback);
    if(receiptOf(preview)?.status==='preview')await commit(fallback);
   }
  }
  refused ||= receipt?.status==='rejected';
 }catch(caught){error={code:caught.code??null,message:caught.message};refused=caught instanceof PrimitiveRejected;}
 const committed=receipt?.status==='committed',effects=committed||receipt?.status==='rejected'?(receipt.applied??[]).map(effect=>{
  const created=effect.op==='create'&&document.state.created?.[effect.result?.entity];
  const subject=effect.target??effect.entity??effect.subject??effect.actor;
  const signatureKind=signatureContext?.kindOf(selfId(subject))??null;
  return {...effect,...(signatureKind?{signatureKind}:{}),...(created?{tags:created.tags??effect.tags}:{})};
 }):[];
 const entityId=receipt?.mark?.entity??receipt?.fallback?.entity??effects.find(e=>e.op==='create'&&e.kind==='mark')?.result?.entity;
 const entity=entityId&&document.state.created?.[entityId],holding=entityId&&document.holdings?.entities?.[entityId];
 const reactions=(receipt?.mark?.reactions??effects.find(e=>e.op==='create'&&e.kind==='mark')?.result?.reactions??[]).filter(reaction=>{
  const event=document.state.records?.[`world_event:${reaction.event}`];
  return event?.category==='world_event'&&event.verb==='tell'&&event.payload?.kind==='mark_reaction'&&event.payload.mark===entityId&&event.actor===reaction.observer&&event.tags?.includes(reaction.tag);
 });
 const fallback=Boolean(committed&&entity?.tags?.length&&holding?.kind==='mark'&&holding.goneAt===undefined&&reactions.length);
 const traceOnly=receipt?.fallback?.originalIntentFulfilled===false;
 const requested=(row.proposal??(row.input?.tool==='world_propose'?row.input.args:null))?.effects;
 const measured=signatureEffects(effects,receipt??{},requested);
 const actual={route:committed?adopted:clarified?'clarify':refused?'reject':null,status:receipt?.status??null,signature:unique(measured.effects.map(e=>e.op)),signatureEffects:measured.effects,excludedCosts:measured.excluded,unmatchedCosts:measured.unmatchedCosts,refused,clarified,committed,fallback,traceOnly,entity:entityId??null,reactions:reactions.length,error,calls,builder:builderResult};
 Object.assign(actual,{setupUnmet,preview:previews[0]??null,previews});
 return {actual,receipt,document,preview,prepared,effects,submitted,setupUnmet,requested};
}

export async function scoreRows(rows,{world,seed,document:initial}={}){
 world??=await loadWorld();seed??=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
 const engine=new WorldEngine(world);initial??=engine.createCharacter(seed,{},'a3-score-independent');
 const registry=primitiveRuntime.registry(engine),normalizeRoute=route=>routeName(route,registry);
 const results=[];
 for(const row of rows){
  const run=await executeIntent(engine,initial,row),{actual}=run,expectedRoute=row.expected.route??row.expected.action;
  const ready=run.setupUnmet.length===0;
  const route=ready&&(Array.isArray(expectedRoute)?expectedRoute.some(r=>normalizeRoute(r)===normalizeRoute(actual.route)):normalizeRoute(expectedRoute)===normalizeRoute(actual.route));
  // Rejection signatures describe the REQUEST, not an adopted effect set.
  // Credit requires an actual refusal and zero raw applied effects, including
  // costs (do not let cost filtering or a rejected receipt hide mutations).
  // Out-of-bounds requests come in two forms (06 §6.7): a reject route must be
  // refused outright; a concrete route is a bounded outcome that must commit
  // only the clipped effects its signature names.
  const routeRejects=Array.isArray(expectedRoute)?expectedRoute.every(r=>normalizeRoute(r)==='reject'):normalizeRoute(expectedRoute)==='reject';
  const bounded=row.expected.outOfBounds===true&&!routeRejects;
  const expectsRejection=!bounded&&(row.expected.outOfBounds===true||routeRejects);
  const signature=ready&&(expectsRejection
   ?actual.refused&&!actual.committed&&(run.receipt?.applied??[]).length===0&&run.effects.length===0
   :(!actual.error||actual.refused)&&signatureMatches(row.expected.signature,run.effects,run.receipt??{},run.requested,world));
  let constructor=false,builder=actual.builder;
  if(ready&&row.expected.constructor){
   if(builder)constructor=builder.ok&&route&&signature&&(!row.expected.fallback||actual.fallback);
   else{
    // Replay the independently supplied input through the same four-step form
    // and tool adapter as the UI. Open proposals are editable dynamic duties,
    // not world_act slots, and a failed non-builder run must not suppress them.
    const input=row.input??(row.action?{tool:'world_act',args:typeof row.action==='string'?{action:row.action,slots:row.slots??{}}:row.action}:row.proposal?{tool:'world_propose',args:row.proposal}:null);
    const action=input?.tool==='world_propose'?'open:proposal':input?.tool==='world_act'?input.args.action:null;
    const slots=input?.tool==='world_propose'?input.args:input?.args?.slots;
    if(action&&slots){
     const built=await executeIntent(engine,initial,{...row,id:`${row.id}-builder`,builder:{action,slots}});
     builder={...built.actual.builder,route:built.actual.route,signature:built.actual.signature,signatureEffects:built.actual.signatureEffects,fallback:built.actual.fallback,traceOnly:built.actual.traceOnly,calls:built.actual.calls,previews:built.actual.previews};
     const builtRoute=Array.isArray(expectedRoute)?expectedRoute.some(r=>normalizeRoute(r)===normalizeRoute(built.actual.route)):normalizeRoute(expectedRoute)===normalizeRoute(built.actual.route);
     constructor=Boolean(builtRoute&&builder?.ok&&signatureMatches(row.expected.signature,built.effects,built.receipt??{},built.requested,world)&&(!row.expected.fallback||built.actual.fallback));
    }
   }
  }
  const supported=bounded?actual.committed&&signature:row.expected.outOfBounds?actual.refused:normalizeRoute(expectedRoute)==='clarify'?actual.clarified:actual.committed&&(row.expected.fallback?actual.fallback:run.receipt?.fallback?.originalIntentFulfilled!==false);
  results.push({id:row.id,text:row.intent,expected:row.expected,bounded,setupUnmet:run.setupUnmet,actual:{...actual,builder},scores:{route,signature,outOfBounds:ready&&(bounded?actual.committed&&signature:actual.refused===row.expected.outOfBounds),supported:ready&&supported,constructor},repair:row.expected.repair});
 }
 const total=rows.length,tricky=rows.filter(r=>r.tricky).length,rate=(key,denominator=total)=>denominator?results.filter(r=>r.scores[key]).length/denominator:1;
 const fallbackExpected=rows.filter(r=>r.expected.fallback).length,fallbackReacted=results.filter(r=>r.expected.fallback&&r.actual.fallback).length,constructorExpected=rows.filter(r=>r.expected.constructor).length;
 // Preserve the acceptance gate's conservative definition: every expected
 // rejection must really be rejected. Applied violations are reported apart
 // from clarification/failure; those cannot earn rejection credit.
 return {setupUnmet:results.filter(r=>r.setupUnmet.length).map(r=>({id:r.id,items:r.setupUnmet})),setupUnmetCount:results.filter(r=>r.setupUnmet.length).length,total,tricky,trickyRate:total?tricky/total:0,route:rate('route'),signature:rate('signature'),outOfBoundsLeaks:results.filter(r=>r.expected.outOfBounds&&!r.setupUnmet.length&&(r.bounded?!r.scores.outOfBounds:!r.actual.refused)).map(r=>r.id),outOfBoundsApplied:results.filter(r=>r.expected.outOfBounds&&r.actual.committed&&!r.actual.traceOnly&&!(r.bounded&&r.scores.signature)).map(r=>r.id),outOfBoundsUnverified:results.filter(r=>r.expected.outOfBounds&&(r.setupUnmet.length||(!r.actual.committed&&!r.actual.refused&&!r.actual.clarified))).map(r=>r.id),inputMissing:results.filter(r=>r.actual.error?.code==='A3-SCORE-INPUT').map(r=>r.id),unsupported:results.filter(r=>!r.scores.supported).map(r=>r.id),fallbackExpected,fallbackReacted,fallbackReactionRate:fallbackExpected?fallbackReacted/fallbackExpected:1,constructorExpected,constructor:rate('constructor',constructorExpected),results};
}
export async function scoreCorpus(options={}){const {rows,corpusPath}=await loadCorpus(options);return {...await scoreRows(rows,options),corpusPath};}
// Importing the scorer performs no run and emits no output.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--corpus'),corpusPath=index>=0?process.argv[index+1]:process.argv.slice(2).find(arg=>!arg.startsWith('--')),report=await scoreCorpus(corpusPath?{corpusPath}:{});
 console.log(JSON.stringify(process.argv.includes('--summary')?{...report,results:undefined}:report,null,2));
}
export default scoreCorpus;
