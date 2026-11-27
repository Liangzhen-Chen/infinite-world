// 动作目录（卷九 §2.2 行格式、R9-1.1 目录是数据、R9-1.2 可做之事投影；S1-3a，S1-3 接口草案 §2）。
// loadActions：加载期把 world/actions/*.json 的动作行与 _effects.json 的效果族编成冻结目录（RX 编译、引用闭合、本阶段子集核对），不合即抛，不静默忽略。
// candidatesOf：槽位候选（R9-1.2：菜单投影与 resolve 的 shape 段是同一个函数）。menuOf：菜单投影。nsReadsFor：动作侧 RX 命名空间读数的唯一来源。
// 槽位种类、效果输出种类各一张处理表（加一种只添一项）；只认行字段与登记数据，不认任何动作、效果族、筛选、槽位或出身代号。

import { KernelError } from '../../kernel/errors.mjs';
import { evaluateRX } from '../../kernel/rx.mjs';
import { checkValue } from '../../kernel/validate/types.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { handlesOp } from '../../kernel/transaction.mjs';
import { ruleValue } from '../load/registry.mjs';
import { openPlacesOf } from '../gen/worldgen-writeback.mjs';
import { speciesOf } from '../body/person.mjs';

// 卷九 §2.2 动作行全部字段 → S1 处置：use 本阶段实现；empty 本阶段未实现，行上必须写空（null、[] 或 {}），非空即 E-ACT-ROW（草案 §1 第 20 行）。
const ROW_FIELDS = Object.freeze({
  class: 'use', slots: 'use', whenRX: 'use', intimate: 'use', resumable: 'use', baseMinutes: 'use', effects: 'use', menu: 'use', basis: 'use',
  capability: 'empty', requirement: 'empty', consent: 'empty', answer: 'empty', workFromEdge: 'empty', stages: 'empty', check: 'empty',
  backlash: 'empty', costRows: 'empty', skillGain: 'empty', decision: 'empty', shapeFrom: 'empty', sourceStrength: 'empty',
});
const EMPTY = 'empty';
// 卷九 §2.1 代码内封闭枚举 degree 五档；check 为空时成功度恒为 success（R9-3.7），其余四档行上显式 null（卷九 :196）。
const DEGREES = Object.freeze(['critical_failure', 'failure', 'partial', 'success', 'critical_success']);
const NO_CHECK_DEGREE = 'success';
// code 槽四种指向（卷九 §2.2 slots 行）；本阶段只实现 tableRow，其余加载即 E-ACT-ROW。
const CODE_TARGETS = Object.freeze(['entityKind', 'vocab', 'recordKind', 'tableRow']);
const TABLE_ROW = 'tableRow';
// 词表族名（卷九 §2.1；卷四 §2.4 origin 族）。
const FAM = Object.freeze({ actClass: 'act_class', menuGroup: 'menu_group', filter: 'target_filter', origin: 'origin' });
// 出身维度（卷四 §2.3 :226 person.origin）与出身条目的开关字段（设计册 14 §4.7；条目字段见 _vocab.json origin 族 basis）。
const ORIGIN_DIM = 'origin';
const GATE_FIELD = 'gate';
const ITEMS_FIELD = 'startingItems';
// id 型参数的明文来源前缀（卷二 :1530：target 或 ctx.<字段>）。
const ID_TARGET = 'target';
const CTX_PREFIX = 'ctx.';
const PATH_SEP = '.';
// 规则表代号与键（卷九 :324 rules.act.advanceMaxMinutes；设计册 14 §3.6 rules.playerOrigins）。
const ACT_RULES = 'act';
const ADVANCE_MAX = 'advanceMaxMinutes';
const ORIGINS = 'playerOrigins';
// 本模块提供读数的命名空间（登记行在 state-owners.json rxNamespaces；读数含义见那里的 entry 列）。
const NS = Object.freeze({ slot: 'slot', avatarCount: 'player.avatarCount', isAvatar: 'actor.isAvatar', originOpen: 'origin.open', originReady: 'origin.ready' });
const RX_TYPE = Object.freeze({ type: 'rx' });
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isEmpty = (v) => v === null || (Array.isArray(v) && v.length === 0) || (isObj(v) && Object.keys(v).length === 0);
const rowErr = (id, why) => new KernelError('E-ACT-ROW', {}, `action ${id}: ${why}`);
// 求值缺读数（rx.mjs 的缺读数错误带 key）：与别的求值失败区分。
const missingKey = (e) => (e !== null && typeof e === 'object' && typeof e.key === 'string' ? e.key : undefined);

