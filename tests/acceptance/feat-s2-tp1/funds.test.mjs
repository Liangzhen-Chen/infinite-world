// S2-TP1 黑盒验收：组织开局公库守恒（卷六 §4.22 开局入账）、不落「已解锁」状态（卷十五 A15-15.1）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { genesisEntriesOf, bumpGenesisFunds } from '../../support/governor-of-data.mjs';

after(S.cleanup);

// 账户book：accounts.<持有人>.<用途>.<资源>.<键> = 整数。返回 资源 → 合计。
function sumByResource(book) {
  const out = {};
  const walk = (v, path) => {
    if (Number.isSafeInteger(v)) { const res = path[1]; out[res] = (out[res] ?? 0) + v; return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, [...path, k]);
  };
  walk(book, []);
  return out;
}
const allAccountTotal = (state) => Object.values(state.accounts ?? {})
  .reduce((s, book) => s + Object.values(sumByResource(book)).reduce((a, b) => a + b, 0), 0);
// 键名扫描：任何层级的键名含「解锁／传送标记」一律算违例（A15-15.1 要求的字段数为 0）。
function keysDeep(v, out = []) {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keysDeep(x, out); }
  return out;
}

test('4a. 组织开局公库＝genesisFunds：每个写了开局资金的组织，账上各资源合计等于数据里的数（卷六 §4.22 规则 3，只在第 0 日）', async () => {
  const { world } = await S.freshWorld();
  const orgs = S.orgsOf(S.ROOT);
  const withGenesis = Object.keys(orgs).filter((k) => genesisEntriesOf(orgs[k]).length > 0);
  assert.ok(withGenesis.length > 0, '前提：数据里应有写了 genesisFunds 的组织');
  for (const id of withGenesis) {
    const want = {};
    for (const g of genesisEntriesOf(orgs[id])) want[g.resource] = (want[g.resource] ?? 0) + g.amount;
    const got = sumByResource(world.state.accounts?.[id] ?? {});
    for (const [res, amount] of Object.entries(want)) {
      assert.equal(got[res] ?? 0, amount, `组织 ${id} 资源 ${res} 的开局公库应为 ${amount}，实得 ${got[res] ?? 0}（金额为 0 的不开户，缺即 0）`);
    }
  }
});

test('4b. 守恒：把某组织的 genesisFunds 加 D（只改副本），开局后全体账户合计恰好多 D（开局入账是一笔有来源的入账，不凭空多也不少）', async () => {
  const base = await S.freshWorld();
  const baseTotal = allAccountTotal(base.world.state);
  const fx = S.copyFixture();
  const orgs = S.orgsOf(fx.repo);
  const target = Object.keys(orgs).find((k) => genesisEntriesOf(orgs[k]).length > 0);
  assert.ok(target, '前提：数据里应有写了 genesisFunds 的组织');
  const D = 777;
  const res = genesisEntriesOf(orgs[target])[0].resource;
  const before = sumByResource(base.world.state.accounts?.[target] ?? {})[res] ?? 0;
  S.editJson(fx, 'world/ontology/dimensions/org.json', (doc) => { bumpGenesisFunds(doc.rows[target], D); });
  const fixed = await S.bootFixture(fx);
  assert.equal(allAccountTotal(fixed.world.state) - baseTotal, D, '全体账户合计应多 D');
  assert.equal((sumByResource(fixed.world.state.accounts?.[target] ?? {})[res] ?? 0) - before, D, '该组织该资源应多 D');
});

test('4c. 账本总表有开局来源：开局入账记在开局来源名下，合计与各组织开局公库之和一致（卷六 §4.22）', async () => {
  const { world } = await S.freshWorld();
  const orgs = S.orgsOf(S.ROOT);
  const genesisSum = Object.values(orgs).reduce((s, o) => s + S.fundsOfOrg(o), 0);
  // 账本总表按资源分：每个资源的 src_genesis 累计（cumulative，与 S2-L 的 cumOf 同口径）合计，即开局入账的总额。
  const totals = world.state.ledgerTotals ?? {};
  const under = Object.values(totals).map((t) => t?.src_genesis).filter((v) => v !== undefined)
    .map((v) => (typeof v === 'number' ? v : v?.cumulative));
  assert.ok(under.length > 0, '开局后账本总表应有 src_genesis 记录');
  assert.equal(under.reduce((a, b) => a + b, 0), genesisSum, 'src_genesis 合计应等于各组织 genesisFunds 之和');
});

test('5a. 不落「已解锁」状态：开局后整份 state 的键名里没有解锁或传送标记类字段（卷十五 A15-15.1：字段数 0）', async () => {
  const { world } = await S.freshWorld();
  const bad = keysDeep(world.state).filter((k) => /解锁|unlock|teleport|传送标记|travelMark/i.test(k));
  assert.deepEqual(bad, [], `state 里不应有解锁类字段：${bad.join(',')}`);
});
