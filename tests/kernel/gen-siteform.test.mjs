// 卷十 R10-7.12（docs/统一底层设计/卷十-世界随机生成.md :684–:689；A10-2.4 ⑤ :471）与封卷后勘误 1121k16（李白 11-21 裁定 0b824a66、b58f7dca）：
// 手写建筑行缺的维度由生成规则补——墙厚取形制 wallThicknessDefaultM；planCells 按规则行 areaM2 分布抽面积再 planCellsOf；storeys 按同一规则行的分布抽
// 并夹进 [max(1, 1 − 形制 storeyBase), storeysMax]；补出的房子必须能展开，ok 为假（房间分不下、平面太小）时面积加倍重做，作者写了 planCells 的不重做；
// 没有规则行适用即 E-GEN-ROW-INVALID，不拿常量兜底；补出的值只含缺的维度，by 记 gstage_siteform；同种子同结果；房间行只列缺口、不造行。
// 期望值按卷文公式手算（细格 1 m、层高 3 m、墙厚 0.4 m）：w = ceil(0.4 ÷ 1) = 1、m = 2w + 1 = 3；面积 36 m²（aspect 1）→ D = W = 6；
// 三房间形制（各 level 0、share 0.34）面积 4 m² 时 D = 3、d = D − 2w = 1、spare = d − (r − 1) = −1 < r 不可行，逐次加倍 8（仍 3×3）、16（4×4）、32（7×5，spare 1 < 3）都不可行，64 时 8×8、d = 6、spare = 4 ≥ 3 才可分。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { blueprintRulesFrom } from '../../server-plugin/kernel/place-building.mjs';
import { planBlueprint, planFeasible } from '../../server-plugin/kernel/blueprint.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { genSiteForm } from '../../server-plugin/kernel/gen/siteform.mjs';
import { makeWhen } from '../../server-plugin/kernel/gen/when.mjs';
import { ROOT } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const world = loadWorld(ROOT);
assert.equal(world.ok, true);
const BLUEPRINT = blueprintRulesFrom(world.rules, world.env.units);
assert.notEqual(BLUEPRINT, null);
const WHEN = makeWhen(world);

// 形制条目（卷十九 §2.4 :203）：无房间的围墙形制、三个房间的形制。
const F36 = { walled: true, roofed: true, deck: false, storeyBase: 0, aspect: 1, windowEvery: 4, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.4, rooms: [] };
const F3R = {
  ...F36,
  rooms: [{ role: 'roomrole_a', share: 0.34, level: 0, open: false }, { role: 'roomrole_b', share: 0.34, level: 0, open: false }, { role: 'roomrole_c', share: 0.34, level: 0, open: false }],
};

// 分布取单点即恒取该值（卷十 R10-7.12 的 areaM2、storeys 取 rules.gen.bldfill.rows 的分布）。
const point = (v) => ({ dist: 'triangular', min: v, mode: v, max: v });
const fill = (area, storeys) => [{ whenRX: 'known(form)', priority: 1, areaM2: point(area), storeys: point(storeys) }];
const formEntry = (form) => ({ family: 'bform', entry: form });
const vocabOf = (pairs) => ({ index: new Map(pairs) });
const VOCAB = () => vocabOf([['bldform_t', formEntry(F36)], ['bldform_r', formEntry(F3R)]]);
const rowsOf = (entries) => buildGenRows(new Map(entries), { index: new Map() });
const bld = (extra = {}) => ({ parent: null, classes: ['comp_facility'], form: 'bldform_t', ...extra });
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

const run = (o) => genSiteForm({
  table: 'place',
  stage: 'gstage_siteform',
  worldSeed: o.worldSeed ?? 'seed_siteform',
  genesisMinute: 0,
  vocab: o.vocab ?? VOCAB(),
  rows: o.rows,
  authoredIds: o.authoredIds,
  bldfillRows: o.bldfillRows ?? [],
  roleFacility: 'comp_facility',
  blueprint: o.blueprint ?? BLUEPRINT,
  when: o.when ?? WHEN,
});

