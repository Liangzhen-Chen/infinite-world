// 物品正文（description、inspection、storage）的 L1 确定性检查。纯函数，无 IO。口径见 docs/L4-必查清单.md 第 9、11、14、15 条。
//
// 一、storage 越界：具体处置动作（摊开阴干、放冷水里镇着）、期限（与 shelfLifeDays 不符；骨架为空时写期限或“无期限”）、后果说法（否则会……）。
//     一般存放建议（避潮、避晒、避霜、阴凉、防压）放行。该建议能否由材质推出，无法确定性判断，交 L4。
// 二、骨架外器具、包装、收纳：复用 w3-process-check 的目录派生词表（processIssues 的器具部分），再加包装收纳词（布袋、木架、陶罐、木盒……）。
//     依据 = 物品自己、它的配方骨架（tools、materials、副产品、工作台设施）、“容器须使用者另备”声明。
// 三、制作痕迹与配方不符：写了制作痕迹（锻打、刨面、缝线、编织……），而物品没有以它为产出的配方，判错；有配方时，痕迹对应的工序字
//     （锻、刨、缝、编……）必须出现在配方的 processFacts、工具名或材料名里。
// 不做（交 L4）：骨架外用途、功效、材质与存放建议是否匹配——需要理解语义，词表做不到确定性判断，硬做只会误报或漏报。
//
// 规则层只有通用词表，不含条目 id；器具词表来自目录标签（见 w3-process-check.mjs）。

import {processIssues, quantitiesIn, vocabularyFor, declaredSpans, negatedAt, within, WORKSTATION_FACILITIES} from './w3-process-check.mjs';

const FIELDS = ['description', 'inspection', 'storage'];
const unique = (list) => [...new Set(list)];
const split = (text, pattern) => text.split(pattern).filter((part) => part.trim());

// ── 一、storage ──
// 具体处置动作：把东西怎么摆、怎么弄的做法。（避潮、避晒、避霜、阴凉、防压是一般建议，不在此列。）
const DISPOSAL = /摊开|摊平|摊晾|阴干|晾干|晾晒|晾开|晒干|翻晾|翻动|翻面|翻松|拨松|拍松|镇着|冷水|泡水|浸水|浸泡|擦净|擦拭|擦干|拭去|拭干|抹油|涂油|上油|刷净|洗净|清洗|烘干|烘烤|煮沸|蒸煮|倒掉|丢弃|弃置|定期|常翻|勤翻|每隔|每日|每天|每周|每月|受潮后|发潮后|结块后|生霉后|变质后|潮后|湿后|加盖|盖好|盖严|覆盖|覆干布/u;
// 回避词与处置词之间只能是被回避的并列对象（用 、与和及 连起来的短项）：“避免受潮、浸水与重压”里的浸水是被避开的；“防尘加盖”“防虫盖严”里的加盖、盖严是另一个动作，照判。
// 否定词“不”不在这里：否定由 negatedAt 处理。
const AVOID = /(?:避免|避开|避|勿|切勿|防止|防|不要|不可|不宜|不得|忌|严禁|禁止)(?:[^，；。、与和及]{1,4}[、与和及])*$/u;
// 后果说法：否则会……、以免……、容易……。
const CONSEQUENCE = /否则|不然|以免|免得|免致|一旦|就会|便会|必会|将会|(?:会|易|容易|极易|易于)(?:发霉|霉变|变质|腐烂|生锈|锈蚀|受潮|开裂|裂开|变形|结块|生虫|损坏|折断|劣化|变色|变软|发潮|变味|走味|失效|长霉|虫蛀|干裂|脆裂|发臭|酸败)/u;
// 期限：词形（数字+天日周月年季）另由 quantitiesIn 取；这里是不带数字的期限与“永久”说法。
const PERIOD_WORDS = /数日|数天|几日|几天|半月|半年|一季|整年|年底|长久|久存|久放|永久|永不|无期限|没有期限|不限期|不会变质|不易变质|不变质|耐存|耐放|耐久存|可存放很久|存放很久|存很久/u;
const PERIOD_YEAR = /(?:\d+|[一二两三四五六七八九十百半]+)(?:个)?(?:年|季度|月)(?![份])/u;

