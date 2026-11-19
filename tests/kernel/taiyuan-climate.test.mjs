// 块 6 第 6-29 张：太原站 1991–2020 实测打底的天气、气候、季节数据（world/geo/weather-cell.json、词表族 weather 与 season、rules.weather、rules.climateProto）。
// 期望值按 docs/卡回报/ds-b6-29.md「换算方法」的公式，由下列统计字面量手算；字面量取自对 NOAA 原始文件（GHCN-Daily CHM00053772、ISD 537720）的统计
// （F:/dnd-tmp/p629/stats.mjs、round2.mjs），不读仓库当前数据。只跑不推进世界的小检查（天气是纯函数，只读不写状态）。
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { seasonDimension, dailyMeanTemp } from '../../server-plugin/kernel/climate.mjs';
import { weatherAt } from '../../server-plugin/kernel/weather.mjs';
import { checkValue } from '../../server-plugin/kernel/validate/types.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const reports = [];
useReportSink((r) => { reports.push(r); });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units };
const CELL = JSON.parse(readFileSync(join(ROOT, 'world/geo/weather-cell.json'), 'utf8'));
const STATES = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'];
const near = (got, want, tol, msg = '') => assert.ok(Math.abs(got - want) <= tol, `${msg} got ${got}, want ${want} ± ${tol}`);

// 统计字面量（太原 1991–2020；日降水只用缺测 ≤ 10% 的 23 年，有效日 8295；各类日数；次日同状态 [同, 总]；太阳相位十二等分（3 月 20 日起）月均温、月降水均量、月积温）。
const VALID = 8295;
const COUNT = { clear: 5056, cloudy: 1705, fog: 468, rain: 724, snow: 33, storm: 309 };
const STAY = { clear: [3817, 5022], cloudy: [670, 1700], fog: [120, 466], rain: [216, 715], snow: [7, 33], storm: [47, 306] };
const T_BIN = [10.4380, 17.0998, 21.6865, 24.0019, 24.0827, 19.7276, 13.6672, 6.5196, -0.9685, -4.5090, -2.7948, 3.4109];
const P_BIN = [18.5782, 25.0217, 37.4304, 86.2544, 109.8957, 73.4957, 40.5817, 17.9947, 4.0341, 4.4126, 2.9494, 9.0783];
const GDD_BIN = [175.3833, 363.0133, 517.2800, 570.0567, 591.5633, 441.8267, 262.3400, 74.1367, 0.9267, 0, 0.5100, 27.4933];
// 季节曲线点：x = (b+0.5)/12，y = 当月频率 ÷ 年频率（四位小数）。
const PX = [0.0417, 0.125, 0.2083, 0.2917, 0.375, 0.4583, 0.5417, 0.625, 0.7083, 0.7917, 0.875, 0.9583];
const PY = {
  clear: [0.97, 0.9503, 0.8652, 0.714, 0.7369, 0.8569, 0.9481, 1.1158, 1.2209, 1.2792, 1.2789, 1.0605],
  cloudy: [1.3831, 1.3334, 1.4301, 1.3101, 1.2712, 0.9774, 0.779, 0.6169, 0.4879, 0.5429, 0.6309, 1.2339],
  fog: [0.5014, 0.3414, 0.2809, 0.516, 0.5508, 1.055, 1.5996, 1.7878, 2.2413, 1.4453, 1.0471, 0.6422],
  rain: [1.0533, 1.2051, 0.9245, 1.5009, 1.505, 1.8925, 1.7511, 0.9245, 0.2831, 0.082, 0.2641, 0.6476],
  snow: [0.3555, 0, 0, 0, 0, 0, 0, 1.4488, 1.0961, 5.0345, 2.1732, 1.8215],
  storm: [0.0759, 0.5965, 2.2048, 3.634, 3.4125, 1.3982, 0.508, 0.1547, 0, 0, 0, 0],
};
const CTX = { worldSeed: 'seed_one', streamCode: 'weather', cellId: 'plc_cell_one', latitudeDeg: CELL.latitudeDeg, cell: CELL.cell };

test('规则表：weightScale 1000、persistBase 100、anchorDays 360；回归年 365.24219 日；meltCurve、snowCover、phenomena 仍未建', () => {
  assert.equal(W.rules.weather.weightScale, 1000);
  assert.equal(W.rules.weather.persistBase, 100);
  assert.equal(W.rules.weather.anchorDays, 360);
  assert.deepEqual(W.rules.astro.yearDays, { num: 36524219, den: 100000 });
  assert.deepEqual([...W.rules.weather.unbuilt].sort(), ['meltCurve', 'phenomena', 'snowCover']);
});

