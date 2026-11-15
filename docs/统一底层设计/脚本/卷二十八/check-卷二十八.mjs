// 卷二十八 自检（写卷须知“交稿前”第 1 条）。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十八/check-卷二十八.mjs
import fs from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷二十八-扩展包与作者工具.md';
const raw = fs.readFileSync(FILE, 'utf8');
const cut = raw.indexOf('## 附录 自检脚本输出');
const text = cut >= 0 ? raw.slice(0, cut) : raw;
const lines = text.split(/\r?\n/);
const out = [];
let fail = 0;
const ok = (cond, msg) => { out.push((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

// 1. 卷首两行
ok(/^起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档$/m.test(text), '卷首模型行');
ok(/^状态：(第[一二三四五六七八九十]+版成稿|已封卷（)/m.test(text), '状态行为成稿或已封卷');

// 2. §0–§8 与附
for (let i = 0; i <= 8; i++) ok(new RegExp('^## §' + i + ' ', 'm').test(text), '§' + i + ' 存在');
ok(/^## 附 术语与代号表/m.test(text), '附 术语与代号表');
ok(/^## 附 待补清单/m.test(text), '附 待补清单');
for (const h of ['0.1 范围', '0.2 依赖卷', '0.3 覆盖的卷零行', '0.4 参照的五款游戏行', '0.5 读法']) ok(text.includes('### ' + h), '§' + h);

// 3. 八个子系统，各 6 小节、实例、断言、首条规则
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const secStart = n => lines.findIndex(l => new RegExp('^### 4\\.' + n + ' ').test(l));
for (let n = 1; n <= 8; n++) {
  const s = secStart(n);
  ok(s >= 0, '§4.' + n + ' 存在');
  if (s < 0) continue;
  let e = lines.findIndex((l, i) => i > s && /^(### |## )/.test(l));
  if (e < 0) e = lines.length;
  const body = lines.slice(s, e);
  SUB.forEach((t, k) => ok(body.some(l => l.startsWith('#### 4.' + n + '.' + (k + 1) + ' ' + t)), '§4.' + n + '.' + (k + 1) + ' ' + t));
  const a = body.findIndex(l => l.startsWith('#### 4.' + n + '.5 '));
  const b = body.findIndex(l => l.startsWith('#### 4.' + n + '.6 '));
  const inst = body.slice(a + 1, b).filter(l => /^- 【/.test(l));
  ok(inst.length >= 3, '§4.' + n + ' 数据实例 ≥ 3（实有 ' + inst.length + '）');
  ok(inst.some(l => l.startsWith('- 【非西陲】')), '§4.' + n + ' 有非西陲实例');
  ok(inst.some(l => /^- 【(非人类|超自然)】/.test(l)), '§4.' + n + ' 有非人类或超自然实例');
  const asr = body.slice(b + 1).join('\n');
  for (const tag of ['扫描式：', '不变量式：', '扩展性式：']) ok(asr.includes(tag), '§4.' + n + ' 断言含 ' + tag);
  ok(new RegExp('\\*\\*R28-' + n + '\\.1 ').test(body.join('\n')), '§4.' + n + ' 有规则 R28-' + n + '.1');
}

// 4. 具体 id 字面量（实体前缀或词表族前缀 + 下划线 + 名）。
//    放行的是枚举名、字段名、表代号与别卷已登记的族名，都不是实例 id。
const IDRE = /\b(item|mat|species|flora|body|npc|creature|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|note|class|comp|verb|endr|rtier|sphere|terrain|biome|bcat|vstat)_[a-z0-9][a-z0-9_]*/g;
const ALLOW = new Set(['law_code', 'body_plan', 'event_type', 'facility_type', 'end_reason', 'respect_tier', 'status_family', 'mod_stage']);
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(IDRE)) if (!ALLOW.has(m[0])) idHits.push((i + 1) + ': ' + m[0]); });
ok(idHits.length === 0, '正文无具体 id 字面量（命中 ' + idHits.length + '）' + (idHits.length ? ' → ' + idHits.slice(0, 12).join('；') : ''));

// 5. 用于判断的中文或英文描述性文本
const JUDGE = /(===?|!==?|includes\(|startsWith\(|endsWith\(|match\(|test\()\s*['"\/][^'"\/]*[\u4e00-\u9fffA-Za-z]{2,}/;
const jHits = [];
lines.forEach((l, i) => { if (JUDGE.test(l)) jHits.push(i + 1); });
ok(jHits.length === 0, '无用于判断的描述性文本（命中行 ' + jHits.join(',') + '）');
const qHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(/`[^`]*`/g)) if (/['"][^'"`]*[\u4e00-\u9fff][^'"`]*['"]/.test(m[0])) qHits.push(i + 1); });
ok(qHits.length === 0, '反引号内无带引号的中文字符串（命中行 ' + qHits.join(',') + '）');

// 6. 台账判给本卷的概念写全（定义锚点）
const ANCH = [
  ['V28-01 包形状', /R28-1\.1 包是一个目录/],
  ['V28-01 清单 manifest', /### 2\.2 清单 `packManifest`/],
  ['V28-01 命名空间', /R28-1\.2 命名空间是代号里的一段/],
  ['V28-01 冲突优先级', /R28-3\.9 冲突种类总表/],
  ['包序', /R28-3\.2 包序是包集合的纯函数/],
  ['V28-02 / X-39 补丁操作格式', /### 2\.4 补丁行 `patchRow`/],
  ['X-39 补丁只产生偏离行', /R28-2\.4 补丁的目标与产物/],
  ['K-18 继承只引用卷二', /R28-2\.1 继承只有卷二那一套/],
  ['零B 0.9 派生', /R28-2\.3 派生是离线展开/],
  ['词汇扩展（S-12）', /R28-3\.3 词汇扩展只往开放族里加/],
  ['V28-03 加载校验流水线', /R28-4\.1 七步，次序固定/],
  ['V28-03 报错码', /### 2\.9 错误码/],
  ['V28-04 内容审批三级', /R28-5\.3 应过哪一级由数据推出/],
  ['X-04 离线屏蔽词校验', /R28-5\.4 机判级查什么/],
  ['零A 3.14、15.3 人物档', /R28-5\.8 手写人物档与按需建档/],
  ['V28-05 安装升级卸载', /R28-6\.1 三种库操作只改库/],
  ['卷二十七 §8 第 12 条的回答', /R28-6\.4 已有世界不受库操作影响/],
  ['N-06 卸包终止对象', /R28-6\.7 卸包终止的是谁/],
  ['V28-06 作者工具', /R28-7\.2 工具命令是登记项/],
  ['V28-06 示例包', /R28-7\.8 示例包由覆盖要求推出/],
  ['C11-7 转换脚本留痕', /R28-7\.9 一次性转换脚本与常设脚本的分界/],
  ['V28-06 一方机制表加载', /R28-8\.1 本体就是一个包/],
  ['卷零核查问 20.5 是否带校验器', /R28-8\.4 机制表带校验/],
];
for (const [name, re] of ANCH) ok(re.test(text), '台账概念：' + name);

// 7. 除法：本卷正文不应有除法记号
const divLines = [];
lines.forEach((l, i) => { if (/÷|除以|整除/.test(l)) divLines.push(i + 1); });
ok(divLines.length === 0, '正文无除法记号（命中行 ' + divLines.join(',') + '）');

// 8. 本卷特有
// 8a 不凭记忆填数：§2.8 规则表键表里不得出现带数字的标定值
const s28 = lines.findIndex(l => l.startsWith('### 2.8 '));
const e28 = lines.findIndex((l, i) => i > s28 && l.startsWith('### '));
const keyRows = lines.slice(s28, e28).filter(l => l.startsWith('| `rules.'));
ok(keyRows.length >= 4, '§2.8 规则表键 ≥ 4 行（实有 ' + keyRows.length + '）');
ok(keyRows.every(l => !/\d{2,}/.test(l.split('|')[3] || '')), '§2.8 规则表键的取值域栏里没有两位以上的数字（不填标定值）');
// 8b §2.9 的每个码在正文别处至少被用到一次
const s29 = lines.findIndex(l => l.startsWith('### 2.9 '));
const e29 = lines.findIndex((l, i) => i > s29 && l.startsWith('### '));
const codes = new Set();
lines.slice(s29, e29).filter(l => l.startsWith('| E-')).forEach(l => { for (const m of l.split('|')[1].matchAll(/E-(PACK|CONTENT)-[A-Z-]+[A-Z]/g)) codes.add(m[0]); });
const rest = lines.slice(0, s29).concat(lines.slice(e29)).join('\n');
const unused = [...codes].filter(c => !rest.includes(c));
ok(codes.size >= 20, '§2.9 登记的码数 ≥ 20（实有 ' + codes.size + '）');
ok(unused.length === 0, '§2.9 的码都在正文别处用到（未用：' + unused.join('、') + '）');
// 8c 正文用到的本卷码都已登记
const used = new Set((rest.match(/E-(PACK|CONTENT)-[A-Z-]+[A-Z]/g) || []));
const unreg = [...used].filter(c => !codes.has(c));
ok(unreg.length === 0, '正文用到的本卷码都在 §2.9（未登记：' + unreg.join('、') + '）');
// 8d 配合项、开放问题、迁移行、扩展性条目编号连续
const seq = (re, name) => { const ns = [...text.matchAll(re)].map(m => +m[1]); const good = ns.every((v, i) => v === i + 1); ok(ns.length > 0 && good, name + ' 编号连续（' + ns.length + ' 条）'); };
seq(/^\| C28-(\d+) /gm, '配合项 C28');
seq(/^\| Q28-(\d+) /gm, '开放问题 Q28');
seq(/^\| M28-(\d+) /gm, '迁移行 M28');
seq(/^\| X28-(\d+) /gm, '扩展性条目 X28');
seq(/^- \*\*S28-(\d+)\*\* /gm, '扫描条 S28');
// 8e 正文引用的 C28、Q28、R28、S28、A28 编号都有定义
const defined = new Set();
for (const m of text.matchAll(/^\| (C28-\d+|Q28-\d+|M28-\d+|X28-\d+) /gm)) defined.add(m[1]);
for (const m of text.matchAll(/\*\*(R28-\d+\.\d+) /g)) defined.add(m[1]);
for (const m of text.matchAll(/\*\*(S28-\d+)\*\*/g)) defined.add(m[1]);
for (const m of text.matchAll(/式：.*?(A28-\d+\.\d+)[ （]/g)) defined.add(m[1]);
for (const m of text.matchAll(/。(A28-\d+\.\d+)[ （]/g)) defined.add(m[1]);
const dangling = new Set();
for (const m of text.matchAll(/\b([CQMX]28-\d+|R28-\d+\.\d+|S28-\d+|A28-\d+\.\d+)\b/g)) if (!defined.has(m[1])) dangling.add(m[1]);
ok(dangling.size === 0, '引用的本卷编号都有定义（悬空：' + [...dangling].join('、') + '）');
// 8f 待补清单引用的序号存在
const pend = text.slice(text.indexOf('## 附 待补清单'));
const pendN = (pend.match(/^\d+\. /gm) || []).length;
const pendRef = [...text.matchAll(/待补清单第 (\d+) 项/g)].map(m => +m[1]);
ok(pendRef.every(n => n >= 1 && n <= pendN), '待补清单引用序号都在 1–' + pendN + ' 内');
// 8g 审批旧称不混进正文规则（只许在 §2.1 说明、§8、待补清单出现）
const oldTier = [];
lines.forEach((l, i) => { if (/\bL[124]\b/.test(l) && /审批|级别/.test(l) && !/旧称/.test(l)) oldTier.push(i + 1); });
ok(oldTier.length === 0, '审批旧称只在标明“旧称”的行出现（命中行 ' + oldTier.join(',') + '）');

// 9. 续写点标记应只剩附录一处
const marks = lines.filter(l => l.startsWith('<!--续写点')).length;
ok(marks <= 1, '续写点标记不多于 1 处（实有 ' + marks + '）');

// 10. 规模
out.push('INFO 行数 ' + lines.length + '；字符数 ' + text.length + '；规则条 ' + (text.match(/\*\*R28-\d+\.\d+ /g) || []).length + '；断言条 ' + new Set(text.match(/A28-\d+\.\d+/g) || []).size + '；扫描条 ' + (text.match(/^- \*\*S28-\d+\*\*/gm) || []).length + '；配合项 ' + (text.match(/^\| C28-\d+ /gm) || []).length + '；开放问题 ' + (text.match(/^\| Q28-\d+ /gm) || []).length + '；迁移行 ' + (text.match(/^\| M28-\d+ /gm) || []).length + '；本卷错误码 ' + codes.size);
out.push(fail === 0 ? 'RESULT 全部通过' : 'RESULT 失败 ' + fail + ' 项');
const res = out.join('\n');
fs.writeFileSync('F:/dnd/docs/统一底层设计/脚本/卷二十八/out-卷二十八.txt', res + '\n', 'utf8');
console.log(res);
