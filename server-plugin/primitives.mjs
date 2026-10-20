import {transfer,balance,parseAccount,isSource,isSink,declareLedgerWriter} from './ledger.mjs';
import {updateEntity,declareHoldingWriter,ENTITY_KINDS} from './holdings.mjs';
import {PrimitiveRejected,validatePrimitive,writableFact,reject} from './primitive-policy.mjs';

declareLedgerWriter('primitives',{sinks:['sink:consume']});
declareHoldingWriter('primitives',{entities:Object.keys(ENTITY_KINDS)});
const frames=new WeakMap();
const clone=value=>structuredClone(value);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
// Native composition root only. JSON proposals cannot manufacture this token.
// Every policy sees the transaction's CURRENT document, including prior effects.
export function createPrimitiveFrame({actor,eventId,source,canAct,authority,location,mirrorTransfer,factPolicy={},verbs=[]}){
 if(typeof actor!=='string'||!actor||typeof eventId!=='string'||!eventId||eventId.length>120||!['catalog','open','rule'].includes(source?.kind)||typeof source.id!=='string'||!source.id)reject('E-PRIMITIVE-FRAME','缺少服务端行动者、事件编号或来源');
 for(const [name,fn] of Object.entries({canAct,authority,location,mirrorTransfer}))if(typeof fn!=='function')reject('E-PRIMITIVE-FRAME',`缺少服务端 ${name} 接点`);
 const frame=Object.freeze({actor,eventId,source:Object.freeze({...source})});
 frames.set(frame,{canAct,authority,location,mirrorTransfer,factPolicy:clone(factPolicy),verbs:new Set(verbs)});return frame;
}
function draft(document){
 return {document:clone(document),patches:[],get(...p){return p.reduce((v,k)=>v?.[k],this.document);},peek(...p){return this.get(...p);},
  set(path,value){let at=this.document;for(const k of path.slice(0,-1)){if(['__proto__','constructor','prototype'].includes(k))reject('E-PRIMITIVE-PATH','非法写入路径');at=at[k]??={};}at[path.at(-1)]=clone(value);this.patches.push({op:'set',path,value:clone(value)});},
  remove(path){let at=this.document;for(const k of path.slice(0,-1))at=at?.[k];if(at)delete at[path.at(-1)];this.patches.push({op:'delete',path});}};
}
const receiptBase=(effects,frame)=>({eventId:frame.eventId,actor:frame.actor,source:frame.source,routed:null,candidates:[],applied:[],trimmed:[],check:null,consequences:[],narrate:{must:[],mustNot:[]},alternatives:[],fallback:null,status:'ready',signature:effects.map(e=>e.op)});
function execute(document,effects,frame,commit){
 const policy=frames.get(frame);if(!policy)reject('E-PRIMITIVE-FRAME','原语只能由服务端行动框架调用');
 if(!Array.isArray(effects)||!effects.length||effects.length>64)reject('E-PRIMITIVE-LIST','原语列表须有 1 至 64 项');
 const original=clone(effects);original.forEach((effect,index)=>{try{validatePrimitive(effect);}catch(error){error.index=index;throw error;}});
 const fingerprint=canonical({actor:frame.actor,source:frame.source,effects:original}),key=`primitive:${frame.eventId}`;
 const old=document.state?.records?.[key];
 if(old){if(old.category!=='primitive_receipt'||old.fingerprint!==fingerprint)reject('E-PRIMITIVE-DUPLICATE','事件编号已用于不同提案');return {patches:[],events:[],receipt:{...clone(old.receipt),duplicate:true}};}
 const d=draft(document),receipt=receiptBase(original,frame),children=[];
 for(let index=0;index<original.length;index++){
  const effect=original[index];try{
   const capability=policy.canAct(d.document,frame.actor,effect.op,effect);
   if(!capability?.allowed)reject('E-CAPACITY',capability?.reason??'当前不能进行这类行动');
   const tags=[...capability.tags??[]];let actedAs=null,result;
   const requireAuthority=(op,target,options)=>{const a=policy.authority(d.document,frame.actor,op,target,options);if(!a?.allowed)reject('E-AUTHORITY',a?.reason??'没有动用权限');tags.push(...a.tags??[]);actedAs=a.actedAs;return a;};
   if(effect.op==='transfer'){
    const a=parseAccount(effect.from),b=parseAccount(effect.to),qty=effect.qty;
    if(isSource(a.owner)||isSink(a.owner)||isSource(b.owner)||a.resource!==b.resource||effect.resource&&effect.resource!==a.resource)reject('E-TRANSFER-ENDPOINT','提案不能动用资源源或跨资源账户');
    if(!Number.isSafeInteger(qty)||qty<=0)reject('E-TRANSFER-QTY','转移数量须为正整数');
    if(!d.get('ledger','accounts')||!Object.hasOwn(d.get('ledger','accounts'),effect.from)||!isSink(b.owner)&&!Object.hasOwn(d.get('ledger','accounts'),effect.to))reject('E-TRANSFER-ACCOUNT','两端账户必须已经存在');
    if(d.get('ledger','version')!==1)reject('E-TRANSFER-BOOKS','账本尚未开立');
    if(/^(escrow:|collected:)/.test(a.purpose))reject('E-TRANSFER-PURPOSE','托管资金不能由普通转移提案动用');
    requireAuthority('transfer',effect.from);
    if(isSink(b.owner)&&(a.owner!==frame.actor||b.owner!=='sink:consume'))reject('E-TRANSFER-SINK','本接点只允许消耗自己账户中的资源');
    if(!isSink(b.owner)){
     const from=policy.location(d.document,a.owner),to=policy.location(d.document,b.owner);
     if(!from||!to||from!==to)reject('E-TRANSFER-REACH','两端不在同一节点，需要显式运送或汇兑载体');
    }
    // New primitives cannot use the migration ledger's drift repair branch.
    if(balance(d,effect.from)<qty)reject('E-TRANSFER-BALANCE','账户余额不足');
    result=transfer(d,{from:effect.from,to:effect.to,amount:qty,writer:'primitives',eventId:frame.eventId,pick:effect.lot??null});
    policy.mirrorTransfer(d,{...effect,actor:frame.actor,eventId:frame.eventId});
   }else if(effect.op==='fact.set'){
    const row=d.get('holdings','entities',effect.entity);if(!row)reject('E-FACT-ENTITY','实体不存在');
    requireAuthority('fact.set',effect.entity);
    if(Object.hasOwn(effect,'value')===Object.hasOwn(effect,'delta'))reject('E-FACT-VALUE','事实写入须指定 value 或 delta 之一');
    const value=Object.hasOwn(effect,'delta')?(row.facts?.[effect.field]??0)+effect.delta:effect.value;
    writableFact(policy.factPolicy,row.kind,effect.field,value);
    result=updateEntity(d,{id:effect.entity,facts:{[effect.field]:value},writer:'primitives',eventId:frame.eventId});
   }else if(effect.op==='emit'){
    if(!policy.verbs.has(effect.verb)||!['public','private','witnessed'].includes(effect.visibility))reject('E-EMIT-VERB','事件动词或可见性未登记');
    if(effect.actor!==undefined&&effect.actor!==frame.actor)reject('E-EMIT-ACTOR','不能冒充其他行动者');
    // tell/request are observational events. impress must use bounded standing
    // rules; it is intentionally not an executable numeric effect in this slice.
    if(!['tell','request','claim'].includes(effect.verb))reject('E-PRIMITIVE-CONNECTOR','该事件动词尚缺幅度与消费者接点');
    result={verb:effect.verb,target:effect.target??null,payload:clone(effect.payload??{}),visibility:effect.visibility};
   }else reject('E-PRIMITIVE-CONNECTOR',`原语 ${effect.op} 尚缺执行接点`);
   const applied={index,...effect,result,tags:[...new Set(tags)],...(actedAs?{actedAs}:{})};receipt.applied.push(applied);
   children.push({id:`${frame.eventId}:${index}`,parent:frame.eventId,actor:frame.actor,source:frame.source,...applied});
  }catch(error){if(error instanceof PrimitiveRejected){error.index=index;throw error;}throw new PrimitiveRejected(error.code??'E-PRIMITIVE-EXECUTION',error.message,index);}
 }
 receipt.status=commit?'committed':'preview';receipt.narrate.must=receipt.applied.map(e=>({op:e.op,index:e.index}));
 if(!commit)return {receipt};
 d.set(['state','records',key],{category:'primitive_receipt',fingerprint,receipt});
 return {patches:d.patches,receipt,events:[{id:frame.eventId,type:'primitives',actor:frame.actor,source:frame.source,effects:original,receipt},...children]};
}
export function planPrimitives(document,effects,frame){return execute(document,effects,frame,false);}
export function commitPrimitives(document,effects,frame){return execute(document,effects,frame,true);}
