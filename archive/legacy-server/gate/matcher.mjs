// 屏蔽词匹配 matchBlocklist（卷二 §2.9 第 6 条"闸内三步算法（唯一定义）"；groupApi gate/matcher.mjs#matchBlocklist callers outputGate、aiGate；体检 K6-82）。
// 步骤：① NFC；② 简单大小写折叠（kernel 码点表，按码点）；③ 对规范化后文本逐 needle 做子串查找；needle 登记时经同一规范化并冻结。
// 命中列表 [{start, end, origStart, origEnd, categories}]：start/end 是规范化空间的码点半开区间；origStart/origEnd 按"输出码点 → 原文码点区间"对照表
// 映射回原文的码点半开区间（命中段取首码点所在区间起点与末码点所在区间终点）；按 start 升序，重叠或相邻的合并为一段（categories 取并集、升序）。
// 不用正则；一次调用返回全部命中。实现与逐个 indexOf 同结果。
// NFC 的"输出码点 → 原文区间"对照需要按字素簇逐簇规范化（Intl.Segmenter 切簇、簇内 normalize），ops.mjs 闭集七函数里没有带对照表的 NFC，
// 所以本文件内自做，回报报李白（卷二 :876 matcher 行的闭集只写 nfc、mapCodePoints、indexOf）。
// 码点折叠表来自 kernelApi `codepointTables`（卷二 §2.7 :642，kernel/load/codepoint-tables.mjs 读 world/i18n/casefold.json，unicode.org CaseFolding C+S 全表），
// 由装配经 installBlocklist 交入；折叠表必给，没装词表即不能匹配（fail closed）。表里没有的码点不变（无大小写之分，如汉字）。

import { textValue } from '../textcore/text-types.mjs';
import { fail } from './fail.mjs';

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** @type {Map<string, {needles: ReadonlyArray<{cps: readonly number[], category: string}>, casefold: ReadonlyMap<number, readonly number[]>}>} */
const installed = new Map();

/**
 * 规范化并建坐标对照。
 * @param {string} s
 * @param {ReadonlyMap<number, readonly number[]>} casefold
 * @returns {{cps: number[], origStart: number[], origEnd: number[]}}
 */
export function normalizeWithMap(s, casefold) {
  const cps = [];
  const origStart = [];
  const origEnd = [];
  let at = 0;
  for (const { segment } of SEGMENTER.segment(s)) {
    const width = Array.from(segment).length;
    for (const ch of segment.normalize('NFC')) {
      const cp = ch.codePointAt(0);
      for (const out of casefold.has(cp) ? casefold.get(cp) : [cp]) { cps.push(out); origStart.push(at); origEnd.push(at + width); }
    }
    at += width;
  }
  return { cps, origStart, origEnd, length: at };
}

/**
 * 装配或 load-blocklist 调：登记某显示语言的 needle 与折叠表（needle 同样规范化后冻结）。同语言只登记一次。
 * @param {string} lang
 * @param {ReadonlyArray<{word: object, category: string}>} entries word 是 Text
 * @param {ReadonlyMap<number, readonly number[]>} casefold
 * @returns {void}
 */
export function installBlocklist(lang, entries, casefold) {
  if (installed.has(lang)) fail('E_I18N_BLOCKLIST', `blocklist ${lang} already installed`);
  if (!(casefold instanceof Map) || casefold.size === 0) fail('E_I18N_BLOCKLIST', 'casefold table required');
  const needles = entries.map((e) => {
    const word = textValue(e.word);
    if (word === undefined) fail('E_I18N_BLOCKLIST', 'needle must be Text');
    const { cps } = normalizeWithMap(word, casefold);
    if (cps.length === 0) fail('E_I18N_BLOCKLIST', 'empty needle');
    return Object.freeze({ cps: Object.freeze(cps), category: e.category });
  });
  installed.set(lang, Object.freeze({ needles: Object.freeze(needles), casefold }));
}

/** 只给测试与重装配：清掉某语言的登记。 */
export function resetBlocklist() {
  installed.clear();
}

function findAll(hay, needle) {
  const at = [];
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    let j = 0;
    while (j < needle.length && hay[i + j] === needle[j]) j += 1;
    if (j === needle.length) at.push(i);
  }
  return at;
}

/**
 * groupApi `matchBlocklist(text, lang)`。
 * @param {object} text Text
 * @param {string} lang 显示语言代号
 * @returns {Array<{start: number, end: number, origStart: number, origEnd: number, categories: string[]}>}
 */
export function matchBlocklist(text, lang) {
  const s = textValue(text);
  if (s === undefined) throw new TypeError('matchBlocklist: Text required');
  if (!installed.has(lang)) return fail('E_I18N_LOCALE', `no blocklist installed for ${lang}`);
  const { needles, casefold } = installed.get(lang);
  const norm = normalizeWithMap(s, casefold);
  const spans = [];
  for (const n of needles) for (const i of findAll(norm.cps, n.cps)) spans.push({ start: i, end: i + n.cps.length, category: n.category });
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp.start <= last.end) {
      last.end = Math.max(last.end, sp.end);
      last.categories.add(sp.category);
    } else merged.push({ start: sp.start, end: sp.end, categories: new Set([sp.category]) });
  }
  return merged.map((m) => ({ start: m.start, end: m.end, origStart: norm.origStart[m.start], origEnd: norm.origEnd[m.end - 1], categories: [...m.categories].sort() }));
}
