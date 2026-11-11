// 配方工序正文（draft.process）的 L1 确定性检查：骨架外器具、用火须交代火源。纯函数，无 IO。
//
// 词表全部从物品目录派生（context.catalog，由 w3Context 附带，不进入指纹）：
//   器具 = 带 tool / container / liquid_container / cloth / ceramic 标签的物品，加上任一配方 tools 里出现过的物品；
//   器具词 = 物品名、别名，以及中心词（名称去掉量词尾巴后的末字；末字是“片、段”之类没有区分力的量词字时取末两字）。
//   燃料 = 带 fuel 标签的物品。
// 规则层只有通用表，不含任何条目 id，也不按条目写特判：
//   WORKSTATION_FACILITIES：工作台类型 → 台本身隐含的设施；
//   ACTION_NEEDS：动作 → 需要的器具类别（类别由目录标签或名称判定）；
//   以及用火动作、火源交代用语、另备声明用语。
// 设计取向同 content-numerals.mjs：只在能确定是错的时候判错；错误信息带修复提示。

const UTENSIL_TAGS = ['tool', 'container', 'liquid_container', 'cloth', 'ceramic'];
const CONTAINER_TAGS = ['container', 'liquid_container'];
// 名称末尾的量词/形态字：做中心词没有区分力，改取末两字。
// 依据是汉语语法（不是照样例调的）：这些字是现代汉语的通用量词/类别词（一片、一段、一块、一条、一组、一份、一套、一副、一对、一粒、一束、一卷、一团）
// 或表形态部位的泛字（具、头、体、面）；“名词+量词”里，量词前的名词才是物名（平脊骨压片 → 压片），量词字单独出现说明不了是哪件器具。
// 取末两字后，“压片”仍会被判；单字“片”不会，所以正文里的“薄片、碎片”不误报（tests/w3-process-check.test.mjs 有正反两面用例）。
const WEAK_TAIL = '片段块条组份具头体面套副对粒束卷团';
// 单字中心词里，本身是高频通用语素、大量出现在非器具词里的字：不单独当器具词，只认含它的两字及以上词形（量规、画尺、对准器仍会判）。
// 依据同样是语言学而非样例：规（规定）、尺（尺寸）、准（对准）、尖（尖端）、杆（杆状）、轮（轮廓）、轴（轴线）、柄（柄部）、记（记录）、说（说明）、本（本身）、
// 灯（灯火）、石（石料）、器（器具）、斗（容量）、架（架子）、布（布料，另有 CLOTH_WORDS 专管）、刀（刀面、刀背）、子（后缀）。
// 动作字类工具（剪、锯、凿、锉、钻、锥、锤、针、刷……）不在此列，仍按单字覆盖。
// 已知残余（不在本卡改字表）：刀、尺、杆、斗、架、石在 COMMON_CHARS 里，骨架外的“用刀、用尺、用石”这类单字写法会漏判；全名与两字词形（切刀、量尺、磨石）照判。
const COMMON_CHARS = '规尺准尖杆轮轴柄记说本灯石器斗架布刀子';
// 通用泛称里的布类词（单字“布”太常见，只认这些词）。
const CLOTH_WORDS = ['干布', '湿布', '软布', '净布', '布巾', '抹布', '毛巾'];
const TRIM_TAIL = /(?:小袋|小包|小罐|小瓶|小壶|小篮)?(?:一份|一段|一组|份)?$/u;

// 工作台类型 → 台本身隐含的设施字词（正文可直接使用，不必在骨架里列）。
import { parseChineseNumeral } from './content-numerals.mjs';

export const WORKSTATION_FACILITIES = {
  cooking: ['灶', '炉', '案', '台'],
  smithing: ['炉', '砧', '台'],
  woodworking: ['台', '案'],
  weaving: ['台', '织坊', '案'],
  pottery: ['窑', '台', '轮', '案'],
  pill_furnace: ['炉', '台'],
};
const FACILITY_CHARS = [...new Set(Object.values(WORKSTATION_FACILITIES).flat().join('').split(''))].join('');
// 通用器具泛称 → 类别。
const GENERIC_WORDS = Object.fromEntries([['容器', 'container'], ['器皿', 'container'], ['容具', 'container'], ...CLOTH_WORDS.map((word) => [word, 'cloth'])]);

// 用身体部位做擦拭/揩抹不需要器具：“用/以/拿/凭/靠/借/徒/空”+身体部位词（拇指、指腹、手掌、手背、腕……），后面只隔副词就是擦拭动词。
const BODY = '(?:[拇食中无名小]?指(?:腹|尖|背|甲|头)?|手(?:掌|背|心|指|腕)?|掌(?:心|根)?|腕|臂|肘)';
const BODY_WIPE = new RegExp(`(?:[用以拿凭靠借]|徒|空)${BODY}(?:轻|慢|反复|再|一|来回|顺势|直接|就|轻轻|缓缓|逐|稍)*$`, 'u');
// 动作 → 需要的器具类别。need(item) 判定骨架里某物品是否属于该类别。
// 剪、锯、凿、锥、锉、钻、锤……这类动作字本身就是器具中心词，由中心词机制统一覆盖，不在此重复。
export const ACTION_NEEDS = [
  // (?<!吸)：“吸拭”是物料自身吸收（灶下燃料吸拭漏液），不是用布擦拭；单独的“拭”（拭干、拭去）仍判。用身体部位擦拭（用拇指擦去浮粉）见 BODY_WIPE。
  { id: '布巾', verbs: /擦拭|拭去|拭净|擦净|擦去|擦干|揩净|(?<!吸)拭/u, exempt: (prefix) => BODY_WIPE.test(prefix), label: '布巾类（带 cloth 标签的物品）', need: (item) => item.tags?.includes('cloth') },
  { id: '盖', verbs: /加盖|盖好|盖严|扣盖|合盖/u, label: '盖具（名称以“盖”结尾的物品）', need: (item) => /盖$/u.test(item.name) },
  { id: '量具', verbs: /画线|划线|弹线|量线|标线/u, label: '墨线或量具（规、尺、准类工具，或墨料）', need: (item) => /[规尺准]$|墨/u.test(item.name) },
];

