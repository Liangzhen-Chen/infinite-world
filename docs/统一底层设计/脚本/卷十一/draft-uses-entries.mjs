// 机读来源补齐①（李白 11-15 18:05）："要接的入口"栏候选草表。只读、确定性、不联网；不执行被读代码。
// 输入（只读）：审查/脚本输出/卡账-v0.json（对象与卡、各卡 files/launches/rowKeys）、乙4-entryCallerFiles.json（H2：入口名 → 定义文件/调用文件）、
//   乙4-import图-边表.tsv（H3）、脚本/卷十一/migrows-input.json（迁移行锚点文件）；为给出"文件:行"证据，按 H2 同口径重读调用文件文本（只读）。
// 规则（一条，全部入口同样适用，不按行号或条目号特判）：卡 c 的文件清单里有入口 e 的旧调用文件，且 e 由别的对象的卡上线 → 候选"c 的对象要接 e"。
//   取卡范围与卡账 v0 灵敏度算（gen-card-ledger.mjs crossOf）一致：门禁卡、清扫卡、搬迁卡、账本子卡不取。
// 匹配方式：名字+import = 该调用文件在 H3 里直接 import 了 e 的某个旧定义文件；仅名字 = 只有名字相同。
// 噪声标记：通用名（单词名，无驼峰分段）、同名多处（同名入口登记在两卷以上，或旧代码里有两个以上定义文件）、无旧定义（旧代码里没有同名定义）、仅成员调用（命中全是 .名( 形式）。
//   高噪声 = 带通用名、同名多处、仅成员调用之一。
// 环：卡账 v0 的 dependsOn 加上候选边，求强连通分量，列出分量内的边与证据；不判真依赖或误配。
// 用法：node draft-uses-entries.mjs   输出：审查/脚本输出/要接的入口-草表.md、要接的入口-草表.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const REPO = 'F:/dnd';
const rd = f => readFileSync(f, 'utf8');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = a => [...new Set(a)];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ledger = JSON.parse(rd(`${OUT}/卡账-v0.json`));
const h2 = JSON.parse(rd(`${OUT}/乙4-entryCallerFiles.json`));
const edges = rd(`${OUT}/乙4-import图-边表.tsv`).split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split('\t'));
const mig = JSON.parse(rd(`${HERE}/migrows-input.json`));

const imports = new Map(); // 文件 → 它直接 import 的文件
for (const [a, b] of edges) (imports.get(a) ?? imports.set(a, new Set()).get(a)).add(b);
const rowByKey = new Map(mig.rows.map(r => [r.rowKey, r]));
const cards = ledger.cards.slice().sort((x, y) => cmp(x.cardId, y.cardId));
const byId = new Map(cards.map(c => [c.cardId, c]));
const objOf = c => `${c.objectKind}:${c.objectCode}`;
const eKey = (vol, name) => `${vol}:${name}`;
const launcher = new Map(); // 入口键 → 上线卡
for (const c of cards) for (const l of c.launches ?? []) if (!launcher.has(eKey(l.vol, l.name))) launcher.set(eKey(l.vol, l.name), c);
const volsOfName = new Map();
for (const e of h2.entries) (volsOfName.get(e.entry) ?? volsOfName.set(e.entry, new Set()).get(e.entry)).add(e.volume);

// 与 H2（collect-entry-callers.mjs）同口径去注释，但保留换行以给行号
const keepNl = s => s.replace(/[^\n]/g, '');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, keepNl).replace(/(^|[\s;{}()])\/\/[^\n]*/g, '$1');
const textCache = new Map();
const linesOf = f => { if (!textCache.has(f)) textCache.set(f, strip(rd(`${REPO}/${f}`)).split('\n')); return textCache.get(f); };
const hitsOf = (f, name) => {
  const re = new RegExp(`\\b${esc(name)}\\s*\\(`, 'g'); // 与 H2 的 call 正则同形
  const out = [];
  linesOf(f).forEach((l, i) => { for (const m of l.matchAll(re)) out.push({ line: i + 1, member: /\.\s*$/.test(l.slice(0, m.index)) }); });
  return out;
};
const isGeneric = name => !/[A-Z0-9_]/.test(name); // 单词名：无驼峰分段、无数字下划线
const SKIP = new Set(['gate', 'sweep', 'relocate', 'ledger_child']);

