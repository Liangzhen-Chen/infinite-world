// 实体终止协议（卷二 §2.6 :552–:562；勘误 1126s20：落 rules/lifecycle/，内核只留拒写判定与事件日志写入）。
// 本卡（S2-0a）只做第 1、2、5 步：定后继（现只有 wreck）与领域清理（清理函数、去留表）、终止标记、清状态实例与发终止事件；
// 第 3 步账户分流（rules/economy/ledger.mjs）、第 4 步持有边（rules/social/holdings.mjs）由各域登记的清理函数做（S2-0c1）；撤销到期项与复生归后续卡。标记按主会话裁定 R1 作事务里最后一笔状态写入（五步语义与次序不变）。
// 全部按登记数据判：类别行 termination、state-owners 的 systems.*.terminationCleanup、规则表 rules.terminate.*；不认任何 kind、类别或 id。
// 另有建档路由 instantiateEntity（S1-3c 草案 §5）：create 原语建行后按 systems.*.instantiate 登记调实例化函数，与终止发起方同一登记做法。

import { KernelError } from '../../kernel/errors.mjs';
import { T } from '../../kernel/handles.mjs';
import { namedStructFieldsOf } from '../../kernel/named-structs.mjs';
import { parseNumberType } from '../../kernel/validate/types.mjs';
import { kindOfEntity, readPath, writePath, createEntity, setEntityProp } from '../../kernel/storage.mjs';
import { classRowsOf } from '../../kernel/dimensions.mjs';
import { txEmit } from '../../kernel/transaction.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { ruleValue, unitSi } from '../load/registry.mjs';
import { subjectRecordPaths, deleteRecords, recordValues, terminableKinds } from './records.mjs';
import { statusView, clearStatusesOf } from '../status/status.mjs';

/** @typedef {import('./records.mjs').LifeEngine} LifeEngine */
/** @typedef {{id: string, cause: string, mode: string, successorId: string | null}} TerminationInfo */
/** @typedef {{mode: string, successorRX: unknown, reviveWindowDays: number}} Termination */

const TERMINATE = 'terminate';
const WRECK_KIND = 'wreckKind';
// 账本持有人主体标记维度名的登记处（rules.economyLedger.account.holderFlag，卷六 :103；S2-0c1 主会话 Q1 甲：残骸建时写真，余额可转给它）。只读数据，不 import 账本模块（防环）。
const HOLDER_FLAG = Object.freeze({ table: 'economyLedger', key: 'account', field: 'holderFlag' });
// 类别行的终止公共字段（卷二 §5.0、:553）与 state-owners systems.<名> 下清理函数登记的字段（卷二 :561）。
const TERMINATION_FIELD = 'termination';
const CLEANUP_FIELD = 'terminationCleanup';
// 终止发起方的登记字段（卷二 :552「可终止实体类的归属卷只登记触发条件」；草案 §4.1：systems.<名>.terminationTrigger {kinds, handler}，S2-0b）。
const TRIGGER_FIELD = 'terminationTrigger';
// 建档实例化的登记字段（S1-3c 草案 §5：systems.<名>.instantiate {kinds, handler}）。
const INSTANTIATE_FIELD = 'instantiate';
// 终止事件的动词条目（卷二 :557：verb 族条目，由内核登记；state-owners kernel.emits 已列）。
const VERB_TERMINATED = 'verb_entity_terminated';
// cause 所属的词表族（卷二 :552「cause 是 verb 族句柄」）。
const VERB_FAMILY = 'verb';
// 清理函数登记引用的写法 "<文件>#<函数>"（卷二 :561）。
const HANDLER_REF_SEP = '#';
// 本卡未建能力的去处（主会话裁定 R7：拒收并写明等哪张卡）。
const UNBUILT_SUCCESSOR_RX = '卷十八家户卡（successorChain 求值）';
const UNBUILT_REVIVE_WINDOW = 'S2-0c（复生窗口与窗口到期项）';

/**
 * kernelApi `registerTerminationCleanup(handlerRef, handler)`（卷二 :561，勘误 1126s20 签名 handler(engine, state, info, tx)）：
 * 不放模块级登记（禁顶层状态）——返回冻结的登记项，由声明它的模块导出、装配层收进 engine.terminationCleanups；
 * terminate 按 systems.*.terminationCleanup.handler 对这里的 handlerRef 认函数，对不上即 E-DIM-REF-MISSING。
 * @param {string} handlerRef
 * @param {(engine: LifeEngine, state: unknown, info: TerminationInfo, tx: unknown) => void} handler
 * @returns {Readonly<{handlerRef: string, handler: Function}>}
 */
