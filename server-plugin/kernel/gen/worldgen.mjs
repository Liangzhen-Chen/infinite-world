// 世界创建事务里 worldgen 相的生成补缺（卷十 §4.1.2 `generateWorld` 的最小部分，R10-1.1–1.7、R10-1.14）：
// 按 genPlan() 的次序逐阶段调生成器（生成器按条目的 generator 节点名从下面的登记表取，流程代码里没有阶段代号），提案交写回器，写回器核对后落成 generated 节偏离行。
// 本卡建的阶段只有自然量与水体两个（登记表只有这两个生成器）；骨架、经济、文化等阶段由各自卡登记条目与生成器，不改本文件的流程。
// 作者输入（world/geo 数据卡、转换前还没进表的作者行）由调用方交入，生成器把它当作者数据读（手写优先，R10-1.7）。
// 水体阶段要读尚未落盘的行提案的足迹与派生量：经卷五 planFootprints（R10-1.14，S10-11 禁自算足迹划分）；世界还没有格空间表时划不出足迹，水体行进 deferred，不编。
// 纯函数：只读表、世界种子、作者输入与先行阶段的产出；不读 state、墙钟。输出整个世界创建的 generated 节、不进表的待转换提案、缺口清单，由调用方写进数据副本。

import { ruleTable } from '../load/rules.mjs';
import { planFootprints } from '../place.mjs';
import { genPlan } from './stages.mjs';
import { buildGenRows } from './rows.mjs';
import { genFields } from './fields.mjs';
import { genWater } from './water.mjs';
import { writeback } from './writeback.mjs';

const RULES_CODE = 'gen';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 生成器登记表：条目的 generator 节点名 → 运行函数 (ctx) => {proposals, deferred?}。新阶段只在这里加一行并登记 gstage 条目（A10-1.3）。
const NODE = Object.freeze({ fields: 'gen/fields.mjs', water: 'gen/water.mjs' });
const RUNNERS = Object.freeze(Object.fromEntries([
  [NODE.fields, (ctx) => ({ proposals: genFields({ ...ctx, downhill: ctx.geo.downhill, elevationDim: ctx.geo.elevationDim }), deferred: [] })],
  [NODE.water, (ctx) => genWater({
    ...ctx,
    waterRows: ctx.rules.waterRows,
    roleTract: ctx.rules.roleTract,
    roleWaterbody: ctx.rules.roleWaterbody,
    m3PerL: ctx.m3PerL,
    footprints: ctx.footprints(),
  })],
]));

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
 * @param {{worldSeed: string, genesisMinute: number, table?: string, geo?: {authored: Map<string, Record<string, any>>, downhill: Array<{chain: string[]}>, buildingIds: string[]}}} opts
 * @returns {{plan: Array<{stage: string, phase: string, scope: string}>, generated: Record<string, any>, pending: Array<{id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{stage: string, id: string, reason: string, gaps: string[]}>}}
 */
export function generateFill(world, opts) {
  const table = opts.table || 'place';
  const t = world.tables.get(table);
  const geo = opts.geo || { authored: new Map(), downhill: [], buildingIds: [] };
  const plan = genPlan(world.vocab, generatorNames());
  const rules = ruleTable(world.rules, RULES_CODE);
  const dims = t.doc.dimensions;
  const unit = world.env.units.get(dims.capacityL.unit);
  const tableIds = new Set(t.flat.rows.keys());
  let generated = {};
  const pendingById = new Map();
  const deferred = [];
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
      m3PerL: unit ? unit.si : undefined,
      footprints: () => {
        const base = {};
        for (const [id, r] of rows) base[id] = r.dims;
        const proposals = {};
        for (const [id, row] of Object.entries(generated)) proposals[id] = row;
        const fp = planFootprints({ ...world, template: { seed: opts.worldSeed } }, { base, proposals, withCells: false });
        return { footprints: fp.footprints, adjacency: fp.adjacency };
      },
    });
    const done = writeback({ table, stage: step.stage, stageEntry: entry, proposals: result.proposals, rows, tableIds, dims, env: world.env, genesisMinute: opts.genesisMinute, generated });
    generated = done.generated;
    // 同一待转换行被两个阶段补时记先写的阶段与键（与偏离行同一口径，R10-1.2），维度合并。
    for (const p of done.pending) {
      const prev = pendingById.get(p.id);
      pendingById.set(p.id, prev ? { ...prev, dims: { ...prev.dims, ...p.dims } } : p);
    }
    for (const d of result.deferred || []) deferred.push({ stage: step.stage, ...d });
  }
  const pending = [...pendingById.values()].sort((a, b) => cmp(a.id, b.id));
  return { plan, generated, pending, deferred };
}
