// 4-4a《normal/lognormal 与唯一一份定点指数、对数、整数次幂》：卷二 §1.10 :323–:328（分位数表、exp 表、lognormal = exp(mu+sigma·z)）、
// §3.3 :1328–:1340（fixedUnits8、fixedMultiply8、fixedExp、fixedPow、fixedLn 唯一定义）、卷二十七 R27-5.2 :569–:575
// （表由 tools 组离线生成、运行时只读表；detfn 的 exp 直接用卷二的指数表）。
// 期望值按卷文公式手算成字面量（测试里不用被测函数算期望）：
//   fixedExp(0) = e⁰×10⁸ = 10⁸ = 100000000；
//   fixedExp(1) = floor(e×10⁸) = floor(271828182.8459…) = 271828182；
//   fixedPow(2×10⁸, 10) = 2¹⁰×10⁸ = 1024×10⁸ = 102400000000（每步都在 10⁸ 标度上整除，2¹⁰ 是整数不丢位）；
//   fixedLn(10⁸) = ln(1)×10⁸ = 0；
//   fixedLn(fixedExp(1)) 与 1 的差：fixedExp 向下截断到 271828182，与 e 的绝对差 8.46×10⁻⁹，
//   相对 δ = 8.46×10⁻⁹/e ≈ 3.11×10⁻⁹；ln(1−δ) ≈ −3.11×10⁻⁹，即 ln 结果偏 0.311 个单位；
//   卷文给 fixedLn 自身误差 < 2×10⁻⁸（本机核算最大 1.0×10⁻⁸），合计 < 2.312 个单位，
//   两边都是 10⁸ 标度整数，故 10⁸ 标度下的整数差 |d| ≤ 2。
// 表文件与生成脚本由本卡另建；测试先失败（卡文第五节第 1 条）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import {
  installFixedConstants, installExpTable, fixedUnits8, fixedMultiply8, fixedExp, fixedLn, fixedPow,
} from '../../server-plugin/kernel/det-math.mjs';
import { installSampleDistributions, sample } from '../../server-plugin/kernel/sample.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_distributions.json'), 'utf8'));

// 内核摘要能力由装配文件注入（卷二 §2.9 :984）；sample 的种子键要它，测试里用 node:crypto 装一个（同 sample.test.mjs）。
installDigestCap({
  sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex'),
});

// 卷二 S10 登记豁免表的同值常数（world/rules/tables/kernel-constants.json 由加载入口收下）；
// fixedLn 的 W=10¹⁸、A 的升标度 10¹⁰、级数项数 20、LN2=693147180559945309 同表登记（§3.3 :1335–:1339）。
installFixedConstants({
  BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000,
  fixedLnWorkExponent: 18, fixedLnInputExponent: 10, fixedLnSeriesTerms: 20, LN2: '693147180559945309',
});
installExpTable(DOC.expTable);
installSampleDistributions(DOC);

test('fixedUnits8 / fixedMultiply8：10⁸ 标度、小数第 9 位起向零截断（卷二 §3.3 :1329–:1330）', () => {
  assert.equal(fixedUnits8('1'), 100000000n);
  assert.equal(fixedUnits8('0.000000004'), 0n); // 第 9 位起截断
  assert.equal(fixedUnits8('1.000000004'), 100000000n);
  assert.equal(fixedUnits8('-2.5'), -250000000n);
  assert.equal(fixedMultiply8(200000000n, 300000000n), 600000000n);
  assert.equal(fixedMultiply8(-200000000n, 300000000n), -600000000n);
  assert.equal(fixedMultiply8(150000000n, 150000000n), 225000000n);
});

test('fixedExp：10⁸ 标度，fixedExp(0)=10⁸，fixedExp(1)=expInt[1]（卷二 §3.3 :1332、§1.10 :325）', () => {
  assert.equal(fixedExp(0n), 100000000n);
  assert.equal(fixedExp(100000000n), 271828182n);
  // 表按 k=−40..40 排列：k=1 的项是 values[1 − kMin]（kMin=−40 → 第 41 项）。
  assert.equal(fixedExp(100000000n), BigInt(DOC.expTable.expInt.values[1 - DOC.expTable.expInt.kMin]));
});

test('fixedExp 定义域 [-40,40]，越界即错（E-DET-DOMAIN，卷二 §3.3 :1332）', () => {
  assert.doesNotThrow(() => fixedExp(4000000000n));
  assert.doesNotThrow(() => fixedExp(-4000000000n));
  assert.throws(() => fixedExp(4000000001n), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedExp(-4000000001n), (e) => e.code === 'E-DET-DOMAIN');
});

test('fixedLn(1) 恰为 0（卷二 §3.3 :1341）', () => {
  assert.equal(fixedLn(100000000n), 0n);
});

