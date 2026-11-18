// 规则表加载器（卷二 §2.9 :1036 登记边界入口；§4.1 :1495、"规则表登记" :1497）。
// 按 world/rules/registry.json 逐行读，不按文件名找表、不认任何具体表：
//   登记行所指文件不存在、表里出现登记之外的键 → E-RULES-UNREGISTERED，加载失败；
//   向 engine.rules 要未登记的表（ruleTable）→ E-RULES-UNREGISTERED；
//   表值的类型与取值域按 L1 同一套检查、报同一组码；multiSourceMerge 与值类型不合 → E-PACK-RULEKEY（卷二十八 §2.11 :280）。
// 分两步：readRules 只读文件、查登记与结构（不需词表）；checkRules 拿维度加载得到的 env 查类型与取值域。
// 结构除键表、行表外另有独立格式 "processSlots"（卷二 §3.7 过程主体槽，文件级登记，专用校验；李白 11-18 块 2-5 裁定①）。

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import { checkDef, checkValue, rangeOk, DOMAIN_OPTIONAL, TYPES, KEY_RE, CODE_RE, CODE_ENUMS } from '../validate/types.mjs';
import { STACKING } from '../validate/dimensions-validate.mjs';

export const RULES_LAYOUT = Object.freeze({ dir: 'world/rules', registry: 'registry.json' });

