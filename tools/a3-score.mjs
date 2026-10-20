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
 let document=structuredClone(initial),preview=null,receipt=null,adopted=null,error=null,refused=false,clarified=false,submitted=null;
 const calls=[],eventId=`a3-score-${row.id}`;
 const input=row.input??(row.action?{tool:'world_act',args:typeof row.action==='string'?{action:row.action,slots:row.slots??{}}:row.action}:{tool:'world_propose',args:row.proposal});
 const invokePreview=async call=>{calls.push({phase:'preview',tool:call.tool,action:call.args?.action,eventId:call.eventId});return engine.previewAction(document,call);};
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
 return {actual,receipt,document,preview,prepared,effects,submitted};
}

export async function scoreRows(rows,{world,seed,document:initial}={}){
 world??=await loadWorld();seed??=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
 const engine=new WorldEngine(world);initial??=engine.createCharacter(seed,{},'a3-score-independent');
 const results=[];
 for(const row of rows){
  const run=await executeIntent(engine,initial,row),{actual}=run,expectedRoute=row.expected.route??row.expected.action;
  const route=Array.isArray(expectedRoute)?expectedRoute.some(r=>routeName(r)===actual.route):routeName(expectedRoute)===actual.route;
  const signature=(!actual.error||actual.refused)&&signatureMatches(row.expected.signature,run.effects);
  let constructor=false,builder=actual.builder;
  if(row.expected.constructor){
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
  results.push({id:row.id,text:row.intent,expected:row.expected,actual:{...actual,builder},scores:{route,signature,outOfBounds:actual.refused===row.expected.outOfBounds,supported,constructor},repair:row.expected.repair});
 }
 const total=rows.length,tricky=rows.filter(r=>r.tricky).length,rate=(key,denominator=total)=>denominator?results.filter(r=>r.scores[key]).length/denominator:1;
 const fallbackExpected=rows.filter(r=>r.expected.fallback).length,fallbackReacted=results.filter(r=>r.expected.fallback&&r.actual.fallback).length,constructorExpected=rows.filter(r=>r.expected.constructor).length;
 // Preserve the acceptance gate's conservative definition: every expected
 // rejection must really be rejected. Applied violations are reported apart
 // from clarification/failure; those cannot earn rejection credit.
 return {total,tricky,trickyRate:total?tricky/total:0,route:rate('route'),signature:rate('signature'),outOfBoundsLeaks:results.filter(r=>r.expected.outOfBounds&&!r.actual.refused).map(r=>r.id),outOfBoundsApplied:results.filter(r=>r.expected.outOfBounds&&r.actual.committed&&!r.actual.traceOnly).map(r=>r.id),outOfBoundsUnverified:results.filter(r=>r.expected.outOfBounds&&!r.actual.committed&&!r.actual.refused&&!r.actual.clarified).map(r=>r.id),inputMissing:results.filter(r=>r.actual.error?.code==='A3-SCORE-INPUT').map(r=>r.id),unsupported:results.filter(r=>!r.scores.supported).map(r=>r.id),fallbackExpected,fallbackReacted,fallbackReactionRate:fallbackExpected?fallbackReacted/fallbackExpected:1,constructorExpected,constructor:rate('constructor',constructorExpected),results};
}
export async function scoreCorpus(options={}){const {rows,corpusPath}=await loadCorpus(options);return {...await scoreRows(rows,options),corpusPath};}
// Importing the scorer performs no run and emits no output.
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=process.argv.indexOf('--corpus'),report=await scoreCorpus(index>=0?{corpusPath:process.argv[index+1]}:{});
 console.log(JSON.stringify(process.argv.includes('--summary')?{...report,results:undefined}:report,null,2));
}
export default scoreCorpus;
