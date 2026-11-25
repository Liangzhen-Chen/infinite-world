// 块 6 第 6-11 张《市场需求》之惯常价与惯常成交量：卷六《经济》§4.4.3 规则 4 :499（expectWindowDays 内成交量的移动平均为惯常成交量，同窗口成交均价为惯常价；
// 成交不少于 minTradesForHabit 条用成交记录，不足取这件货自己的估值角色价、成交量取零）与卷六 §4.14 规则 2 :918（多种计价资源取成交额加权的众数币，平局代号字典序最小）。
// 期望值按卷文公式手算成字面量；窗口、最少条数由本测试在临时世界里给定（真实表的暂定值不进断言）；估值取 price.test.mjs 同一前提：铁锭 2 kg × 铁 valueMult 3 × unitValue 10 = 60。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseFixture, loadItemWorld, itemRow, share } from './item-world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { minutesPerDay } from '../../server-plugin/kernel/scheduler.mjs';
import { habitualOf, demand } from '../../server-plugin/demand.mjs';

const body = (m, s) => share('mgroup_body', m, s);
const puseRow = (extra = {}) => ({ role: 'prole_worth', frame: 'pframe_market', liquidationCurveKey: null, includesScarcity: false, basisRule: 'pbasis_market', subjectCtx: null, ...extra });

function engine(rules = { expectWindowDays: 10, minTradesForHabit: 2 }) {
  const f = baseFixture();
  f.items = { item_test_ingot: itemRow(2, [body('mat_test_iron', 1)]) };
  f.editVocab = (doc) => {
    Object.assign(doc.families.puse.entries, { puse_test_worth: puseRow(), puse_test_scarce: puseRow({ includesScarcity: true }) });
  };
  const r = loadItemWorld(f);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const W = r.world;
  installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
  W.vocab.index.set('res_test_ingot', { family: 'resource', prefix: 'res_', entry: { item: 'item_test_ingot' } });
  const eng = { vocab: W.vocab, rules: structuredClone(W.rules), units: W.env.units, tables: W.tables };
  if (rules === null) delete eng.rules.demand;
  else eng.rules.demand = { ...eng.rules.demand, ...rules };
  return eng;
}

const TODAY = 20;
const stateAt = (eng) => ({ clock: { minute: TODAY * minutesPerDay(eng), seq: 0 } });
const trade = (day, qty, total, currency = 'res_test_coin_a', resource = 'res_test_ingot') => ({ day, resource, qty, total, currency });
const denies = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('规则 4 成交够条数：窗口 [11, 20] 内 4 + 6 件、总价 40 + 90，惯常成交量 = 10 ÷ 10 = 1，惯常价 = 130 ÷ 10 = 13；窗外与别的货不计', () => {
  const eng = engine();
  const trades = [trade(11, 4, 40), trade(15, 6, 90), trade(10, 100, 1), trade(21, 100, 1), trade(12, 100, 1, 'res_test_coin_a', 'res_test_other')];
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', trades);
  assert.deepEqual({ known: h.known, basis: h.basis, trades: h.trades, qtyPerDay: h.qtyPerDay, price: h.price, priceUnit: h.priceUnit, gaps: h.gaps }, { known: true, basis: 'trades', trades: 2, qtyPerDay: 1, price: 13, priceUnit: 'res_test_coin_a', gaps: [] });
});

test('窗口边界：今日（20）与窗口首日（11）的成交计入，首日前一天（10）不计', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(20, 1, 5), trade(11, 1, 5), trade(10, 1, 5)]);
  assert.equal(h.trades, 2);
  assert.equal(h.qtyPerDay, 0.2);
});

test('成交不足（1 条 < 2）：惯常成交量取零，惯常价取这件货自己的估值角色价（铁锭 60，不含稀缺项）', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(15, 1, 999)], { puseCode: 'puse_test_worth' });
  assert.deepEqual({ known: h.known, basis: h.basis, trades: h.trades, qtyPerDay: h.qtyPerDay, price: h.price, priceUnit: h.priceUnit }, { known: true, basis: 'valuation', trades: 1, qtyPerDay: 0, price: 60, priceUnit: 'copper' });
});

test('没有任何成交：同样取估值价、成交量取零；窗口外的成交不算条数', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(1, 5, 5), trade(2, 5, 5)], { puseCode: 'puse_test_worth' });
  assert.equal(h.basis, 'valuation');
  assert.equal(h.price, 60);
  assert.equal(h.qtyPerDay, 0);
});

test('成交不足又没给用途代号：未知并报缺口 habitual.puseCode，不回退到成交记录里的单价、不当零', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(15, 1, 999)]);
  assert.deepEqual({ known: h.known, price: h.price, qtyPerDay: h.qtyPerDay, gaps: h.gaps }, { known: false, price: null, qtyPerDay: null, gaps: ['habitual.puseCode'] });
});

