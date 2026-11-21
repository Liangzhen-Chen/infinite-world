// 格子迁移 G7《建筑蓝图生成》卡内测试之一：纯函数层（kernel/blueprint.mjs：planCellsOf、planBlueprint、worldCellsOf、materialsOfElements、breachesOf、openingAreasOf、checkBlueprintForms）。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 19–27、29、35 行；卷十九 §4.5 规则 7–9、§4.1 规则 2、3；手算例 §4.4.5。
// 期望值按卷文公式手算成字面量，推算写在各用例注释；不读仓库此刻的计数。夹具里的形制条目是测试前提（代号 bldform_* 只出现在本测试文件），规则表常数取 cellM 1、storeyM 3、升换立方米 0.001。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { planCellsOf, planBlueprint, planFeasible, worldCellsOf, materialsOfElements, breachesOf, openingAreasOf, checkBlueprintForms, KIND, CEILING, OPENING, REASON } from '../../server-plugin/kernel/blueprint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装配定点常数与 sqrt 表
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

// 规则常数：照 world/rules/tables/grid.json（cellM、storeyM、facingDirections）、单位表 L 的 si 与 facility.json 的 blueprint 行（卷十九给定的取值域上下限），值只作测试前提。
const LIMITS = Object.freeze({ planCellsMin: 1, storeysMin: 1, storeysMax: 64, storeyBaseMin: -8, storeyBaseMax: 0, windowEveryMax: 64, wallThicknessMaxM: 20, aspectMin: 0.125, aspectMax: 8 });
const RULES = Object.freeze({ cellM: 1, storeyM: 3, m3PerL: 0.001, facingDirections: 8, limits: LIMITS });
// 卷十九 §4.4.5 手算例的形制：walled 真、aspect 1、storeyBase 0、roofed 真、deck 假、windowEvery 4、rooms 为空。
// planSideMaxCells：形制自己登记的外包边长上限（卷十九 §2.4，封卷后勘误 1121k21）；夹具形制取 4096 只是让下面既有的大外包断言（外包出 4096 拒收、4096×1 放行）原样成立，不是全局常数。
const BASE = Object.freeze({ walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 4, rooms: [], wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 4096 });
const form = (extra = {}) => ({ ...BASE, ...extra });
const plan = (f, cells, storeys, t, facing = 0) => planBlueprint({ form: f, planCells: { widthCells: cells[0], depthCells: cells[1] }, storeys, wallThicknessM: t, facing }, RULES);
const count = (bp, pred) => bp.cells.filter(pred).length;
const kindCount = (bp, level, kind) => count(bp, (c) => c.level === level && c.kind === kind);
const at = (bp, level, u, v) => bp.cells.find((c) => c.level === level && c.u === u && c.v === v);
const throwsCode = (fn, code) => assert.throws(fn, (e) => e && e.code === code);
const SCALE = 10000n;

// ---------- planCellsOf（#20，规则 7 第 1 点） ----------

test('planCellsOf：卷十九手算例 A=36、w=1、D=6、W=6；aspect 取 [0.125, 8] 端值；越界与特殊值拒收', () => {
  // A = ceil(36 ÷ 1²) = 36；t=0.4 → w = ceil(0.4 ÷ 1) = 1，m = 2×1+1 = 3；aspect 1：D = max(3, √36) = 6，W = max(3, ceil(36÷6)) = 6。
  assert.deepEqual(planCellsOf({ form: form(), areaM2: 36, wallThicknessM: 0.4 }, RULES), { widthCells: 6, depthCells: 6 });
  // 墙厚缺省取形制 wallThicknessDefaultM（0.4）：同一结果。
  assert.deepEqual(planCellsOf({ form: form(), areaM2: 36 }, RULES), { widthCells: 6, depthCells: 6 });
  // aspect 0.125：floor(36 × 0.125) = 4，√4 = 2，D = max(3, 2) = 3，W = max(3, ceil(36 ÷ 3)) = 12。
  assert.deepEqual(planCellsOf({ form: form({ aspect: 0.125 }), areaM2: 36, wallThicknessM: 0.4 }, RULES), { widthCells: 12, depthCells: 3 });
  // aspect 8：floor(36 × 8) = 288，⌊√288⌋ = 16（16² = 256 ≤ 288 < 289），D = 16，W = max(3, ceil(36 ÷ 16) = 3) = 3。
  assert.deepEqual(planCellsOf({ form: form({ aspect: 8 }), areaM2: 36, wallThicknessM: 0.4 }, RULES), { widthCells: 3, depthCells: 16 });
  // walled 假：w = 0，m = 1：A = 1、aspect 1 → D = max(1, 1) = 1，W = max(1, 1) = 1。
  assert.deepEqual(planCellsOf({ form: form({ walled: false }), areaM2: 1, wallThicknessM: 0.4 }, RULES), { widthCells: 1, depthCells: 1 });
  // 墙厚 2.5 m → w = 3，m = 7：A = 4，√4 = 2 → D = max(7, 2) = 7，W = max(7, ceil(4 ÷ 7) = 1) = 7（最小边由墙厚定）。
  assert.deepEqual(planCellsOf({ form: form(), areaM2: 4, wallThicknessM: 2.5 }, RULES), { widthCells: 7, depthCells: 7 });
  // 越界与特殊值：aspect 出 [0.125, 8]、面积 0 与负数、外包出 4096、墙厚 0 与超过 20 都拒收，不截断、不放过。
  throwsCode(() => planCellsOf({ form: form({ aspect: 0.1 }), areaM2: 36 }, RULES), 'E-DIM-DOMAIN-RANGE');
  throwsCode(() => planCellsOf({ form: form({ aspect: 9 }), areaM2: 36 }, RULES), 'E-DIM-DOMAIN-RANGE');
  for (const area of [0, -1, Number.NaN, null]) throwsCode(() => planCellsOf({ form: form(), areaM2: area }, RULES), 'E-DET-DOMAIN');
  throwsCode(() => planCellsOf({ form: form({ aspect: 8 }), areaM2: 20000000 }, RULES), 'E-DET-DOMAIN'); // D = ⌊√(2×10⁷ × 8)⌋ = 12649 > 4096
  throwsCode(() => planCellsOf({ form: form(), areaM2: 36, wallThicknessM: 0 }, RULES), 'E-DET-DOMAIN');
  throwsCode(() => planCellsOf({ form: form(), areaM2: 36, wallThicknessM: 21 }, RULES), 'E-DET-DOMAIN');
});

