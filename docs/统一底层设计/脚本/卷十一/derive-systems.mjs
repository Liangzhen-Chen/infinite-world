// 乙-4 补 J1–J3：用乙-4 的采集结果补全卷二 §2.7 的 systems 表（每行带来源，推不出的标待补），并按卷十一 R11-3.4 重算第 ② 类消费者。
// 输入（都是乙-4 的只读采集输出，不再读被采集代码）：审查/脚本输出/乙4-entryCallerFiles.json（H2）、乙4-import图-边表.tsv（H3）、
//   乙4-对象①文件.json（derive-groups.mjs 生成）、脚本/卷十一/migrows-input.json（H1）；以及卷零 §1 的卷序号表与卷二各表节的 owner 行（表主）。
// 只读、确定性、不联网；不执行被采集代码。用法：node derive-systems.mjs
// 输出：审查/脚本输出/乙4补-systems补全.json、乙4补-systems表.md（贴进卷二 §2.7 的表）、乙4补-消费者组②重算.md
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const MAXFILES = 25;
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const VOL = new RegExp(CFG.volCode);

const h2 = JSON.parse(readFileSync(`${OUT}/乙4-entryCallerFiles.json`, 'utf8'));
const objFiles = JSON.parse(readFileSync(`${OUT}/乙4-对象①文件.json`, 'utf8'));
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const edges = readFileSync(`${OUT}/乙4-import图-边表.tsv`, 'utf8').split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const importers = new Map();
for (const [a, b] of edges) (importers.get(b) ?? importers.set(b, new Set()).get(b)).add(a);

