// P-3 材料表验收：卷三甲 §3.5 AP-2 至 AP-6 的加载期部分、§6 EA-1/2/4/5/6 的加载部分、卷十二 R12-6.2 七步中能做的步骤。
// 数据取自真实的 world/ontology/dimensions/{material,_vocab,_units}.json，每个用例在内存里拷一份改坏一处或加一行，再交 P-2 的校验器。
// 整表期望：缺值只剩卷文自己写明未核到的格，按该维 onUnknown 报 W-DIM-GAP 或 E；暂定格只验有值、在取值域内，不验具体数（李白 11-17）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { readConstants } from '../../server-plugin/kernel/load/world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'world/ontology/dimensions');
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const C = readConstants(readFileSync(join(ROOT, 'world/rules/tables/kernel-constants.json'), 'utf8'));
const OPTIONS = { namespaces: ['core'], displaySet: [], ns: [], limits: { extendsMaxDepth: C.extendsMaxDepth, rxMaxDepth: C.rxMaxDepth } };
const load = () => ({ material: JSON.parse(read('material.json')), vocab: JSON.parse(read('_vocab.json')), units: JSON.parse(read('_units.json')) });
const run = (w) => validateDimensions({ units: JSON.stringify(w.units), vocab: JSON.stringify(w.vocab), tables: [{ file: 'material.json', text: JSON.stringify(w.material) }] }, OPTIONS);
const errs = (r) => r.errors.filter((e) => e.severity === 'error');
const codesOf = (r, row) => errs(r).filter((e) => e.row === row).map((e) => `${e.code}:${e.dim}`).sort();
const key = (e) => `${e.code}|${e.row}|${e.dim}`;

// 一行完整的新金属（卷三甲 §6 EA-1：always 字段、固相量、熔点与沸点，另加 comp_durable 的两项必填）。
const newMetal = () => ({
  basis: '测试：新金属行', classes: ['comp_durable'], substance: 'subst_metal', density: { solid: 8.1 }, valueMult: 3, flammability: 0, salvageFraction: 0.8,
  workDifficulty: 40, meltPoint: 1200, boilPoint: 2800, specificHeat: { solid: 0.4 }, repairedWith: 'class_metal', corrosionRate: 0.001,
  refMaterial: null,
});

test('四族词表：class、plant_part、damage、diet 都在 _vocab.json；diet 无 eats 来源，不载条目', () => {
  const { vocab } = load();
  for (const f of ['class', 'plant_part', 'damage', 'diet']) assert.ok(vocab.families[f], f);
  assert.equal(Object.keys(vocab.families.plant_part.entries).length, 7);
  assert.ok(Object.keys(vocab.families.class.entries).includes('class_metal'));
  assert.equal(Object.keys(vocab.families.diet.entries).length, 0);
  assert.equal(Object.keys(vocab.families.damage.entries).length, 0);
});

// 卷文自己写明"未核到、留空"的格：卷三甲 §4.5.5 例 5（纤维）、例 8（碳水）短表里值栏为"—"的行（VA-4.4-I、VA-4.5-I 明说这些行眼下不成立）。
const VOL = readFileSync(join(ROOT, 'docs/统一底层设计/卷三甲-物质本源.md'), 'utf8').split('\n');
const shortTableUnknown = (tag, dim) => {
  const a = VOL.findIndex((l) => l.includes(`<!--${tag}-BEGIN-->`));
  const b = VOL.findIndex((l) => l.includes(`<!--${tag}-END-->`));
  return VOL.slice(a + 1, b).filter((l) => /^\| mat_/.test(l)).map((l) => l.split('|').map((c) => c.trim())).filter((c) => c[3] === '—').map((c) => `${c[1]}.${dim}`);
};
const volumeUnknown = () => [...shortTableUnknown('FIBER-DATA', 'fiberContent'), ...shortTableUnknown('CARB-DATA', 'carbContent')].sort();

