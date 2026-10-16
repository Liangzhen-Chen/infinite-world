import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {completeOptions} from '../world/drafts/w1/wt-depth/reopen/prepare-complete.mjs';
import {sourceRepairOptions} from '../world/drafts/w1/wt-depth/reopen/complete-003/prepare-source-repair.mjs';
import {prepareDepthRevision,replayDepthProof,depthRevisionProof,runDepth} from '../tools/npc-depth.mjs';
import {patchDraft,buildReviewRequest,applyDepthDraft,getPath,validateControlledRevision} from '../tools/npc-depth-content.mjs';
import {compactReviewRequest} from '../tools/npc-depth-source-evidence.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {runDepthReview} from '../tools/npc-depth-review.mjs';
import {prepareNpcDepth} from '../tools/publish-npc-depth.mjs';
async function proofFor(options){let proof=await read(path.join(options.root,'incremental-proof.json'));while(proof&&proof.authorizationHash!==options.authorizationHash)proof=proof.previousProof;assert.ok(proof,'历史规划须有真实父proof');return proof;}
const read=file=>fs.readFile(file,'utf8').then(JSON.parse),write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n');

test('T58真实父record basis补全15人23兄弟，四方子plan持久/prepare/full/compact同值且未变record完整复用',async()=>{
 const parentOptions=await completeOptions(),options=await sourceRepairOptions(),parent=await prepareDepthRevision({...parentOptions,proofOverride:await proofFor(parentOptions)}),prepared=await prepareDepthRevision({...options,proofOverride:await proofFor(options)});
 const proof=await proofFor(parentOptions),receipt=depthRevisionProof(options,prepared,proof.reopenAuthorization);
 const replay=await replayDepthProof(parent.foundation,proof,{readPlan:file=>read(path.resolve(options.root,file))});
 for(const e of parent.entries)assert.deepEqual(replay.find(r=>r.id===e.id).patches,e.patches);
 const legacy=parent.foundation.entries.map(e=>structuredClone(e));function oldReplay(p){if(p.previousProof)oldReplay(p.previousProof);for(const c of p.changes)legacy.find(e=>e.id===c.id).patches.find(p=>p.path===c.path).value=c.after;}oldReplay(proof);
 const differences=parent.entries.flatMap(e=>e.patches.filter(p=>hashContent(p.value)!==hashContent(legacy.find(old=>old.id===e.id).patches.find(old=>old.path===p.path).value)).map(p=>({id:e.id,path:p.path})));
 assert.equal(differences.length,23);assert.equal(new Set(differences.map(d=>d.id)).size,15);
 const frozen=await prepareDepthRevision({...options,design:path.join(options.root,'design.mjs'),proofOverride:receipt});
 assert.deepEqual(frozen.entries,prepared.entries);assert.deepEqual(frozen.contexts,prepared.contexts);
 assert.deepEqual(await runDepth({...options,proofOverride:receipt,prepare:true}),{entries:30,formalWrite:false,modelCalls:0});
 const actors=new Set(['npc_wt_zhangou','npc_wt_zhicai','npc_wt_xueying','npc_wt_leizhi']);
 const report=await read(path.resolve(options.root,'../reopen/complete-003/source-repair-report.json'));
 assert.deepEqual(report.changes.map(c=>c.id).sort(),[...actors].sort());assert.ok(report.changes.every(c=>c.path==='memorySeeds[2]'));
 for(const entry of prepared.entries){
  const old=parent.entries.find(e=>e.id===entry.id),context=prepared.contexts.get(entry.id),record=await read(path.join(options.root,entry.id+'.json'));
  for(const p of entry.patches)if(!actors.has(entry.id)||p.path!=='memorySeeds[2]')assert.deepEqual(p.value,old.patches.find(o=>o.path===p.path).value);
  if(!actors.has(entry.id)){
   assert.deepEqual(entry,old);const oldContext=parent.contexts.get(entry.id);
   if(prepared.plan.authorized.some(a=>a.id===entry.id))assert.deepEqual(context,{...oldContext,controlledRevision:{...oldContext.controlledRevision,authorizationHash:options.authorizationHash}});
   else assert.deepEqual(context,oldContext);
  }
  const full=buildReviewRequest(entry,patchDraft(entry),context,{requireLeafCoverage:true}),compact=compactReviewRequest(full),payload=JSON.parse(compact.messages[1].content),fullPayload=JSON.parse(full.messages[1].content);
  payload.skeleton.facts=applyDepthDraft(payload.skeleton.before,payload.draft);
  payload.publishedFacts.revisions=payload.skeleton.patches.map(p=>({path:p.path,before:getPath(entry.before,p.path)??null,after:p.value,issues:entry.issues}));
  assert.deepEqual(payload,fullPayload);
  const stable=report.unchangedPassed.find(r=>r.id===entry.id);if(stable){assert.equal(hashContent(record),stable.recordHash);assert.equal(record.fingerprint,stable.fingerprint);assert.equal(record.fingerprint,hashContent({entry,context,revision:prepared.config.revision}));}
 }
 const credential=await read(path.resolve(options.root,prepared.plan.sourceAuthorization.file));
 assert.equal(credential.parentManifestHash,'f23eb0e7c49f472e75e47fce1946469e6c906a6314e9bf341aa6b77a2bfd3195');
 assert.equal(hashContent(prepared.reopening.grant),credential.parentGrantHash);assert.deepEqual(credential.allowed.map(p=>p.id).sort(),[...actors].sort());
 assert.equal(prepared.reopening.grant.maxAttempts,2);assert.equal(prepared.reopening.grant.newLimitYuan,4.5);
 const leafEntries=structuredClone(prepared.entries);for(const entry of leafEntries)entry.authoredBackground=parent.entries.find(e=>e.id===entry.id).authoredBackground;
 const grantWithoutZhangouSource={...prepared.reopening,sourcePermissions:prepared.reopening.sourcePermissions.filter(p=>p.id!=='npc_wt_zhangou')};
 assert.ok(validateControlledRevision(prepared.plan,{entries:leafEntries,foundation:prepared.foundation,records:prepared.records,world:prepared.world,candidate:await read(path.join(options.root,'candidate.json')),base:await read(path.join(options.root,'base.json')),authorizationHash:options.authorizationHash,sourceHashes:prepared.sourceHashes,reopen:grantWithoutZhangouSource,previousEntries:parent.entries}).changes.some(c=>c.id==='npc_wt_zhangou'&&c.path==='memorySeeds[2]'));
});

