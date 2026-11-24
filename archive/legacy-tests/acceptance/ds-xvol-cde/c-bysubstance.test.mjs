// 验收测试（出题方 Claude Sonnet 5.5 中档，写码方不得看、不得改）：跨卷判定 C —— 卷二 `.required` 登记 bySubstance。
// 依据：卷三甲 §2.1 :167（定义：`bySubstance:<代号>,…` 表示本行 substance 是所列代号之一时必填，否则不适用；只读本行 substance，不读文字，写法与 byClass 平行）、
//   :107、:108（plantPart、plantFamily 必填 bySubstance:subst_plant,subst_wood，onUnknown gap）；卷三甲 :331 M-17、:332 M-20（缺了按 gap 记缺口、不阻加载；不适用的行写了即加载报错）；
//   卷二 §1.2 :105（`.required` 式子清单；勘误后补 bySubstance，material 专用命名条件，判据唯一定义在卷三甲 §2.1）；卷二 :1642 W-DIM-GAP；
//   裁定 X-C（docs/审查/李白裁定-1117.md 末段）；判定文 docs/研究/偏离清查-1122-跨卷判定.md 第 13 条。
// 测什么：经公开入口 validateDimensions，用虚构表 gadget（造的最小样例，不读世界数据）验：
//   ① 写法被登记、加载器接受；② 所列代号之一的行缺值 → W-DIM-GAP 且不阻加载（ok 仍为 true）；③ 不在所列的行、substance 留空的行不适用（不记缺口）；
//   ④ 不适用的行写了值 → 加载报错（M-17）；⑤ 形式不合的写法被拒（E-DIM-STRUCT-FIELD，码照 rows.mjs 对未登记式子的现行报法）；⑥ 所列代号取自表头串，换一组代号即换判定（不写死 subst_plant、subst_wood）。
// 修前为什么红：rows.mjs 的 REQ_FORMS 不收 bySubstance，表头 required 写 bySubstance:… 即报 E-DIM-STRUCT-FIELD，②③④⑥ 全连带失败；⑤ 对"形式不合"修前恰也拒，是修后不得放宽的对照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDimensions } from '../../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { fixture, OPTIONS, sourcesOf } from '../../kernel/fixture.mjs';

const run = (f) => validateDimensions(sourcesOf(f), OPTIONS);
const errs = (r) => r.errors.filter((e) => e.severity === 'error');
const gaps = (r) => r.errors.filter((e) => e.code === 'W-DIM-GAP').map((e) => `${e.row}:${e.dim}`).sort();
const common = { nullable: true, modifiable: false, source: 'test', owner: 'test' };

// 造的前提：substance（ref vocab substance，nullable）与 plantPart（ref vocab plant_part，nullable，必填写法随用例换）；
// 四行：草本、木质、金属、留空；plantPart 只给其中一部分行（各用例自己改）。
function world(required = 'bySubstance:subst_plant,subst_wood') {
  const f = fixture();
  f.vocab.families.substance = { closed: false, prefix: 'subst_', entries: { subst_plant: {}, subst_wood: {}, subst_metal: {} } };
  f.vocab.families.plant_part = { closed: false, prefix: 'ppart_', entries: { ppart_leaf: {}, ppart_stem: {} } };
  f.gadget.dimensions.substance = { type: 'ref', vocab: 'substance', required: 'never', onUnknown: 'skip', ...common };
  f.gadget.dimensions.plantPart = { type: 'ref', vocab: 'plant_part', required, onUnknown: 'gap', ...common };
  const r = f.gadget.rows;
  r.gad_herb = { mass: 1, substance: 'subst_plant', basis: 'b', status: 'vst_ok' };
  r.gad_timber = { mass: 1, substance: 'subst_wood', basis: 'b', status: 'vst_ok' };
  r.gad_ingot = { mass: 1, substance: 'subst_metal', basis: 'b', status: 'vst_ok' };
  r.gad_void = { mass: 1, basis: 'b', status: 'vst_ok' };
  return f;
}

