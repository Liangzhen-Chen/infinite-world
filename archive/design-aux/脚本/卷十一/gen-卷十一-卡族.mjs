// 卷十一 卡族表生成器（第二版）。只读各卷成稿，输出 markdown 到标准输出；不改任何卷。
// 程序代码里没有卷名、表名的字面量（卷十一 §6 末段、R11-2.9）：
//   输入位置取自同目录 gen-卷十一-inputs.json（R11-2.1 的输入清单，是数据）；
//   写卷波取卷一依赖图；拆卷取卷零 §1 加卷记录表的"#"列（卷主键）与机读列 splitFrom（写来源卷的"#"），按"#"查卷；表主取卷二各表节内的机读行 `owner`（卷零 §1 序号，按序号查卷）；
//   卷零 A 表处理代号取机读列 zeroKind；§3.5 逐处处置取机读列 spotKey。
//   这些字段未落地时，相应格子与汇总句写"待字段落地"并在末行列出，不回退为字面量。
// 迁移行 = 带迁移行编号（M<卷>-<n>）的表格行（R11-2.2）；不带编号的表格不计。
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CFG = JSON.parse(readFileSync(fileURLToPath(import.meta.url).replace(/-卡族\.mjs$/, '-inputs.json'), 'utf8'));
const DIR = fileURLToPath(new URL('../..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, ''); // 取脚本所在位置，不写死盘符
const files = readdirSync(DIR).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const read = f => readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/);
const VOL = () => new RegExp(CFG.volCode, 'g');
const firstVol = s => (s.match(VOL()) ?? [null])[0];
const volOf = f => f.split('-')[0];
const PEND = '待字段落地';
// 输出里提到输入卷与节时，名字取自输入位置数据，不写字面量
const V0 = volOf(CFG.coverage.file), V1 = volOf(CFG.charter.file), V2 = volOf(CFG.registry.file);
const sl = p => { const t = p.replace(/^#+ /, '').trim().replace(/\.$/, ''); return t.startsWith('§') ? t : '§' + t; };
const pending = new Set();

const level = h => h.match(/^#+/)[0].length;
function section(L, prefix) {
  const s = L.findIndex(l => l.startsWith(prefix));
  if (s < 0) return null;
  const lv = level(prefix);
  let e = L.findIndex((l, i) => i > s && /^#+ /.test(l) && level(l) <= lv);
  if (e < 0) e = L.length;
  return [s, e];
}
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
function tables(L, range) {
  const out = []; if (!range) return out;
  let cur = null, inCode = false;
  for (let i = range[0] + 1; i < range[1]; i++) {
    const l = L[i];
    if (/^```/.test(l)) { inCode = !inCode; cur = null; continue; }
    if (inCode) continue;
    if (/^\|/.test(l)) {
      // 表头单元格去代码引号后再按列名匹配（机读列名在表头里写作 `name`）；数据行不动
      if (!cur) { cur = { head: cells(l).map(h => h.replace(/`/g, '')), rows: [], sep: false }; out.push(cur); continue; }
      if (!cur.sep && /^\|\s*:?-{3}/.test(l)) { cur.sep = true; continue; }
      if (cur.sep) cur.rows.push(cells(l));
    } else cur = null;
  }
  return out;
}
const countRows = (L, prefix) => tables(L, section(L, prefix)).reduce((a, t) => a + t.rows.length, 0);

// 1 写卷波：卷一依赖图代码块（波只是写卷顺序，R11-7.1；这里只作显示与"无成稿卷"清单）
const charter = read(CFG.charter.file);
const gr = section(charter, CFG.charter.graph);
const wave = new Map();
{ let inF = false, acc = []; const mark = new RegExp(CFG.charter.waveMark);
  for (let i = gr[0]; i < gr[1]; i++) {
    const l = charter[i];
    if (/^```/.test(l)) { if (inF) break; inF = true; continue; }
    if (!inF) continue;
    const w = l.match(mark);
    acc.push(...((w ? l.replace(w[0], '') : l).match(VOL()) ?? []));
    if (w) { for (const n of acc) if (!wave.has(n)) wave.set(n, +w[1]); acc = []; }
  } }

// 2 拆卷：卷零 §1 加卷记录表的"#"列是卷主键，机读列 splitFrom 写来源卷的"#"；两者都按"#"查该表的卷列（李白 11-14）
const cov = read(CFG.coverage.file);
const seqVol = new Map(); // 序号 → 卷
for (const t of tables(cov, section(cov, CFG.coverage.addVol))) {
  const qi = t.head.indexOf(CFG.fields.seq), vi = t.head.indexOf(CFG.fields.volCol);
  if (qi < 0 || vi < 0) continue;
  for (const c of t.rows) { const q = (c[qi] ?? '').trim(), v = firstVol(c[vi] ?? ''); if (/^\d+$/.test(q) && v) seqVol.set(+q, v); }
}
const split = new Map(); let splitLanded = false;
for (const t of tables(cov, section(cov, CFG.coverage.addVol))) {
  const qi = t.head.indexOf(CFG.fields.seq), si = t.head.indexOf(CFG.fields.splitFrom);
  if (qi < 0 || si < 0) continue;
  splitLanded = true;
  for (const c of t.rows) {
    const q = (c[qi] ?? '').trim(), p = (c[si] ?? '').trim();
    if (!/^\d+$/.test(q) || !/^\d+$/.test(p)) continue;
    const v = seqVol.get(+q), pv = seqVol.get(+p);
    if (v && pv) split.set(v, pv);
    else pending.add(`${V0} ${sl(CFG.coverage.addVol)} 第 ${q} 行 ${CFG.fields.splitFrom} 的"${CFG.fields.seq}"查不到卷`);
  }
}
if (!splitLanded) pending.add(`${V0} ${sl(CFG.coverage.addVol)} 加卷记录表"${CFG.fields.seq}"列与机读列 ${CFG.fields.splitFrom}（C11-1）`);

// 3 卷零 A 表：主归卷与处理代号
const aRows = new Map(); let aTotal = 0, kindLanded = false; const kindCount = new Map();
for (const t of tables(cov, section(cov, CFG.coverage.tableA))) {
  const ki = t.head.indexOf(CFG.fields.zeroKind);
  if (ki >= 0) kindLanded = true;
  for (const c of t.rows) {
    if (!/^\d+\.\d+/.test(c[0] ?? '')) continue;
    aTotal++;
    const mv = firstVol(c[1] ?? '') ?? '?';
    aRows.set(mv, (aRows.get(mv) ?? 0) + 1);
    if (ki >= 0) { const k = (c[ki] ?? '').replace(/`/g, '').trim(); kindCount.set(k, (kindCount.get(k) ?? 0) + 1); } // 机读代号格同样写作 `code`
  }
}
if (!kindLanded) pending.add(`${V0} A 表机读列 ${CFG.fields.zeroKind}（rebuild、adopt、process、exclude；C11-1）`);