test('fixedLn(fixedExp(x)) 与 x 的差在卷文截断误差内（各点 < 2.32×10⁻⁸，即 10⁸ 标度下整数差 ≤ 2）', () => {
  // 手算见文件头：fixedExp 的向下截断使 ln 偏 0.12–0.318 个单位（相对 δ≈1.2–3.2×10⁻⁹），与 fixedLn 自身 <2×10⁻⁸ 相加 <2.32 个单位；两边都是 10⁸ 标度整数，故 |差| ≤ 2。
  for (const x of [100000000n, 200000000n, -100000000n]) {
    const diff = fixedLn(fixedExp(x)) - x;
    assert.ok(diff >= -2n && diff <= 2n, `x=${x} diff=${diff}`);
  }
});

test('fixedLn(10) 对照手算值：ln 10 = 2.302585092994046…，×10⁸ = 230258509.299…（误差 < 2×10⁻⁸）', () => {
  const diff = fixedLn(1000000000n) - 230258509n;
  assert.ok(diff >= -2n && diff <= 2n, `diff=${diff}`);
});

test('fixedLn 定义域 0 < x ≤ expInt[40]，越界即错且不钳位（卷二 §3.3 :1334）', () => {
  const top = BigInt(DOC.expTable.expInt.values[DOC.expTable.expInt.values.length - 1]);
  assert.doesNotThrow(() => fixedLn(top));
  assert.throws(() => fixedLn(0n), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedLn(-1n), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedLn(top + 1n), (e) => e.code === 'E-DET-DOMAIN');
});

test('fixedPow：底数 10⁸ 标度非负、指数非负整数，二进制位高到低（卷二 §3.3 :1333）', () => {
  assert.equal(fixedPow(200000000n, 10), 102400000000n); // 2¹⁰×10⁸
  assert.equal(fixedPow(200000000n, 0), 100000000n);
  assert.equal(fixedPow(200000000n, 1), 200000000n);
  assert.equal(fixedPow(100000000n, 5), 100000000n); // 1⁵
  assert.throws(() => fixedPow(-1n, 2), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedPow(100000000n, -1), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedPow(100000000n, 1.5), (e) => e.code === 'E-DET-DOMAIN');
});

// ---------- normal / lognormal 求值（卷二 §1.10 :323–:328） ----------

const engineWith = (dims) => ({ template: { seed: 'seed_ab12' }, tables: new Map([['gadget', { doc: { dimensions: dims } }]]) });

test('normal：同种子同值，按 precision 向零截断后在 clamp 内（§1.10 :324 normal、:327 截断/clamp）', () => {
  const dims = { height: { type: 'number', unit: 'kg', precision: 2, domain: [-1, 1], sample: { dist: 'normal', mean: 0, sd: 0.35, clamp: [-1, 1] } } };
  const a = sample(engineWith(dims), 'gadget', 'gad_1', 'height');
  const b = sample(engineWith(dims), 'gadget', 'gad_1', 'height');
  assert.equal(a, b);
  assert.equal(typeof a, 'number');
  assert.equal(a, Number(a.toFixed(2))); // 2 位小数
  assert.ok(a >= -1 && a <= 1);
});

test('lognormal：同种子同值，exp 经 fixedExp 降到 10⁴ 后按 precision 截断、clamp（§1.10 :325 lognormal、:327 截断/clamp）', () => {
  const dims = { lifespan: { type: 'number', unit: 'day', precision: 0, domain: [25, 80], sample: { dist: 'lognormal', mu: 3.69, sigma: 0.12, clamp: [25, 80] } } };
  const a = sample(engineWith(dims), 'gadget', 'gad_1', 'lifespan');
  const b = sample(engineWith(dims), 'gadget', 'gad_1', 'lifespan');
  assert.equal(a, b);
  assert.equal(typeof a, 'number');
  assert.ok(Number.isInteger(a)); // precision 0
  assert.ok(a >= 25 && a <= 80);
});

test('clamp 生效：均值远在 clamp 外的 normal/lognormal 落到上界（§1.10 :327）', () => {
  const n = { value: { type: 'number', unit: 'kg', precision: 2, domain: [0, 1], sample: { dist: 'normal', mean: 100, sd: 0.1, clamp: [0, 1] } } };
  const l = { value: { type: 'number', unit: 'kg', precision: 0, domain: [25, 80], sample: { dist: 'lognormal', mu: 10, sigma: 0.1, clamp: [25, 80] } } };
  assert.equal(sample(engineWith(n), 'gadget', 'gad_1', 'value'), 1);
  assert.equal(sample(engineWith(l), 'gadget', 'gad_1', 'value'), 80);
});

test('loadWorld 读入 _distributions.json 并装配 exp 表（R27-5.2 :572–:574）', () => {
  const r = loadWorld(ROOT);
  assert.ok(r.ok, r.text);
  assert.equal(fixedExp(100000000n), 271828182n);
});
