// 受限表达式 RX（卷二 §2.9 第 4 条）：compileRX 把数据侧表达式文本编成冻结的 rxTree（判别联合，键 op），
// evaluateRX(tree, bindings, nsReads) 是全书唯一的求值函数，纯函数，不碰状态。
// P-2 只做数据档（kernel/load 编 world/ 与 rules/ 文件）；显示档（slot、mod、broader）留到 outputGate 上线，调到即报错。
// 文本文法卷二没写（记 docs/问题.md）：本文件只收中缀算术、比较、与或非、括号、数字、点分名字，以及与变体同名的调用 agg(…)、member(…)。
// 与或非另收卷文数据行的单词写法 and、or、not（卷四 §4.7.5 diet `eats`）；`集 has 项` 是 member(项, 集) 的中缀写法（同处）。

import { fixedUnits, fixedAdd, fixedSub, fixedMultiply, fixedDivide, fixedToNumber, FixedError } from './det-math.mjs';
import { rxTokenAt, shapeArgCount, setFieldNames } from './handles/patterns.mjs';
import { T, GRAMMAR_TOKENS } from './handles/markers.mjs';

// 本文件内部的记号表（卷二没写文本语法，见文件头；只在 rx.mjs 用的单一定义，成员引用取代裸字面量比较）。
// TOK：词法记号种类；PROFILE：编译档代号（卷二 §2.9 第 4 条"显示档与对 outputGate 开放"）；
// FAMILY：RX 读入口返回形状登记里用到的词表族名（卷二 §1.9 前缀表 aggregate→agg_、relation→rel_）；AGG_PRIM：卷二 §1.12 聚合原语（exists、count）。
// 命名空间登记行的"随字段"读法记号（field）不在此定义，取 kernel/handles/markers.mjs 的 T.ns_row_type.field（卷二 §2.9 :1195）。
const TOK = Object.freeze({ num: 'num', name: 'name', op: 'op', eof: 'eof' });
const PROFILE = Object.freeze({ data: 'data' });
const FAMILY = Object.freeze({ aggregate: 'aggregate', relation: 'relation' });
const AGG_PRIM = Object.freeze({ exists: 'exists', count: 'count', known: 'known' });
// 数据档读规则表值的名字根（卷二 §2.9 第 4 条，封卷后勘误 1118k31）：`rules.<表代号>.<键>[.<子键>…]` 在加载期取值，
// 数值编成 num、已登记代号编成 handle；别的形状与缺键即编译失败（E-MOD-RX）。
export const NAME_ROOT = Object.freeze({ rules: 'rules' });

/**
 * @property {string | undefined} [key]
 */
export class RxError extends Error {
  constructor(message, code) { super(message); this.code = code || 'E-MOD-RX'; }
}
const fail = (message, code) => { throw new RxError(message, code); };

// 两档各收哪些变体（§2.9 第 4 条"显示档与对 outputGate 开放"）。
const PROFILE_OPS = Object.freeze({
  data: new Set([T.rx_op.num, T.rx_op.dim, T.rx_op.handle, T.rx_op.add, T.rx_op.sub, T.rx_op.mul, T.rx_op.div, T.rx_op.cmp, T.rx_op.and, T.rx_op.or, T.rx_op.not, T.rx_op.agg, T.rx_op.clock, T.rx_op.ns, T.rx_op.member]),
});
const ARITH = { '+': T.rx_op.add, '-': T.rx_op.sub, '*': T.rx_op.mul, '/': T.rx_op.div, '%': T.rx_op.mod };
const CMP = { '==': T.code_enum.rx_cmp.eq, '!=': T.code_enum.rx_cmp.ne, '<': T.code_enum.rx_cmp.lt, '<=': T.code_enum.rx_cmp.le, '>': T.code_enum.rx_cmp.gt, '>=': T.code_enum.rx_cmp.ge };
const CLOCK_FIELDS = new Set([T.code_enum.rx_clock.day, T.code_enum.rx_clock.season]);
// 序比较的操作数判定函数，键是 rx_cmp 句柄（不以字串字面量作判断表，S13 ④）；eq/ne 在上一层先判。
const ORDERING = new Map([
  [T.code_enum.rx_cmp.lt, (x, y) => x < y],
  [T.code_enum.rx_cmp.le, (x, y) => x <= y],
  [T.code_enum.rx_cmp.gt, (x, y) => x > y],
  [T.code_enum.rx_cmp.ge, (x, y) => x >= y],
]);
const WORD_OPS = Object.freeze({ and: '&&', or: '||', not: '!', has: 'has' });

