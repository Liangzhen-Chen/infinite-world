// rank 分配表生成器（李白裁定第 7 条）：汇总全书 due_kind 登记行，按规则生成建议 rank，并核 E-DUE-RANK-DUP。
// 规则：全部到期项同在同刻全序的 `due` 段（卷二十 §4.1.3 第 4 条，classRank = due_kind.rank）；段内按"先发的事会改变
// 后发的前提"排，无依赖者按卷号升序、卷内按登记行序（同行按出现先后），间隔 10 留空（10、20、30…）。
// 依赖只认正文里同一行写明"A 先于 B"（A、B 为两条登记的代号或名称）；散文推不出的一律按无依赖处理，标"依赖待核"。
// 登记行认法（排除区不扫；写明"不登记 due_kind"的行不算）：
//   ① 表格行首栏为"卷X `due_kind`"：次栏代号，第三栏取 paceClass 与 rank 写法；
//   ② 表格行首栏含"到期种类族"：次栏按"；"分句，每句"甲、乙……取延迟类/均衡类"，没写节奏类的整栏按"、"拆名；
//   ③ 提到 `due_kind` 或"本卷登记的到期项代号"的行里的 `due_…`/`due.…` 代号，paceClass 取其后最近的"`paceClass` 取/=/都取 …"。
// 用法：node gen-due-rank.mjs [卷目录]；输出 stdout 与 审查/脚本输出/due-rank-表.md（给了卷目录时不写文件）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVolumes, ticks, cnToNum, DIR, writeOut } from './lib.mjs';

const OUT = path.join(DIR, '审查/脚本输出/due-rank-表.md');
const SUF = { '': 0, '甲': 1, '乙': 2, 'b': 1 };
const PACE = { '延迟类': 'latency', '均衡类': 'equilibrium' };
const NOTREG = /不(登记|另登|另立)[^。；|]{0,8}`?due_kind`?/;

export function volKey(vol) {
  const m = vol.match(/^卷([〇零一二三四五六七八九十]+)(.*)$/);
  return m ? [cnToNum(m[1]), SUF[m[2]] ?? 9] : [999, 0];
}

