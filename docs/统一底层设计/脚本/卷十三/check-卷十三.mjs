// 卷十三 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十三/check-卷十三.mjs [成稿路径]
import { readFileSync } from 'node:fs';
const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷十三-战斗.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const N = 20;

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
const cjk = /[\u3400-\u9fff]/;

// 1 章节
const need2 = ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表', '## 附录 待补清单'];
const miss2 = need2.filter(p => !lines.some(l => l.startsWith(p)));
report('1 章节 §0–§8、术语表、待补清单齐全', miss2.length === 0, miss2.join(','));
// 卷十三二审 11-13：第二版卷首署名改为“起草／改稿／审查”三段，锚点照新署名行
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
  const tagged = meta.filter(m => m.h4 === `#### 4.${n}.5 数据实例` && m.fence === null).map(m => m.line).filter(l => /^- 【/.test(l));
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
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A13-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 无具体 id 字面量
const idRe = /(?<![A-Za-z0-9_.])(item|loc|npc|bld|culture|monster|office|skill|profession|deity|faith|creature|mat|species|org|status|act|eff|bpart|tissue|gauge)_[a-z0-9]+/g;
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) idHits.push(`${i + 1}:${m[0]}`); });
report('5 正文无具体 id 字面量（含数据实例）', idHits.length === 0, idHits.slice(0, 8).join(','));

