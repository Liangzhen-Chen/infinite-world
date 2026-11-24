// 卷十七 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十七/check-卷十七.mjs [成稿路径]
import { readFileSync, readdirSync } from 'node:fs';
const DIR = 'F:/dnd/docs/统一底层设计/';
const path = process.argv[2] ?? DIR + '卷十七-交通与路途.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + String(detail).slice(0, 900) : '')); };
const N = 11;

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
// 卷十七二审 11-14：第二版卷首加了改稿模型，锚点照现文
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
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A17-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 无具体 id 字面量（实体 id 前缀加下划线；类型名与本卷须登记的阶段条目除外）
const idRe = /\b(item|mat|npc|creature|monster|boss|loc|spell|lore|deity|faith|org|species|status|skill|profession|office|culture|etype|recipe|plant|polity|offense|facility|site|player|biome|terrain|weather|season|gait|tmode|vform|propel|pacing|mishap|roadgrade|tprofile|service|clause|ckind|aslot|quality)_[a-z0-9_]+/g;
const idAllow = new Set(['status_family', 'event_type', 'facility_type', 'body_plan', 'ckind_lease', 'tmode_', 'vform_', 'propel_', 'pacing_', 'mishap_', 'roadgrade_', 'tprofile_']);
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) if (!idAllow.has(m[0])) idHits.push(`${i + 1}:${m[0]}`); });
report('5 正文无具体 id 字面量（含数据实例）', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名
const bad6 = [];
lines.forEach((l, i) => {
  for (const t of ticks(l)) {
    const pure = /^[^\s(（=×÷+<>,，、:：]+$/.test(t);
    if (pure && cjk.test(t) && !/\.md$/.test(t) && !/^[RASCQMX]17-/.test(t)) bad6.push(`${i + 1}:${t}`);
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
report(`6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名（枚举 ${enumCount} 个、值 ${enumVals} 个）`, bad6.length === 0 && badEnum.length === 0 && enumCount === 8 /* 卷十七二审 11-14：第二版按一审真问题 7 新增封闭枚举 way_kind，7→8 */, bad6.slice(0, 6).join(' ') + ' ' + badEnum.join(' '));

// 7 台账各概念写全（台账“卷十七 交通与路途”各行与第五节清单）
const ledger = {
  1: ['行程合成（路线、距离、速度、钟点）', ['X-13', 'routeView().edge', 'moveSpeedOf', 'speedFactor', '行进窗', 'tripPlan', 'tripMinutes', 'R9-1.12']],
  2: ['载具', ['comp_vehicle', 'vform', 'maxLoadKg', '材料', '品质', 'relocate', 'R18-1.10', 'verb_domicile_changed', 'wearStep']],
  3: ['车行、运单、货损、索赔、护卫', ['合同种类行', 'canOffer', 'cargo_fate', '赔付', '押金', '护卫', '在途用途分区']],
  4: ['承运与邮递', ['知情', '通道', '封缄', '需要在场', 'sealBreakFact']],
  5: ['水运、海运、封冻禁航', ['iceFraction', 'waterway', 'fillRatio', 'iceBearCurve', '封冻']],
  6: ['路途风险律', ['valueDensity', 'securityOf', 'responseOf', 'deterrenceOf', 'crimeProspect', 'sink_seized', 'encounterReading', 'routeRisk']],
  7: ['关卡、通行条款、引渡', ['borderTerms', 'taxesFor', 'toll', '引渡', 'contrabandAt', 'safetyOf', 'X-15', '检定']],
  8: ['负重、体力与行程', ['loadOf', 'X-13', 'M-6', 'towShareOf', 'staminaFactor', 'dragShare']],
  9: ['远方路网', ['gstage_roads', '入站边', 'roadgrade', '潜力', '物化']],
  10: ['旅行危险按地形', ['hazard', 'development', 'control', 'mishap', 'effects', '领路']],
  11: ['探索与未知地点', ['explore_grade', 'hiddenness', '知情', '勘察', '测绘', 'located']],
};
const led = [];
let ruleTotal = 0;
for (let n = 1; n <= N; n++) {
  const [title, kws] = ledger[n];
  if (!lines.includes(`### 4.${n} ${title}`)) led.push(`4.${n} 标题`);
  const body = sub(new RegExp(`^### 4\\.${n} `)).join('\n');
  for (const k of kws) if (!body.includes(k)) led.push(`4.${n}:${k}`);
  const rs = [...body.matchAll(new RegExp(`^- \\*\\*R17-${n}\\.(\\d+) `, 'gm'))].map(m => +m[1]);
  ruleTotal += rs.length;
  if (rs.length < 5 || rs.some((v, i) => v !== i + 1)) led.push(`4.${n}:规则编号${rs.join('.')}`);
}
for (const x of ['X-13', 'X-15', 'X-33', 'E-24', 'N-06']) if (!all.includes(x)) led.push(x);
report(`7 台账各概念写全（十一节标题、台账裁定编号、关键概念、每节规则不少于五条且编号连续；规则共 ${ruleTotal} 条）`, led.length === 0, led.join(' '));

// 8 编号引用不悬空且连续
const defs = { R: new Set(), A: new Set(), S: new Set(), C: new Set(), Q: new Set(), M: new Set(), X: new Set() };
for (const m of all.matchAll(/\*\*(R17-\d+\.\d+) /g)) defs.R.add(m[1]);
for (const m of all.matchAll(/式：(A17-\d+\.\d+) /g)) defs.A.add(m[1]);
for (const m of all.matchAll(/^- (S17-\d+)：/gm)) defs.S.add(m[1]);
for (const m of all.matchAll(/^\| (C17-\d+|Q17-\d+|M17-\d+|X17-\d+) \|/gm)) defs[m[1][0]].add(m[1]);
const dangling = [];
for (const m of all.matchAll(/(?<![A-Za-z0-9])([RASCQMX])17-\d+(\.\d+)?/g)) if (!defs[m[1]].has(m[0])) dangling.push(m[0]);
const seqOk = k => { const ns = [...defs[k]].map(s => +s.split('-')[1]).sort((a, b) => a - b); return ns.every((v, i) => v === i + 1); };
const seqBad = ['S', 'C', 'Q', 'M', 'X'].filter(k => !seqOk(k));
report(`8 本卷编号引用不悬空且连续（R ${defs.R.size}、A ${defs.A.size}、S ${defs.S.size}、C ${defs.C.size}、Q ${defs.Q.size}、M ${defs.M.size}、X ${defs.X.size}）`, dangling.length === 0 && seqBad.length === 0, [...new Set(dangling)].join(' ') + ' ' + seqBad.join(''));

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
  '卷二十二': { '4.2': '知情来源与通道' },
  '卷二十四': { '4.2': '事件类型注册表' },
};
const xbad = []; let xcount = 0;
const xre = /(卷[零一二三四五六七八九十]+[甲乙b]?) §(\d+A?(?:\.\d+)?)（((?:[^（）]|（[^（）]*）)*)）/g;
for (const [i, l] of lines.entries()) {
  for (const m of l.matchAll(xre)) {
    const [, vol, num, title] = m; xcount++;
    if (vol === '卷十七') continue;
    const real = titles.get(vol)?.get(num) ?? pending[vol]?.[num];
    if (!real) { xbad.push(`${i + 1}:${vol}§${num}无此节`); continue; }
    const clean = s => s.replace(/`/g, '').replace(/\s+/g, '');
    if (!clean(real).startsWith(clean(title))) xbad.push(`${i + 1}:${vol}§${num}（${title}）≠${real.slice(0, 20)}`);
  }
}
// 不带标题的“卷X §n”引用（§8 Q 号、§7 迁移节、§2.3/§5.x 表引用等写法除外：只查 §4.n 形式）
const bare = [];
for (const [i, l] of lines.entries()) {
  for (const m of l.matchAll(/(卷[零一二三四五六七八九十]+[甲乙b]?) §(4\.\d+)(?!（)(?![\d.])/g)) {
    // 同一行里该卷该节已带过标题的简写、以及 §5 接口表中的简写放行
    const withTitle = new RegExp(m[1] + ' §' + m[2].replace('.', '\\.') + '（').test(l);
    const inTable = /^\|/.test(l);
    if (!withTitle && !inTable) bare.push(`${i + 1}:${m[0]}`);
  }
}
report(`9 跨卷章节引用带标题且与原卷标题相符（带标题引用 ${xcount} 处）`, xbad.length === 0 && bare.length === 0, xbad.slice(0, 8).join(' ') + (bare.length ? ' 无标题:' + bare.slice(0, 8).join(' ') : ''));

// 10 除数都有下界说明
const divBad = [];
lines.forEach((l, i) => {
  if (!l.includes('÷')) return;
  if (/^\|/.test(l) && !/R17-/.test(l)) return;
  const n = (l.match(/÷/g) || []).length;
  const g = (l.match(/除数|不做除法/g) || []).length;
  if (g === 0) divBad.push(`${i + 1}(${n})`);
});
report('10 每个含除法的规则行都写明除数下界或“不做除法”的分支', divBad.length === 0, divBad.join(' '));

// 11 骰值键、确定性、禁读文字的必备句
const must = ['R27-8.5', '同一份存档摘要', '不读活动文字', 'position.mjs', 'E-POS-WRITER', 'simform_derived', '调用方义务', '待标定'];
const mm = must.filter(k => !all.includes(k));
report('11 确定性、位置唯一写者、矩阵行、调用方义务等必备内容在场', mm.length === 0, mm.join(' '));

// 12 数据实例不含判断用数值常数以外的 id；规则表各键有取值域
const tblRows = sub(/^### 2\.4 /).filter(l => /^\| `/.test(l));
const noDom = tblRows.filter(l => { const c = cells(l); return !c[2] || c[2] === '—' && !/explore_grade/.test(c[1]); });
report(`12 规则表各键写明类型与取值域（${tblRows.length} 行）`, tblRows.length >= 20 && noDom.length === 0, noDom.map(l => cells(l)[0]).join(' '));

console.log(`行数 ${all0.length}；子系统 ${N}；规则 ${ruleTotal}；断言 ${defs.A.size}；待补 ${lines.filter(l => /^\| \d+ \| /.test(l) && /待(查|标定)/.test(l)).length} 条`);
console.log(fails === 0 ? 'ALL PASS' : `FAILS ${fails}`);
