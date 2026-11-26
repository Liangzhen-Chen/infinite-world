// 去留表（卷二 §2.6 :562「领域清理的两个登记点」第 2 条；勘误 1126s20 执行者落 rules/lifecycle/）。
// 登记在 state-owners.json 的 stateKeys.<键>.subjectRecords：{"<路径模式>": {recordClass, subjectSegments}}，
// subjectSegments 是第几个 `*` 段（从 1 起）为主体；去留取值在规则表 rules.terminate.records.<rcls_ 代号>。
// 三件：列主体名下的记录路径、按去留取值整条删除、覆盖核对（E-TERM-RECORD-UNLISTED）。只按登记数据判，不认任何键名或 kind。

import { KernelError } from '../../kernel/errors.mjs';
import { matchPaths, deleteMatch } from '../../kernel/storage.mjs';
import { GRAMMAR_TOKENS } from '../../kernel/handles.mjs';
import { ruleValue } from '../load/registry.mjs';

// 终止协议各文件收的 engine 形状（装配层 mountKernel 建的冻结 engine 的子集）。
/** @typedef {{P: Readonly<Record<string, (...args: string[]) => import('../../kernel/types.d.ts').StatePath<string>>>, registry: {tables: Map<string, unknown>, kindIds: Map<string, {idPrefix?: readonly string[], singletonIds?: readonly string[]}>, kindOfLoaded: (id: string) => string | undefined}, docData: unknown, vocab: unknown, terminationCleanups?: unknown}} LifeEngine */
/** 去留表一行的取值（规则表 rules.terminate.records.<rcls_>）。 @typedef {{atTerminate: string, atRevive?: string}} RecordValue */
/** subjectRecords 一行。 @typedef {{pattern: string, recordClass: string, subjectSegments: number[]}} SubjectRecordRow */

const TERMINATE = 'terminate';
const RECORDS = 'records';
const PROTOCOL_KEYS = 'protocolKeys';
// 类别行的终止公共字段名（卷二 §5.0、:553）。
const TERMINATION_FIELD = 'termination';

/** 装配层原样交入的 state-owners（engine.docData.owners）。 @param {LifeEngine} engine @returns {Record<string, unknown>} */
function ownersOf(engine) {
  const owners = Object(engine.docData).owners;
  if (owners === null || typeof owners !== 'object') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.docData.owners is required');
  return owners;
}

/** 全部 subjectRecords 登记行（按顶层键、模式排序，确定性）。 @param {LifeEngine} engine @returns {SubjectRecordRow[]} */
function subjectRecordRows(engine) {
  const keys = Object(ownersOf(engine).stateKeys);
  /** @type {SubjectRecordRow[]} */
  const out = [];
  for (const top of Object.keys(keys).sort()) {
    const recs = Object(keys[top]).subjectRecords;
    if (recs === undefined) continue;
    for (const pattern of Object.keys(Object(recs)).sort()) {
      const r = Object(recs[pattern]);
      /** @type {unknown[]} */
      const segs = Array.isArray(r.subjectSegments) ? r.subjectSegments : [];
      const nums = segs.filter((n) => typeof n === 'number' && Number.isInteger(n) && n >= 1).map(Number);
      if (typeof r.recordClass !== 'string' || nums.length === 0 || nums.length !== segs.length) {
        throw new KernelError('E-DIM-STRUCT-FIELD', {}, `subjectRecords ${JSON.stringify(pattern)}: needs recordClass and subjectSegments (1-based)`);
      }
      out.push({ pattern, recordClass: r.recordClass, subjectSegments: nums });
    }
  }
  return out;
}

/** 规则表 rules.terminate.records（按登记声明核）。 @param {LifeEngine} engine @returns {Readonly<Record<string, RecordValue>>} */
export function recordValues(engine) {
  return Object(ruleValue(Object(engine.docData), TERMINATE, RECORDS));
}

/**
 * 主体名下的记录路径（卷二 :562：模式里任一主体段等于该 id 即算）：[{pattern, segs, recordClass}]，去重，冻结。只读。
 * @param {LifeEngine} engine @param {unknown} state @param {string} id
 * @returns {ReadonlyArray<Readonly<{pattern: string, segs: readonly string[], recordClass: string}>>}
 */
