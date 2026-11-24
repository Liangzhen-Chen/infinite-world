// 卷二封卷勘误 C29-3 白名单核对（11-14）。只读 .md，不读项目代码。
// 用法：node check-c29-3-fs.mjs [卷二路径]
// 查：① 服务端矩阵 outputGate 行末列只有 node:fs、仅 display-load、只读；② 全局对象白名单 outputGate 行与矩阵末列一致；
//     ③ "outputGate 只读白名单"一段：只许读函数、可读路径全在白名单内、写明不读存档/state；④ 入口表 display-load 行来源全在白名单内；
//     ⑤ 无写权限：凡同时提到 output-gate 文件与 node:fs 的行不得出现写/追加；⑥ 规则层矩阵与白名单行 node 列为"无"，
//     入口表里读 world/i18n/ 的只有 textcore、gate、outputGate 三组；唯一例外 kernel/load/display-langs.mjs 只读 locales.json（李白 11-14 11:30 DisplayLang 甲）。
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md';
const lines = readFileSync(path, 'utf8').split('\n');
let fail = 0;
const log = (s) => console.log(s);
const ok = (s) => log('  OK ' + s);
const bad = (s) => { fail++; log('  FAIL ' + s); };
const cells = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
const ticks = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

const WHITELIST = ['world/i18n/locales.json', 'world/i18n/gram.<', 'packs/<ns>/i18n/gram.<', 'world/display/'];
const inWhitelist = (p) => WHITELIST.some((w) => p.startsWith(w));
const LOADER = 'output-gate/display-load.mjs';

// ① 服务端矩阵
log('== 1 服务端矩阵 outputGate 行');
const mHead = lines.findIndex((l) => l.startsWith('| 调用方 ＼ 被调用方 | kernel | 规则层 |'));
const mRows = [];
for (let i = mHead + 2; i < lines.length && lines[i].startsWith('|'); i++) mRows.push(cells(lines[i]));
const mOut = mRows.find((r) => r[0] === 'outputGate');
const mRule = mRows.find((r) => r[0] === '规则层');
if (!mOut) bad('矩阵无 outputGate 行');
const mOutLast = mOut ? mOut[mOut.length - 1] : '';
const nodeMods = [...mOutLast.matchAll(/node:[a-z_]+/g)].map((m) => m[0]);
if (nodeMods.length === 1 && nodeMods[0] === 'node:fs') ok('末列只有 node:fs'); else bad('末列 node 模块为 ' + JSON.stringify(nodeMods));
if (/npm|ajv/.test(mOutLast)) bad('末列出现 npm 包'); else ok('末列无 npm 包');
if (mOutLast.includes('仅 `' + LOADER + '`') && mOutLast.includes('只读')) ok('限 display-load、写明只读'); else bad('末列未限到 display-load 或未写只读：' + mOutLast);

// ② 全局对象白名单
log('== 2 全局对象白名单 outputGate 行');
const wHead = lines.findIndex((l) => l.startsWith('| 组 | 进程 | 可用宿主全局 |'));
const wRows = [];
for (let i = wHead + 2; i < lines.length && lines[i].startsWith('|'); i++) wRows.push(cells(lines[i]));
const wOut = wRows.find((r) => r[0] === 'outputGate');
const wRule = wRows.find((r) => r[0] === '规则层');
if (!wOut) bad('白名单无 outputGate 行');
else {
  if (wOut[3] === mOutLast) ok('node 列与矩阵末列逐字相同'); else bad('node 列与矩阵末列不同：' + wOut[3]);
  if (wOut[2].startsWith('无')) ok('宿主全局仍为"无"（不联网）'); else bad('宿主全局非"无"：' + wOut[2]);
  if (wOut[4] === '`' + LOADER + '`') ok('只在 display-load 内可用'); else bad('限定文件列：' + wOut[4]);
}

// ③ 只读白名单一段
log('== 3 outputGate 只读白名单定义');
const pIdx = lines.findIndex((l) => l.includes('**outputGate 只读白名单（唯一定义）**'));
if (pIdx < 0) bad('找不到定义段');
else {
  const para = [lines[pIdx]];
  for (let i = pIdx + 1; i < lines.length && /^ {2}/.test(lines[i]); i++) para.push(lines[i]);
  const head = para[0];
  const fns = ticks(head).filter((t) => /Sync$|^(read|write|append|unlink|rm|mkdir|rename|chmod|watch|create)/.test(t));
  if (fns.length && fns.every((f) => f === 'readFileSync' || f === 'readdirSync')) ok('许可函数只有 ' + fns.join('、')); else bad('许可函数：' + JSON.stringify(fns));
  const items = para.filter((l) => /^ {2}\d+\. /.test(l));
  if (items.length === 3) ok('白名单三项'); else bad('白名单项数 ' + items.length);
  const paths = [];
  for (const it of items) {
    const ps = ticks(it).filter((t) => t.includes('/') || t.endsWith('.json'));
    const dir = ps.find((t) => t.endsWith('/'));
    for (const p of ps) paths.push(p.endsWith('/') || !dir ? p : dir + p);
  }
  const outside = paths.filter((p) => !inWhitelist(p) && !['world/i18n/', 'packs/<ns>/i18n/'].includes(p));
  if (outside.length === 0) ok('可读路径 ' + paths.length + ' 个全在白名单内'); else bad('白名单外路径：' + JSON.stringify(outside));
  const tail = para.slice(1 + items.length).join('\n');
  for (const must of ['存档', 'state', '不写文件', '不联网', '规则层照旧不读语言包']) {
    if (tail.includes(must)) ok('写明"' + must + '"'); else bad('缺"' + must + '"');
  }
}

