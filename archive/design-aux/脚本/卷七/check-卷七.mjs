// 卷七 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷七-信仰与文化.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
// 自检附录本身不参加检查
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 30;

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
report('1b 卷首署名行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档') && /^# 卷七 信仰与文化（第[一二三四五六七八九十]+版）$/.test(lines[0])); // 版本号不写死，免每版改锚点

// 2 三十个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
const extra4 = lines.filter(l => /^### 4\.\d+ /.test(l)).length;
report('2 三十个子系统各六小节齐全', miss4.length === 0 && extra4 === N, miss4.join(',') + (extra4 !== N ? ` 子系统标题数=${extra4}` : ''));

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
    if (!l) asr.push(`4.${n}:${k}`); else if (!new RegExp(`A7-${n}\\.\\d`).test(l)) asr.push(`4.${n}:${k}无编号`);
  }
}
report('4 验收断言三式齐全且有编号', asr.length === 0, asr.join(','));

// 5 规则与正文无具体 id 字面量（允许区：代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|flora|loc|bld|fac|recipe|org|orgkind|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|pers|value|ethic|sfam|class|comp|verb|rel|param|req|hk|saxis|res|flayer|dgroup|doctrine|tenet|sphere|aspect|taboo|offering|hostility|valence|heritage|ethos|martial|aesthetic|tradition|descent|burial|unitset|lang|bank|pattern|word|script|wtier|dtier|vow|fest|passage|custom|divn|prefk|rtier|remrow|act|casus|terrain|taxon|matcat|subst|service)_[a-z0-9][a-z0-9_]*/g;
const allowWords = new Set(['faith_layer', 'doctrine_group', 'status_family', 'status_target', 'body_plan', 'body_part', 'law_code', 'event_type', 'event_role', 'pref_kind', 'respect_tier', 'worship_tier', 'devotion_tier', 'rem_row', 'tenet_state', 'reform_kind', 'convert_mode', 'fest_kind', 'omen_role', 'custom_by', 'project_kind', 'holding_kind', 'facility_type', 'stance_axis', 'record_class']);
const idHits = [];
meta.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  // 必填列豁免：表格里整格恰是卷二 §1.2 `.required` 语法的条件表达式（always / never / byClass:<class> / ifPresent:<dim> / byEnum:<dim>=<value> / anyOf:… / byDigestible / byReader），
  // 该格里的代号是条件的取值，不是正文引用具体 id；格里另有别的文字即不豁免，照查
  const REQ = /^(?:always|never|byDigestible|byReader|byClass:[a-z0-9_]+|ifPresent:[A-Za-z0-9_.]+|byEnum:[A-Za-z0-9_.]+=[a-z0-9_]+|anyOf:[A-Za-z0-9_.]+(?:,[A-Za-z0-9_.]+)+)$/;
  const scanLine = m.line.startsWith('|') ? m.line.split('|').map(c => (REQ.test(c.trim()) ? '' : c)).join('|') : m.line;
  for (const hit of scanLine.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 6 无用于判断的描述性文本：规则区不出现字符串方法、含中文的正则；json 块里中文只许在 labels、basis
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
meta.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §[235] /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (m.fence === 'json' && /[\u4e00-\u9fff]/.test(m.line.replace(/"labels":\s*\{[^}]*\}/g, '').replace(/"basis":\s*"[^"]*"/g, ''))) textHits.push(`L${i + 1}(json)`);
  if (inRule && m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
});
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 10).join(' '));

