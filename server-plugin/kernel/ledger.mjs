// 账本骨架（卷六 §4.1 账本三元键与守恒；§2.1 账户与资源种类；§2.2 词表族；§2.5 ledger.json；§3.1 读入口；§3.3 唯一写者）。
// 块 3 第 3-1 张：三元键、开户 openAccount、读入口 balance / accountsOf / stockIn、资源种类表与本卷词表族的加载校验 checkLedgerTables、
// ledger.json 生效日窗口的读法 budgetOn。入账 post / transfer、批次存储归 3-2，限额通道日终分配与守恒不变量归 3-3。
// 新账本一开始就是唯一写者（方案 R5）：accounts.*、outflowTotals.* 的写者只有本文件（state-owners.json；ledgerTotals.* 的登记等李白裁定，见回报）。
// 只读登记数据（资源种类行、词表条目字段、规则表），不认任何具体资源、来源去处代号、用途或实体 id（AGENTS 红线）；
// 下面 SCHEMA 是卷六定义的族名、封闭族条目与账户字段的类型，不是内容数据。资源种类行的 transferable、counterpartRX、sources、sinks
// 四个字段只在本文件读（A6-1.1 :398）。

import { ruleTable } from './load/rules.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { kindOf } from './vocab.mjs';
import { KernelError, codeOf } from './errors.mjs';
import { currentTransaction } from './transaction.mjs';
import { TERMINATED_KEY } from './storage.mjs';
import { invalidateMemo } from './memo.mjs';

// ---------- 卷六定义的结构常量 ----------

export const SCHEMA = Object.freeze({
  // 规则表代号（world/rules/registry.json；文件 world/rules/tables/economy/ resources.json、ledger.json，卷六 §2.1 :108、§2.5 :224）。
  resourcesTable: 'economyResources',
  ledgerTable: 'economyLedger',
  // 词表族名（卷六 §2.2 :128–132；resource 族归卷二 §1.9）。
  resource: 'resource', resfam: 'resfam', purpose: 'purpose', src: 'src', sink: 'sink', budgetMode: 'budget_mode',
  indicator: 'indicator', ckind: 'ckind',
  // budget_mode 封闭两项的含义（§2.2 :131）：限额通道只进 budget，物理律通道只进 alert（§2.5 :224）。
  capped: 'bm_capped', physical: 'bm_physical',
  // transferability：只有 tr_restricted 带对手条件（§2.1 :114–115）。
  restricted: 'tr_restricted',
  // 账户 holder 的类型（§2.1 :103）：ref refs[kind person, kind org, kind place, kind faith, kind deity]；faith、deity 两表的登记行只用于点数类。
  holderKinds: Object.freeze(['deity', 'faith', 'org', 'person', 'place']),
  catalogKinds: Object.freeze(['deity', 'faith']),
  catalogFamily: 'resfam_point',
  // 状态顶层键（§3.3 :305）。
  accounts: 'accounts',
  // 条目上的文档字段（不参与规则；grade 取卷三甲 §2.1 来源级别）。
  docFields: Object.freeze(['basis', 'grade']),
  grades: Object.freeze(['designed', 'measured', 'referenced']),
});

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
  if (!isObj(resource) || Object.keys(resource).sort().join(',') !== 'key,kind') throw new KernelError('E-DIM-ID-FORMAT', { entity: codeOrNull(holder) }, 'resource must be {kind, key}');
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
        if (e && e.budgetMode !== mode) push('E-DIM-DOMAIN-ENUM', ledTable, key, dim, e.budgetMode, `${key} holds ${mode} channels only (卷六 §2.5 :224)`);
        const c = cells[code];
        if (key === 'budget' && isObj(c) && Number.isInteger(c.activeFromDay) && Number.isInteger(c.activeToDay) && c.activeFromDay > c.activeToDay) {
          push('E-DIM-DOMAIN-RANGE', ledTable, key, `${dim}/activeFromDay`, [c.activeFromDay, c.activeToDay], 'activeFromDay ≤ activeToDay (world days)');
        }
      }
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
  if (!isObj(resource) || Object.keys(resource).sort().join(',') !== 'key,kind') throw new KernelError('E-DIM-ID-FORMAT', { entity: codeOrNull(holder) }, 'resource must be {kind, key}');
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

// 事务内写（记撤销项，与 kernel/storage.mjs 同一撤销格式；账本路径不经 writePath，卷二 §2.6 第 4 条）。
function setInTx(tx, segs, value) {
  let cur = tx.state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!Object.hasOwn(cur, s) || !isObj(cur[s])) {
      tx.undo.push({ segs: segs.slice(0, i + 1), existed: Object.hasOwn(cur, s), prev: cur[s] });
      cur[s] = {};
    }
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  tx.undo.push({ segs: [...segs], existed: Object.hasOwn(cur, last), prev: cur[last] });
  cur[last] = value;
  tx.written.push([...segs]);
  invalidateMemo(tx.state);
}

// 被拒即在当前事务上记"已被拒"：规则层 catch 住也照样整笔回滚（卷二 §2.6"事务内拒写的处置"）。
function denied(e) {
  const tx = currentTransaction();
  if (tx && codeOf(e) !== null && tx.denied === undefined) tx.denied = e;
  return e;
}

// ---------- 写入口 ----------

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
    let kind;
    try { kind = kindOf(holderId); } catch (e) {
      if (codeOf(e) !== 'E-DIM-REF-MISSING') throw e;
      throw new KernelError('E-DIM-UNKNOWN-READ', { entity: holderId }, `holder ${holderId} is not a loaded entity (onUnknown error, 卷六 §2.1 :103; entity tables load in block 6, K3-44)`);
    }
    if (!SCHEMA.holderKinds.includes(kind)) throw new KernelError('E-DIM-REF-MISSING', { entity: holderId }, `holder kind ${kind} is not one of ${SCHEMA.holderKinds.join(', ')}`);
    if (SCHEMA.catalogKinds.includes(kind) && row.family !== SCHEMA.catalogFamily) throw new KernelError('E-DIM-REF-MISSING', { entity: holderId }, `${kind} catalog rows hold ${SCHEMA.catalogFamily} only`);
    const marks = isObj(state) ? state[TERMINATED_KEY] : undefined;
    if (isObj(marks) && Object.hasOwn(marks, holderId)) throw new KernelError('E-TERM-RESIDUE', { entity: holderId }, `holder ${holderId} is terminated`);
    const key = accountKey(holderId, resourceRef, purposeCode);
    const segs = [SCHEMA.accounts, ...key];
    if (Number.isInteger(readAt(state, segs))) return key;
    const tx = currentTransaction();
    if (!tx || tx.state !== state) throw new KernelError('E-VIEW-UNDECLARED-WRITE', { entity: holderId }, 'openAccount outside the transaction of this state');
    setInTx(tx, segs, 0);
    return key;
  } catch (e) {
    throw denied(e);
  }
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
  for (const k of Object.keys(f)) if (k !== 'family' && k !== 'purpose') throw new KernelError('E-DIM-STRUCT-FIELD', { entity: holderId }, `accountsOf filter field ${k}`);
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
  if (!rf || Object.keys(rf).some((k) => k !== 'kind' && k !== 'key')) throw new KernelError('E-DIM-STRUCT-FIELD', { entity: scopePlaceId }, 'resourceFilter is {kind, key?}');
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
