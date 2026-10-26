import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import crypto from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,applyDepthDraft,verifyUnchanged,validateDraft,validatePatchResults,getPath,contextFor,buildDraftRequest,buildReviewRequest,validateAuthoredBackground,checkIncrementalReview} from '../tools/npc-depth-content.mjs';
import * as config from '../world/design/w1-sb-depth.mjs';
import {sangbanRoster,sangbanFull} from '../world/design/w1-villages-sangban.mjs';
import {prepareDepth,prepareDepthRevision,sourceAuthorization} from '../tools/npc-depth.mjs';
import {compactReviewRequest,validateSourceEvidence} from '../tools/npc-depth-source-evidence.mjs';
import {requestMeasure,sourceRequirements} from '../world/drafts/w1/sb-depth/request-preflight.mjs';
import {prepareNpcDepth,publishNpcDepth} from '../tools/publish-npc-depth.mjs';
import {publishNpcDepthSerial} from './fixtures/depth-publish-retry.mjs';
import {villageFull,villageResident} from './fixtures/village-cohort.mjs';

const exec=promisify(execFile),publishedWorld=await loadWorld(),root=path.resolve('world/drafts/w1/sb-depth');
const base=config.patchRows.map(r=>r.before),ids=new Set(base.map(n=>n.id));
const world={...publishedWorld,npcs:publishedWorld.npcs.map(n=>base.find(b=>b.id===n.id)??n)};
const entries=depthEntries(config.patchRows.map(r=>r.before),config,world);
const merged=validatePatchResults(entries,world);
const source=JSON.parse(await fs.readFile(path.join(root,'source-evidence.json'),'utf8'));
const baseline=path.resolve('world/people/baseline.json');
const read=name=>fs.readFile(path.join(root,name+'.json'),'utf8');
const publicationManifest=path.join(root,'first-review/manifest.json');

test('桑坂正式30人等于已审批完整档，其他人、旧记忆和钱物身份保持原值',async()=>{
 const {entries:approved}=await prepareNpcDepth({manifest:publicationManifest});
 // 白石镇后续批次把99名名册人升为npc_bs_*完整档，正式目录现为251 full；此处只核对村落与河湾原152人未变（T157怪物聚居地另有npc_ms_*），白石镇名册加升档仍为305。
 assert.equal(approved.length,30);assert.equal(publishedWorld.npcs.filter(villageFull).length,152);
 // 13ac0697: retain the frozen 305-person batch; verify the separately approved A3 town head in r06-bs-market.
 assert.equal(publishedWorld.residents.filter(villageResident).length,294);assert.equal(publishedWorld.residents.filter(n=>n.settlement==='loc_bs').length+publishedWorld.npcs.filter(n=>n.id.startsWith('npc_bs_')&&n.id!=='npc_bs_townhead').length,305);
 assert.deepEqual(publishedWorld.npcs.map(n=>n.id),world.npcs.map(n=>n.id));
 for(const entry of approved){
  const current=publishedWorld.npcs.find(n=>n.id===entry.id);
  assert.deepEqual(current,entry.facts);verifyUnchanged(entry.before,current,entry);
  for(const field of ['coins','inventory','secrets'])assert.deepEqual(current[field],entry.before[field]);
  assert.deepEqual(current.memorySeeds.slice(0,entry.before.memorySeeds.length),entry.before.memorySeeds);
 }
 assert.deepEqual(auditNpcDepth(publishedWorld).issues.filter(i=>ids.has(i.id)),[]);
});

