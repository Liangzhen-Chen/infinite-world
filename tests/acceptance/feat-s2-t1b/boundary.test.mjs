// S2-T1b 黑盒验收：等待跨越区间边界后，季节与节气按本单元方案的行顺序前进（卷二十:691；勘误 S2-T1b）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 沿一整年经过每个行的起点边界：边界前两日与边界后两日各读一次（前点为边界−2 日，故后点须等 4 日），读数等于按数据算出的行，且读数只在边界处变化、按表序前进。
// 从前点起用四次 act_wait（单次上限一日）跨过边界，其余时间用 advance 跳过。
async function crossEveryBoundary(key, rows, spec, world, avatar) {
  assert.ok(rows.length > 1, '方案应有多于一行，才有边界可跨');
  const from = world.state.clock.minute + 2 * S.MINUTES_PER_DAY;
  const events = S.boundaryMinutes(rows, S.fracOf(spec.phaseOffset), from);
  const read = (now) => (key === 'season' ? now.season?.id : now.solarTerm);
  const observed = [];
  for (const ev of events) {
    await S.advanceTo(world, ev.minute - 2 * S.MINUTES_PER_DAY);
    const before = S.nowOf(world, avatar);
    assert.equal(read(before), S.expectAt(spec, before)[key], `边界 ${ev.id} 前的 ${key} 应按数据为上一行`);
    for (let d = 0; d < 4; d += 1) await S.waitMinutes(world, avatar, S.MINUTES_PER_DAY);
    const after = S.nowOf(world, avatar);
    assert.equal(read(after), S.expectAt(spec, after)[key], `边界 ${ev.id} 后的 ${key} 应按数据为本行`);
    assert.notEqual(read(after), read(before), `跨越边界 ${ev.id} 后 ${key} 应变化`);
    observed.push(read(after));
  }
  assert.equal(new Set(observed).size, rows.length, '一年内每行都应被读到');
  for (let i = 1; i < observed.length; i += 1) {
    const prev = rows.findIndex((r) => r.id === observed[i - 1]);
    assert.equal(observed[i], rows[(prev + 1) % rows.length].id, `${key} 应按方案行的表序前进：${observed[i - 1]} → ${observed[i]}`);
  }
}

test('2a. 季节边界：一年内经过季节方案每个行的起点，读数只在边界处变化，并按表序循环前进', async () => {
  const { world, avatar, lodge } = await S.startAt(0);
  const spec = S.specOf(S.PLACE_ROWS, S.cellOfIn(S.PLACE_ROWS, lodge));
  await crossEveryBoundary('season', S.seasonRowsOf(spec.seasonScheme), spec, world, avatar);
});

test('2b. 节气边界：一年内经过节气方案每个行的起点，读数只在边界处变化，并按表序循环前进', async () => {
  const { world, avatar, lodge } = await S.startAt(0);
  const spec = S.specOf(S.PLACE_ROWS, S.cellOfIn(S.PLACE_ROWS, lodge));
  assert.ok(spec.termScheme, '单元应有节气方案（勘误 S2-T1b）');
  await crossEveryBoundary('solarTerm', S.termRowsOf(spec.termScheme), spec, world, avatar);
});
