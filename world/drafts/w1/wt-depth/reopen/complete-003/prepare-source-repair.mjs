import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {completeOptions} from '../prepare-complete.mjs';
import {prepareDepthRevision,depthRevisionProof,replayDepthProof} from '../../../../../../tools/npc-depth.mjs';
import {depthEntries,patchDraft,validateDraft,validatePatchResults,buildReviewRequest} from '../../../../../../tools/npc-depth-content.mjs';
import {compactReviewRequest} from '../../../../../../tools/npc-depth-source-evidence.mjs';
import {hashContent} from '../../../../../../tools/content-pipeline.mjs';
import {loadEvidence} from '../../../../../../tools/npc-depth-source-evidence.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const write=(file,value)=>fs.writeFile(path.join(here,file),JSON.stringify(value,null,2)+'\n');
export async function sourceRepairOptions(){
 const parent=await completeOptions(),planFile=path.join(here,'source-repair-plan.json'),plan=await read(planFile);
 return{...parent,design:path.join(here,'source-repair-design.mjs'),controlledRevision:planFile,authoredBackground:path.join(here,'shared-repair-background.json'),authorizationHash:hashContent(plan)};
}
export async function prepareSourceRepair(){
 const options=await completeOptions(),parent=await prepareDepthRevision(options),proof=await read(path.join(options.root,'incremental-proof.json'));
 const prior=await read(options.authoredBackground),background=await read(path.join(here,'shared-repair-background.json'));
 const event=background.events.find(e=>e.id==='memory_wt_depth_group_3'),old=prior.events.find(e=>e.id===event.id);
 assert.deepEqual({...event,narrative:old.narrative},old);
 const rows=parent.entries.map(({context,authoredBackground,facts,contract,...row})=>structuredClone(row));
 for(const id of event.actors)rows.find(r=>r.id===id).patches.find(p=>p.path==='memorySeeds[2]').value.event=event.narrative;
 const credential={kind:'depth-source-authorization',cardId:'T07',authorizationId:parent.reopening.manifest.id,parentManifestHash:parent.reopening.manifestHash,parentGrantHash:hashContent(parent.reopening.grant),source:{eventId:event.id,path:'narrative',beforeHash:hashContent(old.narrative),afterHash:hashContent(event.narrative)},allowed:event.actors.map(id=>({id,paths:['memorySeeds[2]'],recordHash:parent.reopening.grant.allowed.find(a=>a.id===id).recordHash}))};
 await write('source-repair-authorization.json',credential);
 await fs.writeFile(path.join(here,'source-repair-design.mjs'),"import fs from 'node:fs';\nimport {patchRows as parentRows,revision,incrementLimitYuan} from '../design.mjs';\nexport {revision,incrementLimitYuan};\nconst background=JSON.parse(fs.readFileSync(new URL('./shared-repair-background.json',import.meta.url),'utf8'));\nconst event=background.events.find(e=>e.id==='memory_wt_depth_group_3');\nexport const patchRows=structuredClone(parentRows);\nfor(const id of event.actors)patchRows.find(r=>r.id===id).patches.find(p=>p.path==='memorySeeds[2]').value.event=event.narrative;\n");
 const entries=depthEntries(rows.map(r=>r.before),{revision:parent.config.revision,patchRows:rows},parent.world);
 const plan={...structuredClone(parent.plan),status:'authorized-source-repair-zero-model',previousPlanFile:path.relative(options.root,options.controlledRevision).replaceAll('\\','/'),previousPlanHash:options.authorizationHash,previousProofHash:hashContent(proof),sourceAuthorization:{file:path.relative(options.root,path.join(here,'source-repair-authorization.json')).replaceAll('\\','/'),hash:hashContent(credential)}};
 // Bind the child to the current records, preserving each original prior chain.
 for(const item of plan.authorized){
  const record=await read(path.join(options.root,item.id+'.json')),entry=entries.find(e=>e.id===item.id);
  const paths=entry.patches.filter(p=>hashContent(p.value)!==hashContent(record.draft.patches.find(old=>old.path===p.path).value)).map(p=>p.path);
  Object.assign(item,{recordHash:hashContent(record),draftHash:hashContent(record.draft),reviewHash:hashContent(record.review),inheritedAuthorizationHash:parent.plan.authorized.find(a=>a.id===item.id).inheritedAuthorizationHash,paths,sourceOnly:paths.length===0,invalidationSources:[]});
 }
 delete plan.invalidationFile;delete plan.invalidationHash;delete plan.changes;delete plan.backgroundChange;
 plan.backgroundFile=path.relative(options.root,path.join(here,'shared-repair-background.json')).replaceAll('\\','/');
 await write('source-repair-plan.json',plan);
 const nextOptions=await sourceRepairOptions(),prepared=await prepareDepthRevision(nextOptions);
 const childProof=depthRevisionProof(nextOptions,prepared,proof.reopenAuthorization);
 const persisted=await prepareDepthRevision({...nextOptions,design:options.design,proofOverride:childProof});
 assert.deepEqual(persisted.entries,prepared.entries);assert.deepEqual(persisted.contexts,prepared.contexts);
 const replayed=await replayDepthProof(prepared.foundation,proof,{readPlan:file=>read(path.resolve(options.root,file))});
 for(const entry of parent.entries)assert.deepEqual(replayed.find(e=>e.id===entry.id).patches,entry.patches);
 const changes=prepared.entries.flatMap(e=>e.patches.filter(p=>hashContent(p.value)!==hashContent(parent.entries.find(old=>old.id===e.id).patches.find(old=>old.path===p.path).value)).map(p=>({id:e.id,path:p.path})));
 assert.deepEqual(changes.map(c=>c.id).sort(),[...event.actors].sort());assert.ok(changes.every(c=>c.path==='memorySeeds[2]'));
 const changedContexts=[],previouslyInvalidatedPassed=[],unchangedPassed=[],needsReview=[];
 for(const entry of prepared.entries){
  const record=await read(path.join(options.root,entry.id+'.json')),fingerprint=hashContent({entry,context:prepared.contexts.get(entry.id),revision:prepared.config.revision});
  if(record.fingerprint!==fingerprint){needsReview.push(entry.id);if(record.status==='passed'){
   const oldEntry=parent.entries.find(e=>e.id===entry.id),parentFingerprint=hashContent({entry:oldEntry,context:parent.contexts.get(entry.id),revision:parent.config.revision});
   (record.fingerprint===parentFingerprint?changedContexts:previouslyInvalidatedPassed).push(entry.id);
  }}else if(record.status==='passed')unchangedPassed.push({id:entry.id,recordHash:hashContent(record),fingerprint});
  assert.deepEqual(validateDraft(patchDraft(entry),entry).errors,[]);
  const full=buildReviewRequest(entry,patchDraft(entry),prepared.contexts.get(entry.id),{requireLeafCoverage:true}),compact=compactReviewRequest(full);
  assert.equal(full.max_tokens,1800);assert.equal(compact.max_tokens,1800);
 }
 validatePatchResults(prepared.entries,prepared.world);
 const first=prepared.entries.find(e=>e.id==='npc_wt_zhangou'),item=plan.authorized.find(a=>a.id===first.id),sourceFile=path.resolve(options.root,item.sourceEvidence.file),evidence=await loadEvidence(sourceFile,first,prepared.world);
 const request=compactReviewRequest(buildReviewRequest(first,patchDraft(first),prepared.contexts.get(first.id),{requireLeafCoverage:true}));request.messages.push({role:'user',content:JSON.stringify(evidence.data)});
 const bytes=Buffer.byteLength(JSON.stringify({model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...request}));
 const nextReview={id:first.id,sourceEvidenceFile:item.sourceEvidence.file,sourceEvidenceHash:evidence.contentHash,requestHash:hashContent(request),maxTokens:1800,utf8Bytes:bytes,ceilingYuan:(bytes*2+1800*8)/1e6,attemptClaimed:false};
 const report={status:'actual-child-prepare-passed',modelCalls:0,budgetWrites:0,authorizationHash:nextOptions.authorizationHash,credentialHash:hashContent(credential),credential,previousProofHash:hashContent(proof),preparedProofHash:hashContent(childProof),parentEntryHash:hashContent(parent.entries),entryHash:hashContent(prepared.entries),changes,unchangedPassed,invalidatedPassed:changedContexts,previouslyInvalidatedPassed,needsReview,nextReview,L1Errors:[],persistentReplay:true,fullAndCompact:true,realL2:false,realL4:false,published:false};
 await write('source-repair-report.json',report);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const report=await prepareSourceRepair();console.log(JSON.stringify({status:report.status,changes:report.changes,unchangedPassed:report.unchangedPassed.map(r=>r.id),invalidatedPassed:report.invalidatedPassed,modelCalls:0}));}