test('形制登记上限（封卷后勘误 1121k21）：外包任一边超过形制 planSideMaxCells 即拒收并带字段（需要多大、上限多少），恰到上限放行；形制没登记即拒收，没有默认放大', () => {
  // 上限 8；墙厚 0.4 → w = 1；aspect 1。面积 64：A = 64，D = max(3, ⌊√64⌋ = 8) = 8，W = max(3, ceil(64 ÷ 8) = 8) = 8，恰在上限，放行。
  const f8 = form({ planSideMaxCells: 8 });
  assert.deepEqual(planCellsOf({ form: f8, areaM2: 64, wallThicknessM: 0.4 }, RULES), { widthCells: 8, depthCells: 8 });
  // 面积 65：A = 65，D = max(3, ⌊√65⌋ = 8) = 8，W = max(3, ceil(65 ÷ 8) = 9) = 9 > 8：拒收，不截断。
  const over = (fn) => { try { fn(); return null; } catch (e) { return e; } };
  const e1 = over(() => planCellsOf({ form: f8, areaM2: 65, wallThicknessM: 0.4 }, RULES));
  assert.ok(e1 && e1.code === 'E-DET-DOMAIN');
  assert.deepEqual({ ...e1.fields }, { max_cells: 8, need_depth_cells: 8, need_width_cells: 9, reason: 'plan_cells_over_form_cap' });
  // 同一面积换一条上限 9 的形制就放行：上限只来自形制条目，不是全局数。
  assert.deepEqual(planCellsOf({ form: form({ planSideMaxCells: 9 }), areaM2: 65, wallThicknessM: 0.4 }, RULES), { widthCells: 9, depthCells: 8 });
  // planBlueprint 与 planFeasible 的 planCells 同样按形制上限核：9×3 超（宽 9 > 8），8×8 放行。
  const e2 = over(() => planBlueprint({ form: f8, planCells: { widthCells: 9, depthCells: 3 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, RULES));
  assert.ok(e2 && e2.code === 'E-DET-DOMAIN');
  assert.deepEqual({ ...e2.fields }, { max_cells: 8, need_depth_cells: 3, need_width_cells: 9, reason: 'plan_cells_over_form_cap' });
  throwsCode(() => planFeasible({ form: f8, planCells: { widthCells: 3, depthCells: 9 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, RULES), 'E-DET-DOMAIN');
  assert.equal(planBlueprint({ form: f8, planCells: { widthCells: 8, depthCells: 8 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, RULES).ok, true);
  // 形制没登记上限（缺、0、非整数）：三个入口都拒收，不给默认放大。
  for (const bad of [undefined, null, 8.5]) {
    const f = form({ planSideMaxCells: bad });
    throwsCode(() => planCellsOf({ form: f, areaM2: 36 }, RULES), 'E-DIM-REQUIRED-MISSING');
    throwsCode(() => planBlueprint({ form: f, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, RULES), 'E-DIM-REQUIRED-MISSING');
    throwsCode(() => planFeasible({ form: f, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, RULES), 'E-DIM-REQUIRED-MISSING');
  }
  throwsCode(() => planCellsOf({ form: form({ planSideMaxCells: 0 }), areaM2: 36 }, RULES), 'E-DIM-DOMAIN-RANGE');
});

// ---------- 手算例整张蓝图（#22、#26、#27，卷十九 §4.4.5） ----------

test('手算例：6×6、一层、墙厚 0.4：外墙 20 格（15 墙 + 1 门 + 4 窗）、室内 16 格、屋面 16 元、设计体积 24 400 升、外壳 88、实 73、楼面 16', () => {
  const bp = plan(form(), [6, 6], 1, 0.4);
  assert.equal(bp.ok, true);
  assert.equal(bp.wallCells, 1);
  // 外圈 6×6 − 4×4 = 20 格外墙，室内 4×4 = 16；正门 1（u = floor(6÷2) = 3，正面 v = 0）；窗：四面去墙角各 4 格墙段（s = 0..3），第 s=3 处（(3+1) mod 4 = 0）开窗：
  // 正面 u = 1+3 = 4、背面 (4, 5)、u 小一侧 v = 4 即 (0, 4)、u 大一侧 (5, 4)；正面 u = 4 不是门（门在 u = 3）。
  assert.equal(kindCount(bp, 0, KIND.door), 1);
  assert.equal(kindCount(bp, 0, KIND.window), 4);
  assert.equal(kindCount(bp, 0, KIND.wall), 15);
  assert.equal(kindCount(bp, 0, KIND.interior), 16);
  assert.equal(at(bp, 0, 3, 0).kind, KIND.door);
  for (const [u, v] of [[4, 0], [4, 5], [0, 4], [5, 4]]) assert.equal(at(bp, 0, u, v).kind, KIND.window, `${u},${v}`);
  assert.equal(bp.cells.length, 36);
  // 设计开口 5 处；外壳：朝外格面 2×(6+6) = 24 面 × 1 × 3 + 屋面 16 × 1 = 88；实 88 − 5×3 = 73；楼面 16 × 1 = 16；开口 15。
  assert.deepEqual({ ...bp.areas, designVolumeL: undefined }, { floorM2: 16, envelopeM2: 88, solidM2: 73, designOpenM2: 15, designVolumeL: undefined });
  // 结构元：15 个外墙元（各 1×3×0.4 = 1.2 m³ = 1200 L）+ 16 个屋面元（各 1×1×0.4 = 0.4 m³ = 400 L）= 18 000 + 6 400 = 24 400 L。
  assert.equal(bp.elements.length, 31);
  assert.equal(bp.areas.designVolumeL, 24400);
  assert.equal(bp.elements.filter((e) => e.kind === 'wall').every((e) => e.volumeL === 1200n * SCALE), true);
  assert.equal(bp.elements.filter((e) => e.kind === 'ceiling').every((e) => e.volumeL === 400n * SCALE), true);
  // 体元在前、顶元在后：前 15 个是墙，后 16 个是顶元。
  assert.equal(bp.elements.slice(0, 15).every((e) => e.kind === 'wall'), true);
  assert.equal(bp.elements.slice(15).every((e) => e.kind === 'ceiling'), true);
  // 设计围合：开口比例 = 15 ÷ 88 = 0.170454… → 四位截断 0.1704；设计露天：16 个室内格上都有屋面 → 0。
  assert.equal(bp.design.aperture, 0.1704);
  assert.equal(bp.design.skyExposure, 0);
  // 门窗格不是结构元（element 为空），室内格有屋面顶面。
  assert.equal(at(bp, 0, 3, 0).element, null);
  assert.equal(at(bp, 0, 2, 2).ceiling, CEILING.roof);
  assert.equal(at(bp, 0, 0, 0).ceiling, null);
  // openings：正门 1、窗 4，种类排序（正门在前）。
  assert.deepEqual(bp.openings.map((o) => o.kind), [OPENING.mainDoor, OPENING.window, OPENING.window, OPENING.window, OPENING.window]);
});

test('墙厚 2.5 m（占 3 格）：逐格厚度手算——第 0、1 层墙格 1 m、第 2 层 0.5 m；设计体积 158 500 升；外壳 100', () => {
  // w = ceil(2.5) = 3，8×8 外包；ext = min(u, 7−u, v, 7−v)：ext0 环 28 格、ext1 环 20 格、ext2 环 12 格、室内 2×2 = 4 格。
  // 正门 u = 4 沿墙厚 3 格（v = 0、1、2，ext 0、1、2 各一格）；windowEvery 0 无窗。体元：ext0 27 个 × 3 m³、ext1 19 个 × 3 m³、ext2 11 个 × 1.5 m³（厚 min(1, 2.5 − 2×1) = 0.5）。
  // 体积 L：27×3000 + 19×3000 + 11×1500 = 81 000 + 57 000 + 16 500 = 154 500；顶元 4 个，各 cellM² × min(2.5, 1) = 1 m³ = 1000 L → 4 000；合计 158 500。
  const bp = plan(form({ windowEvery: 0 }), [8, 8], 1, 2.5);
  assert.equal(kindCount(bp, 0, KIND.wall), 57);
  assert.equal(kindCount(bp, 0, KIND.door), 3);
  assert.equal(kindCount(bp, 0, KIND.interior), 4);
  const wallVolumes = bp.elements.filter((e) => e.kind === 'wall').map((e) => e.volumeL);
  assert.equal(wallVolumes.filter((v) => v === 3000n * SCALE).length, 46);
  assert.equal(wallVolumes.filter((v) => v === 1500n * SCALE).length, 11);
  assert.equal(bp.areas.designVolumeL, 158500);
  // 外壳：朝外格面 2×(8+8) = 32 × 3 = 96 + 屋面 4 = 100。
  assert.equal(bp.areas.envelopeM2, 100);
});

// ---------- 坐标与朝向（#21） ----------

test('facing 0、2、4、6：格数、结构元数、设计体积逐位相同；转后外包宽深在 2、6 时互换；奇数 facing 向下取偶并返回取偶值', () => {
  // 8×4 外包：facing 0：(x, y) = (u, −v) → x ∈ [0, 7]、y ∈ [−3, 0]；facing 2（转一次 (x,y)→(y,−x)）：(−v, −u) → x ∈ [−3, 0]、y ∈ [−7, 0]；
  // facing 4：(−u, v) → x ∈ [−7, 0]、y ∈ [0, 3]；facing 6：(v, u) → x ∈ [0, 3]、y ∈ [0, 7]。
  const expectBbox = { 0: { dx0: 0, dy0: -3, dx1: 7, dy1: 0 }, 2: { dx0: -3, dy0: -7, dx1: 0, dy1: 0 }, 4: { dx0: -7, dy0: 0, dx1: 0, dy1: 3 }, 6: { dx0: 0, dy0: 0, dx1: 3, dy1: 7 } };
  const ref = plan(form(), [8, 4], 1, 0.4, 0);
  for (const f of [0, 2, 4, 6]) {
    const bp = plan(form(), [8, 4], 1, 0.4, f);
    assert.equal(bp.facing, f);
    assert.deepEqual(bp.bbox, expectBbox[f], `facing ${f}`);
    assert.equal(bp.cells.length, ref.cells.length);
    assert.equal(bp.elements.length, ref.elements.length);
    assert.equal(bp.areas.designVolumeL, ref.areas.designVolumeL);
  }
  // 奇数 facing 向下取偶：1→0、3→2、5→4、7→6，返回取偶后的值，蓝图与取偶后的一致。
  for (const [odd, even] of [[1, 0], [3, 2], [5, 4], [7, 6]]) {
    const bp = plan(form(), [8, 4], 1, 0.4, odd);
    assert.equal(bp.facing, even);
    assert.deepEqual(bp.bbox, expectBbox[even]);
  }
  // 转世界：anchor (10, 20, 5)，facing 2：局部 (1, 0) → (x, y) = (1, 0) → 转一次 (y, −x) = (0, −1) → 世界 (10, 19)；层号 = 5 + 1 + 0 + 0 = 6（anchor.z 是地表层号，偏移 0 的一层在其上一层，勘误 1121k14）。
  const bp2 = plan(form(), [8, 4], 1, 0.4, 2);
  const cell = bp2.cells.findIndex((c) => c.u === 1 && c.v === 0 && c.level === 0);
  assert.deepEqual(worldCellsOf(bp2, { x: 10, y: 20, z: 5 })[cell], { x: 10, y: 19, z: 6, u: 1, v: 0, level: 0 });
  // 层号 = anchor.z + 1 + storeyBase + ℓ：storeyBase −1、三层、anchor.z = 5 → 层 ℓ=0（偏移 −1）占地表层 5、ℓ=1 在 6、ℓ=2 在 7。
  const deep = plan(form({ storeyBase: -1 }), [8, 4], 3, 0.4, 0);
  const wc = worldCellsOf(deep, { x: 0, y: 0, z: 5 });
  assert.deepEqual([0, 1, 2].map((l) => wc[deep.cells.findIndex((c) => c.level === l)].z), [5, 6, 7]);
});

// ---------- 房间、隔墙、楼梯（#22、#24） ----------

test('两间房：隔墙占一行、内门在 u = floor(W÷2)、房间格守恒（房间格 + 隔墙格 + 内门格 = 室内格）', () => {
  // 6×7、w=1：室内行数 d = 7 − 2 = 5，r = 2 → 可分行数 R = 5 − 1 = 4；share 0.5/0.5：第一份 floor(4×0.5) = 2，末份 4 − 2 = 2。
  // 房间 0 在 v = 1..2；隔墙行 v = 3（u = 1..4：u=3 是内门、其余 3 格隔墙）；房间 1 在 v = 4..5。室内格共 4 × 5 = 20；房间 0 有 4×2 = 8、房间 1 有 8。
  const f = form({ windowEvery: 0, rooms: [{ role: 'r_a', share: 0.5, level: 0, open: false }, { role: 'r_b', share: 0.5, level: 0, open: false }] });
  const bp = plan(f, [6, 7], 1, 0.4);
  assert.equal(bp.ok, true);
  assert.equal(count(bp, (c) => c.room === 0), 8);
  assert.equal(count(bp, (c) => c.room === 1), 8);
  assert.equal(kindCount(bp, 0, KIND.partition), 3);
  assert.equal(at(bp, 0, 3, 3).kind, KIND.door);
  assert.equal(at(bp, 0, 3, 3).room, null);
  assert.equal(count(bp, (c) => c.kind === KIND.partition && c.room !== null), 0);
  const interiorInHousing = 20;
  assert.equal(8 + 8 + 3 + 1, interiorInHousing);
  assert.deepEqual(bp.rooms.map((r) => [r.ordinal, r.role, r.rowFrom, r.rowTo]), [[0, 'r_a', 1, 2], [1, 'r_b', 4, 5]]);
  assert.deepEqual(bp.openings.map((o) => o.kind), [OPENING.mainDoor, OPENING.innerDoor]);
  // 两个房间格集合两两不相交：每格至多一个 room（cells 里 room 是单值），且非空。
  assert.ok(bp.rooms.every((r) => count(bp, (c) => c.room === r.ordinal) > 0));
  // 隔墙是结构元，内门不是。
  assert.notEqual(at(bp, 0, 1, 3).element, null);
  assert.equal(at(bp, 0, 3, 3).element, null);
});

test('房间分摊：share 取 0.3/0.7 → 1 与 3 行；某份为 0 或行数不够即不可行并给原因代号', () => {
  const room = (share, level = 0, open = false) => ({ role: 'r_a', share, level, open });
  // 6×7、R = 4：floor(4 × 0.3) = 1，末份 3；房间 0 在 v = 1，隔墙 v = 2，房间 1 在 v = 3..5。
  const ok = plan(form({ windowEvery: 0, rooms: [room(0.3), room(0.7)] }), [6, 7], 1, 0.4);
  assert.deepEqual(ok.rooms.map((r) => [r.rowFrom, r.rowTo]), [[1, 1], [3, 5]]);
  // share 0.1/0.9：floor(4 × 0.1) = 0 → 某份为 0 不可行。
  assert.deepEqual(plan(form({ rooms: [room(0.1), room(0.9)] }), [6, 7], 1, 0.4), { ok: false, reason: REASON.roomsInfeasible });
  // 深 4、w=1：d = 2，r = 2 → R = 1 < 2 不可行。
  assert.deepEqual(plan(form({ rooms: [room(0.5), room(0.5)] }), [6, 4], 1, 0.4), { ok: false, reason: REASON.roomsInfeasible });
  // planCells 比外墙厚度要求的最小边（2w+1）小：不可行（只读 planCells，不重算）。
  assert.deepEqual(plan(form(), [2, 6], 1, 0.4), { ok: false, reason: REASON.planTooSmall });
  // 高于列表里最大 level 的层照搬最大那一层的分法：rooms 只写 level 0，三层楼每层都是同样两间（room 序号 0..5）。
  const stack = plan(form({ windowEvery: 0, rooms: [room(0.5), room(0.5)] }), [6, 7], 3, 0.4);
  assert.equal(stack.rooms.length, 6);
  assert.deepEqual(stack.rooms.map((r) => r.level), [0, 0, 1, 1, 2, 2]);
  // 列表里有 level 0 与 level 2、没有 level 1：level 1 不分（ℓ 不大于最大 level，也无该层项）。
  const gap = plan(form({ windowEvery: 0, rooms: [room(1, 0), room(1, 2)] }), [6, 7], 3, 0.4);
  assert.equal(gap.ok, true);
  assert.equal(gap.rooms.length, 2);
  assert.equal(count(gap, (c) => c.level === 1 && c.room !== null), 0);
});

test('楼梯：storeys > 1 时除最高层外每层在 (w, D−w−1)，通到上一层；最高层没有楼梯；楼梯格没有顶面、是体元', () => {
  const bp = plan(form({ windowEvery: 0 }), [6, 6], 3, 0.4);
  // w = 1：楼梯 (1, 6−1−1) = (1, 4)，ℓ = 0、1 各一个；ℓ = 2（最高）没有。
  assert.equal(at(bp, 0, 1, 4).kind, KIND.stairs);
  assert.equal(at(bp, 1, 1, 4).kind, KIND.stairs);
  assert.equal(at(bp, 2, 1, 4).kind, KIND.interior);
  assert.equal(count(bp, (c) => c.kind === KIND.stairs), 2);
  assert.equal(at(bp, 0, 1, 4).ceiling, null);
  assert.notEqual(at(bp, 0, 1, 4).element, null);
  // 楼梯格体积 cellM² × min(t, cellM) = 1 × 0.4 = 0.4 m³ = 400 L。
  assert.equal(bp.elements[at(bp, 0, 1, 4).element].volumeL, 400n * SCALE);
  assert.equal(bp.elements[at(bp, 0, 1, 4).element].kind, 'stairs');
  // 一层楼没有楼梯。
  assert.equal(count(plan(form(), [6, 6], 1, 0.4), (c) => c.kind === KIND.stairs), 0);
});

// ---------- 顶面（#23） ----------

test('顶面：最高层以下的室内格是楼板、楼梯格无顶面、最高层地上 roofed 真是屋面（假则无）、地下是楼板；开敞房间格无顶面', () => {
  const two = plan(form({ windowEvery: 0 }), [6, 6], 2, 0.4);
  // 层 0 室内 16 格：楼梯 1 格无顶面，其余 15 格楼板；层 1（最高、地上）16 格屋面。
  assert.equal(count(two, (c) => c.level === 0 && c.ceiling === CEILING.floor), 15);
  assert.equal(count(two, (c) => c.level === 1 && c.ceiling === CEILING.roof), 16);
  const bare = plan(form({ windowEvery: 0, roofed: false }), [6, 6], 2, 0.4);
  assert.equal(count(bare, (c) => c.level === 1 && c.ceiling !== null), 0);
  assert.equal(count(bare, (c) => c.level === 0 && c.ceiling === CEILING.floor), 15);
  // 地下：storeyBase −1、一层：最高层绝对偏移 −1（< 0），顶面是楼板（托住上面的地），即使 roofed 真也不是屋面。
  const cellar = plan(form({ storeyBase: -1, windowEvery: 0 }), [6, 6], 1, 0.4);
  assert.equal(count(cellar, (c) => c.level === 0 && c.ceiling === CEILING.floor), 15); // 楼梯格（纯地下最高层也设）无顶面
  // 开敞房间（天井）的格无顶面：一层、两间房、第二间 open；第一间有屋面。6×7 的房间行 v = 1..2 与 4..5，各 8 格。
  const yard = plan(form({ windowEvery: 0, rooms: [{ role: 'r_a', share: 0.5, level: 0, open: false }, { role: 'r_b', share: 0.5, level: 0, open: true }] }), [6, 7], 1, 0.4);
  assert.equal(count(yard, (c) => c.room === 0 && c.ceiling === CEILING.roof), 8);
  assert.equal(count(yard, (c) => c.room === 1 && c.ceiling !== null), 0);
  // 设计露天比例：室内格（种类室内、楼梯）= 室内 4×5 = 20 格减去隔墙行 4 格 = 16 格，天井 8 格往上没有顶面 → 8 ÷ 16 = 0.5。
  assert.equal(yard.design.skyExposure, 0.5);
  // 天井上方若是不开敞的室内：不可行。
  const lay = (open1) => plan(form({ windowEvery: 0, rooms: [{ role: 'r_a', share: 1, level: 0, open: true }, { role: 'r_a', share: 1, level: 1, open: open1 }] }), [6, 6], 2, 0.4);
  assert.deepEqual(lay(false), { ok: false, reason: REASON.floorOverOpenRoom });
  assert.equal(lay(true).ok, true);
});

test('桥面：deck 真时最低层下一层的每一格加桥面顶面，格本身不是蓝图格种类（kind 为空，保留基底）；顶元数含桥面', () => {
  const bp = plan(form({ deck: true, walled: false, roofed: false, windowEvery: 0 }), [5, 3], 1, 0.4);
  // 桥面层 level = −1 的 5×3 = 15 格，顶面 deck、kind 为空；它们各是一个顶元；层 0 的 15 格都是室内、无顶面（不 roofed）。
  assert.equal(count(bp, (c) => c.level === -1), 15);
  assert.equal(count(bp, (c) => c.level === -1 && c.kind === null && c.ceiling === CEILING.deck), 15);
  assert.equal(bp.elements.filter((e) => e.kind === 'ceiling').length, 15);
  assert.equal(count(bp, (c) => c.level === 0 && c.kind === KIND.interior), 15);
  // 顶元体积 cellM² × min(t, cellM) = 1 × 0.4 = 0.4 m³ = 400 L；15 个共 6 000 L。walled 假：没有外墙、没有正门与窗，外壳面积只计屋面元（0）。
  assert.equal(bp.areas.designVolumeL, 6000);
  assert.equal(bp.areas.envelopeM2, 0);
  assert.equal(bp.design.aperture, 0); // 外壳为 0 不做除法
  assert.equal(bp.openings.length, 0);
});

// ---------- 纯地下蓝图、入口（#22） ----------

test('纯地下蓝图：最高层也设楼梯，楼梯正上方地表层那一格是入口（算门）；最高层须恰是绝对偏移 −1，否则不可行', () => {
  const ok = plan(form({ storeyBase: -2, windowEvery: 0 }), [6, 6], 2, 0.4);
  // storeyBase −2、两层：偏移 −2、−1，没有 0 层；最高层（ℓ=1）也设楼梯 (1, 4)；入口在 level = storeys = 2、(1, 4)，kind 门。
  assert.equal(ok.ok, true);
  assert.equal(at(ok, 1, 1, 4).kind, KIND.stairs);
  assert.equal(at(ok, 2, 1, 4).kind, KIND.door);
  assert.deepEqual(ok.openings.map((o) => o.kind), [OPENING.entrance]);
  assert.equal(kindCount(ok, 0, KIND.door), 0); // 没有正门（没有绝对偏移 0 的层）
  // 最高层偏移 −2（storeyBase −3、两层 → −3、−2）：入口与最高层不相邻，不可行。
  assert.deepEqual(plan(form({ storeyBase: -3, windowEvery: 0 }), [6, 6], 2, 0.4), { ok: false, reason: REASON.entranceNotAdjacent });
  // 设计露天：没有绝对偏移 0 的层取 0；纯地下蓝图没有外壳（地上外墙为空）。
  assert.equal(ok.design.skyExposure, 0);
  assert.equal(ok.areas.envelopeM2, 0);
});

// ---------- 输入域与纯度（#19、#25） ----------

test('planBlueprint 只收五项输入；越域与特殊值全部拒收；同输入两次逐格相同（缓存键只含输入）', () => {
  const ok = { form: form(), planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, wallThicknessM: 0.4, facing: 0 };
  // 多收 engine、state 一律拒（签名只有这五项）。
  throwsCode(() => planBlueprint({ ...ok, engine: {} }, RULES), 'E-DET-DOMAIN');
  throwsCode(() => planBlueprint({ ...ok, state: {} }, RULES), 'E-DET-DOMAIN');
  for (const bad of [0, 4097, 1.5, -1, null]) throwsCode(() => planBlueprint({ ...ok, planCells: { widthCells: bad, depthCells: 6 } }, RULES), 'E-DET-DOMAIN');
  throwsCode(() => planBlueprint({ ...ok, planCells: { widthCells: 6 } }, RULES), 'E-DET-DOMAIN');
  throwsCode(() => planBlueprint({ ...ok, planCells: null }, RULES), 'E-DET-DOMAIN');
  for (const bad of [0, 65, 1.5, null]) throwsCode(() => planBlueprint({ ...ok, storeys: bad }, RULES), 'E-DET-DOMAIN');
  for (const bad of [8, -1, 1.5, null]) throwsCode(() => planBlueprint({ ...ok, facing: bad }, RULES), 'E-DET-DOMAIN');
  for (const bad of [0, -1, 21]) throwsCode(() => planBlueprint({ ...ok, wallThicknessM: bad }, RULES), 'E-DET-DOMAIN');
  // 端值：planCells 1 与 4096、storeys 1 与 64 放行（4096×1 的 walled 假外包）。
  assert.equal(planBlueprint({ ...ok, form: form({ walled: false }), planCells: { widthCells: 1, depthCells: 1 } }, RULES).ok, true);
  assert.equal(planBlueprint({ ...ok, form: form({ walled: false, windowEvery: 0 }), planCells: { widthCells: 4096, depthCells: 1 } }, RULES).cells.length, 4096);
  assert.equal(planBlueprint({ ...ok, form: form({ walled: false, windowEvery: 0, roofed: false }), planCells: { widthCells: 1, depthCells: 1 }, storeys: 64 }, RULES).ok, true);
  // 墙厚缺省取形制 wallThicknessDefaultM。
  const a = planBlueprint({ ...ok, wallThicknessM: null }, RULES);
  const b = planBlueprint({ ...ok, wallThicknessM: 0.4 }, RULES);
  assert.deepEqual(a.cells, b.cells);
  // 两次逐格相同；形制条目换成内容相同的另一个对象，结果逐位相同（不靠对象身份）。
  const c = planBlueprint({ ...ok, form: { ...form() } }, RULES);
  assert.deepEqual(a.cells, c.cells);
  assert.deepEqual(a.elements, c.elements);
  // 形制字段越域：storeyBase 出 [−8, 0]、windowEvery 出 [0, 64]、rooms 非列表。
  throwsCode(() => planBlueprint({ ...ok, form: form({ storeyBase: 1 }) }, RULES), 'E-DIM-DOMAIN-RANGE');
  throwsCode(() => planBlueprint({ ...ok, form: form({ windowEvery: 65 }) }, RULES), 'E-DIM-DOMAIN-RANGE');
  throwsCode(() => planBlueprint({ ...ok, form: form({ rooms: null }) }, RULES), 'E-DIM-DOMAIN-RANGE');
});

// ---------- 结构元的料（#26） ----------

test('派料：料按 density 由大到小沿结构元列累加设计体积派发；各料派到的体积与份额之差不超一个结构元；不点名任何材料', () => {
  const bp = plan(form(), [6, 6], 1, 0.4);
  // 设计体积 24 400 L。料 X：density 2、质量 24 400 kg → 12 200 L；料 Y：density 1、质量 12 200 kg → 12 200 L。份额 0.5 / 0.5。
  // 密度大者 X 排前：一元起点 s（L）满足 s < 12 200 派 X：墙元每个 1 200 L，起点 0、1200、…、12000（k = 10）派 X（共 11 个），k = 11（13200）起派 Y；屋面元起点 ≥ 18000 全派 Y。
  const mats = [{ code: 'mat_y', massKg: 12200, density: 1 }, { code: 'mat_x', massKg: 24400, density: 2 }];
  const out = materialsOfElements(bp, mats);
  assert.equal(out.length, bp.elements.length);
  assert.deepEqual(out.slice(0, 11), Array(11).fill('mat_x'));
  assert.deepEqual(out.slice(11), Array(bp.elements.length - 11).fill('mat_y'));
  // 各料派到的设计体积与份额之差：X 实得 11 × 1200 = 13 200 L，份额 12 200 L，差 1 000 L ≤ 一个结构元（1 200 L，墙元）。
  const gotX = bp.elements.filter((e, i) => out[i] === 'mat_x').reduce((s, e) => s + e.volumeL, 0n);
  assert.equal(gotX, 13200n * SCALE);
  // 换料（质量变）后重派，不存：只给 Y 一种料 → 全是 Y；没有料（质量为 0 的不算）→ 全为 null（读作没有料）。
  assert.equal(materialsOfElements(bp, [{ code: 'mat_y', massKg: 5, density: 1 }]).every((c) => c === 'mat_y'), true);
  assert.equal(materialsOfElements(bp, [{ code: 'mat_y', massKg: 0, density: 1 }]).every((c) => c === null), true);
  assert.equal(materialsOfElements(bp, []).every((c) => c === null), true);
  // 密度并列按材料代号：两料同密度同体积，代号小的在前（份额区间靠前）。
  const tie = materialsOfElements(bp, [{ code: 'mat_b', massKg: 12200, density: 1 }, { code: 'mat_a', massKg: 12200, density: 1 }]);
  assert.equal(tie[0], 'mat_a');
  assert.equal(tie[tie.length - 1], 'mat_b');
  throwsCode(() => materialsOfElements(bp, [{ code: 'mat_y', massKg: 1, density: 0 }]), 'E-DET-DOMAIN');
});

// ---------- 破口与开口面积（#27、#29） ----------

const WEAR = Object.freeze({ breachShare: 0.5, roofCurve: [[0, 0], [1, 1]], wallOrderCode: 'k_wall', roofOrderCode: 'k_roof' });
// 注入的排序键：测试前提（真实的种子键由调用方给，登记在 grid.mjs）；只要求同输入同输出。
const fakeKey = (code, idx) => `${code}:${String((idx * 7919) % 100003).padStart(6, '0')}`;

test('破口数量取账、位置取序：K_w、K_r 按公式手算；完好度降低时原有破口一个不挪、只在排序后面添新', () => {
  const bp = plan(form(), [6, 6], 1, 0.4);
  // 外壳外墙处 20（16 墙段 + 4 墙角），开口 5（门 1 + 窗 4），候选墙处 = 非墙角且非开口 = 16 − 5 = 11；候选屋面元 16。
  // condition 0.6：K_w = floor(11 × 0.4 × 0.5) = floor(2.2) = 2；K_r = floor(16 × (1 − 0.6)) = floor(6.4) = 6（roofCurve 取恒等）。
  const at06 = breachesOf(bp, 0.6, [], WEAR, fakeKey);
  assert.equal(at06.kw, 2);
  assert.equal(at06.kr, 6);
  assert.equal(at06.breachPlaces.length, 2);
  assert.equal(at06.gapRoofs.length, 6);
  // condition 1：无破口；condition 0：K_w = floor(11 × 1 × 0.5) = 5，K_r = 16。
  assert.equal(breachesOf(bp, 1, [], WEAR, fakeKey).kw, 0);
  assert.equal(breachesOf(bp, 1, [], WEAR, fakeKey).kr, 0);
  const at0 = breachesOf(bp, 0, [], WEAR, fakeKey);
  assert.equal(at0.kw, 5);
  assert.equal(at0.kr, 16);
  // 单调添新、不重排：低完好度的破口集合以高完好度的破口为前缀（同一排序）。
  const at08 = breachesOf(bp, 0.8, [], WEAR, fakeKey);
  assert.deepEqual(at06.breachPlaces.slice(0, at08.breachPlaces.length), at08.breachPlaces);
  assert.deepEqual(at0.breachPlaces.slice(0, at06.breachPlaces.length), at06.breachPlaces);
  assert.deepEqual(at0.gapRoofs.slice(0, at06.gapRoofs.length), at06.gapRoofs);
  // 同一 condition 两次读出逐格相同。
  assert.deepEqual(breachesOf(bp, 0.6, [], WEAR, fakeKey), at06);
  // 破口位置的候选不含设计开口与墙角。
  for (const i of at0.breachPlaces) { assert.equal(bp.places[i].open, false); assert.equal(bp.places[i].corner, false); }
});

test('breaks：被拆开的元不再是候选且面积计入 breakM2；开口面积各项落在两两不相交的处上；外壳为 0 取 0', () => {
  const bp = plan(form(), [6, 6], 1, 0.4);
  // 拆开 (1, 0) 的外墙元（正面 u = 1 的墙段）：候选墙处 11 − 1 = 10；condition 0.6：K_w = floor(10 × 0.4 × 0.5) = 2。
  const breaks = [{ u: 1, v: 0, level: 0, remainL: 1200 }];
  const r = breachesOf(bp, 0.6, breaks, WEAR, fakeKey);
  assert.equal(r.kw, 2);
  assert.equal(r.breakWallPlaces.length, 1);
  assert.equal(bp.places[r.breakWallPlaces[0]].outer, bp.cells.findIndex((c) => c.u === 1 && c.v === 0 && c.level === 0));
  // 屋顶一元被拆开（(2, 2) 的屋面）：候选屋面 15，K_r = floor(15 × 0.4) = 6，breakRoofs 1。
  const r2 = breachesOf(bp, 0.6, [{ u: 2, v: 2, level: 0, remainL: 400 }], WEAR, fakeKey);
  assert.equal(r2.kr, 6);
  assert.equal(r2.breakRoofs.length, 1);
  // openingAreas：设计开口 15、外壳 88；关着的扇封住 1 处正门（3）；wearBreach = 2 × 1 × 3 = 6；roofGap = 6 × 1 = 6；break = 墙处 1 面 × 3 = 3。
  const door = bp.places.findIndex((p) => p.open && bp.cells[p.outer].u === 3 && bp.cells[p.outer].v === 0);
  const areas = openingAreasOf(bp, r, [door], RULES);
  assert.deepEqual(areas, { shellM2: 88, designOpenM2: 15, leafClosedM2: 3, wearBreachM2: 6, roofGapM2: 6, breakM2: 3 });
  // 设计值不随 condition、扇、breaks 变：蓝图本身（design、areas）在同一对象上，读取前后相同。
  assert.equal(bp.design.aperture, 0.1704);
  assert.equal(bp.areas.designOpenM2, 15);
  throwsCode(() => breachesOf(bp, 1.1, [], WEAR, fakeKey), 'E-DET-DOMAIN');
  throwsCode(() => breachesOf(bp, -0.1, [], WEAR, fakeKey), 'E-DET-DOMAIN');
});

test('breaks 一元拆开即整处开（卷十九 :428）：墙厚 2.5 m（w=3）时只拆正面一处的最外一格，该处沿墙厚 3 格都开、breakM2 = 1 面 × 3、该处不再是破口候选', () => {
  // 8×8、w = 3、无窗：正面墙段 u = 3、4（u = 4 是正门），非墙角非开口的外墙处：每面 2 处，共 8，减正门 1 = 7 处候选。
  const bp = plan(form({ windowEvery: 0 }), [8, 8], 1, 2.5);
  const cellAt = (u, v) => bp.cells.findIndex((c) => c.u === u && c.v === v && c.level === 0);
  const r = breachesOf(bp, 1, [{ u: 3, v: 0, level: 0, remainL: 3000 }], WEAR, fakeKey);
  assert.equal(r.breakWallPlaces.length, 1);
  assert.deepEqual(bp.places[r.breakWallPlaces[0]].cells.slice().sort((a, b) => a - b), [cellAt(3, 0), cellAt(3, 1), cellAt(3, 2)].sort((a, b) => a - b));
  assert.equal(openingAreasOf(bp, r, [], RULES).breakM2, 3); // 朝外 1 面 × cellM × storeyM = 3
  // 拆开的那一处不再是候选：condition 0.5、share 0.5：候选 7 − 1 = 6，K_w = floor(6 × 0.5 × 0.5) = floor(1.5) = 1。
  assert.equal(breachesOf(bp, 0.5, [{ u: 3, v: 0, level: 0, remainL: 3000 }], WEAR, fakeKey).kw, 1);
  // 拆的是同一处里面一格 (3, 2)：同样整处开。
  assert.equal(breachesOf(bp, 1, [{ u: 3, v: 2, level: 0, remainL: 3000 }], WEAR, fakeKey).breakWallPlaces.length, 1);
});

test('劣化表缺失（wear 为 null）：依赖它的量按未知往下传，不报完好；condition 恰为 1 时墙项可推出为 0，屋面项仍未知', () => {
  const bp = plan(form(), [6, 6], 1, 0.4);
  // 候选墙处 11、候选屋面元 16（同手算例）：condition 0.5：墙项、屋面项都未知；
  const half = breachesOf(bp, 0.5, [], null, fakeKey);
  assert.equal(half.kw, null);
  assert.equal(half.kr, null);
  assert.equal(half.unknownWalls.length, 11);
  assert.equal(half.unknownRoofs.length, 16);
  assert.deepEqual(half.breachPlaces, []);
  const a = openingAreasOf(bp, half, [], RULES);
  assert.equal(a.wearBreachM2, null);
  assert.equal(a.roofGapM2, null);
  assert.equal(a.leafClosedM2, 0);
  // condition 1：K_w = floor(n × 0 × share) = 0 可推出（无候选墙处未知）；K_r 要读 roofCurve(1)，没有表仍未知。
  const full = breachesOf(bp, 1, [], null, fakeKey);
  assert.equal(full.kw, 0);
  assert.equal(full.unknownWalls.length, 0);
  assert.equal(full.kr, null);
  assert.equal(openingAreasOf(bp, full, [], RULES).wearBreachM2, 0);
  assert.equal(openingAreasOf(bp, full, [], RULES).roofGapM2, null);
});

// ---------- 加载期校验与扩展性（#35、A19-5.3） ----------

const ENTRY = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 4, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 24, rooms: [{ role: 'roomrole_t', share: 1, level: 0, open: false }] };
const index = (entries) => new Map([['roomrole_t', { family: 'roomrole', entry: {} }], ...entries.map(([c, e]) => [c, { family: 'bform', entry: e }])]);
const codesOf = (entries) => checkBlueprintForms(index(entries), LIMITS).map((s) => s.split(' ')[0]);

test('bform 加载校验：合法条目放行；取值域越界、缺必填、房间角色不存在、同层 share 之和不为 1 逐条拒收', () => {
  assert.deepEqual(checkBlueprintForms(index([['bldform_t', ENTRY]]), LIMITS), []);
  const bad = (patch) => codesOf([['bldform_t', { ...ENTRY, ...patch }]]);
  assert.deepEqual(bad({ aspect: 0.1 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ aspect: 9 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ storeyBase: 1 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ storeyBase: -9 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ storeyBase: 0.5 }), ['E-DIM-REQUIRED-MISSING']);
  assert.deepEqual(bad({ windowEvery: 65 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ windowEvery: -1 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ walled: undefined }), ['E-DIM-REQUIRED-MISSING']);
  assert.deepEqual(bad({ rooms: undefined }), ['E-DIM-REQUIRED-MISSING']);
  assert.deepEqual(bad({ wallThicknessDefaultM: 0 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ wallThicknessMinM: 0.5 }), ['E-DIM-DOMAIN-RANGE']); // 下限大于缺省
  // 形制必须自己登记外包边长上限 planSideMaxCells（封卷后勘误 1121k21）：缺、非整数拒收（缺必填），0 与负数拒收（取值域），没有默认放大。
  for (const v of [undefined, null, 24.5, '24', Number.NaN]) assert.deepEqual(bad({ planSideMaxCells: v }), ['E-DIM-REQUIRED-MISSING']);
  for (const v of [0, -1]) assert.deepEqual(bad({ planSideMaxCells: v }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ planSideMaxCells: 1 }), []);
  assert.deepEqual(bad({ rooms: [{ role: 'roomrole_zz', share: 1, level: 0, open: false }] }), ['E-DIM-REF-MISSING']);
  assert.deepEqual(bad({ rooms: [{ role: 'roomrole_t', share: 0.5, level: 0, open: false }] }), ['E-DIM-DOMAIN-RANGE']); // 同层份额之和 0.5
  assert.deepEqual(bad({ rooms: [{ role: 'roomrole_t', share: 0.5, level: 0, open: false }, { role: 'roomrole_t', share: 0.5, level: 0, open: true }, { role: 'roomrole_t', share: 1, level: 1, open: false }] }), []);
  assert.deepEqual(bad({ rooms: [{ role: 'roomrole_t', share: 0, level: 0, open: false }] }).includes('E-DIM-DOMAIN-RANGE'), true);
  assert.deepEqual(bad({ rooms: [{ role: 'roomrole_t', share: 1, level: -1, open: false }] }).includes('E-DIM-DOMAIN-RANGE'), true);
  assert.deepEqual(bad({ rooms: [{ role: 'roomrole_t', share: 1, level: 0 }] }).includes('E-DIM-DOMAIN-RANGE'), true);
  // 非 bform 族的条目不被检查。
  assert.deepEqual(checkBlueprintForms(new Map([['x_other', { family: 'other', entry: {} }]]), LIMITS), []);
  // 规则表缺 blueprint 行（取值域上下限没登记）而世界里有形制条目：拒收，不当作没有上下限放过。
  assert.deepEqual(checkBlueprintForms(index([['bldform_t', ENTRY]]), undefined).map((s) => s.split(' ')[0]), ['E-RULES-UNREGISTERED']);
});

test('扩展性（A19-5.3）：只加数据——新增一条形制条目即被 planBlueprint 使用，不改代码', () => {
  // 两条形制：第二条是"加的数据"：一层带地窖（storeyBase −1）、墙厚缺省 1.2 m（w = 2）。
  const idx = index([['bldform_t', ENTRY], ['bldform_new', { ...ENTRY, storeyBase: -1, wallThicknessDefaultM: 1.2, windowEvery: 0 }]]);
  assert.deepEqual(checkBlueprintForms(idx, LIMITS), []);
  const entry = idx.get('bldform_new').entry;
  const bp = planBlueprint({ form: entry, planCells: planCellsOf({ form: entry, areaM2: 36 }, RULES), storeys: 2, wallThicknessM: null, facing: 0 }, RULES);
  // w = ceil(1.2) = 2，m = 5：A = 36 → D = 6，W = 6；两层（偏移 −1、0）；偏移 0 的是层 1，正门在层 1。
  assert.equal(bp.wallCells, 2);
  assert.equal(bp.ok, true);
  assert.deepEqual(bp.levels.map((l) => l.offset), [-1, 0]);
  assert.equal(kindCount(bp, 1, KIND.door), 2);
  assert.equal(kindCount(bp, 0, KIND.door), 0);
});
