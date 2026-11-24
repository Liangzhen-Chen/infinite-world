// C6 验收（出题方 haiku-test-c6）：全仓只一份 ln。
// 依据：卷二:1408 非整数次幂唯一写法 fixedExp(fixedMultiply8(k, fixedLn(x)))；卷二:1400 fixedLn 唯一定义；
//       卷二十七:620 R27-5.2 "内核定点数学设施是全仓超越函数的唯一实现；ln 只留卷二一份"（李白 Q-6，
//       docs/审查/李白裁定-1117.md 附近；本卡不再引用其行号，未核实）。
// 测什么：经公开入口 pow(x, k)（用到对数的派生量）得到的值，必须等于卷文写法 fixedExp(k·fixedLn(x))；
//        表里的 ln 行被替换为全零时，pow 不得再读它（若读，结果退化为 e⁰ = 10⁸，测试红）。
//        分布采样（sample.mjs 的 lognormal）只用 exp，不经 ln，故采样路径没有可测的 ln 点，这里不假设它存在。
// 期望：pow(2·10⁸, 5·10⁷) 的卷文值 = fixedExp(34657359)，其中 34657359 = fixedMultiply8(5·10⁷, 69314718)，
//       69314718 为卷二 fixedLn(2) 的字面量（见 fixed-ln.test.mjs）；数值上贴近 √2·10⁸ = 141421356，
//       误差按卷二:1408 的界 (2|k|+7)·10⁻⁸·y + 4·10⁻⁸，|k|=0.5、y≈1.414 时约 15.3 单位，取 16。
// 修前会失败的：修前 pow 查 fnTables.ln（表值全 0 时 ln 为 0，结果为 10⁸），与卷文 √2·10⁸ 不符，红。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installFixedConstants, installExpTable, installDetTables, fixedExp, pow,
} from '../../../server-plugin/kernel/det-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_distributions.json'), 'utf8'));

installFixedConstants({
  BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000,
  fixedLnWorkExponent: 18, fixedLnInputExponent: 10, fixedLnSeriesTerms: 20, LN2: '693147180559945309',
});
installExpTable(DOC.expTable);

// 探针：把 det-numeric 里的 ln 行全部换成零。若派生量仍经表读 ln，结果会偏离卷文值。
// exp 行只给出 outScale（10⁸）；指数由 fixedExp 直接算（卷二:1398），与表值无关。
installDetTables({
  exp: {
    inScale: 100000000, outScale: 100000000, domainMin: -4000000000, domainMax: 4000000000,
    step: 100000000, values: null,
  },
  ln: {
    inScale: 100000000, outScale: 100000000, domainMin: 100000000, domainMax: 1000000000,
    step: 100000000, values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
});

test('pow(2, 1) 经卷文 fixedLn 与 fixedExp：pow(2·10⁸, 10⁸) = fixedExp(69314718) ，ln 2 的字面量 69314718 来自 fixedLn(2)', () => {
  assert.equal(pow(200000000n, 100000000n), fixedExp(69314718n));
});

test('pow(2, 0.5) 按卷二:1408 写法 = fixedExp(34657359)，且贴近 √2·10⁸ = 141421356（卷二:1408 误差界 16 单位）', () => {
  const r = pow(200000000n, 50000000n);
  assert.equal(r, fixedExp(34657359n));
  const diff = r - 141421356n;
  assert.ok(diff >= -16n && diff <= 16n, `pow(2,0.5)=${r} diff=${diff}`);
});

test('pow 底数须为正，≤0 即 E-DET-DOMAIN（卷二:1408 "底数须为正"，不钳位）', () => {
  assert.throws(() => pow(0n, 50000000n), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => pow(-100000000n, 50000000n), (e) => e.code === 'E-DET-DOMAIN');
});
