// 卷二十四 自检（写卷须知“交稿前”第 1 条）。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十四/check-卷二十四.mjs
import fs from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷二十四-事件叙事调度与历史.md';
const raw = fs.readFileSync(FILE, 'utf8');
const cut = raw.indexOf('## 附录 自检脚本输出');
const text = cut >= 0 ? raw.slice(0, cut) : raw;
const lines = text.split(/\r?\n/);
const out = [];
let fail = 0;
const ok = (cond, msg) => { out.push((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

// 1. 卷首两行
ok(/^起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档$/m.test(text), '卷首模型行');
ok(/^状态：/m.test(text), '状态行');

// 2. §0–§8 与附
for (let i = 0; i <= 8; i++) ok(new RegExp('^## §' + i + ' ', 'm').test(text), '§' + i + ' 存在');
ok(/^## 附 术语与代号表/m.test(text), '附 术语与代号表');
ok(/^## 附 待补清单/m.test(text), '附 待补清单');

// 3. 十个子系统，各 6 小节
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const secStart = n => lines.findIndex(l => new RegExp('^### 4\\.' + n + ' ').test(l));
for (let n = 1; n <= 10; n++) {
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
  ok(new RegExp('\\*\\*R24-' + n + '\\.1 ').test(body.join('\n')), '§4.' + n + ' 有规则 R24-' + n + '.1');
}

// 4. 具体 id 字面量（实体前缀 + 下划线 + 名）。表名、枚举名（event_type、event_role、evt_family）不是实例 id，放行。
const IDRE = /\b(item|skill|npc|person|place|loc|mat|profession|creature|knowledge|org|deity|recipe|species|event|etype|efam|faith|culture|status|eff|service|quest|verb|stage|tally|publisher|actrole|endcode)_[a-z0-9][a-z0-9_]*/g;
const ALLOW = new Set(['event_type', 'event_role']);
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
  ['V24-01 事件主写与差分推导', /R24-1\.1 事务写下事件（主写）/ /* 卷二十四二审 11-14：v2 按一审 T1 把 R24-1.1 改名，只换锚点文字，判据不变 */],
  ['差分只作验收', /R24-1\.5 差分只作验收/],
  ['I-08 事件类型注册表（含动词登记）', /R24-2\.1 注册只有这一处/],
  ['事件估值字段（零#3 使用面、8.14）', /R24-2\.3 事件估值/],
  ['V24-02 脉冲式加权抽取', /R24-3\.7 一次随机，逐日一键/],
  ['叙事调度按世界状态不按玩家', /R24-3\.10 调度不认玩家/],
  ['V24-03 局势多阶段', /R24-4\.3 催化/],
  ['I-14 委托与任务生成', /R24-5\.1 只有一套/],
  ['难度与报酬派生', /R24-5\.4 出价/],
  ['V24-04 活动', /R24-6\.1 活动是带主办、场地、席位的运行实例/],
  ['V24-05 历史生成与传奇模式浏览', /R24-7\.6 传奇模式是按键过滤的日志/],
  ['历史事件内容（卷十裁定归本卷）', /R24-7\.2 哪些事成为历史由分量定/],
  ['V24-06 编年史投影', /R24-8\.1 编年史是日志的纯投影/],
  ['§4.9 场外任务接口', /R24-9\.1 场外承接走卷十三/],
  ['V24-07 玩家来历接入', /R24-10\.1 来历是真发生过的事/],
  ['X-33 天气不是事件', /天气不是事件（台账 X-33）/],
  ['S-12 事件动词种类表', /台账 S-12/],
  ['X-24 传说与传奇', /台账 X-24/],
];
for (const [name, re] of ANCH) ok(re.test(text), '台账概念：' + name);

// 7. 除法逐处带除数说明
const divLines = [];
lines.forEach((l, i) => { if (/÷|除以|整除/.test(l)) divLines.push([i + 1, l]); });
let divBad = 0;
for (const [no, l] of divLines) {
  const good = /除数|不做除法|保证为正|定值/.test(l);
  if (!good) { divBad++; out.push('  除法未注除数：第 ' + no + ' 行'); }
}
ok(divBad === 0, '除法共 ' + divLines.length + ' 行，均注明除数下界或零分支');

// 8. 本卷特有：不读玩家、不出现年长字面量、无状态字样取值
const pHits = [];
lines.forEach((l, i) => { if (/isPlayer|playerLevel/.test(l)) pHits.push(i + 1); });
ok(pHits.length === 0, '无玩家标记读数字段名（命中行 ' + pHits.join(',') + '）');
const yHits = [];
lines.forEach((l, i) => { if (/\b(360|365|366)\b/.test(l)) yHits.push(i + 1); });
ok(yHits.length === 0, '无年长字面量（命中行 ' + yHits.join(',') + '）');

// 9. 续写点标记应只剩附录一处
const marks = lines.filter(l => l.startsWith('<!--续写点')).length;
ok(marks <= 1, '续写点标记不多于 1 处（实有 ' + marks + '）');

// 10. 规模
out.push('INFO 行数 ' + lines.length + '；字符数 ' + text.length + '；规则条 ' + (text.match(/\*\*R24-\d+\.\d+/g) || []).length + '；断言条 ' + (text.match(/A24-\d+\.\d+/g) || []).length + '；配合项 ' + (text.match(/^\| C24-\d+ /gm) || []).length + '；开放问题 ' + (text.match(/^\| Q24-\d+ /gm) || []).length + '；迁移项 ' + (text.match(/^\| M24-\d+ /gm) || []).length);
out.push(fail === 0 ? 'RESULT 全部通过' : 'RESULT 失败 ' + fail + ' 项');
const res = out.join('\n');
fs.writeFileSync('F:/dnd/docs/统一底层设计/脚本/卷二十四/out-卷二十四.txt', res + '\n', 'utf8');
console.log(res);
