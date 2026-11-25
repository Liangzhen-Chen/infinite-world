// 账本骨架（卷六 §4.1 账本三元键与守恒；§2.1 账户与资源种类；§2.2 词表族；§2.5 ledger.json；§3.1 读入口；§3.3 唯一写者）。
// 块 3 第 3-1 张：三元键、开户 openAccount、读入口 balance / accountsOf / stockIn、资源种类表与本卷词表族的加载校验 checkLedgerTables、
// ledger.json 生效日窗口的读法 budgetOn。第 3-2 张：入账 post / transfer、批次存储 stockLots 与批次键、K-8 一致性审计 auditLots、
// 物理律通道预警派生 alertGaps、逐日用量 usedByDay 的写与读 dayUsage、持有人主体核对与审计入口 auditLedger。
// 第 3-3 张：限额通道按比例分配 prorateCapped / allocateCapped（申请存放与日终调用归块 7）、月结账本侧 closeLedgerPeriod（写报由调用方传入）、
// auditLedger 加守恒审计（三元键、非负、守恒式）。
// 第 3-3c 张（卷六 §4.1 规则 6 :376、码表 :1640，勘误 1118k13 续、李白 11-18 07:02 选丙）：日终分配结算入口 settleCappedAllocation 同事务按分配结果
// 逐申请者入账；带 bm_capped 来源腿的直接 post / transfer 整笔拒 E-LEDGER-CAPPED-DIRECT（经入口发出用本文件私有的 postDraft(viaAllocation) 区分，
// 不是调用方可传的参数）；同日同来源按 ledgerTotals 的 usedByDay 当日项判重放，重跑不重复记账。
// 新账本一开始就是唯一写者（方案 R5）：accounts.*、ledgerTotals、outflowTotals.*、stockLots.*、ledgerCounters.lotNext 的写者只有本文件（state-owners.json）。
// 只读登记数据（资源种类行、词表条目字段、规则表），不认任何具体资源、来源去处代号、用途或实体 id（AGENTS 红线）；
// 下面 SCHEMA 是卷六定义的族名、封闭族条目与账户字段的类型，不是内容数据。资源种类行的 transferable、counterpartRX、sources、sinks
// 四个字段只在本文件读（A6-1.1 :398）。

import { ruleTable } from './load/rules.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { kindOf } from './vocab.mjs';
import { KernelError, codeOf } from './errors.mjs';
import { currentTransaction, txSet, txDelete, markDenied } from './transaction.mjs';
import { TERMINATED_KEY } from './storage.mjs';
import { clone } from './clone.mjs';
import { splitLastRemainder, fixedUnits, fixedAdd, fixedMultiply, fixedDivide, fixedToNumber } from './det-math.mjs';
import { dim } from './dimensions.mjs';
import { clockView } from './scheduler.mjs';
import { readView } from './view-registry.mjs';
import { buildE } from './handles/generated.mjs';
import { T, GRAMMAR_TOKENS } from './handles/markers.mjs';

const E = buildE();
// 三元键与登记行的字段名（卷二 §2.7 路径段、卷六 §2.5 :224 账本行 {day,used}、§3.1 :? 账户过滤字段）：定义源只写一份，比较处引用。
const RESOURCE_KEY_FIELDS = ['key', 'kind'];
const DAY_USED_FIELDS = ['day', 'used'];
const ACCOUNT_FILTER_FIELDS = ['family', 'purpose'];
// 入账腿 lot 的三种键集写法：{attrs}、{splitFrom}、{project, splitFrom}（物品类的资源键是批次，卷六 §2.1 :104；批次属性归卷三乙 §4.4）。
// attrs、splitFrom 是 post 批次腿的协议字段，定义源在 kernel/handles/markers.mjs 的 T.lot_leg_key（卷文待回补：卷三乙 post 批次腿字段（主会话另派勘误））；
// project 引用本文件的 SCHEMA.project（卷三乙 §2.3 :280）。单一定义源，比较处引用成员（S13 ④，李白 11-18 13:05 裁定第 2 条）。
// 路径模式的空段（卷二 §2.7 writers 写法："" = 整个键）。
const PATH = Object.freeze({ empty: '' });

// ---------- 卷六定义的结构常量 ----------

export const SCHEMA = Object.freeze({
  // 账本行的两条通道（卷六 §2.5 :224：budget 限额通道、alert 物理律通道）。
  budget: 'budget',
  // 规则表代号（world/rules/registry.json；文件 world/rules/tables/economy/ resources.json、ledger.json，卷六 §2.1 :108、§2.5 :224）。
  resourcesTable: 'economyResources',
  ledgerTable: 'economyLedger',
  // 词表族名（卷六 §2.2 :128–132；resource 族归卷二 §1.9；verb 族归卷二 §1.9、卷二十四 §2.1）。
  resource: 'resource', resfam: 'resfam', purpose: 'purpose', src: 'src', sink: 'sink', budgetMode: 'budget_mode',
  indicator: 'indicator', ckind: 'ckind', verb: 'verb',
  // budget_mode 封闭两项的含义（§2.2 :131）：限额通道只进 budget，物理律通道只进 alert（§2.5 :224）。
  capped: 'bm_capped', physical: 'bm_physical',
  // transferability：只有 tr_restricted 带对手条件（§2.1 :114–115）。
  restricted: 'tr_restricted',
  // 账户 holder 的类型（§2.1 :103）：ref refs[kind person, kind org, kind place, kind faith, kind deity]；faith、deity 两表的登记行只用于点数类。
  holderKinds: Object.freeze(['deity', 'faith', 'org', 'person', 'place']),
  catalogKinds: Object.freeze(['deity', 'faith']),
  // 作持有人须带"作为主体登记"标记的 kind 与标记维度（§2.1 :103、S6-14；维度定义只在卷二 §5.6 :1765，boolean、always、onUnknown error）。
  subjectFlags: Object.freeze({ place: 'ledgerHolder' }),
  // 居民聚合体作持有人（§2.1 :103 SeedKey、S6-14，勘误 1118k9）：聚合记录 aggregates.<aggregate> 只由 aggregate.mjs 读写（卷二十七 S27-2 :242，
  // 内核不在读豁免集合 :225），账本经登记的视图读取函数 aggregateView（卷二十七 §3.1）取登记标记 ledgerHolder（卷二 §5.6 :1765；位置卷二十七 :200；
  // 李白 11-18 05:28 裁定①第 2、4 条）。checkSubject 对聚合体返回的 kind 记作 aggregateKind。
  aggregateView: 'aggregateView', aggregateFlag: 'ledgerHolder', aggregateKind: 'aggregate',
  // 批次属性 project（卷三乙 §2.3 :280，ref 卷十九 buildProject nullable）与工程的发起主体字段 sponsor（卷十九 §3.3 :272），
  // 经登记的视图读取函数 buildProjectView（卷十九 §3.2 :242，补 sponsor 只读；李白 11-18 05:28 裁定①第 1、2 条）取，不直读 buildProject。
  project: 'project', projectView: 'buildProjectView', sponsor: 'sponsor',
  // 批次属性 spot（落点，struct:pos nullable；卷三乙 §2.3 :285，卷五 §4.5 规则 6 :502）：K-3 判同键之一，落点不同的批次不合并（勘误 1124k132）。
  spot: 'spot',
  catalogFamily: 'resfam_point',
  // 建筑所有权份额的资源族（卷六 §2.1 :112，一族只这一行，键是设施实例；开局入账 kernel/gen/assetcalls.mjs 按它取资源种类，不写种类代号）。
  assetFamily: 'resfam_asset',
  // transferability：tr_bound 只许与发行者之间转（§2.1 :114）。
  bound: 'tr_bound',
  // 物品类资源的键是批次（§2.1 :104）：这一族的账户每个资源键是一个批次键，批次属性存 stockLots（李白 11-18 04:10）。
  lotFamily: 'resfam_goods',
  // 状态顶层键（§3.3 :305；stockLots 卷三乙 §3.3 :433；批次键计数器，李白 11-18 04:10，块 3-2 定名）。
  accounts: 'accounts', totals: 'ledgerTotals', outflow: 'outflowTotals', stockLots: 'stockLots',
  counters: 'ledgerCounters', lotNext: 'lotNext',
  // struct:resourceTotals 的字段（卷二 §1.5 :247；卷六 §4.1.1 :347）：{cumulative, usedByDay: list<{day, used}>}。
  cumulative: 'cumulative', usedByDay: 'usedByDay',
  // 批次键 = 前缀 + 计数器值按内核常数表 handleRadix 进制（与卷二十 due_ 句柄同一做法，李白 11-18 03:31、04:10）。
  // 逐件实例的批次键 = 实例批次前缀 + 实例 id（确定性派生，不占计数器；序号键的数字串不含下划线，两种键文法不相交；卷三乙 §2.3、K-3，勘误 1119k13）。
  lotPrefix: 'lot_', instanceLotPrefix: 'lot_i_', constantsTable: 'kernelConstants', radixKey: 'handleRadix',
  // 批次属性里账本自己做算术的字段（卷六 §2.3 :160 costBasis：整批总成本原值，整数）与 K-8 校验的字段（卷三乙 :1035 taint ∈ [0,1]）。
  costBasis: 'costBasis', taint: 'taint',
  // 批次属性不存数量、不另存序号（卷二 §1.5 :246 struct:holderLots"末层不含"所列两字段；卷三乙 §2.3 :264"两字段已删"）：写了即拒。
  lotForbidden: Object.freeze(['lotSeq', 'qty']),
  // 条目上的文档字段（不参与规则；grade 取卷三甲 §2.1 来源级别）。
  docFields: Object.freeze(['basis', 'grade']),
  grades: Object.freeze(['designed', 'measured', 'referenced']),
});

// 入账腿 lot 的键集（定义源见本文件顶部注释）：成员只引用 markers 的 T.lot_leg_key 与 SCHEMA.project，不另写字面键名。
const LOT_KEYS = Object.freeze({ attrs: T.lot_leg_key.attrs, splitFrom: T.lot_leg_key.splitFrom, project: SCHEMA.project });
const LOT_KEY_SHAPES = Object.freeze([LOT_KEYS.attrs, LOT_KEYS.splitFrom, `${LOT_KEYS.project},${LOT_KEYS.splitFrom}`, `${LOT_KEYS.attrs},${T.lot_leg_key.instance}`]);

// src / sink 条目字段（§2.2 :131–132，四字段每行必写；reportGroup 在 indicator 族上线前显式写 null，李白 11-18 02:20 K3-41）。
const FLOW_FIELDS = Object.freeze(['budgetMode', 'families', 'pairedWith', 'reportGroup']);
// purpose 条目字段（§2.2 :130，四字段每行必写，不设缺省）。
const PURPOSE_FIELDS = Object.freeze(['locksFor', 'spendable', 'trackOutflow', 'visibleToMarket']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const codeOrNull = (v) => (typeof v === 'string' && CODE_RE.test(v) ? v : null);

// ---------- 三元键（§4.1 规则 1） ----------

// 账户键的路径段依次是什么（accountKey 产出、parseAccount 还原都按它）。
const ACCOUNT_KEY_PARTS = Object.freeze(['holder', 'purpose', 'resourceKind', 'resourceKey']);

/**
 * 账户由（持有人、资源、用途）唯一确定；资源是 struct{kind: 资源种类代号, key}（§2.1 :104）。
 * 返回 accounts 下的路径段 [持有人, 用途, 资源种类, 资源键]：前两段即"账户键"（§4.1.1 :347"持有人与用途分区两段"），后两段是资源。
 * 各段必须是代号形（卷二 §1.9），否则 E-DIM-ID-FORMAT。
 * @param {string} holder @param {{kind: string, key: string}} resource @param {string} purpose
 * @returns {readonly string[]}
 */
export function accountKey(holder, resource, purpose) {
  const r = isObj(resource) ? resource : {};
  const segs = [holder, purpose, r.kind, r.key];
  const bad = segs.findIndex((s) => typeof s !== 'string' || !CODE_RE.test(s));
  if (!isObj(resource) || Object.keys(resource).sort().join(',') !== [...RESOURCE_KEY_FIELDS].sort().join(',')) throw new KernelError('E-DIM-ID-FORMAT', { entity: codeOrNull(holder) }, 'resource must be {kind, key}');
  if (bad >= 0) throw new KernelError('E-DIM-ID-FORMAT', { entity: codeOrNull(holder) }, `account key segment ${bad} is not a code`);
  return Object.freeze(segs);
}

/**
 * accountKey 的逆：路径段 → {holder, resource: {kind, key}, purpose}。段数或形状不对 E-DIM-ID-FORMAT。
 * @param {readonly string[]} segs
 */
export function parseAccount(segs) {
  if (!Array.isArray(segs) || segs.length !== ACCOUNT_KEY_PARTS.length || !segs.every((s) => typeof s === 'string' && CODE_RE.test(s))) {
    throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'account key is [holder, purpose, resourceKind, resourceKey]');
  }
  const [holder, purpose, kind, key] = segs;
  return Object.freeze({ holder, resource: Object.freeze({ kind, key }), purpose });
}

// ---------- 加载校验（卷六 §2.1、§2.2、§2.5；S6-11 键闭集另由规则表加载器按登记查） ----------

