// 位置写者 position.mjs（卷十七《交通与路途》§3.3 :288、"位置写入"单点定义 :295–:306；§3.4 :310–:316；卷二十七 R27-1.12–1.14、R27-1.16；卷五 §4.1 规则 12、14、§4.5 规则 6；格子迁移 G12 = 6-27）。
// 个体 `pos`、`facing`（`created.<id>.props.pos`、`created.<id>.props.facing`）的唯一写者，只经 placeSubject（state-owners systems.position.writers；S17-1：本文件之外对这两个路径的写入计数为 0）。
// 调用方（卷九 move 适配器、卷四复生移位、卷十九清理函数、行程段末落位……）在自己的事务里经 runDelegated 以本文件的身份调 placeSubject、applyBubbleTransition（systems.position.writeDelegations，与 grid-diff.mjs 同法）。
//
// 已定（理由在后）：
// 1. 先定目标格、再定精度、最后写（卷十七 :295–:306）。target 三取一：{pos}（struct:pos）、{place, seedKey?}（地点 id；seedKey 随地点给了照用，没给按卷二十七 R27-8.5 五段取：世界种子、travel、被安置个体、本事务世界时刻、site_pos_land）、
//    {settle: true}（就地核立足，只在泡内做）。空、null、两种并给、未知键、地点不存在、pos 缺 coarse 等一律拒收，不合成默认位置（对照表 #2）。
// 2. 精度读"这次写入之后的泡"（卷十七 :301；卷二十七 :311）：被安置者是玩家控制实体（controlledByPlayer）时泡随写入移到目标区格处，所以目标区格一定在泡内、位置恒落可立足细格；
//    别的个体读 inBubble（泡只由状态算出）。泡内落可立足细格（coarse 假）：给位置时目标格可立足即落它，否则 landSearchRadiusCells 内直线最近的可立足格、并列格序号字典序最小（复用卷五 extrudeCell，与挤出同一取法）；
//    给地点时 landCell({place, seedKey, coarse: 假})（卷五 :502）。泡外写 coarse 为真：给位置原样写目标格并置 coarse 真，给地点即 landCell 的代表格。
// 3. 都落不下（半径内没有可立足格、地点没有可落格、读不到）即未知：位置不改、不放进岩里、不落到别的地点，经内核报告出口记一条 E-GRID-LAND-UNKNOWN（告警，字段 space、rx、ry）；调用方按未知处理。
//    本文件是这条码唯一的记录者（bubble.mjs 只算不记；对照表 #12 选甲）。被埋（buried）、下方无可立足格（none）交卷十三、卷四，位置不改，不记这条码。
// 4. 朝向：facing 非空即写它；为空时新旧位置平面不重合取"面朝走来的方向"，平面重合（方位角未知）朝向不变，原来也没有朝向则不写。折八向用卷五 bearingView 自己的扇区算法（卷五 §4.2 规则 13，
//    相对方位 front 即以该朝向为中心、宽一档的扇区）：找使相对方位为 front 的那一档，与卷十七 :305 的 floor((bearingDeg + 22.5) ÷ 45) 取模 8 同一件事（边界角归顺时针下一档同一规则），
//    理由：不在规则层另抄一份度数除法（除数 45、半档 22.5 都不落字面量），也避免两处边界取法不一致；同一事务写 pos 与 facing。
// 5. 展开接线（卷二十七 R27-1.13 时机；对照表 #11、#12）：写玩家控制实体的 pos 前取 before = bubbleView，写入后同一事务内调 bubbleTransition，按项经 placeSubject 写位置：
//    land 项写其 to（与"目标给位置＝个体现有 pos、由泡内一支落最近格"落点相同，因为同一状态上同一次搜索，省掉重复搜索）；unknown 项目标给位置＝个体现有 pos，由泡内一支再搜一次并由它记那一条告警；
//    fall、extrude 项写其 to；buried、none 不写。这些写入只改非玩家个体的 pos（若有别的玩家控制实体被挤出，也只写位置、不再重入改泡）。读档、推进请求的切分都不调这里。
//    席位边写者（卷九 holding.open/close 玩家席位边）取 before 后经 applyBubbleTransition 同法接线（卷九执行器落地卡）。
// 6. rebaseBubble（卷二十七 R27-1.16；登记进 rules.clock.cadence，节拍一日、相位 0；阶段登 body：它是对个体位置的挤出、坠落结算，不与 itemRot 同在 environment——
//    同阶段同 sortKey 被 E-PHASE-DUPLICATE 拒，二者没有先后依赖，不编依赖）：日界当日有效输入（dated 改写记录）相对前一日有变，才对泡内细格个体逐个核可立足并挤出（经 placeSubject 的 settle 一支）；
//    没变、泡为空、泡外区格都不做。基底本是投影、不缓存（gridView 无跨调用缓存），"重派生"即读时按当日输入派生。变化的判据取 inputVersionAt(当日) 与 inputVersionAt(前一日) 是否相同（全世界一个版本号，
//    卷二 §2.7 dated 只给了这一个"当日有效输入版本"口径）：没有按区格分的版本，区格级筛选只是性能优化、不影响结果（站稳的人核一次不动）。同一拍对多个单元各调一次，第二次起无动作。
// 7. 未落（卷文推不出或归他卡）：跨存量单元安置事件 verb_subject_tract_changed（对照表 #10；comp_tract 未登，按块 6 原裁定读未知、不发事件，待登记后补）；批次（物）落格（待定 4，无写者卡）；
//    位置索引与 inBubble 缓存（#20、#21；腾讯云块验收实测前不建，测量点见 bubble.mjs 头注）；展开读窗共用（#22，同）。

