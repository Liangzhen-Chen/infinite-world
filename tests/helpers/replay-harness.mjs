import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import {tmpRoot} from '../../tools/tmp-root.mjs';
import {fileURLToPath} from 'node:url';
import {recordFixture} from '../../tools/replay.mjs';
import {stepsFor,stubClient} from '../../tools/replay-record.mjs';

// 回放测试的共用部分：步骤、可注入的录制客户端、外联拦截、夹具拷贝与篡改。
export const makeRoot=()=>fs.mkdtemp(path.join(tmpRoot(),'ai21-replay-'));
export {stepsFor};
// 夹具由真实调用路径录一次：确定性客户端（tools/replay-record.mjs 的 stubClient）回答一致性审查与改写，服务端旁路写盘；之后全部回放。
export function makeRecorder(root){
 const recording={calls:0},inner=stubClient();
 const client={async generate(body,label){recording.calls++;return inner.generate(body,label);}};
 const record=async(name,options)=>{
  const before=recording.calls,dir=path.join(root,name);
  const manifest=await recordFixture({dir,client,model:'deepseek-flash',...options});
  return {dir,manifest,calls:recording.calls-before};
 };
 return {recording,record};
}
// 入库夹具（tools/replay-fixtures/<name>，由 tools/replay-record.mjs 在云上生成）；缺失时明确报错。
export const FIXTURE_ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..','tools','replay-fixtures');
export async function loadFixture(name){
 const dir=path.join(FIXTURE_ROOT,name);
 let manifest;
 try{manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));}
 catch(error){if(error.code==='ENOENT')throw Error(`E-REPLAY-FIXTURE-MISSING 入库夹具缺失：${dir}（先在云上运行 node tools/replay-record.mjs <输出目录> 生成，再取回入库到 tools/replay-fixtures/）`);throw error;}
 return {dir,manifest};
}
// 夹具 contentHash 与当前世界不符时文字断言标 stale 并跳过，结算断言照跑。
export function assertReplayMatches(assert,result){
 assert.equal(result.settlement.matches,true);
 if(result.tier==='T2'){
  if(result.stale.includes('contentHash'))assert.deepEqual(result.text,{skipped:true,reason:'stale'});
  else assert.deepEqual(result.text,{skipped:false,matches:true});
 }
}
export const copyFixture=async(root,source,name)=>{const dir=path.join(root,name);await fs.cp(source,dir,{recursive:true});return dir;};
export const editManifest=async(dir,edit)=>{const file=path.join(dir,'manifest.json'),m=JSON.parse(await fs.readFile(file,'utf8'));edit(m);await fs.writeFile(file,JSON.stringify(m));};

// 外联拦截（测试内的窄拦截，不是网络隔离）：拦 globalThis.fetch、http/https 的 request/get、net.Socket 连接
// （net.connect 与 createConnection 最终都走它）、child_process 全部启动函数；目标不是回环地址（127.0.0.1、::1、localhost）
// 的一律计数并拒绝，子进程无条件拒绝。盲区：已按具名导入绑定的引用（例如 tools/replay.mjs 里 import {execFileSync} 的 gitCommit 不会被拦，它只在写轨迹 gitHead 时调用，零外联测试不传 traceFile）、dns、worker_threads、原生扩展、
// 以及本机 127.0.0.1 上的转发代理（回环放行）。所以只声称"零外联（上述入口）"，不声称物理断网。
const LOOPBACK=new Set(['127.0.0.1','::1','[::1]','localhost']);
const hostOf=args=>{
 const [a,b]=args;
 if(typeof a==='string'){try{return new URL(a).hostname;}catch{return null;}}
 if(a instanceof URL)return a.hostname;
 if(a&&typeof a==='object')return a.hostname??a.host??'localhost';
 return b;
};
export async function withoutOutbound(run){
 const external=[],undo=[];
 const patch=(object,key,make)=>{const original=object[key];object[key]=make(original);undo.push(()=>{object[key]=original;});};
 const guard=(label,host,original,self,args)=>{
  if(!LOOPBACK.has(String(host))){external.push(`${label}:${host}`);throw Error(`零外联拦截 ${label} ${host}`);}
  return Reflect.apply(original,self,args);
 };
 patch(globalThis,'fetch',original=>function(input,...rest){
  try{return guard('fetch',hostOf([String(input?.url??input)]),original,this,[input,...rest]);}catch(error){return Promise.reject(error);}
 });
 for(const [name,lib] of [['http',http],['https',https]])for(const key of ['request','get'])
  patch(lib,key,original=>function(...args){return guard(`${name}.${key}`,hostOf(args)??'localhost',original,this,args);});
 patch(net.Socket.prototype,'connect',original=>function(...args){
  const [a,b]=args;
  const host=typeof a==='object'&&a!==null?(a.path!==undefined?`path:${a.path}`:a.host??'localhost'):/^\d+$/.test(String(a))?(typeof b==='string'?b:'localhost'):`path:${a}`;
  return guard('net.connect',host,original,this,args);
 });
 for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])
  patch(childProcess,key,()=>function(){external.push(`child_process.${key}`);throw Error(`零外联拦截 child_process.${key}`);});
 try{return {result:await run(),external};}finally{for(const restore of undo.reverse())restore();}
}
