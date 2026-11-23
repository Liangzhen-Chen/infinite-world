// 入口生产调用者报告（公共部件审查乙「给检查脚本的规则」14；C0 卡）：块 6 必须接通的入口，逐个数服务端非测试代码里的调用点，
// 并沿相对 import 图标出能否从装配入口文件到达。只报不拦：默认退出码 0，块验收由主会话看；带 --strict 时有任一入口不通才退出 1。
// 入口清单、代码根、装配入口都读 tools/accept/entries.json（加一个入口只加一行），本文件没有入口名、文件名。
// 用法：node tools/accept/entry-report.mjs [--root 目录] [--strict]
// 判定（每个入口一行，状态四选一）：
//   no-def       定义文件里没有这个导出（via=member 时没有这个方法定义）；
//   no-caller    代码根下除定义文件外没有它的调用点；
//   unreachable  有调用点，但调用所在的文件没有一个能从装配入口沿 import 到达；
//   ok           至少一个调用点所在的文件能从装配入口到达。
// 按语法树判（lib/ast.mjs，亮圳规定检查代码不许靠认字面文字判）：调用点取被调用方的取值来源——import 绑定（具名、别名、命名空间）、
// 局部别名与解构、.bind/.call/.apply 都跟到入口；via=member 的按成员调用的方法名认。
// 局限：经转手模块再导出后的调用、跨文件的形参与返回值传递、动态 import 的运行期说明符追不到，会少算；测试代码不在代码根下（tests/），不计入。

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, resolveRel, isCode } from './read.mjs';
import { projectOf, fileOf, walkAll, calleeOrigins, propName, fold } from './lib/ast.mjs';

const ENTRY_DATA = 'entries.json';

// 一个文件导出的名字（export function/class/const/let 名、export { 名, 旧名 as 新名 }，含 export … from）。
function exportedNames(rec) {
  const out = new Set();
  const add = (id) => {
    if (!id) return;
    if (id.type === 'Identifier') out.add(id.name);
    else if (id.type === 'ObjectPattern') id.properties.forEach((p) => add(p.type === 'RestElement' ? p.argument : p.value));
    else if (id.type === 'ArrayPattern') id.elements.forEach(add);
    else if (id.type === 'AssignmentPattern') add(id.left);
  };
  walkAll(rec.ast, (n) => {
    if (n.type !== 'ExportNamedDeclaration') return;
    if (n.declaration) { if (n.declaration.type === 'VariableDeclaration') n.declaration.declarations.forEach((d) => add(d.id)); else add(n.declaration.id); }
    else for (const s of n.specifiers) out.add(s.exported.name ?? String(s.exported.value));
  });
  return out;
}

// 方法定义：对象方法、类方法、值为函数的属性、函数声明，名字等于 name。
function definesMethod(rec, name) {
  let found = false;
  walkAll(rec.ast, (n) => {
    if (found) return;
    if ((n.type === 'MethodDefinition' || (n.type === 'Property' && (n.method || (n.value && (n.value.type === 'FunctionExpression' || n.value.type === 'ArrowFunctionExpression'))))) && !n.computed && (n.key.name ?? String(n.key.value)) === name) found = true;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) found = true;
  });
  return found;
}

// 文件间的相对 import 边（静态、export … from、字面量动态 import）。
function edgesOf(rec) {
  const out = [];
  walkAll(rec.ast, (n) => {
    let src = null;
    if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || (n.type === 'ExportNamedDeclaration' && n.source)) src = n.source;
    else if (n.type === 'ImportExpression') src = n.source;
    if (!src) return;
    const f = fold(src, rec);
    if (f && typeof f.v === 'string' && f.v.startsWith('.')) out.push(resolveRel(rec.file, f.v));
  });
  return out;
}

// 返回每个入口一行：{name, file, via, status, callSites, callerFiles, reachableCallerFiles}。
export function entryTable(ctx, data) {
  const project = projectOf(ctx);
  const codeFiles = ctx.files.filter((f) => f.startsWith(data.codeRoot) && isCode(f, ctx.model)).sort();
  const recs = new Map();
  for (const f of codeFiles) { const r = fileOf(project, f); if (r && r.ast) recs.set(f, r); }
  const reach = new Set();
  const stack = [data.reachRoot];
  while (stack.length) {
    const f = stack.pop();
    if (reach.has(f) || !recs.has(f)) continue;
    reach.add(f);
    for (const t of edgesOf(recs.get(f))) stack.push(t);
  }
  return data.entries.map((e) => {
    const defRec = recs.get(e.file);
    const member = e.via === 'member';
    const defined = Boolean(defRec) && (member ? definesMethod(defRec, e.name) : exportedNames(defRec).has(e.name));
    const callers = new Map();
    for (const [f, rec] of recs) {
      if (f === e.file) continue;
      let n = 0;
      walkAll(rec.ast, (c) => {
        if (c.type !== 'CallExpression') return;
        if (member) { if (c.callee.type === 'MemberExpression' && propName(c.callee) === e.name) n++; return; }
        for (const o of calleeOrigins(c, rec)) {
          if (!o.path || !o.mod || !o.mod.startsWith('.')) continue;
          if (resolveRel(f, o.mod) === e.file && o.path[0] === e.name) { n++; return; }
        }
      });
      if (n > 0) callers.set(f, n);
    }
    const callSites = [...callers.values()].reduce((a, b) => a + b, 0);
    const reachableCallerFiles = [...callers.keys()].filter((f) => reach.has(f)).length;
    const status = !defined ? 'no-def' : callSites === 0 ? 'no-caller' : reachableCallerFiles === 0 ? 'unreachable' : 'ok';
    return { name: e.name, file: e.file, via: e.via, status, callSites, callerFiles: callers.size, reachableCallerFiles };
  });
}

export function renderReport(rows, data) {
  const bad = rows.filter((r) => r.status !== 'ok');
  const lines = ['入口生产调用者报告（只报不拦；装配入口 ' + data.reachRoot + '，代码根 ' + data.codeRoot + '）', ''];
  lines.push('| 入口 | 定义文件 | 状态 | 调用点数 | 调用文件数 | 其中从装配入口可达 |', '|---|---|---|---|---|---|');
  for (const r of rows) lines.push(`| ${r.name} | ${r.file} | ${r.status} | ${r.callSites} | ${r.callerFiles} | ${r.reachableCallerFiles} |`);
  lines.push('', `共 ${rows.length} 个入口，${bad.length} 个不通（no-def 未定义、no-caller 无生产调用者、unreachable 调用者不可达）。`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const root = ri >= 0 ? args[ri + 1] : join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const data = JSON.parse(readFileSync(join(root, 'tools', 'accept', ENTRY_DATA), 'utf8'));
  const rows = entryTable(loadContext(root), data);
  process.stdout.write(renderReport(rows, data));
  if (args.includes('--strict') && rows.some((r) => r.status !== 'ok')) process.exit(1);
}
