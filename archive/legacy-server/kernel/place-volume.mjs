// 体积足迹（洞穴、矿坑、含水层；格子迁移 G8；卷五 §4.1 规则 3、9、11–14，§4.5 规则 3、4；卷十 R10-2.13、R10-2.14）：
// 把体积足迹行（anchorElevationM、spanZ、targetAreaM2、mouth）与父足迹、兄弟、高度场交给 cave.mjs 的 caveCellsOf 派生细格集合，
// 再给 place.mjs 读：gridView 的体积凿空一层（叠在模板格块之后、建筑蓝图之前，规则 10）、zoneAt 的最深足迹、placeFootprint 的派生几何、exits 的洞口通路、落格、加载期与世界种子已知后的校验。
// 读维度只经 place.mjs 交入的 val(id, key)（内核 dim() 的基值），与 placeView 同一套取值；不写状态、不读差分（卷十 R10-2.14："不读差分"）。
// 缓存：每个（计划 rp、世界种子）一份，按体积行缓存派生结果（"按（行、输入版本）缓存"：输入版本变即计划变，缓存随计划丢弃）。
// 规模：只装被读到的体积行的列集合（每个至多 ceil(maxAreaM2 ÷ cellM²) 列，暂定 20 万列）；区格 → 体积的查找走"区格的最深归属行 → 它的体积子行"，不为全世界的区格或细格建任何 Map 或 Set。

import { KernelError } from './errors.mjs';
import { caveCellsOf, volumeDerived, CAVE_REASON, topLayerOf } from './cave.mjs';
import { FOOTPRINT_KIND } from './footprint-kind.mjs';
import { cellList, ownerIdAt, inBox, keyOf, regionOfPos, controlPointsOf } from './footprint.mjs';
import { columnSurface, nearControlPoints, CELL_KIND } from './grid-base.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const colKey = (x, y) => `${x},${y}`;
const VOL = Object.freeze({ anchorElevationM: 'anchorElevationM', spanZ: 'spanZ', targetAreaM2: 'targetAreaM2', mouth: 'mouth', terrain: 'terrain', waterKind: 'waterKind' });

/** 体积行派生状态：ok 可用；invalid 数据错（reason 是 CAVE_REASON 或 badParent）；unknown 读不到输入或世界种子，往下传。 */
export const VOLUME_STATUS = Object.freeze({ ok: 'ok', invalid: 'invalid', unknown: 'unknown' });

const cache = new WeakMap(); // rp → Map<世界种子, {volumes: Map, children: Map|null, regions: Map}>

function slot(rp, seed) {
  let bySeed = cache.get(rp);
  if (!bySeed) { bySeed = new Map(); cache.set(rp, bySeed); }
  let s = bySeed.get(seed);
  if (!s) { s = { volumes: new Map(), children: null, regions: new Map() }; bySeed.set(seed, s); }
  return s;
}

/**
 * 洞穴要的规则常数：rules.grid 与 rules.gen.underMaxAreaM2（卷十 :167 的 rules.gen.under.maxAreaM2，规则表 worldgen 按驼峰平铺）。缺任一项抛 E-RULES-UNREGISTERED。
 * @param {any} rules @returns {{grid: any, maxAreaM2: number}}
 */
export function caveRulesFrom(rules) {
  const grid = rules && rules.grid;
  const max = rules && rules.gen ? rules.gen.underMaxAreaM2 : undefined;
  if (!isObj(grid) || typeof max !== 'number') throw new KernelError('E-RULES-UNREGISTERED', {}, 'volume footprints: rules.grid and rules.gen.underMaxAreaM2 are needed');
  return { grid, maxAreaM2: max };
}

const planOfRow = (rp, id) => { for (const plan of rp.plans.values()) if (plan.cells.has(id)) return plan; return null; };

// 同父的体积行（代号序）：按父行建一次索引，只装体积行 id。
function volumeChildren(ctx, parent) {
  const s = slot(ctx.rp, ctx.seed);
  if (s.children === null) {
    s.children = new Map();
    for (const [id, kind] of [...ctx.rp.kinds].sort(([a], [b]) => cmp(a, b))) {
      if (kind !== FOOTPRINT_KIND.volume || ctx.rp.offstage.has(id)) continue;
      const p = ctx.rp.parentOf(id);
      if (!s.children.has(p)) s.children.set(p, []);
      s.children.get(p).push(id);
    }
  }
  return s.children.get(parent) || [];
}

