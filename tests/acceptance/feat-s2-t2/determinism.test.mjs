// S2-T2 黑盒验收：天气是（种子, 单元, 日）的纯函数；读取顺序无关；天气不发事件（卷二十:636、:674、:652）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t2。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t2/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const DAYS = [0, 1, 2, 17, 359, 360, 361, 719];

test('1a. 同种子两局独立装配：同一单元第 d 日的天气逐字节相同（卷二十:636 确定性）', async () => {
  const A = await S.openDefault();
  const B = await S.openDefault();
  const cell = S.weatherCell();
  for (const d of DAYS) {
    assert.equal(S.canon(S.wxAt(A, cell, d)), S.canon(S.wxAt(B, cell, d)), `第 ${d} 日的天气两局应相同`);
  }
});

test('1b. 换种子：世界种子改为另一值的副本，连续 60 日的状态序列与缺省种子不全同（卷二十:636 种子是输入）', async () => {
  const cell = S.weatherCell();
  const days = Array.from({ length: 60 }, (_, i) => i);
  const base = await S.openDefault();
  const seqBase = S.stateSeries(base, cell, days);
  const other = await S.openFixture((fx) => S.editWorldJson(fx, 'world/rules/tables/worldgen.json', (doc) => {
    const row = doc.rows.find((r) => r.key === 'worldSeed');
    assert.ok(row, '前提：worldgen.json 应有 worldSeed 行');
    row.value = 987654;
  }));
  const seqOther = S.stateSeries(other, cell, days);
  assert.ok(seqBase.every((s) => s !== null), '缺省种子下 60 日都应有天气');
  assert.notDeepEqual(seqOther, seqBase, '换种子后 60 日的状态序列不应全同');
});

test('2a. 读取顺序无关：先读 d+100 再读 d，与按日序单独读的结果逐字节相同；跨锚段边界（d = 锚段长 −1 与 锚段长）照常', async () => {
  const cell = S.weatherCell();
  const L = S.ANCHOR_DAYS;
  const ds = [0, 5, L - 1, L, L + 1, 400, 719];
  const H1 = await S.openDefault();
  const forward = ds.map((d) => S.canon(S.wxAt(H1, cell, d)));
  const H2 = await S.openDefault();
  const backward = [...ds].reverse().map((d) => S.canon(S.wxAt(H2, cell, d))).reverse();
  assert.deepEqual(backward, forward, '倒序读取的结果应与正序相同');
});

test('2b. 先读远日再读近日：同一局里先求 d+100，再求 d，与另一局直接求 d 相同（同一日在锚段内任意位置读结果一致）', async () => {
  const cell = S.weatherCell();
  const L = S.ANCHOR_DAYS;
  const probes = [L - 1, L, 2 * L - 1];
  const fresh = await S.openDefault();
  const expected = probes.map((d) => S.canon(S.wxAt(fresh, cell, d)));
  const H = await S.openDefault();
  for (const d of probes) S.wxAt(H, cell, d + 100);
  const got = probes.map((d) => S.canon(S.wxAt(H, cell, d)));
  assert.deepEqual(got, expected, '读过远日后再读近日，结果应与直接读相同');
});

test('7. 不发事件：等待跨过三个日界，事件日志里没有天气类条目，且日志确有新增（卷二十:652 天气变化不发事件）', async () => {
  const { world, avatar } = await S.startWeatherAvatar();
  const n0 = world.logBook.entries.length;
  for (let i = 0; i < 3; i += 1) await S.T1.waitMinutes(world, avatar, S.ACT_WAIT_MAX);
  const added = world.logBook.entries.slice(n0);
  assert.ok(added.length > 0, '前提：等待应写入日志（否则本条无意义）');
  const bad = /weather|precip|wind|天气|降水|风向|风速/i;
  const hits = added.filter((e) => bad.test(JSON.stringify(e)));
  assert.deepEqual(hits, [], '日志里不得有天气类事件');
});
