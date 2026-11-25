// 卷二 §1.10 封卷后勘误 1124k81（李白 11-22 P-19）：分布对象可带 truncate: [lo, hi]，按反 CDF 截断采样——
// 在 [lo, hi] 内按原分布的形状取值，同一个种子键、同一个均匀数 u，不拒绝重抽、不加计数；区间里取不到值报 E-DIM-SAMPLE-PARAM。
// 前置照 tests/kernel/draw-by-key.test.mjs。期望值按公式手算成字面量；不截断的抽样结果与改前逐位相同（字面量取自改前的实现）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { installFixedConstants, installDetTables, installExpTable } from '../../server-plugin/kernel/det-math.mjs';
import { installSampleConstants, installSampleDistributions, drawByKey, validateDistribution } from '../../server-plugin/kernel/sample.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_distributions.json'), 'utf8'));
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
installSampleConstants({ kernelConstants: { diceKeyMaxQualifiers: 2 } });
installSampleDistributions(DOC);
installExpTable(DOC.expTable);
installDetTables({ sqrt: { inScale: 100000000, outScale: 100000000, domainMin: 0, domainMax: 9007199254740991, step: 1, iterations: 32 } });

const draw = (dist, subject = 'per_aa1') => drawByKey('seed_ab12', 'clock_draw', subject, 5, 'draw_weather', dist);
const IDS = Array.from({ length: 60 }, (_, i) => `per_t${i}`);
const bad = (dist) => assert.throws(() => draw(dist), (e) => e.code === 'E-DIM-SAMPLE-PARAM');

test('不截断的抽样逐位不变（字面量取自改前实现）：normal、lognormal、uniform、triangular 各三个主体', () => {
  const N = { dist: 'normal', mean: 62, sd: 12, clamp: [28, 98] };
  const L = { dist: 'lognormal', mu: 3.69, sigma: 0.12, clamp: [25, 80] };
  const U = { dist: 'uniform', min: 10, max: 20 };
  const T = { dist: 'triangular', min: 0, mode: 5, max: 10 };
  assert.deepEqual(['per_aa1', 'per_aa2', 'per_aa3'].map((s) => draw(N, s)), [88.7708, 68.5736, 73.0676]);
  assert.deepEqual(['per_aa1', 'per_aa2', 'per_aa3'].map((s) => draw(L, s)), [52.3368, 42.7641, 44.728]);
  assert.deepEqual(['per_aa1', 'per_aa2', 'per_aa3'].map((s) => draw(U, s)), [19.8715, 17.0814, 18.2183]);
  assert.deepEqual(['per_aa1', 'per_aa2', 'per_aa3'].map((s) => draw(T, s)), [9.1969, 6.1797, 7.0151]);
});

test('truncate 取值都落在 [lo, hi]：normal(62,12) 截 [78, 98]，60 个主体，取值不成片压在下限上', () => {
  const vals = IDS.map((id) => draw({ dist: 'normal', mean: 62, sd: 12, clamp: [28, 98], truncate: [78, 98] }, id));
  assert.ok(vals.every((v) => v >= 78 && v <= 98), JSON.stringify(vals));
  assert.ok(new Set(vals).size > 40, `distinct ${new Set(vals).size}`);
  assert.ok(vals.filter((v) => v === 78).length <= 1);
});

test('下标区间按表手算：normal(62,12) 截 [62, 62]：表第 2048 点 z = 0，只有这一点落在区间里，取值恰 62；截 [62, 200] 取值都 ≥ 62', () => {
  assert.equal(DOC.normalQuantile.values[2048], 0); // Φ⁻¹(2048/4096) = Φ⁻¹(0.5) = 0
  assert.equal(draw({ dist: 'normal', mean: 62, sd: 12, truncate: [62, 62] }), 62);
  // mean + 12 z 落在 [62, 200] 的下标是 2048..4096（z_4096 = 3.9 → 108.8 ≤ 200，且表单调），区间里取值都 ≥ 62。
  const vals = IDS.map((id) => draw({ dist: 'normal', mean: 62, sd: 12, truncate: [62, 200] }, id));
  assert.ok(vals.every((v) => v >= 62 && v <= 108.8), JSON.stringify(vals));
});

