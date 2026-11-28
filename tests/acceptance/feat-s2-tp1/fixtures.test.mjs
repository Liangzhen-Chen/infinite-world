// S2-TP1 黑盒验收：数据夹具（只改副本里的数据，不改仓库）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-tp1。
// 依据与每条测的是什么见 docs/卡档案/feat-s2-tp1/出题.md。期望集合每次都从副本的数据重新推算。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from './support.mjs';
import { genesisEntriesOf, bumpGenesisFunds } from '../../support/governor-of-data.mjs';

after(S.cleanup);

const VOCAB = 'world/ontology/dimensions/_vocab.json';
const ORG = 'world/ontology/dimensions/org.json';

// 本地规矩条目在 _vocab.json 的 circle_rule 词表族：写入即 families.circle_rule.entries[code]。
function putRule(doc, code, value) { doc.families.circle_rule.entries[code] = value; }
const ruleValueIn = (doc, code) => doc.families.circle_rule.entries[code];

async function assertMatchesDerived(fx, world, label) {
  const want = [...S.expectedCircleSites(fx.repo).keys()].sort();
  const got = S.operatesEdges(world.state, fx.repo).map((e) => e.holder).sort();
  assert.deepEqual(got, want, `${label}：法阵集合应等于副本数据推算的集合`);
  return { want, got };
}

test('3a. 门槛改数据：白石镇规矩的户数门槛改为 31（只改副本的 _vocab.json 的 circle_rule 族），开局后只剩镇有法阵', async () => {
  const fx = S.copyFixture();
  const town = S.townOrgOf(fx.repo);
  const code = S.effectiveRuleCode(fx.repo, town);
  S.editJson(fx, VOCAB, (doc) => {
    const r = { ...ruleValueIn(doc, code) };
    assert.ok(Number.isInteger(r.minHouses), '前提：规矩应有 minHouses（设阵户数门槛）');
    r.minHouses = 31;
    putRule(doc, code, r);
  });
  const { world } = await S.bootFixture(fx);
  const { want, got } = await assertMatchesDerived(fx, world, '门槛 31');
  assert.deepEqual(got, [town], `门槛 31 时只剩镇有法阵，实得 ${got.join(',')}（推算 ${want.join(',')}）`);
});

test('3b. 公库改数据：把一个「户数够、公库不够」的聚落的开局资金调高（只改副本），它就有了法阵', async () => {
  const fx = S.copyFixture();
  const rules = S.circleRulesOf(fx.repo);
  const tiers = (S.vocabOf(fx.repo).circle_tier?.entries ?? {});
  const houses = S.housesOf(fx.repo);
  const orgs = S.orgsOf(fx.repo);
  const sites = S.expectedCircleSites(fx.repo);
  const poor = S.settlementOrgIds(fx.repo).find((id) => {
    if (sites.has(id)) return false;
    const code = S.effectiveRuleCode(fx.repo, id);
    if (!code) return false;
    const r = rules[code];
    const tier = tiers[r.tier];
    const h = houses.get(id) ?? 0;
    return S.evalRX(r.buildRX, { site: { houses: h }, org: { funds: Infinity }, tier, rule: r })
      && !S.evalRX(r.buildRX, { site: { houses: h }, org: { funds: S.fundsOfOrg(orgs[id], r.currency) }, tier, rule: r });
  });
  assert.ok(poor, '前提：数据里应有一个穷村');
  S.editJson(fx, ORG, (doc) => {
    assert.ok(genesisEntriesOf(doc.rows[poor]).length > 0, '前提：穷村应有 genesisFunds 行');
    bumpGenesisFunds(doc.rows[poor], 100000);
  });
  const { world } = await S.bootFixture(fx);
  const { got } = await assertMatchesDerived(fx, world, '穷村加钱');
  assert.ok(got.includes(poor), `${poor} 资金调高后应有法阵`);
});

test('3c. 自定规矩：给一个有法阵的村社挂一条自己的规矩（只改副本：新增规矩行，村社的 circleRule 指向它，门槛不可达），它不再有法阵，别的不变', async () => {
  const fx = S.copyFixture();
  const town = S.townOrgOf(fx.repo);
  const base = S.expectedCircleSites(fx.repo);
  const village = [...base.keys()].find((id) => id !== town);
  assert.ok(village, '前提：数据里应有一个有法阵的村社');
  const code = S.effectiveRuleCode(fx.repo, town);
  const own = 'crule_tp1_village_own';
  S.editJson(fx, VOCAB, (doc) => {
    const r = { ...ruleValueIn(doc, code) };
    r.minHouses = 999999;
    putRule(doc, own, r);
  });
  S.editJson(fx, ORG, (doc) => { doc.rows[village].circleRule = own; });
  const { world } = await S.bootFixture(fx);
  const { got } = await assertMatchesDerived(fx, world, '村社自定规矩');
  assert.equal(got.includes(village), false, `${village} 按自己的规矩判，不应有法阵`);
  for (const id of base.keys()) if (id !== village) assert.ok(got.includes(id), `${id} 的规矩未动，应仍有法阵`);
});

test('3d. 宿主换数据：把镇衙署组织行的 seatBuilding 改为另一处与原宿主同用途的镇内建筑（只改副本），法阵宿主随之变', async () => {
  const fx = S.copyFixture();
  const town = S.townOrgOf(fx.repo);
  const code = S.effectiveRuleCode(fx.repo, town);
  const places = S.placesOf(fx.repo);
  const oldHost = S.orgsOf(fx.repo)[town].seatBuilding;
  const hostType = places[oldHost]?.intendedType;
  const alt = Object.keys(places).find((id) => id !== oldHost && S.isBuildingRow(places[id])
    && places[id].intendedType === hostType && S.ownerOfPlace(fx.repo, id) === town);
  assert.ok(alt, '前提：镇内应有另一处与宿主同用途的建筑');
  S.editJson(fx, ORG, (doc) => { doc.rows[town].seatBuilding = alt; });
  const { world } = await S.bootFixture(fx);
  const edge = S.operatesEdges(world.state, fx.repo).find((e) => e.holder === town);
  assert.ok(edge, '镇应仍有法阵');
  assert.equal(edge.subject, alt, `法阵宿主应随 seatBuilding 变为 ${alt}`);
  assert.equal(S.expectedCircleSites(fx.repo).get(town).host, alt, '推算的宿主也应为新值');
});