// 用火动作与交代用语。
// 词表分三类：加热动词（煮熬烘烤蒸炒……）、冶炼热处理（淬火退火回火熔炼熔化焊煅）、火候火位（文火武火炭火入灶）；烧+X 的结果补语形式逐个列（烧软烧开烧化烧干烧制烧结烧煮烧水）。
const HEAT = /加热|烧至|烧红|烧透|烧沸|烧熟|烧热|烧软|烧开|烧化|烧干|烧制|烧结|烧煮|烧水|烧成|加温|融化|煅烧|煅|入炉|上炉|炉上|回炉|煮|熬|烙|焙|烘|煎|炒|锻|煨|炖|烤|焖|煲|烩|焯|炙|(?<!爆)炸(?!裂|开)|烫(?!手|伤|着|到|嘴)|蒸(?!发|汽|腾)|熔化|熔融|熔炼|熔铸|回火|退火|淬火|淬|焊|热合|热处理|生火|引火|引燃|升火|点火|起灶|坐灶|灶上|灶下|入灶|小灶|[小大中旺明文武温低稳微]火|炭火|柴火|微沸|沸腾/gu;
// 复合词里的用火字不是动作（煮锅、锻锤、烘盘）。
const HEAT_COMPOUND = /[煮煎炒熬烘烙焙炖烤锻煲烩焯炙煅焊炸][锅盘盆壶罐炉架锤砧工]|烙[印痕]|蒸[笼屉锅架盘]|[淬回退]火[炉池]/gu;
// 否定只管紧邻的动作/器具：把检查对象前面的文字（slice(0, 位置)）交给它，必须以“否定词(+情态/介词)”收尾才算否定。
// 否定与后面的动作/器具之间可隔一个动作或性状词（不承重锤击、不受力敲打，至多两字）；“不断、不停、不久、不时、不已……”里的“不”不是否定，所以“不断加热”“不断用案板搅”仍要检查。
// 按词形整体排除不表示否定的词：不断/不停/不久/不时/不住/不已/不止、不过/不然/不料/不足/不够/不免/不禁/不由/不觉/不知、不仅/不但/不论/不管/不如/不妨/不只/不光/不单，
// 双重否定“不得不、不可不、不能不、不许不”（等于必须；“非…不可”由 negatedAt 处理），无论/无非，非常/非但，以及“分别、区别、特别、差别”里的“别”（按前一字整体排除）。
const NEGATION = /(?:(?<!不[可能得许])不(?:(?![断停久时住已止仅但论管如妨只光单过然料足够免禁由觉知]|得不)[^，。；、：]{1,2}|(?:再|必|得|可|要|宜|另|需|能|会|应|许|准)?(?:用|以|取|作|为|拿|靠|将|把|经)?)|未(?:经)?|无(?!论|非)(?:需|须)?|勿(?:再|要|以|用|取)?|免(?:于)?|莫(?:要|以)?|(?<![分区差特辨告道类个另惜级性派送拜辞识])别(?:再|用)?|禁止?(?:以|用)?|切忌|切勿|严禁|避免|非(?!常|但|独|凡)(?:用|以)?)$/u;
// “非用案板不可”：非…不可/不行/不成是“必须”，不是否定。其余否定检查都走这里，prefix 以“非/非用/非以”收尾且后面八字内有“不可”时不算否定。
export const negatedAt = (text, index) => NEGATION.test(text.slice(0, index)) && !(/非(?:用|以)?$/u.test(text.slice(0, index)) && /^[^，。；、：]{0,8}不(?:可|行|成)/u.test(text.slice(index)));
const FIRE_ROLE = /炉用|灶用|引火|引燃|点燃|点火|生火|起火|升火|生炉|燃料|火源|供.{0,2}[火炉]|烧炉|烧尽|燃尽|烧完|烧旺|添炭|添柴|燃起|燃着/u;
const EXTERNAL = /另备|自备|自带|不随货|使用者(?:自)?备|须(?:由)?使用者/u;
const NOT_PROVIDED = /不(?:随)?附|不含|不带|不配/u;
// 声明外购/不提供：只豁免被声明的那个器具或对象（见 declaredSpans），不是整句整个分句。
// 用火动作前的否定还可以带一个火位/用火短语（不坐灶加热、不用火加热、不明火煮）：否定的是整个“用火加热”。
// 贮存安全写法（远离明火、忌见明火、避开炉灶、勿近火源）也是否定：否定词后可带火位词。
const HEAT_NEGATION = new RegExp(`(?:${NEGATION.source.slice(0, -1)}(?:坐灶|上灶|入灶|用火|生火|起火|点火|开火|置火|上火|入炉|上炉|明火|火|灶|炉)?|(?:远离|避开?|忌见?|勿近|莫近|切勿近|严禁近)[炉灶明火热源]{0,4})$`, 'u');
const DECL = new RegExp(`${EXTERNAL.source}|${NOT_PROVIDED.source}`, 'gu');
const DECL_BOUNDARY = /[用以取将把再并然后即令使入至置放]/u;
const DECL_FILLER = /^(?:的|提供|交付|供应|供给|随货|随附|附带|附)*$/u;
const POUR = /滤过|滤入|滤进|倒入|倒进|注入|舀入|舀进|盛入|盛进|装入|灌入|承接/u;
const PROCESS = /搅|拌|煮|熬|煎|烘|烙|焙|炒|溶入|混合|加热|翻|揉|捣/gu;
// 加工动词字做复合词（煮锅保留、搅匙）或表示倒掉（翻倒弃置）时不是加工动作。
const PROCESS_COMPOUND = /[搅拌煮熬煎烘烙焙炒翻捣揉][锅盘盆壶罐炉架锤砧匙板棒勺铲杵碗]|翻倒|翻覆|倒翻/gu;

