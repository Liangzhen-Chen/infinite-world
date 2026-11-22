// 卷十 世界创建事务里 worldgen 相的生成补缺（R10-1.1 流程是数据、R10-1.7 手写优先生成补缺、R10-9.2/9.3 来源标记与同一加载器、A10-1.2 确定性、
// R10-2.6 自然量、R10-2.12 水体）在真实世界数据上的整体行为：真实地点表 + world/geo 的作者输入（控制海拔、水体行、高低次序、建筑清单）。
// 期望不抄仓库此刻的计数：每条都从数据本身（作者输入文件、加载后的表）推出该有什么。全规模世界创建的推进与性能不在本机测（待腾讯云）。
// 【G5b 上格收尾（本文件自 tests/kernel 挪来）：真实世界已有格空间表与 generated 节，下面"水体"与"水体足迹补缺"两条原先按"没有格空间表"写的期望已按新状态改过；
//  其余条目按旧作者输入读法（readGeoInputs）写成，上格后的读法与转换脚本的补缺读法有出入（转换脚本补缺前删去不在表里的作者输入、清空下坡链与建筑清单），
//  整条测试待腾讯云块验收首跑时核对，见 docs/问题.md "G5b 遗留"。】
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { readGeoInputs } from '../../server-plugin/kernel/load/geo-inputs.mjs';
import { generateFill } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { applyGenerated } from '../../server-plugin/kernel/gen/writeback.mjs';
import { blueprintRulesFrom } from '../../server-plugin/kernel/place-building.mjs';
import { planBlueprint } from '../../server-plugin/kernel/blueprint.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
// 长测（真实世界整段补缺一次约两分钟，主会话 11-24 已定挪进 tests/cloud/，腾讯云块验收跑）。
// 世界创建事务补缺读的是"作者行"：入库的 place.json 已烘入模板种子的 generated 节（G5b 上格收尾），所以这里读一份去掉 generated 节的拷贝，
// 与转换脚本补缺那一步同一读法（读未校验的表：作者行缺的必填列正是补缺要补的，所以不断言 ok）。
const tmpAuthored = testTempRoot('gen-world-authored-');
for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmpAuthored, f, f === 'place.json' ? JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, DIMS, f), 'utf8')), generated: {} }) : readFileSync(join(ROOT, DIMS, f), 'utf8'));
const world = loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmpAuthored) });
after(() => rmSync(tmpAuthored, { recursive: true, force: true }));
const place = world.tables.get('place');
const WORLD_ROOT = [...place.flat.rows].find(([, r]) => r.parent === null)[0];
const geoOf = () => readGeoInputs(ROOT, { rootId: WORLD_ROOT, elevationDim: 'anchorElevationM' });
// 同一（种子，默认作者输入）只补缺一次：每次约两分钟，各条用例读同一份结果（结果是纯函数，不被用例改）；自带作者输入的调用不记忆。
const memo = new Map();
const run = (seed = 'seed_one', geo = undefined) => {
  if (geo !== undefined) return generateFill(world, { worldSeed: seed, genesisMinute: 0, geo });
  if (!memo.has(seed)) memo.set(seed, generateFill(world, { worldSeed: seed, genesisMinute: 0, geo: geoOf() }));
  return memo.get(seed);
};
const controls = JSON.parse(readFileSync(join(ROOT, 'world/geo/elevation-controls.json'), 'utf8'));
const authoredIds = Object.keys(controls.rows);

test('R10-1.1：流程来自 gstage 词表条目——水体足迹补缺、自然量、高低次序投影、水体依 after 排成全序，没有写死的阶段清单', () => {
  const r = run();
  // 封卷后勘误 1121k16 加了 gstage_waterfoot、gstage_order、gstage_siteform 三个阶段（卷十 §4.1.1 :342–:354）；次序只由条目的 after 定，同层按代号升序。
  const order = r.plan.map((s) => s.stage);
  assert.ok(r.plan.every((s) => s.phase === 'worldgen'));
  const at = (code) => order.indexOf(code);
  const entry = (code) => world.vocab.index.get(code).entry;
  assert.deepEqual(entry('gstage_fields').after, ['gstage_waterfoot']);
  assert.deepEqual(entry('gstage_order').after, ['gstage_fields']);
  assert.deepEqual(entry('gstage_water').after, ['gstage_fields', 'gstage_order']);
  assert.ok(at('gstage_waterfoot') < at('gstage_fields') && at('gstage_fields') < at('gstage_order') && at('gstage_order') < at('gstage_water'));
  assert.equal(new Set(order.map((s) => entry(s).generator)).size, order.length, '每个阶段各用自己的生成器节点');
});

