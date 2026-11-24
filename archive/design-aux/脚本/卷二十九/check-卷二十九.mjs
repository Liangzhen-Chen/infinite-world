// 卷二十九 自检（写卷须知“交稿前”第 1 条）。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十九/check-卷二十九.mjs
// 仿 check-卷二十八.mjs 新写，只读本卷成稿；不改任何别的脚本。
import fs from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷二十九-显示层本地化与界面投影.md';
const raw = fs.readFileSync(FILE, 'utf8');
const cut = raw.indexOf('## 附录 自检脚本输出');
const text = cut >= 0 ? raw.slice(0, cut) : raw;
const lines = text.split(/\r?\n/);
const out = [];
let fail = 0;
const ok = (cond, msg) => { out.push((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

// 1. 卷首两行
ok(/^起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档$/m.test(text), '卷首模型行');
ok(/^状态：(第[一二三四五六七八九十]+版成稿|已封卷（)/m.test(text), '状态行为成稿或已封卷'); // 版本号不写死（仿卷二十八 f3b19baf），免每版改锚点

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
  ok(new RegExp('\\*\\*R29-' + n + '\\.1 ').test(body.join('\n')), '§4.' + n + ' 有规则 R29-' + n + '.1');
}

// 4. 具体 id 字面量（实体前缀或词表族前缀 + 下划线 + 名）。
//    放行的是枚举名、字段名、表代号与别卷已登记的族名，都不是实例 id。
const IDRE = /\b(item|mat|species|flora|body|npc|creature|loc|bld|fac|recipe|org|office|polity|law|deity|faith|culture|profession|skill|lore|offense|status|etype|eff|mod|note|class|comp|verb|endr|rtier|sphere|terrain|biome|bcat|vstat|lang|panel|widget|tpl|era)_[a-z0-9][a-z0-9_]*/g;
const ALLOW = new Set(['law_code', 'body_plan', 'event_type', 'facility_type', 'end_reason', 'respect_tier', 'status_family', 'mod_stage', 'tpl_kind', 'widget_kind']);
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
// 5b 本卷特有：反引号里的代号不得含中日韩文字，尖括号占位（<显示语言代号>）除外
const cjkCode = [];
lines.forEach((l, i) => { if (/^状态：已封卷（/.test(l)) return; /* 封卷状态行只引审查文件路径，非代号 */ for (const m of l.matchAll(/`[^`]*`/g)) { const s = m[0].replace(/<[^<>`]*>/g, ''); if (/[\u4e00-\u9fff]/.test(s) && !/[:：，、 ]/.test(s)) cjkCode.push((i + 1) + ': ' + m[0]); } });
ok(cjkCode.length === 0, '反引号里没有中文代号（命中 ' + cjkCode.slice(0, 8).join('；') + '）');

