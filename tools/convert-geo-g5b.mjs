// 【第三轮（李白 11-23 裁定改用《世界地理建模附表》）：省界、海岸、河道、郡控制海拔与主地形取 world/geo/geo-model.json（来源附表），旧数据只供地点行与边；种子归位已撤。
//  跑到整体加载校验时旧地点行的种子有 11 行落在附表郡足迹之外（旧数据与附表对不上，不自编坐标，清单见 docs/卡回报/g5b-convert.md），失败即退出、不写盘；入库 place.json 仍由旧的 tools/convert-geo.mjs 转出。】
// 格子迁移 G5b：旧世界地点数据（world/geo/）加附表转成格子世界新版的 place 表（rows、edges、gridSpaces、generated 节）并补静态显示名（world/i18n/labels.zh.json）。
// 用法：node tools/convert-geo-g5b.mjs          重转并改写 place.json 的 rows、edges、gridSpaces、generated 与 labels.zh.json（表头原样保留；重跑结果恒同）
//       node tools/convert-geo-g5b.mjs --check  只比对，有差异退出码 1，不写盘
// 来源与规矩：卷五《地点地形与资源场》§7 M5-31（组件类按现有地点类别离线派生后人工核对；targetAreaM2 取旧面积）、M5-33（水路边全留）、M5-37（coord 作区域种子、原海拔作 anchorElevationM、建筑行只留引用）、
// §4.1 规则 2（足迹种类只按组件类判）、规则 4（路网边两端只许区域或体积足迹）、规则 10（无目标者平分余下）、§4.1.1 :422（格空间表）；卷十 R10-1.7（手写优先、生成补缺）。
// 旧数据没有的值一律不写（列在 _unbuilt-derived.json 的 columns 登记为未建），不编数字，不按旧 id 分支：规则都是整类的。
//
// 分三步（convertGeo 是纯函数，只做第一步）：
//  ① convertGeo：旧数据加附表 → 作者行与边（组件类取自旧数据自带的建筑清单，不按 id 前缀分；建筑端的边全删；17 处旧面积转 targetAreaM2；省界、海、河、北岭取附表，boundary 写矩形之并或逐格）；
//  ② 生成补缺：在加载得过的世界（不含水路边）上跑卷十 generateFill（模板世界种子），补出的值写进 generated 节（来源标记 by/seedKey/at）；
//  ③ 整体再加载一遍（含水路栅格化与全部加载校验），通过才写盘。种子或边界违规照实报出，不改作者坐标。
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadWorld } from '../server-plugin/kernel/load/world.mjs';
import { readGeoInputs } from '../server-plugin/kernel/load/geo-inputs.mjs';
import { generateFill } from '../server-plugin/kernel/gen/worldgen.mjs';
import { applyGenerated } from '../server-plugin/kernel/gen/writeback.mjs';
import { buildPlan, expandClasses } from '../server-plugin/kernel/place-plan.mjs';
import { eachCell, xOf, yOf, keyOf, inBox } from '../server-plugin/kernel/footprint.mjs';
import { installDigestCap } from '../server-plugin/kernel/save.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DIMS_DIR = 'world/ontology/dimensions';
const PLACE_FILE = `${DIMS_DIR}/place.json`;
const LABEL_FILE = 'world/i18n/labels.zh.json';
// 模板世界的生成种子：本仓库自带的真实世界（模板）带一份按它补出的 generated 节；新开局用自己的战役种子重新补缺并覆盖（卷十 R10-1.9、R10-12）。
export const TEMPLATE_SEED = 'world_template_g5b';
const GENESIS_MINUTE = 0;

// 世界根：旧数据的 mapHierarchy 里最上一级是"已知大陆片区"（known-continent），卷五 §4.14.1 要世界根一行；它没有别的旧值，只有层级与显示名。
const WORLD_ROOT = Object.freeze({ id: 'loc_world', name: '已知大陆' });
// 天气单元数据（world/geo/weather-cell.json）挂在这处旧地点所在的郡上；是转换的输入，不是行里的特例。
const WEATHER_CELL_PLACE = 'loc_hw';
const JURIS = Object.freeze({ world: 'juris_world', 省: 'juris_province', 郡: 'juris_county' });
const COMP = Object.freeze({ layerRoot: 'comp_layer_root', region: 'comp_region', weatherCell: 'comp_weather_cell', facility: 'comp_facility', tract: 'comp_tract', waterbody: 'comp_waterbody' });
const MAIN_WORLD = 0; // 主世界的格空间号（卷五 §4.1.1 :423 主世界一个）

// 旧 id → 新 id（卷二 :287 place 表实体前缀只有 loc_、bld_）：已是 loc_、bld_ 的原样，其余（site_、prov_、county_）整类加 loc_ 前缀。
export const newId = (old) => (/^(loc|bld)_/.test(old) ? old : `loc_${old}`);

