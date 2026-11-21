// 卷十 R10-2.6（场沿包含树逐级加偏差）、R10-1.7（手写优先、生成补缺）、R10-9.2（来源标记）、A10-1.2（同种子逐字节相同、遍历次序无关）：
// 自然量阶段 genFields 与写回器 writeback 的行为测试。几何与分布都不抄仓库此刻的数：期望值在测试里按卷文公式独立重算——
// 偏差抽取对象 = instanceIdOf(idslot_fielddev, a, f.slot, genesisMinute)（卷十 R10-12.1：五样成分的 sha256，取前一半十六进制位，前缀 fielddev_），
// 值 = 钳到 range（Σ 链上各层偏差）；偏差由 drawByKey(种子, gen_fields, 对象, 0, site_gen_fields_dev, 分布) 取（卷二 :336）；
// 求和与钳位用 4 位定点整数（偏差都是 4 位小数，乘 10000 取整相加，不经浮点累加）。只跑不推进世界的纯函数小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { drawByKey } from '../../server-plugin/kernel/sample.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { genFields } from '../../server-plugin/kernel/gen/fields.mjs';
import { writeback } from '../../server-plugin/kernel/gen/writeback.mjs';
import { ROOT } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const world = loadWorld(ROOT);
assert.equal(world.ok, true);

const SEED = 'seed_one';
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const objectId = (a, slot) => { const d = sha([SEED, 'idslot_fielddev', a, '0', String(slot)].join('|')); return `fielddev_${d.slice(0, d.length / 2)}`; };
const draw4 = (a, slot, dist) => Math.round(drawByKey(SEED, 'gen_fields', objectId(a, slot), 0, 'site_gen_fields_dev', dist) * 10000);

// 测试自己的生成场条目与词表：一个目标（控制海拔），层级偏差分布自定，range 自定（宽窄各一份）。
const mkVocab = (field) => ({
  families: new Map([
    ['gfield', { entries: { gfield_t: field } }],
    ['idslot', { entries: { idslot_fielddev: { kind: null, parentKinds: ['place'], clocked: false } } }],
    ['juris', { entries: { juris_world: {}, juris_province: {}, juris_county: {} } }],
  ]),
  index: new Map([['idslot_fielddev', { family: 'idslot', prefix: 'idslot_', entry: { kind: null, parentKinds: ['place'], clocked: false } }]]),
});
const DIST = { world: { dist: 'normal', mean: 300, sd: 100 }, province: { dist: 'uniform', min: -200, max: 200 }, county: { dist: 'triangular', min: -50, mode: 0, max: 80 }, tract: { dist: 'uniform', min: -20, max: 20 } };
const FIELD = { target: 'anchorElevationM', slot: 0, levels: { juris_world: DIST.world, juris_province: DIST.province, juris_county: DIST.county }, tractLevel: DIST.tract, range: { min: 0, max: 3000 } };
const DIMS = world.tables.get('place').doc.dimensions;

// 世界根 w、省 p1 p2、郡 c1 c2（p1 下）、c3（p2 下）、站点 s1（c1 下）、s2（c2 下）；站点没有层级（取 tractLevel）。
const row = (parent, regionLevel, extra = {}) => ({ parent, classes: [], ...(regionLevel ? { regionLevel } : {}), ...extra });
const TREE = () => new Map([
  ['loc_w', row(null, 'juris_world')], ['loc_p1', row('loc_w', 'juris_province')], ['loc_p2', row('loc_w', 'juris_province')],
  ['loc_c1', row('loc_p1', 'juris_county')], ['loc_c2', row('loc_p1', 'juris_county')], ['loc_c3', row('loc_p2', 'juris_county')],
  ['loc_s1', row('loc_c1')], ['loc_s2', row('loc_c2')],
]);
const run = (effective, field = FIELD, opts = {}) => {
  const vocab = mkVocab(field);
  const rows = buildGenRows(effective, { index: new Map() }, opts.input);
  return genFields({ table: 'place', stage: 'gstage_fields', worldSeed: SEED, genesisMinute: 0, vocab, rows, dims: DIMS, downhill: opts.downhill, elevationDim: opts.elevationDim });
};
const valueOf = (props, id) => props.find((p) => p.id === id).dims.anchorElevationM;

