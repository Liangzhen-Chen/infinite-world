// 卷二十一 来路核对：扫全书 卷*.md 里写状态实例（身体状态）的地方，确认新建来路只有 R21-1.5 的六条，没有第七条
// 只读成稿；逐项输出 PASS/FAIL。判法是关键词归类加四项硬核对，归不进任何一类的行逐条列出，不吞掉。
import { readFileSync, readdirSync } from 'node:fs';
const dir = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/';
const files = readdirSync(dir).filter(f => /^卷.*\.md$/.test(f)).sort();
const own = files.find(f => f.startsWith('卷二十一-'));
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const SIX = ['exposure', 'drive', 'write', 'overflow', 'materialize', 'sequela'];

// 读入：本卷的附录（脚本输出与改稿历史）不扫，其余各卷全文扫
const docs = {};
for (const f of files) {
  const raw = readFileSync(dir + f, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
  const cut = f === own ? raw.findIndex(l => l.startsWith('## 附录')) : -1;
  docs[f] = cut < 0 ? raw : raw.slice(0, cut);
}
const short = f => f.split('-')[0];
const ownLines = docs[own];
const ownText = ownLines.join('\n');

// 1 来路表：R21-1.5 之下恰六行，代号恰为六值，每行的定义处都是本卷写有条文的规则
const start = ownLines.findIndex(l => l.includes('| 新建原因（封闭枚举 `spawn_cause`） | 来路 | 定义处 |'));
const rows = [];
for (let i = start + 2; start >= 0 && i < ownLines.length && /^\s*\|/.test(ownLines[i]); i++) rows.push(ownLines[i].split('|').map(s => s.trim()).filter(Boolean));
const codes = rows.map(r => r[0].replace(/`/g, ''));
const defined = new Set([...ownText.matchAll(/^\s*- \*\*(R21-\d+\.\d+[a-z]?) /gm)].map(m => m[1]));
const badDef = rows.flatMap(r => (r[2].match(/R21-\d+\.\d+[a-z]?/g) ?? []).filter(id => !defined.has(id)).map(id => `${r[0]}→${id}`));
const noDef = rows.filter(r => !/R21-\d+\.\d+/.test(r[2] ?? '')).map(r => r[0]);
report(`1 来路表恰六行、代号恰为六值、定义处都是本卷已有条文（${rows.length} 行）`, rows.length === 6 && SIX.every(c => codes.includes(c)) && badDef.length + noDef.length === 0, [...badDef, ...noDef].join(' '));

// 2 全书凡列举 spawn_cause 取值的地方，都只有这六个值
const enumBad = []; let enumSites = 0;
for (const f of files) docs[f].forEach((l, i) => {
  for (const m of l.matchAll(/`spawn_cause`（([a-z ]+)[；）]/g)) { enumSites++; const vals = m[1].trim().split(/\s+/); if (vals.length !== 6 || !SIX.every(c => vals.includes(c))) enumBad.push(`${short(f)}:L${i + 1}:${m[1].trim()}`); }
});
report(`2 全书 spawn_cause 的取值列举都恰为六值（${enumSites} 处）`, enumSites > 0 && enumBad.length === 0, enumBad.join(' | '));

// 3 全书讲"几条来路"的地方只有"六条"；"第七条来路"只出现在否定句里
const cnBad = [];
for (const f of files) docs[f].forEach((l, i) => {
  for (const m of l.matchAll(/([一二两三四五六七八九十]|\d+) ?条来路/g)) {
    const prev = l[m.index - 1] ?? '';
    if (m[1] === '一' && /[经某哪任每同这]/.test(prev)) continue;            // "经一条来路"说的是其中一条，不是总数
    if (m[1] === '五' && l.slice(Math.max(0, m.index - 2), m.index) === '其余') continue; // "其余五条来路"= 六条去掉本条
    if (m[1] !== '六' && m[1] !== '6' && !(m[1] === '七' && /没有第七条来路/.test(l))) cnBad.push(`${short(f)}:L${i + 1}:${m[0]}`);
  }
});
report('3 全书"几条来路"只有六条，第七条只见于否定句', cnBad.length === 0, cnBad.join(' '));

// 4 后遗这一条来路由现成规则 R21-1.6 产生：条文在位，经同一个新建写入点，原因代号 sequela；数据里带 sequela 的行都指向已有的状态行
const r16 = ownLines.find(l => /^\s*- \*\*R21-1\.6 /.test(l)) ?? '';
const r16ok = r16.includes('`sequela`') && r16.includes('新建状态实例') && r16.includes('R21-1.5');
const jsonBlocks = []; { let buf = null; for (const l of ownLines) { if (/^```json/.test(l)) { buf = []; continue; } if (buf && /^```/.test(l)) { jsonBlocks.push(buf.join('\n')); buf = null; continue; } if (buf) buf.push(l); } }
const statusRows = {}; const objs = [];
for (const t of jsonBlocks) { try { const o = JSON.parse(t); objs.push(o); for (const [k, v] of Object.entries(o)) if (/^status_/.test(k) && v && typeof v === 'object' && v.family) statusRows[k] = v; } catch { /* 可解析性由主自检第 10 项报告 */ } }
const seqRows = Object.entries(statusRows).filter(([, r]) => r.sequela);
const seqBad = seqRows.filter(([, r]) => !statusRows[r.sequela.status]).map(([k, r]) => `${k}→${r.sequela.status}`);
report(`4 后遗来路出自 R21-1.6 且走同一写入点；数据里的后遗指向已有状态行（${seqRows.length} 行带后遗）`, r16ok && seqBad.length === 0, (r16ok ? '' : 'R21-1.6 条文缺要素 ') + seqBad.join(' '));

// 5 数据层：全书 json 里凡带"目标行"参数的效果族调用，族名都在本卷登记的写实例效果族之内（各归哪条来路写在右侧）
const famRoute = { eff_status_add: 'write', eff_care: 'write', eff_expose: 'exposure', eff_status_reduce: null, eff_status_clear: null };
const registered = new Set([...ownText.matchAll(/^\| `(eff_[a-z_]+)` \|/gm)].map(m => m[1]));
const famUse = {}; const famBad = [];
for (const f of files) docs[f].forEach((l, i) => {
  for (const m of l.matchAll(/"family"\s*:\s*"(eff_[a-z_]+)"\s*,\s*"params"\s*:\s*\{[^}]*"param_status"/g)) {
    famUse[m[1]] = (famUse[m[1]] ?? 0) + 1;
    if (!registered.has(m[1]) || !(m[1] in famRoute)) famBad.push(`${short(f)}:L${i + 1}:${m[1]}`);
  }
});
report(`5 全书带目标行参数的效果族调用都用本卷登记的族（${Object.entries(famUse).map(([k, n]) => `${k}×${n}`).join(' ')}）`, Object.keys(famUse).length > 0 && famBad.length === 0, famBad.join(' '));

// 7 逐行归类：全书凡写到"新建、写入、挂上状态实例"的行，归入六条来路之一，或归入不新建实例的四类说明；归不进的逐条列出
// 本卷里"实例"专指状态实例，用宽判法；别卷的"实例"还指建筑、物品，只认明写状态、容器、严重度的行
const tokenRe = /加严重度|染上|新建原因|spawn_cause|eff_status_add|eff_expose|eff_care/;
const ownWriteRe = /新建[^。；]{0,14}实例|建出?[^。；]{0,6}实例|写入[^。；]{0,16}实例|实例[^。；]{0,6}(?:新建|建出)/;
const otherWriteRe = /(?:新建|建出|写入|写出|挂上?|加|抬高|产生|造成|带来|给)[^。；|]{0,16}(?:状态实例|身体类状态|状态容器|容器实例|状态行的实例)|(?:状态实例|身体类状态|容器实例)[^。；|]{0,8}(?:新建|建出|写入|挂上)|[写挂][^。；，|]{0,8}本卷的容器|status 输出|实例则建/;
// 心理量容器不是身体状态：按 R21-1.1 的归属条归卷二十六（建撤 R26-3.2，推进 R26-4.4），单列一栏，不算来路
const gaugeRe = /心理量/;
const routeRe = {
  exposure: /暴露|eff_expose|染上|染病|传染|contagion|剂量|致病|病原/,
  drive: /驱动|越阈|driveRX|driveOnset|亏空/,
  write: /效果族|效果调用|eff_status_add|eff_care|档效果|受伤|伤害|处置|动作|事件|生成期|指名写入|`effects`|`outputs`|输出清单|照护|法术|神迹|`die`/,
  overflow: /溢出|overflow/,
  materialize: /实体化|materialize|由粗变细/,
  sequela: /后遗|sequela/,
};
const neutralRe = {
  '写入点与校验': /写入点|来路|落值|E-MED-|拒写|校验|复核|登记|回填|枚举/,
  '读实例与修正': /修正|chain=|View\(|`source` 取/,
  '禁止与不得': /不得|禁止|不许|不直接写|不写|不建|不新建|没有第七条|^\| P21-\d+ \|/,
  '只读与视图': /statusView|只读|读入口|视图|谓词/,
  '终止与清理': /终止|复生|清掉|清理|移除|结案/,
};
const ruleRoute = {}; for (const r of rows) for (const id of r[2].match(/R21-\d+\.\d+[a-z]?/g) ?? []) ruleRoute[id] = r[0].replace(/`/g, '');
const tally = {}; const loose = []; const gaugeLines = []; let hitLines = 0;
for (const f of files) {
  const t = tally[short(f)] = { 行: 0, exposure: 0, drive: 0, write: 0, overflow: 0, materialize: 0, sequela: 0, 说明: 0, 心理量: 0 };
  let ctx = null; // 本卷：所在规则条目若是来路表某行的定义处，条目内的续行与算式块随它归类
  docs[f].forEach((l, i) => {
    if (f === own) { const h = l.match(/^\s*- \*\*(R21-\d+\.\d+[a-z]?) /); if (h) ctx = ruleRoute[h[1]] ?? null; else if (/^#{2,4} /.test(l)) ctx = null; }
    if (!(tokenRe.test(l) || (f === own ? ownWriteRe : otherWriteRe).test(l))) return;
    hitLines++; t.行++;
    const rs = SIX.filter(k => routeRe[k].test(l) || (f === own && ctx === k));
    rs.forEach(k => t[k]++);
    const gauge = rs.length === 0 && gaugeRe.test(l);
    if (gauge) { t.心理量++; gaugeLines.push(`${short(f)}:L${i + 1}`); }
    const neutral = gauge || Object.values(neutralRe).some(re => re.test(l));
    if (rs.length === 0 && neutral && !gauge) t.说明++;
    if (process.argv.includes('--list') && f !== own) console.log(`   [${rs.join(',') || (neutral ? '说明' : '未归类')}] ${short(f)}:L${i + 1}:${l.trim().slice(0, 420)}`);
    if (rs.length === 0 && !neutral) loose.push(`${short(f)}:L${i + 1}:${l.trim().slice(0, 60)}`);
  });
}
for (const [v, t] of Object.entries(tally)) if (t.行) console.log(`   ${v}: 命中 ${t.行} 行；` + SIX.map(k => `${k} ${t[k]}`).join('，') + `；只作说明 ${t.说明}；心理量容器 ${t.心理量}`);
// 6 心理量容器的归属只在 R21-1.1 写一次，按固定代号认；本卷别处没有"心情除外"一类的点名排除
const r11 = ownLines.find(l => /^\s*- \*\*R21-1\.1 /.test(l)) ?? '';
const r11ok = ['`gauge` 族', '`container`', 'R26-3.2', 'R26-4.4', '只在这里写一次'].every(s => r11.includes(s));
const exceptBad = []; ownLines.forEach((l, i) => { if (/(?:心情|压力|士气|心理量|心智)[^。；]{0,8}(?:除外|例外|不在此列)|唯一的例外/.test(l)) exceptBad.push(`L${i + 1}`); });
const gaugeDefs = ownLines.filter(l => /`gauge` 族/.test(l)).length;
report(`6 心理量容器归属只在 R21-1.1 一处、按 gauge 族与 container 两个固定代号认；本卷无点名排除（全书归心理量容器的行 ${gaugeLines.length}：${gaugeLines.join(' ')}）`, r11ok && exceptBad.length === 0 && gaugeDefs === 1, [r11ok ? '' : 'R21-1.1 缺要素', ...exceptBad, gaugeDefs === 1 ? '' : `gauge 族出现 ${gaugeDefs} 行`].filter(Boolean).join(' '));
report(`7 全书写状态实例的行都归得进六条来路或不新建实例的说明（${files.length} 卷，命中 ${hitLines} 行，归不进 ${loose.length} 行）`, hitLines > 0 && loose.length === 0, '');
loose.forEach(s => console.log('   未归类 ' + s));

console.log(`扫描 ${files.length} 卷；来路 ${rows.length} 条；第七条来路 ${fails === 0 ? '未发现' : '未能排除'}；失败项 ${fails}`);
console.log('口径：第 7 项按关键词归类，一行可同时归入多条来路；它能发现归不进任何一类的写法，不能证明每行的归类都对。第 1 至 6 项是硬核对。尚未成稿的卷不在扫描之内。');
process.exit(fails ? 1 : 0);
