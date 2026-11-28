// 规则层数据档 RX 的编译入口（S2-TP1 审 diff 必须改 1：原先 rules/act/catalog.mjs、rules/time_env/weather.mjs、rules/travel/circle.mjs 各拼一份编译环境）。
// 编译本身只走公共部件 kernel/validate/types.mjs#checkValue 的 rx 类型（加载期编译的唯一入口，kernel/rx.mjs 文件头）；本文件只负责拼作用域：
// 词表代号索引、已登记命名空间（state-owners rxNamespaces）、深度上限（rules.kernelConstants.rxMaxDepth），可选的规则表读视图（rules.<代号>.<键>）。
// 换编译环境只改本文件。
import { KernelError } from '../../kernel/errors.mjs';
import { checkValue } from '../../kernel/validate/types.mjs';
import { ruleValue } from './registry.mjs';

const RX_TYPE = Object.freeze({ type: 'rx' });
const KC = 'kernelConstants';
const RX_MAX_DEPTH = 'rxMaxDepth';

/** @typedef {Readonly<{vocabIndex: Map<string, {family: string, prefix: string}>, ns: unknown[], maxDepth: number, rules: unknown}>} RxScope */

/**
 * rxScopeOf：拼一次作用域（调用方编多条时复用）。vocab 是词表原文 {families}；docData 是世界数据副本（读 owners.rxNamespaces 与 kernelConstants）；rules 是规则表读视图，可缺。
 * @param {{vocab: unknown, docData: Parameters<typeof ruleValue>[0] & {owners?: unknown}, rules?: unknown}} world @returns {RxScope}
 */
export function rxScopeOf(world) {
  const families = Object(Object(world.vocab).families);
  /** @type {Map<string, {family: string, prefix: string}>} */
  const vocabIndex = new Map();
  for (const [family, rec] of Object.entries(families)) {
    for (const code of Object.keys(Object(Object(rec).entries))) vocabIndex.set(code, { family, prefix: Object(rec).prefix });
  }
  const declared = Object(world.docData.owners).rxNamespaces;
  return Object.freeze({ vocabIndex, ns: Array.isArray(declared) ? declared : [], maxDepth: Number(ruleValue(world.docData, KC, RX_MAX_DEPTH)), rules: world.rules });
}

/**
 * compileRuleRX：在作用域 scope 下按维度表 dims 编译 RX 文本 text，返回表达式树；编不过即抛 code（消息 `<where>: <原因>`）。
 * @param {RxScope} scope @param {unknown} text @param {Map<string, unknown>} dims @param {string} where @param {string} code @returns {unknown}
 */
export function compileRuleRX(scope, text, dims, where, code) {
  const env = { rxScope: { dims, vocabIndex: scope.vocabIndex, ns: scope.ns, maxDepth: scope.maxDepth, rules: scope.rules }, compiled: new Map() };
  /** @type {unknown[]} */
  const bad = [];
  checkValue(RX_TYPE, text, env, { path: where }, (/** @type {unknown} */ e) => { bad.push(e); });
  if (bad.length > 0) throw new KernelError(code, {}, `${where}: ${Object(bad[0]).want}`);
  return Object(env.compiled.get(where)).tree;
}
