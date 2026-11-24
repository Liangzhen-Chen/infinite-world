// 乙-6b（李白 11-15 18:50 第 1 条）：扫全书各卷，列出所有编号写法（形状 × 定义位置 × 所在结构性质），写成编号写法清单。
// 识别规则见 id-defs.mjs 文件头；本脚本只统计，不改卷文。只读、确定性。用法：node scan-id-forms.mjs
// 输出：审查/脚本输出/乙6b-编号写法清单.md
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanVolume, shapeOf, TOK, RECORD_RE, ACCEPT_RE, RULE_RE } from './id-defs.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`;
const files = readdirSync(CFG.dir).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const volOf = f => (f.match(new RegExp(CFG.volCode)) ?? [])[0];
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const defs = []; const refs = new Map(); // 形状 → 引用次数（含定义）
const refRe = new RegExp('(?<![A-Za-z0-9_])(' + TOK + ')(?![0-9A-Za-z])', 'g');
for (const f of files) {
  const ls = readFileSync(`${CFG.dir}/${f}`, 'utf8').split(/\r?\n/);
  for (const d of scanVolume(ls, volOf(f))) defs.push({ ...d, file: f, vol: volOf(f) });
  for (const l of ls) for (const m of l.matchAll(refRe)) { const s = shapeOf(m[1]); refs.set(s, (refs.get(s) ?? 0) + 1); }
}
// 写法种类 = 形状 × 定义位置（how 去掉具体前缀词，前缀词另列）
const howKind = d => (d.prefix ? '列表项（带“X：”前缀）' : d.how);
const groups = new Map();
for (const d of defs) {
  const k = `${shapeOf(d.tok)}\u0000${howKind(d)}`;
  const g = groups.get(k) ?? groups.set(k, { shape: shapeOf(d.tok), how: howKind(d), n: 0, vols: new Set(), nat: {}, prefixes: new Set(), ex: null }).get(k);
  g.n++; g.vols.add(d.vol); g.nat[d.nature] = (g.nat[d.nature] ?? 0) + 1; if (d.prefix) g.prefixes.add(d.prefix); g.ex ??= `${d.file}:${d.line} ${d.tok}`;
}
const gl = [...groups.values()].sort((a, b) => b.n - a.n || cmp(a.shape, b.shape) || cmp(a.how, b.how));
const natOrder = ['验收类', '规则类', '记录类', '其他类'];
const byVol = new Map();
for (const d of defs) { const m = byVol.get(d.vol) ?? byVol.set(d.vol, Object.fromEntries(natOrder.map(n => [n, 0]))).get(d.vol); m[d.nature]++; }
const shapesAccept = new Map();
for (const d of defs.filter(d => d.nature === '验收类')) { const s = shapeOf(d.tok); shapesAccept.set(s, (shapesAccept.get(s) ?? 0) + 1); }
const recEx = defs.filter(d => d.nature === '记录类').slice(0, 1)[0];

const md = [
  '# 乙-6b 编号写法清单（脚本 脚本/卷十一/scan-id-forms.mjs 生成，勿手改）',
  '',
  `扫描范围：${files.length} 个卷文件（${CFG.dir} 下 ${CFG.volFile}）。共认出 ${defs.length} 个定义位上的编号、${gl.length} 种写法（形状 × 定义位置）、${new Set(gl.map(g => g.shape)).size} 种形状；全文引用（含定义）共 ${[...refs.values()].reduce((a, b) => a + b, 0)} 处、${refs.size} 种形状。`,
  '',
  '## 一 通用识别规则（脚本/卷十一/id-defs.mjs，整类判，不按编号名或卷名）',
  '',
  '1. 编号写法：大写字母 1–4 个（可含小写）＋可选卷序号＋可选小写分卷字母＋“-”＋数字（可带小写尾字母、“.数字”分级、末尾“.大写字母”或“-大写字母”后缀，如 A26-9.S、VA-4.1-S），或没有连字符的“大写字母＋数字”短写法（卷一 I15、卷二 A1）。短写法只在定义位认，正文里只取已有定义的。',
  '2. 定义位：编号在一行的开头位才算定义——表格行首格开头；列表项开头，允许不超过 8 字的前缀，以“：”或加粗收尾结束（如“扫描式：A17-1.3”“**扫描式** VA-4.1-S”）；段落开头须加粗。行中间出现的是引用。编号里写了卷序号而不是本卷的（卷六表格首格里的 A19-15.2），是对别卷编号的引用，不算本卷定义。',
  `3. 性质按所在结构判（不看编号名）：所在表格首列列名匹配 \`${RECORD_RE.source}\` 的是**记录类**（意见号、修订与影响面记录号，如卷五“附 第二版影响面表”首列“问题”下的 A-5）；否则从定义行最近的一级标题往上，第一个命中的标题定性质：匹配同一记录类词的是**记录类**，匹配 \`${ACCEPT_RE.source}\` 的是**验收类**（断言号、扫描条代号、不变量号），匹配 \`${RULE_RE.source}\` 的是**规则类**；都不匹配是**其他类**（迁移行号、配合项号、退役项号等）。`,
  '4. 卡的 accept 只取验收类（卷十一 §2.2 :177 的取值范围“断言编号、扫描条代号、不变量编号、齐全率下限键”，R11-3.8 :473）；规则类、记录类、其他类的编号不进 accept。卷序号为空的编号只在本卷有效，写成“卷名:编号”。',
  '',
  '## 二 写法种类（按定义位个数降序）',
  '',
  '| # | 形状 | 定义位置 | 个数 | 卷数 | 性质分布 | 前缀词 | 例（文件:行 编号） |', '|---:|---|---|---:|---:|---|---|---|',
  ...gl.map((g, i) => `| ${i + 1} | ${g.shape} | ${g.how} | ${g.n} | ${g.vols.size} | ${natOrder.filter(n => g.nat[n]).map(n => `${n} ${g.nat[n]}`).join('，')} | ${[...g.prefixes].sort().join('、') || '—'} | ${g.ex} |`),
  '',
  '## 三 验收类编号的形状',
  '',
  [...shapesAccept].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([s, n]) => `${s} ${n}`).join('；') + '。',
  '',
  '## 四 各卷定义位编号按性质计数',
  '',
  '| 卷 | ' + natOrder.join(' | ') + ' |', '|---|' + natOrder.map(() => '---:').join('|') + '|',
  ...files.map(volOf).filter((v, i, a) => v && a.indexOf(v) === i).map(v => `| ${v} | ${natOrder.map(n => byVol.get(v)?.[n] ?? 0).join(' | ')} |`),
  '',
  `记录类例：${recEx ? `${recEx.file}:${recEx.line} ${recEx.tok}（${recEx.head}）` : '无'}。`,
  '',
];
writeFileSync(`${OUT}/乙6b-编号写法清单.md`, md.join('\n'));
console.log(`定义位编号 ${defs.length}；写法 ${gl.length} 种；形状 ${new Set(gl.map(g => g.shape)).size} 种；验收类 ${defs.filter(d => d.nature === '验收类').length}`);