function tokenize(text) {
  if (typeof text !== 'string') fail('expression must be text');
  const out = [];
  let at = 0;
  const end = text.trimEnd().length;
  while (at < end) {
    const m = rxTokenAt(text, at);
    if (!m) fail(`unexpected text at ${at}`);
    at = m.end;
    const [numTok, nameTok, opTok] = m.groups;
    if (numTok !== undefined) out.push({ k: TOK.num, v: numTok });
    else if (Object.hasOwn(WORD_OPS, nameTok)) out.push({ k: TOK.op, v: WORD_OPS[nameTok] });
    else if (nameTok !== undefined) out.push({ k: TOK.name, v: nameTok });
    else out.push({ k: TOK.op, v: opTok });
  }
  out.push({ k: TOK.eof, v: '' });
  return out;
}

function parse(text, profile, scope) {
  const toks = tokenize(text);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v) => peek().k === TOK.op && peek().v === v;
  const take = (v) => { if (!isOp(v)) fail(`expected ${v}`); i++; };
  const node = (n) => { if (!PROFILE_OPS[profile].has(n.op)) fail(`variant ${n.op} not allowed in ${profile} profile`); return n; };

  function orExpr() {
    const items = [andExpr()];
    while (isOp('||')) { i++; items.push(andExpr()); }
    return items.length === 1 ? items[0] : node({ op: T.rx_op.or, items });
  }
  function andExpr() {
    const items = [notExpr()];
    while (isOp('&&')) { i++; items.push(notExpr()); }
    return items.length === 1 ? items[0] : node({ op: T.rx_op.and, items });
  }
  function notExpr() {
    if (isOp('!')) { i++; return node({ op: T.rx_op.not, item: notExpr() }); }
    return cmpExpr();
  }
  function cmpExpr() {
    const left = addExpr();
    const t = peek();
    if (t.k === TOK.op && CMP[t.v]) { i++; return node({ op: T.rx_op.cmp, cmpOp: CMP[t.v], left, right: addExpr() }); }
    if (isOp('has')) { i++; return node({ op: T.rx_op.member, item: addExpr(), set: left }); }
    return left;
  }
  function addExpr() {
    let left = mulExpr();
    while (isOp('+') || isOp('-')) { const op = ARITH[peek().v]; i++; left = node({ op, left, right: mulExpr() }); }
    return left;
  }
  function mulExpr() {
    let left = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = ARITH[peek().v]; i++; left = node({ op, left, right: unary() }); }
    return left;
  }
  function unary() {
    if (isOp('-')) { i++; return node({ op: T.rx_op.sub, left: node({ op: T.rx_op.num, value: fixedToNumber(0n) }), right: unary() }); }
    return primary();
  }
  function args() {
    take('(');
    const list = [];
    if (!isOp(')')) { list.push(orExpr()); while (isOp(',')) { i++; list.push(orExpr()); } }
    take(')');
    return list;
  }
  function primary() {
    const t = peek();
    if (t.k === TOK.num) { i++; return node({ op: T.rx_op.num, value: fixedToNumber(fixedUnits(t.v)) }); }
    if (isOp('(')) { i++; const e = orExpr(); take(')'); return e; }
    if (t.k !== TOK.name) fail(`unexpected ${t.v || t.k}`);
    i++;
    if (isOp('(')) return call(t.v, args());
    if (isOp(GRAMMAR_TOKENS.subOpen)) return subscript(t.v);
    return resolveName(t.v, profile, scope, node);
  }
  // `map维[下标]`：读本主体 map 型维度的一个键，编成带下标的 DimKey（卷二 :1613）；下标须在编译期定成代号或数值。
  function subscript(name) {
    i++;
    const sub = orExpr();
    take(GRAMMAR_TOKENS.subClose);
    if (sub.op !== T.rx_op.handle && sub.op !== T.rx_op.num) fail(`subscript of ${name} must be a fixed code or number`);
    const def = scope.dims && scope.dims.get(name);
    if (!def || def.type !== T.type.map) fail(`${name} is not a map dimension`);
    return node({ op: T.rx_op.dim, key: `${name}${GRAMMAR_TOKENS.subOpen}${sub.value}${GRAMMAR_TOKENS.subClose}` });
  }
  function call(name, list) {
    const handleOf = (n) => (n.op === T.rx_op.handle ? n.value : fail(`${name} needs a handle argument`));
    if (name === T.rx_op.member) {
      const [item, set, ...rest] = list;
      if (!set || rest.length) fail('member(item, set) takes two arguments');
      return node({ op: T.rx_op.member, item, set });
    }
    if (name === T.rx_op.agg) {
      const [fn, rel, dim, filter, ...rest] = list;
      if (!rel || rest.length) fail('agg(fn, rel[, dim[, filter]]) arity');
      if (dim && dim.op !== T.rx_op.dim) fail('agg dim argument must name a dimension');
      return node({ op: T.rx_op.agg, fn: handleOf(fn), rel: handleOf(rel), dim: dim ? dim.key : null, filter: filter || null });
    }
    // 无关系原语（§1.12 表；勘误 1118k31）：按原语名找 aggregate 族里登记的条目，rel 为 null，参数放 args。
    const fn = aggregateHandle(name, scope);
    if (fn !== undefined) return node({ op: T.rx_op.agg, fn, rel: null, dim: null, filter: null, args: list });
    return fail(`unknown function ${name}`);
  }
  const tree = orExpr();
  if (peek().k !== TOK.eof) fail(`trailing ${peek().v}`);
  return tree;
}

