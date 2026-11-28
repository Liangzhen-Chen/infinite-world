// S2-TP1 镇村掌管与法阵设施黑盒验收支撑。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 只提供：临时根与仓库副本（夹具）、产品入口的薄包装（开局、选落脚处、存读档）、从 world/ 数据推算期望值的读法。
// 不 mock 任何内核、规则或入口；前提全部由真实开局造；期望的 id、数值、村名都从 world/ 数据读出，不写死。
// 期望推算的口径见 docs/卡档案/feat-s2-tp1/出题.md。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { express } from '../../support/express.mjs';
import { copyRepo } from '../../support/wire-host.mjs';
import { init, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';
// 数据读取与统治归属判定放在 tests/support/governor-of-data.mjs（旧卡验收题也从那里导入，不经本卡支撑）。
import { loadJson, placesOf, orgsOf, vocabOf, settlementOrgIds, ownerOfPlace, genesisEntriesOf } from '../../support/governor-of-data.mjs';
export { loadJson, placesOf, orgsOf, vocabOf, settlementOrgIds, ownerOfPlace };

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
// —— 数据读法（root 缺省为本仓库；夹具传副本根）——
// 规则表行：{rows:[{key,value}]}（与 world/rules/tables 其他表同形）；也容忍 rows 为对象。
export function tableRowsOf(root, file) {
  const path = join(root, 'world/rules/tables', file);
  if (!existsSync(path)) return {};
  const doc = loadJson(path);
  const out = {};
  if (Array.isArray(doc.rows)) for (const r of doc.rows) out[r.key] = r.value;
  else if (doc.rows && typeof doc.rows === 'object') for (const [k, v] of Object.entries(doc.rows)) out[k] = v;
  return out;
}
// 本地规矩条目在 _vocab.json 的 circle_rule 词表族（门禁 S6-2.b 不许规则表值里放实体 id，故不在 circle.json）。
export const circleRulesOf = (root) => (vocabOf(root).circle_rule?.entries ?? {});
export const isBuildingRow = (row) => Array.isArray(row?.classes) && row.classes.includes('comp_facility');

// 组织的开局公库（genesisFunds：[{resource, amount}]）之和；没写即 0。
export const fundsOfOrg = (org, currency) => genesisEntriesOf(org)
  .filter((e) => currency === undefined || e.resource === currency)
  .reduce((s, e) => s + e.amount, 0);

// 沿 parent 链取第一条非空的 circleRule（卷八:994 归属沿 parent 链向上；本卡 circleRuleOf）。
export function effectiveRuleCode(root, orgId) {
  const orgs = orgsOf(root);
  for (let id = orgId, i = 0; id && i < 100; i += 1) {
    const code = orgs[id]?.circleRule;
    if (code) return code;
    id = orgs[id]?.parent ?? null;
  }
  return null;
}

// —— 判据 rx 的最小求值（只读数据里的 buildRX 文本；不写任何规则名）——
const TOK = /\s*(>=|<=|==|!=|&&|\|\||[()<>*+\-/!]|\d+(?:\.\d+)?|[A-Za-z_][\w.]*)/y;
function tokenize(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i += 1; continue; }
    TOK.lastIndex = i;
    const m = TOK.exec(s);
    assert.ok(m, `rx 词法失败：${s.slice(i)}`);
    out.push(m[1]);
    i = TOK.lastIndex;
  }
  return out;
}
export function evalRX(text, env) {
  const t = tokenize(text);
  let p = 0;
  const peek = () => t[p];
  const eat = (x) => { assert.equal(t[p], x, `rx 期望 ${x}，实得 ${t[p]}（${text}）`); p += 1; };
  const atom = () => {
    const x = t[p];
    if (x === '(') { p += 1; const v = orExpr(); eat(')'); return v; }
    if (x === '!') { p += 1; return !atom(); }
    if (x === '-') { p += 1; return -atom(); }
    p += 1;
    if (/^\d/.test(x)) return Number(x);
    const v = x.split('.').reduce((o, k) => (o == null ? undefined : o[k]), env);
    assert.notEqual(v, undefined, `rx 读到未知命名空间 ${x}`);
    return v;
  };
  const mul = () => { let v = atom(); while (peek() === '*' || peek() === '/') { const op = t[p]; p += 1; const r = atom(); v = op === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (peek() === '+' || peek() === '-') { const op = t[p]; p += 1; const r = mul(); v = op === '+' ? v + r : v - r; } return v; };
  const cmp = () => {
    const v = add();
    const op = peek();
    if (!['>=', '<=', '>', '<', '==', '!='].includes(op)) return v;
    p += 1;
    const r = add();
    return op === '>=' ? v >= r : op === '<=' ? v <= r : op === '>' ? v > r : op === '<' ? v < r : op === '==' ? v === r : v !== r;
  };
  const andExpr = () => { let v = cmp(); while (peek() === '&&') { p += 1; const r = cmp(); v = v && r; } return v; };
  const orExpr = () => { let v = andExpr(); while (peek() === '||') { p += 1; const r = andExpr(); v = v || r; } return v; };
  const v = orExpr();
  assert.equal(p, t.length, `rx 尾部未读完：${text}`);
  return v;
}

// 推算「应有法阵的聚落」：只读 org.json、place.json、circle.json、_vocab.json 与 buildRX 文本。
// 户数＝归属本组织、intendedType 在该规矩 houseTypes 里的建筑数；公库＝genesisFunds 之和；阶行取 circle_tier 词表。
// 返回 Map：组织 id → {rule 代号, host（组织行 seatBuilding）, houses, funds}。
export function housesOf(root) {
  const places = placesOf(root);
  const houses = new Map();
  for (const id of Object.keys(places)) {
    const row = places[id];
    if (!isBuildingRow(row)) continue;
    const owner = ownerOfPlace(root, id);
    if (!owner) continue;
    const code = effectiveRuleCode(root, owner);
    if (!code || !circleRulesOf(root)[code]) continue;
    if (!(circleRulesOf(root)[code].houseTypes ?? []).includes(row.intendedType)) continue;
    houses.set(owner, (houses.get(owner) ?? 0) + 1);
  }
  return houses;
}
export function expectedCircleSites(root) {
  const orgs = orgsOf(root);
  const rules = circleRulesOf(root);
  const tiers = (vocabOf(root).circle_tier?.entries ?? {});
  const houses = housesOf(root);
  const out = new Map();
  for (const id of settlementOrgIds(root)) {
    const code = effectiveRuleCode(root, id);
    if (!code) continue;
    const rule = rules[code];
    const tier = tiers[rule.tier];
    assert.ok(tier, `规矩 ${code} 的阶 ${rule.tier} 应在 circle_tier 词表里`);
    const env = { site: { houses: houses.get(id) ?? 0 }, org: { funds: fundsOfOrg(orgs[id], rule.currency) }, tier, rule };
    if (evalRX(rule.buildRX, env)) out.set(id, { rule: code, host: orgs[id].seatBuilding ?? null, houses: env.site.houses, funds: env.org.funds });
  }
  return out;
}
// 白石镇衙署（组织行 orgKind 为 orgkind_town 的那一个聚落组织）。
export function townOrgOf(root) {
  const orgs = orgsOf(root);
  const towns = settlementOrgIds(root).filter((k) => orgs[k].orgKind === 'orgkind_town');
  assert.equal(towns.length, 1, '数据里应恰有一个镇衙署组织');
  return towns[0];
}
// 怪物社会：组织种类为 orgkind_monster_band 的组织，其 seat 为怪物社会地点（主会话接口约定：每处怪物社会各有一条自己的组织行，不挂白石镇）。
// 地点是否属怪物社会：自身或 parent 链上任一处是怪物社会 seat。测试不按 id 前缀写特例。
export function monsterSeatsOf(root) {
  const orgs = orgsOf(root);
  return new Set(Object.keys(orgs).filter((k) => orgs[k].orgKind === 'orgkind_monster_band').map((k) => orgs[k].seat));
}
export function isMonsterPlace(root, id) {
  const seats = monsterSeatsOf(root);
  const places = placesOf(root);
  for (let x = id, i = 0; x && i < 100; i += 1) {
    if (seats.has(x)) return true;
    x = places[x]?.parent ?? null;
  }
  return false;
}
// 持有种类代号从规则表读（不在测试里写死）：统治种类 = polity.json 的 rolesKinds.governs；法阵种类 = circle.json 等规则表里值为持有种类、键名含 circle/operat 的那一行。
export function governsKindOf(root) {
  const kinds = tableRowsOf(root, 'polity.json').rolesKinds;
  assert.ok(kinds?.governs, 'polity.json 的 rolesKinds 应登记统治种类');
  return kinds.governs;
}
export function circleKindOf(root) {
  const holdingKinds = (vocabOf(root).holding_kind?.entries ?? {});
  const kind = tableRowsOf(root, 'circle.json').holdingKind;
  assert.ok(typeof kind === 'string' && holdingKinds[kind], 'circle.json 应登记 holdingKind，值为 holding_kind 代号');
  return kind;
}

// —— 状态读法（世界状态的顶层键：holdings.<持有者>.<边 id>，accounts.<持有人>.<用途>.<资源>.<键>）——
export function edgesOf(state, kind) {
  const out = [];
  for (const [holder, book] of Object.entries(state.holdings ?? {})) {
    for (const e of Object.values(book ?? {})) if (e.kind === kind) out.push({ ...e, holder });
  }
  return out;
}
export const operatesEdges = (state, root) => edgesOf(state, circleKindOf(root));
export const governsEdges = (state, root) => edgesOf(state, governsKindOf(root));
// 从对象里找第一个名为 name 的非空键（菜单 here 的电路字段形状由写码方定，测试只认键名）。
export function findKey(v, name) {
  if (v && typeof v === 'object') {
    if (!Array.isArray(v) && Object.hasOwn(v, name) && v[name] != null) return v[name];
    for (const x of Object.values(v)) { const r = findKey(x, name); if (r != null) return r; }
  }
  return null;
}
export const canon = (v) => JSON.stringify(v, (_k, x) => {
  if (typeof x === 'bigint') return `${x}n`;
  if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]));
  return x;
});
export const isOk = (r) => r?.ok === true || r?.result === 'ok';
export const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');

