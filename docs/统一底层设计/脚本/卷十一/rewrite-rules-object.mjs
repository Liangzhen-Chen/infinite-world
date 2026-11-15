// 乙-1 卡 1115y1c：落点对象 "rules" 按规则 §2.3 六类机械改写（李白裁定 rules 口径选乙）。规则说明见 审查/乙1c-rules对象改写规则.md。
// 输入：migrows-input.json（H1）、审查/脚本输出/乙4补-systems补全.json（§2.7 补出的系统行，系统键暂为临时名，定名时整批替换）。
// 只读各卷之外只改各卷 §7 迁移表里落点对象格的值 rules；确定性、不联网。用法：node rewrite-rules-object.mjs
// 输出：直接改各卷卷文；待裁清单写 审查/脚本输出/乙1c-rules待裁清单.md；统计打印到标准输出。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const sys = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const sysOf = new Map(sys.map(s => [s.volume, s.system]));

// 阿拉伯卷号 → 卷名（卷零…卷二十九；R8b 之类带 b 的后缀照写）
const D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function cn(n) { if (n < 10) return D[n]; if (n < 20) return '十' + (n % 10 ? D[n % 10] : ''); return D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : ''); }
const volOfNum = (n, suf) => (+n === 3 ? null : '卷' + cn(+n) + (suf ?? ''));
// 规则号前缀：R、S、A、C 加卷号（8b 带后缀）后接 "-"
const RULE_PREFIX = /\b[RSAC](\d+)(b)?-\d/g;
// 显式的卷名引用
const VOL_NAME = /卷([零一二三四五六七八九十]+(?:甲|乙|b)?)/g;
// 规则表键
const RULES_KEY = /rules\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*/g;
// 编号规则：「规则 n」「§x.y 规则 n」，没有卷名前缀时属本行所在卷
const RULE_N = /规则\s*\d+/;
const SEC = /§\d/;
// 注册的模块组（卷二 §2.7）：锚点全落在同一个已登记组里时取该组键
function groupOf(p) {
  if (p.startsWith('server-plugin/input/')) return 'inputEdge';
  if (p.startsWith('server-plugin/gate/')) return 'gate';
  if (p.startsWith('server-plugin/output-gate/')) return 'outputGate';
  if (p.startsWith('server-plugin/ai-gate/')) return 'aiGate';
  if (p.startsWith('server-plugin/kernel/')) return 'kernel';
  if (p.startsWith('extension/host/')) return 'host';
  if (p.startsWith('extension/textcore/') || p.startsWith('server-plugin/textcore/')) return null; // 共享库，不是模块组
  if (p.startsWith('extension/')) return 'display';
  return null; // 规则层文件、tools、tests、world：不在任何已登记的模块组
}
// 锚点解析：与 derive-groups.mjs 同一口径，这里只做文件名到路径的最简解析（全仓文件名唯一才算）
import { readdirSync, statSync } from 'node:fs';
const REPO = 'F:/dnd';
const all = [];
['server-plugin', 'extension', 'tools', 'tests', 'world'].forEach(d => { (function walk(rel) { for (const n of readdirSync(`${REPO}/${rel}`).sort()) { if (n === 'node_modules' || n.startsWith('.')) continue; const r = `${rel}/${n}`; if (statSync(`${REPO}/${r}`).isDirectory()) walk(r); else if (/\.(?:mjs|js|json)$/.test(n)) all.push(r); } })(d); });
const exact = new Set(all);
function resolve(spec) {
  if (/\*/.test(spec)) return null;
  if (exact.has(spec)) return spec;
  const suf = all.filter(f => f.endsWith('/' + spec));
  if (suf.length === 1) return suf[0];
  return null; // 歧义或找不到都不猜
}

const files = new Map(); // 卷文件名 → 行数组
const fileOf = vol => readdirSync(CFG.dir).find(f => f.startsWith(vol + '-') && f.endsWith('.md'));
const getL = vol => { const f = fileOf(vol); if (!files.has(f)) files.set(f, readFileSync(`${CFG.dir}/${f}`, 'utf8').split('\n')); return [f, files.get(f)]; };

