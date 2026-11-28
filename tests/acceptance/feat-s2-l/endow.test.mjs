// S2-L（最小账本）黑盒验收，第 1、2 条：开局给钱（经账本真实入账、可追溯）；坏数据在加载期拒。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2l。依据与每条测的是什么见 docs/卡档案/feat-s2-l/出题.md。
// 期望值全部从 world/ 数据读（出身条目 startingMoney、startingCoin，资源种类表，_vocab verb 族）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as S from './support.mjs';
import { genesisEntriesOf } from '../../support/governor-of-data.mjs';

after(S.cleanup);

test('1. 开局给钱：三个起始钱各不相同的来历各自入账；化身账户余额 = startingMoney，src_genesis 累计相同，事件带出身条目', async () => {
  const { world } = await S.freshWorld();
  const picks = [];
  const seen = new Set();
  for (const rowId of S.offered(world)) {
    const money = S.originOf(rowId).startingMoney;
    if (typeof money !== 'number' || seen.has(money)) continue;
    seen.add(money);
    picks.push(rowId);
    if (picks.length === 3) break;
  }
  assert.equal(picks.length, 3, '候选来历中应有三个起始钱各不相同的来历（数据推出）');

  for (const rowId of picks) {
    const entry = S.originOf(rowId);
    const originId = S.originIdOf(rowId);
    const { world: w } = await S.freshWorld();
    const before = S.snap(w);
    const r = await S.chooseOrigin(w, S.offered(w).indexOf(rowId));
    assert.equal(S.isOk(r), true, `选来历 ${originId} 应成功：${JSON.stringify(r)}`);

    const avatars = S.newPersons(w, before);
    assert.equal(avatars.length, 1, '选来历应新建恰一个化身');
    const coin = entry.startingCoin;
    assert.equal(typeof coin, 'string', `出身条目 ${originId} 应有 startingCoin（钱的资源种类键）`);
    assert.ok(S.RESOURCE_IDS.includes(coin), 'startingCoin 应是资源种类表中的键');
    assert.equal(S.balance(w.state, avatars[0], coin), entry.startingMoney, '化身账户余额应等于 startingMoney');
    // 世界 src_genesis 累计 = 化身起始钱 + 各组织开局公库（genesisFunds 中该钱资源的金额之和），两项都从数据推算（不抄「全世界只有化身」的计数）。
    const orgRows = S.loadJson(join(S.ROOT, 'world/ontology/dimensions/org.json')).rows;
    const orgGenesis = Object.values(orgRows).flatMap((o) => genesisEntriesOf(o))
      .filter((g) => g.resource === coin).reduce((sum, g) => sum + g.amount, 0);
    assert.equal(S.cumOf(S.totalsOf(w.state, coin)[S.GENESIS]), entry.startingMoney + orgGenesis, 'src_genesis 累计应等于化身起始钱加各组织 genesisFunds 之和');
    S.assertConserved(w.state, coin);

    const ev = w.logBook.entries.find((e) => e.kind === 'event' && e.ok === true && e.seq === r.seq
      && S.VERB_IDS.includes(e.verb) && JSON.stringify(e.payload ?? {}).includes(originId));
    assert.ok(ev, `${originId}：选来历的那个 seq 下应有一条带出身条目的登记事件（verb 为 _vocab verb 族的代号）`);
  }
});

test('2. 坏数据在加载期拒：出身指向的钱资源 sources 不含 src_genesis，init 即拒；同一出身、数据完好则照常开局', async () => {
  const originId = S.ORIGIN_IDS[0];
  // 对照：只把出身钱指向钱资源，数据完好 → 能开局。
  const ok = S.copyFixture();
  S.editJson(ok, 'world/ontology/dimensions/_vocab.json', (v) => { v.families.origin.entries[originId].startingCoin = S.COIN_RES; });
  const world = await S.bootFixture(ok);
  assert.ok(world?.state, '数据完好的对照副本应能开局');

  // 坏数据：同样的出身，但钱资源的 sources 去掉 src_genesis。
  const bad = S.copyFixture();
  S.editJson(bad, 'world/ontology/dimensions/_vocab.json', (v) => { v.families.origin.entries[originId].startingCoin = S.COIN_RES; });
  S.editJson(bad, 'world/rules/tables/economy/resources.json', (d) => {
    const row = d.rows.find((x) => x.key === S.COIN_RES);
    row.value.sources = row.value.sources.filter((s) => s !== S.GENESIS);
  });
  await assert.rejects(S.bootFixture(bad), '钱资源不含 src_genesis 时应在加载期（init）即拒，而不是到选来历时才失败');
});
