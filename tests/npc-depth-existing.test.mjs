import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as config from '../world/design/w1-existing-depth.mjs';
import * as firstReview from '../world/design/w1-existing-depth-first-review.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {legacyTraitsExpected,findNpcRuleWording} from '../tools/npc-profile-validation.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,validateDraft,validatePatchResults,contextFor,buildReviewRequest,getPath,verifyUnchanged,validateAuthoredBackground,checkIncrementalReview} from '../tools/npc-depth-content.mjs';
import {prepareDepth} from '../tools/npc-depth.mjs';
import {publishNpcDepth} from '../tools/publish-npc-depth.mjs';

const formalWorld=await loadWorld();
// Original review/source hashes describe the frozen pre-publication catalog.
const world={...formalWorld,npcs:formalWorld.npcs.map(n=>config.base.find(row=>row.id===n.id)??n)};
const root=path.resolve('world/drafts/w1/existing-depth');
const design=path.resolve('world/design/w1-existing-depth.mjs');
const entries=depthEntries(config.base,config,world);
const merged=validatePatchResults(entries,world);
const targetIds=new Set(config.scopeAudit.targetIds);
const sources=JSON.parse(await fs.readFile(path.join(root,'source-evidence.json'),'utf8'));

test('T11-B正式32人等于已批准的首次审核补丁，原审核快照仍保留323缺口',()=>{
 const approved=validatePatchResults(depthEntries(firstReview.base,firstReview,world),world);
 for(const id of config.scopeAudit.targetIds)assert.deepEqual(formalWorld.npcs.find(n=>n.id===id),approved.npcs.find(n=>n.id===id));
 const currentReport=auditNpcDepth(formalWorld),frozenReport=auditNpcDepth(world);
 assert.deepEqual(currentReport.issues.filter(i=>config.scopeAudit.targetIds.includes(i.id)),[]);
 assert.equal(frozenReport.issues.filter(i=>config.scopeAudit.targetIds.includes(i.id)).length,323);
 assert.equal(currentReport.issues.length,frozenReport.issues.length-323);
 assert.equal(currentReport.ok,false,'未选full真实缺口仍拒绝全体达标');
});

test('T10集合差是152 full减四村120，冻结实际32个id与323项缺口',()=>{
 const fourVillages=new Set(['loc_bs_yupo','loc_bs_weiting','loc_bs_liquan','loc_bs_sangban']);
 const full=world.npcs.filter(n=>n.tier==='full');
 const excluded=full.filter(n=>fourVillages.has(n.settlement??n.scope)).map(n=>n.id);
 const remaining=full.filter(n=>!excluded.includes(n.id)).map(n=>n.id);
 assert.equal(full.length,152);assert.equal(excluded.length,120);assert.equal(remaining.length,32);
 assert.deepEqual(config.scopeAudit.excludedVillageIds,excluded);
 assert.deepEqual(config.scopeAudit.targetIds,remaining);
 assert.deepEqual(entries.map(e=>e.id),remaining);
 assert.deepEqual(config.scopeAudit.issues,auditNpcDepth(world).issues.filter(i=>targetIds.has(i.id)));
 assert.equal(config.scopeAudit.issues.length,323);
 for(const batch of config.authorBatches)assert.ok(batch.ids.length>=3&&batch.ids.length<=5);
 assert.deepEqual(config.authorBatches.flatMap(b=>b.ids).sort(),remaining.toSorted());
});

test('32人合并审计零缺口，全部修订叶过L1，其他村的原缺口保持原状',()=>{
 const result=auditNpcDepth(merged);
 assert.deepEqual(result.issues.filter(i=>targetIds.has(i.id)),[]);
 assert.deepEqual(result.issues.filter(i=>!targetIds.has(i.id)),auditNpcDepth(world).issues.filter(i=>!targetIds.has(i.id)));
 for(const entry of entries){assert.deepEqual(validateDraft(patchDraft(entry),entry).errors,[]);assert.deepEqual(findNpcRuleWording(entry.facts),[]);}
 assert.equal(result.legacyTraits.ok,true);
 for(const [id,traits] of Object.entries(legacyTraitsExpected))assert.deepEqual(merged.npcs.find(n=>n.id===id).traits,traits);
});

