// 总登记表 needs / rules 合并脚本（总纲 docs/研究/总登记表总纲-1122.md 必须改 ①⑤；李白 11-22 Q-12 第三步）。
// 输入：登记表 tools/accept/entry-registry.json（只用 name、file、vol、sec 定行）；分卷抽取文件
//   docs/审查/总登记表-needs-分卷/*.json 与补抽 docs/审查/总登记表-needs-补抽/*.json（有就读），
//   形状 {volume, needs:[{entry, targets, line, quote}], rules:[{entry, rules, line, quote}]}；卷文 docs/统一底层设计。
// 输出：默认只印摘要，不写任何文件。--write 才把 needs、rules 回写登记表；--rejects 路径 把判不是与仍拒的条目写成 JSON。
// 锚定（必须改 ①）：不信行号。先按 quote 在本卷里找含该原文的行；按原文找不到（或没有 quote）才退到 line 前后 8 行。行号只当"就近"提示。
// 采信判据（不放宽）：目标名必须唯一在册、逐字出现在找到的那一行；入口名也在该行，或该行落在该入口登记的节内；
//   rules 键（可省 rules. 前缀）必须逐字出现在该行。拒收的不丢，原因逐条列出。
// 确定、只读（除 --write 的登记表与 --rejects 的指定路径）：不读时间、不读网络，遍历先排序，输出按 name、file 排序。
// 用法：node tools/entry-registry-merge.mjs [--write] [--rejects 路径.json]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { writeCliOut } from './accept/lib/cli-out.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionRange, REGISTRY_FILE } from './entry-registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
const DESIGN = 'docs/统一底层设计';
export const SHARD_DIRS = ['docs/审查/总登记表-needs-分卷', 'docs/审查/总登记表-needs-补抽'];
const WINDOW = 8;
// 抽取者写的"判不是"原因里，凡说的是"找不到能同时满足判据的那一行"（裸键、短名、入口名不在行里或节里），单列为锚不上，不算判了"不是依赖"
const ANCHOR_WHY = /裸键|短名|整键|全键|全路径|无同含|不含入口名|无入口名|同行无|非§|不在 ?§|无含目标|无此目标|无调用句|所引行|只有通配|非整键/;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wre = (n) => new RegExp(`(?<![A-Za-z0-9_])${esc(n)}(?![A-Za-z0-9_])`);
const squash = (s) => s.replace(/\s+/g, '');

