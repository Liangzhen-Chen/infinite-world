// S2-0c1 黑盒验收，第 1、2、6 条：守恒与残骸收余额、账户分流按数据（sink 与表外取值整笔拒）、事件次序。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-0c1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-0c1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('1. 守恒：destroy 带来历 NPC 后，每种资源的世界总量逐种不变，守恒式成立（卷二:556；卷六:365）', async () => {
  const { world } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  const before = S.sumByRes(world.state);
  assert.ok(Object.values(before).some((v) => v > 0), '前提：带来历 NPC 应有非零余额');
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  const after = S.sumByRes(world.state);
  for (const res of S.RESOURCE_IDS) {
    assert.equal(after[res] ?? 0, before[res] ?? 0, `资源 ${res} 的世界总量 destroy 前后应相同`);
    S.assertConserved(world.state, res);
  }
});

test('1b. 余额去残骸：死者每个非零账户，残骸上同用途同资源同键账户余额等于死前；死者名下归零（卷二:556；卷六:119）', async () => {
  const { world } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  const held = S.accountEntries(world.state).filter((e) => e.holder === npc.id && e.amount !== 0);
  assert.ok(held.length > 0, '前提：带来历 NPC 应有非零账户');
  for (const e of held) {
    assert.ok(['successor', 'remains'].includes(S.resourceOnTerminate(e.res)), `前提：资源 ${e.res} 的 onTerminate 应为 successor 或 remains（数据）`);
  }
  const mark = world.logBook.entries.length;
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  const wreck = S.terminatedEvent(S.windowSince(world, mark)).payload.successorId;
  assert.equal(typeof wreck, 'string', '终止事件应带 successorId（残骸）');
  assert.equal(world.state.created[wreck]?.kind, 'item', '残骸应为 item 实例');
  const onWreck = S.accountEntries(world.state).filter((e) => e.holder === wreck);
  for (const e of held) {
    const m = onWreck.find((w) => w.purpose === e.purpose && w.res === e.res && w.key === e.key);
    assert.equal(m?.amount, e.amount, `残骸上 ${e.res}/${e.key} 余额应等于死前 ${e.amount}`);
  }
  assert.equal(S.accountEntries(world.state).filter((e) => e.holder === npc.id && e.amount !== 0).length, 0, '死者名下应无非零账户');
});

// 2. 账户分流按数据：onTerminate 为 sink（写者未建）时 destroy 整笔拒，码 E-ACT-WRITER-NOT-READY，state 逐位不变（卷二:556；卷六:119）。
// 夹具只改数据：把 NPC 持有的资源行的 onTerminate 改成 sink；代码不改，不加测试接口。
test('2a. 账户分流按数据：NPC 持有的资源行 onTerminate 为 sink（写者未建）时 destroy 整笔拒，E-ACT-WRITER-NOT-READY，state 逐位不变', async () => {
  const base = (await S.freshWorld()).world;
  const npcBase = await S.setupNpc(base);
  const held = [...new Set(S.accountEntries(base.state).filter((e) => e.holder === npcBase.id && e.amount !== 0).map((e) => e.res))];
  assert.ok(held.length > 0, '前提：带来历 NPC 应持有至少一种资源');

  const fx = S.copyFixture();
  S.editJson(fx, 'world/rules/tables/economy/resources.json', (d) => {
    for (const res of held) d.rows.find((x) => x.key === res).value.onTerminate = 'sink';
  });
  const world = await S.bootFixture(fx);
  const npc = await S.setupNpc(world);
  const before = S.snapshot(world);
  const r = S.destroy(world, npc.id);
  S.assertRejected(world, before, r, 'E-ACT-WRITER-NOT-READY');
});

// 2b. 表外取值：onTerminate 的取值域由加载期的词表校验守住（E-DIM-DOMAIN-RANGE），表外值进不了 destroy，故此处断言加载即拒（不走 destroy）。
test('2b. 账户分流按数据：onTerminate 为表外取值时加载期即拒（E-DIM-DOMAIN-RANGE），表外值进不了 destroy', async () => {
  const base = (await S.freshWorld()).world;
  const npcBase = await S.setupNpc(base);
  const res = S.accountEntries(base.state).find((e) => e.holder === npcBase.id && e.amount !== 0)?.res;
  assert.ok(res, '前提：带来历 NPC 应持有至少一种资源');
  const fx = S.copyFixture();
  S.editJson(fx, 'world/rules/tables/economy/resources.json', (d) => {
    d.rows.find((x) => x.key === res).value.onTerminate = 'zz_s2_0c1_not_in_table';
  });
  await assert.rejects(() => S.bootFixture(fx), (e) => String(/** @type {{code?: unknown, message?: unknown} | null} */ (e)?.code ?? /** @type {{code?: unknown, message?: unknown} | null} */ (e)?.message ?? e).includes('E-DIM-DOMAIN-RANGE'));
});

test('6. 次序：destroy 的事件序中，账本分流事件先于终止标记，终止标记是最后一笔事件（卷二:556；R1）', async () => {
  const { world } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  const mark = world.logBook.entries.length;
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  const evs = S.eventsOf(S.windowSince(world, mark));
  assert.equal(evs[evs.length - 1].verb, S.TERM_VERB, '终止标记应是本次 destroy 的最后一笔事件');
  const reason = S.terminateReason();
  const transfers = evs.slice(0, -1).filter((e) => JSON.stringify(e).includes(reason));
  assert.ok(transfers.length >= 1, '分流应留下至少一条带事由 terminateReason 的账本事件（草案 §5.5）');
  const terminatedAt = evs.length - 1;
  for (const e of transfers) assert.ok(evs.indexOf(e) < terminatedAt, '分流事件应先于终止标记');
});
