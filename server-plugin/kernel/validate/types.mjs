// 类型清单（卷二 §1.5，封闭 14 种）：类型定义的 L1 检查与取值的 L1/L2 检查（取值域、形状、引用闭合、rx 编译）。
// 只按维度定义通用处理；词表族、实体类都从加载结果查，不认任何具体表。

import { precisionOk, extPrecisionOk } from '../det-math.mjs';
import { compileRXInScope } from '../rx.mjs';
import { T, TYPES, DOMAIN_OPTIONAL, ROW_FIELDS, CODE_ENUMS, markersOf } from '../handles/markers.mjs';

// 定义源与 T 派生在 kernel/handles/markers.mjs（协议标记叶子，0 import，见该文件头）；这里只引用并转出给既有 import 方，不留第二份。
export { T, TYPES, DOMAIN_OPTIONAL, ROW_FIELDS, CODE_ENUMS, markersOf };

export const CODE_RE = /^[a-z][a-z0-9_]{1,47}$/;
export const KEY_RE = /^[a-z][a-zA-Z0-9]{0,47}$/;

// ---------- 错误码文法（卷二 §4.2）与 state-owners 的 pathTypes 值文法（§2.7） ----------
// 原 kernel/handles/patterns.mjs 搬入（S13 (b) 允许 validate/* 用正则；patterns.mjs 只留从 rx.mjs 搬来的正则）。

// 错误码文法：E-<区>-<名> / W-…（vocab-handle 构造 ErrorCode 前按它核对）。
const ERROR_CODE = /^[EW]-[A-Z0-9]+(-[A-Z0-9]+)+$/;
/** @param {unknown} s @returns {boolean} */
export const isErrorCode = (s) => typeof s === 'string' && ERROR_CODE.test(s);

const LIST_TYPE = /^list<(?<item>.+)>$/;
const NUMBER_TYPE = /^(?<base>number|integer)(?::(?<unit>.*))?$/;
const CLOSED_TYPE = /^(ref|enum):[a-z][a-z0-9_]*$/;
const STRUCT_TYPE = /^struct:[a-zA-Z][a-zA-Z0-9_<>]*$/;
/** list<…> 的内层类型；不是 list 返回 null。@param {string} t @returns {string | null} */
export function listItemType(t) {
  const m = LIST_TYPE.exec(t);
  return m ? m.groups.item : null;
}
/** number[:unit] / integer[:unit] 的 base 与 unit；不是数值类型返回 null。@param {string} t @returns {{base: string, unit: string | undefined} | null} */
export function parseNumberType(t) {
  const m = NUMBER_TYPE.exec(t);
  return m ? { base: m.groups.base, unit: m.groups.unit } : null;
}
/** ref:<kind> / enum:<family> / struct:<name> 三类封闭写法。@param {string} t @returns {boolean} */
export const isClosedType = (t) => typeof t === 'string' && (CLOSED_TYPE.test(t) || STRUCT_TYPE.test(t));

const SEALED_MENTION = /(^|<)sealed(>|$)/;
/** 类型文法里是否出现 sealed（list<sealed>、struct 名含 sealed 段等）。@param {unknown} t @returns {boolean} */
export const mentionsSealed = (t) => typeof t === 'string' && SEALED_MENTION.test(t);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ptr = (base, k) => `${base}/${String(k).replace(/~/g, '~0').replace(/\//g, '~1')}`;
const vocabOf = (def) => def.vocab !== undefined ? def.vocab : (isObj(def.domain) ? def.domain.vocab : undefined);
const sizeOf = (def, k) => def[k] !== undefined ? def[k] : (isObj(def.domain) ? def.domain[k] : undefined);

// 数值取值域 [min,max]，null 端为无界（§1.2）。
/** @param {unknown} domain @returns {boolean} */
export function rangeOk(domain) {
  const [lo, hi, ...rest] = Array.isArray(domain) ? domain : [];
  const okEnd = (x) => x === null || typeof x === 'number';
  return Array.isArray(domain) && !rest.length && okEnd(lo) && okEnd(hi) && !(lo !== null && hi !== null && lo > hi);
}
// 不必写 domain 的类型（§1.2 表头）的定义源在 handles/markers.mjs。

