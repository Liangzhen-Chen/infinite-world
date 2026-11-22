// 格子迁移 G9《差分存储、按日生效重派生、alterCells 拒写》卡内测试（对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 46–58 行；待定 5、7、11）。
// 卷文依据：卷五 §3.2 :330（alterCells 签名）、§3.3 :362（唯一写者 grid-diff.mjs）、§4.1 规则 15 :502–:507（差分永久、拒写检查、结构元拒写）、规则 16 :509–:511（两类改写、差分优先）、
// §4.5 规则 6 :745–:747（坠落与挤出）、A5-1.2 :537、A5-5.2 :767；卷二十七 R27-1.15 :321–:324、R27-1.16 :327、A27-1.14 :372、R27-4.6 :555；卷二 :164、:796（dated）。
// 前提都在测试里造（真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表、词表条目写进拷贝；材料取真实行 mat_soil、mat_granite、mat_air）：
//   格空间 w0：12 × 3 区格（区格边长 100 细格，cellM 1 m、storeyM 3 m、里块边长 1000 细格），所有控制点海拔 0、terrain_river 起伏 0，所以地表高处处 0 m、地表层 0：
//   z=0 是地表（mat_soil）、z=−1 土、z≤−2 岩（mat_granite）、z≥1 空气（mat_air）；细格 (x, y, z=1) 是站立层。一栋 6 × 6 小屋 bld_a 锚点 (20, 120, z=0)（外墙厚 1 格，一层，层 ℓ=0 在 z=1）。
//   玩家受控实体与别的个体都用 state.created 的偏离行造（只带 pos），玩家席位边直接写进 state.holdings（持有写者不是本卡的事）；泡半径取真实规则表首值 1，
//   所以席位在区格 (0,1) 时泡是区格 x 0–1、y 0–2（框内的 3 × 3 被外包框截成 2 × 3），区格 (7,1)、(10,1) 在泡外。期望值按卷文手算成字面量（推算写在用例里）。
// 只跑不推进世界的小检查（本机 F 盘）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { installStorage, readPath, writePath } from '../../server-plugin/kernel/storage.mjs';
import { P } from '../../server-plugin/kernel/handles/generated.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { writeDated } from '../../server-plugin/kernel/dated.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { gridView, settleCell, fallCell, extrudeCell } from '../../server-plugin/kernel/place.mjs';
import { alterCells, clearDiffs, diffCellsAmong } from '../../server-plugin/grid-diff.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok); // 先装配命名 struct、定点常数与 sqrt 表（夹具世界的加载校验要读 anchor）
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);
const FIXTURE_ITEM = 'item_test_bench'; // 一件运行期新建的物品（state.created，见 fresh），当"家具"引用目标；真实物品行引用别的地点，夹具世界里不载入

const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
const CELLCLASS = { cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' } };
const TEMPLATE = { gtpl_land: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const FORM = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, defaultMaterials: { wall: 'mat_soil', frame: 'mat_elm', roof: 'mat_straw' }, rooms: [] };
// 格标记：树桩（格材料变土，不再作存量候选格）、焦痕（材料不变）。
const CELLMARKS = { cellmark_stump: { becomesMaterial: 'mat_soil', excludesStock: true }, cellmark_scorch: { becomesMaterial: null, excludesStock: false } };

function load(rows, spaces) {
  const tmp = testTempRoot('grid-diff-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: {} })); // 真实组织行的驻地不在夹具地点表里
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } }; // 真实设施类型表的缺省档要在族里
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = TEMPLATE;
    v.families.bform.entries = { bldform_hut: { ...FORM, facilityTypes: ['fac_house'] }, bldform_shrine: v.families.bform.entries.bldform_shrine };
    v.families.roomrole.entries = {};
    v.families.cellmark.entries = CELLMARKS;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
const building = (parent, anchorXYZ, extra = {}) => row(parent, {
  classes: ['comp_facility'], anchor: { w: 0, x: anchorXYZ[0], y: anchorXYZ[1], z: anchorXYZ[2], coarse: false }, facing: 0,
  form: 'bldform_hut', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, ...extra,
});
const loaded = load({
  loc_root: row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 100, y: 150 }, anchorElevationM: 0 }),
  loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }),
  loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000 }),
  bld_a: building('loc_a', [20, 120, 0]),
}, [{ w: 0, box: { x0: 0, y0: 0, cellsX: 12, cellsY: 3 }, root: 'loc_root' }]);
assert.equal(loaded.ok, true, loaded.text);
const E1 = { tables: loaded.tables, vocab: loaded.vocab, rules: loaded.rules, units: loaded.env.units, template: { seed: 'seed_test' } };
const OWNERS = loaded.owners;

// ---------- 夹具状态与小工具 ----------

