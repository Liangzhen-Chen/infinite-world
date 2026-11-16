// 乙-7（李白 11-16 01:25 第 4 条；要点表 审查/乙7-无节号行-设计要点表.md N1–N4）：迁移行落点补节号的候选清单。
// 只读卷文与 脚本/卷十一/migrows-input.json，确定性；不按行号、条目号、卷名特判。
// 名单（N1）：与 gen-card-ledger.mjs 的 rowSection 同口径——落点里没有节号（"§n"）也没有能对上卷的规则编号（R<卷>-a.b）的非别名行。
// 判定（N2/N3）：只看本行原文已写出的依据——
//   ① 本行写的规则编号 R<卷序号>-…：在该卷里按 id-defs.mjs 的定义位认定义，定义行所在标题的节号恰一个，即为该节；
//   ② 本行写的、登记在某卷 §3 入口表里的入口名（与生成器同口径收入口）：该入口的定义节（"节"栏，无此栏取本行节号）恰一个，即为该节。
//   一行所有依据给出的（卷、节）合起来恰一个才补；零个或多个都标"节号待补"。落点栏写"同 Mxx"的行指向别行，不借别行的节号，标待补。
// 写法：补节号的节在本行所在卷写"（§x.y）"，在别卷写"（卷X §x.y）"（生成器对裸"§n"取来源卷，别卷须带卷名才落得对）。
// 用法：node 乙7-无节号候选.mjs [--write]   不带参数只打印；--write 写 审查/脚本输出/乙7-无节号-候选清单.md
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanVolume, volNo, TOK } from '../卷十一/id-defs.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/../卷十一/gen-卷十一-inputs.json`, 'utf8'));
const DIR = CFG.dir;
// --at <提交>：卷文、迁移行转录、卡账都按该提交读（git show，只读）；候选清单是改卷文前的读数，在改后的任何提交上用
//   --at <改前提交> 重跑都得出同一份清单（N4）。不带 --at 读工作区。
const AT = (() => { const i = process.argv.indexOf('--at'); return i >= 0 ? process.argv[i + 1] : null; })();
const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', '-C', DIR, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const rd = rel => AT ? git('show', `${AT}:./${rel}`) : readFileSync(`${DIR}/${rel}`, 'utf8');
const lsDir = () => AT ? git('ls-tree', '--name-only', AT, './').split('\n').filter(Boolean) : readdirSync(DIR);
const mig = JSON.parse(rd('脚本/卷十一/migrows-input.json'));
const rows = mig.rows.filter(r => !r.aliasOf);
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const uniq = a => [...new Set(a)];
const V = CFG.volCode.replace(/^\^|\$$/g, '');

const volText = new Map();
for (const f of lsDir().filter(f => new RegExp(CFG.volFile).test(f)).sort()) volText.set(f.split('-')[0], { f, ls: rd(f).split(/\r?\n/) });
const VOLS = [...volText.keys()];
const byVolNo = new Map(); for (const v of VOLS) { const n = volNo(v); if (n) byVolNo.set(n.n + n.letter, v); }

// ---- 与 gen-card-ledger.mjs 同口径：迁移行的"卷、节" ----
function rowSection(r) {
  const t = String(r.target ?? '');
  const a = t.match(new RegExp(`(?:(${V})\\s*)?§\\s*([0-9]+(?:\\.[0-9]+)*)`)); const b = t.match(/(?<![A-Za-z0-9])R([0-9]+)([a-z]?)-([0-9]+)\.[0-9]/);
  const ra = a ? { at: a.index } : null, rb = b && byVolNo.get(b[1] + b[2]) ? { at: b.index } : null;
  return ra ?? rb;
}

