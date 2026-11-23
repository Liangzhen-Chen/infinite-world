// 语法树读取（公共部件检查 C0；亮圳 11-22 23:xx：任何检查代码都不许靠认字面文字来判，李白更正裁定 msg-1122-2255-c0ast）。
// 用 acorn 解析（只许 tools/accept 引用；server-plugin 不得引用，由 pp_no_acorn_runtime 守），在语法树上做：
//   作用域与绑定（import、var/let/const、函数形参、函数声明、对象与数组解构、类）；
//   取值来源 origins(node)：把别名、解构、计算属性名（常量折叠得出的下标）、.bind、条件与逻辑表达式、对象字面量成员、
//     局部函数的返回值、局部函数形参（取所有调用点传入的实参来源，并保留形参自己的名字）、全局对象前缀，跟到原名；
//   常量折叠 fold(node)：字面量、模板串、+ 拼接、const 别名、从相对 import 来的 const；
//   动态下标：下标折叠不出常量的取成员（obj[k]）记为 dynamic，由调用方决定报不报（标“待人审”）。
// 局限（词法之外仍追不到的，说明文件“会漏什么”照实写）：对象属性被后续赋值改写、数组元素传递、闭包里被重新赋值的 let、
//   eval 与 new Function、跨文件的函数返回值与跨文件形参传递、动态 import 的运行期说明符、通过 Reflect/Proxy 取成员。
import * as acorn from 'acorn';
import { posix } from 'node:path';

const UNKNOWN = Object.freeze({ unknown: true });
const GLOBAL_OBJECTS = ['globalThis', 'window', 'self', 'global'];

// ---------- 解析与作用域 ----------

class Scope {
  constructor(parent, fn) { this.parent = parent; this.fn = fn; this.vars = new Map(); }
  lookup(name) { for (let s = this; s; s = s.parent) { if (s.vars.has(name)) return s.vars.get(name); } return null; }
}

export function parse(src) {
  return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowReturnOutsideFunction: true });
}

const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const keyName = (p) => (!p.computed && p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null);

function declarePattern(scope, pat, kind, info, keyPath) {
  if (!pat) return;
  switch (pat.type) {
    case 'Identifier': scope.vars.set(pat.name, { name: pat.name, kind, idNode: pat, keyPath, ...info }); break;
    case 'ObjectPattern':
      for (const p of pat.properties) {
        if (p.type === 'RestElement') declarePattern(scope, p.argument, kind, info, keyPath.concat(['*rest']));
        else declarePattern(scope, p.value, kind, info, keyPath.concat([p.computed ? '*dynamic' : keyName(p)]));
      }
      break;
    case 'ArrayPattern': pat.elements.forEach((e, i) => declarePattern(scope, e, kind, info, keyPath.concat([`[${i}]`]))); break;
    case 'AssignmentPattern': declarePattern(scope, pat.left, kind, pat.left.type === 'Identifier' ? { ...info, dflt: pat.right } : info, keyPath); break;
    case 'RestElement': declarePattern(scope, pat.argument, kind, info, keyPath.concat(['*rest'])); break;
    default: break;
  }
}

// 遍历全部子节点（不依赖 acorn-walk）。
function children(node) {
  const out = [];
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type' || k.startsWith('__')) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') out.push(x); } else if (v && typeof v.type === 'string') out.push(v);
  }
  return out;
}
export { children };