// 名字的归属（数据档）：已登记命名空间（按段前缀唯一匹配）→ ns；clock.<字段> → clock；维度键 → dim；词表代号 → handle。
function resolveName(name, profile, scope, node) {
  const segs = name.split(GRAMMAR_TOKENS.pathSep);
  const nsRow = (scope.ns || []).find((r) => {
    const rs = r.ns.split(GRAMMAR_TOKENS.pathSep);
    return rs.every((s, k) => segs[k] === s);
  });
  if (nsRow) {
    const arg = segs.slice(nsRow.ns.split(GRAMMAR_TOKENS.pathSep).length);
    return node(arg.length ? { op: T.rx_op.ns, ns: nsRow.ns, arg } : { op: T.rx_op.ns, ns: nsRow.ns });
  }
  const [head, field, ...more] = segs;
  if (head === NAME_ROOT.rules) return node(ruleConstant(name, segs.slice(1), scope));
  if (head === T.rx_op.clock && field !== undefined && !more.length) {
    if (!CLOCK_FIELDS.has(field)) fail(`clock field ${field}`);
    return node({ op: T.rx_op.clock, field });
  }
  if (scope.dims && scope.dims.has(name)) return node({ op: T.rx_op.dim, key: name });
  if (scope.vocabIndex && scope.vocabIndex.has(name)) return node({ op: T.rx_op.handle, value: name });
  // 已登记的未建名（_unbuilt-derived.json names，勘误 1118k31）：只有交了 unbuiltNames 的作用域（规则表条件）收，编成句柄并由调用方按未命中处理。
  if (scope.unbuiltNames && scope.unbuiltNames.has(name)) return node({ op: T.rx_op.handle, value: name });
  if (segs.length > 1) return fail(`unregistered namespace in ${name}`, 'E-RX-NS-UNKNOWN');
  return fail(`unknown name ${name}`);
}

// 规则表值（勘误 1118k31）：加载期从 scope.rules 按段取；数值编成 num，已登记代号编成 handle；缺表、缺键或别的形状编译失败。
function ruleConstant(name, path, scope) {
  let v = scope.rules;
  for (const seg of path) v = v !== null && typeof v === 'object' && !Array.isArray(v) && Object.hasOwn(v, seg) ? v[seg] : undefined;
  if (!path.length || v === undefined) return fail(`rules value ${name} is not registered`);
  if (typeof v === 'number') return { op: T.rx_op.num, value: fixedToNumber(fixedUnits(v)) };
  if (typeof v === 'string' && scope.vocabIndex && scope.vocabIndex.has(v)) return { op: T.rx_op.handle, value: v };
  return fail(`rules value ${name} is not a number or a registered code`);
}