// 旧进入档 → access 族条目（旧数据只有三种 mode；rank 是门槛高低，旧数据没有次序，按"开放 < 私宅需居民同意 < 议会需主事人同意"设定，待李白核）。
const ACCESS_OF_MODE = Object.freeze({ public: 'access_public', private: 'access_private', council: 'access_council' });
const WATER_NAVIGABLE = 'water_navigable';

// 旧 terrain 文本 → terrain 封闭十项（卷二 §6.3 :2216：离线候选，人工核对入库；取文本里列在最前的主地形）。键是旧文本，不是地点 id。
const TERRAIN_OF_TEXT = Object.freeze({
  平地: 'plain', 平原: 'plain', 草原平地: 'plain', 林下平地: 'forest', 河滩平地: 'plain', 平地丘陵: 'plain', 旱草原: 'plain',
  丘陵: 'hill', 丘陵与平地: 'hill', 丘陵平地: 'hill', 丘陵河沟: 'hill', 丘陵沟壑: 'hill', 碎石丘陵: 'hill', 砾石丘陵: 'hill', 岩坑丘陵: 'hill', 山岗丘陵: 'hill', 玄岩台地: 'hill',
  阔叶林谷: 'forest', 湿林盆地: 'forest', 湿林盆地与林冠: 'forest', 湿林林冠: 'forest', 高地针阔混交林: 'forest', 高地针阔混交林与岩坳: 'forest', 高地针阔混交林岩坳: 'forest',
  林地丘陵与草坡: 'forest', 林地丘陵草坡: 'forest', 林木丘陵: 'forest', 林下丘陵: 'forest', 林下泥坡: 'forest',
  泥炭湿地: 'marsh', 湿地: 'marsh', 湿地滩: 'marsh', 湿地盐滩: 'marsh', 泥沼与芦滩: 'marsh', 泥沼芦滩: 'marsh', 河滩泥沼: 'marsh',
  盐湿滩地: 'coast', 盐湿滩地与岩岸: 'coast', 盐滩岩岸: 'coast',
  沙丘与砾坡: 'desert', 干旱峡谷: 'desert', 干旱峡谷与砾坡: 'desert', 干旱峡谷砾坡: 'desert', 干旱砾坡: 'desert',
  冰蚀裂谷: 'mountain', 赤色褶皱山地: 'mountain', 断崖与高山灌丛: 'mountain', 高山粒雪台原: 'mountain', 封闭高山岩坳: 'mountain', 砾石山地与崖: 'mountain',
  冰雪台地与岩坳: 'mountain', 冰雪台地岩坳: 'mountain', 山林坡地: 'mountain', 砾石山地: 'mountain', 砾石山崖: 'mountain',
  地下砾土窑道: 'cave', 砾石矿道: 'cave', 河岸岩石: 'river',
  // 省、郡的综合地形文本
  '河谷平地、丘陵与河滩': 'plain', '岩山、砾坡与雪坡': 'mountain', '冰雪台地、岩岸与盐滩': 'mountain', '湿林盆地、阔叶林谷与林地丘陵': 'forest',
  '盐湿滩地、岩岸与海岛': 'coast', '平地、丘陵与河滩': 'plain', '草原、旱草坡与丘陵': 'plain', '泥沼、芦滩与盐碱旱地': 'marsh',
  '高地针阔混交林、雾林与粒雪台原': 'forest', 河谷平地与丘陵: 'plain', '河口湿地、沙丘与砾坡': 'marsh', 河谷丘陵与草坡: 'hill', 高山岩坳与雪坡: 'mountain',
  岩山与针叶林: 'mountain', 冰岸与盐滩: 'coast', 阔叶林谷与泥沼: 'forest', 林地与砾坡: 'forest', 海滩与草坡: 'coast', 盐滩与岩岛: 'coast',
  平地与丘陵: 'plain', 丘陵与草坡: 'hill', 平地与河滩: 'plain', 高地针阔混交林与冰蚀裂谷: 'forest', 赤色褶皱山地与断崖: 'mountain', 旱草原与井泉: 'plain',
  草原与丘陵: 'plain', 盐碱旱地与沙: 'desert', 湿地与盐滩: 'marsh', 雾林与崖: 'forest', 高山粒雪台原与岩坳: 'mountain',
});