// 泛称容器字（碗盘盆罐壶瓶桶杯盒缸篮碟钵）与单字“布”：正文里出现而骨架（tools、materials、设施）里没有名字含该字的物品，就是引入了骨架外器具。
// 与物品全名区分：先把目录里所有物品名、别名整体遮掉（宽口滤布、麻帆布、小罐份……），遮完之后剩下的才是泛称。
// 不是容器的同形词（盘绕、盘算、瓶颈、公布、分布、布置……）排除。
const VESSEL = /[陶瓷木铁铜锡石]?[碗盘盆罐壶瓶桶杯盒缸篮碟钵](?![绕结卷起成曲旋扣算问点颈好回压拢紧住绞缠])/gu;
const BARE_CLOTH_PREV = '用以把将取拿垫铺盖蒙裹包再块条片张方在于对';
const BARE_CLOTH_NEXT_NOT = '置局告料线满遍面边纹质匹幅'; // 布面、布边、布料……多指物品自身的织物，不是另取的一块布
// 盘作动词（盘绕、盘压、盘起：后接动词性字，见 VESSEL 的否定前瞻）或部件名词（轮盘、转盘、圆盘、底盘）时不是器皿。
const NON_VESSEL_PREV = /[图围底转圆轮]$/u;

// 数量：质量、容量、时长、期限。单位换算成基本单位：克、毫升、分钟、天。
const NUMERAL = '(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千半]+(?:点[零〇一二三四五六七八九]+)?)';
const QUANT_UNITS = {
  mass: { 千克: 1000, 公斤: 1000, 克: 1, kg: 1000, g: 1, 斤: 500, 两: 50, 钱: 5, 磅: 454, 盎司: 28 },
  volume: { 毫升: 1, 公升: 1000, 升: 1000, ml: 1, 斗: 10000, 合: 100 },
  length: { 尺: 1 },
  time: { 分钟: 1, 小时: 60, 个小时: 60, 时辰: 120, 个时辰: 120, 钟头: 60, 个钟头: 60, 刻钟: 15 },
  // 勺、杯、滴、寸、度、尺没有统一换算（尺只当长度），各自一类，只和同单位的数量比较。
  spoon: { 勺: 1 }, cup: { 杯: 1 }, drop: { 滴: 1 }, inch: { 寸: 1 }, degree: { 度: 1 },
  days: { 天: 1, 日: 1, 周: 7, 个月: 30 },
};
const UNIT_DIM = Object.fromEntries(Object.entries(QUANT_UNITS).flatMap(([dim, units]) => Object.keys(units).map((unit) => [unit, dim])));
const QUANT_RE = new RegExp(`(${NUMERAL})(${Object.keys(UNIT_DIM).sort((a, b) => b.length - a.length).join('|')})(?![火起高温A-Za-z])`, 'giu');
// 度算温度单位：数字紧接“度”，且数字前面是真正的温度表述（温度、水温、加热到、烧至、升到……）；“温水后一度翻动”“水温升高后一度翻动”是次数。角度写作“九十度角”。
const TEMP_CONTEXT = /(?:温度|[水油炉火锅]温|火候|[热烧升降冷凉加]至|[热烧升降冷凉加]到|达到?|升到|降到)(?:约|为|在|是)?$/u;
// 总括性时长句：总括词（全程、总耗时、总计、共耗时、前后共、一共用……）与数字之间可隔同一分句内至多 12 个非标点字（全程含加热与冷却等待约150分钟、全程用四十五分钟）。
// 数值等于骨架 minutes 才放行（“约N分钟”且 N 等于骨架也放行）；不等于，或没有总括词的分段时长，照判。
const TOTAL_WORD = /(?:全程|总耗时|总用时|总时长|总计|总共|合计|共计|共|前后|整个过程|整件活计|一共)[^，。；、：]{0,12}$/u;
const DEADLINE = /^(?:内|以内|之内|为限)/u;
// 期限语境词：保存七天、存放三日、保质十天、食用期五天、三天用完；单独的“晾半天”“一天之中”不是期限。
const DEADLINE_WORD_BEFORE = /(?:保存|存放|储存|可放|可存|保质|放置|食用期|保鲜)(?:约|至|为|达|可|期|在|于)?$/u;
const DEADLINE_WORD_AFTER = /^(?:用完|吃完|食用|后失效|后变质)/u;
function numberOf(raw) {
  if (/^[\d.]+$/u.test(raw)) return Number(raw);
  if (raw === '半') return 0.5;
  if (raw.includes('点')) {
    const [whole, decimals] = raw.split('点'), integer = whole ? parseChineseNumeral(whole) : { ok: true, value: 0 };
    const digits = [...decimals].map((digit) => '零一二三四五六七八九'.indexOf(digit === '〇' ? '零' : digit)).join('');
    return integer.ok ? Number(`${integer.value}.${digits}`) : null;
  }
  const parsed = parseChineseNumeral(raw);
  return parsed.ok ? parsed.value : null;
}
// 文本里的全部“数字+单位”：{dim, base, raw, index}。第/每/隔 + 数 + 天（第二天、每三天）是序数/频率，不是数量。
// marked=true（检查正文）：天、日、周、月只在带期限标记（内、之内、以内、为限）或紧邻期限语境词（保存、存放、可放、保质、用完、食用期、放置）时算数量，“半天、一天”不当期限；marked=false（收集骨架事实）全算。
export function quantitiesIn(text, marked = false) {
  const found = [];
  for (const match of text.matchAll(QUANT_RE)) {
    if (/[第每隔]$/u.test(text.slice(0, match.index))) continue;
    const value = numberOf(match[1]);
    if (value === null) continue;
    if (/^[零〇]$/u.test(match[1])) continue; // 单独的“零”是词素（零钱夹、零件），不是数量
    // 周只在期限语境算数量（磨平四周是四边）；两后接量词是“一两支”（一二支）的概数，不是重量单位。
    if (match[2] === '周' && !DEADLINE.test(text.slice(match.index + match[0].length))) continue;
    if (match[2] === '两' && /^[个支只条根枚件块张片份名位次天日人]/u.test(text.slice(match.index + match[0].length))) continue;
    // 单位歧义：度只在温度/角度语境算（“一度、两度翻动”是次数）；寸步、尺规、合土、斗篷等同形词不算。
    const before = text.slice(0, match.index), after = text.slice(match.index + match[0].length);
    if (match[2] === '度' && !TEMP_CONTEXT.test(before) && !/^角/u.test(after)) continue;
    if (match[2] === '寸' && /^[步断劲]/u.test(after)) continue;
    if (match[2] === '尺' && /^[规子寸]/u.test(after)) continue;
    if (match[2] === '合' && (/^[土上拢并金成起好严适力理格作同欢]/u.test(after) || match[1] === '百')) continue; // 百合是植物名
    if (match[2] === '斗' && /^[篷笠]/u.test(after)) continue;
    if (marked && UNIT_DIM[match[2]] === 'days' && !DEADLINE.test(after) && !DEADLINE_WORD_AFTER.test(after) && !DEADLINE_WORD_BEFORE.test(before)) continue;
    const unit = /^[a-z]+$/iu.test(match[2]) ? match[2].toLowerCase() : match[2], dim = UNIT_DIM[unit];
    found.push({ dim, base: value * QUANT_UNITS[dim][unit], raw: match[0], index: match.index, end: match.index + match[0].length });
  }
  return found;
}

