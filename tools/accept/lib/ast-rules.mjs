// 语法树规则（公共部件检查 C0；lit_scope 的 astRule 方式用）：每种规则种类（kind）是一个按语法树判的小函数，规则参数（名单、方法名、分隔符、例外文件）全在扫描类别行 astRules 里，
// 本文件里只有 JS 语言本身的结构（节点类型、比较运算符、Reflect/Proxy 语义），没有规则的文件名与名字名单。判据基于 lib/ast.mjs 的绑定、取值来源与常量折叠，
// 别名、解构、计算属性名、拼开再拼的字符串、.bind/.call/.apply、形参与返回值与对象成员传递都跟到原名；
// 运行期才知道的下标（折叠不出常量）按规则需要报 nodeKind=review:dynamic（待人审）。
import { walkAll, originsOf, calleeOrigins, fold, where, propName, isFn, children, keyName, callSitesOf, importedLocal } from './ast.mjs';

const CMP = new Set(['===', '!==', '==', '!=']);
const isStr = (f) => f && typeof f.v === 'string';
const realOrigins = (os) => os.filter((o) => o.path);
// 按全局名、导入名判的规则用：形参或无初值局部名与之同名不算（遮蔽，按作用域判绑定）。
const globalOrigins = (os) => os.filter((o) => o.path && !o.shadow);
// 按名字名单判“是哪个成员/绑定”用：名单里的名字是数据字段名（不是全局名），形参、解构形参、无初值局部以这个名字声明，就是这个字段值的承载者
// （值从调用点来，调用点看不见或传进来的仍是它），所以自身来源也认；只有按全局名判的规则（globalOrigins）才把形参遮蔽排除。
const namedOrigins = realOrigins;
const lastName = (o) => (o.path && o.path.length ? o.path[o.path.length - 1] : '');
const pathKey = (o) => (o.path || []).join('.');

// 把标识符沿 const 绑定的初始化表达式解开一层（取“这个名字背后的表达式”）。
function resolveNode(node) {
  let n = node;
  for (let d = 0; d < 4 && n && n.type === 'Identifier'; d++) {
    const b = n.__scope ? n.__scope.lookup(n.name) : null;
    if (b && b.kind === 'const' && b.init && b.keyPath.length === 0) n = b.init; else break;
  }
  return n;
}
const hasSub = (node, pred) => { let found = false; walkAll(node, (n) => { if (!found && pred(n)) found = true; }); return found; };
const memberNames = (n) => {
  // 一个表达式里出现的“名字”：标识符名与成员属性名（含折叠得出的计算属性）。
  const out = [];
  walkAll(n, (x) => {
    if (x.type === 'Identifier') out.push(x.name);
    else if (x.type === 'MemberExpression' && x.computed) { const f = fold(x.property, x.__rec); if (isStr(f)) out.push(f.v); }
  });
  return out;
};

