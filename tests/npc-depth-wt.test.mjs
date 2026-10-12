import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {depthEntries,validatePatchResults,patchDraft,applyDepthDraft,verifyUnchanged,validateDraft,contextFor,getPath} from '../tools/npc-depth-content.mjs';
import {hashContent,readApprovedContent} from '../tools/content-pipeline.mjs';
import {fileURLToPath} from 'node:url';
import * as original from '../world/design/w1-wt-depth.mjs';
import * as design from '../world/drafts/w1/wt-depth/sourced/design.mjs';
import {weitingRoster} from '../world/design/w1-villages-weiting.mjs';

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

test('原首批prepare候选、基础与manifest保持冻结，修订不得覆盖旧证据',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/sourced/',import.meta.url);
 const read=async name=>JSON.parse(await fs.readFile(new URL(name+'.json',root),'utf8'));
 const [base,foundation,candidate,manifest]=await Promise.all(['base','foundation','candidate','manifest'].map(read));
 assert.deepEqual(base,design.patchRows.map(r=>r.before));
 assert.deepEqual(candidate,foundation.entries.map(patchDraft));
 assert.equal(manifest.contract,'audit-patch-v1');
 assert.equal(manifest.design,'drafts/w1/wt-depth/sourced/design.mjs');
 assert.equal(manifest.root,'drafts/w1/wt-depth/sourced');
 assert.equal(manifest.foundationHash,hashContent(foundation));
 assert.equal(foundation.revision,design.revision);
 for(const row of foundation.entries)assert.equal(hashContent(row.before),row.baseHash);
 const source=JSON.parse(await fs.readFile(new URL('../source.json',root),'utf8'));
 assert.equal(source.issues.length,design.patchRows.reduce((n,r)=>n+r.issues.length,0));
});

test('来源扩展保持原候选、revision与冻结原档，只投影本人关系及本组旧记忆',()=>{
 assert.equal(design.revision,original.revision);
 assert.equal(design.incrementLimitYuan,original.incrementLimitYuan);
 for(const [i,row]of design.patchRows.entries()){
  const {referenceRelationshipIds,referenceMemoryIds,...unchanged}=row;
  assert.deepEqual(unchanged,original.patchRows[i]);
  assert.deepEqual(referenceRelationshipIds,[row.id]);
  assert.deepEqual(referenceMemoryIds,design.authorBatches.find(b=>b.ids.includes(row.id)).ids);
  const entry=entries()[i],context=contextFor(entry,world);
  for(const person of context.people){
   const source=[...world.npcs,...world.residents].find(p=>p.id===person.id);
   if(person.id===row.id)assert.deepEqual(person.relationships,source.relationships);
   else assert.equal(Object.hasOwn(person,'relationships'),false);
   if(referenceMemoryIds.includes(person.id))assert.deepEqual(person.memorySeeds,source.memorySeeds);
   else assert.equal(Object.hasOwn(person,'memorySeeds'),false);
   assert.equal(Object.hasOwn(person,'secrets'),false);
   assert.equal(Object.hasOwn(person,'knowledge'),false);
  }
 }
});

test('真实首批存在失败且未完成L4，发布读取必须拒绝',async()=>{
 const root=fileURLToPath(new URL('../world/drafts/w1/wt-depth/sourced/',import.meta.url));
 const summary=JSON.parse(await fs.readFile(root+'/summary.json','utf8'));
 assert.equal(summary.total,30);
 assert.ok(summary.manual>0);
 assert.ok(summary.batches.every(batch=>!batch.l4.approved));
 await assert.rejects(()=>readApprovedContent(root,entries(),{revision:design.revision,contextFor:entry=>contextFor(entry,world)}),/尚未完成 L4|人工队列/);
});

test('家庭事项读取名册第7列，性格不能代替具体关系来由',()=>{
 const relatives=new Map(weitingRoster.trim().split(/\r?\n/).map(line=>{const row=line.split('|');return['npc_wt_'+row[1],{traits:row[6],concern:row[7]}];}));
 let checked=0;
 for(const entry of entries())for(const [i,relationship]of entry.before.relationships.entries()){
  const source=relatives.get(relationship.with);if(!source)continue;
  assert.ok(source.concern&&source.concern!==source.traits);
  const note=getPath(entry.facts,`relationships[${i}].note`);
  assert.ok(note.includes('；'+source.concern+'，'),entry.id+'/'+i);
  assert.ok(!note.includes('；'+source.traits+'，'),entry.id+'/'+i);
  checked++;
 }
 assert.equal(checked,70);
});

test('邻人按冻结性别指代，贺芩中期步骤仍核对物主旧补处',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/sourced/',import.meta.url);
 const old=JSON.parse(await fs.readFile(new URL('foundation.json',root),'utf8'));
 let female=0;
 for(const entry of entries())for(const patch of entry.patches.filter(p=>p.path.startsWith('opinions.neighbors'))){
  const index=Number(patch.path.match(/\d+/)[0]),other=world.npcs.find(n=>n.id===entry.before.opinions.neighbors[index].with);
  const previous=old.entries.find(e=>e.id===entry.id).patches.find(p=>p.path===patch.path);
  if(other.sex==='女'){assert.equal(patch.value,previous.value.replace('与他谈','与她谈'));female++;}
  else assert.equal(patch.value,previous.value);
 }
 assert.equal(female,11);
 const heqin=entries().find(e=>e.id==='npc_wt_heqin');
 assert.equal(heqin.facts.goals.mid[0].content,'当面请物主认旧补处');
 assert.equal(heqin.facts.goals.mid[0].steps[0].content,'把两份混记号的席边分别摆给各物主看，请各自指出旧补处，再核对各自认出的部分。');
 assert.equal(heqin.facts.goals.mid[0].steps[0].status,'pending');
 assert.equal(heqin.facts.goals.mid[0].progress,heqin.before.goals.mid[0].progress);
});