// 无关系原语的句柄：aggregate 族里后缀等于原语名的已登记条目；族未登记或没有该条目即 undefined。
function aggregateHandle(name, scope) {
  if (!scope.vocabIndex || !Object.values(AGG_PRIM).includes(name)) return undefined;
  for (const [code, rec] of scope.vocabIndex) if (rec.family === FAMILY.aggregate && code === rec.prefix + name) return code;
  return undefined;
}

// 原语名：句柄去掉族前缀（§1.9 前缀以第一个 `_` 结束）。求值时没有词表，按代号文法取。
const primOf = (fn) => fn.slice(fn.indexOf('_') + 1);

/** 带下标的 DimKey 拆成维代号与下标（卷二 :1613）；不带下标的 sub 为 undefined。@param {string} key */
export function splitDimKey(key) {
  const at = key.indexOf(GRAMMAR_TOKENS.subOpen);
  if (at < 0 || !key.endsWith(GRAMMAR_TOKENS.subClose)) return { dim: key, sub: undefined };
  return { dim: key.slice(0, at), sub: key.slice(at + 1, -1) };
}

// 维度键对应的类型定义：带下标的读 map 维度的值类型（单位随值）。
function dimDefOf(dims, key) {
  const { dim, sub } = splitDimKey(key);
  const def = dims.get(dim);
  if (sub === undefined || !def || def.type !== T.type.map) return sub === undefined ? def : undefined;
  return def.value;
}

/** rxTree 一个节点的全部子树（各遍历共用）。@param {any} n @returns {any[]} */
export function rxChildren(n) {
  return [n.left, n.right, n.item, n.set, n.filter, ...(n.items || []), ...(n.args || [])].filter((x) => x && typeof x === 'object');
}