const unique = (list) => [...new Set(list)];
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const split = (text, pattern) => text.split(pattern).filter((part) => part.trim());

// 一个分句里“被声明另备/不提供”的对象所在区间。声明词后面直到下一个动作/连接词（用、以、取、将、再……）之前是被声明的对象（另备案板用剪裁片 → 只有案板）；
// 若声明词后面没有对象（容器须使用者另备、不随货提供），对象在声明词前面、上一个动作词之后。
export function declaredSpans(clause) {
  const spans = [];
  const matches = [...clause.matchAll(DECL)];
  for (let i = 0; i < matches.length; i++) {
    let start = matches[i].index, end = start + matches[i][0].length;
    while (i + 1 < matches.length && matches[i + 1].index === end) { i++; end += matches[i][0].length; }
    const rest = clause.slice(end), cut = rest.search(DECL_BOUNDARY), after = cut < 0 ? rest : rest.slice(0, cut);
    if (!DECL_FILLER.test(after)) { spans.push([end, end + after.length]); continue; }
    const head = clause.slice(0, start), prior = [...head.matchAll(new RegExp(DECL_BOUNDARY.source, 'gu'))].at(-1);
    spans.push([prior ? prior.index + 1 : 0, start]);
  }
  return spans;
}
export const within = (spans, index) => spans.some(([from, to]) => index >= from && index < to);

// 中心词候选：末两字一律算；末一字只在器具类（非容器/布/陶）且不是日常常用字时算。
export function utensilHeads(name, single = true) {
  const base = name.replace(TRIM_TAIL, '') || name;
  const heads = [];
  if (base.length >= 3) heads.push(base.slice(-2));
  const last = base.at(-1);
  if (single && !WEAK_TAIL.includes(last) && !COMMON_CHARS.includes(last)) heads.push(last);
  return heads;
}

