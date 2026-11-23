// 4-4b：族 detfn 的查表函数（卷二十七 R27-5.2 :569–:575）——sin/cos/atan 查表线性插值，ln 指向卷二唯一的 fixedLn，
// exp 指向卷二唯一的 fixedExp，sqrt 整数牛顿固定步，pow 由 exp 与 ln 组合；
// 线性插值全程整数、除法向零截断；域外 E-DET-DOMAIN、不外推不钳位；safeIntMax 溢出报 E-DET-OVERFLOW（R27-5.1 :568）。
// detfn 七值去前缀（exp ln sin cos atan sqrt pow）依李白 11-18 21:3x 裁定、卷二 §1.9 :289 代码内封闭枚举值不带前缀。
// 期望值按卷文公式手算成字面量（测试里不用被测函数算期望）：
//   两点 [50, −51]、步长 100、x=50：50 + (−51−50)×50÷100 = 50 + (−5050÷100) = 50 + (−50) = 0
//     （BigInt 整除向零截断，真值 −0.5 取 0，这条测向零截断）；
//   两点 [−101, −49]、x=50：−101 + (−49+101)×50÷100 = −101 + 52×50÷100 = −101 + 26 = −75；
//   sqrt(2.0)：⌊√(2×10⁸×10⁸)⌋ = ⌊141421356.23…⌋ = 141421356；
//   sqrt(4.0) = 200000000；sqrt(0) = 0；
//   atan(2.0)：表的 π/2 = 2×⌊π/4×10⁸⌋ = 2×78539816 = 157079632；1/2 在表上插值为
//     ⌊78539816×5×10⁷÷10⁸⌋ = 39269908；折回 157079632 − 39269908 = 117809724（负数取反）。
//   ln(1.0) = 0；ln(10.0) = ⌊ln 10×10⁸⌋ = 230258509（fixedLn 精度 <2×10⁻⁸，即 10⁸ 标度上差 ≤ 2，测试取与 fixedLn 一致且离 230258509 不超过 1）；
//   pow(4.0, 0.5) = e^(0.5·ln 4) = 2 → 200000000（ln 与 exp 各向零截断一次，允许 |差| ≤ 4）。
// 测试自己装 fixture 表（先造前提再断言），不读生成表的当前数字。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installFixedConstants, installExpTable, installDetTables, checkedFixed,
  fixedExp, fixedLn, exp, ln, sin, cos, atan, sqrt, pow,
} from '../../server-plugin/kernel/det-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_distributions.json'), 'utf8'));
// fixedLn 的四个常数同卷二 §3.3 :1335–:1339（W=10¹⁸、升标度 10¹⁰、项数 20、LN2=693147180559945309），
// 与 tests/kernel/det-math-exp.test.mjs 的装法一致。
installFixedConstants({
  BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000,
  fixedLnWorkExponent: 18, fixedLnInputExponent: 10, fixedLnSeriesTerms: 20, LN2: '693147180559945309',
});
installExpTable(DOC.expTable);

const row = (o) => ({ inScale: 1e8, outScale: 1e8, domainMin: 0, domainMax: 0, step: 1, basis: '测试', ...o });
const isDomain = (e) => e.code === 'E-DET-DOMAIN';

test('查表线性插值：两点之间整数运算、除法向零截断（卷二十七 :571）', () => {
  installDetTables({ sin: row({ inScale: 100, outScale: 100, domainMin: 0, domainMax: 100, step: 100, values: [50, -51] }) });
  assert.equal(sin(0n), 50n);
  assert.equal(sin(50n), 0n);
  // 50 + (−101)×50÷100 = 50 − 50 = 0（真值 −0.5，向零截断）
  installDetTables({ sin: row({ inScale: 100, outScale: 100, domainMin: 0, domainMax: 100, step: 100, values: [-101, -49] }) });
  assert.equal(sin(50n), -75n);
});

test('查表超出定义域报 E-DET-DOMAIN，恰在边界不报，不外推不钳位（卷二十七 :571；det-math.mjs tableLookup）', () => {
  // 窄表 [-0.5, 0.5]（步长 0.5，值为 atan(±0.5)=±46364760、atan 0=0）：x=0.5 恰在边界不抛；
  // x=0.6 在表外，折回点 1/0.6=1.6667 也在表外，查表报 E-DET-DOMAIN，不外推不钳位；负侧同。
  installDetTables({ atan: row({ inScale: 1e8, outScale: 1e8, domainMin: -50000000, domainMax: 50000000, step: 50000000, values: [-46364760, 0, 46364760] }) });
  assert.equal(atan(50000000n), 46364760n);
  assert.equal(atan(-50000000n), -46364760n);
  assert.throws(() => atan(60000000n), isDomain);
  assert.throws(() => atan(-60000000n), isDomain);
});

