// 所有内容草稿共用的 L1 数字规则（由 content-pipeline.mjs 的 runContentPipeline 对每个 validateDraft 结果统一追加，
// 也供各工具的校验函数直接调用，如 w3-content.mjs 的 validateW3Draft）。纯函数，无 IO，不依赖项目其他模块。
//
// 规则 (a)：正文中的中文数字表达必须合法（parseChineseNumeral / numeralIssues）。
// 规则 (b)：正文中带总括词（全程、总耗时……）的时长，必须与骨架或事实里的 minutes 一致（durationIssues）。
//
// 规则 (c)：总时长由规则派生（stripOverallDuration / applyDerivedDuration，由 runContentPipeline 对所有工具的草稿统一应用，见下）。
//
// 设计取向：只在能确定是错的时候判错。拿不准（如「万一」「千里」这类以单位字开头的词，「万万」，「零件」里的零）一律不判。

import { unitIssues } from './content-units.mjs';
const DIGIT = '零〇一二两三四五六七八九';
const UNIT = '十百千万';
const RUN = new RegExp(`[${DIGIT}${UNIT}]+`, 'gu');
const isDigit = c => c !== undefined && DIGIT.includes(c);
const isNonZeroDigit = c => isDigit(c) && c !== '零' && c !== '〇';
const isZero = c => c === '零' || c === '〇';
const DIGIT_VALUE = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT_VALUE = { 十: 10, 百: 100, 千: 1000 };
const UNIT_RANK = { 十: 2, 百: 3, 千: 4 };
// 「零」接在这些字前时是词的一部分（零件、零碎、零星、零散、零头、零用、零钱、零售、零食、零落、零工），不算数字末尾的零。
const ZERO_WORD_NEXT = '件碎星散头用钱售食落工';
// 「千」接在这些字前是国际单位前缀（一百千米、四百千克、二十千帕），不是数字里的千位。
const SI_AFTER_KILO = '米克帕瓦焦赫伏安欧升卡';

// 时间单位统一表（L1 各规则与总时长删除正则共用，不各写一套）。值为分钟数。
// 小时、时辰：项目已定一时辰两小时（见规则 (b) 的换算依据）；钟头即小时（《现代汉语词典》「钟头」：小时）；刻钟：十五分钟（《现代汉语词典》「刻钟」）。
const MINUTE_FACTOR = { 分钟: 1, 小时: 60, 时辰: 120, 钟头: 60, 刻钟: 15 };
const UNIT_ALT = Object.keys(MINUTE_FACTOR).join('|');

const fail = reason => ({ ok: false, reason });
const good = value => ({ ok: true, value });

// 万以下的一节（千、百、十、个位）。zeroOk：节首允许「零」（只在「万」之后）。lead10：节首允许省略数字的「十」（十、十五）。
function parseSection(str, { zeroOk = false, lead10 = false } = {}) {
  let i = 0, rank = 5, value = 0, pairSeen = false;
  while (i < str.length) {
    const c = str[i];
    if (isZero(c)) {
      const afterBigUnit = i > 0 && (str[i - 1] === '百' || str[i - 1] === '千');
      if (!(i === 0 && zeroOk) && !afterBigUnit) return fail('「零」只能出现在百、千、万之后用来补位，此处位置不合法');
      const next = str[i + 1];
      if (next === undefined) return fail('末尾多出「零」');
      if (!isNonZeroDigit(next)) return fail('「零」之后必须直接接数字（不能连续两个零或接单位）');
      i++;
      continue;
    }
    if (isNonZeroDigit(c)) {
      const next = str[i + 1];
      if (isNonZeroDigit(next)) { // 概数：三五、七八十、十二三。连续超过两个数字且夹在单位结构里则判错。
        // 三个及以上数字连写（九九八十一、三七二十一、一五一十、一二三四）是乘法口诀、成语或逐位读法，形态上无法确定是错，不判（整串跳过）。
        if (pairSeen) return { skip: true };
        pairSeen = true; i++; continue;
      }
      pairSeen = false;
      if (next !== undefined && next in UNIT_RANK) {
        if (c === '两' && next === '十') return fail('「两十」不合法，应为二十');
        if (UNIT_RANK[next] >= rank) return fail(`单位「${next}」重复或顺序颠倒`);
        value += DIGIT_VALUE[c] * UNIT_VALUE[next]; rank = UNIT_RANK[next]; i += 2; continue;
      }
      if (next !== undefined) return fail('个位数字之后还有多余的数字或零');
      if (c === '两' && i === 0 && str.length === 1) return good(2);
      // 省略式：一百五=150、一千二=1200（末位数字接在百/千之后，且前面没有零补位）
      const prev = str[i - 1];
      value += DIGIT_VALUE[c] * (prev === '百' || prev === '千' ? UNIT_VALUE[prev] / 10 : 1); i++; continue;
    }
    // 单位字前没有数字
    if (c === '十' && i === 0 && lead10) { value += 10; rank = 2; i++; continue; }
    return fail(`单位「${c}」前缺少数字`);
  }
  return good(value);
}

