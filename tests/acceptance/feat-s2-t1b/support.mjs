// S2-T1b 黑盒验收支撑（地区节律：季节与节气按所在天气单元的 seasonScheme、termScheme、phaseOffset 派生；卷二十勘误 S2-T1b）。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-t1b。依据与每条测的是什么见 docs/卡档案/feat-s2-t1b/出题.md。
// 只提供：临时根与夹具副本、经 init 的开局与等待（world.menu、act、advance、save，loadSlot、replay_apply）、从 world/ 数据读期望值。
// 不 mock 任何内核、规则或入口；前提全部由真实动作造；期望的代号与数值都从 world/ 读，不写死。
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { express } from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

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
export const PLACE_PATH = 'world/ontology/dimensions/place.json';
export const ASTRO_PATH = 'world/rules/tables/astro.json';

// —— 单位与历元（卷二十 §2.2；分钟、日、年的换算全部从 world 读）——
const UNITS = DIM('_units.json').units;
const unitSi = (id) => {
  const u = UNITS.find((x) => x.id === id);
  assert.ok(u && typeof u.si === 'number', `_units.json 应有单位 ${id}`);
  return u.si;
};
export const MINUTES_PER_DAY = unitSi('day') / unitSi('minute');
const yearDays = ruleValue('astro.json', 'yearDays');
export const YEAR_MINUTES = (yearDays.num / yearDays.den) * MINUTES_PER_DAY;
export const PHASE_EPOCH = ruleValue('astro.json', 'phaseEpochMinute');

export const mod1 = (x) => ((x % 1) + 1) % 1;
// 世界太阳相位（卷二十:689 全局一条）：frac((分钟 − 历元) ÷ 年长)。只用于推算期望，不作读数来源。
export const worldPhaseAt = (minute) => mod1((minute - PHASE_EPOCH) / YEAR_MINUTES);
export const fracOf = (f) => {
  assert.ok(f && typeof f === 'object' && Number.isInteger(f.num) && Number.isInteger(f.den) && f.den > 0, `分数应为 {num, den}：${JSON.stringify(f)}`);
  return f.num / f.den;
};
// 从 fromMinute 起，世界相位第一次到达 phase 的分钟（不早于 fromMinute）。
export const minuteAtPhase = (fromMinute, phase) => fromMinute + Math.round(mod1(phase - worldPhaseAt(fromMinute)) * YEAR_MINUTES);

// —— 地点与单元（place.json 的 comp_weather_cell 行）——
export const PLACE_ROWS = DIM('place.json').rows;
const WEATHER_CELL_CLASS = 'comp_weather_cell';
const BUILDING_CLASS = 'comp_facility';
export const ancestorsOf = (rows, id) => {
  const out = [];
  let p = rows[id]?.parent;
  while (p) {
    out.push(p);
    p = rows[p]?.parent;
  }
  return out;
};
// 地点自身或最近祖先中挂 comp_weather_cell 的那一个（卷二十:335 单元解析；只用于挑选前提）。
export const cellOfIn = (rows, id) => [id, ...ancestorsOf(rows, id)].find((k) => rows[k]?.classes?.includes(WEATHER_CELL_CLASS)) ?? null;
export const placeRowsAt = (base) => loadJson(join(base, PLACE_PATH)).rows;
export const isBuilding = (id) => PLACE_ROWS[id]?.classes?.includes(BUILDING_CLASS) === true;

// 单元的本地节律数据（卷二十勘误 S2-T1b）：季节方案、节气方案、相位偏移。原样读，缺即为 undefined，由期望推算处断言。
export const specOf = (rows, cellId) => {
  const r = rows[cellId];
  assert.ok(r, `place.json 应有单元行 ${cellId}`);
  return { cellId, seasonScheme: r.seasonScheme, termScheme: r.termScheme, phaseOffset: r.phaseOffset };
};

// —— 词表行（_vocab.json 的 season 族与 solar_term 族；行上的 scheme 指向方案，phaseFrom、phaseTo 为分数）——
const VOCAB = DIM('_vocab.json').families;
const rowsOfFamily = (entries, scheme) => Object.entries(entries ?? {})
  .filter(([, e]) => e.scheme === scheme)
  .map(([id, e]) => ({ id, from: fracOf(e.phaseFrom), to: fracOf(e.phaseTo) }))
  .sort((a, b) => a.from - b.from);
export const seasonRowsOf = (scheme) => rowsOfFamily(VOCAB.season.entries, scheme);
export const termRowsOf = (scheme) => rowsOfFamily(VOCAB.solar_term.entries, scheme);

