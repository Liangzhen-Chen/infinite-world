// 维度校验器单项（卷二 §4.1 L0–L3；§7 A2、A4、A5、A7 中 P-2 能覆盖的部分）。数据全是 fixture.mjs 里造的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { fixture, OPTIONS, sourcesOf, withKernelConstantsRules } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (f, opts = OPTIONS) => validateDimensions(sourcesOf(f), opts);
const codes = (r) => r.errors.filter((e) => e.severity === 'error').map((e) => e.code);
const errOf = (r, code) => r.errors.find((e) => e.code === code);

test('正例：造的最小表整体通过 L0–L3，展平值与取值算法一致', () => {
  const r = run(fixture());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  const flat = r.tables.get('gadget').flat;
  assert.equal(flat.classes.get('cls_tool').mass, 2);
  assert.equal(flat.classes.get('cls_heavy_tool').mass, 5.5);
  assert.equal(flat.classes.get('cls_heavy_tool').grade, 'grd_a');
  assert.ok(r.rx.size === 1);
  assert.match(r.text, /^errors=0 warnings=0 tables=1 rows=2 /m);
});

test('A2：删去 required:always 的值 → E-DIM-REQUIRED-MISSING，path 指到该行该维；加回通过', () => {
  const f = fixture();
  delete f.gadget.rows.gad_box.mass;
  const r = run(f);
  const e = errOf(r, 'E-DIM-REQUIRED-MISSING');
  assert.ok(e);
  assert.equal(e.row, 'gad_box');
  assert.equal(e.dim, 'mass');
  assert.equal(e.path, 'gadget.json#/rows/gad_box/mass');
  f.gadget.rows.gad_box.mass = 5;
  assert.deepEqual(codes(run(f)), []);
});

test('A2 同口径：byClass 条件成立时缺值报，不成立不计缺', () => {
  const f = fixture();
  delete f.gadget.classes.cls_tool.grade;
  const r = run(f);
  assert.deepEqual(r.errors.filter((e) => e.code === 'E-DIM-REQUIRED-MISSING').map((e) => `${e.row}.${e.dim}`), ['gad_hammer.grade']);
});

test('A4：非 ASCII id / 内联枚举 / 中文枚举值', () => {
  const f1 = fixture();
  f1.gadget.rows['gad_锤'] = { mass: 1, basis: 'b' };
  assert.ok(codes(run(f1)).includes('E-DIM-ID-FORMAT'));
  const f2 = fixture();
  f2.gadget.dimensions.grade = { ...f2.gadget.dimensions.grade, vocab: undefined, values: ['a', 'b'] };
  assert.ok(codes(run(f2)).includes('E-DIM-DOMAIN-ENUM'));
  const f3 = fixture();
  f3.gadget.classes.cls_tool.grade = '上等';
  const r3 = run(f3);
  assert.equal(errOf(r3, 'E-DIM-DOMAIN-ENUM').row, 'cls_tool');
});

test('A5：非必填维度缺 onUnknown → E-DIM-ONUNKNOWN-MISSING；必填 always 不要求', () => {
  const f = fixture();
  delete f.gadget.dimensions.parts.onUnknown;
  assert.deepEqual(codes(run(f)), ['E-DIM-ONUNKNOWN-MISSING']);
  const g = fixture();
  delete g.gadget.dimensions.mass.onUnknown;
  assert.deepEqual(codes(run(g)), []);
});

test('A7：两次运行输出逐字节相同（含有错时），键序打乱不改变输出', () => {
  const f = fixture();
  delete f.gadget.rows.gad_box.mass;
  f.gadget.rows.gad_x = { mass: 500, basis: '', parts: ['gad_none'] };
  const a = run(f).text;
  const b = run(f).text;
  assert.equal(a, b);
  const shuffled = fixture();
  delete shuffled.gadget.rows.gad_box.mass;
  shuffled.gadget.rows = { gad_x: { parts: ['gad_none'], basis: '', mass: 500 }, ...shuffled.gadget.rows };
  assert.equal(run(shuffled).text, a);
  assert.match(a, /\nerrors=4 warnings=0 tables=1 rows=3 /);
});

