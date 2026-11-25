// 规则表加载器的读表部分（卷二 §2.9 :1036 登记边界入口；§4.1 :1495、"规则表登记" :1497）。
// 收编自 server-plugin/kernel/load/rules.mjs（L-15）：门禁只用 readRules（读登记与各表文件、查登记与结构），
// 第二步的类型检查（checkRules）与运行期取表口留在归档里，这里不搬。

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import { rangeOk, DOMAIN_OPTIONAL, TYPES, KEY_RE, CODE_RE, T, markersOf } from '../../../server-plugin/kernel/validate/types.mjs';
import { isRuleTableFile } from './keys.mjs';
import { escapeJsonPointer } from './vocab-load.mjs';

export const RULES_LAYOUT = Object.freeze({ dir: 'world/rules', registry: 'registry.json' });

// 登记行的字段：卷二 :1497 的七个字段（code 表代号、file 文件、structure 结构、type 类型、domain 取值域、volume 归属卷、
// multiSourceMerge）与每键必写的 packOverridable。
const REG_FIELDS = ['code', 'file', 'structure', 'type', 'domain', 'volume', 'multiSourceMerge', 'packOverridable'];
// 规则表文件：{"rows": [{key, value, …出处字段}]}；出处字段只记来源，不参与取值。
const ROW_FIELDS = ['key', 'value', 'source', 'file', 'grade', 'basis'];
// 行表字段句柄：成员由上面的 ROW_FIELDS 派生。
const ROW_FIELD = markersOf('rules_row_field', ROW_FIELDS);
const numericOrEnum = (d) => d.type === T.type.number || d.type === T.type.integer || d.type === T.type.enum;
// 代码内封闭枚举 multi_source_merge（卷二十八 §2.1 :139–142）与各值适用的值类型（§2.11 :280）。
const MERGE = Object.freeze({
  own_key_only: () => true,
  all_and: (d) => d.type === T.type.boolean || (d.type === T.type.struct && isObj(d.fields) && Object.values(d.fields).every((f) => isObj(f) && f.type === T.type.boolean)),
  take_min: numericOrEnum,
  take_max: numericOrEnum,
});
// 独立格式：过程主体槽（卷二 §3.7 slots/consumers 嵌套格式）；登记行按文件登记，不写 type/domain。
const PROCESS_STRUCTURE = T.rule_structure.processSlots;
const PROCESS_TOP = Object.freeze(['version', 'slots', 'consumers']);

// 规则表文件结构与登记字段的固定记号（卷二 §4.1 :1495–:1497）；单一定义，比较处引用。
const RULES_DOC = Object.freeze({ rows: 'rows', empty: '' });
const STRUCTURE = Object.freeze({ keys: 'keys' });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const esc = (k) => escapeJsonPointer(String(k));

// 登记里一个键（或行表的行值）的类型定义：type 写类型名或完整类型定义，domain 并入（写法同维度表头）。
function defOf(type, domain) {
  const def = typeof type === 'string' ? { type } : isObj(type) ? { ...type } : null;
  if (def && domain !== undefined) def.domain = domain;
  return def;
}

