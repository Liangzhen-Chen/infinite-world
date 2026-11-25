// 块 6 第 6-4 张《物种与身体图表》：物种表表头与 speciesView（卷四 §2.1 :121–:188、§3.1 :408、§4.1 :457–:511），
// 物种行跨字段校验（§2.1 校验栏、§2.7 E-SPECIES-ATTR-KEYS），A11 继承夹具在真实物种表头上（卷二 A11 :2402；块 5 遗留 9 物种部分）。
// 测试先写；期望值按卷文手算成字面量，前提在测试里造（tests/kernel/body-world.mjs），不读仓库当前计数。只跑不推进世界的小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseFixture, loadBodyWorld, engineOf, speciesRow, ROOT, TEST_ATTR_DIST } from './body-world.mjs';

const W = loadBodyWorld(baseFixture());
assert.ok(W.ok, JSON.stringify(W.errors));
const { speciesView } = await import('../../server-plugin/species.mjs');
const loadErr = (edit) => { const f = baseFixture(); edit(f); return loadBodyWorld(f); };
const has = (r, code, row) => r.errors.some(([c, , rw]) => c === code && (row === undefined || rw === row));

test('真实物种表头：idPrefix 取物种前缀 species_，behaviors 照卷四 :188 声明 grow, age, breed, metabolize, move, carry, die', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/species.json'), 'utf8'));
  assert.deepEqual(doc.entity.idPrefix, ['species_']);
  assert.deepEqual([...doc.behaviors].sort(), ['age', 'breed', 'carry', 'die', 'grow', 'metabolize', 'move']);
  assert.equal(doc.dimensions.bodyPlan.kind, 'body_plan');
});

test('speciesView 只把登记在案的未建派生按未知交出：没登记的派生求值出 E-MOD-RX（除零）照抛', () => {
  const r = loadErr((f) => {
    f.species.species_test_a.carryMult = 0;
    f.editSpeciesDoc = (doc) => { doc.dimensions.testSpeedPerCarry = { type: 'number', unit: 'dimensionless', domain: [0, null], precision: 4, derived: 'speedBase / carryMult', required: 'never', onUnknown: 'gap', modifiable: false, source: 'test', owner: 'test' }; };
  });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.throws(() => speciesView(engineOf(r.world), {}, 'species_test_a'), (e) => e.code === 'E-MOD-RX');
  // 同一张表里登记在案的未建派生（meanMassKg）照旧按未知交出：用另一行（carryMult 非 0）读。
  assert.equal(speciesView(engineOf(r.world), {}, 'species_test_b').dims.meanMassKg.known, false);
});

test('speciesView：dims 给出表头每个维度的基值 Fact；写了的值原样、未建派生按未知带码（不以常数代替）', () => {
  const e = engineOf(W.world);
  const v = speciesView(e, {}, 'species_test_a');
  const header = Object.keys(W.world.tables.get('species').doc.dimensions).sort();
  assert.deepEqual(Object.keys(v.dims).sort(), header);
  assert.deepEqual([v.dims.speedBase.known, v.dims.speedBase.value, v.dims.speedBase.unit], [true, 80, 'm_per_minute']);
  assert.equal(v.dims.bodyPlan.value, 'body_test_humanoid');
  assert.deepEqual(v.dims.meanMassKg, { known: false, applicable: true, reason: 'E-MOD-RX' });
  assert.equal(v.dims.bodyVolumeL.known, false); // meanMassKg ÷ bodyDensity，两个都未建即未知
  assert.equal(v.meanMassKg.known, false);
  assert.equal(v.meanDailyFoodNeed.known, false);
  // 不适用（byClass 条件不满足）照卷二 §1.6 交 applicable:false。
  assert.deepEqual(v.dims.shiftVariant, { known: false, applicable: false });
  // 类型引用未建词表族（biome、sense）的必填维度：行上没写，加载放行，运行期按未知。
  assert.deepEqual([v.dims.habitats.known, v.dims.habitats.applicable], [false, true]);
  assert.equal(v.dims.senses.known, false);
});

test('capabilityBaseline（S-4）= 物种身体图各部位对每个能力的贡献之和：夹具人形呼吸、意识、操作、移动四项为 1，其余能力为 0；无定形体无呼吸为 0', () => {
  const e = engineOf(W.world);
  const zero = { bloodPumping: 0, digestion: 0, flying: 0, hearing: 0, sight: 0, smell: 0, speech: 0, touch: 0 };
  assert.deepEqual(speciesView(e, {}, 'species_test_a').capabilityBaseline, { ...zero, breathing: 1, consciousness: 1, manipulation: 1, moving: 1 });
  assert.deepEqual(speciesView(e, {}, 'species_test_b').capabilityBaseline, { ...zero, breathing: 0, consciousness: 1, manipulation: 1, moving: 1 });
});

