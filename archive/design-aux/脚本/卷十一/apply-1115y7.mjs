// 乙-1/乙-4 补卡 1115y7：照李白 11-15 17:0x 裁定（审查/李白裁定-1115-1705-待裁3行与不在六类.md）改写。
// 在 1115y6 改完的现行卷文上动手；先跑 transcribe-migrows.mjs 取现行 migrows。确定性、不手改。
// 一、M2-10a 拆 a1 a2 a3，M2-10b→sys.org，M2-12b→content-scripts；
// 二、旧表名 items、itemWear→item，materials→material（先核在卷二 22 个表代号里）；其余认不出的取落点锚点所在卷的系统键
//     （迁/交别卷的取接收卷，由 object-rules.mjs 从落点文字判），系统键从 乙4补-systems补全.json 读，原对象名写进落点作说明；
// 三、M14-82 对不上的旧字段逐个写去向，点不出覆盖规则的汇成 审查/脚本输出/乙7-卷十四待补清单.md；
// 四、恢复 y4c 勘误行被回改的旧数字（勘误记录是历史）。
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { receivingVolume } from './object-rules.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const mig = JSON.parse(readFileSync(`${HERE}/migrows-input.json`, 'utf8'));
const sysJ = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const sysOf = new Map(sysJ.map(s => [s.volume, s.system]));
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/`/g, '').trim();

// ---- 认类（同 check-objects-six.mjs）----
const regText = readFileSync(`${DIR}/${CFG.registry.file}`, 'utf8');
const tables = new Set();
for (const l of regText.split(/\r?\n/)) if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) tables.add(m[1]); }
const vocab = new Set([...regText.matchAll(/([a-z][a-z0-9_]*)→`[a-z]+_`/g)].map(m => m[1]));
const sysKeys = new Set([...sysJ.map(s => s.system), 'sys.capacity', 'sys.status']);
const groups = new Set(['kernel', 'inputEdge', 'display', 'gate', 'outputGate', 'aiGate', 'host', 'content-scripts']);
const gates = new Set(['cloud-gate', 'content-build-check', 'content-approve']);
const known = o => tables.has(o) || vocab.has(o) || o.startsWith('rules.') || sysKeys.has(o) || groups.has(o) || gates.has(o);

// ---- 找每行位置与列号 ----
function columns(head) {
  const h = head.map(strip); const pick = p => h.findIndex(p);
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
const edits = new Map(); const log = [];
const lineOf = k => { const w = where.get(k); if (!w) throw new Error('找不到行 ' + k); return { w, cs: FL.get(w.file)[w.idx].split(/(?<!\\)\|/) }; };
const push = (w, lines) => (edits.get(w.file) ?? edits.set(w.file, []).get(w.file)).push({ idx: w.idx, lines });
const noteAdd = (w, a, s) => { if (w.col.tgt >= 0) a[w.col.tgt + 1] = a[w.col.tgt + 1].replace(/\s*$/, '') + s + ' '; };

// ---- 一：待裁三行 ----
{ const { w, cs } = lineOf('M2-10a'); const c = w.col;
  const mk = (id, o, alias) => { const a = cs.slice(); a[1] = ` ${id} `; if (alias) { for (const i of [c.disp, c.tgt, c.obj]) a[i + 1] = ` 同 ${alias} `; } else a[c.obj + 1] = objCell(cs[c.obj + 1], o); return a.join('|'); };
  push(w, [mk('M2-10a', null, 'M2-10a1 至 M2-10a3'), mk('M2-10a1', 'sys.place'), mk('M2-10a2', 'sys.profession'), mk('M2-10a3', 'sys.economy')]);
  log.push('M2-10a 拆 a1 据点储量与再生规划→sys.place、a2 拜师需求→sys.profession、a3 价格底线→sys.economy（旧价已由卷六 M6-29、M6-30 删除，取被删内容所属系统）');
}
{ const { w, cs } = lineOf('M2-10b'); const a = cs.slice(); a[w.col.obj + 1] = objCell(cs[w.col.obj + 1], 'sys.org'); push(w, [a.join('|')]); log.push('M2-10b → sys.org（居留与公民资格归卷八；不新登 rules.civic）'); }
{ const { w, cs } = lineOf('M2-12b'); const a = cs.slice(); a[w.col.obj + 1] = objCell(cs[w.col.obj + 1], 'content-scripts'); push(w, [a.join('|')]); log.push('M2-12b → content-scripts（离线处理内容文本的脚本，算内容构建脚本）'); }

// ---- 二：认不出的对象整类改写 ----
const OLD = { items: 'item', itemWear: 'item', materials: 'material' };
// 1115y8c：原按行号的接收卷表删去，改由 object-rules.mjs 的 receivingVolume 从落点文字整类判（李白 11-15 17:28 第 1 条、chk-1115-y6）
const skip = new Set(['M2-10a', 'M2-10b', 'M2-12b', 'M11-7']);
const logTwo = []; const unresolved = [];
for (const r of mig.rows) {
  if (r.aliasOf || skip.has(r.rowKey)) continue;
  const o = r.targetObject.replace(/`/g, '').trim();
  if (known(o)) continue;
  let nu = null, why = '';
  if (o in OLD) { if (tables.has(OLD[o])) { nu = OLD[o]; why = '旧表名改现行表代号'; } else { unresolved.push([r.rowKey, o, `${OLD[o]} 不在 22 个表代号里`]); continue; } }
  else { const rv = receivingVolume(r.target, r.volume, CFG.volCode); nu = sysOf.get(rv.vol); why = `取落点锚点所在卷（${rv.vol === r.volume ? '本卷' : '接收卷' + rv.vol}）的系统键；${rv.how}`; }
  if (!nu) { unresolved.push([r.rowKey, o, why + '，系统键读不到']); continue; }
  const { w, cs } = lineOf(r.rowKey); const a = cs.slice();
  a[w.col.obj + 1] = objCell(cs[w.col.obj + 1], nu);
  noteAdd(w, a, `；原对象栏写 ${o}`);
  push(w, [a.join('|')]); logTwo.push(`${r.rowKey}：${o}→${nu}（${why}）`);
}