const stat = { total: 0, sysKey: 0, rulesKey: 0, group: 0, pending: 0 };
const pending = [];
const out = [];
for (const r of mig.rows) {
  if (r.targetObject.replace(/`/g, '').trim() !== 'rules') continue;
  stat.total++;
  const t = r.target;
  // 候选对象
  const cands = new Set(); const why = [];
  const keys = [...new Set((t.match(RULES_KEY) ?? []).map(k => k.replace(/\.$/, '')))];
  for (const k of keys) { cands.add('R:' + k); }
  const vols = new Set();
  for (const m of t.matchAll(RULE_PREFIX)) { const v = volOfNum(m[1], m[2]); if (v) vols.add(v); else { vols.add('?卷三甲乙'); } }
  for (const m of t.matchAll(VOL_NAME)) vols.add('卷' + m[1]);
  if (vols.size === 0 && (RULE_N.test(t) || (SEC.test(t) && keys.length === 0))) { if (RULE_N.test(t)) vols.add(r.volume); }
  for (const v of vols) {
    if (v.startsWith('?')) { cands.add('?:卷三有甲乙两卷，规则号前缀 3 分不出是哪一卷'); continue; }
    const s = sysOf.get(v);
    if (s) cands.add('S:' + s + ':' + v); else cands.add('?:' + v + ' 在卷二 §2.7 补全表里没有系统行');
  }
  const good = [...cands].filter(c => !c.startsWith('?:'));
  const bad = [...cands].filter(c => c.startsWith('?:'));
  let value = null, kind = null;
  if (good.length === 1 && bad.length === 0) {
    const g = good[0];
    if (g.startsWith('R:')) { value = g.slice(2); kind = 'rulesKey'; } else { value = g.split(':')[1]; kind = 'sysKey'; }
  } else if (cands.size === 0) {
    // 没有任何规则落点：按锚点文件所在模块组键（卷二 §2.3 原文）
    const groups = new Set(); let unresolved = 0;
    for (const a of r.anchors) { const p = resolve(a.file); if (!p) { unresolved++; continue; } groups.add(groupOf(p) ?? '（不在已登记模块组）'); }
    if (groups.size === 1 && unresolved === 0 && ![...groups][0].startsWith('（')) { value = [...groups][0]; kind = 'group'; }
    else why.push(r.anchors.length === 0 ? '没有规则落点，也没有文件锚点' : `没有规则落点；锚点所在组：${[...groups].join('、') || '无'}${unresolved ? `；${unresolved} 个锚点文件解析不到` : ''}`);
  } else {
    if (good.length > 1) why.push('一行对上多个对象：' + good.map(g => g.replace(/^[RS]:/, '')).join('、'));
    for (const b of bad) why.push(b.slice(2));
    if (good.length === 1) why.push('另有一个落点对不上系统，不猜');
  }
  if (value === null) { stat.pending++; pending.push({ key: r.rowKey, vol: r.volume, line: r.srcLine, target: t.slice(0, 60), why: why.join('；') }); out.push(null); continue; }
  stat[kind]++;
  // 改卷文
  const [f, L] = getL(r.volume);
  const line = L[r.srcLine - 1];
  const cs = line.split(/(?<!\\)\|/);
  const hits = cs.map((c, i) => [c.replace(/`/g, '').trim(), i]).filter(([c]) => c === 'rules');
  if (hits.length !== 1 || !cs[1].includes(r.rowKey)) { throw new Error(`${r.rowKey} 行${r.srcLine}：落点对象格定位不唯一或编号不符`); }
  const plain = cs[hits[0][1]].includes('`') ? true : false;
  cs[hits[0][1]] = plain ? ` \`${value}\` ` : ` ${value} `;
  L[r.srcLine - 1] = cs.join('|');
  out.push({ key: r.rowKey, value, kind });
}
for (const [f, L] of files) writeFileSync(`${CFG.dir}/${f}`, L.join('\n'));

const md = [
  '# 乙-1 卡 1115y1c：落点对象 rules 改写后的待裁清单（脚本生成，勿手改）',
  '',
  '- 规则说明：审查/乙1c-rules对象改写规则.md；脚本：脚本/卷十一/rewrite-rules-object.mjs。',
  `- 改写前落点对象为 rules 的迁移行 ${stat.total} 行：改成系统登记项键 ${stat.sysKey} 行、规则表键 ${stat.rulesKey} 行、模块组键 ${stat.group} 行；脚本推不出或一行对上两个对象的 ${stat.pending} 行，不猜，列在下面，卷文里这些行的落点对象仍是 rules，待李白逐行裁定后改。`,
  '- 系统登记项键是卷二 §2.7 补全表里的临时键名（取各卷 §3.1 首个读入口名），定名时整批替换。',
  '',
  '| 迁移行 | 卷 | 卷文行 | 落点（摘） | 为什么推不出 |', '|---|---|---:|---|---|',
  ...pending.map(p => `| ${p.key} | ${p.vol} | ${p.line} | ${p.target.replace(/\|/g, '/')} | ${p.why} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/乙1c-rules待裁清单.md`, md);
console.log(JSON.stringify(stat));
