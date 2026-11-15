// 卷四自检脚本（只读成稿，不写任何文件）。用法：node check-卷四.mjs [成稿路径]
import { readFileSync, readdirSync } from 'node:fs';

const path = process.argv[2] ?? 'F:/dnd/docs/统一底层设计/卷四-生物身体与人物.md';
const raw = readFileSync(path, 'utf8');
// 附录里的脚本输出不参与自检，避免自引用
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
let instanceTotal = 0;
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
  const rules = (part(s, 3) ?? []).filter(l => /^- \*\*[A-Z]-\d+ /.test(l));
  check(`4.${s.n} 规则条数 ≥3`, rules.length >= 3, `${rules.length} 条`);
}

// 3 具体 id 字面量：只许出现在 §1（现状）、各数据实例小节、§7（旧代码引述）
const ID = /(?<![A-Za-z0-9_])(item|mat|species|flora|body|npc|creature|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod)_[a-z0-9]+(?:_[a-z0-9]+)*/g;
const ALLOW = new Set(['body_plan', 'body_part', 'status_family', 'status_target', 'law_code', 'facility_type']);
// 已登记的词表族名不是实体 id（族名可与实体前缀同头，如卷二十一的 body_need）：从全书登记处解析，不逐个手加。
// 来源：卷二 §1.9"词表族前缀（首批全表，族名 → 前缀）"一段的 `族名→前缀` 对；各卷标题含"词表族"的小节里，表格首列的族名（`族名` 或 族名 → `前缀`）与标题里点名的 `族名`。
const FAMILIES = (() => {
  const DIR = 'F:/dnd/docs/统一底层设计/';
  const fam = new Set(); const ok = (s) => /^[a-z][a-z0-9_]*$/.test(s);
  for (const f of readdirSync(DIR).filter((x) => /^卷.*\.md$/.test(x))) {
    const src = f.startsWith('卷四-') ? text : readFileSync(DIR + f, 'utf8');
    const ls = src.replace(/\r\n/g, '\n').split('\n'); const end = ls.findIndex((l) => l.startsWith('## 附录')); const body = end >= 0 ? ls.slice(0, end) : ls;
    let inFam = false, in19 = false;
    for (const l of body) {
      if (/^#{2,4} /.test(l)) { inFam = /^#{3,4} .*词表族/.test(l); in19 = f.startsWith('卷二-') && /^### 1\.9 /.test(l); if (inFam) for (const m of l.matchAll(/`([a-z][a-z0-9_]*)`/g)) if (!/_$/.test(m[1])) fam.add(m[1]); continue; }
      if (in19 && l.includes('词表族前缀（首批全表')) for (const m of l.matchAll(/([a-z][a-z0-9_]*)→`[a-z0-9_]+_`/g)) fam.add(m[1]);
      if (inFam && /^\| /.test(l)) { const c0 = l.split('|')[1].trim(); const m = c0.match(/^`([a-z][a-z0-9_]*)`/) || c0.match(/^([a-z][a-z0-9_]*) *→/); if (m && ok(m[1])) fam.add(m[1]); }
    }
  }
  return fam;
})();
const scanned = [];
for (const h of h2) {
  if (h.title.startsWith('§1') || h.title.startsWith('§7')) continue;
  let skip = false;
  for (let i = h.start; i < h.end; i++) {
    const l = lines[i];
    if (/^#### 4\.\d+\.5 /.test(l)) skip = true; else if (/^#{2,4} /.test(l)) skip = false;
    if (!skip) scanned.push({ i: i + 1, l });
  }
}
const idHits = [];
for (const { i, l } of scanned) for (const m of l.matchAll(ID)) if (!ALLOW.has(m[0]) && !FAMILIES.has(m[0])) idHits.push(`${i}:${m[0]}`);
check('规则与表格正文无具体实体 id 字面量', idHits.length === 0, idHits.slice(0, 8).join(' '));

// 4 用于判断的自然语言文本：§2–§6、§8 内不得出现对中文字面量的正则、相等、包含判断
const CJK = '[\\u4e00-\\u9fff]';
const TEXTJUDGE = [
  new RegExp(`/[^/\\s]*${CJK}[^/]*/\\s*\\.test`),
  new RegExp(`(===|!==|==|!=)\\s*['"][^'"]*${CJK}`),
  new RegExp(`\\.(includes|startsWith|endsWith|indexOf|match|test)\\(\\s*['"/][^)]*${CJK}`),
];
const tjHits = scanned.filter(({ l }) => TEXTJUDGE.some(r => r.test(l))).map(x => x.i);
check('正文无读中文或英文描述文本作判断的写法', tjHits.length === 0, tjHits.join(','));

// 5 不定义谓词
const PRED = [/function\s+(can|awake|capacity|dead)\b/, /(?<![.\w`])(awake|capacity|dead)\s*(?:\(.*\))?\s*=(?!=)/];
const predHits = scanned.filter(({ l }) => PRED.some(r => r.test(l))).map(x => x.i);
check('本卷未定义 can / awake / capacity / dead', predHits.length === 0, predHits.join(','));
check('§3.2 声明不导出任何谓词', text.includes('本卷**不导出任何谓词**'));

// 6 台账判给本卷的概念
const subText = n => (subs.find(s => s.n === n)?.lines ?? []).join('\n');
const s2 = body(sec('§2')).join('\n');
// 去留表判定（见第二版"去留表"一项）：卷二路径可由第 3 个参数给（注入测试用副本）
function holdTable() {
  const err = [];
  const v2p = process.argv[3] ?? 'F:/dnd/docs/统一底层设计/卷二-维度表规范与统一入口.md';
  const v2 = readFileSync(v2p, 'utf8');
  const en = name => { const m = v2.match(new RegExp('`' + name + '`（([a-z_ ]+)；')); return m ? m[1].trim().split(/\s+/) : null; };
  const TERM = en('term_record'), REV = en('revive_record');
  if (!TERM || !REV) { err.push('卷二未读到 term_record / revive_record 取值'); return { err }; }
  const ls = s2.split('\n'); const h = ls.findIndex(l => /^\|/.test(l) && /`atTerminate`/.test(l) && /`atRevive`/.test(l));
  if (h < 0) { err.push('§2 无去留表'); return { err }; }
  const head = ls[h].split('|').slice(1, -1).map(c => c.trim()); const iT = head.indexOf('`atTerminate`'), iR = head.indexOf('`atRevive`');
  const rows = []; for (let i = h + 2; i < ls.length && ls[i].startsWith('|'); i++) rows.push(ls[i].split('|').slice(1, -1).map(c => c.trim()));
  const code = c => (c.match(/^`([a-z_]+)`$/) || [])[1] ?? null;
  for (const r of rows) {
    const t = code(r[iT]), v = code(r[iR]), p = r[0].slice(0, 40);
    if (!TERM.includes(t)) err.push(`${p} atTerminate=${r[iT]} 不在 term_record{${TERM.join(',')}}`);
    if (t === 'hold' ? !REV.includes(v) : r[iR] !== '—') err.push(`${p} atRevive=${r[iR]}（atTerminate=${t} 时${t === 'hold' ? '须取 revive_record{' + REV.join(',') + '}' : '不得写'}）`);
  }
  const reg = lines.find(l => /^- record_class（/.test(l)) || '';
  const nReg = [...new Set([...reg.matchAll(/`(rcls_[a-z_]+)`/g)].map(m => m[1]))].length;
  if (nReg !== rows.length) err.push(`去留表 ${rows.length} 行，record_class 登记 ${nReg} 个`);
  return { err, rows: rows.length };
}
const need = [
  ['物种 schema', subText(1) + s2, ['taxon', 'bodyPlan', 'bodyMassKg', 'tissues', 'S-1', 'speciesView']],
  ['身体部件图、capability、body.* 的来源', subText(2) + subText(11) + s2, ['parts', 'contributes', 'capability', 'partIntegrity', 'B-7', '五项来源', 'body.consciousness', 'body.moving', 'body.manipulation', 'bodyView']],
  ['attr 词表', subText(3) + s2, ['attr', 'heritability', 'agingCurve', 'attrMod', 'A-6']],
  ['年龄寿命与成年年龄', subText(4), ['adultAge', 'maturityYears', 'lifespanYears', 'lifeStage', 'vitalRates', '生活水准']],
  ['承载能力与负重公式', subText(6), ['loadCapacityKg', 'carriedKg', 'speedFactor', 'staminaFactor', 'loadOf', 'moveSpeedOf']],
  ['代谢', subText(7), ['dailyFoodNeed', 'metabolismMult', 'edibleBy', 'T-5']],
  // 第五版改锚点：'第一段'、'第二段' 是两段式死亡的用词，已按李白复生裁定（第四版）从正文删除；
  // 换成现行写法里同一概念的锚点（身死 D-2、终止五步 D-3a、清理函数 settleBody、触发入口 requestRevive），项数由 6 增到 8。
  ['死亡结算与尸体产出', subText(8), ['die', 'carcassOf', 'revive', 'D-2 身死', 'D-3a 终止 = 协议的五步', 'settleBody', 'requestRevive', '复生点']],
  ['身份键与认出', subText(9), ['keyId', 'identify', 'presentedKey', 'maskQuality', 'K-4']],
  ['人物本体', subText(10), ['personView', 'occupation', 'instantiatePerson', 'P-5']],
  ['角色创建、出身、母语', subText(12), ['createCharacter', 'origin', 'nativeLanguage', 'G-2']],
  ['外貌与遗传（本卷内）', subText(5), ['遗传律', 'lookKey', 'residualFactor']],
];
for (const [name, t, kws] of need) { const miss = kws.filter(k => !t.includes(k)); check(`台账概念写全：${name}`, miss.length === 0, miss.length ? '缺 ' + miss.join('、') : ''); }

// 7 卷一、卷二引用须带标题：卷X §n（标题）；连写（–、/、至）时末尾带一次即可
const REF = /卷[一二] §[0-9A-Za-z.]+(?:(?:[–、/]|至 ?)§[0-9A-Za-z.]+)*/g;
const bare = [];
lines.forEach((l, i) => { for (const m of l.matchAll(REF)) { const next = l[m.index + m[0].length]; if (next !== '（') bare.push(`${i + 1}:${m[0]}`); } });
check('卷一、卷二引用均带标题', bare.length === 0, `${bare.length} 处  ${bare.slice(0, 40).join(' | ')}`);

// 8 §7.3 睡眠正则逐行表
const s7 = body(sec('§7'));
const rows = s7.map(l => /^\| (\d+) \| ([a-z-]+)\.mjs:(\d+) \| (.+?) \| (Z\d)(.*) \|$/.exec(l)).filter(Boolean);
const files = new Set(rows.map(r => r[2]));
const tally = {};
for (const r of rows) tally[r[5]] = (tally[r[5]] ?? 0) + 1;
check('§7.3 逐行表 88 行、编号连续', rows.length === 88 && rows.every((r, k) => Number(r[1]) === k + 1), `实得 ${rows.length}`);
check('§7.3 涉及 65 个文件', files.size === 65, `实得 ${files.size}`);
check('§7.3 无重复的 文件:行', new Set(rows.map(r => r[2] + ':' + r[3])).size === rows.length);

// 8b 第二版：一审裁定逐项落地（只查文字是否到位，不判设计对错）
const s3 = body(sec('§3')).join('\n'), s5 = body(sec('§5')).join('\n'), s7t = s7.join('\n'), s8t = body(sec('§8')).join('\n');
const v2 = [
  ['裁定1 死亡用卷二 §2.6 终止协议（terminate、entity_terminated、E-TERM-RESIDUE、三种后继）', ['terminate(', 'entity_terminated', 'E-TERM-RESIDUE', 'inherit', 'liquidate', 'wreck', 'successorId', 'verb 族句柄'].every(k => subText(8).includes(k))
    // 第五版改锚点：deathSweep、expiresMinute 是两段式死亡的入口与字段，第四版按复生裁定删除；
    // 原"必须出现"改为"全文不得再出现"，并要求现行写法的三个锚点在场。
    && !/deathSweep|expiresMinute|`deaths\./.test(text) && ['requestRevive', 'reviveWindowDays', '同一事务内调 `terminate'].every(k => subText(8).includes(k))],
  // 第五版改锚点：原句以"第二段"开头，该词已删；同一断言（本卷在终止里做的事由协议后继步骤内触发、在标记之前）改锚到 D-3a 的现行句子，并加查步骤号。
  ['裁定1 写明本卷的终止收尾由协议后继步骤内、标记之前触发', /本卷在终止里自己做的只有尸体产出（D-4）[^\n]*后继步骤内触发[^\n]*写终止标记（第 2 步）之前/.test(subText(8)) && subText(8).includes('settleBody')],
  // 第五版：卷二第十六版起事件名带 verb_ 前缀，禁令模式同时覆盖新旧两种写法。
  ['Q-19 裁定：没有"终止后再清理"', !/订阅 `(verb_)?entity_terminated` (时删|产出)|事件到达(时|后)|`carcass` 项/.test(text)],
  ['裁定1 旧写法已清（后继类型为遗产、两段式、rules.death.revival）', !/后继类型为遗产|两段式|rules\.death\.revival/.test(text)],
  ['裁定2 lookKey 不用哈希、改元组键', subText(5).includes('struct:lookKey') && subText(5).includes('不做任何哈希') && !/确定性哈希|哈希所得/.test(text) && !/"lookKey":\s*\d/.test(text)],
  ['裁定3 成长与漂移走修正项、不写偏离行', !/成长偏离|(?<!不)写偏离行；|漂移由卷二十六写偏离|成长与漂移的偏离|成长写偏离/.test(text) && subText(3).includes('唯一的写入点') && subText(10).includes('成长与漂移不进偏离行')],
  ['裁定4 部位折算项各用各的来源 id', subText(2).includes('每个部位用各自的来源 id') && subText(2).includes('B-5a') && subText(2).includes('第六种')],
  ['裁定5 谓词禁令按 import 图与调用图', /P-5 \| 本地谓词，按 import 图与调用图判/.test(s3) && !/定义名为 `awake`/.test(s3)],
  ['裁定5 88 行清零改为按模式类别扫描', /P-8 \| 读文字判断睡眠、清醒/.test(s3) && !/88 行与 §7\.4 所列各行在迁移完成后命中数为 0/.test(text)],
  ['裁定6 magic-ritual:41 已列', s7t.includes('magic-ritual.mjs:41')],
  ['裁定6 非正则睡眠文字 18 行已列', ['entity-view.mjs:252', 'npc-state.mjs:17', 'remote-generation.mjs:295', 'magic-mind-space.mjs:225', 'magic-mind-space.mjs:114', 'education-state.mjs:259', 'magic-light.mjs:70', 'action-router.mjs:699', 'npc-obligations.mjs:211'].every(k => s7t.includes(k))],
  ['裁定6 状态字列表、年龄 18、hp 比较三组各有检索式与处置', ['### 7.7', 'Y1', 'Y2', 'Y3', '126 行', '25 行', '59 行'].every(k => s7t.includes(k))],
  ['裁定6 npc-growth:28 改为 Z4 → Z3', /npc-growth\.mjs:28 \|[^\n]*\| Z4 → Z3 \|/.test(s7t)],
  ['裁定7 活体产出（renewables、renewableOf、takeRenewable）', ['renewables', 'renewableOf', 'takeRenewable', 'T-7', 'T-8', 'T-9'].every(k => subText(7).includes(k)) && !/`products` \| map<ref item/.test(text)],
  ['裁定7 身体能力参与制作与劳作（workInputs）并交卷三、卷十四使用', ['workInputs', 'capabilityWeights', 'attrWeights', 'C-7'].every(k => subText(11).includes(k)) && /`workInputs` \|[^\n]*卷三乙 §4\.8[^\n]*卷十四/.test(s5)], // 根因A：卷三拆卷后改指卷三乙 §4.8
  ['其余：阶段表为数值结构、E-SPECIES-MATURITY', s2.includes('relMaturityMin') && s2.includes('E-SPECIES-MATURITY') && !/"when":"subject\.relMaturity/.test(text)],
  ['其余：示人键可选（presenting、presentIdentity）', subText(9).includes('presentIdentity') && s2.includes('presenting.<person>')],
  ['其余：不泄密断言为等式', /严格等于 `presentedKey\(subject\)`/.test(subText(9))],
  ['其余：容差键、群体需要入口、体重遗传参数、生育状态字段', ['rules.tolerance', 'massHeritability', 'conceptions.<person>', 'lastBirthMinute', 'revivals.<person>.lastMinute'].every(k => s2.includes(k)) && subText(7).includes('groupNeeds')],
  ['其余：moveSpeedOf 只接受个体', subText(6).includes('**只接受个体**')],
  ['其余：母语前提读 sapient', subText(12).includes('`sapient` 为假的个体，`nativeLanguage` 记 gap')],
  ['Q-10 已结', /Q-10 \| （第二版已结）/.test(s8t)],
  ['卷末有小项记账栏与影响面表', raw.includes('## 附 一审小项记账栏') && raw.includes('## 附 第二版影响面表')],
];
for (const [name, ok] of v2) check(`第二版：${name}`, Boolean(ok));

// 8c 第三版：二审两项余项（B-13 living 归卷六；N-1 判死统一调 terminated）
const s0 = body(sec('§0')).join('\n');
const v3 = [
  ['B-13 living 由卷六定义、本卷只引用，Q-1 已结', /卷六（家户消费） \| 生活水准 `living`/.test(s0) && /Q-1 \| （第三版已结）/.test(s8t) && /卷六（家户消费） \| 读生活水准/.test(s5) && /卷六、全书概念台账 \|/.test(s5)],
  ['B-13 旧写法已清（无定义方、待指定、待定、本卷自定未知处置）', !/没有定义方|目前没有定义方|定义方非本卷|提供 `living`，待定|未知时该主体当日不做|`living` 未知时两项都返回/.test(text)],
  ['B-13 单点在 §0.2 并附牵连清单', /生活水准 `living` 的出处（本卷单点[^\n]*牵连清单/.test(s0)],
  ['N-1 判死单点在 §3.2 并附牵连清单', /\*\*判死（本卷单点[^\n]*terminated\(subject\)[^\n]*牵连清单/.test(s3)],
  // 第五版改锚点：D-2 的标题由"第一段"改为"身死"（第四版复生裁定），断言内容不变。
  ['N-1 D-2、Y1、Y3、§7.5 都调 terminated', /D-2 身死[^\n]*`terminated\(主体\)`/.test(subText(8)) && /\*\*Y1\*\*[^\n]*`terminated\(subject\)`/.test(s7t) && /\*\*Y3\*\*[^\n]*`terminated\(subject\)`/.test(s7t) && /isPhysicallyDead[^\n]*`terminated\(subject\)`/.test(s7t)],
  ['N-1 旧判死写法已清（读终止类实例是否存在、并上 state.terminated）', !/终止类实例是否存在|终止类状态实例是否存在|已有终止类实例或已在|或该个体已登记在 `state\.terminated`/.test(text)],
  ['N-1 P-5 禁读 terminal 保留且不为判死开豁免', /P-5 \|[^\n]*`terminal`、`incapacitating`、`suppressesAwake`[^\n]*判死不在豁免之列/.test(s3)],
  ['影响面表有第三版一行', /\| 二审 B-13、N-1（第三版） \|/.test(raw)],
];
for (const [name, ok] of v3) check(`第三版：${name}`, Boolean(ok));

// 8d 第五版：对齐卷二第十七版；收尾待办；全书同类清单
const sub = n => subText(n);
const v5 = [
  // 第六版改锚点：版本号加一，标题随之改；断言内容（标题带现行版本号）不变。
  // 第七版改锚点：版本号加一，标题随之改；断言内容（标题带现行版本号）不变。
  // 第九版改锚点：版本号改为现行的第九版，标题随之改；断言内容（标题带现行版本号）不变。
  // 第十版改锚点（主会话 11-13）：版本号改为现行的第十版，标题随之改；断言内容（标题带现行版本号）不变。
  ['标题为现行版本（第十版）', /^# 卷四 [^\n]*（第十版）/.test(raw)],
  ['终止步骤号：第 1 步定后继与领域清理、第 2 步标记', /第 1 步定后继与领域清理[^\n]*第 2 步写终止标记/.test(sub(8)) && !/第 1 步写终止标记|第 2 步按类别行的 `termination` 定后继|协议第 2 步(读|原地生成)/.test(text)],
  ['事件名带 verb_ 前缀，无裸旧名', !/(?<!verb_)entity_(terminated|revived)/.test(text)],
  ['termination 无缺省的旧写法已清', !/取协议缺省 `wreck`|其余取缺省 `wreck`|缺省 0，即终止不可逆|类别行未填 termination/.test(text)],
  // 2026-11-15 改判据（李白裁定：复生后复生点清掉；9717b642 拆出 revivals.<person>.points 记录类 hold/clear）：
  // 原写死"revivals.* 为 hold/keep、identities.* 为 keep"，改为按去留表各行登记的取值判：取值域读卷二 §1.9 两个代码内封闭枚举
  // term_record、revive_record；每行 atTerminate 在 term_record 内；atRevive 当且仅当 atTerminate 为 hold 时写、且在 revive_record 内
  // （卷二 §2.6"领域清理的两个登记点"）；表的行数等于本卷 record_class 登记的条目数。
  ['去留表：只登记不自删、各行取值合卷二两枚举、行数等于登记的记录类数', (() => { const r = holdTable(); if (r.err.length) console.error('去留表：' + r.err.join('；')); return ['subjectRecords', 'rules.terminate.records', 'atTerminate', 'atRevive', '本卷只登记，不自己删'].every(k => s2.includes(k)) && r.err.length === 0; })()],
  // 第六版改锚点：李白对余项单核 N-1 的裁定把身份键收尾移给 identity 系统，settleBody 由"两件事"变"一件事"；
  // 正向锚点随之改写并加查"两件事"不得再出现，原有两条禁用写法照查。
  ['settleBody 不删簿记', /`settleBody` 只做一件事/.test(sub(8)) && !/`settleBody` 只做两件事/.test(text) && !/`settleBody` 做三件事|删除本卷以该个体为键的簿记路径/.test(text)],
  ['复生只引用卷二：本卷无自设窗口或待复生状态的写法', !/windowDays(?<!reviveWindowDays)/.test(text.replace(/原 `windowDays`/g, '')) && sub(8).includes('本卷不另写规则')],
  ['Q-19 已结、Q-20 只余 (a)', /Q-19 \|[^\n]*（第五版已结）/.test(s8t) && /Q-20 \|[^\n]*仍开放的只有 \(a\)/.test(s8t)],
  ['物种维度已登记（卷二十一、卷五 Q3）', ['`growthRate`', '`restartKg`', '`coverDim`', '`coreTempC`', '`coolingC`', '`pharmSensitivity`'].every(k => s2.includes(`| ${k} |`))],
  ['个体维度 sensitivity、fatKg 已登记', s2.includes('| `sensitivity` |') && s2.includes('| `fatKg` |') && /`tissue` \|[^\n]*`reserve: boolean`/.test(s2)],
  ['性情由本卷定义、一切物种必填、带反号校验', /`temperament` \|[^\n]*本卷定义，全书只此一处[^\n]*一切物种必填[^\n]*E-SPECIES-TEMPERAMENT/.test(s2) && s2.includes('rules.species.temperamentAxis')],
  ['可食由材料推出：feeds 退役', !/`feeds`(?! 退役| 类别名单退役|[^\n]{0,12}退役)/.test(text.replace(/原 `feeds` 退役|不再有 `feeds`|`feeds` 类别名单退役|"`diet` 条目的 `feeds` 指向某类别"/g, '')) // 第七版改锚点：assimilation 的类型由一个数改为按本源成分的结构（李白 11-13 对饱腹标定的裁定）；其余字段与次序照查。
    // 李白 11-14 22:49 改锚点：bySubstance 值类型改为 fraction nullable（键全覆盖 substance 族，缺即显式 null）
    && /`diet` \| `eats: rx`；`assimilation: struct\{bySubstance: map<ref vocab substance, fraction nullable>, other: fraction nullable\}`；`eatsTaxa: set<ref vocab taxon>`；`primaryConsumer: boolean`/.test(s2)],
  ['可食：T-4 按份判、有 edibleShareOf 与阈值键', /T-4 可食（由材料与消化能力推出，按份判，不按整件判）/.test(sub(7)) && ['edibleShareOf', 'edibleShareMin', 'E-DIET-EATS'].every(k => (sub(7) + s2).includes(k)) && !/类别集合（沿上位链展开）与该物种/.test(text)],
  ['部位完好度判据按目标判（加载期与运行期）', /E-BODY-INTEGRITY-TARGET \| 任何以 `body_plan\.partIntegrity` 为目标的修正项[^\n]*加载期[^\n]*运行期/.test(s2) && /按目标把关，不按来源种类列举/.test(sub(2)) && !/或 `partIntegrity` 为目标的修正来源/.test(text)],
  ['§2.7 新错误码四个', ['E-SPECIES-GROWTH', 'E-SPECIES-TEMPERAMENT', 'E-DIET-EATS', 'E-DIET-PREY'].every(k => s2.includes(`| ${k} |`))],
  ['开放问题 Q-21 至 Q-23 在册', ['Q-21', 'Q-22', 'Q-23'].every(k => new RegExp(`\\| ${k} \\|`).test(s8t))],
  ['影响面表有第五版一行', /（第五版） \|/.test(raw.slice(raw.indexOf('## 附 第二版影响面表')))],
];
for (const [name, ok] of v5) check(`第五版：${name}`, Boolean(ok));

// 8e 第六版：余项单核 N-1（身份键收尾归 identity 系统的清理函数）、N-3（primaryConsumer 派生）、Q-21 转交
const dietRow = (s2.split('\n').find(l => l.startsWith('| `diet` | `eats: rx`')) ?? '');
const deriveDefs = text.split('\n').filter(l => /`primaryConsumer`[^\n]*为真 ⇔[^\n]*`rules\.diet\.primarySubstances`/.test(l) && !/^- /.test(l) && !/^\| Q-/.test(l));
const deathRow = (s5.split('\n').find(l => /^\| death \| death\.mjs \|/.test(l)) ?? '').split('|');
const v6 = [
  ['N-1 identity 系统另登记清理函数（§3.3、D-3a、§5.3、§5.4 四处都有）', [s3, sub(8), s5].every(t => t.includes('`systems.identity.terminationCleanup`') || t.includes('systems.identity.terminationCleanup')) && [s3, sub(8), s5].every(t => t.includes('closeIdentities'))
    && /\| identity \| identity\.mjs \|[^\n]*closeIdentities/.test(s5) && /卷二 §2\.7（系统声明表）[^\n]*`systems\.death\.terminationCleanup`[^\n]*`systems\.identity\.terminationCleanup`/.test(s5)],
  ['N-1 settleBody 只做尸体产出：§3.3 该行不写 identities、通道只有物品写者', /^\| `settleBody\(engine[^\n]*\| 只做尸体产出，不写身份键（[^\n|]*\| 物品写者 \|$/m.test(s3) && !(s3.split('\n').find(l => l.startsWith('| `settleBody(')) ?? 'identities').split('|').slice(3).join('|').includes('identities')],
  ['N-1 closeIdentities 归 identity.mjs、只填 until', /^\| `closeIdentities\(engine[^\n]*\| identity\.mjs（identity[^\n]*\| 只给被终止个体名下[^\n]*填 `until`[^\n]*\| 声明写者 \|$/m.test(s3)],
  ['N-1 旧写法已清（death 的清理函数写身份键）', !/identity\.mjs 的登记写者|填 `until` 经 identity\.mjs 导出的函数写|尸体产出；给其身份键填 `until`|由本卷登记的清理函数 `settleBody` 在终止第 1 步内完成|尸体与身份键收尾由协议在第 1 步内调 `settleBody`|调 settleBody：本卷新建尸体物品、给身份键填/.test(text)
    // §5.3 death 行的"写的状态路径"一格（第 4 格）不得有 identities
    && deathRow.length > 5 && !deathRow[4].includes('identities')],
  ['N-3 无手填：数据实例里没有 primaryConsumer 键，diet 行写明派生、写了即报错', !/"primaryConsumer"\s*:/.test(text) && /`primaryConsumer: boolean`（派生字段，数据行不得填写/.test(dietRow) && dietRow.includes('E-DIM-DERIVED-WRITTEN')
    && /扫描式（第六版，无手填、无双写）[^\n]*没有 `primaryConsumer` 键[^\n]*E-DIM-DERIVED-WRITTEN/.test(sub(7))],
  ['N-3 无双写：派生式只在 §2.4 写一次，规则表键在 §2.5 登记，Q-22 已结', deriveDefs.length === 1 && deriveDefs[0] === dietRow && /腐坏进度取 0 时/.test(dietRow)
    && /^\| `rules\.diet\.primarySubstances` \| set<ref vocab substance>/m.test(s2) && /不变量式（第六版）[^\n]*`primaryConsumer` 为真 ⇔/.test(sub(7)) && /Q-22 \|[^\n]*（第六版已结/.test(s8t)],
  ['Q-21 已由李白裁定交卷三甲乙', /Q-21 \|[^\n]*已由李白裁定交卷三甲乙/.test(s8t)],
  ['影响面表有第六版一行', /（第六版） \|/.test(raw.slice(raw.indexOf('## 附 第二版影响面表')))],
];
for (const [name, ok] of v6) check(`第六版：${name}`, Boolean(ok));

// 8f 第七版：吸收率按食性 × 本源成分（李白 11-13 裁定；卷二 §1.4 饱腹 = 与物种无关的干基总能）
const dietData = text.split('\n').filter(l => /^"diet_[a-z_]+": \{/.test(l));
const assimOk = l => {
  const m = l.match(/"assimilation":(\{"bySubstance":\{[^}]*\},"other":(?:null|[\d.]+)\})/);
  if (!m) return false;
  const a = JSON.parse(m[1]);
  const vals = Object.values(a.bySubstance).concat(a.other === null ? [] : [a.other]);
  return Object.keys(a.bySubstance).every(k => /^subst_[a-z_]+$/.test(k)) && vals.length > 0 && vals.every(v => v >= 0 && v <= 1);
};
const v7 = [
  ['吸收率按食性 × 本源成分：diet 行写明 bySubstance、other 与查不到按不可食', /按\*\*食性 × 本源成分\*\*给/.test(dietRow) && dietRow.includes('`bySubstance[s]`') && /`other` 也为空，这一份此食性利用不了，按不可食计/.test(dietRow)],
  ['T-4 按本源成分查吸收率', /先查 `bySubstance`，没有键取 `other`/.test(sub(7)) && !/利用比例取成立条目中 `assimilation` 最大的那个/.test(text)],
  ['数据实例里每条食性的 assimilation 都是新结构、值在 [0,1]，没有只写一个数的旧写法', dietData.length >= 4 && dietData.every(assimOk) && !/"assimilation":\s*[\d.]/.test(text)],
  ['数据实例给出人、牛、猪的食性配置（实得能量核对读）', /人："diet":\["diet_omnivore"\]/.test(sub(7)) && /牛："diet":\["diet_graze"\]/.test(sub(7)) && /猪："diet":\["diet_omnivore","diet_root"\]/.test(sub(7))],
  ['影响面表有第七版一行', /（第七版） \|/.test(raw.slice(raw.indexOf('## 附 第二版影响面表')))],
];
for (const [name, ok] of v7) check(`第七版：${name}`, Boolean(ok));

// 9 数值示例复算（正文示例里的数）
const lookup = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let k = 1; k < pts.length; k++) if (x <= pts[k][0]) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts.at(-1)[1]; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const allo = [[1, 1.5], [10, 7], [70, 25], [500, 95], [5000, 440]], speed = [[0, 1], [0.5, 1], [1, 0.7], [1.5, 0.3], [2, 0]];
const energy = [[1, 0.04], [10, 0.23], [70, 1], [500, 4.4], [5000, 24.6]];
const nums = [
  ['承载：人 70 kg → 25', lookup(allo, 70), 25, 0.001],
  ['承载：负重比 1.2 → 速度系数 0.54', lookup(speed, 30 / 25), 0.54, 0.001],
  ['承载：驮象 3000 kg × 1.2 → 约 344', lookup(allo, 3000) * 1.2, 344, 0.5],
  ['承载：石质守卫 400 kg × 2 → 约 157', lookup(allo, 400) * 2, 157, 0.5],
  ['代谢：70 kg → 1.00', lookup(energy, 70), 1, 0.001],
  ['代谢：3000 kg → 15.62', lookup(energy, 3000), 15.62, 0.005],
  ['代谢：2 象 + 40 人 → 71.24', 2 * lookup(energy, 3000) + 40, 71.24, 0.01],
  ['遗传余量系数 h²=0.5 → 0.9354', Math.sqrt(1 - 0.5 ** 2 / 2), 0.9354, 0.0001],
  ['遗传余量系数 h²=0.8 → 0.8246', Math.sqrt(1 - 0.8 ** 2 / 2), 0.8246, 0.0001],
  ['遗传余量系数 h²=0.9 → 0.7714', Math.sqrt(1 - 0.9 ** 2 / 2), 0.7714, 0.0001],
  ['遗传示例 → 0.366', 0 + 0.8 * 0.2 + 0.8246 * 0.25, 0.366, 0.0005],
  ['方差守恒 h⁴/2 + r² = 1（h²=0.8）', 0.8 ** 2 / 2 + 0.8246 ** 2, 1, 0.0005],
  ['年龄：17870400 分钟 → 34.5 岁（每年 518400 分钟）', 17870400 / 518400, 34.5, 0.05],
  ['寿命 62 × 0.7 → 约 43 岁入老年段', 62 * 0.7, 43, 0.5],
  ['能力：左手丧失 → 操作 0.7', 1 - 0.3 * (1 - 0), 0.7, 1e-9],
  ['能力：腿完好度 0.5、贡献 0.5 → 移动 0.75', 1 - 0.5 * (1 - 0.5), 0.75, 1e-9],
  ['尸体材料份额之和 = 1', 0.61 + 0.15 + 0.06 + 0.18, 1, 1e-9],
  ['人形组织份额之和 = 1', 0.06 + 0.18 + 0.42 + 0.15 + 0.19, 1, 1e-9],
  ['能力：双手丧失（两条来源各自生效）→ 操作 0.4', 1 - 0.3 - 0.3, 0.4, 1e-9],
  ['阶段校验：人 16 < 30 × 0.7', 30 * 0.7, 21, 1e-9],
  ['阶段校验：龟 25 < 90 × 0.7', 90 * 0.7, 63, 1e-9],
  ['阶段校验反例：12 × 0.7 = 8.4 ≤ 10', 12 * 0.7, 8.4, 1e-9],
  ['活体产出：45 kg × 0.03 × 1 日 → 1.35 kg', 0.03 * 45 * 1 * 1, 1.35, 1e-9],
  ['活体产出：采得比例 0.6 → 0.81 kg', 1.35 * 0.6, 0.81, 1e-9],
  ['活体产出：消化能力 0.5 → 0.675 kg', 0.03 * 45 * 0.5, 0.675, 1e-9],
  ['身体投入：0.8×0.7 + 0.2×1 → 0.76', 0.8 * 0.7 + 0.2 * 1, 0.76, 1e-9],
];
for (const [name, got, want, tol] of nums) check(`数值复算：${name}`, near(got, want, tol), `算得 ${Math.round(got * 10000) / 10000}`);

// 10 统计
const q = body(sec('§8')).filter(l => /^\| Q-\d+ \|/.test(l)).length;
const fullLines = raw.split(/\r?\n/).length;
out.push('');
void fullLines;
out.push(`统计  成稿正文 ${lines.length} 行（不含附录里贴的本输出）；子系统 ${subs.length}；数据实例 ${instanceTotal} 条；开放问题 ${q} 条`);
out.push(`统计  §7.3 处置代号分布 ${Object.keys(tally).sort().map(k => `${k}=${tally[k]}`).join(' ')}（合计 ${rows.length} 行，${files.size} 个文件）`);
const z4 = {}; for (const r of rows) { const m = /^ → (Z\d)/.exec(r[6]); if (r[5] === 'Z4' && m) z4[m[1]] = (z4[m[1]] ?? 0) + 1; }
out.push(`统计  §7.3 中 Z4（常量定义行）各使用点的去向 ${Object.keys(z4).sort().map(k => `${k}=${z4[k]}`).join(' ')}`);
out.push(`结论  ${failed === 0 ? '全部通过' : `有 ${failed} 项失败`}`);
console.log(out.join('\n'));
process.exitCode = failed ? 1 : 0;