// ---- 三：M14-82 对不上的旧字段去向 ----
const DATA = '转世界内容数据，不进规则表';
const M14 = {
  a: { o: 'rules.profession', map: 'practice → rules.profession（kinds、lapseDays）', fields: [['dailyCaps', '退役，由卷十四 §4.3 SK-3（当日单项上限 dailyCap）覆盖'], ['stageSize', '待补'], ['maximum', '待补'], ['repeatMultiplier', '待补']] },
  b: { o: 'rules.growth', map: 'levels → rules.growth（maximum 对 levelThresholds，freeAttributePoints 对 attrPointsPerLevel）', fields: [['experience', '退役，由卷十四 §4.12 GR-2（levelThresholds 冻结成表）覆盖'], ['initial', '待补']] },
  c: { o: 'rules.learning', map: 'education → rules.learning', fields: [['examinations', DATA], ['minimumAge、maximumAge', '待补']] },
  d: { o: 'rules.learning', map: 'training → rules.learning（instructEffect、gapCurves、groupCurves）', fields: [['institutions 的机构、教师、门规、入门费、仪式', DATA]] },
  e: { o: 'rules.learning', map: 'books → rules.learning（readingMinutes 对 carrierLevelCurve）', fields: [['grades、minimumLiteracy', '待补']] },
  f: { o: 'rules.growth', map: 'npcGrowth → rules.growth（日后升级成长，不是初始技能）', fields: [['vocations', DATA], ['maximumGain、maximumProficiency、minimumPractice、switchCooldownDays、teach、work', '待补']] },
};
const todo14 = [];
for (const [s, d] of Object.entries(M14)) {
  const { w, cs } = lineOf('M14-82' + s); const a = cs.slice();
  a[w.col.tgt + 1] = ' ' + d.map + '；对不上的旧字段：' + d.fields.map(([f, t]) => `${f} → ${t}`).join('；') + ' ';
  push(w, [a.join('|')]);
  for (const [f, t] of d.fields) if (t === '待补') todo14.push([('M14-82' + s), f, d.map.split(' → ')[0]]);
}
log.push(`M14-82 六个子行的对不上旧字段已写去向：名单与数据行 ${Object.values(M14).flatMap(d => d.fields).filter(x => x[1] === DATA).length} 项写"${DATA}"，参数类 ${Object.values(M14).flatMap(d => d.fields).filter(x => x[1].startsWith('退役')).length} 项写"退役，由卷十四某规则覆盖"，点不出覆盖规则的 ${todo14.length} 项写待补`);

