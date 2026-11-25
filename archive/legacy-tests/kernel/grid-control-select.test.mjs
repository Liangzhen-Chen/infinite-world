// 性能卡"气候输入惰性上行"：controlSurfaceAt 取最近 K 个控制点由"全排序取前 K"改为有界插入，控制点的定点形式按数组缓存（grid.mjs fixedControlPoints）。
// 读数须与原算法（每列给全部控制点建对象、按（距离平方，id）全排序后取前 K，卷五 §4.3 规则 8 :656）逐位相同：下面的参照实现就是改前的写法，
// 在格点坐标上随机造控制点（大量距离并列、重复位置、海拔未知点），K 取 1 到 5，逐列比对；同一数组重复读也相同。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installFixedConstants, fixedUnits } from '../../server-plugin/kernel/det-math.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { controlSurfaceAt } from '../../server-plugin/kernel/grid.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 改前的写法（原样）。
function reference(grid, controlPoints, qx, qy) {
  const k = grid.heightCtrlK;
  const qxf = fixedUnits(qx);
  const qyf = fixedUnits(qy);
  const selected = controlPoints
    .map((p) => {
      const dx = fixedUnits(p.x) - qxf;
      const dy = fixedUnits(p.y) - qyf;
      return { id: p.id, d2: dx * dx + dy * dy, elev: p.elevM === null ? null : fixedUnits(p.elevM) };
    })
    .sort((a, b) => cmp(a.d2, b.d2) || cmp(a.id, b.id))
    .slice(0, k);
  for (const p of selected) if (p.d2 === 0n) return p.elev;
  if (selected.some((p) => p.elev === null)) return null;
  let num = 0n;
  let den = 0n;
  selected.forEach((p, i) => {
    let w = 1n;
    selected.forEach((q, j) => { if (j !== i) w *= q.d2; });
    num += p.elev * w;
    den += w;
  });
  return num / den;
}

// 确定性伪随机（线性同余，只在测试里造前提）。
function rng(seed) {
  let s = seed;
  return (n) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
}

test('最近 K 个控制点的有界选择与全排序取前 K 逐位相同：格点上的并列距离、重复位置、海拔未知、K = 1…5', () => {
  const next = rng(20241122);
  for (let round = 0; round < 40; round += 1) {
    const count = 1 + next(30);
    const cps = Array.from({ length: count }, (_, i) => ({ id: `p${String(next(1000)).padStart(4, '0')}_${i}`, x: next(7) * 50, y: next(7) * 50, elevM: next(6) === 0 ? null : next(2000) - 500 }));
    // 重复 id 前缀、重复位置不用额外造：格点只有 49 个位置，30 个点必有重复；id 的数字段随机，保证并列时按 id 排序有区别。
    for (let k = 1; k <= 5; k += 1) {
      const grid = { heightCtrlK: k };
      for (let q = 0; q < 12; q += 1) {
        const qx = next(9) * 25;
        const qy = next(9) * 25;
        assert.equal(controlSurfaceAt(grid, cps, qx, qy), reference(grid, cps, qx, qy), `round ${round} k ${k} q (${qx}, ${qy})`);
      }
    }
  }
});

test('控制点不多于 K 个、恰在控制点上、K 大于点数：与全排序一致；没有控制点仍拒收', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 100, y: 0, elevM: 300 }];
  for (const k of [1, 2, 3, 8]) {
    const grid = { heightCtrlK: k };
    for (const [qx, qy] of [[0, 0], [100, 0], [50, 0], [50, 80]]) assert.equal(controlSurfaceAt(grid, cps, qx, qy), reference(grid, cps, qx, qy), `k ${k} (${qx}, ${qy})`);
  }
  assert.throws(() => controlSurfaceAt({ heightCtrlK: 2 }, [], 0, 0), (e) => /E-DET-DOMAIN/.test(String(e.code) + String(e.message)));
});

test('heightCtrlK 不是正安全整数（0、负数、NaN、非整数、缺省、字串、无穷）一律拒收 E-RULES-UNREGISTERED，不借旧写法 slice 的语义出值', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 100, y: 0, elevM: 300 }, { id: 'c', x: 0, y: 100, elevM: 200 }];
  for (const k of [0, -1, -2, Number.NaN, 2.5, undefined, '2', Infinity]) {
    assert.throws(() => controlSurfaceAt({ heightCtrlK: k }, cps, 30, 30), (e) => e.code === 'E-RULES-UNREGISTERED', String(k));
  }
  assert.doesNotThrow(() => controlSurfaceAt({ heightCtrlK: 2 }, cps, 30, 30));
});