const terrainEntryOf = (engine) => (code) => {
  const rec = engine.vocab && engine.vocab.index instanceof Map && typeof code === 'string' ? engine.vocab.index.get(code) : undefined;
  const e = rec && isObj(rec.entry) ? rec.entry : null;
  return e && typeof e.reliefM === 'number' && typeof e.reliefRough === 'number' ? e : null;
};

// 列地表读口：区格的最深归属行 terrain 条目与近邻控制点按区格缓存；格点噪声 memo 由调用方（一次洞的派生）给。控制点海拔未知或没有 terrain 条目为 null（未知）。
function surfaceReader(ctx, plan, memo) {
  const { engine, rp, seed } = ctx;
  const grid = engine.rules.grid;
  const terrainOf = terrainEntryOf(engine);
  const regions = slot(rp, seed).regions;
  return (x, y) => {
    const r = regionOfPos(grid, { x, y });
    if (!inBox(plan.box, r.x, r.y)) return null;
    const rk = keyOf(plan.box, r.x, r.y);
    const ck = `${plan.w}|${rk}`;
    let reg = regions.get(ck);
    if (reg === undefined) {
      const owner = ownerIdAt(plan, rk);
      const entry = owner === undefined ? null : terrainOf(rp.rows.get(owner).terrain);
      const all = entry === null ? [] : controlPointsOf(grid, plan, rp.rows);
      reg = { entry, cps: all.length === 0 ? [] : nearControlPoints(grid, all, r.x, r.y) };
      regions.set(ck, reg);
    }
    if (reg.entry === null || reg.cps.length === 0) return null;
    return columnSurface(grid, seed, plan.w, reg.cps, reg.entry, x, y, memo);
  };
}

/**
 * 一个体积行的派生结果（缓存）：不是体积行或在离场子树内、世界种子或输入读不到为 null（未知）；否则
 * {id, status, reason, detail, w, plan, parent, cave（成功时 caveCellsOf 的结果）, cols（成功时的列键集合 "x,y"）}。
 * 父行是区域足迹：父足迹取它在区格里"最深归属行就是它"的列；父行是体积：取父体积的列、顶层号须低于父体积底层（R10-2.14 第 1 项）；
 * 兄弟按 id 序逐个求，只排除 id 先于本行者的列，有界无环；父行既不是区域足迹也不是体积（建筑、房间）即 badParent。
 * @param {{engine: any, state: any, rp: any, seed: string | undefined, val: (id: string, key: string) => any}} ctx @param {string} id
 */
export function volumeOf(ctx, id) {
  if (ctx.rp.kinds.get(id) !== FOOTPRINT_KIND.volume || ctx.rp.offstage.has(id) || typeof ctx.seed !== 'string') return null;
  const s = slot(ctx.rp, ctx.seed);
  if (s.volumes.has(id)) return s.volumes.get(id);
  const out = derive(ctx, id);
  s.volumes.set(id, out);
  return out;
}

