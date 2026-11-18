// 块 2 第 2-5 张《求值管线》：dim、modified、explain 与九步定点管线（卷二 §2.1 :436、§2.2 :445–448、§1.3 取值算法、§3.2 修正项格式、§3.3 :1319–1362）。
// 测试表是 fixture.mjs 的虚构表 gadget 加两个本文件造的修正键（workSpeed、upkeep），不是世界内容。期望值一律按卷文公式手算成字面量，不用被测函数算：
//   附录 B（卷二 :2522–2525）：1.0000 →add 0.05→ 1.0500 →×1.2000→ 1.2600 →×1.0869→ 1.3694 →×1.0500→ 1.4378 →×0.8500→ 1.2221。

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { installVocab, registry } from '../../server-plugin/kernel/vocab.mjs';
import { modKeyOf } from '../../server-plugin/kernel/handles/keys.mjs';
import { compileRXInScope } from '../../server-plugin/kernel/rx.mjs';
import { dim, modified, explain, runPipeline, installModifierSource, resetModifierSource } from '../../server-plugin/kernel/dimensions.mjs';
import { resetMemos } from '../../server-plugin/kernel/memo.mjs';

// 叠加惩罚表（卷二 :1356 S[0..8]，照抄字面量）。
const STACKING = [1.0000, 0.8691, 0.5706, 0.2830, 0.1060, 0.0300, 0.0064, 0.0010, 0.0001];

function world() {
  const f = fixture();
  const common = { required: 'never', onUnknown: 'gap', source: 'test', owner: 'test' };
  f.gadget.dimensions.workSpeed = { type: 'number', unit: 'count', domain: [0, 10], precision: 4, modifiable: true, stacking: 'penalized', bounds: [0.2, 3], ...common };
  f.gadget.dimensions.upkeep = { type: 'map', key: { type: 'ref', vocab: 'grade' }, value: { type: 'number', unit: 'count', domain: [0, 100], precision: 2 }, modifiable: true, stacking: 'none', bounds: [0, 100], ...common };
  // 派生维度（§1.12 derived）同样 modifiable：登记即成修正键，不另写槽（体检 K2-05）。
  f.gadget.dimensions.reach = { type: 'number', unit: 'kg', domain: [0, 200], precision: 2, derived: 'mass * 2', modifiable: true, stacking: 'none', bounds: [0, 200], ...common };
  f.gadget.rows.gad_box.workSpeed = 1;
  f.gadget.rows.gad_box.upkeep = { grd_a: 12, grd_b: 3 };
  f.gadget.rows.gad_box.spec = { low: 1, high: 2 };
  f.gadget.rows.gad_box.size = 1;
  const report = validateDimensions(sourcesOf(f), OPTIONS);
  return report;
}

const report = world();
installVocab(report);
const engine = { tables: report.tables, vocab: report.vocab, rules: { modifiers: { stackingTable: STACKING } } };
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
