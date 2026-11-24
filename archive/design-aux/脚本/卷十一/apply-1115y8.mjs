// 乙-1/乙-4 补卡 1115y8：照 chk-1115-y5 单核三项（审查/乙阶段修订批-单核.md）改。在 1115y7 改完的现行卷文上动手，确定性。
// 一、M13-23 的子行编号写成统一写法：原编号一行作汇总别名，子行 a b c（删去 1115y5 脚本里按行号的特判）；
// 二、卷二十九里对象写 display、锚点却全在 server-plugin 下的行，对象改 outputGate（整类核，不只 M29-4、M29-21、M29-28）；
// 三、M1-7 的别名只覆盖部分锚点，拆子行：覆盖部分写"同 M27-6""同 M27-7"，其余按 16:05 总则取对象，理由栏删去 kernel 说法。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/`/g, '').trim();
function columns(head) {
  const h = head.map(strip); const pick = p => h.findIndex(p);
  const obj = pick(x => /落点对象/.test(x));
  const disp = (() => { const a = pick(x => /mig_disp/.test(x)); return a >= 0 ? a : pick(x => x === '处置'); })();
  const tgt = (() => { const a = pick(x => /落点/.test(x) && !/落点对象/.test(x)); if (a >= 0) return a; const b = pick(x => x === '对应 §'); return b >= 0 ? b : pick(x => x === '去向'); })();
  const why = pick(x => x === '理由');
  return { obj, disp, tgt, why };
}
const files = readdirSync(DIR).filter(f => /^卷.+\.md$/.test(f)).sort();
const FL = new Map(), where = new Map();
for (const f of files) {
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
const objCell = (orig, v) => (orig.includes('`') ? ` \`${v}\` ` : ` ${v} `);
const edits = new Map(); const log = [];
const lineOf = k => { const w = where.get(k); if (!w) throw new Error('找不到行 ' + k); return { w, cs: FL.get(w.file)[w.idx].split(/(?<!\\)\|/) }; };
const push = (w, lines) => (edits.get(w.file) ?? edits.set(w.file, []).get(w.file)).push({ idx: w.idx, lines });
const alias = (a, c, tag) => { for (const i of [c.disp, c.tgt, c.obj]) a[i + 1] = ` 同 ${tag} `; };

// ---- 一：M13-23 子行编号统一写法：汇总别名行 M13-23，子行 a b c ----
{ const keys = ['M13-23', 'M13-23b', 'M13-23c']; const ls = keys.map(lineOf);
  const { w } = ls[0], c = w.col;
  const mk = (src, id) => { const a = src.cs.slice(); a[1] = ` ${id} `; return a.join('|'); };
  const sum = ls[0].cs.slice(); alias(sum, c, 'M13-23a 至 M13-23c');
  push(w, [sum.join('|'), mk(ls[0], 'M13-23a')]);
  log.push('M13-23：原编号一行改汇总别名（同 M13-23a 至 M13-23c），第一个子行写 M13-23a；删去 apply-1115y5.mjs 里按行号的特判');
}
// ---- 二：卷二十九 display 对象而锚点全在 server-plugin 的行 → outputGate ----
for (const r of mig.rows) {
  if (r.aliasOf || r.volume !== '卷二十九') continue;
  const o = r.targetObject.replace(/`/g, '').trim();
  if (o !== 'display' || !r.anchors.length) continue;
  const txt = r.anchorsText;
  const hasClient = /extension\//.test(txt), hasServer = /server-plugin\//.test(txt);
  if (hasServer && !hasClient) { const { w, cs } = lineOf(r.rowKey); const a = cs.slice(); a[w.col.obj + 1] = objCell(cs[w.col.obj + 1], 'outputGate'); push(w, [a.join('|')]); log.push(`${r.rowKey}：display→outputGate（锚点全在 server-plugin 下）`); }
}
// ---- 三：M1-7 拆子行：按 check-m1-7-anchors.mjs 的比对结果，被指行覆盖的锚点写"同 Mxx-y"，没被覆盖的子行自己取对象 ----
{ const cmp = JSON.parse(readFileSync(`${OUT}/乙8-M1-7锚点比对.json`, 'utf8'));
  const { w, cs } = lineOf('M1-7'); const c = w.col;
  const sub = (id, old, disp, tgt, obj, why, al) => { const a = cs.slice(); a[1] = ` ${id} `; a[2] = ` ${old} `; if (al) alias(a, c, al); else { a[c.disp + 1] = objCell(cs[c.disp + 1], disp); a[c.tgt + 1] = ` ${tgt} `; a[c.obj + 1] = objCell(cs[c.obj + 1], obj); } a[c.why + 1] = ` ${why} `; return a.join('|'); };
  const tag = x => `${x.path.replace('server-plugin/', '')}${x.line ? ':' + x.line : ''}`;
  const groups = new Map();
  for (const x of cmp.anchors) (groups.get(x.by ?? '') ?? groups.set(x.by ?? '', []).get(x.by ?? '')).push(x);
  const subs = []; let n = 0;
  for (const k of cmp.candidates) if (groups.has(k)) { n++; subs.push(sub('M1-7' + 'abcdef'[n - 1], groups.get(k).map(tag).join('、'), null, null, null, `锚点全在 ${k} 的锚点之内（脚本比对，审查/脚本输出/乙8-M1-7锚点比对.md），以被指行为准，不单独计数`, k)); }
  const rest = groups.get('') ?? [];
  if (rest.length) { n++; subs.push(sub('M1-7' + 'abcdef'[n - 1], rest.map(tag).join('、'), 'delete', '—', 'sys.worldgen', '不在任何被指行的锚点之内，按总原则取被删内容所属的系统：遗留数据建新战役的读者归卷十 §4.12 开局缺省（卷十 M10-42）', null)); }
  const sum = cs.slice(); alias(sum, c, `M1-7a 至 M1-7${'abcdef'[n - 1]}`); sum[c.why + 1] = ' 汇总行，不单独计数；旧写法覆盖不全，按锚点逐一比对后拆为子行（李白 11-15 16:05 总原则，chk-1115-y5；比对结果见 审查/脚本输出/乙8-M1-7锚点比对.md） ';
  push(w, [sum.join('|'), ...subs]);
  log.push(`M1-7 按锚点比对结果拆 ${n} 个子行（共 ${cmp.anchors.length} 个锚点，被指行覆盖 ${cmp.anchors.length - rest.length} 个，未覆盖 ${rest.length} 个由子行取 delete、sys.worldgen），汇总行同 M1-7a 至 M1-7${'abcdef'[n - 1]}，理由栏删去 kernel 说法`);
}
for (const [f, es] of edits) {
  const L = FL.get(f); es.sort((a, b) => b.idx - a.idx); const seen = new Set();
  for (const e of es) { if (seen.has(e.idx)) throw new Error(`同一行被改两次：${f}:${e.idx + 1}`); seen.add(e.idx); L.splice(e.idx, 1, ...e.lines); }
  writeFileSync(`${DIR}/${f}`, L.join('\n'));
}
writeFileSync(`${OUT}/乙8-改写记录.md`, ['# 乙-1/乙-4 补 1115y8 改写记录（脚本生成，勿手改）', '', '依据：chk-1115-y5 单核（审查/乙阶段修订批-单核.md）；脚本 脚本/卷十一/apply-1115y8.mjs。', '', ...log.map(x => '- ' + x), ''].join('\n'));
console.log(log.join('\n'));