// 给每个节点盖 __parent 与 __scope（该节点所在的最内层作用域）。返回根作用域。
function annotate(ast) {
  const root = new Scope(null, null);
  const hoistVar = (scope) => { let s = scope; while (s.parent && !s.fn) s = s.parent; return s; };
  function declareStmt(node, scope) {
    // 本块级与函数级的声明先登记（函数声明与 var 提升）。
    for (const st0 of node.body || []) {
      const st = (st0.type === 'ExportNamedDeclaration' || st0.type === 'ExportDefaultDeclaration') && st0.declaration ? st0.declaration : st0;
      if (st.type === 'FunctionDeclaration' && st.id) scope.vars.set(st.id.name, { name: st.id.name, kind: 'function', node: st, idNode: st.id, keyPath: [] });
      else if (st.type === 'ClassDeclaration' && st.id) scope.vars.set(st.id.name, { name: st.id.name, kind: 'class', node: st, idNode: st.id, keyPath: [] });
      else if (st.type === 'ImportDeclaration') {
        for (const sp of st.specifiers) {
          // 具名导入取导出名，默认导入记 'default'，命名空间导入（import * as）记 null。
          const imported = sp.type === 'ImportSpecifier' ? (sp.imported.name ?? String(sp.imported.value)) : sp.type === 'ImportDefaultSpecifier' ? 'default' : null;
          scope.vars.set(sp.local.name, { name: sp.local.name, kind: 'import', source: st.source.value, imported, idNode: sp.local, keyPath: [] });
        }
      }
    }
  }
  function visit(node, parent, scope) {
    node.__parent = parent; node.__scope = scope;
    let inner = scope;
    switch (node.type) {
      case 'Program': declareStmt(node, scope); break;
      case 'BlockStatement': case 'StaticBlock':
        inner = new Scope(scope, null); node.__scope = inner; declareStmt(node, inner); break;
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': case 'SwitchStatement':
        inner = new Scope(scope, null); node.__scope = inner; break;
      case 'CatchClause':
        inner = new Scope(scope, null); node.__scope = inner;
        if (node.param) declarePattern(inner, node.param, 'param', { fn: null }, []);
        break;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        inner = new Scope(scope, node); node.__fnScope = inner;
        if (node.type === 'FunctionExpression' && node.id) inner.vars.set(node.id.name, { name: node.id.name, kind: 'function', node, idNode: node.id, keyPath: [] });
        node.params.forEach((p, i) => declarePattern(inner, p, 'param', { fn: node, index: i }, []));
        break;
      }
      case 'ClassExpression': break;
      case 'VariableDeclaration': {
        const target = node.kind === 'var' ? hoistVar(scope) : scope;
        for (const d of node.declarations) declarePattern(target, d.id, node.kind, { init: d.init, declarator: d, decl: node }, []);
        break;
      }
      default: break;
    }
    // 函数体：函数自己的作用域里再放 body 的声明（body 是 BlockStatement，会自建块作用域，函数声明提升到它里面即可）。
    for (const c of children(node)) {
      // 函数的子节点（形参、体）用函数作用域；形参默认值也在函数作用域。
      visit(c, node, isFn(node) ? node.__fnScope : (node.type === 'CatchClause' || node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement' || node.type === 'SwitchStatement' || node.type === 'BlockStatement' || node.type === 'StaticBlock' ? node.__scope : scope));
    }
  }
  visit(ast, null, root);
  return root;
}

// ---------- 项目：按文件缓存解析与分析 ----------

const projects = new WeakMap();
export function projectOf(ctx) {
  if (!projects.has(ctx)) projects.set(ctx, { ctx, files: new Map() });
  return projects.get(ctx);
}

export function fileOf(project, file) {
  if (project.files.has(file)) return project.files.get(file);
  let rec = null;
  if (project.ctx.files.includes(file)) {
    try {
      const ast = parse(project.ctx.read(file));
      annotate(ast);
      rec = { file, ast, project, calls: null, exportsCache: new Map() };
    } catch (e) { rec = { file, error: String(e.message || e), project }; }
  }
  project.files.set(file, rec);
  return rec;
}

// ---------- 常量折叠 ----------

export function fold(node, rec, depth = 0) {
  if (!node || depth > 10) return null;
  switch (node.type) {
    case 'Literal': return node.regex || node.bigint ? (node.bigint ? { v: BigInt(node.bigint) } : null) : { v: node.value };
    case 'TemplateLiteral': {
      let s = node.quasis[0].value.cooked;
      for (let i = 0; i < node.expressions.length; i++) {
        const f = fold(node.expressions[i], rec, depth + 1);
        if (!f) return null;
        s += String(f.v) + node.quasis[i + 1].value.cooked;
      }
      return { v: s };
    }
    case 'BinaryExpression': {
      const a = fold(node.left, rec, depth + 1); const b = fold(node.right, rec, depth + 1);
      if (!a || !b) return null;
      switch (node.operator) {
        case '+': return { v: a.v + b.v };
        case '-': return typeof a.v === typeof b.v && typeof a.v !== 'string' ? { v: a.v - b.v } : null;
        case '*': return typeof a.v === typeof b.v && typeof a.v !== 'string' ? { v: a.v * b.v } : null;
        case '/': return typeof a.v === 'number' && typeof b.v === 'number' ? { v: a.v / b.v } : null;
        default: return null;
      }
    }
    case 'UnaryExpression': {
      const a = fold(node.argument, rec, depth + 1);
      if (!a) return null;
      if (node.operator === '-' && typeof a.v === 'number') return { v: -a.v };
      if (node.operator === '+' && typeof a.v === 'number') return { v: +a.v };
      return null;
    }
    case 'Identifier': {
      const b = node.__scope ? node.__scope.lookup(node.name) : null;
      if (!b) return null;
      if (b.kind === 'const' && b.init && b.keyPath.length === 0) return fold(b.init, rec, depth + 1);
      if (b.kind === 'import' && b.imported && rec) return importedConst(rec, b, depth + 1);
      return null;
    }
    case 'ChainExpression': return fold(node.expression, rec, depth + 1);
    case 'CallExpression': {
      // 数组字面量（或沿 const 解开的数组字面量）的 join：元素都折叠得出常量才折叠，分隔符缺省为逗号。
      const c = node.callee;
      if (c.type !== 'MemberExpression' || c.computed || c.property.name !== 'join') return null;
      let arr = c.object;
      for (let d = 0; d < 4 && arr.type === 'Identifier'; d++) {
        const b = arr.__scope ? arr.__scope.lookup(arr.name) : null;
        if (b && b.kind === 'const' && b.init && b.keyPath.length === 0) arr = b.init; else break;
      }
      if (arr.type !== 'ArrayExpression') return null;
      const sep = node.arguments.length ? fold(node.arguments[0], rec, depth + 1) : { v: ',' };
      if (!sep) return null;
      const parts = [];
      for (const e of arr.elements) {
        const f = e && e.type !== 'SpreadElement' ? fold(e, rec, depth + 1) : null;
        if (!f) return null;
        parts.push(String(f.v));
      }
      return { v: parts.join(String(sep.v)) };
    }
    default: return null;
  }
}

function resolveRel(file, spec) { return posix.normalize(posix.join(posix.dirname(file), spec)); }

function importedConst(rec, b, depth) {
  if (!b.source || !b.source.startsWith('.')) return null;
  const target = fileOf(rec.project, resolveRel(rec.file, b.source));
  if (!target || !target.ast) return null;
  for (const st of target.ast.body) {
    if (st.type !== 'ExportNamedDeclaration' || !st.declaration || st.declaration.type !== 'VariableDeclaration' || st.declaration.kind !== 'const') continue;
    for (const d of st.declaration.declarations) if (d.id.type === 'Identifier' && d.id.name === b.imported && d.init) return fold(d.init, target, depth);
  }
  return null;
}

// ---------- 取值来源 ----------

// 局部函数的调用点（形参来源用）：函数节点 → 调用它的 CallExpression 列表（被调用方是解析到该函数的标识符）。
function callsOfFns(rec) {
  if (rec.calls) return rec.calls;
  const map = new Map();
  const visit = (n) => {
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      const b = n.callee.__scope ? n.callee.__scope.lookup(n.callee.name) : null;
      let fn = null;
      if (b && b.kind === 'function') fn = b.node;
      else if (b && (b.kind === 'const' || b.kind === 'let' || b.kind === 'var') && b.init && isFn(b.init) && b.keyPath.length === 0) fn = b.init;
      if (fn) { if (!map.has(fn)) map.set(fn, []); map.get(fn).push(n); }
    }
    for (const c of children(n)) visit(c);
  };
  visit(rec.ast);
  rec.calls = map;
  return map;
}