test('R10-1.7 手写优先：作者给了控制海拔的行（数据卡里每一行）一条偏离行都不出；其余区域足迹行各恰一条，值在 gfield 的 range 内', () => {
  const r = run();
  for (const id of authoredIds) {
    // 作者已有控制海拔：自然量阶段不出该维度的偏离（站点面积阶段另写 targetAreaM2，是别的维度，见下）。
    assert.equal(r.generated[id] === undefined || r.generated[id].anchorElevationM === undefined, true, `${id} 作者已有值，不得出海拔偏离`);
    assert.equal(r.pending.some((p) => p.id === id && p.dims.anchorElevationM !== undefined), false);
  }
  const range = world.vocab.families.get('gfield').entries.gfield_control_elevation.range;
  const geo = geoOf();
  const buildings = new Set(geo.buildingIds);
  // 站点面积阶段（R10-7.5）给不是政区的地点行写目标面积：作者给了海拔的地点行（没有 regionLevel）因此也有一条只含 targetAreaM2 的偏离行。
  const authoredPlaces = authoredIds.filter((id) => place.flat.rows.has(id) && place.flat.rows.get(id).regionLevel === undefined && !buildings.has(id));
  const expected = [...place.flat.rows.keys()].filter((id) => !buildings.has(id) && !authoredIds.includes(id));
  assert.deepEqual(Object.keys(r.generated).sort(), [...expected, ...authoredPlaces].sort());
  for (const id of authoredPlaces) assert.deepEqual(Object.keys(r.generated[id]).filter((k) => k !== 'generated'), ['targetAreaM2'], id);
  for (const id of expected) {
    const v = r.generated[id].anchorElevationM;
    assert.ok(Number.isFinite(v) && v >= range.min && v <= range.max, `${id} ${v}`);
  }
  // 建筑清单里的行是建筑足迹，不是区域足迹：没有控制海拔。
  for (const id of geo.buildingIds) assert.equal(Object.hasOwn(r.generated, id), false);
});

test('R10-9.2 来源标记：每条偏离行带 generated {by: 阶段代号, seedKey: 64 位十六进制, at: genesisMinute}，值与作者手写值分得开（不在作者行里）', () => {
  const r = run();
  for (const [id, row] of Object.entries(r.generated)) {
    assert.deepEqual(Object.keys(row.generated).sort(), ['at', 'by', 'seedKey'], id);
    assert.equal(row.generated.at, 0);
    assert.match(row.generated.seedKey, /^[0-9a-f]{64}$/);
    assert.equal(world.vocab.index.get(row.generated.by).family, 'gstage');
    // 作者行（world 表 rows 节）里没有这个值：来源只有生成一处。
    assert.equal(place.doc.rows[id] === undefined || place.doc.rows[id].anchorElevationM === undefined, true, id);
  }
});

test('A10-1.2：同种子两次逐字节相同；作者输入的遍历次序打乱仍相同；换种子至少有一行的值不同', () => {
  const a = JSON.stringify(run());
  assert.equal(a, JSON.stringify(run()));
  const geo = geoOf();
  const reversed = { ...geo, authored: new Map([...geo.authored].reverse()), buildingIds: [...geo.buildingIds].reverse() };
  assert.equal(a, JSON.stringify(run('seed_one', reversed)));
  const other = run('seed_two').generated;
  const base = run().generated;
  assert.ok(Object.keys(base).some((id) => base[id].anchorElevationM !== other[id].anchorElevationM));
});

