// 水体足迹补缺阶段（卷十 R10-2.17、封卷后勘误 1121k16 修改轮 M3–M5；R10-1.7 整类规则之一：手写行缺生成输入，逐维度手写优先、缺的由种子确定地补、补出的值写成该行在 generated 节的偏离行）：
// 作者手写的水体行（挂 comp_waterbody 的作者行；生成水体行的足迹在骨架阶段已定，不在此列）缺足迹输入时的补法。河、湖、海一视同仁：只按该行 waterKind 在词表 water 里条目的
// flowing 分两种做法——静水走团块（补种子区格 coord 与目标面积 targetAreaM2，足迹由卷五规则 10 照种子与目标面积生长）、流水走窄带（补 coord，再沿下游链连成窄带写成 boundary，
// 宽度由补）；不按 id、名称或水体类代号分支。作者写了的维度原样当输入读，不改；boundary 非空者足迹即作者所画，一格不补。
// 世界作用域，一次处理全部作者水体行；处理次序固定：沿 downstream 下游先（downstream 图无环）、同层 id 升序，只由数据定。先处理者的产出（种子、窄带）是后处理者的输入。
// 父足迹经卷五 planFootprints 读（R10-1.14，S10-11 禁自算足迹划分），不物化全世界区格：种子区格在父足迹里按 (x, y) 字典序惰性遍历、数出候选数再取第 k 个。
// 抽取点：site_gen_water_seed（种子区格）、site_gen_water_area（静水面积份额）、site_gen_water_width（窄带半宽），对象 = 水体行 id，登记在 seed-keys.json。
// 缺口不编、不借：父足迹划不出（还没有格空间表、父行不在格空间里）、水体类缺的行不出提案，进 deferred 带原因；没有规则行适用、或命中行该用的列为空即 E-GEN-ROW-INVALID；
// 种子候选数为 0、中心线出父足迹或压在他行占用的格上即 E-GEN-WATER-FOOTPRINT（事由代号随码返回，几何见 waterband.mjs）。
// 已定（与卷文推得出的差别）：作者写了 coord 的流水行，种子区格取 coord 所在区格（卷五规则 10 同口径，floor(coord ÷ regionCellM)）；
// 下游行 D 既无 boundary 也无 coord（作者数据没给、也不是本阶段补的水体行）时目标格集为空，按"下游为空"处理（中心线只有种子区格），不编 D 的位置。
// 本文件不读 state、墙钟，不用 Math.*。

import { KernelError } from '../errors.mjs';
import { genDraw, genDiceKey } from './draw.mjs';
import { fixedUnits, fixedMultiply, fixedToNumber, truncateTo } from '../det-math.mjs';
import { centerLine, chooseBand } from './waterband.mjs';

