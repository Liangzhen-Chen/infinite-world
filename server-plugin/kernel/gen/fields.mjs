// 自然量阶段（卷十 R10-2.6 :421 场沿包含树逐级加偏差、R10-1.7 :374 手写优先生成补缺、R10-1.13 ① :380 控制海拔是生成输入）。
// 每个 `gfield` 条目 f（卷十 §2.1 :114：target、slot、levels、tractLevel、range）对每个区域足迹行 p 求：
//   值 = 钳到 f.range（Σ 对 p 的祖先链上每个地点 a（含 p）：dev(a, f)），dev 是一次登记过的骰值键抽取（流 gen_fields，抽取点 site_gen_fields_dev，
//   对象 instanceIdOf(idslot_fielddev, a, f.slot, genesisMinute)，经 sample.drawByKey 按条目给定的分布取值），同省的地点共享省一级的偏差。
// 手写优先：行上 f.target 已有作者值的，生成器不出提案；p 的祖先上有作者值时，作者值是下面各级的输入（取代它之上各级偏差之和，之下各级偏差照加），
//   所以作者定的海拔是子树的基准而不被覆盖（R10-1.7 "作者数据里已有值的维度，生成器把它当输入读"）。
// 高低次序（控制海拔沿下游不上坡）不在本阶段：本阶段只出各行的生成值，投影由世界作用域的 gstage_order（gen/order.mjs，R10-2.18）在本阶段之后做。
// 提案只带生成输入（目标维度的整值），不带由格派生的量（R10-9.12）。本文件不读墙钟、不读 state、不用 Math.*（几何只经卷五入口）。

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
 * @param {{table: string, stage: string, worldSeed: string, genesisMinute: number, vocab: any, rows: Map<string, import('./rows.mjs').GenRow>, dims: Record<string, any>}} ctx
 *   table：目标表代号；stage：本阶段代号（写进提案的 by）；rows：作者行视图（rows.mjs）；dims：目标表表头（取目标维度的精度）
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

