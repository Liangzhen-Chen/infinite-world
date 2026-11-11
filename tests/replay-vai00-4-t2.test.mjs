import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {replayFixture} from '../tools/replay.mjs';
import {makeRoot,stepsFor,makeRecorder,withoutOutbound} from './helpers/replay-harness.mjs';

// VAI-00-4 完整版（T2）：30 日是验收口径，不降天数。本文件含两次 30 日会话：录制一次、T2 回放一次；
// 预计时长按云上经验约 2 分钟/游戏日估算，每次约 60 分钟，合计约 2 小时（未实测，实测后再定是否改用入库夹具以省去录制）。
// 夹具不入库，所以回放测试必须自带一次录制；T0 一侧在另一个文件里，两侧都与各自录制出的规则状态哈希比较，
// 同步骤同种子的哈希确定（见 replay.test.mjs 的可证伪断言与短会话 T0/T2 直接对照）。
const root=await makeRoot();
after(()=>fs.rm(root,{recursive:true,force:true}));
const DAYS=30;
const steps=stepsFor(DAYS);
const {recording,record}=makeRecorder(root);
const full=await record('full',{steps});
const recordedTotal=recording.calls;

test('VAI-00-4（T2）：30 日回放的规则状态哈希与录制一致，全部模型响应来自旁路记录且文字相同，零外联',async()=>{
 assert.equal(steps.filter(s=>s.body.tool==='world_time').length,DAYS);
 const {result,external}=await withoutOutbound(()=>replayFixture(full.dir,{tier:'T2'}));
 assert.deepEqual(external,[]);
 assert.equal(recording.calls,recordedTotal);
 assert.deepEqual(result.stale,[]);
 assert.equal(result.settlement.matches,true);assert.equal(result.ruleStateDigest,full.manifest.ruleStateDigest);
 assert.ok(full.calls>=2);assert.equal(result.hits,full.calls);assert.equal(result.modelCalls,full.calls);
 assert.deepEqual(result.text,{skipped:false,matches:true});
});
