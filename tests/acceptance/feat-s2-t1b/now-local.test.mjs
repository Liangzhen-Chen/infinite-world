// S2-T1b 黑盒验收：菜单 view 的本地季节与节气与本单元数据一致（卷二十:691；勘误 S2-T1b 按单元相位派生）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 开局化身所在单元的节律数据（从 world/ 的 place.json 读，不写死代号）。
async function startWithSpec() {
  const { world, avatar, lodge } = await S.startAt(0);
  const spec = S.specOf(S.PLACE_ROWS, S.cellOfIn(S.PLACE_ROWS, lodge));
  return { world, avatar, spec };
}

test('1a. 季节：每季中点分钟的 now.season 即按单元本地相位（世界相位 + phaseOffset）查季节方案行所得；now 的形状含 season、solarTerm、gaps', async () => {
  const { world, avatar, spec } = await startWithSpec();
  const rows = S.seasonRowsOf(spec.seasonScheme);
  assert.ok(rows.length > 0, '单元的季节方案应有季节行');
  const seen = [];
  for (const t of S.midpointMinutes(rows, S.fracOf(spec.phaseOffset), world.state.clock.minute)) {
    await S.advanceTo(world, t.minute);
    const now = S.nowOf(world, avatar);
    assert.ok('season' in now && 'solarTerm' in now && Array.isArray(now.gaps), 'now 应含 season、solarTerm 与 gaps');
    const want = S.expectAt(spec, now);
    assert.equal(now.season?.id, want.season, `第 ${now.minute} 分的季节应为 ${want.season}`);
    assert.equal(want.season, t.id, '季中点应落在该季的行内');
    seen.push(now.season.id);
  }
  assert.equal(new Set(seen).size, rows.length, '一年内方案中的每个季节行都应出现');
});

test('1b. 节气：节气方案的每行中点分钟，now.solarTerm 即按本地相位查节气方案行所得（与季节同时读出）', async () => {
  const { world, avatar, spec } = await startWithSpec();
  assert.ok(spec.termScheme, '单元应有节气方案（勘误 S2-T1b）');
  const rows = S.termRowsOf(spec.termScheme);
  assert.ok(rows.length > 0, '节气方案应有节气行');
  for (const t of S.midpointMinutes(rows, S.fracOf(spec.phaseOffset), world.state.clock.minute)) {
    await S.advanceTo(world, t.minute);
    const now = S.nowOf(world, avatar);
    const want = S.expectAt(spec, now);
    assert.equal(now.solarTerm, want.solarTerm, `第 ${now.minute} 分的节气应为 ${want.solarTerm}`);
    assert.equal(want.solarTerm, t.id, '节气中点应落在该节气的行内');
    assert.equal(now.season?.id, want.season, '同一时刻季节应与本地相位一致');
  }
});
