// 实体终止协议与复生（内核组）：卷二《维度表规范与统一入口》§2.6 "实体终止协议（通用原语，唯一定义）" :519–:525、
// "可终止实体类" :526、"领域清理的两个登记点" :527–:529、"窗口期满" :530、"复生窗口与复生步骤" :531；§2.7 kernelApi :599–:602；
// 卷六《经济》§4.1 规则 9 :380（持有人终止按本协议分流余额，不存在"人死钱没"）；卷十八《社会关系与家族》R18-1.2 :518、R18-1.3 :519、
// R18-1.8 :524（协议甲、协议乙、候补顺序）；卷二十《时间日历天气与环境》到期项 cancel 与 due_revive_window 条目；卷九 R9-2.7 :667。
// 李白 11-18 22:10 块 5 体检裁定：丙3（块 5 只读 state.terminated）、丙4（去留表无明文的不自拟）、丙7（带 record 的边关闭整笔拒收）；
// 总原则：不造桩、不放空，写者没上线明确拒收 E-ACT-WRITER-NOT-READY 并挂卡。
//
// 边界与已定：
// - 写直接落在调用方已开的内核事务上，不自开事务；任一步失败抛带登记码的错误，由事务整笔回滚（:519"任一步失败整笔回滚"）。
// - 第 1 步读实体所属类别行的 `termination`（行字段，卷二 §5.0；不是维度，不经 dim）：沿实体行 classes 与类别行 extends 取，
//   取不到即不可终止实体类（:526 ③），E-DIM-REQUIRED-MISSING。实体表未载入（块 6/7 才建）即 E-ACT-WRITER-NOT-READY。
// - 后继：`inherit` 按 successorRX 求值（读存储值，经 dim 绑定），结果须是已载入、未终止、非本体的实体 id，否则"算不出后继"退为 `wreck`。
//   `liquidate`（债权人，卷六合同未建）与 `wreck`（生成残骸实体要建行写者，未上线）整笔拒收 E-ACT-WRITER-NOT-READY。
// - 第 3 步 `onTerminate = successor` 经账本 transfer 转给后继（reason 取 cause，它是 verb 句柄）；`sink` 没有单值去处登记
//   （资源行 sinks 是允许的去处集合，卷六 :117），登记在 rules.terminate.unbuilt，拒收报 E-ACT-WRITER-NOT-READY（李白 11-19 11:1x ③）；
//   `remains` 只对残骸成立（残骸未上线）。
// - 第 4 步持有边只经持有写者（kernel/holdings.mjs）关闭：持有写者没有协议转移入口，凡须"转给后继/候补/授予者"的格整笔拒收
//   E-ACT-WRITER-NOT-READY；候补列表为空或全已终止、授予者为空或已终止，按"关闭"（R18-1.2、R18-1.8）。带 record 的边由持有写者照丙7 拒收。
// - 第 5 步状态实例与运行态修正项的容器在块 6（卷二 §1.11）：块 5 的 state 没有这两个键；若见到该实体名下有条目即拒收，不静默跳过。
// - 清理函数、候补顺序入口由规则层经 kernelApi 交入（与 registerAdvanceHook 同法：带 `<文件>#<函数>` 登记名，内核不 import 规则层）；
//   声明表（stateKeys.subjectRecords、systems.*.terminationCleanup）由统一加载器在加载通过时经 installTermination 交入（kernel/load/world.mjs，与 installStorage 同法；5-7 接线）。
// - 不按实体 id、类别名、种类名开分支：一切只读类别行、种类行、资源种类行与去留表。

import { KernelError, codeOf } from './errors.mjs';
import { currentTransaction } from './transaction.mjs';
import { invalidateMemo } from './memo.mjs';
import { TERMINATED_KEY } from './storage.mjs';
import { emit } from './events.mjs';
import { kindOfEntity } from './vocab.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { isModuleFile } from './handles/keys.mjs';
import { T, GRAMMAR_TOKENS } from './handles/markers.mjs';
import { compileRXInScope, evaluateRX } from './rx.mjs';
import { rxBindings, rowClassesOf } from './dimensions.mjs';
import { ruleTable } from './load/rules.mjs';
import { accountsOf, transfer } from './ledger.mjs';
import { closeHolding } from './holdings.mjs';
import { schedule, cancel, clockView, minutesPerDay } from './scheduler.mjs';

