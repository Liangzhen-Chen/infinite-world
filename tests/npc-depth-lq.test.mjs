import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {validateNpcProfiles,findNpcRuleWording} from '../tools/npc-profile-validation.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,applyDepthDraft,validateDraft,validatePatchResults,contextFor,buildReviewRequest,getPath,validateAuthoredBackground,checkIncrementalReview,verifyUnchanged} from '../tools/npc-depth-content.mjs';
import {prepareNpcDepth,publishNpcDepth} from '../tools/publish-npc-depth.mjs';
import * as design from '../world/design/w1-lq-depth.mjs';
import {liquanRoster} from '../world/design/w1-villages-liquan.mjs';
import {compactReviewRequest} from '../tools/npc-depth-review.mjs';
import {prepareDepthRevision,validateT08ReadbackRevision,reuseReviewedDepthContext} from '../tools/npc-depth.mjs';
import {reopenAllowsId} from '../tools/content-budget.mjs';

const liveWorld=await loadWorld(path.resolve('world'));
const originals=JSON.parse(await fs.readFile(path.resolve('world/drafts/w1/lq-depth/base.json'),'utf8'));
const world={...liveWorld,npcs:liveWorld.npcs.map(n=>originals.find(b=>b.id===n.id)??n)};
const ids=new Set(originals.map(n=>n.id));
const legacyRoot=path.resolve('world/drafts/w1/lq-depth');
const root=path.join(legacyRoot,'author-v2');
const exec=promisify(execFile);
const publicationManifest=path.join(root,'first-review/manifest.json');
const {entries:approvedEntries}=await prepareNpcDepth({manifest:publicationManifest});
// Historical assertions continue to use the frozen author-v2 candidate.
const frozenFoundation=JSON.parse(await fs.readFile(path.join(root,'foundation.json'),'utf8'));
const frozenEntries=frozenFoundation.entries.map(({context,...entry})=>entry);
const frozenDesign={...design,patchRows:frozenEntries};
// Read stopped-stage candidates from their actual record history after reopening.
const stoppedStage=JSON.parse(await fs.readFile(path.resolve('world/drafts/w1/lq-depth/reopen-complete/stopped-report.json'),'utf8'));
const stoppedRows=await Promise.all(design.patchRows.map(async entry=>{const current=JSON.parse(await fs.readFile(path.join(root,'first-review',entry.id+'.json'),'utf8'));const witness=stoppedStage.records.find(r=>r.id===entry.id);const prior=recordedVersion(current,witness.recordHash);assert.ok(prior,'missing stopped-stage history '+entry.id);return{...entry,patches:structuredClone(prior.draft.patches)};}));
const stoppedDesign={...design,patchRows:stoppedRows};
const entries=depthEntries(originals,stoppedDesign,world);
const merged=validatePatchResults(entries,world);
// Original-stage assertions replay the immutable first proof's old records.
let firstProof=JSON.parse(await fs.readFile(path.join(root,'first-review/incremental-proof.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e;}));
while(firstProof?.previousProof)firstProof=firstProof.previousProof;
const originalRecord=async id=>structuredClone(firstProof?.oldRecords?.find(r=>r.id===id)??JSON.parse(await fs.readFile(path.join(root,'first-review',id+'.json'),'utf8')));
const offlineCandidate=JSON.parse(await fs.readFile(path.join(legacyRoot,'reopen-offline/candidate-after.json'),'utf8'));
const offlineDesign={...frozenDesign,patchRows:frozenEntries.map(e=>({...e,patches:offlineCandidate.find(d=>d.id===e.id).patches}))};

test('砾泉正式30人等于已审批完整档，全体152个full深度及规则措辞零缺口，原17traits保留',()=>{
 assert.equal(approvedEntries.length,30);assert.equal(liveWorld.npcs.filter(n=>n.tier==='full').length,152);
 assert.equal(liveWorld.residents.length,294);assert.deepEqual(liveWorld.npcs.map(n=>n.id),world.npcs.map(n=>n.id));
 for(const entry of approvedEntries){
  const current=liveWorld.npcs.find(n=>n.id===entry.id);
  assert.deepEqual(current,entry.facts);verifyUnchanged(entry.before,current,entry);
  for(const field of ['coins','inventory','secrets'])assert.deepEqual(current[field],entry.before[field]);
  assert.deepEqual(current.memorySeeds.slice(0,entry.before.memorySeeds.length),entry.before.memorySeeds);
 }
 const audit=auditNpcDepth(liveWorld);assert.equal(audit.checked,152);assert.deepEqual(audit.issues,[]);assert.equal(audit.legacyTraits.ok,true);
 assert.deepEqual(liveWorld.npcs.filter(n=>n.tier==='full').flatMap(findNpcRuleWording),[]);
});

test('砾泉冻结原档首次预演零写入，正式发布闭合6事件30人且仅更新砾泉',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'t86-publication-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const worldRoot=path.join(temp,'world');
 for(const dir of ['meta','geo','people','lore','design'])await fs.cp(path.resolve('world',dir),path.join(worldRoot,dir),{recursive:true});
 await fs.mkdir(path.join(temp,'tools'));
 for(const file of ['content-pipeline.mjs','content-budget.mjs'])await fs.copyFile(path.resolve('tools',file),path.join(temp,'tools',file));
 await fs.cp(legacyRoot,path.join(worldRoot,'drafts/w1/lq-depth'),{recursive:true});
 const baseline=path.join(worldRoot,'people/baseline.json');await fs.writeFile(baseline,JSON.stringify(world.npcs));
 const manifest=path.join(worldRoot,'drafts/w1/lq-depth/author-v2/first-review/manifest.json'),before=await fs.readFile(baseline);
 const preview=await publishNpcDepth({manifest});
 assert.equal(preview.published,false);assert.deepEqual(preview.changed,['people/baseline.json']);
 assert.deepEqual(preview.amendedNpcIds.slice().sort(),[...ids].sort());assert.deepEqual(preview.selectedQuality.issues,[]);
 assert.equal(preview.eventClosure.length,30);assert.equal(new Set(preview.eventClosure.map(e=>e.eventId)).size,6);
 assert.ok(preview.eventClosure.every(e=>e.closed));assert.deepEqual(await fs.readFile(baseline),before);
 assert.deepEqual(await publishNpcDepth({manifest,publish:true}),{...preview,published:true});
 assert.deepEqual(await loadWorld(worldRoot),liveWorld);
});

test('砾泉已发布完整卡重发零写入，不重复追加共享记忆',async()=>{
 const baseline=path.resolve('world/people/baseline.json'),bytes=await fs.readFile(baseline),stat=await fs.stat(baseline);
 for(const publish of [false,true]){
  const repeat=await publishNpcDepth({manifest:publicationManifest,publish});
  assert.equal(repeat.published,publish);assert.deepEqual(repeat.changed,[]);assert.deepEqual(repeat.changes,[]);
  assert.deepEqual(repeat.eventClosure,[]);assert.equal(repeat.baselineSourceHash,repeat.baselineResultHash);
  assert.deepEqual(repeat.selectedQuality.issues,[]);assert.deepEqual(repeat.globalQuality.issues,[]);
  assert.equal(repeat.amendedNpcIds.length,30);assert.equal(repeat.modelCalls,0);
  assert.deepEqual(await fs.readFile(baseline),bytes);assert.equal((await fs.stat(baseline)).mtimeMs,stat.mtimeMs);
 }
});

test('砾泉全30人按冻结408项实际审计补缺，合并后没有字段或规则措辞缺口',()=>{
 assert.equal(originals.length,30);
 assert.equal(design.patchRows.length,30);
 assert.deepEqual(new Set(design.patchRows.map(n=>n.id)),ids);
 const expected=auditNpcDepth(world).issues.filter(n=>ids.has(n.id)).map(({id,field,code})=>({id,field,code}));
 assert.equal(expected.length,408);
 assert.deepEqual(design.patchRows.flatMap(n=>n.issues),expected);
 assert.deepEqual(auditNpcDepth(merged).issues.filter(n=>ids.has(n.id)),[]);
 assert.deepEqual(validateNpcProfiles(merged).filter(error=>[...ids].some(id=>error.includes(id))),[]);
 assert.equal(design.incrementLimitYuan,3);
});

test('没有改动其他村、已合格兄弟叶子、原有记忆与角色身份财物',()=>{
 for(const n of world.npcs.filter(n=>!ids.has(n.id)))assert.deepEqual(merged.npcs.find(x=>x.id===n.id),n);
 for(const entry of entries){
  const {before,facts}=entry;
  assert.deepEqual(validateDraft(patchDraft(entry),entry).errors,[]);
  for(const key of Object.keys(before))if(!['voice','knowledge','goals','memorySeeds','relationships','opinions'].includes(key))assert.deepEqual(facts[key],before[key],before.id+'/'+key);
  assert.deepEqual(facts.knowledge.known[0],before.knowledge.known[0]);
  assert.equal(facts.knowledge.known.length,3);
  assert.deepEqual(facts.memorySeeds.slice(0,-1),before.memorySeeds);
  const {register:oldRegister,...oldVoice}=before.voice,{register,...voice}=facts.voice;
  assert.deepEqual(voice,oldVoice);assert.notEqual(register,oldRegister);
  for(const term of ['short','mid','long']){
   const {steps:oldSteps,...oldGoal}=before.goals[term][0],{steps,...goal}=facts.goals[term][0];
   assert.deepEqual(goal,oldGoal);assert.deepEqual(steps.map(s=>s.status),oldSteps.map(s=>s.status));
   assert.equal(steps[0].status,'pending');assert.notEqual(steps[0].content,goal.content);
  }
  for(const [i,r] of before.relationships.entries()){
   const {note,...unchanged}=r,{note:newNote,...next}=facts.relationships[i];assert.deepEqual(next,unchanged);
   if(r.type!=='同村日常往来')assert.match(newNote,/各自保有财物/);
  }
  assert.equal(facts.relationships.length,before.relationships.length);
  for(const key of ['factions','magic','adventurers'])assert.equal(facts.opinions[key],before.opinions[key]);
  for(const [i,n] of before.opinions.neighbors.entries()){
   assert.equal(facts.opinions.neighbors[i].with,n.with);
   if(!entry.issues.some(issue=>issue.field===`opinions.neighbors[${i}].view`))assert.deepEqual(facts.opinions.neighbors[i],n);
  }
  assert.deepEqual(findNpcRuleWording(facts),[]);
 }
});

test('六组每组五人共同过去双边一致，不传播原秘密且地方问题仍未解决',()=>{
 assert.equal(design.groups.length,6);
 assert.deepEqual(new Set(design.groups.flatMap(g=>g.participants.map(key=>'npc_lq_'+key))),ids);
 const allProblems=world.settlementProfiles.flatMap(p=>p.details?.problems??[]);
 for(const group of design.groups){
  assert.equal(group.participants.length,5);
  assert.ok(world.locations.some(l=>l.id===group.location));
  const memories=group.participants.map(key=>entries.find(e=>e.id==='npc_lq_'+key).facts.memorySeeds.at(-1));
  for(const m of memories)assert.deepEqual(m,memories[0]);
  for(const problemId of group.problemIds){const problem=allProblems.find(p=>p.id===problemId);assert.equal(problem.status,'unresolved');}
  assert.match(group.event,/没有|未|尚/);
 }
 for(const e of entries)assert.deepEqual(e.facts.secrets,e.before.secrets);
 const oldMark=entries.find(e=>e.id==='npc_lq_shenshu').facts;
 assert.match(oldMark.knowledge.unknown[0],/缺|半/);
 assert.match(oldMark.knowledge.unknown[0],/亲见|残笔|哪一笔/);
 assert.match(oldMark.memorySeeds.at(-1).event,/没有补全残字/);
});

test('L2输入覆盖所有新叶子及出处，规则式邻居意见随本次候选进入审核',()=>{
 let opinionCount=0;
 for(const e of entries){
  const context=contextFor(e,world),request=buildReviewRequest(e,patchDraft(e),context);
  const input=JSON.parse(request.messages[1].content);
  assert.deepEqual(input.publishedFacts.revisions,context.revisions);
  for(const patch of e.patches){
   const row=context.revisions.find(r=>r.path===patch.path);
   assert.deepEqual(row.after,patch.value);
   assert.deepEqual(row.before,getPath(e.before,patch.path)??null);
   if(patch.path.startsWith('opinions.neighbors'))opinionCount++;
  }
  const g=design.groups.find(g=>g.participants.includes(e.id.slice(7)));
  assert.ok(context.places.some(l=>l.id===g.location));
  for(const problemId of g.problemIds.filter(problemId=>world.settlementProfiles.flatMap(p=>p.details?.problems??[]).find(p=>p.id===problemId)?.stakeholders.some(s=>s.person===e.id)))assert.ok(context.localProblems.some(p=>p.id===problemId));
 }
 assert.equal(opinionCount,24);
});

test('补丁合同拒绝未报错叶子、已存在知识和原秘密的改写',()=>{
 for(const patch of [{path:'coins',value:999},{path:'knowledge.known[0].fact',value:'栾佩已确认旧标缺字。'},{path:'voice.samples[0]',value:'新的台词'},{path:'secrets[0].knownBy',value:[...ids]}]){
  const config={revision:design.revision,patchRows:structuredClone(design.patchRows)};
  config.patchRows[0].patches.push(patch);
  assert.throws(()=>depthEntries(originals,config,world),/未报错/);
 }
 const bad={revision:design.revision,patchRows:structuredClone(design.patchRows)};
 bad.patchRows[0].baseHash='obsolete';assert.throws(()=>depthEntries(originals,bad,world),/baseHash/);
});

test('修订后旧prepare CLI两次拒绝覆盖冻结历史，零模型零正式写入',async()=>{
 const baseline=path.resolve('world/people/baseline.json'),baselineHash=hashContent(await fs.readFile(baseline,'utf8'));
 const files=['base.json','foundation.json','candidate.json','manifest.json','author-source-checklist.json'];
 const snapshots=await Promise.all(files.map(async file=>({file,hash:hashContent(await fs.readFile(path.join(root,file),'utf8')),mtime:(await fs.stat(path.join(root,file))).mtimeMs})));
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 for(let i=0;i<2;i++){
  await assert.rejects(exec(process.execPath,['tools/npc-depth.mjs','--design','world/design/w1-lq-depth.mjs','--root',root,'--budget-root',path.join(root,'not-an-allocated-budget'),'--card','T08','--prepare'],{env}),/骨架或引用已变/);
 }
 assert.equal(hashContent(await fs.readFile(baseline,'utf8')),baselineHash);
 for(const old of snapshots){assert.equal(hashContent(await fs.readFile(path.join(root,old.file),'utf8')),old.hash);assert.equal((await fs.stat(path.join(root,old.file))).mtimeMs,old.mtime);}
 const candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
 assert.deepEqual(candidate,frozenEntries.map(patchDraft));
 for(const artifact of ['budget.json','allocation.json','terminal.json','batch-0.json',entries[0].id+'.json'])await assert.rejects(fs.stat(path.join(root,artifact)),/ENOENT/);
 const report=JSON.parse(await fs.readFile(path.join(root,'offline-report.json'),'utf8'));
 assert.equal(report.stage,'prepared-offline');assert.equal(report.modelCalls,0);assert.equal(report.formalPublished,false);
 assert.deepEqual(report.pending,['T25 explicit background opt-in','L2','L4','T11 publication']);
});

test('原v1完整hash证据保留，新版18处实际变化逐id/path对应原目标或正式家属处境',async()=>{
 const preserved=JSON.parse(await fs.readFile(path.join(legacyRoot,'offline-v1-evidence/original-hashes.json'),'utf8'));
 assert.equal(preserved.sourceCommit,'89546d6');
 for(const f of preserved.files){
  const text=await fs.readFile(path.join(legacyRoot,f.path),'utf8');assert.equal(f.originalLineEnding,'LF');
  for(const checkoutText of [text.replace(/\r\n/g,'\n'),text.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n')]){
   const bytes=Buffer.from(checkoutText.replace(/\r\n/g,'\n'),'utf8');assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);
  }
 }
 const report=JSON.parse(await fs.readFile(path.join(root,'author-source-checklist.json'),'utf8'));
 assert.equal(report.changes.length,18);assert.equal(report.personChecks.length,30);assert.equal(report.patchSources.length,384);
 const sourcePeople=[...world.npcs,...world.residents];
 const roster=liquanRoster.trim().split(/\r?\n/).map(r=>r.split('|'));
 assert.ok(roster.every(r=>r.length===9));
 assert.deepEqual(report.rosterColumns.traits,6);assert.deepEqual(report.rosterColumns.concern,7);
 for(const person of report.personChecks)for(const reference of person.references){
  const actual=sourcePeople.find(p=>p.id===reference.id);assert.equal(reference.name,actual.name);assert.equal(reference.sex,actual.sex);assert.equal(reference.occupation,actual.occupation);
  const row=roster.find(r=>'npc_lq_'+r[1]===reference.id);if(row){assert.equal(reference.rosterConcern,row[7]);assert.equal(reference.rosterTraits,row[6]);assert.equal(reference.formalConcern,actual.currentConcern);}
 }
 const original=JSON.parse(await fs.readFile(path.join(legacyRoot,'candidate.json'),'utf8'));
 for(const change of report.changes){
  const entry=frozenEntries.find(e=>e.id===change.id),source=sourcePeople.find(p=>p.id===(change.originalSource.id??change.id));
  assert.deepEqual(getPath(source,change.originalSource.field),change.originalSource.value);
  assert.equal(original.find(e=>e.id===change.id).patches.find(p=>p.path===change.path).value,change.previous);
  assert.equal(entry.patches.find(p=>p.path===change.path).value,change.revised);
  assert.notEqual(change.revised,change.previous);
 }
 for(const record of report.sourceRecords){const actual=sourcePeople.find(p=>p.id===record.id);for(const key of Object.keys(record))assert.deepEqual(record[key],actual[key]);}
});

test('作者回归检查阻止中期步骤改谈另一事务，家属等待状态不再写成催促',()=>{
 // These regressions catch observed author mistakes. They are not an L4 score.
 const midRegressions={chuyin:/逐段.*(?:水痕|渗湿)/,ningye:/清路.*松碎石.*移出脚路/,ganqi:/带班.*提前.*灶房/,minghe:/清走.*坐下.*空地/,tanyu:/两户物主.*绳记.*洗晒前.*留下/,yike:/旧结.*约定.*不再解动/,mogu:/歇息.*复工.*两个时点/};
 for(const [key,pattern] of Object.entries(midRegressions))assert.match(entries.find(e=>e.id==='npc_lq_'+key).facts.goals.mid[0].steps[0].content,pattern);
 const corrected={shenshu:[1,/茄敏迟迟不收/],fengji:[1,/蔓桂不追问/],huaniu:[1,/庞果.*任待检物占着门口/]};
 for(const [key,[index,pattern]] of Object.entries(corrected)){const note=entries.find(e=>e.id==='npc_lq_'+key).facts.relationships[index].note;assert.match(note,pattern);assert.doesNotMatch(note,/催/);}
});

test('六次共同会面均标明新增背景，旧个人来源不充当会面证明或L2/L4凭证',async()=>{
 const report=JSON.parse(await fs.readFile(path.join(root,'author-source-checklist.json'),'utf8'));
 assert.equal(report.stage,'author-precheck-only');assert.equal(report.modelCalls,0);
 assert.equal(report.newSharedBackgrounds.length,6);
 for(const background of report.newSharedBackgrounds){
  assert.equal(background.classification,'new-public-background');assert.equal(background.existingJointExperienceSource,null);
  assert.equal(background.reviewStatus,'pending-T25-opt-in-L2-L4');assert.ok(background.privateRisk);
 }
 for(const e of entries){
  const oldSource=contextFor(e,world).people.find(p=>p.id===e.id);
  assert.deepEqual(oldSource.memorySeeds,e.before.memorySeeds);assert.deepEqual(oldSource.relationships,e.before.relationships);
  const newMemory=e.patches.find(p=>p.path.startsWith('memorySeeds['));
  assert.equal(report.patchSources.find(p=>p.id===e.id&&p.path===newMemory.path).kind,'new-public-background');
  assert.equal(report.patchSources.find(p=>p.id===e.id&&p.path==='knowledge.known[2]').kind,'new-public-background');
 }
});

const firstReviewRoot=path.join(root,'first-review');
const backgroundFile=path.join(firstReviewRoot,'authored-background.json');
const background=JSON.parse(await fs.readFile(backgroundFile,'utf8'));
const backgroundEntries=depthEntries(originals,{...frozenDesign,authoredBackground:background},world);
const revisedBackgroundEntries=depthEntries(originals,{...stoppedDesign,authoredBackground:background},world);
const offlineBackgroundEntries=depthEntries(originals,{...offlineDesign,authoredBackground:background},world);

test('T25官方纯验证接受六个独立未审背景，原出处和30人视角逐项冻结',()=>{
 const source=validateAuthoredBackground(background,entries,world);
 assert.equal(source.events.length,6);assert.equal(background.reviewStatus,'pending-independent-L2-L4');
 assert.equal(new Set(source.events.flatMap(e=>e.actors)).size,30);
 for(const event of source.events){
  assert.equal(event.network.actors.length,5);assert.equal(event.actors.length,5);
  const p=event.network.problemRef;
  assert.equal(p.collection,'settlementProfiles');
  const publishedProblem=getPath(world.settlementProfiles.find(row=>row.id===p.id),p.field);
  assert.equal(publishedProblem.public,true);assert.ok(publishedProblem.id.startsWith('problem_lq_'));
  assert.equal(p.hash,hashContent(publishedProblem));
  for(const r of event.sourceRefs){
   assert.equal(r.hash,hashContent(getPath(world[r.collection].find(row=>row.id===r.id),r.field)));
   if(r.collection==='npcs'){assert.equal(r.visibility,'private');assert.ok(r.publicSpeech);assert.doesNotMatch(r.field,/secrets|memorySeeds|knowledge|privateFact/);}
  }
  for(const actorId of event.actors){
   const actor=world.npcs.find(n=>n.id===actorId);assert.ok(event.narrative.includes(actor.name));
   for(const [i,secret] of actor.secrets.entries())assert.ok(event.risks.some(r=>r.id===actorId&&r.field===`secrets[${i}]`&&r.hash===hashContent(secret)));
   assert.ok(event.risks.some(r=>r.id===actorId&&r.field==='authoredFacts.privateFact'&&r.hash===hashContent(actor.authoredFacts.privateFact)));
   const association=event.associations.find(a=>a.id===actorId),entry=entries.find(e=>e.id===actorId);
   assert.equal(association.factsHash,hashContent(event.designedFacts));assert.ok(association.viewpoint);
   const memory=entry.patches.find(p=>p.path===association.path).value;
   assert.equal(memory.location,event.location);assert.equal(memory.event,association.narrative);assert.deepEqual(new Set(memory.knownBy),new Set(event.actors));
  }
 }
 for(const entry of backgroundEntries)assert.deepEqual(patchDraft(entry),patchDraft(frozenEntries.find(e=>e.id===entry.id)));
 validateAuthoredBackground(background,revisedBackgroundEntries,world);
});

test('首审出处拒绝候选自证、过期原字段和漏秘密风险，L2请求必须另审背景',()=>{
 for(const change of [b=>b.events[0].sourceRefs[0].collection='candidate',b=>b.events[0].sourceRefs[0].hash='stale',b=>b.events[0].risks.splice(0,1),b=>b.events[0].sourceRefs.find(r=>r.collection==='npcs').visibility='public']){
  const invalid=structuredClone(background);change(invalid);assert.throws(()=>validateAuthoredBackground(invalid,entries,world));
 }
 for(const entry of backgroundEntries){
  const context=contextFor(entry,world),request=buildReviewRequest(entry,patchDraft(entry),context),payload=JSON.parse(request.messages[1].content);
  assert.equal(payload.publishedFacts.authoredBackground.sourceHash,hashContent(background));
  const event=payload.publishedFacts.authoredBackground.events[0];
  assert.deepEqual(event.originalSources.map(r=>r.hash),background.events.find(e=>e.id===event.id).sourceRefs.map(r=>r.hash));
  assert.equal(event.privateRisks.length,event.risks.length);
  assert.match(request.messages[0].content,/独立审核/);
  // No mock approval is saved. A response that only approves the candidate is
  // insufficient because it has not reviewed the independent background.
  assert.throws(()=>checkIncrementalReview({contradictions:[],reviewedPaths:entry.patches.map(p=>p.path),backgroundReviews:[]},entry,context),/缺独立事件出处L2/);
 }
});

test('T26实际full及compact请求引用现存字段，严格三字段fixture覆盖全部候选与出处任务',()=>{
 for(const entry of backgroundEntries){
  const context=contextFor(entry,world),full=buildReviewRequest(entry,patchDraft(entry),context),compact=compactReviewRequest(full);
  for(const request of [full,compact]){
   const payload=JSON.parse(request.messages[1].content);
   assert.deepEqual(payload.draft,patchDraft(entry));
   for(const field of ['sex','workplace','notes'])assert.deepEqual(payload.skeleton.before[field],entry.before[field]);
   assert.match(request.messages[0].content,/draft\.patches/);assert.match(request.messages[0].content,/skeleton\.before/);assert.match(request.messages[0].content,/publishedFacts/);
   const tasks=JSON.parse(request.messages[0].content.split('本条待审清单：')[1].split('。')[0]);
   assert.deepEqual(tasks.patchPaths,entry.patches.map(p=>p.path));
   assert.deepEqual(tasks.backgrounds.map(b=>b.eventId),context.authoredBackground.events.map(e=>e.id));
   for(const event of payload.publishedFacts.authoredBackground.events)for(const ref of event.originalSources)assert.deepEqual(ref.value,getPath(world[ref.collection].find(s=>s.id===ref.id),ref.field));
   const fixture={contradictions:[],reviewedPaths:tasks.patchPaths,backgroundReviews:tasks.backgrounds.map(b=>({eventId:b.eventId,sourceHash:b.sourceHash,reviewedRiskPaths:b.riskPaths,contradictions:[]}))};
   assert.deepEqual(checkIncrementalReview(fixture,entry,context),[]);
   for(const invalidate of [r=>delete r.backgroundReviews,r=>r.reviewedPaths.pop(),r=>r.reviewedPaths.push(r.reviewedPaths[0]),r=>r.backgroundReviews[0].reviewedRiskPaths.pop(),r=>r.unreviewed=true]){
    const invalid=structuredClone(fixture);invalidate(invalid);assert.throws(()=>checkIncrementalReview(invalid,entry,context));
   }
  }
  const trimmed=JSON.parse(compact.messages[1].content);assert.equal(trimmed.skeleton.facts,undefined);assert.equal(trimmed.publishedFacts.revisions,undefined);
  assert.deepEqual(trimmed.publishedFacts.authoredBackground,JSON.parse(full.messages[1].content).publishedFacts.authoredBackground);
 }
});

test('性别补件只包含实际代词所指的16人，字段逐值匹配且没有扩入私人经历',async()=>{
 const report=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'T26-contract-preflight.json'),'utf8'));
 assert.equal(report.modelCalls,0);assert.equal(report.referencedSexPeople,16);assert.equal(report.sourceRefsChecked,84);
 assert.equal(report.sourceHash,hashContent(background));
 assert.equal(report.manifestHash,hashContent(JSON.parse(await fs.readFile(path.join(legacyRoot,'complete-003/prior-manifest.json'),'utf8'))));
 const sourcePeople=[...world.npcs,...world.residents];
 for(const appendix of report.sexSupplements){
  const data=JSON.parse(await fs.readFile(path.join(firstReviewRoot,appendix.file),'utf8'));
  assert.deepEqual(Object.keys(data).sort(),['reviewBoundary','sourceRecords']);
  assert.ok(data.sourceRecords.some(r=>r.id===appendix.id));
  for(const record of data.sourceRecords){
   assert.ok(Object.keys(record).every(k=>['id','name','sex'].includes(k)));
   const actual=sourcePeople.find(p=>p.id===record.id);for(const key of Object.keys(record))assert.deepEqual(record[key],actual[key]);
  }
 }
 assert.equal(report.firstPipelineAutomaticallyAppendsSupplements,false);
 assert.equal(report.fullCeilingYuan,13.601916);assert.equal(report.compactL2CeilingYuan,11.63691);
 assert.equal(report.costBasis,'UTF-8 bytes as conservative token ceiling; not measured API usage');
});