// ================= 候选 =================
const cand = []; // 卡级候选
for (const c of cards) {
  if (SKIP.has(c.cardKind)) continue;
  const fset = new Set([...(c.files ?? []), ...(c.dataFiles ?? [])]);
  for (const e of h2.entries) {
    const d = launcher.get(eKey(e.volume, e.entry));
    if (!d || objOf(d) === objOf(c)) continue;
    const callerHere = (e.callerFiles ?? []).filter(f => fset.has(f)).sort();
    if (!callerHere.length) continue;
    const ev = [];
    for (const f of callerHere) {
      const hits = hitsOf(f, e.entry);
      const viaImport = (e.defFiles ?? []).filter(df => imports.get(f)?.has(df)).sort();
      const rowsHere = (c.rowKeys ?? []).filter(k => (rowByKey.get(k)?.anchors ?? []).some(a => a.file === f || f.endsWith('/' + a.file))).sort();
      ev.push({ file: f, lines: hits.map(h => h.line), memberOnly: hits.length > 0 && hits.every(h => h.member), viaImport, rows: rowsHere });
    }
    const flags = [];
    if (isGeneric(e.entry)) flags.push('通用名');
    if ((volsOfName.get(e.entry)?.size ?? 0) > 1 || (e.defFiles ?? []).length > 1) flags.push('同名多处');
    if (!(e.defFiles ?? []).length) flags.push('无旧定义');
    if (ev.every(x => x.memberOnly)) flags.push('仅成员调用');
    const match = ev.some(x => x.viaImport.length) ? '名字+import' : '仅名字';
    cand.push({ card: c.cardId, object: objOf(c), volume: c.volume, entryVol: e.volume, entry: e.entry, launchCard: d.cardId, launchObject: objOf(d),
      defFiles: (e.defFiles ?? []).slice().sort(), match, flags, highNoise: flags.some(x => x === '通用名' || x === '同名多处' || x === '仅成员调用'), evidence: ev });
  }
}

// 按对象汇总：同一对象同一入口的多张卡合并
const objRows = new Map();
for (const x of cand) {
  const k = `${x.object}|${x.entryVol}:${x.entry}`;
  if (!objRows.has(k)) objRows.set(k, { volume: x.volume, object: x.object, entry: `${x.entryVol}:${x.entry}`, launchCard: x.launchCard, launchObject: x.launchObject, defFiles: x.defFiles, cards: [], match: '仅名字', flags: [], highNoise: false, evidence: [] });
  const r = objRows.get(k);
  r.cards.push(x.card);
  if (x.match === '名字+import') r.match = '名字+import';
  r.flags = uniq([...r.flags, ...x.flags]);
  r.highNoise = r.highNoise || x.highNoise;
  for (const ev of x.evidence) if (!r.evidence.some(y => y.file === ev.file)) r.evidence.push(ev);
}
const FLAG_ORDER = ['通用名', '同名多处', '无旧定义', '仅成员调用'];
const rowsOut = [...objRows.values()].map(r => ({ ...r, cards: uniq(r.cards).sort(), flags: FLAG_ORDER.filter(f => r.flags.includes(f)), evidence: r.evidence.sort((a, b) => cmp(a.file, b.file)) }))
  .sort((a, b) => cmp(a.volume, b.volume) || cmp(a.object, b.object) || cmp(a.entry, b.entry));

