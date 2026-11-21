// kernelApi 存储函数 `readPath`、`writePath`、`readSealed`、`writeSealed`（卷二 §2.6"按路径读写"唯一定义 :493–497；§2.7 kernelApi :580–581、:614–615；
// §2.9 第 3 条 :1130 文字只走 readSealed/writeSealed）。卷二十七 R27-4.4：未在 pathTypes 声明的路径写不进状态。
// 运行期核对一律按加载期收下的声明表合并结果（kernel/load/state-owners.mjs 的 merged）：路径模式、值类型、写者、keyKinds；不认任何具体顶层键、路径或文件。
// 写只在事务内（kernel/transaction.mjs）：每次写前记撤销项，任何一次写入被拒由事务整笔回滚（§2.6"事务内拒写的处置"）。
// 块 2 第 2-4 张并入：规范序列化 canonical、canonicalEqual、applyPatches/diffPatches（体检 K2-01、K2-03；从 old-final-1117 server-plugin/storage.mjs 改写搬入），
// 以及存档序列化用的 pathTypes 查询（pathTypeRecords、pathTypeOf、valueFitsPathType；卷二十七 R27-4.4 存什么、存成什么类型唯一依据 pathTypes）。
// atomicJSON 要 node:fs，按卷二 §2.7 import 矩阵 kernel 行（:779）只许在 kernel/save.mjs，故落在 save.mjs，不在本文件。

import { clone } from './clone.mjs';
import { invalidateMemo } from './memo.mjs';
import { statePathSegments, pathTypeShape, isSeedKey, isGridKeySeg } from './handles/keys.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { compareSpecificity, KEY_NONENTITY, KEY_DIMKEY, KEY_SEEDKEY, KEY_HANDLE, KEY_GRIDKEY } from './load/state-owners.mjs';
import { registry, kindOfEntity } from './vocab.mjs';
import { KernelError, codeOf } from './errors.mjs';
import { currentTransaction } from './transaction.mjs';
import { T, GRAMMAR_TOKENS, DATED_RECORD_FIELDS } from './handles/markers.mjs';

// pathTypes 值文法里超出 §1.5 类型名的固定记号：定义源在 kernel/handles/markers.mjs（卷二 §2.7 :811 的 EventId、dimension 与 sealed 行），
// 这里只引用；§2.9 第 3 条 Sealed 的 bytes/digest 字段、本文件内部 Patch 的 op 取值与 JS 原型污染防护键在本文件定义，比较处引用成员。
const TYPE_EXTRA = T.path_type_extra;
const SEALED_FIELD_LIST = ['bytes', 'digest'];
const PATCH = Object.freeze({ set: 'set', delete: 'delete' });
const UNSAFE_KEY_LIST = ['__proto__', 'prototype', 'constructor'];

/**
 * @typedef {{pattern: string, segs: string[], type: string, shape: import('./handles/keys.mjs').PathTypeShape | null, entitySlots: number[], entityKinds: string[][], dimSlot: number, seedSlots: {slot: number, kinds: string[]}[], gridSlots: number[]}} PathRec
 * entitySlots：该模式第几个 `*` 段（从 0 计）的 keyKinds 项含实体 kind（(a) 单个或 (b) 列表里有实体 kind；(c) 项不算），用于"目标实体未终止"核对。
 * entityKinds：与 entitySlots 一一对应的该段可取的实体 kind；dimSlot：keyKinds 项为 dimKey 的 `*` 段（没有为 -1），dimension 路径的维度名在这一段。
 * seedSlots：keyKinds 项为 seedKey（或 (b) 列表含 seedKey）的 `*` 段及同列的实体 kind，写入时按 SeedKey 文法核。
 * gridSlots：keyKinds 项为 gridKey 的 `*` 段下标（cells/fieldCells 的前三段），写入时三段合起来按 isGridKeySeg 核。
 * @typedef {{pattern: string, segs: string[], create: string[], rewrite: string | null, viaRelocate: boolean, dated: boolean}} WriterRec
 */

/** @type {null | {paths: PathRec[], pPatterns: Set<string>, textPatterns: Set<string>, writers: WriterRec[], dated: PathRec[]}} */
let decl = null;

/** 终止协议的标记键（§2.6 实体终止协议第 2 步 `state.terminated[entityId]`；内核协议自己的键，与 load/state-owners.mjs 的协议键同一出处）。 */
export const TERMINATED_KEY = 'terminated';

/** 运行期才产生的路径段文法（按 keyKind 分派；以后加同类段只登一行）。handle 段文法即 §1.9 代号文法 CODE_RE（4-2）；seedKey 另须非词表代号、非已载入实体 id。 */
const RUNTIME_SEG_GRAMMAR = Object.freeze({
  [KEY_SEEDKEY]: (reg, v) => isSeedKey(reg, v),
  [KEY_HANDLE]: (_reg, v) => typeof v === 'string' && CODE_RE.test(v),
});