// 赋值语句给 let/var 绑定的值（f = Math.sqrt）：绑定 → 右侧表达式列表。
function assignsOf(rec) {
  if (rec.__assigns) return rec.__assigns;
  const map = new Map();
  walkAll(rec.ast, (n) => {
    if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'Identifier') {
      const b = n.left.__scope ? n.left.__scope.lookup(n.left.name) : null;
      if (b && (b.kind === 'let' || b.kind === 'var')) { if (!map.has(b)) map.set(b, []); map.get(b).push(n.right); }
    }
  });
  rec.__assigns = map;
  return map;
}

// ---------- 跨文件：模块间导出与导入解析 ----------
// 相对说明符 -> 项目里的文件记录；解析得出才跟，说明符不是相对的（包名、node: 内置）不跟。
function importTarget(rec, source) {
  if (!source || !source.startsWith('.')) return null;
  const t = fileOf(rec.project, resolveRel(rec.file, source));
  return t && t.ast ? t : null;
}

// 目标文件导出的名字 name 的取值来源：导出声明、export { a as b }、export { x } from、export *、default；跟到定义处的表达式。
function exportedOrigins(target, name, depth, seen = new Set()) {
  if (depth > 10) return [];
  const sk = `${target.file}::${name}`;
  if (seen.has(sk)) return [];
  seen.add(sk);
  const outs = [];
  for (const st of target.ast.body) {
    if (st.type === 'ExportNamedDeclaration') {
      const d = st.declaration;
      if (d) {
        if (d.type === 'FunctionDeclaration' && d.id.name === name) outs.push({ fn: d, rec: target, depth });
        else if (d.type === 'ClassDeclaration' && d.id.name === name) outs.push({ cls: d, rec: target, depth });
        else if (d.type === 'VariableDeclaration') for (const dc of d.declarations) if (dc.id.type === 'Identifier' && dc.id.name === name && dc.init) outs.push(...originsIn(dc.init, target, depth + 1));
      } else {
        for (const sp of st.specifiers) {
          if ((sp.exported.name ?? String(sp.exported.value)) !== name) continue;
          const local = sp.local.name ?? String(sp.local.value);
          if (st.source) { const t2 = importTarget(target, st.source.value); if (t2) outs.push(...exportedOrigins(t2, local, depth + 1, seen)); } else outs.push(...originsIn(sp.local, target, depth + 1));
        }
      }
    } else if (st.type === 'ExportDefaultDeclaration' && name === 'default') {
      const d = st.declaration;
      if (isFn(d)) outs.push({ fn: d, rec: target, depth });
      else if (d.type === 'ClassDeclaration') outs.push({ cls: d, rec: target, depth });
      else outs.push(...originsIn(d, target, depth + 1));
    } else if (st.type === 'ExportAllDeclaration' && !st.exported) {
      const t2 = importTarget(target, st.source.value);
      if (t2) outs.push(...exportedOrigins(t2, name, depth + 1, seen));
    }
  }
  return outs;
}

