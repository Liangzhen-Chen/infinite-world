// 乙-8（李白 11-16 03:5x ④、09:xx 第三四条；要点表 审查/乙8-一节多入口-设计要点表.md E1–E6）：迁移行落点栏写明入口名的候选清单与编辑计划。
// 确定性；不按行号、条目号、卷名特判；只读卷文与现有卡账生成器的算法。
// 名单（E1）：用 gen-card-ledger.mjs 同一份判定（namesInSection，一节正文里列出的入口名多于一个）得到"一节多入口"行及该节候选入口名。
//   做法：把生成器源码读进来，换掉写文件、追加一行转储 entryMulti，存成同目录的临时模块跑一遍后删除——不改生成器文件，也不写卡账输出。
// 判定（E2/E3）：候选名只在本行原文（除编号栏外的各栏：落点、做什么、去处、锚点等）里按标识符边界查；
//   本行原文恰写出候选中的一个 → 落点栏补"（入口 `名`）"；写出多个、一个都没写 → 补"（入口名待补）"，不推定、不按语义猜。
// 用法：node 乙8-入口名候选.mjs <卷名> [--write] [--plan] [--diff] [--batch <批次>]
//   --write 写 审查/脚本输出/乙8-<卷名>-候选清单.md；--plan 写 F:/dnd-tmp/乙8-<批次>-<卷名>-plan.json（落点栏每处的唯一定位串、勘误行、待办段）；勘误标签、快照名与差额中间文件都带批次。
//   --snapshot pre|post：pre 复制卷文到 版本快照/<卷>-v<N>-勘误前-<标签>.md（不覆盖），post 照该卷上一条勘误的"改后覆盖"对象写现卷文。
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
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
const ALL = process.argv[2] === '--all';
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
for (const m of ['./object-rules.mjs', './id-defs.mjs']) {
  if (!src.includes(`'${m}'`)) throw new Error(`生成器 import ${m} 变了，脚本需同步`);
  src = src.replace(`'${m}'`, JSON.stringify(new URL(`file:///${GEN_DIR}/${m.slice(2)}`).href));
}
const impLine = "import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';";
if (!src.includes(impLine)) throw new Error('生成器 import 行变了，脚本需同步');
src = src.replace(impLine, "import { readFileSync, readdirSync, writeFileSync as __wfs, statSync } from 'node:fs';\nconst writeFileSync = (p, d) => { if (String(p).replace(/\\\\/g, '/').includes('/审查/脚本输出/')) return; return __wfs(p, d); };");
src += `\n__wfs(${JSON.stringify(dumpPath)}, JSON.stringify(entryMulti));\n`;
writeFileSync(tmpMod, src);
try { execFileSync(process.execPath, [tmpMod], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); }
finally { try { unlinkSync(tmpMod); } catch {} }
let multi; try { multi = JSON.parse(readFileSync(dumpPath, 'utf8')); } finally { try { unlinkSync(dumpPath); } catch {} } // [{k, at, names}] names 里别卷的写成 "卷X:名"
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
const SEE = new RegExp('见\\s*' + V_RE + '(?:\\s*§[0-9.]+)*', 'g'); // "，见卷X"只当出处标注（09:xx 第 3 条）
const DELIM = new Set(['，', '。', '；', ';', '\n']);
const CONJ = /`[A-Za-z_$][A-Za-z0-9_$]*[^`]*`\s*[、与和及]\s*$/; // 并列的前一项（各计一次）
const TRIG = /(取自|读|经|取|返回|给出)\s*[：:]?\s*$/; // 名字前的触发词（"读自"不计；名字后裸"返回"计、裸"给出"暂不计）
const NEGV = /(不再|不得|不会|无需|不|未|无|勿|别)\s*再?\s*(调用|调|经由|经|读|取自|取|返回|给出)?\s*[：:]?\s*$/; // 名字前紧挨否定（含"不调/不经/不读 x"）
// 隔字否定（李白 09:3x）：否定词与名字同一分句、且管着带名字的动作（否定词与名字之间只隔副词、动词、"卷X的"、"入口"一类）才算否定；
// "不只/不光/不仅/不单 调 x"不是否定；"不调 y，改调 x"跨分句、"不调 y 改调 x"中间隔着别的名字，都不计否定。
const NEG_WORD = /(不再|不得|不会|不必|不能|不可|无需|不用|不要|不|未|无|勿|别)(?!只|光|仅|单|止|但)/g;
const NEG_TAIL = /^\s*(?:再|必|要|用|直接|去|可|另|单独|自行|重复|重新|同时|仍|也|都|能|应|还)*\s*(?:调用|调|经由|经|读取|读|取自|取|返回|给出|查|走|访问|拿|用)?\s*[：:]?\s*(?:卷[零一二三四五六七八九十]+[b甲乙]?(?:\s*§[0-9.]+)*\s*的?\s*)?(?:各?卷?登记的|登记的|对外|只读)?\s*(?:入口|函数)?\s*[：:]?\s*$/;
function negated(pre) {
  for (const m of pre.matchAll(NEG_WORD)) if (NEG_TAIL.test(pre.slice(m.index + m[0].length))) return true;
  return false;
}
const SUFFIX =/^(族|角色|字段|列|键|代号|词表|条目)/;
const FILE_EXT = /^\.(?:mjs|cjs|js|ts|json|md|tsv|txt)\b/;
// isExt=false：本卷登记名，行内带反引号写出即计；isExt=true：别卷登记名，须调用形/分句明说调用或入口/直接指称
function nameHit(n, isExt, cellsText) {
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
      let pre = cell.slice(st, m.index).replace(/\s+$/, ''); while (CONJ.test(pre)) pre = pre.replace(CONJ, '').replace(/\s+$/, '');
      if (NEGV.test(pre) || negated(pre)) continue; // 否定句：所有计入路径统一不计
      if (!isExt) return `本卷登记名 ${n} 写明`;
      if (call) return `调用形 \`${n}${m[1].slice(0, 1)}…\``;
      if (/调|入口/.test(clause)) return `分句「${clause.trim()}」明说调用/入口`;
      if (depth[m.index] !== 0) continue; // 括注内的直接指称不计
      const t = pre.match(TRIG);
      const aft = cell.slice(end, end + 5).replace(/\s/g, '');
      if (t) return `直接指称「${t[1]} \`${n}\`」（${clause.trim()}）`;
      if (/^(的结果|的返回|返回的|给出的|返回)/.test(aft)) return `直接指称「\`${n}\` ${aft}」（${clause.trim()}）`;
    }
  }
  return null;
}
const diffs = [];
const out = [];
const sideOf = n => { // 本卷候选名登记在服务端还是客户端：看本卷卷文里以该名起首的登记行所写文件路径（extension/ 为客户端，server-plugin/、output-gate/ 为服务端），两边都有或都没有则不分
  let sv = 0, cl = 0; for (const l of ls) if (new RegExp('^\\|\\s*`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])').test(l)) { if (/server-plugin\/|output-gate\//.test(l)) sv++; if (/extension\//.test(l)) cl++; }
  return sv && !cl ? 'S' : cl && !sv ? 'C' : null;
};
// 原因码（待补原因分类；只依原文与处置栏，不推定）
// 无入口（迁移/删除）单列一类，不算待补（05aad804 第 4 条）；其余为待补原因
function reasonOf(ctx) {
  const { hit, ownNames, disp, textMig, rule, parenNames, allNames, sides, sideMapOk, cited } = ctx;
  if (hit.length > 1) return { code: '多候选', note: `本行写出多个本卷入口：${hit.join('、')}` };
  if (['delete', 'to_data', 'move_out', 'relocate_only'].includes(disp) && textMig) return { code: '无入口（迁移/删除）', note: `处置 ${disp}，行文写明迁移或删除` };
  const paren = allNames.map(nm => nm.replace(/^.*:/, '')).filter(n => parenNames.has(n));
  if (paren.length) return { code: '仅括注', note: `候选只在括注内写出：${paren.join('、')}（括注不算写明）` };
  if (!ownNames.length) return { code: '无本卷自有候选', note: '该节候选全是别卷只读入口，本卷没有自有入口（别卷入口不计）' };
  if (cited.length && ownNames.length > 1 && !(sides[0] !== sides[1])) return { code: '规则正文无唯一入口', note: `所引 ${cited.join('、')} 的规则正文里本卷入口${rule.multi.length ? '写出多个：' + rule.multi.join('、') : '一个也没写'}，本行也没写` };
  if (sides[0] !== sides[1] && ownNames.length > 1) {
    const want = sides[0] ? 'C' : 'S';
    const same = ownNames.filter(n => sideOf(n) === want);
    return { code: '入口分端需锚点路径区分', note: `锚点在${sides[0] ? 'extension/（客户端）' : 'server-plugin/ 或 output-gate/（服务端）'}；${!sideMapOk[want === 'C' ? 0 : 1] ? '卷文没有写明该路径归哪一端；' : ''}该端本卷入口登记行写明的有 ${same.length} 个${same.length ? '：' + same.join('、') : ''}，不能唯一定到一个` };
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
  const allNames = names; const ownNames = names.filter(nm => !/:/.test(nm));
  const hitAll = allNames.filter(nm => nameHit(nm.replace(/^.*:/, ''), /:/.test(nm), bodyCells)).map(nm => nm.replace(/^.*:/, ''));
  const hit = ownNames.filter(nm => {
    const w = nameHit(nm, false, bodyCells); if (w) why1[nm] = w; return !!w;
  });
  const extChange = (hitAll.length === 1 ? hitAll[0] : null) !== (hit.length === 1 ? hit[0] : null);
  const extDir = hitAll.length === 1 && hit.length !== 1 ? '能补变不能补' : hit.length === 1 && hitAll.length !== 1 ? '不能补变能补' : '补的名字变了';
  // 规则正文兜底（李白 10:xx 主因①）：本行自身一个候选都没写出、落点栏引了全书唯一定义的规则号时，
  // 到这些规则正文里按同一明写判据找；恰写出该节候选之一则取它，多个或没有则不取
  const tcellRaw = (c[ti] ?? '').replace(/（入口 `[^`]+`）|（入口名待补）/g, '');
  const cited = uniq([...tcellRaw.matchAll(new RegExp(RID + '(?![0-9a-z.])', 'g'))].map(m => m[0])).filter(id => ruleDefs.get(id)?.length === 1);
  const rule = { cited, multi: [], from: {} };
  if (!hit.length && cited.length) {
    for (const id of cited) {
      const rc = ruleBodyCells(ruleDefs.get(id)[0]);
      for (const n of ownNames) { const w = nameHit(n, false, rc); if (w) { if (!rule.multi.includes(n)) rule.multi.push(n); { const d = ruleDefs.get(id)[0]; const at = d.body.findIndex(bl => bl.includes('`' + n)); rule.from[n] = `规则正文 ${id}（${d.f.split('-')[0]} 第 ${d.i + 1 + Math.max(at, 0)} 行）：${w}`; } } }
    }
  }
  let viaRule = !hit.length && rule.multi.length === 1;
  if (viaRule) hit.push(rule.multi[0]);
  // 服务端/客户端（05aad804 第 3 条）：本行没写出候选、规则正文也取不到时，按锚点路径定端；
  // 路径与端的对应必须是卷文自己写明的（卷文有行同时写 extension/ 与客户端、server-plugin/ 或 output-gate/ 与服务端；候选的端取其登记行所写路径），且该端恰一个本卷入口才取
  let viaPath = null;
  const anchorI = head.map(strip).findIndex(x => /锚点|旧物|来源|路径/.test(x));
  const anchorCell = anchorI >= 0 ? (c[anchorI] ?? '') : c.join(' ');
  // 明写对应的句式："客户端入口：`extension/…`"、"`extension/…`（归/属于/是 客户端）"，服务端同
  const mapRe = (side, dirs) => new RegExp(`${side}[^，。；\`|]{0,6}[：:]\\s*\`?(?:${dirs})|(?:${dirs})[^，。；|]{0,40}[（(]?(?:归|属于|属|是|为)${side}`);
  const sideMap = { C: ls.findIndex(x => mapRe('客户端', 'extension\\/').test(x)), S: ls.findIndex(x => mapRe('服务端', 'server-plugin\\/|output-gate\\/').test(x)) };
  const aC = /extension\//.test(anchorCell), aS = /server-plugin\/|output-gate\//.test(anchorCell);
  if (!hit.length && !viaRule && ownNames.length > 1 && aC !== aS) {
    const want = aC ? 'C' : 'S';
    const same = ownNames.filter(n => sideOf(n) === want);
    if (sideMap[want] >= 0 && same.length === 1) { hit.push(same[0]); viaPath = `锚点路径${aC ? 'extension/' : 'server-plugin/ 或 output-gate/'}，卷文第 ${sideMap[want] + 1} 行写明归${aC ? '客户端' : '服务端'}，该端本卷入口只有 ${same[0]}（登记行写明路径）`; }
  }
  const ok = hit.length === 1;
  const mentionRe = n => new RegExp('`' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])[^`]*`', 'g');
  const parenNames = new Set(), mentioned = new Set();
  for (const cell of bodyCells) for (const nm of names) {
    const n = nm.replace(/^.*:/, '');
    for (const m of cell.matchAll(mentionRe(n))) {
      mentioned.add(n); let d = 0; for (let i = 0; i < m.index; i++) { const ch = cell[i]; if (ch === '（' || ch === '(') d++; else if ((ch === '）' || ch === ')') && d > 0) d--; }
      if (d > 0) parenNames.add(n);
    }
  }
  // 行文本身写明是迁移或删除（只看处置值不够）：除编号栏、落点对象栏、处置值栏外的各栏里出现迁移/删除字样
  const textMig = bodyCells.filter(x => strip(x) !== r.disp).some(x => /迁移|迁出|迁入|删除|删掉|搬出/.test(x));
  const rs = ok ? null : reasonOf({ hit, ownNames, disp: r.disp, textMig, rule, parenNames, allNames, anchorCell, sides: [aC, aS], sideMapOk: [sideMap.C >= 0, sideMap.S >= 0], mentioned, cited });
  out.push({ k: r.rowKey, vol: r.volume, line: r.srcLine, at: multiByKey.get(r.rowKey).at, names: ownNames, extNames: allNames.filter(nm => /:/.test(nm)), hit, ok, ti, add: ok ? `（入口 \`${hit[0]}\`）` : '（入口名待补）', tcell: c[ti] ?? '', viaRule, viaPath: !!viaPath, extChange, extDir, ruleBasis: viaRule ? rule.from[hit[0]] : null,
    code: rs?.code ?? null, note: rs?.note ?? null,
    why: ok ? (viaRule ? `${rule.from[hit[0]]}` : viaPath ? viaPath : `本行原文写明 ${hit[0]}：${why1[hit[0]] ?? ''}`) : rs.note });
  // 与已封卷文落点栏标记比较（差额表用）
  const mk = (c[ti] ?? '').match(/（入口 `([^`]+)`）|（入口名待补）/);
  out[out.length - 1].mark = mk ? (mk[1] ? 'filled' : 'pending') : null;
  if (mk) {
    const oldJ = mk[1] ? `补 \`${mk[1]}\`` : '待补'; const nu = ok ? `补 \`${hit[0]}\`` : '待补';
    if (oldJ !== nu) diffs.push({ k: r.rowKey, vol: r.volume, line: r.srcLine, old: oldJ, nu, basis: ((ok ? (viaRule ? rule.from[hit[0]] : viaPath ? viaPath : Object.entries(why1).filter(([n]) => n === hit[0]).map(([, w]) => w).join('') || `本卷登记名 ${hit[0]} 写明`) : rs.note) + `（卷文 ${r.srcLine} 行）`).replace(/\|/g, '\\|') });
  }
}
if (ALL) {
  const byVol = new Map(); for (const r of mig.rows) if (!r.aliasOf && multiByKey.has(r.rowKey)) { if (!byVol.has(r.volume)) byVol.set(r.volume, []); byVol.get(r.volume).push(r); }
  for (const [v, rs] of byVol) { loadVol(v); for (const r of rs) judgeRow(r); }
} else for (const r of rows) judgeRow(r);
if (ALL) {
  const todo = out.filter(x => x.mark !== 'filled'); const filled = out.filter(x => x.mark === 'filled');
  const can = todo.filter(x => x.ok), noEnt = todo.filter(x => !x.ok && x.code === '无入口（迁移/删除）'), pend = todo.filter(x => !x.ok && x.code !== '无入口（迁移/删除）');
  const extCan2No = out.filter(x => x.extChange && x.extDir === '能补变不能补'), extNo2Can = out.filter(x => x.extChange && x.extDir === '不能补变能补'), extOther = out.filter(x => x.extChange && x.extDir === '补的名字变了');
  const byCode = {}; for (const x of pend) byCode[x.code] = (byCode[x.code] || 0) + 1;
  const volStat = new Map(); for (const x of todo) { const s = volStat.get(x.vol) || { n: 0, can: 0, noEnt: 0, pend: 0 }; s.n++; x.ok ? s.can++ : x.code === '无入口（迁移/删除）' ? s.noEnt++ : s.pend++; volStat.set(x.vol, s); }
  const esc = s => String(s).replace(/\|/g, '\\|');
  const filledChanged = diffs.filter(d => d.old.startsWith('补'));
  const md = [
    '# 乙-8 全书"一节多入口"候选清单（脚本生成，勿手改）', '',
    '依据：李白 11-16 10:xx 第 2、4 条（改做法②）；要点表 E3。脚本：脚本/全书/乙8-入口名候选.mjs --all。判据：本行原文明写（反引号名、调用形、直接指称；否定与括注不计，含隔字否定）；只认本卷自有入口，别卷只读入口不计入候选（李白 05aad804 第 2 条）；落点栏引了全书唯一定义的规则号且本行没写出任何本卷入口时，取规则正文里恰写出的那一个本卷入口（零个或多个不取）；本行没写出时，锚点路径所属端（须卷文写明路径归哪一端）下恰一个本卷入口才取；行文写明迁移或删除的行单列"无入口（迁移/删除）"，不算待补；候选只在括注内的进名单。只读卷文，不改任何文件。', '',
    '## 汇总', '',
    `- 候选总数（当前卡账"一节多入口"行中，落点栏尚无"（入口 \`名\`）"的行）：${todo.length}；另有 ${filled.length} 行落点栏已有"（入口 \`名\`）"，不在清单内，只做比对。`,
    `- 能补名：${can.length} 行：本行原文明写 ${can.filter(x => !x.viaRule && !x.viaPath).length}；①靠规则正文新增 ${can.filter(x => x.viaRule).length}；靠锚点路径定端 ${can.filter(x => x.viaPath).length}`,
    `- ④无入口（迁移/删除）：${noEnt.length} 行（行文写明迁移或删除，单列，不算待补）`,
    `- 待补：${pend.length} 行；各原因码行数：${Object.entries(byCode).map(([k, v]) => `${k} ${v}`).join('；')}`,
    `- ②去掉别卷只读入口（只认本卷自有入口）后，按本行原文判定有变化的行（全书 ${out.length} 行内，含已补行）：原能补、现不能补 ${extCan2No.length} 行${extCan2No.length ? '（' + extCan2No.map(x => x.vol + ' ' + x.k).join('、') + '）' : ''}；原不能补、现能补 ${extNo2Can.length} 行${extNo2Can.length ? '（' + extNo2Can.map(x => x.vol + ' ' + x.k).join('、') + '）' : ''}；补的名字变了 ${extOther.length} 行${extOther.length ? '（' + extOther.map(x => x.vol + ' ' + x.k).join('、') + '）' : ''}`,
    `- 已补行比对：落点栏已有"（入口 \`名\`）"的 ${filled.length} 行中，新判定与其不同的 ${filledChanged.length} 行${filledChanged.length ? '：' + filledChanged.map(d => `${d.vol} ${d.k}（${d.old}→${d.nu}）`).join('、') : ''}`,
    '', '按卷分布：', '', '| 卷 | 候选行 | 能补名 | 无入口（迁移/删除） | 待补 |', '|---|---|---|---|---|',
    ...[...volStat].map(([v, s]) => `| ${v} | ${s.n} | ${s.can} | ${s.noEnt} | ${s.pend} |`), '',
    '## 清单', '', '| 卷 | 迁移行号 | 卷文行 | 判定 |', '|---|---|---|---|',
    ...todo.map(x => `| ${x.vol} | ${x.k} | ${x.line} | ${x.ok ? esc(`能补名：\`${x.hit[0]}\`；依据：${x.why.replace(/^本行原文写明 [^：]+：/, '本行原文：')}（本行卷文 ${x.line} 行）`) : esc(`${x.code === '无入口（迁移/删除）' ? '' : '待补：'}${x.code}；${x.note}`)} |`), ''].join('\n');
  writeFileSync(`${DIR}/审查/脚本输出/乙8-全书候选清单.md`, md);
  console.log(`全书：候选 ${todo.length}；能补名 ${can.length}（规则正文 ${can.filter(x => x.viaRule).length}，锚点路径 ${can.filter(x => x.viaPath).length}）；无入口 ${noEnt.length}；待补 ${pend.length}；已补比对 ${filled.length} 行，变化 ${filledChanged.length}；去别卷入口变化 能补→不能 ${extCan2No.length} / 不能→能补 ${extNo2Can.length} / 改名 ${extOther.length}；原因码 ${JSON.stringify(byCode)}`);
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
