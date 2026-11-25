// G10 第一步《sim-tiers.mjs 最小子集：bubbleView、inBubble》卡内测试（对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 59、60 行；待定 6）。
// 卷二十七 R27-1.12 :310–:312（现场泡范围、只由状态算出、不同格空间各自成泡、外包框之外不算）、§3.1 :223–:224（bubbleView、inBubble 签名与读法）、
// §2.2 :153（bubbleRadiusRegionCells：整数、1–4、取值域外加载失败、没有"不限"值）、A27-1.12 :370（两次调用相同、泡只随玩家控制实体的位置与登记变、没有玩家控制实体时泡为空）；
// 玩家控制实体的登记：卷九 R9-3.9 :721（在世的玩家席位边，持有种类由 rules.control.seatKind 指名；受控实体既是边的持有者也是标的）。
// 前提在测试里造：夹具世界（tests/kernel/person-world.mjs：一个 300 × 100 区格的格空间，cellM 1 m、regionCellM 100 m，外包框 x 0–299、y 0–99，
// 细格 (20050, 5050) 落在区格 (200, 50)）；席位边直接写进 state.holdings（持有写者与席位种类行属卷九，不在本卡）。期望值按卷文规则手算成字面量。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';
import { buildPersonWorld, personRow, ROOT } from './person-world.mjs';
import { readRules } from '../../server-plugin/kernel/load/rules.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { bubbleView, inBubble } from '../../server-plugin/sim-tiers.mjs';

const SEAT = 'hk_test_seat';
const pos = (x, y, w = 0) => ({ w, x, y, z: 0, coarse: false });
// 区格 (cx, cy) 的中心细格（区格边长 100 个细格）。
const at = (cx, cy, w = 0) => pos(cx * 100 + 50, cy * 100 + 50, w);

// 一个夹具世界：npc_a、npc_b 的位置按参数放；引擎副本里加 rules.control.seatKind，simTiers 取真实规则表（首值 1）。
function make({ a = at(200, 50), b = at(200, 50), radius } = {}) {
  const { engine } = buildPersonWorld((f) => {
    f.personRows.npc_a = personRow({ heir: 'npc_b', pos: a });
    f.personRows.npc_b = personRow({ pos: b });
  });
  const rules = { ...engine.rules, control: { seatKind: SEAT } };
  if (radius !== undefined) rules.simTiers = { ...rules.simTiers, bubbleRadiusRegionCells: radius };
  return { ...engine, rules };
}
const edge = (who, over = {}) => ({ kind: SEAT, holder: who, subject: who, terms: { since: 0, until: null }, grantedBy: null, ...over });
const seats = (...edges) => ({ holdings: Object.fromEntries(edges.map((e, i) => [e.holder, { [`hld_${i + 1}`]: e }])) });
// 展开成 "x,y" 串的升序列表，便于逐格对照。
const flat = (view) => view.flatMap((s) => s.regions.map((r) => `${s.w}:${r.x},${r.y}`));
const block = (x0, x1, y0, y1) => { const out = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`0:${x},${y}`); return out; };

test('规则表：bubbleRadiusRegionCells 登记为整数 1–4，真实表首值 1（卷二十七 :153）', () => {
  const read = readRules(ROOT);
  assert.deepEqual(read.errors, []);
  assert.equal(read.rules.simTiers.bubbleRadiusRegionCells, 1);
});