// 解析一段只含 零〇一二两三四五六七八九十百千万 的连续数字串。返回 {ok:true,value} / {ok:false,reason} / {skip:true}（不作判断）。
export function parseChineseNumeral(str) {
  if (!str) return { skip: true };
  if ([...str].every(isDigit)) { // 纯数字：逐位读（二〇二六、一一、零）
    if (str.length === 1) return good(DIGIT_VALUE[str]);
    return good(Number([...str].map(c => DIGIT_VALUE[c]).join('')));
  }
  if (UNIT.includes(str[0]) && str[0] !== '十') return { skip: true }; // 百姓、千里、万一、万万：以百千万开头无数字，是词
  const wanCount = [...str].filter(c => c === '万').length;
  if (wanCount > 1) return { skip: true }; // 一万万、万万 等写法有歧义，不判
  const wan = str.indexOf('万');
  if (wan < 0) {
    if (isZero(str[0])) return fail('数字不能以「零」开头后再接单位');
    return parseSection(str, { lead10: true });
  }
  const left = parseSection(str.slice(0, wan), { lead10: true });
  if (!left.ok) return left;
  const rest = str.slice(wan + 1);
  if (!rest) return good(left.value * 10000);
  const right = parseSection(rest, { zeroOk: true });
  if (!right.ok) return right;
  if (rest.length === 1 && isNonZeroDigit(rest)) return good(left.value * 10000 + DIGIT_VALUE[rest] * 1000); // 一万五=15000
  return good(left.value * 10000 + right.value);
}

// 从正文里取出所有中文数字串：两（斤两的「两」）不在串首、其后又不接百千万时，视为单位而断开。
export function numeralRuns(text) {
  const runs = [];
  for (const m of text.matchAll(RUN)) {
    let start = 0, s = m[0];
    const base = m.index;
    const cut = [];
    for (let i = 1; i < s.length; i++) if (s[i] === '两' && !'百千万'.includes(s[i + 1] ?? '')) cut.push(i);
    const pieces = [];
    for (const at of [...cut, s.length]) { if (at > start) pieces.push([start, s.slice(start, at)]); start = at; }
    for (const [offset, piece] of pieces) {
      let value = piece, end = base + offset + piece.length;
      if (isZero(value.at(-1)) && value.length > 1 && ZERO_WORD_NEXT.includes(text[end] ?? '')) { value = value.slice(0, -1); end--; }
      if (value.length > 1 && value.at(-1) === '千' && SI_AFTER_KILO.includes(text[end] ?? '')) { value = value.slice(0, -1); end--; }
      runs.push({ text: value, index: base + offset, end });
    }
  }
  return runs;
}

function stringsOf(value, out = [], depth = 0) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value) && depth < 6) for (const v of value) stringsOf(v, out, depth + 1);
  else if (value && typeof value === 'object' && depth < 6) for (const [k, v] of Object.entries(value)) if (k !== 'id') stringsOf(v, out, depth + 1);
  return out;
}

