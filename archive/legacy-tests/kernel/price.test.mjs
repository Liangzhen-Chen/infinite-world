// 块 6 第 6-9 张《估值与 priceFor》之 priceFor 半：卷六《经济》§4.21 价格四角色（规则 1 先问用途、规则 2 路由表是数据、规则 5 估不出就如实返回、规则 8 纯函数、规则 9 估值是唯一定价来源，
// 不回退旧价也不回退零）与 §2.2 用途行字段的加载期校验。期望值按卷三乙公式手算（同 valuation.test.mjs：unitValue 10、scarcityCurve [[0,3],[1,1]]、scarcityHorizonDays 30），
// 用途行在临时世界的词表里加（真实 world 的 puse 族登记了族与字段口径，具体用途行由登记它的卷、卡加，卷六 §4.21.3 规则 3）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseFixture, loadItemWorld, itemRow, share, ROOT } from './item-world.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { fixedUnits, fixedMultiply } from '../../server-plugin/kernel/det-math.mjs';
import { priceFor } from '../../server-plugin/price.mjs';

const IRON = 'mat_test_iron'; // valueMult 3
const body = (m, s) => share('mgroup_body', m, s);
const row = (extra = {}) => ({ role: 'prole_worth', frame: 'pframe_market', liquidationCurveKey: null, includesScarcity: false, basisRule: 'pbasis_market', subjectCtx: null, ...extra });
const rec = (inputs, outputs, extra = {}) => ({ basis: '测试', inputs, outputs, yield: 1, wasteFraction: 0, minutes: 0, skillMin: 0, ...extra });

function build(edit) {
  const f = baseFixture();
  // ingot 2 kg 铁：2 × 3 × 10 = 60；nail 有配方：（60 + 50 × 0.2）× 1.1 ÷ 10 = 7.7
  f.items = { item_test_ingot: itemRow(2, [body(IRON, 1)]), item_test_nail: itemRow(0.1, [body(IRON, 1)]) };
  f.recipes = { recipe_test_nail: rec({ groups: [[{ items: ['item_test_ingot'], qty: 1, per: 'piece', consumed: true }]] }, [{ item: 'item_test_nail', qty: 10 }], { minutes: 50 }) };
  f.editVocab = (doc) => {
    Object.assign(doc.families.puse.entries, {
      puse_test_worth: row(),
      puse_test_scarce: row({ includesScarcity: true, basisRule: 'pbasis_material' }),
      puse_test_pawn: row({ liquidationCurveKey: 'liq_test' }),
      puse_test_trade: row({ role: 'prole_trade' }),
    });
  };
  if (edit) edit(f);
  return loadItemWorld(f);
}

function engine(edit) {
  const r = build(edit);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const W = r.world;
  installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
  return { vocab: W.vocab, rules: structuredClone(W.rules), units: W.env.units, tables: W.tables };
}

const state = () => ({ clock: { minute: 0, seq: 0 } });
const fold = (explain) => explain.slice(1).reduce((acc, e) => fixedMultiply(acc, fixedUnits(e.factor)), fixedUnits(explain[0].factor));
const denies = (fn, code) => assert.throws(fn, (e) => e.code === code);

test('规则 1 先问用途再给价：没有用途代号（缺、null、空串）拒 E-DIM-REQUIRED-MISSING，不给缺省价', () => {
  const eng = engine();
  for (const code of [undefined, null, '']) denies(() => priceFor(eng, state(), code, 'item_test_ingot', {}), 'E-DIM-REQUIRED-MISSING');
});

test('规则 1 用途代号必须是 puse 族条目：不存在的代号、别的族的代号、物品 id 都拒 E-DIM-REF-MISSING', () => {
  const eng = engine();
  for (const code of ['puse_nope', 'item_test_ingot', 'prole_worth', 42]) denies(() => priceFor(eng, state(), code, 'item_test_ingot', {}), 'E-DIM-REF-MISSING');
});

