// 卷二十五自检脚本：只读成稿文件，输出逐项结果。用法：node F:/dnd/docs/统一底层设计/脚本/卷二十五/check-卷二十五.mjs
import {readFileSync} from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷二十五-农牧渔猎与食物链.md';
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

// 1 顶层节
for (let n = 0; n <= 8; n++) report(lines.some(l => new RegExp(`^## §${n} `).test(l)), `1 顶层节 §${n}`);
report(lines.some(l => /^## 附 术语与代号表/.test(l)), '1 附 术语与代号表');
report(!lines.some(l => l.includes('@@')), '1 无残留占位标记');

// 2–4 子系统
const N = 12;
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const subsystems = lines.filter(l => /^### 4\.\d+ /.test(l));
report(subsystems.length === N, '2 子系统数', `= ${subsystems.length}`);
const partOf = (n, k) => {
  const sec = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## |---$)/);
  if (!sec) return [];
  const s = sec.text.findIndex(l => l.startsWith(`#### 4.${n}.${k} `));
  if (s < 0) return [];
  let e = sec.text.findIndex((l, i) => i > s && l.startsWith('#### '));
  if (e < 0) e = sec.text.length;
  return sec.text.slice(s + 1, e);
};
for (let n = 1; n <= N; n++) {
  const sec = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## |---$)/);
  if (!sec) { report(false, `2 子系统 4.${n} 存在`); continue; }
  const missing = SUB.filter((t, i) => !sec.text.some(l => l.startsWith(`#### 4.${n}.${i + 1} ${t}`)));
  report(missing.length === 0, `2 子系统 4.${n} 六小节`, missing.join('、'));
  const inst = partOf(n, 5).filter(l => l.startsWith('- '));
  const nonWest = inst.some(l => l.includes('【非西陲】'));
  const nonHuman = inst.some(l => l.includes('【非人类】') || l.includes('【超自然】'));
  report(inst.length >= 3 && nonWest && nonHuman, `3 子系统 4.${n} 数据实例`, `条数 ${inst.length}，非西陲 ${nonWest}，非人类或超自然 ${nonHuman}`);
  const asserts = partOf(n, 6).join('\n');
  const kinds = ['【扫描】', '【不变量】', '【扩展性】'].filter(k => !asserts.includes(k));
  report(kinds.length === 0, `4 子系统 4.${n} 三类断言`, kinds.join(''));
  const rules = partOf(n, 3).filter(l => /^\d+\. /.test(l));
  report(rules.length >= 5, `4 子系统 4.${n} 规则条数`, `= ${rules.length}`);
}

// 5 具体实体 id 字面量（全文；表名与词表族名除外）
const ENTITY = ['item', 'mat', 'species', 'flora', 'body', 'npc', 'creature', 'loc', 'bld', 'fac', 'recipe', 'org', 'office', 'polity', 'law',
  'deity', 'faith', 'culture', 'profession', 'skill', 'lore', 'offense', 'status', 'etype', 'eff', 'mod'];
const ALLOW = new Set(['law_code', 'body_plan', 'body_part']);
const idRe = new RegExp(`(?<![A-Za-z0-9_.])(?:${ENTITY.join('|')})_[a-z0-9_]+`, 'g');
const idHits = [];
lines.forEach((l, i) => { for (const m of l.match(idRe) ?? []) if (!ALLOW.has(m)) idHits.push(`${i + 1}:${m}`); });
report(idHits.length === 0, '5 具体实体 id 字面量', idHits.slice(0, 10).join(' '));

// 6 用于判断的描述性文本
const judgeRe = [/\.includes\(/, /\.startsWith\(/, /\.endsWith\(/, /\.test\(/, /\.match\(/, /===?\s*['"][^'"]+['"]/, /`\/[^`]*[\u4e00-\u9fff][^`]*\/[a-z]*`/];
const sec7 = sectionOf(/^## §7 /, /^## §8 /);
const sec1 = sectionOf(/^## §1 /, /^## §2 /);
const inLegacy = i => (sec7 && i >= sec7.start && i < sec7.end) || (sec1 && i >= sec1.start && i < sec1.end);
const judgeHits = [];
lines.forEach((l, i) => { if (!inLegacy(i) && judgeRe.some(r => r.test(l))) judgeHits.push(i + 1); });
report(judgeHits.length === 0, '6 用于判断的描述性文本（§1、§7 引述旧代码除外）', judgeHits.slice(0, 10).join(' '));
// 规则里不得拿中文词当取值比较（形如 等于"某词" / 为"某词"时）
const cnJudge = [];
for (let n = 1; n <= N; n++) partOf(n, 3).forEach(l => { if (/(等于|取值为|标记为)\s*["“][\u4e00-\u9fff]+["”]/.test(l)) cnJudge.push(`4.${n}`); });
report(cnJudge.length === 0, '6 规则小节无中文取值比较', cnJudge.join(' '));
const NAMES = ['白石', '黑炉', '河湾镇', '燕麦', 'oats'];
const nameHits = [];
lines.forEach((l, i) => { if (NAMES.some(n => l.includes(n))) nameHits.push(i + 1); });
report(nameHits.length === 0, '6 具体地名与具体主粮名', nameHits.join(' '));
// 规则小节无裸的小数系数
const constHits = [];
for (let n = 1; n <= N; n++) {
  const sec = sectionOf(new RegExp(`^#### 4\\.${n}\\.3 `), /^#### /);
  if (sec) sec.text.forEach((l, i) => { if (/(?<![\w.§])\d+\.\d+(?![\w.])/.test(l.replace(/(?<![A-Za-z])[RASCE]\d+-\d+(\.\d+)+/g, '').replace(/§\d+(\.\d+)*/g, ''))) constHits.push(sec.start + i + 1); });
}
report(constHits.length === 0, '6 规则小节无裸系数', constHits.join(' '));

// 7 台账判给本卷的概念（台账二 卷二十五小节 + E-04 + 五 卷二十五清单）
const LEDGER = [
  ['作物参数与生长', 1, ['plant', 'cropGrowth', 'maturityGdd', 'potential']],
  ['农事历、播种收割、歉收', 2, ['农事历', 'sowWindow', '出苗率', '丰歉指数']],
  ['害兽', 3, ['edibleBy', 'take', 'guard']],
  ['土地肥力', 4, ['soilFertility', 'fertilityDraw', '休耕']],
  ['畜牧（饲料、产奶、剪毛、繁殖、淘汰）', 5, ['饲料', '产出累积', '采收', '繁殖', '淘汰']],
  ['驯服、宠物、坐骑', 6, ['驯服', '宠物', 'canRide', '驾驭容量']],
  ['屠宰与收获产量', 7, ['salvageFraction', 'process.butcherYield', '守恒']],
  ['狩猎、捕鱼、采集的方法行', 8, ['take', '方法行', 'NPC', '食物链']],
  ['烹饪配方行与折损数据', 9, ['配方', '折损', 'reactionProducts']],
  ['酿造配方行', 10, ['醪', '腐坏', '配方']],
  ['储藏腐坏接口', 11, ['保质日数', '种子', '可撑天数']],
  ['伦理禁食禁屠', 12, ['tabooFacts', '卷七', '可行']],
];
for (const [name, n, keys] of LEDGER) {
  const text = partOf(n, 3).join('\n');
  const miss = keys.filter(k => !text.includes(k));
  report(miss.length === 0, `7 台账概念「${name}」落在 §4.${n} 规则`, miss.length ? '缺 ' + miss.join('、') : '');
}
// E-04 plant：卷二 §5.19 的字段全部在 §2.1 有行或有处置
const sec21 = sectionOf(/^### 2\.1 /, /^### 2\.2 /);
const V2 = ['taxon', 'growthDays', 'yieldPerM2', 'fertilityNeed', 'waterNeed', 'growTempC', 'frostToleranceC', 'soilTypes', 'habitats', 'products', 'ediblePart', 'toxicity', 'perennial', 'regrowRate'];
const rowMiss = V2.filter(k => !sec21.text.some(l => l.startsWith('| `' + k + '`')));
report(rowMiss.length === 0, '7 E-04 plant：卷二首批字段在 §2.1 逐行给出', rowMiss.join('、'));
report(sec21.text.some(l => l.includes('sowSeasons') && l.includes('harvestSeasons')), '7 E-04 plant：sowSeasons / harvestSeasons 有处置');
// §2.1 每行九列
const badCols = sec21.text.filter(l => l.startsWith('| `')).filter(l => l.split('|').length - 2 !== 9);
report(badCols.length === 0, '7 §2.1 维度行九列齐全（含单位、取值域、onUnknown、出处）', `异常 ${badCols.length}`);
// 产量三方面
const g = partOf(1, 3).join('\n');
report(['地 =', '天 =', '人 ='].every(k => g.includes(k)), '7 产量三方面（地、天、人）在 §4.1 规则给出');
// 只引用的三块：本卷 §2 不重定义
const sec2 = sectionOf(/^## §2 /, /^## §3 /);
const FOREIGN = ['rotRate', 'habitatCapacity', 'env.tempC', 'energyDensity', 'nutrients', 'stockState'];
const redef = FOREIGN.filter(k => sec2.text.some(l => l.startsWith('| `' + k + '`')));
report(redef.length === 0, '7 卷五存量、卷二十天气、卷三材料的维度未在本卷 §2 重定义', redef.join('、'));
// §7 含指定行
report(sec7.text.some(l => l.includes('agriculture.mjs:313')), '7 §7 列入 agriculture.mjs:313');
const MUST7 = ['agriculture.mjs:44', 'agriculture.mjs:45', 'husbandry.mjs:24', 'husbandry.mjs:45', 'pets.mjs:26', 'pets.mjs:77', 'extraction.mjs:118', 'extraction.mjs:147', 'extraction.mjs:165', 'extraction.mjs:203', 'weather.mjs:211'];
const miss7 = MUST7.filter(k => !sec7.text.some(l => l.includes(k)));
report(miss7.length === 0, '7 §7 覆盖素材包 §3b 的写死与读文字位置', miss7.join('、'));
// 补充裁定
const body = lines.join('\n');
report(!/全局计数器|单调序号/.test(body) && body.includes('骰值键'), '8 骰值键不用全局计数器');
report(/一次推进.{0,40}(同一份|相同)/.test(body), '8 结果与推进路径无关有明文');

// 9 第二版：第一轮审查与主会话五条裁定
const ledgerAt = lines.findIndex(l => l.startsWith('## 附 小项记账栏'));
const impactAt = lines.findIndex(l => l.startsWith('## 附 第二版影响面表'));
report(ledgerAt > 0 && impactAt > ledgerAt, '9 卷末有小项记账栏与第二版影响面表');
const mainLines = ledgerAt > 0 ? lines.slice(0, ledgerAt) : lines;
const mainText = mainLines.join('\n');
const GONE = ['tendEffMinutes', 'irrigMm', 'settledGrowth', 'restartFraction', 'afterBirthOnly', 'timingSpreadCurve', 'cultivation.<存量单元>.<植物>', '方法行 `alive`', '类型的 `methods`', '(tractId, plantId'];
const goneHits = GONE.filter(k => mainText.includes(k));
report(goneHits.length === 0, '9 旧口径的字段与写法已从正文清除', goneHits.join('、'));
const DECLARED = ['productVia', 'holdDays', 'individuateMassKg'];
const declHits = [];
mainLines.forEach((l, i) => { if (DECLARED.some(k => l.includes(k)) && !/删|不在这里/.test(l)) declHits.push(i + 1); });
report(declHits.length === 0, '9 裁定1：另造的畜产字段只在"已删除"的说明里出现', declHits.join(' '));
const r5 = partOf(5, 3).join('\n');
const miss5 = ['renewables', 'renewableOf', 'takeRenewable', '材料', '技能', '意图'].filter(k => !r5.includes(k));
report(miss5.length === 0, '9 裁定1：§4.5 规则用卷四三入口并写明材料、技能、意图', miss5.join('、'));
report(!/待收账户[^。；]*入账到|畜产来源入账/.test(r5), '9 裁定1：§4.5 规则无待收入账');
const r3 = partOf(3, 3).join('\n');
report(r3.includes('cropForage') && r3.includes('只在卷五算一次') && !r3.includes('调 `take` 取走'), '9 裁定2：害兽只在卷五容量模型算一次，本卷只供 cropForage');
const r8 = partOf(8, 3).join('\n');
report(r8.includes('每条关系只算一次') && r8.includes('不为野生种群调 `take`'), '9 裁定2：§4.8 食物链含义不重复扣减');
const sec23 = sectionOf(/^### 2\.3 /, /^### 2\.4 /);
report(sec23.text.some(l => l.startsWith('| `cultivation.<存量单元>.<plantingId>`')), '9 裁定3：耕作记录键为（存量单元，plantingId）');
const r1 = partOf(1, 3).join('\n');
report(r1.includes('不准追溯') && r1.includes('g(d) =') && partOf(1, 6).join('\n').includes('不追溯'), '9 裁定3：按日累积、不追溯，有规则与断言');
const miss21 = ['restartKg', 'coverDim'].filter(k => !sec21.text.some(l => l.startsWith('| `' + k + '`')));
report(miss21.length === 0, '9 裁定4：§2.1 有 restartKg、coverDim', miss21.join('、'));
report(mainText.includes('partsAllowed') && mainText.includes('aliveAllowed') && mainText.includes('intent.parts') && mainText.includes('intent.alive'), '9 裁定4：方法行字段名与意图槽按卷五第三版');
const MUST7B = ['agriculture.mjs:194', 'agriculture.mjs:479', 'agriculture.mjs:610', 'agriculture.mjs:126', 'farm-pests.mjs:84', 'farm-pests.mjs:27', 'farm-pests.mjs:11',
  'household-subsistence.mjs:373', 'household-subsistence.mjs:595', 'household-subsistence.mjs:297', 'household-subsistence.mjs:301', 'household-subsistence.mjs:320', 'household-subsistence.mjs:425',
  'wildlife.mjs:266', 'wildlife.mjs:72', 'pets.mjs:73', 'extraction.mjs:26', 'extraction.mjs:141', 'extraction.mjs:169', 'extraction.mjs:279', 'extraction.mjs:282', 'extraction.mjs:31',
  'magic-growth.mjs:58', 'hazardYieldFactor', 'famineAt', 'weather.mjs:137', 'rules.householdSubsistence', 'rules.forestWater', 'corpseMinutes', 'portions'];
const miss7b = MUST7B.filter(k => !sec7.text.some(l => l.includes(k)));
report(miss7b.length === 0, `9 裁定5：§7 逐处列出一审 B 第 11 条与卷二十移交的位置（${MUST7B.length} 项）`, miss7b.join('、'));
const emptyGo = sec7.text.filter(l => l.startsWith('| ') && !l.startsWith('|---')).filter(l => { const c = l.split('|'); return c.length < 5 || c[3].trim() === ''; });
report(emptyGo.length === 0, '9 裁定5：§7 每行都有去向', `空 ${emptyGo.length}`);
const scan = sectionOf(/^### 3\.5 /, /^---$/);
report(['S25-9', 'S25-10', 'S25-11'].every(k => scan.text.some(l => l.startsWith('| ' + k + ' '))) && !scan.text.some(l => l.includes('食性、作物、畜产')), '9 扫描式改为白名单与全量口径（S25-9 至 S25-11；S25-3 无主题限定）');
report(/`sapient` 为假/.test(partOf(6, 6).join('\n')) && mainText.includes('sourceSapient'), '9 驯服容器不施于有心智者；sapientShare 读 sourceSapient');
const ledgerRows = lines.slice(ledgerAt, impactAt).filter(l => /^\| [AB] 小项 \d+ /.test(l)).length;
report(ledgerRows === 20, '9 小项记账栏条数（A 12 + B 8）', `= ${ledgerRows}`);

// 10 第三版：二审 N1、N2；卷十九同类定稿清单 25-1 至 25-8；后门预扫两条；卷四第六版；satiety 口径
const impact3At = lines.findIndex(l => l.startsWith('## 附 第三版影响面表'));
// 第五版改锚点（主会话 11-13）：版本号改为现行的第五版；断言内容（标题带现行版本号、卷末有第三版影响面表）不变。
report(/^# 卷二十五 .*（第五版）/.test(lines[0]) && impact3At > impactAt, '10 标题为现行版（第五版），卷末有第三版影响面表');
const s23 = sec23.text.join('\n');
report(s23.includes('**存法**') && ['`stockMode: raw`', '`stockMode: extScale`', '`stockMode: anchor`'].every(k => s23.includes(k)), '10 §2.3 各逐次改写的字段登记 stockMode（25-4、25-5、25-7、25-8）');
report(s23.includes('`lostKg` 不落存储') && !sec23.text.some(l => /^\| \| `[^|]*`lostKg`/.test(l)), '10 lostKg 不存储，改为派生（25-6）');
report(s23.includes('n × 2 × 10⁻⁸') && s23.includes('上界放大计入') && partOf(1, 6).join('\n').includes('A25-1.6'), '10 extScale 误差界按放大口径写，并有断言 A25-1.6');
report(!sec23.text.some(l => l.includes('百万分比') && /`stand`|`frostKeep`/.test(l)), '10 stand、frostKeep 不再是逐日截断的百万分比');
const sec33 = sectionOf(/^### 3\.3 /, /^### 3\.4 /);
report(sec33.text.some(l => l.startsWith('| `cultivation.*`') && l.includes('只有一条写入路径')) && r1.includes('只有一个写者路径') && r1.includes('`next` 里没有任何损耗扣减'), '10 N1：记录现存量每种变动只有一条写入路径，next 不含损耗');
report(r1.includes('`weatherKg` 清零') && r1.includes('`frostKeep` 置回 1') && r1.includes('卷二十 §3.1 的日历入口') && partOf(2, 3).join('\n').includes('baseAreaM2'), '10 N2：多年生丰歉累计按年周期重新起算，年周期读卷二十日历入口');
const allRules = Array.from({length: N}, (_, i) => partOf(i + 1, 3).join('\n')).join('\n');
const aHits = allRules.split('\n').filter(l => /按[^。；，]{0,25}(比例|份额)[^。；，]{0,15}(分摊|同扣)/.test(l)).length;
report(aHits === 0, '10 A 类：规则里不再有按单次比例分摊、同扣的写法（25-1 至 25-3）', `命中 ${aHits}`);
report(partOf(2, 3).join('\n').includes('按顺序照累计量分摊') && r3.includes('按顺序照累计量分摊') && r1.includes('卷二 §3.3 第 3 条首句') && sec23.text.some(l => l.startsWith('| `cultivationSplit.')), '10 A 类：三处都引卷二 §3.3 第 3 条，配额与累计已做量有存储键');
report(!/floor\(/.test(allRules), '10 A 类：规则里没有自写的取整分摊式');
report(['S25-12', 'S25-13'].every(k => scan.text.some(l => l.startsWith('| ' + k + ' '))) && partOf(2, 3).join('\n').includes('S25-12') && partOf(4, 3).join('\n').includes('S25-13'), '10 后门：两条封闭声明各有加载期校验（S25-12、S25-13）并在规则里单点写明');
report(partOf(2, 6).join('\n').includes('S25-12') && partOf(4, 6).join('\n').includes('S25-13'), '10 后门：两条校验各有夹具断言');
report(!/(?<![A-Za-z])feeds(?![A-Za-z])/.test(mainText),'10 卷四第六版：正文不再出现 feeds');
report(mainText.includes('edibleShareOf') && /`primaryConsumer` 为真；这是卷四 §2\.4 的派生字段/.test(r3), '10 卷四第六版：可食引 edibleShareOf，primaryConsumer 注明派生');
report(sec21.text.some(l => l.startsWith('| `restartKg`') && l.includes('以卷四那一行为单点定义')), '10 restartKg 的含义单点归卷四，本卷只登记并引用');
const r9 = partOf(9, 3).join('\n'), r11 = partOf(11, 3).join('\n');
report(r9.includes('每千克干重的总能') && r11.includes('每千克干重的总能') && r5.includes('每千克干重的总能') && !mainText.includes('干基饱腹'), '10 satiety：饱腹值按干重总能、吸收率归卷四，三处规则对齐');
report(lines.some(l => /^\| Q17 /.test(l)),'10 开放问题含 Q17（两条校验的错误码登记）');

// 11 第四版：李白对第三版单核的裁定
const rev4At = lines.findIndex(l => l.startsWith('## 附 第四版修订记录'));
const rev4 = rev4At > 0 ? lines.slice(rev4At).join('\n') : '';
report(rev4At > impact3At && ['`cultivationSplit.*`', '`cutBaseKg`、`cutDoneKg`', '`baseAreaM2`', 'S25-12、S25-13', '`lostKg`'].every(k => rev4.includes(k)) && rev4.includes('必要理由'), '11 第四版修订记录逐条写明新增设计的必要理由');
const ex4 = partOf(4, 5).join('\n');
report(ex4.includes('施加本卷"地力培肥"容器行的一条长期实例') && !ex4.includes('（行由卷七或卷十五登记）'), '11 V3-2：§4.4.5 神迹实例与 S25-13 一致');
const P27 = k => { const t = partOf(k, 6).join('\n'); return t.includes('卷二 §2.7') && t.includes('`pathTypes`') && t.includes('E-PATH-UNDECLARED'); };
report([6, 7, 10].every(P27), '11 单通道二-3 后半：三处"无处可写"断言引卷二 §2.7 的 pathTypes 闭集判据');
report(![6, 7, 10].some(k => /S25-9 成立/.test(partOf(k, 6).join('\n'))), '11 三处断言不再以 S25-9 三模块白名单为判据');
report(scan.text.some(l => l.startsWith('| S25-5 ') && l.includes('毁因代号')) && lines.some(l => l.startsWith('| `clearCultivation`') && l.includes('毁因代号') && l.includes('不另设入口')), '11 V3-1：S25-5 第三入口接收毁因代号，不新增入口');
report(partOf(10, 3).join('\n').includes('M-12') && lines.some(l => l.startsWith('| 卷三 | 本卷读') && l.includes('M-12') && l.includes('读有效值') && l.includes('读修正前的值')), '11 基值与有效值读法：两处命中按卷三乙 M-12 写明');

// 统计
const sec8 = sectionOf(/^## §8 /, /^## 附 /);
const qCount = sec8.text.filter(l => /^\| Q\d+ /.test(l)).length;
out.push(`INFO  正文行数（不含自检附录） = ${lines.length}`);
out.push(`INFO  子系统数 = ${subsystems.length}；开放问题数 = ${qCount}`);
out.push(failed === 0 ? '结果：全部通过' : `结果：${failed} 项未通过`);
console.log(out.join('\n'));
process.exitCode = failed === 0 ? 0 : 1;
