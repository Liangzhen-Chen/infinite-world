// 格差分写者 grid-diff.mjs（卷五 §3.3 :362 唯一写者、§4.1 规则 15–16；卷二十七 R27-1.15 离屏不写差分；格子迁移 G9）。
// 状态 `cells.<w>.<里块>.<格键>` 的唯一写者，只经 alterCells（签名 `(engine, state, {w, changes, cause}) → {ok, reason}`，卷五 :330）：
// 调用方是效果族（挖、炸、砌、拆、烧、法术）、卷十九建造与拆除、卷五 take（格标记）；各调用方在 state-owners 登记写者委托（systems.*.writeDelegations），
// 经 runDelegated 以本文件的身份调本文件登记的入口（kernel/transaction.mjs；与 status.mjs、item-lots.mjs 同法）。
//
// 已定（理由在后）：
// 1. 一笔 alterCells 整笔成败：任一项不过，抛带登记码的错误，由事务整笔回滚（卷二 §2.6 :499）；通过返回 {ok: true, reason: null}。
// 2. 拒写检查（卷五 §4.1 规则 15 :504，卷二十七 R27-1.15 第 2、3 项）：cause 带行为者（`cause.actor`，实体 id）时，按行为者此刻所在区格是否在现场泡内判（只经 sim-tiers.mjs 的 inBubble）；
//    行为者位置读不到（不是有 pos 的实体、实体不存在、位置未知）同样不在泡内——一律拒写，没有放行；行为者在泡内则目标格在不在泡内都照写（第 3 项）。
//    cause 没有行为者（缺省、null、字串代号〔规则或指令代号，不带行为者〕、没有 actor 的对象）：按每个目标格所在区格是否在泡内判，任一格不在即整笔拒。不按位置精度判，没有"强制写"例外值。
//    cause 的形状卷文没给（只说"cause 行为者"）：本文件定为 null/缺省/代号串/{actor: 实体 id 或 null, …}，别的形状 E-DIM-STRUCT-FIELD；须 Opus 核。
// 3. 建筑结构元格拒写（卷五 §4.1 规则 15 :505）：目标格是某座建筑的体元所在格（外墙、隔墙、楼梯格）、且这一项写后材料非空（含格标记 becomesMaterial 带出的材料），E-GRID-STRUCTURE-CELL；
//    全空项（清除差分）不动材料，不拒。顶元不经 alterCells，差分记录没有顶面字段。
// 4. 一项的落笔语义：每项整条替换该格的差分记录 {material, fixture, mark, sinceMinute}（material、fixture、mark 为空即该项不覆盖基底）；格标记的 becomesMaterial 非空时连同材料一起改
//    （卷五 §4.7 规则 8 末句）：material 为空取 becomesMaterial，material 非空且不同则 E-DIM-STRUCT-FIELD。卷文没写部分覆盖：要保留旧差分的某项，调用方先读再整条给全。
//    三项都为空即清除这一格的差分：状态存储没有删除原语（卷二 §2.6 只有 writePath），写成全空记录，读侧（kernel/grid-diff-read.mjs）一律当没有差分。
// 5. sinceMinute 取写入时的世界分钟（clockView）；差分永久保留，本文件不做任何过期、回收、因收起或读档而删。
// 6. 目标格须在格空间外包框内（区格在 box 里）：不在即 E-DIM-STRUCT-FIELD，不写框外的格。
// 7. 引用核对：material 须是材料行、fixture 须是物品行（家具）、mark 须是 cellmark 词表条目，否则 E-DIM-REF-MISSING（material、fixture 经 kindOfEntity，运行期新建的实体也认）。

import { dim } from './kernel/dimensions.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { writePath } from './kernel/storage.mjs';
import { registerDelegate } from './kernel/transaction.mjs';
import { kindOfEntity } from './kernel/vocab.mjs';
import { E, P } from './kernel/handles/generated.mjs';
import { regionOf, isStructureCell, gridSpaceBox } from './kernel/place.mjs';
import { createDiffReader, diffPathSegments } from './kernel/grid-diff-read.mjs';
import { inBubble } from './sim-tiers.mjs';

