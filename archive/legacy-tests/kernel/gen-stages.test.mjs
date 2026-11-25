// 世界生成流程是数据（卷十 R10-1.1 :368、§2.1 gstage 行 :113、§2.7 :236–:237、A10-1.3 :397）：
// 全序 = 先 worldgen 相、再 opening 相、再 expand 相；相内按 after/before 合成的先后图取拓扑序，同层按代号升序；
// 成环或跨相引用即 E-GEN-STAGE-CYCLE；引用不存在的阶段/生成器、字段不合即 E-GEN-STAGE-UNKNOWN。
// 纯函数，测试里直接造词表，不加载世界。期望值按卷文规则手算成字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genPlan, checkGenStages } from '../../server-plugin/kernel/gen/stages.mjs';

// 一条合规矩的 gstage 条目（卷十 §2.1 :113 的必写字段）；测试按需覆盖单个字段。
const stage = (over = {}) => ({
  phase: 'worldgen',
  scope: 'tract',
  after: [],
  before: [],
  generator: 'x/a.mjs',
  writesKinds: ['place'],
  writesFamilies: [],
  whenRX: null,
  ...over,
});

const vocabOf = (entries) => ({ families: new Map([['gstage', { entries }]]) });
const stagesOf = (plan) => plan.map((p) => p.stage);
const GEN = ['x/a.mjs'];

// 1. 先后图：a.after []、b.after [a]、c.before [b] 且 after []。
// 边 a → b（b.after 含 a）与 c → b（c.before 含 b）都是指向 b 的边；a、c 入度 0 同层，按代号升序 [a, c]，第二层 b。
test('R10-1.1 先后图：after 与 before 合成同一张图，同层按代号升序', () => {
  const vocab = vocabOf({
    gstage_a: stage(),
    gstage_b: stage({ after: ['gstage_a'] }),
    gstage_c: stage({ before: ['gstage_b'] }),
  });
  assert.deepEqual(genPlan(vocab, GEN), [
    { stage: 'gstage_a', phase: 'worldgen', scope: 'tract' },
    { stage: 'gstage_c', phase: 'worldgen', scope: 'tract' },
    { stage: 'gstage_b', phase: 'worldgen', scope: 'tract' },
  ]);
  assert.deepEqual(checkGenStages(vocab, GEN), []);
});

// 2. 同层按代号升序：四条互不相关的同相阶段乱序写入，结果仍按代号升序。
test('R10-1.1 同层按代号升序，与条目写入次序无关', () => {
  const vocab = vocabOf({
    gstage_d: stage(),
    gstage_b: stage(),
    gstage_a: stage(),
    gstage_c: stage(),
  });
  assert.deepEqual(stagesOf(genPlan(vocab, GEN)), ['gstage_a', 'gstage_b', 'gstage_c', 'gstage_d']);
});

// 3. 相的先后只由 phase 定：expand 相取最小代号 gstage_a、worldgen 相取最大代号 gstage_z，仍按 worldgen、opening、expand。
test('R10-1.1 相的先后只由 phase 定，与代号大小无关', () => {
  const vocab = vocabOf({
    gstage_a: stage({ phase: 'expand' }),
    gstage_m: stage({ phase: 'opening' }),
    gstage_z: stage({ phase: 'worldgen' }),
  });
  assert.deepEqual(genPlan(vocab, GEN), [
    { stage: 'gstage_z', phase: 'worldgen', scope: 'tract' },
    { stage: 'gstage_m', phase: 'opening', scope: 'tract' },
    { stage: 'gstage_a', phase: 'expand', scope: 'tract' },
  ]);
});

// 4. 成环：after 写法 a.after [b] + b.after [a]，以及 before 写法 a.before [b] + b.before [a]，都报 E-GEN-STAGE-CYCLE。
test('R10-1.1 / §2.7 before、after 合成成环即 E-GEN-STAGE-CYCLE', () => {
  const byAfter = vocabOf({
    gstage_a: stage({ after: ['gstage_b'] }),
    gstage_b: stage({ after: ['gstage_a'] }),
  });
  const errsAfter = checkGenStages(byAfter, GEN);
  assert.ok(errsAfter.length > 0);
  assert.ok(errsAfter[0].startsWith('E-GEN-STAGE-CYCLE'));
  assert.throws(() => genPlan(byAfter, GEN), (e) => e.code === 'E-GEN-STAGE-CYCLE');

  const byBefore = vocabOf({
    gstage_a: stage({ before: ['gstage_b'] }),
    gstage_b: stage({ before: ['gstage_a'] }),
  });
  const errsBefore = checkGenStages(byBefore, GEN);
  assert.ok(errsBefore.length > 0);
  assert.ok(errsBefore[0].startsWith('E-GEN-STAGE-CYCLE'));
  assert.throws(() => genPlan(byBefore, GEN), (e) => e.code === 'E-GEN-STAGE-CYCLE');
});

