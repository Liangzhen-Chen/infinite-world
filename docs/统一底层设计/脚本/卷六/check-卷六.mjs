// 卷六自检脚本：只读成稿文件，输出逐项结果。用法：node F:/dnd/docs/统一底层设计/脚本/卷六/check-卷六.mjs
import {readFileSync} from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷六-经济.md';
const N = 25;
const all = readFileSync(FILE, 'utf8').split(/\r?\n/);
const cut = all.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cut < 0 ? all : all.slice(0, cut);
const out = [];
let failed = 0;
const report = (ok, name, detail = '') => { if (!ok) failed++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const sectionOf = (startRe, endRe) => {
  const s = lines.findIndex(l => startRe.test(l));
  if (s < 0) return null;
  let e = lines.findIndex((l, i) => i > s && endRe.test(l));
  if (e < 0) e = lines.length;
  return {start: s, end: e, text: lines.slice(s, e)};
};
const subsystem = n => sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## |---$)/);
const partOf = (sec, n, k) => {
  const s = sec.text.findIndex(l => l.startsWith(`#### 4.${n}.${k} `));
  if (s < 0) return {start: -1, text: []};
  let e = sec.text.findIndex((l, i) => i > s && l.startsWith('#### '));
  if (e < 0) e = sec.text.length;
  return {start: sec.start + s, text: sec.text.slice(s + 1, e)};
};

// 1 顶层节
for (let n = 0; n <= 8; n++) report(lines.some(l => new RegExp(`^## §${n} `).test(l)), `1 顶层节 §${n}`);
report(lines.some(l => /^## 附 术语与代号表/.test(l)), '1 附 术语与代号表');
report(!lines.some(l => l.includes('<!--CONTINUE-->')), '1 无残留续写标记');

// 2–4 子系统
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const subsystems = lines.filter(l => /^### 4\.\d+ /.test(l));
report(subsystems.length === N, '2 子系统数', `= ${subsystems.length}`);
let ruleTotal = 0;
const bad2 = [], bad3 = [], bad4 = [], badRules = [];
for (let n = 1; n <= N; n++) {
  const sec = subsystem(n);
  if (!sec) { bad2.push(`4.${n} 缺失`); continue; }
  const missing = SUB.filter((t, i) => !sec.text.some(l => l.startsWith(`#### 4.${n}.${i + 1} ${t}`)));
  if (missing.length) bad2.push(`4.${n} 缺 ${missing.join('、')}`);
  const inst = partOf(sec, n, 5).text.filter(l => l.startsWith('- '));
  const nonWest = inst.some(l => l.includes('非西陲'));
  const nonHuman = inst.some(l => l.includes('非人类') || l.includes('超自然'));
  if (!(inst.length >= 3 && nonWest && nonHuman)) bad3.push(`4.${n}（条数 ${inst.length}，非西陲 ${nonWest}，非人类或超自然 ${nonHuman}）`);
  const asserts = partOf(sec, n, 6).text.join('\n');
  const kinds = ['【扫描】', '【不变量】', '【扩展性】'].filter(k => !asserts.includes(k));
  if (kinds.length) bad4.push(`4.${n} 缺 ${kinds.join('')}`);
  const rules = partOf(sec, n, 3).text.filter(l => /^\d+\. /.test(l)).length;
  ruleTotal += rules;
  if (rules < 3) badRules.push(`4.${n}=${rules}`);
}
report(bad2.length === 0, `2 ${N} 个子系统六小节齐全`, bad2.join('；'));
report(bad3.length === 0, '3 每个子系统数据实例不少于 3 条且含非西陲、非人类或超自然', bad3.join('；'));
report(bad4.length === 0, '4 每个子系统三类断言齐全', bad4.join('；'));
report(badRules.length === 0, '4 每个子系统规则不少于 3 条', badRules.join(' '));

// 5 具体 id 字面量（全文）：实体 id 前缀，加上会点名具体物品、地区、币种的内容代号前缀
const ENTITY = ['item', 'mat', 'species', 'flora', 'body', 'npc', 'creature', 'loc', 'bld', 'fac', 'recipe', 'org', 'office', 'polity', 'law',
  'deity', 'faith', 'culture', 'profession', 'skill', 'lore', 'offense', 'status', 'etype', 'eff', 'mod',
  'coin', 'usage', 'pool', 'class', 'terrain', 'biome', 'rfield', 'hmethod', 'season', 'tier', 'uper', 'site', 'req'];
const ALLOW = new Set(['law_code', 'body_plan', 'status_family', 'status_target', 'body_part']);
const idRe = new RegExp(`(?<![A-Za-z0-9_.])(?:${ENTITY.join('|')})_[a-z0-9_]+`, 'g');
const idHits = [];
lines.forEach((l, i) => { for (const m of l.match(idRe) ?? []) if (!ALLOW.has(m)) idHits.push(`${i + 1}:${m}`); });
report(idHits.length === 0, '5 具体实体 id 与内容代号字面量', idHits.slice(0, 10).join(' '));

// 6 用于判断的描述性文本
const judgeRe = [/\.includes\(/, /\.startsWith\(/, /\.endsWith\(/, /\.test\(/, /\.match\(/, /===?\s*['"][^'"]+['"]/, /`\/[^`]*[\u4e00-\u9fff][^`]*\/[a-z]*`/];
const sec7 = sectionOf(/^## §7 /, /^## §8 /);
const sec1 = sectionOf(/^## §1 /, /^## §2 /);
const inLegacy = i => (sec7 && i >= sec7.start && i < sec7.end) || (sec1 && i >= sec1.start && i < sec1.end);
const judgeHits = [];
lines.forEach((l, i) => { if (!inLegacy(i) && judgeRe.some(r => r.test(l))) judgeHits.push(i + 1); });
report(judgeHits.length === 0, '6 用于判断的描述性文本（§1、§7 引述旧代码除外）', judgeHits.slice(0, 10).join(' '));
const NAMES = ['白石', '黑炉', '河湾', '盐苇', '芦口', '灰盐'];
const nameHits = [];
lines.forEach((l, i) => { if (NAMES.some(n => l.includes(n))) nameHits.push(i + 1); });
report(nameHits.length === 0, '6 具体地区名', nameHits.join(' '));
// 规则小节不得点名具体物品，也不得出现裸的小数系数
const GOODS = /盐|柴|炭|燕麦|粮|木石|铁锭|布匹/;
const goodsHits = [], constHits = [];
for (let n = 1; n <= N; n++) {
  const sec = subsystem(n);
  if (!sec) continue;
  const p = partOf(sec, n, 3);
  p.text.forEach((l, i) => {
    if (GOODS.test(l)) goodsHits.push(p.start + i + 2);
    // 遮掉条号：§x.y、4.x、以及 R/A/S/C/E 前缀的规则编号（如 R22-1.6、A6-1.2）
    if (/(?<![\w.§])\d+\.\d+(?![\w.])/.test(l.replace(/(?<![A-Za-z])[RASCE]\d+-\d+(\.\d+)+/g, '').replace(/§\d+(\.\d+)*/g, '').replace(/4\.\d+(\.\d+)?/g, ''))) constHits.push(p.start + i + 2);
  });
}
report(goodsHits.length === 0, '6 规则小节不点名具体物品', goodsHits.join(' '));
report(constHits.length === 0, '6 规则小节无裸系数', constHits.join(' '));

// 7 台账判给本卷的概念（台账五节卷六清单 + 2.5 卷六小节）
const LEDGER = [
  ['账本三元键、守恒、资源种类表（含非金账户机制）', 1, ['post', 'reskind', '守恒式', '三元键', 'issuerBacked', 'LEDGER-1']],
  ['市场投影与价格形成', 2, ['marketQuote', 'sellable', '边际单价', 'executeTrade']],
  ['市场费用（非税）', 3, ['feesFor', 'payee', '税种表']],
  ['市场需求 demand', 4, ['demand', 'stockup', '偏好', '统计人口同口径']],
  ['店铺经营与补货', 5, ['shopkind', 'assortmentRX', '只向真实持有者进货']],
  ['分销、商队', 6, ['landedCost', '治安值', '边界实体', '统计层的商贩阶层']],
  ['生产组织', 7, ['planProduction', '行业由资源推出', '人数由需求推出', 'craftOutcome']],
  ['初加工与精炼（不写产率规则）', 8, ['不另写产率公式', 'ckind_tolling']],
  ['多级产业链', 9, ['chainDepth', 'openEnds']],
  ['工位负荷与工费', 10, ['stationLoad', 'stationFee']],
  ['劳动市场与工作分配', 11, ['laborTightness', 'workPriority', 'wageQuote']],
  ['家户预算与日耗', 12, ['settleHouseholds', '缺量比例', '站点类型不是条件', '同级']],
  ['货币、成色、汇率', 13, ['coinValue', 'mintCoin', 'exchangeRate']],
  ['多币与非铸币计价', 14, ['denomination', 'unitOfAccount']],
  ['信用、钱庄、典当', 15, ['creditStanding', 'reserveShare', '典当']],
  ['合同状态机与义务种类表', 16, ['contractStep', 'cphase_', 'ophase_', 'obligationTemplate', 'breachHandler', '保险']],
  ['远期、托运、在途', 17, ['incoming', 'purpose_transit']],
  ['资产、地产、租约、维护责任', 18, ['landUse', 'maintainer', 'registerValuer']],
  ['公共工程与拨款', 19, ['appropriate', '公库']],
  ['走私经济', 20, ['违禁', '查获期望损失']],
  ['价格四角色路由', 21, ['priceFor', 'prole_trade', 'prole_worth', 'prole_term', 'prole_gate']],
  ['源汇标记与月度报告', 22, ['economyReport', 'closePeriod', 'src_genesis', 'sink_consume']],
  ['贸易枢纽涌现（验收）', 23, ['tradeVolume', '不指定枢纽']],
  ['财富汇流', 24, ['wealth', 'countsAsWealth']],
  ['战时价格', 25, ['禁写乘数']],
];
for (const [name, n, keys] of LEDGER) {
  const sec = subsystem(n);
  const text = sec ? sec.text.join('\n') : '';
  const miss = keys.filter(k => !text.includes(k));
  report(miss.length === 0, `7 台账概念：${name} → §4.${n}`, miss.length ? '缺 ' + miss.join('、') : '');
}
// 入口名都在 §3 出现
const sec3 = sectionOf(/^## §3 /, /^## §4 /);
const s3 = sec3 ? sec3.text.join('\n') : '';
const ENTRIES = ['balance', 'accountsOf', 'stockIn', 'post', 'transfer', 'marketQuote', 'marketSupply', 'feesFor', 'demand', 'shopView', 'landedCost',
  'productionPlanOf', 'chainOf', 'stationLoad', 'stationFee', 'laborOffers', 'wageQuote', 'householdBudget', 'coinValue', 'exchangeRate', 'denomination',
  'creditStanding', 'contractView', 'obligationsOf', 'incoming', 'propertyView', 'projectView', 'priceFor', 'economyReport', 'tradeVolume', 'wealth',
  'executeTrade', 'contractStep', 'settleObligations', 'settleHouseholds', 'planProduction', 'runJobs', 'settleTrade', 'mintCoin', 'meltCoin', 'appropriate', 'closePeriod'];
const missEntries = ENTRIES.filter(fn => !s3.includes('`' + fn + '`'));
report(missEntries.length === 0, `7 §3 给出全部 ${ENTRIES.length} 个入口名`, missEntries.join(' '));
// 守恒核心不变量在 §4.1 的不变量断言里
const a1 = (() => { const s = subsystem(1); return s ? partOf(s, 1, 6).text.join('\n') : ''; })();
report(a1.includes('守恒式严格成立') && a1.includes('逐位相同'), '7 核心不变量：守恒式与推进路径无关写入 A6-1.2');

// 9 第二版（一审后）新增检查
const body = lines.join('\n');
const rule41 = (() => { const s = subsystem(1); return s ? partOf(s, 1, 3).text.join('\n') : ''; })();
report(rule41.includes('`L − S + K = 0`') && !rule41.includes('加上本笔记到来源的量，减去本笔记到去处的量'), '9 §4.1 规则 2 的符号与守恒式一致');
// 手算校核：四种腿型代入 L − S + K，全部为零；旧式 L + S − K 对"凭空产出"不为零
const cases = [['产出', 5, 5, 0], ['转移', 0, 0, 0], ['消耗', -7, 0, 7], ['转换投入', -4, 0, 4], ['转换产出', 2, 2, 0]];
const badNew = cases.filter(([, L, S, K]) => L - S + K !== 0).map(c => c[0]);
const oldRejects = cases.filter(([, L, S, K]) => L + S - K !== 0).map(c => c[0]);
report(badNew.length === 0 && oldRejects.includes('产出'), '9 规则 2 手算校核（新式五例归零；旧式误拒）', `新式不归零：${badNew.join('、') || '无'}；旧式误拒：${oldRejects.join('、')}`);
// 守恒式累加：逐笔 L = S − K 相加即 余额和 = 来源累计 − 去处累计
const sum = cases.reduce((a, [, L, S, K]) => ({L: a.L + L, S: a.S + S, K: a.K + K}), {L: 0, S: 0, K: 0});
report(sum.L === sum.S - sum.K, '9 逐笔式累加得守恒式', `余额和 ${sum.L} = 来源 ${sum.S} − 去处 ${sum.K}`);
report((body.match(/`reskind`/g) ?? []).length <= 3 && !/ref vocab reskind/.test(body), '9 族名沿用卷二的 resource（reskind 只在作废说明里出现）');
// 规则表键闭集：正文里出现的"表名.json.键名"都必须列在 §2.5 该表一行里
const sec25 = sectionOf(/^### 2\.5 /, /^### 2\.6 /);
const rowOf = f => (sec25 ? sec25.text.find(l => l.startsWith('| `' + f + '.json`')) : '') ?? '';
const keyMiss = new Set();
for (const m of body.matchAll(/`?([a-z]+)\.json\.([A-Za-z]+)/g)) {
  const row = rowOf(m[1]);
  if (!row) { keyMiss.add(`${m[1]}.json（无此表）`); continue; }
  if (!row.includes('`' + m[2] + ':') && !row.includes('`' + m[2] + '`')) keyMiss.add(`${m[1]}.json.${m[2]}`);
}
report(keyMiss.size === 0, '9 正文用到的规则表键都在 §2.5 目录里（键闭集）', [...keyMiss].join(' '));
// 子系统 x.1 小节点到的本卷规则表键也都在目录里
const bareMiss = new Set();
for (let n = 1; n <= N; n++) {
  const sec = subsystem(n);
  if (!sec) continue;
  for (const l of partOf(sec, n, 1).text) {
    const m = l.match(/规则表(?:键只[^`]*)?\s*`([a-z]+)\.json`[：:]([^。]*)/);
    if (!m) continue;
    for (const k of m[2].matchAll(/`([A-Za-z]+)`/g)) if (!rowOf(m[1]).includes('`' + k[1] + ':') && !rowOf(m[1]).includes('`' + k[1] + '`')) bareMiss.add(`${m[1]}.json.${k[1]}`);
  }
}
report(bareMiss.size === 0, '9 各子系统维度小节所列规则表键都在 §2.5 目录里', [...bareMiss].join(' '));
const SINGLE = [['裁定 2 买回渠道与钱外流上限', 6, '只在本条定义'], ['裁定 2 外流上限键', 6, 'boundaryCoinOutflowCapShare'], ['裁定 3 工位落地与归属', 7, 'stationPlan'],
  ['裁定 3 归属', 7, 'ownerRef'], ['裁定 4 单通道', 12, '后果只走一条通道'], ['裁定 4 未满足供给量', 12, '未满足供给量'], ['裁定 4 需要量随身体', 12, 'needDim'],
  ['裁定 5 唯一定价来源', 21, '估值是唯一的定价来源'], ['裁定 5 禁两种回退', 21, '也不得回退到零'], ['裁定 6 建筑资产分录', 1, 'resfam_asset'], ['裁定 6 工程完工成对', 19, '建筑资产分录']];
for (const [name, n, key] of SINGLE) { const s = subsystem(n); report(Boolean(s && s.text.join('\n').includes(key)), `9 ${name} → §4.${n}`); }
const s12 = subsystem(12);
report(Boolean(s12 && !s12.text.join('\n').includes('shortage')), '9 §4.12 不再调用缺量效果');
const s21 = subsystem(21);
report(Boolean(s21 && !s21.text.join('\n').includes('折成价值单位，与当日预算比较')), '9 §4.21 源汇资格不再折成价值');
const sec7b = sectionOf(/^## §7 /, /^## §8 /);
const s7 = sec7b ? sec7b.text.join('\n') : '';
const priceRows = new Set([...s7.matchAll(/([a-z-]+\.mjs):(\d+)|、:(\d+)/g)].map(m => m[0]));
report(s7.includes('basePrice') && s7.includes('27 行') && s7.includes('回退到 0'), '9 §7 列出读旧价位置与处置', `§7 行号引用数 ${priceRows.size}`);
for (const h of ['## 附 一审小项记账栏', '## 附 第二版影响面表']) report(lines.some(l => l.startsWith(h)), `9 卷末有「${h.slice(3)}」`);
const impact = sectionOf(/^## 附 第二版影响面表/, /^## 附录 /);
const it = impact ? impact.text.join('\n') : '';
const missA = [], missB = [];
for (let i = 1; i <= 19; i++) { if (!new RegExp(`\\| A${i} \\|`).test(it)) missA.push(i); if (!new RegExp(`\\| B${i} \\|`).test(it)) missB.push(i); }
report(missA.length === 0 && missB.length === 0, '9 影响面表覆盖一审 A、B 各 19 条', `缺 A：${missA.join(',') || '无'}；缺 B：${missB.join(',') || '无'}`);
const acct = sectionOf(/^## 附 一审小项记账栏/, /^## 附 第二版影响面表/);
const acctRows = acct ? acct.text.filter(l => /^\| [AB] 小 \d+ /.test(l)).length : 0;
report(acctRows === 17, '9 记账栏收齐小项（A 8 条、B 9 条）', `= ${acctRows}`);

// 10 第三版（二审与全书四份清单）新增检查；只增不减
const secText = n => { const s = subsystem(n); return s ? s.text.join('\n') : ''; };
const s35 = (sectionOf(/^### 3\.5 /, /^---$/) ?? {text: []}).text.join('\n');
report(rowOf('market').includes('`liquidationCurve:') && body.includes('`restockBatchKey`') && secText(5).includes('restockBatchKey'), '10 B12 急售曲线有表、补货批量有键字段');
report(secText(6).includes('跨货联合') && secText(6).includes('不即时成交') && !secText(6).includes('外流余量 ÷ 边界报价') && !secText(6).includes('成交前校验') && !secText(2).includes('当日剩余限额'), '10 N1 外流余量跨货共用、日终分配、无逐笔校验');
report(secText(12).includes('不由本卷记消耗') && secText(12).includes('不发燃烧事件') && !secText(12).includes('发一条燃烧事件') && !/违约、摄入、燃烧、/.test(body), '10 N2 燃料只转入炉膛，本卷不记消耗、不发燃烧事件');
report(!body.includes('代入同一 `priceFor` 复算得出') && secText(25).includes('逐笔逐位相等'), '10 N3 A6-25.2 改为逐笔成交单价复算');
report(secText(7).includes('只有这处设施现有的份额持有人可以出资') && !secText(7).includes('完工时建筑资产分录记给出资方。几个主体'), '10 N4 扩建只许现有持有人出资');
// 第六版：资产行 sinks 里的 sink_transform 是第五版单核第三节判定须删的残留，已删；判据随之改为"只有 sink_loss"（收紧，不是放宽）。
report(secText(1).includes('记单向去处 `sink_loss`') && /`sinks` 只有 `sink_loss`/.test(body) && !/`sinks` 为 `sink_transform`/.test(body), '10 N5 毁损记 sink_loss，资产行 sinks 只有 sink_loss');
report(body.includes('这一族只对应一行资源种类') && secText(18).includes('挂 `comp_facility` 组件类的地点行') && !body.includes('资产种类取卷十九') && !body.includes('作资产种类') && !body.includes('设施类型（资产种类）'), '10 Q14 资产只一行资源种类；判据写明；旧措辞清零');
// 第六版删：必含短语"进墙的料与卷十九的围护存量同事务对平"——李白裁定实物账整块归卷十九，本卷核对 materialKg 加减的段落已删，改为照卷十九明细记账。否定项照查。
report(!/(修缮|扩建)[^。|]{0,60}(记消耗去处|sink_consume|耗材仍记消耗)/.test(body), '10 6-1 无"修缮耗材记消耗"');
report(secText(2).includes('只存整批的总成本原值') && !body.includes('按数量加权平均；') && !body.includes('合并按数量加权') && !body.includes('价值单位每件') && secText(2).includes('往返不变'), '10 6-2 costBasis 只存总成本原值、单价读时派生、往返不变断言');
report(secText(1).includes('行改挂') && secText(18).includes('行改挂'), '10 6-牵 可移动建筑按行改挂，分录不动');
report(s35.includes('出自状态容器的档') && secText(2).includes('经状态容器的档挂都不许') && secText(25).includes('出自状态容器档'), '10 后门 S6-12 补状态容器档按族归属判');
report(secText(12).includes('R21-4.2') && secText(12).includes('白名单'), '10 后门牵连 §4.12 规则 7 引卷二十一白名单');
report(secText(21).includes('puse_tuition') && secText(21).includes('卷十四 §2.8 表 F') && body.includes('`subjectCtx'), '10 卷十四表 F：学费用途行与上下文路由');
// 第六版删："全书只存这一份"与 §3 有 stationMinutes 入口两项——李白裁定工位占用只在卷十九记，本卷的 stationUse 与 stationMinutes 入口已删。否定项照查。
report(!body.includes('`stationUse.<设施>.<服务>`（按日占用分钟）'), '10 Q21 旧的按服务按日存法不再出现');
// 第七版：否定项由只匹配第三版写法收紧为裸名。查正文（§0–§8 与术语表，不含各版修订记录与影响面表）；
//   排除的只有说明"已删去"的句子（含 删去/已删/删除/撤销/作废/不存在）与 Q19 里自称"不再是现行口径"的那段经过。
const mainEnd = all.findIndex(l => l.startsWith('## 附 一审小项记账栏'));
const mainLines = mainEnd < 0 ? lines : all.slice(0, mainEnd);
const DELS = /删去|已删|删除|撤销|作废|不存在/;
const oldNameHits = [];
mainLines.forEach((l, i) => {
  const hist = l.indexOf('不再是现行口径');
  const live = hist < 0 ? l : l.slice(l.indexOf('。', hist) < 0 ? l.length : l.indexOf('。', hist) + 1);
  for (const s of live.split('。')) if (['stationUse', 'stationMinutes(', 'stationEdges'].some(n => s.includes(n)) && !DELS.test(s)) { oldNameHits.push(i + 1); break; }
});
report(oldNameHits.length === 0, '10 Q21 正文除"已删去"说明句外不出现裸名 stationUse、stationMinutes(、stationEdges', oldNameHits.join(' '));
report(!/卷三 §/.test(body), '10 对旧卷三各节的引用已全部改指卷三甲、卷三乙', `残留 ${(body.match(/卷三 §/g) ?? []).length}`);
report(lines.some(l => l.startsWith('## 附 第三版影响面表')) && /第[三四五六七八九十]+版/.test(lines[0]) && !lines[0].includes('第二版'), '10 版本号不低于第三版且有第三版影响面表');

// 11 第四版（第三版单核三条新真问题与小项）新增检查；只增不减
// 第六版删：新真问题 1 的五个必含短语（全部占用边入账、unserved 格、只读服务格、记账时长等于全部占用时长）——占用分钟不再由本卷记，段落已删；仍要求 A19-3.2 的引用在。否定项照查。
report(secText(10).includes('A19-3.2') && !secText(10).includes('占用分钟由 `runJobs` 在推进作业时记入') && !secText(10).includes('该设施该日各服务那几格之和'), '11 新真问题 1：旧写法不再出现；A6-10.2 指向 A19-3.2');
// 第六版删：新真问题 2 的三个必含短语（出墙的料与进墙对称、逐料减记、来源腿是出墙的料）——本卷不再核对 materialKg 的减记，改为与卷十九明细的 takenKg 逐料相等。否定项照查。
report(!secText(1).includes('那是另一件东西的来处') && !secText(1).includes('本卷就在同一事务以转换来源入账多少，记到施工出资方名下'), '11 新真问题 2：旧写法不再出现');
report(secText(6).includes('`buyer: ref nullable`') && secText(6).includes('`payResource: ref resource nullable`') && secText(6).includes('可动用资金') && secText(6).includes('按货的资源键升序') && secText(6).includes('升序的全序逐条经 `executeTrade` 成交')
  && !secText(6).includes('才逐条经 `executeTrade` 成交') && secText(6).includes('遍历申请的顺序任意打乱'), '11 新真问题 3：申请字段、按买方资金预缩减、写死全序、换序断言');
const swapAt = all.findIndex(l => l.startsWith('## 附录 换序核对脚本输出'));
const swapText = swapAt < 0 ? '' : all.slice(swapAt).join('\n');
report(swapAt > cut && cut >= 0 && swapText.includes('RESULT  全部通过') && /PASS  规则 8 分配/.test(swapText) && !/FAIL/.test(swapText), '11 换序核对脚本输出已贴入附录且全部通过');
const bare3 = lines.map((l, i) => [i + 1, (l.match(/卷三(?![甲乙十])/g) ?? []).length]).filter(x => x[1] > 0);
const bare3Bad = bare3.filter(([n]) => { const l = lines[n - 1]; return !(n === 3 || /卷三拆卷|旧卷三各节|泛称"卷三"|对旧卷三/.test(l)); });
report(bare3Bad.length === 0, '11 小项：泛称"卷三"已全部改为卷三甲、卷三乙（说拆卷本身的句子除外）', bare3Bad.slice(0, 8).map(x => x[0]).join(' '));
report(lines.some(l => /^\| 卷三甲 \|/.test(l)) && lines.some(l => /^\| 卷三乙 \|/.test(l)) && !lines.some(l => /^\| 卷三 \|/.test(l)), '11 小项：§0.2 与 §5.2 的表行分列卷三甲、卷三乙');
report(lines.some(l => l.startsWith('## 附 第四版修订记录')) && /第[四五六七八九十]+版/.test(lines[0]) && body.includes('三处新增设计准留及其必要理由') && body.includes('须卷十九跟改的句子'), '11 版本号不低于第四版；修订记录含三处新增设计的必要理由与卷十九跟改句');
report(body.includes('`subjectCtx: ref vocab nullable`') && secText(25).includes('成交总价'), '11 小项：subjectCtx 写了类型；A6-25.2 核对成交总价');

// 12 第五版（第四版单核三条新真问题）新增检查；只增不减
report(secText(6).includes('成交步与预备步是同一个式子') && secText(6).includes('全部**申请按同一比例削减') && secText(6).includes('全序只影响零头那一个单位的归属')
  && !secText(6).includes('这一条只按付得起的整单位成交') && !secText(6).includes('因为成交次序是写死的全序'), '12 新真问题 A：成交步与预备步同式，全序只定零头；贪心旧句清零');
report(/每一步分组之前打乱/.test(swapText) && /随机种子 \d+ 个/.test(swapText) && /PASS  对照二（成交步逐条贪心/.test(swapText) && /没有对申请的整体排序/.test(swapText), '12 新真问题 A：换序脚本每一步前打乱、多种子、不预先排序，且测得出贪心写法');
// 第六版删：新真问题 B 的四个必含短语（出墙量、损失量、损失累计的派生式、不另开路径）——"损失累计由本卷读时派生"正是第五版单核新真问题 D、E 指出算不出来的写法，李白裁定改由卷十九存。其余项照查。
report(!secText(1).includes('该设施的全部资产分录记转换去处') && !secText(1).includes('减记与入账逐料逐位相等（规则 5）') && !secText(18).includes('拆除成对') && secText(1).includes('记入的基点数等于经 `sink_loss` 记出的基点数'), '12 新真问题 B：拆除资产分录记 sink_loss；资产两边相等');
// 第六版删：新真问题 C 整条（jobs.stationEdges、日界步触发）——字段与日界步随 stationUse 一并删除。
// 第六版：版本号跟到第六版；"stationEdges 的必要理由"一项改查第六版修订记录在位（第五版修订记录作为历史仍在）。
report(lines.some(l => l.startsWith('## 附 第五版修订记录')) && lines.some(l => l.startsWith('## 附 第六版修订记录')) && lines.some(l => l.startsWith('## 附 第七版修订记录')) && lines.some(l => l.startsWith('## 附 第八版修订记录')) && lines.some(l => l.startsWith('## 附 第九版修订记录')) && lines.some(l => l.startsWith('## 附 第十版修订记录')) && lines[0].includes('第十版') && lines.slice(0, 8).some(l => l.trim() === '起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档'), '12 版本号为第十版；有第五至十版修订记录；卷首有起草与审查档位一行');   // 第十版：只跟版本号，判据不变

// 13 第七版（李白对 审查/卷六重拆-一审.md 十一条的选项；守恒缺口 G8）新增检查；只增不减
const need13 = (text, keys, name) => { const miss = keys.filter(k => !text.includes(k)); report(miss.length === 0, name, miss.length ? '缺 ' + miss.join('、') : ''); };
const r15 = (() => { const s = subsystem(1); if (!s) return ''; const t = partOf(s, 1, 3).text; const a = t.findIndex(l => l.startsWith('5. ')); if (a < 0) return ''; let b = t.findIndex((l, i) => i > a && /^\d+\. /.test(l)); if (b < 0) b = t.length; return t.slice(a, b).join('\n'); })();
report(r15 !== '', '13 §4.1 规则 5 条目非空');
need13(r15, ['**墙里的料是实物账，整块归卷十九一家记**', '本卷不存这些量，也不从账本倒推', '只照卷十九每个事务交出的明细记', '明细的结构（设施、事由代号、逐料的砌入、取出、损失）只在卷十九 §4.1 规则 11 定义，本卷不重抄', '按明细的事由代号分情形记，不靠调用路径去猜'], '13 §4.1 规则 5 只读卷十九明细、按事由代号记');
need13(r15, ['**砌入的料记出**', '同一种料各腿之和与明细逐料逐位相等', '物化建行是阶层聚合账户', '事由是开局建行（世界生成第 0 日）的那一笔是唯一的例外'], '13 规则 5"砌入的料记出"');
need13(r15, ['**取出的料记入**', '凡多人分的一律同一种分法', '前几位各自整除、末位取差，按主体 id 升序', '换料记给施工出资方，几方合出的按出资比例分', '翻修拆下的旧料归原持有人，不归翻修的出资方', '毁损与承载物终止照卷二 §2.6 终止协议的后继规则'], '13 规则 5"取出的料记入"（G8 多人分法）');
need13(r15, ['**损失不记**', '本卷不记任何腿'], '13 规则 5"损失不记"');
need13(r15, ['**凡设施行终止，资产分录都记出**', '拆除、损毁即终止（不论烧光、塌毁、夷平）、承载物终止——同一处理', '记单向去处 `sink_loss`'], '13 规则 5"凡设施行终止"三种起因同一处理');
need13(r15, ['**原地翻修先拆再建**', '拆下的旧料按翻修前的份额分给原来的各持有人', '经 `src_transform` 记给翻修的出资方', '翻修前后该实例的份额之和都是一万基点', '出租人角色转给新的份额持有人'], '13 规则 5"原地翻修先拆再建"');
need13(r15, ['**物化建行**', '"未物化建筑份额"（`resfam_claim` 族的一行资源种类，键是该地点', '同一笔里该设施实例的一万基点建筑份额记转换来源 `src_transform`', '两条腿成对', '所以物化不产生任何 `src_genesis`'], '13 规则 5"物化建行"：未物化建筑份额成对转换');
need13(r15, ['**扩建**', '扩建就是加装固定装置', '不产出资产分录，份额不变，只许这处设施现有的份额持有人出资', '照"砌入的料记出"记', '走原地翻修'], '13 规则 5"扩建"');
need13(lines.find(l => l.startsWith('| `family` | enum resfam')) ?? '', ['尚未物化的远方建筑不在这一族', '"未物化建筑份额"'], '13 §2.1 resfam_asset 行末句指向未物化建筑份额');
report(lines.some(l => l.startsWith('| 未物化建筑份额 |') && l.includes('`resfam_claim`')), '13 术语表有"未物化建筑份额"一行');
need13(secText(22), ['物化建行时转换成实例的建筑份额、墙料记出，不用 `src_genesis`'], '13 §4.22 规则 3 物化不是来源');
need13(a1, ['**两卷对平的断言只在这里**', '同一种料各腿之和', '只有事由为开局建行的砌入没有物品腿', '明细的损失量在账本上没有任何腿', '凡设施行终止（拆除、损毁、承载物终止三种起因）的事务提交后，该实例的资产份额为零', '拆下的旧料各腿的收款人恰是翻修前的各份额持有人、按份额分且末位取差', '各人所得之和逐位等于明细的取出量', '物化建行的事务里 `src_genesis` 腿计数为 0', '扩建的事务里资产分录的腿计数为 0'], '13 A6-1.2 两卷对平只在这里、各事由断言');
// 第八版（二审 N7：预置墙料与未物化份额放进不可花分区 purpose_unmaterialized）：原必含"全部地点物化完毕后各聚合账户上……余额为零"一句不再查字面，
//   改查现行语义——余额为零指这一分区，分区只在第 0 日增加、只在物化那一笔减少、别的腿碰不到它。
//   反向：A6-1.2 不得为过本脚本保留那句"也就是全部地点物化完毕后……"的复述（审查/卷六重拆-二审只核.md 新真问题；改法是删句，不是留文）。
need13(a1, ['墙料从聚合账户 `purpose_unmaterialized` 分区记出的量与明细的砌入量逐料相等', '这一分区的余额只在第 0 日经 `src_genesis` 增加、只在物化建行那一笔减少', '以它为来账或去账的其他腿计数为 0', '一处地点物化完毕后该地点聚合账户这一分区的余额为零'], '13 A6-1.2 物化预置的余额只在专用分区上判（第八版）');
// 第九版之后（审查方）：原"13 反向"只查一句复述的字面，换个说法就漏；改查语义——A6-1.2 里凡说到聚合账户余额的分句都必须限定在 `purpose_unmaterialized` 这一分区，
//   不得说整个聚合账户或"全部地点"的余额为零。旧字面句因不带分区限定，照样被这一条拦下，判据只收紧不放宽。
{ const clauses = a1.split(/[。；]/).filter(c => c.includes('聚合账户') && c.includes('余额'));
  const unscoped = clauses.filter(c => !(c.includes('`purpose_unmaterialized`') || c.includes('这一分区')) || /全部地点|各聚合账户/.test(c));
  report(clauses.length > 0 && unscoped.length === 0, '13 反向（语义）：A6-1.2 说聚合账户余额的分句都限定在 purpose_unmaterialized 分区，不说全部地点、各聚合账户', unscoped.map(c => c.trim().slice(0, 30)).join(' / ')); }

// 14 第八版（李白对 审查/卷六重拆-二审.md N6、N7 的裁定；全书除数下界复扫本卷六处）。审查方补；只增不减
need13(secText(10), ['窗口内的全部分钟（`loadWindowDays` × 一个世界日的分钟数）', '与卷十九 §4.15 规则 1 `ops.utilization` 的分母同一口径', '不乘开放时段', '开放时段怎样设（含不对公众开放）都不改变读数'], '14 N6 负荷分母 = 席数 × 窗口全部分钟，与卷十九利用率同口径');
report(!secText(10).includes('开放分钟') && !secText(10).includes('可用分钟'), '14 N6 反向：§4.10 不再用开放分钟、可用分钟作分母');
report(!(lines.find(l => l.startsWith('| `stationLoad(facility, service)`')) ?? '').includes('开放时段'), '14 N6 反向：§2.3 stationLoad 行不再读开放时段');
report(!(lines.find(l => l.startsWith('| 工位负荷 |')) ?? '').includes('可用分钟'), '14 N6 反向：术语表"工位负荷"不再写"席数 × 可用分钟"（新真问题：跟改漏）');
need13(lines.find(l => l.startsWith('| `purpose` | `purpose_` |')) ?? '', ['`purpose_unmaterialized`', '`spendable` 为假、`visibleToMarket` 为假'], '14 N7 §2.2 purpose 族登记 purpose_unmaterialized（不可花、市场不可见）');
need13(r15, ['**两样都记在聚合账户的专用用途分区 `purpose_unmaterialized`**', '墙料照"砌入的料记出"从这一分区记转换去处'], '14 N7 §4.1 规则 5"物化建行"预置与记出都在专用分区');
need13(rowOf('demand'), ['`expectWindowDays: integer`（取值域 [1, null]', '`minTradesForHabit: integer`（惯常价生效所需的最少成交条数；取值域 [1, null]'], '14 复扫 §2.5 两键登记下限 1');
need13(rowOf('trade'), ['`statBatchGrain: integer`（取值域 [1, null]'], '14 复扫 §2.5 statBatchGrain 登记下限 1');
need13(secText(4), ['池内各成员近期可成交量之和为 0 时', '不做除法'], '14 复扫 §4.4 可得性 p 合计为 0 不做除法');
need13(secText(12), ['成员需要量之和为 0 时', '不做这次分配'], '14 复扫 §4.12 满足量分配需要量之和为 0 不适用');
need13(secText(21), ['当地日成交量为 0 时不做除法'], '14 复扫 §4.21 急售折价日成交量为 0 不做除法');
need13(secText(23), ['合计为 0 的这一期不做除法、不报对应的指标'], '14 复扫 §4.23 份额指标合计为 0 不报');
// 负荷：窗口、按 workstation 装置类过滤、读 occupancy 的逐条记录与 daily；本卷不存占用量、规则表无窗口天数键
const s10 = secText(10);
need13(s10, ['`stationLoad(facilityId, serviceCode)`', '窗口内承担该服务的工位的占用分钟之和', '`loadWindowDays` 个完整世界日', '其 `workstation` 写的是固定装置类时', '不点名任何装置', '逐条记录里固定装置类属于上面这些类的各条', '加汇总 `daily` 里窗口内各日这些类的分钟数', '为 0 时不做除法', '不会把炉子的负荷稀释掉', '**工位占用本卷不记，只读卷十九**', '不订阅占用边的任何事件'], '13 §4.10 负荷按窗口、按 workstation 装置类过滤、读逐条记录与 daily');
need13(s10, ['卷十九折叠记录前后读数逐位相同', '同一设施里不承担该服务的装置占不占，读数不变', '窗口内每天排满的单席装置负荷为一', '日结是否补跑，读数相同', '本卷的规则表里没有窗口天数键'], '13 A6-10.2 折叠不变、按服务过滤、补结不变');
need13(lines.find(l => l.startsWith('| `stationLoad(facility, service)`')) ?? '', ['`facilityView().occupancy`', '`rules.facility.station.loadWindowDays`', '本卷不存任何工位占用量'], '13 §2.3 stationLoad 行读卷十九视图与键');
report(rowOf('station') !== '' && !(sec25 ? sec25.text.join('\n') : '').includes('loadWindowDays'), '13 §2.5 本卷规则表里没有窗口天数键');

// 15 A6-1.2 与 §4.1 规则 5 的跨卷语义（审查方补，第九版之后）：不查字面复述句，查本卷引用的卷十九字段与接口真实存在、口径对得上
{
  const all19 = readFileSync('F:/dnd/docs/统一底层设计/卷十九-建筑与设施.md', 'utf8').split(/\r?\n/);
  const cut19 = all19.findIndex(l => l.startsWith('## 附 第二版影响面表'));
  const L19 = cut19 < 0 ? all19 : all19.slice(0, cut19);
  const wallRow = L19.find(l => l.startsWith('| `wallFlowKg` |')) ?? '';
  const sec413 = (() => { const s = L19.findIndex(l => l.startsWith('#### 4.1.3 ')); if (s < 0) return []; let e = L19.findIndex((l, i) => i > s && l.startsWith('#### ')); if (e < 0) e = L19.length; return L19.slice(s, e); })();
  const r11 = (() => { const a = sec413.findIndex(l => l.startsWith('11. ')); if (a < 0) return ''; let b = sec413.findIndex((l, i) => i > a && /^\d+\. /.test(l)); if (b < 0) b = sec413.length; return sec413.slice(a, b).join('\n'); })();
  report(wallRow !== '' && r11 !== '', '15 前提：卷十九 §2.1 有 wallFlowKg 一行、§4.1 规则 11 非空');
  // 15.1 卷十九实物账的字段：wallFlowKg 三项累计、明细结构（cause 与逐料三项）
  const FLOW = ['laidKg', 'takenKg', 'lostKg'];
  const flowMiss = FLOW.filter(f => !wallRow.includes(f + ': number'));
  const detailOk = /\{facility: [^}]*cause: [^}]*rows: \[\{material, laidKg, takenKg, lostKg\}\]\}/.test(r11);
  report(flowMiss.length === 0 && detailOk, '15.1 卷十九 wallFlowKg 存 laidKg、takenKg、lostKg 三项，规则 11 明细带 cause 与逐料三项', flowMiss.join('、') + (detailOk ? '' : ' 明细结构不符'));
  // 15.2 本卷正文（§2–§7）引用的每个 xxxKg 字段名都是卷十九实物账里真实存在的字段（wallFlowKg 或其三项），本卷不引用 materialKg
  const s2s = lines.findIndex(l => /^## §2 /.test(l)), s8s = lines.findIndex(l => /^## §8 /.test(l));
  const mid = lines.slice(s2s < 0 ? 0 : s2s, s8s < 0 ? lines.length : s8s);
  const kgRefs = new Map();
  mid.forEach((l, i) => { for (const m of l.matchAll(/`([A-Za-z]+Kg)`/g)) kgRefs.set(m[1], [...(kgRefs.get(m[1]) ?? []), i + (s2s < 0 ? 0 : s2s) + 1]); });
  const known = new Set(['wallFlowKg', ...FLOW]);
  const unknownKg = [...kgRefs].filter(([n]) => !known.has(n) || (n !== 'wallFlowKg' && !r11.includes(n)));
  report(unknownKg.length === 0, '15.2 本卷 §2–§7 引用的 xxxKg 字段都是卷十九 wallFlowKg 与规则 11 明细里的真实字段（不读 materialKg）', unknownKg.map(([n, ls]) => `${n}@${ls.join(',')}`).join(' '));
  report(['wallFlowKg', 'laidKg', 'takenKg', 'lostKg'].every(n => kgRefs.has(n)), '15.2 本卷引用了 wallFlowKg 与明细三项', FLOW.concat('wallFlowKg').filter(n => !kgRefs.has(n)).join('、'));
  // 15.3 本卷不存实物账：状态登记表（§2 各表）里没有任何以 Kg 结尾的字段行，也没有 wallFlowKg 的写入
  const sec2 = sectionOf(/^## §2 /, /^## §3 /);
  const kgRows = sec2 ? sec2.text.filter(l => /^\| `[A-Za-z.<>]*Kg[`.<]/.test(l)) : [];
  report(kgRows.length === 0, '15.3 本卷 §2 登记表里没有存砌入、取出、损失或墙料质量的字段', kgRows.map(l => l.slice(0, 30)).join(' / '));
  const flowWrite = mid.filter(l => /(写|改|加|减)[^。|]{0,8}`wallFlowKg`|`wallFlowKg`[^。|]{0,6}(\+=|−=|-=)/.test(l));
  report(flowWrite.length === 0, '15.3 本卷不写 wallFlowKg');
  // 15.4 腿与明细三项的对应：laidKg ↔ 砌入记出，takenKg ↔ 取出记入，lostKg ↔ 不记任何腿；对应写在本卷，三项都在卷十九
  const lostPt = r15.split('\n').find(l => l.includes('**损失不记**')) ?? '';
  report(lostPt.includes('`lostKg`') && lostPt.includes('本卷不记任何腿'), '15.4 规则 5"损失不记"点名 lostKg 并不记腿');
  const ruleSecs = [];
  for (let n = 1; n <= N; n++) { const s = subsystem(n); if (s) ruleSecs.push(partOf(s, n, 6).text.join('\n')); }
  const assertsAll = ruleSecs.join('\n');
  report(/备料账户出账的各料质量与卷十九同一事务明细的 `laidKg` 逐料逐位相等/.test(assertsAll) && /散料的入账与同一份明细的 `takenKg` 逐料逐位相等/.test(assertsAll), '15.4 断言把出账对 laidKg、散料入账对 takenKg');
  report(a1.includes('砌入量') && a1.includes('取出量') && a1.includes('损失量在账本上没有任何腿') && a1.includes('卷十九 A19-1.2'), '15.4 A6-1.2 两卷对平按明细三项分别判，守恒式引卷十九');
  // 15.5 本卷规则 5 处理的事由在卷十九规则 11 表里都有一行（事由代号由卷十九登记）
  const tbl19 = r11.split('\n').map(l => l.trim()).filter(l => l.startsWith('| ') && !l.startsWith('| 事由') && !/^\|[-| ]+\|$/.test(l)).map(l => l.split('|')[1].trim());
  const CAUSES6 = ['开局建行', '物化建行', '扩建', '拆除', '损毁', '承载物终止', '原地翻修'];
  const causeMiss = CAUSES6.filter(c => !tbl19.some(t => t.startsWith(c)));
  report(causeMiss.length === 0 && CAUSES6.every(c => r15.includes(c)), '15.5 本卷规则 5 的各事由都在卷十九规则 11 表里有一行', causeMiss.join('、'));
}

// 8 统计
const sec8 =sectionOf(/^## §8 /, /^## 附 /);
const openQ = sec8 ? sec8.text.filter(l => /^\| Q\d+ /.test(l)).length : 0;
out.push(`INFO  正文行数（不含本附录） = ${lines.length}`);
out.push(`INFO  子系统数 = ${subsystems.length}；规则条数 = ${ruleTotal}；开放问题数 = ${openQ}；验收断言数 = ${lines.filter(l => /^- 【/.test(l)).length}；扩展性测试数 = ${lines.filter(l => /^\| X6-\d+ /.test(l)).length}`);
out.push(failed === 0 ? 'RESULT  全部通过' : `RESULT  未通过 ${failed} 项`);
console.log(out.join('\n'));
process.exitCode = failed === 0 ? 0 : 1;
