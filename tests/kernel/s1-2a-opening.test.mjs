// S1-2a 单测：真实开局与烘焙层（写码方自补，不作验收依据；草案 §8 第 1–8 条的行为）。
// 期望值从世界数据读出或在测试里先造前提（卷十 R10-1.2、R10-11.4、R10-12.7；卷二十七 R27-4.13、R27-5.9、:742），不抄仓库基线计数。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot（不清理）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import express from 'express';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { buildState, runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { initClock, clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { docOf } from '../../server-plugin/kernel/save.mjs';
import { runGenesis, runOpening, openingOf } from '../../server-plugin/rules/gen/worldgen-writeback.mjs';
import { bakePlaceTree, placeTreeDigest } from '../../server-plugin/rules/bake/place-tree.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const code = (c) => (e) => /** @type {any} */ (e).code === c;

/** 世界数据原文（与 index.mjs 同形）。 */
function rawWorld() {
  const o = new URL('../../world/ontology/', import.meta.url);
  const json = (f) => JSON.parse(readFileSync(new URL(f, o), 'utf8'));
  const dir = new URL('dimensions/', o);
  const registryRows = json('../rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`../rules/${r.file}`)])),
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
  };
}

const caps = (dir, extra = {}) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(dir, '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]), ...extra });
const genCode = (raw) => raw.registryRows.find((r) => r.file === 'tables/worldgen.json').code;
const genValue = (raw, key) => raw.tableDocs[genCode(raw)].rows.find((r) => r.key === key).value;
/** 规则表副本：改 worldgen 某键的值（undefined 即删该行）。 */
function withGen(raw, key, value) {
  const c = genCode(raw);
  const rows = raw.tableDocs[c].rows.filter((r) => r.key !== key || value !== undefined).map((r) => (r.key === key ? { ...r, value } : r));
  return { ...raw, tableDocs: { ...raw.tableDocs, [c]: { ...raw.tableDocs[c], rows } } };
}
/** 树所在表（烘焙层自报的 kind）的维度表原文。 */
const treeDoc = (raw, kind) => raw.dimensionDocs.find((d) => d.kind === kind);
/** 维度表副本：改某表若干行。 */
function withRows(raw, kind, patch) {
  return { ...raw, dimensionDocs: raw.dimensionDocs.map((d) => (d.kind === kind ? { ...d, rows: { ...d.rows, ...patch(d.rows) } } : d)) };
}

test('1 真实开局：init 在 3000 ms 内返回，返回值含 engine/state/logBook/submitProposal/advance/save/opening', async () => {
  const t0 = performance.now();
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2a-init-') });
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `init took ${ms} ms`);
  for (const k of ['engine', 'state', 'logBook', 'submitProposal', 'advance', 'save', 'opening']) assert.ok(Object.hasOwn(g, k), k);
});

test('2 开局时刻来自数据：genesisMinute === openingMinute === 规则表值，时钟同值；改副本的起始分钟，时钟随之改', () => {
  const raw = rawWorld();
  const want = genValue(raw, 'genesisMinute');
  assert.equal(genValue(raw, 'historyYears'), 0, '前提：西陲手写世界 years 为 0（卷十 :866）');
  const g = mountKernel(raw, caps(testTempRoot('s2a-gm-')));
  assert.deepEqual({ ...g.opening() }, { genesisMinute: want, openingMinute: want });
  assert.deepEqual({ ...openingOf(g.engine, g.state) }, { genesisMinute: want, openingMinute: want });
  assert.equal(clockMinute(g.engine, g.state), want);
  const other = want + 7;
  const h = mountKernel(withGen(raw, 'genesisMinute', other), caps(testTempRoot('s2a-gm2-')));
  assert.equal(clockMinute(h.engine, h.state), other);
  assert.deepEqual({ ...h.opening() }, { genesisMinute: other, openingMinute: other });
});

