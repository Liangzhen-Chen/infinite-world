// 受限表达式 RX（卷二 §2.9 第 4 条）：compileRX 把数据侧表达式文本编成冻结的 rxTree（判别联合，键 op），
// evaluateRX(tree, bindings, nsReads) 是全书唯一的求值函数，纯函数，不碰状态。
// P-2 只做数据档（kernel/load 编 world/ 与 rules/ 文件）；显示档（slot、mod、broader）留到 outputGate 上线，调到即报错。
// 文本文法卷二没写（记 docs/问题.md）：本文件只收中缀算术、比较、与或非、括号、数字、点分名字，以及与变体同名的调用 agg(…)、member(…)。

import { fixedUnits, fixedAdd, fixedSub, fixedMultiply, fixedDivide, fixedToNumber, FixedError } from './det-math.mjs';

export class RxError extends Error {
  constructor(message, code) { super(message); this.code = code || 'E-MOD-RX'; }
}
const fail = (message, code) => { throw new RxError(message, code); };

// 两档各收哪些变体（§2.9 第 4 条"显示档与对 outputGate 开放"）。
const PROFILE_OPS = Object.freeze({
  data: new Set(['num', 'dim', 'handle', 'add', 'sub', 'mul', 'div', 'cmp', 'and', 'or', 'not', 'agg', 'clock', 'ns', 'member']),
});
const ARITH = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod' };
const CMP = { '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };
const CLOCK_FIELDS = new Set(['day', 'season']);

function tokenize(text) {
  if (typeof text !== 'string') fail('expression must be text');
  const re = /\s*(?:(\d+(?:\.\d+)?)|([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)|(==|!=|<=|>=|&&|\|\||[-+*/%<>()!,]))/y;
  const out = [];
  let at = 0;
  const end = text.trimEnd().length;
  while (at < end) {
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m) fail(`unexpected text at ${at}`);
    at = re.lastIndex;
    const [, numTok, nameTok, opTok] = m;
    if (numTok !== undefined) out.push({ k: 'num', v: numTok });
    else if (nameTok !== undefined) out.push({ k: 'name', v: nameTok });
    else out.push({ k: 'op', v: opTok });
  }
  out.push({ k: 'eof', v: '' });
  return out;
}

function parse(text, profile, scope) {
  const toks = tokenize(text);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v) => peek().k === 'op' && peek().v === v;
  const take = (v) => { if (!isOp(v)) fail(`expected ${v}`); i++; };
  const node = (n) => { if (!PROFILE_OPS[profile].has(n.op)) fail(`variant ${n.op} not allowed in ${profile} profile`); return n; };

  function orExpr() {
    const items = [andExpr()];
    while (isOp('||')) { i++; items.push(andExpr()); }
    return items.length === 1 ? items[0] : node({ op: 'or', items });
  }
  function andExpr() {
    const items = [notExpr()];
    while (isOp('&&')) { i++; items.push(notExpr()); }
    return items.length === 1 ? items[0] : node({ op: 'and', items });
  }
  function notExpr() {
    if (isOp('!')) { i++; return node({ op: 'not', item: notExpr() }); }
    return cmpExpr();
  }
  function cmpExpr() {
    const left = addExpr();
    const t = peek();
    if (t.k === 'op' && CMP[t.v]) { i++; return node({ op: 'cmp', cmpOp: CMP[t.v], left, right: addExpr() }); }
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
    if (isOp('-')) { i++; return node({ op: 'sub', left: node({ op: 'num', value: fixedToNumber(0n) }), right: unary() }); }
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
    if (t.k === 'num') { i++; return node({ op: 'num', value: fixedToNumber(fixedUnits(t.v)) }); }
    if (isOp('(')) { i++; const e = orExpr(); take(')'); return e; }
    if (t.k !== 'name') fail(`unexpected ${t.v || t.k}`);
    i++;
    if (isOp('(')) return call(t.v, args());
    return resolveName(t.v, profile, scope, node);
  }
  function call(name, list) {
    const handleOf = (n) => (n.op === 'handle' ? n.value : fail(`${name} needs a handle argument`));
    if (name === 'member') {
      const [item, set, ...rest] = list;
      if (!set || rest.length) fail('member(item, set) takes two arguments');
      return node({ op: 'member', item, set });
    }
    if (name === 'agg') {
      const [fn, rel, dim, filter, ...rest] = list;
      if (!rel || rest.length) fail('agg(fn, rel[, dim[, filter]]) arity');
      if (dim && dim.op !== 'dim') fail('agg dim argument must name a dimension');
      return node({ op: 'agg', fn: handleOf(fn), rel: handleOf(rel), dim: dim ? dim.key : null, filter: filter || null });
    }
    return fail(`unknown function ${name}`);
  }
  const tree = orExpr();
  if (peek().k !== 'eof') fail(`trailing ${peek().v}`);
  return tree;
}