const SEAT = 'hk_player_seat'; // 真实规则表 rules.control.seatKind 的值（G9 第一步登记）
const pos = (x, y, z = 1, w = 0) => ({ w, x, y, z, coarse: false });
const seatEdge = (who) => ({ kind: SEAT, holder: who, subject: who, terms: { since: 0, until: null }, grantedBy: null });
// 个体：npc_p 玩家受控，区格 (0,1)；npc_q 同区格不受控；npc_far 区格 (7,1) 不受控；npc_nopos 没有 pos。minute 1234（第 0 日）。
const fresh = (seatHolder = 'npc_p') => ({
  clock: { minute: 1234, seq: 0 },
  created: { npc_p: { props: { pos: pos(50, 150) } }, npc_q: { props: { pos: pos(60, 160) } }, npc_far: { props: { pos: pos(750, 150) } }, npc_nopos: { props: {} }, [FIXTURE_ITEM]: { props: {} } },
  holdings: seatHolder === null ? {} : { [seatHolder]: { hld_1: seatEdge(seatHolder) } },
});
const GRID_FILE = { node: 'alterCells', file: 'grid-diff.mjs' };
const run = (state, fn, ctx = GRID_FILE) => runTransaction(state, ctx, fn);
const dig = (x, y, z, material = 'mat_air') => ({ pos: pos(x, y, z), material, fixture: null, mark: null });
const cellOf = (engine, state, x, y, z) => gridView(engine, state, { w: 0, cells: { x0: x, y0: y, z0: z, x1: x, y1: y, z1: z } }).cells[0];
const withRadius = (engine, r) => ({ ...engine, rules: { ...engine.rules, grid: { ...engine.rules.grid, landSearchRadiusCells: r } } });
const cellsOf = (state) => (state.cells === undefined ? 0 : Object.values(state.cells).flatMap((w) => Object.values(w).flatMap((c) => Object.keys(c))).length);

test('前提：夹具世界加载通过，地表层 0（z=0 土、z=1 空气）、小屋 bld_a 的外墙角在 (20,120,1)', () => {
  const s = fresh();
  assert.equal(cellOf(E1, s, 50, 150, 0).material, 'mat_soil');
  assert.equal(cellOf(E1, s, 50, 150, -2).material, 'mat_granite');
  assert.equal(cellOf(E1, s, 50, 150, 1).material, 'mat_air');
  assert.equal(cellOf(E1, s, 50, 150, 1).standable, true);
  assert.equal(cellOf(E1, s, 20, 120, 1).material, 'mat_granite'); // 外墙角，料取小屋 materialKg 唯一的料
  assert.equal(E1.rules.control.seatKind, SEAT);
});

// ---------- #46 唯一写入口与差分记录 ----------

test('#46 写入：泡内行为者挖地表格，差分记录 {material, fixture, mark, sinceMinute} 落在 cells.<w>.<里块>.<格键>；同事务内 gridView 就读到，邻格与地点行不变', () => {
  const s = fresh();
  const rowBefore = JSON.stringify(dim(E1, s, 'place', 'loc_a', 'areaM2'));
  const r = run(s, (st) => {
    assert.deepEqual(alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_p' } }), { ok: true, reason: null });
    // 同一事务内后续读 gridView 就看到（卷五 §4.1 规则 16"当场生效"）：地表格读空气、气态。
    const c = cellOf(E1, st, 50, 150, 0);
    assert.deepEqual([c.material, c.state], ['mat_air', 'gas']);
  });
  assert.deepEqual(r, { ok: true });
  // 格 (50,150,0)：里块边长 chunkRegionCells × regionCellM ÷ cellM = 10 × 100 ÷ 1 = 1000 细格，x 50、y 150 都在里块 (0,0)，格键 "50:150:0"。
  assert.deepEqual(readPath(s, P.cells('0', '0:0', '50:150:0')), { material: 'mat_air', fixture: null, mark: null, sinceMinute: 1234 });
  assert.equal(cellOf(E1, s, 51, 150, 0).material, 'mat_soil');
  assert.equal(JSON.stringify(dim(E1, s, 'place', 'loc_a', 'areaM2')), rowBefore);
  assert.equal(cellsOf(s), 1);
});

test('#46 唯一写者：别的文件的事务直接 writePath cells.* 一律 E-VIEW-UNDECLARED-WRITE；grid-diff.mjs 写通', () => {
  const s = fresh();
  const rec = { material: 'mat_air', fixture: null, mark: null, sinceMinute: 1234 };
  for (const file of ['effects.mjs', 'kernel/holdings.mjs', 'sys/other.mjs']) {
    assert.deepEqual(run(s, (st) => writePath(st, P.cells('0', '0:0', '50:150:0'), rec), { node: 'x', file }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' }, file);
  }
  assert.equal(s.cells, undefined);
  assert.deepEqual(run(s, (st) => writePath(st, P.cells('0', '0:0', '50:150:0'), rec)), { ok: true });
});

test('#46 gridKey 运行期核：格键所在里块与路径里的里块号不符（把 50:150:0 写进里块 1:0）即 E-PATH-KEYKINDS', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => writePath(st, P.cells('0', '1:0', '50:150:0'), { material: 'mat_air', fixture: null, mark: null, sinceMinute: 0 })), { ok: false, code: 'E-PATH-KEYKINDS' });
});