/**
 * 资源种类表、ledger.json 与本卷词表族条目的跨字段校验。类型与取值域已由 kernel/load/rules.mjs 按登记查过，这里只查登记写不出的约束：
 * ① src/sink 条目四字段齐全、取值合族、pairedWith 互指；② purpose 条目四字段齐全；③ resource 族每个条目都有资源种类行、unit 在 _units、
 *   counterpartRX 只在 tr_restricted 行上、行的 family 属于所列每个来源与去处的 families（families 由各行 sources/sinks 反推，K3-41）；
 * ④ budget 只登限额通道、alert 只登物理律通道，且代号在该行 sources ∪ sinks 内；budget 条目的生效日窗口 activeFromDay ≤ activeToDay（K3-40，
 *   两端缺省即全程；整数与非负由登记的类型查）。只按登记数据判，不认任何具体条目。
 * @param {Record<string, any>} rules engine.rules（readRules 的结果）
 * @param {{vocab: {families: Map<string, any>, index: Map<string, {family: string, entry: any}>}, units: Map<string, any> | Set<string>}} env 维度加载的 env
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkLedgerTables(rules, env) {
  const errors = [];
  const push = (code, table, row, dim, got, want) => errors.push({ code, level: 'L2', table, row, dim, path: `${table}#/${row}${dim ? '/' + dim : ''}`, got, want });
  const index = env.vocab.index;
  const inFamily = (code, fam) => typeof code === 'string' && index.has(code) && index.get(code).family === fam;
  const entriesOf = (fam) => {
    const f = env.vocab.families.get(fam);
    return f && isObj(f.entries) ? Object.keys(f.entries).sort().map((id) => [id, isObj(f.entries[id]) ? f.entries[id] : {}]) : [];
  };
  const docOk = (table, id, e) => {
    if (e.grade !== undefined && !SCHEMA.grades.includes(e.grade)) push('E-DIM-DOMAIN-ENUM', table, id, 'grade', e.grade, SCHEMA.grades.join('|'));
    if (e.basis !== undefined && typeof e.basis !== 'string') push('E-DIM-STRUCT-FIELD', table, id, 'basis', e.basis, 'string');
  };
  const closedFields = (table, id, e, fields) => {
    for (const f of Object.keys(e).sort()) if (!fields.includes(f) && !SCHEMA.docFields.includes(f)) push('E-DIM-STRUCT-FIELD', table, id, f, f, `one of ${[...fields, ...SCHEMA.docFields].join(', ')}`);
    for (const f of fields) if (!Object.hasOwn(e, f)) push('E-DIM-STRUCT-FIELD', table, id, f, 'missing', `${f} (every entry, no default)`);
  };

  // ① 来源与去处条目。
  const flows = new Map();
  for (const [fam, other] of [[SCHEMA.src, SCHEMA.sink], [SCHEMA.sink, SCHEMA.src]]) {
    const table = `_vocab.${fam}`;
    for (const [id, e] of entriesOf(fam)) {
      flows.set(id, e);
      closedFields(table, id, e, FLOW_FIELDS);
      docOk(table, id, e);
      const fs = e.families;
      if (Object.hasOwn(e, 'families') && (!Array.isArray(fs) || fs.some((x, i) => !inFamily(x, SCHEMA.resfam) || (i > 0 && !(fs[i - 1] < x))))) {
        push('E-DIM-DOMAIN-ENUM', table, id, 'families', fs, `sorted set of ${SCHEMA.resfam} entries`);
      }
      if (Object.hasOwn(e, 'budgetMode') && !inFamily(e.budgetMode, SCHEMA.budgetMode)) push('E-DIM-DOMAIN-ENUM', table, id, 'budgetMode', e.budgetMode, `entry of ${SCHEMA.budgetMode}`);
      if (Object.hasOwn(e, 'reportGroup') && e.reportGroup !== null && !inFamily(e.reportGroup, SCHEMA.indicator)) push('E-DIM-REF-MISSING', table, id, 'reportGroup', e.reportGroup, `null or entry of ${SCHEMA.indicator}`);
      if (Object.hasOwn(e, 'pairedWith') && e.pairedWith !== null) {
        if (!inFamily(e.pairedWith, other)) push('E-DIM-REF-MISSING', table, id, 'pairedWith', e.pairedWith, `null or entry of ${other}`);
        else if (index.get(e.pairedWith).entry.pairedWith !== id) push('E-DIM-REF-MISSING', table, id, 'pairedWith', e.pairedWith, `${e.pairedWith}.pairedWith = ${id} (mutual)`);
      }
    }
  }

  // ② 用途分区条目。
  for (const [id, e] of entriesOf(SCHEMA.purpose)) {
    const table = `_vocab.${SCHEMA.purpose}`;
    closedFields(table, id, e, PURPOSE_FIELDS);
    docOk(table, id, e);
    for (const f of ['spendable', 'trackOutflow', 'visibleToMarket']) if (Object.hasOwn(e, f) && typeof e[f] !== 'boolean') push('E-DIM-DOMAIN-RANGE', table, id, f, e[f], 'boolean');
    if (Object.hasOwn(e, 'locksFor') && e.locksFor !== null && !inFamily(e.locksFor, SCHEMA.ckind)) push('E-DIM-REF-MISSING', table, id, 'locksFor', e.locksFor, `null or entry of ${SCHEMA.ckind}`);
  }

  // ③ 资源种类行。
  const resTable = `rules.${SCHEMA.resourcesTable}`;
  const rows = Object.hasOwn(rules, SCHEMA.resourcesTable) && isObj(rules[SCHEMA.resourcesTable]) ? rules[SCHEMA.resourcesTable] : {};
  for (const [id] of entriesOf(SCHEMA.resource)) if (!Object.hasOwn(rows, id)) push('E-DIM-REF-MISSING', resTable, id, '', id, `a resource kind row for every ${SCHEMA.resource} entry`);
  for (const id of Object.keys(rows).sort()) {
    const row = rows[id];
    if (!isObj(row)) continue;
    if (!env.units.has(row.unit)) push('E-DIM-UNIT-UNKNOWN', resTable, id, 'unit', row.unit, 'unit id in _units.json');
    if (row.counterpartRX !== null && row.counterpartRX !== undefined && row.transferable !== SCHEMA.restricted) push('E-DIM-STRUCT-FIELD', resTable, id, 'counterpartRX', row.counterpartRX, `null unless transferable is ${SCHEMA.restricted}`);
    for (const [fld, fam] of [['sources', SCHEMA.src], ['sinks', SCHEMA.sink]]) {
      for (const code of Array.isArray(row[fld]) ? row[fld] : []) {
        const e = flows.get(code);
        if (inFamily(code, fam) && e && Array.isArray(e.families) && !e.families.includes(row.family)) {
          push('E-DIM-DOMAIN-ENUM', resTable, id, fld, code, `${code}.families includes ${row.family} (families derived from rows, K3-41)`);
        }
      }
    }
  }

  // ④ ledger.json：通道种类与生效日窗口。
  const ledTable = `rules.${SCHEMA.ledgerTable}`;
  const led = Object.hasOwn(rules, SCHEMA.ledgerTable) && isObj(rules[SCHEMA.ledgerTable]) ? rules[SCHEMA.ledgerTable] : {};
  for (const [key, mode] of [['budget', SCHEMA.capped], ['alert', SCHEMA.physical]]) {
    const m = isObj(led[key]) ? led[key] : {};
    for (const res of Object.keys(m).sort()) {
      const row = rows[res];
      if (!isObj(row)) { push('E-DIM-REF-MISSING', ledTable, key, res, res, 'resource kind with a row'); continue; }
      const cells = isObj(m[res]) ? m[res] : {};
      for (const code of Object.keys(cells).sort()) {
        const dim = `${res}/${code}`;
        const listed = [...(row.sources || []), ...(row.sinks || [])];
        if (!listed.includes(code)) push('E-DIM-REF-MISSING', ledTable, key, dim, code, `a source or sink listed on resource row ${res}`);
        const e = flows.get(code);
        if (e && e.budgetMode !== mode) push('E-DIM-DOMAIN-ENUM', ledTable, key, dim, e.budgetMode, `${key} holds ${mode} channels only (vol6 s2.5 :224)`);
        const c = cells[code];
        if (key === SCHEMA.budget && isObj(c) && Number.isInteger(c.activeFromDay) && Number.isInteger(c.activeToDay) && c.activeFromDay > c.activeToDay) {
          push('E-DIM-DOMAIN-RANGE', ledTable, key, `${dim}/activeFromDay`, [c.activeFromDay, c.activeToDay], 'activeFromDay <= activeToDay (world days)');
        }
      }
    }
  }
  return errors;
}

// 主体标记维度在表头的登记形状（卷二 §5.6 :1765：boolean，required always，onUnknown error）。
const SUBJECT_FLAG_DEF = Object.freeze({ type: 'boolean', required: 'always', onUnknown: 'error' });

/**
 * 加载校验：持有人类型里须带主体标记的 kind（SCHEMA.subjectFlags），其维度表载入了，表头就必须照卷二 §5.6 :1765 登记标记维度
 * （boolean、always、onUnknown error）。登记对了，"每行显式写、缺值报错"由公用行校验按 required always 报 E-DIM-REQUIRED-MISSING；
 * 本函数只查表头，不认任何具体行。该 kind 的表未载入即无可查（实体表块 6 载入）。
 * @param {Map<string, {doc: any}>} tables 维度校验结果的 tables（kind → {doc}）
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkSubjectFlagDims(tables) {
  const errors = [];
  for (const kind of Object.keys(SCHEMA.subjectFlags).sort(cmp)) {
    const t = tables instanceof Map ? tables.get(kind) : undefined;
    if (!t) continue;
    const flag = SCHEMA.subjectFlags[kind];
    const dims = t.doc && isObj(t.doc.dimensions) ? t.doc.dimensions : {};
    const def = isObj(dims[flag]) ? dims[flag] : null;
    for (const f of Object.keys(SUBJECT_FLAG_DEF)) {
      if (def && def[f] === SUBJECT_FLAG_DEF[f]) continue;
      errors.push({ code: 'E-DIM-STRUCT-FIELD', level: 'L2', table: kind, row: '', dim: flag, path: `${kind}#/dimensions/${flag}/${f}`, got: def ? def[f] : 'missing', want: `${SUBJECT_FLAG_DEF[f]} (vol2 s5.6 ${flag}; vol6 s2.1 holder)` });
    }
  }
  return errors;
}

// ---------- 运行期取登记数据 ----------

function resourceRow(engine, kind, holder) {
  const rows = ruleTable(engine.rules, SCHEMA.resourcesTable);
  if (typeof kind !== 'string' || !Object.hasOwn(rows, kind)) throw new KernelError('E-DIM-REF-MISSING', { entity: codeOrNull(holder) }, `resource kind ${JSON.stringify(kind)} has no resource kind row`);
  return rows[kind];
}

function entryOf(engine, family, code, holder) {
  const rec = typeof code === 'string' ? engine.vocab.index.get(code) : undefined;
  if (!rec || rec.family !== family) throw new KernelError('E-DIM-REF-MISSING', { entity: codeOrNull(holder) }, `${JSON.stringify(code)} is not an entry of ${family}`);
  return rec.entry || {};
}

// 资源引用 struct{kind, key}：种类有行、键是代号形。键所指对象（物品批次、存量对象、设施实例、地点等，§2.1 :104）的存在核对待块 6/7（登收尾待办）。
function checkResource(engine, resource, holder) {
  if (!isObj(resource) || Object.keys(resource).sort().join(',') !== [...RESOURCE_KEY_FIELDS].sort().join(',')) throw new KernelError('E-DIM-ID-FORMAT', { entity: codeOrNull(holder) }, 'resource must be {kind, key}');
  const row = resourceRow(engine, resource.kind, holder);
  if (typeof resource.key !== 'string' || !CODE_RE.test(resource.key)) throw new KernelError('E-DIM-ID-FORMAT', { entity: codeOrNull(holder) }, 'resource key is not a code');
  return row;
}

function readAt(state, segs) {
  let cur = state;
  for (const s of segs) {
    if (!isObj(cur) || !Object.hasOwn(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

// ---------- 写入口 ----------

// 持有人是主体（§2.1 :103、S6-14；卷三乙 K-2 :1030）：代号形、已载入实体、kind 在 holder 类型里；须带主体标记的 kind（place）其行标记为真，
// 否则 E-LEDGER-HOLDER-NOT-SUBJECT。标记经 dim() 读（实体行或偏离行），不按名字、id 或类别推断。容器、固定装置是物品或词表代号，
// 不在 holder 类型里（kind 不合 E-DIM-REF-MISSING，不是实体 E-DIM-UNKNOWN-READ）。居民聚合体（勘误 1118k9）经视图 aggregateView 读 ledgerHolder。
// 出入账腿都核。返回 kind（聚合体为 SCHEMA.aggregateKind）。
function checkSubject(engine, state, holderId) {
  if (typeof holderId !== 'string' || !CODE_RE.test(holderId)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'holder id is not a code');
  let kind;
  try { kind = kindOf(holderId); } catch (e) {
    if (codeOf(e) !== E.E_DIM_REF_MISSING) throw e;
    // 先查实体，不是已载入实体再查居民聚合体：经登记的视图读取函数 aggregateView 取该聚合体（视图未登记 E-DIM-UNKNOWN-READ，不放行），
    // 按其 ledgerHolder 标记判（§2.1 :103、S6-14、卷三乙 K-2 :1031；无标记或非真同为 E-LEDGER-HOLDER-NOT-SUBJECT，卷二十七 :200），
    // 不按聚合种类或名字推断；视图给不出这一条（null/undefined）才是读到未知，给出的不是对象即形状不合，同报 E-DIM-UNKNOWN-READ。
    const agg = readView(SCHEMA.aggregateView, engine, state, holderId);
    if (isObj(agg)) {
      if (agg[SCHEMA.aggregateFlag] !== true) throw new KernelError('E-LEDGER-HOLDER-NOT-SUBJECT', { entity: holderId }, `aggregate ${holderId}: ${SCHEMA.aggregateFlag} is not true (not registered as a ledger subject, vol6 s2.1 :103)`);
      return SCHEMA.aggregateKind;
    }
    if (agg !== null && agg !== undefined) throw new KernelError('E-DIM-UNKNOWN-READ', { entity: holderId }, `${SCHEMA.aggregateView}(${holderId}) did not return an object`);
    throw new KernelError('E-DIM-UNKNOWN-READ', { entity: holderId }, `holder ${holderId} is neither a loaded entity nor an aggregate (onUnknown error, vol6 s2.1 :103; entity tables load in block 6, K3-44)`);
  }
  if (!SCHEMA.holderKinds.includes(kind)) throw new KernelError('E-DIM-REF-MISSING', { entity: holderId }, `holder kind ${kind} is not one of ${SCHEMA.holderKinds.join(', ')}`);
  if (Object.hasOwn(SCHEMA.subjectFlags, kind)) {
    const flag = SCHEMA.subjectFlags[kind];
    const f = dim(engine, state, kind, holderId, flag);
    if (!(f.known && f.value === true)) throw new KernelError('E-LEDGER-HOLDER-NOT-SUBJECT', { entity: holderId }, `${kind} ${holderId}: ${flag} is not true (not registered as a ledger subject, vol6 s2.1 :103)`);
  }
  return kind;
}

// 入账腿与开户的持有人核对（§2.1 :103）：主体核对之外，目录行只持点数类、未终止。
function checkHolder(engine, state, holderId, row) {
  const kind = checkSubject(engine, state, holderId);
  if (SCHEMA.catalogKinds.includes(kind) && row.family !== SCHEMA.catalogFamily) throw new KernelError('E-DIM-REF-MISSING', { entity: holderId }, `${kind} catalog rows hold ${SCHEMA.catalogFamily} only`);
  const marks = isObj(state) ? state[TERMINATED_KEY] : undefined;
  if (isObj(marks) && Object.hasOwn(marks, holderId)) throw new KernelError('E-TERM-RESIDUE', { entity: holderId }, `holder ${holderId} is terminated`);
}

/**
 * kernelApi `openAccount(holderId, resourceRef, purposeCode)`（卷六 §3.2 :288；engine、state 省略写法照 §3.1 表头）：开零余额账户。
 * 已有该账户即原样返回，不改余额。只在事务内写（账本路径唯一写者是本文件）。依次核对，被拒抛 KernelError，由事务整笔回滚：
 * - 资源：种类在资源种类表有行（E-DIM-REF-MISSING），键是代号形（E-DIM-ID-FORMAT）；用途是 purpose 族条目（E-DIM-REF-MISSING）。
 * - 持有人（§2.1 :103，onUnknown error）：不在已载入的实体注册表即 E-DIM-UNKNOWN-READ——人物、组织、地点、信仰、神祇各表在块 6、7 才载入，
 *   在那之前任何持有人都按"读到未知即报错"拒绝，不静默放过（李白 11-18 02:20 K3-44）；kind 不在 holder 类型里、或 faith/deity 目录行开非点数类账户，
 *   E-DIM-REF-MISSING；已有终止标记（state.terminated，内核协议键，同 kernel/storage.mjs）E-TERM-RESIDUE。
 * - 待块 6：带 terminal 状态实例而终止标记尚未写下的那一段（卷二 §2.5 terminated 谓词的另一半）、边界实体作持有人、
 *   resfam_claim 行"只许聚合账户持有"（待块 7 卷二十七聚合体），均登收尾待办，现不核对。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {string} holderId @param {{kind: string, key: string}} resourceRef @param {string} purposeCode
 * @returns {readonly string[]} 账户键（accountKey 的结果）
 */
