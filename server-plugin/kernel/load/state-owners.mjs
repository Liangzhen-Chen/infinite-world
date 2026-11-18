// 声明表合并器（卷二 §2.7 系统声明表 `state-owners.json`；卷一 §6.3 G-2"声明表合并器"；卷十二 §2.11 `dim-validate` 设施）。
// 读已解析的 state-owners.json：把 stateKeys.<键>.writers 的相对模式转成绝对模式（§2.7"writers 键与 pathTypes 键的写法"），
// 与 textWriters 合成一份写者登记，连同 pathTypes、textPaths、systems、readShapes 按卷二 §2.7 与 §4.3 核对；
// 推进钩子的 sortKey 按卷十一 R11-3.14 算法重算并与文件比对（算法 assignSortKeys 由 tools/gen-sort-keys.mjs 共用，不写两份）。
// 只按登记数据判，不认任何具体顶层键、系统、文件或路径。报码一律取 E 句柄的生成函数 buildE（kernel/handles/generated.mjs）。

import { buildE, buildP } from '../handles/generated.mjs';
import { checkPathPattern } from '../handles/keys.mjs';
import { errorCodeOf, HandleError, CODE_RE } from '../handles/vocab-handle.mjs';

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

// 实体类登记（卷二 §2.1 入口清单的 22 类，一类一张实体表）：keyKinds 里 (a)(b) 项的 kind 只能取这些，或加载器已载入的表的 kind（ctx.kinds）。
export const ENTITY_KINDS = Object.freeze(['item', 'material', 'species', 'plant', 'body_plan', 'person', 'place', 'facility_type', 'recipe', 'org', 'office', 'polity', 'law_code', 'deity', 'faith', 'culture', 'profession', 'skill', 'knowledge', 'offense', 'status', 'event_type']);
// keyKinds 的 (c) 项：封闭的非实体键类型代号（李白 11-17 pathTypes `*` 段 kind 字段裁定）。event = EventId（卷二 :197 事件无 kind）；
// dimKey = 维度键（如 created.*.props.* 的第二段）；identityKey = 身份键键号（卷四 :927，全世界唯一整数、对规则不透明，非实体 kind；李白 11-17）。
// handle = 运行时句柄（李白 11-18 03:22 裁定②：如 due.* 的段是 cancel 用的句柄，运行时生成、不是固定词表；词表代号段仍走命名 struct，02:55）。
// (b) 列表可混列实体 kind 与 (c) 代号，表示并集。再加新代号须登记进卷二并报李白，各卷不得自造。
export const KEY_DIMKEY = 'dimKey';
export const KEY_HANDLE = 'handle';
export const KEY_NONENTITY = Object.freeze(['event', KEY_DIMKEY, 'identityKey', KEY_HANDLE]);

// 运行时句柄段的文法（keyKinds (c) 项 handle 的格式核对；李白 11-18 03:22 裁定②"按句柄文法核格式"）：
// 由生成它的内核文件把若干个代号（每个合 2-1 句柄代号文法 CODE_RE，kernel/handles/vocab-handle.mjs，不另写）以 HANDLE_JOIN 相连；
// HANDLE_JOIN 不在代号字符集里，所以拆回各段无歧义；不含 `.`，所以整串是一个路径段。
export const HANDLE_JOIN = '-';

/** 运行时句柄：非空串，按 HANDLE_JOIN 拆开的每段都合 CODE_RE。 @param {unknown} s @returns {boolean} */
export function isRuntimeHandle(s) {
  return typeof s === 'string' && s.split(HANDLE_JOIN).every((p) => CODE_RE.test(p));
}

/**
 * 由若干代号拼运行时句柄（生成句柄的内核文件用，如 kernel/scheduler.mjs 的到期项句柄）；任一段不合 CODE_RE 即 E-DIM-ID-FORMAT。
 * @param {string[]} parts
 * @returns {string}
 */
