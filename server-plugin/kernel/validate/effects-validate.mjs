// 效果族表 `_effects.json` 的加载期校验（卷二 §3.9 :1456–:1493；§4.1 L2 :1507；§4.3 :1579 E-EFF-*）。
// 一行 = 一个族，id 前缀 eff_；本文件只读表、词表、单位表、维度表头、原语目录与动词表，不认任何具体族 id，不写状态。
// 输出：被接受的族行与逐行编好的 RX 树（交 kernel/effects.mjs#effects 求值）；失败项走 err 回调，加载失败。
// 未做（回报列出）：`requirement` 只核引用的需求块代号在词表，需求块本体（§1.13）随其表另核；status 输出的 apply 只核代号已登记（状态表未建）。

import { compileRXInScope } from '../rx.mjs';
import { CODE_RE, T, isErrorCode } from './types.mjs';
import { EFFECT_ID_PREFIX, EFFECT_MAGNITUDE, EFFECT_RX_SUFFIX, EFFECT_PARAMS_RX, EFFECT_ROW_FIELDS, EFFECT_ROW_REQUIRED, EFFECT_PARAMS_FIELD, EFFECT_ID_TYPE, EFFECT_ID_PARAMS, EFFECT_ID_SOURCE_TARGET, EFFECT_ID_SOURCE_CTX, EFFECT_SELECTOR_FIELDS, EFFECT_COST_FIELDS, EFFECT_OUTPUT_SHAPE, EFFECT_RX_KEEP_CODES } from '../handles/markers.mjs';
import { modKeyOf, parseDimKey } from '../handles/keys.mjs';
import { REGISTERED_CODES } from '../error-codes.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const codeOf = (e) => {
  if (e === null || typeof e !== 'object' || !('code' in e)) return null;
  return typeof e.code === 'string' && isErrorCode(e.code) && REGISTERED_CODES.has(e.code) ? e.code : null;
};

const PARAMS_RX = EFFECT_PARAMS_RX;
const isRxField = (k) => k.endsWith(EFFECT_RX_SUFFIX);
const rxName = (k) => k.replace(new RegExp(`${EFFECT_RX_SUFFIX}$`), '');
const OUT = T.code_enum.eff_output;
// 输出种类取封闭枚举 eff_output 的句柄；种类的字段表在 markers.mjs（定义源），按种类名取。
const shapeOf = (kind) => EFFECT_OUTPUT_SHAPE[kind];

// 原语契约里出现的参数名（required、oneOf 各备选、unless 的 required；格式同 world/ontology/primitives.json）。
function primitiveParamNames(row) {
  const names = new Set();
  const take = (o) => { if (isObj(o)) for (const k of Object.keys(o)) names.add(k); };
  take(row.required);
  for (const group of Array.isArray(row.oneOf) ? row.oneOf : []) for (const alt of Array.isArray(group) ? group : []) take(alt);
  for (const rule of Array.isArray(row.unless) ? row.unless : []) take(isObj(rule) ? rule.required : undefined);
  return names;
}

const isIdSpec = (spec) => (typeof spec === 'string' ? spec : isObj(spec) ? spec.type : undefined) === EFFECT_ID_TYPE;
const idKeys = (o) => (isObj(o) ? Object.keys(o).filter((k) => isIdSpec(o[k])) : []);
const idSourceOk = (src, ctxFields) => src === EFFECT_ID_SOURCE_TARGET
  || (typeof src === 'string' && src.startsWith(EFFECT_ID_SOURCE_CTX) && ctxFields.includes(src.replace(EFFECT_ID_SOURCE_CTX, '')));