export function openAccount(engine, state, holderId, resourceRef, purposeCode) {
  try {
    if (typeof holderId !== 'string' || !CODE_RE.test(holderId)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'holder id is not a code');
    const row = checkResource(engine, resourceRef, holderId);
    entryOf(engine, SCHEMA.purpose, purposeCode, holderId);
    checkHolder(engine, state, holderId, row);
    const key = accountKey(holderId, resourceRef, purposeCode);
    const segs = [SCHEMA.accounts, ...key];
    if (Number.isInteger(readAt(state, segs))) return key;
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: holderId }, 'openAccount outside the transaction of this state');
    txSet(tx, segs, 0);
    return key;
  } catch (e) {
    throw markDenied(e);
  }
}

// ---------- post：账本唯一写入口（§3.2 :286；§4.1 规则 2、3、5、7、13） ----------

const LEG_ACCOUNT_FIELDS = Object.freeze(['account', 'delta', 'lot']);
const LEG_FLOW_FIELDS = Object.freeze(['flow', 'kind', 'qty']);
const DRAFT_FIELDS = Object.freeze(['legs', 'reason', 'refs']);
const ACCOUNT_FIELDS = Object.freeze(['holder', 'purpose', 'resource']);
const USAGE_FIELDS = Object.freeze(['day', 'flow', 'resource', 'used']);

const fieldsWithin = (o, allowed) => isObj(o) && Object.keys(o).every((k) => allowed.includes(k));
const structErr = (why) => new KernelError('E-DIM-STRUCT-FIELD', { entity: null }, why);
const isPosInt = (v) => Number.isSafeInteger(v) && v > 0;

/**
 * 批次键计数器的进制：内核常数表 kernelConstants.handleRadix（与卷二十 due_ 句柄同一张表、同一进制，李白 11-18 03:31、04:10）。
 * @param {{rules: any}} engine
 * @returns {number}
 */
export function lotRadix(engine) {
  const t = ruleTable(engine.rules, SCHEMA.constantsTable);
  const r = isObj(t) ? t[SCHEMA.radixKey] : undefined;
  if (!Number.isInteger(r)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `rules.${SCHEMA.constantsTable}.${SCHEMA.radixKey} is not an integer radix`);
  return r;
}

// 物品表的 kind 与实例状态键、改赃份额记录的目标键（卷三乙 §3.3 "taint 的写者"表）：固定记号，单一定义。
const ITEM = Object.freeze({ kind: 'item', instances: 'itemInstances' });
const TARGET = Object.freeze({ instance: 'instance', lot: 'lot' });

// 代号是不是物品模板：kindOf 是 item 且不是实例（实例不在 idIndex，kindOf 即 E-DIM-REF-MISSING，同样不是）。
function isItemTemplate(id) {
  try { return kindOf(id) === ITEM.kind; } catch (e) {
    if (codeOf(e) === E.E_DIM_REF_MISSING) return false;
    throw e;
  }
}

/** 实例批次键：lot_i_ + 实例 id（逐件实例永远是自己那一批，数量 1）。 @param {string} instanceId @returns {string} */
export function instanceLotKey(instanceId) {
  return `${SCHEMA.instanceLotPrefix}${instanceId}`;
}

/** 实例批次键对应的实例 id；不是实例批次键（散货序号键等）为 null。 @param {any} key @returns {string | null} */
export function lotKeyInstance(key) {
  return typeof key === 'string' && key.startsWith(SCHEMA.instanceLotPrefix) && key.length > SCHEMA.instanceLotPrefix.length ? key.slice(SCHEMA.instanceLotPrefix.length) : null;
}

/**
 * 批次键的序号（前缀之后按进制读回、往返一致才算；不是序号键（含实例批次键）即 null）。
 * @param {any} key @param {number} radix
 * @returns {number | null}
 */
export function lotOrdinal(key, radix) {
  if (typeof key !== 'string' || !key.startsWith(SCHEMA.lotPrefix) || lotKeyInstance(key) !== null) return null;
  const digits = key.slice(SCHEMA.lotPrefix.length);
  const n = Number.parseInt(digits, radix);
  return Number.isSafeInteger(n) && n >= 0 && n.toString(radix) === digits ? n : null;
}

// 入账腿的账户 {holder, purpose, resource: {kind, key?}}；新批次腿（带 lot）不写 key，键由 post 发。
function parseAccountLeg(engine, leg, i) {
  if (!fieldsWithin(leg, LEG_ACCOUNT_FIELDS) || !Object.hasOwn(leg, 'account') || !Object.hasOwn(leg, 'delta')) throw structErr(`leg ${i}: account leg is {account, delta, lot?}`);
  const a = leg.account;
  if (!fieldsWithin(a, ACCOUNT_FIELDS) || ACCOUNT_FIELDS.some((f) => !Object.hasOwn(a, f))) throw structErr(`leg ${i}: account is {holder, purpose, resource}`);
  if (typeof a.holder !== 'string' || !CODE_RE.test(a.holder)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, `leg ${i}: holder id is not a code`);
  const r = a.resource;
  if (!isObj(r) || !fieldsWithin(r, ['key', 'kind'])) throw structErr(`leg ${i}: resource is {kind, key}`);
  const row = resourceRow(engine, r.kind, a.holder);
  const purposeEntry = entryOf(engine, SCHEMA.purpose, a.purpose, a.holder);
  if (!Number.isSafeInteger(leg.delta) || leg.delta === 0) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: a.holder }, `leg ${i}: delta is a non-zero integer`);
  const isLotRow = row.family === SCHEMA.lotFamily;
  const newLot = Object.hasOwn(leg, 'lot');
  // 物品类：入账腿一律开新批次（每个批次键在账本里恰有一行余额，李白 11-18 04:10 K-8），出账腿指名已有批次。
  if (isLotRow && leg.delta > 0 && !newLot) throw structErr(`leg ${i}: an increase of a ${SCHEMA.lotFamily} resource opens a new lot (lot: {splitFrom} or {attrs})`);
  if (newLot && (!isLotRow || leg.delta < 0)) throw structErr(`leg ${i}: lot only on increase legs of ${SCHEMA.lotFamily} resources`);
  if (newLot) {
    if (Object.hasOwn(r, 'key')) throw structErr(`leg ${i}: a new lot leg carries no resource key (post issues it)`);
    const l = leg.lot;
    // 拆分可另带 project：供料时拆出新批次并把新批次的 project 设为该工程（卷十九 §4.4 规则 7 :531、卷三乙 K-2 :1031）；其余属性原样带出。
    const ks = isObj(l) ? Object.keys(l).sort(cmp).join(',') : '';
    if (!LOT_KEY_SHAPES.includes(ks)) throw structErr(`leg ${i}: lot is {splitFrom, project?} or {attrs}`);
    if (Object.hasOwn(l, 'splitFrom') && (typeof l.splitFrom !== 'string' || !CODE_RE.test(l.splitFrom))) throw new KernelError('E-DIM-ID-FORMAT', { entity: a.holder }, `leg ${i}: splitFrom is not a lot key`);
    if (Object.hasOwn(l, SCHEMA.project) && !projectOk(l[SCHEMA.project])) throw new KernelError('E-DIM-ID-FORMAT', { entity: a.holder }, `leg ${i}: project is null or a buildProject id`);
    if (Object.hasOwn(l, T.lot_leg_key.instance)) {
      const id = l[T.lot_leg_key.instance];
      if (typeof id !== 'string' || !CODE_RE.test(id)) throw new KernelError('E-DIM-ID-FORMAT', { entity: a.holder }, `leg ${i}: lot instance is an instance id code`);
      if (leg.delta !== 1) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: a.holder }, `leg ${i}: an instance lot is one item (delta 1)`);
    }
    if (Object.hasOwn(l, 'attrs')) checkLotAttrs(l.attrs, a.holder, i);
  } else if (typeof r.key !== 'string' || !CODE_RE.test(r.key)) {
    throw new KernelError('E-DIM-ID-FORMAT', { entity: a.holder }, `leg ${i}: resource key is not a code`);
  }
  return { i, holder: a.holder, purpose: a.purpose, kind: r.kind, key: newLot ? null : r.key, delta: leg.delta, row, purposeEntry, lot: newLot ? leg.lot : null };
}

// 新批次的属性（卷三乙 §2.3 批次结构，字段含义与校验归块 6）：本卡只拒数量字段、只查账本自己做算术的 costBasis（非负整数）与 K-8 的 taint 范围。
function checkLotAttrs(attrs, holder, i) {
  if (!isObj(attrs)) throw structErr(`leg ${i}: lot attrs is an object`);
  for (const f of SCHEMA.lotForbidden) if (Object.hasOwn(attrs, f)) throw structErr(`leg ${i}: lot attrs carry no ${f} (the ledger balance is the only quantity)`);
  const cb = attrs[SCHEMA.costBasis];
  if (cb !== undefined && !(Number.isSafeInteger(cb) && cb >= 0)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: holder }, `leg ${i}: costBasis is a non-negative integer`);
  if (!taintOk(attrs[SCHEMA.taint])) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: holder }, `leg ${i}: taint is in [0, 1]`);
  if (!projectOk(attrs[SCHEMA.project])) throw new KernelError('E-DIM-ID-FORMAT', { entity: holder }, `leg ${i}: project is null or a buildProject id`);
}

// 批次属性 project：未写、null 或代号形的工程键（卷三乙 §2.3 :280 nullable ref buildProject）。
function projectOk(p) {
  return p === undefined || p === null || (typeof p === 'string' && CODE_RE.test(p));
}

// 备料批次（project 非空）的持有人须等于该工程的 sponsor（卷六码表 E-LEDGER-STAGING-SPONSOR；卷三乙 K-8 :1037；卷十九 §4.4 规则 7 :531）。
// 返回违例 {code, why}（合格为 null）。sponsor 经登记的视图读取函数 buildProjectView（卷十九 §3.2 :242、§3.3 :272）取，不直读 buildProject
// （李白 11-18 05:28 裁定①第 2 条；卷十九 construction.mjs 未建前视图未登记）：
// - 视图未登记：E-DIM-UNKNOWN-READ，不放行（裁定①第 3 条）；
// - 视图给不出该工程（null/undefined）：指向不存在的工程，E-LEDGER-STAGING-SPONSOR；
// - 给出的不是对象、或无 sponsor、或 sponsor 不是代号：形状不合，E-DIM-UNKNOWN-READ（裁定①，本卡）；
// - sponsor 不等于持有人：E-LEDGER-STAGING-SPONSOR。
// 用途是否为备料不认具体用途代号，只按 project 非空判。
function stagingFault(engine, state, holder, attrs) {
  const p = isObj(attrs) ? attrs[SCHEMA.project] : undefined;
  if (p === undefined || p === null) return null;
  if (!projectOk(p)) return { code: 'E-DIM-ID-FORMAT', why: `${SCHEMA.project} is null or a buildProject id` };
  let view;
  try { view = readView(SCHEMA.projectView, engine, state, p); } catch (e) {
    if (codeOf(e) !== E.E_DIM_UNKNOWN_READ) throw e;
    return { code: 'E-DIM-UNKNOWN-READ', why: e.message };
  }
  if (view === null || view === undefined) return { code: 'E-LEDGER-STAGING-SPONSOR', why: `lot of ${SCHEMA.project} ${p}: ${SCHEMA.projectView}(${p}) has no such project` };
  if (!isObj(view) || !Object.hasOwn(view, SCHEMA.sponsor) || typeof view[SCHEMA.sponsor] !== 'string' || !CODE_RE.test(view[SCHEMA.sponsor])) {
    return { code: 'E-DIM-UNKNOWN-READ', why: `lot of ${SCHEMA.project} ${p}: ${SCHEMA.projectView}(${p}) returned no ${SCHEMA.sponsor} code` };
  }
  if (view[SCHEMA.sponsor] !== holder) return { code: 'E-LEDGER-STAGING-SPONSOR', why: `lot of ${SCHEMA.project} ${p}: holder ${holder} is not ${SCHEMA.projectView}(${p}).${SCHEMA.sponsor} (${view[SCHEMA.sponsor]})` };
  return null;
}

// 赃物份额：未写或 fraction [0, 1]（卷三乙 §2.3 taint；K-8 :1035）。
function taintOk(t) {
  return t === undefined || (typeof t === 'number' && t >= 0 && t <= 1);
}

// 来源、去处腿 {flow: src 或 sink 代号, kind: 资源种类, qty: 正整数}（规则 3：代号须在该种类行 sources / sinks 内）。
function parseFlowLeg(engine, leg, i) {
  if (!fieldsWithin(leg, LEG_FLOW_FIELDS) || LEG_FLOW_FIELDS.some((f) => !Object.hasOwn(leg, f))) throw structErr(`leg ${i}: flow leg is {flow, kind, qty}`);
  const row = resourceRow(engine, leg.kind, null);
  if (!isPosInt(leg.qty)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `leg ${i}: qty is a positive integer`);
  const rec = typeof leg.flow === 'string' ? engine.vocab.index.get(leg.flow) : undefined;
  const side = rec && rec.family === SCHEMA.src ? SCHEMA.src : rec && rec.family === SCHEMA.sink ? SCHEMA.sink : null;
  if (side === null) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', { entity: null }, `leg ${i}: ${JSON.stringify(leg.flow)} is not a ${SCHEMA.src} or ${SCHEMA.sink} entry`);
  const listed = side === SCHEMA.src ? row.sources : row.sinks;
  if (!Array.isArray(listed) || !listed.includes(leg.flow)) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', { entity: null }, `leg ${i}: ${leg.flow} is not in ${side === SCHEMA.src ? 'sources' : 'sinks'} of resource kind ${leg.kind}`);
  return { i, code: leg.flow, side, kind: leg.kind, qty: leg.qty, entry: rec.entry || {}, row };
}

