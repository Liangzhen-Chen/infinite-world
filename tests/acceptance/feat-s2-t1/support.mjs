// S2-T1（历法、季节、节气、菜单 now）黑盒验收支撑。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2t1。
// 只提供：临时根、开局与等待的薄包装（全部经 init 返回的 world 的 menu、act、advance、save，以及 loadSlot、replay_apply）、
// 从 world/ 数据读期望值（相位、季节行、节气行、单位换算）。不 mock 任何内核、规则或入口；前提全部由真实动作造；不直接调内部函数。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { express } from '../../support/express.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
export const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const DIM = (name) => loadJson(join(WORLD, 'ontology/dimensions', name));
const TABLE = (name) => loadJson(join(WORLD, 'rules/tables', name));
export const ruleValue = (file, key) => {
  const row = TABLE(file).rows.find((r) => r.key === key);
  assert.ok(row, `${file} 应有规则行 ${key}`);
  return row.value;
};

// —— 单位与历元（卷二十 §2.2；分钟、日、年的换算全部从 world 读）——
const UNITS = DIM('_units.json').units;
const unitSi = (id) => {
  const u = UNITS.find((x) => x.id === id);
  assert.ok(u && typeof u.si === 'number', `_units.json 应有单位 ${id}`);
  return u.si;
};
export const MINUTES_PER_DAY = unitSi('day') / unitSi('minute'); // 1440
const yearDays = ruleValue('astro.json', 'yearDays'); // {num, den}，天
export const YEAR_MINUTES = (yearDays.num / yearDays.den) * MINUTES_PER_DAY;
export const PHASE_EPOCH = ruleValue('astro.json', 'phaseEpochMinute');
export const ACT_WAIT_MAX = ruleValue('act.json', 'advanceMaxMinutes').acls_rest;

// 相位：frac((minute − phaseEpochMinute) ÷ 年长分钟)，北半球（卷二十:689；Q5 未落地前无负纬度地点）。
export const phaseAt = (minute) => ((((minute - PHASE_EPOCH) / YEAR_MINUTES) % 1) + 1) % 1;
const fracOf = (f) => f.num / f.den;

// 季节词表行（卷二十:691 地点季节取含当日相位的行；season 族，四季 4 行）。
export const SEASON_ENTRIES = DIM('_vocab.json').families.season.entries;
export const seasonRows = () => Object.entries(SEASON_ENTRIES)
  .map(([id, e]) => ({ id, from: fracOf(e.phaseFrom), to: fracOf(e.phaseTo), order: e.order }))
  .sort((a, b) => a.from - b.from);
export const seasonIdAt = (p) => {
  const row = seasonRows().find((r) => p >= r.from && p < r.to);
  assert.ok(row, `相位 ${p} 应落在某个季节行内`);
  return row.id;
};

// 节气词表行（solar_term 族，Q3 甲，24 行，按半球归一太阳相位切 [phaseFrom, phaseTo)）。族不存在时由调用方断言报错。
export const solarTermFamily = () => DIM('_vocab.json').families.solar_term;
export const solarTermRows = () => {
  const fam = solarTermFamily();
  assert.ok(fam && fam.entries, '词表应有族 solar_term（卷二十勘误 Q3 甲，24 行）');
  return Object.entries(fam.entries)
    .map(([id, e]) => ({ id, from: fracOf(e.phaseFrom), to: fracOf(e.phaseTo) }))
    .sort((a, b) => a.from - b.from);
};
export const solarTermIdAt = (p) => {
  const row = solarTermRows().find((r) => p >= r.from && p < r.to);
  assert.ok(row, `相位 ${p} 应落在某个节气行内`);
  return row.id;
};

// 分钟 → 该相位区间的中点分钟（离区间界远，取整误差不影响归属）。
export const midMinuteAfter = (fromMinute, p) => {
  const cur = phaseAt(fromMinute);
  const delta = ((p - cur) % 1 + 1) % 1;
  return fromMinute + Math.round(delta * YEAR_MINUTES);
};

// 祖先链（不含自身，由近到远），与地点行的 parent 字段（place.json）。
const PLACE_ROWS = DIM('place.json').rows;
export const ancestorsOf = (id) => {
  const out = [];
  let p = PLACE_ROWS[id]?.parent;
  while (p) {
    out.push(p);
    p = PLACE_ROWS[p]?.parent;
  }
  return out;
};
export const BUILDING_CLASS = 'comp_facility';
const WEATHER_CELL_CLASS = 'comp_weather_cell';
// 地点自身或最近的祖先中挂 comp_weather_cell 的那一个（卷二十:635 单元解析的数据口径；只用于挑选前提，不作期望的代替）。
export const cellOf = (id) => [id, ...ancestorsOf(id)].find((k) => PLACE_ROWS[k]?.classes?.includes(WEATHER_CELL_CLASS)) ?? null;
export const PLACE_DIM_PATH = 'world/ontology/dimensions/place.json';

