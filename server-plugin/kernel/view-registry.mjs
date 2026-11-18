// 视图读取函数的登记处（李白 11-18 05:28 裁定①第 2–4 条：照 advance-registry 同法，规则层向内核登记"视图读取函数"，
// 内核与账本审计按登记名调用，不 import 规则层、不绕过视图直读原始状态；卷二十七 S27-2 :242 他卷只经 §3.1 入口读 aggregates.*）。
// 规则层在模块加载时把读取函数交进来（与 registerAdvanceHook 同一做法），内核只调交进来的函数。本文件不认任何具体视图名、
// 不读 state，只收函数并在要时交出；查不到即 E-DIM-UNKNOWN-READ、不放行（裁定①第 3 条）。返回值的形状由调用方按所需字段核对。

import { KernelError } from './errors.mjs';

/**
 * @typedef {(engine: any, state: any, id: string) => unknown} ViewReader
 * 一个视图读取函数：纯读，按主体 id 给出该视图的返回对象（没有这一条为 null 或 undefined）。
 * @typedef {{file: string, read: ViewReader}} ViewEntry
 * file：读取函数所在文件（相对 server-plugin/，与 registerAdvanceHook 同写法）。
 */

/** @type {Map<string, ViewEntry>} */
const views = new Map();

const NAME_RE = /^[a-z][a-zA-Z0-9_]{0,47}$/;
const FILE_RE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_.-]*\.mjs$/;

/**
 * kernelApi `registerViewReader(name, file, reader)`：规则层交入一个视图读取函数（如卷十九 §3.2 :242 `buildProjectView`、卷二十七 §3.1 `aggregateView`）。
 * 同一名交两次即 E-WRITER-DUPLICATE（一视图一出口，同 registerAdvancePlan）。
 * @param {string} name @param {string} file @param {ViewReader} reader
 * @returns {void}
 */
export function registerViewReader(name, file, reader) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new KernelError('E-DIM-ID-FORMAT', {}, `registerViewReader: name ${JSON.stringify(name)} is not a view name`);
  if (typeof file !== 'string' || !FILE_RE.test(file)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registerViewReader ${name}: file must be a module path relative to server-plugin/`);
  if (typeof reader !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registerViewReader ${name}: reader must be a function`);
  if (views.has(name)) throw new KernelError('E-WRITER-DUPLICATE', {}, `registerViewReader: view ${name} already registered`);
  views.set(name, Object.freeze({ file, read: reader }));
}

/**
 * 按登记名调视图读取函数（kernel 组内用，不在 kernelApi）。没有交入即 E-DIM-UNKNOWN-READ（不默认通过）。
 * @param {string} name @param {any} engine @param {any} state @param {string} id
 * @returns {unknown}
 */
export function readView(name, engine, state, id) {
  const entry = views.get(name);
  if (!entry) throw new KernelError('E-DIM-UNKNOWN-READ', { entity: id }, `view reader ${name} is not registered (registerViewReader; not let through)`);
  return entry.read(engine, state, id);
}

/** 已交入的视图名，升序。 @returns {string[]} */
export function viewReaderNames() {
  return [...views.keys()].sort();
}

/** 测试与重新挂接用：清掉已交入的视图读取函数（kernel 组内用）。 */
export function resetViewRegistry() {
  views.clear();
}
