import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {depthEntries,validatePatchResults,patchDraft,applyDepthDraft,verifyUnchanged,validateDraft,contextFor,getPath} from '../tools/npc-depth-content.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import * as design from '../world/design/w1-wt-depth.mjs';

const world=await loadWorld(),ids=new Set(design.patchRows.map(r=>r.id));
const entries=()=>depthEntries(design.patchRows.map(r=>r.before),design,world);

test('苇汀30份原档逐失败叶子补齐，联合独立审计零缺口',()=>{
 assert.equal(ids.size,30);
 assert.deepEqual([...ids].sort(),world.npcs.filter(n=>n.id.startsWith('npc_wt_')&&n.tier==='full').map(n=>n.id).sort());
 assert.equal(design.incrementLimitYuan,3);
 const rows=entries(),merged=validatePatchResults(rows,world);
 assert.equal(merged.npcs.length,world.npcs.length);
 assert.deepEqual(auditNpcDepth(merged).issues.filter(i=>ids.has(i.id)),[]);
 assert.equal(auditNpcDepth(merged).legacyTraits.ok,true);
 for(const row of rows){
  assert.equal(hashContent(world.npcs.find(n=>n.id===row.id)),row.baseHash);
  assert.deepEqual(validateDraft(patchDraft(row),row).errors,[]);
  const after=applyDepthDraft(row.before,patchDraft(row));
  verifyUnchanged(row.before,after,row);
  assert.deepEqual(after.memorySeeds.slice(0,row.before.memorySeeds.length),row.before.memorySeeds);
  for(const term of ['short','mid','long'])for(const [i,goal]of row.before.goals[term].entries()){
   const {steps,...original}=goal,{steps:updatedSteps,...updated}=after.goals[term][i];
   assert.deepEqual(updated,original);
   assert.deepEqual(updatedSteps.map(s=>s.status),steps.map(s=>s.status));
  }
  assert.deepEqual(after.voice.habits,row.before.voice.habits);
  assert.deepEqual(after.voice.samples,row.before.voice.samples);
  assert.deepEqual(after.knowledge.known.slice(0,row.before.knowledge.known.length),row.before.knowledge.known);
  assert.deepEqual(after.relationships.map(({note,...r})=>r),row.before.relationships.map(({note,...r})=>r));
  for(const patch of row.patches)assert.notDeepEqual(getPath(row.before,patch.path),patch.value);
 }
 for(const n of world.npcs.filter(n=>!ids.has(n.id)))assert.deepEqual(merged.npcs.find(p=>p.id===n.id),n);
});

test('作者分组每批3至5人，共同过去双向一致且地方问题仍未解决',()=>{
 const rows=entries(),merged=validatePatchResults(rows,world);
 assert.deepEqual(design.authorBatches.flatMap(b=>b.ids).sort(),[...ids].sort());
 for(const batch of design.authorBatches){
  assert.ok(batch.ids.length>=3&&batch.ids.length<=5);
  assert.ok(world.locations.some(p=>p.id===batch.location));
  for(const person of batch.ids){
   const memory=merged.npcs.find(n=>n.id===person).memorySeeds.at(-1);
   assert.equal(memory.id,batch.memoryId);
   assert.equal(memory.event,batch.event);
   assert.deepEqual(memory.knownBy,batch.ids);
   assert.ok(batch.ids.every(id=>memory.event.includes(world.npcs.find(n=>n.id===id).name)));
   assert.doesNotMatch(memory.event,/已经(?:交付|付款|付清|结清|签署|归还|完成|商定|同意)/);
  }
 }
 const problems=world.settlementProfiles.find(p=>p.id==='loc_bs_weiting').details.problems;
 assert.equal(problems.length,5);
 for(const problem of problems){
  assert.equal(problem.status,'unresolved');
  for(const stakeholder of problem.stakeholders){
   const row=rows.find(r=>r.id===stakeholder.person);
   assert.ok(contextFor(row,world).localProblems.some(p=>p.id===problem.id));
  }
 }
});

test('冻结叶子拒绝身份、财物和合格声音字段改动',()=>{
 for(const path of ['age','inventory','voice.samples[0]','traits[0]']){
  const changed=structuredClone({...design,patchRows:design.patchRows});
  changed.patchRows[0].patches.push({path,value:'越界改动'});
  assert.throws(()=>depthEntries(changed.patchRows.map(r=>r.before),changed,world),/未报错叶子禁止修订/);
 }
});

test('prepare的候选、基础与manifest均绑定冻结设计，正式源保留原档',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/',import.meta.url);
 const read=async name=>JSON.parse(await fs.readFile(new URL(name+'.json',root),'utf8'));
 const [base,foundation,candidate,manifest]=await Promise.all(['base','foundation','candidate','manifest'].map(read));
 assert.deepEqual(base,design.patchRows.map(r=>r.before));
 assert.deepEqual(candidate,entries().map(patchDraft));
 assert.equal(manifest.contract,'audit-patch-v1');
 assert.equal(manifest.design,'design/w1-wt-depth.mjs');
 assert.equal(manifest.root,'drafts/w1/wt-depth');
 assert.equal(manifest.foundationHash,hashContent(foundation));
 assert.equal(foundation.revision,design.revision);
 for(const row of foundation.entries)assert.equal(hashContent(row.before),row.baseHash);
 const source=JSON.parse(await fs.readFile(new URL('source.json',root),'utf8'));
 assert.equal(source.issues.length,design.patchRows.reduce((n,r)=>n+r.issues.length,0));
});
