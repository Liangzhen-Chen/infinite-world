// 格子迁移 G10 余下《现场泡展开收起》卡内测试（对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 61–65 行、#76 的本机冒烟；待定 6、11）。
// 卷文依据：卷二十七 R27-1.13 :313–:318（展开时机、步骤、落格、落不下记 E-GRID-LAND-UNKNOWN）、R27-1.14 :319（收起）、R27-1.16 :325–:327（回场对账）、
// A27-1.13 :371（展开收起与切分无关）、A27-1.14 :372（回场对账）；卷五 规则 17 :513（展开恒同）、§4.5 规则 6 :745–:747、:762（坠落与挤出）；
// 展开落格以卷十七 §3.3 :297–:304 与 C17-18 为准（已定：主会话 11-22）：给位置，目标格可立足即落它，否则 landSearchRadiusCells 内直线最近的可立足格，并列格序号字典序最小，与卷五挤出同一取法。
// 前提都在测试里造（夹具见 tests/kernel/bubble-world.mjs）：格空间 w0 是 12 × 3 区格（区格边长 100 细格，cellM 1 m、storeyM 3 m），地表层 0（z=1 是站立层），泡半径取真实规则表首值 1，
// 区格 (0,1) 的泡是区格 x 0–1、y 0–2（框内的 3 × 3 被外包框截成 2 × 3，共 6 格）；个体用 state.created 的偏离行造。期望值按卷文手算成字面量（推算写在用例里）。
// 只跑不推进世界的小检查（本机 F 盘）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE as E1, pos, fresh, withRules } from './bubble-world.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { gridView } from '../../server-plugin/kernel/place.mjs';
import { alterCells } from '../../server-plugin/grid-diff.mjs';
import { bubbleView } from '../../server-plugin/sim-tiers.mjs';
import { bubbleDelta, bubbleTransition } from '../../server-plugin/bubble.mjs';

const GRID_FILE = { node: 'alterCells', file: 'grid-diff.mjs' };
const at = (cx, cy) => pos(cx * 100 + 50, cy * 100 + 50); // 区格 (cx, cy) 的中心细格，站立层 z=1
const coarse = (x, y, z = 0) => pos(x, y, z, 0, true);
const regionList = (rs) => rs.map((r) => `${r.w}:${r.x},${r.y}`);
// 截获内核报告出口（告警日志）。
function captured(fn) {
  const logs = [];
  const prev = useReportSink((rec) => logs.push({ code: rec.code, fields: { ...rec.fields } }));
  try { fn(); } finally { useReportSink(prev); }
  return logs;
}

// ---------- 泡之差（R27-1.13 时机、R27-1.14 先收起后展开的区格集合） ----------

test('泡之差：席位个体 npc_p（区格 (0,1)）→ npc_e（区格 (1,1)）：泡由 x 0–1 变 x 0–2（y 0–2 都在框内），展开恰是 x=2 的三格，收起为空；反向反之；各按 (w, x, y) 升序', () => {
  const s = fresh({ npc_p: at(0, 1), npc_e: at(1, 1) }, 'npc_p');
  const t = fresh({ npc_p: at(0, 1), npc_e: at(1, 1) }, 'npc_e');
  const a = bubbleView(E1, s);
  const b = bubbleView(E1, t);
  // 手算：r=1，npc_p 的区格 (0,1) → x −1..1 取框内 0..1、y 0..2 共 6 格；npc_e 的区格 (1,1) → x 0..2、y 0..2 共 9 格。
  assert.equal(a[0].regions.length, 6);
  assert.equal(b[0].regions.length, 9);
  const fwd = bubbleDelta(a, b);
  assert.deepEqual(regionList(fwd.expand), ['0:2,0', '0:2,1', '0:2,2']);
  assert.deepEqual(fwd.collapse, []);
  const back = bubbleDelta(b, a);
  assert.deepEqual(regionList(back.collapse), ['0:2,0', '0:2,1', '0:2,2']);
  assert.deepEqual(back.expand, []);
});

