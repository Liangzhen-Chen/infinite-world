import {transfer,balance,parseAccount,isSource,isSink,declareLedgerWriter} from './ledger.mjs';
import {updateEntity,declareHoldingWriter,ENTITY_KINDS,openHolding,closeHolding,transferHolding,rescaleHolding,holdingRow,holdingKind,holdingKindIds,runHoldingProtocol} from './holdings.mjs';
import {PrimitiveRejected,validatePrimitive,writableFact,reject} from './primitive-policy.mjs';
import {beginReactionTick,drainWorldReactions,publishTransitionEvent,presentWitnesses,SOCIAL_VERBS} from './world-events.mjs';
import {submitContest} from './scheduler.mjs';

declareLedgerWriter('primitives',{sinks:['sink:consume']});
declareHoldingWriter('primitives',{entities:Object.keys(ENTITY_KINDS)});
const frames=new WeakMap();
let actionRuntime=null;
// Installed once by the native composition root, never from a tool payload.
export function registerPrimitiveActionRuntime(runtime){actionRuntime=runtime;}
export const primitiveActionRuntime=()=>actionRuntime;
const clone=value=>structuredClone(value);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
// Native composition root only. JSON proposals cannot manufacture this token.
// Every policy sees the transaction's CURRENT document, including prior effects.
export function createPrimitiveFrame({actor,eventId,source,canAct,authority,location,mirrorTransfer,transferLot=null,factPolicy={},verbs=[],createDraft=null,executePrimitive=null,engine=null,accountExists=null,validate=null,validateFact=null,prepare=null,finish=null,identity=null}){
 if(typeof actor!=='string'||!actor||typeof eventId!=='string'||!eventId||eventId.length>120||!['catalog','open','rule'].includes(source?.kind)||typeof source.id!=='string'||!source.id)reject('E-PRIMITIVE-FRAME','缺少服务端行动者、事件编号或来源');
 for(const [name,fn] of Object.entries({canAct,authority,location,mirrorTransfer}))if(typeof fn!=='function')reject('E-PRIMITIVE-FRAME',`缺少服务端 ${name} 接点`);
 const frame=Object.freeze({actor,eventId,source:Object.freeze({...source})});
 frames.set(frame,{canAct,authority,location,mirrorTransfer,transferLot,factPolicy:clone(factPolicy),verbs:new Set(verbs),createDraft,executePrimitive,engine,accountExists,validate,validateFact,prepare,finish,identity:clone(identity)});return frame;
}
function draft(document){
 return {document:clone(document),patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},peek(...p){return this.get(...p);},
  set(path,value){let at=this.document;for(const k of path.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(k))reject('E-PRIMITIVE-PATH','非法写入路径');at=at[k]??={};}at[path.at(-1)]=clone(value);this.patches.push({op:'set',path,value:clone(value)});},
  remove(path){let at=this.document;for(const k of path.slice(0,-1))at=at?.[k];if(at)delete at[path.at(-1)];this.patches.push({op:'delete',path});}};
}
const receiptBase=(effects,frame)=>({eventId:frame.eventId,actor:frame.actor,source:frame.source,routed:null,candidates:[],applied:[],trimmed:[],check:null,consequences:[],narrate:{must:[],mustNot:[]},alternatives:[],fallback:null,status:'ready',signature:effects.map(e=>e.op)});

