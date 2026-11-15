// 乙-4 H4、H5：用 H1（migrows-input.json）、H3（import 边表）、H2（entryCallerFiles.json）算
//   H4：R11-3.4 的消费者组候选；R11-2.4 的锚点重叠条数与位置组总数；
//   H5：卷零 §4 的 41 项各自能派生出多少条迁移行（待补清单第 6 项）。
// 只读、确定性、不联网；不执行被读代码；结果由脚本写入，不手改。用法：node derive-groups.mjs
// 输出：审查/脚本输出/乙4-消费者组与位置组.md、乙4-卷零41项派生.md
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const REPO = 'F:/dnd';
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const MAXFILES = 25; // rules.migration.maxFiles（卷十一 §2.5）
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const FILE = /[A-Za-z0-9_./*-]+\.(?:mjs|json|js)\b/g;

// ---- 输入 ----
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const rows = mig.rows.filter(r => !r.aliasOf); // 别名行不单独计数
const edgeLines = readFileSync(`${OUT}/乙4-import图-边表.tsv`, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const callers = JSON.parse(readFileSync(`${OUT}/乙4-entryCallerFiles.json`, 'utf8'));

// ---- 仓库文件索引（server-plugin、extension、tools、tests、world 下的 .mjs/.js/.json）----
const ROOTS = ['server-plugin', 'extension', 'tools', 'tests', 'world'];
const all = [];
function walk(rel) {
  for (const name of readdirSync(`${REPO}/${rel}`).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    if (statSync(`${REPO}/${r}`).isDirectory()) walk(r);
    else if (/\.(?:mjs|js|json)$/.test(name)) all.push(r);
  }
}
ROOTS.forEach(walk);
const byBase = new Map();
for (const f of all) { const b = f.slice(f.lastIndexOf('/') + 1); (byBase.get(b) ?? byBase.set(b, []).get(b)).push(f); }
const exact = new Set(all);
// 锚点文件说明符 → 仓库路径：{path} | {ambiguous:[…]} | {unresolved}
function resolveFile(spec) {
  if (/\*/.test(spec)) return { unresolved: true };
  if (exact.has(spec)) return { path: spec };
  const suf = all.filter(f => f.endsWith('/' + spec));
  if (suf.length === 1) return { path: suf[0] };
  if (suf.length > 1) return { ambiguous: suf };
  if (!spec.includes('/')) {
    const c = byBase.get(spec) ?? [];
    if (c.length === 1) return { path: c[0] };
    if (c.length > 1) {
      const sp = c.filter(f => f.startsWith('server-plugin/') || f.startsWith('extension/'));
      if (sp.length === 1) return { path: sp[0] };
      return { ambiguous: c };
    }
  }
  return { unresolved: true };
}
// 模块组（卷二 §2.7 的目录登记；不在任何模块组的 server-plugin 文件属规则层）
function groupOf(p) {
  if (p.startsWith('server-plugin/input/')) return 'inputEdge';
  if (p.startsWith('server-plugin/gate/')) return 'gate';
  if (p.startsWith('server-plugin/output-gate/')) return 'outputGate';
  if (p.startsWith('server-plugin/ai-gate/')) return 'aiGate';
  if (p.startsWith('server-plugin/textcore/')) return 'textcore';
  if (p.startsWith('extension/host/')) return 'host';
  if (p.startsWith('extension/textcore/')) return 'clientTextcore';
  if (p.startsWith('extension/')) return 'display';
  if (p.startsWith('server-plugin/')) return 'rules层';
  return p.split('/')[0]; // tools、tests、world：离线或数据，不是运行时模块组
}

// ---- H1 行：解析锚点文件 ----
let nAnch = 0, nRes = 0, nAmb = 0, nUnres = 0;
for (const r of rows) {
  r.res = [];
  for (const a of r.anchors) {
    nAnch++;
    const x = resolveFile(a.file);
    if (x.path) { nRes++; r.res.push({ path: x.path, lines: a.lines }); }
    else if (x.ambiguous) { nAmb++; r.res.push({ ambiguous: x.ambiguous, raw: a.file, lines: a.lines }); }
    else { nUnres++; r.res.push({ raw: a.file, lines: a.lines, unresolved: true }); }
  }
}

