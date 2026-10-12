// T09 zero-provider preflight. All pipeline writes use a disposable world copy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareDepth,runDepth} from '../../../../tools/npc-depth.mjs';
import {contextFor,patchDraft,buildDraftRequest,buildReviewRequest,validateDraft,checkIncrementalReview,getPath} from '../../../../tools/npc-depth-content.mjs';
import {prepareFirstSourceEvidence,compactReviewRequest,validateSourceEvidence} from '../../../../tools/npc-depth-source-evidence.mjs';
import {hashContent,runContentPipeline} from '../../../../tools/content-pipeline.mjs';
import {DeepSeekClient,normalizeAssistantContent} from '../../../../tools/deepseek-client.mjs';

const project=path.resolve(import.meta.dirname,'../../../..');
const cohortRoot=path.join(project,'world/drafts/w1/sb-depth');
const firstRoot=path.join(cohortRoot,'first-review');
const sharedBudgetRoot='F:/dnd/world/drafts/m4-object';
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const write=async(file,data)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');};
const options={worldRoot:path.join(project,'world'),design:path.join(project,'world/design/w1-sb-depth.mjs'),root:firstRoot,authoredBackground:path.join(firstRoot,'authored-background.json'),cardId:'T09'};
const rates=new DeepSeekClient().rates; // Construction only; generate is never used.
export function requestMeasure(body){
 const encoded={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body};
 encoded.messages=normalizeAssistantContent(encoded.messages);
 const bytes=Buffer.from(JSON.stringify(encoded),'utf8');
 return{body,requestHash:hashContent(body),encodedSha256:sha(bytes),utf8Bytes:bytes.length,maxTokens:encoded.max_tokens,ceilingYuan:(bytes.length*rates.miss+encoded.max_tokens*rates.output)/1e6};
}
async function frozenFiles(){
 const names=['base.json','candidate.json','foundation.json','manifest.json','source-evidence.json','source-classification.json','pronoun-precheck.json'];
 const first=['base.json','candidate.json','foundation.json','manifest.json','authored-background.json','opt-in-evidence.json','source-validation.json','source-validation-failure-v1.json'];
 return Promise.all([...names.map(n=>path.join(cohortRoot,n)),...first.map(n=>path.join(firstRoot,n)),options.design].map(async file=>{const raw=await fs.readFile(file);return{file:path.relative(project,file).replaceAll('\\','/'),sha256:sha(raw),...(file.endsWith('.json')?{contentHash:hashContent(JSON.parse(raw))}:{})};}));
}
// Determine missing outgoing facts from declared references; values come only
// from prepareDepth's frozen world, never from the candidate's assertion.
export async function sourceRequirements(prepared){
 const checks=(await read(path.join(cohortRoot,'pronoun-precheck.json'))).checks;
 const gaps=[];
 for(const check of checks){
  const entry=prepared.entries.find(e=>e.id===check.id),context=contextFor(entry,prepared.world);
  assert.equal(entry.patches.find(p=>p.path===check.path).value,check.text);
  const original=[...prepared.world.npcs,...prepared.world.residents].find(n=>n.id===check.referent);
  assert.equal(original.sex,check.pronoun==='他'?'男':'女');
  if(!Object.hasOwn(context.people.find(n=>n.id===check.referent)??{},'sex'))
   gaps.push({id:entry.id,path:check.path,sourceId:original.id,field:'sex',value:original.sex,hash:hashContent(original.sex),collection:prepared.world.npcs.some(n=>n.id===original.id)?'npcs':'residents',missingIn:check.referent===entry.id?['draft']:['draft','review']});
 }
 const supplements=new Map();
 for(const id of new Set(gaps.map(g=>g.id))){
  const entry=prepared.entries.find(e=>e.id===id),sourceRecords=[{id,name:entry.before.name,...(gaps.some(g=>g.id===id&&g.sourceId===id)?{sex:entry.before.sex}:{})}];
  for(const sourceId of new Set(gaps.filter(g=>g.id===id&&g.sourceId!==id).map(g=>g.sourceId))){
   const person=[...prepared.world.npcs,...prepared.world.residents].find(n=>n.id===sourceId);
   sourceRecords.push({id:person.id,name:person.name,sex:person.sex});
  }
  const data={sourceRecords,reviewBoundary:'仅供核对已引用人物的原性别与代词。本人原关系和家属类型按 skeleton.before，原日常关切按 context.people.concern；附件不授予秘密、私物、技能或私宅权限，不写入人物知识。目标步骤和新背景待定结果均未完成；仍须独立L2/L4。'};
  validateSourceEvidence(data,entry,prepared.world);supplements.set(id,data);
 }
 return{gaps,supplements};
}
export async function preflightT09(){
 const before=await frozenFiles(),prepared=await prepareDepth(options);
 const {entries,world,config,foundation}=prepared;
 const {gaps,supplements}=await sourceRequirements(prepared);
 const map=Object.fromEntries([...supplements.keys()].map(id=>[id,`source-supplements/${id}.json`]));
 const mapFile=path.join(firstRoot,'source-evidence-map.json');
 for(const [id,data]of supplements)await write(path.join(firstRoot,map[id]),data);
 await write(mapFile,map);
 const budgetFile=path.join(sharedBudgetRoot,'budget.json'),budgetRaw=await fs.readFile(budgetFile),budget=JSON.parse(budgetRaw);
 const report={stage:'zero-provider-official-request-preflight',cardId:'T09',modelCalls:0,generatedAt:new Date().toISOString(),approvals:{L1:'offline-existing-candidate-only',L2:'not-run',L4:'not-approved'},sharedBudget:{root:sharedBudgetRoot,readOnly:true,sha256:sha(budgetRaw),spentYuan:budget.spentYuan,reservedYuan:budget.reservedYuan,waveLimitYuan:budget.waveLimitYuan,card:budget.cards?.T09??null},rates:{...rates,source:'tools/deepseek-client.mjs peak-rate constants; complete UTF-8 input bytes and full output cap'},frozen:before,sourceHash:hashContent(await read(options.authoredBackground)),sourceGapsBefore:gaps,attachments:[],coverage:[],formats:{},limits:{cardYuan:3,waveYuan:20},blockers:['No authorized model slot; real draft/review forbidden.','Public pipeline review-budget failure may still incur paid draft; wait for public fix and renewed slot.'],remainingSourceGaps:[]};
 for(const [id,data]of supplements){const raw=await fs.readFile(path.join(firstRoot,map[id]));report.attachments.push({id,file:map[id],raw:raw.toString('utf8'),rawHash:hashContent(raw.toString('utf8')),sha256:sha(raw),contentHash:hashContent(data),fields:data.sourceRecords.map(r=>({id:r.id,fields:Object.keys(r)}))});}
 // The temporary ledger is deliberately exhausted for T09. It is never a
 // replacement shared budget and cannot authorize a request or reserve money.
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'t09-request-preflight-'));
 try{
  const copyWorld=path.join(temp,'world');
  const worldFiles=['meta/rules.json','people/baseline.json','geo/locations.json','geo/routes.json','meta/items.json','meta/professions.json','meta/skills.json','meta/spells.json','meta/recipes.json','meta/monsters.json','meta/bosses.json','lore/cultures.json','lore/deities.json','lore/factions.json','lore/history.json','lore/factionPeople.json','lore/eras.json','people/residents.json','people/households.json','geo/settlements.json'];
  for(const file of worldFiles){await fs.mkdir(path.dirname(path.join(copyWorld,file)),{recursive:true});await fs.copyFile(path.join(options.worldRoot,file),path.join(copyWorld,file));}
  await fs.mkdir(path.join(copyWorld,'design'),{recursive:true});
  await fs.copyFile(options.design,path.join(copyWorld,'design/w1-sb-depth.mjs'));
  const copyCohort=path.join(copyWorld,'drafts/w1/sb-depth');
  await fs.mkdir(copyCohort,{recursive:true});await fs.copyFile(path.join(cohortRoot,'base.json'),path.join(copyCohort,'base.json'));
  const exhausted={spentYuan:3,reservedYuan:0,limitYuan:20,waveLimitYuan:20,cards:{T09:{spentYuan:3,reservedYuan:0,limitYuan:3}},requests:{},preflightOnly:true};
  for(const compact of [false,true]){
   const format=compact?'compact':'full',copyRoot=path.join(copyCohort,'first-review');
   await fs.mkdir(copyRoot,{recursive:true});
   for(const name of ['base.json','candidate.json','foundation.json','manifest.json','authored-background.json','source-evidence-map.json'])await fs.copyFile(path.join(firstRoot,name),path.join(copyRoot,name));
   await fs.cp(path.join(firstRoot,'source-supplements'),path.join(copyRoot,'source-supplements'),{recursive:true});
   const budgetRoot=path.join(temp,`isolated-${format}-budget`);await write(path.join(budgetRoot,'budget.json'),exhausted);
   const copyOptions={...options,worldRoot:copyWorld,design:path.join(copyWorld,'design/w1-sb-depth.mjs'),root:copyRoot,authoredBackground:path.join(copyRoot,'authored-background.json'),sourceEvidenceMap:path.join(copyRoot,'source-evidence-map.json'),budgetRoot,compactRequest:compact};
   const copyPrepared=await prepareDepth(copyOptions);
   assert.equal(hashContent(copyPrepared.foundation),hashContent(foundation));
   const hook=await prepareFirstSourceEvidence(copyOptions,copyPrepared,e=>contextFor(e,copyPrepared.world));
   const requests=[],requiredReviews=new Map();
   for(const entry of entries){
    const context=contextFor(entry,world),draft=patchDraft(entry);assert.deepEqual(validateDraft(draft,entry).errors,[]);
    const draftBody=(await hook.transform({entry,context,phase:'draft',body:buildDraftRequest(entry,null,context),feedback:null,record:{}})).body;
    const reviewBody=(await hook.transform({entry,context,phase:'review',body:buildReviewRequest(entry,draft,context),draft,record:{}})).body;
    const plainReview=compact?compactReviewRequest(buildReviewRequest(entry,draft,context)):buildReviewRequest(entry,draft,context);
    if(supplements.has(entry.id)){assert.deepEqual(JSON.parse(draftBody.messages.at(-1).content),supplements.get(entry.id));plainReview.messages.push({role:'user',content:JSON.stringify(supplements.get(entry.id))});}
    assert.deepEqual(reviewBody,plainReview);
    requiredReviews.set(entry.id,reviewBody);
    // This is an output contract fixture, never a review conclusion.
    const contract={contradictions:[],reviewedPaths:entry.patches.map(p=>p.path),backgroundReviews:context.authoredBackground.events.map(event=>({eventId:event.id,sourceHash:context.authoredBackground.sourceHash,reviewedRiskPaths:event.risks.map(r=>`${r.id}.${r.field}`),contradictions:[]}))};
    checkIncrementalReview(contract,entry,context);
    const missing=structuredClone(contract);missing.reviewedPaths.pop();assert.throws(()=>checkIncrementalReview(missing,entry,context));
    const missingRisk=structuredClone(contract);missingRisk.backgroundReviews[0].reviewedRiskPaths.pop();assert.throws(()=>checkIncrementalReview(missingRisk,entry,context));
    if(!compact)report.coverage.push({id:entry.id,entryHash:hashContent(entry),contextHash:hashContent(context),patchPaths:contract.reviewedPaths,backgrounds:contract.backgroundReviews.map(({contradictions,...row})=>row),originalSourceHashes:context.authoredBackground.events.flatMap(e=>e.originalSources.map(s=>({collection:s.collection,id:s.id,field:s.field,hash:s.hash}))),notesProjectedInBefore:Object.hasOwn(entry.before,'notes'),workplaceProjectedInBefore:Object.hasOwn(entry.before,'workplace'),familyRelationshipsProjectedInBefore:true,contractOnly:true});
    requests.push({id:entry.id,draft:requestMeasure(draftBody),review:requestMeasure(reviewBody)});
   }
   let generateCalls=0;const estimates=[];
   const client={budgetYuan:20,rates,estimateCostYuan(body){estimates.push(structuredClone(body));return requestMeasure(body).ceilingYuan;},async generate(){generateCalls++;throw Error('Forbidden provider call in zero-model preflight');}};
   // Real runDepth -> runContentPipeline draft assembly; exhausted isolated
   // card stops before reservation and generate, for every original entry.
   const log=console.log;console.log=()=>{};let depthResult;
   try{depthResult=await runDepth(copyOptions,{client});}finally{console.log=log;}
   assert.equal(generateCalls,0);assert.equal(estimates.length,30);assert.equal(depthResult.summary.passed,0);assert.equal(depthResult.summary.pending,30);
   for(const [i,body]of estimates.entries())assert.deepEqual(body,requests[i].draft.body);
   assert.deepEqual(await read(path.join(budgetRoot,'budget.json')),exhausted);
   // Review request budget handoff probe: build the official review for the
   // frozen candidate in the request-builder slot, never fabricate a draft
   // response or an L2 result. Pipeline again stops before reservation.
   estimates.length=0;
   const probeRoot=path.join(temp,`${format}-review-budget-probe`);
   const probe=await runContentPipeline({entries,root:probeRoot,budgetRoot,client,cardId:'T09',allocation:{cardId:'T09',incrementLimitYuan:3,waveLimitYuan:20,startingSpentYuan:3,startingReservedYuan:0},revision:config.revision,contextFor:e=>contextFor(e,world),buildDraftRequest:e=>requiredReviews.get(e.id),validateDraft,concurrency:1,batchSize:25});
   assert.equal(generateCalls,0);assert.equal(estimates.length,30);assert.equal(probe.summary.passed,0);assert.equal(probe.summary.pending,30);
   for(const [i,body]of estimates.entries())assert.deepEqual(body,requests[i].review.body);
   assert.deepEqual(await read(path.join(budgetRoot,'budget.json')),exhausted);
   for(const request of requests)await write(path.join(firstRoot,'request-preflight',format,request.id+'.json'),request);
   report.formats[format]={entries:30,officialDraftBudgetProbes:30,reviewBuilderBudgetHandoffProbes:30,providerCalls:0,isolatedReservationYuan:0,draftCeilingYuan:requests.reduce((n,r)=>n+r.draft.ceilingYuan,0),reviewCeilingYuan:requests.reduce((n,r)=>n+r.review.ceilingYuan,0),totalCeilingYuan:requests.reduce((n,r)=>n+r.draft.ceilingYuan+r.review.ceilingYuan,0),requestBytes:requests.reduce((n,r)=>n+r.draft.utf8Bytes+r.review.utf8Bytes,0),fitsOriginalCard:requests.reduce((n,r)=>n+r.draft.ceilingYuan+r.review.ceilingYuan,0)<=3};
   // Remove only this inspected disposable directory before the next format.
   assert.ok(copyRoot.startsWith(temp+path.sep));await fs.rm(copyRoot,{recursive:true,force:true});
  }
 }finally{assert.ok(temp.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
 assert.deepEqual(await frozenFiles(),before);
 const afterBudget=await fs.readFile(budgetFile);report.sharedBudget.sha256After=sha(afterBudget);report.sharedBudget.unchanged=sha(afterBudget)===sha(budgetRaw);
 report.sourceCoverage={originalSourceOccurrences:report.coverage.flatMap(c=>c.originalSourceHashes).length/2,uniqueOriginalFields:new Set(report.coverage.flatMap(c=>c.originalSourceHashes).map(s=>`${s.collection}.${s.id}.${s.field}`)).size,privateRiskOccurrences:(await read(options.authoredBackground)).events.reduce((n,e)=>n+e.risks.length,0),patchLeaves:report.coverage.reduce((n,c)=>n+c.patchPaths.length,0),events:(await read(options.authoredBackground)).events.length};
 report.sharedBudget.availableCeilingYuan=(budget.waveLimitYuan??budget.limitYuan)-budget.spentYuan-budget.reservedYuan;
 for(const format of Object.values(report.formats))format.fitsSharedCeilingSum=format.totalCeilingYuan<=report.sharedBudget.availableCeilingYuan;
 report.reservationEnvelopeYuan={lower:Math.min(...Object.values(report.formats).map(f=>f.totalCeilingYuan)),upper:Math.max(...Object.values(report.formats).map(f=>f.totalCeilingYuan)),meaning:'Sum of first draft+L2 reservation ceilings by compact/full format, not actual cost bounds or a concurrent reservation. Actual serial settlement may be smaller. No retries or later model calls included.'};
 await write(path.join(firstRoot,'request-preflight.json'),report);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const r=await preflightT09();console.log(JSON.stringify({modelCalls:r.modelCalls,attachments:r.attachments.length,sexGaps:r.sourceGapsBefore.length,formats:r.formats,reservationEnvelopeYuan:r.reservationEnvelopeYuan,sharedBudgetUnchanged:r.sharedBudget.unchanged}));}