// 名字的归属（数据档）：已登记命名空间（按段前缀唯一匹配）→ ns；clock.<字段> → clock；维度键 → dim；词表代号 → handle。
function resolveName(name, profile, scope, node) {
  const segs = name.split('.');
  const nsRow = (scope.ns || []).find((r) => {
    const rs = r.ns.split('.');
    return rs.every((s, k) => segs[k] === s);
  });
  if (nsRow) {
    const arg = segs.slice(nsRow.ns.split('.').length);
    return node(arg.length ? { op: 'ns', ns: nsRow.ns, arg } : { op: 'ns', ns: nsRow.ns });
  }
  const [head, field, ...more] = segs;
  if (head === 'clock' && field !== undefined && !more.length) {
    if (!CLOCK_FIELDS.has(field)) fail(`clock field ${field}`);
    return node({ op: 'clock', field });
  }
  if (scope.dims && scope.dims.has(name)) return node({ op: 'dim', key: name });
  if (scope.vocabIndex && scope.vocabIndex.has(name)) return node({ op: 'handle', value: name });
  if (segs.length > 1) return fail(`unregistered namespace in ${name}`, 'E-RX-NS-UNKNOWN');
  return fail(`unknown name ${name}`);
}

// RX 类型规则（§2.9 第 4 条第 1–3 点）：编译期能定的都在编译期核。
function typeOf(n, scope) {
  const want = (sub, ...types) => { const t = typeOf(sub, scope); if (t !== 'runtime' && !types.includes(t)) fail(`${n.op} operand is ${t}, needs ${types.join('/')}`); return t; };
  switch (n.op) {
    case 'num': return 'number';
    case 'handle': return 'handle';
    case 'dim': return dimRxType(scope.dims.get(n.key), n.key);
    case 'clock': return n.field === 'day' ? 'number' : 'handle';
    case 'ns': {
      const row = scope.ns.find((r) => r.ns === n.ns);
      const argc = (n.arg || []).length;
      if (argc !== row.argCount) fail(`namespace ${n.ns} takes ${row.argCount} segments, got ${argc}`);
      return row.type === 'field' ? 'runtime' : row.type;
    }
    case 'add': case 'sub': case 'mul': case 'div':
      want(n.left, 'number'); want(n.right, 'number'); return 'number';
    case 'cmp': {
      if (n.cmpOp === 'eq' || n.cmpOp === 'ne') {
        const a = typeOf(n.left, scope); const b = typeOf(n.right, scope);
        if (a !== 'runtime' && b !== 'runtime' && !sameKind(a, b)) fail(`cannot compare ${a} with ${b}`);
        return 'boolean';
      }
      want(n.left, 'number'); want(n.right, 'number'); return 'boolean';
    }
    case 'and': case 'or': n.items.forEach((x) => want(x, 'boolean')); return 'boolean';
    case 'not': want(n.item, 'boolean'); return 'boolean';
    case 'member':
      want(n.item, 'code', 'handle', 'codeOrHandle');
      if (n.set.op !== 'dim' || dimRxType(scope.dims.get(n.set.key), n.set.key, true) !== 'set') fail('member set must read a set dimension');
      return 'boolean';
    case 'agg': {
      if (n.filter) want(n.filter, 'boolean');
      const fam = scope.vocabIndex.get(n.fn);
      if (!fam || fam.family !== 'aggregate') fail(`agg fn ${n.fn} is not an aggregate handle`);
      const rel = scope.vocabIndex.get(n.rel);
      if (!rel || rel.family !== 'relation') fail(`agg rel ${n.rel} is not a relation handle`);
      const prim = n.fn.slice(fam.prefix.length);
      if (prim === 'exists') return 'boolean';
      if (prim === 'count') return 'number';
      return n.dim ? dimRxType(scope.dims.get(n.dim), n.dim) : 'number';
    }
    default: return fail(`unknown variant ${n.op}`);
  }
}
const sameKind = (a, b) => a === b || (a === 'codeOrHandle' && (b === 'code' || b === 'handle')) || (b === 'codeOrHandle' && (a === 'code' || a === 'handle'));

// 维度类型 → RX 读数类型（第 1 点 dim 一项）；set 只许作 member 的 set。
export function dimRxType(def, key, allowSet = false) {
  if (!def) return fail(`unknown dimension ${key}`);
  if (def.ambiguous) return fail(`dimension ${key} has different types in different tables`);
  const t = def.type;
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'enum') return 'handle';
  if (t === 'set' && allowSet) return 'set';
  if (t === 'ref') {
    const parts = def.refs || [def];
    const kinds = parts.filter((p) => p.kind || p.kinds).length;
    if (kinds === parts.length) return 'code';
    if (kinds === 0) return 'handle';
    return 'codeOrHandle';
  }
  return fail(`dimension ${key} of type ${t} cannot be read by RX`);
}

function depthOf(n) {
  const kids = [n.left, n.right, n.item, n.set, n.filter, ...(n.items || [])].filter((x) => x && typeof x === 'object');
  return 1 + kids.reduce((m, k) => Math.max(m, depthOf(k)), 0);
}

