// 卷十 R10-2.12（水体：capacityL、surfaceM2、排水去处、downstream、catchmentM2）、R10-1.7（手写优先）、R10-2.10（downstream 无环）、A10-1.2（确定性、遍历次序无关）：
// 水体阶段 genWater 的行为测试。足迹派生量（areaM2、海拔、相邻）由卷五给，这里按 R10-1.14 的入参形状直接交入一份手造的足迹，数全是手算：
//   t1 面积 20000 海拔 50、t2 10000 海拔 30、t3 10000 海拔 10、t4 10000 海拔 20、水体 w1 面积 10000 海拔 0、水体 w2 面积 5000 海拔 100；
//   相邻：t1-t2、t1-w2、t2-t3、t3-t4、t3-w1。
//   排水去处（相邻、海拔严格更低者中最低，并列取 id 小）：t1→t2、t2→t3、t3→w1、t4→t3、w2→t1、w1 无（邻居 t3 更高）。
//   首先到达的水体：t1、t2、t3、t4 都是 w1，水体自己是自己。
//   w1：downstream 空，catchmentM2 = 20000 + 10000 + 10000 + 10000 + 10000 = 60000，surfaceM2 = 10000。
//   w2：downstream = firstWater(t1) = w1，catchmentM2（若缺）= 5000，surfaceM2 = 5000。
//   capacityL = floor(面积 × 水深 ÷ 0.001)，水深 = drawByKey(种子, gen_water, 水体行 id, 0, site_gen_water_depth, 命中规则行的 depthM)（卷十 §4.12.1 :861）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { drawByKey } from '../../server-plugin/kernel/sample.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { genWater } from '../../server-plugin/kernel/gen/water.mjs';
import { ROOT } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.equal(loadWorld(ROOT).ok, true); // 装入内核常数与分位数表

const SEED = 'seed_one';
const TRACT = 'comp_tract';
const WATER = 'comp_waterbody';
const RULES = [
  { priority: 1, waterKind: 'water_river', depthM: { dist: 'uniform', min: 1, max: 3 } },
  { priority: 2, waterKind: 'water_river', depthM: { dist: 'uniform', min: 10, max: 12 } },
];
const wet = (extra = {}) => ({ parent: 'loc_root', classes: [TRACT, WATER], waterKind: 'water_river', liquid: 'mat_water', ...extra });
const dry = () => ({ parent: 'loc_root', classes: [TRACT] });
const EFFECTIVE = () => new Map([
  ['loc_root', { parent: null, classes: [] }],
  ['loc_t1', dry()], ['loc_t2', dry()], ['loc_t3', dry()], ['loc_t4', dry()],
  ['loc_w1', wet()], ['loc_w2', wet({ catchmentM2: 7777 })],
]);
const FP = {
  footprints: {
    loc_t1: { areaM2: 20000, elevationM: 50 }, loc_t2: { areaM2: 10000, elevationM: 30 }, loc_t3: { areaM2: 10000, elevationM: 10 }, loc_t4: { areaM2: 10000, elevationM: 20 },
    loc_w1: { areaM2: 10000, elevationM: 0 }, loc_w2: { areaM2: 5000, elevationM: 100 },
  },
  adjacency: { loc_t1: ['loc_t2', 'loc_w2'], loc_t2: ['loc_t1', 'loc_t3'], loc_t3: ['loc_t2', 'loc_t4', 'loc_w1'], loc_t4: ['loc_t3'], loc_w1: ['loc_t3'], loc_w2: ['loc_t1'] },
};
const run = (over = {}) => genWater({
  table: 'place', stage: 'gstage_water', worldSeed: SEED, genesisMinute: 0, vocab: {}, rows: buildGenRows(over.effective || EFFECTIVE(), { index: new Map() }),
  waterRows: RULES, roleTract: TRACT, roleWaterbody: WATER, m3PerL: 0.001, footprints: FP, ...over,
});
const depth4 = (id, dist) => Math.round(drawByKey(SEED, 'gen_water', id, 0, 'site_gen_water_depth', dist) * 10000);
// 面积 × 水深 ÷ 0.001 升：水深 = d4 ÷ 10000，所以 面积 × d4 ÷ 10（向零截断）。
const litres = (area, d4) => Math.floor((area * d4) / 10);

