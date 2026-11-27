// S2-T1b 黑盒验收：读不到就是 null 带 gap，不兜底（卷二十:691；勘误 S2-T1b 单元缺维度为 null 加 gaps；S2-T1 草案 §7 第 5、6 条口径）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('6. 不兜底：副本里删去本单元的 termScheme，各时刻 now.solarTerm 为 null 且 gaps 非空；季节仍按本单元方案读出', async () => {
  const real = await S.startAt(0);
  const cell = S.cellOfIn(S.PLACE_ROWS, real.lodge);
  const fx = S.copyFixture();
  S.editJson(fx, S.PLACE_PATH, (doc) => { delete doc.rows[cell].termScheme; });
  const copy = await S.bootFixture(fx);
  const { avatar } = await S.chooseOn(copy.world, copy.saveRoot, 0);
  const spec = S.specOf(S.placeRowsAt(fx.repo), cell);
  assert.equal(spec.termScheme, undefined, '前提：副本里单元已无节气方案');

  for (const m of [0, 2 * S.MINUTES_PER_DAY, 40 * S.MINUTES_PER_DAY]) {
    await S.advanceTo(copy.world, m);
    const now = S.nowOf(copy.world, avatar);
    assert.equal(now.solarTerm ?? null, null, '单元无节气方案时节气应为 null，不取默认节气');
    assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, '节气未知时 gaps 应非空');
    assert.equal(now.season?.id, S.expectAt(spec, now).season, '季节不受节气方案缺失影响，仍按本单元季节方案读出');
  }
});