// ---- 落笔 ----
for (const [f, es] of edits) {
  const L = FL.get(f); es.sort((a, b) => b.idx - a.idx); const seen = new Set();
  for (const e of es) { if (seen.has(e.idx)) throw new Error(`同一行被改两次：${f}:${e.idx + 1}`); seen.add(e.idx); L.splice(e.idx, 1, ...e.lines); }
  writeFileSync(`${DIR}/${f}`, L.join('\n'));
}
// 四：恢复 y4c 勘误行被回改的旧数字（勘误记录是历史）
{ const p = `${DIR}/卷十一-迁移路线与卡清单.md`; let s = readFileSync(p, 'utf8');
  const bad = '待补清单第 2 项数字更新（数字随后由 1115y5、1115y6 勘误按脚本输出更新，现值见待补清单第 2 项）';
  if (s.includes(bad)) { s = s.replace(bad, '待补清单第 2 项数字更新（118、126、181）'); writeFileSync(p, s); log.push('卷十一 y4c 勘误行恢复原文（118、126、181），现值写在新勘误行'); } }

writeFileSync(`${OUT}/乙7-卷十四待补清单.md`, [
  '# 乙-1/乙-4 补 1115y7：卷十四待补清单（脚本生成，勿手改；交李白，不自己补设计）',
  '',
  '- 依据：李白 11-15 17:0x 裁定第三条；M14-82 的旧键 practice、levels、education、training、books、npcGrowth 在世界/meta/rules.json 里的字段，对不上卷十四 §2.5 各键、也点不出覆盖它的规则的，写待补。',
  '- 名单与数据行（examinations；institutions 的机构、教师、门规、入门费、仪式；vocations）不在此清单，子行里写"转世界内容数据，不进规则表"；dailyCaps、experience 已点名覆盖规则（SK-3、GR-2），也不在此清单。',
  '',
  '| 子行 | 旧字段 | 旧键 |', '|---|---|---|', ...todo14.map(x => `| ${x[0]} | ${x[1]} | ${x[2]} |`), '',
  `共 ${todo14.length} 行。`, '',
].join('\n'));
writeFileSync(`${OUT}/乙7-改写记录.md`, ['# 乙-1/乙-4 补 1115y7 改写记录（脚本生成，勿手改）', '', '依据：审查/李白裁定-1115-1705-待裁3行与不在六类.md；脚本 脚本/卷十一/apply-1115y7.mjs。', '', ...log.map(x => '- ' + x), '', `## 认不出对象整类改写（${logTwo.length} 行）`, '', ...logTwo.map(x => '- ' + x), '', `## 仍认不出、列给李白（${unresolved.length} 行）`, '', ...(unresolved.length ? unresolved.map(x => `- ${x[0]}（${x[1]}）：${x[2]}`) : ['无。']), ''].join('\n'));
console.log(log.join('\n')); console.log('整类改写', logTwo.length, '行；仍认不出', unresolved.length, '；卷十四待补', todo14.length);

// ---- 重新生成待裁清单（替代 1115y6 的版本）：现行卷文里对象仍是 rules、待裁、待补的行，加 M14-82 对不上旧字段的去向 ----
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
writeFileSync(`${OUT}/乙5-rules待裁清单.md`, [
  '# 乙-1/乙-4 补 1115y7：待裁清单（脚本生成，勿手改；按李白 11-15 17:0x 裁定改完后的现行卷文重新生成，替代 1115y6 的版本）',
  '',
  `- 现行卷文里落点对象仍是 rules、待裁、待补的迁移行：${rest.length} 行；其中 rules ${rest.filter(r => r.o === 'rules').length} 行、待裁 ${rest.filter(r => r.o === '待裁').length} 行、待补 ${rest.filter(r => r.o === '待补').length} 行。`,
  '- 17:0x 裁定的三行（M2-10a 拆三、M2-10b、M2-12b）已落点；改写记录见 审查/脚本输出/乙7-改写记录.md。',
  '',
  '| 迁移行 | 卷 | 对象 | 落点（原文） | 为什么 |', '|---|---|---|---|---|',
  ...rest.map(r => `| ${r.k} | ${r.vol} | ${r.o} | ${r.t.replace(/\|/g, '/').slice(0, 60)} | ${r.k === 'M11-7' ? '李白裁定：照旧待补，不算迁移处置，不进计数' : ''} |`),
  '',
  '## M14-82 对不上的旧字段的去向（李白第三条）',
  '',
  '| 子行 | 旧字段 | 去向 |', '|---|---|---|',
  ...Object.entries(M14).flatMap(([s, d]) => d.fields.map(([f, t]) => `| M14-82${s} | ${f} | ${t} |`)),
  '',
  `点不出覆盖规则、写待补的 ${todo14.length} 项汇成 审查/脚本输出/乙7-卷十四待补清单.md。`, '',
].join('\n'));
console.log('待裁清单', rest.length, '行');