test('R10-2.6：值 = 钳（Σ 祖先链含自己的偏差）；站点取 tractLevel、郡取郡一级、世界根取世界一级（独立按公式重算，4 位定点相加）', () => {
  const props = run(TREE());
  // s1 的链：s1（tract）、c1（county）、p1（province）、w（world）。
  const expected = draw4('loc_s1', 0, DIST.tract) + draw4('loc_c1', 0, DIST.county) + draw4('loc_p1', 0, DIST.province) + draw4('loc_w', 0, DIST.world);
  const clamped = Math.min(Math.max(expected, 0), 30000000);
  assert.equal(Math.round(valueOf(props, 'loc_s1') * 10000), clamped);
  // 世界根自己：链只有它。
  assert.equal(Math.round(valueOf(props, 'loc_w') * 10000), Math.min(Math.max(draw4('loc_w', 0, DIST.world), 0), 30000000));
});

test('R10-2.6：同省的地点共享省一级偏差——同省两郡的值之差恰是两郡一级偏差之差（省与世界一级的偏差相消）', () => {
  const props = run(TREE());
  const diff = Math.round(valueOf(props, 'loc_c1') * 10000) - Math.round(valueOf(props, 'loc_c2') * 10000);
  assert.equal(diff, draw4('loc_c1', 0, DIST.county) - draw4('loc_c2', 0, DIST.county));
});

test('R10-1.7：作者已有值的行不出提案；作者值是它之下各级的基准（值 = 作者值 + 自己各级偏差），不被覆盖', () => {
  const eff = TREE();
  eff.set('loc_c2', { ...eff.get('loc_c2'), anchorElevationM: 500 });
  const props = run(eff);
  assert.equal(props.some((p) => p.id === 'loc_c2'), false);
  // s2 在 c2 下：作者值 500 取代 c2 之上各级偏差，s2 自己一级的偏差照加。
  assert.equal(Math.round(valueOf(props, 'loc_s2') * 10000), 5000000 + draw4('loc_s2', 0, DIST.tract));
  // 作者值不在的子树（c1 下的 s1）不受影响，仍按整条链算。
  assert.equal(Math.round(valueOf(props, 'loc_s1') * 10000), draw4('loc_s1', 0, DIST.tract) + draw4('loc_c1', 0, DIST.county) + draw4('loc_p1', 0, DIST.province) + draw4('loc_w', 0, DIST.world));
});

test('钳到 range：窄取值域下超出者取边界、范围内不变（边界两端各一例）', () => {
  const narrow = { ...FIELD, range: { min: 290, max: 310 } };
  const props = run(TREE(), narrow);
  for (const p of props) assert.ok(p.dims.anchorElevationM >= 290 && p.dims.anchorElevationM <= 310, `${p.id} ${p.dims.anchorElevationM}`);
  assert.ok(props.some((p) => p.dims.anchorElevationM === 290 || p.dims.anchorElevationM === 310), '窄域里至少有一行落在边界上');
});

test('A10-1.2：同种子两次逐字节相同；打乱行的遍历次序仍相同；多加一个兄弟、一棵子树不改已有各行的值（只依赖祖先链与场条目）', () => {
  const a = JSON.stringify(run(TREE()));
  assert.equal(a, JSON.stringify(run(TREE())));
  const shuffled = new Map([...TREE()].reverse());
  assert.equal(a, JSON.stringify(run(shuffled)));
  const bigger = TREE();
  bigger.set('loc_c4', row('loc_p1', 'juris_county'));
  bigger.set('loc_s9', row('loc_c4'));
  const withMore = run(bigger);
  for (const p of JSON.parse(a)) assert.equal(valueOf(withMore, p.id), p.dims.anchorElevationM, p.id);
});