test('修订后官方旧首审prepare拒绝覆盖，author-v2及原记忆没有改动',async()=>{
 const optIn=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'opt-in-evidence.json'),'utf8'));
 assert.equal(optIn.cardId,'T08');assert.equal(optIn.modelCalls,0);assert.deepEqual(optIn.candidateChanges,[]);
 for(const old of optIn.previousFiles)assert.equal(hashContent(JSON.parse(await fs.readFile(path.resolve(firstReviewRoot,old.path),'utf8'))),old.contentHash);
 const manifest=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'manifest.json'),'utf8'));
 const activeBackgroundFile=path.resolve('world',manifest.authoredBackground);
 const files=['base.json','candidate.json','foundation.json','manifest.json','authored-background.json',path.relative(firstReviewRoot,activeBackgroundFile)];
 const frozen=await Promise.all(files.map(async name=>({name,hash:hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,name),'utf8'))),mtime:(await fs.stat(path.join(firstReviewRoot,name))).mtimeMs})));
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 await assert.rejects(exec(process.execPath,['tools/npc-depth.mjs','--design','world/design/w1-lq-depth.mjs','--root',firstReviewRoot,'--authored-background',backgroundFile,'--source-evidence-map',path.join(firstReviewRoot,'source-evidence-map.json'),'--compact-request','--budget-root',path.join(firstReviewRoot,'no-allocated-budget'),'--card','T08','--prepare'],{env}),/双方事件事实不一致或超出处/);
 for(const old of frozen){assert.equal(hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,old.name),'utf8'))),old.hash);assert.equal((await fs.stat(path.join(firstReviewRoot,old.name))).mtimeMs,old.mtime);}
 assert.equal(manifest.authoredBackgroundHash,hashContent(JSON.parse(await fs.readFile(activeBackgroundFile,'utf8'))));
 assert.equal(hashContent(background),optIn.sourceHash);
 const candidate=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'candidate.json'),'utf8'));
 assert.deepEqual(candidate,JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8')));
 for(const entry of backgroundEntries)assert.deepEqual(entry.facts.memorySeeds.slice(0,-1),entry.before.memorySeeds);
 // The frozen opt-in remains historical; subsequent official review records
 // live beside it and must not replace the original candidate/source files.
 await assert.rejects(fs.stat(path.join(firstReviewRoot,'budget.json')),/ENOENT/);
});