// gridKey 段的运行期核对要格常数（里块边长），取规则表 rules.grid；kernel/load/world.mjs 每次成功加载随 installStorage 一起装入（同 installScheduler 的先例，重装即覆盖上一次的）。
// 世界没有登记 rules.grid 时用到即报 E-RULES-UNREGISTERED（不设缺省，卷二 :852）。
/** @type {null | {cellM: number, regionCellM: number, chunkRegionCells: number}} */
let gridRules = null;

/**
 * 交入 rules.grid 供运行期 gridKey 段核对（kernel 组内用，不在 kernelApi）。
 * @param {{cellM: number, regionCellM: number, chunkRegionCells: number} | null | undefined} grid rules.grid（世界没有登记即 null）
 */
export function installGridRules(grid) {
  gridRules = grid && typeof grid === 'object' ? grid : null;
}

function gridRulesNow() {
  if (gridRules === null) throw new KernelError('E-RULES-UNREGISTERED', {}, 'storage: rules.grid is not registered, gridKey segments cannot be checked');
  return gridRules;
}

const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const segsOf = (p) => statePathSegments(p) || [];

/**
 * 加载期收下声明表合并结果（加载入口在 mergeStateOwners 通过后调一次；kernel 组内用，不在 kernelApi）。
 * @param {{writers: any[], pathTypes: Record<string, string>, keyKinds: Record<string, any[]>, textPaths: string[], ledgerPaths: string[]}} merged
 */
export function installStorage(merged) {
  const text = new Set(merged.textPaths || []);
  const ledger = new Set(merged.ledgerPaths || []);
  const nonEntity = new Set(KEY_NONENTITY);
  const isEntityItem = (it) => (Array.isArray(it) ? it.some((k) => !nonEntity.has(k)) : typeof it === 'string' && !nonEntity.has(it));
  const paths = sorted(Object.keys(merged.pathTypes || {})).map((pattern) => {
    const kk = Array.isArray((merged.keyKinds || {})[pattern]) ? merged.keyKinds[pattern] : [];
    const entitySlots = kk.map((it, i) => (isEntityItem(it) ? i : -1)).filter((i) => i >= 0);
    const entityKinds = entitySlots.map((i) => (Array.isArray(kk[i]) ? kk[i] : [kk[i]]).filter((k) => !nonEntity.has(k)));
    const dimSlot = kk.findIndex((it) => it === KEY_DIMKEY); // keyKinds (c) 项"维度键"：dimension 路径上维度名所在的段
    // keyKinds (c) 运行期段（RUNTIME_SEG_GRAMMAR 的键，如 seedKey、handle；单独或在 (b) 列表里）：该段写入时按各自文法核（李白 11-18 05:50 裁定第 2 条整类规则）；列表里同列的实体 kind 照收该 kind 的已载入 id。
    const seedSlots = kk.flatMap((it, i) => {
      const members = Array.isArray(it) ? it : [it];
      const grammars = members.filter((k) => Object.hasOwn(RUNTIME_SEG_GRAMMAR, k));
      return grammars.length ? [{ slot: i, grammars, kinds: Array.isArray(it) ? it.filter((k) => !nonEntity.has(k)) : [] }] : [];
    });
    // gridKey 段（keyKinds (c) 第六个，卷二 :852）：cells/fieldCells 前三段；写入时三段合起来核，不走 RUNTIME_SEG_GRAMMAR 的单段分派。
    const gridSlots = kk.map((it, i) => (it === KEY_GRIDKEY ? i : -1)).filter((i) => i >= 0);
    return { pattern, segs: segsOf(pattern), type: merged.pathTypes[pattern], shape: pathTypeShape(merged.pathTypes[pattern]), entitySlots, entityKinds, dimSlot, seedSlots, gridSlots };
  });
  const pPatterns = new Set(paths.map((p) => p.pattern).filter((p) => !text.has(p) && !ledger.has(p)));
  const writers = (merged.writers || []).map((w) => ({ pattern: w.pattern, segs: segsOf(w.pattern), create: [...(w.create || [])], rewrite: w.rewrite, viaRelocate: w.viaRelocate === true, dated: w.dated === true }));
  // dated 写者的模式本身就是改写记录的存放路径（加载期已核：恰两个 `*` 段，一个实体类段、一个 dimKey 段，同一实体类至多一条）；读取与追加都按这份 PathRec。
  const datedPaths = writers.filter((w) => w.dated).flatMap((w) => paths.filter((p) => p.pattern === w.pattern));
  decl = { paths, pPatterns, textPatterns: text, writers, dated: datedPaths };
}

function need() {
  if (!decl) throw new Error('kernel/storage.mjs: used before installStorage (load order)');
  return decl;
}

// 模式段是否覆盖具体路径段（`*` 恰匹配一段）。
const covers = (pat, segs) => pat.length === segs.length && pat.every((s, i) => s === GRAMMAR_TOKENS.wildcard || s === segs[i]);

// 覆盖该具体路径的最具体一条（§2.7 路径模式匹配语义：最具体模式优先）。
function mostSpecific(recs, segs) {
  const hit = recs.filter((r) => covers(r.segs, segs));
  if (!hit.length) return null;
  return hit.sort((a, b) => compareSpecificity(b.pattern, a.pattern))[0];
}

