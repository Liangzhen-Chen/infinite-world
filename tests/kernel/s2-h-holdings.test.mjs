// S2-H 单测：最小持有（开关转与四项核对的拒绝码、exclusive 让出、协议甲 ho_close / ho_estate、产物引用与越界、未建类开边即拒、起始物逐件/散货分界、化身认定改读席位边）。
// 写码方自补，不作验收依据。期望值按卷十八 R18-1.2–1.11 与世界数据（种类行字段、出身条目 startingItems、物品行 classes）在测试里取，或先造前提再断言；不抄仓库基线计数。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot。
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
import { holderEnded, holdingsOf } from '../../server-plugin/rules/social/holdings.mjs';
import { controlledEntities } from '../../server-plugin/rules/social/control.mjs';
import { conservationCheck } from '../../server-plugin/rules/economy/ledger-check.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const VOCAB = json('ontology/dimensions/_vocab.json').families;
const KINDS = VOCAB.holding_kind.entries;
const SOCIAL = json('rules/tables/social.json').rows;
const rule = (k) => SOCIAL.find((r) => r.key === k).value;
const SEAT = json('rules/tables/control.json').rows.find((r) => r.key === 'seatKind').value;
const EVENTS = rule('events');
const OUTFIT = rule('outfit');
const INSTANCED = json('rules/tables/items.json').rows.find((r) => r.key === 'instancedComponents').value;
const ITEM_ROWS = json('ontology/dimensions/item.json').rows;

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
const code = (c) => (e) => e.code === c;
const persons = (g) => Object.keys(g.state.created).filter((id) => g.state.created[id].kind === 'person');
const edges = (g) => Object.values(g.state.holdings || {}).flatMap((b) => Object.entries(b).map(([id, e]) => ({ id, ...e })));
const kindOfRow = (pred) => Object.keys(KINDS).sort().find((k) => pred(KINDS[k]));
// 本卡开得了的种类（不触发未建数据门）。
const openable = (r) => !r.concluded && !r.carriesRel && !r.intimate && r.holdWhile === null && r.admission === null;
const ENDS = rule('endKinds');

function spawn(g, index = 0) {
  const r = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: index, place: 0, lodge: 0 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  return controlledEntities(g.engine, g.state)[0];
}
const idOfKind = (g, kind, nth = 0) => [...g.engine.registry.idIndex].filter(([, k]) => k === kind).map(([id]) => id).sort()[nth];
const open = (g, holdingKind, holder, subject, terms) => g.submitProposal({ effects: [{ op: 'holding.open', holdingKind, holder, subject, ...(terms ? { terms } : {}) }] });

test('1 选来历：同一提案里建化身并开席位边（持有者 = 标的 = 化身）；化身认定读席位边：用来历模板另建的个体不受控', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2h-seat-') });
  const a = spawn(g, 0);
  const seats = edges(g).filter((e) => e.kind === SEAT);
  assert.equal(seats.length, 1);
  assert.equal(seats[0].holder, a);
  assert.equal(seats[0].subject, a);
  assert.equal(g.views.controlledByPlayer(a), true);
  const tpl = g.state.created[a].template;
  const r = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { species: g.state.created[a].props.species } }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const npc = persons(g).find((p) => p !== a);
  assert.equal(g.views.controlledByPlayer(npc), false);
  assert.deepEqual(controlledEntities(g.engine, g.state), [a]);
  assert.throws(() => g.menu(npc), code('E-DISPLAY-SUBJECT'));
  assert.equal(g.act({ act: 'act_wait', actor: npc, numbers: { minutes: 5 } }).ok, false);
  assert.equal(g.act({ act: 'act_wait', numbers: { minutes: 5 } }).ok, true);
});

