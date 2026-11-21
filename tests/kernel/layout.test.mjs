// 格子迁移 G11《起始地区蓝图与布局数据》第一提交：落位纯函数卡内测试（kernel/layout.mjs：layoutOf、defaultFacing）。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 72、73 行与待定 9；卷十 R10-7.11（落位六点）、R10-3.12、A10-7.2；卷十九 §4.5 规则 11。
// 期望值按卷文规则手算成字面量，推算写在各用例注释；夹具常数（regionCellM 20、gapCells 2）只是测试前提，不读仓库此刻的计数。
// 夹具格空间取 regionCellM 20、cellM 1（区格边 20 个细格，便于手算）；站点 coord 在区格 (0,0) 中心 (10, 10) 米。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { layoutOf, defaultFacing, REASON } from '../../server-plugin/kernel/layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装配定点常数
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const GRID = Object.freeze({ cellM: 1, regionCellM: 20, facingDirections: 8 });
const GAP = 2;
const BOX3 = Object.freeze({ dx0: 0, dy0: 0, dx1: 2, dy1: 2 }); // 3 × 3 的外包，锚点在西南角
const cells = (list) => list.map(([x, y]) => ({ x, y }));
const bld = (key, ordinal, extra = {}) => ({ key, ordinal, role: 'r', handWritten: true, facing: 0, bbox: BOX3, ...extra });
const site = (extra = {}) => ({ siteId: 'loc_site', coord: { x: 10, y: 10 }, cellCount: 1, gapCells: GAP, regionCells: cells([[0, 0]]), zones: [], buildings: [], ...extra });
const zone = (id, role, need, target, adjacent = []) => ({ id, role, adjacent, needCells: need, targetCells: target });
const anchorsOf = (r) => Object.fromEntries(r.buildings.map((b) => [b.key, [b.anchor.x, b.anchor.y]]));
const throwsDomain = (fn) => assert.throws(fn, (e) => e && e.code === 'E-DET-DOMAIN');

// ---------- 朝向（卷十九 §4.5 规则 11） ----------

test('defaultFacing：意图 > 文化偏好 > 面向赤道（纬度 ≥ 0 取每圈档数的一半 4，否则 0），都取偶数；越域拒收', () => {
  // 八向、每个四分之一圈 2 档。意图 3 → 向下取偶 2；文化 5 → 4；纬度 31 → 8 ÷ 2 = 4；纬度 −5 → 0；纬度 0 算"不小于 0" → 4。
  assert.equal(defaultFacing(GRID, { intentFacing: 3, culturePref: 6, latitudeDeg: 31 }), 2);
  assert.equal(defaultFacing(GRID, { intentFacing: null, culturePref: 5, latitudeDeg: 31 }), 4);
  assert.equal(defaultFacing(GRID, { intentFacing: null, culturePref: null, latitudeDeg: 31 }), 4);
  assert.equal(defaultFacing(GRID, { intentFacing: null, culturePref: null, latitudeDeg: -5 }), 0);
  assert.equal(defaultFacing(GRID, { intentFacing: null, culturePref: null, latitudeDeg: 0 }), 4);
  assert.equal(defaultFacing(GRID, { intentFacing: 0, culturePref: 6, latitudeDeg: 31 }), 0); // 意图给了 0 就取 0，不被"空"跳过
  throwsDomain(() => defaultFacing(GRID, { intentFacing: 8, culturePref: null, latitudeDeg: 0 }));
  throwsDomain(() => defaultFacing(GRID, { intentFacing: -1, culturePref: null, latitudeDeg: 0 }));
  throwsDomain(() => defaultFacing({ ...GRID, facingDirections: 6 }, { intentFacing: null, culturePref: null, latitudeDeg: 0 }));
  throwsDomain(() => defaultFacing(GRID, { intentFacing: null, culturePref: null, latitudeDeg: Number.NaN }));
});

// ---------- 行架（R10-7.11 第 4 点；#72） ----------

