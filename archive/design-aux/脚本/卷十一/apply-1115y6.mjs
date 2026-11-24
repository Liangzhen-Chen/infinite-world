// 乙-1/乙-4 补卡 1115y6：照李白 11-15 16:55 裁定（审查/李白裁定-1115-1655-待裁15行.md）改写待裁 15 行。
// 在 1115y5 改完的现行卷文上动手，只改落点对象格、落点格（M14-82 的对照句）、拆行；确定性；不手改。
// 用法：node apply-1115y6.mjs   （先跑 transcribe-migrows.mjs 更新 migrows-input.json 也可，本脚本直接读卷文）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/`/g, '').trim();

function columns(head) {
  const h = head.map(strip);
  const pick = p => h.findIndex(p);
  const obj = pick(x => /落点对象/.test(x));
  const disp = (() => { const a = pick(x => /mig_disp/.test(x)); return a >= 0 ? a : pick(x => x === '处置'); })();
  const tgt = (() => { const a = pick(x => /落点/.test(x) && !/落点对象/.test(x)); if (a >= 0) return a; const b = pick(x => x === '对应 §'); return b >= 0 ? b : pick(x => x === '去向'); })();
  return { obj, disp, tgt };
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
const edits = new Map(); // file → [{idx, lines}]
const log = [];
function lineOf(k) { const w = where.get(k); if (!w) throw new Error('找不到行 ' + k); return { w, cs: FL.get(w.file)[w.idx].split(/(?<!\\)\|/) }; }
function push(w, lines) { (edits.get(w.file) ?? edits.set(w.file, []).get(w.file)).push({ idx: w.idx, lines }); }
// 改一行的对象，可附改落点
function setObj(k, obj, tgt) {
  const { w, cs } = lineOf(k); const c = w.col; const a = cs.slice();
  a[c.obj + 1] = objCell(cs[c.obj + 1], obj);
  if (tgt !== undefined) a[c.tgt + 1] = ' ' + tgt + ' ';
  push(w, [a.join('|')]); log.push(`${k} → ${obj}`);
}
function appendTarget(k, add) { const { w, cs } = lineOf(k); const a = cs.slice(); const t = a[w.col.tgt + 1]; a[w.col.tgt + 1] = t.replace(/\s*$/, '') + add + ' '; return { w, a }; }

// ---- 一：1i 五行 ----
{ const { w, a } = appendTarget('M1-10', ''); a[w.col.obj + 1] = objCell(a[w.col.obj + 1], 'sys.material'); push(w, [a.join('|')]); log.push('M1-10 → sys.material（删除不搬，取被删概念所属系统：金属归属由卷三甲物质属性定）'); }
{ const { w, a } = appendTarget('M11-4', '；验收判据：R11-1.9'); a[w.col.obj + 1] = objCell(a[w.col.obj + 1], 'sys.economy'); push(w, [a.join('|')]); log.push('M11-4 → sys.economy（账本终态在卷六 §4.1 规则 11，R11-1.9 写进验收判据）'); }
{ const { w, a } = appendTarget('M20-90', '；验收只核"清单每项在卷二都有登记行"，卷二各登记节号写进验收判据'); a[w.col.obj + 1] = objCell(a[w.col.obj + 1], 'sys.time_env'); push(w, [a.join('|')]); log.push('M20-90 → sys.time_env（不拆）'); }
setObj('M14-69', 'sys.profession');
// M20-88 按文件拆 a–f，锚点相同；原编号一行作汇总别名行
{
  const { w, cs } = lineOf('M20-88'); const c = w.col;
  const mk = (id, o, alias) => { const a = cs.slice(); a[1] = ` ${id} `; if (alias) { for (const i of [c.disp, c.tgt, c.obj]) a[i + 1] = ` 同 ${alias} `; } else a[c.obj + 1] = objCell(cs[c.obj + 1], o); return a.join('|'); };
  const subs = [['a', 'education.mjs', 'sys.profession'], ['b', 'finance-assets.mjs', 'sys.economy'], ['c', 'finance-bank.mjs', 'sys.economy'], ['d', 'medicine.mjs', 'sys.status'], ['e', 'pets.mjs', 'sys.species'], ['f', 'quest-sources.mjs', 'sys.event_type']];
  const lines = [mk('M20-88', null, 'M20-88a 至 M20-88f'), ...subs.map(([s, f, o]) => { const l = mk('M20-88' + s, o); return l; })];
  push(w, lines); log.push('M20-88 拆 a–f：' + subs.map(([s, f, o]) => `${s} ${f}→${o}`).join('；'));
}
// ---- 三：1g 的三条 ----
setObj('M5-22d', 'sys.worldgen');
setObj('M5-30c', 'sys.time_env');
{ // M5-10b 拆 b1 b2；M5-10 汇总行的"至 M5-10b"改"至 M5-10b2"
  const { w, cs } = lineOf('M5-10b'); const c = w.col;
  const mk = (id, o) => { const a = cs.slice(); a[1] = ` ${id} `; a[c.obj + 1] = objCell(cs[c.obj + 1], o); return a.join('|'); };
  push(w, [mk('M5-10b1', 'sys.economy'), mk('M5-10b2', 'sys.ai_interface')]); log.push('M5-10b 拆 b1 家户预算→sys.economy（卷六 §4.12）、b2 家户决策→sys.ai_interface（卷九）');
  const s = lineOf('M5-10'); const a = s.cs.map(x => x.replace('M5-10b', 'M5-10b2')); a[1] = s.cs[1]; push(s.w, [a.join('|')]);
}
// ---- 二：M14-82 六个旧键，按卷十四 §2.5 "用于"栏对，写"旧字段 → 新键名" ----
const M14 = {
  a: ['rules.profession', 'practice（dailyCaps 每日练习增量上限、stageSize 阶段大小、maximum 总上限、repeatMultiplier 重复折减）→ rules.profession（kinds、lapseDays 是从业边的种类与失效天数；旧字段四项在 §2.5 没有同名或同义键，对不上，列给李白）'],
  b: ['rules.growth', 'levels（maximum 等级上限、noviceUntil、freeAttributePoints）→ rules.growth（levelThresholds、attrPointsPerLevel、freePerSkill）；levels.initial（初始属性总和与上下限）、levels.experience 在 §2.5 没有对应键，对不上，列给李白'],
  c: ['rules.learning', 'education（minimumAge、maximumAge 就学年龄；examinations 各地课业）→ rules.learning；§2.5 的 learning 各键（attrCurve、ageCurve、challengeCurve、dailyTotalCurve 等）没有就学年龄与课业名单的对应，对不上，列给李白（课业名单是只对一地成立的数据行）'],
  d: ['rules.learning', 'training（institutions：机构、教师、门规、入门费、仪式）→ rules.learning（instructEffect、gapCurves、groupCurves 管教学增量）；旧内容里没有"教师肯不肯教"的字段，没有拆 rules.teach 的子行；入门费、门规、仪式是只对一地成立的数据行，对不上，列给李白'],
  e: ['rules.learning', 'books（grades 书的五档、minimumLiteracy、readingMinutes）→ rules.learning（carrierLevelCurve，从书这种载体学）；旧内容里没有考证书费用，没有拆 rules.cert 的子行；grades 与 minimumLiteracy 在 carrierLevelCurve 之外，对不上，列给李白'],
  f: ['rules.growth', 'npcGrowth（maximumGain、maximumProficiency、minimumPractice、switchCooldownDays、teach、work、vocations）是日后升级成长（每日教学与工作增量），不是生成 NPC 时的初始技能，取 rules.growth；§2.5 的 growth 键只有 levelThresholds、xpPerPoint、capacity、freePerSkill、burdenCurve、attrPointsPerLevel，旧字段对不上，列给李白（vocations 是只对一地成立的名单，应成数据行）'],
};
for (const [s, [o, t]] of Object.entries(M14)) setObj('M14-82' + s, o, t);

// ---- 落笔 ----
let n = 0;
for (const [f, es] of edits) {
  const L = FL.get(f);
  es.sort((a, b) => b.idx - a.idx);
  const seen = new Set();
  for (const e of es) { if (seen.has(e.idx)) throw new Error(`同一行被改两次：${f}:${e.idx + 1}`); seen.add(e.idx); L.splice(e.idx, 1, ...e.lines); n++; }
  writeFileSync(`${DIR}/${f}`, L.join('\n'));
}
// 核 M14-16、M14-27 的对象 profession 是不是卷二登记的表代号
const reg = readFileSync(`${DIR}/${CFG.registry.file}`, 'utf8').split(/\r?\n/);
const tabs = new Set(); for (const l of reg) if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) tabs.add(m[1]); }
const objs = ['M14-16', 'M14-27'].map(k => { const w = where.get(k); const L = FL.get(w.file); return `${k}=${strip(cells(L[w.idx])[w.col.obj] ?? '')}`; });
log.push(`核 ${objs.join('、')}：profession ${tabs.has('profession') ? '是' : '不是'}卷二登记的表代号，${tabs.has('profession') ? '保留' : '改 sys.profession'}`);
writeFileSync(`${OUT}/乙6-改写记录.md`, ['# 乙-1/乙-4 补 1115y6 改写记录（脚本生成，勿手改）', '', '依据：审查/李白裁定-1115-1655-待裁15行.md；脚本 脚本/卷十一/apply-1115y6.mjs。', '', ...log.map(x => '- ' + x), ''].join('\n'));
console.log(log.join('\n'));
console.log('改动行位', n);