test('估值用途行含稀缺项被拒（规则 4 取的是不含稀缺项的估值角色价）；不是 puse 行同样被拒', () => {
  const eng = engine();
  denies(() => habitualOf(eng, stateAt(eng), 'res_test_ingot', [], { puseCode: 'puse_test_scarce' }), 'E-DIM-REF-MISSING');
  denies(() => habitualOf(eng, stateAt(eng), 'res_test_ingot', [], { puseCode: 'res_test_ingot' }), 'E-DIM-REF-MISSING');
});

test('成交不足而这个资源种类没有对应物品：未知并报缺口 habitual.resourceItem', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_nothing', [], { puseCode: 'puse_test_worth' });
  assert.deepEqual({ known: h.known, gaps: h.gaps }, { known: false, gaps: ['habitual.resourceItem'] });
});

test('估值本身未知（物品没有材料价可估）：把估值的缺口原样带出，不当零', () => {
  const eng = engine();
  eng.rules.valuation = { ...eng.rules.valuation };
  delete eng.rules.valuation.unitValue;
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [], { puseCode: 'puse_test_worth' });
  assert.equal(h.known, false);
  assert.equal(h.price, null);
  assert.ok(h.gaps.length > 0);
});

test('多种计价资源（卷六 §4.14 规则 2）：取成交额加权的众数币，只用该币的记录求均价；量不分币相加', () => {
  const eng = engine();
  // A：5 件 100；B：10 件 300 → B 的总价大，惯常价 = 300 ÷ 10 = 30；量 15 ÷ 10 = 1.5
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(12, 5, 100, 'res_test_coin_a'), trade(13, 10, 300, 'res_test_coin_b')]);
  assert.deepEqual({ price: h.price, priceUnit: h.priceUnit, qtyPerDay: h.qtyPerDay }, { price: 30, priceUnit: 'res_test_coin_b', qtyPerDay: 1.5 });
});

test('多种计价资源平局：成交额相同取代号字典序最小的币', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(12, 5, 100, 'res_test_coin_b'), trade(13, 4, 100, 'res_test_coin_a')]);
  assert.deepEqual({ price: h.price, priceUnit: h.priceUnit }, { price: 25, priceUnit: 'res_test_coin_a' });
});

test('规则表缺 expectWindowDays 或 minTradesForHabit：未知并报 rules.demand.<键>，不取缺省值', () => {
  const none = engine(null);
  assert.deepEqual(habitualOf(none, stateAt(none), 'res_test_ingot', []).gaps, ['rules.demand.expectWindowDays', 'rules.demand.minTradesForHabit']);
  const noWindow = engine({ expectWindowDays: undefined });
  assert.deepEqual(habitualOf(noWindow, stateAt(noWindow), 'res_test_ingot', []).gaps, ['rules.demand.expectWindowDays']);
});

test('规则表值是 0 或非整数（它们是除数与条数下界）按缺失处理，不做除法', () => {
  const zero = engine({ expectWindowDays: 0 });
  assert.equal(habitualOf(zero, stateAt(zero), 'res_test_ingot', []).known, false);
  const half = engine({ minTradesForHabit: 1.5 });
  assert.equal(habitualOf(half, stateAt(half), 'res_test_ingot', []).known, false);
});

test('入参与记录形状：缺资源代号、记录不是列表、记录缺字段、量为 0 或负、总价为负都拒', () => {
  const eng = engine();
  const s = stateAt(eng);
  for (const r of [undefined, null, '']) denies(() => habitualOf(eng, s, r, []), 'E-DIM-REQUIRED-MISSING');
  for (const t of [undefined, null, {}]) denies(() => habitualOf(eng, s, 'res_test_ingot', t), 'E-DIM-STRUCT-FIELD');
  denies(() => habitualOf(eng, s, 'res_test_ingot', [{ ...trade(12, 1, 1), day: undefined }]), 'E-DIM-STRUCT-FIELD');
  denies(() => habitualOf(eng, s, 'res_test_ingot', [{ ...trade(12, 1, 1), currency: '' }]), 'E-DIM-STRUCT-FIELD');
  denies(() => habitualOf(eng, s, 'res_test_ingot', [trade(12, 0, 1)]), 'E-DIM-DOMAIN-RANGE');
  denies(() => habitualOf(eng, s, 'res_test_ingot', [trade(12, -3, 1)]), 'E-DIM-DOMAIN-RANGE');
  denies(() => habitualOf(eng, s, 'res_test_ingot', [trade(12, 1, -1)]), 'E-DIM-DOMAIN-RANGE');
  denies(() => habitualOf(eng, s, 'res_test_ingot', [trade(12, 1.5, 1)]), 'E-DIM-DOMAIN-RANGE');
});

