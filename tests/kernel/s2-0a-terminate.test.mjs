// S2-0a 单测：终止协议骨架（卷二 §2.6 :552–:562；S2-0 接口草案 §6 中本子卡那组：拒写、去留表、覆盖核对、不可终止种类、未建数据门、
// 身死与终止同事务、事件只在提交时进日志）。写码方自补，不作验收依据。
// 期望值从世界数据现算（日长取单位表 day / minute 的 si 之比），不抄仓库计数；坏数据、额外登记一律改测试副本，不改 world/。
// 可终止的实体用开局真实数据里的组织模板行（org 表类别行写了 termination）；人与鸡的类别行由物种派生，现数据物种行不挂 class_person_*（归 S2-0b），
// 这里用测试副本给物种行补类别来测 classesFrom 读法。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { canonical, createEntity, setEntityProp, writePath, readPath, deleteMatch } from '../../server-plugin/kernel/storage.mjs';
import { classRowsOf } from '../../server-plugin/kernel/dimensions.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { terminate, terminationResidue, checkTerminationTables } from '../../server-plugin/rules/lifecycle/terminate.mjs';
import { checkRecordCoverage, deleteRecords } from '../../server-plugin/rules/lifecycle/records.mjs';
import { addStatus, statusView, clearStatusesOf } from '../../server-plugin/rules/status/status.mjs';
import { terminated, dead } from '../../server-plugin/rules/body/action-capacity.mjs';

const ONT = new URL('../../world/ontology/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, ONT), 'utf8'));

/** 世界数据原文（与 index.mjs#readWorld 同形）。 */
function rawWorld() {
  const dir = new URL('dimensions/', ONT);
  const registryRows = json('../rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`../rules/${r.file}`)])),
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
    unitsDoc: json('dimensions/_units.json'),
  };
}
const caps = () => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot('s2-0a'), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const mount = (raw) => mountKernel(raw, caps());
const docOf = (raw, kind) => raw.dimensionDocs.find((d) => d.kind === kind);
const code = (c) => (e) => /** @type {any} */ (e).code === c;

// 世界数据现算的日长（卷二十 :504 日 = 分钟的单位换算）。
const units = json('dimensions/_units.json').units;
const MINUTES_PER_DAY = units.find((u) => u.id === 'day').si / units.find((u) => u.id === 'minute').si;
// 现数据里任取一条组织模板行与一个状态族 terminal 为真的状态行，按数据挑，不点名。
const ORG_TEMPLATE = Object.keys(docOf(rawWorld(), 'org').rows).sort()[0];
const vocab = json('dimensions/_vocab.json').families;
const TERMINAL_STATUS = Object.entries(docOf(rawWorld(), 'status').rows).find(([, r]) => vocab.status_family.entries[r.family].terminal === true)[0];
const CAUSE = 'verb_death_event';

/** 经真实 create 提案建一个组织实体，返回其 id。 */
function createOrg(w) {
  const r = w.submitProposal({ effects: [{ op: 'create', kind: 'org', template: ORG_TEMPLATE, facts: {} }] });
  assert.equal(r.ok, true, `create rejected: ${r.code}`);
  const ids = Object.keys(w.state.created).filter((id) => w.state.created[id].template === ORG_TEMPLATE);
  return ids[ids.length - 1];
}
const tx = (w, fn) => runTransaction(w.engine, w.state, fn);

test('组织实体经 classRowsOf 读到类别行 termination，终止后标记、残骸与事件齐全，谓词为真', () => {
  const w = mount(rawWorld());
  const id = createOrg(w);
  const rows = classRowsOf(w.engine, w.state, 'org', id).map(([rid]) => rid);
  assert.equal(rows[0], ORG_TEMPLATE);
  assert.ok(rows.includes(docOf(rawWorld(), 'org').rows[ORG_TEMPLATE].extends));
  assert.equal(terminated(w.engine, w.state, id).ok, false);
  const minute = clockMinute(w.engine, w.state);
  const r = tx(w, (t) => terminate(w.state, id, CAUSE, null, t));
  assert.equal(r.ok, true, `terminate rejected: ${r.code}`);
  const { mode, successorId } = r.value;
  assert.equal(mode, 'wreck');
  assert.deepEqual(readPath(w.state, w.engine.P.terminated(id)), { day: Math.floor(minute / MINUTES_PER_DAY), cause: CAUSE, mode: 'wreck' });
  assert.equal(w.state.created[successorId].kind, 'item');
  assert.ok(successorId.startsWith('item_wreck_') && successorId.endsWith(`_${minute}`));
  assert.equal(r.events.length, 1);
  assert.deepEqual({ ...r.events[0] }, { verb: 'verb_entity_terminated', payload: { id, cause: CAUSE, source: null, mode: 'wreck', successorId }, targets: [id] });
  assert.deepEqual({ ...terminated(w.engine, w.state, id) }, { ok: true, reason: CAUSE });
  assert.equal(dead, terminated);
  assert.equal(terminationResidue(w.engine, w.state, id).ok, true);
});

test('拒写：终止后对该实体的写入一律 E-TERM-RESIDUE，整笔回滚，state 逐位不变；再终止同码', () => {
  const w = mount(rawWorld());
  const id = createOrg(w);
  assert.equal(tx(w, (t) => terminate(w.state, id, CAUSE, null, t)).ok, true);
  const before = canonical(w.state);
  const p = w.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: 'supplyDays', value: 1 }] });
  assert.deepEqual([p.ok, p.code], [false, 'E-TERM-RESIDUE']);
  assert.equal(tx(w, (t) => setEntityProp(w.state, id, 'supplyDays', 1, t)).code, 'E-TERM-RESIDUE');
  assert.equal(tx(w, (t) => addStatus(w.engine, w.state, id, 'inst_1', TERMINAL_STATUS, t)).code, 'E-TERM-RESIDUE');
  assert.equal(tx(w, (t) => terminate(w.state, id, CAUSE, null, t)).code, 'E-TERM-RESIDUE');
  assert.equal(canonical(w.state), before);
});