function derive(ctx, id) {
  const { rp } = ctx;
  const rules = caveRulesFrom(ctx.engine.rules);
  const parent = rp.parentOf(id);
  const anchorElevationM = ctx.val(id, VOL.anchorElevationM);
  const spanZ = ctx.val(id, VOL.spanZ);
  const targetAreaM2 = ctx.val(id, VOL.targetAreaM2);
  const mouth = ctx.val(id, VOL.mouth);
  if ([anchorElevationM, spanZ, targetAreaM2, mouth].some((v) => v === undefined)) return null;
  const base = { id, parent, w: null, plan: null };
  const parentKind = parent === null ? undefined : rp.kinds.get(parent);
  let plan;
  let inParent;
  let parentRegions;
  let parentBottomZ = null;
  if (parentKind === FOOTPRINT_KIND.volume) {
    const pv = volumeOf(ctx, parent);
    if (pv === null) return null;
    if (pv.status !== VOLUME_STATUS.ok) return { ...base, status: VOLUME_STATUS.invalid, reason: CAVE_REASON.badParent, detail: `parent volume ${parent} has no cells (${pv.reason})` };
    plan = pv.plan;
    parentBottomZ = pv.cave.bottomZ;
    inParent = (x, y) => pv.cols.has(colKey(x, y));
    const seen = new Set();
    parentRegions = [];
    for (const c of pv.cave.columns) {
      const r = regionOfPos(rules.grid, c);
      const k = colKey(r.x, r.y);
      if (!seen.has(k)) { seen.add(k); parentRegions.push(r); }
    }
  } else if (parentKind === FOOTPRINT_KIND.region) {
    plan = planOfRow(rp, parent);
    if (plan === null) return null; // 父区域足迹没划出（没有格空间）
    inParent = (x, y) => {
      const r = regionOfPos(rules.grid, { x, y });
      return inBox(plan.box, r.x, r.y) && ownerIdAt(plan, keyOf(plan.box, r.x, r.y)) === parent;
    };
    parentRegions = cellList(plan, parent).filter((c) => ownerIdAt(plan, keyOf(plan.box, c.x, c.y)) === parent);
  } else {
    return { ...base, status: VOLUME_STATUS.invalid, reason: CAVE_REASON.badParent, detail: `parent ${parent} is not a region or volume footprint row` };
  }
  base.w = plan.w;
  base.plan = plan;
  const before = volumeChildren(ctx, parent).filter((sib) => sib < id);
  const claimedSets = [];
  for (const sib of before) {
    const sv = volumeOf(ctx, sib);
    if (sv === null) return null; // 先序兄弟读不到（未知）：它占哪些列不知道，本行也未知（卷二 :387 未知传播），不假定它不占
    if (sv.status === VOLUME_STATUS.ok) claimedSets.push(sv.cols);
  }
  const memo = new Map();
  const cave = caveCellsOf({
    grid: rules.grid, worldSeed: ctx.seed, rowId: id, anchorElevationM, spanZ, targetAreaM2, mouth, maxAreaM2: rules.maxAreaM2,
    parentRegions, inParent, claimed: (x, y) => { const k = colKey(x, y); return claimedSets.some((c) => c.has(k)); },
    surface: surfaceReader(ctx, plan, memo), parentBottomZ,
  });
  if (!cave.ok) return cave.reason === CAVE_REASON.unknown ? null : { ...base, status: VOLUME_STATUS.invalid, reason: cave.reason, detail: cave.detail };
  const cols = new Set(cave.columns.map((c) => colKey(c.x, c.y)));
  // 含水层（挂水体的体积行，waterKind 非空，卷十 R10-2.13 :428）：水自体积底层向上填，水量要读水体账户（卷五 §4.3 规则 10 :661），账户读数还没有，格读作未知。
  const water = typeof rp.rows.get(id).waterKind === 'string'; // 同 regionFacts 读水体类的口径（计划行）
  return { ...base, status: VOLUME_STATUS.ok, cave, cols, water };
}

/**
 * 一列上的体积层：{at: z → {zone: 体积行 id | null, kind: 格种类 | null, unknown: boolean} | null}；没有体积（含洞口通路）为 null；
 * 所查区格的最深归属行（及命中体积再往下）的体积子行里有一行读不到（无世界种子、控制点海拔未知、输入缺、兄弟未知）则返回 {unknown: true}，不把"不知道"当"没有洞"（卷二 :387、:389）。
 * 含水层（waterKind 非空）的体积格 unknown 为真（水量读水体账户，账户读数未接，卷五 §4.3 规则 10 :661）。
 * 体积足迹的格（该列层 bottomZ 到 topZ）读作空气、zone 是体积行；洞口通路格（层 t + 1 到地表层）读作空气、格种类是梯、不属体积足迹（zone 为 null，按所在区域足迹，卷十 R10-2.14 第 4 项）；
 * 嵌套体积的洞口通路穿过父体积的格时，那些格仍属父体积（zone 取体积行）、同时是梯。
 * @param {any} ctx @param {any} grid @param {number} w @param {number} x @param {number} y
 */
export function volumeColumn(ctx, grid, w, x, y) {
  const plan = ctx.rp.plans.get(w);
  if (!plan) return null;
  const r = regionOfPos(grid, { x, y });
  if (!inBox(plan.box, r.x, r.y)) return null;
  const owner = ownerIdAt(plan, keyOf(plan.box, r.x, r.y));
  if (owner === undefined) return null;
  const key = colKey(x, y);
  const hits = [];
  const stack = [...volumeChildren(ctx, owner)];
  while (stack.length > 0) {
    const id = stack.shift();
    const v = volumeOf(ctx, id);
    if (v === null) return { unknown: true };
    if (v.status !== VOLUME_STATUS.ok || !v.cols.has(key)) continue;
    hits.push(v);
    stack.push(...volumeChildren(ctx, id));
  }
  if (hits.length === 0) return null;
  return {
    at: (z) => {
      let zone = null;
      let ladder = false;
      let unknown = false;
      for (const v of hits) {
        if (z >= v.cave.bottomZ && z <= v.cave.topZ) {
          zone = zone === null || v.id < zone ? v.id : zone;
          if (v.water) unknown = true;
        }
        const m = v.cave.mouth;
        if (m !== null && m.x === x && m.y === y && z >= m.fromZ && z <= m.toZ) ladder = true;
      }
      return zone === null && !ladder ? null : { zone, kind: ladder ? CELL_KIND.ladder : null, unknown };
    },
  };
}

