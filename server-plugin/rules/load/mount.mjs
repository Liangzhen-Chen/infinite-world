// 内核装配（卷二 :608、:859、:1033；state-owners.json assembly.calls 的 mountKernel）：
// 由已读入的世界数据建 engine（路径句柄 P、host、存档布局、原语目录、推进钩子、摘要能力与两个指纹）与初始 state、日志簿，
// 返回 {engine, state, logBook, submitProposal, advance, save}（S1-1 卡 B2）。
// 本文件不读盘（rules 层不许引 node:fs，world 数据由装配层 index.mjs 读入后传入），状态只经登记写者的初始化函数在一笔事务里建。
import { buildRegistry } from './registry.mjs';
import { makePathHandles } from '../../kernel/handles.mjs';
import { installNamedStructs } from '../../kernel/named-structs.mjs';
import { buildState, submitProposal } from '../../kernel/transaction.mjs';
import { advance, advanceRequest, initClock } from '../../kernel/scheduler.mjs';
import { createLogBook, tickEnd, docOf, writeSlot, dataPacksDigestOf, engineRulesDigestOf } from '../../kernel/save.mjs';
import { clone } from '../../kernel/bytes.mjs';
import { checkValue } from '../../kernel/validate/types.mjs';
import { KernelError } from '../../kernel/errors.mjs';

/**
 * 取键表（structure "keys"）一键的值并按登记声明核（卷二十七 :190：缺行或不合取值域即加载失败）。声明来自 registry.json 的该表登记行
 * （type[key] 给类型与单位，domain[key] 给取值域）；判定交公共部件 validate/types.mjs#checkValue，不另写一份。
 * @param {any[]} rows @param {any} spec registry.json 的该表登记行 @param {string} key @returns {any}
 */
function tableValue(rows, spec, key) {
  const fail = (/** @type {string} */ why) => new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.${spec && spec.code}.${key}: ${why}`);
  const decl = spec && spec.type ? spec.type[key] : undefined;
  if (decl === undefined) throw fail('no registry declaration');
  const row = rows.find((/** @type {any} */ r) => r.key === key);
  if (!row || !Object.hasOwn(row, 'value')) throw fail('row missing');
  const def = { ...(typeof decl === 'string' ? { type: decl } : decl), nullable: false, domain: spec.domain ? spec.domain[key] : undefined };
  /** @type {any} */
  let bad = null;
  checkValue(def, row.value, {}, {}, (/** @type {any} */ e) => { if (bad === null) bad = e; });
  if (bad !== null) throw fail(`${JSON.stringify(row.value)} violates ${bad.want}`);
  return row.value;
}

/** 键表按登记的全部键取值（键集合来自登记行 type，不在代码里列）。 @param {Array<{key: string, value: unknown}>} rows @param {{code: string, type: Record<string, unknown>}} spec @returns {Readonly<Record<string, unknown>>} */
const tableValues = (rows, spec) => Object.freeze(Object.fromEntries(Object.keys(spec.type).map((k) => [k, tableValue(rows, spec, k)])));

// 本卡只实现整片一个文件的分片方式（卷二十七 :553 part_single；族 partition 见卷二十七 :130）。后续加分片方式时同改本处与 kernel/save.mjs。
const SUPPORTED_PARTITION = 'part_single';

/**
 * 分片表覆盖核对（卷二十七 :556，一处判）：逻辑文档的每一部分须恰有一行、方式为本卡实现的那一种，表里也不许有文档外的部分；
 * 不合即 E-SAVE-SHARD-UNCOVERED（出现未实现的方式同此，不逐种分支）。
 * @param {unknown} shards rules.saveLayout.shards（登记类型 map，装配期已按声明核过） @param {string[]} parts 逻辑文档的部分名
 */
function checkShards(shards, parts) {
  const rows = new Map(Object.entries(Object(shards)));
  const covered = parts.every((p) => rows.get(p) === SUPPORTED_PARTITION) && [...rows.keys()].every((p) => parts.includes(p));
  if (!covered) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, 'rules.saveLayout.shards must map every docpart to a supported partition');
}

/**
 * @param {{dimensionDocs: any[], namedStructsDoc: any, owners: any, hostRows: any[], hostSpec: any, saveLayoutRows: any[], saveLayoutSpec: any, digestExclude: string[], primitivesDoc: any}} world
 *   装配层读入的世界数据；整份即存档的世界数据副本 doc_data（卷二十七 :543）
 * @param {{digestCap: {sha256Hex: (data: string, encoding: 'utf8' | 'base64') => string}, saveRoot: URL, sources: Array<{path: string, text: string}>}} caps
 *   装配层注入：摘要能力（卷二 :1060）、存档根目录、源码清单（engineRulesDigest 用）
 */
export function mountKernel(world, caps) {
  const docData = clone(world);
  const { dimensionDocs, namedStructsDoc, owners, hostRows, hostSpec, saveLayoutRows, saveLayoutSpec, digestExclude, primitivesDoc } = docData;
  const registry = buildRegistry(dimensionDocs);
  const structs = installNamedStructs(namedStructsDoc);
  // 顶层状态键的登记表（state-owners.json 的 stateKeys，卷二 §2.7 :580）；内核按它判 writePath 的顶层键是否已声明。
  const stateKeys = Object.freeze({ ...(owners && owners.stateKeys ? owners.stateKeys : {}) });
  // 路径句柄 P：按 pathTypes / keyKinds / textPaths 在加载期生成，规则层只能经 engine.P 得到读写路径（卷二 §2.6 :536）。
  const P = makePathHandles(owners.pathTypes || {}, owners.keyKinds || {}, owners.textPaths || []);
  // 规则表 host（推进步长 :190、槽位数 :191 等）与 saveLayout（快照间隔、保留数、封段条数、分片表、布局名）按登记声明逐键核后取值。
  const host = tableValues(hostRows, hostSpec);
  const saveLayout = tableValues(saveLayoutRows, saveLayoutSpec);
  const primitives = new Map(primitivesDoc.primitives.map((/** @type {any} */ p) => [p.op, p]));
  const { digestCap, saveRoot, sources } = caps;
  // 提交后推进由本层注入 engine.advance（transaction 不 import scheduler，免成环）；openStates 记「事务已开」的 state（不嵌套）。
  /** @type {any} */
  const engine = Object.freeze({
    registry, structs, modifierSources: Object.freeze([]), stateKeys, P, host, saveLayout, primitives,
    advanceHooks: Object.freeze([]), openStates: new WeakSet(),
    advance: (/** @type {object} */ st, /** @type {import('../../kernel/save.mjs').LogBook} */ book, /** @type {number} */ m) => advance(engine, st, book, m),
    docData, digestExclude: Object.freeze([...digestExclude]), digestCap, saveRoot,
    engineRulesDigest: engineRulesDigestOf({ digestCap }, sources),
    dataPacksDigest: dataPacksDigestOf({ digestCap }, docData),
  });
  const built = buildState(engine, [initClock]);
  const logBook = createLogBook();
  // 装配期核分片表覆盖（卷二十七 :556），再拍开局 0 号快照。
  checkShards(saveLayout.shards, Object.keys(docOf(engine, built, logBook)));
  tickEnd(engine, built, logBook);
  const live = { engine, state: built, logBook };
  return {
    ...live,
    submitProposal: (/** @type {any} */ p) => submitProposal(engine, built, logBook, p),
    advance: (/** @type {number} */ m) => advanceRequest(engine, built, logBook, m),
    save: (/** @type {number} */ slot) => writeSlot(engine, live, slot),
  };
}