// —— 临时根与开局 ——
const ROOTS = [];
export function cleanup() {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
}
export async function freshWorld() {
  const root = testTempRoot('s2t1-save-');
  ROOTS.push(root);
  const world = await init(express.Router(), { saveRoot: root });
  return { world, saveRoot: root };
}

// —— 通用读法 ——
export const isOk = (r) => r?.ok === true || r?.result === 'ok';
export const canon = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'bigint') return `${x}n`;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});
export const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

// 开局菜单里 act_choose_origin 的候选（lodge 为落脚处建筑 id 数组）。化身建立后开局菜单不再列该动作，须在选之前读。
export function lodgeOffer(world) {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.lodge), 'act_choose_origin 应给出 lodge 候选');
  return a.slots.lodge;
}
export const newPersons = (world, before) => Object.keys(world.state.created ?? {})
  .filter((id) => !before.includes(id) && world.state.created[id].kind === 'person');

// 在给定的 world 上选第 lodgeIndex 个落脚处（夹具副本用）。
export async function chooseOn(world, saveRoot, lodgeIndex) {
  const offer = lodgeOffer(world);
  const before = Object.keys(world.state.created ?? {});
  const r = await world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge: lodgeIndex } });
  assert.equal(isOk(r), true, `选来历（落脚处下标 ${lodgeIndex}）应成功：${JSON.stringify(r)}`);
  const [avatar] = newPersons(world, before);
  assert.ok(avatar, '选来历应新建化身');
  return { world, saveRoot, avatar, offer, lodge: offer[lodgeIndex] };
}
// 开一局并选第 lodgeIndex 个落脚处（species、origin、place 取下标 0；S1-3d、S2-P 起 species 与 lodge 必填）。
export async function startAt(lodgeIndex = 0) {
  const { world, saveRoot } = await freshWorld();
  return chooseOn(world, saveRoot, lodgeIndex);
}

// 有季节方案的单元（comp_weather_cell 行上带 seasonScheme；现在只有起始郡有，卷二十 §4.4 数据口径）。
export const dataCellOf = (id) => [id, ...ancestorsOf(id)].find((k) => PLACE_ROWS[k]?.classes?.includes(WEATHER_CELL_CLASS) && PLACE_ROWS[k].seasonScheme !== undefined) ?? null;
// 下标 → 该落脚处所在单元有季节方案的候选下标（找不到则返回 -1，由调用方断言前提）。
export const lodgeIndexWithCell = (offer) => offer.findIndex((id) => dataCellOf(id) !== null);

// 化身 view 的 now（界面命令 view 的回复；卷二十 §4 Now 形状，本卡草案 §4）。
// 读数必须存在（缺 now 即报错，不把缺失当成相等；否则 canon(null) 与 canon(null) 会假通过）。
export const nowOf = (world, avatar) => {
  const now = world.menu(avatar).now;
  assert.ok(now && typeof now === 'object', '化身的 view 回复应带 now（卷二十派生读数）');
  return now;
};
export const nowOfNoAvatar = (world) => {
  const now = world.menu(null).now;
  assert.ok(now && typeof now === 'object', '开局 view 回复应带 now（只给系统时间）');
  return now;
};

// 等待：经 act_wait（数值槽 numbers.minutes；上限随 act.json 的 acls_rest 走，1440）。actor 为化身。
export async function waitMinutes(world, actor, minutes) {
  const r = await world.act({ act: 'act_wait', actor, numbers: { minutes } });
  assert.equal(isOk(r), true, `act_wait ${minutes} 应成功：${JSON.stringify(r)}`);
}
// 推进任意分钟数（advance 不受 act_wait 上限约束，同 S2-P 的 world.advance）。
export async function advanceBy(world, minutes) {
  const r = await world.advance(minutes);
  assert.equal(isOk(r), true, `推进 ${minutes} 分钟应成功：${JSON.stringify(r)}`);
}

// 递归找键名（state 里不得有 weather、season、calendar、solarTerm 路径）。
export function keysDeep(v, out = new Set(), path = '') {
  if (Array.isArray(v)) v.forEach((x, i) => keysDeep(x, out, `${path}[${i}]`));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out, `${path}.${k}`);
    }
  }
  return out;
}

// 规则层与入口的源码文件（注释不计；字符串字面量逐个比对用）。
export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.mjs')) out.push(p);
  }
  return out;
}
export const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
export const literalsOf = (code) => [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
export const relPath = (f) => relative(ROOT, f).split(sep).join('/');
