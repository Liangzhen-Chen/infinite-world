// 卷五自检脚本：只读成稿文件，输出逐项结果。用法：node F:/dnd/docs/统一底层设计/脚本/卷五/check-卷五.mjs
import {readFileSync} from 'node:fs';

const FILE = 'F:/dnd/docs/统一底层设计/卷五-地点地形与资源场.md';
const all = readFileSync(FILE, 'utf8').split(/\r?\n/);
const cut = all.findIndex(l => l.startsWith('## 附录 自检脚本输出'));
const lines = cut < 0 ? all : all.slice(0, cut);
const out = [];
let failed = 0;
const report = (ok, name, detail = '') => { if (!ok) failed++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

// 节切分
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
const SUB = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
const subsystems = lines.filter(l => /^### 4\.\d+ /.test(l));
report(subsystems.length === 16, '2 子系统数', `= ${subsystems.length}`);
for (let n = 1; n <= 16; n++) {
  const sec = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## |---$)/);
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
}

// 5 具体 id 字面量（全文；允许表名与词表族名）
const ENTITY = ['item', 'mat', 'species', 'flora', 'body', 'npc', 'creature', 'loc', 'bld', 'fac', 'recipe', 'org', 'office', 'polity', 'law',
  'deity', 'faith', 'culture', 'profession', 'skill', 'lore', 'offense', 'status', 'etype', 'eff', 'mod'];
const ALLOW = new Set(['law_code', 'body_plan', 'status_family', 'status_target', 'body_part']);   // 表名与词表族名，不是实体 id
const idRe = new RegExp(`(?<![A-Za-z0-9_.])(?:${ENTITY.join('|')})_[a-z0-9_]+`, 'g');
const idHits = [];
lines.forEach((l, i) => { for (const m of l.match(idRe) ?? []) if (!ALLOW.has(m)) idHits.push(`${i + 1}:${m}`); });
report(idHits.length === 0, '5 具体实体 id 字面量', idHits.slice(0, 10).join(' '));

// 6 用于判断的描述性文本（规则里出现文字匹配写法、带中文或英文单词的比较）
const judgeRe = [/\.includes\(/, /\.startsWith\(/, /\.endsWith\(/, /\.test\(/, /\.match\(/, /===?\s*['"][^'"]+['"]/, /`\/[^`]*[\u4e00-\u9fff][^`]*\/[a-z]*`/];   // \u6b63\u5219\u5b57\u9762\u91cf\u53ea\u8ba4\u5199\u5728\u53cd\u5f15\u53f7\u91cc\u7684\uff08\u7ae0\u8282\u53f7\u91cc\u7684\u659c\u6760\u4e0d\u7b97\uff09
const sec7 = sectionOf(/^## §7 /, /^## §8 /);
const sec1 = sectionOf(/^## §1 /, /^## §2 /);
const inLegacy = i => (sec7 && i >= sec7.start && i < sec7.end) || (sec1 && i >= sec1.start && i < sec1.end);
const judgeHits = [];
lines.forEach((l, i) => { if (!inLegacy(i) && judgeRe.some(r => r.test(l))) judgeHits.push(i + 1); });
report(judgeHits.length === 0, '6 用于判断的描述性文本（§1、§7 引述旧代码除外）', judgeHits.slice(0, 10).join(' '));
// 具体地名、神名不得出现在正文
const NAMES = ['白石', '黑炉', '河湾'];
const nameHits = [];
lines.forEach((l, i) => { if (NAMES.some(n => l.includes(n))) nameHits.push(i + 1); });
report(nameHits.length === 0, '6 具体地区名', nameHits.join(' '));
// 规则表常数：规则小节里不得出现裸的小数系数
const constHits = [];
for (let n = 1; n <= 16; n++) {
  const sec = sectionOf(new RegExp(`^#### 4\\.${n}\\.3 `), /^#### /);
  // 锚点修订 11-14：同卷六，先遮掉 R/A/S/C/E 前缀的规则编号（如 R16-1.9），免得条号被当成系数
  if (sec) sec.text.forEach((l, i) => { if (/(?<![\w.§])\d+\.\d+(?![\w.])/.test(l.replace(/(?<![A-Za-z])[RASCE]\d+-\d+(\.\d+)+/g, '').replace(/§\d+(\.\d+)*/g, '').replace(/卷零 [AB] \d+\.\d+/g, '').replace(/4\.\d+(\.\d+)?/g, ''))) constHits.push(sec.start + i + 1); });
}
report(constHits.length === 0, '6 规则小节无裸系数', constHits.join(' '));

// 7 台账判给本卷的概念（台账五节卷五清单 + 2.5 卷五小节），逐条核对落在指定小节且写了规则
const LEDGER = [
  ['包含树与边结构', 1, ['parent', 'edges', 'rel_contains']],
  ['感知通道词表与感知判定', 2, ['sense', 'perceive', 'margin']],
  ['地形群落海拔', 3, ['terrain', 'biome', 'elevationM', 'envelope']],
  ['地质矿脉', 4, ['stratum', 'deposits', '赋存']],
  ['地下层', 5, ['skyExposure', 'depthM', 'enclosed', 'underground']],
  ['站点类型', 6, ['siteType', 'popRange', 'reclassifySite']],
  ['资源场、再生律、栖地容量', 7, ['resourceFields', 'comp_tract', 'openStocks', 'habitatCapacity', 'settleStocks', '规模由需求推出', '资源场类型由地区资源推出']],   // 二版：视图字段由 fields 改名 resourceFields
  ['取用律', 8, ['take', 'hmethod', 'NPC 同律', 'persistence']],
  ['发展度与控制度', 9, ['development', 'control', 'stepProgress']],
  ['地形修正', 10, ['speedFactor', 'terrainMix', '修正项']],
  ['法域槽的解析', 11, ['lawCode', 'lawSlots', 'nearest']],
  ['文化槽的解析', 12, ['culture', 'cultureMix', 'mode']],
  ['进入权', 13, ['canEnter', 'accessClass', 'grantsEntry']],
  ['行政层级词表与省郡骨架、邻省条款', 14, ['juris', 'regionLevel', 'borderTerms']],
  ['边境混居与迁徙表达', 15, ['frontierIndex', 'migrationPull']],
  ['环境状态读取', 16, ['env', '卷二十']],
];
for (const [name, n, keys] of LEDGER) {
  const sec = sectionOf(new RegExp(`^### 4\\.${n} `), /^(### 4\.\d+ |## |---$)/);
  const text = sec ? sec.text.join('\n') : '';
  const miss = keys.filter(k => !text.includes(k));
  const rules = sec ? sec.text.filter(l => /^\d+\. /.test(l)).length : 0;
  report(miss.length === 0 && rules >= 3, `7 台账概念：${name} → §4.${n}`, `规则条数 ${rules}${miss.length ? '，缺 ' + miss.join('、') : ''}`);
}
// 给别卷的入口名都在 §5 出现
const sec5 = sectionOf(/^## §5 /, /^## §6 /);
const s5 = sec5 ? sec5.text.join('\n') : '';
for (const fn of ['placeView', 'routeView', 'perceive', 'canEnter', 'take', 'settleStocks', 'stepProgress', 'setBorderTerm', 'openStocks', 'setAspect'])
  report(s5.includes(fn), `7 §5 给出入口名 ${fn}`);

// 9 第二版专项（一审 A、B 与主会话七条裁定的可机检部分）。卷末两张附表（记账栏、影响面表）是对旧写法的转述，不在扫描范围内。
const tailStart = lines.findIndex(l => l.startsWith('## 附 小项记账栏'));
const body = tailStart < 0 ? lines : lines.slice(0, tailStart);
const hitLines = (re, skip = () => false) => body.map((l, i) => (re.test(l) && !skip(l) ? i + 1 : 0)).filter(Boolean);
const zero = (name, re, skip) => { const h = hitLines(re, skip); report(h.length === 0, name, h.slice(0, 10).join(' ')); };
report(tailStart >= 0, '9 卷末有小项记账栏');
report(lines.some(l => l.startsWith('## 附 第二版影响面表')), '9 卷末有第二版影响面表');
zero('9 不写卷零行号（裁定 6）', /零 ?\d+(、\d+)* ?行/);
zero('9 读入口不入账：无"首次读取"（裁定 3）', /首次读取/);
zero('9 旧族名与旧键只出现在改名说明里（裁定 1）', /fieldState|(?<!resource-)field-types\.json|`field_`|dims\.fields|`fields`/, l => l.includes('改名'));
zero('9 本卷不重写环境规则（裁定 1）', /lingerDays|needsLine|passesAperture|geothermalGradient|lapseRate|climate\.json|placeView\(\)\.env(?![\w.])/);
zero('9 边上不再有 aperture（裁定 1）', /edges\.`aperture`/);
zero('9 资源场类型行不列举方法（A-12）', /`methods`/);
zero('9 条款不再借用 term 族（A-19）', /ref vocab term\b/);
const need = (name, secText, keys) => { const miss = keys.filter(k => !secText.includes(k)); report(miss.length === 0, name, miss.length ? '缺 ' + miss.join('、') : ''); };
const sec7b = sectionOf(/^## §7 /, /^## §8 /);
need('9 §7 迁移清单补项（裁定 5、6）', sec7b ? sec7b.text.join('\n') : '', ['extraction.mjs:239', 'extraction.mjs:237', 'household-subsistence.mjs', 'wildlife.mjs:133', 'ecology-dynamics.mjs', 'place-layout.mjs', '行为变更']);
const sec3 = sectionOf(/^## §3 /, /^## §4 /);
need('9 §3 扫描口径与写者（裁定 3、5）', sec3 ? sec3.text.join('\n') : '', ['作键', '实例数据表', 'openStocks', 'placeProgress', 'stockState', '纯读']);
const sec2 = sectionOf(/^## §2 /, /^## §3 /);
need('9 §2 登记（裁定 1、2、7）', sec2 ? sec2.text.join('\n') : '', ['改名登记', '`rfield`', 'comp_tract', 'comp_enclosure', '`enclosed`', '`underground`', '`aperture`', '`openness`', '视图派生字段']);
const sec47 = sectionOf(/^### 4\.7 /, /^### 4\.8 /);
need('9 §4.7 挂层、开户、双向比例（裁定 2、3、4）', sec47 ? sec47.text.join('\n') : '', ['stockSummary', '只读汇总', '繁殖群比例可升可降', '自然恢复', '迁入抬升', '当日开始时', 'stockAreaM2']);
const sec48 = sectionOf(/^### 4\.8 /, /^### 4\.9 /);
need('9 §4.8 意图槽与除零分支（A-11、B-09）', sec48 ? sec48.text.join('\n') : '', ['intent', 'partsAllowed', 'entitled', '直接置 0', 'struct:emission']);

// 10 第五版专项（李白对卷五、卷二十边界的裁定；边界清单 D-1 至 D-24、P-1；卷二十终核 F1、F2）
// 第二版在 §2 查过的 weatherCommonality 已按裁定移到卷二十的天气单元行，上面那条不再查它。
const bodyText = body.join('\n');
report(body.some(l => l.startsWith('**与卷二十的分工')), '10 卷首写明与卷二十的分工');
// 依据李白 11-14 20:22 根因 F 裁定：§2.1 须补列卷二十登记的 weatherCommonality，只放行"新增=他卷、出处=卷二十 §2.x"的那一行；本卷自有的写法仍判失败
const reDel10 = /`canopy`|`seasonDensity`|wetCurve|`saline`|rules\.thermal|回归年日数/;
const isWcOtherVolRow = l => /^\| `weatherCommonality`(（[^）|]*）)? \|.*\| 他卷 \|.*\| 卷二十 §2\.\d+ \|$/.test(l) && !reDel10.test(l);
zero('10 已删的字段与旧表名不再出现（D-1、D-5、D-7、D-8、D-9、D-18；weatherCommonality 只许作卷二十他卷行）', /`canopy`|`seasonDensity`|`weatherCommonality`|wetCurve|`saline`|rules\.thermal|回归年日数/, isWcOtherVolRow);
zero('10 不再替卷二十写"读哪个维度"（P-1、D-2、D-4）', /全书只在这里定一次|供卷二十算|卷二十读 `underground`|读 `enclosed`、`aperture`/);
zero('10 气候键不再"暂记"（D-22）', /暂记|以卷二十登记为准|本卷随改/);
report(body.filter(l => l.includes('卷二十 §5.4')).length >= 5 && (body.find(l => l.startsWith('| 卷二十 |')) ?? '').includes('卷二十 §5.4'), '10 接口只引用卷二十 §5.4（D-2）');
need('10 §2 水体字段、组件类分工、修正目标键（D-15、D-16、D-17）', sec2 ? sec2.text.join('\n') : '', ['| `liquid` |', '| `capacityL` |', '| `runoffCoef` |', '| `downstream` |', 'comp_waterbody', '本表列出 place 表的全部列，含他卷登记的与派生的', '本卷只列、不另定义', '| `stock.growthFactor` |', '| `stock.lossPerDay` |', '`growthResponse`']);
// 依据李白 11-14 20:22 根因 F 裁定：原要求的"本卷不登记、不代登记"按裁定删去，改为上面"列全部列、他卷行指回"一段；旧句回到 §2 判失败
report(!(sec2 ? sec2.text.join('\n') : '').includes('本卷不登记、不代登记'), '10 §2 不再写"本卷不登记、不代登记"（根因 F 改为列全部列）');
need('10 §3 源强参数、钩子登记、改写写者声明、水体账户例外（D-10、D-20、R2、D-16）', sec3 ? sec3.text.join('\n') : '', ['sourceLevel: number nullable', '`settleStocks`、`stepProgress`、`reclassifySite`', 'compareCulture', '改写写者', '建行写者', 'water-cycle.mjs']);
const sec42 = sectionOf(/^### 4\.2 /, /^### 4\.3 /);
need('10 §4.2 源强从哪里来、可及距离（D-10、D-11）', sec42 ? sec42.text.join('\n') : '', ['**源强从哪里来**', '**可及距离**', 'rangeDim', 'env.sightM', 'propagate(engine, state, channel, sourcePlace, 观察者所在地点, sourceLevel)']);
need('10 §4.7 再生律经 astroView 换算、季节读数值维度、两个修正键、水体是存量（F1、D-8、D-17、D-16）', sec47 ? sec47.text.join('\n') : '', ['astroView().perYearToPerStep', 'clock.season.growth', 'stock.growthFactor', 'stock.lossPerDay', '**水体的水也是存量**']);
need('10 §4.8 取水同律（D-16）', sec48 ? sec48.text.join('\n') : '', ['取水同律', '液体（水体的水）']);
need('10 §7 接收 localSightClear 与水体静态数据（D-11、D-16）', sec7b ? sec7b.text.join('\n') : '', ['localSightClear', 'water-cycle.mjs']);
report(all.some(l => l.startsWith('| 边界清单 D-1 至 D-24、P-1')), '10 影响面表有第五版一行');

// 11 第六版专项（审查/卷五卷二十-一审.md 的 V-1 至 V-5、V-10，V-8 中属本卷的一句）
const sec41 = sectionOf(/^### 4\.1 /, /^### 4\.2 /);
const t3 = sec3 ? sec3.text.join('\n') : '', t41 = sec41 ? sec41.text.join('\n') : '', t42 = sec42 ? sec42.text.join('\n') : '', t2 = sec2 ? sec2.text.join('\n') : '';
need('11 V-1 routeView 返回 edge 与 path；几何最短路的度量与并列取法在 §4.1 规则 5', t3 + t41, ['`edge`：', '`path`：', '**距离与几何最短路**', '并列取法', '不看需求块是否满足', '没有任何开口']);
report(t3.includes('margin: number nullable, rangeShortfallM: number nullable') && t42.includes('`margin` 为未知') && t42.includes('`rangeShortfallM`') && !bodyText.includes('记为"该值 − 距离"'), '11 V-2 够不着时 margin 为未知，另设 rangeShortfallM');
zero('11 V-3 water 族不再有饮用性字段', /`potable`|potable: boolean/);
need('11 V-4 水体行必须是存量单元（加载校验），井台与水是两行', t2 + t41, ['**水体行必须是存量单元**', '必须同时挂 `comp_tract`', '挂 `comp_waterbody` 的行都挂 `comp_tract`']);
need('11 V-5 取水随带转出污染物登记写者，S5-4 随之写明', t3, ['| 水体的溶解污染物账户', '随带转出']);
need('11 V-10 两个修正目标键的条件可读当前维度，口径引卷二十', t2, ['只在 `settleStocks` 当日结算的那一刻取修正后值', '卷二十 §2.0 推论 1']);
need('11 V-8 aspect 的改写写者带行范围', t3, ['行范围是全部 place 行']);
report(!bodyText.includes('季节的生长适宜度、按年计的率的换算') && !bodyText.includes('由卷二十登记，本卷不登记、不代登记'), '11 交互小节与组件类一段不再重列接口项（改引 §5.4 的编号）');
report(all.some(l => l.startsWith('| 新一轮一审 V-1 至 V-5、V-10')) && ['小项 2', '小项 5', '小项 7', '小项 8'].every(w => all.some(l => l.startsWith(`| 新一轮一审 ${w}`))), '11 影响面表有第六版一行，记账栏有新一轮小项四行');

// 12 第七版专项（李白对 审查/卷五卷二十-二审.md N-1 至 N-3 的三条裁定）
report(lines[0].includes('第十一版'), '12 标题为第十一版（第七版至第十版专项各条仍在下面逐条查）');
report(t41.includes('**两地的距离只有一种算法**') && t41.includes('距离 = 几何最短路的路程') && t41.includes('坐标 `coord` 不用来算两地的距离') && t3.includes('就是两地的距离（全书只有这一种）'), '12 裁定 1 距离只有一种算法，只在 §4.1 规则 5 定义');
zero('12 裁定 1 正文不再有直线距离，也不再有"不连通取坐标"的第二种算法', /直线距离|坐标直线|取坐标/);
report(t42.includes('再取来源地点到观察者所在地点的距离（§4.1 规则 5') && t42.includes('按同一个距离算') && /到最近的、在层级 L 上属于另一政区的站点的距离\)`，距离按 §4\.1 规则 5/.test(bodyText), '12 裁定 1 可及距离与边境指数都引 §4.1 规则 5 的距离，不另算');
report(t41.includes('从两个端点里 id 字典序较小的那一端写起') && t41.includes('去程和回程走同一条路径') && t41.includes('两端加通路类型唯一，即两端相同、通路类型也相同的边至多一条（加载校验）') && t41.includes('途经地点与边互为逆序') && !t41.includes('仍相同，取途经地点 id 序列字典序最小的。'), '12 裁定 2 并列取法与调用方向无关，去程回程同一条路径；边的唯一性有加载校验（第八版口径：两端加通路类型）');
report(t42.includes('**未知的通则**') && t42.includes('缺数据或无法计算') && t41.includes('**无法计算的量一律记为未知**') && !t42.includes('这一步跳过') && !t42.includes('`margin` 为未知当且仅当') && t42.includes('反方向不成立'), '12 裁定 3 缺数据或无法计算一律未知（通则），A5-2.2 不再写当且仅当');
report(all.some(l => l.startsWith('| 二审 N-1、N-2、N-3；李白三条裁定')) && all.some(l => l.startsWith('| 第七版作者自记 1 |')) && all.some(l => l.startsWith('第七版说明：')), '12 影响面表有第七版一行，记账栏有第七版自记，卷末有第七版说明');

// 13 第八版专项（李白对 审查/卷五卷二十-三规则单核.md R-1、R-2 的裁定）
const sec415 = sectionOf(/^### 4\.15 /, /^### 4\.16 /);
const t415 = sec415 ? sec415.text.join('\n') : '';
const sec8b = sectionOf(/^## §8 /, /^## 附 /);
const t8 = sec8b ? sec8b.text.join('\n') : '', t7 = sec7b ? sec7b.text.join('\n') : '';
const a152 = body.find(l => l.startsWith('- 【不变量】A5-15.2：')) ?? '', a12 = body.find(l => l.startsWith('- 【不变量】A5-1.2：')) ?? '';
report(t415.includes('`frontierIndex[L]` 记为未知，不填 0') && t415.includes('§4.1 规则 5 末项"无法计算的量一律记为未知"的同一条规矩，本节不另写') && t415.includes('不拿 0 或别的数顶替'), '13 R-1 边境指数无可达站点时记为未知，引 §4.1 规则 5 的同一条规矩，不另写');
zero('13 R-1 正文不再有"无可达站点取 0"与"不属于无法计算"的说法', /可达则为 0|不属于"无法计算"|`frontierIndex` 各项在 \[0,1\]/);
report(a152.includes('已知项在 [0,1]') && a152.includes('该项为未知，不是 0') && a152.includes('已知项之间'), '13 R-1 A5-15.2 只约束已知项，并有不连通站点为未知的用例');
zero('13 R-2 正文不再有"一对地点只许一条边"的旧口径', /同一对地点[^。；]{0,8}至多一条边|同一对地点[^。；]{0,8}只能[有建]一条边/);
report(t41.includes('通路类型就是边的 `waterway` 字段的取值') && t41.includes('不另设字段') && t41.includes('可以并存一条陆路的边和一条水路的边') && a12.includes('两端加通路类型唯一') && a12.includes('两端相同而通路类型不同的两条边能通过加载'), '13 R-2 边按两端加通路类型唯一：规则 4 与 A5-1.2 的加载校验同改，通路类型即 waterway');
report(t41.includes('比各条边的通路类型序列') && t41.includes('陆路排在水路之前') && t41.includes('地点序列与通路类型序列都相同就是同一条路径') && t41.includes('去程和回程走同一条路径') && a12.includes('陆路、水路两条边等长的用例'), '13 R-2 等长路径定序键加入通路类型，去程回程同一条路径不变');
report(t3.includes('每种通路类型一项') && body.some(l => l.startsWith('| 卷十七 | 对方读 |') && l.includes('每种通路类型一项')), '13 R-2 routeView 的 edge 每种通路类型一项（§3.1 与 §5 卷十七行）');
report(t7.includes('两条边都保留') && t7.includes('靠通路类型（`waterway`）区分') && t8.includes('加载校验"边按两端加通路类型唯一"') && t8.includes('两端与通路类型都相同的边多于一条'), '13 R-2 §7 迁移写明陆路水路两条边都保留；Q1 的校验与错误码说明同改');
report(body.some(l => l.startsWith('| 通路类型 |')), '13 R-2 术语表有通路类型一行');
report(all.some(l => l.startsWith('| 单核 R-1、R-2；李白裁定')) && all.some(l => l.startsWith('| 第八版作者自记 1 |')) && all.some(l => l.startsWith('第八版说明：')), '13 影响面表有第八版一行，记账栏有第八版自记，卷末有第八版说明');

// 14 第九版专项（李白对 审查/卷五卷二十-R1R2单核.md N-1、N-3 的裁定）
const sec47n = sectionOf(/^### 4\.7 /, /^### 4\.8 /), sec49n = sectionOf(/^### 4\.9 /, /^### 4\.10 /);
const t47 = sec47n ? sec47n.text.join('\n') : '', t49 = sec49n ? sec49n.text.join('\n') : '';
const rule4 = body.find(l => l.startsWith('4. **边是无向的结构事实**')) ?? '', rule2 = body.find(l => l.startsWith('2. **混居的生成表达**')) ?? '';
report(body.filter(l => l.includes('**平行边的通则**')).length === 1 && rule4.includes('相邻关系按一对地点只算一次') && rule4.includes('须在它自己那一条里写明取哪条通路的边') && rule4.includes('`openness` 最大的那条边') && rule4.includes('物资与存量的流动按地点对只算一次，不按边的条数重复计') && rule4.includes('按两端加通路类型定位这条边'), '14 N-1 平行边的通则只在 §4.1 规则 4 写一次：相邻按地点对算一次、读边属性须写明取法、扩散类取 openness 最大、流动不按边数重复计、指名的边按两端加通路类型定位');
report(t47.includes('对每一对有边相连、两端都是存量单元的地点') && t47.includes('流量按地点对只算一次') && t47.includes('不按通路类型各算一份') && !t47.includes('对一条两端都是存量单元的边') && !/各边流出合计|各边按同一比例|归哪条边/.test(t47), '14 N-1 存量扩散按地点对只算一次，不再逐边算流量（§4.7 规则 8 两句同改）');
report(t49.includes('相邻站点按地点对各算一次（§4.1 规则 4 的通则）'), '14 N-1 发展度扩散的相邻站点按地点对各算一次');
report(rule2.includes('某层级的 `frontierIndex[L]` 为未知时，该层级的邻方项不参加混合') && rule2.includes('`explain` 记"未取到"') && rule2.includes('本身仍是未知，不写 0') && t415.includes('读它的规则 2 按该条末句处理'), '14 N-3 规则 2 写全未知分支：邻方项不参加混合，explain 记未取到，指数本身仍是未知不写 0');
report(all.some(l => l.startsWith('| R1R2 单核 N-1、N-3；李白裁定')) && all.some(l => l.startsWith('| 第九版作者自记 1 |')) && all.some(l => l.startsWith('第九版说明：')), '14 影响面表有第九版一行，记账栏有第九版自记，卷末有第九版说明');

// 15 第十版专项（收卷前同批清零：同类定稿清单 5-1 至 5-5、行改挂牵连、扩展标度误差界、材料数值读法、在田作物的损耗口径、§5 漏收）
const sec413n = sectionOf(/^### 4\.13 /, /^### 4\.14 /), sec48n = sectionOf(/^### 4\.8 /, /^### 4\.9 /), sec5n = sectionOf(/^## §5 /, /^## §6 /);
const t413 = sec413n ? sec413n.text.join('\n') : '', t48 = sec48n ? sec48n.text.join('\n') : '', t5n = sec5n ? sec5n.text.join('\n') : '';
report(lines[2] === '起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档', '15 卷首有起草与审查的模型档位一行');
report(t47.includes('`stockMode: extScale`、`precision: 8`') && t47.includes('- **存法**（只引卷二 §3.3"存量与余数结转"第 6 条，本卷不另立口径）') && t47.includes('`ε日 = ⌈e_u ÷ 4 + B(u) + 2⌉`') && t47.includes('`ε取 = ⌈(2 × taken + 1) ÷ K + 1⌉`') && t47.includes('`E_n = G_n × E_{n−1} + ε日`') && t47.includes('累计误差清零重计'), '15 清单 5-1、5-2 persistence 用扩展标度存，误差量按语法树递推写成确定式（每日、取用、累计、清零）');
zero('15 清单 5-1、5-2 正文不再有百万分比的旧存法', /1 000 000|百万分比整数/);
report(t47.includes('**账户余额的存法**（卷二 §3.3"存量与余数结转"第 1、2 条）') && t8.includes('| Q15 | 账本账户的存法'), '15 清单 5-3 账户余额只存原值、整数转移，账本账户的存法请卷二写明（Q15）');
report(t49.includes('5. **存法与误差界**（只引卷二 §3.3"存量与余数结转"第 6 条，本卷不另立口径）') && t49.includes('`m发 = ⌈2 + devDiffusion × (各相邻站点 E 的平均 + 1)⌉`') && t49.includes('`E_n = (1 − controlRatePerDay) × E_{n−1} + 1`') && t49.includes('`E_n = controlDropOnTransfer × E_{n−1} + 1`') && t2.includes('| `development` | score | score | [0,100]；precision 8 |') && t2.includes('| `control` | score | score | [0,100]；precision 8 |'), '15 清单 5-4、5-5 发展度与控制度用扩展标度存，误差界写成确定式');
report(t47.includes('扩展标度的误差界（卷二 §3.3"存量与余数结转"第 6 条）') && t49.includes('扩展标度的误差界（卷二 §3.3"存量与余数结转"第 6 条）') && t48.includes('切片上的界'), '15 三处验收断言补误差界与切片上的界（A5-7.2、A5-8.2、A5-9.2）');
zero('15 误差界不再按截断次数写（旧口径）', /截断次数/);
// 下一条依据李白 11-14 20:59 通则 2（字段行上必写）：单项登记名单每行写显式 `viaRelocate: true/false`，七个位置量为 true
report(t3.includes('**单项登记名单**') && ['parent', 'coord', 'elevationM', 'terrain', 'slope', 'waterAccess', 'forestCover'].every(d => body.some(l => l.startsWith('| `created.*.props.' + d + '` |') && l.includes('`facilities.mjs`（`viaRelocate: true`）'))) && body.filter(l => l.includes('（`viaRelocate: true`）') && l.startsWith('| `created.')).length === 7 && body.filter(l => l.startsWith('| `created.')).every(l => /（`viaRelocate: (true|false)`）/.test(l)) && t3.includes('`withComponent: [comp_portable]`、`inside: [comp_portable]`'), '15 行改挂：七个位置量登记改写写者、行范围与 viaRelocate，全在单项登记名单');
report(t41.includes('1. **单根树**：不计离场行') && t41.includes('离场行不参加这两项校验') && t41.includes('**被改挂行的边**（只引卷二 §2.6"行改挂"第 3 点') && t41.includes('8. **离场行的读法**') && t41.includes('其余六个位置量按未知返回') && t413.includes('6. **离场行进不去**') && t413.includes('直接返回 `ok` 为假'), '15 行改挂：单根、坐标包含与面积和、边图、placeView、canEnter 各有离场行的口径');
report(a12.includes('`edges` 节里没有一端在离场子树内、另一端在子树外的边') && a12.includes('收起再展开到另一处之后，原先的落脚地与被改挂子树之间没有边，新边恰是那一笔 `placement.edges` 给出的那些（卷二 §2.6"跨界边"）'), '15 A5-1.2 两条跨界边断言：边节里没有跨出离场子树的边；展开到另一处后旧落脚地与被改挂子树之间没有边、新边恰是 placement.edges 给出的那些（卷二补5 单核 N3）');
report(body.some(l => l.startsWith('| `liquid` | ref material |') && l.includes('经卷三的 `materialView`，读到的是有效值')), '15 材料数值读法：liquid 行写明经 materialView 读有效值');
report(t47.includes('- **在田作物不适用这两个键**') && t47.includes('`clearCultivation`') && t47.includes('卷二十五 S25-5 的第三个调用点') && t47.includes('带毁因代号') && t47.includes('- **外部通路的口径**') && !bodyText.includes('除本条外没有任何外部通路能改存量') && !t47.includes('包括水体里的鱼和有耕作记录的单元上的在田作物'), '15 卷二十五复审 ①：两个键不适用于在田作物，毁田走 S25-5 第三个调用点并带毁因代号，外部通路按两类存量分写');
report(body.some(l => l.startsWith('| 卷二十五 | 双向 |') && l.includes('`clearCultivation` 请求')) && body.some(l => l.startsWith('| 卷八 | 双向 |') && l.includes('`polityView`')) && t5n.includes('行改挂'), '15 §5 收入 clearCultivation 请求（卷二十五行）、polityView 种类代号（卷八行）、行改挂（卷十九行）');
report(all.some(l => l.startsWith('| 收卷前同批清零（第十版')) && all.some(l => l.startsWith('| 第十版作者自记 1 |')) && all.some(l => l.startsWith('第十版说明：')) && all.some(l => l.startsWith('**此前两点已批的新增设计补记**') && l.includes('最通畅') && l.includes('两端加通路类型')), '15 影响面表有第十版一行，记账栏有第十版自记，卷末有第十版说明与两点已批新增设计的补记');

// 8 统计
const sec8 =sectionOf(/^## §8 /, /^## 附 /);
const openQ = sec8 ? sec8.text.filter(l => /^\| Q\d+ /.test(l)).length : 0;
out.push(`INFO  正文行数（不含本附录） = ${lines.length}`);
out.push(`INFO  子系统数 = ${subsystems.length}；开放问题数 = ${openQ}；验收断言数 = ${lines.filter(l => /^- 【/.test(l)).length}；扩展性测试数 = ${lines.filter(l => /^\| X5-\d+ /.test(l)).length}`);
out.push(failed === 0 ? 'RESULT  全部通过' : `RESULT  未通过 ${failed} 项`);
console.log(out.join('\n'));
process.exitCode = failed === 0 ? 0 : 1;
