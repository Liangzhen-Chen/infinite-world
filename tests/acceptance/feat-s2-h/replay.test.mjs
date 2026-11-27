// S2-H（最小持有）黑盒验收，第 7 条：存读档复演一致（卷二十七:740）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
// 流程：开局 → 选来历（带穿戴起始物）→ 关一条边、开一条边 → 推进 60 分钟 → 存槽 → 读档 replay_apply。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

test('7. 存读档复演：saveDigest 逐字节一致；holdings、holdingCounters 与整份 state 逐位相同；复演后持有边仍可查', async () => {
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const { world, saveRoot } = await S.freshWorld();
  const before = S.snap(world);
  const r = await S.chooseRow(world, rowId);
  assert.equal(S.isOk(r), true, `选来历应成功：${JSON.stringify(r)}`);
  const [avatar] = S.newPersons(world, before);
  assert.ok(avatar, '选来历应新建化身');

  // 关一条非席位的现役边（按边 id），再开一条不带门槛的边。
  const edge = S.liveEdges(world).find((e) => e.kind !== S.SEAT_KIND);
  assert.ok(edge, '前提：选来历后应有一条非席位现役边');
  const c = await world.submitProposal({ effects: [{ op: 'holding.close', holding: edge.edge }] });
  assert.equal(S.isOk(c), true, `按边 id 关边应成功：${JSON.stringify(c)}`);
  const o = await S.openHolding(world, 'hk_resides', avatar, Object.keys(S.PLACE_ROWS)[0]);
  assert.equal(S.isOk(o), true, `开一条 hk_resides 边应成功：${JSON.stringify(o)}`);

  const adv = await world.advance(60);
  assert.equal(S.isOk(adv), true, `推进 60 分钟应成功：${JSON.stringify(adv)}`);

  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));

  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');
  assert.ok('holdings' in world.state, 'state 应含顶层键 holdings');
  assert.ok('holdingCounters' in world.state, 'state 应含顶层键 holdingCounters');
  for (const key of ['holdings', 'holdingCounters', 'accounts', 'ledgerTotals', 'ledgerCounters']) {
    assert.equal(S.canon(back.state[key]), S.canon(world.state[key]), `复演后 ${key} 应逐位相同`);
  }
  assert.equal(S.canon(back.state), S.canon(world.state), '复演后整份 state 应逐位相同（键序不计）');
  // 复演后现役边与存前一致（由复演后的日志推出）。
  assert.deepEqual(
    S.liveEdges({ logBook: back.logBook }).map((e) => e.edge).sort(),
    S.liveEdges(world).map((e) => e.edge).sort(),
    '复演后的现役边应与存前相同',
  );
});