test('#46 引用核对：material 不是材料行、fixture 不是物品行、mark 不是 cellmark 条目一律 E-DIM-REF-MISSING，整笔回滚（先写的合法项也不留）', () => {
  const ok = dig(50, 150, 0);
  const bad = (change) => ({ w: 0, changes: [ok, { pos: pos(51, 150, 0), material: null, fixture: null, mark: null, ...change }], cause: { actor: 'npc_p' } });
  for (const change of [{ material: 'mat_no_such' }, { material: FIXTURE_ITEM }, { fixture: 'mat_soil' }, { fixture: 'item_no_such' }, { mark: 'mat_soil' }, { mark: 'cellmark_no_such' }]) {
    const s = fresh();
    assert.deepEqual(run(s, (st) => alterCells(E1, st, bad(change))), { ok: false, code: 'E-DIM-REF-MISSING' }, JSON.stringify(change));
    assert.equal(s.cells, undefined, JSON.stringify(change));
  }
});

test('#46 入参形状：空 changes、w 不存在、pos 带 coarse 真、pos.w 与 w 不符、同一格出现两次、格在外包框外、字段不是代号，一律 E-DIM-STRUCT-FIELD，不写', () => {
  const base = { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_p' } };
  const variants = [
    { ...base, changes: [] }, { ...base, changes: 'x' }, { ...base, w: 5 }, { ...base, w: 0.5 }, null,
    { ...base, changes: [{ ...dig(50, 150, 0), pos: { ...pos(50, 150, 0), coarse: true } }] },
    { ...base, changes: [{ ...dig(50, 150, 0), pos: pos(50, 150, 0, 3) }] },
    { ...base, changes: [dig(50, 150, 0), dig(50, 150, 0, 'mat_soil')] },
    { ...base, changes: [dig(1250, 150, 0)] }, // 区格 12 在框外（框 x 0–11）
    { ...base, changes: [dig(50, -1, 0)] }, // 区格 y −1 在框外
    { ...base, changes: [{ ...dig(50, 150, 0), material: 5 }] },
    { ...base, changes: [{ ...dig(50, 150, 0), mark: '' }] },
    { ...base, changes: [{ ...dig(50.5, 150, 0) }] },
  ];
  for (const v of variants) {
    const s = fresh();
    assert.deepEqual(run(s, (st) => alterCells(E1, st, v)), { ok: false, code: 'E-DIM-STRUCT-FIELD' }, JSON.stringify(v));
    assert.equal(s.cells, undefined);
  }
});

test('#46 格标记：becomesMaterial 非空时连同材料一起改（树桩 → 土）；材料不同即冲突 E-DIM-STRUCT-FIELD；becomesMaterial 为空的标记（焦痕）材料不变', () => {
  const s = fresh();
  const stump = { pos: pos(50, 150, 1), material: null, fixture: null, mark: 'cellmark_stump' };
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [stump], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(readPath(s, P.cells('0', '0:0', '50:150:1')), { material: 'mat_soil', fixture: null, mark: 'cellmark_stump', sinceMinute: 1234 });
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ ...stump, material: 'mat_soil' }], cause: { actor: 'npc_p' } })), { ok: true }); // 同一料不算冲突
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ ...stump, material: 'mat_air' }], cause: { actor: 'npc_p' } })), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  const s2 = fresh();
  const scorch = { pos: pos(52, 150, 0), material: null, fixture: null, mark: 'cellmark_scorch' };
  assert.deepEqual(run(s2, (st) => alterCells(E1, st, { w: 0, changes: [scorch], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(readPath(s2, P.cells('0', '0:0', '52:150:0')), { material: null, fixture: null, mark: 'cellmark_scorch', sinceMinute: 1234 });
  assert.equal(cellOf(E1, s2, 52, 150, 0).material, 'mat_soil'); // 材料不变，基底的土
  assert.equal(cellOf(E1, s2, 52, 150, 0).mark, 'cellmark_scorch'); // 标记读得到
});

test('#46 gridView 读差分：只叠 fixture 不改材料；材料改了顶替下层的格种类；差分高于地表时这一列的遮天标志算到差分那一层', () => {
  const s = fresh();
  const chair = { pos: pos(55, 150, 1), material: null, fixture: FIXTURE_ITEM, mark: null };
  const roof = dig(56, 150, 5, 'mat_granite');
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [chair, roof], cause: { actor: 'npc_p' } })), { ok: true });
  const c = cellOf(E1, s, 55, 150, 1);
  assert.deepEqual([c.material, c.fixture, c.standable], ['mat_air', FIXTURE_ITEM, true]); // 材料仍是基底的空气
  // (56,150,5) 是石料格：它之下 (56,150,1) 被遮天，邻列 (57,150,1) 不遮（遮天要读 z=1 以上同列到差分最高层）。
  assert.equal(cellOf(E1, s, 56, 150, 1).blocksSky, true);
  assert.equal(cellOf(E1, s, 57, 150, 1).blocksSky, false);
  assert.deepEqual([cellOf(E1, s, 56, 150, 5).material, cellOf(E1, s, 56, 150, 5).state], ['mat_granite', 'solid']);
});

