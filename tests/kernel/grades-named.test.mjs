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

test('namedConditions 与 null（卷二 :254）：显式 null 是"没有"，条目对该行不成立；缺值才是未知，计为成立；求值器不收 null', () => {
  const { f, opts } = named('thing.tag == grd_b and env.heat <= 0');
  f.gadget.dimensions.tag = { type: 'ref', vocab: 'grade', nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' };
  f.gadget.rows.gad_hammer.tag = 'grd_b';
  const sizeRows = (r) => r.errors.filter((e) => e.dim === 'size').map((e) => e.row);
  // gad_box 没写 tag（未知）→ 成立；gad_hammer tag = grd_b → 成立。
  assert.deepEqual(sizeRows(run(f, opts)).sort(), ['gad_box', 'gad_hammer']);
  // gad_box 显式 null（没有）→ 条目不成立，不必填。
  f.gadget.rows.gad_box.tag = null;
  assert.deepEqual(sizeRows(run(f, opts)), ['gad_hammer']);
  // 求值器自己没有第五种读数类型：null 读数即求值失败。
  assert.throws(() => evaluateRX(compileRXInScope('thing.tag == grd_b', 'data', { ns: opts.ns, dims: new Map(), vocabIndex: new Map([['grd_b', { family: 'grade', prefix: 'grd_' }]]), maxDepth: 16 }).tree, {}, { 'thing.tag': null }), { code: 'E-MOD-RX' });
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