// 定义源只此一份：路径键、表名、协议代号。verb 两行与 due_revive_window 条目由卷二、卷二十登记（:524、:530）。
const S = Object.freeze({
  accounts: 'accounts',
  holdings: 'holdings',
  due: 'due',
  revivals: 'revivals',
  pointsKey: 'points',
  statuses: 'statuses',
  modifiers: 'modifiers',
  verbFamily: 'verb',
  holdingFamily: 'holding_kind',
  terminatedVerb: 'verb_entity_terminated',
  revivedVerb: 'verb_entity_revived',
  windowDueKind: 'due_revive_window',
  position: 'pos.kernel',
  visibility: 'private',
  rulesTable: 'terminate',
  recordsKey: 'records',
  unbuiltKey: 'unbuilt',
  resourcesTable: 'economyResources',
  kernelConstants: 'kernelConstants',
  rxMaxDepth: 'rxMaxDepth',
  dataProfile: 'data',
  fnSep: '#',
  serverRoot: 'server-plugin/',
});
const TERMINATION_FIELDS = Object.freeze(['mode', 'successorRX', 'reviveWindowDays']);
const CLEANUP_FIELDS = Object.freeze(['handler', 'kinds', 'sortKey']);
const RECORD_FIELDS = Object.freeze({ subject: ['recordClass', 'subjectSegments'] });
// 持有种类行"持有者终止"格（R18-1.2）里本卡执行的两类：关闭；按候补顺序移交与回到授予者在接班人为空或已终止时按关闭（R18-1.2、R18-1.8）。
const HANDOVER = Object.freeze({ close: 'ho_close', succeed: 'ho_succeed', revert: 'ho_revert' });
const MODE = T.code_enum.successor_mode;
const ACCOUNT = T.code_enum.term_account;
const KEEP = T.code_enum.term_record;
const REVIVE = T.code_enum.revive_record;
const CODE = Object.freeze({
  residue: 'E-TERM-RESIDUE',
  reviveDenied: 'E-TERM-REVIVE-DENIED',
  unlisted: 'E-TERM-RECORD-UNLISTED',
  notReady: 'E-ACT-WRITER-NOT-READY',
  required: 'E-DIM-REQUIRED-MISSING',
  struct: 'E-DIM-STRUCT-FIELD',
  refMissing: 'E-DIM-REF-MISSING',
  verb: 'E-EVT-VERB',
  undeclaredWrite: 'E-VIEW-UNDECLARED-WRITE',
  duplicate: 'E-WRITER-DUPLICATE',
  idFormat: 'E-DIM-ID-FORMAT',
});

const TYPEOF_STRING = typeof S.due;
const TYPEOF_FUNCTION = typeof (() => {});
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCode = (v) => typeof v === TYPEOF_STRING && CODE_RE.test(v);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function deny(code, detail, entity = null) {
  return new KernelError(code, { entity }, detail);
}

// ---------- 登记（kernelApi；与 registerAdvanceHook 同法） ----------

/** @type {Map<string, Function>} 清理函数：`<文件>#<函数>` → 函数 */
const cleanups = new Map();
/** @type {Map<string, Function>} 候补顺序入口：succeedBy 取值 → 函数 */
const orders = new Map();
/** @type {null | {stateKeys: Record<string, any>, systems: Record<string, any>}} */
let declared = null;
let inCleanup = false;

function refParts(ref) {
  const at = typeof ref === TYPEOF_STRING ? ref.indexOf(S.fnSep) : -1;
  return at < 0 ? null : { file: ref.slice(0, at), fn: ref.slice(at + S.fnSep.length) };
}

// 声明表里全部清理登记的 handler 格（`<文件>#<函数>`）。
function declaredCleanupRefs(systems) {
  const refs = new Set();
  for (const name of Object.keys(systems)) {
    const c = isObj(systems[name]) ? systems[name].terminationCleanup : undefined;
    if (isObj(c) && typeof c.handler === TYPEOF_STRING) refs.add(c.handler);
  }
  return refs;
}

/**
 * kernelApi `registerTerminationCleanup(ref, handler)`（卷二 §2.6 :528，勘误 1118k30；与 registerAdvanceHook 同形）：规则层在模块加载时交入登记在
 * `systems.<名>.terminationCleanup.handler` 的清理函数；ref 即那一格的 `<文件>#<函数>`（文件相对 server-plugin/）。同一 ref 交两次即 E-WRITER-DUPLICATE；
 * 声明表已交入而 ref 对不上任何登记格即 E-DIM-REF-MISSING（声明表后交入时由 installTermination 补核）。
 * @param {string} ref @param {(engine: any, state: any, info: {id: string, cause: string, mode: string, successorId: string | null}) => void} handler
 */
export function registerTerminationCleanup(ref, handler) {
  const p = refParts(ref);
  if (!p || !isModuleFile(p.file) || p.fn.length === 0) throw deny(CODE.struct, `registerTerminationCleanup: ${JSON.stringify(ref)} is not <file>#<function>`);
  if (typeof handler !== TYPEOF_FUNCTION) throw deny(CODE.struct, `registerTerminationCleanup ${ref}: handler must be a function`);
  if (cleanups.has(ref)) throw deny(CODE.duplicate, `registerTerminationCleanup: ${ref} already registered`);
  if (declared && !declaredCleanupRefs(declared.systems).has(ref)) throw deny(CODE.refMissing, `registerTerminationCleanup: ${ref} matches no systems.*.terminationCleanup.handler`);
  cleanups.set(ref, handler);
}

/**
 * kernelApi `registerSuccessionOrder(succeedBy, handler)`（卷二 §2.6 :523 第 4 步 ①；卷十八 R18-1.8 :524）：按种类行 `succeedBy` 的取值交入顺序提供入口。
 * 入口是纯读函数 `handler(engine, state, edge)`（edge 为该持有边记录 struct:holding），返回 struct:entityOrder（有序实体 id 列表，前者优先）。
 * @param {string} succeedBy @param {(engine: any, state: any, edge: any) => string[]} handler
 */