test('R10-2.12：surfaceM2 = 足迹面积、capacityL = 面积 × 水深（命中优先级最大的规则行）÷ 升换立方米、排水去处与 downstream、catchmentM2 沿排水去处首先到达本水体的存量单元面积之和（手算 w1、w2）', () => {
  const { proposals, deferred } = run();
  assert.deepEqual(deferred, []);
  const byId = Object.fromEntries(proposals.map((p) => [p.id, p]));
  const d1 = depth4('loc_w1', RULES[1].depthM);
  const d2 = depth4('loc_w2', RULES[1].depthM);
  assert.ok(d1 >= 100000 && d1 <= 120000 && d2 >= 100000 && d2 <= 120000, '取的是优先级 2 的规则行（水深 10–12 m）');
  assert.deepEqual(byId.loc_w1.dims, { surfaceM2: 10000, capacityL: litres(10000, d1), downstream: null, catchmentM2: 60000 });
  // w2 的 catchmentM2 作者已写 7777：不补、不改；downstream 缺，补为 loc_w1。
  assert.deepEqual(byId.loc_w2.dims, { surfaceM2: 5000, capacityL: litres(5000, d2), downstream: 'loc_w1' });
  assert.equal(byId.loc_w1.by, 'gstage_water');
  assert.match(byId.loc_w1.seedKey, /^[0-9a-f]{64}$/);
});

test('R10-1.7：作者已写的水体字段一律不补；四个全写了的水体行既无提案也无缺口', () => {
  const eff = EFFECTIVE();
  eff.set('loc_w1', wet({ capacityL: 5, surfaceM2: 6, catchmentM2: 7, downstream: null }));
  const { proposals, deferred } = run({ effective: eff });
  assert.deepEqual(proposals.map((p) => p.id), ['loc_w2']);
  assert.deepEqual(deferred, []);
  // 作者给了 downstream（指向 w1 以外的行）时照原值，不被排水去处推出的下游取代。
  const eff2 = EFFECTIVE();
  eff2.set('loc_w2', wet({ downstream: 'loc_w2x' }));
  eff2.set('loc_w2x', wet({ capacityL: 1, surfaceM2: 1, catchmentM2: 1, downstream: null }));
  const r = run({ effective: eff2, footprints: { footprints: { ...FP.footprints, loc_w2x: { areaM2: 1, elevationM: 1 } }, adjacency: FP.adjacency } });
  assert.equal(r.proposals.find((p) => p.id === 'loc_w2').dims.downstream, undefined);
});

test('缺口不编：足迹未知、面积未知、规则行缺、水体类缺、液体缺的水体行不出提案，进 deferred 并带原因代号与缺的字段', () => {
  const a = run({ footprints: null });
  assert.deepEqual(a.proposals, []);
  assert.deepEqual(a.deferred.map((d) => [d.id, d.reason]), [['loc_w1', 'footprint_unknown'], ['loc_w2', 'footprint_unknown']]);
  assert.deepEqual(a.deferred[0].gaps, ['capacityL', 'surfaceM2', 'catchmentM2', 'downstream']);
  const b = run({ footprints: { footprints: { ...FP.footprints, loc_w1: { areaM2: null, elevationM: 0 } }, adjacency: FP.adjacency } });
  assert.deepEqual(b.deferred.map((d) => [d.id, d.reason]), [['loc_w1', 'footprint_unknown']]);
  assert.deepEqual(b.proposals.map((p) => p.id), ['loc_w2']);
  const noRule = run({ waterRows: [{ priority: 1, waterKind: 'water_other', depthM: { dist: 'uniform', min: 1, max: 2 } }] });
  assert.deepEqual(noRule.deferred.map((d) => d.reason), ['water_rule_missing', 'water_rule_missing']);
  const eff = EFFECTIVE();
  eff.set('loc_w1', wet({ liquid: undefined }));
  eff.set('loc_w2', wet({ waterKind: undefined, catchmentM2: 1 }));
  const c = run({ effective: eff });
  assert.deepEqual(c.deferred.map((d) => [d.id, d.reason]), [['loc_w1', 'liquid_missing'], ['loc_w2', 'water_kind_missing']]);
});

