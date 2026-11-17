// 声明表合并器（卷二 §2.7 系统声明表 `state-owners.json`；卷一 §6.3 G-2"声明表合并器"；卷十二 §2.11 `dim-validate` 设施）。
// 读已解析的 state-owners.json：把 stateKeys.<键>.writers 的相对模式转成绝对模式（§2.7"writers 键与 pathTypes 键的写法"），
// 与 textWriters 合成一份写者登记，连同 pathTypes、textPaths、systems、readShapes 按卷二 §2.7 与 §4.3 核对；
// 推进钩子的 sortKey 按卷十一 R11-3.14 算法重算并与文件比对（算法 assignSortKeys 由 tools/gen-sort-keys.mjs 共用，不写两份）。
// 只按登记数据判，不认任何具体顶层键、系统、文件或路径。报码一律取 E 句柄的生成函数 buildE（kernel/handles/generated.mjs）。

import { buildE, buildP } from '../handles/generated.mjs';
import { checkPathPattern } from '../handles/keys.mjs';
import { errorCodeOf, HandleError } from '../handles/vocab-handle.mjs';

const E = buildE();

// 账本账户路径（§2.6 第 4 条"`*.coins` 等，只经账本转移"）：改写写者是账本写者的模式；P 不为它们生成构造函数。
// 账本写者文件即 kernelApi 的账本转移 `moveCoins/moveStock/transfer` 所在文件（§2.7 kernelApi、stateKeys 示例 `"*.coins": "kernel/ledger.mjs"`）。
export const LEDGER_WRITER = 'kernel/ledger.mjs';

// 系统登记项的字段（§2.7 JSON 示例与各项定义：两个闭集字段、phase、terminationCleanup（§2.6）、emits 与 eventDerive、inputs 写回镜像）。
const SYSTEM_FIELDS = new Set(['view', 'predicates', 'tables', 'writers', 'sources', 'sinks', 'entryCallerFiles', 'entryJudges', 'phase', 'terminationCleanup', 'emits', 'eventDerive', 'inputs']);
// 状态顶层键登记项的字段（§2.5 :479"readers、writers、display 字段集合"；§2.6 去留表 subjectRecords）。
const STATE_KEY_FIELDS = new Set(['readers', 'writers', 'display', 'subjectRecords']);
// 写者对象（§2.7"建行写者与改写写者"第 ② 种写法；viaRelocate 见 §2.6"行改挂"）。
const WRITER_FIELDS = new Set(['create', 'rewrite', 'rewriteRows', 'viaRelocate']);
// 推进钩子登记项：阶段、机读 after 列表（卷十一 R11-3.14、C11-5 ⑥）、排序键。
const HOOK_FIELDS = ['phase', 'after', 'sortKey'];
// 读入口返回形状登记行（§2.7"读入口返回形状登记"第 1 点，五字段封闭）。
const SHAPE_FIELDS = ['entry', 'field', 'type', 'refFamily', 'nullable'];
const SHAPE_TYPES = new Set(['number', 'boolean', 'code', 'handle', 'shape']);
const FIELD_RE = /^[a-z][a-zA-Z0-9_]*(\.[a-z][a-zA-Z0-9_]*)*$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s !== '');
const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const segs = (p) => p.split('.');
const exactKeys = (o, list) => isObj(o) && sorted(Object.keys(o)).join(',') === sorted(list).join(',');

// ---------- 路径模式匹配语义（§2.7 SA-P5；pathTypes、textPaths、textWriters、stateKeys.writers 共用） ----------

/** 两条模式是否存在共同可匹配的具体路径（`*` 恰匹配一段）。 */
export function patternsOverlap(a, b) {
  const x = segs(a), y = segs(b);
  return x.length === y.length && x.every((s, i) => s === '*' || y[i] === '*' || s === y[i]);
}

/** 模式 a 是否覆盖 b 的全部具体路径（a 的每段是 `*` 或与 b 同段）。 */
export function patternCovers(a, b) {
  const x = segs(a), y = segs(b);
  return x.length === y.length && x.every((s, i) => s === '*' || s === y[i]);
}

/**
 * 具体程度比较：字面段数多者更具体；字面段数相同则 `*` 更靠后者更具体（逐个比较 `*` 的位置）。
 * 返回正数表示 a 更具体，0 表示同等具体。
 */
