import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import crypto from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {auditNpcDepth} from '../tools/audit-npc-depth.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {depthEntries,patchDraft,applyDepthDraft,verifyUnchanged,validateDraft,validatePatchResults,getPath,contextFor,buildReviewRequest} from '../tools/npc-depth-content.mjs';
import * as config from '../world/design/w1-sb-depth.mjs';
import {sangbanRoster,sangbanFull} from '../world/design/w1-villages-sangban.mjs';

const exec=promisify(execFile),world=await loadWorld(),root=path.resolve('world/drafts/w1/sb-depth');
const entries=depthEntries(config.patchRows.map(r=>r.before),config,world);
const merged=validatePatchResults(entries,world);
const source=JSON.parse(await fs.readFile(path.join(root,'source-evidence.json'),'utf8'));
const baseline=path.resolve('world/people/baseline.json');
const read=name=>fs.readFile(path.join(root,name+'.json'),'utf8');

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
