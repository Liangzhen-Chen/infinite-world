// 卷三"整类"核对（拆卷后：读卷三甲、卷三乙两卷）。只读文档；带 --snapshot 且全部通过时，把两卷成稿原样复制到 版本快照/卷三甲-v1.md、卷三乙-v1.md。
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-整类.mjs [--snapshot]
//   甲 两卷内没有手写的 class 族类别（两份文件逐行扫，不排除任何行），也没有任何显式指定类别的通道；
//   乙 赃物份额在全书只有一处写入（卷三乙 §3.3 单点定义，写者是账本），别卷没有写入点；
//   丙 全集材料逐种由维度推出（调全集核对脚本，数值读卷三甲）；丁 聚集形态在物品一侧。
import { readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'F:/dnd/docs/统一底层设计/';
const JIA = DIR + '卷三甲-物质本源.md';
const DOC = DIR + '卷三乙-物态类别与物品.md';
const OLD = '卷三-物品与材料.md';
const OUT_MARK = '<!--CLASS-TAINT-CHECK-OUTPUT-->';
const T = 'ta' + 'int';

const out = [];
let fail = 0;
const say = (ok, msg) => { out.push((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fail += 1; };
const note = (msg) => out.push('     ' + msg);

const raw = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const jia = readFileSync(JIA, 'utf8').replace(/\r\n/g, '\n').split('\n');
const both = [...jia.map((l, i) => ({ l, at: '甲:' + (i + 1) })), ...lines.map((l, i) => ({ l, at: '乙:' + (i + 1) }))];

// ---------- 甲 1：行上手写的 class 族类别 ----------
// 深度为 1（紧贴数据行最外层的花括号）= 这一行在声明自己的成员；更深 = 需求块里的选择器（读，不是声明）。
const CLASS_CODE = /class_[a-z0-9_]+/g;
const declHits = []; const declLists = []; const selectorRefs = [];
both.forEach(({ l, at }) => {
  const re = /"?classes[+-]?"?\s*:\s*\[([^\]]*)\]/g;
  for (const m of l.matchAll(re)) {
    const before = l.slice(0, m.index);
    const tick = before.lastIndexOf('`');
    const seg = before.slice(tick + 1);
    let depth = 0;
    for (const ch of seg) { if (ch === '{' || ch === '[') depth += 1; else if (ch === '}' || ch === ']') depth -= 1; }
    const codes = m[1].match(CLASS_CODE) || [];
    if (depth <= 1) { declLists.push(at); codes.forEach((c) => declHits.push(at + ': ' + c)); } else codes.forEach((c) => selectorRefs.push(at + ': ' + c));
  }
});
say(declHits.length === 0, '甲1 行上手写的 class 族类别 0 处（卷三甲 ' + jia.length + ' 行、卷三乙 ' + lines.length + ' 行逐行扫，未排除任何行；查到成员声明 ' + declLists.length + ' 处，其中带 class 族条目 ' + declHits.length + ' 处）');
declHits.forEach(note);

// ---------- 甲 2：没有显式指定类别的通道 ----------
const devLiteral = []; const devSchema = []; const kindLiteral = [];
both.forEach(({ l, at }) => {
  if (/[A-Za-z]*Deviation"?\s*:\s*[{[]/.test(l)) devLiteral.push(at);
  if (/^\| `[A-Za-z]*Deviation`/.test(l) || /^\| catdev\b/.test(l) || /^\| `rules\.items\.[A-Za-z]*Deviation[A-Za-z]*`/.test(l)) devSchema.push(at);
  if (/categoryKind"?\s*:\s*"?category_/.test(l)) kindLiteral.push(at);
});
say(devLiteral.length === 0, '甲2 数据行里的偏离字段（任何 …Deviation 取值）0 处' + (devLiteral.length ? '：' + devLiteral.join(',') : ''));
say(devSchema.length === 0, '甲2 维度表、词表、规则表里没有偏离字段、原因代号族、偏离上限的登记行' + (devSchema.length ? '：' + devSchema.join(',') : ''));
say(kindLiteral.length === 0, '甲2 数据行里显式写经济大类 0 处' + (kindLiteral.length ? '：' + kindLiteral.join(',') : ''));

// ---------- 甲 3：每个被引用的类别都有派生来源 ----------
const blocks = [];
{
  let open = -1;
  lines.forEach((l, i) => {
    if (l.startsWith('<!--CLASS-RULES-BEGIN')) open = i;
    else if (l.startsWith('<!--CLASS-RULES-END') && open >= 0) { blocks.push([open, i]); open = -1; }
  });
}
say(blocks.length === 2, '甲3 派生来源表 ' + blocks.length + ' 张（材料一张、物品一张，都在卷三乙）');
const inBlock = (i) => blocks.some(([a, b]) => i > a && i < b);
const derived = new Set();
lines.forEach((l, i) => { if (inBlock(i)) (l.match(CLASS_CODE) || []).forEach((c) => derived.add(c)); });
const used = new Map();
lines.forEach((l, i) => { if (inBlock(i)) return; (l.match(CLASS_CODE) || []).forEach((c) => { if (!used.has(c)) used.set(c, []); used.get(c).push('乙:' + (i + 1)); }); });
jia.forEach((l, i) => { (l.match(CLASS_CODE) || []).forEach((c) => { if (!used.has(c)) used.set(c, []); used.get(c).push('甲:' + (i + 1)); }); });
const orphan = [...used.keys()].filter((c) => !derived.has(c) && !c.startsWith('class_test_'));
say(orphan.length === 0, '甲3 两卷正文引用到的类别代号 ' + used.size + ' 个，都在派生来源表里（扩展性测试自带派生条件的 class_test_ 条目除外）；没有来源的 ' + orphan.length + ' 个');
orphan.forEach((c) => note(c + ' @ ' + used.get(c).join(',')));
note('有来源的类别：' + [...derived].sort().join(' '));
note('被引用的类别：' + [...used.keys()].sort().join(' '));
note('需求块选择器里的类别引用（读，不是声明）：' + selectorRefs.length + ' 处');
const stateClass = [...derived, ...used.keys()].filter((c) => c === 'class_' + 'solid' || c === 'class_' + 'liquid');
say(stateClass.length === 0, '甲3 派生来源表与引用里没有物态类（固态类、液态类两个代号 ' + stateClass.length + ' 处）');

// ---------- 乙 1：卷三乙内唯一写者 ----------
const tb = lines.findIndex((l) => l.startsWith('<!--TAINT-WRITER-BEGIN-->'));
const te = lines.findIndex((l) => l.startsWith('<!--TAINT-WRITER-END-->'));
const defCount = lines.filter((l) => l.startsWith('<!--TAINT-WRITER-BEGIN-->')).length;
say(defCount === 1 && tb >= 0 && te > tb, '乙1 赃物份额写者的单点定义恰有 1 段（卷三乙 §3.3 表后）');
const s33 = lines.findIndex((l) => l.startsWith('### 3.3 '));
const s34 = lines.findIndex((l) => l.startsWith('### 3.4 '));
const writerRows = [];
for (let i = s33; i < s34; i += 1) {
  const l = lines[i];
  if (!l.startsWith('| ')) continue;
  const cells = l.split('|').map((c) => c.trim());
  if (cells[1] && cells[1].includes(T)) writerRows.push({ i: i + 1, mods: cells[3].match(/[A-Za-z/-]+\.mjs/g) || [] });
}
const oneRow = writerRows.length === 1 && writerRows[0].mods.length === 1 && writerRows[0].mods[0] === 'kernel/ledger.mjs';
say(oneRow, '乙1 §3.3 唯一写者表里赃物份额的状态路径只占 1 行，写者栏只有账本模块一个' + (writerRows.length ? '（第 ' + writerRows.map((r) => r.i + ' 行：' + r.mods.join('、')).join('；') + '）' : ''));
const otherMod = []; const declWriter = [];
lines.forEach((l, i) => {
  if (!l.includes(T)) return;
  if (i > tb && i < te) return;
  const mods = (l.match(/[A-Za-z/-]+\.mjs/g) || []).filter((m) => !/ledger\.mjs$/.test(m) && !/check-|finalize-|calc-/.test(m));
  if (l.startsWith('| ')) {
    const cells = l.split('|');
    const k = cells.findIndex((c) => c.includes(T));
    const near = (cells[k] + '|' + (cells[k + 2] || '')).match(/[A-Za-z/-]+\.mjs/g) || [];
    if (near.some((m) => !/ledger\.mjs$/.test(m))) otherMod.push(i + 1);
  } else if (mods.length) otherMod.push(i + 1);
  if (/声明写者/.test(l) && !l.startsWith('| `')) declWriter.push(i + 1);
});
say(otherMod.length === 0, '乙1 卷三乙单点定义之外，没有哪一行把赃物份额交给账本以外的模块（命中 ' + otherMod.length + ' 处' + (otherMod.length ? '：' + otherMod.join(',') : '') + '）');
say(declWriter.length === 0, '乙1 卷三乙单点定义之外，没有"经声明写者写赃物份额"的说法（命中 ' + declWriter.length + ' 处' + (declWriter.length ? '：' + declWriter.join(',') : '') + '）');

// ---------- 乙 2：全书别卷没有写入点（卷三甲算别卷；已停用的卷三旧稿不扫） ----------
const vols = readdirSync(DIR).filter((f) => /^卷.*\.md$/.test(f) && f !== OLD && !f.startsWith('卷三乙-')).sort();
const W = '(写入|改写|直写|置为|设为|清零|清除|洗白|改成|改为|归零)';
const K = '(`' + T + '`|' + T + '|赃物份额)';
const writeRe = new RegExp(W + '[^，。；|]{0,16}' + K + '|' + K + '[^，。；|]{0,16}' + W);
let mentions = 0; const foreign = [];
for (const f of vols) {
  const ls = readFileSync(DIR + f, 'utf8').replace(/\r\n/g, '\n').split('\n');
  ls.forEach((l, i) => {
    if (!l.includes(T) && !l.includes('赃物份额')) return;
    mentions += 1;
    if (writeRe.test(l) || /\.mjs/.test(l) || new RegExp('[.\\]]' + T + '\\s*=[^=]').test(l)) foreign.push(f + ':' + (i + 1));
  });
}
say(foreign.length === 0, '乙2 全书其余 ' + vols.length + ' 卷里提到赃物份额 ' + mentions + ' 行，其中写入点 0 处（命中 ' + foreign.length + ' 处）');
foreign.forEach(note);
note('扫描的卷：' + vols.map((f) => f.replace(/-.*$/, '')).join(' '));

// ---------- 丙：全集材料逐种由维度推出（数值在卷三甲，规则与应得结果在卷三乙） ----------
{
  let o = ''; let code = 0;
  try { o = execFileSync(process.execPath, ['F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-全集.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { o = String(e.stdout || ''); code = e.status || 1; }
  const ol = o.replace(/\r\n/g, '\n').split('\n');
  const sum = ol.find((l) => l.startsWith('合计：')) || '';
  const fails = ol.filter((l) => l.startsWith('FAIL')).length;
  say(code === 0 && fails === 0 && /推错 0 种/.test(sum) && /落空 0 种/.test(sum) && /双归 0 种/.test(sum), '丙1 全集核对脚本退出码 ' + code + '，未通过断言 ' + fails + ' 项');
  note(sum);
  const cellsOf = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
  const db = jia.findIndex((l) => l.startsWith('<!--MATERIAL-DATA-BEGIN-->')); const de = jia.findIndex((l) => l.startsWith('<!--MATERIAL-DATA-END-->'));
  const rows = jia.slice(db + 1, de).filter((l) => /^\| mat_/.test(l)).map(cellsOf);
  const head = cellsOf(jia.slice(db + 1, de).find((l) => l.startsWith('| 代号')));
  const col = (r, h) => r[head.indexOf(h)];
  const inTable = new Set(rows.map((r) => r[0]));
  const inDoc = new Map();
  both.forEach(({ l, at }) => { for (const m of l.matchAll(/(?<![A-Za-z0-9_])mat_[a-z0-9_]+/g)) { if (!inDoc.has(m[0])) inDoc.set(m[0], at); } });
  const missing = [...inDoc.keys()].filter((m) => !inTable.has(m));
  say(rows.length === inTable.size && missing.length === 0, '丙2 全集表覆盖两卷出现的全部材料：两卷全文出现 ' + inDoc.size + ' 种，表内 ' + rows.length + ' 行，表外漏掉 ' + missing.length + ' 种');
  missing.forEach((m) => note(m + ' @ ' + inDoc.get(m)));
  const handCat = both.filter(({ l }) => /categories"?\s*:\s*\[/.test(l)).map(({ at }) => at);
  const substCol = rows.filter((r) => /matcat_/.test(col(r, '本源成分'))).map((r) => r[0]);
  say(handCat.length === 0 && substCol.length === 0, '丙3 手写的派生大类 0 处（全集表本源成分栏里的大类代号 ' + substCol.length + ' 处，两卷数据行里手写 categories ' + handCat.length + ' 处）');
  const GAP_A = ['mat_bamboo', 'mat_oak', 'mat_elm', 'mat_wicker', 'mat_charcoal', 'mat_bamboo_charcoal', 'mat_thunderstruck_char', 'mat_leather',
    'mat_rawhide', 'mat_sheepskin', 'mat_silk', 'mat_hemp_cord', 'mat_paper', 'mat_dry_grass', 'mat_tea_leaf'];
  const gapBad = GAP_A.filter((id) => { const r = rows.find((x) => x[0] === id); return !r || col(r, '分解点') === '—' || col(r, '熔点') !== '—' || col(r, '密度固') === '—'; });
  say(gapBad.length === 0, '丙4 第四版缺口甲的 ' + GAP_A.length + ' 种材料都有分解点、没有熔点（按分解点判，任何温度下为固），密度填在固态栏（未满足 ' + gapBad.length + ' 种）');
  gapBad.forEach(note);
}

// ---------- 丁：聚集形态在物品一侧，不在材料一侧 ----------
{
  const sec = (ls, t) => ls.findIndex((l) => l.startsWith(t));
  const B = 'bulk' + 'Form';
  const inJia = jia.filter((l) => l.startsWith('| `' + B + '`')).length;
  const inYi21 = lines.slice(sec(lines, '### 2.1 '), sec(lines, '### 2.2 ')).filter((l) => l.startsWith('| `' + B + '`')).length;
  const inItem = lines.slice(sec(lines, '### 2.2 '), sec(lines, '### 2.3 ')).filter((l) => l.startsWith('| `' + B + '`')).length;
  const matRowsWith = both.filter(({ l }) => /substance:subst_/.test(l) && l.includes(B + ':')).length;
  say(inJia === 0 && inYi21 === 0 && inItem === 1 && matRowsWith === 0, '丁1 聚集形态登记在物品表（卷三乙 §2.2，' + inItem + ' 行），卷三甲材料表与卷三乙材料派生量表都没有这一维（' + (inJia + inYi21) + ' 行），材料数据行里写它的 ' + matRowsWith + ' 处');
  const tmpl = []; const noForm = [];
  lines.forEach((l, i) => {
    if (!/material:\[\{group:/.test(l) || !/massKg:/.test(l)) return;
    tmpl.push(i + 1);
    if (!new RegExp(B + ':bform_(block|sheet|granule|powder)[,}]').test(l)) noForm.push(i + 1);
  });
  say(noForm.length === 0, '丁2 物品模板例子 ' + tmpl.length + ' 条都写了聚集形态的固定代号（缺 ' + noForm.length + ' 条' + (noForm.length ? '：' + noForm.join(',') : '') + '）');
}

out.push('----');
out.push('结果：' + (fail === 0 ? '全部通过' : '未通过 ' + fail + ' 项'));
console.log(out.join('\n'));

const cut = raw.indexOf(OUT_MARK);
if (cut >= 0) {
  const m = raw.slice(cut).match(/```\n([\s\S]*?)\n```/);
  console.error('卷末已贴输出与本次一致：' + (m && m[1] === out.join('\n') ? '是' : '否'));
} else console.error('卷末尚未贴输出');

if (process.argv.includes('--snapshot')) {
  if (fail !== 0) { console.error('未全部通过，不写快照'); process.exit(1); }
  for (const [src, dst] of [[JIA, DIR + '版本快照/卷三甲-v1.md'], [DOC, DIR + '版本快照/卷三乙-v1.md']]) {
    copyFileSync(src, dst);
    console.error('快照已写：' + dst + '；与成稿逐字节相同：' + (readFileSync(dst).equals(readFileSync(src)) ? '是' : '否'));
  }
}
process.exitCode = fail === 0 ? 0 : 1;
