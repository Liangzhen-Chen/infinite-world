// 卷二十三 自检（写卷须知“交稿前”第 1 条）。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十三/check-卷二十三.mjs
import fs from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷二十三-艺术文学与文化产物.md';
const raw = fs.readFileSync(FILE, 'utf8');
// 附录的自检输出不参加检查
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

// 3. 九个子系统，各 6 小节
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const secStart = n => lines.findIndex(l => new RegExp('^### 4\\.' + n + ' ').test(l));
for (let n = 1; n <= 9; n++) {
  const s = secStart(n);
  ok(s >= 0, '§4.' + n + ' 存在');
  if (s < 0) continue;
  let e = lines.findIndex((l, i) => i > s && /^(### |## )/.test(l));
  if (e < 0) e = lines.length;
  const body = lines.slice(s, e);
  SUB.forEach((t, k) => ok(body.some(l => l.startsWith('#### 4.' + n + '.' + (k + 1) + ' ' + t)), '§4.' + n + '.' + (k + 1) + ' ' + t));
  // 数据实例
  const a = body.findIndex(l => l.startsWith('#### 4.' + n + '.5 '));
  const b = body.findIndex(l => l.startsWith('#### 4.' + n + '.6 '));
  const inst = body.slice(a + 1, b).filter(l => /^- /.test(l));
  ok(inst.length >= 3, '§4.' + n + ' 数据实例 ≥ 3（实有 ' + inst.length + '）');
  ok(inst.some(l => l.includes('〔非西陲〕')), '§4.' + n + ' 有非西陲实例');
  ok(inst.some(l => /〔非人类〕|【超自然】/.test(l)), '§4.' + n + ' 有非人类或超自然实例');
  // 验收断言
  const asr = body.slice(b + 1).join('\n');
  for (const tag of ['【扫描】', '【不变量】', '【扩展性】']) ok(asr.includes(tag), '§4.' + n + ' 断言含' + tag);
}

// 4. 具体 id 字面量（实体前缀 + 下划线 + 名）
const IDRE = /\b(item|skill|npc|person|place|mat|profession|creature|knowledge|org|deity|recipe|species|event|faith|culture|status|gauge|eff|service|class|quality|ability|workkind|artform|medium|adornkind|actkind|subjrole|shapekey|legendtier)_[a-z0-9][a-z0-9_]*/g;
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(IDRE)) idHits.push((i + 1) + ': ' + m[0]); });
ok(idHits.length === 0, '正文无具体 id 字面量（命中 ' + idHits.length + '）' + (idHits.length ? ' → ' + idHits.slice(0, 12).join('；') : ''));

// 5. 用于判断的中文或英文描述性文本：引号字符串进比较、includes、startsWith
const JUDGE = /(===?|!==?|includes\(|startsWith\(|endsWith\(|match\(|test\()\s*['"\/][^'"\/]*[\u4e00-\u9fffA-Za-z]{2,}/;
const jHits = [];
lines.forEach((l, i) => { if (JUDGE.test(l) && !/works\.mjs:264|旧|退役|调研/.test(l)) jHits.push(i + 1); });
ok(jHits.length === 0, '无用于判断的描述性文本（命中行 ' + jHits.join(',') + '）');
// 反引号内带引号的中文字符串
const qHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(/`[^`]*`/g)) if (/['"][^'"`]*[\u4e00-\u9fff][^'"`]*['"]/.test(m[0])) qHits.push(i + 1); });
ok(qHits.length === 0, '反引号内无带引号的中文字符串（命中行 ' + qHits.join(',') + '）');

// 6. 台账判给本卷的概念写全（定义锚点）
const ANCH = [
  ['作品实体与单件美观值 beauty', /R23-1\.4 单件美观值（全书唯一定义）/],
  ['作品实体两层', /R23-1\.1 两层/],
  ['表演与演出事件', /R23-4\.1 一场演出/],
  ['出版、抄写、传播', /R23-5\.1 抄与印都是配方/],
  ['累计需求新口径', /R23-5\.4 /],
  ['传奇推广与升级', /R23-6\.3 档是派生的/],
  ['文物的唯一性与名气加成', /R23-7\.4 名气加成/],
  ['§4.2 雕刻取材', /R23-2\.2 取材/],
  ['§4.3 文学诗乐舞按文化', /R23-3\.2 /],
  ['§4.8 娱乐', /R23-8\.1 /],
  ['§4.9 美观需求接口', /R23-9\.1 /],
  ['S-19 不设稀有度', /R23-7\.1 不设稀有度/],
  ['X-24 传说与传奇两个概念', /台账 X-24/],
];
for (const [name, re] of ANCH) ok(re.test(text), '台账概念：' + name);

// 7. 除法逐处带除数说明
const divLines = [];
lines.forEach((l, i) => { if (/÷|除以/.test(l)) divLines.push([i + 1, l]); });
let divBad = 0;
for (const [no, l] of divLines) {
  const good = /除数|不做除法|保证为正|定值/.test(l);
  if (!good) { divBad++; out.push('  除法未注除数：第 ' + no + ' 行'); }
}
ok(divBad === 0, '除法共 ' + divLines.length + ' 行，均注明除数下界或零分支');

// 8. 品质算法不在本卷：不得出现对档位的算术式样
const qArith = [];
lines.forEach((l, i) => { if (/(qualityTier|workTier)`?\s*[×*+\-]\s*[\d`a-zA-Z]/.test(l)) qArith.push(i + 1); });
ok(qArith.length === 0, '无对品质档的算术（命中行 ' + qArith.join(',') + '）');

// 9. 规模
out.push('INFO 行数 ' + lines.length + '；字符数 ' + text.length + '；规则条 ' + (text.match(/\*\*R23-\d+\.\d+/g) || []).length + '；断言条 ' + (text.match(/A23-\d+\.\d+/g) || []).length + '；配合项 ' + (text.match(/^\| C23-\d+ /gm) || []).length + '；开放问题 ' + (text.match(/^\| Q23-\d+ /gm) || []).length);
out.push(fail === 0 ? 'RESULT 全部通过' : 'RESULT 失败 ' + fail + ' 项');
const res = out.join('\n');
fs.writeFileSync('F:/dnd/docs/统一底层设计/脚本/卷二十三/out-卷二十三.txt', res + '\n', 'utf8');
console.log(res);
