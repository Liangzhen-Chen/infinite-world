import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {digest,atomicJSON} from '../../../server-plugin/storage.mjs';
import {refreshProof,authorization} from './payment-proof.mjs';
const out=import.meta.dirname,run=path.join('F:/dnd/.git/playtest-runs',authorization.newRunId);
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const ledger=await read(path.join(run,'budget.json')),report=await read(path.join(out,'真实试玩.json'));
const contexts=(await fs.readFile(path.join(out,'runtime-contexts.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const evidence=[];let settledYuan=0,unknownYuan=0;
for(const [requestId,row] of Object.entries(ledger.requests))for(const [index,attempt] of row.attempts.entries()){
 const response=attempt.response??(index===row.attempts.length-1?row.response:null);
 const request=contexts.find(c=>c.requestHash===digest(row.request)&&c.label===row.label);
 const recorded=response&&contexts.find(c=>c.responseId===response.id&&c.label===row.label&&c.responseHash===digest(response));
 const usage=attempt.measurement?.usage,hit=usage?.prompt_cache_hit_tokens??usage?.prompt_tokens_details?.cached_tokens??0,miss=usage?.prompt_cache_miss_tokens??(usage?.prompt_tokens-hit),output=usage?.completion_tokens;
 const cost=(hit*.04+miss*2+output*8)/1e6;
 const verified=attempt.status==='settled'&&Boolean(request&&recorded&&response?.id&&ledger.responseIds[response.id]===requestId&&digest([row.request,row.label])===row.key&&usage&&Math.abs(cost-attempt.costUpperYuan)<1e-10&&recorded.unapproved.length===0&&request.unapproved.length===0);
 if(attempt.status==='settled')settledYuan+=attempt.costUpperYuan;else unknownYuan+=attempt.reservedYuan;
 evidence.push({requestId,index,label:row.label,role:row.role,status:attempt.status,responseId:response?.id,requestHash:digest(row.request),verified,costUpperYuan:attempt.costUpperYuan,reservedYuan:attempt.reservedYuan,error:attempt.error});
}
assert.ok(Math.abs(settledYuan-ledger.spentYuan)<1e-10);assert.ok(Math.abs(unknownYuan-ledger.reservedYuan)<1e-10);
assert.ok(ledger.spentYuan+ledger.reservedYuan<=8+1e-12);
const preserved=await read(path.join(out,'old-preservation.json'));
for(const row of preserved.files)assert.equal(digest(await fs.readFile(row.file,'utf8')),row.sha256,'原只读证据改变：'+row.file);
await fs.copyFile(path.join(run,'budget.json'),path.join(out,'persistent-budget.json'));
try{await fs.copyFile(path.join(run,'usage.jsonl'),path.join(out,'persistent-usage.jsonl'));}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(path.join(out,'tasks'),{recursive:true});for(const file of await fs.readdir(path.join(run,'tasks')))await fs.copyFile(path.join(run,'tasks',file),path.join(out,'tasks',file));
const proof=await refreshProof(),m2=report.m2,tools=report.toolSelection;
const strictLedger=report.complete&&report.assertions>0&&report.passed===report.assertions&&report.results.every(r=>r.turns.length&&r.ledgerPass);
const audit={capturedAt:new Date().toISOString(),runId:ledger.runId,authorization,oldEvidenceUnchanged:true,historyAttributionComplete:false,budgetUpperSafe:proof.budgetUpperSafe,initialProbe:await read(path.join(out,'initial-probe.json')),modelLedgerComplete:evidence.length>0&&evidence.every(r=>r.verified),evidence,spentYuan:ledger.spentYuan,unknownReservedYuan:ledger.reservedYuan,complete:report.complete,expectedSessions:report.targetSessions,completedSessions:report.completedSessions,completedTurns:report.results.reduce((n,r)=>n+r.turns.length,0),strictLedger100:strictLedger,assertions:report.assertions,passed:report.passed,m2,toolSelection:tools,cardAcceptancePass:report.acceptancePass&&strictLedger&&evidence.every(r=>r.verified),proof};
await atomicJSON(path.join(out,'audit.json'),audit);
console.log(JSON.stringify({runId:audit.runId,complete:audit.complete,completedTurns:audit.completedTurns,ledger:`${audit.passed}/${audit.assertions}`,modelLedgerComplete:audit.modelLedgerComplete,N:m2?{measured:m2.measured,passed:m2.passed,ratio:m2.ratio,privacy:m2.privacy,offscreenPass:m2.offscreenPass}:null,tools:tools?{opportunities:tools.opportunities,missed:tools.missed,wrong:tools.wrong,parameterOpportunities:tools.parameterOpportunities,parameterWrong:tools.parameterWrong,targetOpportunities:tools.targetOpportunities,targetWrong:tools.targetWrong}:null,spent:audit.spentYuan,reserved:audit.unknownReservedYuan,cardAcceptancePass:audit.cardAcceptancePass}));