/**
 * kernelApi `post({legs, reason, refs})`（卷六 §3.2 :286；engine、state 省略写法照 §3.1 表头）：账本唯一写入口，一笔之内全成或全败。
 * 腿有两种：入账腿 {account: {holder, purpose, resource: {kind, key}}, delta: 非零整数, lot?}；来源去处腿 {flow: src/sink 代号, kind, qty: 正整数}。
 * 物品类（resfam_goods，§2.1 :104 键是批次）入账腿不写 key、带 lot：{splitFrom: 本笔出账腿里同种类的批次键}（拆分，属性原样带出）或 {attrs}（新批次属性）；
 * 批次键由 post 发（lot_ + ledgerCounters.lotNext 按 handleRadix 进制，只增不复用），属性写 stockLots，数量只在账户余额（李白 11-18 04:10）。
 * 核对次序（任一不合即抛 KernelError，事务整笔回滚，规则层 catch 住也回滚）：
 * - reason 必填（E-DIM-STRUCT-FIELD）、代号形（E-DIM-ID-FORMAT），且是已登记 verb（E-EVT-VERB；K3-43，verb 族建好后转真检查）。
 * - 规则 3：来源去处代号是 src/sink 条目、在该种类行 sources/sinks 内（E-LEDGER-CODE-UNREGISTERED）。
 * - 规则 2：每个资源种类 L − S + K = 0；不平而本笔该种类没有任何来源去处腿即 E-LEDGER-CODE-UNREGISTERED（未带代号），带了仍不平即 E-LEDGER-UNBALANCED；
 *   拆分腿从某批次带出的量之和超过该批次本笔出账量，同为 E-LEDGER-UNBALANCED。任一腿后余额为负 E-LEDGER-NEGATIVE。
 * - 规则 5：带 pairedWith 的代号，本笔须有其配对代号的腿（E-LEDGER-PAIR-MISSING）；卷十九明细作对手的单向转换腿待卷十九首卡，现一律按缺腿拒。
 * - 规则 7：同一种类有出账持有人与入账持有人不同时——tr_restricted 而 counterpartRX 空即 E-LEDGER-TRANSFER-RESTRICTED；counterpartRX 非空或 tr_bound
 *   要读双方类别、持有边与发行者（块 6、卷十八、卷六 §4.15），读不到按 onUnknown error 报 E-DIM-UNKNOWN-READ，不放行。
 * - 持有人只能是主体（§2.1 :103、S6-14）：出入账腿都核，不是已载入实体 E-DIM-UNKNOWN-READ、kind 不合 E-DIM-REF-MISSING、
 *   place 行 ledgerHolder 不为真 E-LEDGER-HOLDER-NOT-SUBJECT；入账腿另照 openAccount 核目录行与终止（E-TERM-RESIDUE），账户不存在即开。
 * - 限额：不在单笔上拒（§4.1 规则 6 :376 超日限额日终按比例分配；§2.5 :224 窗口外按零计也在那一步），但带 `bm_capped` 来源腿的直接 post（含 transfer）
 *   整笔拒 E-LEDGER-CAPPED-DIRECT（封卷后勘误 1118k13 续、李白 11-18 07:02 选丙：限额来源只能由日终分配结算入口 settleCappedAllocation 入账）。
 * 写：accounts 余额；规则 13 trackOutflow 分区的出账腿加 outflowTotals.<持有人>.<用途>.<种类>.<键>.cumulative；
 * 来源去处 ledgerTotals.<种类>.<代号> = {cumulative 累加, usedByDay 当日项（clockView 世界日）累加、无则追加}；已有 usedByDay 乱序、重复日或末项晚于当日
 *   E-LEDGER-USEDBYDAY-ORDER（李白 11-18 04:31 第 5 条）；
 * 新批次的 project（卷三乙 §2.3 :280）非空即核持有人等于视图 buildProjectView(project).sponsor（E-LEDGER-STAGING-SPONSOR；视图未登记或返回缺 sponsor 即 E-DIM-UNKNOWN-READ）；
 *   拆分写 {splitFrom, project} 即把新批次的 project 设为该值（供料，卷十九 §4.4 规则 7 :531），不写即原样带出。
 * 新批次写 stockLots.<持有人>.<用途>.<种类>.<批次键>；拆分时 costBasis 照卷六 §4.2 规则 5 :418 拆（拆出 floor(原值 × 拆出量 ÷ 原数量)、留下取差），其余属性原样，taint 不改。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {{legs: any[], reason: string, refs?: any}} draft
 * @returns {Readonly<{lots: readonly (readonly [number, string])[], notRun: readonly string[]}>} lots：[腿序号, 新批次键]；notRun：本笔未核的项
 */
export function post(engine, state, draft) {
  return postDraft(engine, state, draft, false);
}

// post 的实现；viaAllocation 是本文件私有的"经日终分配结算入口发出"标记，只有 settleCappedAllocation 传 true。
// 规则层调不到本函数（不导出），也没有可传的参数能置位，所以 bm_capped 来源腿不能借规则层数据路径伪造放行（卷六 §4.1 规则 6 :376）。
function postDraft(engine, state, draft, viaAllocation) {
  try {
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: null }, 'post outside the transaction of this state');
    if (!fieldsWithin(draft, DRAFT_FIELDS)) throw structErr('post draft is {legs, reason, refs?}');
    if (!Object.hasOwn(draft, 'reason')) throw structErr('post reason is required (verb code, vol6 s3.2 :286)');
    if (typeof draft.reason !== 'string' || !CODE_RE.test(draft.reason)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'post reason is not a code');
    // reason 是已登记 verb（卷六 §3.2 :286；K3-43：块 5 前报 not_run，verb 族建好后转真检查）。
    const reasonRec = engine && engine.vocab && engine.vocab.index instanceof Map ? engine.vocab.index.get(draft.reason) : undefined;
    if (!reasonRec || reasonRec.family !== SCHEMA.verb) throw new KernelError('E-EVT-VERB', { entity: null }, `post reason ${JSON.stringify(draft.reason)} is not a registered verb`);
    if (draft.refs !== undefined && !isObj(draft.refs)) throw structErr('post refs is an object');
    if (!Array.isArray(draft.legs) || draft.legs.length === 0) throw structErr('post legs is a non-empty list');

    const acct = [];
    const flows = [];
    draft.legs.forEach((leg, i) => {
      if (isObj(leg) && Object.hasOwn(leg, 'flow')) flows.push(parseFlowLeg(engine, leg, i));
      else acct.push(parseAccountLeg(engine, leg, i));
    });

    // 规则 6 限额通道：带 bm_capped 来源腿的 post 只能由日终分配结算入口发出（卷六 §4.1 规则 6 :376、码表 :1640；李白 11-18 07:02 选丙）。
    // 按来源条目登记的 budgetMode 判，不写死代号；不是入口内部路径即整笔拒、不部分入账（尚未写任何状态，事务整笔不落）。
    if (!viaAllocation) {
      const direct = flows.find((f) => f.side === SCHEMA.src && f.entry.budgetMode === SCHEMA.capped);
      if (direct) throw new KernelError('E-LEDGER-CAPPED-DIRECT', { entity: null }, `leg ${direct.i}: ${direct.code} is a ${SCHEMA.capped} source; only settleCappedAllocation may post it (vol6 s4.1 rule 6 :376)`);
    }

    // 规则 2：每个资源种类 L − S + K = 0。
    const kinds = [...new Set([...acct.map((a) => a.kind), ...flows.map((f) => f.kind)])].sort(cmp);
    for (const kind of kinds) {
      const L = acct.filter((a) => a.kind === kind).reduce((s, a) => s + a.delta, 0);
      const S = flows.filter((f) => f.kind === kind && f.side === SCHEMA.src).reduce((s, f) => s + f.qty, 0);
      const K = flows.filter((f) => f.kind === kind && f.side === SCHEMA.sink).reduce((s, f) => s + f.qty, 0);
      if (L - S + K === 0) continue;
      if (S === 0 && K === 0) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', { entity: null }, `${kind}: legs do not net to zero and carry no source or sink code`);
      throw new KernelError('E-LEDGER-UNBALANCED', { entity: null, net: L - S + K }, `${kind}: L - S + K = ${L - S + K}`);
    }
    // 拆分腿：splitFrom 是本笔同种类出账腿的批次，带出量之和不超过该批次出账量。
    const outOf = new Map();
    for (const a of acct) if (a.delta < 0) outOf.set(`${a.kind}/${a.key}`, (outOf.get(`${a.kind}/${a.key}`) || 0) - a.delta);
    const splitQty = new Map();
    for (const a of acct) {
      if (!a.lot || !Object.hasOwn(a.lot, 'splitFrom')) continue;
      const k = `${a.kind}/${a.lot.splitFrom}`;
      if (!outOf.has(k)) throw structErr(`leg ${a.i}: splitFrom ${a.lot.splitFrom} is not a lot of kind ${a.kind} with a decrease leg in this post`);
      splitQty.set(k, (splitQty.get(k) || 0) + a.delta);
      if (splitQty.get(k) > outOf.get(k)) throw new KernelError('E-LEDGER-UNBALANCED', { entity: a.holder }, `leg ${a.i}: more split from ${a.lot.splitFrom} than leaves it`);
    }
    // 规则 5：pairedWith 互指的代号成对出现。
    const codes = new Set(flows.map((f) => f.code));
    for (const f of flows) {
      const p = f.entry.pairedWith;
      if (p !== null && p !== undefined && !codes.has(p)) throw new KernelError('E-LEDGER-PAIR-MISSING', { entity: null }, `leg ${f.i}: ${f.code} needs a ${p} leg in the same post`);
    }
    // 规则 7：转让限制（只在出入账持有人不同时；同一持有人分区之间与来源去处腿不是转让）。
    for (const kind of kinds) {
      const legs = acct.filter((a) => a.kind === kind);
      if (!legs.length) continue;
      const row = legs[0].row;
      const outs = new Set(legs.filter((a) => a.delta < 0).map((a) => a.holder));
      const ins = new Set(legs.filter((a) => a.delta > 0).map((a) => a.holder));
      const between = [...outs].some((h) => [...ins].some((g) => g !== h));
      if (!between || (row.transferable !== SCHEMA.restricted && row.transferable !== SCHEMA.bound)) continue;
      if (row.transferable === SCHEMA.restricted && (row.counterpartRX === null || row.counterpartRX === undefined)) {
        throw new KernelError('E-LEDGER-TRANSFER-RESTRICTED', { entity: null }, `${kind}: ${SCHEMA.restricted} with no counterpart condition moves between no holders`);
      }
      throw new KernelError('E-DIM-UNKNOWN-READ', { entity: null }, `${kind}: ${row.transferable} needs counterpart classes, holding edges and the issuer (block 6, vol18, vol6 s4.15); not read, not let through`);
    }

    // 写。拆分的原批次属性与原数量取本笔写入之前的值。
    const before = new Map();
    for (const a of acct) {
      if (!a.lot || !Object.hasOwn(a.lot, 'splitFrom')) continue;
      const src = acct.find((b) => b.delta < 0 && b.kind === a.kind && b.key === a.lot.splitFrom);
      const k = `${a.kind}/${a.lot.splitFrom}`;
      if (before.has(k)) continue;
      const attrs = readAt(state, [SCHEMA.stockLots, src.holder, src.purpose, a.kind, a.lot.splitFrom]);
      if (!isObj(attrs)) throw new KernelError('E-DIM-REF-MISSING', { entity: src.holder }, `lot ${a.lot.splitFrom} has no ${SCHEMA.stockLots} row`);
      const bal = readAt(state, [SCHEMA.accounts, src.holder, src.purpose, a.kind, a.lot.splitFrom]);
      const qty = Number.isInteger(bal) ? bal : 0;
      // 原批余额不够本笔出账量即先拒（余额检查在拆分除法之前，不论腿序）：原数量为 0 的批次无可拆，不做这次除法（卷六 §4.2 规则 5 :418）。
      if (qty < outOf.get(k)) throw new KernelError('E-LEDGER-NEGATIVE', { entity: src.holder, balance: qty, delta: -outOf.get(k) }, `lot ${a.lot.splitFrom}: balance ${qty} is less than ${outOf.get(k)} leaving it`);
      before.set(k, { src, attrs, qty, taken: 0, splits: 0, total: splitQty.get(k) });
    }
    const radix = acct.some((a) => a.lot) ? lotRadix(engine) : null;
    const lots = [];
    for (const a of acct) {
      if (a.delta > 0) checkHolder(engine, state, a.holder, a.row);
      else checkSubject(engine, state, a.holder);
      let key = a.key;
      let attrs = null;
      if (a.lot) {
        // 实例批次键：新实例 {instance} 用 lot_i_<实例id>；拆分自实例批次（转手）是同一件实例，键不变（件数恒 1）；其余发序号键。
        const viaInstance = Object.hasOwn(a.lot, T.lot_leg_key.instance) ? instanceLotKey(a.lot[T.lot_leg_key.instance]) : (Object.hasOwn(a.lot, 'splitFrom') && lotKeyInstance(a.lot.splitFrom) !== null ? a.lot.splitFrom : null);
        if (viaInstance !== null) {
          key = viaInstance;
          if (readAt(state, [SCHEMA.accounts, a.holder, a.purpose, a.kind, key]) !== undefined) throw new KernelError('E-DIM-ID-DUPLICATE', { entity: a.holder }, `leg ${a.i}: instance lot ${key} already has a row in this account`);
        } else {
          const next = readAt(state, [SCHEMA.counters, SCHEMA.lotNext]) ?? 0;
          if (!Number.isSafeInteger(next) || next < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `${SCHEMA.counters}.${SCHEMA.lotNext} is not a non-negative integer`);
          key = `${SCHEMA.lotPrefix}${next.toString(radix)}`;
          txSet(tx, [SCHEMA.counters, SCHEMA.lotNext], next + 1);
        }
        if (Object.hasOwn(a.lot, 'attrs')) attrs = clone(a.lot.attrs);
        else {
          const b = before.get(`${a.kind}/${a.lot.splitFrom}`);
          attrs = clone(b.attrs);
          const cb = b.attrs[SCHEMA.costBasis];
          if (cb !== undefined) {
            // 卷六 §4.2 规则 5 :418：拆出部分 floor(costBasis × 拆出数量 ÷ 原数量)，原批留下部分取原值减去各拆出部分（末份取差）。
            const part = Number(splitLastRemainder(BigInt(cb), [BigInt(a.delta)], BigInt(b.qty))[0]);
            attrs[SCHEMA.costBasis] = part;
            b.taken += part;
          }
          b.splits += a.delta;
          if (Object.hasOwn(a.lot, SCHEMA.project)) attrs[SCHEMA.project] = a.lot[SCHEMA.project];
        }
        lots.push(Object.freeze([a.i, key]));
      }
      const segs = [SCHEMA.accounts, a.holder, a.purpose, a.kind, key];
      const cur = readAt(state, segs);
      const now = (Number.isInteger(cur) ? cur : 0) + a.delta;
      if (now < 0) throw new KernelError('E-LEDGER-NEGATIVE', { entity: a.holder, balance: Number.isInteger(cur) ? cur : 0, delta: a.delta }, `leg ${a.i}: balance would be ${now}`);
      txSet(tx, segs, now);
      // 实例批次出账到 0 即整行删（实例只在一处账户，同键不留零行；散货批次零行照旧保留）。
      if (now === 0 && lotKeyInstance(key) !== null) { txDelete(tx, segs); txDelete(tx, [SCHEMA.stockLots, a.holder, a.purpose, a.kind, key]); }
      if (attrs) {
        // 新批次（新属性或拆分带出）带 project 即核备料持有人等于工程 sponsor（卷三乙 K-8 :1037、卷十九 §4.4 规则 7 :531）。
        const sf = stagingFault(engine, state, a.holder, attrs);
        if (sf) throw new KernelError(sf.code, { entity: a.holder }, `leg ${a.i}: ${sf.why}`);
        txSet(tx, [SCHEMA.stockLots, a.holder, a.purpose, a.kind, key], attrs);
      }
      // 规则 13：trackOutflow 为真的分区，每条出账腿的减少量加进流出累计。
      if (a.delta < 0 && a.purposeEntry.trackOutflow === true) {
        const oseg = [SCHEMA.outflow, a.holder, a.purpose, a.kind, a.key, 'cumulative'];
        const prev = readAt(state, oseg);
        txSet(tx, oseg, (Number.isInteger(prev) ? prev : 0) - a.delta);
      }
    }
    // 拆出部分的 costBasis 从原批扣下（留下部分取原值减去拆出部分之和）。
    for (const [k, b] of before) {
      if (b.attrs[SCHEMA.costBasis] === undefined || lotKeyInstance(k.slice(k.indexOf('/') + 1)) !== null) continue;
      txSet(tx, [SCHEMA.stockLots, b.src.holder, b.src.purpose, k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1), SCHEMA.costBasis], b.attrs[SCHEMA.costBasis] - b.taken);
    }
    // 规则 3：来源、去处按资源种类累计（cumulative 单调不减）；同时记当日用量 usedByDay（§4.1.1 :347；世界日读 clockView，e6）。
    // 不在单笔上做限额拒绝：限额通道超日限额由日终按比例分配（§4.1 规则 6 :376），窗口外按零计（§2.5 :224）也归那一步（3-3）。
    if (flows.length) {
      const today = clockView(engine, state).day;
      const byCell = new Map();
      for (const f of flows) {
        const k = `${f.kind}/${f.code}`;
        const c = byCell.get(k) || { kind: f.kind, code: f.code, qty: 0 };
        c.qty += f.qty;
        byCell.set(k, c);
      }
      for (const c of [...byCell.values()].sort((x, y) => cmp(x.kind, y.kind) || cmp(x.code, y.code))) {
        const seg = [SCHEMA.totals, c.kind, c.code];
        const prev = readTotalsCell(state, c.kind, c.code);
        const days = prev.usedByDay.map((d) => ({ day: d.day, used: d.used }));
        const last = days[days.length - 1];
        if (last && last.day > today) throw new KernelError('E-LEDGER-USEDBYDAY-ORDER', { entity: null }, `${seg.join(GRAMMAR_TOKENS.pathSep)}: last day ${last.day} is after today ${today}`);
        if (last && last.day === today) last.used += c.qty;
        else days.push({ day: today, used: c.qty });
        txSet(tx, seg, { [SCHEMA.cumulative]: prev.cumulative + c.qty, [SCHEMA.usedByDay]: days });
      }
    }

    // 限额通道不再列 notRun budget：带 bm_capped 来源腿的笔只能经分配结算入口发出，日限额已在那一步入账前算定（卷六 §4.1 规则 6 :376）。
    // reason 是已登记 verb 已在入口处真核（K3-43），不再列 notRun。
    const notRun = [];
    if (kinds.some((k) => resourceRow(engine, k, null).issuerBacked === true)) notRun.push('issuer_backed');
    return Object.freeze({ lots: Object.freeze(lots), notRun: Object.freeze(notRun.sort(cmp)) });
  } catch (e) {
    throw markDenied(e);
  }
}

