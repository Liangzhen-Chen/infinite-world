// 卷十五 自检脚本（只读成稿，逐项输出 PASS/FAIL）
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷十五/check-卷十五.mjs [成稿路径]
import { readFileSync, readdirSync } from 'node:fs';
const DIR = 'F:/dnd/docs/统一底层设计/';
const path = process.argv[2] ?? DIR + '卷十五-法术与超自然.md';
const all0 = readFileSync(path, 'utf8').split('\n').map(l => l.replace(/\r$/, ''));
const cutAt = all0.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cutAt >= 0 ? all0.slice(0, cutAt) : all0;
let fails = 0;
const report = (name, ok, detail = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + String(detail).slice(0, 600) : '')); };
const N = 17;

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
// 卷十五二审 11-13：锚点随第二版三段式卷首模型行更新（现文第 3 行原样）
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
    if (!l) asr.push(`4.${n}:${k}`); else if (!l.startsWith(`- ${k}：A15-${n}.${i + 1} `)) asr.push(`4.${n}:${k}编号`);
  });
}
report('4 验收断言三式齐全且编号规整', asr.length === 0, asr.join(','));

// 5 无具体 id 字面量（实体 id 前缀加下划线；旧代码文件名与类型名除外）
const idRe = /\b(item|mat|npc|creature|loc|spell|lore|deity|faith|org|species|status|skill|profession|office|culture|etype|recipe|plant|polity|offense|facility|site|player)_[a-z0-9_]+/g;
const idAllow = new Set(['status_family', 'status_target', 'status_source', 'event_type', 'facility_type', 'species_view']);
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) if (!idAllow.has(m[0])) idHits.push(`${i + 1}:${m[0]}`); });
report('5 正文无具体 id 字面量（含数据实例）', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名
const bad6 = [];
lines.forEach((l, i) => {
  for (const t of ticks(l)) {
    const pure = /^[^\s(（=×÷+<>,，、:：]+$/.test(t);
    // 文档记法（快照路径、编号格式说明）不是代号，不计
    if (pure && cjk.test(t) && !/\.md$/.test(t) && !/^[RASCQMX]15-/.test(t)) bad6.push(`${i + 1}:${t}`);
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
report(`6 无用于判断的描述性文本；纯代号无中文；枚举值 ASCII 且带中英显示名（枚举 ${enumCount} 个、值 ${enumVals} 个）`, bad6.length === 0 && badEnum.length === 0 && enumCount === 8, bad6.slice(0, 6).join(' ') + ' ' + badEnum.join(' '));

// 7 台账各概念写全
const ledger = {
  1: ['法术本体与效果注册表', ['知识表', '效果族', 'familyRows', '术式实例', 'X-02']],
  2: ['子域统一入口', ['子域不是模块', 'effclass']],
  3: ['交互与综合征统一格式', ['交互行', '综合征不另立格式', 'ixRows']],
  4: ['施法同意', ['条款行', 'consent()', '监护']],
  5: ['研究、学习、召唤', ['研究对象类型', '召唤', '供养', 'X-03']],
  6: ['法术体系按文化变体', ['流派', 'culturePref']],
  7: ['仪式动作形状与阈限', ['形制', '阈限', '克制', '效力']],
  8: ['超自然生灵六轴类型学', ['本源', '形态', '依附', '驱力', '能力', '规矩', 'X-11']],
  9: ['附身、诅咒、契约、婚配、报恩、镇压超度', ['附身', '诅咒', '契约', '婚配', '报恩', '镇压', '超度']],
  10: ['亡者、阴间、亡魂、鬼魂', ['去向行', '阴间', '亡魂', '无名']],
  11: ['死灵', ['起尸', '借尸还魂']],
  12: ['法器、文物、神器', ['comp_relic', '附魔', '成精', '宣称']],
  13: ['神金与超自然材料', ['神金', 'comp_arcane', '炭质', 'X-35']],
  14: ['超自然身体改造（筑基、换骨、傀儡）', ['筑基', '换骨', '傀儡', 'tissueOverride']],
  15: ['传送与秘境分层地点', ['传送', '秘境', '层根', 'move']],
  16: ['门派、灵脉、突破、天劫', ['门派', '灵脉', '突破', '天劫']],
  17: ['法术经济', ['priceFor', '服务条目']],
};
const led = [];
for (let n = 1; n <= N; n++) {
  const [title, kws] = ledger[n];
  if (!lines.includes(`### 4.${n} ${title}`)) led.push(`4.${n} 标题`);
  const body = sub(new RegExp(`^### 4\\.${n} `)).join('\n');
  for (const k of kws) if (!body.includes(k)) led.push(`4.${n}:${k}`);
  const rs = [...body.matchAll(new RegExp(`\\*\\*R15-${n}\\.(\\d+) `, 'g'))].map(m => +m[1]);
  if (rs.length < 5 || rs.some((v, i) => v !== i + 1)) led.push(`4.${n}:规则编号${rs.join('.')}`);
}
for (const x of ['X-02', 'X-03', 'X-11', 'X-12', 'X-31', 'X-35']) if (!all.includes(x)) led.push(x);
report('7 台账各概念写全（十七节标题、台账裁定编号、关键概念、每节有规则且编号连续）', led.length === 0, led.join(' '));

// 8 编号引用不悬空且连续；跨卷章节引用处处带标题且与原卷标题相符
const defs = { R: new Set(), A: new Set(), S: new Set(), C: new Set(), Q: new Set(), M: new Set(), X: new Set() };
for (const m of all.matchAll(/\*\*(R15-\d+\.\d+) /g)) defs.R.add(m[1]);
for (const m of all.matchAll(/式：(A15-\d+\.\d+) /g)) defs.A.add(m[1]);
for (const m of all.matchAll(/^- (S15-\d+)：/gm)) defs.S.add(m[1]);
for (const m of all.matchAll(/^\| (C15-\d+|Q15-\d+|M15-\d+|X15-\d+) \|/gm)) defs[m[1][0]].add(m[1]);
const dangling = [];
for (const m of all.matchAll(/\b([RASCQMX])15-\d+(\.\d+)?/g)) if (!defs[m[1]].has(m[0])) dangling.push(m[0]);
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
const pending = { '卷十六': { '4.5': '克制与辟邪双边标签', '4.9': '夜生物', '4.14': '异象与收容' }, '卷二十二': { '4.2': '知情来源与通道', '4.9': '研究与创新机制', '4.10': '知识持有与失传' }, '卷二十三': { '4.7': '文物的唯一性与名气加成' }, '卷二十四': { '4.2': '事件类型注册表' }, '卷十七': { '4.1': '行程合成（距离、速度、钟点）' } };
const balanced = (s, i) => { let d = 0; for (let j = i; j < s.length; j++) { if (s[j] === '（') d++; else if (s[j] === '）') { d--; if (d === 0) return s.slice(i + 1, j); } } return null; };
const refBad = []; let refCount = 0;
const refRe = new RegExp(`(卷[${cn}]+[甲乙b]?) §(\\d+A?(?:\\.\\d+)?)`, 'g');
lines.forEach((l, i) => {
  if (/^\| 13 \| 全卷引用/.test(l)) return;
  for (const m of l.matchAll(refRe)) {
    if (m[1] === '卷十五') continue;
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
report(`8 编号引用不悬空且连续；跨卷章节引用处处带标题且与原卷相符（${refCount} 处）`, dangling.length === 0 && seqBad.length === 0 && refBad.length === 0, uniq(dangling).join(' ') + ' ' + seqBad.join('') + ' ' + refBad.slice(0, 10).join(' ; '));

// 9 错误码、入口、规则表键、状态键与写者、抽取点落实
const codes = sub(/^### 2\.8 /).filter(l => /^\| E-ARC-/.test(l)).map(l => cells(l)[0]);
const codeUnused = codes.filter(c => all.split(c).length - 1 < 2 && !['E-ARC-RITE-SHAPE', 'E-ARC-LIMINAL', 'E-ARC-IX-ROW', 'E-ARC-WORKING', 'E-ARC-FATE-ROWS', 'E-ARC-FAMILY-CLASS'].includes(c));
const entryNames = uniq([...sub(/^### 3\.1 /), ...sub(/^### 3\.2 /)].filter(l => /^\| `/.test(l)).flatMap(l => [...cells(l)[0].matchAll(/`([A-Za-z]+)(?:\(|`)/g)].map(m => m[1])));
const sec4 = sec(/^## §4 /).join('\n');
const entryUnused = entryNames.filter(e => !sec4.includes('`' + e + '`'));
const keyRows = sub(/^### 2\.5 /).filter(l => /^\| `/.test(l));
const keys = keyRows.flatMap(l => ticks(cells(l)[0]));
const keyUnused = [];
for (const l of keyRows) {
  const ks = ticks(cells(l)[0]);
  const used = ks.some(k => { const base = k.replace(/\.\{.*$/, '').replace(/\.\*$/, ''); return sec4.includes(base) || sec(/^## §3 /).join('\n').includes(base) || sub(/^### 2\.[467] /).join('\n').includes(base); });
  if (!used) keyUnused.push(ks[0]);
  if (!/R15-|§/.test(cells(l)[2])) keyUnused.push(ks[0] + ':无用处');
}
const stateKeys = sub(/^### 2\.6 /).filter(l => /^\| `state\./.test(l)).map(l => ({ key: ticks(cells(l)[0])[0].replace(/\[.*$/, ''), writer: cells(l)[2] }));
const sec33 = sub(/^### 3\.3 /).join('\n');
const stateBad = stateKeys.filter(s => !/\.mjs/.test(s.writer) || !sec33.includes('`' + s.key + '`'));
const sites = sub(/^### 2\.7 /).filter(l => /^\| `stream\./.test(l)).map(l => ticks(cells(l)[1])[0]);
const siteUnused = sites.filter(s => !sec4.includes(s));
report(`9 错误码、入口、规则表键、状态键与写者、抽取点落实（码 ${codes.length}、入口 ${entryNames.length}、规则表键行 ${keyRows.length}、状态键 ${stateKeys.length}、抽取点 ${sites.length}）`,
  codes.length >= 10 && codeUnused.length === 0 && entryUnused.length === 0 && keyUnused.length === 0 && stateBad.length === 0 && stateKeys.length === 3 && siteUnused.length === 0,
  [codeUnused.join(','), entryUnused.join(','), keyUnused.join(','), stateBad.map(s => s.key).join(','), siteUnused.join(',')].join(' | '));

// 10 红线
const red = [];
if (!lines.slice(0, 6).some(l => l.includes('不派任何实现卡') && l.includes('不改任何别卷'))) red.push('卷首声明');
lines.forEach((l, i) => {
  if (/÷/.test(l) && !/除数|不做除法|常数一万|下限 1/.test(l)) red.push(`${i + 1}:除法无下界说明`);
  if (/Date\.now|墙钟/.test(l) && !/不读墙钟|读墙钟、|读墙钟，/.test(l)) red.push(`${i + 1}:墙钟`);
  if (/node -e|python -c/.test(l)) red.push(`${i + 1}:单行解释器`);
});
if (!all.includes('本卷不写任何身体状态')) red.push('身体状态声明');
if (!/S15-5：[^\n]*state\.statuses/.test(all)) red.push('S15-5');
if (!all.includes('E-ARC-BODY-WRITE')) red.push('BODY-WRITE');
if (!/S15-12：[^\n]*法律只产生后果/.test(all)) red.push('S15-12');
if (!/S15-10：[^\n]*价格/.test(all)) red.push('S15-10');
if (!/S15-13：[^\n]*物品代号/.test(all)) red.push('S15-13');
if (!/S15-8：[^\n]*Math\.random/.test(all)) red.push('S15-8');
report('10 红线：不派实现、不改别卷、不读墙钟、除数有下界、身体状态只经卷二十一、无生命值写入、法律不拦、不写价格乘数、耗材不点名', red.length === 0, red.slice(0, 8).join(' '));

// 11 算术复算与计数对账
const ar = [];
if (8000 * 5000 / 10000 !== 4000 || 4000 * 13000 / 10000 !== 5200) ar.push('效力');
if (!all.includes('`8000 × 5000 ÷ 10000 = 4000`') || !all.includes('`4000 × 13000 ÷ 10000 = 5200`')) ar.push('效力文本');
if (Math.ceil(360 / 1) !== 360 || !all.includes('ceil(360 ÷ 1)')) ar.push('封印');
const aRows = sub(/^### 0\.3 /).filter(l => /^\| \d+\.\d+ /.test(l)).length;
if (aRows !== 12) ar.push(`A表${aRows}`);
const bLine = sub(/^### 0\.3 /).find(l => l.startsWith('B 表主归本卷 8 行')) ?? '';
const bCount = [...bLine.matchAll(/（§4\.\d+）/g)].length;
if (bCount !== 8) ar.push(`B表${bCount}`);
if (defs.X.size < 8) ar.push(`§6=${defs.X.size}`);
const matrix = sub(/^### 5\.4 /).filter(l => /^\| [a-z]+ \| `simform_/.test(l)).length;
// 卷十五二审 11-13：第二版按 T9 新增 aether、relic 两个系统键，矩阵 5→7 行，键表同步补两项
if (matrix !== 7) ar.push(`矩阵${matrix}`);
const sysKeys = ['arcana', 'aether', 'relic', 'interaction', 'working', 'rite', 'shade'];
for (const k of sysKeys) if (!sub(/^### 5\.4 /).some(l => l.startsWith(`| ${k} |`))) ar.push('矩阵缺' + k);
report(`11 算术复算与计数对账（效力例、封印例、卷零 12+8 行、§6 ${defs.X.size} 条、矩阵 ${matrix} 行）`, ar.length === 0, ar.join(' '));

// 12 接口表、配合项、迁移清单、五款游戏、待补清单、素材位置落实
const io = [];
for (const h of ['### 5.1 本卷提供', '### 5.2 本卷读取', '### 5.3 需别卷配合的事项', '### 5.4 ']) if (!lines.some(l => l.startsWith(h))) io.push(h);
for (const g of ['DF', 'CDDA', 'RW', 'CK3', 'EVE']) if (!sub(/^### 0\.4 /).some(l => l.startsWith(`| ${g} |`))) io.push(g);
const todo = sec(/^## 附录 待补清单/).filter(l => /^\| \d+ \|/.test(l)).length;
if (todo < 8) io.push(`待补${todo}`);
const spots = ['magic.mjs:164', 'magic-marks.mjs:15', 'magic-object.mjs:40', 'magic-status.mjs:6、:34–36', 'magic-care.mjs:167', 'magic-consent.mjs:98、:107', 'magic-context.mjs:26', 'magic-light.mjs:73、:203、:309', 'magic-message.mjs:19、:37、:90、:228', 'magic-mind-space.mjs:319', 'magic-movement.mjs:97', 'magic-object.mjs:168、:170', 'action-rite.mjs:81', 'action-consent.mjs:10、:128', 'learning.mjs:57、:92、:128', 'activities.mjs:232、:241、:297', 'spell-research.mjs', 'summons.mjs', 'magic-economy.mjs', 'interactions.mjs', 'spells.json', 'registerMagicEffect'];
const sec7 = sec(/^## §7 /).join('\n');
const spotMiss = spots.filter(s => !sec7.includes(s));
if (spotMiss.length) io.push('素材位置缺:' + spotMiss.join(','));
report(`12 接口表、配合项（${defs.C.size} 项）、迁移清单（${defs.M.size} 行）、五款游戏、待补清单（${todo} 条）、素材位置落实`, io.length === 0, io.join(' '));

// 13 关键条文在位
const must = ['超自然不另立物理', '本卷不另建效果注册表', '综合征不另立格式', '处境只派生不存', '起尸不是复生', '法器是物品加组件', '超自然说的是来历，不是成分', '层是地点树上的一棵子树', '灵脉是存量', '境界是凭证，突破是仪式', '定价只经卷六的入口', '神力与法术是两套来源', '材料属性', '意图', '须李白定'];
const mustMiss = must.filter(s => !all.includes(s));
report(`13 关键条文在位（${must.length} 条）`, mustMiss.length === 0, mustMiss.join(' '));

const ruleCount = defs.R.size;
const liBai = sec(/^## §8 /).filter(l => l.includes('**须李白定**')).length;
const instCount = instTotal;
console.log(`行数 ${lines.length}；子系统 ${N}；规则条数 ${ruleCount}；断言 ${defs.A.size}；扫描条 ${defs.S.size}；配合项 ${defs.C.size}；开放问题 ${defs.Q.size}（须李白定 ${liBai}）；迁移行 ${defs.M.size}；枚举 ${enumCount} 个、值 ${enumVals} 个；错误码 ${codes.length}；规则表键行 ${keyRows.length}；数据实例 ${instCount}；待补清单 ${todo} 条；失败项 ${fails}`);
process.exitCode = fails ? 1 : 0;
