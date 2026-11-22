// 世界创建事务里 worldgen 相的生成补缺（卷十 §4.1.2 `generateWorld` 的最小部分，R10-1.1–1.7、R10-1.14）：
// 按 genPlan() 的次序逐阶段调生成器（生成器按条目的 generator 节点名从下面的登记表取，流程代码里没有阶段代号），提案交写回器，写回器核对后落成 generated 节偏离行。
// 已建的阶段：水体足迹补缺、自然量、高低次序投影、水体、站点面积（现只有手写建筑行缺维度的补缺，R10-7.12）；骨架、经济、文化等阶段由各自卡登记条目与生成器，不改本文件的流程。
// 作者输入（world/geo 数据卡、转换前还没进表的作者行）由调用方交入，生成器把它当作者数据读（手写优先，R10-1.7）；作者写的值与先行阶段生成的值分得开（isAuthored），
// 投影只动生成值（R10-2.18），补缺只补作者没写的维度（R10-1.7）。
// 水体与水体足迹阶段要读尚未落盘的行提案的足迹与派生量：经卷五 planFootprints（R10-1.14，S10-11 禁自算足迹划分）；世界还没有格空间表时划不出足迹，水体行进 deferred，不编。
// 水体阶段的足迹派生量取未修正的 h₀（卷十 R10-2.12 求值次序：生成水体行的下游链先按 h₀ 派生，链定后才求河床，河床不回头改链）。
// 纯函数：只读表、世界种子、作者输入与先行阶段的产出；不读 state、墙钟。输出整个世界创建的 generated 节、不进表的待转换提案、缺口清单、生成报告，由调用方写进数据副本。

import { ruleTable } from '../load/rules.mjs';
import { planFootprints, placeLatitude } from '../place.mjs';
import { blueprintRulesFrom } from '../place-building.mjs';
import { KernelError } from '../errors.mjs';
import { genPlan } from './stages.mjs';
import { buildGenRows } from './rows.mjs';
import { stage as fieldsStage } from './fields.mjs';
import { stage as orderStage } from './order.mjs';
import { stage as waterStage } from './water.mjs';
import { stage as waterFootStage } from './waterfoot.mjs';
import { stage as siteFormStage } from './siteform.mjs';
import { stage as envelopeStage } from './envelope.mjs';
import { STATE } from '../grid-base.mjs';
import { makeWhen } from './when.mjs';
import { writeback, createRows } from './writeback.mjs';
import { stage as polityStage } from './polity.mjs';
import { stage as holdingsStage } from './holdings-open.mjs';

const RULES_CODE = 'gen';
const MATERIAL_TABLE = 'material'; // 材料表（kind material）
const GRID_CODE = 'grid';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 生成器登记表：条目的 generator 节点名 → 该文件导出的阶段 {run(ctx)}（接口固定，A10-1.3）。编排器只给统一的 ctx，各阶段自己取输入、自己改名；
// 新阶段只加一条 gstage 条目、一个生成器文件，再在这里登记一行"节点名 → 文件导出"。
const STAGES = Object.freeze({
  'gen/fields.mjs': fieldsStage, 'gen/water.mjs': waterStage, 'gen/waterfoot.mjs': waterFootStage, 'gen/order.mjs': orderStage,
  'gen/siteform.mjs': siteFormStage, 'gen/envelope.mjs': envelopeStage, 'gen/polity.mjs': polityStage, 'gen/holdings-open.mjs': holdingsStage,
});
const RUNNERS = Object.freeze(Object.fromEntries(Object.entries(STAGES).map(([node, s]) => [node, (ctx) => s.run(ctx)])));

// 统一的表读入口（各阶段共用，不替任何一个阶段拼输入）：按表种类读展平行（复制）、表头、类、id 前缀，按规则表代号读规则表，按 id 认 kind。别的模块的内部结构只在这一处读。
function readEntry(world) {
  const table = (kind) => world.tables.get(kind);
  return Object.freeze({
    rows: (kind) => { const t = table(kind); return t ? new Map([...t.flat.rows].map(([id, r]) => [id, { ...r }])) : new Map(); },
    dims: (kind) => { const t = table(kind); return t ? t.doc.dimensions : {}; },
    classes: (kind) => { const t = table(kind); return t && t.doc.classes ? t.doc.classes : {}; },
    idPrefix: (kind) => { const t = table(kind); return t && t.doc.entity && Array.isArray(t.doc.entity.idPrefix) ? t.doc.entity.idPrefix[0] : undefined; },
    rules: (code) => world.rules[code] || {},
    kindOf: (id) => (world.idIndex && world.idIndex.has(id) ? world.idIndex.get(id) : null),
  });
}

/** 生成器登记表里的节点名（加载期核对 gstage 条目的 generator 用）。@returns {string[]} */
export const generatorNames = () => Object.keys(RUNNERS);

