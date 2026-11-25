// drawByKey 测试：卷二 §1.10 封卷后勘误 1121k1（:336）、卷二十七 R27-8.5 :721–:733、卷一 §8.2 :637–:638。
// 键 = sha256(utf8(worldSeed|streamCode|subjectId|worldTime 十进制|drawSiteCode))，第 0 个均匀数照 §1.10 的扩展：
//   h_0 = sha256(utf8(键 + "|0"))，u = BigInt("0x" + h_0 前 16 位十六进制)；
// uniform 值 = min + (max − min) × u ÷ 2⁶⁴，再按 4 位定点向零截断。
// 前置照 tests/kernel/sample.test.mjs：node:crypto 装摘要能力、kernel-constants 同值、diceKeyMaxQualifiers、分位数表、exp 表与 sqrt 行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { installFixedConstants, installDetTables, installExpTable } from '../../server-plugin/kernel/det-math.mjs';
import {
  installSampleConstants, installSampleDistributions, drawByKey,
} from '../../server-plugin/kernel/sample.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_distributions.json'), 'utf8'));

// 内核摘要能力由装配文件注入（卷二 §2.9 :984）；测试里用 node:crypto 装一个。
installDigestCap({
  sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex'),
});
// 定点常数照 world/rules/tables/kernel-constants.json，与 kernel 测试夹具同值。
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
// 骰值键限定成分个数上限（卷二十七 R27-8.5 :728）。
installSampleConstants({ kernelConstants: { diceKeyMaxQualifiers: 2 } });
// normal 分位数表与 lognormal 的 exp 表（卷二 §1.10 :324–:325），与 det-math-exp 测试同法从冻结表装入。
installSampleDistributions(DOC);
installExpTable(DOC.expTable);
// triangular 的整数开方行（卷二十七 R27-5.2 :573）：不查表，牛顿法固定 32 步。
installDetTables({ sqrt: { inScale: 100000000, outScale: 100000000, domainMin: 0, domainMax: 9007199254740991, step: 1, iterations: 32 } });

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const TWO64 = 2n ** 64n;

// 五段与分布都固定的调用简写。
const draw = (d = {}, seed = 'seed_ab12', stream = 'clock_draw', subject = 'per_abc123', time = 5, site = 'draw_weather') =>
  drawByKey(seed, stream, subject, time, site, d);

// 4 位定点（10⁴ 标度）：返回值的小数不超过 4 位，即十进制四舍五入到 4 位仍是自己。
const isFourDecimals = (x) => Number.isFinite(x) && Number(x.toFixed(4)) === x;

// 1. 键公式：测试里用 node:crypto 按卷二 :336 独立算，不经被测函数。
//    键 k = sha256("seed_ab12|clock_draw|per_abc123|5|draw_weather")；
//    h₀ = sha256(k + "|0")；u = BigInt("0x" + h₀.slice(0, 16))；
//    uniform min=10 max=20：单位 10⁴，值 = ⌊(10×10⁴ + 10×10⁴ × u ÷ 2⁶⁴)⌋ ÷ 10⁴（整除向零截断）。
test('键公式：sha256 五段键 + "|0" 再哈希，取前 16 位十六进制作第 0 个均匀数', () => {
  const key = sha256Hex('seed_ab12|clock_draw|per_abc123|5|draw_weather');
  const h0 = sha256Hex(`${key}|0`);
  const u = BigInt(`0x${h0.slice(0, 16)}`);
  // 10 与 20 在 10⁴ 标度下为 100000 与 200000，跨度为 100000。
  const units = 100000n + (100000n * u) / TWO64;
  const expected = Number(units) / 10000;
  const actual = draw({ dist: 'uniform', min: 10, max: 20 });
  assert.equal(actual, expected);
  assert.equal(typeof actual, 'number');
  assert.ok(isFourDecimals(actual));
});

// 2. 确定性：同五段同分布两次同值；交错调别的键后再调仍同值；五段各改一次，至少 4 个变体与原值不同。
//    分布取 uniform 0..1000000（宽范围），同键同值、异键几乎必异值。
test('确定性与次序无关：同键同值，五段任一改变得到不同值', () => {
  const dist = { dist: 'uniform', min: 0, max: 1000000 };
  const base = draw(dist);
  assert.equal(draw(dist), base);
  // 交错调用别的键与别的分布，不改变原键的结果（无游标）。
  draw({ dist: 'uniform', min: 0, max: 1 }, 'seed_zz', 'clock_other', 'per_zzz', 7, 'draw_other');
  draw({ dist: 'categorical', weights: { grd_a: 1, grd_b: 2 } }, 'seed_ww', 'clock_draw', 'per_qqq', 9, 'draw_site');
  assert.equal(draw(dist), base);

  const variants = [
    drawByKey('seed_ab13', 'clock_draw', 'per_abc123', 5, 'draw_weather', dist),
    drawByKey('seed_ab12', 'clock_draw2', 'per_abc123', 5, 'draw_weather', dist),
    drawByKey('seed_ab12', 'clock_draw', 'per_abc124', 5, 'draw_weather', dist),
    drawByKey('seed_ab12', 'clock_draw', 'per_abc123', 6, 'draw_weather', dist),
    drawByKey('seed_ab12', 'clock_draw', 'per_abc123', 5, 'draw_weather2', dist),
  ];
  // 不要求五段各改后的值两两都不同（分布值域有限），只要求至少 4 个与原值不同。
  assert.ok(variants.filter((v) => v !== base).length >= 4);
});

