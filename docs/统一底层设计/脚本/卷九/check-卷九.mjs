// 卷九 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷九-AI接口.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 19;

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
// 卷九 v2 合法改动，二审 11-13：卷首署名改为三段式（起草／改稿／审查），仍整行精确匹配
report('1b 卷首署名行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档'));
report('1c 没有残留的续写标记', !all.includes('<!--CONT-->'));

// 2 十九个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report('2 十九个子系统各六小节齐全', miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

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
  for (const k of ['扫描式', '不变量式', '扩展性式']) {
    const l = s.find(x => x.startsWith(`- ${k}：`));
    if (!l) asr.push(`4.${n}:${k}`); else if (!new RegExp(`A9-${n}\\.\\d`).test(l)) asr.push(`4.${n}:${k}无编号`);
  }
}
report('4 验收断言三式齐全且有编号', asr.length === 0, asr.join(','));

// 5 规则与正文无具体 id 字面量（允许区：代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|offense|status|eff|mod|req|hk|res|act|acls|astage|tf|focus|ck|cscope|dcard|mk|menu|bcat|param|lang|drive|pers|comp|uitok)_[a-z0-9][a-z0-9_]*/g;
const allowWords = new Set(['act_class', 'act_stage', 'ck_', 'eff_output', 'status_family', 'body_plan', 'event_type', 'menu_fallback', 'menu_group', 'mark_kind', 'focus_', 'act_', 'acls_', 'astage_', 'tf_', 'cscope_', 'dcard_', 'mk_', 'menu_']);
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
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 10).join(' '));

