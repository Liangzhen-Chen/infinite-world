// C6 验收（出题方 haiku-test-c6）：fixedLn 定点自然对数，唯一定义为卷二六步级数。
// 依据：卷二 §3.3 fixedLn 六步、卷二:1400–1408（卡文写"卷二:1380"，主线实际行为 1400，按实际行引）；
//       卷二:1394 定点指数与整数次幂的唯一定义标题（卡文写"卷二:1374"，实际 1394）；卷二:1408 非整数次幂写法。
//       卷二十七:620 R27-5.2 "内核定点数学设施是全仓超越函数的唯一实现"。
// 测什么：fixedLn 在 1、e 附近、0.5、2、10、极小正数、定义域上界处的返回值与卷文六步算法逐位一致；
//        定义域 0 < x ≤ expInt[40] 之外报 E-DET-DOMAIN，不钳位。
// 期望字面量来源：n、t 等中间量按卷文第 2–3 步手算（见每条注释），末级 L÷10¹⁰ 的结果由出题方
//   另写的 BigInt 独立转写（scratchpad，不入库）按卷文六步核出；每个结果与真值 10⁸·ln x 之差均在卷文界 2 单位内。
// 修前会失败的：本文件是 fixedLn 的行为，修前 fixedLn 已在卷二六步上实现，故本文件预期修前全绿，作对照；
//        它守住"fixedLn 这一份的结果就是卷文定义"，C6 把 det-math 的查表 ln 并掉后，fixedLn 必须仍逐位如此。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixedConstants, installExpTable, fixedLn } from '../../../server-plugin/kernel/det-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_distributions.json'), 'utf8'));

// 卷二 S10 登记的同值常数（W = 10¹⁸、A 的升标度 10¹⁰、级数 20 项、LN2 十八位定点，卷二:1401–1405）。
installFixedConstants({
  BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000,
  fixedLnWorkExponent: 18, fixedLnInputExponent: 10, fixedLnSeriesTerms: 20, LN2: '693147180559945309',
});
installExpTable(DOC.expTable);

// expInt[40] = e⁴⁰ 的 10⁸ 标度整数，即卷文定义域上界（卷二:1400 "定义域 0 < x ≤ expInt[40]"）。
const TOP = BigInt(DOC.expTable.expInt.values[DOC.expTable.expInt.values.length - 1]);

test('fixedLn(1) = 0：n=0、t=0、s=0，L=0（卷二:1401–1406）', () => {
  assert.equal(fixedLn(100000000n), 0n);
});

test('fixedLn(2) = 69314718：A=2·10¹⁸=2W，n=1，m=W，t=0，L=LN2，LN2÷10¹⁰ 向零截断得 69314718（卷二:1402–1406）', () => {
  assert.equal(fixedLn(200000000n), 69314718n);
});

test('fixedLn(0.5) = −69314718：A=5·10¹⁷，n=−1，m=W，t=0，L=−LN2，−69314718.0559… 向零截断得 −69314718（卷二:1406 "向零截断"）', () => {
  assert.equal(fixedLn(50000000n), -69314718n);
});

test('fixedLn(e 附近 2.71828182) = 99999999：n=1，t=152233768011763231，结果 99999999（真值 99999999.69，差 −0.69 < 2）', () => {
  assert.equal(fixedLn(271828182n), 99999999n);
});

test('fixedLn(10) = 230258509：n=3，m=1.25W，t=⌊W÷9⌋=111111111111111111，L = 3·LN2+2s，÷10¹⁰ 向零截断得 230258509（真值 230258509.2994，差 −0.30 < 2）', () => {
  assert.equal(fixedLn(1000000000n), 230258509n);
});

test('fixedLn(极小正数 1)（10⁻⁸）= −1842068074：n=−27（卷文允许范围 −27≤n≤57 的下端），真值 −1842068074.3952', () => {
  assert.equal(fixedLn(1n), -1842068074n);
});

test('fixedLn(定义域上界 expInt[40]) = 3999999999：n=57，真值 40·10⁸ = 4000000000，结果差 −1 < 2', () => {
  assert.equal(fixedLn(TOP), 3999999999n);
});

test('fixedLn 定义域：x ≤ 0 与越上界即错 E-DET-DOMAIN，不钳位（卷二:1400）', () => {
  assert.throws(() => fixedLn(0n), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedLn(-1n), (e) => e.code === 'E-DET-DOMAIN');
  assert.throws(() => fixedLn(TOP + 1n), (e) => e.code === 'E-DET-DOMAIN');
});
