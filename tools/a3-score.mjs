import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {PRIMITIVE_IDS,PrimitiveRejected} from '../server-plugin/primitive-policy.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {ActionBuilder,builderStep} from '../extension/action-builder.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {isGone,isPhysicallyDead} from '../server-plugin/holdings.mjs';
import {applyMagicStatus} from '../server-plugin/magic-status.mjs';

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
const routeName=route=>({拒绝:'reject',rejected:'reject',refuse:'reject',澄清:'clarify',clarification:'clarify'}[route]??route);

// Fixture construction before the measured action, using the same balance
// construction + openLedger approach as tests/helpers/ledger-sync.mjs.
// status: player status string, {entityId: statusString}, or an array of
// {target, status, power, duration} for the native magic status writer.
// facts: [{path:['state', ...existingFieldPath], value: ...}].
export function applyIntentSetup(engine,initial,setup){
 const document=structuredClone(initial),setupUnmet=[],s=document.state;
 if(setup===undefined)return {document,setupUnmet};
 const unmet=(item,reason)=>setupUnmet.push({item,reason});
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const actor=id=>id==='player'||id==='self'?s.player:Object.hasOwn(s.npcs??{},id)?s.npcs[id]:Object.hasOwn(s.creatures??{},id)?s.creatures[id]:null;
 if(!object(setup)){unmet('setup','expected an object');return {document,setupUnmet};}
 for(const key of Object.keys(setup))if(!['location','present','inventory','coins','minute','status','facts'].includes(key))unmet(key,'unsupported setup field');
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
 return {document,setupUnmet};
}

// routing.signature describes requested effects. Only committed applied effects
// are evidence; the legacy corpus also includes exact entity/field/tag tokens.
export function signatureMatches(expected,effects){
 const ops=unique(effects.map(e=>e.op));
 // v2 annotates primitives as op(subject, qualifiers). Its metric is the
 // primitive set; qualifiers remain in expected for the human explanation.
 const opOf=value=>PRIMITIVE_IDS.find(op=>value===op||value.startsWith(`${op}(`));
 if(!sameSet(expected.map(opOf).filter(Boolean),ops))return false;
 const atoms=new Set();
 const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);else if(typeof value==='string'){atoms.add(value);if(value.includes('|'))value.split('|').forEach(x=>atoms.add(x));}};
 effects.forEach(({result,index,actedAs,...effect})=>visit(effect));
 return expected.filter(s=>!opOf(s)).every(s=>atoms.has(s));
}

// Start each intention from the same campaign: rows cannot spend each other's
// money, move observers or exhaust a later row's daily bounds.
export async function executeIntent(engine,initial,row){
 let {document,setupUnmet}=applyIntentSetup(engine,initial,row.setup),preview=null,receipt=null,adopted=null,error=null,refused=false,clarified=false,submitted=null;
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
   preview:async(action,values,event)=>({...await invokePreview({tool:'world_act',args:{action,slots:values},eventId:event}),reference:{sequence:0}}),
   act:async(action,values,{eventId:event,expectedSequence})=>expectedSequence!==0?{ok:false,stale:true}:commit({tool:'world_act',args:{action,slots:values},eventId:event})});
  builder.intent=row.intent;builder.choose(offered);
  if(builder.action)for(const step of [1,2,3]){
   builder.step=step;steps.push(step);
   for(const slot of offered.slots??[])if(builderStep(slot)===step&&Object.hasOwn(slots,slot.name))builder.setSlot(slot.name,slots[slot.name]);
  }
  const quote=builder.action?await builder.preview():null;
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
 const committed=receipt?.status==='committed',effects=committed?(receipt.applied??[]).map(effect=>{
  const created=effect.op==='create'&&document.state.created?.[effect.result?.entity];
  return created?{...effect,tags:created.tags??effect.tags}:effect;
 }):[];
 const entityId=receipt?.mark?.entity??receipt?.fallback?.entity??effects.find(e=>e.op==='create'&&e.kind==='mark')?.result?.entity;
 const entity=entityId&&document.state.created?.[entityId],holding=entityId&&document.holdings?.entities?.[entityId];
 const reactions=(receipt?.mark?.reactions??effects.find(e=>e.op==='create'&&e.kind==='mark')?.result?.reactions??[]).filter(reaction=>{
  const event=document.state.records?.[`world_event:${reaction.event}`];
  return event?.category==='world_event'&&event.verb==='tell'&&event.payload?.kind==='mark_reaction'&&event.payload.mark===entityId&&event.actor===reaction.observer&&event.tags?.includes(reaction.tag);
 });
 const fallback=Boolean(committed&&entity?.tags?.length&&holding?.kind==='mark'&&holding.goneAt===undefined&&reactions.length);
 const traceOnly=receipt?.fallback?.originalIntentFulfilled===false;
 const actual={route:committed?adopted:clarified?'clarify':refused?'reject':null,status:receipt?.status??null,signature:unique(effects.map(e=>e.op)),refused,clarified,committed,fallback,traceOnly,entity:entityId??null,reactions:reactions.length,error,calls,builder:builderResult};
 Object.assign(actual,{setupUnmet,preview:previews[0]??null,previews});
 return {actual,receipt,document,preview,prepared,effects,submitted,setupUnmet};
}