export function registerSuccessionOrder(succeedBy, handler) {
  if (!isCode(succeedBy)) throw deny(CODE.idFormat, `registerSuccessionOrder: ${JSON.stringify(succeedBy)} is not a succession_source code`);
  if (typeof handler !== TYPEOF_FUNCTION) throw deny(CODE.struct, `registerSuccessionOrder ${succeedBy}: handler must be a function`);
  if (orders.has(succeedBy)) throw deny(CODE.duplicate, `registerSuccessionOrder: ${succeedBy} already registered`);
  orders.set(succeedBy, handler);
}

/** 去留表所在的规则表代号（定义源仍是本文件 S.rulesTable；加载器据它判该表登记了没有，kernel 组内用）。 */
export const TERMINATE_RULES_TABLE = S.rulesTable;

/**
 * 挂接时交入声明表（state-owners.json 的 stateKeys 与 systems；kernel 组内用，不在 kernelApi；与 installStorage 同法）。
 * @param {{stateKeys?: Record<string, any>, systems?: Record<string, any>}} decl
 */
export function installTermination(decl) {
  const next = { stateKeys: isObj(decl) && isObj(decl.stateKeys) ? decl.stateKeys : {}, systems: isObj(decl) && isObj(decl.systems) ? decl.systems : {} };
  // 已交入的清理函数逐个对声明表的 handler 格核一致，对不上拒（李白 11-19 11:1x ②）。
  const refs = declaredCleanupRefs(next.systems);
  const stray = [...cleanups.keys()].filter((r) => !refs.has(r)).sort(cmp);
  if (stray.length) throw deny(CODE.refMissing, `registered termination cleanups match no systems.*.terminationCleanup.handler: ${stray.join(', ')}`);
  declared = next;
}

/** 测试与重新挂接用：清掉交入的声明表、清理函数与候补顺序入口（kernel 组内用）。 */
export function resetTermination() {
  declared = null;
  cleanups.clear();
  orders.clear();
}

function needDecl() {
  if (!declared) throw deny(CODE.notReady, 'termination protocol needs installTermination (declaration table not mounted)');
  return declared;
}

function needTx(state) {
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw deny(CODE.undeclaredWrite, 'terminate/revive outside the transaction of this state');
  return tx;
}

// 事务内写、删（撤销项与 kernel/ledger.mjs、kernel/scheduler.mjs 同一格式；value 为 undefined 即删）。
function txSet(tx, segs, value) {
  let cur = tx.state;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const s = segs[i];
    if (!own(cur, s) || !isObj(cur[s])) {
      tx.undo.push({ segs: segs.slice(0, i + 1), existed: Object.hasOwn(cur, s), prev: cur[s] });
      cur[s] = {};
    }
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  tx.undo.push({ segs: [...segs], existed: Object.hasOwn(cur, last), prev: cur[last] });
  if (value === undefined) delete cur[last]; else cur[last] = value;
  tx.written.push([...segs]);
  invalidateMemo(tx.state);
}

const marksOf = (state) => (isObj(state) && isObj(state[TERMINATED_KEY]) ? state[TERMINATED_KEY] : {});
const isMarked = (state, id) => Object.hasOwn(marksOf(state), id);

// ---------- 第 1 步：类别行 termination 与后继 ----------

function entityKind(state, id) {
  if (!isCode(id)) throw deny(CODE.idFormat, `entity id ${JSON.stringify(id)} is not a code`);
  try { return kindOfEntity(state, id); } catch (e) {
    if (codeOf(e) !== null) throw deny(CODE.refMissing, `${id} is not a loaded or created entity`, id);
    throw e;
  }
}

// 类别行的 termination（行字段，§5.0）：实体行（或偏离行）声明的类别，沿 extends 链取第一个写了 termination 的类别行。
// 多个类别给出不同值即无法定行，按读不到处理（E-DIM-REQUIRED-MISSING），不按先后挑一个。
function terminationOf(engine, state, kind, id) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  if (!t || !isObj(t.doc)) throw deny(CODE.notReady, `entity table ${kind} is not loaded (entity tables load in block 6/7)`, id);
  const doc = t.doc;
  const classes = isObj(doc.classes) ? doc.classes : {};
  // 声明的类别：实体行或生成行手写的；没写则由表头 classesFrom 指的维度（人物表：物种）所指行的类别派生，不存储。
  const declaredClasses = rowClassesOf(engine, state, t, id);
  const found = new Map();
  for (const c of declaredClasses) {
    const seen = new Set();
    let cur = c;
    while (typeof cur === TYPEOF_STRING && !seen.has(cur) && isObj(classes[cur])) {
      seen.add(cur);
      if (own(classes[cur], T.row_field.termination)) { found.set(JSON.stringify(classes[cur][T.row_field.termination]), classes[cur][T.row_field.termination]); break; }
      cur = classes[cur][T.row_field.extends];
    }
  }
  if (found.size !== 1) throw deny(CODE.required, `${kind} ${id}: declared class rows give ${found.size} distinct termination values (want exactly 1; none = not a terminable entity class)`, id);
  const term = found.values().next().value;
  if (!isObj(term) || Object.keys(term).sort(cmp).join() !== [...TERMINATION_FIELDS].sort(cmp).join()) throw deny(CODE.struct, `${kind} ${id}: termination is {mode, successorRX, reviveWindowDays}`, id);
  if (!MODE.is(term.mode)) throw deny(CODE.struct, `${kind} ${id}: termination.mode is a successor_mode`, id);
  if (!(term.successorRX === null || typeof term.successorRX === TYPEOF_STRING)) throw deny(CODE.struct, `${kind} ${id}: termination.successorRX is rx or null`, id);
  if (!Number.isSafeInteger(term.reviveWindowDays) || term.reviveWindowDays < 0) throw deny(CODE.struct, `${kind} ${id}: termination.reviveWindowDays is an integer >= 0`, id);
  return term;
}

