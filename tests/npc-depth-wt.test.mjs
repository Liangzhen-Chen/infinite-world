import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {depthEntries,validatePatchResults,patchDraft,applyDepthDraft,verifyUnchanged,validateDraft,contextFor,getPath} from '../tools/npc-depth-content.mjs';
import {hashContent,readApprovedContent} from '../tools/content-pipeline.mjs';
import {fileURLToPath} from 'node:url';
import * as original from '../world/design/w1-wt-depth.mjs';
import * as design from '../world/drafts/w1/wt-depth/sourced/design.mjs';
import {weitingRoster} from '../world/design/w1-villages-weiting.mjs';
import {frozenT07SourceText,prepareDepthRevision,depthOptions} from '../tools/npc-depth.mjs';
import {runDepthReview,reviewOptions} from '../tools/npc-depth-review.mjs';
import {prepareNpcDepth} from '../tools/publish-npc-depth.mjs';

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
 let receipt=null;try{receipt=await read('sourced/incremental-proof.json');}catch(error){if(error.code!=='ENOENT')throw error;}
 while(receipt?.previousProof)receipt=receipt.previousProof;
 assert.equal(plan.cardId,'T07');assert.equal(plan.revision,foundation.revision);
 assert.equal(plan.foundationHash,hashContent(foundation));assert.equal(plan.baseHash,hashContent(base));assert.equal(plan.candidateHash,hashContent(candidate));
 assert.equal(plan.invalidationHash,hashContent(invalidations));
 assert.equal(diff.changes.length,82);assert.equal(plan.authorized.length,30);
 assert.deepEqual(after,entries().map(patchDraft));
 for(const item of plan.authorized){
  const current=await read('sourced/'+item.id+'.json'),record=receipt?.oldRecords.find(r=>r.id===item.id)??current,proof=invalidations.records.find(r=>r.id===item.id);
  assert.equal(item.recordHash,hashContent(record));assert.equal(item.draftHash,hashContent(record.draft));assert.equal(item.reviewHash,hashContent(record.review));
  let stage=current;while(stage.incremental&&stage.incremental.authorizationHash!==hashContent(plan))stage=stage.reviewRecovery.prior;
  if(stage.incremental){assert.equal(stage.incremental.originalRecordHash,item.recordHash);assert.equal(hashContent(stage.reviewRecovery.prior),item.recordHash);assert.deepEqual(stage.draft,after.find(r=>r.id===item.id));}
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
  if(source.file.endsWith('.mjs')){const witness=await read('controlled/source-checkout-evidence.json');assert.equal(source.hash,hashContent(frozenT07SourceText(source,raw,witness,plan)));}
  else assert.equal(source.hash,hashContent(JSON.parse(raw)));
 }
 assert.equal(world.npcs.filter(n=>n.tier==='full').length,152);
 assert.equal(world.npcs.filter(n=>n.id.startsWith('npc_hw_')&&n.tier==='full').length,32);
});

test('钉死T07来源仅接受完整LF或原CRLF，字段篡改、混合换行和伪凭证拒绝',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/controlled/',import.meta.url);
 const [plan,evidence]=await Promise.all(['controlled-plan.json','source-checkout-evidence.json'].map(f=>fs.readFile(new URL(f,root),'utf8').then(JSON.parse)));
 const source=plan.sourceHashes.find(s=>s.file===evidence.sourceFile),lf=evidence.gitBlob.text,crlf=lf.replace(/\n/g,'\r\n');
 for(const raw of [lf,crlf])assert.equal(hashContent(frozenT07SourceText(source,raw,evidence,plan)),source.hash);
 for(const raw of [lf.replace('母亲议界线总忘按时歇息','母亲议界线每天按时歇息'),lf.replace('\n','\r\n'),lf+'\n'])assert.throws(()=>frozenT07SourceText(source,raw,evidence,plan),/已改变/);
 for(const mutate of [e=>e.planHash='fake',e=>e.sourceFile='../source.json',e=>e.originalHash='fake',e=>e.gitBlob.oid='fake',e=>e.gitBlob.text+='\n']){const forged=structuredClone(evidence);mutate(forged);assert.throws(()=>frozenT07SourceText(source,lf,forged,plan));}
 for(const cardId of ['T06','T10'])assert.throws(()=>frozenT07SourceText(source,lf,evidence,{...plan,cardId}));
 assert.throws(()=>frozenT07SourceText({...source,file:'base.json'},lf,evidence,plan));
 assert.equal(Object.hasOwn(depthOptions([]),'sourceCheckoutEvidence'),false);
 const parsed=reviewOptions(['--id','npc_wt_zhengxi','--design','world/drafts/w1/wt-depth/sourced/design.mjs','--root','world/drafts/w1/wt-depth/sourced','--budget-root','world/drafts/m4-object','--card','T07','--source-checkout-evidence','world/drafts/w1/wt-depth/controlled/source-checkout-evidence.json']);
 assert.equal(parsed.sourceCheckoutEvidence,path.resolve('world/drafts/w1/wt-depth/controlled/source-checkout-evidence.json'));
});