// 5. 跨相引用：worldgen 相的阶段 after 写 expand 相的阶段，相序只由 phase 定，故报 E-GEN-STAGE-CYCLE（§2.7）。
test('R10-1.1 / §2.7 after、before 跨相即 E-GEN-STAGE-CYCLE', () => {
  const vocab = vocabOf({
    gstage_z: stage({ phase: 'worldgen', after: ['gstage_e'] }),
    gstage_e: stage({ phase: 'expand' }),
  });
  const errs = checkGenStages(vocab, GEN);
  assert.ok(errs.length > 0);
  assert.ok(errs[0].startsWith('E-GEN-STAGE-CYCLE'));
  assert.throws(() => genPlan(vocab, GEN), (e) => e.code === 'E-GEN-STAGE-CYCLE');
});

// 6. 引用不存在的阶段或生成器、writesFamilies 缺、phase/scope 不在枚举里，一律 E-GEN-STAGE-UNKNOWN（§2.1 :113、§2.7 :236）。
test('§2.7 未知阶段、未知生成器、缺 writesFamilies、非法 phase/scope 即 E-GEN-STAGE-UNKNOWN', () => {
  const cases = {
    afterMissing: vocabOf({ gstage_a: stage({ after: ['gstage_missing'] }) }),
    generatorMissing: vocabOf({ gstage_a: stage({ generator: 'x/nope.mjs' }) }),
    writesFamiliesMissing: vocabOf({ gstage_a: stage({ writesFamilies: undefined }) }),
    phaseInvalid: vocabOf({ gstage_a: stage({ phase: 'bogus' }) }),
    scopeInvalid: vocabOf({ gstage_a: stage({ scope: 'bogus' }) }),
  };
  for (const [name, vocab] of Object.entries(cases)) {
    const errs = checkGenStages(vocab, GEN);
    assert.ok(errs.length > 0, `${name}: checkGenStages must report`);
    assert.ok(errs[0].startsWith('E-GEN-STAGE-UNKNOWN'), `${name}: got ${errs[0]}`);
    assert.throws(() => genPlan(vocab, GEN), (e) => e.code === 'E-GEN-STAGE-UNKNOWN', `${name}: genPlan must throw`);
  }
});

// 7. 扩展性（A10-1.3 :397）：只加一条 d（before ['gstage_b']、after []），d 排在 b 之前，原有阶段相对次序不变。
// 边 d → b；layer 1 = {a, c, d} 按代号 [a, c, d]，layer 2 = {b}；滤掉 d 后仍为 [a, c, b]。
test('A10-1.3 只加一条 before 引用即可排在已有阶段之前，其余次序不变', () => {
  const vocab = vocabOf({
    gstage_a: stage(),
    gstage_b: stage({ after: ['gstage_a'] }),
    gstage_c: stage({ before: ['gstage_b'] }),
    gstage_d: stage({ before: ['gstage_b'] }),
  });
  const plan = genPlan(vocab, GEN);
  const ids = stagesOf(plan);
  assert.deepEqual(ids, ['gstage_a', 'gstage_c', 'gstage_d', 'gstage_b']);
  assert.ok(ids.indexOf('gstage_d') < ids.indexOf('gstage_b'));
  assert.deepEqual(ids.filter((id) => id !== 'gstage_d'), ['gstage_a', 'gstage_c', 'gstage_b']);
});

// 8. 空词表（没有 gstage 族或族内无条目）：没有阶段，genPlan 与 checkGenStages 都返回空表。
test('空词表：genPlan 与 checkGenStages 返回空表', () => {
  assert.deepEqual(genPlan({ families: new Map() }, GEN), []);
  assert.deepEqual(checkGenStages({ families: new Map() }, GEN), []);
  assert.deepEqual(genPlan(vocabOf({}), GEN), []);
  assert.deepEqual(checkGenStages(vocabOf({}), GEN), []);
});