// 具体路径的 `*` 段值（按模式里 `*` 的次序）。
const starValues = (pat, segs) => pat.map((s, i) => (s === GRAMMAR_TOKENS.wildcard ? segs[i] : null)).filter((v) => v !== null);

/**
 * 核对实参是 P 句柄给出的 StatePath：是字串、各段非空、最具体的 pathTypes 模式可生成 P 构造函数（不是 textPaths、账本账户路径）。
 * 不合即 E-PATH-UNDECLARED（R27-4.4"未声明路径写不进状态"同码）。
 * @param {unknown} path
 * @returns {{segs: string[], rec: PathRec}}
 */
function resolvePath(path) {
  const d = need();
  const segs = statePathSegments(path);
  const rec = segs ? mostSpecific(d.paths, segs) : null;
  if (!segs || !rec || !d.pPatterns.has(rec.pattern)) throw new KernelError('E-PATH-UNDECLARED', { entity: null }, 'path is not a StatePath from handle P (declared, non-text, non-ledger pathTypes pattern)');
  return { segs, rec };
}

// 按段读；中途不是对象即 undefined。
function getAt(state, segs) {
  let cur = state;
  for (const s of segs) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

/**
 * kernelApi `readPath(state, path)`（§2.6 第 1 条）：path 只能是 P 句柄给的 StatePath。返回该路径上的值的副本（没有即 undefined）。
 * @template {string} P
 * @param {any} state
 * @param {import('./types.d.ts').StatePath<P>} path
 * @returns {any}
 */
export function readPath(state, path) {
  const { segs } = resolvePath(path);
  const v = getAt(state, segs);
  return v === undefined ? undefined : clone(v);
}

// ---------- 值类型核对（§2.6 第 3 条"值符合 pathTypes 的声明类型"，不符 E-TEXT-UNGATED） ----------

// 代号形态的字串：实体 id、句柄值、事件 id（§1.9 :278 文法）。state 里 textPaths 之外不存文字（§2.9 第 3 条），所以别的字串一律不收。
const isCode = (v) => typeof v === 'string' && CODE_RE.test(v);

// 维度值与 struct 字段值：数值、布尔、null、代号，及其数组与对象。
function plainValue(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return true;
  if (typeof v === 'string') return isCode(v);
  if (Array.isArray(v)) return v.every(plainValue);
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v).every(plainValue);
  return false;
}

/** @param {import('./handles/keys.mjs').PathTypeShape | null} shape @param {unknown} v */
function typeOk(shape, v) {
  if (!shape) return false;
  switch (shape.base) {
    case T.type.number: return typeof v === 'number'; // 非有限值、负零在此之前已按 R27-5.1 拒写（E-DET-NONFINITE）
    case T.type.integer: return Number.isInteger(v);
    case T.type.boolean: return typeof v === 'boolean';
    case TYPE_EXTRA.EventId: return isCode(v);
    case T.type.ref: return isCode(v) && registry().idIndex.get(v) === shape.name;
    case T.type.enum: { const rec = isCode(v) ? registry().vocabIndex.get(v) : undefined; return rec !== undefined && rec.family === shape.name; }
    case TYPE_EXTRA.dimension: return plainValue(v);
    case T.type.struct: return v !== null && typeof v === 'object' && !Array.isArray(v) && plainValue(v);
    case T.type.list: return Array.isArray(v) && v.every((x) => typeOk(shape.item, x));
    default: return false; // sealed：文字只走 writeSealed
  }
}

// ---------- 写 ----------

// 在事务上下文里写（记撤销项）；中途缺的对象层补成空对象。
function setAt(tx, segs, value) {
  let cur = tx.state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!Object.hasOwn(cur, s) || cur[s] === null || typeof cur[s] !== 'object') {
      tx.undo.push({ segs: segs.slice(0, i + 1), existed: Object.hasOwn(cur, s), prev: cur[s] });
      cur[s] = {};
    }
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  tx.undo.push({ segs, existed: Object.hasOwn(cur, last), prev: cur[last] });
  cur[last] = value;
  tx.written.push([...segs]);
  invalidateMemo(tx.state); // state 变了，按它算的 stateMemo 一律作废（kernel/memo.mjs）
}

/**
 * 该事务能不能写这条具体路径：最具体的写者模式的改写写者是当前节点所在文件；或当前文件是该模式的建行写者且路径上还没有值（建行时落初值）。
 * 带 viaRelocate 的模式，改写写者不得直接 writePath，只能经行改挂原语（§2.6"行改挂"第 1 点 ②、第 7 点）。
 * 带 dated 的模式，任何文件都不得 writePath：改写记录只追加、不覆盖（§2.7 dated），只经 appendDated。
 */
function writerOk(d, tx, segs, existing) {
  const w = mostSpecific(d.writers, segs);
  if (!w || typeof tx.file !== 'string' || w.dated) return false;
  if (w.rewrite === tx.file) return !w.viaRelocate;
  return w.create.includes(tx.file) && existing === undefined;
}

