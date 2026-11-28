// S1-1 卡 C 单测：挂载与启动强断言（写码方自补，不作验收依据）。
// 覆盖：caps 五项缺失/错形各抛（建 engine 前、不写存档）、unitOfPath 缺省合法与按单元分片缺映射即抛、modified 无兜底、
// inputsOf 同对象且冻结、未声明节点、闭包与环、读档后续玩与一口气跑完的 saveDigest 相等、doc_data 含全部登记规则表。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot（不清理）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners, shardDirOf } from '../../server-plugin/rules/load/registry-shards.mjs';
import { closeInputs, inputsOf } from '../../server-plugin/kernel/memo.mjs';
import { dim, modified } from '../../server-plugin/kernel/dimensions.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const code = (c) => (e) => /** @type {any} */ (e).code === c;

/**
 * state-owners 声明表 = 主文件与 state-owners.d/ 分片的合并（S2-TP1 主会话授权改夹具：开局一步写持有边与账本后须带分片登记）；
 * 合并只调生产入口 rules/load/registry-shards.mjs 的 shardDirOf、mergeOwners，测试只读文件。
 */
function ownersOf(o, json) {
  const main = 'world/ontology/state-owners.json';
  const dir = new URL(`../../${shardDirOf(main)}/`, o);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `${shardDirOf(main)}/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  // 合并结果冻结；测试副本要可改，取一份深拷贝（同 s2-p-position.test.mjs 的 clone(owners())）。
  return JSON.parse(JSON.stringify(mergeOwners({ file: main, doc: json('state-owners.json') }, shards).doc));
}

/** 世界数据原文（与 index.mjs 同形：规则表按 registry.json 每行 file 读，按 code 收进 tableDocs）。 */
function rawWorld() {
  const o = new URL('../../world/ontology/', import.meta.url);
  const json = (f) => JSON.parse(readFileSync(new URL(f, o), 'utf8'));
  const dir = new URL('dimensions/', o);
  const registryRows = json('../rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'),
    owners: ownersOf(o, json),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`../rules/${r.file}`)])),
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
    unitsDoc: json('dimensions/_units.json'),
  };
}

const rootUrl = (dir) => pathToFileURL(join(dir, '/'));
const goodCaps = (dir) => ({ digestCap: createDigestCap(), saveRoot: rootUrl(dir), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });

test('caps 五项：缺失或错形各抛 E-DIM-STRUCT-FIELD，消息带字段名，抛出前不写任何存档文件', () => {
  const dir = testTempRoot('s1c-caps-');
  const raw = rawWorld();
  const base = goodCaps(dir);
  /** @type {Array<[string, any]>} */
  const bad = [
    ['saveRoot', undefined], ['saveRoot', new URL('http://example.invalid/')], ['saveRoot', new URL(pathToFileURL(join(dir, 'no-slash')).href)],
    ['digestCap', undefined], ['digestCap', {}],
    ['sources', undefined], ['sources', []], ['sources', [{ path: '', text: '' }]],
    ['modifierSources', undefined], ['modifierSources', [1]],
    ['unitOfPath', 'not-a-function'],
  ];
  for (const [name, value] of bad) {
    const caps = { ...base, [name]: value };
    if (value === undefined) delete caps[name];
    assert.throws(() => mountKernel(raw, /** @type {any} */ (caps)), (/** @type {any} */ e) => code('E-DIM-STRUCT-FIELD')(e) && String(e.message).includes(`caps.${name}`), `${name}=${String(value)}`);
  }
  assert.deepEqual(readdirSync(dir), []);
  assert.ok(mountKernel(raw, base).engine);
  assert.ok(mountKernel(raw, { ...base, unitOfPath: () => 'u' }).engine);
});

test('unitOfPath 缺省合法（分片全为整片）；分片表某部分改按单元分片而无映射即 E-SAVE-SHARD-UNCOVERED', () => {
  const dir = testTempRoot('s1c-shard-');
  const raw = rawWorld();
  const g = mountKernel(raw, goodCaps(dir));
  assert.equal(g.engine.unitOfPath, undefined);
  const rows = raw.tableDocs.saveLayout.rows.map((r) => (r.key === 'shards' ? { ...r, value: { ...r.value, doc_state: 'part_by_unit' } } : r));
  const copy = { ...raw, tableDocs: { ...raw.tableDocs, saveLayout: { ...raw.tableDocs.saveLayout, rows } } };
  assert.throws(() => mountKernel(copy, goodCaps(dir)), code('E-SAVE-SHARD-UNCOVERED'));
});

test('modified 无兜底：engine 没有 modifierSources 数组即抛；空数组时 value 等于 dim 的 value', async () => {
  const g = await init(express.Router());
  // 取任一实体行自带、且在本表登记过的维度（从数据里找，不写死 kind 与维度）。
  const [kind, id, dimension] = [...g.engine.registry.tables].flatMap(([k, d]) => Object.entries(d.rows || {})
    .flatMap(([rid, row]) => Object.keys(row || {}).filter((dm) => Object.hasOwn(d.dimensions || {}, dm)).map((dm) => [k, rid, dm])))[0];
  assert.equal(modified(g.engine, g.state, kind, id, dimension).value, dim(g.engine, g.state, kind, id, dimension).value);
  const { modifierSources, ...rest } = g.engine;
  assert.throws(() => modified(rest, g.state, kind, id, dimension), code('E-DIM-STRUCT-FIELD'));
  assert.throws(() => modified({ ...rest, modifierSources: null }, g.state, kind, id, dimension), code('E-DIM-STRUCT-FIELD'));
});

test('inputsOf：已登记 kind 的 dim 节点两次取同一冻结对象；未声明节点 E-VIEW-UNDECLARED-READ；engine 无 inputs 即 E-DIM-STRUCT-FIELD', async () => {
  const g = await init(express.Router());
  const kind = [...g.engine.registry.tables.keys()][0];
  const a = inputsOf(g.engine, `dim:${kind}`);
  assert.equal(inputsOf(g.engine, `dim:${kind}`), a);
  assert.ok(Object.isFrozen(a) && a.every((p) => Object.isFrozen(p)));
  assert.throws(() => inputsOf(g.engine, 'view:__nope'), code('E-VIEW-UNDECLARED-READ'));
  assert.throws(() => inputsOf(g.engine, 'nocolon'), code('E-VIEW-UNDECLARED-READ'));
  const { inputs, ...rest } = g.engine;
  assert.throws(() => inputsOf(rest, `dim:${kind}`), code('E-DIM-STRUCT-FIELD'));
});

test('closeInputs：闭包含被调用节点的 own、按名通配解析、改被调用者 own 调用者随之变；成环与未声明 uses 各抛', () => {
  const decl = (node, own, uses = []) => ({ node, own, uses });
  const m = closeInputs([decl('v:a', [['x']], ['v:b']), decl('v:b', [['y']], ['w:q']), decl('w:*', [['z', '*']])]);
  assert.deepEqual(m.get('v:a'), [['x'], ['y'], ['z', '*']]);
  assert.ok(Object.isFrozen(m.get('v:a')));
  const m2 = closeInputs([decl('v:a', [['x']], ['v:b']), decl('v:b', [['y2']])]);
  assert.deepEqual(m2.get('v:a'), [['x'], ['y2']]);
  assert.throws(() => closeInputs([decl('v:a', [['x']], ['v:b']), decl('v:b', [['y']], ['v:a'])]), code('E-VIEW-DEPS-CYCLE'));
  assert.throws(() => closeInputs([decl('v:a', [['x']], ['v:a'])]), code('E-VIEW-DEPS-CYCLE'));
  assert.throws(() => closeInputs([decl('v:a', [['x']], ['v:missing'])]), code('E-VIEW-UNDECLARED-READ'));
  assert.throws(() => closeInputs([decl('v:a', [['x']]), decl('v:a', [['y']])]), code('E-DIM-STRUCT-FIELD'));
});

test('读档后接着玩：replay_apply 返回与 init 同形；推进后再存读，saveDigest 等于不存读一口气跑完的世界', async () => {
  const dirA = testTempRoot('s1c-resume-a-');
  const dirB = testTempRoot('s1c-resume-b-');
  const g = await init(express.Router(), { saveRoot: dirA });
  const step = g.engine.host.heartbeatStepMinutes;
  g.submitProposal({ effects: [{ op: 'time', minutes: step + 3 }] });
  const r = replay_apply(loadSlot(saveSlot(g), { saveRoot: dirA }));
  for (const k of ['engine', 'state', 'logBook', 'submitProposal', 'advance', 'save', 'saveDigest']) assert.ok(Object.hasOwn(r, k), k);
  const before = clockMinute(r.engine, r.state);
  r.advance(step);
  assert.equal(clockMinute(r.engine, r.state), before + step);
  r.submitProposal({ effects: [{ op: 'time', minutes: 2 }] });
  const resumed = replay_apply(loadSlot(r.save(0), { saveRoot: dirA }));

  const straight = await init(express.Router(), { saveRoot: dirB });
  straight.submitProposal({ effects: [{ op: 'time', minutes: step + 3 }] });
  straight.advance(step);
  straight.submitProposal({ effects: [{ op: 'time', minutes: 2 }] });
  const saved = straight.save(0);
  assert.equal(resumed.saveDigest, saved.saveDigest);
  assert.equal(clockMinute(resumed.engine, resumed.state), 2 * step + 5);
});

test('doc_data 含 registry.json 登记的每张规则表（按登记行 code 逐一核在）', async () => {
  const dir = testTempRoot('s1c-docdata-');
  const g = await init(express.Router(), { saveRoot: dir });
  const loaded = loadSlot(saveSlot(g), { saveRoot: dir });
  const codes = rawWorld().registryRows.map((r) => r.code);
  assert.ok(codes.length > 0);
  assert.deepEqual(Object.keys(loaded.docData.tableDocs).sort(), [...codes].sort());
});