// 4 卷零 §3.5 逐处处置（稳定行号）与 §4 已有项、卷一 §5.4、卷二 §6.11
let spots = null;
for (const t of tables(cov, section(cov, CFG.coverage.spots))) { const i = t.head.indexOf(CFG.fields.spotKey); if (i >= 0) spots = (spots ?? 0) + t.rows.length; }
if (spots === null) pending.add(`${V0} ${sl(CFG.coverage.spots)} 逐处处置机读列 ${CFG.fields.spotKey}（C11-1）`);
const existing = countRows(cov, CFG.coverage.existing);
const retireRows = countRows(charter, CFG.charter.retire);
const reg = read(CFG.registry.file);
const moveRows = countRows(reg, CFG.registry.filemoves);

// 5 表主：卷二各表节内的机读行 `owner` 写卷零 §1 加卷记录表的序号；按序号查该表的卷列（seqVol 见第 2 步），不读卷二节标题里的卷名
const tableOwner = new Map(); // 表代号 → 卷 或 null
{ let cur = null;
  for (const l of reg) {
    if (/^#+ /.test(l)) {
      cur = null;
      if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) { cur = m[1]; tableOwner.set(cur, null); } }
      continue;
    }
    if (cur && l.startsWith('- `' + CFG.fields.owner + '`')) { const m = l.slice(CFG.fields.owner.length + 4).match(/\d+/); tableOwner.set(cur, m ? seqVol.get(+m[0]) ?? null : null); }
  } }
const ownerMissing = [...tableOwner].filter(([, v]) => !v).map(([t]) => t);
const ownerLanded = ownerMissing.length === 0 && tableOwner.size > 0;
if (!ownerLanded) pending.add(`${V2}各表机读表主字段 ${CFG.fields.owner}（缺 ${ownerMissing.length} / ${tableOwner.size} 类；C11-3）`);
const owned = v => [...tableOwner].filter(([, o]) => o === v).map(([t]) => t);