export function registerTerminationCleanup(handlerRef, handler) {
  return handlerEntry(handlerRef, handler);
}

/**
 * 登记项（清理函数、终止发起方、建档实例化与原语写者同形；rules/load/primitive-writers.mjs 复用，S2-L 草案 §3）：核 "<文件>#<函数>" 与函数，返回冻结的 {handlerRef, handler}。
 * @param {string} handlerRef @param {Function} handler @returns {Readonly<{handlerRef: string, handler: Function}>}
 */
export function handlerEntry(handlerRef, handler) {
  const at = typeof handlerRef === 'string' ? handlerRef.indexOf(HANDLER_REF_SEP) : -1;
  const ok = at > 0 && at === handlerRef.lastIndexOf(HANDLER_REF_SEP) && at < handlerRef.length - 1;
  if (!ok || typeof handler !== 'function') {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'termination handler entry: needs "<file>#<function>" and a function');
  }
  return Object.freeze({ handlerRef, handler });
}

/**
 * 终止发起方的登记项（草案 §4.1 systems.<名>.terminationTrigger；与清理函数同一做法、同形，卷二 :561）：同 registerTerminationCleanup，
 * 由声明它的模块导出、装配层收进 engine.terminationTriggers，destroyEntity 按 terminationTrigger.handler 认函数，签名 handler(engine, state, entityId, tx)。
 * @param {string} handlerRef
 * @param {(engine: LifeEngine, state: unknown, entityId: string, tx: unknown) => void} handler
 * @returns {Readonly<{handlerRef: string, handler: Function}>}
 */
export function registerTerminationTrigger(handlerRef, handler) {
  return handlerEntry(handlerRef, handler);
}

/**
 * 建档实例化函数的登记项（S1-3c 草案 §5 systems.<名>.instantiate；与终止发起方同形）：由声明它的模块导出、装配层收进 engine.instantiators，
 * instantiateEntity 按 instantiate.handler 认函数，签名 handler(engine, state, entityId, tx)。
 * @param {string} handlerRef
 * @param {Function} handler 实例化函数（engine 取装配层的完整 engine，形状由该函数自己声明）
 * @returns {Readonly<{handlerRef: string, handler: Function}>}
 */
export function registerInstantiator(handlerRef, handler) {
  return handlerEntry(handlerRef, handler);
}

/**
 * 被终止实体所属类别行的 termination（经公共部件 classRowsOf 按取值次序找第一行写了它的）；没有即 undefined。
 * @param {LifeEngine} engine @param {unknown} state @param {string} kind @param {string} id @returns {unknown}
 */
function terminationOf(engine, state, kind, id) {
  for (const [, row] of classRowsOf(engine, state, kind, id)) {
    if (row !== null && typeof row === 'object' && Object.hasOwn(row, TERMINATION_FIELD)) return row[TERMINATION_FIELD];
  }
  return undefined;
}

/**
 * 一行 termination 的核对（卷二 :553 三字段无缺省；主会话裁定 R7：successorRX 非空、reviveWindowDays > 0 本卡未建，拒收并写明等哪张卡）。
 * @param {unknown} raw @param {string} where @returns {Termination}
 */
