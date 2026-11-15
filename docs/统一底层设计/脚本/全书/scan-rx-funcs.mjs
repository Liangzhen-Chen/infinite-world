// 只读扫描（李白裁定第 6 条③）：全书 RX 表达式里"非 rxTree 变体、非 agg 聚合"的函数式写法 名字(…)。
// 变体名从卷二 rxTree 变体表读（表头首栏含"变体"），聚合名从卷二 §1.12 原语表读（表头首栏"原语"），不写死；
// `member` 变体即将新加，表里没有时补入并在输出注明。
// RX 出现处三类（强，计入清单）：
//   ① *RX 字段值：JSON `"xxRX": "…"`、反引号内 `xxRX: …`、散文 `xxRX` 为/=/：/写/取 `…`；
//      字段名集合 = 名字以 RX 结尾者 + 维度表里类型栏为 rx 的字段名 + `when`、`filter`（卷二 §1.12 定为 RX）；
//   ② 反引号内 RX：`RX `…``（RX 一词后紧跟的反引号段）；
//   ③ rx 栏取值：表头为上述字段名（或 RX/rx）的那一栏的单元格。
// 另列"同行"（弱，仅供参考，不计入清单）：同一行提到 RX 或 RX 字段名、但不属以上三类的反引号段里的 名字(。
// 排除区（附录、迁移清单、修改记录等，lib.mjs 的 excluded）不扫。
// 用法：node scan-rx-funcs.mjs [卷目录]；输出 stdout 与 审查/脚本输出/rx-函数式写法.md（给了卷目录时不写文件）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVolumes, ticks, DIR, writeOut } from './lib.mjs';

const OUT = path.join(DIR, '审查/脚本输出/rx-函数式写法.md');
const CALL = /(?<![\p{L}\p{N}_.#\/$-])([\p{L}_][\p{L}\p{N}_]*)\(/gu;
const last = k => k.split('.').pop();

export function primitives(vols) {
  const v2 = vols.find(v => v.vol === '卷二');
  const variants = new Set(), aggs = new Set();
  if (v2) for (const L of v2.lines) {
    if (!L.cells || !L.tableHeader) continue;
    const h0 = L.tableHeader[0] || '';
    if (/变体/.test(h0)) for (const t of ticks(L.cells[0])) variants.add(t.trim());
    if (h0 === '原语' && L.nums.includes('1.12'))
      for (const t of ticks(L.cells[0])) for (const n of t.split('(')[0].split('/')) aggs.add(n.trim());
  }
  const memberAdded = !variants.has('member');
  variants.add('member');
  return { variants, aggs, memberAdded };
}

export function rxFieldNames(vols) {
  const names = new Set(['when', 'filter']);
  for (const v of vols) for (const L of v.lines) {
    for (const m of L.text.matchAll(/(?<!\w)[a-z]\w*RX(?!\w)/g)) names.add(m[0]);
    if (L.cells && L.cells.some(c => /^rx( nullable)?$/.test(c.trim())))
      for (const t of ticks(L.cells[0])) if (/^[\w.]+$/.test(t)) names.add(last(t));
  }
  // 以 名字( 出现过的是函数（compileRX、evaluateRX），不是字段
  for (const v of vols) for (const L of v.lines) for (const m of L.text.matchAll(/([A-Za-z_]\w*RX)\(/g)) names.delete(m[1]);
  return names;
}

export function scan(vols) {
  const prim = primitives(vols);
  const fields = rxFieldNames(vols);
  const isF = k => fields.has(last(k));
  const strong = [], weak = [];
  for (const v of vols) for (const L of v.lines) {
    if (L.excluded) continue;
    const t = L.text, vals = [];
    for (const m of t.matchAll(/"([\w.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) if (isF(m[1])) vals.push(['字段值', m[2]]);
    const spans = ticks(t);
    for (const s of spans) { const m = s.match(/^([\w.]+)\s*[:=]\s*(.+)$/); if (m && isF(m[1])) vals.push(['字段值', m[2]]); }
    // 散文：`字段` 后 40 字内（不跨 。；|）的第一个反引号段，及其后用 、或和与及 连着的各段
    const pos = [...t.matchAll(/`([^`]+)`/g)].map(m => ({ s: m[1], a: m.index, b: m.index + m[0].length }));
    pos.forEach((p, i) => {
      if (!/^[\w.]+$/.test(p.s) || !isF(p.s) || !pos[i + 1]) return;
      const gap = t.slice(p.b, pos[i + 1].a);
      if (gap.length > 40 || /[。；|]/.test(gap)) return;
      // 紧挨：12 字内、以赋值或读用的字眼结尾（"为真/为假"是取值判断，不算）；或明说 RX 里能用/能读什么
      const near = gap.trim().length <= 12 && /(为|=|＝|：|:|写作|写成|写|取|是|用|读|即)\s*[“"]?\s*$/.test(gap) && !/为真|为假/.test(gap);
      if (!near && !/原语|可用(?!条件)|可读|里读|中读/.test(gap)) return;
      for (let j = i + 1; j < pos.length; j++) {
        if (j > i + 1 && !/^\s*[、或和与及,，]\s*$/.test(t.slice(pos[j - 1].b, pos[j].a))) break;
        vals.push(['字段值', pos[j].s]);
      }
    });
    for (const m of t.matchAll(/(?<![\w`])RX\s*(?:为|：|:)?\s*`([^`]+)`/g)) vals.push(['RX反引号', m[1]]);
    if (L.cells && L.tableHeader) L.cells.forEach((c, i) => {
      const h = (L.tableHeader[i] || '').replace(/`/g, '').trim();
      if (h && (isF(h) || /^(rx|RX)$/.test(h))) {
        const ts = ticks(c);
        for (const x of ts.length ? ts : [c]) vals.push(['rx栏', x]);
      }
    });
    const seen = new Set();
    for (const [kind, val] of vals) {
      seen.add(val);
      for (const m of val.matchAll(CALL)) {
        const n = m[1];
        if (prim.variants.has(n) || prim.aggs.has(n) || /^\d/.test(n)) continue;
        strong.push({ n, vol: v.vol, no: L.no, kind });
      }
    }
    if (/RX/.test(t) || spans.some(s => fields.has(last(s)))) for (const s of spans) {
      if ([...seen].some(x => x.includes(s) || s.includes(x))) continue;
      for (const m of s.matchAll(CALL)) {
        const n = m[1];
        if (prim.variants.has(n) || prim.aggs.has(n)) continue;
        weak.push({ n, vol: v.vol, no: L.no });
      }
    }
  }
  return { prim, fields, strong, weak };
}

