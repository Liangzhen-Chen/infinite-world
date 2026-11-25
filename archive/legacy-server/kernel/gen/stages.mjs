// 世界生成流程是数据（卷十 R10-1.1 :368、§2.1 gstage 族 :113、§2.7 :236–:237）：阶段全序由 `gstage` 族条目的 phase、after、before 合成的先后图定，
// 代码里没有阶段清单与次序（A10-1.1）；生成器按条目的 `generator` 节点名从调用方给的登记表取，条目里的名字查不到即 E-GEN-STAGE-UNKNOWN。
// 全序 = 先 worldgen 相，再 opening 相，再 expand 相；相内取拓扑序，同层按代号升序；成环或 after/before 跨相即 E-GEN-STAGE-CYCLE（相的先后只由 phase 定）。
// 纯函数，只读词表，不读 state（卷十 §3.1 genPlan）。

import { KernelError } from '../errors.mjs';

const FAMILY = 'gstage';
// 代码内封闭枚举 gen_phase、gen_scope（卷十 §2.1 :124–:125；扩展须改卷十）。相的先后次序即 PHASES 的排列。
const PHASES = Object.freeze(['worldgen', 'opening', 'expand']);
const SCOPES = Object.freeze(['world', 'region', 'unit', 'site', 'tract']);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** 词表里全部阶段条目，按代号升序。@param {{families: Map<string, {entries: Record<string, any>}>}} vocab @returns {Array<[string, any]>} */
export function stageEntries(vocab) {
  const fam = vocab && vocab.families && typeof vocab.families.get === 'function' ? vocab.families.get(FAMILY) : undefined;
  const entries = fam && isObj(fam.entries) ? fam.entries : {};
  return Object.keys(entries).sort(cmp).map((id) => [id, entries[id]]);
}

/**
 * 加载期核对（卷十 §2.1 gstage 行：字段齐全、引用闭合、writesFamilies 必写；§2.7 E-GEN-STAGE-UNKNOWN、E-GEN-STAGE-CYCLE）。
 * @param {any} vocab 加载期词表 @param {Iterable<string>} generatorNames 生成器登记表里的节点名
 * @returns {string[]} 错误行 "<码> <条目> <说明>"，空表即通过
 */
export function checkGenStages(vocab, generatorNames) {
  const errors = [];
  const entries = stageEntries(vocab);
  const known = new Map(entries);
  const generators = new Set(generatorNames);
  const bad = (code, id, why) => errors.push(`${code} gstage/${id} ${why}`);
  for (const [id, e] of entries) {
    if (!isObj(e)) { bad('E-GEN-STAGE-UNKNOWN', id, 'entry is not an object'); continue; }
    if (!PHASES.includes(e.phase)) bad('E-GEN-STAGE-UNKNOWN', id, `phase ${JSON.stringify(e.phase)}: want ${PHASES.join('|')}`);
    if (!SCOPES.includes(e.scope)) bad('E-GEN-STAGE-UNKNOWN', id, `scope ${JSON.stringify(e.scope)}: want ${SCOPES.join('|')}`);
    for (const k of ['after', 'before', 'writesKinds', 'writesFamilies']) if (!isStrList(e[k])) bad('E-GEN-STAGE-UNKNOWN', id, `${k} must be a list of codes (writesFamilies is required, empty list when no vocab entry is created)`);
    if (typeof e.generator !== 'string' || !generators.has(e.generator)) bad('E-GEN-STAGE-UNKNOWN', id, `generator ${JSON.stringify(e.generator)} is not in the generator registry`);
    if (e.whenRX !== null && e.whenRX !== undefined && !isObj(e.whenRX)) bad('E-GEN-STAGE-UNKNOWN', id, 'whenRX must be null or an rx object');
    for (const side of ['after', 'before']) {
      for (const other of isStrList(e[side]) ? e[side] : []) {
        const o = known.get(other);
        if (!o) bad('E-GEN-STAGE-UNKNOWN', id, `${side} ${other}: no such stage`);
        else if (isObj(o) && o.phase !== e.phase) bad('E-GEN-STAGE-CYCLE', id, `${side} ${other} crosses phase ${e.phase} -> ${o.phase} (phase order is fixed by phase only)`);
      }
    }
  }
  if (errors.length === 0) {
    const cyc = layersOf(entries.filter(([, e]) => e.phase === PHASES[0]));
    if (cyc.error) errors.push(`E-GEN-STAGE-CYCLE gstage/${cyc.error} after/before edges form a cycle`);
    for (const phase of PHASES.slice(1)) {
      const r = layersOf(entries.filter(([, e]) => e.phase === phase));
      if (r.error) errors.push(`E-GEN-STAGE-CYCLE gstage/${r.error} after/before edges form a cycle`);
    }
  }
  return errors;
}

// 一个相内的拓扑分层：a.after 含 b 与 b.before 含 a 是同一条边 b → a；每层取入度已清零的全部阶段，层内按代号升序。成环时返回 {error: 环上一个代号}。
function layersOf(group) {
  const ids = new Set(group.map(([id]) => id));
  const preds = new Map(group.map(([id]) => [id, new Set()]));
  for (const [id, e] of group) {
    for (const b of e.after) if (ids.has(b)) preds.get(id).add(b);
    for (const b of e.before) if (ids.has(b)) preds.get(b).add(id);
  }
  const placed = new Set();
  const order = [];
  while (placed.size < ids.size) {
    const ready = [...ids].filter((id) => !placed.has(id) && [...preds.get(id)].every((p) => placed.has(p))).sort(cmp);
    if (ready.length === 0) return { order, error: [...ids].filter((id) => !placed.has(id)).sort(cmp)[0] };
    for (const id of ready) { placed.add(id); order.push(id); }
  }
  return { order, error: null };
}

/**
 * 阶段全序（卷十 §3.1 `genPlan`）：[{stage, phase, scope}]，先 worldgen、再 opening、再 expand，相内取拓扑序、同层代号升序。
 * 条目不合或成环即抛 KernelError（E-GEN-STAGE-UNKNOWN、E-GEN-STAGE-CYCLE，码取检查结果的第一条）。
 * @param {any} vocab @param {Iterable<string>} generatorNames
 * @returns {Array<{stage: string, phase: string, scope: string}>}
 */
export function genPlan(vocab, generatorNames) {
  const errors = checkGenStages(vocab, generatorNames);
  if (errors.length > 0) {
    const cut = errors[0].indexOf(' ');
    throw new KernelError(errors[0].slice(0, cut), {}, errors[0].slice(cut + 1));
  }
  const entries = new Map(stageEntries(vocab));
  const plan = [];
  for (const phase of PHASES) {
    const group = [...entries].filter(([, e]) => e.phase === phase);
    for (const id of layersOf(group).order) plan.push({ stage: id, phase, scope: entries.get(id).scope });
  }
  return plan;
}
