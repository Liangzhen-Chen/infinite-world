// FOODMETAL：食物外观（physical.classes 里只写 appearance，不写密度）与金属细分（physicalMetal，另起数据块）及材料归类函数 metalClass。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {metalClass, metalProps, validatePhysical, validatePhysicalMetal, materialProps, deriveFromSources} from '../server-plugin/item-class.mjs';

const table = JSON.parse(fs.readFileSync(new URL('../world/meta/mechanics/material-props.json', import.meta.url), 'utf8'));
const pm = table.physicalMetal, phys = table.physical;
const it = (name, tags = []) => ({id: `item_${name}`, name, tags});
const mean = xs => xs.reduce((n, x) => n + x, 0) / xs.length;
const round3 = x => Math.round(x * 1000) / 1000;

test('材料归类：正例——名称以「材料词 + 形态字」结尾，取最长材料词', () => {
  assert.equal(metalClass(it('钢条'), pm), 'steel');
  assert.equal(metalClass(it('黄铜带'), pm), 'brass', '黄铜带取黄铜，不取铜');
  assert.equal(metalClass(it('锡片'), pm), 'tin');
  assert.equal(metalClass(it('银丝'), pm), 'silver');
  assert.equal(metalClass(it('铁线'), pm), 'iron');
  assert.equal(metalClass(it('铜片'), pm), 'copper');
  assert.equal(metalClass(it('淬用钢条', ['material']), pm), 'steel');
  assert.equal(metalClass(it('压薄锡片', ['material', 'w3_journey']), pm), 'tin');
});

test('材料归类：反例——花草、书、工具、成品、货币、词形不在结尾，都归不出', () => {
  assert.equal(metalClass(it('金银花'), pm), undefined, '银后面不是形态字');
  assert.equal(metalClass(it('钢刃热修书', ['book']), pm), undefined);
  assert.equal(metalClass(it('钢刃热修与薄片工谱', ['book']), pm), undefined);
  assert.equal(metalClass(it('铁锭模', ['tool']), pm), undefined, '锭后面还有字，且是工具');
  assert.equal(metalClass(it('双槽铁锭模'), pm), undefined, '即使没标签，铁锭后有「模」，不在结尾');
  assert.equal(metalClass(it('铁线网片', ['craft']), pm), undefined);
  assert.equal(metalClass(it('交绕铁线网片'), pm), undefined, '材料词与形态字之间夹了「线网」，不算');
  assert.equal(metalClass(it('泊绳银片', ['coin', 'metal']), pm), undefined, '货币标签不参与');
  assert.equal(metalClass(it('长柄铁钳', ['tool']), pm), undefined);
  assert.equal(metalClass(it('钢条', ['tool']), pm), undefined, '带工具标签的不参与，即使名称合规');
  assert.equal(metalClass(it('铜条', ['craft']), pm), undefined, '成品标签不参与');
  assert.equal(metalClass(it('杂物'), pm), undefined);
  assert.equal(metalClass(null, pm), undefined);
  assert.equal(metalClass(it('钢条'), undefined), undefined);
});

test('材料归类：标签优先于名称；规则只看数据里的词表与形态字，不含物品 id', () => {
  assert.equal(metalClass(it('杂物', ['copper']), pm), 'copper');
  assert.equal(metalClass(it('钢条', ['brass']), pm), 'brass', '标签优先');
  const src = fs.readFileSync(new URL('../server-plugin/item-class.mjs', import.meta.url), 'utf8');
  const fn = /export function metalClass[\s\S]*?\n}\r?\n/.exec(src)[0];
  assert.ok(!/item_[a-z_]+/.test(fn), 'metalClass 不得写物品 id');
  assert.deepEqual(pm.forms, ['条', '带', '片', '丝', '线', '锭', '料', '坯', '块']);
  const custom = {nameWords: {x: ['甲']}, forms: ['乙'], excludeTags: []};
  assert.equal(metalClass(it('丙甲乙'), custom), 'x');
  assert.equal(metalClass(it('丙甲丁乙'), custom), undefined);
});

test('metalProps：按归类取密度与外观；归不出为未知；铁回落到 physical 的锻铁行', () => {
  const steel = metalProps(table, it('钢条'));
  assert.equal(steel.class, 'steel');
  assert.deepEqual(steel.densityKgPerL, {known: true, value: 7.85, source: 'steel'});
  assert.equal(steel.appearance.known, true);
  assert.equal(metalProps(table, it('铁线')).densityKgPerL.value, 7.75);
  const none = metalProps(table, it('金银花'));
  assert.deepEqual([none.class, none.densityKgPerL, none.appearance], [undefined, {known: false}, {known: false}]);
});