test('冻结原档首次预演不写入，正式发布闭合15事件30人且仅更新桑坂',async t=>{
 const temp=await fs.mkdtemp(path.join(tmpRoot(),'t85-publication-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const worldRoot=path.join(temp,'world');
 // A3 archives actions and ontology in loadWorld; the isolated edition must carry both for the unchanged full-world equality check.
 // S5-06: ecology is an authored input of this edition; retain full-world equality.
 for(const dir of ['meta','geo','people','lore','law','design','rules','templates','actions','ontology','ecology'])await fs.cp(path.resolve('world',dir),path.join(worldRoot,dir),{recursive:true});
 await fs.cp(root,path.join(worldRoot,'drafts/w1/sb-depth'),{recursive:true});
 const baseline=path.join(worldRoot,'people/baseline.json');await fs.writeFile(baseline,JSON.stringify(world.npcs));
 const manifest=path.join(worldRoot,'drafts/w1/sb-depth/first-review/manifest.json'),before=await fs.readFile(baseline);
 const preview=await publishNpcDepth({manifest});
 assert.equal(preview.published,false);assert.deepEqual(preview.changed,['people/baseline.json']);
 assert.deepEqual(preview.amendedNpcIds.slice().sort(),[...ids].sort());assert.deepEqual(preview.selectedQuality.issues,[]);
 assert.equal(preview.eventClosure.length,30);assert.equal(new Set(preview.eventClosure.map(e=>e.eventId)).size,15);
 assert.ok(preview.eventClosure.every(e=>e.closed));assert.deepEqual(await fs.readFile(baseline),before);
 assert.deepEqual(await publishNpcDepth({manifest,publish:true}),{...preview,published:true});
 const after=await loadWorld(worldRoot);assert.deepEqual(after,publishedWorld);
});

test('桑坂已发布完整卡重发零写入，不重复追加共享记忆',async()=>{
 const bytes=await fs.readFile(baseline),stat=await fs.stat(baseline);
 for(const publish of [false,true]){
  const repeat=await publishNpcDepthSerial({manifest:publicationManifest,publish});
  assert.equal(repeat.published,publish);assert.deepEqual(repeat.changed,[]);assert.deepEqual(repeat.changes,[]);
  assert.deepEqual(repeat.eventClosure,[]);assert.equal(repeat.baselineSourceHash,repeat.baselineResultHash);
  assert.deepEqual(repeat.selectedQuality.issues,[]);assert.equal(repeat.amendedNpcIds.length,30);assert.equal(repeat.modelCalls,0);
  assert.deepEqual(await fs.readFile(baseline),bytes);assert.equal((await fs.stat(baseline)).mtimeMs,stat.mtimeMs);
 }
});

test('桑坂30人定点候选覆盖实际383缺口，合并视图无缺口且无新增人口',()=>{
 const cohort=world.npcs.filter(n=>n.settlement==='loc_bs_sangban'&&n.tier==='full');
 assert.equal(cohort.length,30);assert.deepEqual(new Set(entries.map(e=>e.id)),new Set(cohort.map(n=>n.id)));
 const issues=auditNpcDepth(world).issues.filter(i=>cohort.some(n=>n.id===i.id));
 assert.equal(issues.length,383);
 const key=i=>JSON.stringify([i.id,i.field,i.code]);
 assert.deepEqual(new Set(entries.flatMap(e=>e.issues).map(key)),new Set(issues.map(key)));
 assert.deepEqual(auditNpcDepth(merged).issues.filter(i=>i.id.startsWith('npc_sb_')),[]);
 assert.equal(merged.npcs.length,world.npcs.length);assert.deepEqual(merged.residents,world.residents);
 for(const n of world.npcs.filter(n=>!n.id.startsWith('npc_sb_')))assert.deepEqual(merged.npcs.find(x=>x.id===n.id),n);
 assert.equal(auditNpcDepth(merged).legacyTraits.ok,true);
});
test('T09追加凭证仅允许原双人发言归属，同步四叶且不扩大秘密或其它事件',async()=>{
 const {currentOptions}=await import('../world/drafts/w1/sb-depth/complete-003b.mjs');
 const options=await currentOptions(),prepared=await prepareDepthRevision(options);
 const original=JSON.parse(await fs.readFile(backgroundFile,'utf8'));
 const parent={entries:prepared.foundation.entries,background:{...original,sourceHash:hashContent(original)},receipt:{backgroundFile:'authored-background.json'}};
 const readFile=file=>fs.readFile(file,'utf8').then(JSON.parse),safeFile=file=>path.resolve(firstReviewRoot,file);
 const next=await readFile(options.authoredBackground);
 const checked=await sourceAuthorization(prepared.plan,prepared.reopening,prepared.records,parent,next,readFile,safeFile);
 assert.deepEqual(checked.sourcePermissions.map(a=>[a.id,a.paths]),[['npc_sb_chishan',['knowledge.known[2]','memorySeeds[2]']],['npc_sb_chayue',['knowledge.known[2]','memorySeeds[2]']]]);
 for(const mutate of [b=>b.events[10].actors.push('npc_sb_qinwan'),b=>b.events[10].sourceRefs[0].publicSpeech='我答应让出树根边的位置。',b=>b.events[11].narrative+='已经商定工事。',b=>b.events[10].associations[1].viewpoint+='我知道池杉的秘密。']){
  const forged=structuredClone(next);mutate(forged);await assert.rejects(sourceAuthorization(prepared.plan,prepared.reopening,prepared.records,parent,forged,readFile,safeFile));
 }
 const withoutRegistration={...prepared.reopening,sourceAuthorizations:[]};await assert.rejects(sourceAuthorization(prepared.plan,withoutRegistration,prepared.records,parent,next,readFile,safeFile),/缺清单追加授权/);
});

function leafDiff(a,b,prefix=''){
 if(JSON.stringify(a)===JSON.stringify(b))return [];
 if(a===undefined||b===undefined||typeof a!=='object'||typeof b!=='object'||a===null||b===null)return [prefix];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>leafDiff(a[key],b[key],Array.isArray(a)?`${prefix}[${key}]`:prefix?`${prefix}.${key}`:key));
}

test('每项补丁仅修改失败叶或必要追加，原记忆、已知与目标进展冻结',()=>{
 for(const e of entries){
  const before=world.npcs.find(n=>n.id===e.id),after=applyDepthDraft(e.before,patchDraft(e));
  assert.deepEqual(e.before,before);assert.equal(e.baseHash,hashContent(before));
  verifyUnchanged(before,after,e);assert.deepEqual(validateDraft(patchDraft(e),e).errors,[]);
  for(const leaf of leafDiff(before,after))assert.ok(e.patches.some(p=>leaf===p.path||leaf.startsWith(p.path+'.')||leaf.startsWith(p.path+'[')),`${e.id}/${leaf}`);
  assert.deepEqual(after.memorySeeds.slice(0,before.memorySeeds.length),before.memorySeeds);
  assert.deepEqual(after.knowledge.known.slice(0,before.knowledge.known.length),before.knowledge.known);
  for(const field of ['coins','inventory','skills','proficiencies','services','serviceCatalog','age','identity','traits','appearance','home','schedule','secrets','authoredFacts.privateFact','opinions.neighbors[0]','voice.habits','voice.samples'])assert.deepEqual(getPath(after,field),getPath(before,field));
  for(const term of ['short','mid','long']){
   const {steps,...old}=before.goals[term][0],{steps:next,...retained}=after.goals[term][0];
   assert.deepEqual(retained,old);assert.equal(next[0].status,'pending');assert.notEqual(next[0].content,old.content);
  }
  for(const [i,r] of before.relationships.entries()){const {note,...old}=r,{note:next,...retained}=after.relationships[i];assert.deepEqual(retained,old);assert.ok(next.includes(world.npcs.concat(world.residents).find(n=>n.id===r.with).name));}
 }
});

test('3至4人小批完整覆盖，共享冲突未解决，相认记忆只使用原同村关系',()=>{
 assert.equal(config.cohorts.length,8);
 assert.deepEqual(new Set(config.cohorts.flatMap(c=>c.participants)),new Set(entries.map(e=>e.id)));
 assert.equal(config.cohorts.flatMap(c=>c.participants).length,30);
 for(const cohort of config.cohorts)assert.ok(cohort.participants.length>=3&&cohort.participants.length<=5);
 assert.equal(source.sharedEvents.length,15);
 for(const [i,event] of source.sharedEvents.entries()){
  const copies=event.knownBy.map(id=>merged.npcs.find(n=>n.id===id).memorySeeds.find(m=>m.id===event.id));
  assert.equal(copies.length,2);assert.deepEqual(copies[0],copies[1]);
  for(const record of event.sourceRecords){const before=entries.find(e=>e.id===record.id).before;assert.deepEqual(record.relationships,before.relationships);assert.deepEqual(record.socialProfile,before.socialProfile);}
  if(i<11){assert.match(event.event,/尚未商定/);for(const record of event.sourceRecords)assert.ok(record.socialProfile.conflicts.some(c=>event.knownBy.includes(c.with)));}
  else {assert.match(event.event,/只相互招呼，没有商定工事/);assert.ok(event.sourceRecords.some(n=>n.relationships.some(r=>event.knownBy.includes(r.with)&&r.type==='同村日常往来')));assert.doesNotMatch(event.event,/掌握|学会|职业|付款|交付|秘密|财产/);}
 }
 assert.equal(source.modelCalls,0);assert.equal(source.status,'offline-authored-awaiting-L2-L4');
});

test('不能篡改合格字段或原身份，不兼容的共享结局会被拒绝',()=>{
 const changed=structuredClone(config.patchRows);changed[0].patches.push({path:'voice.habits[0]',value:'修改原习惯'});
 assert.throws(()=>depthEntries(changed.map(r=>r.before),{revision:config.revision,patchRows:changed},world),/未报错/);
 const modified=structuredClone(entries),e=modified[0];e.facts.memorySeeds.at(-1).event='张洛与袁卿已经商定修枝工与采叶工安排。';
 assert.throws(()=>validatePatchResults(modified,world),/缺口/);
});

test('L2输入包含每个修订叶与原值，原关系来源单独冻结待审核',()=>{
 for(const e of entries){const context=contextFor(e,world),request=buildReviewRequest(e,patchDraft(e),context),payload=JSON.parse(request.messages[1].content);
  assert.ok(payload.publishedFacts);
  for(const p of e.patches){const r=payload.publishedFacts.revisions.find(r=>r.path===p.path);assert.ok(r);assert.deepEqual(r.after,p.value);assert.deepEqual(r.before,getPath(e.before,p.path)??null);}
 }
});

test('prepare重复执行不写正式档和冻结文件，不创建预算或审核结果，manifest可迁移',async()=>{
 const saved=await fs.readFile(baseline,'utf8');
 const names=['base','candidate','foundation','manifest'],frozen=await Promise.all(names.map(read));
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 const args=['tools/npc-depth.mjs','--design','world/design/w1-sb-depth.mjs','--root','world/drafts/w1/sb-depth','--prepare'];
 for(let i=0;i<2;i++){const result=await exec(process.execPath,args,{env});assert.deepEqual(JSON.parse(result.stdout),{entries:30,formalWrite:false,modelCalls:0});}
 assert.equal(await fs.readFile(baseline,'utf8'),saved);assert.deepEqual(await Promise.all(names.map(read)),frozen);
 for(const name of ['budget','allocation','terminal','batch-0'])await assert.rejects(fs.stat(path.join(root,name+'.json')),/ENOENT/);
 const manifest=JSON.parse(await read('manifest'));assert.equal(manifest.worldRoot,'../../..');assert.equal(manifest.design,'design/w1-sb-depth.mjs');assert.equal(manifest.root,'drafts/w1/sb-depth');
 assert.equal(manifest.foundationHash,hashContent(JSON.parse(await read('foundation'))));
 assert.deepEqual(JSON.parse(await read('candidate')),entries.map(patchDraft));
});

test('来源预检只改变8个原许可叶，保留v1原字节证据和365个正确补丁',async()=>{
 const report=JSON.parse(await read('author-precheck')),previous=JSON.parse(await fs.readFile(path.join(root,'offline-v1-evidence/candidate.json'),'utf8'));
 const differences=[];
 for(const old of previous){const current=config.patchRows.find(r=>r.id===old.id);assert.equal(current.patches.length,old.patches.length);
  for(const patch of old.patches){const next=current.patches.find(p=>p.path===patch.path);assert.ok(next);if(JSON.stringify(next.value)!==JSON.stringify(patch.value))differences.push({id:old.id,field:patch.path,before:patch.value,after:next.value});}
 }
 assert.equal(differences.length,8);assert.deepEqual(differences.map(d=>[d.id,d.field]).sort(),report.changes.map(d=>[d.id,d.field]).sort());
 for(const difference of differences){const note=report.changes.find(d=>d.id===difference.id&&d.field===difference.field);assert.deepEqual(difference.before,note.before);assert.deepEqual(difference.after,note.after);assert.ok(config.patchRows.find(r=>r.id===difference.id).issues.some(i=>i.field===difference.field));}
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'offline-v1-evidence/base.json'),'utf8')),config.patchRows.map(r=>r.before));
 for(const snapshot of report.snapshots){const raw=await fs.readFile(path.resolve(snapshot.rawPath));const original=snapshot.originalEol==='CRLF'?raw.toString('utf8').replaceAll('\r\n','\n').replaceAll('\n','\r\n'):raw.toString('utf8').replaceAll('\r\n','\n');assert.equal(crypto.createHash('sha256').update(original).digest('hex'),snapshot.sha256);}
 assert.equal(report.approvals.L4,'not-approved');assert.equal(report.approvals.L2,'not-run');assert.equal(report.approvals.T25OptIn,false);
});

