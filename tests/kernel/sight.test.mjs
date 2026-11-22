// G13（6-8）视线 losView 与方位：卷五 §4.2 规则 12–15、A5-2.2、A5-2.4；对照表 docs/迁移体检/格子G12-G16-规矩检查对照.md #38–#43、#91。
// 夹具见 perceive-world.mjs（小屋 bld_a：外墙 x 20–25、y 115–120、z=1，南墙 (23,120,1) 是门洞，屋面是格的顶面；山脊区格 (5,1) 控制点海拔 60 m）。
// 期望值按卷文定义手算成字面量（推算写在用例里）；只跑不推进世界的小检查。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, OWNERS, pos, fresh, seats, withRules } from './perceive-world.mjs';
import { losView, LAYER } from '../../server-plugin/sight.mjs';
import { alterCells } from '../../server-plugin/grid-diff.mjs';
import { gridView, regionOcclusionM, setSightCache, sightCache } from '../../server-plugin/kernel/place.mjs';
import { bearingView as bearingViewCore, RELATIVE } from '../../server-plugin/kernel/footprint.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { writeDated } from '../../server-plugin/kernel/dated.mjs';
import { installStorage } from '../../server-plugin/kernel/storage.mjs';

// 玩家 npc_p 站在区格 (0,1)，泡 = 区格 x 0–1、y 0–2（半径 1）：小屋与 (20…150,…) 一带都在泡内。
const state = () => fresh({ npc_p: { pos: pos(50, 150), species: 'species_test_a' } }, 'npc_p');
const GRID_FILE = { node: 'alterCells', file: 'grid-diff.mjs' };
const dig = (x, y, z, material) => ({ pos: pos(x, y, z), material, fixture: null, mark: null });
const cellOf = (s, x, y, z) => gridView(ENGINE, s, { w: 0, cells: { x0: x, y0: y, z0: z, x1: x, y1: y, z1: z } }).cells[0];
const clone = (v) => JSON.parse(JSON.stringify(v));

test('前提：夹具里南墙 (22,120,1) 是花岗岩实心墙、门洞 (23,120,1) 与屋内是空气、屋内格带屋面顶面；花岗岩 opaque 固栏真、玻璃固栏假', () => {
  const s = state();
  assert.equal(cellOf(s, 22, 120, 1).material, 'mat_granite');
  assert.equal(cellOf(s, 23, 120, 1).material, 'mat_air');
  assert.equal(cellOf(s, 22, 117, 1).material, 'mat_air');
  assert.notEqual(cellOf(s, 22, 117, 1).ceiling, null);
  assert.equal(cellOf(s, 40, 130, 1).material, 'mat_air');
  assert.equal(cellOf(s, 40, 130, 0).material, 'mat_soil');
});

// ---------- #39 近景：体素遍历、不透光、对称 ----------

test('#39 近景：隔着南墙看不见——(22,122,1)→(22,117,1) 沿 x=22 经过 y=121…118，其中 (22,120,1) 是实心墙：clear 假，layer 近景，blockedAt 取 fromPos 一侧第一个挡住的格 (22,120,1)', () => {
  const s = state();
  const r = losView(ENGINE, s, pos(22, 122), pos(22, 117));
  assert.deepEqual(r, { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 22, y: 120, z: 1, coarse: false } });
});

test('#39 近景：经门洞看得见——x=23 一线经过 y=121…118，(23,120,1) 是空气门洞，全是空气：clear 真、blockedAt 空', () => {
  const s = state();
  assert.deepEqual(losView(ENGINE, s, pos(23, 122), pos(23, 117)), { clear: true, layer: LAYER.near, blockedAt: null });
});

test('#39 近景：同一屋里水平看，屋面不挡——屋内格有顶面，水平穿过一格不碰它的顶面（卷五 :603 顶面是格的上表面）', () => {
  const s = state();
  assert.deepEqual(losView(ENGINE, s, pos(21, 117), pos(24, 118)), { clear: true, layer: LAYER.near, blockedAt: null });
});

test('#39 近景：隔屋面看不见——(22,117,1) 正上方 (22,117,2)，穿过竖向格面时下面那一格 (22,117,1) 的屋面是花岗岩，不透光：clear 假、blockedAt (22,117,1)（单格，对换两端同一格）', () => {
  const s = state();
  const want = { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 22, y: 117, z: 1, coarse: false } };
  assert.deepEqual(losView(ENGINE, s, pos(22, 117, 1), pos(22, 117, 2)), want);
  assert.deepEqual(losView(ENGINE, s, pos(22, 117, 2), pos(22, 117, 1)), want);
});

