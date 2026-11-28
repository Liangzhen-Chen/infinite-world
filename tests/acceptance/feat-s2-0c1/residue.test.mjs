// S2-0c1 黑盒验收，第 3、4、5 条：提交后零残留、持有边按种类行处置（不整批关闭）、持有变化事件一一对应。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-0c1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-0c1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const ids = (list) => list.map((e) => e.edge).sort();

test('3. 零残留：提交后死者无非零余额，且不是任何现役边的持有者或标的（卷二:558）', async () => {
  const { world } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  assert.ok(S.liveEdges(world).some((e) => e.holder === npc.id), '前提：带来历 NPC 应是某条现役边的持有者（穿戴边）');
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  assert.deepEqual(S.accountEntries(world.state).filter((e) => e.holder === npc.id && e.amount !== 0), [], '死者名下不应有非零余额');
  assert.deepEqual(S.liveEdges(world).filter((e) => e.holder === npc.id || e.subject === npc.id), [], '死者不应是任何现役边的持有者或标的');
});

test('4. 按种类行处置：死者为持有者的边，gone 为 ho_close 的关闭、ho_stay 的不动；其余边不受影响，不整批关闭（卷二:557；卷十八:518）', async () => {
  const { world } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  const live = S.liveEdges(world);
  const holderEdges = live.filter((e) => e.holder === npc.id);
  assert.ok(holderEdges.length > 0, '前提：带来历 NPC 应持有至少一条边');
  const closeEdges = holderEdges.filter((e) => S.HK[e.kind].gone === 'ho_close');
  const stayEdges = holderEdges.filter((e) => S.HK[e.kind].gone === 'ho_stay');
  const others = live.filter((e) => e.holder !== npc.id && e.subject !== npc.id);
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  const after = S.liveEdges(world);
  assert.ok(closeEdges.length > 0, '前提：死者持有的边中应有 gone 为 ho_close 的（数据：穿戴边）');
  for (const e of closeEdges) assert.ok(!after.some((x) => x.edge === e.edge), `ho_close 的边 ${e.kind} 应已关闭`);
  for (const e of stayEdges) assert.ok(after.some((x) => x.edge === e.edge), `ho_stay 的边 ${e.kind} 应保持现役`);
  assert.deepEqual(ids(after.filter((e) => e.holder !== npc.id && e.subject !== npc.id)), ids(others), '不涉及死者的现役边应逐条不动（不整批关闭）');
});

test('4b. 按种类行处置：死者为持有者、gone 为 ho_succeed 的边，候补顺序未建，整笔拒，state 逐位不变（卷二:557；卷十八:518）', async () => {
  // 夹具只改数据：把一个 gone 为 ho_succeed 的种类的 to 改指 agent（数据推出，不点名 id），使黑盒能开这条边。
  const succ = Object.keys(S.HK).find((k) => S.HK[k].gone === 'ho_succeed');
  assert.ok(succ, '前提：持有种类族应有 gone 为 ho_succeed 的行（数据）');
  const fx = S.copyFixture();
  S.editJson(fx, 'world/ontology/dimensions/_vocab.json', (v) => {
    v.families.holding_kind.entries[succ].to = ['agent'];
  });
  const world = await S.bootFixture(fx);
  const npc = await S.setupNpc(world);
  const other = S.createNpc(world, npc.rowId);
  const o = world.submitProposal({ effects: [{ op: 'holding.open', holdingKind: succ, holder: npc.id, subject: other }] });
  assert.equal(S.isOk(o), true, `前提：开一条 ${succ} 边应成功：${JSON.stringify(o)}`);
  const before = S.snapshot(world);
  const r = S.destroy(world, npc.id);
  S.assertRejected(world, before, r);
});

test('5. 事件：每条关闭的边恰一条 verb_holding_changed（ended）；本次 destroy 不产生 established 或 transferred（卷十八:528）', async () => {
  const { world } = await S.freshWorld();
  const npc = await S.setupNpc(world);
  const live = S.liveEdges(world);
  const expectClosed = live.filter((e) => (e.holder === npc.id && S.HK[e.kind].gone === 'ho_close') || e.subject === npc.id).map((e) => e.edge).sort();
  assert.ok(expectClosed.length > 0, '前提：应有待关闭的边');
  const mark = world.logBook.entries.length;
  const r = S.destroy(world, npc.id);
  assert.equal(S.isOk(r), true, `destroy 应成功：${JSON.stringify(r)}`);
  const holdEvs = S.eventsOf(S.windowSince(world, mark)).filter((e) => e.verb === S.HOLD_VERB);
  const ended = holdEvs.filter((e) => e.payload?.change === 'ended').map((e) => e.payload.edge).sort();
  assert.deepEqual(ended, expectClosed, '每条待关闭的边应恰一条 ended 事件，且无多余');
  assert.equal(holdEvs.filter((e) => e.payload?.change !== 'ended').length, 0, '本次 destroy 不应产生 established 或 transferred');
});
