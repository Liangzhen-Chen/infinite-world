// 卷二十七《离屏性能存档与确定性》规则层 sim-tiers.mjs 的最小子集（G10 第一步；对照表待定 6：先建 bubbleView、inBubble，其余内容由卷二十七主体卡往里加，同文件串行）。
// 本文件现有的：现场泡 bubbleView（§3.1 :223）、inBubble（§3.1 :224）、规则表键 bubbleRadiusRegionCells 的唯一读点（§2.2 :153、S27-11 :260、A27-1.11 :369）。
//
// 边界与已定：
// - 泡只由状态算出（R27-1.12 :311、R27-1.4）：输入只有玩家控制实体的 pos、玩家控制登记与规则表；纯函数，不读别的状态，不写状态，不缓存，不落盘。
// - 范围（R27-1.12 :310）：对每个玩家控制实体取其 pos 的格空间 w 与区格 (cx, cy)；泡 = 同一格空间里 |x − cx| ≤ r 且 |y − cy| ≤ r 的区格之并，
//   r = bubbleRadiusRegionCells；不同格空间各自成泡；外包框之外的区格不算（框由卷五格空间表经 gridSpaceBox 给，不自算）。竖向不设层数，本文件不碰层。
// - 玩家控制登记（卷二十七 §8 第 7 条已答：卷九 R9-3.9 :721）：一个实体由玩家出意图，当且仅当它有一条在世的玩家席位边，持有种类由 rules.control.seatKind 指名，
//   受控实体既是边的持有者也是标的。读边走持有写者模块的只读入口 openHoldingsOfKind（terms.until 为空即在世）。
//   未落：rules.control 规则表与席位持有种类行归卷九、卷十八，本仓库尚未登记；真实引擎上 rules.control.seatKind 不存在时本文件抛 E-RULES-UNREGISTERED，
//   不返回空泡、不退回别的读法（不绕过）。
// - 不按位置精度判，不按 id、名字特判。区格序号只经卷五 regionOf（floor(x × cellM ÷ regionCellM)），不自算。
// - 半径 r 只在本文件读（S27-11）；取值域 1–4 由规则表登记在加载期守，本文件只核"是整数且不小于 1"，缺表、缺键、非整数、0 一律抛 E-RULES-UNREGISTERED，没有"不限"一类放行。

import { dim } from './kernel/dimensions.mjs';
import { kindOfEntity } from './kernel/vocab.mjs';
import { openHoldingsOfKind } from './kernel/holdings.mjs';
import { regionOf, gridSpaceBox } from './kernel/place.mjs';
import { E } from './kernel/handles/generated.mjs';

// 规则表与维度的键名（本文件定名，单一定义）。
const S = Object.freeze({ table: 'simTiers', radius: 'bubbleRadiusRegionCells', control: 'control', seatKind: 'seatKind', pos: 'pos' });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

// 泡半径（区格）：规则表 simTiers.bubbleRadiusRegionCells。
function radiusOf(engine) {
  const t = isObj(engine.rules) && isObj(engine.rules[S.table]) ? engine.rules[S.table] : undefined;
  const r = t === undefined ? undefined : t[S.radius];
  if (!Number.isSafeInteger(r) || r < 1) throw deny(E.E_RULES_UNREGISTERED, `rules.${S.table}.${S.radius} must be a registered integer (no unlimited value)`);
  return r;
}

// 玩家席位边的持有种类：rules.control.seatKind（卷九 R9-3.9）。
function seatKindOf(engine) {
  const t = isObj(engine.rules) && isObj(engine.rules[S.control]) ? engine.rules[S.control] : undefined;
  const k = t === undefined ? undefined : t[S.seatKind];
  if (typeof k !== 'string' || k.length < 1) throw deny(E.E_RULES_UNREGISTERED, `rules.${S.control}.${S.seatKind} is not registered (player seat holding kind, vol9 R9-3.9)`);
  return k;
}

