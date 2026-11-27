// S2-T1 黑盒验收：存读档复演后 now 逐字节相同（草案 §5 第 4 条；卷二:550 与 S2-P 复演同口径）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。流程：开局 → act_wait → view → 存槽 → 读档复演 → view。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

test('7. 存读档复演：复演后 saveDigest 相同，同一分钟的 now 与复演前逐字节相同', async () => {
  const { world, saveRoot, avatar } = await S.startAt(0);
  await S.waitMinutes(world, avatar, 90);
  const nowBefore = S.canon(S.nowOf(world, avatar));
  const manifest = world.save(0);
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后 saveDigest 应与存前相同');
  assert.equal(S.canon(S.nowOf(back, avatar)), nowBefore, '复演后 now 应逐字节相同');
});
