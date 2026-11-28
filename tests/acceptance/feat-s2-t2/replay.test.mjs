// S2-T2 黑盒验收：跨日后 now.weather 按新日重算；存读档复演一致；天气不进 state（卷二十:462 无写者；草案 §5 第 6 条；卷二:550 复演口径）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t2。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t2/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { loadSlot, replay_apply } from '../../../server-plugin/index.mjs';

after(S.cleanup);

test('6. 跨日后 now.weather 与当日 weatherAt 一致；存读档复演后 saveDigest 相同，now 逐字节相同（含 weather）；state 里无天气键', async () => {
  const { world, saveRoot, avatar, lodge } = await S.startWeatherAvatar();
  const day0 = S.T1.nowOf(world, avatar).day;
  await S.T1.waitMinutes(world, avatar, S.ACT_WAIT_MAX);
  await S.T1.waitMinutes(world, avatar, S.ACT_WAIT_MAX);
  const now = S.T1.nowOf(world, avatar);
  assert.ok(now.day > day0, '前提：等待两次后应跨过日界');
  assert.ok(now.weather && typeof now.weather === 'object', '前提：挂天气单元的化身，跨日后 now.weather 应为读数');

  // 跨日后按新日重算：与当日 weatherAt 的六个数值键逐字节相同（单元取化身落脚处所在的单元）。
  const cell = S.cellOf(lodge);
  const H = { world, wx: await S.wxMod() };
  assert.equal(S.canon(S.pickWx(now.weather)), S.canon(S.pickWx(S.wxAt(H, cell, now.day).value)), '跨日后 now.weather 应等于新日的 weatherAt');

  const nowBefore = S.canon(now);
  const manifest = world.save(0);
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));
  assert.equal(back.saveDigest, manifest.saveDigest, '复演后 saveDigest 应与存前相同');
  assert.equal(S.canon(S.T1.nowOf(back, avatar)), nowBefore, '复演后 now 应逐字节相同（含 weather）');

  for (const w of [world, back]) {
    const keys = S.keysDeep(w.state);
    for (const k of ['weather', 'precipMm', 'windDirDeg', 'humidity']) {
      assert.equal(keys.has(k), false, `state 不得含键 ${k}（天气纯派生，不落盘）`);
    }
  }
});