// RX 类型规则（§2.9 第 4 条第 1–3 点）：编译期能定的都在编译期核。
function typeOf(n, scope) {
  const want = (sub, ...types) => { const t = typeOf(sub, scope); if (t !== T.rx_kind.runtime && !types.includes(t)) fail(`${n.op} operand is ${t}, needs ${types.join('/')}`); return t; };
  switch (n.op) {
    case T.rx_op.num: return 'number';
    case T.rx_op.handle: return 'handle';
    case T.rx_op.dim: return dimRxType(dimDefOf(scope.dims, n.key), n.key);
    case T.rx_op.clock: return n.field === T.code_enum.rx_clock.day ? 'number' : 'handle';
    case T.rx_op.ns: {
      const row = scope.ns.find((r) => r.ns === n.ns);
      const argc = (n.arg || []).length;
      const want = nsArgCount(row);
      if (argc !== want) fail(`namespace ${n.ns} takes ${want} segments, got ${argc}`);
      // 登记形状里写明的 set 型字段：这种读法不是读数，只许作 member 的 set（§2.9 第 4 条第 1 点）。
      if (argc === 1 && nsSetFields(row).has(n.arg[0])) return 'set';
      return row.type === T.ns_row_type.field ? T.rx_kind.runtime : row.type;
    }
    case T.rx_op.add: case T.rx_op.sub: case T.rx_op.mul: case T.rx_op.div:
      want(n.left, 'number'); want(n.right, 'number'); return 'number';
    case T.rx_op.cmp: {
      if (n.cmpOp === T.code_enum.rx_cmp.eq || n.cmpOp === T.code_enum.rx_cmp.ne) {
        const a = typeOf(n.left, scope); const b = typeOf(n.right, scope);
        if (a === T.rx_kind.set || b === T.rx_kind.set) fail('a set field is only a member set, not a value');
        if (a !== T.rx_kind.runtime && b !== T.rx_kind.runtime && !sameKind(a, b)) fail(`cannot compare ${a} with ${b}`);
        return 'boolean';
      }
      want(n.left, 'number'); want(n.right, 'number'); return 'boolean';
    }
    case T.rx_op.and: case T.rx_op.or: n.items.forEach((x) => want(x, 'boolean')); return 'boolean';
    case T.rx_op.not: want(n.item, 'boolean'); return 'boolean';
    case T.rx_op.member:
      want(n.item, 'code', 'handle', 'codeOrHandle');
      // set 读 set 型维度，或读已登记命名空间里一个登记为 set 型的字段（§2.9 第 4 条第 1 点）；别的一律编译失败。
      if (n.set.op === T.rx_op.ns) { if (typeOf(n.set, scope) !== T.rx_kind.set) fail('member set must read a set dimension or a registered set field'); }
      else if (n.set.op !== T.rx_op.dim || dimRxType(scope.dims.get(n.set.key), n.set.key, true) !== T.rx_kind.set) fail('member set must read a set dimension');
      return 'boolean';
    case T.rx_op.agg: {
      if (n.filter) want(n.filter, 'boolean');
      const fam = scope.vocabIndex.get(n.fn);
      if (!fam || fam.family !== FAMILY.aggregate) fail(`agg fn ${n.fn} is not an aggregate handle`);
      if (n.rel === null) {
        // 无关系原语（勘误 1118k31）：只建了 known（参数恰一个，读维度或命名空间读数，结果布尔）。
        const prim = n.fn.slice(fam.prefix.length);
        if (prim !== AGG_PRIM.known) fail(`primitive ${prim} has no relation-free form built`);
        if (n.args.length !== 1 || (n.args[0].op !== T.rx_op.dim && n.args[0].op !== T.rx_op.ns)) fail('known(x) takes one dimension or namespace read');
        typeOf(n.args[0], scope);
        return 'boolean';
      }
      const rel = scope.vocabIndex.get(n.rel);
      if (!rel || rel.family !== FAMILY.relation) fail(`agg rel ${n.rel} is not a relation handle`);
      const prim = n.fn.slice(fam.prefix.length);
      if (prim === AGG_PRIM.exists) return 'boolean';
      if (prim === AGG_PRIM.count) return 'number';
      return n.dim ? dimRxType(scope.dims.get(n.dim), n.dim) : 'number';
    }
    default: return fail(`unknown variant ${n.op}`);
  }
}
// 命名空间行的 arg 段数不另设列（§2.9 第 4 条第 1 点五列封闭）：由"返回形状"列推出——形状里每个 `<…>` 占位是一段 arg
// （单值的形状如 fraction 不含占位，不带 arg；`<字段>.<句柄>` 两段）。
// 无返回形状（推不出）即登记行违反第 1 点，按 §2.9 第 4 条第 3 点报 E-RX-NS-UNKNOWN，不取默认值。
/** @param {{ns?: string, shape?: string}} row 命名空间登记行 @returns {number} */
export const nsArgCount = (row) => {
  if (!row || typeof row.shape !== 'string') return fail(`namespace row ${row && row.ns} has no return shape`, 'E-RX-NS-UNKNOWN');
  return shapeArgCount(row.shape);
};
// 返回形状里写明"（set，只作 member 的 set）"的字段名：`<字段>（set，只作 member 的 set）`，由登记行判，不按命名空间名特判。
/** @param {{ns?: string, shape: string}} row 命名空间登记行 @returns {Set<string>} */
export const nsSetFields = (row) => new Set(setFieldNames(row.shape));
const sameKind =(a, b) => a === b || (a === T.rx_kind.codeOrHandle && (b === T.rx_kind.code || b === T.rx_kind.handle)) || (b === T.rx_kind.codeOrHandle && (a === T.rx_kind.code || a === T.rx_kind.handle));

// 维度类型 → RX 读数类型（第 1 点 dim 一项）；set 只许作 member 的 set。
/** @param {Record<string, any>} def 维度类型定义 @param {string} key 维度键 @param {boolean} [allowSet] */
export function dimRxType(def, key, allowSet = false) {
  if (!def) return fail(`unknown dimension ${key}`);
  if (def.ambiguous) return fail(`dimension ${key} has different types in different tables`);
  const t = def.type;
  if (t === T.type.number || t === T.type.integer) return 'number';
  if (t === T.type.boolean) return 'boolean';
  if (t === T.type.enum) return 'handle';
  if (t === T.type.set && allowSet) return 'set';
  if (t === T.type.ref) {
    const parts = def.refs || [def];
    const kinds = parts.filter((p) => p.kind || p.kinds).length;
    if (kinds === parts.length) return 'code';
    if (kinds === 0) return 'handle';
    return 'codeOrHandle';
  }
  return fail(`dimension ${key} of type ${t} cannot be read by RX`);
}

