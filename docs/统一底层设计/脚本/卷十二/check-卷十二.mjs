// 卷十二 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十二/check-卷十二.mjs [成稿路径]
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷十二-验收与自动扫描.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 14;

const meta = []; let h2 = '', h3 = '', h4 = '', fence = null;
for (const line of lines) {
  let inFence = fence;
  if (/^```/.test(line)) { if (fence === null) { fence = line.slice(3).trim() || 'plain'; inFence = fence; } else { inFence = fence; fence = null; } }
  else if (fence === null) {
    if (/^## /.test(line)) { h2 = line; h3 = ''; h4 = ''; }
    else if (/^### /.test(line)) { h3 = line; h4 = ''; }
    else if (/^#### /.test(line)) { h4 = line; }
  }
  meta.push({ line, h2, h3, h4, fence: inFence });
}
const all = lines.join('\n');
const sec = re => meta.filter(m => re.test(m.h2)).map(m => m.line);
const sub = re => meta.filter(m => re.test(m.h3)).map(m => m.line);
const uniq = a => [...new Set(a)];
const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
const ticks = s => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表', '## 附录 待补清单'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8、术语表、待补清单齐全', miss2.length === 0, miss2.join(','));
// 卷十二 v2 合法改动（主会话 11-13）：署名行改为三段式，仍整行精确匹配
report('1b 卷首模型行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档'));
const need0 = ['### 0.1 范围', '### 0.2 依赖卷', '### 0.3 覆盖的卷零行', '### 0.4 参照的五款游戏行', '### 0.5 读法'];
report('1c §0 五小节齐全', need0.every(p => lines.includes(p)), need0.filter(p => !lines.includes(p)).join(','));

// 2 子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report(`2 ${N} 个子系统各六小节齐全`, miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

// 3 数据实例
const inst = [];
for (let n = 1; n <= N; n++) {
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null).map(m => m.line).filter(l => /^- 【/.test(l));
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report('3 数据实例至少三条，含非西陲、含非人类或超自然', inst.length === 0, inst.join(','));

// 4 验收断言三式且带编号
const asr = [];
for (let n = 1; n <= N; n++) {
  const s = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line);
  ['扫描式', '不变量式', '扩展性式'].forEach((k, i) => {
    const l = s.find(x => x.startsWith(`- ${k}：`));
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A12-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 无具体 id 字面量（卷零 S1 的前缀，外加生物前缀）
const idRe = /(?<![A-Za-z0-9_.])(item|loc|npc|bld|culture|monster|office|skill|profession|deity|faith|creature)_[a-z0-9]+/g;
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) idHits.push(`${i + 1}:${m[0]}`); });
report('5 正文无具体 id 字面量（含数据实例）', idHits.length === 0, idHits.slice(0, 8).join(','));

// 6 无用于判断的描述性文本；代号 ASCII；枚举带中英显示名
const cjk = /[\u3400-\u9fff]/;
const badTick = [];
lines.forEach((l, i) => { for (const t of ticks(l)) if (cjk.test(t) && !/.md$/.test(t)) badTick.push(`${i + 1}:${t}`); });
const judge = [];
lines.forEach((l, i) => { if (/(===|!==|includes\(|startsWith\(|indexOf\(|match\(|test\()\s*['"\/]/.test(l)) judge.push(i + 1); });
const enumRows = sub(/^### 2\.1 /).filter(l => /^\| /.test(l) && !/^\| ?(枚举|---)/.test(l) && !/^\|---/.test(l));
const enumBad = []; let enumVals = 0; const enumNames = [];
for (const l of enumRows) {
  const c = cells(l);
  if (c.length !== 4) { enumBad.push(l.slice(0, 30)); continue; }
  if (c[0]) enumNames.push(ticks(c[0])[0]);
  const v = ticks(c[1])[0];
  if (!v || !/^[a-z][a-z0-9_]*$/.test(v) || !cjk.test(c[2]) || !/^[A-Za-z][A-Za-z -]*$/.test(c[3])) enumBad.push(c[1]);
  enumVals++;
}
report(`6 无用于判断的描述性文本；反引号内无中文；枚举值为 ASCII 且带中英显示名（枚举 ${enumNames.length} 个、值 ${enumVals} 个）`,
  badTick.length === 0 && judge.length === 0 && enumBad.length === 0 && enumVals > 0,
  [badTick.slice(0, 5).join(','), judge.join(','), enumBad.join(',')].filter(Boolean).join(' / '));

// 7 台账各概念写全
const c7 = [];
const titleNeed = { 1: '点名实例', 2: '读文字', 3: '写入归属', 4: '常数', 5: '校验器', 6: '扩展性与验收套件', 7: '卷零覆盖核对', 8: '基线只降', 9: '两轮审查绑定内容哈希与门禁', 10: '主会话亲跑', 11: '登记表', 12: '文稿扫描', 13: '绕法用例集', 14: '判据修订与误报处置' };
for (const [n, k] of Object.entries(titleNeed)) if (!lines.some(l => l.startsWith(`### 4.${n} `) && l.includes(k))) c7.push(`标题4.${n}`);
const mapRows = sub(/^### 4\.7 /).filter(l => /^\| (S1|S2|S2b|S3|S4|S5|S6|I) \|/.test(l));
if (mapRows.length !== 8) c7.push(`卷零代号对照行=${mapRows.length}`);
for (const k of ['K-56', 'X-19', '必过集合', '逐行清单', '绕法用例', '确定性模板']) if (!all.includes(k)) c7.push(k);
const ruleCount = {}; let rulesTotal = 0;
for (let n = 1; n <= N; n++) {
  const rs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => m.line).map(l => (l.match(/^- \*\*R12-(\d+)\.(\d+) /) || []).slice(1)).filter(a => a.length);
  ruleCount[n] = rs.length; rulesTotal += rs.length;
  if (rs.length < 3) c7.push(`4.${n}规则数=${rs.length}`);
  rs.forEach((a, i) => { if (+a[0] !== n || +a[1] !== i + 1) c7.push(`R12-${a[0]}.${a[1]}不连续`); });
}
report('7 台账各概念写全（标题、卷零八代号对照、关键概念、每节有规则且编号连续）', c7.length === 0, c7.join(','));

// 8 编号引用不悬空且连续；跨卷引用至少一处带标题
const c8 = [];
const defR = new Set([...all.matchAll(/^- \*\*(R12-\d+\.\d+) /gm)].map(m => m[1]));
const defA = new Set([...all.matchAll(/^- (?:扫描式|不变量式|扩展性式)：(A12-\d+\.\d+) /gm)].map(m => m[1]));
const defS = [...all.matchAll(/^- \*\*(S12-\d+)\*\* /gm)].map(m => m[1]);
const defC = [...all.matchAll(/^\| (C12-\d+) \|/gm)].map(m => m[1]);
const defM = [...all.matchAll(/^\| (M12-\d+) \|/gm)].map(m => m[1]);
const defQ = [...all.matchAll(/^- \*\*(Q12-\d+)(?:（须李白定）)? ?/gm)].map(m => m[1]);
const seq = (arr, p) => arr.forEach((x, i) => { if (x !== `${p}-${i + 1}`) c8.push(`${x}序号`); });
seq(defS, 'S12'); seq(defC, 'C12'); seq(defM, 'M12'); seq(defQ, 'Q12');
const expand = (re, set, label) => {
  for (const m of all.matchAll(re)) if (!set.has(m[0])) c8.push(`${label}悬空:${m[0]}`);
};
expand(/R12-\d+\.\d+/g, defR, 'R'); expand(/A12-\d+\.\d+/g, defA, 'A');
expand(/S12-\d+/g, new Set(defS), 'S'); expand(/C12-\d+/g, new Set(defC), 'C');
expand(/M12-\d+/g, new Set(defM), 'M'); expand(/Q12-\d+/g, new Set(defQ), 'Q');
const xref = {};
for (const m of all.matchAll(/(卷[零一二三四五六七八九十]+b?) §(\d+(?:\.\d+)*)(（)?/g)) {
  const k = `${m[1]} §${m[2]}`; xref[k] = xref[k] || !!m[3];
}
const untitled = Object.entries(xref).filter(([k, v]) => !v && !/^卷十二 /.test(k)).map(([k]) => k);
if (untitled.length) c8.push('无标题引用:' + untitled.join('、'));
report(`8 编号引用不悬空且连续；跨卷引用带标题（跨卷章节 ${Object.keys(xref).length} 个）`, c8.length === 0, uniq(c8).slice(0, 12).join(','));

// 9 错误码、入口、规则表键、类别、检测器、模板、分量落实
const c9 = [];
const codeDef = sub(/^### 2\.12 /).map(l => (l.match(/^\| (E-ACC-[A-Z-]+) \|/) || [])[1]).filter(Boolean);
const codeUse = uniq([...all.matchAll(/E-ACC-[A-Z]+(?:-[A-Z]+)*/g)].map(m => m[0]));
codeUse.forEach(c => { if (!codeDef.includes(c)) c9.push(`码未定义:${c}`); });
const bodyNo212 = meta.filter(m => !/^### 2\.12 /.test(m.h3)).map(m => m.line).join('\n');
codeDef.forEach(c => { if (!new RegExp(c + '(?![A-Z-])').test(bodyNo212)) c9.push(`码未使用:${c}`); });
const entryDef = uniq([...sub(/^### 3\.1 /), ...sub(/^### 3\.2 /)].flatMap(l => ticks(l)).map(t => (t.match(/^(acc[A-Z]\w*)/) || [])[1]).filter(Boolean));
uniq([...all.matchAll(/`(acc[A-Z]\w*)/g)].map(m => m[1])).forEach(e => { if (!entryDef.includes(e)) c9.push(`入口未登记:${e}`); });
const keyDef = sub(/^### 2\.10 /).flatMap(l => ticks(l)).filter(t => t.startsWith('rules.accept.'));
uniq([...all.matchAll(/rules\.accept\.\w+/g)].map(m => m[0])).forEach(k => { if (!keyDef.includes(k)) c9.push(`键未定义:${k}`); });
const firstTick = re => sub(re).filter(l => /^\| `/.test(l)).map(l => ticks(cells(l)[0])[0]);
const detDef = firstTick(/^### 2\.3 /), clsDef = firstTick(/^### 2\.4 /), compDef = firstTick(/^### 2\.5 /).filter(c => c.startsWith('c_'));
const tplDef = sub(/^### 2\.8 /).filter(l => /^\| `det_/.test(l)).map(l => ticks(cells(l)[0])[0]);
const enumValsAll = enumRows.map(l => ticks(cells(l)[1])[0]);
const known = new Set([...detDef, ...clsDef, ...compDef, ...tplDef, ...enumValsAll, ...enumNames]);
const sec4 = sec(/^## §4 /).join('\n') + '\n' + sec(/^## §[567] /).join('\n');
for (const t of uniq(ticks(sec4))) {
  if (/^(doc_|det_|c_)[a-z0-9_]+$/.test(t) && !known.has(t)) c9.push(`代号未登记:${t}`);
}
clsDef.forEach(c => { if (!/^[a-z][a-z0-9_]*$/.test(c)) c9.push(`类别非 ASCII:${c}`); });
const writers = sub(/^### 3\.2 /).join('\n');
for (const w of ['register.mjs', 'run.mjs', '批准提交入口']) if (!writers.includes(w)) c9.push(`写者缺:${w}`);
report(`9 错误码、入口、规则表键、类别、检测器、模板、分量、写者落实（码 ${codeDef.length}、检测器 ${detDef.length}、类别 ${clsDef.length}、模板 ${tplDef.length}、分量 ${compDef.length}）`, c9.length === 0, uniq(c9).slice(0, 12).join(','));

// 10 红线
const c10 = [];
const head = lines.slice(0, 8).join('\n');
for (const k of ['不派任何实现卡', '不改变冻结状态', '不读墙钟', '凡除法写明除数下界']) if (!head.includes(k)) c10.push(`卷首缺:${k}`);
lines.forEach((l, i) => { if (/÷|除以/.test(l) && !/1000/.test(l)) c10.push(`第 ${i + 1} 行除法无下界`); });
if (/Date\.now|new Date\(|Math\.random/.test(all)) c10.push('出现墙钟或随机源调用');
if (!all.includes('只许收紧')) c10.push('缺只许收紧');
if (!/本卷不重写|判据不在本卷/.test(all)) c10.push('缺"判据不在本卷"');
for (const n of [1, 2, 3, 4]) if (!lines.some(l => l.startsWith(`- **R12-${n}.1 判据不在本卷**`))) c10.push(`R12-${n}.1 须为"判据不在本卷"`);
report('10 红线：不派实现、不解冻、不读墙钟、除数有下界、不重写别卷判据、只许收紧', c10.length === 0, c10.join(','));

// 11 算术与计数对账
const c11 = [];
const permille = +(sub(/^### 2\.10 /).find(l => l.includes('basisSamplePermille')) || '').split('|')[2];
const ex = all.match(/新增 (\d+) 个规则表数[\s\S]{0,80}?得 (\d+) 条/);
if (!ex) c11.push('缺抽检算例'); else if (Math.ceil(+ex[1] * permille / 1000) !== +ex[2]) c11.push(`抽检算例 ${ex[1]}→${ex[2]} 不符`);
const said = (re) => +((all.match(re) || [])[1] ?? NaN);
if (said(/现有 (\d+) 个检测器/) !== detDef.length) c11.push(`检测器数 ${detDef.length}`);
if (said(/现有 (\d+) 个模板/) !== tplDef.length) c11.push(`模板数 ${tplDef.length}`);
const zeroRows = sub(/^### 0\.3 /).filter(l => /^\| \d+\.\d+ /.test(l));
if (zeroRows.length !== 6) c11.push(`卷零主归行=${zeroRows.length}`);
const gateRows = sub(/^### 4\.9 /).filter(l => /^\| `(pre_commit|pre_test|pre_merge|phase_exit|seal|book_close)` \|/.test(l));
if (gateRows.length !== 6) c11.push(`关口行=${gateRows.length}`);
const sixN = lines.findIndex(l => l.startsWith('## §6 '));
const extItems = sec(/^## §6 /).filter(l => /^\d+\. \*\*/.test(l)).length;
if (!sec(/^## §6 /).join('').includes('九条') || extItems !== 9) c11.push(`§6 条数=${extItems}`);
report('11 算术复算与计数对账（抽检算例、检测器数、模板数、卷零 6 行、关口 6 行、§6 九条）', c11.length === 0 && sixN > 0, c11.join(','));

// 12 接口表、配合项、迁移清单、五款游戏、待补清单、素材位置落实
const c12 = [];
for (const h of ['### 5.1 本卷提供', '### 5.2 本卷读取', '### 5.3 需别卷配合的事项']) if (!lines.some(l => l.startsWith(h))) c12.push(h);
const games = sub(/^### 0\.4 /).filter(l => /^\| (DF|CDDA|RW|EVE|CK3) \|/.test(l)).length;
if (games !== 5) c12.push(`五款游戏行=${games}`);
const s7 = sec(/^## §7 /).join('\n');
for (const k of ['k8-guard.mjs', 'test-impact', 'derived-scan.mjs', 'seed-keys.mjs', 'digest-exclude.mjs', 'agriculture.mjs:305', 'weather.mjs:215', 'military.mjs:48', 'farm-pests.mjs:70', 'tests/invariants', 'docs/probes', 'content-pipeline.mjs:344', 'content-budget.mjs:218', 'playtest-budget.mjs:122'])
  if (!s7.includes(k)) c12.push(`§7 缺素材位置:${k}`);
const dispOk = defM.length >= 10 && sec(/^## §7 /).filter(l => /^\| M12-/.test(l)).every(l => /`(delete|recode|move_out|to_data|replace_entry)`|保留/.test(l));
if (!dispOk) c12.push('迁移行处置未对到五种或保留');
const todo = sec(/^## 附录 待补清单/).filter(l => /^\| \d+ \|/.test(l));
todo.forEach((l, i) => { if (+cells(l)[0] !== i + 1) c12.push('待补序号'); });
for (const m of all.matchAll(/待补清单第 (\d+) 项/g)) if (+m[1] > todo.length) c12.push(`待补引用越界:${m[1]}`);
for (const c of ['C11-4', 'Q11-6']) if (!all.includes(c)) c12.push(`未回应:${c}`);
report('12 接口表、配合项、本卷迁移清单、五款游戏、待补清单、素材位置落实', c12.length === 0, c12.join(','));

// 13 关键条文在位
const must = ['先登记，后执行', '判据通用，不点名', '命中只有两条出路', '门禁是拦，不是报', '前缀从数据来', '查的是值，不是写法', '归不了因就报',
  '分量按声明项派生', '出处抽检', '必过集合', '用新行', '改值对照', '确定性验收用模板', '三列要独立重算一遍', '行键不含行号', '只降判定',
  '批准绑定的是内容', '硬拦截', '审查者独立', '门禁自己的改动也过门禁', '不拿通过数当结论', '没跑的要写出来', '转录一次，按条数对账', '必须可机判',
  '参数只许是登记键', '封卷关口', '同类清查通则', '封卷后再现同类', '两种极性都要有', '新绕法当场入集', '不设例外名单', '误报靠改准判据消除',
  '修订前后全量对照', '结构登记不是例外名单', '不为过关改判据'];
const missMust = must.filter(k => !all.includes(`${k}**`));
report(`13 关键条文在位（${must.length} 条）`, missMust.length === 0, missMust.join(','));

const assertCount = defA.size;
console.log(`行数 ${all0.length}；子系统 ${N}；规则条数 ${rulesTotal}；断言 ${assertCount}；扫描条 ${defS.length}；配合项 ${defC.length}；开放问题 ${defQ.length}；本卷迁移行 ${defM.length}；枚举值 ${enumVals}；错误码 ${codeDef.length}；检测器 ${detDef.length}；扫描类别 ${clsDef.length}；确定性模板 ${tplDef.length}；待补清单 ${todo.length} 条；失败项 ${fails}`);
process.exitCode = fails ? 1 : 0;