// ---- 与 gen-card-ledger.mjs 同口径：各卷 §3 入口表 ----
const secOfRule = (vol, t) => {
  const out = []; const own = volNo(vol);
  for (const m of t.matchAll(/§\s*([0-9]+(?:\.[0-9]+)*)/g)) { const pre = t.slice(Math.max(0, m.index - 8), m.index); if (!new RegExp(`(${V})\\s*$`).test(pre)) out.push(m[1]); }
  for (const m of t.matchAll(/(?<![A-Za-z0-9])R([0-9]+)([a-z]?)-([0-9]+)\.[0-9]/g)) if (own && m[1] === own.n && m[2] === own.letter) out.push('4.' + m[3]);
  return out;
};
const leadName = s => { const m = s.trim().match(/^`([A-Za-z_$][A-Za-z0-9_$]*)(\([^`]*\))?(\.[A-Za-z]|`?\.)?/); return m && !m[3] ? m[1] : null; };
const entryDefs = new Map(); // 入口名 → [{vol, secs}]
for (const [v, { ls }] of volText) {
  let in3 = false, sub = null, head = null, code = false, retired = false;
  const add = (n, secs) => { if (!entryDefs.has(n)) entryDefs.set(n, []); entryDefs.get(n).push({ vol: v, secs }); };
  for (const l of ls) {
    if (/^```/.test(l)) { code = !code; head = null; continue; } if (code) continue;
    if (/^## /.test(l)) { in3 = /^## §?3[ .]/.test(l); sub = null; head = null; continue; }
    const h3 = l.match(/^### (?:§)?(3\.[0-9]+)(.*)$/); if (h3) { in3 = true; sub = '§' + h3[1]; retired = /退役/.test(h3[2]); head = null; continue; }
    if (/^### /.test(l)) { in3 = false; head = null; continue; }
    if (!in3 || !sub || retired) continue;
    const li = l.match(/^[-*]\s+(`[^`]+`)/);
    if (li) { head = null; const n = leadName(li[1]); if (n && /\(/.test(li[1])) add(n, secOfRule(v, l)); continue; }
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l); if (!head) { head = c; continue; } if (/^:?-{3}/.test(c[0] ?? '')) continue;
    if (!/入口/.test(head[0] ?? '')) continue;
    const si = head.findIndex(h => /节/.test(h));
    const secs = secOfRule(v, si >= 0 ? c[si] ?? '' : c.join(' '));
    for (const part of (c[0] ?? '').split(/[、，]/)) { const n = leadName(part); if (n) add(n, secs); }
  }
}

// ---- 规则编号的定义节：id-defs.mjs 的定义位，定义行所在最深一级带节号的标题 ----
const ruleDefs = new Map(); // 卷 → Map(tok → [节])
function secAtLine(ls, line) {
  for (let i = line - 1; i >= 0; i--) { const h = ls[i].match(/^#{1,6}\s+§?\s*([0-9]+(?:\.[0-9]+)*)(?![0-9])/); if (h) return h[1]; if (/^#{1,6}\s/.test(ls[i]) && /^#\s/.test(ls[i])) return null; }
  return null;
}
function rulesOf(vol) {
  if (ruleDefs.has(vol)) return ruleDefs.get(vol);
  const { ls } = volText.get(vol); const m = new Map();
  for (const d of scanVolume(ls, vol)) { const s = secAtLine(ls, d.line); if (!m.has(d.tok)) m.set(d.tok, []); m.get(d.tok).push({ sec: s, nature: d.nature }); }
  ruleDefs.set(vol, m); return m;
}

function titleOf(vol, sec) {
  for (const l of volText.get(vol).ls) { const h = l.match(/^#{1,6}\s+§?\s*([0-9]+(?:\.[0-9]+)*)\s+(.*)$/); if (h && h[1] === sec) return h[2].trim(); }
  return '';
}

// ---- 迁移表落点栏：与 transcribe-migrows.mjs 同口径找栏 ----
const strip = s => s.replace(/`/g, '').trim();
function tgtCol(head) {
  const h = head.map(strip);
  const a = h.findIndex(x => /落点/.test(x) && !/落点对象/.test(x)); if (a >= 0) return a;
  const b = h.findIndex(x => x === '对应 §'); if (b >= 0) return b;
  return h.findIndex(x => x === '去向');
}
function headOf(ls, line) { let i = line - 1; while (i > 0 && /^\|/.test(ls[i - 1])) i--; return cells(ls[i]); }

// 名单与卡账摘要同口径：生成器只对领域对象卡（非搬迁卡，即 first、follow、ledger_child）的行取 entries
const ledger = JSON.parse(rd('审查/脚本输出/卡账-v0.json'));
const inObjCard = new Set(ledger.cards.filter(c => ['first', 'follow', 'ledger_child'].includes(c.cardKind)).flatMap(c => c.rowKeys ?? []));
const allNosec = rows.filter(r => !rowSection(r));
const nosec = allNosec.filter(r => inObjCard.has(r.rowKey));
console.log(`落点无节号的非别名行 ${allNosec.length}；其中在领域对象卡里（卡账摘要口径）${nosec.length}；不在的 ${allNosec.filter(r => !inObjCard.has(r.rowKey)).map(r => r.rowKey).join('、')}`);
const out = [];
for (const r of nosec) {
  const { f, ls } = volText.get(r.volume); const l = ls[r.srcLine - 1]; const c = cells(l);
  const ti = tgtCol(headOf(ls, r.srcLine)); const tcell = c[ti] ?? '';
  const ev = []; // {by, vol, sec}
  const bad = []; // 挡补：依据本身落不到唯一一节
  const note = []; // 只记不挡：不是规则编号的编号
  if (/^同\s*M/.test(strip(tcell))) bad.push('落点指向别行');
  else {
    // ① 规则编号（落点栏）：编号写了卷序号的到该卷找定义，没写的在本行所在卷找；只认规则类定义（id-defs.mjs 性质判法）
    for (const m of tcell.matchAll(new RegExp('(?<![A-Za-z0-9])' + TOK + '(?![0-9A-Za-z])', 'g'))) {
      const t = m[0]; const vm = t.match(/^[A-Z][A-Za-z]{0,3}?([0-9]+)([a-z]?)-/);
      // 编号前紧跟卷名（"卷三乙 R-4"）的取该卷，与生成器"卷X §n"同口径
      const pv = tcell.slice(Math.max(0, m.index - 8), m.index).match(new RegExp(`(${V})\\s*$`));
      const vol = vm ? byVolNo.get(vm[1] + vm[2]) : pv ? pv[1] : r.volume; if (!vol || !volText.has(vol)) { bad.push(`${t} 对不上卷`); continue; }
      const ds = rulesOf(vol).get(t) ?? [];
      if (!ds.length) { bad.push(`${t} 在${vol}无定义`); continue; }
      // 定义全不是规则类的（断言号、扫描号等）不是规则编号，不作依据也不挡；有规则类定义的，全部定义须恰在一节
      if (!ds.some(d => d.nature === '规则类')) { note.push(`${t} 不是规则编号（${uniq(ds.map(d => d.nature)).join('、')}）`); continue; }
      const secs = uniq(ds.map(d => d.sec));
      if (secs.length === 1 && secs[0]) ev.push({ by: t, vol, sec: secs[0] }); else bad.push(`${t} 在${vol}定义于 ${secs.length} 节`);
    }
    // ② §3 入口名（落点栏的标识符）
    for (const n of uniq([...tcell.matchAll(/(?<![A-Za-z0-9_$.\/])[A-Za-z_$][A-Za-z0-9_$]*/g)].map(m => m[0]))) {
      const ds = entryDefs.get(n); if (!ds) continue;
      const pairs = uniq(ds.flatMap(d => d.secs.map(s => d.vol + ' §' + s)));
      if (pairs.length === 1) { const [vol, sec] = pairs[0].split(' §'); ev.push({ by: n, vol, sec }); } else bad.push(`${n} 定义节 ${pairs.length} 个`);
    }
  }
  let pairs = uniq(ev.map(e => e.vol + ' §' + e.sec));
  // ③ 依据栏反查（李白 11-16 02:53 L1）：落点栏没给出任何节、也没有挡补项时，读本行表头含"依据"的栏里的规则号；
  //   规则号须全书只定义在一节（各卷定义合起来恰一个"卷、节"），且该栏所有规则号给出同一节；否则仍待补
  let via = '';
  const ji = headOf(ls, r.srcLine).findIndex(h => /依据/.test(h) && !/落点/.test(h));
  if (!bad.length && !pairs.length && ji >= 0) {
    const jcell = c[ji] ?? ''; const jev = [], jbad = [];
    for (const m of jcell.matchAll(new RegExp('(?<![A-Za-z0-9])' + TOK + '(?![0-9A-Za-z])', 'g'))) {
      const t = m[0]; const vm = t.match(/^[A-Z][A-Za-z]{0,3}?([0-9]+)([a-z]?)-/);
      const vols = vm ? [byVolNo.get(vm[1] + vm[2])].filter(Boolean) : VOLS; // 写了卷序号的只在该卷有定义；没写的查全书
      const ds = vols.flatMap(v => (rulesOf(v).get(t) ?? []).map(d => ({ ...d, vol: v })));
      if (!ds.some(d => d.nature === '规则类')) continue;
      const ps = uniq(ds.map(d => d.vol + ' §' + d.sec));
      if (ps.length === 1 && ds[0].sec) jev.push({ by: t + '（依据栏）', vol: ds[0].vol, sec: ds[0].sec }); else jbad.push(`依据栏 ${t} 全书定义于 ${ps.length} 处`);
    }
    const jp = uniq(jev.map(e => e.vol + ' §' + e.sec));
    if (!jbad.length && jp.length === 1) { ev.push(...jev); pairs = jp; via = '，依据栏反查'; }
    else if (jbad.length || jp.length > 1) note.push(...jbad, ...(jp.length > 1 ? ['依据栏给出多节：' + jp.join('、')] : []));
  }
  const ok = !bad.length && pairs.length === 1;
  // 别卷的节照各卷跨卷引用写法带该节标题（"卷X §n（标题）"，如 check-卷十三 第 8 项所查）
  const add = ok ? (ev[0].vol === r.volume ? `（§${ev[0].sec}${via}）` : `（${ev[0].vol} §${ev[0].sec}（${titleOf(ev[0].vol, ev[0].sec)}）${via}）`) : '（节号待补）';
  const why = ok ? ev.map(e => e.by).join('、') : [...bad, ...(pairs.length > 1 ? ['依据给出多节：' + pairs.join('、')] : []), ...(!bad.length && !pairs.length ? ['落点栏没有规则编号或 §3 入口名'] : []), ...note].join('；');
  out.push({ k: r.rowKey, vol: r.volume, f, line: r.srcLine, tcell, ok, add, ev, bad, why });
}

const okN = out.filter(x => x.ok).length;
const lines = [
  '# 乙-7 无节号迁移行候选清单（脚本生成，勿手改）',
  '',
  `依据：李白 11-16 01:25 第 4 条；审查/乙7-无节号行-设计要点表.md N1–N4。脚本：脚本/全书/乙7-无节号候选.mjs。名单与 gen-card-ledger.mjs rowSection 同口径，共 ${out.length} 行；补节号 ${okN} 行，节号待补 ${out.length - okN} 行。`,
  '',
  `生成：\`node 乙7-无节号候选.mjs${AT ? ' --at ' + AT : ''} --write\`${AT ? `（读提交 ${AT} 的卷文、迁移行转录与卡账，即改卷文前的读数；在之后任何提交上照此命令重跑得出同一份清单）` : '（读工作区）'}。别卷的节写"卷X §n（该节标题）"。`,
  '',
  '| 编号 | 卷 | 卷文行 | 落点栏原文 | 处理 | 依据 |',
  '|---|---|---|---|---|---|',
  ...out.map(x => `| ${x.k} | ${x.vol} | ${x.line} | ${x.tcell.replace(/\|/g, '\\|')} | ${x.add} | ${x.why.replace(/\|/g, '\\|')} |`),
  '',
];
if (process.argv.includes('--write')) writeFileSync(`${DIR}/审查/脚本输出/乙7-无节号-候选清单.md`, lines.join('\n'));
console.log(`无节号 ${out.length} 行；补节号 ${okN}；待补 ${out.length - okN}`);
const perVol = {}; for (const x of out) { perVol[x.vol] ??= [0, 0]; perVol[x.vol][x.ok ? 0 : 1]++; }
console.log(Object.entries(perVol).map(([v, [a, b]]) => `${v}:${a}/${b}`).join(' '));

// ---- 编辑清单（N4：卷文写入由 Edit 逐处改，本段只算每处的唯一定位串）----
// --plan [--skip 卷A,卷B]：写 F:/dnd-tmp/乙7-plan.json：每行落点栏一处（old 为以落点栏末尾收尾、在全卷唯一的最短串，new 在其后接补写），
//   每卷封卷后勘误一行（接在该卷最后一条"封卷后勘误"表格行后，栏数照该行），以及收尾待办段落。--skip 的卷本卡不改，只列出。
// --snapshot pre|post：按 plan 的卷，pre 复制卷文到 版本快照/<卷>-v<N>-勘误前-<tag>.md，post 覆盖 版本快照/<卷>-v<N>.md（N 为现有最大版本）。
const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const TAG = '1116乙7';
const PLAN = 'F:/dnd-tmp/乙7-plan.json';
// 本卷勘误惯例（N5）：改后覆盖哪些快照，照该卷上一条（非本标签）写了"改后覆盖"的封卷后勘误
function afterTargets(ls) {
  let t = null;
  for (const l of ls) { if (l.includes(TAG)) continue; const i = l.indexOf('改后覆盖'); if (/封卷后勘误/.test(l) && i >= 0) { const seg = l.slice(i).split(/[）)]/)[0]; t = [...seg.matchAll(/版本快照\/[^，、；\s）)]+?\.md/g)].map(m => m[0]); } }
  return t?.length ? t : null;
}
// 迁移行所在节的写法：行上方最近的"## "标题的首词（"§5"、"六"、"§7"）
function migSecOf(ls, line) { for (let i = line - 1; i >= 0; i--) { const h = ls[i].match(/^##\s+(\S+)/); if (h) return h[1].replace(/[、.．]$/, ''); } return '迁移节'; }
function cellSpan(l, ti) { // 第 ti 栏（cells 下标）的内容在行内的 [起, 止)
  const bars = []; for (let i = 0; i < l.length; i++) if (l[i] === '|' && l[i - 1] !== '\\') bars.push(i);
  let s = bars[ti] + 1, e = bars[ti + 1]; while (l[s] === ' ') s++; while (e > s && l[e - 1] === ' ') e--; return [s, e];
}
const count = (txt, s) => { let n = 0, i = -1; while ((i = txt.indexOf(s, i + 1)) >= 0) n++; return n; };
function uniqueEndingAt(txt, lineStart, l, end, suffix, min = 6) {
  for (let s = Math.max(0, end - min); s >= 0; s--) { const cand = l.slice(s, end) + suffix; if (count(txt, cand) === 1) return cand; }
  return null;
}
if (process.argv.includes('--plan')) {
  const skip = new Set((arg('--skip') ?? '').split(',').filter(Boolean));
  const snapDir = `${DIR}/版本快照`; const snaps = readdirSync(snapDir);
  const plan = { tag: TAG, edits: [], errata: [], skipped: [], vols: [] };
  const byVol = new Map(); for (const x of out) { if (!byVol.has(x.vol)) byVol.set(x.vol, []); byVol.get(x.vol).push(x); }
  for (const [vol, xs] of byVol) {
    if (skip.has(vol)) { plan.skipped.push(...xs.map(x => ({ k: x.k, vol, add: x.add, why: x.why }))); continue; }
    const { f, ls } = volText.get(vol); const txt = ls.join('\n');
    for (const x of xs) {
      const l = ls[x.line - 1]; const ti = tgtCol(headOf(ls, x.line)); const [, e] = cellSpan(l, ti);
      const old = uniqueEndingAt(txt, 0, l, e, l.slice(e, e + 2));
      if (!old) throw new Error(`${x.k} 找不到唯一定位串`);
      plan.edits.push({ k: x.k, file: `${DIR}/${f}`, line: x.line, old, new: old.slice(0, old.length - l.slice(e, e + 2).length) + x.add + l.slice(e, e + 2) });
    }
    // 封卷后勘误行
    // 该卷最后一条带标签的封卷后勘误（"封卷后勘误 <标签>（依据"），照它的写法（表格行、列表项、段落）接一条
    let last = -1; ls.forEach((l, i) => { if (/封卷后勘误 [0-9]{4}[A-Za-z0-9]*（依据/.test(l)) last = i; });
    const vers = snaps.map(s => s.match(new RegExp(`^${vol}-v(\\d+)\\.md$`))).filter(Boolean).map(m => +m[1]);
    const ver = vers.length ? Math.max(...vers) : null;
    const fill = xs.filter(x => x.ok), pend = xs.filter(x => !x.ok);
    const after = afterTargets(ls) ?? [`版本快照/${vol}-v${ver}.md`];
    const main = `封卷后勘误 ${TAG}（依据：李白 11-16 01:25 第 4 条、乙-7；必要理由：迁移行落点栏没有节号，卡账 entries 取不到该行的卷节；不升版本号；改前快照 版本快照/${vol}-v${ver}-勘误前-${TAG}.md，改后覆盖 ${after.join('、')}）`;
    const detail = `${migSecOf(ls, xs[0].line)} 迁移行落点栏补节号 ${fill.length} 行（${fill.map(x => x.k + x.add).join('、') || '无'}；节号取本行落点栏所写规则编号或 §3 入口名的唯一定义节）；落不到唯一一节的 ${pend.length} 行加"（节号待补）"（${pend.map(x => x.k).join('、') || '无'}），列入 收尾待办.md 乙-7 段。逐行依据见 审查/脚本输出/乙7-无节号-候选清单.md，脚本 脚本/全书/乙7-无节号候选.mjs`;
    let row = null, anchor = null;
    let shape = null;
    if (last >= 0) {
      const L = ls[last];
      if (/^\|/.test(L)) {
        const c = cells(L); const k = c.findIndex(x => /封卷后勘误/.test(x));
        // 照上一条：序号栏加一，勘误栏写本条，其余栏照抄上一条（上一条各卷都是脚本写的勘误，其余栏为"—"或状态）
        const cs = c.map((x, i) => i === k ? main + '：' + detail : i < k && /^\d+$/.test(x) ? String(+x + 1) : x);
        row = '| ' + cs.join(' | ') + ' |'; shape = `表格行（${c.length} 栏，其余栏照抄 ${c.filter((x, i) => i !== k).join('/')}）`;
      } else if (/^\s*[-*]\s/.test(L)) { row = L.match(/^\s*[-*]\s+/)[0] + main + '：' + detail; shape = '列表项'; }
      else { row = '\n' + main + '：' + detail; shape = '段落'; }
      anchor = uniqueEndingAt(txt, 0, L, L.length, '', 20);
    }
    plan.errata.push({ vol, file: `${DIR}/${f}`, afterLine: last + 1, ver, shape, anchor, row });
    plan.vols.push({ vol, file: `${DIR}/${f}`, ver, fill: fill.map(x => x.k), pend: pend.map(x => ({ k: x.k, why: x.why })) });
  }
  // 收尾待办段落
  const todo = ['', `## 乙-7 节号待补（${TAG}；李白 11-16 01:25 第 4 条：查不到不推定）`, '', '各卷迁移节落点栏写不出唯一一节的行，已在落点栏后标"（节号待补）"；补法：由该卷作者写明落点的规则编号或 §3 入口名（且在本卷恰定义于一节）或直接写节号。逐行原因见 审查/脚本输出/乙7-无节号-候选清单.md。', ''];
  for (const v of plan.vols.filter(v => v.pend.length)) todo.push(`- ${v.vol}（${v.pend.length} 行）：${v.pend.map(p => p.k).join('、')}`);
  if (plan.skipped.length) { const sv = uniq(plan.skipped.map(s => s.vol)); todo.push(`- 本卡不改的卷（${sv.join('、')}）里的无节号行，卷文未动，候选结果照列：${plan.skipped.map(s => s.k + s.add).join('、')}`); }
  plan.todo = todo.join('\n');
  writeFileSync(PLAN, JSON.stringify(plan, null, 1));
  console.log(`plan：落点栏 ${plan.edits.length} 处，勘误 ${plan.errata.length} 卷（无勘误表的 ${plan.errata.filter(e => !e.row).map(e => e.vol).join('、') || '无'}；无快照版本的 ${plan.errata.filter(e => e.ver == null).map(e => e.vol).join('、') || '无'}），跳过 ${plan.skipped.length} 行`);
}
if (process.argv.includes('--print')) { // 只读打印 plan：卷文件、行、定位串 ⟶ 新串
  const plan = JSON.parse(readFileSync(PLAN, 'utf8')); let cur = null;
  for (const e of plan.edits) { if (e.file !== cur) { cur = e.file; console.log('## ' + e.file); } console.log(`${e.line}\t${e.old}\t⟶\t${e.new}`); }
  for (const e of plan.errata) console.log(`## 勘误 ${e.file} 行${e.afterLine} ${e.shape}\nANCHOR\t${e.anchor}\nROW\t${e.row}`);
}
const snap = arg('--snapshot');
if (snap === 'pre') {
  const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
  for (const v of plan.vols) { const to = `${DIR}/版本快照/${v.vol}-v${v.ver}-勘误前-${plan.tag}.md`; writeFileSync(to, readFileSync(v.file, 'utf8')); console.log(`pre ${to}`); }
}
// post：只读工作区卷文；凡带本标签勘误的卷，照该卷上一条勘误的"改后覆盖"对象写现卷文（不按最大版本号）
if (snap === 'post') {
  if (AT) throw new Error('--snapshot post 只用于工作区');
  for (const [vol, { f, ls }] of volText) {
    if (!ls.some(l => l.includes(`封卷后勘误 ${TAG}`))) continue;
    const t = afterTargets(ls); if (!t) { console.log(`${vol}：上一条勘误没写改后覆盖对象，未写`); continue; }
    for (const p of t) { writeFileSync(`${DIR}/${p}`, readFileSync(`${DIR}/${f}`, 'utf8')); console.log(`post ${p}`); }
  }
}
