// 长测，腾讯云块验收（G18）跑；本机常规测试不跑（tests/cloud/ 目录，真实世界整段补缺 generateFill 约两分钟，本文件跑两遍）。
// 世界创建入口 generateWorld（卷十 §3.2 :291；李白 11-22 18:36 P-28～P-30）在真实世界上整条流水跑一遍：fill（generateFill）→ governors（applyGovernorCalls）→ assets（applyOpeningAssets）→ people（applyOpeningPeople），
// 次序来自规则表 rules.gen.createSteps。读数与 tests/cloud/opening-holdings-hw.test.mjs 同一口径：两条开局统治边、试玩地区 19 栋建筑各记一万基点到持有人名下（其中九栋住处归家户）、
// 59 个人物建行、22 户各恰一条户主边；固定种子跑两遍，写下的全部通道与整棵状态逐字节相同。输入输出读法同该文件（geo.authored、buildingIds 按上格前的真实世界写成，上格后首跑须核对）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine, openHoldingsOfKind } from '../../server-plugin/kernel/holdings.mjs';
import { balance, auditLedger } from '../../server-plugin/kernel/ledger.mjs';
import { governorOf } from '../../server-plugin/kernel/title.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { generateWorld } from '../../server-plugin/world-create.mjs';
import { ROOT } from '../kernel/polity-world.mjs'; // 同时装入摘要常数（installDigestCap）

useReportSink(() => {});
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const OPENING = json('world/design/opening-polity-hw.json');
const LOCATIONS = json('world/geo/locations.json');
const ROSTER = json('world/people/opening-roster-hw.json');
const START = json('world/geo/start-buildings.json').rows;
const CLASSES = json('world/geo/building-classes.json').rows;

const W = loadWorld(ROOT);
assert.equal(W.ok, true, W.text);
installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'opening_hw_seed' } };
const CTX = { node: 'test_world_create_hw', file: 'tests/cloud/world-create-hw.test.mjs' };
const TEMPLATE = { worldSeed: 'opening_hw_seed', genesisMinute: 0 };
const RES = { kind: 'res_building_share', key: '' };
const GENERAL = 'purpose_general';
const VILLAGE = 'org_village_hw';
const PLACES = W.tables.get('place').flat.rows;

const BUILDING_IDS = [...new Set([...START.map((r) => r.id), ...CLASSES.map((r) => r.id)])].filter((id) => PLACES.has(id)).sort();
const OWNER_OF = new Map(LOCATIONS.filter((r) => typeof r.owner === 'string').map((r) => [r.id, r.owner]));
const AUTHORED = new Map([...CLASSES, ...START].filter((r) => typeof r.intendedType === 'string' && PLACES.has(r.id)).map((r) => [r.id, { intendedType: r.intendedType }]));
const INPUTS = () => ({
  world: W,
  geo: { authored: AUTHORED, downhill: [], buildingIds: BUILDING_IDS },
  genViews: { heldBy: OPENING.governs.map((g) => [g.place, { org: g.org, cause: g.cause }]), ownerOf: (id) => OWNER_OF.get(id) },
  roster: ROSTER,
});
const WRITTEN = W.rules.gen.createSteps.flatMap((s) => s.writes); // 步骤表声明的全部写通道
function create() {
  installHoldingEngine(ENGINE);
  installEventLog({ entries: [] });
  const state = { clock: { minute: 0, seq: 0 } };
  const r = generateWorld(ENGINE, state, TEMPLATE, INPUTS(), { ctx: CTX });
  assert.equal(r.ok, true, JSON.stringify(r));
  return { state, r };
}

// 九栋住处与十栋公有建筑的期望（字面量，同 opening-holdings-hw.test.mjs）：十栋归村社，住处归各自家户（河边小屋归 house_hw_03）。
const DWELLING = { bld_hw_home_15: 'org_house_hw_15', bld_hw_home_16: 'org_house_hw_16', bld_hw_home_17: 'org_house_hw_17', bld_hw_home_18: 'org_house_hw_18', bld_hw_home_19: 'org_house_hw_19', bld_hw_home_20: 'org_house_hw_20', bld_hw_home_21: 'org_house_hw_21', bld_hw_home_22: 'org_house_hw_22', bld_hw_riverhome: 'org_house_hw_03' };
const COMMON = ['bld_hw_altar', 'bld_hw_council', 'bld_hw_forge', 'bld_hw_grain_annex', 'bld_hw_herbs', 'bld_hw_mill', 'bld_hw_post', 'bld_hw_qingdeng', 'bld_hw_school', 'bld_hw_weaving'];

test('真实世界跑一遍 generateWorld：两条开局统治边、19 栋建筑归户入账、59 人建行、22 户各恰一条户主边；账本守恒', () => {
  const { state, r } = create();
  assert.equal(r.channels['edge.governor'].skipped.length, 0);
  assert.equal(r.channels['edge.governor'].written.length, 2); // 现在 fill.calls 因政体输入未建为空，只有两条作者写的边；政体输入接上后此处会变，测试会及时报
  // fill 一步的全部产出都在通道里、不丢（落盘待 6-16 新开局卡）：生成行与新建组织行是对象，待转换行与推迟项是数组，报告带改动数。
  assert.equal(typeof r.channels['fill.generated'], 'object');
  assert.equal(typeof r.channels['fill.created'], 'object');
  assert.ok(Array.isArray(r.channels['fill.pending']) && Array.isArray(r.channels['fill.deferred']));
  assert.equal(typeof r.channels['fill.report'].changed, 'number');
  for (const k of W.rules.gen.createSteps[0].writes) assert.notEqual(r.channels[k], undefined, k);
  assert.equal(governorOf(ENGINE, state, 'loc_hw').org, VILLAGE);
  assert.equal(governorOf(ENGINE, state, 'loc_capital').org, 'org_realm_main');
  for (const b of COMMON) assert.equal(balance(ENGINE, state, VILLAGE, { ...RES, key: b }, GENERAL), 10000, b);
  for (const [b, owner] of Object.entries(DWELLING)) assert.equal(balance(ENGINE, state, owner, { ...RES, key: b }, GENERAL), 10000, b);
  assert.deepEqual(auditLedger(ENGINE, state), []);
  assert.equal(r.channels['person.opening'].people.length, 59);
  assert.equal(r.channels['person.opening'].households.length, 22);
  assert.equal(openHoldingsOfKind(state, W.rules.gen.householdHeadKind).length, 22);
});

test('同种子两次从头创建：写下的全部通道与整棵状态逐字节相同', () => {
  const once = () => { const { state, r } = create(); return JSON.stringify([WRITTEN.map((k) => r.channels[k]), state]); };
  assert.equal(once(), once());
});