import { dim } from './kernel/dimensions.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { writePath } from './kernel/storage.mjs';
import { registerDelegate } from './kernel/transaction.mjs';
import { registerAdvanceHook } from './kernel/advance-registry.mjs';
import { inputVersionAt } from './kernel/dated.mjs';
import { kindOfEntity } from './kernel/vocab.mjs';
import { report } from './kernel/report.mjs';
import { diceSeedKey } from './kernel/sample.mjs';
import { E, P } from './kernel/handles/generated.mjs';
import { zoneAt, regionOf, gridSpaceBox, landCell, extrudeCell, settleCell, bearingView, isOffstage } from './kernel/place.mjs';
import { isPosValue } from './kernel/named-structs.mjs';
import { bubbleView, inBubble, controlledByPlayer } from './sim-tiers.mjs';
import { bubbleTransition, subjectsIn } from './bubble.mjs';

// 键名与代号（本文件定名，单一定义）。FRONT 同 kernel/footprint.mjs 的 RELATIVE[0]（测试核两边一致）；种子键的流与抽取点代号登记在 world/rules/tables/seed-keys.json。
const S = Object.freeze({ person: 'person', place: 'place', pos: 'pos', facing: 'facing', front: 'front' });
const TARGET = Object.freeze({ pos: 'pos', place: 'place', settle: 'settle', seedKey: 'seedKey' });
// placeSubject 返回的 outcome：placed 写了位置；stay 就地核立足而可立足、不动；fall、extrude 就地核后写了落点；buried、none 交卷十三、卷四、位置不改；
// unknown 落不下、位置不改（已记 E-GRID-LAND-UNKNOWN）；outside 就地核立足的个体不在泡内、不做细格结算。
// land 是 bubbleTransition 项里"coarse 个体落到可立足细格"的 outcome（同 bubble.mjs OUTCOME.land），本文件只读它。
export const OUTCOME = Object.freeze({ placed: 'placed', stay: 'stay', fall: 'fall', extrude: 'extrude', buried: 'buried', none: 'none', unknown: 'unknown', outside: 'outside', land: 'land' });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isSafeInteger(v);

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

// 种子键（卷二十七 R27-8.5 五段）：流代号、抽取点代号是字面量，登记在 seed-keys.json 一行（seed_sites 检测器按它们双向比对）。
function landSeed(stream, site, engine, state, subjectId) {
  const world = engine && isObj(engine.template) ? engine.template.seed : undefined;
  const key = diceSeedKey(world, stream, subjectId, clockView(engine, state).minute, site);
  return key;
}

// 个体当前位置：读不到（没有位置、未知）为 null；别的错误照抛。
function posOf(engine, state, id) {
  try {
    const f = dim(engine, state, S.person, id, S.pos);
    return f.known && isObj(f.value) ? f.value : null;
  } catch (e) {
    if (e && typeof e.code === 'string' && e.code.startsWith('E-DIM-')) return null;
    throw e;
  }
}