export function compareSpecificity(a, b) {
  const x = segs(a), y = segs(b);
  const lit = (s) => s.filter((t) => t !== '*').length;
  if (lit(x) !== lit(y)) return lit(x) - lit(y);
  const sx = x.flatMap((t, i) => (t === '*' ? [i] : [])), sy = y.flatMap((t, i) => (t === '*' ? [i] : []));
  for (let i = 0; i < Math.min(sx.length, sy.length); i++) if (sx[i] !== sy[i]) return sx[i] - sy[i];
  return sx.length - sy.length;
}

/** 一组模式里具体程度相同且重叠的对（E-PATH-OVERLAP）。 */
export function overlapPairs(patterns) {
  const out = [];
  for (let i = 0; i < patterns.length; i++) for (let j = i + 1; j < patterns.length; j++) {
    if (compareSpecificity(patterns[i], patterns[j]) === 0 && patternsOverlap(patterns[i], patterns[j])) out.push([patterns[i], patterns[j]]);
  }
  return out;
}

// ---------- 推进钩子排序键（卷十一 R11-3.14 算法） ----------

/**
 * 按 R11-3.14 分配 sortKey：每个推进相位内，对全部钩子按机读 `after` 列表拓扑排序，同序的按钩子代号升序，从 1 起连续编号。
 * "同序"取拓扑层次：没有 after 的钩子在第 0 层，其余在其 after 所指钩子的最大层次加 1。
 * after 指向不在同一相位的钩子、成环、或两个系统登记同名钩子时记入 problems（不编号以外的处置交调用方）。
 * @param {Record<string, any>} systems state-owners.json 的 systems
 * @returns {{keys: Map<string, number>, problems: string[]}} keys：钩子代号 → sortKey
 */
export function assignSortKeys(systems) {
  const hooks = new Map();
  const problems = [];
  for (const sys of sorted(Object.keys(isObj(systems) ? systems : {}))) {
    const ph = isObj(systems[sys]) ? systems[sys].phase : undefined;
    if (!isObj(ph)) continue;
    for (const name of sorted(Object.keys(ph))) {
      const h = isObj(ph[name]) ? ph[name] : {};
      if (hooks.has(name)) { problems.push(`hook ${name} registered by both ${hooks.get(name).system} and ${sys}`); continue; }
      hooks.set(name, { system: sys, phase: h.phase, after: Array.isArray(h.after) ? h.after : [] });
    }
  }
  const level = new Map();
  const open = new Set();
  const visit = (name, trail) => {
    if (level.has(name)) return level.get(name);
    if (open.has(name)) { problems.push(`after cycle: ${[...trail.slice(trail.indexOf(name)), name].join(' -> ')}`); return 0; }
    open.add(name);
    const h = hooks.get(name);
    let lv = 0;
    for (const a of h.after) {
      const t = hooks.get(a);
      if (!t || t.phase !== h.phase) { problems.push(`${name}.after names ${JSON.stringify(a)}, not a hook of phase ${h.phase}`); continue; }
      lv = Math.max(lv, visit(a, [...trail, name]) + 1);
    }
    open.delete(name);
    level.set(name, lv);
    return lv;
  };
  for (const name of sorted(hooks.keys())) visit(name, []);
  const keys = new Map();
  const phases = sorted(new Set([...hooks.values()].map((h) => String(h.phase))));
  for (const phase of phases) {
    const names = [...hooks.keys()].filter((n) => String(hooks.get(n).phase) === phase);
    names.sort((a, b) => level.get(a) - level.get(b) || (a < b ? -1 : a > b ? 1 : 0));
    names.forEach((n, i) => keys.set(n, i + 1));
  }
  return { keys, problems: sorted(new Set(problems)) };
}

// ---------- pathTypes 值类型文法（§2.7"E-TEXT-UNGATED 的机器判定"） ----------