// 6. 台账判给本卷的概念写全（定义锚点）
const ANCH = [
  ['T-09 显示层隔离契约（单向三段）', /R29-1\.1 管线三段，单向/],
  ['T-09 语言包文件种类', /### 2\.3 语言包文件种类/],
  ['T-09 labels 形状与形态', /R29-1\.4 显示名条目的形状/],
  ['T-09 该有显示名的代号集合', /R29-1\.5 该有显示名的代号集合由登记推出/],
  ['T-09 错误码→文案', /R29-1\.7 错误码与拒收代号的文案在语言包/],
  ['X-05 生成名拼装', /R29-1\.8 生成名的拼装/],
  ['X-04 屏蔽词词条数据', /R29-1\.9 屏蔽词词条数据/],
  ['C28-8 包的语言包片段', /R29-1\.10 包的语言包片段/],
  ['C28-8 叙述性形态', /R29-1\.11 哪些形态算叙述性/],
  ['V29-01 模板两半', /R29-2\.1 模板分两半/],
  ['V29-01 选模板只看代号', /R29-2\.2 选模板只看代号/],
  ['V29-01 片段', /R29-2\.10 片段/],
  ['卷九 R9-5.7 模板对白', /R29-2\.8 模板对白/],
  ['卷二十二请求第 8 条 称呼行', /R29-2\.11 称呼行：由读数推出的叫法/],
  ['V29-02 面板是数据行', /R29-3\.1 面板是数据行/],
  ['V29-02 菜单是可用动作投影的渲染', /R29-3\.7 菜单是可用动作投影的渲染/],
  ['V29-02 画面请求纯读', /R29-3\.10 画面请求是纯读/],
  ['V29-03 地图按知情', /R29-4\.1 地图是观察者知情的一张图/],
  ['V29-03 方位呈现', /R29-4\.4 方位与远近的说法/],
  ['V29-04 素材只凭代号与数值选', /R29-5\.1 素材只凭代号与数值选/],
  ['V29-04 画面前端所需都在代号结构里', /R29-5\.6 画面前端要的东西都在代号结构里/],
  ['V29-05 界面语言是界面偏好', /R29-6\.1 界面语言是界面偏好/],
  ['V29-05 已发布语言必须齐', /R29-6\.3 已发布语言必须齐/],
  ['T-11 前端适配器', /R29-7\.1 前端适配器只做三件事/],
  ['S2b 输出边登记与口径', /R29-7\.2 输出边的登记与口径/],
  ['S2b 上行只有代号（菜单点选传 actionId）', /R29-7\.3 上行只有代号/],
  ['卷零 显示闸呈现细节', /R29-7\.6 显示闸裁决的呈现/],
  ['G4 多种前端读同一份下行', /R29-7\.10 多种前端读同一份下行/],
  ['V29-05 显示层验收 零字面量口径', /R29-8\.1 零字面量的口径/],
  ['V29-05 拔语言包测试', /R29-8\.2 拔语言包测试/],
  ['V29-05 拔显示层测试', /R29-8\.3 拔显示层测试/],
  ['各卷指给本卷的事项与落点', /### 5\.4 各卷指给本卷的事项与落点/],
  ['字段全集（卷二记账）', /### 2\.7 上下行结构中本卷负责的字段/],
];
for (const [name, re] of ANCH) ok(re.test(text), '台账概念：' + name);

// 7. 除法：凡出现除号的行，除数须写成 max(1, …)；不得出现别的除法说法
const divBad = [];
lines.forEach((l, i) => {
  if (/除以|整除/.test(l)) divBad.push(i + 1);
  for (const m of l.matchAll(/÷\s*([^，；。）]*)/g)) if (!/^max\(1, /.test(m[1].replace(/`/g, ''))) divBad.push(i + 1);
});
const divN = (text.match(/÷/g) || []).length;
ok(divBad.length === 0, '除法共 ' + divN + ' 处，除数都写成 max(1, …)（不合行 ' + divBad.join(',') + '）');

// 8. 本卷特有
// 8a 不凭记忆填数：§2.8 显示配置键表里不得出现带数字的标定值
const s28 = lines.findIndex(l => l.startsWith('### 2.8 '));
const e28 = lines.findIndex((l, i) => i > s28 && l.startsWith('### '));
const keyRows = lines.slice(s28, e28).filter(l => l.startsWith('| `display.'));
ok(keyRows.length >= 4, '§2.8 显示配置键 ≥ 4 行（实有 ' + keyRows.length + '）');
ok(keyRows.every(l => !/\d{2,}/.test(l.split('|')[3] || '')), '§2.8 配置键的取值域栏里没有两位以上的数字（不填标定值）');
ok(lines.every(l => !/`rules\.display\./.test(l)), '显示配置键不写在 rules. 下');
// 8b §2.9 的每个码在正文别处至少被用到一次
const s29 = lines.findIndex(l => l.startsWith('### 2.9 '));
const e29 = lines.findIndex((l, i) => i > s29 && l.startsWith('### '));
const CODE = /E-(I18N|TPL|PANEL|MAP|AV|DISPLAY)-[A-Z0-9-]+[A-Z0-9]/g;
const codes = new Set();
lines.slice(s29, e29).filter(l => l.startsWith('| E-')).forEach(l => { for (const m of l.split('|')[1].matchAll(CODE)) codes.add(m[0]); });
const rest = lines.slice(0, s29).concat(lines.slice(e29)).join('\n');
const unused = [...codes].filter(c => !rest.includes(c));
ok(codes.size >= 20, '§2.9 登记的码数 ≥ 20（实有 ' + codes.size + '）');
ok(unused.length === 0, '§2.9 的码都在正文别处用到（未用：' + unused.join('、') + '）');
// 8c 正文用到的本卷前缀的码，要么在 §2.9，要么是卷二已登记的 E-I18N 码
const VOL2 = new Set(['E-I18N-LABEL-MISSING', 'E-I18N-LABEL-NUMERIC', 'E-I18N-BLOCKLIST', 'E-I18N-REDACT-HIT', 'E-I18N-BLOCKLIST-UNNORMALIZED']);
const used = new Set(rest.match(CODE) || []);
const unreg = [...used].filter(c => !codes.has(c) && !VOL2.has(c));
ok(unreg.length === 0, '正文用到的本卷码都在 §2.9（未登记：' + unreg.join('、') + '）');
// 8d 配合项、开放问题、迁移行、扩展性条目、扫描条编号连续
const seq = (re, name) => { const ns = [...text.matchAll(re)].map(m => +m[1]); const good = ns.every((v, i) => v === i + 1); ok(ns.length > 0 && good, name + ' 编号连续（' + ns.length + ' 条）'); };
seq(/^\| C29-(\d+) /gm, '配合项 C29');
seq(/^\| Q29-(\d+) /gm, '开放问题 Q29');
seq(/^\| M29-(\d+) /gm, '迁移行 M29');
seq(/^\| X29-(\d+) /gm, '扩展性条目 X29');
seq(/^- \*\*S29-(\d+)\*\* /gm, '扫描条 S29');
// 各子系统规则编号连续
for (let n = 1; n <= 8; n++) seq(new RegExp('^- \\*\\*R29-' + n + '\\.(\\d+) ', 'gm'), '规则 R29-' + n);
// 8e 正文引用的本卷编号都有定义
const defined = new Set();
for (const m of text.matchAll(/^\| (C29-\d+|Q29-\d+|M29-\d+|X29-\d+) /gm)) defined.add(m[1]);
for (const m of text.matchAll(/\*\*(R29-\d+\.\d+) /g)) defined.add(m[1]);
for (const m of text.matchAll(/\*\*(S29-\d+)\*\*/g)) defined.add(m[1]);
for (const m of text.matchAll(/式：.*?(A29-\d+\.\d+)[ （]/g)) defined.add(m[1]);
const dangling = new Set();
for (const m of text.matchAll(/\b([CQMX]29-\d+|R29-\d+\.\d+|S29-\d+|A29-\d+\.\d+)\b/g)) if (!defined.has(m[1])) dangling.add(m[1]);
ok(dangling.size === 0, '引用的本卷编号都有定义（悬空：' + [...dangling].join('、') + '）');
// 8f 待补清单引用的序号存在
const pend = text.slice(text.indexOf('## 附 待补清单'));
const pendN = (pend.match(/^\d+\. /gm) || []).length;
const pendRef = [...text.matchAll(/待补清单第 (\d+) 项/g)].map(m => +m[1]);
ok(pendRef.every(n => n >= 1 && n <= pendN), '待补清单引用序号都在 1–' + pendN + ' 内');
// 8g 迁移行的处置恰是卷十一五种之一，且六栏齐
const MIG = new Set(['delete', 'recode', 'move_out', 'to_data', 'replace_entry']);
const migRows = lines.filter(l => /^\| M29-\d+ /.test(l));
const migBad = migRows.filter(l => { const c = l.split('|').map(s => s.trim()); return c.length !== 8 || !MIG.has(c[4].replace(/`/g, '')) || !c[5] || !c[6]; }).map(l => l.split('|')[1].trim());
ok(migBad.length === 0, '迁移行六栏齐且处置属五种之一（不合：' + migBad.join('、') + '）');
// 8h 每条配合项写了必要理由（五栏）
const cRows = lines.filter(l => /^\| C29-\d+ /.test(l));
ok(cRows.every(l => { const c = l.split('|').map(s => s.trim()); return c.length === 7 && c[2] && c[3] && c[4] && c[5]; }), '配合项五栏齐（对象、要什么、必要理由、依据）');
// 8i 开放问题都带建议与谁定
const qRows = lines.filter(l => /^\| Q29-\d+ /.test(l));
ok(qRows.every(l => { const c = l.split('|').map(s => s.trim()); return c.length === 7 && c[4] && c[5]; }), '开放问题都有建议与谁定');
// 8j 封闭枚举表每个枚举在正文别处用到
const s21 = lines.findIndex(l => l.startsWith('### 2.1 '));
const e21 = lines.findIndex((l, i) => i > s21 && l.startsWith('### '));
const enums = lines.slice(s21, e21).map(l => (l.match(/^\| `([a-z_]+)` \|/) || [])[1]).filter(Boolean);
const rest21 = lines.slice(0, s21).concat(lines.slice(e21)).join('\n');
const enumUnused = enums.filter(n => !rest21.includes('`' + n + '`'));
ok(enums.length >= 10 && enumUnused.length === 0, '§2.1 的 ' + enums.length + ' 个枚举都在正文别处用到（未用：' + enumUnused.join('、') + '）');

// 9. 续写点标记
const marks = lines.filter(l => l.startsWith('<!--续写点')).length;
ok(marks === 0, '没有续写点标记（实有 ' + marks + '）');

// 10. 规模
out.push('INFO 行数 ' + lines.length + '；字符数 ' + text.length + '；子系统 8；规则条 ' + (text.match(/\*\*R29-\d+\.\d+ /g) || []).length + '；断言条 ' + new Set(text.match(/A29-\d+\.\d+/g) || []).size + '；扫描条 ' + (text.match(/^- \*\*S29-\d+\*\*/gm) || []).length + '；配合项 ' + cRows.length + '；开放问题 ' + qRows.length + '；迁移行 ' + migRows.length + '；扩展性条目 ' + (text.match(/^\| X29-\d+ /gm) || []).length + '；本卷错误码 ' + codes.size);
out.push(fail === 0 ? 'RESULT 全部通过' : 'RESULT 失败 ' + fail + ' 项');
const res = out.join('\n');
fs.writeFileSync('F:/dnd/docs/统一底层设计/脚本/卷二十九/out-卷二十九.txt', res + '\n', 'utf8');
console.log(res);
