import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {hashContent,parseModelJSON} from './content-pipeline.mjs';
import {applyDepthDraft,getPath,buildDraftRequest,buildReviewRequest,extractDraft} from './npc-depth-content.mjs';

const safeId=id=>/^[a-z][a-z0-9_-]+$/i.test(id??'');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const registryName='first-source-evidence.json';
async function optional(file){try{return await read(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function evidenceFile(worldRoot,file){
 const root=await fs.realpath(worldRoot),target=await fs.realpath(file),relative=path.relative(root,target);
 assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&/\.json$/i.test(target)&&!/secrets\.json$/i.test(target),'来源附件须在world且为非私人JSON');return target;
}
export function validateSourceEvidence(data,entry,world){
 assert.deepEqual(Object.keys(data??{}).sort(),['reviewBoundary','sourceRecords'],'来源附件只接受 sourceRecords/reviewBoundary');
 if(typeof data.reviewBoundary!=='string'||!data.reviewBoundary.trim()||!Array.isArray(data.sourceRecords)||!data.sourceRecords.length)throw Error('来源记录或审核边界无效');
 const ids=new Set(),all=Object.values(world).filter(Array.isArray).flat();
 for(const row of data.sourceRecords){
  if(!row||typeof row!=='object'||Array.isArray(row)||!safeId(row.id)||typeof row.name!=='string'||!row.name.trim()||ids.has(row.id))throw Error('来源记录结构或 id 无效');
  ids.add(row.id);const original=all.find(r=>r?.id===row.id);if(!original)throw Error('来源不属于冻结 world '+row.id);
  for(const key of Object.keys(row)){assert.ok(Object.hasOwn(original,key),'来源没有该字段 '+row.id+'.'+key);assert.deepEqual(row[key],original[key],'来源字段与冻结 world 不符 '+row.id+'.'+key);}
 }
 if(!ids.has(entry.id))throw Error('来源缺少待复审本人');
}
export async function loadEvidence(file,entry,world){
 if(!file)return null;
 const raw=await fs.readFile(file,'utf8'),data=JSON.parse(raw);validateSourceEvidence(data,entry,world);
 return{file,raw,rawHash:hashContent(raw),contentHash:hashContent(data),data};
}
export function compactReviewRequest(request){
 const copy=structuredClone(request),payload=JSON.parse(copy.messages[1].content),entry=payload.skeleton;
 if(entry.contract!=='audit-patch-v1')throw Error('精简请求仅支持审计叶子合同');
 assert.deepEqual(payload.draft,{id:entry.id,contract:entry.contract,patches:entry.patches},'draft 不能重建冻结 patches');
 assert.deepEqual(entry.facts,applyDepthDraft(entry.before,{id:entry.id,contract:entry.contract,patches:entry.patches}),'facts 不能由冻结 before 和 patches 重建');
 assert.deepEqual(payload.publishedFacts.revisions,entry.patches.map(p=>({path:p.path,before:getPath(entry.before,p.path)??null,after:p.value,issues:entry.issues})),'revisions 包含不可去重的来源字段');
 delete entry.facts;delete payload.publishedFacts.revisions;copy.messages[1].content=JSON.stringify(payload);return copy;
}
const binding=(entry,context,revision,foundation)=>({id:entry.id,entryHash:hashContent(entry),contextHash:hashContent(context),revisionHash:hashContent(revision),foundationHash:hashContent(foundation),fingerprint:hashContent({entry,context,revision})});
function checkFrozen(evidence){
 assert.equal(hashContent(evidence.raw),evidence.rawHash,'原附件字节凭证已篡改');assert.deepEqual(JSON.parse(evidence.raw),evidence.data,'原附件正文已篡改');assert.equal(hashContent(evidence.data),evidence.contentHash,'原附件hash已篡改');
}
async function currentEvidence(frozen,entry,world,worldRoot){
 checkFrozen(frozen);const live=await loadEvidence(await evidenceFile(worldRoot,path.resolve(worldRoot,frozen.file)),entry,world);
 // Saved outgoing bytes verify the original raw hash; checkout newlines never
 // excuse a changed JSON value or alter the replayed outgoing request.
 assert.deepEqual(live.data,frozen.data,'冻结附件数据已改变');return frozen;
}
export async function prepareFirstSourceEvidence({sourceEvidenceMap,compactRequest,root,worldRoot=path.resolve('world')},{entries,world,foundation,config},contextFor){
 const file=path.join(root,registryName),prior=await optional(file);
 if(!sourceEvidenceMap){if(prior)throw Error('首次来源索引已登记，不得删除附件选项');return null;}
 const mapFile=await evidenceFile(worldRoot,sourceEvidenceMap),raw=await fs.readFile(mapFile,'utf8'),map=JSON.parse(raw);
 assert.ok(map&&typeof map==='object'&&!Array.isArray(map)&&Object.keys(map).length,'来源索引须显式映射逐ID附件');
 const sources=[];
 for(const [id,relative] of Object.entries(map)){
  const entry=entries.find(e=>e.id===id);assert.ok(entry&&safeId(id),'来源索引不属于冻结候选 '+id);assert.ok(typeof relative==='string'&&relative.trim()&&!path.isAbsolute(relative),'来源索引路径须相对索引文件');
  const evidence=await loadEvidence(await evidenceFile(worldRoot,path.resolve(path.dirname(mapFile),relative)),entry,world);
  const source={...binding(entry,contextFor(entry),config.revision,foundation),evidence:{...evidence,file:path.relative(worldRoot,evidence.file).replaceAll('\\','/')}};
  if(prior){const old=prior.sources.find(s=>s.id===id);assert.ok(old,'首次来源索引不得增加成员');checkFrozen(old.evidence);assert.deepEqual(source.evidence.data,old.evidence.data,'冻结附件数据已改变');source.evidence.raw=old.evidence.raw;source.evidence.rawHash=old.evidence.rawHash;}
  const record=await optional(path.join(root,id+'.json'));
  if(record&&!record.firstSourceEvidence)throw Error('已有记录缺首次附件证据，须走原受控路径 '+id);
  if(record){assert.equal(record.fingerprint,source.fingerprint,'附件候选绑定已改变');assert.equal(record.firstSourceEvidence.registrationHash,hashContent(prior),'首次附件登记已改变');}
  sources.push(source);
 }
 const registration={kind:'first-depth-source-evidence-v1',mapFile:path.relative(worldRoot,mapFile).replaceAll('\\','/'),map,compactRequest:!!compactRequest,sources};
 if(prior){
  checkFrozen({raw:prior.mapRaw,rawHash:prior.mapRawHash,data:prior.map,contentHash:hashContent(prior.map)});
  assert.deepEqual({...prior,mapRaw:undefined,mapRawHash:undefined},{...registration,mapRaw:undefined,mapRawHash:undefined},'首次来源索引/收据已冻结，不得替换');
 }else{
  registration.mapRaw=raw;registration.mapRawHash=hashContent(raw);
  await fs.writeFile(file,JSON.stringify(registration,null,2)+'\n',{flag:'wx'});
 }
 const frozen=prior??registration,registrationHash=hashContent(frozen);
 return{async transform({entry,context,phase,body,feedback,draft,record}){
  const request=phase==='review'&&frozen.compactRequest?compactReviewRequest(body):structuredClone(body);
  const source=frozen.sources.find(s=>s.id===entry.id);if(!source)return{body:request};
  assert.deepEqual(binding(entry,context,config.revision,foundation),Object.fromEntries(Object.keys(binding(entry,context,config.revision,foundation)).map(k=>[k,source[k]])),'附件候选绑定已改变');
  await currentEvidence(source.evidence,entry,world,worldRoot);
  request.messages.push({role:'user',content:JSON.stringify(source.evidence.data)});
  record.firstSourceEvidence??={registrationHash,requests:[]};assert.equal(record.firstSourceEvidence.registrationHash,registrationHash,'首次附件登记已改变');
  const receipt={...binding(entry,context,config.revision,foundation),phase,request,requestHash:hashContent(request),...(phase==='draft'?{feedback:structuredClone(feedback)}:{draft:structuredClone(draft)}),status:'started'};
  record.firstSourceEvidence.requests.push(receipt);return{body:request,receipt};
 }};
}
export async function replayFirstSourceEvidence({root,worldRoot,entries,world,foundation,revision,contextFor}){
 const registry=await optional(path.join(root,registryName)),records=await Promise.all(entries.map(e=>read(path.join(root,e.id+'.json'))));
 if(!registry){assert.ok(records.every(r=>!r.firstSourceEvidence),'首次来源登记丢失');return;}
 assert.equal(registry.kind,'first-depth-source-evidence-v1');
 checkFrozen({raw:registry.mapRaw,rawHash:registry.mapRawHash,data:registry.map,contentHash:hashContent(registry.map)});
 const liveMap=await read(await evidenceFile(worldRoot,path.resolve(worldRoot,registry.mapFile)));assert.deepEqual(liveMap,registry.map,'首次来源索引已改变');
 assert.deepEqual(registry.sources.map(s=>s.id),Object.keys(registry.map),'来源索引与登记成员不同');
 for(const entry of entries){
  const record=records.find(r=>r.id===entry.id),source=registry.sources.find(s=>s.id===entry.id);if(!source){assert.ok(!record.firstSourceEvidence,'未登记的首次附件');continue;}
  const context=contextFor(entry),expected=binding(entry,context,revision,foundation);
  for(const key of Object.keys(expected))assert.deepEqual(source[key],expected[key],'附件原字段绑定已改变');
  const mapped=await evidenceFile(worldRoot,path.resolve(path.dirname(path.resolve(worldRoot,registry.mapFile)),registry.map[entry.id]));assert.equal(mapped,await evidenceFile(worldRoot,path.resolve(worldRoot,source.evidence.file)),'附件ID路径已改变');
  await currentEvidence(source.evidence,entry,world,worldRoot);
  const proof=record.firstSourceEvidence;assert.equal(proof?.registrationHash,hashContent(registry),'缺首次附件收据或hash已改变');assert.ok(Array.isArray(proof.requests)&&proof.requests.length,'缺实际请求凭证');
  for(const receipt of proof.requests){
   for(const key of Object.keys(expected))assert.deepEqual(receipt[key],expected[key],'请求原字段绑定已改变');
   assert.ok(['draft','review'].includes(receipt.phase),'无效请求阶段');
   let replay=receipt.phase==='draft'?buildDraftRequest(entry,receipt.feedback,context):buildReviewRequest(entry,receipt.draft,context);
   if(receipt.phase==='review'&&registry.compactRequest)replay=compactReviewRequest(replay);
   replay.messages.push({role:'user',content:JSON.stringify(source.evidence.data)});
   assert.deepEqual(receipt.request,replay,'首次附件实际请求无法重放');assert.equal(receipt.requestHash,hashContent(replay),'实际请求hash已改变');
  }
  const draft=proof.requests.findLast(r=>r.phase==='draft'),review=proof.requests.findLast(r=>r.phase==='review');
  assert.equal(draft?.status,'completed','缺实际首次draft');assert.equal(review?.status,'completed','缺实际首次L2');
  assert.equal(draft.responseHash,hashContent(record.draftResponse),'draft响应凭证已改变');assert.deepEqual(extractDraft(record.draftResponse,entry),record.draft,'draft与实际响应不符');
  assert.deepEqual(review.draft,record.draft,'L2绑定候选不符');assert.equal(review.responseHash,hashContent(proof.reviewResponse),'L2响应凭证已改变');assert.deepEqual(parseModelJSON(proof.reviewResponse),record.review,'L2与实际响应不符');
 }
}
