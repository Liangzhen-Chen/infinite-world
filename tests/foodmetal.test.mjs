// FOODMETAL：食物外观（physical.classes 里只写 appearance，不写密度）与金属细分（physicalMetal，另起数据块）及材料归类函数 metalClass。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {metalClass, metalProps, validatePhysical, validatePhysicalMetal, materialProps, deriveFromSources, itemAppearanceErrors, validateMaterialProps} from '../server-plugin/item-class.mjs';

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
  assert.deepEqual(steel.appearance, {known: false}, '钢页没有颜色或光泽原句，外观按未知');
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
    if (k === 'steel' || k === 'tin') assert.equal(row.appearance, undefined, `${k} 不写外观（缺项为未知）`);
    else assert.ok(row.appearance.length >= 3 && row.appearance.length <= 6, `${k} 外观条数`);
  }
  const bad = f => { const x = structuredClone(pm); f(x); return validatePhysicalMetal(x, phys); };
  assert.ok(bad(x => { x.classes.iron = structuredClone(x.classes.steel); x.precedence.push('iron'); }).some(m => /重复/.test(m)));
  assert.ok(bad(x => { x.nameWords.zinc = ['锌']; }).some(m => /nameWords 的类别不存在/.test(m)));
  assert.ok(bad(x => { x.forms = ['条片']; }).some(m => /forms/.test(m)));
  assert.ok(bad(x => { x.excludeTags = []; }).some(m => /excludeTags/.test(m)));
  assert.ok(bad(x => { delete x.classes.tin.sources[0].citation; }).some(m => /缺 citation/.test(m)));
  assert.ok(bad(x => { x.classes.brass.appearance.length = 2; }).some(m => /3–6/.test(m)));
});

test('食物外观：只给有可靠共同外观的类别写 appearance，不写密度、不写成品菜；每条带页面与原句', () => {
  const foods = ['salt', 'cheese', 'spice_seed'];
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
  for (const k of ['cream', 'vinegar', 'fresh_herb', 'vegetable', 'fruit', 'grain', 'legume', 'meat', 'fish', 'egg', 'milk', 'edible_fat', 'sweetener', 'condiment_sauce', 'mushroom', 'nut'])assert.equal(phys.classes[k], undefined, `${k} 缺项为未知`);
  const e = {world: {items: [{id: 'i', tags: ['salt']}], recipes: [], materialProps: structuredClone(table)}, byId: new Map([['i', {id: 'i', tags: ['salt']}]])};
  assert.deepEqual(materialProps(e, 'i').densityKgPerL, {known: false});
  assert.equal(materialProps(e, 'i').appearance.known, true);
});

test('材料归类：放开修饰字与连写形态字（闭合词表），真实名称归得出；排除规则不变', () => {
  assert.deepEqual(pm.modifiers, ['窄', '细', '薄', '熟', '退火']);
  assert.deepEqual(pm.tailForms, ['束', '卷', '叠']);
  assert.equal(metalClass(it('黄铜窄带', ['material']), pm), 'brass');
  assert.equal(metalClass(it('细银丝束', ['material']), pm), 'silver');
  assert.equal(metalClass(it('退火铁线卷', ['material']), pm), 'iron');
  assert.equal(metalClass(it('锡片叠'), pm), 'tin', '形态字连写：片叠');
  assert.equal(metalClass(it('薄铜片'), pm), 'copper');
  assert.equal(metalClass(it('熟铁条'), pm), 'iron');
  // 仍排除
  for (const [n, tags] of [['金银花', []], ['钢刃热修书', ['book']], ['铁锭模', ['tool']], ['双槽铁锭模', []], ['铁线网片', ['craft']], ['交绕铁线网片', []], ['泊绳银片', ['coin']]])assert.equal(metalClass(it(n, tags), pm), undefined, n);
  // 修饰字只认闭合词表；形态字之后只认形态字或连写尾字
  assert.equal(metalClass(it('黄铜奇带'), pm), undefined, '修饰字不在词表');
  assert.equal(metalClass(it('钢条夹'), pm), undefined, '尾字不在词表');
  assert.equal(metalClass(it('钢束'), pm), undefined, '连写尾字之前必须先有形态字');
  const custom = {nameWords: {x: ['甲']}, forms: ['乙'], modifiers: ['丙'], tailForms: ['丁'], excludeTags: []};
  assert.equal(metalClass(it('甲丙丙乙丁'), custom), 'x');
  assert.equal(metalClass(it('甲戊乙'), custom), undefined);
  assert.ok(validatePhysicalMetal({...structuredClone(pm), modifiers: ['']}, phys).some(m => /modifiers/.test(m)));
  assert.ok(validatePhysicalMetal({...structuredClone(pm), tailForms: [1]}, phys).some(m => /tailForms/.test(m)));
});

