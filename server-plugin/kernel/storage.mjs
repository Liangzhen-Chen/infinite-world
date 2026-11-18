// kernelApi 存储函数 `readPath`、`writePath`、`readSealed`、`writeSealed`（卷二 §2.6"按路径读写"唯一定义 :493–497；§2.7 kernelApi :580–581、:614–615；
// §2.9 第 3 条 :1130 文字只走 readSealed/writeSealed）。卷二十七 R27-4.4：未在 pathTypes 声明的路径写不进状态。
// 运行期核对一律按加载期收下的声明表合并结果（kernel/load/state-owners.mjs 的 merged）：路径模式、值类型、写者、keyKinds；不认任何具体顶层键、路径或文件。
// 写只在事务内（kernel/transaction.mjs）：每次写前记撤销项，任何一次写入被拒由事务整笔回滚（§2.6"事务内拒写的处置"）。
// 块 2 第 2-4 张并入：规范序列化 canonical、canonicalEqual、applyPatches/diffPatches（体检 K2-01、K2-03；从 old-final-1117 server-plugin/storage.mjs 改写搬入），
// 以及存档序列化用的 pathTypes 查询（pathTypeRecords、pathTypeOf、valueFitsPathType；卷二十七 R27-4.4 存什么、存成什么类型唯一依据 pathTypes）。
// atomicJSON 要 node:fs，按卷二 §2.7 import 矩阵 kernel 行（:779）只许在 kernel/save.mjs，故落在 save.mjs，不在本文件。

import { clone } from './clone.mjs';
import { invalidateMemo } from './memo.mjs';
import { statePathSegments, pathTypeShape, isSeedKey } from './handles/keys.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { compareSpecificity, KEY_NONENTITY, KEY_DIMKEY, KEY_SEEDKEY, KEY_HANDLE } from './load/state-owners.mjs';
import { registry } from './vocab.mjs';
import { KernelError, codeOf } from './errors.mjs';
import { currentTransaction } from './transaction.mjs';

/**
 * @typedef {{pattern: string, segs: string[], type: string, shape: import('./handles/keys.mjs').PathTypeShape | null, entitySlots: number[], entityKinds: string[][], dimSlot: number, seedSlots: {slot: number, kinds: string[]}[]}} PathRec
 * entitySlots：该模式第几个 `*` 段（从 0 计）的 keyKinds 项含实体 kind（(a) 单个或 (b) 列表里有实体 kind；(c) 项不算），用于"目标实体未终止"核对。
 * entityKinds：与 entitySlots 一一对应的该段可取的实体 kind；dimSlot：keyKinds 项为 dimKey 的 `*` 段（没有为 -1），dimension 路径的维度名在这一段。
 * seedSlots：keyKinds 项为 seedKey（或 (b) 列表含 seedKey）的 `*` 段及同列的实体 kind，写入时按 SeedKey 文法核。
 * @typedef {{pattern: string, segs: string[], create: string[], rewrite: string | null, viaRelocate: boolean}} WriterRec
 */

/** @type {null | {paths: PathRec[], pPatterns: Set<string>, textPatterns: Set<string>, writers: WriterRec[]}} */
let decl = null;

/** 终止协议的标记键（§2.6 实体终止协议第 2 步 `state.terminated[entityId]`；内核协议自己的键，与 load/state-owners.mjs 的协议键同一出处）。 */
export const TERMINATED_KEY = 'terminated';

