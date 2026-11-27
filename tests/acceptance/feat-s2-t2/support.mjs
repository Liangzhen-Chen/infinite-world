// S2-T2（天气单元与当日天气）黑盒验收支撑。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t2。
// 只提供：天气词表与地点数据的期望值（从 world/ 读，不写死代号、日数、分钟数）、开局与夹具副本、weatherAt 的调用包装、
// 天气类读数的形状检查。不 mock 任何内核、规则或入口；前提全部由真实动作或数据夹具（临时副本）造；不直接调内部函数以外的东西。
// 依赖 S2-T1 的支撑（开局、等待、相位、单元解析），不复制其实现。
import assert from 'node:assert/strict';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as T1 from '../feat-s2-t1/support.mjs';
import { express } from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

export const { ROOT, loadJson, ruleValue, canon, stateJson, keysDeep, walk, stripComments, literalsOf, relPath, phaseAt, MINUTES_PER_DAY, ACT_WAIT_MAX, isOk, cellOf, PLACE_DIM_PATH } = T1;

// —— 词表与地点数据的期望值 ——
export const WX_ENTRIES = loadJson(join(ROOT, 'world/ontology/dimensions/_vocab.json')).families.weather.entries;
export const WX_CODES = Object.keys(WX_ENTRIES).sort();
export const PLACE_ROWS = loadJson(join(ROOT, PLACE_DIM_PATH)).rows;
export const ANCHOR_DAYS = ruleValue('weather.json', 'anchorDays');
export const CLIMATE_PROTO = loadJson(join(ROOT, 'world/rules/tables/climate-proto.json')).rows;

const hasClass = (id, cls) => PLACE_ROWS[id]?.classes?.includes(cls) === true;
const CELL_CLASS = 'comp_weather_cell';
// 挂单元类的地点（只扫描，不写 id）。
export const allCells = () => Object.keys(PLACE_ROWS).filter((k) => hasClass(k, CELL_CLASS));
// 挂单元类且带天气常见度的单元（当前数据里只有一个；取第一个，不写死）。
export const weatherCell = () => {
  const c = allCells().find((k) => PLACE_ROWS[k].weatherCommonality !== undefined);
  assert.ok(c, '数据里应有挂单元类且带 weatherCommonality 的单元（前提）');
  return c;
};
// 挂单元类但无 weatherCommonality 的单元（不写 id）。
export const gapCell = () => {
  const c = allCells().find((k) => PLACE_ROWS[k].weatherCommonality === undefined);
  assert.ok(c, '数据里应有挂单元类而无 weatherCommonality 的单元（前提）');
  return c;
};
// 天气常见度最高的行（用于前提：它必然会出现）。
export const topCommonalityRow = (cell) => {
  const cm = PLACE_ROWS[cell].weatherCommonality;
  return Object.keys(cm).sort((a, b) => cm[b] - cm[a])[0];
};

// 天气读数的六个数值键（menu 的 now.weather 只带这些键，不带 gaps）。
export const WX_KEYS = ['state', 'precipMm', 'windMps', 'windDirDeg', 'cloud', 'humidity'];
export const pickWx = (v) => Object.fromEntries(WX_KEYS.map((k) => [k, v[k]]));
export const angDiff = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

// —— 临时根与装配 ——
const ROOTS = [];
export function cleanup() {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
}
const newSaveRoot = (tag) => {
  const r = testTempRoot(tag);
  ROOTS.push(r);
  return r;
};

// 真实仓库的 rules/time_env/weather.mjs 模块（weatherAt 从这里取）。
export const wxMod = () => import(pathToFileURL(join(ROOT, 'server-plugin/rules/time_env/weather.mjs')).href);
// 在真实仓库上装配：返回 {world, saveRoot, wx}。
export async function openDefault() {
  const saveRoot = newSaveRoot('s2t2-save-');
  const mod = await import(pathToFileURL(join(ROOT, 'server-plugin/index.mjs')).href);
  const world = await mod.init(express.Router(), { saveRoot });
  return { world, saveRoot, wx: await wxMod() };
}

// 在数据夹具（临时副本）上装配。edit(fx) 在装配前改副本里的数据；fx 为 copyRepo 的结果（root、repo）。
export async function openFixture(edit) {
  const fx = copyRepo();
  ROOTS.push(fx.root);
  edit(fx);
  const saveRoot = newSaveRoot('s2t2-save-');
  const mod = await import(pathToFileURL(join(fx.repo, 'server-plugin/index.mjs')).href);
  const world = await mod.init(express.Router(), { saveRoot });
  const wx = await import(pathToFileURL(join(fx.repo, 'server-plugin/rules/time_env/weather.mjs')).href);
  return { world, saveRoot, wx };
}

// 改副本里的一份 world 数据：fn(doc) 改 doc 后写回副本（只写临时根）。
export function editWorldJson(fx, rel, fn) {
  const p = join(fx.repo, rel);
  const doc = loadJson(p);
  fn(doc);
  writeUnderTempRoot(fx.root, relative(fx.root, p).split(sep).join('/'), JSON.stringify(doc, null, 1));
}

// —— weatherAt 包装（入口：rules/time_env/weather.mjs#weatherAt(engine, state, cellId, day)）——
export const wxAt = (h, cell, day) => h.wx.weatherAt(h.world.engine, h.world.state, cell, day);
// 连续多日的状态序列（只取状态代号；未知日记为 null，测试里再断言）。
export const stateSeries = (h, cell, days) => days.map((d) => {
  const f = wxAt(h, cell, d);
  return f.known ? f.value.state : null;
});
// 天气读数的缺口：Fact 的 gaps 与值内 gaps 合并。
export const gapsOfFact = (f) => [...(f.gaps ?? []), ...(f.value?.gaps ?? [])];

// —— 开局（选有天气单元的落脚处）——
// 落脚处下标：其所在单元挂 weatherCommonality（前提：数据里有这样的落脚处）。
export function lodgeWithWeather(offer) {
  return offer.findIndex((id) => {
    const c = cellOf(id);
    return c !== null && PLACE_ROWS[c].weatherCommonality !== undefined;
  });
}
export function lodgeWithoutWeather(offer) {
  return offer.findIndex((id) => {
    const c = cellOf(id);
    return c !== null && PLACE_ROWS[c].weatherCommonality === undefined;
  });
}
// 开一局并选挂天气单元的落脚处（经 act_choose_origin）。
export async function startWeatherAvatar() {
  const { world, saveRoot } = await T1.freshWorld();
  const idx = lodgeWithWeather(T1.lodgeOffer(world));
  assert.ok(idx >= 0, '前提：开局候选里应有落脚处位于挂天气常见度的单元');
  return T1.chooseOn(world, saveRoot, idx);
}
export { T1 };