const overlay = JSON.parse(fs.readFileSync(new URL('../world/meta/mechanics/items.json', import.meta.url), 'utf8'));
const withAppearance = Object.entries(overlay).filter(([, p]) => p.props?.appearance);

test('物品自己的外观（无配方单件食材，写在 mechanics/items.json 的 props 行）：每条带页面与原句；materialProps 读到且来源为 item', () => {
  assert.equal(withAppearance.length, 18);
  for (const [id, p] of withAppearance) {
    assert.ok(p.props.basis.trim(), `${id} 带 basis`);
    assert.deepEqual(itemAppearanceErrors(p.props.appearance, `items.${id}.props`), [], id);
    assert.ok(!p.props.appearance.some(a => /density|密度/.test(a.term)), `${id} 不写密度`);
  }
  const mk = id => { const o = overlay[id], item = {id, tags: o.tags ?? [], props: o.props}; return {world: {items: [item], recipes: [], materialProps: structuredClone(table)}, byId: new Map([[id, item]])}; };
  const got = materialProps(mk('item_lentil'), 'item_lentil').appearance;
  assert.equal(got.source, 'item');
  assert.deepEqual(got.value, overlay.item_lentil.props.appearance.map(a => a.term));
});

test('物品外观的 L1：条数、词组、citation、字段都被检查；已有 props 行的 basis 原样保留', () => {
  const bad = f => { const props = structuredClone(overlay.item_lentil.props); f(props); const item = {id: 'item_x', tags: ['x'], props}; return validateMaterialProps({items: [item], recipes: [], materialProps: {dimensions: structuredClone(table.dimensions), kcalPerSatiety: table.kcalPerSatiety, kcalPerSatietyBasis: table.kcalPerSatietyBasis, precedence: [], classes: {}}}); };
  assert.deepEqual(bad(() => {}), []);
  assert.ok(bad(p => { p.appearance = p.appearance.slice(0, 1); }).some(m => /2–6/.test(m)));
  assert.ok(bad(p => { p.appearance[1].term = p.appearance[0].term; }).some(m => /重复/.test(m)));
  assert.ok(bad(p => { p.appearance[0].citation = '凭记忆'; }).some(m => /页面与原句/.test(m)));
  assert.ok(bad(p => { delete p.appearance[0].citation; }).some(m => /term 与 citation/.test(m)));
  assert.ok(bad(p => { p.appearance[0].extra = 1; }).some(m => /字段未登记/.test(m)));
  assert.ok(bad(p => { delete p.basis; }).some(m => /缺 basis/.test(m)));
  for (const [id, p] of Object.entries(overlay))if (p.props?.sources) assert.ok(p.props.basis.trim(), `${id} 原 basis 保留`);
});

test('没有可引原句的食材不写（按未知）；类别内外观一致的仍按类别写', () => {
  for (const id of ['item_wheat_grain', 'item_broad_bean', 'item_pear', 'item_cucumber', 'item_mutton', 'item_pork_fat', 'item_dry_mushroom', 'item_pearl_barley', 'item_rye_flour', 'item_rapeseed_oil'])assert.equal(overlay[id]?.props?.appearance, undefined, `${id} 缺项为未知`);
  assert.ok(overlay.item_dill.props.appearance.length >= 3, '莳萝自己的外观写在单件上');
  assert.ok(!overlay.item_dill.props.appearance.some(a => /米|高/.test(a.term)), '不写植株高度');
  for (const id of ['item_cream', 'item_hard_cheese', 'item_mustard_seed', 'item_poppy_seed', 'item_caraway_seed'])assert.equal(overlay[id]?.props?.appearance, undefined, `${id} 由类别外观提供，不另写`);
  for (const id of ['item_water', 'item_bread', 'item_ration', 'item_wild_food'])assert.equal(overlay[id]?.props?.appearance, undefined, `${id} 不写外观`);
});
