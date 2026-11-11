// 物品正文的 L1 确定性检查（第二层，与 w3-item-check.mjs 分工）：模糊用量与身体尺度、骨架外尺寸、没有出处的人名地名店名。纯函数，无 IO。
// 口径见 docs/L4-必查清单.md 第 8、10、13 条。
//
// 与 ITEMCK（w3-item-check.mjs）的分工：ITEMCK 管 storage 处置/后果/期限、骨架外器具与包装收纳、制作痕迹与配方不符；
// 本模块只管：一、模糊用量和身体尺度（少许、一掌、两指……）与骨架外尺寸；二、名称出处。两边词表互不重叠，同一处不会重复报。
//
// 规则层只有通用词形，不含条目 id：
//   一、数量类词形：模糊用量词、数+身体部位（掌、拃、握、指……）、数+长度单位（厘米、寸、尺……）、数+勺杯滴升斗。
//        骨架或配方工序事实里原样出现的写法放行（引用事实说了就不算骨架外）。“若干”只在后面紧跟部件量词时放行（第 8 条：工序形成的部件数目）。
//   二、名称出处：世界里的人名、地名、店名（context.worldNames，由 w3Context 附带，不进指纹）出现在正文里，必须在该条的出处文字里
//        （骨架各字段、引用事实、配方与其工具材料名、物品自己的名称别名；骨架里引用的实体编号如 acquisition.seller、origin 所指的人物地点名称）出现过，
//        否则判没有出处；另有人名店名的词形（老张、陈师傅、张记、陈家铺）。
//        物品名、别名、材料和工具名（目录里全部物品名）先整体遮掉，不算名称。

import {quantitiesIn} from './w3-process-check.mjs';

const FIELDS = ['description', 'inspection', 'storage'];
const unique = (list) => [...new Set(list)];
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const NUM = '(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千半数几]+)';

// ── 一、模糊用量与身体尺度 ──
// 模糊用量词。“数、几”只在后接计量字时算（数匝、几滴），单独的“数”“几”太常见（数据、几乎）；“数次、数遍”是动作次数，第 12 条不算骨架外数量，不在此列。
const VAGUE_AMOUNT = /少许|些许|一些|一点儿|一点点|少量|适量|微量|略许|数[匝圈道层股滴片块根条粒枚段节]|几[匝圈道层股滴]/gu;
// 身体尺度：数词 + 掌、拃、握、指、撮、捧、肘、臂、庹（一掌、两指、一拃、一握、三指宽）。
const BODY_SCALE = new RegExp(`${NUM}(?:掌|拃|握|指|撮|捧|肘|臂|庹)(?:宽|长|高|厚|深)?`, 'gu');
// 身体部位 + 大小、宽、长、粗细（掌心大小、巴掌大、手掌宽、小指粗细），以及“如/似/比 + 身体部位”（约如小指、比手掌宽些）。
const BODY_PART = '(?:掌心|巴掌|手掌|手心|手背|手指|拇指|食指|中指|无名指|小指|指头|指腹|指尖|拳头|手臂|前臂)';
const BODY_SIZE = new RegExp(`${BODY_PART}(?:大小|大|宽|长|高|厚|粗细|粗|深)|(?:如|似|比|约如|形如|同)${BODY_PART}`, 'gu');
// 骨架外的度量写法：长度、小容量单位。质量与时长另有检查（validateW3Draft 的数字单位核对、numeralIssues）。
const METRIC_LENGTH = new RegExp(`${NUM}\\s*(?:厘米|毫米|公分|公里)`, 'gu');
const SMALL_VOLUME_DIMS = new Set(['length', 'inch', 'spoon', 'cup', 'drop', 'volume']);
// “若干”：第 8 条只许用在工序形成的部件数目上（剪成若干分袋面）；前面紧跟取放加撒这类处理材料的动词，就是在写材料用量（取若干盐、撒若干），判错。
const SEVERAL = /若干/gu;
const SAMPLE_VERB_BEFORE = /(?:舀|取|挑|盛|蘸)$/u;
const SAMPLE_VERB_AFTER = /^[^，。；]{0,2}(?:尝|看|闻|试|验|查)/u;
const MATERIAL_VERB_BEFORE = /(?:取|加|放|撒|倒|滴|抹|涂|蘸|添|用|入|盛|舀|抓|掺|拌|施|敷|配|备|蘸取|取用)$/u;

