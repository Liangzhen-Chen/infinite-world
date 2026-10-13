import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';
import {loadWorld} from '../../../../../tools/load-world.mjs';
import {prepareDepthRevision} from '../../../../../tools/npc-depth.mjs';
import {patchDraft,getPath,validateDraft,validatePatchResults} from '../../../../../tools/npc-depth-content.mjs';
import {auditNpcDepth} from '../../../../../tools/audit-npc-depth.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),sourced=path.join(root,'sourced');
const read=file=>fs.readFile(path.resolve(root,file),'utf8').then(JSON.parse);
const write=(file,value)=>fs.writeFile(path.join(here,file),JSON.stringify(value,null,2)+'\n');
export async function completeOptions(){
 const plan=await read('reopen/controlled-plan.json');
 return{worldRoot:path.resolve('world'),root:sourced,cardId:'T07',design:path.join(here,'design.mjs'),controlledRevision:path.join(here,'controlled-plan.json'),authoredBackground:path.join(here,'authored-background.json'),sourceCheckoutEvidence:path.join(root,'controlled/source-checkout-evidence.json'),reopenAuthorization:path.resolve('world/design/w1-reopen-authorization.json'),authorizationHash:hashContent(plan),budgetRoot:'F:/dnd/world/drafts/m4-object'};
}
export async function generateBasis(){
 const archive=path.join(here,'proposal-81df67e');await fs.mkdir(archive,{recursive:true});
 for(const file of ['controlled-plan.json','patch-diff.json','candidate-after.json','offline-report.json','freeze.json','l4-invalidations.json','handoff.json'])try{await fs.copyFile(path.join(here,file),path.join(archive,file),fs.constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')throw error;}
 const foundation=await read('sourced/foundation.json'),proof=await read('sourced/incremental-proof.json'),records=await read('reopen/old-records.json');
 assert.equal(hashContent(proof),(await read('reopen/controlled-plan.json')).previousProofHash);
 const rows=foundation.entries.map(({context,facts,contract,...row})=>structuredClone(row));
 function replay(p){if(p.previousProof)replay(p.previousProof);for(const c of p.changes)rows.find(r=>r.id===c.id).patches.find(p=>p.path===c.path).value=structuredClone(c.after);}
 replay(proof);
 for(const r of records)rows.find(e=>e.id===r.id).patches=structuredClone(r.draft.patches);
 const plan=await read('reopen/controlled-plan.json'),previous=await read('reopen/patch-diff.json');
 const changes=previous.map(c=>{const before=structuredClone(rows.find(e=>e.id===c.id).patches.find(p=>p.path===c.path).value);return{...c,before,beforeHash:hashContent(before)};});
 assert.equal(changes.length,42);assert.equal(records.length,18);
 const invalidations=await read('reopen/l4-invalidations.json');
 for(const row of invalidations.records)for(const finding of row.findings){const c=changes.find(c=>c.id===row.id&&c.path===finding.path);finding.quote=typeof c.before==='string'?c.before:c.before.event??c.before.fact;finding.quoteBasis='reopen/old-records.json';finding.candidateValueHash=c.beforeHash;assert.equal(finding.oldRecordValueHash,c.beforeHash);}
 plan.changes=changes;plan.invalidationHash=hashContent(invalidations);plan.status='actual-record-basis-pending-official-prepare';
 for(const item of plan.authorized){const record=records.find(r=>r.id===item.id);assert.equal(item.recordHash,hashContent(record));assert.equal(item.draftHash,hashContent(record.draft));}
 await write('basis-rows.json',rows);await write('patch-diff.json',changes);await write('l4-invalidations.json',invalidations);await write('controlled-plan.json',plan);
 const freeze=await read('reopen/freeze.json');freeze.proposalAuthorizationHash=freeze.authorizationHash;freeze.authorizationHash=hashContent(plan);freeze.basisRowsHash=hashContent(rows);freeze.basis='18 frozen record drafts and 12 parent-proof replay entries';await write('freeze.json',freeze);
 const design=await import('./design.mjs'),{depthEntries}=await import('../../../../../tools/npc-depth-content.mjs'),world=await loadWorld();
 await write('candidate-after.json',depthEntries(rows.map(r=>r.before),design,world).map(patchDraft));
 return{changes:changes.length,correctedBefore:changes.filter((c,i)=>c.beforeHash!==previous[i].beforeHash).length};
}
export async function officialCheck({proofOverride}={}){
 const options=await completeOptions(),prepared=await prepareDepthRevision({...options,...(proofOverride?{proofOverride}:{})}),plan=await read('reopen/controlled-plan.json');
 assert.equal(prepared.revision.changes.length,42);
 const priorRecords=await read('reopen/old-records.json'),protectedIds=prepared.entries.filter(e=>!plan.authorized.some(a=>a.id===e.id)).map(e=>e.id);assert.equal(protectedIds.length,12);
 for(const entry of prepared.entries.filter(e=>protectedIds.includes(e.id))){const record=await read('sourced/'+entry.id+'.json'),fingerprint=hashContent({entry,context:prepared.contexts.get(entry.id),revision:prepared.config.revision});assert.equal(record.fingerprint,fingerprint,'有效12人完整审核指纹改变 '+entry.id);}
 const siblings=[];
 for(const record of priorRecords){const entry=prepared.entries.find(e=>e.id===record.id),allowed=plan.authorized.find(a=>a.id===record.id).paths;for(const patch of record.draft.patches)if(!allowed.includes(patch.path)){assert.deepEqual(entry.patches.find(p=>p.path===patch.path).value,patch.value);siblings.push({id:entry.id,path:patch.path});}}
 const L1Errors=prepared.entries.flatMap(e=>validateDraft(patchDraft(e),e).errors.map(error=>({id:e.id,error})));assert.deepEqual(L1Errors,[]);
 const live=await loadWorld(),merged=validatePatchResults(prepared.entries,live),issues=auditNpcDepth(merged).issues.filter(i=>i.id.startsWith('npc_wt_'));assert.deepEqual(issues,[]);
 const background=await read('reopen/authored-background.json');for(const event of background.events)for(const ref of [...event.sourceRefs,...event.risks]){const source=ref.collection?live[ref.collection]?.find(p=>p.id===ref.id):live.npcs.find(p=>p.id===ref.id);assert.equal(hashContent(getPath(source,ref.field)),ref.hash);}
 return{status:'official-prepare-passed',authorizationId:plan.authorizationId,authorizationHash:hashContent(plan),basisRowsHash:hashContent(await read('reopen/basis-rows.json')),L1Errors,issues,protectedIds,siblings,changes:prepared.revision.changes,realL2:false,realL4:false,modelCalls:0,budgetWrites:0,sourceRefsCurrent:true,recordedAt:new Date().toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv.includes('--generate'))console.log(JSON.stringify(await generateBasis()));
 const report=await officialCheck();await write('official-prepare-report.json',report);console.log(JSON.stringify({status:report.status,authorizationHash:report.authorizationHash,protectedIds:report.protectedIds,L1Errors:report.L1Errors,issues:report.issues}));
}