test('换世界种子值变：种子只改字符，至少有一行的值不同', () => {
  const vocab = mkVocab(FIELD);
  const rows = buildGenRows(TREE(), { index: new Map() });
  const a = genFields({ table: 'place', stage: 'gstage_fields', worldSeed: 'seed_one', genesisMinute: 0, vocab, rows, dims: DIMS });
  const b = genFields({ table: 'place', stage: 'gstage_fields', worldSeed: 'seed_two', genesisMinute: 0, vocab, rows, dims: DIMS });
  assert.ok(a.some((p, i) => p.dims.anchorElevationM !== b[i].dims.anchorElevationM));
});

test('只给区域足迹行补：建筑足迹行（作者输入标明）不出提案；挂组件类才适用的目标只写到挂它的行（水体行）', () => {
  const eff = TREE();
  const props = run(eff, FIELD, { input: { buildingIds: ['loc_s2'] } });
  assert.equal(props.some((p) => p.id === 'loc_s2'), false);
  assert.equal(props.some((p) => p.id === 'loc_s1'), true);
  // runoffCoef 的表头写 byClass:comp_waterbody：只有挂该组件类的行是对象。
  const runoff = { ...FIELD, target: 'runoffCoef', range: { min: 0, max: 1 }, levels: {}, tractLevel: { dist: 'uniform', min: 0.1, max: 0.2 } };
  const eff2 = TREE();
  eff2.set('loc_lake', { parent: 'loc_c1', classes: ['comp_tract', 'comp_waterbody'] });
  const props2 = run(eff2, runoff);
  assert.deepEqual(props2.map((p) => p.id), ['loc_lake']);
  const v = Math.round(props2[0].dims.runoffCoef * 10000);
  assert.equal(v, draw4('loc_lake', 0, runoff.tractLevel));
});

test('R10-2.6 高低次序：生成值夹进作者上下界并随链单调不增；作者值不动；作者值之间次序错即 E-GEN-ROW-INVALID', () => {
  // 链 s1 → s2（都生成）→ 上游作者 c1 之外：用三行链 [loc_s1, loc_s2, loc_c3]，其中 loc_c3 作者 0、loc_s1 作者 400。
  const eff = TREE();
  eff.set('loc_s1', { ...eff.get('loc_s1'), anchorElevationM: 400 });
  eff.set('loc_c3', { ...eff.get('loc_c3'), anchorElevationM: 0 });
  const props = run(eff, FIELD, { downhill: [{ dim: 'anchorElevationM', chain: ['loc_s1', 'loc_s2', 'loc_c3'] }] });
  const s2 = valueOf(props, 'loc_s2');
  assert.ok(s2 <= 400 && s2 >= 0, `s2 ${s2} 须在作者上下界 [0, 400] 内`);
  // 作者次序错：上游 100、下游 400。
  const bad = TREE();
  bad.set('loc_s1', { ...bad.get('loc_s1'), anchorElevationM: 100 });
  bad.set('loc_c3', { ...bad.get('loc_c3'), anchorElevationM: 400 });
  assert.throws(() => run(bad, FIELD, { downhill: [{ dim: 'anchorElevationM', chain: ['loc_s1', 'loc_s2', 'loc_c3'] }] }), (e) => e.code === 'E-GEN-ROW-INVALID');
  // 随链单调不增（三个生成行）：把 s1、s2 都留给生成，上游给大、下游给小的作者端点。
  const mono = TREE();
  mono.set('loc_c3', { ...mono.get('loc_c3'), anchorElevationM: 50 });
  mono.set('loc_p2', { ...mono.get('loc_p2'), anchorElevationM: 900 });
  const p3 = run(mono, FIELD, { downhill: [{ dim: 'anchorElevationM', chain: ['loc_p2', 'loc_s1', 'loc_s2', 'loc_c3'] }] });
  assert.ok(valueOf(p3, 'loc_s1') >= valueOf(p3, 'loc_s2') && valueOf(p3, 'loc_s2') >= 50 && valueOf(p3, 'loc_s1') <= 900);
});

