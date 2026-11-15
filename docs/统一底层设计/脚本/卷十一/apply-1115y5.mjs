// 乙-1/乙-4 补卡 1115y5：照李白 11-15 16:25 裁定（审查/李白裁定-1115-1625-rules待裁与拟名.md）改写迁移行的落点对象。
// 输入：migrows-input.json（先跑 transcribe-migrows.mjs）、审查/脚本输出/乙4补-systems补全.json（系统键）、各卷卷文。
// 只改各卷迁移表里落点对象格（及拆行、别名行、两处落点补写），确定性；待裁行写 审查/脚本输出/乙5-rules待裁清单.md。
// 用法：node apply-1115y5.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const sysJ = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const sysOf = new Map(sysJ.map(s => [s.volume, s.system]));
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/`/g, '').trim();

// ---- 裁定里的行清单（数据，不是程序分支）----
const A1 = 'M1-5 M7-16 M7-17 M20-24 M25-5 M25-8 M25-25 M25-27 M25-34 M25-37 M25-39 M25-45 M25-47 M25-49 M25-56 M5-16 M8-21 M8b-10 M8b-11 M8b-14 M8b-16 M8b-19 M8b-20 M8b-21 M17-4 M13-5 M13-13 M13-18 M18-4 M18-30 M14-61 M4-5 M4-20 M4-37 M4-38 M4-55'.split(' ');
const B1 = 'M13-11 M14-75 M15-15 M6-21'.split(' ');
const E1 = 'M25-59 M4-33 M4-54 M14-25 M14-98 M3a-5'.split(' ');
const F1 = { 'M29-3': 'M17-12', 'M11-1': 'M27-7', 'M11-3': 'M9-2', 'M8-24': 'M27-16', 'M20-27': 'M13-31', 'M14-45': 'M14-32', 'M14-46': 'M14-32', 'M14-71': 'M14-8', 'M14-96': 'M14-58', 'M14-79': 'M14-89', 'M4-28': 'M4-5' };
const H1 = { 'M14-15': 'sys.item', 'M25-18': 'sys.place' };
const I1 = 'M1-10 M11-4 M20-88 M20-90 M14-69'.split(' ');
const PENDING = '待裁';
// 拆子行：[后缀, 对象或 {alias}, 说明]
const G1 = {
  'M20-29': [['a', { alias: 'M21-14b' }], ['b', 'sys.plant']],
  'M20-30': [['a', { alias: 'M17-9' }], ['b', { alias: 'M13-31' }]],
  'M13-23': [['a', 'sys.combat'], ['b', 'sys.social'], ['c', 'sys.org']],
  'M5-22': [['a', 'sys.place'], ['b', 'sys.offense'], ['c', 'sys.org'], ['d', PENDING, 'remote-generation 两处']],
  'M5-10': [['a', 'sys.place'], ['b', PENDING, '家户决策归卷六、卷九']],
  'M5-15': [['a', 'sys.capacity'], ['b', 'sys.place']],
  'M10-16': [['a', 'sys.travel'], ['b', 'sys.time_env']],
  'M11-2': [['a', 'sys.migration'], ['b', 'sys.worldgen']],
  'M18-27': [['a', 'sys.social'], ['b', 'sys.org']],
  'M3b-13': [['a', 'rules.items'], ['b', 'rules.body.carry']],
  'M5-30': [['a', 'place'], ['b', { alias: 'M10-1' }], ['c', PENDING, '气候基准']],
  'M4-3': [['a', 'sys.worldgen'], ['b', 'sys.deity']],
  'M4-4': [['a', 'sys.worldgen'], ['b', 'sys.org']],
  'M4-17': [['a', 'sys.worldgen'], ['b', 'sys.social']],
  'M4-27': [['a', 'sys.ai_interface'], ['b', 'sys.status']],
  'M4-30': [['a', 'sys.ai_interface'], ['b', 'sys.facility_type']],
  'M25-52': [['a', 'sys.economy'], ['b', 'sys.social']],
  'M25-35': [['a', 'sys.place'], ['b', 'sys.economy']],
  'M10-18': [['a', 'sys.place'], ['b', 'sys.plant']],
  // 1d：M14-82 旧键六个，卷十四 §2.5 各键没有写旧键对应（无 basis 栏），逐个对不上，全部列给李白
  'M14-82': ['practice', 'levels', 'education', 'training', 'books', 'npcGrowth'].map((k, i) => ['abcdef'[i], PENDING, `旧键 ${k}`]),
};

// ---- 找每行在卷文里的位置与列号（同 transcribe-migrows.mjs 的列判法）----
function columns(head) {
  const h = head.map(strip);
  const pick = p => h.findIndex(p);
  const obj = pick(x => /落点对象/.test(x));
  const disp = (() => { const a = pick(x => /mig_disp/.test(x)); return a >= 0 ? a : pick(x => x === '处置'); })();
  const tgt = (() => { const a = pick(x => /落点/.test(x) && !/落点对象/.test(x)); if (a >= 0) return a; const b = pick(x => x === '对应 §'); return b >= 0 ? b : pick(x => x === '去向'); })();
  let anc = -1;
  for (const p of [x => x === '锚点', x => /^旧位置/.test(x), x => /^现状位置/.test(x), x => x === '位置', x => /^现状（文件:行/.test(x), x => x === '文件', x => x === '旧物', x => x === '退役对象', x => x === '现状']) { const a = pick(p); if (a >= 0) { anc = a; break; } }
  return { obj, disp, tgt, anc };
}
const volFiles = readdirSync(DIR).filter(f => /^卷.+\.md$/.test(f)).sort();
const where = new Map(); // rowKey → {file, idx, col}
const FL = new Map();
for (const f of volFiles) {
  const L = readFileSync(`${DIR}/${f}`, 'utf8').split('\n'); FL.set(f, L);
  let head = null, col = null, code = false;
  L.forEach((l, i) => {
    if (/^```/.test(l)) { code = !code; head = null; return; }
    if (code) return;
    if (!/^\|/.test(l)) { head = null; return; }
    const c = cells(l);
    if (!head) { head = c; col = columns(head); return; }
    if (/^:?-{3}/.test(c[0] ?? '')) return;
    const k = strip(c[0] ?? '');
    if (new RegExp(CFG.migRow).test(k)) where.set(k, { file: f, idx: i, col });
  });
}
const rowsByKey = new Map(mig.rows.map(r => [r.rowKey, r]));
const objOf = r => r.targetObject.replace(/`/g, '').trim();

// ---- 决定每行 ----
const dec = new Map(); // rowKey → {obj} | {alias} | {split} | {targetAppend}
const counts = { '1a': 0, '1b': 0, '1c': 0, '1d': 0, '1e': 0, '1f': 0, '1g': 0, '1h': 0, '1i': 0, '1j': 2, tools: 0 };
const pend = { i: [], d: [], g: [], tools: [], c: [] };
const volSys = v => sysOf.get(v);
const rulesRows = mig.rows.filter(r => !r.aliasOf && objOf(r) === 'rules');
const inRules = new Set(rulesRows.map(r => r.rowKey));
const missing = [];
const take = (k, cat, d) => { if (!inRules.has(k) && !(k in G1) && !(k in F1)) { missing.push(`${cat}:${k}`); } dec.set(k, d); counts[cat]++; };
for (const k of A1) take(k, '1a', { obj: 'sys.capacity' });
for (const k of B1) take(k, '1b', { obj: 'kernel' });
for (const k of E1) { const r = rowsByKey.get(k); const s = r && volSys(r.volume); if (!s) { pend.c.push({ r, why: '来源卷没有系统键' }); continue; } take(k, '1e', { obj: s }); }
for (const [k, v] of Object.entries(H1)) take(k, '1h', { obj: v, targetAppend: k === 'M25-18' ? '；S25-3 写进验收（同 R11-2.5 末句）' : '' });
for (const k of I1) { dec.set(k, { keep: true }); counts['1i']++; pend.i.push(k); }
dec.set('M8b-4', { obj: 'rules.law', anchorAppend: '；world/rules/tables/law/' }); counts['1d']++;
// 1g 与 1d 的拆行
for (const [k, subs] of Object.entries(G1)) { dec.set(k, { split: subs }); if (k === 'M14-82') counts['1d']++; else counts['1g']++; for (const s of subs) if (s[1] === PENDING) (k === 'M14-82' ? pend.d : pend.g).push({ id: k + s[0], note: s[2], row: k }); }
// 1f：别名或取对方行的对象
for (const [k, to] of Object.entries(F1)) { dec.set(k, { f: to }); counts['1f']++; }
// 1c：其余 rules 行取本卷系统键
for (const r of rulesRows) {
  if (dec.has(r.rowKey)) continue;
  const s = volSys(r.volume);
  if (!s) { pend.c.push({ r, why: `${r.volume} 没有系统键` }); continue; }
  dec.set(r.rowKey, { obj: s }); counts['1c']++;
}
// 三：裸 tools、tests 的行按规则号取系统键
const VOL = /卷[零一二三四五六七八九十]+(?:甲|乙|b)?/g;
const D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function resolveObj(r) {
  const t = r.target, own = r.volume;
  const fromPrefix = re => [...t.matchAll(re)].filter(m => +m[1] !== 3).map(m => '卷' + cn(+m[1]) + (m[2] ?? ''));
  const rules = fromPrefix(/\bR(\d+)(b)?-\d/g);
  let vols = new Set(rules);
  if (!vols.size && /规则\s*\d+/.test(t)) vols.add(own); // 不带卷号的"规则 n"属本行所在卷，优先于别卷名
  if (!vols.size) vols = new Set(fromPrefix(/\b[SAC](\d+)(b)?-\d/g));
  if (!vols.size) for (const m of t.matchAll(VOL)) vols.add(m[0]); // 别卷名只在上面都没有时才取
  if (vols.has(own) && rules.includes(own)) vols = new Set([own]); // 本卷规则号优先
  if (vols.size !== 1) return { why: vols.size === 0 ? '落点里没有规则号' : '落点指向 ' + [...vols].join('、') + '，不止一个系统' };
  const k = volSys([...vols][0]);
  return k ? { obj: k } : { why: [...vols][0] + ' 没有系统键' };
}
const cn = n => (n < 10 ? D[n] : n < 20 ? '十' + (n % 10 ? D[n % 10] : '') : D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : ''));
for (const r of mig.rows) {
  if (r.aliasOf) continue; const o = objOf(r); if (o !== 'tools' && o !== 'tests') continue;
  if (r.rowKey === 'M11-7') { dec.set(r.rowKey, { obj: '待补' }); counts.tools++; pend.tools.push({ r, why: '李白裁定：M11-7 仍待补（本行不是迁移处置）' }); continue; }
  const res = resolveObj(r);
  if (res.obj) { dec.set(r.rowKey, { obj: res.obj }); counts.tools++; }
  else pend.tools.push({ r, why: res.why });
}
// 同类修正（chk-1115-y4 第 1 条）：判法统一为"本卷规则号优先"。别卷名只在没有任何带卷号的规则号时才取；
// 同时写的扫描号、配合项号（S、A、C）不算第二个对象。对已经取过系统键的行再判一遍，判出不同的改过来。
const fixLog = [];
for (const r of mig.rows) {
  if (r.aliasOf || dec.has(r.rowKey) || !objOf(r).startsWith('sys.') || !r.target) continue;
  const res = resolveObj(r);
  if (res.obj && res.obj !== objOf(r)) { dec.set(r.rowKey, { obj: res.obj }); fixLog.push(`${r.rowKey}：${objOf(r)}→${res.obj}`); }
}
// 卷二十九里不在 §2.3 六类的显示文件对象（chk-1115-y4 第 2 条，同卷二 M2-4b 的口径）：卷二没有把它们登记成表或词表族条目，
// 故处置改 move_out（文字处理移到非规则组），对象取显示层或语言包所在的非规则组键。
const DISPLAY_OBJ = { panels: 'display', assets: 'display', map: 'display', epithets: 'display', templates: 'outputGate', labels: 'outputGate' };
const dispFix = [];
for (const r of mig.rows) {
  if (r.aliasOf || r.volume !== '卷二十九') continue;
  const o = objOf(r);
  if (o in DISPLAY_OBJ) { dec.set(r.rowKey, { obj: DISPLAY_OBJ[o], disp: 'move_out' }); dispFix.push(`${r.rowKey}：${o}→${DISPLAY_OBJ[o]}（处置 ${r.disp}→move_out）`); }
}
// 4：卷一 M1-7 写 kernel 与卷二 :1193 "待删目录不属七组"冲突，按总原则改别名行，同被覆盖的卷二十七 M27-6
dec.set('M1-7', { split: [['', { alias: 'M27-6' }]] });
// 卷二十八 M28-19 的对象原写"outputGate 组"（中文描述），改代号
dec.set('M28-19', { obj: 'outputGate' });

// ---- 改卷文：按卷分组，从后往前，拆行会增加行数 ----
const objCell = (orig, v) => (orig.includes('`') ? ` \`${v}\` ` : ` ${v} `);
function finalObj(k) { const d = dec.get(k); if (d?.obj) return d.obj; const r = rowsByKey.get(k); return r ? objOf(r) : '?'; }
function subsetOf(r, t) { // r 的锚点是否都落在 t 的锚点之内
  if (!r.anchors.length) return true;
  return r.anchors.every(a => t.anchors.some(b => b.file === a.file && (b.lines.length === 0 || (a.lines.length > 0 && a.lines.every(([lo, hi]) => b.lines.some(([x, y]) => x <= lo && hi <= y))))));
}
const log = { alias: [], copy: [] };
const edits = new Map(); // file → [{idx, lines[]}]
for (const [k, d] of dec) {
  const w = where.get(k); if (!w) { missing.push('找不到行:' + k); continue; }
  const L = FL.get(w.file); const line = L[w.idx];
  const cs = line.split(/(?<!\\)\|/); const c = w.col; const oi = c.obj + 1;
  const setCell = (arr, i, v) => { arr[i] = (arr[i].includes('`') ? ` \`${v}\` ` : ` ${v} `); };
  const mk = (arr, id, obj) => { const a = arr.slice(); a[1] = ` ${id} `; if (typeof obj === 'object') { for (const i of [c.disp, c.tgt, c.obj]) if (i >= 0) a[i + 1] = ` 同 ${obj.alias} `; } else a[oi] = objCell(arr[oi], obj); return a.join('|'); };
  let out;
  if (d.keep) continue;
  if (d.obj) { const a = cs.slice(); a[oi] = objCell(cs[oi], d.obj); if (d.disp && c.disp >= 0) a[c.disp + 1] = objCell(cs[c.disp + 1], d.disp); if (d.targetAppend && c.tgt >= 0) a[c.tgt + 1] = a[c.tgt + 1].replace(/\s*$/, '') + d.targetAppend + ' '; if (d.anchorAppend && c.anc >= 0 && !a[c.anc + 1].includes(d.anchorAppend.slice(1))) a[c.anc + 1] = a[c.anc + 1].replace(/\s*$/, '') + d.anchorAppend + ' '; out = [a.join('|')]; }
  else if (d.split) {
    out = d.split.map(([suf, o]) => mk(cs, k + suf, o));
    // 卷十三的自检要求 §7 每个 M13 行的处置都是五值之一，汇总别名行过不了，所以 M13-23 的第一个子行沿用原编号
    if (k === 'M13-23') { out[0] = mk(cs, k, d.split[0][1]); out[1] = mk(cs, k + 'b', d.split[1][1]); out[2] = mk(cs, k + 'c', d.split[2][1]); }
    // 拆行后保留原编号一行作汇总（别名行，不单独计数），免得各卷编号连续性检查把原编号当成悬空
    else if (!(d.split.length === 1 && d.split[0][0] === '')) out.unshift(mk(cs, k, { alias: `${k}${d.split[0][0]} 至 ${k}${d.split[d.split.length - 1][0]}` }));
  }
  else if (d.f) {
    const r = rowsByKey.get(k), t = rowsByKey.get(d.f);
    if (k === 'M4-28' || (t && subsetOf(r, t))) { out = [mk(cs, k, { alias: d.f })]; out[0] = out[0].replace(/^\|[^|]*\|/, '|' + cs[1] + '|'); log.alias.push(k + '→' + d.f); }
    else { const a = cs.slice(); a[oi] = objCell(cs[oi], finalObj(d.f)); out = [a.join('|')]; log.copy.push(k + '→' + d.f + '（对象 ' + finalObj(d.f) + '，锚点不在对方行锚点之内，取对象不标别名）'); }
  }
  if (!out) continue;
  (edits.get(w.file) ?? edits.set(w.file, []).get(w.file)).push({ idx: w.idx, lines: out });
}
let changedFiles = 0;
for (const [f, es] of edits) {
  const L = FL.get(f);
  es.sort((a, b) => b.idx - a.idx);
  for (const e of es) L.splice(e.idx, 1, ...e.lines);
  writeFileSync(`${DIR}/${f}`, L.join('\n')); changedFiles++;
}
// 子行里的"别名行"对象写同 Mxx，其余子行对象已按清单写好；拆行的新行号由重跑 transcribe 取得

// ---- 待裁清单 ----
const keepRows = pend.i.map(k => rowsByKey.get(k));
const cand = {
  'M1-10': 'physicalMetal 名称字词匹配归谁没写；候选 sys.item（卷三乙物品类别）、sys.material（卷三甲物质）',
  'M11-4': '卷一 §6.5 账本母卡 LEDGER-1 的对象没定义；候选 sys.economy（卷六账本，R6 终态见 §4.1 规则 11）',
  'M20-88': '六个文件分属多卷，规则表键没写；候选按文件：education.mjs→sys.profession、finance-assets.mjs 与 finance-bank.mjs→sys.economy、medicine.mjs→sys.status、pets.mjs→sys.species、quest-sources.mjs→sys.event_type',
  'M20-90': '要按卷二十 §8 第 5 条逐项拆；候选：词表族与规则表键登记项各归其所属卷的系统或卷二的登记节，逐项待拆',
  'M14-69': '被指的四行对象不同；候选见下面“被指行现取对象”',
};
const md = [
  '# 乙-1/乙-4 补 1115y5：待裁清单（脚本生成，勿手改；按现行 migrows 重新生成，替代 乙1c-rules待裁清单.md）',
  '',
  `- 依据：李白 11-15 16:25 裁定（审查/李白裁定-1115-1625-rules待裁与拟名.md）；脚本 脚本/卷十一/apply-1115y5.mjs。`,
  `- 各类实改行数（对裁定计数 36+4+112+2+6+11+19+2+5+2=199）：1a ${counts['1a']}、1b ${counts['1b']}、1c ${counts['1c']}、1d ${counts['1d']}（M8b-4 与 M14-82 拆行）、1e ${counts['1e']}、1f ${counts['1f']}、1g ${counts['1g']}、1h ${counts['1h']}、1i ${counts['1i']}（不改）、1j 2（M1-6、M1-8，22d451da 已处理）；合计 ${counts['1a'] + counts['1b'] + counts['1c'] + counts['1d'] + counts['1e'] + counts['1f'] + counts['1g'] + counts['1h'] + counts['1i'] + counts['1j']}。`,
  `- 现行 migrows 中对象为 rules 的行（不含别名行）：${rulesRows.length} 行；裁定清单里不在这批的（本来就不是 rules 对象，如 1g 的 M20-29 等已拆的或对象为别的值）：${missing.length ? missing.join('、') : '无'}。`,
  `- 三（裸 tools、tests 按规则号取系统键）：改 ${counts.tools} 行；列出 ${pend.tools.length} 行。`,
  '',
  '## 一、1i：留给李白裁，对象仍写 rules（5 行）',
  '', '| 迁移行 | 卷 | 落点（原文） | 候选 |', '|---|---|---|---|',
  ...keepRows.map(r => `| ${r.rowKey} | ${r.volume} | ${(r.target || '（空）').replace(/\|/g, '/').slice(0, 80)} | ${cand[r.rowKey]}${r.rowKey === 'M14-69' ? '：' + (r.aliasOf ?? '同 M14-16、M14-27、M14-31、M14-37') + ' → 现取 ' + ['M14-16', 'M14-27', 'M14-31', 'M14-37'].map(x => `${x}=${finalObj(x)}`).join('、') : ''} |`),
  '',
  '## 二、1d：M14-82 旧键六个（卷十四 §2.5 各键没有写旧键对应，无 basis 栏，逐个对不上）',
  '', '| 子行 | 旧键 | 候选（按键名） |', '|---|---|---|',
  ...pend.d.map(p => `| ${p.id} | ${p.note.replace('旧键 ', '')} | ${({ practice: 'rules.profession（kinds、lapseDays）', levels: 'rules.growth（levelThresholds）', education: 'rules.learning', training: 'rules.learning 或 rules.teach', books: 'rules.cert 或数据行通用字段', npcGrowth: 'rules.growth' })[p.note.replace('旧键 ', '')]} |`),
  '',
  '## 三、1g：列给李白的子行',
  '', '| 子行 | 原文 | 候选 |', '|---|---|---|',
  ...pend.g.map(p => `| ${p.id} | ${p.note} | ${({ 'M5-22d': 'sys.place 或 sys.worldgen（卷十 §4.1，remote-generation 在卷十 M10-1 删除）', 'M5-10b': 'sys.economy（卷六 §4.12 家户预算）、sys.ai_interface（卷九决策）', 'M5-30c': 'sys.time_env（卷二十气候基准）' })[p.id]} |`),
  '',
  '## 四、三：裸 tools、tests 取不出对象的行',
  '', '| 迁移行 | 卷 | 落点（摘） | 为什么 |', '|---|---|---|---|',
  ...pend.tools.map(p => `| ${p.r.rowKey} | ${p.r.volume} | ${p.r.target.replace(/\|/g, '/').slice(0, 60)} | ${p.why} |`),
  '',
  '## 五、其他取不出的行',
  '', ...(pend.c.length ? ['| 迁移行 | 原因 |', '|---|---|', ...pend.c.map(p => `| ${p.r?.rowKey ?? '?'} | ${p.why} |`)] : ['无。']),
  '',
  '## 六、同类修正与显示对象',
  '', `本卷规则号优先的同类修正 ${fixLog.length} 行：${fixLog.join('；') || '无'}。`, '', `卷二十九不在六类的显示文件对象改 move_out ${dispFix.length} 行：${dispFix.join('；') || '无'}。`,
  '',
  '## 七、1f 的别名与取对象',
  '', `别名行（锚点全在对方行锚点之内，不单独计数）：${log.alias.join('、') || '无'}。`, '', `锚点不在对方行锚点之内、只取对方行对象的：${log.copy.join('；') || '无'}。`, '',
].join('\n');
writeFileSync(`${OUT}/乙5-rules待裁清单.md`, md);
console.log('同类修正', fixLog.length, '显示对象', dispFix.length, JSON.stringify(counts), '改卷', changedFiles, '缺', missing.join(','), '别名', log.alias.length, '取对象', log.copy.length, '待裁(三)', pend.tools.length, '其他', pend.c.length);