test('总价为 0 的成交（受赠式）照常计入：惯常价 0，不是未知', () => {
  const eng = engine();
  const h = habitualOf(eng, stateAt(eng), 'res_test_ingot', [trade(12, 2, 0), trade(13, 2, 0)]);
  assert.deepEqual({ known: h.known, price: h.price, qtyPerDay: h.qtyPerDay }, { known: true, price: 0, qtyPerDay: 0.4 });
});

test('同一输入重复求值逐位相同，也不改传入的记录与状态', () => {
  const eng = engine();
  const trades = [trade(12, 3, 30), trade(14, 7, 70)];
  const s = stateAt(eng);
  const before = JSON.stringify([trades, s]);
  const a = habitualOf(eng, s, 'res_test_ingot', trades);
  const b = habitualOf(eng, s, 'res_test_ingot', trades);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify([trades, s]), before);
});

test('扩展性：加一件物品与对应资源种类、不改 .mjs，同样有惯常价', () => {
  const eng = engine();
  eng.vocab.index.set('res_test_other', { family: 'resource', prefix: 'res_', entry: { item: 'item_test_ingot' } });
  const h = habitualOf(eng, stateAt(eng), 'res_test_other', [trade(12, 1, 8, 'res_test_coin_a', 'res_test_other'), trade(13, 1, 12, 'res_test_coin_a', 'res_test_other')]);
  assert.equal(h.price, 10);
});

// ---------- demand 入口（卷六 §4.4.2 :488）：输入缺位按未知加缺口（体检丙3 B 档、丙7），perDay 为 null 不是 0 ----------

const placeIds = (eng) => [...eng.tables.get('place').flat.rows.keys()].slice(0, 2);
const PART_GAPS = {
  use: ['demand.use.heatingEnergy', 'demand.use.household', 'demand.use.memberDailyNeed', 'demand.use.usagePerCount'],
  derived: ['demand.derived.jobs'],
  replace: ['demand.replace.holders', 'demand.replace.wearTerm'],
  stockup: ['demand.stockup.use', 'rules.demand.coverDaysByTier'],
};

test('demand：四分项各自未知并带各自缺口代号，perDay 为 null（不是 0），gaps 是并集', () => {
  const eng = engine();
  const d = demand(eng, stateAt(eng), placeIds(eng)[0], 'item_test_ingot', 7);
  assert.equal(d.known, false);
  assert.equal(d.perDay, null);
  for (const k of ['use', 'derived', 'replace', 'stockup']) assert.deepEqual({ known: d.parts[k].known, value: d.parts[k].value, gaps: d.parts[k].gaps }, { known: false, value: null, gaps: PART_GAPS[k] });
  assert.deepEqual(d.gaps, ['demand.derived.jobs', 'demand.replace.holders', 'demand.replace.wearTerm', 'demand.stockup.use', 'demand.use.heatingEnergy', 'demand.use.household', 'demand.use.memberDailyNeed', 'demand.use.usagePerCount', 'rules.demand.coverDaysByTier']);
});

test('demand：地点集合与单个地点同样接受；时域 1 天也行', () => {
  const eng = engine();
  const ids = placeIds(eng);
  assert.equal(demand(eng, stateAt(eng), ids, 'item_test_ingot', 1).perDay, null);
});

test('demand：入参特殊值全拒（范围缺/空列表/非地点，货不是物品也不是池，时域为 0、负、小数、缺）', () => {
  const eng = engine();
  const s = stateAt(eng);
  const p = placeIds(eng)[0];
  for (const sc of [undefined, null, [], '']) assert.throws(() => demand(eng, s, sc, 'item_test_ingot', 7), (e) => ['E-DIM-REQUIRED-MISSING', 'E-DIM-REF-MISSING'].includes(e.code));
  denies(() => demand(eng, s, ['item_test_ingot'], 'item_test_ingot', 7), 'E-DIM-REF-MISSING');
  denies(() => demand(eng, s, p, p, 7), 'E-DIM-REF-MISSING');
  assert.throws(() => demand(eng, s, p, undefined, 7), (e) => e.code === 'E-DIM-REF-MISSING');
  for (const h of [0, -1, 1.5, undefined, null]) denies(() => demand(eng, s, p, 'item_test_ingot', h), 'E-DIM-DOMAIN-RANGE');
});

test('demand：纯读，重复求值逐位相同、不改状态', () => {
  const eng = engine();
  const s = stateAt(eng);
  const before = JSON.stringify(s);
  const p = placeIds(eng)[0];
  assert.deepEqual(demand(eng, s, p, 'item_test_ingot', 3), demand(eng, s, p, 'item_test_ingot', 3));
  assert.equal(JSON.stringify(s), before);
});
