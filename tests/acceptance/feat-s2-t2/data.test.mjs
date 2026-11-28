// S2-T2 黑盒验收：分布来自数据（卷二十:641 权重 = 常见度 × 季节曲线；:637 递推）与当日量（卷二十:642、:287、:285）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t2。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t2/出题.md。数据改动只在临时副本里做（不造新单元，只改真实单元的真实行的值）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const LONG = 720; // 两个锚段；每日天气的计算要从段首递推，天数越多越慢（见出题.md 说明）。

test('3①. 权重来自常见度：把真实单元里常见度最高的行改为 0（副本），720 日内该状态出现 0 次；不改时它确会出现（前提）', async () => {
  const cell = S.weatherCell();
  const target = S.topCommonalityRow(cell);
  const days = Array.from({ length: LONG }, (_, i) => i);
  const base = await S.openDefault();
  assert.ok(S.stateSeries(base, cell, days).includes(target), '前提：不改数据时该状态应在 720 日内出现过');
  const fx = await S.openFixture((f) => S.editWorldJson(f, S.PLACE_DIM_PATH, (doc) => {
    doc.rows[cell].weatherCommonality[target] = 0;
  }));
  const seq = S.stateSeries(fx, cell, days);
  assert.equal(seq.filter((s) => s === target).length, 0, `常见度为 0 的行 ${target} 不应出现`);
});

test('3②. 只留一行非零：副本里其余行常见度全为 0，720 日每日都是该行', async () => {
  const cell = S.weatherCell();
  const keep = S.topCommonalityRow(cell);
  const days = Array.from({ length: LONG }, (_, i) => i);
  const fx = await S.openFixture((f) => S.editWorldJson(f, S.PLACE_DIM_PATH, (doc) => {
    const cm = doc.rows[cell].weatherCommonality;
    for (const k of Object.keys(cm)) cm[k] = k === keep ? cm[k] : 0;
  }));
  const seq = S.stateSeries(fx, cell, days);
  assert.ok(seq.every((s) => s === keep), `720 日应都是 ${keep}，实得 ${[...new Set(seq)].join(',')}`);
});

test('3③. 季节曲线为 0 的段不出现：不改数据，凡曲线在某相位段连续为 0 的行，当日起始相位落在该段内的日子不出现该行（卷二十:641 权重含季节曲线）', async () => {
  const cell = S.weatherCell();
  const proto = S.PLACE_ROWS[cell].climateProto;
  assert.ok(proto, '前提：单元应挂气候原型');
  const curve = S.CLIMATE_PROTO.find((r) => r.key === proto)?.value?.seasonCurve;
  assert.ok(curve, `前提：气候原型 ${proto} 应有季节曲线`);
  // 从曲线读出每行的零值区间：连续多个值为 0 的点，取 [首点相位, 末点相位)。不写代号。
  const zeroRanges = []; // {code, from, to}
  for (const [code, pts] of Object.entries(curve)) {
    let i = 0;
    while (i < pts.length) {
      if (pts[i][1] === 0) {
        let j = i;
        while (j + 1 < pts.length && pts[j + 1][1] === 0) j += 1;
        if (j > i) zeroRanges.push({ code, from: pts[i][0], to: pts[j][0] });
        i = j + 1;
      } else i += 1;
    }
  }
  assert.ok(zeroRanges.length > 0, '前提：曲线里应有连续为 0 的相位段');
  const days = Array.from({ length: 400 }, (_, i) => i);
  const H = await S.openDefault();
  const states = S.stateSeries(H, cell, days);
  for (const { code, from, to } of zeroRanges) {
    const inZero = days.filter((d) => {
      const p = S.phaseAt(d * S.MINUTES_PER_DAY);
      return p >= from && p < to;
    });
    assert.ok(inZero.length > 0, `前提：${code} 的零值段 [${from}, ${to}) 内应有日子`);
    for (const d of inZero) {
      assert.notEqual(states[d], code, `第 ${d} 日起始相位落在 ${code} 的零值段内，不应出现 ${code}`);
    }
  }
});

test('4. 当日量：有降水分布的行，降水量在该行 clamp 内；无降水分布的行降水为 null 且有缺口（Q2 甲，不给 0）；风速在 clamp 内；风向 ∈ [0,360) 且与盛行风角差 ≤ 该行偏角幅度；云量、湿度等于行字段', async () => {
  const cell = S.weatherCell();
  const pw = S.PLACE_ROWS[cell].prevailingWindDeg;
  assert.equal(typeof pw, 'number', '前提：单元应有盛行风向');
  const H = await S.openDefault();
  let precipSeen = 0;
  let nullPrecipSeen = 0;
  for (let d = 0; d < 360; d += 1) {
    const f = S.wxAt(H, cell, d);
    assert.equal(f.known, true, `第 ${d} 日天气应已知`);
    const v = f.value;
    const row = S.WX_ENTRIES[v.state];
    assert.ok(row, `第 ${d} 日状态 ${v.state} 应为词表 weather 行`);
    assert.equal(v.cloud, row.cloud, `第 ${d} 日云量应等于行字段`);
    assert.equal(v.humidity, row.humidity, `第 ${d} 日湿度应等于行字段`);
    if (row.precipMm) {
      precipSeen += 1;
      const [lo, hi] = row.precipMm.clamp;
      assert.ok(typeof v.precipMm === 'number' && v.precipMm >= lo && v.precipMm <= hi, `第 ${d} 日降水 ${v.precipMm} 应在 [${lo}, ${hi}] 内`);
    } else {
      nullPrecipSeen += 1;
      assert.equal(v.precipMm, null, `第 ${d} 日（${v.state}）无降水分布，降水应为 null`);
      assert.ok(S.gapsOfFact(f).length > 0, `第 ${d} 日（${v.state}）降水为 null 时应有缺口`);
    }
    const [wlo, whi] = row.windMps.clamp;
    assert.ok(typeof v.windMps === 'number' && v.windMps >= wlo && v.windMps <= whi, `第 ${d} 日风速应在 [${wlo}, ${whi}] 内`);
    assert.ok(typeof v.windDirDeg === 'number' && v.windDirDeg >= 0 && v.windDirDeg < 360, `第 ${d} 日风向应在 [0,360) 内`);
    assert.ok(S.angDiff(v.windDirDeg, pw) <= row.windDirSpreadDeg, `第 ${d} 日风向与盛行风角差应 ≤ ${row.windDirSpreadDeg}`);
  }
  assert.ok(precipSeen > 0, '前提：360 日内应有带降水分布的日子');
  assert.ok(nullPrecipSeen > 0, '前提：360 日内应有无降水分布（降水为 null）的日子');
});
