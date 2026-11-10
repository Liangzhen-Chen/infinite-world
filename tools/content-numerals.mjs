// 所有内容草稿共用的 L1 数字规则（由 content-pipeline.mjs 的 runContentPipeline 对每个 validateDraft 结果统一追加，
// 也供各工具的校验函数直接调用，如 w3-content.mjs 的 validateW3Draft）。纯函数，无 IO，不依赖项目其他模块。
//
// 规则 (a)：正文中的中文数字表达必须合法（parseChineseNumeral / numeralIssues）。
// 规则 (b)：正文中带总括词（全程、总耗时……）的时长，必须与骨架或事实里的 minutes 一致（durationIssues）。
//
// 设计取向：只在能确定是错的时候判错。拿不准（如「万一」「千里」这类以单位字开头的词，「万万」，「零件」里的零）一律不判。

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
        if (pairSeen) return fail('连续数字过多');
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

// 规则 (a)：返回错误字符串数组。
export function chineseNumeralIssues(text) {
  const errors = [];
  for (const run of numeralRuns(text)) {
    const result = parseChineseNumeral(run.text);
    const around = text.slice(Math.max(0, run.index - 2), Math.min(text.length, run.end + 2));
    if (result.ok === false) errors.push(`中文数字「${run.text}」不合法：${result.reason}（原文「${around}」）`);
    else if (text[run.end] === '钟' && /[十百千万]/.test(run.text)) errors.push(`数字「${run.text}」后直接接「钟」不合法，时长应写「分钟」（原文「${around}」）`);
  }
  return errors;
}

// 规则 (b)：时长。
// 换算依据：项目已定一时辰两小时，半个时辰=60分钟（world/design/a3-world-catalog.mjs 中 recipe_w3_fish_broth 的 boundary：
// 「D16.5要求做饭时间过去约半个时辰（一时辰两小时，半个时辰=60分钟）」）。故 1 时辰=120 分钟，1 小时=60 分钟。
// 只判带总括词的时长（全程、总耗时、总用时、总计、前后、整个过程、整件活计、全部；与 w3-content.mjs 原有的总耗时规则同一组词）：
// 配方里「浸泡约30分钟」「反复回炉保温，共约20分钟」「合计约120分钟」多为分步小计，只是总耗时的一部分，对应关系不确定，不判。故「共」「合计」只作修饰语、不作总括词。
// minutes 的来源只认条目自身的 minutes（或 facts/processFacts 对象里的 minutes）；有多个不同取值时视为不确定，不判。
const MINUTE_FACTOR = { 分钟: 1, 小时: 60, 时辰: 120 };
const NUM = '(?:\\d+(?:\\.\\d+)?|[零〇一二两三四五六七八九十百千万]+)';
const OVERALL = '(?:总耗时|总用时|总计|全程|前后|整个过程|整件活计|全部)(?:(?:约|大约|为|需要|需|要|一共|共|工时|计))*\\s*';
const DURATION = `${OVERALL}(?:(${NUM})个半|(半)个?|(${NUM})个?)(分钟|小时|时辰)`;

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
    const factor = MINUTE_FACTOR[m[4]];
    let amount;
    if (m[2]) amount = 0.5;
    else {
      const raw = m[1] ?? m[3];
      let n;
      if (/^\d/.test(raw)) n = Number(raw);
      else { const p = parseChineseNumeral(raw); if (!p.ok) continue; n = p.value; } // 数字本身不合法由规则 (a) 报
      amount = m[1] !== undefined ? n + 0.5 : n;
    }
    if (Math.abs(amount * factor - minutes) > 1e-9) errors.push(`正文时长「${m[0].trim()}」与骨架 minutes=${minutes} 不一致（时辰按一时辰两小时、半个时辰=60分钟换算）`);
  }
  return errors;
}

// 共用入口：draft 为草稿对象，entry 为骨架，context 为引用事实。返回错误字符串数组（可能为空）。
export function numeralIssues(draft, entry = null, context = null) {
  if (!draft || typeof draft !== 'object') return [];
  const errors = [];
  const minutes = skeletonMinutes(entry, context);
  for (const text of stringsOf(draft)) {
    errors.push(...chineseNumeralIssues(text));
    errors.push(...durationIssues(text, minutes));
  }
  return [...new Set(errors)];
}
