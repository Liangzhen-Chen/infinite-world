// S2-H（最小持有）黑盒验收，第 2、3 条：起始物（逐件建实例、入账、挂在身上；散货按数入账；全程守恒）与事件一一对应。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2h。依据与每条测的是什么见 docs/卡档案/feat-s2-h/出题.md。
// 期望值全部从 world/ 读：起始物表（出身条目 startingItems）、物品的组件类（items.json 的 instancedComponents）、资源种类（_vocab resource 族）、
// 实例批次键前缀（ledger.json account 行的 instanceLotPrefix）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

// 本来历的起始物是否能成立：要建实例而又没有「穿戴着的容器」可放的，按放置规则整笔拒（卷三乙 I-2、本卡 §4）。
const needsContainer = (items) => items.some((s) => S.isInstancedItem(s.item) && !S.isWearableItem(s.item));
const hasWornContainer = (items) => items.some((s) => S.isWearableItem(s.item) && S.itemClasses(s.item).includes('comp_container'));

test('2. 起始物：遍历全部来历，逐件建实例、入账、挂身上；散货按数入账；放置边与实例一一对应；src_genesis 守恒', async () => {
  const probe = (await S.freshWorld()).world;
  const rows = S.offered(probe).filter((rowId) => (S.originOf(rowId).startingItems ?? []).length > 0);
  assert.ok(rows.length > 0, '候选来历中应有带起始物的来历（数据推出）');
  let instancedCases = 0; let wearableCases = 0; let bulkCases = 0;

  for (const rowId of rows) {
    const items = S.originOf(rowId).startingItems;
    const originId = S.originIdOf(rowId);
    const { world } = await S.freshWorld();
    const before = S.snap(world);
    const r = await S.chooseRow(world, rowId);

    if (needsContainer(items) && !hasWornContainer(items)) {
      // 要建实例却没有可放的穿戴容器：按放置规则整笔拒，state 逐位不变（卷三乙 I-2；本卡 §4）。
      S.assertRejected(world, before, r);
      continue;
    }
    assert.equal(S.isOk(r), true, `来历 ${originId} 的起始物应能全部放下，选来历应成功：${JSON.stringify(r)}`);
    const [avatar] = S.newPersons(world, before);
    assert.ok(avatar, `来历 ${originId}：选来历应新建化身`);
    const prefix = S.instanceLotPrefix();

    // 按资源种类汇总应有的数量（同一资源多次出现时相加）。
    const perRes = new Map();
    for (const { item, n } of items) {
      const res = S.resOfItem(item);
      perRes.set(res, (perRes.get(res) ?? 0) + n);
      const instances = Object.keys(world.state.created).filter((id) => world.state.created[id].template === item);
      if (S.isInstancedItem(item)) {
        instancedCases += 1;
        assert.equal(instances.length, n, `${originId}：要建实例的 ${item} 应建 ${n} 件实例`);
        // 逐件实例入账：每件一个账户，键 = 实例批次键前缀 + 实例 id，余额 1（卷六:104）。
        for (const id of instances) {
          const key = prefix + id;
          const hits = S.accountsOf(world.state, avatar, res).filter((e) => e.key === key);
          assert.equal(hits.length, 1, `${originId}：实例 ${id} 应在化身名下有一个键为 ${key} 的账户`);
          assert.equal(hits[0].amount, 1, `实例账户余额应为 1`);
        }
        // 放置边：每件实例有且仅有一条现役边，以它为标的（卷十八 R18-1.11）。
        for (const id of instances) {
          const edges = S.liveEdges(world).filter((e) => e.subject === id);
          assert.equal(edges.length, 1, `${originId}：实例 ${id} 应恰有一条放置边`);
          if (S.isWearableItem(item)) {
            wearableCases += 1;
            assert.equal(edges[0].holder, avatar, `穿戴物 ${item} 的边应挂在化身身上`);
          } else {
            const holder = world.state.created[edges[0].holder];
            assert.ok(holder, `${originId}：非穿戴的实例应放进一件实例容器（持有者是已建实体）`);
            assert.ok(S.itemClasses(holder.template).includes('comp_container'), '放置的持有者应是挂 comp_container 的物');
          }
        }
      } else {
        bulkCases += 1;
        assert.equal(instances.length, 0, `${originId}：散货 ${item} 不应建实例（卷三乙 I-2）`);
      }
    }

    for (const [res, n] of perRes) {
      // 化身名下该资源的余额合计 = 起始数量（逐件与散货合计）。
      assert.equal(S.sumOf(S.accountsOf(world.state, avatar, res)), n, `${originId}：资源 ${res} 的余额应等于起始数量 ${n}`);
      // src_genesis 累计 = 起始数量；守恒式成立。
      assert.equal(S.cumOf(S.totalsOf(world.state, res)[S.GENESIS]), n, `${originId}：资源 ${res} 的 src_genesis 累计应等于 ${n}`);
      S.assertConserved(world.state, res);
    }
  }
  assert.ok(instancedCases > 0, '应至少遍历到一件要建实例的起始物（数据推出）');
  assert.ok(wearableCases > 0, '应至少遍历到一件挂在身上的穿戴物（数据推出）');
  assert.ok(bulkCases > 0, '应至少遍历到一件散货起始物（数据推出）');
});

test('3. 事件一一对应：每条开边恰一条持有变化事件（verb 为 verb_holding_changed，change 为 established）；事件载荷的 edge 与现役边一一对应；事件可追到出身条目', async () => {
  const probe = (await S.freshWorld()).world;
  const rowId = S.rowWithWearable(probe);
  const { world } = await S.freshWorld();
  const before = S.snap(world);
  const r = await S.chooseRow(world, rowId);
  assert.equal(S.isOk(r), true, `选来历应成功：${JSON.stringify(r)}`);

  const live = S.liveEdges(world);
  assert.ok(live.length >= 2, '选该来历后应至少有席位边与一条穿戴边');
  const established = S.holdingEventsAt(world, r.seq).filter((e) => e.payload?.change === 'established');
  assert.equal(established.length, live.length, '每条现役边恰对应一条建立事件（同一事务内）');
  assert.deepEqual(
    established.map((e) => e.payload.edge).sort(),
    live.map((e) => e.edge).sort(),
    '建立事件的 edge 与现役边一一对应',
  );
  // 载荷字段照卷十八 R18-1.11：edge、kind、holder、subject、change、at。
  for (const e of established) {
    for (const k of ['edge', 'kind', 'holder', 'subject', 'change', 'at']) {
      assert.ok(k in e.payload, `持有变化事件载荷应含 ${k}`);
    }
    assert.equal(typeof e.payload.at, 'number', 'at 应为整数分钟');
  }
  // 事件可追到出身条目：本次选来历的事务日志里带出身条目的代号（卷六 :104 账本 refs 同一口径，本卡不另立字段）。
  const originId = S.originIdOf(rowId);
  const txEntries = world.logBook.entries.slice(before.logLen).filter((e) => e.seq === r.seq);
  assert.ok(JSON.stringify(txEntries).includes(originId), `选来历的事务日志应可追到出身条目 ${originId}`);
});
