// 加载期生成的冻结句柄 V、E、P（卷二 §2.7 kernelApi :600–602；§2.6 第 1 条；§4.2"句柄的标识符映射"；§7 S13 (a)）。
// 句柄值一律经 kernel/handles/* 的构造函数产生，本文件不强转；成员全部由登记数据生成，不列任何具体族、代号、错误码或路径。
//   V.<族名>.<id>：_vocab.json 各族条目（loadVocab 结果）。
//   E.<标识符>：错误码登记里的每个码，成员名按 §4.2 把连字符换成下划线。
//   P.<派生名>：state-owners.json 的 pathTypes 每条模式一个构造函数，名字点换下划线、`*` 段变参数（textPaths 与账本账户路径除外，§2.6 第 4 条）；缺 pathTypes 键视为空表，P 无成员。
// 加载入口在校验通过后调一次 installHandles；之前 V、E、P 都是空的冻结对象。

import { handleOf, errorCodeOf, errorMemberName, HandleError } from './vocab-handle.mjs';
import { statePathOf, checkPathPattern } from './keys.mjs';
import { ERROR_CODES } from '../error-codes.mjs';

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
 * E：错误码登记表里每个码一个成员（kernel/error-codes.mjs，卷二 §4.3 加各卷错误码表）。
 * @param {Iterable<string>} [codes] 默认取登记表全部码；只给登记表的子集或做测试用，不在表内的码拒收
 */
export function buildE(codes = ERROR_CODES.map((e) => e.code)) {
  const out = {};
  for (const c of sorted(new Set(codes))) {
    const code = errorCodeOf(c);
    out[errorMemberName(code)] = code;
  }
  return Object.freeze(out);
}

/**
 * P：pathTypes 每条可生成的模式一个构造函数，返回 StatePath<该模式>（李白 11-17 句柄 P 成员名裁定，卷二 §2.6 第 1 条）。
 * 成员名由模式机械派生：点换下划线，`*` 段不进名字、按出现顺序成为调用参数（'lot.*.spoilage' → P.lot_spoilage(id)）。
 * 两条模式派生出同一成员名即生成失败（E-PATH-NAME-CLASH），不覆盖、不加序号。
 * 每条 pathTypes 模式（含被排除的）先过 checkPathPattern：字面段 ^[a-z][a-z0-9_]*$、至少一个字面段，违者 E-PATH-SEGMENT-GRAMMAR（李白 11-17 pathTypes 段文法裁定）。
 * @param {{pathTypes?: Record<string, string>, textPaths?: string[]}} decl state-owners.json
 * @param {{ledgerPaths?: string[]}} [opts] 账本账户路径模式（只经账本转移，不生成构造函数）
 */
export function buildP(decl, opts = {}) {
  const pathTypes = decl && decl.pathTypes && typeof decl.pathTypes === 'object' ? decl.pathTypes : {};
  for (const pattern of Object.keys(pathTypes)) checkPathPattern(pattern);
  const excluded = new Set([...(Array.isArray(decl && decl.textPaths) ? decl.textPaths : []), ...(opts.ledgerPaths || [])]);
  const patterns = new Set(sorted(Object.keys(pathTypes)).filter((p) => !excluded.has(p)));
  const out = {};
  const origin = new Map();
  for (const pattern of patterns) {
    const name = pattern.split('.').filter((s) => s !== '*').join('_');
    if (origin.has(name)) throw new HandleError('E-PATH-NAME-CLASH', `${JSON.stringify(origin.get(name))} and ${JSON.stringify(pattern)} both derive P member ${JSON.stringify(name)}`);
    origin.set(name, pattern);
    out[name] = Object.freeze((...segs) => statePathOf(patterns, pattern, segs));
  }
  return Object.freeze(out);
}

/**
 * 加载期收下三组句柄。
 * @param {{vocab: any, decl?: any, ledgerPaths?: string[]}} src
 */
export function installHandles(src) {
  const v = buildV(src.vocab);
  const e = buildE();
  const p = buildP(src.decl || {}, { ledgerPaths: src.ledgerPaths });
  V = v; E = e; P = p; // 三者都建好才一起赋值：任一抛错，V、E、P 保持原值
}
