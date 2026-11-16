// 乙-8（李白 11-16 03:5x ④、09:xx 第三四条；要点表 审查/乙8-一节多入口-设计要点表.md E1–E6）：迁移行落点栏写明入口名的候选清单与编辑计划。
// 确定性；不按行号、条目号、卷名特判；只读卷文与现有卡账生成器的算法。
// 名单（E1）：用 gen-card-ledger.mjs 同一份判定（namesInSection，一节正文里列出的入口名多于一个）得到"一节多入口"行及该节候选入口名。
//   做法：把生成器源码读进来，换掉写文件、追加一行转储 entryMulti，存成同目录的临时模块跑一遍后删除——不改生成器文件，也不写卡账输出。
// 判定（E2/E3）：候选名只在本行原文（除编号栏外的各栏：落点、做什么、去处、锚点等）里按标识符边界查；
//   本行原文恰写出候选中的一个 → 落点栏补"（入口 `名`）"；写出多个、一个都没写 → 补"（入口名待补）"，不推定、不按语义猜。
// 用法：node 乙8-入口名候选.mjs <卷名> [--write] [--plan]
//   --write 写 审查/脚本输出/乙8-<卷名>-候选清单.md；--plan 写 F:/dnd-tmp/乙8-<卷名>-plan.json（落点栏每处的唯一定位串、勘误行、待办段）。
//   --snapshot pre|post：pre 复制卷文到 版本快照/<卷>-v<N>-勘误前-<标签>.md（不覆盖），post 照该卷上一条勘误的"改后覆盖"对象写现卷文。
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const DIR = `${HERE}/../..`;
const VOLNAME = process.argv[2];
if (!VOLNAME || VOLNAME.startsWith('--')) throw new Error('用法：node 乙8-入口名候选.mjs <卷名> [--write] [--plan]');
const TAG = '1116乙8-' + VOLNAME.replace(/^卷/, '');
const TMP = 'F:/dnd-tmp';
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const uniq = a => [...new Set(a)];
const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };

// ---- 取"一节多入口"清单与候选名（生成器同口径）----
const genPath = `${HERE}/../卷十一/gen-card-ledger.mjs`;
const tmpMod = `${HERE}/../卷十一/.乙8-gen-tmp.mjs`;
const dumpPath = `${TMP}/乙8-multi.json`;
let src = readFileSync(genPath, 'utf8');
const impLine = "import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';";
if (!src.includes(impLine)) throw new Error('生成器 import 行变了，脚本需同步');
src = src.replace(impLine, "import { readFileSync, readdirSync, writeFileSync as __wfs, statSync } from 'node:fs';\nconst writeFileSync = (p, d) => { if (String(p).replace(/\\\\/g, '/').includes('/审查/脚本输出/')) return; return __wfs(p, d); };");
src += `\n__wfs(${JSON.stringify(dumpPath)}, JSON.stringify(entryMulti));\n`;
writeFileSync(tmpMod, src);
try { execFileSync(process.execPath, [tmpMod], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }); }
finally { try { unlinkSync(tmpMod); } catch {} }
const multi = JSON.parse(readFileSync(dumpPath, 'utf8')); // [{k, at, names}] names 里别卷的写成 "卷X:名"
const multiByKey = new Map(); for (const x of multi) if (!multiByKey.has(x.k)) multiByKey.set(x.k, x);

const mig = JSON.parse(readFileSync(`${DIR}/脚本/卷十一/migrows-input.json`, 'utf8'));
const rows = mig.rows.filter(r => !r.aliasOf && r.volume === VOLNAME && multiByKey.has(r.rowKey));
const volFile = readdirSync(DIR).find(f => f.startsWith(VOLNAME + '-') && f.endsWith('.md'));
const ls = readFileSync(`${DIR}/${volFile}`, 'utf8').split(/\r?\n/);
const txt = ls.join('\n');

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
const mentions = (text, name) => new RegExp('(?<![A-Za-z0-9_$.])' + name.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])').test(text);