test('T45官方首审预检冻结原证据，实际附件进入完整请求且逐请求最终UTF8预留合法',async()=>{
 const report=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'T45-official-preflight.json'),'utf8'));
 assert.equal(report.modelCalls,0);assert.equal(report.l2Approved,false);assert.equal(report.l1,'passed');
 assert.equal(report.entries,30);assert.equal(report.changedLeaves,384);assert.equal(report.supplements,15);assert.equal(report.sexPeople,16);
 assert.equal(report.eventIds.length,6);assert.equal(report.budgetBefore.card.limitYuan,3);
 assert.equal(report.budgetBefore.spentYuan,7.947071199999995);assert.equal(report.budgetBefore.reservedYuan,0.08373599999999998);
 assert.deepEqual(report.budgetBefore.previousRequests,[]);
 for(const frozen of report.frozen){
  const raw=await fs.readFile(frozen.file==='design/w1-lq-depth.mjs'?path.join(legacyRoot,'reopen-offline/original-design.mjs.txt'):frozen.file==='drafts/w1/lq-depth/author-v2/first-review/manifest.json'?path.join(legacyRoot,'complete-003/prior-manifest.json'):path.resolve('world',frozen.file),'utf8');
  assert.equal(createHash('sha256').update(raw.replace(/\r\n/g,'\n')).digest('hex'),frozen.sha256LF);
  if(frozen.contentHash)assert.equal(hashContent(JSON.parse(raw)),frozen.contentHash);
 }
 const map=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'source-evidence-map.json'),'utf8'));
 assert.equal(hashContent(map),report.sourceEvidenceMapHash);
 const registry=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'first-source-evidence.json'),'utf8'));
 assert.equal(hashContent(registry),report.registrationHash);assert.equal(registry.compactRequest,true);
 let total=0;
 for(const row of report.requests){
  const entry=backgroundEntries.find(e=>e.id===row.id),context=contextFor(entry,world);
  assert.deepEqual(row.paths,entry.patches.map(p=>p.path));
  const source=map[row.id]?JSON.parse(await fs.readFile(path.join(firstReviewRoot,map[row.id]),'utf8')):null;
  for(const phase of ['draft','full','compact']){
   const body=row[phase].request;
   if(source)assert.deepEqual(JSON.parse(body.messages.at(-1).content),source);
   const encoded={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body};
   assert.equal(Buffer.byteLength(JSON.stringify(encoded)),row[phase].utf8Bytes);
   assert.equal((row[phase].utf8Bytes*2+encoded.max_tokens*8)/1e6,row[phase].ceilingYuan);
   assert.ok(row[phase].ceilingYuan<=3);
  }
  const payload=JSON.parse(row.compact.request.messages[1].content);
  assert.deepEqual(payload.skeleton.before,entry.before);assert.deepEqual(payload.draft,patchDraft(entry));
  assert.deepEqual(payload.publishedFacts.authoredBackground,context.authoredBackground);
  assert.equal(payload.skeleton.facts,undefined);assert.equal(payload.publishedFacts.revisions,undefined);
  total=total+row.draft.ceilingYuan+row.compact.ceilingYuan;
 }
 assert.equal(total,report.totalCompactDraftCeilingYuan);assert.equal(report.perRequestBudgetSufficient,true);
});