/**
 * 规则表读视图（RX 数据档 rules.<代号>.<键> 写法，卷二 §2.9 勘误 1118k31）：每个登记代号、每个登记键一个惰性取值，取值经 ruleValue 按登记声明核。
 * @param docData 世界数据副本 @returns {Record<string, Record<string, unknown>>}
 */
function rulesView(docData) {
  const view = {};
  for (const row of docData.registryRows) {
    const table = {};
    for (const k of Object.keys(isObj(row.type) ? row.type : {})) Object.defineProperty(table, k, { enumerable: true, get: () => ruleValue(docData, row.code, k) });
    Object.defineProperty(view, row.code, { enumerable: true, get: () => table });
  }
  return view;
}

/**
 * 槽位种类处理表（卷二 §1.9 slot_kind；本阶段 code、number 两种，text 未实现即不在表内，加载即拒）。每种三件事：
 * load 加载期核槽位声明并编成冻结槽位；offer 菜单投影给出该槽的候选或取值范围；pick 把意图里的值收窄成槽位值（不合即 E-ACT-SLOT）。
 * 意图里 code 槽的值放 slots、number 槽的值放 numbers（草案 §2.2 wire 形状），由 intentKey 指名。
 */
const SLOT_KINDS = Object.freeze({
  code: Object.freeze({
    intentKey: 'slots',
    load(ctx, s, at) {
      const targets = CODE_TARGETS.filter((t) => s[t] !== undefined && s[t] !== null);
      if (targets.length !== 1) throw new KernelError('E-ACT-ROW', {}, `${at}: exactly one of ${CODE_TARGETS.join(', ')}`);
      if (targets[0] !== TABLE_ROW) throw new KernelError('E-ACT-ROW', {}, `${at}: ${targets[0]} slots not implemented in this stage`);
      const table = s[TABLE_ROW];
      if (!ctx.registry.tables.has(table)) throw new KernelError('E-ACT-ROW', {}, `${at}: table ${JSON.stringify(table)} not registered`);
      const filters = s.filter === undefined ? [] : s.filter;
      if (!Array.isArray(filters)) throw new KernelError('E-ACT-ROW', {}, `${at}: filter must be a list`);
      return { table, filters: Object.freeze(filters.map((f) => ctx.filterTree(f, table, at))) };
    },
    offer(engine, state, row, slot, actor) {
      return { candidates: candidatesOf(engine, state, row.id, slot.name, actor) };
    },
    pick(engine, state, row, slot, v, actor) {
      const ids = candidatesOf(engine, state, row.id, slot.name, actor);
      if (!Number.isInteger(v) || v < 0 || v >= ids.length) throw new KernelError('E-ACT-SLOT', {}, `${row.id}: slot ${slot.name} candidate index out of range`);
      return ids[v];
    },
  }),
  number: Object.freeze({
    intentKey: 'numbers',
    load(ctx, s, at) {
      if (CODE_TARGETS.some((t) => s[t] !== undefined && s[t] !== null) || Object.hasOwn(s, 'filter')) throw new KernelError('E-ACT-ROW', {}, `${at}: number slot takes no code target or filter`);
      const min = ctx.boundOf(s.min, `${at} min`);
      const max = ctx.boundOf(s.max, `${at} max`);
      if (min > max || typeof s.unit !== 'string') throw new KernelError('E-ACT-ROW', {}, `${at}: needs min <= max and a unit`);
      return { min, max, unit: s.unit };
    },
    offer(engine, state, row, slot) {
      return { range: Object.freeze({ min: slot.min, max: slot.max, unit: slot.unit }) };
    },
    pick(engine, state, row, slot, v) {
      if (!Number.isInteger(v) || v < slot.min || v > slot.max) throw new KernelError('E-ACT-SLOT', {}, `${row.id}: slot ${slot.name} must be an integer in [${slot.min}, ${slot.max}]`);
      return v;
    },
  }),
});

