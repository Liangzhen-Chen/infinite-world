// S2-SH 登记分片合并（server-plugin/rules/load/registry-shards.mjs；草案 §2、§3、§4）：合并次序确定、冲突与非法段被拒、无分片时原样；
// 真实 init 起局的 dataPacksDigest 与「owners 换成主文件原文」重算相等；mount 收齐的登记序列与各系统模块导出的登记项一致。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import express from 'express';
import { mergeOwners, mergeEntries, shardDirOf } from '../../server-plugin/rules/load/registry-shards.mjs';
import { init } from '../../server-plugin/index.mjs';
import { dataPacksDigestOf } from '../../server-plugin/kernel/save.mjs';
import { SETTLE_BODY_CLEANUP, DIE_BY_DESTROY_TRIGGER } from '../../server-plugin/rules/body/death.mjs';
import { PERSON_INSTANTIATOR } from '../../server-plugin/rules/body/person.mjs';
import { testTempRoot, removeTempRoot } from '../accept/temp-root.mjs';
import { DOMAINS } from '../../server-plugin/rules/load/domains.mjs';

const MAIN = 'world/ontology/state-owners.json';
const DIR = shardDirOf(MAIN);
const shard = (name, doc) => ({ file: `${DIR}/${name}`, doc });
const ns = (n, type = 'number') => ({ ns: n, type });
const main = () => ({ file: MAIN, doc: {
  version: 1, pathTypes: { 'a.*': 'string' }, rxNamespaces: [ns('x')], stateKeys: { a: { writers: {} }, clock: { writers: { '*': { create: ['rules/a.mjs'] } } } }, phases: ['p'],
  keyKinds: { 'c.*.props.*': [['item'], 'dimKey'] }, systems: { death: { terminationCleanup: { kinds: ['person'] } } },
  kernelApi: { exports: [{ export: 'kernel/a.mjs#f', callers: ['rules'] }] }, groupApi: { exports: [{ export: 'textcore/a.mjs#g', callers: ['gate'] }] }, textPaths: ['names.*.text'],
} });
const dirs = [];
after(() => { for (const d of dirs) removeTempRoot(d); });

test('分片目录由主文件名派生：去掉 .json 加 .d', () => {
  assert.equal(DIR, 'world/ontology/state-owners.d');
});

test('无分片：原样返回主文件对象（同一对象、冻结），originOf 一律主文件', () => {
  const m = main();
  const r = mergeOwners(m, []);
  assert.equal(r.doc, m.doc);
  assert.ok(Object.isFrozen(r.doc) && Object.isFrozen(m.doc.pathTypes));
  assert.equal(r.originOf(['pathTypes', 'a.*']), MAIN);
});

test('合并：新键出现、对象逐键递归、数组按 主文件 → a → b 次序；originOf 指出登记文件', () => {
  const a = shard('a.json', { pathTypes: { 'b.*': 'integer' }, rxNamespaces: [ns('y')], stateKeys: { a: { subjectRecords: ['r'] } } });
  const b = shard('b.json', { rxNamespaces: [ns('z')] });
  const r = mergeOwners(main(), [b, a]);
  const doc = Object(r.doc);
  assert.deepEqual(doc.pathTypes, { 'a.*': 'string', 'b.*': 'integer' });
  assert.deepEqual(doc.rxNamespaces, [ns('x'), ns('y'), ns('z')]);
  assert.deepEqual(doc.stateKeys.a, { writers: {}, subjectRecords: ['r'] });
  assert.equal(r.originOf(['pathTypes', 'b.*']), a.file);
  assert.equal(r.originOf(['pathTypes', 'a.*']), MAIN);
  assert.equal(r.originOf(['rxNamespaces', 2]), b.file);
  assert.equal(r.originOf(['stateKeys', 'a', 'subjectRecords', 0]), a.file);
  // 同一输入两次结果一致；互换文件名，数组次序跟着变，对象内容不变。
  assert.deepEqual(mergeOwners(main(), [a, b]).doc, r.doc);
  const swapped = Object(mergeOwners(main(), [shard('b.json', a.doc), shard('a.json', b.doc)]).doc);
  assert.deepEqual(swapped.rxNamespaces, [ns('x'), ns('z'), ns('y')]);
  assert.deepEqual(swapped.pathTypes, doc.pathTypes);
});

