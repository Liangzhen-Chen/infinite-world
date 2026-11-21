// 细格生成 G6《材料分态布尔与生成模板族》卡内测试：卷三甲 §2.1 :128–:131 登记 opaque／blocksSky／bearsLoad／airtight
// 四个分态布尔维度（solid、liquid、gas 三栏，always 必填、不留 null），卷十 :118 登记 gentemplate 族（gtpl_、空、开放）。
// 真实材料表每一行（含"空气"行）四列三栏都写全（修改轮 M1、M7，卷三甲 1121k6 末句"数据归 G6"）；没有"缺数据放行"登记，缺任一行任一栏加载即报 E-DIM-REQUIRED-MISSING。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';

const DIMS = 'world/ontology/dimensions';
const FLAGS = ['opaque', 'blocksSky', 'bearsLoad', 'airtight'];
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');

// 真实维度表目录整份拷到仓库外临时目录，只改材料表（edit 收一份解析后的材料文档，原地改），再经 loadWorld 加载（照 place-footprint.test.mjs 的 load）。
function loadWithMaterial(edit) {
  const tmp = testTempRoot('material-grid-flags-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    const mat = JSON.parse(realText('material.json'));
    edit(mat);
    writeUnderTempRoot(tmp, 'material.json', JSON.stringify(mat));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

test('真实世界：四个分态布尔维度按 solid／liquid／gas 三栏登记、always 必填，加载零 error', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, r.text);
  assert.deepEqual(r.errors, []);
  const dims = r.tables.get('material').doc.dimensions;
  for (const dim of FLAGS) {
    const def = dims[dim];
    assert.ok(def, `${dim} 未登记`);
    assert.equal(def.type, 'struct');
    assert.equal(def.required, 'always');
    assert.deepEqual(def.requiredFields, ['gas', 'liquid', 'solid']); // 三栏逐栏必填
    assert.equal(def.owner, '卷三甲 §2.1');
    assert.equal(def.source, '卷三甲 §2.1');
    assert.deepEqual(Object.keys(def.fields).sort(), ['gas', 'liquid', 'solid']);
    for (const s of ['solid', 'liquid', 'gas']) {
      assert.equal(def.fields[s].type, 'boolean', `${dim}.${s}`);
      assert.equal(def.fields[s].nullable, undefined, `${dim}.${s} 不留 null`);
    }
  }
});

test('真实材料表每一行四个布尔三栏都有值（布尔），没有"缺数据放行"登记；空气行气栏四项皆假', () => {
  const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
  assert.ok(!unbuilt.columns.some((c) => c.table === 'material' && FLAGS.includes(c.dimension)), '材料布尔不得再登缺数据放行');
  const mat = JSON.parse(realText('material.json'));
  const ids = Object.keys(mat.rows);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    for (const dim of FLAGS) {
      for (const s of ['solid', 'liquid', 'gas']) {
        assert.equal(typeof mat.rows[id][dim]?.[s], 'boolean', `${id}.${dim}.${s}`);
        assert.ok(mat.rows[id].cellGrades[`${dim}.${s}`], `${id} 缺 cellGrades ${dim}.${s}`);
      }
    }
  }
  // 空气是一行材料（主会话 11-21 已定）：气栏四项皆假（卷三甲 :129–:131 "空气为假"）。
  const air = mat.rows.mat_air;
  assert.ok(air, '空气行');
  for (const dim of FLAGS) assert.equal(air[dim].gas, false, dim);
  // 取值与卷三甲各行备注对得上：岩土固栏遮天、承托为真；水的液栏为假、固栏（冰）为真。
  assert.deepEqual([mat.rows.mat_granite.blocksSky.solid, mat.rows.mat_granite.bearsLoad.solid], [true, true]);
  assert.deepEqual([mat.rows.mat_soil.blocksSky.solid, mat.rows.mat_soil.bearsLoad.solid], [true, true]);
  assert.deepEqual([mat.rows.mat_water.blocksSky.liquid, mat.rows.mat_water.bearsLoad.liquid, mat.rows.mat_water.blocksSky.solid, mat.rows.mat_water.bearsLoad.solid], [false, false, true, true]);
});