// 6 无用于判断的描述性文本；枚举值 ASCII 且带中英显示名；代号 ASCII
const judge = [];
lines.forEach((l, i) => { if (/(===|!==|==|includes\(|startsWith\(|indexOf\(|match\(|test\()\s*['"\/]/.test(l)) judge.push(i + 1); });
const quoted = [];
lines.forEach((l, i) => { for (const t of ticks(l)) if (/['"][^'"]*[\u3400-\u9fff][^'"]*['"]/.test(t)) quoted.push(`${i + 1}:${t.slice(0, 20)}`); });
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
// 族前缀、字段名、规则表键、状态键必须 ASCII：凡形如标识符或带点路径的反引号内容不得含中文
const codeBad = [];
lines.forEach((l, i) => { for (const t of ticks(l)) if (/^[A-Za-z_.\[\]<>-]*[\u3400-\u9fff]+[A-Za-z_.\[\]<>-]*$/.test(t) && !/\.md$/.test(t)) codeBad.push(`${i + 1}:${t}`); });
report(`6 无用于判断的描述性文本；无带引号的中文字面量；纯代号无中文；枚举值 ASCII 且带中英显示名（枚举 ${enumNames.length} 个、值 ${enumVals} 个）`,
  judge.length === 0 && quoted.length === 0 && enumBad.length === 0 && codeBad.length === 0 && enumVals > 0,
  [judge.join(','), quoted.slice(0, 5).join(','), enumBad.join(','), codeBad.slice(0, 5).join(',')].filter(Boolean).join(' / '));

// 7 台账判给本卷的概念写全
const c7 = [];
const titleNeed = { 1: '个人战斗结算', 2: '伤害类型词表与相克表', 3: '护甲减伤分层', 4: '远程与投射', 5: '武器类别与技法', 6: '弱点与特殊攻击', 7: '伤病疲劳濒死', 8: '军团士气', 9: '阵型与地形', 10: '军事组织与兵团四值克制', 11: '围攻、袭击、会战求解器', 12: '掠夺', 13: '场外任务抽象结算', 14: '指挥链', 15: '结构脆弱与加固', 16: '佣兵与修会', 17: '决斗', 18: '遭遇与谈判', 19: '战功', 20: '战斗职业产物链' };
for (const [n, k] of Object.entries(titleNeed)) if (!lines.some(l => l.startsWith(`### 4.${n} `) && l.includes(k))) c7.push(`标题4.${n}`);
for (const k of ['X-07', 'X-08', 'X-27', 'X-20', 'X-01', '对抗检定', '相克表', '威慑量', '参战快照', '战争结果事件', '兵力读数', '发布者类型', '登记行', '`damage` 族']) if (!all.includes(k)) c7.push(k);
const ruleCount = {}; let rulesTotal = 0;
for (let n = 1; n <= N; n++) {
  const rs = meta.filter(m => m.h4 === `#### 4.${n}.3 规则`).map(m => m.line).map(l => (l.match(/^- \*\*R13-(\d+)\.(\d+) /) || []).slice(1)).filter(a => a.length);
  ruleCount[n] = rs.length; rulesTotal += rs.length;
  if (rs.length < 3) c7.push(`4.${n}规则数=${rs.length}`);
  rs.forEach((a, i) => { if (+a[0] !== n || +a[1] !== i + 1) c7.push(`R13-${a[0]}.${a[1]}不连续`); });
}
report('7 台账各概念写全（二十节标题、台账裁定编号、关键概念、每节有规则且编号连续）', c7.length === 0, c7.join(','));

// 8 编号引用不悬空且连续；跨卷引用带标题
const c8 = [];
const defR = new Set([...all.matchAll(/^- \*\*(R13-\d+\.\d+) /gm)].map(m => m[1]));
const defA = new Set([...all.matchAll(/^- (?:扫描式|不变量式|扩展性式)：(A13-\d+\.\d+) /gm)].map(m => m[1]));
const defS = [...all.matchAll(/^- (S13-\d+)：/gm)].map(m => m[1]);
const defC = [...all.matchAll(/^\| (C13-\d+) \|/gm)].map(m => m[1]);
const defM = [...all.matchAll(/^\| (M13-\d+) \|/gm)].map(m => m[1]);
const defQ = [...all.matchAll(/^- \*\*(Q13-\d+)(?:（须李白定）)? ?/gm)].map(m => m[1]);
const seq = (arr, p) => arr.forEach((x, i) => { if (x !== `${p}-${i + 1}`) c8.push(`${x}序号`); });
seq(defS, 'S13'); seq(defC, 'C13'); seq(defM, 'M13'); seq(defQ, 'Q13');
const expand = (re, set, label) => { for (const m of all.matchAll(re)) if (!set.has(m[0])) c8.push(`${label}悬空:${m[0]}`); };
expand(/R13-\d+\.\d+/g, defR, 'R'); expand(/A13-\d+\.\d+/g, defA, 'A');
expand(/S13-\d+/g, new Set(defS), 'S'); expand(/C13-\d+/g, new Set(defC), 'C');
expand(/M13-\d+/g, new Set(defM), 'M'); expand(/Q13-\d+/g, new Set(defQ), 'Q');
const xrefBad = [];
let xrefN = 0;
for (const m of all.matchAll(/(卷[零一二三四五六七八九十]+[甲乙b]?) §(\d+(?:\.\d+)*)(（)?/g)) { xrefN++; if (!m[3]) xrefBad.push(`${m[1]} §${m[2]}`); }
if (xrefBad.length) c8.push('无标题引用:' + uniq(xrefBad).join('、'));
report(`8 编号引用不悬空且连续；跨卷章节引用处处带标题（${xrefN} 处）`, c8.length === 0, uniq(c8).slice(0, 12).join(','));

// 9 错误码、入口、规则表键、状态键、抽取点落实
const c9 = [];
const codeDef = sub(/^### 2\.9 /).map(l => (l.match(/^\| (E-CBT-[A-Z-]+) \|/) || [])[1]).filter(Boolean);
const codeUse = uniq([...all.matchAll(/E-CBT-[A-Z]+(?:-[A-Z]+)*/g)].map(m => m[0]));
codeUse.forEach(c => { if (!codeDef.includes(c)) c9.push(`码未定义:${c}`); });
const bodyNo29 = meta.filter(m => !/^### 2\.9 /.test(m.h3)).map(m => m.line).join('\n');
codeDef.forEach(c => { if (!new RegExp(c + '(?![A-Z-])').test(bodyNo29)) c9.push(`码未使用:${c}`); });
const entryNames = ['layersOf', 'strikeOutcome', 'strikePreview', 'combatReadings', 'encounterView', 'encounterOf', 'deterrenceOf', 'forceView', 'commandOf', 'battlePreview', 'battleView', 'siegeView', 'warView', 'lootCapacity', 'missionView', 'meritOf', 'meritsOf', 'encounterStep', 'joinEncounter', 'leaveEncounter', 'setMuster', 'battleStep', 'siegeStep', 'noteWarScore', 'lootStep', 'missionStep', 'noteMerit'];
const s31 = [...sub(/^### 3\.1 /), ...sub(/^### 3\.2 /)].join('\n');
const sec4 = sec(/^## §4 /).join('\n');
entryNames.forEach(e => { if (!s31.includes('`' + e)) c9.push(`入口未登记:${e}`); if (!new RegExp('`' + e + '[`(]').test(sec4) && !new RegExp(e + '\\(').test(sec4)) c9.push(`入口未用于§4:${e}`); });
const keyDef = uniq(sub(/^### 2\.5 /).filter(l => /^\| `rules\.combat\./.test(l)).flatMap(l => ticks(cells(l)[0])).flatMap(t => {
  if (t.startsWith('rules.combat.')) return [t];
  return [];
}));
// 同格里 "`rules.combat.a.x`、`y`" 的简写：补全同组前缀
const keyAll = new Set();
for (const l of sub(/^### 2\.5 /).filter(l => /^\| `rules\.combat\./.test(l))) {
  const ts = ticks(cells(l)[0]); const first = ts[0]; const pre = first.slice(0, first.lastIndexOf('.') + 1);
  ts.forEach((t, i) => keyAll.add(i === 0 ? t : (t.startsWith('rules.') ? t : pre + t)));
}
// 锚点修订 11-14：修订记录、勘误表是历史，可提已删键；按节标题跳过（## 或 ### 级标题含“修订记录”或“勘误表”），正文其余照扫
const isHist = m => /^##+ .*(修订记录|勘误表)/.test(m.h2) || /^###+ .*(修订记录|勘误表)/.test(m.h3);
const bodyNoHist = meta.filter(m => !isHist(m)).map(m => m.line).join('\n');
uniq([...bodyNoHist.matchAll(/rules\.combat\.[A-Za-z]+\.[A-Za-z]+/g)].map(m => m[0])).forEach(k => { if (!keyAll.has(k)) c9.push(`键未定义:${k}`); });
const outside25 = meta.filter(m => !/^### 2\.5 /.test(m.h3)).map(m => m.line).join('\n');
for (const k of keyAll) { const leaf = k.split('.').pop(); const grp = k.split('.')[2]; if (!outside25.includes(k) && !new RegExp('`(?:' + grp + '\\.)?' + leaf + '[`\\[.]|[A-Za-z.]*' + leaf + '\\b').test(outside25)) c9.push(`键无消费者:${k}`); }
const stateDef = uniq(sub(/^### 2\.4 /).flatMap(l => ticks(cells(l)[0] || '')).map(t => (t.match(/^state\.([A-Za-z]+)/) || [])[1]).filter(Boolean));
uniq([...all.matchAll(/(?<![-\w])state\.([A-Za-z]+)/g)].map(m => m[1])).forEach(k => { if (!stateDef.includes(k) && k !== 'statuses') c9.push(`状态键未登记:${k}`); });
const writers = sub(/^### 3\.3 /).join('\n');
stateDef.forEach(k => { if (!writers.includes('`state.' + k + '`')) c9.push(`状态键无写者:${k}`); });
const siteDef = uniq(sub(/^### 2\.7 /).flatMap(l => ticks(l)).filter(t => /^site\./.test(t)));
uniq([...all.matchAll(/site\.[a-z]+\.[a-z0-9]+/g)].map(m => m[0])).forEach(k => { if (!siteDef.includes(k)) c9.push(`抽取点未登记:${k}`); });
siteDef.forEach(k => { if (!sec4.includes(k)) c9.push(`抽取点未使用:${k}`); });
report(`9 错误码、入口、规则表键、状态键与写者、抽取点落实（码 ${codeDef.length}、入口 ${entryNames.length}、规则表键 ${keyAll.size}、状态键 ${stateDef.length}、抽取点 ${siteDef.length}）`, c9.length === 0, uniq(c9).slice(0, 14).join(','));

// 10 红线
const c10 = [];
const head = lines.slice(0, 8).join('\n');
for (const k of ['不派任何实现卡', '不改变冻结状态', '不改任何别卷', '凡除法写明除数下界', '不读墙钟']) if (!head.includes(k)) c10.push(`卷首缺:${k}`);
const guard = /不做除法|恒为正|除数是常数|常数一万|常数一百|常数一亿|下限都是 1|严格大于 0|不小于 1|交叉相乘/;
meta.forEach((m, i) => {
  if (!/÷|除以/.test(m.line)) return;
  if (/^## §[01] /.test(m.h2) || /^## 附/.test(m.h2) || /^## §[678] /.test(m.h2)) return;
  if (/数据实例$/.test(m.h4)) return;
  if (/^\| /.test(m.line) && /^### 2\./.test(m.h3)) return; // 维度表、规则表的说明单元格
  const win = [meta[i - 2], meta[i - 1], m, meta[i + 1], meta[i + 2], meta[i + 3], meta[i + 4]].filter(Boolean).map(x => x.line).join('\n');
  if (!/÷|除以/.test(m.line.replace(/÷ ?\d+(?![\d.A-Za-z_])/g, ''))) return; // 除数是数字常数
  if (!guard.test(m.fence ? win : m.line)) c10.push(`第 ${i + 1} 行除法未写下界`);
});
if (/Date\.now|new Date\(|Math\.random\(/.test(all)) c10.push('出现墙钟或随机源调用');
for (const k of ['本卷不写身体状态', '没有生命值', '不调 `die`', '法律只产生后果', '不得指向价格', '只向下传', '只写一次', '结果与推进路径无关', '规则不读类别代号', '不读兵种']) if (!all.includes(k)) c10.push(`缺红线句:${k}`);
// 本卷写者不得出现在身体状态、物品耐久、建筑完好度的写者栏
const w33 = sub(/^### 3\.3 /).filter(l => /^\| /.test(l));
for (const l of w33) { const c = cells(l); if (/状态实例|耐久|完好度|死亡/.test(c[0]) && /(strike|encounter|force|battle|siege|war|loot|mission|merit)\.mjs/.test(c[1])) c10.push('本卷模块写了别卷的量:' + c[0].slice(0, 12)); }
report('10 红线：不派实现、不改别卷、不读墙钟、除数有下界、身体状态只经卷二十一、无生命值、法律不拦、不写价格乘数', c10.length === 0, c10.slice(0, 10).join(','));

// 11 算术复算（数据实例里的四组演示数）
const c11 = [];
const want = s => { if (!all.includes(s)) c11.push(`缺算例文本:${s}`); };
// (a) 打击量
const mEff = 1.2 + 70 * 500 / 10000, p = Math.round(mEff * 12 * 10) / 10, s = p / 2;
if (mEff !== 4.7 || p !== 56.4 || s !== 28.2) c11.push(`打击量 ${mEff}/${p}/${s}`);
if (Math.floor(60 * 1.5) !== 90 || Math.floor(60 * 1.1) !== 66) c11.push('punch0');
['`m = 1.2 + 3.5 = 4.7`', '`p = 4.7 × 12 = 56.4`', '`s = 56.4 ÷ 2 = 28.2`', '`punch0 = 90`', '`punch0 = 66`'].forEach(want);
// (b) 层律
// 卷十三二审 11-13：第二版按 Q13-2 改层律（护具层先减穿透再抽一次 RW 三段，组织层确定减法加转型），
// 算例改为锁甲 100/40、承受量 100、armorScale 100、softenBps 5000；此处照 R13-3.4 现文真算复算，不放宽
const layerLaw = (q, d, layers, fb, carry, cap, taken, us, armorScale = 100, softenBps = 5000) => {
  let absorbed = 0, ui = 0; const res = [];
  for (const L of layers) {
    const before = q; let r;
    if (!L.tissue) {
      const E = Math.min(20000, Math.floor(Math.max(0, L.prot[d] - q) * 10000 / armorScale));
      const u = us[ui++];
      if (u < Math.floor(E / 2)) { q = 0; r = 'stopped'; }
      else if (u < E) { q = Math.floor(q * softenBps / 10000); d = fb[d] ?? d; r = 'turned'; }
      else r = 'passed';
    } else if (q >= L.prot[d]) { q -= L.prot[d]; r = 'passed'; }
    else if (fb[d]) { q = Math.floor(q * carry[d] / 10000); d = fb[d]; if (q >= L.prot[d]) { q -= L.prot[d]; r = 'turned'; } else { q = 0; r = 'stopped'; } }
    else { q = 0; r = 'stopped'; }
    if (L.tissue) absorbed += before - q;
    res.push(r);
    if (r === 'stopped') break;
  }
  return { loss: Math.min(10000, Math.floor(absorbed * taken * 10000 / cap)), res, absorbed };
};
const arm = [{ prot: { cut: 100, blunt: 40 } }, { prot: { cut: 10, blunt: 12 } }, { tissue: true, prot: { cut: 4, blunt: 3 } }, { tissue: true, prot: { cut: 12, blunt: 8 } }, { tissue: true, prot: { cut: 40, blunt: 30 } }];
const fbm = { cut: 'blunt' }, carry = { cut: 5000 };
const steel = layerLaw(90, 'cut', arm, fbm, carry, 100, 1, [7000, 9999]);
const cuA = layerLaw(66, 'cut', arm, fbm, carry, 100, 1, [1200, 9999]);
const cuB = layerLaw(66, 'cut', arm, fbm, carry, 100, 1, [2500, 9999]);
const cuC = layerLaw(66, 'cut', arm, fbm, carry, 100, 1, [3400, 9999]);
if (steel.loss !== 5600 || steel.absorbed !== 56 || steel.res.join() !== 'passed,passed,passed,passed,passed') c11.push(`钢刃 ${JSON.stringify(steel)}`);
if (cuA.loss !== 0 || cuA.res.join() !== 'stopped') c11.push(`铜刃弹开 ${JSON.stringify(cuA)}`);
if (cuB.loss !== 3300 || cuB.absorbed !== 33 || cuB.res.join() !== 'turned,passed,passed,passed,stopped') c11.push(`铜刃转钝 ${JSON.stringify(cuB)}`);
if (cuC.loss !== 5600 || cuC.res.join() !== 'passed,passed,passed,passed,passed') c11.push(`铜刃穿透 ${JSON.stringify(cuC)}`);
['`E = floor((100 − 90) × 10000 ÷ 100) = 1000`', '`lossBps = floor(56 × 1 × 10000 ÷ 100) = 5600`', '`E = floor((100 − 66) × 10000 ÷ 100) = 3400`', '`[0, 1700)`', '`[1700, 3400)`', '`lossBps = 0`', '`q = floor(66 × 5000 ÷ 10000) = 33`', '`22 < 30`', '`lossBps = 3300`', '`lossBps = 5600`'].forEach(want);
// (c) 伤亡式的切片不变
// 卷十三二审 11-13：第二版按 T3 改定点（valueScale 100，strikePH 轮起点截断，D 含 valueScale），照 R13-11.5 现文真算复算
const strikePH = 300000n / 250n;
const D = 20000000000n * 30n * 100n; const step = (rem, span) => { const acc = rem + strikePH * 200n * 11000n * 4000n * span; const d = acc / D; return [d, acc - d * D]; };
const [d1, r1] = step(0n, 30n); const [da, ra] = step(0n, 15n); const [db, rb] = step(ra, 15n);
if (strikePH !== 1200n || D !== 60000000000000n || d1 !== 5n || r1 !== 16800000000000n || da !== 2n || ra !== 38400000000000n || db !== 3n || rb !== r1 || da + db !== d1) c11.push(`伤亡式 ${strikePH},${D},${d1},${r1},${da},${ra},${db},${rb}`);
['`strikePH = floor(300000 ÷ 250) = 1200`', '`D = 20000000000 × 30 × 100 = 60000000000000`', '`acc = 1200 × 200 × 11000 × 4000 × 30 = 316800000000000`', '`delta = 5`', '`16800000000000`', '`acc = 158400000000000`', '`38400000000000`', '`acc = 38400000000000 + 158400000000000 = 196800000000000`'].forEach(want);
// (d) 拆分末份取差、溃散交叉相乘、前列位数、份额
const a1 = Math.floor(1003 * 5000 / 10000), a2 = Math.floor(1003 * 3000 / 10000), a3 = 1003 - a1 - a2;
if (a1 !== 501 || a2 !== 300 || a3 !== 202) c11.push(`拆分 ${a1},${a2},${a3}`);
if (14 * 10000 !== 3500 * 40) c11.push('溃散算例');
if (Math.floor(3 * 200 / 100) !== 6) c11.push('前列位数算例');
if (150 * 10000 / 1000 !== 1500 || 52 * 10000 / 80 !== 6500) c11.push('份额算例');
['`1003 − 501 − 300 = 202`', '`14 × 10000 = 140000`', '`slots = floor(3 × 200 ÷ 100) = 6`', '`150 × 10000 ÷ 1000 = 1500`', '`52 × 10000 ÷ 80 = 6500`'].forEach(want);
// 计数对账
const zeroA = sub(/^### 0\.3 /).filter(l => /^\| \d+\.\d+ /.test(l)).length;
if (zeroA !== 13) c11.push(`卷零 A 表行=${zeroA}`);
const bLine = sub(/^### 0\.3 /).find(l => l.startsWith('B 表主归本卷 13 行')) || '';
const bCount = (bLine.match(/\d+\.\d+ [^（；。]+（§4\.\d+）/g) || []).length;
if (bCount !== 13) c11.push(`卷零 B 表项=${bCount}`);
const extItems = sec(/^## §6 /).filter(l => /^\d+\. \*\*/.test(l)).length;
if (!sec(/^## §6 /).join('').includes('八条') || extItems !== 8) c11.push(`§6 条数=${extItems}`);
const matrixRows = sub(/^### 5\.4 /).filter(l => /^\| (strike|encounter|force|battle|siege|war|loot|mission|merit) \|/.test(l)).length;
if (matrixRows !== 9 || !all.includes('九个系统键') || !all.includes('九行矩阵')) c11.push(`矩阵行=${matrixRows}`);
report('11 算术复算与计数对账（打击量、层律两例、伤亡式切片不变、末份取差、交叉相乘、卷零 13+13 行、§6 八条、矩阵九行）', c11.length === 0, c11.slice(0, 8).join(','));

// 12 接口表、配合项、迁移清单、五款游戏、待补清单、素材位置落实
const c12 = [];
for (const h of ['### 5.1 本卷提供', '### 5.2 本卷读取', '### 5.3 需别卷配合的事项', '### 5.4 ']) if (!lines.some(l => l.startsWith(h))) c12.push(h);
const games = sub(/^### 0\.4 /).filter(l => /^\| (DF|CDDA|RW|EVE|CK3) \|/.test(l)).length;
if (games !== 5) c12.push(`五款游戏行=${games}`);
const s7 = sec(/^## §7 /).join('\n');
for (const k of ['combat.mjs:72–73', 'combat.mjs:64', 'combat.mjs:77', 'combat-state.mjs:11', 'activities.mjs:176', 'creature-nature.mjs:9', 'action-limits.mjs:15', 'interactions.mjs:13', 'interactions.mjs:109', 'magic-status.mjs:34–36', 'duels.mjs:7', 'duels.mjs:19', 'deterrence.mjs:3', 'boss-negotiation.mjs:98', 'career-metrics.mjs:62', 'military.mjs', 'war-diplomacy.mjs', 'checks.mjs', 'balance/combat.json', 'combat.terrain', 'items.json', 'combat-professions.mjs', 'wildlife.mjs:48', 'quest-wildlife.mjs:20', 'facilities.mjs', 'bosses.mjs'])
  if (!s7.includes(k)) c12.push(`§7 缺素材位置:${k}`);
const dispOk = defM.length >= 20 && sec(/^## §7 /).filter(l => /^\| M13-/.test(l)).every(l => { const cs = cells(l); /* 别名行（与卷十一生成器同判：三格以上写"同 Mxx-y"）不单独计数、不查五值 */ if (cs.filter(x => /^同 (?:M|Z35-)\d/.test(x.replace(/`/g, '').trim())).length >= 3) return true; return /`(delete|recode|move_out|to_data|replace_entry)`/.test(cs[4]); });
if (!dispOk) c12.push('迁移行处置未对到五种');
const todo = sec(/^## 附录 待补清单/).filter(l => /^\| \d+ \|/.test(l));
todo.forEach((l, i) => { if (+cells(l)[0] !== i + 1) c12.push('待补序号'); });
const vols = ['卷二 ', '卷三乙', '卷四', '卷五', '卷六', '卷七', '卷八 ', '卷九', '卷十二', '卷十四', '卷十八', '卷十九', '卷二十一', '卷二十六', '卷二十七'];
const s53 = sub(/^### 5\.3 /).join('\n');
vols.forEach(v => { if (!s53.includes('| ' + v.trim()) && !s53.includes(v.trim())) c12.push(`配合项缺:${v.trim()}`); });
report(`12 接口表、配合项、迁移清单（${defM.length} 行）、五款游戏、待补清单（${todo.length} 条）、素材位置落实`, c12.length === 0, c12.slice(0, 10).join(','));

// 13 关键条文在位
const must = ['战斗动作是目录行，检定是通用对抗检定', '攻方读数与守方读数', '打击量', '打击强度与初始穿透量', '穿深是上限', '损失比例', '出口',
  '伤害类型是带字段的条目', '类型由形制推出', '转型', '相克表是修正项', '没有实体的主体', '层只有一种', '层律', '磨损',
  '投射只是打击量换一种来法', '弹与药是实物', '类别给的是用法，不是加值', '技法是知识', '打法是意图', '弱点是物种行上的数据', '特殊攻击是效果族调用',
  '本卷不写身体状态', '疲劳是代价行', '退让不是阈值', '死不由本卷判', '个体形态：军团士气是成员士气的一次聚合', '统计形态：锚点量', '两种形态要对得上',
  '阵型是条目', '地形只经两条路进战斗', '军队是组织行', '四值是成员读数的聚合', '克制读编成，不读兵种', '维护没有专门的费',
  '求解器只是这条律的粗形态', '伤亡式', '袭击不买点数', '合围', '战争分值', '结果与推进路径无关', '掠夺是转移', '怎么分',
  '任务是一条记录加三个时刻', '所得是真的转移', '只向下传', '人不在场，令不达', '打墙是同一条律的前三步', '多轮窗口', '加固是修正项与工程，不是计时器',
  '两者都只是组织行', '本卷不定价', '决斗是遭遇种类的一行', '结果与法', '遭遇只有一个入口', '威慑量', '首领谈判不是另一套',
  '只写一次，写在收场的事务里', '战功是事实，不是账户', '本节只登记行', '用损读数只供 `forceView`'];
const missMust = must.filter(k => !all.includes(`${k}**`));
report(`13 关键条文在位（${must.length} 条）`, missMust.length === 0, missMust.join(','));

console.log(`行数 ${all0.length}；子系统 ${N}；规则条数 ${rulesTotal}；断言 ${defA.size}；扫描条 ${defS.length}；配合项 ${defC.length}；开放问题 ${defQ.length}（须李白定 ${(all.match(/^- \*\*Q13-\d+（须李白定）/gm) || []).length}）；迁移行 ${defM.length}；枚举 ${enumNames.length} 个、值 ${enumVals} 个；错误码 ${codeDef.length}；规则表键 ${keyAll.size}；数据实例 ${instTotal}；待补清单 ${todo.length} 条；失败项 ${fails}`);
process.exitCode = fails ? 1 : 0;
