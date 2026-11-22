// 长测，腾讯云块验收（G18）跑；本机常规测试不跑（主会话 11-24 已定的 tests/cloud/ 目录）。
// 从 tests/kernel/gen-downhill.test.mjs 挪来：真实世界上格后，planFootprints 是全规模足迹加高度场，本机要数分钟。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { planFootprints } from '../../server-plugin/kernel/place.mjs';

test('planFootprints withCells 假：真实世界各行 regionCells 为 null（不物化全树区格列表），面积与相邻照常；打印耗时', { timeout: 1800000 }, () => {
  const world = loadWorld(ROOT);
  assert.equal(world.ok, true, world.text);
  const t0 = Date.now();
  const r = planFootprints({ ...world, template: { seed: 'seed_one' } }, { withCells: false });
  console.log(`real world planFootprints(withCells false): ${((Date.now() - t0) / 1000).toFixed(1)} s, maxRSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`);
  for (const f of Object.values(r.footprints)) assert.equal(f.regionCells, null);
  assert.equal(typeof r.adjacency, 'object');
});