test('真实首审按原卡结算并保留未过状态、来源缺口及provider原文留证限制',async()=>{
 const read=name=>name.startsWith('npc_lq_')?originalRecord(name):fs.readFile(path.join(firstReviewRoot,name+'.json'),'utf8').then(JSON.parse);
 const report=await read('first-real-review-report'),gaps=await read('closure-gap-report'),terminal=await read('terminal');
 assert.equal(terminal.status,'finished');assert.deepEqual(report.summary,{total:30,passed:17,manual:4,pending:9});
 assert.equal(report.l2AllPassed,false);assert.equal(report.l4Approved,false);assert.equal(report.formalWrite,false);
 assert.equal(gaps.completed,false);assert.equal(gaps.publicationPreviewRun,false);
 assert.equal(gaps.candidateL1.offline,30);assert.equal(gaps.candidateL1.actualModelDrafts,25);assert.deepEqual(gaps.candidateL1.errors,[]);
 const requests=Object.values(terminal.budgetAfter.requests).filter(r=>r.card==='T08');
 assert.equal(requests.length,80);assert.equal(requests.filter(r=>r.status==='settled').length,80);assert.deepEqual(report.unknownRequests,[]);
 let cost=0;for(const request of requests){const u=request.measurement.usage;const computed=((u.prompt_cache_hit_tokens??0)*.04+(u.prompt_cache_miss_tokens??u.prompt_tokens-(u.prompt_cache_hit_tokens??0))*2+u.completion_tokens*8)/1e6;assert.equal(computed,request.costUpperYuan);assert.ok(request.costUpperYuan<=request.reservedYuan);cost+=computed;}
 assert.ok(Math.abs(cost-2.87060744)<1e-10);assert.ok(Math.abs(report.actualCostUpperYuan-cost)<1e-10);
 assert.equal(terminal.budgetAfter.cards.T08.limitYuan,3);assert.equal(terminal.budgetAfter.cards.T08.reservedYuan,0);
 assert.ok(gaps.remainingCardYuan<gaps.minimumBlockedReviewCeilingYuan);
 for(const [id,request] of Object.entries(terminal.budgetBefore.requests))assert.deepEqual(terminal.budgetAfter.requests[id],request);
 for(const row of report.rows){const actual=await read(row.id);assert.equal(row.status,actual.status);assert.equal(row.draftHash,actual.draft?hashContent(actual.draft):null);assert.equal(row.reviewHash,actual.review?hashContent(actual.review):null);if(actual.draft)assert.deepEqual(actual.draft,patchDraft(backgroundEntries.find(e=>e.id===row.id)));if(row.status==='manual')assert.equal(row.attempts,3);}
 for(const finding of report.sourceFindings){const source=world[finding.source.collection].find(p=>p.id===finding.source.id);assert.equal(finding.source.value,source.currentConcern);assert.equal(finding.source.valueHash,hashContent(source.currentConcern));assert.equal(finding.l4Approved,false);}
 assert.equal(report.sourceFindings.length,6);
 assert.deepEqual(gaps.sharedToolFindings.map(f=>f.code),['frozen-draft-retries','continue-after-entry-budget-block','earlier-provider-response-gap']);
 assert.ok(Math.abs(gaps.sharedToolFindings[1].costUpperYuan-.108236)<1e-10);
 assert.equal(gaps.sharedToolFindings[2].affectedManualIds.filter(r=>r.finalOriginalProviderReviewAvailable).length,3);
 const stopped=JSON.parse(await fs.readFile(path.join(legacyRoot,'reopen-complete/stopped-report.json'),'utf8'));
 assert.equal(stopped.l4.approved,false);assert.equal(stopped.l4.wholeCardReadingAndScoringRegistered,false);
});