test('泡之差：泡整个跳到区格 (7,1)（x 6–8、y 0–2）：旧的 6 格全收起、新的 9 格全展开，互不相交；泡没变则两表皆空', () => {
  const near = bubbleView(E1, fresh({ npc_p: at(0, 1) }, 'npc_p'));
  const far = bubbleView(E1, fresh({ npc_p: at(7, 1) }, 'npc_p'));
  const d = bubbleDelta(near, far);
  assert.deepEqual(regionList(d.collapse), ['0:0,0', '0:0,1', '0:0,2', '0:1,0', '0:1,1', '0:1,2']);
  assert.deepEqual(regionList(d.expand), ['0:6,0', '0:6,1', '0:6,2', '0:7,0', '0:7,1', '0:7,2', '0:8,0', '0:8,1', '0:8,2']);
  assert.deepEqual(bubbleDelta(near, near), { collapse: [], expand: [] });
  assert.deepEqual(bubbleDelta([], near).expand.length, 6); // 无泡到有泡：全展开
  assert.deepEqual(bubbleDelta(near, []).collapse.length, 6); // 有泡到无泡：全收起
});

// ---------- 展开：落格与可立足核对（R27-1.13 第 2 步；落格取法照卷十七 §3.3 :297–:304、C17-18） ----------

// 玩家席位个体 npc_p 在区格 (0,1)；之后席位交给 npc_e（区格 (1,1)），泡向东扩一列，区格 (2,0)、(2,1)、(2,2) 展开。
function expandScene(persons) {
  const s = fresh({ npc_p: at(0, 1), npc_e: at(1, 1), ...persons }, 'npc_p');
  const before = bubbleView(E1, s);
  return { s, before, swap: () => { s.holdings = fresh({}, 'npc_e').holdings; } };
}

test('展开落格（卷十七 :297–:304）：coarse 个体给位置，落到半径内直线最近的可立足格——(250,150,0) 是地表土，正上方 (250,150,1) 的 d² = (1×3 m)² = 9，水平邻格在 z=0 是土不可立足、在 z=1 的 d² = 1+9 = 10，故落 (250,150,1)；不用哈希，同输入同落点，与世界分钟无关', () => {
  const { s, before, swap } = expandScene({ npc_c: coarse(250, 150) });
  swap();
  const r = bubbleTransition(E1, s, before);
  assert.deepEqual(regionList(r.expand), ['0:2,0', '0:2,1', '0:2,2']);
  assert.deepEqual(r.collapse, []);
  assert.deepEqual(r.moves, [{ subject: 'npc_c', w: 0, region: { x: 2, y: 1 }, from: coarse(250, 150), outcome: 'land', to: { w: 0, x: 250, y: 150, z: 1, coarse: false } }]);
  assert.deepEqual(bubbleTransition(E1, s, before), r);
  s.clock.minute = 99999;
  assert.deepEqual(bubbleTransition(E1, s, before), r, '落格不带时刻、种子键');
});

test('展开落格：目标格本身可立足即落它（泡外写成 coarse 的站立层位置）；并列取格序号字典序最小——(250,150,1) 的格被差分填成石料后，d² = 1 的四邻 (249,150,1)、(250,149,1)、(250,151,1)、(251,150,1) 并列，取 x 最小的 (249,150,1)', () => {
  const { s, before, swap } = expandScene({ npc_a: coarse(250, 160, 1), npc_b: coarse(250, 150, 1) });
  assert.deepEqual(runTransaction(s, GRID_FILE, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(250, 150, 1), material: 'mat_granite', fixture: null, mark: null }], cause: { actor: 'npc_p' } })), { ok: true });
  swap();
  const r = bubbleTransition(E1, s, before);
  assert.deepEqual(r.moves.map((m) => [m.subject, m.outcome, m.to.x, m.to.y, m.to.z]), [['npc_a', 'land', 250, 160, 1], ['npc_b', 'land', 249, 150, 1]]);
});

test('展开次序：区格按 (w, x, y) 字典序、区格内个体按 id 码点序——npc_z 在 (2,0)，npc_b、npc_m 在 (2,1)，npc_a 在 (2,2)，次序是 npc_z、npc_b、npc_m、npc_a（不是 id 序）', () => {
  const { s, before, swap } = expandScene({ npc_z: coarse(250, 50), npc_m: coarse(250, 150), npc_b: coarse(260, 150), npc_a: coarse(250, 250) });
  swap();
  const r = bubbleTransition(E1, s, before);
  assert.deepEqual(r.moves.map((m) => m.subject), ['npc_z', 'npc_b', 'npc_m', 'npc_a']);
  assert.ok(r.moves.every((m) => m.outcome === 'land' && m.to.coarse === false));
});