// 由目录派生词表。heads: 器具词 → {source, container}；fuels: 燃料及其可称呼的名字；byId: 目录索引。
export function buildVocabulary(catalog, recipes = []) {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const asTool = new Set(recipes.flatMap((recipe) => recipe.tools ?? []));
  const heads = new Map();
  for (const item of catalog) {
    if (!(item.tags?.some((tag) => UTENSIL_TAGS.includes(tag)) || asTool.has(item.id))) continue;
    const container = item.tags?.some((tag) => CONTAINER_TAGS.includes(tag)) ?? false;
    const has = (list) => item.tags?.some((tag) => list.includes(tag));
    // 布类只认全名（“麻布”与“麻帆布”只差一字，不算引入新物）；容器、陶器只取两字词形；
    // 带 tool 标签的手工具，其单字中心词同时是动作字（剪、锯、凿、锉……），骨架里有就覆盖；
    // 其余器具（只因出现在配方 tools 而入表）的单字中心词是纯名词，只在“设施字+中心词”（案板、炉钳）且该词不在骨架里时判错：
    // 台上另放的器具不属于工作台隐含设施（案板≠搅糊板）；匙背、板面这类部位词不判。
    const single = !has(['container', 'liquid_container', 'cloth', 'ceramic']), strict = !has(['tool']);
    for (const name of [item.name, ...(item.aliases ?? [])]) {
      if (name.length < 2) continue;
      const terms = has(['cloth']) ? [name] : [name, ...utensilHeads(name, single)];
      for (const term of unique(terms)) if (!heads.has(term)) heads.set(term, { source: item.name, container, strict: strict && term.length === 1 });
    }
  }
  const fuels = new Map();
  for (const item of catalog.filter((row) => row.tags?.includes('fuel'))) {
    const core = item.name.replace(TRIM_TAIL, '');
    const names = [item.name, core, ...(item.aliases ?? [])];
    for (let n = 2; n < core.length; n++) names.push(core.slice(-n));
    fuels.set(item.id, unique(names.filter((name) => name.length >= 2)));
  }
  const utensilNames = new Set([...heads.values()].map((info) => info.source));
  const plain = catalog.map((item) => item.name).filter((name) => name.length >= 3 && !utensilNames.has(name)).sort((a, b) => b.length - a.length);
  const plainRe = plain.length ? new RegExp(plain.map(esc).join('|'), 'gu') : null;
  const names = catalog.map((item) => item.name).filter((name) => name.length >= 3).sort((a, b) => b.length - a.length);
  const nameRe = names.length ? new RegExp(names.map(esc).join('|'), 'gu') : null;
  // 用火检查专用的遮罩：全名之外再认长度不少于 4 字的名字片段（退火铁线卷 → 退火铁线、可弯退火铁线 → 退火铁线）：
  // 正文常用简称称呼物料，简称里的退火、烧制等是物料状态，不是用火动作。
  const shortNames = catalog.flatMap((item) => [item.name, ...(item.aliases ?? [])]).flatMap((name) => {
    const parts = [name];
    for (let from = 0; from < name.length; from++) for (let to = from + 4; to <= name.length && to - from < name.length; to++) parts.push(name.slice(from, to));
    return parts;
  }).filter((name) => name.length >= 3);
  const maskNames = unique(shortNames).sort((a, b) => b.length - a.length);
  const maskRe = maskNames.length ? new RegExp(maskNames.map(esc).join('|'), 'gu') : null;
  const everyName = unique(catalog.flatMap((item) => [item.name, ...(item.aliases ?? [])]).filter((name) => name.length >= 2)).sort((a, b) => b.length - a.length);
  const allNameRe = everyName.length ? new RegExp(everyName.map(esc).join('|'), 'gu') : null;
  return { heads, fuels, byId, nameRe, plainRe, maskRe, allNameRe };
}

