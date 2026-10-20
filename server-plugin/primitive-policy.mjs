// Native policy helpers; never accept writer/source/actedAs from proposal data.
import {schemaValidator} from './primitive-schema.mjs';
export const PRIMITIVE_IDS=Object.freeze(['transfer','holding.open','holding.close','holding.transfer','holding.rescale','obligation.create','obligation.settle','obligation.cancel','fact.set','vital','status','move','create','destroy','emit','schedule','transition','learn','time']);
export class PrimitiveRejected extends Error {constructor(code,message,index=null){super(message);this.code=code;this.index=index;}}
export const reject=(code,message)=>{throw new PrimitiveRejected(code,message);};
export function validatePrimitive(effect){
 if(!effect||typeof effect!=='object'||!PRIMITIVE_IDS.includes(effect.op))reject('E-PRIMITIVE','未知效果原语');
 for(const key of ['writer','actedAs','source','checkResult','authorization','rule','index','parent','eventId','tags','result'])if(Object.hasOwn(effect,key)&&!(key==='tags'&&effect.op==='create'&&effect.kind==='mark'))reject('E-PRIMITIVE-SOURCE',`原语不能自报 ${key}`);
 const forbidden=['__proto__','constructor','prototype'];
 for(const field of ['entity','target','holder','newHolder','subject','debtor','creditor','holding'])if(forbidden.includes(effect[field]))reject('E-PRIMITIVE-FIELD','Reserved property is not an entity identifier');
 if(effect.shares&&Object.keys(effect.shares).some(id=>forbidden.includes(id)))reject('E-PRIMITIVE-FIELD','Reserved property is not a shareholder');
 const valid=schemaValidator('primitive');
 if(!valid(effect))reject('E-PRIMITIVE-SCHEMA',`Invalid primitive shape: ${valid.errors[0].instancePath} ${valid.errors[0].message}`);
 return effect;
}
const blocked=new Set(['__proto__','constructor','prototype','coin','coins','money','treasury','inventory','stock','accounts','balance','holdings','obligations','identity','id','inName','birth','age','skills','xp','minute','belief','capacity','status','hp','location']);
export function writableFact(policy,kind,field,value){
 if(typeof field!=='string'||blocked.has(field)||field.includes('.')||field.includes('|'))reject('E-FACT-FIELD','该字段不允许由事实原语改写');
 const rule=policy?.[kind]?.[field];if(!rule)reject('E-FACT-FIELD','该事实不在实体可写白名单');
 if(!['number','string','boolean'].includes(rule.type)||typeof value!==rule.type||typeof value==='number'&&(!Number.isSafeInteger(rule.min)||!Number.isSafeInteger(rule.max)||rule.min>rule.max||!Number.isSafeInteger(value)||value<rule.min||value>rule.max)||typeof value==='string'&&value.length>(rule.maxLength??1200))reject('E-FACT-RANGE','事实值不符合类型或范围');
 return value;
}
export function appendActionPatches(definition,patches){
 const result=structuredClone(definition),compare=(a,b)=>a.source<b.source?-1:a.source>b.source?1:0;
 const append=(list,row)=>{
  const old=list.find(x=>x?.source===row.source);
  if(old){if(JSON.stringify(old)!==JSON.stringify(row))reject('E-PATCH','同一补丁编号不能声明不同条件');return list;}
  const next=[...list,row],plain=next.filter(x=>!x?.source),sourced=next.filter(x=>x?.source).sort(compare);return [...plain,...sourced];
 };
 const sorted=[...patches].sort((a,b)=>compare({source:String(a.id)},{source:String(b.id)}));
 for(const p of sorted){
  if(p.op!=='append'||!['preconditions','consent.scope'].includes(p.field)||!p.id||!p.reason||definition.reserved===true||Array.isArray(definition.reserved)&&definition.reserved.includes(p.field)||Object.hasOwn(definition.patchable??{},p.field)&&definition.patchable[p.field]!=='append')reject('E-PATCH','动作补丁只能追加允许的前置或同意范围，并说明原因');
  const row={value:structuredClone(p.value),source:p.id,reason:p.reason};
  if(p.field==='preconditions')result.preconditions=append(result.preconditions??[],row);else{result.consent??={};let scope=result.consent.scope??[];if(!Array.isArray(scope))scope=[scope];result.consent.scope=append(scope,row);}
 }return result;
}