test('A10-2.4 ⑤：缺墙厚、平面格数、层数时按规则行补出，值可与作者值一起展开成蓝图', () => {
  const id = 'loc_b1';
  const out = run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.equal(out.proposals.length, 1);
  const p = out.proposals[0];
  assert.equal(p.table, 'place');
  assert.equal(p.id, id);
  assert.deepEqual(p.dims, { wallThicknessM: 0.4, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1 });
  assert.equal(p.by, 'gstage_siteform');
  assert.match(p.seedKey, /^[0-9a-f]{64}$/);
  // 层数是用 planBlueprint 输入域上限夹出的（卷十九 buildPlan 的材料上限还没有）：如实记缺口 storeys_max_unchecked（修改轮 M5）。
  assert.deepEqual(out.deferred, [{ id, reason: 'storeys_max_unchecked', gaps: ['storeys'] }]);
  const bp = planBlueprint({ form: F36, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, BLUEPRINT);
  assert.equal(bp.ok, true);
});

test('手写优先：作者写了的维度原样当输入读，提案不带该维度；三项都写了就没有提案', () => {
  const id = 'loc_b1';
  const onlyPlan = run({ rows: rowsOf([[id, bld({ planCells: { widthCells: 8, depthCells: 5 } })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(onlyPlan.proposals[0].dims, { wallThicknessM: 0.4, storeys: 1 });
  const onlyWall = run({ rows: rowsOf([[id, bld({ wallThicknessM: 0.5 })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(onlyWall.proposals[0].dims, { planCells: { widthCells: 6, depthCells: 6 }, storeys: 1 });
  const all = run({ rows: rowsOf([[id, bld({ wallThicknessM: 0.5, planCells: { widthCells: 8, depthCells: 5 }, storeys: 2 })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(all.proposals, []);
  assert.deepEqual(all.deferred, []);
});

test('不带墙的形制（walled 假）不补墙厚', () => {
  const id = 'loc_b1';
  const noWall = { ...F36, walled: false };
  const out = run({ vocab: vocabOf([['bldform_nw', formEntry(noWall)]]), rows: rowsOf([[id, bld({ form: 'bldform_nw' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.proposals[0].dims, { planCells: { widthCells: 6, depthCells: 6 }, storeys: 1 });
  assert.equal(Object.hasOwn(out.proposals[0].dims, 'wallThicknessM'), false);
});

test('房间分不下时面积逐次加倍：4 → 8 → 16 → 32 → 64 m²，补出的平面格数与蓝图都能展开', () => {
  const id = 'loc_b1';
  const out = run({ vocab: VOCAB(), rows: rowsOf([[id, bld({ form: 'bldform_r' })]]), authoredIds: new Set([id]), bldfillRows: fill(4, 1) });
  assert.deepEqual(out.proposals[0].dims.planCells, { widthCells: 8, depthCells: 8 });
  const bp = planBlueprint({ form: F3R, planCells: { widthCells: 8, depthCells: 8 }, storeys: out.proposals[0].dims.storeys, wallThicknessM: out.proposals[0].dims.wallThicknessM, facing: 0 }, BLUEPRINT);
  assert.equal(bp.ok, true);
});

test('作者写的 planCells 分不下一房间也不加倍：E-GEN-ROW-INVALID', () => {
  const id = 'loc_b1';
  const code = codeOf(() => run({ vocab: VOCAB(), rows: rowsOf([[id, bld({ form: 'bldform_r', planCells: { widthCells: 3, depthCells: 3 } })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }));
  assert.equal(code, 'E-GEN-ROW-INVALID');
});

test('缺必填与规则行不适用：缺 form、form 不是 bform 族条目、没有适用规则行、whenRX 不命中都报 E-GEN-ROW-INVALID', () => {
  const id = 'loc_b1';
  const noForm = rowsOf([[id, { parent: null, classes: ['comp_facility'] }]]);
  assert.equal(codeOf(() => run({ rows: noForm, authoredIds: new Set([id]), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID');
  const notForm = vocabOf([['bldform_x', { family: 'gfield', entry: F36 }]]);
  assert.equal(codeOf(() => run({ vocab: notForm, rows: rowsOf([[id, bld({ form: 'bldform_x' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID');
  assert.equal(codeOf(() => run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: [] })), 'E-GEN-ROW-INVALID');
  const never = [{ whenRX: '!known(form)', priority: 1, areaM2: point(36), storeys: point(1) }];
  assert.equal(codeOf(() => run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: never })), 'E-GEN-ROW-INVALID');
});

test('层数夹进 [max(1, 1 − storeyBase), storeysMax]：形制 storeyBase −2 时下限 3，区间为空即 E-GEN-ROW-INVALID', () => {
  const id = 'loc_b1';
  const vocab = () => vocabOf([['bldform_sb', formEntry({ ...F36, storeyBase: -2 })]]);
  const rows = () => rowsOf([[id, bld({ form: 'bldform_sb' })]]);
  assert.equal(run({ vocab: vocab(), rows: rows(), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }).proposals[0].dims.storeys, 3);
  assert.equal(run({ vocab: vocab(), rows: rows(), authoredIds: new Set([id]), bldfillRows: fill(36, 10) }).proposals[0].dims.storeys, 10);
  const capped = { ...BLUEPRINT, limits: { ...BLUEPRINT.limits, storeysMax: 2 } };
  assert.equal(codeOf(() => run({ vocab: vocab(), rows: rows(), authoredIds: new Set([id]), bldfillRows: fill(36, 1), blueprint: capped })), 'E-GEN-ROW-INVALID');
});

test('确定性：同种子两次逐项相同，换种子至少一行的平面格数不同，每行补出的平面都能展开', () => {
  const ids = ['loc_b1', 'loc_b2', 'loc_b3', 'loc_b4', 'loc_b5', 'loc_b6', 'loc_b7', 'loc_b8'];
  const entries = ids.map((id) => [id, bld()]);
  const authored = new Set(ids);
  const uniform = [{ whenRX: 'known(form)', priority: 1, areaM2: { dist: 'uniform', min: 20, max: 60 }, storeys: point(1) }];
  const a = run({ worldSeed: 'seed_same', rows: rowsOf(entries), authoredIds: authored, bldfillRows: uniform });
  const b = run({ worldSeed: 'seed_same', rows: rowsOf(entries), authoredIds: authored, bldfillRows: uniform });
  assert.deepEqual(a, b);
  const c = run({ worldSeed: 'seed_other', rows: rowsOf(entries), authoredIds: authored, bldfillRows: uniform });
  const cells = (out) => new Map(out.proposals.map((p) => [p.id, p.dims.planCells]));
  assert.notDeepEqual(cells(a), cells(c));
  assert.equal(a.proposals.length, ids.length);
  for (const p of a.proposals) {
    const bp = planBlueprint({ form: F36, planCells: p.dims.planCells, storeys: p.dims.storeys, wallThicknessM: p.dims.wallThicknessM, facing: 0 }, BLUEPRINT);
    assert.equal(bp.ok, true, `${p.id} 补出的平面应能展开`);
  }
});

test('范围：只处理作者写的、挂 roleFacility 的建筑行，其余行不出提案', () => {
  const rows = rowsOf([
    ['loc_a', bld()],
    ['loc_b', bld({ classes: [] })],
    ['loc_c', bld()],
  ]);
  const out = run({ rows, authoredIds: new Set(['loc_b', 'loc_c']), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.proposals.map((p) => p.id), ['loc_c']);
});

test('房间行缺口：缺的房间按 roomRole 与序号列出，补上房间行后缺口收窄', () => {
  const F2R = {
    ...F36,
    rooms: [{ role: 'roomrole_x', share: 0.5, level: 0, open: false }, { role: 'roomrole_y', share: 0.5, level: 0, open: false }],
  };
  const vocab = vocabOf([['bldform_2r', formEntry(F2R)]]);
  const building = ['loc_b', { parent: null, classes: ['comp_facility'], form: 'bldform_2r', planCells: { widthCells: 8, depthCells: 8 }, storeys: 1 }];
  const first = run({ vocab, rows: rowsOf([building]), authoredIds: new Set(['loc_b']) });
  assert.equal(first.deferred.length, 1);
  assert.equal(first.deferred[0].id, 'loc_b');
  assert.equal(first.deferred[0].reason, 'room_rows_unbuilt');
  assert.deepEqual([...first.deferred[0].gaps].sort(), ['roomrole_x#0', 'roomrole_y#0']);
  const room = ['loc_b_r1', { parent: 'loc_b', classes: ['comp_zone'], roomRole: 'roomrole_x' }];
  const second = run({ vocab, rows: rowsOf([building, room]), authoredIds: new Set(['loc_b']) });
  assert.equal(second.deferred.length, 1);
  assert.equal(second.deferred[0].id, 'loc_b');
  assert.deepEqual(second.deferred[0].gaps, ['roomrole_y#0']);
});

// ---------- 修改轮（Opus 只核 M1、M3）：不铺格的可行性预判与终止 ----------

test('planFeasible 与 planBlueprint 的 ok、reason 逐项相同（不铺格的预判，覆盖四种不可行与可行）', () => {
  const open = (o) => ({ role: 'roomrole_a', share: 1, level: 0, open: o });
  const forms = [
    F36, F3R,
    { ...F36, rooms: [open(true), { role: 'roomrole_b', share: 1, level: 1, open: false }] }, // 楼面压在开敞房间上
    { ...F36, rooms: [open(true), { role: 'roomrole_b', share: 1, level: 1, open: true }] }, // 上下都开敞：可行
    { ...F36, rooms: [open(false), { role: 'roomrole_b', share: 1, level: 1, open: true }] },
    { ...F36, storeyBase: -3 }, // 纯地下
    { ...F36, walled: false },
  ];
  let seen = 0;
  for (const form of forms) {
    for (const storeys of [1, 2, 3, 4]) {
      for (const [widthCells, depthCells] of [[3, 3], [4, 4], [6, 6], [7, 5], [8, 8], [9, 12], [5, 20]]) {
        const input = { form, planCells: { widthCells, depthCells }, storeys, wallThicknessM: 0.4, facing: 0 };
        const bp = planBlueprint(input, BLUEPRINT);
        const f = planFeasible(input, BLUEPRINT);
        assert.equal(f.ok, bp.ok, JSON.stringify([form.rooms.length, form.storeyBase, storeys, widthCells, depthCells]));
        assert.equal(f.reason, bp.reason);
        seen += 1;
      }
    }
  }
  assert.equal(seen, 7 * 4 * 7);
});

test('终止靠卷十 :688 的上限：面积无关的 floorOverOpenRoom 一律加倍到 planCells 越 4096 上限，报 E-GEN-ROW-INVALID，预判不铺格所以不耗内存', () => {
  const id = 'loc_b1';
  const stack = { ...F36, rooms: [{ role: 'roomrole_a', share: 1, level: 0, open: true }, { role: 'roomrole_b', share: 1, level: 1, open: false }] };
  const vocab = vocabOf([['bldform_stack', formEntry(stack)]]);
  const e = (() => { try { run({ vocab, rows: rowsOf([[id, bld({ form: 'bldform_stack' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 2) }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.match(e.message, /planCellsMax|exceeds/);
});

test('entranceNotAdjacent 与面积无关（只读 storeyBase 与 storeys）：提前报 E-GEN-ROW-INVALID，不加倍', () => {
  const id = 'loc_b1';
  const vocab = vocabOf([['bldform_ug', formEntry({ ...F36, storeyBase: -3 })]]);
  const e = (() => { try { run({ vocab, rows: rowsOf([[id, bld({ form: 'bldform_ug', storeys: 1 })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.match(e.message, /bp_entrance_not_adjacent/);
});

test('层数缺口：用域上限夹过层数的行才记 storeys_max_unchecked；作者写了层数的行不记', () => {
  const rows = rowsOf([['loc_b1', bld()], ['loc_b2', bld({ storeys: 1 })]]);
  const out = run({ rows, authoredIds: new Set(['loc_b1', 'loc_b2']), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.deferred.filter((d) => d.reason === 'storeys_max_unchecked').map((d) => d.id), ['loc_b1']);
});
