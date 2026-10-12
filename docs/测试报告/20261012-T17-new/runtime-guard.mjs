import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DeepSeekClient} from '../../../tools/deepseek-client.mjs';
import {loadWorld} from '../../../tools/load-world.mjs';
import {digest} from '../../../server-plugin/storage.mjs';
import {hashContent} from '../../../tools/content-pipeline.mjs';
import {approvedProfiles} from '../../../tools/w1-village-profiles-content.mjs';
import {publicSettlementEntries} from '../../../server-plugin/settlement-profile.mjs';
import {MemoryIndex,EntityResolver} from '../../../server-plugin/retrieval.mjs';
import {WorldEngine} from '../../../server-plugin/engine.mjs';
import {loadPromptBundle} from '../../../tools/build-card.mjs';
import {loadHostPromptProcessor} from '../../../tools/host-prompt.mjs';
const out=import.meta.dirname,root=path.resolve(out,'../../..'),preflight=JSON.parse(await fs.readFile(path.join(out,'preflight.json'),'utf8')),world=await loadWorld();
const approved=new Set(preflight.approvedIds),known=new Set(world.npcs.map(n=>n.id)),engine=new WorldEngine(world),resolver=new EntityResolver(engine.entities);
assert.equal(digest(world),preflight.worldHash,'T17正式源hash已变化');
const bundle=await loadPromptBundle({world}),host=await loadHostPromptProcessor(preflight.hostInstallation);
assert.equal(digest(bundle),preflight.promptHash,'T17提示源已变化');
assert.deepEqual(host.identity,preflight.providerProcessing,'T17转换器已变化');
for(const row of preflight.hostSources??[])assert.equal(digest(await fs.readFile(path.join(preflight.hostInstallation,row.file),'utf8')),row.sha256,`T17 host输入已变化：${row.file}`);
export const locationProjection=preflight.locationProjection;
const locationRows=world.locations.filter(row=>row.id!=='loc_hw'&&row.scope!=='loc_hw').map(({id,name})=>({id,name}));
assert.deepEqual(locationRows,locationProjection.rows);
assert.equal(locationProjection.text,`其他已登记地点：${locationRows.map(row=>row.name).join('、')}。详细地理通过目录与检索查阅。`);
assert.equal(digest(locationProjection.text),locationProjection.textHash);
await approvedProfiles({world});
const problemHash='c846a3c5c0d0a7d73a6f4b057ef12f24c59958ac955e71b4a4472249eb84edb6';
const sourceFiles=['world/drafts/w1/village-profiles/loc_bs_yupo.json','world/drafts/w1/village-ledgers/loc_bs_yupo.json'];
const approvalFiles=[];
for(const file of sourceFiles){const record=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));assert.equal(record.status,'passed');assert.deepEqual(record.review.contradictions,[]);assert.equal(hashContent(record.draft.problems.find(p=>p.id==='problem_yp_1')),problemHash);approvalFiles.push({file,hash:hashContent(record),problemHash,status:record.status});}
const current=world.settlementProfiles.find(p=>p.id==='loc_bs_yupo').details.problems.find(p=>p.id==='problem_yp_1');assert.equal(hashContent(current),problemHash);
const publicRow=publicSettlementEntries(world).find(r=>r.id==='settlement_loc_bs_yupo_issue_problem_yp_1');assert.equal(hashContent(publicRow.text),'6669932cd8a5cb676dba5fb3670745fb5e950cde4d4a1e46ca55a10b5a99c557');assert.equal(hashContent(publicRow),'ba847be73e92263c688ffb605538cb241f9d09ce463cde9f71b1577169167e45');
const index=new MemoryIndex({entities:engine.entities});index.syncSettlements(world);const indexed=index.documents.get(publicRow.id);assert.equal(indexed.minute,0);assert.equal(indexed.source,'公开聚落资料');assert.equal(indexed.text,publicRow.text);
const projectionEvidence={rowId:publicRow.id,approvalFiles,currentSource:'world/geo/settlements.json#loc_bs_yupo.details.problems[problem_yp_1]',problemHash,rowHash:hashContent(publicRow),textHash:hashContent(publicRow.text),visibility:'publicSettlementEntries -> MemoryIndex.syncSettlements; does not authorize NPC cognition/profile',minute:indexed.minute,rendering:'server-plugin/settlement-profile.mjs:24,45; retrieval.mjs:83; scene-card.mjs:84'};
const publicLine=`${indexed.source}，${engine.calendar(indexed.minute).text}：${publicRow.text.slice(0,260)}`;
const dependencyIds=text=>[...new Set(text.match(/npc_(?:hw|yp|wt|lq|sb)_[a-z0-9_]+/g)??[])].filter(id=>known.has(id));
const nameEntities=engine.entities.filter(e=>known.has(e.id));
export function closure(ids){const result=new Set(ids);for(const id of result){const n=world.npcs.find(n=>n.id===id);for(const ref of dependencyIds(JSON.stringify(n)))result.add(ref);for(const memory of n.memorySeeds??[])for(const ref of memory.knownBy??[])if(known.has(ref))result.add(ref);}return [...result].sort();}
export function analyzeRequest(body){
 const references=[],metadata=[],projections=[],actualIds=new Set();
 const searchCallIds=new Set((body.messages??[]).flatMap(m=>(m.tool_calls??[]).filter(c=>c.function?.name==='world_search').map(c=>c.id)));
 function textRefs(text,p,offset=0,classification='depthDependency'){
  const found=[];
  for(const n of nameEntities)for(const token of [n.id,n.name,...n.aliases??[]].filter(t=>t&&t.length>=2)){
   for(let start=text.indexOf(token);start>=0;start=text.indexOf(token,start+token.length)){const ref={id:n.id,token,path:p,span:[offset+start,offset+start+token.length],classification};references.push(ref);found.push(n.id);if(classification==='depthDependency')actualIds.add(n.id);}
  }return [...new Set(found)];
 }
 function walk(v,p,mode='plain'){
  if(typeof v==='string'){
   let parsed;try{parsed=JSON.parse(v)}catch{}if(parsed&&typeof parsed==='object'){walk(parsed,p+'[JSON]',mode);return;}
   // Only the deterministic scene rendering may authorize this exact full line.
   const authorizedLocation=mode==='reference'&&locationProjection.renderings.find(row=>row.path===p&&row.contentHash===digest(v)&&v.slice(...row.span)===locationProjection.text);
   const lines=v.split('\n');let offset=0,sceneSection=false;
   for(const line of lines){if(line==='【相关旧事，检索线索不代表在场人物知情】')sceneSection=true;
    if(authorizedLocation&&offset===authorizedLocation.span[0]&&line===locationProjection.text){textRefs(line,p,offset,'approvedLocationProjection');projections.push({kind:'registeredLocations',path:p,span:[offset,offset+line.length],textHash:locationProjection.textHash,rows:locationRows});}
    else if(mode==='scene'&&sceneSection&&line===publicLine){textRefs(line,p,offset,'approvedPublicProjection');projections.push({...projectionEvidence,path:p,span:[offset,offset+line.length],text:line});}
    else textRefs(line,p,offset);offset+=line.length+1;}
   return;
  }
  if(Array.isArray(v)){v.forEach((x,i)=>walk(x,`${p}[${i}]`,mode));return;}
  if(!v||typeof v!=='object')return;
  if(mode==='registry'&&v.kind==='npc'&&known.has(v.id)&&Object.keys(v).length===4&&Object.keys(v).every(k=>['id','name','aliases','kind'].includes(k))){
   const e=resolver.entities.get(v.id),expected={id:e.id,name:e.name,aliases:e.aliases??[],kind:e.kind??e.id.split('_')[0]};
   if(digest(v)===digest(expected)){metadata.push({path:p,value:v,hash:digest(v)});for(const[k,x]of Object.entries(v))if(typeof x==='string')textRefs(x,p+'.'+k,0,'nameMetadata');else if(Array.isArray(x))x.forEach((s,i)=>textRefs(s,`${p}.${k}[${i}]`,0,'nameMetadata'));return;}
  }
  const allowedRowKeys=[...Object.keys(publicRow),'minute','salience','score','revision','frequencies','length'];
  if(mode==='receipt'&&v.id===publicRow.id&&Object.keys(v).every(k=>allowedRowKeys.includes(k))&&Object.keys(publicRow).every(k=>digest(v[k])===digest(publicRow[k]))&&(v.minute===undefined||v.minute===indexed.minute)){
   for(const[k,x]of Object.entries(v))if(typeof x==='string')textRefs(x,p+'.'+k,0,'approvedPublicProjection');projections.push({...projectionEvidence,path:p,rowHash:hashContent(Object.fromEntries(Object.keys(publicRow).map(k=>[k,v[k]])))});return;
  }
  const evidenceRegistry=v.id==='registry'&&v.kind==='registry'&&Object.keys(v).every(k=>['id','kind','text'].includes(k));
  const evidenceScene=v.id==='scene'&&v.kind==='scene'&&Object.keys(v).every(k=>['id','kind','text'].includes(k));
  const evidenceReceipt=/^receipt:\d+$/.test(v.id??'')&&v.kind==='receipt';
  const toolReceipt=v.tool==='world_search'&&Object.hasOwn(v,'result');
  for(const[k,x]of Object.entries(v)){
   let child=mode;
   if(k==='text'&&evidenceRegistry)child='registry';
   if(k==='text'&&evidenceScene)child='scene';
   if(k==='text'&&evidenceReceipt)child='plain';
   if(k==='result'&&toolReceipt)child='receipt';
   if(['sceneBefore','sceneBeforeReply'].includes(k)&&typeof x==='string')child='scene';
   if(v.role==='system'&&k==='content'&&typeof x==='string'&&x.includes('【时间】')&&x.includes('【在场】'))child='scene';
   if(v.role==='system'&&k==='content'&&typeof x==='string'&&locationProjection.renderings.some(row=>row.path===p+'.'+k))child='reference';
   if(v.role==='tool'&&k==='content'&&searchCallIds.has(v.tool_call_id))child='receipt';
   walk(x,p+'.'+k,child);
  }
 }
 walk(body,'request');const actual=closure([...actualIds]),unapproved=actual.filter(id=>!approved.has(id));
 return {allReferencedIds:[...new Set(references.map(r=>r.id))],references,nameMetadata:metadata,approvedPublicProjection:projections,referencedIds:[...actualIds],profileAndEventClosure:actual,unapproved};
}
let frozen=false,writes=Promise.resolve();const write=row=>{writes=writes.then(()=>fs.appendFile(path.join(out,'runtime-contexts.jsonl'),JSON.stringify(row)+'\n'));return writes;};
const original=DeepSeekClient.prototype.generate;
DeepSeekClient.prototype.generate=async function(body,label){
 if(frozen)throw Error('T17恢复遇未批准依赖，停止真实请求');
 const analysis=analyzeRequest(body);await write({at:new Date().toISOString(),label,role:label.startsWith('npc-autonomy:')?'planning':label.startsWith('consistency:')?'consistency':body.tools?'host':'review',requestHash:digest(body),...analysis,request:body});
 if(analysis.unapproved.length){frozen=true;throw Error('T17请求含未批准实际依赖：'+analysis.unapproved.join(','));}
 const response=await original.call(this,body,label),calls=response.choices?.[0]?.message?.tool_calls??[],proposed=analyzeRequest({calls});
 await write({at:new Date().toISOString(),label,responseHash:digest(response),responseId:response.id,measurement:response.measurement,proposedToolIds:proposed.referencedIds,unapproved:proposed.unapproved});
 if(proposed.unapproved.length){frozen=true;throw Error('T17实际工具目标超出批准32人：'+proposed.unapproved.join(','));}return response;
};
export {projectionEvidence,publicRow,publicLine};
