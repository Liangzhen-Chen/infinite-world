// S2-TP1 黑盒验收：存读档复演一致（卷二:550、卷二十七:740）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。流程：开局（有法阵的落脚处）→ 推进 60 分钟 → 存槽 → 读档 replay_apply。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('6. 存读档复演：开局与推进后存槽，复演的 saveDigest 逐字节一致，整份 state 逐位相同，法阵边逐条相同', async () => {
  const probe = await S.startAt(0);
  const sites = S.expectedCircleSites(S.ROOT);
  const idx = probe.offer.findIndex((id) => sites.has(S.ownerOfPlace(S.ROOT, id)));
  assert.ok(idx >= 0, '前提：开局候选里应有位于法阵聚落内的建筑');
  const { world, saveRoot } = await S.startAt(idx);
  const adv = await world.advance(60);
  assert.equal(S.isOk(adv), true, `推进 60 分钟应成功：${JSON.stringify(adv)}`);
  const { manifest, back } = S.replayOf(world, saveRoot);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');
  assert.equal(S.canon(back.state), S.canon(world.state), '复演后整份 state 应逐位相同（键序不计）');
  assert.equal(
    S.canon(S.operatesEdges(back.state, S.ROOT)),
    S.canon(S.operatesEdges(world.state, S.ROOT)),
    '复演后法阵边应逐条相同',
  );
});