test('R10-2.6 高低次序：数据卡给的河段次序，生成值沿链不增，且不低于下游作者端点、不高于上游作者端点', () => {
  const r = run();
  // R10-2.18 ⑤ 日志 report.projections：逐条按行 id 升序，条数 = changed，改后的值就是偏离行里的值；作者值一个都不在日志里。
  assert.equal(r.report.changed, r.report.projections.length);
  assert.deepEqual(r.report.projections.map((p) => p.row), r.report.projections.map((p) => p.row).sort());
  for (const p of r.report.projections) {
    assert.equal(r.generated[p.row].anchorElevationM, p.to, p.row);
    assert.equal(authoredIds.includes(p.row), false, `${p.row} 是作者值，不得被投影`);
    assert.ok(p.end === 'floor' || p.end === 'cap');
  }
  const chain = controls.downhill.chain;
  const authored = (id) => (controls.rows[id] ? controls.rows[id].anchorElevationM : undefined);
  const value = (id) => (authored(id) !== undefined ? authored(id) : r.generated[id].anchorElevationM);
  for (let i = 1; i < chain.length; i += 1) assert.ok(value(chain[i - 1]) >= value(chain[i]), `${chain[i - 1]} → ${chain[i]}`);
});

test('R10-2.6：作者值是子树的基准——作者给了控制海拔的行，其下一级的值 = 作者值 + 自己一级的偏差，不受它之上各级偏差影响（同一世界换种子，该差值只随它自己一级的抽取变）', () => {
  const fields = world.vocab.families.get('gfield').entries.gfield_control_elevation;
  const a = run('seed_one').generated;
  const b = run('seed_two').generated;
  // 取一个作者行下的直接子行（没有 regionLevel 的区域足迹行），两个种子下它与作者值之差都是 tractLevel 一级偏差，故在 tractLevel 分布的可能范围内（均值 ± 8 个标准差够宽）。
  const [authoredId] = authoredIds.filter((id) => [...place.flat.rows.values()].some((r) => r.parent === id && r.regionLevel === undefined));
  const children = [...place.flat.rows].filter(([, r]) => r.parent === authoredId && r.regionLevel === undefined).map(([id]) => id);
  const base = controls.rows[authoredId].anchorElevationM;
  const span = Math.abs(fields.tractLevel.mean) + 8 * fields.tractLevel.sd;
  for (const id of children) {
    if (!a[id]) continue;
    for (const g of [a, b]) assert.ok(Math.abs(g[id].anchorElevationM - base) <= span || g[id].anchorElevationM === fields.range.min || g[id].anchorElevationM === fields.range.max, `${id} ${g[id].anchorElevationM} 距作者值 ${base} 超出一级偏差的范围`);
  }
});

