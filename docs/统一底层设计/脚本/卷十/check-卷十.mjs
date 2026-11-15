// 卷十 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷十-世界随机生成.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 12;

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
const sec = re => meta.filter(m => re.test(m.h2)).map(m => m.line).join('\n');
const sub = re => meta.filter(m => re.test(m.h3)).map(m => m.line).join('\n');

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表', '## 附录 待补清单'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8、术语表、待补清单齐全', miss2.length === 0, miss2.join(','));
// 卷十 v2 合法改动，二审 11-13：署名行改为三段（与卷七、卷八、卷九等改稿卷同式）
report('1b 卷首署名行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档'));
const need0 = ['### 0.1 范围', '### 0.2 依赖卷', '### 0.3 覆盖的卷零行', '### 0.4 参照的五款游戏行', '### 0.5 读法'];
report('1c §0 五小节齐全', need0.every(p => lines.includes(p)), need0.filter(p => !lines.includes(p)).join(','));

// 2 十二个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report('2 十二个子系统各六小节齐全', miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

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
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A10-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 规则与正文无具体 id 字面量（允许区：代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|flora|body|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|note|comp|class|terrain|biome|site|stratum|juris|clause|bank|pattern|word|nslot|shopkind|layout|zrole|bform|fixture|src|sink|purpose|resfam|pref|ck|evidence|gstage|gfield|igrp|idslot|aggk|simform|water|sphere|service|labor)_[a-z0-9][a-z0-9_]*/g;
const allowWords = new Set(['item_group', 'pref_kind', 'event_type', 'facility_type', 'body_plan', 'body_part', 'status_family', 'site_rule', 'class_rule']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 6 无用于判断的描述性文本
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
meta.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §[235] /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (m.fence === 'json' && /[\u4e00-\u9fff]/.test(m.line.replace(/"labels":\s*\{[^}]*\}/g, '').replace(/"basis":\s*"[^"]*"/g, ''))) textHits.push(`L${i + 1}(json)`);
  if (inRule && m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
});
// json 里每个条目都带中英 labels
let labelMiss = 0;
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 10).join(' '));