// 登记行的字段：卷二 :1497 的七个字段（code 表代号、file 文件、structure 结构、type 类型、domain 取值域、volume 归属卷、
// multiSourceMerge）与每键必写的 packOverridable。
const REG_FIELDS = ['code', 'file', 'structure', 'type', 'domain', 'volume', 'multiSourceMerge', 'packOverridable'];
// 规则表文件：{"rows": [{key, value, …出处字段}]}；出处字段只记来源，不参与取值。
const ROW_FIELDS = ['key', 'value', 'source', 'file', 'grade', 'basis'];
// 代码内封闭枚举 multi_source_merge（卷二十八 §2.1 :139–142）与各值适用的值类型（§2.11 :280）。
const MERGE = Object.freeze({
  own_key_only: () => true,
  all_and: (d) => d.type === 'boolean' || (d.type === 'struct' && isObj(d.fields) && Object.values(d.fields).every((f) => isObj(f) && f.type === 'boolean')),
  take_min: (d) => ['number', 'integer', 'enum'].includes(d.type),
  take_max: (d) => ['number', 'integer', 'enum'].includes(d.type),
});
const FILE_RE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.json$/;
// 独立格式：过程主体槽（卷二 §3.7 slots/consumers 嵌套格式；李白 11-18 块 2-5 裁定①）。登记行按文件登记，
// 不写 type/domain（格式由 §3.7 定），packOverridable 写一个布尔；表值由下面的专用校验读，修正键是 process.<slot>（§3.1 :1291 额外命名空间）。
const PROCESS_STRUCTURE = 'processSlots';
const PROCESS_TOP = Object.freeze(['version', 'slots', 'consumers']);
// 槽字段：§3.7 格式与 §1.2 表头字段（unit、precision、stacking、bounds、boundsRelative、boundsByKind、budget）加 process 槽独有的 paceable、baselineRX 与文档字段 basis。
const SLOT_FIELDS = Object.freeze(['unit', 'precision', 'stacking', 'bounds', 'boundsRelative', 'boundsByKind', 'budget', 'paceable', 'baselineRX', 'basis']);
const BUDGET_FIELDS = Object.freeze(['maxModifiers', 'totalBounds', 'stageBounds']);
const CONSUMER_FIELDS = Object.freeze(['slot', 'base']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');

// 登记里一个键（或行表的行值）的类型定义：type 写类型名或完整类型定义，domain 并入（写法同维度表头）。
function defOf(type, domain) {
  const def = typeof type === 'string' ? { type } : isObj(type) ? { ...type } : null;
  if (def && domain !== undefined) def.domain = domain;
  return def;
}

function checkDefShape(def, merge, at) {
  if (!def || !TYPES.includes(def.type)) return at('type', def ? def.type : def, TYPES.join('|'), 'E-DIM-SCHEMA-TYPE');
  if (['number', 'integer'].includes(def.type) && def.domain !== undefined && !rangeOk(def.domain)) at('domain', def.domain, '[min,max] (null = unbounded)', 'E-DIM-DOMAIN-RANGE');
  if (def.domain === undefined && !DOMAIN_OPTIONAL.includes(def.type)) at('domain', 'missing', 'domain', 'E-DIM-DOMAIN-RANGE');
  if (Object.hasOwn(MERGE, merge) && !MERGE[merge](def)) at('multiSourceMerge', `${merge} on ${def.type}`, 'merge mode fitting the value type', 'E-PACK-RULEKEY');
  return def;
}

// 第一步：读登记与各表文件。返回 {errors, tables, rules}；rules 是冻结的 engine.rules（表代号 → 键或行 → 值）。
/** @param {string} root 仓库根 @param {{rulesDir?: string}} [opts] */
export function readRules(root, opts = {}) {
  const dir = opts.rulesDir || RULES_LAYOUT.dir;
  const regPath = `${dir}/${RULES_LAYOUT.registry}`;
  const errors = [];
  const tables = [];
  const rules = Object.create(null);
  const done = () => ({ errors, tables, rules: Object.freeze(rules) });
  const regErr = (row, dim, path, got, want, code = 'E-DIM-STRUCT-FIELD', level = 'L1') => errors.push({ code, level, table: 'rules.registry', row, dim, path, got, want });

  if (!existsSync(resolve(root, regPath))) { regErr('', '', regPath, 'missing', 'rules registry file', 'E-RULES-UNREGISTERED'); return done(); }
  const reg = parseJsonStrict(readFileSync(resolve(root, regPath), 'utf8'));
  for (const e of reg.errors) regErr('', '', `${regPath}#${e.pointer}`, e.got, e.want, e.code, 'L0');
  if (!isObj(reg.value) || !Array.isArray(reg.value.rows)) { if (!reg.errors.length) regErr('', '', regPath, typeof reg.value, '{"rows": [...]}'); return done(); }

  const seen = { code: new Set(), file: new Set() };
  reg.value.rows.forEach((r, i) => {
    const name = isObj(r) && typeof r.code === 'string' ? r.code : String(i);
    const at = (dim, got, want, code, level) => regErr(name, dim, `${regPath}#/rows/${i}${dim ? '/' + dim : ''}`, got, want, code, level);
    if (!isObj(r)) return at('', typeof r, 'registry row object');
    for (const f of Object.keys(r).sort()) if (!REG_FIELDS.includes(f)) at(f, f, REG_FIELDS.join('|'));
    if (typeof r.code !== 'string' || !KEY_RE.test(r.code)) return at('code', r.code, 'lowerCamel table code', 'E-DIM-ID-FORMAT');
    if (seen.code.has(r.code)) return at('code', r.code, 'one registry row per table code', 'E-DIM-ID-DUPLICATE');
    seen.code.add(r.code);
    if (typeof r.file !== 'string' || !FILE_RE.test(r.file) || r.file === RULES_LAYOUT.registry) return at('file', r.file, `relative .json path under ${dir}/`);
    if (seen.file.has(r.file)) return at('file', r.file, 'one file per registry row', 'E-DIM-ID-DUPLICATE');
    seen.file.add(r.file);
    if (typeof r.volume !== 'string' || r.volume === '') at('volume', r.volume, 'owning volume');
    if (!Object.hasOwn(MERGE, r.multiSourceMerge)) at('multiSourceMerge', r.multiSourceMerge, Object.keys(MERGE).join('|'), 'E-PACK-RULEKEY');

    // 结构：键表 "keys"（type/domain/packOverridable 逐键写）；行表 {"rows": <行键的引用写法>}（三者各写一个）。
    const t = { code: r.code, file: `${dir}/${r.file}`, keyed: r.structure === 'keys', defs: new Map(), rowDef: null, rowKey: null, entries: [] };
    if (t.keyed) {
      if (!isObj(r.type) || !Object.keys(r.type).length) return at('type', r.type, 'object: key -> type');
      if (r.domain !== undefined && !isObj(r.domain)) at('domain', r.domain, 'object: key -> domain');
      if (!isObj(r.packOverridable)) at('packOverridable', r.packOverridable, 'object: key -> boolean');
      for (const k of Object.keys(r.type).sort()) {
        const kat = (dim, got, want, code) => at(`${dim}/${esc(k)}`, got, want, code);
        const def = checkDefShape(defOf(r.type[k], isObj(r.domain) ? r.domain[k] : undefined), r.multiSourceMerge, kat);
        if (isObj(r.packOverridable) && typeof r.packOverridable[k] !== 'boolean') kat('packOverridable', r.packOverridable[k], 'true|false');
        if (def) t.defs.set(k, def);
      }
      for (const k of Object.keys(isObj(r.domain) ? r.domain : {})) if (!Object.hasOwn(r.type, k)) at(`domain/${esc(k)}`, k, 'key declared in type', 'E-RULES-UNREGISTERED');
      for (const k of Object.keys(isObj(r.packOverridable) ? r.packOverridable : {})) if (!Object.hasOwn(r.type, k)) at(`packOverridable/${esc(k)}`, k, 'key declared in type', 'E-RULES-UNREGISTERED');
    } else if (isObj(r.structure) && isObj(r.structure.rows)) {
      t.rowKey = { ...r.structure.rows, type: 'ref' };
      t.rowDef = checkDefShape(defOf(r.type, r.domain), r.multiSourceMerge, at);
      if (typeof r.packOverridable !== 'boolean') at('packOverridable', r.packOverridable, 'true|false');
    } else if (r.structure === PROCESS_STRUCTURE) {
      // 文件级登记（§3.7 独立格式）：类型与取值域由格式本身定，登记行不写。
      for (const f of ['type', 'domain']) if (r[f] !== undefined) at(f, f, `absent for structure "${PROCESS_STRUCTURE}" (format fixed by 卷二 §3.7)`);
      if (typeof r.packOverridable !== 'boolean') at('packOverridable', r.packOverridable, 'true|false');
      t.process = null;
    } else return at('structure', r.structure, `"keys", {"rows": <row key ref>} or "${PROCESS_STRUCTURE}"`);
    if (Object.hasOwn(t, 'process')) {
      readProcessTable(root, t, errors);
      tables.push(t);
      rules[t.code] = Object.freeze(t.process || {});
      return;
    }
    readTable(root, t, errors);
    tables.push(t);
    rules[t.code] = Object.freeze(Object.fromEntries(t.entries.map((e) => [e.key, e.value])));
  });
  return done();
}

function readTable(root, t, errors) {
  const err = (row, path, got, want, code = 'E-DIM-STRUCT-FIELD', level = 'L1') => errors.push({ code, level, table: `rules.${t.code}`, row, dim: '', path, got, want });
  if (!existsSync(resolve(root, t.file))) return err('', t.file, 'missing', 'file named by the registry row', 'E-RULES-UNREGISTERED');
  const doc = parseJsonStrict(readFileSync(resolve(root, t.file), 'utf8'));
  for (const e of doc.errors) err('', `${t.file}#${e.pointer}`, e.got, e.want, e.code, 'L0');
  if (!isObj(doc.value) || !Array.isArray(doc.value.rows)) { if (!doc.errors.length) err('', t.file, typeof doc.value, '{"rows": [...]}'); return; }
  for (const k of Object.keys(doc.value)) if (k !== 'rows') err('', `${t.file}#/${esc(k)}`, k, 'only "rows" at top level');
  const seen = new Set();
  doc.value.rows.forEach((row, i) => {
    const path = `${t.file}#/rows/${i}`;
    if (!isObj(row) || typeof row.key !== 'string' || !Object.hasOwn(row, 'value')) return err(String(i), path, row, '{key, value}');
    for (const f of Object.keys(row).sort()) {
      if (!ROW_FIELDS.includes(f)) err(row.key, `${path}/${f}`, f, ROW_FIELDS.join('|'));
      else if (f !== 'key' && f !== 'value' && typeof row[f] !== 'string') err(row.key, `${path}/${f}`, row[f], 'string');
    }
    if (seen.has(row.key)) return err(row.key, `${path}/key`, row.key, 'unique key', 'E-DIM-DUPLICATE-KEY', 'L0');
    seen.add(row.key);
    if (t.keyed && !t.defs.has(row.key)) return err(row.key, `${path}/key`, row.key, 'key registered for this table', 'E-RULES-UNREGISTERED');
    if (!t.keyed && !CODE_RE.test(row.key)) return err(row.key, `${path}/key`, row.key, 'entry or entity code', 'E-DIM-ID-FORMAT');
    t.entries.push({ key: row.key, value: row.value, path: `${path}/value` });
  });
}

// 过程主体槽文件的顶层结构（卷二 §3.7）：{"version": 正整数, "slots": {…}, "consumers": {…}}，不认别的顶层键。槽与消费者的逐项检查在 checkRules（要 env）。
function readProcessTable(root, t, errors) {
  const err = (path, got, want, code = 'E-DIM-STRUCT-FIELD', level = 'L1') => errors.push({ code, level, table: `rules.${t.code}`, row: '', dim: '', path, got, want });
  if (!existsSync(resolve(root, t.file))) return err(t.file, 'missing', 'file named by the registry row', 'E-RULES-UNREGISTERED');
  const doc = parseJsonStrict(readFileSync(resolve(root, t.file), 'utf8'));
  for (const e of doc.errors) err(`${t.file}#${e.pointer}`, e.got, e.want, e.code, 'L0');
  if (doc.errors.length) return;
  const v = doc.value;
  if (!isObj(v)) return err(t.file, typeof v, '{"version", "slots", "consumers"} (卷二 §3.7)');
  // version 是 §3.7 格式里写着的顶层键，照收；不按它的值分支（规则只一版，不做版本分叉）。
  for (const k of Object.keys(v).sort()) if (!PROCESS_TOP.includes(k)) err(`${t.file}#/${esc(k)}`, k, PROCESS_TOP.join('|'));
  if (!isObj(v.slots)) err(`${t.file}#/slots`, v.slots, 'object: slot -> slot definition');
  if (!isObj(v.consumers)) err(`${t.file}#/consumers`, v.consumers, 'object: consumer group -> consumers');
  t.process = v;
}

// 过程主体槽的专用校验（卷二 §3.7"与实体维度的修正键同一管线、同一校验（E-MOD-*）"）：槽名是 process.<slot> 里的 <slot>，照维度键文法（lowerCamel）；
// 单位与精度照维度表头同一检查（checkDef）；stacking / bounds / boundsByKind / budget / baselineRX 报 E-MOD-*；消费者所指槽须已登记。
function checkProcessTable(t, env, err) {
  const doc = t.process;
  if (!isObj(doc)) return;
  const file = t.file;
  const slots = isObj(doc.slots) ? doc.slots : {};
  for (const name of Object.keys(slots).sort()) {
    const s = slots[name];
    const base = `${file}#/slots/${esc(name)}`;
    const bad = (code, dim, got, want, level = 'L2') => err({ code, level, row: `process.${name}`, dim, path: dim ? `${base}/${dim}` : base, got, want });
    if (!KEY_RE.test(name)) bad('E-DIM-ID-FORMAT', '', name, 'lowerCamel slot name (modifier key process.<slot>, 卷二 §3.1)', 'L1');
    if (!isObj(s)) { bad('E-DIM-STRUCT-FIELD', '', typeof s, 'slot definition object', 'L1'); continue; }
    for (const f of Object.keys(s).sort()) if (!SLOT_FIELDS.includes(f)) bad('E-DIM-STRUCT-FIELD', f, f, SLOT_FIELDS.join('|'), 'L1');
    checkDef({ type: 'number', unit: s.unit, precision: s.precision }, env, { row: `process.${name}`, dim: 'unit', path: base }, err, false);
    if (!STACKING.includes(s.stacking)) bad('E-MOD-STACKING', 'stacking', s.stacking, STACKING.join('|'));
    const pair = (b) => { const [lo, hi, ...rest] = Array.isArray(b) ? b : []; return !rest.length && typeof lo === 'number' && typeof hi === 'number' && lo <= hi; };
    if (!pair(s.bounds)) bad('E-MOD-BOUNDS', 'bounds', s.bounds, '[lo,hi]');
    if (s.boundsRelative !== undefined && typeof s.boundsRelative !== 'boolean') bad('E-MOD-BOUNDS', 'boundsRelative', s.boundsRelative, 'true|false');
    if (s.boundsByKind !== undefined) {
      if (!isObj(s.boundsByKind)) bad('E-MOD-BOUNDS', 'boundsByKind', s.boundsByKind, 'object: subject kind -> [lo,hi]');
      else for (const [k, b] of Object.entries(s.boundsByKind).sort()) if (!KEY_RE.test(k) || !pair(b)) bad('E-MOD-BOUNDS', `boundsByKind/${esc(k)}`, b, 'subject kind -> [lo,hi]');
    }
    if (s.budget !== undefined) {
      const b = s.budget;
      if (!isObj(b)) bad('E-MOD-BUDGET', 'budget', b, `{${BUDGET_FIELDS.join(', ')}}`);
      else {
        for (const f of Object.keys(b).sort()) if (!BUDGET_FIELDS.includes(f)) bad('E-MOD-BUDGET', `budget/${esc(f)}`, f, BUDGET_FIELDS.join('|'));
        if (b.maxModifiers !== undefined && (!Number.isInteger(b.maxModifiers) || b.maxModifiers < 1)) bad('E-MOD-BUDGET', 'budget/maxModifiers', b.maxModifiers, 'positive integer');
        for (const f of ['totalBounds', 'stageBounds']) {
          if (b[f] === undefined) continue;
          if (!isObj(b[f])) { bad('E-MOD-BUDGET', `budget/${f}`, b[f], 'object: stage -> [lo,hi]'); continue; }
          for (const [st, r] of Object.entries(b[f]).sort()) if (!CODE_ENUMS.stage.includes(st) || !pair(r)) bad('E-MOD-BUDGET', `budget/${f}/${esc(st)}`, [st, r], `stage (${CODE_ENUMS.stage.join('|')}) -> [lo,hi]`);
        }
      }
    }
    if (s.paceable !== undefined && typeof s.paceable !== 'boolean') bad('E-DIM-STRUCT-FIELD', 'paceable', s.paceable, 'true|false', 'L1');
    if (s.basis !== undefined && typeof s.basis !== 'string') bad('E-DIM-STRUCT-FIELD', 'basis', s.basis, 'string', 'L1');
    if (s.baselineRX !== undefined) checkValue({ type: 'rx' }, s.baselineRX, env, { row: `process.${name}`, dim: 'baselineRX', path: `${base}/baselineRX` }, err);
  }
  const consumers = isObj(doc.consumers) ? doc.consumers : {};
  for (const group of Object.keys(consumers).sort()) {
    const gpath = `${file}#/consumers/${esc(group)}`;
    const g = consumers[group];
    const gbad = (code, row, path, got, want, level = 'L1') => err({ code, level, row, dim: '', path, got, want });
    if (!KEY_RE.test(group)) gbad('E-DIM-ID-FORMAT', group, gpath, group, 'lowerCamel consumer group');
    if (!isObj(g)) { gbad('E-DIM-STRUCT-FIELD', group, gpath, typeof g, 'object: consumer -> {slot, base}'); continue; }
    for (const name of Object.keys(g).sort()) {
      const c = g[name];
      const row = `${group}.${name}`;
      const path = `${gpath}/${esc(name)}`;
      if (!KEY_RE.test(name)) gbad('E-DIM-ID-FORMAT', row, path, name, 'lowerCamel consumer');
      if (!isObj(c)) { gbad('E-DIM-STRUCT-FIELD', row, path, typeof c, '{slot, base}'); continue; }
      for (const f of Object.keys(c).sort()) if (!CONSUMER_FIELDS.includes(f)) gbad('E-DIM-STRUCT-FIELD', row, `${path}/${esc(f)}`, f, CONSUMER_FIELDS.join('|'));
      if (typeof c.slot !== 'string' || !Object.hasOwn(slots, c.slot)) gbad('E-MOD-KEY-UNREGISTERED', row, `${path}/slot`, c.slot, 'slot declared in slots (process.<slot>)', 'L2');
      if (typeof c.base !== 'number') gbad('E-DIM-STRUCT-FIELD', row, `${path}/base`, c.base, 'number');
    }
  }
}

// 第二步：类型定义（完整写法的）与表值按 L1/L2 同一套检查。env 取自维度加载（validateDimensions 的 env）。
/** @param {{errors: unknown[], tables: unknown[], rules: Record<string, unknown>}} read readRules 的结果 @param {Record<string, unknown>} env */
export function checkRules(read, env) {
  const errors = [];
  for (const t of read.tables) {
    const err = (e) => errors.push({ ...e, table: `rules.${t.code}` });
    if (Object.hasOwn(t, 'process')) { checkProcessTable(t, env, err); continue; }
    const defs = t.keyed ? [...t.defs] : t.rowDef ? [['', t.rowDef]] : [];
    for (const [k, def] of defs) if (def.type !== undefined && Object.keys(def).some((f) => f !== 'type' && f !== 'domain')) checkDef(def, env, { row: k, dim: 'type', path: `registry:${t.code}/${k}` }, err, false);
    for (const e of t.entries) {
      const at = { row: e.key, dim: '', path: e.path };
      if (!t.keyed) checkValue(t.rowKey, e.key, env, { ...at, path: e.path.replace(/\/value$/, '/key') }, err);
      const def = t.keyed ? t.defs.get(e.key) : t.rowDef;
      if (def && TYPES.includes(def.type)) checkValue(def, e.value, env, at, err);
    }
  }
  return errors;
}

// engine.rules 的取表口：未登记的表 → E-RULES-UNREGISTERED。
/** @param {Record<string, unknown>} rules engine.rules @param {string} code 表代号 */
export function ruleTable(rules, code) {
  if (!Object.hasOwn(rules, code)) throw Object.assign(new Error(`E-RULES-UNREGISTERED rules.${code}: no registry row`), { code: 'E-RULES-UNREGISTERED' });
  return rules[code];
}

// 统一报错格式（§4.2）：按 (table,row,dim,code,path) 排序，末行汇总。
/** @param {Record<string, unknown>[]} errors */
export function rulesReport(errors) {
  const out = errors.map((e) => ({
    code: e.code, severity: e.code.startsWith('W-') ? 'warning' : 'error', level: e.level || 'L1',
    table: e.table || '', row: e.row || '', dim: e.dim || '', path: e.path || '',
    got: e.got === undefined ? null : e.got, want: e.want === undefined ? '' : String(e.want),
  })).sort((a, b) => cmp(a.table, b.table) || cmp(a.row, b.row) || cmp(a.dim, b.dim) || cmp(a.code, b.code) || cmp(a.path, b.path));
  const lines = out.map((e) => `${e.code}  ${e.table}/${e.row}.${e.dim}  got ${JSON.stringify(e.got)}  want ${e.want}  — ${e.path}`);
  return { ok: !out.some((e) => e.severity === 'error'), errors: out, text: lines.length ? lines.join('\n') + '\n' : '' };
}
