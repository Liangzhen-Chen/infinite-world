// 卷八 §2.8 加载期校验（kernel/validate/polity-tables.mjs）：每条码一个反例（违反即报）与一个正例（改正后不报）；E-KIN-ORG-TRAITS（卷十八 :300）同。
// 校验器是纯函数，输入是词表族与三张表的展平行，本测试手造最小视图，期望值按卷八 §2.8 的条件手算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPolityTables } from '../../server-plugin/kernel/validate/polity-tables.mjs';

const fam = (entries) => ({ entries });
const FAMILIES = new Map([
  ['orgkind', fam({
    orgkind_s: { sovereign: true, hasTreasury: true, internal: false },
    orgkind_v: { sovereign: false, hasTreasury: true, internal: false },
    orgkind_f: { sovereign: false, hasTreasury: false, internal: true },
  })],
  ['motion', fam({ motion_a: {} })],
  ['officerowkind', fam({ orowk_actual: {}, orowk_kind: {} })],
  ['settletier', fam({ settletier_t: { grantsOffices: [] } })],
]);
const KIND = { officeRowKind: 'orowk_kind', officeKind: null, domain: null, titular: false, powers: ['p'], rank: 1 };
const ACT = { officeRowKind: 'orowk_actual', officeKind: 'o_kind', domain: null, titular: false, revoked: false, powers: ['p'], rank: 1, jurisdictionLevel: 'lvl_a' };
const ORG = { orgKind: 'orgkind_v', polity: null, parent: null, treasury: ['t'], offices: [], headOffice: null, charterRules: { permits: [], duesRow: null, motionRules: {} } };

const TRAIT = { domestic: false, descentGroup: false };
const TRAITS = { social: { orgTraits: { orgkind_s: TRAIT, orgkind_v: TRAIT, orgkind_f: TRAIT } } }; // 默认带齐三条 orgkind 条目的同键行，各用例只看自己的码
function view({ org = {}, office = {}, polity = {}, place = {}, rules = TRAITS } = {}) {
  const t = (rows, dimensions = {}) => ({ flat: { rows: new Map(Object.entries(rows)) }, doc: { dimensions } });
  const motionFields = { quorumBps: { domain: [0, 10000] }, passNum: { domain: [0, null] }, passDen: { domain: [1, null] }, openDays: { domain: [1, null] } };
  const orgDims = { charterRules: { fields: { motionRules: { value: { fields: motionFields } } } } };
  const officeDims = { jurisdictionLevel: { required: 'byEnum:officeRowKind=orowk_actual' }, officeRowKind: { vocab: 'officerowkind' } };
  return { vocab: { families: FAMILIES }, rules, tables: new Map([['org', t(org, orgDims)], ['office', t(office, officeDims)], ['polity', t(polity)], ['place', t(place)]]) };
}
const codes = (v) => checkPolityTables(v).map((e) => e.code);

test('基线：一个合规的村社组织、种类行与实任行（被且仅被一个组织列入）不报任何码', () => {
  assert.deepEqual(codes(view({ org: { org_x: { ...ORG, offices: ['o_act'] } }, office: { o_kind: KIND, o_act: ACT } })), []);
});

test('E-ORG-POLITY：主权类组织行没有政体（polity 为 null）即报；写了政体不报', () => {
  assert.deepEqual(codes(view({ org: { org_s: { ...ORG, orgKind: 'orgkind_s' } } })), ['E-ORG-POLITY']);
  assert.deepEqual(codes(view({ org: { org_s: { ...ORG, orgKind: 'orgkind_s', polity: 'polity_p' } } })), []);
});

test('E-ORG-TREASURY：条目 hasTreasury 为真的组织行 treasury 空集即报；非空不报；hasTreasury 为假的空集不报', () => {
  assert.deepEqual(codes(view({ org: { org_x: { ...ORG, treasury: [] } } })), ['E-ORG-TREASURY']);
  assert.deepEqual(codes(view({ org: { org_x: { ...ORG, treasury: ['t'] } } })), []);
  assert.deepEqual(codes(view({ org: { org_f: { ...ORG, orgKind: 'orgkind_f', parent: 'org_x', treasury: [] }, org_x: ORG } })), []);
});

test('E-ORG-PARENT-CYCLE：parent 链 org_a → org_b → org_a 成环，两行各报一次；链到 null 不报', () => {
  const cyc = view({ org: { org_a: { ...ORG, parent: 'org_b' }, org_b: { ...ORG, parent: 'org_a' } } });
  assert.deepEqual(codes(cyc), ['E-ORG-PARENT-CYCLE', 'E-ORG-PARENT-CYCLE']);
  assert.deepEqual(codes(view({ org: { org_a: { ...ORG, parent: 'org_b' }, org_b: ORG } })), []);
});

test('内部团体（条目 internal 为真）parent 为 null 即报缺必填；指向宿主不报', () => {
  assert.deepEqual(codes(view({ org: { org_f: { ...ORG, orgKind: 'orgkind_f', treasury: [] } } })), ['E-DIM-REQUIRED-MISSING']);
});