test('2 起始物逐件/散货分界：每个来历——逐件物实例数 = lot_i_ 账户数 = 放置边数，散货余额 = n，src_genesis 累计 = 总件数，守恒', async () => {
  const g0 = await init(express.Router(), { saveRoot: testTempRoot('s2h-outfit-probe-') });
  const n = g0.menu(null).affordances[0].slots.origin.length;
  for (let i = 0; i < n; i++) {
    const g = await init(express.Router(), { saveRoot: testTempRoot(`s2h-outfit-${i}-`) });
    const a = spawn(g, i);
    const origin = VOCAB.origin.entries[dim(g.engine, g.state, 'person', a, OUTFIT.originDimension).value];
    const list = origin[OUTFIT.itemsField];
    const isInst = (item) => (ITEM_ROWS[item].classes || []).some((c) => INSTANCED.includes(c));
    const wantInst = list.filter((x) => isInst(x.item)).reduce((s, x) => s + x.n, 0);
    const accts = g.views.accountsOf(a);
    const instAccts = accts.filter((x) => x.key.startsWith('lot_i_'));
    assert.equal(instAccts.length, wantInst, `origin ${i}`);
    assert.ok(instAccts.every((x) => x.balance === 1));
    const instIds = instAccts.map((x) => x.key.slice('lot_i_'.length)).sort();
    const placed = edges(g).filter((e) => e.kind !== SEAT).map((e) => e.subject).sort();
    assert.deepEqual(placed, instIds, `origin ${i}: every instance placed exactly once`);
    for (const x of list.filter((y) => !isInst(y.item))) {
      const res = Object.keys(VOCAB.resource.entries).find((k) => VOCAB.resource.entries[k][OUTFIT.resourceItemField] === x.item);
      assert.equal(accts.filter((y) => y.resource === res).reduce((s, y) => s + y.balance, 0), x.n);
    }
    const total = list.reduce((s, x) => s + x.n, 0);
    const genesis = Object.entries(g.state.ledgerTotals).filter(([r]) => list.some((x) => VOCAB.resource.entries[r] && VOCAB.resource.entries[r][OUTFIT.resourceItemField] === x.item))
      .reduce((s, [, byCode]) => s + byCode[OUTFIT.source].cumulative, 0);
    assert.equal(genesis, total);
    assert.deepEqual(conservationCheck(g.engine, g.state), []);
  }
});

test('3 事件：每条开边恰一条持有变化事件（established），载荷字段齐；exclusive 让出：再开席位边先关旧边（ended）再开新边', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2h-events-') });
  const a = spawn(g, 0);
  const evs = g.logBook.entries.filter((e) => e.verb === EVENTS.verb);
  assert.equal(evs.length, edges(g).length);
  for (const e of evs) {
    assert.equal(e.payload.change, EVENTS.change.established);
    assert.deepEqual(Object.keys(e.payload).sort(), ['at', 'change', 'edge', 'holder', 'kind', 'prevHolder', 'subject']);
  }
  const old = edges(g).find((e) => e.kind === SEAT).id;
  const r = open(g, SEAT, a, a);
  assert.equal(r.ok, true, JSON.stringify(r));
  const now = edges(g).filter((e) => e.kind === SEAT);
  assert.equal(now.length, 1);
  assert.notEqual(now[0].id, old);
  const mine = g.logBook.entries.filter((e) => e.seq === r.seq && e.verb === EVENTS.verb).map((e) => [e.payload.edge, e.payload.change]);
  assert.deepEqual(mine, [[old, EVENTS.change.ended], [now[0].id, EVENTS.change.established]]);
});

test('4 产物引用：同一提案 create 后 holding.open{holder:{produced:0}} 成功；越界 {produced:5} E-EFF-PARAM 整笔回滚', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2h-produced-') });
  const a = spawn(g, 0);
  const tpl = g.state.created[a].template;
  const species = g.state.created[a].props.species;
  const place = idOfKind(g, 'place');
  const resides = kindOfRow((r) => openable(r) && r.from.includes('agent') && r.to.includes('place') && !r.exclusive && r.incompatible.length === 0 && r.holderMax === null);
  const ok = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { species } }, { op: 'holding.open', holdingKind: resides, holder: { produced: 0 }, subject: place }] });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const npc = persons(g).find((p) => p !== a);
  assert.equal(holdingsOf(g.engine, g.state, npc, resides).length, 1);
  const snap = clone(g.state);
  const bad = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { species } }, { op: 'holding.open', holdingKind: resides, holder: { produced: 5 }, subject: place }] });
  assert.equal(bad.code, 'E-EFF-PARAM');
  assert.deepEqual(g.state, snap);
});