export function runtimeHandle(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new HandleError('E-DIM-ID-FORMAT', 'runtime handle: want a non-empty list of codes');
  for (const p of parts) if (typeof p !== 'string' || !CODE_RE.test(p)) throw new HandleError('E-DIM-ID-FORMAT', `runtime handle part ${JSON.stringify(p)}: want ^[a-z][a-z0-9_]{1,47}$`);
  return parts.join(HANDLE_JOIN);
}
// 去留表覆盖核对豁免的协议键顶层段（卷二 §2.6 :519"账户、holdings、statuses、modifiers、terminated、到期堆"；到期堆的键 `due` 见卷二十 :445）。账户由账本写者判（ledgerPaths）。
const PROTOCOL_KEYS = new Set(['holdings', 'statuses', 'modifiers', 'terminated', 'due']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s !== '');
const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const segs = (p) => p.split('.');
const exactKeys = (o, list) => isObj(o) && sorted(Object.keys(o)).join(',') === sorted(list).join(',');

// ---------- 路径模式匹配语义（§2.7 SA-P5；pathTypes、textPaths、textWriters、stateKeys.writers 共用） ----------

/** 两条模式是否存在共同可匹配的具体路径（`*` 恰匹配一段）。 @param {string} a @param {string} b @returns {boolean} */
export function patternsOverlap(a, b) {
  const x = segs(a), y = segs(b);
  return x.length === y.length && x.every((s, i) => s === '*' || y[i] === '*' || s === y[i]);
}

/** 模式 a 是否覆盖 b 的全部具体路径（a 的每段是 `*` 或与 b 同段）。 @param {string} a @param {string} b @returns {boolean} */
export function patternCovers(a, b) {
  const x = segs(a), y = segs(b);
  return x.length === y.length && x.every((s, i) => s === '*' || s === y[i]);
}

/**
 * 具体程度比较：字面段数多者更具体；字面段数相同则 `*` 更靠后者更具体（逐个比较 `*` 的位置）。
 * 返回正数表示 a 更具体，0 表示同等具体。
 * @param {string} a @param {string} b @returns {number}
 */
export function compareSpecificity(a, b) {
  const x = segs(a), y = segs(b);
  const lit = (s) => s.filter((t) => t !== '*').length;
  if (lit(x) !== lit(y)) return lit(x) - lit(y);
  const sx = x.flatMap((t, i) => (t === '*' ? [i] : [])), sy = y.flatMap((t, i) => (t === '*' ? [i] : []));
  for (let i = 0; i < Math.min(sx.length, sy.length); i++) if (sx[i] !== sy[i]) return sx[i] - sy[i];
  return sx.length - sy.length;
}

/** 一组模式里具体程度相同且重叠的对（E-PATH-OVERLAP）。 @param {string[]} patterns @returns {string[][]} */
export function overlapPairs(patterns) {
  const out = [];
  for (let i = 0; i < patterns.length; i++) for (let j = i + 1; j < patterns.length; j++) {
    if (compareSpecificity(patterns[i], patterns[j]) === 0 && patternsOverlap(patterns[i], patterns[j])) out.push([patterns[i], patterns[j]]);
  }
  return out;
}

// ---------- 推进钩子排序键（卷十一 R11-3.14 算法） ----------

/**
 * 按 R11-3.14 分配 sortKey：每个推进相位内，对全部钩子按机读 `after` 列表做拓扑排序（Kahn），就绪队列按钩子代号升序，
 * 每次从当前无未编号前驱的钩子里取代号最小的一个编号（从 1 起连续），再更新就绪队列。
 * after 指向不在同一相位的钩子（别的相位按悬空处理，李白 11-17 裁定②）、指向不存在的钩子、成环、或两个系统登记同名钩子时记入 problems（不编号以外的处置交调用方）；
 * 其中同名登记另记入 duplicates，其余（成环、悬空、跨相位）是 E-PHASE-SORTKEY-ORDER 的范围。
 * @param {Record<string, any>} systems state-owners.json 的 systems
 * @returns {{keys: Map<string, number>, problems: string[], duplicates: string[]}} keys：钩子代号 → sortKey
 */
