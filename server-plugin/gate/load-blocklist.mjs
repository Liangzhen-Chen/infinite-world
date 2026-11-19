// 屏蔽词词表加载器（卷二 §2.9 第 1 条入口表 :1080 load-blocklist.mjs 行；第 6 条"格式"；体检 K6-82，6-17 改一轮）。
// 只读 world/i18n/blocklist.<lang>.json：{version: 1, lang, entries: [{word, category}]}；词条按第 6 条规范化两步（NFC，再按码点折叠表折叠）处理后交 matcher 登记。
// 文件不存在即空词表（词表数据归卷二十九语言包；旧 world/meta/blocklist.json 的 names、realPeople 两档已迁为 bcat_name、
// bcat_real_person 条目，世界里的词表就是 world/i18n/blocklist.zh.json）。未规范化、重复、乱序、类别未登记由离线校验 E-I18N-BLOCKLIST-UNNORMALIZED 管，本加载器只做规范化并登记。

import { readFileSync, readdirSync } from 'node:fs';
import { brand } from '../textcore/brand.mjs';
import { nfc, mapCodePoints } from '../textcore/ops.mjs';
import { installBlocklist } from './matcher.mjs';
import { fail } from './fail.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const BLOCKLIST_VERSION = 1;

function exists(root, rel) {
  let dir = root;
  for (const seg of rel.split('/')) {
    if (!readdirSync(dir).includes(seg)) return false;
    dir = `${dir}/${seg}`;
  }
  return true;
}

/**
 * 加载并登记一种显示语言的屏蔽词表。
 * @param {string} root 仓库根
 * @param {string} lang 显示语言代号
 * @param {ReadonlyMap<number, readonly number[]>} casefold kernel 的简单大小写折叠码点表（kernelApi codepointTables，world/i18n/casefold.json，
 *   unicode.org CaseFolding C+S 全表）；必给，缺表即拒（不再有"未建则整段遮蔽"的退路）
 * @returns {number} 登记的词条数
 */
export function loadBlocklist(root, lang, casefold) {
  if (!(casefold instanceof Map) || casefold.size === 0) return fail('E_I18N_BLOCKLIST', 'casefold table required');
  const rel = `world/i18n/blocklist.${lang}.json`;
  let entries = [];
  if (exists(root, rel)) {
    let doc;
    try { doc = JSON.parse(readFileSync(`${root}/${rel}`, 'utf8')); } catch { return fail('E_I18N_BLOCKLIST', `${rel}: not JSON`); }
    if (!isObj(doc) || doc.version !== BLOCKLIST_VERSION || doc.lang !== lang || !Array.isArray(doc.entries)) return fail('E_I18N_BLOCKLIST', `${rel}: shape`);
    entries = doc.entries.map((e) => {
      if (!isObj(e) || typeof e.word !== 'string' || e.word.length === 0 || typeof e.category !== 'string') return fail('E_I18N_BLOCKLIST', `${rel}: entry`);
      const nfcWord = nfc(brand(e.word));
      return { word: mapCodePoints(nfcWord, casefold), category: e.category };
    });
  }
  installBlocklist(lang, entries, casefold);
  return entries.length;
}
