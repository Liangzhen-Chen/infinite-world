// 长测，腾讯云块验收（G18）跑；本机常规测试不跑（主会话 11-24 已定的 tests/cloud/ 目录）。
// 真实世界整体加载一次（含加载校验里的全规模足迹划分）：断言加载成功、世界有格空间表且根是层根；耗时与峰值内存打印出来，作腾讯云实测对照（docs/问题.md G5b 遗留第 5 条的测量点）。
// 期望不抄仓库读数：只核卷五 §4.1.1 :425、:431 的结构（主世界一个格空间，根挂 comp_layer_root），不核行数、格数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';

test('真实世界整体加载：成功，格空间表非空且每个格空间的根都存在；打印耗时与峰值内存', { timeout: 900000 }, () => {
  const t0 = Date.now();
  const r = loadWorld(ROOT);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const place = r.tables.get('place');
  const spaces = place.doc.gridSpaces;
  console.log(`real world loadWorld: ${sec} s, maxRSS ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB, heapUsed ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB, arrayBuffers ${(process.memoryUsage().arrayBuffers / 1048576).toFixed(0)} MB`);
  assert.equal(r.ok, true, r.text);
  assert.ok(Array.isArray(spaces) && spaces.length > 0, 'the world has a grid space table');
  for (const s of spaces) assert.ok(place.flat.rows.has(s.root), `grid space ${s.w} root ${s.root} is a place row`);
});
