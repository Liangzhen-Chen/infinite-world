// S2-P 位置写者黑盒验收：move 原语的朝向两路与拒收（卷十七:288、卷十七:304–:305、卷九:639）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-p/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 一局：化身在第 0 个落脚处；Y 为第 1 个落脚处（另一栋建筑）。
async function twoLodges() {
  const { world, avatar, lodge, offer } = await S.startAt(0);
  const offered = offer;
  assert.ok(offered.length >= 2, '前提：落脚处候选至少两栋');
  const Y = offered.find((x) => x !== lodge);
  return { world, avatar, from: lodge, Y };
}

test('3a. move 显式给 facing：位置换到目标建筑，朝向取显式值（卷九:639 move 的 facing 可选参数）', async () => {
  const { world, avatar, Y } = await twoLodges();
  const k = (S.facingOf(world, avatar) + 1) % S.FACING_DIRECTIONS;
  const r = await S.moveTo(world, avatar, Y, k);
  assert.equal(S.isOk(r), true, `move 到另一栋建筑应成功：${JSON.stringify(r)}`);
  assert.equal(S.hereOf(world, avatar)?.place, Y, 'move 后 here.place 应为目标建筑');
  assert.equal(S.facingOf(world, avatar), k, '显式给出的 facing 应被写入');
});

test('3b. move 不给 facing：朝向由「旧 → 新」方位角折成档位（卷十七:304，按 grid.json 常数）；平面重合时朝向不变', async () => {
  const { world, avatar, Y } = await twoLodges();
  const p0 = S.posOf(world, avatar);
  const f0 = S.facingOf(world, avatar);
  const r = await S.moveTo(world, avatar, Y);
  assert.equal(S.isOk(r), true, `move 到另一栋建筑应成功：${JSON.stringify(r)}`);
  const p1 = S.posOf(world, avatar);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (dx === 0 && dy === 0) {
    assert.equal(S.facingOf(world, avatar), f0, '平面重合时朝向应不变');
    return;
  }
  const expect = S.sectorOf(dx, dy);
  if (expect === null) return; // 落在档界附近，取值不稳，跳过（见出题.md 说明）
  assert.equal(S.facingOf(world, avatar), expect, '朝向应等于由平面差算出的方位角所折档位（卷五规则 12：dx 向东、dy 向北）');
});

test('4a. 拒收：move 缺 subject，报 E-EFF-PARAM，state 逐位不变（Q6 甲）', async () => {
  const { world, Y } = await twoLodges();
  const before = S.snap(world);
  const r = await world.submitProposal({ effects: [{ op: 'move', to: Y }] });
  S.assertRejected(world, before, r, 'E-EFF-PARAM');
});

test('4b. 拒收：目标是非建筑地点（区域，如出生地）报 E-ACT-WRITER-NOT-READY，state 逐位不变（Q3 甲）', async () => {
  const { world, avatar } = await twoLodges();
  const region = Object.keys(S.PLACE_ROWS).find((k) => !S.isBuilding(k));
  assert.ok(region, '前提：数据中应有非建筑地点');
  const before = S.snap(world);
  const r = await S.moveTo(world, avatar, region);
  S.assertRejected(world, before, r, 'E-ACT-WRITER-NOT-READY');
});

test('4c. 拒收：目标不是地点（不存在的 id）报 E-DIM-REF-MISSING 或 E-EFF-PARAM，state 逐位不变', async () => {
  const { world, avatar } = await twoLodges();
  const before = S.snap(world);
  const r = await S.moveTo(world, avatar, 'no_such_place_for_s2p');
  assert.equal(S.isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  const code = S.codeOf(r);
  assert.ok(code.includes('E-DIM-REF-MISSING') || code.includes('E-EFF-PARAM'), `拒收码应为 E-DIM-REF-MISSING 或 E-EFF-PARAM，实得 ${code}`);
  S.assertRejected(world, before, r, code);
});

test('4d. 拒收：直接对 pos 提交 fact.set 报 E-EFF-PARAM，state 逐位不变（pos 只许 placeSubject 写，卷十七:305）', async () => {
  const { world, avatar } = await twoLodges();
  const before = S.snap(world);
  const r = await world.submitProposal({ effects: [{ op: 'fact.set', entity: avatar, field: 'pos', value: 5 }] });
  S.assertRejected(world, before, r, 'E-EFF-PARAM');
});