test('拒绝：同一键两处登记、数组重复元素即 E-DIM-DUPLICATE-KEY（消息带文件名）', () => {
  const a = shard('a.json', { pathTypes: { 'b.*': 'integer' } });
  const b = shard('b.json', { pathTypes: { 'b.*': 'integer' } });
  assert.throws(() => mergeOwners(main(), [a, b]), (e) => Object(e).code === 'E-DIM-DUPLICATE-KEY' && String(Object(e).message).includes(b.file));
  assert.throws(() => mergeOwners(main(), [shard('c.json', { pathTypes: { 'a.*': 'string' } })]), { code: 'E-DIM-DUPLICATE-KEY' });
  assert.throws(() => mergeOwners(main(), [shard('c.json', { rxNamespaces: [ns('x')] })]), (e) => Object(e).code === 'E-DIM-DUPLICATE-KEY' && String(Object(e).message).includes('c.json'));
  assert.throws(() => mergeOwners(main(), [shard('c.json', { stateKeys: { a: { writers: [] } } })]), { code: 'E-DIM-DUPLICATE-KEY' });
});

const dupKey = (file, key) => (e) => Object(e).code === 'E-DIM-DUPLICATE-KEY' && String(Object(e).message).includes(file) && String(Object(e).message).includes(key);

test('拒绝：分片里同 id（同 ns）异内容——rxNamespaces 同 ns 不同内容（主文件已有、或两个分片各登一次）即 E-DIM-DUPLICATE-KEY，主文件不变；新 ns 照常追加', () => {
  const m = main();
  assert.throws(() => mergeOwners(m, [shard('c.json', { rxNamespaces: [ns('x', 'string')] })]), dupKey('c.json', '"x"'));
  assert.throws(() => mergeOwners(main(), [shard('c.json', { rxNamespaces: [ns('y')] }), shard('d.json', { rxNamespaces: [ns('y', 'string')] })]), dupKey('d.json', '"y"'));
  assert.throws(() => mergeOwners(main(), [shard('c.json', { rxNamespaces: [ns('y'), ns('y', 'string')] })]), dupKey('c.json', '"y"'));
  assert.deepEqual(m.doc.rxNamespaces, [ns('x')]);
  assert.deepEqual(Object(mergeOwners(main(), [shard('c.json', { rxNamespaces: [ns('y')] })]).doc).rxNamespaces, [ns('x'), ns('y')]);
});

test('拒绝：分片里同 id（同 export）异内容——kernelApi.exports、groupApi.exports 同 export 不同内容即 E-DIM-DUPLICATE-KEY', () => {
  assert.throws(() => mergeOwners(main(), [shard('c.json', { kernelApi: { exports: [{ export: 'kernel/a.mjs#f', callers: ['gate'] }] } })]), dupKey('c.json', 'kernel/a.mjs#f'));
  assert.throws(() => mergeOwners(main(), [shard('c.json', { groupApi: { exports: [{ export: 'textcore/a.mjs#g', callers: ['rules'] }] } })]), dupKey('c.json', 'textcore/a.mjs#g'));
  const ok = Object(mergeOwners(main(), [shard('c.json', { kernelApi: { exports: [{ export: 'kernel/b.mjs#h', callers: ['rules'] }] } })]).doc);
  assert.deepEqual(ok.kernelApi.exports.map((e) => e.export), ['kernel/a.mjs#f', 'kernel/b.mjs#h']);
});

test('拒绝：textPaths 重复路径即 E-DIM-DUPLICATE-KEY；新路径照常追加', () => {
  assert.throws(() => mergeOwners(main(), [shard('c.json', { textPaths: ['names.*.text'] })]), dupKey('c.json', 'names.*.text'));
  assert.deepEqual(Object(mergeOwners(main(), [shard('c.json', { textPaths: ['notes.*.text'] })]).doc).textPaths, ['names.*.text', 'notes.*.text']);
});

test('拒绝：keyKinds 定长元组被分片追加——表外数组（keyKinds 定长元组、写者 create 列表、systems 种类）被分片追加即 E-DIM-DUPLICATE-KEY，主文件不变', () => {
  const m = main();
  for (const doc of [
    { keyKinds: { 'c.*.props.*': [['species']] } },
    { stateKeys: { clock: { writers: { '*': { create: ['rules/x.mjs'] } } } } },
    { systems: { death: { terminationCleanup: { kinds: ['org'] } } } },
  ]) assert.throws(() => mergeOwners(m, [shard('c.json', doc)]), { code: 'E-DIM-DUPLICATE-KEY' });
  assert.deepEqual(m.doc.keyKinds['c.*.props.*'], [['item'], 'dimKey']);
  assert.deepEqual(m.doc.stateKeys.clock.writers['*'].create, ['rules/a.mjs']);
  assert.deepEqual(m.doc.systems.death.terminationCleanup.kinds, ['person']);
});