// ④ 入口表 display-load 行
log('== 4 登记边界入口表 display-load 行');
const eRow = lines.find((l) => l.startsWith('| `' + LOADER + '`'));
if (!eRow) bad('入口表无 display-load 行');
else {
  const c = cells(eRow);
  if (c[1] === 'outputGate') ok('所属组 outputGate'); else bad('所属组 ' + c[1]);
  const src = ticks(c[2]).filter((t) => t.includes('/'));
  const out = src.filter((p) => !inWhitelist(p));
  if (src.length && out.length === 0) ok('来源 ' + src.length + ' 个路径全在白名单内'); else bad('来源越出白名单：' + JSON.stringify(out));
  if (/不产出 `Text`/.test(c[3])) ok('不产出 Text'); else bad('产出列未写不产出 Text');
}

// ⑤ 无写权限
log('== 5 outputGate 无写权限');
const writeHits = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /output-gate\/[a-z-]+\.mjs/.test(l) && l.includes('node:fs') && /追加写|写文件|`node:fs` 写/.test(l));
if (writeHits.length === 0) ok('无 output-gate 文件获 node:fs 写'); else for (const [n] of writeHits) bad('行 ' + n + ' 疑似给 output-gate 写权限');
const exitRow = lines.find((l) => l.startsWith('| `output-gate/') && l.includes('node:fs'));
if (exitRow && !exitRow.startsWith('| `' + LOADER + '`')) bad('其他 output-gate 文件提到 node:fs：' + exitRow.slice(0, 80)); else ok('只有 display-load 行提到 node:fs');

// ⑥ 规则层不读语言包
log('== 6 规则层无语言包读取');
if (mRule && mRule[mRule.length - 1] === '无') ok('矩阵规则层 node 列为"无"'); else bad('矩阵规则层末列：' + (mRule && mRule[mRule.length - 1]));
if (wRule && wRule[3] === '无') ok('白名单规则层 node 列为"无"'); else bad('白名单规则层 node 列：' + (wRule && wRule[3]));
const eHead = lines.findIndex((l) => l.startsWith('| 入口 | 所属组 | 来源 |'));
const allowedGroups = ['textcore', 'gate', 'outputGate'];
// 唯一例外（李白 11-14 11:30 DisplayLang 方案甲，卷二提交 655c7975）：kernel 组仅 kernel/load/display-langs.mjs
// 可只读 world/i18n/locales.json 一个文件（只取语言代号建名单）。其他 kernel 文件、其他 i18n 文件、带写的行一律不许。
const KERNEL_LANGS = { file: 'kernel/load/display-langs.mjs', src: 'world/i18n/locales.json' };
let i18nReaders = 0;
for (let i = eHead + 2; i < lines.length && lines[i].startsWith('|'); i++) {
  const c = cells(lines[i]);
  if (!c[2].includes('world/i18n/') && !c[2].includes('/i18n/')) continue;
  i18nReaders++;
  const g = c[1].split(/[（(]/)[0].trim();
  const file = ticks(c[0])[0];
  if (allowedGroups.includes(g)) { ok('读语言包的入口 ' + file + ' 属 ' + g); continue; }
  if (g === 'kernel' && file === KERNEL_LANGS.file) {
    const srcPaths = ticks(c[2]).filter((t) => t.includes('/') || t.endsWith('.json'));
    const onlyLocales = srcPaths.length === 1 && srcPaths[0] === KERNEL_LANGS.src;
    const noWrite = !/写/.test(lines[i]);
    const noText = /不产出 `Text`/.test(c[3]);
    if (onlyLocales && noWrite && noText) ok('kernel 例外：' + file + ' 只读 ' + KERNEL_LANGS.src + '、无写、不产出 Text');
    else bad('kernel 例外越界：' + file + ' 来源 ' + JSON.stringify(srcPaths) + (noWrite ? '' : '，行内有"写"') + (noText ? '' : '，未写不产出 Text'));
    continue;
  }
  bad('非许可组读语言包：' + c[0] + ' / ' + g);
}
if (i18nReaders === 0) bad('入口表没有读语言包的行，表结构可能变了');

log('== 结果：' + (fail ? 'FAIL ' + fail : 'PASS'));
process.exitCode = fail ? 1 : 0;