/**
 * kernelApi `transfer({from, to, resource, qty, reason, refs})`（卷六 §3.2 :287）：post 的两腿简写。from、to 是账户键 {holder, purpose}，
 * resource 是 {kind, key}，qty 正整数。物品类的入账腿按拆分写（lot: {splitFrom: resource.key}），属性原样带出；其余资源两腿同键。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {{from: {holder: string, purpose: string}, to: {holder: string, purpose: string}, resource: {kind: string, key: string}, qty: number, reason: string, refs?: any}} t
 */
export function transfer(engine, state, t) {
  try {
    if (!fieldsWithin(t, ['from', 'qty', 'reason', 'refs', 'resource', 'to']) || ['from', 'qty', 'reason', 'resource', 'to'].some((f) => !Object.hasOwn(t, f))) throw structErr('transfer is {from, to, resource, qty, reason, refs?}');
    for (const side of ['from', 'to']) if (!fieldsWithin(t[side], ['holder', 'purpose'])) throw structErr(`transfer ${side} is {holder, purpose}`);
    if (!isPosInt(t.qty)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'transfer qty is a positive integer');
    if (!isObj(t.resource)) throw structErr('transfer resource is {kind, key}');
    const row = resourceRow(engine, t.resource.kind, null);
    const out = { account: { holder: t.from.holder, purpose: t.from.purpose, resource: t.resource }, delta: -t.qty };
    const into = row.family === SCHEMA.lotFamily
      ? { account: { holder: t.to.holder, purpose: t.to.purpose, resource: { kind: t.resource.kind } }, delta: t.qty, lot: { splitFrom: t.resource.key } }
      : { account: { holder: t.to.holder, purpose: t.to.purpose, resource: t.resource }, delta: t.qty };
    const draft = { legs: [out, into], reason: t.reason };
    if (t.refs !== undefined) draft.refs = t.refs;
    return post(engine, state, draft);
  } catch (e) {
    throw markDenied(e);
  }
}

// ---------- K-8 批次一致性（卷三乙 §4.4 K-8 :1035；李白 11-18 04:10） ----------

/**
 * 审计入口（纯读）：物品类账户与 stockLots 一一对应。返回违例行（空即通过），按 path 升序：
 * - 物品类账户的每个资源键是批次键（lot_ 前缀、按 handleRadix 读回序号且小于 ledgerCounters.lotNext，即发过、不复用），否则 E-DIM-ID-FORMAT；
 * - 每个批次键在账本里恰有一行余额（出现在两个账户即 E-DIM-ID-DUPLICATE）；
 * - 物品类余额行必有同路径 stockLots 行，stockLots 行必有同路径余额行（E-DIM-REF-MISSING）；
 * - stockLots 行不带数量字段（E-DIM-STRUCT-FIELD）；taint 若写了须在 [0, 1]（E-DIM-DOMAIN-RANGE）。purports.item 是否物品模板待块 6 物品表。
 * - project 非空的批次：持有人须等于视图 buildProjectView(project).sponsor、工程须存在（E-LEDGER-STAGING-SPONSOR；视图未登记或返回缺 sponsor 即 E-DIM-UNKNOWN-READ），同 post。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @returns {readonly {code: string, path: string, why: string}[]}
 */
export function auditLots(engine, state) {
  const out = [];
  const push = (code, segs, why) => out.push(Object.freeze({ code, path: segs.join(GRAMMAR_TOKENS.pathSep), why }));
  const rows = ruleTable(engine.rules, SCHEMA.resourcesTable);
  const isLotKind = (kind) => Object.hasOwn(rows, kind) && isObj(rows[kind]) && rows[kind].family === SCHEMA.lotFamily;
  const radix = lotRadix(engine);
  const nextRaw = readAt(state, [SCHEMA.counters, SCHEMA.lotNext]);
  const next = Number.isSafeInteger(nextRaw) ? nextRaw : 0;
  // 逐行走 <top>.<持有人>.<用途>.<种类>.<键>；rel 是去掉顶层键的四段，两张表按 rel 对照。
  const walk = (top, fn) => {
    const t = readAt(state, [top]);
    for (const h of Object.keys(isObj(t) ? t : {}).sort(cmp)) {
      for (const p of Object.keys(isObj(t[h]) ? t[h] : {}).sort(cmp)) {
        for (const k of Object.keys(isObj(t[h][p]) ? t[h][p] : {}).sort(cmp)) {
          for (const key of Object.keys(isObj(t[h][p][k]) ? t[h][p][k] : {}).sort(cmp)) fn([h, p, k, key], t[h][p][k][key]);
        }
      }
    }
  };
  const seen = new Map();
  walk(SCHEMA.accounts, (rel) => {
    const [, , kind, key] = rel;
    if (!isLotKind(kind)) return;
    const segs = [SCHEMA.accounts, ...rel];
    const inst = lotKeyInstance(key);
    if (inst !== null) {
      // 实例批次键核与实例一一对应：键里的实例须存在（否则是多出来的一批）、余额恰为 1。
      const irow = readAt(state, [ITEM.instances, inst]);
      if (!isObj(irow)) push('E-DIM-REF-MISSING', segs, `instance lot ${key} has no ${ITEM.instances}.${inst} row`);
      else {
        // 种类须是该实例模板对应的资源种类（资源种类条目的 item 字段，卷六 §2.1，勘误 1119k12）；实例已终止而批次仍在即账本多算一件。
        const rec = engine.vocab.index.get(kind);
        if (!rec || !isObj(rec.entry) || rec.entry.item !== irow.template) push('E-DIM-REF-MISSING', segs, `instance lot ${key} sits under resource kind ${kind}, not the kind of its instance template`);
        const tmarks = readAt(state, [TERMINATED_KEY]);
        if (isObj(tmarks) && Object.hasOwn(tmarks, inst)) push('E-TERM-RESIDUE', segs, `instance ${inst} is terminated but its lot still holds a balance`);
      }
      if (readAt(state, [SCHEMA.accounts, ...rel]) !== 1) push('E-DIM-DOMAIN-RANGE', segs, 'an instance lot holds exactly one item');
    } else {
      const seq = lotOrdinal(key, radix);
      if (seq === null || seq >= next) push('E-DIM-ID-FORMAT', segs, `not an issued lot key (${SCHEMA.lotPrefix} + seq < ${SCHEMA.counters}.${SCHEMA.lotNext} in radix ${radix})`);
    }
    if (seen.has(key)) push('E-DIM-ID-DUPLICATE', segs, `lot key also at ${seen.get(key)}`);
    else seen.set(key, segs.join(GRAMMAR_TOKENS.pathSep));
    if (!isObj(readAt(state, [SCHEMA.stockLots, ...rel]))) push('E-DIM-REF-MISSING', segs, `no ${SCHEMA.stockLots} row for this lot`);
  });
  walk(SCHEMA.stockLots, (rel, attrs) => {
    const segs = [SCHEMA.stockLots, ...rel];
    if (!Number.isInteger(readAt(state, [SCHEMA.accounts, ...rel]))) push('E-DIM-REF-MISSING', segs, 'no ledger balance row for this lot');
    if (!isObj(attrs)) { push('E-DIM-STRUCT-FIELD', segs, 'lot attrs is an object'); return; }
    for (const f of SCHEMA.lotForbidden) if (Object.hasOwn(attrs, f)) push('E-DIM-STRUCT-FIELD', segs, `lot attrs carry no ${f}`);
    if (!taintOk(attrs[SCHEMA.taint])) push('E-DIM-DOMAIN-RANGE', segs, 'taint in [0, 1]');
    // 卷三乙 K-8 :1037：purports.item 若非空须是物品模板（kindOf 查加载期注册表，不解析字串；未登记同样不是）。
    const claimed = isObj(attrs.purports) ? attrs.purports.item : null;
    if (claimed !== null && claimed !== undefined && !isItemTemplate(claimed)) push('E-DIM-REF-MISSING', segs, 'purports.item is an item template');
    const sf = stagingFault(engine, state, rel[0], attrs);
    if (sf) push(sf.code, segs, sf.why);
  });
  // 少一件：每件未终止的实例都有自己那一批（键 lot_i_<实例id>，恰一行；两处出现已在上面报 E-DIM-ID-DUPLICATE）。
  const insts = readAt(state, [ITEM.instances]);
  const marks = readAt(state, [TERMINATED_KEY]);
  for (const id of Object.keys(isObj(insts) ? insts : {}).sort(cmp)) {
    if (isObj(marks) && Object.hasOwn(marks, id)) continue;
    if (!seen.has(instanceLotKey(id))) push('E-DIM-REF-MISSING', [ITEM.instances, id], `instance ${id} has no lot ${instanceLotKey(id)}`);
  }
  return Object.freeze(out.sort((a, b) => cmp(a.path, b.path) || cmp(a.code, b.code)));
}

// ---------- 逐日用量 usedByDay（卷二 §1.5 :247 struct:resourceTotals；卷六 §4.1.1 :347；李白 11-18 04:22、04:31 第 5 条） ----------

// 一条 usedByDay 的违例（空即合格）：项是 {day: 非负整数, used: 非负整数}（E-DIM-STRUCT-FIELD），day 严格升序、每天至多一项（E-LEDGER-USEDBYDAY-ORDER）。
function usedByDayFault(list) {
  if (!Array.isArray(list)) return { code: 'E-DIM-STRUCT-FIELD', why: `${SCHEMA.usedByDay} is a list of {day, used}` };
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!isObj(d) || Object.keys(d).sort().join(',') !== [...DAY_USED_FIELDS].sort().join(',') || !Number.isSafeInteger(d.day) || d.day < 0 || !Number.isSafeInteger(d.used) || d.used < 0) {
      return { code: 'E-DIM-STRUCT-FIELD', why: `${SCHEMA.usedByDay}[${i}] is {day, used} with non-negative integers` };
    }
    if (i > 0 && !(list[i - 1].day < d.day)) return { code: 'E-LEDGER-USEDBYDAY-ORDER', why: `${SCHEMA.usedByDay}[${i}].day ${d.day} does not follow day ${list[i - 1].day} strictly` };
  }
  return null;
}

// 读 ledgerTotals.<种类>.<代号>：没有即 {cumulative: 0, usedByDay: []}；有就须两字段齐全且 usedByDay 合格（不为旧形状兼容），否则抛对应码。
function readTotalsCell(state, kind, code) {
  const cell = readAt(state, [SCHEMA.totals, kind, code]);
  if (cell === undefined) return { cumulative: 0, usedByDay: [] };
  const path = `${SCHEMA.totals}.${kind}.${code}`;
  if (!isObj(cell) || Object.keys(cell).sort().join(',') !== `${SCHEMA.cumulative},${SCHEMA.usedByDay}` || !Number.isSafeInteger(cell.cumulative) || cell.cumulative < 0) {
    throw new KernelError('E-DIM-STRUCT-FIELD', { entity: null }, `${path} is {${SCHEMA.cumulative}, ${SCHEMA.usedByDay}}`);
  }
  const bad = usedByDayFault(cell.usedByDay);
  if (bad) throw new KernelError(bad.code, { entity: null }, `${path}: ${bad.why}`);
  return cell;
}

/**
 * 当日用量（§4.1.1 :347、§4.1 规则 6 :375）：ledgerTotals.<资源种类>.<代号>.usedByDay 里 day 等于当日（clockView 世界日）那一项的 used，无项即 0。
 * 读时照写入处同一套校验 usedByDay（乱序或重复日 E-LEDGER-USEDBYDAY-ORDER）。纯读。
 * @param {{vocab: any, rules: any, units: any}} engine @param {any} state @param {string} resourceKind @param {string} code 来源或去处代号
 * @returns {number}
 */
export function dayUsage(engine, state, resourceKind, code) {
  resourceRow(engine, resourceKind, null);
  const rec = typeof code === 'string' ? engine.vocab.index.get(code) : undefined;
  if (!rec || (rec.family !== SCHEMA.src && rec.family !== SCHEMA.sink)) throw new KernelError('E-DIM-REF-MISSING', { entity: null }, `${JSON.stringify(code)} is not a ${SCHEMA.src} or ${SCHEMA.sink} entry`);
  const today = clockView(engine, state).day;
  const hit = readTotalsCell(state, resourceKind, code).usedByDay.find((d) => d.day === today);
  return hit ? hit.used : 0;
}

