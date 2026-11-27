// S2-T1b 黑盒验收：季节与节气是纯派生，不落状态（卷二:550 复演口径；卷二十:691 派生读数）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

const DERIVED_NAMES = ['season', 'solarTerm', 'phase', 'localPhase', 'solarPhase', 'seasonScheme', 'termScheme', 'phaseOffset'];

test('7a. 无派生路径：开局并推进后，state 与存档（快照、日志册）里都没有季节、节气、相位及其方案字段', async () => {
  const { world, saveRoot, avatar } = await S.startAt(0);
  for (let d = 0; d < 3; d += 1) await S.waitMinutes(world, avatar, S.MINUTES_PER_DAY);
  world.save(0);
  const back = loadSlot({ slot: 0 }, { saveRoot });
  const keysState = S.keysDeep(world.state);
  const keysSave = S.keysDeep({ snapshot: back.snapshot, book: back.book });
  for (const name of DERIVED_NAMES) {
    assert.equal(keysState.has(name), false, `state 中不得有 ${name} 路径`);
    assert.equal(keysSave.has(name), false, `存档中不得有 ${name} 路径`);
  }
});

test('7b. 同种子同时刻：两个独立开局推进同样的时长，每个时刻的 now 逐字节相同', async () => {
  const a = await S.startAt(0);
  const b = await S.startAt(0);
  assert.equal(S.canon(S.nowOf(a.world, a.avatar)), S.canon(S.nowOf(b.world, b.avatar)), '开局时刻的 now 应相同');
  for (const step of [90, 1440, 5000]) {
    await S.advanceBy(a.world, step);
    await S.advanceBy(b.world, step);
    assert.equal(S.canon(S.nowOf(a.world, a.avatar)), S.canon(S.nowOf(b.world, b.avatar)), `推进 ${step} 分后 now 应逐字节相同`);
  }
});

test('7c. 存读档复演：推进到非零时刻后存槽、读档复演，saveDigest 相同，同一时刻 now 逐字节相同且季节非空', async () => {
  const { world, saveRoot, avatar } = await S.startAt(0);
  await S.waitMinutes(world, avatar, 90);
  await S.advanceBy(world, 100 * S.MINUTES_PER_DAY);
  const nowBefore = S.nowOf(world, avatar);
  assert.notEqual(nowBefore.season, null, '前提：本时刻季节应可读');
  const manifest = world.save(0);
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后 saveDigest 应与存前相同');
  assert.equal(S.canon(S.nowOf(back, avatar)), S.canon(nowBefore), '复演后 now 应逐字节相同');
});