test('合格兄弟字段、原经历、钱物、教学、技能和服务全部保留',()=>{
 for(const entry of entries){
  const {before,facts:after}=entry;verifyUnchanged(before,after,entry);
  for(const key of Object.keys(before))if(!['knowledge','voice','relationships','memorySeeds','goals'].includes(key))assert.deepEqual(after[key],before[key],`${entry.id}.${key}`);
  assert.deepEqual(after.knowledge.known.slice(0,before.knowledge.known.length),before.knowledge.known);
  assert.deepEqual(after.memorySeeds.slice(0,before.memorySeeds.length),before.memorySeeds);
  assert.equal(after.memorySeeds.length,before.memorySeeds.length+1);
  const {register,...oldVoice}=before.voice,{register:next,...newVoice}=after.voice;assert.deepEqual(newVoice,oldVoice);
  assert.equal(after.relationships.length,before.relationships.length);
  before.relationships.forEach((rel,index)=>{const {note,...old}=rel,{note:newNote,...updated}=after.relationships[index];assert.deepEqual(updated,old);if(!entry.issues.some(i=>i.field===`relationships[${index}].note`))assert.equal(newNote,note);});
  for(const term of ['short','mid','long'])before.goals[term].forEach((goal,index)=>{
   const {steps,...old}=goal,{steps:newSteps,...updated}=after.goals[term][index];assert.deepEqual(updated,old);
   assert.equal(newSteps.length,steps.length);
   steps.forEach((step,j)=>{const field=`goals.${term}[${index}].steps[${j}].content`;if(entry.issues.some(i=>i.field===field)){const {content,...oldStep}=step,{content:newContent,...updatedStep}=newSteps[j];assert.deepEqual(updatedStep,oldStep);assert.notEqual(newContent,goal.content);}else assert.deepEqual(newSteps[j],step);});
  });
 }
 for(const npc of world.npcs.filter(n=>!targetIds.has(n.id)))assert.deepEqual(merged.npcs.find(n=>n.id===npc.id),npc);
});

test('15条共同事件均有冻结原来源，双方或三方事实一致，无旧玩家经历或已成交声称',()=>{
 assert.equal(config.sharedEvents.length,15);
 assert.equal(config.sharedEvents.filter(e=>e.candidateConversation).length,2);
 for(const event of config.sharedEvents){
  const evidence=sources.events.find(e=>e.id===event.id);assert.ok(evidence?.sources.length);
  for(const source of evidence.sources){const person=world.npcs.find(n=>n.id===source.id);assert.deepEqual(source.value,getPath(person,source.path));assert.equal(source.sourceHash,hashContent(source.value));}
  for(const id of event.knownBy){
   assert.ok(targetIds.has(id));const memory=merged.npcs.find(n=>n.id===id).memorySeeds.at(-1);
   assert.equal(memory.id,event.id);assert.equal(memory.event,event.event);assert.deepEqual(memory.knownBy,event.knownBy);
  }
  assert.doesNotMatch(event.event,/玩家|主人公|约工便条|已经(?:交付|付款|结清|签署|完成试验)/);
  if(event.candidateConversation)assert.match(event.event,/仍须|仍待/);
 }
 for(const source of sources.relationships){assert.deepEqual(source.value,getPath(world.npcs.find(n=>n.id===source.id),source.path));assert.equal(source.sourceHash,hashContent(source.value));}
});

test('L2投影包括本次全部补丁和明确选择的原关系与记忆，源不写回人物',()=>{
 for(const entry of entries){
  const context=contextFor(entry,world);
  assert.deepEqual(context.revisions.map(r=>r.path),entry.patches.map(p=>p.path));
  const request=JSON.parse(buildReviewRequest(entry,patchDraft(entry),context).messages[1].content);
  for(const key of ['referenceRelationshipIds','referenceMemoryIds']){
   const field=key==='referenceRelationshipIds'?'relationships':'memorySeeds';
   assert.equal(new Set(entry[key]).size,entry[key].length);
   for(const id of entry[key]){
    assert.deepEqual(context.people.find(p=>p.id===id)[field],world.npcs.find(n=>n.id===id)[field]);
    assert.deepEqual(request.publishedFacts.people.find(p=>p.id===id)[field],world.npcs.find(n=>n.id===id)[field]);
   }
  }
  assert.ok(entry.referenceMemoryIds.length<=3);
  assert.ok(entry.referenceRelationshipIds.length<=4);
  assert.equal(Object.hasOwn(entry.facts,'sourceRecords'),false);
 }
});

