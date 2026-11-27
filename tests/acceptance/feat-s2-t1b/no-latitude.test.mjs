// S2-T1b 黑盒验收：季节与节气不读纬度（卷二十勘误 S2-T1b，卷二十:690 半球归一按纬度改为单元偏移）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const LATITUDE_KEYS = ['latitudeOriginDeg', 'metersPerDegreeNorth'];

test('4. 不读纬度：副本里把 astro 的两个纬度键改成任意值（取南纬），各时刻的季节与节气与真仓库逐项相同，且都按数据算出', async () => {
  const real = await S.startAt(0);
  const cell = S.cellOfIn(S.PLACE_ROWS, real.lodge);
  const spec = S.specOf(S.PLACE_ROWS, cell);
  const fx = S.copyFixture();
  S.editJson(fx, S.ASTRO_PATH, (doc) => {
    for (const row of doc.rows) {
      if (!LATITUDE_KEYS.includes(row.key)) continue;
      row.value = row.key === 'latitudeOriginDeg' ? -40 : 1;
    }
  });
  const copy = await S.bootFixture(fx);
  const copied = await S.chooseOn(copy.world, copy.saveRoot, 0);
  assert.equal(copied.lodge, real.lodge, '副本的开局落脚处应与真仓库相同');

  const targets = [
    ...S.midpointMinutes(S.seasonRowsOf(spec.seasonScheme), S.fracOf(spec.phaseOffset), 0),
    ...S.midpointMinutes(S.termRowsOf(spec.termScheme), S.fracOf(spec.phaseOffset), 0),
  ].sort((a, b) => a.minute - b.minute);
  for (const t of targets) {
    await S.advanceTo(real.world, t.minute);
    await S.advanceTo(copy.world, t.minute);
    const rn = S.nowOf(real.world, real.avatar);
    const cn = S.nowOf(copy.world, copied.avatar);
    assert.equal(cn.season?.id, rn.season?.id, `第 ${rn.minute} 分：改纬度后季节应不变`);
    assert.equal(cn.solarTerm, rn.solarTerm, `第 ${rn.minute} 分：改纬度后节气应不变`);
    assert.equal(rn.season?.id, S.expectAt(spec, rn).season, '季节应按单元数据派生');
    assert.equal(rn.solarTerm, S.expectAt(spec, rn).solarTerm, '节气应按单元数据派生');
  }
});