/**
 * 账本审计入口（纯读；加载存档后与守恒审计时调）。返回违例行（空即通过），按 path 升序：
 * - ledgerTotals 每格是 {cumulative, usedByDay}，usedByDay 项形状不合 E-DIM-STRUCT-FIELD，day 不严格升序或同日多项 E-LEDGER-USEDBYDAY-ORDER（李白 11-18 04:31 第 5 条）；
 * - accounts、stockLots、outflowTotals 的每个持有人照 post 同一套主体核对（§2.1 :103、S6-14）：不是已载入实体 E-DIM-UNKNOWN-READ，
 *   kind 不在 holder 类型里 E-DIM-REF-MISSING，place 行 ledgerHolder 不为真 E-LEDGER-HOLDER-NOT-SUBJECT（码表"加载期见到即加载失败"）；
 * - 物品类批次的一致性照 auditLots（K-8）。
 * @param {{vocab: any, rules: any, tables?: any}} engine @param {any} state
 * @returns {readonly {code: string, path: string, why: string}[]}
 */
export function auditLedger(engine, state) {
  const out = [...auditLots(engine, state)];
  const push = (code, path, why) => out.push(Object.freeze({ code, path, why }));
  const totals = readAt(state, [SCHEMA.totals]);
  for (const kind of Object.keys(isObj(totals) ? totals : {}).sort(cmp)) {
    for (const code of Object.keys(isObj(totals[kind]) ? totals[kind] : {}).sort(cmp)) {
      try { readTotalsCell(state, kind, code); } catch (e) {
        if (codeOf(e) === null) throw e;
        push(codeOf(e), `${SCHEMA.totals}.${kind}.${code}`, e.message);
      }
    }
  }
  for (const top of [SCHEMA.accounts, SCHEMA.outflow, SCHEMA.stockLots]) {
    const t = readAt(state, [top]);
    for (const h of Object.keys(isObj(t) ? t : {}).sort(cmp)) {
      try { checkSubject(engine, state, h); } catch (e) {
        if (codeOf(e) === null) throw e;
        push(codeOf(e), `${top}.${h}`, e.message);
      }
    }
  }
  for (const v of auditConservation(engine, state)) push(v.code, v.path, v.why);
  return Object.freeze(out.sort((a, b) => cmp(a.path, b.path) || cmp(a.code, b.code)));
}

/**
 * 守恒审计（纯读；auditLedger 的一部分，3-3）：
 * - 三元键（§4.1 规则 1 :355，I15′）：accounts.<持有人>.<用途>.<资源种类>.<资源键> 是唯一存法——用途须是 purpose 条目、资源种类须是资源种类行
 *   （E-DIM-REF-MISSING），末层须是整数（E-DIM-STRUCT-FIELD）；
 * - 非负（规则 2 :356，I2′）：余额为负 E-LEDGER-NEGATIVE；
 * - 守恒式（规则 4 :362，I1′）：对每种资源，普通账户余额之和 = 来源累计之和 − 去处累计之和；不等即 E-LEDGER-UNBALANCED
 *   （规则 2 :356"这条式子是规则 4 守恒式的单笔形式……两条规则因此是同一条"，同一条规则同一码，不另造码）。
 *   ledgerTotals 下的代号不是 src/sink 条目即 E-LEDGER-CODE-UNREGISTERED（规则 3 :361）。整数相等，不设容差（A6-1.2 :399）。
 * @returns {{code: string, path: string, why: string}[]}
 */
function auditConservation(engine, state) {
  const out = [];
  const push = (code, path, why) => out.push({ code, path, why });
  const net = new Map(); // 资源种类 → BigInt（余额之和 − 来源累计 + 去处累计）
  const add = (kind, v) => net.set(kind, (net.get(kind) || 0n) + v);
  const all = readAt(state, [SCHEMA.accounts]);
  for (const h of Object.keys(isObj(all) ? all : {}).sort(cmp)) {
    const byPurpose = isObj(all[h]) ? all[h] : {};
    for (const p of Object.keys(byPurpose).sort(cmp)) {
      const pr = engine.vocab.index.get(p);
      if (!pr || pr.family !== SCHEMA.purpose) { push('E-DIM-REF-MISSING', `${SCHEMA.accounts}.${h}.${p}`, `${p} is not a ${SCHEMA.purpose} entry (three-key: holder.purpose.kind.key)`); continue; }
      const byKind = isObj(byPurpose[p]) ? byPurpose[p] : {};
      for (const k of Object.keys(byKind).sort(cmp)) {
        if (!isObj(readAt(ruleTable(engine.rules, SCHEMA.resourcesTable), [k]))) { push('E-DIM-REF-MISSING', `${SCHEMA.accounts}.${h}.${p}.${k}`, `${k} is not a resource kind row`); continue; }
        const byKey = isObj(byKind[k]) ? byKind[k] : {};
        for (const key of Object.keys(byKey).sort(cmp)) {
          const v = byKey[key];
          const path = `${SCHEMA.accounts}.${h}.${p}.${k}.${key}`;
          if (!Number.isSafeInteger(v)) { push('E-DIM-STRUCT-FIELD', path, 'balance is an integer'); continue; }
          if (v < 0) push('E-LEDGER-NEGATIVE', path, `balance ${v}`);
          add(k, BigInt(v));
        }
      }
    }
  }
  const totals = readAt(state, [SCHEMA.totals]);
  for (const k of Object.keys(isObj(totals) ? totals : {}).sort(cmp)) {
    for (const code of Object.keys(isObj(totals[k]) ? totals[k] : {}).sort(cmp)) {
      const rec = engine.vocab.index.get(code);
      const c = isObj(totals[k][code]) ? totals[k][code].cumulative : undefined;
      if (!rec || (rec.family !== SCHEMA.src && rec.family !== SCHEMA.sink)) { push('E-LEDGER-CODE-UNREGISTERED', `${SCHEMA.totals}.${k}.${code}`, `${code} is not a ${SCHEMA.src} or ${SCHEMA.sink} entry`); continue; }
      if (!Number.isSafeInteger(c)) continue; // 形状由 readTotalsCell 一段报
      add(k, rec.family === SCHEMA.src ? -BigInt(c) : BigInt(c));
    }
  }
  for (const [k, d] of [...net].sort((a, b) => cmp(a[0], b[0]))) {
    if (d !== 0n) push('E-LEDGER-UNBALANCED', `${SCHEMA.accounts}/${SCHEMA.totals}:${k}`, `sum balances - sum sources + sum sinks = ${d} (rule 4)`);
  }
  return out;
}

// ---------- 物理律通道预警（§4.1 规则 6 :375；李白 11-18 04:20 选 A：不单独存储，月结 closePeriod 派生写月报） ----------

/**
 * 纯函数：给定若干（资源种类、来源或去处代号、世界日、当日用量），对照 ledger.json 的 alert 派生逐日预警缺口 W-LEDGER-ALERT。
 * 只对物理律通道（budgetMode bm_physical）；alert 格缺或为空即不预警；用量大于 alert 才记。不截断、不拒单笔、不写状态、不经 report。
 * 逐日用量取自 ledgerTotals 的 usedByDay（post 写、dayUsage 读当日项）；按期汇集成 usage 并写进月报、写成功后清已结期逐日项归 3-3 closePeriod。
 * @param {{vocab: any, rules: any}} engine
 * @param {readonly {resource: string, flow: string, day: number, used: number}[]} usage
 * @returns {readonly {code: string, resource: string, flow: string, day: number, used: number, alert: number}[]} 按（资源种类、代号、日）升序
 */
export function alertGaps(engine, usage) {
  if (!Array.isArray(usage)) throw structErr('usage is a list of {resource, flow, day, used}');
  const alert = readAt(ruleTable(engine.rules, SCHEMA.ledgerTable), ['alert']);
  const out = [];
  for (const u of usage) {
    if (!fieldsWithin(u, USAGE_FIELDS) || USAGE_FIELDS.some((f) => !Object.hasOwn(u, f))) throw structErr('usage row is {resource, flow, day, used}');
    resourceRow(engine, u.resource, null);
    const rec = typeof u.flow === 'string' ? engine.vocab.index.get(u.flow) : undefined;
    if (!rec || (rec.family !== SCHEMA.src && rec.family !== SCHEMA.sink)) throw new KernelError('E-DIM-REF-MISSING', { entity: null }, `${JSON.stringify(u.flow)} is not a ${SCHEMA.src} or ${SCHEMA.sink} entry`);
    if (!Number.isSafeInteger(u.day) || u.day < 0 || !Number.isSafeInteger(u.used) || u.used < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'day and used are non-negative integers');
    if ((rec.entry || {}).budgetMode !== SCHEMA.physical) continue;
    const line = readAt(alert, [u.resource, u.flow]);
    if (Number.isInteger(line) && u.used > line) out.push(Object.freeze({ code: 'W-LEDGER-ALERT', resource: u.resource, flow: u.flow, day: u.day, used: u.used, alert: line }));
  }
  return Object.freeze(out.sort((a, b) => cmp(a.resource, b.resource) || cmp(a.flow, b.flow) || a.day - b.day));
}

// ---------- 读入口（§3.1：全部纯读，不开户、不入账、不写状态） ----------

/**
 * kernelApi `balance(holderId, resourceRef, purposeCode)`（§3.1 :253）：余额；账户未开即 0。资源与用途照 openAccount 同样核对。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {string} holderId @param {{kind: string, key: string}} resourceRef @param {string} purposeCode
 * @returns {number}
 */
export function balance(engine, state, holderId, resourceRef, purposeCode) {
  checkResource(engine, resourceRef, holderId);
  entryOf(engine, SCHEMA.purpose, purposeCode, holderId);
  const v = readAt(state, [SCHEMA.accounts, ...accountKey(holderId, resourceRef, purposeCode)]);
  return Number.isInteger(v) ? v : 0;
}

/**
 * 账本里至少开过一个账户的持有人，按代号码点序（只读）。卷六 :354 的 accountsOf 是"按持有人取"，要遍历全部持有人（如 itemRot 扫全账本）
 * 先取这份名单再逐人调 accountsOf；调用方不直读 state.accounts（卷六 :354 读只经读入口）。
 * @param {any} state @returns {readonly string[]}
 */
export function accountHolders(state) {
  const all = readAt(state, [SCHEMA.accounts]);
  return Object.freeze(Object.keys(isObj(all) ? all : {}).sort(cmp));
}

/**
 * kernelApi `accountsOf(holderId, {family, purpose})`（§3.1 :254；§4.1 规则 10 :381 库存是聚合视图）：该持有人的账户列表，
 * 可按资源族（resfam 条目）与用途（purpose 条目）筛；两项都可省。按（用途、资源种类、资源键）升序。
 * 按物品经济大类（卷三乙 §4.3 C-6）聚合要块 6 物品，现不提供（K3-10）。
 * @param {{vocab: any, rules: any}} engine @param {any} state @param {string} holderId
 * @param {{family?: string, purpose?: string}} [filter]
 * @returns {readonly {holder: string, resource: {kind: string, key: string}, purpose: string, balance: number}[]}
 */
export function accountsOf(engine, state, holderId, filter = {}) {
  if (typeof holderId !== 'string' || !CODE_RE.test(holderId)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'holder id is not a code');
  const f = isObj(filter) ? filter : {};
  for (const k of Object.keys(f)) if (!ACCOUNT_FILTER_FIELDS.includes(k)) throw new KernelError('E-DIM-STRUCT-FIELD', { entity: holderId }, `accountsOf filter field ${k}`);
  if (f.family !== undefined) entryOf(engine, SCHEMA.resfam, f.family, holderId);
  if (f.purpose !== undefined) entryOf(engine, SCHEMA.purpose, f.purpose, holderId);
  const byPurpose = readAt(state, [SCHEMA.accounts, holderId]);
  const out = [];
  for (const purpose of Object.keys(isObj(byPurpose) ? byPurpose : {}).sort(cmp)) {
    if (f.purpose !== undefined && purpose !== f.purpose) continue;
    const byKind = byPurpose[purpose];
    for (const kind of Object.keys(isObj(byKind) ? byKind : {}).sort(cmp)) {
      if (f.family !== undefined && resourceRow(engine, kind, holderId).family !== f.family) continue;
      const byKey = byKind[kind];
      for (const key of Object.keys(isObj(byKey) ? byKey : {}).sort(cmp)) {
        out.push(Object.freeze({ holder: holderId, resource: Object.freeze({ kind, key }), purpose, balance: byKey[key] }));
      }
    }
  }
  return Object.freeze(out);
}

/**
 * kernelApi `stockIn(scopePlaceId, resourceFilter)`（§3.1 :255；§4.1 规则 10 :381）：范围内原始存量，只数 visibleToMarket 为真的用途分区与在场持有人。
 * resourceFilter = {kind, key?}（资源种类必填，键可省即该种类全部键）。
 * 已做一半：只取 visibleToMarket 为真的分区、余额大于 0 的账户为候选；没有候选即 0（结果与范围、在场无关）。
 * 待块 6 一半（李白 11-18 02:20 K3-44）：持有人是否在 scopePlaceId 范围内、是否在场要读地点包含树与卷二 §2.5 谓词（块 5、6）。有候选时这一半读不到，
 * 按 onUnknown error 抛 E-DIM-UNKNOWN-READ，不当作"全部在场"或"全部不在"放过。
 * @param {{vocab: any, rules: any}} engine @param {any} state @param {string} scopePlaceId @param {{kind: string, key?: string}} resourceFilter
 * @returns {number}
 */
export function stockIn(engine, state, scopePlaceId, resourceFilter) {
  if (typeof scopePlaceId !== 'string' || !CODE_RE.test(scopePlaceId)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'scope place id is not a code');
  const rf = isObj(resourceFilter) ? resourceFilter : null;
  if (!rf || Object.keys(rf).some((k) => !RESOURCE_KEY_FIELDS.includes(k))) throw new KernelError('E-DIM-STRUCT-FIELD', { entity: scopePlaceId }, 'resourceFilter is {kind, key?}');
  resourceRow(engine, rf.kind, scopePlaceId);
  if (rf.key !== undefined && (typeof rf.key !== 'string' || !CODE_RE.test(rf.key))) throw new KernelError('E-DIM-ID-FORMAT', { entity: scopePlaceId }, 'resource key is not a code');
  const all = readAt(state, [SCHEMA.accounts]);
  let candidates = 0;
  for (const holder of Object.keys(isObj(all) ? all : {}).sort(cmp)) {
    for (const purpose of Object.keys(isObj(all[holder]) ? all[holder] : {}).sort(cmp)) {
      if (entryOf(engine, SCHEMA.purpose, purpose, holder).visibleToMarket !== true) continue;
      const byKey = readAt(all, [holder, purpose, rf.kind]);
      for (const key of Object.keys(isObj(byKey) ? byKey : {}).sort(cmp)) {
        if (rf.key !== undefined && key !== rf.key) continue;
        if (Number.isInteger(byKey[key]) && byKey[key] > 0) candidates += 1;
      }
    }
  }
  if (candidates === 0) return 0;
  throw new KernelError('E-DIM-UNKNOWN-READ', { entity: scopePlaceId, candidates }, 'stockIn: holder scope and presence are read in block 6 (K3-44); not counted as present or absent');
}