/**
 * 效果族输出种类处理表（卷二 §3.9 outputs.kind）：本阶段只实现 primitive（草案 Q6：其余加载即 E-ACT-ROW）。
 * load 核 op 在原语目录、参数名是该原语的参数、idParams 只收两种明文来源，并编译 paramsRX。
 */
const OUTPUT_KINDS = Object.freeze({
  primitive: Object.freeze({
    load(ctx, out, at) {
      const prim = ctx.primitives.get(out.op);
      if (!prim) throw new KernelError('E-EFF-PRIMITIVE', {}, `${at}: op ${JSON.stringify(out.op)} not in primitives catalog`);
      const names = new Set([...Object.keys(prim.required || {}), ...Object.keys(prim.optional || {}),
        ...(prim.unless || []).flatMap((u) => [u.field, ...Object.keys(u.required || {})]),
        ...(prim.oneOf || []).flat().flatMap((alt) => Object.keys(alt))]);
      const paramsRX = isObj(out.paramsRX) ? out.paramsRX : {};
      const idParams = isObj(out.idParams) ? out.idParams : {};
      for (const p of [...Object.keys(paramsRX), ...Object.keys(idParams)]) {
        if (!names.has(p.split(PATH_SEP)[0])) throw new KernelError('E-EFF-PARAM', {}, `${at}: ${p} is not a parameter of ${out.op}`);
      }
      for (const [p, src] of Object.entries(idParams)) {
        if (src !== ID_TARGET && !(typeof src === 'string' && src.startsWith(CTX_PREFIX))) throw new KernelError('E-EFF-PARAM', {}, `${at}: idParams.${p} must be ${ID_TARGET} or ${CTX_PREFIX}<field>`);
      }
      const trees = Object.fromEntries(Object.entries(paramsRX).map(([p, text]) => [p, ctx.compile(text, new Map(), 'E-EFF-RX', `${at} paramsRX.${p}`)]));
      return Object.freeze({ kind: out.kind, op: out.op, paramsRX: Object.freeze(trees), idParams: Object.freeze({ ...idParams }) });
    },
  }),
});

/**
 * 动作目录加载（卷九 §2.2 校验句；草案 §2、§6 第 12 条）。
 * @param world 装配期已有的登记 registry、世界数据副本 docData、词表 vocab 与原语目录 primitives（Map）
 */