// 6 各卷迁移行（带编号的表格行）
const migRe = new RegExp(CFG.migRow);
const out = [];
for (const f of files) {
  const v = volOf(f), L = read(f);
  let h2 = '', inCode = false, n = 0; const secs = new Set();
  for (const l of L) {
    if (/^```/.test(l)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (/^## /.test(l)) h2 = l.split(' ')[1];
    if (/^\|/.test(l)) { const c = cells(l); if (migRe.test((c[0] ?? '').replace(/\*/g, '')) && c.filter(x => /^同 (?:M|Z35-)\d/.test(x.replace(/`/g, ''))).length < 3) { n++; secs.add(h2); } } // 带"同 Mxx-y"别名格的行不单独计数（李白 11-15 16:05 总原则）
  }
  const w = wave.has(v) ? wave.get(v) : split.has(v) ? wave.get(split.get(v)) : undefined;
  const has7 = w !== 0 && L.some(l => l.startsWith(CFG.migSection)); // 波 0 是前置三卷，不是领域卷（R11-2.1 只收领域卷的迁移节）
  out.push({ v, w, n, secs: [...secs], has7 });
}
const waveCell = r => r.w !== undefined ? String(r.w) : splitLanded ? '不在依赖图' : `${PEND}（拆卷）`;
const secCell = r => r.n ? r.secs.join('、') : r.has7 ? CFG.migSection.replace(/^#+ /, '').trim() + '（未编号）' : '—';
// 拆出卷先写本卷自己主归的行数；来源卷没有同名成稿（已退役）时，再附来源卷名下剩下的行数，由各拆出卷分担
const aCell = r => { const own = String(aRows.get(r.v) ?? 0), parent = split.get(r.v); if (parent && !out.some(x => x.v === parent)) return `${own}（与 ${parent} 合计 ${aRows.get(parent) ?? 0}）`; return own; };
const tabCell = r => !ownerLanded ? PEND : (owned(r.v).map(t => '`' + t + '`').join('、') || '—');
const firstCell = r => !ownerLanded ? PEND : (owned(r.v).length ? String(owned(r.v).length) : (r.has7 ? '≥ 1（系统登记项）' : '—'));
out.sort((x, y) => ((x.w ?? 99) - (y.w ?? 99)) || x.v.localeCompare(y.v, 'zh'));

console.log(`| 卷 | 写卷波 | 迁移节 | 编号迁移行 | ${V0} A 行（主归本卷） | 本卷为表主的维度表 | 首卡数 |`);
console.log('|---|---|---|---:|---|---|---|');
for (const r of out) console.log(`| ${r.v} | ${waveCell(r)} | ${secCell(r)} | ${r.n} | ${aCell(r)} | ${tabCell(r)} | ${firstCell(r)} |`);
console.log('');

const numbered = out.filter(r => r.n > 0), unnumbered = out.filter(r => r.n === 0 && r.has7);
const fileVols = new Set(out.map(r => r.v));
const noFile = [...wave.keys()].filter(v => !fileVols.has(v) && ![...split.values()].includes(v));
const notInGraph = out.filter(r => r.w === undefined).map(r => r.v);
const tierA = { mig: 0, nomig: 0, nofile: 0 }; const nomigVols = new Set(), nofileVols = new Set();
for (const [mv, k] of aRows) {
  const r = out.find(x => x.v === mv);
  if (!r) { tierA.nofile += k; nofileVols.add(mv); } else if (r.has7) tierA.mig += k; else { tierA.nomig += k; nomigVols.add(mv); }
}
console.log(`输入行数：各卷编号迁移行 ${numbered.reduce((a, r) => a + r.n, 0)} 行（已编号 ${numbered.length} 卷；有 §7 迁移节而未编号 ${unnumbered.length} 卷：${unnumbered.map(r => r.v).join('、') || '无'}）；${V0} A 表 ${aTotal} 行；${V0} ${sl(CFG.coverage.spots)} 逐处处置 ${spots ?? PEND}；${V0} ${sl(CFG.coverage.existing)} 表格数据行 ${existing}；${V1} ${sl(CFG.charter.retire)} 表格数据行 ${retireRows || "0（该节不是表格，待编号，C11-2）"}；${V2} ${sl(CFG.registry.filemoves)} 表格数据行 ${moveRows}。`);
console.log(`${V0} A 行按主归卷分四档：有 §7 迁移节的卷 ${tierA.mig} 行；有成稿、无 §7 迁移节的卷 ${tierA.nomig} 行（${[...nomigVols].join('、') || '无'}）；没有同名成稿的卷 ${tierA.nofile} 行（${[...nofileVols].join('、') || '无'}）；处理代号为流程的行 ${kindLanded ? (kindCount.get('process') ?? 0) : PEND}（与前三档交叠计）。`);
console.log(`维度表 ${tableOwner.size} 类（${V2} ${sl(CFG.registry.tables)} 带表代号的节）；表主 ${ownerLanded ? '已登记' : PEND}。`);
console.log(`依赖图里没有同名成稿的卷 ${noFile.length} 个：${noFile.map(v => `${v}（波 ${wave.get(v)}）`).join('、') || '无'}${splitLanded ? '' : `（已拆为多份成稿的卷待${V0}拆卷字段落地后从此列剔除）`}。`);
console.log(`有成稿而不在依赖图里的卷：${notInGraph.join('、') || '无'}${splitLanded ? '' : `（写卷波${PEND}）`}。`);
console.log(`待字段落地：${[...pending].join('；') || '无'}。`);