// 修复建议：对不合法的数字串，逐个去掉一个「零」或单位字（位置错误的零、重复或缺数字的单位字）再解析；
// 只有去掉后能得到合法值、且各种去法得到的值唯一时才返回 {text,value}，否则返回 null（不猜）。零优先于单位字。
export function repairNumeral(str) {
  const chars = [...str], found = [];
  const order = [...chars.keys()].filter(i => isZero(chars[i])).concat([...chars.keys()].filter(i => UNIT.includes(chars[i])));
  for (const i of order) {
    const t = chars.filter((_, j) => j !== i).join('');
    const r = parseChineseNumeral(t);
    if (r.ok === true) found.push({ text: t, value: r.value });
  }
  if (!found.length || new Set(found.map(row => row.value)).size !== 1) return null;
  return found[0];
}
// 把建议写成报错后缀。unit：数字之后的时间单位（可无）；overall：数字前是否有总括词（只有总括时长才与骨架 minutes 比对）。
function hintFor(repaired, unit, overall, minutes) {
  if (!repaired) return '';
  const u = unit ?? '';
  if (unit && overall && Number.isFinite(minutes)) {
    if (Math.abs(repaired.value * MINUTE_FACTOR[unit] - minutes) < 1e-9) return `；应写作「${repaired.text}${u}」${String(repaired.value) === repaired.text ? '' : `或「${repaired.value}${u}」`}（与骨架 minutes=${minutes} 一致）`;
    return `；改正后的数值与骨架 minutes=${minutes} 不一致，以骨架为准，应写作「${minutes}分钟」`;
  }
  return `；应写作「${repaired.text}${u}」${String(repaired.value) === repaired.text ? '' : `或「${repaired.value}${u}」`}`;
}

// 规则 (a)：返回错误字符串数组。minutes：骨架 minutes（可选，只用于给建议）。
export function chineseNumeralIssues(text, minutes = null) {
  const errors = [];
  for (const run of numeralRuns(text)) {
    const result = parseChineseNumeral(run.text);
    const around = text.slice(Math.max(0, run.index - 2), Math.min(text.length, run.end + 2));
    if (result.skip) continue;
    const between = BETWEEN_PATTERN.exec(text.slice(run.end, run.end + 5));
    const overall = new RegExp(`${OVERALL}$`, 'u').test(text.slice(0, run.index));
    const directUnit = new RegExp(`^(${UNIT_ALT})`, 'u').exec(text.slice(run.end))?.[1];
    if (result.ok === true && run.text !== '一' && between && !BETWEEN_OK.includes(between[1]) && !BETWEEN_UNSURE.includes(between[1]) && !(between[2] === '小时' && between[3] && '候代'.includes(between[3]))) {
      errors.push(`数字「${run.text}」与时间单位「${between[2]}」之间夹了「${between[1]}」，写法不合法，概数应写「${run.text}多${between[2]}」或「${run.text}来${between[2]}」（原文「${around}」）${hintFor({ text: run.text, value: result.value }, between[2], overall, minutes)}`);
      continue;
    }
    const gap = new RegExp(`^[ \t\u00a0\u3000]+(${UNIT_ALT})`, 'u').exec(text.slice(run.end));
    if (result.ok === true && gap) { errors.push(`数字「${run.text}」与时间单位「${gap[1]}」之间夹了空白，中文正文里数字与单位必须紧连（原文「${around}」）${hintFor({ text: run.text, value: result.value }, gap[1], overall, minutes)}`); continue; }
    const typo = BETWEEN_ZHONG.exec(text.slice(run.end));
    if (result.ok === true && run.text !== '一' && typo && !ZHONG_OK.includes(typo[1])) { // 单字「一」常是词的一部分（一夜钟），与夹字规则一样整串跳过
      errors.push(`数字「${run.text}」与「钟」之间是「${typo[1]}」，应为「分」（错字），时长应写「分钟」（原文「${around}」）${hintFor({ text: run.text, value: result.value }, '分钟', overall, minutes)}`); continue; }
    if (result.ok === false) errors.push(`中文数字「${run.text}」不合法：${result.reason}（原文「${around}」）${hintFor(repairNumeral(run.text), directUnit, overall, minutes)}`);
    else if (text[run.end] === '钟' && /[十百千万]/.test(run.text)) errors.push(`数字「${run.text}」后直接接「钟」不合法，时长应写「分钟」（原文「${around}」）${hintFor({ text: run.text, value: result.value }, '分钟', overall, minutes)}`);
  }
  return errors;
}

