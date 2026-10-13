import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DeepSeekClient} from '../../../tools/deepseek-client.mjs';
import {loadWorld} from '../../../tools/load-world.mjs';
import {digest} from '../../../server-plugin/storage.mjs';
import {hashContent} from '../../../tools/content-pipeline.mjs';
import {approvedProfiles} from '../../../tools/w1-village-profiles-content.mjs';
import {prepareNpcDepthBatch} from '../../../tools/publish-npc-depth.mjs';
import {assembleMessages} from '../../../extension/prompt.mjs';
import {publicSettlementEntries} from '../../../server-plugin/settlement-profile.mjs';
import {MemoryIndex,EntityResolver} from '../../../server-plugin/retrieval.mjs';
import {WorldEngine} from '../../../server-plugin/engine.mjs';
import {loadPromptBundle} from '../../../tools/build-card.mjs';
import {loadHostPromptProcessor} from '../../../tools/host-prompt.mjs';
const out=import.meta.dirname,root=path.resolve(out,'../../..'),preflight=JSON.parse(await fs.readFile(path.join(out,'preflight.json'),'utf8')),world=await loadWorld();
const approved=new Set(preflight.approvedIds),known=new Set(world.npcs.map(n=>n.id)),engine=new WorldEngine(world),resolver=new EntityResolver(engine.entities);
assert.equal(digest(world),preflight.worldHash,'T17正式源hash已变化');
for(const row of preflight.sources??[])assert.equal(digest(await fs.readFile(path.join(root,row.file),'utf8')),row.sha256,`T17冻结输入已变化：${row.file}`);
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
// Re-run the official publisher against current entries, never its old full-world hash.
const {yupoEvidence}=await import('./yupo-evidence.mjs');assert.deepEqual(await yupoEvidence(world),preflight.yupoPublished);
for(const row of preflight.yupoPublished.profiles)assert.ok(approved.has(row.id));
for(const batch of ['dock','market']){const {approved:readApproved}=await import('../../../world/design/w1-baishi-'+batch+'-depth.mjs');const {bundle:depth}=await readApproved(world);for(const npc of depth.people){const row=preflight.baishiDepth.find(r=>r.id===npc.id);assert.equal(row.hash,hashContent(npc));assert.equal(row.hash,hashContent(world.npcs.find(p=>p.id===npc.id)));assert.ok(approved.has(npc.id));}}
const approvedEntries=await approvedProfiles({world,root:path.join(root,'world/drafts/w1/village-ledgers')});
const specs=[['loc_bs_yupo','problem_yp_1'],['loc_bs_yupo','tax'],['loc_bs_weiting','tax'],['loc_bs_liquan','tax'],['loc_bs_liquan','problem_lq_3'],['loc_bs_sangban','problem_sb_2'],['loc_bs_sangban','problem_sb_4']];
const index=new MemoryIndex({entities:engine.entities});index.syncSettlements(world);
export const publicProjections=[];
for(const [id,field] of specs){
 const leaf=d=>field==='tax'?d.economy.tax:d.problems.find(p=>p.id===field);
 const current=leaf(world.settlementProfiles.find(p=>p.id===id).details),entry=approvedEntries.find(p=>p.id===id);
 assert.equal(hashContent(leaf(entry)),hashContent(current));const approvalFiles=[];
 for(const folder of field==='tax'?['village-ledgers']:['village-profiles','village-ledgers']){
  const file=`world/drafts/w1/${folder}/${id}.json`,record=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
  assert.equal(record.status,'passed');assert.deepEqual(record.review.contradictions,[]);assert.equal(hashContent(leaf(record.draft)),hashContent(current));
  approvalFiles.push({file,hash:hashContent(record),leafHash:hashContent(current),status:record.status});
 }
 const row=publicSettlementEntries(world).find(r=>r.id===`settlement_${id}_${field==='tax'?'tax':'issue_'+field}`),indexed=index.documents.get(row.id);
 assert.equal(indexed.minute,0);assert.equal(indexed.source,'公开聚落资料');assert.equal(indexed.text,row.text);
 const evidence={rowId:row.id,approvalFiles,currentSource:`world/geo/settlements.json#${id}.details.${field==='tax'?'economy.tax':'problems['+field+']'}`,leafHash:hashContent(current),rowHash:hashContent(row),textHash:hashContent(row.text),minute:indexed.minute,visibility:'publicSettlementEntries -> MemoryIndex.syncSettlements; no NPC cognition/presence authorization'};
 publicProjections.push({row,line:`${indexed.source}，${engine.calendar(indexed.minute).text}：${row.text.slice(0,260)}`,evidence});
}
if(preflight.publicProjections)assert.deepEqual(publicProjections,preflight.publicProjections,'公开entry/current/rendering证据改变');
const {row:publicRow,line:publicLine,evidence:projectionEvidence}=publicProjections[0];
// Authority comes from the existing engine's scene renderer inside the HTTP service.
// Request content cannot register itself. Both review and converted host containers
// must match a scene actually rendered from the frozen world and a real document.
export const sceneAuthorities=new Map();
for(const row of preflight.sceneAuthorities??[])sceneAuthorities.set(row.sceneHash,row);
const renderScene=WorldEngine.prototype.scene;
WorldEngine.prototype.scene=function(document,query,index){
 const scene=renderScene.call(this,document,query,index);
 if(document.worldHash===digest(world)){
  const row={scene,sceneHash:digest(scene),documentHash:digest(document),worldHash:document.worldHash,query:String(query??''),queryHash:digest(String(query??'')),minute:document.state.minute,location:document.state.location,source:'WorldEngine.scene invoked by normal HTTP service'};
  sceneAuthorities.set(row.sceneHash,row);
 }
 return scene;
};
const dependencyIds=text=>[...new Set(text.match(/npc_(?:hw|yp|wt|lq|sb)_[a-z0-9_]+/g)??[])].filter(id=>known.has(id));
const nameEntities=engine.entities.filter(e=>known.has(e.id));
export function closure(ids){const result=new Set(ids);for(const id of result){const n=world.npcs.find(n=>n.id===id);for(const ref of dependencyIds(JSON.stringify(n)))result.add(ref);for(const memory of n.memorySeeds??[])for(const ref of memory.knownBy??[])if(known.has(ref))result.add(ref);}return [...result].sort();}
export function analyzeRequest(body){
 const references=[],metadata=[],projections=[],actualIds=new Set();
 const lastMessage=(body.messages??[]).length-1;
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
   let authority=mode==='scene'?sceneAuthorities.get(digest(v)):null,sceneStart=0;
   if(mode==='hostScene'&&p===`request.messages[${lastMessage}].content`)for(const row of sceneAuthorities.values()){
    if(v!==row.scene&&!v.endsWith('\n\n'+row.scene))continue;
    const expected=host.process(assembleMessages(bundle,[{role:'user',content:row.query}],row.scene),bundle).at(-1)?.content;
    if(v===expected||v===host.process(assembleMessages(bundle,[],row.scene),bundle).at(-1)?.content){authority=row;sceneStart=v.length-row.scene.length;break;}
   }
   for(const line of lines){if(line==='【相关旧事，检索线索不代表在场人物知情】')sceneSection=true;
    if(authorizedLocation&&offset===authorizedLocation.span[0]&&line===locationProjection.text){textRefs(line,p,offset,'approvedLocationProjection');projections.push({kind:'registeredLocations',path:p,span:[offset,offset+line.length],textHash:locationProjection.textHash,rows:locationRows});}
    else if(authority&&sceneSection&&offset>=sceneStart&&publicProjections.some(row=>row.line===line)){const row=publicProjections.find(row=>row.line===line);textRefs(line,p,offset,'approvedPublicProjection');projections.push({...row.evidence,path:p,span:[offset,offset+line.length],contentHash:digest(v),sceneHash:authority.sceneHash,documentHash:authority.documentHash,authoritySource:authority.source,text:line});}
    else textRefs(line,p,offset);offset+=line.length+1;}
   return;
  }
  if(Array.isArray(v)){v.forEach((x,i)=>walk(x,`${p}[${i}]`,mode));return;}
  if(!v||typeof v!=='object')return;
  if(mode==='registry'&&v.kind==='npc'&&known.has(v.id)&&Object.keys(v).length===4&&Object.keys(v).every(k=>['id','name','aliases','kind'].includes(k))){
   const e=resolver.entities.get(v.id),expected={id:e.id,name:e.name,aliases:e.aliases??[],kind:e.kind??e.id.split('_')[0]};
   if(digest(v)===digest(expected)){metadata.push({path:p,value:v,hash:digest(v)});for(const[k,x]of Object.entries(v))if(typeof x==='string')textRefs(x,p+'.'+k,0,'nameMetadata');else if(Array.isArray(x))x.forEach((s,i)=>textRefs(s,`${p}.${k}[${i}]`,0,'nameMetadata'));return;}
  }
  const projection=publicProjections.find(row=>row.row.id===v.id),receiptRow=projection?.row;
  const allowedRowKeys=[...Object.keys(receiptRow??{}),'minute','salience','score','revision','frequencies','length'];
  if(mode==='receipt'&&receiptRow&&Object.keys(v).every(k=>allowedRowKeys.includes(k))&&Object.keys(receiptRow).every(k=>digest(v[k])===digest(receiptRow[k]))&&(v.minute===undefined||v.minute===indexed.minute)){
   for(const[k,x]of Object.entries(v))if(typeof x==='string')textRefs(x,p+'.'+k,0,'approvedPublicProjection');projections.push({...projection.evidence,path:p,rowHash:hashContent(Object.fromEntries(Object.keys(receiptRow).map(k=>[k,v[k]])))});return;
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
   if(v.role==='user'&&k==='content'&&typeof x==='string')child='hostScene';
   if(v.role==='system'&&k==='content'&&typeof x==='string'&&x.includes('【时间】')&&x.includes('【在场】'))child='scene';
   if(v.role==='system'&&k==='content'&&typeof x==='string'&&locationProjection.renderings.some(row=>row.path===p+'.'+k&&row.contentHash===digest(x)))child='reference';
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
 await write({at:new Date().toISOString(),label,responseHash:digest(response),responseId:response.id,response,measurement:response.measurement,proposedToolIds:proposed.referencedIds,unapproved:proposed.unapproved});
 if(proposed.unapproved.length){frozen=true;const error=Error('T17实际工具目标超出逐项批准人物：'+proposed.unapproved.join(','));error.providerResponse=response;throw error;}return response;
};
export {projectionEvidence,publicRow,publicLine};