// 主入口：返回错误字符串数组。context.catalog 缺失是调用方的错误，直接抛出：检查不能因为少传参数就静默跳过。
export function processIssues(text, entry, context) {
  const catalog = context?.catalog;
  if (!Array.isArray(catalog)) throw new Error('processIssues: context.catalog 缺失（须由 w3Context/journeyContext 附带物品目录），工序检查不能静默跳过');
  if (typeof text !== 'string') return [];
  const vocab = vocabularyFor(context);
  const items = unique([...(entry.tools ?? []), ...(entry.materials ?? []).map((row) => row.item), entry.output?.item, ...(entry.byproducts ?? []).map((row) => row.item)].filter(Boolean)).map((id) => vocab.byId.get(id)).filter(Boolean);
  const allowedText = [...items.flatMap((item) => [item.name, ...(item.aliases ?? [])]), ...(WORKSTATION_FACILITIES[entry.workstation] ?? [])].join('');
  const hasContainer = items.some((item) => item.tags?.some((tag) => CONTAINER_TAGS.includes(tag)));
  const hasCloth = items.some((item) => item.tags?.includes('cloth'));
  const sentences = split(text, /[。；！？\n]/u);
  const errors = [];
  const seen = new Set();

  // 一、骨架外器具：名词直接出现 + 动作隐含。
  for (const sentence of sentences) {
    // 非器具物品的全名（干木刨屑、软木薄片）整体遮掉，免得名里的字（刨、片）被当成器具词。
    const clauses = split(sentence, /[，、：]/u).map((raw) => {
      const text = vocab.plainRe ? raw.replace(vocab.plainRe, '〇') : raw;
      return { raw, text, spans: declaredSpans(text) };
    });
    // 本句声明另备/不提供的对象；声明里含容器，则本句其他分句可以装入它（舀入待装容器，容器须使用者另备）。
    const declared = clauses.flatMap((c) => c.spans.map(([from, to]) => c.text.slice(from, to))).join('|');
    // 声明了泛称容器（容器、器皿）：本句其他分句可装入任意容器；只声明了某个具体容器（陶罐）：只豁免这个词。
    const declaresGeneric = /容器|器皿|容具/u.test(declared);
    const declaresContainer = declaresGeneric || [...vocab.heads].some(([term, info]) => info.container && declared.includes(term));
    for (const { raw: rawClause, text: clause, spans } of clauses) {
      for (const [term, info] of vocab.heads) {
        if (seen.has(term) || !clause.includes(term)) continue;
        const at = [...clause.matchAll(new RegExp(esc(term), 'gu'))].map((match) => match.index).find((index) => {
          if (within(spans, index) || declared.includes(term)) return false; // 被声明另备/不提供的对象，本句内再提到也不算引入
          if (!info.strict) { if (allowedText.includes(term)) return false; }
          else if (!(index > 0 && FACILITY_CHARS.includes(clause[index - 1])) || allowedText.includes(clause.slice(index - 1, index + 1))) return false;
          return !negatedAt(clause, info.strict ? index - 1 : index); // 设施字+器具字（案板）：否定落在设施字前面
        });
        if (at === undefined) continue;
        if (info.container && declaresGeneric) continue;
        seen.add(term);
        errors.push(`正文出现骨架外器具「${term}」（${rawClause.trim()}）：器具须来自骨架 tools、materials 或工作台设施。修复：改用骨架已有的器具，或删去这一步；确需此器具就改骨架补进 tools/materials，不要只在正文里添加`);
      }
      for (const [word, type] of Object.entries(GENERIC_WORDS)) {
        if (!clause.includes(word) || seen.has(word)) continue;
        const at = [...clause.matchAll(new RegExp(esc(word), 'gu'))].map((match) => match.index).find((index) => !within(spans, index) && !declared.includes(word) && !negatedAt(clause, index));
        if (at === undefined) continue;
        // 装入/倒入“容器”：骨架里的锅会直接写成锅，写泛称容器就是另一件盛装物，没声明另备就是引入；其他提到容器的句子，骨架有容器类物品就放行。
        if (type === 'container' ? declaresContainer || (hasContainer && !POUR.test(clause)) : hasCloth) continue;
        seen.add(word);
        errors.push(`正文提到泛称器具「${word}」（${rawClause.trim()}）但骨架没有对应的${type === 'container' ? '容器' : '布巾'}。修复：写明“容器须使用者另备，不随货提供”，或改用骨架已有器具`);
      }
    }
    for (const { raw: rawClause, text: plainClause, spans } of clauses) {
      const clause = vocab.allNameRe ? plainClause.replace(vocab.allNameRe, '〇') : plainClause;
      // 遮罩会改变长度，声明区间与否定都按遮罩后的分句重算。
      const maskedSpans = declaredSpans(clause);
      const exempt = (word, index) => within(maskedSpans, index) || declared.includes(word) || negatedAt(clause, index);
      for (const match of clause.matchAll(VESSEL)) {
        const word = match[0], kind = word.at(-1);
        if (seen.has('泛:' + word) || allowedText.includes(kind) || exempt(word, match.index) || (kind === '罐' || kind === '盘') && NON_VESSEL_PREV.test(clause.slice(0, match.index))) continue;
        if (declaresGeneric) continue;
        seen.add('泛:' + word);
        errors.push(`正文提到泛称器具「${word}」（${rawClause.trim()}）但骨架 tools、materials 和工作台设施里没有${kind}类物品。修复：改用骨架已有器具；确需盛装就写明“容器须使用者另备，不随货提供”`);
      }
      for (const match of clause.matchAll(/布/gu)) {
        const prev = clause[match.index - 1], next = clause[match.index + 1];
        const bare = prev === undefined || !/\p{Script=Han}/u.test(prev) || BARE_CLOTH_PREV.includes(prev);
        if (!bare || (next && BARE_CLOTH_NEXT_NOT.includes(next)) || prev === '〇' || seen.has('泛:布') || hasCloth || allowedText.includes('布') || exempt('布', match.index)) continue;
        seen.add('泛:布');
        errors.push(`正文提到泛称器具「布」（${rawClause.trim()}）但骨架没有布巾类物品。修复：改用骨架已有器具，或删去这一步`);
      }
    }
    for (const rule of ACTION_NEEDS) {
      if (seen.has(rule.id) || items.some(rule.need)) continue;
      // 逐个命中检查：紧邻否定（不再擦拭）或用身体部位做的（用拇指擦去）不算。
      const match = [...sentence.matchAll(new RegExp(rule.verbs.source, 'gu'))].find((hit) => {
        const prefix = sentence.slice(0, hit.index).split(/[，、：]/u).at(-1);
        return !NEGATION.test(prefix) && !rule.exempt?.(prefix);
      });
      if (!match) continue;
      seen.add(rule.id);
      errors.push(`正文动作「${match[0]}」（${sentence.trim()}）需要${rule.label}，骨架 tools/materials 里没有。修复：删去该动作，或改骨架补入对应物品`);
    }
  }

  // 二、另备容器是交付终点：装入之后不得再对内容物加工（如滤进另备容器后又沿锅缘搅匀）。
  // 复合词（煮锅保留）与“翻倒”不是加工；其余加工动词逐个看，紧邻否定（不再搅动）的不算。
  const stirAfter = (clause) => {
    const bare = clause.replace(PROCESS_COMPOUND, '');
    return [...bare.matchAll(PROCESS)].some((match) => !negatedAt(bare, match.index));
  };
  let delivered = false;
  for (const raw of sentences) {
    const sentence = vocab.nameRe ? raw.replace(vocab.nameRe, '〇') : raw; // 物品全名（温搅皂洗液）里的动作字不是加工动作
    const clauses = split(sentence, /[，、：]/u);
    const at = clauses.findIndex((clause) => EXTERNAL.test(clause) && POUR.test(clause) && /容器|器皿/u.test(clause));
    const after = at < 0 ? clauses : clauses.slice(at + 1);
    if ((delivered || at >= 0) && after.some(stirAfter)) {
      errors.push(`正文把成品或半成品放进使用者另备的容器之后，又写加工动作（${sentence.trim()}）：另备容器只作交付终点，不能参与加工。修复：先在骨架已有的锅里完成加工，最后一步才装入另备容器`);
      break;
    }
    if (at >= 0) delivered = true;
  }

  // 三、用火须交代火源。
  const masked = (vocab.maskRe ? text.replace(vocab.maskRe, '') : text).replace(HEAT_COMPOUND, '');
  const heats = [];
  for (const match of masked.matchAll(HEAT)) if (!HEAT_NEGATION.test(masked.slice(0, match.index))) heats.push(match[0]);
  if (heats.length) {
    const fuelMaterial = items.filter((item) => vocab.fuels.has(item.id) && (entry.materials ?? []).some((row) => row.item === item.id));
    const verbs = unique(heats).join('、');
    if (!fuelMaterial.length) {
      errors.push(`正文写了用火（${verbs}）但骨架 materials 里没有燃料（带 fuel 标签的物品）。修复：改骨架补入燃料物品，或把加热步骤改成不用火的做法`);
    } else if (!sentences.some((sentence) => affirmsFire(sentence, fuelMaterial.flatMap((item) => vocab.fuels.get(item.id))))) {
      errors.push(`正文写了用火（${verbs}）但没有交代火源。修复：补一句“以${fuelMaterial[0].name}引火/作火源”，且燃料只入炉灶、不混入成品`);
    }
  }
  errors.push(...quantityIssues(text, entry, vocab, items));
  return errors;
}

