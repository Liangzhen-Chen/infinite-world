// MATPHYS：材料类别的密度（densityKgPerL）与外观（appearance）。数据在表头 physical（与 classes 分开存放，已审条目指纹不变）。
// 期望值在测试里按公式算；密度不手写，由出处原值（sources）按 selection 推出；缺项为未知。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deriveFromSources, materialProps, validatePhysical, validateMaterialProps, PHYSICAL_DIMENSIONS} from '../server-plugin/item-class.mjs';

const table = JSON.parse(fs.readFileSync(new URL('../world/meta/mechanics/material-props.json', import.meta.url), 'utf8'));
const phys = table.physical;
const src = (name, d, extra = {}) => ({name, citation: `夹具：${name}`, densityKgPerL: d, ...extra});
const mean = xs => xs.reduce((n, x) => n + x, 0) / xs.length;
const round3 = x => Math.round(x * 1000) / 1000;
const app = n => Array.from({length: n}, (_, i) => ({term: `词${i}`, citation: `出处${i}`}));
const fixture = () => ({
  dimensions: {densityKgPerL: {unit: 'kg/L', min: 0.05, max: 25}}, precedence: ['tagB', 'tagA'],
  classes: {
    tagA: {sources: [src('甲', 0.5), src('乙', 0.7)], selection: {method: 'mean', reason: 'r'}, appearance: app(3), basis: 'b'},
    tagB: {sources: [src('丙', 1.85, {range: {densityKgPerL: [1.6, 2.1]}})], selection: {method: 'single', reason: 'r'}, appearance: app(4), basis: 'b'}
  }
});
const known = new Set(['tagA', 'tagB']);

test('推算：密度 single 取该出处；mean 逐项取平均并取 3 位小数；没有密度出处则无该维', () => {
  assert.equal(deriveFromSources({sources: [src('丙', 1.85)], selection: {method: 'single', reason: 'r'}}, 24).densityKgPerL, 1.85);
  const avg = deriveFromSources({sources: [src('甲', 0.77), src('乙', 0.71), src('丙', 0.67)], selection: {method: 'mean', reason: 'r'}}, 24);
  assert.equal(avg.densityKgPerL, round3(mean([0.77, 0.71, 0.67])));
  assert.equal(deriveFromSources({sources: [{name: 'x', citation: 'c', moistureFraction: 0.5}], selection: {method: 'single', reason: 'r'}}, 24).densityKgPerL, undefined);
  assert.equal(deriveFromSources({}, 24).densityKgPerL, undefined);
});

const engine = items => {
  const w = {items, recipes: [], materialProps: {kcalPerSatiety: 24, classes: {}, precedence: [], physical: fixture()}};
  return {world: w, byId: new Map(items.map(i => [i.id, i]))};
};

test('materialProps 取到密度与外观：按 physical.precedence 取第一个写了的类别；没有所属类别则为未知，不给默认值', () => {
  const e = engine([{id: 'a', tags: ['tagA']}, {id: 'ab', tags: ['tagA', 'tagB']}, {id: 'none', tags: ['other']}]);
  const a = materialProps(e, 'a');
  assert.deepEqual(a.densityKgPerL, {known: true, value: round3(mean([0.5, 0.7])), source: 'tagA'});
  assert.deepEqual(a.appearance, {known: true, value: ['词0', '词1', '词2'], source: 'tagA'});
  assert.equal(materialProps(e, 'ab').densityKgPerL.source, 'tagB', '更具体的类别（precedence 靠前）优先');
  assert.equal(materialProps(e, 'ab').densityKgPerL.value, 1.85);
  assert.deepEqual(materialProps(e, 'none').densityKgPerL, {known: false});
  assert.deepEqual(materialProps(e, 'none').appearance, {known: false});
  assert.deepEqual(materialProps({world: {items: [], recipes: []}, byId: new Map()}, 'missing').densityKgPerL, {known: false});
});

test('L1：合法夹具无错；缺出处字段、越界、区间外、重复词组、条数不对、手写密度、precedence 不全都报错', () => {
  assert.deepEqual(validatePhysical(fixture(), known), []);
  assert.deepEqual(validatePhysical(undefined, known), []);
  const bad = mutate => { const p = fixture(); mutate(p); return validatePhysical(p, known); };
  assert.ok(bad(p => { delete p.classes.tagA.sources[0].citation; }).some(x => /缺 citation/.test(x)));
  assert.ok(bad(p => { delete p.classes.tagA.sources[0].densityKgPerL; }).some(x => /缺密度或越界/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.sources[0].densityKgPerL = 99; }).some(x => /越界/.test(x)));
  assert.ok(bad(p => { p.classes.tagB.sources[0].densityKgPerL = 2.5; }).some(x => /公认区间/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.sources[1].name = '甲'; }).some(x => /重名/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.selection.method = 'single'; }).some(x => /single 只能有 1 个出处/.test(x)));
  assert.ok(bad(p => { p.classes.tagB.selection.method = 'mean'; }).some(x => /mean 至少 2 个出处/.test(x)));
  assert.ok(bad(p => { p.classes.tagB.selection.method = 'representative'; }).some(x => /selection/.test(x)));
  assert.ok(bad(p => { delete p.classes.tagA.selection; }).some(x => /selection/.test(x)));
  assert.ok(bad(p => { delete p.classes.tagA.basis; }).some(x => /缺 basis/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.densityKgPerL = 0.6; }).some(x => /不手写/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.appearance = app(2); }).some(x => /3–6/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.appearance = app(7); }).some(x => /3–6/.test(x)));
  assert.ok(bad(p => { p.classes.tagA.appearance[1].term = '词0'; }).some(x => /重复/.test(x)));
  assert.ok(bad(p => { delete p.classes.tagA.appearance[0].citation; }).some(x => /term 与 citation/.test(x)));
  assert.ok(bad(p => { p.precedence = ['tagA']; }).some(x => /precedence/.test(x)));
  assert.ok(bad(p => { p.classes.tagZ = structuredClone(p.classes.tagA); p.precedence.push('tagZ'); }).some(x => /不是已有标签/.test(x)));
  assert.ok(bad(p => { delete p.dimensions.densityKgPerL.unit; }).some(x => /缺单位或范围/.test(x)));
  assert.ok(bad(p => { p.dimensions.volume = {unit: 'L', min: 0, max: 1}; }).some(x => /未登记/.test(x)));
});