function facingOf(engine, state, id) {
  try {
    const f = dim(engine, state, S.person, id, S.facing);
    return f.known && isInt(f.value) ? f.value : null;
  } catch (e) {
    if (e && typeof e.code === 'string' && e.code.startsWith('E-DIM-')) return null;
    throw e;
  }
}

// 入参核对（卷十七 :295）：返回规整后的 {kind, pos?, place?, seedKey?}。
function checkTarget(state, target) {
  if (!isObj(target)) throw deny(E.E_DET_DOMAIN, 'placeSubject: target is {pos} | {place} | {settle: true}');
  const keys = Object.keys(target);
  const known = [TARGET.pos, TARGET.place, TARGET.settle, TARGET.seedKey];
  if (keys.some((k) => !known.includes(k))) throw deny(E.E_DET_DOMAIN, `placeSubject: target has only ${known.join(', ')}`);
  const kinds = [TARGET.pos, TARGET.place, TARGET.settle].filter((k) => Object.hasOwn(target, k));
  if (kinds.length !== 1) throw deny(E.E_DET_DOMAIN, 'placeSubject: target is exactly one of pos, place, settle');
  const kind = kinds[0];
  if (Object.hasOwn(target, TARGET.seedKey) && kind !== TARGET.place) throw deny(E.E_DET_DOMAIN, 'placeSubject: seedKey goes with a place target only');
  if (kind === TARGET.pos) {
    if (!isPosValue(target.pos)) throw deny(E.E_DIM_STRUCT_FIELD, 'placeSubject: target.pos is not a struct:pos {w, x, y, z, coarse}');
    return { kind, pos: target.pos };
  }
  if (kind === TARGET.settle) {
    if (target.settle !== true) throw deny(E.E_DET_DOMAIN, 'placeSubject: target.settle is true');
    return { kind };
  }
  let isPlace = false;
  try { isPlace = typeof target.place === 'string' && kindOfEntity(state, target.place) === S.place; } catch (e) { if (!e || e.code !== E.E_DIM_REF_MISSING) throw e; }
  if (!isPlace) throw deny(E.E_DIM_REF_MISSING, 'placeSubject: target.place is not a place row');
  if (Object.hasOwn(target, TARGET.seedKey) && (typeof target.seedKey !== 'string' || target.seedKey.length === 0)) throw deny(E.E_DET_DOMAIN, 'placeSubject: target.seedKey is a non-empty key');
  return { kind, place: target.place, seedKey: Object.hasOwn(target, TARGET.seedKey) ? target.seedKey : null };
}

// 目标所在的格空间要存在、区格要在外包框内：否则 zoneAt 为未知，写下去就破坏"每个个体的 zoneAt(pos) 是一个地点行"（卷十七 A17-1.2 :409）。
function requireInBox(engine, state, cell) {
  const box = gridSpaceBox(engine, state, cell.w);
  const r = regionOf(engine, cell);
  if (box === null || r.x < box.x0 || r.x >= box.x0 + box.cellsX || r.y < box.y0 || r.y >= box.y0 + box.cellsY) {
    throw deny(E.E_DIM_STRUCT_FIELD, `placeSubject: cell ${cell.w}:${cell.x},${cell.y},${cell.z} is outside the grid space box`);
  }
  return r;
}

// 目标区格在"这次写入之后的泡"里吗（卷十七 :301）：玩家控制实体的泡随写入移到目标区格（已核在框内，所以中心区格必在泡内）；别的个体读现有的泡。
function inBubbleAfter(engine, state, cell, region, controlled) {
  return controlled ? true : inBubble(engine, state, cell.w, region);
}

// 朝向折八向（见文件头已定 4）：以朝向 k 看方位角，相对方位为 front 的那一档就是方位所在的八向序号；平面重合（bearingView 为 null）为 null。
function foldFacing(engine, state, from, to) {
  const n = engine.rules.grid.facingDirections;
  for (let k = 0; k < n; k += 1) {
    const v = bearingView(engine, state, from, to, k);
    if (v === null) return null;
    if (v.relative === S.front) return k;
  }
  return null;
}

