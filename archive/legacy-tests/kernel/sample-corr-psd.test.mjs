// joint 分布 corr 半正定校验的整数算法验收（卷二 §1.10 :318；卷二十七 :615、:634）。
// 期望值按卷文公式手算成字面量，先造前提再断言；刻意的：不装 fnTables.sqrt，证明校验不依赖开方表。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { installSampleConstants, validateDistribution } from '../../server-plugin/kernel/sample.mjs';

// 内核摘要能力由装配文件注入（卷二 §2.9 :984）；本文件走校验路径用不到摘要，照同目录测试装一个以防加载期检查。
installDigestCap({
  sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex'),
});
// 定点常数照 world/rules/tables/kernel-constants.json（卷二 S10 登记豁免表），与 kernel 测试夹具同值。
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
installSampleConstants({ kernelConstants: { diceKeyMaxQualifiers: 2 } });

// joint 的 marginal 键与矩阵阶数一致（矩阵不对称、对角不为 1 的用例也走同一 joint 形状）。
const MARGINAL_KEYS = ['pers_openness', 'pers_diligence', 'pers_neuroticism'];
const marginalsFor = (n) => {
  const m = {};
  for (let i = 0; i < n; i++) m[MARGINAL_KEYS[i]] = { dist: 'normal', mean: 0, sd: 1 };
  return m;
};
const joint = (corr) => ({ dist: 'joint', group: 'personality', marginals: marginalsFor(corr.length), corr });
const passes = (corr) => assert.doesNotThrow(() => validateDistribution(joint(corr)));
const rejects = (corr) => assert.throws(() => validateDistribution(joint(corr)), (e) => e.code === 'E-DIM-SAMPLE-CORR');

test('半正定接受的矩阵：2 阶、单位阵、等相关 3 阶、奇异半正定、正定 3 阶', () => {
  // 主元 1−0.09=0.91>0（10⁸ 标度：10¹⁶−30000000²=991000000000000>0）。
  passes([[1, 0.3], [0.3, 1]]);
  // 单位阵：主元恒为 1。
  passes([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  // [[1,0.5,0.5],[0.5,1,0.5],[0.5,0.5,1]] 特征值 2, 0.5, 0.5 全正。
  // 手算消元：第 0 步 p=1，a[1][1]=a[2][2]=1·1−0.5·0.5=0.75，a[1][2]=0.5·1−0.5·0.5=0.25；
  // 第 1 步 p=0.75，a[2][2]=0.75·0.75−0.25·0.25=0.5>0（10⁸ 标度 5000…>0）。
  passes([[1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]]);
  // 奇异半正定：第 1 步主元 1·1−1·1=0，按零主元跳过，不抛。
  passes([[1, 1], [1, 1]]);
  // [[1,0.5,-0.5],[0.5,1,-0.5],[-0.5,-0.5,1]]：行列式 0.5>0、各 2 阶主子式 0.75>0，正定。
  passes([[1, 0.5, -0.5], [0.5, 1, -0.5], [-0.5, -0.5, 1]]);
  // 零主元且该行余下元素全为 0 的半正定矩阵：第 0 步后 a11=0、a12=0·1−1·0=0，零主元行余下为 0，接受；a22=1>0。
  passes([[1, 1, 0], [1, 1, 0], [0, 0, 1]]);
});

test('零主元行余下元素不为 0 的非半正定矩阵被拒（卷二:325）', () => {
  // [[1,1,0],[1,1,1],[0,1,1]]（行列式 −1）：第 0 步后 a11=1−1=0，a12=1·1−1·0=1（10¹⁶ 标度），零主元行余下 a12≠0，拒。
  rejects([[1, 1, 0], [1, 1, 1], [0, 1, 1]]);
  // [[1,1,0.5],[1,1,0.2],[0.5,0.2,1]]：第 0 步后 a11=0，a12=0.2·1−1·0.5=−0.3≠0，拒。
  rejects([[1, 1, 0.5], [1, 1, 0.2], [0.5, 0.2, 1]]);
});

test('半正定拒绝的矩阵：负行列式 3 阶、相关超 1、不对称、对角不为 1', () => {
  // [[1,0.9,-0.9],[0.9,1,0.9],[-0.9,0.9,1]]：det = 0.19 − 1.539 − 1.539 < 0。
  // 手算消元：第 0 步 p=1，a[1][1]=1−0.81=0.19，a[1][2]=0.9·1−0.9·(−0.9)=1.71，a[2][2]=1−0.81=0.19；
  // 第 1 步 p=0.19，a[2][2]=0.19·0.19−1.71·1.71=0.0361−2.9241<0。
  rejects([[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]]);
  // 第 0 步后主元 1−2.25<0。
  rejects([[1, 1.5], [1.5, 1]]);
  // 对称检查（先于半正定）拒。
  rejects([[1, 0.3], [0.4, 1]]);
  // 对角检查拒。
  rejects([[2, 0.3], [0.3, 1]]);
});

test('精度：贴近 1 的相关系数按 10⁸ 标度分出正负主元', () => {
  // 主元 1−0.99980001=0.00019999>0（10⁸ 标度：10¹⁶−99990000²=19999900000000>0）。
  passes([[1, 0.9999], [0.9999, 1]]);
  // 主元 1−1.00020001<0（10⁸ 标度：10¹⁶−100010000²<0）。
  rejects([[1, 1.0001], [1.0001, 1]]);
});

test('静态断言：sample.mjs 不现算浮点开方（校验不依赖 fnTables.sqrt）', () => {
  const src = readFileSync(new URL('../../server-plugin/kernel/sample.mjs', import.meta.url), 'utf8');
  assert.ok(!src.includes('Math.sqrt'));
});
