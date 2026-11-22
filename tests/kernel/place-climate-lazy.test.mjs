// 性能卡"气候输入惰性上行"（上格收尾 Opus 核 11-24 提出，docs/审查/上格收尾-Opus只核-1124.md 第 7 节）：
// placeClimateInput 沿包含树惰性上行（卷二十 §2.7 :335 weatherCell = nearest(rel_contains, 挂 comp_weather_cell)），足迹量（elevationM、zRange、区格列表、可及水体类）读到才求（卷五 §4.1.3 规则 13）。
// 读数须与旧算法（对自身与全部祖先逐个 placeView 再找最近的单元）逐位相同；"没读到不求值"用高度场对 terrain 条目的查询记录观察（高度场每个区格都要查所属行的 terrain 条目，
// 世界规模无关，只比较两条路径各自的查询次数与有无），不在内核里加测试专用分支。夹具与 item-rot-real.test.mjs 同一个小格世界（垄渠郡挂太原气候单元，足迹与海拔手算得出）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld } from './item-world.mjs';
import { miniClimatePlaceDoc } from './mini-place-world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { placeView, placeFootprint, placeLatitude, placeClimateInput, isOffstage } from '../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const COUNTY = 'loc_county_xichui_longqu'; // 挂气候单元的郡（真实世界起始地区）
const CHILD = 'loc_hw';

const f = baseFixture();
f.items = {};
f.editPlaceDoc = (doc) => miniClimatePlaceDoc(doc, { place: COUNTY, child: CHILD });
f.editOrgDoc = (doc) => { doc.rows = {}; };
const loaded = loadItemWorld(f);
assert.ok(loaded.ok, JSON.stringify(loaded.messages) + JSON.stringify(loaded.errors));
const W = loaded.world;
const state = { clock: { minute: 0, seq: 0 } };

// 一台新引擎（自己的 terrain 查询记录、自己的足迹计划缓存）：vocab.index 包一层，只记 terrain 条目查询。
function engine() {
  const seen = [];
  const index = new Proxy(W.vocab.index, {
    get(target, prop) {
      if (prop === 'get') return (code) => { if (typeof code === 'string' && code.startsWith('terrain_')) seen.push(code); return target.get(code); };
      const v = Reflect.get(target, prop);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const vocab = { families: W.vocab.families, index };
  installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
  const e = { vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'seed_test' } };
  isOffstage(e, state, COUNTY); // 先建足迹计划，之后的查询记录只含高度场的
  seen.length = 0;
  return { e, seen };
}

// 旧算法原样（改前 placeClimateInput 的写法，卷二十 :335）：自身与全部祖先逐个 placeView，取最近的单元，再读维度。
function legacyInput(e, id) {
  const own = placeView(e, state, id);
  const chain = [own, ...own.tree.ancestors.map((a) => placeView(e, state, a))];
  const cellNode = chain.find((n) => n.dims.annualMeanTempC.applicable === true);
  const latitudeDeg = placeLatitude(e, own);
  const val = (v, k) => (v.dims[k] && v.dims[k].known ? v.dims[k].value : undefined);
  if (!cellNode || latitudeDeg === null) return null;
  const cell = Object.fromEntries(['annualMeanTempC', 'tempAmpC', 'diurnalAmpC', 'seasonScheme'].filter((k) => val(cellNode, k) !== undefined).map((k) => [k, val(cellNode, k)]));
  const cellElevationM = val(cellNode, 'elevationM');
  const here = val(own, 'elevationM');
  return { input: { latitudeDeg, cell, cellElevationM, surfaceRefElevationM: here === undefined ? cellElevationM : here, enclosed: val(own, 'enclosed'), underground: val(own, 'underground'), weather: {} } };
}

test('读数与旧算法逐位相同：郡（单元就在自身）与郡下的地点（单元在祖先）', () => {
  for (const id of [COUNTY, CHILD]) {
    const { e } = engine();
    const got = placeClimateInput(e, state, id);
    const want = legacyInput(engine().e, id);
    assert.notEqual(got, null, id);
    assert.equal(typeof got.input.cellElevationM, 'number', id); // 海拔真的读到了，不是两边都未知
    assert.equal(typeof got.input.latitudeDeg, 'number', id);
    assert.deepEqual(got, want, id);
  }
});

test('世界根没有单元：从郡下地点上行，在郡就停，结果与读到世界根无关；读不存在的地点照旧抛', () => {
  const { e } = engine();
  assert.equal(placeClimateInput(e, state, CHILD).input.cellElevationM, placeClimateInput(e, state, COUNTY).input.cellElevationM);
  assert.throws(() => placeClimateInput(e, state, 'loc_no_such_place'), (err) => err.code === 'E-DIM-REF-MISSING');
});

test('足迹量读到才求：形心、面积、区格数不触发高度场；读 elevationM 才查 terrain 条目；读第二次不再求', () => {
  const { e, seen } = engine();
  const fp = placeFootprint(e, state, COUNTY);
  assert.ok(fp.cellCount > 0 && fp.areaM2 > 0 && typeof fp.centroid.y === 'number');
  assert.equal(seen.length, 0, '形心、面积、区格数不该求高度场');
  assert.equal(typeof fp.elevationM, 'number');
  const after = seen.length;
  assert.ok(after > 0, '读 elevationM 应求高度场');
  assert.deepEqual(fp.zRange, fp.zRange);
  assert.equal(seen.length, after, '同一足迹的 zRange 复用已求的高度场');
});

test('placeView 的 elevationM、zRange 同样按需：读别的维度不求高度场，读到才求，值与足迹一致', () => {
  const { e, seen } = engine();
  const view = placeView(e, state, COUNTY);
  const base = seen.length; // 出口读区格代表格（regionCellPos）本来就要高度，只比较读 elevationM 前后
  assert.equal(view.dims.centroid.known, true);
  assert.equal(seen.length, base);
  assert.equal(view.dims.elevationM.known, true);
  assert.equal(view.dims.elevationM.value, view.footprint.elevationM);
  assert.deepEqual(view.dims.zRange.value, view.footprint.zRange);
});

test('气候输入不求整条祖先链：查询次数少于对自身与全部祖先逐个 placeView 的旧算法，且有高度场求值（海拔确实读了）', () => {
  const lazy = engine();
  placeClimateInput(lazy.e, state, CHILD);
  const eager = engine();
  legacyInput(eager.e, CHILD);
  assert.ok(lazy.seen.length > 0);
  assert.ok(lazy.seen.length < eager.seen.length, `${lazy.seen.length} vs ${eager.seen.length}`);
});