test('C①：表头 required 写 bySubstance:代号,代号 被登记、加载器接受（表头零 E）；各行齐全时整表零 E 零 W', () => {
  const f = world();
  f.gadget.rows.gad_herb.plantPart = 'ppart_leaf';
  f.gadget.rows.gad_timber.plantPart = 'ppart_stem';
  const r = run(f);
  assert.deepEqual(errs(r), []);
  assert.equal(r.ok, true);
  assert.deepEqual(gaps(r), []);
});

test('C②：所列代号之一（草本、木质）的行缺 plantPart → 各记一条 W-DIM-GAP，不阻加载（卷三甲 M-17、onUnknown gap）', () => {
  const r = run(world());
  assert.deepEqual(errs(r), []);
  assert.equal(r.ok, true);
  assert.deepEqual(gaps(r), ['gad_herb:plantPart', 'gad_timber:plantPart']);
});

test('C③：substance 是所列之外的值（金属）或留空的行不适用：不记缺口、不报错（卷三甲 :167、M-17"不登记，不记缺口"）', () => {
  const f = world();
  f.gadget.rows.gad_herb.plantPart = 'ppart_leaf';
  f.gadget.rows.gad_timber.plantPart = 'ppart_stem';
  const r = run(f);
  assert.deepEqual(gaps(r), []);
  assert.equal(r.ok, true);
});

test('C④：不适用的行写了 plantPart → 加载报错（卷三甲 M-17、M-20 "写了即加载报错"）；金属行与留空行各一条，指向该行该维度', () => {
  const f = world();
  f.gadget.rows.gad_herb.plantPart = 'ppart_leaf';
  f.gadget.rows.gad_timber.plantPart = 'ppart_stem';
  f.gadget.rows.gad_ingot.plantPart = 'ppart_leaf';
  f.gadget.rows.gad_void.plantPart = 'ppart_stem';
  const r = run(f);
  assert.equal(r.ok, false);
  const bad = errs(r).filter((e) => e.dim === 'plantPart').map((e) => e.row).sort();
  assert.deepEqual(bad, ['gad_ingot', 'gad_void']);
});

test('C⑤：形式不合的写法被拒（表头 E-DIM-STRUCT-FIELD，dim 指该维度）：缺代号、空代号、尾逗号、含空格、代号大写、把 byClass 的冒号写成等号', () => {
  for (const bad of ['bySubstance', 'bySubstance:', 'bySubstance:subst_plant,', 'bySubstance:subst_plant, subst_wood', 'bySubstance:SUBST_PLANT', 'bySubstance=subst_plant', 'bySubstances:subst_plant']) {
    const r = run(world(bad));
    const hit = errs(r).filter((e) => e.code === 'E-DIM-STRUCT-FIELD' && e.dim === 'plantPart' && e.row === '');
    assert.equal(hit.length, 1, bad);
  }
});

test('C⑥：所列代号取自表头串、不写死：改写成只列 subst_metal，则金属行必填（缺即 W-DIM-GAP）、草本与木质行不适用', () => {
  const r = run(world('bySubstance:subst_metal'));
  assert.deepEqual(errs(r), []);
  assert.deepEqual(gaps(r), ['gad_ingot:plantPart']);
});

test('C⑦：bySubstance 可与别的条件以"；"并列，任一成立即必填（卷二 :105 "任一成立即必填"）：bySubstance:subst_plant；byClass:cls_tool 时，草本行与 cls_tool 行都必填、木质行不适用', () => {
  const f = world('bySubstance:subst_plant；byClass:cls_tool');
  f.gadget.rows.gad_hammer.plantPart = 'ppart_leaf'; // gad_hammer 属 cls_heavy_tool，沿词表上位到 cls_tool，已填
  const r = run(f);
  assert.deepEqual(errs(r), []);
  assert.deepEqual(gaps(r), ['gad_herb:plantPart']);
});