test('#46 全空项清除差分：gridView 不再叠、状态里记录写成全空（没有删除原语），diffCellsAmong 当没有；条数不超写过的不同格数（同格写两次仍一条）', () => {
  const s = fresh();
  const cause = { actor: 'npc_p' };
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause })), { ok: true });
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0, 'mat_granite')], cause })), { ok: true });
  assert.equal(cellsOf(s), 1);
  assert.equal(cellOf(E1, s, 50, 150, 0).material, 'mat_granite');
  assert.deepEqual(diffCellsAmong(E1, s, 0, [{ x: 50, y: 150, z: 0 }, { x: 51, y: 150, z: 0 }]), [{ x: 50, y: 150, z: 0 }]);
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(50, 150, 0), material: null, fixture: null, mark: null }], cause })), { ok: true });
  assert.deepEqual(readPath(s, P.cells('0', '0:0', '50:150:0')), { material: null, fixture: null, mark: null, sinceMinute: 1234 });
  assert.equal(cellOf(E1, s, 50, 150, 0).material, 'mat_soil');
  assert.deepEqual(diffCellsAmong(E1, s, 0, [{ x: 50, y: 150, z: 0 }]), []);
  assert.equal(cellsOf(s), 1);
});

// ---------- #47 拒写检查 ----------

const rejected = (r) => assert.deepEqual(r, { ok: false, code: 'E-GRID-OFFSCREEN-WRITE' });

test('#47 泡外行为者拒写：区格 (7,1) 的个体不在泡内（泡是区格 x 0–1、y 0–2），E-GRID-OFFSCREEN-WRITE、整笔回滚；同区格的非受控个体 npc_q 在泡内照写', () => {
  const s = fresh();
  rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_far' } })));
  assert.equal(s.cells, undefined);
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_q' } })), { ok: true });
});

test('#47 泡移走后原地留下、位置仍在细格上的 NPC 一样拒（A27-1.14 用例）：玩家席位换到 npc_far，npc_p 留在区格 (0,1) 即不在泡内；npc_far 自己（泡中心）照写', () => {
  const s = fresh('npc_far');
  rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_p' } })));
  assert.equal(s.cells, undefined);
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(750, 150, 0)], cause: { actor: 'npc_far' } })), { ok: true });
});

test('#47 没有行为者的起因（缺省、null、规则代号字串、{}、{actor: null}）按目标格判：目标在泡内的区格 (1,1) 通过，在泡外的区格 (7,1) 拒；一笔里有一格在泡外即整笔拒', () => {
  const causes = [undefined, null, 'act_test_dig', {}, { actor: null }, { actor: undefined, note: 1 }];
  for (const cause of causes) {
    const inside = fresh();
    assert.deepEqual(run(inside, (st) => alterCells(E1, st, { w: 0, changes: [dig(150, 150, 0)], cause })), { ok: true }, JSON.stringify(cause));
    const outside = fresh();
    rejected(run(outside, (st) => alterCells(E1, st, { w: 0, changes: [dig(750, 150, 0)], cause })));
    assert.equal(outside.cells, undefined);
    const mixed = fresh();
    rejected(run(mixed, (st) => alterCells(E1, st, { w: 0, changes: [dig(150, 150, 0), dig(750, 150, 0)], cause })));
    assert.equal(mixed.cells, undefined, 'mixed batch is all-or-nothing');
  }
});

test('#47 未知行为者拒写、无一能绕过：实体不存在、不是有 pos 的实体（材料行）、实体没有位置，一律 E-GRID-OFFSCREEN-WRITE（不当泡内也不当无行为者）', () => {
  for (const actor of ['npc_nobody', 'mat_soil', 'npc_nopos']) {
    const s = fresh();
    rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor } })));
    assert.equal(s.cells, undefined, actor);
  }
});

test('#47 cause 形状不合（数、数组、actor 非串或空串）E-DIM-STRUCT-FIELD，不当作无行为者放行', () => {
  for (const cause of [5, true, [], [{ actor: 'npc_p' }], { actor: 5 }, { actor: '' }, { actor: {} }]) {
    const s = fresh();
    assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause })), { ok: false, code: 'E-DIM-STRUCT-FIELD' }, JSON.stringify(cause));
    assert.equal(s.cells, undefined);
  }
});

