// S2-0c1 黑盒验收，第 7 条：存读档复演一致（卷二:550 存读档、卷二:556 守恒）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-0c1。
// 流程：开局 → 建带来历 NPC → destroy → 推进 60 分钟 → 存槽 → 读档 replay_apply。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

test('7. 复演一致：建 NPC → destroy → 推进 60 分钟 → 存读档，saveDigest 逐字节相同；残骸账户与整份 state 逐位相同', async () => {
  const { world, saveRoot } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  const mark = world.logBook.entries.length;
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  const wreck = S.terminatedEvent(S.windowSince(world, mark)).payload.successorId;
  const adv = await world.advance(60);
  assert.equal(S.isOk(adv), true, `推进 60 分钟应成功：${JSON.stringify(adv)}`);

  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));

  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');
  assert.equal(S.canon(back.state), S.canon(world.state), '复演后整份 state 应逐位相同（键序不计）');
  const wreckBook = (st) => S.accountEntries(st).filter((e) => e.holder === wreck);
  assert.deepEqual(wreckBook(back.state), wreckBook(world.state), '复演后残骸账户应逐位相同');
  assert.deepEqual(
    S.liveEdges({ logBook: back.logBook }).map((e) => e.edge).sort(),
    S.liveEdges(world).map((e) => e.edge).sort(),
    '复演后的现役边应与存前相同',
  );
});