const out = [];
for (const r of rows) {
  const l = ls[r.srcLine - 1]; const c = cells(l); const head = headOf(r.srcLine);
  const ti = tgtCol(head);
  const names = multiByKey.get(r.rowKey).names; // "卷X:名" 或 "名"
  // 本行原文：除编号栏（第 0 栏）外的各栏（落点、做什么、去处、锚点等所写的）；落点对象栏是对象代号不是入口名，不计
  const objI = head.map(strip).findIndex(x => /落点对象/.test(x));
  const body = c.filter((x, i) => i !== 0 && i !== objI).join(' | ');
  // 别卷登记的候选（"卷X:名"）与生成器对外卷登记名的口径一致：本行原文写成调用形"`名(…)`"或写出该卷卷名才算明写，只是同名的普通词不算；
  // 名字后紧跟"族、角色、字段、列、键、代号、词表"一类的，不计（同生成器）
  const hit = names.filter(nm => {
    const n = nm.replace(/^.*:/, ''); if (!mentions(body, n)) return false;
    const m = body.match(new RegExp('(?<![A-Za-z0-9_$.])' + n.replace(/\$/g, '\\$') + '(?![A-Za-z0-9_$])`?\\s*(.{0,2})'));
    if (m && /^(族|角色|字段|列|键|代号|词表)/.test(m[1])) return false;
    if (!/:/.test(nm)) return true;
    const vol = nm.slice(0, nm.indexOf(':'));
    return new RegExp('`' + n.replace(/\$/g, '\\$') + '\\(').test(body) || body.includes(vol);
  }).map(nm => nm.replace(/^.*:/, ''));
  const ok = hit.length === 1;
  out.push({ k: r.rowKey, line: r.srcLine, at: multiByKey.get(r.rowKey).at, names, hit, ok, ti, add: ok ? `（入口 \`${hit[0]}\`）` : '（入口名待补）', tcell: c[ti] ?? '',
    why: ok ? `本行原文写明 ${hit[0]}` : hit.length ? `本行原文写出多个候选：${hit.join('、')}` : '本行原文没写出任何候选入口名' });
}
const okN = out.filter(x => x.ok).length;
console.log(`${VOLNAME}：一节多入口 ${out.length} 行；补入口名 ${okN}；入口名待补 ${out.length - okN}`);

const lines = [
  `# 乙-8 ${VOLNAME} "一节多入口"候选清单（脚本生成，勿手改）`, '',
  `依据：李白 11-16 09:xx 第三、四条；审查/乙8-一节多入口-设计要点表.md E1–E4。脚本：脚本/全书/乙8-入口名候选.mjs ${VOLNAME}。名单为 gen-card-ledger.mjs 同口径的"一节多入口"行，共 ${out.length} 行；补入口名 ${okN} 行，入口名待补 ${out.length - okN} 行。`, '',
  '| 编号 | 卷文行 | 卷、节 | 该节候选入口 | 本行原文写出 | 处理 | 依据 |', '|---|---|---|---|---|---|---|',
  ...out.map(x => `| ${x.k} | ${x.line} | ${x.at} | ${x.names.join('、')} | ${x.hit.join('、') || '—'} | ${x.add} | ${x.why} |`), '',
];
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
  const vers = snaps.map(s => s.match(new RegExp(`^${VOLNAME}-v(\\d+)\\.md$`))).filter(Boolean).map(m => +m[1]);
  const ver = Math.max(...vers);
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
  writeFileSync(`${TMP}/乙8-${VOLNAME}-plan.json`, JSON.stringify(plan, null, 1));
  console.log(`plan：落点栏 ${plan.edits.length} 处；勘误接在第 ${plan.errata.afterLine} 行后；改后覆盖 ${after.join('、')}`);
}
if (process.argv.includes('--print')) {
  const plan = JSON.parse(readFileSync(`${TMP}/乙8-${VOLNAME}-plan.json`, 'utf8'));
  for (const e of plan.edits) console.log(`${e.line}\t${e.old}\t⟶\t${e.new}`);
  console.log(`勘误 行${plan.errata.afterLine}\nROW\t${plan.errata.row}\nTODO\t${plan.todo}`);
}
const snap = arg('--snapshot');
if (snap === 'pre') {
  const plan = JSON.parse(readFileSync(`${TMP}/乙8-${VOLNAME}-plan.json`, 'utf8'));
  const to = `${DIR}/版本快照/${VOLNAME}-v${plan.errata.ver}-勘误前-${plan.tag}.md`; writeFileSync(to, readFileSync(plan.file, 'utf8')); console.log(`pre ${to}`);
}
if (snap === 'post') {
  const plan = JSON.parse(readFileSync(`${TMP}/乙8-${VOLNAME}-plan.json`, 'utf8'));
  for (const p of plan.errata.after) { writeFileSync(`${DIR}/${p}`, readFileSync(plan.file, 'utf8')); console.log(`post ${p}`); }
}
