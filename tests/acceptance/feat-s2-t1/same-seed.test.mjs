// S2-T1 黑盒验收：同种子同读数（草案 §7 第 3 条，本卡只核 now 逐字节相同；天气序列随种子变化待 S2-T2）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('3a. 同种子同开局：两局在同一分钟 view，now 逐字节相同（含没有化身与有化身两种读数）', async () => {
  const P = await S.freshWorld();
  const Q = await S.freshWorld();
  assert.equal(S.canon(S.nowOfNoAvatar(P.world)), S.canon(S.nowOfNoAvatar(Q.world)), '无化身时 now 应相同');
  const A = await S.startAt(0);
  const B = await S.startAt(0);
  assert.equal(S.canon(S.nowOf(A.world, A.avatar)), S.canon(S.nowOf(B.world, B.avatar)), '有化身时 now 应相同');
});

test('3b. 同种子同等待序列：两局按同样的等待走到同一分钟，now 逐字节相同', async () => {
  const A = await S.startAt(0);
  const B = await S.startAt(0);
  for (const n of [30, 1440, 720, 2000]) {
    await S.advanceBy(A.world, n);
    await S.advanceBy(B.world, n);
    assert.equal(S.canon(S.nowOf(B.world, B.avatar)), S.canon(S.nowOf(A.world, A.avatar)), `推进 ${n} 分钟后 now 应相同`);
  }
});