/**
 * kernelApi `writePath(state, path, value)`（§2.6 第 3 条运行期一道）：只在事务内；依次核对写者（E-VIEW-UNDECLARED-WRITE）、值类型（E-TEXT-UNGATED）、
 * 目标实体未终止（E-TERM-RESIDUE）。任一不符抛 KernelError，由事务整笔回滚并记日志。值按副本写入。
 * @template {string} P
 * @param {any} state
 * @param {import('./types.d.ts').StatePath<P>} path
 * @param {any} value
 * @returns {void}
 */
export function writePath(state, path, value) {
  try {
    writePathChecked(state, path, value);
  } catch (e) {
    markDenied(e);
    throw e;
  }
}

// 值里（含嵌套数组、对象）有非有限数或负零（R27-5.1）。
function hasNonFinite(v) {
  if (typeof v === 'number') return !Number.isFinite(v) || Object.is(v, -0);
  if (Array.isArray(v)) return v.some(hasNonFinite);
  if (v !== null && typeof v === 'object') return Object.values(v).some(hasNonFinite);
  return false;
}

// dimension 路径上这一段维度名在该实体所属表（idIndex 查不到时为 keyKinds 列出的各表）里是 string 维度。
function stringDimension(rec, ids) {
  if (rec.dimSlot < 0) return false;
  const name = ids[rec.dimSlot];
  const reg = registry();
  const id = rec.entitySlots.length ? ids[rec.entitySlots[0]] : null;
  const known = id === null ? undefined : reg.idIndex.get(id);
  const kinds = known !== undefined ? [known] : rec.entityKinds.length ? rec.entityKinds[0] : [];
  return kinds.some((k) => { const dims = reg.tableDims.get(k); return !!dims && Object.hasOwn(dims, name) && dims[name] && dims[name].type === T.type.string; });
}

// 写入被拒时先在当前事务上记"已被拒"（卷二 :499、:1033）：规则层即使 catch 住这次拒写，runTransaction 见标记仍整笔回滚。
function markDenied(e) {
  const tx = currentTransaction();
  if (tx && codeOf(e) !== null && tx.denied === undefined) tx.denied = e;
}

function writePathChecked(state, path, value) {
  const d = need();
  const { segs, rec } = resolvePath(path);
  const ids = starValues(rec.segs, segs);
  const entity = rec.entitySlots.length ? ids[rec.entitySlots[0]] : null;
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity }, 'writePath outside the transaction of this state');
  const existing = getAt(state, segs);
  if (!writerOk(d, tx, segs, existing)) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity }, `${tx.file} is not the registered writer of ${rec.pattern}`);
  checkRuntimeSegments(rec, ids);
  // 卷二十七 R27-5.1：非有限值、负零不得进入状态（E-DET-NONFINITE）；被拒走同一上抛通路，由事务整笔回滚（卷二 §2.6 :499）。
  if (hasNonFinite(value)) throw new KernelError('E-DET-NONFINITE', { entity }, `non-finite number or negative zero written to ${rec.pattern}`);
  // 卷二 §2.7 :804 pathTypes 文法 dimension 行：运行期写 string 维度即 E-TEXT-UNGATED（dimension 路径上存不进自然语言）。
  if (rec.shape && rec.shape.base === TYPE_EXTRA.dimension && stringDimension(rec, ids)) throw new KernelError('E-TEXT-UNGATED', { entity }, `${rec.pattern}: string dimension is not a dimension path`);
  if (!typeOk(rec.shape, value)) throw new KernelError('E-TEXT-UNGATED', { entity }, `value does not match pathTypes ${rec.pattern}: ${rec.type}`);
  checkNotTerminated(state, rec, ids);
  setAt(tx, segs, clone(value));
}

// keyKinds 运行期段（seedKey、handle 及以后同类）：按各自文法核，不过即 E-PATH-KEYKINDS（卷二 :1545、:815，勘误 1118k10、1118k12；李白 11-18 05:50 裁定第 2 条）；
// gridKey 段（卷二 :852）：三段合起来核——w、里块号、格键都合文法，且格键 (x, y) 算出的里块等于路径里的里块号；不过 E-PATH-KEYKINDS（同 seedKey 整类规则）。
function checkRuntimeSegments(rec, ids) {
  for (const { slot, grammars, kinds } of rec.seedSlots) {
    const v = ids[slot];
    if (!grammars.some((g) => RUNTIME_SEG_GRAMMAR[g](registry(), v)) && !kinds.includes(registry().idIndex.get(v))) throw new KernelError('E-PATH-KEYKINDS', { entity: null }, `${rec.pattern}: segment ${JSON.stringify(v)} does not fit ${grammars.join('/')} grammar`);
  }
  if (rec.gridSlots.length) {
    const gv = rec.gridSlots.map((slot) => ids[slot]);
    if (!isGridKeySeg(gridRulesNow(), ...gv)) throw new KernelError('E-PATH-KEYKINDS', { entity: null }, `${rec.pattern}: gridKey segments ${JSON.stringify(gv)} do not fit the cells.<w>.<chunk>.<cell> grammar or the cell is not in that chunk`);
  }
}

