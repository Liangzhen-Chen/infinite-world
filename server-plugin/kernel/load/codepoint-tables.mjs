// 码点表加载（卷二 §2.7 :642 kernelApi `codepointTables`；§1.9 第 3 条 casefold 表；§2.9 第 1 条白名单：casefold.json 只由 kernel 读）。
// 读 world/i18n/casefold.json（unicode.org CaseFolding.txt 的 C 与 S 状态条目，一对一码点映射，冻结；李白 11-19 18:1x ⑥）：
// 核对形状（每条 [从, 到] 两个合法码点、键不重复），不合即抛 E-I18N-BLOCKLIST（码取 kernelApi E）。
// 文件登记的 sha256 不在本加载器核：kernel 没有自己的摘要能力（DigestCap 由装配注入，kernel/save.mjs），摘要由测试核，装配接上 DigestCap 后可再加一道。
// 返回的折叠表形状 Map<码点, [码点]>，与 gate/matcher.mjs 的 mapCodePoints、normalizeWithMap 同一口径。

import { readFileSync } from 'node:fs';
import { E } from '../handles/generated.mjs';

const CASEFOLD_FILE = 'world/i18n/casefold.json';

function refuse(detail) {
  const e = new Error(`${E.E_I18N_BLOCKLIST} ${CASEFOLD_FILE}: ${detail}`);
  Object.assign(e, { code: E.E_I18N_BLOCKLIST, fields: {} });
  throw e;
}

// 合法码点：整数，且 String.fromCodePoint 接受（范围由语言自己判，不在这里写上界数字）。
function isCodePoint(n) {
  if (!Number.isInteger(n)) return false;
  try { String.fromCodePoint(n); return true; } catch { return false; }
}

/**
 * @param {string} root 仓库根
 * @returns {{casefold: ReadonlyMap<number, readonly number[]>}}
 */
export function codepointTables(root) {
  let doc;
  try { doc = JSON.parse(readFileSync(`${root}/${CASEFOLD_FILE}`, 'utf8')); } catch { return refuse('missing or not JSON'); }
  if (doc === null || typeof doc !== 'object' || !Array.isArray(doc.map) || doc.map.length === 0) return refuse('shape');
  const seen = new Set();
  for (const pair of doc.map) {
    if (!Array.isArray(pair)) return refuse('entry');
    const [from, to, ...rest] = pair;
    if (rest.length !== 0 || !isCodePoint(from) || !isCodePoint(to) || seen.has(from)) return refuse('entry');
    seen.add(from);
  }
  const casefold = new Map(doc.map.map(([from, to]) => [from, Object.freeze([to])]));
  return Object.freeze({ casefold });
}