// ---------- ledger.json 生效日窗口（K3-40） ----------

/**
 * 某资源种类某通道代号在世界日 day 的日限额：budget 里没有这一格 → {active: true, limit: null}（空 = 不限，§2.5 :224）；
 * 有这一格而 day 在 [activeFromDay, activeToDay] 之外（两端缺省即全程）→ {active: false, limit: 0}；窗口内 → {active: true, limit}。
 * 只读规则表，不读状态（限额通道的日终分配归 3-3）。
 * @param {{vocab: any, rules: any}} engine @param {string} resourceKind @param {string} code @param {number} day 世界日（非负整数）
 * @returns {{active: boolean, limit: number | null}}
 */
export function budgetOn(engine, resourceKind, code, day) {
  if (!Number.isInteger(day) || day < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'day is a non-negative integer world day');
  resourceRow(engine, resourceKind, null);
  const cell = readAt(ruleTable(engine.rules, SCHEMA.ledgerTable), ['budget', resourceKind, code]);
  if (!isObj(cell)) return Object.freeze({ active: true, limit: null });
  const from = cell.activeFromDay === undefined ? 0 : cell.activeFromDay;
  const inside = day >= from && (cell.activeToDay === undefined || day <= cell.activeToDay);
  return Object.freeze(inside ? { active: true, limit: cell.limit } : { active: false, limit: 0 });
}

// ---------- 限额通道日终分配（§4.1 规则 6 :376；K3-45，块 3 第 3-3 张） ----------
// 只建分配函数：申请的存放（tradeRuns）与日终调用（settleTrade）归块 7（§4.6 规则 8 :579、:582；§5.3）。本文件不加申请状态键、不加日终钩子。

// 申请键：申请主体 id（规则 6），或按全序细分的元组（§4.6 规则 8 :582"（买方 id、计价资源键、货的资源键）"，第一键即申请主体 id）。
function requestKey(k, i) {
  const t = typeof k === 'string' ? [k] : k;
  if (!Array.isArray(t) || t.length === 0 || t.some((s) => typeof s !== 'string' || s === PATH.empty)) throw structErr(`request ${i}: key is a non-empty string or a list of them`);
  return t;
}
const cmpKey = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
  return a.length - b.length;
};

/**
 * 纯函数：限额通道一日的按比例分配（§4.1 规则 6 :376；§4.6 规则 8 第一步 :582 复用同一做法）。
 * requests = [{key, qty}]：key 是申请主体 id 或按全序细分的元组（逐段比较），qty 正整数；limit 是当日限额（非负整数）或 null（不限）。
 * 先汇总：同 key 的数量相加并成一条（:582"先归并"）。总量不超过 limit（或 limit 为 null）时全部照准；超过时
 * 各条 floor(数量 × limit ÷ 总量)，余数 limit − Σ 向下取整 按 key 升序逐个补一单位（:376）。结果只取决于申请集合，与给出次序无关。
 * @param {readonly {key: string | readonly string[], qty: number}[]} requests @param {number | null} limit
 * @returns {readonly {key: readonly string[], requested: number, granted: number}[]} 按 key 升序
 */
export function prorateCapped(requests, limit) {
  if (!Array.isArray(requests)) throw structErr('requests is a list of {key, qty}');
  if (limit !== null && !(Number.isSafeInteger(limit) && limit >= 0)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'limit is a non-negative integer or null');
  const merged = new Map();
  requests.forEach((r, i) => {
    if (!fieldsWithin(r, ['key', 'qty']) || !Object.hasOwn(r, 'key') || !Object.hasOwn(r, 'qty')) throw structErr(`request ${i} is {key, qty}`);
    if (!isPosInt(r.qty)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `request ${i}: qty is a positive integer`);
    const key = requestKey(r.key, i);
    const id = JSON.stringify(key);
    const m = merged.get(id) || { key, requested: 0 };
    m.requested += r.qty;
    if (!Number.isSafeInteger(m.requested)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `request ${i}: merged qty exceeds safe integer`);
    merged.set(id, m);
  });
  const rows = [...merged.values()].sort((a, b) => cmpKey(a.key, b.key));
  const total = rows.reduce((s, r) => s + BigInt(r.requested), 0n);
  if (limit === null || total <= BigInt(limit)) {
    return Object.freeze(rows.map((r) => Object.freeze({ key: Object.freeze([...r.key]), requested: r.requested, granted: r.requested })));
  }
  const granted = rows.map((r) => Number((BigInt(r.requested) * BigInt(limit)) / total));
  let rest = limit - granted.reduce((s, g) => s + g, 0);
  for (let i = 0; rest > 0; i++, rest--) granted[i] += 1;
  return Object.freeze(rows.map((r, i) => Object.freeze({ key: Object.freeze([...r.key]), requested: r.requested, granted: granted[i] })));
}

// 某资源种类某限额通道（budgetMode bm_capped）的词表条目核对（allocateCapped 与结算入口共用）：代号是 src/sink 条目、
// 在该种类行 sources/sinks 内、条目登记为限额通道。不合依次 E-DIM-REF-MISSING、E-LEDGER-CODE-UNREGISTERED、E-DIM-DOMAIN-ENUM。
function cappedChannel(engine, resourceKind, code) {
  const row = resourceRow(engine, resourceKind, null);
  const rec = typeof code === 'string' ? engine.vocab.index.get(code) : undefined;
  if (!rec || (rec.family !== SCHEMA.src && rec.family !== SCHEMA.sink)) throw new KernelError('E-DIM-REF-MISSING', { entity: null }, `${JSON.stringify(code)} is not a ${SCHEMA.src} or ${SCHEMA.sink} entry`);
  const listed = rec.family === SCHEMA.src ? row.sources : row.sinks;
  if (!Array.isArray(listed) || !listed.includes(code)) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', { entity: null }, `${code} is not in ${resourceKind} ${rec.family === SCHEMA.src ? 'sources' : 'sinks'}`);
  if ((rec.entry || {}).budgetMode !== SCHEMA.capped) throw new KernelError('E-DIM-DOMAIN-ENUM', { entity: null }, `${code} is not a ${SCHEMA.capped} channel`);
  return rec;
}

/**
 * 某资源种类某限额通道（budgetMode bm_capped）在世界日 day 的日终分配：当日限额照 budgetOn 读（格缺或 limit 空 = 不限；
 * 生效日窗口外按零计，§2.5 :224），再交 prorateCapped。代号不是 src/sink 条目 E-DIM-REF-MISSING、不在该种类行 sources/sinks 内
 * E-LEDGER-CODE-UNREGISTERED、不是限额通道 E-DIM-DOMAIN-ENUM。只读规则表，不读不写状态。
 * @param {{vocab: any, rules: any}} engine @param {string} resourceKind @param {string} code @param {number} day
 * @param {readonly {key: string | readonly string[], qty: number}[]} requests
 */
export function allocateCapped(engine, resourceKind, code, day, requests) {
  cappedChannel(engine, resourceKind, code);
  return prorateCapped(requests, budgetOn(engine, resourceKind, code, day).limit);
}

// ---------- 日终分配结算入口（卷六 §4.1 规则 6 :376；封卷后勘误 1118k13 续，李白 11-18 07:02 选丙；块 3 第 3-3c 张） ----------
// 卷文未给函数名（只写"日终分配函数"与"内核结算入口"），照 prorateCapped / allocateCapped 的命名起名 settleCappedAllocation，待勘误回补。

const SETTLE_FIELDS = Object.freeze(['code', 'day', 'limit', 'reason', 'requests', 'resourceKind', 'targets']);
const SETTLE_TARGET_FIELDS = Object.freeze(['account', 'key', 'lot']);
const settleErr = (why) => new KernelError('E-DIM-STRUCT-FIELD', { entity: null }, why);
const settleRef = (why) => new KernelError('E-DIM-REF-MISSING', { entity: null }, why);

/**
 * kernelApi `settleCappedAllocation({resourceKind, code, day, limit, reason, requests, targets})`（卷六 §4.1 规则 6 :376 限额通道条；
 * 封卷后勘误 1118k13 续、李白 11-18 07:02 选丙）：日终分配结算入口。输入某日某 bm_capped 来源的全部申请与日限额，交 prorateCapped 得分配结果，
 * 在同一事务内按结果逐申请者 `post` 入账（出账腿为该限额来源）；开局 src_genesis 第 0 日走同一入口，不另设记录（:376）。
 * - requests 照 prorateCapped：`[{key, qty}]`，key 是申请主体 id 或全序元组，qty 正整数。
 * - targets 是与 requests 的 key 一一对应的入账去处：`[{key, account: {holder, purpose, resource: {kind, key?}}, lot?}]`；
 *   给 0 的申请不入账（post 不收零腿），但仍须有对应 target（申请集合与去处集合须一一对应，缺、多、重都 E-DIM-REF-MISSING）。
 * - limit 是调用方给出的当日限额（非负整数或 null = 不限），只对 ledger.json 没有 budget 格的来源（边界供货，§4.6 规则 8 的日终步算定）采用。
 *   ledger.json 有该来源的 budget 格时，入口自己照 budgetOn 取限额：窗口内照表值、窗口外按零（§2.5 :224；:376"开局仅第 0 日"），
 *   调用方传的 limit 不采用——否则规则层在第 0 日之后传 null 就能绕过窗口不限量入账，正好违反规则 6 的"不在单笔上先到先得"。
 * - day 是结算的世界日，须等于 clockView 的当日：usedByDay 按当日记账（§4.1.1 :347），"日＋来源"判重放要对得上（:376）。
 * - 防重放：同日同来源只入账一次。判据从账本既有数据派生——`ledgerTotals.<资源种类>.<来源>.usedByDay` 有 `day` 等于该日的那一项即已入账
 *   （§4.1.1 :347 当日用量即取该项；:376"按日＋来源判"），不新开状态键。已入账即幂等返回 `{allocations, booked: 当日已记用量, alreadyBooked: true}`，
 *   不再 post。不作拒绝：本卷码表是错误码的唯一出处（:1625、:1629–1642），其中没有重放码，失败原因只用代号（S6-5 :328），故重跑只幂等地不重复记账。
 * - 分配按结果逐申请者 post，同一事务；任一申请者入账被拒，整笔（本事务）全成或全败。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {{resourceKind: string, code: string, day: number, limit: number | null, reason: string,
 *   requests: readonly {key: string | readonly string[], qty: number}[],
 *   targets: readonly {key: string | readonly string[], account: {holder: string, purpose: string, resource: {kind: string, key?: string}}, lot?: any}[]}} input
 * @returns {Readonly<{day: number, resource: string, source: string, allocations: readonly any[], booked: number, alreadyBooked: boolean}>}
 *   allocations：prorateCapped 的结果；booked：当日该来源在账本里的用量（本次入账之和，重跑时为既有值）
 */
export function settleCappedAllocation(engine, state, input) {
  try {
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: null }, 'settleCappedAllocation outside the transaction of this state');
    if (!fieldsWithin(input, SETTLE_FIELDS) || SETTLE_FIELDS.some((f) => !Object.hasOwn(input, f))) throw settleErr('settleCappedAllocation is {resourceKind, code, day, limit, reason, requests, targets}');
    if (!Number.isSafeInteger(input.day) || input.day < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'day is a non-negative integer world day');
    if (typeof input.reason !== 'string' || !CODE_RE.test(input.reason)) throw new KernelError('E-DIM-ID-FORMAT', { entity: null }, 'reason is a verb code');
    const rec = cappedChannel(engine, input.resourceKind, input.code);
    if (rec.family !== SCHEMA.src) throw settleRef(`${JSON.stringify(input.code)} is not a ${SCHEMA.src} entry (an allocation posts ${SCHEMA.src} legs)`);
    if (input.limit !== null && !(Number.isSafeInteger(input.limit) && input.limit >= 0)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'limit is a non-negative integer or null');
    // 日限额的出处按规则层定（卷六 §4.1 规则 6 :376、§2.5 :224）：ledger.json 有该来源的 budget 格，入口照 budgetOn 自己取
    // （窗口内照表值、窗口外按零），调用方传的 limit 不采用；没有 budget 格的来源（边界供货，§4.6 规则 8）才用传入值。
    const budgetCell = readAt(ruleTable(engine.rules, SCHEMA.ledgerTable), ['budget', input.resourceKind, input.code]);
    const limit = isObj(budgetCell) ? budgetOn(engine, input.resourceKind, input.code, input.day).limit : input.limit;
    const allocations = prorateCapped(input.requests, limit);

    // 申请集合与入账去处的对应（按 requestKey 的同一写法归并比较）。
    if (!Array.isArray(input.targets)) throw settleErr('targets is a list of {key, account, lot?}');
    const targetOf = new Map();
    input.targets.forEach((t, i) => {
      if (!fieldsWithin(t, SETTLE_TARGET_FIELDS) || !Object.hasOwn(t, 'key') || !Object.hasOwn(t, 'account')) throw settleErr(`targets[${i}] is {key, account, lot?}`);
      const k = JSON.stringify(requestKey(t.key, i));
      if (targetOf.has(k)) throw settleRef(`targets[${i}]: duplicate key ${k}`);
      targetOf.set(k, t);
    });
    const wanted = new Set(allocations.map((a) => JSON.stringify(a.key)));
    for (const k of wanted) if (!targetOf.has(k)) throw settleRef(`no target account for applicant ${k}`);
    for (const k of targetOf.keys()) if (!wanted.has(k)) throw settleRef(`target ${k} has no allocation request`);

    // 防重放：同日同来源的分配只入账一次（:376）。日＋来源从 usedByDay 的当日项派生；day 须就是当日，post 的 usedByDay 按 clockView 当日写（§4.1.1 :347）。
    const today = clockView(engine, state).day;
    if (input.day !== today) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `day ${input.day} is not the current world day ${today} (the day+source replay test reads the current day's usedByDay, vol6 s4.1.1 :347)`);
    const cell = readTotalsCell(state, input.resourceKind, input.code);
    const booked = cell.usedByDay.find((d) => d.day === input.day);
    const head = { day: input.day, resource: input.resourceKind, source: input.code, allocations };
    if (booked) return Object.freeze({ ...head, booked: booked.used, alreadyBooked: true });

    let total = 0;
    for (const a of allocations) {
      if (a.granted === 0) continue;
      const t = targetOf.get(JSON.stringify(a.key));
      const leg = { account: t.account, delta: a.granted };
      if (Object.hasOwn(t, 'lot')) leg.lot = t.lot;
      // 经入口内部路径入账：postDraft 的 viaAllocation 是本文件私有的，规则层没有可传的参数能置位（不是 draft 字段）。
      postDraft(engine, state, { legs: [leg, { flow: input.code, kind: input.resourceKind, qty: a.granted }], reason: input.reason }, true);
      total += a.granted;
    }
    return Object.freeze({ ...head, booked: total, alreadyBooked: false });
  } catch (e) {
    throw markDenied(e);
  }
}

// ---------- 月结账本侧（§4.22 规则 4 :1261 月结顺序；李白 11-18 04:20、04:22；S6-14 出报时派生、当期保留明细） ----------