export function storageIssues(text, entry) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) return errors;
  for (const sentence of split(text, /[。；！？\n]/u)) {
    // 回避框架（避免受潮、浸水与重压；勿暴晒；防压）里的动作对象是要避开的东西，不是处置做法：取本分句（以逗号、分号断开，顿号不断）里处置词之前的文字判断。
    // 句内每个处置词逐个判：前一个落在回避或否定框架里，不能连带放过同句后面的真处置（“勿浸水，晾干后折叠”）。
    const disposal = [...sentence.matchAll(new RegExp(DISPOSAL.source, 'gu'))].find((hit) => !AVOID.test(sentence.slice(0, hit.index).split(/[，；]/u).at(-1)) && !negatedAt(sentence, hit.index));
    if (disposal) errors.push(`storage 出现具体处置做法「${disposal[0]}」（${sentence.trim()}）：只允许避潮、避晒、避霜、阴凉、防压这类一般存放建议。修复：删去处置做法`);
    const consequence = sentence.match(CONSEQUENCE);
    if (consequence) errors.push(`storage 出现后果说法「${consequence[0]}」（${sentence.trim()}）：骨架里没有的后果不写。修复：只留一般存放建议，删去“否则会……”这类说法`);
  }
  const shelf = entry.shelfLifeDays;
  const quantities = quantitiesIn(text).filter((quantity) => quantity.dim === 'days' && !/[第每隔]$/u.test(text.slice(0, quantity.index)));
  const bad = quantities.filter((quantity) => typeof shelf !== 'number' || Math.abs(quantity.base - shelf) > 0.5);
  for (const quantity of bad) errors.push(typeof shelf === 'number'
    ? `storage 写了期限「${quantity.raw}」，与骨架保存期 ${shelf} 天不符。修复：改成骨架保存期，或删去期限`
    : `storage 写了期限「${quantity.raw}」，骨架没有保存期（shelfLifeDays 为空）。修复：删去期限；空字段不等于永不变质，也不写“无期限”`);
  const words = text.match(PERIOD_WORDS) ?? text.match(PERIOD_YEAR);
  if (words) errors.push(`storage 写了期限类说法「${words[0]}」：${typeof shelf === 'number' ? `保存期只能写骨架的 ${shelf} 天` : '骨架没有保存期，不写期限，也不写“无期限”“可久存”'}。修复：删去`);
  return errors;
}

// ── 二、包装收纳 ──
// 如实否定说明：容器另备、不随货、不在本件范围内、不含/不附/不带/不提供/不包括。写这类说明的句子里，泛称容器不是引入。
const DECLARATION = /另备|自备|使用者|不随货|不在[^，。；]{0,8}范围|不含|不附|不带|不配|不提供|不包括|不包含|不供/u;
// 材质字+收纳字（布袋、木架、陶罐、木盒、皮囊……）与泛称（容器、器皿、包装）。物品全名、别名先整体遮掉（宽口滤布、小罐份、分格小瓶木箱）。
const PACK = /(?:[布麻皮草木陶瓷铁铜竹藤纸油毡]{1,2})(?:袋|囊|架|箱|匣|筒|筐|篮|盒|罐|桶|盘|碗|盆|壶|瓶|缸|坛)|容器|器皿|包装|包裹布|垫布/gu;

function packagingIssues(text, allowedText, vocab, evidence = '') {
  const errors = [];
  const masked = vocab.allNameRe ? text.replace(vocab.allNameRe, (name) => '〇'.repeat(name.length)) : text;
  for (const sentence of split(masked, /[。；！？\n]/u)) {
    const clauses = split(sentence, /[，、：]/u).map((clause) => ({clause, spans: declaredSpans(clause)}));
    const declared = clauses.flatMap(({clause, spans}) => spans.map(([from, to]) => clause.slice(from, to))).join('|');
    const generic = /容器|器皿/u.test(declared);
    for (const {clause, spans} of clauses) {
      for (const match of clause.matchAll(PACK)) {
        const word = match[0], kind = word.at(-1);
        // 依据：物品自己或配方骨架里有名字含该收纳词（或同一收纳字）的物品；泛称（容器、器皿、包装）只能靠“另备”声明。
        const isGeneric = /^(?:容器|器皿|包装)$/u.test(word);
        if (!isGeneric && (allowedText.includes(word) || allowedText.includes(kind) || evidence.includes(word))) continue;
        if (within(spans, match.index) || declared.includes(word) || (generic && isGeneric) || negatedAt(clause, match.index)) continue;
        if (isGeneric && DECLARATION.test(sentence)) continue;
        errors.push(`出现骨架外包装、收纳或容器「${word}」（${clause.trim()}）：物品和配方骨架里没有。修复：删去；确需写就如实说明“容器须使用者另备，不随货提供”`);
      }
    }
  }
  return unique(errors);
}