test('桑坂实际名册/目标列、正式性别和全部代词叶的出处可逐项核验',async()=>{
 const packets=JSON.parse(await read('source-reading-packets')),pronouns=JSON.parse(await read('pronoun-precheck'));
 const roster=new Map(sangbanRoster.trim().split('\n').map(l=>{const r=l.split('|');return ['npc_sb_'+r[1],r];})),full=new Map(sangbanFull.trim().split('\n').map(l=>{const r=l.split('|');return ['npc_sb_'+r[0],r];}));
 assert.equal(packets.relationshipChecks.length,89);assert.equal(packets.goalChecks.length,90);
 for(const check of packets.relationshipChecks){const r=roster.get(check.with);if(r){assert.equal(check.source.quote,r[7]);assert.equal(check.source.traits,r[6]);assert.equal(check.name,r[2]);}assert.equal(check.sex,world.npcs.concat(world.residents).find(n=>n.id===check.with).sex);}
 for(const check of packets.goalChecks){const term=check.path.match(/^goals\.(short|mid|long)\[/)[1];assert.equal(check.source.authorRow.goalIndex,{short:10,mid:11,long:12}[term]);assert.equal(check.source.goal.content,full.get(check.id)[check.source.authorRow.goalIndex]);}
 const actual=entries.flatMap(e=>e.patches.filter(p=>typeof p.value==='string'&&/[他她]/.test(p.value)).map(p=>[e.id,p.path]));assert.deepEqual(actual.sort(),pronouns.checks.map(c=>[c.id,c.path]).sort());
 for(const check of pronouns.checks){const person=world.npcs.concat(world.residents).find(n=>n.id===check.referent);assert.ok(person);assert.equal(person.sex,check.pronoun==='他'?'男':'女');assert.equal(check.text,entries.find(e=>e.id===check.id).patches.find(p=>p.path===check.path).value);}
});

test('15个新共同事件没有冒充原明确亲历，出处哈希只指正式来源，未启用T25',async()=>{
 const classification=JSON.parse(await read('source-classification'));assert.equal(classification.T25OptIn,false);assert.equal(classification.backgrounds.length,15);
 assert.equal(classification.leafClassifications.length,373);assert.ok(classification.leafClassifications.every(c=>c.approval==='unreviewed-L2-L4'));
 for(const background of classification.backgrounds){assert.equal(background.oldSameEventExplicitlySupported,false);assert.equal(background.classification,'new-authored-public-background');assert.ok(background.sourceRefs.length>=3);
  for(const ref of background.sourceRefs){const collection={'people/baseline.json':world.npcs,'geo/settlements.json':world.settlementProfiles,'geo/locations.json':world.locations}[ref.file];assert.ok(collection);assert.deepEqual(getPath(collection.find(n=>n.id===ref.id),ref.field),ref.value);assert.equal(hashContent(ref.value),ref.contentHash);assert.doesNotMatch(ref.field,/secrets|privateFact/);}
  assert.ok(background.newFacts.includes('具体共同在场地点'));assert.ok(background.forbiddenResults.some(s=>s.includes('私密')));
 }
});

const firstReviewRoot=path.join(root,'first-review'),backgroundFile=path.join(firstReviewRoot,'authored-background.json');
const background=JSON.parse(await fs.readFile(backgroundFile,'utf8'));

test('T25官方纯验证接受15组独立出处，3人网络不扩大二人共享知情者',()=>{
 const validated=validateAuthoredBackground(background,entries,world);
 assert.equal(validated.events.length,15);assert.equal(background.reviewStatus,'pending-independent-L2-L4');
 assert.equal(new Set(validated.events.flatMap(e=>e.actors)).size,30);
 for(const [index,event] of background.events.entries()){
  assert.equal(event.network.actors.length,3);assert.equal(event.actors.length,2);assert.equal(event.network.nonWitnessActors.length,1);
  assert.ok(!event.actors.includes(event.network.nonWitnessActors[0]));
  const person=world.residents.find(n=>n.id===event.network.nonWitnessActors[0]);assert.ok(person.age>=18);
  assert.ok(event.actors.some(id=>world.npcs.find(n=>n.id===id).household.includes(person.id)));
  const p=event.network.problemRef,problem=getPath(world[p.collection].find(row=>row.id===p.id),p.field);
  assert.equal(p.hash,hashContent(problem));
  if(index<5){assert.equal(p.collection,'settlementProfiles');assert.equal(problem.public,true);assert.equal(problem.id,`problem_sb_${index+1}`);}
  else {assert.equal(p.collection,'npcs');assert.equal(p.visibility,'private');assert.ok(p.publicSpeech);assert.equal(p.field,'goals.short[0].content');}
  for(const ref of event.sourceRefs){assert.equal(ref.hash,hashContent(getPath(world[ref.collection].find(row=>row.id===ref.id),ref.field)));if(['npcs','residents'].includes(ref.collection)){assert.equal(ref.visibility,'private');assert.doesNotMatch(ref.field,/secrets|privateFact|knowledge|memorySeeds/);}}
  for(const actor of event.actors){const n=world.npcs.find(n=>n.id===actor);for(const [i,secret] of n.secrets.entries())assert.ok(event.risks.some(r=>r.id===actor&&r.field===`secrets[${i}]`&&r.hash===hashContent(secret)));assert.ok(event.risks.some(r=>r.id===actor&&r.field==='authoredFacts.privateFact'&&r.hash===hashContent(n.authoredFacts.privateFact)));
   const association=event.associations.find(a=>a.id===actor),entry=entries.find(e=>e.id===actor),memory=entry.patches.find(p=>p.path===association.path).value;
   assert.ok(association.viewpoint);assert.equal(association.factsHash,hashContent(event.designedFacts));assert.equal(memory.event,association.narrative);assert.equal(memory.location,event.location);assert.deepEqual(memory.knownBy,event.actors);
  }
 }
});

test('桑坂独立出处拒绝候选自证、过期字段、泄密及未参加者获知',()=>{
 for(const change of [b=>b.events[0].sourceRefs[0].collection='candidate',b=>b.events[0].sourceRefs[0].hash='stale',b=>b.events[0].risks.splice(0,1),b=>b.events[0].sourceRefs.find(r=>r.collection==='npcs').visibility='public',b=>b.events[0].designedFacts.push(world.npcs.find(n=>n.id===b.events[0].actors[0]).secrets[0].content)]){
  const invalid=structuredClone(background);change(invalid);assert.throws(()=>validateAuthoredBackground(invalid,entries,world));
 }
 // This is an actual extra copy of event 1, unlike memory ID 10 sharing a prefix.
 const changed=structuredClone(entries),outsider=changed.find(e=>e.id==='npc_sb_feiqing');
 outsider.patches.find(p=>p.path.startsWith('memorySeeds[')).value.event=background.events[0].narrative;
 assert.throws(()=>validateAuthoredBackground(background,changed,world),/未参与者|事件事实/);
 const included=depthEntries(config.patchRows.map(r=>r.before),{...config,authoredBackground:background},world);
 for(const entry of included){const context=contextFor(entry,world),request=buildReviewRequest(entry,patchDraft(entry),context),payload=JSON.parse(request.messages[1].content);
  assert.equal(payload.publishedFacts.authoredBackground.sourceHash,hashContent(background));
  assert.ok(payload.publishedFacts.authoredBackground.events.every(event=>event.privateRisks.length===event.risks.length));
  assert.throws(()=>checkIncrementalReview({contradictions:[],reviewedPaths:entry.patches.map(p=>p.path)},entry,context),/完整三字段/);
  assert.throws(()=>checkIncrementalReview({contradictions:[],reviewedPaths:entry.patches.map(p=>p.path),backgroundReviews:[]},entry,context),/缺独立事件出处L2/);
 }
});

test('官方来源prepare保持原产物与候选，首审冻结目录重跑零写入且无预算',async()=>{
 const evidence=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'opt-in-evidence.json'),'utf8'));
 assert.equal(evidence.cardId,'T09');assert.equal(evidence.modelCalls,0);assert.deepEqual(evidence.candidateChanges,[]);
 for(const old of evidence.previousFiles)assert.equal(hashContent(JSON.parse(await fs.readFile(path.resolve(firstReviewRoot,old.path),'utf8'))),old.contentHash);
 const files=['base.json','candidate.json','foundation.json','manifest.json','authored-background.json'];
 const before=await Promise.all(files.map(async name=>({name,hash:hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,name),'utf8'))),mtime:(await fs.stat(path.join(firstReviewRoot,name))).mtimeMs})));
 const runtimeFiles=['budget.json','allocation.json','terminal.json','batch-0.json','incremental-l4.json','npc_sb_zhangluo.json'];
 const optionalBytes=name=>fs.readFile(path.join(firstReviewRoot,name),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const runtimeBefore=await Promise.all(runtimeFiles.map(optionalBytes));
 const env={...process.env};delete env.DEEPSEEK_API_KEY;
 const result=await exec(process.execPath,['tools/npc-depth.mjs','--design','world/design/w1-sb-depth.mjs','--root',firstReviewRoot,'--authored-background',backgroundFile,'--card','T09','--prepare'],{env});
 assert.deepEqual(JSON.parse(result.stdout),{entries:30,formalWrite:false,modelCalls:0});
 for(const old of before){assert.equal(hashContent(JSON.parse(await fs.readFile(path.join(firstReviewRoot,old.name),'utf8'))),old.hash);assert.equal((await fs.stat(path.join(firstReviewRoot,old.name))).mtimeMs,old.mtime);}
 const manifest=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'manifest.json'),'utf8'));assert.equal(manifest.authoredBackgroundHash,hashContent(background));
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(firstReviewRoot,'candidate.json'),'utf8')),JSON.parse(await read('candidate')));
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(firstReviewRoot,'base.json'),'utf8')),JSON.parse(await read('base')));
 assert.deepEqual(await Promise.all(runtimeFiles.map(optionalBytes)),runtimeBefore,'零模型prepare不能改变任何已存在的真实审核/预算记录，也不能创建缺失记录');
});