test('气候原型：太原原型的季节曲线点即"当月频率 ÷ 年频率"字面量；单元引用 cpr_taiyuan', () => {
  assert.equal(CELL.cell.climateProto, 'cpr_taiyuan');
  for (const s of STATES) assert.deepEqual(W.rules.climateProto.cpr_taiyuan.seasonCurve[`wx_${s}`], PX.map((x, b) => [x, PY[s][b]]), s);
});

test('单元没引气候原型、或引的原型没建：当日天气未知并报缺口 weather_climate_proto，不借太原', () => {
  for (const cell of [{ ...CELL.cell, climateProto: undefined }, { ...CELL.cell, climateProto: 'cpr_none' }]) {
    reports.length = 0;
    const w = weatherAt(ENGINE, { ...CTX, cell }, 10);
    assert.equal(w.state.known, false);
    assert.ok(w.state.gaps.includes('weather_climate_proto'));
    assert.ok(reports.some((r) => r.code === 'W-DIM-GAP'));
  }
});

// 经公开入口 weatherAt 逐日推进两个单元各 31 个锚段（各 11160 日，约 30.6 个回归年），数各态日数与次日同状态次数，对照太原实测。
// 容差推导（4 倍标准误 + 偏差上界）：
//   频率：状态示性序列一阶自相关 r = (q − f)/(1 − f)，均值方差 ≈ f(1−f)/N × (1+r)/(1−r)（N = 22320）；
//   次日同态：留存次数是 n_p ≈ N·f 次伯努利，方差 ≈ q(1−q)/n_p，同样乘 (1+r)/(1−r) 计相关；
//   偏差：标定残差 ≤ 1e-3（换算方法 C.4，取整后），加上 11160 日不是整年多出的 0.556 年按季节曲线最大偏离计 f × max|y−1| × 0.556/30.556。
test('标定后的入表数据：经 weatherAt 推进得到的各态频率与次日同状态比例等于太原实测（容差见注）', () => {
  const ids = STATES.map((s) => `wx_${s}`);
  const A = W.rules.weather.anchorDays;
  const DAYS = A * 31;
  const n = Array(6).fill(0), sn = Array(6).fill(0), sd = Array(6).fill(0);
  for (const cellId of ['plc_cell_one', 'plc_cell_two']) {
    let prev = -1;
    for (let d = 0; d < DAYS; d += 1) {
      const w = weatherAt(ENGINE, { ...CTX, cellId }, d);
      assert.equal(w.state.known, true);
      const i = ids.indexOf(w.state.value);
      n[i] += 1;
      if (prev >= 0) { sd[prev] += 1; if (prev === i) sn[prev] += 1; }
      prev = i;
    }
  }
  const N = 2 * DAYS;
  const extra = DAYS / (36524219 / 100000) - Math.floor(DAYS / (36524219 / 100000));
  const years = DAYS / (36524219 / 100000);
  STATES.forEach((s, i) => {
    const f = COUNT[s] / VALID, q = STAY[s][0] / STAY[s][1];
    const r = (q - f) / (1 - f), infl = (1 + r) / (1 - r);
    const bias = 1e-3 + f * Math.max(...PY[s].map((y) => Math.abs(y - 1))) * (extra / years);
    near(n[i] / N, f, 4 * Math.sqrt((f * (1 - f) / N) * infl) + bias, `${s} 频率`);
    near(sn[i] / sd[i], q, 4 * Math.sqrt((q * (1 - q) / (N * f)) * infl) + 1e-3, `${s} 次日同态`);
  });
});

test('季节十二项：warmth、wetness、growth 按"季内三个相位月平均"的公式手算（换算方法 F）', () => {
  const tmin = Math.min(...T_BIN), tmax = Math.max(...T_BIN);
  const pmax = Math.max(...P_BIN), gmax = Math.max(...GDD_BIN);
  const avg = (f, q) => [0, 1, 2].reduce((a, j) => a + f(q * 3 + j), 0) / 3;
  const ids = ['sea_four_spring', 'sea_four_summer', 'sea_four_autumn', 'sea_four_winter'];
  ids.forEach((id, q) => {
    const warmth = avg((i) => (T_BIN[i] - tmin) / (tmax - tmin), q);
    const wetness = avg((i) => P_BIN[i] / pmax, q);
    const growth = avg((i) => GDD_BIN[i] / gmax, q);
    near(seasonDimension(ENGINE, id, 'warmth').value, warmth, 2e-4);
    near(seasonDimension(ENGINE, id, 'wetness').value, wetness, 2e-4);
    near(seasonDimension(ENGINE, id, 'growth').value, growth, 2e-4);
  });
  assert.deepEqual([...W.rules.season.unbuilt], ['schemeRules']);
});