test('R10-9.2：提案带来源标记 by（阶段代号）与 seedKey（64 位十六进制，等于该行首个场偏差抽取点的骰值键 sha256）', () => {
  const props = run(TREE());
  const key = sha(['seed_one', 'gen_fields', objectId('loc_s1', 0), '0', 'site_gen_fields_dev'].join('|'));
  const p = props.find((x) => x.id === 'loc_s1');
  assert.equal(p.by, 'gstage_fields');
  assert.equal(p.seedKey, key);
  assert.match(p.seedKey, /^[0-9a-f]{64}$/);
});

// ---------- 写回器 ----------
const writeCtx = (proposals, over = {}) => ({
  table: 'place', stage: 'gstage_fields', stageEntry: { writesKinds: ['place'] }, proposals, rows: buildGenRows(TREE(), { index: new Map() }),
  tableIds: new Set(TREE().keys()), dims: DIMS, env: world.env, genesisMinute: 0, generated: {}, ...over,
});

test('写回器：提案落成 generated 节偏离行 {维度值, generated: {by, seedKey, at}}，只写整值；同一行后行阶段只补没写过的', () => {
  const p = { table: 'place', id: 'loc_s1', dims: { anchorElevationM: 123.4 }, by: 'gstage_fields', seedKey: 'k'.repeat(64) };
  const out = writeback(writeCtx([p]));
  assert.deepEqual(out.generated.loc_s1, { anchorElevationM: 123.4, generated: { by: 'gstage_fields', seedKey: 'k'.repeat(64), at: 0 } });
  assert.deepEqual(out.pending, []);
  // 先行阶段已写的偏离行：后行阶段补另一维时记先写的阶段，已写的维度再写即拒。
  const second = { ...p, dims: { forestCover: 0.5 }, by: 'gstage_water' };
  const out2 = writeback(writeCtx([second], { generated: out.generated, stage: 'gstage_water' }));
  assert.equal(out2.generated.loc_s1.generated.by, 'gstage_fields');
  assert.equal(out2.generated.loc_s1.forestCover, 0.5);
  assert.throws(() => writeback(writeCtx([p], { generated: out.generated })), (e) => e.code === 'E-GEN-ROW-INVALID');
});

test('写回器 R10-1.7：提案的维度作者行上已有值即 E-GEN-OVERRIDE-AUTHORED；写由格派生的量、未登记维度、越域值、阶段未声明的实体类都是 E-GEN-ROW-INVALID', () => {
  const eff = TREE();
  eff.set('loc_s1', { ...eff.get('loc_s1'), anchorElevationM: 5 });
  const rows = buildGenRows(eff, { index: new Map() });
  const mk = (dims, over = {}) => writeCtx([{ table: 'place', id: 'loc_s1', dims, by: 'gstage_fields', seedKey: 'k'.repeat(64) }], over);
  assert.throws(() => writeback({ ...mk({ anchorElevationM: 7 }), rows }), (e) => e.code === 'E-GEN-OVERRIDE-AUTHORED');
  // 由格派生的量（表头标 derived：形心、层号范围、地下深度……）一律不写（R10-9.12）。areaM2、elevationM、skyExposure 现表头还是旧存储列，G5b 改派生后同样被拒。
  assert.throws(() => writeback(mk({ centroid: { x: 1, y: 1 } })), (e) => e.code === 'E-GEN-ROW-INVALID');
  assert.throws(() => writeback(mk({ zRange: { zMin: 0, zMax: 1 } })), (e) => e.code === 'E-GEN-ROW-INVALID');
  assert.throws(() => writeback(mk({ noSuchDim: 1 })), (e) => e.code === 'E-GEN-ROW-INVALID');
  assert.throws(() => writeback(mk({ anchorElevationM: 9001 })), (e) => e.code === 'E-GEN-ROW-INVALID');
  assert.throws(() => writeback(mk({ anchorElevationM: 1 }, { stageEntry: { writesKinds: [] } })), (e) => e.code === 'E-GEN-ROW-INVALID');
  assert.throws(() => writeback(writeCtx([{ table: 'place', id: 'loc_nope', dims: { anchorElevationM: 1 }, by: 'gstage_fields', seedKey: 'k'.repeat(64) }])), (e) => e.code === 'E-GEN-ROW-INVALID');
});
