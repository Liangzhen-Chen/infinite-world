// 卷二十二 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷二十二/check-卷二十二.mjs [成稿路径]
import { readFileSync, readdirSync } from 'node:fs';
const DIR = 'F:/dnd/docs/统一底层设计/';
const path = process.argv[2] ?? DIR + '卷二十二-知识信息与传播.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + String(detail).slice(0, 900) : '')); };
const N = 12;
const V = '22';

const meta = []; let h2 = '', h3 = '', h4 = '';
for (const line of lines) {
  if (/^## /.test(line)) { h2 = line; h3 = ''; h4 = ''; }
  else if (/^### /.test(line)) { h3 = line; h4 = ''; }
  else if (/^#### /.test(line)) { h4 = line; }
  meta.push({ line, h2, h3, h4 });
}
const all = lines.join('\n');
const sub = re => meta.filter(m => re.test(m.h3)).map(m => m.line);
const cells = l => l.split('|').slice(1, -1).map(c => c.trim());
const ticks = s => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);
const cjk = /[\u3400-\u9fff]/;

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表', '## 附录 待补清单'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8、术语表、待补清单齐全', miss2.length === 0, miss2.join(','));
report('1b 卷首模型行', lines.slice(0, 5).includes('起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档'));
const need0 =['### 0.1 范围', '### 0.2 依赖卷', '### 0.3 覆盖的卷零行', '### 0.4 参照的五款游戏行', '### 0.5 读法'];
report('1c §0 五小节齐全', need0.every(p => lines.includes(p)), need0.filter(p => !lines.includes(p)).join(','));
report('1d 状态行为成稿且无续写点残留', lines.some(l => l.startsWith('状态：第二版成稿')) && !all.includes('续写点'));

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
const inst = []; let instTotal = 0;
for (let n = 1; n <= N; n++) {
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例`).map(m => m.line).filter(l => /^- 【/.test(l));
  instTotal += tagged.length;
  const ok = tagged.length >= 3 && tagged.some(l => l.startsWith('- 【非西陲】')) && tagged.some(l => /^- 【(非人类|超自然)】/.test(l));
  if (!ok) inst.push(`4.${n}(${tagged.length})`);
}
report(`3 数据实例至少三条，含非西陲、含非人类或超自然（共 ${instTotal} 条）`, inst.length === 0, inst.join(','));

// 4 验收断言三式且带编号
const asr = [];
for (let n = 1; n <= N; n++) {
  const s = meta.filter(m => m.h4 === `#### 4.${n}.6 验收断言`).map(m => m.line);
  ['扫描式', '不变量式', '扩展性式'].forEach((k, i) => {
    const l = s.find(x => x.startsWith(`- ${k}：`));
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A${V}-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 无具体 id 字面量（实体 id 前缀加下划线）
// 李白 11-14 补：卷二 §1.9 实体前缀表所缺 flora body bld fac law eff mod note，及他卷脚本（卷二十六第 5 项）登记的词表实例前缀 value need gauge thought episode drive sfam class comp rel sg param req agg res；
// verb_ 入扫（卷二十二只核 11-14 真问题 1，照卷二十一先例）：只精确放行本卷 §4.2、§4.3 登记的 4 个事件动词与卷二终止协议事件，共 5 个名，其余 verb_ 照报
const idRe = /\b(verb|item|mat|npc|creature|monster|boss|loc|spell|lore|deity|faith|org|species|status|skill|profession|office|culture|etype|recipe|plant|polity|offense|facility|site|player|biome|terrain|weather|season|lang|kfam|kchan|distort|fclass|infer|rkind|plot|flora|body|bld|fac|law|eff|mod|note|value|need|gauge|thought|episode|drive|sfam|class|comp|rel|sg|param|req|agg|res)_[a-z0-9_]+/g;
const idAllow = new Set(['distort_op', 'kchan_', 'distort_', 'fclass_', 'infer_', 'rkind_', 'plot_', /* 新前缀下的词表族名，非实例：照卷二十六 allowWords */ 'body_plan', 'body_part', 'law_code', 'gauge_mode', 'thought_trigger', 'thought_role', 'episode_pick', /* 本卷登记的动词代号与卷二协议事件，精确放行 */ 'verb_fact_learned', 'verb_fact_told', 'verb_belief_contradicted', 'verb_research_done', 'verb_entity_terminated']);
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) if (!idAllow.has(m[0])) idHits.push(`${i + 1}:${m[0]}`); });
// 5 续 别卷词表 pers_ 代号（李白 11-14 机制项第一批第三节；写法照卷二十六第 5 项）：只准出现在代码块与各节数据实例小节内，正文其余处一律报
const persRe = /\bpers_[a-z0-9][a-z0-9_]*/g;
let fence5 = false;
meta.forEach((m, i) => {
  if (/^```/.test(m.line)) { fence5 = !fence5; return; }
  if (fence5 || /^#### 4\.\d+\.5 数据实例$/.test(m.h4)) return;
  for (const hit of m.line.match(persRe) ?? []) idHits.push(`${i + 1}:${hit}`);
});
report('5 正文无具体 id 字面量（含数据实例；实例用‹指称›；pers_ 代号只准在代码块与数据实例内）', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名
const bad6 = [];
lines.forEach((l, i) => {
  for (const t of ticks(l)) {
    const pure = /^[^\s(（=×÷+<>,，、:：]+$/.test(t);
    if (pure && cjk.test(t) && !/\.md$/.test(t) && !/^[RASCQMX]22-/.test(t)) bad6.push(`${i + 1}:${t}`);
    if (t.includes('‹')) bad6.push(`${i + 1}:反引号里的指称`);
  }
  if (/(===|==|!==)\s*['"][^'"]*[\u3400-\u9fff]/.test(l)) bad6.push(`${i + 1}:中文字面量比较`);
  if (/includes\(\s*['"][^'"]*[\u3400-\u9fff]/.test(l)) bad6.push(`${i + 1}:包含判断`);
});
let enumCount = 0, enumVals = 0; const badEnum = [];
for (const l of sub(/^### 2\.1 /)) {
  if (!/^\| `/.test(l)) continue;
  const c = cells(l); enumCount++;
  const vals = [...c[1].matchAll(/`([^`]+)`（([^）]*)）/g)];
  if (vals.length < 2) badEnum.push(c[0]);
  for (const v of vals) { enumVals++; if (!/^[a-z_]+$/.test(v[1]) || !/ \/ /.test(v[2]) || !cjk.test(v[2])) badEnum.push(`${c[0]}:${v[1]}`); }
}
report(`6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名（枚举 ${enumCount} 个、值 ${enumVals} 个）`, bad6.length === 0 && badEnum.length === 0 && enumCount === 12 /* 卷二十二二审 11-14：v2 按一审真问题 14、20 新增 cost_source、guard_scope，10→12 */,bad6.slice(0, 6).join(' ') + ' ' + badEnum.join(' '));

// 7 台账各概念写全（台账“卷二十二 知识、信息与传播”各行、E-19、X-03、X-14、X-24、N-01、K-32）
const ledger = {
  1: ['主观视图四域与检索键', ['view_domain', 'mentions', 'dims', 'N-01', 'knowsFact', 'linkKnown', 'K-32', 'recallFacts']],
  2: ['知情来源与通道', ['kchan', 'source_kind', 'noteKnowing', 'X-14', 'revealed', 'verb_fact_told', 'baseCredenceBps']],
  3: ['推断、belief、credence', ['beliefOf', 'credenceBps', 'infer', 'verb_belief_contradicted', 'recall', 'variantMax']],
  4: ['传闻与失真表', ['distort_op', 'hops', 'claimHolds', 'mintLore', 'X-24', 'overrides']],
  5: ['公共知情与统计层', ['informedShare', 'spreadCurve', 'R27-2.2', 'site.know.public', 'R18-6.1', 'boost']],
  6: ['文书阅读、语言、代读、译本', ['readOutcome', 'read_grade', 'documentStanding', 'languageCap', 'copyGeneration' /* 卷二十二二审 11-14：一审真问题 8，字段名按卷三乙 */, 'cipherOf', '代读', '译本']],
  7: ['秘密、钩子、阴谋', ['guard', 'leverageOf', 'exposureCost', 'plotkind', 'successCapBps', 'concealed', '缄默合同']],
  8: ['秘密结社与情报', ['org.covert', 'covertGrade', 'gatherMinutes', 'roles.channels.report', '汇报']],
  9: ['研究与创新机制', ['rkind', 'research_yield', 'regionGate', 'workNeed', 'X-03', 'loreShare', '时代']],
  10: ['知识持有与失传', ['holdsLore', 'knowStanding', 'decayPerYear', 'carriers', 'grantLore', 'X-03', 'graspBps', 'carryKnowing']],
  11: ['编年史与 why()', ['chronicleView', 'why_edge', 'causedBy', 'gradeBands']],
  12: ['返场见闻', ['returnDigest', 'digest.max', '位置事件']],
};
const led = [];
let ruleTotal = 0;
for (let n = 1; n <= N; n++) {
  const [title, kws] = ledger[n];
  if (!lines.includes(`### 4.${n} ${title}`)) led.push(`4.${n} 标题`);
  const body = sub(new RegExp(`^### 4\\.${n} `)).join('\n');
  for (const k of kws) if (!body.includes(k)) led.push(`4.${n}:${k}`);
  const rs = [...body.matchAll(new RegExp(`^- \\*\\*R${V}-${n}\\.(\\d+) `, 'gm'))].map(m => +m[1]);
  ruleTotal += rs.length;
  if (rs.length < 5 || rs.some((v, i) => v !== i + 1)) led.push(`4.${n}:规则编号${rs.join('.')}`);
}
for (const x of ['X-03', 'X-14', 'X-24', 'N-01', 'K-32', 'knowledgeView']) if (!all.includes(x)) led.push(x);
// 知识表各列（X-03 判给本卷的字段含义）都在 §2.3 写了含义
const cols = ['family', 'prereqs', 'difficulty', 'regionGate', 'carriers', 'decayPerYear', 'grants', 'effectRef', 'cost'];
const s23 = sub(/^### 2\.3 /).join('\n');
for (const c of cols) if (!s23.includes('`' + c + '`')) led.push(`§2.3 缺列 ${c}`);
report(`7 台账各概念写全（十二节标题、台账裁定编号、关键概念、知识表各列、每节规则不少于五条且编号连续；规则共 ${ruleTotal} 条）`, led.length === 0, led.join(' '));

// 8 编号引用不悬空且连续
const defs = { R: new Set(), A: new Set(), S: new Set(), C: new Set(), Q: new Set(), M: new Set() };
for (const m of all.matchAll(/\*\*(R22-\d+\.\d+) /g)) defs.R.add(m[1]);
for (const m of all.matchAll(/式：(A22-\d+\.\d+) /g)) defs.A.add(m[1]);
for (const m of all.matchAll(/^- (S22-\d+)：/gm)) defs.S.add(m[1]);
for (const m of all.matchAll(/^\| (C22-\d+|Q22-\d+|M22-\d+) \|/gm)) defs[m[1][0]].add(m[1]);
const dangling = [];
for (const m of all.matchAll(/(?<![A-Za-z0-9])([RASCQM])22-\d+(\.\d+)?/g)) if (!defs[m[1]].has(m[0])) dangling.push(m[0]);
const seqOk = k => { const ns = [...defs[k]].map(s => +s.split('-')[1]).sort((a, b) => a - b); return ns.every((v, i) => v === i + 1); };
const seqBad = ['S', 'C', 'Q', 'M'].filter(k => !seqOk(k));
report(`8 本卷编号引用不悬空且连续（R ${defs.R.size}、A ${defs.A.size}、S ${defs.S.size}、C ${defs.C.size}、Q ${defs.Q.size}、M ${defs.M.size}）`, dangling.length === 0 && seqBad.length === 0, [...new Set(dangling)].join(' ') + ' ' + seqBad.join(''));

// 9 跨卷章节引用带标题且与原卷标题相符（未成稿各卷按台账标题）
const volFiles = readdirSync(DIR).filter(f => /^卷.*\.md$/.test(f));
const titles = new Map();
for (const f of volFiles) {
  const vol = f.split('-')[0];
  const m = new Map();
  for (const l of readFileSync(DIR + f, 'utf8').split('\n')) {
    const t = l.replace(/\r$/, '');
    const h = t.match(/^#{2,3} §?(\d+A?(?:\.\d+)?)[ ．.]\s*(.+)$/);
    if (h && !m.has(h[1])) m.set(h[1], h[2].trim());
  }
  titles.set(vol, m);
}
const pending = {
  '卷二十九': { '4.2': '叙述模板与片段库' },
  '卷二十四': { '4.2': '事件类型注册表' },
};
const xbad = []; let xcount = 0;
const xre = /(卷[零一二三四五六七八九十]+[甲乙b]?) §(\d+A?(?:\.\d+)?)（((?:[^（）]|（[^（）]*）)*)）/g;
for (const [i, l] of lines.entries()) {
  for (const m of l.matchAll(xre)) {
    const [, vol, num, title] = m; xcount++;
    if (vol === '卷二十二') continue;
    const real = titles.get(vol)?.get(num) ?? pending[vol]?.[num];
    if (!real) { xbad.push(`${i + 1}:${vol}§${num}无此节`); continue; }
    const clean = s => s.replace(/`/g, '').replace(/\s+/g, '');
    if (!clean(real).startsWith(clean(title))) xbad.push(`${i + 1}:${vol}§${num}（${title}）≠${real.slice(0, 20)}`);
  }
}
const bare = [];
for (const [i, l] of lines.entries()) {
  for (const m of l.matchAll(/(卷[零一二三四五六七八九十]+[甲乙b]?) §(4\.\d+)(?!（)(?![\d.])/g)) {
    const withTitle = new RegExp(m[1] + ' §' + m[2].replace('.', '\\.') + '（').test(l);
    const inTable = /^\|/.test(l);
    if (!withTitle && !inTable) bare.push(`${i + 1}:${m[0]}`);
  }
}
report(`9 跨卷章节引用带标题且与原卷标题相符（带标题引用 ${xcount} 处）`, xbad.length === 0 && bare.length === 0, xbad.slice(0, 8).join(' ') + (bare.length ? ' 无标题:' + bare.slice(0, 8).join(' ') : ''));

// 9b 别卷对本卷各节的带标题引用，与本卷标题相符者计数、不符者列出（不符项须已列入 §5.4）
const mine = titles.get('卷二十二') ?? new Map();
const inbound = { ok: 0, bad: [] };
for (const f of volFiles) {
  const vol = f.split('-')[0];
  if (vol === '卷二十二') continue;
  for (const l of readFileSync(DIR + f, 'utf8').split('\n')) {
    for (const m of l.matchAll(/卷二十二 §(4\.\d+)（((?:[^（）]|（[^（）]*）)*)）/g)) {
      const real = mine.get(m[1]);
      const clean = s => s.replace(/`/g, '').replace(/\s+/g, '');
      if (real && clean(real).startsWith(clean(m[2]))) inbound.ok++; else inbound.bad.push(`${vol}→§${m[1]}（${m[2]}）`);
    }
  }
}
const inboundSet = [...new Set(inbound.bad)];
const cItem = { '卷七': 'C22-8', '卷二十六': 'C22-9', '卷十四': 'C22-10', '卷四': 'C22-22', '卷零': 'C22-22', '卷二十三': 'C22-22', '卷二十四': 'C22-22', '卷二十九': 'C22-22' /* 卷二十二二审 11-14：两卷成稿后新出括注；须正文 C22-22 行点名该卷才过，不放宽 */ };
const covered = inboundSet.every(s => { const vol = s.split('→')[0]; const c = cItem[vol]; return c && new RegExp('^\\| ' + c + ' \\|.*' + vol, 'm').test(all); });
report(`9b 别卷对本卷的带标题引用：相符 ${inbound.ok} 处，不符 ${inbound.bad.length} 处（${inboundSet.join(' ')}），不符项均已列入 §5.4`, covered);

// 10 除数都有下界说明
const divBad = [];
lines.forEach((l, i) => {
  if (!l.includes('÷')) return;
  if (/^\|/.test(l) && !/R22-/.test(l)) return;
  if (!/除数|不做除法/.test(l)) divBad.push(`${i + 1}`);
});
const divLines = lines.filter(l => l.includes('÷')).length;
report(`10 每个含除法的规则行都写明除数下界或“不做除法”的分支（含除号的行 ${divLines} 行）`, divBad.length === 0, divBad.join(' '));

// 11 必备句
const must = ['R27-8.5', '同一份存档摘要', '待标定', 'E-KNOW-WRITER', 'E-LORE-WRITER', '纯函数', '卷二 §3.3（求值管线）', '不读墙钟', 'S22-7'];
const mm = must.filter(k => !all.includes(k));
report('11 骰值键、分段无关、唯一写者、存法口径等必备内容在场', mm.length === 0, mm.join(' '));

// 12 规则表各键写明类型与取值域；读入口表与写者表在场
const tblRows = sub(/^### 2\.4 /).filter(l => /^\| `/.test(l));
const noDom = tblRows.filter(l => { const c = cells(l); return !c[1] || c[1] === '—'; });
const entryRows = sub(/^### 3\.1 /).filter(l => /^\| `/.test(l));
report(`12 规则表各键写明类型与取值域（${tblRows.length} 行）；读入口 ${entryRows.length} 个`, tblRows.length >= 20 && noDom.length === 0 && entryRows.length >= 15, noDom.map(l => cells(l)[0]).join(' '));

// 13 规则层入口不收文字：读入口签名里没有 query、text、string 形参
const sigBad = entryRows.filter(l => /\b(query|text|string)\b/i.test(cells(l)[1]));
report('13 读入口签名里没有文字形参', sigBad.length === 0, sigBad.map(l => cells(l)[0]).join(' '));

console.log(`行数 ${all0.length}；子系统 ${N}；规则 ${ruleTotal}；断言 ${defs.A.size}；枚举 ${enumCount}；配合项 ${defs.C.size}；开放问题 ${defs.Q.size}；迁移项 ${defs.M.size}；待补 ${lines.filter(l => /^\| \d+ \| /.test(l) && /待(查|标定) \|$/.test(l)).length} 条`);
console.log(fails === 0 ? 'ALL PASS' : `FAILS ${fails}`);
