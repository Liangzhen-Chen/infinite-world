// S2-H（最小持有）黑盒验收，第 4、5 条：互斥让出（exclusive）与持有边的门槛。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
// 门槛一律按种类行的字段选种类（concluded、carriesRel、intimate、holdWhile、uniqueTriple、from/to、holderMax、incompatible），不点名 id。
// 端点由种类行的 from/to 推出：agent 取化身或另建的 person，thing 取起始物实例，place 取地点行。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

const instanceOf = (world) => Object.keys(world.state.created).find((id) => S.ITEM_ROWS[world.state.created[id].template]);
function endpointFor(world, types, avatar, other) {
  if (types.includes('agent')) return other;
  if (types.includes('thing')) return instanceOf(world) ?? null;
  if (types.includes('place')) return Object.keys(S.PLACE_ROWS)[0];
  return null;
}
// 门槛拒收：拒绝必须来自门槛本身；原语未登记（E-EFF-PRIMITIVE）、参数不合（E-EFF-PARAM）这类与门槛无关的拒收不算数。
function assertGateRejected(world, before, r, code) {
  assert.ok(!["E-EFF-PRIMITIVE", "E-EFF-PARAM"].includes(S.codeOf(r)), `拒收不得因原语未登记或参数不合（实得 ${S.codeOf(r)}）；应由门槛本身拒`);
  S.assertRejected(world, before, r, code);
}
// 一局：化身（选带可穿戴起始物的来历）与另建的 person，起始物实例已在局中，so thing 端点可配。
async function worldWithItems() {
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const { world } = await S.freshWorld();
  const before = S.snap(world);
  const r = await S.chooseRow(world, rowId);
  assert.equal(S.isOk(r), true, `选来历应成功：${JSON.stringify(r)}`);
  assert.ok(instanceOf(world), "前提：选来历后应有起始物实例（要建实例的物）");
  const [avatar] = S.newPersons(world, before);
  const b2 = S.snap(world);
  const c = await S.createPerson(world, rowId, S.SAPIENT_SPECIES);
  assert.equal(S.isOk(c), true, '第 0 日以来历模板建第二个 person');
  const [other] = S.newPersons(world, b2);
  return { world, avatar, other };
}
// 按种类行 from/to 配一对端点；配不出（如集体端）返回 null，由调用方计数并说明。
function pairFor(world, kind, avatar, other) {
  const row = S.HK[kind];
  const holder = row.from.includes('agent') ? avatar : instanceOf(world);
  const subject = endpointFor(world, row.to, avatar, other);
  return holder && subject ? { holder, subject } : null;
}

test('4. exclusive 让出：同一标的再开一条互斥边，旧边先按 vacated 格关闭，再开新边；任一时刻现役边至多一条；两次变更各发一条事件', async () => {
  const { world } = await S.freshWorld();
  const { avatar } = await S.setupTwo(world);
  const [oldSeat] = S.seatEdgesOf(world, avatar);
  assert.ok(oldSeat, '前提：化身有一条现役席位边');
  assert.equal(S.HK[S.SEAT_KIND].exclusive, true, '前提：席位种类 exclusive 为真（数据推出）');

  const r = await S.openHolding(world, S.SEAT_KIND, avatar, avatar);
  assert.equal(S.isOk(r), true, `再开一条同种席位边应成功（旧边让出）：${JSON.stringify(r)}`);
  const live = S.seatEdgesOf(world, avatar);
  assert.equal(live.length, 1, '让出后同一标的的现役席位边至多一条');
  assert.notEqual(live[0].edge, oldSeat.edge, '现役的应是新边');
  const evs = S.holdingEventsAt(world, r.seq);
  const ended = evs.filter((e) => e.payload?.change === 'ended' && e.payload.edge === oldSeat.edge);
  const established = evs.filter((e) => e.payload?.change === 'established' && e.payload.edge === live[0].edge);
  assert.equal(ended.length, 1, '旧边的结束应恰发一条持有变化事件');
  assert.equal(established.length, 1, '新边的建立应恰发一条持有变化事件');
  assert.equal(evs.length, 2, '本次事务只有这两条持有变化事件');
});