test('physicalMetal 不进 materialProps：金属物品经 materialProps 取不到新金属的密度，已批准 physical 的取值不变', () => {
  const items = [it('钢条', ['material']), it('黄铜带', ['material']), it('小铁钉', ['metal', 'iron'])];
  const e = {world: {items, recipes: [], materialProps: structuredClone(table)}, byId: new Map(items.map(i => [i.id, i]))};
  assert.deepEqual(materialProps(e, 'item_钢条').densityKgPerL, {known: false});
  assert.deepEqual(materialProps(e, 'item_黄铜带').densityKgPerL, {known: false});
  assert.equal(materialProps(e, 'item_小铁钉').densityKgPerL.value, 7.75, '铁来自 physical.iron，与 MATPHYS 一致');
});

test('已批准的 physical 数值不变（MATPHYS 八类）：密度与外观词组条数', () => {
  const d = k => deriveFromSources(phys.classes[k], table.kcalPerSatiety).densityKgPerL;
  assert.equal(d('timber'), 0.618);
  assert.equal(d('wood'), 0.618);
  for (const [k, v] of Object.entries({iron: 7.75, leather: 0.86, paper: 0.925, bone: 1.85, wax: 0.96}))assert.equal(d(k), v, k);
  assert.equal(d('ceramic'), 1.794);
  assert.deepEqual(phys.precedence.slice(0, 8), ['timber', 'wood', 'wax', 'leather', 'paper', 'bone', 'ceramic', 'iron'], '新加类别只追加在后，不改前八类顺序');
});

test('physicalMetal：L1 通过；五类密度出处原值与推算一致；每类外观 3–6 条带出处', () => {
  assert.deepEqual(validatePhysicalMetal(pm, phys), []);
  assert.deepEqual(Object.keys(pm.classes), ['steel', 'copper', 'brass', 'tin', 'silver']);
  assert.deepEqual(pm.precedence, Object.keys(pm.classes));
  const want = {steel: 7.85, copper: 8.94, brass: 8.565, tin: 7.28, silver: 10.49};
  for (const [k, row] of Object.entries(pm.classes)) {
    assert.equal(deriveFromSources(row, table.kcalPerSatiety).densityKgPerL, want[k], k);
    for (const s of row.sources) {
      if (s.range)assert.equal(round3(mean(s.range.densityKgPerL)), s.densityKgPerL, `${k} 区间中值`);
      else assert.ok(new RegExp(`${String(Math.round(s.densityKgPerL * 1000))} kg/m³`).test(s.citation), `${k} citation 里须有原值 kg/m³`);
    }
    assert.ok(row.appearance.length >= 3 && row.appearance.length <= 6, `${k} 外观条数`);
  }
  const bad = f => { const x = structuredClone(pm); f(x); return validatePhysicalMetal(x, phys); };
  assert.ok(bad(x => { x.classes.iron = structuredClone(x.classes.steel); x.precedence.push('iron'); }).some(m => /重复/.test(m)));
  assert.ok(bad(x => { x.nameWords.zinc = ['锌']; }).some(m => /nameWords 的类别不存在/.test(m)));
  assert.ok(bad(x => { x.forms = ['条片']; }).some(m => /forms/.test(m)));
  assert.ok(bad(x => { x.excludeTags = []; }).some(m => /excludeTags/.test(m)));
  assert.ok(bad(x => { delete x.classes.tin.sources[0].citation; }).some(m => /缺 citation/.test(m)));
  assert.ok(bad(x => { x.classes.steel.appearance.pop(); x.classes.steel.appearance.pop(); }).some(m => /3–6/.test(m)));
});

test('食物外观：只给有可靠共同外观的类别写 appearance，不写密度、不写成品菜；每条带页面与原句', () => {
  const foods = ['salt', 'vinegar', 'cream', 'cheese', 'fresh_herb', 'spice_seed'];
  const tags = new Set([...Object.keys(phys.classes), ...Object.keys(table.classes)]);
  assert.deepEqual(validatePhysical(phys, tags), []);
  for (const k of foods) {
    const row = phys.classes[k];
    assert.ok(row, `${k} 有外观`);
    assert.ok(table.classes[k], `${k} 是 material-props 现有类别键，不新造`);
    assert.equal(row.sources, undefined, `${k} 食物不写密度`);
    assert.ok(row.appearance.length >= 3 && row.appearance.length <= 6, `${k} 条数`);
    for (const a of row.appearance)assert.ok(/Wikipedia「/.test(a.citation) && a.citation.length > 20, `${k}.${a.term} 须带页面与原句`);
  }
  // 混合成员或没有可靠出处的类别不写（缺项即未知）
  for (const k of ['vegetable', 'fruit', 'grain', 'legume', 'meat', 'fish', 'egg', 'milk', 'edible_fat', 'sweetener', 'condiment_sauce', 'mushroom', 'nut'])assert.equal(phys.classes[k], undefined, `${k} 缺项为未知`);
  const e = {world: {items: [{id: 'i', tags: ['salt']}], recipes: [], materialProps: structuredClone(table)}, byId: new Map([['i', {id: 'i', tags: ['salt']}]])};
  assert.deepEqual(materialProps(e, 'i').densityKgPerL, {known: false});
  assert.equal(materialProps(e, 'i').appearance.known, true);
});
