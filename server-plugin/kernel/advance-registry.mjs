// 推进钩子与推进计划的登记处（卷二 §2.7 kernelApi :583–584 `registerAdvanceHook`、`registerAdvancePlan`；§2.9 第 0 条"推进计划与心跳推进"；
// 卷二十七 R27-1.10；块 4 体检 K4-11、K4-28）。方案 §1.2 第 11 行 :54 定不搬旧 advance-registry（旧文件 import 领域模块、方向反）：本文件新写。
// 规则层在模块加载时把函数交进来（与 registerTerminationCleanup、registerHoldWhileRecompute 同一做法），内核只调交进来的函数，不 import 规则层。
// 钩子的阶段、先后与 sortKey 只在 state-owners.json `systems.<名>.phase` 登记（卷二 §2.7 :773），节拍与相位偏移只在 rules.clock（卷二十 §2.1 :130–131）；
// 本文件不读这两处、不认任何具体钩子名，只收函数并在调度器要时交出。

import { KernelError } from './errors.mjs';
import { isModuleFile, isLowerCamelCode } from './handles/patterns.mjs';

/**
 * @typedef {(engine: any, state: any, beat: {unit: string, minute: number}) => void} HookHandler
 * 一个钩子在一个单元的一拍上执行一次（卷二十 §4.1.3 第 2、3 条；单元取推进计划 struct:advancePlanItem.unit）。
 * @typedef {{file: string, run: HookHandler}} HookEntry
 * file：钩子函数所在文件（相对 server-plugin/，与 stateKeys.writers 同写法），调度器开事务时作写者核对用（卷二 §2.6 第 3 条）。
 * @typedef {(engine: any, state: any, before: number, after: number) => {unit: string, tierOrder: number, stepMinutes: number, settleTo: number}[]} PlanProvider
 * 卷二 §2.9 第 0 条 provider 类型；返回 list<struct:advancePlanItem>（卷二 §1.5，字段归卷二十七 §3.1）。
 */

/** @type {Map<string, HookEntry>} */
const hooks = new Map();
/** @type {PlanProvider | null} */
let plan = null;

/**
 * kernelApi `registerAdvanceHook(hook, file, handler)`：规则层交入一个推进钩子的函数。hook 是 state-owners.json 某系统 `phase` 下登记的钩子代号
 * （登记与否由调度器建钩子来源时对照声明表核对，这里只核形状）；同一钩子交两次即 E-PHASE-HOOK-DUPLICATE（与声明表同名钩子多系统登记同码，整类）。
 * @param {string} hook @param {string} file @param {HookHandler} handler
 * @returns {void}
 */
export function registerAdvanceHook(hook, file, handler) {
  if (!isLowerCamelCode(hook)) throw new KernelError('E-DIM-ID-FORMAT', {}, `registerAdvanceHook: hook ${JSON.stringify(hook)} is not a hook code`);
  if (!isModuleFile(file)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registerAdvanceHook ${hook}: file must be a module path relative to server-plugin/`);
  if (typeof handler !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registerAdvanceHook ${hook}: handler must be a function`);
  if (hooks.has(hook)) throw new KernelError('E-PHASE-HOOK-DUPLICATE', {}, `registerAdvanceHook: hook ${hook} already registered`);
  hooks.set(hook, Object.freeze({ file, run: handler }));
}

/**
 * kernelApi `registerAdvancePlan(provider)`：规则层交入推进计划 provider（卷二十七 advancePlan，块 6 卷二十七 §4.1 卡）。只许交入一次（E-WRITER-DUPLICATE，同 registerHoldWhileRecompute）。
 * @param {PlanProvider} provider
 * @returns {void}
 */
export function registerAdvancePlan(provider) {
  if (typeof provider !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'registerAdvancePlan: provider must be a function');
  if (plan) throw new KernelError('E-WRITER-DUPLICATE', {}, 'advance plan provider already registered');
  plan = provider;
}

/** 已交入的钩子（kernel/scheduler.mjs 用；kernel 组内，不在 kernelApi）。没有交入为 undefined。 @param {string} hook @returns {HookEntry | undefined} */
export function advanceHook(hook) {
  return hooks.get(hook);
}

/** 已交入钩子的代号，升序。 @returns {string[]} */
export function advanceHookNames() {
  return [...hooks.keys()].sort();
}

/** 已交入的推进计划 provider；没有为 null（块 6 卷二十七 §4.1 卡交入之前恒为 null）。 @returns {PlanProvider | null} */
export function advancePlanProvider() {
  return plan;
}

/** 测试与重新挂接用：清掉已交入的钩子与 provider（kernel 组内用）。 */
export function resetAdvanceRegistry() {
  hooks.clear();
  plan = null;
}