// 返回 null 或 {code, want}。units：_units.json 已载入的单位（Map 或 Set）。
function typeIssue(t, units) {
  if (typeof t !== 'string') return { code: E.E_DIM_STRUCT_FIELD, want: 'type string' };
  if (t === 'string') return { code: E.E_TEXT_UNGATED, want: 'no path may be typed string' };
  const list = /^list<(?<item>.+)>$/.exec(t);
  if (list) return typeIssue(list.groups.item, units);
  const num = /^(?<base>number|integer)(?::(?<unit>.*))?$/.exec(t);
  if (num) return num.groups.unit && units.has(num.groups.unit) ? null : { code: E.E_DIM_UNIT_UNKNOWN, want: `${num.groups.base}:<unit in _units.json>` };
  if (['boolean', 'dimension', 'sealed', 'EventId'].includes(t)) return null;
  if (/^(ref|enum):[a-z][a-z0-9_]*$/.test(t) || /^struct:[a-zA-Z][a-zA-Z0-9_<>]*$/.test(t)) return null;
  return { code: E.E_DIM_STRUCT_FIELD, want: 'number:<u> | integer:<u> | boolean | ref:<kind> | enum:<family> | dimension | struct:<name> | sealed | EventId | list<…>' };
}
const mentionsSealed = (t) => typeof t === 'string' && /(^|<)sealed(>|$)/.test(t);

// ---------- 合并与核对 ----------

/**
 * 合并并核对 state-owners.json。
 * @param {any} decl 已解析的 state-owners.json
 * @param {{units?: Map<string, any> | Set<string>, kinds?: Set<string>, families?: Set<string>}} [ctx]
 *   units：_units.json 的单位；kinds：已载入的实体类（维度表 kind）；families：词表族。readShapes 的 refFamily 按后两者核。
 * @returns {{ok: boolean, errors: any[], text: string, merged: {writers: any[], pathTypes: Record<string, string>, textPaths: string[], ledgerPaths: string[], displayPaths: string[], hooks: any[]}}}
 */