test('行架手算：区格 (0,0) 一片、gapCells 2、四栋 3×3 手写行（无锚点）：(2,2)、(7,2)、(12,2)、(2,7)', () => {
  // 分片外包 x、y 皆 0..19。游标从 (0,0) 起，行 y=0：外扩 2 后落到 y=−2，出了足迹，每个 x 都失败；x 到 16 时 16 + 3 − 1 + 2 = 20 > 19，行到头，
  // 行距 = 本行已放各栋 b 的最大值（尚无，0）+ gapCells 2 → 换行 y = 2、x 回 0。y=2：x=0、1 外扩出界；x=2 外扩 [0..6]×[0..6] 在足迹内 → 放 (2,2)，外包 [2..4]×[2..4]；
  // 游标挪过 a + gap = 5 格到 x=7。第二栋：外扩 [5..11] 在内；它与第一栋外包外扩 2（[0..6]）不相交（7 > 4 + 2）→ (7,2)，游标 12。第三栋 (12,2)，游标 17。
  // 第四栋：17 + 2 + 2 = 21 > 19 行到头，行距 = 本行已放各栋 b 的最大值 3 + 2 = 5 → 换行 y = 2 + 5 = 7，x 回 0；x=2 外扩 [0..6]×[5..11] 在内，与第一栋外扩（y 至 6）不相交（7 > 4 + 2）→ (2,7)。
  const r = layoutOf(GRID, site({ buildings: [bld('b3', 3), bld('b0', 0), bld('b2', 2), bld('b1', 1)] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.buildings.map((b) => b.key), ['b0', 'b1', 'b2', 'b3']); // 次序按 ordinal 升序
  assert.deepEqual(anchorsOf(r), { b0: [2, 2], b1: [7, 2], b2: [12, 2], b3: [2, 7] });
  assert.deepEqual(r.buildings[0].rect, { x0: 2, y0: 2, x1: 4, y1: 4 });
  assert.equal(r.buildings[0].zone, null); // 不分片的站点：整个站点足迹当一个分片
  assert.equal('z' in r.buildings[0].anchor, false); // 没交地表层读法就不带 z
});

test('锚点 = 所选矩形的西南角减去蓝图外包偏移（旋转后的外包不在原点上时）；宽深取 bbox', () => {
  // 外包 dx −2..0（宽 3）、dy 0..5（深 6）：一栋放在行架上第一个可放处。外扩 2 须在足迹内：x0 ≥ 2、y0 ≥ 2；深 6 → y1 = 7，7 + 2 = 9 ≤ 19。第一个可放的矩形是 x0=2、y0=2。
  // 锚点 = (x0 − dx0, y0 − dy0) = (2 − (−2), 2 − 0) = (4, 2)。
  const r = layoutOf(GRID, site({ buildings: [bld('a', 0, { bbox: { dx0: -2, dy0: 0, dx1: 0, dy1: 5 }, facing: 2 })] }));
  assert.deepEqual(r.buildings[0].rect, { x0: 2, y0: 2, x1: 4, y1: 7 });
  assert.deepEqual([r.buildings[0].anchor.x, r.buildings[0].anchor.y], [4, 2]);
  assert.equal(r.buildings[0].facing, 2); // facing 原样带回，不由 layoutOf 改
});

test('锚点 z：调用方交入读地表层号的函数时随结果带回；读不到（null）也原样带回，不顶替', () => {
  const r = layoutOf(GRID, site({ buildings: [bld('a', 0), bld('b', 1)], surfaceStoreyAt: (x, y) => (x === 2 ? 5 : null) }));
  assert.equal(r.buildings[0].anchor.z, 5);
  assert.equal(r.buildings[1].anchor.z, null);
});

test('障碍：带 anchor 的手写建筑只占位不被改动，后排各行绕开；打乱输入次序结果不变', () => {
  // 障碍锚点 (2,2) → 外包 [2..4]×[2..4]。第一栋候选 y=2 行：x=2..6 都与障碍外扩 2（[0..6]）相交，x=7 起不相交（7 > 4 + 2）→ (7,2)；第二栋游标 12 → (12,2)。
  const o = bld('obs', 0, { anchor: { x: 2, y: 2 } });
  const a = layoutOf(GRID, site({ buildings: [o, bld('n1', 2), bld('n0', 1)] }));
  assert.deepEqual(anchorsOf(a), { n0: [7, 2], n1: [12, 2] });
  assert.equal(a.buildings.some((b) => b.key === 'obs'), false); // 障碍不在结果里（它的锚点是作者的，不改）
  const b = layoutOf(GRID, site({ buildings: [bld('n1', 2), bld('n0', 1), o] }));
  assert.deepEqual(a, b);
});

test('两遍：缺锚点的手写行先排，再排其余清单行；清单行 ordinal 再小也排在手写行之后', () => {
  // 清单行 m0（ordinal 0，非手写）与手写行 h5（ordinal 5）：手写行先排 → h5 (2,2)；m0 第二个 → (7,2)。
  const r = layoutOf(GRID, site({ buildings: [bld('m0', 0, { handWritten: false }), bld('h5', 5)] }));
  assert.deepEqual(r.buildings.map((b) => b.key), ['h5', 'm0']);
  assert.deepEqual(anchorsOf(r), { h5: [2, 2], m0: [7, 2] });
});

test('试排与物化逐格相同（A10-7.2、#73）：缺锚点的手写行补写锚点之后，物化时它们作障碍，清单行得到与试排完全相同的锚点（多行换行也相同）', () => {
  // 试排：五栋手写行（无锚点）+ 三栋清单行，同一片 20 × 20：第一遍手写行占 (2,2)、(7,2)、(12,2)、(2,7)、(7,7)（行架手算同上例，第二行 y = 2 + 3 + 2 = 7）；
  // 第二遍游标回到西南角、手写行已是障碍：y=2、4、6 三行都被第一行的障碍（外扩 2 到 y=6）挡住，换行到 y=8（8 > 4 + 2 且行 2 的障碍 y 7..9 外扩到 11，x 要错开）：
  // x=2、7 被行 2 的障碍挡住；x=12（12 > 9 + 2）可放 → (12,8)，游标 17；17 + 2 + 2 = 21 > 19 行到头，换行 y = 8 + 3 + 2 = 13（行距取本遍本行已放各栋 b 的最大值 3 + 2）→ (2,13)，再 (7,13)。
  const hand = [0, 1, 2, 3, 4].map((i) => bld(`h${i}`, i));
  const manifest = [5, 6, 7].map((i) => bld(`m${i}`, i, { handWritten: false }));
  const trial = layoutOf(GRID, site({ buildings: [...hand, ...manifest] }));
  assert.equal(trial.ok, true);
  assert.deepEqual(anchorsOf(trial), { h0: [2, 2], h1: [7, 2], h2: [12, 2], h3: [2, 7], h4: [7, 7], m5: [12, 8], m6: [2, 13], m7: [7, 13] });
  // 物化：手写行带着补写的锚点（障碍），只排清单行。
  const written = hand.map((h) => ({ ...h, anchor: { x: anchorsOf(trial)[h.key][0], y: anchorsOf(trial)[h.key][1] } }));
  const built = layoutOf(GRID, site({ buildings: [...written, ...manifest] }));
  assert.deepEqual(anchorsOf(built), { m5: [12, 8], m6: [2, 13], m7: [7, 13] });
});

test('排不下：区格太小放不下一栋（宽 17 + 两侧各 2 > 20）报 layout_no_fit，不截断不放过', () => {
  const wide = { dx0: 0, dy0: 0, dx1: 16, dy1: 2 }; // 宽 17：x0 ≥ 2 且 x0 + 16 + 2 ≤ 19 → x0 ≤ 1，无解
  const r = layoutOf(GRID, site({ buildings: [bld('w', 0, { bbox: wide })] }));
  assert.deepEqual([r.ok, r.reason], [false, REASON.noFit]);
  const ok = layoutOf(GRID, site({ buildings: [bld('w', 0, { bbox: { dx0: 0, dy0: 0, dx1: 15, dy1: 2 } })] })); // 宽 16：x0 = 2，2 + 15 + 2 = 19 恰在足迹内
  assert.equal(ok.ok, true);
  assert.deepEqual(anchorsOf(ok), { w: [2, 2] });
});

// ---------- 站点区格与分片（R10-7.11 第 1、2 点；#72、#75） ----------

test('分片种子与划分：S = {(0,0),(1,0)}、两角色各 1 格：种子按距离次序 (0,0)、(1,0)，坐标取区格中心米，分片足迹各一格，相邻成立', () => {
  // S 按（到 coord (10,10) 的平方距离，区格序号）排：(0,0) 中心 (10,10) 距 0；(1,0) 中心 (30,10) 距 400 → 列 [(0,0),(1,0)]。Z=2：第 0 个角色取第 floor(0×2÷2)=0 项，第 1 个取第 floor(1×2÷2)=1 项。
  const zones = [zone('z_a', 'a', 1, 1, ['b']), zone('z_b', 'b', 1, 1, ['a'])];
  const r = layoutOf(GRID, site({ cellCount: 2, regionCells: cells([[1, 0], [0, 0]]), zones, buildings: [bld('ba', 0, { role: 'a' }), bld('bb', 0, { role: 'b' })] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.zones.map((z) => [z.role, z.seed, z.coord, z.targetCells, z.cells]), [
    ['a', { x: 0, y: 0 }, { x: 10, y: 10 }, 1, cells([[0, 0]])],
    ['b', { x: 1, y: 0 }, { x: 30, y: 10 }, 1, cells([[1, 0]])],
  ]);
  // 各归各片：a 在区格 (0,0)（x 0..19）→ (2,2)；b 在区格 (1,0)（x 20..39）：外扩 2 须 x0 − 2 ≥ 20 → x0 = 22，y0 = 2 → (22,2)。
  assert.deepEqual(anchorsOf(r), { ba: [2, 2], bb: [22, 2] });
});

test('归属片放不下时按模板次序试其余分片：b 片宽 40（两格）放得下、a 片宽 20 放不下一栋宽 17 的', () => {
  // S = {(0,0),(1,0),(2,0)}，Z=2：列 [(0,0),(1,0),(2,0)]（距离 0、400、1600）；种子第 0 个取 floor(0)=0 项 (0,0)，第 1 个取 floor(1×3÷2)=1 项 (1,0)。
  // a 目标 1 格 {(0,0)}；b 目标 2 格，从 (1,0) 向邻格 (2,0) 长一格（(0,0) 已是 a 的）→ {(1,0),(2,0)}，外包 x 20..59。
  // 宽 17 的建筑归 a：a 片 x 0..19，x0 ≥ 2 且 x0 + 16 + 2 ≤ 19 无解 → 试 b 片：x0 ≥ 22，22 + 16 + 2 = 40 ≤ 59 → (22,2)，zone 序号 1。
  const zones = [zone('z_a', 'a', 1, 1), zone('z_b', 'b', 1, 2)];
  const wide = { dx0: 0, dy0: 0, dx1: 16, dy1: 2 };
  const r = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[0, 0], [1, 0], [2, 0]]), zones, buildings: [bld('w', 0, { role: 'a', bbox: wide })] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.zones[1].cells, cells([[1, 0], [2, 0]]));
  assert.equal(r.buildings[0].zone, 1);
  assert.deepEqual(anchorsOf(r), { w: [22, 2] });
});

test('非矩形站点：外包框内不属于 S 的格不进任何分片（补集占位）：S = {(0,0),(1,0),(1,1)}、一片目标 3 格', () => {
  // 外包 2 × 2，(0,1) 不在 S。种子取列首项 (0,0)；候选邻格 (1,0)（距 1）与 (0,1)（距 1，但不在 S、不可取）→ 先 (1,0)，再从 (1,0) 到 (1,1) → {(0,0),(1,0),(1,1)}。
  // 若不占住补集，并列的 (0,1)（x 小）会先被取走，结果会是 {(0,0),(0,1),(1,0)}。
  const r = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[1, 1], [0, 0], [1, 0]]), zones: [zone('z_a', 'a', 3, 3)] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.zones[0].cells, cells([[0, 0], [1, 0], [1, 1]]));
});

