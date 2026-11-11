import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {recordFixture,replayFixture,replayClient,readSideband,stepsFromTrace,staleReasons} from '../tools/replay.mjs';
import {reviewResponse} from './helpers/consistency-response.mjs';

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
const recording={calls:0};
const client={async generate(body,label){
 recording.calls++;
 if(label.startsWith('consistency-rewrite:'))return {choices:[{finish_reason:'stop',message:{content:'<q who="player">我全都答应。</q>'}}]};
 return reviewResponse(body);
}};
const fixture=path.join(root,'fixture');
const manifest=await recordFixture({dir:fixture,client,steps,model:'deepseek-flash'});
const recordedCalls=recording.calls;

// 断网：本机回环以外的任何 fetch 都计数并拒绝。
async function offline(run){
 const real=globalThis.fetch,external=[];
 globalThis.fetch=(input,...rest)=>{
  const url=String(input?.url??input);
  if(new URL(url).hostname!=='127.0.0.1'){external.push(url);return Promise.reject(Error('断网'));}
  return real(input,...rest);
 };
 try{return {result:await run(),external};}finally{globalThis.fetch=real;}
}
const copyFixture=async name=>{const dir=path.join(root,name);await fs.cp(fixture,dir,{recursive:true});return dir;};
const editManifest=async(dir,edit)=>{const file=path.join(dir,'manifest.json'),m=JSON.parse(await fs.readFile(file,'utf8'));edit(m);await fs.writeFile(file,JSON.stringify(m));};

test('录制：夹具含绑定与每次模型调用一条旁路记录，回放用的 sideband 目录可读',async()=>{
 assert.ok(recordedCalls>=2);
 for(const key of ['commit','contentHash','model','seed','ruleStateDigest','textDigest','initialStateHash'])assert.ok(key in manifest,key);
 assert.equal(manifest.model,'deepseek-flash');assert.match(manifest.contentHash,/^[a-f0-9]{64}$/);
 const rows=await readSideband(path.join(fixture,'sideband'));
 assert.equal(rows.length,recordedCalls);
 assert.ok(rows.every(r=>r.status==='ok'&&r.response));
});

test('VAI-05-3：带旁路记录的存档断网重放，0 次外部 fetch，不碰录制用的模型客户端，规则状态哈希与文字都相同',async()=>{
 const {result,external}=await offline(()=>replayFixture(fixture));
 assert.deepEqual(external,[]);
 assert.equal(recording.calls,recordedCalls);
 assert.equal(result.hits,recordedCalls);assert.equal(result.modelCalls,recordedCalls);
 assert.deepEqual(result.stale,[]);
 assert.equal(result.settlement.matches,true);assert.equal(result.ruleStateDigest,manifest.ruleStateDigest);
 assert.deepEqual(result.text,{skipped:false,matches:true});
});

test('VAI-00-4 完整版：同一存档 T0 与 T2 各推 30 日，规则状态哈希相同；T0 零模型调用，T2 全部来自旁路记录；改世界步骤则哈希必变',async()=>{
 const {result:t0,external:e0}=await offline(()=>replayFixture(fixture,{tier:'T0'}));
 const {result:t2,external:e2}=await offline(()=>replayFixture(fixture,{tier:'T2'}));
 assert.deepEqual([...e0,...e2],[]);
 assert.equal(t0.modelCalls,0);assert.equal(t2.hits,recordedCalls);
 assert.equal(t0.ruleStateDigest,t2.ruleStateDigest);
 assert.equal(t0.settlement.matches,true);assert.equal(t2.settlement.matches,true);
 assert.equal(steps.filter(s=>s.body.tool==='world_time').length,DAYS);
 const shorter=await copyFixture('shorter');
 await editManifest(shorter,m=>{m.steps.pop();});
 assert.notEqual((await replayFixture(shorter,{tier:'T0'})).ruleStateDigest,t0.ruleStateDigest);
});

