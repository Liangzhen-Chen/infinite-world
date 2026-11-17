// P-3 材料表验收：卷三甲 §3.5 AP-2 至 AP-6 的加载期部分、§6 EA-1/2/3/4/5/6 的加载部分、M-16/M-19/M-22、卷十二 R12-6.2 七步中能做的步骤。
// 数据取自真实的 world/ontology/dimensions/{material,_vocab,_units}.json，每个用例在内存里拷一份改坏一处或加一行，再交校验器。
// 设定值（designed）只验有值、级别、basis、域与约束，不验具体数（李白 11-17）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { gradedCells } from '../../server-plugin/kernel/validate/cell-grades.mjs';
import { readRules, ruleTable } from '../../server-plugin/kernel/load/rules.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'world/ontology/dimensions');
const read = (f) => readFileSync(join(DIR, f), 'utf8');
const C = ruleTable(readRules(ROOT).rules, 'kernelConstants');
const NS = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8')).rxNamespaces;
const OPTIONS = { namespaces: ['core'], displaySet: [], ns: NS, limits: { extendsMaxDepth: C.extendsMaxDepth, rxMaxDepth: C.rxMaxDepth } };
const load = () => ({ material: JSON.parse(read('material.json')), vocab: JSON.parse(read('_vocab.json')), units: JSON.parse(read('_units.json')) });
const run = (w) => validateDimensions({ units: JSON.stringify(w.units), vocab: JSON.stringify(w.vocab), tables: [{ file: 'material.json', text: JSON.stringify(w.material) }] }, OPTIONS);
const errs = (r) => r.errors.filter((e) => e.severity === 'error');
const codesOf = (r, row) => errs(r).filter((e) => e.row === row).map((e) => `${e.code}:${e.dim}`).sort();
const key = (e) => `${e.code}|${e.row}|${e.dim}`;
const gapList = (r) => r.errors.filter((e) => e.code === 'W-DIM-GAP').map((e) => `${e.row}.${e.dim}`).sort();
// 测试行逐格记 designed（M-22 键集合须等于填了值的格）；删一格时连级别一起删。
const withGrades = (w, row) => ({ ...row, cellGrades: Object.fromEntries([...gradedCells(w.material.dimensions, row).keys()].map((k) => [k, { grade: 'designed', citation: null, basis: '测试行' }])) });
const drop = (row, dim) => { delete row[dim]; for (const k of Object.keys(row.cellGrades)) if (k === dim || k.startsWith(`${dim}.`)) delete row.cellGrades[k]; };
const domainOf = (w, k) => { const [d, s] = k.split('.'); const def = w.material.dimensions[d]; return (s !== undefined && def.fields ? def.fields[s] : def.value || def).domain || def.domain; };
const cellValue = (row, k) => { const [d, s] = k.split('.'); return s === undefined ? row[d] : row[d][s]; };
const allRows = (w) => [...Object.entries(w.material.rows), ...Object.entries(w.material.classes)];

// 一行完整的新金属（卷三甲 §6 EA-1：always 字段、固相量、熔点与沸点，另加 comp_durable 的两项必填）。
const newMetal = (w) => withGrades(w, {
  basis: '测试：新金属行', classes: ['comp_durable'], substance: 'subst_metal', density: { solid: 8.1 }, valueMult: 3, flammability: 0, salvageFraction: 0.8,
  workDifficulty: 40, meltPoint: 1200, boilPoint: 2800, specificHeat: { solid: 0.4 }, repairedWith: 'class_metal', corrosionRate: 0.001,
  refMaterial: null,
});

test('真实世界 loadWorld：零 error、零 warning；byDigestible 已按表头声明求值，不再列入 notCovered', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.ok(!r.notCovered.some((x) => x.endsWith(':byDigestible')));
});