// 数字与时间单位之间夹字。只认模块里已有的时间单位（分钟、小时、时辰，与规则 (b) 的 MINUTE_FACTOR 一致）。
// 夹字只看「数字串之后恰好一个汉字、再紧接时间单位」这一种形态；夹了两个及以上汉字的（如「个人小时」「好几」）形态太杂，不判。
// 合法的夹字白名单（现代汉语数量短语的常规成分，来源：《现代汉语词典》「多」「余」「来」「几」「个」「半」词条的数量用法）：
//   多、余、来、几：概数助词，写在整数之后、单位之前（九十多分钟、三百余小时、二十来分钟、三十几分钟）；
//   个：量词，用于时辰、小时之前（三个时辰、两个小时），口语也说「个分钟」，不判；
//   半：「一个半小时」「一个半时辰」中「个半」连用（夹两个字，本就不判），单字「半」也可能是「个半」的省写，拿不准，不判。
// 「左右」「上下」写在单位之后（九十分钟左右、二十分钟上下），不在数字与单位之间，不在此规则范围；它们若被写进中间（九十左右分钟）是两个字，按下面「夹两个字不判」处理。
// 拿不准、不判的情形：「人」（人小时、人分钟，是工时单位「三人小时」）；「小时」后面接「候、代」（三十岁小时候的事）；
//   数字串只有单字「一」：「一」常是词的一部分（一整小时、一定时辰、一些分钟、一再小时），与后面的字合成词，不是数字加夹字，拿不准，不判（多字数字如七十整分钟仍判）；
//   「更」「点」（三更时辰、三点小时，是更次、钟点与时间单位的相邻，不是夹字）；夹两个及以上汉字；阿拉伯数字后夹字（90加分钟，不属中文数字规则的范围）；刻钟、钟头等模块里没有的单位。
// 不在白名单的单个汉字（加、整、再、又……）一律判错：九十加分钟、七十整分钟。
const BETWEEN_OK = '多余来几个半';
const BETWEEN_UNSURE = '人更点';
// 数字与「钟」之间恰好夹一个汉字时，只有下列成分合法，其余一律判错（错字如份钟、纷钟，或别的不合时长写法）。白名单与依据：
//   分：分钟（标准写法）；
//   点：三点钟、钟点（《现代汉语词典》「点钟」：表示钟点的数量，如三点钟）；
//   刻：一刻钟（《现代汉语词典》「刻钟」：十五分钟）；
//   个：两个钟头（《现代汉语词典》量词「个」，用于钟头）。
//   量词（说的是钟这个物件，如「一座钟」，不是时长，拿不准，不判）：座、口、台、只、架、面。取自通行量词表中能修饰「钟」的量词（《现代汉语词典》座、口、台、只、架、面各条的钟表用法），不再扩充；
//   动量词（敲钟的次数，如「敲了三下钟」「两声钟」「撞了一通钟」）：下、声、响、通、记、遍、次（《现代汉语词典》各字的动量词用法，用于敲、撞、响钟）；
//   物量词（钟这个物件，如「一尊钟」「一副钟」「一套钟」「一对钟」「一枚钟」）：尊、枚、副、对、套（《现代汉语词典》量词条）；以上均不是时长，拿不准，不判；
//   更：五更钟，更次（时辰）语境，不是时长，不判。
// 夹两个及以上汉字的（如「三十个半钟」）形态太杂，维持不判。能推出数值时给出「分钟」的修复建议。
const ZHONG_OK = '分点刻个座口台只架面下声响通记遍次尊枚副对套更';
const BETWEEN_ZHONG = /^([\u4e00-\u9fff])钟/u;
const BETWEEN_PATTERN = new RegExp(`^([\u4e00-\u9fff])(${UNIT_ALT})(.?)`, 'u');