// Native costs occupy the leading transaction indices. Attach provenance only
// after execution, so clients cannot smuggle receipt fields into primitives.
export function recordResourceCosts(receipt,resources,{requested=[],sources=[]}={}){
 const requests=requested.map((effect,index)=>({effect,index,used:false}));
 const same=(a,b)=>a.op==='transfer'&&b.op==='transfer'&&a.from===b.from&&a.to===b.to;
 // A requested consumption implemented as an outcome must not also label an
 // identical extra fee as the requested effect.
 for(const effect of receipt.applied.filter(e=>e.index>=resources.length)){
  const match=requests.find(row=>!row.used&&same(row.effect,effect));if(match)match.used=true;
 }
 receipt.cost.resources=resources.map((resource,costIndex)=>{
  const applied=receipt.applied.find(effect=>effect.index===costIndex);
  if(!applied||!same(resource,applied)||resource.qty!==applied.qty)reject('E-ACTION-COST','Resource cost has no matching applied effect');
  const match=requests.find(row=>!row.used&&same(row.effect,applied));if(match)match.used=true;
  const metadata={source:sources[costIndex]??receipt.source,role:match?'requested_consumption':'additional_cost',appliedEvent:receipt.eventId,costIndex,...(match?{requestIndex:match.index}:{})};
  Object.assign(applied,metadata);
  return {...resource,...metadata,index:applied.index};
 });
}
function execute(document,effects,frame,commit,{deferReactions=false,pending=null,reactionContext=null}={}){
 const policy=frames.get(frame);if(!policy)reject('E-PRIMITIVE-FRAME','原语只能由服务端行动框架调用');
 if(!Array.isArray(effects)||!effects.length||effects.length>64)reject('E-PRIMITIVE-LIST','原语列表须有 1 至 64 项');
 const original=clone(effects);original.forEach((effect,index)=>{try{validatePrimitive(effect);}catch(error){error.index=index;throw error;}});
 const baseIdentity={actor:frame.actor,source:frame.source,effects:original},legacyFingerprint=canonical(baseIdentity),fingerprint=policy.identity===null?legacyFingerprint:canonical({...baseIdentity,identity:policy.identity}),key=`primitive:${frame.eventId}`;
 const old=document.state?.records?.[key];
 if(old){if(old.category!=='primitive_receipt'||old.fingerprint!==fingerprint&&old.fingerprint!==legacyFingerprint)reject('E-PRIMITIVE-DUPLICATE','事件编号已用于不同提案');return {patches:[],events:[],receipt:{...clone(old.receipt),duplicate:true}};}
 const d=policy.createDraft?policy.createDraft(clone(document)):draft(document),receipt=receiptBase(original,frame),children=[];
 if(frame.source.kind==='catalog')receipt.routed=frame.source.id;
 if(pending)receipt.pending=pending;
 if(policy.engine&&d.scheduler)beginReactionTick(d);
 if(d.reactionTick&&reactionContext)d.reactionTick.active={...reactionContext};
 policy.validate?.(d.document);
 const selected=policy.prepare?.(d,{frame,receipt,effects:original})??original,resolutions=new Set();
 if(!Array.isArray(selected)||selected.length>64)reject('E-PRIMITIVE-LIST','Invalid native outcome list');
 selected.forEach(validatePrimitive);
 for(let index=0;index<selected.length;index++){
  const effect=selected[index],patchStart=d.patches.length;try{
   if(effect.actor!==undefined&&effect.actor!==frame.actor)reject('E-PRIMITIVE-ACTOR','Effect actor must be the native frame actor');
   const capability=policy.canAct(d.document,frame.actor,effect.op,effect);
   if(!capability?.allowed)reject('E-CAPACITY',capability?.reason??'当前不能进行这类行动');
   const tags=[...capability.tags??[]];let actedAs=null,result;
   const requireAuthority=(op,target,options)=>{
    const a=policy.authority(d.document,frame.actor,op,target,options);if(!a?.allowed)reject('E-AUTHORITY',a?.reason??'没有动用权限');
    tags.push(...a.tags??[]);actedAs=a.actedAs;
    if(actedAs?.kind==='resolution'){
     resolutions.add(actedAs.id);
     updateEntity(d,{id:actedAs.id,facts:{phase:'executing',executionEvent:frame.eventId},writer:'primitives',eventId:frame.eventId});
    }
    return a;
   };
   if(effect.op==='transfer'){
    const a=parseAccount(effect.from),b=parseAccount(effect.to),qty=effect.qty;
    for(const key of [effect.from,...(isSink(b.owner)?[]:[effect.to])])if(policy.accountExists?.(d.document,key)&&!Object.hasOwn(d.get('ledger','accounts')??{},key))d.set(['ledger','accounts',key],0);
    if(effect.from===effect.to)reject('E-TRANSFER-ENDPOINT','Transfer accounts must differ');
    if(isSource(a.owner)||isSink(a.owner)||isSource(b.owner)||a.resource!==b.resource||effect.resource&&effect.resource!==a.resource)reject('E-TRANSFER-ENDPOINT','提案不能动用资源源或跨资源账户');
    if(!Number.isSafeInteger(qty)||qty<=0)reject('E-TRANSFER-QTY','转移数量须为正整数');
    if(!d.get('ledger','accounts')||!Object.hasOwn(d.get('ledger','accounts'),effect.from)||!isSink(b.owner)&&!Object.hasOwn(d.get('ledger','accounts'),effect.to))reject('E-TRANSFER-ACCOUNT','两端账户必须已经存在');
    if(d.get('ledger','version')!==1)reject('E-TRANSFER-BOOKS','账本尚未开立');
    if(/^(escrow|collected)(:|$)/.test(a.purpose))reject('E-TRANSFER-PURPOSE','托管资金不能由普通转移提案动用');
    requireAuthority('transfer',effect.from,{effect});
    if(isSink(b.owner)&&(a.owner!==frame.actor||b.owner!=='sink:consume'))reject('E-TRANSFER-SINK','本接点只允许消耗自己账户中的资源');
    if(!isSink(b.owner)){
     const from=policy.location(d.document,a.owner),to=policy.location(d.document,b.owner);
     if(!from||policy.location(d.document,frame.actor)!==from)reject('E-TRANSFER-REACH','Actor must be physically present at the source');
     if(!from||!to||from!==to)reject('E-TRANSFER-REACH','两端不在同一节点，需要显式运送或汇兑载体');
    }
    // New primitives cannot use the migration ledger's drift repair branch.
    if(balance(d,effect.from)<qty)reject('E-TRANSFER-BALANCE','账户余额不足');
    result=transfer(d,{from:effect.from,to:effect.to,amount:qty,writer:'primitives',eventId:frame.eventId,pick:effect.lot??null,lot:policy.transferLot?.(d.document,effect)??null});
    policy.mirrorTransfer(d,{...effect,actor:frame.actor,eventId:frame.eventId});
   }else if(effect.op.startsWith('holding.')){
    if(d.get('holdings','version')!==1)reject('E-HOLDING-BOOKS','Holdings are not initialized');
    const row=effect.op==='holding.open'||effect.op==='holding.rescale'?null:holdingRow(d,effect.holding??effect.id);
    if(!row&&['holding.close','holding.transfer'].includes(effect.op))reject('E-HOLDING-ENTITY','Holding does not exist');
    const kind=holdingKind(effect.holdingKind??row?.kind);
    if(!kind)reject('E-HOLDING-KIND','Unknown holding kind');
    if(effect.op==='holding.open'&&effect.terms!==undefined&&effect.terms!==null&&(typeof effect.terms!=='object'||Array.isArray(effect.terms)||Object.keys(effect.terms).some(field=>!kind.terms?.includes(field))))reject('E-HOLDING-TERMS','Holding terms must be declared by the holding kind');
    declareHoldingWriter('primitives',{kinds:holdingKindIds()});
    const subject=row?.subject??effect.subject;
    requireAuthority(effect.op,subject,{holding:row,kind:kind.id,variant:effect.variant,holder:effect.holder,reason:effect.reason,shares:effect.shares,disposition:effect.op==='holding.transfer'||kind.id==='pledged'});
    const base={writer:'primitives',eventId:frame.eventId,engine:policy.engine};
    const mutate=(op,args,native)=>{
     const value=policy.engine?runHoldingProtocol(d,policy.engine,{...base,...args,op,eventId:`${frame.eventId}:${index}`}):native(d,{...base,...args});
     if(value===null)reject('E-PRIMITIVE-CONNECTOR','Holding lifecycle protocol is not installed');
     return value;
    };
    if(effect.op==='holding.open')result=mutate('open',{kind:kind.id,variant:effect.variant??null,holder:effect.holder,subject,terms:effect.terms??null,grantedBy:frame.actor,source:frame.source.id,inName:actedAs?.id??frame.actor},openHolding);
    else if(effect.op==='holding.close')result=mutate('close',{id:row.id,reason:effect.reason??'released'},closeHolding);
    else if(effect.op==='holding.transfer'){
     if(kind.transferable!==true)reject('E-HOLDING-TRANSFER','This holding kind is not transferable');
     result=mutate('transfer',{id:row.id,holder:effect.newHolder??effect.holder},transferHolding);
    }else{
     // Rescaling affects every holder: the native policy must establish issuance
     // authority and agreement, rather than treating ownership as issuance.
     result=mutate('rescale',{kind:kind.id,subject,shares:effect.shares,source:frame.source.id},rescaleHolding);
    }
    for(const id of Array.isArray(result)?result:[result]){
     const created=holdingRow(d,id);
     if(created&&tags.length)d.set(['holdings','rows',id],{...created,flags:[...new Set([...created.flags??[],...tags])],...(created.concluded?{concluded:{...created.concluded,tags:[...tags]}}:{})});
    }
    if(effect.op==='holding.close'&&row.source?.startsWith('custody:')){
     if(typeof policy.engine?.primitiveHoldingChanged!=='function')reject('E-PRIMITIVE-CONNECTOR','Legacy custody projection requires its law connector');
     policy.engine.primitiveHoldingChanged(d,row,effect.reason??'released',`${frame.eventId}:${index}`);
    }
   }else if(effect.op==='fact.set'){
    const row=d.get('holdings','entities',effect.entity);if(!row)reject('E-FACT-ENTITY','实体不存在');
    requireAuthority('fact.set',effect.entity);
    if(Object.hasOwn(effect,'value')===Object.hasOwn(effect,'delta'))reject('E-FACT-VALUE','事实写入须指定 value 或 delta 之一');
    const value=Object.hasOwn(effect,'delta')?(row.facts?.[effect.field]??0)+effect.delta:effect.value;
    writableFact(policy.factPolicy,row.kind,effect.field,value);
    policy.validateFact?.(d,effect,{row,value});
    result=updateEntity(d,{id:effect.entity,facts:{[effect.field]:value},writer:'primitives',eventId:frame.eventId});
   }else if(effect.op==='emit'){
    if(!policy.verbs.has(effect.verb)||!['public','private','witnessed'].includes(effect.visibility))reject('E-EMIT-VERB','事件动词或可见性未登记');
    if(effect.actor!==undefined&&effect.actor!==frame.actor)reject('E-EMIT-ACTOR','不能冒充其他行动者');
    // tell/request are observational events. impress must use bounded standing
    // rules; it is intentionally not an executable numeric effect in this slice.
    if(!['tell','request','claim'].includes(effect.verb)){if(policy.executePrimitive)result=policy.executePrimitive(d,effect,{frame,index,requireAuthority,tags});else reject('E-PRIMITIVE-CONNECTOR','Missing native event connector');}
    else result={verb:effect.verb,target:effect.target??null,payload:clone(effect.payload??{}),visibility:effect.visibility};
   }else if(policy.executePrimitive){
    result=policy.executePrimitive(d,effect,{frame,index,requireAuthority,tags});
   }else reject('E-PRIMITIVE-CONNECTOR',`原语 ${effect.op} 尚缺执行接点`);
   const applied={index,...effect,result,tags:[...new Set(tags)],...(actedAs?{actedAs}:{})};
   if(result?.check)receipt.check??=result.check;
   if(result?.applied===false||result?.resisted){receipt.trimmed.push({index,effect,reason:result.reason??(result.resisted?'resisted':'opposed_check_failed')});receipt.narrate.mustNot.push({op:effect.op,index});}
   else receipt.applied.push(applied);
   if(result?.trimmed)receipt.trimmed.push({index,effect,...result.trimmed});
   const protocolId=`${frame.eventId}:${index}`,eventKeys=new Set(d.patches.slice(patchStart).filter(p=>p.op==='set'&&p.path.length===3&&p.path[0]==='state'&&p.path[1]==='records'&&p.value?.category==='world_event').map(p=>p.path[2]));
   for(const key of eventKeys){
    const event=d.get('state','records',key),canonical=event.id===protocolId||event.id.startsWith('obligation:')&&event.id.endsWith(`:${protocolId}`);
    const annotate=event=>({...event,...(canonical?{actor:frame.actor}:{}),parent:frame.eventId,source:frame.source,tags:[...new Set([...event.tags??[],...applied.tags])],...(actedAs?{actedAs}:{})});
    d.set(['state','records',key],annotate(event));
    for(const item of d.reactionTick?.queue??[])item.events=item.events.map(row=>row.id===event.id?annotate(row):row);
   }
   children.push({...applied,id:`${frame.eventId}:${index}`,parent:frame.eventId,actor:frame.actor,source:frame.source});
  }catch(error){if(error instanceof PrimitiveRejected){error.index=index;throw error;}throw new PrimitiveRejected(error.code??'E-PRIMITIVE-EXECUTION',error.message,index);}
 }
 policy.finish?.(d,{frame,receipt});
 for(const id of resolutions)updateEntity(d,{id,facts:{phase:'executed',executedAt:d.get('state','minute')},writer:'primitives',eventId:frame.eventId});
 receipt.status=commit?'committed':'preview';receipt.narrate.must=receipt.applied.map(e=>({op:e.op,index:e.index}));
 if(!commit)return {receipt};
 if(policy.engine){
  for(const child of children){
   if(child.op==='time'||child.result?.applied===false||child.result?.resisted)continue;
   // Holding/obligation protocols already publish their own canonical events.
   if(child.op.startsWith('holding.')||child.op.startsWith('obligation.'))continue;
   const verb=child.op==='emit'?child.verb:child.op==='transfer'&&child.actedAs?.kind==='theft'?'steal':({vital:child.delta>0?'heal':'harm',status:'status_applied',move:'moved',create:'created',destroy:'destroyed',schedule:'scheduled',learn:'learned','fact.set':'fact_changed'})[child.op]??child.op;
   SOCIAL_VERBS.add(verb);
   const location=policy.location(d.document,frame.actor),visibility=child.visibility??'private',witnesses=[...new Set([...(['public','witnessed'].includes(visibility)?presentWitnesses(d.get('state'),location,[frame.actor]):[]),...child.result?.noticedBy??[]])];
   const party=child.op==='transfer'?parseAccount(verb==='steal'?child.from:child.to).owner:null;
   const target=child.target??(party&&!isSink(party)?party:null)??(child.op==='learn'?child.result?.teacher:null)??child.entity??null;
   publishTransitionEvent(d,policy.engine,{id:child.id,parent:frame.eventId,verb,actor:frame.actor,target,minute:d.get('state','minute'),location,visibility,witnesses,tags:child.tags,primitive:child.op,result:child.result,...(child.op==='emit'?{payload:child.payload??{}}:{})});
  }
  if(!deferReactions)drainWorldReactions(d);
  const interruptions=actionRuntime?.settleRites?.(d,policy.engine)??[];
  for(const plan of interruptions){
   receipt.consequences.push({type:'rite_unfinished',source:plan.eventId,project:plan.project,reason:plan.reason});
   if(receipt.rite?.project===plan.project){receipt.rite.status='unfinished';receipt.rite.outcome=plan.reason;receipt.narrate.mustNot.push({kind:'rite_fulfilled'});}
  }
  if(d.scheduler){d.set(['state','scheduler','seq'],d.scheduler.seq);d.set(['state','scheduler','lastSettled'],d.scheduler.lastSettled);}
 }
 d.set(['state','records',key],{category:'primitive_receipt',fingerprint,receipt});
 return {patches:d.patches,receipt,events:[{id:frame.eventId,type:'primitives',actor:frame.actor,source:frame.source,effects:original,receipt},...children],...(deferReactions?{reactionQueue:d.reactionTick?.queue??[]}:{})};
}
export function planPrimitives(document,effects,frame){return execute(document,effects,frame,false);}
export function commitPrimitives(document,effects,frame){return execute(document,effects,frame,true);}
// System consequences join their caller's reaction queue, just like contest
// proposals below. They must not restart reaction depth/proposal budgets.
export function commitPrimitiveConsequences(document,effects,frame,{reactionContext=null}={}){return execute(document,effects,frame,true,{deferReactions:true,reactionContext});}