test('93 行：缺值只剩卷文明写未核到的格，按该维 onUnknown 报（gap → W-DIM-GAP，error → E）；别无错误', () => {
  const w = load();
  assert.equal(Object.keys(w.material.rows).length, 93);
  const r = run(w);
  const got = r.errors.map((e) => `${e.code}|${e.row}.${e.dim}`).sort();
  // 必填条件里 byDigestible 由 P-2 记 notCovered 不判（落叶的纤维即此），故期望只取 byClass:comp_edible 成立的行。
  const judged = volumeUnknown().filter((k) => (w.material.rows[k.split('.')[0]].classes || []).includes('comp_edible'));
  const want = judged.map((k) => `${w.material.dimensions[k.split('.')[1]].onUnknown === 'gap' ? 'W-DIM-GAP' : 'E-DIM-REQUIRED-MISSING'}|${k}`).sort();
  assert.deepEqual(got, want);
});

// 卷二 §1.6（:262）gap：该项不进候选，`(kind,id,dim)` 记入缺口表；加载结果里的缺口清单即 W-DIM-GAP 条目。
const gapList = (r) => r.errors.filter((e) => e.code === 'W-DIM-GAP').map((e) => `${e.row}.${e.dim}`).sort();

test('整表零 E；缺口清单恰是卷文未核到且被判必填的格（醪纤维 1、碳水 3），每格恰一条', () => {
  const w = load();
  const r = run(w);
  assert.equal(r.ok, true);
  assert.deepEqual(errs(r), []);
  const judged = volumeUnknown().filter((k) => (w.material.rows[k.split('.')[0]].classes || []).includes('comp_edible'));
  assert.deepEqual(gapList(r), judged);
  assert.ok(gapList(r).includes('mat_mash.fiberContent'));
  assert.equal(new Set(gapList(r)).size, gapList(r).length);
});

test('纤维含量反例：值越出 [0,1] 仍 E；非 gap 的必填维度（energyDensity，error）缺值仍 E；补上有效纤维值后缺口消失', () => {
  const a = load();
  a.material.rows.mat_mash.fiberContent = 1.5;
  const ra = run(a);
  assert.deepEqual(codesOf(ra, 'mat_mash'), ['E-DIM-DOMAIN-RANGE:fiberContent']);
  assert.ok(!gapList(ra).includes('mat_mash.fiberContent'));
  const b = load();
  delete b.material.rows.mat_millet.energyDensity;
  const rb = run(b);
  assert.deepEqual(codesOf(rb, 'mat_millet'), ['E-DIM-REQUIRED-MISSING:energyDensity']);
  assert.equal(rb.ok, false);
  const c = load();
  c.material.rows.mat_mash.fiberContent = 0.1;
  const rc = run(c);
  assert.equal(rc.ok, true);
  assert.ok(!gapList(rc).includes('mat_mash.fiberContent'));
});

test('暂定格：每个标暂定的格都有值、过表头取值域；valueMult 标"待 M3b-27 标定"、rotRate 标"待 M3a-4 标定"；卷文明写未核到的格不暂填', () => {
  const w = load();
  const r = run(w);
  assert.deepEqual(errs(r).filter((e) => e.code !== 'E-DIM-REQUIRED-MISSING'), []);
  let n = 0;
  for (const [id, row] of Object.entries(w.material.rows)) {
    for (const s of (row.sources || []).filter((x) => x.status === 'vstat_placeholder')) {
      n++;
      const [dim, key] = s.dimension.split('.');
      assert.ok(s.name.startsWith('暂定，待'), `${id} ${s.dimension}`);
      if (dim === 'valueMult') assert.ok(s.name.includes('待 M3b-27 标定'), `${id} valueMult`);
      if (dim === 'rotRate') assert.ok(s.name.includes('待 M3a-4 标定'), `${id} rotRate`);
      assert.ok(/^P3-T\d/.test(s.citation), `${id} ${s.dimension}`);
      const v = key ? row[dim][key] : row[dim];
      assert.ok(v !== undefined && v !== null, `${id}.${s.dimension}`);
      const dom = w.material.dimensions[dim].domain || (w.material.dimensions[dim].value || {}).domain;
      if (typeof v === 'number') assert.ok(v >= dom[0] && (dom[1] === null || v <= dom[1]), `${id}.${s.dimension}=${v}`);
      assert.ok(!volumeUnknown().includes(`${id}.${dim}`));
    }
  }
  assert.ok(n > 0);
});

