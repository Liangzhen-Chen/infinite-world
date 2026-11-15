// 卷零自己的计数检查：只数卷零登记行与各引用处是否对得上；只读、确定性、不联网，不改卷文。
// 用法：node check-卷零.mjs [卷零文件路径]（默认读仓库里的卷零；注入测试时传 F:/dnd-tmp 下的副本）
// 输出：每项一行 PASS 或 FAIL，末行给失败项数；有 FAIL 时退出码 1。
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'F:/dnd/docs/统一底层设计';
const FILE = process.argv[2] ?? `${DIR}/卷零-覆盖表.md`;
const L = readFileSync(FILE, 'utf8').split(/\r?\n/);
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const plain = s => s.replace(/`/g, '').trim();
const VOLTOK = /卷[零一二三四五六七八九十]+(?:甲|乙|b)?/;
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

// 取一节（从以 prefix 开头的标题到下一个同级或更高级标题）
function section(prefix) {
  const s = L.findIndex(l => l.startsWith(prefix));
  if (s < 0) return null;
  const lv = prefix.match(/^#+/)[0].length;
  let e = L.findIndex((l, i) => i > s && /^#+ /.test(l) && l.match(/^#+/)[0].length <= lv);
  if (e < 0) e = L.length;
  return [s, e];
}
// 取一节内的全部表格，每张表 {head, rows}（跳过代码块）
function tables(range) {
  const out = []; if (!range) return out;
  let cur = null, code = false;
  for (let i = range[0] + 1; i < range[1]; i++) {
    const l = L[i];
    if (/^```/.test(l)) { code = !code; cur = null; continue; }
    if (code) continue;
    if (/^\|/.test(l)) {
      if (!cur) { cur = { head: cells(l).map(plain), rows: [], sep: false }; out.push(cur); continue; }
      if (!cur.sep && /^\|\s*:?-{3}/.test(l)) { cur.sep = true; continue; }
      if (cur.sep) cur.rows.push(cells(l));
    } else cur = null;
  }
  return out;
}

// ---- 取数 ----
const secA = section('## §2 '), secB = section('## §3 '), sec4 = section('## §4 '), sec6 = section('## §6 '), sec1 = section('## §1 ');
const aRows = []; let zeroKindCol = false; // {no, vol, kind}
for (const t of tables(secA)) {
  const ki = t.head.indexOf('zeroKind'); if (ki >= 0) zeroKindCol = true;
  for (const c of t.rows) { const m = (c[0] ?? '').match(/^(\d+\.\d+)\b/); if (m) aRows.push({ no: m[1], vol: (c[1] ?? '').match(VOLTOK)?.[0] ?? '?', kind: ki >= 0 ? plain(c[ki] ?? '') : '' }); }
}
const bRows = []; // 10 #、主归卷
for (const t of tables(secB)) {
  const mi = t.head.findIndex(h => /^主归卷/.test(h));
  for (const c of t.rows) { const m = (c[0] ?? '').match(/^(\d+\.\d+)\b/); if (m && mi >= 0) bRows.push({ no: m[1], vol: (c[mi] ?? '').match(VOLTOK)?.[0] ?? null }); }
}
const text6 = sec6 ? L.slice(sec6[0], sec6[1]).join('\n') : '';

// 1 A 表行数
const titleA = L.slice(secA?.[0] ?? 0, (secA?.[0] ?? 0) + 3).join(' ').match(/(\d+)\s*个子系统/);
check('1 A 表行数与标题、§6 合计一致', aRows.length === 234 && (!titleA || +titleA[1] === aRows.length) && new RegExp(`\\*\\*合计\\*\\*\\s*\\|\\s*\\*\\*${aRows.length}\\*\\*`).test(text6), `读到 ${aRows.length} 行；标题 ${titleA?.[1] ?? '无'}`);
check('1b A 表条目编号不重复', new Set(aRows.map(r => r.no)).size === aRows.length, `不重复 ${new Set(aRows.map(r => r.no)).size}`);

// 2 zeroKind 四值与计数
const kinds = new Map(); for (const r of aRows) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
const legal = ['rebuild', 'adopt', 'process', 'exclude'];
const sent = text6.match(/A 表\s*纳入\s*(\d+)、已有→改建\s*(\d+)、流程\s*(\d+)/);
check('2 A 表每行有 zeroKind 且只取四值，计数与 §6 处理分类句一致', zeroKindCol && [...kinds.keys()].every(k => legal.includes(k)) && !!sent && (kinds.get('adopt') ?? 0) === +sent[1] && (kinds.get('rebuild') ?? 0) === +sent[2] && (kinds.get('process') ?? 0) === +sent[3], `adopt ${kinds.get('adopt') ?? 0}、rebuild ${kinds.get('rebuild') ?? 0}、process ${kinds.get('process') ?? 0}、exclude ${kinds.get('exclude') ?? 0}；非法值 ${[...kinds.keys()].filter(k => !legal.includes(k)).join('、') || '无'}`);

// 3 spotKey 唯一且连续；总数与 §0.8 声明一致
const sec35 = section('### 3.5 ') ?? section('## §3.5 ');
const spots = [];
{ const s = L.findIndex(l => /^#+ .*3\.5/.test(l)); let e = L.findIndex((l, i) => i > s && /^## /.test(l)); if (s >= 0) { if (e < 0) e = L.length;
  for (let i = s; i < e; i++) { const l = L[i]; if (!/^\|/.test(l)) continue; const c = cells(l); const hit = c.filter(x => /^Z35-\d{3}$/.test(plain(x))); if (hit.length === 1) spots.push(plain(hit[0])); } } }
