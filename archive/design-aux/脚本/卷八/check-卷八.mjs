// 卷八 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷八-政治与人口.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
// 自检附录本身不参加检查
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

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表', '## 附录 待补清单'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8、术语表、待补清单齐全', miss2.length === 0, miss2.join(','));
report('1b 卷首署名行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档'));
report('1c 无残留追加标记', !all.includes('<!--APPEND-->'));

// 2 十九个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report('2 十九个子系统各六小节齐全', miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

// 3 数据实例：至少 3 条，含非西陲、含非人类或超自然
const inst = [];
for (let n = 1; n <= N; n++) {
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null).map(m => m.line).filter(l => /^- 【/.test(l));
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report('3 数据实例数量与两类覆盖', inst.length === 0, inst.join(','));

// 4 验收断言三式，且各带断言编号
const asr = [];
for (let n = 1; n <= N; n++) {
  const sec = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line);
  for (const k of ['扫描式', '不变量式', '扩展性式']) {
    const l = sec.find(x => x.startsWith(`- ${k}：`));
    if (!l) asr.push(`4.${n}:${k}`); else if (!new RegExp(`A8-${n}\\.\\d`).test(l)) asr.push(`4.${n}:${k}无编号`);
  }
}
report('4 验收断言三式齐全且有编号', asr.length === 0, asr.join(','));

// 5 规则与正文无具体 id 字面量（允许区：代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|loc|bld|fac|recipe|org|orgkind|office|polity|politykind|pkind|law|deity|faith|culture|profession|skill|offense|status|etype|eff|mod|hk|saxis|res|resfam|purpose|src|sink|ckind|obl|cphase|ophase|verb|power|salary|succession|succsrc|election|term|motion|mphase|mtrans|permit|tenure|legit|lform|claimbasis|tax|taxbase|tmeasure|taxtrig|taxpayee|fkind|casus|wphase|settletier|amenity|popflow|popband|vside|mpart|infsrc|infper|dstat|actb|ratdef|acc|ballot|addr|pscope|ctarget|cprize|aggkind|aggk|agg|tr|share|ho|send|pside|clause|juris|rcls|simform)_[a-z0-9][a-z0-9_]*/g;
const allowSim = new Set(['simform_individual', 'simform_batch', 'simform_stat', 'simform_derived', 'simform_frozen']);
const allowWords = new Set(['holding_kind', 'record_class', 'event_type', 'facility_type', 'stance_axis', 'law_code', 'body_plan', 'succession_source']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  // §2.4 的“前缀”一栏是族前缀的登记，不是实例 id：形如 `xxx_` 的不计（正则要求下划线后还有字符，本就不命中）
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit) && !allowSim.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 6 无用于判断的描述性文本：规则区不出现字符串方法、含中文的正则；json 块里不许有中文
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
meta.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §[235] /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (m.fence === 'json' && /[\u4e00-\u9fff]/.test(m.line)) textHits.push(`L${i + 1}(json)`);
  if (inRule && m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
});
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 10).join(' '));