// 规则 (b)：时长。
// 换算依据：项目已定一时辰两小时，半个时辰=60分钟（world/design/a3-world-catalog.mjs 中 recipe_w3_fish_broth 的 boundary：
// 「D16.5要求做饭时间过去约半个时辰（一时辰两小时，半个时辰=60分钟）」）。故 1 时辰=120 分钟，1 小时=60 分钟。
// 只判带总括词的时长（全程、总耗时、总用时、总计、前后、整个过程、整件活计、全部；与 w3-content.mjs 原有的总耗时规则同一组词）：
// 配方里「浸泡约30分钟」「反复回炉保温，共约20分钟」「合计约120分钟」多为分步小计，只是总耗时的一部分，对应关系不确定，不判。故「共」「合计」只作修饰语、不作总括词。
// minutes 的来源只认条目自身的 minutes（或 facts/processFacts 对象里的 minutes）；有多个不同取值时视为不确定，不判。
const NUM = '(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万]+)';
// 总括词可连写（全程总耗时二百一十分钟），故整体重复一次以上。
const OVERALL = '(?:(?:总耗时|总用时|总计|全程|前后|整个过程|整件活计|全部)(?:(?:约|大约|为|需要|需|要|一共|共|工时|计))*\\s*)+';
// 第 4、5 组：概数助词（多、余、来、几），可在「个」前后（二十余个时辰、三个多小时）；第 6 组：时间单位。骨架 minutes 是确定值，总括时长带概数即不一致。
const DURATION = `${OVERALL}(?:(${NUM})个半|(半)个?|(${NUM})([多余来几])?个?([多余来几])?)(${UNIT_ALT})`;

export function skeletonMinutes(entry, context = null) {
  const found = new Set();
  for (const source of [entry, entry?.facts, entry?.processFacts, context?.facts]) {
    const v = source && typeof source === 'object' ? source.minutes : undefined;
    if (typeof v === 'number' && Number.isFinite(v)) found.add(v);
  }
  return found.size === 1 ? [...found][0] : null;
}

export function durationIssues(text, minutes) {
  const errors = [];
  if (!Number.isFinite(minutes)) return errors;
  for (const m of text.matchAll(new RegExp(DURATION, 'gu'))) {
    const approx = m[4] ?? m[5];
    if (approx) { errors.push(`正文时长「${m[0].trim()}」是概数（「${approx}」），而骨架 minutes=${minutes} 是确定值，不一致；总时长应写作「${minutes}分钟」，以骨架为准`); continue; }
    const factor = MINUTE_FACTOR[m[6]];
    let amount;
    if (m[2]) amount = 0.5;
    else {
      const raw = m[1] ?? m[3];
      let n;
      if (/^\d/.test(raw)) n = Number(raw);
      else { const p = parseChineseNumeral(raw); if (!p.ok) continue; n = p.value; } // 数字本身不合法由规则 (a) 报
      amount = m[1] !== undefined ? n + 0.5 : n;
    }
    if (Math.abs(amount * factor - minutes) > 1e-9) errors.push(`正文时长「${m[0].trim()}」与骨架 minutes=${minutes} 不一致（时辰按一时辰两小时、半个时辰=60分钟换算）；应写作「${minutes}分钟」${minutes % factor === 0 && factor > 1 ? `或「${minutes / factor}${m[6]}」` : ''}，以骨架为准`);
  }
  return errors;
}

