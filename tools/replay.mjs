import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest} from '../server-plugin/storage.mjs';
import {ruleStateDigest} from '../server-plugin/digest-exclude.mjs';
import {createPlaytestServer,PLAYTEST_SEED} from './playtest-runner.mjs';

// AI-21 录制回放（AI-05 §4.1、§4.3）。夹具目录：
//   manifest.json  绑定（commit、contentHash、model、seed）、create 请求、steps、规则状态哈希、文字哈希
//   sideband/      <turn>-<seq>.json，格式即 server-plugin/sideband.mjs 的写入格式
// 回放以旁路记录替代模型调用：按 requestHash 命中返回记录的响应，未命中即报错，永不回落真实调用。
// 存档不入夹具：同一 create 请求加确定种子可重建初态，initialStateHash 校验重建一致。
// initialStateHash 口径 = ruleStateDigest(初态文档)（排除叙述与显示名字符串，同 AI-05 §4.2），不是全文哈希，
// 所以初态里以后混入的叙述类文字不会误报；种子（document.randomSeed）在文档内，种子不同则哈希必不同。
// 种子绑定：binding.seed 取自重建出的存档文档 randomSeed，与 manifest.seed 比对，不是 manifest 自证。
// 轨迹只对齐 tools/ptai/driver.mjs trace.jsonl 的最小子集：行类型 header/turn/end，ts；
//   header: runId、campaignId、worldSeed(=document.randomSeed)、initialStateHash(口径与 ptai 不同，见上)、gitHead、model；
//   turn: turn、calls[{tool,args,result,isError}]（另有 endpoint、eventId）；end: reason、turns。
// 缺 header 的 initialReference/driverHash/toolsHash/limits/prices，缺 turn 的 usage/usd/text/minute，下游按 ptai 工具读须容忍缺字段。

const READ_ONLY_TOOLS=new Set(['world_read','world_search','world_catalog','world_actions']);
// commit is recorded in the manifest as provenance only and never makes a fixture stale: otherwise every
// commit would skip the text assertions, which would make them useless (coordinator ruling 2026-11-11,
// amends AI-05 §4.3 which lists commit among the binding fields).
export const BINDING_FIELDS=Object.freeze(['contentHash','model','seed']);

export function gitCommit(){
 try{return execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),encoding:'utf8'}).trim();}catch{return null;}
}