// 7 台账判给本卷的概念写全：标题关键词、关键代号、每节至少一条规则且编号连续
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['组织统一结构', '职位', '俸禄', '继任', '代理追认', '政体类型表', '头衔与法理', '领地持有权', '直辖上限', '正统性', '宣称', '共治与摄政', '朝贡与封建契约', '税收全表与征管', '派系与请愿', '联盟', '外交与使节', '宣战理由与战争宣告', '人口统计层', '承载力', '迁徙', '移民波次', '宫廷', '聚落治理', '升格', '选举', '影响力'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
const codes = ['placeAuthority', 'revokeOffice', 'tributeDue', 'state.tributeRem', 'state.accession', 'state.ratifyQueue', 'ratifyAct', 'bench', 'state.courtLast', 'state.envoyLog', 'orgView','officeView', 'polityView', 'orgKind', 'treasury', 'mphase', 'motionStep', 'hasPower', 'successorsOf', 'seatOffice', 'acting', 'ratifyDays', 'polityKind', 'councilOffices', 'titular', 'state.dejure', 'driftDays', 'usurpOptions', 'governorOf', 'holdingAllowed', 'setGovernor', 'domainLimit', 'domainCount', 'legitimacy', 'state.legitMarks', 'titleClaim', 'claimsOn', 'pressClaim', 'regencyOf', 'vassalTerms', 'contractStep', 'taxesFor', 'taxLoad', 'state.taxRem', 'assessTaxes', 'leakCurve', 'factionView', 'state.factionState', 'diploStatus', 'diplomacyStep', 'setBorderTerm', 'casusOptions', 'declareWar', 'holyWarEligible', 'popView', 'popCapacity', 'popApply', 'settlePopulation', 'migrationScore', 'stratumSkill', 'state.popRem', 'state.vitalRem', 'vitalRates', 'courtView', 'holdCourt', 'tierOptions', 'promoteSettlement', 'electorate', 'influenceOf', 'settleInfluence', 'state.influenceRem'];
const missCode = codes.filter(c => !body4.includes(c));
const ruleIds = new Set(body4.match(/R8-\d+\.\d+/g) ?? []);
const perSub = []; for (let n = 1; n <= N; n++) if (![...ruleIds].some(r => r.startsWith(`R8-${n}.`))) perSub.push(n);
const gaps = [];
for (let n = 1; n <= N; n++) {
  const defs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => (m.line.match(/^- \*\*R8-(\d+)\.(\d+) /) ?? [])).filter(x => x.length).map(x => [+x[1], +x[2]]);
  if (!defs.length) gaps.push(`no-def-4.${n}`);
  defs.forEach(([a, b], i) => { if (a !== n || b !== i + 1) gaps.push(`R8-${a}.${b}@4.${n}`); });
}
report('7 台账各概念写全（标题、关键代号、每节有规则且编号连续）', missKw.length === 0 && missCode.length === 0 && perSub.length === 0 && gaps.length === 0, [...missKw, ...missCode, ...perSub.map(n => 'no-rule-4.' + n), ...gaps].join(','));

// 8 跨卷引用带标题；正文引用的本卷规则编号都有定义
const refRe = /卷[零一二三四五六七八九十]+[b甲乙]? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/^## (§7|§8|附)/.test(m.h2)) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
const defined = new Set(meta.map(m => (m.line.match(/^- \*\*(R8-\d+\.\d+) /) ?? [])[1]).filter(Boolean));
const dangling = [...new Set(all.match(/R8-\d+\.\d+/g) ?? [])].filter(r => !defined.has(r));
// 本卷内部的 §4.n 引用不得越界
const selfRefs = [];
meta.forEach((m, i) => { for (const x of m.line.matchAll(/(?<![卷零一二三四五六七八九十甲乙b] )§4\.(\d+)/g)) if (+x[1] < 1 || +x[1] > N) { if (!/卷[零一二三四五六七八九十]+[b甲乙]? §4\.\d+/.test(m.line)) selfRefs.push(`L${i + 1}:§4.${x[1]}`); } });
report('8 跨卷引用带标题；规则编号引用不悬空', badRef.length === 0 && dangling.length === 0 && selfRefs.length === 0, [...badRef.slice(0, 12), ...dangling.map(d => '悬空 ' + d), ...selfRefs.slice(0, 5)].join(' '));

