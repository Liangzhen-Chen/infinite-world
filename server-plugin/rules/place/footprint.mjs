// 建筑足迹烘焙与加载核对（卷五 §4.1 规则 2、3、11；卷十九 §4.5 规则 7 原点与旋转约定；S2-P 草案 §3 第 1、2 行，主会话 Q3、Q5 甲）。
// 本阶段只做建筑足迹：足迹 = 蓝图外包矩形 planCells 宽 × 深 × storeys 层（卷十九 blueprintOf 未建，蓝图卡落地后改读它，zoneAt 签名不变）。
// 区域、房间、体积足迹未建（Q3 甲）：zoneAt 对不在任何建筑里的格给 null。
// bakeFootprints 是世界数据的纯函数，结果挂 engine.bake.footprints，不进 state、不进 doc_*；读档后从空重建，verifyBake 时比两次构建的摘要（同 place-tree）。
// 足迹种类按组件类判（卷五规则 2），组件类代号经 rules.gen.roleFacility 读；常数读 rules.grid；不认任何地点、形制或组件类 id。

import { KernelError } from '../../kernel/errors.mjs';
import { canonical } from '../../kernel/storage.mjs';
import { ruleValue } from '../load/registry.mjs';

// 规则表代号与键（world/rules/tables/worldgen.json roleFacility：卷五规则 2 建筑足迹的组件类；grid.json facingDirections）。
const GEN = 'gen';
const ROLE_FACILITY = 'roleFacility';
const GRID = 'grid';
const FACING_DIRECTIONS = 'facingDirections';
// 建筑行上读的维度（卷五 §2.1 :99–:100 anchor、facing；卷十九 §2.1 :107、:115、:116 form、storeys、planCells）与形制条目字段（卷十九 §2.4 :203 storeyBase）。
const DIM = Object.freeze({ classes: 'classes', anchor: 'anchor', facing: 'facing', form: 'form', storeys: 'storeys', planCells: 'planCells', parent: 'parent' });
const PLAN = Object.freeze({ width: 'widthCells', depth: 'depthCells' });
const STOREY_BASE = 'storeyBase';
// 一圈里蓝图可取的朝向数（rules.facility.blueprintRotationSteps；卷十九 §4.5 规则 7、Q29：只按四分之一圈转）。
const FACILITY = 'facility';
const ROTATION_STEPS = 'blueprintRotationSteps';

/** @typedef {{w: number, x: number, y: number, z: number}} Cell */
/** @typedef {Readonly<{kind: string, ids: readonly string[], cellsOf: (id: string) => readonly Cell[], claimantsAt: (pos: unknown) => readonly string[]}>} Footprints */

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byCodePoint = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);
const isInt = (/** @type {unknown} */ v) => Number.isSafeInteger(v);

/**
 * 格的规范键（格序号）：[w, x, y, z] 的规范序列化（卷五 :434 struct:pos 的四个整数；kernel/storage.mjs#canonical 唯一序列化）。不是格即 null。
 * @param {unknown} pos @returns {string | null}
 */
export function cellKey(pos) {
  const p = Object(pos);
  if (!isObj(pos) || ![p.w, p.x, p.y, p.z].every(isInt)) return null;
  return canonical([p.w, p.x, p.y, p.z]);
}

/**
 * 一行的维度值（实体行上已含 generated 节叠加，rules/load/registry.mjs）；缺即 E-DIM-STRUCT-FIELD（建筑行这些维度 byClass 必填）。
 * @param {string} kind @param {string} id @param {Record<string, unknown>} row @param {string} key @returns {unknown}
 */
function need(kind, id, row, key) {
  if (!Object.hasOwn(row, key)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `bakeFootprints: ${kind} ${id} carries the building class but has no ${key}`);
  return row[key];
}

/**
 * 一栋建筑的外包盒足迹（卷十九 §4.5 规则 7 第 2 点）：局部 (u, v)，u 沿正面 0..W−1，v 由正面往里 0..D−1；先取 (x, y) = (u, −v)，
 * 再按 k = floor(facing ÷ (facingDirections ÷ rules.facility.blueprintRotationSteps)) 顺时针转 k 档（每档 (x, y) → (y, −x)，即四分之一圈），加到锚点；
 * 第 ℓ 层落在层号 anchor.z + 1 + storeyBase + ℓ（ℓ = 0..storeys−1）。facing 奇数向下取偶（卷十九 §4.4 规则 2 ④、Q29）。
 * @returns {Cell[]}
 */
function boxCells(anchor, facing, plan, storeys, storeyBase, directions, steps) {
  const turns = Math.floor(facing / (directions / steps)) % steps;
  /** @type {Cell[]} */
  const out = [];
  for (let u = 0; u < plan[PLAN.width]; u += 1) {
    for (let v = 0; v < plan[PLAN.depth]; v += 1) {
      let x = u;
      let y = -v;
      for (let k = 0; k < turns; k += 1) [x, y] = [y, -x];
      for (let l = 0; l < storeys; l += 1) out.push({ w: anchor.w, x: anchor.x + x, y: anchor.y + y, z: anchor.z + 1 + storeyBase + l });
    }
  }
  return out;
}

/**
 * 由加载期登记与世界数据建建筑足迹索引（卷五 §4.1 规则 2、11）：挂 rules.gen.roleFacility 所指组件类的 place 行逐栋铺外包盒。
 * 形制条目经 place 表 form 维度登记的词表族取（不写族名）。字段缺或形状不对即 E-DIM-STRUCT-FIELD。
 * claimantsAt(pos)：占这一格的建筑行（按 id 码点序），格不在任何建筑里为空表。
 * @param {{tables: Map<string, unknown>}} registry @param {Parameters<typeof ruleValue>[0] & {vocabDoc?: unknown}} docData @param {{kind: string}} placeTree @returns {Footprints}
 */
