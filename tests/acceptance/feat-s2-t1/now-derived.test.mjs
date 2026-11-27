// S2-T1 黑盒验收：now 是纯派生，不落状态、不发事件（卷二十:462、:652；草案 §7 第 1、2、8 条）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('1a. 派生不落状态：连续多次 view 读 now，state 逐位不变（卷二十:462 无写者）', async () => {
  const { world, avatar } = await S.startAt(0);
  const before = S.stateJson(world.state);
  for (let i = 0; i < 3; i += 1) S.nowOf(world, avatar);
  assert.equal(S.stateJson(world.state), before, 'view 不得改 state');
});

test('1b. state 里没有 weather、season、calendar、solarTerm 路径（扫全树键名；开局后与等待后）', async () => {
  const { world, avatar } = await S.startAt(0);
  const banned = ['weather', 'season', 'calendar', 'solarTerm'];
  const check = () => {
    const keys = S.keysDeep(world.state);
    for (const k of banned) assert.equal(keys.has(k), false, `state 不得含键 ${k}（派生量不落盘）`);
  };
  check();
  await S.waitMinutes(world, avatar, 1440);
  check();
});

test('1c. saveDigest 只随既有状态变：中间只读 view 不改摘要；等待后摘要才变（时钟是既有状态）', async () => {
  const { world, avatar } = await S.startAt(0);
  const d0 = world.save(0).saveDigest;
  S.nowOf(world, avatar);
  S.nowOf(world, avatar);
  const d1 = world.save(0).saveDigest;
  assert.equal(d1, d0, '只读 view 之后 saveDigest 应不变');
  await S.waitMinutes(world, avatar, 30);
  const d2 = world.save(0).saveDigest;
  assert.notEqual(d2, d0, '等待改变时钟后 saveDigest 应变');
});

test('2a. 读取时刻无关（:671 不变量⑤）：一次推进 100 天，与一天一天推进 100 次到同一分钟，now 与 state 逐位相同', async () => {
  const A = await S.startAt(0);
  await S.advanceBy(A.world, 100 * S.MINUTES_PER_DAY);
  const B = await S.startAt(0);
  for (let i = 0; i < 100; i += 1) await S.advanceBy(B.world, S.MINUTES_PER_DAY);
  assert.equal(B.world.state.clock.minute, A.world.state.clock.minute, '前提：两局时钟相同');
  assert.equal(S.canon(S.nowOf(B.world, B.avatar)), S.canon(S.nowOf(A.world, A.avatar)), '同一分钟的 now 应相同');
  assert.equal(S.stateJson(B.world.state), S.stateJson(A.world.state), '推进路径不同，state 应相同（读数不落盘）');
});

test('2b. 沿途每天 view 一次的一局，与不 view 的一局，终点 now 与 state 相同（读的时刻不影响后续读数）', async () => {
  const A = await S.startAt(0);
  await S.advanceBy(A.world, 60 * S.MINUTES_PER_DAY);
  const D = await S.startAt(0);
  for (let i = 0; i < 60; i += 1) {
    S.nowOf(D.world, D.avatar);
    await S.advanceBy(D.world, S.MINUTES_PER_DAY);
    S.nowOf(D.world, D.avatar);
  }
  assert.equal(S.canon(S.nowOf(D.world, D.avatar)), S.canon(S.nowOf(A.world, A.avatar)));
  assert.equal(S.stateJson(D.world.state), S.stateJson(A.world.state));
});

test('8. 不发事件：等待跨过三个日界，事件日志里没有天气、季节、节气、历法类条目（卷二十:652 天气变化不发事件）', async () => {
  const { world, avatar } = await S.startAt(0);
  const n0 = world.logBook.entries.length;
  for (let i = 0; i < 3; i += 1) await S.waitMinutes(world, avatar, S.ACT_WAIT_MAX);
  const added = world.logBook.entries.slice(n0);
  assert.ok(added.length > 0, '前提：等待应写入日志（否则本条无意义）');
  const bad = /weather|season|solar_term|solarTerm|calendar|天气|季节|节气/i;
  const isBad = (/** @type {unknown} */ e) => bad.test(JSON.stringify(e));
  const hits = added.filter(isBad);
  assert.deepEqual(hits, [], '日志里不得有天气、季节、节气、历法类事件');
});