test('展开只管新进泡的区格里的个体：区格 (0,1)、(1,1) 里的个体（本来就在泡内）和区格 (5,1)（泡外）里的个体都没有项；没有位置的个体跳过', () => {
  const { s, before, swap } = expandScene({ npc_old: coarse(50, 50), npc_far: coarse(550, 150), npc_nopos: null, npc_new: coarse(250, 150) });
  swap();
  assert.deepEqual(bubbleTransition(E1, s, before).moves.map((m) => m.subject), ['npc_new']);
});

test('落不下（半径内没有可立足格，个体在 z=−10 的岩里）：个体位置不改（项里 to 为空、from 原样）、仍 coarse，并记一条 E-GRID-LAND-UNKNOWN（告警、字段只有区格序号）；同批别的个体照常落格', () => {
  const { s, before, swap } = expandScene({ npc_rock: coarse(250, 150, -10), npc_ok: coarse(260, 150) });
  swap();
  let r;
  const logs = captured(() => { r = bubbleTransition(E1, s, before); });
  assert.deepEqual(logs, [{ code: 'E-GRID-LAND-UNKNOWN', fields: { space: 0, rx: 2, ry: 1 } }]);
  assert.deepEqual(r.moves.map((m) => [m.subject, m.outcome]), [['npc_ok', 'land'], ['npc_rock', 'unknown']]);
  assert.equal(r.moves[1].to, null);
  assert.deepEqual(r.moves[1].from, coarse(250, 150, -10));
  assert.deepEqual(s.created.npc_rock.props.pos, coarse(250, 150, -10), '本函数不写位置');
});

test('展开时核可立足（卷五 §4.5 规则 6）：泡外期间泡内行为者在区格 (2,1) 写了差分——(250,150,1) 变花岗岩，站在上面的人挤出到半径内最近的可立足格 (249,150,1)（手算：d²=1 的四邻同在 z=1，并列取 x 最小）；悬空者坠落；站稳者无项', () => {
  const { s, before, swap } = expandScene({ npc_f: pos(250, 150, 1), npc_g: pos(250, 160, 3), npc_h: pos(250, 170, 1) });
  // npc_p 在泡内，写泡外的格照写（R27-1.15 第 3 项）。
  assert.deepEqual(runTransaction(s, GRID_FILE, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(250, 150, 1), material: 'mat_granite', fixture: null, mark: null }], cause: { actor: 'npc_p' } })), { ok: true });
  swap();
  const r = bubbleTransition(E1, s, before);
  // 手算：npc_g (250,160,3) 的格是空气、下方 z=2 也是空气，落到 z=1：落差 (3−1) 层 × storeyM 3 m = 6 m。
  assert.deepEqual(r.moves.map((m) => [m.subject, m.outcome]), [['npc_f', 'extrude'], ['npc_g', 'fall']]);
  assert.deepEqual(r.moves[0].to, { w: 0, x: 249, y: 150, z: 1, coarse: false });
  assert.deepEqual(r.moves[1].to, { w: 0, x: 250, y: 160, z: 1, coarse: false });
  assert.equal(r.moves[1].dropM, 6);
});

// ---------- 收起：状态上无写（R27-1.14） ----------