// —— 临时根与夹具 ——
const ROOTS = [];
const newRoot = (prefix) => { const r = testTempRoot(prefix); ROOTS.push(r); return r; };
export function cleanup() {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
}
// 开一局（缺省数据）：返回 world 与存槽根。
export async function freshWorld() {
  const saveRoot = newRoot('tp1-save-');
  const world = await init(express.Router(), { saveRoot });
  return { world, saveRoot };
}
// 数据副本：copyRepo 把 server-plugin 与 world 复制到临时根；改数据只写副本里的文件。
export function copyFixture() {
  const c = copyRepo();
  ROOTS.push(c.root);
  return c;
}
export function editJson(fx, rel, mutate) {
  const p = join(fx.repo, rel);
  const doc = loadJson(p);
  mutate(doc);
  writeUnderTempRoot(fx.root, relative(fx.root, p).split(sep).join('/'), JSON.stringify(doc, null, 1));
}
// 以副本为仓库开局（副本里的 server-plugin 与改后的 world）。
export async function bootFixture(fx) {
  const mod = await import(pathToFileURL(join(fx.repo, 'server-plugin', 'index.mjs')).href);
  const saveRoot = newRoot('tp1-save-');
  return { world: await mod.init(express.Router(), { saveRoot }), saveRoot, mod };
}