test('排不下的三种原因：站点区格不足、分片区格数不足 need、模板相邻要求不成立', () => {
  // ① |S| = 2 < N = 3：layout_site_too_small。
  const small = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[0, 0], [1, 0]]), zones: [zone('z_a', 'a', 1, 3)] }));
  assert.deepEqual([small.ok, small.reason], [false, REASON.siteTooSmall]);
  // ② S = {(0,0),(1,0),(2,0)}，两角色 a（需 2 格，目标 2）与 b（1 格）：种子 (0,0)、(1,0)；a 的邻格 (1,0) 已是 b 的、(−1,0) 在外包框外 → a 只有 1 格 < need 2：layout_zone_too_small。
  const tight = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[0, 0], [1, 0], [2, 0]]), zones: [zone('z_a', 'a', 2, 2), zone('z_b', 'b', 1, 1)] }));
  assert.deepEqual([tight.ok, tight.reason], [false, REASON.zoneTooSmall]);
  // ③ 三角色各 1 格排成 (0,0)、(1,0)、(2,0)（种子取第 floor(i×3÷3) = i 项）：a 要求与 c 相邻，但 (0,0) 与 (2,0) 不四邻接：layout_not_adjacent。
  const apart = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[0, 0], [1, 0], [2, 0]]), zones: [zone('z_a', 'a', 1, 1, ['c']), zone('z_b', 'b', 1, 1), zone('z_c', 'c', 1, 1)] }));
  assert.deepEqual([apart.ok, apart.reason], [false, REASON.notAdjacent]);
  // 同样三角色、a 只要求与 b 相邻 → 成立。
  const near = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[0, 0], [1, 0], [2, 0]]), zones: [zone('z_a', 'a', 1, 1, ['b']), zone('z_b', 'b', 1, 1), zone('z_c', 'c', 1, 1)] }));
  assert.equal(near.ok, true);
});