// Every sideband row of a directory, ordered by turn then sequence.
export async function readSideband(directory){
 const names=(await fs.readdir(directory)).filter(name=>/^\d+-\d+\.json$/.test(name));
 if(!names.length)throw Error(`E-REPLAY-EMPTY 旁路目录没有记录：${directory}`);
 const rows=await Promise.all(names.map(async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'))));
 for(const row of rows)if(!/^[a-f0-9]{64}$/.test(row?.requestHash??'')||!Number.isSafeInteger(row.turn)||!Number.isSafeInteger(row.seq))throw Error('E-REPLAY-ROW 旁路记录缺少 requestHash、turn 或 seq');
 return rows.sort((a,b)=>a.turn-b.turn||a.seq-b.seq);
}

// {generate(body,label)} that answers from recorded rows. Each row serves one call, in recorded order
// among rows with the same requestHash. A miss is thrown and also kept in client.misses, because the
// callers (consistency, planning) may degrade on a thrown error; replayFixture checks client.misses.
export function replayClient(rows){
 const queues=new Map();
 for(const row of rows){if(!queues.has(row.requestHash))queues.set(row.requestHash,[]);queues.get(row.requestHash).push(row);}
 const client={calls:0,hits:0,misses:[],
  async generate(body,label){
   client.calls++;
   const requestHash=digest(body),row=queues.get(requestHash)?.shift();
   if(!row){client.misses.push({label,requestHash});throw Error(`E-REPLAY-MISS 旁路记录中没有这次请求（label=${label}，requestHash=${requestHash}）`);}
   client.hits++;
   if(row.status!=='ok')throw Object.assign(Error(row.error??`录制时调用${row.status}`),row.status==='timeout'?{name:'TimeoutError'}:{});
   return structuredClone(row.response);
  }};
 client.unused=()=>[...queues.values()].flat().map(row=>`${row.turn}-${row.seq}:${row.label}`);
 return client;
}

// Which binding fields differ between a fixture and the current code/world/model/seed (AI-05 §4.3).
export const staleReasons=(manifest,current)=>BINDING_FIELDS.filter(key=>manifest[key]!==current[key]);

// Turns the write-world tool calls of a ptai trace into replay steps (read-only tools are skipped).
export function stepsFromTrace(rows){
 const steps=[];
 for(const row of rows.filter(r=>r.type==='turn'))for(const [i,call] of (row.calls??[]).entries()){
  if(READ_ONLY_TOOLS.has(call.tool))continue;
  const eventId=call.eventId??`replay-${row.turn}-${i+1}`;
  steps.push({endpoint:'execute',body:{tool:call.tool,args:call.args,eventId,anchor:eventId}});
 }
 return steps;
}

// Runs steps through the HTTP api. campaignId, expectedSequence and the review token are filled in here,
// the way tools/ptai/driver.mjs fills them; a step carries only what the player or host chose.
async function runSession(api,{create,steps}){
 const created=await api('create',create),campaignId=created.reference.campaignId;
 const first=(await api('read',{campaignId})).document;
 const rows=[{type:'header',campaignId,worldSeed:first.randomSeed??null,initialStateHash:ruleStateDigest(first),contentHash:first.worldHash??null}];
 let token=null;
 const texts=[];
 for(const [n,step] of steps.entries()){
  const sequence=(await api('read',{campaignId})).reference.sequence;
  const body={...step.body,campaignId,expectedSequence:sequence,...(step.endpoint.startsWith('review/')&&step.endpoint!=='review/begin'&&token?{token}:{})};
  const output=await api(step.endpoint,body);
  if(step.endpoint==='review/begin')token=output.token;
  if(step.endpoint==='review/reply')texts.push(output.text);
  rows.push({type:'turn',turn:n+1,endpoint:step.endpoint,calls:step.endpoint==='execute'?[{tool:step.body.tool,args:step.body.args,eventId:step.body.eventId,result:output.result,isError:false}]:[]});
 }
 const document=(await api('read',{campaignId})).document;
 rows.push({type:'end',reason:'replayed',turns:steps.length});
 return {campaignId,document,rows,texts,seed:first.randomSeed??null,initialStateHash:rows[0].initialStateHash,contentHash:rows[0].contentHash};
}

// Records a fixture from a real call path: client is whatever answers the model calls (a live client in
// real play, an injectable one in tests); the sideband the server writes becomes the fixture.
export async function recordFixture({dir,client,steps,create={},seed=PLAYTEST_SEED,model,world,commit=gitCommit()}){
 if(typeof model!=='string'||!model)throw Error('录制夹具需要模型 id');
 // 录制期间的存档与旁路只放在 dir/.staging（结束即删），整个录制只写到 dir 之内。
 const staging=path.join(dir,'.staging'),root=path.join(staging,'sideband');
 await fs.rm(staging,{recursive:true,force:true});await fs.mkdir(root,{recursive:true});
 let session;
 try{
  const server=await createPlaytestServer({seed,world,aiProfile:'T2',consistencyClient:client,sidebandRoot:root,directory:path.join(staging,'store')});
  try{session=await runSession(server.api,{create,steps});}finally{await server.close();}
  const [campaignDir]=await fs.readdir(root);
  if(!campaignDir)throw Error('E-REPLAY-EMPTY 录制没有产生旁路记录');
  await fs.cp(path.join(root,campaignDir,'sideband'),path.join(dir,'sideband'),{recursive:true});
 }finally{await fs.rm(staging,{recursive:true,force:true});}
 const manifest={version:1,commit,campaignId:session.campaignId,contentHash:session.contentHash,model,seed:session.seed,create,steps,initialStateHash:session.initialStateHash,
  ruleStateDigest:ruleStateDigest(session.document),textDigest:digest(session.texts)};
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,1));
 session.rows[0]={...session.rows[0],runId:path.basename(dir),gitHead:commit,model,tier:'T2'};
 await fs.writeFile(path.join(dir,'trace.jsonl'),session.rows.map(row=>JSON.stringify({ts:new Date().toISOString(),...row})).join('\n')+'\n');
 return manifest;
}