test('单元量：tempAmpC = (最热相位月 − 最冷相位月) ÷ 2；precipSeasonality 全年积分为 1；单元不含地点 id', () => {
  near(CELL.cell.tempAmpC, (Math.max(...T_BIN) - Math.min(...T_BIN)) / 2, 2e-4);
  const sumP = P_BIN.reduce((a, b) => a + b, 0);
  CELL.cell.precipSeasonality.forEach(([x, y], i) => { near(x, (i + 0.5) / 12, 1e-4); near(y, (P_BIN[i] / sumP) * 12, 2e-4); });
  near(CELL.cell.precipSeasonality.reduce((a, [, y]) => a + y / 12, 0), 1, 5e-4);
  assert.ok(!/(loc_|plc_|bld_|prov_|county_)/.test(JSON.stringify(CELL.cell)));
});

test('单元初值当作一个地点行的天气单元维度，按 place 表头校验通过；comp_weather_cell 的 requires 齐（转换输入，6-24 挂接）', () => {
  const dims = W.env.tableDims.get('place');
  const errs = [];
  for (const [key, v] of Object.entries(CELL.cell)) {
    assert.ok(dims[key], `place 表头没有 ${key}`);
    checkValue(dims[key], v, W.env, { table: 'place', row: 'weather-cell.json', dim: key, path: key }, (e) => errs.push(e));
  }
  assert.deepEqual(errs, []);
  for (const need of W.vocab.index.get('comp_weather_cell').entry.requires) assert.ok(Object.hasOwn(CELL.cell, need), need);
  // 反例：频度键不是天气行、年降水为负、盛行风向 360 都被拒。
  const bad = [];
  checkValue(dims.weatherCommonality, { wx_nope: 1 }, W.env, { dim: 'weatherCommonality' }, (e) => bad.push(e.code));
  checkValue(dims.annualPrecipMm, -1, W.env, { dim: 'annualPrecipMm' }, (e) => bad.push(e.code));
  checkValue(dims.prevailingWindDeg, 360, W.env, { dim: 'prevailingWindDeg' }, (e) => bad.push(e.code));
  assert.deepEqual(bad, ['E-DIM-REF-MISSING', 'E-DIM-DOMAIN-RANGE', 'E-DIM-DOMAIN-RANGE']);
});

test('室外日均温有数：太原单元第 90 日 ≈ 11.0361 + 14.2958 × sin(59.2011°) = 23.3158，第 270 日 ≈ 11.0361 + 14.2958 × sin(236.6176°) = −0.9011（相位 (d+0.5)/365.24219 − 1/12，日中点值与解析日均差 < 2e-4）', () => {
  const input = { latitudeDeg: CELL.latitudeDeg, cellElevationM: CELL.cellElevationM, surfaceRefElevationM: CELL.cellElevationM, enclosed: false, underground: false, cell: CELL.cell, weather: { tempOffsetC: 0 } };
  const d90 = dailyMeanTemp(ENGINE, input, 90);
  assert.equal(d90.known, true);
  assert.deepEqual([...d90.gaps], []);
  near(Number(d90.fixed), 233158, 10);
  near(Number(dailyMeanTemp(ENGINE, input, 270).fixed), -9011, 10);
});

test('天气由数据算得出：太原单元 90 日每天都有状态，状态在六种之内，同种子重算同值（另装一份世界、倒序读也同值）；当日量 cloud、tempOffsetC 均已知', () => {
  const W2 = loadWorld(ROOT); // 重新装入本世界的 weightRX 树（别的测试文件的夹具装载是全局的）
  assert.ok(W2.ok, W2.text);
  const E = { vocab: W2.vocab, rules: W2.rules, units: W2.env.units };
  const ids = new Set(STATES.map((s) => `wx_${s}`));
  const first = [];
  for (let d = 0; d < 90; d += 1) {
    const w = weatherAt(E, CTX, d);
    assert.equal(w.state.known, true, `day ${d}`);
    assert.ok(ids.has(w.state.value));
    assert.equal(w.cloud.known, true);
    assert.equal(w.tempOffsetC.known, true);
    first.push(w.state.value);
  }
  // 结果记忆不改结果：另一个单元值对象（同值）倒序读，逐日与顺序读相同。
  const fresh = { ...CTX, cell: JSON.parse(JSON.stringify(CELL.cell)) };
  for (let d = 89; d >= 0; d -= 1) assert.equal(weatherAt(E, fresh, d).state.value, first[d], `day ${d}`);
  assert.ok(new Set(first).size >= 2);
});