// 顶层（不在括号内）按分隔符切
function splitTop(s, seps) {
  const out = []; let d = 0, cur = '';
  for (const c of s) {
    if ('（('.includes(c)) d++;
    if ('）)'.includes(c)) d--;
    if (d === 0 && seps.includes(c)) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const stripParen = s => { let o = '', d = 0; for (const c of s) { if ('（('.includes(c)) d++; else if ('）)'.includes(c)) d--; else if (!d) o += c; } return o; };

function paceIn(s) {
  const m = s.match(/`paceClass`\s*(?:都)?\s*(?:=|取)\s*`?(latency|equilibrium)`?/);
  return m ? m[1] : null;
}
function rankIn(s) {
  const m = s.match(/`rank`\s*([^；。|]*)/);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 60) || '（只写栏名）' : null;
}

export function collect(vols) {
  const rows = [];
  for (const v of vols) for (const L of v.lines) {
    if (L.excluded || NOTREG.test(L.text)) continue;
    const add = (code, pace, rank, form, ord) => rows.push({ vol: v.vol, key: volKey(v.vol), no: L.no, ord, code, pace: pace || '未写', rank: rank || '未写', form });
    const c = L.cells;
    if (c && /^卷\S+ `due_kind`$/.test(c[0] || '')) {
      const code = ticks(c[1] || '')[0]; const info = c.slice(2).join(' | ');
      if (code) add(code, paceIn(info), rankIn(info), '①表格行', 0);
      continue;
    }
    if (c && /到期种类族/.test(c[0] || '')) {
      let body = c[1] || '';
      const top = splitTop(body, '：:'); body = top[top.length - 1];
      let ord = 0;
      for (const cl of splitTop(body, '；;')) {
        const m = stripParen(cl).match(/^(.*?)取(延迟类|均衡类)/);
        const names = (m ? m[1] : stripParen(cl)).split('、').map(x => x.trim()).filter(Boolean);
        for (const n of names) add(n, m ? PACE[m[2]] : null, null, '②到期种类族栏', ord++);
      }
      continue;
    }
    if (/`due_kind`|本卷登记的到期项代号/.test(L.text)) {
      const ms = [...L.text.matchAll(/`(due[_.](?!kind`)[A-Za-z][\w.]*)`/g)];
      ms.forEach((m, i) => {
        const tail = L.text.slice(m.index);
        add(m[1], paceIn(tail), rankIn(L.text), '③登记句', i);
      });
    }
  }
  return rows;
}

export function assign(rows) {
  // 同一代号只取第一处登记，其余记为重复登记；只有中文名称的登记按（卷，名称）区分——
  // 别卷同名的不并为一种（可能本是两种），另列"同名待核"
  const seen = new Map(), dupReg = [], items = [], sameName = [];
  for (const r of rows) {
    r.id = /^[\w.]+$/.test(r.code) ? r.code : `${r.vol}/${r.code}`;
    if (seen.has(r.id)) { dupReg.push([seen.get(r.id), r]); continue; }
    const twin = items.find(x => x.code === r.code);
    if (twin) sameName.push([twin, r]);
    seen.set(r.id, r); items.push(r);
  }
  dupReg.push(...sameName.map(p => [...p, '同名']));
  const cmp = (a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.no - b.no || a.ord - b.ord;
  items.sort(cmp);
  return { items, dupReg };
}

// 依赖：同一行写明 A …先于… B
export function deps(vols, items) {
  const edges = [];
  for (const v of vols) for (const L of v.lines) {
    if (L.excluded || !/先于/.test(L.text)) continue;
    for (const A of items) for (const B of items) { const a = A.code, b = B.code;
      if (A === B) continue;
      const ia = L.text.indexOf(a), ip = L.text.indexOf('先于', ia + 1), ib = ip < 0 ? -1 : L.text.indexOf(b, ip);
      if (ia >= 0 && ip > ia && ib > ip) edges.push({ a: A.id, b: B.id, at: `${v.vol}:${L.no}` });
    }
  }
  return edges;
}

export function order(items, edges) {
  const before = new Map(items.map(x => [x.id, new Set()]));
  for (const e of edges) before.get(e.b).add(e.a);
  const out = [], done = new Set();
  let cycle = false;
  while (out.length < items.length) {
    const nxt = items.find(x => !done.has(x.id) && [...before.get(x.id)].every(a => done.has(a)));
    if (!nxt) { cycle = true; items.filter(x => !done.has(x.id)).forEach(x => { out.push(x); done.add(x.id); }); break; }
    out.push(nxt); done.add(nxt.id);
  }
  out.forEach((x, i) => { x.newRank = (i + 1) * 10; });
  return { out, cycle };
}

export function checkDup(out) {
  const res = [];
  const byRank = new Map();
  for (const x of out) { const k = x.newRank; byRank.set(k, [...(byRank.get(k) || []), x.code]); }
  for (const [k, cs] of byRank) if (cs.length > 1) res.push(`建议 rank ${k} 重复：${cs.join('、')}`);
  const cur = new Map();
  for (const x of out) { const m = x.rank.match(/^(?:=|取|为)?\s*(\d+)\b/); if (m) cur.set(m[1], [...(cur.get(m[1]) || []), x.code]); }
  for (const [k, cs] of cur) if (cs.length > 1) res.push(`现写 rank ${k} 重复：${cs.join('、')}`);
  return { res, curNumeric: [...cur.values()].flat().length };
}

export function run(vols) {
  const rows = collect(vols);
  const { items, dupReg } = assign(rows);
  const edges = deps(vols, items);
  const { out, cycle } = order(items, edges);
  const dep = new Map();
  for (const e of edges) { dep.set(e.b, [...(dep.get(e.b) || []), `晚于 ${e.a}（${e.at}）`]); dep.set(e.a, [...(dep.get(e.a) || []), `早于 ${e.b}（${e.at}）`]); }
  const chk = checkDup(out);
  return { rows, out, dupReg, edges, cycle, dep, chk };
}

export function render(r) {
  const o = [];
  const pending = r.out.filter(x => !r.dep.has(x.id)).length;
  o.push('# due_kind rank 建议分配表（机判）', '');
  o.push(`登记行 ${r.rows.length} 条，去重后 ${r.out.length} 种；全部在同刻全序 \`due\` 段（卷二十 §4.1.3 第 4 条）。正文写明的先后依赖 ${r.edges.length} 条${r.cycle ? '（有环，环内按卷序）' : ''}；"依赖待核" ${pending} 种。`, '');
  o.push('| 建议 rank | 代号或名称 | 登记卷:行 | 同刻段 | paceClass | 现 rank 写法 | 依赖 |', '|---|---|---|---|---|---|---|');
  for (const x of r.out) o.push(`| ${x.newRank} | ${/^[\w.]+$/.test(x.code) ? '`' + x.code + '`' : x.code} | ${x.vol}:${x.no} | \`due\` | ${x.pace} | ${x.rank} | ${r.dep.has(x.id) ? r.dep.get(x.id).join('；') : '依赖待核'} |`);
  o.push('', '说明：排序为段内依赖优先，其余按卷号升序、卷内按登记行序；间隔 10 留空。"代号或名称"为中文者是该卷只写了名称、未给 `due_` 代号的登记（卷八、卷八b"到期种类族"栏）。', '');
  o.push('## E-DUE-RANK-DUP 检查', '');
  o.push(`- 建议分配：${r.out.length} 种，rank 两两不同${r.chk.res.some(s => s.startsWith('建议')) ? '——不成立' : '，无重复'}。`);
  o.push(`- 现文已写数值 rank 的 ${r.chk.curNumeric} 种${r.chk.res.some(s => s.startsWith('现写')) ? '，有重复' : '，无重复'}（其余现写法为"收尾分配"或未写）。`);
  for (const s of r.chk.res) o.push(`- ${s}`);
  if (r.dupReg.length) for (const [a, b, s] of r.dupReg) o.push(`- ${s ? '同名待核（别卷同名，分列两种；须核是否本为一种）' : '同一代号多处登记（计一种）'}：${a.code}：${a.vol}:${a.no}、${b.vol}:${b.no}`);
  else o.push('- 同一代号/名称多处登记：无。');
  o.push(`- 结论：${r.chk.res.length ? 'E-DUE-RANK-DUP 命中' : 'E-DUE-RANK-DUP 零命中'}。`);
  return o.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const dir = process.argv[2];
  const text = render(run(loadVolumes(dir || DIR)));
  if (!dir) writeOut(OUT, text);
  console.log(text);
}
