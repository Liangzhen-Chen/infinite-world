// S2-P 位置写者黑盒验收：存读档复演一致（卷二:550、卷二十七:740）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-p/出题.md。
// 流程：开局落位 → move（带朝向）→ 推进 60 分钟 → 存槽 → 读档 replay_apply。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

test('7. 存读档复演：saveDigest 逐字节一致；化身的 pos、facing 与整份 state 逐位相同', async () => {
  const { world, saveRoot, avatar, lodge, offer } = await S.startAt(0);
  const Y = offer.find((x) => x !== lodge);
  assert.ok(Y, '前提：落脚处候选至少两栋');
  const r = await S.moveTo(world, avatar, Y);
  assert.equal(S.isOk(r), true, `move 应成功：${JSON.stringify(r)}`);

  const adv = await world.advance(60);
  assert.equal(S.isOk(adv), true, `推进 60 分钟应成功：${JSON.stringify(adv)}`);

  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));

  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');
  assert.equal(S.canon(back.state.created[avatar].props.pos), S.canon(S.posOf(world, avatar)), '复演后 pos 应逐位相同');
  assert.equal(back.state.created[avatar].props.facing, S.facingOf(world, avatar), '复演后 facing 应相同');
  assert.equal(S.canon(back.state), S.canon(world.state), '复演后整份 state 应逐位相同（键序不计）');
});
