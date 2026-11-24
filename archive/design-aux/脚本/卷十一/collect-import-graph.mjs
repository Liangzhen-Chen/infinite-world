// 乙-4 H3：import 图只读采集。静态读 server-plugin/ 与 extension/ 下 .mjs/.js 的源码文本（不执行、不加载），
// 解析 import / export...from / 动态 import("字面量") 里的相对路径，输出文件到文件的有向边表。
// 只读、确定性（文件与边都按路径升序）、不联网。用法：node collect-import-graph.mjs
// 输出：审查/脚本输出/乙4-import图-边表.tsv 与 乙4-import图-摘要.md
import { readFileSync, readdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname, posix } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const REPO = 'F:/dnd';
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const ROOTS = ['server-plugin', 'extension'];
const EXT = /\.(?:mjs|js)$/;

function walk(rel, acc) {
  for (const name of readdirSync(`${REPO}/${rel}`).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    if (statSync(`${REPO}/${r}`).isDirectory()) walk(r, acc);
    else if (EXT.test(name)) acc.push(r);
  }
  return acc;
}
const files = ROOTS.flatMap(r => walk(r, [])).sort();
const fileSet = new Set(files);

// 去掉注释与字符串之外的干扰很难做到完全精确；这里只匹配"关键字加引号路径"的形状，注释里的 import 示例会被排除：
// 先去掉块注释与行注释（保守：行注释只在行首或空白后的 // ）。
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1');
}
// 三种形状：① import ... from '路径' 与 import '路径'；② export ... from '路径'；③ import('路径')
const RE_FROM = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1/g;
const RE_SIDE = /\bimport\s*(['"])([^'"\n]+)\1/g;
const RE_DYN = /\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g;

function resolve(from, spec) {
  if (!/^\.{1,2}\//.test(spec)) return null; // 裸说明符（node: 内建、包名）不入边
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const cand of [base, base + '.mjs', base + '.js', base + '/index.mjs', base + '/index.js']) if (fileSet.has(cand)) return cand;
  return undefined; // 相对路径但落在采集范围之外或不存在
}

const edges = [];
const outside = []; // 相对路径但不在 server-plugin/extension 内（如 ../tools/…、../world/…、不存在）
let bare = 0, dyn = 0;
for (const f of files) {
  const src = stripComments(readFileSync(`${REPO}/${f}`, 'utf8'));
  const seen = new Set();
  const add = (spec, kind) => {
    const key = kind + '\0' + spec;
    if (seen.has(key)) return; seen.add(key);
    const r = resolve(f, spec);
    if (r === null) { bare++; return; }
    if (r === undefined) { outside.push([f, spec, kind]); return; }
    edges.push([f, r, kind]);
  };
  for (const m of src.matchAll(RE_FROM)) add(m[2], 'static');
  for (const m of src.matchAll(RE_SIDE)) add(m[2], 'static');
  for (const m of src.matchAll(RE_DYN)) { dyn++; add(m[2], 'dynamic'); }
}
edges.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] < b[2] ? -1 : 1));
outside.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
const head = ROOTS.map(r => r + ' ' + execFileSync('git', ['-C', REPO, 'rev-parse', '--short=10', 'HEAD:' + r], { encoding: 'utf8' }).trim()).join('、');
const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', ...ROOTS], { encoding: 'utf8' }).trim();

writeFileSync(`${OUT}/乙4-import图-边表.tsv`, 'from\tto\tkind\n' + edges.map(e => e.join('\t')).join('\n') + '\n');
const indeg = new Map(), outdeg = new Map();
for (const [a, b] of edges) { outdeg.set(a, (outdeg.get(a) ?? 0) + 1); indeg.set(b, (indeg.get(b) ?? 0) + 1); }
const top = [...indeg].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10);
const md = [
  '# 乙-4 H3 import 图采集摘要（脚本生成，勿手改）',
  '',
  `- 生成脚本：脚本/卷十一/collect-import-graph.mjs（只读、确定性；同一提交重跑逐字一致）`,
  `- 采集对象：目录树哈希 ${head}（git 的树对象，与提交号无关；同一树即同一内容；工作树相对该树的未提交改动：${dirty === '' ? '无' : dirty.split('\n').length + ' 项'}）`,
  `- 检索口径：静态读 ${ROOTS.join('、')} 下全部 .mjs/.js 文本；先去掉块注释与行注释；匹配 import…from、import '…'、export…from、import('…') 四种形状里的相对路径说明符，按 ./、../、补 .mjs/.js、目录 index 解析；裸说明符（node: 内建、包名）不入边，只计数。不执行任何被读代码。`,
  `- 文件数：${files.length}（server-plugin ${files.filter(f => f.startsWith('server-plugin/')).length}、extension ${files.filter(f => f.startsWith('extension/')).length}）`,
  `- 边数：${edges.length}（静态 ${edges.filter(e => e[2] === 'static').length}、动态 ${edges.filter(e => e[2] === 'dynamic').length}）`,
  `- 裸说明符 ${bare} 个；动态 import 字面量 ${dyn} 处；相对路径但落在采集范围外或解析不到 ${outside.length} 条（列在下表）`,
  '',
  '被 import 最多的前 10 个文件：',
  '',
  '| 文件 | 入边数 |', '|---|---:|', ...top.map(([f, n]) => `| ${f} | ${n} |`),
  '',
  '范围外或解析不到的相对 import：',
  '',
  '| 文件 | 说明符 | 形状 |', '|---|---|---|', ...outside.slice(0, 60).map(o => `| ${o[0]} | ${o[1]} | ${o[2]} |`),
  ...(outside.length > 60 ? [`（其余 ${outside.length - 60} 条见脚本重跑结果，不再列出）`] : []),
  '',
].join('\n');
writeFileSync(`${OUT}/乙4-import图-摘要.md`, md);
console.log(`文件 ${files.length}，边 ${edges.length}，范围外 ${outside.length}，裸 ${bare}，树 ${head}`);