test('身死与终止同事务：terminal 族实例在、标记未写的那一段谓词已为真；终止后实例清空、没有残留', () => {
  const w = mount(rawWorld());
  const id = createOrg(w);
  const r = tx(w, (t) => {
    addStatus(w.engine, w.state, id, 'inst_1', TERMINAL_STATUS, t);
    const mid = terminated(w.engine, w.state, id);
    terminate(w.state, id, CAUSE, null, t);
    return mid;
  });
  assert.equal(r.ok, true, `rejected: ${r.code}`);
  assert.deepEqual({ ...r.value }, { ok: true, reason: TERMINAL_STATUS });
  assert.equal(statusView(w.engine, w.state, id).length, 0);
  assert.deepEqual({ ...terminated(w.engine, w.state, id) }, { ok: true, reason: CAUSE });
});

test('去留表：keep 的偏离行留着；clear 与（窗口为 0 时的）hold 整条删除，删空的上级一并删去', () => {
  const raw = rawWorld();
  // 测试副本：登一个带主体段的状态键，两条模式分属 clear 与 hold 两类记录。
  raw.owners.stateKeys.probe = { writers: { '*': { create: ['tests'], rewrite: null, viaRelocate: false } },
    subjectRecords: { 'probe.*.a': { recordClass: 'rcls_name_history', subjectSegments: [1] }, 'probe.*.b': { recordClass: 'rcls_revive_points', subjectSegments: [1] } } };
  raw.owners.pathTypes['probe.*.a'] = 'integer:count';
  raw.owners.pathTypes['probe.*.b'] = 'integer:count';
  raw.owners.keyKinds['probe.*.a'] = [['org']];
  raw.owners.keyKinds['probe.*.b'] = [['org']];
  raw.tableDocs.terminate.rows.find((r) => r.key === 'records').value.rcls_name_history = { atTerminate: 'clear' };
  const w = mount(raw);
  const id = createOrg(w);
  const other = createOrg(w);
  const r = tx(w, (t) => {
    setEntityProp(w.state, id, 'supplyDays', 3, t);
    for (const who of [id, other]) {
      writePath(w.state, w.engine.P.probe_a(who), 1, t);
      writePath(w.state, w.engine.P.probe_b(who), 2, t);
    }
    terminate(w.state, id, CAUSE, null, t);
  });
  assert.equal(r.ok, true, `rejected: ${r.code}`);
  assert.equal(w.state.created[id].props.supplyDays, 3);
  assert.equal(Object.hasOwn(w.state.probe, id), false);
  assert.deepEqual(w.state.probe[other], { a: 1, b: 2 });
});

