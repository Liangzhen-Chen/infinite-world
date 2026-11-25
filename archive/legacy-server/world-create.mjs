// 世界创建入口（卷十 §3.2 :291 generateWorld(engine, template)；李白 11-22 18:36 P-28～P-30）：新世界第 0 日的一笔世界创建事务，按步骤表（规则表 rules.gen.createSteps）依次跑各步。
// 步骤的增减与次序都在规则表数据里，本文件不写死次序（亮圳 11-22 模块化原则：接口固定、规则进数据、模块可单换）。
// 接口固定：每步是一个模块 run({engine, state, template, channels})，只读自己声明的 reads、只返回自己声明的 writes（键与声明一一相符，多一个少一个都拒）；
// 步骤表每行 {step, reads, writes}：reads/writes 是"通道名"（字符串）。通道有两种来源：调用方交入的 inputs 的键（外部通道），或先行步骤的 writes。
// 依赖检查（事务开启之前做，违反即拒收、一笔都不写）：每步的 reads 必须是外部通道或排在它前面的步骤的 writes；步骤代号须有模块、不重复；通道只许一个步骤写。
// 全部步骤在同一笔事务里（transaction.mjs runTransaction），任一步抛错整笔回滚；新局路径（startGame、bindCampaignSeed 的生产调用）归 6-16，本文件不接。
// 默认的模块表 DEFAULT_MODULES 是四个现有写入口的接线：fill（generateFill，纯函数）、governors（applyGovernorCalls）、assets（applyOpeningAssets）、people（applyOpeningPeople）；
// 换模块只换 modules 参数里的一项，不动步骤表之外的任何代码。

import { runTransaction } from './kernel/transaction.mjs';
import { KernelError } from './kernel/errors.mjs';
import { generateFill } from './kernel/gen/worldgen.mjs';
import { applyGovernorCalls } from './kernel/gen/holdcalls.mjs';
import { applyOpeningAssets } from './kernel/gen/assetcalls.mjs';
import { VIA } from './kernel/gen/holdings-open.mjs';
import { governorOf } from './kernel/title.mjs';
import { applyOpeningPeople } from './opening-people.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const CODE_ORDER = 'E-GEN-STAGE-CYCLE'; // 读了后面才写的通道（次序违反依赖）
const CODE_UNKNOWN = 'E-GEN-STAGE-UNKNOWN'; // 步骤表里的步骤代号没有模块
const CODE_STRUCT = 'E-DIM-STRUCT-FIELD';
const CODE_ROW = 'E-GEN-ROW-INVALID';
const CODE_UNREGISTERED = 'E-RULES-UNREGISTERED';

/**
 * 默认模块表：步骤代号 → 模块。每个模块把自己要读的通道从 channels 取出，调既有写入口，返回自己声明的 writes。
 * 作者写的统治边由 inputs.genViews.heldBy（地点 → {org, cause}）给出，排在生成的调用提案之前（手写优先，R10-1.7）。
 * @type {Record<string, (a: {engine: object, state: object, template: {worldSeed: string, genesisMinute: number}, channels: Record<string, unknown>}) => Record<string, unknown>>}
 */
export const DEFAULT_MODULES = Object.freeze({
  fill: ({ template, channels }) => fillChannels(generateFill(channels.world, { worldSeed: template.worldSeed, genesisMinute: template.genesisMinute, geo: channels.geo, genViews: channels.genViews })),
  governors: ({ engine, state, channels }) => {
    const heldBy = channels.genViews && channels.genViews.heldBy ? channels.genViews.heldBy : [];
    const authored = [...heldBy].map(([place, e]) => ({ place, org: e.org, cause: e.cause }));
    return { 'edge.governor': applyGovernorCalls(engine, state, [...authored, ...channels['fill.calls']]) };
  },
  // 资产一步真读统治一步的结果，按地点判：归属经"作者写的 owner 是地点、取该地统治组织"得来的建筑（via 是 authorPlaceGovernor），其作者地点（genViews.ownerOf）
  // 在状态里读到的统治组织（governorOf，含沿包含树继承）必须就是推出的 owner；不一致（该地点的统治边被统治一步按 R8-5.3 跳过、没写下）即整笔拒收，
  // 不静默错账。同一组织在别的地点另有边写下，不能替这个地点放行（是否改为缺口属新规则，报李白定）。
  assets: ({ engine, state, channels }) => {
    const skipped = channels['edge.governor'].skipped;
    const ownerOf = channels.genViews && channels.genViews.ownerOf;
    for (const e of channels['fill.assets']) {
      if (e.via !== VIA.authorPlaceGovernor) continue;
      const place = ownerOf ? ownerOf(e.building) : undefined;
      const g = typeof place === 'string' ? governorOf(engine, state, place) : null;
      if (g === null || g.org !== e.owner) {
        const why = skipped.find((s) => s.place === place);
        throw new KernelError(CODE_ROW, {}, `assets: ${e.building} is owned via the governor of ${place}, ${e.owner}, but the state has ${g === null ? 'no governs edge' : g.org} there${why ? ` (skipped: ${why.reason})` : ''} (R8-5.3); the opening books would disagree with the governors`);
      }
    }
    return { 'ledger.opening': applyOpeningAssets(engine, state, channels['fill.assets']) };
  },
  people: ({ engine, state, channels }) => ({ 'person.opening': applyOpeningPeople(engine, state, channels.roster) }),
});