test('换行凭证贯穿官方准备、mock复审收据及发布重放，不授予真实审核或发布',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'wt-checkout-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const worldRoot=path.join(temp,'world');
 for(const dir of ['meta','geo','people','lore'])await fs.cp(path.resolve('world',dir),path.join(worldRoot,dir),{recursive:true});
 await fs.mkdir(path.join(worldRoot,'design'),{recursive:true});
 for(const file of ['w1-wt-depth.mjs','w1-villages-weiting.mjs'])await fs.copyFile(path.resolve('world/design',file),path.join(worldRoot,'design',file));
 await fs.cp(path.resolve('world/drafts/w1/wt-depth'),path.join(worldRoot,'drafts/w1/wt-depth'),{recursive:true});
 const root=path.join(worldRoot,'drafts/w1/wt-depth/sourced'),controlled=path.join(worldRoot,'drafts/w1/wt-depth/controlled'),witnessFile=path.join(controlled,'source-checkout-evidence.json');
 // The mock starts from preserved history in this temporary copy. Live review
 // records and recovery claims remain untouched.
 try{let historical=JSON.parse(await fs.readFile(path.join(root,'incremental-proof.json'),'utf8'));while(historical.previousProof)historical=historical.previousProof;for(const record of historical.oldRecords)await fs.writeFile(path.join(root,record.id+'.json'),JSON.stringify(record));const terminal=JSON.parse(await fs.readFile(path.join(root,'terminal.json'),'utf8'));await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(terminal.summary));for(const batch of terminal.summary.batches)await fs.writeFile(path.join(root,`batch-${batch.index}.json`),JSON.stringify(batch));await fs.rm(path.join(root,'incremental-proof.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const plan=JSON.parse(await fs.readFile(path.join(controlled,'controlled-plan.json'),'utf8')),witness=JSON.parse(await fs.readFile(witnessFile,'utf8'));
 const options={root,worldRoot,design:path.join(root,'design.mjs'),controlledRevision:path.join(controlled,'controlled-plan.json'),authoredBackground:path.join(worldRoot,'drafts/w1/wt-depth/authored-background.json'),authorizationHash:hashContent(plan),cardId:'T07',sourceCheckoutEvidence:witnessFile};
 const file=path.join(worldRoot,'design/w1-villages-weiting.mjs');await fs.writeFile(file,witness.gitBlob.text);
 const {sourceCheckoutEvidence,...without}=options;
 await assert.rejects(prepareDepthRevision(without),/冻结原来源hash/);
 const lf=await prepareDepthRevision(options);assert.equal(lf.revision.changes.length,82);assert.equal(lf.background.events.length,7);
 assert.deepEqual(lf.sourceCheckoutEvidence,{file:'../controlled/source-checkout-evidence.json',hash:hashContent(witness)});
 await fs.writeFile(file,witness.gitBlob.text.replace(/\n/g,'\r\n'));
 assert.deepEqual((await prepareDepthRevision(options)).sourceHashes,lf.sourceHashes);
 await fs.writeFile(file,witness.gitBlob.text);
 const budgetRoot=path.join(temp,'mock-budget');await fs.mkdir(budgetRoot);
 await fs.writeFile(path.join(budgetRoot,'budget.json'),JSON.stringify({spentYuan:1.99304752,reservedYuan:0,limitYuan:20,waveLimitYuan:20,cards:{T07:{limitYuan:3,spentYuan:1.99304752,reservedYuan:0}},requests:{}}));
 let mockCalls=0;
 const client={spent:0,reserved:0,budgetYuan:20,estimateCostYuan:()=>.01,generate:async request=>{mockCalls++;const payload=JSON.parse(request.messages[1].content),context=payload.publishedFacts;return{choices:[{message:{content:JSON.stringify({contradictions:[],reviewedPaths:payload.draft.patches.map(p=>p.path),backgroundReviews:context.authoredBackground.events.map(e=>({eventId:e.id,sourceHash:context.authoredBackground.sourceHash,reviewedRiskPaths:e.risks.map(r=>`${r.id}.${r.field}`),contradictions:[]}))})}}],measurement:{costUpperYuan:.001}};}};
 await runDepthReview({...options,id:'npc_wt_zhengxi',budgetRoot},{client});assert.equal(mockCalls,1);
 const receipt=JSON.parse(await fs.readFile(path.join(root,'incremental-proof.json'),'utf8'));assert.deepEqual(receipt.sourceCheckoutEvidence,lf.sourceCheckoutEvidence);
 await assert.rejects(prepareDepthRevision(without),/冻结原来源hash|换行凭证收据/);
 const manifest=path.join(root,'manifest.json');
 await assert.rejects(prepareNpcDepth({manifest,worldRoot}),/L4|人工队列/);
 receipt.sourceCheckoutEvidence.hash='forged';await fs.writeFile(path.join(root,'incremental-proof.json'),JSON.stringify(receipt));
 await assert.rejects(prepareNpcDepth({manifest,worldRoot}),/换行凭证收据/);
 receipt.sourceCheckoutEvidence.hash=lf.sourceCheckoutEvidence.hash;await fs.writeFile(path.join(root,'incremental-proof.json'),JSON.stringify(receipt));
 await fs.writeFile(file,witness.gitBlob.text.replace('母亲议界线总忘按时歇息','母亲议界线每天按时歇息'));
 await assert.rejects(prepareNpcDepth({manifest,worldRoot}),/已改变/);
 assert.equal(mockCalls,1);
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

test('T07实际record基准经官方prepare后须原样复用12有效passed完整指纹',async()=>{
 const {officialCheck}=await import('../world/drafts/w1/wt-depth/reopen/prepare-complete.mjs'),report=await officialCheck();
 const root=new URL('../world/drafts/w1/wt-depth/reopen/',import.meta.url),read=async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8'));
 const recorded=await read('offline-report.json'),plan=await read('controlled-plan.json');
 assert.equal(report.authorizationId,'user-reopen-20261012-01');assert.equal(plan.authorized.length,18);
 assert.equal(plan.authorized.filter(r=>r.controlledL2Unreviewed).length,17);
 assert.equal(plan.authorized.filter(r=>r.state==='failed-latest-L2').length,1);
 assert.equal(plan.authorized.filter(r=>r.state==='historical-failed-unreviewed-controlled-L2').length,5);
 assert.equal(plan.authorized.filter(r=>r.state==='L4-invalidated-unreviewed-controlled-L2').length,12);
 assert.equal(report.protectedIds.length,12);assert.ok(report.protectedIds.every(id=>!plan.authorized.some(a=>a.id===id)));
 assert.deepEqual(report.L1Errors,[]);assert.deepEqual(report.issues,[]);
 assert.equal(report.modelCalls,0);assert.equal(report.budgetWrites,0);
 assert.equal(report.realL2,false);assert.equal(report.realL4,false);assert.equal(plan.attemptLimit,2);
});

test('湛鸥只修七个真实hard，家属不自动转告，未同意的步骤保持pending',async()=>{
 const reopened=await import('../world/drafts/w1/wt-depth/reopen/design.mjs'),next=depthEntries(design.patchRows.map(r=>r.before),reopened,world);
 const root=new URL('../world/drafts/w1/wt-depth/',import.meta.url),record=JSON.parse(await fs.readFile(new URL('reopen/old-records.json',root),'utf8')).find(r=>r.id==='npc_wt_zhangou');
 const current=next.find(e=>e.id===record.id),previous=entries().find(e=>e.id===record.id);
 const changed=current.patches.filter(p=>hashContent(p.value)!==hashContent(previous.patches.find(o=>o.path===p.path).value)).map(p=>p.path);
 assert.deepEqual(changed.sort(),record.errors.map(e=>e.field).sort());assert.equal(changed.length,7);
 for(const term of ['short','mid','long']){
  assert.equal(current.facts.goals[term][0].steps[0].status,'pending');
  assert.equal(current.facts.goals[term][0].progress,previous.facts.goals[term][0].progress);
  assert.match(current.facts.goals[term][0].steps[0].content,/计划.*尚未/);
 }
 assert.doesNotMatch(current.facts.knowledge.unknown.join(' '),/虞菡借出|向祯/);
 assert.match(current.facts.relationships[0].note,/尚待.*询问/);assert.match(current.facts.relationships[1].note,/均未获知/);
 assert.deepEqual(current.facts.memorySeeds,previous.facts.memorySeeds);
 assert.deepEqual(current.facts.secrets,current.before.secrets);
});

test('未说出口的原关切不能变成已提出，向菲天黑前回村及五人共享边界按原源修订',async()=>{
 const reopened=await import('../world/drafts/w1/wt-depth/reopen/design.mjs'),next=depthEntries(design.patchRows.map(r=>r.before),reopened,world);
 const quhuai=next.find(e=>e.id==='npc_wt_quhuai'),xiangzhen=next.find(e=>e.id==='npc_wt_xiangzhen');
 assert.doesNotMatch(quhuai.facts.knowledge.unknown[0],/提出的/);assert.match(quhuai.facts.relationships[1].note,/尚待询问/);
 assert.match(xiangzhen.facts.knowledge.unknown[0],/天黑前.*尚待询问/);assert.doesNotMatch(xiangzhen.facts.knowledge.unknown.join(' '),/夜归|郑汐/);
 assert.doesNotMatch(xiangzhen.facts.goals.mid[0].steps[0].content,/请向菲.*指出误认/);
 const actors=['npc_wt_peichun','npc_wt_suhui','npc_wt_qilu','npc_wt_huayin','npc_wt_xiangzhen'],memories=actors.map(id=>next.find(e=>e.id===id).facts.memorySeeds.at(-1));
 for(const memory of memories){assert.deepEqual(memory,memories[0]);assert.match(memory.event,/戚鹭只谈.*一般原则/);assert.doesNotMatch(memory.event,/戚鹭区分听来的旧水情/);}
 const oneSided=next.map(e=>e.id==='npc_wt_qilu'?entries().find(old=>old.id===e.id):e);
 const bundle=JSON.parse(await fs.readFile(new URL('../world/drafts/w1/wt-depth/reopen/authored-background.json',import.meta.url),'utf8'));
 const {validateAuthoredBackground}=await import('../tools/npc-depth-content.mjs');
 assert.throws(()=>validateAuthoredBackground(bundle,oneSided,world),/双方事件事实不一致或超出处/);
 const forged=structuredClone(bundle),event=forged.events.at(-1);event.sourceRefs.find(r=>r.id==='npc_wt_qilu'&&r.field==='goals.mid[0].content').hash='fake';
 assert.throws(()=>validateAuthoredBackground(forged,next,world),/原字段出处hash过期/);
});

test('未提供显式重开授权时原T07 proof仍拒绝新规划，不移除冻结守卫',async()=>{
 const root=fileURLToPath(new URL('../world/drafts/w1/wt-depth/',import.meta.url)),here=path.join(root,'reopen');
 const plan=JSON.parse(await fs.readFile(path.join(here,'controlled-plan.json'),'utf8'));
 await assert.rejects(()=>prepareDepthRevision({root:path.join(root,'sourced'),worldRoot:path.resolve('world'),cardId:'T07',design:path.join(here,'design.mjs'),controlledRevision:path.join(here,'controlled-plan.json'),authorizationHash:hashContent(plan),authoredBackground:path.join(here,'authored-background.json'),sourceCheckoutEvidence:path.join(root,'controlled/source-checkout-evidence.json')}),/本次规划已冻结|旧候选指纹不匹配/);
});

test('18实际draft基准与42授权after逐值匹配，12未授权基准重放父proof',async()=>{
 const {completeOptions}=await import('../world/drafts/w1/wt-depth/reopen/prepare-complete.mjs'),options=await completeOptions();
 const prepared=await prepareDepthRevision(options),root=new URL('../world/drafts/w1/wt-depth/',import.meta.url),read=async file=>JSON.parse(await fs.readFile(new URL(file,root),'utf8'));
 const [records,diff,basis,foundation,proof]=await Promise.all(['reopen/old-records.json','reopen/patch-diff.json','reopen/basis-rows.json','sourced/foundation.json','sourced/incremental-proof.json'].map(read));
 assert.equal(records.length,18);assert.equal(diff.length,42);assert.equal(prepared.revision.changes.length,42);
 for(const change of diff){const old=records.find(r=>r.id===change.id).draft.patches.find(p=>p.path===change.path).value;assert.deepEqual(change.before,old);assert.equal(hashContent(old),change.beforeHash);assert.deepEqual(prepared.entries.find(e=>e.id===change.id).patches.find(p=>p.path===change.path).value,change.after);}
 for(const record of records){const row=basis.find(e=>e.id===record.id);assert.deepEqual(row.patches,record.draft.patches);const entry=prepared.entries.find(e=>e.id===record.id);for(const patch of record.draft.patches)if(!diff.some(c=>c.id===record.id&&c.path===patch.path))assert.deepEqual(entry.patches.find(p=>p.path===patch.path).value,patch.value);}
 const replay=foundation.entries.map(({context,facts,contract,...row})=>structuredClone(row));function replayProof(p){if(p.previousProof)replayProof(p.previousProof);for(const c of p.changes)replay.find(e=>e.id===c.id).patches.find(p=>p.path===c.path).value=c.after;}replayProof(proof);
 const preserved=basis.filter(e=>!records.some(r=>r.id===e.id));assert.equal(preserved.length,12);for(const row of preserved)assert.deepEqual(row,replay.find(e=>e.id===row.id));
 const background=await read('reopen/authored-background.json'),oldBackground=await read('authored-background.json'),changedEvent=background.events.find(e=>hashContent(e)!==hashContent(oldBackground.events.find(old=>old.id===e.id)));
 assert.equal(background.events.filter(e=>hashContent(e)!==hashContent(oldBackground.events.find(old=>old.id===e.id))).length,1);
 assert.deepEqual(prepared.entries.filter(e=>e.authoredBackground.sourceHash===hashContent(background)).map(e=>e.id).sort(),[...changedEvent.actors].sort());
 for(const entry of prepared.entries){
  const context=prepared.contexts.get(entry.id),expected=changedEvent.actors.includes(entry.id)?background:oldBackground;
  assert.equal(entry.authoredBackground.sourceHash,hashContent(expected));assert.equal(context.authoredBackground.sourceHash,hashContent(expected));
  for(const event of context.authoredBackground.events){const {originalSources,privateRisks,...sourceEvent}=event;assert.deepEqual(sourceEvent,expected.events.find(e=>e.id===event.id));}
  for(const patch of entry.patches)assert.deepEqual(context.revisions.find(r=>r.path===patch.path).after,patch.value);
 }
});

test('T07真实首ID协议齐全但共享来源hard不升级为通过，旧七hard和12有效record均保留',async()=>{
 const root=new URL('../world/drafts/w1/wt-depth/',import.meta.url),read=async f=>JSON.parse(await fs.readFile(new URL(f,root),'utf8'));
 const [record,pilot,snapshot,proposal]=await Promise.all(['sourced/npc_wt_zhangou.json','reopen/complete-003/pilot-results.json','reopen/complete-003/pre-review.json','reopen/complete-003/shared-repair-guard.json'].map(read));
 assert.equal(pilot.length,1);assert.equal(pilot[0].status,'manual');assert.equal(record.status,'manual');assert.equal(record.reviewRecovery.status,'failed');
 assert.deepEqual([...record.review.reviewedPaths].sort(),record.draft.patches.map(p=>p.path).sort());
 assert.equal(record.review.backgroundReviews.length,1);assert.equal(record.review.backgroundReviews[0].reviewedRiskPaths.length,4);
 assert.ok(record.review.contradictions.some(c=>c.severity==='hard'&&c.field==='memorySeeds[2].event'));
 assert.equal(record.reviewRecovery.prior.errors.filter(e=>e.severity==='hard').length,7);
 assert.equal(hashContent(record.reviewRecovery.response),record.responseEvidence.at(-1).responseHash);
 for(const row of snapshot.protected){const raw=await fs.readFile(new URL('sourced/'+row.id+'.json',root),'utf8'),lf=raw.replaceAll('\r\n','\n');assert.ok(raw===lf||raw===lf.replaceAll('\n','\r\n'),'record换行混合');assert.equal(hashContent(lf),row.rawHash);assert.equal(JSON.parse(raw).fingerprint,row.fingerprint);}
 assert.equal(snapshot.protected.length,12);assert.equal(proposal.changes.length,4);assert.equal(proposal.newModelCalls,0);assert.equal(proposal.authorSourceNotApproved,true);
 assert.equal(proposal.guard,'正确兄弟叶不得修改');assert.deepEqual(proposal.lateFailures,[]);
});