// ---------- 不变量与确定性（A10-7.2；#72、#75） ----------

test('不变量：二十栋大小不一的建筑排进两片：每栋外扩 gapCells 后全在所属片足迹内，两两外扩 gapCells 后不相交，锚点反推回矩形；同输入两次相同、打乱输入次序相同', () => {
  // S = 区格 (0,0)..(3,0) 一排，Z=2：种子取列（距离 0、400、1600、3600）的第 0 项 (0,0) 与第 floor(1×4÷2)=2 项 (2,0)；z_a 先长到 (1,0)，z_b 再长（(1,0) 已被占，取 (3,0)）。
  // → a 片 {(0,0),(1,0)}（x 0..39）、b 片 {(2,0),(3,0)}（x 40..79），各 40 × 20 细格，相邻于 (1,0)–(2,0)。
  const zones = [zone('z_a', 'a', 1, 2, ['b']), zone('z_b', 'b', 1, 2, ['a'])];
  const sizes = [[3, 3], [4, 3], [5, 4], [3, 5], [6, 3], [4, 4], [3, 3], [5, 3], [4, 5], [3, 4]];
  const list = [];
  for (let i = 0; i < 20; i += 1) {
    const [a, d] = sizes[i % sizes.length];
    list.push(bld(`b${String(i).padStart(2, '0')}`, i, { role: i % 2 === 0 ? 'a' : 'b', handWritten: i % 3 === 0, bbox: { dx0: -1, dy0: 0, dx1: a - 2, dy1: d - 1 } }));
  }
  const base = { cellCount: 4, regionCells: cells([[0, 0], [1, 0], [2, 0], [3, 0]]), zones };
  const r1 = layoutOf(GRID, site({ ...base, buildings: list }));
  const r2 = layoutOf(GRID, site({ ...base, buildings: list }));
  const shuffled = [...list].reverse();
  const r3 = layoutOf(GRID, site({ ...base, buildings: shuffled }));
  assert.equal(r1.ok, true);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1, r3);
  const inZone = (zc, x0, y0, x1, y1) => {
    const set = new Set(zc.map((c) => `${c.x},${c.y}`));
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (!set.has(`${Math.floor(x / 20)},${Math.floor(y / 20)}`)) return false;
    return true;
  };
  assert.equal(r1.buildings.length, 20);
  for (const b of r1.buildings) {
    const src = list.find((s) => s.key === b.key);
    assert.deepEqual(b.rect, { x0: b.anchor.x + src.bbox.dx0, y0: b.anchor.y + src.bbox.dy0, x1: b.anchor.x + src.bbox.dx1, y1: b.anchor.y + src.bbox.dy1 }); // 锚点使外包恰落在所选矩形上
    assert.equal(inZone(r1.zones[b.zone].cells, b.rect.x0 - GAP, b.rect.y0 - GAP, b.rect.x1 + GAP, b.rect.y1 + GAP), true, `${b.key} with gap inside its zone`);
  }
  for (let i = 0; i < r1.buildings.length; i += 1) {
    for (let j = i + 1; j < r1.buildings.length; j += 1) {
      const p = r1.buildings[i].rect;
      const q = r1.buildings[j].rect;
      const apart = q.x1 < p.x0 - GAP || q.x0 > p.x1 + GAP || q.y1 < p.y0 - GAP || q.y0 > p.y1 + GAP;
      assert.equal(apart, true, `${r1.buildings[i].key} and ${r1.buildings[j].key} keep gapCells apart`);
    }
  }
});

