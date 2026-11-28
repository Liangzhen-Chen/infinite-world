// S2-T2 黑盒验收：读不到就是 null 带缺口，不兜底（卷二十:285 读不到为 gap；草案 §5 第 5 条）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t2。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t2/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('5a. 挂单元类而无天气常见度的真实单元（不写 id）：weatherAt 为未知，value 为 null，缺口非空；多日都如此，不给默认天气', async () => {
  const cell = S.gapCell();
  const H = await S.openDefault();
  for (const d of [0, 1, 100, 400]) {
    const f = S.wxAt(H, cell, d);
    assert.equal(f.known, false, `第 ${d} 日应为未知（known 为假）`);
    assert.equal(f.value, null, `第 ${d} 日 value 应为 null`);
    assert.ok(S.gapsOfFact(f).length > 0, `第 ${d} 日缺口应非空`);
  }
});

test('5b. 有化身且所在单元无天气常见度：now.weather 为 null，now.gaps 非空（不取默认天气）。前提在副本里造：删去有天气数据的单元行的 weatherCommonality（同 S2-T1 6c，不造单元）', async () => {
  // 原前提「开局候选里有落脚处位于无天气常见度的单元」在真实数据里不成立：开局 11 个落脚处全在垄渠郡（唯一挂常见度的单元）。见出题.md 说明。
  const cell = S.weatherCell();
  const fx = await S.openFixture((f) => S.editWorldJson(f, S.PLACE_DIM_PATH, (doc) => {
    delete doc.rows[cell].weatherCommonality;
  }));
  const offer = S.T1.lodgeOffer(fx.world);
  assert.ok(offer.length > 0, '前提：开局候选非空');
  const { world, saveRoot } = fx;
  const { avatar } = await S.T1.chooseOn(world, saveRoot, 0);
  const now = S.T1.nowOf(world, avatar);
  assert.equal(now.weather ?? null, null, '该单元无天气数据时 now.weather 应为 null');
  assert.ok(Array.isArray(now.gaps) && now.gaps.length > 0, 'now.weather 为 null 时 now.gaps 应非空');
});
