// 检测器 state_pattern（卷六 §3.5 S6-14 :337）：状态模式检查——遍历存档状态的模式声明（卷二 §2.7 状态登记表 pathTypes），
// 实体行、偏离行、状态键上凡是单位属于任一资源种类行 `unit` 的数值字段，除 `accounts.*`、`ledgerTotals.*`、`outflowTotals.*`
// 与合同、义务记录里的应付数额外，计数为 0（账本是数量的唯一出处）。
// 三处范围（S6-14 原句）：实体行 = 维度表 `rows.<id>`（卷二 §1.3 :125；卷六 §4.1 规则 11 :382）；偏离行按 pathTypes 的 `dimension`
// 与 keyKinds 的 kind 维度表表头展开（卷二 §2.7 :811）；状态键按 pathTypes 类型串与命名 struct 展开。
// 判"数量字段"只读字段单位与资源种类表的 `unit`，不按字段名、不按单个路径；命名 struct 的字段与单位取卷二 §1.5 的机读登记
// （world/ontology/named-structs.json），路径中的 `struct:<名>` 按该表展开。合同、义务记录里的应付数额按该表的字段角色标记豁免
// （role: "payable"；语义出处是卷六 §2.4 :200「应给付」，不认 qty、done 这类字段名）。
// 资源种类表经统一加载器唯一登记 world/rules/registry.json 的 economyResources 行派生（R12-11.5），不另抄表路径。
// 表或登记缺失、引用了未登记的命名 struct：报 E-ACC-ITEM-PARAM，不静默放过；kind 的维度表尚未建时按统一加载器的既有口径跳过
// （kernel/load/state-owners.mjs:259-260：无表即无字段），不把缺表当成检查通过。

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULES_LAYOUT } from '../lib/rules.mjs';
import { listItemType, parseNumberType } from '../../../server-plugin/kernel/validate/types.mjs';
import { LAYOUT } from '../read.mjs';
import { readOwnersFiles, hasOwnersFiles } from '../lib/registry-files.mjs';

const STATE_OWNERS = LAYOUT.stateOwners;
// 卷二 §1.5 命名 struct 的机读登记（落处说明见 docs/卡回报/ds-b3-4.md“已定”）。
const NAMED_STRUCTS = 'world/ontology/named-structs.json';
const RULES_REGISTRY = `${RULES_LAYOUT.dir}/${RULES_LAYOUT.registry}`;
const RESOURCE_TABLE_CODE = 'economyResources';

// S6-14 点名的账本三路径：数量只存在于账本，整键豁免。
const LEDGER_KEYS = Object.freeze(['accounts', 'ledgerTotals', 'outflowTotals']);
// 合同、义务记录的状态键（卷六 :337 的「合同、义务记录」）：只豁免其中的应付数额，不整键放过。
const RECORD_KEYS = Object.freeze(['contracts', 'obligations']);
// 卷二 §2.7 :815 keyKinds 的非实体键代号 dimKey（维度名所在 `*` 段）。
const DIM_KEY = 'dimKey';
// 应付数额的字段角色标记（卷六 §2.4 :200「应给付」；标记与出处在命名 struct 登记行里）。
const PAYABLE_ROLE = 'payable';

// pathTypes 与命名 struct 共用的命名 struct 引用：struct:<名>，可带一个类型参数（struct:byState<number>）与 nullable。
const STRUCT_REF = /^struct:([A-Za-z0-9_]+)(?:<([A-Za-z0-9_]+)>)?(?: nullable)?$/;
const SET_TYPE = /^set<(.+)>$/;
// 维度类型树里的容器位置记号，只用于拼 symbolPath（与实际值的遍历同一套记号）。
const VALUE = '<value>';
const ELEM = '[]';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stripNullable = (s) => (s.endsWith(' nullable') ? s.slice(0, -' nullable'.length) : s);

// 被查内容里有就用被查内容，否则取仓库根上的同一路径（夹具只改它关心的那几份登记）。
function readJson(ctx, rel) {
  if (ctx.files.includes(rel)) return JSON.parse(ctx.read(rel));
  if (existsSync(join(ctx.root, rel))) return JSON.parse(readFileSync(join(ctx.root, rel), 'utf8'));
  return null;
}