/**
 * 月结账本侧：给定期末日 endDay（世界日整数，须早于 clockView 的当日），从 ledgerTotals 各格取 day ≤ endDay 的 usedByDay 项，经 alertGaps 派生预警缺口，
 * 交调用方传入的 writeReport({endDay, usage, gaps}) 写报（econReports 的写者是 economy-report.mjs，块 7）；writeReport 返回后
 * 才清掉这些逐日项、只留 cumulative（cumulative 不动）；writeReport 抛错即原样抛出、一项不清（写报失败不得清）。
 * 只在本状态的事务内写（E-VIEW-UNDECLARED-WRITE）。同一输入两次结果相同：只读状态与规则表，不读真实时间。
 * @param {{vocab: any, rules: any}} engine @param {any} state @param {number} endDay
 * @param {(r: {endDay: number, usage: readonly any[], gaps: readonly any[]}) => void} writeReport
 * @returns {Readonly<{endDay: number, usage: readonly any[], gaps: readonly any[], cleared: number}>} cleared：清掉的逐日项条数
 */
export function closeLedgerPeriod(engine, state, endDay, writeReport) {
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: null }, 'closeLedgerPeriod outside the transaction of this state');
  if (!Number.isSafeInteger(endDay) || endDay < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'endDay is a non-negative integer world day');
  // 期末日须早于当日：月结会清掉 day ≤ endDay 的 usedByDay 项，而同一天同一来源分配的重放判据正是当日那一项
  // （卷六 :376"按日＋来源判"、§4.1.1 :347）。允许结到当日乃至以后，规则层就能结期后重跑当日分配——当日项已清、
  // 重放判据失效而重复入账。码取卷二已定义的 E-DIM-DOMAIN-RANGE（本函数对 endDay 的取用域原本就报它；卷六码表无专属码，不新造）。
  const today = clockView(engine, state).day;
  if (endDay >= today) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, `endDay ${endDay} must be before the current world day ${today} (vol6 :376: closing the current day would erase the day+source replay test)`);
  if (typeof writeReport !== 'function') throw structErr('writeReport is the caller-supplied report writer');
  const totals = readAt(state, [SCHEMA.totals]);
  const usage = [];
  const keep = [];
  for (const kind of Object.keys(isObj(totals) ? totals : {}).sort(cmp)) {
    for (const code of Object.keys(isObj(totals[kind]) ? totals[kind] : {}).sort(cmp)) {
      const cell = readTotalsCell(state, kind, code);
      const closed = cell.usedByDay.filter((d) => d.day <= endDay);
      if (!closed.length) continue;
      for (const d of closed) usage.push(Object.freeze({ resource: kind, flow: code, day: d.day, used: d.used }));
      keep.push({ kind, code, cumulative: cell.cumulative, rest: cell.usedByDay.filter((d) => d.day > endDay) });
    }
  }
  const gaps = alertGaps(engine, usage);
  const report = Object.freeze({ endDay, usage: Object.freeze(usage), gaps });
  writeReport(report);
  for (const k of keep) {
    txSet(tx, [SCHEMA.totals, k.kind, k.code], { [SCHEMA.cumulative]: k.cumulative, [SCHEMA.usedByDay]: k.rest.map((d) => ({ day: d.day, used: d.used })) });
  }
  return Object.freeze({ ...report, cleared: usage.length });
}

// ---------- 批次合并与赃物份额（卷三乙 §3.3 "taint 的写者"、§4.4.3 K-3、K-4；块 6 第 6-3 张） ----------

/**
 * 资源种类行是否登记了某来源或去处代号（卷六 §2.1：来源与去处四字段只在账本读，A6-1.1）：其他模块问"这个种类能不能记这个来源或去处"只经本函数。
 * 种类没有行、没有该字段都答 false。
 * @param {{rules: any}} engine @param {string} kind 资源种类 @param {string} flow src 或 sink 代号
 * @returns {boolean}
 */
export function resourceAllows(engine, kind, flow) {
  const rows = ruleTable(engine.rules, SCHEMA.resourcesTable);
  const row = Object.hasOwn(rows, kind) ? rows[kind] : undefined;
  return isObj(row) && ((Array.isArray(row.sources) && row.sources.includes(flow)) || (Array.isArray(row.sinks) && row.sinks.includes(flow)));
}

// 批次属性里 K-3 判同的键与"受热或在燃烧则不并"的键（卷三乙 §4.4.3 K-3 :1037）；腐坏档与进度差是腐坏规则的事，由调用方先判。
const LOT_SAME_KEYS = Object.freeze(['source', 'qualityTier', 'purports', 'batchTag', 'material', 'project', SCHEMA.spot]);
const LOT_MUST_BE_EMPTY = Object.freeze(['temperature', 'burn', 'leakAnchorDay']);
// 腐坏字段归 item-lots.mjs（同一写者同一条规则，卷三乙 §3.3），合并时账本不碰。
const LOT_ROT_KEYS = Object.freeze(['spoilage', 'rotAnchorDay']);
const sameJson = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const emptyAttr = (v) => v === undefined || v === null;

// 两个量按非负整数数量加权平均：(a × qa + b × qb) ÷ (qa + qb)，定点向零截断到 4 位（权重恒为正，除数恒大于 0）。
function weightedMean(a, qa, b, qb) {
  const num = fixedAdd(fixedMultiply(fixedUnits(a), fixedUnits(qa)), fixedMultiply(fixedUnits(b), fixedUnits(qb)));
  return fixedToNumber(fixedDivide(num, fixedUnits(qa + qb)));
}

/**
 * kernelApi `lotsUnmergeable(a, b)`（纯函数，卷三乙 §4.4.3 K-3）：两批属性账本侧不能合并的原因（不合则为一句说明，可合并为 null）：
 * 判同键 source / qualityTier / purports / batchTag / material / project / spot 须全同（落点 spot 空对空视为同，落点不同不合并），temperature / burn / leakAnchorDay 须都为空，taint 须两批都写或都不写。
 * 腐坏档同档与进度差不超 rules.rot.mergeMaxGap 属腐坏规则，由调用方（item-lots.mjs）另判。
 * 属逐件实例的批次（批次键是实例批次键）不与任何批次合并（K-3 整类条件，勘误 1119k13）：两批的键都要给，判在属性之前。
 * @param {any} a @param {any} b @param {string} aKey a 的批次键 @param {string} bKey b 的批次键 @returns {string | null}
 */
export function lotsUnmergeable(a, b, aKey, bKey) {
  if (typeof aKey !== 'string' || typeof bKey !== 'string') throw structErr('lotsUnmergeable needs both lot keys');
  if (lotKeyInstance(aKey) !== null || lotKeyInstance(bKey) !== null) return 'an instance lot is one item and never merges (K-3)';
  for (const k of LOT_SAME_KEYS) if (!sameJson(a[k], b[k])) return `lots differ in ${k} (K-3 judges them apart)`;
  for (const k of LOT_MUST_BE_EMPTY) if (!emptyAttr(a[k]) || !emptyAttr(b[k])) return `${k} is non-empty (a heated, burning or leaking lot does not merge, K-3)`;
  if (emptyAttr(a[SCHEMA.taint]) !== emptyAttr(b[SCHEMA.taint])) return 'taint is written on both lots or neither';
  return null;
}

/**
 * kernelApi `mergeLots(engine, state, {holder, purpose, kind, into, from})`（卷三乙 §4.4.3 K-3；§3.3 "taint 的写者"合并一行）：
 * 同一账户同一种类的两个批次并成一个：把 from 的余额并入 into，删去 from 的余额行与批次行（数量为 0 的批次即删除，卷六 §2.3）。
 * 账本只判与腐坏无关的条件——判同键 source / qualityTier / purports / batchTag / material / project / spot 全同、temperature / burn / leakAnchorDay 都为空、
 * 两批余额都为正；任一不合整笔拒。腐坏档同档与进度差不超 rules.rot.mergeMaxGap 由调用方先判，两批的 spoilage、rotAnchorDay 由它们的声明写者
 * （item-lots.mjs）在本笔之后重设，账本不碰（§3.3 两条路径各一个写者）。
 * 账本改写：taint 按两批余额（同一种物品、判同键含 material 相同，故件数之比即质量之比）加权平均（定点 4 位向零截断，除数恒大于 0）；
 * oreGrade 按数量加权平均、有一批为空结果即为空（未知不顶替）；enteredDay 取较早者；costBasis 两批都有则相加、否则不写（未知不顶替）。其余属性取 into 的。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {{holder: string, purpose: string, kind: string, into: string, from: string}} m
 * @returns {Readonly<{into: string, qty: number}>}
 */
export function mergeLots(engine, state, m) {
  try {
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: null }, 'mergeLots outside the transaction of this state');
    if (!fieldsWithin(m, ['holder', 'purpose', 'kind', 'into', 'from']) || ['holder', 'purpose', 'kind', 'into', 'from'].some((f) => typeof m[f] !== 'string')) throw structErr('mergeLots is {holder, purpose, kind, into, from}');
    if (m.into === m.from) throw structErr('mergeLots into and from are different lots');
    const row = resourceRow(engine, m.kind, m.holder);
    if (row.family !== SCHEMA.lotFamily) throw new KernelError('E-DIM-REF-MISSING', { entity: m.holder }, `${m.kind} is not a ${SCHEMA.lotFamily} resource`);
    checkSubject(engine, state, m.holder);
    const seg = (k) => [m.holder, m.purpose, m.kind, k];
    const A = readAt(state, [SCHEMA.stockLots, ...seg(m.into)]);
    const B = readAt(state, [SCHEMA.stockLots, ...seg(m.from)]);
    const qa = readAt(state, [SCHEMA.accounts, ...seg(m.into)]);
    const qb = readAt(state, [SCHEMA.accounts, ...seg(m.from)]);
    if (!isObj(A) || !isObj(B)) throw new KernelError('E-DIM-REF-MISSING', { entity: m.holder }, 'mergeLots: both lots have a stockLots row');
    if (!isPosInt(qa) || !isPosInt(qb)) throw new KernelError('E-LEDGER-NEGATIVE', { entity: m.holder }, 'mergeLots: both lots have a positive balance (a zero lot is deleted, not merged)');
    const why = lotsUnmergeable(A, B, m.into, m.from);
    if (why !== null) throw structErr(`mergeLots: ${why}`);
    const next = { ...A };
    if (!emptyAttr(A[SCHEMA.taint])) next[SCHEMA.taint] = weightedMean(A[SCHEMA.taint], qa, B[SCHEMA.taint], qb);
    if (emptyAttr(A.oreGrade) || emptyAttr(B.oreGrade)) { if (Object.hasOwn(next, 'oreGrade')) next.oreGrade = null; } else next.oreGrade = weightedMean(A.oreGrade, qa, B.oreGrade, qb);
    if (Number.isInteger(A.enteredDay) && Number.isInteger(B.enteredDay)) next.enteredDay = Math.min(A.enteredDay, B.enteredDay);
    if (Number.isInteger(A[SCHEMA.costBasis]) && Number.isInteger(B[SCHEMA.costBasis])) next[SCHEMA.costBasis] = A[SCHEMA.costBasis] + B[SCHEMA.costBasis];
    else delete next[SCHEMA.costBasis];
    for (const k of LOT_ROT_KEYS) if (Object.hasOwn(A, k)) next[k] = A[k];
    txSet(tx, [SCHEMA.stockLots, ...seg(m.into)], next);
    txSet(tx, [SCHEMA.accounts, ...seg(m.into)], qa + qb);
    txDelete(tx, [SCHEMA.accounts, ...seg(m.from)]);
    txDelete(tx, [SCHEMA.stockLots, ...seg(m.from)]);
    return Object.freeze({ into: m.into, qty: qa + qb });
  } catch (e) {
    throw markDenied(e);
  }
}

/**
 * kernelApi `recordTaint(engine, state, {target, taint, cause})`（卷三乙 §3.3 "taint 的写者"表：改赃份额与实例初值两行）：
 * 账本是 taint 的唯一写者。target 是 {instance: 实例 id} 或 {lot: {holder, purpose, kind, lotKey}}；taint ∈ [0, 1]。
 * cause 是登记的 verb 代号（入赃、消赃的法律程序，卷八b 经原语执行器提交；写法同 post 的 reason）：给了即"改赃份额"，只改值、不改数量；
 * cause 为 null 只许在实例还没有 taint 时写初值（建实例那一笔，§3.3 "其他来源的入账 写初值"），已有值再写 null 即拒。批次的初值由 post 的 attrs 带入，这里不重复。
 * @param {{vocab: any, rules: any}} engine @param {any} state
 * @param {{target: {instance: string} | {lot: {holder: string, purpose: string, kind: string, lotKey: string}}, taint: number, cause: string | null}} r
 */
export function recordTaint(engine, state, r) {
  try {
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: null }, 'recordTaint outside the transaction of this state');
    if (!fieldsWithin(r, ['target', 'taint', 'cause']) || !Object.hasOwn(r, 'target') || !Object.hasOwn(r, 'taint') || !Object.hasOwn(r, 'cause')) throw structErr('recordTaint is {target, taint, cause}');
    if (typeof r.taint !== 'number' || !taintOk(r.taint)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: null }, 'taint is a number in [0, 1]');
    if (r.cause !== null) {
      const rec = typeof r.cause === 'string' ? engine.vocab.index.get(r.cause) : undefined;
      if (!rec || rec.family !== SCHEMA.verb) throw new KernelError('E-EVT-VERB', { entity: null }, `recordTaint cause ${JSON.stringify(r.cause)} is not a registered verb`);
    }
    const t = r.target;
    if (isObj(t) && fieldsWithin(t, [TARGET.instance]) && Object.hasOwn(t, TARGET.instance)) {
      const row = readAt(state, [ITEM.instances, t[TARGET.instance]]);
      if (!isObj(row)) throw new KernelError('E-DIM-REF-MISSING', { entity: null }, `${JSON.stringify(t[TARGET.instance])} is not an item instance`);
      if (r.cause === null && Object.hasOwn(row, SCHEMA.taint)) throw structErr('recordTaint: an instance taint is set once at creation (cause null); changing it needs a cause');
      txSet(tx, [ITEM.instances, t[TARGET.instance], SCHEMA.taint], r.taint);
      return;
    }
    if (isObj(t) && fieldsWithin(t, [TARGET.lot]) && isObj(t[TARGET.lot])) {
      if (r.cause === null) throw structErr('recordTaint: a lot taint is set by post attrs at creation; changing it needs a cause');
      const { holder, purpose, kind, lotKey } = t[TARGET.lot];
      const attrs = readAt(state, [SCHEMA.stockLots, holder, purpose, kind, lotKey]);
      if (!isObj(attrs)) throw new KernelError('E-DIM-REF-MISSING', { entity: holder }, `lot ${lotKey} has no ${SCHEMA.stockLots} row`);
      checkSubject(engine, state, holder);
      txSet(tx, [SCHEMA.stockLots, holder, purpose, kind, lotKey, SCHEMA.taint], r.taint);
      return;
    }
    throw structErr('recordTaint target is {instance} or {lot: {holder, purpose, kind, lotKey}}');
  } catch (e) {
    throw markDenied(e);
  }
}