/** @type {WeakMap<object, Map<string, object | null>>} */
const rxCache = new WeakMap();

function compileSuccessor(engine, kind, text) {
  let cache = rxCache.get(engine);
  if (!cache) { cache = new Map(); rxCache.set(engine, cache); }
  const key = `${kind}${S.fnSep}${text}`;
  if (cache.has(key)) return cache.get(key);
  const t = engine.tables.get(kind);
  const dims = new Map(Object.entries(isObj(t.doc.dimensions) ? t.doc.dimensions : {}));
  const consts = ruleTable(engine.rules, S.kernelConstants);
  const maxDepth = isObj(consts) ? consts[S.rxMaxDepth] : undefined;
  if (!Number.isSafeInteger(maxDepth)) throw deny(CODE.struct, `rules.${S.kernelConstants}.${S.rxMaxDepth} is a positive integer`);
  let tree = null;
  try { tree = compileRXInScope(text, S.dataProfile, { dims, vocabIndex: engine.vocab.index, ns: [], maxDepth }).tree; } catch (e) { tree = null; }
  cache.set(key, tree);
  return tree;
}

// successorRX 求值（:520）：读存储值；求不出、不是已载入实体、已终止或是本体，都是"算不出后继"（返回 null，调用方退为 wreck）。
function successorOf(engine, state, kind, id, term) {
  if (term.mode !== MODE.inherit || term.successorRX === null) return null;
  const tree = compileSuccessor(engine, kind, term.successorRX);
  if (tree === null) return null;
  let v;
  try { v = evaluateRX(tree, rxBindings(engine, state, kind, id, tree), {}); } catch (e) { return null; }
  if (!isCode(v) || v === id || isMarked(state, v)) return null;
  try { kindOfEntity(state, v); } catch (e) { return null; }
  return v;
}

// ---------- 去留表（:529） ----------

function recordsTable(engine) {
  const t = ruleTable(engine.rules, S.rulesTable);
  return isObj(t) && isObj(t[S.recordsKey]) ? t[S.recordsKey] : {};
}

function retentionOf(engine, recordClass) {
  const rows = recordsTable(engine);
  if (!own(rows, recordClass) || !isObj(rows[recordClass])) throw deny(CODE.unlisted, `record class ${JSON.stringify(recordClass)} has no rules.${S.rulesTable}.${S.recordsKey} row`);
  return rows[recordClass];
}

// 该实体名下的记录：每条 subjectRecords 模式在 state 里的具体路径，其中任一主体段（第 k 个 `*`，从 1 起）等于该实体 id。
function subjectRecordPaths(state, id) {
  const { stateKeys } = needDecl();
  const out = [];
  for (const key of Object.keys(stateKeys).sort(cmp)) {
    const sr = isObj(stateKeys[key]) ? stateKeys[key].subjectRecords : undefined;
    if (!isObj(sr)) continue;
    for (const rel of Object.keys(sr).sort(cmp)) {
      const entry = sr[rel];
      const pattern = [key, ...rel.split(GRAMMAR_TOKENS.pathSep)];
      const walk = (node, depth, segs, stars) => {
        if (depth === pattern.length) {
          if (entry.subjectSegments.some((k) => stars[k - 1] === id)) out.push({ segs, recordClass: entry.recordClass });
          return;
        }
        if (!isObj(node)) return;
        const p = pattern[depth];
        if (p === GRAMMAR_TOKENS.wildcard) for (const k of Object.keys(node).sort(cmp)) walk(node[k], depth + 1, [...segs, k], [...stars, k]);
        else if (Object.hasOwn(node, p)) walk(node[p], depth + 1, [...segs, p], stars);
      };
      walk(state, 0, [], []);
    }
  }
  return out;
}

function deleteRecords(engine, tx, id, pick) {
  for (const r of subjectRecordPaths(tx.state, id)) if (pick(retentionOf(engine, r.recordClass))) txSet(tx, r.segs, undefined);
}

// ---------- 第 1 步的清理函数（:528） ----------

function runCleanups(engine, tx, kind, info) {
  const { systems } = needDecl();
  const list = [];
  for (const name of Object.keys(systems).sort(cmp)) {
    const c = isObj(systems[name]) ? systems[name].terminationCleanup : undefined;
    if (!isObj(c)) continue;
    if (Array.isArray(c.kinds) && c.kinds.includes(kind)) list.push({ name, ref: c.handler, sortKey: c.sortKey });
  }
  list.sort((a, b) => (a.sortKey - b.sortKey) || cmp(a.name, b.name));
  for (const item of list) {
    const fn = cleanups.get(item.ref);
    if (!fn) throw deny(CODE.notReady, `termination cleanup ${item.ref} of ${item.name} is declared but not registered`, info.id);
    // 清理函数只许写本系统登记为写者的路径：调用期间把事务节点换成清理函数所在文件，writePath 按它核写者（卷二 §2.6 第 3 条）。
    const p = refParts(item.ref);
    const saved = { node: tx.node, file: tx.file };
    tx.node = p.fn;
    tx.file = p.file;
    inCleanup = true;
    try { fn(engine, tx.state, { ...info }); } finally { inCleanup = false; tx.node = saved.node; tx.file = saved.file; }
  }
}

