// 内核装配（卷二 :608、:859、:1033；state-owners.json assembly.calls 的 mountKernel）：
// 由已读入的世界数据建 engine（路径句柄 P、host、原语目录、推进钩子）与初始 state，返回 {engine, state, submitProposal, advance}。
// 本文件不读盘（rules 层不许引 node:fs，world 数据由装配层 index.mjs 读入后传入），状态只经登记写者的初始化函数在一笔事务里建。
import { buildRegistry } from './registry.mjs';
import { makePathHandles } from '../../kernel/handles.mjs';
import { installNamedStructs } from '../../kernel/named-structs.mjs';
import { buildState, submitProposal, initLog } from '../../kernel/transaction.mjs';
import { advance, initClock } from '../../kernel/scheduler.mjs';
import { checkValue } from '../../kernel/validate/types.mjs';
import { KernelError } from '../../kernel/errors.mjs';

/**
 * 取 host 表一键的值并按登记声明核（卷二十七 :190：缺行或不合取值域即加载失败）。声明来自 registry.json 的 host 行
 * （type[key] 给类型与单位，domain[key] 给取值域）；判定交公共部件 validate/types.mjs#checkValue，不另写一份。
 * @param {any[]} hostRows @param {any} hostSpec registry.json 的 host 登记行 @param {string} key @returns {any}
 */
function hostValue(hostRows, hostSpec, key) {
  const fail = (/** @type {string} */ why) => new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.host.${key}: ${why}`);
  const decl = hostSpec && hostSpec.type ? hostSpec.type[key] : undefined;
  if (decl === undefined) throw fail('no registry declaration');
  const row = hostRows.find((/** @type {any} */ r) => r.key === key);
  if (!row || !Object.hasOwn(row, 'value')) throw fail('row missing');
  const def = { ...(typeof decl === 'string' ? { type: decl } : decl), nullable: false, domain: hostSpec.domain ? hostSpec.domain[key] : undefined };
  /** @type {any} */
  let bad = null;
  checkValue(def, row.value, {}, {}, (/** @type {any} */ e) => { if (bad === null) bad = e; });
  if (bad !== null) throw fail(`${JSON.stringify(row.value)} violates ${bad.want}`);
  return row.value;
}

/**
 * @param {{dimensionDocs: any[], namedStructsDoc: any, owners: any, hostRows: any[], hostSpec: any, primitivesDoc: any}} world 装配层读入的世界数据
 * @returns {{engine: any, state: any, submitProposal: (p: any) => any, advance: (m: number) => any}}
 */
export function mountKernel(world) {
  const { dimensionDocs, namedStructsDoc, owners, hostRows, hostSpec, primitivesDoc } = world;
  const registry = buildRegistry(dimensionDocs);
  const structs = installNamedStructs(namedStructsDoc);
  // 顶层状态键的登记表（state-owners.json 的 stateKeys，卷二 §2.7 :580）；内核按它判 writePath 的顶层键是否已声明。
  const stateKeys = Object.freeze({ ...(owners && owners.stateKeys ? owners.stateKeys : {}) });
  // 路径句柄 P：按 pathTypes / keyKinds / textPaths 在加载期生成，规则层只能经 engine.P 得到读写路径（卷二 §2.6 :536）。
  const P = makePathHandles(owners.pathTypes || {}, owners.keyKinds || {}, owners.textPaths || []);
  // 推进步长：规则表 host 的 heartbeatStepMinutes（卷二十七 :190）；原语目录 primitives.json 按 op 建索引。
  const host = Object.freeze({ heartbeatStepMinutes: hostValue(hostRows, hostSpec, 'heartbeatStepMinutes') });
  const primitives = new Map(primitivesDoc.primitives.map((/** @type {any} */ p) => [p.op, p]));
  // 提交后推进由本层注入 engine.advance（transaction 不 import scheduler，免成环）；openStates 记「事务已开」的 state（不嵌套）。
  /** @type {any} */
  const engine = Object.freeze({
    registry, structs, modifierSources: Object.freeze([]), stateKeys, P, host, primitives,
    advanceHooks: Object.freeze([]), openStates: new WeakSet(),
    advance: (/** @type {any} */ st, /** @type {number} */ m) => advance(engine, st, m),
  });
  const built = buildState(engine, [initClock, initLog]);
  return { engine, state: built, submitProposal: (/** @type {any} */ p) => submitProposal(engine, built, p), advance: (/** @type {number} */ m) => advance(engine, built, m) };
}