test('T09官方零模型预检保留120份完整请求，最小性别附件逐值匹配原源且不改变指纹',async()=>{
 const report=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'request-preflight.json'),'utf8'));
 const prepared=await prepareDepth({worldRoot:path.resolve('world'),design:path.resolve('world/design/w1-sb-depth.mjs'),root:firstReviewRoot,authoredBackground:backgroundFile,cardId:'T09'});
 const {gaps,supplements}=await sourceRequirements(prepared);
 assert.equal(report.modelCalls,0);assert.equal(report.approvals.L2,'not-run');assert.equal(report.approvals.L4,'not-approved');
 assert.deepEqual(report.sourceGapsBefore,gaps);assert.equal(gaps.length,16);assert.equal(gaps.filter(g=>g.missingIn.includes('review')).length,12);assert.equal(gaps.filter(g=>g.sourceId===g.id).length,4);assert.equal(supplements.size,11);assert.deepEqual(report.remainingSourceGaps,[]);
 assert.deepEqual(report.sourceCoverage,{originalSourceOccurrences:172,uniqueOriginalFields:145,privateRiskOccurrences:60,patchLeaves:373,events:15});
 const map=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'source-evidence-map.json'),'utf8'));
 assert.deepEqual(new Set(Object.keys(map)),new Set(supplements.keys()));
 const checkout=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'complete-002/checkout-byte-witness.json'),'utf8'));
 for(const frozen of report.frozen){
  const raw=await fs.readFile(path.resolve(frozen.file),'utf8'),witness=checkout.witnesses.find(w=>w.file===frozen.file),sha=text=>crypto.createHash('sha256').update(text).digest('hex');
  if(witness){assert.equal(witness.originalSha256,frozen.sha256);assert.equal(witness.originalEol,'CRLF');assert.equal(witness.checkoutEol,'LF');assert.ok([witness.checkoutSha256,witness.originalSha256].includes(sha(raw)),'检出字节必须精确匹配已记录的两种换行凭证之一');assert.equal(sha(raw.replaceAll('\r\n','\n')),witness.checkoutSha256);assert.equal(sha(raw.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),frozen.sha256);}
  else assert.equal(sha(raw),frozen.sha256);
  if(frozen.contentHash)assert.equal(hashContent(JSON.parse(raw)),frozen.contentHash);
 }
 for(const attachment of report.attachments){
  const raw=await fs.readFile(path.join(firstReviewRoot,attachment.file),'utf8'),data=JSON.parse(raw),entry=prepared.entries.find(e=>e.id===attachment.id);
  assert.deepEqual(data,supplements.get(entry.id));validateSourceEvidence(data,entry,prepared.world);
  // Preserve preflight's emitted bytes separately from checkout line endings.
  assert.equal(hashContent(attachment.raw),attachment.rawHash);assert.equal(crypto.createHash('sha256').update(attachment.raw).digest('hex'),attachment.sha256);assert.deepEqual(JSON.parse(attachment.raw),data);assert.equal(hashContent(data),attachment.contentHash);
  assert.ok(data.sourceRecords.every(row=>Object.keys(row).every(k=>['id','name','sex'].includes(k))));
  const invalid=structuredClone(data);invalid.sourceRecords[1].sex='未知';assert.throws(()=>validateSourceEvidence(invalid,entry,prepared.world));
 }
 for(const format of ['full','compact']){
  let draftSum=0,reviewSum=0;
  for(const entry of prepared.entries){
   const context=contextFor(entry,prepared.world),draft=patchDraft(entry);
   const requests=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'request-preflight',format,entry.id+'.json'),'utf8'));
   // Draft builder is independent of full/compact. Review compact only removes
   // data that the official validator proves reconstructible.
   const expectedDraft=buildDraftRequest(entry,null,context),expectedReview=format==='compact'?compactReviewRequest(buildReviewRequest(entry,draft,context)):buildReviewRequest(entry,draft,context);
   if(supplements.has(entry.id))for(const request of [expectedDraft,expectedReview])request.messages.push({role:'user',content:JSON.stringify(supplements.get(entry.id))});
   assert.deepEqual(requests.draft,requestMeasure(expectedDraft));assert.deepEqual(requests.review,requestMeasure(expectedReview));
   const payload=JSON.parse(requests.review.body.messages[1].content);
   assert.equal(payload.publishedFacts.authoredBackground.sourceHash,hashContent(background));
   for(const event of payload.publishedFacts.authoredBackground.events){
    assert.equal(event.originalSources.length,event.sourceRefs.length);assert.equal(event.privateRisks.length,event.risks.length);
    for(const ref of event.originalSources){assert.equal(hashContent(ref.value),ref.hash);assert.deepEqual(ref.value,getPath(prepared.world[ref.collection].find(n=>n.id===ref.id),ref.field));}
   }
   const coverage=report.coverage.find(c=>c.id===entry.id);assert.equal(coverage.entryHash,hashContent(entry));assert.equal(coverage.contextHash,hashContent(context));assert.deepEqual(coverage.patchPaths,entry.patches.map(p=>p.path));
   const contract={contradictions:[],reviewedPaths:coverage.patchPaths,backgroundReviews:coverage.backgrounds.map(e=>({...e,contradictions:[]}))};
   assert.deepEqual(checkIncrementalReview(contract,entry,context),[]);
   const lost=structuredClone(contract);lost.backgroundReviews[0].reviewedRiskPaths.pop();assert.throws(()=>checkIncrementalReview(lost,entry,context));
   draftSum+=requests.draft.ceilingYuan;reviewSum+=requests.review.ceilingYuan;
  }
  const measured=report.formats[format];assert.equal(measured.providerCalls,0);assert.equal(measured.isolatedReservationYuan,0);assert.equal(measured.officialDraftBudgetProbes,30);assert.equal(measured.reviewBuilderBudgetHandoffProbes,30);
  assert.equal(draftSum,measured.draftCeilingYuan);assert.equal(reviewSum,measured.reviewCeilingYuan);assert.ok(Math.abs(draftSum+reviewSum-measured.totalCeilingYuan)<1e-10);
  assert.ok(draftSum>3);assert.equal(measured.fitsOriginalCard,false);assert.equal(measured.fitsSharedCeilingSum,false);
 }
 assert.equal(report.sharedBudget.root,'F:/dnd/world/drafts/m4-object');assert.equal(report.sharedBudget.readOnly,true);assert.equal(report.sharedBudget.unchanged,true);assert.equal(report.sharedBudget.sha256,report.sharedBudget.sha256After);
 assert.ok(report.reservationEnvelopeYuan.lower>3);assert.ok(report.reservationEnvelopeYuan.upper>report.reservationEnvelopeYuan.lower);
 for(const name of ['budget.json','allocation.json','terminal.json','first-source-evidence.json'])await assert.rejects(fs.stat(path.join(firstReviewRoot,name)),/ENOENT/);
 // The historical zero-model request report remains unapproved. The later
 // real L4 receipt must bind to the final authorized correction, not T48.
 assert.equal(report.approvals.L4,'not-approved');
 const laterL4=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'incremental-l4.json'),'utf8'));
 const finalPlan=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'complete-003b/plan.json'),'utf8'));assert.equal(laterL4.authorizationHash,hashContent(finalPlan));
});
test('桑坂最终30人真实审核与阅读凭证匹配，随机评分有原句，15事件发布预演闭合',async()=>{
 const {currentOptions}=await import('../world/drafts/w1/sb-depth/complete-003b.mjs'),options=await currentOptions(),prepared=await prepareDepthRevision(options);
 const readJSON=file=>fs.readFile(path.join(firstReviewRoot,file),'utf8').then(JSON.parse);
 const l4=await readJSON('incremental-l4.json'),summary=await readJSON('summary.json'),score=await readJSON('complete-003b/wave-score.json'),selection=await readJSON('complete-003b/l4-selection.json'),preview=await readJSON('complete-003b/publication-preview.json');
 assert.equal(summary.passed,30);assert.equal(summary.manual,0);assert.ok(summary.batches.every(b=>b.l4.approved));assert.equal(l4.candidates.length,30);assert.equal(l4.backgrounds.length,15);
 for(const e of prepared.entries){const record=await readJSON(e.id+'.json'),note=l4.candidates.find(n=>n.id===e.id);assert.equal(record.status,'passed');assert.deepEqual(JSON.parse(record.reviewRecovery.response.choices[0].message.content),record.review);assert.ok(!checkIncrementalReview(record.review,e,prepared.contexts.get(e.id)).some(i=>i.severity==='hard'));assert.equal(note.draftHash,hashContent(record.draft));assert.equal(note.reviewHash,hashContent(record.review));assert.deepEqual(note.reviewedPaths,e.patches.map(p=>p.path));}
 assert.deepEqual(score.samples.map(s=>s.id),selection.waveSample);assert.equal(score.samples.length,10);
 const values=score.samples.flatMap(s=>Object.values(s.ratings).map(r=>{assert.ok(JSON.stringify(prepared.entries.find(e=>e.id===s.id).facts).includes(r.quote));assert.ok(r.reason.trim());return r.score;}));
 assert.equal(values.length,60);assert.equal(Math.min(...values),score.minimum);assert.equal(values.reduce((a,b)=>a+b,0)/60,score.mean);assert.ok(score.mean>=4&&score.minimum>=3);
 assert.equal(preview.published,false);assert.equal(preview.selectedQuality.checked,30);assert.deepEqual(preview.selectedQuality.issues,[]);assert.equal(new Set(preview.eventClosure.map(e=>e.eventId)).size,15);assert.equal(preview.eventClosure.length,30);assert.ok(preview.eventClosure.every(e=>e.closed));
});

