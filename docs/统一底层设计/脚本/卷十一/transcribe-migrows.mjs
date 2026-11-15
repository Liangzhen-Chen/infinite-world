// 乙-4 H1：迁移行转录。只读各卷成稿（卷十一 R11-2.1 的"各领域卷迁移节"），生成机读输入 migrows-input.json。
// 只读、确定性、不联网；不手抄：每行都由卷文表格解析得出，并带卷文行号以便回查。
// 用法：node transcribe-migrows.mjs   （写同目录 migrows-input.json，并向标准输出打印汇总）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const DIR = CFG.dir;
const BASE = 'd54c89a3'; // 卷零 §0.6 的基线提交（R11-2.3）；各卷迁移节都写明所用基线均为此提交
const DISP = new Set(['delete', 'recode', 'move_out', 'to_data', 'replace_entry']);
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
    if (!rowKey.test(key)) continue;
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
    // 行号写在单独的「代表位置」栏时（卷二十 T-3 表），只有一个文件锚点才把栏里的数字记为它的行
    if (col.rep >= 0 && row.anchors.length === 1 && row.anchors[0].lines.length === 0) for (const n of strip(c[col.rep] ?? '').matchAll(/\d+/g)) row.anchors[0].lines.push([+n[0], +n[0]]);
    if (!DISP.has(disp)) problems.push(`${row.rowKey} 行${row.srcLine}：处置不是五值之一（${disp.slice(0, 20)}）`);
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
console.log(`迁移行 ${rows.length} 行，${Object.keys(perVol).length} 卷`);
console.log(Object.entries(perVol).map(([k, v]) => `${k}:${v}`).join(' '));
const noAnchor = rows.filter(r => r.anchors.length === 0).length;
console.log(`有解析出锚点文件的行 ${rows.length - noAnchor}，无文件锚点（纯数据行、跨文件说明或位置写在别栏）${noAnchor}`);
console.log(`问题 ${problems.length} 条`);
for (const p of problems) console.log('  ' + p);
