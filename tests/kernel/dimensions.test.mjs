// 块 2 第 2-5 张《求值管线》：dim、modified、explain 与九步定点管线（卷二 §2.1 :436、§2.2 :445–448、§1.3 取值算法、§3.2 修正项格式、§3.3 :1319–1362）。
// 测试表是 fixture.mjs 的虚构表 gadget 加两个本文件造的修正键（workSpeed、upkeep），不是世界内容。期望值一律按卷文公式手算成字面量，不用被测函数算：
//   附录 B（卷二 :2522–2525）：1.0000 →add 0.05→ 1.0500 →×1.2000→ 1.2600 →×1.0869→ 1.3694 →×1.0500→ 1.4378 →×0.8500→ 1.2221。

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { installVocab, registry } from '../../server-plugin/kernel/vocab.mjs';
import { modKeyOf } from '../../server-plugin/kernel/handles/keys.mjs';
import { compileRXInScope } from '../../server-plugin/kernel/rx.mjs';
import { dim, modified, explain, runPipeline, installModifierSource, resetModifierSource } from '../../server-plugin/kernel/dimensions.mjs';
import { sample } from '../../server-plugin/kernel/sample.mjs';
import { resetMemos } from '../../server-plugin/kernel/memo.mjs';

// 叠加惩罚表（卷二 :1356 S[0..8]，照抄字面量）。
const STACKING = [1.0000, 0.8691, 0.5706, 0.2830, 0.1060, 0.0300, 0.0064, 0.0010, 0.0001];

// 采样经 kernel/save.mjs 的 sha256Text（卷二 §2.9 :984，kernel 不 import node:crypto）：测试里装一个摘要能力。
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

function world() {
  const f = fixture();
  const common = { required: 'never', onUnknown: 'gap', source: 'test', owner: 'test' };
  f.gadget.dimensions.workSpeed = { type: 'number', unit: 'count', domain: [0, 10], precision: 4, modifiable: true, stacking: 'penalized', bounds: [0.2, 3], ...common };
  f.gadget.dimensions.upkeep = { type: 'map', key: { type: 'ref', vocab: 'grade' }, value: { type: 'number', unit: 'count', domain: [0, 100], precision: 2 }, modifiable: true, stacking: 'none', bounds: [0, 100], ...common };
  // 派生维度（§1.12 derived）同样 modifiable：登记即成修正键，不另写槽（体检 K2-05）。
  f.gadget.dimensions.reach = { type: 'number', unit: 'kg', domain: [0, 200], precision: 2, derived: 'mass * 2', modifiable: true, stacking: 'none', bounds: [0, 200], ...common };
  // 派生递推（引用另一个派生维度）、按 precision 截断、引用未知维度、维度级自环、编译失败、派生变量只读基值。
  f.gadget.dimensions.reachArea = { type: 'number', unit: 'count', domain: [0, 40000], precision: 2, derived: 'reach * reach', modifiable: false, ...common };
  f.gadget.dimensions.halfMass = { type: 'number', unit: 'kg', domain: [0, 100], precision: 2, derived: 'mass / 3', modifiable: false, ...common };
  f.gadget.dimensions.doubleSpeed = { type: 'number', unit: 'count', domain: [0, 20], precision: 2, derived: 'workSpeed * 2', modifiable: false, ...common };
  f.gadget.dimensions.gradeIsA = { type: 'boolean', derived: 'grade == grd_a', modifiable: false, ...common };
  // 带 recursive 的自引用：加载期不判环（§1.2 .recursive、§1.12 RA-N3），读时因聚合原语未建报 E-MOD-RX。
  f.gadget.dimensions.deep = { type: 'number', unit: 'kg', domain: [0, 100], precision: 2, derived: 'deep + 1', recursive: { relation: 'rel_part' }, modifiable: false, ...common };
  // 抽样维度（§1.10 sample）：实例无值、类别行无值时经 sample 求值；有实例值即按 §1.3 取值顺序先取实例值。
  f.gadget.dimensions.smell = { type: 'number', unit: 'count', domain: [0, 10], precision: 2, sample: { dist: 'uniform', min: 1, max: 3 }, modifiable: false, ...common };
  f.gadget.rows.gad_box.smell = 7;
  f.gadget.rows.gad_box.workSpeed = 1;
  f.gadget.rows.gad_box.upkeep = { grd_a: 12, grd_b: 3 };
  f.gadget.rows.gad_box.spec = { low: 1, high: 2 };
  f.gadget.rows.gad_box.size = 1;
  const report = validateDimensions(sourcesOf(f), OPTIONS);
  return report;
}