test('5 开边门槛：未登记种类 E-HK-UNREGISTERED；端类型不符 E-HK-END-TYPE；端类型未映射、concluded、带关系、holdWhile 的种类整类 E-ACT-WRITER-NOT-READY；被拒状态不变、日志留拒绝', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2h-gates-') });
  const a = spawn(g, 0);
  const item = idOfKind(g, 'item');
  const snap = clone(g.state);
  const cases = [
    ['E-HK-UNREGISTERED', 'hk_not_a_kind', a, a],
    ['E-HK-END-TYPE', kindOfRow((r) => openable(r) && r.from.every((t) => t in ENDS) && !r.from.includes('thing') && r.to.includes('agent')), item, a],
    ['E-ACT-WRITER-NOT-READY', kindOfRow((r) => openable(r) && r.from.every((t) => !(t in ENDS))), a, a],
    ['E-ACT-WRITER-NOT-READY', kindOfRow((r) => r.concluded), a, a],
    ['E-ACT-WRITER-NOT-READY', kindOfRow((r) => r.carriesRel), a, a],
    ['E-ACT-WRITER-NOT-READY', kindOfRow((r) => r.holdWhile !== null), a, item],
  ];
  for (const [want, kind, holder, subject] of cases) {
    assert.ok(kind, `no kind row for ${want}`);
    const r = open(g, kind, holder, subject);
    assert.equal(r.code, want, `${kind}: ${JSON.stringify(r)}`);
    assert.ok(g.logBook.entries.some((e) => e.seq === r.seq && e.ok === false && e.code === want));
  }
  assert.deepEqual(g.state.holdings, snap.holdings);
  assert.deepEqual(g.state.holdingCounters, snap.holdingCounters);
  // 按三元关边：uniqueTriple 为假的种类未建三元定位。
  const seat = edges(g).find((e) => e.kind === SEAT);
  assert.equal(g.submitProposal({ effects: [{ op: 'holding.close', holdingKind: SEAT, holder: a, subject: a }] }).code, KINDS[SEAT].uniqueTriple ? undefined : 'E-ACT-WRITER-NOT-READY');
  assert.equal(g.submitProposal({ effects: [{ op: 'holding.close', holding: 'edge_none' }] }).code, 'E-DIM-REF-MISSING');
  assert.equal(g.submitProposal({ effects: [{ op: 'holding.close', holding: seat.id }] }).ok, true);
  assert.deepEqual(controlledEntities(g.engine, g.state), []);
});

test('6 持有者一端：incompatible auto_vacate 自动让出、forbid 与 holderMax 超限 E-HK-HOLDER-MAX；capacityKey 满 E-HK-CAPACITY（测试副本改种类行）', async () => {
  const raw = rawWorld();
  const kinds = raw.vocabDoc.families.holding_kind.entries;
  const resides = kindOfRow((r) => openable(r) && r.from.includes('agent') && r.to.includes('place') && !r.exclusive && r.incompatible.length === 0 && r.holderMax === null);
  const g0 = mountKernel(clone(raw), caps('s2h-holder-probe-'));
  const places = [idOfKind(g0, 'place', 0), idOfKind(g0, 'place', 1), idOfKind(g0, 'place', 2)];
  // auto_vacate
  kinds[resides].incompatible = [{ kind: resides, policy: 'auto_vacate' }];
  let g = mountKernel(clone(raw), caps('s2h-holder-auto-'));
  let a = spawn(g, 0);
  assert.equal(open(g, resides, a, places[0]).ok, true);
  assert.equal(open(g, resides, a, places[1]).ok, true);
  assert.deepEqual(holdingsOf(g.engine, g.state, a, resides).map((e) => e.subject), [places[1]]);
  // forbid
  kinds[resides].incompatible = [{ kind: resides, policy: 'forbid' }];
  g = mountKernel(clone(raw), caps('s2h-holder-forbid-'));
  a = spawn(g, 0);
  assert.equal(open(g, resides, a, places[0]).ok, true);
  assert.equal(open(g, resides, a, places[1]).code, 'E-HK-HOLDER-MAX');
  // holderMax
  kinds[resides].incompatible = [];
  kinds[resides].holderMax = 2;
  g = mountKernel(clone(raw), caps('s2h-holder-max-'));
  a = spawn(g, 0);
  assert.equal(open(g, resides, a, places[0]).ok, true);
  assert.equal(open(g, resides, a, places[1]).ok, true);
  assert.equal(open(g, resides, a, places[2]).code, 'E-HK-HOLDER-MAX');
  // capacityKey（R18-1.5 管标的一端）：测试副本给放置边种类挂容量维度 volumeCapacity，标的取一件容量为 1 的已登记物品行；第二条以它为标的的边即 E-HK-CAPACITY。
  const contain = OUTFIT.placement.find((p) => p.holder === 'worn_container').holdingKind;
  const raw2 = rawWorld();
  raw2.vocabDoc.families.holding_kind.entries[contain].capacityKey = 'volumeCapacity';
  const subject = Object.keys(ITEM_ROWS).sort().find((id) => typeof ITEM_ROWS[id].volumeCapacity === 'number');
  raw2.dimensionDocs.find((d) => d.kind === 'item').rows[subject].volumeCapacity = 1;
  g = mountKernel(raw2, caps('s2h-holder-cap-'));
  spawn(g, 0);
  const holders = [idOfKind(g, 'item', 0), idOfKind(g, 'item', 1)].filter((id) => id !== subject);
  assert.equal(open(g, contain, holders[0], subject).ok, true);
  assert.equal(open(g, contain, holders[1], subject).code, 'E-HK-CAPACITY');
});