test('L0：重复键与表头', () => {
  const s = sourcesOf(fixture());
  s.tables[0].text = s.tables[0].text.replace('"namespace":"core"', '"namespace":"core","namespace":"core"');
  assert.ok(codes(validateDimensions(s, OPTIONS)).includes('E-DIM-DUPLICATE-KEY'));
  const f = fixture();
  f.gadget.kind = 'other';
  f.gadget.behaviors = [];
  f.gadget.namespace = 'nopack';
  // behaviors 空了，组件类 enables 随之不在表的 behaviors 里，一并报。
  assert.deepEqual(codes(run(f)).sort(), ['E-DIM-BEHAVIOR-UNKNOWN', 'E-DIM-COMPONENT-ENABLES', 'E-DIM-SCHEMA-KIND', 'E-DIM-SCHEMA-NAMESPACE']);
  const p = fixture();
  p.vocab.families.grade.prefix = 'gad_x';
  assert.ok(codes(run(p)).includes('E-DIM-VOCAB-PREFIX'));
});

test('L1：类型清单、单位、精度、modifiable、string 未登记、union 形态', () => {
  const f = fixture();
  f.gadget.dimensions.bogus = { type: 'float', required: 'never', onUnknown: 'skip', modifiable: false, source: 's', owner: 'o' };
  f.gadget.dimensions.size.unit = 'stone';
  f.gadget.dimensions.size.precision = 5;
  f.gadget.dimensions.grade.modifiable = true;
  f.gadget.dimensions.note2 = { type: 'string', domain: { maxLength: 9 }, required: 'never', onUnknown: 'skip', modifiable: false, source: 's', owner: 'o' };
  f.gadget.dimensions.either = { type: 'union', anyOf: [{ type: 'enum', vocab: 'grade' }, { type: 'ref', vocab: 'grade' }], required: 'never', onUnknown: 'skip', modifiable: false, source: 's', owner: 'o' };
  assert.deepEqual([...new Set(codes(run(f)))].sort(), ['E-DIM-MODIFIABLE-TYPE', 'E-DIM-SCHEMA-PRECISION', 'E-DIM-SCHEMA-TYPE', 'E-DIM-STRING-NOT-DISPLAY', 'E-DIM-UNION-SHAPE', 'E-DIM-UNIT-UNKNOWN', 'E-MOD-STACKING', 'E-MOD-BOUNDS'].sort());
});

test('L1：取值域、集合、结构、映射键集', () => {
  const f = fixture();
  f.gadget.rows.gad_box.mass = 101;
  f.gadget.rows.gad_box.parts = ['gad_hammer', 'gad_box'];
  f.gadget.rows.gad_box.spec = { high: 3, odd: 1 };
  f.gadget.rows.gad_hammer.weights = { grd_a: 1 };
  const r = run(f);
  assert.deepEqual([...new Set(codes(r))].sort(), ['E-DIM-DOMAIN-RANGE', 'E-DIM-DOMAIN-SIZE', 'E-DIM-MAP-SPARSE-NONSUM', 'E-DIM-STRUCT-FIELD']);
  assert.equal(errOf(r, 'W-DIM-GAP').dim, 'size'); // ifPresent:spec 成立；size 的 onUnknown 是 gap，缺值只报警告
});

test('W-DIM-GAP：onUnknown 为 gap 的必填维度缺值 → 警告、加载通过；非 gap 的必填缺值仍 E', () => {
  const f = fixture();
  f.gadget.rows.gad_box.spec = { low: 1, high: 2 }; // 使 size（ifPresent:spec，gap）成立而不填
  const r = run(f);
  assert.deepEqual(codes(r), []);
  assert.equal(r.ok, true);
  const w = r.errors.filter((e) => e.code === 'W-DIM-GAP');
  assert.deepEqual(w.map((e) => `${e.severity}:${e.row}.${e.dim}`), ['warning:gad_box.size']);
  f.gadget.rows.gad_box.size = 3;
  assert.deepEqual(run(f).errors, []);
  const g = fixture();
  g.gadget.dimensions.size.onUnknown = 'error';
  g.gadget.rows.gad_box.spec = { low: 1, high: 2 };
  const rg = run(g);
  assert.equal(rg.ok, false);
  assert.deepEqual(rg.errors.filter((e) => e.row === 'gad_box').map((e) => e.code), ['E-DIM-REQUIRED-MISSING']);
});

