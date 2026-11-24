// 卷十六 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十六/check-卷十六.mjs [成稿路径]
import { readFileSync, readdirSync } from 'node:fs';
const DIR = 'F:/dnd/docs/统一底层设计/';
const path = process.argv[2] ?? DIR + '卷十六-神怪与怪物.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + String(detail).slice(0, 700) : '')); };
const N = 14;

const meta = []; let h2 = '', h3 = '', h4 = '';
for (const line of lines) {
  if (/^## /.test(line)) { h2 = line; h3 = ''; h4 = ''; }
  else if (/^### /.test(line)) { h3 = line; h4 = ''; }
  else if (/^#### /.test(line)) { h4 = line; }
  meta.push({ line, h2, h3, h4 });
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
// 卷十六二审 11-13：第二版卷首模型行加“改稿”一段，锚点照现文
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
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A16-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 无具体 id 字面量（实体 id 前缀加下划线；类型名除外；§4.11.1 的阶段与位次条目是本卷须登记的词表条目，不是实体 id）
const idRe = /\b(item|mat|npc|creature|monster|boss|loc|spell|lore|deity|faith|org|species|status|skill|profession|office|culture|etype|recipe|plant|polity|offense|facility|site|player|ward|mtier|mvar|motif|mclass|biome|taxon|sphere|body)_[a-z0-9_]+/g;
const idAllow = new Set(['status_family', 'event_type', 'facility_type', 'body_plan', 'lore_about', 'ward_channel', 'ward_', 'mtier_', 'mvar_', 'motif_', 'mclass_']);
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) if (!idAllow.has(m[0]) && !idAllow.has(m[0].replace(/[a-z0-9]+$/, ''))) idHits.push(`${i + 1}:${m[0]}`); });
// 前缀声明（`ward_` 等）以下划线结尾，正则不会命中；这里只额外放行枚举名
report('5 正文无具体 id 字面量（含数据实例）', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名
const bad6 = [];
lines.forEach((l, i) => {
  for (const t of ticks(l)) {
    const pure = /^[^\s(（=×÷+<>,，、:：]+$/.test(t);
    if (pure && cjk.test(t) && !/\.md$/.test(t) && !/^[RASCQMX]16-/.test(t)) bad6.push(`${i + 1}:${t}`);
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
// 数据实例里对行的指称一律用‹类：名›，不得出现在反引号里
const guil = lines.filter(l => ticks(l).some(t => t.includes('‹'))).length;
report(`6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名（枚举 ${enumCount} 个、值 ${enumVals} 个）`, bad6.length === 0 && badEnum.length === 0 && enumCount === 5 && guil === 0, bad6.slice(0, 6).join(' ') + ' ' + badEnum.join(' ') + (guil ? ` 反引号里的指称${guil}` : ''));

// 7 台账各概念写全
const ledger = {
  1: ['怪物本体', ['物种表的行', 'X-11', 'banes', '出处']],
  2: ['首领与传说级配额', ['mtier', 'quota', 'maxAlive', 'tierRoom', '可区分度', 'S-19']],
  3: ['怪物社会与据点生产', ['组织行', 'recipeView', '站点', 'sapient']],
  4: ['妖怪志索引与传说真相层', ['传说条目', '真相层', 'claimTruth', 'loreRegions', 'X-24', '宁合不拆']],
  5: ['克制与辟邪双边标签', ['wardtag', 'wardReading', 'banes', 'wardImmune', 'deriveRX', '效力']],
  6: ['巢穴、探巢、赶路遭遇', ['巢居边', 'lairSuitability', 'encounterReading', 'encounterStep', '探巢']],
  7: ['怪物侧委托输入维度', ['threatBrief', '威胁', '完成证据', '不生成委托']],
  8: ['防重复相似度', ['similarity', '宁合不拆', 'mergeAboveBps', 'distinctBps']],
  9: ['夜生物', ['comp_shifter', '变身', '吸血', '潜藏身份', 'X-12']],
  10: ['巨兽、泰坦、恶魔、天使', ['显示归类', '六轴', '领域', 'X-11']],
  11: ['程序生成怪物', ['gstage_bestiary', 'gen.slots', '写回器', 'instanceIdOf', 'composeName']],
  12: ['进化、成精、变体', ['mvariant', 'proposeTransform', '转化效果族', '年锚周期日', '成精']],
  13: ['怪物阵营', ['立场', 'awakenOrg', '组织', '捕食']],
  14: ['异象与收容', ['事件类型行', 'containNeed', 'containReading', 'X-12']],
};
const led = [];
for (let n = 1; n <= N; n++) {
  const [title, kws] = ledger[n];
  if (!lines.includes(`### 4.${n} ${title}`)) led.push(`4.${n} 标题`);
  const body = sub(new RegExp(`^### 4\\.${n} `)).join('\n');
  for (const k of kws) if (!body.includes(k)) led.push(`4.${n}:${k}`);
  const rs = [...body.matchAll(new RegExp(`\\*\\*R16-${n}\\.(\\d+) `, 'g'))].map(m => +m[1]);
  if (rs.length < 5 || rs.some((v, i) => v !== i + 1)) led.push(`4.${n}:规则编号${rs.join('.')}`);
}
for (const x of ['X-11', 'X-12', 'X-24', 'S-19']) if (!all.includes(x)) led.push(x);
report('7 台账各概念写全（十四节标题、台账裁定编号、关键概念、每节有规则且编号连续）', led.length === 0, led.join(' '));

// 8 编号引用不悬空且连续；跨卷章节引用处处带标题且与原卷标题相符
const defs = { R: new Set(), A: new Set(), S: new Set(), C: new Set(), Q: new Set(), M: new Set(), X: new Set() };
for (const m of all.matchAll(/\*\*(R16-\d+\.\d+) /g)) defs.R.add(m[1]);
for (const m of all.matchAll(/式：(A16-\d+\.\d+) /g)) defs.A.add(m[1]);
for (const m of all.matchAll(/^- (S16-\d+)：/gm)) defs.S.add(m[1]);
for (const m of all.matchAll(/^\| (C16-\d+|Q16-\d+|M16-\d+|X16-\d+) \|/gm)) defs[m[1][0]].add(m[1]);
const dangling = [];
for (const m of all.matchAll(/\b([RASCQMX])16-\d+(\.\d+)?/g)) if (!defs[m[1]].has(m[0])) dangling.push(m[0]);
const seqOk = k => { const ns = [...defs[k]].map(s => +s.split('-')[1]).sort((a, b) => a - b); return ns.every((v, i) => v === i + 1); };
const seqBad = ['S', 'C', 'Q', 'M', 'X'].filter(k => !seqOk(k));
const cn = '零一二三四五六七八九十';
const volFiles = readdirSync(DIR).filter(f => /^卷.*\.md$/.test(f));
const titles = new Map();
for (const f of volFiles) {
  const vol = f.split('-')[0];
  const m = new Map();
  for (const l of readFileSync(DIR + f, 'utf8').split('\n')) {
    const h = l.replace(/\r$/, '').match(/^#{2,3} §?(\d+A?(?:\.\d+)?)[ ．.]\s*(.+)$/) || l.replace(/\r$/, '').match(/^## §(\d+A?) (.+)$/);
    if (h && !m.has(h[1])) m.set(h[1], h[2].trim());
  }
  titles.set(vol, m);
}
const pending = {
  '卷十七': { '4.6': '路途风险律' },
  '卷二十二': { '4.2': '知情来源与通道', '4.3': '推断、belief、credence', '4.4': '传闻与失真表' },
  '卷二十三': { '4.6': '传奇推广与升级' },
  '卷二十四': { '4.2': '事件类型注册表', '4.3': '脉冲式加权抽取', '4.5': '委托与任务生成' },
  '卷二十八': { '4.4': '加载校验流水线与报错码' },
};
const balanced = (s, i) => { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '（') d++; else if (s[j] === '）') { d--; if (d === 0) return s.slice(i + 1, j); } } return null; };
const refBad = []; let refCount = 0;
const refRe = new RegExp(`(卷[${cn}]+[甲乙b]?) §(\\d+A?(?:\\.\\d+)?)`, 'g');
lines.forEach((l, i) => {
  if (/^\| 19 \| 全卷引用/.test(l)) return;
  for (const m of l.matchAll(refRe)) {
    if (m[1] === '卷十六') continue;
    refCount++;
    const after = l.slice(m.index + m[0].length);
    if (!after.startsWith('（')) { refBad.push(`${i + 1}:${m[0]} 无标题`); continue; }
    const t = balanced(l, m.index + m[0].length);
    if (t === null) { refBad.push(`${i + 1}:${m[0]} 括号不配`); continue; }
    const norm = s => s.replace(/\s+/g, '');
    if (pending[m[1]]) { const want = pending[m[1]][m[2]]; if (!want || norm(want) !== norm(t)) refBad.push(`${i + 1}:${m[0]}（${t}）≠台账`); continue; }
    const real = titles.get(m[1])?.get(m[2]);
    if (!real) { refBad.push(`${i + 1}:${m[0]} 原卷无此节`); continue; }
    if (!norm(real).startsWith(norm(t))) refBad.push(`${i + 1}:${m[0]}（${t}）≠「${real.slice(0, 30)}」`);
  }
});
report(`8 编号引用不悬空且连续；跨卷章节引用处处带标题且与原卷相符（${refCount} 处）`, dangling.length === 0 && seqBad.length === 0 && refBad.length === 0, uniq(dangling).join(' ') + ' ' + seqBad.join('') + ' ' + uniq(refBad).slice(0, 12).join(' ; '));

// 9 错误码、入口、规则表键、抽取点、维度落实
const codes = sub(/^### 2\.8 /).filter(l => /^\| E-BST-/.test(l)).map(l => cells(l)[0]);
const sec4 = sec(/^## §4 /).join('\n');
const sec3 = sec(/^## §3 /).join('\n');
const codeUnused = codes.filter(c => all.split(c).length - 1 < 2 && !['E-BST-TIER-ROWS', 'E-BST-WARD-SHAPE', 'E-BST-LAIR', 'E-BST-TRANSFORM-ROWS'].includes(c));
const entryNames = uniq([...sub(/^### 3\.1 /), ...sub(/^### 3\.2 /)].filter(l => /^\| `/.test(l)).flatMap(l => [...cells(l)[0].matchAll(/`([A-Za-z]+)(?:\(|`)/g)].map(m => m[1])));
const entryUnused = entryNames.filter(e => !sec4.includes('`' + e + '`'));
const hooks = sub(/^### 3\.3 /).filter(l => /^\| `on[A-Z]|^\| `transformYear/.test(l)).map(l => ticks(cells(l)[0])[0]);
const hookUnused = hooks.filter(h => !sec4.includes('`' + h + '`'));
const keyRows = sub(/^### 2\.5 /).filter(l => /^\| `/.test(l));
const keyUnused = [];
for (const l of keyRows) {
  const ks = ticks(cells(l)[0]);
  const used = ks.some(k => { const base = k.replace(/\.\{.*$/, '').replace(/\.\*$/, ''); return sec4.includes(base) || sec3.includes(base) || sub(/^### 2\.[2367] /).join('\n').includes(base); });
  if (!used) keyUnused.push(ks[0]);
  if (!/R16-|§/.test(cells(l)[2])) keyUnused.push(ks[0] + ':无用处');
}
const sites = sub(/^### 2\.7 /).filter(l => /^\| `stream\./.test(l)).map(l => ticks(cells(l)[1])[0]);
const siteUnused = sites.filter(s => !sec4.includes(s));
const dims = sub(/^### 2\.3 /).filter(l => /^\| (species|person|material|knowledge)/.test(l)).map(l => ticks(cells(l)[1])[0]);
const dimUnused = dims.filter(d => !sec4.includes('`' + d + '`'));
// 卷十六二审 11-13：Q16-4 裁定要求事件计数器，第二版只新增 `state.bestiary.named` 一个键；锚点照现文——§2.6 声明恰此一键、全文 state.bestiary 下不出现第二个键、§3.3 声明其写者
const noState = sub(/^### 2\.6 /).join('\n').includes('本卷只新增一个运行态键 `state.bestiary.named`') && [...all.matchAll(/state\.bestiary\.([A-Za-z_]+)/g)].every(m => m[1] === 'named') && sec3.includes('`state.bestiary.named`');
report(`9 错误码、入口、钩子、规则表键、抽取点、维度落实（码 ${codes.length}、入口 ${entryNames.length}、钩子 ${hooks.length}、规则表键行 ${keyRows.length}、抽取点 ${sites.length}、维度 ${dims.length}）`,
  codes.length >= 10 && codeUnused.length === 0 && entryUnused.length === 0 && hookUnused.length === 0 && keyUnused.length === 0 && siteUnused.length === 0 && dimUnused.length === 0 && noState,
  [codeUnused.join(','), entryUnused.join(','), hookUnused.join(','), keyUnused.join(','), siteUnused.join(','), dimUnused.join(','), noState ? '' : '运行态声明'].join(' | '));

// 10 红线
const red = [];
if (!lines.slice(0, 6).some(l => l.includes('不派任何实现卡') && l.includes('不改任何别卷'))) red.push('卷首声明');
lines.forEach((l, i) => {
  if (/÷/.test(l) && !/除数|不做除法|常数一万/.test(l)) red.push(`${i + 1}:除法无下界说明`);
  if (/Date\.now|墙钟/.test(l) && !/不读墙钟|读墙钟、|读墙钟，/.test(l)) red.push(`${i + 1}:墙钟`);
  if (/node -e|python -c/.test(l)) red.push(`${i + 1}:单行解释器`);
});
if (!all.includes('本卷不写任何身体状态')) red.push('身体状态声明');
if (!/S16-5：[^\n]*state\.statuses/.test(all)) red.push('S16-5');
if (!all.includes('E-BST-BODY-WRITE')) red.push('BODY-WRITE');
if (!/S16-4：[^\n]*是不是怪物/.test(all)) red.push('S16-4');
if (!/S16-8：[^\n]*Math\.random/.test(all)) red.push('S16-8');
if (!/S16-12：[^\n]*委托/.test(all)) red.push('S16-12');
if (!/S16-2：[^\n]*名字的任何一个字/.test(all)) red.push('S16-2');
if (!/S16-10：[^\n]*首领标记/.test(all)) red.push('S16-10');
// 物种生成阶段：after 自然量、before 开户
// 卷十六二审 11-13：一审 T8 后 after 改为水体、天气、矿物三阶段（深潭、地下群落须先在），锚点照现文
if (!/"gstage_bestiary": \{"phase": "worldgen", "scope": "world", "after": \["gstage_water", "gstage_weather", "gstage_geology"\], "before": \["gstage_stocks"\]/.test(all)) red.push('gstage 条目');
report('10 红线：不派实现、不改别卷、不读墙钟、除数有下界、身体状态只经卷二十一、无怪物标记分支、不读名字、不另立委托、物种阶段登记', red.length === 0, red.slice(0, 8).join(' '));

// 11 算术复算与计数对账
const ar = [];
const need = (cond, text, tag) => { if (!cond) ar.push(tag); if (!all.includes(text)) ar.push(tag + '文本'); };
need(Math.floor(540 / 45) === 12, '`floor(540 ÷ 45) = 12`', '头数');
need(12 * 2000 * 2 * 50 * 10000 / 4000000 === 6000, '`lambdaBps = 12 × 2000 × 2 × 50 × 10000 ÷ 4000000 = 6000`', 'lambda');
need(5000 * 12000 / 10000 === 6000, '`approachBps = 5000 × 12000 ÷ 10000 = 6000`', 'approach');
need(6000 * 6000 / 10000 === 3600, '`meetBps = 6000 × 6000 ÷ 10000 = 3600`', 'meet');
need(8000 * 5000 / 10000 === 4000, '`8000 × 5000 ÷ 10000 = 4000`', '辟邪');
need(Math.floor(300 * 10000 / 400) === 7500, '`300 × 10000 ÷ 400 = 7500`', '相似比');
need(Math.floor(1 * 10000 / 3) === 3333, '`1 × 10000 ÷ 3 = 3333`', '相似重合');
need(Math.floor((7500 * 5000 + 3333 * 3000 + 10000 * 2000) / 10000) === 6749, '`(7500 × 5000 + 3333 × 3000 + 10000 × 2000) ÷ 10000 = 6749`', '相似度');
need(2400 * 3 === 7200 && Math.floor(7200 / 10000) === 0, '`n = floor(7200 ÷ 10000) = 0`', '存量转化');
const aRows = sub(/^### 0\.3 /).filter(l => /^\| \d+\.\d+ /.test(l)).length;
if (aRows !== 9) ar.push(`A表${aRows}`);
const bLine = sub(/^### 0\.3 /).find(l => l.startsWith('B 表主归本卷 6 行')) ?? '';
const bCount = [...bLine.matchAll(/（§4\.\d+）/g)].length;
if (bCount !== 6) ar.push(`B表${bCount}`);
if (defs.X.size < 8) ar.push(`§6=${defs.X.size}`);
const matrix = sub(/^### 5\.4 /).filter(l => /^\| [a-z]+ \| `simform_/.test(l)).length;
const sysKeys = ['bestiary', 'lore', 'lair', 'transform'];
if (matrix !== sysKeys.length) ar.push(`矩阵${matrix}`);
for (const k of sysKeys) if (!sub(/^### 5\.4 /).some(l => l.startsWith(`| ${k} |`))) ar.push('矩阵缺' + k);
// 条款里写的个数与表对账
if (codes.length !== 13 || !all.includes('十三个错误码')) ar.push(`错误码数${codes.length}`);
const famRows = sub(/^### 2\.2 /).filter(l => /^\| `[a-z]+`（`[a-z]+_`）/.test(l)).length;
if (famRows !== 5 || !all.includes('五个族前缀')) ar.push(`族数${famRows}`);
const verbKeys = (keyRows.find(l => l.includes('roles.verbs')) ?? '').match(/\{([^}]*)\}/)?.[1].split(',').length;
if (verbKeys !== 5 || !all.includes('五个事件动词')) ar.push(`动词数${verbKeys}`);
report(`11 算术复算与计数对账（路遇例、辟邪例、相似度例、存量转化例、卷零 9+6 行、§6 ${defs.X.size} 条、矩阵 ${matrix} 行、错误码 ${codes.length}、族 ${famRows}、动词 ${verbKeys}）`, ar.length === 0, ar.join(' '));

// 12 接口表、配合项、迁移清单、五款游戏、待补清单、素材位置落实
const io = [];
for (const h of ['### 5.1 本卷提供', '### 5.2 本卷读取', '### 5.3 需别卷配合的事项', '### 5.4 ']) if (!lines.some(l => l.startsWith(h))) io.push(h);
for (const g of ['DF', 'CDDA', 'RW', 'CK3', 'EVE']) if (!sub(/^### 0\.4 /).some(l => l.startsWith(`| ${g} |`))) io.push(g);
const todo = sec(/^## 附录 待补清单/).filter(l => /^\| \d+ \|/.test(l)).length;
if (todo < 8) io.push(`待补${todo}`);
const spots = ['monsters.json', 'bosses.json', 'remote-generation.mjs:146', 'remote-generation.mjs:149', ':109–111', 'monster-society.mjs:27', 'monster-society.mjs:75', ':352', ':360', ':376', 'monster-society.mjs:162', ':171', ':184', ':296', 'monster-society.mjs:166', ':232', ':321', 'standing.mjs:25', ':61', 'quest-wildlife.mjs:20', 'quest-board.mjs:103', ':105', ':260', 'quest-board.mjs:28', 'creature-nature.mjs:9', 'boss-abilities.mjs', 'boss-cognition.mjs', 'boss-negotiation.mjs', 'boss-migration.mjs', 'wildlife.mjs', 'wildlife-society.mjs', 'wildlife-awakening.mjs', 'npc-intelligence.mjs', 'tribal-awakening.mjs', 'interactions.mjs', 'population.mjs', 'rules.json', 'world/drafts/yaoguai', 'tag-11.json:28', 'world/design/monster-society-1/2/3.mjs', 'species.json'];
const sec7 = sec(/^## §7 /).join('\n');
const spotMiss = spots.filter(s => !sec7.includes(s));
if (spotMiss.length) io.push('素材位置缺:' + spotMiss.join(','));
// 每个配合项、迁移行的出处列非空
for (const l of sub(/^### 5\.3 /).filter(l => /^\| C16-/.test(l))) if (!/R16-|§/.test(cells(l)[3] ?? '')) io.push(cells(l)[0] + ':无出处');
report(`12 接口表、配合项（${defs.C.size} 项）、迁移清单（${defs.M.size} 行）、五款游戏、待补清单（${todo} 条）、素材位置落实`, io.length === 0, io.join(' '));

// 13 关键条文在位
// 卷十六二审 11-13：照现文换三条锚点——R16-2.2 标题按 Q16-3 改为“首领拆成四样”；“本卷不新增运行态键”按 Q16-4 改为只新增一键（旧锚点只靠修订记录里的引文命中，属失效锚点）；§8 四条待定已裁，“须李白定”改认“已定（李白 11-13）”
const must = ['怪物不是一类东西，是物种表里的行', '没有“怪物”这个标记', '首领拆成四样，不是实体类', '档不是稀缺度', '真假是读数，不是字段', '真相层就是事实本身', '两边用同一族标签', '过不来的事不在这里', '本卷不生成委托', '宁合不拆', '四个说法是显示归类', '生成槽给意图，其余推出来', '变体 = 模板套在原种上的继承行', '觉醒是补职位', '收容失效是前提失效', '本卷只新增一个运行态键', '材料属性', '意图', '已定（李白 11-13）'];
const mustMiss = must.filter(s => !all.includes(s));
report(`13 关键条文在位（${must.length} 条）`, mustMiss.length === 0, mustMiss.join(' '));

const ruleCount = defs.R.size;
const liBai = sec(/^## §8 /).filter(l => l.includes('**须李白定**')).length;
console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleCount}；断言 ${defs.A.size}；扫描条 ${defs.S.size}；配合项 ${defs.C.size}；开放问题 ${defs.Q.size}（须李白定 ${liBai}）；迁移行 ${defs.M.size}；枚举 ${enumCount} 个、值 ${enumVals} 个；错误码 ${codes.length}；规则表键行 ${keyRows.length}；数据实例 ${instTotal}；待补清单 ${todo} 条；失败项 ${fails}`);
process.exitCode = fails ? 1 : 0;