test('7 协议甲：ho_close 关边、ho_estate 转给承接实体（转移事件带 prevHolder）、未建处置格走到才拒 E-ACT-WRITER-NOT-READY', async () => {
  const raw = rawWorld();
  const kinds = raw.vocabDoc.families.holding_kind.entries;
  const resides = kindOfRow((r) => openable(r) && r.from.includes('agent') && r.to.includes('place') && !r.exclusive && r.incompatible.length === 0 && r.holderMax === null);
  kinds[resides].gone = 'ho_estate';
  kinds[resides].defected = 'ho_succeed';
  const g = mountKernel(raw, caps('s2h-protocol-'));
  const a = spawn(g, 0);
  const tpl = g.state.created[a].template;
  assert.equal(g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { species: g.state.created[a].props.species } }] }).ok, true);
  const heir = persons(g).find((p) => p !== a);
  const place = idOfKind(g, 'place');
  assert.equal(open(g, resides, a, place).ok, true);
  const run = (fn) => runTransaction(g.engine, g.state, (tx) => fn(tx));
  assert.equal(run((tx) => holderEnded(g.engine, g.state, a, 'defected', null, tx, { kind: resides })).code, 'E-ACT-WRITER-NOT-READY');
  const r = run((tx) => holderEnded(g.engine, g.state, a, 'gone', heir, tx, { kind: resides }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(holdingsOf(g.engine, g.state, a, resides).length, 0);
  assert.deepEqual(holdingsOf(g.engine, g.state, heir, resides).map((e) => e.subject), [place]);
  const ev = r.events.find((e) => e.verb === EVENTS.verb);
  assert.equal(ev.payload.change, EVENTS.change.transferred);
  assert.equal(ev.payload.prevHolder, a);
  if (KINDS[resides].domicile) assert.equal(r.events.filter((e) => e.verb === EVENTS.domicileVerb).length, 2);
  // ho_close：放置边的终止格（种类行取值），持有者终止即关闭。
  const wear = OUTFIT.placement[0].holdingKind;
  assert.equal(KINDS[wear].gone, 'ho_close');
  const before = holdingsOf(g.engine, g.state, a, wear).length;
  assert.ok(before > 0);
  assert.equal(run((tx) => holderEnded(g.engine, g.state, a, 'gone', null, tx, { kind: wear })).ok, true);
  assert.equal(holdingsOf(g.engine, g.state, a, wear).length, 0);
  assert.equal(run((tx) => holderEnded(g.engine, g.state, a, 'no_such_cell', null, tx)).code, 'E-DIM-STRUCT-FIELD');
});

test('8 transfer 原语：换持有者、只发一条 transferred；协议乙：标的终止时以它为标的的边一律关闭（席位边随化身终止关闭）', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2h-transfer-') });
  const a = spawn(g, 0);
  const tpl = g.state.created[a].template;
  assert.equal(g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { species: g.state.created[a].props.species } }] }).ok, true);
  const b = persons(g).find((p) => p !== a);
  const wear = OUTFIT.placement[0].holdingKind;
  const e = holdingsOf(g.engine, g.state, a, wear)[0];
  const r = g.submitProposal({ effects: [{ op: 'holding.transfer', holding: e.id, newHolder: b }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(holdingsOf(g.engine, g.state, b, wear).some((x) => x.subject === e.subject));
  const evs = g.logBook.entries.filter((x) => x.seq === r.seq && x.verb === EVENTS.verb);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].payload.prevHolder, a);
  const d = g.submitProposal({ effects: [{ op: 'destroy', entity: a }] });
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.equal(edges(g).filter((x) => x.subject === a).length, 0);
  assert.deepEqual(controlledEntities(g.engine, g.state), []);
});

test('9 存槽读档复演：选来历、开关边后 saveDigest 相同，holdings、holdingCounters 逐位相同', async () => {
  const dir = testTempRoot('s2h-replay-');
  const g = await init(express.Router(), { saveRoot: dir });
  const a = spawn(g, 2);
  const place = idOfKind(g, 'place');
  const resides = kindOfRow((r) => openable(r) && r.from.includes('agent') && r.to.includes('place') && !r.exclusive && r.incompatible.length === 0 && r.holderMax === null);
  assert.equal(open(g, resides, a, place).ok, true);
  const e = holdingsOf(g.engine, g.state, a, resides)[0];
  assert.equal(g.submitProposal({ effects: [{ op: 'holding.close', id: e.id }] }).ok, true);
  assert.equal(g.advance(10).ok, true);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  for (const k of ['holdings', 'holdingCounters', 'accounts', 'created']) assert.deepEqual(r.state[k], g.state[k], k);
});

