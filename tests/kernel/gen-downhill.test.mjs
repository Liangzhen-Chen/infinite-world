// 卷十 R10-2.18 高低次序（李白 11-21 裁定：生成值投影到满足次序、不拒收；封卷后勘误 1121k16 的 gstage_order，gen/order.mjs）与加载期作者覆盖核对（R10-1.7、E-GEN-OVERRIDE-AUTHORED）、planFootprints 不物化区格列表：
// ① 生成值违反次序 → 被投影修正，并经内核报告出口记 W-GEN-DOWNHILL-PROJECTED（改了哪行、从多少到多少）；
// ② 整条下游链（作者写的行上 downstream）沿下游控制海拔不上坡，不只设定点名的几处；
// ③ 作者手写值互相冲突 → E-GEN-ORDER-CONFLICT 拒收，不改作者值；
// ④ 同 id 的 generated 行与作者行写了同一维度 → 加载 E-GEN-OVERRIDE-AUTHORED；
// ⑤ planFootprints 传 withCells 假时各行 regionCells 为 null。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { planFootprints } from '../../server-plugin/kernel/place.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { genFields } from '../../server-plugin/kernel/gen/fields.mjs';
import { genOrder } from '../../server-plugin/kernel/gen/order.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const world = loadWorld(ROOT);
assert.equal(world.ok, true);
const DIMS = world.tables.get('place').doc.dimensions;
const EL = 'anchorElevationM';
const FIELD = { target: EL, slot: 0, levels: { juris_world: { dist: 'uniform', min: 0, max: 1000 } }, tractLevel: { dist: 'uniform', min: -300, max: 300 }, range: { min: 0, max: 3000 } };
const vocab = {
  families: new Map([['gfield', { entries: { gfield_t: FIELD } }], ['idslot', { entries: { idslot_fielddev: { kind: null, parentKinds: ['place'], clocked: false } } }], ['juris', { entries: { juris_world: {} } }]]),
  index: new Map([['idslot_fielddev', { family: 'idslot', prefix: 'idslot_', entry: { kind: null, parentKinds: ['place'], clocked: false } }]]),
};
const WET = ['comp_tract', 'comp_waterbody'];
const base = () => new Map([
  ['loc_w', { parent: null, classes: [], regionLevel: 'juris_world' }],
  ['loc_r1', { parent: 'loc_w', classes: WET, downstream: 'loc_r2' }],
  ['loc_r2', { parent: 'loc_w', classes: WET, downstream: 'loc_r3' }],
  ['loc_r3', { parent: 'loc_w', classes: WET, downstream: 'loc_r4' }],
  ['loc_r4', { parent: 'loc_w', classes: WET, downstream: null, [EL]: 10 }],
]);
const gen = (eff, extra = {}) => genFields({ table: 'place', stage: 'gstage_fields', worldSeed: 'seed_one', genesisMinute: 0, vocab, rows: buildGenRows(eff, { index: new Map() }), dims: DIMS, ...extra });
const val = (props, id) => props.find((p) => p.id === id).dims[EL];
const capture = (fn) => { const logs = []; const prev = useReportSink((r) => logs.push(r)); try { return { out: fn(), logs }; } finally { useReportSink(prev); } };
// 自然量阶段出各行的生成值（不投影），再交 gstage_order 的 genOrder 投影（封卷后勘误 1121k16，R10-2.18；取代原来内嵌在自然量阶段里的投影）。
// 返回投影后的值（没被改的取原生成值）与 genOrder 的结果；作者写了海拔的行（eff 里 EL 有值）是固定值，行上的 downstream 都是作者写的。
const project = (eff, downhill = []) => {
  const raw = gen(eff);
  const merged = new Map(eff);
  for (const p of raw) merged.set(p.id, { ...merged.get(p.id), [EL]: p.dims[EL] });
  const authored = new Set([...eff].filter(([, r]) => r[EL] !== undefined).map(([id]) => id));
  const rows = buildGenRows(merged, { index: new Map() });
  const order = genOrder({ table: 'place', stage: 'gstage_order', rows, elevationDim: EL, roleWaterbody: 'comp_waterbody', downhill, isAuthored: (id, dim) => dim === 'downstream' || (dim === EL && authored.has(id)) });
  const after = raw.map((p) => ({ ...p, dims: { [EL]: (order.proposals.find((q) => q.id === p.id) || p).dims[EL] } }));
  return { raw, after, order };
};