test('R12-6.2 ①②③⑥⑦（④⑤ 无世界推进与行为运行时，not_run）：加一行不改代码，错误集合不增，撤掉后与从未加过相同', () => {
  const fingerprint = () => {
    const files = JSON.parse(readFileSync(join(ROOT, 'server-plugin/kernel/files.json'), 'utf8')).concat(['server-plugin/kernel/files.json']);
    const h = createHash('sha256');
    for (const f of files) h.update(f).update(readFileSync(join(ROOT, f)));
    return h.digest('hex');
  };
  const before = fingerprint();
  const base = run(load());
  const w = load();
  w.material.rows.mat_test_new_metal = newMetal();
  const withRow = run(w);
  assert.deepEqual(codesOf(withRow, 'mat_test_new_metal'), []);
  const baseKeys = new Set(errs(base).map(key));
  assert.deepEqual(errs(withRow).map(key).filter((k) => !baseKeys.has(k)), []);
  delete w.material.rows.mat_test_new_metal;
  assert.equal(run(w).text, base.text);
  assert.equal(fingerprint(), before);
});

test('EA-1/EA-2：新金属行通过，补 density.liquid 不加行也通过', () => {
  const w = load();
  w.material.rows.mat_test_new_metal = newMetal();
  assert.deepEqual(codesOf(run(w), 'mat_test_new_metal'), []);
  const n = Object.keys(w.material.rows).length;
  w.material.rows.mat_test_new_metal.density.liquid = 7.2;
  assert.deepEqual(codesOf(run(w), 'mat_test_new_metal'), []);
  assert.equal(Object.keys(w.material.rows).length, n);
  w.material.rows.mat_test_new_metal.density.liquid = 99;
  assert.ok(codesOf(run(w), 'mat_test_new_metal').includes('E-DIM-DOMAIN-RANGE:density'));
});

test('EA-1 反例：漏填 always 字段、固相量越界、重复代号', () => {
  const w = load();
  w.material.rows.mat_test_new_metal = newMetal();
  delete w.material.rows.mat_test_new_metal.workDifficulty;
  assert.deepEqual(codesOf(run(w), 'mat_test_new_metal'), ['E-DIM-REQUIRED-MISSING:workDifficulty']);
  const w2 = load();
  w2.material.rows.mat_test_new_metal = { ...newMetal(), wearResistance: 0 };
  assert.deepEqual(codesOf(run(w2), 'mat_test_new_metal'), ['E-DIM-DOMAIN-RANGE:wearResistance']);
  const w3 = load();
  w3.material.rows.mat_test_new_metal = newMetal();
  w3.material.generated.mat_test_new_metal = { ...newMetal(), generated: { by: 't', seedKey: 'k', at: 0 } };
  assert.ok(errs(run(w3)).some((e) => e.code === 'E-DIM-ID-DUPLICATE'));
});

test('EA-6（加载部分）：植物料不填 plantPart 通过；填已登记部位通过；填未登记代号加载失败。警告清单（L5）未做，not_run', () => {
  const w = load();
  w.material.rows.mat_test_new_herb = { basis: '测试：新植物料', substance: 'subst_plant', density: { solid: 0.3 }, valueMult: 1, flammability: 0.5, salvageFraction: 0.1, workDifficulty: 5, meltPoint: null, decomposePoint: 250, refMaterial: null };
  assert.deepEqual(codesOf(run(w), 'mat_test_new_herb'), ['E-DIM-DOMAIN-RANGE:meltPoint']);
  delete w.material.rows.mat_test_new_herb.meltPoint;
  assert.deepEqual(codesOf(run(w), 'mat_test_new_herb'), []);
  w.material.rows.mat_test_new_herb.plantPart = 'ppart_seed';
  assert.deepEqual(codesOf(run(w), 'mat_test_new_herb'), []);
  w.material.rows.mat_test_new_herb.plantPart = 'ppart_nonexistent';
  assert.deepEqual(codesOf(run(w), 'mat_test_new_herb'), ['E-DIM-REF-MISSING:plantPart']);
});