// JSON 值形态（union anyOf 判别用，§1.5 union 行）。
const SHAPE = { number: 'number', integer: 'number', boolean: 'boolean', string: 'string', enum: 'string', ref: 'string', rx: 'string', set: 'array', list: 'array', curve: 'array', map: 'object', struct: 'object', distribution: 'object' };

// ---------- 类型定义 ----------
// env：{units, vocab, kinds: Set, displaySet: Set}；at：报错定位（table、row、dim、path）。
/**
 * @param {Record<string, unknown>} def 类型定义 @param {Record<string, unknown>} env @param {Record<string, unknown>} at
 * @param {(...args: unknown[]) => void} err @param {boolean} [top] 是否维度顶层定义
 */
export function checkDef(def, env, at, err, top) {
  if (!isObj(def) || !TYPES.includes(def.type)) { err({ code: 'E-DIM-SCHEMA-TYPE', level: 'L1', ...at, got: isObj(def) ? def.type : def, want: TYPES.join('|') }); return; }
  const t = def.type;
  const bad = (code, got, want) => err({ code, level: 'L1', ...at, got, want });
  if (t === T.type.number || t === T.type.integer) {
    if (!env.units.has(def.unit)) bad('E-DIM-UNIT-UNKNOWN', def.unit, 'unit id in _units.json');
    const extScale = top && def.stockMode === T.code_enum.stock_mode.extScale;
    if (def.precision === undefined) { if (t === T.type.number) bad('E-DIM-SCHEMA-PRECISION', 'missing', 'decimal places within SCALE'); }
    else if (extScale ? !extPrecisionOk(def.precision) : !precisionOk(def.precision)) bad('E-DIM-SCHEMA-PRECISION', def.precision, extScale ? 'decimal places of SCALE^2 (stockMode extScale)' : 'decimal places within SCALE');
    if (def.domain !== undefined && !rangeOk(def.domain)) bad('E-DIM-DOMAIN-RANGE', def.domain, '[min,max] (null = unbounded)');
  }
  if (t === T.type.enum) {
    const fam = vocabOf(def);
    if (Array.isArray(def.values) || Array.isArray(def.enum) || Array.isArray(def.domain)) bad('E-DIM-DOMAIN-ENUM', 'inline enum', 'vocab family (no inline enums)');
    else if (typeof fam !== 'string' || !(env.vocab.families.has(fam) || Object.hasOwn(CODE_ENUMS, fam))) bad('E-DIM-REF-MISSING', fam, 'registered vocab family or code enum');
  }
  if (t === T.type.ref) {
    const forms = ['kind', 'kinds', 'vocab', 'dim', 'refs'].filter((k) => def[k] !== undefined);
    if (forms.length !== 1) bad('E-DIM-STRUCT-FIELD', forms.join(',') || 'none', 'exactly one of kind/kinds/vocab/dim/refs');
    for (const part of refParts(def)) {
      if (part.kind !== undefined && !env.kinds.has(part.kind)) bad('E-DIM-REF-MISSING', part.kind, 'a loaded table kind or effect');
      if (part.vocab !== undefined && part.vocab !== '*' && !env.vocab.families.has(part.vocab)) bad('E-DIM-REF-MISSING', part.vocab, 'registered vocab family');
      if (part.dim !== undefined && !env.kinds.has(part.dim)) bad('E-DIM-REF-DIM', part.dim, 'a loaded table kind');
    }
  }
  if (t === T.type.string) {
    if (top && !env.displaySet.has(at.dim)) bad('E-DIM-STRING-NOT-DISPLAY', at.dim, 'dimension registered in the display set');
  }
  if (t === T.type.set || t === T.type.list) {
    if (!isObj(def.of)) bad('E-DIM-STRUCT-FIELD', def.of, 'of: <type>');
    else checkDef(def.of, env, { ...at, path: `${at.path}/of` }, err, false);
  }
  if (t === T.type.map) {
    const k = def.key;
    if (!isObj(k) || (k.type !== T.type.ref && k.type !== T.type.enum)) bad('E-DIM-SCHEMA-TYPE', isObj(k) ? k.type : k, 'map key ref or enum');
    else checkDef(k, env, { ...at, path: `${at.path}/key` }, err, false);
    if (!isObj(def.value)) bad('E-DIM-STRUCT-FIELD', def.value, 'value: <type>');
    else checkDef(def.value, env, { ...at, path: `${at.path}/value` }, err, false);
    const valueType = isObj(def.value) ? def.value.type : undefined;
    if (def.combine !== undefined && (def.combine !== 'sum' || !(valueType === T.type.number || valueType === T.type.integer))) bad('E-DIM-MAP-SPARSE-NONSUM', def.combine, 'combine "sum" on a number/integer valued map');
  }
  if (t === T.type.struct) {
    if (!isObj(def.fields)) { bad('E-DIM-STRUCT-FIELD', def.fields, 'fields object'); return; }
    for (const f of Object.keys(def.fields).sort()) {
      if (!KEY_RE.test(f)) bad('E-DIM-ID-FORMAT', f, 'lowerCamel field name');
      checkDef(def.fields[f], env, { ...at, path: `${at.path}/fields/${f}` }, err, false);
    }
    // struct 的字段必填与维度的 required 策略同名（§1.5 struct 行与 §1.2，见 docs/问题.md）：维度顶层的 struct 取字符串为策略，嵌套的取数组。
    for (const r of fieldRequired(def)) if (!Object.hasOwn(def.fields, r)) bad('E-DIM-STRUCT-FIELD', r, 'required names a declared field');
  }
  if (t === T.type.curve) {
    for (const ax of ['x', 'y']) if (!env.units.has(def[ax])) bad('E-DIM-UNIT-UNKNOWN', def[ax], `curve ${ax} unit`);
  }
  if (t === T.type.union) {
    if (Array.isArray(def.anyOf)) {
      const seen = new Set();
      def.anyOf.forEach((m, i) => {
        checkDef(m, env, { ...at, path: `${at.path}/anyOf/${i}` }, err, false);
        const s = isObj(m) && SHAPE[m.type];
        if (!s || m.type === T.type.union || seen.has(s)) bad('E-DIM-UNION-SHAPE', isObj(m) ? m.type : m, 'members distinguishable by JSON shape');
        seen.add(s);
      });
    } else if (Array.isArray(def.oneOf)) {
      if (typeof def.discriminator !== 'string') bad('E-DIM-UNION-SHAPE', def.discriminator, 'discriminator field name');
      def.oneOf.forEach((m, i) => {
        if (!isObj(m) || m.type !== T.type.struct || !isObj(m.fields) || !Object.hasOwn(m.fields, def.discriminator)) bad('E-DIM-UNION-SHAPE', isObj(m) ? m.type : m, 'struct member carrying the discriminator');
        else checkDef(m, env, { ...at, path: `${at.path}/oneOf/${i}` }, err, false);
      });
    } else bad('E-DIM-UNION-SHAPE', 'none', 'anyOf or oneOf');
  }
}

