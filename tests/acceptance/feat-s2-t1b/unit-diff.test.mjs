// S2-T1b 黑盒验收：地区差异机制（卷二十勘误 S2-T1b；卷二十:691）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
// 注：开局的落脚处全在开局单元内，化身无法经真实动作到达另一单元；故「两地」取两个世界：真仓库（原单元偏移）与隔离副本（同一单元偏移改为相差 1/2）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 偏移加 1/2（取小数）：分子分母以 2 倍通分。
const shiftedHalf = (o) => {
  S.fracOf(o);
  const den = o.den * 2;
  return { num: (o.num * 2 + o.den) % den, den };
};

test('3. 差异机制：副本里本单元的相位偏移改成相差 1/2，同一时刻的季节与真仓库不同；真仓库的数据不改', async () => {
  const real = await S.startAt(0);
  const cell = S.cellOfIn(S.PLACE_ROWS, real.lodge);
  const realSpec = S.specOf(S.PLACE_ROWS, cell);
  const fx = S.copyFixture();
  S.editJson(fx, S.PLACE_PATH, (doc) => { doc.rows[cell].phaseOffset = shiftedHalf(realSpec.phaseOffset); });
  const copy = await S.bootFixture(fx);
  const copied = await S.chooseOn(copy.world, copy.saveRoot, 0);
  assert.equal(copied.lodge, real.lodge, '副本的开局落脚处应与真仓库相同');
  const copySpec = S.specOf(S.placeRowsAt(fx.repo), cell);
  assert.notDeepEqual(copySpec.phaseOffset, realSpec.phaseOffset, '副本的偏移应已改动');

  // 找一个中点：按两套数据算出的季节不同。
  const rows = S.seasonRowsOf(realSpec.seasonScheme);
  const pick = S.midpointMinutes(rows, S.fracOf(realSpec.phaseOffset), 0).find((t) => {
    const at = { minute: t.minute, minuteOfDay: t.minute % S.MINUTES_PER_DAY };
    return S.expectAt(realSpec, at).season !== S.expectAt(copySpec, at).season;
  });
  assert.ok(pick, '前提：应有一个时刻使两套偏移的季节不同');

  await S.advanceTo(real.world, pick.minute);
  await S.advanceTo(copy.world, pick.minute);
  const rn = S.nowOf(real.world, real.avatar);
  const cn = S.nowOf(copy.world, copied.avatar);
  assert.equal(rn.season?.id, S.expectAt(realSpec, rn).season, '真仓库的季节应按真数据派生');
  assert.equal(cn.season?.id, S.expectAt(copySpec, cn).season, '副本的季节应按副本的偏移派生');
  assert.notEqual(rn.season?.id, cn.season?.id, '同一时刻，偏移相差 1/2 的两个单元季节应不同');
  assert.deepEqual(S.specOf(S.placeRowsAt(S.ROOT), cell), realSpec, '真仓库的单元数据不应被副本改动');
});