test('5a. 门槛 concluded 为真的种类开边即拒（按种类字段选种类），state 逐位不变', async () => {
  const { world, avatar, other } = await worldWithItems();
  const kinds = Object.keys(S.HK).filter((k) => S.HK[k].concluded === true);
  assert.ok(kinds.length > 0, '前提：数据中应有 concluded 为真的种类');
  let tested = 0;
  for (const k of kinds) {
    const p = pairFor(world, k, avatar, other);
    if (!p) continue;
    tested += 1;
    const before = S.snap(world);
    const r = await S.openHolding(world, k, p.holder, p.subject);
    assertGateRejected(world, before, r);
  }
  assert.ok(tested > 0, '至少应有一种 concluded 为真的种类能配出端点并被测到');
});

test('5b. 门槛 carriesRel 或 intimate 为真的种类开边即拒，state 逐位不变', async () => {
  const { world, avatar, other } = await worldWithItems();
  const kinds = Object.keys(S.HK).filter((k) => S.HK[k].carriesRel === true || S.HK[k].intimate === true);
  assert.ok(kinds.length > 0, '前提：数据中应有 carriesRel 或 intimate 为真的种类');
  let tested = 0;
  for (const k of kinds) {
    const p = pairFor(world, k, avatar, other);
    if (!p) continue;
    tested += 1;
    const before = S.snap(world);
    const r = await S.openHolding(world, k, p.holder, p.subject);
    assertGateRejected(world, before, r);
  }
  assert.ok(tested > 0, '至少应有一种关系类或亲密类种类能配出端点并被测到');
});

test('5c. 门槛 holdWhile 非空的种类开边即拒（端点按种类行配，类型相符），state 逐位不变', async () => {
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const { world } = await S.freshWorld();
  await S.chooseRow(world, rowId);
  const holder = Object.keys(world.state.created).find((id) => world.state.created[id].kind === 'person');
  const thing = instanceOf(world);
  assert.ok(thing, '前提：应有起始物实例');
  const kinds = Object.keys(S.HK).filter((k) => S.HK[k].holdWhile != null && S.HK[k].from.includes('agent') && S.HK[k].to.includes('thing'));
  assert.ok(kinds.length > 0, '前提：数据中应有 holdWhile 非空、从 agent 指向 thing 的种类');
  for (const k of kinds) {
    const before = S.snap(world);
    const r = await S.openHolding(world, k, holder, thing);
    assertGateRejected(world, before, r);
  }
});

test('5d. 门槛 端类型不符：from 只许 thing 的种类以化身为持有者即拒；to 只许 thing 的种类以地点为标的即拒；state 逐位不变', async () => {
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const { world } = await S.freshWorld();
  await S.chooseRow(world, rowId);
  const avatar = Object.keys(world.state.created).find((id) => world.state.created[id].kind === 'person');
  const thing = instanceOf(world);
  assert.ok(thing, '前提：应有起始物实例');
  // 持有者端类型不符：只许 thing 作持有者的种类，以化身（agent）为持有者。
  const thingOnlyFrom = Object.keys(S.HK).find((k) => S.HK[k].from.length > 0 && !S.HK[k].from.includes('agent'));
  assert.ok(thingOnlyFrom, '前提：数据中应有 from 不含 agent 的种类');
  const before = S.snap(world);
  const r1 = await S.openHolding(world, thingOnlyFrom, avatar, thing);
  assertGateRejected(world, before, r1);
  // 标的端类型不符：只许 thing 作标的的种类，以地点为标的。
  const thingOnlyTo = Object.keys(S.HK).find((k) => S.HK[k].from.includes('agent') && S.HK[k].to.length > 0 && S.HK[k].to.every((t) => t === 'thing'));
  assert.ok(thingOnlyTo, '前提：数据中应有 to 只含 thing 的种类');
  const before2 = S.snap(world);
  const r2 = await S.openHolding(world, thingOnlyTo, avatar, Object.keys(S.PLACE_ROWS)[0]);
  assertGateRejected(world, before2, r2);
});