// 目标实体未终止（卷二 §2.6 E-TERM-RESIDUE）：路径上每个实体段都不在 state.terminated 里。
function checkNotTerminated(state, rec, ids) {
  const marks = getAt(state, [TERMINATED_KEY]);
  for (const slot of rec.entitySlots) {
    const id = ids[slot];
    if (marks && typeof marks === 'object' && Object.hasOwn(marks, id)) throw new KernelError('E-TERM-RESIDUE', { entity: id }, `entity ${id} is terminated`);
  }
}

// ---------- 按日生效改写记录（卷二 §2.7 dated :796；§1.3 最上一级 :164） ----------

const DATED_KEYS = T.dated_field;

/**
 * 内核组内的追加口（kernelApi 入口是 kernel/dated.mjs#writeDated，它给出写入时的当前日 today）：往 dated 写者模式的记录路径末尾追加一条 `{fromDay, value, cause}`。
 * 只在事务内；当前文件须是该模式登记的改写写者（E-VIEW-UNDECLARED-WRITE）；`fromDay` 须是大于 today 的整数，否则 E-DATED-FROMDAY 拒写、不落任何记录
 * （0、负数、小数、NaN、非数、缺都拒，没有"不限"之类的特殊值）；记录只含三个字段，cause 是代号形态的事件记录 id，value 是纯数据（非有限数 E-DET-NONFINITE）；
 * 路径里的实体须已载入或已建行、维度须是其表的维度、派生维度（无显式通道）与 string 维度拒写（同 writeItemDeviation 的口径）。追加不改旧记录。
 * value 另按维度定义核（fitValue(kind, id, dimension, def, value)，由 writeDated 交入 checkField；不合抛校验器给的码）。
 * 模式的维度段是 dimKey 通配或字面维度名：字面模式只管那一维，其他维度没有记录路径（resolvePath 即 E-PATH-UNDECLARED），位置量等非 dated 维度因此追加不进。
 * @param {any} state @param {string} path 记录路径（P 句柄给的 StatePath） @param {{fromDay: number, value: any, cause: string}} record @param {number} today 写入时的当前日
 * @param {(kind: string, id: string, dimension: string, def: any, value: any) => void} fitValue
 * @returns {void}
 */
export function appendDated(state, path, record, today, fitValue) {
  try {
    appendDatedChecked(state, path, record, today, fitValue);
  } catch (e) {
    markDenied(e);
    throw e;
  }
}

// dated 记录路径上的维度：维度键通配段取路径里的值，字面维度名（模式的最后一段）取它自己。
function datedDimensionOf(rec, ids) {
  return rec.dimSlot >= 0 ? ids[rec.dimSlot] : rec.segs[rec.segs.length - 1];
}

function appendDatedChecked(state, path, record, today, fitValue) {
  const d = need();
  const { segs, rec } = resolvePath(path);
  const ids = starValues(rec.segs, segs);
  const entity = rec.entitySlots.length ? ids[rec.entitySlots[0]] : null;
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity }, 'appendDated outside the transaction of this state');
  const w = mostSpecific(d.writers, segs);
  if (!w || !w.dated || typeof tx.file !== 'string' || w.rewrite !== tx.file) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity }, `${tx.file} is not the registered dated rewrite writer of ${rec.pattern}`);
  checkRuntimeSegments(rec, ids);
  if (!Number.isSafeInteger(today)) throw new KernelError('E-DATED-FROMDAY', { entity }, 'appendDated: the current day is not an integer');
  const shapeOk = record !== null && typeof record === 'object' && !Array.isArray(record) && Object.keys(record).length === DATED_RECORD_FIELDS.length && DATED_RECORD_FIELDS.every((f) => Object.hasOwn(record, f));
  if (!shapeOk) throw new KernelError('E-DIM-STRUCT-FIELD', { entity }, `a dated record is {${DATED_RECORD_FIELDS.join(', ')}}`);
  if (!Number.isSafeInteger(record[DATED_KEYS.fromDay]) || record[DATED_KEYS.fromDay] <= today) throw new KernelError('E-DATED-FROMDAY', { entity }, `fromDay ${JSON.stringify(record[DATED_KEYS.fromDay])} must be an integer greater than the current day ${today}`);
  if (!isCode(record[DATED_KEYS.cause])) throw new KernelError('E-DIM-STRUCT-FIELD', { entity }, 'cause is the code of the event record that triggered the rewrite');
  const value = record[DATED_KEYS.value];
  if (hasNonFinite(value)) throw new KernelError('E-DET-NONFINITE', { entity }, `non-finite number or negative zero in a dated record of ${rec.pattern}`);
  if (!plainValue(value)) throw new KernelError('E-TEXT-UNGATED', { entity }, `a dated value must be plain data (${rec.pattern})`);
  const id = ids[rec.entitySlots[0]];
  const dimension = datedDimensionOf(rec, ids);
  const reg = registry();
  let kind;
  try { kind = kindOfEntity(state, id); } catch (e) { throw new KernelError('E-DIM-REF-MISSING', { entity: id }, `${id} is neither a loaded entity nor a built row`); }
  if (!rec.entityKinds[0].includes(kind)) throw new KernelError('E-PATH-KEYKINDS', { entity: id }, `${rec.pattern}: ${id} is a ${kind}, not one of ${rec.entityKinds[0].join('/')}`);
  const dims = reg.tableDims.get(kind);
  const def = dims && Object.hasOwn(dims, dimension) ? dims[dimension] : undefined;
  if (!def) throw new KernelError('E-DIM-REF-MISSING', { entity: id }, `${dimension} is not a dimension of ${kind}`);
  if (def.derived !== undefined && def.allowExplicit !== true) throw new KernelError('E-DIM-DERIVED-WRITTEN', { entity: id }, `${dimension} is derived and has no explicit channel`);
  if (def.type === T.type.string) throw new KernelError('E-TEXT-UNGATED', { entity: id }, `${dimension} is a string dimension: not a dimension path`);
  // value 按表头维度定义核类型、单位、值域、引用（与 writeItemDeviation 同一个 checkField，由调用方交入，不在这里复制）。
  if (typeof fitValue !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', { entity: id }, 'appendDated needs the dimension value check');
  fitValue(kind, id, dimension, def, value);
  checkNotTerminated(state, rec, ids);
  const existing = getAt(state, segs);
  if (existing !== undefined && !Array.isArray(existing)) throw new KernelError('E-DIM-STRUCT-FIELD', { entity: id }, `${rec.pattern}: the stored records are not a list`);
  setAt(tx, segs, [...(existing || []), clone(record)]);
}