/** 运行期才产生的路径段文法（按 keyKind 分派；以后加同类段只登一行）。handle 段文法即 §1.9 代号文法 CODE_RE（4-2）；seedKey 另须非词表代号、非已载入实体 id。 */
const RUNTIME_SEG_GRAMMAR = Object.freeze({
  [KEY_SEEDKEY]: (reg, v) => isSeedKey(reg, v),
  [KEY_HANDLE]: (_reg, v) => typeof v === 'string' && CODE_RE.test(v),
});

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
    return { pattern, segs: segsOf(pattern), type: merged.pathTypes[pattern], shape: pathTypeShape(merged.pathTypes[pattern]), entitySlots, entityKinds, dimSlot, seedSlots };
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
    case 'number': return typeof v === 'number'; // 非有限值、负零在此之前已按 R27-5.1 拒写（E-DET-NONFINITE）
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
  invalidateMemo(tx.state); // state 变了，按它算的 stateMemo 一律作废（kernel/memo.mjs）
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
  return kinds.some((k) => { const dims = reg.tableDims.get(k); return !!dims && Object.hasOwn(dims, name) && dims[name] && dims[name].type === 'string'; });
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
  // keyKinds 运行期段（seedKey、handle 及以后同类）：按各自文法核，不过即 E-PATH-KEYKINDS（卷二 :1545、:815，勘误 1118k10、1118k12；李白 11-18 05:50 裁定第 2 条）。
  for (const { slot, grammars, kinds } of rec.seedSlots) {
    const v = ids[slot];
    if (!grammars.some((g) => RUNTIME_SEG_GRAMMAR[g](registry(), v)) && !kinds.includes(registry().idIndex.get(v))) throw new KernelError('E-PATH-KEYKINDS', { entity: null }, `${rec.pattern}: segment ${JSON.stringify(v)} does not fit ${grammars.join('/')} grammar`);
  }
  // 卷二十七 R27-5.1：非有限值、负零不得进入状态（E-DET-NONFINITE）；被拒走同一上抛通路，由事务整笔回滚（卷二 §2.6 :499）。
  if (hasNonFinite(value)) throw new KernelError('E-DET-NONFINITE', { entity }, `non-finite number or negative zero written to ${rec.pattern}`);
  // 卷二 §2.7 :804 pathTypes 文法 dimension 行：运行期写 string 维度即 E-TEXT-UNGATED（dimension 路径上存不进自然语言）。
  if (rec.shape && rec.shape.base === 'dimension' && stringDimension(rec, ids)) throw new KernelError('E-TEXT-UNGATED', { entity }, `${rec.pattern}: string dimension is not a dimension path`);
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
    && Object.keys(sealed).every((k) => k === 'bytes' || k === 'digest') && typeof sealed.bytes === 'string' && typeof sealed.digest === 'string';
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
  return rec ? { pattern: rec.pattern, segs: [...rec.segs], type: rec.type, sealed: rec.shape !== null && rec.shape.base === 'sealed' } : null;
}

/**
 * 某条模式下有没有更长的模式（即这一层还只是中间对象，值在更深处）。
 * @param {string[]} segs 具体路径段（前缀）
 * @returns {boolean}
 */
export function pathTypeHasDeeper(segs) {
  return need().paths.some((r) => r.segs.length > segs.length && segs.every((s, i) => r.segs[i] === '*' || r.segs[i] === s));
}

/**
 * 值是否符合该模式在 pathTypes 声明的类型（与 writePath 的类型核对同一判断；sealed 按 {bytes, digest} 形态）。
 * @param {string} pattern @param {unknown} v
 * @returns {boolean}
 */
export function valueFitsPathType(pattern, v) {
  const rec = need().paths.find((r) => r.pattern === pattern);
  if (!rec) return false;
  if (rec.shape && rec.shape.base === 'sealed') return isSealedValue(v);
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

const SEALED_KEYS = Object.freeze(['bytes', 'digest']);

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

const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

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
    if (p === null || typeof p !== 'object' || (p.op !== 'set' && p.op !== 'delete') || !Array.isArray(p.path) || p.path.length === 0) throw new Error('applyPatches: malformed patch');
    if (p.path.some((k) => typeof k !== 'string' || UNSAFE_KEYS.has(k))) throw new Error('applyPatches: unsafe or non-string path key');
    let target = next;
    for (const k of p.path.slice(0, -1)) {
      target[k] = writable(Object.hasOwn(target, k) ? target[k] : {});
      target = target[k];
    }
    const last = p.path[p.path.length - 1];
    if (p.op === 'delete') delete target[last];
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