test('§1.6 第 4 项：键为代码内封闭枚举的映射也须覆盖全部取值', () => {
  const withMap = (value) => {
    const f = fixture();
    f.gadget.dimensions.byClock = { type: 'map', key: { type: 'enum', vocab: 'rx_clock' }, value: { type: 'number', unit: 'count', domain: [0, 9], precision: 0 }, required: 'never', onUnknown: 'error', modifiable: false, source: 's', owner: 'o' };
    f.gadget.rows.gad_box.byClock = value;
    return run(f);
  };
  assert.deepEqual(codes(withMap({ day: 1, season: null })), []);
  const r = withMap({ day: 1 });
  assert.deepEqual(codes(r), ['E-DIM-MAP-SPARSE-NONSUM']);
  assert.equal(errOf(r, 'E-DIM-MAP-SPARSE-NONSUM').got, 'missing season');
  assert.deepEqual(codes(withMap({ day: 1, season: null, week: 2 })), ['E-DIM-DOMAIN-ENUM']);
});

test('继承写法：每维一种、~/* 要父值、偏离行禁继承、extends 目标与成环', () => {
  const f = fixture();
  f.gadget.classes.cls_tool['mass~'] = 1;
  assert.ok(codes(run(f)).includes('E-DIM-EXTEND-CONFLICT'));
  const g = fixture();
  g.gadget.classes.cls_base = { abstract: true, basis: 'b' };
  assert.ok(codes(run(g)).includes('E-DIM-EXTEND-NOPARENT'));
  const h = fixture();
  h.gadget.generated.gad_gen = { 'mass~': 1, generated: { by: 'x', seedKey: 'k', at: 0 } };
  assert.ok(codes(run(h)).includes('E-DIM-EXTEND-ON-OVERRIDE'));
  const c = fixture();
  c.gadget.classes.cls_base = { abstract: true, extends: 'cls_tool', mass: 1, basis: 'b' };
  assert.ok(codes(run(c)).includes('E-DIM-CYCLE'));
  const t = fixture();
  t.gadget.rows.gad_box.extends = 'cls_tool';
  assert.ok(codes(run(t)).includes('E-DIM-EXTENDS-TARGET'));
  const ok = fixture();
  ok.gadget.rows.gad_box = { extends: 'gad_hammer', 'weights-': ['grd_b'], 'parts+': [], mass: 3, basis: 'b' };
  const r = run(ok);
  assert.deepEqual(r.tables.get('gadget').flat.rows.get('gad_box').weights, { grd_a: 1 });
  assert.ok(codes(r).every((x) => x === 'E-DIM-MAP-SPARSE-NONSUM'));
});

test('L2：类别、precedence、组件、引用闭合', () => {
  const f = fixture();
  f.gadget.rows.gad_box.classes = ['cls_nope', 'cmp_sharp'];
  f.gadget.precedenceGroups.default = ['cls_tool', 'cls_heavy_tool', 'cls_base'];
  f.gadget.rows.gad_hammer.parts = ['gad_ghost'];
  f.vocab.families.component.entries.cmp_sharp.enables = ['fly'];
  assert.deepEqual([...new Set(codes(run(f)))].sort(), ['E-DIM-ABSTRACT-IN-PRECEDENCE', 'E-DIM-CLASS-UNKNOWN', 'E-DIM-COMPONENT-ENABLES', 'E-DIM-PRECEDENCE-BROADER', 'E-DIM-REF-MISSING']);
});

test('L2：rx 在加载期编译，未登记命名空间与类型不符报错', () => {
  const f = fixture();
  f.gadget.rows.gad_hammer.rule = 'mass + grade';
  assert.deepEqual(codes(run(f)), ['E-MOD-RX']);
  const g = fixture();
  g.gadget.rows.gad_hammer.rule = 'nowhere.thing > 1';
  assert.deepEqual(codes(run(g)), ['E-RX-NS-UNKNOWN']);
});

test('L3：实体行 basis 与跨表 id 唯一', () => {
  const f = fixture();
  delete f.gadget.rows.gad_box.basis;
  assert.deepEqual(codes(run(f)), ['E-DIM-INSTANCE-BASIS']);
  const g = fixture();
  g.gadget.generated.gad_box = { mass: 1, generated: { by: 'x', seedKey: 'k', at: 0 } };
  assert.ok(codes(run(g)).includes('E-DIM-ID-DUPLICATE'));
});

test('加载器：从目录读表与内核常数，结果同内存调用', () => {
  const r = withKernelConstantsRules((rulesDir) => loadWorld(ROOT, { dimensionsDir: 'tests/kernel/dims', rulesDir }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.text, run(fixture(), { ...OPTIONS, ns: [] }).text);
});