// 阿拉伯数字：中文正文里数字与时间单位之间夹空白、或「分钟」写成别字（90份钟）。无汉字的文本（英文）不判。
export function arabicDurationIssues(text, minutes = null) {
  const errors = [];
  if (!/\p{Script=Han}/u.test(text)) return errors;
  for (const m of text.matchAll(new RegExp(`([0-9]+(?:[.][0-9]+)?)(?:[ \u00a0\u3000]+(${UNIT_ALT})|([\u4e00-\u9fff])钟)`, 'gu'))) {
    if (m[3] && ZHONG_OK.includes(m[3])) continue;
    const overall = new RegExp(`${OVERALL}$`, 'u').test(text.slice(0, m.index));
    const repaired = { text: m[1], value: Number(m[1]) };
    errors.push(m[2]
      ? `数字「${m[1]}」与时间单位「${m[2]}」之间夹了空白，中文正文里数字与单位必须紧连${hintFor(repaired, m[2], overall, minutes)}`
      : `数字「${m[1]}」与「钟」之间是「${m[3]}」，应为「分」（错字），时长应写「分钟」${hintFor(repaired, '分钟', overall, minutes)}`);
  }
  return errors;
}

// 规则 (c)：总时长是骨架事实（minutes），由代码写入，不交给模型。
// 做法：模型起草后，代码确定性地删去正文里所有「总括词＋时长」短语（含概数、空格、错字写法），再在末尾追加派生句「全程N分钟。」。
// 选这种而不是「提示里禁止＋L1 判错」的理由：模型不遵守提示时，后者要多花请求重写，且每出一种新写法又要补一条拦截规则；
// 前者无论模型写成什么样（九十 分钟、五十份钟、七十多分钟），最终总时长都等于骨架，一类错误整体消失，不多花请求。
// 数字统一写阿拉伯数字加「分钟」，紧连，无空格，不用中文数字：避开中文数字的合法性与写法分歧（九十、九零）。
// 只处理总括词引导的时长；分步时长（浸泡约30分钟）不动。
// 删除只作用于「纯总时长分句」：分句里除总括词、约、左右和时长之外没有别的内容（可后接一个括号注释，见下）。
// 混有其他内容的（全程需要30分钟浸泡、全程七十分钟内完成）删掉会连带删掉有用的话，不删，改由 L1 判错（impureDurationIssues），要求总时长单独成句，之后走重写。
// 括号注释（全角或半角）说明总时长包含哪些环节（前后约三十五分钟（含浸软等待）），属合理内容：括号里没有时长数字时，纯总时长分句后带一个括号注释不判错；括号里再出现时长数字则判错。
const SP = '[ \u00a0\u3000]';
const DURATION_BODY = `(?:${NUM}|半)个?${SP}*[多余来几]?个?${SP}*[\u4e00-\u9fff]?(?:${UNIT_ALT}|钟)(?:左右|上下)?`;
const NOTE = '(?:[（(][^（）()]*[）)])';
const STRIP_FIND = new RegExp(`${OVERALL}${DURATION_BODY}`, 'u');
const STRIP_PURE = new RegExp(`^${SP}*${OVERALL}${DURATION_BODY}${SP}*$`, 'u');
const STRIP_PURE_NOTE = new RegExp(`^${SP}*(${OVERALL}${DURATION_BODY})${SP}*(${NOTE})${SP}*$`, 'u');
const NOTE_DURATION = new RegExp(`(?:${NUM}|半)个?${SP}*[多余来几]?个?${SP}*[\u4e00-\u9fff]?(?:${UNIT_ALT}|钟)`, 'u');
// 按分句标点切分；括号内的标点不切（含浸软、等待）。返回 [{clause, delim}]。
function splitClauses(text) {
  const out = [];
  let cur = '', depth = 0;
  for (const ch of text) {
    if ('（('.includes(ch)) depth++;
    else if ('）)'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && '，、；。！？'.includes(ch)) { out.push({ clause: cur, delim: ch }); cur = ''; } else cur += ch;
  }
  out.push({ clause: cur, delim: '' });
  return out;
}
// 纯总时长分句：返回 {body, note}（note 可为 null）；否则 null。
function pureTotal(clause) {
  if (STRIP_PURE.test(clause)) return { body: clause.trim(), note: null };
  const m = STRIP_PURE_NOTE.exec(clause);
  return m ? { body: m[1].trim(), note: m[2] } : null;
}
// 合规：纯总时长分句、括号里无时长数字、时长被识别且等于骨架 minutes、非概数、写法无错（空白、错字等）。
function compliantTotal(clause, minutes) {
  const pure = pureTotal(clause);
  if (!pure || (pure.note && NOTE_DURATION.test(pure.note))) return false;
  return new RegExp(DURATION, 'u').test(pure.body)
    && !durationIssues(pure.body, minutes).length && !chineseNumeralIssues(pure.body, minutes).length && !arabicDurationIssues(pure.body, minutes).length;
}
const tidy = text => text
  .replace(/[，、；]\s*(?=[，、；。！？]|$)/gu, '') // 删除后遗留的孤立逗号
  .replace(/(^|[。！？])\s*[，、；]+/gu, '$1')
  .replace(/([。！？])[。！？]+/gu, '$1').replace(/^[。！？\s]+/u, '').trim();