// ---- R11-2.4 位置组：锚点重叠（同一文件、行范围相交）→ 并查集 ----
// 两种口径都算：A = 没写行号的锚点按整文件，与同文件任何锚点相交（规则字面读法）；
//               B = 只有写了行号的锚点互相比行范围，没写行号的整文件锚点只与同文件的整文件锚点相交（看有多少是被整文件锚点串起来的）。
function positionGroups(wholeFileMatchesAll) {
  const parent = rows.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  const perFile = new Map(); // 文件键 → [{i, lo, hi, whole}]
  rows.forEach((r, i) => {
    for (const x of r.res) {
      if (x.ambiguous) continue; // 歧义文件名不能确定是哪个文件，不算重叠依据
      const key = x.path ?? 'raw:' + x.raw;
      const whole = x.lines.length === 0;
      const rs = whole ? [[1, 1e9]] : x.lines;
      for (const [lo, hi] of rs) (perFile.get(key) ?? perFile.set(key, []).get(key)).push({ i, lo, hi, whole });
    }
  });
  const pairs = new Set();
  const glue = new Map(); // 文件键 → 相交对数
  for (const [key, L] of perFile) {
    L.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.i - b.i);
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length && L[b].lo <= L[a].hi; b++) {
      if (L[a].i === L[b].i) continue;
      if (!wholeFileMatchesAll && (L[a].whole !== L[b].whole)) continue;
      const p = Math.min(L[a].i, L[b].i) + ':' + Math.max(L[a].i, L[b].i);
      if (!pairs.has(p)) { pairs.add(p); glue.set(key, (glue.get(key) ?? 0) + 1); }
      union(L[a].i, L[b].i);
    }
  }
  const anchored = rows.map((r, i) => (r.res.some(x => !x.ambiguous) ? i : -1)).filter(i => i >= 0);
  const comp = new Map();
  for (const i of anchored) { const k = find(i); (comp.get(k) ?? comp.set(k, []).get(k)).push(i); }
  const multi = [...comp.values()].filter(c => c.length > 1).sort((a, b) => b.length - a.length);
  return { anchored, comp, multi, pairs, glue, rowsInMulti: multi.reduce((s, c) => s + c.length, 0) };
}
const PA = positionGroups(true), PB = positionGroups(false);
const anchoredRows = PA.anchored, comp = PA.comp, multi = PA.multi, pairs = PA.pairs, rowsInMulti = PA.rowsInMulti;
const noAnchorRows = rows.length - anchoredRows.length;
const topGlue = [...PA.glue].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6);

