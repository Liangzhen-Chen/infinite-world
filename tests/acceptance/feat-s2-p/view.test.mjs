// S2-P 位置写者黑盒验收：view 回复的「我在哪」与 zoneAt 的地点链（卷五:444、卷五:499 规则 12）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-p/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('5a. 开局无化身时，开局菜单的 here 为空（没有「我在哪」）', async () => {
  const { world } = await S.freshWorld();
  assert.equal(world.menu(null).here ?? null, null, '无化身时 here 应为 null');
});

test('5b. 化身落位后，view 的 here.place 与化身所在建筑一致，chain 为「建筑 → 逐级祖先」（数据推出）', async () => {
  const { world, avatar, lodge } = await S.startAt(0);
  const here = S.hereOf(world, avatar);
  assert.ok(here, '落位后 here 应非空');
  assert.equal(here.place, lodge, 'here.place 应为化身所在建筑');
  assert.deepEqual(here.chain, [lodge, ...S.ancestorsOf(S.PLACE_ROWS, lodge)], 'here.chain 应为建筑及其逐级祖先（卷五:444 placeChainOf）');
});

test('5c. move 后 here 随之更新：here.place 为新建筑，chain 同样由数据推出', async () => {
  const { world, avatar, lodge, offer } = await S.startAt(0);
  const Y = offer.find((x) => x !== lodge);
  assert.ok(Y, '前提：落脚处候选至少两栋');
  const r = await S.moveTo(world, avatar, Y);
  assert.equal(S.isOk(r), true, `move 应成功：${JSON.stringify(r)}`);
  const here = S.hereOf(world, avatar);
  assert.equal(here.place, Y, 'move 后 here.place 应为目标建筑');
  assert.deepEqual(here.chain, [Y, ...S.ancestorsOf(S.PLACE_ROWS, Y)], 'move 后 here.chain 应为新建筑的祖先链');
});