function deepFreeze(v) {
  if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); }
  return v;
}

// scope：{dims: Map<维度键, 类型定义>, vocabIndex: Map<代号, {family, prefix}>, ns: [{ns, argCount, type}], maxDepth}。
// 返回 {tree, nsRefs}；失败抛 RxError（E-MOD-RX；引用未登记命名空间时 code 为 E-RX-NS-UNKNOWN）。
export function compileRX(text, profile, scope) {
  if (!PROFILE_OPS[profile]) fail(`profile ${profile} not available (P-2 builds the data profile only)`);
  let tree;
  try { tree = parse(text, profile, scope); } catch (e) {
    if (e instanceof FixedError) fail(e.message);
    throw e;
  }
  typeOf(tree, scope);
  if (!(depthOf(tree) <= scope.maxDepth)) fail(`depth exceeds ${scope.maxDepth}`);
  const nsRefs = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.op === 'ns') nsRefs.push(nsKey(n));
    [n.left, n.right, n.item, n.set, n.filter, ...(n.items || [])].forEach(walk);
  };
  walk(tree);
  return deepFreeze({ tree, nsRefs: [...new Set(nsRefs)].sort() });
}

export const nsKey = (n) => (n.arg ? [n.ns, ...n.arg].join('.') : n.ns);

// ---------- 求值 ----------
// bindings：{dim: {<维度键>: 值}, clock: {day, season}}；nsReads：{<命名空间读数键>: 值}（键 = 代号与 arg 以点相连）。
// 数值一律按定点算（§3.3），结果按 JS 数交回。读数缺即求值失败（E-MOD-RX）。

const own = (o, k) => o !== null && typeof o === 'object' && Object.hasOwn(o, k);

function readValue(v) {
  if (typeof v === 'number') return { t: 'number', v: fixedUnits(v) };
  if (typeof v === 'boolean') return { t: 'boolean', v };
  if (typeof v === 'string') return { t: 'code', v };
  return fail('binding value must be a number, boolean or code');
}

export function evaluateRX(tree, bindings, nsReads) {
  const run = (n) => {
    switch (n.op) {
      case 'num': return { t: 'number', v: fixedUnits(n.value) };
      case 'handle': return { t: 'code', v: n.value };
      case 'dim': return own(bindings && bindings.dim, n.key) ? readValue(bindings.dim[n.key]) : fail(`no binding for dimension ${n.key}`);
      case 'clock': return own(bindings && bindings.clock, n.field) ? readValue(bindings.clock[n.field]) : fail(`no clock ${n.field}`);
      case 'ns': { const k = nsKey(n); return own(nsReads, k) ? readValue(nsReads[k]) : fail(`no namespace read ${k}`); }
      case 'add': return { t: 'number', v: fixedAdd(num(n.left), num(n.right)) };
      case 'sub': return { t: 'number', v: fixedSub(num(n.left), num(n.right)) };
      case 'mul': return { t: 'number', v: fixedMultiply(num(n.left), num(n.right)) };
      case 'div': return { t: 'number', v: fixedDivide(num(n.left), num(n.right)) };
      case 'cmp': {
        const a = run(n.left); const b = run(n.right);
        if (n.cmpOp === 'eq' || n.cmpOp === 'ne') {
          if (a.t !== b.t) fail('eq/ne operands differ in type');
          return { t: 'boolean', v: (a.v === b.v) === (n.cmpOp === 'eq') };
        }
        if (a.t !== 'number' || b.t !== 'number') fail('ordering needs numbers');
        const r = { lt: a.v < b.v, le: a.v <= b.v, gt: a.v > b.v, ge: a.v >= b.v }[n.cmpOp];
        return { t: 'boolean', v: r };
      }
      case 'and': return { t: 'boolean', v: n.items.every((x) => bool(x)) };
      case 'or': return { t: 'boolean', v: n.items.some((x) => bool(x)) };
      case 'not': return { t: 'boolean', v: !bool(n.item) };
      case 'member': {
        const item = run(n.item);
        const set = own(bindings && bindings.dim, n.set.key) ? bindings.dim[n.set.key] : fail(`no binding for dimension ${n.set.key}`);
        if (!Array.isArray(set)) fail('member set binding must be a list');
        return { t: 'boolean', v: set.includes(item.v) };
      }
      default: return fail(`variant ${n.op} has no evaluation source in P-2`);
    }
  };
  const num = (n) => { const r = run(n); return r.t === 'number' ? r.v : fail('number expected'); };
  const bool = (n) => { const r = run(n); return r.t === 'boolean' ? r.v : fail('boolean expected'); };
  try {
    const r = run(tree);
    return r.t === 'number' ? fixedToNumber(r.v) : r.v;
  } catch (e) {
    if (e instanceof FixedError) fail(e.message);
    throw e;
  }
}