// ---------- 行键文法（卷二 §1.3 继承写法；§2.8 表 kernel 行 :842 文法解析限 kernel/validate/* 等，故放在这里） ----------
// §5.0 公共字段与 §1.3、§1.7 的行字段的定义源在 handles/markers.mjs。
const KEY_OPS = ['+', '-', '~', '*'];
// 一个行键拆成 {dim, op}；op 为 '' 表示整值写法。
/** @param {string} key 行键 @returns {{dim: string, op: string}} */
export function splitKey(key) {
  const last = key.slice(-1);
  return KEY_OPS.includes(last) ? { dim: key.slice(0, -1), op: last } : { dim: key, op: '' };
}

const fieldRequired = (def) => (Array.isArray(def.required) ? def.required : []);
/** @param {Record<string, unknown>} def ref 类型定义 */
export const refParts = (def) => (Array.isArray(def.refs) ? def.refs : [def]);

// 协议标记句柄（卷二 §7 S13 (a) 上下文白名单）的 markersOf/T 在 handles/markers.mjs，此处不再定义。

// ---------- 取值 ----------
// env 另带：idIndex: Map<id, kind>，tableDims: Map<kind, dimensions>，rxScope，compiled: Map（rx 编译结果的落点）。
/**
 * @param {Record<string, unknown>} def 类型定义 @param {unknown} v 值 @param {Record<string, unknown>} env
 * @param {Record<string, unknown>} at 报错定位 @param {(...args: unknown[]) => void} err
 */