// primitive 输出的 id 型参数（契约里类型记号为 id）不能用 RX 表达，只认两种明文来源：选出的目标，或登记的 ctx 字段（李白 11-19 10:4x ②e）。
// required 里的 id 型参数必须有来源；oneOf 每组至少有一个备选，其 id 型参数全有来源；给不出的组合报 E-EFF-PARAM。
// 返回 {参数名: 来源}，供 effects() 取值。
function checkIdParams(prim, out, at, bad, ctxFields) {
  const bound = isObj(out[EFFECT_ID_PARAMS]) ? out[EFFECT_ID_PARAMS] : {};
  if (out[EFFECT_ID_PARAMS] !== undefined && !isObj(out[EFFECT_ID_PARAMS])) bad('E-EFF-PARAM', `${at}/${EFFECT_ID_PARAMS}`, out[EFFECT_ID_PARAMS], 'map {id parameter: source}');
  const all = new Set([...idKeys(prim.required), ...(Array.isArray(prim.oneOf) ? prim.oneOf : []).flatMap((g) => (Array.isArray(g) ? g : []).flatMap(idKeys))]);
  for (const [pn, src] of Object.entries(bound)) {
    if (!all.has(pn)) bad('E-EFF-PARAM', `${at}/${EFFECT_ID_PARAMS}/${pn}`, pn, `id-typed parameter of ${out.op}`);
    else if (!idSourceOk(src, ctxFields)) bad('E-EFF-PARAM', `${at}/${EFFECT_ID_PARAMS}/${pn}`, src, `${EFFECT_ID_SOURCE_TARGET} | ${EFFECT_ID_SOURCE_CTX}<registered ctx field>`);
  }
  if (isObj(out[PARAMS_RX])) for (const pn of Object.keys(out[PARAMS_RX])) if (all.has(pn)) bad('E-EFF-PARAM', `${at}/${PARAMS_RX}/${pn}`, pn, 'id-typed parameter cannot be an RX value; use idParams');
  for (const pn of idKeys(prim.required)) if (!Object.hasOwn(bound, pn)) bad('E-EFF-PARAM', `${at}/${EFFECT_ID_PARAMS}/${pn}`, 'missing', `${out.op} needs a source for id parameter ${pn}`);
  for (const group of Array.isArray(prim.oneOf) ? prim.oneOf : []) {
    const alts = Array.isArray(group) ? group : [];
    if (alts.length && !alts.some((alt) => idKeys(alt).every((k) => Object.hasOwn(bound, k)))) bad('E-EFF-PARAM', `${at}/${EFFECT_ID_PARAMS}`, 'missing', `${out.op}: no alternative has every id parameter sourced`);
  }
  return { ...bound };
}

/**
 * @param {unknown} doc 已解析的 _effects.json（顶层 {族 id: 行}）
 * @param {{units: Map<string, any>, vocab: {index: Map<string, {family: string}>}, idIndex: Map<string, string>, tableDims: Map<string, Record<string, any>>, rxDims: Map<string, any>}} env
 * @param {{ns: any[], limits: {rxMaxDepth: number}, primitives?: any[], effectCtxFields?: string[]}} options primitives：原语目录行（op、required…）；缺即原语输出一律拒（不放空）；effectCtxFields：登记卷写明的 ctx 字段（id 型参数的第二种来源，现无登记，缺即只认选出的目标）
 * @param {(e: Record<string, unknown>) => void} err
 * @returns {{rows: Map<string, any>, rx: Map<string, any>}}
 */
