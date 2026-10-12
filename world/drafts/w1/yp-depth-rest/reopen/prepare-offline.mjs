import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {loadWorld} from '../../../../../tools/load-world.mjs';
import {depthEntries,patchDraft,contextFor,getPath,validateDraft,validatePatchResults} from '../../../../../tools/npc-depth-content.mjs';
import {auditNpcDepth} from '../../../../../tools/audit-npc-depth.mjs';
import {validateNpcDepth} from '../../../../../tools/npc-profile-validation.mjs';
import {validateSourceEvidence} from '../../../../../tools/npc-depth-source-evidence.mjs';
import {runDepthReview} from '../../../../../tools/npc-depth-review.mjs';
import * as originalDesign from '../../../../design/w1-yp-depth-rest.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const read=async file=>JSON.parse(await fs.readFile(path.resolve(root,file),'utf8'));
const write=(file,value)=>fs.writeFile(path.join(here,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const ids=['npc_yp_tanghuan','npc_yp_qiuyan'],authorizationId='user-reopen-20261012-01';
const planningId='T06-user-reopen-20261012-01-offline-1';
const leaf=(entry,field)=>entry.patches.find(p=>p.path===field).value;

async function generate(){
 const world=await loadWorld(),base=await read('base.json'),foundation=await read('foundation.json'),candidate=await read('candidate.json');
 const entries=depthEntries(base,originalDesign,world),records=await Promise.all(entries.map(e=>read(e.id+'.json')));
 const changes=[],event={...leaf(entries.find(e=>e.id===ids[0]),'memorySeeds[2]'),event:'裘砚认识同村汤桓，两人在榆坡村有同村日常往来。'};
 function change(id,field,after){changes.push({id,path:field,before:structuredClone(leaf(entries.find(e=>e.id===id),field)),after});}
 change(ids[0],'memorySeeds[2]',event);change(ids[1],'memorySeeds[2]',structuredClone(event));
 change(ids[1],'knowledge.unknown[0]','汤桓今天何时有空，愿不愿意与自己交谈。');
 const note='认识同村汤桓，有日常往来；交谈前先问他何时方便。';
 change(ids[1],'relationships[1].note',note);change(ids[1],'opinions.neighbors[1].view',note);
 const sourceRefs=[{collection:'npcs',id:ids[1],field:'relationships[1].type'},{collection:'npcs',id:ids[1],field:'relationships[1].note'}].map(ref=>{
  const quote=getPath(world[ref.collection].find(n=>n.id===ref.id),ref.field);return{...ref,quote,hash:hashContent(quote)};
 });
 const sourceFile='reopen/source-evidence.json',sourceEvidence={sourceRecords:ids.map(id=>{
  const n=world.npcs.find(n=>n.id===id);return{id:n.id,name:n.name,relationships:structuredClone(n.relationships)};
 }),reviewBoundary:'原源仅确认裘砚认识汤桓和同村日常往来。修订共享记忆只保留这层关系，不设单次相认、货签参与或约工事件；交谈前询问何时方便是待问事项，未发生、未承诺，未赋予汤桓认字技能或任何私密获知。裘砚旧L2仅对应旧候选，两人新候选均须真实L2及受影响批L4。'};
 const invalidations={kind:'controlled-L4-invalidation-evidence',authorizationId,planningId,boundary:'本次离线逐源读取发现关联叶超出原关系证据，仅失效待复审，无L2或L4批准。汤桓旧真实hard与裘砚旧passed原文均保留。',records:ids.map(id=>{
  const record=records.find(r=>r.id===id);return{id,priorStatus:record.status,operativeStatus:'invalidated-by-L4',recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),findings:changes.filter(c=>c.id===id).map(c=>({path:c.path,quote:typeof c.before==='string'?c.before:c.before.event,reason:c.path==='memorySeeds[2]'?'原源确认认识/同村日常往来，未记当面相认或货签共享经历；另一方真实L2已就同一原句判hard。':'原源没有把汤桓与转抄签认字或帮忙工事相连；同步收窄为同村往来的待问交谈时间。',sourceConcern:sourceRefs[1].quote,sourceId:ids[1],sourceHash:sourceRefs[1].hash,sourceRef:{path:c.path,collection:'npcs',id:ids[1],field:sourceRefs[1].field,hash:sourceRefs[1].hash}}))};
 })};
 const oldProofs=await Promise.all(['final-tanghuan-revision-evidence.json','authorized-rebind-evidence.json','tanghuan-final-source-evidence.json'].map(async file=>({file,hash:hashContent(await read(file))})));
 const plan={kind:'controlled-depth-revision',planningId,cardId:'T06',authorizationId,revision:originalDesign.revision,foundationHash:hashContent(foundation),baseHash:hashContent(base),candidateHash:hashContent(candidate),sourceHashes:[{file:'base.json',hash:hashContent(base)},{file:sourceFile,hash:hashContent(sourceEvidence)}],invalidationFile:'reopen/l4-invalidations.json',invalidationHash:hashContent(invalidations),oldProofs,authorized:ids.map(id=>{
  const record=records.find(r=>r.id===id),paths=changes.filter(c=>c.id===id).map(c=>c.path);return{id,recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),paths,sourceOnly:false,invalidationSources:invalidations.records.find(r=>r.id===id).findings.map(f=>f.sourceRef),sourceEvidence:{id,file:sourceFile,hash:hashContent(sourceEvidence),refs:sourceRefs.map(({quote,...ref})=>ref)},sourceSupplementPaths:[]};
 }),changes,attemptLimit:2,status:'offline-pending-T49',realL2:false,realL4:false};
 const files=(await fs.readdir(root,{withFileTypes:true})).filter(f=>f.isFile()).map(f=>f.name).sort();
 const originalFiles=await Promise.all(files.map(async file=>{const raw=await fs.readFile(path.join(root,file),'utf8');return{file,rawHash:hashContent(raw)};}));
 await write('patch-diff.json',changes);await write('source-evidence.json',sourceEvidence);await write('source-quotes.json',sourceRefs);
 await write('l4-invalidations.json',invalidations);await write('old-records.json',records.filter(r=>ids.includes(r.id)));
 await write('controlled-plan.json',plan);
 await write('freeze.json',{authorizationId,planningId,authorizationHash:hashContent(plan),oldProofs,originalFiles,records:records.map(r=>({id:r.id,status:r.status,recordHash:hashContent(r)})),foundationHash:hashContent(foundation),candidateHash:hashContent(candidate),baseHash:hashContent(base),sourceHashes:plan.sourceHashes,recordedAt:new Date().toISOString()});
 const nextDesign=await import('./design.mjs'),nextEntries=depthEntries(base,nextDesign,world);
 await write('candidate-after.json',nextEntries.map(patchDraft));
 const report=await check();
 let modelCalls=0;
 try{await runDepthReview({id:ids[0],cardId:'T06',root,budgetRoot:path.resolve('world/drafts/m4-object'),design:path.join(here,'design.mjs'),controlledRevision:path.join(here,'controlled-plan.json'),authorizationHash:hashContent(plan)},{client:{request(){modelCalls++;throw Error('禁止真实请求');}}});throw Error('旧工具应拒绝T06受控重开');}catch(error){assert.match(error.message,/T06继续冻结/);report.guard=error.message;}
 assert.equal(modelCalls,0);
 return report;
}