test('排水：海拔未知的存量单元不当排水去处也不参与；并列取 id 最小（两个同高下邻水体取 id 小者作 downstream）', () => {
  // w3（海拔 40）相邻 ta、tb 两个同为 10 m 的水体：排水去处取 id 小者 loc_ta，downstream = firstWater(loc_ta) = loc_ta。
  const eff = EFFECTIVE();
  eff.set('loc_w3', wet());
  eff.set('loc_ta', wet({ capacityL: 1, surfaceM2: 1, catchmentM2: 1, downstream: null }));
  eff.set('loc_tb', wet({ capacityL: 1, surfaceM2: 1, catchmentM2: 1, downstream: null }));
  const fp = {
    footprints: { ...FP.footprints, loc_w3: { areaM2: 100, elevationM: 40 }, loc_ta: { areaM2: 1, elevationM: 10 }, loc_tb: { areaM2: 1, elevationM: 10 } },
    adjacency: { ...FP.adjacency, loc_w3: ['loc_tb', 'loc_ta'] },
  };
  const r = run({ effective: eff, footprints: fp });
  assert.equal(r.proposals.find((p) => p.id === 'loc_w3').dims.downstream, 'loc_ta');
  // 海拔未知的邻居不当去处：把 loc_ta、loc_tb 的海拔置未知，w3 没有排水去处，downstream 空。
  const fp2 = { footprints: { ...fp.footprints, loc_ta: { areaM2: 1, elevationM: null }, loc_tb: { areaM2: 1, elevationM: null } }, adjacency: fp.adjacency };
  assert.equal(run({ effective: eff, footprints: fp2 }).proposals.find((p) => p.id === 'loc_w3').dims.downstream, null);
});

test('A10-1.2：同输入两次逐字节相同；行的遍历次序与相邻表次序打乱仍相同', () => {
  const a = JSON.stringify(run());
  assert.equal(a, JSON.stringify(run()));
  const eff = new Map([...EFFECTIVE()].reverse());
  const fp = { footprints: FP.footprints, adjacency: Object.fromEntries(Object.entries(FP.adjacency).reverse().map(([k, v]) => [k, [...v].reverse()])) };
  assert.equal(a, JSON.stringify(run({ effective: eff, footprints: fp })));
});

test('R10-2.10：作者写的与补的 downstream 合起来成环即 E-GEN-SKELETON；容量不足 1 L 是 E-GEN-ROW-INVALID（不钳成 1）', () => {
  const eff = EFFECTIVE();
  eff.set('loc_w1', wet({ capacityL: 1, surfaceM2: 1, catchmentM2: 1, downstream: 'loc_w2' }));
  eff.set('loc_w2', wet({ capacityL: 1, surfaceM2: 1, catchmentM2: 1, downstream: 'loc_w1' }));
  assert.throws(() => run({ effective: eff }), (e) => e.code === 'E-GEN-SKELETON');
  const tiny = { footprints: { ...FP.footprints, loc_w1: { areaM2: 0.00001, elevationM: 0 } }, adjacency: FP.adjacency };
  assert.throws(() => run({ footprints: tiny, waterRows: [{ priority: 1, waterKind: 'water_river', depthM: { dist: 'uniform', min: 1, max: 2 } }] }), (e) => e.code === 'E-GEN-ROW-INVALID');
});

test('大水体的容量不溢出定点安全上限（G5b：1,000 平方千米的河）：手算 面积 1e9 m² × 水深 4 m = 4e9 m³ ÷ 0.001 = 4e12 L；整升数装不进安全整数（面积 5e11 m² × 水深 40 m ÷ 0.001 = 2e16 L > 2^53）即 E-GEN-ROW-INVALID，不是 E-DET-OVERFLOW', () => {
  const rowAt = (depthM) => [{ priority: 1, waterKind: 'water_river', depthM: { dist: 'triangular', min: depthM, mode: depthM, max: depthM } }];
  const withArea = (areaM2, depthM) => ({ footprints: { footprints: { ...FP.footprints, loc_w1: { areaM2, elevationM: 0 } }, adjacency: FP.adjacency }, waterRows: rowAt(depthM) });
  const big = run(withArea(1e9, 4)).proposals.find((p) => p.id === 'loc_w1');
  assert.equal(big.dims.capacityL, 4e12);
  assert.throws(() => run(withArea(5e11, 40)), (e) => e.code === 'E-GEN-ROW-INVALID');
});

test('海不借河的水深：水体类（water_sea）没有规则行，进 deferred（water_rule_missing），不出提案', () => {
  const eff = EFFECTIVE();
  eff.set('loc_w1', wet({ waterKind: 'water_sea' }));
  const r = run({ effective: eff });
  assert.deepEqual(r.deferred.filter((d) => d.id === 'loc_w1').map((d) => d.reason), ['water_rule_missing']);
  assert.equal(r.proposals.some((p) => p.id === 'loc_w1'), false);
});