// 五、物品正文：表示重量、容量、长度的数字必须带单位（“重0.35”“长三十”不行，“重240克”“长三十寸”可以）。纯函数，供物品正文的 L1 使用（w3-trades.mjs 的 validateTradesDraft）。
// 量词前缀：重/重量/净重/单重/整器重……（重量），容/容量/容积，长/宽/高/厚/深/径/直径（长度，增长、提高、加厚等动词性前缀用 lookbehind 排除）。
// 数字取最长匹配（贪婪、锚定在关键词后），因此“重240克”不会被截成“重24”；数字后紧跟单位才算带单位；紧跟个数量词（重叠三层、宽三指、长三节）不是度量，不判。
const MEASURE_KEY = /(?:约重|重约|重量|净重|单重|共重|重|容量|容积|(?<=可)容|(?<![增生成延拉伸滋助家擅专特最])长度?|宽度?|(?<![提增升抬拔最])高度?|(?<![加增])厚度?|深度?|直径|口径)(?:约|为|是|达|在)?/gu;
const MEASURE_NUMBER = /^(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千半]+(?:点[零〇一二三四五六七八九]+)?)/u;
const MEASURE_UNIT = /^\s*(?:千克|公斤|克|斤|两|磅|盎司|吨|毫升|公升|升|勺|杯|合|斗|厘米|毫米|公里|千米|米|寸|尺|丈|分|kg|g|ml|l|cm|mm|km|m)(?![A-Za-z])/iu;
const MEASURE_COUNT = /^[层次遍道重回件个条根片块枚张只份倍折叠指掌步拃行列排圈环节瓣粒股束成头边端面侧臂肘点截些等许]/u;
export function unitlessMeasureIssues(text) {
  const errors = [];
  if (typeof text !== 'string') return errors;
  for (const key of text.matchAll(MEASURE_KEY)) {
    const rest = text.slice(key.index + key[0].length), number = rest.match(MEASURE_NUMBER);
    if (!number) continue;
    const after = rest.slice(number[0].length);
    if (/^[0-9.]/u.test(after) || MEASURE_UNIT.test(after) || MEASURE_COUNT.test(after)) continue;
    const raw = key[0] + number[0];
    errors.push(`正文里的「${raw}」是重量、容量或长度，数字后面没有单位（${text.slice(Math.max(0, key.index - 6), key.index + raw.length + 6).trim()}）。修复：写成带单位的形式，如“重二百四十克”“长三十厘米”，或删去具体数字`);
  }
  return [...new Set(errors)];
}

