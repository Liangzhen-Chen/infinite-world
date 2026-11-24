// 卷十九自检脚本：只读成稿文件，输出逐项结果。用法：node F:/dnd/docs/统一底层设计/脚本/卷十九/check-卷十九.mjs
import {readFileSync} from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷十九-建筑与设施.md';
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

// 1 §0–§8 与附表齐全
for (let n = 0; n <= 8; n++) report(lines.some(l => new RegExp(`^## §${n} `).test(l)), `1 顶层节 §${n}`);
report(lines.some(l => /^## 附 术语与代号表/.test(l)), '1 附 术语与代号表');

// 2–4 子系统 6 小节、实例、断言
const N = 16;
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const subsystems = lines.filter(l => /^### 4\.\d+ /.test(l));
report(subsystems.length === N, '2 子系统数', `= ${subsystems.length}`);
for (let n = 1; n <= N; n++) {
  const sec = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## )/);
  if (!sec) { report(false, `2 子系统 4.${n} 存在`); continue; }
  const missing = SUB.filter((t, i) => !sec.text.some(l => l.startsWith(`#### 4.${n}.${i + 1} ${t}`)));
  report(missing.length === 0, `2 子系统 4.${n} 六小节`, missing.join('、'));
  const part = k => {
    const s = sec.text.findIndex(l => l.startsWith(`#### 4.${n}.${k} `));
    if (s < 0) return [];
    let e = sec.text.findIndex((l, i) => i > s && l.startsWith('#### '));
    if (e < 0) e = sec.text.length;
    return sec.text.slice(s + 1, e);
  };
  const inst = part(5).filter(l => l.startsWith('- '));
  const nonWest = inst.some(l => l.includes('非西陲'));
  const nonHuman = inst.some(l => l.includes('非人类') || l.includes('超自然'));
  report(inst.length >= 3 && nonWest && nonHuman, `3 子系统 4.${n} 数据实例`, `条数 ${inst.length}，非西陲 ${nonWest}，非人类或超自然 ${nonHuman}`);
  const asserts = part(6).join('\n');
  const kinds = ['【扫描】', '【不变量】', '【扩展性】'].filter(k => !asserts.includes(k));
  report(kinds.length === 0, `4 子系统 4.${n} 三类断言`, kinds.join(''));
  const rules = part(3).filter(l => /^\d+\. /.test(l)).length;
  report(rules >= 3, `4 子系统 4.${n} 规则条数`, `= ${rules}`);
}

// 5 具体 id 字面量（全文；允许表名与词表族名）
const ENTITY = ['item', 'mat', 'species', 'flora', 'body', 'npc', 'creature', 'loc', 'bld', 'fac', 'recipe', 'org', 'office', 'polity', 'law',
  'deity', 'faith', 'culture', 'profession', 'skill', 'lore', 'offense', 'status', 'etype', 'eff', 'mod'];
const ALLOW = new Set(['law_code', 'body_plan', 'status_family', 'status_target', 'body_part']);
const idRe = new RegExp(`(?<![A-Za-z0-9_.])(?:${ENTITY.join('|')})_[a-z0-9_]+`, 'g');
const idHits = [];
lines.forEach((l, i) => { for (const m of l.match(idRe) ?? []) if (!ALLOW.has(m)) idHits.push(`${i + 1}:${m}`); });
report(idHits.length === 0, '5 具体实体 id 字面量', idHits.slice(0, 10).join(' '));
// 词表代号实例（带本卷族前缀的具体条目）也不得出现在正文规则里：只允许 "前缀_" 形式的族前缀说明
const vocabRe = /(?<![A-Za-z0-9_.])(?:fn|fx|bldform|layout|zrole|rasp|net|trigq|fcomb)_[a-z0-9]+/g; // 第四版：bform 前缀改 bldform_，deploy 族删除
const vocabHits = [];
lines.forEach((l, i) => { for (const m of l.match(vocabRe) ?? []) vocabHits.push(`${i + 1}:${m}`); });
report(vocabHits.length === 0, '5 本卷词表条目代号字面量', vocabHits.slice(0, 10).join(' '));

// 6 用于判断的描述性文本
const judgeRe = [/\.includes\(/, /\.startsWith\(/, /\.endsWith\(/, /\.test\(/, /\.match\(/, /===?\s*['"][^'"]+['"]/, /`\/[^`]*[\u4e00-\u9fff][^`]*\/[a-z]*`/];
const sec7 = sectionOf(/^## §7 /, /^## §8 /);
const sec1 = sectionOf(/^## §1 /, /^## §2 /);
const inLegacy = i => (sec7 && i >= sec7.start && i < sec7.end) || (sec1 && i >= sec1.start && i < sec1.end);
const judgeHits = [];
lines.forEach((l, i) => { if (!inLegacy(i) && judgeRe.some(r => r.test(l))) judgeHits.push(i + 1); });
report(judgeHits.length === 0, '6 用于判断的描述性文本（§1、§7 引述旧代码除外）', judgeHits.slice(0, 10).join(' '));
// purpose 只许出现在"现状、禁止、迁移、断言"语境：规则小节里不得出现
// 1114 统计层勘误（§4.4 规则 10 ③ 不可花分区改回固定代号）：规则小节只许以反引号包住的固定代号 `purpose_<id>` 引用，
// 且该代号须是卷六 purpose 族词表行已登记的条目；去掉这些引用后任何 purpose 字样（字段名、字面读法、未登记代号）照旧 FAIL
const vol6 = readFileSync('F:/dnd/docs/统一底层设计/卷六-经济.md', 'utf8');
const purposeRow = vol6.split(/\r?\n/).find(l => l.startsWith('| `purpose` | `purpose_` |')) ?? '';
const purposeRegistered = new Set((purposeRow.match(/`purpose_[a-z0-9_]+`/g) ?? []).map(s => s.slice(1, -1)));
const purposeHits = [];
for (let n = 1; n <= N; n++) {
  const sec = sectionOf(new RegExp(`^#### 4\\.${n}\\.3 `), /^#### /);
  if (sec) sec.text.forEach((l, i) => {
    const rest = l.replace(/`(purpose_[a-z0-9_]+)`/g, (m, code) => (purposeRegistered.has(code) ? '' : m));
    if (/purpose/.test(rest)) purposeHits.push(sec.start + i + 1);
  });
}
report(purposeRegistered.size > 0, '6 前提：卷六 purpose 族词表行读到已登记代号');
report(purposeHits.length === 0, '6 规则小节不读 purpose（只许引用卷六已登记的固定代号）', purposeHits.join(' '));
const NAMES = ['白石', '黑炉', '河湾'];
const nameHits = [];
lines.forEach((l, i) => { if (NAMES.some(n => l.includes(n))) nameHits.push(i + 1); });
report(nameHits.length === 0, '6 具体地区名', nameHits.join(' '));
// 规则小节里不得出现裸的小数系数
const constHits = [];
for (let n = 1; n <= N; n++) {
  const sec = sectionOf(new RegExp(`^#### 4\\.${n}\\.3 `), /^#### /);
  // 锚点修订 11-14：同卷六，先遮掉 R/A/S/C/E 前缀的规则编号（如 R17-2.9），免得条号被当成系数
  if (sec) sec.text.forEach((l, i) => { if (/(?<![\w.§])\d+\.\d+(?![\w.])/.test(l.replace(/(?<![A-Za-z])[RASCE]\d+-\d+(\.\d+)+/g, '').replace(/§\d+(\.\d+)*/g, '').replace(/4\.\d+(\.\d+)?/g, ''))) constHits.push(sec.start + i + 1); });
}
report(constHits.length === 0, '6 规则小节无裸系数', constHits.join(' '));

// 7 台账判给本卷的概念（台账 2.5 卷十九小节 + 第五节清单），逐条核对落在指定小节
const LEDGER = [
  ['建筑实体、房间、condition、维护', 1, ['comp_facility', 'comp_zone', 'condition', 'repairFacility', 'aperture', 'skyExposure', 'envelopeUaWPerK']],
  ['设施类型表', 2, ['functionNeeds', 'functions', 'intendedType', 'specificity']],
  ['工位（提供哪些服务的设施条件）', 3, ['stationSlots', 'stationFor', 'services', '卷十四']],
  ['建造需求', 4, ['envelopeReq', 'buildPlan', 'completeBuild', '前状态', '后状态', '北极星']],
  ['形制', 5, ['bform', 'chooseForm', '文化偏好']],
  ['布局模板', 6, ['layout', 'zrole', '卷十 §4.7']],
  ['炉窑热量与燃料', 7, ['hearth', 'kilnReach', 'chamberTempC', 'heatOutW']],
  ['住宿、租房、床位', 8, ['restSite', 'assignBed', '卷六 §4.18']],
  ['公共设施维护', 9, ['maintenance', '卷六 §4.19', 'X-29']],
  ['可移动建筑与龛祠', 10, ['portable', 'deployFacility', 'packFacility', '龛祠', 'X-26']],
  ['房间评价（美观聚合、清洁）', 11, ['rating', 'beauty', 'dirt', 'impression', 'S-20']],
  ['场所', 12, ['services', 'serviceEffects', 'openSpan', 'X-26']],
  ['仓储', 13, ['storeFilter', 'storeTarget', 'volumeCapacity']],
  ['机关', 14, ['mechanism', 'triggerStep', 'linkedTo']],
  ['设施运营成本', 15, ['upkeepPerDay', 'laborPerDay', 'ownerFeeRate', 'networkNeeds']],
  ['结构防御接口', 16, ['breachEnergyKJ', 'damageFacility', 'terminate', '卷十三 §4.15']],
];
for (const [name, n, keys] of LEDGER) {
  const sec = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## )/);
  const text = sec ? sec.text.join('\n') : '';
  const miss = keys.filter(k => !text.includes(k));
  report(miss.length === 0, `7 台账概念：${name} → §4.${n}`, miss.length ? '缺 ' + miss.join('、') : '');
}
// 判给别卷的概念只引用：服务词表、单件美观值、站点类型不得在本卷出现条目字段定义
const s2 = sectionOf(/^## §2 /, /^## §3 /);
const s2t = s2 ? s2.text.join('\n') : '';
report(!/\| `service` /.test(s2t) && !/\| `site` /.test(s2t), '7 未重定义别卷词表族（service、site）');
// 给别卷的入口名都在 §3 与 §5 出现
const s3 = sectionOf(/^## §3 /, /^## §4 /); const s5 = sectionOf(/^## §5 /, /^## §6 /);
const s35 = (s3 ? s3.text.join('\n') : '') + (s5 ? s5.text.join('\n') : '');
for (const fn of ['facilityTypeView', 'facilityView', 'chooseForm', 'buildPlan', 'stationFor', 'restSite', 'kilnReach', 'storeTarget', 'damageFacility', 'settleFacilities'])
  report(s35.includes(fn), `7 §3/§5 给出入口名 ${fn}`);
// §7 列出木石写死位置与 purpose 正则位置
const s7t = sec7 ? sec7.text.join('\n') : '';
for (const k of ['public-projects.mjs:119', 'building-maintenance.mjs:49', 'facility-state.mjs:35', 'engine.mjs:423', 'promotion.mjs:54', '06a', '06b'])
  report(s7t.includes(k), `7 §7 列出 ${k}`);

// 9 第二版：按一审意见与主会话裁定的定点核对
const body = lines.join('\n');
const sub = n => { const s = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## )/); return s ? s.text.join('\n') : ''; };
report(!/wsum\(material, conductivity\)/.test(body) && sub(1).includes('thermalConductivity') && sub(1).includes('soundAttenuation'), '9 裁定1 导热与隔声用卷三已登记的维度名');
report(sub(4).includes('solidAreaM2 × wallThicknessM') && sub(4).includes('density') && sub(4).includes('手算示例'), '9 裁定1 用料 = 面积 × 厚度 × 密度，附手算示例');
// 手算示例的数由脚本重算，须与正文一致
const fmt = x => String(Math.round(x * 100) / 100);
const env = 4 * Math.sqrt(36) * 2.5 * 1 + 36 * 1, solid = env * 0.9, vol = solid * 0.4;
const expectNums = [fmt(env), fmt(solid), fmt(vol), '62 208', '89 856', fmt(env * (0.9 * 0.8 / 0.4 + 0.1 * 5)), fmt(env * (0.9 * 2.0 / 0.4 + 0.1 * 5)), fmt(env * (0.9 * 0.8 / 0.8 + 0.1 * 5)), '124 416', '27 648'];
report(Math.round(vol * 1800) === 62208 && Math.round(vol * 2600) === 89856 && Math.round(solid * 0.8 * 1800) === 124416, '9 裁定1 手算示例质量复算');
const missNums = expectNums.filter(x => !sub(4).includes(x));
report(missNums.length === 0, '9 裁定1 手算示例数值与正文一致', missNums.join(' '));
const typeRow = lines.find(l => l.startsWith('| `type` |')) ?? '';
const fnRow = lines.find(l => l.startsWith('| `functions` |')) ?? '';
report(typeRow !== '' && !/opsLevel|ops\.level|账户|排班/.test(typeRow) && !/`condition`、|opsLevel、/.test(typeRow.split('|')[4] ?? ''), '9 裁定2 type 的输入不含运行时的量');
report(fnRow.includes('不读 `condition`') && body.includes('依赖次序（无环') && body.includes('`effective`'), '9 裁定2 functions 为已装能力，另立 effective，声明无环');
report(s2t.includes('`accessDefault`') && sub(2).includes('accessDefault') && s35.includes('accessClassAt'), '9 裁定3 accessDefault 单点定义并给出入口');
report(sub(8).includes('本卷只引用') && sub(8).includes('租住权') && sub(8).includes('当夜占用'), '9 裁定4 住宿合同种类归卷六，本卷只引用');
const s3t = s3 ? s3.text.join('\n') : '';
report(/\| S19-9 \|/.test(s3t) && /\| S19-10 \|/.test(s3t) && s3t.includes('material-field-names.json'), '9 裁定5 分类输入扫描规则与可判定的 S19-4');
report(!/产物行各不相同/.test(body) && sub(4).includes('换技能组'), '9 裁定5 A19-4.3 改成可判定的形式');
for (const k of ['facilities.mjs:53', 'facilities.mjs:123', 'agriculture.mjs:60', '`rooms`', '`lodging`', '520', 'fixtures.json', 'validateThermalModel', 'facility-types.json'])
  report(s7t.includes(k), `9 裁定6 §7 列出 ${k}`);
for (const k of ['rankWeights', 'laborHeads', 'soundCurve`', '时段进入许可四类', '登记为损耗'])
  report(!body.includes(k), `9 旧稿残留：${k}`);
report(lines.some(l => l.startsWith('## 附 第二版影响面表')) && lines.some(l => l.startsWith('## 附 记账栏')), '9 卷末有影响面表与记账栏');

// 10 第三版：二审六条新矛盾与 Q12–Q20 的定点核对
const rule = (n, k) => { const s = sectionOf(new RegExp(`^#### 4\\.${n}\\.3 `), /^#### /); if (!s) return ''; const a = s.text.findIndex(l => l.startsWith(`${k}. `)); if (a < 0) return ''; let b = s.text.findIndex((l, i) => i > a && /^\d+\. /.test(l)); if (b < 0) b = s.text.length; return s.text.slice(a, b).join('\n'); };
report(!body.includes('rules.facility.repair.massShare') && !/`minutesPerKg`、/.test(s2t) && rule(1, 7).includes('§4.4 规则 1') && rule(1, 7).includes('replaceShare') && rule(1, 7).includes('等比例') && !/envelopeMassKg × 份额/.test(body), '10 新1 修缮复用建造的用料式，按体积份额');
report(rule(1, 6).includes('ops.useIntensity') && rule(1, 6).includes('visitsToday') && rule(1, 6).includes('visitUseCurve') && s2t.includes('visitUseCurve') && s2t.includes('useIntensity') && !/wearPerDay × ops\.utilization/.test(body), '10 新2 使用磨损读使用强度，没有工位也适用');
report(rule(2, 7).includes('没有偏离行的房间行') && rule(2, 7).includes('有偏离行的房间行') && rule(2, 7).includes('较小') && rule(12, 2).includes('calendarDayIndex') && rule(12, 2).includes('calendarMinuteOf') && rule(12, 2).includes('跨过日界'), '10 新3 房间的有效档与开放时段有定义，时段读卷二十日历入口');
const row = code => lines.find(l => l.startsWith(`| ${code} |`)) ?? '';
report(row('S19-10').includes('accessDefaultOf') && row('S19-10').includes('buildProjectView') && s3t.includes('| `accessDefaultOf` |') && s3t.includes('| `buildProjectView` |') && !s3t.includes('| `projectView` |') && !body.includes('buildProject.intent.intendedType') && rule(2, 7).includes('accessDefaultOf'), '10 新4 S19-10 与缺省链、在建工程不再冲突');
report(row('S19-9').includes('按写者') && row('S19-9').includes('canEnter') && row('S19-9').includes('识别口径') && !row('S19-9').includes('返回布尔或用作分组键'), '10 新5 S19-9 按写者与类型划定，排除进入判定');
report(rule(5, 2).includes('按体积算') && rule(5, 2).includes('wallThicknessM') && !/能满足的质量 ÷/.test(body) && /`chooseForm` \|[^|]*wallThicknessM/.test(s3t), '10 新6 可得度按体积定义，分母不依赖选料');
for (let q = 12; q <= 19; q++) report(row(`Q${q}`).includes('定义方：') && row(`Q${q}`).includes('配合'), `10 Q${q} 写明定义方与须别卷配合`);
report(row('Q20').includes('不是真问题'), '10 Q20 标为非真问题');
report(lines.some(l => l.startsWith('## 附 第三版口径牵连清单')) && lines.some(l => l.startsWith('| 第三版：')), '10 卷末有牵连清单，影响面表有第三版一行');

// 8 统计
const sec8 = sectionOf(/^## §8 /, /^## 附 /); // 第三版的定点核对在上面第 10 组
const openQ = sec8 ? sec8.text.filter(l => /^\| Q\d+ /.test(l)).length : 0;
out.push(`INFO  正文行数（不含本附录） = ${lines.length}`);
out.push(`INFO  子系统数 = ${subsystems.length}；开放问题数 = ${openQ}；验收断言数 = ${lines.filter(l => /^- 【/.test(l)).length}；扩展性测试数 = ${lines.filter(l => /^\| X19-\d+ /.test(l)).length}；迁移行数 = ${sec7 ? sec7.text.filter(l => /^\| \d+ /.test(l)).length : 0}`);
out.push(failed === 0 ? 'RESULT  全部通过' : `RESULT  未通过 ${failed} 项`);
console.log(out.join('\n'));
process.exitCode = failed === 0 ? 0 : 1;