const reopenRoot=path.join(legacyRoot,'reopen-offline');
const reopened=async name=>JSON.parse(await fs.readFile(path.join(reopenRoot,name+'.json'),'utf8'));

test('六处真实家庭错误失效且未变L2复用，担忧不会变成已知秘密或已发生对话',async()=>{
 const report=await reopened('offline-report'),plan=await fs.readFile(path.join(legacyRoot,'reopen-complete/pre-source-witness-plan.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return reopened('controlled-plan');throw e;}),diff=await reopened('patch-diff');
 const first=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'first-real-review-report.json'),'utf8'));
 assert.equal(plan.planningId,'user-reopen-20261012-01');assert.equal(plan.authorizationId,plan.planningId);
 assert.equal(plan.cardId,'T08');assert.equal(plan.revision,design.revision);assert.equal(report.planHash,hashContent(plan));
 const expected={luanpei:[0,/张嘴又合上/],yunxiu:[1,/等女儿肯开口/],jushu:[0,/少说话/],qinglan:[0,/不敢当面劝/],yike:[0,/先不说话/],nieya:[1,/怕挪动.*绕桌找地方/]};
 for(const [key,[index,pattern]] of Object.entries(expected)){
  const id='npc_lq_'+key,entry=offlineBackgroundEntries.find(e=>e.id===id),field=`relationships[${index}].note`;
  const change=diff.find(c=>c.id===id&&c.path===field);assert.ok(change);
  assert.match(entry.facts.relationships[index].note,pattern);
  assert.doesNotMatch(entry.facts.relationships[index].note,/争论|催|常商量|已经讨论/);
  assert.equal(change.sourceQuotes[0].value,first.sourceFindings.find(f=>f.id===id).source.value);
  assert.ok(plan.authorized.find(a=>a.id===id).paths.includes(field));
  const old=backgroundEntries.find(e=>e.id===id);
  assert.deepEqual(entry.facts.knowledge,old.facts.knowledge);
  assert.deepEqual(entry.facts.secrets,old.facts.secrets);
 }
 assert.equal(report.operativePassed,15);
 assert.deepEqual(report.preservedPassed.map(r=>r.id).sort(),first.rows.filter(r=>r.status==='passed'&&!['npc_lq_luanpei','npc_lq_yunxiu'].includes(r.id)).map(r=>r.id).sort());
 const invalidations=await reopened('l4-invalidations');assert.equal(invalidations.l4Approved,false);
 for(const id of ['npc_lq_luanpei','npc_lq_yunxiu']){
  const row=invalidations.records.find(r=>r.id===id);assert.equal(row.historicalStatus,'passed');assert.equal(row.operativeStatus,'invalidated-by-L4');
  assert.equal(row.l4Approved,false);assert.equal(row.findings.length,1);
 }
});