/**
 * 一个位置上的体积读数（zoneAt 的体积分支）：位置的格在某体积足迹的格里为那一行 id，否则为 null（洞口通路格不属体积）；这一列的体积读不到（未知）为 undefined。
 * @param {any} ctx @param {any} grid @param {{w: number, x: number, y: number, z: number}} pos @returns {string | null | undefined}
 */
export function volumeZoneAt(ctx, grid, pos) {
  const col = volumeColumn(ctx, grid, pos.w, pos.x, pos.y);
  if (col === null) return null;
  if (col.unknown === true && col.at === undefined) return undefined;
  const c = col.at(pos.z);
  return c === null ? null : c.zone;
}

/**
 * 体积足迹的派生几何（卷五 §4.1 规则 13、§4.5 规则 3；对照表 #45）：{kind, w, cellCount, areaM2, centroid, elevationM, zRange, surfaceRefElevationM, depthM, underground}。
 * 不是体积行、离场、无世界种子、输入读不到、派生失败（数据错，由 checkVolumes 报）为 null。
 * @param {any} ctx @param {string} id
 */
export function volumeFootprint(ctx, id) {
  const v = volumeOf(ctx, id);
  if (v === null || v.status !== VOLUME_STATUS.ok) return null;
  const d = volumeDerived(ctx.engine.rules.grid, v.cave);
  return { kind: FOOTPRINT_KIND.volume, w: v.w, cellCount: v.cave.cellCount, ...d };
}

/**
 * 体积足迹的全部细格 [{x, y, z}]（列次序 = 生长次序，层由低到高）；落格用。
 * @param {any} ctx @param {string} id
 */
export function volumeCellsOf(ctx, id) {
  const v = volumeOf(ctx, id);
  if (v === null || v.status !== VOLUME_STATUS.ok) return [];
  const out = [];
  for (const c of v.cave.columns) for (let z = v.cave.bottomZ; z <= v.cave.topZ; z += 1) out.push({ x: c.x, y: c.y, z });
  return out;
}

/**
 * 体积足迹的出口（卷五 §4.1 规则 9：体积足迹的"开阔边界"泡外不派生基底细格，洞口由洞口通路格给出）：mouth 为真时一项，格取洞口通路最上一格（地表层、与地表空气格相邻）；封闭的洞为空。
 * 体积行读不到（无世界种子、输入缺、控制点未知）为 null（未知，不当封闭的洞）；数据错的行（由 checkVolumes 报）为空。
 * @param {any} ctx @param {string} id @returns {{w: number, x: number, y: number, z: number}[] | null}
 */
export function volumeExitsOf(ctx, id) {
  const v = volumeOf(ctx, id);
  if (v === null) return null;
  if (v.status !== VOLUME_STATUS.ok || v.cave.mouth === null) return [];
  const m = v.cave.mouth;
  return [{ w: v.w, x: m.x, y: m.y, z: m.toZ }];
}

/**
 * 在这些区格上新建区域足迹子行是否压了已凿空的体积列（卷五 §4.1 规则 3："运行期在既有体积足迹列上方新建区域足迹子行"由新建行的写者核，卷十 §5.3 C10-22 ⑦）：
 * 返回区格里有列的体积行 id（代号序，空数组即不压）。体积列只有在它的父行是区域足迹行时才可能被区域足迹压到。
 * @param {any} ctx @param {any} grid @param {number} w @param {{x: number, y: number}[]} regionCells 新子行的区格序号
 * 有体积行读不到（未知）时判不了，返回 null，写者不得当"不压"放行。
 * @returns {string[] | null}
 */
export function volumesUnderRegionCells(ctx, grid, w, regionCells) {
  const plan = ctx.rp.plans.get(w);
  if (!plan) return [];
  const wanted = new Set(regionCells.map((c) => colKey(c.x, c.y)));
  const out = [];
  for (const [id, kind] of [...ctx.rp.kinds].sort(([a], [b]) => cmp(a, b))) {
    if (kind !== FOOTPRINT_KIND.volume || ctx.rp.offstage.has(id)) continue;
    const v = volumeOf(ctx, id);
    if (v === null) return null;
    if (v.status !== VOLUME_STATUS.ok || v.w !== w) continue;
    if (v.cave.columns.some((c) => { const r = regionOfPos(grid, c); return wanted.has(colKey(r.x, r.y)); })) out.push(id);
  }
  return out;
}