// ---------- 第 3 步：账户分流（:522；卷六规则 9） ----------

// 未建的 onTerminate 取值登记（rules.terminate.unbuilt，李白 11-19 11:1x ③，照 B2-W3 未建派生做法）。
function unbuiltModes(engine) {
  const t = ruleTable(engine.rules, S.rulesTable);
  const u = isObj(t) && isObj(t[S.unbuiltKey]) ? t[S.unbuiltKey] : null;
  return u && Array.isArray(u.onTerminate) ? u.onTerminate : [];
}

function splitAccounts(engine, state, id, successorId, cause) {
  const rows = ruleTable(engine.rules, S.resourcesTable);
  const unbuilt = unbuiltModes(engine);
  for (const a of accountsOf(engine, state, id)) {
    if (a.balance === 0) continue;
    const row = own(rows, a.resource.kind) ? rows[a.resource.kind] : null;
    if (!row) throw deny(CODE.refMissing, `resource kind ${a.resource.kind} has no resource kind row`, id);
    if (unbuilt.includes(row.onTerminate)) {
      throw deny(CODE.notReady, `resource kind ${a.resource.kind}: onTerminate ${row.onTerminate} is registered unbuilt (rules.${S.rulesTable}.${S.unbuiltKey})`, id);
    } else if (row.onTerminate === ACCOUNT.successor) {
      if (successorId === null) throw deny(CODE.notReady, `account ${a.resource.kind} goes to the successor but there is none (wreck not built)`, id);
      transfer(engine, state, { from: { holder: id, purpose: a.purpose }, to: { holder: successorId, purpose: a.purpose }, resource: a.resource, qty: a.balance, reason: cause });
    } else if (row.onTerminate === ACCOUNT.remains) {
      throw deny(CODE.notReady, `resource kind ${a.resource.kind}: onTerminate remains needs the wreck entity (create writer not built)`, id);
    } else {
      // 既未建成也未登记为未建（如 sink 从 unbuilt 删去而单值去处字段未补）：不静默，按数据不合拒。
      throw deny(CODE.struct, `resource kind ${a.resource.kind}: onTerminate ${JSON.stringify(row.onTerminate)} is neither built nor registered unbuilt`, id);
    }
  }
}

// ---------- 第 4 步：持有边（:523；R18-1.2、R18-1.3、R18-1.8） ----------

function activeEdges(state, match) {
  const root = isObj(state) && isObj(state[S.holdings]) ? state[S.holdings] : {};
  const out = [];
  for (const holder of Object.keys(root).sort(cmp)) {
    const edges = isObj(root[holder]) ? root[holder] : {};
    for (const edgeId of Object.keys(edges).sort(cmp)) {
      const rec = edges[edgeId];
      if (isObj(rec) && isObj(rec.terms) && rec.terms.until === null && match(rec)) out.push({ edgeId, rec });
    }
  }
  return out;
}

function holdingRow(engine, kind) {
  const rec = engine.vocab.index.get(kind);
  if (!rec || rec.family !== S.holdingFamily || !isObj(rec.entry)) throw deny('E-HK-UNREGISTERED', `holding kind ${JSON.stringify(kind)} is not a registered holding_kind row`);
  return rec.entry;
}

// 候补列表里第一个未终止、非本体的实体；入口未交入即拒收（不当作空表）。
function firstLiveSuccessor(engine, state, id, row, rec) {
  const fn = orders.get(row.succeedBy);
  if (!fn) throw deny(CODE.notReady, `succession order ${JSON.stringify(row.succeedBy)} is not registered`, id);
  const list = fn(engine, state, rec);
  if (!Array.isArray(list) || !list.every(isCode)) throw deny(CODE.struct, `succession order ${row.succeedBy} must return struct:entityOrder (list of entity ids)`, id);
  return list.find((e) => e !== id && !isMarked(state, e)) ?? null;
}

function settleHoldings(engine, state, id, cause, windowDays) {
  const points = [];
  for (const { edgeId, rec } of activeEdges(state, (r) => r.holder === id)) {
    const row = holdingRow(engine, rec.kind);
    let heir = null;
    if (row.gone === null || row.gone === undefined) continue; // 该触发对本种类不适用：边留着，提交后核对报 E-TERM-RESIDUE
    if (row.gone === HANDOVER.succeed) heir = firstLiveSuccessor(engine, state, id, row, rec);
    else if (row.gone === HANDOVER.revert) heir = isCode(rec.terms.grantor) && !isMarked(state, rec.terms.grantor) ? rec.terms.grantor : null;
    else if (row.gone !== HANDOVER.close) throw deny(CODE.notReady, `holding kind ${rec.kind}: holder-end disposition ${JSON.stringify(row.gone)} needs a protocol transfer in the holding writer (not built)`, id);
    if (heir !== null) throw deny(CODE.notReady, `holding kind ${rec.kind}: handing ${edgeId} to ${heir} needs a protocol transfer in the holding writer (not built)`, id);
    // 复生点边（③）：窗口 > 0 时记一项（该边的持有种类，该边的标的），关边后以本次关闭的全部复生点边整组覆盖 revivals.<主体>.points（卷四 §2.6）；窗口为 0 不记点，只关边。
    if (row.revival !== null && row.revival !== undefined && windowDays > 0) points.push({ kind: rec.kind, counterpart: rec.subject });
    closeHolding(engine, state, { id: edgeId, cause });
  }
  if (points.length > 0) txSet(needTx(state), [S.revivals, id, S.pointsKey], points);
  // 协议乙：以它为标的的边一律解除（R18-1.3；subjectEnd 现只许 send_close，本步不读它）。
  for (const { edgeId } of activeEdges(state, (r) => r.subject === id)) closeHolding(engine, state, { id: edgeId, cause });
}