const S = Object.freeze({
  pos: 'pos', materialKind: 'material', itemKind: 'item', markFamily: 'cellmark', becomes: 'becomesMaterial',
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

// ---------- 入参核对 ----------

// 一个可空引用项：缺省或 null 为 null；否则须是非空字串。
function nullableRef(v, what) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.length === 0) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: ${what} must be a code or null`);
  return v;
}

function checkPos(pos, w, index) {
  const ok = isObj(pos) && Number.isSafeInteger(pos.w) && Number.isSafeInteger(pos.x) && Number.isSafeInteger(pos.y) && Number.isSafeInteger(pos.z) && pos.coarse === false;
  if (!ok) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: changes[${index}].pos must be a cell position (integer w, x, y, z; coarse false)`);
  if (pos.w !== w) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: changes[${index}].pos.w ${pos.w} is not the grid space ${w} of this write`);
}

// 引用核对：material 须是材料行、fixture 须是物品行、mark 须是 cellmark 词表条目（卷二 §1.9 登记表查，不解析字串）。
function checkRefs(engine, state, change, index) {
  if (change.material !== null && kindOfEntity(state, change.material) !== S.materialKind) throw deny(E.E_DIM_REF_MISSING, `alterCells: changes[${index}].material ${change.material} is not a material row`);
  if (change.fixture !== null && kindOfEntity(state, change.fixture) !== S.itemKind) throw deny(E.E_DIM_REF_MISSING, `alterCells: changes[${index}].fixture ${change.fixture} is not an item row`);
  if (change.mark !== null) {
    const rec = engine.vocab && engine.vocab.index instanceof Map ? engine.vocab.index.get(change.mark) : undefined;
    if (!rec || rec.family !== S.markFamily) throw deny(E.E_DIM_REF_MISSING, `alterCells: changes[${index}].mark ${change.mark} is not a ${S.markFamily} entry`);
    const becomes = isObj(rec.entry) ? rec.entry[S.becomes] : null;
    if (becomes !== null && becomes !== undefined) {
      if (change.material !== null && change.material !== becomes) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: changes[${index}].material ${change.material} conflicts with mark ${change.mark} ${S.becomes} ${becomes}`);
      return becomes;
    }
  }
  return change.material;
}

// ---------- cause 与行为者 ----------

// cause 里的行为者 id（没有为 null）。形状见文件头已定 2。
function actorOf(cause) {
  if (cause === undefined || cause === null || typeof cause === 'string') return null;
  if (!isObj(cause)) throw deny(E.E_DIM_STRUCT_FIELD, 'alterCells: cause must be null, a code string, or {actor}');
  const a = cause.actor;
  if (a === undefined || a === null) return null;
  if (typeof a !== 'string' || a.length === 0) throw deny(E.E_DIM_STRUCT_FIELD, 'alterCells: cause.actor must be an entity id or null');
  return a;
}

// 行为者此刻的位置：读不到（实体不存在、没有 pos 维度、位置未知）为 null，不抛（调用方按"不在泡内"拒写）。别的错误（位置值本身坏了等）照抛。
function positionOf(engine, state, id) {
  try {
    const f = dim(engine, state, kindOfEntity(state, id), id, S.pos);
    return f.known && isObj(f.value) ? f.value : null;
  } catch (e) {
    if (e && typeof e.code === 'string' && e.code.startsWith('E-DIM-')) return null;
    throw e;
  }
}

