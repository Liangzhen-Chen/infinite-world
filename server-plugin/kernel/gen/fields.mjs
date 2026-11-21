// 自然量阶段（卷十 R10-2.6 :421 场沿包含树逐级加偏差、R10-1.7 :374 手写优先生成补缺、R10-1.13 ① :380 控制海拔是生成输入）。
// 每个 `gfield` 条目 f（卷十 §2.1 :114：target、slot、levels、tractLevel、range）对每个区域足迹行 p 求：
//   值 = 钳到 f.range（Σ 对 p 的祖先链上每个地点 a（含 p）：dev(a, f)），dev 是一次登记过的骰值键抽取（流 gen_fields，抽取点 site_gen_fields_dev，
//   对象 instanceIdOf(idslot_fielddev, a, f.slot, genesisMinute)，经 sample.drawByKey 按条目给定的分布取值），同省的地点共享省一级的偏差。
// 手写优先：行上 f.target 已有作者值的，生成器不出提案；p 的祖先上有作者值时，作者值是下面各级的输入（取代它之上各级偏差之和，之下各级偏差照加），
//   所以作者定的海拔是子树的基准而不被覆盖（R10-1.7 "作者数据里已有值的维度，生成器把它当输入读"）。作者给了高低次序（downhill 链）的，
//   生成值投影到次序里（只改生成值、不改作者值）；作者值之间次序错即 E-GEN-ROW-INVALID（作者数据错，不改它）。
// 提案只带生成输入（目标维度的整值），不带由格派生的量（R10-9.12）。本文件不读墙钟、不读 state、不用 Math.*（几何只经卷五入口）。

import { KernelError } from '../errors.mjs';
import { report } from '../report.mjs';
import { genDraw, genDiceKey } from './draw.mjs';
import { fixedUnits, fixedAdd, truncateTo, fixedToNumber } from '../det-math.mjs';
import { FOOTPRINT_KIND } from '../footprint-kind.mjs';
import { requiredTerms } from '../validate/rows.mjs';
import { T } from '../validate/types.mjs';
import { drawObjectIdOf } from './ids.mjs';

// 骰值键的流代号 gen_fields 与抽取点代号 site_gen_fields_dev（卷十 §4.12.1 :860 `stream.gen.fields` / `site.gen.fields.dev`；代号文法不收点，写成下划线，同卷二十天气抽取点的写法）
// 在调用处写字面量并登记在 seed-keys.json（R27-8.1）。
const SLOT = 'idslot_fielddev';
const FAMILY = 'gfield';
const JURIS = 'juris';
// 必填写法里"挂某组件类"一项的前缀与分隔（卷二 §1.2 :104）。
const TERM_SEP = ':';
const BY_CLASS = `byClass${TERM_SEP}`;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 词表里全部生成场条目，按 slot 升序（slot 在族内唯一，加载校验）。@param {any} vocab @returns {Array<[string, any]>} */
export function fieldEntries(vocab) {
  const fam = vocab && vocab.families && typeof vocab.families.get === 'function' ? vocab.families.get(FAMILY) : undefined;
  const entries = fam && isObj(fam.entries) ? fam.entries : {};
  return Object.keys(entries).map((id) => [id, entries[id]]).sort((a, b) => a[1].slot - b[1].slot || cmp(a[0], b[0]));
}

/**
 * 加载期核对 gfield 条目（卷十 §2.1 :114）：target 是该表上已登记、无 derived 的数值维度，slot 族内唯一的非负整数，range 的 min ≤ max，
 * levels 的键是 juris 族条目、值是分布对象。
 * @param {any} vocab @param {Record<string, any>} dims 目标表表头维度定义 @returns {string[]} 错误行 "<码> <条目> <说明>"
 */
export function checkGenFields(vocab, dims) {
  const errors = [];
  const seen = new Set();
  const bad = (id, why) => errors.push(`E-GEN-ROW-INVALID gfield/${id} ${why}`);
  for (const [id, e] of fieldEntries(vocab)) {
    const def = isObj(dims) && typeof e.target === 'string' ? dims[e.target] : undefined;
    if (!def) bad(id, `target ${JSON.stringify(e.target)} is not a registered dimension`);
    else if (def.derived !== undefined) bad(id, `target ${e.target} is derived (grid-derived quantities are never a field target, R10-2.6)`);
    else if (def.type !== T.type.number && def.type !== T.type.integer) bad(id, `target ${e.target} is not a numeric dimension`);
    if (!Number.isSafeInteger(e.slot) || e.slot < 0) bad(id, 'slot must be a non-negative integer');
    else if (seen.has(e.slot)) bad(id, `slot ${e.slot} is used by another gfield entry`);
    else seen.add(e.slot);
    if (!isObj(e.range) || !Number.isFinite(e.range.min) || !Number.isFinite(e.range.max) || e.range.min > e.range.max) bad(id, 'range must be {min, max} with min <= max');
    const juris = vocab.families.get(JURIS);
    const dists = [...Object.entries(isObj(e.levels) ? e.levels : {}), ...(e.tractLevel ? [[id, e.tractLevel]] : [])];
    for (const k of Object.keys(isObj(e.levels) ? e.levels : {})) if (!juris || !Object.hasOwn(juris.entries, k)) bad(id, `levels key ${k} is not a juris entry`);
    for (const [k, d] of dists) if (!isObj(d) || typeof d.dist !== 'string') bad(id, `distribution at ${k} is not a distribution object`);
  }
  return errors;
}