test('拒绝：分片里出现只许在主文件的段、文件名不合文法、分片不是对象即 E-DIM-STRUCT-FIELD', () => {
  for (const doc of [{ phases: ['q'] }, { importMatrix: {} }, { version: 2 }]) {
    assert.throws(() => mergeOwners(main(), [shard('a.json', doc)]), (e) => Object(e).code === 'E-DIM-STRUCT-FIELD' && String(Object(e).message).includes('a.json'));
  }
  for (const name of ['Geo.json', '1a.json', 'a_b.json', 'a.json5']) {
    assert.throws(() => mergeOwners(main(), [shard(name, {})]), { code: 'E-DIM-STRUCT-FIELD' });
  }
  assert.throws(() => mergeOwners(main(), [shard('a.json', [])]), { code: 'E-DIM-STRUCT-FIELD' });
});

test('entry-registry：主文件原序在前、分片按文件名追加不重排；跨文件同行键即 E-DIM-DUPLICATE-KEY（重复行键）', () => {
  const row = (name, file) => ({ name, file });
  const m = { file: 'tools/accept/entry-registry.json', doc: { version: 1, kinds: ['part'], entries: [row('z', 'z.mjs'), row('a', 'a.mjs')] } };
  const none = mergeEntries(m, []);
  assert.equal(none.registry, m.doc);
  const s2 = { file: 'tools/accept/entry-registry.d/b.json', doc: { entries: [row('c', 'c.mjs')] } };
  const s1 = { file: 'tools/accept/entry-registry.d/a.json', doc: { entries: [row('b', 'b.mjs'), row('b', 'b.mjs')] } };
  const r = mergeEntries(m, [s2, s1]);
  assert.deepEqual(Object(r.registry).entries.map((e) => e.name), ['z', 'a', 'b', 'b', 'c']);
  assert.deepEqual(Object(r.registry).kinds, ['part']);
  assert.deepEqual([0, 2, 4].map(r.sourceOf), [m.file, s1.file, s2.file]);
  const dup = { file: 'tools/accept/entry-registry.d/c.json', doc: { entries: [row('a', 'a.mjs')] } };
  assert.throws(() => mergeEntries(m, [dup]), (e) => Object(e).code === 'E-DIM-DUPLICATE-KEY' && String(Object(e).message).includes('重复行键') && String(Object(e).message).includes(dup.file));
  assert.throws(() => mergeEntries(m, [{ file: 'tools/accept/entry-registry.d/c.json', doc: { entries: [], kinds: [] } }]), { code: 'E-DIM-STRUCT-FIELD' });
});

// S2-L 改（主会话裁定 2 甲）：原断言 owners 即主文件原文、登记项只有 body 那几项，是「尚无分片」的偶然现状；改为 owners = 主文件加磁盘上全部分片的合并结果，
// 登记项 = DOMAINS 各域 manifest 导出字段按域升序的并集（各域导出值由各系统模块产出，逐项同一对象）。
test('真实 init：dataPacksDigest 与 owners 换成主文件加全部分片合并结果重算的值相等；mount 收齐的登记项即各域 manifest 导出的并集（按域序）', async () => {
  const dir = testTempRoot('s2-sh-');
  dirs.push(dir);
  const world = await init(express.Router(), { saveRoot: dir });
  const { engine } = world;
  const shardDir = new URL(`../../${DIR}/`, import.meta.url);
  const names = existsSync(shardDir) ? readdirSync(shardDir).filter((n) => n.endsWith('.json')).sort() : [];
  const owners = mergeOwners({ file: MAIN, doc: JSON.parse(readFileSync(new URL(`../../${MAIN}`, import.meta.url), 'utf8')) },
    names.map((n) => shard(n, JSON.parse(readFileSync(new URL(n, shardDir), 'utf8'))))).doc;
  assert.equal(engine.dataPacksDigest, dataPacksDigestOf({ digestCap: engine.digestCap }, { ...engine.docData, owners }));
  const union = (/** @type {string} */ field) => DOMAINS.flatMap((d) => /** @type {any} */ (d)[field] || []);
  assert.deepEqual(DOMAINS.map((d) => d.domain), [...DOMAINS.map((d) => d.domain)].sort());
  assert.deepEqual(engine.terminationCleanups, union('terminationCleanups'));
  assert.deepEqual(engine.terminationTriggers, union('terminationTriggers'));
  assert.deepEqual(engine.instantiators, union('instantiators'));
  assert.deepEqual(engine.advanceHooks, union('advanceHooks'));
  assert.ok(union('terminationCleanups').includes(SETTLE_BODY_CLEANUP) && union('terminationTriggers').includes(DIE_BY_DESTROY_TRIGGER) && union('instantiators').includes(PERSON_INSTANTIATOR));
  assert.deepEqual([...engine.primitiveWriters.values()], union('primitiveWriters').map((e) => e.handler));
});

test('domains.mjs 只用静态 import（不含动态 import(）', () => {
  const text = readFileSync(new URL('../../server-plugin/rules/load/domains.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /\bimport\s*\(/);
});
