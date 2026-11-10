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
const WEAK_TAIL = '片段块条组份具头体面套副对粒束卷团';
// 单字中心词里，日常词也常用的字（规定、尺寸、对准、轮廓、柄……）：不单独当器具词，只认含它的两字及以上词形。
const COMMON_CHARS = '规尺准尖杆轮轴柄记说本灯石器斗架布刀子';
// 通用泛称里的布类词（单字“布”太常见，只认这些词）。
const CLOTH_WORDS = ['干布', '湿布', '软布', '净布', '布巾', '抹布', '毛巾'];
const TRIM_TAIL = /(?:小袋|小包|小罐|小瓶|小壶|小篮)?(?:一份|一段|一组|份)?$/u;

// 工作台类型 → 台本身隐含的设施字词（正文可直接使用，不必在骨架里列）。
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

// 动作 → 需要的器具类别。need(item) 判定骨架里某物品是否属于该类别。
// 剪、锯、凿、锥、锉、钻、锤……这类动作字本身就是器具中心词，由中心词机制统一覆盖，不在此重复。
export const ACTION_NEEDS = [
  { id: '布巾', verbs: /擦拭|拭去|拭净|擦净|擦去|擦干|揩净|(?<!吸)拭/u, label: '布巾类（带 cloth 标签的物品）', need: (item) => item.tags?.includes('cloth') },
  { id: '盖', verbs: /加盖|盖好|盖严|扣盖|合盖/u, label: '盖具（名称以“盖”结尾的物品）', need: (item) => /盖$/u.test(item.name) },
  { id: '量具', verbs: /画线|划线|弹线|量线|标线/u, label: '墨线或量具（规、尺、准类工具，或墨料）', need: (item) => /[规尺准]$|墨/u.test(item.name) },
];

// 用火动作与交代用语。
const HEAT = /加热|烧至|烧红|烧透|烧沸|烧熟|烧热|入炉|上炉|炉上|煮|熬|烙|焙|烘|煎|炒|锻|煨|炖|烤|焖|熔化|熔融|回火|热合|热处理|生火|引火|引燃|升火|点火|坐灶|灶上|灶下|入灶|小灶|小火|文火|温火|低火|稳火|微火|微沸|沸腾/gu;
// 复合词里的用火字不是动作（煮锅、锻锤、烘盘）。
const HEAT_COMPOUND = /[煮煎炒熬烘烙焙炖烤锻][锅盘盆壶罐炉架锤砧工]/gu;
const NEGATION = /(?:不|无|勿|免|切忌|禁)[^，。；、]{0,4}$/u;
const FIRE_ROLE = /炉用|灶用|引火|引燃|点燃|点火|生火|起火|升火|生炉|燃料|火源|供.{0,2}[火炉]|烧炉|烧尽|燃尽|烧完|烧旺|添炭|添柴|燃起|燃着/u;
const EXTERNAL = /另备|自备|自带|不随货|使用者(?:自)?备|须(?:由)?使用者/u;
const NOT_PROVIDED = /不(?:随)?附|不含|不带|不配/u;
const POUR = /滤过|滤入|滤进|倒入|倒进|注入|舀入|舀进|盛入|盛进|装入|灌入|承接/u;
const PROCESS = /搅|拌|煮|熬|煎|烘|烙|焙|炒|溶入|混合|加热|翻|揉|捣/u;

const unique = (list) => [...new Set(list)];
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const split = (text, pattern) => text.split(pattern).filter((part) => part.trim());

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
  return { heads, fuels, byId, nameRe, plainRe };
}