export function subjectRecordPaths(engine, state, id) {
  const out = [];
  for (const row of subjectRecordRows(engine)) {
    const seen = new Set();
    for (const n of row.subjectSegments) {
      for (const { segs } of matchPaths(engine, state, row.pattern, { [n - 1]: id })) {
        const key = segs.join(GRAMMAR_TOKENS.pathSep);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(Object.freeze({ pattern: row.pattern, segs, recordClass: row.recordClass }));
      }
    }
  }
  return Object.freeze(out);
}

/**
 * 按去留取值整条删除主体名下的记录（卷二 :557 第 1 步、:563 窗口为 0 时 hold 同 clear）：pick 是要删的 atTerminate 取值集合。
 * 记录类在规则表里没有取值即 E-TERM-RECORD-UNLISTED。只删不改值（内核 deleteMatch）。
 * @param {LifeEngine} engine @param {unknown} state @param {string} id @param {ReadonlyArray<string>} pick @param {unknown} tx
 */
export function deleteRecords(engine, state, id, pick, tx) {
  const values = recordValues(engine);
  for (const r of subjectRecordPaths(engine, state, id)) {
    if (!Object.hasOwn(values, r.recordClass)) throw new KernelError('E-TERM-RECORD-UNLISTED', {}, `record class ${r.recordClass}: no value in rules.terminate.records`);
    if (pick.includes(values[r.recordClass].atTerminate)) deleteMatch(engine, state, r.pattern, r.segs, tx);
  }
}

/** 可终止实体类（卷二 :559「可终止实体类」①：类别行写了公共字段 termination 的表）。 @param {LifeEngine} engine @returns {Set<string>} */
export function terminableKinds(engine) {
  const out = new Set();
  for (const [kind, doc] of engine.registry.tables) {
    const classes = Object(Object(doc).classes);
    if (Object.keys(classes).some((c) => Object.hasOwn(Object(classes[c]), TERMINATION_FIELD))) out.add(kind);
  }
  return out;
}

/**
 * 覆盖核对（卷二 :562，勘误 1117rx7 的机器判定；加载期由装配层 rules/load/mount.mjs#mountKernel 调）：pathTypes 里凡有某个 `*` 段按 keyKinds 能取到可终止实体类 id 的模式，
 * 须由同一模式的 subjectRecords 把该段登记为主体，或顶层键属协议自处置的键（rules.terminate.protocolKeys），或属 textPaths；
 * 否则 E-TERM-RECORD-UNLISTED。subjectRecords 引用的记录类在 rules.terminate.records 里没有取值，同码。
 * @param {LifeEngine} engine
 */
export function checkRecordCoverage(engine) {
  const owners = ownersOf(engine);
  const terminable = terminableKinds(engine);
  const values = recordValues(engine);
  /** @type {unknown[]} */
  const protocol = Object.values(Object(ruleValue(Object(engine.docData), TERMINATE, PROTOCOL_KEYS)));
  /** @type {unknown[]} */
  const text = Array.isArray(owners.textPaths) ? owners.textPaths : [];
  const rows = subjectRecordRows(engine);
  for (const r of rows) {
    if (!Object.hasOwn(values, r.recordClass)) throw new KernelError('E-TERM-RECORD-UNLISTED', {}, `subjectRecords ${JSON.stringify(r.pattern)}: record class ${r.recordClass} has no value in rules.terminate.records`);
  }
  const keyKinds = Object(owners.keyKinds);
  for (const pattern of Object.keys(Object(owners.pathTypes)).sort()) {
    if (text.includes(pattern) || protocol.includes(pattern.split(GRAMMAR_TOKENS.pathSep)[0])) continue;
    /** @type {unknown[]} */
    const items = Array.isArray(keyKinds[pattern]) ? keyKinds[pattern] : [];
    items.forEach((item, i) => {
      /** @type {unknown[]} */
      const kinds = Array.isArray(item) ? item : [item];
      if (!kinds.some((k) => typeof k === 'string' && terminable.has(k))) return;
      if (!rows.some((r) => r.pattern === pattern && r.subjectSegments.includes(i + 1))) {
        throw new KernelError('E-TERM-RECORD-UNLISTED', {}, `pathTypes ${JSON.stringify(pattern)}: segment ${i + 1} can hold a terminable entity but no subjectRecords covers it`);
      }
    });
  }
}