// 导出名 name -> 定义文件里的本地绑定名（跟 export { x } from 链；default 且是直接写的函数/类则记 'default'）。
function exportLocal(target, name, depth = 0, seen = new Set()) {
  if (depth > 10) return null;
  const sk = `${target.file}::${name}`;
  if (seen.has(sk)) return null;
  seen.add(sk);
  for (const st of target.ast.body) {
    if (st.type === 'ExportNamedDeclaration') {
      const d = st.declaration;
      if (d) {
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id.name === name) return { file: target.file, local: name };
        if (d.type === 'VariableDeclaration') for (const dc of d.declarations) if (dc.id.type === 'Identifier' && dc.id.name === name) return { file: target.file, local: name };
      } else {
        for (const sp of st.specifiers) {
          if ((sp.exported.name ?? String(sp.exported.value)) !== name) continue;
          const local = sp.local.name ?? String(sp.local.value);
          if (st.source) { const t2 = importTarget(target, st.source.value); return t2 ? exportLocal(t2, local, depth + 1, seen) : null; }
          return { file: target.file, local };
        }
      }
    } else if (st.type === 'ExportDefaultDeclaration' && name === 'default') {
      return { file: target.file, local: st.declaration.type === 'Identifier' ? st.declaration.name : 'default' };
    } else if (st.type === 'ExportAllDeclaration' && !st.exported) {
      const t2 = importTarget(target, st.source.value);
      const r = t2 ? exportLocal(t2, name, depth + 1, seen) : null;
      if (r) return r;
    }
  }
  return null;
}

// 导入绑定在导出处的本地名（跟 export { x as y }、export { x } from 链）：按名字名单判的规则用，别名改名后仍认得出导出处声明的那个名字。
export function importedLocal(rec, b) {
  if (!b || b.kind !== 'import' || !b.imported) return null;
  const t = importTarget(rec, b.source);
  const def = t ? exportLocal(t, b.imported) : null;
  return def ? def.local : null;
}

