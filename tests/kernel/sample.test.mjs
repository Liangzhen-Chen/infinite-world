// 4-3《骰值键、sample 与种子键登记》测试先行：卷二 §1.10 :305–:331、卷二十七 R27-8.1–8.5 :717–:741、
// 卷一 §8.2 :637–:638。能用普通测试守住的五类（李白 11-18 16:3x 第 2 条）：种子键派生 golden vector、h_i/u 取数、
// 各分布参数校验、骰值键恰五段与限定成分、sample 纯函数。期望值按卷文公式手算成字面量，不用被测函数算；
// sha256 字面量用 node:crypto 独立算一次后写死。纯测试条目用 E-ACC-TEST-FAIL（李白 16:3x 第 1 条）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { installSampleConstants, seedKeyFor, hashAt, uniformAt, diceKeyOf, validateDistribution, sample } from '../../server-plugin/kernel/sample.mjs';

// 内核摘要能力由装配文件注入（卷二 §2.9 :984，# kernel 不 import node:crypto）；测试里用 node:crypto 装一个。
installDigestCap({
  sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex'),
});
// 定点常数照 world/rules/tables/kernel-constants.json（卷二 S10 登记豁免表），与 kernel 测试夹具同值。
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
// 骰值键限定成分个数上限：同表 kernelConstants.diceKeyMaxQualifiers（卷二十七 R27-8.5 :728），由加载入口在读到规则表后收下。
installSampleConstants({ kernelConstants: { diceKeyMaxQualifiers: 2 } });

// 卷二 §1.10 :320：seedKey = sha256(utf8(template.seed + "|" + kind + "|" + instanceId + "|" + dimension))；
// joint 把 dimension 换成 "joint:" + group。
// 手算输入 "seed_ab12|person|per_abc123|height" 的 sha256（node:crypto 独立算得）。
const SEED_PLAIN = '87a2ca91cf1688c85ad10a0577ec36ebddb1857ed0f86704d7f2f0c887e9421d';
// "seed_ab12|gadget|gad_1|joint:personality"
const SEED_JOINT = '73441ce05ab38af58a93cff2e4cb6443f0dfe8a6fbef3e4929429805c0845003';
// 驼峰维度键（卷二 §1.9 :284 的 lowerCamel 文法）："seed_ab12|person|per_abc123|bodyMassKg"
const SEED_CAMEL = '1374cdce838941fa7f91848280b4da464777fe2b3947e02c07d8a77960ce298b';
// 卷二 §1.10 :322–323：h_i = sha256(seedKey + "|" + i)，i=0 也再哈希一次；u = BigInt("0x" + h_i.slice(0,16))。
const H0 = '0166f0ccf6416e8848a5b02719c8c0732c6daa44ef428b60bc6d48f11e2c21b0';
const H1 = '14102010e6df8993b42faab8c84db632756764d4173e3062ab553f35f3dd8948';
const U0 = 0x0166f0ccf6416e88n;
const U1 = 0x14102010e6df8993n;

test('种子键派生 golden vector（普通维度与 joint 段）', () => {
  assert.equal(seedKeyFor('seed_ab12', 'person', 'per_abc123', 'height'), SEED_PLAIN);
  assert.equal(seedKeyFor('seed_ab12', 'gadget', 'gad_1', 'personality', 'personality'), SEED_JOINT);
});

test('种子键接受 lowerCamel 维度键（卷二 §1.9 :284）：bodyMassKg 与 golden vector', () => {
  // 常量由 node:crypto 对卷二 :320 的输入串独立算出（不经过 kernel 摘要注入）。
  assert.equal(createHash('sha256').update('seed_ab12|person|per_abc123|bodyMassKg', 'utf8').digest('hex'), SEED_CAMEL);
  assert.equal(seedKeyFor('seed_ab12', 'person', 'per_abc123', 'bodyMassKg'), SEED_CAMEL);
});