// —— 开局与落脚处 ——
export function lodgeOffer(world) {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.lodge), 'act_choose_origin 应给出 lodge 候选');
  return a.slots.lodge;
}
// 出生地 place 候选（菜单 act_choose_origin 的 place 槽，下标稳定）。
export function placeOffer(world) {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.place), 'act_choose_origin 应给出 place 候选');
  return a.slots.place;
}
// 落脚处必须属于所选出生地：两者的掌管组织（统治归属，ownerOfPlace）相同，不看包含树（卷八:1708 勘误 1123k32、卷十:499）。
export function sameGovernorAs(placeId, lodgeId) {
  const owner = ownerOfPlace(ROOT, lodgeId);
  return owner !== null && owner === ownerOfPlace(ROOT, placeId);
}
// 按数据推算与落脚处 lodgeId 同归属的出生地在 place 候选里的下标；找不到即报错（不随意配对）。
export function placeIndexFor(world, lodgeId) {
  const places = placeOffer(world);
  const i = places.findIndex((p) => typeof p === 'string' && sameGovernorAs(p, lodgeId));
  assert.ok(i >= 0, `出生地候选里应有与落脚处 ${lodgeId} 同归属的一项`);
  return i;
}
// 选来历并以 lodge 候选的下标落脚（出生地取 placeIndex，缺省 0）；返回 act 结果。
export function chooseLodge(world, lodgeIndex, placeIndex = 0) {
  return world.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: placeIndex, lodge: lodgeIndex } });
}
export async function startAt(lodgeIndex) {
  const { world, saveRoot } = await freshWorld();
  const offer = lodgeOffer(world);
  const placeIndex = placeIndexFor(world, offer[lodgeIndex]);
  const before = new Set(Object.keys(world.state.created ?? {}));
  const r = await chooseLodge(world, lodgeIndex, placeIndex);
  assert.equal(isOk(r), true, `选来历（落脚处下标 ${lodgeIndex}，出生地下标 ${placeIndex}）应成功：${JSON.stringify(r)}`);
  const avatar = Object.keys(world.state.created ?? {})
    .find((id) => !before.has(id) && world.state.created[id].kind === 'person');
  assert.ok(avatar, '选来历应新建化身');
  return { world, saveRoot, avatar, offer, lodge: offer[lodgeIndex] };
}
// 存槽后读档复演（存读档取证只经 world.save 与 loadSlot/replay_apply）。
export function replayOf(world, saveRoot) {
  const manifest = world.save(0);
  const back = replay_apply(loadSlot({ slot: 0 }, { saveRoot }));
  return { manifest, back };
}