// 3. normal、triangular、lognormal：返回值有限、有 clamp 时落在 clamp 内、无 clamp 时仍有限、最多 4 位小数。
//    clamp 只取分布对象自带的 clamp（卷二 :336）。
test('normal / triangular / lognormal：有限、落在自带 clamp 内、4 位定点', () => {
  const subjects = Array.from({ length: 20 }, (_, i) => `per_abc${100 + i}`);
  const valuesOf = (dist) => subjects.map((s) => draw(dist, 'seed_ab12', 'clock_draw', s, 5, 'draw_weather'));

  const normal = valuesOf({ dist: 'normal', mean: 5, sd: 1, clamp: [0, 10] });
  for (const x of normal) {
    assert.ok(Number.isFinite(x));
    assert.ok(x >= 0 && x <= 10);
    assert.ok(isFourDecimals(x));
  }

  const normalNoClamp = valuesOf({ dist: 'normal', mean: 0, sd: 1 });
  for (const x of normalNoClamp) {
    assert.ok(Number.isFinite(x));
    assert.ok(isFourDecimals(x));
  }

  const triangular = valuesOf({ dist: 'triangular', min: 0, mode: 5, max: 10, clamp: [2, 8] });
  for (const x of triangular) {
    assert.ok(Number.isFinite(x));
    assert.ok(x >= 2 && x <= 8);
    assert.ok(isFourDecimals(x));
  }

  // lognormal = exp(mu + sigma×z)：sigma 取 1，clamp [1, 3] 会把尾部钳住，验证 clamp 生效且不越界。
  const lognormal = valuesOf({ dist: 'lognormal', mu: 0, sigma: 1, clamp: [1, 3] });
  for (const x of lognormal) {
    assert.ok(Number.isFinite(x));
    assert.ok(x >= 1 && x <= 3);
    assert.ok(isFourDecimals(x));
  }

  const lognormalNoClamp = valuesOf({ dist: 'lognormal', mu: 0, sigma: 1 });
  for (const x of lognormalNoClamp) {
    assert.ok(Number.isFinite(x));
    assert.ok(isFourDecimals(x));
  }
});

// 4. categorical：返回 weights 里的键；权重 0 的键永远取不到；只有一项非 0 时必取它。
test('categorical：返回键、0 权重不取、唯一非 0 必取', () => {
  const dist = { dist: 'categorical', weights: { terrain_hill: 3, terrain_plain: 5 } };
  const keys = new Set(['terrain_hill', 'terrain_plain']);
  for (let i = 0; i < 20; i += 1) assert.ok(keys.has(draw(dist, 'seed_ab12', 'clock_draw', `per_abc${100 + i}`, 5, 'draw_weather')));

  const zeroWeight = { dist: 'categorical', weights: { grd_a: 0, grd_b: 1 } };
  for (let i = 0; i < 50; i += 1) {
    assert.equal(draw(zeroWeight, 'seed_ab12', 'clock_draw', `per_abc${200 + i}`, 5, 'draw_weather'), 'grd_b');
  }

  const onlyOne = { dist: 'categorical', weights: { grd_a: 0, grd_b: 5 } };
  for (let i = 0; i < 20; i += 1) {
    assert.equal(draw(onlyOne, 'seed_ab12', 'clock_draw', `per_abc${300 + i}`, 5, 'draw_weather'), 'grd_b');
  }
});

// 5. 非法分布：curve、joint、ref 不按骰值取（E-DIM-SAMPLE-PARAM）；normal sd≤0、clamp 上下限倒置（E-DIM-SAMPLE-PARAM）；
//    categorical 权重全 0（E-DIM-SAMPLE-WEIGHTS）。断言错误的 code。
test('非法分布与非法参数报各自的码', () => {
  const code = (dist, want) => assert.throws(() => draw(dist), (e) => e.code === want);
  code({ dist: 'curve', curve: 'x', x: 'y' }, 'E-DIM-SAMPLE-PARAM');
  code({ dist: 'joint', group: 'personality', marginals: { pers_openness: { dist: 'normal', mean: 0, sd: 1 } }, corr: [[1]] }, 'E-DIM-SAMPLE-PARAM');
  code({ dist: 'ref', name: 'personality_default' }, 'E-DIM-SAMPLE-PARAM');
  code({ dist: 'normal', mean: 0, sd: 0 }, 'E-DIM-SAMPLE-PARAM');
  code({ dist: 'normal', mean: 0, sd: -1 }, 'E-DIM-SAMPLE-PARAM');
  code({ dist: 'categorical', weights: { grd_a: 0, grd_b: 0 } }, 'E-DIM-SAMPLE-WEIGHTS');
  code({ dist: 'normal', mean: 0, sd: 1, clamp: [2, 1] }, 'E-DIM-SAMPLE-PARAM');
});

// 6. 键五段文法：主体 id 含大写或空串、时刻不是整数，都报 E-SEED-COMPONENT（R27-8.5 :721–:733）。
test('键五段文法不合报 E-SEED-COMPONENT', () => {
  const dist = { dist: 'uniform', min: 0, max: 1 };
  const code = (fn) => assert.throws(fn, (e) => e.code === 'E-SEED-COMPONENT');
  code(() => drawByKey('seed_ab12', 'clock_draw', 'Per_abc123', 5, 'draw_weather', dist));
  code(() => drawByKey('seed_ab12', 'clock_draw', '', 5, 'draw_weather', dist));
  code(() => drawByKey('seed_ab12', 'clock_draw', 'per_abc123', 1.5, 'draw_weather', dist));
});
