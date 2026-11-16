// 乙-8（李白 11-16 03:5x ④、09:xx 第三四条；要点表 审查/乙8-一节多入口-设计要点表.md E1–E6）：迁移行落点栏写明入口名的候选清单与编辑计划。
// 确定性；不按行号、条目号、卷名特判；只读卷文与现有卡账生成器的算法。
// 名单（E1）：用 gen-card-ledger.mjs 同一份判定（namesInSection，一节正文里列出的入口名多于一个）得到"一节多入口"行及该节候选入口名。
//   做法：把生成器源码读进来，换掉写文件、追加一行转储 entryMulti，存成同目录的临时模块跑一遍后删除——不改生成器文件，也不写卡账输出。
// 判定（E2/E3）：候选名只在本行原文（除编号栏外的各栏：落点、做什么、去处、锚点等）里按标识符边界查；
//   本行原文恰写出候选中的一个 → 落点栏补"（入口 `名`）"；写出多个、一个都没写 → 补"（入口名待补）"，不推定、不按语义猜。
// 用法：node 乙8-入口名候选.mjs <卷名> [--write] [--plan] [--diff] [--batch <批次>]
//   --write 写 审查/脚本输出/乙8-<卷名>-候选清单.md；--plan 写 F:/dnd-tmp/乙8-<批次>-<卷名>-plan.json（落点栏每处的唯一定位串、勘误行、待办段）；勘误标签、快照名与差额中间文件都带批次。
//   --snapshot pre|post：pre 复制卷文到 版本快照/<卷>-v<N>-勘误前-<标签>.md（不覆盖），post 照该卷上一条勘误的"改后覆盖"对象写现卷文。
import { readFileSync, readdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const DIR = `${HERE}/../..`;
const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const BATCH = arg('--batch'); // 批次参数：--diff/--plan/--print/--snapshot/--report 必带；决定快照标签与跨进程中间文件名，不同批次互不覆盖
const TMP = 'F:/dnd-tmp';
const RUN = `${process.pid}-${Date.now()}`; // 本次运行的唯一后缀：生成器临时模块与转储只在本次运行内存在
// 差额表模式：node 乙8-入口名候选.mjs --report --batch <批次> 卷A 卷B …（先对各卷以同一 --batch 跑过 --diff）。把各卷与"已封卷文判定"不同的行写成 审查/脚本输出/乙8-第<批次>批-判据修正差额.md
if (process.argv[2] === '--report') {
  if (!BATCH) throw new Error('--report 需要 --batch <批次>');
  const vs = process.argv.slice(3).filter(x => !x.startsWith('--') && x !== BATCH); const rowsOut = []; let n = 0;
  for (const v of vs) {
    const d = JSON.parse(readFileSync(`${TMP}/乙8-diff-${BATCH}-${v}.json`, 'utf8'));
    for (const x of d.diffs) { n++; rowsOut.push(`| ${v} | ${x.k} | ${x.line} | ${x.old} | ${x.nu} | ${x.basis} |`); }
  }
  const md = [`# 乙-8 第 ${BATCH} 批 入口名候选脚本判据修正差额（脚本生成，勿手改）`, '',
    '依据：李白 04:1x ① K2、04:53 第 1、2 条、08:xx 直接指称、09:xx 第二条；y37 列出的判据偏离已整类修正（调用形只认名字紧跟括号签名；否定句对所有计入路径生效；去掉"读自"、名字后裸"给出"暂不计（裸"返回"按李白 09:2x 计入）；本卷名也须带反引号；只点登记卷名不计）。脚本：脚本/全书/乙8-入口名候选.mjs。',
    `对象：${vs.join('、')}；列出新脚本判定与已封卷文落点栏标记（"（入口 \`名\`）"或"（入口名待补）"）不同的行，共 ${n} 行。本表只出读数，不改卷文。`, '',
    '| 卷 | 编号 | 卷文行 | 封卷判定 | 新判定 | 依据（原句与行号） |', '|---|---|---|---|---|---|', ...rowsOut, ''].join('\n');
  writeFileSync(`${DIR}/审查/脚本输出/乙8-第${BATCH}批-判据修正差额.md`, md); console.log(`差额 ${n} 行`); process.exit(0);
}
// 全书模式：node 乙8-入口名候选.mjs --all：对全书所有"一节多入口"行中、落点栏尚无"（入口 `名`）"的行一次出清单 审查/脚本输出/乙8-全书候选清单.md（李白 11-16 10:xx 第 2 条）
// 两边比对模式：node 乙8-入口名候选.mjs --vs-gen <卷名…>：对所列各卷，逐行比脚本判定与生成器落点栏取到的入口名，差额写 审查/脚本输出/乙8-两边差额-<卷名…>.md，并给每行差别归类
const MERGE = process.argv[2] === '--all' && process.argv.includes('--merge'); // 合并卡：--all --merge --batch <批次> [--skip 行,行] [--hold "行=原因;…"] [--dry]
const VSGEN = process.argv[2] === '--vs-gen';
const VSVOLS = VSGEN ? process.argv.slice(3).filter(x => !x.startsWith('--')) : null;
const ALL = process.argv[2] === '--all' || VSGEN;
const VOLNAME = ALL ? '全书' : process.argv[2];
if (!VOLNAME || (!ALL && VOLNAME.startsWith('--'))) throw new Error('用法：node 乙8-入口名候选.mjs <卷名> [--write] [--plan] [--diff] [--print] [--snapshot pre|post] [--batch <批次>]；node 乙8-入口名候选.mjs --report --batch <批次> <卷名…>；node 乙8-入口名候选.mjs --all');
if (!BATCH && ['--diff', '--plan', '--print', '--snapshot'].some(f => process.argv.includes(f))) throw new Error('--diff/--plan/--print/--snapshot 需要 --batch <批次>');
const TAG = BATCH ? `1116乙8-${BATCH}-${VOLNAME.replace(/^卷/, '')}` : '1116乙8-' + VOLNAME.replace(/^卷/, '');
const PLAN_PATH = `${TMP}/乙8-${BATCH}-${VOLNAME}-plan.json`;
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const uniq = a => [...new Set(a)];

// ---- 取"一节多入口"清单与候选名（生成器同口径）----
const genPath = `${HERE}/../卷十一/gen-card-ledger.mjs`;
const GEN_DIR = `${HERE}/../卷十一`;
// 临时模块与转储都放 F:/dnd-tmp（按卷名区分，不在卷十一目录写任何文件）；生成器按自身所在目录算路径与相对 import，这里换成卷十一目录的绝对路径
const tmpMod = `${TMP}/乙8-gen-tmp-${VOLNAME}-${RUN}.mjs`;
const dumpPath = `${TMP}/乙8-multi-${VOLNAME}-${RUN}.json`;
let src = readFileSync(genPath, 'utf8');
const homeLine = "const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\\\/g, '/').replace(/\\/$/, '');";
if (!src.includes(homeLine)) throw new Error('生成器 HERE 行变了，脚本需同步');
src = src.replace(homeLine, `const HERE = ${JSON.stringify(GEN_DIR)};`);
// 生成器其余按自身位置算的路径（DIR、REPO、子进程自调用）一并换成生成器文件本身的 URL，临时模块放在别处也与原位运行同义
src = src.replaceAll('import.meta.url', JSON.stringify(new URL(`file:///${genPath}`).href));
for (const m of ['./object-rules.mjs', './id-defs.mjs']) {
  if (!src.includes(`'${m}'`)) throw new Error(`生成器 import ${m} 变了，脚本需同步`);
  src = src.replace(`'${m}'`, JSON.stringify(new URL(`file:///${GEN_DIR}/${m.slice(2)}`).href));
}
const impLine = "import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';";
if (!src.includes(impLine)) throw new Error('生成器 import 行变了，脚本需同步');
src = src.replace(impLine, "import { readFileSync, readdirSync, writeFileSync as __wfs, statSync } from 'node:fs';\nconst writeFileSync = (p, d) => { if (String(p).replace(/\\\\/g, '/').includes('/审查/脚本输出/')) return; return __wfs(p, d); };");
src += `\n__wfs(${JSON.stringify(dumpPath)}, JSON.stringify({ multi: entryMulti, entries: Object.fromEntries(rows.map(r => [r.rowKey, entryOfRow(r).map(x => x.name)])), mismatch: entryMismatch, entryNames: [...entryNames], idx: Object.fromEntries([...entryIdx].map(([v, xs]) => [v, xs.map(x => x.name)])), prim: [...primNames] }));\n`; // 生成器两路读数：一节多入口行、每行落点栏明写取到的入口名与"入口与对象不符"待查（--vs-gen 比对用）
writeFileSync(tmpMod, src);
try { execFileSync(process.execPath, [tmpMod], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); }
finally { try { unlinkSync(tmpMod); } catch {} }
let multi, genEntries, genMismatch, GENREG; try { const d = JSON.parse(readFileSync(dumpPath, 'utf8')); multi = d.multi; genEntries = d.entries; genMismatch = d.mismatch; GENREG = { names: new Set(d.entryNames), idx: new Map(Object.entries(d.idx).map(([v, xs]) => [v, new Set(xs)])), prim: new Set(d.prim) }; } finally { try { unlinkSync(dumpPath); } catch {} } // [{k, at, names}] names 里别卷的写成 "卷X:名"
const multiByKey = new Map(); for (const x of multi) if (!multiByKey.has(x.k)) multiByKey.set(x.k, x);

const mig = JSON.parse(readFileSync(`${DIR}/脚本/卷十一/migrows-input.json`, 'utf8'));
const allFiles = readdirSync(DIR).filter(f => /^卷.*\.md$/.test(f));
let volFile, ls, txt;
function loadVol(v) { volFile = allFiles.find(f => f.startsWith(v + '-')); ls = readFileSync(`${DIR}/${volFile}`, 'utf8').split(/\r?\n/); txt = ls.join('\n'); }
if (!ALL) loadVol(VOLNAME);
const rows = ALL ? [] : mig.rows.filter(r => !r.aliasOf && r.volume === VOLNAME && multiByKey.has(r.rowKey));

// ---- 规则号索引：R<卷>-x.y 在全书各卷以"- **R… "起行的定义，恰一处才算唯一定义；正文 = 定义行起到下一个顶格列表项或标题之前（含其后的表）----
const RID = 'R[0-9]+[a-z甲乙]*-[0-9]+(?:\\.[0-9]+)*[a-z]?';
const ruleDefs = new Map();
for (const f of allFiles) {
  const L = readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/);
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(new RegExp('^- \\*\\*(' + RID + ')(?![0-9a-z.])')); if (!m) continue;
    let j = i + 1; while (j < L.length && !/^(- |#|---)/.test(L[j])) j++;
    if (!ruleDefs.has(m[1])) ruleDefs.set(m[1], []);
    ruleDefs.get(m[1]).push({ f, i, body: L.slice(i, j) });
  }
}
// 规则正文拆成 nameHit 的"栏"：表格行按栏拆，其余整行一栏
const ruleBodyCells = def => def.body.flatMap(l => /^\|/.test(l) ? cells(l) : [l]);

function headOf(line) { let i = line - 1; while (i > 0 && /^\|/.test(ls[i - 1])) i--; return cells(ls[i]); }
const strip = s => s.replace(/`/g, '').trim();
function tgtCol(head) {
  const h = head.map(strip);
  const a = h.findIndex(x => /落点/.test(x) && !/落点对象/.test(x)); if (a >= 0) return a;
  const b = h.findIndex(x => x === '对应 §'); if (b >= 0) return b;
  return h.findIndex(x => x === '去向');
}
function cellSpan(l, ti) {
  const bars = []; for (let i = 0; i < l.length; i++) if (l[i] === '|' && l[i - 1] !== '\\') bars.push(i);
  let s = bars[ti] + 1, e = bars[ti + 1]; while (l[s] === ' ') s++; while (e > s && l[e - 1] === ' ') e--; return [s, e];
}
const count = (t, s) => { let n = 0, i = -1; while ((i = t.indexOf(s, i + 1)) >= 0) n++; return n; };
function uniqueEndingAt(l, end, suffix, min = 6) {
  for (let s = Math.max(0, end - min); s >= 0; s--) { const cand = l.slice(s, end) + suffix; if (count(txt, cand) === 1) return cand; }
  return null;
}

// ---- 候选名的判定（李白 04:1x ① K2、04:53 第 1/2 条、08:xx、09:xx 第二条；y37 判据修正）----
// 所有名字（本卷与别卷）都须带反引号；否定句对所有计入路径统一生效；只点登记卷名、未说调用的不计。
const V_RE = '卷[零一二三四五六七八九十]+[b甲乙]?';
// 指称与否定的式样不在本脚本另抄：读生成器 gen-card-ledger.mjs "指称判据用的式样"段（SEE、CONJ、TRIG、NEGV、NEG_WORD、NEG_TAIL、negated、SUFFIX、FILE_EXT）原样取用，
// 两边永远同一份（李白 11-16 技术裁定 E3；生成器新增的否定词与句式随之自动带入）。
const DELIM = new Set(['，', '。', '；', ';', '\n']);
const CRIT = (() => {
  const g = readFileSync(`${HERE}/../卷十一/gen-card-ledger.mjs`, 'utf8');
  const i = g.indexOf('const SEE = new RegExp('), j = g.indexOf('\nfunction namesInSection');
  if (i < 0 || j < 0) throw new Error('生成器式样段位置变了，脚本需同步');
  return new Function('V_RE', g.slice(i, j) + '\nreturn { SEE, CONJ, TRIG, NEGV, NEG_WORD, NEG_TAIL, negated, SUFFIX, FILE_EXT };')(V_RE);
})();
const { SEE, CONJ, TRIG, NEGV, negated, SUFFIX, FILE_EXT } = CRIT;
// E4（技术裁定）："取卷六 `x`"这类触发词与名字之间隔卷名（可带节号、"的"）的写法算直接指称：卷名只是限定，x 仍是确切反引号名
// 脚本侧另加两处（B4 的 M4-57 "改 `can` 或 `awake`"需要；生成器没有，待生成器明天同改，两边差额里标明）：触发词加"改调/改走/改经/改读/改用/改"（改向某入口），并列词加"或"
const TRIGV = new RegExp(TRIG.source.replace(/\$$/, '(?:' + V_RE + '(?:\\s*§[0-9.]+)*\\s*的?\\s*)?$').replace('(取自|', '(改调|改走|改经|改读|改用|改|取自|'));
const CONJV = new RegExp(CONJ.source.replace('[、与和及]', '[、与和及或]'));
// isExt=false：本卷登记名，行内带反引号写出即计；isExt=true：别卷登记名，须调用形/分句明说调用或入口/直接指称
// loose=true 只供旧口径比对（本卷名在括注内也计）；正式判定 loose=false：本卷名与别卷名一样，括注内不计（E2 补⑤）
function nameHit(n, isExt, cellsText, loose = false) {
  const esc = n.replace(/\$/g, '\\$');
  for (const cell of cellsText) {
    const depth = new Array(cell.length); { let d = 0; for (let i = 0; i < cell.length; i++) { const ch = cell[i]; if (ch === '（' || ch === '(') d++; else if ((ch === '）' || ch === ')') && d > 0) d--; depth[i] = d; } }
    for (const m of cell.matchAll(new RegExp('`' + esc + '(?![A-Za-z0-9_$])([^`]*)`', 'g'))) {
      if (FILE_EXT.test(m[1])) continue; // "`名.mjs`"一类
      const call = /^[(（]/.test(m[1]); // 调用形：名字紧跟括号签名
      if (isExt && m[1] && !call) continue; // 别卷名：`名.字段` 一类不计
      const end = m.index + m[0].length;
      if (SUFFIX.test(cell.slice(end, end + 4).trim())) continue;
      let st = m.index; for (; st > 0; st--) if (DELIM.has(cell[st - 1]) && depth[st - 1] === 0) break;
      let en = end; for (; en < cell.length; en++) if (DELIM.has(cell[en]) && depth[en] === 0) break;
      const clause = cell.slice(st, en).replace(SEE, '');
      let pre = cell.slice(st, m.index).replace(/\s+$/, ''); while (CONJV.test(pre)) pre = pre.replace(CONJV, '').replace(/\s+$/, '');
      if (NEGV.test(pre) || negated(pre)) continue; // 否定句：所有计入路径统一不计
      if (!isExt) { if (!loose && depth[m.index] !== 0) continue; return `本卷登记名 ${n} 写明`; }
      if (call) return `调用形 \`${n}${m[1].slice(0, 1)}…\``;
      if (/调|入口/.test(clause)) return `分句「${clause.trim()}」明说调用/入口`;
      if (depth[m.index] !== 0) continue; // 括注内的直接指称不计
      const t = pre.match(TRIGV);
      const aft = cell.slice(end, end + 5).replace(/\s/g, '');
      if (t) return `直接指称「${t[1]} \`${n}\`」（${clause.trim()}）`;
      if (/^(的结果|的返回|返回的|给出的|返回)/.test(aft)) return `直接指称「\`${n}\` ${aft}」（${clause.trim()}）`;
    }
  }
  return null;
}
const diffs = [];
const out = [];
// 行文写明迁移或删除（李白 11-16 10xx 第 2 条）：迁、删、退役、搬一类字眼，否定写法（不删、不迁、无需删…）不计；只看处置值不够
const MIG_RE = /迁|删|退役|搬/g;
const MIG_NEG = /(不再|不得|不会|不必|不能|不可|无需|不用|不要|不|未|无|勿|别)\s*$/;
const REWIRE = /改调|改走|改经|改读|改为调|调入口|调用入口/; // 行文写出改调某入口
const migWritten = txts => txts.some(x => [...x.matchAll(MIG_RE)].some(m => !MIG_NEG.test(x.slice(Math.max(0, m.index - 3), m.index))));
// 原因码（待补原因分类；只依原文与处置栏，不推定）
// 无入口（迁移/删除）单列一类，不算待补（05aad804 第 4 条）；其余为待补原因
function reasonOf(ctx) {
  const { hit, ownNames, disp, textMig, rule, parenNames, allNames, sides, cited } = ctx;
  if (hit.length > 1) return { code: '明写多个入口，分不清去处', note: `本行明写两个以上不同入口名：${hit.join('、')}${ctx.mixedPend ? '（行文既写迁移/删除又写改调入口）' : ''}；不补，退回来源卷（技术裁定 B4，李白 10:12 第 2 条）` };
  // 改调栏明写两个以上不同的反引号名（如 `playerNotes`、`DomStructCap`）：同样是明写多个，分不清去处（B4）；只有一个或没有才是"名字不在该节候选"
  if (ctx.mixedText && !hit.length && ctx.rewireNames.length > 1) return { code: '明写多个入口，分不清去处', note: `行文既写迁移/删除又写改调入口，改调栏明写两个以上不同的名字：${ctx.rewireNames.join('、')}；不补，退回来源卷（技术裁定 B4，李白 10:12 第 2 条）` };
  if (ctx.mixedText && !hit.length) return { code: '混合行：明写入口名不在该节候选', note: `行文既写迁移/删除又写改调入口并明写入口名，但该名字不是落点节登记的候选，不能照明写补；暂不归无入口，待裁；原句：${ctx.sentence}` };
  if (ctx.isMig) return { code: '无入口（迁移/删除）', note: `处置 ${disp}，行文写明迁移或删除` };
  const paren = allNames.map(nm => nm.replace(/^.*:/, '')).filter(n => parenNames.has(n));
  if (paren.length) return { code: '仅括注', note: `候选只在括注内写出：${paren.join('、')}（括注不算写明）` };
  if (!ownNames.length) return { code: '无本卷自有候选', note: '该节候选全是别卷只读入口，本卷没有自有入口（别卷入口不计）' };
  if (cited.length && ownNames.length > 1 && !(sides[0] !== sides[1])) return { code: '规则正文无唯一入口', note: `所引 ${cited.join('、')} 的规则正文里本卷入口${rule.multi.length ? '写出多个：' + rule.multi.join('、') : '一个也没写'}，本行也没写` };
  if (sides[0] !== sides[1] && ownNames.length > 1) {
    return { code: '入口分端需锚点路径区分', note: `锚点在${sides[0] ? 'extension/' : 'server-plugin/ 或 output-gate/'}；入口分端需锚点路径区分，卷文未写明对应（没有一行同时写出本行锚点路径、所属端和某个本卷入口，或写出的不是唯一一个）` };
  }
  if (cited.length) return { code: '规则正文无唯一入口', note: `所引 ${cited.join('、')} 的规则正文里本卷入口${rule.multi.length ? '写出多个：' + rule.multi.join('、') : '一个也没写'}，本行也没写` };
  if (!ctx.mentioned.size) return { code: '无候选写出', note: '本行原文没写出任何候选入口名，落点栏也没引有唯一定义的规则号' };
  return { code: '其他', note: `候选名在本行出现但按判据不计（否定、字段来源等）：${[...ctx.mentioned].join('、')}` };
}
function judgeRow(r) {
  const l = ls[r.srcLine - 1]; const c = cells(l); const head = headOf(r.srcLine);
  const ti = tgtCol(head);
  const names = multiByKey.get(r.rowKey).names; // "卷X:名" 或 "名"
  // 本行原文：除编号栏（第 0 栏）外的各栏（落点、做什么、去处、锚点等所写的）；落点对象栏是对象代号不是入口名，不计
  const objI = head.map(strip).findIndex(x => /落点对象/.test(x));
  // 去掉已封卷文里本脚本补的标记，免得拿自己的输出当原文
  const bodyCells = c.filter((x, i) => i !== 0 && i !== objI).map(x => x.replace(/（入口 `[^`]+`）|（入口名待补）/g, ''));
  const body = bodyCells.join(' | ');
  // 本卷登记的候选：本行原文写出确切名字即计（括注、"某某 条目"之类的后缀与扩展名排除，同生成器本卷名"出现即计"的口径再加后缀排除）。
  // 别卷登记的候选（"卷X:名"）按 nameHit：调用形（名字紧跟括号签名）、原句明说调用/入口、读/经/取/返回/给出/取自 后写确切反引号名（并列各计）、"x 的结果/的返回/返回的/给出的/裸返回"；
  // 括注内的直接指称、所有路径上的否定句（"不调 x""不经 x""不读 x"）、字段来源说明、名字后跟"族、角色、字段、列、键、代号、词表、条目"、只点登记卷名未说调用、"，见卷X"只当出处、扩展名，都不计
  // 李白 05aad804 第 2 条：别卷只读入口不计入候选，只认本卷自有入口；hitAll 只用来报"去掉别卷入口后判定变化"
  const why1 = {};
  // 李白 11-16 10:xx 第 1 条：② 只管推断；本行原文明写的入口名（本卷别卷都计）照补，括注内不计；一行明写两个以上不同入口名不补
  const base = nm => nm.replace(/^.*:/, ''), isExtN = nm => /:/.test(nm);
  const allNames = names; const ownNames = names.filter(nm => !isExtN(nm));
  // 明写按全书登记的入口名算，不限于该节候选（技术裁定 B3：M15-22 明写 priceFor 补 priceFor；B4：明写两个以上不同入口名不补，M19-29、M2-15b、M4-57、M2-17）：
  // 本行原文里带反引号的名字，在全书入口登记名内的，按 nameHit 同一判据（本卷登记名写明即计；别卷登记名须调用形/分句明说调用或入口/直接指称；括注内、否定、字段、扩展名不计；外卷原语不收编）逐个判
  const tokenNames = new Set(); for (const cell of bodyCells) for (const m of cell.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)/g)) tokenNames.add(m[1]);
  // "本卷"是落点所在节的那一卷（at 的卷名），不是迁移行所在卷：落点在别卷的节时，别卷登记的名对该节就是本卷名（候选名单里不带"卷X:"前缀的那些）
  const landVol = multiByKey.get(r.rowKey).at.split(/\s+/)[0];
  const ownSet = GENREG.idx.get(landVol) ?? new Set();
  const hit = uniq([...tokenNames].filter(n => GENREG.names.has(n)).filter(n => { const ext = !ownSet.has(n); const w = nameHit(n, ext, bodyCells); if (w) why1[n] = w; return !!w; }));
  // 旧口径（只供汇总比对）：只认本卷名且括注内也计 / 本卷别卷都计且括注内也计
  const lgOwn = ownNames.filter(nm => nameHit(nm, false, bodyCells, true));
  const lgAll = uniq(allNames.filter(nm => nameHit(base(nm), isExtN(nm), bodyCells, true)).map(base));
  const restored = hit.length === 1 && lgOwn.length !== 1; // 别卷明写，旧口径（只认本卷）补不上，现恢复
  const lgExt12 = lgAll.length === 1 && lgOwn.length !== 1; // 旧口径下"去掉别卷入口后能补变不能补"类（原 12 行）
  // 行文写明迁移/删除；混合行：同时写改调入口
  const migCells = bodyCells.filter(x => strip(x) !== r.disp);
  const textMig = migWritten(migCells);
  const isMig = textMig && ['delete', 'to_data', 'move_out', 'relocate_only'].includes(r.disp);
  const mixedText = isMig && REWIRE.test(migCells.join(' | ')) && /`[A-Za-z_$][A-Za-z0-9_$]*/.test(migCells.join(' | '));
  const mixedFill = mixedText && hit.length === 1; // 混合行按明写补名（李白 10:12）
  const mixedPend = mixedText && hit.length > 1;   // 明写两个以上入口名，分不清去处，单列待裁
  const extChange = false, extDir = '';
  // 规则正文兜底（李白 10:xx 主因①）：本行自身一个候选都没写出、落点栏引了全书唯一定义的规则号时，
  // 到这些规则正文里按同一明写判据找；恰写出该节候选之一则取它，多个或没有则不取
  const tcellRaw = (c[ti] ?? '').replace(/（入口 `[^`]+`）|（入口名待补）/g, '');
  const cited = uniq([...tcellRaw.matchAll(new RegExp(RID + '(?![0-9a-z.])', 'g'))].map(m => m[0])).filter(id => ruleDefs.get(id)?.length === 1);
  const rule = { cited, multi: [], from: {} };
  const infer = !hit.length; // 本行没明写：判定顺序 明写 → ①规则正文（只认本卷自有入口）→ ④迁移/删除无入口 → ③锚点路径（技术裁定 B1；行文写迁移/删除、但所引规则正文写出本卷唯一入口的行有去处，不属④）
  if (cited.length) { // 规则正文总是扫（旧口径比对要用），只有 infer 时才采用
    for (const id of cited) {
      const rc = ruleBodyCells(ruleDefs.get(id)[0]);
      for (const n of ownNames) { const w = nameHit(n, false, rc); if (w) { if (!rule.multi.includes(n)) rule.multi.push(n); { const d = ruleDefs.get(id)[0]; const at = d.body.findIndex(bl => bl.includes('`' + n)); rule.from[n] = `规则正文 ${id}（${d.f.split('-')[0]} 第 ${d.i + 1 + Math.max(at, 0)} 行）：${w}`; } } }
    }
  }
  let viaRule = infer && rule.multi.length === 1;
  if (viaRule) hit.push(rule.multi[0]);
  // 服务端/客户端（05aad804 第 3 条）：本行没写出候选、规则正文也取不到时，按锚点路径定端；
  // 路径与端的对应必须是卷文自己写明的（卷文有行同时写 extension/ 与客户端、server-plugin/ 或 output-gate/ 与服务端；候选的端取其登记行所写路径），且该端恰一个本卷入口才取
  let viaPath = null;
  const anchorI = head.map(strip).findIndex(x => /锚点|旧物|来源|路径/.test(x));
  const anchorCell = anchorI >= 0 ? (c[anchorI] ?? '') : c.join(' ');
  const aC = /extension\//.test(anchorCell), aS = /server-plugin\/|output-gate\//.test(anchorCell);
  // 锚点定端（李白 05aad804 ③、10:xx 第 4 条）：只在卷文自己写明"本行锚点路径→端→入口"的对应时启用：
  // 须有另一行同时写出本行锚点里的确切文件路径、该路径所属端（客户端/服务端）与某个本卷入口名，且这样的入口恰一个；只写某个新文件路径或整个目录归哪端的不算
  const anchorPaths = [...anchorCell.matchAll(/(?:extension|server-plugin|output-gate)\/[^\s`|，。；、）)]+/g)].map(m => m[0].replace(/[:：]\d.*$/, '').replace(/[.]+$/, '')).filter(p => /\.\w+$/.test(p));
  if (infer && !viaRule && !isMig && ownNames.length > 1 && aC !== aS && anchorPaths.length) { // ③ 排在 ④ 之后：迁移/删除行不取锚点路径
    const sideW = aC ? '客户端' : '服务端';
    const found = ownNames.map(n => ({ n, at: ls.findIndex((l, i) => i !== r.srcLine - 1 && l.includes(sideW) && anchorPaths.some(p => l.includes(p)) && new RegExp('`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])').test(l)) })).filter(x => x.at >= 0);
    if (found.length === 1) { hit.push(found[0].n); viaPath = `卷文第 ${found[0].at + 1} 行同时写明锚点路径、${sideW}与入口 ${found[0].n}`; }
  }
  // 旧口径定端（只供汇总"定端撤回"比对）：目录整体归端
  const lgSideOf = n => { let sv = 0, cl = 0; for (const l of ls) if (new RegExp('^\\|\\s*`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])').test(l)) { if (/server-plugin\/|output-gate\//.test(l)) sv++; if (/extension\//.test(l)) cl++; } return sv && !cl ? 'S' : cl && !sv ? 'C' : null; };
  const lgMapRe = (side, dirs) => new RegExp(`${side}[^，。；\`|]{0,6}[：:]\\s*\`?(?:${dirs})|(?:${dirs})[^，。；|]{0,40}[（(]?(?:归|属于|属|是|为)${side}`);
  const lgMapOk = aC ? ls.some(x => lgMapRe('客户端', 'extension\\/').test(x)) : ls.some(x => lgMapRe('服务端', 'server-plugin\\/|output-gate\\/').test(x));
  const lgPathHit = lgLegacyPath(); function lgLegacyPath() { if (lgOwn.length || rule.multi.length === 1 || !(ownNames.length > 1 && aC !== aS)) return false; return lgMapOk && ownNames.filter(n => lgSideOf(n) === (aC ? 'C' : 'S')).length === 1; }
  const ok = hit.length === 1 && !mixedPend;
  const mentionRe = n => new RegExp('`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])[^`]*`', 'g');
  const parenNames = new Set(), mentioned = new Set();
  for (const cell of bodyCells) for (const nm of names) {
    const n = nm.replace(/^.*:/, '');
    for (const m of cell.matchAll(mentionRe(n))) {
      mentioned.add(n); let d = 0; for (let i = 0; i < m.index; i++) { const ch = cell[i]; if (ch === '（' || ch === '(') d++; else if ((ch === '）' || ch === ')') && d > 0) d--; }
      if (d > 0) parenNames.add(n);
    }
  }
  // 旧口径分类（只供汇总比对）：旧 ④ 正则、旧明写（只认本卷名、括注计）、旧规则正文、旧定端
  const lgTextMig = bodyCells.filter(x => strip(x) !== r.disp).some(x => /迁移|迁出|迁入|删除|删掉|搬出/.test(x));
  const lgOk = lgOwn.length === 1 || (!lgOwn.length && (rule.multi.length === 1 || lgPathHit));
  const lgCls = lgOk ? 'ok' : (lgOwn.length <= 1 && ['delete', 'to_data', 'move_out', 'relocate_only'].includes(r.disp) && lgTextMig) ? '④' : 'pend';
  const rewireNames = uniq(migCells.filter(x => REWIRE.test(x)).flatMap(x => [...x.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]*)(?![A-Za-z0-9_$.(（])/g)].map(m => m[1])));
  const rs = ok ? null : reasonOf({ rewireNames, hit, ownNames, disp: r.disp, textMig, isMig, mixedPend, mixedText, sentence: migCells.join(' | ').slice(0, 200), rule, parenNames, allNames, anchorCell, sides: [aC, aS], mentioned, cited });
  out.push({ k: r.rowKey, vol: r.volume, line: r.srcLine, at: multiByKey.get(r.rowKey).at, names: ownNames, extNames: allNames.filter(nm => /:/.test(nm)), hit, ok, ti, add: ok ? `（入口 \`${hit[0]}\`）` : '（入口名待补）', tcell: c[ti] ?? '', viaRule, viaPath: !!viaPath, extChange, extDir, restored, lgExt12, lgCls, mixedFill, mixedPend, mixedText, isMig, lgPathHit, lgOwn1: lgOwn.length === 1 ? lgOwn[0] : null, parenOnly: lgOwn.length === 1 && !hit.includes(lgOwn[0]) && parenNames.has(lgOwn[0]), disp: r.disp, sentence: migCells.join(' | ').slice(0, 260), ruleBasis: viaRule ? rule.from[hit[0]] : null,
    code: rs?.code ?? null, note: rs?.note ?? null,
    why: ok ? (viaRule ? `${rule.from[hit[0]]}` : viaPath ? viaPath : `本行原文写明 ${hit[0]}：${why1[hit[0]] ?? ''}`) : rs.note });
  // 与已封卷文落点栏标记比较（差额表用）
  const mk = (c[ti] ?? '').match(/（入口 `([^`]+)`）|（入口名待补）/);
  out[out.length - 1].mark = mk ? (mk[1] ? 'filled' : 'pending') : null;
  if (mk) {
    const oldJ = mk[1] ? `补 \`${mk[1]}\`` : '待补'; const nu = ok ? `补 \`${hit[0]}\`` : rs.code === '无入口（迁移/删除）' ? '无入口' : '待补';
    if (oldJ !== nu) diffs.push({ k: r.rowKey, vol: r.volume, line: r.srcLine, old: oldJ, nu, basis: ((ok ? (viaRule ? rule.from[hit[0]] : viaPath ? viaPath : Object.entries(why1).filter(([n]) => n === hit[0]).map(([, w]) => w).join('') || `本卷登记名 ${hit[0]} 写明`) : rs.note) + `（卷文 ${r.srcLine} 行）`).replace(/\|/g, '\\|') });
  }
}
if (ALL) {
  const byVol = new Map(); for (const r of mig.rows) if (!r.aliasOf && multiByKey.has(r.rowKey) && (!VSVOLS || VSVOLS.includes(r.volume))) { if (!byVol.has(r.volume)) byVol.set(r.volume, []); byVol.get(r.volume).push(r); }
  for (const [v, rs] of byVol) { loadVol(v); for (const r of rs) judgeRow(r); }
} else for (const r of rows) judgeRow(r);
if (MERGE) {
  // 乙-8 合并卡（李白 11-16 10:xx 改做法第 3、4 条；主会话技术裁定 B2–B4、E5）：对全书各卷落点栏一次落实——
  //   能补名的行补"（入口 `名`）"（--skip 列出的行扣下不补）；已写的"（入口名待补）"标记一律撤掉；已补行若现判不是能补名（B2：M6-41 归无入口）撤回其"（入口 `名`）"；
  //   补不出名字的行不在卷文里留标记，由本脚本生成待补名单替换 收尾待办.md "乙-8 入口名待补"段；每个改动卷追加勘误前快照、写一行封后勘误、改后覆盖上一条勘误写明的对象。
  // 参数：--batch <批次>（快照标签）、--skip 行,行（扣下）、--hold "行=原因;行=原因"（待裁行与原因）、--dry（只算不写）
  const DRYM = process.argv.includes('--dry');
  const skip = new Set((arg('--skip') ?? '').split(',').filter(Boolean));
  const hold = new Map((arg('--hold') ?? '').split(';').filter(Boolean).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
  const MARK = '（入口名待补）';
  const START = /^(?:\|\s*(?:\d+\s*\|\s*)?(?:—\s*\|\s*—\s*\|\s*)?|- |### )?封卷后勘误/;
  const rowsByFile = new Map(); for (const x of out) { const f = allFiles.find(g => g.startsWith(x.vol + '-')); if (!rowsByFile.has(f)) rowsByFile.set(f, []); rowsByFile.get(f).push(x); }
  const marked = allFiles.filter(f => readFileSync(`${DIR}/${f}`, 'utf8').includes(MARK)); for (const f of marked) if (!rowsByFile.has(f)) rowsByFile.set(f, []);
  const stat = []; const warns = [];
  for (const [f, xs] of [...rowsByFile].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const raw = readFileSync(`${DIR}/${f}`, 'utf8'); const crlf = raw.includes('\r\n'); const L = raw.replace(/\r\n/g, '\n').split('\n');
    const info = { vol: f.split('-')[0], add: [], rmPend: [], rmFilled: [] }; const handled = new Set();
    for (const x of xs) {
      let l = L[x.line - 1]; handled.add(x.line - 1);
      if (!/^\| M/.test(l)) { warns.push(`${x.k}：卷文 ${x.line} 行不是迁移行`); continue; }
      const hadPend = l.includes(MARK); l = l.split(MARK).join('');
      if (x.ok && !skip.has(x.k)) {
        const want = `（入口 \`${x.hit[0]}\`）`; const t = cells(l)[x.ti] ?? '';
        if (x.ti < 0) warns.push(`${x.k}：没有落点栏`);
        else if (!t.includes(want)) { const [, e] = cellSpan(l, x.ti); l = l.slice(0, e) + want + l.slice(e); info.add.push(x.k); }
      } else if (!x.ok && x.mark === 'filled') { l = l.replace(/（入口 `[^`]+`）/, ''); info.rmFilled.push(x.k); }
      if (hadPend) info.rmPend.push(x.k);
      L[x.line - 1] = l;
    }
    L.forEach((l, i) => { if (!handled.has(i) && /^\| M/.test(l) && l.includes(MARK)) { L[i] = l.split(MARK).join(''); info.rmPend.push(l.match(/^\| (M\S+) \|/)?.[1] ?? `行${i + 1}`); } });
    if (!info.add.length && !info.rmPend.length && !info.rmFilled.length) continue;
    info.file = f; info.L = L; info.crlf = crlf; stat.push(info);
  }
  // 快照名与"改后覆盖"对象：取该卷最后一条写了"改后覆盖"的勘误；勘误前快照名 = 改后覆盖第一项的文件名去掉 .md 加 -勘误前-<标签>
  const tagOf = v => `1116乙8-${BATCH}-${v.replace(/^卷/, '')}`;
  for (const info of stat) {
    const L = info.L; let after = null;
    for (const l of L) { if (!/封卷后勘误/.test(l)) continue; const i = l.indexOf('改后覆盖'); if (i < 0) continue; const seg = l.slice(i).split(/[）)]/)[0]; const a = [...seg.matchAll(/版本快照\/[^，、；\s）)]+?\.md/g)].map(m => m[0]); if (a.length) after = a; }
    if (!after) { warns.push(`${info.vol}：找不到"改后覆盖"对象`); continue; }
    info.after = after; info.tag = tagOf(info.vol); info.pre = after[0].replace(/\.md$/, '').replace(/-现行$/, '') + `-勘误前-${info.tag}.md`;
    let last = -1; L.forEach((l, i) => { if (START.test(l)) last = i; });
    if (last < 0) { warns.push(`${info.vol}：找不到封后勘误记录位置`); continue; }
    const parts = [];
    if (info.add.length) parts.push(`落点栏补写入口名 ${info.add.length} 行（${info.add.join('、')}；名字只取本行原文明写的，或所引规则正文里恰写出的本卷唯一入口）`);
    if (info.rmPend.length) parts.push(`撤去落点栏"（入口名待补）"标记 ${info.rmPend.length} 行（${info.rmPend.join('、')}；补不出名字的行不在卷文留标记，由脚本生成的待补名单并入 收尾待办.md "乙-8 入口名待补"段）`);
    if (info.rmFilled.length) parts.push(`撤回 ${info.rmFilled.join('、')} 的"（入口 \`名\`）"（行文写整个模块退役、名字只在括注里，归无入口；主会话技术裁定 1116 白天 B2）`);
    const text = `封卷后勘误 ${info.tag}（依据：李白 11-16 10:xx 乙-8 改做法第 3、4 条；主会话技术裁定 1116 白天 B2–B4、E5；必要理由：迁移行落点所在节登记了多个入口，卡账 entries 取不到恰一个入口，改为只补能确定的名字、不在卷文留待补标记；不升版本号；改前快照 ${'版本快照/' + info.pre}，改后覆盖 ${after.join('、')}）：${parts.join('；')}。不改规则正文`;
    const l0 = L[last];
    if (l0.startsWith('|')) {
      let e = last; while (e + 1 < L.length && L[e + 1].startsWith('|')) e++;
      const cs = l0.split(/(?<!\\)\|/);
      const cellsN = cs.slice(1, -1).map(c => (c.includes('封卷后勘误') ? ' ' + text + ' ' : /^\s*\d+\s*$/.test(c) ? ` ${+c.trim() + 1} ` : ' — '));
      L.splice(e + 1, 0, '|' + cellsN.join('|') + '|');
    } else if (l0.startsWith('- ')) L.splice(last + 1, 0, '- ' + text + '。');
    else L.splice(last + 1, 0, '', text + '。');
  }
  // 待补名单（单一名单）：脚本判定不是能补名、又不是无入口的行；扣下的行单列待裁
  const todoM = out.filter(x => x.mark !== 'filled');
  const holdRows = todoM.filter(x => hold.has(x.k)), noEntM = todoM.filter(x => !x.ok && x.code === '无入口（迁移/删除）' && !hold.has(x.k));
  const pendM = todoM.filter(x => !x.ok && x.code !== '无入口（迁移/删除）' && !hold.has(x.k));
  const canM = todoM.filter(x => x.ok && !hold.has(x.k) && !skip.has(x.k));
  const byV = new Map(); for (const x of pendM) { if (!byV.has(x.vol)) byV.set(x.vol, []); byV.get(x.vol).push(x); }
  const shortCode = c => c.replace(/（.*$/, '');
  const todo = [`## 乙-8 入口名待补（脚本生成；李白 11-16 10:xx 乙-8 改做法第 3、4 条，主会话技术裁定 1116 白天 B2–B4、E5）`, '',
    `由 脚本/全书/乙8-入口名候选.mjs --all --merge --batch ${BATCH} 生成，不手抄；卷文落点栏不再留"入口名待补"标记，补不出名字的行只在这里。候选 ${todoM.length + out.filter(x => x.mark === 'filled').length} 行里：能补名且已补进卷文 ${canM.length} 行（不在本名单）、已补过 ${out.filter(x => x.mark === 'filled').length} 行、无入口（迁移/删除）${noEntM.length} 行（单列，不算待补）、待补 ${pendM.length} 行、待裁 ${holdRows.length} 行。`, '',
    `### 待补（${pendM.length} 行；退回来源卷，由来源卷写明入口名；格式：编号（卷文行号））`, ''];
  for (const [v, xs] of byV) { const byC = new Map(); for (const x of xs) { const c = shortCode(x.code); if (!byC.has(c)) byC.set(c, []); byC.get(c).push(`${x.k}（${x.line}）`); } todo.push(`#### ${v}（${xs.length} 行）`, ...[...byC].map(([c, ks]) => `- ${c}：${ks.join('、')}`), ''); }
  const noV = new Map(); for (const x of noEntM) { if (!noV.has(x.vol)) noV.set(x.vol, []); noV.get(x.vol).push(`${x.k}（${x.line}）`); }
  todo.push(`### 无入口（迁移/删除）（${noEntM.length} 行；行文写明迁移或删除、没有明写去处，不算待补）`, '', ...[...noV].map(([v, ks]) => `- ${v}：${ks.join('、')}`), '');
  todo.push(`### 待裁（${holdRows.length} 行；合并卡扣下不补，等李白裁）`, '', ...holdRows.map(x => `- ${x.vol} ${x.k}（${x.line}）：${hold.get(x.k)}${x.ok ? `；脚本判能补 \`${x.hit[0]}\`` : `；脚本判 ${x.code}`}`), '');
  console.log(`合并${DRYM ? '（dry）' : ''}：改动卷 ${stat.length} 个；补名 ${stat.reduce((s, i) => s + i.add.length, 0)} 行；撤待补标记 ${stat.reduce((s, i) => s + i.rmPend.length, 0)} 行；撤回已补 ${stat.reduce((s, i) => s + i.rmFilled.length, 0)} 行；待补名单 ${pendM.length}、无入口 ${noEntM.length}、待裁 ${holdRows.length}`);
  for (const i of stat) console.log(`  ${i.vol}：补 ${i.add.length}、撤待补 ${i.rmPend.length}、撤回 ${i.rmFilled.length}${i.after ? `；快照 ${i.pre}；覆盖 ${i.after.join('、')}` : '（未写勘误）'}`);
  for (const w of warns) console.log('  警告：' + w);
  if (!DRYM) {
    const snapDir = `${DIR}/版本快照`;
    for (const i of stat) {
      if (!i.after || !i.pre) continue;
      const pre = `${snapDir}/${i.pre.replace(/^版本快照\//, '')}`; if (existsSync(pre)) throw new Error(`勘误前快照已存在，不覆盖：${pre}`);
      writeFileSync(pre, readFileSync(`${DIR}/${i.file}`, 'utf8'));
      const txt = i.L.join('\n').replace(/\n/g, i.crlf ? '\r\n' : '\n');
      writeFileSync(`${DIR}/${i.file}`, txt);
      for (const p of i.after) writeFileSync(`${DIR}/${p}`, txt);
    }
    const dutyF = `${DIR}/收尾待办.md`; const dRaw = readFileSync(dutyF, 'utf8'); const dCrlf = dRaw.includes('\r\n'); const D = dRaw.replace(/\r\n/g, '\n').split('\n');
    const a = D.findIndex(l => l.startsWith('## 乙-8 入口名待补')); let b = D.findIndex((l, k) => k > a && /^## /.test(l)); if (b < 0) b = D.length;
    if (a < 0) throw new Error('收尾待办里没有"乙-8 入口名待补"段');
    D.splice(a, b - a, ...todo);
    writeFileSync(dutyF, D.join('\n').replace(/\n/g, dCrlf ? '\r\n' : '\n'));
  }
  process.exit(0);
}
if (VSGEN) {
  // 脚本判定 vs 生成器落点栏取到的入口名（生成器读的是已封卷文，落点栏里已补的"（入口 `名`）"它照收）。每行差别归类：
  //   已定口径差：脚本扫整行（不限落点栏）、规则正文兜底只在脚本、B2–B4（明写多个不补、括注不算明写、先于④的明写）
  //   生成器待明天改：E1 括注（落点栏括注里的名字生成器仍收）、E2 对象不符（生成器对"（入口 名）"注免除）、E3/E4（否定词、"取卷六 x"生成器未同口径）
  const esc2 = s => String(s).replace(/\|/g, '\\|');
  const depthAt = (t, i) => { let d = 0; for (let j = 0; j < i; j++) { const ch = t[j]; if (ch === '（' || ch === '(') d++; else if ((ch === '）' || ch === ')') && d > 0) d--; } return d; };
  const onlyInParen = (t, n) => { const ms = [...t.matchAll(new RegExp('`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])', 'g'))]; return ms.length > 0 && ms.every(m => depthAt(t, m.index) > 0); };
  const E4RE = n => new RegExp('(?:取自|读|经|取|返回|给出)\\s*[：:]?\\s*' + V_RE + '(?:\\s*§[0-9.]+)*\\s*的?\\s*`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])');
  const mismatchRows = new Set(genMismatch.map(m => m.k));
  const rowsOut = []; const cnt = {}; let same = 0;
  for (const x of out) {
    const g = (genEntries[x.k] ?? []), s = x.ok ? [x.hit[0]] : [];
    if (g.length === s.length && g.every((n, i) => n === s[i])) { same++; continue; }
    const tc = (x.tcell ?? '').replace(/（入口 `[^`]+`）|（入口名待补）/g, '');
    const mk = (x.tcell ?? '').match(/（入口 `([^`]+)`）/)?.[1] ?? null;
    let cls, why;
    if (g.length && !s.length) {
      const inParen = g.every(n => onlyInParen(tc, n) && n !== mk);
      if (inParen) { cls = '生成器待明天改（E1 括注）'; why = `生成器收了落点栏括注里的 ${g.join('、')}，脚本按 ⑤ 括注不算明写`; }
      else if (mk && g.includes(mk)) { cls = '已定口径差（脚本判定与封卷文标记不同：B2–B4 / 括注 / 无入口）'; why = `封卷文落点栏标记 ${mk}；脚本判 ${x.ok ? '补 ' + x.hit[0] : x.code}（${(x.note ?? '').slice(0, 60)}）`; }
      else { cls = '已定口径差（脚本扫整行／明写多个不补）'; why = `生成器取落点栏 ${g.join('、')}；脚本判 ${x.code ?? '?'}`; }
    } else if (!g.length && s.length) {
      const n = s[0];
      if (!tc.includes('`' + n)) { cls = x.viaRule ? '已定口径差（规则正文兜底只在脚本）' : '已定口径差（脚本扫整行：落点栏没写、别栏写明）'; why = `脚本取 ${n}（${(x.why ?? '').slice(0, 80)}）；落点栏没写出`; }
      else if (mismatchRows.has(x.k)) { cls = '生成器待明天改（E2 对象不符：生成器列入口与对象不符待查）'; why = `落点栏写 ${n}，生成器因入口所属对象与本行对象不符不收`; }
      else if (E4RE(n).test(tc)) { cls = '生成器待明天改（E4 取卷X `名`）'; why = `落点栏"取/读/经 卷X \`${n}\`"，脚本按 E4 计为直接指称，生成器未带`; }
      else if (onlyInParen(tc, n)) { cls = '已定口径差（脚本扫整行：名字在落点栏括注、另栏明写）'; why = `${n} 在落点栏只在括注；脚本由别栏明写取到`; }
      else { cls = '待查'; why = `脚本补 ${n}，生成器落点栏没取到，原因未识别`; }
    } else { cls = '待查（两边取名不同）'; why = `生成器 ${g.join('、')}；脚本 ${s.join('、')}`; }
    cnt[cls] = (cnt[cls] || 0) + 1;
    rowsOut.push(`| ${x.vol} | ${x.k} | ${x.line} | ${esc2(g.join('、') || '—')} | ${esc2(s.join('、') || (x.code ?? '—'))} | ${esc2(cls)} | ${esc2(why)} |`);
  }
  const md = [`# 乙-8 脚本与生成器两边差额（${VSVOLS.join('、')}；脚本生成，勿手改）`, '',
    '依据：技术裁定 1116 白天 B1–B4、E1–E4。脚本：脚本/全书/乙8-入口名候选.mjs --vs-gen。对象：所列各卷的"一节多入口"行（共 ' + out.length + ' 行）。生成器一侧：对同一份卷文跑 gen-card-ledger.mjs 的 entryOfRow（落点栏明写且已登记的入口名，含已补"（入口 `名`）"标记）；脚本一侧：本脚本现行判定（ok 取其明写/规则正文所得的名）。只读，不改生成器与卷文。', '',
    `两边一致 ${same} 行；有差别 ${rowsOut.length} 行：${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join('；') || '无'}。`, '',
    '| 卷 | 编号 | 卷文行 | 生成器 | 脚本 | 归类 | 说明 |', '|---|---|---|---|---|---|---|', ...rowsOut, ''].join('\n');
  writeFileSync(`${DIR}/审查/脚本输出/乙8-两边差额-${VSVOLS.join('、')}.md`, md);
  console.log(`两边比对（${VSVOLS.join('、')}）：一节多入口 ${out.length} 行；一致 ${same}；有差别 ${rowsOut.length}：${JSON.stringify(cnt)}`);
  process.exit(0);
}
if (ALL) {
  const todo = out.filter(x => x.mark !== 'filled'); const filled = out.filter(x => x.mark === 'filled');
  const can = todo.filter(x => x.ok), noEnt = todo.filter(x => !x.ok && x.code === '无入口（迁移/删除）'), pend = todo.filter(x => !x.ok && x.code !== '无入口（迁移/删除）');
  const lbl = x => `${x.vol} ${x.k}`, lst = a => a.length ? '（' + a.map(lbl).join('、') + '）' : '';
  const byK = new Map(out.map(x => [x.k, x]));
  const restoredA = out.filter(x => x.restored), restoredT = restoredA.filter(x => x.mark !== 'filled');
  const ext12 = out.filter(x => x.lgExt12);
  const toNoEntFromOk = noEnt.filter(x => x.lgCls === 'ok'), toNoEntFromPend = noEnt.filter(x => x.lgCls === 'pend');
  const parenA = out.filter(x => x.parenOnly), pathW = out.filter(x => x.lgPathHit && !x.viaPath);
  const mixFill = out.filter(x => x.mixedFill && x.ok), mixFillT = mixFill.filter(x => x.mark !== 'filled'), mixPend = out.filter(x => x.mixedPend);
  const mixNoCand = pend.filter(x => x.code === '混合行：明写入口名不在该节候选');
  const byCode = {}; for (const x of pend) byCode[x.code] = (byCode[x.code] || 0) + 1;
  const volStat = new Map(); for (const x of todo) { const s = volStat.get(x.vol) || { n: 0, can: 0, noEnt: 0, pend: 0 }; s.n++; x.ok ? s.can++ : x.code === '无入口（迁移/删除）' ? s.noEnt++ : s.pend++; volStat.set(x.vol, s); }
  const esc = s => String(s).replace(/\|/g, '\\|');
  const filledChanged = diffs.filter(d => d.old.startsWith('补'));
  // 与 664151c4 那版清单（B1 之前的判定顺序与式样）比：逐行判定类别（补名/无入口/待补原因）变了几行、怎么变（技术裁定 B1、E3、E4）
  const OLD_COMMIT = '664151c4';
  const oldMd = execFileSync('git', ['-C', DIR, 'show', `${OLD_COMMIT}:docs/统一底层设计/审查/脚本输出/乙8-全书候选清单.md`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const clsOf = t => { let m; if ((m = t.match(/^能补名：`([^`]+)`/))) return `补 ${m[1]}`; if (/^无入口（迁移\/删除）/.test(t)) return '无入口'; if ((m = t.match(/^待补：([^；]+)/))) return `待补:${m[1]}`; return '?'; };
  const oldCls = new Map(); for (const l of oldMd.split('\n')) { const m = l.match(/^\| (卷\S+) \| (M\S+) \| (\d+) \| (.*) \|$/); if (m) oldCls.set(m[2], clsOf(m[4].replace(/\\\|/g, '|'))); }
  const newCls = new Map(todo.map(x => [x.k, x.ok ? `补 ${x.hit[0]}` : x.code === '无入口（迁移/删除）' ? '无入口' : `待补:${x.code}`]));
  const kind = c => (c.startsWith('补') ? '补名' : c.startsWith('无入口') ? '无入口' : '待补');
  const chg = [...newCls].filter(([k, c]) => oldCls.has(k) && oldCls.get(k) !== c);
  const trans = {}; for (const [k, c] of chg) { const t = `${kind(oldCls.get(k))}→${kind(c)}${kind(oldCls.get(k)) === kind(c) ? '（' + (kind(c) === '补名' ? '换名' : '换原因') + '）' : ''}`; trans[t] = (trans[t] || 0) + 1; }
  const noEntToFill = chg.filter(([k, c]) => oldCls.get(k) === '无入口' && c.startsWith('补'));
  const onlyOld = [...oldCls.keys()].filter(k => !newCls.has(k)), onlyNew = [...newCls.keys()].filter(k => !oldCls.has(k));
  const cmpOld = [
    `- 与 ${OLD_COMMIT} 那版清单比（判定类别变了的行；两版都在候选内的 ${[...newCls.keys()].filter(k => oldCls.has(k)).length} 行里）：变化 ${chg.length} 行；类别流向 ${Object.entries(trans).map(([k, v]) => `${k} ${v}`).join('；') || '无'}；只在旧版 ${onlyOld.length} 行、只在新版 ${onlyNew.length} 行（已补行或卡账变动）`,
    `- 其中旧版"无入口"、现改补名的行（B1：规则正文取到本卷唯一入口，${noEntToFill.length} 行）：${noEntToFill.map(([k, c]) => `${k}（${c}）`).join('、')}`];
  globalThis.__cmpOld = { chg: chg.length, trans, noEntToFill: noEntToFill.length, onlyOld: onlyOld.length, onlyNew: onlyNew.length };
  const md = [
    '# 乙-8 全书"一节多入口"候选清单（脚本生成，勿手改）', '',
    '依据：李白 11-16 10:xx 第 2、4 条（改做法②）；要点表 E3。脚本：脚本/全书/乙8-入口名候选.mjs --all。判据（李白 11-16 10:xx 三问裁定、10:12 更正）：②只管推断——本行原文明写的入口名（反引号名、调用形、直接指称；否定与括注不计，含隔字否定；本卷别卷都计）照补，一行明写两个以上不补；只有本行没明写、靠规则正文或锚点路径推时，候选才只认本卷自有入口；判定顺序（技术裁定 B1）：明写→①规则正文（落点栏引了全书唯一定义的规则号，取正文里恰写出的那一个本卷自有入口）→④（行文写明迁/删/退役/搬、处置为 delete/to_data/move_out/relocate_only，单列"无入口（迁移/删除）"）→③锚点定端（须卷文另有一行同时写明本行锚点路径、所属端与某本卷入口，恰一个才取）；混合行（迁移/删除又写改调入口）按明写补名，明写两个以上的单列"混合行待裁"；本卷名只在括注内的不算写明，进名单。只读卷文，不改任何文件。', '',
    '## 汇总', '',
    `- 候选总数（当前卡账"一节多入口"行中，落点栏尚无"（入口 \`名\`）"的行）：${todo.length}；另有 ${filled.length} 行落点栏已有"（入口 \`名\`）"，不在清单内，只做比对。`,
    `- 能补名：${can.length} 行：本行明写（不含混合行）${can.filter(x => !x.viaRule && !x.viaPath && !x.mixedFill).length}；混合行按明写补名 ${mixFillT.length}；①靠规则正文 ${can.filter(x => x.viaRule).length}；靠锚点定端 ${can.filter(x => x.viaPath).length}`,
    `- 无入口（迁移/删除）：${noEnt.length} 行（行文写明迁移或删除且没有明写去处，单列，不算待补）`,
    `- 待补（含混合行待裁）：${pend.length} 行；各原因码行数：${Object.entries(byCode).map(([k, v]) => `${k} ${v}`).join('；')}`,
    `- 混合行（行文同写迁移/删除与改调入口，李白 10:12）：按明写补名 ${mixFillT.length} 行（全书含已补行 ${mixFill.length}）${lst(mixFillT)}；混合行待裁 ${mixPend.length} 行（含已补行，逐行原句见清单）；写了改调入口但名字不在该节候选、不归无入口也不补名、单列待裁的 ${mixNoCand.length} 行${lst(mixNoCand)}（逐行原句见清单）`,
    `- 分列：恢复的行数 ${restoredA.length}（别卷明写、旧口径不补，现照明写补；其中候选行 ${restoredT.length}，已补行 ${restoredA.length - restoredT.length}）；改归无入口的行数 ${noEnt.length}（原为能补 ${toNoEntFromOk.length}，原为待补 ${toNoEntFromPend.length}，其余旧口径已是无入口 ${noEnt.length - toNoEntFromOk.length - toNoEntFromPend.length}）；括注改判行数 ${parenA.length}${lst(parenA)}；定端撤回行数 ${pathW.length}`,
    `- 原 12 行类（旧口径下去掉别卷入口后"能补变不能补"，共 ${ext12.length} 行）现状：${ext12.map(x => `${lbl(x)}→${x.ok ? '补 ' + x.hit[0] : x.code}${x.mark === 'filled' ? '（已补行' + (x.tcell.match(/（入口 `([^`]+)`）/)?.[1] === x.hit[0] ? '，一致' : '，不一致') + '）' : ''}`).join('；')}`,
    `- 已补行比对：落点栏已有"（入口 \`名\`）"的 ${filled.length} 行中，新判定与其不同的 ${filledChanged.length} 行${filledChanged.length ? '：' + filledChanged.map(d => `${d.vol} ${d.k}（${d.old}→${d.nu}）`).join('、') : ''}`,
    ...filledChanged.map(d => { const x = byK.get(d.k); return `  - ${d.vol} ${d.k}（卷文 ${d.line} 行）：${d.old}→${d.nu}；原句：${esc(x.sentence)}；落点栏：${esc(x.tcell)}`; }),
    `- 新增归无入口且旧口径为待补的行（${toNoEntFromPend.length}）：${toNoEntFromPend.map(lbl).join('、')}`,
    `- 原为能补、现改归无入口的行（${toNoEntFromOk.length}）：${toNoEntFromOk.map(lbl).join('、')}`,
    `- 括注改判行（本卷名只在括注内）：${parenA.map(lbl).join('、')}`,
    `- 定端撤回行：${pathW.map(lbl).join('、')}`,
    ...cmpOld,
    '', '按卷分布：', '', '| 卷 | 候选行 | 能补名 | 无入口（迁移/删除） | 待补 |', '|---|---|---|---|---|',
    ...[...volStat].map(([v, s]) => `| ${v} | ${s.n} | ${s.can} | ${s.noEnt} | ${s.pend} |`), '',
    '## 清单', '', '| 卷 | 迁移行号 | 卷文行 | 判定 |', '|---|---|---|---|',
    ...todo.map(x => `| ${x.vol} | ${x.k} | ${x.line} | ${x.ok ? esc(`能补名：\`${x.hit[0]}\`；依据：${x.why.replace(/^本行原文写明 [^：]+：/, '本行原文：')}（本行卷文 ${x.line} 行）`) : esc(`${x.code === '无入口（迁移/删除）' ? '' : '待补：'}${x.code}；${x.note}`)} |`), ''].join('\n');
  writeFileSync(`${DIR}/审查/脚本输出/乙8-全书候选清单.md`, md);
  console.log(`全书：候选 ${todo.length}；能补名 ${can.length}（规则正文 ${can.filter(x => x.viaRule).length}，锚点路径 ${can.filter(x => x.viaPath).length}）；无入口 ${noEnt.length}；待补 ${pend.length}；已补比对 ${filled.length} 行，变化 ${filledChanged.length}；恢复 ${restoredA.length}；改归无入口 ${noEnt.length}（原能补 ${toNoEntFromOk.length}、原待补 ${toNoEntFromPend.length}）；括注改判 ${parenA.length}；定端撤回 ${pathW.length}；混合补名 ${mixFillT.length}/待裁 ${mixPend.length}；原12类 ${ext12.length}；原因码 ${JSON.stringify(byCode)}；与 ${OLD_COMMIT} 比变化 ${chg.length} 行（${JSON.stringify(trans)}），无入口改补名 ${noEntToFill.length}`);
  process.exit(0);
}
const okN = out.filter(x => x.ok).length;
console.log(`${VOLNAME}：一节多入口 ${out.length} 行；补入口名 ${okN}；入口名待补 ${out.length - okN}`);

const lines = [
  `# 乙-8 ${VOLNAME} "一节多入口"候选清单（脚本生成，勿手改）`, '',
  `依据：李白 11-16 09:xx 第三、四条；审查/乙8-一节多入口-设计要点表.md E1–E4。脚本：脚本/全书/乙8-入口名候选.mjs ${VOLNAME}。名单为 gen-card-ledger.mjs 同口径的"一节多入口"行，共 ${out.length} 行；补入口名 ${okN} 行，入口名待补 ${out.length - okN} 行。`, '',
  '| 编号 | 卷文行 | 卷、节 | 该节候选入口 | 本行原文写出 | 处理 | 依据 |', '|---|---|---|---|---|---|---|',
  ...out.map(x => `| ${x.k} | ${x.line} | ${x.at} | ${x.names.join('、')} | ${x.hit.join('、') || '—'} | ${x.add} | ${x.why} |`), '',
];
if (process.argv.includes('--diff')) writeFileSync(`${TMP}/乙8-diff-${BATCH}-${VOLNAME}.json`, JSON.stringify({ vol: VOLNAME, diffs }, null, 1));
if (process.argv.includes('--write')) writeFileSync(`${DIR}/审查/脚本输出/乙8-${VOLNAME}-候选清单.md`, lines.join('\n'));

if (process.argv.includes('--plan')) {
  const snapDir = `${DIR}/版本快照`; const snaps = readdirSync(snapDir);
  const plan = { tag: TAG, vol: VOLNAME, file: `${DIR}/${volFile}`, edits: [], errata: null, todo: null };
  for (const x of out) {
    const l = ls[x.line - 1]; const [, e] = cellSpan(l, x.ti);
    const old = uniqueEndingAt(l, e, l.slice(e, e + 2));
    if (!old) throw new Error(`${x.k} 找不到唯一定位串`);
    plan.edits.push({ k: x.k, line: x.line, old, new: old.slice(0, old.length - l.slice(e, e + 2).length) + x.add + l.slice(e, e + 2) });
  }
  let last = -1; ls.forEach((l, i) => { if (/封卷后勘误 [0-9]{4}[A-Za-z0-9\u4e00-\u9fa5-]*（依据/.test(l) && !l.includes(TAG)) last = i; });
  // 版本标记取该卷最新的（数字加可选字母后缀，如 2f），不再只认纯数字
  const vers = snaps.map(s => s.match(new RegExp(`^${VOLNAME}-v(\\d+)([a-z]?)\\.md$`))).filter(Boolean).map(m => ({ s: m[1] + m[2], k: +m[1] * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) }));
  const ver = vers.sort((a, b) => b.k - a.k)[0].s;
  let after = null;
  for (const l of ls) { if (l.includes(TAG)) continue; const i = l.indexOf('改后覆盖'); if (/封卷后勘误/.test(l) && i >= 0) { const seg = l.slice(i).split(/[）)]/)[0]; after = [...seg.matchAll(/版本快照\/[^，、；\s）)]+?\.md/g)].map(m => m[0]); } }
  if (!after?.length) after = [`版本快照/${VOLNAME}-v${ver}.md`];
  const fill = out.filter(x => x.ok), pend = out.filter(x => !x.ok);
  const main = `封卷后勘误 ${TAG}（依据：李白 11-16 03:5x ④、09:xx 第三条、乙-8；必要理由：迁移行落点所在节登记了多个入口，卡账 entries 取不到恰一个入口；不升版本号；改前快照 版本快照/${VOLNAME}-v${ver}-勘误前-${TAG}.md，改后覆盖 ${after.join('、')}）`;
  const detail = `落点栏补写入口名 ${fill.length} 行（${fill.map(x => x.k + x.add).join('、') || '无'}；入口名只取本行原文已写明的、在该节 §3 登记的那一个）；本行原文没写或写出多个候选、落点栏加"（入口名待补）"的 ${pend.length} 行（${pend.map(x => x.k).join('、') || '无'}），退回来源卷，列入 收尾待办.md "乙-8 入口名待补"段；逐行依据见 审查/脚本输出/乙8-${VOLNAME}-候选清单.md，脚本 脚本/全书/乙8-入口名候选.mjs。不改规则正文`;
  const L = ls[last];
  const c = cells(L); const k = c.findIndex(x => /封卷后勘误/.test(x));
  const cs = c.map((x, i) => i === k ? main + '：' + detail : x);
  plan.errata = { afterLine: last + 1, ver, after, anchorOld: uniqueEndingAt(L, L.length, '', 20), row: '| ' + cs.join(' | ') + ' |' };
  // 待办按"卷、节 + 候选入口集合"成组列行，避免同一候选串重复写
  const groups = new Map(); for (const x of pend) { const g = `${x.at}（候选 ${x.names.join('、')}）`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); }
  plan.todo = `- ${VOLNAME}（${pend.length} 行；${TAG}；退回来源卷 ${VOLNAME}，由来源卷写明入口名；本行原文没写出任何候选的不再逐行注原因，写出多个的另注）：\n${[...groups].map(([g, xs]) => `  - ${g}：${xs.map(x => x.k + (x.hit.length > 1 ? `（写出多个：${x.hit.join('、')}）` : '')).join('、')}`).join('\n')}`;
  writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 1));
  console.log(`plan：落点栏 ${plan.edits.length} 处；勘误接在第 ${plan.errata.afterLine} 行后；改后覆盖 ${after.join('、')}`);
}
if (process.argv.includes('--print')) {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  for (const e of plan.edits) console.log(`${e.line}\t${e.old}\t⟶\t${e.new}`);
  console.log(`勘误 行${plan.errata.afterLine}\nROW\t${plan.errata.row}\nTODO\t${plan.todo}`);
}
const snap = arg('--snapshot');
if (snap === 'pre') {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  const to = `${DIR}/版本快照/${VOLNAME}-v${plan.errata.ver}-勘误前-${plan.tag}.md`; writeFileSync(to, readFileSync(plan.file, 'utf8')); console.log(`pre ${to}`);
}
if (snap === 'post') {
  const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'));
  for (const p of plan.errata.after) { writeFileSync(`${DIR}/${p}`, readFileSync(plan.file, 'utf8')); console.log(`post ${p}`); }
}