const KINDS = {
  // 模块边：import、export … from、export *、import()、require()。source 经常量折叠；源说明符折叠不出的动态 import 报 review:dynamic。
  moduleEdge(ctx, rec, rule, emit) {
    const re = new RegExp(rule.sourceRe);
    const names = rule.names ? new Set(rule.names) : null;
    const test = (srcNode, node, specs) => {
      const f = fold(srcNode, rec);
      if (!f || typeof f.v !== 'string') { if (rule.dynamic !== false && node.type !== 'ImportDeclaration') emit(node, 'review:dynamic', ''); return; }
      if (!re.test(f.v)) return;
      if (!names || specs === null) { emit(node, 'edge', f.v); return; }
      if (specs.some((s) => s === '*' || names.has(s))) emit(node, 'edge', f.v);
    };
    // createRequire(...) 得来的 require（不论叫什么名字、是否与全局 require 同名）也是模块边：被调用方来源是 node:module / module 的 createRequire 的返回值。
    const isMaker = (e) => e && e.type === 'CallExpression' && globalOrigins(calleeOrigins(e, rec)).some((o) => (o.mod === 'module' || o.mod === 'node:module') && lastName(o) === 'createRequire');
    const isMadeRequire = (callee) => { const e = resolveNode(callee); return isMaker(e) || (e.type === 'Identifier' && isMaker(resolveNode(e))); };
    walkAll(rec.ast, (n) => {
      if (n.type === 'CallExpression' && n.arguments[0] && isMadeRequire(n.callee)) { test(n.arguments[0], n, null); return; }
      if (n.type === 'ImportDeclaration') test(n.source, n, n.specifiers.map((s) => (s.type === 'ImportSpecifier' ? (s.imported.name ?? String(s.imported.value)) : '*')));
      else if (n.type === 'ExportNamedDeclaration' && n.source) test(n.source, n, n.specifiers.map((s) => s.local.name ?? String(s.local.value)));
      else if (n.type === 'ExportAllDeclaration') test(n.source, n, ['*']);
      else if (n.type === 'ImportExpression') test(n.source, n, null);
      else if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && !(n.callee.__scope && n.callee.__scope.lookup('require')) && n.arguments[0]) test(n.arguments[0], n, null);
    });
  },
  // 标识符与属性名：任何位置出现该名字（声明、引用、属性、解构键、对象键），以及折叠得出该名字的计算属性。
  identifier(ctx, rec, rule, emit) {
    const names = new Set(rule.names);
    walkAll(rec.ast, (n) => {
      if (n.type === 'Identifier' && names.has(n.name)) emit(n, 'ident', n.name);
      else if ((n.type === 'MemberExpression' && n.computed) || (n.type === 'Property' && n.computed) || (n.type === 'MethodDefinition' && n.computed) || (n.type === 'PropertyDefinition' && n.computed)) {
        const keyNode = n.type === 'MemberExpression' ? n.property : n.key;
        const f = fold(keyNode, rec);
        if (isStr(f) && names.has(f.v)) emit(n, 'computed', f.v);
      }
    });
  },
  // 成员引用：非调用位置也算（Number.EPSILON）。路径按取值来源归一。
  memberRef(ctx, rec, rule, emit) {
    const want = new Set(rule.paths.map((p) => p.join('.')));
    walkAll(rec.ast, (n) => {
      // 解构得来的绑定（const { EPSILON } = Number）：标识符引用也按来源算；只认已绑定的名字，避免把属性名当引用。
      const boundRef = n.type === 'Identifier' && n.__scope && (() => { const b = n.__scope.lookup(n.name); return b && b.keyPath && b.keyPath.length > 0; })();
      if (n.type !== 'MemberExpression' && !boundRef) return;
      for (const o of globalOrigins(originsOf(n, rec))) if (!o.dynamic && (rule.mod === undefined || o.mod === rule.mod) && want.has(pathKey(o))) { emit(n, 'member', pathKey(o)); return; }
    });
  },
  // 运行期才知道的下标：对象来源的根名在 roots 里，下标折叠不出常量。
  dynamicIndex(ctx, rec, rule, emit) {
    const roots = new Set(rule.roots);
    const any = roots.has('*');
    walkAll(rec.ast, (n) => {
      if (n.type !== 'MemberExpression' || !n.computed) return;
      if (fold(n.property, rec)) return;
      // 下标是数值（数组按位置取）不算：按折叠不出常量的非数值判不了，这里把数值型下标（Literal 数字、i++ 之类）放过的依据是语法树里的字面数字与 UpdateExpression，其余一律报。
      if (n.property.type === 'Literal' || n.property.type === 'UpdateExpression') return;
      if (any) { emit(n, 'review:dynamic', ''); return; }
      for (const o of realOrigins(originsOf(n.object, rec))) if (!o.dynamic && o.path.length === 1 && roots.has(o.path[0])) { emit(n, 'review:dynamic', o.path[0]); return; }
    });
  },
  // 调用实参里出现指定名字、成员属性或折叠得出指定字串：被调用方按取值来源末段名（callees）或 .方法名（method）认。
  callWithArg(ctx, rec, rule, emit) {
    const callees = new Set(rule.callees || []); const argStrings = new Set(rule.argStrings || []);
    // 实参里出现名单里的名字：按取值来源判（别名、解构、成员都跟到原名，取来源路径的末段），不比写出来的变量名。argNames 与 argProps 合成一张名单。
    const names = new Set([...(rule.argNames || []), ...(rule.argProps || [])]);
    const nameHit = (x) => (x.type === 'Identifier' || x.type === 'MemberExpression') && globalOrigins(originsOf(x, rec)).some((o) => names.has(lastName(o)));
    const argHit = (a) => hasSub(a, nameHit) || (() => { const f = fold(a, rec); return isStr(f) && argStrings.has(f.v); })();
    walkAll(rec.ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const byName = callees.size && globalOrigins(calleeOrigins(n, rec)).some((o) => callees.has(lastName(o)) && o.path.length === 1);
      const byMethod = rule.method && n.callee.type === 'MemberExpression' && propName(n.callee) === rule.method;
      if ((byName || byMethod) && n.arguments.some((a) => a.type !== 'SpreadElement' && argHit(a))) emit(n, 'callArg', '');
    });
  },
  // 运算符：** 的指数。折叠得出非整数报 pow；折叠不出（变量指数）按需报 review:dynamic。
  operator(ctx, rec, rule, emit) {
    walkAll(rec.ast, (n) => {
      if (!((n.type === 'BinaryExpression' || n.type === 'AssignmentExpression') && n.operator === rule.op)) return;
      const f = fold(n.right, rec);
      if (f && typeof f.v === 'number' && !Number.isInteger(f.v)) emit(n, 'pow', String(f.v));
      else if (!f && rule.dynamic && !(n.left.type === 'Literal' && n.left.bigint)) emit(n, 'review:dynamic', 'exponent');
    });
  },
  // 调用的实参必须折叠得出常量字串（抽取点流代号、站点名）。callees 按被调用方来源的末段名认（含 .method）。
  callArgs(ctx, rec, rule, emit) {
    const names = new Set(rule.callees);
    walkAll(rec.ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const hit = globalOrigins(calleeOrigins(n, rec)).some((o) => names.has(lastName(o)));
      if (!hit) return;
      for (const i of rule.args) {
        const a = n.arguments[i];
        if (!a || a.type === 'SpreadElement' || !isStr(fold(a, rec))) { emit(n, `arg${i}`, ''); return; }
      }
    });
  },
  // 键串拼接：join 的分隔符（折叠）、+ 与 += 拼分隔符、reduce 回调里的分隔符、被调函数的实参里拼键（join、模板串、+ 拼字串）。
  keyConcat(ctx, rec, rule, emit) {
    const seps = new Set(rule.seps || []);
    const parts = new Set(rule.parts || ['join', 'reduce', 'plus', 'plusAssign', 'digest']);
    const emitIf = (part) => (node, kind, d) => { if (parts.has(part)) emit(node, kind, d); };
    const sepOf = (node) => { const f = fold(node, rec); return f && typeof f.v === 'string' && seps.has(f.v); };
    // 夹在数组里或 concat 实参里的分隔符：规则可单列 arraySeps（比 join 的分隔符多认 # 与逗号，因为夹在元素之间的单个符号几乎只会是在拼键）。
    const aseps = new Set(rule.arraySeps || rule.seps || []);
    const embedSepOf = (node) => { const f = fold(node, rec); return Boolean(f && typeof f.v === 'string' && aseps.has(f.v)); };
    const keyShaped = (arg) => {
      const e = resolveNode(arg);
      return hasSub(e, (x) => (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && propName(x.callee) === 'join')
        || (x.type === 'TemplateLiteral' && x.expressions.length > 0)
        || (x.type === 'BinaryExpression' && x.operator === '+' && (isStr(fold(x.left, rec)) || isStr(fold(x.right, rec)))));
    };
    walkAll(rec.ast, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
        const pn = propName(n.callee);
        const sepLit = (x) => (x.type === 'Literal' && typeof x.value === 'string' && seps.has(x.value))
          || (x.type === 'TemplateLiteral' && x.quasis.some((q) => seps.has(q.value.cooked)));
        if (pn === 'join' && n.arguments[0] && sepOf(n.arguments[0])) emitIf('join')(n, 'join', '');
        else if (pn === 'join') {
          // [a, '|', b].join('')：数组里夹着分隔符（折叠得出），空串或缺省分隔符拼接。
          const arr = resolveNode(n.callee.object);
          if (arr.type === 'ArrayExpression' && arr.elements.some((e) => e && e.type !== 'SpreadElement' && embedSepOf(e))) emitIf('join')(n, 'join', 'array');
        } else if (pn === 'concat' && n.arguments.some((a) => a.type !== 'SpreadElement' && embedSepOf(a))) {
          // a.concat('#', b)：分隔符作为实参拼进去。
          emitIf('join')(n, 'concat', '');
        } else if (pn === 'reduce' && n.arguments[0] && isFn(n.arguments[0]) && hasSub(n.arguments[0], sepLit)) emitIf('reduce')(n, 'reduce', '');
      }
      if (rule.digestCallees && n.type === 'CallExpression') {
        const names = new Set(rule.digestCallees);
        if (globalOrigins(calleeOrigins(n, rec)).some((o) => names.has(lastName(o))) && n.arguments.some(keyShaped)) emitIf('digest')(n, 'digestArg', '');
      }
      if (n.type === 'BinaryExpression' && n.operator === '+') {
        const l = fold(n.left, rec); const r = fold(n.right, rec);
        if ((sepOf(n.left) && !r) || (sepOf(n.right) && !l)) emitIf('plus')(n, 'plus', '');
      }
      if (n.type === 'AssignmentExpression' && n.operator === '+=' && sepOf(n.right)) emitIf('plusAssign')(n, 'plusAssign', '');
    });
  },
  // 常量值：变量初始化折叠得出的值在集合里（const SEP = '|'）。
  constValue(ctx, rec, rule, emit) {
    const vals = new Set(rule.values);
    walkAll(rec.ast, (n) => {
      if (n.type !== 'VariableDeclarator' || !n.init || n.id.type !== 'Identifier') return;
      const f = fold(n.init, rec);
      if (f && vals.has(f.v)) emit(n, 'const', String(f.v));
    });
  },
  // 比较与分支：一边是成员（属性名在 props 里）或裸标识符（names 里），另一边按 other 要求（string 折叠得出字串；any 任意）；switch 的判别式同理。
  memberCompare(ctx, rec, rule, emit) {
    const props = new Set(rule.props || []); const names = new Set(rule.names || []);
    const calls = new Set(rule.calls || []);
    const isTarget = (e) => {
      // 经函数取种类（kindOf(x) === '…'）：被调用方来源的末段名在规则 calls 里。
      if (e.type === 'ChainExpression') return isTarget(e.expression);
      if (e.type === 'CallExpression') {
        if (!calls.size) return false;
        // 被调用方按名字认（本文件里自己定义的 kindOf 没有模块来源，来源路径为空）或按来源末段名认（别名、import）。
        const c = e.callee;
        const nm = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
        return (nm !== null && calls.has(nm)) || globalOrigins(calleeOrigins(e, rec)).some((o) => calls.has(lastName(o)));
      }
      // const k = kindOf(x); k === '…'：变量的初始化是种类调用，也是同一回事（只沿 const 解一层，名字本身就是 kind 之类的照旧）。
      if (e.type === 'Identifier' && !names.has(e.name)) { const r = resolveNode(e); if (r !== e && r.type !== 'Identifier') return isTarget(r); }
      if (e.type === 'MemberExpression') { const p = propName(e); if (p !== null && props.has(p)) return true; const f = e.computed ? fold(e.property, rec) : null; return Boolean(f && props.has(String(f.v))); }
      return e.type === 'Identifier' && names.has(e.name);
    };
    // 与空串比（x.category !== ''）是判有无，不是把种类写死成分支。
    const otherOk = (e) => { if (rule.other !== 'string') return true; const f = fold(e, rec); return isStr(f) && f.v !== ''; };
    // 成员资格的接收者必须是写死的字面量清单（数组字面量或 new Set([…])，全是字串常量）；从登记数据派生的 Set/数组不算写死。
    const literalList = (e0) => {
      let e = resolveNode(e0);
      if (e.type === 'NewExpression' && e.callee.type === 'Identifier' && e.callee.name === 'Set' && e.arguments[0]) e = resolveNode(e.arguments[0]);
      return e.type === 'ArrayExpression' && e.elements.length > 0 && e.elements.every((x) => x && x.type !== 'SpreadElement' && isStr(fold(x, rec)));
    };
    // 按种类查表：被查的对象是写死的对象字面量（沿 const 解开）；row[kind] 一类按行取字段不算。
    const literalTable = (e0) => resolveNode(e0).type === 'ObjectExpression';
    walkAll(rec.ast, (n) => {
      if (n.type === 'BinaryExpression' && CMP.has(n.operator)) {
        if ((isTarget(n.left) && otherOk(n.right)) || (isTarget(n.right) && otherOk(n.left))) emit(n, 'compare', n.operator);
      } else if (n.type === 'SwitchStatement' && rule.switchToo !== false && isTarget(n.discriminant)) emit(n, 'switch', '');
      // 成员资格判断：['a','b'].includes(x.kind)、集合.has(x.kind)（规则数据 methods 点名）；对象查表：table[x.kind]（lookup）。
      else if (rule.methods && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && rule.methods.includes(propName(n.callee)) && n.arguments[0] && n.arguments[0].type !== 'SpreadElement' && isTarget(n.arguments[0]) && literalList(n.callee.object)) emit(n, 'member-test', propName(n.callee));
      else if (rule.lookup && n.type === 'MemberExpression' && n.computed && isTarget(n.property) && literalTable(n.object)) emit(n, 'lookup', '');
    });
  },
  // typeof 成员 === 字串（struct:pos 形状手写核对）。
  typeofMember(ctx, rec, rule, emit) {
    walkAll(rec.ast, (n) => {
      if (n.type !== 'BinaryExpression' || !CMP.has(n.operator)) return;
      for (const [a, b] of [[n.left, n.right], [n.right, n.left]]) {
        if (a.type === 'UnaryExpression' && a.operator === 'typeof' && a.argument.type === 'MemberExpression' && propName(a.argument) === rule.prop) {
          const f = fold(b, rec);
          if (isStr(f) && f.v === rule.equals) emit(n, 'typeof', '');
        }
      }
    });
  },
  // 比较或 case 里出现某个常量对象的成员（取值来源路径的首段是 roots 之一）：FOOTPRINT_KIND.region 一类，别名、解构也跟到。
  originCompare(ctx, rec, rule, emit) {
    const roots = new Set(rule.roots);
    const fromRoot = (e) => realOrigins(originsOf(e, rec)).some((o) => roots.has(o.path[0]) && o.path.length > 1);
    walkAll(rec.ast, (n) => {
      if (n.type === 'BinaryExpression' && CMP.has(n.operator) && (fromRoot(n.left) || fromRoot(n.right))) emit(n, 'compare', '');
      else if (n.type === 'SwitchCase' && n.test && fromRoot(n.test)) emit(n, 'case', '');
    });
  },
  // 二元运算两边的名字（leftNames、rightNames 名单）：按取值来源判，别名、解构、成员访问跟到原名，取来源路径的末段精确比（不用正则前缀）；右边可再要求折叠值。
  binaryNames(ctx, rec, rule, emit) {
    const lnames = new Set(rule.leftNames || []); const rnames = new Set(rule.rightNames || []);
    // 导入绑定：除按取值来源（导出名）外，还跟到导出处声明的本地名（export { regionCellM as x } 再 import { x as a }），不按本文件的本地别名字面判。
    const viaExport = (x, set) => x.type === 'Identifier' && x.__scope && set.has(importedLocal(rec, x.__scope.lookup(x.name)));
    const has = (e, set) => hasSub(e, (x) => ((x.type === 'Identifier' || x.type === 'MemberExpression') && namedOrigins(originsOf(x, rec)).some((o) => set.has(lastName(o)))) || viaExport(x, set));
    walkAll(rec.ast, (n) => {
      if (n.type !== 'BinaryExpression' || n.operator !== rule.op) return;
      if (!has(n.left, lnames)) return;
      if (rnames.size) { if (has(n.right, rnames)) emit(n, 'binary', ''); return; }
      const f = fold(n.right, rec);
      if (f && String(f.v) === String(rule.rightValue)) emit(n, 'binary', '');
    });
  },
  // 单位向量表：数组里至少 min 个单位向量（[±1,0]/[0,±1] 数组或两个数值属性的对象），与顺序、写法无关；标识符沿 const 解开。
  unitVectors(ctx, rec, rule, emit) {
    const numOf = (e) => { const f = fold(e, rec); return f && typeof f.v === 'number' ? f.v : null; };
    const isUnit = (e0) => {
      const e = resolveNode(e0);
      let xs = null;
      if (e.type === 'ArrayExpression' && e.elements.length === 2) xs = e.elements.map((x) => (x ? numOf(x) : null));
      else if (e.type === 'ObjectExpression' && e.properties.length === 2 && e.properties.every((p) => p.type === 'Property')) xs = e.properties.map((p) => numOf(p.value));
      return xs && xs.every((x) => x !== null && Number.isInteger(x) && Math.abs(x) <= 1) && Math.abs(xs[0]) + Math.abs(xs[1]) === 1;
    };
    // 邻居位置：两个分量的数组/对象，一个是“变量加减 1”（x + 1、y - 1），另一个是普通变量、成员或常量；与单位向量一样，攒够 min 个就是手写邻接。
    const isStepOffset = (b) => b.type === 'BinaryExpression' && (b.operator === '+' || b.operator === '-')
      && ((numOf(b.right) !== null && Math.abs(numOf(b.right)) === 1 && numOf(b.left) === null) || (numOf(b.left) !== null && Math.abs(numOf(b.left)) === 1 && numOf(b.right) === null && b.operator === '+'));
    const isOffsetPos = (e0) => {
      const e = resolveNode(e0);
      let parts = null;
      if (e.type === 'ArrayExpression' && e.elements.length === 2 && e.elements.every((x) => x && x.type !== 'SpreadElement')) parts = e.elements;
      else if (e.type === 'ObjectExpression' && e.properties.length === 2 && e.properties.every((p) => p.type === 'Property' && !p.computed)) parts = e.properties.map((p) => p.value);
      if (!parts) return false;
      const offs = parts.filter(isStepOffset).length;
      const plain = parts.filter((x) => !isStepOffset(x) && (x.type === 'Identifier' || x.type === 'MemberExpression' || numOf(x) !== null)).length;
      return offs === 1 && plain === 1;
    };
    const isStep = (e) => isUnit(e) || isOffsetPos(e);
    const min = rule.min || 3;
    // 数组元素展平：spread 的是数组字面量（或沿 const 解开的数组字面量）就并进来，[...A, [0,1]] 与 [...[[1,0]], …] 也数得出。
    const flat = (els, depth = 0) => els.flatMap((e) => {
      if (!e) return [];
      if (e.type !== 'SpreadElement') return [e];
      const inner = resolveNode(e.argument);
      return inner.type === 'ArrayExpression' && depth < 4 ? flat(inner.elements, depth + 1) : [];
    });
    walkAll(rec.ast, (n) => { if (n.type === 'ArrayExpression' && flat(n.elements).filter((e) => isStep(e)).length >= min) emit(n, 'vectors', ''); });
    // 逐个 push：同一个数组（变量按绑定；成员链 this.dirs、o.dirs 按根绑定加属性名）上 push 了不少于 min 个单位向量，在第 min 个 push 处报。实参可以是表达式（折叠得出常量即可）。
    const counts = new Map();
    const target = (obj) => {
      if (obj.type === 'Identifier') return (obj.__scope && obj.__scope.lookup(obj.name)) || `g:${obj.name}`;
      const parts = [];
      let o = obj;
      while (o.type === 'MemberExpression' && !o.computed) { parts.unshift(o.property.name); o = o.object; }
      if (!parts.length) return null;
      const root = o.type === 'ThisExpression' ? 'this' : o.type === 'Identifier' ? ((o.__scope && o.__scope.lookup(o.name)) || `g:${o.name}`) : null;
      return root ? `${typeof root === 'string' ? root : root.name}.${parts.join('.')}` : null;
    };
    walkAll(rec.ast, (n) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || propName(n.callee) !== 'push') return;
      const key = target(n.callee.object);
      if (key === null) return;
      const c = (counts.get(key) || 0) + flat(n.arguments).filter((a) => isStep(a)).length;
      const was = counts.get(key) || 0;
      counts.set(key, c);
      if (was < min && c >= min) emit(n, 'vectors', 'push');
    });
  },
  // 嵌套调用：外层调用的实参（沿 const 解开）是内层调用（JSON.parse(JSON.stringify(x)) 及拆成两行）。路径按取值来源归一。
  nestedCall(ctx, rec, rule, emit) {
    const outer = rule.outer.join('.'); const inner = rule.inner.join('.');
    const isCall = (n, key) => n.type === 'CallExpression' && globalOrigins(calleeOrigins(n, rec)).some((o) => pathKey(o) === key);
    walkAll(rec.ast, (n) => {
      if (isCall(n, outer) && n.arguments[0] && isCall(resolveNode(n.arguments[0]), inner)) emit(n, 'nested', '');
    });
  },
  // 调用的对象实参里某属性是空对象字面量（evaluateRX(…, { clock: {} })）。
  callObjectProp(ctx, rec, rule, emit) {
    walkAll(rec.ast, (n) => {
      if (n.type !== 'CallExpression' || !globalOrigins(calleeOrigins(n, rec)).some((o) => lastName(o) === rule.callee)) return;
      for (const a of n.arguments) {
        const e = resolveNode(a);
        if (e.type !== 'ObjectExpression') continue;
        for (const p of e.properties) if (p.type === 'Property' && keyName(p) === rule.prop) { const v = resolveNode(p.value); if (v.type === 'ObjectExpression' && v.properties.length === 0) emit(n, 'emptyObject', ''); }
      }
    });
  },
  // 正则文本：正则字面量的源文本，或 RegExp 构造的实参（折叠得出的字串）匹配。
  regexText(ctx, rec, rule, emit) {
    const re = new RegExp(rule.re);
    walkAll(rec.ast, (n) => {
      if (n.type === 'Literal' && n.regex && re.test(n.regex.pattern)) emit(n, 'regex', '');
      else if ((n.type === 'NewExpression' || n.type === 'CallExpression') && globalOrigins(originsOf(n.callee, rec)).some((o) => pathKey(o) === 'RegExp') && n.arguments[0]) {
        const f = fold(n.arguments[0], rec);
        if (isStr(f) && re.test(f.v)) emit(n, 'regexString', '');
      }
    });
  },
  // 字串字面量等于某个已登记单位（单位表来自文件清单里的登记 JSON，由 lit_scope 读入 ctx 再传来）。属性键、模块说明符不是取值，不计。
  unitString(ctx, rec, rule, emit, extra) {
    const ids = extra.unitIds;
    // 属性名位置不是取值：成员的属性（o['year']）、对象/类的键、解构的键、`'year' in o`、模块说明符与指令。
    const notValue = (n) => {
      const p = n.__parent;
      if (!p) return false;
      // 字段名清单与同名映射不是单位取值：两个以上字串字面量的数组（取成员下标或字段名清单）；键与值同名的属性（{ day: 'day' }，字段名映射）。
      if (p.type === 'ArrayExpression' && p.elements.filter((e) => e && e.type === 'Literal' && typeof e.value === 'string').length >= 2) return true;
      if (p.type === 'Property' && p.value === n && !p.computed && keyName(p) === (n.type === 'Literal' ? n.value : null)) return true;
      return (p.type === 'MemberExpression' && p.property === n) || (p.type === 'Property' && p.key === n) || (p.type === 'MethodDefinition' && p.key === n) || (p.type === 'PropertyDefinition' && p.key === n)
        || (p.type === 'BinaryExpression' && p.operator === 'in' && p.left === n) || p.type === 'ImportDeclaration' || p.type === 'ExportNamedDeclaration' || p.type === 'ExportAllDeclaration' || (p.type === 'ExpressionStatement' && p.directive);
    };
    walkAll(rec.ast, (n) => {
      let v = null;
      // 拼接的一部分（'year' + 'Minutes'）不是单位：拼出来的整体折叠得出已登记单位才算（由最外层的拼接表达式报）。
      const inConcat = n.__parent && n.__parent.type === 'BinaryExpression' && n.__parent.operator === '+';
      if (n.type === 'Literal' && typeof n.value === 'string') v = inConcat ? null : n.value;
      else if (n.type === 'TemplateLiteral' && n.expressions.length === 0) v = inConcat ? null : n.quasis[0].value.cooked;
      else if ((n.type === 'BinaryExpression' && n.operator === '+' && !(n.__parent && n.__parent.type === 'BinaryExpression' && n.__parent.operator === '+')) || (n.type === 'TemplateLiteral' && n.expressions.length > 0)) {
        // 拼出来的单位代号（'cop' + 'per'、`${a}${b}`）：整个表达式折叠得出字串才算。
        const f = fold(n, rec);
        if (f && typeof f.v === 'string' && ids.has(f.v)) v = f.v;
      }
      if (v === null || !ids.has(v) || notValue(n)) return;
      emit(n, 'unit', v);
    });
  },
  // 规范序列化按定义判（主会话 11-23 定）：函数里有“取键 + 排序 + 拼出字符串”的形状，并且产出的字符串流进摘要或存储（哈希、写存档）才算重复实现；
  // 形状像、数据流不进摘要或存储的不报。mode='confirmed'：确认流进（函数里自己调了 sinks 里的函数，或它的调用点把结果喂给 sinks 里的函数，沿模板串、拼接、数组、const 变量、
  // 再包一层函数的返回值追，深度 3）；mode='review'：形状像、没确认流进，但结果用于相等比较，或函数对外导出而范围内没有调用点（去向看不见），拿不准的列进待人审清单（只报不拦）；有调用点而都没喂进摘要或存储的不报。
  // 形状三成分：取键（keySources 点名的调用，或 for…in）、排序（.sort/.toSorted，或嵌套循环里的手写比较交换）、拼串（模板串带插值、与字串相加、+=、join、JSON.stringify）。
  canonicalDef(ctx, rec, rule, emit) {
    const sinks = new Set(rule.sinks || []);
    const keySrc = new Set(rule.keySources || []);
    const isLoop = (x) => x.type === 'WhileStatement' || x.type === 'DoWhileStatement' || x.type === 'ForStatement' || x.type === 'ForOfStatement' || x.type === 'ForInStatement';
    const sortM = new Set(rule.sortMethods || []); const joinM = new Set(rule.stringMethods || []);
    const accM = new Set(rule.accumulateMethods || []);
    const placeM = new Set(rule.placeMethods || []); const contM = new Set(rule.continueMethods || []); const passC = new Set(rule.passCalls || []);
    const charM = new Set(rule.charMethods || []); const mixOps = new Set(rule.mixOps || []); const mixCalls = new Set(rule.mixCalls || []);
    const isStrOut = (x, r) => (x.type === 'TemplateLiteral' && x.expressions.length > 0) || (x.type === 'BinaryExpression' && x.operator === '+' && (isStr(fold(x.left, r)) || isStr(fold(x.right, r))))
      || (x.type === 'AssignmentExpression' && x.operator === '+=' && isStr(fold(x.right, r))) || (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && joinM.has(propName(x.callee)));
    // 每个函数节点上的判定只算一次（函数体判定与调用方无关）；递归中的节点按“没有”算，防成环。
    const cached = () => { const m = new Map(); return (fn, r, compute) => { const k = fn; if (m.has(k)) return m.get(k); m.set(k, false); const v = compute(fn, r); m.set(k, v); return v; }; };
    const cStr = cached(); const cKeys = cached(); const cSort = cached(); const cKeysVia = cached(); const cSortVia = cached();
    const strOut = (fn, r) => cStr(fn, r, () => hasSub(fn.body, (x) => isStrOut(x, r)));
    // 自写的取键、排序辅助函数：被调函数（按取值来源跟到定义，跨文件也跟）里有取键或排序，且它自己不拼串（拼串的整套序列化函数自己会被判，调它不算自己实现）。
    const calledFns = (call, r) => calleeOrigins(call, r).filter((o) => o.fn).map((o) => ({ fn: o.fn, r: o.rec || r }));
    // 实例的构造来源：new Map(…) 本身、const/let 绑定的初值、形参的调用点实参，沿绑定跟（深度 4），给出构造函数的来源路径（'Map'）；
    // 取键调用按“构造来源.方法名”（Map.keys）查 keySources，同 Object.keys 一样由规则数据点名。
    const newsOf = (node, r, depth = 0) => {
      if (!node || depth > 4) return [];
      if (node.type === 'ChainExpression') return newsOf(node.expression, r, depth + 1);
      if (node.type === 'NewExpression') return [{ node, r }];
      if (node.type !== 'Identifier' || !node.__scope) return [];
      const b = node.__scope.lookup(node.name);
      if (!b || b.keyPath.length) return [];
      if (b.kind === 'param' && b.fn) return callSitesOf(r, b.fn).flatMap((s) => { const a = s.call.arguments[b.index]; return a && a.type !== 'SpreadElement' ? newsOf(a, s.rec, depth + 1) : []; });
      return b.init ? newsOf(b.init, r, depth + 1) : [];
    };
    const ctorKeys = (node, r) => newsOf(node, r).flatMap((w) => globalOrigins(originsOf(w.node.callee, w.r)).map(pathKey));
    // 类实例上存的别名：h = new Hasher() 之后 h.hash(串)，取 Hasher 里同名的类字段或 this.hash = … 赋的值（按取值来源判是不是摘要或存储函数）。
    const instanceMemberOrigins = (c, r) => {
      if (c.type !== 'MemberExpression' || c.computed) return [];
      const name = c.property.name;
      const out = [];
      for (const w of newsOf(c.object, r)) for (const o of originsOf(w.node.callee, w.r)) {
        if (!o.cls) continue;
        const cr = o.rec || w.r;
        walkAll(o.cls, (x) => {
          if (x.type === 'PropertyDefinition' && !x.computed && x.key.name === name && x.value) out.push(...originsOf(x.value, cr).map((v) => ({ ...v, rec: v.rec || cr })));
          else if (x.type === 'AssignmentExpression' && x.operator === '=' && x.left.type === 'MemberExpression' && x.left.object.type === 'ThisExpression' && !x.left.computed && x.left.property.name === name) out.push(...originsOf(x.right, cr).map((v) => ({ ...v, rec: v.rec || cr })));
        });
      }
      return out;
    };
    const keyCall = (x, r) => x.type === 'CallExpression' && (globalOrigins(calleeOrigins(x, r)).some((o) => keySrc.has(pathKey(o)))
      || (x.callee.type === 'MemberExpression' && !x.callee.computed && ctorKeys(x.callee.object, r).some((c) => keySrc.has(`${c}.${x.callee.property.name}`))));
    const keysIn = (fn, r) => cKeys(fn, r, () => hasSub(fn.body, (x) => x.type === 'ForInStatement' || keyCall(x, r)));
    const isCmp = (z) => z.type === 'BinaryExpression' && ['<', '>', '<=', '>='].includes(z.operator);
    const cmpIn = (b) => hasSub(b, isCmp);
    // 数组元素（a[i]、this.a[i]）所属的数组名；不是下标取元素给 null。
    const arrOf = (e) => {
      if (e.type !== 'MemberExpression' || !e.computed) return null;
      const o = e.object;
      if (o.type === 'Identifier') return o.name;
      return o.type === 'MemberExpression' && !o.computed && o.object.type === 'ThisExpression' ? `this.${o.property.name}` : null;
    };
    const elemCmp = (z) => isCmp(z) && hasSub(z, (m) => arrOf(m) !== null);
    // 同一个数组的元素在一个比较里出现两次或以上（a[i - 1] > a[i]、a[i].localeCompare(a[i + 1]) > 0、cmp(a[i], a[j]) > 0）。
    const dupCmp = (z) => { if (!isCmp(z)) return false; const cnt = new Map(); let hit = false; walkAll(z, (m) => { const a = arrOf(m); if (a !== null) { cnt.set(a, (cnt.get(a) || 0) + 1); if (cnt.get(a) >= 2) hit = true; } }); return hit; };
    const placeCall = (z) => z.type === 'CallExpression' && z.callee.type === 'MemberExpression' && placeM.has(propName(z.callee));
    // 按下标写元素（含解构交换 [a[i], a[j]] = […]）。
    const elemWrite = (z) => z.type === 'AssignmentExpression' && hasSub(z.left, (m) => arrOf(m) !== null);
    // 手写排序（迭代式也在内）：循环里（含循环条件）比较并写回——嵌套循环里比较并赋值或按位置插入（冒泡、插入、splice 插入），
    // 或某个循环里同一数组的元素两两相比并按下标写回（地精排序、栈或队列上交换）。
    const loopCmp = (y) => cmpIn(y.body) || (y.test && hasSub(y.test, elemCmp));
    const handSort = (fn) => hasSub(fn.body, (x) => isLoop(x) && (hasSub(x.body, (y) => isLoop(y) && loopCmp(y) && hasSub(y.body, (z) => z.type === 'AssignmentExpression' || placeCall(z)))
      || (hasSub(x, dupCmp) && hasSub(x, (z) => elemWrite(z) || placeCall(z)))));
    const sortIn = (fn, r) => cSort(fn, r, () => hasSub(fn.body, (x) => x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && sortM.has(propName(x.callee))) || handSort(fn));
    // 经辅助函数：函数体里的某个调用，其被调函数（只看直接调的一层）有该成分且自己不拼串。
    const viaOf = (cache, direct) => (fn, r) => cache(fn, r, () => hasSub(fn.body, (x) => x.type === 'CallExpression' && calledFns(x, r).some((o) => direct(o.fn, o.r) && !strOut(o.fn, o.r))));
    const keysVia = viaOf(cKeysVia, keysIn); const sortVia = viaOf(cSortVia, sortIn);
    // 取键、排序经自写辅助函数只在 mode=confirmed 认（要流进摘要才报，噪声小）；待人审清单（review）只认函数里自己写出来的，免得把调了辅助函数的大函数全列进去。
    const via = rule.mode !== 'review';
    const shaped = (fn) => (keysIn(fn, rec) || (via && keysVia(fn, rec))) && (sortIn(fn, rec) || (via && sortVia(fn, rec))) && strOut(fn, rec);
    // 自写摘要函数：逐字符取码（charMethods）并按位混合（mixOps、mixCalls），按函数体的形状判，不按名字。
    const digestFn = (fn, r) => hasSub(fn.body, (x) => x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && charM.has(propName(x.callee)))
      && hasSub(fn.body, (x) => ((x.type === 'BinaryExpression' || x.type === 'AssignmentExpression') && mixOps.has(x.operator.replace(/=$/, ''))) || (x.type === 'CallExpression' && globalOrigins(calleeOrigins(x, r)).some((o) => mixCalls.has(pathKey(o)))));
    // 摘要或存储调用只按取值来源认（导入名、别名、成员赋值、const 绑定都跟到定义），不按被调者的裸名：被调函数的来源在 sinks 里，或方法调用的接收者
    // 沿 const 绑定与方法链回到一个来源在 sinks 里的调用（createHash('sha256').update(串)），或被调函数按形状是自写摘要函数。
    // 外来形参（没有调用点、或调用点传来的来源看不见）上的成员调用：来源路径是 形参.….末段，末段在 sinks 里就认；只要有任何一个已知来源（对象字面量、函数、类、
    // 带路径的全局或导入）就说明接收者的来源是看得见的，按那些来源判，不再认形参自身的路径。路径来自语法树取值来源，不是被调者裸名。
    const sinkOrigin = (os) => globalOrigins(os).some((o) => sinks.has(lastName(o)))
      || (os.some((o) => o.shadow && o.path && o.path.length > 1 && sinks.has(lastName(o))) && os.every((o) => o.unknown || o.shadow));
    const recvIsSink = (c, r) => {
      let o = c.type === 'MemberExpression' ? c.object : null;
      for (let g = 0; o && g < 8; g++) {
        o = resolveNode(o);
        if (o && o.type === 'ChainExpression') o = o.expression;
        if (!o || o.type !== 'CallExpression') return false;
        if (sinkOrigin(calleeOrigins(o, r))) return true;
        o = o.callee.type === 'MemberExpression' ? o.callee.object : null;
      }
      return false;
    };
    const isSink = (call, r) => {
      const inst = instanceMemberOrigins(call.callee, r);
      return sinkOrigin(calleeOrigins(call, r)) || sinkOrigin(inst) || recvIsSink(call.callee, r)
        || calledFns(call, r).concat(inst.filter((o) => o.fn).map((o) => ({ fn: o.fn, r: o.rec }))).some((o) => digestFn(o.fn, o.r));
    };
    const PASS = new Set(['TemplateLiteral', 'BinaryExpression', 'ConditionalExpression', 'LogicalExpression', 'SequenceExpression', 'ArrayExpression', 'AwaitExpression', 'ChainExpression', 'SpreadElement']);
    const enclosingFn = (n) => { for (let p = n.__parent; p; p = p.__parent) if (isFn(p)) return p; return null; };
    const memberKey = (m, r) => (m.computed ? (() => { const f = fold(m.property, r); return f ? String(f.v) : null; })() : (m.property.name ?? String(m.property.value)));
    const isAssignLeft = (m) => m.__parent && m.__parent.type === 'AssignmentExpression' && m.__parent.left === m;
    // 绑定 b 的各处引用里有没有流进 sinks 的（把串存进变量再取出来用）。
    const followBinding = (b, r, depth, obj = false) => {
      if (!b || depth > 4) return false;
      let found = false;
      walkAll(r.ast, (x) => { if (!found && x.type === 'Identifier' && x.__scope && x.__scope.lookup(x.name) === b && flows(x, r, depth + 1, obj)) found = true; });
      return found;
    };
    // 存进对象成员（box.text = …、this.text = …）后，从同一成员取出来用：根是变量按绑定、是 this 按文件里的 this.同名成员。
    const followMember = (m, r, depth) => {
      if (depth > 4) return false;
      const key = memberKey(m, r);
      if (key === null) return false;
      let found = false;
      if (m.object.type === 'ThisExpression') {
        walkAll(r.ast, (x) => { if (!found && x.type === 'MemberExpression' && x.object.type === 'ThisExpression' && !isAssignLeft(x) && memberKey(x, r) === key && flows(x, r, depth + 1)) found = true; });
        return found;
      }
      if (m.object.type !== 'Identifier') return false;
      const b = m.object.__scope ? m.object.__scope.lookup(m.object.name) : null;
      if (!b) return false;
      walkAll(r.ast, (x) => {
        if (found || x.type !== 'Identifier' || !x.__scope || x.__scope.lookup(x.name) !== b) return;
        const q = x.__parent;
        if (q && q.type === 'MemberExpression' && q.object === x) { if (!isAssignLeft(q) && memberKey(q, r) === key && flows(q, r, depth + 1)) found = true; } else if (flows(x, r, depth + 1)) found = true;
      });
      return found;
    };
    // 这个表达式的值是否流进 sinks 里的调用（r 是它所在的文件记录）：沿拼接、数组、变量、对象成员、实参到自写函数的形参、累加（push）、返回值追，深度 4。
    const flows = (node, r, depth, obj0 = false) => {
      let n = node;
      let obj = obj0; // 值已装进对象字面量（{ text: 串 }）：之后取它的成员才算还是那个串
      for (let g = 0; g < 40; g++) {
        const p = n.__parent;
        if (!p) return false;
        if (p.type === 'CallExpression' && p.arguments.includes(n)) {
          if (isSink(p, r)) return true;
          // Promise.resolve(串) 一类原样包一层的调用：值照旧往下追。
          if (globalOrigins(calleeOrigins(p, r)).some((o) => passC.has(pathKey(o)))) { n = p; continue; }
          if (depth > 4) return false;
          const idx = p.arguments.indexOf(n);
          // 交给自写函数：看它的形参在函数体里是否流进摘要或存储（自写的 hash 包装函数）。
          if (calledFns(p, r).some((o) => { const pr = o.fn.params[idx]; const id = pr && pr.type === 'AssignmentPattern' ? pr.left : pr; return id && id.type === 'Identifier' && followBinding(id.__scope ? id.__scope.lookup(id.name) : null, o.r, depth + 1, obj); })) return true;
          // 累加：lines.push(串)、s.concat(串)，累加进的数组或变量再用。
          if (p.callee.type === 'MemberExpression' && accM.has(propName(p.callee))) {
            const t = p.callee.object;
            if (t.type === 'Identifier') return followBinding(t.__scope ? t.__scope.lookup(t.name) : null, r, depth + 1, obj);
            if (t.type === 'MemberExpression') return followMember(t, r, depth + 1);
          }
          return false;
        }
        if (PASS.has(p.type)) { n = p; continue; }
        // p.then(回调)：值是回调的第一个形参（回调给函数表达式、函数名或摘要函数的引用都认）。
        if (p.type === 'MemberExpression' && p.object === n && p.__parent && p.__parent.type === 'CallExpression' && p.__parent.callee === p && contM.has(propName(p))) {
          const cb = p.__parent.arguments[0];
          if (!cb || cb.type === 'SpreadElement' || depth > 4) return false;
          const viaParam = (fnNode, fr) => { const pr = fnNode.params[0]; const id = pr && pr.type === 'AssignmentPattern' ? pr.left : pr; return !!id && id.type === 'Identifier' && followBinding(id.__scope ? id.__scope.lookup(id.name) : null, fr, depth + 1, obj); };
          if (isFn(cb)) return viaParam(cb, r);
          return originsOf(cb, r).some((o) => (o.fn && (digestFn(o.fn, o.rec || r) || viaParam(o.fn, o.rec || r))) || (o.path && !o.shadow && sinks.has(lastName(o))));
        }
        if (p.type === 'MemberExpression' && p.object === n && p.__parent && p.__parent.type === 'CallExpression' && p.__parent.callee === p) { n = p.__parent; continue; } // [a, b].join('|')
        if (obj && p.type === 'MemberExpression' && p.object === n && !isAssignLeft(p)) { n = p; obj = false; continue; } // { text: 串 }.text 取回
        if (p.type === 'Property' && p.value === n && p.__parent && p.__parent.type === 'ObjectExpression') { n = p.__parent; obj = true; continue; } // { text: 串 }
        if (p.type === 'VariableDeclarator' && p.init === n && p.id.type === 'Identifier') return followBinding(p.id.__scope ? p.id.__scope.lookup(p.id.name) : null, r, depth, obj);
        if (p.type === 'AssignmentExpression' && p.right === n) {
          if (p.left.type === 'Identifier') return followBinding(p.left.__scope ? p.left.__scope.lookup(p.left.name) : null, r, depth, obj);
          if (p.left.type === 'MemberExpression') return followMember(p.left, r, depth);
          return false;
        }
        if (p.type === 'ReturnStatement' || (p.type === 'ArrowFunctionExpression' && p.body === n)) {
          const f = p.type === 'ReturnStatement' ? enclosingFn(p) : p;
          if (!f || depth > 3) return false;
          return callSitesOf(r, f).some((s) => !(s.rec === r && s.call.start >= f.start && s.call.end <= f.end) && flows(s.call, s.rec, depth + 1));
        }
        return false;
      }
      return false;
    };
    // 函数里拼出字符串的表达式（模板串、字串相加、+=、join、stringify）：规范序列化的“产出”，是否流进摘要或存储看它们。
    const producers = (fn) => { const out = []; walkAll(fn.body, (x) => { if (isStrOut(x, rec)) out.push(x.type === 'AssignmentExpression' ? x.right : x); }); return out; };
    const sites = (fn) => callSitesOf(rec, fn).filter((s) => !(s.rec === rec && s.call.start >= fn.start && s.call.end <= fn.end));
    const exported = (fn) => {
      const p = fn.__parent;
      if (p && (p.type === 'ExportDefaultDeclaration' || (p.type === 'ExportNamedDeclaration'))) return true;
      const decl = p && p.type === 'VariableDeclarator' ? p : null;
      if (decl && decl.__parent && decl.__parent.__parent && decl.__parent.__parent.type === 'ExportNamedDeclaration') return true;
      const name = fn.type === 'FunctionDeclaration' && fn.id ? fn.id.name : (decl && decl.id.type === 'Identifier' ? decl.id.name : null);
      return name !== null && rec.ast.body.some((st) => (st.type === 'ExportNamedDeclaration' && !st.source && st.specifiers.some((sp) => sp.local.name === name)) || (st.type === 'ExportDefaultDeclaration' && st.declaration.type === 'Identifier' && st.declaration.name === name));
    };
    const found = [];
    walkAll(rec.ast, (n) => { if (isFn(n) && shaped(n)) found.push(n); });
    for (const fn of found) {
      if (found.some((o) => o !== fn && o.start >= fn.start && o.end <= fn.end)) continue; // 只看最内层满足形状的函数
      // 确认流进：函数里拼出的串自己流进摘要或存储，或它的调用点把结果喂进去。函数里只是另外调了公共的摘要（sha256Text(canonical(x))），串不是自己拼的，不算。
      const confirmed = producers(fn).some((x) => flows(x, rec, 0)) || sites(fn).some((s) => flows(s.call, s.rec, 0));
      if (rule.mode === 'review') {
        const equality = sites(fn).some((s) => s.call.__parent && s.call.__parent.type === 'BinaryExpression' && CMP.has(s.call.__parent.operator));
        // 对外导出且范围内没有任何调用点（谁在用、结果去哪看不见）才算拿不准；有调用点而都没喂进摘要或存储的，已知不流进，不报。
        if (!confirmed && (equality || (exported(fn) && sites(fn).length === 0))) emit(fn, 'shape', '');
      } else if (confirmed) emit(fn, 'shape', '');
    }
  },
  // 模块顶层私有缓存（L-09 ③①；卷十二 §2.3 开放登记）：`new <ctor>(…)` 赋给模块级变量（顶层 const/let/var 声明、导出声明、
  // 顶层赋值）。ctors 由规则数据点名；memo 模块一类允许文件由 lit_scope 的 exceptFiles 排掉，本函数不列文件名。
  topModuleNew(ctx, rec, rule, emit) {
    const ctors = new Set(rule.ctors || []);
    const isNew = (node) => node && node.type === 'NewExpression' && node.callee.type === 'Identifier' && ctors.has(node.callee.name);
    const decl = (d) => { if (!d || d.type !== 'VariableDeclaration') return; for (const x of d.declarations) if (isNew(x.init)) emit(x, 'topnew', x.init.callee.name); };
    for (const st of rec.ast.body) {
      if (st.type === 'VariableDeclaration') decl(st);
      else if (st.type === 'ExportNamedDeclaration') decl(st.declaration);
      else if (st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression') {
        const e = st.expression;
        if (e.left.type === 'Identifier' && isNew(e.right)) emit(e, 'topnew', e.right.callee.name);
      }
    }
  },
  // 成员链之后的调用（L-09 ③②）：`x.a.b(…)`，被调成员链的尾部正好是 rule.chain 点名的成员（非计算属性）。
  // 加载器一类允许文件由 lit_scope 的 exceptFiles 排掉，本函数不列文件名。
  memberChainCall(ctx, rec, rule, emit) {
    const chain = Array.isArray(rule.chain) ? rule.chain : [];
    if (!chain.length) return;
    walkAll(rec.ast, (n) => {
      if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression') return;
      const segs = [];
      let c = n.callee;
      while (c && c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') { segs.unshift(c.property.name); c = c.object; }
      if (segs.length < chain.length) return;
      const tail = segs.slice(segs.length - chain.length);
      if (tail.every((s, i) => s === chain[i])) emit(n, 'member', tail.join('.'));
    });
  },
  // 具名函数直接调用（L-09 ③③）：`name(…)`。names 由规则数据点名；允许文件同样走 exceptFiles。
  plainCallName(ctx, rec, rule, emit) {
    const names = new Set(rule.names || []);
    walkAll(rec.ast, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && names.has(n.callee.name)) emit(n, 'call', n.callee.name);
    });
  },
};

export const RULE_KINDS = Object.keys(KINDS);

// 对一个文件跑一条规则；emit(node, kind, detail) 由调用方包成命中。
export function runRule(ctx, rec, rule, emitHit, extra = {}) {
  const fn = KINDS[rule.kind];
  if (!fn) throw new Error(`E-ACC-ITEM-PARAM unknown ast rule kind ${rule.kind}`);
  const emit = (node, kind, detail) => emitHit({ ...where(node), nodeKind: `${rule.name}:${kind}`, detail });
  walkAllRecInit(rec);
  fn(ctx, rec, rule, emit, extra);
}

// memberNames 等工具要拿到文件记录：给根节点挂一次。
function walkAllRecInit(rec) { rec.ast.__rec = rec; }
export { children, memberNames };