test('EA-4（加载部分）：reaction 族加一条，一行来料补产物通过；写未登记反应加载失败', () => {
  const w = load();
  w.vocab.families.reaction.entries.reaction_test_new = {};
  // reactionYield 的 onUnknown 是 error，按卷二 §1.6 第 4 项映射键集须覆盖 reaction 全族，没有的键写 null（见 docs/问题.md）。
  const all = Object.keys(w.vocab.families.reaction.entries);
  const yields = (v) => Object.fromEntries(all.map((k) => [k, k === 'reaction_test_new' ? v : null]));
  w.material.rows.mat_test_ore = { ...newMetal(), classes: [], repairedWith: undefined, corrosionRate: undefined, reactionProducts: { reaction_test_new: 'mat_wrought_iron' }, reactionYield: yields(0.5) };
  assert.deepEqual(codesOf(run(w), 'mat_test_ore'), []);
  w.material.rows.mat_test_ore.reactionProducts = { reaction_unregistered: 'mat_wrought_iron' };
  assert.ok(codesOf(run(w), 'mat_test_ore').some((c) => /^E-DIM-(DOMAIN-ENUM|REF-MISSING):reactionProducts$/.test(c)));
});

test('EA-5：生成器写回 20 条生成材料行走同一校验器；与手写行互换后错误集合相同', () => {
  const hand = load();
  const gen = load();
  for (let i = 0; i < 20; i++) {
    const id = `mat_test_gen_${String(i).padStart(2, '0')}`;
    hand.material.rows[id] = { ...newMetal(), density: { solid: 5 + i * 0.1 } };
    gen.material.generated[id] = { ...newMetal(), density: { solid: 5 + i * 0.1 }, generated: { by: 'gen_test', seedKey: `k${i}`, at: i } };
    delete gen.material.generated[id].basis;
  }
  const rh = run(hand);
  const rg = run(gen);
  const ids = Object.keys(gen.material.generated);
  assert.deepEqual(errs(rg).filter((e) => ids.includes(e.row)).map((e) => e.code + e.dim), []);
  assert.deepEqual(errs(rh).filter((e) => ids.includes(e.row)).map((e) => e.code + e.dim), []);
  const base = new Set(errs(run(load())).map(key));
  assert.deepEqual(errs(rg).map(key).filter((k) => !base.has(k)), []);
});

test('AP-2（加载侧）：材料行写显示名、说明、外观词条字段即加载失败；外观词条在语言包，表内只留条数', () => {
  const w = load();
  for (const f of ['labels', 'name', 'description', 'appearance']) {
    const x = load();
    x.material.rows.mat_wrought_iron = { ...x.material.rows.mat_wrought_iron, [f]: 'x' };
    assert.ok(codesOf(run(x), 'mat_wrought_iron').includes(`E-DIM-STRUCT-FIELD:${f}`), f);
  }
  assert.ok(!/"appearance"|"term"|"labels"/.test(JSON.stringify(w.material)));
  const labels = JSON.parse(readFileSync(join(ROOT, 'world/i18n/labels.zh.json'), 'utf8'));
  const n = Object.values(w.material.classes).reduce((a, c) => a + (c.appearanceRefs || 0), 0);
  assert.equal(Object.keys(labels).filter((k) => k.includes('.appearance.')).length, n);
});

