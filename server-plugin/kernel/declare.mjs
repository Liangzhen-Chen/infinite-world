// 依赖声明（卷二 §2.3 :470–471"记忆与依赖声明"；§2.7 kernelApi :575 declareInputs；:828"依赖声明由代码 declareInputs 登记，加载期写回本表 systems[*].inputs"）。
// 规则层在模块加载时调 declareInputs(node, {impl, own, uses}) 登记三类节点（view:、relation:、scope:）；`dim:<kind>` 与 `modified:<kind>` 不由代码声明，
// 由加载器按维度表机器生成（:470）。加载期 finalizeInputs 对 uses 做传递闭包（环即 E-VIEW-DEPS-CYCLE），得每个节点的最终依赖数组，算一次、冻结、按名复用
// （kernel/memo.mjs#inputsOf 返回同一对象，:471）。只按登记数据处理，不认任何具体节点、表或路径。
// declareStateWriter、declareLedgerWriter（:576–577）本卡不需要，随用到它们的那张卡建。

import { KernelError } from './errors.mjs';
import { isDeclarableNode, isAnyNode } from './handles/keys.mjs';
import { T, GRAMMAR_TOKENS } from './handles/markers.mjs';
const SEG = Object.freeze({ empty: '' });

// 可由代码声明的三类节点（:470）与加载器机器生成的两类（:470 末句）。

/** @typedef {string | {path: string[], categories?: string[]}} OwnItem 声明里 own 的一项：路径段列表（字串数组）或带 categories 的路径。 */
/** @typedef {{impl: string[], own: (string[] | {path: string[], categories?: string[]})[], uses: string[], foldsOverDays?: boolean}} Declaration */

/** @type {Map<string, Declaration>} */
let declared = new Map();
/** @type {null | Map<string, readonly string[]>} */
let closures = null;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== SEG.empty);

// own 的一项规整成一个依赖串（路径段以 `.` 相连；带 categories 的在后面附 `[cat,…]`），供闭包求并、排序与比对。
function ownKey(item) {
  if (Array.isArray(item)) return item.join(GRAMMAR_TOKENS.pathSep);
  const cats = Array.isArray(item.categories) && item.categories.length ? `[${[...item.categories].sort().join(',')}]` : '';
  return `${item.path.join(GRAMMAR_TOKENS.pathSep)}${cats}`;
}

function badDecl(node, detail) {
  return new Error(`kernel/declare.mjs: declareInputs(${JSON.stringify(node)}): ${detail}`); // 接口调用错误，不带登记码（卷二 §4.3 勘误 1118b25）
}

/**
 * kernelApi `declareInputs(node, {impl, own, uses})`（§2.3）。模块加载时登记；同一节点只许登记一次。
 * impl：本节点的实现函数组（函数名）；own：本节点直读的状态路径（段列表，或 {path, categories}）；uses：本节点调用的其他节点名。
 * 节点名不合三类文法、字段形状不对、重复登记、加载期定稿之后再登记，都是调用方程序缺陷：抛不带登记码的 Error（卷二 §4.3 勘误 1118b25）。
 * @param {string} node
 * @param {Declaration} decl
 * @returns {void}
 */
export function declareInputs(node, decl) {
  if (closures) throw new Error(`kernel/declare.mjs: declareInputs(${node}) after finalizeInputs (load order)`);
  if (!isDeclarableNode(node)) throw badDecl(node, 'node must be view:<name>, relation:<id> or scope:<id>');
  if (!isObj(decl)) throw badDecl(node, 'declaration must be an object {impl, own, uses}');
  for (const k of Object.keys(decl)) if (!T.decl_field.is(k)) throw badDecl(node, `unknown field ${k}`);
  if (!strList(decl.impl) || !decl.impl.length) throw badDecl(node, 'impl must be a non-empty list of function names');
  const ownOk = Array.isArray(decl.own) && decl.own.every((o) => strList(o) || (isObj(o) && strList(o.path) && (o.categories === undefined || strList(o.categories))));
  if (!ownOk) throw badDecl(node, 'own must be a list of path segment lists or {path, categories}');
  if (!strList(decl.uses) || !decl.uses.every((u) => isAnyNode(u))) throw badDecl(node, 'uses must be a list of node names');
  if (decl.foldsOverDays !== undefined && typeof decl.foldsOverDays !== 'boolean') throw badDecl(node, 'foldsOverDays must be boolean');
  if (declared.has(node)) throw new Error(`kernel/declare.mjs: declareInputs: ${node} declared twice`);
  declared.set(node, Object.freeze({
    impl: Object.freeze([...decl.impl]),
    own: Object.freeze(decl.own.map((o) => (Array.isArray(o) ? Object.freeze([...o]) : Object.freeze({ path: Object.freeze([...o.path]), ...(o.categories ? { categories: Object.freeze([...o.categories]) } : {}) })))),
    uses: Object.freeze([...decl.uses]),
    ...(decl.foldsOverDays !== undefined ? { foldsOverDays: decl.foldsOverDays } : {}),
  }));
}