// ---------- 第 5 步与核对 ----------

function windowDue(row, id) {
  return row.kind === S.windowDueKind && row.owner === id;
}

function dueRows(state) {
  return isObj(state) && isObj(state[S.due]) ? state[S.due] : {};
}

function protocolEntries(state, id) {
  return [S.statuses, S.modifiers].filter((k) => isObj(state[k]) && Object.hasOwn(state[k], id));
}

/**
 * 终止残余核对（卷二 §2.6 :525 不变量）：返回违例清单（空即通过）。持有边、非零余额、状态实例、去留为 clear 的记录、
 * 以它为 owner 或 ref 的到期项（窗口到期项除外）。史实记录 relationFacts 不在范围内。终止事务末尾与 5-7 不变量共用。
 * @param {{vocab: any, rules: any}} engine @param {any} state @param {string} id
 * @returns {string[]}
 */
export function terminationResidue(engine, state, id) {
  const out = [];
  for (const { edgeId } of activeEdges(state, (r) => r.holder === id || r.subject === id)) out.push(`${S.holdings}:${edgeId}`);
  for (const a of accountsOf(engine, state, id)) if (a.balance !== 0) out.push(`${S.accounts}:${a.purpose}${GRAMMAR_TOKENS.pathSep}${a.resource.kind}${GRAMMAR_TOKENS.pathSep}${a.resource.key}`);
  for (const k of protocolEntries(state, id)) out.push(k);
  for (const r of subjectRecordPaths(state, id)) if (retentionOf(engine, r.recordClass).atTerminate === KEEP.clear) out.push(r.segs.join(GRAMMAR_TOKENS.pathSep));
  const due = dueRows(state);
  for (const h of Object.keys(due).sort(cmp)) if ((due[h].owner === id || due[h].ref === id) && !windowDue(due[h], id)) out.push(`${S.due}:${h}`);
  return out;
}

function emitProtocolEvent(engine, state, verb, payload, id, cause) {
  emit(engine, state, {
    minute: clockView(engine, state).minute,
    verb,
    actor: null,
    targets: [id],
    primitives: [],
    cause,
    witnesses: [],
    visibility: S.visibility,
    payload,
  }, { rule: cause, subject: id, position: S.position });
}

function checkCause(engine, cause) {
  const rec = isCode(cause) ? engine.vocab.index.get(cause) : undefined;
  if (!rec || rec.family !== S.verbFamily) throw deny(CODE.verb, `cause ${JSON.stringify(cause)} is not a registered verb`);
}

/**
 * kernelApi `terminate(engine, state, entityId, cause, source)`（卷二 §2.6 :519–:525）：在调用方事务内按固定五步终止一个实体，任一步失败整笔回滚。
 * 1 定后继与领域清理（清理函数按 sortKey、系统名；去留表删 clear，窗口为 0 时连 hold 一起删）→ 2 写终止标记 {day, cause, mode} →
 * 3 账户按 onTerminate 分流 → 4 持有边按种类行处置、标的边一律解除 → 5 撤销以它为 owner/ref 的到期项、窗口 > 0 登记窗口到期项、
 * 发 verb_entity_terminated；最后按不变量核残余（E-TERM-RESIDUE）。
 * @param {{vocab: any, rules: any, tables: Map<string, any>, units: Map<string, any>}} engine
 * @param {any} state @param {string} entityId @param {string} cause verb 句柄 @param {string | null} source 死因细分句柄或 null
 * @returns {{mode: string, successorId: string | null}}
 */
