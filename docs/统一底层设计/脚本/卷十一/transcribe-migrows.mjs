// 乙-4 H1：迁移行转录。只读各卷成稿（卷十一 R11-2.1 的"各领域卷迁移节"），生成机读输入 migrows-input.json。
// 只读、确定性、不联网；不手抄：每行都由卷文表格解析得出，并带卷文行号以便回查。
// 用法：node transcribe-migrows.mjs   （写同目录 migrows-input.json，并向标准输出打印汇总）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const DIR = CFG.dir;
const BASE = 'd54c89a3'; // 卷零 §0.6 的基线提交（R11-2.3）；各卷迁移节都写明所用基线均为此提交
const DISP = new Set(['delete', 'recode', 'move_out', 'to_data', 'replace_entry', 'relocate_only']); // relocate_only：卷十一 R11-1.3，封卷后勘误 1115y12
const rowKey = new RegExp(CFG.migRow);
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/`/g, '').trim();
// 锚点文件：带扩展名的路径记号
const FILE = /[A-Za-z0-9_./-]+\.(?:mjs|json|js)\b/g;
// 文件后的行范围：:12、:12–30、:12-30
const LINES = /:(\d+)(?:[–-](\d+))?/g;

function anchors(text) {
  const t = strip(text);
  const hits = [...t.matchAll(FILE)];
  const out = [];
  hits.forEach((m, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : t.length;
    // 本文件记号之后、下一个文件记号之前的片段里找行范围；":" 紧跟文件名时才算
    const seg = t.slice(m.index + m[0].length, end);
    const lines = [];
    for (const r of seg.matchAll(LINES)) lines.push(r[2] ? [+r[1], +r[2]] : [+r[1], +r[1]]);
    out.push({ file: m[0], lines });
  });
  return out;
}

function pick(head, pred) { return head.findIndex(pred); }
function columns(head) {
  const h = head.map(strip);
  const obj = pick(h, x => /落点对象/.test(x));
  const disp = (() => {
    const a = pick(h, x => /mig_disp/.test(x));
    if (a >= 0) return a;
    return pick(h, x => x === '处置');
  })();
  const tgt = (() => {
    const a = pick(h, (x, i) => /落点/.test(x) && !/落点对象/.test(x));
    if (a >= 0) return a;
    const b = pick(h, x => x === '对应 §');
    if (b >= 0) return b;
    return pick(h, x => x === '去向');
  })();
  const anc = (() => {
    for (const p of [x => x === '锚点', x => /^旧位置/.test(x), x => /^现状位置/.test(x), x => x === '位置', x => /^现状（文件:行/.test(x), x => x === '文件', x => x === '旧物', x => x === '退役对象', x => x === '现状', x => /^位置$/.test(x)]) {
      const a = pick(h, p);
      if (a >= 0) return a;
    }
    return -1;
  })();
  return { key: 0, anc, disp, tgt, obj, rep: pick(h, x => x === '代表位置') };
}

// ---- zeroRow（§2.3；李白终核卷十一 二-4）：只转录迁移行原文已写出的卷零编号，原文没写的留空，不推定 ----
// 卷零的机读列（§0.8）：A 表第一列的条目编号；§4 每行的 10 # 与 aRows 列。迁移行里写出的编号分三类：
//   A 表编号（"卷零 A 4.3""卷零 A1.6""A 表 5.21"，后面可接"、"并列的编号）；§4 行号（"卷零 §4 行 8.8""核查栏 8.8"）→ 取卷零 §4 该行的 aRows；
//   裸"卷零 N.N"：只在 A 表里有这个编号才算 A 表编号，两表都有（或都没有）的不转录、列入问题。
const covLines = readFileSync(`${DIR}/${CFG.coverage.file}`, 'utf8').split(/\r?\n/);
const covSection = prefix => { const s = covLines.findIndex(l => l.startsWith(prefix)); let e = covLines.findIndex((l, i) => i > s + 3 && /^## /.test(l)); if (e < 0) e = covLines.length; return covLines.slice(s, e).filter(l => /^\|/.test(l)).map(cells); };
const A_NUMS = new Set(covSection(CFG.coverage.tableA).map(c => (c[0] ?? '').match(/^(\d+\.\d+)\b/)?.[1]).filter(Boolean));
const S4_ROWS = new Map(covSection(CFG.coverage.existing).filter(c => /^\d+\.\d+$/.test(c[0] ?? '')).map(c => [c[0], [...(c[c.length - 1] ?? '').matchAll(/\d+\.\d+/g)].map(m => m[0])]));
const NUMLIST = '(\\d+\\.\\d+(?![\\d.])(?:\\s*[、,，]\\s*\\d+\\.\\d+(?![\\d.]))*)';
const Z_A = [new RegExp('卷零\\s*A\\s*表?\\s*(?:条目\\s*)?' + NUMLIST, 'g'), new RegExp('(?<![A-Za-z])A\\s*表\\s*(?:条目\\s*)?' + NUMLIST, 'g'), new RegExp('卷零[^|；。`]{0,6}?A' + NUMLIST, 'g')];
const Z_S4 = [new RegExp('卷零\\s*§4\\s*行?\\s*' + NUMLIST, 'g'), new RegExp('卷零\\s*核查栏(?:行)?\\s*' + NUMLIST, 'g'), new RegExp('§4\\s*行\\s*' + NUMLIST, 'g')];
const Z_BARE = new RegExp('卷零\\s*' + NUMLIST, 'g');
const nums = s => s.split(/[、,，]/).map(x => x.trim());
function zeroRowsOf(text, key, problems) {
  const a = new Set(), src = [], taken = new Set();
  const take = (m, kind) => { for (let i = m.index; i < m.index + m[0].length; i++) taken.add(i); return kind; };
  for (const re of Z_A) for (const m of text.matchAll(re)) { take(m, 'A'); for (const n of nums(m[1])) if (A_NUMS.has(n)) { a.add(n); src.push(`A ${n}`); } else problems.push(`${key}：写了卷零 A 表编号 ${n}，A 表里没有`); }
  for (const re of Z_S4) for (const m of text.matchAll(re)) { take(m, '§4'); for (const n of nums(m[1])) { if (S4_ROWS.has(n)) { for (const x of S4_ROWS.get(n)) a.add(x); src.push(`§4 ${n}`); } else problems.push(`${key}：写了卷零 §4 行 ${n}，§4 里没有`); } }
  for (const m of text.matchAll(Z_BARE)) { if ([...Array(m[0].length).keys()].some(k => taken.has(m.index + k))) continue; for (const n of nums(m[1])) { const inA = A_NUMS.has(n), inS = S4_ROWS.has(n); if (inA && !inS) { a.add(n); src.push(`裸 ${n}`); } else problems.push(`${key}：裸写"卷零 ${n}"，${inA && inS ? 'A 表与 §4 都有这个编号，分不清指哪张表，未转录' : '两张表里都没有'}`); } }
  return { zeroRow: [...a].sort((x, y) => { const [p, q] = x.split('.').map(Number), [r, s] = y.split('.').map(Number); return p - r || q - s; }), zeroSrc: [...new Set(src)] };
}
const files = readdirSync(DIR).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const rows = [];
const perVol = {};
const problems = [];
for (const f of files) {
  const L = readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/);
  // 与生成器同口径（R11-2.2）：全卷任何位置、第一列是迁移行编号的表格行都算（卷一退役清单、卷二文件级迁移表也在内）
  const s = -1, e = L.length;
  let head = null, col = null, inCode = false;
  for (let i = 0; i < e; i++) {
    const l = L[i];
    if (/^```/.test(l)) { inCode = !inCode; head = null; continue; }
    if (inCode) continue;
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l);
    if (!head) { head = c; col = columns(head); continue; }
    if (/^:?-{3}/.test(c[0] ?? '')) continue;
    const key = strip(c[0] ?? '');
    // 首格像迁移行编号（M 加数字开头、含连字符）却不合编号格式的，报出来，不静默丢（chk-1116-y17 T7）
    if (!rowKey.test(key)) { if (/^M\d+[A-Za-z]*-\d/.test(key)) problems.push(`${key} 行${i + 1}（${f.split('-')[0]}）：首格像迁移行编号但不合编号格式，未转录`); continue; }
    const disp = col.disp >= 0 ? strip(c[col.disp] ?? '') : '';
    const row = {
      rowKey: key,
      volume: f.split('-')[0],
      srcLine: i + 1,
      anchorsText: col.anc >= 0 ? strip(c[col.anc] ?? '') : '',
      anchors: col.anc >= 0 ? anchors(c[col.anc] ?? '') : [],
      disp,
      target: col.tgt >= 0 ? strip(c[col.tgt] ?? '') : '',
      targetObject: col.obj >= 0 ? strip(c[col.obj] ?? '') : '',
      baseline: BASE,
    };
    { const z = zeroRowsOf(c.join(' | '), key, problems); if (z.zeroRow.length) { row.zeroRow = z.zeroRow; row.zeroSrc = z.zeroSrc; } }
    // 行号写在单独的「代表位置」栏时（卷二十 T-3 表），只有一个文件锚点才把栏里的数字记为它的行
    if (col.rep >= 0 && row.anchors.length === 1 && row.anchors[0].lines.length === 0) for (const n of strip(c[col.rep] ?? '').matchAll(/\d+/g)) row.anchors[0].lines.push([+n[0], +n[0]]);
    // 别名行：任一格写"同 Mxx-y"的行不单独计数，以所指的行为准（李白 11-15 16:05 总原则）；不查五值，不进后面的算数
    // 别名行的判法：处置、落点、落点对象三格都写"同 Mxx-y"（或 Z35 的汇总引用）；只有落点一格写"同"的行是正常行（落点指向别行）
    const aliasCells = c.map(strip).filter(x => /^同 (?:M|Z35-)\d/.test(x));
    if (aliasCells.length >= 3) { row.aliasOf = aliasCells[0]; rows.push(row); continue; }
    // 保留类（R11-2.2，李白终核卷十一 三-2）：处置格以"—（保留类"开头的行不算迁移处置，照常转录（行数对账）但标 keepClass，生成器不计入
    if (/^—（保留类/.test(disp)) row.keepClass = true;
    else if (!DISP.has(disp)) problems.push(`${row.rowKey} 行${row.srcLine}：处置不是 mig_disp 的值（${disp.slice(0, 20)}）`);
    if (row.targetObject === '') problems.push(`${row.rowKey} 行${row.srcLine}：落点对象为空`);
    rows.push(row);
    perVol[row.volume] = (perVol[row.volume] ?? 0) + 1;
  }
}
// 编号全账唯一（R11-2.2 / §2.3 rowKey）
const seen = new Map();
for (const r of rows) {
  if (seen.has(r.rowKey)) problems.push(`${r.rowKey} 重号：行${seen.get(r.rowKey)} 与 行${r.srcLine}（${r.volume}）`);
  else seen.set(r.rowKey, r.srcLine);
}
const out = { _说明: '乙-4 H1：由 transcribe-migrows.mjs 从各卷 §7 迁移节生成；不手改。字段：编号、卷、卷文行号、锚点原文与解析、处置、落点、落点对象、基线提交。', baseline: BASE, count: rows.length, rows };
writeFileSync(`${HERE}/migrows-input.json`, JSON.stringify(out, null, 1) + '\n');
console.log(`迁移行 ${rows.length} 行（其中别名行 ${rows.filter(r => r.aliasOf).length} 行不单独计数），${Object.keys(perVol).length} 卷`);
console.log(Object.entries(perVol).map(([k, v]) => `${k}:${v}`).join(' '));
const noAnchor = rows.filter(r => r.anchors.length === 0).length;
console.log(`有解析出锚点文件的行 ${rows.length - noAnchor}，无文件锚点（纯数据行、跨文件说明或位置写在别栏）${noAnchor}`);
console.log(`问题 ${problems.length} 条`);
for (const p of problems) console.log('  ' + p);