function depthOf(n) {
  return 1 + rxChildren(n).reduce((m, k) => Math.max(m, depthOf(k)), 0);
}

function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

// 对外接口（卷二 :1222"compileRX(text, profile) 的公开签名不变"；kernelApi :609 只开给 output-gate/display-load.mjs 的显示档）。
// 两档编译都要调用方给的闭集（数据档：维度、词表、命名空间登记与深度上限；显示档：绑定名闭集，:1166），两参拿不到，
// 记 docs/问题.md。P-2：数据档由 kernel/validate 在加载期经 compileRXInScope 编；显示档未做。两种调用这里都报 E-MOD-RX。
/** @param {unknown} text 表达式树 @param {string} profile 编译档 */
export function compileRX(text, profile) {
  if (profile === PROFILE.data) return fail('data profile is compiled at load time by kernel/validate (compileRXInScope)');
  return fail(`profile ${profile} not available (P-2 builds the data profile only)`);
}

// 加载期编译（只给 kernel/validate 用）。scope：{dims: Map<维度键, 类型定义>, vocabIndex: Map<代号, {family, prefix}>, ns: [{ns, type, shape, …}], maxDepth}。
// 返回 {tree, nsRefs}；失败抛 RxError（E-MOD-RX；引用未登记命名空间时 code 为 E-RX-NS-UNKNOWN）。
/**
 * @param {unknown} text 表达式树 @param {string} profile 编译档
 * @param {{dims: Map<string, Record<string, unknown>>, vocabIndex: Map<string, {family: string, prefix: string}>, ns: {ns: string, type: string, shape: string}[], maxDepth: number, unbuiltNames?: Set<string>}} scope
 */
export function compileRXInScope(text, profile, scope) {
  if (!PROFILE_OPS[profile]) fail(`profile ${profile} not available (P-2 builds the data profile only)`);
  let tree;
  try { tree = parse(text, profile, scope); } catch (e) {
    if (e instanceof FixedError) fail(e.message);
    throw e;
  }
  if (typeOf(tree, scope) === T.rx_kind.set) fail('a set field is only a member set, not a value');
  if (!(depthOf(tree) <= scope.maxDepth)) fail(`depth exceeds ${scope.maxDepth}`);
  const nsRefs = [];
  const unbuiltRefs = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.op === T.rx_op.ns) nsRefs.push(nsKey(n));
    if (n.op === T.rx_op.handle && scope.unbuiltNames && scope.unbuiltNames.has(n.value)) unbuiltRefs.push(n.value);
    rxChildren(n).forEach(walk);
  };
  walk(tree);
  return deepFreeze({ tree, nsRefs: [...new Set(nsRefs)].sort(), unbuiltRefs: [...new Set(unbuiltRefs)].sort() });
}

/** @param {{ns: string, arg?: string[]}} n 命名空间读数节点 @returns {string} */
export const nsKey = (n) => (n.arg ? [n.ns, ...n.arg].join(GRAMMAR_TOKENS.pathSep) : n.ns);

// ---------- 求值 ----------
// bindings：{dim: {<维度键>: 值}, clock: {day, season}}；nsReads：{<命名空间读数键>: 值}（键 = 代号与 arg 以点相连）。
// 数值一律按定点算（§3.3），结果按 JS 数交回。读数缺即求值失败（E-MOD-RX）。

const own = (o, k) => o !== null && typeof o === 'object' && Object.hasOwn(o, k);
// 缺读数的求值失败带上缺的读数键（RxError.key），让调用方分清"该键是已知的没有"与"该键未知"。
const missing = (message, key) => {
  /** @type {RxError & {key?: string}} */
  const e = new RxError(message);
  e.key = key;
  throw e;
};

function readValue(v) {
  if (typeof v === 'number') return { t: 'number', v: fixedUnits(v) };
  if (typeof v === 'boolean') return { t: 'boolean', v };
  if (typeof v === 'string') return { t: 'code', v };
  // 只有四种读数类型（§2.9 第 4 条 :1174），没有第五种：显式 null（"没有"，§1.6 :254）由调用方按字段定义处的含义处理，不交进求值器。
  return fail('binding value must be a number, boolean or code');
}