export function terminate(engine, state, entityId, cause, source) {
  const tx = needTx(state);
  if (inCleanup) throw deny(CODE.undeclaredWrite, 'termination cleanup must not call terminate', entityId);
  checkCause(engine, cause);
  if (!(source === null || isCode(source))) throw deny(CODE.idFormat, 'terminate source is a code or null', entityId);
  const kind = entityKind(state, entityId);
  if (isMarked(state, entityId)) throw deny(CODE.residue, `entity ${entityId} is already terminated`, entityId);
  // 第 1 步
  const term = terminationOf(engine, state, kind, entityId);
  // liquidate 的后继是各债权人与持有边对方（:520）；债权人读自卷六合同，写者未上线，先于"算不出后继退为 wreck"拒收，不改写成 wreck（挂卷六合同卡）。
  if (term.mode === MODE.liquidate) throw deny(CODE.notReady, `${entityId}: liquidate successors are creditors (contracts writer not built)`, entityId);
  const successorId = successorOf(engine, state, kind, entityId, term);
  // :520"算不出后继时退为 wreck（这是规则，不是数据缺省）"。
  const mode = successorId === null ? MODE.wreck : term.mode;
  if (mode === MODE.wreck) throw deny(CODE.notReady, `${entityId}: wreck successor needs a generated wreck entity (create writer not built)`, entityId);
  needDecl();
  runCleanups(engine, tx, kind, { id: entityId, cause, mode, successorId });
  deleteRecords(engine, tx, entityId, (r) => r.atTerminate === KEEP.clear || (r.atTerminate === KEEP.hold && term.reviveWindowDays === 0));
  // 第 2 步
  const now = clockView(engine, state);
  txSet(tx, [TERMINATED_KEY, entityId], { day: now.day, cause, mode });
  // 第 3 步
  splitAccounts(engine, state, entityId, successorId, cause);
  // 第 4 步
  settleHoldings(engine, state, entityId, cause, term.reviveWindowDays);
  // 第 5 步
  // 第 5 步清状态实例（状态容器 6-5 已建，写者 status.mjs；清除是协议动作，不算第二个写者）；运行态修正项的容器（modifier.mjs）块 6 没有，见到条目即拒收，不静默跳过。
  if (isObj(state[S.statuses]) && Object.hasOwn(state[S.statuses], entityId)) txSet(tx, [S.statuses, entityId], undefined);
  const blocked = protocolEntries(state, entityId).filter((k) => k === S.modifiers);
  if (blocked.length) throw deny(CODE.notReady, `${entityId}: ${blocked.join()} entries need the modifier container (block 7)`, entityId);
  const due = dueRows(state);
  for (const h of Object.keys(due).sort(cmp)) if (due[h].owner === entityId || due[h].ref === entityId) cancel(h);
  if (term.reviveWindowDays > 0) {
    const endMinute = (now.day + term.reviveWindowDays) * minutesPerDay(engine);
    schedule(entityId, S.windowDueKind, endMinute - now.minute, entityId);
  }
  emitProtocolEvent(engine, state, S.terminatedVerb, { id: entityId, cause, source, mode, successorId }, entityId, cause);
  const residue = terminationResidue(engine, state, entityId);
  if (residue.length) throw deny(CODE.residue, `${entityId}: residue after termination: ${residue.join(', ')}`, entityId);
  return { mode, successorId };
}

/**
 * kernelApi `revive(engine, state, entityId, cause)`（卷二 §2.6 :531）：先核终止标记与窗口（当前日 − 终止日 < reviveWindowDays），
 * 不符即 E-TERM-REVIVE-DENIED；通过后删标记、撤销窗口到期项、按去留表删 atRevive = clear 的 hold 记录、发 verb_entity_revived。
 * 已分流的账户、已关的边、已撤销的到期项、已删的记录一概不还原。
 * @param {{vocab: any, rules: any, tables: Map<string, any>, units: Map<string, any>}} engine
 * @param {any} state @param {string} entityId @param {string} cause verb 句柄
 */
export function revive(engine, state, entityId, cause) {
  const tx = needTx(state);
  if (inCleanup) throw deny(CODE.undeclaredWrite, 'termination cleanup must not call revive', entityId);
  checkCause(engine, cause);
  const kind = entityKind(state, entityId);
  const mark = marksOf(state)[entityId];
  if (!isObj(mark)) throw deny(CODE.reviveDenied, `${entityId} has no termination mark`, entityId);
  const term = terminationOf(engine, state, kind, entityId);
  if (!(clockView(engine, state).day - mark.day < term.reviveWindowDays)) throw deny(CODE.reviveDenied, `${entityId}: outside the revive window`, entityId);
  needDecl();
  txSet(tx, [TERMINATED_KEY, entityId], undefined);
  const due = dueRows(state);
  for (const h of Object.keys(due).sort(cmp)) if (windowDue(due[h], entityId)) cancel(h);
  deleteRecords(engine, tx, entityId, (r) => r.atTerminate === KEEP.hold && r.atRevive === REVIVE.clear);
  emitProtocolEvent(engine, state, S.revivedVerb, { id: entityId, cause }, entityId, cause);
}

/**
 * 窗口期满（卷二 §2.6 :530）：到期项发到时由内核删除该实体名下全部 hold 记录，终止标记不动。kernel 组内用（到期事件的订阅分发由装配处交给调度器 dueSource 的 deliver，挂块 6 装配卡；非窗口项原样忽略）。
 * @param {{vocab: any, rules: any}} engine @param {any} state @param {{kind: string, owner: string}} item 到期项
 */
export function expireReviveWindow(engine, state, item) {
  const tx = needTx(state);
  if (!isObj(item) || !windowDue(item, item.owner) || !isMarked(state, item.owner)) return;
  deleteRecords(engine, tx, item.owner, (r) => r.atTerminate === KEEP.hold);
}

// ---------- 加载期核对（卷二 §2.6 :526 ①、:528、:529） ----------