// 项目内“被别的文件调用的导入函数”索引：定义文件::本地名 -> [{ call, rec }]（形参来源跨文件取实参用）。整个项目只建一次。
function crossCallIndex(project) {
  if (project.__cross) return project.__cross;
  const idx = new Map();
  project.__cross = idx; // 先挂上，建索引过程中再取形参来源时不重复建
  const add = (key, call, rec) => { if (!idx.has(key)) idx.set(key, []); idx.get(key).push({ call, rec }); };
  for (const f of project.ctx.files) {
    if (!/\.(mjs|js)$/.test(f)) continue;
    const rec = fileOf(project, f);
    if (!rec || !rec.ast) continue;
    walkAll(rec.ast, (n) => {
      if (n.type !== 'CallExpression' && n.type !== 'NewExpression') return;
      const c = n.callee;
      let b = null; let name = null;
      if (c.type === 'Identifier') { b = c.__scope ? c.__scope.lookup(c.name) : null; if (b && b.kind === 'import' && b.imported) name = b.imported; }
      else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier') { b = c.object.__scope ? c.object.__scope.lookup(c.object.name) : null; if (b && b.kind === 'import' && b.imported === null) name = c.property.name; }
      if (!name) return;
      const t = importTarget(rec, b.source);
      if (!t) return;
      const def = exportLocal(t, name);
      if (def) add(`${def.file}::${def.local}`, n, rec);
    });
  }
  return idx;
}

// 函数 fn 的全部调用点（本文件里按名字调的，加别的文件 import 后调的）：[{ call, rec }]。
export function callSitesOf(rec, fn) {
  return (callsOfFns(rec).get(fn) || []).map((call) => ({ call, rec })).concat(crossCallsOf(rec, fn));
}

// 函数 fn（在 rec 里）被别的文件调用的调用点：先找出 fn 的本地绑定名（函数声明名、const 绑定名，以及 default 导出）。
function crossCallsOf(rec, fn) {
  const names = new Set();
  if (fn.type === 'FunctionDeclaration' && fn.id) names.add(fn.id.name);
  else if (fn.__parent && fn.__parent.type === 'VariableDeclarator' && fn.__parent.id.type === 'Identifier') names.add(fn.__parent.id.name);
  if (fn.__parent && fn.__parent.type === 'ExportDefaultDeclaration') names.add('default');
  if (!names.size) return [];
  const idx = crossCallIndex(rec.project);
  const out = [];
  for (const nm of names) for (const x of idx.get(`${rec.file}::${nm}`) || []) if (x.rec !== rec) out.push(x);
  return out;
}

// 属性赋值（o.f = Math.sqrt；类里 this.f = …、字段 f = …）：取成员时把赋给同一对象同名属性的右侧也算进来源。
// 根：标识符按绑定，this 按所在的类（类体里的 this 当同一个对象，不分方法）。
const classOf = (n) => { for (let p = n.__parent; p; p = p.__parent) if (p.type === 'ClassDeclaration' || p.type === 'ClassExpression') return p; return null; };
function memberRoot(obj) {
  if (obj.type === 'Identifier') return (obj.__scope && obj.__scope.lookup(obj.name)) || `global:${obj.name}`;
  if (obj.type === 'ThisExpression') return classOf(obj);
  return null;
}
function memberAssignsOf(rec) {
  if (rec.__massigns) return rec.__massigns;
  const map = new Map();
  const add = (root, key, rhs) => { if (!root || key === null) return; if (!map.has(root)) map.set(root, new Map()); const m = map.get(root); if (!m.has(key)) m.set(key, []); m.get(key).push(rhs); };
  walkAll(rec.ast, (n) => {
    if (n.type === 'AssignmentExpression' && n.operator === '=' && n.left.type === 'MemberExpression') {
      const l = n.left;
      const key = !l.computed ? (l.property.name ?? String(l.property.value)) : (() => { const f = fold(l.property, rec); return f ? String(f.v) : null; })();
      add(memberRoot(l.object), key, n.right);
    } else if (n.type === 'PropertyDefinition' && n.value && !n.computed && n.key.type === 'Identifier') add(classOf(n), n.key.name, n.value);
  });
  rec.__massigns = map;
  return map;
}

