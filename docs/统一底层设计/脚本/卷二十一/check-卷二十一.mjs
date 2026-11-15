// 卷二十一 自检脚本（只读成稿，逐项输出 PASS/FAIL）
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷二十一-医疗疾病与身体状态.md';
const lines = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 11;

// 分区：每行标注所在章、小节、是否在代码块内
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
const selfCheckStart = lines.findIndex(l => l.startsWith('## 附录一'));
const body = selfCheckStart < 0 ? meta : meta.slice(0, selfCheckStart);

// 1 章节齐全
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8 与术语表齐全', miss2.length === 0, miss2.join(','));

// 2 十一个子系统各六小节
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const miss4 = [];
for (let n = 1; n <= N; n++) {
  if (!lines.some(l => l.startsWith(`### 4.${n} `))) miss4.push(`4.${n}`);
  six.forEach((t, i) => { if (!lines.includes(`#### 4.${n}.${i + 1} ${t}`)) miss4.push(`4.${n}.${i + 1}`); });
}
report('2 十一个子系统各六小节齐全', miss4.length === 0, miss4.join(','));

// 3 数据实例：每节至少 3 条，含非西陲，含非人类或超自然
const inst = [];
for (let n = 1; n <= N; n++) {
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null && /^- 【/.test(m.line)).map(m => m.line);
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report('3 数据实例数量与两类覆盖', inst.length === 0, inst.join(','));

// 4 验收断言三式
const asr = [];
for (let n = 1; n <= N; n++) {
  const sec = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line).join('\n');
  for (const k of ['扫描式', '不变量式', '扩展性式']) if (!sec.includes(k)) asr.push(`4.${n}:${k}`);
}
report('4 验收断言三式齐全', asr.length === 0, asr.join(','));