// Replays a fixture with no real model call. Tier T2 runs every step with the recorded responses; T0 runs
// only the world steps (no review/*) with no model client. A changed binding field marks the text assertion
// stale (skipped); settlement (the replay completing, rule-state hash) is always computed and reported.
// current: overrides for the present commit/model (default: this checkout and the fixture's own model).
export async function replayFixture(dir,{tier='T2',current={},world,traceFile=null}={}){
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
 if(manifest.version!==1)throw Error('E-REPLAY-MANIFEST 夹具版本不受支持');
 if(!['T0','T2'].includes(tier))throw Error('E-REPLAY-TIER 回放档位只有 T0 与 T2');
 const client=tier==='T2'?replayClient(await readSideband(path.join(dir,'sideband'))):null;
 const steps=tier==='T2'?manifest.steps:manifest.steps.filter(step=>!step.endpoint.startsWith('review/'));
 const server=await createPlaytestServer({seed:manifest.seed,world,aiProfile:tier,consistencyClient:client,consistencyEnabled:tier==='T2'});
 let session;
 try{session=await runSession(server.api,{create:manifest.create,steps});}finally{await server.close();}
 if(client?.misses.length)throw Error(`E-REPLAY-MISS 回放有 ${client.misses.length} 次请求没有旁路记录：${client.misses.map(m=>m.label).join('、')}`);
 if(client?.unused().length)throw Error(`E-REPLAY-UNUSED 录制的旁路记录有 ${client.unused().length} 条没有被回放用到（回放步骤与录制不一致）：${client.unused().join('、')}`);
 // contentHash 与 seed 取自重建出的存档；model 离线无法观测，只有调用方传入 current.model 才可能 stale。
 const binding={contentHash:session.contentHash,model:manifest.model,seed:session.seed,...current};
 const stale=staleReasons(manifest,binding),hash=ruleStateDigest(session.document);
 const result={tier,stale,hits:client?.hits??0,modelCalls:client?.calls??0,ruleStateDigest:hash,
  settlement:{matches:session.initialStateHash===manifest.initialStateHash&&hash===manifest.ruleStateDigest},
  text:tier==='T2'&&!stale.length?{skipped:false,matches:digest(session.texts)===manifest.textDigest}:{skipped:true,reason:tier==='T2'?'stale':'T0 无叙述'}};
 if(traceFile){
  session.rows[0]={...session.rows[0],runId:path.basename(dir),gitHead:gitCommit(),model:manifest.model,tier};
  await fs.writeFile(traceFile,session.rows.map(row=>JSON.stringify({ts:new Date().toISOString(),...row})).join('\n')+'\n');
 }
 return result;
}

// 命令行：node tools/replay.mjs <夹具目录> [--tier T0|T2] [--model <id>] [--trace <文件>]
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [dir,...rest]=process.argv.slice(2),opt={};
 for(let i=0;i<rest.length;i+=2){if(!rest[i]?.startsWith('--')||i+1>=rest.length)throw Error(`参数错误: ${rest[i]}`);opt[rest[i].slice(2)]=rest[i+1];}
 if(!dir)throw Error('用法: node tools/replay.mjs <夹具目录> [--tier T0|T2] [--model <id>] [--trace <文件>]');
 console.log(JSON.stringify(await replayFixture(dir,{tier:opt.tier??'T2',current:opt.model?{model:opt.model}:{},traceFile:opt.trace??null})));
}
