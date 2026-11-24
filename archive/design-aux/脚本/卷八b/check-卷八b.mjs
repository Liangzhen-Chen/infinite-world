// 卷八b 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷八b-法律治安与刑罚.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 15;

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

// 2 十五个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report('2 十五个子系统各六小节齐全', miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

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
    if (!l) asr.push(`4.${n}:${k}`); else if (!new RegExp(`A8b-${n}\\.\\d`).test(l)) asr.push(`4.${n}:${k}无编号`);
  }
}
report('4 验收断言三式齐全且有编号', asr.length === 0, asr.join(','));

// 5 规则与正文无具体 id 字面量（允许区：代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|loc|bld|fac|recipe|org|orgkind|office|polity|law|deity|faith|culture|profession|skill|offense|status|etype|eff|mod|hk|res|purpose|puse|src|sink|ckind|obl|cphase|ophase|verb|power|penalty|justify|gate|evid|lflag|estate|claim|remedy|disp|scope|pmscope|norm|commute|crimeflow|gapkind|regime|agg|aggk|juris|rcls|layer|nlayer|custreg|lestate|casephase|penform|validity|reach|lawform|offmode|trial|ground|birth|gatekind)_[a-z0-9][a-z0-9_]*/g;
const allowWords = new Set(['holding_kind', 'record_class', 'event_type', 'facility_type', 'law_code', 'body_plan', 'status_family']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 5b 数据实例里也不写实例 id（本卷读法：实例一律用文字描述）
const instIds = [];
meta.forEach((m, i) => { if (/数据实例$/.test(m.h4) && m.fence === null) for (const hit of m.line.match(idRe) ?? []) instIds.push(`L${i + 1}:${hit}`); });
report('5b 数据实例不写实例 id', instIds.length === 0, instIds.slice(0, 10).join(' '));

// 6 无用于判断的描述性文本
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
const kw = ['规范栈', '法典按地区', '罪名谓词', '立案到执行', '刑罚', '流放', '赎罪', '复仇', '决斗', '法律门控', '合法性是后果', '处分权', '治安值', '治安力量响应', '安全状态', '通缉', '击杀权', '赏金', '腐败', '贿赂', '审计', '犯罪生态', '黑市', '走私罪名侧', '人质', '囚犯', '奴役', '赎身', '身份等级', '入籍', '民事', '救济'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
const codes = ['lawCodeView', 'offenseView', 'normStack', 'provisionFor', 'contrabandAt', 'enactLaw', 'repealLaw', 'bindLaw', 'state.lawBindings', 'offensesOfFact', 'noteFact', 'addWitness', 'caseStep', 'evidenceScore', 'convictionCount', 'state.offenseFacts', 'state.cases', 'state.criminalRecord', 'sentenceRange', 'commuteStep', 'justifications', 'lawGate', 'legalCapacity', 'legalityOf', 'validity', 'recognized', 'disposalRight', 'securityOf', 'responseOf', 'dispatchResponse', 'state.crimeLoad', 'safetyOf', 'attackLegality', 'settleFlags', 'issueWanted', 'liftWanted', 'state.legalFlags', 'bountiesOn', 'commissionStep', 'auditGaps', 'auditStep', 'state.lastAudit', 'crimeProspect', 'settleCrime', 'state.crimeRem', 'custodyOf', 'custodyStep', 'bondOf', 'bondStep', 'estateOf', 'naturalizeOptions', 'estateStep', 'claimsOf', 'limitationOf', 'agencyOf', 'goodFaithOf', 'applyRemedy', 'agencyStep', 'breachHandler', '无权代理', '无权处分', '善意取得', '时效', '违禁'];
const missCode = codes.filter(c => !body4.includes(c));
// 悬赏发布与领赏的入口出处（李白 11-14 卷二十四二审 T7 选甲：并入卷二十四委托，原 postBounty/claimBounty 删去）：
// §4.9.2 统一入口须写明写者为卷二十四 commissionStep 并带卷二十四 §4.5 引用；R8b-9.1 发布、R8b-9.3 领赏须各自引卷二十四入口
const s492 = meta.filter(m => m.h4 === '#### 4.9.2 统一入口').map(m => m.line).join('\n');
if (!/卷二十四 §4\.5（[^）]+）[^\n]*发布[^\n]*交差[^\n]*`commissionStep`/.test(s492)) missCode.push('§4.9.2 未引卷二十四发布/交差入口 commissionStep');
const r91 = meta.find(m => /^- \*\*R8b-9\.1 /.test(m.line))?.line ?? '';
if (!/卷二十四/.test(r91) || !/发布/.test(r91)) missCode.push('R8b-9.1 发布未引卷二十四');
const r93 = meta.find(m => /^- \*\*R8b-9\.3 /.test(m.line))?.line ?? '';
if (!/卷二十四[^\n]*交差/.test(r93) || !/`commissionStep`/.test(r93)) missCode.push('R8b-9.3 领赏未引卷二十四交差/commissionStep');
for (const gone of ['postBounty', 'claimBounty']) if (body4.includes(gone)) missCode.push('§4 仍用已删入口 ' + gone);
const ruleIds = new Set(body4.match(/R8b-\d+\.\d+/g) ?? []);
const gaps = [];
for (let n = 1; n <= N; n++) {
  const defs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => (m.line.match(/^- \*\*R8b-(\d+)\.(\d+) /) ?? [])).filter(x => x.length).map(x => [+x[1], +x[2]]);
  if (!defs.length) gaps.push(`no-def-4.${n}`);
  defs.forEach(([a, b], i) => { if (a !== n || b !== i + 1) gaps.push(`R8b-${a}.${b}@4.${n}`); });
}
report('7 台账各概念写全（标题、关键代号、每节有规则且编号连续）', missKw.length === 0 && missCode.length === 0 && gaps.length === 0, [...missKw, ...missCode, ...gaps].join(','));

// 8 跨卷引用带标题；规则编号引用不悬空；本卷 §4.n 不越界
const refRe = /卷[零一二三四五六七八九十]+[b甲乙]? §[^\s（）、，。；：|]*/g;
const badRef = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/^## (§7|§8|附)/.test(m.h2)) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
const defined = new Set(meta.map(m => (m.line.match(/^- \*\*(R8b-\d+\.\d+) /) ?? [])[1]).filter(Boolean));
const dangling = [...new Set(all.match(/R8b-\d+\.\d+/g) ?? [])].filter(r => !defined.has(r));
const selfRefs = [];
meta.forEach((m, i) => { for (const x of m.line.matchAll(/(?<![卷零一二三四五六七八九十甲乙b] )§4\.(\d+)/g)) if (+x[1] < 1 || +x[1] > N) { const before = m.line.slice(0, x.index); if (!/卷[零一二三四五六七八九十]+[b甲乙]?[^卷；。]*$/.test(before)) selfRefs.push(`L${i + 1}:§4.${x[1]}`); } });
const assertRefs = [...new Set(all.match(/A8b-\d+\.\d+/g) ?? [])];
const badAssert = assertRefs.filter(a => { const [n] = a.slice(4).split('.'); return +n < 1 || +n > N; });
report('8 跨卷引用带标题；规则编号引用不悬空；本卷节号不越界', badRef.length === 0 && dangling.length === 0 && selfRefs.length === 0 && badAssert.length === 0, [...badRef.slice(0, 12), ...dangling.map(d => '悬空 ' + d), ...selfRefs.slice(0, 5), ...badAssert].join(' '));

// 9 json 代码块可解析
let badJson = 0; const blocks = []; let buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { try { blocks.push(JSON.parse(buf.join('\n'))); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 90)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
// 种类行列数与列头一致
let colBad = 0;
for (const b of blocks) if (b.columns && b.rows) for (const r of b.rows) if (r.length !== b.columns.length) colBad++;
report(`9 json 代码块可解析且种类行列数对齐（${blocks.length + badJson} 块）`, badJson === 0 && colBad === 0, `bad=${badJson} col=${colBad}`);

// 10 红线：墙钟、除法保护、存法登记、不读事件日志
const r10 = [];
const isInstance = l => /^- 【/.test(l);
const isAssert = l => /^- (扫描式|不变量式|扩展性式)：/.test(l);
meta.forEach((m, i) => {
  if (m.fence !== null || /^## (附|§7|§8)/.test(m.h2)) return;
  if (/Date\.now|new Date|performance\.now|Math\.random|process\.env/.test(m.line)) r10.push(`L${i + 1}:墙钟或非登记随机`);
  if (/÷/.test(m.line) && !isInstance(m.line) && !/恒为正|不做除法|正整数|常数|每日分钟数/.test(m.line)) r10.push(`L${i + 1}:除数未说明`);
  if (!isInstance(m.line) && !isAssert(m.line) && /加权平均|均值|人均|之比|比值|占比|归一|的平均|求平均|取平均|平均值|算术平均|按[^，。；（(]{0,15}(?:权重|比例|份额)(?:分|摊|割|配)|占[^，。；]{0,15}(?:份额|比例)/.test(m.line) && !/恒为正|不做除法|正整数|交叉相乘|常数/.test(m.line)) r10.push(`L${i + 1}:隐式除法措辞无保护`);
  if (/(规则)$/.test(m.h4) && /读(取)?事件日志|查事件日志|回放日志/.test(m.line) && !/不读|不依赖/.test(m.line)) r10.push(`L${i + 1}:规则读事件日志`);
});
for (const p of ['state.crimeLoad[placeId]', 'state.crimeRem[placeId][flowRow]']) {
  if (!meta.some(m => /^### 2\.5 /.test(m.h3) && m.line.includes(p))) r10.push('§2.5 缺 ' + p);
  if (!meta.some(m => /^### 2\.7 /.test(m.h3) && m.line.includes(p))) r10.push('§2.7 缺 ' + p);
}
const s27 = meta.filter(m => /^### 2\.7 /.test(m.h3)).map(m => m.line).join('\n');
for (const w of ['stockMode', 'remainder', 'anchor', 'remDenominator', '卷二 §3.3（求值管线）', '切片不变']) if (!s27.includes(w)) r10.push('§2.7 缺 ' + w);
report('10 红线：不读墙钟、除数有下界或为 0 分支、存法与余数登记、不读事件日志', r10.length === 0, r10.slice(0, 12).join(' | '));

// 11 数据实例算术与余数结转复算
const r11 = [];
{
  const step = (st, n, D) => { const acc = st.rem + n; const out = acc / D; st.rem = acc - out * D; st.out += out; if (st.rem < 0n || st.rem >= D) r11.push('余数越界'); };
  // 统计层作案：70 × 3 × 5，分母 1000（§4.11.5）
  const a = { rem: 0n, out: 0n }; step(a, 1050n, 1000n); if (a.out !== 1n || a.rem !== 50n) r11.push('作案第一步');
  step(a, 1050n, 1000n); if (a.out !== 2n || a.rem !== 100n) r11.push('作案第二步');
  const b = { rem: 0n, out: 0n }; step(b, 3000n, 1000n); if (b.out !== 3n || b.rem !== 0n) r11.push('作案 200 人');
  // 切片不变：2100 一次与两次 1050
  const c = { rem: 0n, out: 0n }; step(c, 2100n, 1000n); if (c.out !== a.out || c.rem !== a.rem) r11.push('切片不变');
  // 治安负荷锚点（第二版：锚点存世界日序号 atDay，读数只随日变化）；任意切分读数相同
  const read = (anc, day, decay) => { const v = anc.value - decay * (day - anc.atDay); return v < 0n ? 0n : v; };
  const bump = (anc, day, decay, add) => ({ value: read(anc, day, decay) + add, atDay: day });
  let x = { value: 90n, atDay: 0n }; if (read(x, 4n, 10n) !== 50n) r11.push('负荷读数');
  // 一次读到第 9 日，与中途在第 2 日、第 5 日各加 0 点重设后读到第 9 日相同（未触底时）
  let y = { value: 90n, atDay: 0n }; y = bump(y, 2n, 10n, 0n); y = bump(y, 5n, 10n, 0n);
  if (read(x, 8n, 10n) !== read(y, 8n, 10n)) r11.push('负荷切片不变');
  // 同一日内两次重设与一次加总相同
  const s1 = bump(bump({ value: 90n, atDay: 0n }, 4n, 10n, 10n), 4n, 10n, 20n), s2 = bump({ value: 90n, atDay: 0n }, 4n, 10n, 30n);
  if (s1.value !== s2.value || s1.atDay !== s2.atDay) r11.push('同日重设');
  // 加点后的读数
  let z = bump({ value: 90n, atDay: 0n }, 4n, 10n, 30n); if (z.value !== 80n || z.atDay !== 4n) r11.push('负荷重设');
}
const fl = Math.floor;
const calc = [
  ['4.2 证言', fl(60 * 8000 * 9000 / 100000000), 43], ['4.2 物证', fl(50 * 8000 * 10000 / 100000000), 40], ['4.2 证据分', 43 + 40, 83], ['4.2 分成', fl(480 * 2000 / 10000), 96], ['4.2 入库', 480 - 96, 384],
  ['4.3 刑量', fl(480 * (10000 + 500 * 2) / 10000), 528], ['4.3 易刑', fl((528 * 1 + 40 - 1) / 40), 14], ['4.3 赎罪折虔诚', fl((200 * 1 + 4 - 1) / 4), 50],
  ['4.6 两人', 5000 + 3000, 8000], ['4.6 门槛', 8000 >= 6667, true], ['4.6 一人不足', 5000 >= 6667, false],
  ['4.7 执法 x', fl(120 * 1000 / 800), 150], ['4.7 负荷', 90 - 10 * 4, 50], ['4.7 负荷 x', fl(50 * 1000 / 800), 62], ['4.7 治安值', fl((2 * 70 + 2 * 60 + 1 * (100 - 30)) / 5), 66], ['4.7 驿站', fl((2 * 30 + 2 * 5 + 1 * (100 - 30)) / 5), 28],
  ['4.9 首份', fl(600 * 6000 / 10000), 360], ['4.9 末份', 600 - 360, 240], ['4.9 份数', 3000 / 15, 200],
  ['4.10 差额', 5000 - 3800 - 400, 800], ['4.10 容许', fl(5000 * 200 / 10000), 100], ['4.10 查出', fl(800 * 7500 / 10000), 600], ['4.10 两笔', 300 + 250, 550], ['4.10 三笔超', 550 + 250 > 600, true],
  ['4.11 件数', fl(200 * 3 * 5 / 1000), 3], ['4.11 小集', 70 * 3 * 5, 1050],
  ['4.14 居住日数', 5 * 365, 1825],
  ['4.15 价款', 90 * 10000 >= 100 * 8000, true], ['4.15 清算一', fl(6000 * 4000 / 8000), 3000], ['4.15 清算二', fl(6000 * 3000 / 8000), 2250], ['4.15 清算末', 6000 - 3000 - 2250, 750], ['4.15 末份不超请求', 750 <= 1000, true]
];
const badCalc = calc.filter(([, got, want]) => got !== want).map(([n]) => n);
const missNum = calc.filter(([, , want]) => typeof want === 'number' && !all.includes(String(Math.abs(want)))).map(([n, , w]) => n + '=' + w);
report(`11 数据实例算术与余数结转复算（${calc.length} 项加 9 组）`, r11.length === 0 && badCalc.length === 0 && missNum.length === 0, [...r11, ...badCalc, ...missNum].join(','));

// 12 接口与登记落实
const r13 = [];
const s5 = meta.filter(m => /^## §5 /.test(m.h2)).map(m => m.line).join('\n');
for (const v of ['卷二', '卷三乙', '卷四', '卷五', '卷六', '卷七', '卷八', '卷九', '卷十', '卷十三', '卷十四', '卷十五', '卷十六', '卷十七', '卷十八', '卷十九', '卷二十', '卷二十一', '卷二十二', '卷二十四', '卷二十五', '卷二十六', '卷二十七', '卷二十九']) if (!new RegExp(`^\\| ${v} \\|`, 'm').test(s5)) r13.push('§5.2 缺 ' + v);
const s3 = meta.filter(m => /^### 3\.[12] /.test(m.h3)).map(m => m.line).join('\n');
const foreign = new Set(['contractView', 'obligationsOf', 'contractStep', 'priceFor', 'economyReport', 'hasPower', 'governorOf', 'popView', 'popApply', 'placeView', 'personView', 'facilityView', 'identify', 'perceive', 'canEnter', 'evaluationOf', 'faithUnlocked', 'heirsOf', 'vacateOffice', 'taxesFor', 'stratumSkill', 'edgeId', 'placeId', 'personId', 'orgId', 'factId', 'caseId', 'contractId', 'lotRef', 'breachRef', 'remedyHandle', 'transferRef', 'gateHandle', 'offenseHandle', 'scopeHandle', 'dispHandle', 'subjectRef', 'targetRef', 'actorRef', 'actorId', 'targetId', 'attackerId', 'principalId', 'periodIndex', 'subjectId', 'allowRX', 'valueRX', 'stateRX', 'setWhenRX', 'whenRX', 'targetRX', 'matchRX', 'applicabilityRX', 'amountRX', 'floorRX', 'capRX', 'minEscrowRX', 'lawSlots', 'sinceDay', 'untilDay', 'analogyOf', 'outsiderEstate', 'intentRequired', 'privateOnly', 'severityBase', 'loadWeight', 'evidenceRequired', 'evidenceDefault', 'intakeFloor', 'intakeDays', 'appealDays', 'maxAppeals', 'detainDays', 'settleAllowed', 'informerBps', 'limitDays', 'goodFaith', 'minPaidBps', 'excludeTainted', 'reclaimDays', 'accusedKey', 'retainUntil', 'baseWeight', 'recordWeight', 'dreadPerUnit', 'rateNumerator', 'rateDenominator', 'needsEdge', 'consumesEdge', 'defaultAllow', 'defaultValueKey', 'pairedJustify', 'needsBps', 'blockedBy', 'shareSum', 'grantsEntry', 'grantsKillRight', 'takeBps', 'catchBps', 'penaltyCost', 'toleranceBps', 'barsActions', 'escapeEaseBps', 'laborDuty', 'needsShareBps', 'mayFile', 'mayOwnLand', 'mayHoldOffice', 'mayBeBonded', 'weightBps', 'byBirth', 'measurePuse', 'needsCase', 'interestBps', 'interestPeriodDays', 'lapsesAt', 'relMaturity', 'ageYears', 'appointedBy', 'lawHabits', 'jurisdictionKinds', 'effectOnBreach', 'decayPerDay', 'popFloor', 'enforceCurve', 'loadCurve', 'credCurve', 'lagDays', 'settleDays', 'guardSkill', 'findCurve', 'onFail', 'placement']);
const used = new Set();
meta.filter(m => /统一入口$/.test(m.h4)).forEach(m => { for (const x of m.line.matchAll(/`([a-z][A-Za-z]+)(?:\(|`)/g)) used.add(x[1]); });
for (const u of used) if (!s3.includes('`' + u) && !foreign.has(u) && !/^(rules|state)$/.test(u) && /[A-Z]/.test(u)) r13.push('入口未进 §3: ' + u);
// §3.1/§3.2 列的每个入口都在 §4 的某个“统一入口”或“规则”小节里出现
const entryNames = new Set();
// 勘误删去的入口（第三栏为“已删去”）：不计入须在 §4 使用之列，但该行须写明去处为卷二十四 §4.5 委托的写者 commissionStep，且 §4 不再使用
const deletedEntries = new Set();
meta.filter(m => /^### 3\.[12] /.test(m.h3) && /^\| `/.test(m.line)).forEach(m => {
  const cells = m.line.split('|'); const names = [...cells[1].matchAll(/`([a-z][A-Za-z]+)/g)].map(x => x[1]);
  if (/^\s*—\s*$/.test(cells[2] ?? '') && /^\s*已删去/.test(cells[3] ?? '')) {
    if (!/卷二十四 §4\.5（[^）]+）/.test(cells[3]) || !/`commissionStep`/.test(cells[3])) r13.push('§3 删去入口未写明卷二十四去处: ' + names.join('/'));
    names.forEach(n => deletedEntries.add(n));
  } else names.forEach(n => entryNames.add(n));
});
for (const e of entryNames) if (!body4.includes(e)) r13.push('§3 入口未在 §4 使用: ' + e);
for (const e of deletedEntries) if (body4.includes(e)) r13.push('§3 已删入口仍在 §4 使用: ' + e);
for (const e of ['postBounty', 'claimBounty']) if (!deletedEntries.has(e) && !entryNames.has(e)) r13.push('§3 入口表缺 ' + e + ' 的去处行');
// 规则表键
const s26 = meta.filter(m => /^### 2\.6 /.test(m.h3)).map(m => m.line).join('\n');
const usedKeys = new Set((all.match(/rules\.law\.[A-Za-z]+(?:\.[A-Za-z]+)*/g) ?? []));
for (const k of usedKeys) { const segs = k.replace(/^rules\./, '').split('.'); const head = segs.slice(0, Math.min(3, segs.length)).join('.'); if (!s26.includes('`' + head)) r13.push('§2.6 缺键 ' + head); if (segs.length > 3 && !new RegExp('`' + head.replace(/\./g, '\\.') + '`[^\\n]*\\b' + segs[3] + '\\b').test(s26)) r13.push('§2.6 结构缺成员 ' + segs.join('.')); }
// 错误码
const s28 = meta.filter(m => /^### 2\.8 /.test(m.h3)).map(m => m.line).join('\n');
const usedErr = new Set(all.match(/E-(?:OFF|LAW|FACT|CASE|PEN|DISP|FLAG|BOUNTY|AUDIT|CRIME|CUSTODY|ESTATE|CIVIL)-[A-Z-]+[A-Z]/g) ?? []);
for (const e of usedErr) if (!s28.includes('| ' + e + ' |')) r13.push('§2.8 缺 ' + e);
const defErr = [...s28.matchAll(/^\| (E-[A-Z-]+) \|/gm)].map(x => x[1]);
for (const e of defErr) if ((all.split(e).length - 1) < 2) r13.push('§2.8 定义未用 ' + e);
// 封闭枚举附表
const app = meta.filter(m => /^## 附 术语/.test(m.h2)).map(m => m.line).join('\n');
const cnt = (e) => ((app.split('\n').find(l => l.startsWith('| `' + e + '`')) ?? '').match(/`[a-z]+_[a-z_]+`/g) ?? []).length;
for (const [e, n] of [['offmode', 2], ['lawform', 5], ['normlayer', 6], ['casephase', 10], ['trialmode', 3], ['penform', 8], ['validity', 3], ['reach', 4], ['gatekind', 2], ['claimground', 3], ['birthrule', 5]]) if (cnt(e) !== n) r13.push(`附表 ${e} 项数 ${cnt(e)}≠${n}`);
// §2.4 每个族都在
const s24 = meta.filter(m => /^### 2\.4 /.test(m.h3)).map(m => m.line).join('\n');
for (const f of ['offmode', 'lawform', 'normlayer', 'norm', 'casephase', 'evidence', 'trialmode', 'penalty', 'penform', 'commute', 'justify', 'gate', 'gatekind', 'validity', 'disp', 'permitscope', 'lflag', 'reach', 'regime', 'estate', 'birthrule', 'claim', 'claimground', 'remedy', 'crimeflow', 'gapkind']) if (!s24.includes('| `' + f + '`')) r13.push('§2.4 缺族 ' + f);
// 第二版：封闭族按卷六 cphase 写法登记前缀；“封闭 N 项”与附表一致，且附表取值都以登记的前缀开头
const cn = { 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 八: 8, 十: 10 };
const closedFams = [...s24.matchAll(/^\| `([a-z]+)` \| (`[a-z]+_`|—) \| 封闭(.)项/gm)];
if (closedFams.length !== 12) r13.push(`§2.4 封闭族行数 ${closedFams.length}≠12`); // 第三版新增 lawsrc 族（李白 11-13 卷八b N1 裁定乙）
for (const m of closedFams) {
  if (m[2] === '—') r13.push(`§2.4 ${m[1]} 封闭族未登记前缀`);
  if (cnt(m[1]) !== cn[m[3]]) r13.push(`§2.4 ${m[1]} 封闭${m[3]}项与附表 ${cnt(m[1])} 不符`);
  const pre = m[2].replace(/`/g, '');
  const vals = (app.split('\n').find(l => l.startsWith('| `' + m[1] + '`')) ?? '').split('|')[3] ?? '';
  for (const v of vals.match(/`[a-z]+_[a-z_]+`/g) ?? []) if (!v.slice(1).startsWith(pre)) r13.push(`附表 ${m[1]} 取值 ${v} 不以 ${pre} 开头`);
}
// 前缀互不相同，且不与卷二族前缀表已有的 layer_、卷十八 succession_source 的取值开头相撞
const pres = [...s24.matchAll(/^\| `[a-z]+` \| `([a-z]+_)` \|/gm)].map(x => x[1]);
if (new Set(pres).size !== pres.length) r13.push('§2.4 前缀重复');
for (const p of pres) if (['layer_', 'regime_', 'estate_', 'agg_'].includes(p)) r13.push('§2.4 前缀冲突 ' + p);
// 待补清单
const todoRows = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line));
if (todoRows.length < 5) r13.push('待补清单过少');
if (!todoRows.every(m => m.line.includes('待查（交 Opus）'))) r13.push('待补清单有未标状态的行');
// 迁移清单抽查的 file:line
const s7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
for (const f of ['law.mjs:281', 'law.mjs:104', 'law.mjs:484', 'law.mjs:3', 'law-codes.mjs:114', 'law-codes.mjs:11', 'norm-stack.mjs:115', 'law-codes.mjs:35', 'law-codes.mjs:59', 'law.mjs:85', 'bounty.mjs:45', 'bounty.mjs:117', 'npc-crime.mjs:42', 'npc-crime.mjs:27', 'npc-crime.mjs:86', 'smuggling.mjs:18', 'duels.mjs:19', 'family-law.mjs:19', 'location-access.mjs:48', 'credit.mjs:54', 'obligation-runtime.mjs:44', 'transition.mjs:122', 'family-politics.mjs:20', '118 处']) if (!s7.includes(f)) r13.push('§7 缺 ' + f);
// 卷零行号
const s03 = meta.filter(m => /^### 0\.3 /.test(m.h3)).map(m => m.line).join('\n');
for (const n of [239, 240, 241, 242, 243, 244, 248, 252, 253, 254, 594, 677, 678, 688, 689, 694, 695, 696, 1205, 1136]) if (!s03.includes(`第 ${n} 行`)) r13.push('§0.3 缺行号 ' + n);
report('12 接口、入口表、规则表键、错误码、枚举附表、迁移清单、卷零行号落实', r13.length === 0, r13.slice(0, 16).join(' | '));

// 13 去留表覆盖：§2.5 的各路径都在 §3.3 有交代
const r14 = [];
const s33 = meta.filter(m => /^### 3\.3 /.test(m.h3)).map(m => m.line).join('\n');
for (const m of meta.filter(m => /^### 2\.5 /.test(m.h3) && /^\| `state\./.test(m.line))) { const p = (m.line.match(/`(state\.[A-Za-z]+)/) ?? [])[1]; if (p && !s33.includes(p)) r14.push(p); }
report('13 运行态路径都在 §3.3 有写者与去留交代', r14.length === 0, r14.join(','));

// 14 每节规则引用的本卷断言与扫描条存在
const scanDefs = new Set(meta.filter(m => /^### 3\.5 /.test(m.h3)).map(m => (m.line.match(/^- (S8b-\d+)：/) ?? [])[1]).filter(Boolean));
const scanUsed = [...new Set(all.match(/S8b-\d+/g) ?? [])].filter(s => !scanDefs.has(s));
report('14 扫描条引用都有定义', scanUsed.length === 0, scanUsed.join(','));

// 15 一审真问题回归（第二版新增，只加不减）
const r15 = [];
const jb = blocks.find(b => b.extra) ?? {};
for (const [k, v] of Object.entries(jb.extra ?? {})) { if (v.intimate !== false) r15.push(`#1 ${k}.intimate 非假`); if ('succeedBy' in v && v.succeedBy !== 'estate_heirs') r15.push(`#19 ${k}.succeedBy`); }
for (const a of jb.aggKindRows ?? []) { if (!/^aggk_/.test(a.aggKind)) r15.push('#19 聚合种类前缀 ' + a.aggKind); if (!Array.isArray(a.pooledResources)) r15.push('#19 缺 pooledResources ' + a.aggKind); }
if (!Array.isArray((jb.extra ?? {}).hk_detained?.hooks)) r15.push('#19 羁押行未交代 hooks');
const body = meta.filter(m => !/^## (§8|附)/.test(m.h2) && m.fence === null).map(m => m.line).join('\n');
// #7 依据：李白 11-14 20:20 ②改判——lawFrame{place, minute} 仍是本卷局部结构、不并入卷二 frame；读入口另接受卷二 §2.2 的 frame；裁断类带空 frame 读真值（R8b-5.11）
{
  const lfDefs = [...body.matchAll(/lawFrame`?[^{}\n`]{0,30}`?\{([^}\n]*)\}/g)].map(m => m[1]);
  if (lfDefs.length === 0) r15.push('#7 未见 lawFrame 结构定义');
  for (const d of lfDefs) { const ks = d.split(/[,，]/).map(s => s.trim().split(/[:：\s]/)[0]).filter(Boolean).sort().join(','); if (ks !== 'minute,place' || /observer/.test(d)) r15.push('#7 lawFrame 结构不为 {place, minute}：' + d); }
  if (body.split('\n').some(l => /lawFrame/.test(l) && (/lawFrame`?\s*(?:即|就是|等于|等同于|=)\s*(?:卷二的?\s*)?`?frame/.test(l) || /(?<!不)并入(?:卷二(?:\s*§2\.2)?\s*的?\s*)?`?frame/.test(l) || /lawFrame[^。；\n]{0,20}(?:含|带|加)[^。；\n]{0,6}observer/.test(l)))) r15.push('#7 lawFrame 与卷二 frame 合并或含 observer');
  const l511 = body.split('\n').find(l => /^- \*\*R8b-5\.11 /.test(l)) ?? '';
  if (!/本卷局部结构/.test(l511) || !/不并入卷二的 `frame`/.test(l511)) r15.push('#7 R8b-5.11 未写 lawFrame 为局部结构且不并入');
  if (!/审判、定罪、刑罚、执行器的效力判定一律带空 `frame` 读真值/.test(l511)) r15.push('#7 R8b-5.11 未写裁断类带空 frame 读真值');
  if (!/另接受卷二 §2\.2(?:（[^（）\n]{1,20}）)? ?的 `frame`/.test(body)) r15.push('#7 读入口未写另接受卷二 §2.2 的 frame');
}
if (/derived score/.test(meta.filter(m => /^### 2\.3 /.test(m.h3)).map(m => m.line).join('\n').replace(/现把 `security` 登记为 `derived score`/, ''))) r15.push('#2 security 仍登记为派生维度');
if (/floor\(\(now − at\)/.test(body)) r15.push('#2 负荷读分钟');
if (/滞后日数之前/.test(body)) r15.push('#4 读历史控制度');
if (/生成行|建行写者/.test(body.replace(/不收运行态生成行/g, ''))) r15.push('#6 运行期写目录表');
if (!/`modifiers` \| list<修正项>/.test(body)) r15.push('#8 法典条目缺 modifiers');
if (/`identify` 返回个体|经卷四的 `identify` 把键解析/.test(body)) r15.push('#9 由键反查个体');
if (!/只挂在“因目击而转真”上/.test(body)) r15.push('#10 设旗未与案件引用分开');
if (!/R8b-1\.15 承办组织/.test(body) || /立法者组织/.test(body)) r15.push('#11 承办组织回退链');
if (/`attackable: boolean`/.test(body)) r15.push('#17 lflag 仍带 attackable');
if (/罪已赎/.test(body.replace(/不另发“罪已赎”事件|“罪已赎”一类赎罪事件/g, ''))) r15.push('#14 罪已赎事件');
if (/`basis: enum/.test(body)) r15.push('#18 claim.basis');
if (!/pardon, guard: ref vocab power/.test(meta.filter(m => /^### 2\.6 /.test(m.h3)).map(m => m.line).join('\n'))) r15.push('#20 缺 guard 权能');
if (!/R27-8\.9/.test(meta.filter(m => /^### 2\.5 /.test(m.h3)).map(m => m.line).join('\n'))) r15.push('#21 id 派生未写');
if (!/`law\.case\.retainDays`/.test(body)) r15.push('#21 案件无寿命');
if (!/state\.limitAnchors/.test(body)) r15.push('#16 无时效锚点');
if (!/`intentForm`/.test(body)) r15.push('#15 决斗读事件');
report('15 一审 21 条真问题回归', r15.length === 0, r15.join(' | '));

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleIds.size}；json 块 ${blocks.length}；待补清单 ${todoRows.length} 条；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