test('整条下游链沿下游不上坡：行上 downstream 连成的链，生成的控制海拔单调不增、不低于下游作者端点；改了的值逐条记 W-GEN-DOWNHILL-PROJECTED', () => {
  const { out, logs } = capture(() => project(base()));
  const { raw, after, order } = out;
  const ids = ['loc_r1', 'loc_r2', 'loc_r3'];
  assert.ok(val(after, 'loc_r1') >= val(after, 'loc_r2') && val(after, 'loc_r2') >= val(after, 'loc_r3') && val(after, 'loc_r3') >= 10);
  const changed = ids.filter((id) => val(raw, id) !== val(after, id));
  assert.deepEqual(logs.map((l) => l.fields.row).sort(), changed);
  assert.deepEqual(order.report.projections.map((p) => p.row), changed, '日志 report.projections 按行 id 升序，恰是改了的行');
  for (const l of logs) {
    assert.equal(l.code, 'W-GEN-DOWNHILL-PROJECTED');
    assert.equal(l.fields.from, val(raw, l.fields.row));
    assert.equal(l.fields.to, val(after, l.fields.row));
  }
  // 手算这个种子下原始值是否真违反了次序（否则本例没测到投影）：违反则至少有一条日志。
  const violated = val(raw, 'loc_r1') < val(raw, 'loc_r2') || val(raw, 'loc_r2') < val(raw, 'loc_r3') || val(raw, 'loc_r3') < 10;
  assert.equal(logs.length > 0, violated);
});

test('已违反次序的构造：上游行值被作者压低下游更高的情形下，下游被夹到上游值，日志记 from、to', () => {
  const eff = base();
  eff.set('loc_r1', { ...eff.get('loc_r1'), [EL]: 20 });
  eff.set('loc_r4', { ...eff.get('loc_r4'), [EL]: 5 });
  const { out, logs } = capture(() => project(eff));
  const { raw, after } = out;
  assert.ok(val(after, 'loc_r2') <= 20 && val(after, 'loc_r3') <= val(after, 'loc_r2') && val(after, 'loc_r3') >= 5);
  for (const id of ['loc_r2', 'loc_r3']) if (val(raw, id) > 20) assert.equal(logs.some((l) => l.fields.row === id), true, id);
});

test('作者手写值互相冲突（下游比上游高）：报 E-GEN-ORDER-CONFLICT 拒收，不改作者值', () => {
  const eff = base();
  eff.set('loc_r1', { ...eff.get('loc_r1'), [EL]: 5 });
  assert.throws(() => project(eff), (e) => e.code === 'E-GEN-ORDER-CONFLICT');
});

test('加载期：同 id 的 generated 行与作者行写了同一维度即 E-GEN-OVERRIDE-AUTHORED；不同维度不报', () => {
  const dir = 'world/ontology/dimensions';
  const text = (f) => readFileSync(join(ROOT, dir, f), 'utf8');
  const doc = JSON.parse(text('place.json'));
  const [id] = Object.keys(doc.rows);
  const load = (genRow) => {
    const tmp = testTempRoot('gen-ovr-');
    try {
      for (const f of readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, text(f));
      writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...doc, generated: { [id]: { ...genRow, generated: { by: 'gstage_fields', seedKey: 'k', at: 0 } } } }));
      return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  };
  const authoredDim = Object.keys(doc.rows[id]).find((k) => Object.hasOwn(doc.dimensions, k) && k !== 'parent');
  assert.ok(authoredDim);
  assert.ok(load({ [authoredDim]: doc.rows[id][authoredDim] }).errors.some((e) => e.code === 'E-GEN-OVERRIDE-AUTHORED'));
  assert.equal(load({ [EL]: 1 }).errors.some((e) => e.code === 'E-GEN-OVERRIDE-AUTHORED'), false);
});

test('planFootprints withCells 假：各行 regionCells 为 null（不物化全树区格列表），面积与相邻照常', () => {
  const eng = { ...world, template: { seed: 'seed_one' } };
  const r = planFootprints(eng, { withCells: false });
  for (const f of Object.values(r.footprints)) assert.equal(f.regionCells, null);
  assert.equal(typeof r.adjacency, 'object');
});

test('跨链作者值冲突：作者次序链 b → x → a 把 b（作者 400）与 a（作者 500）连在一起，上游比下游低——报 E-GEN-ORDER-CONFLICT，不静默返回、不改作者值', () => {
  const eff = base();
  eff.set('loc_x', { parent: 'loc_w', classes: [] });
  eff.set('loc_a', { parent: 'loc_w', classes: [], [EL]: 500 });
  eff.set('loc_b', { parent: 'loc_w', classes: [], [EL]: 400 });
  const downhill = [{ dim: EL, chain: ['loc_x', 'loc_a'] }, { dim: EL, chain: ['loc_b', 'loc_x'] }];
  assert.throws(() => project(eff, downhill), (e) => e.code === 'E-GEN-ORDER-CONFLICT' && /400/.test(e.message) && /500/.test(e.message));
});