/**
 * 加载期定稿（kernel/load/world.mjs 在校验通过后调一次）：生成 `dim:<kind>`、`modified:<kind>`，对全部节点的 uses 做传递闭包，冻结。
 * generated：kind → {dim: {own, uses}, modified: {own, uses}}（own 为依赖串列表，uses 为节点名列表），由加载器按维度表算出（:470 末句）；
 * `modified:<kind>` 另自动含 `dim:<kind>`。uses 指向未声明也未生成的节点抛不带登记码的 Error；成环 E-VIEW-DEPS-CYCLE（码义 §2.3）。失败时不留半截结果。
 * @param {Map<string, {dim: {own: string[], uses: string[]}, modified: {own: string[], uses: string[]}}>} generated
 * @returns {Map<string, readonly string[]>} 节点名 → 冻结的依赖数组（与 inputsOf 返回同一对象）
 */
export function finalizeInputs(generated) {
  /** @type {Map<string, {own: string[], uses: readonly string[]}>} */
  const nodes = new Map();
  for (const [node, d] of declared) nodes.set(node, { own: d.own.map(ownKey), uses: d.uses });
  for (const [kind, g] of [...generated].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    for (const name of [`dim:${kind}`, `modified:${kind}`]) if (nodes.has(name)) throw new Error(`kernel/declare.mjs: finalizeInputs: ${name} is machine-generated and must not be declared by code`);
    nodes.set(`dim:${kind}`, { own: [...g.dim.own], uses: [...g.dim.uses] });
    nodes.set(`modified:${kind}`, { own: [...g.modified.own], uses: [`dim:${kind}`, ...g.modified.uses] });
  }
  for (const [node, n] of nodes) for (const u of n.uses) if (!nodes.has(u)) throw new Error(`kernel/declare.mjs: finalizeInputs: ${node} uses ${u}: not declared`);
  const out = new Map();
  const visiting = new Set();
  const visit = (node, trail) => {
    if (out.has(node)) return out.get(node);
    if (visiting.has(node)) throw new KernelError('E-VIEW-DEPS-CYCLE', {}, `dependency cycle: ${[...trail, node].join(' -> ')}`);
    visiting.add(node);
    const n = nodes.get(node);
    const acc = new Set(n.own);
    for (const u of n.uses) for (const x of visit(u, [...trail, node])) acc.add(x);
    visiting.delete(node);
    const frozen = Object.freeze([...acc].sort());
    out.set(node, frozen);
    return frozen;
  };
  for (const node of [...nodes.keys()].sort()) visit(node, []);
  closures = out;
  return out;
}

/**
 * 节点的最终依赖数组（kernel/memo.mjs#inputsOf 经它取；每次返回同一冻结对象，:471）。未定稿或未声明即抛不带登记码的 Error（调用方程序缺陷）。
 * @param {string} node
 * @returns {readonly string[]}
 */
export function closureOf(node) {
  if (!closures) throw new Error('kernel/declare.mjs: inputsOf before finalizeInputs (load order)');
  const c = closures.get(node);
  if (!c) throw new Error(`kernel/declare.mjs: inputsOf: ${node} not declared`);
  return c;
}

/**
 * 加载期写回 systems[*].inputs（§2.7 :828"只读镜像，供卷十二比对"）：一个声明节点归哪个系统，按系统登记项的 view 与 predicates
 * （`<文件>#<函数名>`）里的函数名落在该节点 impl 组内判定；归属按登记数据推出，不认具体系统或节点。返回 系统名 → {节点名: 冻结依赖数组}。
 * 须在 finalizeInputs 之后调。kernel 组内用。
 * @param {Record<string, any>} systems state-owners.json 的 systems
 * @returns {Map<string, Record<string, readonly string[]>>}
 */
export function inputsBySystem(systems) {
  if (!closures) throw new Error('kernel/declare.mjs: inputsBySystem before finalizeInputs (load order)');
  const out = new Map();
  for (const name of Object.keys(isObj(systems) ? systems : {}).sort()) {
    const s = systems[name];
    const entries = [s && s.view, ...(s && Array.isArray(s.predicates) ? s.predicates : [])].filter((e) => typeof e === 'string' && e.includes('#'));
    const fns = new Set(entries.map((e) => e.slice(e.indexOf('#') + 1)));
    const inputs = {};
    for (const [node, d] of [...declared].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (d.impl.some((f) => fns.has(f))) inputs[node] = closures.get(node);
    }
    out.set(name, Object.freeze(inputs));
  }
  return out;
}

/** 测试与重新挂接用：清空登记与定稿（kernel 组内用）。 */
export function resetDeclarations() {
  declared = new Map();
  closures = null;
}

/** 测试与重新加载用：只清定稿，保留模块加载时的登记（kernel 组内用）。 */
export function resetFinalized() {
  closures = null;
}