const DEFER = Object.freeze({ footprint: 'footprint_unknown', kind: 'water_kind_missing' });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (x, y) => `${x},${y}`;
const floorDiv = (a, b) => { const q = a / b; const r = a % b; return r !== 0n && r < 0n ? q - 1n : q; }; // b > 0
const ceilDiv = (a, b) => (a + b - 1n) / b; // a、b 皆正
const isEmptyList = (v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

/**
 * @param {{
 *   table: string, stage: string, worldSeed: string, genesisMinute: number,
 *   rows: Map<string, import('./rows.mjs').GenRow>, authoredIds: Set<string>,
 *   waterFillRows: Array<{whenRX: string, priority: number, areaShare: any, halfWidthCells: any}>, roleWaterbody: string,
 *   regionCellM: number | undefined,
 *   when: (text: string, dims: Record<string, any>) => boolean,
 *   footprints: () => null | {footprints: Record<string, {areaM2: number, cellCount: number}>, probe: {has: (id: string, x: number, y: number) => boolean, cells: (id: string) => Iterable<{x: number, y: number}>}}
 * }} ctx
 *   authoredIds：作者写的行（表的 rows 节与作者输入里有的；只在 generated 节或先行阶段生成的行不在内）；footprints()：卷五 planFootprints 的返回（带 probe），划不出足迹为 null；
 *   regionCellM：区格边长（米），取规则表 rules.grid
 * @returns {{proposals: Array<{table: string, id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{id: string, reason: string, gaps: string[]}>}}
 */
export function genWaterFoot(ctx) {
  const proposals = [];
  const deferred = [];
  const waters = [...ctx.rows.values()].filter((r) => r.classes.has(ctx.roleWaterbody) && ctx.authoredIds.has(r.id)).sort((a, b) => cmp(a.id, b.id));
  const waterIds = new Set(waters.map((r) => r.id));
  if (waters.length === 0) return { proposals, deferred };
  // 处理次序：下游先、同层 id 升序（层 = 沿 downstream 走到没有下游或下游不是作者水体行为止的步数）。
  const level = new Map();
  const levelOf = (id, trail = new Set()) => {
    if (level.has(id)) return level.get(id);
    if (trail.has(id)) throw new KernelError('E-GEN-SKELETON', {}, `water downstream graph has a cycle through ${id}`);
    trail.add(id);
    const d = ctx.rows.get(id).dims.downstream;
    const v = typeof d === 'string' && waterIds.has(d) ? levelOf(d, trail) + 1 : 0;
    level.set(id, v);
    return v;
  };
  for (const w of waters) levelOf(w.id);
  const order = [...waters].sort((a, b) => level.get(a.id) - level.get(b.id) || cmp(a.id, b.id));

  const rcF = typeof ctx.regionCellM === 'number' ? fixedUnits(ctx.regionCellM) : null;
  const cellOfCoord = (c) => (rcF === null || c === null || typeof c !== 'object' || typeof c.x !== 'number' || typeof c.y !== 'number' ? null
    : { x: Number(floorDiv(fixedUnits(c.x), rcF)), y: Number(floorDiv(fixedUnits(c.y), rcF)) });
  const coordOfCell = (c) => ({ x: fixedToNumber(BigInt(c.x) * rcF + (rcF >> 1n)), y: fixedToNumber(BigInt(c.y) * rcF + (rcF >> 1n)) });

  // 占用者：全部行的 boundary 覆盖的格（作者的）、同父兄弟种子格、本阶段先处理的水体行已取的种子格与已写的窄带格。
  const boundaryKeys = new Set();
  const seedAt = new Map(); // 父 → Map(格键 → 行 id)：作者已写 coord 的行的种子格
  for (const r of ctx.rows.values()) {
    if (Array.isArray(r.dims.boundary)) for (const c of r.dims.boundary) if (c && Number.isSafeInteger(c.x) && Number.isSafeInteger(c.y)) boundaryKeys.add(keyOf(c.x, c.y));
    const cell = cellOfCoord(r.dims.coord === undefined ? null : r.dims.coord);
    if (cell !== null) {
      if (!seedAt.has(r.parent)) seedAt.set(r.parent, new Map());
      seedAt.get(r.parent).set(keyOf(cell.x, cell.y), r.id);
    }
  }
  const taken = new Map(); // 格键 → 先处理的水体行 id：它取的种子格与写的窄带格
  const seedOf = new Map(); // 水体行 id → 种子区格
  const bandOf = new Map(); // 水体行 id → 本阶段写的窄带（表序）
  const occupiedFor = (self, parent) => (x, y) => {
    const k = keyOf(x, y);
    if (boundaryKeys.has(k)) return true;
    const t = taken.get(k);
    if (t !== undefined && t !== self) return true;
    const s = seedAt.has(parent) ? seedAt.get(parent).get(k) : undefined;
    return s !== undefined && s !== self;
  };

  let fp;
  const fpOnce = () => { if (fp === undefined) fp = ctx.footprints(); return fp; };

  for (const w of order) {
    const d = w.dims;
    const gaps = [];
    const hasBoundary = !isEmptyList(d.boundary);
    const flowing = w.flowing === true;
    if (typeof d.waterKind !== 'string') {
      if (!hasBoundary) deferred.push({ id: w.id, reason: DEFER.kind, gaps: ['coord', 'targetAreaM2', 'boundary'] });
      continue;
    }
    const cell0 = cellOfCoord(d.coord === undefined ? null : d.coord);
    // 缺的维度：boundary 非空者一格不补（卷五规则 10 覆盖优先）；否则静水缺 coord、targetAreaM2，流水缺 coord 与窄带 boundary。
    const needSeed = !hasBoundary && cell0 === null;
    const needArea = !hasBoundary && !flowing && typeof d.targetAreaM2 !== 'number';
    const needBand = !hasBoundary && flowing;
    if (!needSeed && !needArea && !needBand) {
      // 已齐的行：它的种子与窄带仍是后处理行的输入。
      if (cell0 !== null) { seedOf.set(w.id, cell0); taken.set(keyOf(cell0.x, cell0.y), w.id); }
      continue;
    }
    if (needSeed) gaps.push('coord');
    if (needArea) gaps.push('targetAreaM2');
    if (needBand) gaps.push('boundary');
    const probeInfo = fpOnce();
    const parentFp = probeInfo && w.parent !== null ? probeInfo.footprints[w.parent] : undefined;
    if (!probeInfo || !probeInfo.probe || !parentFp || rcF === null) { deferred.push({ id: w.id, reason: DEFER.footprint, gaps }); continue; }
    const probe = probeInfo.probe;
    const parent = w.parent;
    const occupied = occupiedFor(w.id, parent);
    const dims = {};
    // 规则行：whenRX 为真者中 priority 最大、并列取行序最小；没有行适用即 E-GEN-ROW-INVALID，不拿常量兜底。
    const ruleRow = () => {
      let best = null;
      ctx.waterFillRows.forEach((r, i) => { if (ctx.when(r.whenRX, d) && (best === null || r.priority > best.row.priority)) best = { row: r, index: i }; });
      if (best === null) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: no rules.gen.water.fill.rows row applies (whenRX), a required footprint input is never filled with a constant`);
      return best.row;
    };
    // 种子区格。
    let seed = cell0;
    if (needSeed) {
      let excluded = 0;
      const skip = new Set();
      const consider = (k) => {
        if (skip.has(k)) return;
        skip.add(k);
        const [kx, ky] = k.split(',').map(Number);
        if (probe.has(parent, kx, ky)) excluded += 1;
      };
      for (const k of boundaryKeys) consider(k);
      for (const k of taken.keys()) consider(k);
      if (seedAt.has(parent)) for (const [k, id] of seedAt.get(parent)) if (id !== w.id) consider(k);
      const total = parentFp.cellCount - excluded;
      if (!(total >= 1)) throw new KernelError('E-GEN-WATER-FOOTPRINT', { reason: 'no_candidate' }, `water ${w.id}: no seed cell candidate is left in the parent footprint`);
      const drawn = genDraw('gen_water', 'site_gen_water_seed', ctx.worldSeed, w.id, ctx.genesisMinute, { dist: 'uniform', min: 0, max: total });
      const whole = fixedToNumber(truncateTo(fixedUnits(drawn), 0));
      const pick = whole < 0 ? 0 : whole >= total ? total - 1 : whole;
      let at = 0;
      for (const c of probe.cells(parent)) {
        if (skip.has(keyOf(c.x, c.y))) continue;
        if (at === pick) { seed = c; break; }
        at += 1;
      }
      dims.coord = coordOfCell(seed);
    }
    // 静水：补目标面积 max(regionCellM²，floor(父足迹面积 × 抽得的份额))。
    if (needArea) {
      const row = ruleRow();
      if (row.areaShare === null || row.areaShare === undefined) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: the matching rules.gen.water.fill.rows row has no areaShare (a still water body needs it)`);
      const share = fixedUnits(genDraw('gen_water', 'site_gen_water_area', ctx.worldSeed, w.id, ctx.genesisMinute, row.areaShare));
      if (!(share > 0n && share <= fixedUnits(1))) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: areaShare drawn ${fixedToNumber(share)} is outside (0, 1]`);
      const cellArea = fixedUnits(ctx.regionCellM * ctx.regionCellM);
      const byShare = truncateTo(fixedMultiply(fixedUnits(parentFp.areaM2), share), 0);
      dims.targetAreaM2 = fixedToNumber(byShare < cellArea ? cellArea : byShare);
    }
    // 流水：中心线与窄带。
    if (needBand) {
      const down = typeof d.downstream === 'string' ? d.downstream : null;
      const target = [];
      if (down !== null && ctx.rows.has(down)) {
        const dd = ctx.rows.get(down).dims;
        if (bandOf.has(down)) target.push(...bandOf.get(down));
        else if (!isEmptyList(dd.boundary)) { for (const c of dd.boundary) target.push({ x: c.x, y: c.y }); }
        else {
          const s = seedOf.get(down) || cellOfCoord(dd.coord === undefined ? null : dd.coord);
          if (s) target.push(s);
        }
      }
      const inT = new Set(target.map((c) => keyOf(c.x, c.y)));
      const occ = (x, y) => inT.has(keyOf(x, y)) || occupied(x, y);
      const ctxGeo = { inParent: (x, y) => probe.has(parent, x, y), occupied: occ };
      const line = centerLine(seed, target, ctxGeo);
      let width;
      if (typeof d.targetAreaM2 === 'number') {
        const cellArea = fixedUnits(ctx.regionCellM * ctx.regionCellM);
        width = { targetCells: Number(ceilDiv(fixedUnits(d.targetAreaM2), cellArea)), halfWidth: null };
      } else {
        const row = ruleRow();
        if (row.halfWidthCells === null || row.halfWidthCells === undefined) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: the matching rules.gen.water.fill.rows row has no halfWidthCells (a flowing water body needs it)`);
        const r = fixedToNumber(truncateTo(fixedUnits(genDraw('gen_water', 'site_gen_water_width', ctx.worldSeed, w.id, ctx.genesisMinute, row.halfWidthCells)), 0));
        if (!(r >= 0)) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: halfWidthCells drawn ${r} is below 0`);
        width = { targetCells: null, halfWidth: r };
      }
      const band = chooseBand(line, width, ctxGeo).cells;
      for (const c of band) taken.set(keyOf(c.x, c.y), w.id);
      bandOf.set(w.id, band);
      dims.boundary = band.map((c) => ({ x: c.x, y: c.y }));
    }
    if (seed !== null) { seedOf.set(w.id, seed); taken.set(keyOf(seed.x, seed.y), w.id); }
    // 来源标记 seedKey：本行补缺的骰值键（抽取点取种子区格那一个；种子或窄带由作者输入定、没有抽取的行也记它，只供追溯，规则层不读，R10-9.2）。
    proposals.push({ table: ctx.table, id: w.id, dims, by: ctx.stage, seedKey: genDiceKey('gen_water', 'site_gen_water_seed', ctx.worldSeed, w.id, ctx.genesisMinute) });
  }
  return { proposals, deferred };
}