function group(hits) {
  const g = new Map();
  for (const h of hits) {
    if (!g.has(h.n)) g.set(h.n, new Map());
    const k = `${h.vol}:${h.no}`, m = g.get(h.n);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...g].map(([n, m]) => ({ n, total: [...m.values()].reduce((a, b) => a + b, 0), sites: [...m].map(([k, c]) => c > 1 ? `${k}×${c}` : k) }))
    .sort((a, b) => b.total - a.total || a.n.localeCompare(b.n));
}

export function render(r) {
  const S = group(r.strong), W = group(r.weak);
  const out = [];
  out.push('# RX 里的非变体、非聚合函数式写法（机判清单）', '');
  out.push(`变体（卷二 rxTree 变体表）：${[...r.prim.variants].join(' ')}${r.prim.memberAdded ? '（`member` 表中尚无，按裁定预先计入）' : ''}`);
  out.push(`聚合（卷二 §1.12）：${[...r.prim.aggs].join(' ')}`);
  out.push(`RX 字段名 ${r.fields.size} 个（以 RX 结尾者、类型栏为 rx 者、when、filter）。排除区不扫。`, '');
  out.push(`## 清单（RX 值内：*RX 字段值、RX 反引号段、rx 栏）——${S.length} 个名字，${r.strong.length} 次`, '');
  out.push('| 函数名 | 次数 | 出现处（卷:行） |', '|---|---|---|');
  for (const x of S) out.push(`| \`${x.n}\` | ${x.total} | ${x.sites.join('、')} |`);
  out.push('', `## 参考（同行弱命中：行内提到 RX 或 RX 字段名、但不在值内的反引号段；多为读入口签名，不计入清单）——${W.length} 个名字，${r.weak.length} 次`, '');
  out.push('| 函数名 | 次数 | 出现处（卷:行） |', '|---|---|---|');
  for (const x of W) out.push(`| \`${x.n}\` | ${x.total} | ${x.sites.join('、')} |`);
  return out.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const dir = process.argv[2];
  const r = scan(loadVolumes(dir || DIR));
  const text = render(r);
  if (!dir) writeOut(OUT, text);
  console.log(text);
}