export function checkEffects(doc, env, options, err) {
  const rows = new Map();
  const rx = new Map();
  if (!isObj(doc)) {
    err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', table: '_effects', row: '', dim: '', path: '_effects.json#', got: doc, want: 'object {family id: row}' });
    return { rows, rx };
  }
  const ctxFields = Array.isArray(options.effectCtxFields) ? options.effectCtxFields : [];
  const primitives = new Map((Array.isArray(options.primitives) ? options.primitives : []).filter(isObj).map((p) => [p.op, p]));
  const reg = { tableDims: env.tableDims, idIndex: env.idIndex, vocabIndex: env.vocab.index };
  const NUM = Object.freeze({ type: T.type.number });
  const familyOf = (id) => { const r = env.vocab.index.get(id); return r ? r.family : undefined; };

  for (const id of Object.keys(doc).sort()) {
    const row = doc[id];
    const bad = (code, dim, got, want) => err({ code, level: 'L2', table: '_effects', row: id, dim, path: `_effects.json#/${id}${dim ? `/${dim}` : ''}`, got, want });
    if (!CODE_RE.test(id) || !id.startsWith(EFFECT_ID_PREFIX)) { bad('E-DIM-ID-FORMAT', '', id, `family id with prefix ${EFFECT_ID_PREFIX}`); continue; }
    if (!isObj(row)) { bad('E-DIM-STRUCT-FIELD', '', row, 'family row object'); continue; }
    for (const k of Object.keys(row)) if (!EFFECT_ROW_FIELDS.includes(k)) bad('E-DIM-STRUCT-FIELD', k, k, `one of ${EFFECT_ROW_FIELDS.join(',')}`);
    for (const k of EFFECT_ROW_REQUIRED) {
      if (row[k] === undefined) bad(k === EFFECT_PARAMS_FIELD ? 'E-EFF-PARAM' : 'E-DIM-STRUCT-FIELD', k, 'missing', `${k} written on every row (params: {} when no numeric parameter)`);
    }
    if (row.family !== undefined && row.family !== id) bad('E-DIM-STRUCT-FIELD', 'family', row.family, `equal to row id ${id}`);

    // params：参数代号在词表 parameter 族，单位已登记，取值域两端有限且 lo<=hi。
    const paramKeys = [];
    if (row.params !== undefined) {
      if (!isObj(row.params)) bad('E-EFF-PARAM', 'params', row.params, 'map {parameter: {unit, domain}} ({} when none)');
      else {
        for (const [pk, spec] of Object.entries(row.params)) {
          paramKeys.push(pk);
          const at = `params/${pk}`;
          if (familyOf(pk) !== T.effect_vocab.parameter) bad('E-EFF-PARAM', at, pk, 'entry of vocab family parameter');
          if (env.rxDims.has(pk) || pk === EFFECT_MAGNITUDE) bad('E-EFF-PARAM', at, pk, 'parameter name distinct from every dimension key and from the built-in magnitude');
          const dom = isObj(spec) ? spec.domain : undefined;
          const [lo, hi, ...extra] = Array.isArray(dom) ? dom : [];
          if (!isObj(spec) || !env.units.has(spec.unit)) bad('E-EFF-PARAM', at, spec, '{unit: registered unit, domain: [lo, hi]}');
          else if (!Number.isFinite(lo) || !Number.isFinite(hi) || extra.length || lo > hi) bad('E-EFF-PARAM', at, dom, 'domain [lo, hi] with finite lo <= hi');
        }
      }
    }

    const scope = (withMagnitude) => {
      const dims = new Map(env.rxDims);
      for (const k of paramKeys) dims.set(k, NUM);
      if (withMagnitude && row.magnitudeRX !== undefined) dims.set(EFFECT_MAGNITUDE, NUM);
      return { dims, vocabIndex: env.vocab.index, ns: options.ns, maxDepth: options.limits.rxMaxDepth };
    };
    // 编译一条 RX：带登记码的失败按 §4.3 报（未登记命名空间 E-RX-NS-UNKNOWN 照原码，其余 E-EFF-RX）；没有登记码的是程序缺陷，原样抛回。
    const compile = (text, withMagnitude, dim) => {
      if (typeof text !== 'string' || !text.length) { bad('E-EFF-RX', dim, text, 'non-empty RX text'); return null; }
      try {
        const c = compileRXInScope(text, 'data', scope(withMagnitude));
        for (const k of c.nsRefs) entry.nsRefs.add(k);
        return c.tree;
      } catch (e) {
        const code = codeOf(e);
        if (code === null) throw e;
        bad(EFFECT_RX_KEEP_CODES.includes(code) ? code : 'E-EFF-RX', dim, e.message, 'compilable data-profile RX over base dimensions, magnitude, declared params');
        return null;
      }
    };

    const entry = { magnitude: null, cost: null, outputs: [], nsRefs: new Set() };

    // targetSelector：scope 取封闭枚举，filter 可选 RX。
    const sel = row.targetSelector;
    if (sel !== undefined) {
      if (!isObj(sel)) bad('E-DIM-STRUCT-FIELD', 'targetSelector', sel, 'struct {scope, filter?}');
      else {
        if (!T.code_enum.scope.is(sel.scope)) bad('E-DIM-DOMAIN-ENUM', 'targetSelector/scope', sel.scope, 'enum scope');
        for (const k of Object.keys(sel)) if (!EFFECT_SELECTOR_FIELDS.includes(k)) bad('E-DIM-STRUCT-FIELD', `targetSelector/${k}`, k, EFFECT_SELECTOR_FIELDS.join(' | '));
        if (sel.filter !== undefined) compile(sel.filter, false, 'targetSelector/filter');
      }
    }
    if (row.requirement !== undefined && row.requirement !== null && familyOf(row.requirement) !== T.effect_vocab.requirement) bad('E-DIM-REF-MISSING', 'requirement', row.requirement, 'null or entry of vocab family requirement');
    if (row.magnitudeRX !== undefined) entry.magnitude = compile(row.magnitudeRX, false, 'magnitudeRX');

    // consent：mode 取封闭枚举；power 空或词表 power 族条目。
    const con = row.consent;
    if (con !== undefined) {
      if (!isObj(con)) bad('E-EFF-CONSENT', 'consent', con, 'struct {mode, power}');
      else {
        if (!T.code_enum.consent_mode.is(con.mode)) bad('E-EFF-CONSENT', 'consent/mode', con.mode, 'enum consent_mode');
        if (con.power === undefined || (con.power !== null && familyOf(con.power) !== T.effect_vocab.power)) bad('E-EFF-CONSENT', 'consent/power', con.power === undefined ? 'missing' : con.power, 'null or entry of vocab family power');
      }
    }

    // cost：可空；写则 {resource, amountRX}，resource 须是已登记代号（词表或实体 id）。
    if (row.cost !== undefined && row.cost !== null) {
      const c = row.cost;
      if (!isObj(c)) bad('E-DIM-STRUCT-FIELD', 'cost', c, 'null or struct {resource, amountRX}');
      else {
        if (typeof c.resource !== 'string' || !(env.vocab.index.has(c.resource) || env.idIndex.has(c.resource))) bad('E-DIM-REF-MISSING', 'cost/resource', c.resource, 'registered resource code');
        for (const k of Object.keys(c)) if (!EFFECT_COST_FIELDS.includes(k)) bad('E-DIM-STRUCT-FIELD', `cost/${k}`, k, EFFECT_COST_FIELDS.join(' | '));
        entry.cost = compile(c.amountRX, true, 'cost/amountRX');
      }
    }
    if (row.cooldownDays !== undefined && !(Number.isInteger(row.cooldownDays) && row.cooldownDays >= 0)) bad('E-DIM-DOMAIN-RANGE', 'cooldownDays', row.cooldownDays, 'integer >= 0');
    if (row.basis !== undefined && (typeof row.basis !== 'string' || !row.basis.length)) bad('E-DIM-STRUCT-FIELD', 'basis', row.basis, 'non-empty text');

    // outputs：每项的 kind 取封闭枚举；种类各自核字段、目标、原语与动词。
    if (row.outputs !== undefined && !Array.isArray(row.outputs)) bad('E-EFF-OUTPUT', 'outputs', row.outputs, 'list of outputs');
    (Array.isArray(row.outputs) ? row.outputs : []).forEach((out, i) => {
      const at = `outputs/${i}`;
      if (!isObj(out) || !T.code_enum.eff_output.is(out.kind)) { bad('E-EFF-OUTPUT', at, isObj(out) ? out.kind : out, 'output with kind in enum eff_output'); return; }
      const shape = shapeOf(out.kind);
      for (const k of shape.need) if (out[k] === undefined) bad('E-EFF-OUTPUT', `${at}/${k}`, 'missing', `${out.kind} output needs ${k}`);
      for (const k of Object.keys(out)) if (shape.fields && !shape.fields.includes(k)) bad('E-EFF-OUTPUT', `${at}/${k}`, k, `${out.kind} fields: ${shape.fields.join(',')}`);
      const compiled = { values: {}, params: null };
      for (const k of Object.keys(out)) {
        if (!isRxField(k)) continue;
        if (k === PARAMS_RX) {
          if (!isObj(out[k])) { bad('E-EFF-RX', `${at}/${k}`, out[k], 'map {param name: RX}'); continue; }
          compiled.params = {};
          for (const [pn, text] of Object.entries(out[k])) compiled.params[pn] = compile(text, true, `${at}/${k}/${pn}`);
        } else compiled.values[rxName(k)] = compile(out[k], true, `${at}/${k}`);
      }
      entry.outputs.push(compiled);
      if (out.kind === OUT.modifier) {
        if (!T.code_enum.stage.is(out.stage)) bad('E-MOD-STAGE', `${at}/stage`, out.stage, 'enum stage');
        try { const p = parseDimKey(reg, out.target); modKeyOf(reg, p.kind, p.dimension, p.sub); } catch (e) {
          if (codeOf(e) === null) throw e;
          // 效果族 outputs 的 target 未注册按 §4.3 与附录 A14 报 E-EFF-OUTPUT；E-MOD-KEY-UNREGISTERED 管修正项行自己的 target（李白 11-19 10:4x ②c）。
          bad('E-EFF-OUTPUT', `${at}/target`, out.target, 'registered modifiable number dimension <kind>.<dimension>');
        }
        if (out.duration !== undefined && !isObj(out.duration)) bad('E-EFF-OUTPUT', `${at}/duration`, out.duration, 'duration struct');
      } else if (out.kind === OUT.status) {
        if (typeof out.apply !== 'string' || !(env.vocab.index.has(out.apply) || env.idIndex.has(out.apply))) bad('E-DIM-REF-MISSING', `${at}/apply`, out.apply, 'registered status code');
      } else if (out.kind === OUT.primitive) {
        const prim = primitives.get(out.op);
        if (!prim) bad('E-EFF-PRIMITIVE', `${at}/op`, out.op, 'op in the primitive catalog (closed list)');
        else if (isObj(out[PARAMS_RX])) {
          const allowed = primitiveParamNames(prim);
          for (const pn of Object.keys(out[PARAMS_RX])) if (!allowed.has(pn)) bad('E-EFF-PRIMITIVE', `${at}/${PARAMS_RX}/${pn}`, pn, `parameter names of ${out.op}: ${[...allowed].sort().join(',')}`);
        }
        if (prim) compiled.ids = checkIdParams(prim, out, at, bad, ctxFields);
      } else if (out.kind === OUT.event) {
        if (familyOf(out.verb) !== T.effect_vocab.verb) bad('E-EVT-VERB', `${at}/verb`, out.verb, 'entry of vocab family verb');
      }
    });
    rows.set(id, row);
    rx.set(id, entry);
  }
  return { rows, rx };
}