// 5 正文无具体 id 字面量（允许区：json 代码块、数据实例小节、附与附录）
const idRe = /\b(?:npc|creature|item|mat|species|flora|body|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|sfam|class|comp|verb|rel|sg|param|req|route|pharm|bneed|proc|sign|nutr|damage|taxon|tissue|bpart|cap|field|service|stage|drive)_[a-z0-9][a-z0-9_]*/g;
// 第五版：卷二第十六版把终止与复生两个协议事件改名为带 verb_ 前缀；本卷只在"不订阅它"的句子里提到这两个名字，按协议名放行
const allowWords = new Set(['status_family', 'status_target', 'status_source', 'body_plan', 'body_part', 'body_need', 'law_code', 'verb_entity_terminated', 'verb_entity_revived']);
const idHits = [];
body.forEach((m, i) => {
  if (m.fence !== null) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^## 附/.test(m.h2)) return;
  for (const hit of m.line.match(idRe) ?? []) if (!allowWords.has(hit)) idHits.push(`L${i + 1}:${hit}`);
});
report('5 规则与正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6 无用于判断的描述性文本：规则、入口、§2、§3、§5 中无文字匹配写法；json 块里中文只在 basis / labels 行；无"代号 == 中文"比较
const textRe = /\.test\(|\.match\(|\.includes\(|startsWith\(|indexOf\(|\/[^\/\s`]*[\u4e00-\u9fff][^\/\s`]*\//;
const textHits = [];
body.forEach((m, i) => {
  const inRule = /(规则|统一入口)$/.test(m.h4) || /^## §[235] /.test(m.h2);
  if (inRule && textRe.test(m.line)) textHits.push(`L${i + 1}`);
  if (m.fence === 'json' && /[\u4e00-\u9fff]/.test(m.line) && !/"basis"|"labels"/.test(m.line)) textHits.push(`L${i + 1}(json)`);
  if (m.fence === null && /`[^`]*[\u4e00-\u9fff][^`]*`\s*(===|==|!==)/.test(m.line)) textHits.push(`L${i + 1}(cmp)`);
  if (m.fence === 'json' && /RX"\s*:\s*"[^"]*[\u4e00-\u9fff]/.test(m.line)) textHits.push(`L${i + 1}(rx)`);
});
report('6 无用于判断的描述性文本', textHits.length === 0, textHits.slice(0, 8).join(' '));

// 7 台账判给本卷的七项概念写全：标题关键词 + 每个子系统有规则编号 + 关键字段出现在 §4
const heads = lines.filter(l => l.startsWith('### 4.')).join('|');
const kw = ['状态实例', '伤口', '出血', '感染', '疾病', '免疫', '传染', '营养', '缺乏症', '过敏', '中毒', '药物', '成瘾', '温度伤害', '诊治', '手术', '照护', '公共卫生', '设施'];
const missKw = kw.filter(k => !heads.includes(k));
const body4 = meta.filter(m => /^## §4 /.test(m.h2)).map(m => m.line).join('\n');
const codes = ['driveRX', 'responds', 'contagion', 'immunity', 'shedCurve', 'woundOf', 'sequela', 'pharm', 'agents', 'sensitivity', 'refDose', 'healMult', 'worsenMult', 'exposureMult', 'immuneGain', 'coldLimitC', 'heatLimitC', 'reserveDaysRX', 'overflowTo', 'materialTerms', 'botchBelow', 'treatQuality', 'careLevel', 'epi.', 'courseSummary', 'treatmentPreview', 'careOptions', 'prevalenceOf'];
const missCode = codes.filter(c => !body4.includes(c));
const ruleIds = new Set(body4.match(/R21-\d+\.\d+/g) ?? []);
const perSub = []; for (let n = 1; n <= N; n++) if (![...ruleIds].some(r => r.startsWith(`R21-${n}.`))) perSub.push(n);
report('7 台账七项概念写全', missKw.length === 0 && missCode.length === 0 && perSub.length === 0, [...missKw, ...missCode, ...perSub.map(n => 'no-rule-4.' + n)].join(','));

// 8 不越界：不定义谓词、不重写容器格式、不存身体值、不改价格
const all = body.filter(m => m.fence === null).map(m => m.line).join('\n');
const predDefs = (all.match(/export function (can|awake|capacity|dead)\b/g) ?? []).length;
const priceTargets = meta.filter(m => m.fence === 'json' && /"target":\s*"[^"]*(price|Price)/.test(m.line)).length;
const hpFields = meta.filter(m => m.fence === 'json' && /"(hp|maxHp)"\s*:/.test(m.line)).length;
const mindRows = meta.filter(m => m.fence === 'json' && /"target":\s*"(mind|org|faith|place)"/.test(m.line)).length;
report('8 不越界（谓词定义、价格目标、生命值字段、非身体类行均为 0）', predDefs + priceTargets + hpFields + mindRows === 0, `pred=${predDefs} price=${priceTargets} hp=${hpFields} nonBody=${mindRows}`);

// 9 跨卷引用一律"卷X §n（标题）"
const refRe = /卷[零一二三四五六七八九十]+b? §[^\s（）、，。；：|]*/g;
const badRef = [];
body.forEach((m, i) => {
  if (m.fence !== null) return;
  let r; refRe.lastIndex = 0;
  while ((r = refRe.exec(m.line)) !== null) { if (m.line[r.index + r[0].length] !== '（') badRef.push(`L${i + 1}:${r[0]}`); }
});
report('9 跨卷引用带标题', badRef.length === 0, badRef.slice(0, 8).join(' '));

// 10 json 代码块可解析
let badJson = 0, nJson = 0; let buf = null;
for (const m of meta) {
  if (/^```json/.test(m.line)) { buf = []; continue; }
  if (buf && /^```/.test(m.line)) { nJson++; try { JSON.parse(buf.join('\n')); } catch (e) { badJson++; console.log('   json error: ' + String(e.message).slice(0, 120)); } buf = null; continue; }
  if (buf) buf.push(m.line);
}
report(`10 json 代码块可解析（${nJson} 块）`, badJson === 0, `bad=${badJson}`);

// 11 状态行实例的形状：身体类、档阈值严格递增、tended ≤ untended、immune 与 immunity 同在、severity 域
const jsonText = []; buf = null;
for (const m of meta) { if (/^```json/.test(m.line)) { buf = []; continue; } if (buf && /^```/.test(m.line)) { jsonText.push(buf.join('\n')); buf = null; continue; } if (buf) buf.push(m.line); }
const rows = {}; for (const t of jsonText) { try { const o = JSON.parse(t); for (const [k, v] of Object.entries(o)) if (/^status_/.test(k) && v && typeof v === 'object' && v.family) rows[k] = v; } catch { /* 已在第 10 项报告 */ } }
const shape = [];
for (const [id, r] of Object.entries(rows)) {
  if (r.target !== 'body') shape.push(`${id}:target`);
  const st = r.stages ?? []; for (let i = 1; i < st.length; i++) if (!(st[i].minSeverity > st[i - 1].minSeverity)) shape.push(`${id}:stage-order`);
  if (st.some(s => s.minSeverity < 0 || s.minSeverity > 1)) shape.push(`${id}:stage-range`);
  const pd = r.severity?.perDay ?? {};
  // 卷二 §1.6 改后（李白 22:32/20:59 通则 2）：tended 显式写 null 即不可照护，不参与大小比较（不把 null 当 0）；可照护行（tendable 为真）的 tended 须是数
  if (typeof pd.tended === 'number' && typeof pd.untended === 'number' && pd.tended > pd.untended) shape.push(`${id}:tended>untended`);
  if ((pd.immune !== undefined) !== (r.immunity !== undefined)) shape.push(`${id}:immune-pair`);
  if (r.tendable && typeof pd.tended !== 'number') shape.push(`${id}:tendable-no-tended`);
  // 第二版：照护行按 tends 字段认（不按族）；照护行须有 duration、不得有 perDay / driveRX / contagion
  if (r.tends && (!r.duration || r.severity?.perDay || r.driveRX || r.contagion)) shape.push(`${id}:care-shape`);
  if (r.driveOnset !== undefined && !r.driveRX) shape.push(`${id}:onset-without-drive`);
  // 二审 N4：起点可为 0 的只有带驱动的行
  if (!(r.severity?.initial > 0) && !(r.severity?.initial === 0 && r.driveRX)) shape.push(`${id}:initial`);
}
report(`11 状态行实例形状合规（${Object.keys(rows).length} 行）`, Object.keys(rows).length >= 10 && shape.length === 0, shape.join(','));

// 12 实例中引用的族都在卷末代号表登记
const tail = jsonText.find(t => t.includes('"status_family_new"'));
let famOk = false, famMiss = [];
if (tail) { const o = JSON.parse(tail); const known = new Set([...o.status_family_new, ...o.status_family_kept, ...Object.keys(o.status_family_elsewhere)]); famMiss = [...new Set(Object.values(rows).map(r => r.family))].filter(x => !known.has(x)); famOk = famMiss.length === 0; }
report('12 实例所用状态族均已登记', famOk, famMiss.join(','));

// 13 开放问题与回填请求存在；统计开放问题数
const qCount = meta.filter(m => /^## §8 /.test(m.h2) && /^\| Q-\d+ \|/.test(m.line)).length;
report(`13 开放问题成表（${qCount} 条）`, qCount > 0);

// —— 第二版新增（一审修改的六条裁定与两份审查意见）——
const bodyText = body.map(m => m.line).join('\n');
const allObjs = []; for (const t of jsonText) { try { allObjs.push(JSON.parse(t)); } catch { /* 第 10 项已报 */ } }

// 14 裁定 4：写状态实例的效果族调用必须带目标行参数；不得残留按具体状态命名的效果族
const needTarget = new Set(['eff_status_add', 'eff_care', 'eff_expose']);
const retiredEff = /"eff_(bleed|bloodloss|pain|knockout|frostbite|tend|remove_part|expose_wound|surgical_wound)"/;
const effBad = []; let effCalls = 0;
const walk = (o, at) => { if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${at}[${i}]`)); else if (o && typeof o === 'object') { if (typeof o.family === 'string' && o.params && typeof o.params === 'object') { effCalls++; if (needTarget.has(o.family) && typeof o.params.param_status !== 'string') effBad.push(`${at}:${o.family}`); } for (const [k, v] of Object.entries(o)) walk(v, `${at}.${k}`); } };
allObjs.forEach(o => walk(o, ''));
const retiredHit = lines.some((l, i) => (selfCheckStart < 0 || i < selfCheckStart) && retiredEff.test(l));
report(`14 效果族调用带目标行参数（${effCalls} 处调用），无按状态命名的效果族`, effBad.length === 0 && !retiredHit && effCalls > 0, effBad.join(',') + (retiredHit ? ' retired-family' : ''));

// 15 裁定 3：严重度与浓度分开；过量阈值只在药性轴条目一处
const pharmRows = {}; for (const o of allObjs) for (const [k, v] of Object.entries(o)) if (/^pharm_/.test(k) && v && typeof v === 'object' && 'refDose' in v) pharmRows[k] = v;
const pharmBad = Object.entries(pharmRows).filter(([, v]) => !(v.overdoseAt > 1) || !(v.clearPerDay > 0) || !['higher', 'lower'].includes(v.better) || 'status' in v || 'range' in v || 'qualitySign' in v).map(([k]) => k);
// 二审 N2：按 R21-6.6 的写法规定在语法树上判——含 conc() 的子式进加减、min、max、比较时，对侧不得是纯数值常数
// 终核 F1（第四版）：R21-6.6 第 ② 至 ④ 款——conc()、over()、under() 三种读法同判。
// 式子展开成各项之和，每项记 {k 数值系数, c 含浓度读法, s 含 self.severity}；读浓度的式子里：
// 每个非零项须含 c 或 s；除数须是数值常数；min、max、比较的每个实参同判（值为 0 的常数实参除外）；driveOnset 须为 0。
const rxReadsConc = src => /\b(conc|over|under)\(/.test(src);
const rxViolates = (src, onset = 0) => {
  const tk = src.match(/\d+(?:\.\d+)?|[A-Za-z_][\w.]*|[-+*/(),<>]/g) ?? []; let p = 0, sawConc = false, badDiv = false; const joined = [];
  const K = k => [{ k, c: false, s: false, n: true }];
  const mul = (a, b) => a.flatMap(x => b.map(y => ({ k: x.k * y.k, c: x.c || y.c, s: x.s || y.s, n: !!(x.n && y.n) })));
  const okTerms = a => a.every(t => t.k === 0 || t.c || t.s);
  const join = args => { joined.push(...args); return [{ k: 1, c: args.some(a => a.some(t => t.c)), s: args.some(a => a.some(t => t.s)) }]; };
  const primary = () => {
    const t = tk[p++];
    if (t === '(') { const e = expr(); p++; return e; }
    if (t === '-') return mul(K(-1), primary());
    if (/^\d/.test(t)) return K(Number(t));
    if (tk[p] === '(') {
      p++; const args = []; if (tk[p] !== ')') { args.push(expr()); while (tk[p] === ',') { p++; args.push(expr()); } } p++;
      if (t === 'conc' || t === 'over' || t === 'under') { sawConc = true; return [{ k: 1, c: true, s: false }]; }
      if (t === 'min' || t === 'max') return join(args);
      return [{ k: 1, c: false, s: false }];
    }
    return [{ k: 1, c: false, s: t === 'self.severity' }];
  };
  const term = () => { let a = primary(); while (tk[p] === '*' || tk[p] === '/') { const op = tk[p++]; const b = primary(); if (op === '*') a = mul(a, b); else { const pure = b.length === 1 && b[0].n === true && b[0].k !== 0; if (!pure) badDiv = true; a = mul(a, pure ? K(1 / b[0].k) : b); } } return a; };
  const sum = () => { let a = term(); while (tk[p] === '+' || tk[p] === '-') { const op = tk[p++]; const b = term(); a = a.concat(op === '-' ? mul(K(-1), b) : b); } return a; };
  const expr = () => { let a = sum(); while (tk[p] === '<' || tk[p] === '>') { p++; a = join([a, sum()]); } return a; };
  const top = expr();
  if (p < tk.length) return true;
  if (!sawConc) return false;
  return badDiv || onset !== 0 || !okTerms(top) || joined.some(a => !okTerms(a));
};
const rxSelfTest = ['2 * (min(1, conc(a) / 3) - self.severity)', '2 * sev(b) * max(0, 1 - conc(a)) - 0.3', '0.04 * conc(a) - 0.5', '2 * sev(b) * under(a) - 0.3', 'over(a) - 0.5', '3 * over(a) - 0 * self.severity - 0.5', 'over(a) - (0.5 + 0 * self.severity)', 'conc(a) - max(0, self.severity - 0.5)', 'conc(a) / self.severity', 'conc(a) - sev(b)', 'under(a) - rules.health.concFloor', 'max(0.2, over(a))'].every(s => rxViolates(s))
  && rxViolates('3 * over(a)', 0.5)
  && ['2 * (conc(a) / 3 - self.severity)', '2 * sev(b) * under(a)', '3 * over(a)', '0.05 * conc(a)', 'max(0, conc(a) - self.severity)', '0.04 * max(0, subject.coldLimitC - felt) - 0.5', '2 * (0.9 * max(0, woundHere - 0.05) - self.severity)', '0.2 * place.env.precipMm * place.skyExposure - 2'].every(s => !rxViolates(s));
const rxBad = Object.entries(rows).filter(([, r]) => typeof r.driveRX === 'string' && rxViolates(r.driveRX, r.driveOnset ?? 0)).map(([k]) => k + ':second-threshold');
if (!rxSelfTest) rxBad.push('rx-parser-selftest');
// R21-6.6 第 ① 款：浓度读法只许出现在 driveRX
for (const o of allObjs) for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object') for (const f of ['reserveDaysRX', 'mixRX']) if (typeof v[f] === 'string' && rxReadsConc(v[f])) rxBad.push(`${k}:${f}-reads-conc`);
const stale3 = ['range.max', 'range.min', 'qualitySign', '浓度容器'].filter(s => bodyText.includes(s));
report(`15 浓度与严重度分开、过量阈值单点（${Object.keys(pharmRows).length} 条药性轴）`, Object.keys(pharmRows).length >= 3 && pharmBad.length + rxBad.length + stale3.length === 0, [...pharmBad, ...rxBad, ...stale3].join(','));

// 16 裁定 1、2、5 的单点定义存在且旧写法已清
const must = ['R21-1.5 结案（单点定义）', 'R21-1.10 驱动行怎样建实例（单点定义）', 'R21-3.3 免疫记录（单点定义）', 'R21-6.2 药性浓度（单点定义）', 'R21-9.1 照护水平（单点定义）', 'R21-4.2 消耗：增长率与日需量成正比（单点定义）', 'R21-6.6 过量（阈值的唯一定义处）', 'immune.<主体>.<状态行>', 'conc.<主体>.<药性轴>', 'driveOnset', 'needRecover', 'needRatio'];
const missMust = must.filter(s => !bodyText.includes(s));
const stale = ['gainQuantiles', '照护族', 'need_supply', '留作免疫记录', 'immunity\' =', 'precipExposure', 'exposureMult[route_wound]'].filter(s => bodyText.includes(s));
const needBad = []; for (const o of allObjs) for (const [k, v] of Object.entries(o)) if (/^bneed_/.test(k) && v && typeof v === 'object') { if ('supply' in v) needBad.push(k + ':supply'); if (!(v.needRatio > 0)) needBad.push(k + ':needRatio'); if (/subject\.daily\w+Need/.test(v.reserveDaysRX ?? '')) needBad.push(k + ':reserve-uses-modified-need'); if (rows[v.status]?.driveRX) needBad.push(k + ':deficit-row-has-driveRX'); }
report('16 六条裁定的单点定义齐全、旧写法已清', missMust.length + stale.length + needBad.length === 0, [...missMust, ...stale, ...needBad].join(' | '));

// 17 迁移补全（裁定 6）与卷末两栏
const sec7 = meta.filter(m => /^## §7 /.test(m.h2)).map(m => m.line).join('\n');
const mig = ['npc-life.mjs:463–525', 'npcLife.health', 'magic-care.mjs:17–23', 'magic-ritual.mjs', 'medicine.mjs:137', 'medicine.mjs:99', ':152', 'takeHome', 'items.mjs:237', 'household-subsistence.mjs:301', 'body-needs.mjs:51', 'famineAt', 'water-cycle.mjs:12'];
const missMig = mig.filter(s => !sec7.includes(s));
const tailOk = ['## 附录三 一审小项记账栏', '## 附录四 第二版影响面表'].filter(s => !lines.some(l => l.startsWith(s)));
report('17 迁移清单补全、记账栏与影响面表在卷末', missMig.length + tailOk.length === 0, [...missMig, ...tailOk].join(' | '));

// 18 二审余项 N1–N6：六处定义在位、被改掉的旧写法不再出现、影响面表有二审一行
const must2 = ['① 任一来路新建 r 的实例的当刻', '`under(<药性轴>)`', '可机判的写法规定（唯一定义处）', '亏空行严重度的写入口（单点口径）', 'R21-4.4 溢出与转存（下级条目的唯一写入口）', '起点口径（单点定义）', '向上取到整拍', 'days = tImm + sImm ÷ |dn|', '终止与复生时本卷三个主体键的去留（单点定义）', 'entity_terminated', '| Q-18 |'];
const missMust2 = must2.filter(s => !bodyText.includes(s));
const stale2 = ['暴露判定命中、新建实例的当刻', 'max(0, 1 - conc(', 'min(1, conc(', '没有第三个入口', 'days = tImm + peak ÷ |dn|', '（lethal − peak）÷ dn', '被某个身体需要条目指为亏空行的行。'].filter(s => bodyText.includes(s));
const lower = new Set(); for (const o of allObjs) for (const [k, v] of Object.entries(o)) if (/^bneed_/.test(k) && v?.overflowTo) lower.add(v.overflowTo);
const tailObj = tail ? JSON.parse(tail) : {};
const nutrBad = Object.entries(tailObj.nutrient_to_need ?? {}).filter(([, n]) => lower.has(n)).map(([k]) => k + ':nutrient-to-lower-need');
const row2 = lines.some(l => l.startsWith('| 二审余项 N1 至 N6'));
report('18 二审余项六条的定义在位、旧写法已清、影响面表有二审一行', missMust2.length + stale2.length + nutrBad.length === 0 && lower.size > 0 && row2, [...missMust2.map(s => '缺:' + s), ...stale2.map(s => '残:' + s), ...nutrBad, row2 ? '' : 'no-row'].filter(Boolean).join(' | '));

// 19 终核 F1、F2 与全书同类清单的本卷条目（第四版）：定义在位、旧写法已清、数据不走被封的入口、影响面表有一行
const must4 = ['| `overflow` | 上级亏空溢出到尚无实例的下级亏空行 | R21-4.4 |', '| `materialize` |', '| `sequela` |', '**新建只有一个写入通道**', '`spawn_cause`（exposure drive write overflow materialize sequela', '| E-MED-SPAWN-CAUSE |', '写入只有四个时机', '  ④ 单元由粗变细', '① **入口只有一处。**', '② **数值只许当系数。**', '③ **除数与取大取小。**', '④ **新建阈值不当浓度阈值用。**', '| P21-10 |', '**别的写法一概不是入口**', '**心理量容器的归属（只在这里写一次，按固定代号认）**', '按输出判，不按挂载点列举', '本卷不订阅 `verb_entity_terminated` 做清理', '去留表里该记录类的 `atRevive`', '窗口期满', '都算 | 0 |'];
const missMust4 = must4.filter(s => !bodyText.includes(s));
const stale4 = ['只有三条来路', '实例只有三种来路', '写入只有三个时机', '三者之一', 'R21-1.5 的三条来路', '再得一次只能经一次新的暴露', '暴露判定命中数与写入事件数之和', '本卷订阅卷二终止原语', '按类登记的复生清理清单', 'revive.clearFamilies', '三个别卷的挂载点', '别卷三个挂载点', '只许给 `conc()` 当乘除系数'].filter(s => bodyText.includes(s));
const deficitRows = new Set(); for (const o of allObjs) for (const [k, v] of Object.entries(o)) if (/^bneed_/.test(k) && v && typeof v === 'object' && typeof v.status === 'string') deficitRows.add(v.status);
const chanBad = [];
const walk4 = (o, at) => { if (Array.isArray(o)) o.forEach((x, i) => walk4(x, `${at}[${i}]`)); else if (o && typeof o === 'object') { if (typeof o.family === 'string' && o.params && typeof o.params === 'object') { const t = o.params.param_status; if (typeof t === 'string' && deficitRows.has(t)) chanBad.push(`${at}:effect-targets-deficit-row:${t}`); if (o.family === 'eff_status_add' && typeof t === 'string' && rows[t]?.contagion) chanBad.push(`${at}:status-add-on-contagion-row:${t}`); } for (const [k, v] of Object.entries(o)) walk4(v, `${at}.${k}`); } };
allObjs.forEach(o => walk4(o, ''));
for (const id of deficitRows) { const r = rows[id]; if (r && (r.contagion || r.woundOf)) chanBad.push(`${id}:deficit-row-has-other-entry`); }
for (const [id, r] of Object.entries(rows)) if (r.sequela && deficitRows.has(r.sequela.status)) chanBad.push(`${id}:sequela-to-deficit-row`);
const row4 = lines.some(l => l.startsWith('| 终核 F1、F2 与全书同类清单的本卷条目'));
report(`19 终核两条与同类清单本卷条目：定义在位、旧写法已清、数据不走被封的入口（亏空行 ${deficitRows.size} 条）、影响面表有终核一行`, missMust4.length + stale4.length + chanBad.length === 0 && deficitRows.size > 0 && row4, [...missMust4.map(s => '缺:' + s), ...stale4.map(s => '残:' + s), ...chanBad, row4 ? '' : 'no-row'].filter(Boolean).join(' | '));

// 20 第五版：李白对第四版的三项裁定与卷二第十六版 §2.6 的对齐——定义在位、旧写法已清、卷末有来路核对输出与影响面一行
// （第 19 项的三条锚点随本版改写而更新：心理量容器归属的标题、事件名加 verb_ 前缀、去留表的说法）
const must5 = ['改摄入量（经摄入效果族给营养量，R21-4.3）、改恢复速率（给 `needRecover` 挂修正）、改每日需要量（给日需量维度挂修正）', 'R21-1.6 后遗（来路 `sequela` 的唯一产生处）', '只由 R21-1.6 这一条现成规则产生', '卷四 `die` 写入终止类实例', '`gauge` 族条目', 'R26-3.2', '终止协议的第 1 步（定后继与领域清理）', '自第 2 步（标记）起', '`subjectRecords`', '`rules.terminate.records`', '`atTerminate: hold`，`atRevive: keep`', '`verb_entity_revived`'];
const missMust5 = must5.filter(s => !bodyText.includes(s));
const stale5 = ['唯一的例外', '心理量容器除外', 'R21-1.1 的例外', '心情除外', '终止原语第 5 步只清', '登记 health-store.mjs 的清理函数', '只登记清理函数与取值', '按族的去留登记', '`entity_terminated`', '`entity_revived`', '的常驻容器规定'].filter(s => bodyText.includes(s));
const gaugeOnce = body.filter(m => m.line.includes('`gauge` 族')).length;
const row5 = lines.some(l => l.startsWith('| 第五版：李白对第四版的三项裁定与卷二第十六版 §2.6 的对齐'));
const app5 = lines.findIndex(l => l.startsWith('## 附录五 来路核对脚本输出'));
const app5ok = app5 > 0 && lines.slice(app5).some(l => /^扫描 \d+ 卷；来路 6 条；第七条来路 未发现；失败项 0$/.test(l));
report('20 第五版三项裁定与卷二 §2.6 对齐：定义在位、旧写法已清、心理量归属只写一处、卷末有来路核对输出与影响面一行', missMust5.length + stale5.length === 0 && gaugeOnce === 1 && row5 && app5ok, [...missMust5.map(s => '缺:' + s), ...stale5.map(s => '残:' + s), gaugeOnce === 1 ? '' : `gauge族×${gaugeOnce}`, row5 ? '' : 'no-row', app5ok ? '' : 'no-appendix5'].filter(Boolean).join(' | '));

// 21 第六版：终核2 第一节第 1 项（李白裁定四条）——亏空行禁填各栏、倍率不作用、"饱足"不走倍率、三条路可机判
const must6 = ['**亏空行代入病程律的口径（单点定义；R21-1.2 只引用本段）。**', '`base`、`imm`、`rsp` 恒为 0；`worsenMult`、`healMult` 对它取 1', '于是 `rate = drv`', '**亏空行字段白名单（唯一定义处，共 8 项）**', '行上非白名单字段非空即加载失败（E-MED-NEED-CYCLE）', '今后新加的字段默认锁住', '亏空行填了 R21-4.2 白名单之外字段的行数为 0', '亏空行怎样代入本式只在 R21-4.2 定义，本条不另写。', '**三条路可机判。**', '| 每日需要量与储备由身体决定 |', '体型影响耐受天数归第三条路，不另开路', '吃饱喝足不在此列，不设倍率通道', '法术不得直接写亏空行的严重度，也没有第四种写法。', '逐值不变（R21-4.2 机判 ③）'];
const missMust6 = must6.filter(s => !bodyText.includes(s));
// 第七版（v6 单核 N1）：禁填清单的旧写法须清掉
const stale6 = ['保暖、饱足通过', '设施类型行的服务效果、亏空行的档）', '亏空行不得填 `severity.perDay`', '亏空行填 `severity.perDay`、`responds`、`tendable`、`immunity` 的行数为 0', '或亏空行自己填了 `driveRX`'].filter(s => bodyText.includes(s));
// 单点：代入口径的定义句只许出现一次；R21-1.2 那一条里不得重写"恒为 0 / 取 1"
const defOnce = body.filter(m => m.line.includes('恒为 0；`worsenMult`、`healMult` 对它取 1')).length;
const r12 = body.findIndex(m => m.line.startsWith('- **R21-1.2 ')), r13 = body.findIndex(m => m.line.startsWith('- **R21-1.3 '));
const r12Redef = r12 < 0 || r13 < 0 || body.slice(r12, r13).some(m => /取 1|恒为 0/.test(m.line));
// "饱足"不走倍率：正文无一行同时出现"饱足"与两个倍率之一；R21-9.3 一条指向三条路
const satietyMult = body.map((m, i) => (m.fence === null && m.line.includes('饱足') && /healMult|worsenMult|好转倍率|恶化倍率/.test(m.line)) ? `L${i + 1}` : '').filter(Boolean);
const r93 = body.find(m => m.line.startsWith('- **R21-9.3 '))?.line ?? '';
const r93ok = r93.includes('R21-4.2 的三条路') && r93.includes('摄入量') && r93.includes('恢复速率') && !r93.includes('饱足');
// 第七版（v6 单核 N1，李白裁定）：禁填清单改白名单。校验码一行按白名单判、指回 R21-4.2，自己不再列字段；白名单只在 R21-4.2 出现一次
const needCycle = lines.find(l => l.startsWith('| E-MED-NEED-CYCLE |')) ?? '';
const cycMiss = ['`sequela.status`', '按白名单判，不按禁填清单判', '白名单只在 R21-4.2 的代入口径一段列出', '非空即报错', '今后新加的字段不进白名单就同样被拦', '`reserveDaysRX` 读了'].filter(s => !needCycle.includes(s));
// 白名单从正文定义句读出（单点：脚本不另存一份），定义句须恰出现一次、恰 8 项
const wlMark = '**亏空行字段白名单（唯一定义处，共 8 项）**：';
const wlLines = body.filter(m => m.line.includes(wlMark));
const wlText = wlLines.length === 1 ? wlLines[0].line.slice(wlLines[0].line.indexOf(wlMark) + wlMark.length).split('。')[0] : '';
const whitelist = new Set([...wlText.matchAll(/`([^`]+)`/g)].map(m => m[1]));
// 行上出现的字段（severity 展开到子键；basis 是出处注记，不是规则字段）；不在白名单内而非空的即违规——今后新加的字段不进白名单就被拦
const fieldsOf = r => Object.entries(r).flatMap(([k, val]) => k === 'basis' || val === undefined || val === null ? [] : k === 'severity' && val && typeof val === 'object' ? Object.entries(val).filter(([, x]) => x !== undefined && x !== null).map(([sk]) => `severity.${sk}`) : [k]);
const deficitShape = r => fieldsOf(r).filter(f => !whitelist.has(f));
const reserveBad = src => (String(src).match(/[A-Za-z_][\w.]*\(?/g) ?? []).filter(t => !(/^subject\.[A-Za-z_]\w*$/.test(t) || t === 'need0' || /^rules\.health\.[A-Za-z_]\w*$/.test(t)));
// 覆盖面不小于原禁填断言：原断言拦的七栏（perDay、responds、tendable、immunity、driveRX、contagion、woundOf）逐个仍被拦，
// 单核 N1 点名的三栏（persistent、duration、tends）与一个不存在的新字段也被拦；只填白名单字段的行放行；白名单与这十栏不相交
const bannedBefore = ['severity.perDay', 'responds', 'tendable', 'immunity', 'driveRX', 'contagion', 'woundOf'], bannedN1 = ['persistent', 'duration', 'tends'];
const one = f => f === 'severity.perDay' ? { severity: { initial: 0, perDay: { untended: 0.1 } } } : { [f]: f === 'tendable' || f === 'persistent' ? false : {} };
const selfTest6 = whitelist.size === 8 && [...bannedBefore, ...bannedN1, 'driveOnset', 'bodyPart', 'hosts', 'emits', 'sequela', 'shedCurve', 'zzFutureField'].every(f => deficitShape(one(f)).join() === f && !whitelist.has(f))
  && deficitShape({ family: 'x', target: 'body', severity: { initial: 0, lethal: 1 }, stages: [], sources: [], signs: [], obscurity: 0, basis: 'x' }).length === 0
  && ['sev(status_x) * 2', 'place.env.tempC', 'felt', 'clock.day', 'subject.fatKg * conc(pharm_x)', 'woundHere'].every(s => reserveBad(s).length > 0) && ['1', 'subject.fatKg * rules.health.fatSatietyPerKg / need0', '29'].every(s => reserveBad(s).length === 0);
const data6 = [];
for (const id of deficitRows) if (rows[id]) for (const f of deficitShape(rows[id])) data6.push(`${id}:${f}`);
for (const o of allObjs) for (const [k, v] of Object.entries(o)) if (/^bneed_/.test(k) && v && typeof v === 'object') for (const t of reserveBad(v.reserveDaysRX ?? '')) data6.push(`${k}:reserve-reads:${t}`);
const row6 = lines.some(l => l.startsWith('| 第六版：终核2 第一节第 1 项（李白裁定四条）与全书卷十九同类定稿清单 21-1、21-2'));
const title6 = lines[0].includes('（第九版）');
report('21 第六版裁定四条（第七版起禁填清单改白名单）：亏空行代入口径单点、白名单外字段一律锁死、倍率不作用、"饱足"不走倍率、三条路可机判、储备式只读身体', missMust6.length + stale6.length + satietyMult.length + cycMiss.length + data6.length === 0 && defOnce === 1 && wlLines.length === 1 && !r12Redef && r93ok && selfTest6 && row6 && title6, [wlLines.length === 1 ? '' : `白名单定义句×${wlLines.length}`, whitelist.size === 8 ? '' : `白名单项数=${whitelist.size}`,...missMust6.map(s => '缺:' + s), ...stale6.map(s => '残:' + s), ...satietyMult.map(s => '饱足倍率:' + s), ...cycMiss.map(s => '校验码缺:' + s), ...data6, defOnce === 1 ? '' : `定义句×${defOnce}`, r12Redef ? 'R21-1.2重写口径' : '', r93ok ? '' : 'R21-9.3', selfTest6 ? '' : 'selftest', row6 ? '' : 'no-row', title6 ? '' : 'title'].filter(Boolean).join(' | '));

// 22 第六版：卷十九同类定稿清单 21-1（严重度用扩展标度并写误差界）、21-2（免疫与浓度改存量锚点，重设值 10⁸ 标度）
const must7 = ['**存法（只引卷二 §3.3（求值管线）"存量与余数结转"第 6 条，本卷不另立口径）。**', '按 `stockMode: extScale`、`precision: 8` 登记', '**一拍的误差量 m 是确定式**', '普通行：m = ', '亏空行：m = ', '误差界：n 拍之后存储值与参考值之差 ≤ E_n × 10⁻⁸', '存法与误差界按 R21-1.2 的存法一段', '**扩展标度的误差界**', '免疫记录的存储类型为 `struct:stockAnchor`、表头 `stockMode: anchor`', '浓度记录的存储类型为 `struct:stockAnchor`、表头 `stockMode: anchor`', '≤（n ×（1 + ⌈g × δ⌉）+ j）× 10⁻⁸', '≤ n × m × 10⁻⁸', 'value := immuneLevel(此刻)，at := 此刻', 'at := 此刻', '写 `stockMode: extScale`、`precision: 8`（R21-1.2 存法一段'];
const missMust7 = must7.filter(s => !bodyText.includes(s));
const stale7 = ['asOf', '{level', 'level :=', '`struct:immuneRecord =', '`struct:concRecord ='].filter(s => bodyText.includes(s));
const keyRows = ['| `immune.<主体>.<状态行>` |', '| `conc.<主体>.<药性轴>` |'].map(p => lines.find(l => l.startsWith(p)) ?? '');
const keyBad = keyRows.filter(l => !(l.includes('`struct:stockAnchor`') && l.includes('`stockMode: anchor`'))).length;
const anchor8 = body.filter(m => m.line.includes('在 10⁸ 标度写入')).length;
report('22 第六版同类清单 21-1、21-2：严重度扩展标度与误差界在位；免疫、浓度为存量锚点，重设值 10⁸ 标度，旧字段名已清', missMust7.length + stale7.length + keyBad === 0 && anchor8 >= 2, [...missMust7.map(s => '缺:' + s), ...stale7.map(s => '残:' + s), keyBad ? `状态键表×${keyBad}` : '', anchor8 >= 2 ? '' : `10⁸写入×${anchor8}`].filter(Boolean).join(' | '));

// 23 第七版：v6 单核 N2（误差界计全部写入）、N3（体重的幂引卷二的对数与指数，p 为确定式，数据 0.75）
// 第八版（v7 单核 N4）：N2 的"全部写入、分项写出"照查，锚点随口径由"截断次数"改为"误差量"；N3 的 p 并入 e_P、e_D、e_Δ 三式；免疫（2n + j）成为 g ≤ 1 时的上界。项数不减。
const must8 = ['m 是本拍对该实例存储值的全部写入的误差量之和', '普通行：m = 推进 + Σ 按日加量 + Σ 一次性 + 转入', '亏空行：m = 推进 + 摄入 + 溢出 + 转存', '  摄入(n)   = ', '  溢出(n→m) = ', '  转存(n→m) = ', '误差量为 0 的一次性写入', '一切经效果族的写入同计', '全部写入的误差量之和（推进、按日加量与一次性效果写入、摄入补给、溢出、转存', 'massPow_x,a = fixedExp(fixedMultiply8(massExp_a, fixedLn(massKg_x)))', 'fixedExp(fixedMultiply8(massExp_a*, fixedLn(M̂)))', '卷二 §3.3（求值管线）"定点指数与整数次幂"一段的"非整数次幂（唯一写法）"', 'e_Δ  =（e_N + Δconc_a × e_D）÷（D − e_D × 10⁻⁸）+ 1', '`massExp: number`（[0, 2]，每个轴条目必写）', '`massExp` 行上必写（不设常量缺省', '没有另行标定的轴写 0.75：清除与代谢随体重按四分之三次幂增长（异速生长）', '或 `massExp` 越出 [0, 2]', '不超过（2n + j）× 10⁻⁸', 'e读(a) = 该轴没有记录时 0；有记录时 E浓度(a) + V_a ×（6 × y⁺ + 4）+ 1'];
const missMust8 = must8.filter(s => !bodyText.includes(s));
const stale8 = ['massKg_x ^ massExp_a', 'M̂ ^ massExp', '按卷二所给函数实际的截断次数计', '`conc()`、`under()` 各计 3', '+ 4 × responds 的键数', '18.75 克', '938 克'].filter(s => bodyText.includes(s));
const stale8tail = ['本卷按其实际截断次数记 p'].filter(s => lines.join('\n').includes(s));
const caret = body.map((m, i) => (/\^\s*massExp/.test(m.line) ? `L${i + 1}` : '')).filter(Boolean);
const expBad = Object.entries(pharmRows).filter(([, v]) => !('massExp' in v) || v.massExp !== 0.75 || !(v.massExp >= 0 && v.massExp <= 2)).map(([k]) => `${k}:massExp`);
const row7 = lines.some(l => l.startsWith('| 第七版：第六版单核 N1、N2、N3 的李白裁定'));
report('23 第七版：误差界计全部写入并分项写出；体重的幂引卷二的对数与指数、其误差为确定式；药性轴体重指数为 0.75；影响面表有第七版一行', missMust8.length + stale8.length + stale8tail.length + caret.length + expBad.length === 0 && row7, [...missMust8.map(s => '缺:' + s), ...stale8.map(s => '残:' + s), ...stale8tail.map(s => '残:' + s), ...caret.map(s => '幂号:' + s), ...expBad, row7 ? '' : 'no-row'].filter(Boolean).join(' | '));

// 24 第八版：v7 单核 N4（李白裁定）——误差界由截断次数改为误差量（每处截断的误差乘以其后各步的放大系数），全部为确定式；旧口径的写法须清掉
const must9 = ['口径只引卷二同条的"m 的口径（唯一定义）"', 'm 不是截断次数，是以 10⁻⁸ 计的误差量', '行内式的误差 eRX(式)：按语法树自下而上', 'e_rate = e_raw × |倍率| + 1', '推进   = ⌈e_rate × Δ + |rate| × δ + 1⌉', 'e_R(n)    = D0 × eRX(reserveDaysRX_n) + 1', 'R_n⁻ 须为正', '÷ R_n⁻ + 1）× Δ + |drv| × δ + 1⌉', '（E_n × R_n⁺ + e × e_R(n) + 1 +（e × R_n ÷ R_m）× e_R(m)）÷ R_m⁻ + 1⌉', '× storeEfficiency + 1 +（q\' ÷ R_m）× e_R(m)）÷ R_m⁻ + 1⌉', '累计：E_n = G × E_{n−1} + 本拍 m', 'E 清零重计', 'e_P  =（2 × massExp_a + 7）× massPow_x,a + 4', 'e_D  = refDose_a × e_P + 1', 'e_N  = bio_a[p] × sensitivity_x[a] + sensitivity_x[a] + 1', 'm    = ⌈e_读 + e_Δ⌉', '写入 ② 每拍为 1 + ⌈g × δ⌉', '离散判定取与定点实现相同的分支', '| Q-19 |'];
const missMust9 = must9.filter(s => !bodyText.includes(s));
const stale9 = ['截断次数 m 由行数据', '各计 11', '`over()` 计 12', 'r(n)      = 2 + k(', 'k(driveRX)', 'k(reserveDaysRX', '双精度参考值', '每次加量计两次截断', 'p = ⌈Δconc_a', '+ 12 × responds 的键数', '写入 ② 每拍为 2（', '截断次数之和'].filter(s => bodyText.includes(s));
const app6 = lines.findIndex(l => l.startsWith('## 附录六 误差界验算脚本输出'));
const app6ok = app6 > 0 && lines.slice(app6).some(l => /^合计：失败项 0；/.test(l)) && !lines.slice(app6).some(l => l.startsWith('FAIL '));
const row8 = lines.some(l => l.startsWith('| 第八版：第七版单核 N4 的李白裁定'));
report('24 第八版：误差界改为误差量的确定式（浓度、严重度各类写入、免疫）、只引卷二的口径、旧的截断次数写法已清、附录六验算无失败项、影响面表有第八版一行', missMust9.length + stale9.length === 0 && app6ok && row8, [...missMust9.map(s => '缺:' + s), ...stale9.map(s => '残:' + s), app6ok ? '' : 'no-appendix6', row8 ? '' : 'no-row'].filter(Boolean).join(' | '));

console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleIds.size}；json 块 ${nJson}；状态行实例 ${Object.keys(rows).length}；开放问题 ${qCount}；失败项 ${fails}`);
process.exit(fails ? 1 : 0);
