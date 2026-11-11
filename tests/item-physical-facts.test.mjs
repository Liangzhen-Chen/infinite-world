// SKELFACT：物品骨架派生事实 physical。全部内嵌夹具，不读真实数据，不调模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {itemPhysicalFacts, sizeClassOf, volumeLiters, processSteps, formFacts, attachPhysical, PROCESS_VERBS} from '../tools/item-physical-facts.mjs';
import {TRACES} from '../tools/w3-item-check.mjs';

const props = {precedence: ['metal', 'wood'], classes: {wood: {densityKgPerL: 0.6, appearance: ['顺纹', '木色由浅黄到褐']}, metal: {densityKgPerL: 7.8}}};
const wood = weight => ({id: 'x_a', name: '甲', weight, tags: ['wood']});

test('volumeL = weight ÷ 密度，两位有效数字；缺密度不写 volumeL 与 sizeClass', () => {
  assert.equal(itemPhysicalFacts(wood(0.27), {materialProps: props}).volumeL, 0.45);
  assert.equal(itemPhysicalFacts({id: 'x_b', weight: 0.6, tags: ['metal']}, {materialProps: props}).volumeL, 0.077);
  assert.equal(volumeLiters(1, 3), 0.33);
  const noDensity = itemPhysicalFacts({id: 'x_c', weight: 0.5, tags: ['wood']}, {materialProps: {precedence: ['wood'], classes: {wood: {appearance: ['顺纹']}}}});
  assert.equal('volumeL' in noDensity, false);
  assert.equal('sizeClass' in noDensity, false);
  assert.deepEqual(noDensity.appearance, ['顺纹']);
  assert.equal(itemPhysicalFacts({id: 'x_d', weight: 0.5, tags: ['wood']}, {}), undefined, '没有任何可核实事实时不返回对象');
  assert.equal(volumeLiters(0, 0.6), undefined);
  assert.equal(volumeLiters(1, 0), undefined);
});

test('appearance 取自材料类别，类别没有该项就不写；物品自己的 props 覆盖', () => {
  assert.deepEqual(itemPhysicalFacts(wood(0.3), {materialProps: props}).appearance, ['顺纹', '木色由浅黄到褐']);
  assert.equal('appearance' in itemPhysicalFacts({id: 'x_b', weight: 0.6, tags: ['metal']}, {materialProps: props}), false);
  assert.equal(itemPhysicalFacts({...wood(0.3), props: {densityKgPerL: 0.3}}, {materialProps: props}).volumeL, 1);
});

test('sizeClass 只按体积分档：界值归入上一档的下一档，最后一档无上界', () => {
  const at = v => sizeClassOf(v);
  assert.equal(at(0.03), '微件'); assert.equal(at(0.05), '小件'); assert.equal(at(0.45), '小件');
  assert.equal(at(0.5), '中件'); assert.equal(at(4.9), '中件'); assert.equal(at(5), '大件');
  assert.equal(at(33), '大件'); assert.equal(at(50), '特大件'); assert.equal(at(500), '特大件');
  assert.equal(at(NaN), undefined); assert.equal(at(-1), undefined);
  // 同体积不同材质、不同物品同档：规则不看物品
  const p = itemPhysicalFacts({id: 'x_p', weight: 0.6, tags: ['wood']}, {materialProps: props}), q = itemPhysicalFacts({id: 'x_q', weight: 7.8, tags: ['metal']}, {materialProps: props});
  assert.equal(p.volumeL, 1); assert.equal(q.volumeL, 1); assert.equal(p.sizeClass, '中件'); assert.equal(q.sizeClass, '中件');
});

test('processSteps：闭合动词词表（= TRACES 词干），按出现顺序记录原文片段；名词里的同字不算', () => {
  assert.deepEqual(PROCESS_VERBS, TRACES.map(([stem]) => stem));
  assert.deepEqual(processSteps('从直纹小料顺纹削出浅匙腹，余料留作一份干刨屑。'), [{verb: '削', text: '从直纹小料顺纹削出浅匙腹'}]);
  assert.deepEqual(processSteps('压出带平钮的圆盖，干透烧成后试盖。').map(s => s.verb), ['压', '烧']);
  assert.deepEqual(processSteps('锻出短杆，再磨光。').map(s => s.verb), ['锻', '磨']);
  assert.deepEqual(processSteps('给皮革预穿缝孔，不能当凿石工具。'), [], '缝孔、凿石是名词或用途，不是工序');
  assert.deepEqual(processSteps('不削出刃口。'), [], '否定的工序不记');
  assert.deepEqual(processSteps(undefined), []);
});

test('formFacts：成品形制短语按原文记录，留作……（副产品去向）不算', () => {
  assert.deepEqual(formFacts('拉出锥身，一端卷成握环，针尖留短。'), ['拉出锥身', '卷成握环', '留短']);
  assert.deepEqual(formFacts('从直纹小料顺纹削出浅匙腹，余料留作一份干刨屑。'), ['削出浅匙腹']);
  assert.deepEqual(formFacts('拉成圆形，边口磨平。'), ['拉成圆形']);
  assert.deepEqual(formFacts('只是把东西放在锅里煮熟。'), []);
});

test('attachPhysical：以物品为产出的配方提供工序与形制；没有事实的物品不加字段', () => {
  const bones = {items: [{id: 'item_a', weight: 0.27, tags: ['wood']}, {id: 'item_b', weight: 1, tags: []}], recipes: [{id: 'recipe_a', output: {item: 'item_a'}, processFacts: '削出浅匙腹。'}]};
  attachPhysical(bones, {materialProps: props, recipes: []});
  assert.equal(bones.items[1].physical, undefined);
  assert.deepEqual(bones.items[0].physical.formFacts, ['削出浅匙腹']);
  assert.equal(bones.items[0].physical.processSteps[0].verb, '削');
});

test('规则层不含物品 id', async () => {
  const source = await fs.readFile(new URL('../tools/item-physical-facts.mjs', import.meta.url), 'utf8');
  assert.equal(/\bitem_[a-z]/u.test(source), false);
  assert.equal(/\bitem_[a-z]/u.test(await fs.readFile(new URL('../world/meta/item-size-classes.json', import.meta.url), 'utf8')), false);
});