test('收起：泡退回后只给出区格表；状态逐位不变，差分原样留存，个体 pos 不降精度（细格位置仍是细格、coarse 位置仍是 coarse）', () => {
  const persons = { npc_p: at(0, 1), npc_e: at(1, 1), npc_fine: pos(250, 170, 1), npc_coarse: coarse(250, 250) };
  const s = fresh(persons, 'npc_e');
  runTransaction(s, GRID_FILE, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(250, 170, 0), material: 'mat_air', fixture: null, mark: null }], cause: { actor: 'npc_e' } }));
  const before = bubbleView(E1, s); // x 0–2（9 格），区格 (2,*) 在泡内
  const stateBefore = JSON.stringify(s);
  const viewBefore = JSON.stringify(gridView(E1, s, { w: 0, cells: { x0: 249, y0: 169, z0: -1, x1: 251, y1: 171, z1: 2 } }));
  s.holdings = fresh({}, 'npc_p').holdings; // 泡退回区格 (0,1)：x 0–1
  const r = bubbleTransition(E1, s, before);
  assert.deepEqual(regionList(r.collapse), ['0:2,0', '0:2,1', '0:2,2']);
  assert.deepEqual(r.expand, []);
  assert.deepEqual(r.moves, []);
  const stateAfter = JSON.stringify({ ...s, holdings: fresh({}, 'npc_e').holdings });
  assert.equal(stateAfter, stateBefore, '除席位登记外，状态逐位不变（收起不写任何东西）');
  assert.equal(JSON.stringify(gridView(E1, s, { w: 0, cells: { x0: 249, y0: 169, z0: -1, x1: 251, y1: 171, z1: 2 } })), viewBefore, '收起后差分仍在，gridView 读同样的内容');
  assert.equal(s.created.npc_fine.props.pos.coarse, false);
  assert.equal(s.created.npc_coarse.props.pos.coarse, true);
});

test('收起与展开同一笔：泡由区格 (0,1) 跳到 (7,1)——collapse 的 6 格排在 expand 的 9 格之前给出（先收起后展开），且展开里只含新泡的区格', () => {
  const s = fresh({ npc_p: at(0, 1), npc_far: coarse(750, 50) }, 'npc_p');
  const before = bubbleView(E1, s);
  s.created.npc_p.props.pos = at(7, 1);
  const r = bubbleTransition(E1, s, before);
  assert.equal(r.collapse.length, 6);
  assert.equal(r.expand.length, 9);
  assert.deepEqual(Object.keys(r), ['collapse', 'expand', 'moves']); // 先收起后展开：次序固定
  assert.deepEqual(r.moves.map((m) => [m.subject, m.region]), [['npc_far', { x: 7, y: 0 }]]);
});

// ---------- 时机与同笔事务（R27-1.13 时机） ----------

test('读档不是展开时机：状态 JSON 往返后，以现有泡为 before 调用，收起、展开、项全为空；泡由状态照样算出，与读档前逐格相同', () => {
  const s = fresh({ npc_p: at(0, 1), npc_c: coarse(150, 50) }, 'npc_p');
  const reloaded = JSON.parse(JSON.stringify(s));
  assert.deepEqual(bubbleView(E1, reloaded), bubbleView(E1, s));
  assert.deepEqual(bubbleTransition(E1, reloaded, bubbleView(E1, reloaded)), { collapse: [], expand: [], moves: [] });
});

test('同一笔事务：展开出错（没登记 landSearchRadiusCells）抛带登记码的错，事务整笔回滚——同一事务里先写的差分不留；不报成功', () => {
  const noRadius = withRules(E1, { grid: Object.fromEntries(Object.entries(E1.rules.grid).filter(([k]) => k !== 'landSearchRadiusCells')) });
  const s = fresh({ npc_p: at(0, 1), npc_e: at(1, 1), npc_c: coarse(250, 150) }, 'npc_p');
  const before = bubbleView(noRadius, s);
  const r = runTransaction(s, GRID_FILE, (st) => {
    alterCells(noRadius, st, { w: 0, changes: [{ pos: pos(50, 150, 0), material: 'mat_air', fixture: null, mark: null }], cause: { actor: 'npc_p' } });
    st.holdings = fresh({}, 'npc_e').holdings;
    bubbleTransition(noRadius, st, before);
  });
  assert.deepEqual(r, { ok: false, code: 'E-RULES-UNREGISTERED' });
  assert.equal(gridView(E1, s, { w: 0, cells: { x0: 50, y0: 150, z0: 0, x1: 50, y1: 150, z1: 0 } }).cells[0].material, 'mat_soil', '差分随整笔回滚，格仍读基底（土）');
});

// ---------- 展开收起与切分无关、展开恒同、回场对账（A27-1.13、A27-1.14、规则 17） ----------