/**
 * 世界种子已知后核全部体积行（卷十 R10-2.10、R10-2.14 第 5 项："加载校验把全部体积足迹各派生一遍"；种子不在世界文件里，随新开局或读档才有，所以与不依赖种子的 checkVolumeRows 分开）：
 * 每行派生一遍，失败按原因报错：顶面够不到地表以下一层 E-GRID-VOLUME-TOP-EXPOSED；其余（起点不存在、超过面积上限、不低于父体积底层、输入越域）E-GEN-ROW-INVALID；
 * 父行不是区域足迹或体积 E-GRID-FOOTPRINT-OUTSIDE-PARENT。读不到的（未知）不报。返回错误文字行。
 * @param {any} ctx @returns {string[]}
 */
export function checkVolumes(ctx) {
  const errors = [];
  for (const [id, kind] of [...ctx.rp.kinds].sort(([a], [b]) => cmp(a, b))) {
    if (kind !== FOOTPRINT_KIND.volume || ctx.rp.offstage.has(id)) continue;
    const v = volumeOf(ctx, id);
    if (v === null || v.status === VOLUME_STATUS.ok) continue;
    const code = v.reason === CAVE_REASON.topExposed ? 'E-GRID-VOLUME-TOP-EXPOSED' : v.reason === CAVE_REASON.badParent ? 'E-GRID-FOOTPRINT-OUTSIDE-PARENT' : 'E-GEN-ROW-INVALID';
    errors.push(`${code} place/${id}: ${v.detail}`);
  }
  return errors;
}

/**
 * 加载期核体积行（不依赖世界种子的部分；卷五 §4.1 规则 3、11；卷十 R10-2.13、R10-2.14 第 1、5 项）：
 * ① 父行须是区域足迹行或另一体积足迹（E-GRID-FOOTPRINT-OUTSIDE-PARENT）；② 目标面积不超过 rules.gen.under.maxAreaM2（E-GEN-ROW-INVALID，不因"不限"、0 之类特殊值放过：规则表缺项即 E-RULES-UNREGISTERED）；
 * ③ 嵌套体积顶层号须低于父体积底层号（E-GEN-ROW-INVALID）。读不到数的行（缺列）由维度必填校验报，不在这里重报。
 * @param {{rows: Map<string, any>, rp: any, rules: any}} view @returns {string[]}
 */
export function checkVolumeRows(view) {
  const errors = [];
  const { rows, rp } = view;
  let rules = null;
  const grid = view.rules && view.rules.grid;
  for (const id of [...rows.keys()].sort(cmp)) {
    if (rp.kinds.get(id) !== FOOTPRINT_KIND.volume || rp.offstage.has(id)) continue;
    const row = rows.get(id);
    const parent = rp.parentOf(id);
    const pk = parent === null ? undefined : rp.kinds.get(parent);
    if (pk !== FOOTPRINT_KIND.region && pk !== FOOTPRINT_KIND.volume) errors.push(`E-GRID-FOOTPRINT-OUTSIDE-PARENT place/${id}: parent ${parent} is not a region or volume footprint row`);
    if (typeof row.targetAreaM2 !== 'number') continue;
    if (rules === null) {
      try { rules = caveRulesFrom(view.rules); } catch (e) { errors.push(`E-RULES-UNREGISTERED place/${id}: ${e.message}`); return errors; }
    }
    if (row.targetAreaM2 > rules.maxAreaM2) errors.push(`E-GEN-ROW-INVALID place/${id}: targetAreaM2 ${row.targetAreaM2} exceeds rules.gen.under.maxAreaM2 ${rules.maxAreaM2}`);
    if (pk === FOOTPRINT_KIND.volume && typeof row.anchorElevationM === 'number') {
      const p = rows.get(parent);
      if (typeof p.anchorElevationM === 'number' && Number.isInteger(p.spanZ) && Number.isInteger(row.spanZ)) {
        const parentBottom = topLayerOf(grid, p.anchorElevationM) - p.spanZ + 1;
        const top = topLayerOf(grid, row.anchorElevationM);
        if (!(top < parentBottom)) errors.push(`E-GEN-ROW-INVALID place/${id}: top layer ${top} is not below the parent volume ${parent} bottom layer ${parentBottom}`);
      }
    }
  }
  return errors;
}