export function checkValue(def, v, env, at, err) {
  const bad = (code, got, want, level) => err({ code, level: level || 'L1', ...at, got, want });
  if (v === null) { if (!def.nullable) bad('E-DIM-DOMAIN-RANGE', null, `${def.type} (not nullable)`); return; }
  switch (def.type) {
    case T.type.number: case T.type.integer: {
      if (typeof v !== 'number' || !Number.isFinite(v) || (def.type === T.type.integer && !Number.isInteger(v))) { bad('E-DIM-DOMAIN-RANGE', v, def.type); return; }
      if (Array.isArray(def.domain)) {
        const [lo, hi] = def.domain;
        if ((lo !== null && v < lo) || (hi !== null && v > hi)) bad('E-DIM-DOMAIN-RANGE', v, `[${lo},${hi}] ${def.unit || ''}`.trim());
      }
      return;
    }
    case T.type.boolean: if (typeof v !== 'boolean') bad('E-DIM-DOMAIN-RANGE', v, 'boolean'); return;
    case T.type.string: {
      const max = sizeOf(def, 'maxLength');
      if (typeof v !== 'string') bad('E-DIM-DOMAIN-RANGE', v, 'string');
      else if (max !== undefined && [...v].length > max) bad('E-DIM-DOMAIN-SIZE', v.length, `maxLength ${max}`);
      return;
    }
    case T.type.enum: {
      const fam = vocabOf(def);
      if (Object.hasOwn(CODE_ENUMS, fam) && !env.vocab.families.has(fam)) { if (!CODE_ENUMS[fam].includes(v)) bad('E-DIM-DOMAIN-ENUM', v, `code enum ${fam}`); return; }
      const rec = typeof v === 'string' && CODE_RE.test(v) ? env.vocab.index.get(v) : undefined;
      if (!rec || rec.family !== fam) bad('E-DIM-DOMAIN-ENUM', v, `entry of vocab family ${fam}`);
      return;
    }
    case T.type.ref: {
      if (typeof v !== 'string' || !CODE_RE.test(v)) { bad('E-DIM-ID-FORMAT', v, 'ASCII code ^[a-z][a-z0-9_]{1,47}$'); return; }
      const parts = refParts(def);
      const ok = parts.some((p) => {
        if (p.vocab !== undefined) { const r = env.vocab.index.get(v); return Boolean(r) && (p.vocab === '*' || r.family === p.vocab); }
        if (p.kind !== undefined) return env.idIndex.get(v) === p.kind;
        if (p.kinds !== undefined) return p.kinds.includes(env.idIndex.get(v));
        if (p.dim !== undefined) { const d = (env.tableDims.get(p.dim) || {})[v]; return Boolean(d) && (d.type === T.type.number || d.type === T.type.integer); }
        return false;
      });
      if (!ok) bad(parts.some((p) => p.dim !== undefined) ? 'E-DIM-REF-DIM' : 'E-DIM-REF-MISSING', v, describeRef(parts), 'L2');
      return;
    }
    case T.type.set: case T.type.list: {
      if (!Array.isArray(v)) { bad('E-DIM-DOMAIN-RANGE', typeof v, def.type); return; }
      const max = sizeOf(def, 'maxSize');
      if (max !== undefined && v.length > max) bad('E-DIM-DOMAIN-SIZE', v.length, `maxSize ${max}`);
      if (def.type === T.type.list && def.length !== undefined && v.length !== def.length) bad('E-DIM-DOMAIN-SIZE', v.length, `length ${def.length}`);
      if (def.type === T.type.set) {
        const sorted = [...new Set(v.map((x) => JSON.stringify(x)))].sort();
        if (sorted.length !== v.length || sorted.some((x, i) => x !== JSON.stringify(v[i]))) bad('E-DIM-DOMAIN-SIZE', v, 'sorted array without duplicates');
      }
      v.forEach((x, i) => checkValue(def.of, x, env, { ...at, path: ptr(at.path, i) }, err));
      return;
    }
    case T.type.map: {
      if (!isObj(v)) { bad('E-DIM-DOMAIN-RANGE', typeof v, 'map object'); return; }
      for (const k of Object.keys(v).sort()) {
        checkValue({ ...def.key, nullable: false }, k, env, { ...at, path: ptr(at.path, k) }, err);
        if (v[k] !== null) checkValue(def.value, v[k], env, { ...at, path: ptr(at.path, k) }, err);
      }
      return;
    }
    case T.type.struct: {
      if (!isObj(v)) { bad('E-DIM-STRUCT-FIELD', typeof v, 'struct object'); return; }
      for (const f of Object.keys(v).sort()) {
        if (!Object.hasOwn(def.fields, f)) bad('E-DIM-STRUCT-FIELD', f, `field of ${Object.keys(def.fields).sort().join(',')}`);
        else checkValue(def.fields[f], v[f], env, { ...at, path: ptr(at.path, f) }, err);
      }
      for (const r of fieldRequired(def)) if (!Object.hasOwn(v, r)) bad('E-DIM-STRUCT-FIELD', `missing ${r}`, 'required struct field');
      return;
    }
    case T.type.curve: {
      const pts = Array.isArray(v) ? v : [];
      const pairOk = (p) => {
        if (!Array.isArray(p)) return false;
        const [x, y, ...rest] = p;
        return typeof x === 'number' && typeof y === 'number' && rest.length === 0;
      };
      if (!Array.isArray(v) || !pts.every(pairOk)) { bad('E-DIM-DOMAIN-CURVE', v, '[[x,y],...]'); return; }
      if (pts.some((p, i) => i > 0 && !(p[0] > pts[i - 1][0]))) bad('E-DIM-DOMAIN-CURVE', pts.map((p) => p[0]), 'strictly increasing x');
      if (def.monotone === true) {
        const d = pts.slice(1).map((p, i) => Math.sign(p[1] - pts[i][1]));
        if (d.includes(1) && d.includes(-1)) bad('E-DIM-DOMAIN-CURVE', pts.map((p) => p[1]), 'monotone y');
      }
      return;
    }
    case T.type.union: {
      const members = def.anyOf || def.oneOf || [];
      const fits = members.filter((m) => { let ok = true; checkValue(m, v, env, at, () => { ok = false; }); return ok; }).length;
      if (fits === 0) bad('E-DIM-UNION-NONE', v, 'exactly one union member');
      else if (fits > 1) bad('E-DIM-UNION-AMBIGUOUS', v, 'exactly one union member');
      return;
    }
    case T.type.rx: {
      if (typeof v !== 'string') { bad('E-MOD-RX', typeof v, 'RX text', 'L2'); return; }
      try { env.compiled.set(at.path, compileRXInScope(v, 'data', env.rxScope)); } catch (e) {
        if (!e.code) throw e;
        bad(e.code, v, e.message, 'L2');
      }
      return;
    }
    default: return; // distribution：§1.10 参数检查 P-2 未做（见汇报）
  }
}

function describeRef(parts) {
  return parts.map((p) => (p.vocab !== undefined ? `vocab ${p.vocab}` : p.kind !== undefined ? `kind ${p.kind}` : p.kinds !== undefined ? `kinds ${p.kinds.join('/')}` : `number dimension of ${p.dim}`)).join(' | ');
}