function checkTerminationRow(raw, where) {
  const modes = Object.values(T.code_enum.successor_mode);
  const t = Object(raw);
  const ok = raw !== null && typeof raw === 'object' && modes.includes(t.mode) && Object.hasOwn(t, 'successorRX')
    && Number.isInteger(t.reviveWindowDays) && t.reviveWindowDays >= 0;
  if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${where}: termination needs mode (successor_mode), successorRX and an integer reviveWindowDays >= 0`);
  if (t.successorRX !== null) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${where}: termination.successorRX is not built yet, wait for ${UNBUILT_SUCCESSOR_RX}`);
  if (t.reviveWindowDays > 0) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${where}: termination.reviveWindowDays > 0 is not built yet, wait for ${UNBUILT_REVIVE_WINDOW}`);
  return { mode: String(t.mode), successorRX: t.successorRX, reviveWindowDays: Number(t.reviveWindowDays) };
}

/**
 * 终止相关登记的核对（registry.json terminate 行所指的 checkTerminationTables；加载期由装配层 rules/load/mount.mjs#mountKernel 调）：
 * 各表类别行与实体行写的 termination 逐行过 checkTerminationRow（R7 未建数据门）；
 * rules.terminate.records 每行 atRevive 当且仅当 atTerminate = hold 时写（卷二 :562），不合 E-DIM-STRUCT-FIELD；
 * rules.terminate.wreckKind 须是登记的实体表，否则 E-DIM-REF-MISSING。
 * @param {LifeEngine} engine
 */
export function checkTerminationTables(engine) {
  for (const [kind, doc] of engine.registry.tables) {
    for (const part of [Object(doc).classes, Object(doc).rows]) {
      const rows = Object(part);
      for (const id of Object.keys(rows).sort()) {
        const row = Object(rows[id]);
        if (Object.hasOwn(row, TERMINATION_FIELD)) checkTerminationRow(row[TERMINATION_FIELD], `${kind}.${id}`);
      }
    }
  }
  const values = recordValues(engine);
  for (const rc of Object.keys(values).sort()) {
    const v = values[rc];
    if ((v.atTerminate === T.code_enum.term_record.hold) !== Object.hasOwn(v, 'atRevive')) {
      throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.terminate.records.${rc}: atRevive must be written exactly when atTerminate is hold`);
    }
  }
  const wk = ruleValue(Object(engine.docData), TERMINATE, WRECK_KIND);
  if (typeof wk !== 'string' || !engine.registry.kindIds.has(wk)) throw new KernelError('E-DIM-REF-MISSING', {}, `rules.terminate.wreckKind ${JSON.stringify(wk)}: not a registered kind`);
}

/**
 * 该实体类登记的清理函数（卷二 :561）：按 sortKey 升序、同值按系统名代号序；登记了却没交函数即 E-DIM-REF-MISSING。
 * @param {LifeEngine} engine @param {string} kind @returns {Function[]}
 */
