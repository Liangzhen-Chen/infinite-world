// 格子迁移 G10 余下《现场泡展开收起》扩展性测试（卷二十七 R27-3.14 :500–:502、A27-1.15 :373、R27-1.12 :310）。
// 验三件事：泡的大小只取决于玩家控制实体数与半径、与格空间多大无关；新加一个格空间不用改泡的代码；半径只经规则表改。
// 夹具见 tests/kernel/bubble-world.mjs：格空间 w0 是 12 × 3 区格，格空间 w1 是 24 × 6 区格（面积 4 倍）；
// 区格边长 100 细格（regionCellM 100 m、cellM 1 m），区格 (cx, cy) 的中心细格是 (cx*100+50, cy*100+50)；z=1 是站立层。真实泡半径首值 r=1。
// 期望值按卷文公式手算成字面量（推算写在用例里）。只跑不推进世界的小检查（本机 F 盘）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE, pos, fresh, seatEdge, withRules } from './bubble-world.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { alterCells } from '../../server-plugin/grid-diff.mjs';
import { bubbleView } from '../../server-plugin/sim-tiers.mjs';
import { bubbleDelta, bubbleTransition } from '../../server-plugin/bubble.mjs';

const GRID_FILE = { node: 'alterCells', file: 'grid-diff.mjs' };
const regionList = (rs) => rs.map((r) => `${r.w}:${r.x},${r.y}`);
const pairs = (rs) => rs.map((r) => [r.x, r.y]);
// 两名以上的玩家受控个体：state.holdings 按 seats(who) 的形状手写并起来。
const held = (...ids) => Object.fromEntries(ids.map((id) => [id, { hld_1: seatEdge(id) }]));

test('泡大小与格空间大小无关：w0 区格 (5,1) 与 w1 区格 (5,2) 各自单独受控，泡都是 9 区格 = (2r+1)²，不随格空间变大', () => {
  const r = ENGINE.rules.simTiers.bubbleRadiusRegionCells;
  assert.equal(r, 1, '真实规则表首值');
  const a = bubbleView(ENGINE, fresh({ npc_a: pos(550, 150, 1) }, 'npc_a'));
  const b = bubbleView(ENGINE, fresh({ npc_b: pos(550, 250, 1, 1) }, 'npc_b'));
  // 手算：r=1 → 每轴 −1..1 共 3；w0 区格 (5,1) 的 x 4–6、y 0–2 都在 12×3 框内，9 格；
  //      w1 区格 (5,2) 的 x 4–6、y 1–3 都在 24×6 框内，9 格。格空间面积大 4 倍，泡仍是 9。
  assert.deepEqual(a.map((s) => [s.w, s.regions.length]), [[0, 9]]);
  assert.deepEqual(pairs(a[0].regions), [[4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2], [6, 0], [6, 1], [6, 2]]);
  assert.deepEqual(b.map((s) => [s.w, s.regions.length]), [[1, 9]]);
  assert.deepEqual(pairs(b[0].regions), [[4, 1], [4, 2], [4, 3], [5, 1], [5, 2], [5, 3], [6, 1], [6, 2], [6, 3]]);
  // R27-3.14：泡内细格数上界 实体数 × (2r+1)² × 每区格细格列数。实体数 1：区格数 9 = 1 × 9，成立。
  assert.ok(a[0].regions.length <= 1 * (2 * r + 1) ** 2);
  assert.ok(b[0].regions.length <= 1 * (2 * r + 1) ** 2);
  // 每区格细格列数 = (regionCellM ÷ cellM)² = (100 ÷ 1)² = 10000；9 区格共 90000。
  const { regionCellM, cellM } = ENGINE.rules.grid;
  assert.equal(regionCellM, 100);
  assert.equal(cellM, 1);
  assert.equal(a[0].regions.length * (regionCellM / cellM) ** 2, 90000);
});

test('两个受控个体：w0 区格 (5,1) 与 (7,1) 的泡并集是 15 格 ≤ 2 × 9 = 18；再加 w1 的 (5,2)，两个格空间各自成泡（w0 15 格、w1 9 格）', () => {
  const r = ENGINE.rules.simTiers.bubbleRadiusRegionCells;
  const s = fresh({ npc_a: pos(550, 150, 1), npc_b: pos(750, 150, 1) }, null);
  s.holdings = held('npc_a', 'npc_b');
  const v = bubbleView(ENGINE, s);
  // 手算：npc_a 的 (5,1) 给 x 4–6，npc_b 的 (7,1) 给 x 6–8，并集 x 4–8（5 列）× y 0–2（3 行）= 15，不去重的上界 2 × 9 = 18。
  assert.deepEqual(v.map((x) => [x.w, x.regions.length]), [[0, 15]]);
  assert.ok(v[0].regions.length <= 2 * (2 * r + 1) ** 2);
  // 再加 w1 区格 (5,2) 受控：不同格空间各自成泡，w 升序。
  s.created.npc_c = { props: { pos: pos(550, 250, 1, 1) } };
  s.holdings = held('npc_a', 'npc_b', 'npc_c');
  assert.deepEqual(bubbleView(ENGINE, s).map((x) => [x.w, x.regions.length]), [[0, 15], [1, 9]]);
});

