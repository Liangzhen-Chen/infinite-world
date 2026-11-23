// C6 验收（出题方 haiku-test-c6）：加载期 joint corr 半正定校验（sample.mjs 公开入口 validateDistribution）。
// 依据：卷二:325 "joint 的 corr 对称且对角为 1、半正定（E-DIM-SAMPLE-CORR，RA-S9）"；
//       卷二十七:634 "开方经卷二 §1.10 的整数开方（卷五 fixedSqrtInt），不现算浮点"（sample.mjs:285 的 Math.sqrt 违此条）。
// 测什么：几组 corr 矩阵的接受/拒绝结论按卷文：正定与半正定边界（奇异、秩亏）接受，非半正定拒绝（E-DIM-SAMPLE-CORR）。
// 修前是否红：九条结论修前代码本就给出（Cholesky 主元符号判据），作对照；「−0.5 半正定边界」一条修前红（浮点误拒，见出题.md）。
//   卷文要求的"浮点开方与整数开方给不同结论的边界例"：该校验的结论只由主元符号决定，主元符号在精确算术下
//   与开方算法无关；卷文未规定校验内部的定点算法，故推不出一组卷文可证的边界例，本卡不编造，见出题.md 说明。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { installFixedConstants } from '../../../server-plugin/kernel/det-math.mjs';
import { validateDistribution } from '../../../server-plugin/kernel/sample.mjs';

// 与生产同序：加载期先装内核常数（生产在 kernel/load/world.mjs:66），常数从 world/rules/tables/kernel-constants.json 读。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const KC = JSON.parse(readFileSync(join(ROOT, 'world/rules/tables/kernel-constants.json'), 'utf8'));
installFixedConstants(Object.fromEntries(KC.rows.map((r) => [r.key, r.value])));

installDigestCap({
  sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex'),
});

// 边际数与 corr 阶数一致（每轴一个标准正态）；normal 的参数名是 mean 与 sd（sample.mjs 的 normal 校验）。
const joint = (corr) => ({
  dist: 'joint',
  marginals: Object.fromEntries(corr.map((_, i) => [`x${i}`, { dist: 'normal', mean: 0, sd: 1 }])),
  corr,
});

const accepts = (corr) => { assert.doesNotThrow(() => validateDistribution(joint(corr))); };
const rejects = (corr) => { assert.throws(() => validateDistribution(joint(corr)), (e) => e.code === 'E-DIM-SAMPLE-CORR'); };

test('正定 2×2 [[1,0.5],[0.5,1]] 接受（卷二:325）', () => {
  accepts([[1, 0.5], [0.5, 1]]);
});

test('半正定边界 2×2 [[1,1],[1,1]]（奇异，秩 1）接受：第二主元精确为 0（卷二:325 "半正定"）', () => {
  accepts([[1, 1], [1, 1]]);
});

test('半正定边界 2×2 [[1,−1],[−1,1]]（奇异）接受', () => {
  accepts([[1, -1], [-1, 1]]);
});

test('半正定边界 3×3 全 1 矩阵（秩 1）接受', () => {
  accepts([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
});

test('正定 3×3 等相关 0.5 接受', () => {
  accepts([[1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]]);
});

test('半正定边界 3×3 等相关 −0.5（秩 2，下界 −1/(n−1) 恰取到）接受', () => {
  accepts([[1, -0.5, -0.5], [-0.5, 1, -0.5], [-0.5, -0.5, 1]]);
});

test('非半正定 2×2 [[1,1.0001],[1.0001,1]] 拒绝（第二主元 −0.00020001 < 0）', () => {
  rejects([[1, 1.0001], [1.0001, 1]]);
});

test('非半正定 3×3 三对角 0.9 [[1,0.9,0],[0.9,1,0.9],[0,0.9,1]] 拒绝（行列式 1−2·0.81 < 0）', () => {
  rejects([[1, 0.9, 0], [0.9, 1, 0.9], [0, 0.9, 1]]);
});

test('非半正定 3×3 等相关 −0.6 拒绝（下界 −1/(n−1) = −0.5，−0.6 越界）', () => {
  rejects([[1, -0.6, -0.6], [-0.6, 1, -0.6], [-0.6, -0.6, 1]]);
});

test('非对称 corr 与对角非 1 仍拒（卷二:325 前半句，对照）', () => {
  rejects([[1, 0.5], [0.4, 1]]);
  rejects([[2, 0.5], [0.5, 1]]);
});
