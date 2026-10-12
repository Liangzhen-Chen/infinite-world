import fs from 'node:fs/promises';
import path from 'node:path';
import {DeepSeekClient} from '../../../tools/deepseek-client.mjs';
import {loadWorld} from '../../../tools/load-world.mjs';
import {digest} from '../../../server-plugin/storage.mjs';
const out=import.meta.dirname,preflight=JSON.parse(await fs.readFile(path.join(out,'preflight.json'),'utf8')),world=await loadWorld();
const approved=new Set(preflight.approvedIds),known=new Set(world.npcs.map(n=>n.id));
if(digest(world)!==preflight.worldHash)throw Error('T17正式源hash已变化');
let frozen=false,writes=Promise.resolve();
const write=row=>{writes=writes.then(()=>fs.appendFile(path.join(out,'runtime-contexts.jsonl'),JSON.stringify(row)+'\n'));return writes;};
function dependencyIds(text){return [...new Set(text.match(/npc_(?:hw|yp|wt|lq|sb)_[a-z0-9_]+/g)??[])].filter(id=>known.has(id));}
export function actualDependencyIds(value,metadata=[]){
 if(typeof value==='string'){let parsed;try{parsed=JSON.parse(value)}catch{};if(parsed&&typeof parsed==='object')return actualDependencyIds(parsed,metadata);return [...new Set([...dependencyIds(value),...world.npcs.filter(n=>n.name.length>=2&&value.includes(n.name)).map(n=>n.id)])];}
 if(Array.isArray(value))return [...new Set(value.flatMap(v=>actualDependencyIds(v,metadata)))];
 if(value&&typeof value==='object'){if(value.kind==='npc'&&known.has(value.id)&&typeof value.name==='string'&&Array.isArray(value.aliases)&&Object.keys(value).every(k=>['id','name','aliases','kind'].includes(k))){metadata.push(value);return [];}return [...new Set(Object.values(value).flatMap(v=>actualDependencyIds(v,metadata)))];}return [];
}
function closure(ids){const result=new Set(ids);for(const id of result){const n=world.npcs.find(n=>n.id===id);for(const ref of dependencyIds(JSON.stringify(n)))result.add(ref);for(const memory of n.memorySeeds??[])for(const ref of memory.knownBy??[])if(known.has(ref))result.add(ref);}return [...result].sort();}
const original=DeepSeekClient.prototype.generate;
DeepSeekClient.prototype.generate=async function(body,label){
 if(frozen)throw Error('T17动态未批准依赖已冻结真实请求');
 const planning=label.startsWith('npc-autonomy:'),host=Boolean(body.tools)&&!planning;
 const metadata=[],sourceText=JSON.stringify(body.messages??[]),allRefs=dependencyIds(sourceText),refs=actualDependencyIds(body.messages??[],metadata),actual=closure(refs),unapproved=actual.filter(id=>!approved.has(id));
 const row={at:new Date().toISOString(),label,role:planning?'planning':host?'host':'review-or-consistency',requestHash:digest(body),allReferencedIds:allRefs,nameMetadata:metadata,referencedIds:refs,profileAndEventClosure:actual,unapproved,request:body};
 await write(row);
 if(unapproved.length){frozen=true;throw Error('T17请求含未批准实际依赖：'+unapproved.join(','));}
 const response=await original.call(this,body,label);
 const calls=response.choices?.[0]?.message?.tool_calls??[];
 const responseIds=dependencyIds(JSON.stringify(calls)),responseClosure=closure(responseIds),responseUnapproved=responseClosure.filter(id=>!approved.has(id));
 await write({at:new Date().toISOString(),label,responseHash:digest(response),responseId:response.id,measurement:response.measurement,proposedToolIds:responseIds,profileAndEventClosure:responseClosure,unapproved:responseUnapproved});
 if(responseUnapproved.length){frozen=true;throw Error('T17工具指向未批准实际依赖：'+responseUnapproved.join(','));}
 return response;
};