test('四族词表：class、plant_part、damage、diet 在 _vocab.json；diet 四条照卷四 §4.7.5 数据行原文载入', () => {
  const { vocab } = load();
  for (const f of ['class', 'plant_part', 'damage', 'diet']) assert.ok(vocab.families[f], f);
  assert.equal(Object.keys(vocab.families.plant_part.entries).length, 7);
  assert.ok(Object.keys(vocab.families.class.entries).includes('class_metal'));
  assert.equal(Object.keys(vocab.families.damage.entries).length, 0);
  const vol4 = readFileSync(join(ROOT, 'docs/统一底层设计/卷四-生物身体与人物.md'), 'utf8').split('\n');
  const rows = vol4.filter((l) => /^"diet_\w+": \{/.test(l)).map((l) => Object.entries(JSON.parse(`{${l}}`))[0]);
  assert.deepEqual(rows.map(([k]) => k).sort(), ['diet_graze', 'diet_omnivore', 'diet_piscivore', 'diet_root']);
  for (const [k, v] of rows) assert.deepEqual(vocab.families.diet.entries[k], v, k);
  for (const v of Object.values(vocab.families.diet.entries)) assert.ok(!('primaryConsumer' in v));
});

test('93 行：整表零 E、零缺口；卷文短表留空（"未核"）的格都已填设定值（designed），不再留空（李白 11-17 补裁）', () => {
  const w = load();
  assert.equal(Object.keys(w.material.rows).length, 93);
  const r = run(w);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  const vol = readFileSync(join(ROOT, 'docs/统一底层设计/卷三甲-物质本源.md'), 'utf8').split('\n');
  for (const [tag, dim] of [['FIBER-DATA', 'fiberContent'], ['CARB-DATA', 'carbContent']]) {
    const a = vol.findIndex((l) => l.includes(`<!--${tag}-BEGIN-->`));
    const b = vol.findIndex((l) => l.includes(`<!--${tag}-END-->`));
    for (const c of vol.slice(a + 1, b).filter((l) => /^\| mat_/.test(l)).map((l) => l.split('|').map((x) => x.trim()))) {
      const row = w.material.rows[c[1]];
      assert.ok(typeof row[dim] === 'number', `${c[1]}.${dim}`);
      if (c[3] === '—') assert.equal(row.cellGrades[dim].grade, 'designed', `${c[1]}.${dim}`);
    }
  }
});

test('P3-05 cellGrades：材料行与类别行逐格都有级别，键集合等于填了值的格；行上不再有逐格 sources；级别字段按级别写全', () => {
  const w = load();
  let n = 0;
  for (const [id, row] of allRows(w)) {
    assert.deepEqual(Object.keys(row.cellGrades).sort(), [...gradedCells(w.material.dimensions, row).keys()].sort(), id);
    if (id.startsWith('mat_')) assert.ok(!('sources' in row), `${id} sources`);
    for (const [k, g] of Object.entries(row.cellGrades)) {
      n++;
      if (g.grade === 'measured') { assert.ok(g.citation, `${id}.${k}`); assert.equal(g.basis, null); }
      if (g.grade === 'designed') { assert.ok(g.basis, `${id}.${k}`); assert.equal(g.citation, null); }
      if (g.grade === 'referenced') { assert.equal(g.citation, null); assert.equal(g.basis, null); assert.ok(row.refMaterial, id); }
    }
  }
  assert.ok(n > 1000);
});

test('designed 格：有值、在表头取值域内；M-19 碳水不小于纤维；卷文有实测依据代号的格（能:饲 等）记 measured，不降成 designed', () => {
  const w = load();
  for (const [id, row] of allRows(w)) {
    for (const [k, g] of Object.entries(row.cellGrades)) {
      if (g.grade !== 'designed') continue;
      const v = cellValue(row, k);
      assert.ok(typeof v === 'number' || typeof v === 'boolean', `${id}.${k}`);
      const dom = domainOf(w, k);
      if (typeof v === 'number' && dom) assert.ok(v >= dom[0] && (dom[1] === null || v <= dom[1]), `${id}.${k}=${v}`);
    }
    if (typeof row.carbContent === 'number' && typeof row.fiberContent === 'number') assert.ok(row.carbContent >= row.fiberContent, id);
  }
  // 能:饲（干草）、氧:试（竹）、纤:饲 / 碳:饲（麦）照 :528 折 A 级。
  assert.equal(w.material.rows.mat_dry_grass.cellGrades.energyDensity.grade, 'measured');
  assert.equal(w.material.rows.mat_bamboo.cellGrades.flammability.grade, 'measured');
  assert.equal(w.material.rows.mat_wheat.cellGrades.fiberContent.grade, 'measured');
  assert.equal(w.material.rows.mat_wheat.cellGrades.carbContent.grade, 'measured');
});

test('暂定格：valueMult 的 basis 写"待 M3b-27 标定"、rotRate 写"待 M3a-4 标定"，都记 designed', () => {
  const w = load();
  let n = 0;
  for (const [id, row] of Object.entries(w.material.rows)) {
    for (const [dim, tag] of [['valueMult', '待 M3b-27 标定'], ['rotRate', '待 M3a-4 标定']]) {
      const g = row.cellGrades[dim];
      if (!g || !g.basis.startsWith('暂定')) continue;
      n++;
      assert.equal(g.grade, 'designed');
      assert.ok(g.basis.includes(tag), `${id}.${dim}`);
    }
  }
  assert.ok(n > 0);
});

test('P3-06：旧营养类别行（有旧 kcal 的）energyDensity 已填设定值（designed，有 basis），不由千卡折算', () => {
  const w = load();
  const food = Object.entries(w.material.classes).filter(([, c]) => (c.sources || []).some((s) => s.kcalPer100gWet !== undefined));
  assert.ok(food.length > 0);
  for (const [id, c] of food) {
    assert.ok(typeof c.energyDensity === 'number', id);
    assert.equal(c.cellGrades.energyDensity.grade, 'designed', id);
    assert.ok(!/kcal|千卡/.test(String(c.energyDensity)), id);
  }
});

test('P3-27：verified-sources.json 已删；USDA 编号在类别行含水率与对应材料行含水率的 measured 出处里', () => {
  assert.equal(existsSync(join(ROOT, 'world/meta/mechanics/verified-sources.json')), false);
  const w = load();
  const fdc = allRows(w).filter(([, r]) => r.cellGrades.moisture && r.cellGrades.moisture.grade === 'measured' && /FDC \d{6}/.test(r.cellGrades.moisture.citation));
  assert.ok(fdc.some(([id]) => id.startsWith('mat_')));
  assert.ok(fdc.some(([id]) => id.startsWith('class_')));
});

test('P3-30/P3-13 byDigestible：食草食性吃得了的干草、秸秆、落叶营养必填，漏 energyDensity 加载失败；去掉 diet 条目就不再必填', () => {
  for (const id of ['mat_dry_grass', 'mat_straw', 'mat_leaf_litter']) {
    const w = load();
    assert.ok(!(w.material.rows[id].classes || []).includes('comp_edible'), id);
    drop(w.material.rows[id], 'energyDensity');
    assert.deepEqual(codesOf(run(w), id), ['E-DIM-REQUIRED-MISSING:energyDensity'], id);
    w.vocab.families.diet.entries = {};
    assert.deepEqual(codesOf(run(w), id), [], `${id} without diet`);
  }
  // 本源成分为空（null）的料：放牧、拱食的条件比相等为假，不进必填；岩盐（不是草本）同样不进。
  for (const id of ['mat_resin', 'mat_wrought_iron']) {
    const w = load();
    if (w.material.rows[id].nutrients) continue;
    assert.deepEqual(codesOf(run(w), id), [], id);
  }
});

test('EA-3 / VA-4.4-E：加一行不挂可食的草本秸秆类料，漏 energyDensity 加载失败，漏 fiberContent 只记一条缺口；新增食性不改代码即扩必填', () => {
  const w = load();
  const base = { basis: '测试：新秸秆', classes: ['comp_burnable'], substance: 'subst_plant', density: { solid: 0.3 }, valueMult: 1, flammability: 0.6, salvageFraction: 0.1, workDifficulty: 5,
    decomposePoint: 220, heatValue: 15, ignitePoint: 380, burnRate: 0.2, volatility: 0, moisture: 0.1, energyDensity: 18, fiberContent: 0.4, carbContent: 0.7, nutrients: { nutr_salt: 0.3 }, refMaterial: null };
  w.material.rows.mat_test_straw = withGrades(w, base);
  assert.deepEqual(codesOf(run(w), 'mat_test_straw'), []);
  drop(w.material.rows.mat_test_straw, 'energyDensity');
  assert.deepEqual(codesOf(run(w), 'mat_test_straw'), ['E-DIM-REQUIRED-MISSING:energyDensity']);
  const x = load();
  x.material.rows.mat_test_straw = withGrades(x, base);
  drop(x.material.rows.mat_test_straw, 'fiberContent');
  const rx = run(x);
  assert.deepEqual(errs(rx), []);
  assert.deepEqual(gapList(rx), ['mat_test_straw.fiberContent']);
  // 只吃金属的新食性：熟铁随即要营养格（卷三甲 VA-4.4-E），撤掉即恢复。
  const y = load();
  y.vocab.families.diet.entries.diet_test_rust = { eats: 'material.substance == subst_metal and lot.spoilage <= 1' };
  assert.ok(codesOf(run(y), 'mat_wrought_iron').includes('E-DIM-REQUIRED-MISSING:energyDensity'));
  delete y.vocab.families.diet.entries.diet_test_rust;
  assert.deepEqual(codesOf(run(y), 'mat_wrought_iron'), []);
});

test('P3-32：有固相栏的材料 sharpnessMax 全有值（rules.dimfill.materialSharpnessMax 90% 不降），补的格 designed、basis 写明下限键', () => {
  const w = load();
  const denom = Object.entries(w.material.rows).filter(([, r]) => r.density && typeof r.density.solid === 'number');
  const known = denom.filter(([, r]) => typeof r.sharpnessMax === 'number');
  assert.ok(known.length / denom.length >= 0.9);
  for (const [id, r] of known) if (r.cellGrades.sharpnessMax.grade === 'designed' && !/例值/.test(r.cellGrades.sharpnessMax.basis)) assert.ok(r.cellGrades.sharpnessMax.basis.includes('materialSharpnessMax'), id);
});

test('1117p3 兜底：设定值撤掉后纤维缺值只记一条 W-DIM-GAP、零 E', () => {
  const w = load();
  drop(w.material.rows.mat_mash, 'fiberContent');
  const r = run(w);
  assert.deepEqual(errs(r), []);
  assert.deepEqual(gapList(r), ['mat_mash.fiberContent']);
});

test('纤维含量反例：值越出 [0,1] 仍 E；非 gap 的必填维度（energyDensity，error）缺值仍 E；补上有效纤维值后缺口消失', () => {
  const a = load();
  a.material.rows.mat_mash.fiberContent = 1.5;
  const ra = run(a);
  assert.deepEqual(codesOf(ra, 'mat_mash'), ['E-DIM-DOMAIN-RANGE:fiberContent']);
  assert.ok(!gapList(ra).includes('mat_mash.fiberContent'));
  const b = load();
  drop(b.material.rows.mat_millet, 'energyDensity');
  const rb = run(b);
  assert.deepEqual(codesOf(rb, 'mat_millet'), ['E-DIM-REQUIRED-MISSING:energyDensity']);
  assert.equal(rb.ok, false);
  const c = load();
  c.material.rows.mat_mash.fiberContent = 0.1;
  const rc = run(c);
  assert.equal(rc.ok, true);
  assert.ok(!gapList(rc).includes('mat_mash.fiberContent'));
});

test('M-22 在真实数据上：漏一格级别、measured 去掉出处、B 级参照格改成不等值，都加载失败', () => {
  const a = load(); delete a.material.rows.mat_wheat.cellGrades.moisture;
  assert.deepEqual(codesOf(run(a), 'mat_wheat'), ['E-MAT-GRADE-KEYS:cellGrades']);
  const b = load(); b.material.rows.mat_wheat.cellGrades.energyDensity.citation = null;
  assert.deepEqual(codesOf(run(b), 'mat_wheat'), ['E-MAT-GRADE-FIELD:cellGrades.energyDensity']);
  const c = load(); c.material.rows.mat_cold_iron.specificHeat.solid = 0.51;
  assert.deepEqual(codesOf(run(c), 'mat_cold_iron'), ['E-MAT-GRADE-REF:cellGrades.specificHeat.solid']);
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
  w.material.rows.mat_test_new_metal = newMetal(w);
  const withRow = run(w);
  assert.deepEqual(codesOf(withRow, 'mat_test_new_metal'), []);
  const baseKeys = new Set(errs(base).map(key));
  assert.deepEqual(errs(withRow).map(key).filter((k) => !baseKeys.has(k)), []);
  delete w.material.rows.mat_test_new_metal;
  assert.equal(run(w).text, base.text);
  assert.equal(fingerprint(), before);
});

test('EA-1/EA-2：新金属行通过，补 density.liquid（连级别）不加行也通过', () => {
  const w = load();
  w.material.rows.mat_test_new_metal = newMetal(w);
  assert.deepEqual(codesOf(run(w), 'mat_test_new_metal'), []);
  const n = Object.keys(w.material.rows).length;
  const row = w.material.rows.mat_test_new_metal;
  row.density.liquid = 7.2;
  row.cellGrades['density.liquid'] = { grade: 'designed', citation: null, basis: '测试行' };
  assert.deepEqual(codesOf(run(w), 'mat_test_new_metal'), []);
  assert.equal(Object.keys(w.material.rows).length, n);
  row.density.liquid = 99;
  assert.ok(codesOf(run(w), 'mat_test_new_metal').includes('E-DIM-DOMAIN-RANGE:density'));
});

test('EA-1 反例：漏填 always 字段、固相量越界、重复代号', () => {
  const w = load();
  w.material.rows.mat_test_new_metal = newMetal(w);
  drop(w.material.rows.mat_test_new_metal, 'workDifficulty');
  assert.deepEqual(codesOf(run(w), 'mat_test_new_metal'), ['E-DIM-REQUIRED-MISSING:workDifficulty']);
  const w2 = load();
  w2.material.rows.mat_test_new_metal = withGrades(w2, { ...newMetal(w2), wearResistance: 0 });
  assert.deepEqual(codesOf(run(w2), 'mat_test_new_metal'), ['E-DIM-DOMAIN-RANGE:wearResistance']);
  const w3 = load();
  w3.material.rows.mat_test_new_metal = newMetal(w3);
  w3.material.generated.mat_test_new_metal = { ...newMetal(w3), generated: { by: 't', seedKey: 'k', at: 0 } };
  assert.ok(errs(run(w3)).some((e) => e.code === 'E-DIM-ID-DUPLICATE'));
});

test('EA-6（加载部分）：植物料不填 plantPart 通过；填已登记部位通过；填未登记代号加载失败。警告清单（L5）未做，not_run', () => {
  const w = load();
  // 草本料满足放牧食性，营养四项与碳水一起写上（M-16、M-19）。
  w.material.rows.mat_test_new_herb = withGrades(w, { basis: '测试：新植物料', substance: 'subst_plant', density: { solid: 0.3 }, valueMult: 1, flammability: 0.5, salvageFraction: 0.1, workDifficulty: 5,
    decomposePoint: 250, moisture: 0.1, energyDensity: 17, fiberContent: 0.2, carbContent: 0.6, nutrients: { nutr_salt: 0.1 }, refMaterial: null });
  w.material.rows.mat_test_new_herb.meltPoint = null;
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
  const ore = { ...newMetal(w), classes: [], reactionProducts: { reaction_test_new: 'mat_wrought_iron' }, reactionYield: yields(0.5) };
  delete ore.repairedWith; delete ore.corrosionRate;
  w.material.rows.mat_test_ore = withGrades(w, ore);
  assert.deepEqual(codesOf(run(w), 'mat_test_ore'), []);
  w.material.rows.mat_test_ore.reactionProducts = { reaction_unregistered: 'mat_wrought_iron' };
  assert.ok(codesOf(run(w), 'mat_test_ore').some((c) => /^E-DIM-(DOMAIN-ENUM|REF-MISSING):reactionProducts$/.test(c)));
});

test('EA-5：生成器写回 20 条生成材料行走同一校验器；与手写行互换后错误集合相同', () => {
  const hand = load();
  const gen = load();
  for (let i = 0; i < 20; i++) {
    const id = `mat_test_gen_${String(i).padStart(2, '0')}`;
    hand.material.rows[id] = withGrades(hand, { ...newMetal(hand), density: { solid: 5 + i * 0.1 } });
    gen.material.generated[id] = { ...withGrades(gen, { ...newMetal(gen), density: { solid: 5 + i * 0.1 } }), generated: { by: 'gen_test', seedKey: `k${i}`, at: i } };
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
