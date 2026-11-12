import test from 'node:test';
import assert from 'node:assert/strict';
import {replayFixture} from '../tools/replay.mjs';
import {loadFixture,assertReplayMatches,withoutOutbound} from './helpers/replay-harness.mjs';

// VAI-00-4 完整版（T0）：30 日是验收口径，不降天数。读入库夹具 tools/replay-fixtures/full（由 tools/replay-record.mjs 在云上生成），
// 本文件只含一次 30 日会话（T0 回放）。T2 一侧在另一个文件里，两侧都与同一个 manifest.ruleStateDigest 期望值比较，由此得 T0==T2。
// 预计时长按云上经验约 2 分钟/游戏日估算，约 60 分钟（未实测）。夹具缺失时 loadFixture 报 E-REPLAY-FIXTURE-MISSING。
// 夹具 contentHash 与当前世界不符时（T0 本无文字断言），结算断言照跑。
const {dir,manifest}=await loadFixture('full');

test('VAI-00-4（T0）：30 日回放的规则状态哈希等于夹具期望值，零模型调用，零外联',async()=>{
 assert.equal(manifest.steps.filter(s=>s.body.tool==='world_time').length,30);
 const {result,external}=await withoutOutbound(()=>replayFixture(dir,{tier:'T0'}));
 assert.deepEqual(external,[]);
 assertReplayMatches(assert,result);
 assert.equal(result.ruleStateDigest,manifest.ruleStateDigest);
 assert.equal(result.modelCalls,0);assert.equal(result.hits,0);
});