test('种子键各部件按卷二 :320 的文法拒收（E-DIM-SAMPLE-PARAM）', () => {
  const code = (fn) => assert.throws(fn, (e) => e.code === 'E-DIM-SAMPLE-PARAM');
  code(() => seedKeyFor('', 'person', 'per_abc123', 'height'));
  code(() => seedKeyFor('bad seed', 'person', 'per_abc123', 'height'));
  code(() => seedKeyFor('seed|bad', 'person', 'per_abc123', 'height'));
  code(() => seedKeyFor('x'.repeat(65), 'person', 'per_abc123', 'height'));
  code(() => seedKeyFor('seed_ab12', 'Person', 'per_abc123', 'height'));
  code(() => seedKeyFor('seed_ab12', 'person', 'per_abc|123', 'height'));
  code(() => seedKeyFor('seed_ab12', 'person', 'per_abc123', 'height|x'));
  // 维度键是 lowerCamel（§1.9 :284），下划线不在字符集里；代号文法放过的 body_mass 在这里不合。
  code(() => seedKeyFor('seed_ab12', 'person', 'per_abc123', 'body_mass'));
  code(() => seedKeyFor('seed_ab12', 'person', 'per_abc123', 'personality', 'bad group'));
});

test('h_i 与 u 取数 golden vector（i=0 也再哈希，取前 16 位十六进制）', () => {
  assert.equal(hashAt(SEED_PLAIN, 0), H0);
  assert.equal(hashAt(SEED_PLAIN, 1), H1);
  assert.equal(uniformAt(SEED_PLAIN, 0), U0);
  assert.equal(uniformAt(SEED_PLAIN, 1), U1);
  assert.equal(typeof uniformAt(SEED_PLAIN, 0), 'bigint');
  assert.throws(() => hashAt(SEED_PLAIN, -1), (e) => e.code === 'E-DIM-SAMPLE-PARAM');
});

test('骰值键恰五段：worldSeed|streamCode|subjectId|worldTime|drawSiteCode（R27-8.5 :721–:723）', () => {
  const key = diceKeyOf('seed_ab12', 'clock_draw', 'per_abc123', 5, 'draw_weather');
  assert.equal(key, 'seed_ab12|clock_draw|per_abc123|5|draw_weather');
  assert.equal(key.split('|').length, 5);
});