/**
 * 某实体某维度当前存着的改写记录（按追加次序；只读，调用者不得改；没有 dated 记录路径、没有装入声明表或没有记录即 null）。kernel 组内用，读取入口是 kernel/dated.mjs。
 * @param {any} state @param {string} kind 实体类 @param {string} id @param {string} dimension
 * @returns {ReadonlyArray<{fromDay: number, value: any, cause: string}> | null}
 */
export function datedRecordsOf(state, kind, id, dimension) {
  if (!decl) return null;
  for (const rec of decl.dated) {
    if (!rec.entityKinds[0] || !rec.entityKinds[0].includes(kind)) continue;
    // 加载期保证同一（实体类，维度）至多一条 dated 模式：字面维度模式只认它那一维，通配模式认全部维度。
    if (rec.dimSlot < 0 && datedDimensionOf(rec, []) !== dimension) continue;
    const given = [];
    given[rec.entitySlots[0]] = id;
    if (rec.dimSlot >= 0) given[rec.dimSlot] = dimension;
    let star = 0;
    const list = getAt(state, rec.segs.map((s) => (s === GRAMMAR_TOKENS.wildcard ? given[star++] : s)));
    return Array.isArray(list) && list.length > 0 ? list : null;
  }
  return null;
}

/**
 * 全部 dated 记录路径下存着的记录，按（具体路径字典序）排好，每个路径内保持追加次序（只读）。"当日有效输入版本"的求法用（kernel/dated.mjs）。没有 dated 模式即空数组。
 * @param {any} state
 * @returns {Array<{path: string, records: Array<{fromDay: number, value: any, cause: string}>}>}
 */
export function datedRecordsAll(state) {
  if (!decl) return [];
  const out = new Map();
  const walk = (node, segs, i, trail) => {
    if (i === segs.length) { if (Array.isArray(node) && node.length > 0) out.set(trail.join(GRAMMAR_TOKENS.pathSep), node); return; }
    if (node === null || typeof node !== 'object') return;
    if (segs[i] === GRAMMAR_TOKENS.wildcard) for (const k of Object.keys(node)) walk(node[k], segs, i + 1, [...trail, k]);
    else if (Object.hasOwn(node, segs[i])) walk(node[segs[i]], segs, i + 1, [...trail, segs[i]]);
  };
  for (const rec of decl.dated) walk(state, rec.segs, 0, []);
  return sorted([...out.keys()]).map((path) => ({ path, records: out.get(path) }));
}

// ---------- 文字（§2.9 第 3 条） ----------

/** @type {null | ((credential: unknown, path: string) => boolean)} */
let credentialCheck = null;

/**
 * 凭证核对由 kernel/credential.mjs（签发凭证那张卡）在加载时交入；未交入前 writeSealed 一律拒写（E-TEXT-UNGATED）。kernel 组内用，不在 kernelApi。
 * @param {(credential: unknown, path: string) => boolean} fn 凭证有效、未用过、绑定的路径就是 path 时返回 true，并记为已用
 */
export function installCredentialCheck(fn) {
  credentialCheck = typeof fn === 'function' ? fn : null;
}

// textPaths 里覆盖该具体路径的模式；不是 textPath 即 E-PATH-UNDECLARED。
function resolveText(path) {
  const d = need();
  const segs = statePathSegments(path);
  const rec = segs ? mostSpecific(d.paths, segs) : null;
  if (!segs || !rec || !d.textPatterns.has(rec.pattern)) throw new KernelError('E-PATH-UNDECLARED', { entity: null }, 'not a textPaths path');
  return { segs, rec };
}

