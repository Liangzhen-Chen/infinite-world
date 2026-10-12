// Offline artifact preparation for the original T08 tree. No provider or budget writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {loadWorld} from '../../../../../tools/load-world.mjs';
import {auditNpcDepth} from '../../../../../tools/audit-npc-depth.mjs';
import {depthEntries,patchDraft,validateDraft,validatePatchResults,getPath,validateAuthoredBackground} from '../../../../../tools/npc-depth-content.mjs';
import {prepareDepthRevision} from '../../../../../tools/npc-depth.mjs';
import * as design from '../../../../design/w1-lq-depth.mjs';

const out=path.dirname(fileURLToPath(import.meta.url));
const legacy=path.dirname(out),root=path.join(legacy,'author-v2/first-review');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=async(name,value)=>{
 const file=path.join(out,name+'.json'),text=JSON.stringify(value,null,2)+'\n';
 if(await fs.readFile(file,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return null;})!==text)await fs.writeFile(file,text);
};
const relative=file=>path.relative(root,file).replaceAll('\\','/');
const authorizationId='user-reopen-20261012-01';
const priorHashes=await read(path.join(out,'historical-hashes.json')).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
if(priorHashes)for(const ref of priorHashes.files){
 const raw=(await fs.readFile(path.resolve(root,ref.file),'utf8')).replace(/\r\n/g,'\n');
 assert.equal(hashContent(raw),ref.textHashLF,'historical file changed; do not regenerate old evidence: '+ref.file);
 if(ref.contentHash)assert.equal(hashContent(JSON.parse(raw)),ref.contentHash);
}
const foundation=await read(path.join(root,'foundation.json')),base=await read(path.join(root,'base.json')),candidate=await read(path.join(root,'candidate.json'));
const backgroundFile=path.join(root,'authored-background.json'),background=await read(backgroundFile);
const first=await read(path.join(root,'first-real-review-report.json'));
const world=await loadWorld(path.resolve('world'));
const entries=depthEntries(base,{...design,authoredBackground:background},world);
validateAuthoredBackground(background,entries,world);
const merged=validatePatchResults(entries,world);
const records=await Promise.all(entries.map(e=>read(path.join(root,e.id+'.json'))));
const sources=(collection,id,field)=>{
 const person=world[collection].find(p=>p.id===id);assert.ok(person);
 const value=getPath(person,field);assert.notEqual(value,undefined);
 return{collection,id,field,value:structuredClone(value),hash:hashContent(value)};
};
const familyRefs=Object.fromEntries(first.sourceFindings.map(f=>[f.id+'/'+f.field,sources(f.source.collection,f.source.id,f.source.field)]));
const changes=[];
for(const entry of entries){
 const old=foundation.entries.find(e=>e.id===entry.id),record=records.find(r=>r.id===entry.id);
 assert.deepEqual(entry.before,old.before);assert.deepEqual(entry.issues,old.issues);
 assert.deepEqual(entry.patches.map(p=>p.path),old.patches.map(p=>p.path));
 for(const patch of entry.patches){
  const prior=old.patches.find(p=>p.path===patch.path);if(hashContent(prior.value)===hashContent(patch.value))continue;
  const family=familyRefs[entry.id+'/'+patch.path];
  const finding=family?first.sourceFindings.find(f=>f.id===entry.id&&f.field===patch.path):record.review?.contradictions.find(f=>f.field===patch.path);
  assert.ok(finding,'changed leaf must have actual source/L2 failure');
  let refs=[];
  if(family)refs=[family,sources('npcs',entry.id,`relationships[${patch.path.match(/\[(\d+)\]/)[1]}].type`)];
  else if(patch.path.startsWith('relationships')||patch.path.startsWith('opinions.neighbors')){
   const index=Number(patch.path.match(/\[(\d+)\]/)[1]),withId=entry.before.relationships[index].with;
   const collection=world.residents.some(p=>p.id===withId)?'residents':'npcs';
   refs=[sources('npcs',entry.id,`relationships[${index}]`),sources(collection,withId,collection==='residents'?'currentConcern':'occupation')];
  }else if(patch.path==='knowledge.known[2]'){
   refs=[{file:relative(backgroundFile),field:`events[${background.events.findIndex(e=>e.actors.includes(entry.id))}].narrative`,value:background.events.find(e=>e.actors.includes(entry.id)).narrative,hash:hashContent(background.events.find(e=>e.actors.includes(entry.id)).narrative),classification:'frozen-independent-background-still-awaiting-L2-L4'}];
  }else if(patch.path==='goals.long[0].steps[0].content')refs=[sources('npcs',entry.id,'goals.long[0].content')];
  else if(entry.id==='npc_lq_huoji')refs=[sources('npcs','npc_lq_zhouwu','goals.mid[0].content')];
  else refs=[sources('npcs',entry.id,'goals.long[0].content'),sources('npcs','npc_lq_chuyin','occupation')];
  const beforeQuote=typeof prior.value==='string'?prior.value:prior.value.fact;
  assert.ok(beforeQuote.includes(finding.quote??finding.value));
  changes.push({id:entry.id,path:patch.path,before:prior.value,after:patch.value,reason:finding.reason,oldFindingKind:family?'sourceFindings':finding.severity,oldFinding:structuredClone(finding),sourceQuotes:refs,oldRecordHash:hashContent(record),authorizationId});
 }
 assert.deepEqual(validateDraft(patchDraft(entry),entry).errors,[]);
 assert.deepEqual(entry.facts.secrets,entry.before.secrets);
 assert.deepEqual(entry.facts.memorySeeds,old.facts.memorySeeds);
}
assert.equal(changes.length,26);
assert.equal(new Set(changes.map(c=>c.id)).size,10);
for(const f of first.sourceFindings)assert.ok(changes.some(c=>c.id===f.id&&c.path===f.field));
const invalidations={kind:'depth-source-invalidations',authorizationId,l4Approved:false,scope:'Actual offline source reading invalidates operative recognition of the changed candidate; not full L4 approval.',records:[]};
for(const id of new Set(changes.map(c=>c.id))){
 const record=records.find(r=>r.id===id),own=changes.filter(c=>c.id===id);
 const findings=own.filter(c=>c.oldFindingKind==='sourceFindings'||c.oldFindingKind==='soft').map(c=>{
  const ref=c.sourceQuotes.find(r=>r.field==='currentConcern');assert.ok(ref);
  return{path:c.path,quote:typeof c.before==='string'?c.before:c.before.fact,reason:c.reason,sourceConcern:ref.value,sourceId:ref.id,sourceHash:ref.hash};
 });
 if(findings.length)invalidations.records.push({id,operativeStatus:'invalidated-by-L4',historicalStatus:record.status,draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),candidateDraftHash:hashContent(candidate.find(d=>d.id===id)),findings,l4Approved:false});
}
await write('l4-invalidations',invalidations);
const sourceFiles=[path.join(root,'base.json'),backgroundFile,path.join(legacy,'author-v2/foundation.json'),path.resolve('world/people/residents.json'),path.resolve('world/people/baseline.json')];
const plan={kind:'controlled-depth-revision',planningId:authorizationId,authorizationId,cardId:'T08',revision:foundation.revision,foundationHash:hashContent(foundation),baseHash:hashContent(base),candidateHash:hashContent(candidate),sourceHashes:await Promise.all(sourceFiles.map(async file=>({file:relative(file),hash:hashContent(await read(file))}))),invalidationFile:relative(path.join(out,'l4-invalidations.json')),invalidationHash:hashContent(invalidations),authorized:[]};
for(const id of new Set(changes.map(c=>c.id))){
 const record=records.find(r=>r.id===id),own=changes.filter(c=>c.id===id);
 const item={id,recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),candidateDraftHash:hashContent(candidate.find(d=>d.id===id)),paths:own.map(c=>c.path),sourceOnly:false,invalidationSources:own.filter(c=>c.oldFindingKind==='sourceFindings'||c.oldFindingKind==='soft').map(c=>{const r=c.sourceQuotes.find(r=>r.field==='currentConcern');return{path:c.path,collection:r.collection,id:r.id,field:r.field,hash:r.hash};}),historicalStatus:record.status};
 if(!record.draft)item.missingDraftEvidence={recordHash:hashContent(record),status:record.status,errorCode:record.errorCode,errors:record.errors,attempts:record.attempts,candidateDraftHash:item.candidateDraftHash};
 plan.authorized.push(item);
}
await write('controlled-plan',plan);
await write('patch-diff',changes);
await write('candidate-after',entries.map(patchDraft));
// Freeze all pre-existing files, including the 80 requests and missing-provider evidence.
const files=[];
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(file===out)continue;if(item.isDirectory())await walk(file);else{const raw=(await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n');let contentHash=null;if(file.endsWith('.json'))contentHash=hashContent(JSON.parse(raw));files.push({file:relative(file),textHashLF:hashContent(raw),contentHash});}}}
await walk(legacy);files.sort((a,b)=>a.file.localeCompare(b.file));
if(priorHashes)assert.deepEqual(files,priorHashes.files,'historical file list changed; stop offline preparation');
await write('historical-hashes',{authorizationId,sourceCommit:priorHashes?.sourceCommit??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:path.resolve('.')}).trim(),files});
let officialGuard;
try{await prepareDepthRevision({design:path.resolve('world/design/w1-lq-depth.mjs'),root,worldRoot:path.resolve('world'),cardId:'T08',controlledRevision:path.join(out,'controlled-plan.json'),authorizationHash:hashContent(plan),authoredBackground:backgroundFile});officialGuard={accepted:true,modelCalls:0};}
catch(error){officialGuard={accepted:false,error:error.message,modelCalls:0};}
const ids=new Set(entries.map(e=>e.id));
assert.deepEqual(auditNpcDepth(merged).issues.filter(i=>ids.has(i.id)),[]);
const pending=records.filter(r=>r.status==='pending').map(r=>({id:r.id,recordHash:hashContent(r),candidateDraftHash:hashContent(candidate.find(d=>d.id===r.id)),draftExists:!!r.draft,reviewExists:!!r.review,attempts:r.attempts,errors:r.errors,changedPaths:changes.filter(c=>c.id===r.id).map(c=>c.path)}));
const preservedPassed=records.filter(r=>r.status==='passed'&&!changes.some(c=>c.id===r.id)).map(r=>({id:r.id,recordHash:hashContent(r),draftHash:hashContent(r.draft),reviewHash:hashContent(r.review)}));
await write('review-queue',{authorizationId,cardId:'T08',planHash:hashContent(plan),foundationHash:plan.foundationHash,sourceHashes:plan.sourceHashes,modelCalls:0,rows:records.filter(r=>r.status!=='passed'||changes.some(c=>c.id===r.id)).map(r=>({id:r.id,recordHash:hashContent(r),draftHash:hashContent(r.draft),reviewHash:hashContent(r.review),candidateDraftHash:hashContent(candidate.find(d=>d.id===r.id)),nextDraftHash:hashContent(patchDraft(entries.find(e=>e.id===r.id))),historicalStatus:r.status,attempts:r.attempts,changedPaths:changes.filter(c=>c.id===r.id).map(c=>c.path),reviewOnly:!changes.some(c=>c.id===r.id),missingDraft:!r.draft,errors:r.errors})),reusePassed:preservedPassed});
const providerOriginals=[];
for(const r of records.filter(r=>r.status==='manual')){
 const raw=r.firstSourceEvidence?.reviewResponse;
 if(raw){assert.deepEqual(JSON.parse(raw.choices[0].message.content),r.review);providerOriginals.push({id:r.id,available:true,responseHash:hashContent(raw)});}
 else providerOriginals.push({id:r.id,available:false,reason:'Original provider response absent in historical record; parsed latest review retained, no reconstruction.'});
}
await write('offline-report',{kind:'T08-reopen-offline-evidence',authorizationId,planHash:hashContent(plan),modelCalls:0,costYuan:0,formalWrite:false,l2Approved:false,l4Approved:false,publicationPreviewRun:false,familySourceCorrections:6,changedIds:[...new Set(changes.map(c=>c.id))],changedLeaves:changes.length,l1:'passed',t04RemainingIssues:0,sharedEvents:{count:background.events.length,backgroundHash:hashContent(background),changed:false,participantsAndMemoriesPreserved:true,secretsPreserved:true},historicalSummary:first.summary,operativePassed:preservedPassed.length,preservedPassed,pending,providerOriginals,officialGuard,budget:{historicalSpentYuan:2.87060744,userAuthorizedCumulativeLimitYuan:4.5,maxFutureYuan:1.62939256,firstIdMaxYuan:0.5,appliedToBudget:false},nextStage:{requires:'T49 merged and primary chat grants exclusive model slot after T06',root:relative(root),design:'world/design/w1-lq-depth.mjs',controlledPlan:'controlled-plan.json',authoredBackground:relative(backgroundFile),firstId:'npc_lq_luanpei',remainingReviewIds:records.filter(r=>r.status!=='passed'||changes.some(c=>c.id===r.id)).map(r=>r.id),constraints:'Use original card/budget/allocation and fixed authorization; direct full L2 of legal frozen/revised drafts, no paid draft echo; re-read L4 flags + random 5 and score after actual L2 closure. No publication until event closure/T04/preview.'}});
console.log(JSON.stringify({changedIds:10,changedLeaves:changes.length,familySourceCorrections:6,preservedPassed:preservedPassed.length,modelCalls:0,officialGuard}));
