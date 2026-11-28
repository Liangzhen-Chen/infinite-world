// S2-P（位置写者：placeSubject、zoneAt、move）黑盒验收支撑。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2p。
// 只提供：临时根与仓库副本（夹具）、产品入口的薄包装（开局、选落脚处、提案、推进、存读档）、从状态与 world/ 数据读期望值。
// 不 mock 任何内核、规则或入口；前提全部由真实动作造；期望值的 id、数值都从 world/ 读，不写死。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { express } from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';
// 统治归属判定（数据推算）：取 tests/support/governor-of-data.mjs，不经别卡的验收目录。
import { ownerOfPlace } from '../../support/governor-of-data.mjs';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
export const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dimension = (name) => loadJson(join(WORLD, 'ontology/dimensions', name));
const ruleRows = (file) => loadJson(join(WORLD, 'rules/tables', file)).rows;
export const ruleValue = (file, key) => {
  const row = ruleRows(file).find((r) => r.key === key);
  assert.ok(row, `${file} 应有规则行 ${key}`);
  return row.value;
};

// —— 数据（期望值来源）——
export const PLACE = dimension('place.json');
export const PLACE_ROWS = PLACE.rows; // 地点行（卷五 §2；parent、genOpen、classes）
export const GENERATED = PLACE.generated; // 生成行：建筑的 anchor、planCells、storeys、facing（卷五 §2.1 建筑足迹）
export const COMPONENT_IDS = Object.keys(dimension('_vocab.json').families.component.entries);
// 建筑的组件类（卷五:462 规则 2）：挂该组件类的地点行即建筑。
export const BUILDING_CLASS = 'comp_facility';
export const isBuilding = (id) => PLACE_ROWS[id]?.classes?.includes(BUILDING_CLASS) === true;
export const BUILDING_IDS = Object.keys(PLACE_ROWS).filter(isBuilding);
// 祖先链（不含自身，由近到远）。
export function ancestorsOf(rows, id) {
  const out = [];
  let p = rows[id]?.parent;
  while (p) {
    out.push(p);
    p = rows[p]?.parent;
  }
  return out;
}
// 开放（genOpen）：自身或某个祖先 genOpen 为真。
export const isUnderOpen = (rows, id) => [id, ...ancestorsOf(rows, id)].some((k) => rows[k]?.genOpen === true);
// 访问类别（_vocab access 族）：needsGrant 为真者需许可才能进（卷五 §2.1 :144；私宅、议会）。
const ACCESS_ENTRIES = dimension("_vocab.json").families.access.entries;
// 建筑的 accessClass 读不到（行上没有该字段）则不筛（裁定 Q1 甲：按现有数据能判则判）。
export const needsGrantOf = (rows, id) => {
  const a = rows[id]?.accessClass;
  return a !== undefined && ACCESS_ENTRIES[a]?.needsGrant === true;
};
// 开放子树里的建筑（未筛前）。
const openBuildings = (rows) => Object.keys(rows)
  .filter((k) => rows[k].classes?.includes(BUILDING_CLASS) && isUnderOpen(rows, k));
// 期望的落脚处候选：开放地点子树里的建筑，减去 accessClass 的 needsGrant 为真者（卷五 gen.open 口径；Q1 甲裁定「私宅筛除按现有数据能判则判」；候选从 world 数据推出）。
export const expectedLodges = (rows) => openBuildings(rows)
  .filter((k) => !needsGrantOf(rows, k))
  .sort();
// 被许可条件筛掉的开放建筑（两向断言用：这些都不得在候选里）。
export const grantRestrictedLodges = (rows) => openBuildings(rows)
  .filter((k) => needsGrantOf(rows, k))
  .sort();
// 朝向档数与整圈角度：grid.json 常数（卷五:102、卷五规则 12）。
export const FACING_DIRECTIONS = ruleValue('grid.json', 'facingDirections');
export const FULL_TURN_DEG = ruleValue('grid.json', 'fullTurnDeg');
// 建筑的初次朝向：取目标地点行的 facing 维度（卷十七:304），缺则 rules.travel.initialFacing（卷十七:304 设计册取值）。
export const initialFacingOf = (placeId) => GENERATED[placeId]?.facing ?? ruleValue('travel.json', 'initialFacing');

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
  const saveRoot = newRoot('s2p-save-');
  const world = await init(express.Router(), { saveRoot });
  return { world, saveRoot };
}
export function copyFixture() {
  const c = copyRepo();
  ROOTS.push(c.root);
  return c;
}
export function editJson(fx, rel, mutate) {
  const p = join(fx.repo, rel);
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  mutate(doc);
  writeUnderTempRoot(fx.root, relative(fx.root, p).split(sep).join('/'), JSON.stringify(doc, null, 1));
}
export async function bootFixture(fx) {
  const mod = await import(pathToFileURL(join(fx.repo, 'server-plugin', 'index.mjs')).href);
  const saveRoot = newRoot('s2p-save-');
  return mod.init(express.Router(), { saveRoot });
}