function checkBubble(engine, state, w, cells, cause) {
  const actor = actorOf(cause);
  if (actor !== null) {
    const at = positionOf(engine, state, actor);
    if (at === null || !inBubble(engine, state, at.w, regionOf(engine, at))) {
      throw deny(E.E_GRID_OFFSCREEN_WRITE, `alterCells: actor ${actor} is not in the on-stage bubble (position ${at === null ? 'unknown' : `${at.w}:${at.x},${at.y}`})`);
    }
    return; // 泡内行为者当场造成的改动照写，目标格在不在泡内都一样（卷二十七 R27-1.15 第 3 项）
  }
  const seen = new Set();
  for (const c of cells) {
    const r = regionOf(engine, { w, x: c.x, y: c.y, z: c.z, coarse: false });
    const key = `${r.x},${r.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!inBubble(engine, state, w, r)) throw deny(E.E_GRID_OFFSCREEN_WRITE, `alterCells: no actor in cause and target region ${r.x},${r.y} of grid space ${w} is not in the on-stage bubble`);
  }
}

// ---------- 入口 ----------

/**
 * 格差分的唯一写入口（卷五 §3.2 :330）。在调用方的内核事务里调（写者委托）。通过返回 {ok: true, reason: null}；任一项不过抛带登记码的错误、整笔回滚。
 * @param {object} engine @param {object} state
 * @param {{w: number, changes: {pos: {w: number, x: number, y: number, z: number, coarse: boolean}, material?: string | null, fixture?: string | null, mark?: string | null}[], cause?: null | string | {actor?: string | null}}} spec
 * @returns {{ok: true, reason: null}}
 */
export function alterCells(engine, state, spec) {
  if (!isObj(spec) || !Number.isSafeInteger(spec.w) || !Array.isArray(spec.changes) || spec.changes.length === 0) {
    throw deny(E.E_DIM_STRUCT_FIELD, 'alterCells: needs {w: integer, changes: non-empty list, cause}');
  }
  const { w } = spec;
  const grid = engine.rules && engine.rules.grid;
  if (!isObj(grid)) throw deny(E.E_RULES_UNREGISTERED, 'alterCells: rules.grid is not registered');
  const box = gridSpaceBox(engine, state, w);
  if (box === null) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: grid space ${w} does not exist`);
  const seen = new Set();
  const items = spec.changes.map((raw, index) => {
    if (!isObj(raw)) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: changes[${index}] must be an object`);
    checkPos(raw.pos, w, index);
    const key = `${raw.pos.x},${raw.pos.y},${raw.pos.z}`;
    if (seen.has(key)) throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: changes[${index}] repeats cell ${key} (one change per cell in one call)`);
    seen.add(key);
    const change = { material: nullableRef(raw.material, `changes[${index}].material`), fixture: nullableRef(raw.fixture, `changes[${index}].fixture`), mark: nullableRef(raw.mark, `changes[${index}].mark`) };
    const material = checkRefs(engine, state, change, index);
    const r = regionOf(engine, raw.pos);
    if (r.x < box.x0 || r.x >= box.x0 + box.cellsX || r.y < box.y0 || r.y >= box.y0 + box.cellsY) {
      throw deny(E.E_DIM_STRUCT_FIELD, `alterCells: changes[${index}] cell ${key} is outside grid space ${w}`);
    }
    return { pos: { w, x: raw.pos.x, y: raw.pos.y, z: raw.pos.z }, material, fixture: change.fixture, mark: change.mark };
  });
  checkBubble(engine, state, w, items.map((i) => i.pos), spec.cause);
  for (const it of items) {
    if (it.material !== null && isStructureCell(engine, state, it.pos)) {
      throw deny(E.E_GRID_STRUCTURE_CELL, `alterCells: cell ${it.pos.x},${it.pos.y},${it.pos.z} is a building structural cell (wall, partition, stairs); use breakStructure`);
    }
  }
  const minute = clockView(engine, state).minute;
  for (const it of items) {
    const seg = diffPathSegments(grid, it.pos);
    writePath(state, P.cells(seg.w, seg.chunk, seg.cell), { material: it.material, fixture: it.fixture, mark: it.mark, sinceMinute: minute });
  }
  return { ok: true, reason: null };
}

/**
 * 给定格里哪些格有有效差分（卷五 §4.1 规则 11、卷十九 §4.4 规则 2 ③：泡外新建建筑足迹不得压在已有差分格上；泡内建造先清足迹内冲突的差分）。纯读。
 * @param {object} engine @param {object} state @param {number} w @param {{x: number, y: number, z: number}[]} cells
 * @returns {{x: number, y: number, z: number}[]} 有差分的格（按入参次序）
 */
export function diffCellsAmong(engine, state, w, cells) {
  const reader = createDiffReader(state, engine.rules.grid);
  return cells.filter((c) => reader.cellAt(w, c.x, c.y, c.z) !== null).map((c) => ({ x: c.x, y: c.y, z: c.z }));
}

/**
 * 删去给定格里的差分（卷十九 §4.4 :856、卷十 R10-3.8；S19-11 ②：只删差分、不写新内容）：对其中有差分的格经 alterCells 写全空项（清除），没有差分的格不动。
 * 同样受拒写检查（cause 行为者须在泡内）。返回被清的格数；没有要清的格时不调 alterCells，返回 0。
 * @param {object} engine @param {object} state @param {{w: number, cells: {x: number, y: number, z: number}[], cause?: any}} spec @returns {number}
 */
export function clearDiffs(engine, state, spec) {
  if (!isObj(spec) || !Number.isSafeInteger(spec.w) || !Array.isArray(spec.cells)) throw deny(E.E_DIM_STRUCT_FIELD, 'clearDiffs: needs {w: integer, cells: list, cause}');
  const hit = diffCellsAmong(engine, state, spec.w, spec.cells);
  if (hit.length === 0) return 0;
  alterCells(engine, state, { w: spec.w, changes: hit.map((c) => ({ pos: { w: spec.w, x: c.x, y: c.y, z: c.z, coarse: false }, material: null, fixture: null, mark: null })), cause: spec.cause });
  return hit.length;
}

// 被委托写者：调用方经 state-owners systems.*.writeDelegations 登记的委托调（kernel/transaction.mjs runDelegated）。
registerDelegate('grid-diff.mjs#alterCells', alterCells);
registerDelegate('grid-diff.mjs#clearDiffs', clearDiffs);