// 7 台账判给本卷的概念写全
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['动作目录', '当前活动', '原语目录', '执行器', '统一裁决', '检定', '开放提案', '构造器', '路由', '幅度上限', '难度派生', '反噬', '同意与权能', '回合契约', '叙述投影', '一致性审查', 'NPC 决策', '对话与交涉', 'AI 档位', '降级', '三级落地', '学习回路', /* 卷九 v2 合法改动，二审 11-13：一审小项 3 统一名为“选择式判断层” */ '选择式判断层', '录制回放', '费用账', '输入边译码器', '守门'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = sec(/^## §4 /);
const codes = ['affordances', 'activityOf', 'workDoneRem', 'resolve(', 'execute(', 'check(', 'degree', 'difficulty_row', 'cap_row', 'magnitudeCap', 'consent(', 'authority(', 'consent_clause', 'authority_source', 'turn_timing', 'already_timed', 'segments', 'E-TURN-UNMAPPED', 'sceneCard', 'scene_section', 'focus', 'claim_kind', 'claim_detect', 'evidence_row', 'reviewClaims', 'validator_verdict', 'npcDecision', 'npcChoose', 'candidate_provider', 'decisionJitter', 'decision_card', 'dialogue_move', 'dialogue_state', 'ai_tier', 'aiAllows', 'degradeLevelOf', 'landing_level', 'landingOf', 'learn_event', 'confidencePermille', 'responseId', 'budgetTokens', 'decode_result', 'menu_fallback', 'reject:injection', 'reject:minor_romance', 'reject:id_leak', 'reject:blocklist', 'reject:unknown_entity', 'reject:quote_mismatch', 'rules.gate.retryLimit', 'intent_slot', 'respondents', 'controlledByPlayer', 'constructorTree', 'intent_form', 'target_filter', 'noteFact', 'legalityOf', 'disposalRight', 'gainSkill', 'skillValue', 'intimateEligible'];
const whole = sec(/^## §[2-4] /);
const missCode = codes.filter(c => !whole.includes(c));
const ruleIds = new Set(body4.match(/R9-\d+\.\d+/g) ?? []);
const perSub = []; for (let n = 1; n <= N; n++) if (![...ruleIds].some(r => r.startsWith(`R9-${n}.`))) perSub.push(n);
const gaps = [];
for (let n = 1; n <= N; n++) {
  const defs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => (m.line.match(/^- \*\*R9-(\d+)\.(\d+) /) ?? [])).filter(x => x.length).map(x => [+x[1], +x[2]]);
  if (!defs.length) gaps.push(`4.${n} 无规则条`);
  defs.forEach(([a, b], i) => { if (a !== n || b !== i + 1) gaps.push(`R9-${a}.${b}@4.${n}`); });
}
report('7 台账各概念写全（标题、关键代号、每节有规则且编号连续）', missKw.length === 0 && missCode.length === 0 && perSub.length === 0 && gaps.length === 0, [...missKw, ...missCode, ...perSub.map(n => 'no-rule-4.' + n), ...gaps].join(','));

// 8 跨卷引用带标题；规则与断言编号引用不悬空
const refRe = /卷[零一二三四五六七八九十]+[b甲乙]? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/^## (§7|§8|附)/.test(m.h2)) return;
  if (/^### 5\.3 /.test(m.h3)) return; // 配合项表里引对方的条目号，不强求标题
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
const defined = new Set(meta.map(m => (m.line.match(/^- \*\*(R9-\d+\.\d+) /) ?? [])[1]).filter(Boolean));
const dangling = [...new Set(all.match(/R9-\d+\.\d+/g) ?? [])].filter(r => !defined.has(r));
const definedA = new Set(all.match(/(?<=：)A9-\d+\.\d+/g) ?? []);
const danglingA = [...new Set(all.match(/A9-\d+\.\d+/g) ?? [])].filter(r => !definedA.has(r));
report('8 跨卷引用带标题；规则与断言编号引用不悬空', badRef.length === 0 && dangling.length === 0 && danglingA.length === 0, [...badRef.slice(0, 8), ...dangling.map(d => '悬空 ' + d), ...danglingA.map(d => '悬空 ' + d)].join(' '));

// 9 json 代码块可解析
let badJson = 0; const blocks = []; let buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { try { blocks.push(JSON.parse(buf.join('\n'))); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 90)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
report(`9 json 代码块可解析（${blocks.length + badJson} 块）`, badJson === 0, `bad=${badJson}`);

// 10 红线：墙钟、除法保护、存法登记、事件日志
const r10 = [];
meta.forEach((m, i) => {
  if (m.fence !== null || /^## (附|§7)/.test(m.h2)) return;
  if (/Date\.now|new Date|performance\.now|Math\.random|process\.env/.test(m.line)) r10.push(`L${i + 1}:墙钟或非登记随机`);
  if (/(规则|维度)$/.test(m.h4) && /÷/.test(m.line) && !/正整数|不做除法/.test(m.line)) r10.push(`L${i + 1}:除数未说明`);
});
const s27 = sub(/^### 2\.7 /);
for (const w of ['stockMode', 'remainder', 'raw', 'workDoneRem', 'rules.act.paceScale', '卷二 §3.3（求值管线）', 'extScale']) if (!s27.includes(w)) r10.push('§2.7 缺 ' + w);
const s33 = sub(/^### 3\.3 /);
// 卷九 v2 合法改动，二审 11-13：T10 提案、留痕改按主体分段（state.proposals[actorId][proposalId]、state.marks[onId][markId]）
for (const p of ['state.activities[actorId]', 'state.agendas[personId]', 'state.proposals[actorId][proposalId]', 'state.marks[onId][markId]', 'state.dialogues[sessionId]', 'state.decisionCommit[personId]']) {
  if (!sub(/^### 2\.3 /).includes(p)) r10.push('§2.3 缺 ' + p);
  if (!s33.includes(p)) r10.push('§3.3 去留缺 ' + p);
}
if (!s33.includes('`clear`')) r10.push('§3.3 缺 clear');
const ruleLines = meta.filter(m => /规则$/.test(m.h4)).map(m => m.line).join('\n');
if (/读事件日志|回读事件日志/.test(ruleLines.replace(/不回读事件日志|不读事件日志/g, ''))) r10.push('规则层读事件日志');
report('10 红线：不读墙钟、除数有下界或为 0 分支、存法与去留登记、不读事件日志', r10.length === 0, r10.slice(0, 10).join(' | '));

// 11 数据实例算术与余数结转复算
const r11 = [];
{
  const step = (st, n, D) => { const acc = st.rem + n; const out = acc / D; st.rem = acc - out * D; st.out += out; if (st.rem < 0n || st.rem >= D) r11.push('余数越界'); };
  const D = 10000n;
  const a = { rem: 0n, out: 0n }; step(a, 96n * 12500n, D); if (a.out !== 120n || a.rem !== 0n) r11.push('铁匠 96 分钟');
  if ((240n * D) / 12500n !== 192n || (240n * D) % 12500n !== 0n) r11.push('铁匠 finishAt');
  const b = { rem: 0n, out: 0n }; step(b, 30n * 9000n, D); if (b.out !== 27n || b.rem !== 0n) r11.push('采贝 一'); step(b, 10n * 7500n, D); if (b.out !== 34n || b.rem !== 5000n) r11.push('采贝 二');
  // 切片不变：同一节奏 40 分钟，一次与 40 次
  const c1 = { rem: 0n, out: 0n }; step(c1, 40n * 7500n, D); const c2 = { rem: 0n, out: 0n }; for (let i = 0; i < 40; i++) step(c2, 7500n, D);
  if (c1.out !== c2.out || c1.rem !== c2.rem) r11.push('切片不变');
  // 节奏 0.3333 的小增量不被永远截成 0
  const d = { rem: 0n, out: 0n }; for (let i = 0; i < 3; i++) step(d, 3333n, D); if (d.out !== 0n || d.rem !== 9999n) r11.push('小增量一'); step(d, 3333n, D); if (d.out !== 1n || d.rem !== 3332n) r11.push('小增量二');
}
const near = (x, y) => Math.abs(x - y) < 1e-9;
const bands = [-20, 0, 10, 25]; const deg = m => bands.filter(b => m >= b).length;
const calc = [
  ['阶段 交叉相乘', 120 * 1000, 120000, '120 × 1000 = 120000'], ['阶段 下界', 400 * 240, 96000, '400 × 240 = 96000'], ['阶段 上界', 850 * 240, 204000, '850 × 240 = 204000'],
  ['need', 240 * 10000, 2400000, 'need = 240 × 10000 = 2400000'],
  ['撬锁 margin', 46 - 52 + 9, 3, 'margin = 46 − 52 + 9 = 3'], ['撬锁 档', deg(3), 2, '有 2 个不大于 3'],
  ['套马 margin', (38 - 4) - (30 + 7), -3, '（38 − 4）−（30 + 7）= −3'], ['套马 档', deg(-3), 1, '有 1 个不大于 −3'],
  ['难度', 30 + 18 - 8, 40, '30 + 18 − 8 = 40'], ['上限', Math.min(25, 30), 25, 'min(25, 30) = 25'], ['overreach', 32 - 25, 7, 'overreach = 32 − 25 = 7'],
  ['预算', 5820 + 400, 6220, '5820 + 400 = 6220'],
  ['效用', 0.4 - 0.12 - 0.06 + 0.03, 0.25, 'U = 0.4 − 0.12 − 0.06 + 0.03 = 0.25'], ['效用 代付', 0.4 - 0.07 - 0.06 + 0.03, 0.30, 'U = 0.30'], ['效用 倒贴', -0.01 * -5, 0.05, '−0.01 × (−5) = +0.05'],
  // 卷九 v2 合法改动，二审 11-13：T19 预付按 w.money 折算，例子改为 −U = 0.15、w.money = 0.01、步长 5；
  // 复算用整数（以 0.01 为单位：−U = 15、w.money = 1），ceil(a ÷ b) = (a + b − 1) 整除 b
  ['预付', Number(((15n + 1n * 5n - 1n) / (1n * 5n)) * 5n), 15, 'ceil(0.15 ÷ (0.01 × 5)) × 5 = ceil(3) × 5 = 15'],
  ['预付 步数', Number((15n + 1n * 5n - 1n) / (1n * 5n)), 3, 'ceil(3)'],
  ['骆驼 U', -1 * 30, -30, 'U = −0.01 × 30 = −0.3'], // 卷九 v2 合法改动，二审 11-13：以 0.01 为单位，−0.01 × 30 = −30 单位 = −0.3
  ['骆驼 还价', Number(((30n + 1n * 5n - 1n) / (1n * 5n)) * 5n), 30, 'ceil(0.3 ÷ (0.01 × 5)) × 5 = 30'], // 卷九 v2 合法改动，二审 11-13：−U = 30 单位、w.money = 1 单位
  ['骆驼 第二轮', 80 + 30, 110, '第二轮玩家加到 110'], // 卷九 v2 合法改动，二审 11-13
  ['回放键数', 40 + 40 + 12, 92, '40 + 40 + 12 = 92'], ['预算累计', 19400 + 900, 20300, '19400 + 900 = 20300'],
  ['饥饿项', 0.8 * 0.5, 0.4, '得 0.4'], ['钱项', 12 * 0.01, 0.12, '扣 0.12'], ['时间项', 30 * 0.002, 0.06, '扣 0.06']
];
const badCalc = calc.filter(([, got, want]) => !near(got, want)).map(([n]) => n);
const missNum = calc.filter(([, , , needle]) => !all.includes(needle)).map(([n, , , s]) => n + '缺原句:' + s);
report(`11 数据实例算术与余数结转复算（${calc.length} 项加 5 组余数）`, r11.length === 0 && badCalc.length === 0 && missNum.length === 0, [...r11, ...badCalc, ...missNum].join(','));

// 12 接口与登记落实
const r12 = [];
const s31 = sub(/^### 3\.1 /);
const used = new Set();
meta.filter(m => /统一入口$/.test(m.h4)).forEach(m => { for (const x of m.line.matchAll(/`([a-z][A-Za-z]+)\(/g)) used.add(x[1]); });
const foreign = ['can', 'effects', 'personView', 'decisionJitter', 'preferenceOf', 'needSatisfiers', 'stance', 'dread', 'treatment', 'recall', 'evaluationOf', 'legalityOf', 'degradeLevelOf'];
for (const u of used) if (!s31.includes('`' + u + '(') && !foreign.includes(u)) r12.push('入口未进 §3.1: ' + u);
// 规则表键
const s25 = sub(/^### 2\.5 /);
const usedKeys = new Set((whole.match(/rules\.(?:act|check|open|cap|turn|scene|review|npc|dialogue|ai|gate|judge|learn|route|constructor)\.[A-Za-z]+/g) ?? []));
for (const k of usedKeys) if (!s25.includes('`' + k + '`')) r12.push('§2.5 缺键 ' + k);
// 错误码
const s28 = sub(/^### 2\.8 /);
const usedErr = new Set(whole.match(/E-(?:ACT|OPEN|TURN|CLAIM|DIALOGUE|AI|NPC|GATE)-[A-Z-]+[A-Z]/g) ?? []);
for (const e of usedErr) if (!s28.includes('| ' + e + ' |')) r12.push('§2.8 缺 ' + e);
// 封闭枚举：§4 用到的枚举名都在 §2.1
const s21 = sub(/^### 2\.1 /);
for (const e of ['intent_origin', 'resolve_stage', 'degree', 'activity_end', 'proposal_phase', 'landing_level', 'authority_via', 'clause_mode', 'turn_timing', 'channel', 'segment_kind', 'quote_source', 'claim_detect', 'claim_modality', 'claim_polarity', 'temporal_mode', 'review_verdict', 'validator_verdict', 'decision_stage', 'decision_outcome', 'dialogue_state', 'ai_tier', 'ai_use', 'ai_fail', 'reject_code', 'decode_result', 'intent_slot', 'request_kind', 'ctx_role', 'rank_key', 'learn_event']) if (!s21.includes('| `' + e)) r12.push('§2.1 缺 ' + e);
// 通用槽位表与枚举一致
const slotEnum = (s21.match(/\| `intent_slot` \| ([^|]+) \|/) ?? [, ''])[1].match(/`([A-Za-z]+)`/g)?.map(x => x.slice(1, -1)) ?? [];
const slotTable = meta.filter(m => m.h4 === '#### 4.19.1 维度' && /^\| `/.test(m.line)).flatMap(m => (m.line.split('|')[1].match(/`([A-Za-z]+)`/g) ?? []).map(x => x.slice(1, -1)));
if (slotEnum.slice().sort().join() !== slotTable.slice().sort().join()) r12.push(`槽位枚举与表不一致: ${slotEnum.join('/')} vs ${slotTable.join('/')}`);
// §5 三张表、§7 抽查 file:line、待补清单
const s5 = sec(/^## §5 /);
for (const v of ['卷二', '卷三乙', '卷四', '卷六', '卷七', '卷八', '卷八b', '卷十三', '卷十四', '卷十五', '卷十八', '卷十九', '卷二十', '卷二十一', '卷二十二', '卷二十六', '卷二十七', '卷二十九']) if (!new RegExp(`^\\| ${v} \\|`, 'm').test(s5)) r12.push('§5.2 缺 ' + v);
if (!/^### 5\.3 /m.test(s5)) r12.push('缺 §5.3 配合项');
const s7 = sec(/^## §7 /);
for (const f of ['action-affordances.mjs:310', 'legacy-primitives.mjs:181', 'primitives-effects.mjs:294', 'action-limits.mjs:247–289', 'action-limits.mjs:267–283', 'activities.mjs:176', 'activities.mjs:293', 'npc-autonomy.mjs:61', 'npc-autonomy.mjs:176', 'npc-decision.mjs:13', 'npc-decision.mjs:14', 'npc-decision.mjs:25', 'action-router.mjs:75', 'action-router.mjs:421', 'action-router.mjs:678', 'action-constructor.mjs:34', 'action-constructor.mjs:38', 'action-time.mjs:15', 'action-registry.mjs:139', 'retrieval-lexicon.mjs:19', 'scene-card.mjs:109', 'scene-card.mjs:133', 'action-text.mjs:99', 'chronicle.mjs:50', 'consistency-evidence.mjs:162', 'engine.mjs:397', 'action-consent.mjs:10', 'population.mjs:407', 'ai-profile.mjs:4']) if (!s7.includes(f)) r12.push('§7 缺 ' + f);
const todo = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line)).length;
if (todo < 5) r12.push('待补清单过少');
// 首批声明种类 json 的 detect 只取三值
for (const b of blocks) for (const [k, v] of Object.entries(b)) if (k.startsWith('ck_') && !['ledger', 'gate', 'self'].includes(v.detect)) r12.push('detect 越界 ' + k);
report('12 接口、入口表、规则表键、错误码、枚举、槽位表、迁移清单落实', r12.length === 0, r12.slice(0, 12).join(' | '));

// 13 规则层不得读的东西没有被规则条文要求去读
const r13 = [];
const rl = meta.filter(m => /规则$/.test(m.h4));
rl.forEach((m, i) => { if (/读\s*`?intent\.origin`?(?!。)/.test(m.line) && !/不读|不得读/.test(m.line)) r13.push('规则读 origin'); });
if (!/九段都不读 `intent\.origin`/.test(all)) r13.push('缺来路无关条');
if (!/`t0` 下不发任何模型请求/.test(all)) r13.push('缺 t0 条');
if (!/不入库，不进哈希，不进后续提示/.test(all)) r13.push('缺三不条');
report('13 来路无关、默认不开模型、拒收三不条文在位', r13.length === 0, r13.join(' | '));

// 14 E-ACT-CAP-MISSING 按参数判（李白 ce6e990b ① (d)；R9-7.5 唯一定义，封卷后勘误 1115k4）
// 先核三处口径一致：R9-7.5、§2.8 错误码行、§2.2 校验句都写"逐（按）参数"、cap_row 或豁免行、数值参数为空须显式声明。
// 再对全书机判：效果族 = 卷九动作行 effects 调用到的族 ∪ 全书族表登记行（首格为 `eff_*`、表头有参数槽/params 一栏的表格行）。
//  · 族的数值参数 = 登记行参数栏里类型为 number/integer 的 `param_*`；
//  · 参数栏写 无/`{}`/空，或散文登记同一句写该族与"`params`…为空"/`params: {}`，算显式声明为空；
//  · 数值参数为空：须显式声明，否则缺；数值参数非空：每个参数在全书须恰有一种——有 `cap_row` 写到（族、参数），或有 `cap_exempt_row` 写到（族、参数），
//    两者皆无或两者都有即缺。第 3 个参数可给全书目录（注入测试用副本）。
{
  const r14 = [];
  const r75 = lines.find(l => l.startsWith('- **R9-7.5 ')) ?? '';
  const e28 = lines.find(l => l.startsWith('| E-ACT-CAP-MISSING |')) ?? '';
  const s22 = lines.find(l => /^校验：.*`effects` 里每个 effectCall 的族/.test(l)) ?? '';
  if (!/按参数判/.test(r75) || !/两者皆无、或两者都有/.test(r75) || !/显式声明数值参数为空/.test(r75)) r14.push('R9-7.5 未写按参数判三要件');
  if (!/逐参数判|按 R9-7\.5/.test(e28) || !/数值参数为空而未显式声明为空/.test(e28)) r14.push('§2.8 E-ACT-CAP-MISSING 行口径');
  if (!/按 R9-7\.5 逐个数值参数/.test(s22) || !/数值参数为空的族须显式声明为空/.test(s22)) r14.push('§2.2 校验句口径');
  const BOOK = (process.argv[3] ?? 'F:/dnd/docs/统一底层设计') + '/';
  const { readdirSync } = await import('node:fs');
  const book = readdirSync(BOOK).filter(f => /^卷.*\.md$/.test(f)).map(f => ({ v: f.replace(/-.*$/, ''), ls: readFileSync(BOOK + f, 'utf8').split(/\r?\n/).map(l => l.replace(/\r$/, '')) }));
  const LOG = /修订|处置|勘误|记账|影响面|审查意见|版本说明|自检/;
  const fams = new Map(); // 族 -> {reg: [{at, params: [..], empty}], used}
  const get = f => { if (!fams.has(f)) fams.set(f, { reg: [], used: false }); return fams.get(f); };
  for (const m of all.matchAll(/"family"\s*:\s*"(eff_[a-z0-9_]+)"/g)) get(m[1]).used = true;
  for (const { v, ls } of book) {
    let h2b = '', head = null;
    ls.forEach((l, i) => {
      if (/^## /.test(l)) h2b = l;
      if (!l.startsWith('|')) { head = null; return; }
      const cs = l.split('|').slice(1, -1).map(c => c.trim());
      if (!head) { head = cs; return; }
      if (/^[\s:-]+$/.test(cs.join(''))) return;
      if (LOG.test(h2b)) return;
      const f = cs[0].match(/^`(eff_[a-z0-9_]+)`$/)?.[1]; const pi = head.findIndex(c => /参数槽|params/.test(c));
      if (!f || pi < 0) return;
      const pc = cs[pi] ?? '';
      const nums = [...pc.matchAll(/`(param_[a-z0-9_]+)\s*:\s*(number|integer)[^`]*`/g)].map(m => m[1]);
      // 参数栏写 无/{}/空，或列出了参数而其中没有数值类型的，都是显式写明了数值参数为空；参数栏没写任何东西才算未声明
      get(f).reg.push({ at: `${v}:${i + 1}`, nums, empty: /^(无|`\{\}`|空)/.test(pc) || /`param_[a-z0-9_]+\s*:/.test(pc) });
    });
    ls.forEach((l, i) => { // 散文登记：同一句写到族代号与“`params`…为空”或 `params: {}`；或数据式 `{id:eff_x, params:{}}`
      if (l.startsWith('|')) return;
      for (const m of l.matchAll(/["`]?id["`]?\s*:\s*["`]?(eff_[a-z0-9_]+)["`]?[^{}]*?["`]?params["`]?\s*:\s*\{\s*\}/g)) get(m[1]).reg.push({ at: `${v}:${i + 1}`, nums: [], empty: true });
      // 卷二 §3.9 定义的族行形状（一行写完的 JSON）：带 `family: eff_*` 与 `outputs`（效果族行独有，effectCall 只有 family、params），
      // `params` 为必写的参数声明（键即数值参数，值为 {unit, domain}；无数值参数写 {}）。按形状认，不按名字。
      for (const m of l.matchAll(/\{\s*"family"\s*:\s*"eff_[a-z0-9_]+"/g)) {
        let d = 0, j = m.index; for (; j < l.length; j++) { if (l[j] === '{') d++; else if (l[j] === '}' && --d === 0) break; }
        let o; try { o = JSON.parse(l.slice(m.index, j + 1)); } catch { continue; }
        if (!('outputs' in o)) continue;
        if (!o.params || typeof o.params !== 'object') { get(o.family).reg.push({ at: `${v}:${i + 1}`, nums: [], empty: false }); continue; }
        const nums = Object.keys(o.params);
        get(o.family).reg.push({ at: `${v}:${i + 1}`, nums, empty: nums.length === 0 });
      }
      for (const s of l.split(/(?<=。)/)) if (/`params`[^。]{0,30}为空|`params:\s*\{\}`/.test(s)) for (const m of s.matchAll(/`(eff_[a-z0-9_]+)`/g)) get(m[1]).reg.push({ at: `${v}:${i + 1}`, nums: [], empty: true });
    });
  }
  const capHit = (f, p, kind) => book.some(({ ls }) => ls.some(l => l.includes('`' + kind + '`') && l.includes(f) && l.includes(p) && !/^\| `(cap_row|cap_exempt_row)` \|/.test(l)));
  const famOut = [];
  for (const [f, x] of [...fams].sort()) {
    if (!x.reg.length) { r14.push(`${f} 未见族登记（参数未声明）`); famOut.push(`${f}:未登记`); continue; }
    const nums = [...new Set(x.reg.flatMap(r => r.nums))];
    if (!nums.length) { if (!x.reg.some(r => r.empty)) r14.push(`${f} 数值参数为空而未显式声明（${x.reg.map(r => r.at).join(',')}）`); famOut.push(`${f}:空${x.reg.some(r => r.empty) ? '' : '(未声明)'}`); continue; }
    for (const p of nums) { const c = capHit(f, p, 'cap_row'), e = capHit(f, p, 'cap_exempt_row'); if (c === e) r14.push(`${f}.${p} ${c ? 'cap_row 与豁免行都有' : '既无 cap_row 也无豁免行'}`); }
    famOut.push(`${f}:${nums.join('/')}`);
  }
  console.log(`   效果族 ${fams.size} 个：${famOut.join('；')}`);
  report('14 E-ACT-CAP-MISSING 按参数判：三处口径一致；各族数值参数逐项恰有上限行或豁免行，空参数族显式声明', r14.length === 0, r14.join(' | '));
}

const ruleCount = defined.size;
console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleCount}；json 块 ${blocks.length}；待补清单 ${todo} 条；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