test('AP-3：六个派生字段任一写在材料行（实体行、类别行）上即 E-DIM-DERIVED-WRITTEN；不写则无此码', () => {
  for (const f of ['hardness', 'toughness', 'charYield', 'hydration', 'producedBy', 'categories']) {
    const x = load();
    x.material.rows.mat_wrought_iron = { ...x.material.rows.mat_wrought_iron, [f]: f === 'producedBy' || f === 'categories' ? [] : 0.5 };
    assert.ok(codesOf(run(x), 'mat_wrought_iron').includes(`E-DIM-DERIVED-WRITTEN:${f}`), f);
    const y = load();
    y.material.classes.class_timber[f] = f === 'producedBy' || f === 'categories' ? [] : 0.5;
    assert.ok(codesOf(run(y), 'class_timber').includes(`E-DIM-DERIVED-WRITTEN:${f}`), `class ${f}`);
  }
  assert.ok(!errs(run(load())).some((e) => e.code === 'E-DIM-DERIVED-WRITTEN'));
});

// AP-4、AP-5、AP-6 是对表头与词表的数据扫描；扫描函数在此，正反各用一份数据。
const scanMatterField = (w) => Object.entries(w.material.dimensions).filter(([, d]) => {
  const fam = d.vocab || (d.of && d.of.vocab) || (d.key && d.key.vocab);
  const entries = fam && w.vocab.families[fam] ? Object.keys(w.vocab.families[fam].entries) : [];
  return ['solid', 'liquid', 'gas'].every((s) => entries.some((e) => e.endsWith(`_${s}`)));
}).map(([k]) => k);
const scanRulesKey = (w) => JSON.stringify(w.material.dimensions).match(/rules\.[a-zA-Z]+/g) || [];
const scanPlantPart = (w) => Object.entries(w.material.dimensions).filter(([, d]) => [d.vocab, d.of && d.of.vocab, d.key && d.key.vocab].includes('plant_part')).map(([k]) => k)
  .concat(Object.entries(w.vocab.families).filter(([f, x]) => f !== 'plant_part' && Object.keys(x.entries).some((e) => e.startsWith('ppart_'))).map(([f]) => `family:${f}`));

test('AP-4：表头没有取值为固、液、气的字段（分态量是 struct 子键，不是词表引用）；行上写物态字段加载失败', () => {
  const w = load();
  assert.deepEqual(scanMatterField(w), []);
  assert.deepEqual(Object.keys(w.material.dimensions.density.fields), ['gas', 'liquid', 'solid']);
  w.vocab.families.matter = { closed: true, prefix: 'matter_', entries: { matter_solid: {}, matter_liquid: {}, matter_gas: {} } };
  w.material.dimensions.stateAt20 = { type: 'enum', vocab: 'matter', required: 'never', onUnknown: 'skip', modifiable: false, source: 't', owner: 't' };
  assert.deepEqual(scanMatterField(w), ['stateAt20']);
  const x = load();
  x.material.rows.mat_wrought_iron.stateAt20 = 'matter_solid';
  assert.ok(codesOf(run(x), 'mat_wrought_iron').includes('E-DIM-STRUCT-FIELD:stateAt20'));
});

test('AP-5：表头里没有规则表键（rules. 开头）；注入一处即被扫出', () => {
  const w = load();
  assert.deepEqual(scanRulesKey(w), []);
  w.material.dimensions.heatValue.required = 'byClass:comp_burnable；rules.materials.x';
  assert.deepEqual(scanRulesKey(w), ['rules.materials']);
});

test('AP-6：植物部位词表全书只有 plant_part 一族，材料行只有 plantPart 一个字段引用它；另立一族或同义字段被扫出，同前缀的第二族被加载器拒绝', () => {
  const w = load();
  assert.deepEqual(scanPlantPart(w), ['plantPart']);
  w.vocab.families.plant_organ = { closed: false, prefix: 'organ_', entries: { ppart_x: {} } };
  assert.ok(scanPlantPart(w).includes('family:plant_organ'));
  const x = load();
  x.material.dimensions.plantOrgan = { type: 'ref', vocab: 'plant_part', nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, source: 't', owner: 't' };
  assert.deepEqual(scanPlantPart(x).sort(), ['plantOrgan', 'plantPart']);
  const y = load();
  y.vocab.families.plant_organ = { closed: false, prefix: 'ppart_', entries: { ppart_x2: {} } };
  assert.ok(errs(run(y)).some((e) => e.code === 'E-DIM-VOCAB-PREFIX'));
});