// 资源种类行的 unit 集合；表或行不合即返回错误说明（调用方报 E-ACC-ITEM-PARAM）。
function resourceUnits(ctx) {
  const reg = readJson(ctx, RULES_REGISTRY);
  if (!isObj(reg) || !Array.isArray(reg.rows)) return { why: `${RULES_REGISTRY} 读不出登记行`, file: RULES_REGISTRY };
  const row = reg.rows.find((r) => isObj(r) && r.code === RESOURCE_TABLE_CODE);
  if (!row || typeof row.file !== 'string') return { why: `规则表登记缺 ${RESOURCE_TABLE_CODE} 行`, file: RULES_REGISTRY };
  const rel = `${RULES_LAYOUT.dir}/${row.file}`;
  const table = readJson(ctx, rel);
  if (!isObj(table) || !Array.isArray(table.rows) || table.rows.length === 0) return { why: `${rel} 无资源种类行`, file: rel };
  const units = new Set();
  for (const r of table.rows) {
    const unit = isObj(r) && isObj(r.value) ? r.value.unit : undefined;
    if (typeof unit !== 'string' || unit === '') return { why: `${rel} 的资源种类行缺 unit`, file: rel };
    units.add(unit);
  }
  return { units, file: rel };
}

// 命名 struct：名字（去掉 <类型参数>）→ 登记行。文件缺失或 rows 不是列表即报参数错。
function namedStructs(ctx) {
  const doc = readJson(ctx, NAMED_STRUCTS);
  if (!isObj(doc) || !Array.isArray(doc.rows)) return { why: `${NAMED_STRUCTS} 读不出登记行`, file: NAMED_STRUCTS };
  const rows = new Map();
  for (const r of doc.rows) {
    if (!isObj(r) || typeof r.name !== 'string') continue;
    rows.set(r.name.replace(/<.*$/, ''), r);
  }
  return { rows, file: NAMED_STRUCTS };
}

// 维度表：kind → {file, doc}。与统一加载器同一目录约定（LAYOUT.dimensionsDir 下 `_` 开头的是公共表，不算实体表）。
function dimensionTables(ctx) {
  const tables = new Map();
  for (const file of ctx.files) {
    if (!file.startsWith(`${LAYOUT.dimensionsDir}/`) || !file.endsWith('.json')) continue;
    const base = file.slice(file.lastIndexOf('/') + 1);
    if (base.startsWith('_')) continue;
    let doc; try { doc = JSON.parse(ctx.read(file)); } catch { doc = null; }
    if (!isObj(doc)) continue;
    const kind = typeof doc.kind === 'string' && doc.kind ? doc.kind : base.slice(0, -'.json'.length);
    tables.set(kind, { file, doc });
  }
  return tables;
}

// 维度表表头里的类型树：产出数值叶子的位置与单位（map 值、list/set 元素、struct 字段、curve 两轴、union 成员）。
// 位置是相对该维度值的段列表：VALUE/ELEM 是容器记号，其余是字段名。
function dimensionUnitLeaves(def, path) {
  const out = [];
  if (!isObj(def)) return out;
  const t = def.type;
  if ((t === 'number' || t === 'integer') && typeof def.unit === 'string') { out.push({ path, unit: def.unit }); return out; }
  if (t === 'map' && isObj(def.value)) out.push(...dimensionUnitLeaves(def.value, [...path, VALUE]));
  if ((t === 'list' || t === 'set') && isObj(def.of)) out.push(...dimensionUnitLeaves(def.of, [...path, ELEM]));
  if (t === 'struct' && isObj(def.fields)) for (const [k, v] of Object.entries(def.fields)) out.push(...dimensionUnitLeaves(v, [...path, k]));
  if (t === 'curve') for (const ax of ['x', 'y']) if (typeof def[ax] === 'string') out.push({ path: [...path, ax], unit: def[ax] });
  if (t === 'union') for (const m of [...(Array.isArray(def.anyOf) ? def.anyOf : []), ...(Array.isArray(def.oneOf) ? def.oneOf : [])]) out.push(...dimensionUnitLeaves(m, path));
  return out;
}

// 一个偏离行/实体行的值是否在该位置确有数值叶子（容器逐层展开；null 不算）。
function hasNumber(value, path) {
  if (path.length === 0) return typeof value === 'number';
  const [head, ...rest] = path;
  if (head === VALUE) return isObj(value) && Object.values(value).some((v) => hasNumber(v, rest));
  if (head === ELEM) return Array.isArray(value) && value.some((v) => hasNumber(v, rest));
  return isObj(value) && Object.hasOwn(value, head) && hasNumber(value[head], rest);
}

