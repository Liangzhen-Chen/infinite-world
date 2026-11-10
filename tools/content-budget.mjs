import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-10;
const amount=x=>Number.isFinite(x)&&x>=0;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function save(file,value){const temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,file);}
export function migrateDepthBudget(ledger,card,allocation){
 const out=structuredClone(ledger);
 if(allocation.maxRequests!==undefined&&(!Number.isSafeInteger(allocation.maxRequests)||allocation.maxRequests<1))throw Error('调用额度须为正整数');
 if(!/^[A-Z][A-Z0-9_-]+$/.test(card)||!amount(allocation.incrementLimitYuan)||allocation.incrementLimitYuan===0||![20,25].includes(allocation.waveLimitYuan))throw Error('缺少稳定 card 或合法 allocation');
 if(allocation.cardId&&allocation.cardId!==card)throw Error('allocation card 不匹配');
 if(out.cards?.[card]){if(!near(out.cards[card].limitYuan,allocation.incrementLimitYuan)||out.cards[card].maxRequests!==allocation.maxRequests)throw Error('单卡授权额度已改变');return out;}
 // This is the only verified legacy ownership. Mixed historical spending is
 // retained separately; it never becomes a fresh card allowance.
 const legacy=!out.cards&&near(out.limitYuan,2.94801504);
 if(legacy){
  if(card!=='T06'||!near(allocation.startingSpentYuan,.94801504)||!near(allocation.startingReservedYuan,0)||!near(allocation.incrementLimitYuan,2)||!near(allocation.limitYuan,2.94801504)||!near(out.spentYuan,1.10760808)||!near(out.reservedYuan,.083736))throw Error('无法验证旧低限额及费用归属，拒绝提高');
  out.waveLimitYuan=20;out.limitYuan=20;out.cards={T06:{limitYuan:2,spentYuan:.15959304,reservedYuan:.083736}};
  out.requests={legacyT06:{card:'T06',reservedYuan:.083736,status:'unknown',source:'interrupted legacy request'}};
  out.historicalUnallocatedSpentYuan=out.spentYuan-.15959304;
  out.migration={kind:'verified-T06',before:structuredClone(ledger),allocation:structuredClone(allocation)};
 }else{
  if(!out.cards&&((out.reservedYuan??0)>0||allocation.startingReservedYuan>0||!near(out.spentYuan,allocation.startingSpentYuan)))throw Error('未登记单卡历史费用或预留，拒绝重新领取额度');
  out.waveLimitYuan??=Math.min(out.limitYuan??25,allocation.waveLimitYuan);
  out.cards??={};out.requests??={};out.historicalUnallocatedSpentYuan??=out.spentYuan;
  out.cards[card]={limitYuan:allocation.incrementLimitYuan,spentYuan:0,reservedYuan:0,...(allocation.maxRequests===undefined?{}:{maxRequests:allocation.maxRequests})};
 }
 return out;
}
// 单次请求的预留上界（账本发请求前预留所用的同一口径）；无法核算返回 NaN。
export function reserveCeilingYuan(client,body){
  const encodedRequest={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body};
  if(encodedRequest.messages)encodedRequest.messages=encodedRequest.messages.map(m=>m.role==='assistant'&&m.content===undefined?{...m,content:null}:m);
  return client.rates?(Buffer.byteLength(JSON.stringify(encodedRequest))*client.rates.miss+encodedRequest.max_tokens*client.rates.output)/1e6:typeof client.estimateCostYuan==='function'?client.estimateCostYuan(body):NaN;
}
export const reopenAuthorizationId='user-reopen-20261012-01';
const reopenLimits={T06:[2,2.5],T07:[3,4.5],T08:[3,4.5],T09:[3,4.5]};
const amendedCardLimits={T07:7,T08:6.5,T09:4.5};
export function reopenAuthorizationVersion(manifest,expectedHash){
 const {sourceAuthorizations,...budgetManifest}=manifest;
 const {amendments,...original}=budgetManifest;
 if(sourceAuthorizations!==undefined){
  if(!Array.isArray(sourceAuthorizations)||sourceAuthorizations.some(a=>!['T08','T09'].includes(a.cardId)||a.date!=='2026-10-13'||a.parentManifestHash!==hash(original)||typeof a.file!=='string'||!a.file.endsWith('.json')||typeof a.hash!=='string'||!/^[a-f0-9]{64}$/.test(a.hash)||typeof a.source!=='string'||!a.source.trim()))throw Error('追加来源授权缺原hash、日期或出处');
 }
 if(amendments!==undefined){
  if(!Array.isArray(amendments)||amendments.length!==1)throw Error('授权修订须保留唯一2026-10-13凭证');
  const amendment=amendments[0],keys=['id','date','previousManifestHash','waveLimitYuan','maxAttempts','cardLimits','source'];
  if(Object.keys(amendment).sort().join('|')!==keys.sort().join('|')||amendment.id!=='user-reopen-20261013-01'||amendment.date!=='2026-10-13'||amendment.previousManifestHash!==hash(original)||amendment.waveLimitYuan!==25||amendment.maxAttempts!==6||typeof amendment.source!=='string'||!amendment.source.trim())throw Error('授权修订父hash、额度或次数不符');
  if(Object.keys(amendment.cardLimits??{}).sort().join('|')!==Object.keys(amendedCardLimits).sort().join('|')||Object.entries(amendedCardLimits).some(([id,limit])=>!near(amendment.cardLimits[id],limit)))throw Error('授权修订单卡额度不符');
 }
 if(expectedHash===undefined||expectedHash===hash(original))return original;
 if(expectedHash===hash(budgetManifest))return budgetManifest;
 if(expectedHash===hash(manifest))return manifest;
 // Source authorizations are appended after paid reviews. Earlier receipts
 // retain their exact prefix hash; every surviving item was checked above.
 for(let length=1;length<(sourceAuthorizations?.length??0);length++){
  const prior={...budgetManifest,sourceAuthorizations:sourceAuthorizations.slice(0,length)};
  if(expectedHash===hash(prior))return prior;
 }
 throw Error('授权清单已冻结，不得换nonce或修改再领');
}
export function validateReopenAuthorization(manifest,cardId){
 if(!manifest||typeof manifest!=='object')throw Error('重开授权标识或总上限不符');
 const original=reopenAuthorizationVersion(manifest);
 if(original.kind!=='w1-reopen-authorization'||original.id!==reopenAuthorizationId||original.waveLimitYuan!==20||original.goalLimitYuan!==100)throw Error('重开授权标识或总上限不符');
 const grant=original.cards?.[cardId],limits=reopenLimits[cardId];
 if(!grant||!limits||!near(grant.oldLimitYuan,limits[0])||!near(grant.newLimitYuan,limits[1])||!near(grant.incrementYuan,limits[1]-limits[0])||!amount(grant.spentYuan)||!amount(grant.reservedYuan)||grant.pilotLimitYuan!==.5||grant.maxAttempts!==2||!grant.allowed?.length)throw Error('重开授权单卡增额或边界不符');
 if(new Set(grant.allowed.map(r=>r.id)).size!==grant.allowed.length||grant.allowed.some(r=>!/^npc_[a-z0-9_]+$/i.test(r.id)||!Array.isArray(r.paths)))throw Error('重开授权ID/叶路径无效');
 return grant;
}
export function reopenBudgetTerms(manifest,cardId){
 const grant=validateReopenAuthorization(manifest,cardId),amendment=manifest.amendments?.[0];
 return {limitYuan:amendment?.cardLimits[cardId]??grant.newLimitYuan,maxAttempts:amendment?.maxAttempts??grant.maxAttempts,waveLimitYuan:amendment?.waveLimitYuan??manifest.waveLimitYuan};
}
export function reopenAllowsId(manifest,cardId,id){
 const grant=validateReopenAuthorization(manifest,cardId);
 return grant.allowed.some(r=>r.id===id)||cardId==='T08'&&id==='npc_lq_shaluo'&&manifest.sourceAuthorizations?.some(a=>a.cardId==='T08')===true;
}
export function grantDepthBudget(ledger,cardId,allocation,manifest){
 reopenAuthorizationVersion(manifest);
 const {sourceAuthorizations,...budgetManifest}=manifest;manifest=budgetManifest;
 const grant=validateReopenAuthorization(manifest,cardId),original=reopenAuthorizationVersion(manifest),amendment=manifest.amendments?.[0],out=structuredClone(ledger),prior=out.reopenAuthorizations?.[manifest.id];
 if(prior&&prior.manifestHash!==hash(original)||prior?.amendment&&prior.amendment.manifestHash!==hash(manifest))throw Error('授权清单已冻结，不得换nonce或修改再领');
 if(!near(out.waveLimitYuan??out.limitYuan,prior?.amendment?25:20)||out.goalLimitYuan&&out.goalLimitYuan!==100)throw Error('原波次/goal上限不符');
 if(!near(allocation.incrementLimitYuan,grant.oldLimitYuan)||allocation.cardId&&allocation.cardId!==cardId||allocation.waveLimitYuan!==20)throw Error('原allocation已改变');
 const applied=prior?.cards?.[cardId];
 if(applied){if(!near(out.cards?.[cardId]?.limitYuan,prior.amendment?.cardLimits[cardId]??grant.newLimitYuan)||applied.allocationHash!==hash(allocation))throw Error('增额收据或原allocation已改变');}
 if(!applied){
 const card=out.cards?.[cardId];
 if(card){if(!near(card.limitYuan,grant.oldLimitYuan)||!near(card.spentYuan,grant.spentYuan)||!near(card.reservedYuan,grant.reservedYuan))throw Error('原单卡费用/额度快照不符');}
 else {if(cardId!=='T09'||grant.spentYuan!==0||grant.reservedYuan!==0||!out.cards)throw Error('缺少原单卡历史，拒绝重领');out.cards[cardId]={limitYuan:grant.oldLimitYuan,spentYuan:0,reservedYuan:0};}
 if(!prior&&(!near(out.spentYuan,manifest.budgetSnapshot.spentYuan)||!near(out.reservedYuan,manifest.budgetSnapshot.reservedYuan)))throw Error('共享历史费用/未知预留快照不符');
 out.reopenAuthorizations??={};out.reopenAuthorizations[manifest.id]??={manifestHash:hash(original),manifest:structuredClone(original),before:structuredClone(ledger),cards:{}};
 out.reopenAuthorizations[manifest.id].cards[cardId]={oldLimitYuan:grant.oldLimitYuan,newLimitYuan:grant.newLimitYuan,incrementYuan:grant.incrementYuan,allocation:structuredClone(allocation),allocationHash:hash(allocation),before:structuredClone(out.cards[cardId]),grantedAt:new Date().toISOString(),attempts:{}};
 out.cards[cardId].limitYuan=grant.newLimitYuan;
 }
 const round=out.reopenAuthorizations[manifest.id];
 if(amendment&&!round.amendment){
  round.amendment={...structuredClone(amendment),manifestHash:hash(manifest),beforeWaveLimitYuan:out.waveLimitYuan??out.limitYuan,beforeCardLimits:Object.fromEntries(Object.entries(round.cards).map(([id])=>[id,out.cards[id].limitYuan])),appliedAt:new Date().toISOString()};
  out.waveLimitYuan=25;out.limitYuan=25;
  for(const [id,limit] of Object.entries(amendment.cardLimits))if(round.cards[id])out.cards[id].limitYuan=limit;
 }else if(amendment)out.cards[cardId].limitYuan=amendment.cardLimits[cardId]??grant.newLimitYuan;
 return out;
}
export async function openContentBudget({file,client,cardId,allocation,reopenAuthorization,reopenId,continueReopen=false}){
 await fs.mkdir(path.dirname(file),{recursive:true});
 const lock=file+'.pipeline-lock';
 async function acquire(){try{const handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));await handle.close();}catch(error){if(error.code!=='EEXIST')throw error;const pid=Number(await fs.readFile(lock,'utf8'));if(!Number.isInteger(pid)||pid<=0)throw Error('预算锁无效，需核查');try{process.kill(pid,0);throw Error('预算账正在使用');}catch(e){if(e.code!=='ESRCH')throw e;}await fs.unlink(lock);const handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));await handle.close();}}
 await acquire();
 let ledger;
 try{
  try{ledger=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;if(cardId)throw Error('缺少共享历史预算账，拒绝初始化');ledger={spentYuan:client.spent??0,reservedYuan:client.reserved??0,limitYuan:client.budgetYuan};}
  if(!amount(ledger.spentYuan)||!amount(ledger.reservedYuan??0)||!amount(ledger.waveLimitYuan??ledger.limitYuan??client.budgetYuan))throw Error('预算金额无效');
  ledger.reservedYuan??=0;
  if(cardId)ledger=reopenAuthorization?grantDepthBudget(ledger,cardId,allocation,reopenAuthorization):migrateDepthBudget(ledger,cardId,allocation);
  else if(ledger.cards)throw Error('分卡预算须提供 cardId，不可从旧接口绕过');
  if(cardId&&(!amount(ledger.waveLimitYuan)||ledger.waveLimitYuan>25))throw Error('共享波次额度无效或超过25元');
  const cards=Object.values(ledger.cards??{});
  if(cards.some(c=>!amount(c.spentYuan)||!amount(c.reservedYuan)||!amount(c.limitYuan))||cards.reduce((n,c)=>n+c.spentYuan,0)>ledger.spentYuan+1e-10||cards.reduce((n,c)=>n+c.reservedYuan,0)>ledger.reservedYuan+1e-10)throw Error('分卡与共享账金额不一致，拒绝调用');
  ledger.requests??={};
  if(reopenAuthorization){
   const grant=validateReopenAuthorization(reopenAuthorization,cardId),round=ledger.reopenAuthorizations[reopenAuthorization.id].cards[cardId];
   if(!reopenAllowsId(reopenAuthorization,cardId,reopenId))throw Error('重开ID未授权');
   if(continueReopen&&!round.pilotPassed)throw Error('首ID完整协议未通过，不得继续');
   if(!continueReopen&&round.pilotId&&round.pilotId!==reopenId)throw Error('先完成原首ID试运行');
  }
  // Failed preflight never changes the original ledger bytes.
  if(!reopenAuthorization)await save(file,ledger);
 }catch(e){await fs.unlink(lock);throw e;}
 function sync(){client.spent=ledger.spentYuan;client.reserved=ledger.reservedYuan;client.budgetYuan=ledger.waveLimitYuan??ledger.limitYuan??client.budgetYuan;}
 sync();let queue=Promise.resolve(),stopped=null;
 const ownedReservations=new Set();
 function enqueue(action){const pending=queue.then(action);queue=pending.catch(()=>{});return pending;}
 function stop(message){stopped??=Object.assign(Error(message),{code:'CONTENT_BUDGET_STOP'});return stopped;}
 function guard(){if(stopped)throw stopped;}
 function estimate(body){
  const ceiling=reserveCeilingYuan(client,body);
  if(!amount(ceiling))throw stop('缺少可验证的请求费用预留，已停止');
  return ceiling;
 }
 function reserveRound(requests){return enqueue(async()=>{
  guard();
  const rows=requests.map(({body,label})=>({card:cardId??null,label,requestHash:hash(body),reservedYuan:estimate(body),status:'reserved',...(reopenAuthorization?{authorizationId:reopenAuthorization.id,reopenId}:{})}));
  const ceiling=rows.reduce((n,r)=>n+r.reservedYuan,0);
  const card=cardId&&ledger.cards[cardId],limit=ledger.waveLimitYuan??ledger.limitYuan??client.budgetYuan;
  if(card?.maxRequests!==undefined&&Object.values(ledger.requests).filter(r=>r.card===cardId&&r.status!=='cancelled-unissued').length+rows.length>card.maxRequests)throw stop('单卡调用次数上限，已停止');
  if(ledger.spentYuan+ledger.reservedYuan+ceiling>limit+1e-12||card&&card.spentYuan+card.reservedYuan+ceiling>card.limitYuan+1e-12)throw stop('共享或单卡费用上限，已停止');
  if(reopenAuthorization&&!continueReopen){const grant=reopenAuthorization.cards[cardId];if(card.spentYuan-grant.spentYuan+card.reservedYuan-grant.reservedYuan+ceiling>.5+1e-12)throw stop('首ID累计新调用及预留超过0.50元，已停止');}
  const ids=rows.map(row=>{const id=randomUUID();ledger.requests[id]=row;ownedReservations.add(id);return id;});
  ledger.reservedYuan+=ceiling;if(card)card.reservedYuan+=ceiling;
  await save(file,ledger);
  sync();return ids;
 });}
 function releaseRound(ids){return enqueue(async()=>{
  for(const id of ids){const row=ledger.requests[id];
   // Only this process's provably unsent reservations can be released.
   if(!ownedReservations.has(id)||row?.status!=='reserved')continue;
   ledger.reservedYuan=Math.max(0,ledger.reservedYuan-row.reservedYuan);if(cardId)ledger.cards[cardId].reservedYuan=Math.max(0,ledger.cards[cardId].reservedYuan-row.reservedYuan);
   row.status='cancelled-unissued';
  }
  await save(file,ledger);sync();
 });}
 // 通用：把一条尚未发送的本进程预留换成另一份请求（同 id、同 label），新估价必须不超过原预留。
 // 只会减少账本总额/单卡的已预留额，因此原预留已通过的次数、总额、单卡、重开额度检查依然成立；发送时 requestHash 相等检查不变。
 function replaceReservation(id,{body,label}){return enqueue(async()=>{
  guard();
  const row=ledger.requests[id];
  if(!ownedReservations.has(id)||row?.status!=='reserved'||row.label!==label)throw stop('待替换的预留不存在或已发送，已停止');
  const next=estimate(body);
  if(next>row.reservedYuan+1e-12)throw stop('真实请求估价超过已预留上界，已停止');
  const card=row.card&&ledger.cards?.[row.card],delta=next-row.reservedYuan;
  row.replacedReservation={requestHash:row.requestHash,reservedYuan:row.reservedYuan};
  row.requestHash=hash(body);row.reservedYuan=next;
  ledger.reservedYuan=Math.max(0,ledger.reservedYuan+delta);if(card)card.reservedYuan=Math.max(0,card.reservedYuan+delta);
  await save(file,ledger);sync();return id;
 });}
 async function request(body,label,{reservationId}={}){
  const id=reservationId??(await reserveRound([{body,label}]))[0];
  return enqueue(async()=>{
  guard();
  const row=ledger.requests[id],ceiling=estimate(body),card=cardId&&ledger.cards[cardId];
  if(!ownedReservations.has(id)||row?.status!=='reserved'||row.label!==label||row.requestHash!==hash(body)||ceiling>row.reservedYuan+1e-12)throw stop('请求不符本轮预留，已停止');
  const priorSpent=client.spent;
  row.status='sent';await save(file,ledger);
  // The transport also reserves its current call; keep the future review held.
  client.reserved=ledger.reservedYuan-row.reservedYuan;
  // Persist before generate. A killed process leaves both reservations intact.
  try{
   const generate=client.generateRaw??client.generate;
   const response=await generate.call(client,body,label),cost=response.measurement?.costUpperYuan??client.spent-priorSpent;
   const responseFile=path.join(path.dirname(file),'budget-responses',`${id}.json`);
   const evidence={requestId:id,card:cardId??null,label,request:body,requestHash:hash(body),response, responseHash:hash(response),usage:response.usage??null,measurement:response.measurement??null,costUpperYuan:cost,savedAt:new Date().toISOString()};
   await fs.mkdir(path.dirname(responseFile),{recursive:true});await save(responseFile,evidence);
   row.responseEvidence={file:path.relative(path.dirname(file),responseFile).replaceAll('\\','/'),requestHash:evidence.requestHash,responseHash:evidence.responseHash};
   if(!amount(cost)||cost>ceiling+1e-12)throw stop('最终用量超出预留或无法核实，已停止');
   ledger.spentYuan+=cost;ledger.reservedYuan=Math.max(0,ledger.reservedYuan-row.reservedYuan);if(card){card.spentYuan+=cost;card.reservedYuan=Math.max(0,card.reservedYuan-row.reservedYuan);}
   Object.assign(row,{status:'settled',costUpperYuan:cost,measurement:response.measurement??null});await save(file,ledger);sync();
   return typeof client.processResponse==='function'?await client.processResponse(response,body):response;
  }catch(e){if(row.status!=='settled')row.status='unknown';row.error=e.message;await save(file,ledger);sync();throw /费用上限/.test(e.message)?stop(e.message):e;}
 });}
 function claimOnce(field,id,fingerprint){const pending=queue.then(async()=>{const owner=cardId?ledger.cards[cardId]:ledger;owner[field]??={};if(owner[field][id])return false;owner[field][id]={fingerprint,claimedAt:new Date().toISOString()};await save(file,ledger);return true;});queue=pending.catch(()=>{});return pending;}
 function claimReopenReview(id,fingerprint){return enqueue(async()=>{
  const grant=validateReopenAuthorization(reopenAuthorization,cardId),round=ledger.reopenAuthorizations[reopenAuthorization.id].cards[cardId];
  if(id!==reopenId||!reopenAllowsId(reopenAuthorization,cardId,id))throw Error('重开ID未授权');
  const attempts=round.attempts[id]??=[];
  if(attempts.some(a=>a.fingerprint===fingerprint)||attempts.length>=reopenBudgetTerms(reopenAuthorization,cardId).maxAttempts)return false;
  round.pilotId??=id;attempts.push({fingerprint,claimedAt:new Date().toISOString(),status:'started'});await save(file,ledger);return true;
 });}
 function finishReopenReview(id,fingerprint,status){return enqueue(async()=>{const round=ledger.reopenAuthorizations[reopenAuthorization.id].cards[cardId],attempt=round.attempts[id]?.find(a=>a.fingerprint===fingerprint);if(!attempt)throw Error('缺重开尝试凭证');attempt.status=status;attempt.finishedAt=new Date().toISOString();if(id===round.pilotId&&status==='passed-L1-L2')round.pilotPassed=true;await save(file,ledger);});}
 return{request,reserveRound,replaceReservation,releaseRound,claimReopenReview,finishReopenReview,registerReopenAuthorization:()=>enqueue(async()=>{if(!reopenAuthorization)throw Error('缺重开授权');await save(file,ledger);}),stop,get stopped(){return stopped;},get ledger(){return structuredClone(ledger);},claimProtocolRecovery:(id,fingerprint)=>claimOnce('protocolRecoveries',id,fingerprint),claimReviewRecovery:(id,fingerprint)=>claimOnce('reviewRecoveries',id,fingerprint),close:async()=>{await queue;await fs.unlink(lock);}};
}