test('prepare重跑冻结指纹一致且零写入，不建立模型账、不改正式人物',async()=>{
 const files=['base.json','foundation.json','candidate.json','manifest.json','source-evidence.json'];
 const before=await Promise.all(files.map(async file=>({file,body:await fs.readFile(path.join(root,file),'utf8'),mtime:(await fs.stat(path.join(root,file))).mtimeMs})));
 const formal=await fs.readFile('world/people/baseline.json','utf8');
 const prepared=await prepareDepth({design,root});assert.equal(prepared.entries.length,32);
 for(const old of before){assert.equal(await fs.readFile(path.join(root,old.file),'utf8'),old.body);assert.equal((await fs.stat(path.join(root,old.file))).mtimeMs,old.mtime);}
 assert.equal(await fs.readFile('world/people/baseline.json','utf8'),formal);
 await assert.rejects(fs.stat(path.join(root,'budget.json')),/ENOENT/);
 await assert.rejects(fs.stat(path.join(root,'allocation.json')),/ENOENT/);
});

test('离线候选未经L2和L4时不能发布正式人物',async()=>{
 const before=await fs.readFile('world/people/baseline.json','utf8');
 await assert.rejects(publishNpcDepth({manifest:path.join(root,'manifest.json'),publish:true}));
 assert.equal(await fs.readFile('world/people/baseline.json','utf8'),before);
});