test('#47、#58 泡为空（没有玩家席位边）：任何起因都拒（泡内行为者不存在）；推进任意时长 cells.* 写入为 0、状态不变', () => {
  const s = fresh(null);
  const before = JSON.stringify(s);
  for (const cause of [{ actor: 'npc_p' }, { actor: 'npc_q' }, null, undefined, 'act_x', {}]) rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause })));
  s.clock.minute += 30 * 1440; // 推进 30 个世界日
  rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_p' } })));
  assert.equal(s.cells, undefined);
  assert.equal(JSON.stringify({ ...s, clock: { ...s.clock, minute: 1234 } }), before);
});

test('#47 已关闭的席位边不算玩家控制（terms.until 非空）：泡为空，拒写', () => {
  const s = fresh();
  s.holdings.npc_p.hld_1.terms.until = 100;
  rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_p' } })));
});

// ---------- #48 泡内行为者打到泡外格 ----------

test('#48 泡内行为者当场造成的改动照写，目标格在不在泡内都一样：npc_p（泡中心）写区格 (7,1)、(10,1) 的格成功，回头 gridView 读得到', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(750, 150, 0), dig(1050, 150, 0)], cause: { actor: 'npc_p' } })), { ok: true });
  assert.equal(cellOf(E1, s, 750, 150, 0).material, 'mat_air');
  assert.equal(cellOf(E1, s, 1050, 150, 0).material, 'mat_air');
  // 泡外格上写了差分：该格上人与物的坠落、挤出在下次展开时结算（展开归 G10）；求法就是 settleCell，见 #51 各用例，这里只核差分那一格读作空气、本格可穿行故不是 extrude 而是 fall 的候选。
  assert.equal(settleCell(E1, s, pos(750, 150, 0)).kind, 'stay'); // 挖开的地表格：下一层 z=−1 是土能承托、本格空气可穿行，可立足
});

// ---------- #49 建筑结构元格拒写 ----------

test('#49 体元格拒写：外墙角 (20,120,1)、隔墙/楼梯同类（体元＝外墙、隔墙、楼梯格）写成别的材料 E-GRID-STRUCTURE-CELL，整笔回滚（同笔的合法项也不留）；室内格、非建筑格照写', () => {
  const s = fresh();
  const wall = dig(20, 120, 1, 'mat_air'); // 小屋外墙角：局部 (u,v)=(0,0)，min(u, 5−u, v, 5−v) = 0 < w=1，外墙
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0), wall], cause: { actor: 'npc_p' } })), { ok: false, code: 'E-GRID-STRUCTURE-CELL' });
  assert.equal(s.cells, undefined);
  // 室内格：局部 (2,2)→ 世界 (20+2, 120−2) = (22,118)，z=1，min(2,3,2,3)=2 ≥ 1 室内；
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(22, 118, 1, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  // 门格：局部 (3,0)=(floor(6÷2), 0) → 世界 (23,120)，z=1 是正门，不是体元，可写。
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(23, 120, 1, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  // 墙上改 fixture 或 mark 而不动材料（含 becomesMaterial 为空的标记）不是"写成别的材料"：不拒；带 becomesMaterial 的标记会改材料，拒。
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(20, 120, 1), material: null, fixture: FIXTURE_ITEM, mark: 'cellmark_scorch' }], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(20, 120, 1), material: null, fixture: null, mark: 'cellmark_stump' }], cause: { actor: 'npc_p' } })), { ok: false, code: 'E-GRID-STRUCTURE-CELL' });
  // 差分记录没有顶面字段：记录键恰为四个。
  assert.deepEqual(Object.keys(readPath(s, P.cells('0', '0:0', '22:118:1'))).sort(), ['fixture', 'mark', 'material', 'sinceMinute']);
});

test('#49 墙格仍读墙料：墙上的 fixture/mark 差分不顶替材料；拒写检查先于结构元检查（泡外行为者写墙格报 OFFSCREEN）', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(20, 120, 1), material: null, fixture: FIXTURE_ITEM, mark: null }], cause: { actor: 'npc_p' } })), { ok: true });
  const c = cellOf(E1, s, 20, 120, 1);
  assert.deepEqual([c.material, c.state, c.fixture], ['mat_granite', 'solid', FIXTURE_ITEM]);
  rejected(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(20, 120, 1, 'mat_air')], cause: { actor: 'npc_far' } })));
});

// ---------- #50 差分永久保留 ----------

