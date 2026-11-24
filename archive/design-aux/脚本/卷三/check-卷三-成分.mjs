// 卷三"成分大类"核对（拆卷后：本源成分词表读卷三甲，去向表、派生大类、类别来源读卷三乙）。只读文档，不改任何文件。
// 用法：node F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-成分.mjs
//   子 第五版手写的十六项成分大类，每项都标明"规则推出"或"基础维度"，并给出理由；
//   丑 派生类与基础维度之间没有双写；
//   寅 手写的 class 族类别仍为 0，赃物份额仍只有一个写者（调 check-卷三-整类.mjs）。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIR = 'F:/dnd/docs/统一底层设计/';
const JIA = DIR + '卷三甲-物质本源.md';
const DOC = DIR + '卷三乙-物态类别与物品.md';
const V5 = DIR + '版本快照/卷三-v5.md';
const OUT_MARK = '<!--SUBSTANCE-CHECK-OUTPUT-->';

const out = [];
let fail = 0;
const say = (ok, msg) => { out.push((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fail += 1; };
const note = (msg) => out.push('     ' + msg);

const raw = readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');
const jia = readFileSync(JIA, 'utf8').replace(/\r\n/g, '\n').split('\n');
const both = [...jia.map((l, i) => ({ l, at: '甲:' + (i + 1) })), ...lines.map((l, i) => ({ l, at: '乙:' + (i + 1) }))];
const cellsOf = (l) => l.split('|').slice(1, -1).map((c) => c.trim());
const blockOf = (ls, begin, end) => {
  const a = ls.findIndex((l) => l.startsWith(begin));
  const b = ls.findIndex((l) => l.startsWith(end));
  return a >= 0 && b > a ? ls.slice(a + 1, b) : [];
};
const block = (begin, end) => blockOf(lines, begin, end);
const ZH = '[\\u4e00-\\u9fff]+';

// ---------- 取数：第五版的十六项（读快照，不写在脚本里） ----------
const v5line = readFileSync(V5, 'utf8').split('\n').find((l) => l.includes('成分大类（手写进 `categories`）：')) || '';
const old16 = (v5line.split('成分大类（手写进 `categories`）：')[1] || '').split('。')[0]
  .replace(/（[^）]*）/g, '').split('、').map((s) => s.trim()).filter(Boolean);

// ---------- 取数：两个词表行（本源成分在卷三甲，派生大类在卷三乙） ----------
const vocabRow = (ls, prefix) => ls.find((l) => l.startsWith('| ' + prefix + ' → `')) || '';
const pairs = (row, codePrefix) => [...row.matchAll(new RegExp('(' + ZH + ') `(' + codePrefix + '_[a-z_]+)`', 'g'))].map((m) => ({ name: m[1], code: m[2] }));
const substVocab = pairs(vocabRow(jia, 'substance'), 'subst');
const matcatVocab = pairs(vocabRow(lines, 'matcat'), 'matcat');
const substCodes = new Set(substVocab.map((p) => p.code));
const matcatCodes = new Set(matcatVocab.map((p) => p.code));
say(vocabRow(lines, 'substance') === '' && vocabRow(jia, 'matcat') === '', '子0 本源成分词表只登记在卷三甲，派生大类词表只登记在卷三乙（没有两卷各写一遍）');

// ---------- 取数：派生大类条件表、材料类别来源表、十六项归属表 ----------
const ruleRows = block('<!--MATCAT-RULES-BEGIN-->', '<!--MATCAT-RULES-END-->').filter((l) => l.startsWith('| ')).map(cellsOf)
  .filter((c) => c.length === 3 && !/^-+$/.test(c[0].replace(/[\s:]/g, '')) && c[0] !== '派生出的大类');
const ruleNames = new Set(ruleRows.map((c) => c[0]));
const classBlock = block('<!--CLASS-RULES-BEGIN material-->', '<!--CLASS-RULES-END material-->').join('\n');
const table16 = block('<!--SUBSTANCE-16-BEGIN-->', '<!--SUBSTANCE-16-END-->').filter((l) => l.startsWith('| ')).map(cellsOf)
  .filter((c) => c.length === 4 && c[0] !== '原大类' && !/^-+$/.test(c[0]));

// ---------- 子：十六项逐项有归属、有理由 ----------
say(old16.length === 16, '子1 第五版快照里手写的成分大类 ' + old16.length + ' 项（读自 版本快照/卷三-v5.md 的词表行）');
note(old16.join(' '));
const names16 = table16.map((c) => c[0]);
const missing = old16.filter((n) => !names16.includes(n));
const extra = names16.filter((n) => !old16.includes(n));
const dup = names16.filter((n, i) => names16.indexOf(n) !== i);
say(table16.length === 16 && missing.length === 0 && extra.length === 0 && dup.length === 0,
  '子2 归属表 ' + table16.length + ' 行，与十六项一一对应（漏 ' + missing.length + ' 项，多 ' + extra.length + ' 项，重复 ' + dup.length + ' 项）');
missing.concat(extra, dup).forEach(note);
const KINDS = ['规则推出', '基础维度'];
const badKind = table16.filter((c) => !KINDS.includes(c[1])).map((c) => c[0]);
const noReason = table16.filter((c) => c[3].replace(/[`\s]/g, '').length < 10).map((c) => c[0]);
say(badKind.length === 0, '子3 每项的归属都是"规则推出"或"基础维度"二者之一（不合 ' + badKind.length + ' 项）');
badKind.forEach(note);
say(noReason.length === 0, '子3 每项都写了理由（缺或不足十字的 ' + noReason.length + ' 项）');
noReason.forEach(note);
const byRule = table16.filter((c) => c[1] === '规则推出');
const byBase = table16.filter((c) => c[1] === '基础维度');
// 规则推出：代号是派生大类且在条件表里有同名一行；或是物态代号（matter 族）且卷三乙有当时物态的唯一定义。
// 第六版允许的"材料类别规则表里的类别"一条已随裁定撤销，不再算作规则来源。
const stateDef = lines.filter((l) => l.includes('**当时物态（全书唯一定义）**')).length === 1;
const matterRow = lines.find((l) => l.startsWith('| matter → `')) || '';
const ruleBad = [];
for (const c of byRule) {
  const code = (c[2].match(/`([a-z_]+)`/) || [])[1] || '';
  const hasRule = (code.startsWith('matcat_') && matcatCodes.has(code) && ruleNames.has(matcatVocab.find((p) => p.code === code).name))
    || (code.startsWith('matter_') && stateDef && matterRow.includes('`' + code + '`'));
  if (!hasRule) ruleBad.push(c[0] + '：' + code + ' 没有对应的推导规则');
  if (code.startsWith('subst_')) ruleBad.push(c[0] + '：标了规则推出，代号却是基础维度的');
  if (code.startsWith('class_')) ruleBad.push(c[0] + '：代号是类别，物态类已撤销');
}
say(ruleBad.length === 0, '子4 标"规则推出"的 ' + byRule.length + ' 项，每项在卷三乙正文里都有一条推导规则（派生大类条件表，或当时物态的唯一定义；缺 ' + ruleBad.length + ' 项）');
ruleBad.forEach(note);
note('规则推出：' + byRule.map((c) => c[0] + '→' + c[2].replace(/`/g, '')).join(' '));
const baseBad = [];
for (const c of byBase) {
  const code = (c[2].match(/`([a-z_]+)`/) || [])[1] || '';
  if (!substCodes.has(code)) baseBad.push(c[0] + '：' + code + ' 不在本源成分词表里');
}
const baseCodes = byBase.map((c) => (c[2].match(/`([a-z_]+)`/) || [])[1]);
const baseDup = baseCodes.filter((n, i) => baseCodes.indexOf(n) !== i);
say(baseBad.length === 0 && baseDup.length === 0, '子5 标"基础维度"的 ' + byBase.length + ' 项，每项对到卷三甲本源成分词表里的一个固定代号，互不重复（不在词表 ' + baseBad.length + ' 项，重复 ' + baseDup.length + ' 项）');
baseBad.concat(baseDup).forEach(note);
note('基础维度：' + byBase.map((c) => c[0] + '→' + c[2].replace(/`/g, '')).join(' '));
say(byRule.length + byBase.length === 16, '子6 合计：规则推出 ' + byRule.length + ' 项，基础维度 ' + byBase.length + ' 项，共 ' + (byRule.length + byBase.length) + ' 项');

// ---------- 丑：派生类与基础维度之间没有双写 ----------
const sfx = (c) => c.replace(/^[a-z]+_/, '');
const sameCode = [...matcatCodes].filter((m) => [...substCodes].some((s) => sfx(s) === sfx(m)));
const sameName = matcatVocab.filter((m) => substVocab.some((s) => s.name === m.name)).map((m) => m.name);
say(substVocab.length > 0 && matcatVocab.length > 0 && sameCode.length === 0 && sameName.length === 0,
  '丑1 本源成分词表 ' + substVocab.length + ' 项，派生大类词表 ' + matcatVocab.length + ' 项，两边没有同义条目（代号后缀相同 ' + sameCode.length + ' 个，中文名相同 ' + sameName.length + ' 个）');
sameCode.concat(sameName).forEach(note);
note('本源成分：' + substVocab.map((p) => p.code).join(' '));
note('派生大类：' + matcatVocab.map((p) => p.code).join(' '));
const noRule = matcatVocab.filter((p) => !ruleNames.has(p.name)).map((p) => p.name);
const noVocab = [...ruleNames].filter((n) => !matcatVocab.some((p) => p.name === n));
const aliasOnly = [];
for (const c of ruleRows) {
  const toks = [...(c[1] + ' ' + c[2]).matchAll(/`([A-Za-z_.]+)`/g)].map((m) => m[1]).filter((t) => !t.startsWith('rules.') && !t.startsWith('subst_'));
  const others = toks.filter((t) => t !== 'substance');
  if (others.length === 0 && !/组件类/.test(c[1])) aliasOnly.push(c[0]);
}
say(ruleRows.length === matcatVocab.length && noRule.length === 0 && noVocab.length === 0,
  '丑2 派生大类条件表 ' + ruleRows.length + ' 条，与词表逐项对应（词表里没条件的 ' + noRule.length + ' 项，有条件没登记的 ' + noVocab.length + ' 项）');
noRule.concat(noVocab).forEach(note);
say(aliasOnly.length === 0, '丑2 没有只读本源成分、等于换名重写一遍的派生大类（命中 ' + aliasOnly.length + ' 条）');
aliasOnly.forEach(note);
// 丑3 一个类别只有一条来源：本源成分给的、派生大类给的两组互不相交；第三条来源（材料类别规则表）必须不存在
const derive = block('<!--MATERIAL-DERIVE-BEGIN-->', '<!--MATERIAL-DERIVE-END-->').join('\n');
const fromSubst = new Set([...derive.matchAll(/`subst_[a-z_]+`→`(class_[a-z_]+)`/g)].map((m) => m[1]));
const fromCat = new Set([...derive.matchAll(/`matcat_[a-z_]+`→`(class_[a-z_]+)`/g)].map((m) => m[1]));
const thirdSource = classBlock.split('\n').filter((l) => l.includes('rules.materials.classRules')).length;
const twice = [...fromSubst].filter((c) => fromCat.has(c));
const blockClasses = new Set(classBlock.match(/class_[a-z_]+/g) || []);
const notInBlock = [...fromSubst, ...fromCat].filter((c) => !blockClasses.has(c));
say(fromSubst.size > 0 && fromCat.size > 0 && thirdSource === 0 && twice.length === 0 && notInBlock.length === 0 && blockClasses.size === fromSubst.size + fromCat.size,
  '丑3 材料类别的两条来源互不相交：本源成分给 ' + fromSubst.size + ' 个，派生大类给 ' + fromCat.size + ' 个，出自两条来源的 ' + twice.length + ' 个；第三条来源（物态类的规则表）' + thirdSource + ' 处；来源表与核对值表所列类别一致（差 ' + notInBlock.length + ' 个）');
twice.concat(notInBlock).forEach(note);
// 丑4 数据行：没有手写的 categories；substance 每行至多一个值、值在词表里；两卷全文的 matcat_、subst_ 代号都在两个词表里
const handCats = []; const multi = []; const strayS = new Map(); const strayM = new Map(); let substRows = 0;
both.forEach(({ l, at }) => {
  if (/categories"?\s*:\s*\[/.test(l)) handCats.push(at);
  const vals = [...l.matchAll(/substance"?\s*:\s*"?(subst_[a-z_]+)/g)].map((m) => m[1]);
  if (vals.length) substRows += 1;
  if (vals.length > 1) multi.push(at);
  for (const m of l.matchAll(/(?<![A-Za-z0-9_])subst_[a-z_]+/g)) if (!substCodes.has(m[0])) { if (!strayS.has(m[0])) strayS.set(m[0], []); strayS.get(m[0]).push(at); }
  for (const m of l.matchAll(/(?<![A-Za-z0-9_])matcat_[a-z_]+/g)) if (!matcatCodes.has(m[0])) { if (!strayM.has(m[0])) strayM.set(m[0], []); strayM.get(m[0]).push(at); }
});
say(handCats.length === 0, '丑4 数据行里手写 categories 0 处（卷三甲 ' + jia.length + ' 行、卷三乙 ' + lines.length + ' 行逐行扫，未排除任何行；命中 ' + handCats.length + ' 处' + (handCats.length ? '：' + handCats.join(',') : '') + '）');
say(multi.length === 0 && strayS.size === 0, '丑4 数据行里写 substance 的 ' + substRows + ' 行，每行只有一个值；两卷全文的 subst_ 代号都在封闭词表里（一行多值 ' + multi.length + ' 处，词表外代号 ' + strayS.size + ' 个）');
[...strayS].forEach(([c, at]) => note(c + ' @ ' + at.join(',')));
say(strayM.size === 0, '丑4 两卷全文的 matcat_ 代号都是派生大类；第五版成分大类的旧代号 0 处（词表外代号 ' + strayM.size + ' 个）');
[...strayM].forEach(([c, at]) => note(c + ' @ ' + at.join(',')));
// 丑5 手写与推出不混栏：卷三甲全集表的本源成分栏里没有派生大类代号；卷三乙应得结果表的两个推出栏里没有本源成分代号
const dataRows = blockOf(jia, '<!--MATERIAL-DATA-BEGIN-->', '<!--MATERIAL-DATA-END-->').filter((l) => /^\| mat_/.test(l)).map(cellsOf);
const dataHead = cellsOf(blockOf(jia, '<!--MATERIAL-DATA-BEGIN-->', '<!--MATERIAL-DATA-END-->').find((l) => l.startsWith('| 代号')) || '');
const sc = dataHead.indexOf('本源成分');
const handHasCat = dataRows.filter((c) => /matcat_/.test(c[sc])).map((c) => c[0]);
const derivedCols = dataHead.filter((h) => /派生大类|类别|物态|硬度|韧性/.test(h));
const expRows = block('<!--EXPECT-BEGIN-->', '<!--EXPECT-END-->').filter((l) => /^\| mat_/.test(l)).map(cellsOf);
const outHasSubst = expRows.filter((c) => /subst_/.test(c[2]) || /subst_/.test(c[3])).map((c) => c[0]);
const both2 = dataRows.filter((c) => /subst_/.test(c[sc]) && /matcat_/.test((expRows.find((e) => e[0] === c[0]) || [])[2] || '')).length;
say(dataRows.length > 0 && expRows.length === dataRows.length && handHasCat.length === 0 && outHasSubst.length === 0 && derivedCols.length === 0,
  '丑5 卷三甲全集表 ' + dataRows.length + ' 行：本源成分栏里写派生大类的 ' + handHasCat.length + ' 行，表里的派生结果列 ' + derivedCols.length + ' 个；卷三乙应得结果表 ' + expRows.length + ' 行：推出栏里出现本源成分代号的 ' + outHasSubst.length + ' 行（既有本源成分又另推出派生大类的 ' + both2 + ' 行，两者说的不是一件事）');
handHasCat.concat(outHasSubst, derivedCols).forEach(note);
// 丑6 substance 只登记在卷三甲的材料表；categories 在卷三乙登记为派生
const sec = (ls, t) => ls.findIndex((l) => l.startsWith(t));
const inMat = jia.slice(sec(jia, '### 2.1 '), sec(jia, '### 2.2 ')).filter((l) => l.startsWith('| `substance`')).length;
const inOther = lines.slice(sec(lines, '### 2.1 '), sec(lines, '### 2.4 ')).filter((l) => l.startsWith('| `substance`')).length;
const catRow = lines.slice(sec(lines, '### 2.1 '), sec(lines, '### 2.2 ')).find((l) => l.startsWith('| `categories`')) || '';
const catInJia = jia.filter((l) => l.startsWith('| `categories`')).length;
say(inMat === 1 && inOther === 0 && catInJia === 0 && /derived/.test(cellsOf(catRow)[1] || ''),
  '丑6 substance 只登记在卷三甲材料表（' + inMat + ' 行；卷三乙材料派生量、物品、实例、批次各表 ' + inOther + ' 行）；categories 只在卷三乙登记、为派生（卷三甲 ' + catInJia + ' 行）');

// ---------- 寅：手写 class 族类别仍为 0，赃物份额仍只有一个写者 ----------
let o2 = ''; let code2 = 0;
try { o2 = execFileSync(process.execPath, ['F:/dnd/docs/统一底层设计/脚本/卷三/check-卷三-整类.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
catch (e) { o2 = String(e.stdout || ''); code2 = e.status || 1; }
const l2 = o2.replace(/\r\n/g, '\n').split('\n');
const pick = (tag) => l2.filter((l) => new RegExp('^(PASS|FAIL) ' + tag).test(l));
const jiaG = pick('甲'); const yi = pick('乙'); const bing = pick('丙');
const allPass = (a) => a.length > 0 && a.every((l) => l.startsWith('PASS'));
say(allPass(jiaG), '寅1 手写的 class 族类别仍为 0（整类核对甲组 ' + jiaG.length + ' 项全过）');
jiaG.forEach(note);
say(allPass(yi), '寅2 赃物份额仍只有一个写者（整类核对乙组 ' + yi.length + ' 项全过）');
yi.forEach(note);
say(allPass(bing) && code2 === 0, '寅3 全集材料逐种重算仍全过（整类核对丙组 ' + bing.length + ' 项），整类核对退出码 ' + code2);

out.push('----');
out.push('结果：' + (fail === 0 ? '全部通过' : '未通过 ' + fail + ' 项'));
console.log(out.join('\n'));

const cut = raw.indexOf(OUT_MARK);
if (cut >= 0) {
  const m = raw.slice(cut).match(/```\n([\s\S]*?)\n```/);
  console.error('卷末已贴输出与本次一致：' + (m && m[1] === out.join('\n') ? '是' : '否'));
} else console.error('卷末尚未贴输出');
process.exitCode = fail === 0 ? 0 : 1;