// Native queue API: JSON cannot supply a frame or a contest callback. No effect
// is applied until phase 3' invokes execute, which rechecks current facts.
export function queuePrimitiveProposal(d,effects,frame,{claims,bid,rank,arrival,onCommitted,preview=null}={}){
 if(!frames.has(frame))reject('E-PRIMITIVE-FRAME','Native frame required');
 const proposal=clone(effects);
 preview??=planPrimitives(d.document,proposal,frame).receipt;
 if(preview.duplicate)return {...commitPrimitives(d.document,proposal,frame),receipt:preview};
 if(!Array.isArray(claims)||!claims.length)reject('E-PRIMITIVE-CONTEST','Native resource claims required');
 const receipt={...preview,status:'pending',applied:[],narrate:{must:[],mustNot:[]},pending:frame.eventId};
 const fail=(reason,code)=>{
  Object.assign(receipt,{status:'rejected',reason,...(code?{code}:{}),applied:[],check:null,trimmed:proposal.map((effect,index)=>({effect,index,reason})),narrate:{must:[],mustNot:proposal.map((effect,index)=>({op:effect.op,index}))}});
  for(const key of ['cost','consent','decisions','outcome'])delete receipt[key];
  const policy=frames.get(frame),identity={actor:frame.actor,source:frame.source,effects:proposal,...(policy.identity===null?{}:{identity:policy.identity})};
  d.set(['state','records',`primitive:${frame.eventId}`],{category:'primitive_receipt',fingerprint:canonical(identity),receipt:clone(receipt)});
 };
 submitContest(d,{id:frame.eventId,actor:frame.actor,objectId:frame.actor,ruleId:frame.source.id,target:claims[0].target,targetKind:claims[0].targetKind,claims,bid,rank,arrival,
  execute(){
   let committed;
   try{committed=execute(d.document,proposal,frame,true,{deferReactions:true,pending:frame.eventId});}
   catch(error){if(!(error instanceof PrimitiveRejected))throw error;fail(error.message,error.code);return;}
   for(const patch of committed.patches)if(patch.op==='set')d.set(patch.path,patch.value);else d.remove(patch.path);
   if(d.scheduler)d.scheduler.seq=Math.max(d.scheduler.seq,d.get('state','scheduler','seq')??0);
   onCommitted?.(committed);
   if(committed.reactionQueue.length){
    if(!d.reactionTick)beginReactionTick(d);
    d.reactionTick.queue.push(...committed.reactionQueue);
   }
   Object.assign(receipt,committed.receipt,{pending:frame.eventId});
  },
  reject(reason){fail(reason);}
 });
 return {receipt};
}