test('离线受控计划逐真实失败锁定26叶，正确兄弟、9pending原记录和全部来源冻结',async()=>{
 const plan=await fs.readFile(path.join(legacyRoot,'reopen-complete/pre-source-witness-plan.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return reopened('controlled-plan');throw e;}),diff=await reopened('patch-diff'),report=await reopened('offline-report');
 const revisedIds=new Set(['luanpei','yunxiu','jushu','qinglan','yike','nieya','huoji','fushen','tanyu','suili'].map(k=>'npc_lq_'+k));
 assert.deepEqual(new Set(plan.authorized.map(a=>a.id)),revisedIds);assert.equal(diff.length,26);
 assert.deepEqual(await reopened('candidate-after'),offlineBackgroundEntries.map(patchDraft));
 const foundation=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'foundation.json'),'utf8'));
 assert.equal(plan.foundationHash,hashContent(foundation));
 assert.equal(plan.baseHash,hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,'base.json'),'utf8'))));
 assert.equal(plan.candidateHash,hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,'candidate.json'),'utf8'))));
 for(const ref of plan.sourceHashes){const file=ref.file.endsWith('/people/baseline.json')&&firstProof?path.join(legacyRoot,'reopen-complete/pre-T06-publication-baseline.json'):path.resolve(firstReviewRoot,ref.file);assert.equal(ref.hash,hashContent(JSON.parse(await fs.readFile(file,'utf8'))));}
 for(const entry of offlineBackgroundEntries){
  const old=foundation.entries.find(e=>e.id===entry.id),authorization=plan.authorized.find(a=>a.id===entry.id);
  const record=await originalRecord(entry.id);
  if(authorization){assert.equal(authorization.recordHash,hashContent(record));assert.equal(authorization.draftHash,hashContent(record.draft));assert.equal(authorization.reviewHash,hashContent(record.review));assert.deepEqual(authorization.paths,diff.filter(c=>c.id===entry.id).map(c=>c.path));}
  for(const p of entry.patches){
   const prior=old.patches.find(o=>o.path===p.path),change=diff.find(c=>c.id===entry.id&&c.path===p.path);
   if(change){assert.ok(authorization.paths.includes(p.path));assert.deepEqual(change.before,prior.value);assert.deepEqual(change.after,p.value);assert.equal(change.oldRecordHash,hashContent(record));}
   else assert.deepEqual(p,prior,entry.id+'/'+p.path);
  }
  assert.deepEqual(entry.authoredBackground,old.authoredBackground);
  assert.deepEqual(entry.facts.memorySeeds,old.facts.memorySeeds);
  assert.deepEqual(entry.facts.secrets,old.facts.secrets);
 }
 for(const change of diff)for(const ref of change.sourceQuotes){
  if(ref.collection)assert.deepEqual(ref.value,getPath(world[ref.collection].find(p=>p.id===ref.id),ref.field));
  else assert.deepEqual(ref.value,getPath(JSON.parse(await fs.readFile(path.resolve(firstReviewRoot,ref.file),'utf8')),ref.field));
  assert.equal(ref.hash,hashContent(ref.value));
 }
 assert.equal(report.pending.length,9);
 for(const p of report.pending){const record=await originalRecord(p.id);assert.equal(p.recordHash,hashContent(record));assert.equal(p.attempts,record.attempts);assert.equal(p.reviewExists,!!record.review);assert.equal(p.draftExists,!!record.draft);}
 assert.equal(report.l2Approved,false);assert.equal(report.l4Approved,false);assert.equal(report.formalWrite,false);
 assert.equal(report.modelCalls,0);assert.equal(report.costYuan,0);assert.equal(report.publicationPreviewRun,false);
 assert.equal(report.budget.appliedToBudget,false);assert.equal(report.budget.historicalSpentYuan,2.87060744);assert.equal(report.budget.maxFutureYuan,1.62939256);
 assert.equal(report.officialGuard.accepted,false);assert.match(report.officialGuard.error,/仅授权T07\/T10/);
 const queue=await reopened('review-queue');assert.equal(queue.planHash,hashContent(plan));assert.equal(queue.rows.length,15);
 assert.deepEqual(queue.reusePassed,report.preservedPassed);
 assert.deepEqual(queue.rows.filter(r=>r.reviewOnly).map(r=>r.id).sort(),['npc_lq_cuifan','npc_lq_henglu','npc_lq_kuangye','npc_lq_manqu','npc_lq_wenqi']);
 for(const row of queue.rows){const record=await originalRecord(row.id);assert.equal(row.recordHash,hashContent(record));assert.equal(row.attempts,record.attempts);assert.equal(row.nextDraftHash,hashContent(patchDraft(offlineBackgroundEntries.find(e=>e.id===row.id))));}
});

