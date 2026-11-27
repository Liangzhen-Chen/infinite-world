// 验收：卡 chore/s2-sh（S2-SH 登记分片：state-owners.d/ 与 entry-registry.d/ 的合并规则）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2sh；未参与写码与审卡。
// 依据：卷二:57（state-owners 系统声明表）、卷二:512–:513（加载期机器生成、算一次冻结，合并结果确定）、卷二:408–:409（登记文件重复条目与结构字段不合）；草案 F:/dnd-tmp/draft-s2-sh.md §2、§8.1。
// 黑盒：纯函数 mergeOwners / mergeEntries，与门禁读取 readOwnersFiles / readEntryRegistry（经临时仓库）。不 mock；临时仓库只经 writeTempRepoFile 写，清理只经 removeTempRoot。
// 期望值按草案手算成字面量；不把仓库此刻的计数抄进断言（真实主文件只取它的内容当底本，不取计数）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';
import { mergeOwners, mergeEntries } from '../../../server-plugin/rules/load/registry-shards.mjs';
import { readOwnersFiles, readEntryRegistry } from '../../../tools/accept/lib/registry-files.mjs';

const REPO = new URL('../../../', import.meta.url);
const MAIN_OWNERS = readFileSync(new URL('world/ontology/state-owners.json', REPO), 'utf8');
const MAIN_REGISTRY = readFileSync(new URL('tools/accept/entry-registry.json', REPO), 'utf8');
const OWNERS_REL = 'world/ontology/state-owners.json';
const SHARD_OWNERS = (name) => `world/ontology/state-owners.d/${name}`;
const REG_REL = 'tools/accept/entry-registry.json';
const REG_SHARD = (name) => `tools/accept/entry-registry.d/${name}`;

// 报错取码：KernelError 带 code；其余错误取 message。
const codeOf = (e) => (e && typeof e.code === 'string' ? e.code : String(e && e.message));
// 报错里是否带某段文字（参数 fields 或 message 任一处）。
const mentions = (e, s) => `${e.message} ${JSON.stringify(e.fields ?? {})}`.includes(s);
// 必须抛错，且码与文字都对。
function expectRejected(fn, code, mustMention) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert.ok(err, `应拒收（${code}），实际未报错`);
  assert.equal(codeOf(err), code, `报错码应为 ${code}，实际为 ${codeOf(err)}：${err.message}`);
  if (mustMention) assert.ok(mentions(err, mustMention), `报错参数应带「${mustMention}」：${err.message}`);
}

// 临时仓库：每个用例自建自删。
function withRoot(fn) {
  const root = testTempRoot('s2sh-merge-');
  try { return fn(root); } finally { removeTempRoot(root); }
}

// ---------- 纯函数 mergeOwners（shards 已按次序排好，形如 [{file, doc}]） ----------

// 实现签名：主文件以 {file, doc} 传入（与分片同形）；读取结果 registry 为合并后的对象。
const asMain = (doc) => ({ file: 'world/ontology/state-owners.json', doc });
const asEntries = (doc) => ({ file: 'tools/accept/entry-registry.json', doc });
const SYNTH_MAIN = () => ({
  version: 1,
  pathTypes: { 'clock.minute': 'integer:minute' },
  rxNamespaces: [{ ns: 'n1' }],
});

test('M-1 mergeOwners：分片新增的 pathTypes 键并入结果，主文件原有键保留', () => {
  const r = mergeOwners(asMain(SYNTH_MAIN()), [{ file: 'a.json', doc: { pathTypes: { 'zz.probe': 'integer' } } }]);
  assert.equal(/** @type {any} */ (r.doc).pathTypes['zz.probe'], 'integer');
  assert.equal(/** @type {any} */ (r.doc).pathTypes['clock.minute'], 'integer:minute');
});

test('M-2 mergeOwners：数组按「主文件 → 分片次序」追加，不重排', () => {
  const r = mergeOwners(asMain(SYNTH_MAIN()), [
    { file: 'a.json', doc: { rxNamespaces: [{ ns: 'n2' }] } },
    { file: 'b.json', doc: { rxNamespaces: [{ ns: 'n3' }] } },
  ]);
  assert.deepEqual(/** @type {any} */ (r.doc).rxNamespaces.map((x) => x.ns), ['n1', 'n2', 'n3']);
});