test('2b 开局时刻无缺省：规则表缺 genesisMinute、取值越域、historyYears 非 0 都在加载时拒（E-DIM-DOMAIN-RANGE）；时钟不在 genesis 之前初始化', () => {
  const raw = rawWorld();
  const dir = testTempRoot('s2a-gmbad-');
  assert.throws(() => mountKernel(withGen(raw, 'genesisMinute', undefined), caps(dir)), code('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => mountKernel(withGen(raw, 'genesisMinute', -1), caps(dir)), code('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => mountKernel(withGen(raw, 'genesisMinute', 1.5), caps(dir)), code('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => mountKernel(withGen(raw, 'historyYears', 1), caps(dir)), code('E-DIM-DOMAIN-RANGE'));
  const g = mountKernel(raw, caps(dir));
  assert.throws(() => buildState(g.engine, [initClock, runGenesis]), code('E-DIM-UNKNOWN-READ'));
});

test('3 规模不缩：开局烘焙树覆盖地点表全部行；政区组件行中有一级恰 31 行（九省 31 郡，按数据计数）', async () => {
  const raw = rawWorld();
  const g = mountKernel(raw, caps(testTempRoot('s2a-scale-')));
  const { kind, byLevel } = g.engine.bake.placeTree;
  const rows = treeDoc(raw, kind).rows;
  assert.equal(byLevel.length, Object.keys(rows).length);
  assert.deepEqual([...byLevel].sort(), Object.keys(rows).sort());
  const levels = new Map();
  for (const r of Object.values(rows)) if (typeof r.regionLevel === 'string') levels.set(r.regionLevel, (levels.get(r.regionLevel) || 0) + 1);
  const counts = [...levels.values()].sort((a, b) => a - b);
  assert.deepEqual(counts, [1, 9, 31], '政区三级：世界 1、省 9、郡 31');
});

test('4 开放范围：作者已给的不变；其余地点恰都在 gaps 里（openRX 未定值），不重不漏，不写偏离行', () => {
  const raw = rawWorld();
  const g = mountKernel(raw, caps(testTempRoot('s2a-open-')));
  const { kind, byLevel } = g.engine.bake.placeTree;
  const rows = treeDoc(raw, kind).rows;
  const authored = Object.keys(rows).filter((id) => Object.hasOwn(rows[id], 'genOpen'));
  assert.ok(authored.length > 0, '前提：数据里有作者已给 genOpen 的地点');
  for (const id of authored) assert.equal(dim(g.engine, g.state, kind, id, 'genOpen').value, rows[id].genOpen);
  // 开局一步在新 state 上再跑一次取返回值（与 mountKernel 内同一函数、同一 engine）。
  const st = buildState(g.engine, [runGenesis, initClock]);
  const r = runTransaction(g.engine, st, (tx) => runOpening(g.engine, st, tx));
  assert.equal(r.ok, true);
  const gaps = r.value.gaps;
  assert.equal(new Set(gaps).size, gaps.length);
  assert.deepEqual([...gaps, ...authored].sort(), [...byLevel].sort());
  assert.ok(gaps.every((id) => !authored.includes(id)));
  assert.ok(byLevel.every((id) => !Object.hasOwn(g.state.created, id)), '开局不写 gen.open 偏离行');
});

test('5 开局不进日志输入：日志簿条目 0；0 号快照已含 state.genesis', () => {
  const g = mountKernel(rawWorld(), caps(testTempRoot('s2a-log-')));
  assert.equal(g.logBook.entries.length, 0);
  assert.ok(g.logBook.snapshots.length >= 1);
  const snap = g.logBook.snapshots[0];
  assert.equal(snap.atEntry, 0);
  assert.deepEqual(snap.state.genesis, g.state.genesis);
});

test('6 烘焙层不进摘要：两次装配（烘焙树各自重建）saveDigest 相同；state 与存档文档不含烘焙层', () => {
  const raw = rawWorld();
  const a = mountKernel(raw, caps(testTempRoot('s2a-dg-a-')));
  const b = mountKernel(raw, caps(testTempRoot('s2a-dg-b-')));
  assert.notEqual(a.engine.bake.placeTree, b.engine.bake.placeTree);
  assert.equal(a.save(0).saveDigest, b.save(0).saveDigest);
  assert.ok(!Object.hasOwn(a.state, 'bake'));
  const doc = docOf(a.engine, a.state, a.logBook);
  const text = JSON.stringify(Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'doc_data')));
  assert.ok(!text.includes('"bake"') && !text.includes('"placeTree"') && !text.includes('"byLevel"'));
});

test('7 烘焙层可重建且一致：同一 doc_data 两次建树摘要相等；读档复演后重建的树摘要与开局相等；verifyBake 开着照常开局', async () => {
  const dir = testTempRoot('s2a-bake-');
  const g = await init(express.Router(), { saveRoot: dir });
  const d0 = placeTreeDigest(g.engine, g.engine.bake.placeTree);
  assert.equal(placeTreeDigest(g.engine, bakePlaceTree(g.engine.registry)), d0);
  const r = replay_apply(loadSlot(saveSlot(g), { saveRoot: dir }));
  assert.equal(placeTreeDigest(r.engine, r.engine.bake.placeTree), d0);
  assert.ok(mountKernel(rawWorld(), caps(dir, { verifyBake: true })).engine.bake);
  assert.throws(() => mountKernel(rawWorld(), caps(dir, { verifyBake: 'yes' })), code('E-DIM-STRUCT-FIELD'));
});

test('7b 树的形状：根唯一且在首位；祖先链与父节点一致；悬空父节点与成环各抛 E-DIM-REF-MISSING', () => {
  const raw = rawWorld();
  const g = mountKernel(raw, caps(testTempRoot('s2a-tree-')));
  const t = g.engine.bake.placeTree;
  const roots = t.byLevel.filter((id) => t.parentOf.get(id) === null);
  assert.equal(roots.length, 1);
  assert.equal(t.byLevel[0], roots[0]);
  for (const id of t.byLevel) {
    const anc = t.ancestorsOf(id);
    assert.equal(anc.length === 0 ? null : anc[0], t.parentOf.get(id));
    if (anc.length > 0) assert.equal(anc[anc.length - 1], roots[0]);
    for (const c of t.childrenOf.get(id)) assert.equal(t.parentOf.get(c), id);
  }
  const [leafA, leafB] = t.byLevel.slice(-2);
  const dangling = withRows(raw, t.kind, (rows) => ({ [leafA]: { ...rows[leafA], parent: `${leafA}_no_such_row` } }));
  assert.throws(() => mountKernel(dangling, caps(testTempRoot('s2a-tree2-'))), code('E-DIM-REF-MISSING'));
  const cycle = withRows(raw, t.kind, (rows) => ({ [leafA]: { ...rows[leafA], parent: leafB }, [leafB]: { ...rows[leafB], parent: leafA } }));
  assert.throws(() => mountKernel(cycle, caps(testTempRoot('s2a-tree3-'))), code('E-DIM-REF-MISSING'));
});

/** 从数据找一对 (被指种类, 指向它的 ref 维度所在表与维度)，两表各取首个实体行作 create 的模板（卷二:131）。 */
function refPair(engine) {
  const firstRow = (/** @type {string} */ k) => Object.keys(engine.registry.tables.get(k)?.rows || {}).sort()[0];
  for (const [host, doc] of engine.registry.tables) {
    for (const [d, def] of Object.entries(doc.dimensions || {})) {
      if (def && def.type === 'ref' && typeof def.kind === 'string' && engine.registry.tables.has(def.kind) && firstRow(def.kind) && firstRow(host)) {
        return { target: def.kind, targetTpl: firstRow(def.kind), host, hostTpl: firstRow(host), dimension: d };
      }
    }
  }
  return undefined;
}

test('8 真实开局后的闭环：新建实体、在另一新建实体写其 ref、耗时 30 分钟；落盘、日志与时钟；存读复演 saveDigest 一致', async () => {
  const dir = testTempRoot('s2a-loop-');
  const g = await init(express.Router(), { saveRoot: dir });
  const pair = refPair(g.engine);
  assert.ok(pair, '前提：数据里有指向可新建种类的 ref 维度');
  const start = clockMinute(g.engine, g.state);
  const r1 = g.submitProposal({ effects: [{ op: 'create', kind: pair.target, template: pair.targetTpl, facts: {} }] });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  const target = Object.keys(g.state.created).find((id) => g.state.created[id].kind === pair.target);
  const before = g.logBook.entries.filter((e) => e.kind === 'command').length;
  const r2 = g.submitProposal({ effects: [{ op: 'create', kind: pair.host, template: pair.hostTpl, facts: { [pair.dimension]: target } }, { op: 'time', minutes: 30 }] });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const host = Object.keys(g.state.created).find((id) => g.state.created[id].kind === pair.host);
  assert.equal(dim(g.engine, g.state, pair.host, host, pair.dimension).value, target);
  assert.equal(g.logBook.entries.filter((e) => e.kind === 'command').length, before + 1);
  assert.equal(clockMinute(g.engine, g.state), start + 30);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  assert.deepEqual({ ...r.opening() }, { ...g.opening() });
});
