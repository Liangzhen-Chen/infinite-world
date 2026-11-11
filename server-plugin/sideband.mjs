import fs from 'node:fs/promises';
import path from 'node:path';
import {digest} from './storage.mjs';

// Sideband record (AI-04 §6.2, AI-05 §3): every model call is logged once as
// <sidebandRoot>/<campaign>/sideband/<turn>-<seq>.json, outside the world
// document. It is written only when the store has an explicit sidebandRoot.
// Rule state never reads it back, and a failed write never changes the result
// of the call it records. requestHash is never a seed input (AI-04 §6.1).
export const SIDEBAND_STATUSES=Object.freeze(['ok','failed','timeout']);
export const sidebandDirectory=(store,campaignId)=>path.join(store.sidebandRoot,path.basename(store.directory(campaignId)),'sideband');

let failures=0;
// Number of sideband writes that failed in this process (a readable counter).
export const sidebandFailureCount=()=>failures;

// Appends one call row as its own file; the exclusive create makes the
// sequence safe across concurrent calls and processes. No-op without sidebandRoot.
export async function recordSideband(store,campaignId,turn,call){
 if(!store?.sidebandRoot)return null;
 if(!Number.isSafeInteger(turn)||turn<0)throw Error('旁路记录需要有效回合序号');
 if(!/^[a-f0-9]{64}$/.test(call?.requestHash??'')||!(call.model===null||typeof call.model==='string'&&call.model)||!SIDEBAND_STATUSES.includes(call.status))throw Error('旁路记录缺少 requestHash、model 或有效 status');
 const directory=sidebandDirectory(store,campaignId);
 await fs.mkdir(directory,{recursive:true});
 for(let seq=0;;seq++){
  const file=path.join(directory,`${turn}-${seq}.json`);
  let handle;
  try{handle=await fs.open(file,'wx');}catch(error){if(error.code==='EEXIST')continue;throw error;}
  try{await handle.writeFile(JSON.stringify({turn,seq,...call}));await handle.sync();}finally{await handle.close();}
  return file;
 }
}

const scrub=text=>String(text).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[凭据已屏蔽]').slice(0,1200);
const timedOut=error=>/timeout|timed out|AbortError|ETIMEDOUT/i.test(`${error?.name??''} ${error?.code??''} ${error?.message??''}`);

// Wraps any {generate(body,label)} client: each call appends exactly one row,
// whether it returns or throws; the result or original error passes through
// unchanged. A write failure is counted and warned once, never thrown. Without
// a configured sidebandRoot the client is returned as is.
export function sidebandClient(client,{store,campaignId,turn,role}){
 if(!store?.sidebandRoot)return client;
 return {
  generate:async(body,label)=>{
   const started=Date.now(),requestHash=digest(body);
   let response,failure;
   try{response=await client.generate(body,label);}catch(error){failure=error;}
   const model=body?.model??response?.model??response?.measurement?.model??client.model??client.config?.model??null,cost=response?.measurement?.costUpperYuan;
   try{
    await recordSideband(store,campaignId,turn,{role,label,requestHash,model,status:failure?(timedOut(failure)?'timeout':'failed'):'ok',latencyMs:Date.now()-started,
     costYuan:Number.isFinite(cost)?cost:null,...(failure?{error:scrub(failure.message)}:{response})});
   }catch(error){
    if(failures++===0)console.warn(`旁路记录写入失败（之后只计数，见 sidebandFailureCount）：${scrub(error?.message)}`);
   }
   if(failure)throw failure;
   return response;
  }
 };
}