// 骨架与引用事实里的全部文字（物品骨架各字段、引用事实、配方骨架）。放行用：这里原样出现的写法不算骨架外。
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, out);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) if (!['id', 'worldNames', 'catalog', 'catalogRecipes'].includes(key)) strings(item, out);
  return out;
}

function provenanceText(entry, context) {
  const catalog = context?.catalog ?? [];
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const recipe = context?.recipe ?? (context?.catalogRecipes ?? []).find((row) => row.output?.item === entry.id);
  const named = (id) => { const item = byId.get(id); return item ? [item.name, ...(item.aliases ?? [])] : []; };
  const recipeIds = recipe ? [...(recipe.tools ?? []), ...(recipe.materials ?? []).map((row) => row.item), ...(recipe.byproducts ?? []).map((row) => row.item)] : [];
  const teaches = (context?.book?.teaches ?? []).flatMap((row) => [row.name, row.id]);
  return [...strings(entry), ...strings(context), ...(recipe ? strings(recipe) : []), ...recipeIds.flatMap(named), ...teaches].filter(Boolean).join('|');
}

export function amountIssues(text, supplied = '', options = {}) {
  const errors = [];
  if (typeof text !== 'string') return errors;
  const give = (raw, index, kind) => {
    if (supplied.includes(raw)) return;
    errors.push(`${kind}「${raw}」（${text.slice(Math.max(0, index - 6), index + raw.length + 6).trim()}）：骨架和引用事实里没有。修复：删去，不写模糊用量、身体尺度和骨架外尺寸；材料用量只写骨架份数或不写`);
  };
  // 不设“程度补语”豁免：分不出“回弹少许”和“放盐少许”的词形规则只能靠动词词表，属特判；骨架外的模糊幅度（回弹少许）同样是骨架没有的量，按第 8 条一并判。
  for (const match of text.matchAll(VAGUE_AMOUNT)) give(match[0], match.index, '写了模糊用量');
  for (const match of text.matchAll(BODY_SCALE)) give(match[0], match.index, '写了身体尺度');
  for (const match of text.matchAll(BODY_SIZE)) give(match[0], match.index, '写了身体尺度');
  for (const match of text.matchAll(METRIC_LENGTH)) give(match[0], match.index, '写了骨架外尺寸');
  for (const quantity of quantitiesIn(text)) if (SMALL_VOLUME_DIMS.has(quantity.dim)) {
    // 取样动作（查验时“舀一勺尝”）：骨架有匙具，一勺是确定量的取样动作，不是材料用量。
    if (options.sampling && ['spoon', 'cup'].includes(quantity.dim) && /^[一1]/u.test(quantity.raw) && SAMPLE_VERB_BEFORE.test(text.slice(0, quantity.index)) && SAMPLE_VERB_AFTER.test(text.slice(quantity.end))) continue;
    give(quantity.raw, quantity.index, '写了骨架外尺寸或用量');
  }
  for (const match of text.matchAll(SEVERAL)) {
    if (MATERIAL_VERB_BEFORE.test(text.slice(0, match.index))) give(match[0], match.index, '“若干”只可用于工序形成的部件数目，这里是材料用量');
  }
  return unique(errors);
}

// ── 二、名称出处 ──
// 人名店名词形。姓只取不与常见名词同形的一批（不取石、米、马、羊、白、黄、林、谷、方、水、花、金、云、山、车、胡、杨 等）。
const SURNAME = '赵钱孙李周吴郑王冯陈蒋沈韩朱秦许何吕施张曹严魏姜谢邹苏潘葛彭鲁韦昌苗俞任袁柳鲍唐费薛倪殷罗郝傅顾孟穆萧尹姚邵毛宋熊纪舒屈项祝董杜阮季贾童郭蔡凌霍卢莫丁邓崔龚程邢裴陆翁荀惠焦巴侯刘黎蒲卓蒙乔庄';
const PERSON_SHOP = [
  // “老/小+姓”只在后面紧跟人或店的语境字时算（老张家、老陈说、小李打造）；句末、标点、“的”后跟都不算，否则“切老姜”“付小钱”“老姜的辣味”会误报。
  new RegExp(`[老小][${SURNAME}](?=[家铺店坊匠师说传做制打造曾])`, 'gu'),
  new RegExp(`[${SURNAME}](?:师傅|掌柜|老板|匠人|工匠|先生|大娘|大婶|大叔|大爷|婆婆|老伯|夫人|娘子)`, 'gu'),
  new RegExp(`[${SURNAME}](?:记|氏)(?:[\\u4e00-\\u9fa5]{0,2}(?:铺|店|行|坊|号|窑))?`, 'gu'),
  new RegExp(`[${SURNAME}]家(?:铺子|作坊|工坊|染坊|酒坊|油坊|铺|店|坊|窑)`, 'gu'),
];

