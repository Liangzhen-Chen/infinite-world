// 乙-4 H2：entryCallerFiles 只读采集。
// 登记项 = 各卷 §3.1「读入口」节里登记的入口名（卷二 §2.7 的 systems 登记表现在只有两行示例，真正的读入口清单分写在各领域卷 §3.1；
// 这里按各卷 §3.1 取，每个入口名一项，登记项的归属卷记在 volume 字段）。
// 对每个入口名，静态 grep server-plugin/ 与 extension/ 下 .mjs/.js 的文本，找出「调用它的文件」与「定义它的文件」。
// 只读、确定性、不联网，不执行被读代码。用法：node collect-entry-callers.mjs
// 输出：审查/脚本输出/乙4-entryCallerFiles.json 与 乙4-entryCallerFiles-摘要.md
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const REPO = 'F:/dnd';
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const ROOTS = ['server-plugin', 'extension'];
const SECTION = '### 3.1 ';
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
// 入口名：小写字母开头的标识符，后面是 ( 或记号结束；至少 3 个字符
const NAME = /^([a-z][A-Za-z0-9_]{2,})(?:\(|$)/;
const STOP = new Set(['engine', 'state', 'null', 'true', 'false', 'string', 'number', 'integer', 'boolean', 'object', 'array']);

// 1 取登记项
const vols = readdirSync(CFG.dir).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const entries = []; // {volume, entry, srcLine}
for (const f of vols) {
  const L = readFileSync(`${CFG.dir}/${f}`, 'utf8').split(/\r?\n/);
  const s = L.findIndex(l => l.startsWith(SECTION));
  if (s < 0) continue;
  let e = L.findIndex((l, i) => i > s && /^#{1,3} /.test(l));
  if (e < 0) e = L.length;
  let inCode = false;
  for (let i = s + 1; i < e; i++) {
    const l = L[i];
    if (/^```/.test(l)) { inCode = !inCode; continue; }
    if (inCode) continue;
    let zone = null;
    if (/^\|/.test(l)) { if (/^\|\s*:?-{3}/.test(l)) continue; zone = cells(l).slice(0, 2).join(' '); }
    else if (/^[-*] /.test(l)) zone = l.slice(2);
    if (zone === null) continue;
    // 行首的第一个反引号记号（表格取前两格里的所有记号，列表项只取第一个）
    const toks = [...zone.matchAll(/`([^`]+)`/g)].map(m => m[1].trim());
    const pick = /^\|/.test(l) ? toks : toks.slice(0, 1);
    for (const t of pick) {
      const m = t.match(NAME);
      if (m && !STOP.has(m[1])) entries.push({ volume: f.split('-')[0], entry: m[1], srcLine: i + 1 });
    }
  }
}
// 同卷同名只留首次
const uniq = new Map();
for (const x of entries) { const k = x.volume + '\0' + x.entry; if (!uniq.has(k)) uniq.set(k, x); }
const list = [...uniq.values()].sort((a, b) => (a.volume + a.entry < b.volume + b.entry ? -1 : 1));

// 2 读语料
function walk(rel, acc) {
  for (const name of readdirSync(`${REPO}/${rel}`).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    if (statSync(`${REPO}/${r}`).isDirectory()) walk(r, acc);
    else if (/\.(?:mjs|js)$/.test(name)) acc.push(r);
  }
  return acc;
}
const files = ROOTS.flatMap(r => walk(r, [])).sort();
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1');
const text = new Map(files.map(f => [f, strip(readFileSync(`${REPO}/${f}`, 'utf8'))]));

// 3 对每个入口名 grep
const names = [...new Set(list.map(x => x.entry))].sort();
const hit = new Map();
for (const n of names) {
  const call = new RegExp(`\\b${n}\\s*\\(`);
  const def = new RegExp(`\\bfunction\\s*\\*?\\s+${n}\\b|\\b(?:const|let|var)\\s+${n}\\s*=|\\bexport\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`);
  const defFiles = [], callerFiles = [];
  for (const f of files) {
    const t = text.get(f);
    const d = def.test(t);
    if (d) defFiles.push(f);
    else if (call.test(t)) callerFiles.push(f);
  }
  hit.set(n, { defFiles, callerFiles });
}
const result = list.map(x => ({ volume: x.volume, entry: x.entry, srcLine: x.srcLine, ...hit.get(x.entry) }));
const tree = ROOTS.map(r => r + ' ' + execFileSync('git', ['-C', REPO, 'rev-parse', '--short=10', 'HEAD:' + r], { encoding: 'utf8' }).trim()).join('、');
const withCaller = result.filter(r => r.callerFiles.length > 0).length;
const withDef = result.filter(r => r.defFiles.length > 0).length;
writeFileSync(`${OUT}/乙4-entryCallerFiles.json`, JSON.stringify({ _说明: '登记项 → 调用文件；脚本生成，勿手改', tree, count: result.length, entries: result }, null, 1) + '\n');

const perVol = new Map();
for (const r of result) { const v = perVol.get(r.volume) ?? { n: 0, def: 0, call: 0 }; v.n++; if (r.defFiles.length) v.def++; if (r.callerFiles.length) v.call++; perVol.set(r.volume, v); }
const md = [
  '# 乙-4 H2 entryCallerFiles 采集摘要（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/collect-entry-callers.mjs（只读、确定性；同一树重跑逐字一致）',
  `- 采集对象：目录树哈希 ${tree}`,
  `- 登记项口径：卷二 §2.7 的 systems 登记表现只有两行示例（status、capacity），没有全书汇总的登记数据；本次按各领域卷 §3.1「读入口」节登记的入口名取（表格取前两格里的反引号记号，列表项取行首第一个记号，记号须是小写开头标识符，后接 \`(\` 或到记号结束）。每个入口名在其所在卷下算一项。`,
  `- 检索口径：静态读 ${ROOTS.join('、')} 下 ${files.length} 个 .mjs/.js 文本，先去掉块注释与行注释；「定义文件」= 含 function 名、const/let/var 名 = 或 export { … 名 … } 的文件；「调用文件」= 不是定义文件、但含 名( 的文件（\`.名(\` 的成员调用也算）。以名字为准，不区分同名的不同函数，所以是上界。`,
  `- 登记项数：${result.length}（入口名 ${names.length} 个）；其中旧代码里已有同名定义的 ${withDef} 项；有调用文件的 ${withCaller} 项；调用文件为空集的 ${result.length - withCaller} 项（本设计新立的入口在旧代码里没有调用方，属预期）。`,
  '',
  '| 卷 | 登记项数 | 旧代码已有同名定义 | 有调用文件 |', '|---|---:|---:|---:|',
  ...[...perVol].sort().map(([v, x]) => `| ${v} | ${x.n} | ${x.def} | ${x.call} |`),
  '',
  '有调用文件的登记项（前 40，按调用文件数降序）：',
  '',
  '| 卷 | 入口 | 定义文件 | 调用文件数 |', '|---|---|---|---:|',
  ...result.filter(r => r.callerFiles.length).sort((a, b) => b.callerFiles.length - a.callerFiles.length || (a.volume + a.entry < b.volume + b.entry ? -1 : 1)).slice(0, 40).map(r => `| ${r.volume} | ${r.entry} | ${r.defFiles.join('、') || '—'} | ${r.callerFiles.length} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/乙4-entryCallerFiles-摘要.md`, md);
console.log(`登记项 ${result.length}，入口名 ${names.length}，旧代码有定义 ${withDef}，有调用文件 ${withCaller}，树 ${tree}`);