test('atan 域外按恒等式折回（卷二十七 :573）：折回点在表内时不报错', () => {
  installDetTables({ atan: row({ inScale: 1e8, outScale: 1e8, domainMin: -1e8, domainMax: 1e8, step: 1e8, values: [-78539816, 0, 78539816] }) });
  assert.equal(atan(200000000n), 117809724n); // 同下方手算：157079632 − 39269908
  assert.equal(atan(-200000000n), -117809724n);
});

test('exp 不另立表：结果等于卷二唯一的 fixedExp（卷二十七 :572）', () => {
  installDetTables({ exp: row({ domainMin: -4000000000, domainMax: 4000000000, step: 1 }) });
  assert.equal(exp(0n), fixedExp(0n));
  assert.equal(exp(100000000n), fixedExp(100000000n));
  assert.equal(exp(100000000n), 271828182n); // ⌊e×10⁸⌋
  assert.throws(() => exp(4000000001n), isDomain);
});

test('ln 不另立表：等于卷二唯一的 fixedLn，域外报 E-DET-DOMAIN（李白 Q-6）', () => {
  installDetTables({ ln: row({ domainMin: 1, domainMax: 9007199254740991, step: 1 }) });
  assert.equal(ln(100000000n), 0n); // ln 1 = 0
  assert.equal(ln(1000000000n), fixedLn(1000000000n));
  const d = ln(1000000000n) - 230258509n; // ⌊ln 10×10⁸⌋
  assert.ok(d <= 1n && d >= -1n);
  assert.throws(() => ln(0n), isDomain); // 0 小于行的 domainMin 1
  assert.throws(() => ln(-1n), isDomain);
  assert.throws(() => ln(9007199254740992n), isDomain); // 上界 domainMax+1，不钳位
  installDetTables({ ln: row({ inScale: 100, outScale: 100, domainMin: 1, domainMax: 9007199254740991, step: 1 }) });
  assert.equal(ln(100n), 0n); // 100/100 = 1.0
});

test('sqrt 整数开方：牛顿固定 32 步，结果向下取整（卷二 §1.10 :326、卷二十七 :573）', () => {
  installDetTables({ sqrt: row({ domainMin: 0, domainMax: 9007199254740991, step: 1, iterations: 32 }) });
  assert.equal(sqrt(0n), 0n);
  assert.equal(sqrt(100000000n), 100000000n);
  assert.equal(sqrt(400000000n), 200000000n);
  assert.equal(sqrt(200000000n), 141421356n);
  assert.throws(() => sqrt(-1n), isDomain);
});

test('pow = exp ∘ ln，底数须为正（卷二十七 :573）', () => {
  installDetTables({
    ln: row({ domainMin: 1, domainMax: 9007199254740991, step: 1 }),
    exp: row({ domainMin: -4000000000, domainMax: 4000000000, step: 1 }),
    pow: row({ domainMin: 1, domainMax: 9007199254740991, step: 1 }),
  });
  assert.throws(() => pow(-1n, 100000000n), isDomain);
  // 底数 1.0：ln 1 = 0，e⁰ = 1 → 10⁸
  assert.equal(pow(100000000n, 200000000n), 100000000n);
  // 底数 4.0、指数 0.5：4^0.5 = 2 → 200000000；ln 与 exp 两次向零截断，允许 |差| ≤ 4
  const d = pow(400000000n, 50000000n) - 200000000n;
  assert.ok(d <= 4n && d >= -4n);
});

test('sin/cos：表覆盖一个整周期，输入先按周期取余（卷二十七 :573）', () => {
  installDetTables({
    sin: row({ inScale: 100, outScale: 100, domainMin: 0, domainMax: 200, step: 100, values: [0, 50, 0] }),
    cos: row({ inScale: 100, outScale: 100, domainMin: 0, domainMax: 200, step: 100, values: [100, 0, -100] }),
  });
  assert.equal(sin(50n), 25n);
  assert.equal(sin(250n), sin(50n)); // 超一周期取余
  assert.equal(sin(450n), sin(50n));
  assert.equal(sin(-150n), sin(50n)); // 负数取余也落在 [domainMin, domainMax)
  assert.equal(cos(250n), cos(50n));
});

test('atan：定义域内查表，域外按恒等式折回（卷二十七 :573）', () => {
  installDetTables({ atan: row({ inScale: 1e8, outScale: 1e8, domainMin: -1e8, domainMax: 1e8, step: 1e8, values: [-78539816, 0, 78539816] }) });
  assert.equal(atan(0n), 0n);
  assert.equal(atan(100000000n), 78539816n);
  assert.equal(atan(-100000000n), -78539816n);
  assert.equal(atan(200000000n), 117809724n);
  assert.equal(atan(-200000000n), -117809724n);
});

test('写入超出 safeIntMax 报 E-DET-OVERFLOW，不截断（卷二十七 R27-5.1 :568）', () => {
  assert.equal(checkedFixed(9007199254740991n), 9007199254740991n);
  assert.throws(() => checkedFixed(9007199254740992n), (e) => e.code === 'E-DET-OVERFLOW');
  assert.throws(() => checkedFixed(-9007199254740992n), (e) => e.code === 'E-DET-OVERFLOW');
});