// ================= 环：dependsOn ∪ 候选边，求强连通分量 =================
const adj = new Map(cards.map(c => [c.cardId, new Map()])); // from → to → 原因列表
const addE = (a, b, why) => { const m = adj.get(a); if (!m || !adj.has(b) || a === b) return; (m.get(b) ?? m.set(b, []).get(b)).push(why); };
for (const c of cards) for (const d of c.dependsOn ?? []) addE(c.cardId, d, { kind: '卡账v0 dependsOn（来源 1/3/4/5）' });
for (const x of cand) addE(x.card, x.launchCard, { kind: '候选', entry: `${x.entryVol}:${x.entry}`, match: x.match, flags: x.flags, evidence: x.evidence });
let idx = 0; const ix = new Map(), low = new Map(), on = new Set(), st = [], sccs = [];
const ids = cards.map(c => c.cardId);
const tarjan = v => { // 迭代版 Tarjan，避免深递归
  const work = [[v, [...adj.get(v).keys()].sort(), 0]];
  ix.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v);
  while (work.length) {
    const top = work[work.length - 1]; const [u, nb] = top;
    if (top[2] < nb.length) {
      const w = nb[top[2]++];
      if (!ix.has(w)) { ix.set(w, idx); low.set(w, idx); idx++; st.push(w); on.add(w); work.push([w, [...adj.get(w).keys()].sort(), 0]); }
      else if (on.has(w)) low.set(u, Math.min(low.get(u), ix.get(w)));
    } else {
      work.pop();
      if (work.length) { const p = work[work.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(u))); }
      if (low.get(u) === ix.get(u)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== u); if (comp.length > 1) sccs.push(comp.sort()); }
    }
  }
};
for (const v of ids) if (!ix.has(v)) tarjan(v);
sccs.sort((a, b) => cmp(a[0], b[0]));
const cycles = sccs.map(comp => {
  const s = new Set(comp); const es = [];
  for (const a of comp) for (const [b, whys] of [...adj.get(a)].sort((p, q) => cmp(p[0], q[0]))) if (s.has(b)) for (const w of whys) es.push({ from: a, to: b, ...w });
  // 分量内的两卡互指环（a→b 且 b→a），逐对列出，便于先判最短的环
  const pairs = [];
  for (const a of comp) for (const b of comp) if (cmp(a, b) < 0 && adj.get(a).has(b) && adj.get(b).has(a)) pairs.push({ cards: [a, b], edges: es.filter(e => (e.from === a && e.to === b) || (e.from === b && e.to === a)) });
  return { cards: comp, edges: es, pairs, status: '待按设计卷正文判真依赖/误配' };
});

// ================= 输出 =================
const vols = uniq(rowsOut.map(r => r.volume)).sort();
const byVol = Object.fromEntries(vols.map(v => [v, rowsOut.filter(r => r.volume === v).length]));
const hi = rowsOut.filter(r => r.highNoise).length;
const json = {
  _说明: '要接的入口候选草表（脚本 脚本/卷十一/draft-uses-entries.mjs 生成，勿手改）。草表不是结论，逐卷对照设计卷正文确认后才落卷。',
  baseline: ledger.baseline, tree: h2.tree,
  counts: { objectRows: rowsOut.length, cardRows: cand.length, highNoise: hi, byVolume: byVol, cycles: cycles.length },
  rows: rowsOut, cycles,
};
writeFileSync(`${OUT}/要接的入口-草表.json`, JSON.stringify(json, null, 1) + '\n');