// 表的有效行：展平行并上 generated 节偏离行（flatten.mjs 已合并），再带上行自己挂的组件类。
function effectiveRows(t) {
  const out = new Map();
  for (const [id, flat] of t.flat.rows) {
    const own = (t.doc.rows && t.doc.rows[id]) || (t.doc.generated && t.doc.generated[id]) || {};
    const gen = (t.doc.generated && t.doc.generated[id]) || {};
    out.set(id, { ...flat, classes: Array.isArray(own.classes) ? own.classes : Array.isArray(gen.classes) ? gen.classes : [] });
  }
  return out;
}

/**
 * @param {any} world 加载结果（loadWorld 的返回）
 * @param {{worldSeed: string, genesisMinute: number, table?: string, geo?: {authored: Map<string, Record<string, any>>, downhill: Array<{chain: string[], dim?: string}>, elevationDim?: string, buildingIds: string[]}}} opts
 * @returns {{plan: Array<{stage: string, phase: string, scope: string}>, generated: Record<string, any>, pending: Array<{id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{stage: string, id: string, reason: string, gaps: string[]}>, report: {projections: Array<{row: string, dim: string, from: number, to: number, end: string, by: string}>, changed: number}}}
 *   report：生成报告（高低次序投影改了哪些值，R10-2.18 ⑤；随事务返回，不进存档与 generated 节，规则层不读）
 */
