// S2-TP1 单测：统治边（governorOf 沿包含树、setGovernor 排他、开局统治边按 originSite）、组织开局公库（守恒、只在第 0 日）、
// 本地规矩沿 parent 继承与违法回退（circleRuleOf）、开局法阵判据（buildRX 读户数与公库）、菜单 here 带法阵。写码方自补，不作验收依据。
// 期望值都从测试读到的世界数据推算（户数、公库、门槛、维护费），或先改测试副本里的数据再断言；不抄仓库基线计数。世界数据只经测试副本改动，不改 world/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners } from '../../server-plugin/rules/load/registry-shards.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { controlledEntities } from '../../server-plugin/rules/social/control.mjs';
import { holdersOf } from '../../server-plugin/rules/social/holdings.mjs';
import { accountsOf } from '../../server-plugin/rules/economy/ledger.mjs';
import { governorOf, setGovernor } from '../../server-plugin/rules/polity/govern.mjs';
import { endowOrgs } from '../../server-plugin/rules/economy/org-endow.mjs';
import { circleRuleOf, circlesOf, siteView } from '../../server-plugin/rules/travel/circle.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const ruleOf = (raw, code, key) => raw.tableDocs[code].rows.find((r) => r.key === key).value;

function owners() {
  const dir = new URL('ontology/state-owners.d/', W);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `world/ontology/state-owners.d/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return mergeOwners({ file: 'world/ontology/state-owners.json', doc: json('ontology/state-owners.json') }, shards).doc;
}
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: clone(owners()),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (tag) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot(tag), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });

// 测试副本里的数据读法（只读副本，期望值由它推算）。
const docOf = (raw, kind) => raw.dimensionDocs.find((d) => d.kind === kind);
const orgRow = (raw, id) => docOf(raw, 'org').rows[id];
const orgDim = (raw, id, d) => {
  const row = orgRow(raw, id);
  if (Object.hasOwn(row, d)) return row[d];
  return docOf(raw, 'org').dimensions[d].default;
};
const circleRules = (raw) => raw.vocabDoc.families.circle_rule.entries;
const tierRow = (raw, t) => raw.vocabDoc.families.circle_tier.entries[t];
const placeRows = (raw) => docOf(raw, 'place').rows;
const governsKind = (raw) => ruleOf(raw, 'polity', 'rolesKinds').governs;
const generalPurpose = (raw) => ruleOf(raw, 'polity', 'rolesPurposes').general;
const isSettlement = (raw, id) => raw.vocabDoc.families.orgkind.entries[orgDim(raw, id, 'orgKind')].settlement === true;
const settlements = (raw) => Object.keys(docOf(raw, 'org').rows).filter((id) => isSettlement(raw, id)).sort();
// 测试副本里的生效规矩：沿 parent 取第一条非空的（门控缺省为真时）。
const ruleChain = (raw, org) => { for (let at = org; at !== null; at = orgDim(raw, at, 'parent')) { const r = orgDim(raw, at, 'circleRule'); if (r !== null) return r; } return null; };
const fundsIn = (raw, org, coin) => orgDim(raw, org, 'genesisFunds')[coin] || 0;

/**
 * 按测试副本数据手算「哪些聚落组织该有法阵」：户数取引擎 siteView（统治归属由 governorOf 求，另有单测核），资金取组织行 genesisFunds，
 * 门槛、储备月数取规矩行，维护费取档行；与 buildRX 文本同义（crule_bs 的 buildRX 写的就是这两条比较）。
 */
function expectedHolders(raw, g) {
  return settlements(raw).filter((org) => {
    const rid = ruleChain(raw, org);
    if (rid === null || orgDim(raw, org, 'seatBuilding') === null) return false;
    const r = circleRules(raw)[rid];
    const houses = siteView(g.engine, g.state, org).houses;
    return houses >= r.minHouses && fundsIn(raw, org, r.currency) >= tierRow(raw, r.tier).upkeepPerMonth * r.reserveMonths;
  });
}
const holdersNow = (g) => circlesOf(g.engine, g.state).map((c) => c.holder).sort();

test('1 governorOf 沿包含树：建筑无自身统治边时取最近祖先的；坊（originSite 指镇）归镇衙署；direct 区分自身与继承', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-gov'));
  const places = placeRows(raw);
  const town = settlements(raw).find((o) => orgDim(raw, o, 'circleRule') !== null);
  const townSeat = orgDim(raw, town, 'seat');
  // 坊：originSite 指镇驻地、自身不是任何聚落组织驻地的地点。
  const seats = new Set(settlements(raw).map((o) => orgDim(raw, o, 'seat')));
  const wards = Object.keys(places).filter((id) => places[id].originSite === townSeat && !seats.has(id));
  assert.ok(wards.length > 0);
  for (const w of wards) assert.deepEqual(governorOf(g.engine, g.state, w), { org: town, direct: true, eligible: null });
  // 坊下的建筑：自身无边，继承坊的。
  const inWard = Object.keys(places).find((id) => wards.includes(places[id].parent));
  assert.deepEqual(governorOf(g.engine, g.state, inWard), { org: town, direct: false, eligible: null });
  // 每个聚落组织驻地恰有一条统治边，归该组织。
  for (const o of settlements(raw)) {
    const edges = holdersOf(g.engine, g.state, orgDim(raw, o, 'seat'), governsKind(raw));
    assert.equal(edges.length, 1);
    assert.equal(edges[0].holder, o);
  }
});

test('2 自治聚落不经 originSite 归别人：自身是聚落组织驻地的地点只有本组织的统治边', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-own'));
  const places = placeRows(raw);
  const own = settlements(raw).filter((o) => typeof places[orgDim(raw, o, 'seat')].originSite === 'string');
  assert.ok(own.length > 0);
  for (const o of own) assert.equal(governorOf(g.engine, g.state, orgDim(raw, o, 'seat')).org, o);
});

test('3 setGovernor 排他：已有统治边的地点再写即整笔拒（离任格未建），仍只一条；强取以外的非开局原因待 holdingAllowed', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-excl'));
  const [a, b] = settlements(raw);
  const seat = orgDim(raw, a, 'seat');
  const forcible = ruleOf(raw, 'polity', 'holdForcibleCauses')[0];
  const r1 = runTransaction(g.engine, g.state, (tx) => setGovernor(g.engine, g.state, seat, b, forcible, tx));
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'E-ACT-WRITER-NOT-READY');
  assert.equal(holdersOf(g.engine, g.state, seat, governsKind(raw)).length, 1);
  assert.equal(governorOf(g.engine, g.state, seat).org, a);
  const peaceful = Object.keys(raw.vocabDoc.families.verb.entries).find((v) => !ruleOf(raw, 'polity', 'holdForcibleCauses').includes(v) && v !== ruleOf(raw, 'polity', 'genHoldCause'));
  const free = Object.keys(placeRows(raw)).find((id) => governorOf(g.engine, g.state, id) === null);
  const r2 = runTransaction(g.engine, g.state, (tx) => setGovernor(g.engine, g.state, free, a, peaceful, tx));
  assert.equal(r2.ok, false);
  assert.equal(r2.code, 'E-ACT-WRITER-NOT-READY');
  assert.equal(governorOf(g.engine, g.state, free), null);
});

test('4 endowOrgs：公库余额等于各组织 genesisFunds（0 不开户）；账本守恒；第 0 日之后再入账被限额通道拒', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-endow'));
  for (const org of Object.keys(docOf(raw, 'org').rows)) {
    const want = Object.entries(orgDim(raw, org, 'genesisFunds')).filter(([, n]) => n !== 0).map(([res, n]) => [res, n]).sort();
    const got = accountsOf(g.engine, g.state, org).filter((x) => x.purpose === generalPurpose(raw)).map((x) => [x.resource, x.balance]).sort();
    assert.deepEqual(got, want, org);
  }
  assert.equal(g.advance(24 * 60).ok, true);
  const r = runTransaction(g.engine, g.state, (tx) => endowOrgs(g.engine, g.state, tx));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'E-LEDGER-CAPPED-DIRECT');
});

test('5 runOpeningCircles 与数据推算一致；每座法阵持有者是聚落组织、宿主是其 seatBuilding、档取规矩 tier', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-circles'));
  const want = expectedHolders(raw, g);
  assert.ok(want.length > 0);
  assert.ok(want.length < settlements(raw).length);
  assert.deepEqual(holdersNow(g), want);
  for (const c of circlesOf(g.engine, g.state)) {
    assert.equal(c.host, orgDim(raw, c.holder, 'seatBuilding'));
    assert.equal(c.tier, circleRules(raw)[ruleChain(raw, c.holder)].tier);
  }
});

test('6 数据夹具：门槛调到村户数之上只剩户数够的；穷村资金调够即有；村社挂自己的规矩按自己的判', () => {
  const base = rawWorld();
  const g0 = mountKernel(clone(base), caps('tp1-fx0'));
  const rid = ruleChain(base, settlements(base).find((o) => orgDim(base, o, 'circleRule') !== null));
  const houses = Object.fromEntries(settlements(base).map((o) => [o, siteView(g0.engine, g0.state, o).houses]));
  const ruled = settlements(base).filter((o) => houses[o] !== null);
  // a) 门槛 = 有规矩的聚落里第二大户数 + 1：只剩户数最多的那一处（若资金够）。
  const sorted = ruled.map((o) => houses[o]).sort((x, y) => y - x);
  assert.ok(sorted[0] > sorted[1]);
  const rawA = clone(base);
  circleRules(rawA)[rid].minHouses = sorted[1] + 1;
  const gA = mountKernel(rawA, caps('tp1-fxa'));
  assert.deepEqual(holdersNow(gA), expectedHolders(rawA, gA));
  assert.equal(holdersNow(gA).length, 1);
  // b) 没有法阵、户数够而资金不够的组织：资金调到门槛即有。
  const poor = ruled.filter((o) => !holdersNow(g0).includes(o) && houses[o] >= circleRules(base)[rid].minHouses);
  assert.ok(poor.length > 0);
  const r = circleRules(base)[rid];
  const rawB = clone(base);
  for (const o of poor) orgRow(rawB, o).genesisFunds = { [r.currency]: tierRow(base, r.tier).upkeepPerMonth * r.reserveMonths };
  const gB = mountKernel(rawB, caps('tp1-fxb'));
  for (const o of poor) assert.ok(holdersNow(gB).includes(o));
  assert.deepEqual(holdersNow(gB), expectedHolders(rawB, gB));
  // c) 给一个有法阵的下级村社挂自己的规矩（门槛高于其户数）：它按自己的规矩判，没有法阵；别处不变。
  const child = holdersNow(g0).find((o) => orgDim(base, o, 'circleRule') === null);
  const rawC = clone(base);
  const own = 'crule_fixture_own';
  circleRules(rawC)[own] = { ...clone(r), minHouses: houses[child] + 1 };
  orgRow(rawC, child).circleRule = own;
  const gC = mountKernel(rawC, caps('tp1-fxc'));
  assert.equal(circleRuleOf(gC.engine, gC.state, child), own);
  assert.ok(!holdersNow(gC).includes(child));
  assert.deepEqual(holdersNow(gC), holdersNow(g0).filter((o) => o !== child));
});

test('7 circleRuleOf：下级沿 parent 继承发布者的规矩；规矩不合法（门控缺省为假）即视为不存在，整条链都没有 → null，也就没有法阵', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-rule'));
  for (const o of settlements(raw)) assert.equal(circleRuleOf(g.engine, g.state, o), ruleChain(raw, o));
  const rawX = clone(raw);
  rawX.vocabDoc.families.gate.entries[ruleOf(raw, 'circle', 'lawGate')].defaultAllow = false;
  const gX = mountKernel(rawX, caps('tp1-unlawful'));
  for (const o of settlements(raw)) assert.equal(circleRuleOf(gX.engine, gX.state, o), null);
  assert.deepEqual(circlesOf(gX.engine, gX.state), []);
});

test('8 菜单 here：此处所属聚落（governorOf）有法阵即带 circle {holder, host, tier}，非宿主建筑里也带；所属聚落没有法阵即不带 circle 键', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-here'));
  const r = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge: 0 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const av = controlledEntities(g.engine, g.state)[0];
  const circles = circlesOf(g.engine, g.state);
  const ruler = (id) => governorOf(g.engine, g.state, id)?.org;
  const places = placeRows(raw);
  // 有法阵聚落里一座不是宿主的建筑（有足迹才能落位：取菜单落脚候选里的）。
  const buildings = Object.keys(places).filter((id) => (places[id].classes || []).includes(ruleOf(raw, 'gen', 'roleFacility')));
  const moveTo = (to) => g.submitProposal({ effects: [{ op: 'move', subject: av, to }] });
  const c = circles[0];
  const inner = buildings.find((b) => b !== c.host && ruler(b) === c.holder && moveTo(b).ok);
  assert.ok(inner, `${c.holder} 名下应有可落位的非宿主建筑`);
  const here = g.menu(null).here;
  assert.equal(here.place, inner);
  assert.deepEqual(here.circle, { holder: c.holder, host: c.host, tier: c.tier });
  // 所属聚落没有法阵的建筑：不带 circle 键。
  const holders = new Set(circles.map((x) => x.holder));
  const bare = buildings.find((b) => ruler(b) !== undefined && !holders.has(ruler(b)) && moveTo(b).ok);
  assert.ok(bare, '应有所属聚落没有法阵的可落位建筑');
  assert.equal(Object.hasOwn(g.menu(null).here, 'circle'), false);
});

test('9 复演：经真实入口 init 开局，存槽读档后 saveDigest 逐字相等，法阵逐位一致', async () => {
  const url = pathToFileURL(join(testTempRoot('tp1-replay-'), '/'));
  const g = await init(express.Router(), { saveRoot: url });
  const before = JSON.stringify(circlesOf(g.engine, g.state));
  assert.notEqual(before, '[]');
  const saved = saveSlot(g);
  const replayed = replay_apply(loadSlot(saved, { saveRoot: url }));
  assert.equal(replayed.saveDigest, saved.saveDigest);
  assert.equal(JSON.stringify(circlesOf(replayed.engine, replayed.state)), before);
});

test('10 落脚处随出生地：开放 2 处以上时，按菜单下标选的落脚处与所选出生地同属一个统治组织才成；跨出生地选即 E-ACT-SLOT，状态不变', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('tp1-lodge'));
  const slots = g.menu(null).affordances.find((a) => a.act === 'act_choose_origin').slots;
  assert.ok(slots.place.length >= 2);
  const ruler = (id) => governorOf(g.engine, g.state, id)?.org;
  // 每个出生地：菜单里与它同属一个统治组织的落脚处都选得成、落位在该处；不同属的选即拒。
  const pi = slots.place.findIndex((p) => slots.lodge.some((l) => ruler(l) !== undefined && ruler(l) === ruler(p)) && slots.lodge.some((l) => ruler(l) !== ruler(p)));
  assert.ok(pi >= 0);
  const fit = slots.lodge.findIndex((l) => ruler(l) === ruler(slots.place[pi]));
  const miss = slots.lodge.findIndex((l) => ruler(l) !== ruler(slots.place[pi]));
  const before = JSON.stringify(g.state);
  const bad = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: pi, lodge: miss } });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'E-ACT-SLOT');
  assert.equal(JSON.stringify(g.state), before);
  const ok = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: pi, lodge: fit } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const here = g.menu(null).here;
  assert.equal(here.place, slots.lodge[fit]);
  assert.equal(ruler(here.place), ruler(slots.place[pi]));
});
