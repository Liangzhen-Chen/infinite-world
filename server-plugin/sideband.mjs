import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON,digest} from './storage.mjs';

// Sideband record (AI-04 §6.2, AI-05 §3): every model call is logged once in
// <store>/<campaign>/sideband/<turn>.json, outside the world document. Rule
// state never reads it back, so changing model or going offline cannot change
// a settled result. requestHash is never a seed input (AI-04 §6.1).
export const SIDEBAND_STATUSES=Object.freeze(['ok','failed','timeout']);
export const sidebandFile=(store,campaignId,turn)=>{
 if(!Number.isSafeInteger(turn)||turn<0)throw Error('旁路记录需要有效回合序号');
 return path.join(store.directory(campaignId),'sideband',`${turn}.json`);
};

const queues=new Map();
// Appends one call row. Rows of one turn file are serialized in-process.
export function recordSideband(store,campaignId,turn,call){
 const file=sidebandFile(store,campaignId,turn);
 if(!/^[a-f0-9]{64}$/.test(call?.requestHash??'')||typeof call.model!=='string'||!call.model||!SIDEBAND_STATUSES.includes(call.status))throw Error('旁路记录缺少 requestHash、model 或有效 status');
 const task=(queues.get(file)??Promise.resolve()).then(async()=>{
  await fs.mkdir(path.dirname(file),{recursive:true});
  let document;
  try{document=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;document={turn,calls:[]};}
  document.calls.push(call);
  await atomicJSON(file,document);
 });
 const tail=task.catch(()=>{});
 queues.set(file,tail);
 tail.then(()=>{if(queues.get(file)===tail)queues.delete(file);});
 return task;
}

const scrub=text=>String(text).replaceAll(process.env.DEEPSEEK_API_KEY??'__no_key__','[凭据已屏蔽]').slice(0,1200);
const timedOut=error=>/timeout|timed out|AbortError|ETIMEDOUT/i.test(`${error?.name??''} ${error?.code??''} ${error?.message??''}`);

// Wraps any {generate(body,label)} client: each call appends exactly one row,
// whether it returns or throws; the result or error passes through unchanged.
export function sidebandClient(client,{store,campaignId,turn,role}){
 return {
  generate:async(body,label)=>{
   const started=Date.now(),requestHash=digest(body);
   let response,failure;
   try{response=await client.generate(body,label);}catch(error){failure=error;}
   const model=body?.model??response?.model??response?.measurement?.model??client.model??'unknown',cost=response?.measurement?.costUpperYuan;
   await recordSideband(store,campaignId,turn,{role,label,requestHash,model,status:failure?(timedOut(failure)?'timeout':'failed'):'ok',latencyMs:Date.now()-started,
    costYuan:Number.isFinite(cost)?cost:null,...(failure?{error:scrub(failure.message)}:{response})});
   if(failure)throw failure;
   return response;
  }
 };
}
