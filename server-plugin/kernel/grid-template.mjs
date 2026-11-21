// 细格生成模板（卷十 §2.1 :118 `gentemplate` 族、R10-2.15 :435；卷五 §4.3 规则 10–11、§2.2 `cellclass.genTemplate`）。
// 纯函数：不读引擎、不读状态。模板条目的材料一律经卷三材料行引用，本文件与规则表里没有材料 id（S10-2）。
// - checkGenTemplates：加载期校验（族条目字段、材料引用、取值域；cellclass 指向的模板必须存在）。
// - genTemplateOf：一个区格地形类取得它的模板条目。
// - templateBlocksOf：模板格块（浮空山一类），按区格种子取千分数，只落在本区格内，与遍历次序无关。

import { fixedUnits, permille } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { regionCellSeedKey, tplBlockKey, uniformBelow } from './grid.mjs';
import { uniformAt } from './sample.mjs';

const FAMILY = Object.freeze({ cellclass: 'cellclass', gentemplate: 'gentemplate' });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const larger = (a, b) => (a > b ? a : b);
const smaller = (a, b) => (a < b ? a : b);
// 模板条目与格块项的字段名（卷十 :118）。
const FIELD = Object.freeze({
  surface: 'surfaceMaterial', air: 'airMaterial', soilLayers: 'soilLayers', soil: 'soilMaterial', rock: 'rockMaterial', blocks: 'blocks',
  blockMaterial: 'material', selfSupport: 'selfSupport', lift: 'liftLayers', thick: 'thickLayers', radius: 'radiusCells', permille: 'permille',
  genTemplate: 'genTemplate',
});

/**
 * 加载期校验：`gentemplate` 族条目（卷十 :118）与 `cellclass.genTemplate` 引用。返回错误文本数组（空为通过），码在文本开头。
 * - 四个材料字段（surfaceMaterial、soilMaterial、rockMaterial、airMaterial——空气是一行材料，主会话 11-21 已定，卷十 :118 跟改项）、格块项 `material` 必须是存在的材料行（E-DIM-REF-MISSING）；
 * - `soilLayers` 非负整数；`blocks` 是列表（可为空）；格块项 `thickLayers`、`radiusCells` 为不小于 1 的整数、`liftLayers` 为非负整数、`permille` 为 [0, 千分母] 的整数、`selfSupport` 为布尔（E-DIM-DOMAIN-RANGE）；
 * - 每个 cellclass 条目的 `genTemplate` 必须指向 gentemplate 族里存在的条目（E-DIM-REF-MISSING；悬空引用的核对不依赖世界有没有划出区格，requireRefs 只给纯函数测试关掉它用）。
 * @param {Map<string, {family: string, entry: any}>} vocabIndex 词表索引 @param {(code: string) => boolean} hasMaterial 材料行是否存在 @param {boolean} requireRefs 是否核 cellclass.genTemplate
 * @returns {string[]}
 */
