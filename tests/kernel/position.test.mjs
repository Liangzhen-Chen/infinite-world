// 格子迁移 G12《位置写者 placeSubject》卡内测试（对照表 docs/迁移体检/格子G12-G16-规矩检查对照.md #1–#9、#11–#14、#16、#19、#86、#88；李白 11-23 裁定：人在液体格按卷五 :761 字面沉到下方第一个可立足格）。
// 卷文依据：卷十七 §3.3 :288–:306（placeSubject 三种 target、先定目标格再定精度最后写、朝向、同事务）、§3.4 :310–:316（whereOf）；卷二十七 R27-1.12 :311（判泡读写入之后的泡、玩家实体恒落细格）、
// R27-1.13 :313–:318（展开）、R27-1.14 ④ :319（收起不降精度）、R27-1.16 :327（rebaseBubble）；卷五 §4.1 规则 12、14（zoneAt、两档精度、落格）、§4.5 规则 6 :759–:762（坠落、挤出）、A5-1.2 :540、A5-5.2 :782。
// 前提都在测试里造（夹具见 tests/kernel/bubble-world.mjs）：格空间 w0 是 12 × 3 区格（区格边长 100 细格，cellM 1 m、storeyM 3 m），地表层 0（z=0 土、z=1 是站立层），泡半径取真实规则表首值 1，
// landSearchRadiusCells 取真实规则表 10（竖向可达 3 层）；席位边直接写进 state.holdings（持有写者不是本卡的事），个体用 state.created 的偏离行造。期望值按卷文手算成字面量（推算写在用例里）。
// 落格里"按 hash(seedKey, 格序号) 最小者"的哈希次序不手算，对应用例核性质（可立足、zoneAt 恰为该地点、同输入同结果）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE as E1, OWNERS, pos, fresh, seats, withRules } from './bubble-world.mjs';
import { installStorage, writePath } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction, runDelegated } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { writeDated } from '../../server-plugin/kernel/dated.mjs';
import { P } from '../../server-plugin/kernel/handles/generated.mjs';
import { advanceHook } from '../../server-plugin/kernel/advance-registry.mjs';
import { installHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';
import { zoneAt, settleCell, landCell, placeView, regionCell, regionOf } from '../../server-plugin/kernel/place.mjs';
import { landOrderKey } from '../../server-plugin/kernel/grid.mjs';
import { diceSeedKey } from '../../server-plugin/kernel/sample.mjs';
import { RELATIVE } from '../../server-plugin/kernel/footprint.mjs';
import { settleKindOf, fallStep, SETTLE } from '../../server-plugin/kernel/grid-base.mjs';
import { alterCells } from '../../server-plugin/grid-diff.mjs';
import { bubbleView } from '../../server-plugin/sim-tiers.mjs';
import { bubbleTransition } from '../../server-plugin/bubble.mjs';
import { placeSubject, applyBubbleTransition, rebaseBubble, whereOf, OUTCOME } from '../../server-plugin/position.mjs';

// 玩家席位边（持有写者的边）的个体被写位置时，内核提交前的持有重算（卷二 §2.6 :505）要有 engine；装一次。
installHoldingEngine(E1);
const POSITION = { node: 'placeSubject', file: 'position.mjs' };
const GRID_FILE = { node: 'alterCells', file: 'grid-diff.mjs' };
const at = (cx, cy) => pos(cx * 100 + 50, cy * 100 + 50); // 区格 (cx, cy) 的中心细格，站立层 z=1
const coarse = (x, y, z = 0) => pos(x, y, z, 0, true);
const cells = (s, id) => s.created[id].props.pos;
const clone = (s) => JSON.parse(JSON.stringify(s));

// 截获内核报告出口（告警日志）。
function captured(fn) {
  const logs = [];
  const prev = useReportSink((rec) => logs.push({ code: rec.code, fields: { ...rec.fields } }));
  try { fn(); } finally { useReportSink(prev); }
  return logs;
}
// 在 position.mjs 的事务里调 placeSubject；返回 {r: 事务结果, out: placeSubject 返回值, logs}。
function place(s, who, target, facing = null, engine = E1, allowFail = false) {
  let out;
  let r;
  const logs = captured(() => { r = runTransaction(s, POSITION, (st) => { out = placeSubject(engine, st, who, target, facing, 'act_test'); }); });
  if (!r.ok && !allowFail) assert.fail(`placeSubject(${who}, ${JSON.stringify(target)}) rejected: ${r.code}`);
  return { r, out, logs };
}
const dig = (p, material) => ({ pos: p, material, fixture: null, mark: null });
const alter = (s, p, material, actor) => runTransaction(s, GRID_FILE, (st) => alterCells(E1, st, { w: 0, changes: [dig(p, material)], cause: { actor } }));

// ---------- #1 写入点只有 position.mjs ----------

test('#1 写者：pos、facing 路径只有 position.mjs 能写——别的文件的事务里直接写、或在别的文件里调 placeSubject，都整笔拒（E-VIEW-UNDECLARED-WRITE），状态逐位不变', () => {
  const s = fresh({ npc_a: at(0, 1) }, null);
  const before = JSON.stringify(s);
  const direct = runTransaction(s, { node: 'x', file: 'death.mjs' }, (st) => writePath(st, P.created_props_pos('npc_a'), at(1, 1)));
  assert.deepEqual(direct, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.equal(place(s, 'npc_a', { pos: at(1, 1) }, null).r.ok, true, '本文件里调则写成');
  const wrong = runTransaction(s, GRID_FILE, (st) => placeSubject(E1, st, 'npc_a', { pos: at(0, 1) }, null, 'act_test'));
  assert.deepEqual(wrong, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.notEqual(JSON.stringify(s), before);
  assert.deepEqual(cells(s, 'npc_a'), coarse(150, 150, 1), '上一笔（泡外）写成 coarse 位置，被拒的那笔没有改它');
});

// ---------- #2 入参：无一能被默认值绕过 ----------

test('#2 入参核对：空、null、两种并给、未知键、settle 非真、地点不存在或不是地点、pos 缺 coarse、种子键配非地点、被安置者不是个体、cause 空、facing 越界，一律拒收，位置逐位不变，不合成默认位置', () => {
  const s = fresh({ npc_a: at(0, 1) }, null);
  const before = JSON.stringify(s);
  const rej = (target, code, who = 'npc_a', facing = null, cause = 'act_test') => {
    let r;
    const logs = captured(() => { r = runTransaction(s, POSITION, (st) => { placeSubject(E1, st, who, target, facing, cause); }); });
    assert.deepEqual(r, { ok: false, code }, JSON.stringify(target));
    assert.deepEqual(logs.filter((l) => l.code !== code), []);
    assert.equal(JSON.stringify(s), before);
  };
  rej(null, 'E-DET-DOMAIN');
  rej(undefined, 'E-DET-DOMAIN');
  rej('loc_a', 'E-DET-DOMAIN');
  rej({}, 'E-DET-DOMAIN');
  rej({ foo: 1 }, 'E-DET-DOMAIN');
  rej({ pos: at(1, 1), place: 'loc_a' }, 'E-DET-DOMAIN');
  rej({ pos: at(1, 1), settle: true }, 'E-DET-DOMAIN');
  rej({ place: 'loc_a', settle: true }, 'E-DET-DOMAIN');
  rej({ settle: false }, 'E-DET-DOMAIN');
  rej({ settle: 1 }, 'E-DET-DOMAIN');
  rej({ pos: at(1, 1), seedKey: 'a'.repeat(64) }, 'E-DET-DOMAIN');
  rej({ place: 'loc_a', seedKey: '' }, 'E-DET-DOMAIN');
  rej({ place: 'loc_nowhere' }, 'E-DIM-REF-MISSING');
  rej({ place: 'npc_a' }, 'E-DIM-REF-MISSING');
  rej({ place: null }, 'E-DIM-REF-MISSING');
  rej({ pos: { w: 0, x: 150, y: 150, z: 1 } }, 'E-DIM-STRUCT-FIELD'); // 缺 coarse
  rej({ pos: { w: 0, x: 150.5, y: 150, z: 1, coarse: false } }, 'E-DIM-STRUCT-FIELD');
  rej({ pos: { ...at(1, 1), extra: 1 } }, 'E-DIM-STRUCT-FIELD');
  rej({ pos: pos(150, 150, 1, 9) }, 'E-DIM-STRUCT-FIELD'); // 格空间 9 不存在
  rej({ pos: pos(-5000, 150, 1) }, 'E-DIM-STRUCT-FIELD'); // 区格在外包框外
  rej({ pos: at(1, 1) }, 'E-DIM-REF-MISSING', 'loc_a');
  rej({ pos: at(1, 1) }, 'E-DIM-REF-MISSING', 'npc_nobody');
  rej({ pos: at(1, 1) }, 'E-DET-DOMAIN', 'npc_a', null, '');
  rej({ pos: coarse(550, 150, 0) }, 'E-DIM-DOMAIN-RANGE', 'npc_a', 8); // facing 越界（八向 [0, 7]）
  rej({ pos: coarse(550, 150, 0) }, 'E-DIM-DOMAIN-RANGE', 'npc_a', -1);
  rej({ pos: coarse(550, 150, 0) }, 'E-DIM-DOMAIN-RANGE', 'npc_a', 1.5);
});

// ---------- #5 #6 #11 #14 玩家实体恒落细格；泡随写入移动并展开；泡外 coarse ----------

test('#5 玩家控制实体（席位边在世）：给 coarse 位置、给不可立足的细格、给可立足细格三种目标都落可立足细格且 coarse 假；写入前后 bubbleView 不同——泡由 x 0–1 变 x 2–4', () => {
  // 手算：npc_p 在区格 (0,1)，泡 r=1 取框内 x 0–1、y 0–2 共 6 格。目标 coarse(350,150,0)：区格 (3,1)；z=0 是土不可立足，(350,150,1) 是土上的空气可立足，
  // 竖向一层 d² = (1 × 3 m)² = 9，水平邻格在 z=0 同为土、在 z=1 的 d² = 1 + 9 = 10，故落 (350,150,1)。
  const s = fresh({ npc_p: at(0, 1) }, 'npc_p');
  const bubbleBefore = JSON.stringify(bubbleView(E1, s));
  const a = place(s, 'npc_p', { pos: coarse(350, 150, 0) });
  assert.equal(a.r.ok, true);
  assert.equal(a.out.outcome, OUTCOME.placed);
  assert.deepEqual(cells(s, 'npc_p'), pos(350, 150, 1));
  assert.equal(cells(s, 'npc_p').coarse, false);
  assert.notEqual(JSON.stringify(bubbleView(E1, s)), bubbleBefore);
  assert.deepEqual(bubbleView(E1, s)[0].regions.map((r) => `${r.x},${r.y}`), ['2,0', '2,1', '2,2', '3,0', '3,1', '3,2', '4,0', '4,1', '4,2']);
  // 不可立足的细格（z=0 的土）与可立足细格（z=1）。
  assert.deepEqual(place(s, 'npc_p', { pos: pos(360, 150, 0) }).out.pos, pos(360, 150, 1));
  assert.deepEqual(place(s, 'npc_p', { pos: pos(360, 150, 1) }).out.pos, pos(360, 150, 1));
  assert.equal(cells(s, 'npc_p').coarse, false);
});

test('#5 席位边不在世：同一个体给同一 coarse 目标——区格 (3,1) 在别人的泡（区格 (0,1) 的泡）之外，原样写目标格并置 coarse 真（不另取代表格），zoneAt 是该处所属地点 loc_root；泡内目标（区格 (1,1)）落可立足细格', () => {
  const s = fresh({ npc_p: at(0, 1), npc_a: at(0, 1) }, 'npc_p');
  const out = place(s, 'npc_a', { pos: coarse(350, 150, 0) });
  assert.equal(out.out.outcome, OUTCOME.placed);
  assert.deepEqual(cells(s, 'npc_a'), coarse(350, 150, 0));
  assert.equal(zoneAt(E1, s, cells(s, 'npc_a')), 'loc_root');
  assert.equal(out.out.bubble, undefined, '非玩家写入不触发展开');
  assert.deepEqual(place(s, 'npc_a', { pos: coarse(150, 150, 0) }).out.pos, pos(150, 150, 1), '区格 (1,1) 在泡内：目标 z=0 的土不可立足，落正上方 (150,150,1)');
});

test('#11 展开触发：玩家控制实体 pos 写入时，写入后同一事务里按项经 placeSubject 写别的个体位置——区格 (4,1) 里的 coarse 个体落到 (450,150,1)；已在细格上的不动；泡外（区格 (7,1)）与 collapse 掉的区格（x 0–1）里的个体不动（收起不降精度）；非玩家写入不触发', () => {
  const s = fresh({ npc_p: at(0, 1), npc_c: coarse(450, 150), npc_old: coarse(50, 50), npc_far: coarse(750, 50), npc_fine: pos(250, 170, 1) }, 'npc_p');
  const r = place(s, 'npc_p', { pos: coarse(350, 150, 0) });
  assert.equal(r.r.ok, true);
  assert.equal(r.out.bubble.expand.length, 9);
  assert.equal(r.out.bubble.collapse.length, 6);
  assert.deepEqual(r.out.bubble.applied.map((x) => [x.subject, x.outcome]), [['npc_c', OUTCOME.placed]]);
  assert.deepEqual(cells(s, 'npc_c'), pos(450, 150, 1));
  assert.deepEqual(cells(s, 'npc_old'), coarse(50, 50), '收起：原地留着的 coarse 个体不降精度、也不动');
  assert.deepEqual(cells(s, 'npc_far'), coarse(750, 50));
  assert.deepEqual(cells(s, 'npc_fine'), pos(250, 170, 1));
  // 非玩家写入：不展开、不改泡（仍是 x 0–1），别的 coarse 个体原样。
  const s2 = fresh({ npc_p: at(0, 1), npc_a: at(0, 1), npc_c: coarse(250, 150) }, 'npc_p');
  place(s2, 'npc_a', { pos: at(1, 1) });
  assert.deepEqual(cells(s2, 'npc_c'), coarse(250, 150), '泡没变，npc_c 在区格 (2,1)（泡外）不动');
});

test('#14 收起后位置不降精度：泡移走后留在原地的个体 pos 仍在细格上；它之后在泡外的移动按目标地点写 coarse 位置——给地点 loc_b（区格 (1,1)，泡外）落代表格 (150,150,0) coarse 真，zoneAt 恰为 loc_b', () => {
  const s = fresh({ npc_p: at(0, 1), npc_n: pos(50, 150, 1) }, 'npc_p');
  place(s, 'npc_p', { pos: coarse(350, 150, 0) }); // 泡移到 x 2–4：npc_n 所在的区格 (0,1) 收起
  assert.deepEqual(cells(s, 'npc_n'), pos(50, 150, 1));
  assert.equal(cells(s, 'npc_n').coarse, false);
  const moved = place(s, 'npc_n', { place: 'loc_b' });
  // 手算：loc_b 的足迹就是区格 (1,1) 一个格（目标面积 10000 m² = 一个区格），代表格是区格中心列地表层：(1×100+50, 1×100+50) = (150,150)，地表层 0。
  assert.deepEqual(moved.out.pos, coarse(150, 150, 0));
  assert.equal(zoneAt(E1, s, cells(s, 'npc_n')), 'loc_b');
});

// ---------- #3 给地点 ----------

test('#3 给地点：泡内（区格 (1,1) 在泡内）落可立足细格、coarse 假、zoneAt 恰为该地点；同输入同落点（同事务时刻、同个体、同种子键）；随地点给的 seedKey 照用', () => {
  const mk = () => fresh({ npc_p: at(0, 1), npc_a: at(0, 1) }, 'npc_p');
  const a = mk();
  const b = mk();
  const ra = place(a, 'npc_a', { place: 'loc_b' }).out;
  const rb = place(b, 'npc_a', { place: 'loc_b' }).out;
  assert.deepEqual(ra, rb);
  assert.equal(ra.pos.coarse, false);
  assert.equal(zoneAt(E1, a, ra.pos), 'loc_b');
  assert.equal(settleCell(E1, a, ra.pos).kind, 'stay');
  const k1 = place(mk(), 'npc_a', { place: 'loc_b', seedKey: 'a'.repeat(64) }).out;
  const k2 = place(mk(), 'npc_a', { place: 'loc_b', seedKey: 'a'.repeat(64) }).out;
  assert.deepEqual(k1, k2);
  assert.equal(zoneAt(E1, a, k1.pos), 'loc_b');
});

test('#8 泡外给地点：落代表格、coarse 真，zoneAt 恰为动作目标地点（含建筑 bld_a——A5-1.2 :540）；给位置原样写目标格，目标格在建筑里 zoneAt 仍是该建筑', () => {
  const s = fresh({ npc_p: at(7, 1), npc_a: at(7, 1) }, 'npc_p'); // 泡在 x 6–8，区格 (0,1) 在泡外
  const g = place(s, 'npc_a', { place: 'bld_a' }).out;
  assert.equal(g.pos.coarse, true);
  assert.equal(zoneAt(E1, s, g.pos), 'bld_a');
  // 给位置：把上面落出的建筑格（zoneAt 为 bld_a，coarse 真）换个个体原样再写一次——泡外所写格就是目标格，不另取代表格，所以 zoneAt 仍是该建筑（卷五 §4.1 规则 12）。
  const t = fresh({ npc_p: at(7, 1), npc_b: at(7, 1) }, 'npc_p');
  const p = place(t, 'npc_b', { pos: g.pos }).out;
  assert.deepEqual(p.pos, g.pos);
  assert.equal(zoneAt(E1, t, p.pos), 'bld_a');
  // 一个区格里压着建筑的地面格：同区格的另一格（区格西南角 (0,100,1)，不在小屋里）zoneAt 是区域 loc_a，两者互不影响。
  assert.equal(zoneAt(E1, t, place(t, 'npc_b', { pos: coarse(0, 100, 1) }).out.pos), 'loc_a');
});

// ---------- #4 就地核立足（坠落、挤出、被埋） ----------

test('#4 就地核立足：泡内细格个体——所在格被差分填成石料则挤出到半径内最近的可立足格 (249,150,1)（d²=1 的四邻并列取 x 最小）；悬空者坠落到 (250,160,1) 落差 (3−1) 层 × 3 m = 6 m；站稳者不动；埋在岩里者被埋、位置不改；泡外与 coarse 位置不做细格结算', () => {
  const s = fresh({ npc_p: at(1, 1), npc_f: pos(250, 150, 1), npc_g: pos(250, 160, 3), npc_h: pos(250, 170, 1), npc_r: pos(250, 180, -10), npc_far: pos(550, 150, 1), npc_c: coarse(250, 190) }, 'npc_p');
  assert.deepEqual(alter(s, pos(250, 150, 1), 'mat_granite', 'npc_p'), { ok: true });
  const f = place(s, 'npc_f', { settle: true });
  assert.equal(f.out.outcome, OUTCOME.extrude);
  assert.deepEqual(cells(s, 'npc_f'), pos(249, 150, 1));
  const g = place(s, 'npc_g', { settle: true });
  assert.equal(g.out.outcome, OUTCOME.fall);
  assert.equal(g.out.dropM, 6);
  assert.deepEqual(cells(s, 'npc_g'), pos(250, 160, 1));
  const before = JSON.stringify(s);
  assert.equal(place(s, 'npc_h', { settle: true }).out.outcome, OUTCOME.stay);
  const r = place(s, 'npc_r', { settle: true });
  assert.equal(r.out.outcome, OUTCOME.buried);
  assert.deepEqual(r.logs, [], '被埋不记 E-GRID-LAND-UNKNOWN（交卷十三、卷四）');
  assert.equal(place(s, 'npc_far', { settle: true }).out.outcome, OUTCOME.outside);
  assert.equal(place(s, 'npc_c', { settle: true }).out.outcome, OUTCOME.outside);
  assert.equal(JSON.stringify(s), before, '站稳、被埋、泡外、coarse：位置都不改');
  assert.deepEqual(place(clone(s), 'npc_f', { settle: true }).out, place(clone(s), 'npc_f', { settle: true }).out, '同一组输入落点唯一');
});

test('卷五 :761 液体格不可立足（李白 11-23 裁定，不写游泳、涉水）：纯规则 settleKindOf——液体格不可立足则坠落（落到下方第一个可立足格），不走挤出；气态同；实体挤出；可立足不动；未知照未知', () => {
  assert.equal(settleKindOf(false, 'liquid'), SETTLE.fall);
  assert.equal(settleKindOf(false, 'gas'), SETTLE.fall);
  assert.equal(settleKindOf(false, 'solid'), SETTLE.extrude);
  assert.equal(settleKindOf(true, 'gas'), SETTLE.stay);
  assert.equal(settleKindOf(null, 'gas'), SETTLE.unknown);
  assert.equal(settleKindOf(false, null), SETTLE.unknown);
  assert.equal(settleKindOf(false, 'plasma'), SETTLE.unknown);
});

// ---------- #7 #12 落不下：E-GRID-LAND-UNKNOWN 只由 placeSubject 记、恰一条 ----------

test('#7 落不下（泡内目标半径内没有可立足格，在 z=−10 的岩里）：位置不改、仍 coarse，报告出口收到恰一条 E-GRID-LAND-UNKNOWN（字段区格序号），由 placeSubject 记', () => {
  const s = fresh({ npc_p: at(1, 1), npc_a: coarse(550, 150) }, 'npc_p');
  const r = place(s, 'npc_a', { pos: coarse(250, 150, -10) });
  assert.equal(r.out.outcome, OUTCOME.unknown);
  assert.deepEqual(r.logs, [{ code: 'E-GRID-LAND-UNKNOWN', fields: { space: 0, rx: 2, ry: 1 } }]);
  assert.deepEqual(cells(s, 'npc_a'), coarse(550, 150), '位置逐位不变');
});

test('#12 展开按项写位置、E-GRID-LAND-UNKNOWN 恰一条且来自 placeSubject：玩家由区格 (0,1) 走到 (1,1)，泡新进区格 x=2 三格；(260,150) 的 npc_ok 落 (260,150,1)，z=−10 岩里的 npc_rock 落不下——位置不变、报告恰一条；次序按区格序号与个体 id 码点序', () => {
  const s = fresh({ npc_p: at(0, 1), npc_rock: coarse(250, 150, -10), npc_ok: coarse(260, 150) }, 'npc_p');
  const r = place(s, 'npc_p', { pos: at(1, 1) });
  assert.equal(r.r.ok, true);
  assert.deepEqual(r.logs, [{ code: 'E-GRID-LAND-UNKNOWN', fields: { space: 0, rx: 2, ry: 1 } }]);
  assert.deepEqual(r.out.bubble.applied.map((x) => [x.subject, x.outcome]), [['npc_ok', OUTCOME.placed], ['npc_rock', 'unknown']]);
  assert.deepEqual(cells(s, 'npc_ok'), pos(260, 150, 1));
  assert.deepEqual(cells(s, 'npc_rock'), coarse(250, 150, -10));
  // bubbleTransition 自己不记：同一输入单独调它，报告为空。
  const s2 = fresh({ npc_p: at(0, 1), npc_rock: coarse(250, 150, -10) }, 'npc_p');
  const before = bubbleView(E1, s2);
  s2.created.npc_p.props.pos = at(1, 1);
  assert.deepEqual(captured(() => bubbleTransition(E1, s2, before)), []);
});

test('#12 展开时的坠落与挤出也经 placeSubject 写 to：泡外期间泡内行为者在区格 (2,1) 写了差分，玩家走近时站在石料上的 npc_f 挤出到 (249,150,1)、悬空的 npc_g 坠落到 (250,160,1)（落差 6 m 带在项里）；被埋者不写位置', () => {
  const s = fresh({ npc_p: at(0, 1), npc_e: at(1, 1), npc_f: pos(250, 150, 1), npc_g: pos(250, 160, 3), npc_r: pos(250, 180, -10) }, 'npc_p');
  // 泡外期间由席位个体 npc_e 当场写差分：先让席位在 npc_e 身上写，再交回（差分对泡外格也照写，卷二十七 R27-1.15 第 3 项）。
  s.holdings = seats('npc_e');
  assert.deepEqual(alter(s, pos(250, 150, 1), 'mat_granite', 'npc_e'), { ok: true });
  s.holdings = seats('npc_p');
  const r = place(s, 'npc_p', { pos: at(1, 1) });
  assert.deepEqual(r.out.bubble.applied.map((x) => [x.subject, x.outcome]), [['npc_f', 'extrude'], ['npc_g', 'fall'], ['npc_r', 'buried']]);
  assert.deepEqual(cells(s, 'npc_f'), pos(249, 150, 1));
  assert.deepEqual(cells(s, 'npc_g'), pos(250, 160, 1));
  assert.equal(r.out.bubble.applied[1].dropM, 6);
  assert.deepEqual(cells(s, 'npc_r'), pos(250, 180, -10));
});

// ---------- #11 #13 事务、时机 ----------

test('#11 同一事务整笔回滚：同一事务里先写一个个体、再写一个非法目标——先写的位置不留；规则表缺 landSearchRadiusCells 时展开出错同样整笔回滚、不报成功', () => {
  const s = fresh({ npc_p: at(0, 1), npc_a: at(0, 1) }, 'npc_p');
  const before = JSON.stringify(s);
  const r = runTransaction(s, POSITION, (st) => {
    placeSubject(E1, st, 'npc_a', { pos: coarse(550, 150, 0) }, null, 'act_test');
    placeSubject(E1, st, 'npc_a', { settle: false }, null, 'act_test');
  });
  assert.deepEqual(r, { ok: false, code: 'E-DET-DOMAIN' });
  assert.equal(JSON.stringify(s), before);
  const noRadius = withRules(E1, { grid: Object.fromEntries(Object.entries(E1.rules.grid).filter(([k]) => k !== 'landSearchRadiusCells')) });
  const t = fresh({ npc_p: at(0, 1), npc_c: coarse(450, 150) }, 'npc_p');
  const tBefore = JSON.stringify(t);
  assert.equal(place(t, 'npc_p', { pos: coarse(350, 150, 0) }, null, noRadius, true).r.ok, false);
  assert.equal(JSON.stringify(t), tBefore);
});

test('#11 读档不是展开时机：状态 JSON 往返后泡照样由状态算出，位置不变；#13 席位边开立、关闭：before 取在改登记前，开立后调 applyBubbleTransition 展开（区格 (2,1) 里的 coarse 个体落格），关闭后只收起、状态不变', () => {
  const s = fresh({ npc_p: at(1, 1), npc_c: coarse(250, 150) }, null);
  assert.deepEqual(bubbleView(E1, clone(s)), []);
  const open = runTransaction(s, POSITION, (st) => {
    const before = bubbleView(E1, st);
    st.holdings = seats('npc_p'); // 席位边开立（持有写者不是本卡的事）
    applyBubbleTransition(E1, st, before, 'act_test');
  });
  assert.equal(open.ok, true);
  assert.deepEqual(cells(s, 'npc_c'), pos(250, 150, 1));
  const keep = JSON.stringify(s);
  const reloaded = clone(s);
  assert.equal(JSON.stringify(reloaded), keep);
  assert.deepEqual(bubbleView(E1, reloaded), bubbleView(E1, s));
  const close = runTransaction(s, POSITION, (st) => {
    const before = bubbleView(E1, st);
    st.holdings = seats(null);
    const t = applyBubbleTransition(E1, st, before, 'act_test');
    assert.equal(t.collapse.length, 9);
    assert.deepEqual(t.expand, []);
    assert.deepEqual(t.applied, []);
  });
  assert.equal(close.ok, true);
  assert.deepEqual(cells(s, 'npc_c'), pos(250, 150, 1), '收起不降精度');
});

// ---------- #18 move 适配器的委托链（原样：primitives-runtime.mjs ADAPTERS.move） ----------

test('#18 move 适配器那一步：在登记的委托方文件（primitives-runtime.mjs）的事务里经 runDelegated 调 position.mjs#placeSubject，目标给地点——泡内落可立足细格、zoneAt 恰为该地点，朝向取走来的方向；展开接线 applyBubbleTransition 同样经委托；别的文件调则没有写权，整笔拒收', () => {
  const via = (s, fn, file = 'primitives-runtime.mjs') => runTransaction(s, { node: 'commit', file }, fn);
  const s = fresh({ npc_p: at(0, 1), npc_a: at(0, 1) }, 'npc_p');
  const moved = via(s, (st) => { runDelegated(st, 'position.mjs#placeSubject', E1, st, 'npc_a', { place: 'loc_b' }, null, 'verb_test_moved'); });
  assert.deepEqual(moved, { ok: true });
  assert.equal(cells(s, 'npc_a').coarse, false);
  assert.equal(zoneAt(E1, s, cells(s, 'npc_a')), 'loc_b');
  assert.equal(s.created.npc_a.props.facing !== undefined, true, '旧位置在区格 (0,1)、新位置在区格 (1,1)，平面不重合：折出朝向');
  const open = via(s, (st) => {
    const before = bubbleView(E1, st);
    st.holdings = seats('npc_a');
    runDelegated(st, 'position.mjs#applyBubbleTransition', E1, st, before, 'verb_test_moved');
  });
  assert.deepEqual(open, { ok: true });
  const keep = JSON.stringify(s);
  assert.deepEqual(via(s, (st) => { runDelegated(st, 'position.mjs#placeSubject', E1, st, 'npc_a', { place: 'loc_a' }, null, 'verb_test_moved'); }, 'death.mjs'), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.equal(JSON.stringify(s), keep);
});

// ---------- #9 朝向 ----------

test('#9 朝向：facing 给了就写它；没给按新旧位置折八向——正东 2、正北 0、东北 1、正南 4、西南 5、正西 6（手算：dx、dy 同为 100 m 时方位角 45°，以朝向 k 为中心宽一档 45°）；平面重合朝向不变；原来没有朝向又折不出则不写', () => {
  const s = fresh({ npc_a: coarse(500, 150, 0) }, null);
  s.created.npc_a.props.facing = 7;
  const go = (p, facing = null) => { const r = place(s, 'npc_a', { pos: p }, facing); assert.equal(r.r.ok, true); return s.created.npc_a.props.facing; };
  assert.equal(go(coarse(600, 150)), 2); // 正东：(500,150) → (600,150)，方位角 90°
  assert.equal(go(coarse(600, 250)), 0); // 正北：方位角 0°
  assert.equal(go(coarse(640, 290)), 1); // 东北：dx = dy = 40 → 45°
  assert.equal(go(coarse(640, 190)), 4); // 正南：180°
  assert.equal(go(coarse(540, 90)), 5); // 西南：dx = dy = −100 → 225°
  assert.equal(go(coarse(440, 90)), 6); // 正西：270°
  assert.equal(go(coarse(440, 90, 1)), 6, '平面重合（只差一层）：朝向不变');
  assert.equal(go(coarse(900, 90), 3), 3, '给了就写它，不管方向');
  assert.equal(RELATIVE[0], 'front', 'position.mjs 的 FRONT 同 kernel/footprint.mjs 的 RELATIVE[0]');
  const t = fresh({ npc_b: coarse(500, 150, 0) }, null); // 原来没有朝向
  assert.equal(place(t, 'npc_b', { pos: coarse(500, 150, 1) }).r.ok, true);
  assert.equal(t.created.npc_b.props.facing, undefined, '没有旧朝向、平面重合：不合成默认朝向');
  assert.equal(place(t, 'npc_b', { pos: coarse(600, 150) }).r.ok, true);
  assert.equal(t.created.npc_b.props.facing, 2);
});

// ---------- #16 rebaseBubble ----------

test('#16 rebaseBubble：钩子登记在 position.mjs；日界当日有效输入有变才动作——区格 (1,1) 的 anchorElevationM 第 8 日起为 3 m（地表层 1）：第 7 日无动作；第 8 日泡内站在 z=1 的人（现在是土）挤出到 (151,150,2)（d²=9），泡外区格的人不动，泡为空无动作，同输入两次逐位相同', () => {
  const entry = advanceHook('rebaseBubble');
  assert.equal(entry.file, 'position.mjs');
  installStorage({
    ...OWNERS,
    writers: [...OWNERS.writers, { pattern: 'dshp.*.*', create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true }],
    pathTypes: { ...OWNERS.pathTypes, 'dshp.*.*': 'list<struct:datedRewrite>' },
    keyKinds: { ...OWNERS.keyKinds, 'dshp.*.*': [['place'], 'dimKey'] },
  });
  try {
    const mk = () => {
      const s = fresh({ npc_p: at(1, 1), npc_f: pos(151, 150, 1), npc_far: pos(551, 150, 1), npc_c: coarse(251, 150, 1) }, 'npc_p');
      s.clock.minute = 5 * 1440;
      for (const id of ['loc_root', 'loc_a', 'loc_b']) {
        assert.deepEqual(runTransaction(s, { node: 'view:shaper', file: 'sys/shaper.mjs' }, (st) => writeDated(E1, st, `dshp.${id}.anchorElevationM`, { fromDay: 8, value: 3, cause: 'evt_quake' })), { ok: true });
      }
      return s;
    };
    const run = (s, day) => { s.clock.minute = day * 1440; let out; const r = runTransaction(s, { node: 'rebaseBubble', file: 'position.mjs' }, (st) => { out = rebaseBubble(E1, st); }); assert.equal(r.ok, true); return out; };
    const s = mk();
    const day7 = run(s, 7);
    assert.deepEqual([day7.changed, day7.settled], [false, []]);
    assert.deepEqual(cells(s, 'npc_f'), pos(151, 150, 1));
    const day8 = run(s, 8);
    assert.equal(day8.changed, true);
    // 手算：第 8 日地表层 floor(3 ÷ 3) = 1，(151,150,1) 是地表土（不可立足、实体）；正上方 (151,150,2) 是站立层，d² = (1 × 3 m)² = 9，同层邻格 z=1 全是土，z=2 邻格 d² = 1 + 9 = 10。
    // 玩家 npc_p 站在 (150,150,1)，同在区格 (1,1)，也是土，同样挤到 (150,150,2)；区格内按个体 id 码点序（npc_f 在 npc_p 前）。
    assert.deepEqual(day8.settled.map((x) => [x.subject, x.outcome]), [['npc_f', 'extrude'], ['npc_p', 'extrude']]);
    assert.deepEqual(cells(s, 'npc_f'), pos(151, 150, 2));
    assert.deepEqual(cells(s, 'npc_p'), pos(150, 150, 2));
    assert.deepEqual(cells(s, 'npc_far'), pos(551, 150, 1), '泡外区格不做');
    assert.deepEqual(cells(s, 'npc_c'), coarse(251, 150, 1), 'coarse 个体不在这里（落格归展开）');
    const s2 = mk();
    run(s2, 8);
    assert.equal(JSON.stringify(s2), JSON.stringify(s), '同输入同结果');
    const empty = mk();
    empty.holdings = seats(null);
    empty.clock.minute = 8 * 1440;
    const none = run(empty, 8);
    assert.deepEqual(none.settled, []);
    assert.deepEqual(cells(empty, 'npc_f'), pos(151, 150, 1), '泡为空无事可做');
  } finally { installStorage(OWNERS); }
});

// ---------- #86 whereOf ----------

test('#86 whereOf：个体取 zoneAt(pos) 与 pos；地点行取自身、pos 为空；没有位置的个体返回空；链走不到地点行（id 不存在；物品的承载链这一环现在读不了，见函数文档的"未落"）返回空并报 E-TRIP-LEG', () => {
  const s = fresh({ npc_a: at(1, 1), npc_nopos: null }, null);
  s.created.item_lost = { props: {} };
  assert.deepEqual(whereOf(E1, s, 'npc_a'), { place: 'loc_b', pos: at(1, 1), chain: ['npc_a'] });
  assert.deepEqual(whereOf(E1, s, 'loc_a'), { place: 'loc_a', pos: null, chain: ['loc_a'] });
  assert.deepEqual(whereOf(E1, s, 'npc_nopos'), { place: null, pos: null, chain: ['npc_nopos'] });
  let lost;
  const logs = captured(() => { lost = whereOf(E1, s, 'item_lost'); });
  assert.deepEqual(lost, { place: null, pos: null, chain: ['item_lost'] });
  assert.deepEqual(logs.map((l) => l.code), ['E-TRIP-LEG']);
  const nobody = captured(() => whereOf(E1, s, 'npc_nobody'));
  assert.deepEqual(nobody.map((l) => l.code), ['E-TRIP-LEG']);
});

// ---------- #19 不变量 ----------

test('#19 不变量：一串落位之后，每名个体的 zoneAt(pos) 是一个地点行；泡外写入的 pos coarse 为真；玩家控制实体 pos 恒在细格上；泡移走后留下的个体与玩家实体都核', () => {
  const s = fresh({ npc_p: at(0, 1), npc_a: at(0, 1), npc_b: coarse(750, 150), npc_n: pos(50, 150, 1) }, 'npc_p');
  place(s, 'npc_a', { place: 'bld_a' });
  place(s, 'npc_b', { place: 'loc_c' });
  place(s, 'npc_p', { pos: coarse(350, 150, 0) });
  place(s, 'npc_a', { pos: coarse(1050, 150, 0) });
  for (const id of ['npc_p', 'npc_a', 'npc_b', 'npc_n']) assert.notEqual(zoneAt(E1, s, cells(s, id)), null, id);
  assert.equal(cells(s, 'npc_p').coarse, false, '玩家控制实体恒落细格');
  assert.equal(cells(s, 'npc_a').coarse, true, '泡外写入的 pos coarse 为真');
  assert.equal(cells(s, 'npc_b').coarse, true);
  assert.equal(cells(s, 'npc_n').coarse, false, '泡移走后留在原地的个体不降精度');
});

// ---------- 展开接线不重复：改后 bubbleTransition 的纯函数性 ----------

test('bubbleTransition 是只算的纯函数：同一状态两次调用结果逐位相同、状态不变、不写报告', () => {
  const s = fresh({ npc_p: at(0, 1), npc_e: at(1, 1), npc_c: coarse(250, 150) }, 'npc_p');
  const before = bubbleView(E1, s);
  s.holdings = seats('npc_e');
  const snapshot = JSON.stringify(s);
  const logs = captured(() => {
    assert.deepEqual(bubbleTransition(E1, s, before), bubbleTransition(E1, s, before));
  });
  assert.deepEqual(logs, []);
  assert.equal(JSON.stringify(s), snapshot);
});

// ---------- G12 修改轮（Opus 第 1 轮必须改 1–4） ----------

test('液体柱坠落（空中起落）：人从空中往下落、路径上一进入液体柱就同口径停在柱底实体格之上——手算一列：z=5 气态，z=4、3 液体，z=2、1 实体，z=0 洞（可立足）；落在 z=3（不是 z=0）；与 place.mjs fallCell 同一个循环（路径上见到液体即置 inLiquid）', () => {
  const air = { known: true, standable: false, state: 'gas' };
  const liquid = { known: true, standable: false, state: 'liquid' };
  const solid = { known: true, standable: false, state: 'solid' };
  const column = { 5: air, 4: liquid, 3: liquid, 2: solid, 1: solid, 0: { known: true, standable: true, state: 'gas' } };
  let inLiquid = false;
  let landed = null;
  for (let z = 5; z >= 0 && landed === null; z -= 1) {
    const step = fallStep(column[z], inLiquid);
    if (column[z].state === 'liquid') inLiquid = true;
    if (step === SETTLE.land) landed = z;
    else if (step === SETTLE.fall) landed = z + 1;
  }
  assert.equal(landed, 3);
});

test('液体柱坠落（李白 11-23 事件 412004ce）：人在河中液体格沉到液体柱底、停在第一个实体格（河床）之上，不穿河床——手算一列：z=5、4、3 是液体，z=2、1 是实体（河床与下面的岩），z=0 是河床下的洞（气态、可立足）；从 z=5 起，落在 z=3，落差 (5−3) 层；不沉到洞里的 z=0；按材料物态类判，不认水体', () => {
  const column = { 5: { known: true, standable: false, state: 'liquid' }, 4: { known: true, standable: false, state: 'liquid' }, 3: { known: true, standable: false, state: 'liquid' }, 2: { known: true, standable: false, state: 'solid' }, 1: { known: true, standable: false, state: 'solid' }, 0: { known: true, standable: true, state: 'gas' } };
  // 与 place.mjs fallCell 同一个逐格循环：从起点下一格往下，land 落这一格、fall（液体柱到底）落它上面一格。
  const drop = (sink) => {
    for (let z = 4; z >= 0; z -= 1) {
      const step = fallStep(column[z], sink);
      if (step === SETTLE.land) return z;
      if (step === SETTLE.fall) return z + 1;
      assert.equal(step, SETTLE.none);
    }
    return null;
  };
  assert.equal(drop(true), 3);
  assert.equal(drop(false), 0, '气态起点不套这条：照旧落到下方第一个可立足格');
  assert.equal(fallStep({ known: false, standable: null, state: 'liquid' }, true), SETTLE.unknown);
  assert.equal(fallStep({ known: true, standable: null, state: 'liquid' }, true), SETTLE.unknown);
});

test('修改轮①：rebaseBubble 经 placeSubject 挤出，玩家被挤出跨区格时照常展开——第 8 日地表升到 z=1，站在区格边 (199,150,1) 的玩家，(198..199,*,2) 的四格被差分填成石料后，最近可立足格是 (200,150,2)（d²=1+9=10，唯一）在区格 (2,1)；泡由 x 0–2 变 x 1–3，区格 (3,1) 里的 coarse 个体落到 (350,150,2)', () => {
  installStorage({
    ...OWNERS,
    writers: [...OWNERS.writers, { pattern: 'dshp.*.*', create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true }],
    pathTypes: { ...OWNERS.pathTypes, 'dshp.*.*': 'list<struct:datedRewrite>' },
    keyKinds: { ...OWNERS.keyKinds, 'dshp.*.*': [['place'], 'dimKey'] },
  });
  try {
    const s = fresh({ npc_p: pos(199, 150, 1), npc_c: coarse(350, 150, 0) }, 'npc_p');
    s.clock.minute = 5 * 1440;
    for (const p of [pos(198, 150, 2), pos(199, 149, 2), pos(199, 150, 2), pos(199, 151, 2)]) assert.deepEqual(alter(s, p, 'mat_granite', 'npc_p'), { ok: true });
    for (const id of ['loc_root', 'loc_a', 'loc_b']) {
      assert.deepEqual(runTransaction(s, { node: 'view:shaper', file: 'sys/shaper.mjs' }, (st) => writeDated(E1, st, `dshp.${id}.anchorElevationM`, { fromDay: 8, value: 3, cause: 'evt_quake' })), { ok: true });
    }
    s.clock.minute = 8 * 1440;
    let out;
    assert.deepEqual(runTransaction(s, { node: 'rebaseBubble', file: 'position.mjs' }, (st) => { out = rebaseBubble(E1, st); }), { ok: true });
    assert.deepEqual(out.settled.map((x) => [x.subject, x.outcome]), [['npc_p', 'extrude']]);
    assert.deepEqual(cells(s, 'npc_p'), pos(200, 150, 2));
    assert.deepEqual(cells(s, 'npc_c'), pos(350, 150, 2), '新进泡的区格 (3,1) 展开落格（d²=9：正上方一层）');
  } finally { installStorage(OWNERS); }
});

test('修改轮②：landFineCell 流式遍历与整表排序逐格一致——loc_root 的归属区格里 landOrderKey 最小者所在的区格就是落点所在的区格（四个种子键），落点可立足、zoneAt 恰为 loc_root、同输入同结果', () => {
  const s = fresh({ npc_a: at(0, 1) }, null);
  const owned = placeView(E1, s, 'loc_root').footprint.regionCells.filter((r) => zoneAt(E1, s, regionCell(E1, s, { w: 0, region: r })) === 'loc_root');
  assert.equal(owned.length, 34, '12 × 3 = 36 个区格去掉 loc_a、loc_b 各一个');
  for (const ch of ['a', 'b', 'c', 'd']) {
    const seedKey = ch.repeat(64);
    const want = owned.map((r) => ({ r, k: landOrderKey(seedKey, 0, r.x, r.y) })).sort((p, q) => (p.k < q.k ? -1 : p.k > q.k ? 1 : p.r.x - q.r.x || p.r.y - q.r.y))[0].r;
    const got = landCell(E1, s, { place: 'loc_root', kind: 'person', seedKey, coarse: false });
    assert.deepEqual(regionOf(E1, got), want, ch);
    assert.equal(got.coarse, false);
    assert.equal(zoneAt(E1, s, got), 'loc_root');
    assert.equal(settleCell(E1, s, got).kind, 'stay');
    assert.deepEqual(landCell(E1, s, { place: 'loc_root', kind: 'person', seedKey, coarse: false }), got);
  }
});

test('修改轮③：缺省 seedKey 的五段——世界种子 seed_test、流 travel、个体 npc_a、本事务世界分钟 1234、抽取点 site_pos_land 手写字面量经 diceSeedKey 求键，显式给这个键与不给 seedKey 的落点逐位相同；换个体 id 的键不同', () => {
  const key = diceSeedKey('seed_test', 'travel', 'npc_a', 1234, 'site_pos_land');
  assert.equal(key.length, 64);
  assert.notEqual(key, diceSeedKey('seed_test', 'travel', 'npc_b', 1234, 'site_pos_land'));
  const mk = () => fresh({ npc_p: at(0, 1), npc_a: at(0, 1) }, 'npc_p');
  const dflt = place(mk(), 'npc_a', { place: 'loc_b' }).out.pos;
  const given = place(mk(), 'npc_a', { place: 'loc_b', seedKey: key }).out.pos;
  assert.deepEqual(dflt, given);
  const outside = fresh({ npc_p: at(7, 1), npc_a: at(7, 1) }, 'npc_p');
  const o1 = place(outside, 'npc_a', { place: 'bld_a' }).out.pos;
  const o2 = place(fresh({ npc_p: at(7, 1), npc_a: at(7, 1) }, 'npc_p'), 'npc_a', { place: 'bld_a', seedKey: key }).out.pos;
  assert.deepEqual(o1, o2, '泡外一支同样用这个键');
});

test('修改轮④：facing 值域在入参阶段核——目标落不下（半径内无可立足格）、就地核站稳、泡外三支带非法 facing 都拒 E-DIM-DOMAIN-RANGE，位置逐位不变', () => {
  const s = fresh({ npc_p: at(1, 1), npc_a: coarse(550, 150), npc_h: pos(250, 170, 1), npc_far: coarse(1000, 150) }, 'npc_p');
  const before = JSON.stringify(s);
  const rej = (who, target, facing) => assert.deepEqual(runTransaction(s, POSITION, (st) => { placeSubject(E1, st, who, target, facing, 'act_test'); }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  rej('npc_a', { pos: coarse(250, 150, -10) }, 8);
  rej('npc_h', { settle: true }, 8);
  rej('npc_far', { pos: coarse(1050, 150, 0) }, -1);
  rej('npc_h', { settle: true }, 2.5);
  assert.equal(JSON.stringify(s), before);
});
