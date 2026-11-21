// 生成期抽取与派生的统一包装（卷二十七 R27-8.1：每个抽取点、每个由种子派生 id 的点都在种子键登记表 world/rules/tables/seed-keys.json 恰有一行，源码与登记表双向比对）。
// 门禁检测器 seed_sites 只认"前两个实参是字串字面量（流代号、抽取点代号）"的调用，并从已登记行学出被调名；所以生成器一律经下面三个包装、
// 在调用处写字面量流代号与抽取点代号，不传常量。键的拼法只在这里与 sample.mjs 的 drawByKey/diceKeyOf：不另造键，不带版本与计数成分。

import { sha256Text } from '../save.mjs';
import { diceKeyOf, drawByKey } from '../sample.mjs';

const KEY_JOIN = '|';

/**
 * 按骰值键取一个分布值（卷二 §1.10 封卷后勘误 1121k1 drawByKey）。
 * @param {string} stream 流代号 @param {string} site 抽取点代号 @param {string} worldSeed @param {string | Array<string | number>} subjectId @param {number} minute
 * @param {Record<string, unknown>} distribution @returns {number | string}
 */
export function genDraw(stream, site, worldSeed, subjectId, minute, distribution) {
  return drawByKey(worldSeed, stream, subjectId, minute, site, distribution);
}

/**
 * 骰值键的 sha256（来源标记 seedKey 用）。
 * @param {string} stream @param {string} site @param {string} worldSeed @param {string | Array<string | number>} subjectId @param {number} minute @returns {string}
 */
export function genDiceKey(stream, site, worldSeed, subjectId, minute) {
  return sha256Text(diceKeyOf(worldSeed, stream, subjectId, minute, site));
}

/**
 * 实例位次导出的摘要（卷十 R10-12.1 五样成分：世界种子、位次代号、父 id、时刻、序位）。
 * @param {string} stream @param {string} site @param {string} worldSeed @param {string} slot @param {string} parentId @param {number} ordinal @param {number} minute @returns {string}
 */
export function genIdKey(stream, site, worldSeed, slot, parentId, ordinal, minute) {
  return sha256Text([worldSeed, slot, parentId, String(minute), String(ordinal)].join(KEY_JOIN));
}