export function assignSortKeys(systems) {
  const hooks = new Map();
  const problems = [];
  const duplicates = []; // problems 的子集：同名钩子登记在两个系统（不属 E-PHASE-SORTKEY-ORDER）
  for (const sys of sorted(Object.keys(isObj(systems) ? systems : {}))) {
    const ph = isObj(systems[sys]) ? systems[sys].phase : undefined;
    if (!isObj(ph)) continue;
    for (const name of sorted(Object.keys(ph))) {
      const h = isObj(ph[name]) ? ph[name] : {};
      if (hooks.has(name)) { const m = `hook ${name} registered by both ${hooks.get(name).system} and ${sys}`; problems.push(m); duplicates.push(m); continue; }
      hooks.set(name, { system: sys, phase: h.phase, after: Array.isArray(h.after) ? h.after : [] });
    }
  }
  // 有效前驱：after 里同相位的已登记钩子（别的相位或不存在的记 problems 并忽略）。
  const preds = new Map();
  for (const [name, h] of hooks) {
    const ok = new Set();
    for (const a of h.after) {
      const t = hooks.get(a);
      if (!t || t.phase !== h.phase) { problems.push(`${name}.after names ${JSON.stringify(a)}, not a hook of phase ${h.phase}`); continue; }
      ok.add(a);
    }
    preds.set(name, ok);
  }
  const keys = new Map();
  const phases = sorted(new Set([...hooks.values()].map((h) => String(h.phase))));
  for (const phase of phases) {
    // Kahn：就绪队列（当前无未编号前驱的钩子）每次取代号最小者编号，再更新就绪队列。
    const left = new Set([...hooks.keys()].filter((n) => String(hooks.get(n).phase) === phase));
    let n = 0;
    while (left.size) {
      const ready = sorted([...left].filter((x) => [...preds.get(x)].every((p) => !left.has(p))));
      if (!ready.length) {
        const trail = [sorted(left)[0]];
        for (;;) {
          const next = sorted([...preds.get(trail[trail.length - 1])].filter((p) => left.has(p)))[0];
          const at = trail.indexOf(next);
          if (at >= 0) { problems.push(`after cycle: ${[...trail.slice(at), next].join(' -> ')}`); break; }
          trail.push(next);
        }
        break;
      }
      keys.set(ready[0], ++n);
      left.delete(ready[0]);
    }
  }
  return { keys, problems: sorted(new Set(problems)), duplicates: sorted(new Set(duplicates)) };
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
// ---------- keyKinds 文法（卷二 §2.7"pathTypes 的 `*` 段 kind 字段"，封卷后勘误 1117rx7） ----------

// 返回问题列表 [{got, want}]。v：该模式的 keyKinds 值；nStars：模式里 `*` 段数；kinds：已登记实体类 Set。
function keyKindsIssues(v, nStars, kinds) {
  if (nStars === 0) return [{ got: v, want: 'no keyKinds on a pattern without * segments' }];
  if (!Array.isArray(v)) return [{ got: v, want: 'list with one item per * segment' }];
  if (v.length !== nStars) return [{ got: v.length, want: `${nStars} items (one per * segment)` }];
  const out = [];
  v.forEach((it, i) => {
    const at = `item ${i}`;
    if (typeof it === 'string') {
      if (!KEY_NONENTITY.includes(it) && !kinds.has(it)) out.push({ got: it, want: `${at}: a registered entity kind or one of ${KEY_NONENTITY.join(', ')}` });
    } else if (Array.isArray(it)) {
      if (it.length === 0) out.push({ got: it, want: `${at}: non-empty list of entity kinds` });
      if (new Set(it).size !== it.length) out.push({ got: it, want: `${at}: no duplicate kinds` });
      for (const k of it) if (typeof k !== 'string' || !(kinds.has(k) || KEY_NONENTITY.includes(k))) out.push({ got: k, want: `${at}: each member a registered entity kind or one of ${KEY_NONENTITY.join(', ')} (union; no wildcard)` });
    } else out.push({ got: it, want: `${at}: entity kind, list of entity kinds, or one of ${KEY_NONENTITY.join(', ')}` });
  });
  return out;
}
// 一项里的全部实体 kind（(a) 单个、(b) 列表；(c) 不算）。
const itemKinds = (it) => (typeof it === 'string' ? (KEY_NONENTITY.includes(it) ? [] : [it]) : Array.isArray(it) ? it.filter((k) => typeof k === 'string') : []);

const mentionsSealed = (t) => typeof t === 'string' && /(^|<)sealed(>|$)/.test(t);

// ---------- 合并与核对 ----------

/**
 * 合并并核对 state-owners.json。
 * @param {any} decl 已解析的 state-owners.json
 * @param {{units?: Map<string, any> | Set<string>, kinds?: Set<string>, families?: Set<string>, entityKinds?: Iterable<string>, terminableKinds?: Iterable<string>}} [ctx]
 *   units：_units.json 的单位；kinds：已载入的实体类（维度表 kind）；families：词表族。readShapes 的 refFamily 按后两者核。
 *   entityKinds：keyKinds 额外认的实体类（默认 ENTITY_KINDS 加 kinds）；terminableKinds：写了 termination 的实体类（去留表覆盖核对用，默认空）。
 * @returns {{ok: boolean, errors: any[], text: string, merged: {writers: any[], pathTypes: Record<string, string>, keyKinds: Record<string, any[]>, textPaths: string[], ledgerPaths: string[], displayPaths: string[], hooks: any[]}}}
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

  // keyKinds：同级顶层表 模式 → 按 `*` 段顺序的 kind 项列表（pathTypes 的值是类型串，无处挂字段）。有 `*` 段的非 textPaths 条目必填；
  // 无 `*` 段的不得填；textPaths 整类不强制（卷二 :497 不生成 P、:519 不进去留覆盖核对；不对任何单条特判）。违者 E-PATH-KEYKINDS。
  const entityKinds = new Set([...ENTITY_KINDS, ...(ctx.kinds || []), ...(ctx.entityKinds || [])]);
  const keyKinds = opt('keyKinds', isObj, 'object pattern → list of key kinds') ? d.keyKinds : {};
  const nStarsOf = (p) => segs(p).filter((s) => s === '*').length;
  for (const p of sorted(Object.keys(keyKinds))) {
    if (!Object.hasOwn(pathTypes, p)) { err(E.E_PATH_UNDECLARED, p, `#/keyKinds/${p}`, p, 'keyKinds pattern declared in pathTypes'); continue; }
    for (const { got, want } of keyKindsIssues(keyKinds[p], nStarsOf(p), entityKinds)) err(E.E_PATH_KEYKINDS, p, `#/keyKinds/${p}`, got, want);
  }
  for (const p of sorted(Object.keys(pathTypes))) {
    if (nStarsOf(p) > 0 && !textSet.has(p) && !Object.hasOwn(keyKinds, p)) err(E.E_PATH_KEYKINDS, p, `#/pathTypes/${p}`, undefined, 'keyKinds entry (one item per * segment) required for a non-textPath pattern with * segments');
  }
  // dimension 路径展开（卷二 §2.7 :804 pathTypes 文法 dimension 行）：string 类型的维度被排除在 dimension 路径之外，展开时遇到即 E-TEXT-UNGATED。
  // 按 keyKinds 找该路径的实体段可取的 kind 与维度名所在段（dimKey）；维度名是字面段时只看这一维。ctx.tableDims：kind → 维度表表头。
  const tableDims = ctx.tableDims instanceof Map ? ctx.tableDims : new Map();
  for (const p of sorted(Object.keys(pathTypes))) {
    if (pathTypes[p] !== 'dimension' || !Array.isArray(keyKinds[p])) continue;
    const kk = keyKinds[p];
    const dimAt = kk.indexOf(KEY_DIMKEY);
    const literalDim = dimAt < 0 ? segs(p)[segs(p).length - 1] : null;
    const kinds = kk.flatMap((it) => (Array.isArray(it) ? it : [it])).filter((k) => entityKinds.has(k) && !KEY_NONENTITY.includes(k));
    for (const k of sorted(new Set(kinds))) {
      const dims = tableDims.get(k);
      if (!isObj(dims)) continue;
      for (const name of sorted(Object.keys(dims))) {
        if ((literalDim === null || literalDim === name) && isObj(dims[name]) && dims[name].type === 'string') err(E.E_TEXT_UNGATED, p, `#/pathTypes/${p}`, `${k}.${name}`, 'string dimensions are excluded from dimension paths');
      }
    }
  }

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
  // 同名钩子登记在两个及以上系统（李白 11-17 同名钩子裁定）：E-PHASE-HOOK-DUPLICATE，列钩子名与全部登记系统；整类适用。
  const hookSystems = new Map();
  for (const h of hooks) hookSystems.set(h.hook, [...(hookSystems.get(h.hook) || []), h.system]);
  for (const [hook, syss] of hookSystems) {
    if (syss.length > 1) { err(E.E_PHASE_HOOK_DUPLICATE, hook, `#/systems/${sorted(syss)[0]}/phase/${hook}`, sorted(syss).join(', '), 'a hook name registered by exactly one system'); hooksOk = false; }
  }
  // 同阶段同键（§2.7 :766；"键"即 sortKey）。同名钩子又同键时，E-PHASE-HOOK-DUPLICATE 与本码两码都会报（不去重）。
  const seenKey = new Map();
  for (const h of hooks) {
    const k = JSON.stringify([h.phase, h.sortKey]);
    if (seenKey.has(k)) { err(E.E_PHASE_DUPLICATE, h.hook, `#/systems/${h.system}/phase/${h.hook}`, `${h.phase} ${h.sortKey}`, `distinct sortKey within phase (also ${seenKey.get(k)})`); hooksOk = false; }
    else seenKey.set(k, h.hook);
  }
  // sortKey 重算比对（卷十一 R11-3.14；块 2 体检 K2-24）：只在钩子格式无误、无同阶段同键（已报 E-PHASE-DUPLICATE）时做。
  // 李白 11-17 块 2-2 裁定 ①②：after 成环、指向不存在的钩子、指向别的相位的钩子（按悬空处理）→ E-PHASE-SORTKEY-ORDER；
  // 文件 sortKey 与重算不一致 → E-PHASE-SORTKEY-DRIFT。两码都直接报错、不静默修正（修正由离线生成器 tools/gen-sort-keys.mjs 做）。
  // 有 ORDER 问题时重算键不完整，不再报 DRIFT。
  if (hooksOk && hooks.length) {
    // 同名钩子已在上面报 E-PHASE-HOOK-DUPLICATE 且 hooksOk 为假，走不到这里；assignSortKeys 的 duplicates 只供离线生成器用。
    const { keys, problems } = assignSortKeys(systems);
    const order = problems;
    for (const m of order) err(E.E_PHASE_SORTKEY_ORDER, '', '#/systems', m, 'after names only existing hooks of the same phase, acyclic');
    if (!problems.length) {
      for (const h of hooks) {
        if (keys.get(h.hook) !== h.sortKey) err(E.E_PHASE_SORTKEY_DRIFT, h.hook, `#/systems/${h.system}/phase/${h.hook}/sortKey`, h.sortKey, `${keys.get(h.hook)} (recomputed by R11-3.14; run tools/gen-sort-keys.mjs)`);
      }
    }
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
  // 去留表覆盖核对（卷二 §2.6 :516 第 ④ 点、:519）：模式里某 `*` 段的 keyKinds 项（(a) 单个 kind 或 (b) 列表里任一 kind）属于可终止实体类
  // （ctx.terminableKinds：实体表类别行写了 termination 的类）就是主体段；(c) 项永不算主体。含主体段的模式必须被某条 subjectRecords 覆盖，
  // 或属协议键（账户即 ledgerPaths、PROTOCOL_KEYS）与 textPaths，否则 E-TERM-RECORD-UNLISTED。keyKinds 本身有错的模式不再报（先报 E-PATH-KEYKINDS）。
  const terminable = new Set(ctx.terminableKinds || []);
  const subjectPatterns = [];
  for (const key of sorted(Object.keys(stateKeys))) {
    const sr = isObj(stateKeys[key]) ? stateKeys[key].subjectRecords : undefined;
    if (isObj(sr)) for (const rel of Object.keys(sr)) subjectPatterns.push(`${key}.${rel}`);
  }
  for (const p of sorted(Object.keys(pathTypes))) {
    if (textSet.has(p) || ledgerPaths.includes(p) || PROTOCOL_KEYS.has(segs(p)[0])) continue;
    const kk = keyKinds[p];
    if (!Array.isArray(kk) || keyKindsIssues(kk, nStarsOf(p), entityKinds).length) continue;
    const subjects = kk.filter((it) => itemKinds(it).some((k) => terminable.has(k)));
    if (subjects.length && !subjectPatterns.some((sp) => patternCovers(sp, p))) err(E.E_TERM_RECORD_UNLISTED, p, `#/pathTypes/${p}`, p, 'pattern with a terminable-entity * segment covered by a stateKeys.<key>.subjectRecords entry, or a protocol key / textPath');
  }
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
    merged: { writers: sorted(writers.keys()).map((k) => writers.get(k)), pathTypes, keyKinds, textPaths, ledgerPaths, displayPaths: sorted(displayPaths), hooks },
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