// 已知残余（不在本卡改）：数量只按数值匹配，不分来源——正文里的 600 克若恰好等于骨架里别处某个数值（别的材料重量、processFacts 里无关的数字），也会放行；
// 漏判由 L4 人读兜底。非…不可只处理“非/非用/非以”紧接器具的写法。
// 四、骨架外数量：具体质量/容量、分段时长、期限，数值必须来自骨架或引用事实（processFacts、材料与成品的 use 与重量、minutes、保存期）。
function quantityIssues(text, entry, vocab, items) {
  const allowed = Object.fromEntries(Object.keys(QUANT_UNITS).map((dim) => [dim, new Set()]));
  const take = (list) => { for (const quantity of list) allowed[quantity.dim].add(quantity.base); };
  take(quantitiesIn([entry.processFacts, entry.use, ...items.map((item) => item.use)].filter((value) => typeof value === 'string').join('。')));
  const output = vocab.byId.get(entry.output?.item) ?? entry;
  for (const item of [output, ...(entry.materials ?? []).map((row) => vocab.byId.get(row.item))]) if (typeof item?.weight === 'number') allowed.mass.add(Math.round(item.weight * 1000));
  for (const row of entry.materials ?? []) {
    // 材料 use 里写的每份数量（五十毫升）乘份数，也是骨架给出的总量。
    if (typeof row.amount === 'number') take(quantitiesIn(vocab.byId.get(row.item)?.use ?? '').map((quantity) => ({ ...quantity, base: quantity.base * row.amount })));
    const weight = vocab.byId.get(row.item)?.weight;
    if (typeof weight === 'number' && typeof row.amount === 'number') allowed.mass.add(Math.round(weight * row.amount * 1000));
  }
  const total = entry.minutes ?? entry.book?.readingMinutes;
  const shelf = output.shelfLifeDays ?? entry.shelfLifeDays;
  if (typeof shelf === 'number') allowed.days.add(shelf);
  const errors = [];
  const seenRaw = new Set();
  for (const quantity of quantitiesIn(text, true)) {
    if (seenRaw.has(quantity.raw)) continue;
    const near = (set) => [...set].some((value) => Math.abs(value - quantity.base) < 0.5);
    const context = text.slice(Math.max(0, quantity.index - 12), Math.min(text.length, quantity.end + 8)).trim();
    let bad = null;
    if (quantity.dim === 'mass' || quantity.dim === 'volume') {
      if (!near(allowed[quantity.dim])) bad = `正文出现骨架外数量「${quantity.raw}」（${context}）：质量、容量数值须来自骨架材料份数与重量或 processFacts。修复：删去具体数量，改写成“规定份量”“全部”`;
    } else if (!['time', 'days'].includes(quantity.dim)) {
      if (!near(allowed[quantity.dim])) bad = `正文出现骨架外数量「${quantity.raw}」（${context}）：勺、杯、滴、寸、度等数量须来自骨架或 processFacts。修复：删去具体数量，改写成“规定份量”“适量”`;
    } else if (quantity.dim === 'days') { // 期限只认天、日、周、月，按天比较；“三十分钟内”是时长，走下面的时长分支
      if (!near(allowed[quantity.dim])) bad = `正文出现骨架外期限「${quantity.raw}」（${context}）：期限只能是骨架保存期或 processFacts 写明的。修复：删去期限（如“两日内用完”），保存期以骨架为准`;
    } else if (!near(allowed.time)) {
      const isTotal = TOTAL_WORD.test(text.slice(Math.max(0, quantity.index - 16), quantity.index)) && total !== undefined && quantity.base === total;
      if (!isTotal) bad = `正文出现骨架外时长「${quantity.raw}」（${context}）：分段时长须来自 processFacts，总时长只由系统追加“全程N分钟”。修复：删去这类约N分钟的分段时长`;
    }
    if (bad) { seenRaw.add(quantity.raw); errors.push(bad); }
  }
  return errors;
}

// 火源交代必须是肯定句：同一句里有火源用语（引火、燃料、火源……）和骨架燃料的名字，且两者都没有被紧邻否定（不以干木刨屑引火、火源不取木炭）。
// 燃料名取最长匹配（干木刨屑），免得“不以干木刨屑”被里面的短名“刨屑”绕过。
function affirmsFire(sentence, names) {
  const roles = [...sentence.matchAll(new RegExp(FIRE_ROLE.source, 'gu'))];
  if (!roles.some((match) => !negatedAt(sentence, match.index))) return false;
  const sorted = unique(names).sort((a, b) => b.length - a.length);
  if (!sorted.length) return false;
  return [...sentence.matchAll(new RegExp(sorted.map(esc).join('|'), 'gu'))].some((match) => !negatedAt(sentence, match.index));
}

const cache = new WeakMap();
export function vocabularyFor(context) {
  if (!cache.has(context.catalog)) cache.set(context.catalog, buildVocabulary(context.catalog, context.catalogRecipes ?? []));
  return cache.get(context.catalog);
}