export function loadActions(world) {
  const { registry, docData, vocab, primitives } = world;
  const families = isObj(vocab) && isObj(vocab.families) ? vocab.families : {};
  const vocabIndex = new Map();
  for (const [family, rec] of Object.entries(families)) {
    for (const code of Object.keys(isObj(rec.entries) ? rec.entries : {})) vocabIndex.set(code, { family, prefix: rec.prefix });
  }
  const entriesOf = (fam) => (isObj(families[fam]) && isObj(families[fam].entries) ? families[fam].entries : {});
  const ns = Array.isArray(docData.owners && docData.owners.rxNamespaces) ? docData.owners.rxNamespaces : [];
  const rules = rulesView(docData);
  const maxDepth = Number(ruleValue(docData, 'kernelConstants', 'rxMaxDepth'));
  // RX 编译走公共部件 checkValue 的 rx 类型（加载期编译的唯一入口，kernel/rx.mjs 文件头）；作用域 rules 供数据档读规则表值。
  const compile = (text, dims, code, where) => {
    const env = { rxScope: { dims, vocabIndex, ns, maxDepth, rules }, compiled: new Map() };
    const bad = [];
    checkValue(RX_TYPE, text, env, { path: where }, (e) => { bad.push(e); });
    if (bad.length > 0) throw new KernelError(code, {}, `${where}: ${bad[0].want}`);
    return env.compiled.get(where).tree;
  };
  const dimsOf = (kind) => {
    const doc = registry.tables.get(kind);
    return new Map(Object.entries(doc && isObj(doc.dimensions) ? doc.dimensions : {}));
  };
  const ctx = {
    registry, primitives, compile,
    // 对象筛选（卷九 §2.1 target_filter）：按候选所在表的维度编译，同一筛选用在不同表各编一次。
    filterTree(code, kind, at) {
      const entry = entriesOf(FAM.filter)[code];
      if (!isObj(entry)) throw new KernelError('E-ACT-ROW', {}, `${at}: filter ${JSON.stringify(code)} not in ${FAM.filter}`);
      return Object.freeze({ code, tree: compile(entry.whenRX, dimsOf(kind), 'E-ACT-ROW', `${at} filter ${code}`), dims: dimsOf(kind) });
    },
    // 数值槽上下限：数或 RX（读 rules.<代号>.<键>，加载期求成常数；卷九 :324 的上限经此引用规则表键），须为整数。
    boundOf(v, at) {
      const n = typeof v === 'number' ? v : evaluateRX(compile(v, new Map(), 'E-ACT-ROW', at), {}, {});
      if (!Number.isInteger(n)) throw new KernelError('E-ACT-ROW', {}, `${at}: bound must be an integer`);
      return n;
    },
  };

  // 效果族（卷二 §3.9）：族 id 与 family 字段一致；输出按种类处理表编。
  const effectsDoc = isObj(docData.effectsDoc) ? docData.effectsDoc : {};
  const effectFamilies = new Map();
  for (const [fid, fam] of Object.entries(effectsDoc)) {
    if (!isObj(fam) || fam.family !== fid || !Array.isArray(fam.outputs) || !isObj(fam.params)) throw new KernelError('E-EFF-OUTPUT', {}, `effect family ${fid}: needs family = id, outputs list and params map`);
    const outputs = fam.outputs.map((out, i) => {
      const at = `effect family ${fid} output ${i}`;
      const handler = isObj(out) && Object.hasOwn(OUTPUT_KINDS, out.kind) ? OUTPUT_KINDS[out.kind] : undefined;
      if (!handler) throw new KernelError('E-ACT-ROW', {}, `${at}: output kind ${JSON.stringify(out && out.kind)} not implemented in this stage`);
      return handler.load(ctx, out, at);
    });
    effectFamilies.set(fid, Object.freeze({ id: fid, params: Object.freeze({ ...fam.params }), outputs: Object.freeze(outputs) }));
  }

  const rows = new Map();
  for (const doc of Array.isArray(docData.actionDocs) ? docData.actionDocs : []) {
    for (const [id, row] of Object.entries(isObj(doc) ? doc : {})) {
      if (rows.has(id)) throw rowErr(id, 'appears twice');
      rows.set(id, loadRow(ctx, id, row, entriesOf, effectFamilies));
    }
  }
  // rules.act.advanceMaxMinutes 键须全覆盖 act_class（卷九 :324）。
  const classes = Object.keys(entriesOf(FAM.actClass)).sort();
  const covered = Object.keys(Object(ruleValue(docData, ACT_RULES, ADVANCE_MAX))).sort();
  if (classes.join() !== covered.join()) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.${ACT_RULES}.${ADVANCE_MAX} keys must cover ${FAM.actClass} exactly`);
  const origins = loadOrigins(registry, docData, entriesOf(FAM.origin));
  const groupOrder = (g) => Number(entriesOf(FAM.menuGroup)[g].order);
  const order = [...rows.values()].sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((r) => r.id);
  return Object.freeze({ rows, families: effectFamilies, order: Object.freeze(order), origins });
}

/** 一条动作行（卷九 §2.2 校验句的 S1 子集）。 */
function loadRow(ctx, id, row, entriesOf, effectFamilies) {
  if (!isObj(row)) throw rowErr(id, 'row must be an object');
  for (const k of Object.keys(row)) if (!Object.hasOwn(ROW_FIELDS, k)) throw rowErr(id, `unknown field ${k}`);
  for (const [k, use] of Object.entries(ROW_FIELDS)) {
    if (!Object.hasOwn(row, k)) throw rowErr(id, `missing field ${k}`);
    if (use === EMPTY && !isEmpty(row[k])) throw rowErr(id, `field ${k} must be empty (not implemented in this stage)`);
  }
  if (!Object.hasOwn(entriesOf(FAM.actClass), row.class)) throw rowErr(id, `class ${JSON.stringify(row.class)} not in ${FAM.actClass}`);
  if (!isObj(row.menu) || !Object.hasOwn(entriesOf(FAM.menuGroup), row.menu.group) || !Number.isInteger(row.menu.order)) throw rowErr(id, 'menu needs a registered group and an integer order');
  if (typeof row.intimate !== 'boolean' || typeof row.resumable !== 'boolean') throw rowErr(id, 'intimate and resumable must be booleans');
  // intimate 为真的行 consent 须非空（卷九 §2.2 校验句），consent 本阶段只收空 → 亲密行本阶段加载即拒。
  if (row.intimate) throw rowErr(id, 'intimate rows need consent, not implemented in this stage');
  // 活动记录（R9-1.3）本阶段未建：baseMinutes 只收 0（瞬时，耗时由效果给）。
  if (row.baseMinutes !== 0) throw rowErr(id, 'baseMinutes > 0 needs activities, not implemented in this stage');
  if (!isObj(row.slots)) throw rowErr(id, 'slots must be a map');
  const slots = Object.keys(row.slots).sort().map((name) => {
    const s = row.slots[name];
    const at = `action ${id} slot ${name}`;
    if (!isObj(s) || typeof s.required !== 'boolean' || s.multi !== false) throw rowErr(id, `slot ${name}: needs required boolean and multi false (multi not implemented in this stage)`);
    const handler = Object.hasOwn(SLOT_KINDS, s.kind) ? SLOT_KINDS[s.kind] : undefined;
    if (!handler) throw rowErr(id, `slot ${name}: kind ${JSON.stringify(s.kind)} not implemented in this stage`);
    return Object.freeze({ name, kind: s.kind, required: s.required, ...handler.load(ctx, s, at) });
  });
  const when = row.whenRX === null ? null : ctx.compile(row.whenRX, new Map(), 'E-ACT-ROW', `action ${id} whenRX`);
  if (!isObj(row.effects) || Object.keys(row.effects).length !== DEGREES.length || !DEGREES.every((d) => Object.hasOwn(row.effects, d))) throw rowErr(id, 'effects must cover the five degrees');
  for (const d of DEGREES) {
    const ok = d === NO_CHECK_DEGREE ? Array.isArray(row.effects[d]) : row.effects[d] === null;
    if (!ok) throw rowErr(id, `effects.${d}: without check only ${NO_CHECK_DEGREE} is a list, the rest null`);
  }
  const calls = row.effects[NO_CHECK_DEGREE].map((call) => {
    const fam = isObj(call) ? effectFamilies.get(call.family) : undefined;
    if (!fam) throw new KernelError('E-EFF-FAMILY-UNKNOWN', {}, `action ${id}: effect family ${JSON.stringify(call && call.family)}`);
    if (!isObj(call.params)) throw new KernelError('E-EFF-PARAM', {}, `action ${id}: effectCall.params must be a map`);
    for (const [p, v] of Object.entries(call.params)) {
      const decl = fam.params[p];
      const dom = isObj(decl) && Array.isArray(decl.domain) ? decl.domain : null;
      if (dom === null || typeof v !== 'number' || (dom[0] !== null && v < dom[0]) || (dom[1] !== null && v > dom[1])) throw new KernelError('E-EFF-PARAM', {}, `action ${id}: ${call.family}.${p} not declared or out of domain`);
    }
    // 动作可达的原语都须有处理函数（草案 §2.2），否则菜单里会出现点了必拒的动作。
    for (const out of fam.outputs) if (!handlesOp(out.op)) throw rowErr(id, `${call.family} outputs ${out.op}, which has no handler`);
    return Object.freeze({ family: call.family, params: Object.freeze({ ...call.params }) });
  });
  return Object.freeze({ id, cls: row.class, slots: Object.freeze(slots), when, calls: Object.freeze(calls), group: row.menu.group, order: row.menu.order });
}

/**
 * 出身条目（卷四 §2.4 origin 族；设计册 14 §3.6、§4.7）：gate 为空或是 rules.playerOrigins 的一个布尔键，起始物须是已登记的数据行。
 * 返回开放的出身代号集（开关为假的不进；只影响新建档的候选，设计册 §4.7 :238）。
 */
function loadOrigins(registry, docData, entries) {
  const open = new Set();
  for (const [code, e] of Object.entries(entries)) {
    const gate = isObj(e) ? e[GATE_FIELD] : undefined;
    const items = isObj(e) && Array.isArray(e[ITEMS_FIELD]) ? e[ITEMS_FIELD] : null;
    if (items === null || items.some((it) => !isObj(it) || !registry.hasLoaded(it.item) || !Number.isInteger(it.n) || it.n < 1)) {
      throw new KernelError('E-DIM-REF-MISSING', {}, `${FAM.origin} ${code}: ${ITEMS_FIELD} must list registered data rows with n >= 1`);
    }
    if (gate === null) { open.add(code); continue; }
    const v = typeof gate === 'string' ? ruleValue(docData, ORIGINS, gate) : undefined;
    if (typeof v !== 'boolean') throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `${FAM.origin} ${code}: ${GATE_FIELD} must name a boolean key of rules.${ORIGINS}`);
    if (v) open.add(code);
  }
  return Object.freeze({ open: Object.freeze(open) });
}

/** 目录（装配期挂 engine.actions）；没有即本局世界数据未带动作目录，调用即拒。 */
function catalogOf(engine) {
  if (!engine.actions) throw new KernelError('E-ACT-UNKNOWN', {}, 'no action catalog in this world data');
  return engine.actions;
}

/** 某实体行（或以它为模板新建的实体）的出身代号；没有即 null。表取登记（不写表名）。 */
function originOf(engine, state, id) {
  const kind = engine.registry.kindOfLoaded(id);
  if (kind === undefined) return null;
  try {
    const v = dim(engine, state, kind, id, ORIGIN_DIM).value;
    return typeof v === 'string' ? v : null;
  } catch (e) {
    if (e instanceof KernelError && (e.code === UNKNOWN_READ)) return null;
    throw e;
  }
}

/**
 * 本局玩家化身：state.created 中以带出身的实体行为 template 新建的个体（不另存指针；登记见 rxNamespaces player.avatarCount）。
 * 玩家席位边（卷九 R9-3.9 hk_player_seat）随持有写者 S2-H 建成后改由它认定。
 * @returns {string[]}
 */
function avatarsOf(engine, state) {
  const created = isObj(state.created) ? state.created : {};
  return Object.keys(created).filter((id) => isObj(created[id]) && typeof created[id].template === 'string' && originOf(engine, state, created[id].template) !== null).sort();
}

/**
 * 动作侧 RX 的命名空间读数（唯一来源；行与筛选的 whenRX、效果族 paramsRX 同用）：键即命名空间读数键。
 * @param {{actor?: string | null, slots?: Record<string, string | number>, candidate?: string}} at
 * @returns {Record<string, string | number | boolean>}
 */
export function nsReadsFor(engine, state, at) {
  const avatars = avatarsOf(engine, state);
  const reads = { [NS.avatarCount]: avatars.length, [NS.isAvatar]: typeof at.actor === 'string' && avatars.includes(at.actor) };
  // 候选的出身开放与否惰性求（只有读它的筛选才求，别的表的候选不读出身维度）。
  if (typeof at.candidate === 'string') {
    Object.defineProperty(reads, NS.originOpen, { enumerable: true, get: () => {
      const origin = originOf(engine, state, at.candidate);
      return origin !== null && catalogOf(engine).origins.open.has(origin);
    } });
    // 候选能否建档（S1-3c 未建数据门）：与建档补全同一判断 rules/body/person.mjs#speciesOf。
    Object.defineProperty(reads, NS.originReady, { enumerable: true, get: () => speciesOf(engine, state, String(at.candidate)) !== null });
  }
  for (const [name, v] of Object.entries(at.slots || {})) reads[`${NS.slot}${PATH_SEP}${name}`] = v;
  return reads;
}

/**
 * 一个候选过不过本槽全部筛选：缺哪个维度读数就经 dim 补读哪个（读不到即缺读数，不算过）；缺的不是本表维度也不算过。
 */
function passes(engine, state, slot, id, actor) {
  const reads = nsReadsFor(engine, state, { actor, candidate: id });
  return slot.filters.every((f) => {
    const bound = {};
    for (;;) {
      try { return evaluateRX(f.tree, { dim: bound }, reads) === true; } catch (e) {
        const key = missingKey(e);
        if (key === undefined) throw e;
        if (Object.hasOwn(bound, key) || !f.dims.has(key)) return false;
        try { bound[key] = dim(engine, state, slot.table, id, key).value; } catch (d) {
          if (d instanceof KernelError && d.code === UNKNOWN_READ) return false;
          throw d;
        }
      }
    }
  });
}

/**
 * 槽位候选（R9-1.2；菜单投影与 resolve 的 shape 段同用这一个函数）：tableRow 槽取该数据表的行（按 id 排序），经各筛选 whenRX 筛过。
 * @param {string} actId @param {string} slotName @param {string | null} actor @returns {string[]}
 */
function candidatesOf(engine, state, actId, slotName, actor) {
  const row = catalogOf(engine).rows.get(actId);
  const slot = row ? row.slots.find((s) => s.name === slotName && Object.hasOwn(s, 'table')) : undefined;
  if (!slot) throw new KernelError('E-ACT-SLOT', {}, `${actId}: no table-row slot ${slotName}`);
  const doc = engine.registry.tables.get(slot.table);
  return Object.keys(isObj(doc.rows) ? doc.rows : {}).sort().filter((id) => passes(engine, state, slot, id, actor));
}

/**
 * 意图收窄的 shape 段（与菜单投影同一套槽位处理表）：意图里每个值按所在槽的种类收窄；未声明、种类不对、缺必填一律 E-ACT-SLOT。
 * @returns {{values: Record<string, string | number>, tables: Record<string, string>}}
 */
export function shapeOf(engine, state, actId, intent, actor) {
  const row = catalogOf(engine).rows.get(actId);
  const byName = new Map(row.slots.map((s) => [s.name, s]));
  for (const [kind, h] of Object.entries(SLOT_KINDS)) {
    const given = intent[h.intentKey] === undefined ? {} : intent[h.intentKey];
    if (!isObj(given)) throw new KernelError('E-ACT-SLOT', {}, `${h.intentKey} must be a map`);
    for (const name of Object.keys(given)) if (!byName.has(name) || SLOT_KINDS[byName.get(name).kind] !== h) throw new KernelError('E-ACT-SLOT', {}, `${row.id}: no ${kind} slot ${name}`);
  }
  const values = {};
  const tables = {};
  for (const s of row.slots) {
    const h = SLOT_KINDS[s.kind];
    const given = isObj(intent[h.intentKey]) ? intent[h.intentKey] : {};
    if (!Object.hasOwn(given, s.name)) {
      if (s.required) throw new KernelError('E-ACT-SLOT', {}, `${row.id}: slot ${s.name} is required`);
      continue;
    }
    values[s.name] = h.pick(engine, state, row, s, given[s.name], actor);
    if (Object.hasOwn(s, 'table')) tables[s.name] = s.table;
  }
  return { values, tables };
}

/**
 * 可用条件（whenRX，只读命名空间读数）：空即恒真。菜单投影时槽位未选，读 slot.* 的缺读数不算不过（到 resolve 再判）。
 * @param {{actor: string | null, slots?: Record<string, string | number>}} at @param {boolean} slotsKnown
 */
export function whenHolds(engine, state, actId, at, slotsKnown) {
  const row = catalogOf(engine).rows.get(actId);
  if (row.when === null) return true;
  try { return evaluateRX(row.when, {}, nsReadsFor(engine, state, at)) === true; } catch (e) {
    const key = missingKey(e);
    if (key === undefined) throw e;
    return !slotsKnown && key.startsWith(`${NS.slot}${PATH_SEP}`);
  }
}

/**
 * 可做之事投影（R9-1.2 的 S1 子集：试算 shape 与 whenRX）：可用且每个必填 code 槽都有候选的行，按菜单组序、组内序；
 * 每行给 code 槽候选 id 列表（slots）与数值槽取值范围（numbers），只代号与数值，显示名由前端查语言包。
 */
function affordances(engine, state, actor) {
  const cat = catalogOf(engine);
  const out = [];
  for (const id of cat.order) {
    if (!whenHolds(engine, state, id, { actor }, false)) continue;
    const row = cat.rows.get(id);
    const slots = {};
    const numbers = {};
    let ok = true;
    for (const s of row.slots) {
      const offered = SLOT_KINDS[s.kind].offer(engine, state, row, s, actor);
      if (offered.range) numbers[s.name] = offered.range;
      if (offered.candidates) {
        slots[s.name] = Object.freeze(offered.candidates);
        if (s.required && offered.candidates.length === 0) ok = false;
      }
    }
    if (ok) out.push(Object.freeze({ act: id, slots: Object.freeze(slots), numbers: Object.freeze(numbers) }));
  }
  return Object.freeze(out);
}

/**
 * 未指名行动者时的缺省行动者（审卡第一轮 ① 选 A）：本局尚无玩家化身即 null（开局建档），恰一个即取它，多于一个不唯一即拒（码由调用方给）。
 * 化身认定沿用 avatarsOf（派生）；待 S2-H 玩家席位边建成后改由席位边取。
 * @param {string} code 不唯一时的拒收码 @returns {string | null}
 */
export function defaultActor(engine, state, code) {
  const avatars = avatarsOf(engine, state);
  if (avatars.length > 1) throw new KernelError(code, {}, 'no actor given and the player avatar is not unique');
  return avatars.length === 1 ? avatars[0] : null;
}

/**
 * 菜单（S1-3b 经 world.menu 调；主会话 11-26 裁定）：subjectId 为空即取缺省行动者（尚无化身为开局菜单，已有唯一化身即按化身投影）；给了须是本局玩家化身，否则 E-DISPLAY-SUBJECT。
 * visible：S1 的可见集 = 主体（若有）与已开放地点（主观视图卷二十二未建，草案 §1 第 18 行）。纯读，不写状态、不进日志。
 * @param {string | null} subjectId
 */
export function menuOf(engine, state, subjectId) {
  const subject = subjectId === undefined || subjectId === null ? defaultActor(engine, state, 'E-DISPLAY-SUBJECT') : subjectId;
  if (subject !== null && !(typeof subject === 'string' && avatarsOf(engine, state).includes(subject))) throw new KernelError('E-DISPLAY-SUBJECT', {}, 'menu subject must be null or a player avatar');
  const visible = [...(subject === null ? [] : [subject]), ...openPlacesOf(engine, state)];
  return Object.freeze({ affordances: affordances(engine, state, subject), visible: Object.freeze(visible) });
}