export function generateFill(world, opts) {
  const table = opts.table || 'place';
  const t = world.tables.get(table);
  const geo = opts.geo || { authored: new Map(), downhill: [], buildingIds: [] };
  const plan = genPlan(world.vocab, generatorNames());
  const rules = ruleTable(world.rules, RULES_CODE);
  const dims = t.doc.dimensions;
  const unit = world.env.units.get(dims.capacityM3.unit); // 水体容量的单位（m3，勘误 1123k53）；siteform 的蓝图体积另读 L（place-building.mjs），不是这一个
  const tableIds = new Set(t.flat.rows.keys());
  const when = makeWhen(world);
  const grid = world.rules[GRID_CODE];
  // 作者写的行：表的 rows 节里有的、作者输入里有的（只在 generated 节里的行是先行阶段或骨架生成的，不是作者行）。
  const authoredIds = new Set([...Object.keys(t.doc.rows || {}), ...geo.authored.keys()]);
  let generated = {};
  const pendingById = new Map();
  const deferred = [];
  const report = { projections: [], changed: 0 };
  const read = readEntry(world); // 统一表读入口，各阶段自取输入用
  const views = opts.genViews || {}; // 世界里还没有生产者的读入口（调用方交入），各阶段自取
  const assets = []; // 开局持有阶段交出的入账提案（建筑 → 持有人），由 assetcalls.mjs 在世界创建事务内第 0 日入账
  const assetGaps = []; // 推不出归属的建筑及原因
  // 材料的固态栏密度（千克每升）：读材料表的行值。materialView 读材料维度也不套修正表（卷三乙 M-12，数值标量的有效值才走管线，density 是按物态分栏的 map、不是修正键，有效值即基值），
  // 且它要世界创建事务外才装的词表注册表（kindOf），所以这里直接读同一张表的行值，与 materialView(...).dims.density 同值（测试对照）；读不到为 undefined，由用料阶段报错。
  const materialTable = world.tables.get(MATERIAL_TABLE);
  const materialDensityOf = (code) => {
    const row = materialTable && materialTable.flat && materialTable.flat.rows instanceof Map ? materialTable.flat.rows.get(code) : undefined;
    const byState = row ? row.density : undefined;
    return byState !== null && typeof byState === 'object' ? byState[STATE.solid] : undefined;
  };
  let created = {}; // 阶段新建的行（别的表的整行，R10-1.2 建行写回）：表代号 → {id: 整行}
  const calls = []; // 阶段交出的调用提案（卷八 R8-18.9 ③ setGovernor），由 holdcalls.mjs 在世界创建事务内应用
  // 该行该维度的值是作者写的：表里有这个维度的值而 generated 节没有（展平行已并上偏离行，所以要看偏离行），或作者输入里有；本次世界创建里先行阶段刚生成的值不是作者值。
  const isAuthored = (id, dim) => {
    const flat = t.flat.rows.get(id);
    const g = (t.doc.generated && t.doc.generated[id]) || {};
    const mine = generated[id] || {};
    if (flat && flat[dim] !== undefined && g[dim] === undefined && mine[dim] === undefined) return true;
    const a = geo.authored.get(id);
    const pend = pendingById.get(id);
    return a !== undefined && a[dim] !== undefined && mine[dim] === undefined && !(pend && pend.generatedDims.has(dim));
  };
  for (const step of plan) {
    const run = RUNNERS[world.vocab.index.get(step.stage).entry.generator];
    // 先行阶段的产出对本阶段可见：偏离行并进有效行、待转换的行并进作者输入层（R10-1.2 后行阶段可读先行阶段暂存的行提案）。
    const effective = effectiveRows(t);
    for (const [id, row] of Object.entries(generated)) effective.set(id, { ...(effective.get(id) || {}), ...row });
    const earlier = new Map(geo.authored);
    for (const [id, p] of pendingById) earlier.set(id, { ...(earlier.get(id) || {}), ...p.dims });
    const rows = buildGenRows(effective, world.vocab, { authored: earlier, buildingIds: geo.buildingIds });
    const entry = world.vocab.index.get(step.stage).entry;
    const result = run({
      table, stage: step.stage, worldSeed: opts.worldSeed, genesisMinute: opts.genesisMinute, vocab: world.vocab, rows, dims, rules, geo,
      m3PerUnit: unit ? unit.si : undefined,
      authoredIds, isAuthored, when, materialDensityOf, read, views, created, calls,
      gridSpaceCount: Array.isArray(t.doc.gridSpaces) ? t.doc.gridSpaces.length : 0, // 格空间表的行数；0 即世界还没有格空间，划不出足迹
      regionCellM: grid && typeof grid.regionCellM === 'number' ? grid.regionCellM : undefined,
      blueprint: blueprintRulesFrom(world.rules, world.env.units),
      // o.extra：本次调用另加的行提案（id → 维度；站点面积阶段试排时给站点试写的 targetAreaM2，R10-7.5），叠在先行阶段已生成的偏离行之上，不进 generated。
      footprints: (o = {}) => {
        const base = {};
        for (const [id, r] of rows) base[id] = r.dims;
        const proposals = {};
        for (const [id, row] of Object.entries(generated)) proposals[id] = row;
        for (const [id, row] of Object.entries(o.extra || {})) proposals[id] = { ...(proposals[id] || {}), ...row };
        const fp = planFootprints({ ...world, template: { seed: opts.worldSeed } }, { base, proposals, withCells: false, bed: o.bed, heights: o.heights });
        return { footprints: fp.footprints, adjacency: fp.adjacency, probe: fp.probe };
      },
      // 站点的纬度（卷二十 §2.7 latitudeDeg，place 派生的唯一读法 placeLatitude）：落位补朝向时"面向赤道"要它（卷十九 §4.5 规则 11）。
      latitudeDegOf: (centroid) => placeLatitude(world, { dims: { centroid: centroid === undefined ? { known: false } : { known: true, value: centroid } } }),
    });
    // 提案按表分：本表的是补缺（writeback），别的表的是建行（createRows，阶段须在 writesKinds 里声明那张表，R10-9.9）。
    const own = result.proposals.filter((p) => p.table === table);
    const done = entry.writesKinds.includes(table) || own.length > 0
      ? writeback({ table, stage: step.stage, stageEntry: entry, proposals: own, rows, tableIds, dims, env: world.env, genesisMinute: opts.genesisMinute, generated, isAuthored })
      : { generated, pending: [] };
    generated = done.generated;
    for (const other of [...new Set(result.proposals.map((p) => p.table).filter((t) => t !== table))].sort(cmp)) {
      const ot = world.tables.get(other);
      if (!ot) throw new KernelError('E-GEN-ROW-INVALID', {}, `stage ${step.stage}: proposal table ${other} is not a loaded table`);
      created = { ...created, [other]: createRows({ table: other, stage: step.stage, stageEntry: entry, proposals: result.proposals.filter((p) => p.table === other), tableIds: new Set(ot.flat.rows.keys()), authoredIds: new Set(), classIds: new Set(Object.keys(ot.doc.classes || {})), dims: ot.doc.dimensions, env: world.env, genesisMinute: opts.genesisMinute, created: created[other] || {} }) };
    }
    calls.push(...(result.calls || []));
    assets.push(...(result.assets || []));
    assetGaps.push(...(result.assetGaps || []));
    // 同一待转换行被两个阶段补时记先写的阶段与键（与偏离行同一口径，R10-1.2），维度合并；改写（revise）只许改先行阶段已生成的维度。
    for (const p of done.pending) {
      const prev = pendingById.get(p.id);
      if (p.revise === true) {
        for (const dim of Object.keys(p.dims)) {
          if (!prev || !prev.generatedDims.has(dim)) throw new KernelError('E-GEN-ROW-INVALID', {}, `proposal ${p.id}: ${dim} has no generated value to revise (a projection only moves generated values)`);
        }
      }
      const generatedDims = new Set([...(prev ? prev.generatedDims : []), ...Object.keys(p.dims)]);
      pendingById.set(p.id, prev ? { ...prev, dims: { ...prev.dims, ...p.dims }, generatedDims } : { id: p.id, dims: p.dims, by: p.by, seedKey: p.seedKey, generatedDims });
    }
    for (const d of result.deferred || []) deferred.push({ stage: step.stage, ...d });
    if (result.report) { report.projections.push(...result.report.projections); report.changed += result.report.changed; }
  }
  const pending = [...pendingById.values()].map(({ generatedDims, ...p }) => p).sort((a, b) => cmp(a.id, b.id));
  return { plan, generated, created, calls, assets, assetGaps, pending, deferred, report };
}