const evStr = (ev, max = 4) => ev.map(x => {
  const ls = x.lines.length ? x.lines.slice(0, max).join(',') + (x.lines.length > max ? ` 等${x.lines.length}处` : '') : '无行（H2 命中在去注释前后不一致）';
  return `${x.file}:${ls}${x.viaImport.length ? '（import ' + x.viaImport.join('、') + '）' : ''}${x.rows.length ? '［' + x.rows.join('、') + '］' : ''}`;
}).join('；');
const md = [
  '# 要接的入口 候选草表（脚本生成，勿手改）',
  '',
  '> **草表不是结论，逐卷对照设计卷正文确认后才落卷。** 本表只按名字把旧调用文件对到别对象的读入口，不写进任何卷文。',
  '',
  `- 生成脚本：脚本/卷十一/draft-uses-entries.mjs（只读、确定性；同一提交重跑逐字一致）。输入：审查/脚本输出/卡账-v0.json（基线 ${ledger.baseline}）、乙4-entryCallerFiles.json（H2，${h2.tree}）、乙4-import图-边表.tsv（H3）、脚本/卷十一/migrows-input.json（锚点文件）；按 H2 同口径重读调用文件取行号。`,
  '- 规则：卡的文件清单里有某入口的旧调用文件，且该入口由别的对象的卡上线 → 候选"本对象要接该入口"。门禁卡、清扫卡、搬迁卡、账本子卡不取（与卡账 v0 灵敏度算同口径）。同一对象多张卡命中同一入口合并为一行。',
  '- 匹配方式：名字+import = 调用文件在 H3 里直接 import 了该入口的旧定义文件；仅名字 = 只有名字相同。',
  '- 噪声标记：通用名（单词名，无驼峰分段）、同名多处（同名入口登记在两卷以上，或旧代码有两个以上定义文件）、无旧定义（旧代码里没有同名定义）、仅成员调用（命中全是 `.名(`）。高噪声 = 带通用名、同名多处、仅成员调用之一。',
  '- 证据写法：文件:行（去注释后的命中行）（import 到的定义文件）［该文件作锚点的迁移行］。',
  '',
  `候选共 ${rowsOut.length} 行（卡级 ${cand.length} 条）；高噪声 ${hi} 行；名字+import ${rowsOut.filter(r => r.match === '名字+import').length} 行。`,
  '',
  '| 卷 | 候选行 | 高噪声 |', '|---|---:|---:|',
  ...vols.map(v => `| ${v} | ${byVol[v]} | ${rowsOut.filter(r => r.volume === v && r.highNoise).length} |`),
  '',
];
for (const v of vols) {
  md.push(`## ${v}`, '', '| 本对象 | 候选别对象入口 | 上线卡（对象） | 本对象的卡 | 匹配方式 | 噪声 | 证据 |', '|---|---|---|---|---|---|---|');
  for (const r of rowsOut.filter(x => x.volume === v)) md.push(`| ${r.object} | \`${r.entry}\` | ${r.launchCard}（${r.launchObject}） | ${r.cards.join('、')} | ${r.match} | ${r.flags.join('、') || '—'}${r.highNoise ? '（高）' : ''} | ${evStr(r.evidence)} |`);
  md.push('');
}
md.push('## 环（卡账 v0 dependsOn 加上候选边后的强连通分量）', '', '状态：**待按设计卷正文判真依赖/误配**（今晚不判）。', '');
if (!cycles.length) md.push('无环。', '');
cycles.forEach((cy, i) => {
  const head = '| 从 | 到 | 来源 | 入口 | 匹配方式 | 噪声 | 证据 |';
  md.push(`### 分量 ${i + 1}：${cy.cards.length} 张卡`, '', cy.cards.join('、'), '', `分量内边 ${cy.edges.length} 条（其中候选边 ${cy.edges.filter(e => e.kind === '候选').length} 条）；两卡互指环 ${cy.pairs.length} 对。`, '');
  for (const p of cy.pairs) {
    md.push(`#### 两卡环：${p.cards[0]} ⇄ ${p.cards[1]}（边 ${p.edges.length} 条，候选边 ${p.edges.filter(e => e.kind === '候选').length} 条）`, '', '状态：待按设计卷正文判真依赖/误配。', '', head, '|---|---|---|---|---|---|---|');
    for (const e of p.edges) md.push(`| ${e.from} | ${e.to} | ${e.kind} | ${e.entry ? '`' + e.entry + '`' : '—'} | ${e.match ?? '—'} | ${e.flags ? (e.flags.join('、') || '—') : '—'} | ${e.evidence ? evStr(e.evidence) : '—'} |`);
    md.push('');
  }
  md.push(`#### 分量内全部边`, '', head, '|---|---|---|---|---|---|---|');
  for (const e of cy.edges) md.push(`| ${e.from} | ${e.to} | ${e.kind} | ${e.entry ? '`' + e.entry + '`' : '—'} | ${e.match ?? '—'} | ${e.flags ? (e.flags.join('、') || '—') : '—'} | ${e.evidence ? evStr(e.evidence) : '—'} |`);
  md.push('');
});
writeFileSync(`${OUT}/要接的入口-草表.md`, md.join('\n'));
console.log(`候选 ${rowsOut.length} 行（卡级 ${cand.length}）；高噪声 ${hi}；环 ${cycles.length}：${cycles.map(c => c.cards.join('+') + ' 边' + c.edges.length).join('；')}`);
console.log(JSON.stringify(byVol));
