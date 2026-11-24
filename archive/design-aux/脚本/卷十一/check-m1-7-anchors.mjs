// 乙-1/乙-4 补 1115y8（李白 4ddfba49 第 3 条）：M1-7 与被指行的全部锚点逐一比对。
// M1-7 指的旧物是 legacy、compat、migrations 三个目录和 initialFromLegacy 的全部出现处。这里静态读 server-plugin（不执行），
// 列出这些锚点（目录里的每个文件，加 initialFromLegacy 出现的每一行），再逐个看被指行（候选 M27-6、M27-7、M10-42、M11-2，领域卷在前、流程卷在后）的锚点覆盖不覆盖。
// 覆盖口径：先看被指行是否"点名了这个文件"（文件名相同，或通配 v2-phase1-*.mjs 匹配；写了行范围的，锚点行要落在范围内），
//         再看是否"点名了它所在的目录"（写作"某某 目录"或"某某/"）。候选按领域卷在前、流程卷在后，先点名文件的优先，再看目录。
// 只读、确定性、不联网。输出：审查/脚本输出/乙8-M1-7锚点比对.json 与 .md。用法：node check-m1-7-anchors.mjs（先跑 transcribe-migrows.mjs）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const REPO = 'F:/dnd';
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const byKey = new Map(mig.rows.map(r => [r.rowKey, r]));
const CAND = ['M27-6', 'M27-7', 'M10-42', 'M11-2'];
const DIRS = ['legacy', 'compat', 'migrations'];
const SYMBOL = 'initialFromLegacy';

// 1 M1-7 一侧的全部锚点
const anchors = [];
for (const d of DIRS) for (const f of readdirSync(`${REPO}/server-plugin/${d}`).sort()) anchors.push({ path: `server-plugin/${d}/${f}`, line: null, what: `${d} 目录里的文件` });
function walk(rel, acc) {
  for (const n of readdirSync(`${REPO}/${rel}`).sort()) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const r = `${rel}/${n}`;
    if (/\.(?:mjs|js)$/.test(n)) acc.push(r);
    else if (!/\./.test(n)) { try { walk(r, acc); } catch { /* 不是目录 */ } }
  }
  return acc;
}
for (const f of walk('server-plugin', [])) {
  readFileSync(`${REPO}/${f}`, 'utf8').split('\n').forEach((l, i) => { if (l.includes(SYMBOL) && !/^\s*\/\//.test(l)) anchors.push({ path: f, line: i + 1, what: `${SYMBOL} 出现处` }); });
}

// 2 逐个比对
const base = p => p.slice(p.lastIndexOf('/') + 1);
const dirOf = p => (p.match(/server-plugin\/(legacy|compat|migrations)\//) ?? [])[1] ?? null;
function glob(re, s) { return new RegExp('^' + re.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(s); }
function explicit(row, a) {
  return row.anchors.some(x => (x.file === base(a.path) || (x.file.includes('*') && glob(base(x.file), base(a.path))) || x.file === a.path.replace(/^server-plugin\//, '') || (x.file.includes('*') && glob(x.file.replace(/^.*\//, ''), base(a.path))))
    && (a.line === null || x.lines.length === 0 || x.lines.some(([lo, hi]) => lo <= a.line && a.line <= hi)));
}
function byDir(row, a) { const d = dirOf(a.path); return a.line === null && d && (row.anchorsText.includes(d + ' 目录') || row.anchorsText.includes(d + '/')); }
const pass1 = anchors.map(a => {
  let by = null, how = null;
  for (const k of CAND) { const r = byKey.get(k); if (r && explicit(r, a)) { by = k; how = '点名文件'; break; } }
  if (!by) for (const k of CAND) { const r = byKey.get(k); if (r && byDir(r, a)) { by = k; how = '点名目录'; break; } }
  return { ...a, by, how };
});
// 目录里的文件已被某行覆盖时，这个文件里的行锚点随该行（如 compat 目录里 initialFromLegacy 的定义行）
const result = pass1.map(a => {
  if (a.by || a.line === null) return a;
  const same = pass1.find(x => x.path === a.path && x.line === null && x.by);
  return same ? { ...a, by: same.by, how: '所在文件已被覆盖（' + same.how + '）' } : a;
});
writeFileSync(`${OUT}/乙8-M1-7锚点比对.json`, JSON.stringify({ candidates: CAND, anchors: result }, null, 1) + '\n');
const covered = result.filter(x => x.by).length;
const md = [
  '# 乙-1/乙-4 补 1115y8：M1-7 与被指行的全部锚点逐一比对（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/check-m1-7-anchors.mjs；静态读 server-plugin，不执行；候选被指行 ' + CAND.join('、') + '（领域卷在前、流程卷在后）。',
  '- 口径：先看被指行是否点名了该文件（写了行范围的，锚点行要落在范围内），再看是否点名了它所在的目录。',
  `- M1-7 一侧的锚点共 ${result.length} 个：被指行覆盖 ${covered} 个，没有被覆盖的 ${result.length - covered} 个（这些由 M1-7 的子行自己取对象，不写别名）。`,
  '',
  '| 锚点 | 是什么 | 覆盖它的被指行 | 怎么覆盖 |', '|---|---|---|---|',
  ...result.map(x => `| ${x.path}${x.line ? ':' + x.line : ''} | ${x.what} | ${x.by ?? '无'} | ${x.how ?? '—'} |`), '',
].join('\n');
writeFileSync(`${OUT}/乙8-M1-7锚点比对.md`, md);
console.log(`锚点 ${result.length}；被指行覆盖 ${covered}；未覆盖 ${result.length - covered}`);
console.log(result.map(x => `${x.path.replace('server-plugin/', '')}${x.line ? ':' + x.line : ''}→${x.by ?? '无'}`).join('\n'));
