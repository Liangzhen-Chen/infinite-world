// 块 6 第 6-24 张：旧世界地点数据（world/geo/）全量转成新 place 表的 rows 与 edges，并补静态显示名（world/i18n/labels.zh.json）。
// 用法：node tools/convert-geo.mjs          按旧数据重转并改写 place.json 的 rows、edges 与 labels.zh.json（表头原样保留；重跑结果恒同）
//       node tools/convert-geo.mjs --check  只比对，有差异退出码 1，不写盘
// 来源与规矩：卷二《维度表规范与统一入口》§6.3 :2212（地点 458、政区 40、routes 全部搬入 edges）；卷五《地点地形与资源场》M5-31（面积取 biomes.json）、
// M5-33（一条路线一条边，两端相同的陆路水路两条并存）、§4.1.3 规则 1–5、§4.14（政区挂 comp_region 与 regionLevel）；卷二十 §2.7（起始地区挂天气单元）。
// 旧数据没有的值一律不写（列在 _unbuilt-derived.json 的 columns 登记为未建），不编数字，不按旧 id 分支：规则都是整类的。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const PLACE_FILE = 'world/ontology/dimensions/place.json';
const LABEL_FILE = 'world/i18n/labels.zh.json';

// 世界根：旧数据的 mapHierarchy 里最上一级是"已知大陆片区"（known-continent），卷五 §4.14.1 要世界根一行；它没有别的旧值，只有层级与显示名。
const WORLD_ROOT = Object.freeze({ id: 'loc_world', name: '已知大陆' });
// 天气单元数据（world/geo/weather-cell.json）挂在这处旧地点所在的郡上；是转换的输入，不是行里的特例。
const WEATHER_CELL_PLACE = 'loc_hw';
const JURIS = Object.freeze({ world: 'juris_world', 省: 'juris_province', 郡: 'juris_county' });

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

function terrainOf(text, owner) {
  const key = TERRAIN_OF_TEXT[text];
  if (key === undefined) throw new Error(`convert-geo: terrain text not in the mapping table: "${text}" (${owner})`);
  return { terrain: `terrain_${key}`, from: text };
}

/**
 * 旧数据 → 新行与边。geoDir 是旧数据目录（world/geo）。
 * @param {string} geoDir
 */
export function convertGeo(geoDir) {
  const locations = readJson(join(geoDir, 'locations.json'));
  const regions = readJson(join(geoDir, 'regions.json'));
  const routes = readJson(join(geoDir, 'routes.json'));
  const biomes = readJson(join(geoDir, 'biomes.json')).locations;
  const weather = readJson(join(geoDir, 'weather-cell.json'));
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

  // 世界根。
  put(WORLD_ROOT.id, { basis: '世界根：旧 mapHierarchy 最上一级"已知大陆片区"；卷五 §4.14.1 要世界根一行，无别的旧值', classes: ['comp_region'], parent: null, regionLevel: JURIS.world }, WORLD_ROOT.name);

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
      classes: ['comp_region'],
      coord: { x: meters(r.center[0]), y: meters(r.center[1]) },
      parent,
      regionLevel: level,
      terrain: t.terrain,
    };
    if (r.category === 'county') {
      // 天气单元（卷二十 §2.7）：每郡一个单元；起始地区的单元带 weather-cell.json 的值，其余郡旧数据没有气候数值，不写、不借别郡（列为未建）。
      row.classes.push('comp_weather_cell');
      if (r.id === startCounty) {
        Object.assign(row, weather.cell);
        row.elevationM = weather.cellElevationM;
        row.basis += '；天气单元取 world/geo/weather-cell.json（太原站 WMO 53772，6-29），elevationM 取其 cellElevationM';
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

  for (const o of locations) {
    // 父：旧 parent；旧 parent 为空者挂所属郡；county.places 点名所属郡的地点以郡为父（旧 parent 与所属郡冲突的 6 处，见回报）。
    const county = countyOfPlace.get(o.id);
    let parent;
    if (county !== undefined) parent = newId(county);
    else if (o.parent !== null) parent = newId(o.parent);
    else throw new Error(`convert-geo: ${o.id} has neither parent nor county`);
    const t = terrainOf(o.terrain, o.id);
    const row = {
      basis: `旧 world/geo/locations.json（旧 id ${o.id}）；terrain 取旧文本"${t.from}"的主地形（migrated-from-text 候选，待人工核对）；coord 取旧 coordinates（千米折米）`,
      coord: { x: meters(o.coordinates[0]), y: meters(o.coordinates[1]) },
      parent,
      terrain: t.terrain,
    };
    const area = biomes[o.id]?.areaKm2;
    if (area !== undefined) row.areaM2 = round4(area * 1e6);
    if (o.access !== undefined) {
      const entry = ACCESS_OF_MODE[o.access.mode];
      if (entry === undefined) throw new Error(`convert-geo: ${o.id} access mode "${o.access.mode}" not in the mapping table`);
      row.accessClass = entry;
    }
    if (waterEnds.has(newId(o.id))) row.waterAccess = [WATER_NAVIGABLE];
    put(newId(o.id), row, o.name);
  }

  // 边：一条路线一条边；无向，from 的 id 字典序小于 to；水路与陆路按 waterway 区分。
  const edges = routes.map((r) => {
    const a = newId(r.from); const b = newId(r.to);
    // 路网边只存"两个站点之间有路"，不存路长（拍板第 12 条，卷五 §4.1 规则 4：路程由栅格化路段派生）；旧 lengthKm 不再搬入。
    return { from: a < b ? a : b, to: a < b ? b : a, waterway: isWater(r) };
  }).sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : x.to > y.to ? 1 : Number(x.waterway) - Number(y.waterway)));
  return { rows, edges, labels };
}

// 键按字典序、缩进 1 空格：与仓库现有 world/ 数据文件同一写法。
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])]));
  return v;
}
const text = (v) => `${JSON.stringify(sorted(v), null, 1)}\n`;

function main() {
  const check = process.argv.includes('--check');
  const out = convertGeo(join(REPO, 'world/geo'));
  const place = readJson(join(REPO, PLACE_FILE));
  const labels = readJson(join(REPO, LABEL_FILE));
  const nextPlace = text({ ...place, rows: out.rows, edges: out.edges });
  const nextLabels = text({ ...labels, ...out.labels });
  // 工作区在 Windows 上可能被 git 换成 CRLF（core.autocrlf），比对前统一成 LF。
  const lf = (file) => readFileSync(join(REPO, file), 'utf8').replace(/\r\n/g, '\n');
  const same = nextPlace === lf(PLACE_FILE) && nextLabels === lf(LABEL_FILE);
  if (check) { process.exit(same ? 0 : 1); }
  writeFileSync(join(REPO, PLACE_FILE), nextPlace);
  writeFileSync(join(REPO, LABEL_FILE), nextLabels);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