test('E-ORG-CHARTER：引用未登记的议案种类、passNum 大于 passDen、quorumBps 越过 10000、openDays 小于 1 各报；合规不报', () => {
  const rule = { quorumBps: 5000, passNum: 1, passDen: 2, openDays: 3 };
  const mk = (motionRules) => view({ org: { org_x: { ...ORG, charterRules: { permits: [], duesRow: null, motionRules } } } });
  assert.deepEqual(codes(mk({ motion_a: rule })), []);
  assert.deepEqual(codes(mk({ motion_zz: rule })), ['E-ORG-CHARTER']);
  assert.deepEqual(codes(mk({ motion_a: { ...rule, passNum: 3 } })), ['E-ORG-CHARTER']);
  assert.deepEqual(codes(mk({ motion_a: { ...rule, quorumBps: 10001 } })), ['E-ORG-CHARTER']);
  assert.deepEqual(codes(mk({ motion_a: { ...rule, openDays: 0 } })), ['E-ORG-CHARTER']);
  assert.deepEqual(codes(mk({ motion_a: { ...rule, passDen: 0, passNum: 0 } })), ['E-ORG-CHARTER']);
});

test('E-OFFICE-ORG：实任职位行不在任何组织 offices 里、或在两个组织里即报；恰一个不报；首领职位须在本组织 offices 内', () => {
  assert.deepEqual(codes(view({ org: { org_x: ORG }, office: { o_kind: KIND, o_act: ACT } })), ['E-OFFICE-ORG']);
  assert.deepEqual(codes(view({ org: { org_x: { ...ORG, offices: ['o_act'] }, org_y: { ...ORG, offices: ['o_act'] } }, office: { o_kind: KIND, o_act: ACT } })), ['E-OFFICE-ORG']);
  assert.deepEqual(codes(view({ org: { org_x: { ...ORG, offices: [], headOffice: 'o_act' } }, office: { o_kind: KIND } })), ['E-OFFICE-ORG']);
});

test('E-OFFICE-KIND：种类行 officeKind/domain 非空或 titular 为真、被列入组织 offices、被 appointedBy 指、实任行的 officeKind 指向非种类行、councilOffices 与层级 grantsOffices 指向非种类行，各报', () => {
  assert.ok(codes(view({ office: { o_kind: { ...KIND, officeKind: 'o_kind' } } })).includes('E-OFFICE-KIND'));
  assert.ok(codes(view({ office: { o_kind: { ...KIND, domain: 'loc_a' } } })).includes('E-OFFICE-KIND'));
  assert.ok(codes(view({ office: { o_kind: { ...KIND, titular: true } } })).includes('E-OFFICE-KIND'));
  assert.ok(codes(view({ org: { org_x: { ...ORG, offices: ['o_kind'] } }, office: { o_kind: KIND } })).includes('E-OFFICE-KIND'));
  assert.ok(codes(view({ org: { org_x: { ...ORG, offices: ['o_act', 'o_b'] } }, office: { o_kind: KIND, o_act: { ...ACT, appointedBy: 'o_kind' }, o_b: { ...ACT, officeKind: 'o_act' } } })).filter((c) => c === 'E-OFFICE-KIND').length === 2);
  assert.deepEqual(codes(view({ polity: { polity_p: { councilOffices: ['o_act'], taxRules: [] } }, org: { org_x: { ...ORG, offices: ['o_act'] } }, office: { o_kind: KIND, o_act: ACT } })), ['E-OFFICE-KIND']);
  assert.deepEqual(codes(view({ polity: { polity_p: { councilOffices: ['o_kind'], taxRules: [] } }, office: { o_kind: KIND } })), []);
  // 层级条目的 grantsOffices 指向 o_kind：世界里没有 o_kind 这一行（不是种类行）即报；指向种类行不报
  const tierView = (office) => ({ ...view({ office }), vocab: { families: new Map([...FAMILIES, ['settletier', fam({ settletier_t: { grantsOffices: ['o_kind'] } })]]) } });
  assert.deepEqual(codes(tierView({})), ['E-OFFICE-KIND']);
  assert.deepEqual(codes(tierView({ o_kind: KIND })), []);
});

test('E-OFFICE-DOMAIN-LEVEL：辖区地点行的层级与职位行 jurisdictionLevel 不一致即报；一致不报；辖区是没有层级的站点不核', () => {
  const act = { ...ACT, domain: 'loc_a' };
  const org = { org_x: { ...ORG, offices: ['o_act'] } };
  assert.deepEqual(codes(view({ org, office: { o_kind: KIND, o_act: act }, place: { loc_a: { regionLevel: 'lvl_b' } } })), ['E-OFFICE-DOMAIN-LEVEL']);
  assert.deepEqual(codes(view({ org, office: { o_kind: KIND, o_act: act }, place: { loc_a: { regionLevel: 'lvl_a' } } })), []);
  assert.deepEqual(codes(view({ org, office: { o_kind: KIND, o_act: act }, place: { loc_a: {} } })), []);
});