// ── 三、制作痕迹 ──
// [配方里必须出现的工序字, 正文里的制作痕迹写法]。写法取“痕迹/成品状态”而不是裸动词（“煮食用”“切片”是用法，不是制作痕迹）。
const TRACES = [
  ['锻', /锻打|锻造|锻成|锻制|锻痕|锻面/u], ['回火', /回火/u], ['淬', /淬火|淬口|淬过|淬硬/u], ['刨', /刨面|刨平|刨光|刨痕|刨制|刨出/u],
  ['锤', /锤痕|锤击|锤打|捶打|锤面|锤成/u], ['凿', /凿痕|凿出|凿成|凿制|凿槽/u], ['锯', /锯痕|锯口|锯成|锯制|锯出/u], ['锉', /锉痕|锉平|锉面|锉制|锉出/u],
  ['削', /削成|削出|削制|削痕|削面/u], ['刻', /刻出|刻痕|刻制|雕刻/u], ['缝', /缝制|缝合|缝成|针脚/u], ['编', /编织|编成|编结|编制/u],
  ['织', /织成|织造|织纹/u], ['烙', /烙印|烙痕|烙制/u], ['煮', /煮制|煮成/u], ['熬', /熬制|熬煮/u], ['煎', /煎制|煎成/u], ['炒', /炒制/u],
  ['烘', /烘烤|烘制|烘干/u], ['烧', /烧制|烧结|烧成/u], ['磨', /磨制|打磨|研磨|磨光|磨痕|磨成/u], ['捣', /捣碎|捣制/u], ['腌', /腌制/u], ['酿', /酿制/u],
  ['染', /染成|染制|染色/u], ['压', /压制|压印|压纹|压成/u], ['铸', /铸成|铸造|浇铸/u], ['焊', /焊接|焊缝|焊痕/u], ['钉', /钉痕|钉制|钉合|钉成/u], ['裁', /裁剪|裁成|裁制/u],
];

// 制作痕迹只在“描述这件物品被做成时留下的状态”的框架里判：
//   前框架：经、经过、留有、留下、保留、带有、遗留、可见、仍有、尚有、有……（本分句里处置词前六字内）；
//   后框架：……时的、……过的、……后的、……而成、……制成、……留下的；痕迹词后紧跟成形状态谓词（平整、光洁、齐整、均匀……）；
//   痕迹名词本身（锤痕、刨痕、针脚……）就是留下的状态，不需要框架。
// 供、用于、可、能、便于、不把……是用途、功能、否定框架，没有上面的框架，所以不判；“缝合线、锤面”这类名词部件同理（没有“经/留有/保留”）。
const TRACE_BEFORE = /(?:经过?|留有|留着|留下|保留|带有|遗留|可见|仍有|尚有|有)[^，。；！？\n]{0,6}$/u;
// 后框架还有一类：痕迹词后紧跟成形状态谓词（刨面平整、表面光洁、边口齐整）——描述做成后的状态。
const TRACE_AFTER = /^(?:时的|过的|后的|而成|所成|制成|成型|所留|留下|平整|平滑|光滑|光洁|齐整|匀整|均匀|匀称|圆润|紧实|整齐|平直|规整|细密)/u;
const TRACE_NOUN = /(?:痕|针脚)$/u;
function inTraceFrame(text, match) {
  if (TRACE_NOUN.test(match[0])) return true;
  const before = text.slice(0, match.index).split(/[，。；！？\n、]/u).at(-1);
  return TRACE_BEFORE.test(before) || TRACE_AFTER.test(text.slice(match.index + match[0].length));
}

function traceIssues(text, recipe, vocab) {
  const errors = [];
  const evidence = recipe ? [recipe.name, recipe.processFacts, ...(recipe.tools ?? []).map((id) => vocab.byId.get(id)?.name), ...(recipe.materials ?? []).map((row) => vocab.byId.get(row.item)?.name)].filter(Boolean).join('') : '';
  for (const [stem, pattern] of TRACES) {
    const match = [...text.matchAll(new RegExp(pattern.source, 'gu'))].find((hit) => inTraceFrame(text, hit) && !negatedAt(text, hit.index));
    if (!match) continue;
    if (!recipe) errors.push(`正文写了制作痕迹「${match[0]}」，但这件物品没有以它为产出的配方（原料、购得物不写制作痕迹）。修复：删去制作痕迹`);
    else if (!evidence.includes(stem)) errors.push(`正文写了制作痕迹「${match[0]}」，配方骨架（processFacts、工具、材料）里没有对应的「${stem}」。修复：删去，或改成配方里有的工序`);
  }
  return errors;
}