test('规则 2、9 估值角色：价 = 卷三乙 valuation 的内在值（铁锭 2 × 3 × 10 = 60），不含供需；返回 role、单位、basisRule；explain 复算等于结果', () => {
  const eng = engine();
  const p = priceFor(eng, state(), 'puse_test_worth', 'item_test_ingot', { supply: 30, demandPerDay: 2 });
  assert.deepEqual([p.known, p.value, p.unit, p.role, p.basis, p.partial], [true, 60, 'copper', 'prole_worth', 'pbasis_market', true]);
  assert.equal(fold(p.explain), fixedUnits(p.value));
  // 供需不改内在值：供 0 与供 1e6 同价（includesScarcity 为假的用途行不乘稀缺项）。
  for (const supply of [0, 1000000]) assert.equal(priceFor(eng, state(), 'puse_test_worth', 'item_test_ingot', { supply, demandPerDay: 2 }).value, 60);
});

test('规则 2 includesScarcity 为真才乘稀缺项（供需只计一次）：供 30、日需求 2 → 覆盖比 0.5、因子 2 → 120；供 0 → 因子 3 → 180；供 100 → 比 1.6666 端点外因子 1 → 60；explain 复算', () => {
  const eng = engine();
  const at = (supply) => priceFor(eng, state(), 'puse_test_scarce', 'item_test_ingot', { supply, demandPerDay: 2 });
  assert.equal(at(30).value, 120);
  assert.deepEqual(at(30).explain.map((e) => [e.term, e.factor]), [['valueBase', 60], ['scarcity', 2]]);
  assert.equal(fold(at(30).explain), fixedUnits(120));
  assert.equal(at(0).value, 180);
  assert.equal(at(100).value, 60);
});

test('规则 2、卷三乙 V-3 稀缺项未知（供给或日需求没传）：按“不乘”并记缺口，价仍是内在值 60，不当零、不取端点', () => {
  const eng = engine();
  const p = priceFor(eng, state(), 'puse_test_scarce', 'item_test_ingot', {});
  assert.deepEqual([p.known, p.value, p.partial, p.gaps], [true, 60, true, ['ctx.demandPerDay', 'ctx.supply', 'item.beauty']]);
});

test('规则 5、9 估不出就如实返回：配方价依赖的工价规则表没给值，价未知带缺口 rules.crafting.laborRate；没有 value 字段，不是 0，不回退到旧价或材料价', () => {
  const eng = engine((f) => { f.editRules = { crafting: (rows) => { rows.splice(rows.findIndex((r) => r.key === 'laborRate'), 1); const u = rows.find((r) => r.key === 'unbuilt'); u.value = [...u.value, 'laborRate'].sort(); } }; });
  const p = priceFor(eng, state(), 'puse_test_worth', 'item_test_nail', { supply: 30, demandPerDay: 2 });
  assert.deepEqual([p.known, p.role, p.gaps], [false, 'prole_worth', ['rules.crafting.laborRate']]);
  assert.equal(Object.hasOwn(p, 'value'), false);
  assert.deepEqual(p.explain, []);
  // 别的用途行同样未知，没有任何用途得到零（卷六 A6-21.3 末句）。
  assert.equal(priceFor(eng, state(), 'puse_test_scarce', 'item_test_nail', { supply: 30, demandPerDay: 2 }).known, false);
  // 不受影响的物品照常有价。
  assert.equal(priceFor(eng, state(), 'puse_test_worth', 'item_test_ingot', {}).value, 60);
});

test('规则 2 其余角色的路由未建（成交 6-12、已签条款、源汇限额表）：返回未知带缺口 price_route_unbuilt:<角色>，不编数', () => {
  const eng = engine();
  const p = priceFor(eng, state(), 'puse_test_trade', 'item_test_ingot', { supply: 30, demandPerDay: 2 });
  assert.deepEqual([p.known, p.gaps, p.role], [false, ['price_route_unbuilt:prole_trade'], 'prole_trade']);
});

test('规则 2 急售折价（用途行 liquidationCurveKey 非空）要读 market.liquidationCurve 与当地日成交量（6-12 起，表未登记）：读不到按未知带缺口，不当“不折”', () => {
  const eng = engine();
  const p = priceFor(eng, state(), 'puse_test_pawn', 'item_test_ingot', { supply: 30, demandPerDay: 2 });
  assert.deepEqual([p.known, p.gaps], [false, ['rules.market.liquidationCurve']]);
});

