import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {hashContent,readApprovedContent,parseModelJSON} from './content-pipeline.mjs';
import {depthEntries,contextFor,patchDraft,applyDepthDraft,validateDraft,validatePatchResults,checkIncrementalReview,buildReviewRequest} from './npc-depth-content.mjs';
import {loadDepthConfig,depthFoundation,prepareDepthRevision,recordHasHash,loadDepthReopen} from './npc-depth.mjs';
import assert from 'node:assert/strict';
import {replayFirstSourceEvidence,validateSourceEvidence,compactReviewRequest} from './npc-depth-source-evidence.mjs';
import {randomUUID} from 'node:crypto';
import {validateNpcDepth,validateNpcProfiles,legacyTraitsAuditIds} from './npc-profile-validation.mjs';
export const batchContract='npc-depth-batch-v1';
export const publishDepthHelp='publish-npc-depth --manifest <候选目录/manifest.json> [--publish]\n批量：--batch-manifest <world内JSON> [--publish]，清单含contract:npc-depth-batch-v1、worldRoot、sourceHash(hashContent(loadWorld))、expectedIds、manifests(完整卡相对world路径)。\n默认只预演；--publish 校验冻结原档、失败路径、L1/L2/L4和哈希后写 world/people/baseline.json。';
const read=async file=>{assert.ok(!/secrets\.json$/i.test(file),'禁止读取私人密钥');return JSON.parse(await fs.readFile(file,'utf8'));};
export async function prepareNpcDepth({manifest,worldRoot,world:snapshot}={}){
 if(!manifest)throw Error('需要 --manifest');
 const plan=typeof manifest==='string'?await read(manifest):manifest;assert.equal(plan.contract,'audit-patch-v1','不支持的发布合同');
 const anchor=typeof manifest==='string'?path.dirname(path.resolve(manifest)):process.cwd(),target=path.resolve(worldRoot??path.resolve(anchor,plan.worldRoot)),root=path.resolve(target,plan.root),design=path.resolve(target,plan.design);
 for(const file of [root,design]){const relative=path.relative(target,file);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative),'清单路径须位于 world/ 内');}
 let config=await loadDepthConfig({design});if(plan.authoredBackground){const source=path.resolve(target,plan.authoredBackground);assert.ok(!path.relative(target,source).startsWith('..')&&!/secrets\.json$/i.test(source),'作者出处路径非法');const bundle=await read(source);assert.equal(hashContent(bundle),plan.authoredBackgroundHash,'新出处hash过期');config={...config,authoredBackground:bundle};}const world=snapshot??await loadWorld(target),base=await read(path.join(root,'base.json'));
 const reference={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)};let entries=depthEntries(base,config,reference),foundation=depthFoundation(entries,reference,config.revision),incremental=null;
 try{incremental=await read(path.join(root,'incremental-proof.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(incremental){const prepared=await prepareDepthRevision({design,root,worldRoot:target,controlledRevision:path.resolve(root,incremental.planFile),authorizationHash:incremental.authorizationHash,authoredBackground:incremental.backgroundFile?path.resolve(root,incremental.backgroundFile):undefined,sourceCheckoutEvidence:incremental.sourceCheckoutEvidence?path.resolve(root,incremental.sourceCheckoutEvidence.file):undefined,reopenAuthorization:incremental.reopenAuthorization?path.resolve(root,incremental.reopenAuthorization.file):undefined,cardId:(await read(path.resolve(root,incremental.planFile))).cardId});entries=prepared.entries;foundation=prepared.foundation;incremental={...incremental,prepared};}
 for(const entry of entries){const current=world.npcs.find(n=>n.id===entry.id);assert.ok(current,`正式人物缺失 ${entry.id}`);mergeEntry(current,entry,patchDraft(entry));}
 assert.equal(hashContent(foundation),plan.foundationHash,'发布清单骨架指纹已过期');assert.equal(hashContent(await read(path.join(root,'foundation.json'))),hashContent(foundation),'冻结骨架或引用事实已改变');
 if(!incremental)assert.deepEqual(await read(path.join(root,'candidate.json')),entries.map(patchDraft),'冻结候选已篡改');
 const reviewContext=e=>incremental?.prepared.contexts.get(e.id)??contextFor(e,reference);
 const reopenRecords=await Promise.all(entries.map(e=>read(path.join(root,e.id+'.json'))));
 if(reopenRecords.some(r=>r.reopenAuthorization||r.frozenCandidate))await replayStoredDepthEvidence({root,worldRoot:target,entries,world:reference,foundation,revision:config.revision,contextFor:reviewContext,records:reopenRecords});
 else await replayFirstSourceEvidence({root,worldRoot:target,entries,world:reference,foundation,revision:config.revision,contextFor:reviewContext});
 const drafts=await readApprovedContent(root,entries,{contextFor:reviewContext,revision:config.revision});assert.equal(drafts.length,entries.length,'并非所有人物均已审核通过');
 const summary=await read(path.join(root,'summary.json')),covered=[];
 for(const batch of summary.batches){
  const current=await read(path.join(root,`batch-${batch.index}.json`));assert.deepEqual(current.ids,batch.ids,'审核批次成员已改变');
  for(const id of current.ids){covered.push(id);const record=await read(path.join(root,`${id}.json`)),note=current.l4.notes.find(n=>n.id===id);assert.equal(note?.draftHash,hashContent(record.draft),'L4候选指纹已改变');assert.equal(note?.reviewHash,hashContent(record.review),'L4审核指纹已改变');}
 }
 assert.deepEqual(covered.sort(),entries.map(e=>e.id).sort(),'审核覆盖成员与设计不符');
 let extraL4=null;if(incremental||entries.some(e=>e.authoredBackground)){extraL4=await read(path.join(root,'incremental-l4.json'));assert.equal(extraL4.authorizationHash,incremental?.authorizationHash??null,'新L4规划hash不符');assert.equal(extraL4.sourceHash,entries.find(e=>e.authoredBackground)?.authoredBackground.sourceHash??null,'新L4出处hash不符');}
 for(const entry of entries){const context=reviewContext(entry);if(context.authoredBackground||context.controlledRevision){const record=await read(path.join(root,entry.id+'.json'));const issues=checkIncrementalReview(record.review,entry,context);assert.ok(!issues.some(c=>c.severity==='hard'),'出处或候选L2存在硬错');const note=extraL4.candidates.find(n=>n.id===entry.id);assert.equal(note?.draftHash,hashContent(record.draft),'新L4候选hash已过期');assert.equal(note?.reviewHash,hashContent(record.review),'新L4审核hash已过期');assert.equal(note?.entryHash,hashContent(entry),'新L4 entry hash不符');assert.ok(note.note?.trim(),'缺新L4阅读');assert.deepEqual([...(note.reviewedPaths??[])].sort(),entry.patches.map(p=>p.path).sort(),'新L4漏审叶子');if(context.authoredBackground)for(const event of context.authoredBackground.events){const sourceNote=extraL4.backgrounds.find(n=>n.eventId===event.id);assert.equal(sourceNote?.sourceHash,context.authoredBackground.sourceHash,'缺出处L4');assert.equal(sourceNote?.eventHash,hashContent(entry.authoredBackground.events.find(e=>e.id===event.id)),'出处L4事件hash已过期');assert.ok(sourceNote.note?.trim(),'缺出处L4阅读');assert.deepEqual([...(sourceNote.reviewedRiskPaths??[])].sort(),event.risks.map(r=>`${r.id}.${r.field}`).sort(),'出处L4漏审风险');}if(context.controlledRevision){assert.equal(record.incremental?.authorizationHash,context.controlledRevision.authorizationHash,'缺受控修订凭证');assert.equal(record.reviewRecovery?.status,'passed-L1-L2','缺新L2');assert.equal(record.reviewRecovery.requestHash,hashContent(record.reviewRecovery.request),'新L2请求hash不符');assert.equal(hashContent(record.reviewRecovery.prior),record.incremental.originalRecordHash,'旧record证据改变');}}const draft=drafts.find(d=>d.id===entry.id),check=validateDraft(draft,entry);assert.deepEqual(check.errors,[],'L1修订失败');}
 return {target,world,reference,entries,drafts,manifestHash:hashContent(plan)};
}
async function replayStoredDepthEvidence({root,worldRoot,entries,world,foundation,revision,contextFor,records}){
 const registry=await read(path.join(root,'first-source-evidence.json')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(registry){assert.equal(hashContent(registry.mapRaw),registry.mapRawHash,'原索引字节改变');assert.deepEqual(JSON.parse(registry.mapRaw),registry.map,'原索引数据改变');assert.deepEqual(await read(inside(worldRoot,registry.mapFile)),registry.map,'来源索引改变');}
 for(const entry of entries){const record=records.find(r=>r.id===entry.id),context=contextFor(entry);
  if(record.frozenCandidate){assert.equal(record.frozenCandidate.entryHash,hashContent(entry),'定稿entry改变');assert.equal(record.frozenCandidate.draftHash,hashContent(record.draft),'定稿draft改变');}
  const source=registry?.sources.find(s=>s.id===entry.id);
  if(source){const evidence=source.evidence;validateSourceEvidence(evidence.data,entry,world);assert.equal(hashContent(evidence.raw),evidence.rawHash,'原附件字节改变');assert.equal(hashContent(evidence.data),evidence.contentHash,'原附件hash改变');assert.deepEqual(JSON.parse(evidence.raw),evidence.data,'原附件正文改变');assert.deepEqual(await read(inside(worldRoot,evidence.file)),evidence.data,'来源附件改变');
   const original=record.reviewRecovery?.prior??record,proof=original.firstSourceEvidence;assert.equal(proof?.registrationHash,hashContent(registry),'原附件登记凭证改变');
   for(const receipt of proof.requests){assert.equal(receipt.requestHash,hashContent(receipt.request),'原出站请求改变');assert.equal(receipt.foundationHash,hashContent(foundation),'原出站foundation改变');assert.deepEqual(JSON.parse(receipt.request.messages.at(-1).content),evidence.data,'原出站附件丢失');}
   if(!record.reopenAuthorization){const review=proof.requests.findLast(r=>r.phase==='review');assert.equal(review?.status,'completed','缺首次完整L2');assert.equal(review.responseHash,hashContent(proof.reviewResponse),'首次L2原文改变');assert.deepEqual(parseModelJSON(proof.reviewResponse),record.review,'首次L2原文与审核不符');let request=buildReviewRequest(entry,record.draft,context);if(registry.compactRequest)request=compactReviewRequest(request);request.messages.push({role:'user',content:JSON.stringify(evidence.data)});assert.deepEqual(review.request,request,'首次L2无法重放');}
  }else assert.ok(!record.firstSourceEvidence,'首次附件登记丢失');
  if(record.reopenAuthorization){const auth=await read(inside(worldRoot,path.relative(worldRoot,path.resolve(root,record.reopenAuthorization.file))));assert.equal(hashContent(auth),record.reopenAuthorization.manifestHash,'重开授权清单改变');assert.equal(auth.id,record.reopenAuthorization.id,'重开授权ID改变');
   const recovery=record.reviewRecovery;assert.equal(recovery?.status,'passed-L1-L2','缺重开L2');assert.equal(recovery.requestHash,hashContent(recovery.request),'重开请求hash改变');let request=buildReviewRequest(entry,record.draft,context,{requireLeafCoverage:true});if(recovery.compactRequest)request=compactReviewRequest(request);
   if(recovery.sourceEvidence){const evidence=recovery.sourceEvidence;validateSourceEvidence(evidence.data,entry,world);assert.equal(hashContent(evidence.raw),evidence.rawHash,'重开附件字节改变');assert.equal(hashContent(evidence.data),evidence.contentHash,'重开附件hash改变');assert.deepEqual(await read(inside(worldRoot,path.relative(worldRoot,evidence.relativeTo==='root'?path.resolve(root,evidence.file):evidence.file))),evidence.data,'重开原附件改变');request.messages.push({role:'user',content:JSON.stringify(evidence.data)});}
   assert.deepEqual(recovery.request,request,'重开完整L2请求无法重放');const cardId=Object.keys(auth.cards).find(id=>auth.cards[id].allowed.some(a=>a.id===entry.id));await loadDepthReopen({root,worldRoot,cardId,reopenAuthorization:path.resolve(root,record.reopenAuthorization.file),bindingRecords:records},{foundation,world,worldRoot});const grant=Object.values(auth.cards).find(g=>g.allowed.some(a=>a.id===entry.id)),permission=grant?.allowed.find(a=>a.id===entry.id);assert.ok(permission,'重开人物未授权');assert.ok(recordHasHash(recovery.prior,permission.recordHash??permission.createdRecordHash),'重开旧record链改变');assert.deepEqual(parseModelJSON(recovery.response),record.review,'重开L2原文与审核不符');assert.ok(!checkIncrementalReview(record.review,entry,context).some(i=>i.severity==='hard'),'重开完整覆盖或出处存在硬错');
  }
 }
}
function inside(root,relative){
 assert.equal(typeof relative,'string','清单路径缺失');
 const file=path.resolve(root,relative),rel=path.relative(root,file);
 assert.ok(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)&&!/secrets\.json$/i.test(file),'清单路径须位于 world/ 内');
 return file;
}
function differences(a,b,field=''){
 if(hashContent(a??null)===hashContent(b??null))return [];
 if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],Array.isArray(b)?`${field}[${k}]`:field?`${field}.${k}`:k));
 return [{path:field,before:a??null,after:b??null}];
}
function mergeEntry(current,entry,draft){
 // A later memory tail is preserved; every frozen field must still match.
 const scrub=n=>{const out=structuredClone(n);delete out.coins;delete out.inventory;delete out.memorySeeds;return out;};
 const candidates=[applyDepthDraft(entry.before,draft),entry.before];
 const frozen=candidates.find(n=>hashContent(scrub(n))===hashContent(scrub(current))&&hashContent(current.memorySeeds?.slice(0,n.memorySeeds?.length))===hashContent(n.memorySeeds));
 if(!frozen){const conflicts=candidates.map(n=>differences(n,{...current,coins:n.coins,inventory:n.inventory,memorySeeds:current.memorySeeds.slice(0,n.memorySeeds.length)})).sort((a,b)=>a.length-b.length);throw Error(`人物补丁冲突或原档已过期 ${current.id}/${conflicts[0][0]?.path??'memorySeeds'}`);}
 const tail=current.memorySeeds.slice(frozen.memorySeeds.length);
 const patched=applyDepthDraft(entry.before,draft);
 // Applying to the frozen before avoids overwriting later memories at append indices.
 return {...patched,coins:current.coins,inventory:structuredClone(current.inventory),memorySeeds:[...patched.memorySeeds,...tail]};
}
function eventClosure(world,next,selected){
 const report=validateNpcDepth({...world,npcs:next}),closures=[];
 for(const id of selected){
  const original=world.npcs.find(n=>n.id===id),person=next.find(n=>n.id===id);
  for(const [index,memory] of person.memorySeeds.entries()){
   if((memory.knownBy??[]).length<2||original.memorySeeds.some(m=>hashContent(m)===hashContent(memory)))continue;
   assert.ok(memory.id&&memory.knownBy.includes(id),'共享事件缺id/本人');
   for(const partner of memory.knownBy){
    const other=next.find(n=>n.id===partner),counterpart=other?.memorySeeds?.find(m=>m.id===memory.id);
    assert.ok(other?.tier==='full'&&counterpart,`共享事件未闭合 ${memory.id}/${partner}: 伙伴待审或缺记忆`);
    assert.equal(counterpart.location,memory.location,`共享事件地点不一致 ${memory.id}/${partner}`);
    assert.equal(counterpart.minute,memory.minute,`共享事件时点不一致 ${memory.id}/${partner}`);
    assert.deepEqual([...counterpart.knownBy].sort(),[...memory.knownBy].sort(),`共享事件知情者不一致 ${memory.id}/${partner}`);
    assert.ok(!report.issues.some(i=>i.id===partner&&i.field===`memorySeeds[${other.memorySeeds.indexOf(counterpart)}]`&&i.code==='memory-shared'),`共享事件事实不相容 ${memory.id}/${partner}`);
    const prior=world.npcs.find(n=>n.id===partner)?.memorySeeds?.find(m=>m.id===memory.id);
    assert.ok(selected.has(partner)||hashContent(prior??null)===hashContent(counterpart),`共享事件伙伴未批准 ${memory.id}/${partner}`);
   }
   assert.ok(!report.issues.some(i=>i.id===id&&i.field===`memorySeeds[${index}]`&&i.code==='memory-shared'),`共享事件事实不相容 ${memory.id}/${id}`);
   closures.push({id,eventId:memory.id,participants:[...memory.knownBy],closed:true});
  }
 }
 return {closures,report};
}
async function preparedPublication({batchManifest,manifest,worldRoot}={}){
 assert.ok(!(batchManifest&&manifest),'--manifest 与 --batch-manifest 不能同时使用');
 let plan,target,manifestFiles;
 if(batchManifest){
  assert.equal(typeof batchManifest,'string','批清单须为 world 内文件');plan=await read(batchManifest);
  assert.equal(plan.contract,batchContract,'不支持的批发布合同');
  target=path.resolve(worldRoot??path.resolve(path.dirname(path.resolve(batchManifest)),plan.worldRoot));inside(target,path.relative(target,path.resolve(batchManifest)));
  assert.ok(Array.isArray(plan.manifests)&&plan.manifests.length,'缺完整卡清单');
  manifestFiles=plan.manifests.map(file=>inside(target,file));assert.equal(new Set(manifestFiles).size,manifestFiles.length,'完整卡重复');
  assert.ok(Array.isArray(plan.expectedIds)&&plan.expectedIds.length&&new Set(plan.expectedIds).size===plan.expectedIds.length,'预期人物集合缺失或重复');
  assert.match(plan.sourceHash??'',/^[a-f0-9]{64}$/,'缺原世界hash');
 }else{
  assert.ok(manifest,'需要 --manifest 或 --batch-manifest');
  const single=typeof manifest==='string'?await read(manifest):manifest;
  const anchor=typeof manifest==='string'?path.dirname(path.resolve(manifest)):process.cwd();
  target=path.resolve(worldRoot??path.resolve(anchor,single.worldRoot));manifestFiles=[manifest];
 }
 const file=path.join(target,'people/baseline.json'),originalBytes=await fs.readFile(file,'utf8'),world=await loadWorld(target),sourceHash=hashContent(world);
 assert.deepEqual(JSON.parse(originalBytes),world.npcs,'读取世界期间baseline已并发改变');
 const cards=[];for(const manifest of manifestFiles)cards.push(await prepareNpcDepth({manifest,worldRoot:target,world}));
 const entries=cards.flatMap(c=>c.entries),selected=new Set(entries.map(e=>e.id));assert.equal(selected.size,entries.length,'卡间人物重复');
 if(plan){assert.deepEqual([...selected].sort(),[...plan.expectedIds].sort(),'预期人物集合与完整卡不符');for(const id of selected)assert.equal(world.npcs.find(n=>n.id===id)?.tier,'full',`预期人物不是正式full ${id}`);}
 const drafts=new Map(cards.flatMap(c=>c.drafts).map(d=>[d.id,d]));
 // All cards are checked against one original snapshot, then evaluated together.
 const frozenWorld={...world,npcs:world.npcs.map(n=>entries.find(e=>e.id===n.id)?.before??n)};
 validatePatchResults(entries,frozenWorld);
 const next=world.npcs.map(n=>selected.has(n.id)?mergeEntry(n,entries.find(e=>e.id===n.id),drafts.get(n.id)):n);
 assert.deepEqual(validateNpcProfiles({...world,npcs:next}),[],'人物补丁引用或跨人结构约束失败');
 const changes=next.flatMap(n=>differences(world.npcs.find(p=>p.id===n.id),n).map(change=>({id:n.id,...change})));
 const changed=changes.length?['people/baseline.json']:[];
 if(plan&&changed.length)assert.equal(sourceHash,plan.sourceHash,'原世界hash过期');
 const {closures,report}=eventClosure(world,next,selected);
 const selectedIssues=report.issues.filter(i=>selected.has(i.id));
 if(plan)assert.deepEqual(selectedIssues,[],'所选人物仍有质量缺口');
 for(const id of legacyTraitsAuditIds)assert.deepEqual(next.find(n=>n.id===id)?.traits,world.npcs.find(n=>n.id===id)?.traits,`固定traits改变 ${id}`);
 const preview={published:false,changed,amendedNpcIds:[...selected],changes,eventClosure:closures,sourceHash,resultHash:hashContent({...world,npcs:next}),baselineSourceHash:hashContent(world.npcs),baselineResultHash:hashContent(next),manifests:cards.map((c,i)=>({path:typeof manifestFiles[i]==='string'?path.relative(target,manifestFiles[i]).replaceAll('\\','/'):null,hash:c.manifestHash,ids:c.entries.map(e=>e.id)})),selectedQuality:{checked:selected.size,issues:selectedIssues},globalQuality:{checked:report.checked,issues:report.issues},modelCalls:0};
 const unchanged=async()=>{assert.equal(await fs.readFile(file,'utf8'),originalBytes,'baseline并发改变，拒绝覆盖');assert.equal(hashContent(await loadWorld(target)),sourceHash,'世界并发改变，拒绝覆盖');};
 await unchanged();
 return {preview:structuredClone(preview),apply:async()=>{
  const lockFile=file+'.depth-publication.lock';let lock,temp;
  try{
   try{lock=await fs.open(lockFile,'wx');}catch(e){if(e.code==='EEXIST')throw Error('另一个人物发布正在提交');throw e;}
   await unchanged();
   if(batchManifest)assert.deepEqual(await read(batchManifest),plan,'批清单在预演后改变');
   for(const [index,manifest] of manifestFiles.entries()){const fresh=await prepareNpcDepth({manifest,worldRoot:target,world});assert.deepEqual([fresh.manifestHash,fresh.entries,fresh.drafts],[cards[index].manifestHash,cards[index].entries,cards[index].drafts],'审核凭证在预演后改变');}
   if(changed.length){temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(next,null,2)+'\n');await unchanged();await fs.rename(temp,file);temp=null;}
   return {...structuredClone(preview),published:true};
  }finally{if(temp)await fs.rm(temp,{force:true});if(lock){await lock.close();await fs.rm(lockFile,{force:true});}}
 }};
}
export const prepareNpcDepthBatch=options=>preparedPublication(options);
export async function publishNpcDepth(options={}){
 const prepared=await preparedPublication(options);return options.publish?prepared.apply():prepared.preview;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--help'))console.log(publishDepthHelp);
 else{const value=flag=>{const at=process.argv.indexOf(flag);if(at<0)return undefined;assert.ok(process.argv[at+1]&&!process.argv[at+1].startsWith('--'),`缺少参数 ${flag}`);return process.argv[at+1];};console.log(JSON.stringify(await publishNpcDepth({manifest:value('--manifest'),batchManifest:value('--batch-manifest'),publish:process.argv.includes('--publish')})));}
}
