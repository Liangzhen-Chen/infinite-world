// 表头声明的两项通用机制，用虚构表 gadget 验（不认材料表名）：
// ① cellGrades —— 逐格来源级别（卷三甲 §2.1、M-22 的 ①–④）；② namedConditions —— 命名必填条件（卷三甲 §2.1 byDigestible 的判法）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { compileRXInScope, evaluateRX } from '../../server-plugin/kernel/rx.mjs';
import { gradedCells } from '../../server-plugin/kernel/validate/cell-grades.mjs';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';

const run = (f, opts = OPTIONS) => validateDimensions(sourcesOf(f), opts);
const codes = (r) => r.errors.map((e) => `${e.code}:${e.row}`).sort();
const D = (basis) => ({ grade: 'designed', citation: null, basis });
const M = (citation) => ({ grade: 'measured', citation, basis: null });
const B = { grade: 'referenced', citation: null, basis: null };

// gadget 加一个参照维度、声明 cellGrades；各行逐格写级别。
function graded() {
  const f = fixture();
  const g = f.gadget;
  g.dimensions.refGadget = { type: 'ref', kind: 'gadget', nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' };
  g.cellGrades = { field: 'cellGrades', refDim: 'refGadget' };
  g.rows.gad_box.spec = { low: 1, high: 4 };
  g.rows.gad_box.size = 2;
  g.rows.gad_box.cellGrades = { mass: M('称重记录 7 号'), 'spec.low': D('设定'), 'spec.high': D('设定'), size: D('设定') };
  g.rows.gad_hammer.mass = 5;
  g.rows.gad_hammer.refGadget = 'gad_box';
  g.rows.gad_hammer.cellGrades = { mass: B, 'weights.grd_a': D('设定') };
  g.classes.cls_base.cellGrades = { mass: D('设定') };
  g.classes.cls_tool.cellGrades = { mass: D('设定') };
  g.classes.cls_heavy_tool.cellGrades = { mass: D('设定') };
  return f;
}

test('cellGrades 正例：键集合等于填了值的格（struct 逐字段、map 逐键、null 与引用不带），类别行同样逐格；零 E', () => {
  const f = graded();
  assert.deepEqual([...gradedCells(f.gadget.dimensions, f.gadget.rows.gad_hammer).keys()], ['mass', 'weights.grd_a']);
  assert.deepEqual(run(f).errors, []);
});

test('cellGrades ①：少一格、多一格、整个字段缺都是 E-MAT-GRADE-KEYS；表头没声明时写了即 E-DIM-STRUCT-FIELD', () => {
  const a = graded(); delete a.gadget.rows.gad_box.cellGrades.size;
  assert.deepEqual(codes(run(a)), ['E-MAT-GRADE-KEYS:gad_box']);
  const b = graded(); b.gadget.rows.gad_box.cellGrades.parts = D('x');
  assert.deepEqual(codes(run(b)), ['E-MAT-GRADE-KEYS:gad_box']);
  const c = graded(); delete c.gadget.classes.cls_tool.cellGrades;
  assert.deepEqual(codes(run(c)), ['E-MAT-GRADE-KEYS:cls_tool']);
  const d = graded(); delete d.gadget.cellGrades;
  assert.ok(run(d).errors.filter((e) => e.code === 'E-DIM-STRUCT-FIELD').length >= 5);
});

test('cellGrades 表头格式错（非对象、field 缺或非串、refDim 非串、多余键）→ 各报一条 E-DIM-STRUCT-FIELD，不静默跳过；正确声明零 E', () => {
  for (const bad of ['cellGrades', ['field'], {}, { field: 7 }, { field: 'cellGrades', refDim: 3 }, { field: 'cellGrades', refDim: 'refGadget', extra: 1 }]) {
    const f = graded(); f.gadget.cellGrades = bad;
    const errs = run(f).errors.filter((e) => e.dim === 'cellGrades' && e.code === 'E-DIM-STRUCT-FIELD' && e.row === '');
    assert.equal(errs.length, 1, JSON.stringify(bad));
  }
  const ok = graded(); ok.gadget.cellGrades = { field: 'cellGrades' };
  assert.equal(run(ok).errors.filter((e) => e.row === '' && e.dim === 'cellGrades').length, 0);
});

test('cellGrades ②：measured 无 citation、designed 无 basis、级别不在三值内、条目字段不齐 → E-MAT-GRADE-FIELD', () => {
  for (const bad of [M(null), D(''), { grade: 'guessed', citation: null, basis: 'x' }, { grade: 'designed', basis: 'x' }]) {
    const f = graded(); f.gadget.rows.gad_box.cellGrades.size = bad;
    assert.deepEqual(codes(run(f)), ['E-MAT-GRADE-FIELD:gad_box'], JSON.stringify(bad));
  }
});

test('cellGrades ③④：referenced 无参照行、参照格不是 measured、值不等 → E-MAT-GRADE-REF；有参照行却无 referenced 格 → W-MAT-REF-UNUSED', () => {
  const a = graded(); a.gadget.rows.gad_hammer.refGadget = null;
  assert.deepEqual(codes(run(a)), ['E-MAT-GRADE-REF:gad_hammer']);
  const b = graded(); b.gadget.rows.gad_box.cellGrades.mass = D('设定');
  assert.deepEqual(codes(run(b)), ['E-MAT-GRADE-REF:gad_hammer']);
  const c = graded(); c.gadget.rows.gad_hammer.mass = 6;
  assert.deepEqual(codes(run(c)), ['E-MAT-GRADE-REF:gad_hammer']);
  const d = graded(); d.gadget.rows.gad_hammer.cellGrades.mass = D('设定');
  const rd = run(d);
  assert.equal(rd.ok, true);
  assert.deepEqual(codes(rd), ['W-MAT-REF-UNUSED:gad_hammer']);
});

// namedConditions：gadget 的 size 改为命名条件必填（名字只能取卷二 §1.2 已收的写法）；判据读 grade 族条目上的 rx 字段 `fits`。
function named(fits) {
  const f = fixture();
  f.vocab.families.grade.entries.grd_a.fits = fits;
  f.gadget.dimensions.size.required = 'byDigestible';
  f.gadget.namedConditions = { byDigestible: { family: 'grade', field: 'fits', rowNs: 'thing', reads: { 'env.heat': 0 } } };
  const opts = { ...OPTIONS, ns: [...OPTIONS.ns, { ns: 'thing', shape: '<维度键>，另有 classes（set，只作 member 的 set）', type: 'field' }, { ns: 'env.heat', shape: 'number', type: 'number' }] };
  return { f, opts };
}

test('namedConditions：条目条件对行为真即必填，为假不必填，读到未知的维度按"未知"计为必填；本行读数与固定读数都可用', () => {
  const { f, opts } = named('thing.mass > 3 and env.heat <= 0');
  const r = run(f, opts);
  // gad_box mass 5 > 3 → 必填而缺（gap）；gad_hammer 的 mass 取类别行 5.5 → 同样必填。
  assert.deepEqual(r.errors.filter((e) => e.dim === 'size').map((e) => `${e.code}:${e.row}`).sort(), ['W-DIM-GAP:gad_box', 'W-DIM-GAP:gad_hammer']);
  assert.ok(!r.notCovered.includes('gadget.size:byDigestible'));
  f.vocab.families.grade.entries.grd_a.fits = 'thing.mass > 50';
  assert.deepEqual(run(f, opts).errors.filter((e) => e.dim === 'size'), []);
  f.vocab.families.grade.entries.grd_a.fits = 'thing.spec > 1';
  assert.equal(run(f, opts).errors.filter((e) => e.dim === 'size').length, 2);
  f.vocab.families.grade.entries.grd_a.fits = 'thing.classes has cls_tool';
  assert.deepEqual(run(f, opts).errors.filter((e) => e.dim === 'size').map((e) => e.row), ['gad_hammer']);
});

// 整类通则（卷二 §1.6 第 2 点）：nullable 字段的显式 null 是已知值、表示没有任何条目，比较时只等于 null：
// != 成立、== 不成立；缺值是未知，计为成立。不读任何字段说明文字。
function tagged(fits, nullable = true) {
  const { f, opts } = named(fits);
  f.gadget.dimensions.tag = { type: 'ref', vocab: 'grade', ...(nullable ? { nullable: true } : {}), required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' };
  const rows = (r) => r.errors.filter((e) => e.dim === 'size').map((e) => e.row);
  // 只让 gad_box 带被测的 tag 取值；gad_hammer 恒为 grd_a（!= grd_b 成立、== grd_b 不成立），作对照。
  f.gadget.rows.gad_hammer.tag = 'grd_a';
  return { f, opts, rows, setBox: (v) => { if (v === undefined) delete f.gadget.rows.gad_box.tag; else f.gadget.rows.gad_box.tag = v; } };
}

test('namedConditions 与 null（卷二 §1.6 第 2 点）：nullable 字段显式 null 时，!= 成立、== 不成立；缺值是未知，两种比较都计为成立；等于别的值照常', () => {
  const ne = tagged('thing.tag != grd_b and env.heat <= 0');
  ne.setBox(null);
  assert.deepEqual(ne.rows(run(ne.f, ne.opts)).sort(), ['gad_box', 'gad_hammer'], '!= 对显式 null 成立');
  ne.setBox(undefined);
  assert.deepEqual(ne.rows(run(ne.f, ne.opts)).sort(), ['gad_box', 'gad_hammer'], '!= 缺值（未知）成立');
  ne.setBox('grd_b');
  assert.deepEqual(ne.rows(run(ne.f, ne.opts)), ['gad_hammer'], '!= 等于 grd_b 不成立');
  ne.setBox('grd_a');
  assert.deepEqual(ne.rows(run(ne.f, ne.opts)).sort(), ['gad_box', 'gad_hammer'], '!= 等于别的值成立');

  const eq = tagged('thing.tag == grd_b and env.heat <= 0');
  eq.setBox(null);
  assert.deepEqual(eq.rows(run(eq.f, eq.opts)), [], '== 对显式 null 不成立');
  eq.setBox(undefined);
  assert.deepEqual(eq.rows(run(eq.f, eq.opts)), ['gad_box'], '== 缺值（未知）成立');
  eq.setBox('grd_b');
  assert.deepEqual(eq.rows(run(eq.f, eq.opts)), ['gad_box'], '== 等于 grd_b 成立');
  eq.setBox('grd_a');
  assert.deepEqual(eq.rows(run(eq.f, eq.opts)), [], '== 等于别的值不成立');
});

test('namedConditions 与 null：两边都是显式 null 时 == 成立、!= 不成立（null 只等于 null）', () => {
  // gad_box 两边都是显式 null；gad_hammer 两边同为 grd_a（== 成立、!= 不成立），作对照。
  for (const [op, expected] of [['==', ['gad_box', 'gad_hammer']], ['!=', []]]) {
    const t = tagged(`thing.tag ${op} thing.tag2 and env.heat <= 0`);
    t.f.gadget.dimensions.tag2 = { ...t.f.gadget.dimensions.tag };
    t.f.gadget.rows.gad_hammer.tag2 = 'grd_a';
    t.f.gadget.rows.gad_box.tag2 = null;
    t.setBox(null);
    assert.deepEqual(t.rows(run(t.f, t.opts)).sort(), expected, `${op} 两边显式 null`);
  }
});

// 李白 11-17 显式 null 遗留问题裁定第 2 条（卷二 §1.6 第 2 点，勘误 1117rx2 续）：序比较与 member 遇显式 null 不成立，外层 not 取反成立；
// 缺值是未知，经 not 仍是未知，按"为真或为未知"计入成立。gad_hammer 的值恒让内层成立，作对照；期望值按裁定手写。
function nullable(fits, dim, def, hammerVal) {
  const { f, opts } = named(fits);
  f.gadget.dimensions[dim] = { ...def, nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' };
  f.gadget.rows.gad_hammer[dim] = hammerVal;
  const o = { ...opts, ns: opts.ns.map((n) => (n.ns === 'thing' ? { ...n, shape: `${n.shape}、parts（set，只作 member 的 set）` } : n)) };
  const rows = (r) => r.errors.filter((e) => e.dim === 'size').map((e) => e.row).sort();
  return { f, opts: o, rows, setBox: (v) => { if (v === undefined) delete f.gadget.rows.gad_box[dim]; else f.gadget.rows.gad_box[dim] = v; } };
}
const QTY = { type: 'number', unit: 'kg', domain: [0, 100], precision: 1 };
const PARTS = { type: 'set', of: { type: 'ref', vocab: 'grade' }, domain: { maxSize: 3 } };

test('namedConditions 与显式 null 序比较：null < x 不成立，!(null < x) 成立；缺值经 not 仍是未知，计入成立', () => {
  const lt = nullable('thing.qty < 3 and env.heat <= 0', 'qty', QTY, 1);
  lt.setBox(null);
  assert.deepEqual(lt.rows(run(lt.f, lt.opts)), ['gad_hammer'], 'null < 3 不成立');
  const nt = nullable('!(thing.qty < 3) and env.heat <= 0', 'qty', QTY, 1);
  nt.setBox(null);
  assert.deepEqual(nt.rows(run(nt.f, nt.opts)), ['gad_box'], '!(null < 3) 成立；hammer 的 1 < 3 取反不成立');
  nt.setBox(undefined);
  assert.deepEqual(nt.rows(run(nt.f, nt.opts)), ['gad_box'], '缺值套 not 仍未知，计入成立');
});

test('namedConditions 与显式 null member：member 集合为 null 不成立，!(member) 成立；缺值套 not 仍未知', () => {
  const m = nullable('thing.parts has grd_a and env.heat <= 0', 'parts', PARTS, ['grd_a']);
  m.setBox(null);
  assert.deepEqual(m.rows(run(m.f, m.opts)), ['gad_hammer'], 'member(grd_a, null) 不成立');
  const nm = nullable('!(thing.parts has grd_a) and env.heat <= 0', 'parts', PARTS, ['grd_a']);
  nm.setBox(null);
  assert.deepEqual(nm.rows(run(nm.f, nm.opts)), ['gad_box'], '!(member(grd_a, null)) 成立；hammer 含 grd_a 取反不成立');
  nm.setBox(undefined);
  assert.deepEqual(nm.rows(run(nm.f, nm.opts)), ['gad_box'], '缺值套 not 仍未知，计入成立');
});

test('namedConditions 与 null：未声明 nullable 的字段写显式 null，加载时在取值域校验层报 E-DIM-DOMAIN-RANGE；求值器不收 null', () => {
  const bad = tagged('thing.tag != grd_b and env.heat <= 0', false);
  bad.setBox(null);
  const r = run(bad.f, bad.opts);
  assert.ok(r.errors.some((e) => e.code === 'E-DIM-DOMAIN-RANGE' && e.row === 'gad_box' && e.dim === 'tag'), JSON.stringify(r.errors));
  const ne = tagged('thing.tag != grd_b and env.heat <= 0');
  // 求值器自己没有第五种读数类型：null 读数即求值失败。
  assert.throws(() => evaluateRX(compileRXInScope('thing.tag == grd_b', 'data', { ns: ne.opts.ns, dims: new Map(), vocabIndex: new Map([['grd_b', { family: 'grade', prefix: 'grd_' }]]), maxDepth: 16 }).tree, {}, { 'thing.tag': null }), { code: 'E-MOD-RX' });
});

test('namedConditions 反例：条目条件编不过报在词表条目上；族不存在报 E-DIM-REF-MISSING；未声明的命名条件只记 notCovered', () => {
  const { f, opts } = named('thing.mass >');
  const r = run(f, opts);
  assert.ok(r.errors.some((e) => e.code === 'E-MOD-RX' && e.table === '_vocab' && e.row === 'grd_a'));
  f.vocab.families.grade.entries.grd_a.fits = 'other.mass > 1';
  assert.ok(run(f, opts).errors.some((e) => e.code === 'E-RX-NS-UNKNOWN' && e.row === 'grd_a'));
  f.gadget.namedConditions.byDigestible.family = 'nope';
  assert.ok(run(f, opts).errors.some((e) => e.code === 'E-DIM-REF-MISSING' && e.dim === 'namedConditions.byDigestible'));
  delete f.gadget.namedConditions;
  assert.ok(run(f, opts).notCovered.includes('gadget.size:byDigestible'));
});
