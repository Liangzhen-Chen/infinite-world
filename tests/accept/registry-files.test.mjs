// S2-SH 登记分片的门禁读者（tools/accept/lib/registry-files.mjs；草案 §2.3、§5）：readDecl 与检测器读到分片里的登记；
// entry-registry 读合并结果、--write 按来源文件分写，无分片时写出字节与主文件相同。临时仓库用 testTempRoot。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { testTempRoot, removeTempRoot, writeUnderTempRoot, ROOT } from './temp-root.mjs';
import { readDecl, loadContext } from '../../tools/accept/read.mjs';
import { readOwnersFiles, readEntryRegistry, hasOwnersFiles } from '../../tools/accept/lib/registry-files.mjs';
import { splitBySource } from '../../tools/entry-registry-merge.mjs';
import { mergeOwners, shardDirOf } from '../../server-plugin/rules/load/registry-shards.mjs';
import { detect } from '../../tools/accept/detectors/state_pattern.mjs';

const OWNERS = 'world/ontology/state-owners.json';
const OWNERS_SHARD = 'world/ontology/state-owners.d/geo.json';
const REG = 'tools/accept/entry-registry.json';
const REG_SHARD = 'tools/accept/entry-registry.d/geo.json';
const dirs = [];
after(() => { for (const d of dirs) removeTempRoot(d); });
const tempRoot = () => { const d = testTempRoot('s2-sh-acc-'); dirs.push(d); return d; };
const ctxOf = (map) => { const files = new Map(Object.entries(map)); return loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) }); };

test('readDecl：无分片时等于主文件；有分片时读到分片里的登记', () => {
  const root = tempRoot();
  const mainDoc = { version: 1, pathTypes: { 'a.*': 'string' }, kernelApi: { exports: [{ export: 'f' }] } };
  writeUnderTempRoot(root, OWNERS, JSON.stringify(mainDoc));
  assert.deepEqual(readDecl(root), mainDoc);
  writeUnderTempRoot(root, OWNERS_SHARD, JSON.stringify({ pathTypes: { 'geo.*': 'integer' }, kernelApi: { exports: [{ export: 'g' }] } }));
  const decl = readDecl(root);
  assert.deepEqual(decl.pathTypes, { 'a.*': 'string', 'geo.*': 'integer' });
  assert.deepEqual(decl.kernelApi.exports.map((e) => e.export), ['f', 'g']);
  assert.equal(readOwnersFiles(root).originOf(['pathTypes', 'geo.*']), OWNERS_SHARD);
});

test('readDecl：分片里出现 phases 即 E-DIM-STRUCT-FIELD，不静默读主文件', () => {
  const root = tempRoot();
  writeUnderTempRoot(root, OWNERS, JSON.stringify({ version: 1 }));
  writeUnderTempRoot(root, OWNERS_SHARD, JSON.stringify({ phases: [] }));
  assert.throws(() => readDecl(root), { code: 'E-DIM-STRUCT-FIELD' });
});

test('state_pattern：分片里登记的 pathType 有违例，命中锚点是分片文件；主文件里的仍锚主文件', () => {
  const files = {
    'world/rules/tables/economy/resources.json': JSON.stringify({ rows: [{ key: 'res_test', value: { unit: 'copper' } }] }),
    'world/ontology/named-structs.json': JSON.stringify({ version: 1, rows: [] }),
    [OWNERS]: JSON.stringify({ pathTypes: { 'npcs.*.coins': 'integer:copper' } }),
    [OWNERS_SHARD]: JSON.stringify({ pathTypes: { 'geo.*.coins': 'integer:copper' } }),
  };
  const ctx = ctxOf(files);
  assert.ok(hasOwnersFiles(ctx));
  const hits = detect(ctx, { checks: ['stateQuantity'], code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(hits.map((h) => [h.symbolPath, h.file]), [['geo.*.coins', OWNERS_SHARD], ['npcs.*.coins', OWNERS]]);
});

test('entry-registry：读合并结果；--write 分写回各来源文件，无分片时字节与主文件相同', () => {
  const root = tempRoot();
  const row = (name) => ({ name, file: `${name}.mjs`, vol: null, sec: null, kind: 'part', needs: [], rules: [] });
  const mainText = `${JSON.stringify({ version: 1, kinds: ['part'], entries: [row('z'), row('a')] }, null, 1)}\n`;
  writeUnderTempRoot(root, REG, mainText);
  const plain = readEntryRegistry(root);
  assert.deepEqual([...splitBySource(plain.registry, plain.sourceOf)], [[REG, mainText]]);
  const shardText = `${JSON.stringify({ entries: [row('m')] }, null, 1)}\n`;
  writeUnderTempRoot(root, REG_SHARD, shardText);
  const merged = readEntryRegistry(root);
  assert.deepEqual(merged.registry.entries.map((e) => e.name), ['z', 'a', 'm']);
  assert.deepEqual([...splitBySource(merged.registry, merged.sourceOf)], [[REG, mainText], [REG_SHARD, shardText]]);
  writeUnderTempRoot(root, 'tools/accept/entry-registry.d/hh.json', JSON.stringify({ entries: [row('a')] }));
  assert.throws(() => readEntryRegistry(root), (e) => Object(e).code === 'E-DIM-DUPLICATE-KEY' && String(Object(e).message).includes('重复行键'));
});

// S2-L 改（主会话裁定 2 甲）：原断言「仓库内尚无分片、等于主文件」是偶然现状，第一张真分片即打破；改为门禁读到的声明表 = 主文件与磁盘上全部分片按文件名序合并的结果。
test('真实仓库：门禁读到的声明表与 state-owners 主文件加全部分片的合并结果一致', () => {
  const dir = join(ROOT, shardDirOf(OWNERS));
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : [];
  const shards = names.map((n) => ({ file: `${shardDirOf(OWNERS)}/${n}`, doc: JSON.parse(readFileSync(join(dir, n), 'utf8')) }));
  assert.deepEqual(readDecl(ROOT), mergeOwners({ file: OWNERS, doc: JSON.parse(readFileSync(join(ROOT, OWNERS), 'utf8')) }, shards).doc);
});