function checkDefShape(def, merge, at) {
  if (!def || !TYPES.includes(def.type)) return at('type', def ? def.type : def, TYPES.join('|'), 'E-DIM-SCHEMA-TYPE');
  if ((def.type === T.type.number || def.type === T.type.integer) && def.domain !== undefined && !rangeOk(def.domain)) at('domain', def.domain, '[min,max] (null = unbounded)', 'E-DIM-DOMAIN-RANGE');
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
    if (!isRuleTableFile(r.file) || r.file === RULES_LAYOUT.registry) return at('file', r.file, `relative .json path under ${dir}/`);
    if (seen.file.has(r.file)) return at('file', r.file, 'one file per registry row', 'E-DIM-ID-DUPLICATE');
    seen.file.add(r.file);
    if (typeof r.volume !== 'string' || r.volume === RULES_DOC.empty) at('volume', r.volume, 'owning volume');
    if (!Object.hasOwn(MERGE, r.multiSourceMerge)) at('multiSourceMerge', r.multiSourceMerge, Object.keys(MERGE).join('|'), 'E-PACK-RULEKEY');

    // 结构：键表 "keys"（type/domain/packOverridable 逐键写）；行表 {"rows": <行键的引用写法>}（三者各写一个）。
    const t = { code: r.code, file: `${dir}/${r.file}`, keyed: r.structure === STRUCTURE.keys, defs: new Map(), rowDef: null, rowKey: null, entries: [] };
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
      for (const f of ['type', 'domain']) if (r[f] !== undefined) at(f, f, `absent for structure "${PROCESS_STRUCTURE}" (format fixed by vol2 s3.7)`);
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
  for (const k of Object.keys(doc.value)) if (k !== RULES_DOC.rows) err('', `${t.file}#/${esc(k)}`, k, 'only "rows" at top level');
  const seen = new Set();
  doc.value.rows.forEach((row, i) => {
    const path = `${t.file}#/rows/${i}`;
    if (!isObj(row) || typeof row.key !== 'string' || !Object.hasOwn(row, 'value')) return err(String(i), path, row, '{key, value}');
    for (const f of Object.keys(row).sort()) {
      if (!ROW_FIELDS.includes(f)) err(row.key, `${path}/${f}`, f, ROW_FIELDS.join('|'));
      else if (f !== ROW_FIELD.key && f !== ROW_FIELD.value && typeof row[f] !== 'string') err(row.key, `${path}/${f}`, row[f], 'string');
    }
    if (seen.has(row.key)) return err(row.key, `${path}/key`, row.key, 'unique key', 'E-DIM-DUPLICATE-KEY', 'L0');
    seen.add(row.key);
    if (t.keyed && !t.defs.has(row.key)) return err(row.key, `${path}/key`, row.key, 'key registered for this table', 'E-RULES-UNREGISTERED');
    if (!t.keyed && !CODE_RE.test(row.key)) return err(row.key, `${path}/key`, row.key, 'entry or entity code', 'E-DIM-ID-FORMAT');
    t.entries.push({ key: row.key, value: row.value, path: `${path}/value` });
  });
}

// 过程主体槽文件的顶层结构（卷二 §3.7）：{"version": 正整数, "slots": {…}, "consumers": {…}}，不认别的顶层键。槽与消费者的逐项检查在归档的 checkRules 里。
function readProcessTable(root, t, errors) {
  const err = (path, got, want, code = 'E-DIM-STRUCT-FIELD', level = 'L1') => errors.push({ code, level, table: `rules.${t.code}`, row: '', dim: '', path, got, want });
  if (!existsSync(resolve(root, t.file))) return err(t.file, 'missing', 'file named by the registry row', 'E-RULES-UNREGISTERED');
  const doc = parseJsonStrict(readFileSync(resolve(root, t.file), 'utf8'));
  for (const e of doc.errors) err(`${t.file}#${e.pointer}`, e.got, e.want, e.code, 'L0');
  if (doc.errors.length) return;
  const v = doc.value;
  if (!isObj(v)) return err(t.file, typeof v, '{"version", "slots", "consumers"} (vol2 s3.7)');
  // version 是 §3.7 格式里写着的顶层键，照收；不按它的值分支（规则只一版，不做版本分叉）。
  for (const k of Object.keys(v).sort()) if (!PROCESS_TOP.includes(k)) err(`${t.file}#/${esc(k)}`, k, PROCESS_TOP.join('|'));
  if (!isObj(v.slots)) err(`${t.file}#/slots`, v.slots, 'object: slot -> slot definition');
  if (!isObj(v.consumers)) err(`${t.file}#/consumers`, v.consumers, 'object: consumer group -> consumers');
  t.process = v;
}
