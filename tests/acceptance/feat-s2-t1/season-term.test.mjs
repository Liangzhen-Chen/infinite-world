// S2-T1 黑盒验收：季节随相位走（卷二十:689、:691）；节气随相位按词表顺序变（Q3 甲，solar_term 族）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1/出题.md。北半球：Q5 未落地前所有地点纬度为正，本文件只测北半球。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 先找一个挂单元（有季节方案）的落脚处：候选从 world 数据来，不写死 id。
async function startWithCell() {
  const probe = await S.freshWorld();
  const idx = S.lodgeIndexWithCell(S.lodgeOffer(probe.world));
  assert.ok(idx >= 0, '前提：落脚处候选中应有挂 comp_weather_cell 的建筑（单元有季节方案）');
  return S.startAt(idx);
}

test('4a. 季节随相位走过四季行：每季中点分钟的 now.season 即该相位所在的 season 词表行（北半球）', async () => {
  const { world, avatar } = await startWithCell();
  const clock0 = world.state.clock.minute;
  const targets = S.seasonRows()
    .map((r) => ({ id: r.id, minute: S.midMinuteAfter(clock0, (r.from + r.to) / 2) }))
    .sort((a, b) => a.minute - b.minute);
  const seen = [];
  for (const t of targets) {
    const d = t.minute - world.state.clock.minute;
    if (d > 0) await S.advanceBy(world, d);
    const now = S.nowOf(world, avatar);
    const expect = S.seasonIdAt(S.phaseAt(world.state.clock.minute));
    assert.equal(now?.season?.id, expect, `相位 ${S.phaseAt(world.state.clock.minute)} 的季节应为 ${expect}`);
    assert.equal(now.season.id, t.id, '季中点应落在该季的行内');
    seen.push(now.season.id);
  }
  assert.equal(new Set(seen).size, S.seasonRows().length, '一年内四季应各出现一次');
});

test('4b. 节气随相位按词表顺序变：一年内 24 个节气中点逐个读，now.solarTerm 即该相位所在的 solar_term 行，相邻读数按表序前进', async () => {
  const { world, avatar } = await S.startAt(0);
  const rows = S.solarTermRows();
  assert.equal(rows.length, 24, 'solar_term 族应为 24 行（Q3 甲）');
  const clock0 = world.state.clock.minute;
  const targets = rows
    .map((r) => ({ id: r.id, minute: S.midMinuteAfter(clock0, (r.from + r.to) / 2) }))
    .sort((a, b) => a.minute - b.minute);
  const visited = [];
  for (const t of targets) {
    const d = t.minute - world.state.clock.minute;
    if (d > 0) await S.advanceBy(world, d);
    const now = S.nowOf(world, avatar);
    const expect = S.solarTermIdAt(S.phaseAt(world.state.clock.minute));
    assert.equal(now?.solarTerm, expect, `相位 ${S.phaseAt(world.state.clock.minute)} 的节气应为 ${expect}`);
    visited.push(now.solarTerm);
  }
  const ids = rows.map((r) => r.id);
  for (let i = 1; i < visited.length; i += 1) {
    const step = (ids.indexOf(visited[i]) - ids.indexOf(visited[i - 1]) + 24) % 24;
    assert.equal(step, 1, `节气应按词表顺序前进：${visited[i - 1]} → ${visited[i]}`);
  }
});