// 目标维度适用于哪些行（R10-2.6 "目标是某组件类的字段时只写到挂该组件的行上"；其余落在区域足迹行，体积足迹的顶面海拔不走场，R10-2.13）：
// 读目标维度表头的必填写法，`byClass:<组件类>` 取挂该组件类的行，否则取区域足迹行；不认任何具体维度或组件类。
function appliesTo(def, row) {
  const classTerm = requiredTerms(def.required).find((t) => t.startsWith(BY_CLASS));
  return classTerm !== undefined ? row.classes.has(classTerm.slice(classTerm.indexOf(TERM_SEP) + 1)) : row.kind === FOOTPRINT_KIND.region;
}

// 这一行在这个场上的偏差：政区取 levels[层级]，没有层级的区域足迹行（存量单元、站点）取 tractLevel；没有该层级的分布时为 0（R10-2.6）。
function devOf(ctx, row, f) {
  const dist = row.regionLevel !== null ? (isObj(f.levels) ? f.levels[row.regionLevel] : undefined) : f.tractLevel;
  if (!dist) return fixedUnits(0);
  const objectId = drawObjectIdOf(ctx.vocab, ctx.worldSeed, ctx.genesisMinute, SLOT, row.id, f.slot);
  return fixedUnits(genDraw('gen_fields', 'site_gen_fields_dev', ctx.worldSeed, objectId, ctx.genesisMinute, dist));
}

/**
 * 自然量阶段（卷十 §4.1.1 gstage_fields）：对每个 gfield 条目、每个缺目标值的区域足迹行出一条提案。
 * @param {{table: string, stage: string, worldSeed: string, genesisMinute: number, vocab: any, rows: Map<string, import('./rows.mjs').GenRow>, dims: Record<string, any>, downhill?: Array<{chain: string[]}>}} ctx
 *   table：目标表代号；stage：本阶段代号（写进提案的 by）；rows：作者行视图（rows.mjs）；dims：目标表表头（取目标维度的精度）；downhill：作者给的高低次序（链上前者不低于后者）
 * @returns {Array<{table: string, id: string, dims: Record<string, number>, by: string, seedKey: string}>} 按 id 升序的行提案
 */
export function genFields(ctx) {
  const out = new Map();
  for (const [, f] of fieldEntries(ctx.vocab)) {
    const def = ctx.dims[f.target];
    const precision = def && Number.isInteger(def.precision) ? def.precision : 0;
    const lo = fixedUnits(f.range.min);
    const hi = fixedUnits(f.range.max);
    const authoredOf = (id) => (typeof ctx.rows.get(id).dims[f.target] === 'number' ? ctx.rows.get(id).dims[f.target] : undefined);
    // 无钳制的沿链总和：自己有作者值取作者值，否则 = 父的总和 + 自己的偏差（根没有父，总和从 0 起）。
    const memo = new Map();
    const rawSum = (id) => {
      if (memo.has(id)) return memo.get(id);
      const a = authoredOf(id);
      let v;
      if (a !== undefined) v = fixedUnits(a);
      else {
        const parent = ctx.rows.get(id).parent;
        v = fixedAdd(devOf(ctx, ctx.rows.get(id), f), parent !== null && ctx.rows.has(parent) ? rawSum(parent) : fixedUnits(0));
      }
      memo.set(id, v);
      return v;
    };
    const subjects = [...ctx.rows.values()].filter((r) => appliesTo(def, r) && authoredOf(r.id) === undefined);
    const value = new Map();
    for (const r of subjects) {
      const s = rawSum(r.id);
      value.set(r.id, s < lo ? lo : s > hi ? hi : s);
    }
    const before = new Map(value);
    projectDownhill(ctx, f, value, authoredOf);
    // 投影改了哪些值、改了多少，经内核报告出口记日志（可追溯；只含代号与数值）。
    for (const r of subjects) {
      if (value.get(r.id) !== before.get(r.id)) report('W-GEN-DOWNHILL-PROJECTED', { row: r.id, slot: f.slot, from: fixedToNumber(before.get(r.id)), to: fixedToNumber(value.get(r.id)) });
    }
    for (const r of subjects) {
      const v = fixedToNumber(truncateTo(value.get(r.id), precision));
      const seedKey = genDiceKey('gen_fields', 'site_gen_fields_dev', ctx.worldSeed, drawObjectIdOf(ctx.vocab, ctx.worldSeed, ctx.genesisMinute, SLOT, r.id, f.slot), ctx.genesisMinute);
      const row = out.get(r.id) || { table: ctx.table, id: r.id, dims: {}, by: ctx.stage, seedKey };
      row.dims[f.target] = v;
      out.set(r.id, row);
    }
  }
  return [...out.values()].sort((a, b) => cmp(a.id, b.id));
}

