import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {validateNpcProfiles,findNpcRuleWording} from '../tools/npc-profile-validation.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,applyDepthDraft,validateDraft,validatePatchResults,contextFor,buildReviewRequest,getPath,validateAuthoredBackground,checkIncrementalReview} from '../tools/npc-depth-content.mjs';
import * as design from '../world/design/w1-lq-depth.mjs';
import {liquanRoster} from '../world/design/w1-villages-liquan.mjs';
import {compactReviewRequest} from '../tools/npc-depth-review.mjs';

const world=await loadWorld(path.resolve('world'));
const originals=world.npcs.filter(n=>n.id.startsWith('npc_lq_'));
const entries=depthEntries(originals,design,world);
const merged=validatePatchResults(entries,world);
const ids=new Set(originals.map(n=>n.id));
const legacyRoot=path.resolve('world/drafts/w1/lq-depth');
const root=path.join(legacyRoot,'author-v2');
const exec=promisify(execFile);

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

test('真实prepare CLI重复执行零模型零正式写入，冻结产物一致且没有审核冒认',async()=>{
 const baseline=path.resolve('world/people/baseline.json'),baselineHash=hashContent(await fs.readFile(baseline,'utf8'));
 const files=['base.json','foundation.json','candidate.json','manifest.json','author-source-checklist.json'];
 const snapshots=await Promise.all(files.map(async file=>({file,hash:hashContent(await fs.readFile(path.join(root,file),'utf8')),mtime:(await fs.stat(path.join(root,file))).mtimeMs})));
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 for(let i=0;i<2;i++){
  const {stdout}=await exec(process.execPath,['tools/npc-depth.mjs','--design','world/design/w1-lq-depth.mjs','--root',root,'--budget-root',path.join(root,'not-an-allocated-budget'),'--card','T08','--prepare'],{env});
  assert.deepEqual(JSON.parse(stdout),{entries:30,formalWrite:false,modelCalls:0});
 }
 assert.equal(hashContent(await fs.readFile(baseline,'utf8')),baselineHash);
 for(const old of snapshots){assert.equal(hashContent(await fs.readFile(path.join(root,old.file),'utf8')),old.hash);assert.equal((await fs.stat(path.join(root,old.file))).mtimeMs,old.mtime);}
 const candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
 assert.deepEqual(candidate,entries.map(patchDraft));
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
  const entry=entries.find(e=>e.id===change.id),source=sourcePeople.find(p=>p.id===(change.originalSource.id??change.id));
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
const backgroundEntries=depthEntries(originals,{...design,authoredBackground:background},world);

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
 for(const entry of backgroundEntries)assert.deepEqual(patchDraft(entry),patchDraft(entries.find(e=>e.id===entry.id)));
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
 assert.equal(report.manifestHash,hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,'manifest.json'),'utf8'))));
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

test('官方authored-background prepare冻结新版首审产物，author-v2及原记忆没有改动',async()=>{
 const optIn=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'opt-in-evidence.json'),'utf8'));
 assert.equal(optIn.cardId,'T08');assert.equal(optIn.modelCalls,0);assert.deepEqual(optIn.candidateChanges,[]);
 for(const old of optIn.previousFiles)assert.equal(hashContent(JSON.parse(await fs.readFile(path.resolve(firstReviewRoot,old.path),'utf8'))),old.contentHash);
 const files=['base.json','candidate.json','foundation.json','manifest.json'];
 const frozen=await Promise.all(files.map(async name=>({name,hash:hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,name),'utf8'))),mtime:(await fs.stat(path.join(firstReviewRoot,name))).mtimeMs})));
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 const {stdout}=await exec(process.execPath,['tools/npc-depth.mjs','--design','world/design/w1-lq-depth.mjs','--root',firstReviewRoot,'--authored-background',backgroundFile,'--source-evidence-map',path.join(firstReviewRoot,'source-evidence-map.json'),'--compact-request','--budget-root',path.join(firstReviewRoot,'no-allocated-budget'),'--card','T08','--prepare'],{env});
 assert.deepEqual(JSON.parse(stdout),{entries:30,formalWrite:false,modelCalls:0});
 for(const old of frozen){assert.equal(hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,old.name),'utf8'))),old.hash);assert.equal((await fs.stat(path.join(firstReviewRoot,old.name))).mtimeMs,old.mtime);}
 const manifest=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'manifest.json'),'utf8'));
 assert.equal(manifest.authoredBackgroundHash,hashContent(background));
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
  const raw=await fs.readFile(path.resolve('world',frozen.file),'utf8');
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
