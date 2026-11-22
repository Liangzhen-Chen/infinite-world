// G14 声明与数据：场族 field 与规则表 fields/light/sound/env 的加载期校验（对照表 #45、#52 的白名单；卷二十 §2.8、§2.9）。
// 逐项反例用合成视图直接调校验器；末尾一例读真实世界数据，确认登记的行自己过校验。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFieldTables } from '../../server-plugin/kernel/validate/field-tables.mjs';

const ROOT = new URL('../../', import.meta.url);
const SENSE = { sense_a: {}, sense_b: {} };
const OK_ENTRY = { decayPerStep: 0.25, spread: { ratePerStep: 0.1, whenRX: null }, quenchPerMm: 1, byproducts: {}, combustionFed: false, channel: null, advectedByWind: false, tiers: [] };
const ENV = { canopyCurve: [[0, 1], [1, 0.3]], channelLaw: { sense_a: 'light', sense_b: 'field' }, allowedTargets: [{ namespace: 'env', forecast: true }, { namespace: 'stock.lossPerDay', forecast: false }] };
const view = (entries = { field_x: OK_ENTRY }, rules = {}) => ({
  vocab: { families: new Map([['field', { entries }], ['sense', { entries: SENSE }]]) },
  rules: { env: ENV, ...rules },
});
const codes = (v) => checkFieldTables(v).map((e) => `${e.code}:${e.dim}`);

test('#45 合法数据零错误', () => {
  assert.deepEqual(checkFieldTables(view(undefined, { fields: { stepMinutes: 10, windBias: 0.25, oneShotMaxCells: 5, oneShotReachCurve: [[0, 1], [5, 0.5], [30, 0]] }, light: { zoneSpread: 1, pointSourceCap: 1 }, sound: { refDistanceM: 1, detourDbPerM: 0.1 } })), []);
});

test('#45 decayPerStep ∈ [0,1]：-0.1、1.5、缺都拒；0 与 1 边界收', () => {
  for (const bad of [-0.1, 1.5]) assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, decayPerStep: bad } })), ['E-DIM-DOMAIN-RANGE:decayPerStep']);
  const { decayPerStep, ...rest } = OK_ENTRY;
  assert.deepEqual(codes(view({ field_x: rest })), ['E-DIM-REQUIRED-MISSING:decayPerStep']);
  for (const edge of [0, 1]) assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, decayPerStep: edge } })), []);
});

test('#45 advectedByWind、tiers 必填（onUnknown error）：缺即拒；combustionFed 为真多于一行现拒', () => {
  const { advectedByWind, ...noWind } = OK_ENTRY;
  assert.deepEqual(codes(view({ field_x: noWind })), ['E-DIM-REQUIRED-MISSING:advectedByWind']);
  const { tiers, ...noTiers } = OK_ENTRY;
  assert.deepEqual(codes(view({ field_x: noTiers })), ['E-DIM-REQUIRED-MISSING:tiers']);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: null } })), ['E-DIM-REQUIRED-MISSING:tiers']);
  const fed = { ...OK_ENTRY, combustionFed: true };
  assert.deepEqual(codes(view({ field_x: fed })), []);
  assert.deepEqual(codes(view({ field_x: fed, field_y: fed })), ['E-DIM-REQUIRED-MISSING:combustionFed']);
});

test('#45 tiers.minIntensity 严格递增（E-FIELD-TIER）：相等与递减都拒', () => {
  const tiers = (...xs) => xs.map((m) => ({ minIntensity: m, modifiers: [], effects: [] }));
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tiers(1, 2, 3) } })), []);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tiers(1, 1) } })), ['E-FIELD-TIER:tiers']);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tiers(3, 2) } })), ['E-FIELD-TIER:tiers']);
});

test('#52 分档修正项与效果的 target 只许在 rules.env.allowedTargets（E-ENV-TARGET）；卷六价格命名空间不在白名单即拒', () => {
  const tier = (target) => [{ minIntensity: 1, modifiers: [{ target }], effects: [] }];
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tier('stock.lossPerDay') } })), []);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tier('env.tempC') } })), []);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tier('price.mult') } })), ['E-ENV-TARGET:tiers']);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: tier('envelope') } })), ['E-ENV-TARGET:tiers'], '前缀必须整段匹配：envelope 不是 env 的子键');
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, tiers: [{ minIntensity: 1, modifiers: [{}], effects: [] }] } })), ['E-ENV-TARGET:tiers'], '缺 target 也拒，不放行');
});

test('#45 combustionFed 为真不得填 heatWPerScore；channel 须是 sense 族条目；byproducts 引用闭合、无环', () => {
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, combustionFed: true, heatWPerScore: 5 } })), ['E-DIM-STRUCT-FIELD:heatWPerScore']);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, combustionFed: true, heatWPerScore: null } })), []);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, channel: 'sense_zz' } })), ['E-DIM-REF-MISSING:channel']);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, channel: 'sense_a' } })), []);
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, byproducts: { field_nope: 0.1 } } })), ['E-DIM-REF-MISSING:byproducts']);
  const loop = { field_x: { ...OK_ENTRY, byproducts: { field_y: 0.1 } }, field_y: { ...OK_ENTRY, byproducts: { field_x: 0.1 } } };
  assert.ok(codes(view(loop)).includes('E-DIM-STRUCT-FIELD:byproducts'));
  assert.deepEqual(codes(view({ field_x: { ...OK_ENTRY, byproducts: { field_x: 0.1 } } })), ['E-DIM-STRUCT-FIELD:byproducts'], '自环也是环');
});