// 朝向：给了就核值域，没给按新旧位置折（旧位置读不到或平面重合为 null：不写）。
function checkFacing(engine, given) {
  const n = engine.rules.grid.facingDirections;
  if (given !== null && given !== undefined && (!isInt(given) || given < 0 || given >= n)) throw deny(E.E_DIM_DOMAIN_RANGE, `placeSubject: facing is an integer in [0, ${n - 1}] or null`);
}

function decideFacing(engine, state, given, old, now) {
  if (given !== null && given !== undefined) return given;
  return old === null ? null : foldFacing(engine, state, old, now);
}

function unknownLand(cell, region) {
  report(E.E_GRID_LAND_UNKNOWN, { space: cell.w, rx: region.x, ry: region.y });
}

// 写：同一事务里写 pos 与 facing（卷十七 :306）；写者核对由 kernel/storage.mjs 的 writePath 按事务节点所在文件判（本文件是 created.*.props.pos、facing 的声明写者）。
function writePlace(engine, state, subjectId, pos, facing) {
  writePath(state, P.created_props_pos(subjectId), pos);
  if (facing !== null) writePath(state, P.created_props_facing(subjectId), facing);
}

/**
 * 一次落位（不含展开接线）：定目标格、定精度、写。返回 {outcome, pos, facing, dropM?}：pos 是调用后个体的位置（没写则是原位置，没有位置为 null）。
 * @returns {{outcome: string, pos: object | null, facing: number | null, dropM?: number}}
 */
function placeOnce(engine, state, subjectId, target, facing, controlled) {
  const old = posOf(engine, state, subjectId);
  const oldFacing = facingOf(engine, state, subjectId);
  const keep = (outcome, extra = {}) => ({ outcome, pos: old, facing: oldFacing, ...extra });
  const write = (outcome, cell, extra = {}) => {
    const f = decideFacing(engine, state, facing, old, cell);
    writePlace(engine, state, subjectId, cell, f);
    return { outcome, pos: cell, facing: f === null ? oldFacing : f, ...extra };
  };

  if (target.kind === TARGET.settle) {
    // 就地核立足（卷十七 :300）：只在现场泡内做；泡外、coarse 位置不做细格结算。
    if (old === null || old.coarse === true) return keep(OUTCOME.outside);
    const r = requireInBox(engine, state, old);
    if (!inBubbleAfter(engine, state, old, r, controlled)) return keep(OUTCOME.outside);
    const s = settleCell(engine, state, old);
    if (s.kind === OUTCOME.stay) return keep(OUTCOME.stay);
    if (s.kind === OUTCOME.fall) return write(OUTCOME.fall, s.cell, { dropM: s.dropM });
    if (s.kind === OUTCOME.extrude) return write(OUTCOME.extrude, s.cell);
    if (s.kind === OUTCOME.unknown) { unknownLand(old, r); return keep(OUTCOME.unknown); }
    return keep(s.kind); // buried、none：交卷十三、卷四，位置不改
  }

  // 目标格：给位置即它；给地点取 landCell 的代表格（coarse 真，卷十七 :299）。
  let seedKey = null;
  let cell;
  if (target.kind === TARGET.pos) {
    cell = target.pos;
  } else {
    seedKey = target.seedKey !== null ? target.seedKey : landSeed('travel', 'site_pos_land', engine, state, subjectId);
    cell = landCell(engine, state, { place: target.place, seedKey, coarse: true });
    if (cell === null) {
      // 地点没有可落格：未知。区格取该地点的任一已知处无从谈起，字段用 -1 表示没有（报告出口只收代号与数值）。
      report(E.E_GRID_LAND_UNKNOWN, { space: -1, rx: -1, ry: -1 });
      return keep(OUTCOME.unknown);
    }
  }
  const region = requireInBox(engine, state, cell);
  if (!inBubbleAfter(engine, state, cell, region, controlled)) {
    return write(OUTCOME.placed, { w: cell.w, x: cell.x, y: cell.y, z: cell.z, coarse: true }); // 泡外：原样写目标格、coarse 置真（卷十七 :303）
  }
  if (target.kind === TARGET.place) {
    const fine = landCell(engine, state, { place: target.place, seedKey, coarse: false });
    if (fine === null) { unknownLand(cell, region); return keep(OUTCOME.unknown); }
    return write(OUTCOME.placed, fine);
  }
  const found = extrudeCell(engine, state, cell); // 目标格可立足即落它，否则半径内最近、并列格序号最小（卷十七 :302）
  if (found.kind !== OUTCOME.land) { unknownLand(cell, region); return keep(OUTCOME.unknown); }
  return write(OUTCOME.placed, found.cell);
}