test('M-3 mergeOwners：无分片时原样返回主文件（键序与字节同一份），不重建不重排', () => {
  const main = JSON.parse(MAIN_OWNERS);
  const r = mergeOwners(asMain(main), []);
  assert.equal(JSON.stringify(r.doc), JSON.stringify(main));
});

test('M-4 mergeOwners：同一 pathTypes 键在主文件与分片各出现一次 → E-DIM-DUPLICATE-KEY，参数带分片文件名', () => {
  expectRejected(
    () => mergeOwners(asMain(SYNTH_MAIN()), [{ file: 'a.json', doc: { pathTypes: { 'clock.minute': 'integer:minute' } } }]),
    'E-DIM-DUPLICATE-KEY',
    'a.json',
  );
});

test('M-5 mergeOwners：同一 pathTypes 键在两个分片各出现一次 → E-DIM-DUPLICATE-KEY', () => {
  expectRejected(
    () => mergeOwners(asMain(SYNTH_MAIN()), [
      { file: 'a.json', doc: { pathTypes: { 'zz.p': 'integer' } } },
      { file: 'b.json', doc: { pathTypes: { 'zz.p': 'integer' } } },
    ]),
    'E-DIM-DUPLICATE-KEY',
  );
});

test('M-6 mergeOwners：同一输入两次合并，canonical 文本逐字相同（确定性）', () => {
  const input = () => [
    { file: 'a.json', doc: { pathTypes: { 'zz.a': 'integer' }, rxNamespaces: [{ ns: 'n2' }] } },
    { file: 'b.json', doc: { pathTypes: { 'zz.b': 'integer' }, rxNamespaces: [{ ns: 'n3' }] } },
  ];
  const x = JSON.stringify(mergeOwners(asMain(SYNTH_MAIN()), input()).doc);
  const y = JSON.stringify(mergeOwners(asMain(SYNTH_MAIN()), input()).doc);
  assert.equal(x, y);
});

// ---------- 门禁读取 readOwnersFiles（临时仓库：主文件 + state-owners.d/*.json） ----------

test('M-7 readOwnersFiles：分片按文件名码元序合并，与磁盘写入先后无关', () => {
  withRoot((root) => {
    writeTempRepoFile(root, OWNERS_REL, MAIN_OWNERS);
    // 先写 b 再写 a：若按写入顺序合并，结果会反过来。
    writeTempRepoFile(root, SHARD_OWNERS('b.json'), JSON.stringify({ rxNamespaces: [{ ns: 'zz.b' }] }));
    writeTempRepoFile(root, SHARD_OWNERS('a.json'), JSON.stringify({ rxNamespaces: [{ ns: 'zz.a' }] }));
    const mainCount = JSON.parse(MAIN_OWNERS).rxNamespaces.length;
    const ns = readOwnersFiles(root).doc.rxNamespaces.map((x) => x.ns);
    assert.deepEqual(ns.slice(mainCount), ['zz.a', 'zz.b']);
  });
});

test('M-8 readOwnersFiles：分片含 phases → E-DIM-STRUCT-FIELD（phases 只许留在主文件）', () => {
  withRoot((root) => {
    writeTempRepoFile(root, OWNERS_REL, MAIN_OWNERS);
    writeTempRepoFile(root, SHARD_OWNERS('a.json'), JSON.stringify({ phases: [] }));
    expectRejected(() => readOwnersFiles(root), 'E-DIM-STRUCT-FIELD');
  });
});

test('M-9 readOwnersFiles：分片含 importMatrix → E-DIM-STRUCT-FIELD（importMatrix 只许留在主文件）', () => {
  withRoot((root) => {
    writeTempRepoFile(root, OWNERS_REL, MAIN_OWNERS);
    writeTempRepoFile(root, SHARD_OWNERS('a.json'), JSON.stringify({ importMatrix: {} }));
    expectRejected(() => readOwnersFiles(root), 'E-DIM-STRUCT-FIELD');
  });
});