const sorted = [...spots].sort();
const seq = sorted.every((k, i) => k === 'Z35-' + String(i + 1).padStart(3, '0'));
const declared = (L.join('\n').match(/Z35-001`?[…\.]+`?Z35-(\d{3})/) ?? [])[1];
check('3 spotKey 唯一、连续，总数与声明一致', new Set(spots).size === spots.length && seq && !!declared && +declared === spots.length, `表内 ${spots.length} 个，不重复 ${new Set(spots).size}，连续 ${seq}，声明末号 ${declared ?? '无'}`);

// 4 §4 的 41 项与 aRows
const items = [];
for (const t of tables(sec4)) { const ai = t.head.findIndex(h => h === 'aRows'); if (ai < 0) continue; for (const c of t.rows) { if (/^\d+\.\d+$/.test(c[0] ?? '')) items.push({ no: c[0], a: [...(c[ai] ?? '').matchAll(/\d+\.\d+/g)].map(m => m[0]) }); } }
const aSet = new Set(aRows.map(r => r.no));
const missing = items.flatMap(i => i.a.filter(a => !aSet.has(a)).map(a => `${i.no}→${a}`));
check('4 §4 共 41 项，每项 aRows 非空且都在 A 表里', items.length === 41 && items.every(i => i.a.length > 0) && missing.length === 0, `项数 ${items.length}；空 aRows ${items.filter(i => i.a.length === 0).length} 项；在 A 表找不到 ${missing.length} 个${missing.length ? '：' + missing.slice(0, 5).join('、') : ''}`);

// 5 §1 的 # 与 splitFrom
const seqs = new Map(); const splits = [];
for (const t of tables(sec1)) { const qi = t.head.indexOf('#'), si = t.head.indexOf('splitFrom'); if (qi < 0 || si < 0) continue; for (const c of t.rows) { const q = c[qi] ?? '', p = c[si] ?? ''; if (/^\d+$/.test(q)) { seqs.set(+q, (seqs.get(+q) ?? 0) + 1); if (/^\d+$/.test(p)) splits.push([+q, +p]); } } }
const dup = [...seqs].filter(([, n]) => n > 1).length;
const bad = splits.filter(([, p]) => !seqs.has(p));
check('5 §1 卷记录的 "#" 不重复，splitFrom 都指到已有的 "#"', seqs.size > 0 && dup === 0 && bad.length === 0 && splits.length > 0, `"#" ${seqs.size} 个，重号 ${dup}，splitFrom ${splits.length} 个，指不到 ${bad.length} 个`);

// 6 §6 各卷子系统计数与 A/B 表主归行数
const cntA = new Map(), cntB = new Map();
for (const r of aRows) cntA.set(r.vol, (cntA.get(r.vol) ?? 0) + 1);
let bUn = 0; for (const r of bRows) { if (r.vol) cntB.set(r.vol, (cntB.get(r.vol) ?? 0) + 1); else bUn++; }
const stat = [];
for (const t of tables(sec6)) { if (!(t.head[0] === '卷' && t.head.length >= 4)) continue; for (const c of t.rows) { const m = plain(c[0]).match(VOLTOK); stat.push({ vol: m ? m[0] : null, a: +plain(c[1]).replace(/\*/g, ''), b: +plain(c[2]).replace(/\*/g, ''), label: plain(c[0]) }); } }
const diffs = [];
for (const s of stat) { if (!s.vol) continue; if ((cntA.get(s.vol) ?? 0) !== s.a) diffs.push(`${s.vol} A 表 ${cntA.get(s.vol) ?? 0}≠${s.a}`); if ((cntB.get(s.vol) ?? 0) !== s.b) diffs.push(`${s.vol} B 表 ${cntB.get(s.vol) ?? 0}≠${s.b}`); }
const inStat = new Set(stat.map(s => s.vol));
for (const v of [...cntA.keys(), ...cntB.keys()]) if (!inStat.has(v)) diffs.push(`${v} 在 A/B 表有行但 §6 没有这一行`);
check('6 §6 各卷子系统计数与 A、B 表主归行数一致', stat.length > 0 && diffs.length === 0 && bRows.length === 223 && bUn === 15, `§6 ${stat.length} 行；B 表 ${bRows.length} 行（不归卷 ${bUn}）；差异 ${diffs.length}${diffs.length ? '：' + diffs.slice(0, 4).join('；') : ''}`);

// 7 别卷引用卷零的节号存在
const heads = new Set();
for (const l of L) { const m = l.match(/^#{2,5}\s+§?(\d+(?:\.\d+)*[a-z]?)\b/); if (m) heads.add(m[1]); }
const have = n => heads.has(n) || [...heads].some(h => h.startsWith(n + '.') || h.startsWith(n));
const refs = []; const unknown = [];
for (const f of readdirSync(DIR).filter(x => /^卷.+\.md$/.test(x) && !x.startsWith('卷零-'))) {
  readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/).forEach((l, i) => { for (const m of l.matchAll(/卷零\s*§(\d+(?:\.\d+)*)/g)) { refs.push(1); if (!have(m[1])) unknown.push(`${f.split('-')[0]}:${i + 1}:§${m[1]}`); } });
}
check('7 别卷引用卷零的节号在卷零里都有', refs.length > 0 && unknown.length === 0, `引用 ${refs.length} 处，找不到 ${unknown.length} 处${unknown.length ? '：' + unknown.slice(0, 5).join('、') : ''}`);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name} — ${r.detail}`);
const fails = results.filter(r => !r.ok).length;
console.log(`断言 ${results.length} 项；失败 ${fails} 项`);
process.exit(fails ? 1 : 0);