const join = list => list.map(c => c.clause + c.delim).join('');
export function deriveDurationSentence(minutes) { return `全程${minutes}分钟。`; }
export function stripOverallDuration(text) {
  return tidy(join(splitClauses(text).filter(c => !pureTotal(c.clause))));
}
// L1：总括时长混在其他内容的分句里，或括号注释里又出现时长。只在骨架 minutes 已知（派生会处理总时长句）时判。
export function impureDurationIssues(text, minutes) {
  const errors = [];
  if (!Number.isFinite(minutes)) return errors;
  for (const { clause } of splitClauses(text)) {
    const found = STRIP_FIND.exec(clause);
    if (!found) continue;
    const pure = pureTotal(clause);
    if (!pure) errors.push(`总时长「${found[0].trim()}」混在其他内容里（原文「${clause.trim()}」）；总时长须单独成句，由系统按骨架生成，请删去这个总时长，只保留其他内容`);
    else if (pure.note && NOTE_DURATION.test(pure.note)) errors.push(`总时长「${found[0].trim()}」后的括号注释里不得再出现时长数字（原文「${clause.trim()}」）；括号里只能说明包含哪些环节`);
  }
  return errors;
}
// 对草稿的 fields（默认 process）应用：骨架 minutes 为有限数时处理总时长。无 minutes 的条目原样返回。幂等。
//  - 正文里已有一句合规的纯总时长分句（L1 不报错、数值等于 minutes，可带括号注释）：保留这一句，不追加，其余纯总时长分句删去；
//  - 否则：删去所有纯总时长分句，追加派生句「全程N分钟。」。
export function applyDerivedDuration(draft, entry, fields = ['process']) {
  const minutes = skeletonMinutes(entry);
  if (!draft || typeof draft !== 'object' || !Number.isFinite(minutes)) return draft;
  const out = { ...draft };
  for (const field of fields) {
    if (typeof out[field] !== 'string' || !out[field].trim()) continue;
    let kept = false;
    const list = splitClauses(out[field]).filter(c => {
      if (!pureTotal(c.clause)) return true;
      if (!kept && compliantTotal(c.clause, minutes)) { kept = true; return true; }
      return false;
    });
    let body = tidy(join(list));
    if (body && !/[。！？]$/u.test(body)) body += '。';
    out[field] = kept ? body : body + deriveDurationSentence(minutes);
  }
  return out;
}

// 共用入口：draft 为草稿对象，entry 为骨架，context 为引用事实。返回错误字符串数组（可能为空）。
export function numeralIssues(draft, entry = null, context = null) {
  if (!draft || typeof draft !== 'object') return [];
  const errors = [...unitIssues(draft, entry, context)];
  const minutes = skeletonMinutes(entry, context);
  for (const text of stringsOf(draft)) {
    errors.push(...chineseNumeralIssues(text, minutes));
    errors.push(...durationIssues(text, minutes));
    errors.push(...arabicDurationIssues(text, minutes));
    errors.push(...impureDurationIssues(text, minutes));
  }
  return [...new Set(errors)];
}