test('规则 8 纯函数：同状态同参数两次逐位相同，状态原样不变', () => {
  const eng = engine();
  const s = state();
  const before = structuredClone(s);
  const a = priceFor(eng, s, 'puse_test_scarce', 'item_test_nail', { supply: 30, demandPerDay: 2 });
  const b = priceFor(eng, s, 'puse_test_scarce', 'item_test_nail', { supply: 30, demandPerDay: 2 });
  assert.deepEqual(a, b);
  assert.deepEqual(s, before);
});

test('A6-21.3 扩展性：新增一条用途行只改数据（不改 .mjs）即可被调用并得到按其口径的数值；新增一件物品只填材料成分，不填任何价格，各用途下都有值', () => {
  const eng = engine((f) => {
    f.items.item_test_new = itemRow(5, [body(IRON, 1)]); // 5 × 3 × 10 = 150
    const base = f.editVocab;
    f.editVocab = (doc) => { base(doc); doc.families.puse.entries.puse_test_extra = row({ includesScarcity: true, basisRule: 'pbasis_cost' }); };
  });
  assert.equal(priceFor(eng, state(), 'puse_test_extra', 'item_test_new', { supply: 30, demandPerDay: 2 }).value, 300); // 150 × 2
  for (const code of ['puse_test_worth', 'puse_test_scarce', 'puse_test_extra']) assert.equal(priceFor(eng, state(), code, 'item_test_new', { supply: 30, demandPerDay: 2 }).known, true);
});

test('卷六 §2.2 用途行加载期校验：role 不是 prole 族条目、frame 或 basisRule 不是对应族条目、includesScarcity 不是布尔、缺字段（不设缺省）都加载失败', () => {
  const bad = (code, edit, text) => {
    const r = build((f) => { const base = f.editVocab; f.editVocab = (doc) => { base(doc); edit(doc.families.puse.entries); }; });
    assert.equal(r.ok, false);
    assert.ok(r.messages.some((m) => m.startsWith(code) && m.includes(text)), JSON.stringify(r.messages));
  };
  bad('E-DIM-REF-MISSING', (e) => { e.puse_test_bad = row({ role: 'prole_nope' }); }, 'role');
  bad('E-DIM-REF-MISSING', (e) => { e.puse_test_bad = row({ frame: 'pframe_nope' }); }, 'frame');
  bad('E-DIM-REF-MISSING', (e) => { e.puse_test_bad = row({ basisRule: 'pbasis_nope' }); }, 'basisRule');
  bad('E-DIM-STRUCT-FIELD', (e) => { e.puse_test_bad = row({ includesScarcity: 'yes' }); }, 'includesScarcity');
  bad('E-DIM-REQUIRED-MISSING', (e) => { const x = row(); delete x.includesScarcity; e.puse_test_bad = x; }, 'includesScarcity');
});

test('真实 world：prole 族封闭四项、puse_frame 三项、puse_basis 四项；puse 族已登记但没有具体用途行（行由登记它的卷、卡加），所以真实 world 里任何用途代号都先被拒，不回退', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const fam = (n) => Object.keys(r.vocab.families.get(n).entries).sort();
  assert.deepEqual(fam('prole'), ['prole_gate', 'prole_term', 'prole_trade', 'prole_worth']);
  assert.deepEqual(fam('puse_frame'), ['pframe_holder', 'pframe_market', 'pframe_observer']);
  assert.deepEqual(fam('puse_basis'), ['pbasis_cost', 'pbasis_market', 'pbasis_material', 'pbasis_rent']);
  assert.equal(r.vocab.families.get('prole').closed, true);
  assert.deepEqual(fam('puse'), []);
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8')).families.puse.closed, false);
  denies(() => priceFor({ vocab: r.vocab, rules: r.rules, tables: r.tables }, state(), 'puse_wealth', 'item_bamboo_fishing_rod', {}), 'E-DIM-REF-MISSING');
});