test('manual最末provider原文核对且不补造缺档，私密细节和跨户互动不进入修订',async()=>{
 const report=await reopened('offline-report'),diff=await reopened('patch-diff');
 assert.deepEqual(report.providerOriginals.filter(r=>r.available).map(r=>r.id).sort(),['npc_lq_fushen','npc_lq_huoji','npc_lq_tanyu']);
 const suiliProvider=report.providerOriginals.find(r=>r.id==='npc_lq_suili');assert.equal(suiliProvider.available,false);
 for(const provider of report.providerOriginals.filter(r=>r.available)){
  const record=await originalRecord(provider.id);
  assert.equal(provider.responseHash,hashContent(record.firstSourceEvidence.reviewResponse));
  assert.deepEqual(JSON.parse(record.firstSourceEvidence.reviewResponse.choices[0].message.content),record.review);
 }
 for(const key of ['huoji','fushen','tanyu','suili']){
  const entry=entries.find(e=>e.id==='npc_lq_'+key);
  const changed=diff.filter(c=>c.id===entry.id);
  const text=JSON.stringify(changed.map(c=>c.after));
  assert.doesNotMatch(text,/比较过|谈过读回|夫妻商量|两人为.*争论|肩力|细泥堵口|自家沟尾记录|最怕混入石粉/);
  if(['huoji','suili'].includes(key))assert.equal(entry.facts.knowledge.known[2].source,entry.id);
  for(const secret of entry.before.secrets){const hidden=secret.content??secret.fact??secret.text;assert.ok(hidden);assert.ok(!text.includes(hidden));}
 }
 const frozen=await reopened('historical-hashes');
 for(const ref of frozen.files){
  let raw=await fs.readFile(path.resolve(firstReviewRoot,ref.file),'utf8');
  if(firstProof&&ref.textHashLF!==hashContent(raw.replace(/\r\n/g,'\n'))){const relative=path.relative(path.resolve('.'),path.resolve(firstReviewRoot,ref.file)).replaceAll('\\','/');const result=await exec('git',['show',frozen.sourceCommit+':'+relative],{maxBuffer:20*1024*1024});raw=result.stdout;}
  assert.equal(ref.textHashLF,hashContent(raw.replace(/\r\n/g,'\n')),ref.file);
  if(ref.contentHash)assert.equal(ref.contentHash,hashContent(JSON.parse(raw)),ref.file);
 }
});

const completeRoot=path.join(legacyRoot,'reopen-complete');
const completed=async name=>JSON.parse(await fs.readFile(path.join(completeRoot,name+'.json'),'utf8'));
function recordedVersion(record,hash){
 if(!record)return null;
 if(hashContent(record)===hash)return record;
 return recordedVersion(record.reviewRecovery?.prior,hash);
}

test('真实重开17次均为完整L2且原80请求不变，费用与有界尝试保留',async()=>{
 const report=await completed('stopped-report');
 const summary=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'summary.json'),'utf8'));
 const terminal=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'terminal.json'),'utf8'));
 assert.equal(report.actualCalls,17);assert.equal(report.originalRequestsRetained,80);
 let cost=0;
 for(const request of report.requests){
  const actual=summary.budget.requests[request.id];assert.equal(actual.status,'settled');
  assert.match(actual.label,/manual-review$/);assert.equal(actual.costUpperYuan,request.costUpperYuan);
  assert.ok(actual.costUpperYuan<=actual.reservedYuan);assert.deepEqual(actual.responseEvidence,request.responseEvidence);
  cost+=actual.costUpperYuan;
 }
 for(const [id,r] of Object.entries(terminal.budgetAfter.requests).filter(([,r])=>r.card==='T08'))assert.deepEqual(summary.budget.requests[id],r);
 assert.ok(Math.abs(cost-1.34222760)<1e-10);assert.ok(Math.abs(report.newCostUpperYuan-cost)<1e-10);
 assert.ok(Math.abs(report.card.spentYuan-4.21283504)<1e-10);assert.equal(report.card.limitYuan,4.5);assert.equal(report.card.reservedYuan,0);
 assert.ok(Math.abs(report.shared.spentYuan-12.22983984)<1e-10);assert.ok(Math.abs(report.shared.reservedYuan-.083736)<1e-10);
 assert.equal(report.attempts.npc_lq_yunxiu.length,2);assert.equal(report.attempts.npc_lq_jushu.length,2);
 assert.ok(Object.values(report.attempts).every(a=>a.length<=2));
 const preflight=await completed('preflight');assert.ok(preflight.ceilingYuan<=.5);
 const actual=[];
 for(const row of report.records){
  const current=JSON.parse(await fs.readFile(path.join(firstReviewRoot,row.id+'.json'),'utf8'));
  const record=recordedVersion(current,row.recordHash);assert.ok(record,'stage record missing from actual history '+row.id);
  assert.equal(record.status,row.status);assert.equal(hashContent(record.draft),row.draftHash);assert.equal(hashContent(record.review),row.reviewHash);
  if(record.reopenAuthorization){assert.ok(record.reviewRecovery.response.choices[0].message.content);assert.deepEqual(record.responseEvidence.at(-1).phase,'review');}
  actual.push(record);
 }
 assert.deepEqual(report.recordStatuses,{total:30,passed:23,manual:7,pending:0});
 assert.equal(actual.filter(r=>r.status==='manual').length,7);
 const jushu=actual.find(r=>r.id==='npc_lq_jushu');assert.match(jushu.reviewRecovery.prior.reviewRecovery.error,/Unterminated string/);
 assert.ok(jushu.review.contradictions.some(i=>i.severity==='hard'));
 assert.equal(report.allL2Passed,false);assert.equal(report.l4.approved,false);assert.equal(report.publicationPreview.run,false);assert.equal(report.formalWrite,false);
});

test('原55c来源快照与当前发布世界逐引用相容，冻结before及已审after分开',async()=>{
 const compatibility=await completed('current-world-compatibility');
 const original=await completed('pre-T06-publication-baseline');
 assert.equal(hashContent(original),'55c269daac7d6844af7267bb2da1399a9c812fa2f8a1f3635c7815f80c4ebd30');
 assert.equal(compatibility.sourceSnapshotHash,hashContent(original));assert.equal(compatibility.compared,30);
 assert.equal(compatibility.currentNpcCount,152);assert.equal(compatibility.rootScopeOriginal,true);
 const foundation=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'foundation.json'),'utf8'));
 for(const row of compatibility.checks){
  const {context,...entry}=foundation.entries.find(e=>e.id===row.id);
  assert.equal(row.frozenContextHash,hashContent(context));assert.equal(row.currentReferenceContextHash,row.frozenContextHash);
  assert.equal(hashContent(contextFor(entry,world)),row.frozenContextHash);
  assert.equal(row.beforeHash,hashContent(entry.before));
 }
 for(const entry of entries){
  const live=liveWorld.npcs.find(n=>n.id===entry.id);
  const oldPhase=hashContent(live)===hashContent(entry.before),publishedPhase=hashContent(live)===hashContent(approvedEntries.find(e=>e.id===entry.id).facts);
  assert.ok(oldPhase||publishedPhase,'正式源既不等于冻结before也不等于完整after '+entry.id);
 }
 const currentPlan=await reopened('controlled-plan');
 const source=currentPlan.sourceHashes.find(r=>r.file.endsWith('pre-T06-publication-baseline.json'));
 assert.equal(source.hash,compatibility.sourceSnapshotHash);
 assert.equal(currentPlan.sourceSnapshotWitness.frozenHash,source.hash);
});

test('真实背景hard使五人来源不闭合，未发的邻居修订保持提议且不冒认L4或预演',async()=>{
 const report=await completed('stopped-report'),block=await completed('background-source-block'),guard=await completed('neighbor-request-guard-block');
 assert.equal(block.originId,'npc_lq_kuangye');assert.equal(block.eventId,'memory_lq_depth_readback');
 assert.deepEqual(new Set(block.affectedIds),new Set(['npc_lq_fushen','npc_lq_shaluo','npc_lq_jushu','npc_lq_yike','npc_lq_kuangye']));
 assert.ok(block.findings.length>0);assert.ok(block.findings.every(r=>r.severity==='hard'));
 const event=background.events.find(e=>e.id===block.eventId);
 assert.deepEqual(block.affectedIds,event.actors);assert.equal(block.sourceHash,hashContent(background));
 assert.equal(block.l4Approved,false);assert.equal(report.operativeSourceClosedPassed.length,21);
 assert.ok(report.operativeSourceClosedPassed.every(id=>!block.affectedIds.includes(id)));
 assert.equal(guard.modelCalls,0);assert.match(guard.compactGuardError,/revisions 包含不可去重的来源字段/);
 assert.equal(guard.restoredActiveDesign,true);assert.equal(guard.unclaimedAttemptPreserved,true);
 const proposals=await completed('neighbor-repair-proposed-diff');assert.equal(proposals.length,4);
 for(const proposal of proposals){const entry=entries.find(e=>e.id===proposal.id);assert.equal(getPath(entry.facts,proposal.path),proposal.before);assert.equal(proposal.called,false);}
});