// 9 json 代码块可解析
let badJson = 0; const blocks = []; let buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { try { blocks.push(JSON.parse(buf.join('\n'))); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 90)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
report(`9 json 代码块可解析（${blocks.length + badJson} 块）`, badJson === 0, `bad=${badJson}`);

// 10 红线：墙钟、除法保护、存法登记
const r10 = [];
const isInstance = l => /^- 【/.test(l);
const isAssert = l => /^- (扫描式|不变量式|扩展性式)：/.test(l);
meta.forEach((m, i) => {
  if (m.fence !== null || /^## (附|§7|§8)/.test(m.h2)) return;
  if (/Date\.now|new Date|performance\.now|Math\.random|process\.env/.test(m.line)) r10.push(`L${i + 1}:墙钟或非登记随机`);
  // 规则区的显式除法：同一行必须有正下界、常数除数或为 0 分支的说明
  if (/÷/.test(m.line) && !isInstance(m.line) && !/恒为正|不做除法|正整数|常数|每日分钟数/.test(m.line)) r10.push(`L${i + 1}:除数未说明`);
  // 隐式除法措辞：同一行须有保护句
  if (!isInstance(m.line) && !isAssert(m.line) && /加权平均|均值|人均|之比|比值|占比|归一|的平均|求平均|取平均|平均值|算术平均|按[^，。；（(]{0,15}(?:权重|比例|份额)(?:分|摊|割|配)|占[^，。；]{0,15}(?:份额|比例)/.test(m.line) && !/恒为正|不做除法|正整数|交叉相乘/.test(m.line)) r10.push(`L${i + 1}:隐式除法措辞无保护`);
});
for (const p of ['state.taxRem[payerId][taxRow]', 'state.influenceRem[holderId][srcRow]', 'state.popRem[aggregateId][flowRow]', 'state.vitalRem[aggregateId][vitalSide][band]', 'state.tributeRem[contractId]']) {
  if (!meta.some(m => /^### 2\.5 /.test(m.h3) && m.line.includes(p))) r10.push('§2.5 缺 ' + p);
  if (!meta.some(m => /^### 2\.7 /.test(m.h3) && m.line.includes(p))) r10.push('§2.7 缺 ' + p);
}
// 第二版（T10）：余数分母一律是规则表键，§2.7 分母栏不得出现“固定”“条目的”
for (const m of meta.filter(m => /^### 2\.7 /.test(m.h3) && /`remainder`/.test(m.line))) if (!/规则表键/.test(m.line) || /固定 10000|条目的 `/.test(m.line)) r10.push('§2.7 分母非规则表键: ' + m.line.slice(0, 30));
// 以可终止实体（组织、个体）为键的路径须在去留表登记 clear
for (const p of ['state.taxRem[payerId][taxRow]', 'state.influenceRem[holderId][srcRow]', 'state.factionState[orgId]', 'state.courtLast[orgId]', 'state.envoyLog[orgId][counterpartId]']) {
  if (!meta.some(m => /^### 3\.3 /.test(m.h3) && m.line.includes(p) && m.line.includes('`clear`'))) r10.push('§3.3 去留表缺 ' + p);
}
// 职位不可终止（T18 方案 a）：office 表不写 termination，§3.3 声明职位为目录表
if (meta.some(m => /^### 2\.2 /.test(m.h3) && /^\| `termination`/.test(m.line))) r10.push('§2.2 职位表仍有 termination');
if (!meta.some(m => /^### 3\.3 /.test(m.h3) && /职位表与政体表都是目录表/.test(m.line))) r10.push('§3.3 未声明职位不可终止');
const s27 = meta.filter(m => /^### 2\.7 /.test(m.h3)).map(m => m.line).join('\n');
for (const w of ['stockMode', 'remainder', 'anchor', 'remDenominator', '卷二 §3.3（求值管线）', '切片不变']) if (!s27.includes(w)) r10.push('§2.7 缺 ' + w);
report('10 红线：不读墙钟、除数有下界或为 0 分支、存法与余数登记', r10.length === 0, r10.slice(0, 12).join(' | '));

// 11 数据实例算术与余数结转复算
const r11 = [];
{
  const step = (st, n, D) => { const acc = st.rem + n; const out = acc / D; st.rem = acc - out * D; st.out += out; if (st.rem < 0n || st.rem >= D) r11.push('余数越界'); };
  // 税（第二版 T11）：37 × 300 × (10000 − 0)，分母 10⁸（§4.11.5）
  const TD = 100000000n;
  const a = { rem: 0n, out: 0n }; step(a, 37n * 300n * 10000n, TD); if (a.out !== 1n || a.rem !== 11000000n) r11.push('税第一笔');
  for (let i = 0; i < 8; i++) step(a, 37n * 300n * 10000n, TD); if (a.out !== 9n || a.rem !== 99000000n) r11.push('税九笔');
  const a2 = { rem: 0n, out: 0n }; step(a2, 333n * 300n * 10000n, TD); if (a2.out !== a.out || a2.rem !== a.rem) r11.push('税切片不变');
  // 漏损并入同一式：5000 × 1000 × 9800 一次整除 = 490；与“先核税基再算”的两次整除写法不再出现
  const a3 = { rem: 0n, out: 0n }; step(a3, 5000n * 1000n * 9800n, TD); if (a3.out !== 490n || a3.rem !== 0n) r11.push('矿出税漏损');
  // 贡赋（T12）：1234 × 2000，分母 10000，两期与一次相同（§4.10.5）
  const t = { rem: 0n, out: 0n }; step(t, 1234n * 2000n, 10000n); if (t.out !== 246n || t.rem !== 8000n) r11.push('贡赋首期');
  step(t, 1234n * 2000n, 10000n); if (t.out !== 493n || t.rem !== 6000n) r11.push('贡赋两期');
  const t2 = { rem: 0n, out: 0n }; step(t2, 2468n * 2000n, 10000n); if (t2.out !== t.out || t2.rem !== t.rem) r11.push('贡赋切片不变');
  // 迁徙：300 × 1，分母 200（§4.16.5）
  const b = { rem: 0n, out: 0n }; step(b, 300n, 200n); if (b.out !== 1n || b.rem !== 100n) r11.push('迁出');
  step(b, 300n, 200n); if (b.out !== 3n || b.rem !== 0n) r11.push('迁出第二拍');
  // 影响力：每月 120，分母 100（§4.19.5）
  const c = { rem: 0n, out: 0n }; step(c, 120n, 100n); if (c.out !== 1n || c.rem !== 20n) r11.push('影响力首月');
  for (let i = 0; i < 4; i++) step(c, 120n, 100n); if (c.out !== 6n || c.rem !== 0n) r11.push('影响力五月');
  // 切片不变：600 一次与 100 次 6
  const d1 = { rem: 0n, out: 0n }; step(d1, 600n, 100n); const d2 = { rem: 0n, out: 0n }; for (let i = 0; i < 100; i++) step(d2, 6n, 100n);
  if (d1.out !== d2.out || d1.rem !== d2.rem) r11.push('切片不变');
  // 去向（第二版 T7）：逐人在 [0, W) 抽，区间按评分累计；期望份额与评分成正比，不再有“末份取差”
  const cand = [30n, 10n]; const W = cand.reduce((x, y) => x + y, 0n); const pick = r => { let acc = 0n; for (let k = 0; k < cand.length; k++) { acc += cand[k]; if (r < acc) return k; } return -1; };
  const hits = [0, 0]; for (let r = 0n; r < W; r++) hits[pick(r)]++; if (W !== 40n || hits[0] !== 30 || hits[1] !== 10) r11.push('去向加权');
  if (/末份取差得 1/.test(all)) r11.push('去向仍用末份取差');
  // 不满锚点：读数只是 t 的函数，分两次读与一次读相同；闭式一次整除
  const dis = (value, at, rate, t, max) => { let v = value + (rate * max * (t - at)) / (1440n * 10000n); if (v < 0n) v = 0n; if (v > max) v = max; return v; };
  const v1 = dis(100n, 0n, 250n, 14400n, 1000n); const v2 = dis(100n, 0n, 250n, 14400n, 1000n); if (v1 !== v2 || v1 !== 350n) r11.push('不满锚点 ' + v1);
  // 印记衰减：−20 × 360 ÷ 720（§4.7.5）；BigInt 向零截断
  if ((-20n * (720n - 360n) * 1440n) / (720n * 1440n) !== -10n) r11.push('印记衰减');
}
const calc = [
  ['4.1 法定人数', 22 * 10000 >= 5000 * 40, true], ['4.1 通过', 12 * 2 >= 1 * 22, true], ['4.4 份额', 4 * 10000 >= 5000 * 6, true],
  ['4.6 上限', 2 + 1 + Math.floor(47 / 20), 5], ['4.6 over', Math.max(0, 6 - 5), 1], ['4.7 读数', 40 + 30 + 10, 80], ['4.7 败战后', 80 - 10, 70],
  ['4.10 征召', Math.floor(800 * 500 * 5000 / 100000000), 20], ['4.10 贡赋首期', 1234 * 2000, 2468000], ['4.10 贡赋次期', 8000 + 2468000, 2476000], ['4.10 贡赋一次', 2468 * 2000, 4936000],
  ['4.11 关税', Math.floor(50000 * 1200 * 10000 / 100000000), 6000], ['4.11 首笔', 37 * 300 * 10000, 111000000], ['4.11 累计', 9 * 111000000, 999000000], ['4.11 一次', 333 * 300 * 10000, 999000000], ['4.11 矿', 5000 * 1000 * 9800, 49000000000],
  ['4.16 迁出次拍', 100 + 300, 400],
  ['4.12 越线', 900 * 10000 >= 8000 * 1000, true], ['4.12 不越线', 500 * 10000 >= 8000 * 1000, false],
  ['4.16 承载', Math.floor(1800 * 1620 / 1800), 1620], ['4.16 余量', 1620 - 1800, -180], ['4.17 威严', 30 + 20 + 15, 65], ['4.17 gap', 70 - 65, 5],
  ['4.18 票数', 140 + 110 + 50, 300], ['4.19 月分子', 4 * 30, 120], ['4.19 五月', 5 * 120, 600]
];
const badCalc = calc.filter(([, got, want]) => got !== want).map(([n]) => n);
const missNum = calc.filter(([, , want]) => typeof want === 'number' && !all.includes(String(Math.abs(want)))).map(([n, , w]) => n + '=' + w);
report(`11 数据实例算术与余数结转复算（${calc.length} 项加 16 组）`, r11.length === 0 && badCalc.length === 0 && missNum.length === 0, [...r11, ...badCalc, ...missNum].join(','));

// 12 接口与登记落实
const r13 = [];
const s5 = meta.filter(m => /^## §5 /.test(m.h2)).map(m => m.line).join('\n');
for (const v of ['卷二', '卷四', '卷五', '卷六', '卷七', '卷八b', '卷九', '卷十', '卷十三', '卷十四', '卷十六', '卷十七', '卷十八', '卷十九', '卷二十', '卷二十一', '卷二十二', '卷二十四', '卷二十六', '卷二十七', '卷二十九']) if (!new RegExp(`^\\| ${v} \\|`, 'm').test(s5)) r13.push('§5.2 缺 ' + v);
const s3 = meta.filter(m => /^### 3\.[12] /.test(m.h3)).map(m => m.line).join('\n');
// 各节“统一入口”里提到的入口都在 §3.1 或 §3.2（别卷入口列白名单）
const foreign = new Set(['contractView', 'obligationsOf', 'contractStep', 'executeTrade', 'stance', 'post', 'appropriate', 'setBorderTerm', 'aggregateView', 'modified', 'placeView', 'personView', 'edgeId', 'officeId', 'holderId']);
const used = new Set();
meta.filter(m => /统一入口$/.test(m.h4)).forEach(m => { for (const x of m.line.matchAll(/`([a-z][A-Za-z]+)(?:\(|`)/g)) used.add(x[1]); });
for (const u of used) if (!s3.includes('`' + u) && !foreign.has(u) && !/^(rules|state)$/.test(u) && /[A-Z]/.test(u)) r13.push('入口未进 §3: ' + u);
// 规则表键
const s26 = meta.filter(m => /^### 2\.6 /.test(m.h3)).map(m => m.line).join('\n');
const usedKeys = new Set((all.match(/rules\.(?:polity|pop)\.[A-Za-z]+(?:\.[A-Za-z]+)*/g) ?? []));
for (const k of usedKeys) { const short = k.replace(/^rules\./, ''); const segs = short.split('.'); const head = segs.slice(0, Math.min(3, segs.length)).join('.'); if (!s26.includes('`' + head)) r13.push('§2.6 缺键 ' + short); }
for (const b of ['usurpShareBps', 'driftDays', 'interimDays', 'ratifyDays', 'minMembers', 'discontentMax', 'envoyQuota', 'sessionDays', 'petitionsPerSession', 'reopenDays', 'demoteDays', 'waveDays', 'reachHops', 'perSkill', 'rankBonus', 'scoreMax', 'neutral', 'callCostRX', 'pressCostRX', 'createCostRX', 'leakCurve', 'farmDiscountBps', 'maxOpenPerOrg', 'windowDays', 'sizeFloor', 'statusRows', 'transitions', 'ratifyDefault',
  'polity.tax.remDenominator', 'polity.feudal.remDenominator', 'polity.influence.remDenominator', 'pop.migration.remDenominator', 'skillModTemplate', 'ineligibleTemplate', 'overTemplate', 'forcibleCauses', 'marriageTrigger', 'costSink', 'upkeepSink', 'spendCurves', 'pop.vital.bands', 'scoreWeights', 'partCurves']) if (!s26.includes(b)) r13.push('§2.6 缺 ' + b);
// 第二版（T13）：规则表与维度表不得有整数键 map、内联枚举
for (const m of meta.filter(m => /^### 2\.[1-6] /.test(m.h3))) { if (/map<integer|map<代号|map<（|enum（|enum\(/.test(m.line)) r13.push('§2 类型违卷二 §1.5: ' + m.line.slice(0, 40)); }
if (/sampleOrdinal|electionDays|destWeights|rateDenominator/.test(meta.filter(m => !/^## 附/.test(m.h2)).map(m => m.line).join('\n'))) r13.push('残留旧键');
// 第二版（T1）：卷二已定维度照录名与类型
const s2x = meta.filter(m => /^### 2\.[123] /.test(m.h3)).map(m => m.line).join('\n');
// 依据李白 11-14 20:22 根因 B："每个维度只有一个定义处，就是表定义卷 §2；卷二 §5 照抄"。原"本卷照录卷二"改为以本卷 §2 为准核卷二 §5 的照抄：
// ① 原列的 12 个维度须在本卷 §2.1–2.3 有定义行；② 卷二 §5.8/5.9/5.10 每个维度行，须在本卷对应表有同名行，类型、必填两栏逐字相同。
{
  const ownRows = (re) => { const mp = new Map(); for (const m of meta.filter(m => re.test(m.h3))) { const c = m.line.split('|').map(s => s.trim()); const k = (c[1] ?? '').match(/^`([A-Za-z][A-Za-z0-9]*)`$/); if (k && c.length > 6) mp.set(k[1], { type: c[2], req: c[5] }); } return mp; };
  const v2 = readFileSync('F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md', 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
  const v2Rows = (head) => { const s = v2.findIndex(l => l.startsWith(head)); const mp = new Map(); if (s < 0) return null; for (let i = s + 1; i < v2.length && !/^#{2,3} /.test(v2[i]); i++) { const c = v2[i].split('|').map(x => x.trim()); const k = (c[1] ?? '').match(/^`([A-Za-z][A-Za-z0-9]*)`$/); if (k) mp.set(k[1], { type: c[2], req: c[3], line: i + 1 }); } return mp; };
  const pairs = [[/^### 2\.1 /, '### 5.8 ', 'org'], [/^### 2\.2 /, '### 5.9 ', 'office'], [/^### 2\.3 /, '### 5.10 ', 'polity']];
  const own = new Map(pairs.map(([re, , t]) => [t, ownRows(re)]));
  for (const d of ['charter', 'seat', 'offices', 'orgKind', 'salaryTable', 'succession', 'jurisdictionLevel', 'appointedBy', 'taxRules', 'levyRule', 'polityKind', 'successionDefault'])
    if (![...own.values()].some(mp => mp.has(d))) r13.push('本卷 §2 缺定义行: ' + d);
  for (const [, head, t] of pairs) {
    const cp = v2Rows(head); if (!cp) { r13.push('卷二缺 ' + head.trim()); continue; }
    for (const [k, r] of cp) { const o = own.get(t).get(k); if (!o) r13.push(`卷二 ${head.trim()}:${r.line} ${k} 本卷 §2 无此维度`); else if (o.type !== r.type || o.req !== r.req) r13.push(`卷二照抄与本卷 §2 不一致 ${t}.${k}（卷二:${r.line} ${r.type}／${r.req}；本卷 ${o.type}／${o.req}）`); }
  }
}
// 第二版（T24）：§5.4 只用 simform 代号
const s54 = meta.filter(m => /^### 5\.4 /.test(m.h3) && /^\| [a-z]/.test(m.line)).map(m => m.line);
for (const l of s54) { const cells = l.split('|').slice(2, 5); if (cells.some(c => !/`simform_(individual|batch|stat|derived|frozen)`/.test(c))) r13.push('§5.4 形态非代号'); if (cells.slice(1).some(c => /simform_individual/.test(c))) r13.push('§5.4 非个体层用 individual'); }
// 错误码
const s28 = meta.filter(m => /^### 2\.8 /.test(m.h3)).map(m => m.line).join('\n');
const usedErr = new Set(all.match(/E-(?:ORG|MOTION|OFFICE|TITLE|HOLD|TAX|DIPLO|WAR|POP|INF)-[A-Z-]+[A-Z]/g) ?? []);
for (const e of usedErr) if (!s28.includes('| ' + e + ' |')) r13.push('§2.8 缺 ' + e);
// 封闭枚举附表
const app = meta.filter(m => /^## 附 术语/.test(m.h2)).map(m => m.line).join('\n');
const closedFam = [['tenuremode', 3], ['term', 3], ['accession', 7], ['mphase', 8], ['mtransition', 7], ['ballot', 3], ['addressee', 3], ['powerscope', 3], ['succsource', 5], ['actbasis', 2], ['ratifydefault', 2], ['legitform', 2], ['taxmeasure', 6], ['taxtrigger', 3], ['casustarget', 4], ['casusprize', 5], ['migpart', 8], ['vitalside', 2], ['infperiod', 2]];
for (const [e] of closedFam) if (!app.includes('| `' + e + '` |')) r13.push('附表缺 ' + e);
const cnt = (e) => ((app.split('\n').find(l => l.startsWith('| `' + e + '` |')) ?? '').match(/`[a-z]+_[a-z_]+`/g) ?? []).length;
for (const [e, n] of closedFam) if (cnt(e) !== n) r13.push(`附表 ${e} 项数 ${cnt(e)}≠${n}`);
// §2.4 每个族都有定义节；封闭族在 §2.4 写明的项数与附表一致
const s24 = meta.filter(m => /^### 2\.4 /.test(m.h3)).map(m => m.line).join('\n');
for (const f of ['orgkind', 'politykind', 'power', 'powerscope', 'salary', 'succession', 'succsource', 'election', 'term', 'accession', 'actbasis', 'ratifydefault', 'motion', 'ballot', 'addressee', 'mphase', 'mtransition', 'permit', 'tenuremode', 'legit', 'legitform', 'claimbasis', 'taxbase', 'taxmeasure', 'taxtrigger', 'fkind', 'diplostatus', 'casus', 'casustarget', 'casusprize', 'settletier', 'amenity', 'popflow', 'migpart', 'popband', 'vitalside', 'infsrc', 'infperiod']) if (!s24.includes('| `' + f + '` |')) r13.push('§2.4 缺族 ' + f);
const cn = { 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 };
for (const [e, n] of closedFam) { const l = s24.split('\n').find(x => x.startsWith('| `' + e + '` |')) ?? ''; const mm = l.match(/封闭([两三四五六七八])项/); if (!mm || cn[mm[1]] !== n) r13.push(`§2.4 ${e} 项数与附表不符`); }
// 战事阶段登记（卷二十四 C24-16：wphase 退役，改向 evstage 族登记）：登记段恰有这四个 evst_war_* 代号
const evReg = meta.filter(m => /^### 本卷向卷二十四 `evstage` 族登记的条目/.test(m.h3) && m.fence === null).map(m => m.line).join('\n');
if (!evReg) r13.push('缺 evstage 登记段');
const evWar = new Set(evReg.match(/`evst_war_[a-z_]+`/g) ?? []);
for (const c of ['evst_war_declared', 'evst_war_fighting', 'evst_war_settled', 'evst_war_lapsed']) if (!evWar.has('`' + c + '`')) r13.push('evstage 登记段缺 ' + c);
if (evWar.size !== 4) r13.push(`evstage 登记段 evst_war_* 项数 ${evWar.size}≠4`);
// 反向判据（卷二十四 C24-16：wphase 已退役）：全卷（含登记段、§2.4、附表）不得出现 wphase_* 代号或 `wphase` 族行；
// 只豁免“## 附录 第N版修改记录”里的表格行（描述退役的历史行）。裸词 wphase 用于说明退役，不查。
meta.forEach((m, i) => {
  const histRow = /^## 附录 第[一二三四五六七八九十]+版修改记录$/.test(m.h2) && /^\| /.test(m.line);
  if (histRow) return;
  if (/\bwphase_[a-z0-9_]+/.test(m.line)) r13.push(`L${i + 1} 残留退役代号 ${m.line.match(/\bwphase_[a-z0-9_]+/)[0]}`);
  if (/^\| `wphase` \|/.test(m.line)) r13.push(`L${i + 1} 残留退役族行 wphase`);
});
// 待补清单条数
const todo = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line)).length;
if (todo < 5) r13.push('待补清单过少');
if (!meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line)).every(m => m.line.includes('待查（交 Opus）'))) r13.push('待补清单有未标状态的行');
// 迁移清单抽查的 file:line
const s7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
for (const f of ['entity-view.mjs:46', 'governance.mjs:509', 'elections.mjs:40', 'high-nobility.mjs:48', 'activities.mjs:257', 'titles.mjs:129', 'finance-tax.mjs:36', 'titles.mjs:65', 'promotion.mjs:54', 'organizations.mjs:415', 'organizations.mjs:311', 'governance.mjs:254', 'nation-founding.mjs:223', 'money.mjs:113', 'organization-state.mjs:94', 'faction-clock.mjs:222', 'family-diplomacy.mjs:39', 'standing.mjs:25', 'monster-society.mjs:166', 'elections.mjs:21', 'remote-generation.mjs:407', 'remote-generation.mjs:416', 'population-service.mjs:77', 'office-salary.mjs', 'group-account.mjs', 'war-diplomacy.mjs', 'advanceFactionClocks', 'tribal-awakening.mjs']) if (!s7.includes(f)) r13.push('§7 缺 ' + f);
report('12 接口、入口表、规则表键、错误码、枚举附表、迁移清单落实', r13.length === 0, r13.slice(0, 14).join(' | '));

// 13 去留表覆盖：§2.5 里以可终止实体 id 为键的路径都在 §3.3 登记或写明不属登记范围
const r14 = [];
const s33 = meta.filter(m => /^### 3\.3 /.test(m.h3)).map(m => m.line).join('\n');
for (const m of meta.filter(m => /^### 2\.5 /.test(m.h3) && /^\| `state\./.test(m.line))) { const p = (m.line.match(/`(state\.[A-Za-z]+)/) ?? [])[1]; if (p && !s33.includes(p)) r14.push(p); }
report('13 运行态路径都在 §3.3 有写者与去留交代', r14.length === 0, r14.join(','));

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleIds.size}；json 块 ${blocks.length}；待补清单 ${todo} 条；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