// 需要服从高低次序的链（链上前者不低于后者）：作者给的次序链（带它约束的维度 dim，只作用于目标就是该维度的场），
// 加整条下游链——凡行上有 downstream 的水体，沿 downstream 一路下去控制海拔都不许上坡（目标是 ctx.elevationDim 的场）。
// 下游链从没有上游的源头沿 downstream 走到头；汇流处的行出现在多条链里，下面反复投影到稳定。
function chainsFor(ctx, f) {
  const out = [];
  for (const { chain, dim } of ctx.downhill || []) if (dim === f.target) out.push(chain.filter((id) => ctx.rows.has(id)));
  if (f.target === ctx.elevationDim) {
    const next = new Map();
    const hasUp = new Set();
    for (const r of ctx.rows.values()) {
      const d = r.dims.downstream;
      if (typeof d === 'string' && ctx.rows.has(d)) { next.set(r.id, d); hasUp.add(d); }
    }
    for (const id of [...next.keys()].sort(cmp)) {
      if (hasUp.has(id)) continue;
      const path = [];
      const seen = new Set();
      for (let p = id; p !== undefined && !seen.has(p); p = next.get(p)) { seen.add(p); path.push(p); }
      out.push(path);
    }
  }
  return out;
}

// 生成值夹进上下界并随链单调不增；作者值不动；只有作者值之间次序自相矛盾才拒收（已定：码取 E-GEN-ROW-INVALID，理由：是数据错、不是生成错，沿用 R10-9.1 对行不合的码）。
// 投影而不拒收按李白 11-21 裁定甲（卷十勘误待补）。河床高（区格级插值）本卡没有派生点：区格高度由卷五高度场派生，它从各行控制海拔插值，行上控制海拔沿下游不上坡即控制点层面满足；
// 区格级河床是否也须单调由卷五 §4.3 规则 8 的高度场接（接口归卷五，未接）。
function projectDownhill(ctx, f, value, authoredOf) {
  const chains = chainsFor(ctx, f);
  const snap = () => [...value.entries()].map(([k, v]) => `${k}=${v}`).join('|');
  for (let pass = 0; pass <= value.size; pass += 1) {
    const was = snap();
    for (const chain of chains) projectChain(ctx, f, chain, value, authoredOf);
    if (snap() === was) {
      // 稳定了还要核一遍：跨链作者冲突时后一条链的夹值会把前一条链压回违反次序的状态，两遍之间看不出变化，所以以"各链现在是否满足次序"为准。
      const ok = chains.every((chain) => {
        let prev = null;
        for (const id of chain) {
          const v = authoredOf(id) !== undefined ? fixedUnits(authoredOf(id)) : value.get(id);
          if (v === undefined) continue;
          if (prev !== null && v > prev) return false;
          prev = v;
        }
        return true;
      });
      if (ok) return;
      break;
    }
  }
  // 到上限仍不稳定：只有作者值跨链互相冲突（某行在一条链上被作者下游值抬高、在另一条链上被作者上游值压低）才会来回振荡，不静默带着违反次序的值返回。
  // 已定：码取 E-GEN-ROW-INVALID，卷十勘误 1121k16 的 E-GEN-ORDER-CONFLICT 合入 master 后换码。
  throw new KernelError('E-GEN-ROW-INVALID', {}, `downhill chains: ${f.target} projection does not converge: authored values conflict across chains (author data error, not overridden)`);
}

function projectChain(ctx, f, chain, value, authoredOf) {
  {
    const members = chain;
    const authored = members.map((id) => (authoredOf(id) !== undefined ? fixedUnits(authoredOf(id)) : null));
    let cap = null;
    for (let i = 0; i < members.length; i += 1) {
      if (authored[i] === null) continue;
      if (cap !== null && authored[i] > cap) throw new KernelError('E-GEN-ROW-INVALID', {}, `downhill chain: authored ${f.target} at ${members[i]} is higher than an earlier authored member (author data error, not overridden)`);
      cap = authored[i];
    }
    let prev = null;
    for (let i = 0; i < members.length; i += 1) {
      if (authored[i] !== null) { prev = authored[i]; continue; }
      if (!value.has(members[i])) continue;
      let v = value.get(members[i]);
      let floor = null;
      for (let j = i + 1; j < members.length; j += 1) if (authored[j] !== null && (floor === null || authored[j] > floor)) floor = authored[j];
      if (floor !== null && v < floor) v = floor;
      if (prev !== null && v > prev) v = prev;
      value.set(members[i], v);
      prev = v;
    }
  }
}