export function mergeStateOwners(decl, ctx = {}) {
  const units = ctx.units || new Set();
  const errors = [];
  const err = (code, row, path, got, want) => errors.push({ code, severity: code.startsWith('W-') ? 'warning' : 'error', level: 'L2', table: 'state-owners', row, dim: '', path, got, want });
  const d = isObj(decl) ? decl : {};
  const opt = (k, test, want) => { if (d[k] !== undefined && !test(d[k])) err(E.E_DIM_STRUCT_FIELD, k, `#/${k}`, typeof d[k], want); return d[k] !== undefined && test(d[k]); };

  // pathTypes：字面段文法（2-1 的 checkPathPattern）与值类型。
  const pathTypes = opt('pathTypes', isObj, 'object pattern → type') ? d.pathTypes : {};
  const textPaths = opt('textPaths', isStrList, 'list of path patterns') ? d.textPaths : [];
  const textWriters = opt('textWriters', isObj, 'object textPath → writer file') ? d.textWriters : {};
  const textSet = new Set(textPaths);
  let grammarOk = true;
  for (const p of sorted(Object.keys(pathTypes))) {
    try { checkPathPattern(p); } catch (e) {
      if (!(e instanceof HandleError)) throw e;
      grammarOk = false;
      err(errorCodeOf(e.code), p, `#/pathTypes/${p}`, p, e.message);
    }
    const t = pathTypes[p];
    const issue = typeIssue(t, units);
    if (issue) err(issue.code, p, `#/pathTypes/${p}`, t, issue.want);
    else if (textSet.has(p) && t !== 'sealed') err(E.E_TEXT_UNGATED, p, `#/pathTypes/${p}`, t, 'textPaths must be typed sealed');
    else if (!textSet.has(p) && mentionsSealed(t)) err(E.E_TEXT_UNGATED, p, `#/pathTypes/${p}`, t, 'sealed only on textPaths');
  }
  for (const [a, b] of overlapPairs(Object.keys(pathTypes))) err(E.E_PATH_OVERLAP, a, '#/pathTypes', b, 'patterns of equal specificity must not overlap');

  // textPaths 与 textWriters：每条 textPath 在 pathTypes 内、恰一个写者（E-WRITER-MISSING）；写者表只收 textPaths。
  for (const tp of textPaths) {
    if (!Object.hasOwn(pathTypes, tp)) err(E.E_PATH_UNDECLARED, tp, '#/textPaths', tp, 'textPath declared in pathTypes as sealed');
    if (typeof textWriters[tp] !== 'string' || textWriters[tp] === '') err(E.E_WRITER_MISSING, tp, '#/textWriters', textWriters[tp], 'exactly one writer file per textPath');
  }
  for (const tp of sorted(Object.keys(textWriters))) if (!textSet.has(tp)) err(E.E_PATH_UNDECLARED, tp, `#/textWriters/${tp}`, tp, 'textWriters key must be a textPath');
  for (const [a, b] of overlapPairs(textPaths)) err(E.E_PATH_OVERLAP, a, '#/textPaths', b, 'patterns of equal specificity must not overlap');

  // stateKeys：字段、写者两种写法、display、顶层键覆盖。
  const stateKeys = opt('stateKeys', isObj, 'object key → {readers, writers, display?, subjectRecords?}') ? d.stateKeys : {};
  const writers = new Map(); // 绝对模式 → {pattern, key, create, rewrite, rewriteRows, viaRelocate, source}
  const displayPaths = [];
  for (const key of sorted(Object.keys(stateKeys))) {
    const row = stateKeys[key];
    const at = `#/stateKeys/${key}`;
    if (!isObj(row)) { err(E.E_DIM_STRUCT_FIELD, key, at, typeof row, '{readers, writers, display?, subjectRecords?}'); continue; }
    for (const f of sorted(Object.keys(row))) if (!STATE_KEY_FIELDS.has(f)) err(E.E_DIM_STRUCT_FIELD, key, `${at}/${f}`, f, `one of ${[...STATE_KEY_FIELDS].join(', ')}`);
    if (!isStrList(row.readers)) err(E.E_DIM_STRUCT_FIELD, key, `${at}/readers`, row.readers, 'list of node names or files');
    if (row.subjectRecords !== undefined && !isObj(row.subjectRecords)) err(E.E_DIM_STRUCT_FIELD, key, `${at}/subjectRecords`, typeof row.subjectRecords, 'object pattern → {recordClass, subjectSegments}');
    // display：相对该顶层键的路径模式列表，可省（省即空集）；每条转成绝对模式后须是 pathTypes 已有模式。
    if (row.display !== undefined && !isStrList(row.display)) err(E.E_DIM_STRUCT_FIELD, key, `${at}/display`, row.display, 'list of path patterns relative to the key');
    else for (const rel of row.display || []) {
      const abs = `${key}.${rel}`;
      if (!Object.hasOwn(pathTypes, abs)) err(E.E_PATH_UNDECLARED, key, `${at}/display`, abs, 'display pattern declared in pathTypes');
      else displayPaths.push(abs);
    }
    if (!isObj(row.writers)) { err(E.E_DIM_STRUCT_FIELD, key, `${at}/writers`, typeof row.writers, 'object relative pattern → writer'); continue; }
    for (const rel of sorted(Object.keys(row.writers))) {
      const w = row.writers[rel];
      const wat = `${at}/writers/${rel}`;
      const abs = `${key}.${rel}`;
      if (rel === '' || segs(rel).includes('')) { err(E.E_DIM_STRUCT_FIELD, key, wat, rel, 'non-empty relative path pattern'); continue; }
      const rec = parseWriter(w, (code, got, want) => err(code, abs, wat, got, want));
      if (rec) writers.set(abs, { pattern: abs, key, ...rec, source: 'stateKeys' });
    }
  }
  // textWriters 也是该 textPath 的改写写者；与 stateKeys 登记同一模式而写者不同即一路径多写者。
  for (const tp of textPaths) {
    const f = textWriters[tp];
    if (typeof f !== 'string' || f === '') continue;
    const prev = writers.get(tp);
    if (prev && prev.rewrite !== f) err(E.E_WRITER_DUPLICATE, tp, `#/textWriters/${tp}`, `${prev.rewrite} / ${f}`, 'one rewrite writer per pattern');
    else if (!prev) writers.set(tp, { pattern: tp, key: segs(tp)[0], create: [], rewrite: f, rewriteRows: 'all', viaRelocate: false, source: 'textWriters' });
  }
  for (const [a, b] of overlapPairs([...writers.keys()])) err(E.E_PATH_OVERLAP, a, '#/stateKeys', b, 'writer patterns of equal specificity must not overlap');
  // 每个状态顶层键至少有一条 pathTypes 模式覆盖（§2.7 路径模式匹配语义末句）。
  for (const key of sorted(Object.keys(stateKeys))) {
    if (!Object.keys(pathTypes).some((p) => { const s0 = segs(p)[0]; return s0 === key || s0 === '*'; })) err(E.E_PATH_UNDECLARED, key, `#/stateKeys/${key}`, key, 'at least one pathTypes pattern under the key');
  }
  // memberRecomputable：每条须是 pathTypes 已有模式（§2.7）。
  if (opt('memberRecomputable', isStrList, 'list of path patterns')) {
    for (const p of d.memberRecomputable) if (!Object.hasOwn(pathTypes, p)) err(E.E_PATH_UNDECLARED, p, '#/memberRecomputable', p, 'pattern declared in pathTypes');
  }

  // systems：两个闭集字段必写（§2.7 :770）；写者列表跨系统不重（E-STATE-MULTI-WRITER）；推进钩子格式与排序键。
  const phases = opt('phases', (v) => isStrList(v) && new Set(v).size === v.length, 'list of distinct phase codes') ? d.phases : null;
  const systems = opt('systems', isObj, 'object system key → registration') ? d.systems : {};
  const claimed = new Map();
  const hooks = [];
  let hooksOk = true;
  const entries = new Set();
  for (const name of sorted(Object.keys(systems))) {
    const s = systems[name];
    const at = `#/systems/${name}`;
    if (!isObj(s)) { err(E.E_DIM_STRUCT_FIELD, name, at, typeof s, 'system registration object'); hooksOk = false; continue; }
    for (const f of sorted(Object.keys(s))) if (!SYSTEM_FIELDS.has(f)) err(E.E_DIM_STRUCT_FIELD, name, `${at}/${f}`, f, `one of ${[...SYSTEM_FIELDS].join(', ')}`);
    if (!isObj(s.entryCallerFiles) || !Object.values(s.entryCallerFiles).every(isStrList)) err(E.E_DIM_STRUCT_FIELD, name, `${at}/entryCallerFiles`, s.entryCallerFiles, 'object entry → list of files ({} when none)');
    if (!(Array.isArray(s.entryJudges) && (s.entryJudges.length === 0 || isStrList(s.entryJudges)))) err(E.E_DIM_STRUCT_FIELD, name, `${at}/entryJudges`, s.entryJudges, 'list of <file>#<fn> ([] when none)');
    for (const f of ['predicates', 'tables', 'writers', 'sinks', 'emits']) if (s[f] !== undefined && !(Array.isArray(s[f]) && (s[f].length === 0 || isStrList(s[f])))) err(E.E_DIM_STRUCT_FIELD, name, `${at}/${f}`, s[f], 'list of strings');
    for (const f of ['view', 'eventDerive']) if (s[f] !== undefined && (typeof s[f] !== 'string' || !s[f].includes('#'))) err(E.E_DIM_STRUCT_FIELD, name, `${at}/${f}`, s[f], '<file>#<fn>');
    for (const f of ['sources', 'terminationCleanup']) if (s[f] !== undefined && !isObj(s[f])) err(E.E_DIM_STRUCT_FIELD, name, `${at}/${f}`, typeof s[f], 'object');
    for (const p of Array.isArray(s.writers) ? s.writers : []) {
      if (claimed.has(p)) err(E.E_STATE_MULTI_WRITER, name, `${at}/writers`, p, `pattern already claimed by ${claimed.get(p)}`);
      else claimed.set(p, name);
    }
    // 已登记读入口（readShapes 的 entry 只能取这些）：view、predicates 里的函数、entryCallerFiles 的键（拼 view 所指文件）。
    if (typeof s.view === 'string') entries.add(s.view);
    for (const p of Array.isArray(s.predicates) ? s.predicates : []) entries.add(p);
    const viewFile = typeof s.view === 'string' ? s.view.split('#')[0] : null;
    if (viewFile && isObj(s.entryCallerFiles)) for (const fn of Object.keys(s.entryCallerFiles)) entries.add(`${viewFile}#${fn}`);
    if (s.phase === undefined) continue;
    if (!isObj(s.phase)) { err(E.E_DIM_STRUCT_FIELD, name, `${at}/phase`, typeof s.phase, 'object hook → {phase, after, sortKey}'); hooksOk = false; continue; }
    for (const hook of sorted(Object.keys(s.phase))) {
      const h = s.phase[hook];
      const hat = `${at}/phase/${hook}`;
      if (!exactKeys(h, HOOK_FIELDS)) { err(E.E_DIM_STRUCT_FIELD, name, hat, isObj(h) ? sorted(Object.keys(h)).join(',') : typeof h, HOOK_FIELDS.join(', ')); hooksOk = false; continue; }
      if (!phases || !phases.includes(h.phase)) { err(E.E_DIM_DOMAIN_ENUM, name, `${hat}/phase`, h.phase, `one of phases (${(phases || []).join(', ')})`); hooksOk = false; }
      if (!(Array.isArray(h.after) && (h.after.length === 0 || isStrList(h.after)))) { err(E.E_DIM_STRUCT_FIELD, name, `${hat}/after`, h.after, 'list of hook names'); hooksOk = false; }
      if (!Number.isInteger(h.sortKey) || h.sortKey < 1) { err(E.E_DIM_STRUCT_FIELD, name, `${hat}/sortKey`, h.sortKey, 'integer ≥ 1'); hooksOk = false; }
      hooks.push({ system: name, hook, phase: h.phase, after: h.after, sortKey: h.sortKey });
    }
  }
  // 同阶段同键（§2.7 :766）。
  const seenKey = new Map();
  for (const h of hooks) {
    const k = JSON.stringify([h.phase, h.sortKey]);
    if (seenKey.has(k)) { err(E.E_PHASE_DUPLICATE, h.hook, `#/systems/${h.system}/phase/${h.hook}`, `${h.phase} ${h.sortKey}`, `distinct sortKey within phase (also ${seenKey.get(k)})`); hooksOk = false; }
    else seenKey.set(k, h.hook);
  }
  // sortKey 重算比对（卷十一 R11-3.14；块 2 体检 K2-24）：只在钩子格式无误、无同阶段同键（已报 E-PHASE-DUPLICATE）时做。
  // after 成环、指向不存在的钩子与"文件值≠重算值"的错误码尚无（原 E-MIG-SORTKEY-ORDER 随卷十一退役、改名未定，docs/问题.md 勘误批），
  // 在码定下之前以异常中止加载，不借用别的码。
  if (hooksOk && hooks.length) {
    const { keys, problems } = assignSortKeys(systems);
    const drift = hooks.filter((h) => keys.get(h.hook) !== h.sortKey).map((h) => `${h.hook}: file ${h.sortKey}, recomputed ${keys.get(h.hook)}`);
    if (problems.length || drift.length) throw new Error(`state-owners sortKey check failed (error code pending ruling; run tools/gen-sort-keys.mjs): ${[...problems, ...drift].join('; ')}`);
  }

  // readShapes（§2.7"读入口返回形状登记"第 3 点）：不合即该文件加载失败，同其他字段的整体校验。
  if (opt('readShapes', Array.isArray, 'list of {entry, field, type, refFamily, nullable}')) {
    const seen = new Set();
    d.readShapes.forEach((r, i) => {
      const at = `#/readShapes/${i}`;
      const bad = (got, want) => err(E.E_DIM_STRUCT_FIELD, isObj(r) && typeof r.entry === 'string' ? r.entry : String(i), at, got, want);
      if (!exactKeys(r, SHAPE_FIELDS)) return bad(isObj(r) ? sorted(Object.keys(r)).join(',') : typeof r, SHAPE_FIELDS.join(', '));
      if (!entries.has(r.entry)) bad(r.entry, 'entry registered as a system view, predicate or entryCallerFiles key');
      if (typeof r.field !== 'string' || !FIELD_RE.test(r.field)) bad(r.field, 'field code (nested fields joined by .)');
      const k = JSON.stringify([r.entry, r.field]);
      if (seen.has(k)) bad(`${r.entry} ${r.field}`, 'one row per entry and field');
      seen.add(k);
      if (!SHAPE_TYPES.has(r.type)) bad(r.type, [...SHAPE_TYPES].join(' | '));
      else if (r.type === 'code' ? !(ctx.kinds && ctx.kinds.has(r.refFamily))
        : r.type === 'handle' ? !(ctx.families && ctx.families.has(r.refFamily))
          : r.type === 'shape' ? !(typeof r.refFamily === 'string' && r.refFamily.startsWith('struct:'))
            : r.refFamily !== null) bad(r.refFamily, `refFamily matching type ${r.type}`);
      if (typeof r.nullable !== 'boolean') bad(r.nullable, 'boolean');
    });
  }

  // 账本账户路径：pathTypes 模式里，覆盖它的最具体写者模式的改写写者是账本写者者。
  const ledgerPaths = sorted(Object.keys(pathTypes).filter((p) => {
    const best = [...writers.values()].filter((w) => patternCovers(w.pattern, p)).sort((a, b) => compareSpecificity(b.pattern, a.pattern))[0];
    return best !== undefined && best.rewrite === LEDGER_WRITER;
  }));
  // P 成员名撞名（E-PATH-NAME-CLASH）由 2-1 的派生规则 buildP 判，这里只把它的拒收转成报错行。
  if (grammarOk) {
    try { buildP({ pathTypes, textPaths }, { ledgerPaths }); } catch (e) {
      if (!(e instanceof HandleError)) throw e;
      err(errorCodeOf(e.code), '', '#/pathTypes', '', e.message);
    }
  }

  errors.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const nErr = errors.filter((e) => e.severity === 'error').length;
  const text = errors.map((e) => `${e.code}  ${e.table}/${e.row}.${e.dim}  got ${JSON.stringify(e.got)}  want ${e.want}  — ${e.path}`).join('\n') + (errors.length ? '\n' : '');
  return {
    ok: nErr === 0,
    errors,
    text,
    merged: { writers: sorted(writers.keys()).map((k) => writers.get(k)), pathTypes, textPaths, ledgerPaths, displayPaths: sorted(displayPaths), hooks },
  };
}

