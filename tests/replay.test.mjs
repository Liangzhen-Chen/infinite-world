import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import childProcess from 'node:child_process';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {recordFixture,replayFixture,replayClient,readSideband,stepsFromTrace,staleReasons} from '../tools/replay.mjs';
import {reviewResponse} from './helpers/consistency-response.mjs';

// 时长预算（未实测，云上首跑后记录）：30 日完整会话（33 步）共 3 次——录制 1、T2 回放 1、T0 回放 1（T0 与 T2 的
// 断言共用同一次回放）；其余全部用 4 步短会话（审查、购买、审查回复、推进 1 日），约 9 次。
// agriculture.test.mjs 在单个测试里连推 360 个 world_time 日，30 日这一档按同量级估计远低于 3600 秒，故不拆文件。
// 夹具由真实调用路径录一次：可注入的模型客户端回答一致性审查与改写，服务端旁路写盘；之后全部回放。
const root=await fs.mkdtemp(path.join(tmpRoot(),'ai21-replay-'));
after(()=>fs.rm(root,{recursive:true,force:true}));
const DAYS=30;
const steps=[
 {endpoint:'review/begin',body:{anchor:'replay-bread',playerText:'买一个面包'}},
 {endpoint:'execute',body:{tool:'world_act',args:{action:'core:trade.buy',slots:{seller:'林穗',item:'面包',quantity:1}},eventId:'replay-buy',anchor:'replay-bread'}},
 {endpoint:'review/reply',body:{draft:'<q who="player">我全都答应。</q>',query:'买一个面包'}},
 ...Array.from({length:DAYS},(_,d)=>({endpoint:'execute',body:{tool:'world_time',args:{minutes:1440},eventId:`replay-day-${d}`,anchor:`replay-day-${d}`}}))
];
const shortSteps=steps.slice(0,4);
const recording={calls:0};
const client={async generate(body,label){
 recording.calls++;
 if(label.startsWith('consistency-rewrite:'))return {choices:[{finish_reason:'stop',message:{content:'<q who="player">我全都答应。</q>'}}]};
 return reviewResponse(body);
}};
const record=async(name,options)=>{
 const before=recording.calls,dir=path.join(root,name);
 const manifest=await recordFixture({dir,client,model:'deepseek-flash',...options});
 return {dir,manifest,calls:recording.calls-before};
};
const full=await record('full',{steps});
const shortA=await record('short-a',{steps:shortSteps});
const shortB=await record('short-b',{steps:shortSteps});
const shortC=await record('short-c',{steps:shortSteps,seed:'ai21-other-seed'});
const recordedTotal=recording.calls;