test('受控修订只改变真实L2/L4错叶，旧记录与原来源hash保持完整',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/',import.meta.url),read=async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8'));
 const [plan,invalidations,diff,foundation,base,candidate,after]=await Promise.all(['controlled/controlled-plan.json','controlled/l4-invalidations-normalized.json','controlled/patch-diff.json','sourced/foundation.json','sourced/base.json','sourced/candidate.json','controlled/candidate-after.json'].map(read));
 assert.equal(plan.cardId,'T07');assert.equal(plan.revision,foundation.revision);
 assert.equal(plan.foundationHash,hashContent(foundation));assert.equal(plan.baseHash,hashContent(base));assert.equal(plan.candidateHash,hashContent(candidate));
 assert.equal(plan.invalidationHash,hashContent(invalidations));
 assert.equal(diff.changes.length,82);assert.equal(plan.authorized.length,30);
 assert.deepEqual(after,entries().map(patchDraft));
 for(const item of plan.authorized){
  const record=await read('sourced/'+item.id+'.json'),proof=invalidations.records.find(r=>r.id===item.id);
  assert.equal(item.recordHash,hashContent(record));assert.equal(item.draftHash,hashContent(record.draft));assert.equal(item.reviewHash,hashContent(record.review));
  assert.equal(proof.recordHash,item.recordHash);assert.equal(proof.draftHash,item.draftHash);assert.equal(proof.reviewHash,item.reviewHash);
  const findings=[...proof.findings,...record.review.contradictions.filter(r=>r.severity==='hard').map(r=>({path:r.field,quote:r.quote}))];
  const next=after.find(r=>r.id===item.id),prior=candidate.find(r=>r.id===item.id);
  assert.deepEqual(record.draft,prior);
  for(const patch of prior.patches){
   const changed=item.paths.includes(patch.path),value=next.patches.find(p=>p.path===patch.path).value;
   if(changed){assert.notDeepEqual(value,patch.value);assert.ok(findings.some(f=>f.path===patch.path&&JSON.stringify(patch.value).includes(f.quote)));}
   else assert.deepEqual(value,patch.value);
  }
  assert.deepEqual(entries().find(e=>e.id===item.id).issues,foundation.entries.find(e=>e.id===item.id).issues);
 }
 for(const source of plan.sourceHashes){
  const url=new URL(source.file,new URL('sourced/',root)),raw=await fs.readFile(url,'utf8');
  assert.equal(source.hash,hashContent(source.file.endsWith('.mjs')?raw:JSON.parse(raw)));
 }
 assert.equal(world.npcs.filter(n=>n.tier==='full').length,152);
 assert.equal(world.npcs.filter(n=>n.id.startsWith('npc_hw_')&&n.tier==='full').length,32);
});

test('独立新背景与正式来源相容，原候选记忆及私密知情范围保持冻结',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/',import.meta.url);
 const [background,plan]=await Promise.all(['authored-background.json','controlled/controlled-plan.json'].map(file=>fs.readFile(new URL(file,root),'utf8').then(JSON.parse)));
 assert.equal(background.kind,'authored-background');assert.equal(background.revision,design.revision);assert.equal(background.events.length,7);
 const rows=entries();
 for(const event of background.events){
  assert.equal(event.status,'past-but-unresolved');assert.ok(event.network.actors.length>=3&&event.network.actors.length<=5);
  for(const ref of event.sourceRefs){const source=world[ref.collection].find(p=>p.id===ref.id);assert.equal(ref.hash,hashContent(getPath(source,ref.field)));assert.doesNotMatch(ref.field,/^(secrets|knowledge|memorySeeds)/);if(ref.collection==='npcs')assert.ok(ref.publicSpeech);}
  for(const association of event.associations){const entry=rows.find(e=>e.id===association.id),memory=entry.patches.find(p=>p.path===association.path).value;assert.equal(memory.event,event.narrative);assert.deepEqual(memory.knownBy,event.actors);assert.equal(memory.location,event.location);assert.ok(!plan.authorized.find(a=>a.id===entry.id).paths.includes(association.path));}
  for(const actor of event.actors)for(const [i,secret]of world.npcs.find(p=>p.id===actor).secrets.entries())assert.ok(event.risks.some(r=>r.id===actor&&r.field===`secrets[${i}]`&&r.hash===hashContent(secret)));
 }
 const qilu=background.events.find(e=>e.actors.includes('npc_wt_qilu'));
 assert.ok(qilu.sourceRefs.some(r=>r.id==='npc_wt_qilu'&&r.publicSpeech?.includes('一般原则')&&r.publicSpeech.includes('不说、暗示或推断')));
 assert.ok(qilu.risks.some(r=>r.id==='npc_wt_qilu'&&r.reason.includes('不能把旧秘密')));
});