// 每个玩家控制实体所在的格空间与区格：[{w, x, y}]。位置读不出（未知、不是位置值）是数据错误，不跳过。
function centersOf(engine, state) {
  const out = [];
  for (const edge of openHoldingsOfKind(state, seatKindOf(engine))) {
    const id = edge.subject;
    const f = dim(engine, state, kindOfEntity(state, id), id, S.pos);
    if (!f.known || !isObj(f.value)) throw deny(E.E_DIM_UNKNOWN_READ, `bubble: ${S.pos} of player-controlled ${id} is unknown`);
    out.push({ w: f.value.w, ...regionOf(engine, f.value) });
  }
  return out;
}

/**
 * `controlledByPlayer(engine, state, id)`（卷九 R9-3.9 :721 玩家控制登记；卷二十七 R27-1.12）：这个实体此刻是不是玩家控制实体——有一条在世的玩家席位边指向它。
 * 只读席位边，不读位置，所以实体还没有位置时也能判（placeSubject 判"写入后的泡随它移到目标处"用）。读边的路径同 bubbleView 一处（rules.control.seatKind），缺登记抛 E-RULES-UNREGISTERED。
 * @param {object} engine @param {object} state @param {string} id @returns {boolean}
 */
export function controlledByPlayer(engine, state, id) {
  return openHoldingsOfKind(state, seatKindOf(engine)).some((edge) => edge.subject === id);
}

const within = (box, x, y) => x >= box.x0 && x < box.x0 + box.cellsX && y >= box.y0 && y < box.y0 + box.cellsY;

/**
 * `bubbleView(engine, state)`（卷二十七 §3.1 :223，R27-1.12）：现场泡，按格空间 w 分组的区格集合。
 * 返回冻结的 [{w, regions: [{x, y}]}]：w 升序，区格按 (x, y) 升序，不重复；没有玩家控制实体（或其格空间没有外包框）时为空表。纯函数，不落盘。
 * @param {object} engine @param {object} state
 * @returns {readonly {w: number, regions: readonly {x: number, y: number}[]}[]}
 */
export function bubbleView(engine, state) {
  const r = radiusOf(engine);
  const bySpace = new Map();
  for (const c of centersOf(engine, state)) {
    const box = gridSpaceBox(engine, state, c.w);
    if (box === null) continue;
    if (!bySpace.has(c.w)) bySpace.set(c.w, new Map());
    const seen = bySpace.get(c.w);
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (within(box, x, y) && !seen.has(`${x},${y}`)) seen.set(`${x},${y}`, { x, y });
      }
    }
  }
  const out = [...bySpace.keys()].sort(cmp).map((w) => Object.freeze({
    w,
    regions: Object.freeze([...bySpace.get(w).values()].sort((a, b) => cmp(a.x, b.x) || cmp(a.y, b.y)).map((g) => Object.freeze(g))),
  }));
  return Object.freeze(out);
}

/**
 * `inBubble(engine, state, w, regionCell)`（卷二十七 §3.1 :224，R27-1.12）：该区格此刻是否在现场泡内；全书"在不在现场泡里"只经它。
 * regionCell 是区格序号 {x, y}（整数）；w 是格空间号（整数）。格空间不存在或区格在外包框之外为 false。结果与 bubbleView 逐格一致。
 * @param {object} engine @param {object} state @param {number} w @param {{x: number, y: number}} regionCell @returns {boolean}
 */
export function inBubble(engine, state, w, regionCell) {
  if (!Number.isSafeInteger(w) || !isObj(regionCell) || !Number.isSafeInteger(regionCell.x) || !Number.isSafeInteger(regionCell.y)) {
    throw deny(E.E_DIM_STRUCT_FIELD, 'inBubble: needs an integer grid-space number and a region cell {x, y} of integers');
  }
  const r = radiusOf(engine);
  const centers = centersOf(engine, state).filter((c) => c.w === w);
  if (centers.length === 0) return false;
  const box = gridSpaceBox(engine, state, w);
  if (box === null || !within(box, regionCell.x, regionCell.y)) return false;
  return centers.some((c) => Math.abs(c.x - regionCell.x) <= r && Math.abs(c.y - regionCell.y) <= r);
}
