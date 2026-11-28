// S2-TP1 黑盒验收：法阵由数据派生、宿主取组织行 seatBuilding、穷村无法阵、怪物社会不开放（卷八:1267、卷十五:1139、卷六 §4.22）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。期望集合全部由 org/place/circle/_vocab 数据推算（support.mjs#expectedCircleSites），不写死个数与村名。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';

after(S.cleanup);

test('2a. 法阵集合＝数据推算集合：开局后持有 hk_operates 边的聚落，与按 buildRX 推算出的聚落逐个相同（前提：既有有法阵的，也有没有的）', async () => {
  const { world } = await S.freshWorld();
  const want = [...S.expectedCircleSites(S.ROOT).keys()].sort();
  const settle = S.settlementOrgIds(S.ROOT);
  assert.ok(want.length > 0 && want.length < settle.length, '前提：推算出的法阵聚落应非空且不是全部');
  const got = S.operatesEdges(world.state, S.ROOT).map((e) => e.holder).sort();
  assert.deepEqual(got, want);
});

test('2b. 法阵归所在聚落组织：每座法阵的持有者是宿主所在聚落的组织，且与 ownerOfPlace 推出的归属一致', async () => {
  const { world } = await S.freshWorld();
  for (const e of S.operatesEdges(world.state, S.ROOT)) {
    const host = S.placesOf(S.ROOT)[e.subject];
    assert.ok(host, `法阵标的 ${e.subject} 应为地点行中的建筑`);
    assert.equal(S.ownerOfPlace(S.ROOT, e.subject), e.holder, `法阵 ${e.subject} 的持有者应为其归属聚落组织`);
  }
});

test('2c. 宿主取组织行 seatBuilding：每座法阵的标的等于推算出的 seatBuilding；宿主是建筑行（宿主由组织行 seatBuilding 显式写，裁定更正节，规矩不再有 hostTypes；卷十七:637 设施持有者）', async () => {
  const { world } = await S.freshWorld();
  const rules = S.circleRulesOf(S.ROOT);
  const sites = S.expectedCircleSites(S.ROOT);
  const edges = new Map(S.operatesEdges(world.state, S.ROOT).map((e) => [e.holder, e]));
  for (const [org, site] of sites) {
    assert.ok(site.host, `${org} 的组织行应写 seatBuilding（卷文不许按 id 字典序猜宿主）`);
    const e = edges.get(org);
    assert.ok(e, `${org} 应有法阵边`);
    assert.equal(e.subject, site.host, `${org} 的法阵宿主应为 seatBuilding ${site.host}`);
    const host = S.placesOf(S.ROOT)[site.host];
    assert.ok(S.isBuildingRow(host), `宿主 ${site.host} 应是建筑`);
  }
});

test('2d. 穷村无法阵：人数（户数）够、公库不够的聚落没有法阵。判据由数据推出：把公库置为无穷，规矩就通过；按实际公库则不过', async () => {
  const { world } = await S.freshWorld();
  const sites = S.expectedCircleSites(S.ROOT);
  const rules = S.circleRulesOf(S.ROOT);
  const tiers = (S.vocabOf(S.ROOT).circle_tier?.entries ?? {});
  const houses = S.housesOf(S.ROOT);
  const orgs = S.orgsOf(S.ROOT);
  // 穷村：户数判据在无穷公库下通过，而按实际公库不过。
  const poor = S.settlementOrgIds(S.ROOT).filter((id) => {
    if (sites.has(id)) return false;
    const code = S.effectiveRuleCode(S.ROOT, id);
    if (!code) return false;
    const r = rules[code];
    const tier = tiers[r.tier];
    const h = houses.get(id) ?? 0;
    const passesWithoutMoney = S.evalRX(r.buildRX, { site: { houses: h }, org: { funds: Infinity }, tier, rule: r });
    const passesWithMoney = S.evalRX(r.buildRX, { site: { houses: h }, org: { funds: S.fundsOfOrg(orgs[id], r.currency) }, tier, rule: r });
    return passesWithoutMoney && !passesWithMoney;
  });
  assert.ok(poor.length > 0, '前提：数据里应有一个人数够、公库不够的聚落（穷村）');
  const have = new Set(S.operatesEdges(world.state, S.ROOT).map((e) => e.holder));
  for (const id of poor) assert.equal(have.has(id), false, `穷村 ${id} 不应有法阵`);
});

test('2e. 怪物社会不进法阵与落脚处：法阵宿主不在怪物社会地点里，开局落脚处候选里也没有怪物社会地点（怪物社会由组织种类推出）', async () => {
  const { world } = await S.freshWorld();
  const offer = S.lodgeOffer(world);
  for (const e of S.operatesEdges(world.state, S.ROOT)) assert.equal(S.isMonsterPlace(S.ROOT, e.subject), false, `法阵 ${e.subject} 不应在怪物社会里`);
  const bad = offer.filter((id) => S.isMonsterPlace(S.ROOT, id));
  assert.deepEqual(bad, [], `落脚处候选不应含怪物社会地点：${bad.join(',')}`);
});
