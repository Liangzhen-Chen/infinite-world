// S2-P 位置写者黑盒验收：落位与初次朝向（卷十七:288、卷十七:304、卷五:495）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-p/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('1a. 落脚处候选恰为开放地点子树里的建筑（候选从 world 数据推出）', async () => {
  const { world } = await S.freshWorld();
  const offered = [...S.lodgeOffer(world)].sort();
  assert.deepEqual(offered, S.expectedLodges(S.PLACE_ROWS), '落脚处候选应与数据推出的开放子树建筑集合相同');
  assert.ok(offered.length > 0, '前提：数据中应有开放子树里的建筑');
});

test('1c. 被许可条件筛掉的开放建筑（accessClass 的 needsGrant 为真，如私宅）不在候选里；其余开放建筑都在（两向）', async () => {
  const { world } = await S.freshWorld();
  const offered = S.lodgeOffer(world);
  const restricted = S.grantRestrictedLodges(S.PLACE_ROWS);
  assert.ok(restricted.length > 0, '前提：数据中应有 needsGrant 为真的开放建筑（私宅）');
  for (const k of restricted) assert.equal(offered.includes(k), false, `被筛掉的 ${k} 不应在落脚处候选里`);
  const open = S.expectedLodges(S.PLACE_ROWS).length + restricted.length;
  const allOpen = Object.keys(S.PLACE_ROWS).filter((k) => S.isBuilding(k) && S.isUnderOpen(S.PLACE_ROWS, k));
  assert.equal(allOpen.length, open, '开放建筑 = 候选 + 被筛（无遗漏、无重复）');
  for (const k of allOpen.filter((x) => !restricted.includes(x))) assert.equal(offered.includes(k), true, `未被筛的开放建筑 ${k} 应在候选里`);
});

test('1b. 对每个落脚处候选各开一局：化身 pos 为代表格（coarse 为真），here.place 即所选建筑', async () => {
  const probe = await S.freshWorld();
  const count = S.lodgeOffer(probe.world).length;
  for (let i = 0; i < count; i++) {
    const { world, avatar, lodge } = await S.startAt(i);
    const pos = S.posOf(world, avatar);
    assert.ok(pos && typeof pos === 'object', `候选 ${lodge} 的化身应有 pos`);
    assert.equal(pos.coarse, true, `候选 ${lodge} 的化身 pos 应为泡外代表格（coarse 为真，Q4 甲）`);
    assert.equal(S.hereOf(world, avatar)?.place, lodge, `候选 ${lodge} 的化身 here.place 应为所选建筑（卷五规则 12 zoneAt）`);
  }
});

test('2a. 初次朝向取目标地点的 facing 维度（建筑必填，缺则 rules.travel.initialFacing）', async () => {
  const probe = await S.freshWorld();
  const count = S.lodgeOffer(probe.world).length;
  for (let i = 0; i < count; i++) {
    const { world, avatar, lodge } = await S.startAt(i);
    const f = S.facingOf(world, avatar);
    assert.equal(Number.isInteger(f), true, `候选 ${lodge} 的化身 facing 应为整数`);
    assert.ok(f >= 0 && f < S.FACING_DIRECTIONS, `facing 应在 [0, ${S.FACING_DIRECTIONS}) 内`);
    assert.equal(f, S.initialFacingOf(lodge), `候选 ${lodge} 的初次朝向应等于目标地点的 facing（卷十七:304，Q7 甲）`);
  }
});

test('2b. 同一世界、同一串输入两次开局：pos 与 facing 逐位相同（确定性）', async () => {
  const a = await S.startAt(0);
  const b = await S.startAt(0);
  assert.equal(S.canon(S.posOf(a.world, a.avatar)), S.canon(S.posOf(b.world, b.avatar)), '两次开局的 pos 应逐位相同');
  assert.equal(S.facingOf(a.world, a.avatar), S.facingOf(b.world, b.avatar), '两次开局的 facing 应相同');
});
