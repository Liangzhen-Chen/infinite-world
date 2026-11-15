// 卷二十六 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷二十六-需求心理与情绪.md';
const lines = readFileSync(path, 'utf8').split('\n');
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

// ---- 分区：给每一行标注所在章、子系统小节、是否在代码块内 ----
const meta = []; let h2 = '', h3 = '', h4 = '', fence = null;
for (const raw of lines) {
  const line = raw.replace(/\r$/, '');
  let inFence = fence;
  if (/^```/.test(line)) { if (fence === null) { fence = line.slice(3).trim() || 'plain'; inFence = fence; } else { inFence = fence; fence = null; } }
  else if (fence === null) {
    if (/^## /.test(line)) { h2 = line; h3 = ''; h4 = ''; }
    else if (/^### /.test(line)) { h3 = line; h4 = ''; }
    else if (/^#### /.test(line)) { h4 = line; }
  }
  meta.push({ line, h2, h3, h4, fence: inFence });
}

// 1. §0–§8 与附表齐全
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8 与术语表齐全', miss2.length === 0, miss2.join(','));

// 2. 九个子系统，各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= 9; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.some(l => l.replace(/\r$/, '') === `#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
report('2 九个子系统各六小节齐全', miss4.length === 0, miss4.join(','));

// 3. 数据实例：每节至少 3 条，含非西陲、含非人类或超自然
const inst = [];
for (let n = 1; n <= 9; n++) {
  const sec = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null).map(m => m.line);
  const tagged = sec.filter(l => /^- 【/.test(l));
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report('3 数据实例数量与两类覆盖', inst.length === 0, inst.join(','));

// 4. 验收断言三式
const asr = [];
for (let n = 1; n <= 9; n++) {
  const sec = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line).join('\n');
  for (const k of ['扫描式', '不变量式', '扩展性式']) if (!sec.includes(k)) asr.push(`4.${n}:${k}`);
}
report('4 验收断言三式齐全', asr.length === 0, asr.join(','));

// 5. 正文无具体 id 字面量（允许区：json 代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|flora|body|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|pers|value|need|gauge|thought|episode|drive|sfam|class|comp|verb|rel|sg|param|req)_[a-z0-9][a-z0-9_]*/g;
const allowWords = new Set(['status_delta_direction', 'status_family', 'status_target', 'gauge_mode', 'thought_trigger', 'thought_role', 'episode_pick', 'body_plan', 'body_part', 'law_code']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6. 规则、统一入口、§3 中无文字匹配写法；json 块里中文只在 basis / labels 行
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
meta.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §3 /.test(m.h2) || /^## §2 /.test(m.h2) || /^## §5 /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (m.fence === 'json' && /[\u4e00-\u9fff]/.test(m.line) && !/"basis"|"labels"/.test(m.line)) textHits.push(`L${i + 1}(json)`);
  if (inRule && m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
});
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 8).join(' '));