test('attributesBase 键集 ≠ attr 族全部条目即 E-SPECIES-ATTR-KEYS（写 null 的键不算在内）', () => {
  const attrKeys = [...Object.keys(JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8')).families.attr.entries), ...Object.keys(baseFixture().vocab.attr)];
  const full = (except, value) => Object.fromEntries(attrKeys.map((k) => [k, k === except ? value : { ...TEST_ATTR_DIST }]));
  assert.ok(has(loadErr((f) => { f.species.species_test_a.attributesBase = full('attr_test', null); }), 'E-SPECIES-ATTR-KEYS', 'species_test_a'));
  // 物种行少写一个 attr 键：映射缺键先由映射键集规则拒（卷二 §1.6 第 4 项），加载照样失败。
  assert.ok(has(loadErr((f) => { const m = full(); delete m.attr_test; f.species.species_test_a.attributesBase = m; }), 'E-DIM-MAP-SPARSE-NONSUM', 'species_test_a'));
  assert.equal(has(loadBodyWorld(baseFixture()), 'E-SPECIES-ATTR-KEYS'), false);
});

test('gaits 全为 null 而 speedBase > 0 即 E-DIM-DOMAIN-RANGE；speedBase = 0 时全 null 合法', () => {
  assert.ok(has(loadErr((f) => { f.species.species_test_a.gaits = { gait_test: null }; }), 'E-DIM-DOMAIN-RANGE', 'species_test_a'));
  const still = loadErr((f) => { Object.assign(f.species.species_test_a, { gaits: { gait_test: null }, speedBase: 0 }); });
  assert.equal(has(still, 'E-DIM-DOMAIN-RANGE', 'species_test_a'), false, JSON.stringify(still.errors));
});

test('maturityYears 取值域 (0, 10000]：0 即 E-DIM-DOMAIN-RANGE，正数通过', () => {
  assert.ok(has(loadErr((f) => { f.species.species_test_a.maturityYears = 0; }), 'E-DIM-DOMAIN-RANGE', 'species_test_a'));
  assert.equal(has(loadBodyWorld(baseFixture()), 'E-DIM-DOMAIN-RANGE'), false);
});

test('sexes 权重和为 0 即 E-DIM-DOMAIN-RANGE（和 > 0）', () => {
  assert.ok(has(loadErr((f) => { f.species.species_test_a.sexes = { sex_test: 0 }; }), 'E-DIM-DOMAIN-RANGE', 'species_test_a'));
});

test('dietShares：有份额的键须 = diet、和 = 1，不合即 E-DIM-DOMAIN-RANGE', () => {
  const diet = Object.keys(JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8')).families.diet.entries).sort();
  const shares = (map) => Object.fromEntries(diet.map((k) => [k, Object.hasOwn(map, k) ? map[k] : null]));
  const one = diet[0];
  assert.ok(has(loadErr((f) => { Object.assign(f.species.species_test_a, { diet: [one], dietShares: shares({ [one]: 0.5 }) }); }), 'E-DIM-DOMAIN-RANGE', 'species_test_a'));
  const ok = loadErr((f) => { Object.assign(f.species.species_test_a, { diet: [one], dietShares: shares({ [one]: 1 }) }); });
  assert.equal(has(ok, 'E-DIM-DOMAIN-RANGE', 'species_test_a'), false, JSON.stringify(ok.errors));
});

test('A11 继承夹具（真实物种表头）：实体行 extends 抽象类别行，`*` 乘基值、未写维度取类别行值', () => {
  const f = baseFixture();
  f.speciesClasses = { class_test_beast: { abstract: true, speedBase: 80, temperament: -0.5, basis: 'test' } };
  f.species.species_test_c = { ...speciesRow('body_test_humanoid'), extends: 'class_test_beast', 'speedBase*': 2 };
  delete f.species.species_test_c.speedBase;
  delete f.species.species_test_c.temperament;
  const r = loadBodyWorld(f);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const v = speciesView(engineOf(r.world), {}, 'species_test_c');
  assert.equal(v.dims.speedBase.value, 160); // 80 × 2
  assert.equal(v.dims.temperament.value, -0.5); // 未写，取类别行
});

test('A11：同一维度同时写整值与 `*` 即 E-DIM-EXTEND-CONFLICT；实体行 extends 不存在的类别行即加载失败', () => {
  const f = baseFixture();
  f.speciesClasses = { class_test_beast: { abstract: true, speedBase: 80, basis: 'test' } };
  f.species.species_test_c = { ...speciesRow('body_test_humanoid'), extends: 'class_test_beast', 'speedBase*': 2 };
  assert.ok(has(loadBodyWorld(f), 'E-DIM-EXTEND-CONFLICT'));
  const g = baseFixture();
  g.species.species_test_c = { ...speciesRow('body_test_humanoid'), extends: 'class_test_beast' };
  assert.equal(loadBodyWorld(g).ok, false);
});
