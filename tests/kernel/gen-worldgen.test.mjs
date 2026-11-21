// 卷十 世界创建事务里 worldgen 相的生成补缺（R10-1.1 流程是数据、R10-1.7 手写优先生成补缺、R10-9.2/9.3 来源标记与同一加载器、A10-1.2 确定性、
// R10-2.6 自然量、R10-2.12 水体）在真实世界数据上的整体行为：真实地点表 + world/geo 的作者输入（控制海拔、水体行、高低次序、建筑清单）。
// 期望不抄仓库此刻的计数：每条都从数据本身（作者输入文件、加载后的表）推出该有什么。全规模世界创建的推进与性能不在本机测（待腾讯云）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { readGeoInputs } from '../../server-plugin/kernel/load/geo-inputs.mjs';
import { generateFill } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { applyGenerated } from '../../server-plugin/kernel/gen/writeback.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const world = loadWorld(ROOT);
assert.equal(world.ok, true);
const place = world.tables.get('place');
const WORLD_ROOT = [...place.flat.rows].find(([, r]) => r.parent === null)[0];
const geoOf = () => readGeoInputs(ROOT, { rootId: WORLD_ROOT, elevationDim: 'anchorElevationM' });
const run = (seed = 'seed_one', geo = geoOf()) => generateFill(world, { worldSeed: seed, genesisMinute: 0, geo });
const controls = JSON.parse(readFileSync(join(ROOT, 'world/geo/elevation-controls.json'), 'utf8'));
const authoredIds = Object.keys(controls.rows);

test('R10-1.1：流程来自 gstage 词表条目——自然量排在水体之前，没有写死的阶段清单', () => {
  const r = run();
  assert.deepEqual(r.plan.map((s) => s.phase), ['worldgen', 'worldgen']);
  const order = r.plan.map((s) => s.stage);
  const fields = world.vocab.index.get(order[0]).entry;
  const water = world.vocab.index.get(order[1]).entry;
  assert.deepEqual(water.after, [order[0]]);
  assert.equal(fields.generator !== water.generator, true);
});

test('R10-1.7 手写优先：作者给了控制海拔的行（数据卡里每一行）一条偏离行都不出；其余区域足迹行各恰一条，值在 gfield 的 range 内', () => {
  const r = run();
  for (const id of authoredIds) {
    assert.equal(Object.hasOwn(r.generated, id), false, `${id} 作者已有值，不得出偏离行`);
    assert.equal(r.pending.some((p) => p.id === id && p.dims.anchorElevationM !== undefined), false);
  }
  const range = world.vocab.families.get('gfield').entries.gfield_control_elevation.range;
  const geo = geoOf();
  const buildings = new Set(geo.buildingIds);
  const expected = [...place.flat.rows.keys()].filter((id) => !buildings.has(id) && !authoredIds.includes(id));
  assert.deepEqual(Object.keys(r.generated).sort(), expected.sort());
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

test('R10-2.12 水体：作者输入里的水体行（转换前不在表里）补 runoffCoef 进 pending；足迹还划不出（真实世界没有格空间表）时容量、面积、汇水进 deferred 带原因，不编不借', () => {
  const r = run();
  const geo = geoOf();
  const waterIds = [...geo.authored].filter(([, d]) => Array.isArray(d.classes) && d.classes.includes(world.rules.gen.roleWaterbody)).map(([id]) => id).sort();
  assert.ok(waterIds.length > 0);
  assert.deepEqual(r.pending.map((p) => p.id).sort(), waterIds);
  for (const p of r.pending) assert.ok(p.dims.runoffCoef >= 0 && p.dims.runoffCoef <= 1, p.id);
  assert.deepEqual(r.deferred.map((d) => d.id).sort(), waterIds);
  // 流水（河）有水深规则行：只缺足迹；静水（海，flowing 假）没有规则行——水深不借河的顶替，整体缺口留着（water_rule_missing）。
  for (const d of r.deferred) {
    assert.equal(d.reason, world.vocab.index.get(geo.authored.get(d.id).waterKind).entry.flowing === true ? 'footprint_unknown' : 'water_rule_missing');
    assert.deepEqual(d.gaps.slice().sort(), ['capacityL', 'catchmentM2', 'surfaceM2']);
  }
  assert.ok(r.deferred.some((d) => d.reason === 'water_rule_missing') && r.deferred.some((d) => d.reason === 'footprint_unknown'));
});
