// S2-P 单测：位置写者（placeSubject、move）、建筑足迹（外包盒与卷十九规则 7 旋转）、zoneAt、landCell 未建数据门、初次朝向两路、落脚处候选、菜单 here、
// 加载器叠 generated 节（卷二 :169）。写码方自补，不作验收依据。期望值按卷文公式在测试里手算，或先造数据前提再断言；不抄仓库基线计数。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { buildRegistry } from '../../server-plugin/rules/load/registry.mjs';
import { mergeOwners } from '../../server-plugin/rules/load/registry-shards.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { canonical } from '../../server-plugin/kernel/storage.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { zoneAt, landCell } from '../../server-plugin/rules/place/zone.mjs';
import { placeSubject } from '../../server-plugin/rules/travel/position.mjs';
import { controlledEntities } from '../../server-plugin/rules/social/control.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const ruleOf = (raw, code, key) => raw.tableDocs[code].rows.find((r) => r.key === key).value;

function owners() {
  const dir = new URL('ontology/state-owners.d/', W);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `world/ontology/state-owners.d/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return mergeOwners({ file: 'world/ontology/state-owners.json', doc: json('ontology/state-owners.json') }, shards).doc;
}
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: clone(owners()),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (tag, extra = {}) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot(tag), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]), ...extra });
const code = (c) => (e) => e.code === c;
const placeDoc = (raw) => raw.dimensionDocs.find((d) => d.kind === 'place');
// 一行的有效值（生成节叠在实体行上，卷二 :169）。
const rowOf = (raw, id) => ({ ...placeDoc(raw).rows[id], ...(placeDoc(raw).generated[id] || {}) });
const isBuilding = (raw, id) => (placeDoc(raw).rows[id].classes || []).includes(ruleOf(raw, 'gen', 'roleFacility'));
const ancestors = (raw, id) => { const out = []; for (let p = placeDoc(raw).rows[id].parent; p; p = placeDoc(raw).rows[p].parent) out.push(p); return out; };
const choose = (g, lodge = 0) => {
  const r = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge } });
  assert.equal(r.ok, true, JSON.stringify(r));
  return controlledEntities(g.engine, g.state)[0];
};
const lodgeCandidates = (g) => g.menu(null).affordances.find((a) => a.act === 'act_choose_origin').slots.lodge;

// 卷十九 §4.5 规则 7 第 2 点手算：(x, y) = (u, −v)，顺时针转 floor(facing ÷ 2) 个四分之一圈（每次 (x, y) → (y, −x)），层号 anchor.z + 1 + storeyBase + ℓ。
function expectCells(anchor, facing, W0, D0, storeys, storeyBase) {
  const out = [];
  for (let u = 0; u < W0; u += 1) for (let v = 0; v < D0; v += 1) {
    let [x, y] = [u, -v];
    for (let k = 0; k < Math.floor(facing / 2) % 4; k += 1) [x, y] = [y, -x];
    for (let l = 0; l < storeys; l += 1) out.push(`${anchor.w},${anchor.x + x},${anchor.y + y},${anchor.z + 1 + storeyBase + l}`);
  }
  return out.sort();
}
const keys = (cells) => cells.map((c) => `${c.w},${c.x},${c.y},${c.z}`).sort();

test('1 加载器叠 generated 节（卷二 :169）：生成值盖实体行同名值；未盖的字段仍取实体行；节里的 id 不在 rows 即 E-DIM-REF-MISSING；入参文档不改', () => {
  const doc = { kind: 'place', entity: { idPrefix: ['loc_'] }, rows: { loc_a: { parent: null, terrain: 't0', facing: 1 } }, generated: { loc_a: { facing: 3, storeys: 2 } } };
  const before = JSON.stringify(doc);
  const reg = buildRegistry([doc]);
  const row = Object(reg.tables.get('place').rows).loc_a;
  assert.equal(row.facing, 3);
  assert.equal(row.storeys, 2);
  assert.equal(row.terrain, 't0');
  assert.equal(JSON.stringify(doc), before);
  assert.throws(() => buildRegistry([{ ...clone(doc), generated: { loc_b: { facing: 0 } } }]), code('E-DIM-REF-MISSING'));
});

test('2 建筑足迹 = 外包盒按卷十九规则 7 旋转：世界数据里每栋建筑逐格等于手算；夹具改朝向（含奇数向下取偶）与层数照样相等', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-fp-'));
  const forms = raw.vocabDoc.families[placeDoc(raw).dimensions.form.vocab].entries;
  const buildings = Object.keys(placeDoc(raw).rows).filter((id) => isBuilding(raw, id));
  assert.ok(buildings.length > 0);
  for (const id of buildings) {
    const r = rowOf(raw, id);
    assert.deepEqual(keys(g.engine.bake.footprints.cellsOf(id)), expectCells(r.anchor, r.facing, r.planCells.widthCells, r.planCells.depthCells, r.storeys, forms[r.form].storeyBase), id);
  }
  // 夹具：挪一栋到远处（不与任何兄弟相交），朝向 3（奇数，取 2 即东）、2 层、宽 3 深 2。
  const id = buildings[0];
  const fx = clone(raw);
  const gen = placeDoc(fx).generated[id];
  Object.assign(gen, { anchor: { w: 0, x: 100000, y: 200000, z: 10, coarse: false }, facing: 3, storeys: 2, planCells: { widthCells: 3, depthCells: 2 } });
  const g2 = mountKernel(fx, caps('s2p-fp2-'));
  const base = forms[rowOf(fx, id).form].storeyBase;
  // 手算：facing 3 → 转 1 次，(u, −v) → (−v, −u)。
  const want = [];
  for (const [dx, dy] of [[0, 0], [0, -1], [0, -2], [-1, 0], [-1, -1], [-1, -2]]) for (const l of [0, 1]) want.push(`0,${100000 + dx},${200000 + dy},${10 + 1 + base + l}`);
  assert.deepEqual(keys(g2.engine.bake.footprints.cellsOf(id)), want.sort());
});

test('3 zoneAt：建筑足迹内的格给该建筑；格不在任何建筑里、不是格、别的格空间给 null（区域足迹未建，Q3 甲）', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-zone-'));
  const id = Object.keys(placeDoc(raw).rows).find((x) => isBuilding(raw, x));
  const c = g.engine.bake.footprints.cellsOf(id)[0];
  assert.equal(zoneAt(g.engine, g.state, c), id);
  assert.equal(zoneAt(g.engine, g.state, { ...c, coarse: true }), id);
  assert.equal(zoneAt(g.engine, g.state, { ...c, z: c.z + 1000 }), null);
  assert.equal(zoneAt(g.engine, g.state, { ...c, w: c.w + 1 }), null);
  assert.equal(zoneAt(g.engine, g.state, null), null);
  assert.equal(zoneAt(g.engine, g.state, { w: 0, x: 0.5, y: 0, z: 0 }), null);
});

test('4 landCell：建筑落代表格（coarse 真、在足迹内、同键同格）；区域地点与 coarse 假走未建数据门 E-ACT-WRITER-NOT-READY', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-land-'));
  const id = Object.keys(placeDoc(raw).rows).find((x) => isBuilding(raw, x));
  const a = landCell(g.engine, g.state, { place: id, kind: 'person', seedKey: 'k1', coarse: true });
  assert.equal(a.coarse, true);
  assert.equal(zoneAt(g.engine, g.state, a), id);
  assert.deepEqual(landCell(g.engine, g.state, { place: id, kind: 'person', seedKey: 'k1', coarse: true }), a);
  const region = Object.keys(placeDoc(raw).rows).find((x) => !isBuilding(raw, x));
  assert.throws(() => landCell(g.engine, g.state, { place: region, kind: 'person', seedKey: 'k1', coarse: true }), code('E-ACT-WRITER-NOT-READY'));
  assert.throws(() => landCell(g.engine, g.state, { place: id, kind: 'person', seedKey: 'k1', coarse: false }), code('E-ACT-WRITER-NOT-READY'));
});

test('5 兄弟建筑重叠即加载拒 E-GRID-SIBLING-OVERLAP（夹具：只改数据，把同父两栋锚点放在同一格）', () => {
  const raw = rawWorld();
  const rows = placeDoc(raw).rows;
  const byParent = {};
  for (const id of Object.keys(rows).filter((x) => isBuilding(raw, x))) (byParent[rows[id].parent] ??= []).push(id);
  const [a, b] = Object.values(byParent).find((ids) => ids.length >= 2);
  const fx = clone(raw);
  placeDoc(fx).generated[b].anchor = clone(placeDoc(fx).generated[a].anchor);
  assert.throws(() => mountKernel(fx, caps('s2p-overlap-')), code('E-GRID-SIBLING-OVERLAP'));
});

test('6 落脚处候选从数据推出：开放地点子树内的建筑、去掉 accessClass 要许可的；夹具多开一个村，它的建筑就进候选', () => {
  const raw = rawWorld();
  const access = raw.vocabDoc.families[placeDoc(raw).dimensions.accessClass.vocab].entries;
  const want = (w) => {
    const open = Object.keys(placeDoc(w).rows).filter((id) => placeDoc(w).rows[id].genOpen === true);
    return Object.keys(placeDoc(w).rows).filter((id) => isBuilding(w, id) && ancestors(w, id).some((p) => open.includes(p))
      && !(rowOf(w, id).accessClass !== undefined && access[rowOf(w, id).accessClass].needsGrant === true)).sort();
  };
  const g = mountKernel(clone(raw), caps('s2p-lodge-'));
  assert.deepEqual([...lodgeCandidates(g)], want(raw));
  // 夹具：另一个有建筑的村设 genOpen。
  const fx = clone(raw);
  const open = Object.keys(placeDoc(fx).rows).filter((id) => placeDoc(fx).rows[id].genOpen === true);
  const other = [...new Set(Object.keys(placeDoc(fx).rows).filter((id) => isBuilding(fx, id)).map((id) => placeDoc(fx).rows[id].parent))]
    .find((p) => !open.includes(p) && !ancestors(fx, p).some((x) => open.includes(x)));
  placeDoc(fx).rows[other].genOpen = true;
  const g2 = mountKernel(fx, caps('s2p-lodge2-'));
  assert.deepEqual([...lodgeCandidates(g2)], want(fx));
  assert.ok(lodgeCandidates(g2).length > lodgeCandidates(g).length);
});

test('7 选来历落位：化身 pos 在所选落脚处、coarse 真；初次朝向取该建筑 facing；菜单 here = {place, chain}，chain 依次是祖先', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-spawn-'));
  const cands = lodgeCandidates(g);
  const k = cands.length - 1;
  const av = choose(g, k);
  const props = g.state.created[av].props;
  assert.equal(props.pos.coarse, true);
  assert.equal(zoneAt(g.engine, g.state, props.pos), cands[k]);
  assert.equal(props.facing, rowOf(raw, cands[k]).facing);
  const here = g.menu(null).here;
  assert.deepEqual(here, { place: cands[k], chain: [cands[k], ...ancestors(raw, cands[k])] });
  assert.ok(here.chain.includes(props.birthplace));
  // 确定性：同一种子同一输入两次开局 pos 逐位相同。
  const g2 = mountKernel(clone(raw), caps('s2p-spawn2-'));
  assert.deepEqual(g2.state.created[choose(g2, k)].props.pos, props.pos);
});

test('8 初次朝向第二路：目标格不在任何建筑里即取 rules.travel.initialFacing（夹具改值随数据走）', () => {
  const raw = rawWorld();
  for (const want of [ruleOf(raw, 'travel', 'initialFacing'), 6]) {
    const fx = clone(raw);
    fx.tableDocs.travel.rows.find((r) => r.key === 'initialFacing').value = want;
    const g = mountKernel(fx, caps('s2p-face-'));
    const av = choose(g);
    const tpl = g.state.created[av].template;
    const made = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { birthplace: g.state.created[av].props.birthplace, species: g.state.created[av].props.species } }] });
    assert.equal(made.ok, true, JSON.stringify(made));
    const p = Object.keys(g.state.created).find((id) => id !== av && g.state.created[id].kind === 'person');
    const r = runTransaction(g.engine, g.state, (tx) => placeSubject(g.engine, g.state, p, { pos: { w: 0, x: 900000, y: 900000, z: 0 } }, null, null, tx));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(g.state.created[p].props.facing, want);
    assert.deepEqual(g.state.created[p].props.pos, { w: 0, x: 900000, y: 900000, z: 0, coarse: true });
  }
});

test('9 move：换屋后 here 随之变；朝向 = 旧→新方位角折成的档（按 grid 常数手算）；给定 facing 即用它', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-move-'));
  const av = choose(g, 0);
  const from = g.state.created[av].props.pos;
  const to = lodgeCandidates(mountKernel(clone(raw), caps('s2p-move-c-')))[1];
  const r = g.submitProposal({ effects: [{ op: 'move', subject: av, to }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const pos = g.state.created[av].props.pos;
  assert.equal(g.menu(null).here.place, to);
  const n = ruleOf(raw, 'grid', 'facingDirections');
  const full = ruleOf(raw, 'grid', 'fullTurnDeg');
  const deg = ((Math.atan2(pos.x - from.x, pos.y - from.y) * 180) / Math.PI + full) % full;
  assert.equal(g.state.created[av].props.facing, Math.floor((deg + full / n / 2) / (full / n)) % n);
  assert.equal(g.submitProposal({ effects: [{ op: 'move', subject: av, to, facing: 5 }] }).ok, true);
  assert.equal(g.state.created[av].props.facing, 5);
});

test('10 move 拒收（state 逐位不变）：缺 subject E-EFF-PARAM；to 不是地点 E-DIM-REF-MISSING；to 是区域 E-ACT-WRITER-NOT-READY；facing 越界 E-EFF-PARAM；已终止 E-TERM-RESIDUE', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-reject-'));
  const av = choose(g, 0);
  const to = lodgeCandidates(mountKernel(clone(raw), caps('s2p-reject-c-')))[1];
  const region = g.state.created[av].props.birthplace;
  const n = ruleOf(raw, 'grid', 'facingDirections');
  const snap = () => canonical(g.state.created);
  for (const [effect, want] of [
    [{ op: 'move', to }, 'E-EFF-PARAM'],
    [{ op: 'move', subject: av, to: av }, 'E-DIM-REF-MISSING'],
    [{ op: 'move', subject: av, to: region }, 'E-ACT-WRITER-NOT-READY'],
    [{ op: 'move', subject: av, to, facing: n }, 'E-EFF-PARAM'],
  ]) {
    const before = snap();
    assert.equal(g.submitProposal({ effects: [effect] }).code, want, JSON.stringify(effect));
    assert.equal(snap(), before);
  }
  assert.equal(g.submitProposal({ effects: [{ op: 'destroy', entity: av }] }).ok, true);
  const before = snap();
  assert.equal(g.submitProposal({ effects: [{ op: 'move', subject: av, to }] }).code, 'E-TERM-RESIDUE');
  assert.equal(snap(), before);
});

test('11 烘焙层可重建：verifyBake 开着照常开局（足迹两次构建摘要相等）', () => {
  assert.ok(mountKernel(rawWorld(), caps('s2p-verify-', { verifyBake: true })).engine.bake.footprints);
});

test('12 就近折档在半档两侧（卷十七 :304 floor((方位角 + 半档) ÷ 档宽)）：格向量的方位角到不了恰好半档，取紧贴 22.5° 两侧各一例，折向与手算一致', () => {
  const raw = rawWorld();
  const g = mountKernel(clone(raw), caps('s2p-half-'));
  const av = choose(g);
  const tpl = g.state.created[av].template;
  assert.equal(g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { birthplace: g.state.created[av].props.birthplace, species: g.state.created[av].props.species } }] }).ok, true);
  const p = Object.keys(g.state.created).find((id) => id !== av && g.state.created[id].kind === 'person');
  const n = ruleOf(raw, 'grid', 'facingDirections');
  const full = ruleOf(raw, 'grid', 'fullTurnDeg');
  const o = { w: 0, x: 900000, y: 900000, z: 0 };
  // (41, 99) 方位角约 22.4987°（半档之下，折 0）；(29, 70) 约 22.5012°（半档之上，折 1）。
  for (const [dx, dy] of [[41, 99], [29, 70]]) {
    const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
    const want = Math.floor((deg + full / n / 2) / (full / n)) % n;
    for (const pos of [o, { ...o, x: o.x + dx, y: o.y + dy }]) {
      const r = runTransaction(g.engine, g.state, (tx) => placeSubject(g.engine, g.state, p, { pos }, null, null, tx));
      assert.equal(r.ok, true, JSON.stringify(r));
    }
    assert.equal(g.state.created[p].props.facing, want, `${dx},${dy}`);
  }
});