test('#39 近景：经空气格跨层看得见——(40,130,1)→(40,130,3) 一线只有空气格、没有楼板：clear 真；隔山体岩土看不见——(40,130,1)→(40,130,-1) 中间 (40,130,0) 是土：clear 假、blockedAt (40,130,0)', () => {
  const s = state();
  assert.deepEqual(losView(ENGINE, s, pos(40, 130, 1), pos(40, 130, 3)), { clear: true, layer: LAYER.near, blockedAt: null });
  assert.deepEqual(losView(ENGINE, s, pos(40, 130, 1), pos(40, 130, -1)), { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 40, y: 130, z: 0, coarse: false } });
});

test('#39 近景：恰穿格棱格角取共棱共角全部格——(0,130,1)→(2,132,1) 两端是格中心 (0.5,130.5)、(2.5,132.5)，线段在 (1,131) 这个格角上穿过：共角的 (1,130)、(0,131) 只被擦到角、(1,131) 被对角线穿过，三者都算经过；各放一格花岗岩都挡住', () => {
  for (const [x, y] of [[1, 130], [0, 131], [1, 131]]) {
    const s = state();
    assert.equal(losView(ENGINE, s, pos(0, 130), pos(2, 132)).clear, true, '没放料前看得见');
    assert.deepEqual(runTransaction(s, GRID_FILE, (st) => alterCells(ENGINE, st, { w: 0, changes: [dig(x, y, 1, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
    assert.deepEqual(losView(ENGINE, s, pos(0, 130), pos(2, 132)), { clear: false, layer: LAYER.near, blockedAt: { w: 0, x, y, z: 1, coarse: false } }, `${x},${y}`);
  }
  // 没被碰到的格不算：线段只碰 (0,130)、(1,130)、(0,131)、(1,131)、(2,131)、(1,132)、(2,132) 这几格，(2,130) 不在其中，放料不挡。
  const t = state();
  runTransaction(t, GRID_FILE, (st) => alterCells(ENGINE, st, { w: 0, changes: [dig(2, 130, 1, 'mat_granite')], cause: { actor: 'npc_p' } }));
  assert.equal(losView(ENGINE, t, pos(0, 130), pos(2, 132)).clear, true);
});

test('A5-2.2 在 a、b 之间放一格不透光材料（alterCells）后近景 clear 由真变假，拆掉后恢复；放透明材料（玻璃，opaque 固栏假）不挡（A5-2.4：不透光只读材料行数据，不认材料名）', () => {
  const s = state();
  const a = pos(23, 122);
  const b = pos(23, 117);
  assert.equal(losView(ENGINE, s, a, b).clear, true);
  const put = (material) => runTransaction(s, GRID_FILE, (st) => alterCells(ENGINE, st, { w: 0, changes: [dig(23, 121, 1, material)], cause: { actor: 'npc_p' } }));
  assert.deepEqual(put('mat_granite'), { ok: true });
  assert.deepEqual(losView(ENGINE, s, a, b), { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 23, y: 121, z: 1, coarse: false } });
  assert.deepEqual(put('mat_air'), { ok: true });
  assert.equal(losView(ENGINE, s, a, b).clear, true);
  assert.deepEqual(put('mat_glass'), { ok: true });
  assert.equal(losView(ENGINE, s, a, b).clear, true);
});

// A5-2.2 勘误 1123k20（李白 11-23 裁乙）：对换入参时 clear、layer 逐位相同；blockedAt 允许不同，各取自己一侧（卷五 :603）。
test('#39 losView(a, b) 与 losView(b, a) 的 clear、layer 逐位相同（任意几组位置）；调用前后状态逐位不变（纯读）', () => {
  const s = state();
  const before = JSON.stringify(s);
  const pairs = [[pos(22, 122), pos(22, 117)], [pos(23, 122), pos(23, 117)], [pos(10, 100, 1), pos(30, 140, 2)], [pos(21, 117, 1), pos(24, 118, 2)], [pos(40, 130, 1), pos(40, 130, -1)], [pos(5, 5, 1), pos(80, 190, 4)]];
  for (const [a, b] of pairs) {
    const ab = losView(ENGINE, s, a, b);
    const ba = losView(ENGINE, s, b, a);
    assert.deepEqual([ab.clear, ab.layer], [ba.clear, ba.layer], `${JSON.stringify([a, b])}`);
  }
  assert.equal(JSON.stringify(s), before);
});

test('#39 blockedAt 从 fromPos 一侧数：(23,122,1)→(23,117,1) 沿 x=23 经过 y=121…118，在 (23,121,1)、(23,119,1) 各放一格花岗岩；从 (23,122) 看第一个挡住的是 (23,121,1)，对换后从 (23,117) 看是 (23,119,1)；clear、layer 两次相同', () => {
  const s = state();
  assert.deepEqual(runTransaction(s, GRID_FILE, (st) => alterCells(ENGINE, st, { w: 0, changes: [dig(23, 121, 1, 'mat_granite'), dig(23, 119, 1, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(losView(ENGINE, s, pos(23, 122), pos(23, 117)), { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 23, y: 121, z: 1, coarse: false } });
  assert.deepEqual(losView(ENGINE, s, pos(23, 117), pos(23, 122)), { clear: false, layer: LAYER.near, blockedAt: { w: 0, x: 23, y: 119, z: 1, coarse: false } });
});

// ---------- #40、#41 远景与未知 ----------

test('前提（远景）：山脊区格 (5,1) 的遮挡高是控制点海拔 60 m，两侧采样区格 (4,1)、(6,1) 低于 60 m；小屋所在区格 (0,1) 遮挡高 = (zMax + 1) × storeyM = (1 + 1) × 3 = 6 m', () => {
  const s = state();
  assert.equal(regionOcclusionM(ENGINE, s, { w: 0, region: { x: 5, y: 1 } }), 60);
  assert.ok(regionOcclusionM(ENGINE, s, { w: 0, region: { x: 4, y: 1 } }) < 60);
  assert.ok(regionOcclusionM(ENGINE, s, { w: 0, region: { x: 6, y: 1 } }) < 60);
  assert.equal(regionOcclusionM(ENGINE, s, { w: 0, region: { x: 0, y: 1 } }), 6);
  assert.equal(regionOcclusionM(ENGINE, s, { w: 9, region: { x: 0, y: 0 } }), null); // 格空间不存在：未知
});

test('#40 远景：区格 (3,1)→(7,1)，两端都在泡外走远景（layer 远景）；中间采样区格 (4,1)、(5,1)、(6,1)（n=4，步长 1，第 i 步取 3 + floor((2·4·i + 4) ÷ 8)）；眼位 = 层号 × 3 + 1.5：z=19 为 58.5 m < 山脊 60 m 挡住，z=20 为 61.5 m 高过三处采样（山脊 60、两侧 < 60）看得见（把采样区格地表抬到视线之上 clear 变假）', () => {
  const s = state();
  const at = (z) => losView(ENGINE, s, pos(350, 150, z), pos(750, 150, z));
  assert.deepEqual(at(19), { clear: false, layer: LAYER.far, blockedAt: null });
  assert.deepEqual(at(20), { clear: true, layer: LAYER.far, blockedAt: null });
  // 对称：对换两端逐位相同。
  assert.equal(JSON.stringify(losView(ENGINE, s, pos(750, 150, 20), pos(350, 150, 20))), JSON.stringify(at(20)));
});

test('#40 远景：两端区格相邻或同区格没有中间采样，clear 真；采样数超过 farSightMaxSamples（这里 2，需要 3）为未知 null，不拿别的量顶替；farSightStepRegionCells 为 3 时只取第 3 步 (6,1)，(5,1) 的山脊不在采样里', () => {
  const s = state();
  assert.equal(losView(ENGINE, s, pos(350, 150, 1), pos(450, 150, 1)).clear, true); // 区格 (3,1)→(4,1)：n=1，没有采样
  const tight = withRules(ENGINE, { grid: { ...ENGINE.rules.grid, farSightMaxSamples: 2 } });
  assert.deepEqual(losView(tight, s, pos(350, 150, 1), pos(750, 150, 1)), { clear: null, layer: LAYER.far, blockedAt: null });
  const wide = withRules(ENGINE, { grid: { ...ENGINE.rules.grid, farSightStepRegionCells: 3 } });
  // 步长 3 只取第 3 步 = 区格 (6,1)（遮挡高 < 58.5，见前提的 < 60 与实测在 56 m 上下，这里只核性质）：z=19（眼位 58.5 m）步长 1 时被山脊 (5,1) 的 60 m 挡住，步长 3 时山脊不在采样里。
  assert.equal(losView(ENGINE, s, pos(350, 150, 19), pos(750, 150, 19)).clear, false);
  assert.equal(losView(wide, s, pos(350, 150, 19), pos(750, 150, 19)).clear, true);
});

test('#41 层的选择只由两端在不在泡内定：区格 (0,1)、(1,1) 内两端走近景；一端在泡外走远景；两端都在泡外走远景；玩家移到区格 (5,1) 后同一对位置改走近景（复演同一时刻同一层）', () => {
  const s = state();
  assert.equal(losView(ENGINE, s, pos(10, 110), pos(150, 150)).layer, LAYER.near);
  assert.equal(losView(ENGINE, s, pos(10, 110), pos(450, 150)).layer, LAYER.far);
  assert.equal(losView(ENGINE, s, pos(350, 150), pos(450, 150)).layer, LAYER.far);
  s.created.npc_p.props.pos = pos(550, 150);
  assert.equal(losView(ENGINE, s, pos(450, 150, 20), pos(650, 150, 20)).layer, LAYER.near); // 区格 (4,1)、(6,1) 都在泡内（半径 1）
  assert.equal(losView(ENGINE, s, pos(10, 110), pos(150, 150)).layer, LAYER.far); // 泡走了，原来的近景位置现在是远景
});

test('#41 不在同一格空间：clear 为 null、blockedAt 为 null（A5-2.4 跨空间一律未知）；新增格空间 w1 里视线照常可用（只加数据）', () => {
  const s = state();
  assert.deepEqual(losView(ENGINE, s, pos(22, 122, 1, 0), pos(22, 117, 1, 1)), { clear: null, layer: LAYER.far, blockedAt: null });
  // w1：玩家 npc_q 站在 w1 区格 (2,2)（cell 250,250），其周围泡内，平地、无建筑：近景全空气 clear 真。
  const two = fresh({ npc_p: { pos: pos(50, 150), species: 'species_test_a' }, npc_q: { pos: pos(250, 250, 1, 1), species: 'species_test_a' } }, null);
  two.holdings = { ...seats('npc_p'), ...seats('npc_q') };
  assert.deepEqual(losView(ENGINE, two, pos(240, 240, 1, 1), pos(260, 255, 1, 1)), { clear: true, layer: LAYER.near, blockedAt: null });
  assert.equal(losView(ENGINE, two, pos(22, 122, 1, 0), pos(22, 117, 1, 0)).clear, false); // w0 照旧
  assert.throws(() => losView(ENGINE, two, { w: 0, x: 1, y: 1, z: 1 }, pos(2, 2)), /E-DIM-STRUCT-FIELD/);
});

// ---------- #42 视线缓存是投影 ----------

test('#42 缓存是投影：开关缓存、中途清空，losView 结果逐位相同；缓存不进状态（调用前后状态序列化逐位相同）；差分变了近景结果跟着变（近景读差分、不缓存）', () => {
  const s = state();
  const before = JSON.stringify(s);
  const calls = () => [losView(ENGINE, s, pos(350, 150, 19), pos(750, 150, 19)), losView(ENGINE, s, pos(350, 150, 20), pos(750, 150, 20)), losView(ENGINE, s, pos(22, 122), pos(22, 117)), losView(ENGINE, s, pos(23, 122), pos(23, 117))];
  try {
    setSightCache(true);
    const on = JSON.stringify(calls());
    assert.ok(sightCache(ENGINE, s).size > 0, '开着时远景结果进缓存');
    assert.equal(JSON.stringify(calls()), on, '命中缓存');
    setSightCache(true); // 清空
    assert.equal(sightCache(ENGINE, s).size, 0);
    assert.equal(JSON.stringify(calls()), on, '清空后从空重建');
    setSightCache(false);
    assert.equal(sightCache(ENGINE, s), null);
    assert.equal(JSON.stringify(calls()), on, '关着缓存');
    assert.equal(JSON.stringify(s), before, '缓存不进状态');
    runTransaction(s, GRID_FILE, (st) => alterCells(ENGINE, st, { w: 0, changes: [dig(23, 121, 1, 'mat_granite')], cause: { actor: 'npc_p' } }));
    assert.equal(losView(ENGINE, s, pos(23, 122), pos(23, 117)).clear, false, '差分变了近景立刻跟着变');
  } finally { setSightCache(true); }
});

test('#42 当日有效输入版本变了远景缓存失效：山脊区格 (5,1) 第 8 日起控制点海拔改 0，同一对位置 z=19（58.5 m）第 7 日被山脊挡住、第 8 日看得见，缓存不残留旧结果', () => {
  installStorage({
    ...OWNERS,
    writers: [...OWNERS.writers, { pattern: 'dshp.*.*', create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true }],
    pathTypes: { ...OWNERS.pathTypes, 'dshp.*.*': 'list<struct:datedRewrite>' },
    keyKinds: { ...OWNERS.keyKinds, 'dshp.*.*': [['place'], 'dimKey'] },
  });
  try {
    const s = state();
    s.clock.minute = 5 * 1440;
    assert.deepEqual(runTransaction(s, { node: 'view:shaper', file: 'sys/shaper.mjs' }, (st) => writeDated(ENGINE, st, 'dshp.loc_ridge.anchorElevationM', { fromDay: 8, value: 0, cause: 'evt_quake' })), { ok: true });
    const at = (day) => { s.clock.minute = day * 1440; return losView(ENGINE, s, pos(350, 150, 19), pos(750, 150, 19)).clear; };
    assert.equal(at(7), false);
    assert.equal(at(8), true);
    assert.equal(at(7), false, '回到第 7 日仍是旧结果（缓存按输入版本分，不串）');
  } finally { installStorage(OWNERS); }
});

// ---------- #38、#91 方位角与前后左右（卷五 规则 12、13；bearingView 已落 G3，这里补朝向全表与边界、上下） ----------

const GRID = ENGINE.rules.grid;
const P = (x, y, z = 0) => ({ w: 0, x, y, z, coarse: false });

test('#38 朝向正东（2）的人看正北的点得"左"；朝北（0）看正东得"右"（卷五 :602、A5-2.2）', () => {
  assert.equal(bearingViewCore(GRID, P(0, 0), P(0, 10), 2).relative, 'left');
  assert.equal(bearingViewCore(GRID, P(0, 0), P(10, 0), 0).relative, 'right');
});

test('#91 八向全表：方位 d（北 0、东北 1 … 西北 7，45 度整数倍）与朝向 k，相对方位下标 = (d − k) mod 8，依次为 前、右前、右、右后、后、左后、左、左前（8 × 8 = 64 个组合）', () => {
  const dirs = [[0, 10], [10, 10], [10, 0], [10, -10], [0, -10], [-10, -10], [-10, 0], [-10, 10]]; // 北、东北、东、东南、南、西南、西、西北
  assert.deepEqual(RELATIVE, ['front', 'frontRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'frontLeft']);
  for (let d = 0; d < 8; d += 1) {
    for (let k = 0; k < 8; k += 1) {
      const r = bearingViewCore(GRID, P(0, 0), P(dirs[d][0], dirs[d][1]), k);
      assert.equal(r.bearingDeg, d * 45, `d=${d}`);
      assert.equal(r.relative, RELATIVE[(((d - k) % 8) + 8) % 8], `d=${d} k=${k}`);
    }
  }
});

test('#91 扇区边界归顺时针的下一扇区：把朝向档数换成 4（纯函数，每档 90 度）时东北方位 45 度恰在朝向 0 的 0 档与 1 档的分界上（相对角 45 = 半档），归下一扇区（下标 1）；相对角 135 同理归下标 2', () => {
  const g4 = { ...GRID, facingDirections: 4 };
  assert.equal(bearingViewCore(g4, P(0, 0), P(10, 10), 0).relative, RELATIVE[1]);
  assert.equal(bearingViewCore(g4, P(0, 0), P(10, -10), 0).relative, RELATIVE[2]); // 方位 135
});

test('#91 上下另看层号差：b 的层号大于 a 为"上"，小于为"下"，相等为同层；平面重合时方位未知（null）', () => {
  assert.equal(bearingViewCore(GRID, P(0, 0, 1), P(5, 5, 3), 0).vertical, 'up');
  assert.equal(bearingViewCore(GRID, P(0, 0, 3), P(5, 5, 1), 0).vertical, 'down');
  assert.equal(bearingViewCore(GRID, P(0, 0, 2), P(5, 5, 2), 0).vertical, 'level');
  assert.equal(bearingViewCore(GRID, P(0, 0, 1), P(0, 0, 3), 0), null);
});