// 写者两种写法（§2.7"建行写者与改写写者"）。返回规整后的 {create, rewrite, rewriteRows, viaRelocate}，形状不合返回 null。
function parseWriter(w, bad) {
  if (typeof w === 'string' && w !== '') return { create: [], rewrite: w, rewriteRows: 'all', viaRelocate: false };
  if (!isObj(w)) { bad(E.E_DIM_STRUCT_FIELD, w, 'writer file or {create, rewrite, rewriteRows?, viaRelocate}'); return null; }
  let ok = true;
  for (const f of sorted(Object.keys(w))) if (!WRITER_FIELDS.has(f)) { bad(E.E_DIM_STRUCT_FIELD, f, `one of ${[...WRITER_FIELDS].join(', ')}`); ok = false; }
  if (!(Array.isArray(w.create) && (w.create.length === 0 || isStrList(w.create)))) { bad(E.E_DIM_STRUCT_FIELD, w.create, 'create: list of files'); ok = false; }
  else if (new Set(w.create).size !== w.create.length) bad(E.E_WRITER_DUPLICATE, w.create, 'create files distinct');
  if (!(w.rewrite === null || (typeof w.rewrite === 'string' && w.rewrite !== ''))) { bad(E.E_DIM_STRUCT_FIELD, w.rewrite, 'rewrite: file or null'); ok = false; }
  // viaRelocate 每个写者对象必写（§2.7；含义与登记不合的码见 §2.6"行改挂"第 7 点）。
  if (typeof w.viaRelocate !== 'boolean') { bad(E.E_RELOC_FIELDS, w.viaRelocate, 'viaRelocate: boolean on every writer object'); ok = false; }
  const rows = w.rewriteRows;
  const rowsOk = rows === 'all' || (isObj(rows) && sorted(Object.keys(rows)).join(',') === 'inside,withComponent'
    && [rows.inside, rows.withComponent].every((l) => Array.isArray(l) && (l.length === 0 || isStrList(l))) && rows.inside.length + rows.withComponent.length > 0);
  if (typeof w.rewrite === 'string') {
    if (rows === undefined) {
      // 某文件既在 create 又是 rewrite 而没有写 rewriteRows：E-WRITER-DUPLICATE（§2.7 计数口径）；否则只是漏写必写字段。
      if (Array.isArray(w.create) && w.create.includes(w.rewrite)) bad(E.E_WRITER_DUPLICATE, w.rewrite, 'file both create and rewrite needs rewriteRows');
      else bad(E.E_DIM_STRUCT_FIELD, rows, 'rewriteRows required when rewrite is a file');
      ok = false;
    } else if (!rowsOk) { bad(E.E_DIM_STRUCT_FIELD, rows, 'rewriteRows: "all" or {withComponent, inside} with at least one non-empty list'); ok = false; }
  } else if (w.rewrite === null && rows !== undefined) { bad(E.E_DIM_STRUCT_FIELD, rows, 'no rewriteRows when rewrite is null'); ok = false; }
  if (w.viaRelocate === true && (typeof w.rewrite !== 'string' || rows === undefined || rows === 'all')) bad(E.E_RELOC_FIELDS, w.viaRelocate, 'viaRelocate needs rewrite and a component rewriteRows (not "all")');
  if (!ok) return null;
  return { create: [...w.create], rewrite: w.rewrite, rewriteRows: rows === undefined ? null : rows, viaRelocate: w.viaRelocate };
}