// 走出→推进 30 世界日（按给定切分）→走回，返回走回那一刻的计划与最终状态摘要；splits 是推进的分段（分钟数）。
function outAndBack(splits, { roundTrip }) {
  const s = fresh({ npc_p: at(1, 1), npc_c: coarse(150, 50), npc_old: coarse(750, 50) }, 'npc_p');
  const view = (st) => JSON.stringify(gridView(E1, st, { w: 0, cells: { x0: 140, y0: 40, z0: -1, x1: 160, y1: 60, z1: 2 } }));
  const gridBefore = view(s);
  let b = bubbleView(E1, s);
  s.created.npc_p.props.pos = at(7, 1); // 走出：泡到 (7,1)
  const out = bubbleTransition(E1, s, b);
  let cur = s;
  for (const m of splits) {
    cur.clock.minute += m;
    if (roundTrip) cur = JSON.parse(JSON.stringify(cur)); // 中途存盘读档
  }
  b = bubbleView(E1, cur);
  cur.created.npc_p.props.pos = at(1, 1); // 走回
  const back = bubbleTransition(E1, cur, b);
  return { out, back, state: JSON.stringify(cur), gridBefore, gridAfter: view(cur) };
}

test('A27-1.13 切分无关：走出、推进 30 个世界日（43200 分钟）、走回；一次推进、按 10+20 日分两段、按 7 段并中途存盘读档，三种走法的展开计划、收起表与最终状态完全相同', () => {
  const DAY = 1440;
  const one = outAndBack([30 * DAY], { roundTrip: false });
  const two = outAndBack([10 * DAY, 20 * DAY], { roundTrip: true });
  const seven = outAndBack([1 * DAY, 2 * DAY, 3 * DAY, 4 * DAY, 5 * DAY, 6 * DAY, 9 * DAY], { roundTrip: true });
  assert.deepEqual(two.out, one.out);
  assert.deepEqual(seven.out, one.out);
  assert.deepEqual(two.back, one.back);
  assert.deepEqual(seven.back, one.back);
  assert.equal(two.state, one.state);
  assert.equal(seven.state, one.state);
  // 手算：npc_p 在 (1,1)，泡 x 0–2、y 0–2 共 9 格；走出后泡 x 6–8、y 0–2 共 9 格，两泡不相交；走回时 x 6–8 的 9 格收起、x 0–2 的 9 格展开。
  assert.equal(one.back.collapse.length, 9);
  assert.equal(one.back.expand.length, 9);
  // npc_c 在区格 (1,0) 里（x 0–2 之内），走回展开时落格；种子键里的时刻是走回的那一刻 1234 + 43200 = 44434。
  assert.deepEqual(one.back.moves.map((m) => [m.subject, m.outcome]), [['npc_c', 'land']]);
});

test('展开恒同：同一区格收起再展开，gridView 逐格相同（基底只由生成输入、当日有效输入与差分决定，与在不在泡里无关）', () => {
  const r = outAndBack([30 * 1440], { roundTrip: false });
  assert.equal(r.gridAfter, r.gridBefore);
});

test('回场对账：泡外期间建筑行变了（小屋 bld_a 由 1 层改 2 层），展开时现场按当前的行派生——二层外墙格 (20,120,2) 在现场是墙；离开前它是空气。不读"离开时的样子"', () => {
  const s = fresh({ npc_p: at(0, 1) }, 'npc_p');
  const cell = (st, z) => gridView(E1, st, { w: 0, cells: { x0: 20, y0: 120, z0: z, x1: 20, y1: 120, z1: z } }).cells[0];
  assert.equal(cell(s, 1).material, 'mat_granite'); // 一层的外墙角
  assert.equal(cell(s, 2).material, 'mat_air'); // 一层屋顶之上无墙
  const before = bubbleView(E1, s);
  s.created.npc_p.props.pos = at(7, 1); // 走出
  const out = bubbleView(E1, s);
  s.created.bld_a = { props: { storeys: 2 } }; // 离屏期间的建筑行变化（账上"盖高了"）
  s.created.npc_p.props.pos = at(0, 1); // 走回
  const r = bubbleTransition(E1, s, out);
  assert.deepEqual(regionList(r.expand), regionList(bubbleDelta(out, before).expand));
  assert.equal(cell(s, 2).material, 'mat_granite', '展开后现场的二层外墙在');
});