// 位置段列表 → symbolPath 后缀（`<value>`/`[]` 直接贴在前一段后，字段名用点号）。
function atSuffix(path) {
  let s = '';
  for (const p of path) s += p === VALUE || p === ELEM ? p : s ? `.${p}` : p;
  return s;
}

// 命名 struct 行里的应付数额字段（role 标记；出处随标记写在该行）。
function payableFields(row) {
  if (!isObj(row.fieldRoles)) return [];
  return Object.keys(row.fieldRoles).filter((f) => {
    const v = row.fieldRoles[f];
    return (typeof v === 'string' ? v : isObj(v) ? v.role : undefined) === PAYABLE_ROLE;
  });
}

// 叶子是否落在某个带角色标记的字段下（含容器与嵌套字段）。
function isPayable(at, marks) {
  return marks.some(({ base, fields }) => fields.some((f) => {
    const full = base ? `${base}.${f}` : f;
    return at === full || at.startsWith(`${full}.`) || at.startsWith(`${full}${VALUE}`) || at.startsWith(`${full}${ELEM}`);
  }));
}

// map<键, 值> 的顶层逗号切分（键里可含 <> 嵌套）。
function mapParts(s) {
  if (!s.startsWith('map<') || !s.endsWith('>')) return null;
  const inner = s.slice('map<'.length, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (c === ',' && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
  }
  return null;
}

// 展开一个类型节点，产出数值叶子 {at, unit, payable} 或未登记引用 {missing, at}。
// at 是该字段相对 pathTypes 模式的路径（点号连接；容器用 []、<value> 标记）。
// subst：命名 struct 的类型参数替换 {name:"T", arg:"number"}（struct:byState<number> 用），无参数为 undefined。
// marks：已进入的命名 struct 的应付字段标记 [{base, fields}]，随 struct 展开累积。
function* leaves(node, at, structs, stack, subst, marks) {
  if (typeof node === 'string') {
    let s = node.trim();
    if (subst && (s === subst.name || s.startsWith(`${subst.name} `))) s = `${subst.arg}${s.slice(subst.name.length)}`;
    s = stripNullable(s);
    const item = listItemType(s);
    if (item !== null) { yield* leaves(item, `${at}${ELEM}`, structs, stack, subst, marks); return; }
    const set = SET_TYPE.exec(s);
    if (set) { yield* leaves(set[1], `${at}${ELEM}`, structs, stack, subst, marks); return; }
    const map = mapParts(s);
    if (map) { yield* leaves(map[1], `${at}${VALUE}`, structs, stack, subst, marks); return; }
    const num = parseNumberType(s);
    if (num) { if (num.unit !== undefined) yield { at, unit: num.unit, payable: isPayable(at, marks) }; return; }
    const ref = STRUCT_REF.exec(s);
    if (ref) {
      const base = `struct:${ref[1]}`;
      const row = structs.get(base);
      if (!row) { yield { missing: base, at }; return; }
      if (stack.has(base)) return;
      const next = row.typeParam && ref[2] ? { name: row.typeParam, arg: ref[2] } : undefined;
      const fields = payableFields(row);
      const nextMarks = fields.length ? [...marks, { base: at, fields }] : marks;
      yield* leaves(row.type, at, structs, new Set([...stack, base]), next, nextMarks);
    }
    return;
  }
  if (!isObj(node)) return;
  if (node.list !== undefined) yield* leaves(node.list, `${at}${ELEM}`, structs, stack, subst, marks);
  if (node.set !== undefined) yield* leaves(node.set, `${at}${ELEM}`, structs, stack, subst, marks);
  if (node.map !== undefined && isObj(node.map)) yield* leaves(node.map.value, `${at}${VALUE}`, structs, stack, subst, marks);
  if (node.struct !== undefined) {
    if (typeof node.struct === 'string') yield* leaves(node.struct, at, structs, stack, subst, marks);
    else if (isObj(node.struct)) for (const [k, v] of Object.entries(node.struct)) yield* leaves(v, at ? `${at}.${k}` : k, structs, stack, subst, marks);
  }
  for (const v of Array.isArray(node.union) ? node.union : []) yield* leaves(v, at, structs, stack, subst, marks);
}

const firstSeg = (p) => p.split('.')[0];

/**
 * @param {any} ctx
 * @param {any} params
 */
export function detect(ctx, params) {
  const code = params.code || '';
  const hits = [];
  const paramHit = (file, why) => hits.push({ file, line: 0, nodeKind: 'param', symbolPath: why, code: 'E-ACC-ITEM-PARAM' });
  if (!(params.checks || []).includes('stateQuantity')) return hits;

  const res = resourceUnits(ctx);
  if (!res.units) { paramHit(res.file, res.why); return hits; }
  const structsDoc = namedStructs(ctx);
  if (!structsDoc.rows) { paramHit(structsDoc.file, structsDoc.why); return hits; }

  // 声明表按主文件与分片的合并结果读（S2-SH）；命中锚点取登记该 pathTypes 键的文件（无分片时即主文件）。
  const owners = readOwnersFiles(hasOwnersFiles(ctx) ? ctx : ctx.root);
  const decl = owners.doc;
  if (!isObj(decl) || !isObj(decl.pathTypes)) { paramHit(STATE_OWNERS, 'state-owners.json 无 pathTypes'); return hits; }

  const tables = dimensionTables(ctx);
  // 实体行：维度表 rows.<id> 上该维度确有数值叶子时，报在该维度表文件上（卷六 §4.1 规则 11 :382）。
  for (const kind of [...tables.keys()].sort()) {
    const { file, doc } = tables.get(kind);
    const dims = isObj(doc.dimensions) ? doc.dimensions : {};
    const rows = isObj(doc.rows) ? doc.rows : {};
    for (const rowId of Object.keys(rows).sort()) {
      const row = rows[rowId];
      if (!isObj(row)) continue;
      for (const dim of Object.keys(dims).sort()) {
        if (!Object.hasOwn(row, dim)) continue;
        for (const leaf of dimensionUnitLeaves(dims[dim], [])) {
          if (!res.units.has(leaf.unit) || !hasNumber(row[dim], leaf.path)) continue;
          hits.push({ file, line: 0, nodeKind: 'row', symbolPath: `${rowId}.${dim}${atSuffix(leaf.path)}`, code });
        }
      }
    }
  }

  // 状态键与偏离行：按 pathTypes 逐条展开。
  for (const pattern of Object.keys(decl.pathTypes).sort()) {
    const kind = firstSeg(pattern);
    if (LEDGER_KEYS.includes(kind)) continue;
    const anchor = owners.originOf(['pathTypes', pattern]);
    const type = decl.pathTypes[pattern];
    // 偏离行：dimension 路径按 keyKinds 的实体 kind 取维度表表头（卷二 §2.7 :811；与 kernel/load/state-owners.mjs:255-268 同口径）。
    // 维度名是字面段时只看这一维；kind 的表尚未建时跳过（同加载器 :259-260：无表即无字段）。
    if (type === 'dimension') {
      const kk = isObj(decl.keyKinds) ? decl.keyKinds[pattern] : undefined;
      if (!Array.isArray(kk)) { paramHit(anchor, `${pattern}: dimension 路径缺 keyKinds`); continue; }
      const segs = pattern.split('.');
      const dimAt = kk.indexOf(DIM_KEY);
      const literalDim = dimAt < 0 ? segs[segs.length - 1] : null;
      const kinds = new Set();
      for (const item of kk) for (const k of Array.isArray(item) ? item : [item]) if (typeof k === 'string') kinds.add(k);
      for (const k of [...kinds].sort()) {
        const table = tables.get(k);
        if (!table) continue;
        const dims = isObj(table.doc.dimensions) ? table.doc.dimensions : {};
        for (const dim of Object.keys(dims).sort()) {
          if (literalDim !== null && literalDim !== dim) continue;
          for (const leaf of dimensionUnitLeaves(dims[dim], [])) {
            if (!res.units.has(leaf.unit)) continue;
            hits.push({ file: table.file, line: 0, nodeKind: 'row', symbolPath: `${pattern}:${k}.${dim}${atSuffix(leaf.path)}`, code });
          }
        }
      }
      continue;
    }
    for (const leaf of leaves(type, '', structsDoc.rows, new Set(), undefined, [])) {
      const at = leaf.at ? `${pattern}.${leaf.at}` : pattern;
      if (leaf.missing) { paramHit(anchor, `${at}: ${leaf.missing} 未在 ${NAMED_STRUCTS} 登记`); continue; }
      if (!res.units.has(leaf.unit)) continue;
      // 应付数额只豁免合同、义务记录里的字段；其他状态键上的 payable 标记不构成豁免。
      if (leaf.payable && RECORD_KEYS.includes(kind)) continue;
      hits.push({ file: anchor, line: 0, nodeKind: 'row', symbolPath: at, code });
    }
  }
  return hits.sort((a, b) => (a.symbolPath < b.symbolPath ? -1 : a.symbolPath > b.symbolPath ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}
