// 公共部件修理 C4：格子几何单点（kernel/grid-geom.mjs 与 footprint.mjs 的区格共用函数）。依据：卷五:433 区格序号、卷五:499 区格中心、卷五:465 八邻、卷五:1216 四邻接。
// 期望值手算成字面量（本测试是写码方自补的单元测试，不作验收依据）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEIGHBORS_4, NEIGHBORS_8, dist2Fixed, regionCellsTouch } from '../../server-plugin/kernel/grid-geom.mjs';
import { regionSideCells, regionCenterFixed, regionCenterM, regionCenterColumn } from '../../server-plugin/kernel/footprint.mjs';
import { fixedUnits } from '../../server-plugin/kernel/det-math.mjs';

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';

loadWorld(join(dirname(fileURLToPath(import.meta.url)), '..', '..')); // 装配定点常数
const GRID = { cellM: 1, regionCellM: 100 };

test('方向表：四邻次序东西北南，八邻先四邻再四个斜向', () => {
  assert.deepEqual(NEIGHBORS_4.map((d) => [...d]), [[1, 0], [-1, 0], [0, 1], [0, -1]]);
  assert.deepEqual(NEIGHBORS_8.map((d) => [...d]), [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
});

test('区格边长细格数 = regionCellM ÷ cellM，不整除报 E-DET-DOMAIN', () => {
  assert.equal(regionSideCells(GRID), 100n);
  assert.throws(() => regionSideCells({ cellM: 3, regionCellM: 100 }), (e) => e.code === 'E-DET-DOMAIN');
});

test('区格中心 = 序号 × 边长 + 半边（米、定点米、细格列）', () => {
  assert.deepEqual(regionCenterFixed(GRID, { x: 2, y: -1 }), { x: fixedUnits(250), y: fixedUnits(-50) });
  assert.deepEqual(regionCenterM(GRID, { x: 2, y: -1 }), { x: 250, y: -50 });
  assert.deepEqual(regionCenterColumn(GRID, { x: 2, y: -1 }), { x: 250, y: -50 });
});

test('距离平方与区格相接：(3,4) 距原点平方 25 米²；共边相接、只角接不算', () => {
  assert.equal(dist2Fixed(fixedUnits(3), fixedUnits(4), 0n, 0n), fixedUnits(3) * fixedUnits(3) + fixedUnits(4) * fixedUnits(4));
  assert.equal(regionCellsTouch([{ x: 0, y: 0 }], [{ x: 1, y: 0 }]), true);
  assert.equal(regionCellsTouch([{ x: 0, y: 0 }], [{ x: 1, y: 1 }]), false);
  assert.equal(regionCellsTouch([{ x: 0, y: 0 }], [{ x: 2, y: 0 }]), false);
});