export function bakeFootprints(registry, docData, placeTree) {
  const kind = placeTree.kind;
  const doc = Object(registry.tables.get(kind));
  const rows = isObj(doc.rows) ? doc.rows : {};
  const role = String(ruleValue(docData, GEN, ROLE_FACILITY));
  const directions = Number(ruleValue(docData, GRID, FACING_DIRECTIONS));
  const steps = Number(ruleValue(docData, FACILITY, ROTATION_STEPS));
  // 每档蓝图朝向须占整数个八向序号（档间不留缝）；整数旋转 (x, y) → (y, −x) 只对四分之一圈成立，换别的档数要随蓝图卡换旋转（卷十九 Q29）。
  if (!Number.isSafeInteger(directions / steps)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.${FACILITY}.${ROTATION_STEPS} ${steps} must divide rules.${GRID}.${FACING_DIRECTIONS} ${directions}`);
  const formVocab = Object(Object(doc.dimensions)[DIM.form]).vocab;
  const forms = Object(Object(Object(Object(docData.vocabDoc).families)[formVocab]).entries);
  /** @type {Map<string, readonly Cell[]>} */
  const cells = new Map();
  /** @type {Map<string, string[]>} */
  const at = new Map();
  const ids = Object.keys(rows).filter((id) => Array.isArray(Object(rows[id])[DIM.classes]) && rows[id][DIM.classes].includes(role)).sort(byCodePoint);
  for (const id of ids) {
    const row = rows[id];
    const anchor = Object(need(kind, id, row, DIM.anchor));
    const facing = Number(need(kind, id, row, DIM.facing));
    const plan = Object(need(kind, id, row, DIM.planCells));
    const storeys = Number(need(kind, id, row, DIM.storeys));
    const storeyBase = Object(forms[String(need(kind, id, row, DIM.form))])[STOREY_BASE];
    const ok = cellKey(anchor) !== null && isInt(facing) && facing >= 0 && facing < directions && isObj(plan)
      && isInt(plan[PLAN.width]) && plan[PLAN.width] >= 1 && isInt(plan[PLAN.depth]) && plan[PLAN.depth] >= 1 && isInt(storeys) && storeys >= 1 && isInt(storeyBase);
    if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `bakeFootprints: ${kind} ${id} needs an integer anchor, facing in [0, ${directions}), planCells, storeys and a form entry with ${STOREY_BASE}`);
    const own = Object.freeze(boxCells(anchor, facing, plan, storeys, storeyBase, directions, steps).map((c) => Object.freeze(c)));
    cells.set(id, own);
    for (const c of own) {
      const k = String(cellKey(c));
      const list = at.get(k);
      if (list === undefined) at.set(k, [id]); else list.push(id);
    }
  }
  const none = Object.freeze([]);
  return Object.freeze({
    kind,
    ids: Object.freeze(ids),
    cellsOf: (/** @type {string} */ id) => cells.get(id) || none,
    claimantsAt: (/** @type {unknown} */ pos) => {
      const k = cellKey(pos);
      return k === null ? none : Object.freeze([...(at.get(k) || none)]);
    },
  });
}

/**
 * 足迹索引的摘要（只供 verifyBake 核两次构建一致）：每栋的格表规范序列化后交 engine.digestCap。
 * @param {{digestCap: {sha256Hex: (data: string, encoding: 'utf8') => string}}} engine @param {Footprints} fp @returns {string}
 */
export function footprintsDigest(engine, fp) {
  return engine.digestCap.sha256Hex(canonical({ kind: fp.kind, rows: fp.ids.map((id) => [id, fp.cellsOf(id)]) }), 'utf8');
}

/**
 * 加载核对（卷五 §4.1 规则 3；contracts.json ctr_settlement_subzone：同一父下的建筑在细格上两两不相交）：
 * 一格被同父的两栋建筑占即 E-GRID-SIBLING-OVERLAP；父行自己有足迹（建筑套建筑）时子足迹须在父足迹之内，否则 E-GRID-FOOTPRINT-OUTSIDE-PARENT。
 * 区域父足迹未建（主会话 Q3 甲），子 ⊆ 父只对有足迹的父判。
 * @param {{bake: {footprints: Footprints, placeTree: {parentOf: ReadonlyMap<string, string | null>}}}} engine
 */
export function checkFootprints(engine) {
  const { footprints: fp, placeTree } = engine.bake;
  for (const id of fp.ids) {
    const parent = placeTree.parentOf.get(id) ?? null;
    const parentCells = parent === null ? [] : fp.cellsOf(parent);
    const inParent = new Set(parentCells.map((c) => cellKey(c)));
    for (const c of fp.cellsOf(id)) {
      const twin = fp.claimantsAt(c).find((o) => o !== id && (placeTree.parentOf.get(o) ?? null) === parent);
      if (twin !== undefined) throw new KernelError('E-GRID-SIBLING-OVERLAP', {}, `${fp.kind} ${id} and ${twin} (both under ${String(parent)}) share cell ${cellKey(c)}`);
      if (parentCells.length > 0 && !inParent.has(cellKey(c))) throw new KernelError('E-GRID-FOOTPRINT-OUTSIDE-PARENT', {}, `${fp.kind} ${id}: cell ${cellKey(c)} is outside its parent ${String(parent)}`);
    }
  }
}
