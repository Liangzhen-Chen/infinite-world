import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {completeOptions,officialCheck} from './prepare-complete.mjs';
import {prepareDepthRevision} from '../../../../../tools/npc-depth.mjs';
import {runDepthReview} from '../../../../../tools/npc-depth-review.mjs';
import {buildReviewRequest,patchDraft,checkIncrementalReview} from '../../../../../tools/npc-depth-content.mjs';
import {compactReviewRequest,loadEvidence} from '../../../../../tools/npc-depth-source-evidence.mjs';
import {DeepSeekClient} from '../../../../../tools/deepseek-client.mjs';
import {hashContent} from '../../../../../tools/content-pipeline.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'complete-003');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse),write=(file,value)=>fs.writeFile(path.join(out,file),JSON.stringify(value,null,2)+'\n');
const budgetSnapshot=ledger=>({spentYuan:ledger.spentYuan,reservedYuan:ledger.reservedYuan,limitYuan:ledger.waveLimitYuan??ledger.limitYuan,T07:ledger.cards.T07});
export async function run(mode){
 assert.ok(['pilot','continue'].includes(mode));await fs.mkdir(out,{recursive:true});
 const options=await completeOptions(),prepared=await prepareDepthRevision(options),before=await read(path.join(options.budgetRoot,'budget.json'));
 const protect=prepared.entries.filter(e=>!prepared.plan.authorized.some(a=>a.id===e.id));assert.equal(protect.length,12);
 if(mode==='pilot'){
  const check=await officialCheck();assert.deepEqual(check.L1Errors,[]);assert.deepEqual(check.issues,[]);
  const snapshot={authorizationHash:options.authorizationHash,oldProofHash:hashContent(prepared.previousProof),protected:await Promise.all(protect.map(async e=>({id:e.id,rawHash:hashContent(await fs.readFile(path.join(options.root,e.id+'.json'),'utf8')),fingerprint:(await read(path.join(options.root,e.id+'.json'))).fingerprint}))),budgetBefore:budgetSnapshot(before),recordedAt:new Date().toISOString()};
  await fs.writeFile(path.join(out,'pre-review.json'),JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
  await fs.writeFile(path.join(out,'previous-proof.json'),JSON.stringify(prepared.previousProof,null,2)+'\n',{flag:'wx'});
 }
 const snapshot=await read(path.join(out,'pre-review.json'));assert.equal(snapshot.authorizationHash,options.authorizationHash);
 const ids=mode==='pilot'?['npc_wt_zhangou']:prepared.plan.authorized.map(a=>a.id).filter(id=>id!=='npc_wt_zhangou'),results=[];
 const client=new DeepSeekClient({budgetYuan:20,logFile:path.join(out,'usage.jsonl')});
 for(const id of ids){
  const current=await prepareDepthRevision(options),entry=current.entries.find(e=>e.id===id),item=current.plan.authorized.find(a=>a.id===id),context=current.contexts.get(id);
  const sourceEvidence=path.resolve(options.root,item.sourceEvidence.file),evidence=await loadEvidence(sourceEvidence,entry,current.world);
  const request=compactReviewRequest(buildReviewRequest(entry,patchDraft(entry),context,{requireLeafCoverage:true}));request.messages.push({role:'user',content:JSON.stringify(evidence.data)});
  const encoded=JSON.stringify({model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...request}),ceilingYuan=(Buffer.byteLength(encoded)*2+1800*8)/1e6;
  const ledger=await read(path.join(options.budgetRoot,'budget.json'));
  const newUpper=ledger.cards.T07.spentYuan-before.cards.T07.spentYuan+ledger.cards.T07.reservedYuan+ceilingYuan;
  await write(id+'-preflight.json',{id,requestHash:hashContent(request),sourceEvidenceHash:evidence.contentHash,utf8Bytes:Buffer.byteLength(encoded),ceilingYuan,budget:budgetSnapshot(ledger),firstIdNewUpperYuan:newUpper,compactReconstructibleOnly:true});
  if(mode==='pilot')assert.ok(newUpper<=.50+1e-12,'首ID完整请求上界超过0.50');
  let result;
  try{const response=await runDepthReview({...options,id,sourceEvidence,compactRequest:true,continueReopen:mode==='continue'},{client});result={id,status:response.status,skipped:response.skipped??false,reason:response.reason??null,error:response.error??null,hard:response.review?.contradictions?.filter(c=>c.severity==='hard')??[],budgetAfter:budgetSnapshot(await read(path.join(options.budgetRoot,'budget.json')))};}
  catch(error){result={id,status:'stopped-before-request',error:error.message,budgetAfter:budgetSnapshot(await read(path.join(options.budgetRoot,'budget.json')))};}
  await write(id+'-result.json',result);results.push(result);
  for(const row of snapshot.protected)assert.equal(hashContent(await fs.readFile(path.join(options.root,row.id+'.json'),'utf8')),row.rawHash,'未变12原record字节改变');
  if(result.status!=='passed'){await write(mode+'-results.json',results);console.log(JSON.stringify({mode,results}));return results;}
  const saved=await read(path.join(options.root,id+'.json'));
  assert.ok(!checkIncrementalReview(saved.review,entry,context).some(c=>c.severity==='hard'));
 }
 await write(mode+'-results.json',results);console.log(JSON.stringify({mode,results}));return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run(process.argv[2]);