// 7 台账判给本卷的概念写全
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['生成总流程', '省郡骨架', '远方聚落按需物化', '名册与人口配额', '命名生成算法', '栖地派生（生成期）', '布局', '商店派生', '物品生成组', '写回同一数据格式', '程序生成生物接口', '历史生成接口', '开局缺省', '键域'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = sec(/^## §4 /);
const whole = sec(/^## §[2-4] /);
const codes = ['genPlan(', 'generateWorld(', 'requireMaterialized(', 'genView(', 'manifestOf(', 'quotaOf(', 'rosterOf(', 'composeName(', 'instanceIdOf(', 'rollGroup(', 'ageStructure(', 'materialized(', 'openingOf(', 'worldgen-writeback.mjs', 'gstage', 'gfield', 'item_group', 'idslot', 'gen_phase', 'gen_scope', 'group_mode', 'pick_kind', 'scale_by', 'skeleton_source', 'classify_mode', 'gen.speciesWeights', 'gen.homelandRX', 'gen.layout', 'gen.manifest', 'gen.quota', 'gen.shops', 'gen.share', 'state.genesis', 'state.genDone', 'epochMinute', 'openingMinute', 'nameParts', 'nameTable', 'openStocks', 'popApply', 'instantiatePerson', 'initialSkills', 'seedSkills', 'stationPlan', 'chooseForm', 'buildPlan', 'craftOutcome', 'stratumSkill', 'culturePref', 'shrineDemand', 'simUnitOf', 'E-GEN-STAGE-CYCLE', 'E-GEN-ROW-INVALID', 'E-GEN-OVERRIDE-AUTHORED', 'E-GEN-BYPASS', 'E-GEN-BRANCH-ORIGIN', 'E-GEN-ID-COLLISION', 'E-GEN-SKELETON', 'E-GEN-REJECT', 'E-GEN-NAME-EMPTY', 'E-GEN-GROUP-CYCLE', 'E-GEN-LATE-SOURCE', 'E-GEN-MANIFEST-DRIFT', 'E-GEN-DEFAULT', 'E-GEN-NOT-MATERIALIZED', 'stream.gen.name', 'site.gen.name.pattern'];
const missCode = codes.filter(c => !whole.includes(c));
const ruleIds = new Set(body4.match(/R10-\d+\.\d+/g) ?? []);
const gaps = [];
for (let n = 1; n <= N; n++) {
  const defs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => (m.line.match(/^- \*\*R10-(\d+)\.(\d+) /) ?? [])).filter(x => x.length).map(x => [+x[1], +x[2]]);
  if (!defs.length) gaps.push(`4.${n} 无规则条`);
  defs.forEach(([a, b], i) => { if (a !== n || b !== i + 1) gaps.push(`R10-${a}.${b}@4.${n}`); });
}
report('7 台账各概念写全（标题、关键代号、每节有规则且编号连续）', missKw.length === 0 && missCode.length === 0 && gaps.length === 0, [...missKw, ...missCode, ...gaps].join(','));

// 8 跨卷引用带标题；规则与断言编号引用不悬空
const refRe = /卷[零一二三四五六七八九十]+[b甲乙]? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/^## (§7|§8|附)/.test(m.h2)) return;
  if (/^### 5\.3 /.test(m.h3)) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
const defined = new Set(meta.map(m => (m.line.match(/^- \*\*(R10-\d+\.\d+) /) ?? [])[1]).filter(Boolean));
const dangling = [...new Set(all.match(/R10-\d+\.\d+/g) ?? [])].filter(r => !defined.has(r));
const definedA = new Set(all.match(/(?<=：)A10-\d+\.\d+/g) ?? []);
const danglingA = [...new Set(all.match(/A10-\d+\.\d+/g) ?? [])].filter(r => !definedA.has(r));
const definedS = new Set(all.match(/(?<=\*\*)S10-\d+(?=\*\*)/g) ?? []);
const danglingS = [...new Set(all.match(/S10-\d+/g) ?? [])].filter(r => !definedS.has(r));
const definedC = new Set(meta.filter(m => /^### 5\.3 /.test(m.h3)).map(m => (m.line.match(/^\| (C10-\d+) \|/) ?? [])[1]).filter(Boolean));
const danglingC = [...new Set(all.match(/C10-\d+/g) ?? [])].filter(r => !definedC.has(r));
const cSeq = [...definedC].map(x => +x.slice(4)); const cOk = cSeq.every((v, i) => v === i + 1);
report('8 跨卷引用带标题；R/A/S/C 编号引用不悬空', badRef.length === 0 && dangling.length === 0 && danglingA.length === 0 && danglingS.length === 0 && danglingC.length === 0 && cOk, [...badRef.slice(0, 8), ...dangling, ...danglingA, ...danglingS, ...danglingC].map(d => '' + d).join(' ') + (cOk ? '' : ' C10 编号不连续'));

// 9 json 代码块可解析；条目都带中英 labels
let badJson = 0; const blocks = []; let buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { try { blocks.push(JSON.parse(buf.join('\n'))); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 90)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
for (const b of blocks) for (const [k, v] of Object.entries(b)) if (!v.labels || !v.labels.zh || !v.labels.en) labelMiss++;
report(`9 json 代码块可解析且条目带中英 labels（${blocks.length + badJson} 块）`, badJson === 0 && labelMiss === 0, `bad=${badJson} labelMiss=${labelMiss}`);

// 10 红线
const r10 = [];
meta.forEach((m, i) => {
  if (m.fence !== null || /^## (附|§7|§8)/.test(m.h2)) return;
  if (/Date\.now|new Date|performance\.now|Math\.random|process\.env/.test(m.line)) r10.push(`L${i + 1}:墙钟或非登记随机`);
  if (/(规则|维度)$/.test(m.h4) && /÷/.test(m.line) && !/正整数|不做除法|恒为正|常数|除数下界归/.test(m.line)) r10.push(`L${i + 1}:除数未说明`);
});
const s26 = sub(/^### 2\.6 /);
for (const w of ['卷二 §3.3（求值管线）', 'extScale', '末份取差', '误差为 0']) if (!s26.includes(w)) r10.push('§2.6 缺 ' + w);
const s25 = sub(/^### 2\.5 /);
for (const p of ['state.genesis', 'state.genDone[placeId]', '`keep`']) if (!s25.includes(p)) r10.push('§2.5 缺 ' + p);
const ruleLines = meta.filter(m => /规则$/.test(m.h4)).map(m => m.line).join('\n');
if (/读事件日志/.test(ruleLines.replace(/不读[^。；]*事件日志/g, ''))) r10.push('规则层读事件日志');
report('10 红线：不读墙钟、除数有下界或为 0 分支、存法与去留登记、不读事件日志', r10.length === 0, r10.slice(0, 10).join(' | '));

// 11 数据实例算术复算
// 阶段数锚点修订 11-14（第0日生成内容提案定稿二：worldgen 阶段增为十七）：不写死个数。
// 从 §4.1.1 主表（json 块）逐行解析 gstage 条目，worldgen 相行数须与 §4.1.5 例句“N个 `worldgen` 相阶段”的 N 相等；第 12 项再与 JSON 解析结果三方互核。
const cnNum = s => { const d = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }; let n = 0, cur = 0; for (const ch of s) { if (ch === '十') { n += (cur || 1) * 10; cur = 0; } else if (ch in d) cur = d[ch]; else return NaN; } return n + cur; };
const stageLines = meta.filter(m => m.h4 === '#### 4.1.1 维度' && m.fence === 'json' && /^\s*"gstage_[a-z_]+":\s*\{/.test(m.line)).map(m => m.line);
const wgLines = stageLines.filter(l => /"phase":\s*"worldgen"/.test(l));
const exM = meta.filter(m => m.h4 === '#### 4.1.5 数据实例').map(m => m.line).join('\n').match(/([零一二两三四五六七八九十]+)个 `worldgen` 相阶段/);
const exCount = exM ? cnNum(exM[1]) : NaN;
const calc = [
  ['郡 列数', Math.ceil(Math.sqrt(4)), 2, '列数 `k = 2`'], ['郡 序位3 列', 3 % 2, 1, '序位 3 的郡在第 1 列第 1 行'], ['郡 序位3 行', Math.floor(3 / 2), 1, '第 1 列第 1 行'],
  ['面积 W', 3 + 1 + 2 + 2, 8, '`W = 8`'], ['面积 一', Math.floor(80000 * 3 / 8), 30000, '30000、10000、20000'], ['面积 二', Math.floor(80000 * 1 / 8), 10000, '30000、10000、20000'], ['面积 三', Math.floor(80000 * 2 / 8), 20000, '30000、10000、20000'], ['面积 末', 80000 - 60000, 20000, '80000 − 60000 = 20000'],
  ['海拔', 400 - 120 + 35, 315, '该单元海拔为 315'],
  ['份额和', 5000 + 2500 + 1500 + 1000, 10000, '5000、2500、1500、1000 基点'], ['集镇人数', Math.floor(3200 * 2500 / 10000), 800, '开局人数 800'],
  ['主文化', Math.floor(3200 * 8200 / 10000), 2624, 'floor(3200 × 8200 ÷ 10000) = 2624'], ['邻文化', 3200 - 2624, 576, '3200 − 2624 = 576'],
  ['物种一', Math.floor(2624 * 62 / 100), 1626, 'floor(2624 × 62 ÷ 100) = 1626'], ['物种二', Math.floor(2624 * 32 / 100), 839, 'floor(2624 × 32 ÷ 100) = 839'], ['物种末', 2624 - 1626 - 839, 159, '2624 − 1626 − 839 = 159'],
  ['取词', 1000003 % 40, 3, '1000003 mod 40 = 3'], ['可选槽', 412 >= 300 ? 1 : 0, 1, '412 不小于 300'],
  ['矿', 2100 < 2500 ? 1 : 0, 1, '抽得 2100，小于 2500'], ['频度基点', 0.25 * 10000, 2500, '0.25 即 2500 基点'],
  ['住处', Math.floor(800 / 5), 160, 'floor(800 ÷ 5) = 160'], ['店', Math.floor(420 / 150), 2, 'floor(420 ÷ 150) = 2'],
  ['片一', Math.round(9600 / (0.5 * 0.4)), 48000, '9600 ÷ (0.5 × 0.4) = 48000'], ['片二', Math.round(3000 / (0.3 * 0.4)), 25000, '3000 ÷ (0.3 × 0.4) = 25000'], ['片三', Math.round(600 / (0.2 * 0.4)), 7500, '600 ÷ (0.2 × 0.4) = 7500'], ['站点面积', Math.max(48000, 25000, 7500), 48000, '站点面积取 48000'],
  ['份数', Math.floor(160 * 900 / 1000), 144, 'floor(160 × 900 ÷ 1000) = 144'], ['余数', (160 * 900) % 1000, 0, '千分余数为 0'], ['件数', 144 * 2, 288, '共 288 件'],
  ['分配一', Math.floor(37 * 5 / 10), 18, 'floor(37 × 5 ÷ 10) = 18'], ['分配二', Math.floor(37 * 3 / 10), 11, 'floor(37 × 3 ÷ 10) = 11'], ['分配末', 37 - 18 - 11, 8, '37 − 18 − 11 = 8'],
  ['阶段数（§4.1.1 主表行 = §4.1.5 例）', wgLines.length > 0 ? wgLines.length : -1, exCount, exM ? exM[0] : '§4.1.5 例句「N个 `worldgen` 相阶段」'] // 锚点修订 11-14：由写死 14 改为主表逐行解析与例句互核（现文均为 17）
];
const badCalc = calc.filter(([, got, want]) => got !== want).map(([n]) => n);
const missNum = calc.filter(([, , , needle]) => !all.includes(needle)).map(([n, , , s]) => n + '缺原句:' + s);
// 分摊恒等：前几份向下取整、末份取差，和恒等于总量
const split = (total, ws) => { const W = ws.reduce((a, b) => a + b, 0); const out = ws.slice(0, -1).map(w => Math.floor(total * w / W)); out.push(total - out.reduce((a, b) => a + b, 0)); return out; };
const r11 = [];
for (const [t, ws] of [[3200, [8200, 1800]], [2624, [62, 32, 6]], [37, [5, 3, 2]], [80000, [3, 1, 2, 2]], [10000, [7, 3, 3]], [1, [1, 1, 1]]]) { const o = split(t, ws); if (o.reduce((a, b) => a + b, 0) !== t || o.some(x => x < 0)) r11.push('分摊 ' + t); }
report(`11 数据实例算术复算（${calc.length} 项加 6 组分摊恒等）`, badCalc.length === 0 && missNum.length === 0 && r11.length === 0, [...badCalc, ...missNum, ...r11].join(','));

// 12 接口与登记落实
const r12 = [];
const s31 = sub(/^### 3\.1 /), s32 = sub(/^### 3\.2 /);
const used = new Set();
meta.filter(m => /统一入口$/.test(m.h4)).forEach(m => { for (const x of m.line.matchAll(/`([a-z][A-Za-z]+)\(/g)) used.add(x[1]); });
const foreign = ['placeView', 'nameTable', 'speciesView', 'popApply', 'instantiatePerson', 'seedSkills', 'openStocks', 'post', 'entityId'];
for (const u of used) if (!s31.includes('`' + u + '(') && !s32.includes('`' + u + '(') && !foreign.includes(u)) r12.push('入口未进 §3: ' + u);
const s23 = sub(/^### 2\.3 /);
const usedKeys = new Set((sec(/^## §[3-6] /).match(/rules\.gen\.[A-Za-z]+\.[A-Za-z0-9]+/g) ?? []));
for (const k of usedKeys) { const grp = k.split('.').slice(0, 3).join('.'); if (!s23.includes('`' + k + '`') && !(grp === 'rules.gen.roles' && s23.includes('`' + k.split('.')[3] + '`')) && !s23.includes('`' + grp + '.*`')) r12.push('§2.3 缺键 ' + k); }
const s27 = sub(/^### 2\.7 /);
const usedErr = new Set(all.match(/E-GEN-[A-Z-]+[A-Z]/g) ?? []);
for (const e of usedErr) if (!s27.includes('| ' + e + ' |')) r12.push('§2.7 缺 ' + e);
const s21 = sub(/^### 2\.1 /);
for (const e of ['gstage', 'gfield', 'item_group', 'idslot', 'gen_phase', 'gen_scope', 'skeleton_source', 'group_mode', 'pick_kind', 'scale_by', 'classify_mode']) if (!s21.includes('| `' + e + '`')) r12.push('§2.1 缺 ' + e);
const s22 = sub(/^### 2\.2 /);
const usedGen = new Set(all.match(/gen\.(?:speciesWeights|homelandRX|homelandWeight|layout|manifest|quota|shops|share)\b/g) ?? []);
for (const g of usedGen) if (!s22.includes('| `' + g + '`')) r12.push('§2.2 缺 ' + g);
const anyGen = new Set((all.match(/`gen\.[a-zA-Z]+`/g) ?? []).map(x => x.slice(1, -1)));
for (const g of anyGen) if (!s22.includes('| `' + g + '`')) r12.push('未登记的生成维度 ' + g);
// 抽取点登记
const s4121 = meta.filter(m => m.h4 === '#### 4.12.1 维度').map(m => m.line).join('\n');
const usedStream = new Set(all.match(/(?:stream|site)\.gen\.[a-z]+(?:\.[a-z]+)?/g) ?? []);
for (const k of usedStream) if (!s4121.includes(k)) r12.push('§4.12.1 缺 ' + k);
// 阶段条目：after 引用存在、无环、materialize 不在 worldgen 之前
const stages = blocks.find(b => Object.keys(b).some(k => k.startsWith('gstage_')));
if (!stages) r12.push('缺首批阶段条目'); else {
  const seen = new Set(), stack = new Set();
  const visit = k => { if (stack.has(k)) { r12.push('阶段成环 ' + k); return; } if (seen.has(k)) return; stack.add(k); for (const a of stages[k].after) { if (!stages[a]) r12.push('after 悬空 ' + a); else { if (stages[k].phase === 'worldgen' && stages[a].phase === 'expand') r12.push('相序颠倒 ' + k); visit(a); } } stack.delete(k); seen.add(k); };
  Object.keys(stages).forEach(visit);
  // 卷十 v2 合法改动，二审 11-13：gen_phase 三值 worldgen/opening/expand（T2 增 opening；小项 5 materialize 改名 expand）
  for (const v of Object.values(stages)) { if (!['worldgen', 'opening', 'expand'].includes(v.phase)) r12.push('phase 越界'); if (!['world', 'region', 'unit', 'site', 'tract'].includes(v.scope)) r12.push('scope 越界'); }
  // 锚点修订 11-14：每条字段齐（§2.1 gstage 行必填字段 + labels 中英）
  for (const [k, v] of Object.entries(stages)) { const miss = ['phase', 'scope', 'after', 'before', 'generator', 'writesKinds', 'whenRX', 'labels'].filter(f => !(f in v)); if (!Array.isArray(v.after) || !Array.isArray(v.before) || !Array.isArray(v.writesKinds) || typeof v.generator !== 'string' || !v.labels?.zh || !v.labels?.en) miss.push('类型'); if (miss.length) r12.push(k + ' 缺字段 ' + miss.join('/')); }
  // 锚点修订 11-14：不写死 14；JSON 解析的 worldgen 条目数 = §4.1.1 主表逐行数 = §4.1.5 例句个数（现文 17）
  const wgJson = Object.values(stages).filter(v => v.phase === 'worldgen').length;
  if (Object.keys(stages).length !== stageLines.length) r12.push(`阶段条目 JSON ${Object.keys(stages).length} 与主表行 ${stageLines.length} 不符`);
  if (wgJson !== wgLines.length || wgJson !== exCount) r12.push(`worldgen 阶段数不一致：JSON ${wgJson}、主表行 ${wgLines.length}、§4.1.5 例 ${exCount}`);
}
const s5 = sec(/^## §5 /);
for (const v of ['卷二', '卷三乙', '卷四', '卷五', '卷六', '卷七', '卷八', '卷九', '卷十四', '卷十八', '卷十九', '卷二十', '卷二十五', '卷二十七']) if (!new RegExp(`^\\| ${v} \\|`, 'm').test(s5)) r12.push('§5.2 缺 ' + v);
if (definedC.size < 15) r12.push('配合项过少');
const s7 = sec(/^## §7 /);
for (const f of ['remote-generation.mjs:109–111', ':149–150', 'remote-generation.mjs:146', 'remote-generation.mjs:149', 'remote-generation.mjs:200–209', 'remote-generation.mjs:279–281', 'remote-generation.mjs:318', 'remote-generation.mjs:341', 'remote-generation.mjs:407', ':423', 'remote-generation.mjs:411', 'remote-generation.mjs:416–417', 'remote-generation.mjs:120', 'remote-generation.mjs:238', 'remote-generation.mjs:538', ':539', 'remote-generation.mjs:143', ':324', ':453', 'remote-generation.mjs:263', ':321', ':322', ':323', 'remote-generation.mjs:115', 'population.mjs:88', 'remote-generation.mjs:723', 'population.mjs:384', ':392', 'population.mjs:411', 'population.mjs:33–36', ':62', ':69', ':99', ':371', 'population.mjs:407', ':409', 'wildlife-habitats.mjs', 'habitatDerivation', 'regions.mjs:44', ':58', '06a §1', '06a §8', '06b C 类', '06b E 类', '06b 待定 1']) if (!s7.includes(f)) r12.push('§7 缺 ' + f);
const s03 = sub(/^### 0\.3 /);
// 第 12 项 §0.3 主归行（李白裁定第 21 条后不写死）：卷零 A、B 两表"主归卷"列第一个词为卷十的行号集合，
// 须与本卷 §0.3"A 表主归 N 行：…""B 表主归 N 行：…"所列行号集合、两处 N 一致；"合计 N 行"与"卷十行 a/b/t"须等于卷零 §6 卷十行的三数，也等于两表实数。
{
  const DIR0 = path.replace(/[\/][^\/]*$/, '');
  const f0 = (await import('node:fs')).readdirSync(DIR0).find(f => /^卷零.*\.md$/.test(f));
  const z = f0 ? readFileSync(DIR0 + '/' + f0, 'utf8').split('\n').map(l => l.replace(/\r$/, '')) : [];
  if (!z.length) r12.push('未找到卷零');
  const own = { A: new Set(), B: new Set() }; let h2z = '', col = -1, tb = null;
  for (const l of z) {
    if (/^## /.test(l)) { h2z = l; tb = /^## §2 /.test(l) ? 'A' : /^## §3 /.test(l) ? 'B' : null; col = -1; continue; }
    if (!tb || !l.startsWith('|')) { col = -1; continue; }
    const cs = l.split('|').slice(1, -1).map(c => c.trim());
    if (col < 0) { col = cs.findIndex(c => /主归/.test(c)); continue; }
    if (/^[\s:-]+$/.test(cs.join(''))) continue;
    const id = cs[0].match(/^(\d+\.\d+)/)?.[1];
    if (id && /^卷十(?![一二三四五六七八九十])/.test(cs[col] ?? '')) own[tb].add(id);
  }
  const s6 = z.find(l => /^\| 卷十 /.test(l))?.split('|').slice(1, -1).map(c => c.trim()) ?? [];
  const [a6, b6, t6] = [s6[1], s6[2], s6[3]].map(Number);
  const list = k => { const m = s03.match(new RegExp(k + ' 表主归 (\\d+) 行：([^。；]*)')); return m ? { n: +m[1], ids: new Set([...m[2].replace(/（[^）]*）/g, '').matchAll(/(\d+\.\d+)/g)].map(x => x[1])) } : null; };
  const LA = list('A'), LB = list('B');
  const eq = (x, y) => x.size === y.size && [...x].every(e => y.has(e));
  for (const [k, L, n6] of [['A', LA, a6], ['B', LB, b6]]) {
    if (!L) { r12.push(`§0.3 缺"${k} 表主归 N 行：…"`); continue; }
    if (!eq(L.ids, own[k])) r12.push(`§0.3 ${k} 表主归行 {${[...L.ids]}} ≠ 卷零${k}表主归卷十 {${[...own[k]]}}`);
    if (L.n !== L.ids.size || L.n !== own[k].size || L.n !== n6) r12.push(`§0.3 ${k} 表主归 ${L.n} 行，列 ${L.ids.size}，卷零表实数 ${own[k].size}，卷零 §6 ${n6}`);
  }
  const tot = s03.match(/合计 (\d+) 行[^。]*?卷十行 (\d+)\/(\d+)\/(\d+)/);
  if (!tot) r12.push('§0.3 缺"合计 N 行…卷十行 a/b/t"');
  else if (+tot[1] !== t6 || +tot[2] !== a6 || +tot[3] !== b6 || +tot[4] !== t6 || a6 + b6 !== t6 || t6 !== own.A.size + own.B.size) r12.push(`§0.3 合计 ${tot[1]}（自报 ${tot[2]}/${tot[3]}/${tot[4]}）≠ 卷零 §6 ${a6}/${b6}/${t6}（两表实数 ${own.A.size}/${own.B.size}）`);
}
const todo = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line)).length;
if (todo < 5) r12.push('待补清单过少');
report('12 接口、入口表、规则表键、错误码、枚举、生成维度、抽取点、阶段条目、迁移清单落实', r12.length === 0, r12.slice(0, 14).join(' | '));

// 13 关键条文在位
const r13 = [];
// 卷十 v2 合法改动，二审 11-13：R10-3.8 收窄为形制类只由（种子、地点）定（T4），锚点照录现文；第 0 日时刻改名 genesisMinute（小项 5）
for (const [name, needle] of [['第 0 日之后无来源', '第 0 日之后不再有任何来源腿'], ['物化只由种子与地点定', '房间行与全部 id 只由（世界种子、地点）定'], ['不重掷', '不合格即拒绝，不重掷'], ['时刻段', '时刻段恒取 `genesisMinute`'], ['模型不写规则字段', '模型不写人物档的规则字段'], ['不按来源分支', '规则层按生成标记分支即 E-GEN-BRANCH-ORIGIN'], ['北极星 建筑', '每一栋怎么盖，由料、技能、意图推出'], ['北极星 器物', '器物的材料与品质由料、技能、意图推出'], ['无缺省出生地', '没有缺省出生地'], ['命名不重抽', '音节预算是筛选，不是重掷']]) if (!all.includes(needle)) r13.push('缺：' + name);
report('13 关键条文在位（无后来源、物化纯函数、不重掷、键的时刻段、模型不写规则字段、北极星两条）', r13.length === 0, r13.join(' | '));

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${defined.size}；断言 ${definedA.size}；扫描条 ${definedS.size}；配合项 ${definedC.size}；json 块 ${blocks.length}；待补清单 ${todo} 条；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