// 纯函数：input {registry, shards: [{volume, needs, rules}], volumes: Map<卷, 行[]>}；返回 {registry(新), accepted, rejects}
export function mergeNeeds(input) {
  const reg = JSON.parse(JSON.stringify(input.registry));
  const keyOf = (r) => `${r.file || ''}#${r.name}`;
  const byName = new Map();
  for (const r of reg.entries) { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r); }
  for (const r of reg.entries) { r.needs = []; r.rules = []; }
  const rejects = []; let okN = 0; let okR = 0; const got = new Set(); const dropped = new Map();
  for (const j of input.shards) for (const d of j.dropped || []) dropped.set(`${j.volume}|${d.entry}|${d.target}`, d.reason || "");
  const shards = [...input.shards].sort((a, b) => cmp(a.volume, b.volume));
  for (const j of shards) {
    const L = input.volumes.get(j.volume);
    if (!L) { rejects.push({ volume: j.volume, kind: '卷', reason: '没有这一卷' }); continue; }
    const squashed = L.map(squash);
    const mine = (name) => (byName.get(name) || []).filter((r) => r.vol === j.volume);
    const inSec = (r, line) => { const rg = sectionRange(L, r.sec); return !!rg && line - 1 >= rg[0] && line - 1 < rg[1]; };
    // 找行：按 quote 在本卷里找含该原文的行（按与 line 的距离排序）；没有 quote 退到 line 前后 WINDOW 行
    const candidates = (n) => {
      const q = squash(n.quote || '');
      const hint = Number.isInteger(n.line) ? n.line : 0;
      let ls = [];
      if (q.length >= 4) squashed.forEach((s, i) => { if (s.includes(q)) ls.push(i + 1); });
      if (!ls.length && hint) for (let l = Math.max(1, hint - WINDOW); l <= Math.min(L.length, hint + WINDOW); l++) ls.push(l);
      return ls.sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint) || a - b);
    };
    const place = (n, rows, pred) => candidates(n).find((l) => pred(L[l - 1], l, rows)) || 0;
    for (const n of j.needs || []) {
      const rows = mine(n.entry);
      if (!rows.length) { rejects.push({ volume: j.volume, kind: 'needs', entry: n.entry, targets: n.targets, reason: '不是本卷登记的入口' }); continue; }
      for (const t of n.targets || []) {
        const cand = byName.get(t) || [];
        if (cand.length !== 1) { rejects.push({ volume: j.volume, kind: 'needs', entry: n.entry, target: t, reason: cand.length ? '目标重名' : '目标不在册' }); continue; }
        if (t === n.entry || dropped.has(`${j.volume}|${n.entry}|${t}`)) continue;
        const l = place(n, rows, (s, ln, rs) => wre(t).test(s) && (wre(n.entry).test(s) || rs.some((r) => inSec(r, ln))));
        if (!l) { rejects.push({ volume: j.volume, kind: 'needs', entry: n.entry, target: t, quote: n.quote || null, line: n.line || null, reason: '按原文找不到同时含目标名、且含入口名或在其节内的行' }); continue; }
        for (const r of rows) { const k = keyOf(cand[0]); if (!r.needs.includes(k)) r.needs.push(k); okN++; got.add(`${j.volume}|${n.entry}|${t}`); }
      }
    }
    for (const n of j.rules || []) {
      const rows = mine(n.entry);
      if (!rows.length) { rejects.push({ volume: j.volume, kind: 'rules', entry: n.entry, rules: n.rules, reason: '不是本卷登记的入口' }); continue; }
      for (const v of n.rules || []) {
        if (dropped.has(`${j.volume}|${n.entry}|${v}`)) continue;
        const l = /^rules\.[A-Za-z0-9_.]+$/.test(v) ? place(n, rows, (s) => s.includes(v) || s.includes(v.slice(6))) : 0;
        if (!l) { rejects.push({ volume: j.volume, kind: 'rules', entry: n.entry, rule: v, quote: n.quote || null, line: n.line || null, reason: '按原文找不到含该规则键的行' }); continue; }
        for (const r of rows) { if (!r.rules.includes(v)) r.rules.push(v); okR++; got.add(`${j.volume}|${n.entry}|${v}`); }
      }
    }
  }
  for (const r of reg.entries) { r.needs.sort(cmp); r.rules.sort(cmp); }
  const rk = (a) => `${a.volume}|${a.kind}|${a.entry}|${a.target || a.rule || ""}`;
  const still = rejects.filter((x) => !got.has(`${x.volume}|${x.entry}|${x.target || x.rule}`) && !dropped.has(`${x.volume}|${x.entry}|${x.target || x.rule}`)).sort((a, b) => cmp(rk(a), rk(b)));
  const decided = [...dropped].map(([k, why]) => { const [volume, entry, item] = k.split("|"); return { volume, entry, item, 判定: ANCHOR_WHY.test(why) ? "按判据锚不上（卷文写法所致，不等于不是依赖）" : "判不是依赖或规则", 原因: why }; }).sort((a, b) => cmp(`${a.volume}|${a.entry}|${a.item}`, `${b.volume}|${b.entry}|${b.item}`));
  return { registry: reg, accepted: { needs: okN, rules: okR }, rejects: still, decided };
}

export function loadMergeInput(root = ROOT) {
  const registry = JSON.parse(readFileSync(join(root, REGISTRY_FILE), 'utf8'));
  const volumes = new Map();
  for (const f of readdirSync(join(root, DESIGN)).filter((x) => /^卷.*\.md$/.test(x)).sort(cmp)) volumes.set(f.split('-')[0], readFileSync(join(root, DESIGN, f), 'utf8').split(/\r?\n/));
  const shards = [];
  for (const d of SHARD_DIRS) {
    if (!existsSync(join(root, d))) continue;
    for (const f of readdirSync(join(root, d)).filter((x) => x.endsWith('.json')).sort(cmp)) {
      try { shards.push({ ...JSON.parse(readFileSync(join(root, d, f), 'utf8')), _from: `${d}/${f}` }); } catch (e) { throw new Error(`${d}/${f} 不是合法 JSON：${e.message}`); }
    }
  }
  return { registry, shards, volumes };
}

function main(argv) {
  const res = mergeNeeds(loadMergeInput());
  const ri = argv.indexOf('--rejects');
  if (ri >= 0 && argv[ri + 1]) writeCliOut(ROOT, resolve(argv[ri + 1]), `${JSON.stringify({ 仍拒: res.rejects, 判不是: res.decided }, null, 1)}\n`);
  if (argv.includes('--write')) writeCliOut(ROOT, REGISTRY_FILE, `${JSON.stringify(res.registry, null, 1)}\n`);
  console.log(`needs 采信 ${res.accepted.needs}，rules 采信 ${res.accepted.rules}；判不是 ${res.decided.length}；仍拒 ${res.rejects.length}（needs ${res.rejects.filter((x) => x.kind === "needs").length}，rules ${res.rejects.filter((x) => x.kind === "rules").length}）`);
}
if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/') === resolve(fileURLToPath(import.meta.url)).replace(/\\/g, '/')) main(process.argv.slice(2));