// ---- 表主：卷零 §1 的 # → 卷；卷二各表节 `owner` 行写 #（与卷十一生成器同口径）----
const cov = readFileSync(`${CFG.dir}/${CFG.coverage.file}`, 'utf8').split(/\r?\n/);
const seqVol = new Map();
{ const s = cov.findIndex(l => l.startsWith(CFG.coverage.addVol)); let e = cov.findIndex((l, i) => i > s && /^## /.test(l)); if (e < 0) e = cov.length;
  let head = null;
  for (let i = s + 1; i < e; i++) {
    const l = cov[i];
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l);
    if (!head) { head = c.map(x => x.replace(/`/g, '')); continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const qi = head.indexOf(CFG.fields.seq), vi = head.indexOf(CFG.fields.volCol);
    if (qi < 0 || vi < 0) continue;
    const m = (c[vi] ?? '').match(VOL);
    if (/^\d+$/.test(c[qi]) && m) seqVol.set(+c[qi], m[0]);
  } }
const reg = readFileSync(`${CFG.dir}/${CFG.registry.file}`, 'utf8').split(/\r?\n/);
const tableOwner = new Map();
{ let cur = null;
  for (const l of reg) {
    if (/^#+ /.test(l)) { cur = null; if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) { cur = m[1]; tableOwner.set(cur, null); } } continue; }
    if (cur && l.startsWith('- `' + CFG.fields.owner + '`')) { const m = l.match(/\d+/); if (m) tableOwner.set(cur, seqVol.get(+m[0]) ?? null); }
  } }
const ownedBy = v => [...tableOwner].filter(([, o]) => o === v).map(([t]) => t).sort();

// ---- J1：systems 补全表。系统 = 一个领域卷的 §3.1 读入口集合 ----
const byVol = new Map();
for (const e of h2.entries) (byVol.get(e.volume) ?? byVol.set(e.volume, []).get(e.volume)).push(e);
const systems = [];
for (const [v, es] of [...byVol].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const first = es[0].entry; // 系统键暂取该卷 §3.1 首个读入口名（命名待李白定，见本卡汇报）
  const withDef = es.filter(e => e.defFiles.length);
  const callerEntries = es.filter(e => e.callerFiles.length);
  const callerUnion = [...new Set(es.flatMap(e => e.callerFiles))].sort();
  const defUnion = [...new Set(es.flatMap(e => e.defFiles))].sort();
  const tables = ownedBy(v);
  const first1 = es[0].defFiles.length ? es[0] : null; // view 只取系统键对应的那个入口；别的入口的同名旧定义只记在来源栏
  systems.push({
    system: first, volume: v,
    entries: es.map(e => e.entry),
    view: first1 ? `${first1.defFiles[0].replace(/^server-plugin\//, '')}#${first1.entry}` : '待补',
    tables,
    entryCallerFiles: Object.fromEntries(callerEntries.map(e => [e.entry, e.callerFiles])),
    defFiles: defUnion,
    callerUnion,
    pending: ['predicates', 'writers', 'sources', 'sinks', 'entryJudges', 'phase', ...(first1 ? [] : ['view'])],
    source: `${v} §3.1 读入口 ${es.length} 项（H2：脚本/卷十一/collect-entry-callers.mjs）；旧代码里有同名定义的入口 ${withDef.length} 项（只按名字对，可能是同名的别的函数）${defUnion.length ? '（' + defUnion.slice(0, 3).join('、') + (defUnion.length > 3 ? '等' : '') + '）' : ''}；有调用文件的入口 ${callerEntries.length} 项、调用文件 ${callerUnion.length} 个；tables 取卷二各表节 owner 行 ${tables.length} 张`,
  });
}
writeFileSync(`${OUT}/乙4补-systems补全.json`, JSON.stringify({ _说明: '卷二 §2.7 systems 补全（乙-4 补 J1）；脚本生成，勿手改。pending 列出推不出、不猜的字段。', count: systems.length, systems }, null, 1) + '\n');

const mdRows = systems.map(s => `| ${s.system} | ${s.volume} | ${s.view} | ${s.tables.length ? s.tables.join('、') : '待补'} | ${Object.keys(s.entryCallerFiles).length} 项入口、${s.callerUnion.length} 个文件 | ${s.source} | ${s.pending.join('、')} |`);
writeFileSync(`${OUT}/乙4补-systems表.md`, [
  '| 系统键 | 归属卷 | view（文件#入口） | tables | entryCallerFiles（有调用文件的入口数、文件数） | 来源 | 待补字段 |',
  '|---|---|---|---|---|---|---|',
  ...mdRows, '',
].join('\n'));

// ---- J3：重算 R11-3.4 ②（及 ③ 的可算部分）----
const groupOf = p => {
  if (p.startsWith('server-plugin/input/')) return 'inputEdge';
  if (p.startsWith('server-plugin/gate/')) return 'gate';
  if (p.startsWith('server-plugin/output-gate/')) return 'outputGate';
  if (p.startsWith('server-plugin/ai-gate/')) return 'aiGate';
  if (p.startsWith('server-plugin/textcore/')) return 'textcore';
  if (p.startsWith('extension/host/')) return 'host';
  if (p.startsWith('extension/textcore/')) return 'clientTextcore';
  if (p.startsWith('extension/')) return 'display';
  if (p.startsWith('server-plugin/')) return 'rules层';
  return p.split('/')[0];
};
const groupsOf = files => {
  const byG = new Map();
  for (const f of [...new Set(files)].sort()) (byG.get(groupOf(f)) ?? byG.set(groupOf(f), []).get(groupOf(f))).push(f);
  let n = 0;
  for (const [, fs] of byG) { const m = fs.filter(f => f.endsWith('.mjs')).length; n += m === 0 ? 1 : Math.ceil(m / MAXFILES); }
  return n;
};
const runtime = f => /^(server-plugin|extension)\//.test(f);
const objects = [...new Set(mig.rows.map(r => r.targetObject.replace(/`/g, '').trim() || '（空）'))].sort();
const res = [];
for (const o of objects) {
  const c1 = (objFiles[o] ?? []).filter(runtime);
  const sys = systems.filter(s => s.tables.includes(o));
  const c2 = [...new Set(sys.flatMap(s => s.callerUnion))].filter(runtime);
  const c3 = new Set();
  for (const s of sys) for (const d of s.defFiles) for (const i of importers.get(d) ?? []) if (runtime(i)) c3.add(i);
  const all1 = [...new Set([...c1])], all12 = [...new Set([...c1, ...c2])], all123 = [...new Set([...c1, ...c2, ...c3])];
  res.push({ o, sys: sys.map(s => s.system), c1: all1.length, c2: c2.length, c3: c3.size, g1: groupsOf(all1), g12: groupsOf(all12), g123: groupsOf(all123), c2new: c2.filter(f => !all1.includes(f)).length });
}
const sum = k => res.reduce((s, x) => s + x[k], 0);
const withSys = res.filter(r => r.sys.length);
const md = [
  '# 乙-4 补 J3：R11-3.4 第 ② 类消费者重算（脚本生成，勿手改）',
  '',
  '- 生成脚本：脚本/卷十一/derive-systems.mjs；输入：审查/脚本输出/乙4补-systems补全.json（本脚本生成，J1）、乙4-对象①文件.json（H4 的 ①）、乙4-import图-边表.tsv（H3）。只读、确定性，同一输入重跑逐字一致。',
  '',
  '## 算式',
  '',
  '对每个 targetObject O：',
  '',
  '- ①(O) = O 的迁移行的锚点文件中，解析到 server-plugin 与 extension 下的文件（H4）。',
  '- ②(O) = ⋃ over 系统 s（O 属于 s.tables）⋃ over 入口 e（e 属于 s 的读入口）：callerFiles(e)。callerFiles 是 H2 的静态 grep 结果（调用该入口名、且不是定义文件的文件）；O 属于 s.tables 取卷二各表节 owner 行：表代号 O 的表主卷即系统所属卷。O 不是某张表的表代号（如 rules、kernel、各模块组键）时没有 s，② 为空集。',
  '- ③(O) 的可算部分 = ⋃ over s：s 的旧代码定义文件（读入口在旧代码里有同名定义的那些文件）的一跳 importer（H3）。本设计新立的读入口在旧代码里没有定义文件，③ 对它没有输入。',
  '- 消费者文件 = ① ∪ ② ∪ ③；按模块组分开（inputEdge、gate、outputGate、aiGate、textcore、host、clientTextcore、display，余下的 server-plugin 文件属规则层）；每组内按路径升序，每满 ' + MAXFILES + ' 个 .mjs 切一段；非 .mjs 文件不占容量。',
  '',
  '## 结果',
  '',
  `- systems 补全 ${systems.length} 个系统（见 乙4补-systems补全.json），共 ${systems.reduce((s, x) => s + x.entries.length, 0)} 个读入口；其中至少对应一张表的系统 ${systems.filter(s => s.tables.length).length} 个。`,
  `- targetObject ${res.length} 种，其中是某个系统的 tables 之一的 ${withSys.length} 种（其余是 rules、kernel 等非表对象，② 恒为空）。`,
  `- 只算 ① 的消费者组候选 ${sum('g1')} 个；加 ② 后 ${sum('g12')} 个；再加 ③ 的可算部分后 ${sum('g123')} 个。`,
  `- 有 ② 文件的对象 ${res.filter(r => r.c2 > 0).length} 种；② 文件里不在 ① 中的（新增消费者）合计 ${sum('c2new')} 个（按对象累计，同一文件可重复计入不同对象）。`,
  '- 解读：② 的输入来自旧代码里已有同名定义的读入口（H2：' + h2.entries.filter(e => e.defFiles.length).length + ' 项），新设计的读入口在旧代码里没有调用方，② 对它们是空集；所以这里的 ② 是下界，等新读入口落成后随 H2 重采而增加。',
  '',
  '| targetObject | 对应系统 | ① 文件 | ② 文件 | ② 中不在 ① 的 | ③ 可算文件 | ① 组 | ①∪② 组 | ①∪②∪③ 组 |', '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ...res.map(r => `| ${r.o} | ${r.sys.join('、') || '—'} | ${r.c1} | ${r.c2} | ${r.c2new} | ${r.c3} | ${r.g1} | ${r.g12} | ${r.g123} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/乙4补-消费者组②重算.md`, md);
console.log(`systems ${systems.length}，读入口 ${systems.reduce((s, x) => s + x.entries.length, 0)}，有 tables 的系统 ${systems.filter(s => s.tables.length).length}`);
console.log(`对象 ${res.length}，有系统的 ${withSys.length}；组 ①${sum('g1')} ①∪②${sum('g12')} ①∪②∪③${sum('g123')}；有②文件的对象 ${res.filter(r => r.c2 > 0).length}`);