test('分片目标格数之和等于 N；每片至少一格（need ≥ 1）；站点不分片时 zones 为空', () => {
  const r = layoutOf(GRID, site({ cellCount: 3, regionCells: cells([[0, 0], [1, 0], [2, 0]]), zones: [zone('z_a', 'a', 1, 1), zone('z_b', 'b', 1, 2)] }));
  assert.equal(r.zones.reduce((s, z) => s + z.targetCells, 0), 3);
  assert.equal(r.zones.every((z) => z.cells.length >= 1), true);
  assert.deepEqual(layoutOf(GRID, site()).zones, []);
});

// ---------- 输入拒收（特殊值不绕过） ----------

test('输入拒收：gapCells 0、N 0、重复区格、建筑 key 重复、角色不在模板内、目标和不等于 N、bbox 倒置、zones 里角色重复，一律 E-DET-DOMAIN', () => {
  throwsDomain(() => layoutOf(GRID, site({ gapCells: 0 })));
  throwsDomain(() => layoutOf(GRID, site({ cellCount: 0 })));
  throwsDomain(() => layoutOf(GRID, site({ regionCells: cells([[0, 0], [0, 0]]), cellCount: 1 })));
  throwsDomain(() => layoutOf(GRID, site({ buildings: [bld('a', 0), bld('a', 1)] })));
  throwsDomain(() => layoutOf(GRID, site({ zones: [zone('z', 'a', 1, 1)], buildings: [bld('a', 0, { role: 'zz' })] })));
  throwsDomain(() => layoutOf(GRID, site({ cellCount: 2, regionCells: cells([[0, 0], [1, 0]]), zones: [zone('z', 'a', 1, 1)] })));
  throwsDomain(() => layoutOf(GRID, site({ buildings: [bld('a', 0, { bbox: { dx0: 2, dy0: 0, dx1: 1, dy1: 2 } })] })));
  throwsDomain(() => layoutOf(GRID, site({ cellCount: 2, regionCells: cells([[0, 0], [1, 0]]), zones: [zone('z1', 'a', 1, 1), zone('z2', 'a', 1, 1)] })));
  throwsDomain(() => layoutOf({ cellM: 3, regionCellM: 20, facingDirections: 8 }, site())); // 区格边不是细格边的整数倍
});