// 器具部分复用 processIssues（目录派生词表）。物品正文只取“骨架外器具”与“泛称器具”两类：
// 动作隐含的器具（划线需要量具）在物品正文里多是成品的用途说明，交 L4；单字器具词（剪、筛、针）在物品正文里常是动词或部位（可剪作鞋垫、穿针），不判，只判全名与两字以上词形。
function utensilIssues(text, skeleton, context, evidence) {
  return processIssues(text, skeleton, context).filter((message) => {
    const generic = message.match(/^正文提到泛称器具「([^」]+)」/u)?.[1];
    if (generic !== undefined) return !evidence.includes(generic) && !DECLARATION.test(message.match(/（([^）]*)）/u)?.[1] ?? '');
    const term = message.match(/^正文出现骨架外器具「([^」]+)」/u)?.[1];
    return term !== undefined && term.length >= 2 && !evidence.includes(term);
  });
}

// 用途表述的数据出处：物品自己的事实字段（use、seasonality、acquisition 里的文字），以及它作为 tools 或 materials 出现的那些配方
// （配方名、产出物名、工具名、材料名）。正文里提到的别的器物，名字出现在这些出处里才算有依据；不整类放过“用于……”句式。
function evidenceText(entry, context, vocab) {
  const strings = (value) => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
  const named = (id) => { const item = vocab.byId.get(id); return item ? [item.name, ...(item.aliases ?? [])] : []; };
  const used = (context.catalogRecipes ?? []).filter((row) => (row.tools ?? []).includes(entry.id) || (row.materials ?? []).some((material) => material.item === entry.id));
  return [
    ...strings(entry.use), ...strings(entry.seasonality), ...strings(entry.acquisition),
    ...used.flatMap((row) => [row.name, ...named(row.output?.item), ...(row.tools ?? []).flatMap(named), ...(row.materials ?? []).flatMap((material) => named(material.item))]),
  ].filter(Boolean).join('|');
}

// 主入口：返回错误字符串数组，每条带字段名。draft 为物品草稿，entry 为物品骨架行，context 须带 catalog、catalogRecipes（w3Context/journeyContext 附带）。
export function itemTextIssues(draft, entry, context) {
  const catalog = context?.catalog;
  if (!Array.isArray(catalog)) throw new Error('itemTextIssues: context.catalog 缺失（须由 w3Context/journeyContext 附带物品目录），物品正文检查不能静默跳过');
  const vocab = vocabularyFor(context);
  // 同一产出可能同时有已发布配方（不带 processFacts）和骨架配方（带 processFacts）：取带 processFacts 的。
  const producing = (context.catalogRecipes ?? []).filter((row) => row.output?.item === entry.id);
  const recipe = producing.find((row) => typeof row.processFacts === 'string') ?? producing[0];
  const skeleton = {id: entry.id, workstation: recipe?.workstation, tools: recipe?.tools ?? [], materials: recipe?.materials ?? [], byproducts: recipe?.byproducts ?? [], output: {item: entry.id}};
  const ids = unique([...skeleton.tools, ...skeleton.materials.map((row) => row.item), ...skeleton.byproducts.map((row) => row.item), entry.id]);
  const allowedText = [...ids.map((id) => vocab.byId.get(id)).filter(Boolean).flatMap((item) => [item.name, ...(item.aliases ?? [])]), ...(WORKSTATION_FACILITIES[skeleton.workstation] ?? [])].join('');
  const evidence = evidenceText(entry, context, vocab);
  const errors = [];
  for (const field of FIELDS) {
    const text = draft?.[field];
    if (typeof text !== 'string' || !text.trim()) continue;
    const found = [
      ...utensilIssues(text, skeleton, context, evidence),
      ...packagingIssues(text, allowedText, vocab, evidence),
      ...traceIssues(text, recipe, vocab),
      ...(field === 'storage' ? storageIssues(text, entry) : []),
    ];
    for (const message of unique(found)) errors.push(`${field}：${message}`);
  }
  return errors;
}