test('#50 差分永久：挖坑砌墙 → 泡移走（席位换人）→ 推进 30 世界日 → 席位回来 → gridView 逐格同、地点行维度前后同；读档（JSON 往返）后同', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0), dig(51, 150, 1, 'mat_granite'), dig(1050, 150, 0)], cause: { actor: 'npc_p' } })), { ok: true });
  const view = (st) => gridView(E1, st, { w: 0, cells: { x0: 48, y0: 149, z0: -1, x1: 52, y1: 151, z1: 2 } }).cells;
  const placeDims = (st) => JSON.stringify(['areaM2', 'elevationM', 'anchorElevationM', 'terrain'].map((d) => dim(E1, st, 'place', 'loc_a', d)));
  const before = JSON.stringify(view(s));
  const dimsBefore = placeDims(s);
  s.holdings = { npc_far: { hld_1: seatEdge('npc_far') } }; // 泡移到 (7,1)，区格 (0,1) 收起
  s.clock.minute += 30 * 1440;
  assert.equal(JSON.stringify(view(s)), before, '收起、推进 30 日后差分仍在，gridView 读到同样的内容（差分不依赖泡）');
  s.holdings = { npc_p: { hld_1: seatEdge('npc_p') } };
  assert.equal(JSON.stringify(view(s)), before);
  assert.equal(placeDims(s), dimsBefore, '差分不改任何地点行的维度');
  const reloaded = JSON.parse(JSON.stringify(s)); // 存档读回：状态是纯数据，往返逐位同
  assert.equal(JSON.stringify(view(reloaded)), before);
  assert.equal(cellOf(E1, reloaded, 1050, 150, 0).material, 'mat_air');
});

test('#55 存档分片：差分只存格、按（格空间, 里块）分层——每格都在自己的里块下（里块号与格键一致），改一个里块的格只有那一块的子树变，没有基底或缓存字段', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0), dig(1050, 150, 0)], cause: { actor: 'npc_p' } })), { ok: true });
  // 里块边长 1000 细格：x=50 → 里块 (0,0)；x=1050 → 里块 (1,0)（格键 y=150 → cy 0）。
  assert.deepEqual(Object.keys(s.cells), ['0']);
  assert.deepEqual(Object.keys(s.cells['0']).sort(), ['0:0', '1:0']);
  assert.deepEqual(Object.keys(s.cells['0']['0:0']), ['50:150:0']);
  assert.deepEqual(Object.keys(s.cells['0']['1:0']), ['1050:150:0']);
  const chunkJson = (st, c) => JSON.stringify(st.cells['0'][c]);
  const [a0, b0] = [chunkJson(s, '0:0'), chunkJson(s, '1:0')];
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(51, 150, 0)], cause: { actor: 'npc_p' } })), { ok: true });
  assert.notEqual(chunkJson(s, '0:0'), a0);
  assert.equal(chunkJson(s, '1:0'), b0, '另一个里块的子树不变');
  // 顶层除 cells 外没有别的差分相关键（基底与缓存不进状态）。
  assert.deepEqual(Object.keys(s).filter((k) => !['clock', 'created', 'holdings', 'cells'].includes(k)), []);
});

// ---------- #51 挤出与坠落 ----------

test('#51 挤出落点：所在格被差分变成实体，移到半径内最近的可立足格，并列取格序号字典序最小——手算：(50,150,1) 变石料，d²=1 的四邻 (49,150)、(50,149)、(50,151)、(51,150) 同在 z=1，取 x 最小的 (49,150,1)', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 1, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  const e2 = withRadius(E1, 2);
  const want = { kind: 'extrude', cell: { w: 0, x: 49, y: 150, z: 1, coarse: false } };
  assert.deepEqual(settleCell(e2, s, pos(50, 150, 1)), want);
  assert.deepEqual(extrudeCell(e2, s, pos(50, 150, 1)), { kind: 'land', cell: want.cell });
  assert.deepEqual(settleCell(e2, s, pos(50, 150, 1)), want, '同输入同结果');
  // 再把 (49,150,1) 也变石料：d²=1 的剩下三格 (50,149)、(50,151)、(51,150)，按 (x, y, z) 字典序取 (50,149,1)。
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(49, 150, 1, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(settleCell(e2, s, pos(50, 150, 1)), { kind: 'extrude', cell: { w: 0, x: 50, y: 149, z: 1, coarse: false } });
});

test('#51 挤出找不到按"被埋"：半径 1 时 d² ≤ 1 的格只有四邻（竖向一层 3 m 超出），四邻都变石料则 buried；半径 2 能找到对角格', () => {
  const s = fresh();
  const ring = [[49, 150], [51, 150], [50, 149], [50, 151]].map(([x, y]) => dig(x, y, 1, 'mat_granite'));
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 1, 'mat_granite'), ...ring], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(settleCell(withRadius(E1, 1), s, pos(50, 150, 1)), { kind: 'buried' });
  // 半径 2：d² ≤ 4，可选格含对角 d²=2（(49,149)、(51,149)、(49,151)、(51,151)）和轴向两格 d²=4；最近是 d²=2，字典序取 (49,149,1)。
  assert.deepEqual(settleCell(withRadius(E1, 2), s, pos(50, 150, 1)), { kind: 'extrude', cell: { w: 0, x: 49, y: 149, z: 1, coarse: false } });
});

