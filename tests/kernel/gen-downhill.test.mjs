// 卷十 R10-2.6 高低次序（李白 11-21 裁定甲：生成值投影到满足次序、不拒收）与加载期作者覆盖核对（R10-1.7、E-GEN-OVERRIDE-AUTHORED）、planFootprints 不物化区格列表：
// ① 生成值违反次序 → 被投影修正，并经内核报告出口记 W-GEN-DOWNHILL-PROJECTED（改了哪行、从多少到多少）；
// ② 整条下游链（行上 downstream）沿下游控制海拔不上坡，不只设定点名的几处；
// ③ 作者手写值互相冲突 → 报错拒收，不改作者值；
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

test('整条下游链沿下游不上坡：行上 downstream 连成的链，生成的控制海拔单调不增、不低于下游作者端点；改了的值逐条记 W-GEN-DOWNHILL-PROJECTED', () => {
  const raw = gen(base());
  const { out, logs } = capture(() => gen(base(), { elevationDim: EL }));
  const ids = ['loc_r1', 'loc_r2', 'loc_r3'];
  assert.ok(val(out, 'loc_r1') >= val(out, 'loc_r2') && val(out, 'loc_r2') >= val(out, 'loc_r3') && val(out, 'loc_r3') >= 10);
  const changed = ids.filter((id) => val(raw, id) !== val(out, id));
  assert.deepEqual(logs.map((l) => l.fields.row).sort(), changed);
  for (const l of logs) {
    assert.equal(l.code, 'W-GEN-DOWNHILL-PROJECTED');
    assert.equal(l.fields.from, val(raw, l.fields.row));
    assert.equal(l.fields.to, val(out, l.fields.row));
  }
  // 手算这个种子下原始值是否真违反了次序（否则本例没测到投影）：违反则至少有一条日志。
  const violated = val(raw, 'loc_r1') < val(raw, 'loc_r2') || val(raw, 'loc_r2') < val(raw, 'loc_r3') || val(raw, 'loc_r3') < 10;
  assert.equal(logs.length > 0, violated);
});

test('已违反次序的构造：上游行值被作者压低下游更高的情形下，下游被夹到上游值，日志记 from、to', () => {
  const eff = base();
  eff.set('loc_r1', { ...eff.get('loc_r1'), [EL]: 20 });
  eff.set('loc_r4', { ...eff.get('loc_r4'), [EL]: 5 });
  const raw = gen(eff);
  const { out, logs } = capture(() => gen(eff, { elevationDim: EL }));
  assert.ok(val(out, 'loc_r2') <= 20 && val(out, 'loc_r3') <= val(out, 'loc_r2') && val(out, 'loc_r3') >= 5);
  for (const id of ['loc_r2', 'loc_r3']) if (val(raw, id) > 20) assert.equal(logs.some((l) => l.fields.row === id), true, id);
});

test('作者手写值互相冲突（下游比上游高）：报 E-GEN-ROW-INVALID 拒收，不改作者值', () => {
  const eff = base();
  eff.set('loc_r1', { ...eff.get('loc_r1'), [EL]: 5 });
  assert.throws(() => gen(eff, { elevationDim: EL }), (e) => e.code === 'E-GEN-ROW-INVALID');
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

test('跨链作者值冲突：loc_x 在一条链上要不低于作者 500（下游端）、在另一条链上要不高于作者 400（上游端）——投影不收敛，报 E-GEN-ROW-INVALID，不静默返回', () => {
  const eff = base();
  eff.set('loc_x', { parent: 'loc_w', classes: [] });
  eff.set('loc_a', { parent: 'loc_w', classes: [], [EL]: 500 });
  eff.set('loc_b', { parent: 'loc_w', classes: [], [EL]: 400 });
  const downhill = [{ dim: EL, chain: ['loc_x', 'loc_a'] }, { dim: EL, chain: ['loc_b', 'loc_x'] }];
  assert.throws(() => gen(eff, { downhill }), (e) => e.code === 'E-GEN-ROW-INVALID' && /conflict across chains/.test(e.message));
});