// 7 台账判给本卷的概念写全：标题关键词、关键代号、每节至少一条规则
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['宗教四层', '教义组', '信条', '圣地', '热忱', '信仰敌意', '教首', '仪轨', '改宗', '异端', '虔诚', '奉献等级', '神祇', '领域词表', '崇拜等级', '祈祷需求', '神迹预算', '占卜', '托梦', '神谕', '预兆', '宗教场所密度', '龛祠', '修会', '出家', '还俗', '节日', '市集日', '人生礼仪', '失礼', '五支柱', '风气', '传统', '接纳', '融合', '分化', '文化首领', '领地改化', '伦理与价值', '美德', '罪行', '羞耻', '语言', '命名', '文化偏好输出接口', '尊重与排除名单三档', '信仰战争'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
const codes = ['faithDistance', 'doctrineOf', 'faithUnlocked', 'tenet_state', 'eminentSites', 'sanctity', 'driftRows', 'hostilityOf', 'ordained', 'reformOptions', 'conversionOdds', 'state.conversionRem', 'convertWithRem', 'devotionTier', 'miracleBudget', 'sphereAffinity', 'worshipTier', 'miracleOptions', 'divinationOptions', 'shrineDemand', 'vowsOf', 'festivalsAt', 'pendingCustoms', 'pillars', 'prefShift', 'traditionOptions', 'acceptance', 'cultureHead', 'state.assimilationRem', 'tabooBreach', 'evaluationOf', 'interpretedScore', 'nameTable', 'culturePref', 'respectTier', 'holyWarEligible', 'integrationOf', 'acceptanceOfPerson', 'riteCount', 'state.cultureIntegration', 'state.petitionLast', 'state.cultureHeadLast', 'state.cultOfferers', 'antagonistic', 'headFlag', 'shrineService', 'scoreRX'];
const missCode = codes.filter(c => !body4.includes(c));
const ruleIds = new Set(body4.match(/R7-\d+\.\d+/g) ?? []);
const perSub = []; for (let n = 1; n <= N; n++) if (![...ruleIds].some(r => r.startsWith(`R7-${n}.`))) perSub.push(n);
// 规则编号各节内从 1 连续
const gaps = [];
for (let n = 1; n <= N; n++) {
  const defs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => (m.line.match(/^- \*\*R7-(\d+)\.(\d+) /) ?? [])).filter(x => x.length).map(x => [+x[1], +x[2]]);
  defs.forEach(([a, b], i) => { if (a !== n || b !== i + 1) gaps.push(`R7-${a}.${b}@4.${n}`); });
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
const defined = new Set(meta.map(m => (m.line.match(/^- \*\*(R7-\d+\.\d+) /) ?? [])[1]).filter(Boolean));
const dangling = [...new Set(all.match(/R7-\d+\.\d+/g) ?? [])].filter(r => !defined.has(r));
const secRefs = [...new Set(all.match(/(?<![卷零一二三四五六七八九十甲乙b] )§4\.(\d+)(?:\.(\d))?/g) ?? [])];
report('8 跨卷引用带标题；规则编号引用不悬空', badRef.length === 0 && dangling.length === 0, [...badRef.slice(0, 8), ...dangling.map(d => '悬空 ' + d)].join(' '));

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
meta.forEach((m, i) => {
  if (m.fence !== null || /^## (附|§7)/.test(m.h2)) return;
  if (/Date\.now|new Date|performance\.now|Math\.random|process\.env/.test(m.line)) r10.push(`L${i + 1}:墙钟或非登记随机`);
  // 规则与维度小节里的显式除法：同一行必须有正下界或为 0 分支的说明
  if (/(规则|维度)$/.test(m.h4) && /÷/.test(m.line) && !/正整数|恒正|不做除法|÷ 2(?![\d.])/.test(m.line)) r10.push(`L${i + 1}:除数未说明`);
});
for (const p of ['state.faithRem[holderId][remRow]', 'state.conversionRem[placeId][flowRow]', 'state.assimilationRem[placeId][flowRow]']) {
  if (!meta.some(m => /^### 2\.7 /.test(m.h3) && m.line.includes(p))) r10.push('§2.7 缺 ' + p);
  if (!meta.some(m => /^### 3\.3 /.test(m.h3) && m.line.includes(p) && m.line.includes('`clear`'))) r10.push('§3.3 去留表缺 ' + p);
}
for (const p of ['state.petitionLast[placeId][faithId]', 'state.cultureIntegration[personId]']) {
  if (!meta.some(m => /^### 2\.7 /.test(m.h3) && m.line.includes(p))) r10.push('§2.7 缺 ' + p);
  if (!meta.some(m => /^### 3\.3 /.test(m.h3) && m.line.includes(p) && m.line.includes('`clear`'))) r10.push('§3.3 去留表缺 ' + p);
}
const s27 = meta.filter(m => /^### 2\.7 /.test(m.h3)).map(m => m.line).join('\n');
for (const w of ['stockMode', 'extScale', 'remainder', 'raw', '卷二 §3.3（求值管线）']) if (!s27.includes(w)) r10.push('§2.7 缺 ' + w);
if (!/R7-5\.5 存法与误差界/.test(all) || !/n × K × 10⁻⁸/.test(all)) r10.push('热忱误差界');
if (!/R7-24\.7 存法与误差界/.test(all) || !/4n × 10⁻⁸/.test(all)) r10.push('融入度误差界');
report('10 红线：不读墙钟、除数有下界或为 0 分支、存法与余数登记', r10.length === 0, r10.slice(0, 10).join(' | '));

// 11 余数结转算术复算（R7-9.4、R7-10.3、R7-10.5、R7-24.3 同式）：切片不变、余数在界内、小量不被永远截成 0
const r11 = [];
{
  const step = (st, n, D) => { const acc = st.rem + n; const out = acc / D; st.rem = acc - out * D; st.out += out; if (st.rem < 0n || st.rem >= D) r11.push('余数越界'); };
  // 供奉：12 × 5，分母 100（§4.10.5）
  const a = { rem: 0n, out: 0n }; step(a, 60n, 100n); if (a.out !== 0n || a.rem !== 60n) r11.push('供奉第一次'); step(a, 60n, 100n); if (a.out !== 1n || a.rem !== 20n) r11.push('供奉第二次');
  // 切片不变：600 一次与 100 次 6
  const b1 = { rem: 0n, out: 0n }; step(b1, 600n, 100n); const b2 = { rem: 0n, out: 0n }; for (let i = 0; i < 100; i++) step(b2, 6n, 100n);
  if (b1.out !== b2.out || b1.rem !== b2.rem) r11.push('切片不变');
  // 改宗流：桶 4000、分子 1、分母 500 → 8；桶 300 → 0 余 300，再 300 → 1 余 100（§4.9.5）
  const c = { rem: 0n, out: 0n }; step(c, 4000n, 500n); if (c.out !== 8n || c.rem !== 0n) r11.push('改宗流 4000');
  const d = { rem: 0n, out: 0n }; step(d, 300n, 500n); if (d.out !== 0n || d.rem !== 300n) r11.push('改宗流 300 一'); step(d, 300n, 500n); if (d.out !== 1n || d.rem !== 100n) r11.push('改宗流 300 二');
  // 改化流：桶 5000、分母 400 → 12 余 200（§4.24.5）
  const e = { rem: 0n, out: 0n }; step(e, 5000n, 400n); if (e.out !== 12n || e.rem !== 200n) r11.push('改化流 5000');
}
const near = (x, y) => Math.abs(x - y) < 1e-9;
// 第四项是正文里必须出现的带上下文原句片段（第二版起：不再只查数字是否出现过，一审指出小数字必然找得到）
const r4 = x => Math.round(x * 10000) / 10000;
const calc = [
  ['分歧度', 2 * 500, 1000, '分歧度增加 2 × 500 = 1000'], ['创立 raw', 200 + 300, 500, 'raw = 200 + 300 = 500'], ['创立 cost', Math.floor(500 * 0.6), 300, '`cost = 300`'], ['热忱 净值', 0.015 - 0.005 - 0.01, 0, '0.015 − 0.005 − 0.01 = 0'],
  ['改宗 margin', 0.2 + 0.1 - 0.1, 0.2, '− 0.1（敌意成本）= 0.2`'], ['神迹 幅度', Math.min(25, 30, Math.floor(120 / 4)), 25, 'floor(120 ÷ 4)) = 25'], ['神迹 花费', 25 * 4, 100, '扣 100'],
  ['庙', Math.floor(1800 / 600), 3, '应有庙 3、龛祠 30'], ['龛祠', Math.floor(1800 / 60), 30, '应有庙 3、龛祠 30'], ['少数 庙', Math.floor(500 / 600), 0, '应有庙 0、龛祠 8'], ['少数 龛祠', Math.floor(500 / 60), 8, '应有庙 0、龛祠 8'],
  ['接纳', 20 + 10 + 10 + 5, 45, '`score` 45'], ['语言上限', 1 + Math.floor(12 / 5), 3, '`cap = 1 + floor(12 ÷ 5) = 3`'], ['译者', Math.floor(Math.min(900, 600) * 0.5), 300, '`min(900, 600) × 0.5 = 300`'], ['禁忌 汤', 0.9 * 0.3, 0.27, '`breach` 0.27'], ['戒律偏好', 0.6 - 0.6, 0, '0.6 − 0.6 后为 0'],
  // 融入度（第二版）
  ['融入 年速率总和', r4(1 - Math.pow(0.5, 0.1)), 0.067, '0.0670'], ['融入 kYear', r4((1 - Math.pow(0.5, 0.1)) * 0.16 / 0.45), 0.0238, '拆成 0.0238 与 0.0432'], ['融入 kContact', r4((1 - Math.pow(0.5, 0.1)) * 0.29 / 0.45), 0.0432, '拆成 0.0238 与 0.0432'],
  ['融入 k', 0.0432 * 0.5, 0.0216, '`k = 0.0432 × 0.5 = 0.0216`'], ['融入 十年', Math.round((1 - Math.pow(1 - 0.0216, 10)) * 1000) / 1000, 0.196, '十年后约 0.196'], ['融入 接纳混合', Math.round((10 + 0.196 * 50) * 10) / 10, 19.8, '10 + 0.196 × 50 ≈ 19.8'],
  ['融入 m', Math.ceil(0.0238 + 0.0432 + 3), 4, 'm = ⌈3.067⌉ = 4'],
  // 第三版：kMax 缺省取值、价值修正定值
  ['融入 kMax 缺省', r4(0.0238 + 0.0432), 0.067, '取 `kYear + kContact` = 0.0670'], ['融入 价值修正', r4(0.0216 * 0.4 * 100) / 100, 0.00864, '0.0216 × 0.4 = 0.00864']
];
const badCalc = calc.filter(([, got, want]) => !near(got, want)).map(([n]) => n);
const missNum = calc.filter(([, , , needle]) => !all.includes(needle)).map(([n, , , s]) => n + '缺原句:' + s);
if (!near(45 / 70, 0.642857142857) || !all.includes('约 0.64')) r11.push('接纳系数');
report(`11 数据实例算术与余数结转复算（${calc.length} 项加 7 组余数）`, r11.length === 0 && badCalc.length === 0 && missNum.length === 0, [...r11, ...badCalc, ...missNum].join(','));

// 12 热忱误差界验算：日漂移只做整数加法，n 日后定点值与有理参考值之差不超过 n × K × 10⁻⁸
{
  const S8 = 100000000n; const yearDays = 360n; // 年长取示例历法行的 360 日，只用于本验算
  const perYear = [15000n, -5000n, -10000n].map(x => x * 100n); // 0.015、−0.005、−0.01 的 10⁸ 标度（10⁴ 标度值 × 100；第一版误乘 10⁴，大了 100 倍，一审指出，第二版改正）
  if (perYear[0] !== 1500000n) { console.log('FAIL 12 标度自检'); }
  const perDay = perYear.map(x => x / yearDays);                        // 加载期折算，截断一次（BigInt 向零截断）
  const K = BigInt(perYear.length);
  let worst = 0n, worstBound = 1n, ok = true;
  for (const rows of [[0], [0, 1], [0, 1, 2], [1, 2]]) {
    let fx = 50000000n; let num = 50000000n * yearDays; // 参考值以 1/yearDays 个最小单位计，不截断
    for (let n = 1n; n <= 3600n; n++) {
      for (const r of rows) { fx += perDay[r]; num += perYear[r]; }
      const clampedFx = fx < 0n ? 0n : fx > S8 ? S8 : fx; const refNum = num < 0n ? 0n : num > S8 * yearDays ? S8 * yearDays : num;
      if (clampedFx !== fx && refNum !== num) { fx = clampedFx; num = refNum; }
      let diff = clampedFx * yearDays - refNum; if (diff < 0n) diff = -diff;
      const bound = n * K * yearDays;
      if (diff > bound) ok = false;
      if (diff * worstBound > worst * bound) { worst = diff; worstBound = bound; }
    }
  }
  report('12 热忱误差界验算（4 组行、各 3600 日；实际误差不超过 n × K × 10⁻⁸）', ok, `最大“实际/界”= ${(Number(worst) / Number(worstBound)).toFixed(4)}`);
}

// 13 接口与登记落实
const r13 = [];
const s5 = meta.filter(m => /^## §5 /.test(m.h2)).map(m => m.line).join('\n');
for (const v of ['卷二', '卷三乙', '卷六', '卷八', '卷八b', '卷十', '卷十三', '卷十四', '卷十八', '卷十九', '卷二十', '卷二十二', '卷二十四', '卷二十五', '卷二十六']) if (!new RegExp(`^\\| ${v} \\|`, 'm').test(s5)) r13.push('§5.2 缺 ' + v);
const s31 = meta.filter(m => /^### 3\.1 /.test(m.h3)).map(m => m.line).join('\n');
for (const c of ['faithChain', 'faithDistance', 'doctrineOf', 'faithUnlocked', 'faithOf', 'faithCount', 'hostilityOf', 'fervorOf', 'pietyOf', 'worshipTier', 'miracleOptions', 'divinationOptions', 'shrineDemand', 'festivalsAt', 'customFor', 'acceptance', 'cultureHead', 'evaluationOf', 'tabooBreach', 'languageCap', 'interpretedScore', 'nameTable', 'culturePref', 'integrationOf', 'acceptanceOfPerson', 'riteCount', 'respectTier', 'holyWarEligible', 'sphereAffinity', 'reformOptions', 'conversionOdds', 'vowsOf', 'nextFestival', 'pendingCustoms', 'traditionOptions', 'languageKin']) if (!s31.includes('`' + c)) r13.push('§3.1 缺 ' + c);
// 正文各节“统一入口”里提到的入口都在 §3.1
const used = new Set();
meta.filter(m => /统一入口$/.test(m.h4)).forEach(m => { for (const x of m.line.matchAll(/`([a-z][A-Za-z]+)\(/g)) used.add(x[1]); });
for (const u of used) if (!s31.includes('`' + u) && !['sharedLanguage', 'recurrenceNext', 'modified', 'convertWithRem', 'placeView', 'personView'].includes(u)) r13.push('入口未进 §3.1: ' + u);
// 规则表键：§4 用到的 rules.faith.* / rules.culture.* 都在 §2.6
const s26 = meta.filter(m => /^### 2\.6 /.test(m.h3)).map(m => m.line).join('\n');
const usedKeys = new Set((body4.match(/rules\.(?:faith|culture)\.[A-Za-z]+(?:\.[A-Za-z]+)*/g) ?? []));
for (const k of usedKeys) { const short = k.replace(/^rules\./, ''); const head = short.split('.').slice(0, 2).join('.'); if (!s26.includes('`' + short) && !s26.includes('`' + head + '`') && !s26.includes('`' + head + '.')) r13.push('§2.6 缺键 ' + short); }
// 错误码
const s28 = meta.filter(m => /^### 2\.8 /.test(m.h3)).map(m => m.line).join('\n');
const usedErr = new Set(all.match(/E-(?:FAITH|CULT|FEST|LANG|RESPECT)-[A-Z-]+[A-Z]/g) ?? []);
for (const e of usedErr) if (!s28.includes('| ' + e + ' |')) r13.push('§2.8 缺 ' + e);
// 封闭枚举附表
const app = meta.filter(m => /^## 附 术语/.test(m.h2)).map(m => m.line).join('\n');
for (const e of ['tenet_state', 'reform_kind', 'convert_mode', 'fest_kind', 'omen_role', 'custom_by', 'project_kind']) if (!app.includes('| `' + e + '` |')) r13.push('附表缺 ' + e);
// 待补清单条数
const todo = meta.filter(m => /^## 附录 待补清单/.test(m.h2) && /^\| \d+ \|/.test(m.line)).length;
if (todo < 5) r13.push('待补清单过少');
// 迁移清单抽查的 file:line
const s7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
for (const f of ['faith-state.mjs:10', 'norm-stack.mjs:79', 'population.mjs:88', 'remote-generation.mjs:115', 'remote-generation.mjs:109', 'remote-generation.mjs:200', 'remote-generation.mjs:416', 'faith-catalog.mjs:8', 'faith.mjs:81', 'faith.mjs:96', 'festival.mjs:87', 'festival.mjs:232', 'water-cycle.mjs:185']) if (!s7.includes(f)) r13.push('§7 缺 ' + f);
for (const f of ['faith.mjs:73', 'faith.mjs:107', 'faith.mjs:160', 'faith.mjs:220', 'faith.mjs:273', 'faith.mjs:325', 'advance-registry.mjs:469']) if (!s7.includes(f)) r13.push('§7 缺 ' + f);
// 第二版：个体层偏好入口已删；规则层不读事件日志
if (/prefFor/.test(s31) || /prefFor/.test(body4)) r13.push('§3.1/§4 仍有 prefFor');
const ruleLines = meta.filter(m => /规则$/.test(m.h4)).map(m => m.line).join('\n');
if (/比对用日志|事件日志里最近一次|由供奉事件计数/.test(ruleLines + body4)) r13.push('规则层读事件日志');
// 第三版：融入度 kMax、placeClass、修正项生成方式
for (const k of ['culture.integration.kMax', 'culture.integration.placeClass']) if (!s26.includes('`' + k + '`')) r13.push('§2.6 缺 ' + k);
if (!/E-CULT-INTEG-RECORD \|[^\n]*`kMax`/.test(s28)) r13.push('E-CULT-INTEG-RECORD 未核 kMax');
if (!/W-CULT-INTEG-UNCALIBRATED \|[^\n]*kMax/.test(s28)) r13.push('W-CULT-INTEG-UNCALIBRATED 未含 kMax');
const r246 = all.split('\n').filter(l => l.includes('R7-24.6') || /^\s+[①②③④⑤]|^\s+- /.test(l)).join('\n');
if (!all.includes('`k = clamp(kYear × ageTerm + kContact × contactTerm, 0, kMax)`')) r13.push('R7-24.6 k 未钳到 kMax');
if (/clamp\(kYear × ageTerm \+ kContact × contactTerm, 0, 1\)|min\(cap, level/.test(all)) r13.push('R7-24.6 残留旧钳位');
if (/两者都落在上限上时清零|两者都在 `cap` 上时累计误差清零/.test(all)) r13.push('残留“落在上限上清零”');
const r248 = (all.match(/\*\*R7-24\.8[\s\S]*?(?=\n\n)/) ?? [''])[0];
if (!/`scope: self`/.test(r248) || !/每次写记录/.test(r248) || !/不写 `valueRX`/.test(r248)) r13.push('R7-24.8 未写 self 定值修正项');
if (!/`culture\.integration\.placeClass`/.test(r246)) r13.push('R7-24.6 未读 placeClass');
report('13 接口、入口表、规则表键、错误码、枚举附表、迁移清单落实', r13.length === 0, r13.slice(0, 12).join(' | '));

// 14 融入度误差界验算（R7-24.7）：定点（10⁸、向零截断）对精确有理参考值，n 次年度写入后差不超过 4n × 10⁻⁸
{
  const S = 100000000n;
  const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
  const fr = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return { n: n / g, d: d / g }; };
  const add = (a, b) => fr(a.n * b.d + b.n * a.d, a.d * b.d), sub = (a, b) => fr(a.n * b.d - b.n * a.d, a.d * b.d), mul = (a, b) => fr(a.n * b.n, a.d * b.d);
  let ok14 = true, worst = 0, cases = 0;
  // 情形：到达年龄 × 往来比例（r/t）× 上限（10⁸ 标度；1 表示未标定取开端 1）× kYear × kContact × kMax（null = 未标定，取 kYear + kContact）× 年数
  // 第三版：k 钳到 [0, kMax]（kMax < 1）；另加两组速率键取到取值域上端 1 的极端情形，核 level 推进 2000 年仍严格小于 cap
  const dflt = [2380000n, 4320000n, null, 200];            // 0.0238、0.0432 的 10⁸ 标度（登记精度写得尽）
  for (const [age, r, t, cap, kYear, kContact, kMaxIn, years] of [[30, 4n, 8n, S, ...dflt], [6, 3n, 4n, S, ...dflt], [10, 1n, 3n, 80000000n, ...dflt], [0, 7n, 7n, 90000000n, ...dflt], [40, 0n, 0n, S, ...dflt],
    [0, 7n, 7n, S, S, S, 99999900n, 2000], [5, 1n, 2n, 90000000n, S, 0n, 99999999n, 2000]]) {
    cases++;
    const kMax = kMaxIn ?? kYear + kContact;
    if (kMax >= S) { ok14 = false; continue; }                // 加载校验：kMax < 1，否则拒收
    // m = ⌈B(kYear) + B(kContact) × e_c + 3⌉（e_c = 1，剂量曲线为空）；默认数值下即 4
    const mNum = kYear + kContact + 3n * S; const m = Number((mNum + S - 1n) / S);
    // ageCurve [[0,1],[14.5,0]]：精确值 (29 − 2a)/29，钳到 [0,1]；定点为 10⁸ 插值向零截断
    const ageRef = age >= 14.5 ? fr(0n) : fr(BigInt(29 - 2 * age), 29n);
    const ageFx = ageRef.n * S / ageRef.d;
    const csRef = t === 0n ? fr(0n) : fr(r, t);              // 全部条数为 0 时不做除法，取 0
    const csFx = t === 0n ? 0n : r * S / t;
    const kFx0 = kYear * ageFx / S + kContact * csFx / S;     // 两次 fixedMultiply8
    const kFx = kFx0 > kMax ? kMax : kFx0;                    // 钳到 [0, kMax]
    let kRef = add(mul(fr(kYear, S), ageRef), mul(fr(kContact, S), csRef)); if (kRef.n * S > kMax * kRef.d) kRef = fr(kMax, S);
    let lv = 0n, ref = fr(0n);
    for (let n = 1; n <= years; n++) {
      lv = lv + (cap - lv) * kFx / S;                          // 第三版：不再钳到 cap
      ref = add(ref, mul(sub(fr(cap, S), ref), kRef));
      const num = lv * ref.d - ref.n * S;                      // (lv/S − ref) × S × ref.d，即以 10⁻⁸ 为单位的差乘 ref.d
      const diff = Math.abs(Number(num * 1000000n / ref.d)) / 1e6; // 以 10⁻⁸ 为单位
      const bound = m * n;
      if (diff > bound) ok14 = false;
      if (diff / bound > worst) worst = diff / bound;
      if (lv >= cap) ok14 = false;                             // 到不了上限
    }
  }
  // 加载校验反例：kMax 取 1 或速率键之和不小于 1 且 kMax 为空，必须拒收
  for (const [ky, kc, km] of [[S, 0n, S], [S / 2n, S / 2n, null]]) { const kMax = km ?? ky + kc; if (!(kMax >= S)) ok14 = false; }
  report(`14 融入度误差界验算（${cases} 组情形：默认数值 5 组各 200 年、速率取上端 2 组各 2000 年；k 钳到 kMax < 1；实际误差不超过 m·n × 10⁻⁸，且 level 恒小于上限；kMax 不小于 1 的两例被拒）`, ok14, `最大“实际/界”= ${worst.toFixed(4)}`);
}

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleIds.size}；json 块 ${blocks.length}；待补清单 ${todo} 条；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
