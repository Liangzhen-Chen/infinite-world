import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const near=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-10;
const amount=x=>Number.isFinite(x)&&x>=0;
async function save(file,value){const temp=`${file}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(value,null,2)+'\n');await fs.rename(temp,file);}
export function migrateDepthBudget(ledger,card,allocation){
 const out=structuredClone(ledger);
 if(!/^[A-Z][A-Z0-9_-]+$/.test(card)||!amount(allocation.incrementLimitYuan)||allocation.incrementLimitYuan===0||allocation.waveLimitYuan!==20)throw Error('缺少稳定 card 或合法 allocation');
 if(allocation.cardId&&allocation.cardId!==card)throw Error('allocation card 不匹配');
 if(out.cards?.[card]){if(!near(out.cards[card].limitYuan,allocation.incrementLimitYuan))throw Error('单卡授权额度已改变');return out;}
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
  out.waveLimitYuan??=Math.min(out.limitYuan??20,20);
  out.cards??={};out.requests??={};out.historicalUnallocatedSpentYuan??=out.spentYuan;
  out.cards[card]={limitYuan:allocation.incrementLimitYuan,spentYuan:0,reservedYuan:0};
 }
 return out;
}
export async function openContentBudget({file,client,cardId,allocation}){
 await fs.mkdir(path.dirname(file),{recursive:true});
 const lock=file+'.pipeline-lock';
 async function acquire(){try{const handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));await handle.close();}catch(error){if(error.code!=='EEXIST')throw error;const pid=Number(await fs.readFile(lock,'utf8'));if(!Number.isInteger(pid)||pid<=0)throw Error('预算锁无效，需核查');try{process.kill(pid,0);throw Error('预算账正在使用');}catch(e){if(e.code!=='ESRCH')throw e;}await fs.unlink(lock);const handle=await fs.open(lock,'wx');await handle.writeFile(String(process.pid));await handle.close();}}
 await acquire();
 let ledger;
 try{
  try{ledger=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;if(cardId)throw Error('缺少共享历史预算账，拒绝初始化');ledger={spentYuan:client.spent??0,reservedYuan:client.reserved??0,limitYuan:client.budgetYuan};}
  if(!amount(ledger.spentYuan)||!amount(ledger.reservedYuan??0)||!amount(ledger.waveLimitYuan??ledger.limitYuan??client.budgetYuan))throw Error('预算金额无效');
  ledger.reservedYuan??=0;
  if(cardId)ledger=migrateDepthBudget(ledger,cardId,allocation);
  else if(ledger.cards)throw Error('分卡预算须提供 cardId，不可从旧接口绕过');
  if(cardId&&(!amount(ledger.waveLimitYuan)||ledger.waveLimitYuan>20))throw Error('共享波次额度无效或超过20元');
  const cards=Object.values(ledger.cards??{});
  if(cards.some(c=>!amount(c.spentYuan)||!amount(c.reservedYuan)||!amount(c.limitYuan))||cards.reduce((n,c)=>n+c.spentYuan,0)>ledger.spentYuan+1e-10||cards.reduce((n,c)=>n+c.reservedYuan,0)>ledger.reservedYuan+1e-10)throw Error('分卡与共享账金额不一致，拒绝调用');
  ledger.requests??={};
  await save(file,ledger);
 }catch(e){await fs.unlink(lock);throw e;}
 function sync(){client.spent=ledger.spentYuan;client.reserved=ledger.reservedYuan;client.budgetYuan=ledger.waveLimitYuan??ledger.limitYuan??client.budgetYuan;}
 sync();let queue=Promise.resolve();
 function request(body,label){const pending=queue.then(async()=>{
  const encodedRequest={model:'deepseek-flash',max_tokens:1800,stream:false,thinking:{type:'disabled'},...body};
  if(encodedRequest.messages)encodedRequest.messages=encodedRequest.messages.map(m=>m.role==='assistant'&&m.content===undefined?{...m,content:null}:m);
  const ceiling=typeof client.estimateCostYuan==='function'?client.estimateCostYuan(body):client.rates?(Buffer.byteLength(JSON.stringify(encodedRequest))*client.rates.miss+encodedRequest.max_tokens*client.rates.output)/1e6:cardId?NaN:0;
  if(!amount(ceiling))throw Error('缺少可验证的请求费用预留');
  const card=cardId&&ledger.cards[cardId],limit=ledger.waveLimitYuan??ledger.limitYuan??client.budgetYuan;
  if(ledger.spentYuan+ledger.reservedYuan+ceiling>limit+1e-12||card&&card.spentYuan+card.reservedYuan+ceiling>card.limitYuan+1e-12)throw Error('共享或单卡费用上限，已停止');
  const id=randomUUID(),priorSpent=client.spent;
  ledger.requests[id]={card:cardId??null,label,reservedYuan:ceiling,status:'reserved'};ledger.reservedYuan+=ceiling;if(card)card.reservedYuan+=ceiling;
  await save(file,ledger);
  // Persist before generate. A killed process leaves both reservations intact.
  try{
   const response=await client.generate(body,label),cost=response.measurement?.costUpperYuan??client.spent-priorSpent;
   if(!amount(cost)||cost>ceiling+1e-12&&(cardId||client.rates))throw Error('最终用量超出预留或无法核实');
   ledger.spentYuan+=cost;ledger.reservedYuan-=ceiling;if(card){card.spentYuan+=cost;card.reservedYuan-=ceiling;}
   ledger.requests[id]={...ledger.requests[id],status:'settled',costUpperYuan:cost,measurement:response.measurement??null};await save(file,ledger);sync();return response;
  }catch(e){ledger.requests[id].status='unknown';ledger.requests[id].error=e.message;await save(file,ledger);sync();throw e;}
 });queue=pending.catch(()=>{});return pending;}
 function claimProtocolRecovery(id,fingerprint){const pending=queue.then(async()=>{const owner=cardId?ledger.cards[cardId]:ledger;owner.protocolRecoveries??={};if(owner.protocolRecoveries[id])return false;owner.protocolRecoveries[id]={fingerprint,claimedAt:new Date().toISOString()};await save(file,ledger);return true;});queue=pending.catch(()=>{});return pending;}
 return{request,get ledger(){return structuredClone(ledger);},claimProtocolRecovery,close:async()=>{await queue;await fs.unlink(lock);}};
}