test('10 加载期核对：可建实例的起始物找不到放处即开局拒 E-DIM-REF-MISSING；终止格取不动、exclusive 离任格取不动 E-HK-PROTOCOL；holderMax 非非负整数 E-HK-ROW-FIELDS；起始物资源缺 budget 窗口 E-DIM-REF-MISSING', () => {
  const raw = rawWorld();
  for (const row of Object.values(raw.dimensionDocs.find((d) => d.kind === 'item').rows)) {
    if (Array.isArray(row.classes)) row.classes = row.classes.filter((c) => c !== OUTFIT.containerClass);
  }
  assert.throws(() => mountKernel(raw, caps('s2h-check-place-')), code('E-DIM-REF-MISSING'));
  const raw2 = rawWorld();
  raw2.vocabDoc.families.holding_kind.entries[SEAT].gone = 'ho_stay';
  assert.throws(() => mountKernel(raw2, caps('s2h-check-stay-')), code('E-HK-PROTOCOL'));
  const raw3 = rawWorld();
  const first = Object.values(raw3.vocabDoc.families.origin.entries)[0][OUTFIT.itemsField][0].item;
  const res = Object.keys(VOCAB.resource.entries).find((k) => VOCAB.resource.entries[k][OUTFIT.resourceItemField] === first);
  delete raw3.tableDocs.economyLedger.rows.find((r) => r.key === 'budget').value[res];
  assert.throws(() => mountKernel(raw3, caps('s2h-check-budget-')), code('E-DIM-REF-MISSING'));
  // holderMax 非空非整数（审卡第一轮必须改 ①）：按字段取一个 holderMax 非空的种类，改成串即开局拒。
  const raw4 = rawWorld();
  const capped = Object.keys(KINDS).sort().find((k) => KINDS[k].holderMax !== null);
  raw4.vocabDoc.families.holding_kind.entries[capped].holderMax = 'one';
  assert.throws(() => mountKernel(raw4, caps('s2h-check-max-')), code('E-HK-ROW-FIELDS'));
  const raw5 = rawWorld();
  raw5.vocabDoc.families.holding_kind.entries[capped].holderMax = -1;
  assert.throws(() => mountKernel(raw5, caps('s2h-check-max-neg-')), code('E-HK-ROW-FIELDS'));
  // exclusive 种类离任格取不动（审卡第一轮必须改 ②）：不动的取值取自终止格被拒的同一处置（数据里席位行 exclusive 为真）。
  const raw6 = rawWorld();
  const excl = Object.keys(KINDS).sort().find((k) => KINDS[k].exclusive === true && KINDS[k].holdWhile === null);
  raw6.vocabDoc.families.holding_kind.entries[excl].vacated = 'ho_stay';
  assert.throws(() => mountKernel(raw6, caps('s2h-check-excl-stay-')), code('E-HK-PROTOCOL'));
});

test('11 扩展性：给某来历的起始物加一件挂穿戴组件类的现有物品，不改代码即多出一条穿戴边', async () => {
  const raw = rawWorld();
  const wearClass = OUTFIT.placement[0].whenClass;
  const extra = Object.keys(ITEM_ROWS).sort().find((id) => (ITEM_ROWS[id].classes || []).length === 1 && ITEM_ROWS[id].classes[0] === wearClass
    && Object.values(VOCAB.resource.entries).some((e) => e[OUTFIT.resourceItemField] === id));
  assert.ok(extra);
  const res = Object.keys(VOCAB.resource.entries).find((k) => VOCAB.resource.entries[k][OUTFIT.resourceItemField] === extra);
  const budget = raw.tableDocs.economyLedger.rows.find((r) => r.key === 'budget').value;
  budget[res] = budget[res] || { [OUTFIT.source]: { activeFromDay: 0, activeToDay: 0, limit: null } };
  const g0 = mountKernel(clone(raw), caps('s2h-ext-probe-'));
  const a0 = spawn(g0, 0);
  const origin = dim(g0.engine, g0.state, 'person', a0, OUTFIT.originDimension).value;
  const base = holdingsOf(g0.engine, g0.state, a0, OUTFIT.placement[0].holdingKind).length;
  raw.vocabDoc.families.origin.entries[origin][OUTFIT.itemsField].push({ item: extra, n: 1 });
  const g = mountKernel(raw, caps('s2h-ext-'));
  const a = spawn(g, 0);
  assert.equal(holdingsOf(g.engine, g.state, a, OUTFIT.placement[0].holdingKind).length, base + 1);
});