test('必填：临时世界里删掉任一行的任一栏、整个维度、或一整行的某个布尔，加载即报 E-DIM-REQUIRED-MISSING（不再放行）', () => {
  const missing = (r) => r.errors.filter((e) => e.code === 'E-DIM-REQUIRED-MISSING' && e.table === 'material');
  assert.equal(loadWithMaterial(() => {}).ok, true);
  // 整个维度删掉。
  const noDim = loadWithMaterial((m) => { delete m.rows.mat_soil.opaque; });
  assert.equal(noDim.ok, false);
  assert.ok(missing(noDim).some((e) => e.row === 'mat_soil' && e.dim === 'opaque'));
  // 四个维度各试一次（不同的行与栏）。
  for (const [i, dim] of FLAGS.entries()) {
    const r = loadWithMaterial((m) => { delete m.rows[['mat_granite', 'mat_water', 'mat_oak', 'mat_air'][i]][dim]; });
    assert.equal(r.ok, false, dim);
    assert.ok(missing(r).some((e) => e.dim === dim), dim);
  }
  // 只缺一栏（三栏里的 gas）：同样拒收（码可为必填缺失或结构字段缺失，须是加载错误）。
  // 只缺一栏（三栏里的 gas；依据等级键一并删，免得先撞依据键核对）：同样 E-DIM-REQUIRED-MISSING（卷三甲 :128 "缺栏加载报 E-DIM-REQUIRED-MISSING"）。
  for (const s of ['solid', 'liquid', 'gas']) {
    const noSide = loadWithMaterial((m) => { delete m.rows.mat_granite.bearsLoad[s]; delete m.rows.mat_granite.cellGrades[`bearsLoad.${s}`]; });
    assert.equal(noSide.ok, false, s);
    assert.ok(missing(noSide).some((e) => e.row === 'mat_granite' && e.dim === 'bearsLoad' && /missing/.test(e.got)), s);
  }
});

test('空气没有 substance（null），由 matcatRules 按物态判据（沸点不高于 gasBoilMax）分到气体大类 matcat_gas，加载通过；非气态材料不受这条规则影响（卷三乙 §4.1 跟改）', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, r.text);
  const mat = JSON.parse(realText('material.json'));
  assert.equal(mat.rows.mat_air.substance, null);
  const cats = r.tables.get('material').ruleIndexes.get('categories');
  assert.deepEqual([...cats.get('mat_air')], ['matcat_gas']);
  // 只有沸点不高于判据的材料进气体大类：真实表里是空气与天然气（常温气态），其余沸点都在常温以上，不受影响。
  const gas = [...cats].filter(([, v]) => v.includes('matcat_gas')).map(([id]) => id).sort();
  assert.deepEqual(gas, ['mat_air', 'mat_natural_gas']);
  // 规则读数值、不读名字：临时世界给一行沸点 −30 °C 的新材料，改名不影响，同样分到气体大类；沸点 100 的不分。
  const hot = loadWithMaterial((m) => { m.rows.mat_test_cold_gas = structuredClone(m.rows.mat_air); m.rows.mat_test_cold_gas.boilPoint = -30; m.rows.mat_test_hot = structuredClone(m.rows.mat_air); m.rows.mat_test_hot.boilPoint = 100; m.rows.mat_test_hot.substance = 'subst_mineral'; });
  const c2 = hot.tables.get('material').ruleIndexes.get('categories');
  assert.ok((c2.get('mat_test_cold_gas') || []).includes('matcat_gas'));
  assert.ok(!(c2.get('mat_test_hot') || []).includes('matcat_gas'));
});

test('词表族 gentemplate：前缀 gtpl_、开放族、条目为空', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, r.text);
  const fam = r.vocab.families.get('gentemplate');
  assert.ok(fam, 'gentemplate 未登记');
  assert.equal(fam.prefix, 'gtpl_');
  assert.equal(fam.closed, false);
  assert.deepEqual(Object.keys(fam.entries), []);
});