/**
 * 终止相关登记的加载期核对，返回错误行（空即通过）：
 * - 去留表：`rules.terminate.records` 每行 atTerminate 在 term_record 内；atRevive 当且仅当 atTerminate = hold 时写且在 revive_record 内（E-DIM-STRUCT-FIELD）；
 * - `stateKeys.<键>.subjectRecords` 每条 {recordClass, subjectSegments}：recordClass 在规则表有取值（E-TERM-RECORD-UNLISTED），
 *   subjectSegments 是模式里 `*` 段的序号（从 1 起，E-DIM-STRUCT-FIELD）；
 * - `systems.<名>.terminationCleanup`：{kinds, handler, sortKey} 齐全（E-DIM-STRUCT-FIELD）；
 * - 实体表整表一致（:526 ①）：非 abstract 类别行沿 extends 取 termination，要么都有、要么都没有（E-DIM-REQUIRED-MISSING）。
 * 统一加载器在规则目录登记了去留表时调用，违者加载失败（5-7 接线，同 checkHoldingKindRows）；测试也直接调用。
 * @param {{rules: any, tables?: Map<string, any>}} engine @param {{stateKeys?: any, systems?: any}} decl
 * @returns {string[]}
 */
export function checkTerminationTables(engine, decl) {
  const errors = [];
  let rows = {};
  try { rows = recordsTable(engine); } catch (e) { errors.push(`${codeOf(e) || CODE.struct} rules.${S.rulesTable} missing`); }
  for (const rc of Object.keys(rows).sort(cmp)) {
    const r = rows[rc];
    if (!isObj(r) || !KEEP.is(r.atTerminate)) { errors.push(`${CODE.struct} ${rc}: atTerminate is a term_record`); continue; }
    const wantRevive = r.atTerminate === KEEP.hold;
    if (wantRevive !== own(r, 'atRevive')) errors.push(`${CODE.struct} ${rc}: atRevive is written iff atTerminate is hold`);
    else if (wantRevive && !REVIVE.is(r.atRevive)) errors.push(`${CODE.struct} ${rc}: atRevive is a revive_record`);
  }
  // 未建登记只许登真未建的取值：successor、remains 已有处置分支，登进来即登记与实现不符（同 B2-W3"登记了却编得过"报错）。
  for (const m of unbuiltModes(engine)) if (m === ACCOUNT.successor || m === ACCOUNT.remains) errors.push(`${CODE.struct} ${S.unbuiltKey}: onTerminate ${m} is built, remove it from rules.${S.rulesTable}.${S.unbuiltKey}`);
  const stateKeys = isObj(decl) && isObj(decl.stateKeys) ? decl.stateKeys : {};
  for (const key of Object.keys(stateKeys).sort(cmp)) {
    const sr = isObj(stateKeys[key]) ? stateKeys[key].subjectRecords : undefined;
    if (sr === undefined) continue;
    for (const rel of Object.keys(isObj(sr) ? sr : {}).sort(cmp)) {
      const e = sr[rel];
      const stars = [key, ...rel.split(GRAMMAR_TOKENS.pathSep)].filter((s) => s === GRAMMAR_TOKENS.wildcard).length;
      if (!isObj(e) || Object.keys(e).sort(cmp).join() !== [...RECORD_FIELDS.subject].sort(cmp).join()) { errors.push(`${CODE.struct} ${key}.${rel}: subjectRecords entry is {recordClass, subjectSegments}`); continue; }
      if (!Array.isArray(e.subjectSegments) || e.subjectSegments.length === 0 || !e.subjectSegments.every((k) => Number.isSafeInteger(k) && k >= 1 && k <= stars)) errors.push(`${CODE.struct} ${key}.${rel}: subjectSegments are * segment numbers (1..${stars})`);
      if (!own(rows, e.recordClass)) errors.push(`${CODE.unlisted} ${key}.${rel}: record class ${JSON.stringify(e.recordClass)} has no rules.${S.rulesTable}.${S.recordsKey} value`);
    }
  }
  const systems = isObj(decl) && isObj(decl.systems) ? decl.systems : {};
  for (const name of Object.keys(systems).sort(cmp)) {
    const c = isObj(systems[name]) ? systems[name].terminationCleanup : undefined;
    if (c === undefined) continue;
    const p = isObj(c) ? refParts(c.handler) : null;
    if (!isObj(c) || Object.keys(c).sort(cmp).join() !== [...CLEANUP_FIELDS].sort(cmp).join() || !Array.isArray(c.kinds) || !c.kinds.every((k) => typeof k === TYPEOF_STRING) || !p || !isModuleFile(p.file) || !Number.isSafeInteger(c.sortKey)) {
      errors.push(`${CODE.struct} ${name}: terminationCleanup is {kinds, handler: <file>#<function>, sortKey}`);
    }
  }
  const tables = engine && engine.tables instanceof Map ? engine.tables : new Map();
  for (const [kind, t] of [...tables].sort((a, b) => cmp(a[0], b[0]))) {
    const classes = t && isObj(t.doc) && isObj(t.doc.classes) ? t.doc.classes : {};
    const concrete = Object.keys(classes).filter((c) => !(isObj(classes[c]) && classes[c][T.row_field.abstract] === true)).sort(cmp);
    const has = concrete.filter((c) => {
      const seen = new Set();
      for (let cur = c; typeof cur === TYPEOF_STRING && isObj(classes[cur]) && !seen.has(cur); cur = classes[cur][T.row_field.extends]) {
        seen.add(cur);
        if (own(classes[cur], T.row_field.termination)) return true;
      }
      return false;
    });
    if (has.length > 0 && has.length !== concrete.length) errors.push(`${CODE.required} ${kind}: termination is written on every non-abstract class row or on none (${has.length}/${concrete.length})`);
  }
  return errors;
}
