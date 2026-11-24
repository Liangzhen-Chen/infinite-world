// 卷十四自检脚本（只读成稿与一个源码文件，不写任何文件）。用法：node check-卷十四.mjs [成稿路径]
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷十四-职业技能与学艺.md';
const raw = readFileSync(path, 'utf8');
const cut = raw.indexOf('## 附录 自检脚本输出');
const text = cut >= 0 ? raw.slice(0, cut) : raw;
const lines = text.split(/\r?\n/);
let failed = 0;
const out = [];
const check = (name, ok, detail = '') => { if (!ok) failed++; out.push(`${ok ? '通过' : '失败'}  ${name}${detail ? '  ' + detail : ''}`); };

// ---- 切分章节 ----
const h2 = [];
lines.forEach((l, i) => { if (/^## /.test(l)) h2.push({ title: l.slice(3).trim(), start: i }); });
h2.forEach((h, k) => { h.end = k + 1 < h2.length ? h2[k + 1].start : lines.length; });
const sec = prefix => h2.find(h => h.title.startsWith(prefix));
const body = h => (h ? lines.slice(h.start, h.end) : []);

// 1 §0–§8 与附
for (const p of ['§0', '§1', '§2', '§3', '§4', '§5', '§6', '§7', '§8', '附 术语与代号表']) check(`章节 ${p}`, Boolean(sec(p)));
check('附录 自检脚本输出', cut >= 0);

// 2 子系统与 6 小节
const s4 = body(sec('§4'));
const subs = [];
s4.forEach((l, i) => { const m = /^### 4\.(\d+) (.+)$/.exec(l); if (m) subs.push({ n: Number(m[1]), title: m[2], start: i }); });
subs.forEach((s, k) => { s.end = k + 1 < subs.length ? subs[k + 1].start : s4.length; s.lines = s4.slice(s.start, s.end); });
check('子系统数 = 12 且编号连续', subs.length === 12 && subs.every((s, k) => s.n === k + 1), `实得 ${subs.length}`);
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const part = (s, k) => {
  const idx = s.lines.findIndex(l => l.startsWith(`#### 4.${s.n}.${k} `));
  if (idx < 0) return null;
  let end = s.lines.findIndex((l, i) => i > idx && /^#### /.test(l));
  if (end < 0) end = s.lines.length;
  return s.lines.slice(idx, end);
};
const TAGS = ['〔西陲〕', '〔非西陲〕', '〔非人类〕', '〔超自然〕'];
let instanceTotal = 0, ruleTotal = 0;
for (const s of subs) {
  const heads = six.map((w, k) => { const p = part(s, k + 1); return p && p[0].includes(w); });
  check(`4.${s.n} 六小节齐全且顺序正确`, heads.every(Boolean), heads.map((v, k) => (v ? '' : '缺' + six[k])).join(''));
  const inst = (part(s, 5) ?? []).filter(l => TAGS.some(t => l.includes(t)));
  instanceTotal += inst.length;
  const joined = inst.join('\n');
  check(`4.${s.n} 数据实例 ≥3、含非西陲、含非人类或超自然`, inst.length >= 3 && joined.includes('〔非西陲〕') && (joined.includes('〔非人类〕') || joined.includes('〔超自然〕')), `实例 ${inst.length} 条`);
  const asr = part(s, 6) ?? [];
  const has = w => asr.some(l => l.startsWith(`- ${w}`));
  check(`4.${s.n} 断言含扫描式、不变量式、扩展性式`, has('扫描式') && has('不变量式') && has('扩展性式'));
  const rules = (part(s, 3) ?? []).filter(l => /^- \*\*[A-Z]{2}-\d+ /.test(l));
  ruleTotal += rules.length;
  check(`4.${s.n} 规则条数 ≥5`, rules.length >= 5, `${rules.length} 条`);
}

// 3 可扫描正文：排除 §1（现状）、各数据实例小节、§7（旧代码引述）；词表条目代号另排除卷末代号表
const scanned = [], scannedNoGloss = [];
for (const h of h2) {
  if (h.title.startsWith('§1') || h.title.startsWith('§7')) continue;
  let skip = false;
  for (let i = h.start; i < h.end; i++) {
    const l = lines[i];
    if (/^#### 4\.\d+\.5 /.test(l)) skip = true; else if (/^#{2,4} /.test(l)) skip = false;
    if (!skip) { scanned.push({ i: i + 1, l }); if (!h.title.startsWith('附 ')) scannedNoGloss.push({ i: i + 1, l }); }
  }
}
const ID = /(?<![A-Za-z0-9_.])(item|mat|species|flora|body|npc|creature|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod)_[a-z0-9]+(?:_[a-z0-9]+)*/g;
const ALLOW = new Set(['body_plan', 'body_part', 'status_family', 'status_target', 'law_code', 'facility_type', 'skill_record']);
const idHits = [];
for (const { i, l } of scannedNoGloss) for (const m of l.matchAll(ID)) if (!ALLOW.has(m[0])) idHits.push(`${i}:${m[0]}`);
check('规则与表格正文无具体实体 id 字面量', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 3b 本卷词表族的条目代号不得出现在规则与表格正文
const VOC = /(?<![A-Za-z0-9_])(service|ptier|sband|lsrc|cert|deed|lapse|lstyle|perk|secrecy|school|trefuse)_[a-z0-9]+(?:_[a-z0-9]+)*/g;
const VALLOW = new Set(['deed_role', 'deed_field']);
const vHits = [];
for (const { i, l } of scannedNoGloss) for (const m of l.matchAll(VOC)) if (!VALLOW.has(m[0])) vHits.push(`${i}:${m[0]}`);
check('规则与表格正文无本卷词表条目代号', vHits.length === 0, vHits.slice(0, 10).join(' '));

// 4 用于判断的自然语言文本：不得出现对中文字面量的正则、相等、包含判断
const CJK = '[\\u4e00-\\u9fff]';
const TEXTJUDGE = [
  new RegExp(`/[^/\\s]*${CJK}[^/]*/\\s*\\.test`),
  new RegExp(`(===|!==|==|!=)\\s*['"][^'"]*${CJK}`),
  new RegExp(`\\.(includes|startsWith|endsWith|indexOf|match|test)\\(\\s*['"/][^)]*${CJK}`),
  /contextReason\s*[=.(]/,
];
const tjHits = scanned.filter(({ l }) => TEXTJUDGE.some(r => r.test(l))).map(x => x.i);
check('正文无读中文或英文描述文本作判断的写法', tjHits.length === 0, tjHits.join(','));
// 英文描述文本判断：RX 里出现对带空格英文句子的相等或包含
const enHits = scanned.filter(({ l }) => /(==|!=|has|in)\s*['"][A-Za-z]+ [A-Za-z ]+['"]/.test(l)).map(x => x.i);
check('正文无读英文描述句作判断的写法', enHits.length === 0, enHits.join(','));

// 5 不为具体职业写规则：各规则小节（4.n.3）里不得出现"若职业为""只有某职业"式条件；且 §3.5 含对应禁令
const ruleLines = subs.flatMap(s => (part(s, 3) ?? []).map(l => ({ n: s.n, l })));
const profBranch = ruleLines.filter(({ l }) => /(若|如果|只有|仅限)[^。；]{0,12}职业(为|是|等于)/.test(l));
check('规则小节无按具体职业分支的条文', profBranch.length === 0, profBranch.map(x => `4.${x.n}`).join(','));
check('§3.5 含"不得以从业某职业作条件分支"的禁令', text.includes('规则层以"主体是否从业某职业"作为条件分支'));
check('本卷不定义 awake / can / capacity', !scanned.some(({ l }) => /function\s+(can|awake|capacity)\b/.test(l)));

// 6 台账判给本卷的概念
const subText = n => (subs.find(s => s.n === n)?.lines ?? []).join('\n');
const s2 = body(sec('§2')).join('\n');
const need = [
  ['职业表', subText(1) + s2, ['domains', 'skills', 'services', 'laborKinds', 'variantOf', 'hidden', 'PF-1', 'fit', 'tier', 'professionView', 'professionsOf', 'takeUp']],
  ['服务词表 service', subText(1) + s2, ['`service`', 'requirement', 'hosted', 'licensedBy', 'canOffer', 'PF-6', 'PF-8']],
  ['职业文化变体（本卷内）', subText(2), ['variantOf', 'cultures', 'effective', 'PV-1']],
  ['技能与熟练', subText(3) + s2, ['skillRecord', 'learningCurve', 'rustPerDay', 'dailyCap', 'isLanguage', 'skillValue', 'gainSkill', 'SK-2', 'SK-4', 'SK-5', 'sband']],
  ['熟练度依赖图', subText(4) + s2, ['prereqs', 'capWithoutPrereq', 'prereqGainMult', 'E-SKILL-PREREQ-CYCLE', 'depth', 'DG-2']],
  ['学习来源、学费、教师意愿', subText(5) + s2, ['learn_source', 'ceilingFraction', 'teachWillingness', 'rules.teach.refusals', '学费', 'LS-5', 'LS-6', 'study']],
  ['跨文化学艺（本卷内）', subText(6), ['sharedLanguage', 'languageWeight', 'transfer', 'XC-1', 'XC-3']],
  ['考试与认证', subText(7) + s2, ['`cert`', 'assessStep', 'check', 'work', 'tenure', 'endorse', 'rank', 'rite', 'certStanding', 'EX-3', 'EX-6']],
  ['隐藏职业契机', subText(8) + s2, ['`deed`', 'deedTick', 'opportunitiesOf', 'perks', 'standing', 'HO-1', 'HO-4', 'HO-7', 'ctx']],
  ['生活方式树', subText(9) + s2, ['`lifestyle`', '`perk`', 'focus', 'takePerk', 'requires', 'excludes', 'LF-2', 'LF-3']],
  ['传授限制维度（秘传、流派壁垒）', subText(10) + s2, ['secrecy', 'transmission', 'admit', 'school', 'rivals', 'TR-1', 'TR-6', 'TR-7']],
  ['教育与童年（本卷内）', subText(11), ['eduFocus', 'upbringingTick', 'initialSkills', 'UB-2', 'UB-7', 'UB-8']],
  ['成长、经验、兼修负担', subText(12) + s2, ['experience', 'levelThresholds', 'learnLoad', 'learnCapacity', 'burdenCurve', 'GR-1', 'GR-4']],
];
for (const [name, t, kws] of need) { const miss = kws.filter(k => !t.includes(k)); check(`台账概念写全：${name}`, miss.length === 0, miss.length ? '缺 ' + miss.join('、') : ''); }

// 7 卷一、卷二引用须带标题
const REF = /卷[一二] §[0-9A-Za-z.]+(?:(?:[–、/]|至 ?)§[0-9A-Za-z.]+)*/g;
const bare = [];
lines.forEach((l, i) => { for (const m of l.matchAll(REF)) { const next = l[m.index + m[0].length]; if (next !== '（') bare.push(`${i + 1}:${m[0]}`); } });
check('卷一、卷二引用均带标题', bare.length === 0, `${bare.length} 处  ${bare.slice(0, 20).join(' | ')}`);

// 8 §7.2 的 28 个领域键与旧代码的 matchers 键集合逐一对应
const s7 = body(sec('§7'));
const rows = s7.map(l => /^\| (\d+) \| ([a-z_]+) \| /.exec(l)).filter(Boolean);
check('§7.2 逐项表 28 行、编号连续', rows.length === 28 && rows.every((r, k) => Number(r[1]) === k + 1), `实得 ${rows.length}`);
let codeKeys = null;
try {
  const src = readFileSync('F:/dnd/server-plugin/hidden-passives.mjs', 'utf8');
  const m = /const matchers=\{([\s\S]*?)\n\};/.exec(src);
  codeKeys = [...m[1].matchAll(/([a-z_]+):\//g)].map(x => x[1]);
} catch { codeKeys = null; }
if (codeKeys) {
  const docKeys = rows.map(r => r[2]);
  const missing = codeKeys.filter(k => !docKeys.includes(k)), extra = docKeys.filter(k => !codeKeys.includes(k));
  check('§7.2 键集合 = hidden-passives.mjs matchers 键集合（28）', codeKeys.length === 28 && !missing.length && !extra.length, `源码 ${codeKeys.length} 键；缺 ${missing.join('、') || '无'}；多 ${extra.join('、') || '无'}`);
} else check('§7.2 键集合与源码比对', false, '读不到 hidden-passives.mjs');
const s73 = s7.join('\n');
for (const fn of ['escorting', 'breachUnpaid', 'compensateHidden', 'hiddenPassives', 'passiveDomain', 'hiddenCheckBonus', 'observationTime', 'hiddenCombat', 'petTrustGain', 'contextReason'])
  check(`§7 处置了 ${fn}`, s73.includes(fn));
for (const c of ['peace', 'maps', 'restitution', 'healthy_pets', 'wind', 'observations', 'sealed_delivery', 'surrender'])
  check(`§7.3 处置了保持条件 ${c}`, s73.includes(c));

// 9 数值示例复算
const lookup = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts.at(-1)[1]; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rust = [[0, 1], [0.5, 0.6], [1, 0.35], [2, 0.1], [4, 0]];
const lang = [[0, 0], [300, 0.3], [900, 0.8], [1800, 1]];
const burden = [[0, 1], [0.5, 1], [1, 0.6], [2, 0.2]];
const tA = [[0.2, 1], [0.35, 0.3], [0.8, 0.05]], tJ = [[0.2, 0], [0.35, 1], [0.8, 0.6]], tM = [[0.3, 0], [0.5, 0.3], [0.8, 0.4]];
const idle = (400 - 30) * 0.002, keep = lookup(rust, idle);
const nums = [
  ['够格度：min(900÷600, 450÷300) = 1.5', Math.min(900 / 600, 450 / 300), 1.5, 1e-9],
  ['够格度：柯博德 min(420÷600, 310÷300) = 0.7', Math.min(420 / 600, 310 / 300), 0.7, 1e-9],
  ['生锈：闲置量 0.74', idle, 0.74, 1e-9],
  ['生锈：保留比例 0.48', keep, 0.48, 1e-9],
  ['生锈：读数基值 888', 600 + 600 * keep, 888, 1e-6],
  ['折算：888 × 0.8 = 710.4', 888 * 0.8, 710.4, 1e-6],
  ['增量：两小时受教 ≈ 10.78', 2 * 6 * 0.8 * 1.0 * 1.2 * 0.9 * 1.1 * 1.05 * 0.9, 10.78, 0.005],
  ['来源上限：1500 × 0.9 = 1350', 1500 * 0.9, 1350, 1e-9],
  ['语言：共同读数 600 → 0.55', lookup(lang, 600), 0.55, 1e-9],
  ['语言：观摩 1 − 0.2 × 0.45 = 0.91', 1 - 0.2 * (1 - lookup(lang, 600)), 0.91, 1e-9],
  ['语言：读数 200 → 0.2', lookup(lang, 200), 0.2, 1e-9],
  ['档位权重：相对年龄 0.5 学徒 0.22', lookup(tA, 0.5), 0.22, 0.005],
  ['档位权重：行家 0.87', lookup(tJ, 0.5), 0.87, 0.005],
  ['档位权重：大师 0.30', lookup(tM, 0.5), 0.30, 0.005],
  ['负担：2100 ÷ 3000 → 0.84', lookup(burden, (1500 + 0 + 600) / (2400 + 5 * 100 + 100)), 0.84, 1e-9],
  ['负担：4500 ÷ 3000 → 0.4', lookup(burden, 5 * (1200 - 300) / 3000), 0.4, 1e-9],
];
for (const [name, got, want, tol] of nums) check(`数值复算：${name}`, near(got, want, tol), `算得 ${Math.round(got * 10000) / 10000}`);
const thr = [1, 2, 9, 26, 63, 130, 241, 410, 657, 1000];
check('数值复算：等级阈值表 = ceil(L⁴÷10)，L=1…10', thr.every((v, k) => v === Math.ceil((k + 1) ** 4 / 10)), thr.map((_, k) => Math.ceil((k + 1) ** 4 / 10)).join(','));

// 9b 第二版：七条裁定、"执业"种类行、影响面表
const s3 = body(sec('§3')).join('\n'), s5 = body(sec('§5')).join('\n'), s8 = body(sec('§8')).join('\n');
const s28 = (() => { const a = lines.findIndex(l => l.startsWith('### 2.8 ')); const b = lines.findIndex((l, i) => i > a && /^## /.test(l)); return a < 0 ? '' : lines.slice(a, b).join('\n'); })();
const lineHits = (re, okRe) => lines.map((l, i) => ({ l, i: i + 1 })).filter(({ l }) => re.test(l) && !okRe.test(l)).map(x => x.i);
// 裁定 1
const skillsRow = lines.find(l => l.startsWith('| `skills` | map<ref skill,')) ?? ''; // §2.3 个体行（§2.1 职业行的同名维度键是 skillRef）
check('裁定1：§2.3 skills 行是存储的积累量、不是 derived', skillsRow.includes('存储的积累量') && !/\| derived/.test(skillsRow));
check('裁定1：§5.4 对卷二 §5.5 的回填写"保持存储"', /卷二 §5\.5（个体） \| `skills` \*\*保持存储\*\*/.test(s5));
check('裁定1：SK-5 写明 有效值 = 存储值 + 修正项', text.includes('**SK-5 有效技能 = 存储值 + 修正项'));
// 裁定 2
const propsBad = lineHits(/created\.<person>\.props/, /(不|0|只在|禁|必须失败)/);
check('裁定2：提到 created.<person>.props 的每一行都是禁止或否定', propsBad.length === 0, propsBad.join(','));
check('裁定2：属性成长写成经 modifier.mjs 登记修正项', s3.includes('调 modifier.mjs 的写入口登记一条以 `person.attributes[k]` 为目标') && !text.includes('偏离的声明写者'));
// 裁定 3
const wageBad = lineHits(/技能阶[^。；|]{0,12}(工价|工钱)|(工价|工钱)[^。；|]{0,8}按[^。；|]{0,4}阶/, /(不|退役|已核|一审|删)/);
check('裁定3：没有"工钱按技能阶"的正面说法', wageBad.length === 0, wageBad.join(','));
const slotBad = lineHits(/作息槽|学费价格槽|卷三 §4\.7 已声明/, /(没有|不|改引|删|一审)/);
check('裁定3：不引对方卷没有的概念（作息槽、学费价格槽、卷三授权）', slotBad.length === 0, slotBad.join(','));
check('裁定3：服务费定价归卷六（PF-8 与 须别卷配合）', text.includes('**PF-8 别卷登记服务；定价归卷六**') && Boolean(sec('附 须别卷配合')));
// 裁定 4：全文 RX 字串只用现有变体（加待申请的 member）；变量、关系都在 §2.8
const rxs = [...raw.slice(0, cut).matchAll(/"(filter|weight|when|admit)":"([^"]*)"/g)].map(m => ({ field: m[1], src: m[2] }));
const allowFn = new Set(['exists', 'count', 'maxOf', 'minOf', 'member', 'not']);
const listed = new Set([...s28.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map(m => m[1]));
const tableB = (() => { const a = s28.indexOf('**表 B'), b = s28.indexOf('**表 C'); return new Set([...s28.slice(a, b).matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`/g)].map(m => m[1])); })();
const rxBad = [];
for (const { field, src } of rxs) {
  for (const m of src.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) if (!allowFn.has(m[1])) rxBad.push(`${field}:函数 ${m[1]}`);
  if (/\b(ctx|event|edge|teacher|student|issuer)\./.test(src)) rxBad.push(`${field}:路径变量`);
  if (/\s(has|in)\s/.test(src)) rxBad.push(`${field}:has/in`);
  const bare = src.replace(/[A-Za-z_][A-Za-z0-9_.]*/g, '').match(/\d+(\.\d+)?/g) ?? [];
  for (const n of bare) if (n !== '0' && n !== '1') rxBad.push(`${field}:裸数 ${n}`);
  for (const m of src.matchAll(/\b(subject|object)\.([A-Za-z_][A-Za-z0-9_]*)/g)) if (!listed.has(m[2])) rxBad.push(`${field}:表外 ${m[0]}`);
  for (const m of src.matchAll(/\brel_[a-z_]+/g)) if (!listed.has(m[0])) rxBad.push(`${field}:未登记关系 ${m[0]}`);
  if (field === 'filter' || field === 'weight') {
    if (/\b(exists|count|maxOf|minOf)\s*\(|\brel_/.test(src)) rxBad.push(`${field}:事迹用了关系`);
    for (const m of src.matchAll(/\bsubject\.([A-Za-z_][A-Za-z0-9_]*)/g)) if (!tableB.has(m[1])) rxBad.push(`${field}:不在表 B ${m[1]}`);
  }
}
check(`裁定4：全文 ${rxs.length} 条 RX 字串只用现有变体加 member，变量与关系都在 §2.8`, rxs.length >= 8 && rxBad.length === 0, rxBad.slice(0, 8).join('；'));
const relCount = new Set([...s28.matchAll(/`(rel_[a-z_]+)`/g)].map(m => m[1])).size;
check('裁定4：§2.8 登记的关系数与 §5.4 所称"二十三条"一致', relCount === 23 && s5.includes('二十三条关系'), `实得 ${relCount}`);
check('裁定4：写不出的变体列入 §8（member）', /\| Q-16 \|[^\n]*`member`/.test(s8) && text.includes('E-RX-VAR-UNLISTED') && text.includes('E-RX-BARE-NUMBER'));
// 裁定 5
const b7 = lines.find(l => l.startsWith('| B-7 |')) ?? '';
check('裁定5：B-7 禁调用方给的加值、理由、动作代号、技能；情境只认登记代号', ['args.context', 'contextReason', '动作代号', '技能', '登记过的结构化代号'].every(k => b7.includes(k)));
check('裁定5：§7 列出并删除 args.context 两处', s73.includes('checks.mjs:77–78') && s73.includes('primitives-checks.mjs:40–41') && s73.includes('两个一起删'));
// 裁定 6
const s77 = (() => { const a = s7.findIndex(l => l.startsWith('### 7.7 ')); return a < 0 ? '' : s7.slice(a).join('\n'); })();
const need6 = ['personCertified', 'personTeaching', 'certifiedForSkill', 'breakthroughs', 'uncertifiedMaximumProficiency', 'works.mjs:258–279', 'action-affordances.mjs:208'];
const miss6 = need6.filter(k => !s77.includes(k));
check('裁定6：§7.7 逐处处置按职业门控学与教、阶段与突破、技能融合', s77 !== '' && miss6.length === 0, miss6.join('、'));
const need65 = ['action-router.mjs:408', 'credit.mjs:498', 'primitives-learning.mjs:48', 'entity-view.mjs:117', 'engine.mjs:1160', 'npc-growth.mjs:108', 'professions.mjs:47', 'entity-view.mjs:400'];
const miss65 = need65.filter(k => !s73.includes(k));
check('裁定6：§7 补列前缀反推各文件与隐藏加成的调用方', miss65.length === 0, miss65.join('、'));
// 裁定 7
const b11 = lines.find(l => l.startsWith('| B-11 |')) ?? '';
check('裁定7：事迹只读登记事件的载荷；表 B 是闭集；B-11 与 E-DEED-FILTER 把守', tableB.size >= 20 && b11.includes('deeds.mjs') && text.includes('**HO-2 事迹只读登记过的事件代号与事件载荷**') && /E-DEED-FILTER \|[^\n]*载荷以外的实体当前状态/.test(text));
// "执业"种类行
const s411 = (subs[0] ? part(subs[0], 1) ?? [] : []).join('\n');
const hkCols = ['hyper', 'from', 'to', 'exclusive', 'holderMax', 'holderEnd', 'subjectEnd', 'concluded', 'functional', 'membership', 'headship', 'carriesRel', 'conduct', 'conductBack', 'adopt', 'pins', 'intimate', 'bodyControl', 'transferable', 'grants', 'incompatible', 'hooks', 'grantedBy', 'visibility', 'termsKeys'];
const missCols = hkCols.filter(c => !s411.includes('`' + c + '`'));
check('执业：§4.1.1 种类行各列填全', s411.includes('"执业"持有种类行（单点定义') && missCols.length === 0, missCols.join('、'));
const hkRow = /"hk_practices": (\{[\s\S]*?\})\n/.exec(text);
let hkOk = false, hkDetail = '缺数据行';
if (hkRow) { try { const o = JSON.parse(hkRow[1]); const main = ['hyper', 'from', 'to', 'exclusive', 'gone', 'vacated', 'defected', 'subjectEnd', 'concluded', 'functional', 'membership', 'headship', 'carriesRel', 'conduct', 'conductBack', 'adopt', 'pins']; const m = main.filter(k => !(k in o)); hkOk = m.length === 0; hkDetail = m.length ? '缺主列 ' + m.join('、') : '主列 17 项齐'; } catch (e) { hkDetail = 'JSON 解析失败'; } }
check('执业：§4.1.5 数据行可解析且卷十八主列齐全', hkOk, hkDetail);
check('执业：§5.4 回填卷十八、须别卷配合、§8 Q-22 都已写', /\| 卷十八 §4\.1 \| 持有种类行"执业"/.test(s5) && /\| Q-22 \|/.test(s8) && body(sec('附 须别卷配合')).join('\n').includes('"执业"种类行'));
// 步号一致
const stepBad = lines.map((l, i) => ({ l, i: i + 1 })).filter(({ l }) => (/第 ③ 项/.test(l) && !/折算/.test(l)) || (/第 ④ 项/.test(l) && !/(前置|封顶|身体)/.test(l)) || (/第 ⑤ 项/.test(l) && !/身体/.test(l))).map(x => x.i);
check('SK-5 步号引用与内容一致（③ 折算、④ 前置封顶、⑤ 身体折算）', stepBad.length === 0, stepBad.join(','));
// 影响面表
const imp = body(sec('附 本轮影响面表')).join('\n');
const missImp = [...Array.from({ length: 20 }, (_, k) => `| A-${k + 1} |`), ...Array.from({ length: 18 }, (_, k) => `| B R-${k + 1} |`)].filter(k => !imp.includes(k));
check('影响面表：七条裁定、38 条真问题、"执业"登记都有行', imp !== '' && missImp.length === 0 && [1, 2, 3, 4, 5, 6, 7].every(n => new RegExp(`\\n\\| ${n} `).test(imp)) && imp.includes('"执业"持有种类行'), missImp.join(' '));
check('附 须别卷配合、附 记账栏 两节在', Boolean(sec('附 须别卷配合')) && Boolean(sec('附 记账栏')));

// 9c 第四版：process.skillGain 的 when 只在表 F 定义（全书扫描，判据见 F:/dnd/docs/统一底层设计/脚本/全书/scan-skillgain-when.mjs）
// 只在核对现行成稿时做全书扫描；给了别的路径（旧快照）时不适用。
if (!process.argv[2]) {
  const { scan } = await import(new URL('../全书/scan-skillgain-when.mjs', import.meta.url).href);
  const sg = scan();
  check('skillGain when 只在表 F 定义（全书）', sg.tableF === 1 && sg.outside.length === 0, `表 F 定义块 ${sg.tableF} 处；表 F 外定义 ${sg.outside.length} 处${sg.outside.length ? '：' + sg.outside.map(r => `${r.f.split('-')[0]}:${r.no}`).join(' ') : ''}`);
  const rowA = lines.filter(l => l.startsWith('| ') && l.includes('`when`') && l.includes('`process.skillGain`') && /^\| 以 `process\.skillGain`/.test(l));
  check('skillGain when：表 A 该行两栏都只写"见表 F"', rowA.length === 1 && /\| 见表 F \| 见表 F \|$/.test(rowA[0]));
}

// 9d 第五版：后门预扫第四节（身体状态只有卷二十一一个写入口）与卷十九同类清单 14-1（技能记录按扩展标度存）
{
  const sk5 = lines.find(l => l.includes('⑤ **身体折算**')) ?? '';
  check('第五版：SK-5 ⑤ 末句为预扫建议的措辞，旧的"只经卷四这一个入口"已撤', sk5.includes('身体能力（`body.*`）只经卷四 `workInputs` 进入本卷；伤病状态的影响以状态档修正项经 ⑥ 进入，卷二十一登记') && !text.includes('身体怎样影响做事只经卷四这一个入口'));
  const pf7 = lines.find(l => l.startsWith('- **PF-7 ')) ?? '';
  const a416 = (subs[0] ? part(subs[0], 6) ?? [] : []).join('\n');
  const ho6 = lines.find(l => l.startsWith('- **HO-6 ')) ?? '';
  // 本卷正文不得出现"本卷某模块写状态实例"的正面说法：凡同一行提到 statuses.* 的，必须是否定或写入边数为 0
  const stBad = lineHits(/statuses\.\*/, /(写入边数为 0|不)/);
  check('第五版：本卷不写身体状态（PF-7 单点、§4.1.6 扫描式、HO-6 说明；statuses.* 只以否定出现）', pf7.includes('技能不写身体状态（单点）') && pf7.includes('卷二十一 §5.1') && pf7.includes('写入边数为 0') && /对 `statuses\.\*` 的写入边数为 0/.test(a416) && ho6.includes('不写任何状态实例') && stBad.length === 0, stBad.join(','));
  const recRow = lines.find(l => l.startsWith('| `skills` 的簿记')) ?? '';
  const recStruct = lines.find(l => l.startsWith('- `struct:skillRecord = ')) ?? '';
  const ext = l => l.includes('`stockMode: extScale`') && l.includes('`precision: 8`');
  check('第五版：技能记录 stored、peak、dayGain 登记 extScale、precision 8（§2.3、§2.6、§5.4）', ext(recRow) && ext(recStruct) && /卷二 §1\.5（类型清单） \|[^\n]*`stockMode: extScale`、`precision: 8`/.test(s5));
  const s43 = subText(3);
  check('第五版："切成几段提交，结果相同"已撤，改为起算日判定与切段无关', !text.includes('切成几段提交，结果相同') && s43.includes('本卷不作"切段相同"的断言') && (part(subs[2], 6) ?? []).some(l => l.startsWith('- 不变量式（起算日判定与切段无关）')));
}

// 9e 第六版：误差界换成卷二 §3.3 第 6 条"m 的口径"的确定式（审查/卷十四-v5单核 N1）。
// 换口径的理由：第五版两条断言（"截断次数与误差界""放大口径"）核对的是 m₂ = 27 + p、m₁ = m₃ = 4、K 这套按截断次数数的式子，
// 单核 N1 证明它漏了查表值所乘的另一个因数（第 1、3 步差约 2700 倍，第 2 步漏了随分钟数增长的一项），界本身不成立。
// 两条旧断言因此不是放宽而是作废，换成下面三条：正文写了新确定式且旧式只以"作废"出现；式子里的常数能从正文抽出来互相对上
//（取代旧脚本里不起作用的恒真式 1+2+1+12+3+3+2 === 24，单核 S4）；定点实现对有理数参考值的数值验算（卷二该条要求附验算）。
// 新界处处不小于旧界（2703 对 4；13 + ε_Σ × G₀ 对 27），属收紧断言的方向：旧界下能过的实现，新界下的"实际 ≤ 界"仍须逐次成立。
{
  const s43 = subText(3);
  const a436 = part(subs[2], 6) ?? [];
  const boundLine = a436.find(l => l.startsWith('- 不变量式（误差界')) ?? '';
  const oldGone = !s43.includes('`m₂ = 27 + p`') && !s43.includes('`m₁ = 4`') && !s43.includes('放大系数为 1') && !/\(n₂ × \(27 \+ p\) × K/.test(boundLine)
    && (s43.match(/\(n₂ × \(27 \+ p\) × K \+ 4 × \(n₁ \+ n₃\)\) × 10⁻⁸/g) ?? []).length === 1 && s43.includes('作废');
  check('第六版：SK-3 误差界是按语法树递推的确定式，旧的按截断次数的式子只以"作废"出现一次；§4.3.6 的断言同口径',
    s43.includes('存量与余数结转"第 6 条，本卷不另立口径') && s43.includes('**误差量与误差界（确定式）**') && s43.includes('"m 的口径（唯一定义）"')
    && s43.includes('e_乘 = Β ×（13 + ε_Σ × G₀）') && s43.includes('e_管 =（e_乘 + p + q）× M') && s43.includes('m₂   = ⌈ȳ(dailyTotalCurve) × e_h + h⁺ × e_t + 1⌉')
    && s43.includes('e_衰(j) = E_s,j + 2 × rustFloor_j × E_p,j + 2703') && s43.includes('e_自 = E_始 + 2703') && s43.includes('m₀ = 2701')
    && oldGone && boundLine.includes('`E_s × 10⁻⁸`') && boundLine.includes('m 是误差量，不是截断次数') && boundLine.includes('适用区间'));
  // 第七版（李白对 审查/卷十四-v6单核 N1 的裁定）：读数、分支、取大取小三条读法已上收卷二 §3.3"存量与余数结转"第 6 条单点（卷二【十七·补】⑰），
  // 本卷只引用。第六版这里按字面核对三个小标题；现改为核对"三条只引卷二 §3.3 第 6 条、本卷无自写条文"，不再依赖小标题的字面。
  // 不放宽：原断言的另四项（适用区间、按写入时的值给、learnCapacity 为正、§5.4 卷二行）照旧核对；另加卷二一侧确有这两句的核对。
  {
    const L43 = subs[2]?.lines ?? [];
    const at = L43.findIndex(l => l.includes('**误差量与误差界（确定式）**'));
    const head = at >= 0 ? L43[at] : '';
    const bullets = [];
    for (let i = at + 1; at >= 0 && i < L43.length && L43[i].startsWith('  - '); i++) bullets.push(L43[i]);
    // 每条只许两句：引卷二该条的一句，与列本卷适用处的一句；多出任何一句（自写条文）即不合
    const citeOnly = /^  - \*\*[^*]+\*\*：口径[^。]*见卷二该条[^。]*。本卷用到的[^。]+。$/;
    const bad = bullets.filter(l => !citeOnly.test(l));
    const topics = [/读数/, /分支/, /取大取小/].map(re => bullets.filter(l => re.test(/\*\*([^*]+)\*\*/.exec(l)?.[1] ?? '')).length);
    const selfRule = ['参考值取与定点实现相同', '误差计 0', '误差界之和', '自身叶子不取 0', '恒等于该支', '按上面三条读法'].filter(k => s43.includes(k));
    const vol2 = readFileSync('F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md', 'utf8').split(/\r?\n/);
    const r6 = vol2.findIndex(l => l.startsWith('6. **非线性的逐拍量用扩展标度**'));
    const rule6 = [];
    for (let i = r6 + 1; r6 >= 0 && i < vol2.length && /^\s+- /.test(vol2[i]); i++) rule6.push(vol2[i]);
    const v2 = rule6.join('\n');
    const v2ok = v2.includes('只计所取一支的误差') && v2.includes('否则取各实参误差里最大的') && v2.includes('按使用精度截断后进入式子的读数') && v2.includes('不进 `G`');
    check('第七版：三条读法只引卷二 §3.3 第 6 条、本卷无自写条文；适用区间、按取值域与按写入时的值两种给法都写明',
      head.includes('卷二 §3.3（求值管线）"存量与余数结转"第 6 条') && head.includes('本卷只引用') && head.includes('不另立')
      && bullets.length === 3 && bad.length === 0 && topics.every(n => n === 1) && selfRule.length === 0 && v2ok
      && s43.includes('**适用区间**') && s43.includes('按写入时的值给') && s43.includes('`learnCapacity` 为正')
      && /卷二 §3\.3（求值管线） \| \*\*请求补写 `modified\(\)` 的 10⁸ 模式\*\*/.test(s5),
      `读法条数 ${bullets.length}；不止引用的 ${bad.length} 条；三类各 ${topics.join('/')}；残留自写条文 ${selfRule.join('、') || '无'}；卷二第 6 条两句 ${v2ok ? '在' : '缺'}`);
  }
  // 常数从正文抽出来互相对：13 = 一次整除 + SK-2 乘式的因子数；ε_Σ 的 9 = 各计 1 的查表因子数 + F_lang 与 F_burden 各自的 1
  const gainLine = lines.find(l => l.includes('`gain = minutes ÷ 60 × baseGainPerHour × ')) ?? '';
  const factorCount = gainLine.split(' × ').length - 2; // 去掉 "gain = minutes ÷ 60" 与 baseGainPerHour 两段
  const n13 = Number(/e_乘 = Β ×（(\d+) \+ ε_Σ × G₀）/.exec(s43)?.[1]);
  const n9 = Number(/ε_Σ  = (\d+) \+ languageWeight \+ σ\(burdenCurve\)/.exec(s43)?.[1]);
  const ones = (/自身误差之和。([^\n]*?)\n[^\n]*各查表一次，各 1/.exec(s43)?.[1] ?? '').split('、').filter(x => x.trim()).length;
  const cjk = { 十二: 12, 十三: 13 };
  const saidFactors = cjk[/Β    = SK-2 (十[一二三四五])个因子/.exec(s43)?.[1]];
  check('第六版：确定式里的常数与 SK-2 的式子对得上（因子数、13、ε_Σ 的 9）', factorCount === 12 && saidFactors === factorCount && n13 === factorCount + 1 && ones === 7 && n9 === ones + 2, `因子 ${factorCount}；写出 ${saidFactors}、${n13}；各计 1 的查表因子 ${ones}；写出 ${n9}`);

  // 误差界验算：10⁸ 定点（BigInt，向零截断）对有理数参考值（BigInt 分数，不截断）；单位 10⁻⁸
  const S8 = 10n ** 8n;
  const u8 = x => BigInt(Math.round(x * 1e8));
  const mul8 = (a, b) => a * b / S8;
  const pts8 = pts => pts.map(([a, b]) => [u8(a), u8(b)]);
  const lookup8 = (pts, x) => { const P = pts8(pts); if (x <= P[0][0]) return P[0][1]; for (let k = 1; k < P.length; k++) if (x <= P[k][0]) { const [x0, y0] = P[k - 1], [x1, y1] = P[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return P.at(-1)[1]; };
  const R = (n, d = S8) => ({ n, d });
  const rmul = (a, b) => R(a.n * b.n, a.d * b.d), radd = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d), rsub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
  const rle = (a, b) => a.n * b.d <= b.n * a.d;
  const rlookup = (pts, x) => { const P = pts8(pts).map(([a, b]) => [R(a), R(b)]); if (rle(x, P[0][0])) return P[0][1]; for (let k = 1; k < P.length; k++) if (rle(x, P[k][0])) { const [x0, y0] = P[k - 1], [x1, y1] = P[k]; const num = rmul(rsub(y1, y0), rsub(x, x0)), den = rsub(x1, x0); return radd(y0, R(num.n * den.d, num.d * den.n)); } return P.at(-1)[1]; };
  const errUnits = (fix, ref) => { let a = fix * ref.d - ref.n * S8; if (a < 0n) a = -a; return Number(a * 1000000n / ref.d) / 1e6; };
  let seed = 20261113;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const dec4 = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 1e4) / 1e4;
  const int = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));

  // 验算一：第 1、3 步。衰退后值的界 2703、折算值的界 2703 × transfer + 1（E_s、E_p 取 0）
  // 生锈曲线故意取除不尽的分段（正文示例的曲线与步长恰好整除，查表没有余数，验不出放大）
  const rustT = [[0, 1], [0.3, 0.61], [1, 0.35], [1.7, 0.1], [4, 0]];
  let worstA = 0, worstT = 0, okA = true;
  for (let i = 0; i < 4000; i++) {
    const peak = BigInt(Math.floor(rnd() * 2700e8)), stored = BigInt(Math.floor(rnd() * Number(peak + 1n)));
    const rho = [0, 0.25, 0.5, 1, dec4(0, 1)][int(0, 4)], ratio = dec4(0, 1), x = u8(int(0, 6000) * 0.0007);
    const F = mul8(peak, u8(rho)), r = lookup8(rustT, x);
    const takeStored = stored <= F;
    const dFix = takeStored ? stored : F + mul8(stored - F, r), tFix = mul8(dFix, u8(ratio));
    const Fr = rmul(R(peak), R(u8(rho)));
    const dRef = takeStored ? R(stored) : radd(Fr, rmul(rsub(R(stored), Fr), rlookup(rustT, R(x)))), tRef = rmul(dRef, R(u8(ratio)));
    const eA = errUnits(dFix, dRef), eT = errUnits(tFix, tRef), bT = 2703 * ratio + 1;
    if (eA > 2703 || eT > bT) okA = false;
    worstA = Math.max(worstA, eA / 2703); worstT = Math.max(worstT, eT / bT);
  }
  check('误差界验算一：第 1、3 步（衰退后值 ≤ 2703，折算值 ≤ 2703 × transfer + 1；4000 例）', okA, `实际与界之比最大 ${worstA.toFixed(3)}、${worstT.toFixed(3)}`);

  // 验算二：第 2 步 SK-2 的乘式。界 e_乘 = Β ×（13 + ε_Σ × G₀），ε_Σ = 9 + languageWeight + σ(burdenCurve)
  const cv = {
    learn: [[0, 1], [400, 0.8], [1200, 0.5], [2700, 0.15]], gap: [[0, 0.2], [300, 1], [900, 1.3]], group: [[1, 1], [5, 0.7], [20, 0.3]],
    chal: [[-600, 0.1], [0, 1], [300, 1.2], [900, 0.2]], apt: [[-1, 0.6], [0, 1], [1, 1.5]], attr: [[0, 0.5], [10, 1], [20, 1.4]], age: [[0, 0.3], [0.2, 1.2], [1, 1]],
  };
  const top = pts => Math.max(...pts.map(p => p[1]));
  const sigma = pts => Math.max(...pts.slice(1).map((p, k) => Math.abs((p[1] - pts[k][1]) / (p[0] - pts[k][0]))));
  let worstB = 0, okB = true, worstCount = 0;
  for (let i = 0; i < 4000; i++) {
    const minutes = int(1, 720), bgph = Math.round(rnd() * 200 * 100) / 100, rate = [0.5, 1, 1.2][int(0, 2)], w = dec4(0, 1), pre = [1, 0.4][int(0, 1)], rel = [1, 1.5][int(0, 1)];
    const cap = int(500, 5000), load = int(0, 2 * cap);
    const args = { learn: int(0, 2700), gap: int(0, 1200), group: int(1, 25), chal: int(-700, 1000), apt: dec4(-1, 1), attr: dec4(0, 20), age: dec4(0, 1) };
    const langArg = u8(int(0, 2000));
    const fix = {}, ref = {};
    for (const k of Object.keys(cv)) { fix[k] = lookup8(cv[k], u8(args[k])); ref[k] = rlookup(cv[k], R(u8(args[k]))); }
    fix.lang = S8 - mul8(u8(w), S8 - lookup8(lang, langArg)); ref.lang = rsub(R(S8), rmul(R(u8(w)), rsub(R(S8), rlookup(lang, R(langArg)))));
    fix.burden = lookup8(burden, u8(load) * S8 / u8(cap)); ref.burden = rlookup(burden, R(BigInt(load), BigInt(cap)));
    fix.rate = u8(rate); ref.rate = R(u8(rate)); fix.pre = u8(pre); ref.pre = R(u8(pre)); fix.rel = u8(rel); ref.rel = R(u8(rel));
    const order = ['learn', 'rate', 'gap', 'group', 'lang', 'chal', 'apt', 'attr', 'age', 'burden', 'pre', 'rel'];
    let pFix = BigInt(minutes) * u8(bgph) / 60n, pRef = R(BigInt(minutes) * u8(bgph), 60n * S8);
    for (const k of order) { pFix = mul8(pFix, fix[k]); pRef = rmul(pRef, ref[k]); }
    const beta = Math.max(1, rate) * top(cv.gap) * top(cv.chal) * top(cv.apt) * top(cv.attr) * top(cv.age) * Math.max(1, rel); // 学习曲线、F_group、F_lang、F_burden、F_prereq 的上界都不大于 1
    const g0 = minutes * bgph / 60, bound = beta * (13 + (9 + w + sigma(burden)) * g0), e = errUnits(pFix, pRef);
    if (e > bound) okB = false;
    worstB = Math.max(worstB, e / bound); worstCount = Math.max(worstCount, e / 27);
  }
  check('误差界验算二：第 2 步乘式（e_乘 = Β ×（13 + ε_Σ × G₀）；4000 例）', okB, `实际与界之比最大 ${worstB.toFixed(3)}；同批实际误差最大是旧界 27 的 ${worstCount.toFixed(1)} 倍`);
}

// 10 统计
const q = body(sec('§8')).filter(l => /^\| Q-\d+ \|/.test(l)).length;
const x = body(sec('§6')).filter(l => /^\| X-\d+ \|/.test(l)).length;
out.push('');
out.push(`统计  成稿正文 ${lines.length} 行（不含附录里贴的本输出）；子系统 ${subs.length}；规则 ${ruleTotal} 条；数据实例 ${instanceTotal} 条；扩展性夹具 ${x} 条；开放问题 ${q} 条`);
out.push(`结论  ${failed === 0 ? '全部通过' : `有 ${failed} 项失败`}`);
console.log(out.join('\n'));
process.exitCode = failed ? 1 : 0;
