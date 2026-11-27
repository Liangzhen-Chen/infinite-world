// S2-T1 黑盒验收：act_wait 之后 now 随时间变（草案 §5；卷二十:430 时钟、systemTimeView）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('3a. act_wait N 分钟后 now.minute 恰增 N（N 取 1、30、等待上限）', async () => {
  const { world, avatar } = await S.startAt(0);
  for (const n of [1, 30, S.ACT_WAIT_MAX]) {
    const before = S.nowOf(world, avatar).minute;
    await S.waitMinutes(world, avatar, n);
    const after = S.nowOf(world, avatar).minute;
    assert.equal(after - before, n, `act_wait ${n} 后 now.minute 应恰增 ${n}`);
  }
});

test('3b. 日与日内分钟一致：minuteOfDay 为 minute 对一日取余，day 的增量等于跨过的日界数（一日 = 1440 分，由 _units.json 读）', async () => {
  const { world, avatar } = await S.startAt(0);
  const first = S.nowOf(world, avatar);
  for (let i = 0; i < 12; i += 1) {
    await S.waitMinutes(world, avatar, 500);
    const now = S.nowOf(world, avatar);
    assert.ok(now.minuteOfDay >= 0 && now.minuteOfDay < S.MINUTES_PER_DAY, 'minuteOfDay 应在 [0, 一日)');
    assert.equal(now.minuteOfDay, now.minute % S.MINUTES_PER_DAY, 'minuteOfDay 应为 minute 对一日取余');
    const crossed = Math.floor(now.minute / S.MINUTES_PER_DAY) - Math.floor(first.minute / S.MINUTES_PER_DAY);
    assert.equal(now.day - first.day, crossed, 'day 的增量应等于跨过的日界数');
  }
});