test('差分字节数与格空间大小无关：在站立层下一层 z=0 各挖一格（w0 (550,150,0)、w1 (550,250,0) 由各自受控个体所为），两个格空间的差分条各项等长、条数各 1', () => {
  const s = fresh({ npc_a: pos(550, 150, 1), npc_b: pos(550, 250, 1, 1) }, null);
  s.holdings = held('npc_a', 'npc_b');
  const dig = (actor, w, x, y) => runTransaction(s, GRID_FILE, (st) => alterCells(ENGINE, st, {
    w, changes: [{ pos: { w, x, y, z: 0, coarse: false }, material: 'mat_air', fixture: null, mark: null }], cause: { actor },
  }));
  assert.deepEqual(dig('npc_a', 0, 550, 150), { ok: true });
  assert.deepEqual(dig('npc_b', 1, 550, 250), { ok: true });
  // 两边状态同形：同一里块（chunkRegionCells 10 → 里块边长 1000 细格，两格都在 "0:0"）、同一格键长度（"550:150:0" 与 "550:250:0"）、
  // 同一差分记录 {material, fixture, mark, sinceMinute}（同材料 mat_air、同时刻 1234）。格空间面积大 4 倍，差分长度相等。
  const a = JSON.stringify(s.cells['0']);
  const b = JSON.stringify(s.cells['1']);
  assert.equal(a.length, b.length);
  // 差分条数：state.cells.<w> 下是里块，里块下才是格键（Object.keys 逐层数）。
  const diffCount = (w) => Object.keys(s.cells[w]).reduce((n, c) => n + Object.keys(s.cells[w][c]).length, 0);
  assert.equal(diffCount('0'), 1);
  assert.equal(diffCount('1'), 1);
});

test('加一个格空间不改泡的代码（A27-1.15）：npc_w 在 w1 区格 (2,2) 受控，泡只有 w=1 的 9 格；从 w0 受控 npc_p 换过来，收起 w0 的 6 格、展开 w1 的 9 格；w1 (3,2) 的 coarse 个体 npc_c 落格', () => {
  const base = fresh({ npc_p: pos(50, 150, 1), npc_w: pos(250, 250, 1, 1), npc_c: pos(350, 250, 0, 1, true) }, 'npc_p');
  const before = bubbleView(ENGINE, base);
  // 手算：w0 区格 (0,1) → x −1..1 截到框内 0..1、y 0..2，共 2 × 3 = 6。
  assert.deepEqual(before.map((x) => [x.w, x.regions.length]), [[0, 6]]);
  const after = bubbleView(ENGINE, { ...base, holdings: held('npc_w') });
  // 手算：w1 区格 (2,2) → x 1–3、y 1–3 都在 24×6 框内，9 格；w0 无项。
  assert.deepEqual(after.map((x) => [x.w, x.regions.length]), [[1, 9]]);
  const d = bubbleDelta(before, after);
  assert.deepEqual(regionList(d.collapse), ['0:0,0', '0:0,1', '0:0,2', '0:1,0', '0:1,1', '0:1,2']);
  assert.deepEqual(regionList(d.expand), ['1:1,1', '1:1,2', '1:1,3', '1:2,1', '1:2,2', '1:2,3', '1:3,1', '1:3,2', '1:3,3']);
  const r = bubbleTransition(ENGINE, { ...base, holdings: held('npc_w') }, before);
  assert.equal(r.moves.length, 1);
  const m = r.moves[0];
  assert.equal(m.subject, 'npc_c');
  assert.equal(m.outcome, 'land');
  assert.equal(m.region.x, 3);
  assert.equal(m.region.y, 2);
  assert.equal(m.to.w, 1);
  assert.equal(m.to.coarse, false);
  // 落点在中心所在区格 (3,2) 内：x 300–399、y 200–299。
  assert.ok(m.to.x >= 300 && m.to.x <= 399, `x ${m.to.x}`);
  assert.ok(m.to.y >= 200 && m.to.y <= 299, `y ${m.to.y}`);
});

test('改半径只改规则表：bubbleRadiusRegionCells 换为 2 后，w0 区格 (5,1) 的泡 15 格（y 方向被框截短）、w1 区格 (5,2) 的泡 25 格', () => {
  const e = withRules(ENGINE, { simTiers: { ...ENGINE.rules.simTiers, bubbleRadiusRegionCells: 2 } });
  assert.equal(e.rules.simTiers.bubbleRadiusRegionCells, 2);
  // 手算：r=2 → 每轴 −2..2 共 5。w0 (5,1)：x 3–7、y −1..3 截到框内 0..2，共 5 × 3 = 15。
  const a = bubbleView(e, fresh({ npc_a: pos(550, 150, 1) }, 'npc_a'));
  assert.deepEqual(a.map((s) => [s.w, s.regions.length]), [[0, 15]]);
  assert.deepEqual(pairs(a[0].regions), [
    [3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2], [6, 0], [6, 1], [6, 2], [7, 0], [7, 1], [7, 2],
  ]);
  // 手算：w1 (5,2)：x 3–7、y 0–4 都在 24×6 框内，共 5 × 5 = 25。
  const b = bubbleView(e, fresh({ npc_b: pos(550, 250, 1, 1) }, 'npc_b'));
  assert.deepEqual(b.map((s) => [s.w, s.regions.length]), [[1, 25]]);
  assert.deepEqual(pairs(b[0].regions), [
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4],
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4],
    [7, 0], [7, 1], [7, 2], [7, 3], [7, 4],
  ]);
});