test('#51 搜索半径只取规则表 rules.grid.landSearchRadiusCells：未登记（真实表现在没有该键，卷文未给数值）、0、负数、小数、null、"不限" 一律 E-RULES-UNREGISTERED / E-DET-DOMAIN，不设缺省', () => {
  const s = fresh();
  assert.equal(E1.rules.grid.landSearchRadiusCells, 10); // 暂定值（grid.json）
  const { landSearchRadiusCells: _gone, ...noRadius } = E1.rules.grid;
  assert.throws(() => extrudeCell({ ...E1, rules: { ...E1.rules, grid: noRadius } }, s, pos(50, 150, 1)), (e) => e.code === 'E-RULES-UNREGISTERED');
  for (const bad of [0, -1, 1.5, null, 'unlimited', Infinity]) {
    assert.throws(() => extrudeCell(withRadius(E1, bad), s, pos(50, 150, 1)), (e) => e.code === 'E-RULES-UNREGISTERED', String(bad));
  }
});

test('#51 坠落（A5-5.2 桌例）：(50,150,2) 放石料"桌"，(50,150,3) 站得住；差分清空后不可立足，落到下方第一个可立足格 z=1，落差 = (3−1) 层 × storeyM 3 m = 6 m；settleCell 统一给 stay / fall', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 2, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(settleCell(E1, s, pos(50, 150, 3)), { kind: 'stay' });
  assert.deepEqual(run(s, (st) => assert.equal(clearDiffs(E1, st, { w: 0, cells: [{ x: 50, y: 150, z: 2 }, { x: 51, y: 150, z: 2 }], cause: { actor: 'npc_p' } }), 1)), { ok: true });
  const want = { kind: 'fall', cell: { w: 0, x: 50, y: 150, z: 1, coarse: false }, dropM: 6 };
  assert.deepEqual(settleCell(E1, s, pos(50, 150, 3)), want);
  assert.deepEqual(fallCell(E1, s, pos(50, 150, 3)), { kind: 'land', cell: want.cell, dropM: 6 });
  assert.deepEqual(settleCell(E1, s, pos(50, 150, 3)), want, '同输入同结果');
  // 站立层 z=1 本来就可立足；深坑里（地表 z=0 被挖成空气）的格往下落到坑底 z=−1（土）之上的空气格 z=0。
  assert.deepEqual(settleCell(E1, s, pos(50, 150, 1)), { kind: 'stay' });
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(50, 150, 0)], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(fallCell(E1, s, pos(50, 150, 3)), { kind: 'land', cell: { w: 0, x: 50, y: 150, z: 0, coarse: false }, dropM: 9 });
});

test('#51 坠落到底：挖穿到世界最低地表层以下没有可立足格返回 none（不无限下落、不当落在虚空）；列在外包框外返回 none', () => {
  const s = fresh();
  assert.deepEqual(fallCell(E1, s, pos(-5000, 150, 1)), { kind: 'none' }); // 区格 −50 在框外
});

// ---------- #52、#53 按日生效重派生（dated 已合；本卡接 gridView 与缓存键） ----------

test('#53 大范围改写按日生效：三个区域行的 anchorElevationM 第 5 日追加 fromDay 8、值 30；第 7 日（d−1）地表层 0、第 8 日（d）地表层 floor(30÷3)=10，更早、更晚各自不变；缓存不串日', () => {
  const m = OWNERS;
  const decl = {
    ...m,
    writers: [...m.writers, { pattern: 'dshp.*.*', create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true }],
    pathTypes: { ...m.pathTypes, 'dshp.*.*': 'list<struct:datedRewrite>' },
    keyKinds: { ...m.keyKinds, 'dshp.*.*': [['place'], 'dimKey'] },
  };
  installStorage(decl);
  try {
    const s = fresh();
    s.clock.minute = 5 * 1440;
    const SHAPER = { node: 'view:shaper', file: 'sys/shaper.mjs' };
    for (const id of ['loc_root', 'loc_a', 'loc_b']) assert.deepEqual(run(s, (st) => writeDated(E1, st, `dshp.${id}.anchorElevationM`, { fromDay: 8, value: 30, cause: 'evt_quake' }), SHAPER), { ok: true });
    const at = (day) => { s.clock.minute = day * 1440; return gridView(E1, s, { w: 0, region: { x: 1, y: 1 } }); };
    const surfaceCell = (day, z) => { s.clock.minute = day * 1440; return cellOf(E1, s, 150, 150, z).material; };
    // 全部控制点同值 30 m，起伏为 0：地表高处处 30 m，地表层 floor(30 ÷ 3) = 10。
    assert.equal(at(7).surfaceStorey, 0);
    assert.equal(at(8).surfaceStorey, 10);
    assert.equal(at(100).surfaceStorey, 10);
    assert.equal(at(7).surfaceStorey, 0, '回到第 7 日仍读旧值（缓存键含当日有效输入版本）');
    assert.equal(at(0).surfaceStorey, 0);
    assert.equal(surfaceCell(7, 0), 'mat_soil'); // 旧地表
    assert.equal(surfaceCell(8, 0), 'mat_granite'); // 新地表 z=10；z=0 深埋在岩里（地表以下超过 soilLayers）
    assert.equal(surfaceCell(8, 10), 'mat_soil');
    assert.equal(surfaceCell(8, 11), 'mat_air');
  } finally { installStorage(OWNERS); }
});

