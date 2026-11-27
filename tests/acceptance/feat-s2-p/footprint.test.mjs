// S2-P 位置写者黑盒验收：建筑足迹的加载核对与开放范围的数据扩展（卷五:462 规则 3、卷五:495 规则 11、ctr_settlement_subzone）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-p/出题.md。
// 两条都用夹具（副本里只改数据）：本卡不新造接口，全部经 index.mjs#init 装配。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const PLACE_JSON = 'world/ontology/dimensions/place.json';

test('6a. 对照：未改数据的副本装配成功，落脚处候选与数据推出的集合一致', async () => {
  const fx = S.copyFixture();
  const world = await S.bootFixture(fx);
  assert.deepEqual([...S.lodgeOffer(world)].sort(), S.expectedLodges(S.PLACE_ROWS), '未改数据时候选应与基线一致');
});

test('6b. 夹具：同父两栋建筑的足迹重叠，加载即报 E-GRID-SIBLING-OVERLAP（子 ⊆ 父、兄弟不相交）', async () => {
  const pair = S.BUILDING_IDS.flatMap((a) => S.BUILDING_IDS
    .filter((b) => b !== a && S.PLACE_ROWS[b].parent === S.PLACE_ROWS[a].parent && S.GENERATED[a] && S.GENERATED[b])
    .map((b) => [a, b]))[0];
  assert.ok(pair, '前提：数据中应有同父且都已生成足迹的两栋建筑');
  const [a, b] = pair;
  const fx = S.copyFixture();
  S.editJson(fx, PLACE_JSON, (doc) => {
    // 把 b 的足迹改成与 a 完全相同：同一锚点、同一平面、同层数、同朝向，必然重叠。
    const src = doc.generated[a];
    doc.generated[b] = { ...doc.generated[b], anchor: src.anchor, planCells: src.planCells, storeys: src.storeys, facing: src.facing };
  });
  await assert.rejects(
    () => S.bootFixture(fx),
    (e) => String(/** @type {any} */ (e)?.code ?? /** @type {any} */ (e)?.message ?? e).includes('E-GRID-SIBLING-OVERLAP'),
    '重叠的兄弟建筑应使加载报 E-GRID-SIBLING-OVERLAP',
  );
});

test('6c. 夹具：把一个非开放村设为 genOpen，它的建筑即进入落脚处候选，代码不改（候选从数据推出）', async () => {
  // 找一栋不在开放子树里、且父地点也不在开放子树里的建筑；它的父地点即待开放的村。
  const b = S.BUILDING_IDS.find((k) => !S.isUnderOpen(S.PLACE_ROWS, k) && !S.needsGrantOf(S.PLACE_ROWS, k) && !S.isBuilding(S.PLACE_ROWS[k].parent ?? '') && !S.isUnderOpen(S.PLACE_ROWS, S.PLACE_ROWS[k].parent));
  assert.ok(b, '前提：数据中应有不在开放子树里的建筑');
  const village = S.PLACE_ROWS[b].parent;
  const fx = S.copyFixture();
  S.editJson(fx, PLACE_JSON, (doc) => { doc.rows[village].genOpen = true; });
  const world = await S.bootFixture(fx);
  const rows = structuredClone(S.PLACE_ROWS);
  rows[village].genOpen = true;
  const expected = S.expectedLodges(rows);
  assert.ok(expected.includes(b), '前提：开放后该建筑应进入期望候选');
  assert.deepEqual([...S.lodgeOffer(world)].sort(), expected, '开放一个村后，落脚处候选应含其建筑且与数据推出的集合一致');
});