// 外联拦截（测试内的窄拦截，不是网络隔离）：拦 globalThis.fetch、http/https 的 request/get、net.Socket 连接
// （net.connect 与 createConnection 最终都走它）、child_process 全部启动函数；目标不是回环地址（127.0.0.1、::1、localhost）
// 的一律计数并拒绝，子进程无条件拒绝。盲区：已按具名导入绑定的引用、dns、worker_threads、原生扩展、
// 以及本机 127.0.0.1 上的转发代理（回环放行）。所以只声称"零外联（上述入口）"，不声称物理断网。
const LOOPBACK=new Set(['127.0.0.1','::1','[::1]','localhost']);
const hostOf=args=>{
 const [a,b]=args;
 if(typeof a==='string'){try{return new URL(a).hostname;}catch{return null;}}
 if(a instanceof URL)return a.hostname;
 if(a&&typeof a==='object')return a.hostname??a.host??'localhost';
 return b;
};
async function withoutOutbound(run){
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
const memo=new Map();
const replayOnce=(key,dir,options)=>{if(!memo.has(key))memo.set(key,withoutOutbound(()=>replayFixture(dir,options)));return memo.get(key);};
const copyFixture=async(source,name)=>{const dir=path.join(root,name);await fs.cp(source,dir,{recursive:true});return dir;};
const editManifest=async(dir,edit)=>{const file=path.join(dir,'manifest.json'),m=JSON.parse(await fs.readFile(file,'utf8'));edit(m);await fs.writeFile(file,JSON.stringify(m));};

test('录制：夹具含绑定与每次模型调用一条旁路记录，回放用的 sideband 目录可读',async()=>{
 assert.ok(full.calls>=2);
 for(const key of ['commit','contentHash','model','seed','ruleStateDigest','textDigest','initialStateHash'])assert.ok(key in full.manifest,key);
 assert.equal(full.manifest.model,'deepseek-flash');assert.match(full.manifest.contentHash,/^[a-f0-9]{64}$/);
 const rows=await readSideband(path.join(full.dir,'sideband'));
 assert.equal(rows.length,full.calls);
 assert.ok(rows.every(r=>r.status==='ok'&&r.response));
});

test('VAI-05-3：带旁路记录的存档回放零外联（fetch/http/https/net/child_process，盲区见注释），不碰录制用的模型客户端，规则状态哈希与文字都相同',async()=>{
 const {result,external}=await replayOnce('full-t2',full.dir,{tier:'T2'});
 assert.deepEqual(external,[]);
 assert.equal(recording.calls,recordedTotal);
 assert.equal(result.hits,full.calls);assert.equal(result.modelCalls,full.calls);
 assert.deepEqual(result.stale,[]);
 assert.equal(result.settlement.matches,true);assert.equal(result.ruleStateDigest,full.manifest.ruleStateDigest);
 assert.deepEqual(result.text,{skipped:false,matches:true});
});

test('零外联拦截自身有效：非回环的 fetch/http/net 与子进程都被计数并拒绝',async()=>{
 const {result,external}=await withoutOutbound(async()=>{
  const errors=[];
  await fetch('http://203.0.113.9/').catch(e=>errors.push(e.message));
  try{http.get('http://203.0.113.9/');}catch(e){errors.push(e.message);}
  try{net.connect({host:'203.0.113.9',port:80});}catch(e){errors.push(e.message);}
  try{childProcess.spawnSync('node',['-v']);}catch(e){errors.push(e.message);}
  return errors;
 });
 assert.equal(result.length,4);
 assert.equal(external.length,4);
});

test('VAI-00-4 完整版：同一存档 T0 与 T2 各推 30 日，规则状态哈希相同；T0 零模型调用，T2 全部来自旁路记录；步骤不同则哈希必变',async()=>{
 const {result:t0,external:e0}=await replayOnce('full-t0',full.dir,{tier:'T0'});
 const {result:t2,external:e2}=await replayOnce('full-t2',full.dir,{tier:'T2'});
 assert.deepEqual([...e0,...e2],[]);
 assert.equal(t0.modelCalls,0);assert.equal(t2.hits,full.calls);
 assert.equal(t0.ruleStateDigest,t2.ruleStateDigest);
 assert.equal(t0.settlement.matches,true);assert.equal(t2.settlement.matches,true);
 assert.equal(steps.filter(s=>s.body.tool==='world_time').length,DAYS);
 assert.notEqual(shortA.manifest.ruleStateDigest,full.manifest.ruleStateDigest);
});

test('未命中即报错：缺一条旁路记录则回放失败并点名，不回落真实调用；空记录与未知请求同样报错',async()=>{
 const broken=await copyFixture(shortA.dir,'missing'),dir=path.join(broken,'sideband');
 await fs.rm(path.join(dir,(await fs.readdir(dir)).sort()[0]));
 const {external}=await withoutOutbound(async()=>{await assert.rejects(replayFixture(broken),/E-REPLAY-MISS/);});
 assert.deepEqual(external,[]);
 const unknown=replayClient(await readSideband(path.join(shortA.dir,'sideband')));
 await assert.rejects(unknown.generate({messages:[{role:'user',content:'录制里没有'}]},'unknown'),/E-REPLAY-MISS/);
 assert.equal(unknown.misses.length,1);assert.equal(unknown.hits,0);
 await assert.rejects(readSideband(path.join(root,'no-such-directory')));
 const empty=path.join(root,'empty');await fs.mkdir(empty);
 await assert.rejects(readSideband(empty),/E-REPLAY-EMPTY/);
});

test('少调用同样报错：回放步骤与录制不一致，录下的旁路记录没被用完，回放失败并点名',async()=>{
 const fewer=await copyFixture(shortA.dir,'unused');
 await editManifest(fewer,m=>{m.steps=m.steps.filter(s=>s.endpoint!=='review/reply');});
 await assert.rejects(replayFixture(fewer),/E-REPLAY-UNUSED/);
 const client=replayClient(await readSideband(path.join(shortA.dir,'sideband')));
 assert.equal(client.unused().length,shortA.calls);
});

test('VAI-05-14：contentHash 改变后文字断言标 stale 并跳过，结算回归仍跑；未过时时文字断言真的会失败；commit 不触发 stale',async()=>{
 const drifted=await copyFixture(shortA.dir,'drifted');
 await editManifest(drifted,m=>{m.contentHash='0'.repeat(64);m.textDigest='篡改的文字哈希';});
 const stale=await replayFixture(drifted);
 assert.deepEqual(stale.stale,['contentHash']);assert.equal(stale.text.skipped,true);assert.equal(stale.text.reason,'stale');
 assert.equal(stale.settlement.matches,true);assert.equal(stale.ruleStateDigest,shortA.manifest.ruleStateDigest);
 const live=await copyFixture(shortA.dir,'live-text');
 await editManifest(live,m=>{m.textDigest='篡改的文字哈希';m.commit='0'.repeat(40);});
 const checked=await replayFixture(live);
 assert.deepEqual(checked.stale,[]);assert.deepEqual(checked.text,{skipped:false,matches:false});assert.equal(checked.settlement.matches,true);
 const otherModel=await replayFixture(shortA.dir,{current:{model:'another-model'}});
 assert.deepEqual(otherModel.stale,['model']);assert.equal(otherModel.text.skipped,true);
 assert.deepEqual(staleReasons({commit:'a',contentHash:'b',model:'c',seed:'d'},{commit:'z',contentHash:'x',model:'c',seed:'y'}),['contentHash','seed']);
});

test('轨迹格式与 ptai 对齐（最小子集）：header/turn(calls)/end；写世界调用可从轨迹转回回放步骤',async()=>{
 const traceFile=path.join(root,'trace.jsonl');
 await replayFixture(shortA.dir,{traceFile});
 const rows=(await fs.readFile(traceFile,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(rows[0].type,'header');
 for(const key of ['runId','campaignId','worldSeed','initialStateHash','gitHead','model'])assert.ok(key in rows[0],key);
 assert.equal(rows.at(-1).type,'end');
 const turns=rows.filter(r=>r.type==='turn');
 assert.equal(turns.length,shortSteps.length);
 assert.ok(turns.every(r=>Array.isArray(r.calls)&&typeof r.ts==='string'));
 const executes=shortSteps.filter(s=>s.endpoint==='execute');
 assert.deepEqual(stepsFromTrace(rows).map(s=>[s.endpoint,s.body.tool,s.body.args,s.body.eventId]),executes.map(s=>[s.endpoint,s.body.tool,s.body.args,s.body.eventId]));
});

test('可证伪假设：战役编号无关、请求体确定、种子敏感',async()=>{
 // 同种子同步骤、不同战役编号：规则状态哈希与初态哈希相同；请求体无随机量（requestHash 序列相同）。
 assert.notEqual(shortB.manifest.campaignId,shortA.manifest.campaignId);
 assert.equal(shortB.manifest.ruleStateDigest,shortA.manifest.ruleStateDigest);
 assert.equal(shortB.manifest.initialStateHash,shortA.manifest.initialStateHash);
 const hashes=async dir=>(await readSideband(path.join(dir,'sideband'))).map(r=>r.requestHash);
 assert.deepEqual(await hashes(shortB.dir),await hashes(shortA.dir));
 // 换种子（同步骤）：初态哈希与规则状态哈希必变；manifest.seed 取自实际存档。
 assert.equal(shortC.manifest.seed,'ai21-other-seed');assert.notEqual(shortA.manifest.seed,shortC.manifest.seed);
 assert.notEqual(shortC.manifest.initialStateHash,shortA.manifest.initialStateHash);
 assert.notEqual(shortC.manifest.ruleStateDigest,shortA.manifest.ruleStateDigest);
 // 夹具里的种子被改成别的：重建出的存档与录制不同，settlement 不符（T0 不读旁路，不受请求变化干扰）。
 const swapped=await copyFixture(shortA.dir,'seed-swapped');
 await editManifest(swapped,m=>{m.seed='ai21-other-seed';});
 const result=await replayFixture(swapped,{tier:'T0'});
 assert.equal(result.settlement.matches,false);
});