test('未命中即报错：缺一条旁路记录则回放失败并点名，不回落真实调用；空记录与未知请求同样报错',async()=>{
 const broken=await copyFixture('missing'),dir=path.join(broken,'sideband');
 await fs.rm(path.join(dir,(await fs.readdir(dir)).sort()[0]));
 const {external}=await offline(async()=>{await assert.rejects(replayFixture(broken),/E-REPLAY-MISS/);});
 assert.deepEqual(external,[]);
 const client=replayClient(await readSideband(path.join(fixture,'sideband')));
 await assert.rejects(client.generate({messages:[{role:'user',content:'录制里没有'}]},'unknown'),/E-REPLAY-MISS/);
 assert.equal(client.misses.length,1);assert.equal(client.hits,0);
 await assert.rejects(readSideband(path.join(root,'no-such-directory')));
 const empty=path.join(root,'empty');await fs.mkdir(empty);
 await assert.rejects(readSideband(empty),/E-REPLAY-EMPTY/);
});

test('VAI-05-14：contentHash 改变后文字断言标 stale 并跳过，结算回归仍跑；未过时时文字断言真的会失败',async()=>{
 const drifted=await copyFixture('drifted');
 await editManifest(drifted,m=>{m.contentHash='0'.repeat(64);m.textDigest='篡改的文字哈希';});
 const stale=await replayFixture(drifted);
 assert.deepEqual(stale.stale,['contentHash']);assert.equal(stale.text.skipped,true);assert.equal(stale.text.reason,'stale');
 assert.equal(stale.settlement.matches,true);assert.equal(stale.ruleStateDigest,manifest.ruleStateDigest);
 const live=await copyFixture('live-text');
 await editManifest(live,m=>{m.textDigest='篡改的文字哈希';});
 const checked=await replayFixture(live);
 assert.deepEqual(checked.stale,[]);assert.deepEqual(checked.text,{skipped:false,matches:false});assert.equal(checked.settlement.matches,true);
 const otherModel=await replayFixture(fixture,{current:{model:'another-model'}});
 assert.deepEqual(otherModel.stale,['model']);assert.equal(otherModel.text.skipped,true);
 assert.deepEqual(staleReasons({commit:'a',contentHash:'b',model:'c',seed:'d'},{commit:'z',contentHash:'x',model:'c',seed:'y'}),['contentHash','seed']);
});

test('轨迹格式与 ptai 对齐：header/turn(calls)/end；写世界调用可从轨迹转回回放步骤',async()=>{
 const traceFile=path.join(root,'trace.jsonl');
 await replayFixture(fixture,{traceFile});
 const rows=(await fs.readFile(traceFile,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(rows[0].type,'header');
 for(const key of ['runId','campaignId','seed','initialStateHash','gitHead','model'])assert.ok(key in rows[0],key);
 assert.equal(rows.at(-1).type,'end');
 const turns=rows.filter(r=>r.type==='turn');
 assert.equal(turns.length,steps.length);
 assert.ok(turns.every(r=>Array.isArray(r.calls)&&typeof r.ts==='string'));
 const executes=steps.filter(s=>s.endpoint==='execute');
 assert.deepEqual(stepsFromTrace(rows).map(s=>[s.endpoint,s.body.tool,s.body.args,s.body.eventId]),executes.map(s=>[s.endpoint,s.body.tool,s.body.args,s.body.eventId]));
});

test('可证伪假设：不同战役编号、同种子同步骤，规则状态哈希相同；同步骤两次录制的 requestHash 序列相同（请求体无随机量）',async()=>{
 const again=path.join(root,'again');
 const second=await recordFixture({dir:again,client:{generate:client.generate},steps,model:'deepseek-flash'});
 assert.notEqual(second.campaignId,manifest.campaignId);
 assert.equal(second.ruleStateDigest,manifest.ruleStateDigest);
 assert.equal(second.initialStateHash,manifest.initialStateHash);
 const hashes=async dir=>(await readSideband(path.join(dir,'sideband'))).map(r=>r.requestHash);
 assert.deepEqual(await hashes(again),await hashes(fixture));
});