test('规则表：0、5、负数、小数、null、"不限" 一律加载失败，没有"不限"值（卷二十七 :153 校验列）', () => {
  const reg = JSON.parse(readFileSync(join(ROOT, 'world/rules/registry.json'), 'utf8'));
  const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
  for (const bad of [0, 5, -1, 2.5, null, 'unlimited', 'inf']) {
    const tmp = testTempRoot('sim-tiers-rules-');
    try {
      const rows = ['kernelConstants', 'clock', 'simTiers'].map((c) => reg.rows.find((r) => r.code === c));
      writeUnderTempRoot(tmp, 'registry.json', JSON.stringify({ rows }));
      writeUnderTempRoot(tmp, 'tables/kernel-constants.json', real('tables/kernel-constants.json'));
      writeUnderTempRoot(tmp, 'tables/clock.json', real('tables/clock.json'));
      writeUnderTempRoot(tmp, 'tables/sim-tiers.json', JSON.stringify({ rows: [{ key: 'bubbleRadiusRegionCells', value: bad, basis: 'test' }] }));
      // 类型与取值域由规则表加载（卷二 :1497 登记）按 L1 同一组码核：整数、1–4 之外一律 E-DIM-DOMAIN-RANGE（对照表第 60 行）。
      const r = loadWorld(ROOT, { dimensionsDir: 'tests/kernel/dims', rulesDir: tmp });
      assert.deepEqual(r.errors.filter((e) => e.severity === 'error').map((e) => e.code), ['E-DIM-DOMAIN-RANGE'], `value ${JSON.stringify(bad)}`);
      assert.equal(r.ok, false);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
});

test('规则表：1、4 两端值加载通过（取值域含端点）', () => {
  const reg = JSON.parse(readFileSync(join(ROOT, 'world/rules/registry.json'), 'utf8'));
  const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
  for (const ok of [1, 4]) {
    const tmp = testTempRoot('sim-tiers-rules-');
    try {
      const rows = ['kernelConstants', 'clock', 'simTiers'].map((c) => reg.rows.find((r) => r.code === c));
      writeUnderTempRoot(tmp, 'registry.json', JSON.stringify({ rows }));
      writeUnderTempRoot(tmp, 'tables/kernel-constants.json', real('tables/kernel-constants.json'));
      writeUnderTempRoot(tmp, 'tables/clock.json', real('tables/clock.json'));
      writeUnderTempRoot(tmp, 'tables/sim-tiers.json', JSON.stringify({ rows: [{ key: 'bubbleRadiusRegionCells', value: ok, basis: 'test' }] }));
      const read = readRules(ROOT, { rulesDir: tmp });
      assert.deepEqual(read.errors, []);
      assert.equal(read.rules.simTiers.bubbleRadiusRegionCells, ok);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
});

test('真实世界经统一加载器加载零 error（新规则表登记不破坏加载）', () => {
  const r = loadWorld(ROOT);
  assert.deepEqual(r.errors.filter((e) => e.severity === 'error'), []);
});

test('单个玩家控制实体：泡 = 区格 (200,50) 为中心 ±1 的 3 × 3 = 9 个区格，按格空间分组、(x, y) 升序', () => {
  const engine = make();
  const state = seats(edge('npc_a'));
  const view = bubbleView(engine, state);
  assert.equal(view.length, 1);
  assert.equal(view[0].w, 0);
  assert.deepEqual(flat(view), block(199, 201, 49, 51));
  assert.equal(view[0].regions.length, 9);
});

test('inBubble：泡内 9 格为真，泡外一圈为假；格空间号不符为假', () => {
  const engine = make();
  const state = seats(edge('npc_a'));
  for (const [x, y] of [[199, 49], [200, 50], [201, 51], [199, 51], [201, 49]]) assert.equal(inBubble(engine, state, 0, { x, y }), true, `${x},${y}`);
  for (const [x, y] of [[198, 50], [202, 50], [200, 48], [200, 52], [202, 52], [0, 0]]) assert.equal(inBubble(engine, state, 0, { x, y }), false, `${x},${y}`);
  assert.equal(inBubble(engine, state, 1, { x: 200, y: 50 }), false);
});

test('没有玩家控制实体（无席位边）时泡为空，inBubble 恒假（A27-1.12 末句）', () => {
  const engine = make();
  assert.deepEqual(bubbleView(engine, {}), []);
  assert.deepEqual(bubbleView(engine, { holdings: {} }), []);
  assert.equal(inBubble(engine, {}, 0, { x: 200, y: 50 }), false);
});

test('已关闭的席位边（terms.until 非空）与别的持有种类的边不算玩家控制（卷九 R9-3.9"在世的玩家席位边"）', () => {
  const engine = make();
  // 现役 = until 为空或晚于当刻（卷十八 R18-1.10 :526）；已关闭的边 until 不晚于当刻，故状态时钟取 60 分钟。
  const closed = { ...seats(edge('npc_a', { terms: { since: 0, until: 60 } })), clock: { minute: 60 } };
  assert.deepEqual(bubbleView(engine, closed), []);
  const other = seats(edge('npc_a', { kind: 'hk_other' }));
  assert.deepEqual(bubbleView(engine, other), []);
  assert.equal(inBubble(engine, closed, 0, { x: 200, y: 50 }), false);
});

test('两个玩家控制实体：泡是两个 3 × 3 的并，重叠区格不重复（区格 (200,50) 与 (202,50)：x 199–203、y 49–51 共 15 格）', () => {
  const engine = make({ a: at(200, 50), b: at(202, 50) });
  const state = seats(edge('npc_a'), edge('npc_b'));
  const view = bubbleView(engine, state);
  assert.deepEqual(flat(view), block(199, 203, 49, 51));
  assert.equal(view[0].regions.length, 15);
  assert.equal(inBubble(engine, state, 0, { x: 203, y: 51 }), true);
  assert.equal(inBubble(engine, state, 0, { x: 204, y: 50 }), false);
});

test('外包框之外的区格不算：控制实体在角上区格 (0,0)，泡只剩 x 0–1、y 0–1 共 4 格（R27-1.12 范围）', () => {
  const engine = make({ a: at(0, 0) });
  const state = seats(edge('npc_a'));
  assert.deepEqual(flat(bubbleView(engine, state)), ['0:0,0', '0:0,1', '0:1,0', '0:1,1']);
  assert.equal(inBubble(engine, state, 0, { x: -1, y: 0 }), false);
  assert.equal(inBubble(engine, state, 0, { x: 0, y: -1 }), false);
  assert.equal(inBubble(engine, state, 0, { x: 1, y: 1 }), true);
});

test('外包框另一端：区格 (299,99) 的泡只剩 x 298–299、y 98–99 共 4 格', () => {
  const engine = make({ a: at(299, 99) });
  const state = seats(edge('npc_a'));
  assert.deepEqual(flat(bubbleView(engine, state)), ['0:298,98', '0:298,99', '0:299,98', '0:299,99']);
  assert.equal(inBubble(engine, state, 0, { x: 300, y: 99 }), false);
});

test('半径只取规则表：bubbleRadiusRegionCells = 2 时泡是 5 × 5 = 25 格，= 4 时是 9 × 9 = 81 格；表值改了泡跟着变，代码不另有数', () => {
  const state = seats(edge('npc_a'));
  const e2 = make({ radius: 2 });
  assert.deepEqual(flat(bubbleView(e2, state)), block(198, 202, 48, 52));
  assert.equal(inBubble(e2, state, 0, { x: 202, y: 52 }), true);
  assert.equal(inBubble(e2, state, 0, { x: 203, y: 50 }), false);
  const e4 = make({ radius: 4 });
  assert.equal(bubbleView(e4, state)[0].regions.length, 81);
});

test('不同格空间各自成泡：玩家控制实体所在格空间 w 不存在时（无外包框）泡里没有这个空间的区格', () => {
  const engine = make({ a: at(200, 50, 7) });
  const state = seats(edge('npc_a'));
  assert.deepEqual(bubbleView(engine, state), []);
  assert.equal(inBubble(engine, state, 7, { x: 200, y: 50 }), false);
  assert.equal(inBubble(engine, state, 0, { x: 200, y: 50 }), false);
});

test('只由状态算出：两次调用结果逐项相同；改玩家控制实体的位置与登记以外的任何状态，泡不变（A27-1.12）', () => {
  const engine = make();
  const state = seats(edge('npc_a'));
  const first = JSON.stringify(bubbleView(engine, state));
  assert.equal(JSON.stringify(bubbleView(engine, state)), first);
  const touched = { ...state, clock: { minute: 99999 }, accounts: { x: 1 }, statuses: { y: 2 } };
  assert.equal(JSON.stringify(bubbleView(engine, touched)), first);
  // 登记变动（再开一条席位边）才改泡：npc_b 同在区格 (200,50)，并集不变；换到别处的实体才变——见两人用例。
  assert.equal(JSON.stringify(bubbleView(engine, seats(edge('npc_a'), edge('npc_b')))), first);
});

test('泡不落盘：调用不改 state，返回值是冻结对象', () => {
  const engine = make();
  const state = seats(edge('npc_a'));
  const before = JSON.stringify(state);
  const view = bubbleView(engine, state);
  assert.equal(JSON.stringify(state), before);
  assert.ok(Object.isFrozen(view) && Object.isFrozen(view[0]) && Object.isFrozen(view[0].regions));
});

test('没有"不限"一类特殊值放行：规则表缺 simTiers、缺 rules.control.seatKind、半径为 0 或非整数，一律抛 E-RULES-UNREGISTERED，不返回空泡也不返回全泡', () => {
  const state = seats(edge('npc_a'));
  const ok = make();
  const noTable = { ...ok, rules: Object.fromEntries(Object.entries(ok.rules).filter(([k]) => k !== 'simTiers')) };
  const noSeat = { ...ok, rules: Object.fromEntries(Object.entries(ok.rules).filter(([k]) => k !== 'control')) };
  for (const eng of [noTable, noSeat, make({ radius: 0 }), make({ radius: -1 }), make({ radius: null }), make({ radius: 'unlimited' }), make({ radius: 1.5 })]) {
    assert.throws(() => bubbleView(eng, state), (e) => e.code === 'E-RULES-UNREGISTERED');
    assert.throws(() => inBubble(eng, state, 0, { x: 200, y: 50 }), (e) => e.code === 'E-RULES-UNREGISTERED');
  }
});

test('inBubble 的区格实参不合（缺失、非整数、NaN）拒收 E-DIM-STRUCT-FIELD，不当作泡外也不当作泡内', () => {
  const engine = make();
  const state = seats(edge('npc_a'));
  for (const bad of [undefined, null, {}, { x: 200 }, { x: 1.5, y: 50 }, { x: NaN, y: 50 }, { x: '200', y: 50 }]) {
    assert.throws(() => inBubble(engine, state, 0, bad), (e) => e.code === 'E-DIM-STRUCT-FIELD', JSON.stringify(bad));
  }
  assert.throws(() => inBubble(engine, state, 0.5, { x: 200, y: 50 }), (e) => e.code === 'E-DIM-STRUCT-FIELD');
});

// ---------- G9 第一步：卷九 R9-3.9 玩家席位边登记（rules.control.seatKind 与 hk_player_seat 行） ----------

test('rules.control.seatKind 登记为 ref vocab holding_kind，真实值指向 hk_player_seat 行（卷九 §2.5 :321、R9-3.9 :721）', () => {
  const read = readRules(ROOT);
  assert.deepEqual(read.errors, []);
  assert.equal(read.rules.control.seatKind, 'hk_player_seat');
  const row = loadWorld(ROOT).vocab.families.get('holding_kind').entries[read.rules.control.seatKind];
  assert.ok(row, 'seat kind row exists in holding_kind family');
});

test('hk_player_seat 种类行列值照 R9-3.9 原文：bodyControl、intimate 假，grants 空，exclusive 真，gone/vacated/defected 都 ho_close，subjectEnd send_close，三传导系数 0，pins pside_none，visibility members，端类型 agent→agent', () => {
  const row = loadWorld(ROOT).vocab.families.get('holding_kind').entries.hk_player_seat;
  assert.deepEqual([row.from, row.to], [['agent'], ['agent']]);
  assert.deepEqual([row.bodyControl, row.intimate, row.exclusive], [false, false, true]);
  assert.deepEqual(row.grants, []);
  assert.deepEqual([row.gone, row.vacated, row.defected, row.subjectEnd], ['ho_close', 'ho_close', 'ho_close', 'send_close']);
  assert.deepEqual([row.concluded, row.functional, row.membership, row.headship, row.carriesRel], [false, false, false, false, false]);
  assert.deepEqual([row.conduct, row.conductBack, row.adopt], [0, 0, 0]);
  assert.deepEqual([row.pins, row.visibility], ['pside_none', 'members']);
});

test('seatKind 指向不存在的持有种类、非代号、空、null 一律加载失败（ref 校验，无放行值）', () => {
  const reg = JSON.parse(readFileSync(join(ROOT, 'world/rules/registry.json'), 'utf8'));
  const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
  const expect = [['hk_no_such', 'E-DIM-REF-MISSING'], ['item_x', 'E-DIM-REF-MISSING'], [5, 'E-DIM-ID-FORMAT'], ['', 'E-DIM-ID-FORMAT'], [null, 'E-DIM-DOMAIN-RANGE']];
  for (const [bad, code] of expect) {
    const tmp = testTempRoot('control-rules-');
    try {
      writeUnderTempRoot(tmp, 'registry.json', real('registry.json'));
      for (const row of reg.rows) writeUnderTempRoot(tmp, row.file, row.code === 'control' ? JSON.stringify({ rows: [{ key: 'seatKind', value: bad, basis: 'test' }] }) : real(row.file));
      const r = loadWorld(ROOT, { rulesDir: tmp });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.deepEqual(r.errors.filter((e) => e.severity === 'error').map((e) => e.code), [code], JSON.stringify(bad));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
});

test('真实规则表的席位种类直接可用：不覆盖 rules.control，按 hk_player_seat 边算泡，不抛 E-RULES-UNREGISTERED', () => {
  const { engine } = buildPersonWorld((f) => { f.personRows.npc_a = personRow({ pos: at(200, 50) }); });
  assert.equal(engine.rules.control.seatKind, 'hk_player_seat');
  const state = seats(edge('npc_a', { kind: 'hk_player_seat' }));
  assert.deepEqual(flat(bubbleView(engine, state)), block(199, 201, 49, 51));
  assert.equal(inBubble(engine, state, 0, { x: 200, y: 50 }), true);
});