test('覆盖核对：现数据通过；含可终止实体段却没登记去留的模式、或去留引用了没有取值的记录类，E-TERM-RECORD-UNLISTED', () => {
  checkRecordCoverage(mount(rawWorld()).engine);
  checkTerminationTables(mount(rawWorld()).engine);
  const raw = rawWorld();
  raw.owners.stateKeys.probe = { writers: { '*': { create: ['tests'], rewrite: null, viaRelocate: false } } };
  raw.owners.pathTypes['probe.*'] = 'integer:count';
  raw.owners.keyKinds['probe.*'] = [['person']];
  assert.throws(() => checkRecordCoverage(mount(raw).engine), code('E-TERM-RECORD-UNLISTED'));
  const raw2 = rawWorld();
  raw2.owners.stateKeys.created.subjectRecords['created.*.props.*'].recordClass = 'rcls_unknown_probe';
  assert.throws(() => checkRecordCoverage(mount(raw2).engine), code('E-TERM-RECORD-UNLISTED'));
});

test('不可终止种类：物品实体、类别行没写 termination 的人物，终止整笔拒收（E-TERM-RESIDUE），state 不变', () => {
  // S2-0b 起现数据物种行挂了 class_person_*：测试副本去掉它们，造「没写 termination 的人物」（只改前提，不改期望）。
  const raw = rawWorld();
  const personClasses = Object.keys(docOf(raw, 'person').classes);
  for (const row of Object.values(docOf(raw, 'species').rows)) row.classes = row.classes.filter((c) => !personClasses.includes(c));
  const w = mount(raw);
  const before = canonical(w.state);
  const species = Object.keys(docOf(raw, 'species').rows).sort()[0];
  const r = tx(w, (t) => {
    createEntity(w.state, 'item_probe_1', 'item', {}, t);
    terminate(w.state, 'item_probe_1', CAUSE, null, t);
  });
  assert.equal(r.code, 'E-TERM-RESIDUE');
  const r2 = tx(w, (t) => {
    createEntity(w.state, 'creature_probe_1', 'person', {}, t);
    setEntityProp(w.state, 'creature_probe_1', 'species', species, t);
    terminate(w.state, 'creature_probe_1', CAUSE, null, t);
  });
  assert.equal(r2.code, 'E-TERM-RESIDUE');
  assert.equal(canonical(w.state), before);
});

test('classesFrom：人物的类别行由其物种行的 classes 派生（测试副本给物种行补类别），读到 termination 即可终止', () => {
  const raw = rawWorld();
  const species = Object.keys(docOf(raw, 'species').rows).sort()[0];
  const beast = Object.keys(docOf(raw, 'person').classes).find((c) => docOf(raw, 'person').classes[c].termination.mode === 'wreck');
  docOf(raw, 'species').rows[species].classes = [...docOf(raw, 'species').rows[species].classes, beast];
  const w = mount(raw);
  const r = tx(w, (t) => {
    createEntity(w.state, 'creature_probe_1', 'person', {}, t);
    setEntityProp(w.state, 'creature_probe_1', 'species', species, t);
    // S2-0b 起终止时清理函数 settleBody 要算尸体（卷四 L-2 个体质量）：探针补两个 always 维度（只改前提，不改期望）。
    setEntityProp(w.state, 'creature_probe_1', 'adultMassKg', 1, t);
    setEntityProp(w.state, 'creature_probe_1', 'birthMinute', clockMinute(w.engine, w.state), t);
    assert.deepEqual(classRowsOf(w.engine, w.state, 'person', 'creature_probe_1').map(([c]) => c), [beast]);
    return terminate(w.state, 'creature_probe_1', CAUSE, null, t);
  });
  assert.equal(r.ok, true, `rejected: ${r.code}`);
  assert.equal(r.value.mode, 'wreck');
});