const rowAt = (rows, p, what) => {
  const hit = rows.filter((r) => p >= r.from && p < r.to);
  assert.equal(hit.length, 1, `${what}：本地相位 ${p} 应恰落在一行内（方案共 ${rows.length} 行）`);
  return hit[0].id;
};
// 期望（卷二十:691 取当日相位的行，勘误 S2-T1b 按单元偏移与方案过滤）：当日起始分钟的世界相位 + 单元偏移，取小数，
// 再查本单元季节方案的季节行与节气方案的节气行。节气方案缺即节气期望为 null。
export function expectAt(spec, now) {
  const offset = fracOf(spec.phaseOffset);
  const dayStart = now.minute - now.minuteOfDay;
  const local = mod1(worldPhaseAt(dayStart) + offset);
  assert.ok(spec.seasonScheme, '单元应有季节方案');
  const season = rowAt(seasonRowsOf(spec.seasonScheme), local, `季节方案 ${spec.seasonScheme}`);
  const solarTerm = spec.termScheme === undefined ? null : rowAt(termRowsOf(spec.termScheme), local, `节气方案 ${spec.termScheme}`);
  return { local, season, solarTerm };
}
// 行的中点在时间上的出现（从 fromMinute 起，按时间排序）。
export const midpointMinutes = (rows, offset, fromMinute) => rows
  .map((r) => ({ id: r.id, minute: minuteAtPhase(fromMinute, mod1((r.from + r.to) / 2 - offset)) }))
  .sort((a, b) => a.minute - b.minute);
// 行的起点（本地相位 phaseFrom）在时间上的出现（从 fromMinute 起，按时间排序）。
export const boundaryMinutes = (rows, offset, fromMinute) => rows
  .map((r) => ({ id: r.id, minute: minuteAtPhase(fromMinute, mod1(r.from - offset)) }))
  .sort((a, b) => a.minute - b.minute);

// —— 临时根与夹具 ——
const ROOTS = [];
const newRoot = (prefix) => {
  const r = testTempRoot(prefix);
  ROOTS.push(r);
  return r;
};
export function cleanup() {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
}
export async function freshWorld() {
  const saveRoot = newRoot('s2t1b-save-');
  const world = await init(express.Router(), { saveRoot });
  return { world, saveRoot };
}
export function copyFixture() {
  const c = copyRepo();
  ROOTS.push(c.root);
  return c;
}
// 只在副本里改数据：mutate 收到副本的 JSON 文档，写回临时根下。
export function editJson(fx, rel, mutate) {
  const p = join(fx.repo, rel);
  const doc = loadJson(p);
  mutate(doc);
  writeUnderTempRoot(fx.root, relative(fx.root, p).split(sep).join('/'), JSON.stringify(doc, null, 1));
}
// 副本里起一局：经副本自己的 server-plugin/index.mjs#init（与真仓库不共享装配）。
export async function bootFixture(fx) {
  const mod = await import(pathToFileURL(join(fx.repo, 'server-plugin', 'index.mjs')).href);
  const saveRoot = newRoot('s2t1b-save-');
  const world = await mod.init(express.Router(), { saveRoot });
  return { world, saveRoot };
}

// —— 通用读法 ——
export const isOk = (r) => r?.ok === true || r?.result === 'ok';
export const canon = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'bigint') return `${x}n`;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});

// 开局菜单里 act_choose_origin 的落脚处候选（lodge 为建筑 id 数组；lodge 槽必填，缺即 E-ACT-SLOT）。
export function lodgeOffer(world) {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.lodge), 'act_choose_origin 应给出 lodge 候选');
  return a.slots.lodge;
}
const newPersons = (world, before) => Object.keys(world.state.created ?? {})
  .filter((id) => !before.includes(id) && world.state.created[id].kind === 'person');
// 在给定的 world 上选第 lodgeIndex 个落脚处。
export async function chooseOn(world, saveRoot, lodgeIndex) {
  const offer = lodgeOffer(world);
  const before = Object.keys(world.state.created ?? {});
  const r = await world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge: lodgeIndex } });
  assert.equal(isOk(r), true, `选来历（落脚处下标 ${lodgeIndex}）应成功：${JSON.stringify(r)}`);
  const [avatar] = newPersons(world, before);
  assert.ok(avatar, '选来历应新建化身');
  return { world, saveRoot, avatar, offer, lodge: offer[lodgeIndex] };
}
// 开一局并选第 lodgeIndex 个落脚处（开局的化身在该建筑内，建筑所在单元即本局的单元）。
export async function startAt(lodgeIndex = 0) {
  const { world, saveRoot } = await freshWorld();
  return chooseOn(world, saveRoot, lodgeIndex);
}

// 化身 view 的 now（界面命令 view 的回复）。读数必须存在，缺即报错。
export const nowOf = (world, avatar) => {
  const now = world.menu(avatar).now;
  assert.ok(now && typeof now === 'object', '化身的 view 回复应带 now');
  return now;
};

// 等待：act_wait 单次上限一日（1440 分），跨多日时分段等待；advance 不受上限约束。
export async function waitMinutes(world, actor, minutes) {
  const r = await world.act({ act: 'act_wait', actor, numbers: { minutes } });
  assert.equal(isOk(r), true, `act_wait ${minutes} 应成功：${JSON.stringify(r)}`);
}
export async function advanceBy(world, minutes) {
  const r = await world.advance(minutes);
  assert.equal(isOk(r), true, `推进 ${minutes} 分钟应成功：${JSON.stringify(r)}`);
}
export async function advanceTo(world, minute) {
  const d = minute - world.state.clock.minute;
  assert.ok(d >= 0, `时钟 ${world.state.clock.minute} 不能倒回到 ${minute}`);
  if (d > 0) await advanceBy(world, d);
}

// 递归收集键名（用于断言 state 与存档里没有派生读数的路径）。
export function keysDeep(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  }
  return out;
}

// 规则层与入口的源码文件（递归列出 .mjs）。
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