// 7. 台账判给本卷的概念都已写全（标题关键词 + 关键代号出现在 §4 规则里）
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['人格向量', '联合分布', '价值', '偏好', '心理需求', '想法', '心情', '压力', '崩溃', '疯狂', '灵感', '士气', '决策噪声接口'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
const codes = ['personality', 'values', 'prefOffset', 'preference', 'gaugeTarget', 'gaugeInflow', 'driveWeight', 'decisionNoise', 'decisionJitter', 'needSatisfiers', 'psych.episodes'];
const missCode = codes.filter(c => !body4.includes(c));
const ruleIds = new Set(body4.match(/R26-\d\.\d+/g) ?? []);
const perSub = []; for (let n = 1; n <= 9; n++) if (![...ruleIds].some(r => r.startsWith(`R26-${n}.`))) perSub.push(n);
report('7 台账六项概念写全', missKw.length === 0 && missCode.length === 0 && perSub.length === 0, [...missKw, ...missCode, ...perSub.map(n => 'no-rule-4.' + n)].join(','));

// 8. 不越界：不登记身体需要的容器行；不定义价值轴
const bodyRows = meta.filter(m => m.fence === 'json' && /"status_[a-z_]+":\s*\{"family":\s*"sfam_(hunger|thirst|fatigue|sleep)"/.test(m.line)).length;
const valueDefs = meta.filter(m => m.fence === 'json' && /^\s*"value_[a-z_]+":\s*\{/.test(m.line)).length;
report('8 不越界（身体需要容器、价值轴定义为 0）', bodyRows === 0 && valueDefs === 0, `body=${bodyRows} value=${valueDefs}`);

// 9. 引用别卷一律"卷X §n（标题）"
const refRe = /卷[零一二三四五六七八九十]+b? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
report('9 跨卷引用带标题', badRef.length === 0, badRef.slice(0, 8).join(' '));

// 10. json 代码块可解析（去掉行尾注释后）
let badJson = 0, nJson = 0; var buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { nJson++; try { JSON.parse(buf.join('\n')); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 90)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
report(`10 json 代码块可解析（${nJson} 块）`, badJson === 0, `bad=${badJson}`);


// ---- 以下各项用到全部 json 块合并后的数据 ----
const pairBlock = meta.filter(m => m.fence === 'json').map(m => m.line).join('\n');
const data = {}; const blocks = []; buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { try { const o = JSON.parse(buf.join('\n')); blocks.push(o); for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v) && data[k] && typeof data[k] === 'object') Object.assign(data[k], v); else if (!(k in data)) data[k] = v; } } catch { /* 已在第 10 项报过 */ } buf = null; continue; }
  if (buf) buf.push(m.line);
}
const firstBatch = blocks.find(b => Array.isArray(b.pers) && Array.isArray(b.gauge)) ?? {};

// 11. 人格联合分布：卷二 joint 格式（完整 marginals + corr 方阵 + axes），对称、对角 1、半正定
const J = data.personality_default ?? {};
const axes = J.axes ?? []; const C = J.corr ?? []; const n = axes.length;
let jOk = n === 12 && C.length === n && C.every(r => Array.isArray(r) && r.length === n)
  && JSON.stringify([...axes].sort()) === JSON.stringify(Object.keys(J.marginals ?? {}).sort())
  && JSON.stringify(axes) === JSON.stringify(firstBatch.pers) && !('corrPairs' in J);
if (jOk) for (let i = 0; i < n; i++) { if (C[i][i] !== 1) jOk = false; for (let j = 0; j < n; j++) if (C[i][j] !== C[j][i]) jOk = false; }
let psd = jOk; let pairsN = 0;
if (jOk) {
  const L = axes.map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = C[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; if (i === j) { if (s < -1e-12) psd = false; L[i][j] = Math.sqrt(Math.max(s, 0)); } else { L[i][j] = L[j][j] === 0 ? 0 : s / L[j][j]; if (C[i][j] !== 0) pairsN++; } }
}
report(`11 人格联合分布为卷二 joint 格式且半正定（${n} 轴 ${pairsN} 个非零对）`, jOk && psd);

// 12. 首批代号闭合：pers / drive / need / gauge / status / effect 都有数据行；need→gauge→status 链闭合；pstage 双向一致（卷七牵连勘误加祭仪需求与容器各一行：need 4→5、gauge 7→8，主会话改）
const undef = [];
for (const fam of ['pers', 'drive', 'need', 'gauge', 'status', 'effect']) for (const c of firstBatch[fam] ?? []) if (!data[c] || typeof data[c] !== 'object') undef.push(c);
for (const c of firstBatch.need ?? []) { const g = data[c]?.gauge; if (!g || !(firstBatch.gauge ?? []).includes(g)) undef.push(c + '→gauge'); }
for (const c of firstBatch.gauge ?? []) { const s = data[c]?.container; if (!s || !data[s] || !data[s].family) undef.push(c + '→status'); else if (!(firstBatch.status ?? []).includes(s)) undef.push(s + '(未列入首批)'); }
const usedStages = new Set(); const mentalRows = Object.entries(data).filter(([k, v]) => /^status_/.test(k) && v && v.target === 'mind');
for (const [, v] of mentalRows) for (const st of v.stages ?? []) usedStages.add(st.id);
for (const s of usedStages) if (!(firstBatch.pstage ?? []).includes(s)) undef.push('pstage 未登记:' + s);
for (const s of firstBatch.pstage ?? []) if (!usedStages.has(s)) undef.push('pstage 未使用:' + s);
report('12 首批 pers/drive/need/gauge/status/effect 均有数据行，need→gauge→status 闭合，pstage 一致', (firstBatch.need ?? []).length === 5 && (firstBatch.gauge ?? []).length === 8 && undef.length === 0, undef.join(','));

