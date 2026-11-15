// 卷二第六版自动对账扩展（第 5–8 项）。只读 .md；用法：node check-vol2-ext.mjs <卷二路径>
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md';
const md = readFileSync(path, 'utf8');
const lines = md.split('\n');
let fail = 0; const log = s => console.log(s); const bad = s => { fail++; log('  FAIL ' + s); };
const sec = (startRe, endRe) => { const a = lines.findIndex(l => startRe.test(l)); const b = lines.findIndex((l, i) => i > a && endRe.test(l)); return lines.slice(a, b < 0 ? undefined : b); };

// ---------- 5. 族名登记 ----------
log('== 5 族名登记');
const s19 = sec(/^### 1\.9/, /^### 1\.10/).join('\n');
const families = new Set([...s19.matchAll(/([a-z_]+)→`[a-z]+_`/g)].map(m => m[1]));
const closedLine = s19.match(/\*\*代码内封闭枚举\*\*[^\n]*/)?.[0] ?? '';
const closedEnums = new Set([...closedLine.matchAll(/`([a-z_]+)`（/g)].map(m => m[1]));
for (const c of ['required', 'onUnknown', 'error_code', 'type', 'selection']) closedEnums.add(c);
const usedFamilies = new Set();
for (const m of md.matchAll(/(?:enum|ref vocab|vocab:|"vocab":")\s*([a-z_]+)/g)) usedFamilies.add(m[1]);
const skip = new Set(['vocab', 'kind', 'kinds', 'dim', 'effect', 'json']);
const missing = [...usedFamilies].filter(f => !families.has(f) && !closedEnums.has(f) && !skip.has(f)).sort();
log(`  登记族 ${families.size}，代码内封闭枚举 ${closedEnums.size}，正文用到的族名 ${usedFamilies.size}`);
if (missing.length) bad('族名未登记: ' + missing.join(', ')); else log('  OK 全部族名已登记');

// ---------- 6. 枚举值前缀：开放族值带前缀；封闭枚举值不带 ----------
log('== 6 枚举值前缀');
const prefixOf = Object.fromEntries([...s19.matchAll(/([a-z_]+)→`([a-z]+_)`/g)].map(m => [m[1], m[2]]));
const closedValues = { stage: ['add','mul','max','min','set','post'], scope: ['self','holder','located','members','believers','jurisdiction','target','global'], eff_output: ['modifier','status','primitive','event','spawn'], consent_mode: ['none','target','holder','authority'], status_target: ['body','mind','place','org','faith'], onUnknown: ['skip','gap','error'] };
const jsonBlocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]);
const fieldFamily = { family: null, stage: 'stage', scope: 'scope', kind: 'eff_output', mode: 'consent_mode', target: null, onUnknown: 'onUnknown' };
const KINDS = new Set(['item','material','species','plant','body_plan','person','place','facility_type','recipe','org','office','polity','law_code','deity','faith','culture','profession','skill','knowledge','offense','status','event_type','effect']);
const NONCODE = new Set(['fuel_use','personality_default','status_tick']);
let mixed = 0;
for (const b of jsonBlocks) {
  for (const m of b.matchAll(/"(stage|scope|kind|mode|onUnknown)"\s*:\s*"([a-z_]+)"/g)) {
    const fam = fieldFamily[m[1]]; if (!fam) continue;
    if (m[1] === 'kind' && KINDS.has(m[2])) continue; // 表头 kind / ref kind 名
    if (!closedValues[fam].includes(m[2])) { mixed++; bad(`封闭枚举 ${fam} 出现值 "${m[2]}"（应为不带前缀的 ${closedValues[fam].join('/')}）`); }
  }
  for (const m of b.matchAll(/"family"\s*:\s*"([a-z_]+)"/g)) { if (!/^(sfam_|eff_)/.test(m[1])) { mixed++; bad(`family 值 "${m[1]}" 不带族前缀`); } }
}
// 开放族值：形如 <prefix><name>，prefix 必须属于某族
const prefixes = new Set(Object.values(prefixOf));
for (const b of jsonBlocks) for (const m of b.matchAll(/"([a-z]+_[a-z0-9_]+)"/g)) {
  const p = m[1].match(/^[a-z]+_/)[0];
  if (KINDS.has(m[1]) || NONCODE.has(m[1]) || /^(kg|m|mj|copper|satiety|per)_/.test(m[1])) continue; // 实体类名、行为代号、单位
  if (!prefixes.has(p) && !['item_','mat_','fac_','bld_','npc_','eff_','mod_','status_','faith_','deity_','body_','recipe_','species_','culture_'].includes(p)) { mixed++; bad(`JSON 示例中 "${m[1]}" 的前缀 ${p} 未登记`); }
}
if (!mixed) log('  OK 示例中开放族值均带前缀、封闭枚举值均不带前缀');

// ---------- 7. 附录 A：组件 requires/table 与引用解析 ----------
log('== 7 附录 A 组件与引用解析');
const apA = lines.findIndex(l => l.startsWith('## 附录 A'));
const blocksA = []; for (let i = apA, inB = false, buf = []; i < lines.length && blocksA.length < 3; i++) { if (lines[i].startsWith('```json')) { inB = true; buf = []; continue; } if (lines[i].startsWith('```') && inB) { inB = false; blocksA.push(buf.join('\n')); continue; } if (inB) buf.push(lines[i]); }
const fx = JSON.parse(blocksA[0]), vocab = JSON.parse(blocksA[1]), effects = JSON.parse(blocksA[2]);
const dims = Object.keys(fx.dimensions);
for (const [id, e] of Object.entries(vocab.families.class.entries)) if (id.startsWith('comp_')) bad(`${id} 仍在 class 族（应在 component 族）`);
for (const [id, e] of Object.entries(vocab.families.component?.entries ?? {})) {
  if (!id.startsWith('comp_')) { bad(`${id} 前缀不是 comp_`); continue; }
  if (!e.table) { bad(`${id} 缺 table`); continue; }
  if (e.table === fx.kind) { for (const r of e.requires ?? []) if (!dims.includes(r)) bad(`${id}.requires ${r} 不是 ${fx.kind} 的维度`); for (const b of e.enables ?? []) if (!fx.behaviors.includes(b)) bad(`${id}.enables ${b} 不在 behaviors`); }
  const usedBy = Object.entries(fx.rows).filter(([, r]) => (r.classes ?? []).includes(id)).map(([k]) => k);
  if (usedBy.length && e.table !== fx.kind) bad(`${id} 归 ${e.table} 表却被 ${usedBy.join(',')} 引用（E-DIM-COMPONENT-TABLE）`);
  log(`  ${id}: table=${e.table}, requires=${JSON.stringify(e.requires ?? [])}, 被引用=${usedBy.join(',') || '无'}`);
}
for (const [eid, e] of Object.entries(effects)) { for (const o of e.outputs) { if (!/^[a-z_]+\.[a-zA-Z]+$/.test(o.target)) bad(`${eid} output target 格式 ${o.target}`); if (!closedValues.eff_output.includes(o.kind)) bad(`${eid} output kind ${o.kind}`); } if (!closedValues.scope.includes(e.targetSelector.scope)) bad(`${eid} scope ${e.targetSelector.scope}`); if (!closedValues.consent_mode.includes(e.consent.mode)) bad(`${eid} consent ${e.consent.mode}`); }
// ref 写法统一：类型定义内只许 {"type":"ref",...}
for (const m of blocksA[0].matchAll(/"ref"\s*:\s*\{/g)) { bad('类型定义内出现旧写法 {"ref":{…}}，应为 {"type":"ref",…}'); break; }

// ---------- 8. 附录 G 锚点唯一 + D.1 关键词位置 ----------
log('== 8 附录 G 锚点唯一性');
const gStart = lines.findIndex(l => l.startsWith('## 附录 G'));
const gText = lines.slice(gStart).join('\n'); const bodyNoG = lines.slice(0, lines.findIndex(l => l.startsWith('## 附录'))).join('\n'); // 只数正文：附录（修订记录会转述锚点）不计
const anchors = [...gText.matchAll(/锚点："([^"]+)"/g)].map(m => m[1]);
for (const a of anchors) { const n = bodyNoG.split(a).length - 1; if (n !== 1) bad(`锚点 "${a}" 在正文出现 ${n} 次（应为 1）`); }
log(`  锚点 ${anchors.length} 个`);
const dup = [['规范化（唯一定义）', 1], ['三步算法（唯一定义）', 1], ['字符串类型规则（唯一定义）', 1], ['权限表（唯一定义）', 1]];
for (const [p, want] of dup) { const n = bodyNoG.split(p).length - 1; if (n !== want) bad(`关键定义 "${p}" 出现 ${n} 次`); }
if (!fail) log('  OK 锚点与关键定义各出现一次');
log('== 8b D.1 关键词出现位置（供人工确认同步）');
const d1 = sec(/^### D\.1/, /^### D\.2/);
for (const row of d1.filter(l => l.startsWith('| 【六】'))) {
  const cells = row.split('|').map(s => s.trim()); const kws = cells[4].split('；').map(s => s.trim()).filter(Boolean);
  for (const kw of kws) { const at = lines.map((l, i) => l.includes(kw) ? i + 1 : 0).filter(Boolean); log(`  ${cells[1]} / ${kw}: 行 ${at.join(',') || '（无）'}`); }
}
// ---------- 9. 全文不得出现"逐码元" ----------
log('== 9 码点口径');
{ const hits = lines.map((l, i) => l.includes('逐码元') ? i + 1 : 0).filter(Boolean); if (hits.length) bad('出现旧的码元口径：行 ' + hits.join(',')); else log('  OK 全文无旧的码元口径'); }
// ---------- 10. §2.7 权限表 needle 来源 ----------
log('== 10 权限表 needle 来源');
{
  const s27 = sec(/^### 2\.7/, /^### 2\.8/);
  const table = s27.filter(l => /^\| `(inputEdge|display|gate|outputGate|aiGate|kernel)`/.test(l));
  let ok = table.length >= 6;
  for (const row of table) {
    const cells = row.split('|'); const judge = cells[4] ?? '';
    for (const m of judge.matchAll(/needle[^。；]*?(来自|取自|=)\s*([^。；]*)/g)) {
      const src = m[2];
      if (/labels/.test(src)) { ok = false; bad(`权限表 needle 来源含 labels：${src.trim()}`); }
      if (!/blocklist|代号登记表|idIndex/.test(src)) { ok = false; bad(`权限表 needle 来源不是 blocklist/代号登记表：${src.trim()}`); }
    }
  }
  const banned = s27.filter(l => /labels[^\n]{0,20}(作|为)\s*needle/.test(l) && !/不得|永远不/.test(l));
  if (banned.length) { ok = false; bad('出现以 labels 为 needle 的许可性表述'); }
  if (ok) log(`  OK 权限表 ${table.length} 行，needle 来源只有 blocklist / 代号登记表`);
}
// ---------- 11. 规则层 / kernel 示例代码中不得出现逃逸写法 ----------
log('== 11 示例代码逃逸写法');
{
  const esc = [/\bany\b/, /\bas\s+any\b/, /\bas\s+unknown\s+as\b/, /@ts-ignore/, /@ts-expect-error/, /@ts-nocheck/, /eslint-disable/, /JSON\.parse\(/, /readFileSync|fs\./];
  // 只扫 §2.3 与 §2.8 的 ```js 代码块，以及 §2.8 正反例表中标"通过"的行
  const s = [...sec(/^### 2\.3/, /^### 2\.4/), ...sec(/^### 2\.8/, /^## 三/)];
  let hits = 0;
  let inJs = false, buf = [];
  for (const l of s) {
    if (l.startsWith('```js')) { inJs = true; buf = []; continue; }
    if (l.startsWith('```') && inJs) { inJs = false; for (const line of buf) for (const re of esc) if (re.test(line)) { hits++; bad(`js 示例含逃逸写法: ${line.trim()}`); } continue; }
    if (inJs) buf.push(l);
    if (/^\|/.test(l) && /\| 通过/.test(l) && !/登记加载器/.test(l)) for (const re of esc) if (re.test(l.split('|')[1])) { hits++; bad(`标"通过"的正例含逃逸写法: ${l.split('|')[1].trim()}`); }
    if (/^\|/.test(l) && /\| 通过/.test(l) && /登记加载器/.test(l) && !/@type \{unknown\}[^|]*JSON\.parse[^|]*narrow\(/.test(l)) { hits++; bad(`加载器正例不是唯一合法写法: ${l.split('|')[1].trim()}`); }
  }
  if (!hits) log('  OK 规则层/kernel 示例与正例均无 any / as / @ts-* / eslint-disable / JSON.parse / fs 读取');
}
// ---------- 12. 全文不得残留"五组" ----------
log('== 12 模块组计数口径');
{ const hits = lines.map((l, i) => /五组/.test(l) ? i + 1 : 0).filter(Boolean); if (hits.length) bad('残留旧的模块组计数：行 ' + hits.join(',')); else log('  OK 全文无旧的模块组计数残留（现行口径：七组 + textcore / 六个非规则组）'); }
// ---------- 13. 登记加载器表以外的示例代码不得出现 JSON.parse / fs ----------
log('== 13 加载器外示例无 JSON.parse / fs');
{
  const loaderTable = sec(/^- \*\*登记边界入口表\*\*/, /^- \*\*host 组\*\*/);
  const loaderSet = new Set(loaderTable.join('\n').match(/`[a-z\-\/]+\.mjs`/g) ?? []);
  let hits = 0;
  // 全文 js 代码块
  let inJs = false, buf = [];
  for (const l of lines) {
    if (l.startsWith('```js')) { inJs = true; buf = []; continue; }
    if (l.startsWith('```') && inJs) { inJs = false; for (const line of buf) if (/JSON\.parse\(|\bfs\.|readFileSync/.test(line)) { hits++; bad(`js 示例含 JSON.parse/fs: ${line.trim()}`); } continue; }
    if (inJs) buf.push(l);
  }
  // 正反例表中标"通过"的行：含 JSON.parse/fs 的必须自称"登记加载器里"
  for (const l of lines) if (/^\|/.test(l) && /\| 通过/.test(l) && /JSON\.parse|fs\./.test(l) && !/登记加载器/.test(l)) { hits++; bad(`标"通过"的正例在加载器外用 JSON.parse/fs: ${l.split('|')[1].trim()}`); }
  log(`  登记边界入口 ${loaderSet.size} 个文件；${hits ? '' : 'OK 入口外示例无 JSON.parse / fs'}`);
}
// ---------- 14. import 矩阵：kernel 与规则层不得 import textcore ----------
log('== 14 import 矩阵 textcore 列');
{
  const s27 = sec(/^### 2\.7/, /^### 2\.8/);
  const header = s27.find(l => /^\| 调用方/.test(l)); const cols = header ? header.split('|').map(s => s.trim()) : [];
  const ci = cols.indexOf('textcore');
  if (ci < 0) bad('矩阵无 textcore 列');
  else for (const name of ['kernel', '规则层']) {
    const row = s27.find(l => new RegExp('^\\| ' + name + '[（ |]').test(l)); if (!row) { bad('矩阵缺行 ' + name); continue; }
    const cell = row.split('|').map(s => s.trim())[ci] ?? '';
    if (cell) bad(`${name} 行 textcore 列非空：${cell}`); else log(`  OK ${name} 不 import textcore`);
  }
}
// ---------- 15. Text 构造点只在 §2.9 ----------
log('== 15 Text 构造点');
{
  const s29 = lines.findIndex(l => /^### 2\.9/.test(l)); const s3 = lines.findIndex((l, i) => i > s29 && /^## 三/.test(l));
  const ctor = /brand\(raw: string\): Text|唯一构造点/;
  const hits = lines.map((l, i) => (ctor.test(l) && /Text/.test(l) && (i < s29 || i >= s3)) ? i + 1 : 0).filter(Boolean);
  if (hits.length) bad('§2.9 之外出现 Text 构造点定义：行 ' + hits.join(',')); else log('  OK Text 构造点只在 §2.9');
}
// ---------- 16. 修正项字段不得出现字串类型 ----------
log('== 16 运行态修正项无字串');
{
  const row = lines.find(l => l.startsWith('| `struct:modifier` |'));
  if (!row) bad('缺 struct:modifier 行'); else if (/\bstring\b|: rx\b|Text/.test(row.split('|')[2]) ) bad('struct:modifier 含字串/rx 文本类型'); else log('  OK struct:modifier 无 string/rx 文本字段');
  const s32 = sec(/^### 3\.2/, /^### 3\.3/).join('\n');
  if (!/RxId|rxTree/.test(s32)) bad('§3.2 未说明运行态表达式为 RxId/rxTree'); else log('  OK §3.2 运行态表达式为 RxId/rxTree');
}
// ---------- 17. 出口表与入口表对称 ----------
log('== 17 入口/出口表对称');
{
  const s29 = sec(/^### 2\.9/, /^## 三/);
  const tableAfter = (anchor) => { const i = s29.findIndex(l => l.includes(anchor)); const rows = []; for (let j = i + 1; j < s29.length; j++) { if (/^\| /.test(s29[j]) && !/^\|---/.test(s29[j])) rows.push(s29[j]); else if (rows.length && !/^\|/.test(s29[j])) break; } return rows.slice(1); };
  const entries = tableAfter('**登记边界入口表**'), exits = tableAfter('**登记出口表**');
  const groupOf = rows => new Set(rows.map(r => r.split('|')[2].trim().replace(/（.*$/, '')));
  const ge = groupOf(entries), gx = groupOf(exits);
  if (!entries.length || !exits.length) bad('入口表或出口表缺失');
  for (const g of ['host', 'aiGate']) { if (!ge.has(g)) bad(`入口表缺 ${g}`); if (!gx.has(g)) bad(`出口表缺 ${g}`); }
  if (!gx.has('display')) bad('出口表缺 display（DOM sink）');
  for (const g of gx) if (!['host', 'aiGate', 'display', 'kernel', 'outputGate'].includes(g)) bad(`出口表出现不应有出口的组 ${g}`);
  if (!gx.has('outputGate')) bad('出口表缺 outputGate（已筛信封出口）');
  if (!ge.has('inputEdge')) bad('入口表缺 inputEdge（上行文字入口）');
  // 第十二版：出口表覆盖全部对外输出（存档、日志、控制台、HTTP、DOM、AI 请求），aiGate 收发配对
  const sinks = exits.map(r => r.split('|')[3] ?? '').join('\n');
  for (const kw of ['存档', '日志', '控制台', 'HTTP', 'DOM', 'AI 请求']) if (!sinks.includes(kw)) bad(`出口表去向列未覆盖：${kw}`);
  const promptRow = exits.find(r => r.includes('`ai-gate/prompt.mjs`')) ?? '';
  if (!/配对/.test(promptRow) || !promptRow.includes('`ai-gate/parse.mjs`')) bad('出口表 ai-gate/prompt.mjs 行未注明与入口 ai-gate/parse.mjs 配对');
  if (!entries.some(r => r.includes('`ai-gate/parse.mjs`') && r.includes('`ai-gate/prompt.mjs`'))) bad('入口表 ai-gate/parse.mjs 行未指回配对出口');
  for (const f of ['`kernel/save.mjs`', '`kernel/report.mjs`']) if (!exits.some(r => r.split('|')[1].includes(f))) bad(`出口表缺 ${f}`);
  const cols = r => r.replace(/`[^`]*`/g, '').split('|').length; // 反引号内的 | 不算列分隔
  if (entries.some(r => cols(r) !== 7) || exits.some(r => cols(r) !== 7)) bad('入口/出口表列数不对称（各应 5 列）');
  if (!fail) log(`  OK 入口 ${entries.length} 行（组：${[...ge].join(',')}），出口 ${exits.length} 行（组：${[...gx].join(',')}），列数对称`);
}
// ---------- 18. 每组都有全局对象白名单 ----------
log('== 18 全局对象白名单');
{
  const s29 = sec(/^### 2\.9/, /^## 三/);
  const i = s29.findIndex(l => l.includes('**全局对象白名单**'));
  const rows = []; for (let j = i + 1; j < s29.length; j++) { if (/^\| /.test(s29[j]) && !/^\|---/.test(s29[j])) rows.push(s29[j].split('|')[1].trim()); else if (rows.length && !/^\|/.test(s29[j])) break; }
  const need = ['kernel', 'textcore', 'inputEdge', 'display', 'gate', 'outputGate', 'aiGate', 'host', '规则层'];
  const missing = need.filter(g => !rows.includes(g));
  if (missing.length) bad('白名单缺组: ' + missing.join(',')); else log(`  OK 白名单覆盖 ${need.length} 个组/层`);
}
// ---------- 19. 强转只出现在豁免文件表列出的文件（第十二版改写） ----------
log('== 19 强转豁免文件表');
{
  const before = fail;
  const dS = lines.findIndex(l => /^## 附录 D/.test(l)), dE = lines.findIndex((l, i) => i > dS && /^## 附录 E/.test(l));
  const inD = i => i >= dS && i < dE; // 附录 D 是历史处置记录与脚本输出，不算现行定义
  const s29start = lines.findIndex(l => /^### 2\.9/.test(l)), s29end = lines.findIndex((l, i) => i > s29start && /^## 三/.test(l));
  const in29 = i => i >= s29start && i < s29end;
  // (a) 豁免表存在且在 §2.9，逐行是具体文件
  const ti = lines.findIndex(l => l.includes('**强转豁免文件表**'));
  const rows = []; for (let j = ti + 1; ti >= 0 && j < lines.length; j++) { if (/^\| /.test(lines[j]) && !/^\|---/.test(lines[j])) rows.push(lines[j]); else if (rows.length && !/^\|/.test(lines[j])) break; }
  const data = rows.slice(1);
  const files = data.map(r => (r.split('|')[1].match(/`([^`]+)`/) ?? [])[1]).filter(Boolean);
  if (ti < 0 || !in29(ti)) bad('§2.9 内没有强转豁免文件表');
  if (files.length !== data.length) bad('豁免表有行未写具体文件');
  for (const f of files) if (!/^[a-z\-\/]+\.mjs$/.test(f)) bad(`豁免表文件不是具体路径（不得用通配）：${f}`);
  if (!files.includes('textcore/brand.mjs')) bad('豁免表缺 textcore/brand.mjs');
  if (!files.some(f => f.startsWith('kernel/handles/'))) bad('豁免表缺 kernel/handles 构造函数文件');
  if (!files.includes('kernel/validate/narrow.mjs')) bad('豁免表缺 narrow');
  const need = [['textcore/brand.mjs', /`RawText` → `Text`/], ['kernel/validate/narrow.mjs', /`unknown` → `SchemaOut<S>`/]];
  for (const [f, re] of need) { const r = data.find(x => x.includes('`' + f + '`')); if (r && !re.test(r.split('|')[2])) bad(`豁免表 ${f} 行的强转方向不对`); }
  // (b) 现行正文不得再说"唯一强转豁免点"
  const old = lines.map((l, i) => !inD(i) && /全书唯一|唯一(的|允许的)?品牌强转|唯一品牌强转|唯一强转/.test(l) ? i + 1 : 0).filter(Boolean);
  if (old.length) bad('残留"唯一强转豁免点"旧说法：行 ' + old.join(','));
  // (c) §2.9 之外凡提到强转豁免或允许强转的行，必须引用 §2.9；不得给出表外的豁免文件
  const mention = lines.map((l, i) => !inD(i) && !in29(i) && /强转/.test(l) ? i : -1).filter(i => i >= 0);
  for (const i of mention) {
    const l = lines[i];
    if (/豁免/.test(l) && !/§2\.9/.test(l)) bad(`§2.9 之外提到强转豁免而未引用 §2.9：行 ${i + 1}`);
    if (/(kernel 与|kernel、)[^。；|]{0,40}之外的任何 `as`/.test(l)) bad(`§2.9 之外仍按整组豁免 kernel：行 ${i + 1}`);
  }
  // (d) 全文（附录 D 除外）标"通过"的正例里出现 @type 强转的，只能是 unknown 标注（入口写法）
  for (let i = 0; i < lines.length; i++) { const l = lines[i]; if (inD(i) || !/^\|/.test(l) || !/\| 通过/.test(l)) continue; const c = l.split('|')[1]; for (const m of c.matchAll(/@type \{([^}]+)\}/g)) if (m[1] !== 'unknown') bad(`标"通过"的正例含表外强转：行 ${i + 1}`); }
  const defs = lines.filter((l, i) => !inD(i) && /brand\(raw: RawText\): Text/.test(l)).length;
  if (defs !== 1) bad(`brand 签名定义出现 ${defs} 次（应 1）`);
  if (fail === before) log(`  OK 豁免表 ${files.length} 个具体文件（${files.join('、')}）；表外无强转许可，旧的"唯一豁免点"说法已清`);
}
// ---------- 20. 七组 + textcore 文件级不相交（按 glob 前缀静态核对） ----------
log('== 20 模块组 glob 不相交');
{
  const groups = {};
  for (const l of lines) { const m = l.match(/^\s*"(kernel|inputEdge|display|gate|outputGate|aiGate|host|textcore|clientTextcore)":\s*\{"modules":\s*\[([^\]]*)\]/); if (m) groups[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]); }
  const names = Object.keys(groups);
  if (names.length !== 9) bad('模块组 JSON 应有 7 组 + 两份共享库，实得 ' + names.length);
  for (const g of names) for (const x of groups[g]) if (!x.startsWith('!') && !/\*\*/.test(x)) bad(`${g} 的 glob 未用 ** 覆盖子目录：${x}`);
  const prefix = g => g.replace(/\*\*.*$/, '').replace(/\*[^/]*$/, '').replace(/\/$/, '');
  const covers = (inc, path) => { const p = prefix(inc); const star2 = /\*\*/.test(inc); return path === p || (path.startsWith(p + '/') && (star2 || !path.slice(p.length + 1).includes('/'))); };
  const inGroup = (g, path) => groups[g].some(x => !x.startsWith('!') && covers(x, path)) && !groups[g].some(x => x.startsWith('!') && covers(x.slice(1), path));
  const samples = [];
  for (const g of names) for (const x of groups[g]) if (!x.startsWith('!')) samples.push({ g, path: prefix(x) + '/' + (/\*\*/.test(x) ? 'sub/' : '') + 'a.mjs' });
  for (const s of samples) for (const g of names) if (g !== s.g && inGroup(g, s.path)) bad(`文件 ${s.path}（${s.g}）同时落入 ${g}`);
  if (!fail) log(`  OK ${names.length} 组 ${samples.length} 个代表路径两两不相交（display 以 ! 排除 extension/host 与 extension/textcore）`);
}
// ---------- 21. 白名单闭集 + release 形参（第十二版指令第 9 条） ----------
log('== 21 白名单闭集与 release 形参');
{
  const before = fail;
  const a = lines.findIndex(l => l.startsWith('- **白名单制**')), b = lines.findIndex((l, i) => i > a && l.startsWith('- **入口契约**'));
  if (a < 0 || b < 0) bad('找不到白名单段');
  const seg = lines.slice(a, b);
  seg.forEach((l, k) => { if (/等|…|\.\.\./.test(l)) bad(`白名单段出现"等"或省略号：行 ${a + k + 1}`); });
  const segText = seg.join('\n');
  for (const kw of ['`eval`', '`Function`', 'new Function', '`import()`', '`with`']) if (!segText.includes(kw)) bad(`白名单段未明确禁止 ${kw}`);
  const rowOf = g => seg.find(l => l.startsWith('| ' + g + ' |')) ?? '';
  for (const g of ['`TextEncoder`', '`TextDecoder`', '`Buffer`', '`console`']) {
    const owners = seg.filter(l => /^\| /.test(l) && l.includes(g)).map(l => l.split('|')[1].trim());
    const want = g === '`console`' ? 'kernel' : 'textcore';
    if (owners.length !== 1 || owners[0] !== want) bad(`${g} 应只在 ${want} 行，实在：${owners.join(',') || '无'}`);
  }
  if (!/`console`（仅 `kernel\/report\.mjs`）/.test(rowOf('kernel'))) bad('console 未限定到 kernel/report.mjs');
  if (!/仅 `textcore\/seal\.mjs`/.test(rowOf('textcore'))) bad('TextEncoder/TextDecoder/Buffer 未限定到 textcore/seal.mjs');
  if (/node:crypto/.test(rowOf('aiGate').split('|')[3] ?? '')) bad('aiGate 仍有 node:crypto（凭证应由 kernel 签发）');
  // release 的形参类型
  const dS = lines.findIndex(l => /^## 附录 D/.test(l)), dE = lines.findIndex((l, i) => i > dS && /^## 附录 E/.test(l));
  let sigs = 0;
  lines.forEach((l, i) => { if (i >= dS && i < dE) return; for (const m of l.matchAll(/release\(([^)]*:[^)]*)\)/g)) { sigs++; if (!/^\s*\w+: Screened<Text>\s*$/.test(m[1])) bad(`release 形参不是 Screened<Text>：行 ${i + 1}（${m[1]}）`); } });
  if (sigs < 1) bad('全文没有 release 的带类型签名');
  lines.forEach((l, i) => { if (i >= dS && i < dE) return; if (/`Text → string`/.test(l)) bad(`残留 release 收 Text 的旧说法：行 ${i + 1}`); });
  // 出口表文字出口的输入列都是 Screened<Text>
  const xi = lines.findIndex(l => l.includes('**登记出口表**'));
  const xrows = []; for (let j = xi + 1; j < lines.length; j++) { if (/^\| /.test(lines[j]) && !/^\|---/.test(lines[j])) xrows.push(lines[j]); else if (xrows.length && !/^\|/.test(lines[j])) break; }
  // 卷九勘误 11-13：出口类型按正文登记区分——"文字出口（前N行）"登记的前 N 行是文字出口，须收 Screened<Text> 且有实际兜底；其余行是非文字出口，兜底列须写"不适用："并给理由
  const cnN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }; const tm = (lines[xi] ?? '').match(/文字出口（前([一二三四五六七八九])行）/);
  if (!tm) bad('登记出口表引言缺"文字出口（前N行）"的类型登记'); const nText = tm ? cnN[tm[1]] : 0;
  xrows.slice(1).forEach((r, k) => {
    const c = r.split('|'); const grp = c[2].trim().replace(/（.*$/, ''); const isText = k < nText;
    if (isText && /^\s*不适用/.test(c[5] ?? '')) bad(`文字出口不得写兜底"不适用"：${c[1].trim()}`);
    if (!isText && !/^\s*不适用：/.test(c[5] ?? '')) bad(`非文字出口行兜底列应写"不适用："并给理由（否则应登记为文字出口）：${c[1].trim()}`);
    if (grp === 'kernel') { if (/`Text`（|输入.*release/.test(c[4]) || !/不含 `Text`/.test(c[4])) bad(`kernel 出口行应写明不含 Text：${c[1].trim()}`); }
    else if (grp === 'host') { if (!c[4].includes('`RawText`') || !/不是 `Screened<Text>` 出口/.test(c[4])) bad(`host 上行出口应写明只带 RawText、不是显示出口：${c[1].trim()}`); } // 第十三版：客户端上行不是显示出口
    else if (isText && !c[4].includes('`Screened<Text>`')) bad(`文字出口输入不是 Screened<Text>：${c[1].trim()}`);
  });
  // 第十三版：kernelApi 是结构化条目的闭集（逐个导出名、无通配、限定写在机读字段里而不是中文括号里）
  const ka = lines.findIndex(l => /^\s*"kernelApi":\s*\{"exports":\s*\[/.test(l));
  const apiRows = []; for (let j = ka + 1; ka >= 0 && j < lines.length && !/^\s*\]\},/.test(lines[j]); j++) apiRows.push(lines[j]);
  const api = [];
  for (const r of apiRows) { try { api.push(JSON.parse(r.trim().replace(/,$/, ''))); } catch { bad('kernelApi 条目不是可解析的 JSON：' + r.trim().slice(0, 60)); } }
  if (api.length < 20) bad('kernelApi 条目过少：' + api.length);
  const seen = new Set();
  for (const e of api) {
    if (!/^kernel\/[a-z\-\/]+\.mjs#[A-Za-z]+$/.test(e.export ?? '')) bad('kernelApi 导出名不是"文件#导出名"（不得用通配或带说明文字）：' + e.export);
    if (seen.has(e.export)) bad('kernelApi 重复条目：' + e.export); seen.add(e.export);
    if (typeof e.acceptsState !== 'boolean') bad('kernelApi 缺 acceptsState：' + e.export);
    const who = e.callers ?? e.callerFiles; if (!Array.isArray(who) || !who.length || (e.callers && e.callerFiles)) bad('kernelApi 须有 callers 或 callerFiles 之一：' + e.export);
    for (const c of e.callers ?? []) if (!['rules', '*', 'textcore', 'gate', 'outputGate', 'aiGate', 'inputEdge'].includes(c)) bad(`kernelApi ${e.export} 的 callers 含未知组键 ${c}`);
  }
  const byName = n => api.find(e => (e.export ?? '').endsWith('#' + n));
  const only = (n, who) => { const e = byName(n); if (!e) return bad('kernelApi 缺 ' + n); if (JSON.stringify(e.callers ?? e.callerFiles) !== JSON.stringify(who)) bad(`kernelApi ${n} 的调用者应为 ${who.join(',')}`); };
  only('issueCredential', ['aiGate']); only('writeSealed', ['aiGate']); only('readSealed', ['outputGate']); only('makeSealed', ['textcore']);
  for (const n of ['narrow', 'idIndex', 'V', 'E', 'declareInputs', 'stateMemo', 'inputsOf', 'explain', 'sample', 'terminate']) if (!byName(n)) bad('kernelApi 缺 ' + n);
  // scope 常量：与 textWriters 一一对应，各只对登记写者文件开放
  const tw = lines.find(l => /^\s*"textWriters":/.test(l)) ?? ''; const writers = [...tw.matchAll(/:\s*"(ai-gate\/[a-z\-]+\.mjs)"/g)].map(m => m[1]);
  const scopes = api.filter(e => /text-scopes\.mjs#scope/.test(e.export ?? ''));
  if (scopes.length !== writers.length || !writers.length) bad(`scope 常量 ${scopes.length} 个与 textWriters ${writers.length} 条不对应`);
  for (const s of scopes) if (!(s.callerFiles?.length === 1 && writers.includes(s.callerFiles[0]))) bad(`scope 常量 ${s.export} 未限定到登记写者文件`);
  if (fail === before) log(`  OK 白名单段无"等"与省略号，禁 eval/Function/import()/with，专用项各归一处；release 带类型签名 ${sigs} 处均为 Screened<Text>；出口表输入列一致；kernelApi ${api.length} 条均为结构化条目、无通配，issueCredential/writeSealed 限 aiGate、readSealed 限 outputGate，scope 常量 ${scopes.length} 个各限一个写者文件`);
}
// ---------- 22. 每个文件都有归属（第十二版指令第 11 条） ----------
log('== 22 文件归属');
{
  const before = fail;
  if (!lines.some(l => l.includes('**每个文件都有归属**') && l.includes('E-FILE-UNASSIGNED'))) bad('§2.9 缺文件归属规则或错误码');
  const groups = {};
  for (const l of lines) { const m = l.match(/^\s*"(kernel|inputEdge|display|gate|outputGate|aiGate|host|textcore|clientTextcore)":\s*\{"modules":\s*\[([^\]]*)\]/); if (m) groups[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]); }
  const asmLine = lines.find(l => /^\s*"assembly":/.test(l)) ?? ''; const asmFiles = [...(asmLine.match(/"files":\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(x => x[1]);
  const retLine = lines.find(l => /^\s*"retired":/.test(l)) ?? ''; const retired = [...(retLine.match(/\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(x => x[1].replace(/\*\*$/, ''));
  if (asmFiles.length !== 1 || asmFiles[0] !== 'server-plugin/index.mjs') bad('assembly.files 应恰为 server-plugin/index.mjs');
  if (retired.length !== 3) bad('retired 应登记 legacy/compat/migrations 三个待删目录');
  const dl = lines.find(l => /^\s*"dataFiles":/.test(l));
  const dataGlobs = dl ? [...dl.match(/\[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
  if (!dataGlobs.length) bad('state-owners 示例缺 dataFiles');
  const CODE = ['mjs', 'js', 'cjs', 'mts', 'ts', 'jsx'];
  const ruleLine = lines.find(l => l.includes('**代码文件**') && l.includes('按所在目录归组')) ?? '';
  for (const e of CODE) if (!ruleLine.includes('`' + e + '`')) bad(`归属规则未列代码扩展名 ${e}`);
  // glob 匹配：** 跨目录，* 不跨目录；归组时把代码 glob 的扩展名展开为全部代码扩展名
  const toRe = (g, expand) => { let s = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*'); if (expand) s = s.replace(/\\\.mjs$/, '\\.(?:' + CODE.join('|') + ')'); return new RegExp('^' + s + '$'); };
  const inGroup = (g, p) => groups[g].some(x => !x.startsWith('!') && toRe(x, true).test(p)) && !groups[g].some(x => x.startsWith('!') && (toRe(x.slice(1), true).test(p) || p.startsWith(x.slice(1).replace(/\*\*.*$/, ''))));
  const ext = p => p.slice(p.lastIndexOf('.') + 1);
  const classify = p => { if (retired.some(r => p.startsWith(r))) return 'retired'; if (asmFiles.includes(p)) return 'assembly'; const isCode = CODE.includes(ext(p)) && p.includes('.'); if (isCode) { const gs = Object.keys(groups).filter(g => inGroup(g, p)); return gs.length > 1 ? 'OVERLAP:' + gs.join('+') : gs.length === 1 ? gs[0] : (p.startsWith('server-plugin/') ? '规则层' : 'UNASSIGNED'); } return dataGlobs.some(g => toRe(g, false).test(p)) ? 'data' : 'UNASSIGNED'; };
  const dirs = { kernel: 'server-plugin/kernel/sub', inputEdge: 'server-plugin/input/sub', display: 'extension/panel/sub', gate: 'server-plugin/gate/sub', outputGate: 'server-plugin/output-gate/sub', aiGate: 'server-plugin/ai-gate/sub', host: 'extension/host/sub', textcore: 'server-plugin/textcore/sub', clientTextcore: 'extension/textcore/sub' };
  let n = 0;
  for (const [g, d] of Object.entries(dirs)) {
    for (const e of CODE) { n++; const got = classify(`${d}/a.${e}`); if (got !== g) bad(`${d}/a.${e} 应归 ${g}，实得 ${got}`); }
    if (d.startsWith('server-plugin/')) { n++; const got = classify(`${d}/a.json`); if (got !== 'data') bad(`${d}/a.json 应为登记数据，实得 ${got}`); }
  }
  const expect = [['server-plugin/economy/a.js', '规则层'], ['server-plugin/economy/a.mjs', '规则层'], ['extension/panel/a.ts', 'display'], ['extension/host/a.d.ts', 'host'], ['extension/style/a.css', 'data'], ['extension/a.html', 'data'], ['server-plugin/gate/a.wasm', 'UNASSIGNED'], ['server-plugin/gate/README', 'UNASSIGNED'], ['extension/a.png', 'UNASSIGNED'],
    ['server-plugin/index.mjs', 'assembly'], ['server-plugin/projection/a.mjs', '规则层'], ['server-plugin/ui-x.mjs', '规则层'], ['extension/dom-sink.mjs', 'display'], ['extension/host/bootstrap.mjs', 'host'], ['extension/textcore/open-envelope.mjs', 'clientTextcore'],
    ['server-plugin/legacy/core.js', 'retired'], ['server-plugin/compat/a.mjs', 'retired'], ['server-plugin/migrations/a.mjs', 'retired']];
  for (const [p, want] of expect) { n++; const got = classify(p); if (got !== want) bad(`${p} 应为 ${want}，实得 ${got}`); }
  if (fail === before) log(`  OK ${n} 个代表路径：六种代码扩展名都按目录归到原组，json/css/html 属登记数据，未登记类型判 E-FILE-UNASSIGNED，无文件同时落两组`);
}
// ================= 第十三版新增（两进程模型） =================
// 公共：取 "锚点文字" 之后的第一张表（去表头），以及历史区（附录 D、E）的行号范围
const tableAfterLine = (startIdx) => { const rows = []; for (let j = startIdx + 1; j < lines.length; j++) { if (/^\| /.test(lines[j]) && !/^\|---/.test(lines[j])) rows.push(lines[j]); else if (rows.length && !/^\|/.test(lines[j])) break; } return rows.slice(1); };
const cellsOf = r => r.split('|').slice(1, -1).map(s => s.trim());
const histS = lines.findIndex(l => /^## 附录 D/.test(l)), histE = lines.findIndex((l, i) => i > histS && /^## 附录 F/.test(l));
const inHist = i => i >= histS && i < histE; // 附录 D、E：历史处置记录与脚本输出
const migS = lines.findIndex(l => l.startsWith('**现有代码文件的去处')), migE = lines.findIndex((l, i) => i > migS && /^### 6\.12/.test(l));
const inMig = i => i >= migS && i < migE; // §6.11 迁移表：描述的是现有代码的毛病
const s29a = lines.findIndex(l => /^### 2\.9/.test(l)), s29b = lines.findIndex((l, i) => i > s29a && /^## 三/.test(l));
const wlIdx = lines.findIndex(l => l.includes('**全局对象白名单**'));
const wl = tableAfterLine(wlIdx).map(cellsOf); // [组, 进程, 宿主全局, node/npm, 文件]
const wlRow = g => wl.find(c => c[0] === g) ?? [];

// ---------- 23. 两进程的分组与矩阵 ----------
log('== 23 两进程分组与矩阵');
{
  const before = fail;
  const c0 = lines.findIndex(l => l.startsWith('**0. 两进程模型（唯一定义）**'));
  const c1 = lines.findIndex(l => l.startsWith('**1. 外部边界**'));
  if (!(c0 > s29a && c0 < c1 && c1 < s29b)) bad('§2.9 第 0 条"两进程模型"不在第 1 条之前');
  if (lines.filter(l => l.includes('两进程模型（唯一定义）')).length !== 2) bad('"两进程模型（唯一定义）"应恰出现两次（定义处与附录 G 锚点）');
  // 进程分组表
  const pt = tableAfterLine(lines.findIndex(l => l.startsWith('- **进程分组表**'))).map(cellsOf);
  const procOf = {}; const zh = { '服务端': 'server', '客户端': 'client', '离线': 'offline' };
  for (const r of pt) for (const g of ['kernel', '规则层', 'inputEdge', 'gate', 'outputGate', 'aiGate', 'host', 'display', 'textcore', 'clientTextcore', 'tools']) if (new RegExp('(^|[、；\\s])' + g + '($|[、；（\\s])').test(r[2])) { if (procOf[g]) bad(`${g} 在进程分组表里出现两次`); procOf[g] = zh[r[0]]; }
  const want = { kernel: 'server', '规则层': 'server', inputEdge: 'server', gate: 'server', outputGate: 'server', aiGate: 'server', textcore: 'server', host: 'client', display: 'client', clientTextcore: 'client', tools: 'offline' };
  for (const [g, p] of Object.entries(want)) if (procOf[g] !== p) bad(`进程分组表：${g} 应在 ${p}，实得 ${procOf[g]}`);
  if (!pt.some(r => r[0] === '服务端' && r[2].includes('`server-plugin/index.mjs`'))) bad('进程分组表服务端行缺装配文件');
  // state-owners JSON 的 process 字段与分组表一致
  for (const l of lines) { const m = l.match(/^\s*"(kernel|inputEdge|display|gate|outputGate|aiGate|host|textcore|clientTextcore|assembly)":\s*\{.*"process":\s*"(server|client)"/); if (m && m[1] !== 'assembly' && want[m[1]] !== m[2]) bad(`JSON ${m[1]}.process=${m[2]} 与进程分组表不符`); }
  const withProc = lines.filter(l => /^\s*"(kernel|inputEdge|display|gate|outputGate|aiGate|host|textcore|clientTextcore|assembly)":\s*\{.*"process":/.test(l)).length;
  if (withProc !== 10) bad(`JSON 中带 process 字段的组应为 10 项（7 组 + 2 份共享库 + 装配文件），实得 ${withProc}`);
  // 各组 glob 的根目录与进程一致
  for (const l of lines) { const m = l.match(/^\s*"(\w+)":\s*\{"modules":\s*\[([^\]]*)\].*"process":\s*"(server|client)"/); if (!m) continue; for (const x of m[2].matchAll(/"([^"]+)"/g)) { const root = x[1].replace(/^!/, '').split('/')[0]; if (root !== (m[3] === 'server' ? 'server-plugin' : 'extension')) bad(`${m[1]} 在 ${m[3]} 进程却含 ${x[1]}`); } }
  // 两张矩阵
  const s27 = sec(/^### 2\.7/, /^### 2\.8/);
  const heads = s27.map((l, i) => /^\| 调用方/.test(l) ? i : -1).filter(i => i >= 0);
  if (heads.length !== 2) bad('§2.7 应恰有两张 import 矩阵，实得 ' + heads.length);
  else {
    const mat = h => { const rows = []; for (let j = h + 2; j < s27.length && /^\|/.test(s27[j]); j++) rows.push(cellsOf(s27[j])); return { cols: cellsOf(s27[h]), rows }; };
    const sv = mat(heads[0]), cl = mat(heads[1]);
    const svCols = sv.cols.slice(1), clCols = cl.cols.slice(1);
    for (const g of ['host', 'display', 'clientTextcore']) { if (svCols.includes(g)) bad(`服务端矩阵不应有 ${g} 列`); if (sv.rows.some(r => r[0].startsWith(g))) bad(`服务端矩阵不应有 ${g} 行`); }
    for (const g of ['kernel', '规则层', 'textcore', 'inputEdge', 'gate', 'outputGate', 'aiGate']) { if (!svCols.includes(g)) bad(`服务端矩阵缺 ${g} 列`); if (!sv.rows.some(r => r[0].startsWith(g))) bad(`服务端矩阵缺 ${g} 行`); if (clCols.includes(g) || cl.rows.some(r => r[0].startsWith(g + '（') || r[0] === g)) bad(`客户端矩阵不应出现服务端的 ${g}`); }
    for (const g of ['host', 'display', 'clientTextcore']) { if (!clCols.includes(g)) bad(`客户端矩阵缺 ${g} 列`); if (!cl.rows.some(r => r[0].startsWith(g))) bad(`客户端矩阵缺 ${g} 行`); }
    if (!sv.rows.some(r => r[0].startsWith('装配文件'))) bad('服务端矩阵缺装配文件行');
    const cell = (m, rowName, colName) => (m.rows.find(r => r[0].startsWith(rowName)) ?? [])[m.cols.indexOf(colName)] ?? '';
    // 关键禁行：规则层只进 kernel 与规则层；kernel 只进 kernel；gate 不被 host import（host 在另一进程）；display 不 import host
    for (const c of ['textcore', 'inputEdge', 'gate', 'outputGate', 'aiGate']) { if (cell(sv, '规则层', c)) bad(`规则层不得 import ${c}`); if (cell(sv, 'kernel', c)) bad(`kernel 不得 import ${c}`); }
    if (cell(sv, 'kernel', '规则层')) bad('kernel 不得 import 规则层');
    if (cell(cl, 'display', 'host')) bad('display 不得 import host');
    if (cell(cl, 'clientTextcore', 'host') || cell(cl, 'clientTextcore', 'display')) bad('clientTextcore 不得 import host/display');
    if (cell(sv, 'gate', 'outputGate') || cell(sv, 'gate', 'aiGate') || cell(sv, 'gate', 'inputEdge')) bad('gate 不得 import 上游三组');
    // 矩阵括号里引用的反引号名字必须是已登记的导出名
    const apiNames = new Set(lines.filter(l => /^\s*\{"export":/.test(l)).map(l => l.match(/#([A-Za-z]+)"/)?.[1]).filter(Boolean));
    // 第十四版：服务端的名字全部取自 kernelApi 与 groupApi 两张表的数据，不再手写名单；客户端三个名字不在这两张表里，单列
    if (!lines.some(l => /^\s*"groupApi":\s*\{"exports":\s*\[/.test(l))) bad('state-owners 示例缺 groupApi（非 kernel 组导出表）');
    const known = new Set([...apiNames, 'narrowWire', 'openEnvelope', 'mount(caps)']);
    for (const m of [sv, cl]) for (const r of m.rows) for (let k = 1; k < r.length; k++) { if (m === sv && k === m.cols.length - 1) continue; if (m === cl && k === m.cols.length - 1) continue; for (const t of r[k].matchAll(/`([^`]+)`/g)) { const name = t[1]; if (/\//.test(name)) continue; if (!known.has(name)) bad(`矩阵 ${r[0]} 行引用了未登记的名字 ${name}`); } }
    // 矩阵末列的 node:* 与白名单表的 node:* 逐组一致
    const nodeSet = s => [...new Set((s.match(/node:[a-z_]+/g) ?? []))].sort().join(',');
    const pos = s => s.replace(/没有 `node:[a-z_]+`/g, '');
    for (const g of ['kernel', 'textcore', 'inputEdge', 'gate', 'outputGate', 'aiGate', '规则层']) { const a = nodeSet(pos(cell(sv, g, sv.cols[sv.cols.length - 1]))), b = nodeSet(pos(wlRow(g)[3] ?? '')); if (a !== b) bad(`${g} 的 node:* 清单在矩阵（${a || '无'}）与白名单表（${b || '无'}）不一致`); }
    if (fail === before) log(`  OK 进程分组表 11 项与 JSON process 字段一致；服务端矩阵 ${sv.rows.length} 行、客户端矩阵 ${cl.rows.length} 行，互不含对方的组；矩阵引用名均已登记；node:* 清单两处一致`);
  }
}
// ---------- 24. 客户端只有 bootstrap 能访问宿主全局 ----------
log('== 24 宿主全局只在 bootstrap');
{
  const before = fail;
  const BOOT = '`extension/host/bootstrap.mjs`';
  const host = wlRow('host'), disp = wlRow('display'), ct = wlRow('clientTextcore');
  if (host[1] !== '客户端' || disp[1] !== '客户端' || ct[1] !== '客户端') bad('白名单表 host/display/clientTextcore 行应标客户端');
  if (!(host[2] ?? '').includes('全部仅 ' + BOOT)) bad('host 行的宿主全局未限定为"全部仅 bootstrap"');
  if ((host[4] ?? '') !== BOOT) bad('host 行"只在这些文件内可用"应恰为 bootstrap');
  if (!/^无/.test(disp[2] ?? '') || !/^无/.test(ct[2] ?? '')) bad('display 与 clientTextcore 行的宿主全局应为"无"');
  const HOSTG = ['`window`', '`document`', '`localStorage`', '`getContext`', '`crypto`', '`Blob`', '`URL`'];
  for (const g of HOSTG) { const owners = wl.filter(c => (c[2] ?? '').includes(g)).map(c => c[0]); if (owners.length !== 1 || owners[0] !== 'host') bad(`${g} 应只在 host 行，实在：${owners.join(',') || '无'}`); }
  // 服务端各行不得出现浏览器全局
  for (const c of wl.filter(c => c[1] === '服务端')) for (const g of ['`window`', '`document`', '`localStorage`']) if ((c[2] ?? '').includes(g)) bad(`服务端 ${c[0]} 行出现浏览器全局 ${g}`);
  // 能力对象表：客户端能力对象的构造者都是 bootstrap
  const capIdx = lines.findIndex(l => /^\| 能力对象 \|/.test(l));
  const caps = tableAfterLine(capIdx - 1).map(cellsOf);
  let last = ''; const ctor = {}; for (const r of caps) { const who = r[1] === '同上' ? last : r[1]; last = who; ctor[r[0]] = { who, to: r[3] }; }
  const clientCaps = ['`NetCap`', '`DomStructCap`', '`DomTextCap`', '`InputCap`', '`SubtleDigestCap`', '`ClientTimerCap`', '`PrefCap`', '`DownloadCap`', '`FilePickCap`', '`StEventCap`'];
  for (const c of clientCaps) { if (!ctor[c]) bad(`能力对象表缺 ${c}`); else if (ctor[c].who !== BOOT) bad(`${c} 的构造者应为 bootstrap，实为 ${ctor[c].who}`); }
  if (ctor['`DomTextCap`'] && !/^仅 `extension\/dom-sink\.mjs`$/.test(ctor['`DomTextCap`'].to)) bad('DomTextCap 应只交给 extension/dom-sink.mjs');
  // 正文（历史区与迁移表除外）凡写客户端文件可用 window/document 的，只能是 bootstrap
  lines.forEach((l, i) => { if (inHist(i) || inMig(i)) return; for (const m of l.matchAll(/(`window`|`document`)[^。；|]{0,30}（仅 `([^`]+)`）/g)) if (m[2] !== 'extension/host/bootstrap.mjs') bad(`行 ${i + 1}：${m[1]} 被开放给 ${m[2]}`); });
  // 旧文件名不得残留（它们代表"宿主入口不止一个文件"的旧模型）
  lines.forEach((l, i) => { if (inHist(i) || inMig(i)) return; if (/`(?:extension\/)?host\/(dom|http)\.mjs`|`projection\/[a-z\-]+\.mjs`|server-plugin\/host\//.test(l)) bad(`行 ${i + 1}：残留旧的宿主入口或 projection 文件名`); });
  // 路径写法：客户端文件一律带 extension/ 根
  lines.forEach((l, i) => { if (inHist(i) || inMig(i) || i < s29a || i >= s29b) return; for (const m of l.matchAll(/`((?:host|textcore)\/(?:bootstrap|net|open-envelope|narrow-wire)\.mjs|dom-sink\.mjs)`/g)) bad(`行 ${i + 1}：客户端文件 ${m[1]} 未写全 extension/ 根目录`); });
  if (fail === before) log(`  OK 白名单表中 ${HOSTG.length} 个浏览器宿主全局只在 host 行且全部限定到 bootstrap；display、clientTextcore 为"无"；${clientCaps.length} 个客户端能力对象的构造者都是 bootstrap；无旧宿主入口文件名残留`);
}
// ---------- 25. 定时器只出现在许可位置 ----------
log('== 25 定时器位置');
{
  const before = fail;
  const TIMER = /`?(setTimeout|clearTimeout|setInterval|clearInterval|AbortController|AbortSignal)`?/;
  // 白名单表：定时器只在 kernel 行（限定 kernel/scheduler.mjs）与 host 行（限定 bootstrap）
  for (const c of wl) { const has = TIMER.test(c[2] ?? ''); if (has && !['kernel', 'host'].includes(c[0])) bad(`白名单 ${c[0]} 行出现定时器`); }
  if (!/`setTimeout`、`clearTimeout`、`AbortController`（仅 `kernel\/scheduler\.mjs`）/.test(wlRow('kernel')[2] ?? '')) bad('kernel 行的定时器未限定到 kernel/scheduler.mjs');
  if (!/`setTimeout`/.test(wlRow('host')[2] ?? '')) bad('host 行缺定时器（客户端 bootstrap）');
  if (/`setInterval`/.test(wl.map(c => c[2]).join('\n'))) bad('白名单不应开放 setInterval');
  // 正文：凡出现定时器名字的行，必须同时写明许可位置或是禁令
  const OKCTX = /kernel\/scheduler\.mjs|bootstrap|WallTimerCap|ClientTimerCap|E-GLOBAL-UNLISTED|不在|禁/;
  let n = 0;
  lines.forEach((l, i) => { if (inHist(i) || inMig(i)) return; if (!TIMER.test(l)) return; n++; if (!OKCTX.test(l)) bad(`行 ${i + 1}：定时器出现在未写明许可位置的语境`); });
  // 墙钟不得进白名单；世界时间归卷二十
  for (const g of ['`Date`', '`performance`']) if (wl.some(c => (c[2] ?? '').includes(g))) bad(`白名单表不应开放 ${g}`);
  const tl = lines.find(l => l.startsWith('- **定时器**')) ?? '';
  for (const kw of ['kernel/scheduler.mjs', 'bootstrap', '卷二十', '`Date`', 'rules.ai.timeoutMs', '能力对象']) if (!tl.includes(kw)) bad(`第 0 条"定时器"一项缺：${kw}`);
  // 能力对象表：WallTimerCap 的构造者是 kernel/scheduler.mjs
  const wt = lines.find(l => l.startsWith('| `WallTimerCap` |')) ?? ''; if (!wt.split('|')[2]?.includes('`kernel/scheduler.mjs`')) bad('WallTimerCap 的构造者应为 kernel/scheduler.mjs');
  if (fail === before) log(`  OK 白名单表里定时器只在 kernel 行（限 kernel/scheduler.mjs）与 host 行（限 bootstrap）；正文 ${n} 行提到定时器，均写明许可位置或为禁令；Date/performance 未开放`);
}
// ---------- 26. digest 的来源 ----------
log('== 26 摘要来源');
{
  const before = fail;
  // node:crypto：白名单表只在 textcore 行，且限 textcore/digest.mjs；kernel 行只以"没有"出现
  for (const c of wl) { const cellTxt = (c[3] ?? '').replace(/没有 `node:crypto`/g, ''); if (cellTxt.includes('node:crypto') && c[0] !== 'textcore') bad(`白名单 ${c[0]} 行开放了 node:crypto`); }
  if (!/`node:crypto`（仅 `textcore\/digest\.mjs`/.test(wlRow('textcore')[3] ?? '')) bad('textcore 行的 node:crypto 未限定到 textcore/digest.mjs');
  if (!/没有 `node:crypto`/.test(wlRow('kernel')[3] ?? '')) bad('kernel 行应写明没有 node:crypto');
  // 正文凡提到 node:crypto 的行：要么指向 digest.mjs，要么是否定句
  let n = 0;
  lines.forEach((l, i) => { if (inHist(i) || inMig(i)) return; if (!l.includes('node:crypto')) return; n++; if (!/digest\.mjs|没有 `node:crypto`|不 import `node:crypto`|E-GLOBAL-UNLISTED/.test(l)) bad(`行 ${i + 1}：node:crypto 出现在 digest.mjs 之外的语境`); });
  // SubtleCrypto：只经 SubtleDigestCap 交给 open-envelope.mjs
  const sd = lines.find(l => l.startsWith('| `SubtleDigestCap` |')) ?? '';
  if (!/仅 `extension\/textcore\/open-envelope\.mjs`/.test(sd.split('|')[4] ?? '')) bad('SubtleDigestCap 应只交给 extension/textcore/open-envelope.mjs');
  const dg = lines.find(l => l.startsWith('| `DigestCap` |')) ?? '';
  if (!(dg.split('|')[2] ?? '').includes('`textcore/digest.mjs`')) bad('DigestCap 的构造者应为 textcore/digest.mjs');
  const al = lines.find(l => l.startsWith('- **摘要算法**')) ?? '';
  for (const kw of ['sha256', '只在服务端', '`node:crypto`', '`textcore/digest.mjs`', 'SubtleCrypto', '`extension/textcore/open-envelope.mjs`', '`DigestCap`']) if (!al.includes(kw)) bad(`第 0 条"摘要算法"一项缺：${kw}`);
  // 信封与 Sealed 的摘要算法只有 sha256
  lines.forEach((l, i) => { if (inHist(i)) return; if (/\b(md5|sha1|sha-1|sha512|crc32)\b/i.test(l)) bad(`行 ${i + 1}：出现 sha256 之外的摘要算法`); });
  // makeSealed 的调用者只有 textcore；豁免表 kernel/sealed.mjs 行用注入的 DigestCap
  const ms = lines.find(l => l.startsWith('| `kernel/sealed.mjs` |')) ?? ''; if (!ms.includes('`DigestCap`')) bad('豁免表 kernel/sealed.mjs 行应写明用注入的 DigestCap');
  if (!lines.some(l => l.includes('{screenId, text, digest}'))) bad('未定义已筛信封 {screenId, text, digest}');
  if (fail === before) log(`  OK node:crypto 只在 textcore 行并限 textcore/digest.mjs（正文 ${n} 行提及，均指向它或为否定句）；kernel 无 node:crypto、用注入的 DigestCap；客户端 SubtleCrypto 只经 SubtleDigestCap 交 open-envelope.mjs；全文只有 sha256`);
}
// ---------- 27. 已筛信封链条与装配文件 ----------
log('== 27 信封链条与装配文件');
{
  const before = fail;
  const s29 = lines.slice(s29a, s29b).join('\n');
  for (const kw of ['`output-gate/envelope-exit.mjs`', '`extension/host/net.mjs`', '`extension/dom-sink.mjs`', 'openEnvelope(envelope: Envelope, digestCap: SubtleDigestCap)', 'E-WIRE-ENVELOPE', 'E-PROC-IMPORT', '// assembly:optional inputEdge', '`input/http-entry.mjs`', '`kernel/transport/menu-entry.mjs`']) if (!s29.includes(kw)) bad('§2.9 缺：' + kw);
  // 类型登记表：客户端 Screened 的唯一产出者是 openEnvelope；Envelope 的唯一产出者是 narrowWire
  const tr = n => lines.find(l => l.startsWith('| ' + n + ' |')) ?? '';
  if (!tr('`Screened<Text>`（客户端）').split('|')[3]?.includes('`openEnvelope`')) bad('类型表：客户端 Screened<Text> 的产出者应为 openEnvelope');
  if (!tr('`Envelope`').split('|')[3]?.includes('`narrowWire`')) bad('类型表：Envelope 的产出者应为 narrowWire');
  if (!tr('`Screened<Text>`（服务端）').includes('（`gate/screen.mjs`；零命中才产出')) bad('类型表：服务端 Screened<Text> 的产出者应为 gate/screen.mjs');
  // 出口表：DOM 出口在客户端 display，下行出口在服务端 outputGate
  const xr = f => lines.find(l => l.startsWith('| `' + f + '` |') && l.split('|').length >= 7 && /（(服务端|客户端)）/.test(l.split('|')[2])) ?? '';
  if (!/display（客户端）/.test(xr('extension/dom-sink.mjs').split('|')[2] ?? '')) bad('DOM 出口应在客户端 display 组');
  if (!/outputGate（服务端）/.test(xr('output-gate/envelope-exit.mjs').split('|')[2] ?? '')) bad('下行出口应在服务端 outputGate 组');
  // 起名：规则层只发意图；nameSlot 已删
  lines.forEach((l, i) => { if (inHist(i)) return; if (/nameSlot/.test(l)) bad(`行 ${i + 1}：残留 nameSlot`); });
  const nm = lines.find(l => l.startsWith('- **玩家起名路径**')) ?? '';
  for (const kw of ['只发出命名意图', '凭 kernel 签发的凭证']) if (!nm.includes(kw)) bad('起名路径缺：' + kw);
  if (!lines.some(l => l.includes('`naming_intent {targetId, slotCode}`'))) bad('未定义命名意图事件 {targetId, slotCode}');
  // 哈希口径：只有一种；排除表三项
  if (lines.some((l, i) => !inHist(i) && /规则可读状态哈希/.test(l))) bad('残留"两种哈希"的说法');
  if (fail === before) log('  OK 下行出口、客户端入口、DOM 出口、信封校验、装配文件可缺行与两条上行入口都在 §2.9；客户端 Screened<Text> 只由 openEnvelope 产出；nameSlot 已清，起名为"规则层只发意图"');
}
// ---------- 28. 引文同一性函数只出现在 aiGate ----------
log('== 28 引文同一性只在 aiGate');
{
  const before = fail;
  const FN = 'matchQuote';
  // (a) 例外清单是闭集三项，matchQuote 那一行的文件在 ai-gate/
  const li = lines.findIndex(l => l.startsWith('- **文字检查例外清单（唯一定义）**'));
  if (!(li > s29a && li < s29b)) bad('§2.9 内没有"文字检查例外清单（唯一定义）"');
  const ex = tableAfterLine(li).map(cellsOf);
  if (ex.length !== 3) bad(`例外清单应恰三项，实得 ${ex.length}`);
  const fns = ex.map(r => (r[1].match(/`([A-Za-z]+)`/) ?? [])[1]);
  if (JSON.stringify(fns) !== JSON.stringify(['matchBlocklist', 'matchIdLeak', FN])) bad('例外清单三项应为 matchBlocklist、matchIdLeak、matchQuote，实得 ' + fns.join(','));
  const qr = ex.find(r => r[1].includes('`' + FN + '`')) ?? [];
  if (!/（`ai-gate\/quote-identity\.mjs`）/.test(qr[1] ?? '')) bad('matchQuote 的所在文件应为 ai-gate/quote-identity.mjs');
  if (!/AI/.test(qr[2] ?? '') || !/引文/.test(qr[2] ?? '')) bad('matchQuote 的 needle 应取自 AI 引文');
  if (!/`RawText`/.test(qr[3] ?? '')) bad('matchQuote 的被查文本应为本轮 RawText');
  if (!(qr[4] ?? '').includes('`reject:quote_mismatch`')) bad('matchQuote 的输出应为固定代号 reject:quote_mismatch');
  // (b) 单点定义：带签名的定义恰一处，且在 §2.9
  const defs = lines.map((l, i) => !inHist(i) && l.includes(FN + '(quote: AiQuote, turn: TurnText)') ? i : -1).filter(i => i >= 0); // 第十四版：两端改为专用类型
  if (defs.length !== 1 || !(defs[0] > s29a && defs[0] < s29b)) bad(`matchQuote 的带签名定义应恰一处且在 §2.9，实得 ${defs.length} 处`);
  const dl = lines[defs[0]] ?? '';
  if (!dl.includes('`ai-gate/quote-identity.mjs`')) bad('定义行未写明只在 ai-gate/quote-identity.mjs');
  const block = lines.slice(lines.findIndex(l => l.startsWith('- **引文同一性（唯一定义）**')), s29b).join('\n');
  for (const kw of ['连续子串', '①②③', '逐码点', '不写 state', '不进哈希', '规则层不得 import', '`reject:quote_mismatch`']) if (!block.includes(kw)) bad('引文同一性定义缺：' + kw);
  for (const kw of ['模糊', '语义', '关键词', '正则', '分词']) if (!new RegExp(kw).test(block)) bad('引文同一性的禁止手段缺：' + kw);
  // (c) 全文（历史区除外）凡出现 matchQuote 或 quote-identity 的行，都在 aiGate 语境里
  let n = 0;
  lines.forEach((l, i) => { if (inHist(i)) return; if (!l.includes(FN) && !l.includes('quote-identity')) return; n++; if (!/aiGate|ai-gate\//.test(l)) bad(`行 ${i + 1}：matchQuote 出现在 aiGate 之外的语境`); });
  // (d) 不登记进 kernelApi；矩阵里任何一格都不向别的组开放它；别组的闭集行里不出现它
  if (lines.some(l => /^\s*\{"export":/.test(l) && l.includes(FN))) bad('matchQuote 不得登记进 kernelApi');
  const s27 = sec(/^### 2\.7/, /^### 2\.8/);
  for (const l of s27) if (/^\| (kernel|规则层|textcore|inputEdge|gate|outputGate|装配文件|host|display|clientTextcore)[（ |]/.test(l) && l.includes(FN)) bad('矩阵里 aiGate 之外的行出现 matchQuote：' + l.slice(0, 30));
  const s28 = sec(/^### 2\.8/, /^### 2\.9/);
  for (const l of s28) if (/^\| `?(inputEdge|gate|outputGate|kernel|textcore|clientTextcore|host|display)`?/.test(l) && /quote-identity|matchQuote/.test(l)) bad('§2.8 表 aiGate 之外的行出现 matchQuote：' + l.slice(0, 30));
  // (e) §2.9 之外提到它的行必须引用 §2.9 第 6 条（只引用，不另写规则）
  lines.forEach((l, i) => { if (inHist(i) || (i >= s29a && i < s29b)) return; const gIdx = lines.findIndex(x => x.startsWith('## 附录 G')); if (i >= gIdx) return; if ((l.includes(FN) || l.includes('引文同一性')) && !/§2\.9 第 6 条/.test(l)) bad(`行 ${i + 1}：§2.9 之外提到引文同一性而未引用 §2.9 第 6 条`); });
  if (fail === before) log(`  OK 例外清单恰三项（matchBlocklist、matchIdLeak、matchQuote）；matchQuote 带签名定义 1 处，在 §2.9 第 6 条，文件 ai-gate/quote-identity.mjs；全文 ${n} 行提及，均在 aiGate 语境；未进 kernelApi，矩阵与 §2.8 其他组的行里不出现；§2.9 之外各处均为引用`);
}
// ================= 第十四版新增（收口终改，李白条件 2） =================
// 公共：两张导出表、文件归组、服务端矩阵、按表头取表
const parseApi = (key) => { const a = lines.findIndex(l => new RegExp('^\\s*"' + key + '":\\s*\\{"exports":\\s*\\[').test(l)); const out = []; for (let j = a + 1; a >= 0 && j < lines.length && !/^\s*\]\},/.test(lines[j]); j++) { try { out.push(JSON.parse(lines[j].trim().replace(/,$/, ''))); } catch { bad(key + ' 条目不是可解析的 JSON：' + lines[j].trim().slice(0, 60)); } } return out; };
const kApi = parseApi('kernelApi'), gApi = parseApi('groupApi');
const allApi = [...kApi, ...gApi];
const fileOf = e => e.export.split('#')[0], nameOf = e => e.export.split('#')[1];
const groupOfFile = f => f.startsWith('kernel/') ? 'kernel' : f.startsWith('textcore/') ? 'textcore' : f.startsWith('input/') ? 'inputEdge' : f.startsWith('gate/') ? 'gate' : f.startsWith('output-gate/') ? 'outputGate' : f.startsWith('ai-gate/') ? 'aiGate' : f === 'index.mjs' ? 'assembly' : f.startsWith('extension/host/') ? 'host' : f.startsWith('extension/') ? 'display' : 'rules';
const apiByName = n => allApi.filter(e => nameOf(e) === n);
const sameArr = (a, b) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...b].sort());
const mayCall = (callerFile, name) => apiByName(name).some(e => { const cg = groupOfFile(callerFile); if (groupOfFile(fileOf(e)) === cg) return true; if (e.callerFiles) return e.callerFiles.includes(callerFile); return cg !== 'assembly' && (e.callers.includes('*') || e.callers.includes(cg)); });
const s27m = sec(/^### 2\.7/, /^### 2\.8/); const mh = s27m.findIndex(l => /^\| 调用方/.test(l));
const mcols = cellsOf(s27m[mh] ?? ''); const mrows = []; for (let j = mh + 2; mh >= 0 && j < s27m.length && /^\|/.test(s27m[j]); j++) mrows.push(cellsOf(s27m[j]));
const mcell = (rowName, col) => (mrows.find(r => r[0].startsWith(rowName)) ?? [])[mcols.indexOf(col)] ?? '';
const ticks = s => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);
const mjsIn = s => ticks(s).filter(t => /\.mjs$/.test(t));
const typeRow = n => cellsOf(lines.find(l => l.startsWith('| `' + n + '` |') && l.includes('types.d.ts')) ?? '');
const capRow = n => cellsOf(lines.find((l, i) => i > s29a && i < s29b && l.startsWith('| `' + n + '`')) ?? '');
const live = (re) => lines.map((l, i) => !inHist(i) && re.test(l) ? i + 1 : 0).filter(Boolean);
for (const e of gApi) {
  if (!/^[a-z\-\/]+\.mjs#[A-Za-z]+$/.test(e.export ?? '')) bad('groupApi 导出名不是"文件#导出名"：' + e.export);
  if (groupOfFile(fileOf(e)) === 'kernel') bad('groupApi 不得登记 kernel 的导出：' + e.export);
  const who = e.callers ?? e.callerFiles; if (!Array.isArray(who) || !who.length || (e.callers && e.callerFiles)) bad('groupApi 须有 callers 或 callerFiles 之一：' + e.export);
  for (const c of e.callers ?? []) if (!['textcore', 'gate', 'outputGate', 'aiGate', 'inputEdge'].includes(c)) bad(`groupApi ${e.export} 的 callers 含未知组键或通配 ${c}`);
  if ((e.callers ?? []).includes('rules')) bad('groupApi 不得对规则层开放：' + e.export);
}
if (new Set(gApi.map(e => e.export)).size !== gApi.length) bad('groupApi 有重复条目');

// ---------- 29. 回应通路每一环都合规 ----------
log('== 29 回应通路逐环核对');
{
  const before = fail;
  const d0 = lines.findIndex(l => l.startsWith('- **回应通道（唯一定义）**'));
  if (!(d0 > s29a && d0 < s29b)) bad('§2.9 内没有"回应通道（唯一定义）"');
  const ti = lines.findIndex((l, i) => i > d0 && l.includes('**通路六环**'));
  const rings = tableAfterLine(ti).map(cellsOf); // [环, 调用方文件, 方式, 被调用的名字, 被调用方文件, 交出的类型]
  // 第十五版：补存档导出、导入两条路由的支路 2c、2d、5s、6s（终核 X1）
  if (JSON.stringify(rings.map(r => r[0])) !== JSON.stringify(['1', '2a', '2b', '2c', '2d', '3', '4', '5', '5s', '6', '6s'])) bad('通路表的环应为 1、2a、2b、2c、2d、3、4、5、5s、6、6s，实得 ' + rings.map(r => r[0]).join(','));
  const ring = id => rings.find(r => r[0] === id) ?? ['', '', '', '', '', ''];
  const callerOf = id => mjsIn(ring(id)[1])[0] ?? '', calleesOf = id => mjsIn(ring(id)[4]);
  const upDown = tableAfterLine(lines.findIndex(l => l.startsWith('- **信任边界在 HTTP 通道上**'))).map(cellsOf);
  const entryRows = tableAfterLine(lines.findIndex(l => l.startsWith('- **登记边界入口表**'))).map(cellsOf);
  const exitRows = tableAfterLine(lines.findIndex(l => l.startsWith('- **登记出口表**'))).map(cellsOf);
  const reqCap = capRow('RequestCap'), replyCapGiven = (reqCap[3] ?? '').split('`ReplyCap`')[1] ?? '';
  for (const r of rings) {
    const id = r[0], caller = callerOf(id), callees = calleesOf(id), way = r[2], names = ticks(r[3]);
    if (!caller || !callees.length) { bad(`第 ${id} 环缺调用方或被调用方文件`); continue; }
    if (way === 'kernelApi') {
      const n = names[0]; const es = kApi.filter(e => nameOf(e) === n);
      if (es.length !== 1) bad(`第 ${id} 环：${n} 不在 kernelApi`);
      else { if (fileOf(es[0]) !== callees[0]) bad(`第 ${id} 环：${n} 的所在文件与 kernelApi 不符`); if (!mayCall(caller, n)) bad(`第 ${id} 环：kernelApi 不允许 ${caller} 调用 ${n}`); if (groupOfFile(caller) === 'kernel') bad(`第 ${id} 环：同组调用不应标 kernelApi`); }
      const cellTxt = mcell(groupOfFile(caller), 'kernel'); if (!cellTxt.startsWith('是') || !cellTxt.includes('`' + n + '`')) bad(`第 ${id} 环：矩阵 ${groupOfFile(caller)} 行 kernel 格未写明 ${n}`);
    } else if (way === '组内 import') {
      if (groupOfFile(caller) !== groupOfFile(callees[0])) bad(`第 ${id} 环：标"组内 import"但 ${caller} 与 ${callees[0]} 不同组`);
    } else if (way === '登记回调') {
      const reg = names[0]; const es = kApi.filter(e => nameOf(e) === reg);
      if (es.length !== 1 || !sameArr(es[0].callerFiles, callees)) bad(`第 ${id} 环：登记函数 ${reg} 应在 kernelApi 且只对 ${callees.join(',')} 开放`);
      else if (fileOf(es[0]) !== caller) bad(`第 ${id} 环：登记函数 ${reg} 不在调用方文件 ${caller} 里`);
      const cellTxt = mcell(groupOfFile(callees[0]), 'kernel'); if (!cellTxt.includes('`' + reg + '`')) bad(`第 ${id} 环：矩阵 ${groupOfFile(callees[0])} 行 kernel 格未写明 ${reg}`);
      if (mcell(groupOfFile(caller), groupOfFile(callees[0]))) bad(`第 ${id} 环：回调方向上 ${groupOfFile(caller)} 不得 import ${groupOfFile(callees[0])}`);
    } else if (way === '能力对象') {
      const cap = names[0]; if (!['RequestCap', 'ReplyCap'].includes(cap)) bad(`第 ${id} 环：未登记的能力对象 ${cap}`);
      if (!mjsIn(reqCap[1] ?? '').includes('kernel/transport/router-caps.mjs')) bad('能力对象表：RequestCap/ReplyCap 的构造者应为 kernel/transport/router-caps.mjs');
      if (cap === 'RequestCap') { if (caller !== 'kernel/transport/router-caps.mjs') bad(`第 ${id} 环：RequestCap 的持有者应为构造者文件`); const given = mjsIn((reqCap[3] ?? '').split('`ReplyCap`')[0]); if (!sameArr(given, callees)) bad(`第 ${id} 环：RequestCap 交给的入口（${given.join(',')}）与通路表（${callees.join(',')}）不符`); for (const f of callees) if (!entryRows.some(e => mjsIn(e[0]).includes(f) && e[2].includes('`ReplyHandle`'))) bad(`第 ${id} 环：入口表 ${f} 行未写明收到 ReplyHandle`); }
      if (cap === 'ReplyCap') { if (callees[0] !== 'kernel/transport/router-caps.mjs') bad(`第 ${id} 环：ReplyCap 的实现应在构造者文件`); const given = mjsIn(replyCapGiven); const senders = [callerOf('5'), callerOf('5s')]; if (!sameArr(given, senders) || !sameArr(senders, ['output-gate/envelope-exit.mjs', 'kernel/save.mjs'])) bad(`第 ${id} 环：ReplyCap 只应交第 5、5s 环的两个调用方（envelope-exit 与 kernel/save.mjs），实为 ${given.join(',')}`); const xr = exitRows.find(e => mjsIn(e[0]).includes(caller)); if (id === '5') { if (!xr || !xr[2].includes('`ReplyCap`') || !xr[2].includes('respond(reply, payload)')) bad(`第 ${id} 环：出口表 ${caller} 行未写明经 ReplyCap 的 respond(reply, payload)`); } else { if (!xr || !xr[2].includes('`ReplyCap`') || !xr[2].includes('`send`') || !xr[2].includes('`postReply`') || !xr[2].includes('save_export')) bad(`第 ${id} 环：出口表 ${caller} 行未写明 save_export 成功经 ReplyCap 的 send、失败改走 postReply`); } }
    } else if (way === 'HTTP') {
      const isSave = id === '6s';
      const down = isSave ? upDown.find(u => u[0] === '下行' && u[1].includes('`save_export`') && u[2].includes('`bytes`')) : upDown.find(u => u[0] === '下行' && u[2].includes('wire-down')); if (!down || !mjsIn(down[3]).includes(callerOf(isSave ? '5s' : '5')) || !mjsIn(down[4]).includes(callees[0])) bad(`第 ${id} 环：通道表下行一行的发出方/接收方与通路表不符`);
      if (!entryRows.some(e => mjsIn(e[0]).includes(callees[0]))) bad(`第 ${id} 环：客户端接收文件不在登记入口表`);
    } else bad(`第 ${id} 环：未知的方式"${way}"`);
  }
  // 环环相接
  const link = (a, bs) => { const cs = calleesOf(a); for (const b of bs) if (!cs.includes(callerOf(b))) bad(`第 ${a} 环的被调用方接不上第 ${b} 环的调用方`); };
  link('1', ['2a', '2b', '2c', '2d', '5s']); link('2a', ['3']); link('2b', ['3']); link('2c', ['3']); link('2d', ['3']); link('3', ['4']); link('4', ['5']); link('5', ['6']); link('5s', ['6s']);
  if (groupOfFile(callerOf('2a')) !== 'kernel' || groupOfFile(callerOf('2b')) !== 'inputEdge') bad('第 2 环的两个调用方应分别在 kernel 与 inputEdge');
  if (groupOfFile(callerOf('4')) !== 'outputGate' || groupOfFile(callerOf('5')) !== 'outputGate') bad('第 4、5 环的调用方应在 outputGate');
  // 第十五版：存档两路。导出入口 kernel/save.mjs 成功走 5s、失败走 2c；导入入口 kernel/load/save.mjs 走 2d；四条路由各有入口
  if (callerOf('2c') !== 'kernel/save.mjs' || callerOf('5s') !== 'kernel/save.mjs') bad('第 2c、5s 环的调用方应同为 kernel/save.mjs（导出失败与成功两条返回路径）');
  if (callerOf('2d') !== 'kernel/load/save.mjs') bad('第 2d 环的调用方应为 kernel/load/save.mjs（导入）');
  if (!ring('2c')[1].includes('失败') || !ring('5s')[1].includes('成功')) bad('第 2c、5s 环应分别注明只在导出失败、成功时');
  for (const rt of ['menu', 'input', 'save_export', 'save_import']) { if (!ring('1')[4].includes('`' + rt + '` 路由')) bad(`第 1 环缺 ${rt} 路由的入口`); if (!upDown.some(u => u[0] === '上行' && u[1] === '`' + rt + '`')) bad(`通道表缺上行 ${rt} 一行`); }
  const enumLine = lines.find(l => l.includes('`wire_route`（')) ?? ''; if (!enumLine.includes('`wire_route`（menu input save_export save_import；')) bad('§1.9 封闭枚举 wire_route 应为四值 menu input save_export save_import');
  if (!enumLine.includes('`wire_body`（envelope bytes；')) bad('§1.9 封闭枚举缺 wire_body（envelope bytes）');
  if (calleesOf('6s')[0] !== 'extension/host/bootstrap.mjs' || !ring('6s')[4].includes('`DownloadCap`')) bad('第 6s 环的接收方应为 bootstrap 的 DownloadCap');
  const sv4 = lines.findIndex(l => l.includes('**存档四路（唯一定义）**')); if (!(sv4 > d0 && sv4 < s29b)) bad('回应通道项下没有"存档四路（唯一定义）"');
  { let e4 = sv4 + 1; while (e4 < lines.length && /^ {4}\d\. /.test(lines[e4])) e4++; const blk4 = lines.slice(sv4, e4).join('\n'); if (e4 - sv4 - 1 !== 5) bad(`存档四路应写成五点，实得 ${e4 - sv4 - 1}`); for (const kw of ['`menu` 路由上的动作', '启动时自动读档', '`clockMinute`', '不读墙钟', '恰好用这个句柄一次', '不调 `postReply`', '`FilePickCap`', '`narrow`', 'R27-4.3', '第 2d 环']) if (!blk4.includes(kw)) bad('存档四路缺：' + kw); }
  if (live(/由装配文件(在调用存档出口时)?(作为[^。；]{0,12})?传入/).filter(n => !lines[n - 1].includes('不由装配文件传入')).length) bad('残留"存档显示参数由装配文件传入"的旧说法');
  // 类型：到 outputGate 之前没有任何文字类型
  for (const id of ['1', '2a', '2b', '2c', '2d', '3']) if (/Text|Sealed/.test(ring(id)[5])) bad(`第 ${id} 环交出的类型里出现文字类型`);
  if (/`Text`|Screened/.test(ring('5s')[5]) || /`Text`|Screened/.test(ring('6s')[5])) bad('第 5s、6s 环交出的是存档字节，不得含 Text');
  if (!ring('4')[5].includes('`Screened<Text>`')) bad('第 4 环交出的下行载荷应含 Screened<Text>');
  if (!ring('5')[5].includes('已筛信封')) bad('第 5 环交出的应是已筛信封');
  // 没有新增 import：kernel 只进 kernel；inputEdge 不进 outputGate；outputGate 不进 inputEdge
  for (const c of mcols.slice(2, -1)) if (mcell('kernel', c)) bad(`kernel 行 ${c} 格应为空`);
  if (mcell('inputEdge', 'outputGate')) bad('inputEdge 不得 import outputGate');
  if (mcell('outputGate', 'inputEdge')) bad('outputGate 不得 import inputEdge');
  // postReply / onReply / respond 的调用者
  const pr = kApi.find(e => nameOf(e) === 'postReply'); if (!pr || !sameArr(pr.callerFiles, [callerOf('2b')])) bad('kernelApi postReply 应只对 input/http-entry.mjs 开放');
  if (allApi.some(e => nameOf(e) === 'respond')) bad('respond 不得登记为跨组导出');
  const dl = lines[d0 + 1] ?? '';
  for (const kw of ['`ReplyHandle`', '`ReplyResult`', '没有任何文字字段', '`kernel/transport/reply-channel.mjs`']) if (!dl.includes(kw)) bad('回应通道"三样东西"一项缺：' + kw);
  const seg = lines.slice(d0, lines.findIndex((l, i) => i > d0 && l.startsWith('- **玩家键入的文字怎样上行**'))).join('\n');
  for (const kw of ['E-WIRE-REPLY', '恰好调一次', '恰好登记一次', 'G4']) if (!seg.includes(kw)) bad('回应通道定义缺：' + kw);
  const rh = typeRow('ReplyHandle'); if (!(rh[2] ?? '').includes('`kernel/transport/router-caps.mjs`')) bad('类型表：ReplyHandle 的产出者应为 kernel/transport/router-caps.mjs');
  if (live(/放进响应/).length) bad('残留"inputEdge 把它放进响应"的旧说法：行 ' + live(/放进响应/).join(','));
  if (live(/respond\(payload\)/).length) bad('残留 respond(payload) 旧签名：行 ' + live(/respond\(payload\)/).join(','));
  if (lines.filter(l => l.includes('回应通道（唯一定义）')).length !== 2) bad('"回应通道（唯一定义）"应恰出现两次（定义处与附录 G 锚点）');
  // 第十五版：菜单回合叙述（终核 X3）——narrate 不带 TurnText、不是跨组导出，经 NarrateCap 由 mountNarration 注入 reply-composer
  { const nc = capRow('NarrateCap'); if (!mjsIn(nc[1] ?? '').includes('ai-gate/narrate.mjs') || !(nc[2] ?? '').includes('narrate(result: ReplyResult)') || !/^仅 `output-gate\/reply-composer\.mjs`/.test(nc[3] ?? '') || !(nc[3] ?? '').includes('`mountNarration`')) bad('能力对象表：NarrateCap 应由 ai-gate/narrate.mjs 构造、包 narrate(result: ReplyResult)、经 mountNarration 只交 output-gate/reply-composer.mjs');
    if (/Text/.test(nc[2] ?? '') && !/不交回文字/.test(nc[2] ?? '')) bad('NarrateCap 不得交回文字');
    if (allApi.some(e => nameOf(e) === 'narrate')) bad('narrate 不得登记为跨组导出（只经 NarrateCap）');
    const mn = gApi.find(e => nameOf(e) === 'mountNarration'); if (!mn || groupOfFile(fileOf(mn)) !== 'outputGate' || !sameArr(mn.callerFiles, ['index.mjs'])) bad('groupApi：mountNarration 应是 outputGate 的导出且只对 index.mjs 开放');
    if (mcell('outputGate', 'aiGate') || mcell('aiGate', 'outputGate')) bad('outputGate 与 aiGate 不得互相 import');
    const n0 = lines.findIndex(l => l.includes('**菜单回合的叙述与对白（唯一定义）**')); if (!(n0 > d0 && n0 < s29b)) bad('回应通道项下没有"菜单回合的叙述与对白（唯一定义）"');
    let n1 = n0 + 1; while (n1 < lines.length && /^ {4}\d\. /.test(lines[n1])) n1++; const nb = lines.slice(n0, n1).join('\n'); if (n1 - n0 - 1 !== 5) bad(`菜单回合的叙述与对白应写成五点，实得 ${n1 - n0 - 1}`);
    for (const kw of ['`narrate(result: ReplyResult)`', '`NarrateCap`', '`mountNarration`', '互不 import', '结果代号', '决定卡代号', 'T0 模板', '运行期没有 AI 记录文字（卷九 R9-9.9）', '至多发一次', '不得声明 `quote` 字段']) if (!nb.includes(kw)) bad('菜单回合的叙述与对白缺：' + kw); // 卷九勘误 11-13：勘1 删 records.*.text，第 4 点锚点照现文
    if (!ring('4')[1].includes('reply-composer') || !lines.some((l, i) => i > d0 && i < s29b && l.includes('第 4 环') && l.includes('`NarrateCap`'))) bad('第 4 环的规矩未写明 reply-composer 调 NarrateCap');
    if (live(/后台叙述/).length) bad('残留"后台叙述"的旧说法：行 ' + live(/后台叙述/).join(','));
    const ap = kApi.find(e => nameOf(e) === 'registerAdvancePlan'); if (!ap || !sameArr(ap.callers, ['rules']) || fileOf(ap) !== 'kernel/advance-registry.mjs') bad('kernelApi：registerAdvancePlan 应在 kernel/advance-registry.mjs 且只对规则层开放');
    // 第十六版：这一项分成多行（心跳推进四条另起行），取到下一个同级列表项为止的整块
    const pl0 = lines.findIndex((l, i) => i > d0 && i < s29b && l.includes('**推进计划与心跳推进**')); let pl1 = pl0 + 1; while (pl0 >= 0 && pl1 < lines.length && !/^ {0,2}- /.test(lines[pl1])) pl1++;
    const pl = pl0 < 0 ? '' : lines.slice(pl0, pl1).join('\n'); for (const kw of ['`registerAdvancePlan(provider)`', '`kernel/scheduler.mjs`', '不 import 规则层', '`WallTimerCap.heartbeat`', '不回应']) if (!pl.includes(kw)) bad('推进计划与心跳推进缺：' + kw);
    // 心跳推进的结果怎样带出（2026-11-15 脚本误报修正：原锚点写死“下一次菜单响应”五字，卷二按终核2 小项 2 改说法即误报）。
    // 按结构核：本块有一句同时写“事件序号区间”与“下一次……响应的 `ReplyResult`”（哪一环的响应不限）；
    // 且回应通道“三样东西”里 `ReplyResult` 的字段定义写着“心跳推进产生的事件序号区间”，两处说的是同一字段。
    if (!pl.split(/(?<=。)/).some(s => s.includes('事件序号区间') && /下一次[^。；]{0,16}响应[^。；]{0,6}`ReplyResult`/.test(s))) bad('推进计划与心跳推进缺：心跳推进的事件序号区间随下一次响应的 `ReplyResult` 带出');
    if (!/`ReplyResult`[^\n]*心跳推进产生的事件序号区间/.test(dl)) bad('回应通道"三样东西"：`ReplyResult` 的字段定义缺"心跳推进产生的事件序号区间"');
  }
  if (fail === before) log(`  OK 通路 ${rings.length} 行逐环核对（含存档导出、导入支路 2c、2d、5s、6s；四条路由各有入口；NarrateCap 经 mountNarration 注入 reply-composer，narrate 不是跨组导出；registerAdvancePlan 已登记）：kernelApi 环的调用者在登记文件内且矩阵格写明，登记回调环不产生反向 import，能力对象环与能力对象表、入口表、出口表一致，HTTP 环与通道表一致；环环相接；进 outputGate 之前交出的类型不含文字；kernel 与 inputEdge 对 outputGate 的矩阵格为空`);
}
// ---------- 30. 子串函数的参数类型里不出现 labels ----------
log('== 30 子串函数签名');
{
  const before = fail;
  const d0 = lines.findIndex(l => l.startsWith('- **子串函数签名表（唯一定义）**'));
  if (!(d0 > s29a && d0 < s29b)) bad('§2.9 内没有"子串函数签名表（唯一定义）"');
  const rows = tableAfterLine(d0).map(cellsOf); // [函数, 形参与类型, needle 的类型与唯一来路, 可调用的文件]
  const fns = rows.map(r => ticks(r[0])[0]);
  const matcherExports = gApi.filter(e => fileOf(e) === 'gate/matcher.mjs').map(nameOf);
  if (!sameArr(fns, ['matchBlocklist', 'matchIdLeak', 'containsCodePoints'])) bad('签名表应恰为 matchBlocklist、matchIdLeak、containsCodePoints，实得 ' + fns.join(','));
  if (!sameArr(matcherExports, fns)) bad(`gate/matcher.mjs 在 groupApi 的导出（${matcherExports.join(',')}）与签名表不一致`);
  const NEEDLE_OK = ['BlockNeedle', 'AiQuote'], HAY_OK = ['Text', 'TurnText'], OTHER_OK = ['DisplayLang']; // 锚点改：李白 11-14 Q29-1 裁定显示语言与世界内语言分开登记，matchBlocklist 的语言形参改为 DisplayLang（卷二封卷勘误 9886d430）；签名表无世界内语言形参，不再放行 Handle<language>
  for (const r of rows) {
    const fn = ticks(r[0])[0]; const sig = ticks(r[1])[0] ?? '';
    if (/labels|Map</.test(r.join('|'))) bad(`${fn} 一行出现 labels 或 Map 类型`);
    const params = [...sig.matchAll(/(\w+): ([A-Za-z]+(?:<[a-z_]+>)?)/g)].map(m => ({ name: m[1], type: m[2] }));
    if (!params.length) bad(`${fn} 的形参没有写类型`);
    for (const p of params) if (![...NEEDLE_OK, ...HAY_OK, ...OTHER_OK].includes(p.type)) bad(`${fn} 的形参 ${p.name} 类型 ${p.type} 不在允许清单`);
    const needleType = ticks(r[2])[0] ?? '';
    const isCode = r[2].startsWith('代号（`EntityId` 与 `Handle`）');
    if (!isCode && !NEEDLE_OK.includes(needleType)) bad(`${fn} 的 needle 类型 ${needleType} 不在允许清单（BlockNeedle / AiQuote / 代号）`);
    if (needleType === 'Text' || /`Text`/.test(r[2])) bad(`${fn} 的 needle 一栏出现 Text（labels 的值类型）`);
    const needleIsParam = !r[2].includes('不是形参');
    if (needleIsParam) { const np = params.filter(p => NEEDLE_OK.includes(p.type)); if (np.length !== 1 || np[0].type !== needleType) bad(`${fn} 的 needle 形参类型与 needle 一栏不符`); if (params.some(p => p.type === 'Text')) bad(`${fn} 收 needle 形参的同时还收普通 Text`); }
    else if (params.some(p => NEEDLE_OK.includes(p.type))) bad(`${fn} 写明 needle 不是形参，形参里却有 needle 类型`);
    const e = gApi.find(x => nameOf(x) === fn);
    if (e?.callerFiles) { if (!sameArr(mjsIn(r[3]), e.callerFiles) || !r[3].startsWith('仅')) bad(`${fn} 的可调用文件与 groupApi 不符`); }
    else if (e) { const gs = r[3].split('、').map(s => s.trim()); if (!sameArr(gs, e.callers)) bad(`${fn} 的可调用组（${gs.join(',')}）与 groupApi（${e.callers.join(',')}）不符`); }
  }
  const cc = rows.find(r => ticks(r[0])[0] === 'containsCodePoints') ?? [];
  if ((ticks(cc[1] ?? '')[0] ?? '') !== '(turn: TurnText, quote: AiQuote)') bad('containsCodePoints 的形参应恰为 (turn: TurnText, quote: AiQuote)');
  const ce = gApi.find(x => nameOf(x) === 'containsCodePoints'); if (!ce || !sameArr(ce.callerFiles, ['ai-gate/quote-identity.mjs'])) bad('groupApi：containsCodePoints 应只对 ai-gate/quote-identity.mjs 开放');
  // needle 类型的唯一来路
  const bn = typeRow('BlockNeedle'); if (!(bn[2] ?? '').includes('`gate/load-blocklist.mjs`') || !(bn[1] ?? '').includes('不是 `Text` 的子类型也不是父类型')) bad('类型表：BlockNeedle 应只由 gate/load-blocklist.mjs 产出，且与 Text 互不相容');
  const aq = typeRow('AiQuote'); if (!(aq[2] ?? '').includes('brandQuote(raw: RawText): AiQuote') || !(aq[1] ?? '').includes('`Text` 的子类型')) bad('类型表：AiQuote 应只由 brandQuote(raw: RawText) 产出');
  const bq = gApi.find(x => nameOf(x) === 'brandQuote'); if (!bq || !sameArr(bq.callerFiles, ['ai-gate/parse.mjs'])) bad('groupApi：brandQuote 应只对 ai-gate/parse.mjs 开放');
  // labels 的值类型是 Text；读 labels 的组里没有 gate 与 aiGate
  const entryRows = tableAfterLine(lines.findIndex(l => l.startsWith('- **登记边界入口表**'))).map(cellsOf);
  const lr = lines.find((l, i) => i > s29a && i < s29b && l.startsWith('| `textcore/labels.mjs` |')); { // 锚点改：李白 11-14 C29-3 恢复自然写法（49647434），值类型写成 `Map<EntityId|Handle, Map<形态, Text>>` 加"内外两层都冻结"；判据不变：值类型 Text 且冻结，并须写明两张冻结表形状与只读白名单
    const rd = lr ? lr.slice(0, lr.indexOf('两张冻结表')) : ''; const out = lr ? lr.slice(lr.indexOf('两张冻结表'), lr.indexOf('labels schema')) : '';
    // C29-3 余项 A1：冻结须落在值类型那一层——只查值类型 `Map<EntityId|Handle, Map<形态, Text>>` 之后到下一个"；"或格界之前的文字（现文为"内外两层都冻结"）
    const vt = '`Map<EntityId|Handle, Map<形态, Text>>`'; const vi = out.indexOf(vt); const vtail = vi < 0 ? '' : out.slice(vi + vt.length); const vcut = vtail.search(/[；|]/); const vseg = vcut < 0 ? vtail : vtail.slice(0, vcut);
    if (!lr || vi < 0 || !/冻结/.test(vseg) || !out.includes('代号 → 形态 → `Text`') || !out.includes('模板代号 → 变体代号 → 段列表或选择结构') || !rd.includes('只读白名单')) bad('入口表：labels 的值类型应写明为 Text（Map<形态, Text> 冻结），并写明两张冻结表形状与只读白名单'); }
  const le = gApi.find(x => nameOf(x) === 'labels'); if (!le || !sameArr(le.callers, ['inputEdge', 'outputGate'])) bad('groupApi：labels 的读者应只有 inputEdge 与 outputGate');
  for (const g of ['gate', 'aiGate']) if (/labels/.test(mcell(g, 'textcore'))) bad(`矩阵 ${g} 行 textcore 格出现 labels`);
  const br = entryRows.find(e => mjsIn(e[0]).includes('gate/load-blocklist.mjs')); if (!br || !br[3].includes('{word: BlockNeedle, category}')) bad('入口表：blocklist 词条的类型应为 BlockNeedle');
  // 矩阵里只有 aiGate 行提到 containsCodePoints；旧签名不得残留
  for (const r of mrows) if (!r[0].startsWith('aiGate') && r.join('|').includes('containsCodePoints')) bad('矩阵 aiGate 之外的行出现 containsCodePoints：' + r[0]);
  const old = live(/containsCodePoints\(haystack, needle\)/); if (old.length) bad('残留 containsCodePoints(haystack, needle) 旧签名：行 ' + old.join(','));
  if (fail === before) log(`  OK 子串函数 ${rows.length} 个与 gate/matcher.mjs 的 groupApi 导出一致；needle 类型只有 BlockNeedle、AiQuote 与代号，没有 Text；形参类型不出现 labels 或 Map；containsCodePoints 形参为 (turn: TurnText, quote: AiQuote)，只对 ai-gate/quote-identity.mjs 开放；labels 的值类型是 Text，读者不含 gate 与 aiGate`);
}
// ---------- 31. turnText 的来路闭合 ----------
log('== 31 本轮原文来路');
{
  const before = fail;
  const HTTP = 'input/http-entry.mjs';
  // (a) 类型：唯一产出者、子类型、位置规则
  const tt = typeRow('TurnText');
  if (!(tt[2] ?? '').includes('brandTurn(raw: RawText): TurnText')) bad('类型表：TurnText 的唯一产出者应为 brandTurn(raw: RawText): TurnText');
  if (!(tt[1] ?? '').includes('`Text` 的子类型')) bad('类型表：TurnText 应是 Text 的子类型');
  for (const kw of ['返回值都不是 `TurnText`', '`ops.mjs`', '`screen`', '`unseal`']) if (!(tt[2] ?? '').includes(kw)) bad('类型表 TurnText 行应写明其他函数的返回值不是 TurnText，缺：' + kw);
  for (const kw of ['模块级变量', '对象属性', '返回值', '形参']) if (!(tt[4] ?? '').includes(kw)) bad('类型表 TurnText 行的位置规则缺：' + kw);
  // (b) 产生：brandTurn 只对 http-entry 开放；入口表、矩阵一致
  const bt = gApi.find(e => nameOf(e) === 'brandTurn'); if (!bt || !sameArr(bt.callerFiles, [HTTP])) bad('groupApi：brandTurn 应只对 input/http-entry.mjs 开放');
  const producers = allApi.filter(e => /^brand/.test(nameOf(e))).map(nameOf); if (!sameArr(producers, ['brand', 'brandTurn', 'brandQuote'])) bad('从 RawText 品牌化的函数应恰为 brand、brandTurn、brandQuote，实得 ' + producers.join(','));
  const entryRows = tableAfterLine(lines.findIndex(l => l.startsWith('- **登记边界入口表**'))).map(cellsOf);
  const he = entryRows.find(e => mjsIn(e[0]).includes(HTTP)); if (!he || !he[3].includes('`brandTurn`') || !he[3].includes('`TurnText`')) bad('入口表 input/http-entry.mjs 行应写明 RawText→brandTurn→TurnText');
  if (!mcell('inputEdge', 'textcore').includes('`brandTurn` 仅 `' + HTTP + '`')) bad('矩阵 inputEdge 行 textcore 格应写明 brandTurn 仅 input/http-entry.mjs');
  for (const g of ['gate', 'outputGate', 'aiGate']) if (mcell(g, 'textcore').includes('brandTurn')) bad(`矩阵 ${g} 行不得开放 brandTurn`);
  // (c) 全文带 TurnText 形参的函数是闭集
  const withTurn = new Set();
  lines.forEach((l, i) => { if (inHist(i)) return; for (const m of l.matchAll(/([A-Za-z]+)\(([^()]*)\)/g)) if (/\b\w+: TurnText\b/.test(m[2])) withTurn.add(m[1]); });
  { const sigI = lines.findIndex(l => l.startsWith('- **子串函数签名表（唯一定义）**')); for (const r of tableAfterLine(sigI).map(cellsOf)) if (/[a-z]+: TurnText/.test(r[1] ?? '')) withTurn.add(ticks(r[0])[0]); } // 签名表里函数名与形参分两格
  if (!sameArr([...withTurn], ['interpret', 'narrateTurn', 'matchQuote', 'containsCodePoints'])) bad('形参带 TurnText 的函数应恰为 interpret、narrateTurn、matchQuote、containsCodePoints，实得 ' + [...withTurn].join(','));
  // (d) 传入 aiGate：两个入口都只对 http-entry 开放；aiGate 对 inputEdge 的导出与矩阵格一致
  for (const n of ['interpret', 'narrateTurn']) { const e = gApi.find(x => nameOf(x) === n); if (!e || groupOfFile(fileOf(e)) !== 'aiGate' || !sameArr(e.callerFiles, [HTTP])) bad(`groupApi：${n} 应是 aiGate 的导出且只对 input/http-entry.mjs 开放`); }
  const aiToInput = gApi.filter(e => groupOfFile(fileOf(e)) === 'aiGate' && (e.callerFiles ?? []).some(f => groupOfFile(f) === 'inputEdge')).map(nameOf);
  if (gApi.some(e => groupOfFile(fileOf(e)) === 'aiGate' && (e.callers ?? []).length)) bad('aiGate 的跨组导出应全部按 callerFiles 限定到文件');
  const cellNames = ticks(mcell('inputEdge', 'aiGate')).filter(t => !/\//.test(t));
  if (!sameArr(cellNames, aiToInput)) bad(`矩阵 inputEdge 行 aiGate 格（${cellNames.join(',')}）与 groupApi 中 aiGate 对 inputEdge 的导出（${aiToInput.join(',')}）不一致`);
  for (const n of aiToInput) if (!sameArr(gApi.find(x => nameOf(x) === n).callerFiles, [HTTP])) bad(`aiGate 的 ${n} 应只对 input/http-entry.mjs 开放`);
  // (e) 用掉：matchQuote 不是跨组导出；签名恰一处；它调用的子串函数只对 quote-identity 开放（第 30 项）
  if (allApi.some(e => nameOf(e) === 'matchQuote')) bad('matchQuote 不得登记为跨组导出');
  // (f) 来路定义块写全五步
  const b0 = lines.findIndex(l => l.includes('**本轮原文的来路（闭合）**'));
  if (!(b0 > s29a && b0 < s29b)) bad('§2.9 内没有"本轮原文的来路（闭合）"');
  let b1 = b0 + 1; while (b1 < lines.length && /^ {4}/.test(lines[b1])) b1++;
  const blk = lines.slice(b0, b1).join('\n'); const steps = lines.slice(b0 + 1, b1).filter(l => /^ {4}\d\. /.test(l));
  if (steps.length !== 5) bad(`来路应写成五步，实得 ${steps.length}`);
  for (const kw of ['`brandTurn`', '本轮槽位', '`interpret(turn: TurnText, candidates)`', '`narrateTurn(turn: TurnText, result: ReplyResult)`', '闭集两个', '模块级变量', '`quote` 字段', '`matchQuote(q, q)`', 'G4']) if (!blk.includes(kw)) bad('来路定义缺：' + kw);
  // (g) 旧写法不得残留
  for (const [re, what] of [[/turnText: Text/, 'turnText: Text'], [/matchQuote\(quote: Text/, 'matchQuote(quote: Text'], [/interpret\(text, candidates\)/, 'interpret(text, candidates)']]) { const at = live(re); if (at.length) bad(`残留旧写法 ${what}：行 ${at.join(',')}`); }
  if (fail === before) log(`  OK TurnText 只由 brandTurn 产出且只对 input/http-entry.mjs 开放；形参带 TurnText 的函数恰 ${withTurn.size} 个（interpret、narrateTurn、matchQuote、containsCodePoints）；aiGate 对 inputEdge 的 ${aiToInput.length} 个导出都限定到 input/http-entry.mjs 并与矩阵格一致；来路五步写全；旧签名无残留`);
}
// ---------- 32. 装配文件只调用封闭清单里的函数 ----------
log('== 32 装配文件封闭清单');
{
  const before = fail;
  const asm = lines.find(l => /^\s*"assembly":/.test(l)) ?? '';
  const calls = [...(asm.match(/"calls":\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(x => x[1]);
  if (!calls.length) bad('state-owners assembly 缺 calls 封闭清单');
  if (new Set(calls).size !== calls.length) bad('assembly.calls 有重复');
  // (a) 清单内每个函数都登记为只对 index.mjs 开放
  for (const n of calls) { const es = apiByName(n); if (es.length !== 1) { bad(`assembly.calls 的 ${n} 不在 kernelApi / groupApi（或重名）`); continue; } if (!sameArr(es[0].callerFiles, ['index.mjs'])) bad(`${n} 应登记为只对 index.mjs 开放`); if (es[0].acceptsState === true) bad(`${n} 不得接收 state`); }
  // (b) 反过来：凡对 index.mjs 开放的导出都在清单内
  const openToAsm = allApi.filter(e => (e.callerFiles ?? []).includes('index.mjs')).map(nameOf);
  if (!sameArr(openToAsm, calls)) bad(`对 index.mjs 开放的导出（${openToAsm.join(',')}）与 assembly.calls 不一致`);
  const kaLine = lines.find(l => /^\s*"kernelApi":/.test(l)) ?? ''; if (!kaLine.includes('装配文件不在 * 之内')) bad('kernelApi 说明应写明通配 * 不含装配文件');
  // (c) 矩阵装配文件行括号里的名字 = 清单
  const arow = mrows.find(r => r[0].startsWith('装配文件')) ?? [];
  const rowNames = arow.slice(1, -1).flatMap(c => ticks(c)).filter(t => !/\//.test(t) && !/\.mjs$/.test(t));
  if (!sameArr(rowNames, calls)) bad(`矩阵装配文件行的名字（${rowNames.join(',')}）与 assembly.calls 不一致`);
  for (let k = 1; k < arow.length - 1; k++) if (arow[k] && !/^是（仅 /.test(arow[k])) bad(`矩阵装配文件行 ${mcols[k]} 格不是具体名字的闭集：${arow[k]}`);
  for (let k = 1; k < arow.length - 1; k++) for (const n of ticks(arow[k]).filter(t => !/\//.test(t))) { const e = apiByName(n)[0]; const g = e ? groupOfFile(fileOf(e)) : ''; const col = mcols[k] === '规则层' ? 'rules' : mcols[k]; if (e && g !== col) bad(`矩阵装配文件行：${n} 写在 ${mcols[k]} 格，但它登记在 ${g}`); }
  // (d) §2.9 第 0 条"装配文件"一项列出的名字 = 清单；扫描规则写全
  const al = lines.find(l => l.startsWith('- **装配文件**')) ?? '';
  const part = al.split('**装配文件封闭清单（唯一定义）**')[1] ?? '';
  const listed = [...new Set(ticks(part.split('；每个都在')[0]).map(t => t.replace(/\(.*$/, '')).filter(t => /^(create|mount|register)[A-Z]/.test(t)))];
  if (!sameArr(listed, calls)) bad(`"装配文件"一项列出的函数（${listed.join(',')}）与 assembly.calls 不一致`);
  for (const kw of ['**扫描规则**', 'import 声明', '`init(router)`', '字符串字面量', '数值字面量', '条件', '循环', '属性读取', '对 state 的任何读写', '对清单外函数的调用', '// assembly:optional inputEdge', '逐字节不变']) if (!al.includes(kw)) bad('"装配文件"一项缺：' + kw);
  if (!calls.includes('mountInput')) bad('assembly.calls 应含可缺项 mountInput');
  // (e) §2.8 表与 S19 引用这份清单；白名单表装配文件行无全局、无 node 模块
  const r28 = sec(/^### 2\.8/, /^### 2\.9/).find(l => l.startsWith('| 装配文件 |')) ?? ''; if (!r28.includes('`assembly.calls`')) bad('§2.8 表装配文件行未引用 assembly.calls');
  const s19 = lines.find(l => l.startsWith('- S19 ')) ?? ''; for (const kw of ['**装配文件**', '`assembly.calls`', '逐字节不变']) if (!s19.includes(kw)) bad('S19 的装配文件一项缺：' + kw);
  const w = wlRow('装配文件'); if (!/^无/.test(w[2] ?? '') || (w[3] ?? '') !== '无') bad('白名单表装配文件行应无宿主全局、无 node 模块');
  if (lines.filter(l => l.includes('装配文件封闭清单（唯一定义）')).length !== 2) bad('"装配文件封闭清单（唯一定义）"应恰出现两次（定义处与附录 G 锚点）');
  if (fail === before) log(`  OK assembly.calls ${calls.length} 个函数（${calls.join('、')}）：每个都在 kernelApi 或 groupApi 登记为只对 index.mjs 开放，反向也无清单外的开放项；矩阵装配文件行、§2.9"装配文件"一项与清单三处一致；扫描规则写全，§2.8 与 S19 引用同一清单`);
}
// ---------- 33. 第十五版：存量与余数结转、wsum 签名、系统闭集字段、数值路径单位 ----------
log('== 33 存量规则与 wsum 签名');
{
  const before = fail;
  const s33a = lines.findIndex(l => /^### 3\.3/.test(l)), s33b = lines.findIndex(l => /^### 3\.4/.test(l));
  const r0 = lines.findIndex(l => l.startsWith('**存量与余数结转（唯一定义）**'));
  if (!(r0 > s33a && r0 < s33b)) bad('§3.3 内没有"存量与余数结转（唯一定义）"');
  let r1 = r0 + 1, nTop = 0; while (r1 < lines.length && (/^\d\. /.test(lines[r1]) || /^   - /.test(lines[r1]))) { if (/^\d\. /.test(lines[r1])) nTop++; r1++; } // 顶层条目计数，允许条下缩进子项
  if (nTop !== 6) bad(`存量规则应为六条，实得 ${nTop}`);
  const rb = lines.slice(r0, s33b).join('\n');
  for (const kw of ['只存原值', '读时派生', '末份取差', '锚点', '`<维度名>Rem`', '向下取整', '`[0, 分母)`', '只许有这一次整除', '`SCALE² = 10⁸`', '切片不变', '往返不变', '逐位相同']) if (!rb.includes(kw)) bad('存量规则缺：' + kw);
  // wsum：定义一处，正文所有调用恰三参
  const w0 = lines.findIndex(l => l.startsWith('- **`wsum` 签名（唯一定义）**'));
  const s112a = lines.findIndex(l => /^### 1\.12/.test(l)), s113a = lines.findIndex(l => /^### 1\.13/.test(l));
  if (!(w0 > s112a && w0 < s113a)) bad('§1.12 内没有"`wsum` 签名（唯一定义）"');
  let w1 = w0 + 1; while (w1 < lines.length && /^ {2}\d\. /.test(lines[w1])) w1++;
  if (w1 - w0 - 1 !== 5) bad(`wsum 签名应写成五点，实得 ${w1 - w0 - 1}`);
  let calls = 0;
  lines.forEach((l, i) => { if (inHist(i)) return; for (const m of l.matchAll(/wsum\(([^()]*)\)/g)) { calls++; const n = m[1].split(',').length; if (n !== 3) bad(`行 ${i + 1}：wsum 调用不是三参：wsum(${m[1]})`); } });
  if (!lines.some(l => l.startsWith('| `wsum(parts, kind, dim)` |'))) bad('§1.12 原语表首行应为 wsum(parts, kind, dim)');
  const mat = lines.find(l => l.startsWith('| `material` | list<struct{group: ref vocab matgroup, materialRef: ref material, share: fraction}>')); if (!mat) bad('§5.1 material 应为多组列表（wsum 的第 ② 种入参形状）');
  // 系统闭集字段与数值路径单位
  const f0 = lines.findIndex(l => l.startsWith('- **系统的两个闭集字段（唯一定义）**')); const s27a = lines.findIndex(l => /^### 2\.7/.test(l)), s28a = lines.findIndex(l => /^### 2\.8/.test(l));
  if (!(f0 > s27a && f0 < s28a)) bad('§2.7 内没有"系统的两个闭集字段（唯一定义）"');
  const fb = lines.slice(f0, f0 + 4).join('\n'); for (const kw of ['`systems.<名>.entryCallerFiles`', '`systems.<名>.entryJudges`', 'E-VIEW-BYPASS', '不认 `predicates`']) if (!fb.includes(kw)) bad('系统闭集字段缺：' + kw); // 第十六版：callers 改名 entryCallerFiles（接缝清单 ④-1）
  if (!lines.slice(s27a, s28a).some(l => l.includes('"entryCallerFiles": {}, "entryJudges": []'))) bad('§2.7 JSON systems 示例缺 entryCallerFiles / entryJudges');
  if (lines.some((l, i) => !inHist(i) && /systems\.<名>\.callers/.test(l))) bad('正文仍有 systems.<名>.callers 旧名');
  const pt = lines.find(l => /^\s*"pathTypes":/.test(l)) ?? ''; const obj = pt.match(/\{[^}]*\}/)?.[0] ?? '{}'; let ptv = {}; try { ptv = JSON.parse(obj); } catch { bad('pathTypes 示例不可解析'); }
  const units = new Set((lines.find(l => l.startsWith('`_units.json` 封闭')) ?? '').match(/首批：`([^`]+)`/)?.[1].split(' ') ?? []);
  for (const [p, t] of Object.entries(ptv)) { if (t === 'number' || t === 'integer') bad(`pathTypes ${p} 的数值类型未带单位`); const m = String(t).match(/^(?:number|integer):(.+)$/); if (m && !units.has(m[1])) bad(`pathTypes ${p} 的单位 ${m[1]} 不在 §1.4 单位表`); }
  if (!lines.some(l => l.includes('`number:<单位> / integer:<单位>`'))) bad('pathTypes 文法未写数值路径带单位');
  // 事件来源行公共字段；facilityType 不再是存储字段
  const e0 = lines.findIndex(l => l.startsWith('### 1.14 事件来源行公共字段（唯一定义）')); if (e0 < 0) bad('缺 §1.14 事件来源行公共字段');
  const eb = lines.slice(e0, e0 + 16).join('\n'); for (const kw of ['enum event_role', '`V = 1 + Σ valueScale[k] × 价值[k]`', '`stackLimit`', '同一对']) if (!eb.includes(kw)) bad('§1.14 缺：' + kw);
  if (!(lines.find(l => l.includes('`event_role`（')) ?? '').includes('`event_role`（actor target witness related informed；')) bad('§1.9 封闭枚举缺 event_role 五值');
  const ft = lines.map((l, i) => !inHist(i) && /^\| `facilityType` \|/.test(l) ? i + 1 : 0).filter(Boolean); if (ft.length) bad('place 表仍把 facilityType 定为存储维度：行 ' + ft.join(','));
  if (lines.some((l, i) => !inHist(i) && /"requires": \["facilityType"\]/.test(l))) bad('夹具 comp_facility 仍 requires facilityType');
  if (fail === before) log(`  OK 存量规则六条与两类断言写全；wsum 定义一处、正文 ${calls} 处调用全为三参、material 为多组列表；系统闭集字段 entryCallerFiles / entryJudges 在 §2.7 定义并进 JSON 示例；pathTypes 数值路径都带 §1.4 的单位；§1.14 与 event_role 已登记；facilityType 不再是存储维度`);
}
// ---------- 34. 第十六版：接缝批（心跳推进、终止清理、存量登记、改名） ----------
log('== 34 接缝批');
{
  const before = fail;
  const body = lines.filter((_, i) => !inHist(i));
  const has = kw => body.some(l => l.includes(kw));
  // 心跳推进：墙钟只投递请求；旧写法（心跳回调直接推进、按步长算目标分钟）不得残留
  const hb = lines.findIndex(l => l.includes('**心跳推进（唯一定义'));
  if (hb < 0) bad('缺"心跳推进（唯一定义"'); else {
    const hbT = lines.slice(hb, hb + 6).join('\n');
    for (const kw of ['墙钟只触发"请求推进"', '推进多少由世界时钟决定', '`rules.host.heartbeatStepMinutes`', '`state.clock.minute`', '排队，不插队', '进输入序列', '不读墙钟']) if (!hbT.includes(kw)) bad('心跳推进缺：' + kw);
  }
  if (has('**心跳推进**由 `WallTimerCap.heartbeat` 的回调触发')) bad('心跳推进旧写法残留');
  if (!has('心跳到点只向 kernel 投递一条心跳推进请求')) bad('"定时器"一项未同步心跳口径');
  // 终止与复生
  const t0 = lines.findIndex(l => l.startsWith('- **实体终止协议（通用原语，唯一定义）**'));
  const steps = []; for (let i = t0 + 1; i < lines.length && /^ {2}\d\. /.test(lines[i]); i++) steps.push(lines[i]);
  if (steps.length !== 5) bad(`终止协议应为五步，实得 ${steps.length}`);
  if (!(steps[0] ?? '').includes('**定后继与领域清理**') || !(steps[1] ?? '').includes('**标记**')) bad('终止协议前两步应为"定后继与领域清理""标记"');
  if (!(steps[4] ?? '').includes('**撤销到期项**')) bad('第 5 步缺"撤销到期项"');
  for (const kw of ['**领域清理的两个登记点（唯一定义）**', '**窗口期满（唯一定义）**', '`systems.<名>.terminationCleanup`', '`stateKeys.<键>.subjectRecords`', '`rules.terminate.records.<rcls_ 代号>`', 'E-TERM-RECORD-UNLISTED', 'E-TERM-REVIVE-DENIED', '`当前日 − 终止日 < reviveWindowDays`', '`verb_entity_terminated', '`verb_entity_revived']) if (!has(kw)) bad('§2.6 缺：' + kw);
  if (body.some(l => /`entity_(terminated|revived) \{/.test(l))) bad('终止与复生事件仍用旧名');
  if (has('reviveWindowDays: number') || has('缺省 0，即没有窗口')) bad('reviveWindowDays 仍是 number 或仍有缺省');
  if (has('"readers": ["dim:*", "view:capacity"]')) bad('terminated 的 readers 仍含 dim:*');
  if (!has('- **建行写者与改写写者（唯一定义）**')) bad('§2.7 缺"建行写者与改写写者（唯一定义）"');
  // 存量登记与定点指数
  for (const kw of ['| `.stockMode` |', '| `.remDenominator` |', '| `struct:stockAnchor` |', '**定点指数与整数次幂（唯一定义）**', '`fixedUnits8(s)`', '`fixedMultiply8(a, b)', '`fixedExp(x)`', '`fixedPow(b, n)`', '只许换成旧分母的正整数倍', '`stockMode: extScale`']) if (!has(kw)) bad('存量登记缺：' + kw);
  // 封闭枚举与族
  const enumLine = lines.find(l => l.includes('**代码内封闭枚举**')) ?? '';
  for (const kw of ['`stock_mode`（raw anchor remainder extScale', '`reply_result`（ok received rejected error save_unavailable', '`narrate_result`（written skipped rejected', '`term_record`（clear hold keep', '`revive_record`（clear keep', '`writer_role`（create rewrite', 'decision_card→`dcard_`', 'record_class→`rcls_`', 'substance→`subst_`']) if (!enumLine.includes(kw)) bad('§1.9 缺：' + kw);
  // §1.14 改名与求值次序
  const e0 = lines.findIndex(l => l.startsWith('### 1.14')); const eb = lines.slice(e0, e0 + 16).join('\n');
  for (const kw of ['| `baseAmount` |', '| `stackGroup` |', '**求值次序（唯一定义）**', '单位 / precision']) if (!eb.includes(kw)) bad('§1.14 缺：' + kw);
  if (/\| `value` \| number \|/.test(eb) || /\| `group` \| ref vocab stack_group/.test(eb)) bad('§1.14 仍有旧字段名 value / group');
  // 存档四路与通道
  for (const kw of ['`schema:wire-up-import-v1`', '`rules.host.saveSlotCount`', 'E-SAVE-WRITE-FAIL', 'E-SAVE-IMPORT-SIZE', 'E-SAVE-SLOT-INVALID', '`rules.i18n.nameCandidateCount`', '|nameCandidate:<n>`', '`struct:advancePlanItem`']) if (!has(kw)) bad('通道与登记缺：' + kw);
  const units = new Set((lines.find(l => l.startsWith('`_units.json` 封闭')) ?? '').match(/首批：`([^`]+)`/)?.[1].split(' ') ?? []);
  for (const u of ['byte', 'ms']) if (!units.has(u)) bad('§1.4 单位表缺 ' + u);
  // 卷三第六版撤销的旧大类代号不得再被引用
  const old = lines.map((l, i) => !inHist(i) && /matcat_(woody|stony|earthen|metal|mineral|plant|leather|meat|liquid)/.test(l) ? i + 1 : 0).filter(Boolean); // 附录 D 的处置记录里提到旧名不算引用
  if (old.length) bad('仍引用卷三已撤销的大类代号：行 ' + old.join(','));
  if (fail === before) log('  OK 心跳推进只投递请求、旧写法无残留；终止协议五步改序并含两个登记点、窗口期满、到期项撤销；建行写者与改写写者已定义；stockMode / remDenominator / struct:stockAnchor 与定点指数五项在位；六个封闭枚举与三个族已登记；§1.14 两处改名并写求值次序；存档码、导入 schema、槽位与候选键在位；单位表含 byte、ms；无已撤销的大类代号');
}
log(`== 结果：${fail === 0 ? 'PASS' : 'FAIL ' + fail + ' 项'}`);
