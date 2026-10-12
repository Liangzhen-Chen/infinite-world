import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomInt} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from './deepseek-client.mjs';
import {openContentBudget} from './content-budget.mjs';
import {hashContent,parseModelJSON} from './content-pipeline.mjs';
import {contextFor,buildReviewRequest,validateDraft,checkIncrementalReview,patchDraft,depthBackgroundSources} from './npc-depth-content.mjs';
import {depthOptions,prepareDepth,prepareDepthRevision,loadDepthReopen,frozenDepthRecord} from './npc-depth.mjs';
import {loadEvidence,compactReviewRequest} from './npc-depth-source-evidence.mjs';
export {compactReviewRequest} from './npc-depth-source-evidence.mjs';

export const reviewHelp='npc-depth-review --id <单条失败id> --design <设计> --root <候选目录> --budget-root <共享预算目录> --card <原T编号> [--source-evidence <json>] [--compact-request] [--authored-background <json>] [--controlled-revision <json> --authorization-hash <规划hash>]\n旧格式：npc-depth-review <id> <budget-root> [旧batch] --card <原T编号>。只为已登记单卡的一条失败记录复审一次；不增加额度，保留原 attempts 与失败证据，passed 跳过。revision 和 foundation 必须保持冻结；复审后重新绑定批次指纹，仍须新的 L4 阅读。source-evidence 为 {sourceRecords:[{id,name,...原始字段}],reviewBoundary:"审核边界"}，原字段必须与冻结 world 来源逐项相符，全文与哈希留证。authored-background 显式冻结独立新背景；controlled-revision 需规划hash、原记录和实际失效证据；--l4-notes 记录独立出处及逐叶L4补件，模型调用0，仍须原批次L4。compact-request 仅去掉可由 before/patches/issues 完整重建的 facts/revisions；默认保留完整请求，输出仍为1800。\n --reopen-authorization <world内JSON> 使用固定user-reopen-20261012-01原账增额与有界新轮；默认首ID累计0.50元，首ID完整通过后显式--reopen-continue逐ID继续；已有定稿直接完整L2，保留旧proof及费用。\n --source-checkout-evidence <world内JSON> 仅用于原T07规划的固定LF/CRLF出处凭证；缺省保持原逐字校验，复审收据和发布重放冻结凭证路径及hash。';
const safeId=id=>/^[a-z][a-z0-9_-]+$/i.test(id??'');
const read=file=>fs.readFile(file,'utf8').then(JSON.parse);
async function write(file,value){const temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,file);}
export function reviewOptions(argv=process.argv.slice(2)){
 const allowed=new Set(['--id','--batch','--design','--root','--budget-root','--card','--source-evidence','--authored-background','--controlled-revision','--authorization-hash','--l4-notes','--source-checkout-evidence','--source-evidence-map','--reopen-authorization']),positional=[],seen=new Set();
 for(let i=0;i<argv.length;i++){if(argv[i]==='--help'||argv[i]==='--compact-request'||argv[i]==='--reopen-continue')continue;if(argv[i].startsWith('--')){if(!allowed.has(argv[i]))throw Error('不支持额外授权或参数 '+argv[i]);if(seen.has(argv[i]))throw Error('重复参数 '+argv[i]);seen.add(argv[i]);if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error('缺少参数 '+argv[i]);i++;}else positional.push(argv[i]);}
 const options=depthOptions(argv),modern=['--id','--design','--root','--budget-root'].some(flag=>argv.includes(flag));
 if(options.help)return options;
 if(modern&&positional.length||!modern&&(positional.length<2||positional.length>3))throw Error('需要显式单条 id 与共用预算目录');
 const id=modern?argv[argv.indexOf('--id')+1]:positional[0];
 if(modern&&!argv.includes('--id')||!safeId(id)||!options.cardId)throw Error('需要安全的单条 --id 和原授权 --card');
 const batch=modern?options.batch:positional[2]??'yupo-depth';
 const sourceAt=argv.indexOf('--source-evidence');
 return {...options,id,batch,root:modern?options.root:path.resolve(`world/drafts/w1/${batch}`),budgetRoot:modern?options.budgetRoot:path.resolve(positional[1]),sourceEvidence:sourceAt<0?undefined:path.resolve(argv[sourceAt+1]),compactRequest:argv.includes('--compact-request'),l4Notes:argv.includes('--l4-notes')?path.resolve(argv[argv.indexOf('--l4-notes')+1]):undefined};
}
const rowHash=rows=>hashContent(rows.map(({id,draft,review,status})=>({id,draft,review,status})));
function checkReview(review){
 if(!Array.isArray(review?.contradictions)||review.contradictions.some(r=>!['hard','soft','style'].includes(r.severity)||!['quote','field','reason'].every(k=>typeof r[k]==='string'&&r[k].trim())))throw Error('无效复审结果');
 return review.contradictions;
}
async function reviewBatch(root,id,prepared,reopening){
 if(reopening){try{await fs.access(path.join(root,'summary.json'));}catch(error){if(error.code!=='ENOENT')throw error;
  const rows=await Promise.all(prepared.entries.map(async entry=>{try{return await read(path.join(root,entry.id+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;return frozenDepthRecord(entry,prepared.contexts?.get(entry.id)??contextFor(entry,prepared.world),prepared.config.revision);}})),batches=[];
  for(let start=0;start<rows.length;start+=25){const slice=rows.slice(start,start+25);batches.push({index:batches.length,ids:slice.map(r=>r.id),fingerprint:rowHash(slice),count:slice.length,passed:0,manual:[],pending:slice.map(r=>r.id),flagged:[],sample:[],l4:{approved:false,notes:[]}});}
  return{initial:true,allRows:rows,summary:{batches},batch:batches.find(b=>b.ids.includes(id)),rows:rows.filter(r=>batches.find(b=>b.ids.includes(id)).ids.includes(r.id))};
 }}
 const summary=await read(path.join(root,'summary.json'));
 const matches=summary.batches?.filter(b=>b.ids?.includes(id));
 if(matches?.length!==1)throw Error('失败 id 必须属于唯一的已有审核批次');
 const batch=await read(path.join(root,`batch-${matches[0].index}.json`));
 assert.deepEqual(batch.ids,matches[0].ids,'批次清单已改变');
 if(!batch.ids.every(safeId)||new Set(batch.ids).size!==batch.ids.length)throw Error('批次 id 无效');
 const rows=await Promise.all(batch.ids.map(id=>read(path.join(root,id+'.json'))));
 assert.deepEqual(rows.map(r=>r.id),batch.ids,'批次记录 id 不符');
 assert.equal(batch.fingerprint,matches[0].fingerprint,'摘要与批次指纹不一致');
 assert.equal(batch.fingerprint,rowHash(rows),'复审前批次内容已改变');
 return{summary,batch,rows};
}
async function rebindBatch(root,state,record,ledger,foundationHash){
 const {batch,summary}=state,rows=state.rows.map(r=>r.id===record.id?record:r),invalidated=new Set(state.invalidatedIds??[]),operative=r=>!invalidated.has(r.id)||r.incremental?.authorizationHash===state.authorizationHash&&r.reviewRecovery?.status==='passed-L1-L2',passed=rows.filter(r=>r.status==='passed'&&operative(r));
 batch.fingerprint=rowHash(rows);batch.count=rows.length;batch.passed=passed.length;
 batch.operativeInvalidated=rows.filter(r=>!operative(r)).map(r=>r.id);batch.manual=rows.filter(r=>r.status==='manual'||!operative(r)).map(r=>r.id);batch.pending=rows.filter(r=>r.status==='pending').map(r=>r.id);
 batch.manualRatio=batch.manual.length/batch.count;batch.needsSystemicRepair=batch.manualRatio>.1;
 batch.flagged=[...new Set([...(state.reopening?batch.flagged??[]:[]),...rows.filter(r=>r.warnings?.length).map(r=>r.id),record.id])];
 const pool=[...passed];for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}batch.sample=pool.slice(0,5).map(r=>r.id);
 batch.l4History=[...(batch.l4History??[]),{...batch.l4,supersededBy:record.id,priorFingerprint:state.summary.batches.find(b=>b.index===batch.index).fingerprint}];
 batch.l4={approved:false,notes:[]};batch.foundationHash=foundationHash;batch.costUpperYuan=ledger.spentYuan+ledger.reservedYuan;
 summary.batches=summary.batches.map(b=>b.index===batch.index?batch:b);
 summary.total=summary.batches.reduce((n,b)=>n+b.count,0);summary.passed=summary.batches.reduce((n,b)=>n+b.passed,0);
 summary.manual=summary.batches.reduce((n,b)=>n+b.manual.length,0);summary.pending=summary.batches.reduce((n,b)=>n+b.pending.length,0);
 summary.costUpperYuan=batch.costUpperYuan;summary.budget=ledger;summary.foundationHash=foundationHash;
 if(state.initial){for(const row of state.allRows)if(row.id!==record.id)await write(path.join(root,row.id+'.json'),row);for(const other of summary.batches)if(other.index!==batch.index)await write(path.join(root,`batch-${other.index}.json`),other);}
 await write(path.join(root,`batch-${batch.index}.json`),batch);await write(path.join(root,'summary.json'),summary);
}
export async function runDepthReview(options=reviewOptions(),{client,prepare=prepareDepth}={}){
 if(options.help)return{help:reviewHelp};
 if(options.l4Notes)return recordDepthIncrementalL4(options,{prepare});
 const {root,budgetRoot,id,cardId}=options;
 if(options.continueReopen&&!options.reopenAuthorization)throw Error('后续轮标志须提供固定重开授权');
 if(options.reopenAuthorization)await Promise.all(['base','candidate','foundation','manifest'].map(name=>fs.access(path.join(root,name+'.json'))));
 if(!options.reopenAuthorization&&cardId==='T06'&&(options.authoredBackground||options.controlledRevision))throw Error('T06继续冻结');
 if(!safeId(id)||!budgetRoot||!cardId)throw Error('需要安全的单条 id、预算目录及原 card');
 const file=path.join(root,id+'.json');let record=await read(file).catch(e=>{if(e.code==='ENOENT'&&options.reopenAuthorization)return null;throw e;});
 if(record)assert.equal(record.id,id,'失败记录 id 不匹配');
 if(record?.status==='passed'&&!options.controlledRevision)return{id,status:'passed',skipped:true};
 if(record?.reviewRecovery&&!options.reopenAuthorization)return{id,status:record.status,skipped:true,reason:'单条复审机会已使用'};
 if(!options.reopenAuthorization&&!options.controlledRevision&&(!['manual','pending'].includes(record.status)||!record.errors?.length||!record.draft))throw Error('需要有失败证据和合法 draft 的记录');
 const prepared=await (options.controlledRevision&&prepare===prepareDepth?prepareDepthRevision:prepare)(options),{config,entries,world,foundation}=prepared,entry=entries.find(e=>e.id===id);
 if(!entry)throw Error('条目不属于本批');
 const reopening=prepared.reopening??await loadDepthReopen(options,prepared);
 if(!record)record=frozenDepthRecord(entry,prepared.contexts?.get(id)??contextFor(entry,world),config.revision);
 if(reopening&&!reopening.grant.allowed.some(a=>a.id===id))throw Error('ID未获重开授权');
 const revision=config.revision,context=prepared.contexts?.get(id)??contextFor(entry,world),fingerprint=hashContent({entry,context,revision});
 if(!options.controlledRevision&&!reopening)assert.equal(record.fingerprint,fingerprint,'同 revision 的冻结候选或引用已改变');
 else if(options.controlledRevision&&!prepared.plan.authorized.some(a=>a.id===id))throw Error('ID未获本次规划授权');
 const foundationHash=hashContent(foundation);assert.equal(hashContent(await read(path.join(root,'foundation.json'))),foundationHash,'冻结 foundation 已改变');
 if(reopening&&record.status==='passed'&&record.fingerprint===fingerprint)return{id,status:'passed',skipped:true,reason:'未变passed完整L2复用'};
 const nextDraft=options.controlledRevision||reopening&&!record.draft?{id:entry.id,contract:entry.contract,patches:structuredClone(entry.patches)}:record.draft;
 const check=validateDraft(nextDraft,entry);if(check.errors.length)throw Error(check.errors.join('\n'));
 let sourceEvidence=options.sourceEvidence;
 if(options.sourceEvidenceMap){const map=await read(options.sourceEvidenceMap);if(!map[id])throw Error('首次来源索引缺ID');sourceEvidence=path.resolve(path.dirname(options.sourceEvidenceMap),map[id]);}
 const evidence=await loadEvidence(sourceEvidence,entry,world);
 if(reopening&&record.firstSourceEvidence&&!evidence)throw Error('重开须保留原来源附件');
 let request=buildReviewRequest(entry,nextDraft,context,{requireLeafCoverage:!!reopening});
 if(options.compactRequest)request=compactReviewRequest(request);
 if(evidence)request.messages.push({role:'user',content:JSON.stringify(evidence.data)});
 assert.equal(request.max_tokens,1800,'复审输出额度保持1800');
 const state=await reviewBatch(root,id,prepared,reopening);if(options.controlledRevision){state.invalidatedIds=prepared.plan.authorized.map(a=>a.id);state.authorizationHash=options.authorizationHash;}state.reopening=!!reopening;const allocation=await read(path.join(root,'allocation.json')).catch(e=>{if(e.code==='ENOENT'&&reopening&&cardId==='T09')return structuredClone(reopening.grant.allocation);throw e;}),before=await read(path.join(budgetRoot,'budget.json'));
 if(!before.cards?.[cardId]&&!(reopening&&cardId==='T09'))throw Error('复审只使用已登记单卡额度，不得新领额度');
 if(allocation.cardId&&allocation.cardId!==cardId)throw Error('allocation card 不匹配');
 client??=new DeepSeekClient({budgetYuan:20,logFile:`logs/w1-${options.batch}-usage.jsonl`});
 const budget=await openContentBudget({file:path.join(budgetRoot,'budget.json'),client,cardId,allocation,...(reopening?{reopenAuthorization:reopening.manifest,reopenId:id,continueReopen:options.continueReopen}:{})});
 let reservations=[];
 try{
  if(reopening){const previous=budget.ledger.reopenAuthorizations[reopening.manifest.id].cards[cardId].attempts[id]??[];const attemptFingerprint=hashContent({draft:nextDraft,sourceEvidence:evidence?.contentHash??null,authoredBackground:context.authoredBackground??null});if(previous.some(a=>a.fingerprint===attemptFingerprint)||previous.length>=reopening.grant.maxAttempts)return{id,status:record.status,skipped:true,reason:'本授权同文已审或有界尝试已用尽'};reservations=await budget.reserveRound([{body:request,label:`content-${cardId}-${id}-manual-review`}]);if(!await budget.claimReopenReview(id,attemptFingerprint))throw Error('重开尝试已领取');}
  else if(!await budget.claimReviewRecovery(id,fingerprint))return{id,status:record.status,skipped:true,reason:'稳定单卡复审机会已使用'};
  const prior=structuredClone(record);
  if(reopening){record.reopenAuthorization={id:reopening.manifest.id,manifestHash:reopening.manifestHash,file:reopening.file,attemptFingerprint:hashContent({draft:nextDraft,sourceEvidence:evidence?.contentHash??null,authoredBackground:context.authoredBackground??null})};if(record.budgetStop){record.budgetStopHistory=[...(record.budgetStopHistory??[]),record.budgetStop];delete record.budgetStop;}if(!record.draft)record.draft=nextDraft;}
  if(options.controlledRevision){
   const proof=prepared.receipt??{kind:'incremental-depth-proof',authorizationHash:options.authorizationHash,planHash:hashContent(prepared.plan),planFile:path.relative(root,options.controlledRevision).replaceAll('\\','/'),worldRoot:path.relative(root,prepared.worldRoot).replaceAll('\\','/'),backgroundFile:options.authoredBackground?path.relative(root,options.authoredBackground).replaceAll('\\','/'):null,backgroundHash:prepared.background?.sourceHash??null,foundationHash,entryHash:hashContent(entries),oldRecords:prepared.records,changes:prepared.revision.changes,records:{},...(prepared.sourceCheckoutEvidence?{sourceCheckoutEvidence:prepared.sourceCheckoutEvidence}:{}),...(reopening?{reopenAuthorization:record.reopenAuthorization,previousProof:prepared.previousProof??null,previousProofHash:prepared.previousProof?hashContent(prepared.previousProof):null}:{})};
   record.draft=nextDraft;delete record.frozenCandidate;record.fingerprint=fingerprint;record.incremental={authorizationHash:options.authorizationHash,backgroundHash:proof.backgroundHash,originalRecordHash:hashContent(prior),entryHash:hashContent(entry)};proof.records[id]=record.incremental;await write(path.join(root,'incremental-proof.json'),proof);
  }
  record.reviewRecovery={kind:'single-id-L2',revision,foundationHash,sourceEvidence:reopening&&evidence?{...evidence,file:path.relative(root,evidence.file).replaceAll('\\','/'),relativeTo:'root'}:evidence,requestHash:hashContent(request),request:structuredClone(request),compactRequest:!!options.compactRequest,startedAt:new Date().toISOString(),prior,status:'started'};
  await write(file,record);
  try{
   const response=await budget.request(request,`content-${cardId}-${id}-manual-review`,reservations.length?{reservationId:reservations[0]}:{});
   if(reopening){const row=budget.ledger.requests[reservations[0]];record.responseEvidence??=[];record.responseEvidence.push({phase:'review',requestId:reservations[0],...row.responseEvidence});}
   record.reviewRecovery.response=response;
   if(response.measurement){record.measurements??=[];record.measurements.push(response.measurement);}
   const review=parseModelJSON(response);checkReview(review);const issues=reopening||options.controlledRevision||context.authoredBackground?checkIncrementalReview(review,entry,context):review.contradictions;record.review=review;
   record.errors=[...check.errors,...issues.filter(r=>r.severity==='hard')];record.warnings=[...check.warnings,...issues.filter(r=>r.severity!=='hard')];
   record.status=record.errors.length?'manual':'passed';record.feedback=record.errors.length?record.errors:null;
   record.reviewRecovery.status=record.status==='passed'?'passed-L1-L2':'failed';
  }catch(error){record.reviewRecovery.status='failed';record.reviewRecovery.error=error.message;record.status='manual';record.errors=[error.message];record.feedback=record.errors;}
  if(reopening)await budget.finishReopenReview(id,record.reopenAuthorization.attemptFingerprint,record.reviewRecovery.status);
  record.reviewRecovery.finishedAt=new Date().toISOString();await write(file,record);
  await rebindBatch(root,state,record,budget.ledger,foundationHash);
  return{id,status:record.status,review:record.review,error:record.reviewRecovery.error,budgetBefore:before,budgetAfter:budget.ledger,l4Required:true};
 }finally{if(reservations.length)await budget.releaseRound(reservations);await budget.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const result=await runDepthReview();console.log(result.help??JSON.stringify(result));if(result.status==='manual')process.exitCode=1;}
// Candidate L4 still uses the existing batch approval. This is the additional
// read receipt for independent author sources and the revised leaf coverage.
export async function recordDepthIncrementalL4(options,{prepare=prepareDepth}={}){
 const prepared=await (options.controlledRevision&&prepare===prepareDepth?prepareDepthRevision:prepare)(options),{entries,world}=prepared;
 const notes=await read(options.l4Notes),rows=[];
 for(const entry of entries){
  const context=prepared.contexts?.get(entry.id)??contextFor(entry,world);
  if(!context.authoredBackground&&!context.controlledRevision)continue;
  const record=await read(path.join(options.root,entry.id+'.json')),note=notes.candidates?.find(n=>n.id===entry.id);
  assert.equal(record.status,'passed','L4存在未通过条目');assert.equal(record.fingerprint,hashContent({entry,context,revision:prepared.config.revision}),'L4候选出处已改变');
  assert.ok(!checkIncrementalReview(record.review,entry,context).some(c=>c.severity==='hard'),'L4存在出处硬错');
  assert.equal(note?.draftHash,hashContent(record.draft),'新L4 draft hash不符');assert.equal(note?.reviewHash,hashContent(record.review),'新L4 review hash不符');assert.equal(note?.entryHash,hashContent(entry),'新L4 entry hash不符');
  assert.ok(typeof note.note==='string'&&note.note.trim(),'缺新L4逐叶阅读');assert.deepEqual([...(note.reviewedPaths??[])].sort(),entry.patches.map(p=>p.path).sort(),'新L4漏审修订叶子');rows.push(note);
 }
 const backgrounds=depthBackgroundSources(entries),sourceHashes=[...new Set(backgrounds.map(b=>b.sourceHash))].sort(),sourceHash=sourceHashes.length===1?sourceHashes[0]:null;
 assert.deepEqual((notes.backgrounds??[]).map(n=>JSON.stringify([n.eventId,n.sourceHash])).sort(),backgrounds.map(b=>JSON.stringify([b.event.id,b.sourceHash])).sort(),'出处L4缺审、重复或多余来源');
 for(const {event,sourceHash} of backgrounds){const note=notes.backgrounds.find(n=>n.eventId===event.id&&n.sourceHash===sourceHash);assert.equal(note?.sourceHash,sourceHash,'缺独立出处L4或hash已过期');assert.equal(note?.eventHash,hashContent(event),'出处L4事件hash不符');assert.ok(typeof note.note==='string'&&note.note.trim(),'出处L4缺阅读');assert.deepEqual([...(note.reviewedRiskPaths??[])].sort(),event.risks.map(r=>`${r.id}.${r.field}`).sort(),'出处L4漏审秘密风险');}
 const proof={kind:'incremental-depth-L4',authorizationHash:options.authorizationHash??null,sourceHash,...(sourceHashes.length>1?{sourceHashes}:{}),candidates:rows,backgrounds:notes.backgrounds??[]};
 await write(path.join(options.root,'incremental-l4.json'),proof);return{modelCalls:0,candidates:rows.map(r=>r.id),sources:backgrounds.map(b=>b.event.id)};
}
