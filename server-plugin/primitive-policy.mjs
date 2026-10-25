// Native policy helpers; never accept writer/source/actedAs from proposal data.
import {schemaValidator} from './primitive-schema.mjs';
export const PRIMITIVE_IDS=Object.freeze(['transfer','holding.open','holding.close','holding.transfer','holding.rescale','obligation.create','obligation.settle','obligation.cancel','fact.set','vital','status','move','create','destroy','emit','schedule','transition','learn','time']);
export class PrimitiveRejected extends Error {constructor(code,message,index=null,details={}){super(message);this.name='PrimitiveRejected';this.code=code;this.index=index;Object.assign(this,refusalProjection({code,reason:message,...details}));}}
export const reject=(code,message)=>{throw new PrimitiveRejected(code,message);};
export function validatePrimitive(effect){
 if(!effect||typeof effect!=='object'||!PRIMITIVE_IDS.includes(effect.op))reject('E-PRIMITIVE','未知效果原语');
 for(const key of ['writer','actedAs','source','checkResult','authorization','rule','index','parent','eventId','tags','result'])if(Object.hasOwn(effect,key)&&!(key==='tags'&&Array.isArray(effect.tags)&&(effect.tags.length===0||effect.op==='create'&&effect.kind==='mark'))&&!(key==='rule'&&effect.op==='schedule'))reject('E-PRIMITIVE-SOURCE',`原语不能自报 ${key}`);
 const forbidden=['__proto__','constructor','prototype'];
 for(const field of ['entity','target','holder','newHolder','subject','debtor','creditor','holding'])if(forbidden.includes(effect[field]))reject('E-PRIMITIVE-FIELD','Reserved property is not an entity identifier');
 if(effect.shares&&Object.keys(effect.shares).some(id=>forbidden.includes(id)))reject('E-PRIMITIVE-FIELD','Reserved property is not a shareholder');
 const valid=schemaValidator('primitive');
 if(!valid(effect))reject('E-PRIMITIVE-SCHEMA',`Invalid primitive shape: ${valid.errors[0].instancePath} ${valid.errors[0].message}`);
 return effect;
}
const blocked=new Set(['__proto__','constructor','prototype','coin','coins','money','treasury','inventory','stock','accounts','balance','holdings','obligations','identity','id','inName','birth','age','skills','xp','minute','belief','capacity','status','hp','location','history']);
export function writableFactField(field){
 if(typeof field!=='string'||blocked.has(field)||field.includes('.')||field.includes('|'))reject('E-FACT-FIELD','该字段不允许由事实原语改写');
}
export function writableFact(policy,kind,field,value){
 writableFactField(field);
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

// Shared world-facing shape, also usable by query projections. This function
// never discovers entities or infers permission from a proposed repair.
export function refusalProjection(details={}){
 const reason=details.reason??details.message??'当前条件不足，原方案尚未执行';
 const missing=details.missing?.length?[...details.missing]:[reason];
 const repair=details.repair?.length?[...details.repair]:[
  /CONSENT|AUTHORITY/.test(details.code??'')?'先向有权决定的人提出请求；取得有效同意或授权后，再预览原方案':
  /BALANCE|STOCK|MATERIAL/.test(details.code??'')?'减少本次用量或分批安排；补齐自己的钱物后，再预览原方案':
  /REACH|RANGE|MOVE/.test(details.code??'')?'先选择自己已知且能够抵达的位置靠近；到达后再预览原方案':
  /CAPACITY/.test(details.code??'')?'先恢复行动能力，或向在场且有能力的人提出协助请求；未获同意前不会代为执行':
  `保留原意，补充或调整「${missing.join('、')}」后重新预览；当前没有完成原方案`
 ];
 const alternatives=[...(details.alternatives??[])];
 if(!alternatives.length)alternatives.push({kind:'edit',label:'调整原方案后重新预览',available:false,missing:[...missing]});
 return {reason,missing,repair,alternatives,fallback:details.fallback??null};
}