test('R10-9.3 同一加载器：把偏离行并进地点表的 generated 节后经 loadWorld 加载——零错误、有效值取偏离行、作者行的其余维度不变', () => {
  const r = run();
  const tmp = testTempRoot('gen-world-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, readFileSync(join(ROOT, DIMS, f), 'utf8'));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify(applyGenerated(JSON.parse(readFileSync(join(ROOT, DIMS, 'place.json'), 'utf8')), r.generated)));
    const loaded = loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
    assert.equal(loaded.ok, true, loaded.errors.slice(0, 3).map((e) => `${e.code} ${e.row} ${e.got}`).join(' | '));
    const flat = loaded.tables.get('place').flat.rows;
    for (const [id, row] of Object.entries(r.generated)) {
      assert.equal(flat.get(id).anchorElevationM, row.anchorElevationM, id);
      // 作者行的其余维度（父、坐标、地形）仍是原值。
      assert.deepEqual(flat.get(id).parent, place.flat.rows.get(id).parent);
      assert.deepEqual(flat.get(id).coord, place.flat.rows.get(id).coord);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('R10-2.12 水体：水体行已在表里（附表给了足迹），足迹划得出，水体阶段补出 runoffCoef、容量、面积、汇水进偏离行，没有水体阶段缺口、没有 pending', () => {
  const r = run();
  const waterIds = [...place.flat.rows].filter(([, d]) => Array.isArray(d.classes) && d.classes.includes(world.rules.gen.roleWaterbody)).map(([id]) => id).sort();
  assert.ok(waterIds.length > 0);
  assert.deepEqual(r.pending, []); // 水体行都在表里，补缺走偏离行，不再有"转换前不在表里"的待转换行
  assert.deepEqual(r.deferred.filter((d) => d.stage === 'gstage_water'), []);
  for (const id of waterIds) {
    const g = r.generated[id];
    assert.ok(g !== undefined && g.runoffCoef >= 0 && g.runoffCoef <= 1, id);
    for (const k of ['capacityL', 'surfaceM2', 'catchmentM2']) assert.ok(Number.isFinite(g[k]) && g[k] > 0, `${id}.${k}`);
  }
});

test('R10-2.17 水体足迹补缺：水体行已有作者足迹输入（河的折线栅格、海的矩形并、湖的种子与目标面积），没有 gstage_waterfoot 缺口、不另出 coord、boundary、targetAreaM2 的提案', () => {
  const r = run();
  assert.deepEqual(r.deferred.filter((d) => d.stage === 'gstage_waterfoot'), []);
  for (const [id, g] of Object.entries(r.generated)) for (const k of ['coord', 'targetAreaM2', 'boundary']) if (place.flat.rows.get(id) !== undefined && place.flat.rows.get(id)[k] !== undefined) assert.equal(g[k], undefined, `${id}.${k} 作者已写，不得出偏离`);
});

test('R10-7.12 手写建筑行缺维度的补缺经 generateFill 接线：作者输入里挂 comp_facility 的建筑行缺墙厚、平面格数、层数时补出（by gstage_siteform），作者写了的不动，补出的房子经 planBlueprint 展开成细格；房间行只列缺口', () => {
  const geo = geoOf();
  const FORM = 'bldform_river_house'; // 真实词表里的形制：walled 真、wallThicknessDefaultM 0.4、两个房间
  geo.authored.set('loc_bld_fill_a', { parent: WORLD_ROOT, classes: ['comp_facility'], form: FORM });
  geo.authored.set('loc_bld_fill_b', { parent: WORLD_ROOT, classes: ['comp_facility'], form: FORM, planCells: { widthCells: 12, depthCells: 8 }, wallThicknessM: 0.5, storeys: 2 });
  const r = generateFill(world, { worldSeed: 'seed_one', genesisMinute: 0, geo });
  const a = r.pending.find((p) => p.id === 'loc_bld_fill_a');
  assert.equal(a.by, 'gstage_siteform');
  assert.equal(a.dims.wallThicknessM, world.vocab.index.get(FORM).entry.wallThicknessDefaultM);
  assert.ok(Number.isInteger(a.dims.storeys) && a.dims.storeys >= 1);
  // 补出的房子必须能展开成细格：planBlueprint 的 ok 为真，且有格。
  const rules = blueprintRulesFrom(world.rules, world.env.units);
  const bp = planBlueprint({ form: world.vocab.index.get(FORM).entry, planCells: a.dims.planCells, storeys: a.dims.storeys, wallThicknessM: a.dims.wallThicknessM, facing: 0 }, rules);
  assert.equal(bp.ok, true);
  assert.ok(bp.cells.length > 0);
  // 三项作者都写了的行没有提案。
  assert.equal(r.pending.some((p) => p.id === 'loc_bld_fill_b' && p.by === 'gstage_siteform'), false);
  // 房间行：作者没写房间行，蓝图里每一间（形制的房间表逐层照搬到上面各层）都列缺口，只列、不造行。
  const all = r.deferred.filter((d) => d.stage === 'gstage_siteform' && d.id === 'loc_bld_fill_a');
  assert.deepEqual(all.map((d) => d.reason).sort(), ['room_rows_unbuilt', 'storeys_max_unchecked']); // 层数是域上限夹出的，另记缺口（修改轮 M5）
  const gaps = all.filter((d) => d.reason === 'room_rows_unbuilt');
  assert.equal(gaps[0].gaps.length, bp.rooms.length);
  assert.ok(bp.rooms.length >= world.vocab.index.get(FORM).entry.rooms.length);
  // 同种子同结果。
  assert.equal(JSON.stringify(r), JSON.stringify(generateFill(world, { worldSeed: 'seed_one', genesisMinute: 0, geo })));
});