function applyKey(o, key) {
  if (o.unknown) return [o];
  if (o.nsRec) { const { nsRec, ...rest } = o; return [{ ...rest, path: o.path.concat([key]) }, ...exportedOrigins(nsRec, key, (o.depth || 0) + 1)]; }
  if (o.fn || o.cls) return [{ mod: '', path: ['*fn', key] }];
  if (o.arr) {
    const idx = Number(key);
    const els = Number.isInteger(idx) ? [o.arr.elements[idx]] : o.arr.elements;
    return els.filter((e) => e && e.type !== 'SpreadElement').flatMap((e) => originsIn(e, o.rec, o.depth + 1));
  }
  if (o.obj) {
    // 局部对象字面量：取该成员的值来源（没有该成员则当作未知）。
    for (const p of o.obj.properties) {
      if (p.type === 'Property' && !p.computed && keyName(p) === key) return originsIn(p.value, o.rec, o.depth + 1);
      if (p.type === 'Property' && p.computed) { const f = fold(p.key, o.rec); if (f && String(f.v) === key) return originsIn(p.value, o.rec, o.depth + 1); }
    }
    return [UNKNOWN];
  }
  return [{ ...o, path: o.path.concat([key]) }];
}

// 带记忆与去重的取值来源（每个节点只算一次；同来源去重；最多保留 24 个，避免形参来源的组合爆炸）。
// 记忆要与取值顺序无关：算这个节点的过程中如果撞上了“成环截断”或“深度截断”，结果只对这条取值路径成立，不能留给别的路径用，
// 否则过滤运行（只跑一两个条目）与全量运行会得到不同的命中（跨文件形参互相传递时尤其明显）。cuts 记录子树里撞到的截断点。
const cutsOf = (rec) => rec.project.__cuts || (rec.project.__cuts = new Set());
export function originsIn(node, rec, depth = 0) {
  if (!node) return [UNKNOWN];
  const memo = rec.__memo || (rec.__memo = new Map());
  const cuts = cutsOf(rec);
  if (memo.has(node)) {
    const v = memo.get(node);
    if (v === null) { cuts.add(node); return []; }
    return v;
  }
  memo.set(node, null); // 递归中：本次取值再遇到自己时当作没有来源，防止成环
  const outer = new Set(cuts); cuts.clear();
  const seen = new Set(); const out = [];
  for (const o of originsRaw(node, rec, depth)) {
    const fl = o.rec ? o.rec.file : '';
    const k = o.unknown ? 'u' : o.shadow ? `s${(o.path || []).join('.')}` : o.fn ? `f${fl}:${o.fn.start}` : o.obj ? `o${fl}:${o.obj.start}` : o.arr ? `a${fl}:${o.arr.start}` : o.cls ? `c${fl}:${o.cls.start}` : o.nsRec ? `n${o.nsRec.file}` : `${o.mod}|${(o.path || []).join('.')}|${o.dynamic ? 1 : 0}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(o);
    if (out.length >= 24) break;
  }
  cuts.delete(node); // 绕回本节点的环到这里闭合
  if (cuts.size === 0) memo.set(node, out); else memo.delete(node);
  for (const c of outer) cuts.add(c);
  return out;
}

function originsRaw(node, rec, depth = 0) {
  if (node && depth > 12) { cutsOf(rec).add('depth'); return [UNKNOWN]; }
  if (!node) return [UNKNOWN];
  switch (node.type) {
    case 'Identifier': {
      const b = node.__scope ? node.__scope.lookup(node.name) : null;
      if (!b) return [{ mod: '', path: [node.name] }];
      switch (b.kind) {
        case 'import': {
          const base = { mod: b.source, path: b.imported && b.imported !== 'default' ? [b.imported] : [], isDefault: b.imported === 'default' };
          const t = importTarget(rec, b.source);
          if (!t) return [base];
          // 相对 import：保留原来的“模块 + 导出名”来源（按模块名判的规则要用），再把别名跟进定义文件取到原名。
          if (b.imported === null) return [{ ...base, nsRec: t }];
          return [base, ...exportedOrigins(t, b.imported, depth + 1)];
        }
        case 'function': return [{ fn: b.node, rec, depth }];
        case 'class': return [{ cls: b.node, rec, depth }];
        case 'param': {
          // shadow：这是局部形参，不是全局名（形参叫 Math、setTimeout 不等于调了全局的）；按全局名判的规则要跳过带 shadow 的来源，按状态根名判的规则照用。
          const own = { mod: '', path: [b.name], shadow: true };
          const outs = [own];
          if (b.fn && b.keyPath.length === 0) {
            const calls = (callsOfFns(rec).get(b.fn) || []).slice(0, 50);
            for (const c of calls) {
              const a = c.arguments[b.index];
              if (a && a.type !== 'SpreadElement' && rec.__paramGuard && rec.__paramGuard.has(a)) cutsOf(rec).add(a);
              else if (a && a.type !== 'SpreadElement') {
                rec.__paramGuard = rec.__paramGuard || new Set(); rec.__paramGuard.add(a);
                for (const o of originsIn(a, rec, depth + 1)) outs.push(o);
                rec.__paramGuard.delete(a);
                cutsOf(rec).delete(a);
              }
            }
          }
          // 跨文件：别的文件 import 了本函数并调用，取它们传进来的实参来源。
          if (b.fn && b.keyPath.length === 0) {
            for (const x of crossCallsOf(rec, b.fn).slice(0, 50)) {
              const a = x.call.arguments[b.index];
              if (a && a.type !== 'SpreadElement') for (const o of originsIn(a, x.rec, depth + 1)) outs.push(o);
            }
          }
          if (b.dflt) for (const o of originsIn(b.dflt, rec, depth + 1)) outs.push(o);
          return outs;
        }
        default: { // var、let、const
          const assigned = (assignsOf(rec).get(b) || []).flatMap((r) => originsIn(r, rec, depth + 1));
          if (!b.init) return assigned.length ? assigned : [{ mod: '', path: [b.name], shadow: true }];
          let outs = originsIn(b.init, rec, depth + 1).concat(assigned);
          for (const key of b.keyPath) outs = outs.flatMap((o) => (key === '*dynamic' ? [o.unknown ? o : { ...o, dynamic: true, dynNode: b.idNode }] : applyKey({ ...o, rec: o.rec || rec, depth }, key)));
          return outs;
        }
      }
    }
    case 'MemberExpression': {
      const objs = originsIn(node.object, rec, depth + 1);
      let key = null;
      if (!node.computed) key = node.property.name ?? String(node.property.value);
      else { const f = fold(node.property, rec); key = f ? String(f.v) : null; }
      if (key === null) return objs.flatMap((o) => (o.unknown ? [o] : o.obj ? o.obj.properties.filter((p) => p.type === 'Property').flatMap((p) => originsIn(p.value, o.rec || rec, depth + 1)) : o.arr ? o.arr.elements.filter((e) => e && e.type !== 'SpreadElement').flatMap((e) => originsIn(e, o.rec || rec, depth + 1)) : [{ ...o, dynamic: true, dynNode: node }]));
      const base = objs.flatMap((o) => applyKey({ ...o, rec: o.rec || rec, depth }, key));
      const root = memberRoot(node.object);
      const assigned = root && memberAssignsOf(rec).get(root) ? (memberAssignsOf(rec).get(root).get(key) || []) : [];
      return assigned.length ? base.concat(assigned.flatMap((r) => originsIn(r, rec, depth + 1))) : base;
    }
    case 'ChainExpression': return originsIn(node.expression, rec, depth + 1);
    case 'CallExpression': {
      const c = node.callee;
      if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'bind') return originsIn(c.object, rec, depth + 1);
      const callee = originsIn(c, rec, depth + 1);
      const outs = [];
      // Reflect.get(obj, key)：等同 obj[key]；Reflect.apply 与 Reflect.construct 的返回值不追（取不到）。
      if (callee.map(norm).some((o) => o.mod === '' && o.path && o.path.join('.') === 'Reflect.get') && node.arguments[0] && node.arguments[0].type !== 'SpreadElement') {
        const f = node.arguments[1] ? fold(node.arguments[1], rec) : null;
        const objs = originsIn(node.arguments[0], rec, depth + 1);
        return objs.flatMap((o) => (f ? applyKey({ ...o, rec: o.rec || rec, depth }, String(f.v)) : o.unknown ? [o] : [{ ...o, dynamic: true, dynNode: node }]));
      }
      for (const o of callee) {
        if (o.fn) {
          const ret = [];
          const walk = (n) => { if (n.type === 'ReturnStatement' && n.argument) ret.push(n.argument); if (isFn(n) && n !== o.fn) return; for (const ch of children(n)) walk(ch); };
          if (o.fn.body.type === 'BlockStatement') walk(o.fn.body); else ret.push(o.fn.body);
          for (const r of ret) for (const x of originsIn(r, o.rec || rec, depth + 1)) outs.push(x);
        }
      }
      return outs.length ? outs : [UNKNOWN];
    }
    case 'NewExpression': {
      // new Proxy(target, handler)：对目标的取成员与调用都转给目标，来源就是目标。
      const f = originsIn(node.callee, rec, depth + 1).map(norm);
      if (f.some((o) => o.mod === '' && o.path && o.path.join('.') === 'Proxy' && !o.shadow) && node.arguments[0] && node.arguments[0].type !== 'SpreadElement') return originsIn(node.arguments[0], rec, depth + 1);
      return [UNKNOWN];
    }
    case 'ConditionalExpression': return [...originsIn(node.consequent, rec, depth + 1), ...originsIn(node.alternate, rec, depth + 1)];
    case 'LogicalExpression': return [...originsIn(node.left, rec, depth + 1), ...originsIn(node.right, rec, depth + 1)];
    case 'SequenceExpression': return originsIn(node.expressions[node.expressions.length - 1], rec, depth + 1);
    case 'AssignmentExpression': return originsIn(node.right, rec, depth + 1);
    case 'AwaitExpression': return originsIn(node.argument, rec, depth + 1);
    case 'ObjectExpression': return [{ obj: node, rec, depth }];
    case 'ArrayExpression': return [{ arr: node, rec, depth }];
    case 'FunctionExpression': case 'ArrowFunctionExpression': return [{ fn: node, rec, depth }];
    default: return [UNKNOWN];
  }
}

// 归一：去掉全局对象前缀（globalThis.Math → Math）。
export function norm(o) {
  if (!o.path) return o;
  let path = o.path;
  if (o.mod === '' && path.length > 1 && GLOBAL_OBJECTS.includes(path[0])) path = path.slice(1);
  return { ...o, path };
}

export function originsOf(node, rec) { return originsIn(node, rec, 0).map(norm); }

// 调用的被调用方来源：f.call(…)、f.apply(…) 取 f 的来源。
export function calleeOrigins(callNode, rec) {
  const c = callNode.callee;
  const own = originsOf(c, rec);
  const at = (name) => own.some((o) => o.mod === '' && o.path && o.path.join('.') === name && !o.shadow);
  const args = callNode.arguments || [];
  const first = args[0] && args[0].type !== 'SpreadElement' ? args[0] : null;
  // Reflect.apply(f, this, args) 与 Reflect.construct(F, args)：被调用方是第一个实参。
  if ((at('Reflect.apply') || at('Reflect.construct')) && first) {
    const target = originsOf(first, rec);
    if (target.length) return target;
  }
  if (c.type === 'MemberExpression' && !c.computed && (c.property.name === 'call' || c.property.name === 'apply')) {
    const o = originsOf(c.object, rec);
    // Function.prototype.call.call(f, thisArg, ...)、g.call.call(f, ...)：对象本身就是 call/apply 方法的引用时，被调用方是第一个实参。
    if (first && o.some((x) => x.path && ['call', 'apply'].includes(x.path[x.path.length - 1]))) {
      const target = originsOf(first, rec);
      if (target.length) return target;
    }
    return o.length ? o : own;
  }
  return own;
}

// ---------- 遍历工具 ----------

export function walkAll(node, fn) {
  fn(node);
  for (const c of children(node)) walkAll(c, fn);
}

export function enclosingSymbol(node) {
  const names = [];
  for (let n = node.__parent; n; n = n.__parent) {
    if (n.type === 'FunctionDeclaration' && n.id) names.push(n.id.name);
    else if ((n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') && n.__parent) {
      const p = n.__parent;
      if (p.type === 'VariableDeclarator' && p.id.type === 'Identifier') names.push(p.id.name);
      else if (p.type === 'Property' && !p.computed && p.key.type === 'Identifier') names.push(p.key.name);
      else if (p.type === 'MethodDefinition' && p.key.type === 'Identifier') names.push(p.key.name);
    } else if (n.type === 'MethodDefinition' && n.key.type === 'Identifier') names.push(n.key.name);
  }
  return names.reverse().join('.');
}

// 取一个命中节点的位置：行号与稳定符号路径。
export function where(node) {
  return { line: node.loc ? node.loc.start.line : 0, symbolPath: enclosingSymbol(node) };
}

export function propName(member) {
  if (!member.computed) return member.property.name ?? String(member.property.value);
  return null;
}

export { UNKNOWN, isFn, keyName };