function checkSubject(state, subjectId, cause) {
  let kind = null;
  try { kind = typeof subjectId === 'string' ? kindOfEntity(state, subjectId) : null; } catch (e) { if (!e || e.code !== E.E_DIM_REF_MISSING) throw e; }
  if (kind !== S.person) throw deny(E.E_DIM_REF_MISSING, 'placeSubject: subject is a person row');
  if (typeof cause !== 'string' || cause.length === 0) throw deny(E.E_DET_DOMAIN, 'placeSubject: cause is a non-empty rule or command code');
}

/**
 * 展开接线（卷二十七 R27-1.13；见文件头已定 5）：改变泡的那笔写入之后、事务结束前调，before 是写入前的 bubbleView。同一事务里按 bubbleTransition 的项经 placeSubject 的落位写位置。
 * 返回 {collapse, expand, applied}：applied 每项 {subject, outcome, pos, dropM?}（按区格序、个体 id 码点序）；buried、none 项不写位置，原样交卷十三、卷四。
 * @param {object} engine @param {object} state
 * @param {readonly {w: number, regions: readonly {x: number, y: number}[]}[]} before @param {string} cause
 */
export function applyBubbleTransition(engine, state, before, cause) {
  const t = bubbleTransition(engine, state, before);
  const applied = [];
  for (const m of t.moves) {
    if (m.outcome === OUTCOME.buried || m.outcome === OUTCOME.none) { applied.push({ subject: m.subject, outcome: m.outcome, pos: m.from }); continue; }
    const at = m.outcome === OUTCOME.land || m.outcome === OUTCOME.fall || m.outcome === OUTCOME.extrude ? m.to : m.from;
    const r = placeOnce(engine, state, m.subject, { kind: TARGET.pos, pos: at }, null, controlledByPlayer(engine, state, m.subject));
    applied.push({ subject: m.subject, outcome: m.outcome === OUTCOME.land ? OUTCOME.placed : r.outcome === OUTCOME.placed ? m.outcome : r.outcome, pos: r.pos, ...(m.dropM === undefined ? {} : { dropM: m.dropM }) });
  }
  return Object.freeze({ collapse: t.collapse, expand: t.expand, applied });
}

/**
 * `placeSubject(engine, state, subjectId, target, facing, cause)`（卷十七 §3.3 :295）：个体 `pos`、`facing` 的唯一写入口，在调用方已开的内核事务里调（节点所在文件须是 position.mjs 或经登记委托）。
 * target 三取一：{pos: struct:pos}、{place: 地点 id, seedKey?}、{settle: true}（见文件头已定 1）；facing 为 null 或八向序号；cause 是规则或指令代号。
 * 被安置者是玩家控制实体且位置写了时，同一事务里取 before、写后调展开接线（applyBubbleTransition），结果带在返回的 bubble 里。
 * 返回 {outcome, pos, facing, dropM?, bubble?}（outcome 见 OUTCOME；落不下为 unknown 并已记 E-GRID-LAND-UNKNOWN，位置不改）。
 * @param {object} engine @param {object} state @param {string} subjectId
 * @param {{pos: object} | {place: string, seedKey?: string} | {settle: true}} target @param {number | null} facing @param {string} cause
 */
export function placeSubject(engine, state, subjectId, target, facing, cause) {
  checkSubject(state, subjectId, cause);
  const t = checkTarget(state, target);
  checkFacing(engine, facing); // 入参阶段就核：落不下、站稳、泡外各支也拒收非法朝向
  const controlled = controlledByPlayer(engine, state, subjectId);
  const before = controlled ? bubbleView(engine, state) : null;
  const r = placeOnce(engine, state, subjectId, t, facing, controlled);
  const wrote = r.outcome === OUTCOME.placed || r.outcome === OUTCOME.fall || r.outcome === OUTCOME.extrude;
  if (!controlled || !wrote) return Object.freeze(r);
  return Object.freeze({ ...r, bubble: applyBubbleTransition(engine, state, before, cause) });
}

// 被委托写者：调用方经 state-owners systems.position.writeDelegations 登记的委托调（kernel/transaction.mjs runDelegated）。
registerDelegate('position.mjs#placeSubject', placeSubject);
registerDelegate('position.mjs#applyBubbleTransition', applyBubbleTransition);