test('未建数据门（R7）：类别行 reviveWindowDays > 0 或 successorRX 非空，登记核对报 E-ACT-WRITER-NOT-READY', () => {
  for (const patch of [{ reviveWindowDays: 1 }, { successorRX: 'org.parent' }]) {
    const raw = rawWorld();
    const cls = docOf(raw, 'person').classes;
    const first = Object.keys(cls).sort()[0];
    cls[first].termination = { ...cls[first].termination, ...patch };
    assert.throws(() => checkTerminationTables(mount(raw).engine), code('E-ACT-WRITER-NOT-READY'));
  }
});

test('清理函数登记了却没交函数：终止整笔回滚（E-DIM-REF-MISSING），残骸不留、事件不出', () => {
  const raw = rawWorld();
  raw.owners.systems.probe = { terminationCleanup: { kinds: ['org'], handler: 'rules/probe.mjs#cleanup', sortKey: 0 } };
  const w = mount(raw);
  const id = createOrg(w);
  const before = canonical(w.state);
  const r = tx(w, (t) => terminate(w.state, id, CAUSE, null, t));
  assert.deepEqual([r.ok, r.code, r.events], [false, 'E-DIM-REF-MISSING', undefined]);
  assert.equal(canonical(w.state), before);
});

test('cause 不是 verb 族条目即拒；source 只收句柄串或 null', () => {
  const w = mount(rawWorld());
  const id = createOrg(w);
  assert.equal(tx(w, (t) => terminate(w.state, id, 'not_a_verb', null, t)).code, 'E-DIM-REF-MISSING');
  assert.equal(tx(w, (t) => terminate(w.state, id, CAUSE, '', t)).code, 'E-DIM-STRUCT-FIELD');
  assert.equal(terminated(w.engine, w.state, id).ok, false);
});

test('终止后删除同样拒写：deleteMatch、deleteRecords、clearStatusesOf 对已终止实体名下路径一律 E-TERM-RESIDUE，state 不变', () => {
  const w = mount(rawWorld());
  const id = createOrg(w);
  assert.equal(tx(w, (t) => { setEntityProp(w.state, id, 'supplyDays', 3, t); terminate(w.state, id, CAUSE, null, t); }).ok, true);
  const before = canonical(w.state);
  const keep = Object.keys(w.state.created[id].props).map((f) => ['created', id, 'props', f]);
  assert.ok(keep.length > 0);
  assert.equal(tx(w, (t) => deleteMatch(w.engine, w.state, 'created.*.props.*', keep[0], t)).code, 'E-TERM-RESIDUE');
  assert.equal(tx(w, (t) => deleteRecords(w.engine, w.state, id, ['keep'], t)).code, 'E-TERM-RESIDUE');
  assert.equal(tx(w, (t) => deleteMatch(w.engine, w.state, 'statuses.*.*.status', ['statuses', id, 'inst_1', 'status'], t)).code, 'E-TERM-RESIDUE');
  assert.equal(tx(w, (t) => clearStatusesOf(w.engine, w.state, id, t)).ok, true);
  assert.equal(canonical(w.state), before);
});

test('classRowsOf 只取列在 precedenceGroups.default 里的类别行，组外类别不追加（卷二:156–:157）', () => {
  const raw = rawWorld();
  const species = Object.keys(docOf(raw, 'species').rows).sort()[0];
  const person = docOf(raw, 'person');
  const [inGroup, outGroup] = person.precedenceGroups.default;
  person.precedenceGroups.default = [inGroup];
  docOf(raw, 'species').rows[species].classes = [...docOf(raw, 'species').rows[species].classes, outGroup, inGroup];
  const w = mount(raw);
  const r = tx(w, (t) => {
    createEntity(w.state, 'creature_probe_1', 'person', {}, t);
    setEntityProp(w.state, 'creature_probe_1', 'species', species, t);
    return classRowsOf(w.engine, w.state, 'person', 'creature_probe_1').map(([c]) => c);
  });
  assert.equal(r.ok, true, `rejected: ${r.code}`);
  assert.deepEqual(r.value, [inGroup]);
});
