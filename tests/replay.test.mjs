import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import childProcess from 'node:child_process';
import {replayFixture,replayClient,readSideband,stepsFromTrace,staleReasons} from '../tools/replay.mjs';
import {makeRoot,stepsFor,makeRecorder,copyFixture as copy,editManifest,withoutOutbound} from './helpers/replay-harness.mjs';

// 预计时长（未实测）：全文件只用 4 步短会话（审查、购买、审查回复、推进 1 日），约 10 次，合计远小于 30 日会话。
// 30 日会话（VAI-00-4）拆在 replay-vai00-4-t2.test.mjs 与 replay-vai00-4-t0.test.mjs，每文件各一次录制加一次回放。
const root=await makeRoot();
after(()=>fs.rm(root,{recursive:true,force:true}));
const shortSteps=stepsFor(1).slice(0,4);
const {recording,record}=makeRecorder(root);
const shortA=await record('short-a',{steps:shortSteps});
const shortB=await record('short-b',{steps:shortSteps});
const shortC=await record('short-c',{steps:shortSteps,seed:'ai21-other-seed'});
const recordedTotal=recording.calls;
const copyFixture=(source,name)=>copy(root,source,name);

test('录制：夹具含绑定与每次模型调用一条旁路记录，回放用的 sideband 目录可读',async()=>{
 assert.ok(shortA.calls>=2);
 for(const key of ['commit','contentHash','model','seed','ruleStateDigest','textDigest','initialStateHash'])assert.ok(key in shortA.manifest,key);
 assert.equal(shortA.manifest.model,'deepseek-flash');assert.match(shortA.manifest.contentHash,/^[a-f0-9]{64}$/);
 const rows=await readSideband(path.join(shortA.dir,'sideband'));
 assert.equal(rows.length,shortA.calls);
 assert.ok(rows.every(r=>r.status==='ok'&&r.response));
});

test('VAI-05-3：带旁路记录的存档回放零外联（fetch/http/https/net/child_process，盲区见 helpers/replay-harness.mjs 注释），不碰录制用的模型客户端，规则状态哈希与文字都相同',async()=>{
 const {result,external}=await withoutOutbound(()=>replayFixture(shortA.dir,{tier:'T2'}));
 assert.deepEqual(external,[]);
 assert.equal(recording.calls,recordedTotal);
 assert.equal(result.hits,shortA.calls);assert.equal(result.modelCalls,shortA.calls);
 assert.deepEqual(result.stale,[]);
 assert.equal(result.settlement.matches,true);assert.equal(result.ruleStateDigest,shortA.manifest.ruleStateDigest);
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

test('同一存档 T0 与 T2 推进后规则状态哈希相同（短会话直接对照；30 日见 VAI-00-4 两个文件）；T0 零模型调用',async()=>{
 const {result:t0,external:e0}=await withoutOutbound(()=>replayFixture(shortA.dir,{tier:'T0'}));
 const {result:t2,external:e2}=await withoutOutbound(()=>replayFixture(shortA.dir,{tier:'T2'}));
 assert.deepEqual([...e0,...e2],[]);
 assert.equal(t0.modelCalls,0);assert.equal(t2.hits,shortA.calls);
 assert.equal(t0.ruleStateDigest,t2.ruleStateDigest);
 assert.equal(t0.settlement.matches,true);assert.equal(t2.settlement.matches,true);
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