// ---------- rebaseBubble（卷二十七 R27-1.16） ----------

// 钩子的规则代号（placeSubject 的 cause）。
const REBASE_CAUSE = 'rule_rebase_bubble';

/**
 * 日界钩子的工作（见文件头已定 6）：当日有效输入相对前一日有变时，泡内每个细格个体按卷五 §4.5 规则 6 核一次可立足，不可立足的坠落或挤出（经 placeSubject 的 settle 一支）。
 * 返回 {day, changed, settled}：settled 每项 {subject, outcome, pos, dropM?}（区格序、个体 id 序），站稳的（stay）不出项。
 * @param {object} engine @param {object} state
 */
export function rebaseBubble(engine, state) {
  const day = clockView(engine, state).day;
  if (day < 1 || inputVersionAt(engine, state, day) === inputVersionAt(engine, state, day - 1)) return Object.freeze({ day, changed: false, settled: [] });
  const view = bubbleView(engine, state);
  const regions = view.flatMap((s) => s.regions.map((r) => ({ w: s.w, x: r.x, y: r.y })));
  const by = subjectsIn(engine, state, regions);
  const settled = [];
  for (const c of regions) {
    for (const { id, pos } of by.get(`${c.w}:${c.x}:${c.y}`) || []) {
      if (pos.coarse !== false) continue;
      // 挤出写位置一律经 placeSubject（卷二十七 :327）：玩家控制实体被挤出跨区格时，它在写入后同一事务里照常展开新进泡的区格。
      const r = placeSubject(engine, state, id, { settle: true }, null, REBASE_CAUSE);
      if (r.outcome !== OUTCOME.stay) settled.push({ subject: id, outcome: r.outcome, pos: r.pos, ...(r.dropM === undefined ? {} : { dropM: r.dropM }) });
    }
  }
  return Object.freeze({ day, changed: true, settled });
}

registerAdvanceHook('rebaseBubble', 'position.mjs', (engine, state) => { rebaseBubble(engine, state); });

// ---------- whereOf（卷十七 §3.1 :262、§3.4 :310–:316） ----------

/**
 * `whereOf(engine, state, entityId)`（卷十七 §3.1 :262、§3.4）：{place, pos, chain}。个体取 zoneAt(pos) 与 pos；地点行取自身、pos 为空；
 * 离场行、没有位置的个体返回空（place、pos 为 null）；链走不到地点行（循环、悬空、承载链这一环现在读不了）返回空并报 E-TRIP-LEG，读到空的规则按未知处理（卷十七 §3.4 第 5 条）。
 * 未落：物品、载具沿承载链（持有边、容器、搭载、安装）向外走与批次 spot（§3.4 第 2–4 条）：账本现在没有"某件实例在哪个持有人名下"的读入口（kernelApi 没有，加它是账本的事），
 * 持有边、搭载、安装的关系写者未建，批次 spot 字段未登记，所以物品一律走到"链走不到"这一支（空并报 E-TRIP-LEG），不拿别的量顶替。纯读（报告除外）。
 * @param {object} engine @param {object} state @param {string} entityId
 * @returns {{place: string | null, pos: object | null, chain: readonly string[]}}
 */
export function whereOf(engine, state, entityId) {
  const chain = [];
  const empty = () => Object.freeze({ place: null, pos: null, chain: Object.freeze([...chain]) });
  const broken = () => { report(E.E_TRIP_LEG, { step: chain.length }); return empty(); };
  let cur = entityId;
  for (;;) {
    if (typeof cur !== 'string' || chain.includes(cur)) return broken();
    chain.push(cur);
    let kind = null;
    try { kind = kindOfEntity(state, cur); } catch (e) { if (!e || e.code !== E.E_DIM_REF_MISSING) throw e; return broken(); }
    if (kind === S.person) {
      const pos = posOf(engine, state, cur);
      return pos === null ? empty() : Object.freeze({ place: zoneAt(engine, state, pos), pos, chain: Object.freeze([...chain]) });
    }
    if (kind === S.place) return isOffstage(engine, state, cur) ? empty() : Object.freeze({ place: cur, pos: null, chain: Object.freeze([...chain]) });
    return broken();
  }
}
