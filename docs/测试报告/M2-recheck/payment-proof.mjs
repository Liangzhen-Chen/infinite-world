import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {digest,atomicJSON} from '../../../server-plugin/storage.mjs';
import {budgetUpperProof,readOptional} from '../../../tools/playtest-budget.mjs';
const out=import.meta.dirname;
export const authorization={originalRunId:'t17-m2-20261012-01',priorRunId:'t17-m2-20261012-02',reopenId:'user-reopen-20261012-01',newRunId:'m2-recheck-001',newLimitYuan:8,initialProbeYuan:1,maxCalls:450,parentUpperYuan:8};
const originalHistory=path.resolve(out,'../20261012-T17-new/payment-history.json');
const originalHistoryHash='1ac8412d8ff67046087b7201360c7103a36932360bfe2c8081ae9510c270dec1';
const root='F:/dnd',registry=path.join(root,'.git/playtest-runs'),goalStart='2026-10-12T08:02:00.000Z';
async function filesUnder(directory,predicate){const rows=[];for(const e of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,e.name);if(e.isDirectory())rows.push(...await filesUnder(file,predicate));else if(e.isFile()&&predicate(e.name))rows.push(file);}return rows.sort();}
async function checked(file,hash,canonical=false){const bytes=await fs.readFile(file,'utf8'),value=JSON.parse(bytes);if(hash)assert.equal(digest(canonical?value:bytes),hash,`预算来源hash变化：${file}`);return {value,file,hash:digest(bytes)};}
export async function refreshProof(){
 const original=await checked(originalHistory,originalHistoryHash),history=original.value,sources=[{file:original.file,hash:original.hash}];
 for(const row of history.files){const bytes=await fs.readFile(row.file,'utf8');assert.equal(digest(bytes),row.hash,`旧预算证据改变：${row.file}`);sources.push(row);}
 const legacy=await checked(history.legacy.report.file,history.legacy.report.hash,true);sources.push({file:legacy.file,hash:legacy.hash});
 const legacyLog=await fs.readFile(history.legacy.logFile,'utf8');assert.equal(digest(legacyLog),history.legacy.logHash);sources.push({file:history.legacy.logFile,hash:history.legacy.logHash});
 assert.equal(history.spentYuan,.28484248);assert.equal(history.unknownReservedYuan,6.372890000000001);assert.ok(Math.abs(legacy.value.costUpperYuan-5.77063128)<1e-10);
 assert.ok(history.settled.every(row=>row.verified));assert.equal(history.legacy.unattributed.length,110);
 const content=[];for(const file of await filesUnder(path.join(root,'world/drafts'),name=>name==='budget.json')){const row=await checked(file);
  const legacyNoReservations=!Object.hasOwn(row.value,'reservedYuan')&&!row.value.cards&&!row.value.requests&&row.value.limitYuan===20;
  content.push({file,hash:row.hash,spentYuan:row.value.spentYuan,reservedYuan:legacyNoReservations?0:row.value.reservedYuan,reservationSource:legacyNoReservations?'tools/content-budget.mjs: legacy ledger reservedYuan ?? 0; no cards/requests; original file retained':'explicit original reservedYuan',shared:file===path.join(root,'world/drafts/m4-object/budget.json')});}
 assert.ok(content.length>=9,'主目录预算覆盖不完整');
 let extraYuan=0;const otherRuns=[];
 for(const e of await fs.readdir(registry,{withFileTypes:true}))if(e.isDirectory()&&e.name!==authorization.newRunId){const row=await checked(path.join(registry,e.name,'budget.json'));
  assert.ok(Number.isFinite(row.value.spentYuan)&&row.value.spentYuan>=0&&Number.isFinite(row.value.reservedYuan)&&row.value.reservedYuan>=0);
  if(e.name===authorization.originalRunId)assert.equal(digest(row.value),history.latestSnapshotHash,'旧run实际账改变');
  else if(e.name===authorization.priorRunId){assert.ok(row.value.spentYuan+row.value.reservedYuan<=authorization.parentUpperYuan+1e-12);const report=await checked(path.resolve(out,'../20261012-T60/真实试玩.json'));assert.equal(report.value.runId,row.value.runId);assert.ok(Math.abs(report.value.spentYuan-row.value.spentYuan)<1e-10);sources.push({file:report.file,hash:report.hash});}
  else extraYuan+=row.value.spentYuan+row.value.reservedYuan;
  otherRuns.push({file:row.file,hash:row.hash,spentYuan:row.value.spentYuan,reservedYuan:row.value.reservedYuan});
 }
 const usageFiles=[...await filesUnder(path.join(root,'logs'),name=>name.endsWith('usage.jsonl')),...await filesUnder(registry,name=>name==='usage.jsonl')].filter(file=>!file.startsWith(path.join(registry,authorization.newRunId)+path.sep));
 const usage=[];for(const file of usageFiles){const bytes=await fs.readFile(file,'utf8');const rows=bytes.trim()?bytes.trim().split('\n').map(JSON.parse):[];let afterStartYuan=0;
  for(const row of rows){assert.ok(Number.isFinite(row.costUpperYuan)&&row.costUpperYuan>=0&&Number.isFinite(Date.parse(row.timestamp)),`用量金额/时间缺失：${file}`);if(Date.parse(row.timestamp)>=Date.parse(goalStart))afterStartYuan+=row.costUpperYuan;}
  extraYuan+=afterStartYuan;usage.push({file,hash:digest(bytes),rows:rows.length,afterStartYuan});
 }
 const proof={capturedAt:new Date().toISOString(),authorization,sources,content,otherRuns,usage,goalStart,coverage:'主world/drafts所有budget；主logs所有usage.jsonl及持久runs；本新run由8元全额上界覆盖；历史及可能重复全额保守计，不去重、不退未知',historyAttributionComplete:false,unattributedRequests:110,unattributedYuan:1.41941680,...budgetUpperProof({oldSpentYuan:history.spentYuan,oldReservedYuan:history.unknownReservedYuan,legacyYuan:legacy.value.costUpperYuan+authorization.parentUpperYuan,content,extraYuan,newLimitYuan:8})};
 await atomicJSON(path.join(out,'budget-envelope.json'),proof);return proof;
}
let stopped=null;
export async function beforeReserve({ledger,ceiling}){
 if(stopped)throw Error('预算proof已停止：'+stopped);
 try{
 const proof=await refreshProof(),probe=await readOptional(path.join(out,'initial-probe.json'));
 assert.equal(ledger.runId,authorization.newRunId);assert.deepEqual(ledger.identity.authorization,authorization);
 const calls=Object.values(ledger.requests).reduce((n,row)=>n+row.attempts.length,0);
 assert.ok(calls<authorization.maxCalls,'新增模型调用达到450次，拒绝发送');
 const limit=probe?.verified===true?8:1;
 assert.ok(ledger.spentYuan+ledger.reservedYuan+ceiling<=limit+1e-12,`新增预算${limit}元不足，拒绝发送`);
 return {...proof,probeVerified:probe?.verified===true,currentCalls:calls,currentSpentYuan:ledger.spentYuan,currentReservedYuan:ledger.reservedYuan,requestCeilingYuan:ceiling};
 }catch(error){stopped=error.message;throw error;}
}
export async function verifyProbe(result,client){
 const ledger=client.ledger,requests=Object.entries(ledger.requests);
 assert.ok(result.turns.length===1&&result.turns.every(t=>!t.errors.length)&&result.assertions>0&&result.assertions===result.passed,'初探HTTP/账本未100%通过');
 assert.ok(ledger.spentYuan+ledger.reservedYuan<=1&&ledger.reservedYuan<1e-12&&requests.length&&requests.every(([id,row])=>row.status==='settled'&&row.response?.id&&ledger.responseIds[row.response.id]===id&&digest([row.request,row.label])===row.key&&row.attempts.every(a=>a.status==='settled'&&a.measurement?.usage)),'初探原请求/responseId/用量/结算不完整');
 const proof=await refreshProof();await atomicJSON(path.join(out,'initial-probe.json'),{verified:true,capturedAt:new Date().toISOString(),scope:'正常HTTP完整提示栈首回合；不计N或十场结果',result,ledger,proof});
}