function cleanupsFor(engine, kind) {
  /** @type {unknown} */
  const given = engine.terminationCleanups;
  if (!Array.isArray(given)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.terminationCleanups must be an array');
  const systems = Object(Object(Object(engine.docData).owners).systems);
  /** @type {Array<{name: string, handlerRef: string, sortKey: number}>} */
  const rows = [];
  for (const name of Object.keys(systems)) {
    const c = Object(systems[name])[CLEANUP_FIELD];
    if (c === undefined) continue;
    if (!Array.isArray(c.kinds) || typeof c.handler !== 'string' || !Number.isInteger(c.sortKey)) {
      throw new KernelError('E-DIM-STRUCT-FIELD', {}, `systems.${name}.terminationCleanup needs kinds, handler and an integer sortKey`);
    }
    if (c.kinds.includes(kind)) rows.push({ name, handlerRef: c.handler, sortKey: Number(c.sortKey) });
  }
  rows.sort((a, b) => (a.sortKey - b.sortKey) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return rows.map((r) => registeredHandler(given, r.handlerRef, `termination cleanup ${r.handlerRef} (systems.${r.name})`));
}

/**
 * 登记项数组里按 handlerRef 认函数（registerTerminationCleanup 产出的冻结登记项，卷二 :561 加载时核一致）；对不上即 E-DIM-REF-MISSING。
 * @param {unknown[]} given @param {string} handlerRef @param {string} where @returns {Function}
 */
function registeredHandler(given, handlerRef, where) {
  /** @type {unknown} */
  const hit = given.find((g) => Object(g).handlerRef === handlerRef);
  const fn = Object(hit).handler;
  if (typeof fn !== 'function') throw new KernelError('E-DIM-REF-MISSING', {}, `${where}: no handler registered`);
  return fn;
}

/**
 * destroy 原语的协议入口（卷九 :641「destroy | entity | 内核原语 | 实体终止协议」；草案 §4.1；装配层注入为 engine.lifecycle.destroy，S2-0b）。
 * 不按 kind 名分支，按登记路由：实体所属表不可终止（类别行无 termination，卷二 :559 ③）或已终止 → E-TERM-RESIDUE；
 * 可终止的，取 state-owners systems.*.terminationTrigger 中 kinds 含该表的那一条，按 handler 认装配层交入的登记项（engine.terminationTriggers）并调
 * handler(engine, state, entityId, tx)；没有发起方登记即 E-ACT-WRITER-NOT-READY（该种类的终止触发未建），多于一条即 E-DIM-STRUCT-FIELD。
 * @param {unknown} state @param {string} entityId @param {unknown} tx
 */
export function destroyEntity(state, entityId, tx) {
  /** @type {LifeEngine} */
  const engine = Object(tx).engine;
  const kind = kindOfEntity(engine, state, entityId);
  if (!terminableKinds(engine).has(kind)) throw new KernelError('E-TERM-RESIDUE', {}, `destroy: ${kind} ${entityId} is not terminable`);
  if (readPath(state, engine.P.terminated(entityId)) !== undefined) throw new KernelError('E-TERM-RESIDUE', {}, `destroy: ${entityId} is already terminated`);
  const fn = systemRoute(engine, TRIGGER_FIELD, engine.terminationTriggers, kind);
  if (fn === null) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `destroy: no terminationTrigger registered for ${kind}`);
  fn(engine, state, entityId, tx);
}

/**
 * 按 state-owners systems.<名>.<field> {kinds, handler, sortKey?} 登记认一个种类的全部处理函数（终止发起方与建档实例化共用一处）：取 kinds 含该种类的各条，
 * 按 sortKey（没写即 0，S2-L 主会话 Q8 甲；与 terminationCleanup 同口径）升序、同值按系统名代号序，按 handler 在装配层交入的登记项数组 given 里认函数。
 * 登记形状不合（sortKey 写了却不是整数同此）即 E-DIM-STRUCT-FIELD；登记了却没交函数即 E-DIM-REF-MISSING。
 * @param {LifeEngine} engine @param {string} field @param {unknown} given @param {string} kind @returns {Function[]}
 */
function systemRoutes(engine, field, given, kind) {
  if (!Array.isArray(given)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `engine handler entries for systems.*.${field} must be an array`);
  const systems = Object(Object(Object(engine.docData).owners).systems);
  /** @type {Array<{name: string, handlerRef: string, sortKey: number}>} */
  const rows = [];
  for (const name of Object.keys(systems).sort()) {
    const t = Object(systems[name])[field];
    if (t === undefined) continue;
    const sortKey = t.sortKey === undefined ? 0 : t.sortKey;
    if (!Array.isArray(t.kinds) || typeof t.handler !== 'string' || !Number.isInteger(sortKey)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `systems.${name}.${field} needs kinds, handler and an integer sortKey if given`);
    if (t.kinds.includes(kind)) rows.push({ name, handlerRef: t.handler, sortKey: Number(sortKey) });
  }
  rows.sort((a, b) => (a.sortKey - b.sortKey) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return rows.map((r) => registeredHandler(given, r.handlerRef, `${field} ${r.handlerRef} (systems.${r.name})`));
}

/**
 * 只许一条登记的路由（终止发起方）：同 systemRoutes；没有登记返回 null，多于一条即 E-DIM-STRUCT-FIELD。
 * @param {LifeEngine} engine @param {string} field @param {unknown} given @param {string} kind @returns {Function | null}
 */
function systemRoute(engine, field, given, kind) {
  const fns = systemRoutes(engine, field, given, kind);
  if (fns.length > 1) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${kind} has more than one ${field}`);
  return fns.length === 0 ? null : fns[0];
}

/**
 * create 原语的建档入口（S1-3c 草案 §5；装配层注入为 engine.lifecycle.instantiate，kernel/transaction.mjs HANDLERS.create 写入阶段末尾调）：
 * 不按 kind 名分支，按 systems.*.instantiate 登记路由到实例化函数 handler(engine, state, entityId, tx)；同一种类可登记多个系统，按 sortKey 再按系统名依次调
 * （S2-L 主会话 Q8 甲：body 域建档补全在前，economy 域开局入账在后）；该种类没有登记即不做事（物品、组织等照旧）。
 * @param {unknown} state @param {string} entityId @param {unknown} tx
 */
export function instantiateEntity(state, entityId, tx) {
  /** @type {LifeEngine} */
  const engine = Object(tx).engine;
  for (const fn of systemRoutes(engine, INSTANTIATE_FIELD, Object(engine).instantiators, kindOfEntity(engine, state, entityId))) fn(engine, state, entityId, tx);
}

/**
 * 主体 id 去掉其表前缀的部分（单例 id 没有前缀，原样）。残骸 id 与起始物实例 id（rules/social/outfit.mjs）同用。
 * @param {LifeEngine} engine @param {string} kind @param {string} id @returns {string}
 */
export function idStem(engine, kind, id) {
  const rec = engine.registry.kindIds.get(kind);
  const prefix = rec && Array.isArray(rec.idPrefix) ? rec.idPrefix.find((p) => id.startsWith(p)) : undefined;
  return prefix === undefined ? id : id.slice(prefix.length);
}

/**
 * 残骸实体（卷二 :553 wreck；主会话裁定 R5 A）：建在 rules.terminate.wreckKind 那张表，
 * id = 该表首个前缀 + 模式代号 wreck + _ + 主体 id 去前缀 + _ + 终止分钟（同一主体同一分钟不会终止两次，id 唯一且确定）。
 * 建后把账本持有人主体标记（rules.economyLedger.account.holderFlag 所指维度）写真，第 3 步账户分流可转给它（卷二 :556；S2-0c1 主会话 Q1 甲）。返回残骸 id。
 * @param {LifeEngine} engine @param {unknown} state @param {string} kind @param {string} id @param {number} minute @param {unknown} tx @returns {string}
 */
function createWreck(engine, state, kind, id, minute, tx) {
  const wk = String(ruleValue(Object(engine.docData), TERMINATE, WRECK_KIND));
  const rec = engine.registry.kindIds.get(wk);
  const prefix = rec && Array.isArray(rec.idPrefix) ? rec.idPrefix[0] : undefined;
  if (typeof prefix !== 'string') throw new KernelError('E-DIM-REF-MISSING', {}, `rules.terminate.wreckKind ${JSON.stringify(wk)}: no id prefix`);
  const wreckId = `${prefix}${T.code_enum.successor_mode.wreck}_${idStem(engine, kind, id)}_${minute}`;
  createEntity(state, wreckId, wk, {}, tx);
  setEntityProp(state, wreckId, String(Object(ruleValue(Object(engine.docData), HOLDER_FLAG.table, HOLDER_FLAG.key))[HOLDER_FLAG.field]), true, tx);
  return wreckId;
}

/**
 * 终止标记里「日」字段与一日的分钟数（卷二 :554 标记 {day, cause, mode}；卷二十 :504 日 = 分钟的单位换算，取 _units.json，不是规则常数）：
 * 字段取标记登记类型（pathTypes 的 terminated 模式所指命名 struct）里唯一带单位的数值字段，其单位与时钟路径登记类型的单位经 registry.mjs#unitSi 取 si，之比即换算比。
 * 不写单位代号；不是恰一个带单位的数值字段、单位缺行、比值不是正整数即 E-DIM-UNIT-UNKNOWN。
 * @param {LifeEngine} engine @param {string} entityId @returns {{field: string, minutesPerDay: number}}
 */
function markDayField(engine, entityId) {
  const { P } = engine;
  const doc = Object(engine.docData);
  const types = Object(Object(doc.owners).pathTypes);
  const fields = Object(namedStructFieldsOf(doc.namedStructsDoc, String(types[P.terminated(entityId).pattern])));
  /** @type {Array<{field: string, unit: string}>} */
  const timed = [];
  for (const k of Object.keys(fields)) {
    const t = parseNumberType(String(fields[k]));
    if (t && t.unit) timed.push({ field: k, unit: t.unit });
  }
  const clock = parseNumberType(String(types[P.clock_minute().pattern]));
  if (timed.length !== 1 || !clock || !clock.unit) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, 'terminate: mark needs exactly one unit-typed number field and a unit-typed clock path');
  // 两单位 si 之比经公共入口 unitSi（有理数，整除才算整数比）。
  const [an, ad] = unitSi(doc, timed[0].unit);
  const [bn, bd] = unitSi(doc, clock.unit);
  const num = an * bd;
  const den = ad * bn;
  const ratio = den > 0n && num % den === 0n ? Number(num / den) : NaN;
  if (!Number.isInteger(ratio) || ratio <= 0) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, 'terminate: mark day unit / clock unit must have an integer ratio in the units table');
  return { field: timed[0].field, minutesPerDay: ratio };
}

/**
 * 残留核对（卷二 :558 E-TERM-RESIDUE 不变量，本卡只核已建的键）：终止标记在；没有状态实例；名下没有去留为 clear 的记录。
 * 账户、持有边由各自清理函数写完后自核本域（S2-0c1）；到期项随到期堆卡加。只读。返回 {ok, residue: 残留项的路径模式}。
 * @param {LifeEngine} engine @param {unknown} state @param {string} id
 * @returns {Readonly<{ok: boolean, residue: ReadonlyArray<string>}>}
 */
export function terminationResidue(engine, state, id) {
  const { P } = engine;
  /** @type {string[]} */
  const residue = [];
  const markPath = P.terminated(id);
  if (readPath(state, markPath) === undefined) residue.push(markPath.pattern);
  for (const s of statusView(engine, state, id)) residue.push(P.statuses_status(id, s.instance).pattern);
  const values = recordValues(engine);
  for (const r of subjectRecordPaths(engine, state, id)) {
    if (Object.hasOwn(values, r.recordClass) && values[r.recordClass].atTerminate === T.code_enum.term_record.clear) residue.push(r.pattern);
  }
  return Object.freeze({ ok: residue.length === 0, residue: Object.freeze(residue) });
}

/**
 * 终止协议原语 `terminate(state, entityId, cause, source, tx)`（卷二 :552；勘误 1126s20 末尾加 tx，engine 取 tx.engine）。只在事务内由规则层调用。
 * 次序（本卡范围，草案 §3.4）：核对 → 定后继（successorRX 为 null 即退为 wreck 并建残骸）→ 清理函数 → 去留表删除（clear；窗口为 0 时 hold 同删）
 * → 清状态实例 → 写终止标记（R1：事务最后一笔状态写入）→ 发 verb_entity_terminated → 残留核对。任一步抛错整笔回滚。
 * 已终止、或所属类别行没写 termination（不可终止实体类，卷二 :559 ③）即 E-TERM-RESIDUE。返回 {mode, successorId}。
 * @param {unknown} state @param {string} entityId @param {string} cause verb 族条目 @param {string | null} source 死因细分句柄，可空 @param {unknown} tx
 * @returns {Readonly<{mode: string, successorId: string | null}>}
 */
export function terminate(state, entityId, cause, source, tx) {
  /** @type {LifeEngine} */
  const engine = Object(tx).engine;
  const { P } = engine;
  const kind = kindOfEntity(engine, state, entityId);
  const verbs = Object(Object(Object(Object(engine.vocab).families)[VERB_FAMILY]).entries);
  if (typeof cause !== 'string' || !Object.hasOwn(verbs, cause)) {
    throw new KernelError('E-DIM-REF-MISSING', {}, `terminate: cause ${JSON.stringify(cause)} is not a verb entry`);
  }
  if (source !== null && (typeof source !== 'string' || source.length === 0)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'terminate: source must be a handle or null');
  if (readPath(state, P.terminated(entityId)) !== undefined) throw new KernelError('E-TERM-RESIDUE', {}, `terminate: ${entityId} is already terminated`);
  const found = terminationOf(engine, state, kind, entityId);
  if (found === undefined) throw new KernelError('E-TERM-RESIDUE', {}, `terminate: ${kind} ${entityId} has no termination on its class rows (not terminable)`);
  const term = checkTerminationRow(found, `${kind}.${entityId}`);
  const minute = clockMinute(engine, state);
  const day = markDayField(engine, entityId);
  // 第 1 步：定后继。successorRX 为 null（非 null 已在上面拒收）即算不出后继，按规则退为 wreck（卷二 :553）。
  const mode = T.code_enum.successor_mode.wreck;
  const successorId = createWreck(engine, state, kind, entityId, minute, tx);
  const info = Object.freeze({ id: entityId, cause, mode, successorId });
  for (const handler of cleanupsFor(engine, kind)) handler(engine, state, info, tx);
  const pick = term.reviveWindowDays === 0 ? [T.code_enum.term_record.clear, T.code_enum.term_record.hold] : [T.code_enum.term_record.clear];
  deleteRecords(engine, state, entityId, pick, tx);
  // 第 5 步：清状态实例（撤销到期项与修正项未建，S2-0c 接上）。
  clearStatusesOf(engine, state, entityId, tx);
  // 第 2 步：终止标记，按 R1 放在最后一笔状态写入。
  writePath(state, P.terminated(entityId), { [day.field]: Math.floor(minute / day.minutesPerDay), cause, mode }, tx);
  txEmit(tx, { verb: VERB_TERMINATED, payload: { id: entityId, cause, source, mode, successorId }, targets: [entityId] });
  const r = terminationResidue(engine, state, entityId);
  if (!r.ok) throw new KernelError('E-TERM-RESIDUE', {}, `terminate: residue left for ${entityId}: ${r.residue.join(', ')}`);
  return Object.freeze({ mode, successorId });
}
