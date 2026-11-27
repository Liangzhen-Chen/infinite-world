// 玩家控制认定（卷九 §2.5 :321 rules.control.seatKind、R9-3.9 :721：一个实体由玩家出意图，当且仅当它有一条在世的玩家席位边；S2-H 草案 §5）。
// 席位边的持有者与标的都是受控实体本身；化身认定只在本文件（rules/act/catalog.mjs 的化身读数、缺省行动者、菜单主体核对都调它）。
// 只读：边经持有写者的读入口取（holdings.mjs），席位种类取 rules.control.seatKind，不写种类代号。
import { ruleValue } from '../load/registry.mjs';
import { holdingsOf, holdingsOfKind } from './holdings.mjs';

// 规则表登记代号与键（world/rules/registry.json control）。
const CONTROL = 'control';
const SEAT_KIND = 'seatKind';

const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/** @param {import('./holdings.mjs').SocialEngine} engine @returns {string} */
const seatKind = (engine) => String(ruleValue(engine.docData, CONTROL, SEAT_KIND));

/**
 * kernelApi controlledByPlayer（卷九 R9-3.9）：id 名下有一条席位种类、标的为它自己的现役边即真。只读。
 * @param {import('./holdings.mjs').SocialEngine} engine @param {object} state @param {unknown} id @returns {boolean}
 */
export function controlledByPlayer(engine, state, id) {
  if (typeof id !== 'string' || id.length === 0) return false;
  return holdingsOf(engine, state, id, seatKind(engine)).some((e) => e.subject === id);
}

/**
 * kernelApi controlledEntities（卷九 R9-3.9）：本局全部受控实体（席位种类、持有者即标的的现役边的标的），去重、按 id 排序，冻结。只读。
 * @param {import('./holdings.mjs').SocialEngine} engine @param {object} state @returns {readonly string[]}
 */
export function controlledEntities(engine, state) {
  const ids = holdingsOfKind(engine, state, seatKind(engine)).filter((e) => e.holder === e.subject).map((e) => e.subject);
  return Object.freeze([...new Set(ids)].sort(cmp));
}