test('T58真实source凭证缺失/hash/祖先/越权/兄弟/单侧均在prepare、review与publish模型前拒绝',async t=>{
 const temp=await fs.mkdtemp(path.join(tmpRoot(),'t58-proof-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const worldRoot=path.join(temp,'world');
 for(const dir of ['meta','geo','people','lore'])await fs.cp(path.resolve('world',dir),path.join(worldRoot,dir),{recursive:true});
 await fs.mkdir(path.join(worldRoot,'design'),{recursive:true});
 for(const file of ['w1-wt-depth.mjs','w1-villages-weiting.mjs','w1-reopen-authorization.json'])await fs.copyFile(path.resolve('world/design',file),path.join(worldRoot,'design',file));
 await fs.cp(path.resolve('world/drafts/w1/wt-depth'),path.join(worldRoot,'drafts/w1/wt-depth'),{recursive:true});
 const actual=await sourceRepairOptions(),sourceProof=await proofFor(actual),root=path.join(worldRoot,'drafts/w1/wt-depth/sourced');
 // Restore the actual records bound by this historical plan, rather than its
 // subsequently completed descendants. All original paid evidence stays intact.
 for(const record of sourceProof.oldRecords)await write(path.join(root,record.id+'.json'),record);
 const remap=file=>path.resolve(worldRoot,path.relative(actual.worldRoot,file));
 const options={...actual,proofOverride:sourceProof.previousProof,root,worldRoot,design:remap(actual.design),controlledRevision:remap(actual.controlledRevision),authoredBackground:remap(actual.authoredBackground),sourceCheckoutEvidence:remap(actual.sourceCheckoutEvidence),reopenAuthorization:remap(actual.reopenAuthorization)};
 const parentProof=await read(path.join(root,'incremental-proof.json')),prepared=await prepareDepthRevision(options),proof=depthRevisionProof(options,prepared,parentProof.reopenAuthorization);
 const plan=await read(options.controlledRevision),credentialFile=path.resolve(root,plan.sourceAuthorization.file),credential=await read(credentialFile);
 const assertConsumers=async(next,pattern)=>{
  await assert.rejects(prepareDepthRevision(next),pattern);
  await assert.rejects(runDepthReview({...next,id:'npc_wt_zhangou',budgetRoot:path.join(temp,'unopened-budget')},{client:{generate(){throw Error('模型不得调用');}}}),pattern);
 };
 for(const mutate of [c=>c.parentManifestHash='forged',c=>c.parentGrantHash='forged',c=>c.allowed[0].recordHash='forged',c=>c.allowed[0].paths.push('memorySeeds[1]'),c=>c.allowed.pop(),c=>c.source.path='sourceRefs',c=>c.source.afterHash='forged']){
  const bad=structuredClone(credential);mutate(bad);await write(credentialFile,bad);
  const changed={...plan,sourceAuthorization:{...plan.sourceAuthorization,hash:hashContent(bad)}};await write(options.controlledRevision,changed);
  await assertConsumers({...options,authorizationHash:hashContent(changed)},/来源/);
 }
 await write(credentialFile,credential);await write(options.controlledRevision,plan);
 const missing=structuredClone(plan);delete missing.sourceAuthorization;await write(options.controlledRevision,missing);await assertConsumers({...options,authorizationHash:hashContent(missing)},/未授权重开叶/);await write(options.controlledRevision,plan);
 await write(credentialFile,{...credential,parentGrantHash:'forged'});await assertConsumers(options,/来源凭证hash/);await write(credentialFile,credential);
 const sibling=structuredClone(plan);sibling.authorized[0].paths.push('memorySeeds[1]');await write(options.controlledRevision,sibling);await assertConsumers({...options,authorizationHash:hashContent(sibling)},/未授权重开叶/);await write(options.controlledRevision,plan);
 const badEntries=structuredClone(prepared.entries);
 badEntries.find(r=>r.id==='npc_wt_zhicai').patches.find(p=>p.path==='opinions.neighbors[2].view').value='正确兄弟被改';await assertConsumers({...options,entriesOverride:badEntries},/正确兄弟叶/);
 const singleSided=structuredClone(prepared.entries),background=await read(options.authoredBackground);
 singleSided.find(r=>r.id==='npc_wt_leizhi').patches.find(p=>p.path==='memorySeeds[2]').value.event=credential.source.beforeHash;
 await assertConsumers({...options,entriesOverride:singleSided},/共享事件双方叙述不相容/);
 const extraSource=structuredClone(background);extraSource.events.find(e=>e.id==='memory_wt_depth_group_3').sourceRefs[0].publicSpeech='越权扩充';await write(options.authoredBackground,extraSource);await assertConsumers(options,/来源凭证只授权narrative/);await write(options.authoredBackground,background);
 const baselineFile=path.join(worldRoot,'people/baseline.json'),rows=await read(baselineFile);
 for(const entry of prepared.entries)rows[rows.findIndex(n=>n.id===entry.id)]=structuredClone(entry.before);await write(baselineFile,rows);
 const baseline=await fs.readFile(baselineFile,'utf8');
 await write(path.join(root,'incremental-proof.json'),proof);
 // The publication consumer reconstructs the real child successfully, then
 // stops at its absent real L2. No approval or provider response is invented.
 await assert.rejects(prepareNpcDepth({manifest:path.join(root,'manifest.json'),worldRoot}),/缺重开L2|指纹|人工队列|尚未|审核/);
 for(const mutate of [p=>p.previousProof.oldRecords.find(r=>r.id==='npc_wt_zhicai').draft.patches[0].value='tampered',p=>p.previousProofHash='tampered',p=>p.changes[0].path='memorySeeds[1]']){
  const bad=structuredClone(proof);mutate(bad);await write(path.join(root,'incremental-proof.json'),bad);
  await assert.rejects(prepareNpcDepth({manifest:path.join(root,'manifest.json'),worldRoot}),/hash|越权|不符|继承实际旧链/);
 }
 await write(path.join(root,'incremental-proof.json'),proof);await write(credentialFile,{...credential,parentGrantHash:'forged'});
 await assert.rejects(prepareNpcDepth({manifest:path.join(root,'manifest.json'),worldRoot}),/来源凭证hash/);
 assert.equal(await fs.readFile(path.join(worldRoot,'people/baseline.json'),'utf8'),baseline);
});

test('T08实际父proof重放同根draft basis，无正文修订或新增来源权限',async()=>{
 const root=path.resolve('world/drafts/w1/lq-depth/author-v2/first-review'),foundation=await read(path.join(root,'foundation.json')),proof=await read(path.join(root,'incremental-proof.json'));
 const entries=await replayDepthProof(foundation,proof,{readPlan:file=>read(path.resolve(root,file)),readCandidate:()=>read(path.join(root,'candidate.json'))});
 const config=await import('../world/design/w1-lq-depth.mjs');
 for(const row of config.patchRows)assert.deepEqual(entries.find(e=>e.id===row.id).patches,row.patches);
});