test('T08实际continuation父proof加四叶提议经官方prepare，full和compact只携当前after且保留原证据',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lq-neighbor-parent-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const worldRoot=path.join(temp,'world');
 for(const folder of ['meta','people','geo','lore'])await fs.cp(path.resolve('world',folder),path.join(worldRoot,folder),{recursive:true});
 await fs.cp(legacyRoot,path.join(worldRoot,'drafts/w1/lq-depth'),{recursive:true});
 await fs.mkdir(path.join(worldRoot,'design'),{recursive:true});
 await fs.copyFile(path.resolve('world/design/w1-reopen-authorization.json'),path.join(worldRoot,'design/w1-reopen-authorization.json'));
 const root=path.join(worldRoot,'drafts/w1/lq-depth/author-v2/first-review'),read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
 let proof=await read('incremental-proof.json');const foundation=await read('foundation.json'),plan=await read('../../reopen-complete/neighbor-repair-plan.json'),diff=await read('../../reopen-complete/neighbor-repair-proposed-diff.json');
 while(hashContent(proof)!==plan.previousProofHash&&proof.previousProof)proof=proof.previousProof;
 await fs.writeFile(path.join(root,'incremental-proof.json'),JSON.stringify(proof));
 for(const item of plan.authorized){const current=await read(item.id+'.json'),prior=recordedVersion(current,item.recordHash);assert.ok(prior);await fs.writeFile(path.join(root,item.id+'.json'),JSON.stringify(prior));}
 assert.equal(proof.planFile,'../../reopen-complete/continuation-plan.json');assert.equal(hashContent(proof),plan.previousProofHash);
 const rows=foundation.entries.map(({context,authoredBackground,...row})=>structuredClone(row));
 const replay=p=>{if(p.previousProof)replay(p.previousProof);for(const change of p.changes)rows.find(e=>e.id===change.id).patches.find(p=>p.path===change.path).value=structuredClone(change.after);};replay(proof);
 for(const change of diff){const row=rows.find(e=>e.id===change.id),record=await read(change.id+'.json');assert.equal(hashContent(record),plan.authorized.find(a=>a.id===change.id).recordHash);assert.equal(row.patches.find(p=>p.path===change.path).value,change.before);row.patches.find(p=>p.path===change.path).value=change.after;}
 const design=path.join(worldRoot,'design/neighbor-temp.mjs');await fs.writeFile(design,`export const revision=${JSON.stringify(foundation.revision)};\nexport const patchRows=${JSON.stringify(rows)};\n`);
 const originals=await Promise.all(['base.json','foundation.json','candidate.json','incremental-proof.json',...rows.map(r=>r.id+'.json')].map(async file=>[file,await fs.readFile(path.join(root,file),'utf8')]));
 const options={worldRoot,root,design,cardId:'T08',controlledRevision:path.join(root,'../../reopen-complete/neighbor-repair-plan.json'),authorizationHash:hashContent(plan),authoredBackground:path.join(root,'authored-background.json'),reopenAuthorization:path.join(worldRoot,'design/w1-reopen-authorization.json')};
 const prepared=await prepareDepthRevision(options);assert.equal(prepared.revision.changes.length,4);assert.deepEqual(prepared.previousProof,proof);
 for(const change of diff){
  const entry=prepared.entries.find(e=>e.id===change.id),context=prepared.contexts.get(entry.id),draft=patchDraft(entry),full=buildReviewRequest(entry,draft,context),compact=compactReviewRequest(full),payload=JSON.parse(full.messages[1].content);
  assert.equal(draft.patches.find(p=>p.path===change.path).value,change.after);assert.equal(payload.publishedFacts.revisions.find(r=>r.path===change.path).after,change.after);
  assert.equal(payload.publishedFacts.controlledRevision.changes.find(c=>c.path===change.path).before,change.before);
  const reduced=JSON.parse(compact.messages[1].content);assert.equal(reduced.draft.patches.find(p=>p.path===change.path).value,change.after);
  assert.deepEqual(entry.authoredBackground,foundation.entries.find(e=>e.id===entry.id).authoredBackground);
  assert.deepEqual(context.authoredBackground,foundation.entries.find(e=>e.id===entry.id).context.authoredBackground);
 }
 for(const [file,raw] of originals)assert.equal(await fs.readFile(path.join(root,file),'utf8'),raw,file+' 原记录改变');
 assert.deepEqual(validateDraft(patchDraft(prepared.entries.find(e=>e.id===diff[0].id)),prepared.entries.find(e=>e.id===diff[0].id)).errors,[]);
});

test('T08追加权限只允许沙萝及五方两叶，来源窄修保留秘密、refs和参与者',async()=>{
 const next=JSON.parse(await fs.readFile(path.resolve('world/drafts/w1/lq-depth/complete-003/authored-background.json'),'utf8'));
 const prior=background.events.find(e=>e.id==='memory_lq_depth_readback'),event=next.events.find(e=>e.id===prior.id);
 validateT08ReadbackRevision(prior,event);assert.doesNotMatch(event.narrative,/被本人回绝/);
 for(const mutate of [e=>e.risks.pop(),e=>e.sourceRefs[12].hash='changed',e=>e.associations[0].viewpoint='new private fact',e=>e.actors.pop(),e=>e.designedFacts[0]='unrelated']){const bad=structuredClone(event);mutate(bad);assert.throws(()=>validateT08ReadbackRevision(prior,bad));}
 const manifest=JSON.parse(await fs.readFile(path.resolve('world/design/w1-reopen-authorization.json'),'utf8'));
 assert.equal(reopenAllowsId(manifest,'T08','npc_lq_shaluo'),true);
 assert.equal(reopenAllowsId({...manifest,sourceAuthorizations:manifest.sourceAuthorizations.filter(a=>a.cardId!=='T08')},'T08','npc_lq_shaluo'),false);
 assert.equal(reopenAllowsId(manifest,'T08','npc_lq_shenshu'),false);
});

test('云绣复用原完整L2仅允许重复after重建，候选、来源和请求hash改变均拒绝',async()=>{
 const {currentOptions}=await import('../world/drafts/w1/lq-depth/complete-003/review.mjs');
 const p=await prepareDepthRevision(await currentOptions()),id='npc_lq_yunxiu',entry=p.entries.find(e=>e.id===id),record=JSON.parse(await fs.readFile(path.join(firstReviewRoot,id+'.json'),'utf8'));
 const original=JSON.parse(record.reviewRecovery.request.messages[1].content).publishedFacts;
 const normalized={...original,revisions:original.revisions.map(r=>({...r,after:structuredClone(entry.patches.find(p=>p.path===r.path).value)}))};
 assert.notEqual(hashContent(original),hashContent(normalized));
 assert.deepEqual(reuseReviewedDepthContext(entry,normalized,record,p.config.revision),original);
 for(const [e,c,r] of [[{...entry,baseHash:'changed'},normalized,record],[entry,{...normalized,rules:[...normalized.rules,'changed']},record],[entry,normalized,{...record,reviewRecovery:{...record.reviewRecovery,requestHash:'changed'}}]])assert.deepEqual(reuseReviewedDepthContext(e,c,r,p.config.revision),c);
 assert.equal(record.fingerprint,hashContent({entry,context:p.contexts.get(id),revision:p.config.revision}));
});
