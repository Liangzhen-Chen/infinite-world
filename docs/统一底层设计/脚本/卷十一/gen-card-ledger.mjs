// 乙-5：生成器出卡账 v0 与卡族读数（卷十一 §2.2 卡记录、R11-2.5、R11-3.1–3.5、R11-3.12、R11-3.14、R11-7.1、R11-7.2）。
// 输入（只读）：脚本/卷十一/migrows-input.json（乙-4 H1）、审查/脚本输出/乙4补-systems补全.json（systems 补全表）、
//   乙4-import图-边表.tsv、乙4-entryCallerFiles.json、卷二（表主、§2.1 读入口、§5 必填引用、§6.12 齐全率键）、卷零 §1、卷十二 §2.11、各卷正文的 `X.after = [..]` 与断言定义。
// 只读、确定性、不联网；不执行被读代码；不碰 F:/dnd/tools、server-plugin、extension（只读目录索引做锚点解析，与乙-4 同口径）。
// 卡全部由数据派生，不手写卡，不按行号或条目号写特判。推不出的字段在卡的 pending 里写明，不替它定值。
// 用法：node gen-card-ledger.mjs      输出：审查/脚本输出/卡账-v0.json、卡账-v0-摘要.md
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLACEHOLDER, receivingVolume } from './object-rules.mjs';
import { scanVolume, TOK as ID_TOK, SHORT_RE, volNo } from './id-defs.mjs';
import { execFileSync } from 'node:child_process';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const REPO = 'F:/dnd';
const MAXFILES = 25; // rules.migration.maxFiles（卷十一 §2.5）
const BASELINE = 'd54c89a3';
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = a => [...new Set(a)];
const rd = f => readFileSync(f, 'utf8');
const VOL = new RegExp(CFG.volCode);

// ================= 输入 =================
const mig = JSON.parse(rd(`${HERE}/migrows-input.json`));
const rows = mig.rows.filter(r => !r.aliasOf);
const sysJ = JSON.parse(rd(`${OUT}/乙4补-systems补全.json`)).systems;
// 系统登记项六列的卷文转录（乙-6a）：还待补的列
const sixJ = JSON.parse(rd(`${OUT}/乙6a-系统登记六列.json`));
const sixPending = new Map(sixJ.systems.map(s => [s.system, Object.keys(s.cols).filter(c => s.cols[c].value === '待补')]));
const h2 = JSON.parse(rd(`${OUT}/乙4-entryCallerFiles.json`));
const edges = rd(`${OUT}/乙4-import图-边表.tsv`).split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const importers = new Map();
for (const [a, b] of edges) (importers.get(b) ?? importers.set(b, new Set()).get(b)).add(a);
const volFiles = readdirSync(DIR).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const volText = new Map(); // 卷代号 → 行数组（卷零、卷一等）
for (const f of volFiles) volText.set(f, rd(`${DIR}/${f}`).split(/\r?\n/));
const volOfFile = f => { const m = f.match(VOL); return m ? m[0] : null; };
const VOLS = volFiles.map(volOfFile).filter(Boolean);
const regText = rd(`${DIR}/${CFG.registry.file}`);
const reg = regText.split(/\r?\n/);

// ---- 位置组定对象用的"首卡在 R11-7.2 次序"（李白 11-16 02:00 Q1，R11-2.5、R11-7.2）----
// 次序在不并组改判的卡族上算一次：每行取自己的 targetObject 排出卡族（子进程 GEN_CHILD=1，只打印各对象首卡的次序号、不写文件），
// 按 R11-7.2 五种来源排序；然后据此定各位置组的对象，不回代、不迭代。
const CHILD = process.env.GEN_CHILD === '1';
let ORDER = new Map(); let childCycles = [];
if (!CHILD) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, GEN_CHILD: '1' }, encoding: 'utf8', maxBuffer: 1 << 26 });
  const j = JSON.parse(out.trim().split(/\r?\n/).pop()); ORDER = new Map(Object.entries(j.order)); childCycles = j.cycles;
}