// 主入口：返回错误字符串数组。context.catalog 缺失时（旧调用方）不检查。
export function processIssues(text, entry, context) {
  const catalog = context?.catalog;
  if (!catalog || typeof text !== 'string') return [];
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
    const externalSentence = EXTERNAL.test(sentence);
    for (const rawClause of split(sentence, /[，、：]/u)) {
      // 非器具物品的全名（干木刨屑、软木薄片）整体遮掉，免得名里的字（刨、片）被当成器具词。
      const clause = vocab.plainRe ? rawClause.replace(vocab.plainRe, '〇') : rawClause;
      if (EXTERNAL.test(clause) || NOT_PROVIDED.test(clause)) continue;
      for (const [term, info] of vocab.heads) {
        if (seen.has(term) || !clause.includes(term)) continue;
        const at = [...clause.matchAll(new RegExp(esc(term), 'gu'))].map((match) => match.index).find((index) => {
          if (!info.strict) { if (allowedText.includes(term)) return false; }
          else if (!(index > 0 && FACILITY_CHARS.includes(clause[index - 1])) || allowedText.includes(clause.slice(index - 1, index + 1))) return false;
          return !NEGATION.test(clause.slice(0, index));
        });
        if (at === undefined) continue;
        if (info.container && externalSentence) continue;
        seen.add(term);
        errors.push(`正文出现骨架外器具「${term}」（${rawClause.trim()}）：器具须来自骨架 tools、materials 或工作台设施。修复：改用骨架已有的器具，或删去这一步；确需此器具就改骨架补进 tools/materials，不要只在正文里添加`);
      }
      for (const [word, type] of Object.entries(GENERIC_WORDS)) {
        if (!clause.includes(word) || seen.has(word)) continue;
        if (type === 'container' ? externalSentence || hasContainer : hasCloth) continue;
        seen.add(word);
        errors.push(`正文提到泛称器具「${word}」（${rawClause.trim()}）但骨架没有对应的${type === 'container' ? '容器' : '布巾'}。修复：写明“容器须使用者另备，不随货提供”，或改用骨架已有器具`);
      }
    }
    for (const rule of ACTION_NEEDS) {
      const match = sentence.match(rule.verbs);
      if (!match || seen.has(rule.id) || items.some(rule.need)) continue;
      seen.add(rule.id);
      errors.push(`正文动作「${match[0]}」（${sentence.trim()}）需要${rule.label}，骨架 tools/materials 里没有。修复：删去该动作，或改骨架补入对应物品`);
    }
  }

  // 二、另备容器是交付终点：装入之后不得再对内容物加工（如滤进另备容器后又沿锅缘搅匀）。
  const stirAfter = (sentence) => PROCESS.test(sentence) && !NEGATION.test(sentence.slice(0, sentence.search(PROCESS)));
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
  const masked = (vocab.nameRe ? text.replace(vocab.nameRe, '') : text).replace(HEAT_COMPOUND, '');
  const heats = [];
  for (const match of masked.matchAll(HEAT)) if (!NEGATION.test(masked.slice(Math.max(0, match.index - 8), match.index))) heats.push(match[0]);
  if (heats.length) {
    const fuelMaterial = items.filter((item) => vocab.fuels.has(item.id) && (entry.materials ?? []).some((row) => row.item === item.id));
    const verbs = unique(heats).join('、');
    if (!fuelMaterial.length) {
      errors.push(`正文写了用火（${verbs}）但骨架 materials 里没有燃料（带 fuel 标签的物品）。修复：改骨架补入燃料物品，或把加热步骤改成不用火的做法`);
    } else if (!sentences.some((sentence) => FIRE_ROLE.test(sentence) && fuelMaterial.some((item) => vocab.fuels.get(item.id).some((name) => sentence.includes(name))))) {
      errors.push(`正文写了用火（${verbs}）但没有交代火源。修复：补一句“以${fuelMaterial[0].name}引火/作火源”，且燃料只入炉灶、不混入成品`);
    }
  }
  return errors;
}

const cache = new WeakMap();
function vocabularyFor(context) {
  if (!cache.has(context.catalog)) cache.set(context.catalog, buildVocabulary(context.catalog, context.catalogRecipes ?? []));
  return cache.get(context.catalog);
}
