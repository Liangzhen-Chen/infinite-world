// 加载期生成的冻结句柄 V、E、P（卷二 §2.7 kernelApi :600–602；§2.6 第 1 条；§4.2"句柄的标识符映射"；§7 S13 (a)）。
// 句柄值一律经 kernel/handles/* 的构造函数产生，本文件不强转；成员全部由登记数据生成，不列任何具体族、代号、错误码或路径。
//   V.<族名>.<id>：_vocab.json 各族条目（loadVocab 结果）。
//   E.<标识符>：错误码登记里的每个码，成员名按 §4.2 把连字符换成下划线。
//   P：state-owners.json 的 pathTypes 每条模式一个构造函数（textPaths 与账本账户路径除外，§2.6 第 4 条）；缺 pathTypes 键视为空表，P 无成员。
// 加载入口在校验通过后调一次 installHandles；之前 V、E、P 都是空的冻结对象。

import { handleOf, errorCodeOf, errorMemberName } from './vocab-handle.mjs';
import { statePathOf } from './keys.mjs';

const EMPTY = Object.freeze({});

/** @type {Readonly<Record<string, Readonly<Record<string, string>>>>} */
export let V = EMPTY;
/** @type {Readonly<Record<string, import('../types.d.ts').ErrorCode>>} */
export let E = EMPTY;
/** @type {Readonly<Record<string, (...segs: string[]) => string>>} */
export let P = EMPTY;

const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * V：每族一个冻结对象，成员是该族每个条目的 Handle。
 * @param {{families: Map<string, {entries: Record<string, any>}>, index: Map<string, {family: string}>}} vocab loadVocab 的结果
 */
export function buildV(vocab) {
  const out = {};
  for (const name of sorted(vocab.families.keys())) {
    const fam = {};
    for (const id of sorted(Object.keys(vocab.families.get(name).entries || {}))) fam[id] = handleOf(vocab.index, name, id);
    out[name] = Object.freeze(fam);
  }
  return Object.freeze(out);
}

/**
 * E：错误码登记里每个码一个成员。
 * @param {Iterable<string>} codes 错误码登记（卷二 §4.3）
 */
export function buildE(codes) {
  const registered = new Set(codes);
  const out = {};
  for (const c of sorted(registered)) {
    const code = errorCodeOf(registered, c);
    out[errorMemberName(code)] = code;
  }
  return Object.freeze(out);
}

/**
 * P：pathTypes 每条可生成的模式一个构造函数，形参个数等于模式里 `*` 段数，返回 StatePath<该模式>。
 * 成员键就是模式本身：卷二只写了 E 的成员名映射（§4.2），没写 P 的，待裁定。
 * @param {{pathTypes?: Record<string, string>, textPaths?: string[]}} decl state-owners.json
 * @param {{ledgerPaths?: string[]}} [opts] 账本账户路径模式（只经账本转移，不生成构造函数）
 */
export function buildP(decl, opts = {}) {
  const pathTypes = decl && decl.pathTypes && typeof decl.pathTypes === 'object' ? decl.pathTypes : {};
  const excluded = new Set([...(Array.isArray(decl && decl.textPaths) ? decl.textPaths : []), ...(opts.ledgerPaths || [])]);
  const patterns = new Set(sorted(Object.keys(pathTypes)).filter((p) => !excluded.has(p)));
  const out = {};
  for (const pattern of patterns) out[pattern] = Object.freeze((...segs) => statePathOf(patterns, pattern, segs));
  return Object.freeze(out);
}

/**
 * 加载期收下三组句柄。
 * @param {{vocab: any, errorCodes?: Iterable<string>, decl?: any, ledgerPaths?: string[]}} src
 */
export function installHandles(src) {
  V = buildV(src.vocab);
  E = buildE(src.errorCodes || []);
  P = buildP(src.decl || {}, { ledgerPaths: src.ledgerPaths });
}