// ---- 重新生成待裁清单（替代 1115y5 的版本）：现行卷文里对象还是 rules、待裁、待补的行，加 M14-82 对不上的项 ----
const rest = [];
for (const [f, L] of FL) {
  let head = null, col = null, code = false;
  L.forEach(l => {
    if (/^```/.test(l)) { code = !code; head = null; return; }
    if (code) return;
    if (!/^\|/.test(l)) { head = null; return; }
    const c = cells(l);
    if (!head) { head = c; col = columns(head); return; }
    if (/^:?-{3}/.test(c[0] ?? '')) return;
    const k = strip(c[0] ?? '');
    if (!new RegExp(CFG.migRow).test(k) || col.obj < 0) return;
    const o = strip(c[col.obj] ?? '');
    if (o === 'rules' || o === '待裁' || o === '待补') rest.push({ k, vol: f.split('-')[0], o, t: col.tgt >= 0 ? strip(c[col.tgt] ?? '') : '' });
  });
}
const why = {
  'M11-7': ['李白 16:55 第四条：照旧待补，不算迁移处置，不进计数', '无'],
  'M2-10a': ['一个函数 applyChainLaws 分属卷五（据点储量与再生规划）、卷十四（拜师需求）、卷六（价格底线，卷六 M6-29、M6-30 已定删旧价），对上多个系统；16:55 裁定没有涉及', '候选 sys.place（再生与储量）、sys.profession（拜师）、sys.economy（价格底线）；或拆三个子行'],
  'M2-10b': ['civicRules 居留与公民资格常数，各卷没有登记对应的 rules.* 键；16:55 裁定没有涉及', '候选 rules.civic（需先由卷八登记）；或 sys.org'],
  'M2-12b': ['繁简转换移到 tools/（离线组），离线组不在卷二 §2.9 登记的非规则组里，对象写不出；16:55 裁定没有涉及', '候选 content-scripts（离线模块组键，卷二 §2.7）；需李白确认繁简转换算不算内容构建脚本'],
};
const md = [
  '# 乙-1/乙-4 补 1115y6：待裁清单（脚本生成，勿手改；按李白 11-15 16:55 裁定改完后的现行卷文重新生成，替代 1115y5 的版本）',
  '',
  `- 现行卷文里落点对象仍是 rules、待裁、待补的迁移行：${rest.length} 行；其中 rules ${rest.filter(r => r.o === 'rules').length} 行、待裁 ${rest.filter(r => r.o === '待裁').length} 行、待补 ${rest.filter(r => r.o === '待补').length} 行。`,
  '- 16:55 裁定的 15 行已全部落点（改写记录见 审查/脚本输出/乙6-改写记录.md）。',
  '',
  '| 迁移行 | 卷 | 对象 | 落点（原文） | 为什么 | 候选 |', '|---|---|---|---|---|---|',
  ...rest.map(r => `| ${r.k} | ${r.vol} | ${r.o} | ${r.t.replace(/\|/g, '/').slice(0, 60)} | ${(why[r.k] ?? ['', ''])[0]} | ${(why[r.k] ?? ['', ''])[1]} |`),
  '',
  '## M14-82 对照里对不上的项（李白第二条：每个子行写"旧字段 → 新键名"，对不上列给李白）',
  '',
  '| 子行 | 旧键 | 已取对象 | 对不上的旧字段 |', '|---|---|---|---|',
  '| M14-82a | practice | rules.profession | dailyCaps、stageSize、maximum、repeatMultiplier（练习增量上限与阶段）；§2.5 rules.profession 只有 kinds、lapseDays、tierByRelAge、params 等，没有同义键 |',
  '| M14-82b | levels | rules.growth | initial（初始属性总和与上下限）、experience；levels 的 maximum、freeAttributePoints 可对 levelThresholds、attrPointsPerLevel |',
  '| M14-82c | education | rules.learning | minimumAge、maximumAge、examinations（各地课业名单，是只对一地成立的数据行） |',
  '| M14-82d | training | rules.learning | institutions 的机构、教师、门规、入门费、仪式（数据行）；旧内容里没有"教师肯不肯教"字段，没有拆 rules.teach 子行 |',
  '| M14-82e | books | rules.learning | grades 五档、minimumLiteracy；readingMinutes 可对 carrierLevelCurve；旧内容里没有考证书费用，没有拆 rules.cert 子行 |',
  '| M14-82f | npcGrowth | rules.growth | 旧字段是日后升级成长（每日教学与工作增量），不是初始技能，故取 rules.growth；maximumGain、maximumProficiency、minimumPractice、switchCooldownDays、teach、work 在 growth 键里没有同义键，vocations 是只对一地成立的名单 |',
  '',
].join('\n');
writeFileSync(`${OUT}/乙5-rules待裁清单.md`, md);
console.log('待裁清单', rest.length, '行');