// ---- 各卷 §3 入口表（李白 11-16 01:30 第 1、3 条：entries 只认 §3 入口表登记的名字）----
// §3 下各小节里、首列表头含"入口"的表格；首格开头的反引号标识符（"、"分隔的多个都算，取括号前的名字）是入口名；
// 入口的定义节：表头含"节"的栏里的节号，没有这一栏的取整行写的节号与规则编号（R<卷>-a.b 记为 §4.a）。
// 定义节只取本卷的：裸"§n"（前面紧跟别卷卷名的不算）与本卷的规则编号 R<卷>-a.b（记 §4.a）（chk-1116-y17 T6）
const V_RE = CFG.volCode.replace(/^\^|\$$/g, '');
// 卷名别名表（04:53 第 2 条）：正文里的卷名按整词取（"卷十"不匹配"卷十六"）；带分卷字母的卷（卷三甲、卷三乙）也认去掉字母的简写"卷三"——简写本身不是一卷时才作别名
const mentionsVol = (text, vol) => [...String(text).matchAll(new RegExp(V_RE, 'g'))].some(m => m[0] === vol || (/[甲乙b]$/.test(vol) && vol.slice(0, -1) === m[0] && !VOLS.includes(m[0])));
const secOfRule = (vol, t) => {
  const out = []; const own = volNo(vol);
  for (const m of t.matchAll(/§\s*([0-9]+(?:\.[0-9]+)*)/g)) { const pre = t.slice(Math.max(0, m.index - 8), m.index); if (!new RegExp(`(${V_RE})\\s*$`).test(pre)) out.push(m[1]); }
  for (const m of t.matchAll(/(?<![A-Za-z0-9])R([0-9]+)([a-z]?)-([0-9]+)\.[0-9]/g)) if (own && m[1] === own.n && m[2] === own.letter) out.push('4.' + m[3]);
  return out;
};
// §3 入口表的结构（chk-1116-y17 T2、T3）：只收读入口、判定入口、写入口一类小节（标题写着"退役"的小节不收）；
// 表格写法：首列表头含"入口"的表，首格开头的标识符是入口名，写成"`名(...).字段`"的是视图维度别名，不收；
// 列表写法：列表项开头写"`名(参数)`："的是入口；定义节取"节"栏，没有该栏取本行（本项）里本卷的节号
const entryIdx = new Map(); // 卷 → [{name, sec, secs}]
const entryNames = new Set();
const leadName = s => { const m = s.trim().match(/^`([A-Za-z_$][A-Za-z0-9_$]*)(\([^`]*\))?(\.[A-Za-z]|`?\.)?/); return m && !m[3] ? m[1] : null; };
// 散文写法（李白 11-16 03:00 第 1 条，取代 02:45 ①）：只收同时满足三条的名字——
// (a) 在本卷 §3 的段落里，且段落所在小节的标题本身写明是入口，或句子是"X、Y 是……入口"的肯定句、名字在"是"之前作主语（否定句不收）；
// (b) 是函数名：标题判据下须写成"名(参数)"的调用形；主语判据下整段反引号只是一个名字；都不含"."，不是状态路径、字段、参数；
// (c) 没有在别卷 §3（卷二为 §2.1）作为该卷入口登记（表格、列表写法的登记先全书收齐，再判散文）
const NEG = /没有|不是|并非|不算|不设|不另|不为|不再|不得|无须|无需|不属/;
// 原语目录登记的原语（标题写着"原语目录"的小节里，表格首格的名字）：原语不是 §3 入口（04:1x ④ K1）
const primNames = new Set(); const primHome = new Map(); // 原语名 → 登记原语目录的卷
const primLand = new Map(); // 原语名 → 原语目录该行"落到……"栏里点名的卷（原语落到/实现于该卷的入口）
for (const [f, ls] of volText) { let on = false, lvl = 0, head = null; for (const l of ls) { const h = l.match(/^(#+)\s+(.*)$/); if (h) { if (/原语目录/.test(h[2])) { on = true; lvl = h[1].length; } else if (on && h[1].length <= lvl) on = false; head = null; continue; } if (!on) continue; if (!/^\|/.test(l)) { head = null; continue; } const c = cells(l); if (!head) { head = c; continue; } if (/^:?-{3}/.test(c[0] ?? '')) continue;
  const ni = head.findIndex(x => /原语/.test(x)); const ns = uniq([(c[0] ?? '').match(/^`([a-z][A-Za-z0-9]*)`/)?.[1], ni >= 0 ? (c[ni] ?? '').match(/^`([a-z][A-Za-z0-9]*)`/)?.[1] : null].filter(Boolean)); if (!ns.length) continue;
  const li = head.findIndex(x => /落到/.test(x)); const land = li >= 0 ? new Set([...(c[li] ?? '').matchAll(new RegExp(V_RE, 'g'))].map(x => x[0])) : new Set();
  for (const n of ns) { primNames.add(n); primHome.set(n, volOfFile(f)); primLand.set(n, land); } } }
// 外卷原语只引用、不收编（04:53 第 3 条），但原语目录写明该原语落到某卷（"落到谁的写者"栏点名该卷）、且该卷 §3 自己登记了它的，是该卷的真入口，照收（chk-1116-y31）
const foreignPrim = (n, v) => primNames.has(n) && primHome.get(n) !== v && !(primLand.get(n)?.has(v));
const proseCand = []; // {v, name, sec, line, how, attrs}
const delegated = []; // {vol, sec, name, from, attrs}：本卷 §3 写明"由卷X §n 登记"的名字
const proseCount = new Map(); // 卷 → 散文写法收下的名字
for (const [f, ls] of volText) {
  const v = volOfFile(f); if (!v) continue; const list = [];
  if (f === CFG.registry.file) { entryIdx.set(v, list); continue; } // 登记总表卷的 §3 是修正值体系，不是入口；它的入口登记处是 §2.1（见下，02:45 ③）
  let in3 = false, sub = null, head = null, code = false, retired = false, headEntry = false, para = [];
  const addProse = (text) => {
    // 句中点名别卷（"卷X"不是本卷）的，所列名字是别卷的入口，不算本卷登记（(c) 的同类）
    const otherVol = s => [...s.matchAll(new RegExp(V_RE, 'g'))].some(m => m[0] !== v);
    // 否定按分句判（李白 11-16 03:2x 第 1 条，chk-1116-y23 T5）：句子按"；"分成几段，首段"："之前是全句的标签；每段再按"，"与括号分成分句。
    // 否定词只作用于它所在的分句（属于、调用、在清单里），不吞掉同句别的分句列出的入口名；否定分句转成这些名字的入口属性标记。
    // 分句写明"由卷X §n……登记"的，它前面列出的名字主登记归卷X §n（03:2x 第 2 条），本卷只是引用，不另建入口。
    // 点名别卷的分句（登记归属分句除外）里只收写成调用形"`名(参数)`"的（本卷定义），裸名视为引用别卷。
    const NAME_ANY = /`([a-z][A-Za-z0-9]*)(?:\([^`]*\))?`/g, NAME_CALL = /`([a-z][A-Za-z0-9]*)\([^`]*\)`/g;
    const attrOf = cl => (/规则层/.test(cl) && /不属|不可|不得/.test(cl) ? { boundary_side: true, rule_layer_callable: false } : /装配/.test(cl) ? { formal_assembly: false } : { negated: cl.trim() });
    // 分句：按"，"与括号切，反引号里的逗号、括号不算（保护调用形"`名(a, b)`"）
    const clauseSplit = t => { const keep = []; const p = t.replace(/`[^`]*`/g, m => { keep.push(m); return `\u0000${keep.length - 1}\u0001`; }); return p.split(/[，,（）()]/).map(c => c.replace(/\u0000(\d+)\u0001/g, (_, i) => keep[+i])); };
    const DELEG = new RegExp(`由\\s*(${V_RE})\\s*§\\s*([0-9]+(?:\\.[0-9]+)*)[^；]*?登记`);
    if (headEntry) for (const s of text.split(/[。\n]/)) {
      const ci = s.indexOf('：'); const label = ci >= 0 ? s.slice(0, ci) : ''; const body = ci >= 0 ? s.slice(ci + 1) : s;
      const labelAttrs = clauseSplit(label).filter(c => NEG.test(c)).map(attrOf);
      if (NEG.test(label.replace(/（[^）]*）/g, ''))) continue; // 标签本身被否定（不是括注里的属性）
      for (const part of body.split('；')) {
        const dg = part.match(DELEG); let rest = part;
        if (dg) { // "名、名（几者由卷X §n……登记）、名"：括注前的名字归卷X，括注之后的照本卷判
          const open = Math.max(0, part.lastIndexOf('（', dg.index)); const reg2 = part.indexOf('登记', dg.index); let close = part.indexOf('）', reg2); while (close >= 0 && part[close + 1] === '）') close++;
          for (const m of part.slice(0, open).matchAll(NAME_ANY)) delegated.push({ vol: dg[1], sec: '§' + dg[2], name: m[1], from: v, attrs: labelAttrs });
          rest = close >= 0 ? part.slice(close + 1) : ''; }
        const clauses = clauseSplit(rest); const neg = clauses.filter(c => NEG.test(c)); const pos = clauses.filter(c => !NEG.test(c)).join('，');
        const attrs = Object.assign({}, ...labelAttrs, ...neg.map(attrOf));
        for (const m of pos.matchAll(otherVol(s) ? NAME_CALL : NAME_ANY)) proseCand.push({ v, name: m[1], sec: sub, line: s, how: '标题写明入口', attrs });
      }
    }
    for (const s of text.split(/[。；\n]/)) {
      if (!/入口/.test(s) || otherVol(s)) continue;
      const entryClause = clauseSplit(s).find(c => /入口/.test(c)) ?? ''; if (NEG.test(entryClause)) continue; // "没有本卷的入口"一类：否定落在"入口"所在分句
      const m = s.match(/^(.*?)(?:是|均为|都是|皆为)[^是]*入口/); if (!m) continue;
      for (const x of m[1].matchAll(NAME_ANY)) proseCand.push({ v, name: x[1], sec: sub, line: s, how: '主语' }); }
  };
  const flush = () => { if (para.length) addProse(para.join('\n')); para = []; };
  for (const l of ls) {
    if (/^```/.test(l)) { flush(); code = !code; head = null; continue; } if (code) continue;
    if (/^## /.test(l)) { flush(); in3 = /^## §?3[ .]/.test(l); sub = null; head = null; continue; }
    const h3 = l.match(/^### (?:§)?(3\.[0-9]+)(.*)$/); if (h3) { flush(); in3 = true; sub = '§' + h3[1]; retired = /退役/.test(h3[2]); headEntry = /入口/.test(h3[2]); head = null; continue; }
    if (/^### /.test(l)) { flush(); in3 = false; head = null; continue; }
    if (in3 && /^#{4,} /.test(l)) { flush(); headEntry = /入口/.test(l); head = null; continue; } // 段落所在小节（最近一级标题）本身写明入口
    if (!in3 || !sub || retired) continue;
    const li = l.match(/^[-*]\s+(`[^`]+`)/);
    if (li) { flush(); head = null; const n = leadName(li[1]); if (n && /\(/.test(li[1])) { list.push({ name: n, sec: sub, secs: secOfRule(v, l) }); entryNames.add(n); } else addProse(l); continue; }
    if (/^[-*]\s/.test(l)) { flush(); addProse(l); continue; }
    if (/^\s+[-*]\s/.test(l)) { flush(); continue; } // 缩进的子列表是上一条入口的返回字段说明，不是登记
    if (!/^\|/.test(l)) { head = null; if (l.trim()) para.push(l); else flush(); continue; }
    flush();
    const c = cells(l); if (!head) { head = c; continue; } if (/^:?-{3}/.test(c[0] ?? '')) continue;
    // 按表头定"入口"栏，不论第几列；同格以"、""，""/"分开的名字都收（chk-1116-y18 R1）
    const ei = head.findIndex(h => /入口/.test(h)); if (ei < 0) continue;
    const si = head.findIndex(h => /节/.test(h));
    const secs = secOfRule(v, si >= 0 ? c[si] ?? '' : c.join(' '));
    // "入口"栏只写中文称呼、函数名写在"签名"栏的表（如"入口 | 签名 | 返回"），取签名栏
    const cols = [ei, ...head.map((h, i) => (/签名/.test(h) ? i : -1)).filter(i => i >= 0 && i !== ei)];
    // 同格多名按分隔符拆（"、""，""/""；"），每段前可带不超过 8 字的中文称呼（如"准入入口 `admitPractice`"）（chk-1116-y26 记账，卷十四 :503）
    for (const ci of cols) { const ns = (c[ci] ?? '').split(/[、，/；]/).map(p => { const t = p.trim(); const pre = t.match(/^([^`|]{1,8}?)(?=`)/)?.[1] ?? ''; if (!pre) { const n0 = leadName(t); return n0 && foreignPrim(n0, v) ? null : n0; } /* 外卷原语只引用、不收编（04:53 第 3 条） */ if (new RegExp(V_RE).test(pre) || /由/.test(pre)) return null; const n = leadName(t.slice(pre.length)); return n && !/^`[^`]*`\s*原语/.test(t.slice(pre.length)) ? n : null; }).filter(Boolean).filter(n => !(primNames.has(n) && !(c[ci] ?? '').trim().startsWith('`' + n)));
    /* 称呼前缀（李白 11-16 04:1x ④ K1）：称呼里点名别卷的、写着"由"（"只由……的 `x`……调用"，x 是调用方）的、名字后紧跟"原语"的，以及原语目录登记的原语，都不收 */ /* 称呼里点名别卷的（"卷九 `move`"）是别卷的名字，不收 */ if (!ns.length) continue; for (const n of ns) { list.push({ name: n, sec: sub, secs, rowCells: c.filter((_, j) => j !== ci) }); entryNames.add(n); } break; }
  }
  flush();
  entryIdx.set(v, list);
}
// 卷二的入口登记处是 §2.1 入口清单（李白 11-16 02:45 ③），但重复登记以主办卷 §3 为准：§2.1 的名字只在别卷 §3 都没登记时才归卷二（03:00 第 2 条）
const REGVOL = CFG.registry.file.match(VOL)?.[0];
const formalVols = name => [...entryIdx].filter(([, xs]) => xs.some(x => x.name === name)).map(([v]) => v);
const reg21 = []; // §2.1 的读函数名（不论归不归卷二）
{ const s = reg.findIndex(l => /^### 2\.1 /.test(l)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length; const list = entryIdx.get(REGVOL) ?? [];
  for (let i = s; i < e; i++) { if (!/^\|/.test(reg[i])) continue; const c = cells(reg[i]); if (!/^\d+$/.test(c[0] ?? '')) continue; const n = leadName(c[2] ?? ''); if (!n) continue; reg21.push(n); if (!formalVols(n).length && !list.some(x => x.name === n)) { list.push({ name: n, sec: '§2.1', secs: ['2.1'], reg21: true }); entryNames.add(n); } }
  entryIdx.set(REGVOL, list); }
// 卷二入口按"入口"定义整类取（李白 11-16 04:30 第 1 条）：除 §2.1 外，§2.7 系统声明里各系统的 view 与 predicates 就是该系统的读入口（卷二 §2.7"view 与 predicates 是系统的读入口"），
// 如 §2.5 状态谓词 can、awake、capacity、terminated、dead 与 sys.capacity 的 view；主办卷 §3 已登记的仍归主办卷；对象即该系统（随其首卡上线）
const reg27 = [];
{ const s = reg.findIndex(l => /^### 2\.7 /.test(l)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length; const list = entryIdx.get(REGVOL);
  for (let i = s; i < e; i++) { const m = reg[i].match(/"(sys\.[a-z_]+)"\s*:\s*\{(.*)$/); if (!m) continue;
    const names = [...m[2].matchAll(/"(?:view|predicates)"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)].flatMap(x => [...x[1].matchAll(/#([A-Za-z_$][A-Za-z0-9_$]*)"/g)].map(y => y[1]));
    for (const n of uniq(names)) { reg27.push({ name: n, sys: m[1] }); if (!formalVols(n).filter(v => v !== REGVOL).length && !list.some(x => x.name === n)) { list.push({ name: n, sec: '§2.7', secs: ['2.7'], sysDecl: m[1] }); entryNames.add(n); } } } }
// 散文候选按 (c) 过滤：别卷（含卷二 §2.1）已登记的名字不收；同一卷同名只收一次
// 写明"由卷X §n 登记"的名字：主登记归卷X §n（须在该节正文里写着这个名字），原处记引用，不重复建入口（李白 11-16 03:2x 第 2 条）
const secBodyText = (vol, sec) => { const f = volFiles.find(x => volOfFile(x) === vol); const L = f ? volText.get(f) : []; const n = sec.replace(/^§/, ''); const hi = L.findIndex(l => new RegExp(`^#+\\s+§?${n.replace(/\./g, '\\.')}(?![0-9.])`).test(l)); if (hi < 0) return ''; const lv = L[hi].match(/^#+/)[0].length; let e = L.findIndex((l, i) => i > hi && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= lv); if (e < 0) e = L.length; return L.slice(hi, e).join('\n'); };
// 入口的细则节：本卷 §4 下标题写明"入口"的小节（只看该小节到下一个标题之间）里写着这个名字的（如 effectiveTier：§3.1 主登记，§4.14.2 细则；03:2x 第 3 条）
const detailCache = new Map();
function detailOf(vol, name) {
  const key = vol + '|' + name; if (detailCache.has(key)) return detailCache.get(key);
  const f = volFiles.find(x => volOfFile(x) === vol); const L = f ? volText.get(f) : []; const out = [];
  L.forEach((l, i) => { const h = l.match(/^#+\s+§?(4(?:\.[0-9]+)+)\s+(.*)$/); if (!h || !/入口/.test(h[2])) return; let e = L.findIndex((x, j) => j > i && /^#+\s/.test(x)); if (e < 0) e = L.length; if (new RegExp('`' + name + '[`(]').test(L.slice(i + 1, e).join('\n'))) out.push('§' + h[1]); });
  detailCache.set(key, out); return out;
}
const entryInfo = x => { const rec = (entryIdx.get(x.vol) ?? []).find(y => y.name === x.name) ?? {}; const d = detailOf(x.vol, x.name); return { ...x, ...(rec.attrs ? { attrs: rec.attrs } : {}), ...(d.length ? { detail: d } : {}) }; };
const delegInfo = [];
for (const d of delegated) {
  const ok = new RegExp('`' + d.name + '[`(]').test(secBodyText(d.vol, d.sec)); delegInfo.push({ ...d, ok });
  if (!ok) continue; const list = entryIdx.get(d.vol) ?? entryIdx.set(d.vol, []).get(d.vol);
  if (!list.some(x => x.name === d.name)) { list.push({ name: d.name, sec: d.sec, secs: [d.sec.slice(1)], refFrom: [d.from], ...(Object.keys(Object.assign({}, ...d.attrs)).length ? { attrs: Object.assign({}, ...d.attrs) } : {}) }); entryNames.add(d.name); }
  else { const x = list.find(y => y.name === d.name); x.refFrom = uniq([...(x.refFrom ?? []), d.from]); }
}
const proseRejected = [];
// (b) 函数名：本卷某处写成过调用形"`名(…)`"的才是函数；只以字段、参数、状态路径出现的名字（如视图返回的 tree、zones、effects）不是
const callNames = new Map(); for (const [f, ls] of volText) { const v = volOfFile(f); const s = new Set(); for (const l of ls) for (const m of l.matchAll(/`([a-z][A-Za-z0-9]*)\(/g)) s.add(m[1]); callNames.set(v, s); }
for (const p of proseCand) {
  if (foreignPrim(p.name, p.v)) { proseRejected.push({ ...p, why: '外卷原语，只引用不收编' }); continue; }
  if (!callNames.get(p.v)?.has(p.name)) { proseRejected.push({ ...p, why: '本卷没有写成调用形，不是函数名' }); continue; }
  const elsewhere = formalVols(p.name).filter(v => v !== p.v); const in21 = reg21.includes(p.name) && p.v !== REGVOL;
  if (elsewhere.length || in21) { proseRejected.push({ ...p, why: elsewhere.length ? `别卷已登记（${elsewhere.join('、')}）` : '卷二 §2.1 已登记' }); continue; }
  const list = entryIdx.get(p.v); if (list.some(x => x.name === p.name)) continue;
  list.push({ name: p.name, sec: p.sec, secs: secOfRule(p.v, p.line), prose: true, how: p.how, ...(p.attrs && Object.keys(p.attrs).length ? { attrs: p.attrs } : {}) }); entryNames.add(p.name);
  (proseCount.get(p.v) ?? proseCount.set(p.v, []).get(p.v)).push(p.name);
}
const in3 = (vol, name) => (entryIdx.get(vol) ?? []).some(x => x.name === name);
// 迁移行的"卷、节"：落点里第一个节号或规则编号（"卷X §n"取卷X，裸"§n"取来源卷，R<卷>-a.b 取该卷 §4.a）
const byVolNo = new Map(); for (const v of VOLS) { const n = volNo(v); if (n) byVolNo.set(n.n + n.letter, v); }
function rowSection(r) {
  const t = String(r.target ?? ''); const V = CFG.volCode.replace(/^\^|\$$/g, '');
  const a = t.match(new RegExp(`(?:(${V})\\s*)?§\\s*([0-9]+(?:\\.[0-9]+)*)`)); const b = t.match(/(?<![A-Za-z0-9])R([0-9]+)([a-z]?)-([0-9]+)\.[0-9]/);
  const ra = a ? { at: a.index, vol: a[1] ?? r.volume, sec: a[2] } : null, rb = b && byVolNo.get(b[1] + b[2]) ? { at: b.index, vol: byVolNo.get(b[1] + b[2]), sec: '4.' + b[3] } : null;
  return [ra, rb].filter(Boolean).sort((x, y) => x.at - y.at)[0] ?? null;
}
// 一节对应几个入口，按该节正文（标题到下一个同级或更高级标题，含下级小节）里列出的本卷 §3 入口名算（chk-1116-y18 R2，李白 11-16 01:30"一节多入口列待查、不推定"）
const secNamesCache = new Map();
// 入口名的登记卷：本卷登记了就是本卷；否则别卷 §3（主办卷）登记的取那一卷（不止一卷取卷名次序最前的，并记歧义）；都没有取卷二登记处
const ownerAmbig = new Set();
const directHits = []; // 直接指称计入的外卷名（卷:名，按节计算时记）
function ownerVolOf(name, vol) {
  if ((entryIdx.get(vol) ?? []).some(x => x.name === name)) return vol;
  const vs = [...entryIdx].filter(([v, xs]) => v !== REGVOL && xs.some(x => x.name === name)).map(([v]) => v).sort(cmp);
  if (vs.length > 1) ownerAmbig.add(`${name}：${vs.join('、')}`);
  return vs[0] ?? REGVOL;
}
function namesInSection(vol, sec) {
  const key = vol + '|' + sec; if (secNamesCache.has(key)) return secNamesCache.get(key);
  const f = volFiles.find(x => volOfFile(x) === vol); const ls = f ? volText.get(f) : [];
  const esc = sec.replace(/\./g, '\\.'); const hi = ls.findIndex(l => new RegExp(`^#+\\s+§?${esc}(?![0-9.])`).test(l));
  let out = null;
  if (hi >= 0) {
    const lvl = ls[hi].match(/^#+/)[0].length; let e = ls.findIndex((l, i) => i > hi && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= lvl); if (e < 0) e = ls.length;
    // 全书任何一卷登记过的入口名（含卷二 §2.1、§2.9 等登记处）出现在该节，都计入这一节的入口；归属按本卷、主办卷 §3、卷二兜底（李白 11-16 03:5x ①，chk-1116-y26 T6）
    const body = ls.slice(hi, e).join('\n'); const hit = new Set();
    // 外卷登记名只在原句指的就是那个入口时计入（李白 11-16 04:1x ① K2）：写成调用形"`名(…)`"，或所在分句明说调用（含"调"）、点名该入口所在卷；
    // 名字后紧跟"族、角色、字段、列、键、代号、词表"一类的，不计。本卷登记名照旧出现即计
    let depth = null; // 括号层级（按行清零），分句只在层级 0 的标点处切
    for (const m of body.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)([^`]*)`/g)) {
      const n = m[1]; if (!entryNames.has(n)) continue; const ov = ownerVolOf(n, vol);
      if (ov === vol) { hit.add(n); continue; }
      if (m[2].startsWith('(')) { hit.add(n); continue; }
      if (m[2]) continue; // "`名.字段`"一类
      const after = body.slice(m.index + m[0].length, m.index + m[0].length + 4).trim();
      if (/^(族|角色|字段|列|键|代号|词表)/.test(after)) continue;
      if (primNames.has(n)) continue; // 外卷原语只引用、不收编（04:53 第 3 条）
      // "统一入口"小节里列出的外卷入口（"读：`x`"一类）算明说调用、指向该入口（04:53 第 1 条）
      const hl = body.lastIndexOf('\n#', m.index); const headLine = hl >= 0 ? body.slice(hl + 1, body.indexOf('\n', hl + 1)) : body.slice(0, body.indexOf('\n'));
      if (/统一入口/.test(headLine)) { hit.add(n); continue; }
      // 分句不在括注内部切（04:53 第 2 条）：从该名字向两边找括号层级为 0 的"，。；"或换行
      const isDelim = ch => ch === '，' || ch === '。' || ch === '；' || ch === '\n';
      if (!depth) { depth = new Array(body.length); let dd = 0; for (let i = 0; i < body.length; i++) { const ch = body[i]; if (ch === '（' || ch === '(') dd++; else if ((ch === '）' || ch === ')') && dd > 0) dd--; else if (ch === '\n') dd = 0; depth[i] = dd; } }
      let st = m.index; for (; st > 0; st--) { if (isDelim(body[st - 1]) && (depth[st - 1] === 0 || body[st - 1] === '\n')) break; }
      let en = m.index + m[0].length; for (; en < body.length; en++) { if (isDelim(body[en]) && (depth[en] === 0 || body[en] === '\n')) break; }
      // 直接指称（李白 11-16 08:xx，与 04:53"读：x"同一条规则扩到正文）：括注之外，"读 `x`""经 `x`""取 `x`""`x` 的结果/返回"把入口当读取来源或调用结果的，计入
      const bef = body.slice(Math.max(0, m.index - 3), m.index).replace(/\s/g, ''); const aft = body.slice(m.index + m[0].length, m.index + m[0].length + 4).replace(/\s/g, '');
      const direct = depth[m.index] === 0 && (/(读|经|取)$/.test(bef) || /^(的结果|的返回)/.test(aft));
      const clause = body.slice(st, en);
      if (/调|入口/.test(clause) || mentionsVol(clause, ov)) hit.add(n); // 分句明说调用、称其为入口、或点名其登记卷（按卷名别名表）
      else if (direct) { hit.add(n); directHits.push(`${vol} §${sec}:${n}`); }
    }
    out = [...hit].sort().map(n => ({ name: n, vol: ownerVolOf(n, vol) }));
  }
  secNamesCache.set(key, out); return out;
}

// ---- 表代号（卷二各表节，登记次序）与表主 ----
const tableList = [];
for (const l of reg) if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) tableList.push(m[1]); }
const tables = new Set(tableList);
const cov = rd(`${DIR}/${CFG.coverage.file}`).split(/\r?\n/);
const seqVol = new Map();
{ const s = cov.findIndex(l => l.startsWith(CFG.coverage.addVol)); let e = cov.findIndex((l, i) => i > s && /^## /.test(l)); if (e < 0) e = cov.length;
  let head = null;
  for (let i = s + 1; i < e; i++) {
    const l = cov[i];
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l);
    if (!head) { head = c.map(x => x.replace(/`/g, '')); continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const qi = head.indexOf(CFG.fields.seq), vi = head.indexOf(CFG.fields.volCol);
    if (qi < 0 || vi < 0) continue;
    const m = (c[vi] ?? '').match(VOL);
    if (/^\d+$/.test(c[qi]) && m) seqVol.set(+c[qi], m[0]);
  } }
const tableOwner = new Map(); // 表 → 卷
{ let cur = null;
  for (const l of reg) {
    if (/^#+ /.test(l)) { cur = null; if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) { cur = m[1]; tableOwner.set(cur, null); } } continue; }
    if (cur && l.startsWith('- `' + CFG.fields.owner + '`')) { const m = l.match(/\d+/); if (m) tableOwner.set(cur, seqVol.get(+m[0]) ?? null); }
  } }

// ---- 表的必填引用（卷二 §5 各表节的维度表：类型栏写 ref <表>，必填栏为 always）----
const tableRefs = new Map(); // 表 → Set(被引用表)
const tableRefWhere = new Map(); // "表→被引用表" → [{field, line}]（卷二行号，环报告用）
{ let cur = null;
  for (const [li, l] of reg.entries()) {
    if (/^#+ /.test(l)) { cur = null; if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) { cur = m[1]; tableRefs.set(cur, new Set()); } } continue; }
    if (!cur || !/^\|/.test(l)) continue;
    const c = cells(l);
    if (c.length < 3 || c[2] !== 'always') continue;
    for (const m of c[1].matchAll(/\bref ([a-z_]+)\b/g)) if (tables.has(m[1]) && m[1] !== cur) { tableRefs.get(cur).add(m[1]); const k = `${cur}→${m[1]}`; (tableRefWhere.get(k) ?? tableRefWhere.set(k, []).get(k)).push({ field: c[0].replace(/`/g, ''), line: li + 1 }); }
  } }

// ---- 卷二 §2.1 入口清单：表 → 读入口名 ----
const viewOf = new Map();
{ const s = reg.findIndex(l => /^### 2\.1 /.test(l)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length;
  for (let i = s; i < e; i++) {
    if (!/^\|/.test(reg[i])) continue;
    const c = cells(reg[i]);
    if (!/^\d+$/.test(c[0] ?? '')) continue;
    const k = (c[1] ?? '').match(/^([a-z_]+)/), en = (c[2] ?? '').match(/`([A-Za-z_]\w*)/);
    if (k && en && tables.has(k[1])) viewOf.set(k[1], en[1]);
  } }

// ---- 齐全率下限键（卷二 §6.12 键表）按表分配：键名以表代号的驼峰式开头 ----
const dimKeys = [...regText.matchAll(/^\| `(rules\.dimfill\.[A-Za-z0-9]+)` \|/gm)].map(m => m[1]);
const camel = t => t.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const dimKeysOf = t => dimKeys.filter(k => k.slice('rules.dimfill.'.length).toLowerCase().startsWith(camel(t).toLowerCase()));

// ---- 编号定义索引（乙-6b，李白 11-15 18:50 第 1 条）：通用识别规则在 id-defs.mjs（写法清单见 审查/脚本输出/乙6b-编号写法清单.md）----
// 定义位（表格首格、列表项开头含"X式："前缀、加粗段首）上的编号，按所在标题与表首列判性质；accept 只取"验收类"（断言号、扫描条代号、不变量号，卷十一 §2.2）。
const defsOf = new Map(); // 卷 → [定义]
for (const [f, ls] of volText) { const v = volOfFile(f); if (v) defsOf.set(v, scanVolume(ls, v).map(d => ({ ...d, file: f }))); }
const defined = new Map(); // 卷 → Set(验收类编号)
const assertText = new Map(); // 卷 → [验收类定义行]
for (const [v, ds] of defsOf) for (const d of ds) {
  if (d.nature !== '验收类') continue;
  (defined.get(v) ?? defined.set(v, new Set()).get(v)).add(d.tok);
  (assertText.get(v) ?? assertText.set(v, []).get(v)).push(d);
}
// 卷一 §9 "沿用 I1–I32（架构 02）"：区间写法定义区间内的不变量编号
for (const [f, ls] of volText) { const v = volOfFile(f); for (const l of ls) { const m = l.match(/沿用 I(\d+)[–-]I(\d+)/); if (m && v) for (let i = +m[1]; i <= +m[2]; i++) (defined.get(v) ?? defined.set(v, new Set()).get(v)).add('I' + i); } }
// 编号里没有卷序号的（A-1、T-1、I33）只在本卷有效，写成"卷名:编号"
const bareTok = t => !/^[A-Z][A-Za-z]{0,3}?[0-9]+[a-z]?-/.test(t);
const qual = (vol, t) => (bareTok(t) ? `${vol}:${t}` : t);
// 补验收判据（乙-6b）：卡的行落点没写编号时，取对象所在卷的验收类编号：定义行提到本卡对象代号、要接或上线的入口名、文件名的
function assertionsFor(vol, objCode, entryNames) {
  const keys = [objCode, ...entryNames].filter(Boolean);
  return uniq((assertText.get(vol) ?? []).filter(a => keys.some(k => a.text.includes('`' + k + '`') || a.text.includes('`' + k + '('))).map(a => qual(vol, a.tok))).sort();
}
const defIdx = new Map(); // 编号（没有卷序号的写"卷名:编号"）→ 它的全部定义（各种性质）
for (const [v, ds] of defsOf) for (const d of ds) { const k = qual(v, d.tok); (defIdx.get(k) ?? defIdx.set(k, []).get(k)).push(d); }
const dimKeySet = new Set(dimKeys);
const tokRe =new RegExp('(?<![A-Za-z0-9_])(' + ID_TOK + ')(?![0-9A-Za-z])', 'g');
const splitQ = tok => { const i = tok.indexOf(':'); return i < 0 ? [null, tok] : [tok.slice(0, i), tok.slice(i + 1)]; };
// 编号在所指卷里有定义：带卷序号的在任一卷有定义；不带卷序号的在所写卷名下有定义
function inIndex(idx, tok) {
  const [home, bare] = splitQ(tok);
  if (home) return idx.get(home)?.has(bare) ?? false;
  for (const s of idx.values()) if (s.has(bare)) return true;
  return false;
}
const acceptOk = tok => { const t = String(tok).replace(/\s*\([a-z]\)$/, ''); return dimKeySet.has(t) || inIndex(defined, t); }; // 子款"(x)"随所属编号认

// ---- 卷十一自己的扫描条（清扫卡的判据：全部扫描）----
const s11 = [...(defined.get('卷十一') ?? [])].filter(x => /^S11-/.test(x)).sort((a, b) => cmp(+a.slice(4), +b.slice(4)));
// ---- 门禁自身的条目：验收卷写明"A 至 B 是门禁自身的条目……随门禁卡……进必过集合"的那一段（李白终核卷十一复核第 4 条：明写的照写，一条不落空）----
const gateItemTo = []; // 门禁自身条目 → 所归门禁卡（摘要用）
const gateItems = (() => { const f = volFiles.find(x => x.startsWith('卷十二-')); const v = volOfFile(f); const l = volText.get(f).find(x => /门禁自身的条目/.test(x) && /随门禁卡/.test(x)) ?? ''; const m = l.match(/(S\d+-)(\d+) 至 S\d+-(\d+)/); if (!m) return []; const out = []; for (let i = +m[2]; i <= +m[3]; i++) if (defined.get(v)?.has(m[1] + i)) out.push({ tok: m[1] + i, vol: v }); return out; })();
// ---- 门禁设施登记（卷十二 §2.11 登记表，登记次序）----
const gateFacilities = []; const gateOwner = new Map(); const gateFacInfo = new Map(); // 设施 → {paths, gateCard, entries}
{ const f = volFiles.find(x => x.startsWith('卷十二-')); const ls = volText.get(f);
  const s = ls.findIndex(l => /^### 2\.11 /.test(l)); let e = ls.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = ls.length;
  let head = null;
  for (let i = s; i < e; i++) {
    if (!/^\|/.test(ls[i])) { head = null; continue; }
    const c = cells(ls[i]);
    if (!head) { head = c.map(x => x.replace(/`/g, '')); continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const m = c[0].match(/^`([a-z][a-z0-9-]*)`/);
    if (!m || head[0] !== 'facCode') continue;
    const col = k => c[head.indexOf(k)] ?? '';
    gateFacilities.push(m[1]); gateOwner.set(m[1], col('ownerVol').match(VOL)?.[0] ?? null);
    // 卷十二 §2.11 的机读列 gateCard、entries（封卷后勘误 1116k7，李白终核卷十一 挡-1、挡-2）
    gateFacInfo.set(m[1], { paths: [...col('paths').matchAll(/`([^`]+)`/g)].map(x => x[1]), gateCard: (col('gateCard').match(/^G-\d+$/) ?? [null])[0], notByGate: col('gateCard').trim() === '—', entries: col('entries').trim() });
  } }

// ================= 仓库文件索引（只读，锚点解析，与乙-4 同口径）=================
const ROOTS = ['server-plugin', 'extension', 'tools', 'tests', 'world'];
const all = [];
function walk(rel) {
  for (const name of readdirSync(`${REPO}/${rel}`).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    if (statSync(`${REPO}/${r}`).isDirectory()) walk(r);
    else if (/\.(?:mjs|js|json)$/.test(name)) all.push(r);
  }
}
ROOTS.forEach(walk);
const byBase = new Map();
for (const f of all) { const b = f.slice(f.lastIndexOf('/') + 1); (byBase.get(b) ?? byBase.set(b, []).get(b)).push(f); }
const exact = new Set(all);
function resolveFile(spec) {
  if (/\*/.test(spec)) return { unresolved: true };
  if (exact.has(spec)) return { path: spec };
  const suf = all.filter(f => f.endsWith('/' + spec));
  // 同名文件多于一个时，先走"优先取 server-plugin/、extension/ 下那个"再判歧义（李白 11-15 19:08 第 3 条，整类：后缀与裸文件名两条分支同一条优先规则）
  const preferRuntime = c => { const sp = c.filter(f => f.startsWith('server-plugin/') || f.startsWith('extension/')); return sp.length === 1 ? { path: sp[0] } : { ambiguous: c }; };
  if (suf.length === 1) return { path: suf[0] };
  if (suf.length > 1) return preferRuntime(suf);
  if (!spec.includes('/')) {
    const c = byBase.get(spec) ?? [];
    if (c.length === 1) return { path: c[0] };
    if (c.length > 1) return preferRuntime(c);
  }
  return { unresolved: true };
}
// 模块组（卷二 §2.7 的目录登记；不在任何模块组的 server-plugin 文件属规则层）
function groupOf(p) {
  if (p.startsWith('server-plugin/input/')) return 'inputEdge';
  if (p.startsWith('server-plugin/gate/')) return 'gate';
  if (p.startsWith('server-plugin/output-gate/')) return 'outputGate';
  if (p.startsWith('server-plugin/ai-gate/')) return 'aiGate';
  if (p.startsWith('server-plugin/textcore/')) return 'textcore';
  if (p.startsWith('extension/host/')) return 'host';
  if (p.startsWith('extension/textcore/')) return 'clientTextcore';
  if (p.startsWith('extension/')) return 'display';
  if (p.startsWith('server-plugin/kernel/')) return 'kernel';
  if (p.startsWith('server-plugin/')) return 'rules层';
  return p.split('/')[0];
}
const MODGROUPS = new Set(['kernel', 'inputEdge', 'display', 'gate', 'outputGate', 'aiGate', 'host', 'content-scripts', 'textcore', 'clientTextcore']);
const GATEFAC = new Set(gateFacilities);
const isRuntime = p => /^(server-plugin|extension)\//.test(p);
for (const r of rows) {
  r.res = [];
  for (const a of r.anchors) {
    const x = resolveFile(a.file);
    if (x.path) r.res.push({ path: x.path, lines: a.lines });
    else if (x.ambiguous) r.res.push({ ambiguous: x.ambiguous, raw: a.file, lines: a.lines });
    else r.res.push({ raw: a.file, lines: a.lines, unresolved: true });
  }
  r.files = uniq(r.res.filter(x => x.path).map(x => x.path)).sort();
  r.obj0 = r.targetObject.replace(/`/g, '').trim();
}

// ================= 对象体系 =================
const sysByKey = new Map(sysJ.map(s => [s.system, s]));
const sysOfVol = new Map(sysJ.map(s => [s.volume, s]));
// 系统键 → 系统：sysJ（乙-4 补）加上乙-6a 转录里有、sysJ 没有的系统（卷二 §2.7 JSON 示例登记的系统，如 sys.capacity）；不在生成器里造对象。
// 这类系统的归属卷、入口取乙-6a 转录里的值：入口 = 它的 predicates 的函数名（卷二 §2.7 说 view 与 predicates 是系统的读入口）。
for (const x of sixJ.systems) if (!sysByKey.has(x.system)) {
  const pv = Array.isArray(x.cols.predicates.value) ? x.cols.predicates.value : [];
  sysByKey.set(x.system, { system: x.system, volume: x.volume, tables: [], entries: pv.map(p => p.slice(p.indexOf('#') + 1)), entryCallerFiles: {}, defFiles: [], callerUnion: [], pending: [], fromSix: true });
}
const sysOfTable = new Map(); // 表 → 系统（tables 含它）
for (const s of sysJ) for (const t of s.tables) sysOfTable.set(t, s);
const vocabSet = new Set([...regText.matchAll(/([a-z][a-z0-9_]*)→`[a-z]+_`/g)].map(m => m[1]));

// 卷二 §6.11 文件级迁移表（R11-7.5，李白 18:50 第 2 条）：搬迁卡的文件集合与行只取这张表里落点对象为该模块组的行。
const moveRows = new Map(); // 编号 → {obj, files, dir}
const fileMoves = new Map(); // 现有文件 → [{obj, dir}]（表内次序）
const mechRows = new Map(); // 编号 → {obj, ident}（全仓库机械替换类）
const rowFilesOf = new Map(); let prevFiles = []; // 编号 → 现有文件（"同上"取上一行）
{
  const s = reg.findIndex(l => l.startsWith(CFG.registry.filemoves)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length;
  let head = null;
  for (let i = s + 1; i < e; i++) {
    const l = reg[i];
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l);
    if (!head) { head = c; continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const ki = head.indexOf('编号'), fi = head.indexOf('现有文件'), di = head.indexOf('落点'), oi = head.indexOf('落点对象'), pi = head.findIndex(h => /mig_disp/.test(h));
    if (ki < 0 || fi < 0 || di < 0 || oi < 0 || pi < 0) continue;
    const obj = (c[oi] ?? '').replace(/`/g, '').trim();
    // "现有文件"栏写"同上"的行，文件取上一行的（表内写法，整类）
    const own = []; for (const m of (c[fi] ?? '').matchAll(/`([^`]+\.(?:mjs|js))`/g)) { const x = resolveFile(m[1]); if (x.path) own.push(x.path); }
    const rf = /^同上/.test((c[fi] ?? '').trim()) ? prevFiles : own; rowFilesOf.set(c[ki], rf); prevFiles = rf;
    // 全仓库机械替换类（李白 11-15 19:08 第 1 条、19:12；卷十一 R11-7.8 例外）："现有文件"栏写"全仓库 `标识符`"的行，文件清单由本脚本按标识符列出，进清扫卡
    const mm = (c[fi] ?? '').match(/^全仓库\s*`([^`]+)`/);
    if (mm) { mechRows.set(c[ki], { obj, ident: mm[1] }); continue; }
    // 搬迁卡只取处置为 relocate_only 的搬迁子行（R11-7.5，封卷后勘误 1115y12）；改调入口子行落点对象是消费方系统，走领域卡
    if ((c[pi] ?? '').replace(/`/g, '').trim() !== 'relocate_only') continue;
    const dest = [...(c[di] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]).find(t => t.includes('/'));
    const dir = !dest ? null : dest.endsWith('/') ? dest.slice(0, -1) : dest.slice(0, dest.lastIndexOf('/'));
    const files = rowFilesOf.get(c[ki]) ?? [];
    moveRows.set(c[ki], { obj, files: uniq(files).sort(), dir });
    if (dir) for (const f of files) (fileMoves.get(f) ?? fileMoves.set(f, []).get(f)).push({ obj, dir });
  }
}
const isMoveRow = (r, code) => moveRows.get(r.rowKey)?.obj === code;

// 一个对象 = {kind, code, volume, sys}；表对象的系统 = 含它的系统；系统对象 = 无 tables 的系统；账本系统另处理
function tableObj(t) { return { kind: 'table', code: t, volume: tableOwner.get(t) ?? sysOfTable.get(t)?.volume ?? null, sys: sysOfTable.get(t) ?? null }; }
function sysObj(s) { return s.tables.length ? tableObj(s.tables[0]) : { kind: 'system', code: s.system, volume: s.volume, sys: s }; }
const objKey = o => `${o.kind}:${o.code}`;
// 登记处：各卷表格首格开头写着该代号的行（规则表键取代号本身或以"代号."开头的键；词表族取族名本身）；只有卷二登记的不算（卷二是登记总表，没有系统登记项），
// 别卷恰一卷时取该卷；不止一卷或没有时定不出登记处，交判据一
// 只认登记表行（chk-1116-y17 T1，整类）：规则表键取首格是 `rules.` 键的表行；词表族取"词表族 `X`"标题里的族名与"本卷拥有的词表族"登记表首格的族名；
// 维度表里的字段行（首格是字段名、类型栏写 ref vocab X）不是登记
const defTok = new Map(); // 登记代号 → Set(卷)
const addDef = (t, v) => (defTok.get(t) ?? defTok.set(t, new Set()).get(t)).add(v);
for (const [f, ls] of volText) { const v = volOfFile(f); if (!v) continue; let code = false, ownTbl = false;
  for (const l of ls) {
    if (/^```/.test(l)) { code = !code; continue; } if (code) continue;
    const h = l.match(/^#+\s+(.*)$/); if (h) { ownTbl = new RegExp(CFG.vocabOwn.ownTable).test(h[1]); if (h[1].includes(CFG.vocabOwn.heading)) for (const m of h[1].matchAll(/`([a-z][a-z0-9_]*)`/g)) addDef(m[1], v); continue; }
    if (!/^\|/.test(l)) continue;
    const m = (cells(l)[0] ?? '').match(/^`([a-z][A-Za-z0-9_.]*)`/); if (!m) continue;
    // 登记表里写明内容归别卷的行（"内容与字段归卷X"）不算本卷登记
    const elsewhere = [...l.matchAll(new RegExp(`归\\s*(${V_RE})`, 'g'))].some(x => x[1] !== v);
    if (/^rules\./.test(m[1]) || (ownTbl && !elsewhere)) addDef(m[1], v);
  } }
function regVolOf(o) {
  const vs = new Set(); for (const [t, s] of defTok) if (t === o || (/^rules\./.test(o) && t.startsWith(o + '.'))) for (const v of s) vs.add(v);
  const others = [...vs].filter(v => v !== CFG.registry.file.match(VOL)?.[0]);
  return others.length === 1 ? others[0] : null;
}
const regMoved = []; // 按登记卷定、与判据一结果不同的行
// 迁移行 → 对象（落点对象六类 → 卡的四种对象）
function objectOfRow(r) {
  const o = r.obj0;
  if (PLACEHOLDER.has(o)) return null;
  if (mechRows.has(r.rowKey)) return null; // 机械替换类不归领域卡，进清扫卡（见下）
  if (tables.has(o)) return tableObj(o);
  if (sysByKey.has(o)) return sysObj(sysByKey.get(o));
  // 落点是模块组、却不在卷二 §6.11 文件级迁移表里的行，是"改调该组入口"，不是搬迁：不进搬迁卡，按下面"其余"一条归接收卷的对象
  if (MODGROUPS.has(o) && isMoveRow(r, o)) return { kind: 'module_group', code: o, volume: null, sys: null };
  // 门禁设施代号按登记卷取对象（卷十一 R11-2.5，封卷后勘误 1116k9）：由门禁卡建的取该设施；不由门禁卡建的（gateCard 为"—"）取其 ownerVol 的系统登记项
  if (GATEFAC.has(o)) { if (gateFacInfo.get(o)?.notByGate) { const s = sysOfVol.get(gateOwner.get(o)); return s ? sysObj(s) : null; } return { kind: 'gate_facility', code: o, volume: null, sys: null }; }
  // 规则表键、词表族条目：对象本身有登记处的，按登记卷定，不读落点文字（李白 11-16 01:25 第 1 条；卷十一 §2.3、:164"须在对应登记"）
  const rv = receivingVolume(r.target, r.volume, CFG.volCode, VOLS);
  if (/^rules\./.test(o) || vocabSet.has(o)) {
    const rvol = regVolOf(o);
    if (rvol && sysOfVol.get(rvol)) { if (rvol !== rv.vol) regMoved.push({ k: r.rowKey, o, reg: rvol, j1: rv.vol }); return sysObj(sysOfVol.get(rvol)); }
  }
  // 定不出登记处的（其余）：判据一，归接收卷的对象（有主表取第一张表，无主表取系统键）
  const s = sysOfVol.get(rv.vol) ?? sysOfVol.get(r.volume);
  if (s) return sysObj(s);
  // 李白 11-15 16:55 第一条，19:08 第 2 条放宽："删除、锚点定不出系统"的行取被删概念的所属系统——锚点文件恰是一个系统登记项的定义文件时取该系统
  if (r.disp === 'delete') { const own = sysJ.filter(x => (x.defFiles ?? []).some(f => r.files.includes(f))); if (own.length === 1) return sysObj(own[0]); }
  return null;
}
for (const r of rows) r.obj = objectOfRow(r);

// ================= 位置组（R11-2.4，口径 A）与接收对象（R11-2.5 第一步）=================
const parent = rows.map((_, i) => i);
const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
{ const perFile = new Map();
  rows.forEach((r, i) => {
    for (const x of r.res) {
      if (x.ambiguous) continue;
      const key = x.path ?? 'raw:' + x.raw;
      const whole = x.lines.length === 0;
      const rs = whole ? [[1, 1e9]] : x.lines;
      for (const [lo, hi] of rs) (perFile.get(key) ?? perFile.set(key, []).get(key)).push({ i, lo, hi, whole });
    }
  });
  for (const L of perFile.values()) {
    L.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.i - b.i);
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length && L[b].lo <= L[a].hi; b++) if (L[a].i !== L[b].i && L[a].whole === L[b].whole) union(L[a].i, L[b].i);
  } }
const posGroups = new Map();
rows.forEach((r, i) => { const k = find(i); (posGroups.get(k) ?? posGroups.set(k, []).get(k)).push(r); });
const kindRank = { gate_facility: 0, module_group: 1, table: 2, system: 3 };
// 账本所在的系统登记项：账本类迁移行的对象来源由卷六 §3.3 的系统登记表给出；本卷按数据取"卷六的系统登记项"（sys.economy）。
// 账本系统取卷二 §2.7 登记项上的机读标记 `ledgerSystem: <系统键>`（封卷后勘误 1116k7，李白终核卷十一 挡-2 第 4 条；不按卷名）
const ledgerSysKey = (() => { const m = regText.match(/`ledgerSystem:\s*(sys\.[a-z_]+)`/); return m && sysByKey.has(m[1]) ? m[1] : null; })();
const isFixedObj = o => o.kind === 'gate_facility' || (o.kind === 'system' && o.code === ledgerSysKey) || (o.kind === 'table' && o.sys?.system === ledgerSysKey);
let nObjConflict = 0; const objConflicts = []; const pickMoved = []; const mergedRecheck = [];
const unassigned = [];
for (const [k, rs] of [...posGroups].sort((a, b) => a[0] - b[0])) {
  const cand = rs.filter(r => r.obj);
  const cs = uniq(cand.map(r => objKey(r.obj)));
  let pick = null;
  if (cs.length === 1) pick = cand[0].obj;
  else if (cs.length > 1) {
    // 第一步（R11-2.5 原文，李白 11-16 01:25 第 5 条）：取 zeroRow 所在卷零行主归卷等于来源卷的那一行的对象——zeroRow 还没转录，按"没有这样的行"处理；
    // 于是取候选对象里首卡在 R11-7.2 次序中最前的那个（次序见文件头的不动点）；有候选不在次序里的，记"算不出"
    nObjConflict++;
    const objsU = [...new Map(cand.map(r => [objKey(r.obj), r.obj])).values()];
    const rk = o => (ORDER.has(objKey(o)) ? +ORDER.get(objKey(o)) : Infinity);
    // 固定卡（门禁、账本母卡与子卡，阶段出自卷一，卷十一 R11-7.1）不参加跨对象的位置组改判（李白 11-16 02:18 第 2 条 B1 选①）：
    // 本对象是固定卡对象的行留在本对象，别对象的行只在非固定的候选里取
    const free = objsU.filter(o => !isFixedObj(o));
    pick = (free.length ? free : objsU).sort((a, b) => rk(a) - rk(b) || cmp(objKey(a), objKey(b)))[0];
    const cnt = new Map(); for (const r of cand) cnt.set(objKey(r.obj), (cnt.get(objKey(r.obj)) ?? 0) + 1);
    const old = objsU.slice().sort((a, b) => cnt.get(objKey(b)) - cnt.get(objKey(a)) || kindRank[a.kind] - kindRank[b.kind] || cmp(a.code, b.code))[0]; // 旧取法，只作对照
    objConflicts.push({ rows: rs.map(r => r.rowKey), objs: cs, pick: objKey(pick), old: objKey(old), unranked: objsU.filter(o => !ORDER.has(objKey(o))).map(objKey) });
    for (const r of rs) if (objKey(old) !== objKey(pick)) pickMoved.push(r.rowKey);
    for (const r of cand) if (!isFixedObj(r.obj) && objKey(r.obj) !== objKey(pick)) mergedRecheck.push({ k: r.rowKey, own: objKey(r.obj), pick: objKey(pick) });
  }
  for (const r of rs) {
    r.posGroup = k;
    r.recvObj = CHILD || (r.obj && isFixedObj(r.obj)) ? r.obj : pick; // 子进程：不并组改判，每行取自己的对象；固定卡对象的行留在本对象
    if (!r.recvObj) unassigned.push(r.rowKey);
  }
}

// ================= 账本系统（卷一 §6.5：母卡 LEDGER-1 与子卡）=================
// （账本系统键 ledgerSysKey 见上，位置组定对象时已要用）

// ================= 消费者组（R11-3.4）=================
const objs = new Map(); // objKey → {obj, rows}
for (const r of rows) if (r.recvObj) (objs.get(objKey(r.recvObj)) ?? objs.set(objKey(r.recvObj), { obj: r.recvObj, rows: [] }).get(objKey(r.recvObj))).rows.push(r);
// 全部表与无主表系统也要有对象（没有迁移行的对象仍有首卡）
for (const t of tableList) { const o = tableObj(t); if (!objs.has(objKey(o))) objs.set(objKey(o), { obj: o, rows: [] }); }
for (const s of sysByKey.values()) if (!s.tables.length) { const o = sysObj(s); if (!objs.has(objKey(o))) objs.set(objKey(o), { obj: o, rows: [] }); }
// 门禁设施对象（登记表里每个设施）
for (const g of gateFacilities) { const o = { kind: 'gate_facility', code: g, volume: null, sys: null }; if (!objs.has(objKey(o))) objs.set(objKey(o), { obj: o, rows: [] }); }

function sliceFiles(files) {
  const byG = new Map();
  for (const f of uniq(files).sort()) { const g = groupOf(f); (byG.get(g) ?? byG.set(g, []).get(g)).push(f); }
  const groups = [];
  for (const g of [...byG.keys()].sort()) {
    const fs = byG.get(g);
    const mjs = fs.filter(f => f.endsWith('.mjs')), rest = fs.filter(f => !f.endsWith('.mjs'));
    const nSeg = Math.max(1, Math.ceil(mjs.length / MAXFILES));
    for (let s = 0; s < nSeg; s++) {
      const part = mjs.slice(s * MAXFILES, (s + 1) * MAXFILES);
      groups.push({ key: `${g}-${s + 1}`, mg: g, files: s === 0 ? [...part, ...rest].sort() : part });
    }
  }
  return groups.sort((a, b) => cmp(a.key, b.key));
}
function consumerFiles(entry) {
  const o = entry.obj;
  const c1 = uniq(entry.rows.flatMap(r => r.files.filter(isRuntime))).sort();
  const systems = o.kind === 'module_group' || o.kind === 'gate_facility' ? [] : o.kind === 'table' ? sysJ.filter(s => s.tables.includes(o.code)) : [o.sys];
  const c2 = uniq(systems.flatMap(s => s.callerUnion ?? [])).filter(isRuntime).sort();
  const c3 = uniq(systems.flatMap(s => (s.defFiles ?? []).flatMap(f => [...(importers.get(f) ?? [])]))).filter(isRuntime).sort();
  return { c1, c2, c3, all: uniq([...c1, ...c2, ...c3]).sort() };
}
for (const e of objs.values()) {
  e.cons = consumerFiles(e);
  if (e.obj.kind === 'module_group') e.groups = []; // 搬迁卡：下面按 R11-7.5 切段
  else if (e.obj.kind === 'gate_facility') e.groups = [];
  else e.groups = sliceFiles(e.cons.all);
}
// 搬迁卡切段（卷十一 R11-7.5，李白 11-15 18:22）：一组超过 rules.migration.maxFiles 个 .mjs 时拆成多张段卡，逐级细分，取第一个有数据的级别：
//   ① 消费者组（consumer_group）：文件现所在的模块组（卷二 §2.7 的模块组登记，R11-3.4 第一步）；
//   ② 目标子目录（target_subdir）：卷二 §6.11 文件级迁移表里该文件、落点对象为本组的行，其"落点"栏第一个路径所在目录；
//   ③ 路径升序（path_order）兜底：没有 ② 数据的文件，或同一子目录仍超上限，按路径升序每满上限切一段。
// 整类判：只看文件数与上述数据，不按组名或文件名特判。段号 segNo 按 ①键、②键（有子目录的在前、子目录名升序）、③段序升序编。
function relocateSegments(code, files) {
  const isM = f => f.endsWith('.mjs');
  const chunk = (fs, axis, tag, out) => { const m = fs.filter(isM), r = fs.filter(f => !isM(f)); const k = Math.max(1, Math.ceil(m.length / MAXFILES)); for (let s = 0; s < k; s++) out.push({ axis, tag: `${tag}#${s}`, files: [...m.slice(s * MAXFILES, (s + 1) * MAXFILES), ...(s === 0 ? r : [])] }); };
  if (uniq(files).filter(isM).length <= MAXFILES) return [{ key: `${code}-1`, mg: code, files: uniq(files).sort(), splitAxis: 'whole', segNo: 1 }]; // 不超上限：整组一张
  const segs = [];
  const byMG = new Map(); for (const f of uniq(files).sort()) { const g = groupOf(f); (byMG.get(g) ?? byMG.set(g, []).get(g)).push(f); }
  for (const g of [...byMG.keys()].sort()) {
    const fs = byMG.get(g);
    if (fs.filter(isM).length <= MAXFILES) { segs.push({ axis: 'consumer_group', tag: g, files: fs }); continue; }
    const bySub = new Map(), none = [];
    for (const f of fs) { const d = (fileMoves.get(f) ?? []).find(x => x.obj === code)?.dir; if (d) (bySub.get(d) ?? bySub.set(d, []).get(d)).push(f); else none.push(f); }
    for (const d of [...bySub.keys()].sort()) { const ds = bySub.get(d); if (ds.filter(isM).length <= MAXFILES) segs.push({ axis: 'target_subdir', tag: `${g}/${d}`, files: ds }); else chunk(ds, 'path_order', `${g}/${d}`, segs); }
    if (none.length) chunk(none, 'path_order', `${g}/~`, segs);
  }
  return segs.map((x, i) => ({ key: `${code}-${i + 1}`, mg: code, files: x.files.slice().sort(), splitAxis: x.axis, segNo: i + 1 }));
}
for (const e of objs.values()) if (e.obj.kind === 'module_group') e.groups = relocateSegments(e.obj.code, uniq([...moveRows.values()].filter(m => m.obj === e.obj.code).flatMap(m => m.files.filter(isRuntime))));

// ================= 行 → 卡（R11-2.5 第二步）=================
function groupIndexOf(e, row) { // 位置组的锚点文件落在哪个消费者组：取位置组内最小文件所在的组
  const fs = uniq(posGroups.get(row.posGroup).flatMap(r => [...r.files, ...(e.obj.kind === 'module_group' ? moveRows.get(r.rowKey)?.files ?? [] : [])].filter(isRuntime))).sort(); // 搬迁卡：§6.11 的行以"现有文件"栏为锚点
  if (!fs.length || !e.groups.length) return { idx: 0, straddle: false };
  const ids = uniq(fs.map(f => e.groups.findIndex(g => g.files.includes(f))).filter(i => i >= 0)).sort((a, b) => a - b);
  if (!ids.length) return { idx: 0, straddle: false };
  return { idx: ids[0], straddle: ids.length > 1 };
}
let nStraddle = 0;
for (const e of objs.values()) {
  e.byGroup = new Map();
  const seenPos = new Set();
  for (const r of e.rows) {
    const { idx, straddle } = groupIndexOf(e, r);
    if (straddle && !seenPos.has(r.posGroup)) { nStraddle++; }
    seenPos.add(r.posGroup);
    (e.byGroup.get(idx) ?? e.byGroup.set(idx, []).get(idx)).push(r);
  }
}

// ================= 读入口与上线 =================
const entryKey = (vol, name) => `${vol}:${name}`;
const entryRows = h2.entries.map(e => ({ vol: e.volume, sec: '§3.1', name: e.entry, callers: e.callerFiles ?? [] }));
// 每个系统的读入口；表的视图入口（卷二 §2.1）
const launchOwner = new Map(); // entryKey → 上线卡所属对象键
const leadObjOfSys = new Map(); // 系统键 → 领头对象（有表取 tables[0]，无表取系统本身）
for (const s of sysByKey.values()) leadObjOfSys.set(s.system, objKey(sysObj(s)));
const viewEntries = new Map(); // 表 → 入口记录
for (const t of tableList) {
  const name = viewOf.get(t); if (!name) continue;
  const own = tableOwner.get(t) ?? sysOfTable.get(t)?.volume;
  const hit = entryRows.find(e => e.name === name && e.vol === own) ?? entryRows.find(e => e.name === name);
  viewEntries.set(t, hit ?? { vol: own, sec: '§3.1', name, callers: [] });
}
const launchedBy = new Map(); // entryKey → 对象键
for (const [t, ent] of viewEntries) launchedBy.set(entryKey(ent.vol, ent.name), objKey(tableObj(t)));
for (const s of sysByKey.values()) for (const name of s.entries ?? []) {
  const k = entryKey(s.volume, name);
  if (!launchedBy.has(k)) launchedBy.set(k, leadObjOfSys.get(s.system));
}
const entryByKey = new Map(entryRows.map(e => [entryKey(e.vol, e.name), e]));
for (const sy of sysByKey.values()) for (const name of sy.entries ?? []) if (!entryByKey.has(entryKey(sy.volume, name))) entryByKey.set(entryKey(sy.volume, name), { vol: sy.volume, sec: sy.fromSix ? '§2.7' : '§3.1', name, callers: [] });
for (const ent of viewEntries.values()) if (!entryByKey.has(entryKey(ent.vol, ent.name))) entryByKey.set(entryKey(ent.vol, ent.name), ent);
const launchesOfObj = new Map();
for (const [k, ok] of launchedBy) (launchesOfObj.get(ok) ?? launchesOfObj.set(ok, []).get(ok)).push(k);

// ================= 卡 =================
const cards = [];
const FIRST_SEGS = ['seg_rows', 'seg_data', 'seg_readers', 'seg_delete'], FOLLOW_SEGS = ['seg_readers', 'seg_delete'];
const volName = v => v ?? null;
const isLedgerObj = e => e.obj.kind === 'system' && e.obj.code === ledgerSysKey || (e.obj.kind === 'table' && e.obj.sys && e.obj.sys.system === ledgerSysKey);
const entityKeyList = es => uniq(es).sort();

function newCard(base) {
  return Object.assign({
    cardId: '', cardKind: '', objectKind: null, objectCode: null, volume: null, phaseNo: null, groupKey: null, splitAxis: null, segNo: null,
    zeroRows: [], rowKeys: [], files: [], dataFiles: [], segs: [], entries: [], launches: [], retire: {}, accept: [],
    dependsOn: [], census: {}, testClass: {}, derivations: [], sortKeys: {}, state: 'drafted', approvals: [], mergeRef: '', fails: 0,
    pending: [],
  }, base);
}
const splitCode = fs => ({ code: fs.filter(f => f.endsWith('.mjs') || f.endsWith('.js')), data: fs.filter(f => f.endsWith('.json')) });
// entries（李白 11-16 01:30 第 1–3 条，卷十一 §2.2 entries"各卷 §3"）：每行的"卷、节"到该卷 §3 入口表取定义节对应的入口名；
// 恰一个入口才取，一节多个入口或找不到的不推定，列待查；只认 §3 入口表登记的名字（别表视图里的维度别名不是入口）
const entryMulti = [], entryNone = [], entryNoSec = [], entryMismatch = [];
function entryOfRow(r) {
  const s = rowSection(r); if (!s) { entryNoSec.push(r.rowKey); return null; }
  const hit = namesInSection(s.vol, s.sec) ?? [];
  if (hit.length !== 1) { (hit.length ? entryMulti : entryNone).push({ k: r.rowKey, at: `${s.vol} §${s.sec}`, names: hit.map(x => x.vol === s.vol ? x.name : `${x.vol}:${x.name}`) }); return null; }
  // 入口归登记它的卷（本卷优先、主办卷 §3、卷二兜底），不借别卷同名的上线键（chk-1116-y17 T4）
  const { name, vol } = hit[0];
  // 入口所属对象（上线它的对象）不是该行自己的 targetObject 的，不算入口边，列待查"入口与对象不符"（李白 11-16 02:30 第 2 条）
  const owner = launchedBy.get(entryKey(vol, name)) ?? (vol === REGVOL ? [...viewEntries].filter(([, e]) => e.name === name).map(([t]) => objKey(tableObj(t)))[0] : undefined);
  if (owner && r.obj && owner !== objKey(r.obj)) { entryMismatch.push({ k: r.rowKey, vol: r.volume, at: `${s.vol} §${s.sec}`, name, owner, own: objKey(r.obj) }); return null; }
  return { vol, sec: (entryIdx.get(vol) ?? []).find(x => x.name === name)?.sec ?? '§3', name };
}
function entriesOfRows(rs) {
  const m = new Map(); for (const r of rs) { const x = entryOfRow(r); if (x && in3(x.vol, x.name)) m.set(entryKey(x.vol, x.name), x); }
  return [...m].sort((a, b) => cmp(a[0], b[0])).map(([, v]) => v);
}
function entriesOfCard(e, files) {
  const set = new Map();
  const fset = new Set(files);
  // 卡只接本对象的入口：表接自己的读入口；系统级入口归领头对象（系统登记项的 tables[0]，无表的系统取它自己）的卡
  const own = e.obj.kind === 'table' ? sysJ.filter(s => s.tables[0] === e.obj.code) : e.obj.sys ? [e.obj.sys] : [];
  for (const s of own) for (const name of s.entries ?? []) { const k = entryKey(s.volume, name), ent = entryByKey.get(k); if (ent && launchedBy.get(k) === objKey(e.obj) && (ent.callers ?? []).some(f => fset.has(f))) set.set(k, ent); }
  if (e.obj.kind === 'table') { const v = viewEntries.get(e.obj.code); if (v) set.set(entryKey(v.vol, v.name), v); }
  return [...set].sort((a, b) => cmp(a[0], b[0])).map(([, v]) => ({ vol: v.vol, sec: v.sec, name: v.name }));
}
// 摘掉的规则号（李白 11-16 19:24 第 1 条 b）：行落点里写的编号若定义在"规则"节，不进 accept；记下来，卡的 accept 取空时，
// 到该规则所在小节的"验收断言"小节找文字里点名这条规则的断言号补上（须是验收类定义；找不到的保持空，进疑点名单）。
function assertionsCovering(refs) {
  const out = [], why = [];
  for (const { tok, defs } of refs) {
    const [, bare] = splitQ(tok);
    const esc = bare.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    const re = new RegExp('(?<![A-Za-z0-9-])' + esc + '(?![0-9A-Za-z]|\\.[0-9]|-[A-Z0-9])');
    for (const d of defs) {
      const home = volOfFile(d.file);
      const parent = d.head.split(' / ').slice(0, -1).join(' / ');
      for (const a of (assertText.get(home) ?? [])) {
        if (a.file !== d.file) continue;
        const hs = a.head.split(' / ');
        if (!/验收断言/.test(hs[hs.length - 1]) || !(a.head.startsWith(parent + ' / ') || a.head === parent)) continue;
        if (!re.test(a.text.replace(new RegExp('^.*?' + a.tok.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')), ''))) continue;
        const q = qual(home, a.tok); if (!out.includes(q)) { out.push(q); why.push({ rule: tok, assertion: q, at: `${a.file}:${a.line}` }); }
      }
    }
  }
  return { toks: out.sort(), why };
}
function acceptOfRows(rs, isFirstTable, tableCode, refs) {
  const acc = [];
  if (isFirstTable) acc.push(...dimKeysOf(tableCode));
  for (const r of rs) for (const m of (r.target ?? '').matchAll(tokRe)) {
    if ((r.target ?? '').slice(Math.max(0, m.index - 3), m.index).includes('台账')) continue; // "台账 S-24"是素材台账条目，不是本卷或别卷的扫描号
    // 没有卷序号的编号：紧前写了卷名的（"卷三乙 R-4"）归那一卷，否则归行的来源卷
    const before = (r.target ?? '').slice(0, m.index);
    const vm = before.match(new RegExp('(' + CFG.volCode + ')\\s*$'));
    const tok = qual(vm ? vm[1] : r.volume, m[1]);
    // 落点里写的编号：按定义的性质取——只取验收类；规则、记录、其他类（R、C、M 一类）是引用，不取。
    // 同一卷里同一个编号既是验收类又是别类（卷四 P-3 既是 §3.5 扫描条又是 §4.10 规则）的，紧前写了"§n"的按该节定，没写的分不清，不取。
    // 哪类都查不到的照取（短写法除外），由形式核对报 E-MIG-ACCEPT-FORM
    const ds = defIdx.get(tok) ?? [];
    if (!ds.length) { if (!SHORT_RE.test(m[1]) || acceptOk(tok)) acc.push(tok); continue; }
    let pick = ds;
    if (new Set(ds.map(d => d.nature)).size > 1) { const sm = before.match(/§\s*([0-9]+(?:\.[0-9]+)*)\s*$/); pick = sm ? ds.filter(d => d.head.split(' / ').some(h => h.replace(/^§/, '').startsWith(sm[1] + ' '))) : []; }
    if (pick.length && pick.every(d => d.nature === '验收类')) acc.push(tok);
    else if (refs && !refs.some(x => x.tok === tok)) { const rd = ds.filter(d => d.nature === '规则类'); if (rd.length && !ds.some(d => d.nature === '验收类' && pick.includes(d))) refs.push({ tok, defs: rd }); }
  }
  return uniq(acc).sort();
}
// mig_disp 的取值读卷十一 §2.1 封闭枚举表（不在脚本里写值）
const MIG_DISP = new Set(); { const f = volFiles.find(x => /^卷十一-/.test(x)); let cur = null; for (const l of volText.get(f)) { if (!/^\|/.test(l)) { cur = null; continue; } const c = cells(l); if (c[0]) cur = c[0].replace(/`/g, ''); if (cur === 'mig_disp') { const m = (c[1] ?? '').match(/^`([a-z_]+)`$/); if (m) MIG_DISP.add(m[1]); } } }
function pendingOfRows(rs) {
  const p = [];
  // 迁移行处置未完成按卷十一 §2.3 原定义：disp 不是 mig_disp 的值（R11-1.3），或落点（target）本身还没写（整格是待补、待定）；
  // 落点已写、只在其中注明某个细项待补（如节号）的，不算处置未完成（那是 entries 待查的事）
  for (const r of rs) if (!MIG_DISP.has(r.disp) || /^(待补|待定)/.test(String(r.target ?? '').trim())) p.push(`row:${r.rowKey}`);
  return p;
}
const ledgerGroups = []; // 账本子卡的消费者组

// ---- 每个对象的卡 ----
const objList = [...objs.values()].sort((a, b) => kindRank[a.obj.kind] - kindRank[b.obj.kind] || cmp(a.obj.code, b.obj.code));
for (const e of objList) {
  const o = e.obj;
  if (o.kind === 'gate_facility') continue; // 门禁卡单独生成
  const ledger = isLedgerObj(e); e.ledger = ledger;
  const groups = e.groups.length ? e.groups : [{ key: '无文件-1', mg: null, files: [], empty: true }];
  groups.forEach((g, gi) => {
    const gRows = (e.byGroup.get(gi) ?? []).slice().sort((a, b) => cmp(a.rowKey, b.rowKey));
    const { code, data } = splitCode(g.files);
    const isFirst = gi === 0;
    const kind = o.kind === 'module_group' ? 'relocate' : ledger ? 'ledger_child' : isFirst ? 'first' : 'follow';
    const vol = o.kind === 'module_group'
      ? (() => { const m = new Map(); for (const r of e.rows) m.set(r.volume, (m.get(r.volume) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0]?.[0] ?? null; })()
      : o.volume;
    const c = newCard({
      cardKind: kind, objectKind: o.kind, objectCode: o.code, volume: vol,
      groupKey: kind === 'relocate' ? null : g.key, rowKeys: gRows.map(r => r.rowKey),
      files: code, dataFiles: data,
      segs: kind === 'relocate' ? [] : isFirst && !ledger ? FIRST_SEGS.slice() : (ledger ? FOLLOW_SEGS.slice() : FOLLOW_SEGS.slice()),
      _g: g, _ord: gi + 1, _e: e,
    });
    if (kind === 'ledger_child') c.segs = FOLLOW_SEGS.slice();
    if (kind === 'relocate') { c.groupKey = null; c.splitAxis = g.splitAxis; c.segNo = g.segNo; }
    // 入口、上线
    if (kind !== 'relocate') {
      c.entries = entriesOfRows(gRows);
      if (isFirst) c.launches = (launchesOfObj.get(objKey(o)) ?? []).map(k => { const x = entryByKey.get(k); return { vol: x.vol, sec: x.sec, name: x.name }; }).sort((a, b) => cmp(a.vol + a.name, b.vol + b.name));
    }
    // 验收判据
    const ruleRefs = [];
    c.accept = acceptOfRows(gRows, isFirst && o.kind === 'table', o.code, ruleRefs);
    if (!c.accept.length && vol) c.accept = assertionsFor(vol, o.code, [...c.entries.map(en => en.name), ...c.launches.map(en => en.name), ...c.files.map(f => f.slice(f.lastIndexOf('/') + 1))]);
    c._ruleRefs = ruleRefs;
    if (!c.accept.length && ruleRefs.length) c._ruleEmpty = true;
    if (!c.accept.length && ruleRefs.length) { const cv = assertionsCovering(ruleRefs); c.accept = cv.toks; c._coverWhy = cv.why; }
    c.pending.push(...pendingOfRows(gRows));
    c.cardId = `C-${vol ?? '无卷'}-${o.code}-${gi + 1}`;
    cards.push(c);
  });
}

// ---- 账本母卡 ----
const ledgerChildren = cards.filter(c => c.cardKind === 'ledger_child').sort((a, b) => cmp(a.groupKey, b.groupKey));
const ledgerFiles = uniq(ledgerChildren.flatMap(c => c.files)).sort();
const ledgerSys = ledgerSysKey ? sysByKey.get(ledgerSysKey) : null;
if (ledgerSys) {
  const parentCard = newCard({
    cardId: 'LEDGER-1', cardKind: 'ledger_parent', objectKind: 'system', objectCode: ledgerSys.system, volume: ledgerSys.volume,
    entries: (ledgerSys.entries ?? []).map(n => ({ vol: ledgerSys.volume, sec: '§3.1', name: n })),
    launches: [], _fixedPhase: 1,
  });
  // 母卡与子卡沿用卷一编号：子卡 LEDGER-1a … 按组键升序
  ledgerChildren.forEach((c, i) => { c.cardId = `LEDGER-1${String.fromCharCode(97 + i)}`; c._fixedPhase = 1; });
  // 账本系统的"首卡"职责（维度表行补齐、数据补齐）与读入口上线归母卡
  const lead = ledgerChildren[0];
  parentCard.launches = lead ? lead.launches : [];
  if (lead) lead.launches = [];
  // 母卡认领账本系统下没有消费者组归属的行：数据行落在首个子卡
  parentCard.accept = [];
  cards.push(parentCard);
}

// ---- 门禁卡：卡号出自卷一 §6.3 图里的 G-n；对象与所属卷取卷十二 §2.11 `gateCard` 列指向本卡的设施（李白终核卷十一 挡-2 第 1 条）----
// 一张卡建几件设施的，对象取登记次序第一件，其余设施的文件与行一并归本卡；accept 取法同领域卡：所属卷里定义行写到本卡设施代号或其路径、文件名的验收编号（挡-2 第 3 条）
const gateIds = (() => { const f = volFiles.find(x => x.startsWith('卷一-')); const ls = volText.get(f); const s = ls.findIndex(l => /^### 6\.3 /.test(l)); let e = ls.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = ls.length; return uniq(ls.slice(s, e).join('\n').match(/G-\d+/g) ?? []).sort(); })();
const gateRowsByFac = new Map(); // 门禁设施 → 位置组接收对象是它的行（R11-2.5）
for (const r of rows) if (r.recvObj?.kind === 'gate_facility') (gateRowsByFac.get(r.recvObj.code) ?? gateRowsByFac.set(r.recvObj.code, []).get(r.recvObj.code)).push(r);
const gateFacsOf = id => gateFacilities.filter(f => gateFacInfo.get(f)?.gateCard === id);
for (const id of gateIds) {
  const facs = gateFacsOf(id); const fac = facs[0] ?? null;
  const rs = facs.flatMap(f => gateRowsByFac.get(f) ?? []).sort((a, b) => cmp(a.rowKey, b.rowKey));
  const facFiles = facs.flatMap(f => gateFacInfo.get(f).paths).filter(p => /\.(?:mjs|js)$/.test(p) && !/\*/.test(p));
  const vol = fac ? gateOwner.get(fac) : null;
  // 定义行里的反引号路径与设施路径相合（相同、文件名相同，或一方是另一方所在目录）即算写到其路径
  const pathHit = (t, p) => { const d = p.replace(/\*\*?$/, ''); return t === p || t === p.slice(p.lastIndexOf('/') + 1) || (t.endsWith('/') && p.startsWith(t)) || (d.endsWith('/') && t.startsWith(d)); };
  const acc = uniq(facs.flatMap(f => (assertText.get(gateOwner.get(f)) ?? []).filter(a => [...a.text.matchAll(/`([^`]+)`/g)].some(m => m[1] === f || gateFacInfo.get(f).paths.some(p => pathHit(m[1], p)))).map(a => qual(gateOwner.get(f), a.tok)))).sort();
  const c = newCard({
    cardId: id, cardKind: 'gate', objectKind: fac ? 'gate_facility' : null, objectCode: fac, volume: vol,
    rowKeys: rs.map(r => r.rowKey), files: uniq([...rs.flatMap(r => r.files.filter(f => f.endsWith('.mjs') || f.endsWith('.js'))), ...facFiles]).sort(),
    dataFiles: uniq(rs.flatMap(r => r.files.filter(f => f.endsWith('.json')))).sort(), accept: acc, _fixedPhase: 0, _facs: facs,
  });
  if (!fac) c.pending.push(`objectKind:同下（对象未登记）`, `volume:同下（对象未登记，所属卷取不到）`);
  if (!fac) c.pending.push(`objectCode:卷十二 §2.11 没有 gateCard 为 ${id} 的门禁设施（卷一 §6.3 写了 ${id} 建什么，但未登记为门禁设施），待补`);
  if (facs.length > 1) c.pending.push(`objectCode:本卡建 ${facs.length} 件设施（${facs.join('、')}），对象取登记次序第一件`);
  if (!acc.length) c.pending.push('accept:所属卷的验收类定义行里没有写到本卡设施代号或其路径的编号，待各卷分配');
  c.pending.push(...pendingOfRows(rs));
  cards.push(c);
}
// 门禁自身的条目归卡（李白终核卷十一复核第 4 条）：定义行写到某张门禁卡的设施代号或其路径（含"定义行写的目录包含设施路径"）的归那张卡；
// 其余归建该条目所在卷设施最多的门禁卡（同数取卡号小者）；每条都落到一张卡
{ const gcs = cards.filter(c => c.cardKind === 'gate');
  const ph = (t, p) => { const d = p.replace(/\*\*?$/, ''); return t === p || t === p.slice(p.lastIndexOf('/') + 1) || (t.endsWith('/') && p.startsWith(t)) || (d.endsWith('/') && t.startsWith(d)); };
  const hits = (g, a) => (g._facs ?? []).some(f => [...a.text.matchAll(/`([^`]+)`/g)].some(m => m[1] === f || gateFacInfo.get(f).paths.some(p => ph(m[1], p))));
  for (const it of gateItems) {
    const a = (assertText.get(it.vol) ?? []).find(x => x.tok === it.tok); const q = qual(it.vol, it.tok);
    let to = a ? gcs.filter(g => hits(g, a)) : [];
    if (!to.length) { const n = g => (g._facs ?? []).filter(f => gateOwner.get(f) === it.vol).length; to = [gcs.slice().sort((x, y) => n(y) - n(x) || cmp(x.cardId, y.cardId))[0]].filter(Boolean); }
    for (const g of to) { g.accept = uniq([...g.accept, q]).sort(); g.pending = g.pending.filter(p => !p.startsWith('accept:所属卷的验收类')); }
    gateItemTo.push(`${q}→${to.map(g => g.cardId).join('、')}`);
  } }
// R11-7.1 第 1 步（封卷后勘误 1116k7，挡-1 第 2 条）：入口实现文件落在某门禁设施 paths 内的，由该门禁卡上线，所在卷系统首卡只接不上线；
// 设施实现哪些入口取卷十二 §2.11 `entries` 列（"卷X §n" 为该卷该节入口表登记的全部入口，或逐个入口名）
const gateLaunchMoved = [];
for (const g of cards.filter(c => c.cardKind === 'gate')) for (const f of g._facs ?? []) {
  const spec = gateFacInfo.get(f).entries; if (!spec || spec === '—') continue;
  const vs = spec.match(new RegExp(`^(${V_RE})\\s*§\\s*([0-9]+(?:\\.[0-9]+)*)(?:（[^）]*）)?$`));
  const list = vs ? (entryIdx.get(vs[1]) ?? []).filter(x => x.sec === '§' + vs[2]).map(x => ({ vol: vs[1], sec: x.sec, name: x.name }))
    : [...spec.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)`/g)].map(m => { const v = ownerVolOf(m[1], gateOwner.get(f)); return { vol: v, sec: (entryIdx.get(v) ?? []).find(x => x.name === m[1])?.sec ?? '§3', name: m[1] }; });
  for (const en of list) {
    for (const c of cards) if (c !== g) { const i = c.launches.findIndex(l => l.name === en.name && l.vol === en.vol); if (i >= 0) { c.launches.splice(i, 1); if (!c.entries.some(x => x.name === en.name && x.vol === en.vol)) c.entries.push({ vol: en.vol, sec: en.sec, name: en.name }); gateLaunchMoved.push(`${en.vol}:${en.name} ${c.cardId}→${g.cardId}`); } }
    if (!g.launches.some(l => l.name === en.name && l.vol === en.vol)) g.launches.push(en);
  }
}

// 同一拒收检查覆盖全部卡的 entries 与 launches（李白 11-16 01:30 第 3 条、chk-1116-y17 T5）：不在该卷 §3 入口表里的名字不收
const rejected = { entries: [], launches: [] };
// 只登记在卷二 §2.1 入口清单的（各表视图），归登记处卷二（李白 11-16 02:45 ③）
// 改挂到卷二时：上线只许挂在 §2.1 该行那类实体（表）的对象上（03:00 第 2 条，chk-1116-y21 T2），要接的入口照挂
const tableOfView = n => [...viewEntries].filter(([, e]) => e.name === n).map(([t]) => t)[0];
for (const c of cards) for (const f of ['entries', 'launches']) { const keep = []; for (const x of c[f]) { if (in3(x.vol, x.name)) keep.push(x); else if (in3(REGVOL, x.name) && (f === 'entries' || (c.objectKind === 'table' && c.objectCode === tableOfView(x.name)))) keep.push({ ...x, vol: REGVOL, sec: '§2.1' }); else rejected[f].push(`${c.cardId}:${x.vol}:${x.name}`); } c[f] = uniq(keep.map(x => JSON.stringify(entryInfo(x)))).map(s => JSON.parse(s)); }
// 未上线入口的归属对象（李白 11-16 03:5x ③）：以登记它的那一卷 §3 该行写明的对象为准（行里括注的表代号或系统键；重复登记取主办卷 §3，卷二 §2.1 兜底取该行的表），
// 由该对象的首卡（账本系统为母卡）上线；§3 没写明对象、或写的不止一个的，标"入口对象未定"列待查，不推定，也不套 02:30 的对象核对
const objUndetermined = [], objAssigned = [];
{ const launchedNames = new Set(cards.flatMap(c => c.launches.map(l => l.name)));
  const leadCardOf = ok => cards.find(c => (c.cardKind === 'first' || c.cardKind === 'ledger_parent') && `${c.objectKind}:${c.objectCode}` === ok);
  const objOfCode = code => tables.has(code) ? objKey(tableObj(code)) : sysByKey.has(code) ? objKey(sysObj(sysByKey.get(code))) : sysByKey.has('sys.' + code) ? objKey(sysObj(sysByKey.get('sys.' + code))) : null;
  for (const n of [...entryNames].sort()) {
    if (launchedNames.has(n)) continue;
    const vol = ownerVolOf(n, null); const rec = (entryIdx.get(vol) ?? []).find(x => x.name === n); if (!rec) continue;
    let objs = [];
    if (rec.reg21) { const t = tableOfView(n); if (t) objs = [objKey(tableObj(t))]; }
    else if (rec.sysDecl) { const o = objOfCode(rec.sysDecl); if (o) objs = [o]; }
    // 只有 §3 该入口行明说"归属/调用方/对象是某表代号或 sys 键"才算写明对象；"模块文件（模块代号）"括注、被写状态所在的行（"person 行"）都不算（04:1x ②③）
    else objs = uniq([...(rec.rowCells ?? []).join(' ').matchAll(/(?:归属|调用方|对象)\s*(?:是|为|：|:)?\s*`?([a-z][a-z0-9_.]*)`?/g)].map(m => objOfCode(m[1])).filter(Boolean));
    const lead = objs.length === 1 ? leadCardOf(objs[0]) : null;
    if (!lead) { objUndetermined.push({ vol, name: n, why: objs.length > 1 ? `写了 ${objs.length} 个对象` : objs.length ? `对象 ${objs[0]} 没有首卡` : '§3 没写明对象' }); continue; }
    lead.launches.push(entryInfo({ vol, sec: rec.sec, name: n })); objAssigned.push(`${vol}:${n}→${lead.cardId}`);
  } }
// ================= 对象 → 表主、必填引用等的依赖 =================
const firstOfObj = new Map(); // objKey → 首卡
for (const c of cards) if (c.cardKind === 'first' || c.cardKind === 'relocate' && c._ord === 1) firstOfObj.set(`${c.objectKind}:${c.objectCode}`, c);
for (const c of cards) if (c.cardKind === 'ledger_parent') firstOfObj.set(`${c.objectKind}:${c.objectCode}`, c);
const cardByLaunch = new Map(); // entryKey → 卡
for (const c of cards) for (const l of c.launches) cardByLaunch.set(entryKey(l.vol, l.name), c);
const relocateCards = cards.filter(c => c.cardKind === 'relocate');
const fileToReloc = new Map();
// 一个文件可在多张搬迁卡里（如 §6.11 同一组文件分搬两个模块组），依赖全部记上（chk-1116-y15 T3，整类）
for (const c of relocateCards) for (const f of c.files) (fileToReloc.get(f) ?? fileToReloc.set(f, []).get(f)).push(c);
const parentCard = cards.find(c => c.cardKind === 'ledger_parent');
const ledgerFileSet = new Set(ledgerFiles);

// 依赖与阶段：entriesOf(c) 给出卡要接的入口；主算用卡记录里的 entries（只含本对象的入口），灵敏度算再加上"文件里调用了别的对象读入口的旧调用方"
function derive(entriesOf) {
  const deps = new Map(); const refDeps = new Map(cards.map(c => [c.cardId, new Set()]));
  for (const c of cards) {
    const dep = new Set();
    // 来源 1：必填引用
    if (c.cardKind === 'first' && c.objectKind === 'table') for (const t of tableRefs.get(c.objectCode) ?? []) { const d = firstOfObj.get('table:' + t) ?? firstOfObj.get(objKey(tableObj(t))); if (d && d !== c) { dep.add(d.cardId); refDeps.get(c.cardId).add(d.cardId); } }
    // 来源 2：要接的入口由另一张卡上线
    for (const en of entriesOf(c)) { const d = cardByLaunch.get(entryKey(en.vol, en.name)); if (d && d !== c) dep.add(d.cardId); }
    // 来源 3：同对象的后续卡依赖首卡
    if (c.cardKind === 'follow') { const d = firstOfObj.get(`${c.objectKind}:${c.objectCode}`); if (d) dep.add(d.cardId); }
    // 来源 4：文件清单含某搬迁卡要搬的文件
    if (c.cardKind !== 'relocate' && c.cardKind !== 'sweep') for (const f of [...c.files, ...c.dataFiles]) for (const d of fileToReloc.get(f) ?? []) if (d !== c) dep.add(d.cardId);
    // 搬迁卡之间文件相交的，按 R11-4.3 串行、先后按 R11-7.2（没有依赖时按卡号升序）：卡号在后的依赖卡号在前的（李白 11-16 01:25 第 3 条）
    if (c.cardKind === 'relocate') for (const f of c.files) for (const d of fileToReloc.get(f) ?? []) if (d !== c && cmp(d.cardId, c.cardId) < 0) dep.add(d.cardId);
    // 来源 5：触及账本路径的卡依赖母卡（搬迁卡只搬文件、不改账本路径，不算）
    if (parentCard && c !== parentCard && c.cardKind !== 'gate' && c.cardKind !== 'sweep' && c.cardKind !== 'relocate' && c.files.some(f => ledgerFileSet.has(f))) dep.add(parentCard.cardId);
    deps.set(c.cardId, [...dep].sort(cmp));
  }
  // 母卡依赖其子卡文件所在的搬迁卡（R11-7.1 说明：内核组搬迁卡因母卡依赖它落在阶段 1）
  if (parentCard) { const s2 = new Set(deps.get(parentCard.cardId)); for (const f of ledgerFiles) for (const d of fileToReloc.get(f) ?? []) s2.add(d.cardId); deps.set(parentCard.cardId, [...s2].sort(cmp)); }
  const phase = new Map(); let cycle = null;
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { if (!cycle) cycle = [...stack.slice(stack.indexOf(id)), id]; return; }
    state.set(id, 1);
    const c = byId.get(id);
    if (c._fixedPhase !== undefined) { for (const d of deps.get(id)) visit(d, [...stack, id]); phase.set(id, c._fixedPhase); state.set(id, 2); return; }
    let L = 1;
    for (const d of deps.get(id)) {
      visit(d, [...stack, id]);
      const dc = byId.get(d), dp = phase.get(d) ?? 1;
      const uses = refDeps.get(id).has(d) || entriesOf(c).some(en => dc.launches.some(l => l.vol === en.vol && l.name === en.name));
      L = Math.max(L, uses && c.launches.length ? dp + 1 : dp);
    }
    phase.set(id, L); state.set(id, 2);
  };
  for (const c of cards.slice().sort((x, y) => cmp(x.cardId, y.cardId))) visit(c.cardId, []);
  const conflicts = [];
  for (const c of cards) if (c._fixedPhase !== undefined) for (const d of deps.get(c.cardId)) { const dp = phase.get(d); if (dp > c._fixedPhase) conflicts.push(`${c.cardId}(阶段${c._fixedPhase}) 依赖 ${d}(阶段${dp})`); }
  return { deps, phase, cycle, conflicts, n: Math.max(0, ...[...phase.values()]) };
}
const byId = new Map(cards.map(c => [c.cardId, c]));
const main = derive(c => c.entries);
const crossOf = c => { // 灵敏度：加上文件里有旧调用方的别对象读入口（只按名字对，噪声大；账本子卡不加）
  if (c.cardKind === 'ledger_child' || c.cardKind === 'gate' || c.cardKind === 'sweep' || c.cardKind === 'relocate') return c.entries;
  const fset = new Set([...c.files, ...c.dataFiles]); const out = new Map(c.entries.map(en => [entryKey(en.vol, en.name), en]));
  for (const [k, ent] of entryByKey) if (launchedBy.has(k) && (ent.callers ?? []).some(f => fset.has(f))) out.set(k, { vol: ent.vol, sec: ent.sec, name: ent.name });
  return [...out.values()];
};
const alt = derive(crossOf);
const phase = main.phase, phaseCycle = main.cycle, phaseConflicts = main.conflicts;
for (const c of cards) { c.dependsOn = main.deps.get(c.cardId); c.phaseNo = phase.get(c.cardId) ?? null; }
const n = main.n;
// 两表成环的整类判（李白 11-16 02:00 Q2，R11-7.2"成环即拒收，退回有关各卷改迁移节"）：两张表首卡互相依赖，一向是来源 1（必填维度引用对方表）、
// 另一向是来源 2（要接对方上线的入口）时，来源 2 那几行应改归来源 1 的引用方，退回该行来源卷勘误；别的搭配停下报李白
const cyc2 = [];
{ const firsts = cards.filter(c => c.cardKind === 'first' && c.objectKind === 'table');
  const s1 = (a, b) => (tableRefs.get(a.objectCode) ?? new Set()).has(b.objectCode);
  const s2rows = (a, b) => a.rowKeys.filter(k => { const r = rows.find(x => x.rowKey === k); const en = r ? entryOfRow(r) : null; return en && b.launches.some(l => l.vol === en.vol && l.name === en.name); });
  for (const a of firsts) for (const b of firsts) if (cmp(a.cardId, b.cardId) < 0 && main.deps.get(a.cardId).includes(b.cardId) && main.deps.get(b.cardId).includes(a.cardId)) {
    const ab = { s1: s1(a, b), s2: s2rows(a, b) }, ba = { s1: s1(b, a), s2: s2rows(b, a) };
    if (ab.s1 && !ba.s1 && ba.s2.length) cyc2.push({ pair: `${a.cardId}⇄${b.cardId}`, rows: ba.s2, to: `table:${a.objectCode}`, ok: true });
    else if (ba.s1 && !ab.s1 && ab.s2.length) cyc2.push({ pair: `${a.cardId}⇄${b.cardId}`, rows: ab.s2, to: `table:${b.objectCode}`, ok: true });
    else cyc2.push({ pair: `${a.cardId}⇄${b.cardId}`, rows: [], ok: false });
  } }
// R11-7.2 次序：按阶段，阶段内按依赖拓扑排序，没有依赖关系的按卡号升序；各对象首卡（门禁对象取其门禁卡）在其中的序号
const order72 = []; for (const ph of uniq(cards.map(c => c.phaseNo)).sort((a, b) => a - b)) {
  const cs = cards.filter(c => c.phaseNo === ph), ids = new Set(cs.map(c => c.cardId)); const done = new Set();
  while (done.size < cs.length) { const ready = cs.filter(c => !done.has(c.cardId) && c.dependsOn.every(d => !ids.has(d) || done.has(d))).sort((a, b) => cmp(a.cardId, b.cardId)); if (!ready.length) { for (const c of cs.filter(c => !done.has(c.cardId)).sort((a, b) => cmp(a.cardId, b.cardId))) { done.add(c.cardId); order72.push(c); } break; } done.add(ready[0].cardId); order72.push(ready[0]); }
}
const rankOut = {}; for (const [k, c] of firstOfObj) rankOut[k] = order72.indexOf(c); for (const c of cards) if (c.cardKind === 'gate') rankOut[`gate_facility:${c.objectCode}`] = order72.indexOf(c);
const rankSorted = Object.fromEntries(Object.entries(rankOut).sort((a, b) => cmp(a[0], b[0])));
// 全部环（强连通分量，chk-1116-y18 R3、李白 11-16 02:18 第 1 条）：不靠 DFS 隐式断环；每条环内的边写明来源与原文位置——
// 来源 1：卷二表节里引用方表的必填字段（卷二行号）；来源 2：本卡哪一行（来源卷、卷文行号）的卷节对上了对方上线的哪个入口；其余来源写种类。只报，不改归属。
function cyclesOf(deps) {
  const idx = new Map(), low = new Map(), on = new Set(), st = []; let t = 0; const out = [];
  const ids = cards.map(c => c.cardId).sort(cmp);
  const sc = v => { idx.set(v, t); low.set(v, t); t++; st.push(v); on.add(v);
    for (const w of deps.get(v) ?? []) { if (!idx.has(w)) { sc(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w))); }
    if (low.get(v) === idx.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); if (comp.length > 1) out.push(comp.sort(cmp)); } };
  for (const v of ids) if (!idx.has(v)) sc(v);
  return out.map(comp => { const set = new Set(comp); const edges = [];
    for (const a of comp) for (const b of deps.get(a) ?? []) if (set.has(b)) { const A = byId.get(a), B = byId.get(b); const why = [];
      if (A.cardKind === 'first' && A.objectKind === 'table' && B.objectKind === 'table') for (const w of tableRefWhere.get(`${A.objectCode}→${B.objectCode}`) ?? []) why.push(`来源1 ${A.objectCode}.${w.field}（卷二:${w.line}）`);
      for (const k of A.rowKeys) { const r = rows.find(x => x.rowKey === k); const en = r ? entryOfRow(r) : null; if (en && B.launches.some(l => l.vol === en.vol && l.name === en.name)) why.push(`来源2 ${k}（${r.volume}:${r.srcLine}）→${en.vol} ${en.name}`); }
      if (!why.length) why.push(A.cardKind === 'follow' ? '来源3 后续卡依赖首卡' : '来源4/5 文件或账本路径');
      edges.push({ from: a, to: b, why }); }
    return { cards: comp, edges }; });
}
const cyclesMain = cyclesOf(main.deps);
if (CHILD) { console.log(JSON.stringify({ order: rankSorted, cycles: cyclesMain })); process.exit(0); }
// 清扫卡：阶段 1 至 n 各一张
for (let k = 1; k <= n; k++) cards.push(newCard({ cardId: `SWEEP-${k}`, cardKind: 'sweep', phaseNo: k, accept: s11.slice() }));
// 全仓库机械替换类（卷十一 R11-7.8 例外、必填矩阵清扫卡 files 栏；李白 11-15 19:08 第 1 条、19:12）：文件清单由本脚本按"现有文件"栏的标识符列出
// （两个进程的运行时代码文件里出现该标识符的），进该行落点对象模块组搬迁卡所在阶段的清扫卡（没有搬迁卡的进阶段 1）；只读文件文字，不执行
const mechInfo = [];
for (const [k, m] of [...mechRows].sort((a, b) => cmp(a[0], b[0]))) {
  const re = new RegExp('(?<![A-Za-z0-9_$])' + m.ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_$])');
  const fs = all.filter(f => isRuntime(f) && /\.(?:mjs|js)$/.test(f) && re.test(rd(`${REPO}/${f}`))).sort();
  const ph = Math.max(1, ...cards.filter(c => c.cardKind === 'relocate' && c.objectCode === m.obj).map(c => c.phaseNo ?? 1));
  // accept 写该替换所消除的扫描代号（行落点里写的验收类编号）；找不到的不合"可脚本复核"，不算机械替换类，退回来源卷（李白 11-16 02:00 Q3）
  const row = rows.find(r => r.rowKey === k);
  // 照落点写全子款：编号后紧跟"(x)"/"（x）"的连同子款一起取（chk-1116-y18 B2，卷二登记写的是 S13 (c)）
  const scan = (row ? acceptOfRows([row], false, null) : []).map(t => { const b = splitQ(t)[1]; const m = String(row.target).match(new RegExp('(?<![A-Za-z0-9])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[（(]([a-z])[)）]')); return m ? `${t} (${m[1]})` : t; });
  if (!scan.length) { mechInfo.push({ rowKey: k, ident: m.ident, files: fs.length, sweep: null, returned: true }); continue; }
  const sw = cards.find(c => c.cardId === `SWEEP-${Math.min(ph, Math.max(1, n))}`);
  if (sw) { sw.files = uniq([...sw.files, ...fs]).sort(); sw._mech = true; (sw._mechRows ??= []).push(k); sw._scan = uniq([...(sw._scan ?? []), ...scan]).sort(); }
  mechInfo.push({ rowKey: k, ident: m.ident, files: fs.length, sweep: sw?.cardId ?? null, scan });
}
// 不豁免文件上限（卷一 §6.6；李白 11-16 01:25 第 2 条）：机械替换类清扫卡按 R11-7.5 次序 ①消费者组 ③路径升序拆成同阶段的段卡；
// 替换的迁移行由 segNo 最小的段卡认领，四件核对（accept 的全部扫描）只由 segNo 最大的段卡做
for (const sw of cards.filter(c => c.cardKind === 'sweep' && c._mech)) {
  const isM = f => f.endsWith('.mjs'); const segs = [];
  const byG = new Map(); for (const f of sw.files) { const g = groupOf(f); (byG.get(g) ?? byG.set(g, []).get(g)).push(f); }
  const whole = sw.files.filter(isM).length <= MAXFILES;
  if (whole) segs.push({ axis: 'whole', files: sw.files });
  else for (const g of [...byG.keys()].sort()) {
    const fs = byG.get(g); const m = fs.filter(isM), r = fs.filter(f => !isM(f));
    if (m.length <= MAXFILES) { segs.push({ axis: 'consumer_group', files: fs }); continue; }
    for (let s = 0; s < Math.ceil(m.length / MAXFILES); s++) segs.push({ axis: 'path_order', files: [...m.slice(s * MAXFILES, (s + 1) * MAXFILES), ...(s === 0 ? r : [])] });
  }
  const idx = cards.indexOf(sw); const out = segs.map((x, i) => newCard({ cardId: `${sw.cardId}-${i + 1}`, cardKind: 'sweep', phaseNo: sw.phaseNo, splitAxis: x.axis, segNo: i + 1, files: x.files.slice().sort(), rowKeys: i === 0 ? sw._mechRows.slice().sort() : [], accept: uniq([...sw._scan, ...(i === segs.length - 1 ? sw.accept : [])]).sort(), _mech: true })); // 每段：所消除的扫描（范围即本段 files）；末段另加四件核对
  cards.splice(idx, 1, ...out);
  for (const x of mechInfo) if (x.sweep === sw.cardId) x.sweep = `${out[0].cardId} 至 ${out[out.length - 1].cardId}（${out.length} 张段卡）`;
}

// ================= 推进钩子（R11-3.14）：`X.after = [..]` 机读写法 =================
const hookAfter = new Map(); const hookSrc = new Map(); const hookConflict = [];
// 只收登记处的定义写法、不收引用处（李白 11-16 04:30 第 3 条，取代原先按卷名跳过一卷的写法）：钩子在某些卷的表格里以首格登记过的，只收那些卷里的 `X.after`；哪卷都没登记的照收
const hookRegVols = new Map(); for (const [f, ls] of volText) { const v = volOfFile(f); for (const l of ls) { const m = l.match(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/); if (m) (hookRegVols.get(m[1]) ?? hookRegVols.set(m[1], new Set()).get(m[1])).add(v); } }
for (const [f, ls] of volText) {
  const v = volOfFile(f); if (!v) continue;
  for (const l of ls) for (const m of l.matchAll(/`([A-Za-z][A-Za-z0-9]*)\.after\s*=\s*\[([^\]]*)\]`/g)) {
    const lst = m[2].split(',').map(x => x.trim()).filter(Boolean).sort();
    const key = m[1]; if (hookRegVols.has(key) && !hookRegVols.get(key).has(v)) continue;
    if (hookAfter.has(key) && JSON.stringify(hookAfter.get(key)) !== JSON.stringify(lst)) hookConflict.push(key);
    hookAfter.set(key, lst); if (!hookSrc.has(key)) hookSrc.set(key, v);
  }
}
// 钩子存在：某卷的表格里以它为首格登记过
const hookRegistered = new Map();
for (const [f, ls] of volText) { const v = volOfFile(f); for (const l of ls) { const m = l.match(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/); if (m && !hookRegistered.has(m[1])) hookRegistered.set(m[1], v); } }
const hookNodes = uniq([...hookAfter.keys(), ...[...hookAfter.values()].flat()]).sort();
const hookMissing = hookNodes.filter(h => !hookRegistered.has(h));
const indeg = new Map(hookNodes.map(h => [h, 0])); const outs = new Map(hookNodes.map(h => [h, []]));
for (const [h, as] of hookAfter) for (const a of as) { if (!indeg.has(a)) continue; indeg.set(h, indeg.get(h) + 1); outs.get(a).push(h); }
const sortKeyOf = new Map(); let hookOrder = []; { let ready = hookNodes.filter(h => indeg.get(h) === 0).sort(); let k = 1;
  while (ready.length) { const h = ready.shift(); sortKeyOf.set(h, k++); hookOrder.push(h); for (const x of outs.get(h)) { indeg.set(x, indeg.get(x) - 1); if (indeg.get(x) === 0) { ready.push(x); ready.sort(); } } } }
const hookCycle = hookNodes.filter(h => !sortKeyOf.has(h));
// 排序键落在登记该钩子的卷的领头卡上（该卷系统的首卡；账本系统的卷落在母卡）
for (const h of hookNodes) {
  const v = hookRegistered.get(h) ?? hookSrc.get(h); const s = v ? sysOfVol.get(v) : null; if (!s || !sortKeyOf.has(h)) continue;
  const lead = firstOfObj.get(leadObjOfSys.get(s.system));
  if (lead) lead.sortKeys[h] = sortKeyOf.get(h);
}

// ================= 必填矩阵（卷十一 §2.2）=================
const MATRIX = {
  gate: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '—', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '—', entries: '—', retire: '—', accept: '必' },
  ledger_parent: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '—', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '列', segs: '—', entries: '必', retire: '列', accept: '必' },
  ledger_child: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '必', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '必', entries: '必', retire: '必', accept: '必' },
  relocate: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '—', splitAxis: '必', segNo: '必', zeroRows: '列', rowKeys: '列', files: '必', segs: '—', entries: '—', retire: '列', accept: '必' },
  first: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '必', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '必', entries: '列', retire: '必', accept: '必' },
  follow: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '必', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '必', entries: '必', retire: '必', accept: '必' },
  sweep: { volume: '—', objectKind: '—', objectCode: '—', groupKey: '—', splitAxis: '—', segNo: '—', zeroRows: '—', rowKeys: '—', files: '—', segs: '—', entries: '—', retire: '—', accept: '必' },
};
const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' ? Object.keys(v).length === 0 : false);
const matrixCheck = c => {
  const m = MATRIX[c.cardKind], miss = [], extra = [];
  for (const [f, rule0] of Object.entries(m)) {
    // 清扫卡机械替换类（R11-7.8 例外，李白 11-15 19:12、11-16 01:25 第 2 条）：files、splitAxis、segNo 必，rowKeys 列；其余仍为—
    const rule = c.cardKind === 'sweep' && c._mech ? ({ files: '必', splitAxis: '必', segNo: '必', rowKeys: '列' }[f] ?? rule0) : rule0;
    const v = c[f];
    if (rule === '必' && isEmpty(v)) miss.push(f);
    if (rule === '—' && !isEmpty(v)) extra.push(f);
  }
  return { miss, extra };
};
// 推不出的必填项：按数据原因登记（K7）
for (const c of cards) {
  const e = c._e;
  const { miss } = matrixCheck(c);
  for (const f of miss) {
    if (f === 'retire') c.pending.push('retire:登记退役数要逐行清单的行数，逐行清单待 G-3');
    else if (f === 'files') c.pending.push(e && !e.cons?.all.length ? 'files:该对象在旧代码里没有消费者文件（新对象或纯数据对象）' : 'files:门禁卡的封闭文件清单待开工时登记');
    else if (f === 'accept') c.pending.push('accept:卡的行落点没有写验收编号，断言归属待各卷分配');
    else if (f === 'entries') c.pending.push('entries:本卡各行的卷节在该卷 §3 入口表里没有对上唯一的入口（一节多入口、找不到或落点没有节号，见摘要待查）');
    else if (f === 'groupKey') c.pending.push('groupKey:该对象没有消费者文件，首卡无消费者组');
    else if (f === 'volume') c.pending.push('volume:对象没有登记的归属卷');
    else c.pending.push(`${f}:推不出`);
  }
  // 系统登记项的待补字段（systems 补全表）
  const s = c.objectKind === 'system' ? sysByKey.get(c.objectCode) : c.objectKind === 'table' ? sysOfTable.get(c.objectCode) : null;
  const remain = s ? sixPending.get(s.system) ?? s.pending ?? [] : [];
  if (s && (c.cardKind === 'first' || c.cardKind === 'ledger_parent') && remain.length) c.pending.push(`system:${s.system} 登记项待补 ${remain.join('、')}`);
  if (c.cardKind === 'first' && c.objectKind === 'table' && dimKeysOf(c.objectCode).length === 0) c.pending.push('accept:卷二 §6.12 没有该表的齐全率下限键');
  c.pending = uniq(c.pending).sort();
}
// 验收判据形式（K4）：编号都得有定义
let acceptBad = [];
for (const c of cards) {
  const ok = [], bad = [];
  for (const t of c.accept) (acceptOk(t, c.volume) ? ok : bad).push(t);
  if (bad.length) { acceptBad.push({ cardId: c.cardId, bad }); c.accept = ok; c.pending.push(`accept:未找到定义的编号 ${bad.join('、')} 已摘出`); }
  if (c.cardKind !== 'sweep' && c.cardKind !== 'gate' && !c.accept.length && !c.pending.some(p => p.startsWith('accept:卡的行落点'))) c.pending.push('accept:卡的行落点没有写验收编号，断言归属待各卷分配');
  if (c.accept.length) c.pending = c.pending.filter(p => !p.startsWith('accept:卡的行落点'));
  c.pending = uniq(c.pending).sort();
}
// 母卡验收：卷一 §6.5 的退出条件 ⑤ 写 I1、I2、I15 在 CORE
if (parentCard) { const f = volFiles.find(x => x.startsWith('卷一-')); const l = volText.get(f).find(x => x.includes('**母卡** `LEDGER-1`')) ?? ''; const sec = l.slice(l.indexOf('⑤')); const toks = uniq([...sec.matchAll(/(?<![A-Za-z0-9])(I[0-9]+)(?![0-9A-Za-z])/g)].map(m => m[1])); parentCard.accept = toks.map(t => '卷一:' + t).filter(t => acceptOk(t, '卷一')).sort(); if (!parentCard.accept.length) parentCard.pending.push('accept:卷一 §6.5 退出条件 ⑤ 的不变量编号在卷一里查不到定义'); }
// 疑点名单（accept 仍为空的卡）：原因只写有原文出处的——卷里有验收节、但定义位上没有一个验收类编号的，引该节标题行（文件:行）；
// 卷里有验收类编号、只是没有一条提到本卡的，写不出原文证据，标"待查"并记脚本查过的范围
// 验收断言节：标题含"验收断言"的节（各卷 §4.x.6"验收断言"、卷二"七 本卷的验收断言"一类）；节里定义位上一个编号都没有的，即"断言不带编号"
const verdictOf = new Map(); // 卷 → {heads: [文件:行], numbered: 节内定义位编号数}
for (const [f, ls] of volText) {
  const v = volOfFile(f); if (!v) continue; const r = { heads: [], numbered: 0 };
  ls.forEach((l, i) => { if (/^#{2,6} /.test(l) && /验收断言/.test(l)) r.heads.push(`${f}:${i + 1}`); });
  r.numbered = (defsOf.get(v) ?? []).filter(d => d.nature === '验收类' && /验收断言/.test(d.head.split(' / ').pop() ?? '')).length;
  verdictOf.set(v, r);
}
const suspects = cards.filter(c => !c.accept.length).map(c => {
  const n = (assertText.get(c.volume) ?? []).length; const vd = verdictOf.get(c.volume);
  let reason;
  if (c._ruleRefs?.length) reason = '待查（原规则号 ' + c._ruleRefs.map(r => `${r.tok}（${r.defs[0].file}:${r.defs[0].line}，${r.defs[0].head.split(' / ').slice(0, -1).join(' / ') || r.defs[0].head}）`).join('、') + ' 已按卷十一 R11-3.8 摘出；该规则所在小节的验收断言小节里没有断言点名它，不新造编号）';
  else if (!c.volume) reason = '待查（卡没有归属卷）';
  else if (vd?.heads.length && !vd.numbered) reason = `卷内验收断言不带编号：${vd.heads[0]}${vd.heads.length > 1 ? ` 等 ${vd.heads.length} 个验收节` : ''}，定义位上没有编号` + (n ? `；卷里另有 ${n} 条扫描或不变量编号，没有一条提到本卡（待查）` : '');
  else if (n) reason = `待查（${c.volume} 的 ${n} 条验收类编号定义行里，没有一条提到本卡的对象代号、入口、上线入口或文件名）`;
  else reason = `待查（${c.volume} 没有标题含"验收断言"的节，也没有验收类编号）`;
  return { cardId: c.cardId, volume: c.volume, reason };
});

// ================= 行 → 卡的认领核对（R11-2.6 的纸面版）=================
const claim = new Map();
for (const c of cards) for (const k of c.rowKeys) (claim.get(k) ?? claim.set(k, []).get(k)).push(c.cardId);
const orphanRows = rows.filter(r => !claim.has(r.rowKey)).map(r => r.rowKey);
const multiRows = [...claim].filter(([, v]) => v.length > 1).map(([k]) => k);

// ================= migReady（卷十一 :303、R11-3.12 的判据，只读计算）=================
for (const c of cards) {
  const items = [];
  const { miss, extra } = matrixCheck(c);
  const pendMiss = miss.filter(f => c.pending.some(p => p.startsWith(f + ':')));
  const realMiss = miss.filter(f => !pendMiss.includes(f));
  if (miss.length || extra.length) items.push('E-MIG-CARD-INCOMPLETE(' + [...miss, ...extra.map(x => x + '应为空')].join('、') + (realMiss.length ? '，无待补原因：' + realMiss.join('、') : '') + ')');
  if (c.pending.some(p => p.startsWith('row:'))) items.push('待补:迁移行处置');
  if (c.pending.some(p => p.startsWith('accept:未找到'))) items.push('E-MIG-ACCEPT-FORM');
  if (c.pending.some(p => p.startsWith('objectCode:') || p.startsWith('system:'))) items.push('待补:登记项字段');
  const nmjs = c.files.filter(f => f.endsWith('.mjs')).length;
  if (nmjs > MAXFILES) items.push('E-MIG-CARD-SIZE'); // 文件数超上限（卷十一 §2.7；E-MIG-CARD-SCOPE 是合入期越出文件清单，chk-1116-y28 记账 5）
  c._ready = { defects: items.sort(), stateItems: ['依赖卡已 merged', '所在阶段已开', '不在冻结中'] };
}

// ================= 输出 =================
const clean = c => { const o = {}; for (const k of Object.keys(c)) if (!k.startsWith('_')) o[k] = c[k]; o.migReady = c._ready; return o; };
const kindOrder = ['gate', 'ledger_parent', 'ledger_child', 'relocate', 'first', 'follow', 'sweep'];
cards.sort((a, b) => a.phaseNo - b.phaseNo || kindOrder.indexOf(a.cardKind) - kindOrder.indexOf(b.cardKind) || cmp(a.cardId, b.cardId));
const stat = (arr, f) => { const m = new Map(); for (const x of arr) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return Object.fromEntries([...m].sort((a, b) => cmp(String(a[0]), String(b[0])))); };
const nonSweep = cards.filter(c => c.cardKind !== 'sweep');
const byKind = stat(cards, c => c.cardKind), byPhase = stat(cards, c => c.phaseNo);
const matrixBad = cards.filter(c => matrixCheck(c).extra.length || matrixCheck(c).miss.length).map(c => c.cardId);
const matrixBadNoReason = cards.filter(c => matrixCheck(c).extra.length || matrixCheck(c).miss.some(f => !c.pending.some(p => p.startsWith(f + ':')))).map(c => c.cardId);
const pendMissCards = cards.filter(c => matrixCheck(c).miss.some(f => c.pending.some(p => p.startsWith(f + ':'))));
const nPend = cards.filter(c => c.pending.length).length;
const pendKinds = {}; for (const c of cards) for (const p of c.pending) { const k = p.split(':')[0]; pendKinds[k] = (pendKinds[k] ?? 0) + 1; }
const nImpl = cards.filter(c => ['first', 'follow', 'relocate', 'ledger_child', 'ledger_parent'].includes(c.cardKind)).length;
const nDomain = cards.filter(c => ['first', 'follow'].includes(c.cardKind)).length;
// launches 恰一次
const launchCount = new Map(); for (const c of cards) for (const l of c.launches) { const k = entryKey(l.vol, l.name); launchCount.set(k, (launchCount.get(k) ?? 0) + 1); }
// 重复上线按入口名查（不含卷），同一个函数挂在两个卷下也查得出（03:00 第 5 条，chk-1116-y21）
const launchByName = new Map(); for (const c of cards) for (const l of c.launches) (launchByName.get(l.name) ?? launchByName.set(l.name, []).get(l.name)).push(`${c.cardId}(${l.vol})`);
const launchDup = [...launchByName].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}：${v.join('、')}`);
const notLaunched = uniq([...entryIdx].flatMap(([v, xs]) => xs.map(x => entryKey(v, x.name)))).sort().filter(k => !launchCount.has(k)); // 与 entries 同一口径：各卷 §3 入口表登记的入口
// dependsOn 无环由阶段算法已查；再核对 dependsOn 里的卡存在
const depMissing = cards.flatMap(c => c.dependsOn.filter(d => !byId.has(d)).map(d => `${c.cardId}→${d}`));
const ledgerChildLimit = ledgerChildren.length > 8;

const result = {
  _说明: '乙-5：卡账 v0（设计侧派生物，不是 tools/migrate 的卡账）；脚本 脚本/卷十一/gen-card-ledger.mjs 生成，勿手改。pending 列出推不出、不替它定值的字段；migReady.defects 是不含状态项的缺陷，stateItems 是 drafted 阶段本来就不满足的三项。',
  baseline: BASELINE, maxFiles: MAXFILES, n,
  counts: { cards: cards.length, byKind, byPhase, nonSweep: nonSweep.length },
  cards: cards.map(clean),
  hooks: { order: hookOrder, sortKeys: Object.fromEntries(hookOrder.map(h => [h, sortKeyOf.get(h)])), after: Object.fromEntries([...hookAfter].sort((a, b) => cmp(a[0], b[0]))), missing: hookMissing, cycle: hookCycle, conflict: uniq(hookConflict) },
};
writeFileSync(`${OUT}/卡账-v0.json`, JSON.stringify(result, null, 1) + '\n');

// ---- 摘要 ----
const kindName = { gate: '门禁卡', ledger_parent: '账本母卡', ledger_child: '账本子卡', relocate: '搬迁卡', first: '首卡', follow: '后续卡', sweep: '清扫卡' };
const objCount = new Map(); for (const c of cards) if (c.objectKind) objCount.set(c.objectKind, new Set([...(objCount.get(c.objectKind) ?? []), c.objectCode]));
const phaseTable = []; for (let k = 0; k <= n; k++) { const row = [k]; for (const kd of kindOrder) row.push(cards.filter(c => c.phaseNo === k && c.cardKind === kd).length); row.push(cards.filter(c => c.phaseNo === k).length); phaseTable.push(row); }
const firstCards = cards.filter(c => c.cardKind === 'first');
const md = [
  '# 乙-5 卡账 v0 与卡族读数（脚本生成，勿手改）',
  '',
  `- 生成脚本：脚本/卷十一/gen-card-ledger.mjs；产出：审查/脚本输出/卡账-v0.json。输入：脚本/卷十一/migrows-input.json（${rows.length} 行非别名迁移行）、乙4补-systems补全.json（${sysJ.length} 个系统）、乙4-import图-边表.tsv、乙4-entryCallerFiles.json、卷二（表主、§2.1、§5、§6.12）、卷十二 §2.11、各卷断言定义。只读、确定性、不联网；同一提交重跑逐字一致。`,
  '- 这是设计侧派生物，不是 `tools/migrate/` 的卡账；`tools/`、`server-plugin/`、`extension/` 未碰。',
  '',
  '## 一 卡总数与分布',
  '',
  `卡共 ${cards.length} 张（非清扫卡 ${nonSweep.length} 张，清扫卡 ${cards.length - nonSweep.length} 张）；阶段数 n = ${n}（R11-5.2：非清扫卡的最大阶段号）。`,
  '',
  '| cardKind | ' + kindOrder.map(k => kindName[k]).join(' | ') + ' | 合计 |', '|---|' + kindOrder.map(() => '---:').join('|') + '|---:|',
  '| 按卡种 | ' + kindOrder.map(k => byKind[k] ?? 0).join(' | ') + ' | ' + cards.length + ' |', '',
  '| 阶段 | ' + kindOrder.map(k => kindName[k]).join(' | ') + ' | 合计 |', '|---|' + kindOrder.map(() => '---:').join('|') + '|---:|',
  ...phaseTable.map(r => '| ' + r.join(' | ') + ' |'), '',
  `对象：表 ${objCount.get('table')?.size ?? 0} 个、系统 ${objCount.get('system')?.size ?? 0} 个、模块组 ${objCount.get('module_group')?.size ?? 0} 个、门禁设施 ${objCount.get('gate_facility')?.size ?? 0} 个；首卡 ${firstCards.length} 张（账本系统的首卡职责由母卡承担，不另出首卡）；后续卡 ${byKind.follow ?? 0} 张 = 各对象消费者组数减一之和。`,
  '',
  `搬迁卡切段（R11-7.5，李白 11-15 18:22；splitAxis：consumer_group 消费者组、target_subdir 卷二 §6.11 目标子目录、path_order 路径升序兜底）：${uniq(cards.filter(c => c.cardKind === 'relocate').map(c => c.objectCode)).sort().map(o => { const cs = cards.filter(c => c.cardKind === 'relocate' && c.objectCode === o).sort((a, b) => a.segNo - b.segNo); return `${o} ${cs.length} 张（${cs.map(c => `${c.cardId} 段 ${c.segNo} ${c.splitAxis} ${c.files.filter(f => f.endsWith('.mjs')).length} 个 .mjs`).join('；')}）`; }).join('；')}。`,
  '',
  '## 二 三个错误码与核对',
  '',
  `- E-MIG-CARD-INCOMPLETE：${matrixBad.length} 张（按卷十一 §2.2 必填矩阵原定义：缺"必"或"列"字段、"—"字段有值，即计；有无待补原因不改数）。其中没有待补原因的 ${matrixBadNoReason.length} 张；其余 ${matrixBad.length - matrixBadNoReason.length} 张的空位都因推不出、已在 pending 里写明原因（不替它定值，见第三节）。这 ${matrixBad.length} 张不得转 \`ready\`。`,
  `- E-MIG-ACCEPT-FORM：${acceptBad.reduce((s, x) => s + x.bad.length, 0)} 个编号（${acceptBad.length} 张卡）在所指卷里查不到定义${acceptBad.length ? '：' + acceptBad.slice(0, 8).map(x => x.cardId + ' ' + x.bad.join('、')).join('；') : ''}；这些编号已从判据摘出并登记在该卡 pending。判据里只有编号（齐全率下限键 ${dimKeys.length} 个、各卷断言与扫描条、卷十一 ${s11.length} 条扫描条、门禁自身的条目 ${gateItems.length} 条）。`,
  `- E-MIG-SORTKEY-ORDER：钩子 ${hookNodes.length} 个（${hookNodes.join('、')}）；成环 ${hookCycle.length} 个；指向不存在（卷里没有登记行）的 ${hookMissing.length} 个${hookMissing.length ? '：' + hookMissing.join('、') : ''}；同一钩子两处写法不同 ${uniq(hookConflict).length} 个。机读 after 来源是各卷正文的 \`X.after = [..]\` 写法；排序键按拓扑加代号升序从 1 连续编号，v0 不分推进相位（卷二 §2.7 没有按钩子登记相位的机读列），落在登记该钩子的卷的领头卡的 sortKeys 上。`,
  `- dependsOn：${phaseCycle ? '成环（首个：' + phaseCycle.join('→') + '；全部环见下面两条）' : '无环'}；指向不存在的卡 ${depMissing.length} 处；固定卡阶段冲突（E-MIG-PHASE-CONFLICT）${phaseConflicts.length} 处${phaseConflicts.length ? '：' + phaseConflicts.join('；') : ''}。`,
  ...[['主卡族', cyclesMain], ['子进程卡族（不并组改判，R11-2.5 第一步所用次序的来源）', childCycles]].map(([nm, cy]) => `- 环（${nm}，强连通分量，只报不改归属）：${cy.length ? cy.map((x, i) => `环 ${i + 1}：${x.cards.join('、')}；边：${x.edges.map(e => `${e.from}→${e.to}〔${e.why.join('；')}〕`).join('，')}`).join('。') : '无'}${nm.startsWith('子') && cy.length ? '。子进程卡族有环，R11-2.5 第一步的次序在环上没有定义，挡封、报李白（02:45 ②）' : ''}${!nm.startsWith('子') && cy.length ? '。其中' + cy.map((x, i) => `环 ${i + 1}${childCycles.some(z => x.cards.filter(c => z.cards.includes(c)).length > 1) ? '在不并组改判的卡族上同样成环，挡封、报李白' : '只因合组改判才出现（不并组改判的卡族上无环），记读数暂缺（等 zeroRow），不挡封（02:45 ②）'}`).join('；') : ''}。`),
  `- 两表成环（李白 11-16 02:00 Q2）：${cyc2.length ? cyc2.map(x => x.ok ? `${x.pair}：一向来源 1、一向来源 2，来源 2 的行 ${x.rows.join('、')} 应改归 ${x.to}，退回来源卷勘误` : `${x.pair}：不是"来源 1 对来源 2"的搭配，停下报李白`).join('；') : '无'}。`,
  `- 直接指称（李白 11-16 08:xx）：落点节正文里"读/经/取 \`x\`"或"\`x\` 的结果/返回"（括注外）把外卷登记入口当读取来源或调用结果、原先未计而本条新计入的 ${uniq(directHits).length} 处：${uniq(directHits).sort().join('、') || '无'}。`,
  `- 未上线入口按登记处写明的对象上线（李白 11-16 03:5x ③）：补上线 ${objAssigned.length} 个；entries 待查新类"入口对象未定" ${objUndetermined.length} 个（${objUndetermined.map(x => `${x.vol}:${x.name}（${x.why}）`).join('、') || '无'}）。同名入口登记在不止一个主办卷、按卷名次序取前者的：${[...ownerAmbig].join('；') || '无'}。`,
  `- §3 拒收（李白 11-16 01:30 第 3 条）：不在该卷 §3 入口表里的名字从 entries 摘出 ${rejected.entries.length} 个、从 launches 摘出 ${rejected.launches.length} 个${rejected.launches.length ? '（' + rejected.launches.slice(0, 8).join('、') + (rejected.launches.length > 8 ? '…' : '') + '）' : ''}。`,
  `- launches：每个入口恰一张卡上线——重复上线 ${launchDup.length} 个${launchDup.length ? '：' + launchDup.slice(0, 5).join('、') : ''}；没有卡上线的入口 ${notLaunched.length} 个${notLaunched.length ? '（' + notLaunched.slice(0, 5).join('、') + '…）' : ''}。`,
  `- 迁移行认领：没有接收卡 ${orphanRows.length} 行${orphanRows.length ? '（' + orphanRows.slice(0, 12).join('、') + (orphanRows.length > 12 ? '…' : '') + '）' : ''}；多于一张 ${multiRows.length} 行。位置组 ${posGroups.size} 个，其中锚点跨两个以上消费者组的位置组行 ${nStraddle} 行（取最小组，待裁）；位置组内对象不一致 ${nObjConflict} 组（按 R11-2.5 原文取首卡在 R11-7.2 次序中最前的候选，见下两条，列在第五节）。`,
  `- 全仓库机械替换类（卷十一 R11-7.8 例外，李白 11-15 19:12）：${mechInfo.map(x => `${x.rowKey}（\`${x.ident}\`，脚本列出 ${x.files} 个文件，${x.returned ? '落点没有所消除的扫描代号，不算机械替换类，退回来源卷' : `所消除的扫描 ${x.scan.join('、')}，进 ${x.sweep}`}）`).join('；') || '无'}；替换的迁移行列在 segNo 最小的段卡的 rowKeys（李白 11-16 01:25 第 2 条）。`,
  `- 对象按登记卷定（李白 11-16 01:25 第 1 条：规则表键、词表族条目有登记处的按登记卷，不读落点文字）：与判据一结果不同的 ${regMoved.length} 行${regMoved.length ? '：' + regMoved.map(x => `${x.k}（\`${x.o}\` 登记在${x.reg}，判据一原取${x.j1}）`).join('；') : ''}。`,
  `- 位置组定对象（R11-2.5 原文，李白 11-16 01:25 第 5 条）：zeroRow 未转录，按"没有这样的行"取首卡在 R11-7.2 次序中最前的候选；次序在不并组改判的卡族（每行取自身对象）上按 R11-7.2 算一次，不回代、不迭代（李白 11-16 02:00 Q1）；候选不在次序里的组 ${objConflicts.filter(x => x.unranked.length).length} 组。与旧取法（行数最多）相比改了接收对象的行 ${pickMoved.length} 行。`,
  `- 并组后接收对象不是本行自己对象的行，列待查（zeroRow 补上后复判）：${mergedRecheck.length} 行${mergedRecheck.length ? '：' + mergedRecheck.map(x => `${x.k}（${x.own}→${x.pick}）`).join('；') : ''}。`,
  `- entries（李白 11-16 01:30）：按各行"卷、节"到该卷 §3 入口表取恰一个入口；§3 入口表共登记 ${entryNames.size} 个入口名，不在表里的名字不收。待查：一节对应多个入口 ${uniq(entryMulti.map(x => x.k)).length} 行（${uniq(entryMulti.map(x => x.k)).join('、')}）；该节在 §3 找不到入口 ${uniq(entryNone.map(x => x.k)).length} 行（${uniq(entryNone.map(x => x.k)).join('、')}）；落点没有节号或规则编号 ${uniq(entryNoSec).length} 行；入口与对象不符（李白 11-16 02:30 第 2 条：推出的入口由别的对象上线，不计入口边）${uniq(entryMismatch.map(x => x.k)).length} 行（按来源卷：${Object.entries(stat(uniq(entryMismatch.map(x => x.k)).map(k => entryMismatch.find(x => x.k === k)), x => x.vol)).map(([v, n]) => `${v} ${n}`).join('、')}；${uniq(entryMismatch.map(x => x.k)).map(k => { const x = entryMismatch.find(y => y.k === k); return `${k}（${x.name} 属 ${x.owner}，行属 ${x.own}）`; }).join('、')}）。§3 散文写法收下的入口名（李白 11-16 03:00 第 1 条三条件）：${[...proseCount].sort((a, b) => cmp(a[0], b[0])).map(([v, ns]) => `${v} ${ns.length} 个（${ns.join('、')}）`).join('；') || '无'}；带入口属性标记的（否定分句转来，03:2x 第 1 条）：${[...entryIdx].flatMap(([v, xs]) => xs.filter(x => x.attrs).map(x => `${v}:${x.name}{${Object.entries(x.attrs).map(([k, val]) => `${k}=${val}`).join(',')}}`)).join('、') || '无'}；写明由别卷登记、主登记归该卷的（原处记引用，03:2x 第 2 条）：${delegInfo.map(d => `${d.name}→${d.vol} ${d.sec}（引自${d.from}${d.ok ? '' : '；该节正文没写这个名字，未建'}）`).join('、') || '无'}；散文候选因别卷已登记不收 ${uniq(proseRejected.map(x => x.v + ':' + x.name)).length} 个；卷二 §2.1 入口清单 ${reg21.length} 个读函数，主办卷 §3 都没登记、归卷二的 ${(entryIdx.get(REGVOL) ?? []).filter(x => x.reg21).length} 个（${(entryIdx.get(REGVOL) ?? []).filter(x => x.reg21).map(x => x.name).join('、') || '无'}；03:00 第 2 条）。`,
  `- 门禁卡（李白终核卷十一 挡-1、挡-2 与复核）：${cards.filter(c => c.cardKind === 'gate').map(c => `${c.cardId} 对象 ${c.objectCode ?? '—'}（${c.volume ?? '—'}，建 ${(c._facs ?? []).join('、') || '—'}），上线 ${c.launches.length} 个入口，accept ${c.accept.join('、') || '—'}`).join('；')}。门禁自身的条目 ${gateItems.length} 条归卡：${gateItemTo.join('、') || '无'}。`,
  `- 账本子卡 ${ledgerChildren.length} 张${ledgerChildLimit ? '，超过卷一 §6.5 的 ≤ 8 上限，报李白' : '（≤ 8）'}。`,
  '',
  '## 三 待补（K7）与 migReady',
  '',
  `${nPend} 张卡带 pending（共 ${Object.values(pendKinds).reduce((a, b) => a + b, 0)} 条）；按类：${Object.entries(pendKinds).sort((a, b) => cmp(a[0], b[0])).map(([k, v]) => k + ' ' + v).join('、')}。`,
  '',
  `- accept（乙-6b，李白 11-15 18:50 第 1 条）：编号按通用识别规则认（脚本/卷十一/id-defs.mjs；写法清单 审查/脚本输出/乙6b-编号写法清单.md），只取“验收类”（定义行最近的命中标题是验收、断言、扫描、旁路、不变量一类；影响面表、修订记录、记账栏等记录类的意见号与规则号不取）。卡的行落点没写编号时，取对象所在卷里验收类定义行提到本卡对象代号、要接或上线的入口名、文件名的编号（只写编号，带后缀的写全称，没有卷序号的写“卷名:编号”；"台账 S-n"是素材台账条目，不当扫描号）。取完 accept 仍为空的 ${suspects.length} 张卡列为疑点，不新造编号；原因有原文出处的写出处，写不出的标“待查”（${suspects.filter(x => x.reason.startsWith('待查')).length} 张）：`,
  '',
  '| 卡 | 卷 | 原因 |', '|---|---|---|',
  ...suspects.map(x => `| ${x.cardId} | ${x.volume ?? '—'} | ${x.reason} |`),
  '',
  `  - 规则号摘出后按“规则所在小节的验收断言小节里点名该规则的断言”补回 accept（李白 11-16 19:24 第 1 条 b）：因摘规则号而 accept 取空的卡共 ${cards.filter(c => c._ruleEmpty).length} 张（其中补上 ${cards.filter(c => c._coverWhy?.length).length} 张，仍空 ${cards.filter(c => c._ruleRefs?.length && !c.accept.length).length} 张，已列入上表）：`,
  '',
  '| 卡 | 原规则号 | 补上的断言号 | 依据（断言所在文件:行，该行文字里点名原规则号） |', '|---|---|---|---|',
  ...cards.filter(c => c._coverWhy?.length).map(c => `| ${c.cardId} | ${uniq(c._coverWhy.map(w => w.rule)).join('、')} | ${c.accept.join('、')} | ${c._coverWhy.map(w => `${w.assertion}：${w.at.replace(/^卷.*?\.md/, m => m)}`).join('；')} |`),
  '',
  `  - 另：卷二 §6.12 没有齐全率下限键的表首卡（accept 里无下限键，不一定为空）：${cards.filter(c => c.pending.some(p => p.startsWith('accept:卷二 §6.12'))).map(c => c.cardId).join('、') || '无'}。`,
  '- retire：登记退役数要逐行清单的行数，逐行清单待 G-3，全部"必"卡的 retire 为空并已登记。',
  '- zeroRows：迁移行没有 zeroRow 列（待补清单第 6 项已记），zeroRows 全部为空表（该字段矩阵里是"列"，可为空）。',
  '- census、testClass、derivations、approvals、mergeRef、fails 是做卡时才填的字段，v0 为空。',
  `- 系统登记项的 predicates、writers、sources、sinks、entryJudges、view 六列已由卷文转录（乙-6a，卷二 §2.7 六列转录表）；仍待补的列逐张标在首卡与母卡的 pending 里（${[...sixPending.values()].reduce((a, b) => a + b.length, 0)} 格）。`,
  '',
  'migReady 逐卡计算（卷十一 :303）：缺陷项与状态项分开记。状态项是 drafted 阶段本来就不满足的——依赖卡已 merged、所在阶段已开、不在冻结中（要求写的是后两项；"依赖卡已 merged"是 R11-3.12 的第三个状态条件，一并列出）。缺陷项（除状态项外的不满足）：',
  '',
  ...Object.entries(stat(cards.filter(c => c._ready.defects.length), c => c._ready.defects.join('；'))).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `- ${v} 张：${k}`),
  `- 无缺陷项（只差状态项）：${cards.filter(c => !c._ready.defects.length).length} 张。`,
  '',
  '## 四 与排期 v1 的对照（开工排期-v1定稿 §1）',
  '',
  `- 阶段数 n：排期 ≈ 5–7；本表 ${n}。R11-7.2 来源 2（要接的入口由另一张卡上线）按各行"卷、节"到该卷 §3 取恰一个入口（李白 11-16 01:30），跨对象的入口依赖已算进去，共 ${cards.filter(c => c.entries.some(en => { const d = cardByLaunch.get(entryKey(en.vol, en.name)); return d && d !== c && `${d.objectKind}:${d.objectCode}` !== `${c.objectKind}:${c.objectCode}`; })).length} 张卡接了别对象上线的入口；一节多入口、找不到入口、没有节号的行不推定，列待查（第三节），这些行补齐后依赖只会更多，n 因此仍是下界。表间必填引用（来源 1）按卷十一 §4.7.5 算（引用方首卡比被引用表首卡晚一个阶段：信仰晚于神祇、物种晚于身体图、人物晚于物种，等等），来源 4、5 同阶段。灵敏度：把 H2 的旧调用方按名字对到别对象读入口后，n = ${alt.n}${alt.cycle ? '，依赖成环（' + alt.cycle.join('→') + '）' : '，无环'}，固定卡阶段冲突 ${alt.conflicts.length} 处——说明在那份噪声输入上算不出可用的阶段，待各卷迁移节写出按入口名的"要接的入口"栏后重算。`,
  `- 实现卡（首卡、后续卡、搬迁卡、账本母卡与子卡）：排期 60–120；本表 ${nImpl}（其中首卡加后续卡 ${nDomain}），在区间内。`,
  `- 门禁卡 ${byKind.gate ?? 0}、清扫卡 ${byKind.sweep ?? 0}：与卷一 §6.3、R11-7.8 一致。`,
  '',
  '## 五 位置组内对象不一致的组',
  '',
  ...(objConflicts.length ? ['| 行 | 候选对象 | 取 |', '|---|---|---|', ...objConflicts.slice(0, 40).map(x => `| ${x.rows.slice(0, 6).join('、')}${x.rows.length > 6 ? '…' : ''} | ${x.objs.join('、')} | ${x.pick} |`), ''] : ['无。', '']),
  '## 六 每个首卡的概览',
  '',
  '| 首卡 | 卷 | 对象 | 阶段 | 行数 | 文件数 | 后续卡数 | pending |', '|---|---|---|---:|---:|---:|---:|---:|',
  ...firstCards.map(c => `| ${c.cardId} | ${c.volume ?? '—'} | ${c.objectCode} | ${c.phaseNo} | ${c.rowKeys.length} | ${c.files.length} | ${cards.filter(x => x.cardKind === 'follow' && x.objectCode === c.objectCode && x.objectKind === c.objectKind).length} | ${c.pending.length} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/卡账-v0-摘要.md`, md);
console.log(`cards ${cards.length}; kinds ${JSON.stringify(byKind)}; n=${n}; phases ${JSON.stringify(byPhase)}`);
console.log(`matrixBad ${matrixBad.length}; pendMiss ${pendMissCards.length}; acceptBad ${acceptBad.length}; hooks ${hookNodes.length} cycle ${hookCycle.length} missing ${hookMissing.length}; phaseCycle ${phaseCycle ? 'YES' : 'no'}; phaseConflicts ${phaseConflicts.length}`);
console.log(`orphan ${orphanRows.length}; multi ${multiRows.length}; unassigned ${unassigned.length}; objConflict ${nObjConflict}; straddle ${nStraddle}; launchDup ${launchDup.length}; notLaunched ${notLaunched.length}; ledgerChildren ${ledgerChildren.length}; impl ${nImpl}`);