export async function scoreRows(rows,{world,seed,document:initial}={}){
 world??=await loadWorld();seed??=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
 const engine=new WorldEngine(world);initial??=engine.createCharacter(seed,{},'a3-score-independent');
 const results=[];
 for(const row of rows){
  const run=await executeIntent(engine,initial,row),{actual}=run,expectedRoute=row.expected.route??row.expected.action;
  const ready=run.setupUnmet.length===0;
  const route=ready&&(Array.isArray(expectedRoute)?expectedRoute.some(r=>routeName(r)===actual.route):routeName(expectedRoute)===actual.route);
  const signature=ready&&(!actual.error||actual.refused)&&signatureMatches(row.expected.signature,run.effects);
  let constructor=false,builder=actual.builder;
  if(ready&&row.expected.constructor){
   if(builder)constructor=builder.ok&&route&&signature&&(!row.expected.fallback||actual.fallback);
   else{
    const action=actual.committed&&actual.route!=='open:proposal'?actual.route:null;
    const slots=run.submitted?.args?.slots;
    if(action&&slots){
     const built=await executeIntent(engine,initial,{...row,id:`${row.id}-builder`,builder:{action,slots}});builder=built.actual.builder;
     constructor=Boolean(route&&builder?.ok&&built.actual.route===actual.route&&signatureMatches(row.expected.signature,built.effects)&&(!row.expected.fallback||built.actual.fallback));
    }
   }
  }
  const supported=row.expected.outOfBounds?actual.refused:routeName(expectedRoute)==='clarify'?actual.clarified:actual.committed&&(row.expected.fallback?actual.fallback:run.receipt?.fallback?.originalIntentFulfilled!==false);
  results.push({id:row.id,text:row.intent,expected:row.expected,setupUnmet:run.setupUnmet,actual:{...actual,builder},scores:{route,signature,outOfBounds:ready&&actual.refused===row.expected.outOfBounds,supported:ready&&supported,constructor},repair:row.expected.repair});
 }
 const total=rows.length,tricky=rows.filter(r=>r.tricky).length,rate=(key,denominator=total)=>denominator?results.filter(r=>r.scores[key]).length/denominator:1;
 const fallbackExpected=rows.filter(r=>r.expected.fallback).length,fallbackReacted=results.filter(r=>r.expected.fallback&&r.actual.fallback).length,constructorExpected=rows.filter(r=>r.expected.constructor).length;
 // Preserve the acceptance gate's conservative definition: every expected
 // rejection must really be rejected. Applied violations are reported apart
 // from clarification/failure; those cannot earn rejection credit.
 return {setupUnmet:results.filter(r=>r.setupUnmet.length).map(r=>({id:r.id,items:r.setupUnmet})),setupUnmetCount:results.filter(r=>r.setupUnmet.length).length,total,tricky,trickyRate:total?tricky/total:0,route:rate('route'),signature:rate('signature'),outOfBoundsLeaks:results.filter(r=>r.expected.outOfBounds&&!r.actual.refused).map(r=>r.id),outOfBoundsApplied:results.filter(r=>r.expected.outOfBounds&&r.actual.committed&&!r.actual.traceOnly).map(r=>r.id),outOfBoundsUnverified:results.filter(r=>r.expected.outOfBounds&&!r.actual.committed&&!r.actual.refused&&!r.actual.clarified).map(r=>r.id),inputMissing:results.filter(r=>r.actual.error?.code==='A3-SCORE-INPUT').map(r=>r.id),unsupported:results.filter(r=>!r.scores.supported).map(r=>r.id),fallbackExpected,fallbackReacted,fallbackReactionRate:fallbackExpected?fallbackReacted/fallbackExpected:1,constructorExpected,constructor:rate('constructor',constructorExpected),results};
}
export async function scoreCorpus(options={}){const {rows,corpusPath}=await loadCorpus(options);return {...await scoreRows(rows,options),corpusPath};}
// Importing the scorer performs no run and emits no output.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--corpus'),report=await scoreCorpus(index>=0?{corpusPath:process.argv[index+1]}:{});
 console.log(JSON.stringify(process.argv.includes('--summary')?{...report,results:undefined}:report,null,2));
}
export default scoreCorpus;