test('E-OFFICE-BENCH：bench 所指行自身有 bench（成链）、或同席两行权能不同、位阶不同即报；同席同权同阶不报', () => {
  const org = { org_x: { ...ORG, offices: ['o_h', 'o_m'] } };
  const head = { ...ACT, bench: null };
  assert.deepEqual(codes(view({ org, office: { o_kind: KIND, o_h: head, o_m: { ...ACT, bench: 'o_h' } } })), []);
  assert.deepEqual(codes(view({ org, office: { o_kind: KIND, o_h: head, o_m: { ...ACT, bench: 'o_h', rank: 2 } } })), ['E-OFFICE-BENCH']);
  assert.deepEqual(codes(view({ org, office: { o_kind: KIND, o_h: head, o_m: { ...ACT, bench: 'o_h', powers: ['q'] } } })), ['E-OFFICE-BENCH']);
  assert.ok(codes(view({ org, office: { o_kind: KIND, o_h: { ...ACT, bench: 'o_m' }, o_m: { ...ACT, bench: 'o_h' } } })).includes('E-OFFICE-BENCH'));
});

test('E-TITLE-DUP：同一地点两条未撤销的头衔即报；其一已撤销不报', () => {
  const org = { org_x: { ...ORG, offices: ['o_a', 'o_b'] } };
  const t = { ...ACT, titular: true, domain: 'loc_a' };
  const place = { loc_a: {} };
  assert.deepEqual(codes(view({ org, place, office: { o_kind: KIND, o_a: t, o_b: t } })), ['E-TITLE-DUP']);
  assert.deepEqual(codes(view({ org, place, office: { o_kind: KIND, o_a: t, o_b: { ...t, revoked: true } } })), []);
});

test('E-TAX-ROW 与 E-TAX-DUP：taxRules.to 指向非种类行、同一 base 两项各报；合规不报', () => {
  const office = { o_kind: KIND };
  const ok = { councilOffices: [], taxRules: [{ base: 'taxbase_a', rate: 0.1, to: 'o_kind' }, { base: 'taxbase_b', rate: 0.1, to: 'o_kind' }] };
  assert.deepEqual(codes(view({ office, polity: { polity_p: ok } })), []);
  assert.deepEqual(codes(view({ office, polity: { polity_p: { councilOffices: [], taxRules: [{ base: 'taxbase_a', rate: 0.1, to: 'o_zz' }] } } })), ['E-TAX-ROW']);
  assert.deepEqual(codes(view({ office, polity: { polity_p: { councilOffices: [], taxRules: [{ base: 'taxbase_a', rate: 0.1, to: 'o_kind' }, { base: 'taxbase_a', rate: 0.2, to: 'o_kind' }] } } })), ['E-TAX-DUP']);
});

test('E-KIN-ORG-TRAITS：orgkind 族条目在 rules.social.orgTraits 缺同键的行、行缺 domestic 或 descentGroup、行的键不是 orgkind 条目各报；三条齐全不报', () => {
  const rowF = { domestic: false, descentGroup: false };
  const full = { orgkind_s: rowF, orgkind_v: rowF, orgkind_f: rowF };
  const rules = (orgTraits) => ({ social: { orgTraits } });
  const only = (orgTraits) => checkPolityTables(view({ office: { o_kind: KIND }, rules: rules(orgTraits) })).filter((e) => e.code === 'E-KIN-ORG-TRAITS');
  assert.equal(only(full).length, 0);
  assert.equal(only({ orgkind_s: rowF, orgkind_v: rowF }).length, 1);
  assert.equal(only({ ...full, orgkind_v: { domestic: false } }).length, 1);
  assert.equal(only({ ...full, orgkind_zz: rowF }).length, 1);
});

test('M5 E-KIN-ORG-TRAITS 没有 social 闸门：rules 里没登记 social 表（或没有 orgTraits 键）时，三条 orgkind 条目各报一次', () => {
  const only = (rules) => checkPolityTables(view({ office: { o_kind: KIND }, rules })).filter((e) => e.code === 'E-KIN-ORG-TRAITS');
  assert.deepEqual(only({}).map((e) => e.row || e.got).sort(), ['orgkind_f', 'orgkind_s', 'orgkind_v']);
  assert.equal(only({ social: {} }).length, 3);
});

test('卷八 :378 polity.gen.holdCause 不得在 polity.hold.forcibleCauses 里：取强取原因即报；取别的原因、没登记 holdCause 都不报', () => {
  const withRules = (polity) => codes(view({ rules: { ...TRAITS, polity } }));
  assert.deepEqual(withRules({ holdForcibleCauses: ['verb_a', 'verb_b'], genHoldCause: 'verb_a' }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(withRules({ holdForcibleCauses: ['verb_a', 'verb_b'], genHoldCause: 'verb_c' }), []);
  assert.deepEqual(withRules({ holdForcibleCauses: ['verb_a'] }), []);
});