export function checkGenTemplates(vocabIndex, hasMaterial, requireRefs) {
  const errors = [];
  const full = permille();
  const isIntAtLeast = (v, min) => Number.isInteger(v) && v >= min;
  const templates = new Map();
  for (const [code, rec] of [...vocabIndex].sort(([a], [b]) => cmp(a, b))) {
    if (!rec || rec.family !== FAMILY.gentemplate) continue;
    templates.set(code, rec.entry);
    const e = isObj(rec.entry) ? rec.entry : {};
    for (const key of [FIELD.surface, FIELD.soil, FIELD.rock, FIELD.air]) {
      if (typeof e[key] !== 'string' || !hasMaterial(e[key])) errors.push(`E-DIM-REF-MISSING gentemplate/${code}: ${key} ${JSON.stringify(e[key])} is not a material row`);
    }
    if (!isIntAtLeast(e[FIELD.soilLayers], 0)) errors.push(`E-DIM-DOMAIN-RANGE gentemplate/${code}: ${FIELD.soilLayers} ${JSON.stringify(e[FIELD.soilLayers])} want an integer >= 0`);
    if (!Array.isArray(e[FIELD.blocks])) { errors.push(`E-DIM-DOMAIN-RANGE gentemplate/${code}: ${FIELD.blocks} is a list (may be empty)`); continue; }
    e[FIELD.blocks].forEach((b, i) => {
      const at = `gentemplate/${code}/${FIELD.blocks}/${i}`;
      if (!isObj(b)) { errors.push(`E-DIM-STRUCT-FIELD ${at}: block item is an object`); return; }
      if (typeof b[FIELD.blockMaterial] !== 'string' || !hasMaterial(b[FIELD.blockMaterial])) errors.push(`E-DIM-REF-MISSING ${at}: ${FIELD.blockMaterial} ${JSON.stringify(b[FIELD.blockMaterial])} is not a material row`);
      if (typeof b[FIELD.selfSupport] !== 'boolean') errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FIELD.selfSupport} is a boolean`);
      if (!isIntAtLeast(b[FIELD.lift], 0)) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FIELD.lift} want an integer >= 0`);
      if (!isIntAtLeast(b[FIELD.thick], 1)) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FIELD.thick} want an integer >= 1`);
      if (!isIntAtLeast(b[FIELD.radius], 1)) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FIELD.radius} want an integer >= 1`);
      if (!isIntAtLeast(b[FIELD.permille], 0) || b[FIELD.permille] > Number(full)) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FIELD.permille} want an integer in [0, ${full}]`);
    });
  }
  for (const [code, rec] of requireRefs ? [...vocabIndex].sort(([a], [b]) => cmp(a, b)) : []) {
    if (!rec || rec.family !== FAMILY.cellclass) continue;
    const ref = isObj(rec.entry) ? rec.entry[FIELD.genTemplate] : undefined;
    if (typeof ref !== 'string' || !templates.has(ref)) errors.push(`E-DIM-REF-MISSING cellclass/${code}: ${FIELD.genTemplate} ${JSON.stringify(ref)} is not a gentemplate entry`);
  }
  return errors;
}

/**
 * 一个区格地形类的细格生成模板条目（卷五 §2.2 `cellclass.genTemplate`、卷十 R10-2.15）。
 * @param {Map<string, {family: string, entry: any}>} vocabIndex @param {string} cellClassCode
 * @returns {{surfaceMaterial: string, airMaterial: string, soilLayers: number, soilMaterial: string, rockMaterial: string, blocks: any[], code: string}}
 */
export function genTemplateOf(vocabIndex, cellClassCode) {
  const cc = vocabIndex.get(cellClassCode);
  const ref = cc && cc.family === FAMILY.cellclass && isObj(cc.entry) ? cc.entry[FIELD.genTemplate] : undefined;
  const t = typeof ref === 'string' ? vocabIndex.get(ref) : undefined;
  if (!t || t.family !== FAMILY.gentemplate || !isObj(t.entry)) throw new KernelError('E-DIM-REF-MISSING', {}, `genTemplateOf: cellclass ${cellClassCode} has no gentemplate entry`);
  return { code: ref, ...t.entry };
}

/**
 * 模板格块（卷十 R10-2.15 :435；卷五 §4.3 规则 11）：对模板 `blocks` 第 j 项，以该区格的区格种子（抽取点 site.gen.tpl.block.<j>）取一个千分数 v ∈ [0, 千分母)，
 * v 小于 `permille` 时，在区格中心列地表层之上起放格块：层范围 [centerSurfaceZ + 1 + liftLayers, … + thickLayers − 1]（`liftLayers` 是地表层与格块底之间空出的层数，0 即紧贴地面；
 * 卷文只写"之上 liftLayers 层起"，此读法见 docs/卡回报/g6-finecell.md 须核项），水平离中心列切比雪夫距离不超 `radiusCells`，只落本区格内（超出截掉）。
 * 返回命中的格块盒（闭区间，细格整数坐标），按块序号 j 升序；后面的块在同一格上覆盖前面的。格块不是存量、不记账。纯函数，只依赖（世界种子、w、区格、模板、中心地表层），与遍历次序无关。
 * @param {{cellM: number, regionCellM: number}} grid rules.grid @param {string} worldSeed @param {number} w @param {{x: number, y: number}} region 区格序号
 * @param {any[]} blocks 模板的 blocks @param {number} centerSurfaceZ 区格中心列的地表层号
 * @returns {{j: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: string, selfSupport: boolean}[]}
 */
export function templateBlocksOf(grid, worldSeed, w, region, blocks, centerSurfaceZ) {
  const perCell = Number(fixedUnits(grid.regionCellM) / fixedUnits(grid.cellM));
  const half = perCell >> 1;
  const minX = region.x * perCell;
  const minY = region.y * perCell;
  const maxX = minX + perCell - 1;
  const maxY = minY + perCell - 1;
  const cx = minX + half;
  const cy = minY + half;
  const seed = regionCellSeedKey(worldSeed, w, region.x, region.y);
  const hits = [];
  blocks.forEach((b, j) => {
    const v = uniformBelow(uniformAt(tplBlockKey(seed, j), 0), permille());
    if (!(v < BigInt(b[FIELD.permille]))) return;
    const z0 = centerSurfaceZ + 1 + b[FIELD.lift];
    const r = b[FIELD.radius];
    hits.push({
      j,
      x0: larger(cx - r, minX), x1: smaller(cx + r, maxX),
      y0: larger(cy - r, minY), y1: smaller(cy + r, maxY),
      z0, z1: z0 + b[FIELD.thick] - 1,
      material: b[FIELD.blockMaterial], selfSupport: b[FIELD.selfSupport],
    });
  });
  return hits;
}

/**
 * 格 (x, y, z) 上命中的最后一个格块（块序号大者覆盖）；没有为 null。
 * @param {ReturnType<typeof templateBlocksOf>} hits @param {number} x @param {number} y @param {number} z
 */
export function blockAt(hits, x, y, z) {
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const h = hits[i];
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1 && z >= h.z0 && z <= h.z1) return h;
  }
  return null;
}
