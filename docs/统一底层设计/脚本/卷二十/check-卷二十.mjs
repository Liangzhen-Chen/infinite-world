// 卷二十自检脚本：node F:/dnd/docs/统一底层设计/脚本/卷二十/check-卷二十.mjs [--snapshot]
import fs from 'node:fs';

const SRC = 'F:/dnd/docs/统一底层设计/卷二十-时间日历天气与环境.md';
const SNAP = 'F:/dnd/docs/统一底层设计/版本快照/卷二十-v10.md';
const text = fs.readFileSync(SRC, 'utf8');
const all = text.split(/\r?\n/);
const cut = all.findIndex(l => l.startsWith('## 附录乙'));
const lines = cut < 0 ? all : all.slice(0, cut);
let fail = 0;
const out = [];
const check = (name, ok, detail = '') => { if (!ok) fail++; out.push(`${ok ? '通过' : '不通过'}  ${name}${detail ? '  ' + detail : ''}`); };

// 1 章节齐全
const h2 = lines.filter(l => l.startsWith('## ')).map(l => l.slice(3));
for (let i = 0; i <= 8; i++) check(`§${i} 存在`, h2.some(h => h.startsWith(`§${i} `)));
check('附 术语与代号表 存在', h2.some(h => h.startsWith('附 术语与代号表')));