test('#51、#53 差分优先：基底按日重派生后，旧地表上挖的坑差分照旧叠在新基底上（新基底 z=0 是深岩，差分仍读空气）；新基底把人所在格变成岩，同层邻格也都是岩，半径 2 内竖向够不到可立足格，settleCell 判 buried', () => {
  const m = OWNERS;
  installStorage({
    ...m,
    writers: [...m.writers, { pattern: 'dshp.*.*', create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true }],
    pathTypes: { ...m.pathTypes, 'dshp.*.*': 'list<struct:datedRewrite>' },
    keyKinds: { ...m.keyKinds, 'dshp.*.*': [['place'], 'dimKey'] },
  });
  try {
    const s = fresh();
    s.clock.minute = 5 * 1440;
    assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(150, 150, 0)], cause: { actor: 'npc_p' } })), { ok: true });
    const SHAPER = { node: 'view:shaper', file: 'sys/shaper.mjs' };
    for (const id of ['loc_root', 'loc_a', 'loc_b']) assert.deepEqual(run(s, (st) => writeDated(E1, st, `dshp.${id}.anchorElevationM`, { fromDay: 8, value: 30, cause: 'evt_quake' }), SHAPER), { ok: true });
    s.clock.minute = 7 * 1440;
    assert.equal(cellOf(E1, s, 150, 150, 0).material, 'mat_air');
    s.clock.minute = 8 * 1440;
    assert.equal(cellOf(E1, s, 150, 150, 0).material, 'mat_air', '差分永久，不因基底重派生而丢');
    assert.equal(cellOf(E1, s, 151, 150, 0).material, 'mat_granite', '邻格是新基底的深岩');
    // 站在旧站立层 (151,150,1) 的人：新基底该格是岩（z=1 ≪ 新地表 10）：不可立足、非气态，挤出到半径内最近的可立足格——半径 2、同层邻格都是岩，竖向 reach = floor(2÷3) = 0 层，所以 buried。
    assert.deepEqual(settleCell(withRadius(E1, 2), s, pos(151, 150, 1)), { kind: 'buried' });
  } finally { installStorage(OWNERS); }
});

// ---------- #56 足迹内的差分查询与删除 ----------

test('#56 足迹内有无差分、删去足迹内差分：diffCellsAmong 给有差分的格；clearDiffs 只清有差分的格、写全空项而不写新内容，无差分时不调 alterCells；同样受拒写检查', () => {
  const s = fresh();
  const cells = [{ x: 60, y: 150, z: 0 }, { x: 61, y: 150, z: 0 }, { x: 62, y: 150, z: 0 }];
  assert.deepEqual(diffCellsAmong(E1, s, 0, cells), []);
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [dig(60, 150, 0), dig(62, 150, 0, 'mat_granite')], cause: { actor: 'npc_p' } })), { ok: true });
  assert.deepEqual(diffCellsAmong(E1, s, 0, cells), [cells[0], cells[2]]);
  // 泡外行为者不能清。
  rejected(run(s, (st) => clearDiffs(E1, st, { w: 0, cells, cause: { actor: 'npc_far' } })));
  assert.deepEqual(diffCellsAmong(E1, s, 0, cells), [cells[0], cells[2]]);
  assert.deepEqual(run(s, (st) => assert.equal(clearDiffs(E1, st, { w: 0, cells, cause: { actor: 'npc_p' } }), 2)), { ok: true });
  assert.deepEqual(diffCellsAmong(E1, s, 0, cells), []);
  assert.deepEqual(readPath(s, P.cells('0', '0:0', '60:150:0')), { material: null, fixture: null, mark: null, sinceMinute: 1234 }); // 只清、不写新内容
  assert.equal(cellOf(E1, s, 60, 150, 0).material, 'mat_soil');
  const before = JSON.stringify(s);
  assert.deepEqual(run(s, (st) => assert.equal(clearDiffs(E1, st, { w: 0, cells, cause: { actor: 'npc_far' } }), 0)), { ok: true }); // 没有要清的格，泡外行为者也无事可拒（不调 alterCells）
  assert.equal(JSON.stringify(s), before);
});

test('#56 建筑结构元格上的全空项（清除）不被结构元拒写挡：墙格上没有材料差分可清', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => alterCells(E1, st, { w: 0, changes: [{ pos: pos(20, 120, 1), material: null, fixture: null, mark: null }], cause: { actor: 'npc_p' } })), { ok: true });
});