test('复合对象段：主体 id 后接一到两个限定成分，各成分用 | 连接（R27-8.5 :728）', () => {
  assert.equal(diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b'], 5, 'draw_weather'), 'seed_ab12|clock_draw|place_a|field_b|5|draw_weather');
  assert.equal(diceKeyOf('seed_ab12', 'clock_draw', ['emitter_a', 'field_b', 2], 5, 'draw_weather'), 'seed_ab12|clock_draw|emitter_a|field_b|2|5|draw_weather');
});

test('复合对象段空限定成分位置填 nil_seedpart，不省略该位置（R27-8.5 :730）', () => {
  // 中间位置为空：三成分段与两成分段是不同键，空位不被 filter 吞掉。
  assert.equal(diceKeyOf('seed_ab12', 'clock_draw', ['place_a', undefined, 'field_b'], 5, 'draw_weather'),
    'seed_ab12|clock_draw|place_a|nil_seedpart|field_b|5|draw_weather');
  assert.notEqual(
    diceKeyOf('seed_ab12', 'clock_draw', ['place_a', undefined, 'field_b'], 5, 'draw_weather'),
    diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b'], 5, 'draw_weather'),
  );
  // 末位为空也填，不省略。
  assert.equal(diceKeyOf('seed_ab12', 'clock_draw', ['place_a', undefined], 5, 'draw_weather'),
    'seed_ab12|clock_draw|place_a|nil_seedpart|5|draw_weather');
  assert.equal(diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b', undefined], 5, 'draw_weather'),
    'seed_ab12|clock_draw|place_a|field_b|nil_seedpart|5|draw_weather');
});

test('骰值键成分拒收：空、多余限定成分、非法成分、非整数时刻（E-SEED-COMPONENT）', () => {
  const code = (fn) => assert.throws(fn, (e) => e.code === 'E-SEED-COMPONENT');
  code(() => diceKeyOf('', 'clock_draw', 'per_abc123', 5, 'draw_weather'));
  code(() => diceKeyOf('seed|bad', 'clock_draw', 'per_abc123', 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'Clock', 'per_abc123', 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', '', 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', [], 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b', 2, 3], 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'bad field'], 5, 'draw_weather'));
  // null 不是"位置存在而值缺"，不得当作空成分填 nil_seedpart，照拒。
  code(() => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', null], 5, 'draw_weather'));
  // 多出的第四段即便取值为空也不得当成"第三个限定成分"，按长度拒。
  code(() => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field_b', 2, undefined], 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', 'field|b'], 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', ['place_a', -1], 5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', 'per_abc123', 1.5, 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', 'per_abc123', '5', 'draw_weather'));
  code(() => diceKeyOf('seed_ab12', 'clock_draw', 'per_abc123', 5, ''));
});

// ---------- 各分布参数校验（卷二 §1.10 :318） ----------

const ENGINE = () => ({
  template: { seed: 'seed_ab12' },
  vocab: { index: new Map([['grd_a', { family: 'grade' }], ['grd_b', { family: 'grade' }]]) },
  tables: new Map(),
});

const fails = (dist, dimDef, code) => assert.throws(() => validateDistribution(dist, dimDef, ENGINE()), (e) => e.code === code);
const passes = (dist, dimDef) => assert.doesNotThrow(() => validateDistribution(dist, dimDef, ENGINE()));

test('normal sd>0、lognormal sigma>0、uniform min<max、triangular min≤mode≤max（E-DIM-SAMPLE-PARAM）', () => {
  passes({ dist: 'normal', mean: 0, sd: 0.35 });
  fails({ dist: 'normal', mean: 0, sd: 0 }, {}, 'E-DIM-SAMPLE-PARAM');
  fails({ dist: 'normal', sd: 1 }, {}, 'E-DIM-SAMPLE-PARAM');
  passes({ dist: 'lognormal', mu: 3.69, sigma: 0.12 });
  fails({ dist: 'lognormal', mu: 3.69, sigma: 0 }, {}, 'E-DIM-SAMPLE-PARAM');
  passes({ dist: 'uniform', min: 0.5, max: 1.5 });
  fails({ dist: 'uniform', min: 2, max: 2 }, {}, 'E-DIM-SAMPLE-PARAM');
  passes({ dist: 'triangular', min: 0.8, mode: 1, max: 1.3 });
  fails({ dist: 'triangular', min: 1.2, mode: 1, max: 1.3 }, {}, 'E-DIM-SAMPLE-PARAM');
  fails({ dist: 'poisson', mean: 1 }, {}, 'E-DIM-SAMPLE-PARAM');
  fails({}, {}, 'E-DIM-SAMPLE-PARAM');
});

test('categorical：权重非负整数且和>0、键在枚举域（E-DIM-SAMPLE-WEIGHTS）', () => {
  passes({ dist: 'categorical', weights: { grd_a: 3, grd_b: 5 } }, { type: 'enum', vocab: 'grade' });
  passes({ dist: 'categorical', weights: { grd_a: 1, grd_b: 0 } }, { type: 'enum', vocab: 'grade' });
  fails({ dist: 'categorical', weights: { grd_a: -1, grd_b: 2 } }, {}, 'E-DIM-SAMPLE-WEIGHTS');
  fails({ dist: 'categorical', weights: { grd_a: 0.5, grd_b: 2 } }, {}, 'E-DIM-SAMPLE-WEIGHTS');
  fails({ dist: 'categorical', weights: { grd_a: 0, grd_b: 0 } }, {}, 'E-DIM-SAMPLE-WEIGHTS');
  fails({ dist: 'categorical', weights: { grd_x: 1 } }, { type: 'enum', vocab: 'grade' }, 'E-DIM-SAMPLE-WEIGHTS');
});

test('clamp ⊂ domain（E-DIM-SAMPLE-DOMAIN）', () => {
  passes({ dist: 'normal', mean: 0, sd: 0.35, clamp: [-1, 1] }, { domain: [-2, 2] });
  fails({ dist: 'normal', mean: 0, sd: 0.35, clamp: [-1, 3] }, { domain: [-2, 2] }, 'E-DIM-SAMPLE-DOMAIN');
});

test('joint：corr 对称、对角为 1、半正定（E-DIM-SAMPLE-CORR）', () => {
  const marginals = { pers_openness: { dist: 'normal', mean: 0, sd: 1 }, pers_diligence: { dist: 'normal', mean: 0, sd: 1 } };
  passes({ dist: 'joint', group: 'personality', marginals, corr: [[1, 0.3], [0.3, 1]] });
  fails({ dist: 'joint', group: 'personality', marginals, corr: [[1, 0.3], [0.4, 1]] }, {}, 'E-DIM-SAMPLE-CORR');
  fails({ dist: 'joint', group: 'personality', marginals, corr: [[2, 0.3], [0.3, 1]] }, {}, 'E-DIM-SAMPLE-CORR');
  fails({ dist: 'joint', group: 'personality', marginals, corr: [[1, 2], [2, 1]] }, {}, 'E-DIM-SAMPLE-CORR');
});

// ---------- sample 纯函数（卷二 §1.10 :328） ----------

function engineWith(dims, seed = 'seed_ab12') {
  const engine = ENGINE();
  engine.tables.set('gadget', { doc: { dimensions: dims } });
  if (seed !== undefined) engine.template.seed = seed;
  return engine;
}

test('sample 纯函数：同输入同输出、不写状态、不读墙钟', () => {
  const dims = {
    height: { type: 'number', unit: 'kg', precision: 2, domain: [0, 10], sample: { dist: 'uniform', min: 0, max: 10 } },
    grade: { type: 'enum', vocab: 'grade', sample: { dist: 'categorical', weights: { grd_a: 1, grd_b: 3 } } },
  };
  const engine = engineWith(dims);
  const before = JSON.stringify(engine);
  const a = sample(engine, 'gadget', 'gad_1', 'height');
  const b = sample(engine, 'gadget', 'gad_1', 'height');
  assert.equal(a, b);
  assert.equal(typeof a, 'number');
  assert.ok(a >= 0 && a <= 10);
  assert.equal(JSON.stringify(engine), before);
  const g1 = sample(engine, 'gadget', 'gad_1', 'grade');
  const g2 = sample(engine, 'gadget', 'gad_1', 'grade');
  assert.equal(g1, g2);
  assert.ok(['grd_a', 'grd_b'].includes(g1));
});

test('sample 的种子来自 engine.template.seed；缺失即 E-DIM-SAMPLE-PARAM', () => {
  const dims = { height: { type: 'number', unit: 'kg', precision: 2, domain: [0, 10], sample: { dist: 'uniform', min: 0, max: 10 } } };
  assert.throws(() => sample(engineWith(dims, null), 'gadget', 'gad_1', 'height'), (e) => e.code === 'E-DIM-SAMPLE-PARAM');
  assert.throws(() => sample(engineWith(dims, 'bad seed'), 'gadget', 'gad_1', 'height'), (e) => e.code === 'E-DIM-SAMPLE-PARAM');
});

test('sample 对无分布维度报 E-DIM-REF-MISSING，不静默当 0', () => {
  const engine = engineWith({ height: { type: 'number', unit: 'kg', precision: 2, domain: [0, 10] } });
  assert.throws(() => sample(engine, 'gadget', 'gad_1', 'height'), (e) => e.code === 'E-DIM-REF-MISSING');
  assert.throws(() => sample(engine, 'gadget', 'gad_1', 'nope'), (e) => e.code === 'E-DIM-REF-MISSING');
});