const report = world();
installVocab(report);
const engine = { tables: report.tables, vocab: report.vocab, rules: { modifiers: { stackingTable: STACKING } }, template: { seed: 'fixture_seed' }, env: report.env };
const scope = { dims: new Map(Object.entries(report.tables.get('gadget').doc.dimensions)), vocabIndex: report.vocab.index, ns: [], maxDepth: 16 };
const rx = (text) => compileRXInScope(text, 'data', scope).tree;

// 修正项来源：测试按 (target) 交入一组行。
let rows = [];
installModifierSource(() => rows);
const use = (list) => { rows = list; resetMemos(); };
const row = (id, target, stage, value, extra = {}) => ({ id, target, stage, value, source: { kind: 'test', id: `src_${id}` }, ...extra });
const W = 'gadget.workSpeed';

test('前提：测试表通过 L0–L3', () => {
  assert.deepEqual(report.errors.filter((e) => e.severity === 'error'), []);
});

test('dim：实体行值、类别链（含 extends 展平与 broader 成员）、存档偏离行覆盖、byClass 不适用、未知', () => {
  const st = {};
  assert.deepEqual(dim(engine, st, 'gadget', 'gad_box', 'mass'), { known: true, applicable: true, value: 5, source: 'instance', unit: 'kg' });
  // cls_base 1 → cls_tool ×2 = 2 → cls_heavy_tool ~3.5 = 5.5（§1.3 继承写法）
  assert.deepEqual(dim(engine, st, 'gadget', 'gad_hammer', 'mass'), { known: true, applicable: true, value: 5.5, source: 'class', chain: ['cls_heavy_tool'], unit: 'kg' });
  // grade 的 required 是 byClass:cls_tool：hammer 经 broader 属 cls_tool，box 不属 → 不适用（§1.6 三种状态）
  assert.equal(dim(engine, st, 'gadget', 'gad_hammer', 'grade').value, 'grd_a');
  assert.deepEqual(dim(engine, st, 'gadget', 'gad_box', 'grade'), { known: false, applicable: false });
  assert.deepEqual(dim(engine, st, 'gadget', 'gad_hammer', 'workSpeed'), { known: false, applicable: true });
  assert.deepEqual(dim(engine, { created: { gad_hammer: { props: { mass: 9 } } } }, 'gadget', 'gad_hammer', 'mass'), { known: true, applicable: true, value: 9, source: 'instance', unit: 'kg' });
  assert.equal(dim(engine, st, 'gadget', 'gad_box', 'upkeep', { key: 'grd_b' }).value, 3);
  assert.throws(() => dim(engine, st, 'gadget', 'gad_box', 'nosuch'), (e) => e.code === 'E-DIM-REF-MISSING');
});