export async function check(){
 const world=await loadWorld(),base=await read('base.json'),foundation=await read('foundation.json'),candidate=await read('candidate.json'),freeze=await read('reopen/freeze.json'),plan=await read('reopen/controlled-plan.json');
 const oldEntries=depthEntries(base,originalDesign,world),nextDesign=await import('./design.mjs'),entries=depthEntries(base,nextDesign,world),changes=await read('reopen/patch-diff.json');
 let proof=null;try{proof=await read('incremental-proof.json');}catch(error){if(error.code!=='ENOENT')throw error;}
 let originalPublication=null;
 if(proof){assert.equal(proof.authorizationHash,freeze.authorizationHash);assert.equal(proof.planHash,hashContent(plan));assert.equal(proof.reopenAuthorization.id,authorizationId);originalPublication=await read('reopen/prior-publication-state.json');}
 const reviewedRecords=proof?await Promise.all(ids.map(id=>read(id+'.json'))):[];
 assert.equal(plan.authorizationId,authorizationId);assert.equal(plan.planningId,planningId);assert.equal(freeze.authorizationHash,hashContent(plan));
 const checkout=freeze.checkoutEvidence;
 for(const file of freeze.originalFiles){
  let originalRaw;
  if(proof&&ids.some(id=>file.file===id+'.json')){
   const id=file.file.slice(0,-5),oldRecord=proof.oldRecords.find(r=>r.id===id),current=await read(file.file);
   assert.equal(hashContent(oldRecord),freeze.records.find(r=>r.id===id).recordHash);assert.deepEqual(current.reviewRecovery.prior,oldRecord);
   assert.equal(current.incremental.authorizationHash,freeze.authorizationHash);assert.equal(current.incremental.originalRecordHash,hashContent(oldRecord));continue;
  }
  if(proof&&['summary.json','batch-1.json'].includes(file.file)){const saved=originalPublication.files[file.file];assert.equal(hashContent(saved.raw),saved.rawHash);originalRaw=saved.raw;}
  const rawHash=hashContent(originalRaw??await fs.readFile(path.join(root,file.file),'utf8')),alternative=checkout?.files.find(row=>row.file===file.file);
  assert.ok(rawHash===file.rawHash||alternative&&rawHash===alternative.mainRawHash,'原文件改变 '+file.file);
 }
 for(const [key,value]of Object.entries({baseHash:hashContent(base),candidateHash:hashContent(candidate),foundationHash:hashContent(foundation)})){assert.equal(plan[key],value);assert.equal(freeze[key],value);}
 assert.deepEqual(plan.changes,changes);assert.equal(plan.invalidationHash,hashContent(await read(plan.invalidationFile)));
 for(const proof of plan.oldProofs)assert.equal(proof.hash,hashContent(await read(proof.file)));
 for(const source of plan.sourceHashes)assert.equal(source.hash,hashContent(await read(source.file)));
 for(const quote of await read('reopen/source-quotes.json')){assert.equal(hashContent(quote.quote),quote.hash);assert.deepEqual(getPath(world[quote.collection].find(n=>n.id===quote.id),quote.field),quote.quote);}
 const oldRecords=await read('reopen/old-records.json');
 for(const record of freeze.records)assert.equal(record.recordHash,hashContent(proof&&ids.includes(record.id)?proof.oldRecords.find(r=>r.id===record.id):await read(record.id+'.json')),'原完整record改变 '+record.id);
 for(const item of plan.authorized){const old=oldRecords.find(r=>r.id===item.id);assert.equal(item.recordHash,hashContent(old));assert.deepEqual(old,proof?proof.oldRecords.find(r=>r.id===item.id):await read(item.id+'.json'));assert.equal(item.draftHash,hashContent(old.draft));assert.equal(item.reviewHash,hashContent(old.review));}
 const errors=entries.flatMap(e=>validateDraft(patchDraft(e),e).errors.map(error=>({id:e.id,error})));assert.deepEqual(errors,[]);
 assert.deepEqual(await read('reopen/candidate-after.json'),entries.map(patchDraft));
 const preserved=entries.filter(e=>!ids.includes(e.id)).map(e=>{const old=oldEntries.find(o=>o.id===e.id);assert.deepEqual(e,old);assert.deepEqual(contextFor(e,world),contextFor(old,world));return e.id;});assert.equal(preserved.length,28);
 const preservedSiblings=[];
 for(const entry of entries.filter(e=>ids.includes(e.id))){
  const old=oldEntries.find(e=>e.id===entry.id),allowed=changes.filter(c=>c.id===entry.id);assert.deepEqual(entry.before,old.before);assert.deepEqual(entry.patches.map(p=>p.path),old.patches.map(p=>p.path));
  for(const patch of entry.patches){const changed=allowed.find(c=>c.path===patch.path);if(changed){assert.deepEqual(leaf(old,patch.path),changed.before);assert.deepEqual(patch.value,changed.after);}else{assert.deepEqual(patch.value,leaf(old,patch.path));preservedSiblings.push({id:entry.id,path:patch.path});}}
  validateSourceEvidence(await read('reopen/source-evidence.json'),entry,world);
 }
 const merged=validatePatchResults(entries,world),audit=auditNpcDepth(merged),issues=audit.issues.filter(i=>i.id.startsWith('npc_yp_'));assert.deepEqual(issues,[]);assert.ok(audit.legacyTraits.ok);
 assert.deepEqual(audit.issues.filter(i=>!i.id.startsWith('npc_yp_')),auditNpcDepth(world).issues.filter(i=>!i.id.startsWith('npc_yp_')));
 for(const entry of entries)assert.deepEqual(entry.facts.memorySeeds.slice(0,entry.before.memorySeeds.length),entry.before.memorySeeds);
 const shared=ids.map(id=>entries.find(e=>e.id===id).facts.memorySeeds.at(-1));assert.deepEqual(shared[0],shared[1]);
 const memoryIssues=validateNpcDepth(merged).issues.filter(i=>ids.includes(i.id)&&i.field.startsWith('memorySeeds'));assert.deepEqual(memoryIssues,[]);
 return{authorizationId,planningId,authorizationHash:hashContent(plan),changedPaths:changes.map(({id,path})=>({id,path})),L1Errors:errors,targetedAuditIssues:issues,preservedIds:preserved,preservedSiblings,sharedEvent:{id:shared[0].id,participants:shared[0].knownBy,oldEvent:leaf(oldEntries.find(e=>e.id===ids[0]),'memorySeeds[2]').event,newEvent:shared[0].event,closed:true,compatible:true,oldMemoriesPreserved:true},guard:null,realL2:!!proof&&reviewedRecords.every(r=>r.status==='passed'&&r.reviewRecovery.status==='passed-L1-L2'&&!r.errors.length),realL4:!!proof&&(await read('batch-1.json')).l4.approved,modelCalls:0,budgetWrites:0,formalWrites:0,budgetHistory:{spentYuan:1.82866384,unknownReservedYuan:.083736,newCumulativeLimitYuan:2.5,maxRemainingYuan:.58760016,firstIdLimitYuan:.50,phase:'reference-only-no-grant-or-request'},recordedAt:new Date().toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const report=process.argv.includes('--check')?await check():await generate();
 if(!process.argv.includes('--check'))await write('offline-report.json',report);
 console.log(JSON.stringify({planningId:report.planningId,authorizationHash:report.authorizationHash,changedPaths:report.changedPaths,L1Errors:report.L1Errors,targetedAuditIssues:report.targetedAuditIssues,event:report.sharedEvent,guard:report.guard,modelCalls:report.modelCalls,budgetWrites:report.budgetWrites}));
}