test('正式数据：physical 通过 L1；每个出处原值的 citation 里能找到与 densityKgPerL 对应的原数字', () => {
  const tags = new Set([...Object.keys(phys.classes), ...Object.keys(table.classes)]);
  assert.deepEqual(validatePhysical(phys, tags), []);
  assert.deepEqual(Object.keys(phys.dimensions), PHYSICAL_DIMENSIONS);
  for (const [k, row] of Object.entries(phys.classes)) {
    for (const s of row.sources ?? []) {
      const c = s.citation, v = s.densityKgPerL;
      const nums = [...c.matchAll(/(\d+(?:\.\d+)?)\s*(?:-|–|—)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)/g)];
      const kgm3 = /kg\/m³/.test(c), tenCubed = /10³ kg\/m³/.test(c);
      const scale = tenCubed ? 1 : kgm3 ? 1000 : null;
      assert.ok(scale !== null, `${k}.${s.name} citation 须写明单位 kg/m³ 或 10³ kg/m³`);
      const hit = nums.some(m => m[1] !== undefined
        ? (s.range ? Math.abs(Number(m[1]) / scale - s.range.densityKgPerL[0]) < 1e-9 && Math.abs(Number(m[2]) / scale - s.range.densityKgPerL[1]) < 1e-9 && Math.abs((s.range.densityKgPerL[0] + s.range.densityKgPerL[1]) / 2 - v) < 1e-9 : false)
        : Math.abs(Number(m[3]) / scale - v) < 1e-9);
      assert.ok(hit, `${k}.${s.name}：citation 里没有与 ${v} kg/L 对应的原值（${c}）`);
    }
    assert.ok(row.appearance.length >= 3 && row.appearance.length <= 6, `${k} 外观 3–6 条`);
  }
});

test('正式数据：推算值就是出处原值按规则的结果（木料五种取平均；其余单一出处或区间中值）', () => {
  const d = k => deriveFromSources(phys.classes[k], table.kcalPerSatiety).densityKgPerL;
  const w = [0.77, 0.71, 0.67, 0.51, 0.43];
  assert.deepEqual(phys.classes.timber.sources.map(s => s.densityKgPerL), w);
  assert.equal(d('timber'), round3(mean(w)));
  assert.equal(d('wood'), d('timber'));
  for (const [k, v] of Object.entries({iron: 7.75, ceramic: 1.85, leather: 0.86, paper: 0.925, bone: 1.85, wax: 0.96}))assert.equal(d(k), v, k);
});

test('正式数据：不做兜底——液体、食物类、混合材没有密度；缺项为未知', () => {
  const keys = Object.keys(phys.classes);
  for (const bad of ['milk', 'fish', 'egg', 'meat', 'grain', 'edible_fat', 'vinegar', 'condiment_sauce', 'metal', 'cloth', 'clay', 'carbon', 'stone'])assert.ok(!keys.includes(bad), `${bad} 不应有密度`);
  const e = {world: {items: [{id: 'i', tags: ['milk']}], recipes: [], materialProps: structuredClone(table)}, byId: new Map([['i', {id: 'i', tags: ['milk']}]])};
  assert.deepEqual(materialProps(e, 'i').densityKgPerL, {known: false});
});

test('不让已审批材料属性失效：classes 的类别键与内容不含新维度（新维度只在表头 physical），已审条目指纹不变', () => {
  assert.equal(Object.keys(table.classes).length, 22);
  for (const [k, row] of Object.entries(table.classes)) {
    for (const key of ['densityKgPerL', 'appearance', 'physical'])assert.ok(!(key in row), `classes.${k} 不得含 ${key}`);
    for (const s of row.sources ?? [])assert.ok(!('densityKgPerL' in s), `classes.${k} 出处不得含密度`);
  }
  assert.ok(!('densityKgPerL' in table.dimensions), '表头 dimensions 在 D12 审查上下文里，不得加入新维度');
  const tags = [...new Set([...Object.keys(phys.classes), ...Object.keys(table.classes)])];
  const w = {items: tags.map(t => ({id: `item_${t}`, tags: [t]})), materialProps: structuredClone(table), recipes: []};
  assert.deepEqual(validateMaterialProps(w).filter(x => /物理属性|physical/.test(x)), [], 'validateMaterialProps 已包含 physical 的 L1，且无错');
});