/**
 * @param {unknown} tree 编译后的表达式树
 * @param {{dim?: Record<string, any>, clock?: Record<string, any>}} bindings 变量绑定
 * @param {Record<string, any>} nsReads 命名空间读数（键为 nsKey）
 */
export function evaluateRX(tree, bindings, nsReads) {
  const run = (n) => {
    switch (n.op) {
      case T.rx_op.num: return { t: 'number', v: fixedUnits(n.value) };
      case T.rx_op.handle: return { t: 'code', v: n.value };
      case T.rx_op.dim: return own(bindings && bindings.dim, n.key) ? readValue(bindings.dim[n.key]) : missing(`no binding for dimension ${n.key}`, n.key);
      case T.rx_op.clock: return own(bindings && bindings.clock, n.field) ? readValue(bindings.clock[n.field]) : fail(`no clock ${n.field}`);
      case T.rx_op.ns: { const k = nsKey(n); return own(nsReads, k) ? readValue(nsReads[k]) : missing(`no namespace read ${k}`, k); }
      case T.rx_op.add: return { t: 'number', v: fixedAdd(num(n.left), num(n.right)) };
      case T.rx_op.sub: return { t: 'number', v: fixedSub(num(n.left), num(n.right)) };
      case T.rx_op.mul: return { t: 'number', v: fixedMultiply(num(n.left), num(n.right)) };
      case T.rx_op.div: return { t: 'number', v: fixedDivide(num(n.left), num(n.right)) };
      case T.rx_op.cmp: {
        const a = run(n.left); const b = run(n.right);
        if (n.cmpOp === T.code_enum.rx_cmp.eq || n.cmpOp === T.code_enum.rx_cmp.ne) {
          if (a.t !== b.t) fail('eq/ne operands differ in type');
          return { t: 'boolean', v: (a.v === b.v) === (n.cmpOp === T.code_enum.rx_cmp.eq) };
        }
        if (a.t !== T.rx_kind.number || b.t !== T.rx_kind.number) fail('ordering needs numbers');
        const ordering = ORDERING.get(n.cmpOp);
        return { t: 'boolean', v: ordering ? ordering(a.v, b.v) : undefined };
      }
      case T.rx_op.and: return { t: 'boolean', v: n.items.every((x) => bool(x)) };
      case T.rx_op.or: return { t: 'boolean', v: n.items.some((x) => bool(x)) };
      case T.rx_op.not: return { t: 'boolean', v: !bool(n.item) };
      case T.rx_op.member: {
        const item = run(n.item);
        const k = n.set.op === T.rx_op.ns ? nsKey(n.set) : null;
        const set = k !== null ? (own(nsReads, k) ? nsReads[k] : missing(`no namespace read ${k}`, k))
          : own(bindings && bindings.dim, n.set.key) ? bindings.dim[n.set.key] : missing(`no binding for dimension ${n.set.key}`, n.set.key);
        if (!Array.isArray(set)) fail('member set binding must be a list');
        return { t: 'boolean', v: set.includes(item.v) };
      }
      // 无关系原语 known(x)（勘误 1118k31）：x 有读数为真，缺读数（未知）为假；唯一不按未知传播的原语。
      case T.rx_op.agg: {
        if (n.rel !== null || primOf(n.fn) !== AGG_PRIM.known) return fail(`variant ${n.op} has no evaluation source in P-2`);
        try { run(n.args[0]); return { t: 'boolean', v: true }; } catch (e) {
          if (e instanceof RxError && e.key !== undefined) return { t: 'boolean', v: false };
          throw e;
        }
      }
      default: return fail(`variant ${n.op} has no evaluation source in P-2`);
    }
  };
  const num = (n) => { const r = run(n); return r.t === T.rx_kind.number ? r.v : fail('number expected'); };
  const bool = (n) => { const r = run(n); return r.t === T.rx_kind.boolean ? r.v : fail('boolean expected'); };
  try {
    const r = run(tree);
    return r.t === T.rx_kind.number ? fixedToNumber(r.v) : r.v;
  } catch (e) {
    if (e instanceof FixedError) fail(e.message);
    throw e;
  }
}