test('派生维度：类别链之后求值，变量读基值，派生可引用派生，结果按 precision 向零截断（§1.3、§1.12）', () => {
  const st = {};
  // gad_box：mass 是实体行值 5 → reach=5×2=10、reachArea=10×10=100、halfMass=5÷3=1.6666…→1.66
  assert.deepEqual(dim(engine, st, 'gadget', 'gad_box', 'reach'), { known: true, applicable: true, value: 10, source: 'derived', unit: 'kg' });
  assert.deepEqual(dim(engine, st, 'gadget', 'gad_box', 'reachArea'), { known: true, applicable: true, value: 100, source: 'derived', unit: 'count' });
  assert.equal(dim(engine, st, 'gadget', 'gad_box', 'halfMass').value, 1.66);
  // gad_hammer：mass 走类别链（1 ×2 ~3.5）得 5.5 → reach=11、reachArea=121、halfMass=5.5÷3=1.8333…→1.83
  assert.equal(dim(engine, st, 'gadget', 'gad_hammer', 'reach').value, 11);
  assert.equal(dim(engine, st, 'gadget', 'gad_hammer', 'reachArea').value, 121);
  assert.equal(dim(engine, st, 'gadget', 'gad_hammer', 'halfMass').value, 1.83);
});

test('派生未知传播：任一变量未知或不适用即整条未知（§1.12 TA-S1，不静默当 0）', () => {
  // grade 对 gad_box 不适用（required: byClass:cls_tool）→ gradeIsA 未知
  assert.deepEqual(dim(engine, {}, 'gadget', 'gad_box', 'gradeIsA'), { known: false, applicable: true });
  // gad_hammer 属 cls_tool，grade=grd_a → 真
  assert.deepEqual(dim(engine, {}, 'gadget', 'gad_hammer', 'gradeIsA'), { known: true, applicable: true, value: true, source: 'derived' });
});