// ---- R11-3.4 消费者组：每个 targetObject ----
const importers = new Map(); // 文件 → 一跳 importer 集
for (const [a, b] of edgeLines) (importers.get(b) ?? importers.set(b, new Set()).get(b)).add(a);
const objects = new Map();
for (const r of rows) {
  const o = r.targetObject.replace(/`/g, '').trim() || '（空）';
  (objects.get(o) ?? objects.set(o, []).get(o)).push(r);
}
function slice(files) {
  const byG = new Map();
  for (const f of [...new Set(files)].sort()) (byG.get(groupOf(f)) ?? byG.set(groupOf(f), []).get(groupOf(f))).push(f);
  const groups = [];
  for (const g of [...byG.keys()].sort()) {
    const fs = byG.get(g);
    const mjs = fs.filter(f => f.endsWith('.mjs'));
    const nSeg = Math.max(1, Math.ceil(mjs.length / MAXFILES));
    // 非 .mjs 文件不占段容量，随其模块组第 1 段
    groups.push({ g, files: fs.length, mjs: mjs.length, segs: mjs.length === 0 ? 1 : nSeg });
  }
  return groups;
}
const objTable = [];
const objFiles = {}; // 对象 → ① 消费者文件（供 derive-systems.mjs 读）
for (const [o, rs] of [...objects].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const c1 = new Set();
  for (const r of rs) for (const x of r.res) if (x.path && /^(server-plugin|extension)\//.test(x.path)) c1.add(x.path);
  const c3 = new Set(c1);
  for (const f of c1) for (const i of importers.get(f) ?? []) c3.add(i);
  objFiles[o] = [...c1].sort();
  const g1 = slice([...c1]), g3 = slice([...c3]);
  objTable.push({
    o, rows: rs.length,
    f1: c1.size, groups1: g1.reduce((s, x) => s + x.segs, 0), mg1: g1.length,
    f3: c3.size, groups3: g3.reduce((s, x) => s + x.segs, 0), mg3: g3.length,
  });
}
const sum = k => objTable.reduce((s, x) => s + x[k], 0);
writeFileSync(`${OUT}/乙4-对象①文件.json`, JSON.stringify(objFiles, null, 1) + '\n');

// ---- H5：卷零 41 项 ----
const cov = readFileSync(`${CFG.dir}/${CFG.coverage.file}`, 'utf8').split(/\r?\n/);
const secStart = (p) => cov.findIndex(l => l.startsWith(p));
const aStart = secStart(CFG.coverage.tableA), eStart = secStart(CFG.coverage.existing);
const aRowText = new Map(); // A 条目编号 → 改前栏文字
{ let end = cov.findIndex((l, i) => i > aStart && /^## /.test(l)); if (end < 0) end = cov.length;
  for (let i = aStart; i < end; i++) { const l = cov[i]; if (!/^\|/.test(l)) continue; const c = cells(l); const m = (c[0] ?? '').match(/^(\d+\.\d+)\b/); if (m && c.length >= 6) aRowText.set(m[1], c[5]); } }
const items = [];
{ let end = cov.findIndex((l, i) => i > eStart && /^## /.test(l)); if (end < 0) end = cov.length;
  for (let i = eStart; i < end; i++) { const l = cov[i]; if (!/^\|/.test(l)) continue; const c = cells(l); const m = (c[0] ?? '').match(/^(\d+\.\d+)$/); if (!m) continue; items.push({ no: m[1], name: c[1], vol: c[2], text: c[3], a: [...(c[c.length - 1] ?? '').matchAll(/\d+\.\d+/g)].map(x => x[0]) }); } }
const rowsByPath = new Map();
rows.forEach((r, i) => { for (const x of r.res) if (x.path) (rowsByPath.get(x.path) ?? rowsByPath.set(x.path, new Set()).get(x.path)).add(i); });
const derive = items.map(it => {
  const texts = [it.text, ...it.a.map(a => aRowText.get(a) ?? '')];
  const files = new Set();
  for (const t of texts) for (const m of t.matchAll(FILE)) { const x = resolveFile(m[0]); if (x.path) files.add(x.path); }
  const hit = new Set();
  for (const f of files) for (const i of rowsByPath.get(f) ?? []) hit.add(i);
  const missingA = it.a.filter(a => !aRowText.has(a));
  return { ...it, files: files.size, rows: hit.size, vols: [...new Set([...hit].map(i => rows[i].volume))].sort(), missingA };
});
const derivable = derive.filter(d => d.rows > 0).length;

// ---- 写出 ----
const md1 = [
  '# 乙-4 H4 消费者组候选与锚点重叠（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/derive-groups.mjs；输入：脚本/卷十一/migrows-input.json（H1，' + rows.length + ' 行）、审查/脚本输出/乙4-import图-边表.tsv（H3，' + edgeLines.length + ' 条边）、审查/脚本输出/乙4-entryCallerFiles.json（H2，' + callers.count + ' 项）。只读、确定性，同一输入重跑逐字一致。',
  '',
  '## 一 锚点解析',
  '',
  `迁移行 ${rows.length} 行，共 ${nAnch} 个文件锚点：解析到仓库内唯一路径 ${nRes} 个，文件名有歧义（多个同名文件）${nAmb} 个，仓库里找不到（新文件名、通配、目录、已不存在）${nUnres} 个；没有文件锚点的行 ${noAnchorRows} 行（纯数据行、写在别栏的位置、或位置是说明文字）。解析规则：路径精确匹配 → 后缀匹配 → 裸文件名在全仓唯一 → 裸文件名在 server-plugin/extension 内唯一；其余记为歧义或找不到。`,
  '',
  '## 二 位置组（R11-2.4，锚点重叠）',
  '',
  '重叠口径：同一文件、行范围相交（没写行号的锚点按整文件）；文件名有歧义的锚点不作依据；一行有多个锚点时任一相交即相交。',
  '',
  `- 有可用文件锚点的行：${anchoredRows.length} 行（另 ${noAnchorRows} 行没有可用文件锚点，不在下面的位置组里；它们的位置组归属要靠卷零 zeroRow 或人工，待补）`,
  `- 相交的行对：${pairs.size} 对；落入多行位置组的行 ${rowsInMulti} 行，多行位置组 ${multi.length} 个`,
  `- **位置组总数（口径 A：整文件锚点与同文件一切锚点相交；有可用文件锚点的行并成的组）：${comp.size} 个**（其中单行组 ${comp.size - multi.length} 个）`,
  `- 口径 B（只有写了行号的锚点互相比行范围，整文件锚点只与整文件锚点相交）：相交的行对 ${PB.pairs.size} 对，多行位置组 ${PB.multi.length} 个，位置组总数 ${PB.comp.size} 个。A 与 B 的差就是被"整文件锚点"串起来的部分；规则 R11-2.4 字面读法是 A，B 供判断是否要把整文件锚点单列处理。`,
  `- 串得最多的文件（A 口径下相交对数，前 6）：${topGlue.map(([k, n]) => k + " " + n).join("；")}`,
  '',
  '多行位置组里最大的 10 个：',
  '',
  '| 行数 | 涉及的卷 | 代表文件 | 行编号（前 8） |', '|---:|---|---|---|',
  ...multi.slice(0, 10).map(c => {
    const rr = c.map(i => rows[i]);
    const fs = [...new Set(rr.flatMap(r => r.res.filter(x => x.path).map(x => x.path)))].sort();
    return `| ${c.length} | ${[...new Set(rr.map(r => r.volume))].sort().join('、')} | ${fs.slice(0, 2).join('、')} | ${rr.slice(0, 8).map(r => r.rowKey).join('、')} |`;
  }),
  '',
  '## 三 消费者组（R11-3.4）',
  '',
  `算法：对每个 targetObject，消费者文件取三类并集；本次只能算其中两种：① 该对象的迁移行的锚点文件（限 server-plugin、extension 下已解析到的文件）；③ import 了 ① 的文件（一跳 importer，作为“按 L-4 检查起点 import”的上界，不等于规则里按登记项 view 与 predicates 所在模块算的 ③）。② entryCallerFiles 需要“对象所属系统登记项”，而 state-owners.json 的 systems 登记表尚未落成数据（卷二 §2.7 只有两行示例），对象到登记项的对应现无输入，所以 ② 不能算，H2 采集结果（${callers.count} 项，按卷与入口名）留作那时的输入。文件按模块组（inputEdge、gate、outputGate、aiGate、textcore、host、clientTextcore、display；不在任何模块组的 server-plugin 文件属规则层）分开，组内每满 ${MAXFILES} 个 .mjs 切一段；非 .mjs 文件不占容量。`,
  '',
  `- targetObject 取值 ${objTable.length} 种（含“（空）” ${objects.has('（空）') ? objects.get('（空）').length + ' 行' : '无'}）。`,
  `- 只算 ① 的消费者组候选合计 ${sum('groups1')} 个（涉及模块组段 ${sum('mg1')} 个）；加一跳 importer 的上界合计 ${sum('groups3')} 个（${sum('mg3')} 个模块组段）。这是对象 × 模块组 × 段的个数，不是卡数：卡数要等 ② 与卡种（R11-3.2）、阶段（R11-7）定后由卡账生成器给出。`,
  '',
  '| targetObject | 迁移行 | ① 文件数 | ① 消费者组 | ①+一跳 importer 文件数 | ①+一跳 消费者组 |', '|---|---:|---:|---:|---:|---:|',
  ...objTable.map(x => `| ${x.o} | ${x.rows} | ${x.f1} | ${x.groups1} | ${x.f3} | ${x.groups3} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/乙4-消费者组与位置组.md`, md1);

const md2 = [
  '# 乙-4 H5 卷零 41 项对应的卡（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/derive-groups.mjs。卷零 §4 的 41 项各带 aRows（对应的 A 表条目编号，C11-1 已落）。',
  '- 派生口径：41 项 → 它的 A 表条目 → 这些 A 行的“改前”栏与 §4 的“① 代码核查”栏里写出的文件 → 在 H1 迁移行里按解析到的锚点文件找相交行。迁移行自己没有 zeroRow（卷零机读导出的 spotKey 与迁移行之间没有现成的对应列），所以只能按文件对上，是下界。',
  `- 结果：41 项里 ${derivable} 项能对到至少一条迁移行；${items.length - derivable} 项对不上。项数核对：卷零 §4 表读到 ${items.length} 项。`,
  '',
  '| 10 # | 系统 | 卷 § | aRows | 文件数 | 对上的迁移行 | 涉及卷 | 缺什么 |', '|---|---|---|---|---:|---:|---|---|',
  ...derive.map(d => `| ${d.no} | ${d.name.slice(0, 24)} | ${d.vol.slice(0, 18)} | ${d.a.join('、')} | ${d.files} | ${d.rows} | ${d.vols.join('、') || '—'} | ${d.rows > 0 ? '—' : d.files === 0 ? '① 栏与 A 行改前栏都没有可解析到仓库文件的文件名（核查栏写模块名或“四类 grep 为 0”）' : '写出的文件在迁移行锚点里没有出现（该项的迁移行在别的文件或还没写）'}${d.missingA.length ? '；A 行 ' + d.missingA.join('、') + ' 读不到' : ''} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/乙4-卷零41项派生.md`, md2);
console.log(`锚点 ${nAnch}（唯一 ${nRes}/歧义 ${nAmb}/找不到 ${nUnres}），无文件锚点行 ${noAnchorRows}`);
console.log(`位置组 ${comp.size}（多行组 ${multi.length}，相交对 ${pairs.size}，落入多行组的行 ${rowsInMulti}）`);
console.log(`对象 ${objTable.length} 种；①消费者组 ${sum('groups1')}，①+一跳 ${sum('groups3')}`);
console.log(`41 项：读到 ${items.length}，能派生 ${derivable}`);