/**
 * generateFill 的返回整份作为通道交出，一项不丢：阶段次序 plan、生成行 generated、新建的组织行 created、待转换行 pending、推迟项 deferred、报告 report、
 * 统治调用提案 calls、入账提案 assets 与缺口 assetGaps。生成行与新建组织行的落盘（写回器）尚无步骤，待 6-16 新开局卡建；落盘之前这些通道只在返回值里。
 * 按返回的键派生通道名，不逐项点名：生成器多交一项通道就多一项（步骤表 writes 须同步登记，否则拒收）。
 * @param {Record<string, unknown>} r generateFill 的返回
 * @returns {Record<string, unknown>}
 */
export function fillChannels(r) {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [`fill.${k}`, v]));
}

const strList =(v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);

/**
 * 依赖检查（纯函数，不读状态）：返回按步骤表次序排好的步骤行；违反即抛。
 * @param {Array<{step: string, reads: string[], writes: string[]}>} steps 规则表 rules.gen.createSteps
 * @param {string[]} external 外部通道（inputs 的键）
 * @param {Record<string, Function>} modules
 * @returns {Array<{step: string, reads: string[], writes: string[]}>}
 */
export function checkCreateSteps(steps, external, modules) {
  if (!Array.isArray(steps) || steps.length === 0) throw new KernelError(CODE_UNREGISTERED, {}, 'rules.gen.createSteps is needed (a non-empty list of {step, reads, writes})');
  const available = new Set(external);
  const writtenBy = new Map();
  const seen = new Set();
  for (const row of steps) {
    if (!isObj(row) || typeof row.step !== 'string' || !strList(row.reads) || !strList(row.writes)) throw new KernelError(CODE_STRUCT, {}, 'createSteps row is {step: string, reads: string[], writes: string[]}');
    if (seen.has(row.step)) throw new KernelError(CODE_STRUCT, {}, `createSteps: step ${row.step} listed twice`);
    seen.add(row.step);
    if (!Object.hasOwn(modules, row.step) || typeof modules[row.step] !== 'function') throw new KernelError(CODE_UNKNOWN, {}, `createSteps: step ${row.step} has no module`);
    for (const ch of row.reads) {
      if (!available.has(ch)) throw new KernelError(CODE_ORDER, {}, `createSteps: step ${row.step} reads ${ch}, which no external input or earlier step provides`);
    }
    for (const ch of row.writes) {
      if (writtenBy.has(ch) || external.includes(ch)) throw new KernelError(CODE_STRUCT, {}, `createSteps: channel ${ch} is written by ${writtenBy.get(ch) || 'an external input'} and again by ${row.step}`);
      writtenBy.set(ch, row.step);
      available.add(ch);
    }
  }
  return steps;
}

/**
 * 世界创建：一笔事务里按步骤表依次跑各步。
 * @param {object} engine 引擎（vocab、rules、units、tables、template）
 * @param {object} state 新世界的状态树（调用方建）
 * @param {{worldSeed: string, genesisMinute: number}} template 世界模板参数
 * @param {Record<string, unknown>} inputs 外部通道：步骤的 reads 里不由任何步骤写的那些（现为 world、geo、genViews、roster）
 * @param {{modules?: Record<string, Function>, ctx?: {node: string, file: string}}} [opts] 换模块、换事务节点（测试与装配用）
 * @returns {{ok: true, channels: Record<string, unknown>} | {ok: false, code: string}} 失败时整笔已回滚
 */
export function generateWorld(engine, state, template, inputs, opts = {}) {
  const modules = opts.modules || DEFAULT_MODULES;
  const ctx = opts.ctx || { node: 'generateWorld', file: 'world-create.mjs' };
  const gen = isObj(engine.rules) ? engine.rules.gen : undefined;
  const steps = checkCreateSteps(isObj(gen) ? gen.createSteps : undefined, Object.keys(inputs), modules);
  for (const [k, v] of Object.entries(inputs)) if (v === undefined) throw new KernelError(CODE_STRUCT, {}, `external channel ${k} is undefined`);
  const channels = { ...inputs };
  const res = runTransaction(state, ctx, (s) => {
    for (const row of steps) {
      // 每步只拿到自己声明的 reads：声明有约束力，读未声明的通道拿到 undefined。
      const seen = Object.fromEntries(row.reads.map((k) => [k, channels[k]]));
      const out = modules[row.step]({ engine, state: s, template, channels: seen });
      const keys = isObj(out) ? Object.keys(out).sort() : [];
      const want = [...row.writes].sort();
      if (keys.length !== want.length || keys.some((k, i) => k !== want[i])) throw new KernelError(CODE_STRUCT, {}, `step ${row.step} must return exactly its writes: ${want.join(', ')}`);
      Object.assign(channels, out);
    }
  });
  return res.ok ? { ok: true, channels } : res;
}
