// T09 zero-provider preflight. All pipeline writes use a disposable world copy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareDepth,runDepth} from '../../../../tools/npc-depth.mjs';
import {contextFor,patchDraft,buildDraftRequest,buildReviewRequest,validateDraft,checkIncrementalReview,extractDraft} from '../../../../tools/npc-depth-content.mjs';
import {prepareFirstSourceEvidence,compactReviewRequest,validateSourceEvidence} from '../../../../tools/npc-depth-source-evidence.mjs';
import {hashContent,runContentPipeline} from '../../../../tools/content-pipeline.mjs';
import {openContentBudget} from '../../../../tools/content-budget.mjs';
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
 const first=['base.json','candidate.json','foundation.json','manifest.json','authored-background.json','opt-in-evidence.json','source-validation.json','source-validation-failure-v1.json','source-evidence-map.json',...Object.values(await read(path.join(firstRoot,'source-evidence-map.json')))];
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
// Every provider entry is a hard failure. A preflight never supplies a response.
export function forbiddenClient(){
 const client={budgetYuan:20,spent:0,reserved:0,rates:{...rates},generateCalls:0,
  estimateCostYuan(){throw Error('T46 rates path must not call the legacy estimator');},
  async generate(){client.generateCalls++;throw Error('Forbidden provider call in zero-model preflight');}};
 return client;
}
function stoppedResult(result,count){
 assert.equal(result.summary.passed,0);assert.equal(result.summary.pending,count);
 assert.equal(result.summary.manual,0);
 assert.ok(result.results.every(r=>r.budgetStop?.code==='CONTENT_BUDGET_STOP'&&r.attempts===0&&r.draft===null&&r.review===null));
 assert.ok(result.results.every(r=>/费用上限/.test(r.budgetStop.message)));
}
function isolatedLedger(original,cardSpent){
 const ledger=structuredClone(original),old=ledger.cards?.T09??{spentYuan:0,reservedYuan:0};
 // Copy history, including unknown holds, then adjust only the temporary T09
 // allowance used to force a refusal. No production ledger is ever opened.
 assert.equal(old.reservedYuan,0,'T09 has an unresolved hold; preflight must be replanned');
 ledger.spentYuan+=cardSpent-old.spentYuan;
 ledger.cards??={};ledger.cards.T09={spentYuan:cardSpent,reservedYuan:0,limitYuan:3};
 return ledger;
}
export async function preflightT09({outputRoot=firstRoot,authorizedCardLimitYuan=null}={}){
 if(authorizedCardLimitYuan!==null)assert.ok(Number.isFinite(authorizedCardLimitYuan)&&authorizedCardLimitYuan>=3,'授权总额度须至少为原3元');
 const before=await frozenFiles(),prepared=await prepareDepth(options);
 const {entries,world,config,foundation}=prepared;
 const {gaps,supplements}=await sourceRequirements(prepared);
 const map=Object.fromEntries([...supplements.keys()].map(id=>[id,`source-supplements/${id}.json`]));
 const mapFile=path.join(firstRoot,'source-evidence-map.json');
 assert.deepEqual(await read(mapFile),map);
 for(const [id,data]of supplements)assert.deepEqual(await read(path.join(firstRoot,map[id])),data);
 const budgetFile=path.join(sharedBudgetRoot,'budget.json'),budgetRaw=await fs.readFile(budgetFile),budget=JSON.parse(budgetRaw);
 const report={stage:'zero-provider-official-request-preflight',cardId:'T09',modelCalls:0,generatedAt:new Date().toISOString(),approvals:{L1:'offline-existing-candidate-only',L2:'not-run',L4:'not-approved'},sharedBudget:{root:sharedBudgetRoot,readOnly:true,sha256:sha(budgetRaw),spentYuan:budget.spentYuan,reservedYuan:budget.reservedYuan,waveLimitYuan:budget.waveLimitYuan,card:budget.cards?.T09??null},rates:{...rates,source:'tools/deepseek-client.mjs peak-rate constants; complete UTF-8 input bytes and full output cap'},frozen:before,sourceHash:hashContent(await read(options.authoredBackground)),sourceGapsBefore:gaps,attachments:[],coverage:[],formats:{},limits:{cardYuan:3,waveYuan:20,authorizedCardLimitYuan,authorizationSource:authorizedCardLimitYuan===null?'追加及重开已授权，具体总额度待T47确定':'caller-supplied reporting value only; does not modify or authorize any ledger'},blockers:['T48 authorizes zero calls only; T09 still needs the exclusive provider slot and reconciled persistent allocation.'],remainingSourceGaps:[]};
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
  const exhausted=isolatedLedger(budget,3);
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
   const requests=[];
   for(const entry of entries){
    const context=contextFor(entry,world),draft=patchDraft(entry);assert.deepEqual(validateDraft(draft,entry).errors,[]);
    const draftBody=(await hook.transform({entry,context,phase:'draft',body:buildDraftRequest(entry,null,context),feedback:null,record:{}})).body;
    const reviewBody=(await hook.transform({entry,context,phase:'review',body:buildReviewRequest(entry,draft,context),draft,record:{}})).body;
    const plainReview=compact?compactReviewRequest(buildReviewRequest(entry,draft,context)):buildReviewRequest(entry,draft,context);
    if(supplements.has(entry.id)){assert.deepEqual(JSON.parse(draftBody.messages.at(-1).content),supplements.get(entry.id));plainReview.messages.push({role:'user',content:JSON.stringify(supplements.get(entry.id))});}
    assert.deepEqual(reviewBody,plainReview);
    // This is an output contract fixture, never a review conclusion.
    const contract={contradictions:[],reviewedPaths:entry.patches.map(p=>p.path),backgroundReviews:context.authoredBackground.events.map(event=>({eventId:event.id,sourceHash:context.authoredBackground.sourceHash,reviewedRiskPaths:event.risks.map(r=>`${r.id}.${r.field}`),contradictions:[]}))};
    checkIncrementalReview(contract,entry,context);
    const missing=structuredClone(contract);missing.reviewedPaths.pop();assert.throws(()=>checkIncrementalReview(missing,entry,context));
    const missingRisk=structuredClone(contract);missingRisk.backgroundReviews[0].reviewedRiskPaths.pop();assert.throws(()=>checkIncrementalReview(missingRisk,entry,context));
    if(!compact)report.coverage.push({id:entry.id,entryHash:hashContent(entry),contextHash:hashContent(context),patchPaths:contract.reviewedPaths,backgrounds:contract.backgroundReviews.map(({contradictions,...row})=>row),originalSourceHashes:context.authoredBackground.events.flatMap(e=>e.originalSources.map(s=>({collection:s.collection,id:s.id,field:s.field,hash:s.hash}))),notesProjectedInBefore:Object.hasOwn(entry.before,'notes'),workplaceProjectedInBefore:Object.hasOwn(entry.before,'workplace'),familyRelationshipsProjectedInBefore:true,contractOnly:true});
    requests.push({id:entry.id,draft:requestMeasure(draftBody),review:requestMeasure(reviewBody)});
   }
   const queueClient=forbiddenClient();
   // T46 serial runDepth stops the entire queue on the first exhausted card.
   // Only the first entry reaches request assembly; later entries keep attempts=0.
   const log=console.log;console.log=()=>{};let depthResult;
   try{depthResult=await runDepth(copyOptions,{client:queueClient});}finally{console.log=log;}
   stoppedResult(depthResult,30);assert.equal(queueClient.generateCalls,0);
   assert.deepEqual(await read(path.join(budgetRoot,'budget.json')),exhausted);
   const queueRegistry=await read(path.join(copyRoot,'first-source-evidence.json'));
   const queueProof={entries:30,providerCalls:0,pending:30,attempts:0,ledgerUnchanged:true,
    firstStoppedId:depthResult.results[0].id,sourceRegistrations:queueRegistry.sources.length,
    laterReceipts:depthResult.results.slice(1).filter(r=>r.firstSourceEvidence).length,
    unknownReservedYuan:exhausted.reservedYuan};
   assert.equal(queueProof.laterReceipts,0);
   const roundProbes=[];
   for(const [index,entry]of copyPrepared.entries.entries()){
    const expected=requests[index],round=expected.draft.ceilingYuan+expected.review.ceilingYuan;
    const available=round-0.000001,ledger=isolatedLedger(budget,3-available);
    assert.ok(available>expected.draft.ceilingYuan);
    const singleBudgetRoot=path.join(temp,`${format}-${entry.id}-budget`);
    await write(path.join(singleBudgetRoot,'budget.json'),ledger);
    const client=forbiddenClient(),captured=[];
    // Use the official expected candidate, draft builder, review builder and
    // source transform in their real pipeline slots; never substitute review
    // into the draft slot or invent a provider result.
    const result=await runContentPipeline({entries:[entry],root:path.join(temp,`${format}-${entry.id}-probe`),
     budgetRoot:singleBudgetRoot,client,cardId:'T09',allocation:{cardId:'T09',incrementLimitYuan:3,waveLimitYuan:20},
     revision:config.revision,contextFor:e=>contextFor(e,copyPrepared.world),
     buildDraftRequest,reviewDraftFor:buildDraftRequest.reviewDraftFor,buildReviewRequest,extractDraft,validateDraft,
     requestTransform:async details=>{const transformed=await hook.transform(details);captured.push({phase:details.phase,body:transformed.body});return transformed;},
     concurrency:1,batchSize:25});
    stoppedResult(result,1);assert.equal(client.generateCalls,0);
    assert.deepEqual(captured,[{phase:'draft',body:expected.draft.body},{phase:'review',body:expected.review.body}]);
    assert.deepEqual(await read(path.join(singleBudgetRoot,'budget.json')),ledger);
    // At exactly the measured round amount, the same rates-backed budget can
    // atomically hold both complete requests and refund both as never sent.
    // This isolated cost proof does not invoke generate or create L2 evidence.
    const enough=isolatedLedger(budget,3-round);
    await write(path.join(singleBudgetRoot,'budget.json'),enough);
    const reservation=await openContentBudget({file:path.join(singleBudgetRoot,'budget.json'),client,
     cardId:'T09',allocation:{cardId:'T09',incrementLimitYuan:3,waveLimitYuan:20}});
    let peak;
    try{
     const ids=await reservation.reserveRound(captured.map(r=>({body:r.body,label:`preflight-${r.phase}`})));
     const held=reservation.ledger,rows=ids.map(id=>held.requests[id]);
     assert.deepEqual(rows.map(r=>r.requestHash),[expected.draft.requestHash,expected.review.requestHash]);
     assert.deepEqual(rows.map(r=>r.reservedYuan),[expected.draft.ceilingYuan,expected.review.ceilingYuan]);
     peak=held.cards.T09.reservedYuan;assert.ok(Math.abs(peak-round)<1e-10);
     await reservation.releaseRound(ids);
     const refunded=reservation.ledger;
     assert.equal(refunded.spentYuan,enough.spentYuan);assert.ok(Math.abs(refunded.reservedYuan-enough.reservedYuan)<1e-10);
     assert.ok(Math.abs(refunded.cards.T09.reservedYuan)<1e-12);
     assert.ok(ids.every(id=>refunded.requests[id].status==='cancelled-unissued'));
     for(const [id,row]of Object.entries(enough.requests))assert.deepEqual(refunded.requests[id],row);
    }finally{await reservation.close();}
    assert.equal(client.generateCalls,0);
    const cardSpent=budget.cards?.T09?.spentYuan??0,cardReserved=budget.cards?.T09?.reservedYuan??0;
    const cardUsed=cardSpent+cardReserved;
    roundProbes.push({id:entry.id,roundCeilingYuan:round,peakIsolatedReservationYuan:peak,
     refusalAvailableYuan:available,draftAloneFits:true,providerCalls:0,refusalLedgerUnchanged:true,
     definiteUnsentRefund:true,originalCardAvailableYuan:3-cardUsed,fitsOriginalCardAtSnapshot:round<=3-cardUsed,
     minimumCardTotalAtSnapshotYuan:cardUsed+round,
     authorizedCardAvailableYuan:authorizedCardLimitYuan===null?null:authorizedCardLimitYuan-cardUsed,
     fitsAuthorizedCardAtSnapshot:authorizedCardLimitYuan===null?null:round<=authorizedCardLimitYuan-cardUsed,
     fitsSharedAtSnapshot:round<=(budget.waveLimitYuan??budget.limitYuan)-budget.spentYuan-budget.reservedYuan});
    await write(path.join(outputRoot,'request-preflight',format,expected.id+'.json'),expected);
   }
   report.formats[format]={entries:30,officialDraftBudgetProbes:30,reviewBuilderBudgetHandoffProbes:30,
    probeMeaning:'30 isolated official pipeline round refusals, each captures both draft and necessary review; legacy estimator unused',
    providerCalls:0,isolatedReservationYuan:0,isolatedCostProofRefunded:true,queueProof,roundProbes,
    maxSingleRoundYuan:Math.max(...roundProbes.map(r=>r.roundCeilingYuan)),
    draftCeilingYuan:requests.reduce((n,r)=>n+r.draft.ceilingYuan,0),reviewCeilingYuan:requests.reduce((n,r)=>n+r.review.ceilingYuan,0),
    totalCeilingYuan:requests.reduce((n,r)=>n+r.draft.ceilingYuan+r.review.ceilingYuan,0),
    requestBytes:requests.reduce((n,r)=>n+r.draft.utf8Bytes+r.review.utf8Bytes,0),
    // Historical aggregate fields remain descriptive sums, not affordability
    // gates. Per-ID checks above are the serial admission evidence.
    fitsOriginalCard:requests.reduce((n,r)=>n+r.draft.ceilingYuan+r.review.ceilingYuan,0)<=3};
   // Remove only this inspected disposable directory before the next format.
   assert.ok(copyRoot.startsWith(temp+path.sep));await fs.rm(copyRoot,{recursive:true,force:true});
  }
 }finally{assert.ok(temp.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
 assert.deepEqual(await frozenFiles(),before);
 const afterBudget=await fs.readFile(budgetFile);report.sharedBudget.sha256After=sha(afterBudget);report.sharedBudget.unchanged=sha(afterBudget)===sha(budgetRaw);
 assert.equal(report.sharedBudget.unchanged,true,'共享预算在预检期间变更，须重新取得一致快照');
 report.sourceCoverage={originalSourceOccurrences:report.coverage.flatMap(c=>c.originalSourceHashes).length/2,uniqueOriginalFields:new Set(report.coverage.flatMap(c=>c.originalSourceHashes).map(s=>`${s.collection}.${s.id}.${s.field}`)).size,privateRiskOccurrences:(await read(options.authoredBackground)).events.reduce((n,e)=>n+e.risks.length,0),patchLeaves:report.coverage.reduce((n,c)=>n+c.patchPaths.length,0),events:(await read(options.authoredBackground)).events.length};
 report.sharedBudget.availableCeilingYuan=(budget.waveLimitYuan??budget.limitYuan)-budget.spentYuan-budget.reservedYuan;
 for(const format of Object.values(report.formats))format.fitsSharedCeilingSum=format.totalCeilingYuan<=report.sharedBudget.availableCeilingYuan;
 report.serialAdmission={meaning:'Before each ID, reserve only that draft+necessary review round; settle actual cost and refund definite-unsent requests before the next ID. Retain unknown historical holds. Aggregate sums below are not concurrent prepayment requirements.',maximumRoundYuan:Math.max(...Object.values(report.formats).map(f=>f.maxSingleRoundYuan)),addedAuthorizationAmountKnown:authorizedCardLimitYuan!==null};
 report.reservationEnvelopeYuan={lower:Math.min(...Object.values(report.formats).map(f=>f.totalCeilingYuan)),upper:Math.max(...Object.values(report.formats).map(f=>f.totalCeilingYuan)),meaning:'Descriptive sum of 30 independent first-round draft+L2 ceilings only, never a required prepayment or a serial affordability conclusion. Actual serial settlement is unknown. No retries or later model calls included.'};
 await write(path.join(outputRoot,'request-preflight.json'),report);return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const r=await preflightT09();
 console.log(JSON.stringify({modelCalls:r.modelCalls,attachments:r.attachments.length,sexGaps:r.sourceGapsBefore.length,
  formats:Object.fromEntries(Object.entries(r.formats).map(([name,f])=>[name,{entries:f.entries,providerCalls:f.providerCalls,
   maxSingleRoundYuan:f.maxSingleRoundYuan,totalCeilingYuan:f.totalCeilingYuan,queueProof:f.queueProof}])),
  serialAdmission:r.serialAdmission,sharedBudgetUnchanged:r.sharedBudget.unchanged}));
}
