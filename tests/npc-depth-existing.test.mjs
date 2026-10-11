import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as config from '../world/design/w1-existing-depth.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {legacyTraitsExpected,findNpcRuleWording} from '../tools/npc-profile-validation.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,validateDraft,validatePatchResults,contextFor,buildReviewRequest,getPath,verifyUnchanged} from '../tools/npc-depth-content.mjs';
import {prepareDepth} from '../tools/npc-depth.mjs';
import {publishNpcDepth} from '../tools/publish-npc-depth.mjs';

const world=await loadWorld();
const root=path.resolve('world/drafts/w1/existing-depth');
const design=path.resolve('world/design/w1-existing-depth.mjs');
const entries=depthEntries(config.base,config,world);
const merged=validatePatchResults(entries,world);
const targetIds=new Set(config.scopeAudit.targetIds);
const sources=JSON.parse(await fs.readFile(path.join(root,'source-evidence.json'),'utf8'));

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