// 13. 已废弃的写法不再出现（附录三、附录四是改动说明，可提及旧名）
const banned = ['persInnate', 'valueOffset', 'severityInitial', 'initialRX', 'corrPairs', 'decisionKey', 'closedForm', '<each axis>', '卷一 §8.2', '"bind":', '统计容差内', 'rules.psych.tickMinutes', '定点截断误差乘以拍数'];
const bannedHits = [];
meta.forEach((m, i) => { if (/^## 附录[三四]/.test(m.h2)) return; for (const b of banned) if (m.line.includes(b)) bannedHits.push(`L${i + 1}:${b}`); });
report('13 已废弃写法为 0（另设人格字段、重复初值、容差式路径、序号键等）', bannedHits.length === 0, bannedHits.slice(0, 8).join(' '));

// 14. 逐条出处：pers / drive / gauge / thought / episode 数据行与 psych.json 各键都带 basis
const noBasis = [];
for (const [k, v] of Object.entries(data)) if (/^(pers|drive|gauge|thought|episode)_/.test(k) && v && typeof v === 'object' && (!v.basis || !v.status)) noBasis.push(k);
const table = blocks.find(b => b.version === 1 && b.episodeTickMinutes) ?? {};
for (const [k, v] of Object.entries(table)) if (k !== 'version' && (!v || typeof v !== 'object' || !('value' in v) || !v.basis)) noBasis.push('psych.json:' + k);
report('14 数值条目逐条带 basis', Object.keys(table).length > 10 && noBasis.length === 0, noBasis.slice(0, 10).join(','));

// 15. 心智类容器约束：档代号在 pstage 族；duration 为空；初值只在容器行（追随型为空、累积型与发作非空）；心理量容器 perDay 为空
const cBad = [];
for (const [k, v] of mentalRows) {
  if ((v.stages ?? []).some(st => !/^pstage_/.test(st.id))) cBad.push(k + ':stage');
  if (v.duration !== null && v.duration !== undefined) cBad.push(k + ':duration');
}
for (const [k, v] of Object.entries(data)) {
  if (/^gauge_/.test(k) && v && typeof v === 'object' && v.container && data[v.container]) {
    const sv = data[v.container].severity ?? {};
    if (sv.perDay !== null) cBad.push(v.container + ':perDay');
    if (v.mode === 'track' && sv.initial !== null) cBad.push(v.container + ':track-initial');
    if (v.mode === 'integrate' && typeof sv.initial !== 'number') cBad.push(v.container + ':integrate-initial');
    if (!Number.isInteger(v.tickMinutes) || v.tickMinutes < 1) cBad.push(k + ':tickMinutes');
    if (v.mode === 'track' && typeof v.ratePerDay !== 'number') cBad.push(k + ':ratePerDay');
  }
  if (/^episode_/.test(k) && v && typeof v === 'object' && v.container && data[v.container] && typeof data[v.container].severity?.initial !== 'number') cBad.push(v.container + ':episode-initial');
}
report('15 心智类容器约束（档代号、时长、初值唯一处、拍长）', mentalRows.length >= 10 && cBad.length === 0, cBad.join(','));

// 16. 发作 severity 可升降：每个多档发作容器的每一档可达（门槛不高于初值，或 untended 为正）
const unreachable = [];
const epStatuses = new Set(Object.entries(data).filter(([k, v]) => /^episode_/.test(k) && v && typeof v === 'object').map(([, v]) => v.container));
for (const s of epStatuses) { const row = data[s]; if (!row) continue; const init = row.severity?.initial; const up = row.severity?.perDay?.untended ?? 0;
  for (const st of row.stages ?? []) if (st.minSeverity > init && !(up > 0)) unreachable.push(s + ':' + st.id); }
const body4b = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
report('16 发作容器每一档可达，且有 R26-5.10 / R26-6.6', unreachable.length === 0 && body4b.includes('R26-5.10') && body4b.includes('R26-6.6'), unreachable.join(','));

// 17. 奇想完成条件结构化：带 matchDim 的绑定项都有 need、families，所在发作行有 exitOnVerb
const bindBad = []; let matchBinds = 0;
for (const [k, v] of Object.entries(data)) if (/^episode_/.test(k) && v && Array.isArray(v.binds)) for (const b of v.binds) {
  if (!b.dimension || !['weighted', 'top'].includes(b.pick) || !Number.isInteger(b.count)) bindBad.push(k + ':shape');
  if (b.matchDim) { matchBinds++; if (!Number.isInteger(b.need) || b.need < 1 || b.need > b.count || !Array.isArray(b.families) || !v.exitOnVerb) bindBad.push(k + ':match'); }
}
report(`17 奇想完成条件为结构化代号匹配（${matchBinds} 个带 matchDim 的绑定项）`, matchBinds >= 3 && bindBad.length === 0, bindBad.join(','));

// 18. 扫描把守：§3.5 有 P26-1 至 P26-9；P26-7/P26-8 给出闭集与污点判据；错误码登记
const sec35 = meta.filter(m => /^### 3\.5 /.test(m.h3)).map(m => m.line).join('\n');
const sec26 = meta.filter(m => /^### 2\.6 /.test(m.h3)).map(m => m.line).join('\n');
const scanMiss = [];
for (let i = 1; i <= 9; i++) if (!sec35.includes(`| P26-${i} |`)) scanMiss.push('P26-' + i);
for (const w of ['psychReaders', 'E-VIEW-UNDECLARED-READ', 'E-PSY-INTERNAL-BRANCH', 'E-VIEW-BYPASS-CATALOG', 'pstage']) if (!sec35.includes(w)) scanMiss.push(w);
for (const w of ['E-PSY-INTERNAL-BRANCH', 'E-PSY-DELTA-DIRECTION', 'E-PSY-JOINT-AXES', 'E-PSY-COMPONENT', 'E-PSY-BASIS']) if (!sec26.includes(w)) scanMiss.push('2.6:' + w);
report('18 心理只经修正项的扫描把守（P26-1 至 P26-9、读者闭集、污点判据）', scanMiss.length === 0, scanMiss.join(','));

// 19. 现状与迁移：裁定点名的旧读写点全部列入 §7
const sec7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
const mustList = ['contracts.mjs:45', 'magic-mind-space.mjs:230', ':239', ':333', 'magic-ritual.mjs:316', ':405', 'npc-decision.mjs:25', 'magic-consent.mjs:109', 'magic-ritual.mjs:242',
  'entity-view.mjs:29', 'action-limits.mjs:49', 'office-salary.mjs:57', 'entity-view.mjs:191', 'npc-memory.mjs:210', 'npc-decision.mjs:18', 'npc-decision.mjs:11', 'npc-decision.mjs:17',
  'autonomy-candidates.mjs:37', 'finance-bank.mjs:267', 'finance-assets.mjs:82', 'finance-assets.mjs:84', 'pets.mjs:56', 'weather.mjs:140', 'npc-intelligence.mjs:147',
  'population-service.mjs:12', 'population.mjs:367', 'remote-generation.mjs:799', 'npc-memory.mjs:209', 'npc-autonomy.mjs:354', 'nation-founding.mjs:223', 'duels.mjs:18'];
const missMig = mustList.filter(x => !sec7.includes(x));
report(`19 迁移清单覆盖旧读写点（${mustList.length} 处）且无"待核"`, missMig.length === 0 && !sec7.includes('（待核）'), missMig.join(','));

// 20. 骰值键：五个抽取点登记；规则里不用序号
const sec22 = meta.filter(m => /^### 2\.2 /.test(m.h3)).map(m => m.line).join('\n');
const drawMiss = (firstBatch.draw_site ?? []).filter(d => !sec22.includes(d));
report('20 抽取点登记齐全（五段键，无序号）', (firstBatch.draw_site ?? []).length === 5 && drawMiss.length === 0 && !/decisionJitter\([^)]*seq/.test(lines.join('\n')), drawMiss.join(','));

// 21. 卷末有本轮影响面表与记账栏
report('21 附录三影响面表、附录四记账栏在卷末', lines.some(l => l.startsWith('## 附录三 ')) && lines.some(l => l.startsWith('## 附录四 ')));

console.log(`行数 ${lines.length}；子系统 9；规则条数 ${ruleIds.size}；json 块 ${nJson}；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
