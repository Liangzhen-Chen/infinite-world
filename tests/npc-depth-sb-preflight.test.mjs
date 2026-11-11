import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preflightT09,requestMeasure} from '../world/drafts/w1/sb-depth/request-preflight.mjs';

const firstRoot=path.resolve('world/drafts/w1/sb-depth/first-review');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('T48正式全/compact逐ID整轮拒发、准确预留退款及原未知预算保留',async t=>{
 const outputRoot=await fs.mkdtemp(path.join(tmpRoot(),'t48-preflight-test-'));
 t.after(async()=>{assert.ok(outputRoot.startsWith(path.resolve(tmpRoot())+path.sep));await fs.rm(outputRoot,{recursive:true,force:true});});
 const sharedFile=path.resolve(import.meta.dirname,'../world/drafts/m4-object/budget.json'),before=await fs.readFile(sharedFile);
 // A supplied amount is used only in the report arithmetic, never to change
 // allocation or obtain a model slot. Here the test uses the original 3 yuan.
 const report=await preflightT09({outputRoot,authorizedCardLimitYuan:3});
 assert.equal(report.modelCalls,0);assert.equal(report.approvals.L2,'not-run');assert.equal(report.approvals.L4,'not-approved');
 assert.equal(report.sharedBudget.readOnly,true);assert.equal(report.sharedBudget.unchanged,true);
 assert.equal(report.sharedBudget.sha256,digest(before));assert.deepEqual(await fs.readFile(sharedFile),before);
 assert.deepEqual(report.sourceCoverage,{originalSourceOccurrences:172,uniqueOriginalFields:145,privateRiskOccurrences:60,patchLeaves:373,events:15});
 assert.equal(report.attachments.length,11);
 for(const frozen of report.frozen)assert.equal(digest(await fs.readFile(path.resolve(frozen.file))),frozen.sha256);
 const old=await read(path.join(firstRoot,'request-preflight.json'));
 assert.deepEqual(report.coverage,old.coverage);assert.deepEqual(report.sourceGapsBefore,old.sourceGapsBefore);
 for(const format of ['full','compact']){
  const result=report.formats[format];
  assert.equal(result.providerCalls,0);assert.equal(result.isolatedReservationYuan,0);assert.equal(result.isolatedCostProofRefunded,true);
  assert.equal(result.roundProbes.length,30);assert.equal(result.officialDraftBudgetProbes,30);assert.equal(result.reviewBuilderBudgetHandoffProbes,30);
  assert.deepEqual(result.queueProof,{entries:30,providerCalls:0,pending:30,attempts:0,ledgerUnchanged:true,
   firstStoppedId:report.coverage[0].id,sourceRegistrations:11,laterReceipts:0,unknownReservedYuan:report.sharedBudget.reservedYuan});
  let sum=0;
  for(const [i,row]of result.roundProbes.entries()){
   assert.equal(row.id,report.coverage[i].id);
   const emitted=await read(path.join(outputRoot,'request-preflight',format,row.id+'.json'));
   const committed=await read(path.join(firstRoot,'request-preflight',format,row.id+'.json'));
   // Both complete outgoing requests remain identical to the frozen T09
   // artifacts; pipeline transform captures were asserted before emission.
   assert.deepEqual(emitted,committed);
   for(const phase of ['draft','review'])assert.deepEqual(emitted[phase],requestMeasure(emitted[phase].body));
   near(row.roundCeilingYuan,emitted.draft.ceilingYuan+emitted.review.ceilingYuan);
   near(row.peakIsolatedReservationYuan,row.roundCeilingYuan);
   assert.ok(row.refusalAvailableYuan>=emitted.draft.ceilingYuan);
   assert.ok(row.refusalAvailableYuan<row.roundCeilingYuan);
   assert.equal(row.providerCalls,0);assert.equal(row.refusalLedgerUnchanged,true);assert.equal(row.definiteUnsentRefund,true);
   assert.equal(row.fitsOriginalCardAtSnapshot,row.roundCeilingYuan<=row.originalCardAvailableYuan);
   assert.equal(row.authorizedCardAvailableYuan,row.originalCardAvailableYuan);
   assert.equal(row.fitsAuthorizedCardAtSnapshot,row.fitsOriginalCardAtSnapshot);
   assert.equal(row.fitsSharedAtSnapshot,row.roundCeilingYuan<=report.sharedBudget.availableCeilingYuan);
   sum+=row.roundCeilingYuan;
  }
  near(sum,result.totalCeilingYuan);
  assert.equal(result.maxSingleRoundYuan,Math.max(...result.roundProbes.map(r=>r.roundCeilingYuan)));
  // The paid ledger now has less available headroom than the original snapshot. Neither
  // condition predicts later serial settlement or authorizes a paid request.
  assert.ok(sum>3);assert.equal(result.roundProbes.filter(r=>r.fitsOriginalCardAtSnapshot).length,result.roundProbes.filter(r=>r.roundCeilingYuan<=r.originalCardAvailableYuan).length);
  assert.equal(result.fitsOriginalCard,false);
 }
 assert.equal(report.serialAdmission.maximumRoundYuan,Math.max(...Object.values(report.formats).map(f=>f.maxSingleRoundYuan)));
 for(const name of ['budget.json','allocation.json','terminal.json','summary.json','first-source-evidence.json','batch-0.json'])await assert.rejects(fs.stat(path.join(outputRoot,name)),/ENOENT/);
});

test('T48保存预检对待确定增额保留未知，不从30人合计推断串行准入',async()=>{
 const report=await read(path.join(firstRoot,'request-preflight.json'));
 assert.equal(report.limits.authorizedCardLimitYuan,null);
 assert.equal(report.serialAdmission.addedAuthorizationAmountKnown,false);
 for(const format of Object.values(report.formats))for(const row of format.roundProbes){
  assert.equal(row.authorizedCardAvailableYuan,null);assert.equal(row.fitsAuthorizedCardAtSnapshot,null);
  near(row.minimumCardTotalAtSnapshotYuan,(report.sharedBudget.card?.spentYuan??0)+(report.sharedBudget.card?.reservedYuan??0)+row.roundCeilingYuan);
 }
 assert.match(report.serialAdmission.meaning,/settle actual cost/);
 assert.match(report.reservationEnvelopeYuan.meaning,/never a required prepayment/);
 assert.ok(report.blockers.every(b=>!b.includes('review-budget failure')));
});