test('M-10 readOwnersFiles：分片文件名不合 ^[a-z][a-z0-9-]*\\.json$ → 拒收', () => {
  withRoot((root) => {
    writeTempRepoFile(root, OWNERS_REL, MAIN_OWNERS);
    writeTempRepoFile(root, SHARD_OWNERS('Bad_Name.json'), JSON.stringify({ rxNamespaces: [] }));
    assert.throws(() => readOwnersFiles(root));
  });
});

// ---------- entry-registry 分片（合并只按行键 file#name 查重，不按 name 重排） ----------

// 真实主文件里取一行当样板（只取行形状，不取计数）；改 file 与 name 造新行。
const SAMPLE_ROW = JSON.parse(MAIN_REGISTRY).entries[0];
const row = (file, name) => ({ ...SAMPLE_ROW, file, name });

test('M-11 readEntryRegistry：两个分片含相同 file#name → 报「重复行键」', () => {
  withRoot((root) => {
    writeTempRepoFile(root, REG_REL, JSON.stringify({ version: 1, kinds: JSON.parse(MAIN_REGISTRY).kinds, entries: [] }));
    writeTempRepoFile(root, REG_SHARD('a.json'), JSON.stringify({ entries: [row('zz/x.mjs', 'dup')] }));
    writeTempRepoFile(root, REG_SHARD('b.json'), JSON.stringify({ entries: [row('zz/x.mjs', 'dup')] }));
    assert.throws(() => readEntryRegistry(root), /重复行键/);
  });
});

test('M-12 readEntryRegistry：分片行接在主文件行之后、按文件名序追加，不按 name 重排', () => {
  withRoot((root) => {
    writeTempRepoFile(root, REG_REL, JSON.stringify({ version: 1, kinds: JSON.parse(MAIN_REGISTRY).kinds, entries: [row('zz/m.mjs', 'm')] }));
    writeTempRepoFile(root, REG_SHARD('b.json'), JSON.stringify({ entries: [row('zz/b.mjs', 'a')] }));
    writeTempRepoFile(root, REG_SHARD('a.json'), JSON.stringify({ entries: [row('zz/a.mjs', 'b')] }));
    const names = readEntryRegistry(root).registry.entries.map((r) => `${r.file}#${r.name}`);
    assert.deepEqual(names, ['zz/m.mjs#m', 'zz/a.mjs#b', 'zz/b.mjs#a']);
  });
});

test('M-13 readEntryRegistry：分片里出现 version 或 kinds 段 → 拒收（只许 entries 段）', () => {
  withRoot((root) => {
    writeTempRepoFile(root, REG_REL, JSON.stringify({ version: 1, kinds: JSON.parse(MAIN_REGISTRY).kinds, entries: [] }));
    writeTempRepoFile(root, REG_SHARD('a.json'), JSON.stringify({ version: 2, entries: [] }));
    assert.throws(() => readEntryRegistry(root));
  });
});

test('M-14 mergeEntries：纯函数与门禁读取同序，分片行按次序接在主文件行后', () => {
  const main = { version: 1, kinds: {}, entries: [row('zz/m.mjs', 'm')] };
  const r = mergeEntries(asEntries(main), [
    { file: 'a.json', doc: { entries: [row('zz/a.mjs', 'a')] } },
    { file: 'b.json', doc: { entries: [row('zz/b.mjs', 'b')] } },
  ]);
  assert.deepEqual(/** @type {any} */ (r.registry).entries.map((x) => x.name), ['m', 'a', 'b']);
});

test('M-15 mergeOwners：分片里登记与主文件同 ns、内容不同的 rxNamespaces 行 → E-DIM-DUPLICATE-KEY（ns 为行键，卷二:408 登记文件重复条目）', () => {
  // rxNamespaces 按 ns 判重（rx 按 ns 取行）：同 ns 即重复，哪怕内容不同也拒，不靠「内容相同才拒」。
  expectRejected(
    () => mergeOwners(asMain({ version: 1, rxNamespaces: [{ ns: 'zz.same', type: 'number' }] }), [
      { file: 'a.json', doc: { rxNamespaces: [{ ns: 'zz.same', type: 'integer' }] } },
    ]),
    'E-DIM-DUPLICATE-KEY',
    'a.json',
  );
});