test('区间覆盖整个分布时与不截断逐位不同的只是用了区间内的取值方式，仍在区间内；区间很宽的上侧例：截 [mean + 2sd, …] 的取值都 ≥ 86', () => {
  const vals = IDS.map((id) => draw({ dist: 'normal', mean: 62, sd: 12, truncate: [86, 1000] }, id));
  assert.ok(vals.every((v) => v >= 86), JSON.stringify(vals));
});

test('同键同值：同输入两次逐位相同；换主体值不同（一键一抽，无游标）', () => {
  const d = { dist: 'normal', mean: 62, sd: 12, clamp: [28, 98], truncate: [70, 98] };
  assert.equal(draw(d, 'per_x1'), draw(d, 'per_x1'));
  assert.notEqual(draw(d, 'per_x1'), draw(d, 'per_x2'));
});

test('lognormal 在 ln 空间同法：取值都落在 [lo, hi]', () => {
  const vals = IDS.map((id) => draw({ dist: 'lognormal', mu: 3.69, sigma: 0.12, clamp: [25, 80], truncate: [50, 80] }, id));
  assert.ok(vals.every((v) => v >= 50 && v <= 80), JSON.stringify(vals));
  assert.ok(new Set(vals).size > 40);
});

test('uniform 直接算截断后的区间：min 10 max 20 截 [15, 18] 取值都在 [15, 18]；区间与分布支撑不相交即拒', () => {
  const vals = IDS.map((id) => draw({ dist: 'uniform', min: 10, max: 20, truncate: [15, 18] }, id));
  assert.ok(vals.every((v) => v >= 15 && v <= 18), JSON.stringify(vals));
  assert.ok(new Set(vals).size > 40);
  bad({ dist: 'uniform', min: 10, max: 20, truncate: [21, 30] });
  bad({ dist: 'uniform', min: 10, max: 20, truncate: [1, 9] });
});

test('triangular 按累积分布截断：min 0 mode 5 max 10 截 [6, 9] 取值都在 [6, 9]；跨不到支撑即拒', () => {
  const vals = IDS.map((id) => draw({ dist: 'triangular', min: 0, mode: 5, max: 10, truncate: [6, 9] }, id));
  assert.ok(vals.every((v) => v >= 6 && v <= 9), JSON.stringify(vals));
  assert.ok(new Set(vals).size > 40);
  bad({ dist: 'triangular', min: 0, mode: 5, max: 10, truncate: [11, 12] });
});

test('区间里取不到值：normal 的区间落在分位数表覆盖之外（mean + 3.9 sd 以上）、区间两端倒置、非数字、categorical 带 truncate 都报 E-DIM-SAMPLE-PARAM，不静默放过', () => {
  bad({ dist: 'normal', mean: 62, sd: 12, truncate: [200, 300] }); // 62 + 12 × 3.9 = 108.8 < 200
  bad({ dist: 'normal', mean: 62, sd: 12, truncate: [-300, -200] });
  bad({ dist: 'normal', mean: 62, sd: 12, clamp: [28, 98], truncate: [99, 98] });
  bad({ dist: 'normal', mean: 62, sd: 12, truncate: ['a', 98] });
  bad({ dist: 'normal', mean: 62, sd: 12, truncate: [70] });
  bad({ dist: 'categorical', weights: { a: 1, b: 1 }, truncate: [0, 1] });
  assert.throws(() => validateDistribution({ dist: 'normal', mean: 62, sd: 12, truncate: [99, 98] }), (e) => e.code === 'E-DIM-SAMPLE-PARAM');
});