const round4 = (x) => Number(x.toFixed(4));
const meters = (km) => round4(km * 1000);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- 附表几何（区格单位的矩形 {x0, x1, y0, y1}，左闭右开） ----------
const kmCell = (km, regionCellM) => Math.floor((km * 1000) / regionCellM);
const rectOf = (r, regionCellM) => ({ x0: kmCell(r[0], regionCellM), x1: kmCell(r[1], regionCellM), y0: kmCell(r[2], regionCellM), y1: kmCell(r[3], regionCellM) });
/** 矩形 a 减去矩形 h：最多四块（下、上、左、右），仍是互不相交的矩形。 */
function subtractRect(a, h) {
  if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.y1 <= a.y0 || h.y0 >= a.y1) return [a];
  const out = [];
  if (a.y0 < h.y0) out.push({ x0: a.x0, x1: a.x1, y0: a.y0, y1: h.y0 });
  if (h.y1 < a.y1) out.push({ x0: a.x0, x1: a.x1, y0: h.y1, y1: a.y1 });
  const y0 = Math.max(a.y0, h.y0);
  const y1 = Math.min(a.y1, h.y1);
  if (a.x0 < h.x0) out.push({ x0: a.x0, x1: h.x0, y0, y1 });
  if (h.x1 < a.x1) out.push({ x0: h.x1, x1: a.x1, y0, y1 });
  return out;
}
const subtractRects = (rects, holes) => holes.reduce((cur, h) => cur.flatMap((a) => subtractRect(a, h)), rects);
const inRects = (x, y, rects) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
/**
 * 手描折线栅格化（卷十 R10-2.17 中心线的走法、附表 4.2）：自上一个顶点起每步沿剩余距离较大的轴走一格、并列取 x 轴；返回区格序列（含起点），表序即流向序。
 * @param {number[][]} pointsKm @param {number} regionCellM @returns {{x: number, y: number}[]}
 */
function rasterLine(pointsKm, regionCellM) {
  const pts = pointsKm.map((p) => ({ x: kmCell(p[0], regionCellM), y: kmCell(p[1], regionCellM) }));
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    let { x, y } = out[out.length - 1];
    while (x !== pts[i].x || y !== pts[i].y) {
      const dx = Math.abs(pts[i].x - x);
      const dy = Math.abs(pts[i].y - y);
      if (dx >= dy) x += Math.sign(pts[i].x - x); else y += Math.sign(pts[i].y - y);
      out.push({ x, y });
    }
  }
  return out;
}
/** 区格序列合并成沿轴的矩形段（做减法用，避免逐格一个矩形）。 */
function runsOfCells(cells) {
  const out = [];
  let cur = null;
  for (const c of cells) {
    if (cur !== null && cur.y0 === c.y && cur.y1 === c.y + 1 && (c.x === cur.x1 || c.x === cur.x0 - 1)) { cur.x0 = Math.min(cur.x0, c.x); cur.x1 = Math.max(cur.x1, c.x + 1); continue; }
    if (cur !== null && cur.x0 === c.x && cur.x1 === c.x + 1 && (c.y === cur.y1 || c.y === cur.y0 - 1)) { cur.y0 = Math.min(cur.y0, c.y); cur.y1 = Math.max(cur.y1, c.y + 1); continue; }
    cur = { x0: c.x, x1: c.x + 1, y0: c.y, y1: c.y + 1 };
    out.push(cur);
  }
  return out;
}

function terrainOf(text, owner) {
  const key = TERRAIN_OF_TEXT[text];
  if (key === undefined) throw new Error(`convert-geo: terrain text not in the mapping table: "${text}" (${owner})`);
  return { terrain: `terrain_${key}`, from: text };
}

/** 区格边长（米，rules.grid.regionCellM）：外包框与种子归位按它折算。 */
function regionCellMOf(root) {
  const rows = readJson(join(root, 'world/rules/tables/grid.json')).rows;
  const row = rows.find((r) => r.key === 'regionCellM');
  if (!row || typeof row.value !== 'number') throw new Error('convert-geo: rules.grid.regionCellM is not registered');
  return row.value;
}

/**
 * ① 旧数据 → 作者行与边（纯函数）。geoDir 是旧数据目录（world/geo）。
 * 返回 {rows, edges, labels, box, buildingSource, report}：
 *  rows——地点行（区域行、建筑行、水体行）；edges——路网边（建筑端的边已删）；box——主世界外包框（区格序号，取全部区域种子坐标的范围）；
 *  buildingSource——建筑行 id → 它挂建筑类的依据（清单名）；report——人工核对清单（不在任何建筑清单里的 bld_ 开头旧行不会被悄悄归类，另列）。
 * @param {string} geoDir
 */