test('#45 rules.fields：stepMinutes ≥ 1、windBias ∈ (0,1]、oneShotMaxCells ≥ 1、曲线末点 y 为 0 且不增', () => {
  const f = (o) => codes(view(undefined, { fields: o }));
  assert.deepEqual(f({ stepMinutes: 0 }), ['E-DIM-DOMAIN-RANGE:stepMinutes']);
  assert.deepEqual(f({ stepMinutes: 1 }), []);
  assert.deepEqual(f({ windBias: 0 }), ['E-DIM-DOMAIN-RANGE:windBias']);
  assert.deepEqual(f({ windBias: 1.0001 }), ['E-DIM-DOMAIN-RANGE:windBias']);
  assert.deepEqual(f({ windBias: 1 }), []);
  assert.deepEqual(f({ oneShotMaxCells: 0 }), ['E-DIM-DOMAIN-RANGE:oneShotMaxCells']);
  assert.deepEqual(f({ oneShotReachCurve: [[0, 1], [30, 0.1]] }), ['E-DIM-DOMAIN-RANGE:oneShotReachCurve']);
  assert.deepEqual(f({ oneShotReachCurve: [[0, 0.5], [5, 1], [30, 0]] }), ['E-DIM-DOMAIN-RANGE:oneShotReachCurve']);
  assert.deepEqual(f({ oneShotReachCurve: [] }), ['E-DIM-STRUCT-FIELD:oneShotReachCurve']);
});

test('#45 light.zoneSpread、sound.refDistanceM、sound.detourDbPerM 下限大于 0；pointSourceCap ≥ 1', () => {
  assert.deepEqual(codes(view(undefined, { light: { zoneSpread: 0 } })), ['E-DIM-DOMAIN-RANGE:zoneSpread']);
  assert.deepEqual(codes(view(undefined, { light: { pointSourceCap: 0 } })), ['E-DIM-DOMAIN-RANGE:pointSourceCap']);
  assert.deepEqual(codes(view(undefined, { sound: { refDistanceM: 0 } })), ['E-DIM-DOMAIN-RANGE:refDistanceM']);
  assert.deepEqual(codes(view(undefined, { sound: { detourDbPerM: -1 } })), ['E-DIM-DOMAIN-RANGE:detourDbPerM']);
  assert.deepEqual(codes(view(undefined, { sound: { refDistanceM: 0.0001, detourDbPerM: 0.0001 } })), []);
});

test('#45 env.canopyCurve：x 为 0 时 y 为 1 且不增；缺 x = 0 的点也拒', () => {
  const run = (curve) => checkFieldTables({ ...view(), rules: { env: { ...ENV, canopyCurve: curve } } }).map((e) => `${e.code}:${e.dim}`);
  assert.deepEqual(run([[0, 1], [1, 0.3]]), []);
  assert.deepEqual(run([[0, 0.9], [1, 0.3]]), ['E-DIM-DOMAIN-RANGE:canopyCurve']);
  assert.deepEqual(run([[0.1, 1], [1, 0.3]]), ['E-DIM-DOMAIN-RANGE:canopyCurve']);
  assert.deepEqual(run([[0, 1], [0.5, 0.2], [1, 0.4]]), ['E-DIM-DOMAIN-RANGE:canopyCurve']);
});

test('#45 env.channelLaw 键全覆盖 sense 族、值属 light/sound/field（E-PROP-LAW）；加一个通道不补键即拒', () => {
  const run = (law) => checkFieldTables({ ...view(), rules: { env: { ...ENV, channelLaw: law } } }).map((e) => `${e.code}:${e.dim}`);
  assert.deepEqual(run({ sense_a: 'light', sense_b: 'sound' }), []);
  assert.deepEqual(run({ sense_a: 'light' }), ['E-PROP-LAW:channelLaw']);
  assert.deepEqual(run({ sense_a: 'light', sense_b: 'heat' }), ['E-PROP-LAW:channelLaw']);
  assert.deepEqual(run(null), ['E-PROP-LAW:channelLaw']);
});

test('#45 表里键登在 unbuilt（无值）时 channelLaw 等不核；写了值才核', () => {
  assert.deepEqual(checkFieldTables({ ...view(), rules: { env: { unbuilt: ['allowedTargets', 'canopyCurve', 'channelLaw'] } } }), []);
});

test('真实世界数据过校验：登记的三个场行（光 field_fire、声 field_din、气味 field_odor）与四张规则表（键均登 unbuilt、由后三张卡接读者）', () => {
  const vocab = JSON.parse(readFileSync(new URL('world/ontology/dimensions/_vocab.json', ROOT), 'utf8')).families;
  const tbl = (f) => Object.fromEntries(JSON.parse(readFileSync(new URL(`world/rules/tables/${f}.json`, ROOT), 'utf8')).rows.map((r) => [r.key, r.value]));
  const real = { vocab: { families: new Map([['field', vocab.field], ['sense', vocab.sense]]) }, rules: { fields: tbl('fields'), light: tbl('light'), sound: tbl('sound'), env: tbl('env') } };
  assert.deepEqual(checkFieldTables(real), []);
  assert.deepEqual(Object.keys(vocab.field.entries).sort(), ['field_din', 'field_fire', 'field_odor']);
  for (const t of ['fields', 'light', 'sound', 'env']) assert.deepEqual(Object.keys(real.rules[t]), ['unbuilt'], `${t} 现只有 unbuilt 行`);
});
