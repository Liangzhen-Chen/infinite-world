// S2-L（最小账本）黑盒验收，第 7 条：存读档复演一致。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 流程：开局 → 选来历 → 第 0 日建第二个 person → 转移 → 等 60 分钟 → 存槽 → 读档 replay_apply（卷二十七:740）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

// 逐位比较用规范形式（键按字典序，与存档的 canonical 口径一致）：对象键的书写顺序不计，值与结构计。
const canon = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'bigint') return `${x}n`;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});

test('7. 存读档复演：saveDigest 逐字节一致；accounts、ledgerTotals、outflowTotals、ledgerCounters 与整份 state 逐位相同', async () => {
  const { world, saveRoot } = await S.freshWorld();
  const { avatar, other, rowId } = await S.setupTwo(world);
  const { startingCoin: coin, startingMoney: money } = S.originOf(rowId);
  const qty = Math.min(5, money);
  const t = await world.submitProposal({ effects: [{
    op: 'transfer',
    from: S.acctKey(world.state, avatar, coin),
    to: S.acctKey(world.state, other, coin),
    qty,
  }] });
  assert.equal(S.isOk(t), true, `转移应成功：${JSON.stringify(t)}`);
  const adv = await world.advance(60);
  assert.equal(S.isOk(adv), true, `推进 60 分钟应成功：${JSON.stringify(adv)}`);

  const manifest = world.save(0);
  assert.equal(typeof manifest.saveDigest, 'string', '存档清单应带 saveDigest');
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));

  assert.equal(back.saveDigest, manifest.saveDigest, '复演后的 saveDigest 应与存前逐字节相同');
  for (const key of ['accounts', 'ledgerTotals', 'ledgerCounters']) {
    assert.ok(key in world.state, `state 应含顶层键 ${key}`);
  }
  // outflowTotals 只为 trackOutflow 为真的用途分区开键（卷六:387）；本局无此分区时不存在该键，两边同为缺省即逐位相同。
  for (const key of ['accounts', 'ledgerTotals', 'outflowTotals', 'ledgerCounters']) {
    assert.equal(canon(back.state[key]), canon(world.state[key]), `复演后 ${key} 应逐位相同`);
  }
  assert.equal(canon(back.state), canon(world.state), '复演后整份 state 应逐位相同（键序不计）');
  assert.equal(S.balance(back.state, avatar, coin), money - qty, '复演后化身余额应仍为转后数额');
  S.assertConserved(back.state, coin);
});