/**
 * kernelApi `readSealed(state, path)`（§2.9 第 3 条 :1130，仅 outputGate）：取 textPaths 上存的 Sealed（没有即 undefined）。只取出，不解封。
 * @param {any} state @param {string} path
 * @returns {any}
 */
export function readSealed(state, path) {
  const { segs } = resolveText(path);
  const v = getAt(state, segs);
  return v === undefined ? undefined : clone(v);
}

/**
 * kernelApi `writeSealed(state, credential, path, sealed)`（§2.9 第 3 条 :1130–1131，仅 aiGate）：只在事务内；当前文件须是 textWriters 登记的该路径写者，
 * 凭证经 kernel 的凭证核对，sealed 须是 Sealed 形态 `{bytes, digest}`。任一不符 E-TEXT-UNGATED。
 * @param {any} state @param {unknown} credential @param {string} path @param {any} sealed
 * @returns {void}
 */
export function writeSealed(state, credential, path, sealed) {
  try {
    writeSealedChecked(state, credential, path, sealed);
  } catch (e) {
    markDenied(e);
    throw e;
  }
}

function writeSealedChecked(state, credential, path, sealed) {
  const d = need();
  const { segs } = resolveText(path);
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'writeSealed outside the transaction of this state');
  const w = mostSpecific(d.writers, segs);
  if (!w || w.rewrite !== tx.file) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'caller is not the textWriters writer of this path');
  if (!credentialCheck || credentialCheck(credential, path) !== true) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'credential rejected');
  const shapeOk = sealed !== null && typeof sealed === 'object' && !Array.isArray(sealed)
    && Object.keys(sealed).every((k) => SEALED_FIELD_LIST.includes(k)) && typeof sealed.bytes === 'string' && typeof sealed.digest === 'string';
  if (!shapeOk) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'value is not a Sealed {bytes, digest}');
  setAt(tx, segs, clone(sealed));
}

// ---------- 存档序列化用的 pathTypes 查询（卷二十七 R27-4.4；kernel 组内用，不在 kernelApi） ----------

/**
 * 加载期收下的全部 pathTypes 模式（含 textPaths 与账本路径），按模式串升序。
 * @returns {ReadonlyArray<{pattern: string, segs: string[], type: string}>}
 */
export function pathTypeRecords() {
  return need().paths.map((p) => ({ pattern: p.pattern, segs: [...p.segs], type: p.type }));
}

/**
 * 具体路径段落在哪条 pathTypes 模式上（最具体模式优先，§2.7）；没有即 null。
 * @param {string[]} segs
 * @returns {{pattern: string, segs: string[], type: string, sealed: boolean} | null}
 */
export function pathTypeOf(segs) {
  const rec = mostSpecific(need().paths, segs);
  return rec ? { pattern: rec.pattern, segs: [...rec.segs], type: rec.type, sealed: rec.shape !== null && rec.shape.base === TYPE_EXTRA.sealed } : null;
}

/**
 * 某条模式下有没有更长的模式（即这一层还只是中间对象，值在更深处）。
 * @param {string[]} segs 具体路径段（前缀）
 * @returns {boolean}
 */
export function pathTypeHasDeeper(segs) {
  return need().paths.some((r) => r.segs.length > segs.length && segs.every((s, i) => r.segs[i] === GRAMMAR_TOKENS.wildcard || r.segs[i] === s));
}

/**
 * 值是否符合该模式在 pathTypes 声明的类型（与 writePath 的类型核对同一判断；sealed 按 {bytes, digest} 形态）。
 * @param {string} pattern @param {unknown} v
 * @returns {boolean}
 */
export function valueFitsPathType(pattern, v) {
  const rec = need().paths.find((r) => r.pattern === pattern);
  if (!rec) return false;
  if (rec.shape && rec.shape.base === TYPE_EXTRA.sealed) return isSealedValue(v);
  return typeOk(rec.shape, v);
}

/**
 * 普通对象的键集恰好是 keys（keys 须已升序）。
 * @param {any} v @param {ReadonlyArray<string>} keys
 * @returns {boolean}
 */
export function hasExactKeys(v, keys) {
  if (!isPlainObject(v)) return false;
  const ks = Object.keys(v).sort();
  return ks.length === keys.length && ks.every((k, i) => k === keys[i]);
}

const SEALED_KEYS = Object.freeze(SEALED_FIELD_LIST);

/**
 * state 里 Sealed 的形态 {bytes, digest}（两项都是字串，再无别的键）。
 * @param {unknown} v
 * @returns {boolean}
 */
export function isSealedValue(v) {
  return hasExactKeys(v, SEALED_KEYS) && typeof v.bytes === 'string' && typeof v.digest === 'string';
}

