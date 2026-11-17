// kernelApi 存储函数 `readPath`、`writePath`、`readSealed`、`writeSealed`（卷二 §2.6"按路径读写"唯一定义 :493–497；§2.7 kernelApi :580–581、:614–615；
// §2.9 第 3 条 :1130 文字只走 readSealed/writeSealed）。卷二十七 R27-4.4：未在 pathTypes 声明的路径写不进状态。
// 运行期核对一律按加载期收下的声明表合并结果（kernel/load/state-owners.mjs 的 merged）：路径模式、值类型、写者、keyKinds；不认任何具体顶层键、路径或文件。
// 写只在事务内（kernel/transaction.mjs）：每次写前记撤销项，任何一次写入被拒由事务整笔回滚（§2.6"事务内拒写的处置"）。
// 本卡（块 2 第 2-3 张）只建这四个函数；canonical、applyPatches、atomicJSON 等存档部分随 2-4 并入本文件。

import { clone } from './clone.mjs';
import { statePathSegments, pathTypeShape } from './handles/keys.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { compareSpecificity, KEY_NONENTITY } from './load/state-owners.mjs';
import { registry } from './vocab.mjs';
import { KernelError } from './errors.mjs';
import { currentTransaction } from './transaction.mjs';

/**
 * @typedef {{pattern: string, segs: string[], type: string, shape: import('./handles/keys.mjs').PathTypeShape | null, entitySlots: number[]}} PathRec
 * entitySlots：该模式第几个 `*` 段（从 0 计）的 keyKinds 项含实体 kind（(a) 单个或 (b) 列表里有实体 kind；(c) 项不算），用于"目标实体未终止"核对。
 * @typedef {{pattern: string, segs: string[], create: string[], rewrite: string | null, viaRelocate: boolean}} WriterRec
 */

/** @type {null | {paths: PathRec[], pPatterns: Set<string>, textPatterns: Set<string>, writers: WriterRec[]}} */
let decl = null;

/** 终止协议的标记键（§2.6 实体终止协议第 2 步 `state.terminated[entityId]`；内核协议自己的键，与 load/state-owners.mjs 的协议键同一出处）。 */
export const TERMINATED_KEY = 'terminated';

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
    return { pattern, segs: segsOf(pattern), type: merged.pathTypes[pattern], shape: pathTypeShape(merged.pathTypes[pattern]), entitySlots };
  });
  const pPatterns = new Set(paths.map((p) => p.pattern).filter((p) => !text.has(p) && !ledger.has(p)));
  const writers = (merged.writers || []).map((w) => ({ pattern: w.pattern, segs: segsOf(w.pattern), create: [...(w.create || [])], rewrite: w.rewrite, viaRelocate: w.viaRelocate === true }));
  decl = { paths, pPatterns, textPatterns: text, writers };
}

function need() {
  if (!decl) throw new Error('kernel/storage.mjs: used before installStorage (load order)');
  return decl;
}

// 模式段是否覆盖具体路径段（`*` 恰匹配一段）。
const covers = (pat, segs) => pat.length === segs.length && pat.every((s, i) => s === '*' || s === segs[i]);

// 覆盖该具体路径的最具体一条（§2.7 路径模式匹配语义：最具体模式优先）。
function mostSpecific(recs, segs) {
  const hit = recs.filter((r) => covers(r.segs, segs));
  if (!hit.length) return null;
  return hit.sort((a, b) => compareSpecificity(b.pattern, a.pattern))[0];
}

// 具体路径的 `*` 段值（按模式里 `*` 的次序）。
const starValues = (pat, segs) => pat.map((s, i) => (s === '*' ? segs[i] : null)).filter((v) => v !== null);

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
    case 'number': return typeof v === 'number'; // 非有限值拒写归 2-5（卷二十七 R27-5.1，体检 K2-20），经同一上抛通路
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'EventId': return isCode(v);
    case 'ref': return isCode(v) && registry().idIndex.get(v) === shape.name;
    case 'enum': { const rec = isCode(v) ? registry().vocabIndex.get(v) : undefined; return rec !== undefined && rec.family === shape.name; }
    case 'dimension': return plainValue(v);
    case 'struct': return v !== null && typeof v === 'object' && !Array.isArray(v) && plainValue(v);
    case 'list': return Array.isArray(v) && v.every((x) => typeOk(shape.item, x));
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
}

/**
 * 该事务能不能写这条具体路径：最具体的写者模式的改写写者是当前节点所在文件；或当前文件是该模式的建行写者且路径上还没有值（建行时落初值）。
 * 带 viaRelocate 的模式，改写写者不得直接 writePath，只能经行改挂原语（§2.6"行改挂"第 1 点 ②、第 7 点）。
 */
function writerOk(d, tx, segs, existing) {
  const w = mostSpecific(d.writers, segs);
  if (!w || typeof tx.file !== 'string') return false;
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
  const d = need();
  const { segs, rec } = resolvePath(path);
  const ids = starValues(rec.segs, segs);
  const entity = rec.entitySlots.length ? ids[rec.entitySlots[0]] : null;
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity }, 'writePath outside the transaction of this state');
  const existing = getAt(state, segs);
  if (!writerOk(d, tx, segs, existing)) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity }, `${tx.file} is not the registered writer of ${rec.pattern}`);
  if (!typeOk(rec.shape, value)) throw new KernelError('E-TEXT-UNGATED', { entity }, `value does not match pathTypes ${rec.pattern}: ${rec.type}`);
  const marks = getAt(state, [TERMINATED_KEY]);
  for (const slot of rec.entitySlots) {
    const id = ids[slot];
    if (marks && typeof marks === 'object' && Object.hasOwn(marks, id)) throw new KernelError('E-TERM-RESIDUE', { entity: id }, `entity ${id} is terminated`);
  }
  setAt(tx, segs, clone(value));
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
  const d = need();
  const { segs } = resolveText(path);
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'writeSealed outside the transaction of this state');
  const w = mostSpecific(d.writers, segs);
  if (!w || w.rewrite !== tx.file) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'caller is not the textWriters writer of this path');
  if (!credentialCheck || credentialCheck(credential, path) !== true) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'credential rejected');
  const shapeOk = sealed !== null && typeof sealed === 'object' && !Array.isArray(sealed)
    && Object.keys(sealed).every((k) => k === 'bytes' || k === 'digest') && typeof sealed.bytes === 'string' && typeof sealed.digest === 'string';
  if (!shapeOk) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'value is not a Sealed {bytes, digest}');
  setAt(tx, segs, clone(sealed));
}