test('T09历史首审保留42次真实原文、旧费用与当时未闭合的两人，不因续审覆盖历史',async()=>{
 const prepared=await prepareDepth({worldRoot:path.resolve('world'),design:path.resolve('world/design/w1-sb-depth.mjs'),root:firstReviewRoot,authoredBackground:backgroundFile,cardId:'T09'});
 const first=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'complete-002/first-l2-records.json'),'utf8'));
 const current=await Promise.all(prepared.entries.map(e=>fs.readFile(path.join(firstReviewRoot,e.id+'.json'),'utf8').then(JSON.parse)));
 const rows=current.map(record=>{while(record.incremental)record=record.reviewRecovery.prior;return record;});
 assert.equal(first.filter(r=>r.status==='passed').length,18);assert.equal(rows.filter(r=>r.status==='passed').length,28);assert.deepEqual(rows.filter(r=>r.status==='manual').map(r=>r.id),['npc_sb_chishan','npc_sb_longfu']);
 let calls=0,cost=0;
 for(const row of rows){
  const entry=prepared.entries.find(e=>e.id===row.id),old=first.find(r=>r.id===row.id),context=contextFor(entry,prepared.world);
  assert.deepEqual(row.draft,patchDraft(entry));assert.equal(row.draftResponse,undefined,'不得伪造模型draft回显');
  if(old.status==='passed')assert.deepEqual(row,old,'未变passed不得重审或改写原文');
  else {assert.deepEqual(row.reviewRecovery.prior,old);assert.equal(row.responseEvidence.length,2);}
  assert.equal(row.reviewRecovery.requestHash,hashContent(row.reviewRecovery.request));
  assert.deepEqual(checkIncrementalReview(row.review,entry,context).filter(e=>e.severity==='hard'),row.errors);
  const response=row.reviewRecovery.response;assert.deepEqual(JSON.parse(response.choices[0].message.content),row.review);
  for(const proof of row.responseEvidence){assert.equal(proof.phase,'review');assert.ok(proof.requestId);}
  calls+=row.responseEvidence.length;cost+=row.measurements.reduce((n,m)=>n+m.costUpperYuan,0);
 }
 assert.equal(calls,42);assert.ok(Math.abs(cost-2.46694448)<1e-10);
 assert.ok(rows.filter(r=>r.status==='manual').every(r=>r.errors.some(e=>e.severity==='hard')));
 const stopped=JSON.parse(await fs.readFile(path.join(firstReviewRoot,'complete-002/stopped-report.json'),'utf8'));
 assert.equal(stopped.passed,28);assert.deepEqual(stopped.manual,['npc_sb_chishan','npc_sb_longfu']);assert.equal(stopped.modelCalls,42);assert.equal(stopped.costUpperYuan,2.46694448);assert.match(stopped.L4,/not-approved/);
});