// ---------- 规范序列化（体检 K2-03、第三节第 3 条：卷一 §8.3 :643"算法 storage.mjs:14 digest() 作用于排除后的文档"，序列化规则写在这里、由测试钉住） ----------
// 规则（tests/kernel/save.test.mjs 逐条有用例）：
//  1. null、true、false 照 JSON 字面量；
//  2. 有限数照 JSON.stringify（ECMAScript Number::toString 最短往返；-0 写成 0）；
//  3. 字串照 JSON.stringify 的转义（不加不减空白）；
//  4. 数组按下标次序 `[a,b]`，无空白；
//  5. 普通对象（原型为 Object.prototype 或 null）按键名 UTF-16 码元升序 `{"k":v}`，无空白；
//  6. 其余（undefined、函数、symbol、bigint、非有限数、稀疏数组、Map、Date、Uint8Array 等非普通对象）不是存档数据，抛错，不静默写成 null 或略去。
// 旧实现对 undefined 写出非 JSON 文本、对非有限数写成 null，新底子改为拒收（同版确定性只要求同输入同输出；存档里本不该有这些值）。

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

function notData(v) {
  return new Error(`canonical: not save data (${v === null ? 'null' : Array.isArray(v) ? 'sparse array' : typeof v})`);
}

function canonicalAtom(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  throw notData(v);
}

/**
 * 规范序列化：同一数据恒得同一字串（规则见上）。存档摘要、分片内容寻址与 canonicalEqual 共用这一种写法。
 * @param {unknown} value
 * @returns {string}
 */
export function canonical(value) {
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw notData(value);
      parts.push(canonical(value[i]));
    }
    return `[${parts.join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    if (!isPlainObject(value)) throw notData(value);
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return canonicalAtom(value);
}

/**
 * canonical(a) === canonical(b)，但不拼出两个字串：同一引用的子树立即判等，遇到第一处不同即停；比到的非存档数据同样抛错。
 * @param {unknown} a @param {unknown} b
 * @returns {boolean}
 */
export function canonicalEqual(a, b) {
  const objA = a !== null && typeof a === 'object', objB = b !== null && typeof b === 'object';
  if (!objA && !objB) return canonicalAtom(a) === canonicalAtom(b);
  if (a === b) return true; // 同一引用：子树共享，不再下探
  if (objA !== objB || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!Object.hasOwn(a, i)) throw notData(a);
      if (!Object.hasOwn(b, i)) throw notData(b);
      if (!canonicalEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (!isPlainObject(a)) throw notData(a);
  if (!isPlainObject(b)) throw notData(b);
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) if (!Object.hasOwn(b, k) || !canonicalEqual(a[k], b[k])) return false;
  return true;
}

// ---------- 补丁（体检 K2-01；旧 storage.mjs applyPatches/diffPatches 改写：不搬 deadPatchValues 提速与 12 段上限） ----------

/** @typedef {{op: 'set', path: string[], value: unknown} | {op: 'delete', path: string[]}} Patch */

const UNSAFE_KEYS = new Set(UNSAFE_KEY_LIST);

/**
 * 依次施加补丁，返回新文档；原文档不动（只复制被写路径上的祖先，其余子树共享）。补丁格式不对、路径含不安全键、中途不是对象即抛错。
 * set 的值按副本放入。
 * @param {any} document @param {Patch[]} patches
 * @returns {any}
 */
export function applyPatches(document, patches) {
  if (!Array.isArray(patches)) throw new Error('applyPatches: patches must be a list');
  const owned = new WeakSet();
  const writable = (v) => {
    if (v === null || typeof v !== 'object') throw new Error('applyPatches: path runs through a non-object');
    if (owned.has(v)) return v;
    const copy = Array.isArray(v) ? [...v] : { ...v };
    owned.add(copy);
    return copy;
  };
  const next = writable(document);
  for (const p of patches) {
    if (p === null || typeof p !== 'object' || (p.op !== PATCH.set && p.op !== PATCH.delete) || !Array.isArray(p.path) || p.path.length === 0) throw new Error('applyPatches: malformed patch');
    if (p.path.some((k) => typeof k !== 'string' || UNSAFE_KEYS.has(k))) throw new Error('applyPatches: unsafe or non-string path key');
    let target = next;
    for (const k of p.path.slice(0, -1)) {
      target[k] = writable(Object.hasOwn(target, k) ? target[k] : {});
      target = target[k];
    }
    const last = p.path[p.path.length - 1];
    if (p.op === PATCH.delete) delete target[last];
    else target[last] = clone(p.value);
  }
  return next;
}

/**
 * 两份文档的净差：对象逐键递归；数组整体（下标不拆）；新加的键整值写入。applyPatches(before, diffPatches(before, after)) 与 after 规范相等。
 * @param {any} before @param {any} after
 * @returns {Patch[]}
 */
export function diffPatches(before, after) {
  /** @type {Patch[]} */
  const out = [];
  const visit = (a, b, path) => {
    if (isPlainObject(a) && isPlainObject(b)) {
      for (const k of Object.keys(a).sort()) if (!Object.hasOwn(b, k)) out.push({ op: 'delete', path: [...path, k] });
      for (const k of Object.keys(b).sort()) {
        if (!Object.hasOwn(a, k)) out.push({ op: 'set', path: [...path, k], value: b[k] });
        else visit(a[k], b[k], [...path, k]);
      }
    } else if (!canonicalEqual(a, b)) {
      if (path.length === 0) throw new Error('diffPatches: documents must both be objects at the root');
      out.push({ op: 'set', path, value: b });
    }
  };
  visit(before, after, []);
  return out;
}