test('5e. 门槛 三元关边：非 uniqueTriple 的种类不许按三元关边（拒，state 逐位不变）；按边 id 关边照常', async () => {
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const { world } = await S.freshWorld();
  await S.chooseRow(world, rowId);
  const edge = S.liveEdges(world).find((e) => S.HK[e.kind] && S.HK[e.kind].uniqueTriple !== true && e.kind !== S.SEAT_KIND);
  assert.ok(edge, '前提：选来历后应有一条非席位、非 uniqueTriple 的现役边');

  const before = S.snap(world);
  const r = await world.submitProposal({ effects: [{ op: 'holding.close', holdingKind: edge.kind, holder: edge.holder, subject: edge.subject }] });
  assertGateRejected(world, before, r);

  const c = await world.submitProposal({ effects: [{ op: 'holding.close', holding: edge.edge }] });
  assert.equal(S.isOk(c), true, `按边 id 关边应成功（对照）：${JSON.stringify(c)}`);
  assert.equal(S.liveEdges(world).some((e) => e.edge === edge.edge), false, '关边后该边不再现役');
});

// 夹具：只改数据，把一个种类的 to 改指 agent，使其端点能用化身与另建的 person 配出来（测的是门槛，不是端点）。
const kindsWhere = (pred) => Object.keys(S.HK).filter((k) => pred(S.HK[k]));

test('5f. 门槛 holderMax 超限（夹具：只改数据）：同一持有者再开第二条 holderMax 为 1 的种类边，拒 E-HK-HOLDER-MAX，state 逐位不变', async () => {
  const kind = kindsWhere((k) => k.holderMax != null && k.exclusive === false && k.holderMax === 1)[0];
  assert.ok(kind, '前提：数据中应有 holderMax 为 1、非互斥的种类');
  const fx = S.copyFixture();
  S.editJson(fx, 'world/ontology/dimensions/_vocab.json', (v) => {
    const row = v.families.holding_kind.entries[kind];
    row.to = ['agent'];
    row.incompatible = [];
  });
  const world = await S.bootFixture(fx);
  const { avatar, other, rowId, species } = await S.setupTwo(world);
  assert.equal(S.isOk(await S.openHolding(world, kind, avatar, other)), true, '第一条应成功');
  const b = S.snap(world);
  const c = await S.createPerson(world, rowId, species);
  assert.equal(S.isOk(c), true, '另建一个 person 作第二个标的');
  const [third] = S.newPersons(world, b);
  const before = S.snap(world);
  const r = await S.openHolding(world, kind, avatar, third);
  S.assertRejected(world, before, r, 'E-HK-HOLDER-MAX');
});

test('5g. 门槛 incompatible 自动让出（夹具：只改数据）：同一持有者开第二条与自身互斥（auto_vacate）的边，旧边先关闭，现役仍只一条', async () => {
  const kind = kindsWhere((k) => Array.isArray(k.incompatible)
    && k.incompatible.some((x) => x.kind === k.id && x.policy === 'auto_vacate') && k.holderMax == null)[0];
  assert.ok(kind, '前提：数据中应有与自身互斥且 auto_vacate 的种类（且无 holderMax）');
  const fx = S.copyFixture();
  S.editJson(fx, 'world/ontology/dimensions/_vocab.json', (v) => { v.families.holding_kind.entries[kind].to = ['agent']; });
  const world = await S.bootFixture(fx);
  const { avatar, other, rowId, species } = await S.setupTwo(world);
  const first = await S.openHolding(world, kind, avatar, other);
  assert.equal(S.isOk(first), true, '第一条应成功');
  const firstEdge = S.liveEdges(world).find((e) => e.kind === kind && e.holder === avatar);
  assert.ok(firstEdge, '第一条应为现役');
  const b = S.snap(world);
  const c = await S.createPerson(world, rowId, species);
  assert.equal(S.isOk(c), true, '另建第三个 person');
  const [third] = S.newPersons(world, b);
  const r = await S.openHolding(world, kind, avatar, third);
  assert.equal(S.isOk(r), true, `第二条应成功（旧边自动让出）：${JSON.stringify(r)}`);
  const live = S.liveEdges(world).filter((e) => e.kind === kind && e.holder === avatar);
  assert.equal(live.length, 1, '自动让出后现役边仍只一条');
  assert.notEqual(live[0].edge, firstEdge.edge, '现役的应是新边');
  const evs = S.holdingEventsAt(world, r.seq);
  assert.equal(evs.filter((e) => e.payload?.change === 'ended' && e.payload.edge === firstEdge.edge).length, 1, '旧边的让出应发一条结束事件');
});