test('首次审核出处区分10条原共同经历和5条独立新背景，正式字段hash不是候选的hash',async()=>{
 const provenance=JSON.parse(await fs.readFile(path.join(root,'first-review/event-provenance.json'),'utf8'));
 assert.equal(provenance.events.length,15);
 assert.equal(provenance.events.filter(e=>e.kind==='original-shared-event').length,10);
 assert.equal(provenance.events.filter(e=>e.kind==='new-authored-background').length,5);
 assert.equal(firstReview.authoredBackground.events.length,5);
 for(const event of provenance.events)for(const ref of event.sourceRefs){
  assert.ok(['npcs','residents'].includes(ref.collection));
  const value=getPath(world[ref.collection].find(n=>n.id===ref.id),ref.field);
  assert.equal(ref.hash,hashContent(value));assert.equal(ref.visibility,'private');
 }
 for(const event of firstReview.authoredBackground.events){
  assert.equal(event.status,'past-but-unresolved');
  assert.ok(event.network.actors.length>=3&&event.network.actors.length<=5);
  assert.equal(event.network.problemRef.collection,'npcs');
  assert.match(event.network.problemRef.field,/^goals\.(short|mid|long)\[\d+\]\.content$/);
  assert.notEqual(event.narrative,event.associations[0].narrative);
  assert.equal(event.associations[0].factsHash,hashContent(event.designedFacts));
  assert.ok(event.pendingOutcomes.length);
  for(const ref of event.sourceRefs){
   assert.ok(['npcs','residents','locations','settlementProfiles'].includes(ref.collection));
   assert.equal(ref.hash,hashContent(getPath(world[ref.collection].find(n=>n.id===ref.id),ref.field)));
   assert.doesNotMatch(ref.field,/^(secrets|knowledge|memorySeeds)(\.|\[|$)/);
   if(ref.collection==='npcs'){assert.equal(ref.visibility,'private');assert.ok(ref.publicSpeech?.trim());}
  }
 }
});

test('新root仅补12人的新增记忆范围及陆青已绑定的学员纠词，旧记忆和合格叶不变',()=>{
 const nextEntries=depthEntries(firstReview.base,firstReview,world),after=validatePatchResults(nextEntries,world);
 assert.deepEqual(auditNpcDepth(after).issues.filter(i=>targetIds.has(i.id)),[]);
 assert.equal(firstReview.incrementLimitYuan,config.incrementLimitYuan);
 let changed=0;
 for(const entry of nextEntries){
  const original=entries.find(e=>e.id===entry.id),event=firstReview.authoredBackground.events.find(e=>e.actors.includes(entry.id));
  assert.deepEqual(entry.before,original.before);assert.equal(entry.baseHash,original.baseHash);
  assert.deepEqual(entry.issues,original.issues);assert.equal(entry.patches.length,original.patches.length);
  for(const patch of entry.patches){
   const old=original.patches.find(p=>p.path===patch.path);
   if(entry.id==='npc_hw_luqing'&&patch.path==='goals.long[0].steps[1].content'){
    assert.equal(patch.value,old.value.replace('白蕙等学者','白蕙等学员'));continue;
   }
   if(!event||!patch.path.startsWith('memorySeeds[')){assert.deepEqual(patch,old);continue;}
   changed++;
   const {event:oldText,location:oldLocation,...oldRest}=old.value;
   const {event:newText,location:newLocation,...newRest}=patch.value;
   assert.deepEqual(newRest,oldRest);assert.equal(newLocation,'loc_hw_dock');
   assert.equal(newText,'在旧渡口公用水盏周边，'+oldText);
   assert.equal(event.associations.find(a=>a.id===entry.id).narrative,newText);
  }
  assert.deepEqual(entry.facts.memorySeeds.slice(0,entry.before.memorySeeds.length),entry.before.memorySeeds);
  for(const key of ['skills','services','traits','secrets','coins','inventory','flags'])assert.deepEqual(entry.facts[key],original.facts[key]);
  const expectedGoals=structuredClone(original.facts.goals);
  if(entry.id==='npc_hw_luqing')expectedGoals.long[0].steps[1].content=expectedGoals.long[0].steps[1].content.replace('白蕙等学者','白蕙等学员');
  assert.deepEqual(entry.facts.goals,expectedGoals);
 }
 assert.equal(changed,12);
 assert.equal(auditNpcDepth(after).legacyTraits.ok,true);
});

test('受控恢复仅授权原13失败，绑定真实hard与必要原notes，保留全部原paid证据',async()=>{
 const recovery=path.join(root,'first-review/recovery');
 const plan=JSON.parse(await fs.readFile(path.join(recovery,'controlled-plan.json'),'utf8'));
 const failure=JSON.parse(await fs.readFile(path.join(root,'first-review/protocol-failure-evidence.json'),'utf8'));
 const snapshot=JSON.parse(await fs.readFile(path.join(recovery,'record-hashes-before.json'),'utf8'));
 assert.equal(plan.cardId,'T10');assert.equal(plan.revision,firstReview.revision);
 assert.deepEqual(plan.authorized.map(r=>r.id),failure.failed.map(r=>r.id));assert.equal(plan.authorized.length,13);
 assert.equal(snapshot.records.filter(r=>r.status==='passed').length,19);
 const hard=JSON.parse(await fs.readFile(path.join(recovery,'luqing-hard-binding.json'),'utf8'));
 assert.equal(hard.finding.severity,'hard');assert.equal(hard.field,'goals.long[0].steps[1].content');
 assert.equal(hard.after,hard.before.replace('白蕙等学者','白蕙等学员'));
 assert.equal(hard.reference.value,world.npcs.find(n=>n.id==='npc_hw_baihui').occupation);
 for(const item of plan.authorized){
  const record=JSON.parse(await fs.readFile(path.join(root,'first-review',item.id+'.json'),'utf8'));
  const original=record.reviewRecovery?.prior??record;
  assert.equal(item.recordHash,hashContent(original));assert.equal(item.draftHash,hashContent(original.draft));assert.equal(item.reviewHash,hashContent(original.review));
  if(record.reviewRecovery){assert.equal(record.incremental.authorizationHash,hashContent(plan));assert.equal(record.incremental.originalRecordHash,item.recordHash);assert.equal(record.reviewRecovery.status,'passed-L1-L2');assert.equal(record.status,'passed');}
  if(item.id==='npc_hw_luqing')assert.deepEqual(item.paths,[hard.field]);else{assert.deepEqual(item.paths,[]);assert.equal(item.sourceOnly,true);}
 }
 for(const old of snapshot.records){
  const record=JSON.parse(await fs.readFile(path.join(root,'first-review',old.id+'.json'),'utf8'));
  assert.equal(old.recordHash,hashContent(record.reviewRecovery?.prior??record));
  if(old.status==='passed'){assert.ok(!plan.authorized.some(a=>a.id===old.id));assert.ok(!record.reviewRecovery);assert.equal(old.recordHash,hashContent(record));}
 }
 const source=JSON.parse(await fs.readFile(path.join(recovery,'xuling-source-evidence.json'),'utf8'));
 assert.deepEqual(source.sourceRecords.map(r=>r.id),['npc_hw_xuling','npc_hw_taozhi']);
 assert.deepEqual(Object.keys(source.sourceRecords[1]).sort(),['id','name','notes']);
 assert.equal(source.sourceRecords[1].notes,world.npcs.find(n=>n.id==='npc_hw_taozhi').notes);
 for(const ref of plan.sourceHashes)assert.equal(ref.hash,hashContent(JSON.parse(await fs.readFile(path.join(root,'first-review',ref.file),'utf8'))));
});

test('普通prepare不能覆盖已付费旧foundation或陆青旧record，必须走受控修订',async()=>{
 const paidRoot=path.join(root,'first-review'),files=['foundation.json','candidate.json','manifest.json','npc_hw_luqing.json'];
 const old=await Promise.all(files.map(file=>fs.readFile(path.join(paidRoot,file),'utf8')));
 await assert.rejects(prepareDepth({design:path.resolve('world/design/w1-existing-depth-first-review.mjs'),root:paidRoot,cardId:'T10',authoredBackground:path.join(paidRoot,'authored-background.json')}),/骨架或引用已变/);
 for(const [index,file] of files.entries())assert.equal(await fs.readFile(path.join(paidRoot,file),'utf8'),old[index]);
});

test('5条新背景的公共feature、原私有问题和秘密风险必须独立核验',()=>{
 const nextEntries=depthEntries(firstReview.base,firstReview,world);
 const valid=validateAuthoredBackground(firstReview.authoredBackground,nextEntries,world);
 assert.equal(valid.sourceHash,hashContent(firstReview.authoredBackground));
 for(const event of valid.events){
  const feature=getPath(world.locations.find(p=>p.id===event.publicFeatureRef.id),event.publicFeatureRef.field);
  assert.equal(feature.access,'public');assert.match(event.narrative,new RegExp(feature.name));
  assert.ok(event.sourceRefs.some(r=>r.collection==='locations'&&r.field===event.publicFeatureRef.field&&r.hash===event.publicFeatureRef.hash));
  for(const a of event.associations)assert.ok(a.narrative.includes(feature.name));
 }
 const staleWorld=structuredClone(world),problem=valid.events[0].network.problemRef;
 staleWorld.npcs.find(n=>n.id===problem.id).goals.mid[0].content+='新的关切';
 assert.throws(()=>validateAuthoredBackground(firstReview.authoredBackground,nextEntries,staleWorld),/hash/);
 const privateWorld=structuredClone(world),bundle=structuredClone(firstReview.authoredBackground);
 const privateFeature=privateWorld.locations.find(p=>p.id==='loc_hw_dock').features[1];privateFeature.access='private';
 for(const event of bundle.events){event.publicFeatureRef.hash=hashContent(privateFeature);event.sourceRefs.find(r=>r.collection==='locations').hash=hashContent(privateFeature);}
 assert.throws(()=>validateAuthoredBackground(bundle,nextEntries,privateWorld),/公开|公共|public/);
 const noRisk=structuredClone(firstReview.authoredBackground);noRisk.events[0].risks=[];
 assert.throws(()=>validateAuthoredBackground(noRisk,nextEntries,world),/秘密/);
});

test('首次L2请求单列作者事实及风险，候选视角不能替代独立出处审核',()=>{
 const nextEntries=depthEntries(firstReview.base,firstReview,world);
 let count=0;
 for(const entry of nextEntries){
  const context=contextFor(entry,world),event=firstReview.authoredBackground.events.find(e=>e.actors.includes(entry.id));
  if(!event){assert.equal(context.authoredBackground,undefined);continue;}
  count++;
  assert.equal(context.authoredBackground.sourceHash,hashContent(firstReview.authoredBackground));
  assert.deepEqual(context.authoredBackground.events[0].designedFacts,event.designedFacts);
  assert.ok(context.authoredBackground.events[0].privateRisks.length);
  const request=JSON.parse(buildReviewRequest(entry,patchDraft(entry),context).messages[1].content);
  assert.deepEqual(request.publishedFacts.authoredBackground.events[0].designedFacts,event.designedFacts);
  assert.deepEqual(request.publishedFacts.revisions.map(r=>r.path),entry.patches.map(p=>p.path));
  assert.throws(()=>checkIncrementalReview({contradictions:[],reviewedPaths:entry.patches.map(p=>p.path),backgroundReviews:[]},entry,context),/独立事件出处/);
 }
 assert.equal(count,12);
});
