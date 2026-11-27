// S2-H（最小持有）黑盒验收，第 6 条：本提案产物引用（H-R6，卷九 R9-2.9 扩展）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
// 同一提案里先 create 出一个实体，再以 {produced:k} 指它（k 为本提案第 k 个产物）；k 越界报 E-EFF-PARAM，整笔回滚。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 不带门槛的种类（resides：agent → place，无 carriesRel、concluded、holdWhile），用来测产物引用本身。
const PLAIN_KIND = 'hk_resides';

test('6a. 产物引用：同一提案先 create、再 holding.open 以 {produced:0} 指刚建的 person，成功；新边挂在该 person 身上', async () => {
  assert.ok(S.HK[PLAIN_KIND], `前提：种类 ${PLAIN_KIND} 应在持有种类族里`);
  const { world } = await S.freshWorld();
  const { rowId } = await S.setupTwo(world);
  const place = Object.keys(S.PLACE_ROWS)[0];
  const before = Object.keys(world.state.created).filter((id) => world.state.created[id].kind === 'person');
  const r = await world.submitProposal({ effects: [
    { op: 'create', kind: 'person', template: rowId, facts: { species: S.SAPIENT_SPECIES } },
    { op: 'holding.open', holdingKind: PLAIN_KIND, holder: { produced: 0 }, subject: place },
  ] });
  assert.equal(S.isOk(r), true, `产物引用应成功：${JSON.stringify(r)}`);
  const after1 = Object.keys(world.state.created).filter((id) => world.state.created[id].kind === 'person');
  const [made] = after1.filter((id) => !before.includes(id));
  assert.ok(made, '本提案应新建一个 person');
  const edge = S.liveEdges(world).find((e) => e.kind === PLAIN_KIND && e.subject === place);
  assert.ok(edge, '应有一条现役的 hk_resides 边');
  assert.equal(edge.holder, made, '边的持有者应为本提案刚建的 person（{produced:0} 指向它）');
});

test('6b. 产物引用越界：{produced:5} 在只有一个产物的提案里报 E-EFF-PARAM，整笔回滚，state 逐位不变', async () => {
  const { world } = await S.freshWorld();
  const { rowId } = await S.setupTwo(world);
  const place = Object.keys(S.PLACE_ROWS)[0];
  const before = S.snap(world);
  const r = await world.submitProposal({ effects: [
    { op: 'create', kind: 'person', template: rowId, facts: { species: S.SAPIENT_SPECIES } },
    { op: 'holding.open', holdingKind: PLAIN_KIND, holder: { produced: 5 }, subject: place },
  ] });
  S.assertRejected(world, before, r, 'E-EFF-PARAM');
});