export function convertGeo(geoDir, opts = {}) {
  const root = dirname(dirname(geoDir));
  const locations = readJson(join(geoDir, 'locations.json'));
  const regions = readJson(join(geoDir, 'regions.json'));
  const routes = readJson(join(geoDir, 'routes.json'));
  const biomes = readJson(join(geoDir, 'biomes.json')).locations;
  const weather = readJson(join(geoDir, 'weather-cell.json'));
  const settlements = readJson(join(geoDir, 'settlements.json'));
  const startBuildings = readJson(join(geoDir, 'start-buildings.json')).rows;
  const extraBuildings = readJson(join(geoDir, 'building-classes.json')).rows;
  const model = readJson(join(geoDir, 'geo-model.json'));
  // 子站点改挂（李白 11-23 事件 47df4cc8 选甲、事件 08673f69 第 2、4 条）：旧父站点的足迹不含本行种子者，坐标不动，按坐标改挂所在郡或存量单元，原父站点写进作者字段 originSite（卷八 R8-18.9 ③ 开局统治边按它连回原村）。
  // 清单必有（缺了即报错）；推导入口 tools/derive-subsite-reparent.mjs 传 opts.subsites = {} 从零推。开局统治边未落（卷八 R8-18.9 ③ 的 gstage_polity，见 docs/问题.md 第 7 条）。
  const subsites = opts.subsites !== undefined ? opts.subsites : readJson(join(geoDir, 'subsite-reparent.json')).rows;
  const controls = readJson(join(geoDir, 'elevation-controls.json')).rows;
  const regionCellM = regionCellMOf(root);
  // 附表几何：海（矩形之并扣去 minus）、河（折线栅格化，遇海或先处理的河即止）、省界（矩形之并扣去海与河）。
  const seaRects = {};
  for (const [id, s] of Object.entries(model.seas)) seaRects[id] = subtractRects(s.rectsKm.map((r) => rectOf(r, regionCellM)), (s.minusKm ?? []).map((r) => rectOf(r, regionCellM)));
  const allSea = Object.values(seaRects).flat();
  // 河宽：附表 4.2 以 1 千米区格试划分、"正式 100 米区格时各格数乘 100"，所以折线先按 1 千米格栅格化，每个千米格展开成它的 (1000 ÷ regionCellM)² 个区格；
  // 展开次序保持"每格都与排在它前面的某一格四邻相接"（流水水体 boundary 表序即流向序）：从与前面已有河格相邻的格起广度优先。
  const per = 1000 / regionCellM;
  const riverCells = {};
  const riverBlocks = [];
  const taken = new Set();
  const blockCells = (b) => { const o = []; for (let y = b.y * per; y < (b.y + 1) * per; y += 1) for (let x = b.x * per; x < (b.x + 1) * per; x += 1) o.push({ x, y }); return o; };
  for (const id of Object.keys(model.rivers).sort()) {
    const line = [];
    const own = new Set();
    for (const b of rasterLine(model.rivers[id].pointsKm, 1000)) {
      const cells = blockCells(b);
      if (cells.some((c) => inRects(c.x, c.y, allSea) || taken.has(`${c.x},${c.y}`))) break; // 止于与海或另一条河相接
      const mine = new Set(cells.map((c) => `${c.x},${c.y}`));
      const seen = new Set();
      const queue = line.length === 0 ? [cells[0]] : cells.filter((c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => own.has(`${c.x + dx},${c.y + dy}`)));
      for (const c of queue) seen.add(`${c.x},${c.y}`);
      for (let i = 0; i < queue.length; i += 1) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${queue[i].x + dx},${queue[i].y + dy}`; if (mine.has(k) && !seen.has(k)) { seen.add(k); queue.push({ x: queue[i].x + dx, y: queue[i].y + dy }); } }
      }
      for (const c of queue) { line.push(c); taken.add(`${c.x},${c.y}`); own.add(`${c.x},${c.y}`); }
      riverBlocks.push({ x0: b.x * per, x1: (b.x + 1) * per, y0: b.y * per, y1: (b.y + 1) * per });
    }
    riverCells[id] = line;
  }
  const holes = [...allSea, ...riverBlocks];
  const landBoundary = (rectsKm) => subtractRects(rectsKm.map((r) => rectOf(r, regionCellM)), holes);
  const provinces = regions.filter((r) => r.category === 'province');
  const counties = regions.filter((r) => r.category === 'county');
  const rows = {};
  const labels = {};
  const put = (id, row, name) => {
    if (Object.hasOwn(rows, id)) throw new Error(`convert-geo: duplicate new id ${id}`);
    if (!/^[a-z][a-z0-9_]{1,47}$/.test(id)) throw new Error(`convert-geo: bad id ${id}`);
    rows[id] = row;
    labels[id] = { label: name };
  };

  // 建筑清单：旧数据自带的三处，按成员关系挂建筑类（卷五 M5-31 :1413；不看 id 怎么拼）。先到先得，各行只记第一处依据。
  const buildingSource = new Map();
  const claim = (id, source) => { if (!buildingSource.has(id)) buildingSource.set(id, source); };
  for (const s of settlements) for (const b of s.buildingIds ?? []) claim(newId(b), 'settlements.json buildingIds');
  const formOf = new Map();
  for (const r of startBuildings) { claim(newId(r.id), 'start-buildings.json'); if (typeof r.form === 'string') formOf.set(newId(r.id), r.form); }
  for (const r of extraBuildings) claim(newId(r.id), 'building-classes.json（人工核对清单）');

  // 世界根：主世界根挂 comp_layer_root（卷五 §4.1.1 :428），仍是政区（regionLevel）。
  put(WORLD_ROOT.id, { basis: '世界根：旧 mapHierarchy 最上一级"已知大陆片区"；卷五 §4.14.1 要世界根一行，无别的旧值；挂 comp_layer_root 开主世界格空间（卷五 §4.1.1 :428）', classes: [COMP.layerRoot, COMP.region], parent: null, regionLevel: JURIS.world }, WORLD_ROOT.name);

  // 起始地区：weather-cell.json 是"转换输入"、不引用任何地点 id，挂到哪里由本脚本的唯一输入 WEATHER_CELL_PLACE 定（卡文：河湾村所在起始地区，6-29 回报第一节）。
  const startPlace = WEATHER_CELL_PLACE;
  const countyOfPlace = new Map();
  for (const c of counties) for (const p of c.places ?? []) countyOfPlace.set(p, c.id);
  for (const o of locations) if (o.region !== undefined) countyOfPlace.set(o.id, o.region);
  const startCounty = countyOfPlace.get(startPlace);
  if (startCounty === undefined) throw new Error(`convert-geo: start place ${startPlace} belongs to no county`);

  const region = (r, parent, level) => {
    const t = terrainOf(r.terrain, r.id);
    const row = {
      basis: `旧 world/geo/regions.json（旧 id ${r.id}，${r.level}）；terrain 取旧文本"${t.from}"的主地形（migrated-from-text 候选，待人工核对）；coord 取旧 center（千米折米）`,
      classes: [COMP.region],
      coord: { x: meters(r.center[0]), y: meters(r.center[1]) },
      parent,
      regionLevel: level,
      terrain: t.terrain,
    };
    if (r.category === 'province') {
      const p = model.provinces[newId(r.id)];
      if (p === undefined) throw new Error(`convert-geo: province ${r.id} has no outline in geo-model.json`);
      row.boundary = landBoundary(p.rectsKm);
      row.basis += `；boundary 取附表省界（${p.source}），矩形之并（区格序号、左闭右开）扣去海与河`;
    }
    if (r.category === 'county') {
      const c = model.counties[newId(r.id)];
      if (c === undefined) throw new Error(`convert-geo: county ${r.id} has no controls in geo-model.json`);
      // 附表 3.4 手写设定数：控制海拔、主地形（取代旧文本映射）、森林覆盖按主地形；coord 仍取旧 center（与附表 3.3 种子相同）。
      row.anchorElevationM = c.anchorElevationM;
      row.terrain = c.terrain;
      row.forestCover = model.forestCoverByTerrain[c.terrain];
      row.basis += '；anchorElevationM、terrain、forestCover 取附表 3.4（手写设定数，来源"附表"）';      // 天气单元（卷二十 §2.7）：每郡一个单元；起始地区的单元带 weather-cell.json 的值，其余郡旧数据没有气候数值，不写、不借别郡（列为未建）。
      row.classes.push(COMP.weatherCell);
      if (r.id === startCounty) {
        Object.assign(row, weather.cell);
        row.basis += '；天气单元取 world/geo/weather-cell.json（太原站 WMO 53772，6-29）';
      }
    }
    put(newId(r.id), row, r.name);
  };
  for (const p of provinces) region(p, WORLD_ROOT.id, JURIS['省']);
  for (const c of counties) {
    if (!provinces.some((p) => p.id === c.province)) throw new Error(`convert-geo: county ${c.id} has no province`);
    region(c, newId(c.province), JURIS['郡']);
  }

  // 水路边的两端有水体可及（旧路线只含 boat 方式者是水路边）。
  const isWater = (r) => r.modes.length === 1 && r.modes[0] === 'boat';
  const waterEnds = new Set(routes.filter(isWater).flatMap((r) => [newId(r.from), newId(r.to)]));

  const oldOf = new Map();
  for (const o of locations) {
    oldOf.set(newId(o.id), o);
    // 父：旧 parent；旧 parent 为空者挂所属郡；county.places 点名所属郡的地点以郡为父（旧 parent 与所属郡冲突的 6 处，见回报）。
    const county = countyOfPlace.get(o.id);
    let parent;
    if (county !== undefined) parent = newId(county);
    else if (o.parent !== null) parent = newId(o.parent);
    else throw new Error(`convert-geo: ${o.id} has neither parent nor county`);
    const id = newId(o.id);
    // 附表-1122勘误 B：旧父的足迹不含本行种子者，按坐标改挂所在郡（或所在省的野外）；清单与理由在 geo-model.json 的 reparent，原父与旧郡随清单留痕。
    const re = model.reparent?.[id];
    if (re !== undefined) {
      if (!Object.hasOwn(rows, re.parent)) throw new Error(`convert-geo: reparent of ${id} names unknown parent ${re.parent}`);
      parent = re.parent;
    }
    const sub = subsites[id];
    if (sub !== undefined) parent = sub.parent;
    const row = { parent };
    if (sub !== undefined) row.originSite = sub.originSite;
    if (buildingSource.has(id)) {
      // 建筑行：挂 comp_facility，足迹是建筑足迹——不写 coord（只给区域足迹）、不写 terrain（禁填），锚点与朝向由布局阶段定（卷五 §4.1 规则 11、卷十 R10-7.11）；形制取 start-buildings.json 写了的。
      row.basis = `旧 world/geo/locations.json（旧 id ${o.id}）；挂 comp_facility：依据 ${buildingSource.get(id)}；旧坐标不进行（建筑足迹没有种子，锚点由 layoutOf 定）`;
      row.classes = [COMP.facility];
      if (formOf.has(id)) row.form = formOf.get(id);
    } else {
      const t = terrainOf(o.terrain, o.id);
      row.basis = `旧 world/geo/locations.json（旧 id ${o.id}）；terrain 取旧文本"${t.from}"的主地形（migrated-from-text 候选，待人工核对）；coord 取旧 coordinates（千米折米）`;
      row.coord = { x: meters(o.coordinates[0]), y: meters(o.coordinates[1]) };
      row.terrain = t.terrain;
      const area = biomes[o.id]?.areaKm2;
      if (area !== undefined) {
        // 旧面积是目标面积（卷五 M5-37）；有面积的是存量单元（biomes.json 的群落地块，M5-31）。
        row.targetAreaM2 = round4(area * 1e6);
        row.classes = [COMP.tract];
        row.basis += '；targetAreaM2 取 biomes.json 的 areaKm2（平方千米折平方米）';
      }
    }
    if (re !== undefined) row.basis += `；父改挂 ${re.parent}（旧父 ${re.from}，${re.source}：${re.reason}）`;
    if (sub !== undefined) row.basis += `；子站点按坐标改挂 ${sub.parent}（原属站点 ${sub.originSite}，种子到原父站点足迹 ${sub.distanceM} 米；李白 11-23 事件 47df4cc8 选甲，world/geo/subsite-reparent.json）`;
    if (o.access !== undefined) {
      const entry = ACCESS_OF_MODE[o.access.mode];
      if (entry === undefined) throw new Error(`convert-geo: ${o.id} access mode "${o.access.mode}" not in the mapping table`);
      row.accessClass = entry;
    }
    if (waterEnds.has(id)) row.waterAccess = [WATER_NAVIGABLE];
    put(id, row, o.name);
  }

  for (const [id, sub] of Object.entries(subsites)) {
    if (!Object.hasOwn(rows, id)) throw new Error(`convert-geo: subsite-reparent names unknown row ${id}`);
    if (!Object.hasOwn(rows, sub.parent) || !Object.hasOwn(rows, sub.originSite)) throw new Error(`convert-geo: subsite-reparent ${id} names an unknown parent ${sub.parent} or originSite ${sub.originSite}`);
  }

  // 水体行（world/geo/water-bodies.json 数据卡）：作者给的类、液体、下游、父；种子区格取中心线起点（河）或入海口锚点（海），海域范围与河宽设定没有，由生成补缺（卷十 R10-2.17）。
  const centerM = (r) => ({ x: ((r.x0 + r.x1) / 2) * regionCellM, y: ((r.y0 + r.y1) / 2) * regionCellM });
  // 北岭：附表 3.2 无主荒山，世界根的子行（区域足迹，不是政区）；海与河：附表 4.1、4.2。
  for (const [id, w] of Object.entries(model.wild)) {
    const rects = landBoundary(w.rectsKm);
    put(id, { basis: `附表（${w.source}）；boundary 为矩形之并扣去海与河`, boundary: rects, coord: centerM(rects[0]), parent: WORLD_ROOT.id, terrain: w.terrain, anchorElevationM: w.anchorElevationM, forestCover: model.forestCoverByTerrain[w.terrain] }, w.name);
  }
  for (const [id, s] of Object.entries(model.seas)) {
    put(id, { basis: `附表 4.1（${s.source}）；boundary 为矩形之并（作者手画海岸，静水）；父取世界根`, boundary: seaRects[id], classes: [COMP.tract, COMP.waterbody], coord: centerM(seaRects[id][0]), downstream: null, liquid: 'mat_seawater', parent: WORLD_ROOT.id, waterKind: 'water_sea', anchorElevationM: 0 }, s.name);
  }
  for (const [id, rv] of Object.entries(model.rivers)) {
    const line = riverCells[id];
    if (line.length === 0) throw new Error(`convert-geo: river ${id} has no cells`);
    put(id, { basis: `附表 4.2（${rv.source}）；boundary 为折线栅格化的区格表，表序即流向序`, boundary: line, classes: [COMP.tract, COMP.waterbody], coord: { x: line[0].x * regionCellM + regionCellM / 2, y: line[0].y * regionCellM + regionCellM / 2 }, downstream: rv.downstream, liquid: 'mat_water', parent: WORLD_ROOT.id, terrain: 'terrain_river', waterKind: 'water_river' }, rv.name);
  }
  // 静水湖（附表 4.2；water 族是开放词表，附表-1122勘误 L1 补 water_lake）：种子与目标面积手写、形状由规则 10 生长，作所在省的子行；液体取材料表现有条目。
  for (const [id, lk] of Object.entries(model.lakes ?? {})) {
    if (!Object.hasOwn(rows, lk.parent)) throw new Error(`convert-geo: lake ${id} names unknown parent ${lk.parent}`);
    put(id, { basis: `附表 4.2（${lk.source}）；coord 取种子，targetAreaM2 取手写目标面积（平方千米折平方米），形状由规则 10 生长；液体 ${lk.liquid}（${lk.liquidNote}）`, classes: [COMP.tract, COMP.waterbody], coord: { x: meters(lk.seedKm[0]), y: meters(lk.seedKm[1]) }, downstream: null, liquid: lk.liquid, parent: lk.parent, targetAreaM2: round4(lk.areaKm2 * 1e6), terrain: 'terrain_lake', waterKind: 'water_lake' }, lk.name);
  }
  // 旧控制海拔（world/geo/elevation-controls.json）里仍在表里的行（附表没给的）：作者值，原样转成 anchorElevationM。
  for (const [id, v] of Object.entries(controls)) if (Object.hasOwn(rows, id) && rows[id].anchorElevationM === undefined && Number.isFinite(v.anchorElevationM)) rows[id].anchorElevationM = v.anchorElevationM;

  // 边：一条路线一条边；无向，from 的 id 字典序小于 to；水路与陆路按 waterway 区分。建筑端的边全删（卷五 §4.1 规则 4：两端只许区域或体积足迹，建筑、房间的出入由蓝图门格派生，不建边）。
  const dropped = [];
  const edges = [];
  for (const r of routes) {
    const a = newId(r.from);
    const b = newId(r.to);
    if (buildingSource.has(a) || buildingSource.has(b)) {
      // 带非缺省通行条件、费、风险的列出人工核对（卷五 M5-33 :1415：内容归卷十七或改落行上 accessClass，不静默丢）。
      const plain = r.toll === 0 && r.risk === 0 && r.closedSeasons.length === 0 && (r.terrainMultiplier === undefined || r.terrainMultiplier === 1);
      if (!plain) dropped.push({ id: r.id, from: a, to: b, toll: r.toll, risk: r.risk, closedSeasons: r.closedSeasons, terrainMultiplier: r.terrainMultiplier ?? null, modes: r.modes });
      continue;
    }
    edges.push({ from: a < b ? a : b, to: a < b ? b : a, waterway: isWater(r) });
  }
  edges.sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : x.to > y.to ? 1 : Number(x.waterway) - Number(y.waterway)));

  // 外包框（卷五 §4.1.4 :522 "按现有地点坐标"）：全部区域种子坐标所在区格的范围，含端点。
  const bx = [kmCell(model.box.xKm[0], regionCellM), kmCell(model.box.xKm[1], regionCellM)];
  const by = [kmCell(model.box.yKm[0], regionCellM), kmCell(model.box.yKm[1], regionCellM)];
  const box = { x0: bx[0], y0: by[0], cellsX: bx[1] - bx[0], cellsY: by[1] - by[0] };

  const report = {
    buildingRows: buildingSource.size,
    bySource: Object.fromEntries([...new Set(buildingSource.values())].sort().map((s) => [s, [...buildingSource.values()].filter((v) => v === s).length])),
    droppedEdges: edges.length === routes.length ? 0 : routes.length - edges.length,
    droppedWithConditions: dropped,
    oldBuildingPrefixNotListed: [...oldOf.keys()].filter((id) => id.startsWith('bld_') && !buildingSource.has(id)),
  };
  return { rows, edges, labels, box, buildingSource, report };
}

// ---------- 生成补缺与整体加载校验 ----------

function writeTempDims(placeDoc) {
  const tmp = mkdtempSync(join(tmpdir(), 'convert-geo-'));
  for (const f of readdirSync(join(REPO, DIMS_DIR)).filter((n) => n.endsWith('.json'))) writeFileSync(join(tmp, f), f === 'place.json' ? text(placeDoc) : readFileSync(join(REPO, DIMS_DIR, f)));
  return tmp;
}

export function loadDoc(placeDoc) {
  const tmp = writeTempDims(placeDoc);
  try { return loadWorld(REPO, { dimensionsDir: relative(REPO, tmp) }); } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// 键按字典序、缩进 1 空格：与仓库现有 world/ 数据文件同一写法。
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
}
const text = (v) => `${JSON.stringify(sorted(v), null, 1)}\n`;

// 按码分组：每组计数加 3 行举例（行 id 取 row 栏，没有则取 got 开头）。
const errorText = (w) => {
  const groups = new Map();
  for (const e of w.errors) { if (!groups.has(e.code)) groups.set(e.code, []); groups.get(e.code).push(e.row || String(e.got).slice(0, 110)); }
  return [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([code, ids]) => `${code} x${ids.length}: ${[...new Set(ids)].slice(0, 3).join(' | ')}`).join('\n  ');
};

/**
 * 整体转换：作者行 → 种子归位 → 生成补缺 → 整体加载校验。返回新的 place 文档（表头沿用入库文件）与归位记录。
 * @param {ReturnType<typeof convertGeo>} out @param {(msg: string) => void} log
 */
export function assemblePlace(out, log = () => {}) {
  const { doc, deferred } = fillPlace(out, log);
  const final = loadDoc(doc);
  if (!final.ok && process.env.CONVERT_GEO_DEBUG_OUT) writeFileSync(process.env.CONVERT_GEO_DEBUG_OUT, text(doc)); // 排错用：加载失败的候选表落到指定文件（不在仓库里）
  if (!final.ok) throw new Error(`convert-geo: converted world does not load:\n  ${errorText(final)}`);
  return { doc, deferred };
}

/** 作者行 → 生成补缺，得候选表文档（未做整体加载校验；子站点推导入口也读它）。 */
export function fillPlace(out, log = () => {}) {
  installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
  const header = readJson(join(REPO, PLACE_FILE));
  loadWorld(REPO); // 只为装入定点常数与规则表（入库的 place.json 无论什么状态，规则表读得到就够）
  const spaces = [{ w: MAIN_WORLD, box: out.box, root: WORLD_ROOT.id }];
  const rows = structuredClone(out.rows);
  // 顺序同真实加载管线（卷十 R10-1.7 手写优先、生成补缺）：作者行 → 生成补缺 → 并进 generated 节 → 整体加载校验（唯一一次完整校验；不放宽、不登未建列）。
  // 生成补缺要的是读得出表与行（world.tables、词表、规则），不是校验结论：作者行缺的必填列正是它要补的，所以补缺这一步读未校验的表，校验留给补完后的那一次。
  const authoredDoc = { ...header, rows, edges: out.edges, gridSpaces: spaces, generated: {} };
  const world = loadDoc(authoredDoc);
  log(`authored rows read (not yet validated): ${world.errors.length} errors, to be re-checked after the fill`);
  const geo = readGeoInputs(REPO, { rootId: WORLD_ROOT.id, elevationDim: 'anchorElevationM' });
  for (const id of [...geo.authored.keys()]) if (!Object.hasOwn(rows, id)) geo.authored.delete(id);
  geo.downhill = []; // 旧数据卡的下坡链（河湾→河神矶→雁渡→琥珀港）：附表海拔取代，不再作次序约束
  geo.buildingIds = []; // 建筑行已挂 comp_facility，足迹种类由组件类判
  const fill = generateFill(world, { worldSeed: TEMPLATE_SEED, genesisMinute: GENESIS_MINUTE, geo });
  log(`fill: ${Object.keys(fill.generated).length} generated rows, ${fill.pending.length} pending, deferred ${fill.deferred.length}`);
  const generated = { ...fill.generated };
  for (const p of fill.pending) generated[p.id] = { ...p.dims, generated: { by: p.by, seedKey: p.seedKey, at: GENESIS_MINUTE } };
  const doc = { ...header, rows: Object.fromEntries(Object.keys(rows).sort().map((id) => [id, rows[id]])), edges: out.edges, gridSpaces: spaces, generated };
  return { doc, deferred: fill.deferred };
}

function main() {
  const check = process.argv.includes('--check');
  const t0 = Date.now();
  const log = (m) => process.stderr.write(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}\n`);
  const out = convertGeo(join(REPO, 'world/geo'));
  const { doc, deferred } = assemblePlace(out, log);
  const labels = readJson(join(REPO, LABEL_FILE));
  const nextPlace = text(doc);
  const nextLabels = text({ ...labels, ...out.labels });
  // 工作区在 Windows 上可能被 git 换成 CRLF（core.autocrlf），比对前统一成 LF。
  const lf = (file) => readFileSync(join(REPO, file), 'utf8').replace(/\r\n/g, '\n');
  const same = nextPlace === lf(PLACE_FILE) && nextLabels === lf(LABEL_FILE);
  process.stderr.write(`deferred gaps: ${deferred.length}; building rows ${out.report.buildingRows} ${JSON.stringify(out.report.bySource)}; dropped edges ${out.report.droppedEdges}, with conditions ${out.report.droppedWithConditions.length}; bld_ rows in no list ${JSON.stringify(out.report.oldBuildingPrefixNotListed)}\n`);
  if (check) { process.exit(same ? 0 : 1); }
  writeFileSync(join(REPO, PLACE_FILE), nextPlace);
  writeFileSync(join(REPO, LABEL_FILE), nextLabels);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