// —— 结果与状态的通用读法 ——
export const isOk = (r) => r?.ok === true || r?.result === 'ok';
export const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');
export const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const isInput = (e) => e.kind === 'command' || e.kind === 'advance';
export function snap(world) {
  return {
    clock: world.state.clock.minute,
    created: Object.keys(world.state.created ?? {}).sort(),
    json: stateJson(world.state),
    logLen: world.logBook.entries.length,
  };
}
// 拒收：state 与时钟不动；日志恰多一条输入条目与一条拒绝事件，事件的 seq 等于结果的 seq（卷二:545）。
export function assertRejected(world, before, r, code) {
  assert.equal(isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  if (code) assert.ok(codeOf(r).includes(code), `拒收码应为 ${code}，实得 ${codeOf(r)}`);
  assert.equal(world.state.clock.minute, before.clock, '拒收时时钟不动');
  assert.equal(stateJson(world.state), before.json, '拒收时 state 逐位不变');
  const added = world.logBook.entries.slice(before.logLen);
  const inputs = added.filter(isInput);
  const events = added.filter((e) => !isInput(e));
  assert.equal(inputs.length, 1, '拒收时日志恰多一条输入条目');
  assert.equal(events.length, 1, '拒收时日志恰多一条拒绝事件');
  assert.equal(events[0].kind, 'event');
  assert.equal(events[0].ok, false, '拒绝事件应为 ok:false');
  assert.equal(events[0].seq, r.seq, '拒绝事件的 seq 应为结果的请求编号');
}
export function thrownCode(fn) {
  try {
    fn();
  } catch (e) {
    return String(e?.code ?? e?.message ?? e);
  }
  return null;
}
export const canon = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'bigint') return `${x}n`;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});

// —— 开局与动作 ——
// 开局菜单里 act_choose_origin 的某个槽的候选（下标即 act 的槽值；lodge 为落脚处建筑 id 数组）。
export function slotOffer(world, slot) {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.[slot]), `act_choose_origin 应给出 ${slot} 候选`);
  return a.slots[slot];
}
export const lodgeOffer = (world) => slotOffer(world, 'lodge');
// 选来历（origin 与 place 取下标 0，species 取下标 0），落脚处取 lodge 候选的下标。
// 落脚处须与所选出生地同归属（掌管组织相同，统治归属判定，不看包含树；卷八:1708 勘误、卷十:499）。出生地由数据推算：取与落脚处同归属的那一项（找不到即报错，不随意配对）。
export const chooseLodge = (world, lodgeIndex) => {
  const lodge = slotOffer(world, 'lodge')[lodgeIndex];
  const places = slotOffer(world, 'place');
  const owner = ownerOfPlace(ROOT, lodge);
  const placeIndex = places.findIndex((p) => owner !== null && ownerOfPlace(ROOT, p) === owner);
  assert.ok(placeIndex >= 0, `出生地候选里应有与落脚处 ${lodge} 同归属的一项`);
  return world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: placeIndex, lodge: lodgeIndex } });
};
export const newPersons = (world, before) => Object.keys(world.state.created ?? {})
  .filter((id) => !before.created.includes(id) && world.state.created[id].kind === 'person');
// 开一局并选第 lodgeIndex 个落脚处；返回化身 id。
export async function startAt(lodgeIndex) {
  const { world, saveRoot } = await freshWorld();
  const before = snap(world);
  // 候选须在选之前读：化身建立后开局菜单不再列 act_choose_origin。
  const offer = lodgeOffer(world);
  const r = await chooseLodge(world, lodgeIndex);
  assert.equal(isOk(r), true, `选来历（落脚处下标 ${lodgeIndex}）应成功：${JSON.stringify(r)}`);
  const [avatar] = newPersons(world, before);
  assert.ok(avatar, '选来历应新建化身');
  return { world, saveRoot, avatar, offer, lodge: offer[lodgeIndex] };
}
// 化身的位置与朝向（卷二 §5.5、卷十七 §2.3：pos、facing 是 created.<id>.props 的维度）。
export const posOf = (world, id) => world.state.created[id].props.pos;
export const facingOf = (world, id) => world.state.created[id].props.facing;
// 化身的「我在哪」（menu(化身) 的回复带 here {place, chain}，卷十七/卷五:444 placeChainOf）。
export const hereOf = (world, avatar) => world.menu(avatar).here ?? null;
// 提案：移动原语 move（primitives.json：required {to}，optional {subject, facing}）。
export const moveTo = (world, subject, to, facing) => world.submitProposal({
  effects: [{ op: 'move', to, ...(subject === undefined ? {} : { subject }), ...(facing === undefined ? {} : { facing }) }],
});

// 方位角 → 朝向档（卷五规则 12 取法：dx 向东为正、dy 向北为正，正北为 0、顺时针；档宽 = 整圈 ÷ 档数，半档偏移取最近档）。
// 落在档界附近（半度之内）的返回 null，由调用方跳过，不硬断言。
export function sectorOf(dx, dy) {
  const deg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const width = FULL_TURN_DEG / FACING_DIRECTIONS;
  const frac = (deg + width / 2) / width;
  if (Math.abs(frac - Math.round(frac)) * width < 0.5) return null;
  return Math.floor(frac) % FACING_DIRECTIONS;
}