test('派生变量一律读基值，不读修正后值（§1.12 :378）', () => {
  use([row('m_speed', 'gadget.workSpeed', 'add', 1)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 2);
  // 若读修正后值会得 4；基值 1 → 2
  assert.equal(dim(engine, {}, 'gadget', 'gad_box', 'doubleSpeed').value, 2);
  use([]);
});

// 加载期编译与 L1（卷二 §2.9 第 4 条 :1182–:1183、§4.1 L1 :1500）：派生式按本表维度编成树，读时只消费这棵树。
const derivedDef = (extra) => ({ type: 'number', unit: 'kg', domain: [0, 200], precision: 2, modifiable: false, required: 'never', onUnknown: 'gap', source: 'test', owner: 'test', ...extra });
// 第二张表：与 gadget 同名不同定义的 radius（测本表编译范围），另有 thickness（测跨表变量）。
const widgetTable = () => ({
  kind: 'widget', namespace: 'core', version: 1,
  entity: { idPrefix: ['wgt_'], classPrefix: 'cls_', singletonIds: [], instanceTable: null },
  behaviors: ['use'],
  dimensions: {
    radius: { type: 'number', unit: 'count', domain: [0, 100], precision: 1, required: 'always', onUnknown: 'error', modifiable: false, source: 'test', owner: 'test' },
    thickness: { type: 'number', unit: 'kg', domain: [0, 100], precision: 2, required: 'never', onUnknown: 'gap', modifiable: false, source: 'test', owner: 'test' },
  },
  precedenceGroups: { default: [] },
  classes: {}, rows: {}, generated: {},
});
const twoTables = (f, widget) => ({ units: JSON.stringify(f.units), vocab: JSON.stringify(f.vocab), tables: [
  { file: 'gadget.json', text: JSON.stringify(f.gadget) },
  { file: 'widget.json', text: JSON.stringify(widget) },
] });
const errorsOf = (r) => r.errors.filter((e) => e.severity === 'error');
const hasErr = (r, code, dim) => errorsOf(r).some((e) => e.code === code && e.dim === dim);
// 未建派生登记（卷二 §1.12 封卷后勘误 1118k23）：登记表是机读文件，测试按同一形状造。
const registryOf = (entries) => JSON.stringify({ version: 1, entries });
const withUnbuilt = (sources, entries) => ({ ...sources, unbuilt: registryOf(entries) });
const unbuiltEntry = (dimension, extra = {}) => ({ table: 'gadget', dimension, missing: ['data', 'primitive'], card: 'pre_first_reader_card', ...extra });

test('加载期：派生式编译失败报 E-MOD-RX（§2.9 第 4 条 :1183）；空串同样拒收', () => {
  const f = fixture();
  f.gadget.dimensions.badSyntax = derivedDef({ derived: 'mass +' });
  f.gadget.dimensions.emptyDerived = derivedDef({ derived: '' });
  const r = validateDimensions(sourcesOf(f), OPTIONS);
  assert.ok(hasErr(r, 'E-MOD-RX', 'badSyntax'));
  assert.ok(hasErr(r, 'E-MOD-RX', 'emptyDerived'));
});

test('加载期：变量不在本表报 E-DIM-DERIVED-VAR（§4.1 L1 :1500"变量存在"）', () => {
  const f = fixture();
  f.gadget.dimensions.foreignReach = derivedDef({ derived: 'thickness * 2' });
  assert.ok(hasErr(validateDimensions(twoTables(f, widgetTable()), OPTIONS), 'E-DIM-DERIVED-VAR', 'foreignReach'));
});

test('加载期：自引用不带 recursive 报 E-DIM-DERIVED-CYCLE（§1.12 RA-N3 :380）', () => {
  const f = fixture();
  f.gadget.dimensions.loop = derivedDef({ derived: 'loop + 1' });
  assert.ok(hasErr(validateDimensions(sourcesOf(f), OPTIONS), 'E-DIM-DERIVED-CYCLE', 'loop'));
});

test('加载期：两表同名不同定义时，本表派生按本表维度编译（卷二 :372、:378"主体的基值维度"）', () => {
  const f = fixture();
  // gadget 的 radius 与 widget 的 radius 单位、精度都不同；areaX 必须按 gadget 自己的 radius 编译
  f.gadget.dimensions.radius = { type: 'number', unit: 'kg', domain: [0, 100], precision: 2, required: 'never', onUnknown: 'gap', modifiable: false, source: 'test', owner: 'test' };
  f.gadget.dimensions.areaX = derivedDef({ derived: 'radius * radius' });
  assert.deepEqual(errorsOf(validateDimensions(twoTables(f, widgetTable()), OPTIONS)), []);
});

test('加载期：map 派生维度按 E-MOD-RX 拒收（RX 变体没有产出 map/set 的，§2.9 第 4 条 :1163–:1182）', () => {
  const f = fixture();
  f.gadget.dimensions.mapDerived = {
    type: 'map', key: { type: 'ref', vocab: 'grade' }, value: { type: 'number', unit: 'kg', domain: [0, 10], precision: 1 },
    derived: 'mass', modifiable: false, required: 'never', onUnknown: 'gap', source: 'test', owner: 'test',
  };
  assert.ok(hasErr(validateDimensions(sourcesOf(f), OPTIONS), 'E-MOD-RX', 'mapDerived'));
});

test('未建派生登记：登记里的派生加载期跳过不报错，列入 unbuilt 且不出编译树（§1.12 勘误 1118k23）', () => {
  const f = fixture();
  f.gadget.dimensions.unbuiltThing = derivedDef({ derived: '卷三乙 §2.1：由 strength 合成' });
  const r = validateDimensions(withUnbuilt(sourcesOf(f), [unbuiltEntry('unbuiltThing')]), OPTIONS);
  assert.deepEqual(errorsOf(r), []);
  const t = r.tables.get('gadget');
  assert.ok(t.unbuilt.has('unbuiltThing'));
  assert.ok(!t.derived.has('unbuiltThing'));
});

test('未建派生登记：没登记又编不过的仍报 E-MOD-RX、加载失败（§2.9 第 4 条 :1183）', () => {
  const f = fixture();
  f.gadget.dimensions.unbuiltThing = derivedDef({ derived: '卷三乙 §2.1' });
  const r = validateDimensions(sourcesOf(f), OPTIONS);
  assert.ok(hasErr(r, 'E-MOD-RX', 'unbuiltThing'));
  assert.equal(r.ok, false);
});

test('运行期读登记里的未建派生：抛已登记码 E-MOD-RX，不静默给值（§1.12 勘误 1118k23）', () => {
  const f = fixture();
  f.gadget.dimensions.unbuiltThing = derivedDef({ derived: '卷三乙 §2.1' });
  const rep = validateDimensions(withUnbuilt(sourcesOf(f), [unbuiltEntry('unbuiltThing')]), OPTIONS);
  installVocab(rep);
  try {
    const eng = { tables: rep.tables, vocab: rep.vocab, rules: engine.rules, template: engine.template, env: rep.env };
    assert.throws(() => dim(eng, {}, 'gadget', 'gad_box', 'unbuiltThing'), (e) => e.code === 'E-MOD-RX');
  } finally { installVocab(report); }
});

test('未建派生登记双向核：登记了已能编译的派生、或登记了非派生维度，都按已登记码拒收（§1.12 勘误 1118k23）', () => {
  const a = fixture();
  a.gadget.dimensions.volumeX = derivedDef({ derived: 'mass * 2' });
  assert.ok(hasErr(validateDimensions(withUnbuilt(sourcesOf(a), [unbuiltEntry('volumeX')]), OPTIONS), 'E-DIM-STRUCT-FIELD', 'volumeX'));
  const b = fixture();
  assert.ok(hasErr(validateDimensions(withUnbuilt(sourcesOf(b), [unbuiltEntry('mass')]), OPTIONS), 'E-DIM-REF-MISSING', 'mass'));
});

test('加载期反查索引：reverseIndex 维度按全表建成只读集合，无行指向为空集（§1.12 勘误 1118k23；卷三乙 :627）', () => {
  const f = fixture();
  f.gadget.dimensions.maker = { type: 'map', key: { type: 'ref', vocab: 'grade' }, value: { type: 'ref', kind: 'gadget' }, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' };
  f.gadget.dimensions.heirs = { type: 'set', of: { type: 'ref', vocab: 'grade' }, domain: { maxSize: 3 }, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test', reverseIndex: 'maker' };
  // gad_box 的 maker[grd_a] 指向 gad_hammer：gad_hammer.heirs = {grd_a}；没有行指向 gad_box → 空集。
  f.gadget.rows.gad_box.maker = { grd_a: 'gad_hammer' };
  const rep = validateDimensions(sourcesOf(f), OPTIONS);
  assert.deepEqual(errorsOf(rep), []);
  installVocab(rep);
  try {
    const eng = { tables: rep.tables, vocab: rep.vocab, rules: engine.rules, template: engine.template, env: rep.env };
    assert.deepEqual(dim(eng, {}, 'gadget', 'gad_hammer', 'heirs'), { known: true, applicable: true, value: ['grd_a'], source: 'index' });
    assert.deepEqual(dim(eng, {}, 'gadget', 'gad_box', 'heirs').value, []);
    // 手填反查维度即 E-DIM-DERIVED-WRITTEN。
    const bad = fixture();
    bad.gadget.dimensions.maker = f.gadget.dimensions.maker;
    bad.gadget.dimensions.heirs = f.gadget.dimensions.heirs;
    bad.gadget.rows.gad_box.heirs = ['grd_b'];
    assert.ok(hasErr(validateDimensions(sourcesOf(bad), OPTIONS), 'E-DIM-DERIVED-WRITTEN', 'heirs'));
  } finally { installVocab(report); }
});

test('加载期：编好的树随加载结果交下，读时只消费它（§2.9 第 4 条 :1182 "kernel/load 在加载期 compileRX"）', () => {
  const t = report.tables.get('gadget');
  assert.ok(t.derived instanceof Map);
  assert.equal(t.derived.get('reach').op, 'mul');
  assert.equal(t.derived.get('reach').left.key, 'mass');
});

test('带 recursive 的自引用加载期不判环；读时聚合原语未建，报 E-MOD-RX 而不是 E-DIM-DERIVED-CYCLE（§1.12 RA-N3）', () => {
  assert.ok(!report.errors.some((e) => e.code === 'E-DIM-DERIVED-CYCLE' && e.dim === 'deep'));
  assert.throws(() => dim(engine, {}, 'gadget', 'gad_box', 'deep'), (e) => e.code === 'E-MOD-RX');
});

test('抽样维度经 sample 得确定值（同种子同值）；实例有值先取实例值（§1.3 取值顺序、§1.10 :328）', () => {
  const a = dim(engine, {}, 'gadget', 'gad_hammer', 'smell');
  assert.equal(a.source, 'sample');
  assert.equal(a.value, sample(engine, 'gadget', 'gad_hammer', 'smell'));
  assert.equal(dim(engine, {}, 'gadget', 'gad_hammer', 'smell').value, a.value);
  assert.deepEqual(dim(engine, {}, 'gadget', 'gad_box', 'smell'), { known: true, applicable: true, value: 7, source: 'instance', unit: 'count' });
});

test('附录 B：五条修正项按全序键施加，结果 1.2221，explain 五段逐段复算', () => {
  use([
    row('m_tool', W, 'add', 0.05),
    row('m_race', W, 'mul', 0.05, { unpenalized: true }),
    row('m_trad', W, 'mul', 0.20),
    row('m_doct', W, 'mul', 0.10),
    row('m_flu', W, 'mul', -0.15),
  ]);
  const f = modified(engine, {}, 'gadget', 'gad_box', 'workSpeed');
  assert.deepEqual(f, { known: true, applicable: true, value: 1.2221, base: 1, source: 'modified', unit: 'count' });
  const steps = explain(engine, {}, 'gadget', 'gad_box', 'workSpeed');
  assert.deepEqual(steps.map((s) => [s.id, s.penalty, s.before, s.after]), [
    ['m_tool', null, 1, 1.05],
    ['m_trad', 1, 1.05, 1.26],
    ['m_doct', 0.8691, 1.26, 1.3694],
    ['m_race', 1, 1.3694, 1.4378],
    ['m_flu', 1, 1.4378, 1.2221],
  ]);
});

test('无修正返回基值原生值（卷二 :1316；对照 old-final-1117 derived.mjs:244–250：没有修正时原样交回 IEEE 值，不截到精度）', () => {
  const st = { created: { gad_box: { props: { workSpeed: 0.33333 } } } };
  use([]);
  assert.equal(modified(engine, st, 'gadget', 'gad_box', 'workSpeed').value, 0.33333);
  // 有一条 add 0 即进管线：转定点截断到 10⁻⁴ 再按 precision 4 截断 → 0.3333
  use([row('m_zero', W, 'add', 0)]);
  assert.equal(modified(engine, st, 'gadget', 'gad_box', 'workSpeed').value, 0.3333);
  // 只有不适用的修正项（when 为假）同样返回原生值
  use([row('m_never', W, 'add', 1, { when: rx('mass > 100') })]);
  assert.equal(modified(engine, st, 'gadget', 'gad_box', 'workSpeed').value, 0.33333);
});

test('第 4–7 步：max、min、set（只取序最前）、post 曲线插值', () => {
  use([row('m_max', W, 'max', 1.5)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.5);
  use([row('m_max', W, 'max', 1.5), row('m_min', W, 'min', 1.2)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.2);
  // set 全序 (priority desc, source.id asc, id asc)：priority 1 的 0.5 胜过 priority 0 的 2.5
  use([row('m_set_a', W, 'set', 2.5), row('m_set_b', W, 'set', 0.5, { priority: 1 }), row('m_add', W, 'add', 1)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 0.5);
  // post：曲线 (0,0)–(4,2)，v=2 → 1；v=3 → 1.5
  use([row('m_add', W, 'add', 1), { id: 'm_post', target: W, stage: 'post', curve: { x: 'count', y: 'count', points: [[0, 0], [4, 2]], monotone: true }, source: { kind: 'test', id: 'src_post' } }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1);
  use([row('m_add', W, 'add', 2), { id: 'm_post', target: W, stage: 'post', curve: { x: 'count', y: 'count', points: [[0, 0], [4, 2]], monotone: true }, source: { kind: 'test', id: 'src_post' } }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.5);
});

test('第 8 步 clamp：bounds、boundsRelative、boundsByKind；第 9 步按 precision 向零截断', () => {
  use([row('m_big', W, 'add', 5)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 3);
  use([row('m_neg', W, 'add', -0.95)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 0.2);
  const add30 = [{ id: 'a', stage: 'add', fixed: 300000n, value: 30, source: {}, sourceId: 'a', stackGroup: null, priority: 0, unpenalized: false }];
  // base 10，区间 [0.5, 2] 乘基值 → [5, 20]；10 + 30 = 40 → 20
  assert.equal(runPipeline(engine, 10, add30, { stacking: 'none', bounds: [0.5, 2], boundsRelative: true, precision: 2 }, 'gadget').value, 20);
  // boundsByKind 按主体种类优先于 bounds
  assert.equal(runPipeline(engine, 10, add30, { stacking: 'none', bounds: [0, 100], boundsByKind: { gadget: [0, 1] }, precision: 2 }, 'gadget').value, 1);
  // size 的 precision 1：1 × 1.37 = 1.37 → 1.3
  use([row('m_s', 'gadget.size', 'mul', 0.37)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'size').value, 1.3);
});

test('叠加：stackGroup 同组取序最高；同源只计一条；stacking:none 全用 S[0]；受罚序号 ≥9 系数为 0', () => {
  use([row('m_a', W, 'mul', 0.20, { stackGroup: 'g' }), row('m_b', W, 'mul', 0.10, { stackGroup: 'g' })]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.2);
  use([row('m_a', W, 'mul', 0.20, { stackGroup: 'g' }), row('m_b', W, 'mul', 0.10, { stackGroup: 'g', priority: 1 })]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.1);
  use([row('m_a', W, 'add', 0.5), { ...row('m_b', W, 'add', 0.3), source: { kind: 'test', id: 'src_m_a' } }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.5);
  // upkeep 是 stacking:none：12 × 1.1 × 1.1 = 14.52
  const U = 'gadget.upkeep[grd_a]';
  use([row('u1', U, 'mul', 0.10), row('u2', U, 'mul', 0.10)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'upkeep', { key: 'grd_a' }).value, 14.52);
  // 10 条 +0.0001 的 mul（penalized）：第 9、10 条的受罚序号为 8、9，系数 0.0001 与 0
  use(Array.from({ length: 10 }, (_, i) => row(`p${i}`, W, 'mul', 0.0001)));
  const pens = explain(engine, {}, 'gadget', 'gad_box', 'workSpeed').map((s) => s.penalty);
  assert.deepEqual(pens, [1, 0.8691, 0.5706, 0.283, 0.106, 0.03, 0.0064, 0.001, 0.0001, 0]);
});

test('同源去重分阶段（卷二 §3.3、§3.4 勘误 1118b26，李白 11-18 块 2-5 裁定③）：键 (source.id, target, subject, stage)', () => {
  const mat = { kind: 'material', id: 'mat_oak' };
  // 同一材料行同时给 add 0.5 与 mul 0.20：两者都生效。1 + 0.5 = 1.5；×(1 + 0.20·S[0]) = 1.5 × 1.2 = 1.8
  use([{ ...row('m_off', W, 'add', 0.5), source: mat }, { ...row('m_fac', W, 'mul', 0.20), source: mat }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.8);
  assert.deepEqual(explain(engine, {}, 'gadget', 'gad_box', 'workSpeed').map((s) => s.id), ['m_off', 'm_fac']);
  // 同阶段同源两条只留全序键 (priority desc, |value| desc, source.id asc, id asc) 最前者：|0.20| > |0.10| → 留 0.20，1 × 1.2 = 1.2
  use([{ ...row('m_x', W, 'mul', 0.10), source: mat }, { ...row('m_y', W, 'mul', 0.20), source: mat }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.2);
  // priority 先于 |value|：priority 1 的 0.10 排最前 → 留 0.10，1 × 1.1 = 1.1
  use([{ ...row('m_x', W, 'mul', 0.10, { priority: 1 }), source: mat }, { ...row('m_y', W, 'mul', 0.20), source: mat }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.1);
  // 全序其余键相同按 id asc：m_p 先于 m_q → 留 m_p 的 add 0.3，1 + 0.3 = 1.3
  use([{ ...row('m_q', W, 'add', -0.3), source: mat }, { ...row('m_p', W, 'add', 0.3), source: mat }]);
  assert.deepEqual(explain(engine, {}, 'gadget', 'gad_box', 'workSpeed').map((s) => s.id), ['m_p']);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.3);
});

test('派生维度登记即开槽：修正键来自维度表头 modifiable，map 子键分别寻址；不可修正维度拒收', () => {
  use([row('u1', 'gadget.upkeep[grd_a]', 'mul', 0.5)]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'upkeep', { key: 'grd_a' }).value, 18);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'upkeep', { key: 'grd_b' }).value, 3);
  assert.equal(modKeyOf(registry(), 'gadget', 'reach'), 'gadget.reach');
  assert.throws(() => modified(engine, {}, 'gadget', 'gad_box', 'mass'), (e) => e.code === 'E-MOD-KEY-UNREGISTERED');
  assert.throws(() => modified(engine, {}, 'gadget', 'gad_box', 'upkeep'), (e) => e.code === 'E-MOD-KEY-UNREGISTERED');
});

test('when 与 valueRX 经 dim() 绑定主体基值；when 读 clock.day；memo 以 day 为输入', () => {
  use([row('m_w', W, 'add', 1, { when: rx('mass > 2') })]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 2);
  use([{ id: 'm_v', target: W, stage: 'add', valueRX: rx('mass * 0.01'), source: { kind: 'test', id: 'src_v' } }]);
  assert.equal(modified(engine, {}, 'gadget', 'gad_box', 'workSpeed').value, 1.05);
  use([row('m_day', W, 'add', 1, { when: rx('clock.day >= 3') })]);
  const st = {};
  const d2 = modified(engine, st, 'gadget', 'gad_box', 'workSpeed', { clock: { day: 2 } });
  const d3 = modified(engine, st, 'gadget', 'gad_box', 'workSpeed', { clock: { day: 3 } });
  assert.equal(d2.value, 1);
  assert.equal(d3.value, 2);
  assert.strictEqual(modified(engine, st, 'gadget', 'gad_box', 'workSpeed', { clock: { day: 3 } }), d3);
  assert.strictEqual(modified(engine, st, 'gadget', 'gad_box', 'workSpeed', { clock: { day: 2 } }), d2);
});

test('基值未知不单独求值，原样交回（卷二 §3.8 :1440）；修正阶段不合即 E-MOD-STAGE', () => {
  use([row('m_a', W, 'add', 1)]);
  assert.deepEqual(modified(engine, {}, 'gadget', 'gad_hammer', 'workSpeed'), { known: false, applicable: true });
  use([row('m_x', W, 'times', 1)]);
  assert.throws(() => modified(engine, {}, 'gadget', 'gad_box', 'workSpeed'), (e) => e.code === 'E-MOD-STAGE');
});

test('修正项来源只许交入一次', () => {
  // 接口调用错误：不带登记码的普通 Error（卷二 §4.3 勘误 1118b25）。
  const plainError = (e) => e instanceof Error && e.constructor === Error && e.code === undefined;
  assert.throws(() => installModifierSource(() => []), plainError);
  resetModifierSource();
  assert.throws(() => installModifierSource('not a function'), plainError);
  installModifierSource(() => rows);
});