// 分节
const sections = [];
let cur = null;
lines.forEach((l, i) => {
  const m2 = l.match(/^## (.+)/), m3 = l.match(/^### (4\.\d+) /), m4 = l.match(/^#### (4\.\d+)\.(\d) (.+)/);
  if (m2) cur = { top: m2[1], sub: null, part: null };
  else if (m3 && cur) cur = { top: cur.top, sub: m3[1], part: null };
  else if (m4 && cur) cur = { top: cur.top, sub: m4[1], part: m4[2], title: m4[3] };
  sections.push({ ...(cur ?? { top: '前言' }), line: i + 1, text: l });
});

// 2 子系统六小节
const subs = [...new Set(sections.filter(s => s.sub).map(s => s.sub))];
check('子系统数 = 11', subs.length === 11, `实际 ${subs.length}`);
const want = ['维度', '统一入口', '规则', '交互', '数据实例', '验收断言'];
for (const s of subs) {
  const titles = lines.filter(l => l.startsWith(`#### ${s}.`)).map(l => l.replace(/^#### 4\.\d+\.\d /, ''));
  const ok = want.every((w, i) => titles[i]?.startsWith(w)) && titles.length === 6;
  check(`${s} 六小节齐全`, ok, ok ? '' : titles.join('|'));
  const inst = sections.filter(x => x.sub === s && x.part === '5').map(x => x.text);
  const bullets = inst.filter(l => l.startsWith('- '));
  check(`${s} 数据实例 ≥ 3，含非西陲与非人类/超自然`, bullets.length >= 3 && bullets.some(l => l.includes('【非西陲】')) && bullets.some(l => l.includes('【非人类/超自然】')), `条数 ${bullets.length}`);
  const acc = sections.filter(x => x.sub === s && x.part === '6').map(x => x.text).join('\n');
  check(`${s} 验收三式齐全`, ['- 扫描式', '- 不变量式', '- 扩展性式'].every(k => acc.includes(k)));
}

// 3 具体 id 字面量（数据实例小节、§1 现状、§7 退役清单、§8 之外不得出现）
const prefixes = ['item', 'mat', 'species', 'flora', 'npc', 'creature', 'loc', 'bld', 'fac', 'recipe', 'org', 'office', 'polity', 'law', 'deity', 'faith', 'culture', 'profession', 'skill', 'lore', 'offense', 'status', 'etype', 'eff', 'mod', 'wx', 'phen', 'field', 'cal', 'season', 'pace', 'prov', 'county'];
const allow = new Set(['event_type', 'season_scheme', 'pace_level', 'pace_class', 'cal_source', 'facility_type', 'body_plan', 'law_code', 'status_family', 'status_target', 'faith_layer', 'eff_output']);
const idRe = new RegExp(`(?<![A-Za-z0-9_.])(?:${prefixes.join('|')})_[a-z0-9_]+`, 'g');
const idHits = [];
for (const s of sections) {
  if (s.part === '5' || /^§[178] /.test(s.top) || s.top.startsWith('前言')) continue;
  for (const m of s.text.match(idRe) ?? []) if (!allow.has(m)) idHits.push(`L${s.line}:${m}`);
}
check('规则与入口正文无具体 id 字面量', idHits.length === 0, idHits.slice(0, 10).join(' '));

// 4 用于判断的描述性文本
const txtRe = [/===?\s*['"][^'"]*[\u4e00-\u9fff]/, /\/[^\/\s]*[\u4e00-\u9fff][^\/\s]*\/\.test/, /\.includes\(\s*['"]/, /\.startsWith\(\s*['"]/, /\.match\(\s*\//, /===?\s*'[a-z ]+ [a-z ]+'/];
const txtHits = [];
for (const s of sections) {
  if (/^§[17] /.test(s.top)) continue;
  if (txtRe.some(r => r.test(s.text))) txtHits.push(`L${s.line}`);
}
check('正文无用于判断的中英文描述性文本', txtHits.length === 0, txtHits.join(' '));

// 5 台账判给本卷的概念（第五节清单）各有落点
const ledger = [['调度器', '4.1'], ['到期语义', '4.1'], ['历法', '4.2'], ['周期日', '4.2'], ['天气状态', '4.3'], ['季节词表', '4.4'], ['温度', '4.5'], ['热交换', '4.5'], ['水循环', '4.6'], ['环境场', '4.7'], ['光', '4.8'], ['声', '4.8'], ['气味', '4.8'], ['灾异', '4.9'], ['世界节奏', '4.10']];
for (const [word, sub] of ledger) {
  const body = sections.filter(x => x.sub === sub).map(x => x.text).join('\n');
  const rules = sections.filter(x => x.sub === sub && x.part === '3').length;
  check(`台账概念「${word}」在 ${sub} 写全`, body.includes(word) && rules >= 4, `规则小节 ${rules} 行`);
}
// 弱检查：§2–§4 不出现别卷概念的字段名（感官阈值、清醒阈值、舒适区、事件注册表）；是否复述定义仍须人工审
const foreign = sections.filter(s => /^§[234] /.test(s.top) && /(senseThreshold|awakeMin|comfortBand|comfortMin|eventRegistry|lawBinding)/.test(s.text)).map(s => `L${s.line}`);
check('§2–§4 未出现别卷概念的字段名（弱检查，仍须人工审）', foreign.length === 0, foreign.join(' '));

// 6 正文算例复核
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
check('算例 历法闰周期 6929 日 235 月', 19 * 354 + 7 * 29 === 6929 && 12 * 19 + 7 === 235 && near(6929 / 19, 364.68));
check('算例 纯朔望历年漂移 10.68 日', near(6929 / 19 - 354, 10.68));
check('算例 到期 3 日 = 4320 分', 3 * 1440 === 4320 && 4320 / 2 === 2160);
check('算例 室内稳态 15 度', -5 + 3000 / 150 === 15);
check('算例 海拔修正 -13 度', near(-0.0065 * 2000, -13) && near(12 - 13, -1));
check('算例 水塘期末 370000 升', 20 * 10000 * 0.4 === 80000 && 3 * 2000 === 6000 && 300000 + 80000 - 6000 - 4000 === 370000);
check('算例 场衰减 33.75', 80 * 0.75 ** 3 === 33.75);
check('算例 照度 19.89', near(1000 / (4 * Math.PI * 4), 19.89));
check('算例 声 50 分贝', 90 - 20 * Math.log10(100) === 50);
const rad = d => d * Math.PI / 180;
const dayMin = (lat, decl) => { const c = -Math.tan(rad(lat)) * Math.tan(rad(decl)); return c >= 1 ? 0 : c <= -1 ? 1440 : 2 * Math.acos(c) / (2 * Math.PI) * 1440; };
check('算例 日照：纬度 70 冬至 0 分、纬度 35 冬至约 579 分、分点 720 分', dayMin(70, -23.44) === 0 && near(dayMin(35, -23.44), 579, 1) && near(dayMin(35, 0), 720, 0.001), `35 度冬至 ${dayMin(35, -23.44).toFixed(1)}`);
check('算例 积温 25', [12, 15, 9, 18, 20].reduce((s, t) => s + Math.max(0, t - 10), 0) === 25);

// 7 第二版新增：一审裁定项复核
const body = lines.join('\n');
const sinT = x => Math.sin(2 * Math.PI * x), lag = 1 / 12;
check('算例 季节项：最冷在相位 5/6（冬至后 1/12 年）、最暖在 1/3', near(sinT(5 / 6 - lag), -1, 1e-9) && near(sinT(1 / 3 - lag), 1, 1e-9) && near(3 / 4 + lag, 5 / 6, 1e-12));
let coldest = 0, coldestV = 9;
for (let i = 0; i < 1200; i++) { const v = sinT(i / 1200 - lag); if (v < coldestV) { coldestV = v; coldest = i / 1200; } }
check('算例 季节项：数值扫描的最冷相位 = 5/6', near(coldest, 5 / 6, 0.001), `扫描得 ${coldest.toFixed(4)}`);
check('算例 季节项：春分 −0.5、秋分 +0.5、冬至 −0.866 倍半幅', near(sinT(0 - lag), -0.5, 1e-9) && near(sinT(0.5 - lag), 0.5, 1e-9) && near(sinT(0.75 - lag), -0.866, 0.001));
check('算例 隘口冬至 −9.66 度、最冷 −11 度', near(-1 + 10 * sinT(0.75 - lag), -9.66, 0.01) && near(-1 + 10 * sinT(5 / 6 - lag), -11, 1e-9));
check('算例 不置闰历法年长 360 日', 12 * 30 === 360);
const retired = ['存档单调' + '序号', '单调' + '序号', '固定' + '位次', 'draw' + 'Slots', 'enqueued' + 'Seq', 'verb_weather' + '_changed', 'lapse' + 'CPerM', 'fuel' + 'Dim'];
const retiredHits = retired.map((w, i) => all.join('\n').includes(w) ? `#${i + 1}` : null).filter(Boolean);
check(`全文（含附录）不再出现 ${retired.length} 个退役用语（清单在脚本内，含序号类抽签键用语）`, retiredHits.length === 0, retiredHits.join(' '));
check('抽取键五段格式写入正文', body.includes('(worldSeed, streamCode, subjectId, worldTime, drawSiteCode)'));
const s7 = sections.filter(s => s.top.startsWith('§7 ')).map(s => s.text);
const iA = s7.findIndex(l => l.startsWith('**甲')), iB = s7.findIndex(l => l.startsWith('**乙'));
// 锚点修订 11-14：C11-5 按卷十一 R11-2.2 把编号放到第一列，允许文件列前多一列 `| M20-n |`
const rowsA = s7.slice(iA, iB).filter(l => /^\| (?:M20-\d+ \| )?`[a-z-]+\.mjs` \|/.test(l));
check('§7.2 甲表列出 32 个文件', rowsA.length === 32 && new Set(rowsA.map(l => l.split('`')[1])).size === 32, `实际 ${rowsA.length}`);
const rowB = s7[iB] ?? '';
check('§7.2 乙列出 7 个文件', (rowB.match(/`[a-z-]+\.mjs`/g) ?? []).length === 7, `实际 ${(rowB.match(/`[a-z-]+\.mjs`/g) ?? []).length}`);
for (const w of ['scheduler.mjs:46', 'character.mjs:29', 'world/meta/rules.json', 'localSightClear', 'derived.mjs:247', 'config_set']) check(`§7 列入 ${w}`, s7.some(l => l.includes(w)));
check('T-3 写成"除日历模块外，禁止对时间值做年月日算术"', body.includes('除日历模块外，禁止对时间值做年月日算术'));
check('附录丙 记账栏、附录丁 影响面表 存在', all.some(l => l.startsWith('## 附录丙')) && all.some(l => l.startsWith('## 附录丁')));

// 8 第三版新增：二审 N1–N4、年长裁决、环境键表、洞穴口径、光照算法
const allText = all.join('\n');
const lineOf = p => lines.find(l => l.startsWith(p)) ?? '';
const s20 = sections.filter(s => s.top.startsWith('§2 ')).map(s => s.text);
const i20 = s20.findIndex(l => l.startsWith('### 2.0 ')), i21 = s20.findIndex(l => l.startsWith('### 2.1 '));
const def = s20.slice(i20, i21);
check('第三版 §2.0 存在，四类各有一行定义', i20 >= 0 && ['静态维度', '可变存储值', '纯函数量', '修正项'].every(w => def.filter(l => l.startsWith(`| ${w} |`)).length === 1));
check('第三版 四类的定义行只在 §2.0（别处无同名表行）', ['静态维度', '可变存储值', '纯函数量', '修正项'].every(w => lines.filter(l => l.startsWith(`| ${w} |`)).length === 1));
check('第三版 N1 旧口径已清（修正项不再写成纯函数的参数；粒度不再自带纯函数定义）', !body.includes('分钟、表、修正项）的纯函数') && !body.includes('日序）的纯函数，一日之内不变'));
check('第三版 N2 旧口径已清（静态不再写成"存储值或只由存储值派生"）', !body.includes('即存储值或只由存储值派生的值') && !lineOf('| `weather.weightRX`').includes('、森林覆盖率；') && lineOf('| `phenomenon.whenRX`').includes('E-WX-WEIGHT-CYCLE'));
check('第三版 N3 热源依赖四条，含卷三燃烧', body.includes('四条声明过的状态路径') && !body.includes('三条声明过的状态路径') && body.includes('燃烧中物品的放热状态'));
check('第三版 N4 T-3 豁免四个文件，含周期日求值器', body.includes('豁免文件只有四个') && lineOf('| T-3 |').includes('周期日求值器'));
const q1 = lines.find(l => l.startsWith('1. **年长**')) ?? '';
check('第三版 §8 问题 1 已回填裁定', q1.includes('已裁定') && q1.includes('不是全局常数') && !q1.includes('请李白定'));
check('第三版 §4.2.5 已回填裁定', lines.some(l => l.includes('年长是每一行自己的数据值，不是全局常数')) && !body.includes('取决于 §8 问题 1 定的回归年长度'));
check('算例 闰年 383 日', 354 + 29 === 383 && 12 * 354 + 7 * 383 === 6929);
check('第三版 §2.7 并入两个气候键，定义方卷二十', ['| `env.climateTempC` |', '| `env.climatePrecipMm` |'].every(p => lineOf(p).includes('定义方卷二十')));
check('第三版 卷五的年均温维度不再被引用', !body.includes('`annualMeanTempC`（卷五') && !body.includes('海拔修正只在卷五'));
check('第三版 地下基准温度只在一处定义', lines.filter(l => l.includes('**地下基准温度**')).length === 1 && body.includes('`underground` 为真取第 2 条的地下基准温度'));
check('算例 地火洞穴 8.9 度', near(8 + 0.03 * 30, 8.9, 1e-9));
check('第三版 洞穴不再写成围护', !body.includes('洞穴是 `skyExposure` 近于零的围护') && !body.includes('洞穴石壁的 `soundLossDb` 再扣') && !body.includes('edgeOpenness`'));
check('第三版 光照算法三项只在一处定义', lines.filter(l => l.includes('env.lux = 露天项 + 开口采光项 + 人工光源项')).length === 1 && body.includes('apertureDaylightCurve'));
check('第三版 附录丁有本轮各行', ['二审 N1、N2', '二审 N3', '二审 N4', '§8 问题 1 裁决', '环境键表只在 §2.7', '洞穴口径', '光照统一由本卷算'].every(w => allText.includes(`| 第三版：${w}`)));

// 9 第四版新增：边界裁定（P-1、接口一张表）与终核 R1–R8
const h3 = lines.filter(l => l.startsWith('### '));
check('第四版 §5.4 两卷接口表存在且只有一节', h3.filter(l => l.startsWith('### 5.4 ')).length === 1 && lineOf('### 5.4 ').includes('全书唯一'));
check('第四版 P-1 分工不再指向卷五（无"卷五 §4.5 规则 3"）', !body.includes('卷五 §4.5 规则 3') && body.includes('**分支规则**'));
const s453 = sections.filter(x => x.sub === '4.5' && x.part === '3').map(x => x.text);
check('第四版 分支规则四行，§4.5.3 仍是 6 条', s453.filter(l => /^\| (真|假) \| (真|假) \|/.test(l)).length === 4 && s453.filter(l => /^\d+\. /.test(l)).length === 6);
check('第四版 R1 修正项分两种，有常态值一栏', def.some(l => l.includes('**数据行修正项**') && l.includes('**运行态修正项**')) && def.some(l => l.includes('常态值 = 基值叠加数据行修正项')) && lineOf('| `phenomenon.whenRX`').includes('常态值'));
check('第四版 R2 静态按行判，分建行写者与改写写者', lineOf('| 静态维度 |').includes('改写写者') && lineOf('| 静态维度 |').includes('建行写者') && !lineOf('| 可变存储值 |').includes('森林覆盖率'));
check('第四版 R3 combustionFed 一行；地点热源功率只定义一处', lines.filter(l => l.startsWith('| `combustionFed` |')).length === 1 && lines.filter(l => l.includes('**地点热源功率**')).length === 1 && !body.includes('不靠燃烧维持的场') && !body.includes('各场热功率合计'));
check('第四版 体感式不再把露天比例乘两次', !body.includes('radiantSunCurve(env.lux × skyExposure)') && body.includes('radiantSunCurve(照度的露天项)'));
check('第四版 R4 开口采光加地下条件，外侧地点按包含树', body.includes('只对 `enclosed` 为真且 `underground` 为假的地点计') && !body.includes('此项自然为 0') && !body.includes('它开向的外侧地点'));
check('第四版 R5 声过边曲线在 openness 为 1 时为 0；跨越围护只扣隔声量', body.includes('x 为 1 时 y 为 0（加载校验）') && body.includes('跨越围护的那一步只扣 `soundLossDb`') && body.includes('routeView(fromPlace, toPlace)'));
check('第四版 R6 照度纯函数的条件改为人工光源项为零', !body.includes('室外无场时 minute') && !body.includes('⑤ 室外无场的地点') && lineOf('| `env.lux` / `env.sightM` |').includes('人工光源项为零'));
check('第四版 R7 rx 变量域有 calendar.weekDays', sections.filter(s => s.top.startsWith('§2 ')).some(s => s.text.includes('`calendar.weekDays`')));
check('第四版 R8 不变量 ⑥ 改为比较常年气温', body.includes('`env.climateTempC` 之差恒等于') && !body.includes('两个露天地点的室外基值之差恒等于'));
check('第四版 天气频度在单元行，不在群落行', lines.filter(l => l.startsWith('| `comp_weather_cell` | `weatherCommonality` |')).length === 1 && lines.filter(l => l.startsWith('| `comp_weather_cell` | `aspectBase` |')).length === 1 && !body.includes('群落行的 `weatherCommonality`') && !body.includes('单元群落行'));
check('第四版 水体地物字段不在本卷组件表；取水只经卷五 take', !lines.some(l => l.startsWith('| `comp_waterbody` |')) && body.includes('把水取走的唯一通道是卷五的 `take`'));
const allowed = lines.find(l => l.startsWith('- `env.{allowedTargets}`')) ?? '';
check('第四版 白名单列入存量的两个修正目标键，去掉作物生长系数', allowed.includes('`stock.growthFactor`') && allowed.includes('`stock.lossPerDay`') && allowed.includes('作物生长系数不列入') && !body.includes('作物生长系数、路段通行') && !body.includes('给作物生长系数加负修正'));
check('第四版 取用方法行可挂 emits；propagate 的 sourceLevel 可空', lineOf('| `struct:emission` |').includes('hmethod') && body.includes('`sourceLevel`（单位随通道）可空'));
check('第四版 卷五不登记环境键（不再写"只登记表头"）', !body.includes('只登记表头') && body.includes('不登记、只引用'));
check('第四版 §8 与卷五的对齐项已清（无"请卷五回填"）', !body.includes('请卷五回填') && !body.includes('需卷五确认') && !body.includes('请与卷五作者对齐'));
check('第四版 附录丁有本轮各行', ['边界裁定 P-1', '接口只留一张表', 'D-5、D-6、D-14', 'D-13、R2', 'R1（', 'R3（', 'R4（', 'R5（', 'R6、R7、R8', 'D-10、D-11、D-23', 'D-15、D-16、D-21、D-22', 'D-17（'].every(w => allText.includes(`| 第四版：${w}`)));

// 10 第五版新增：审查/卷五卷二十-一审.md 的 V-1、V-4 至 V-10（V-2、V-3 的改动全在卷五）
const s483 = sections.filter(x => x.sub === '4.8' && x.part === '3').map(x => x.text).join('\n');
check('第五版 V-1 路径读卷五的几何最短路，并列取法不在本卷（点光的距离见第六版裁定 1）', s483.includes('`path`，即几何最短路') && s483.includes('定义只在卷五 §4.1 规则 5') && !body.includes('并列时的取法归卷五') && lineOf('| 甲 3 |').includes('几何最短路'));
check('第五版 V-4、V-5 水体必有账户；污染物随带转出在写者表登记', body.includes('每个水体行都是存量单元，由卷五的加载校验保证') && lineOf('| 水体的液体、冰、污染物账户 |').includes('污染物账户另有一笔') && lineOf('| 甲 12 |').includes('随带转出'));
check('第五版 V-6 辐射热项三支同一式，不再有"围护一支取 0"', s453.some(l => l.includes('辐射热项 = max(0, radiantFieldCurve(地点热源功率) − 已计入气温的热源升温)')) && !body.includes('辐射热项：围护一支取 0') && !body.includes('辐射热项恒为 0') && body.includes('四面墙塌光的屋里烤火不比屋外烤火冷'));
check('第五版 V-7 到达量取沿路与直穿中大的一个；删边致不连通不会更响（第六版起不连通为未知）', s483.includes('到达量 = max(沿路到达量, 直穿到达量)') && s483.includes('rules.sound.solidLossDb') && !body.includes('只计距离项，不扣围护与边') && lines.some(l => l.startsWith('- `sound.{') && l.includes('solidLossDb')) && body.includes('删去一条边致使两地不再连通，到达量变为未知，不出现比删边前更大的数'));
check('第五版 V-8 推论 5 给出行范围的三种处置；粒度栏注明只对范围之外的行成立', def.some(l => l.startsWith('5. **行范围的执行办法**')) && def.filter(l => /^   - (并集为空|并集是全部行|其余（)/.test(l)).length === 3 && lineOf('| `env.climateTempC` |').includes('可变行范围之外') && body.includes('**本栏的标注只对"可变行范围"之外的行成立**') && !body.includes('其基值任意分钟可求'));
check('第五版 V-9 推论 4 分栏规则；递推输入不接受数据行修正项', def.some(l => l.startsWith('4. **分栏规则')) && def.some(l => l.includes('**递推输入不接受数据行修正项**') && l.includes('foldsOverDays')) && lineOf('| T-6 |').includes('递推输入') && !body.includes('再叠加以 `env.tempC` 为 target 的数据行修正项得常态值') && !body.includes('即含季节行、天气行、现象行的数据行修正项；再加'));
check('第五版 V-10 白名单每项带 forecast；只在结算时读的目标条件可读当前维度', allowed.includes('{namespace, forecast: boolean}') && def.some(l => l.includes('**上一句的约束只管"可预报目标"**')) && lineOf('| 甲 13 |').includes('`forecast` 为假'));
check('第五版 §2.0 写明五条推论，条号 1 至 5 各一条', def.some(l => l.startsWith('五条推论')) && [1, 2, 3, 4, 5].every(n => def.filter(l => l.startsWith(`${n}. **`)).length === 1));
check('第五版 接口项不在 §5.4 之外重列（组件类分工、几何量、水体地物改引编号）', !body.includes('类本身与必有字段 `aperture` 是几何，由卷五登记') && !body.includes('地点的几何量（围合、地下、深度、露天比例') && !body.includes('水体的静态地物（装什么液体、容量'));
check('第五版 附录丁有本轮各行与牵连清单', ['V-1（', 'V-4、V-5（', 'V-6（', 'V-7（', 'V-8（', 'V-9（', 'V-10（', '接口唯一脚本收紧'].every(w => allText.includes(`| 第五版：${w}`)) && allText.includes('**第五版牵连清单**'));
check('第五版 附录丙记入新一轮小项与作者自记', ['小项 1', '小项 2', '小项 3', '小项 4', '小项 6'].every(w => allText.includes(`| 新一轮一审 ${w}`)) && allText.includes('| 第五版作者自记 1 |'));

// 11 第六版新增：李白对 审查/卷五卷二十-二审.md N-1 至 N-3 的三条裁定
const s482 = sections.filter(x => x.sub === '4.8' && x.part === '2').map(x => x.text).join('\n');
const s486 = sections.filter(x => x.sub === '4.8' && x.part === '6').map(x => x.text).join('\n');
check('第六版 标题已改为第十版（第六版至第九版专项各条仍在下面逐条查）', lines[0].includes('第十版'));
check('第六版 裁定 1 光与声的距离都读卷五 §4.1 规则 5 的距离，本卷不另算', s483.includes('就是卷五 §4.1 规则 5 定义的两地的距离') && s483.includes('判"够不够得着"用的是同一个量') && s483.includes('两条走法用同一个距离') && s483.includes('log10(距离 ÷ refDistanceM)') && !s483.includes('路程') && lineOf('| 甲 2 |').includes('本卷不用坐标算两地的距离') && lineOf('| 甲 3 |').includes('两地的距离'));
check('第六版 裁定 1 正文不再有直线距离', !/直线距离|坐标直线|光走直线/.test(body));
check('第六版 裁定 2 去程回程同一条路径（定序只在卷五），本卷有对称的不变量', s483.includes('去程与回程是同一条路径') && s486.includes('`propagate(a, b)` 与 `propagate(b, a)`') && !/字典序/.test(s483));
check('第六版 裁定 3 propagate 返回未知是一条通则；两地不连通到达量为未知', s482.includes('**返回未知的通则**') && s482.includes('缺数据或无法计算') && s483.includes('到达量为未知') && s486.includes('两地不连通时，光与声的到达量都是未知') && !body.includes('任何两地都有直穿到达量') && !body.includes('只取直穿到达量'));
check('第六版 附录丁有本轮三行、牵连清单与说明；附录丙有第六版自记', ['裁定 1（', '裁定 2（', '裁定 3（'].every(w => allText.includes(`| 第六版：${w}`)) && allText.includes('**第六版牵连清单**') && all.some(l => l.startsWith('第六版说明：')) && allText.includes('| 第六版作者自记 1 |'));

// 12 第七版新增：李白对 审查/卷五卷二十-三规则单核.md R-1、R-2 的裁定，与"透过实墙的声光"开放问题
const s8 = sections.filter(s => s.top.startsWith('§8 ')).map(s => s.text);
const q15 = s8.find(l => l.startsWith('15. **透过实墙的声光传播**')) ?? '';
check('第七版 §8 第 15 条：透过实墙的声光传播待专门设计，本卷不含，不加规则（第八版措辞）', q15.includes('按墙体材料定透声透光量') && q15.includes('待以后声光传播专门设计，本卷不含') && q15.includes('不加任何规则') && s8.filter(l => /^15\. \*\*/.test(l)).length === 1);
check('第七版 距离与"无路相通为未知"保持第六版现状（正文没有墙体透声透光的新规则）', s483.includes('两地不连通时没有距离，两条走法都无法计算，到达量为未知') && !/墙体材料|透声透光/.test(lines.filter((l, i) => !sections[i].top.startsWith('§8 ')).join('\n')));
check('第七版 R-2 全文（含附录丁的牵连清单）不再有"一对地点只许一条边"的旧口径', !/同一对地点[^。；|]{0,8}(至多一条边|只能[有建]一条边)/.test(allText));
check('第七版 R-2 本卷不另写边的唯一性与定序（只在卷五）', !/两端加通路类型唯一[，,]即|通路类型序列/.test(body) && s483.includes('去程与回程是同一条路径'));
check('第七版 附录丁有本轮三行、第七版牵连清单与说明', ['单核 R-1（', '单核 R-2（', '透过实墙的声光（'].every(w => allText.includes(`| 第七版：${w}`)) && allText.includes('**第七版牵连清单**') && all.some(l => l.startsWith('第七版说明：')));

// 13 第八版新增：李白对 审查/卷五卷二十-R1R2单核.md N-1 至 N-3 的裁定
const s473 = sections.filter(x => x.sub === '4.7' && x.part === '3').map(x => x.text).join('\n');
check('第八版 N-1 场蔓延：一对相邻地点只算一个目标，读 openness 最大的那条边，通则引卷五 §4.1 规则 4', s473.includes('一对相邻地点只算一个目标') && s473.includes('读的是其中 `openness` 最大的那一条（通则在卷五 §4.1 规则 4，本卷不另定）') && !s473.includes('所经那条边'));
check('第八版 N-1 声音沿路过边同样取最大的 openness，距离仍取路径的', s483.includes('这一步的 `openness` 取其中最大的那一条（通则在卷五 §4.1 规则 4）') && s483.includes('距离仍是路径的 `distanceM`'));
check('第八版 N-1 平行边的通则不在本卷另写（只在卷五）', !/平行边的通则|按地点对只算一次/.test(body));
check('第八版 N-2 §8 第 15 条与直穿项对齐：两地无路相通时透过实体的传播与按墙体材料定量待设计，现直穿项只用 solidLossDb', q15.includes('两地无路相通时透过实体的声光传播，以及按墙体材料定透声透光量（现直穿项只用全局常数 `solidLossDb`），待以后声光传播专门设计，本卷不含') && !q15.includes('透过实墙的声光传播待按墙体材料透声透光专门设计') && s483.includes('rules.sound.solidLossDb'));
check('第八版 N-3 牵连清单卷十一行改为照卷五规则 2 执行；卷八一行保留', all.some(l => l.startsWith('| 卷十 |') && l.includes('照卷五规则 2 执行')) && all.some(l => l.startsWith('| 卷八 |') && l.includes('migrationPull.frontier')) && !all.some(l => l.startsWith('| 卷十、卷八 |')));
check('第八版 附录丁有本轮三行、第八版牵连清单（含卷十九一行）与说明', ['N-1（', 'N-2（', 'N-3（'].every(w => allText.includes(`| 第八版：R1R2 单核 ${w}`)) && allText.includes('**第八版牵连清单**') && all.some(l => l.startsWith('| 卷十九 | 以某一条边为对象的规则') && l.includes('两端加通路类型')) && all.some(l => l.startsWith('第八版说明：')));

// 14 第九版新增：收卷前同批清零（同类定稿清单 20-1、20-2、行改挂牵连、扩展标度误差界、材料数值读法、毁田的通路、§5 漏收的事件）
const s476 = sections.filter(x => x.sub === '4.7' && x.part === '6').map(x => x.text).join('\n');
const s4102 = sections.filter(x => x.sub === '4.10' && x.part === '2').map(x => x.text).join('\n');
const q7 = s8.find(l => l.startsWith('7. **水体存量用账本账户**')) ?? '';
check('第九版 卷首有起草与审查的模型档位一行', lines[2] === '起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档');
check('第九版 清单 20-1 分配取整的余数不再待卷六定，引卷二 §3.3 第 3 条（末份取差；分次领取按顺序照累计量分摊）', q7.includes('已关闭（同类定稿清单 20-1）') && q7.includes('拆分末份取差') && q7.includes('按顺序照累计量分摊') && !/多笔分配取整后的余数归哪个账户。$/.test(q7));
check('第九版 清单 20-2 场实例存锚点 struct:stockAnchor，stockMode: anchor，value 在 10⁸ 标度写入；不再用 fieldInstance 作存储类型', lineOf('| `fields.*.*` |').includes('`struct:stockAnchor{value, at}`') && lineOf('| `fields.*.*` |').includes('`stockMode: anchor`') && lineOf('| `fields.*.*` |').includes('`precision: 8`') && s473.includes('- **纯衰减段不写**') && s473.includes('`读数(j) = value × fixedPow(d, j)`'));
check('第九版 清单 20-2 蔓延分配按拆分末份取差，各目标之和与蔓延出逐位相等', s473.includes('按卷二 §3.3"存量与余数结转"第 3 条的"拆分末份取差"') && s473.includes('不各份独立截断') && s476.includes('各目标分到的量之和与蔓延出逐位相等'));
check('第九版 扩展标度误差界按新口径（误差量按语法树递推）写成确定式：闭式读数、压制、蔓延出、蔓延入、一次写入与累计', s473.includes('- **误差量**（卷二同条"m 的口径"') && s473.includes('`e读(j) = E_a × D_j + B(value) × p_j + 1`') && s473.includes('`e压 = quenchPerMm + 1`') && s473.includes('`e出 = e读(k − 1) × ratePerStep + 1`') && s473.includes('`e分 = 2 × e出′ + T − 1`') && s473.includes('`E新 = E_a + m`') && s476.includes('⑩ 扩展标度的误差界') && !/截断次数/.test(body));
check('第九版 行改挂：parent 与位置量在改挂行范围内的行上不是静态；推论 5 不另列例外；离场行的环境读作未知', body.includes('在改挂行范围内的行上不是静态') && body.includes('卷二 §2.6"行改挂"第 6 点') && body.includes('- **位置量照这三种处置里的第三种办，不另列例外**') && body.includes('`envAt` 对离场行返回未知') && !body.includes('而组件类的挂载与 `parent` 在建行时定下、之后不变'));
check('第九版 材料数值读法：四处熔点都写明经 materialView 读有效值', lineOf('| 卷三甲 §4.3（热数值）、卷三乙 §4.11（热属性与燃烧） | 材料热属性') /* 根因A：卷三拆为甲乙后改指卷三甲 §4.3、卷三乙 §4.11 */.includes('读到的是有效值') && lineOf('| `comp_weather_cell` | `precipLiquid` |').includes('`materialView` 读有效值') && body.includes('与降水材料的熔点（经卷三 `materialView` 读有效值，卷三乙 §4.1 M-12）比较') && body.includes('熔点经卷三 `materialView` 读该液体材料的有效值'));
check('第九版 毁田的通路：两个键不作用于在田作物，毁田只经卷二十五 clearCultivation 并带毁因代号，白名单列毁田请求', s473.includes('这两个键不适用于有耕作记录的在田作物') && s473.includes('`clearCultivation`') && s473.includes('带毁因代号') && body.includes('白名单为此列一项"毁田请求"'));
check('第九版 verb_pace_set 写明登记族、载荷与发出方，并收入 §5.1、§5.2', s4102.includes('verb 族的一个条目，由本卷登记') && s4102.includes('发出方只有一个') && lineOf('| 节奏设置事件 `verb_pace_set`').includes('发出方') && lineOf('| 卷九 | 玩家节奏设置命令的受理方').includes('`verb_pace_set`') && lineOf('| 卷二十五 §3.2、S25-5 |').includes('`clearCultivation`'));
check('第九版 附录丁有本轮各行、第九版牵连清单、说明与两点已批新增设计的补记', ['同类定稿清单 20-1（', '同类定稿清单 20-2（', '行改挂牵连（', '基值与有效值读法扫描（', '李白对卷二十五第三版复审 ①（', '`审查/全书-卷十九v7同类-预扫.md` 类别 3（'].every(w => allText.includes(`| 第九版：${w}`)) && allText.includes('**第九版牵连清单**') && all.some(l => l.startsWith('第九版说明：')) && all.some(l => l.startsWith('**此前两点已批的新增设计补记**') && l.includes('最通畅') && l.includes('两端加通路类型')));

out.push(`正文行数（不含附录乙）${lines.length}；全文行数 ${all.length}；子系统 ${subs.length}；开放问题 ${lines.filter(l => /^\d+\. \*\*/.test(l) && sections[lines.indexOf(l)]?.top.startsWith('§8')).length}`);
out.push(fail === 0 ? '结论：全部通过' : `结论：${fail} 项不通过`);
console.log(out.join('\n'));
if (process.argv.includes('--snapshot') && fail === 0) { fs.mkdirSync('F:/dnd/docs/统一底层设计/版本快照', { recursive: true }); fs.copyFileSync(SRC, SNAP); console.log(`已复制快照 ${SNAP}`); }
process.exitCode = fail ? 1 : 0;
