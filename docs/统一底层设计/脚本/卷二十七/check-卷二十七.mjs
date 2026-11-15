// 卷二十七自检：静态读成稿，逐项核对写卷须知“交稿前”四项。
import { readFileSync } from 'node:fs';

const file = 'F:/dnd/docs/统一底层设计/卷二十七-离屏性能存档与确定性.md';
const text = readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);
const out = [];
let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// 1 模板章节
for (const h of ['## §0 ', '## §1 ', '## §2 ', '## §3 ', '## §4 ', '## §5 ', '## §6 ', '## §7 ', '## §8 ', '## 附 术语与代号表'])
    check(`章节 ${h.trim()}`, lines.some(l => l.startsWith(h)));

// 2 子系统与六小节
const subs = lines.map((l, i) => ({ l, i })).filter(x => /^### 4\.\d+ /.test(x.l));
check('子系统数 = 8', subs.length === 8, `实际 ${subs.length}`);
const six = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const sec4End = lines.findIndex(l => l.startsWith('## §5 '));
subs.forEach((s, k) => {
    const end = k + 1 < subs.length ? subs[k + 1].i : sec4End;
    const body = lines.slice(s.i, end);
    const n = s.l.match(/^### (4\.\d+)/)[1];
    const heads = body.filter(l => l.startsWith('#### ')).map(l => l.replace(/^#### \S+ /, ''));
    check(`${n} 六小节齐全且顺序正确`, six.every((t, j) => heads[j] === t) && heads.length === 6, heads.join('/'));
    const at = t => body.findIndex(l => l.startsWith('#### ') && l.endsWith(t));
    const inst = body.slice(at('数据实例'), at('验收断言')).filter(l => /^\| \d+ \|/.test(l));
    check(`${n} 数据实例 >= 3`, inst.length >= 3, `实际 ${inst.length}`);
    check(`${n} 含非西陲实例`, inst.some(l => l.includes('[非西陲]')));
    check(`${n} 含非人类或超自然实例`, inst.some(l => l.includes('[非人类]') || l.includes('[超自然]')));
    const asr = body.slice(at('验收断言')).join('\n');
    for (const kind of ['扫描式', '不变量式', '扩展性式']) check(`${n} 断言含${kind}`, asr.includes(kind));
    const rules = body.slice(at('规则'), at('交互')).filter(l => /^- \*\*R27-/.test(l));
    check(`${n} 规则条数 >= 3`, rules.length >= 3, `实际 ${rules.length}`);
});

// 3 具体 id 字面量与描述性判断文本（全文）
const idRe = /\b(npc|creature|item|place|org|deity|faith|culture|office|polity|species|material|recipe|plant|skill|profession|offense|knowledge|facility|region|county|province|terrain|spell|monster)_[a-z0-9]+(?:_[a-z0-9]+)*\b/g;
const idHits = [];
lines.forEach((l, i) => { for (const m of l.matchAll(idRe)) idHits.push(`${i + 1}:${m[0]}`); });
check('无具体实体 id 字面量', idHits.length === 0, idHits.slice(0, 8).join(' '));

const cmpRe = /(===|!==|==|!=|\.includes\(|\.startsWith\(|\.endsWith\(|\.match\(|\.test\(|\bcase\s)\s*['"`]/;
const cmpHits = lines.map((l, i) => cmpRe.test(l) ? i + 1 : 0).filter(Boolean);
check('无与字符串字面量的比较写法', cmpHits.length === 0, cmpHits.join(','));

const s2 = lines.findIndex(l => l.startsWith('## §2 ')), s7 = lines.findIndex(l => l.startsWith('## §7 '));
const cjkCode = [];
lines.slice(s2, s7).forEach((l, i) => { for (const m of l.matchAll(/`([^`]*)`/g)) if (/[\u4e00-\u9fff]/.test(m[1])) cjkCode.push(`${s2 + i + 1}:${m[1]}`); });
check('§2–§6 代号全部为 ASCII（反引号内无中文）', cjkCode.length === 0, cjkCode.slice(0, 8).join(' '));

// 4 台账判给本卷的概念
const owned = [['三层模拟', '4.1'], ['聚合变体', '4.2'], ['钉住', '4.2'], ['成本模型与降级阶梯', '4.3'], ['存档', '4.4'], ['确定性数值', '4.5'], ['性能门', '4.6'], ['复演与规则只一版', '4.7'], ['种子键', '4.8']];
for (const [c, n] of owned) check(`台账概念「${c}」在 §${n} 标题`, subs.some(s => s.l.startsWith(`### ${n} `) && s.l.includes(c)));

// 5 只引用不重写：不得出现卷二拥有的格式定义
check('未重写种子键公式', !/seedKey\s*=\s*sha256/.test(text));
check('未重写 Sealed 序列化', !text.includes('$sealed'));
check('未重写求值管线步骤', !/add\s*→\s*mul/.test(text));
check('含“待卷二收口后对齐”标记', (text.match(/待卷二收口后对齐/g) ?? []).length >= 4, `次数 ${(text.match(/待卷二收口后对齐/g) ?? []).length}`);

// 6 规则与断言编号唯一
for (const p of ['R27', 'A27']) {
    const ids = [...text.matchAll(new RegExp(`\\*\\*(${p}-\\d+\\.\\d+)`, 'g'))].map(m => m[1]);
    check(`${p} 定义编号唯一`, new Set(ids).size === ids.length, `共 ${ids.length} 条`);
    const refs = [...text.matchAll(new RegExp(`${p}-\\d+\\.\\d+`, 'g'))].map(m => m[0]);
    const missing = [...new Set(refs)].filter(r => !ids.includes(r));
    check(`${p} 引用均有定义`, missing.length === 0, missing.join(' '));
}
// 7 第二版裁定（主会话 11-13）：只核对正文，不含卷末的记账栏、影响面表与自检输出
const bodyEnd = lines.findIndex(l => l.startsWith('## 附录 '));
const body2 = lines.slice(0, bodyEnd < 0 ? lines.length : bodyEnd).join('\n');
check('哈希只有一种：正文无“规则可读状态哈希”“两种哈希”“ruleStateDigest”', !/规则可读状态哈希|两种哈希|ruleStateDigest/.test(body2));
check('规则层不得读摘要：有 S27-8 与 E-DIGEST-READ', body2.includes('| S27-8 |') && body2.includes('E-DIGEST-READ'));
check('骰值键五段写明', body2.includes('(worldSeed, streamCode, subjectId, worldTime, drawSiteCode)'));
check('写明卷二十“存档单调序号”须改', /卷二十 §4\.1\.3 第 6 条[^\n]*存档单调序号[^\n]*须改为本键/.test(body2));
check('降级与请求无关：costPlan 无请求参数、无按推进类别的预算', body2.includes('`costPlan(engine, state)`') && !body2.includes('costPlan(engine, state, request)') && !/`budgetCu`/.test(body2) && !body2.includes('map<advclass'));
check('有推进路径无关的总则 R27-1.11', body2.includes('**R27-1.11 '));
check('观察锚不依赖输入边会话', !body2.includes('输入边会话控制'));
check('§7 含版本标记分支与 AI 写状态两行', body2.includes('| M27-15 |') && body2.includes('| M27-16 |'));
const verifs = [...body2.matchAll(/\*\*(A27-\d+\.\d+)（验收测试/g)].map(m => m[1]);
check('确定性断言已改写成验收测试并交卷十二', verifs.length >= 8 && verifs.every(a => new RegExp(`\\*\\*${a.replace('.', '\\.')}（验收测试[^）]*交卷十二机器化）`).test(body2)), verifs.join(' '));

const open = lines.slice(lines.findIndex(l => l.startsWith('## §8 ')), lines.findIndex(l => l.startsWith('## 附 '))).filter(l => /^\| \d+ \|/.test(l)).length;

out.push(`行数 ${lines.length}；子系统 ${subs.length}；开放问题 ${open}；失败 ${fail}`);
console.log(out.join('\n'));
