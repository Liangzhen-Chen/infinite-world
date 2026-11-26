// 状态实例的最小写者（S2-0a；卷二 :586 statuses 的写者 status.mjs、卷二十一 :233 `statuses.<主体>.<实例>` 带实例 id；勘误 1126s20 落 rules/status/）。
// 只做三件：写一条实例、整体清除一个主体的实例（终止协议第 5 步，卷二 :557）、读视图（谓词与残留核对用）。
// 严重度推进、档效果等归卷二十一的卡。路径一律经句柄 P 与内核登记模式，不按任何主体、状态行或族 id 分支。

import { KernelError } from '../../kernel/errors.mjs';
import { writePath, matchPaths, deleteMatch, kindOfEntity } from '../../kernel/storage.mjs';
import { dim } from '../../kernel/dimensions.mjs';

/** @typedef {import('../lifecycle/records.mjs').LifeEngine} LifeEngine */

// 状态表的族维度键（卷二 §1.11、status.json dimensions.family）。
const STATUS_FAMILY_DIM = 'family';

// 实例路径的登记模式取自句柄 P 发出的路径（不手写模式串）；实参只用来让 P 发出一条合法路径。
/** @param {LifeEngine} engine @param {string} subjectId @returns {string} */
function instancePattern(engine, subjectId) {
  const { P } = engine;
  return P.statuses_status(subjectId, subjectId).pattern;
}

/**
 * 状态行的族维度在状态表里的声明（ref 的 vocab 即状态族所在的词表族，卷二 §1.11）：返回 {family: 该行的族条目代号, vocab: 词表族名}。
 * 不是带 family 维度的登记行即抛（dim 报 E-DIM-UNKNOWN-READ）。
 * @param {LifeEngine} engine @param {unknown} state @param {string} statusRef @returns {{family: string, vocab: string}}
 */
export function statusFamilyOf(engine, state, statusRef) {
  const kind = kindOfEntity(engine, state, statusRef);
  const family = String(dim(engine, state, kind, statusRef, STATUS_FAMILY_DIM).value);
  const def = Object(Object(Object(engine.registry.tables.get(kind)).dimensions)[STATUS_FAMILY_DIM]);
  return { family, vocab: String(def.vocab) };
}

/**
 * 写一条状态实例 `statuses.<主体>.<实例>.status = 状态行`（卷二十一 :233）。statusRef 须是带族维度的登记行，
 * 实例 id 由调用方给（卷二十一 :233 onset 即实例 id）；同一实例已存在即 E-DIM-ID-DUPLICATE。经 writePath 写，已终止主体照内核拒写。
 * @param {LifeEngine} engine @param {unknown} state @param {string} subjectId @param {string} instanceId @param {string} statusRef @param {unknown} tx
 */
export function addStatus(engine, state, subjectId, instanceId, statusRef, tx) {
  const { P } = engine;
  if (engine.registry.kindOfLoaded(statusRef) === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `status ${JSON.stringify(statusRef)}: not a loaded row`);
  statusFamilyOf(engine, state, statusRef);
  if (matchPaths(engine, state, instancePattern(engine, subjectId), { 0: subjectId, 1: instanceId }).length > 0) {
    throw new KernelError('E-DIM-ID-DUPLICATE', {}, `status instance ${JSON.stringify(instanceId)} of ${JSON.stringify(subjectId)} already exists`);
  }
  writePath(state, P.statuses_status(subjectId, instanceId), statusRef, tx);
}

/**
 * 读视图（卷二 :540 statusView）：该主体现有的全部状态实例 [{instance, status, family}]，按实例 id 排序，冻结。
 * family 取状态行的 family 维度（dim）；族条目的 terminal 等字段由谓词自己读（卷二 §2.5 terminal 的读者只有 action-capacity.mjs）。
 * @param {LifeEngine} engine @param {unknown} state @param {string} subjectId
 * @returns {ReadonlyArray<Readonly<{instance: string, status: string, family: string}>>}
 */
export function statusView(engine, state, subjectId) {
  return Object.freeze(matchPaths(engine, state, instancePattern(engine, subjectId), { 0: subjectId }).map(({ keys, value }) => {
    const status = String(value);
    return Object.freeze({ instance: keys[keys.length - 1], status, family: statusFamilyOf(engine, state, status).family });
  }));
}

/**
 * 整体清除一个主体的全部状态实例（终止协议第 5 步，卷二 :557）：按登记模式逐条整条删除（内核 deleteMatch）。
 * @param {LifeEngine} engine @param {unknown} state @param {string} subjectId @param {unknown} tx
 */
export function clearStatusesOf(engine, state, subjectId, tx) {
  const pattern = instancePattern(engine, subjectId);
  for (const { segs } of matchPaths(engine, state, pattern, { 0: subjectId })) deleteMatch(engine, state, pattern, segs, tx);
}