export function nameIssues(text, entry, context) {
  const errors = [];
  if (typeof text !== 'string') return errors;
  const names = context?.worldNames; // [{id, name}]
  const catalog = context?.catalog;
  // 目录里全部物品名与别名先遮掉：物品自身名称、别名、材料和工具名不算人名地名。
  const itemWords = unique((catalog ?? []).flatMap((item) => [item.name, ...(item.aliases ?? [])]).filter((word) => typeof word === 'string' && word.length >= 2)).sort((a, b) => b.length - a.length);
  let masked = text;
  if (itemWords.length) masked = masked.replace(new RegExp(itemWords.map(esc).join('|'), 'gu'), (word) => '〇'.repeat(word.length));
  let provided = provenanceText(entry, context);
  if (Array.isArray(names)) {
    // 骨架或引用事实里出现的实体编号（origin、acquisition.seller……），其名称就是给定的出处。
    const mentioned = new Set(provided.match(/(?:npc|loc|bld)_[a-z0-9_]+/gu) ?? []);
    for (const id of strings(entry).concat(strings(context)).flatMap((text) => text.match(/(?:npc|loc|bld)_[a-z0-9_]+/gu) ?? [])) mentioned.add(id);
    for (const id of [entry.origin, entry.acquisition?.seller, context?.origin?.id]) if (typeof id === 'string') mentioned.add(id);
    provided += '|' + names.filter((row) => mentioned.has(row.id)).map((row) => row.name).join('|');
    for (const {name} of names) {
      if (name.length < 2 || !masked.includes(name) || provided.includes(name)) continue;
      errors.push(`正文出现名称「${name}」，起草上下文（骨架与引用事实）里没有它的出处。修复：删去；只写给定的产地和来源名称，写法与出处一致`);
    }
  }
  for (const pattern of PERSON_SHOP) {
    for (const match of masked.matchAll(pattern)) {
      if (provided.includes(match[0])) continue;
      errors.push(`正文出现人名或店名「${match[0]}」，起草上下文里没有出处。修复：删去，不杜撰工匠、店铺专名`);
    }
  }
  return unique(errors);
}

// 骨架（配方工具）里有匙、勺类器具：取样时舀一勺是确定动作。
function hasSpoonTool(entry, context) {
  const byId = new Map((context?.catalog ?? []).map((item) => [item.id, item]));
  const recipes = (context?.catalogRecipes ?? []).filter((row) => row.output?.item === entry.id);
  return recipes.some((row) => (row.tools ?? []).some((id) => /[匙勺]/u.test(byId.get(id)?.name ?? '')));
}

// 主入口：返回错误字符串数组，每条带字段名。context 的 worldNames（w3Context 附带）缺失时只做词形检查。
export function itemClaimIssues(draft, entry, context) {
  const supplied = strings(entry).join('|') + '|' + strings(context ?? {}).join('|') + '|' + (context?.recipe ? strings(context.recipe).join('|') : '') + '|' + ((context?.catalogRecipes ?? []).filter((row) => row.output?.item === entry.id).flatMap((row) => strings(row)).join('|'));
  const errors = [];
  for (const field of FIELDS) {
    const text = draft?.[field];
    if (typeof text !== 'string' || !text.trim()) continue;
    const sampling = field === 'inspection' && hasSpoonTool(entry, context);
    for (const message of [...amountIssues(text, supplied, {sampling}), ...nameIssues(text, entry, context)]) errors.push(`${field}：${message}`);
  }
  return errors;
}
