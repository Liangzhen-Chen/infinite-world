// 块 2 第 2-4 张《存储、摘要与存档》：canonical 序列化规则、applyPatches/diffPatches、stateMemo、textcore 摘要、排除表生成与漂移、
// 存读档往返、写时复制、分片无关、无墙钟、rulesDigest 不符拒读且文件不变、清单残缺 E-SAVE-TORN、Sealed 重算、请求先记 doc_log。
// 依据卷二 §2.6 :503、§2.7 :573、:648–649、§2.9 第 0 条"存档四路" :940–944、第 3 条 :1128、:1137；卷二十七 R27-4.1–4.10、R27-5.8、R27-7.3、
// A27-4.2、A27-4.4、A27-4.5、A27-4.6；卷一 §8.3 :643–644；体检 K2-01、K2-03、K2-04、K2-08、K2-21。
// 声明表与存档布局是本文件造的虚构顶层键（gauge、holdings、purse）与虚构分片表，不是世界内容；只用小状态夹具，不推进世界。期望值一律手写字面量。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { buildP } from '../../server-plugin/kernel/handles/generated.mjs';
import { installStorage, writePath, canonical, canonicalEqual, applyPatches, diffPatches } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction, submitProposal, installProposalSession } from '../../server-plugin/kernel/transaction.mjs';
import { stateMemo } from '../../server-plugin/kernel/memo.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import {
  installDigestCap, installDigestExclude, digestExcludeOf, saveDigest, createLogBook, appendLogEntry, tickEnd, saveToSlot, compileLayout, MANIFEST_FIELDS,
} from '../../server-plugin/kernel/save.mjs';
import { loadSlot, autoLoadSlot, loadDigestExclude } from '../../server-plugin/kernel/load/save.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { digestHex, createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { generate, formatExclude } from '../../tools/gen-digest-exclude.mjs';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';

// ---------- 夹具 ----------

const DECL = {
  stateKeys: {
    gauge: { readers: [], writers: { '*.level': 'sys/gauge.mjs', '*.dims.*': 'sys/gauge.mjs' } },
    holdings: { readers: [], writers: { '*.*': 'sys/hold.mjs' } },
    purse: { readers: [], writers: { '*.amount': 'sys/purse.mjs' } },
    displayNames: { readers: [], writers: { '*': 'ai-gate/naming-gate.mjs' }, display: ['*.text'] },
    playerNotes: { readers: [], writers: { '*': 'ai-gate/note-gate.mjs' }, display: ['*.text'] },
    narration: { readers: [], writers: { '*': 'ai-gate/narration-gate.mjs' } },
  },
  systems: {},
  textPaths: ['displayNames.*.text', 'playerNotes.*.text', 'narration.*'],
  textWriters: { 'displayNames.*.text': 'ai-gate/naming-gate.mjs', 'playerNotes.*.text': 'ai-gate/note-gate.mjs', 'narration.*': 'ai-gate/narration-gate.mjs' },
  pathTypes: {
    'gauge.*.level': 'integer:count',
    'gauge.*.dims.*': 'dimension',
    'holdings.*.*': 'integer:count',
    'purse.*.amount': 'integer:count',
    'displayNames.*.text': 'sealed',
    'displayNames.*.seq': 'integer:count',
    'playerNotes.*.text': 'sealed',
    'narration.*': 'sealed',
  },
  keyKinds: {
    'gauge.*.level': ['gadget'], 'gauge.*.dims.*': ['gadget', 'dimKey'], 'holdings.*.*': ['gadget', 'gadget'], 'purse.*.amount': ['gadget'],
    'displayNames.*.seq': [['gadget', 'identityKey']],
  },
  phases: [],
};

const merged = mergeStateOwners(DECL, { units: new Set(['count']), kinds: new Set(['gadget']) });
const P = buildP(DECL);
installStorage(merged.merged);
installDigestCap(createDigestCap());
installDigestExclude(digestExcludeOf(merged.merged));

// sha256("hi") 与 "hi" 的 base64（公认值，不由被测函数算）。
const HI_DIGEST = '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4';
const SEALED_HI = { bytes: 'aGk=', digest: HI_DIGEST };
const RULES = 'a'.repeat(64);

const LAYOUT = {
  shards: [
    { shard: 'shd_data', part: 'doc_data', paths: ['*'], partition: 'part_single' },
    { shard: 'shd_append', part: 'doc_data', paths: [], partition: 'part_by_segment' },
    { shard: 'shd_gauge', part: 'doc_state', paths: ['gauge'], partition: 'part_single' },
    { shard: 'shd_text', part: 'doc_state', paths: ['displayNames', 'playerNotes', 'narration'], partition: 'part_single' },
    { shard: 'shd_hold', part: 'doc_holdings', paths: ['holdings'], partition: 'part_single' },
    { shard: 'shd_purse', part: 'doc_ledger', paths: ['purse'], partition: 'part_single' },
    { shard: 'shd_log', part: 'doc_log', paths: [], partition: 'part_by_segment' },
  ],
  segmentEvents: 2, snapshotEveryEvents: 4, keepSnapshots: 2, saveSlotCount: 3,
};

// 另一张合法分片表：状态两片合一、数据按表分两片（A27-4.2）。
const LAYOUT_B = {
  ...LAYOUT,
  shards: [
    { shard: 'shd_a', part: 'doc_data', paths: ['tbl_a'], partition: 'part_single' },
    { shard: 'shd_b', part: 'doc_data', paths: ['tbl_b'], partition: 'part_single' },
    { shard: 'shd_append', part: 'doc_data', paths: [], partition: 'part_by_segment' },
    { shard: 'shd_state', part: 'doc_state', paths: ['gauge', 'displayNames', 'playerNotes', 'narration'], partition: 'part_single' },
    { shard: 'shd_hold', part: 'doc_holdings', paths: ['holdings.*.*'], partition: 'part_single' },
    { shard: 'shd_purse', part: 'doc_ledger', paths: ['purse.*'], partition: 'part_single' },
    { shard: 'shd_log', part: 'doc_log', paths: [], partition: 'part_by_segment' },
  ],
};

const doc0 = () => ({
  doc_data: { base: { tbl_a: { x: 1 }, tbl_b: [1, 2] }, appends: [] },
  doc_state: { gauge: { gad_one: { level: 3, dims: { mass: 2.5 } } }, displayNames: { gad_one: { text: { ...SEALED_HI }, seq: 1 } }, narration: { nar_1: { ...SEALED_HI } } },
  doc_holdings: { holdings: { gad_one: { gad_two: 1 } } },
  doc_ledger: { purse: { gad_one: { amount: 10 } } },
});

const withLog = (doc, log) => ({ ...doc, doc_log: log });

// 存档目录下全部文件：相对路径 → {字节, 修改时间}（A27-4.6 比对用）。
function snapshotDir(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, r);
      else out[r] = { bytes: readFileSync(full).toString('hex'), mtime: statSync(full).mtimeMs };
    }
  };
  walk(dir, '');
  return out;
}

const logs = [];
useReportSink((rec) => logs.push(rec));

test('夹具声明表合并通过（前提）', () => {
  assert.equal(merged.ok, true, merged.text);
});

// ---------- textcore 摘要（K2-08） ----------

test('digestHex 与 createDigestCap：sha256 公认向量；DigestCap 冻结、只收 utf8 与 base64', () => {
  assert.equal(digestHex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(digestHex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const cap = createDigestCap();
  assert.equal(Object.isFrozen(cap), true);
  assert.equal(cap.sha256Hex('abc', 'utf8'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(cap.sha256Hex('YWJj', 'base64'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(cap.sha256Hex('aGk=', 'base64'), HI_DIGEST);
  assert.throws(() => cap.sha256Hex('abc', 'hex'));
  assert.throws(() => digestHex(1));
});

// ---------- canonical 序列化规则（K2-03） ----------

test('canonical 规则 1–5：字面量、数、字串转义、数组、键名按 UTF-16 码元升序，无空白', () => {
  assert.equal(canonical(null), 'null');
  assert.equal(canonical(true), 'true');
  assert.equal(canonical(false), 'false');
  assert.equal(canonical(0.1), '0.1');
  assert.equal(canonical(-0), '0');
  assert.equal(canonical(1e21), '1e+21');
  assert.equal(canonical(-5), '-5');
  assert.equal(canonical('a"\n\\'), '"a\\"\\n\\\\"');
  assert.equal(canonical('中'), '"中"');
  assert.equal(canonical([1, [2, []], {}]), '[1,[2,[]],{}]');
  assert.equal(canonical({ b: 1, B: 2, a: 3, 'é': 4, aa: 5 }), '{"B":2,"a":3,"aa":5,"b":1,"é":4}');
  assert.equal(canonical({ z: { y: [true, null, 'x'], x: {} } }), '{"z":{"x":{},"y":[true,null,"x"]}}');
  const bare = Object.create(null);
  bare.k = 1;
  assert.equal(canonical(bare), '{"k":1}');
});

test('canonical 规则 6：非存档数据一律抛错，不写成 null、不略去', () => {
  for (const bad of [undefined, NaN, Infinity, -Infinity, () => 1, 1n, Symbol('s'), new Map(), new Date(0), new Uint8Array(1), { a: undefined }, [1, undefined], { a: NaN }]) {
    assert.throws(() => canonical(bad), /canonical: not save data/);
  }
  // eslint-disable-next-line no-sparse-arrays
  assert.throws(() => canonical([1, , 2]), /canonical: not save data/);
});

test('canonicalEqual 与 canonical 相等同义：键序无关、-0 等 0、长度与键集不同即不等；比到非存档数据抛错', () => {
  assert.equal(canonicalEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }), true);
  assert.equal(canonicalEqual(0, -0), true);
  assert.equal(canonicalEqual({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(canonicalEqual([1, 2], [1, 2, 3]), false);
  assert.equal(canonicalEqual({ a: 1 }, [1]), false);
  assert.equal(canonicalEqual(1, '1'), false);
  assert.equal(canonicalEqual(null, {}), false);
  assert.throws(() => canonicalEqual({ a: NaN }, { a: NaN }), /canonical: not save data/);
});

// ---------- 补丁（K2-01） ----------

test('applyPatches：原文档不动，只复制被写路径的祖先；set 按副本放入；delete；不安全键与坏补丁抛错', () => {
  const doc = { a: { b: 1, c: { d: 2 } }, e: [1, 2] };
  const v = { w: 1 };
  const next = applyPatches(doc, [{ op: 'set', path: ['a', 'b'], value: 5 }, { op: 'delete', path: ['a', 'c'] }, { op: 'set', path: ['f', 'g'], value: v }]);
  assert.deepEqual(doc, { a: { b: 1, c: { d: 2 } }, e: [1, 2] });
  assert.deepEqual(next, { a: { b: 5 }, e: [1, 2], f: { g: { w: 1 } } });
  assert.equal(next.e, doc.e);
  v.w = 9;
  assert.deepEqual(next.f.g, { w: 1 });
  assert.throws(() => applyPatches(doc, [{ op: 'set', path: ['__proto__', 'x'], value: 1 }]), /unsafe/);
  assert.throws(() => applyPatches(doc, [{ op: 'put', path: ['a'], value: 1 }]), /malformed/);
  assert.throws(() => applyPatches(doc, [{ op: 'set', path: [], value: 1 }]), /malformed/);
  assert.throws(() => applyPatches(doc, [{ op: 'set', path: ['a', 'b', 'x'], value: 1 }]), /non-object/);
});

test('diffPatches：净差（对象逐键、数组整体、新键整值）；施加后与目标规范相等', () => {
  const before = { a: { b: 1, c: 2 }, l: [1, 2], gone: true };
  const after = { a: { b: 1, c: 3, n: { m: 1 } }, l: [1, 2, 3] };
  const patches = diffPatches(before, after);
  assert.deepEqual(patches, [
    { op: 'delete', path: ['gone'] },
    { op: 'set', path: ['a', 'c'], value: 3 },
    { op: 'set', path: ['a', 'n'], value: { m: 1 } },
    { op: 'set', path: ['l'], value: [1, 2, 3] },
  ]);
  assert.equal(canonical(applyPatches(before, patches)), '{"a":{"b":1,"c":3,"n":{"m":1}},"l":[1,2,3]}');
  assert.deepEqual(diffPatches(after, after), []);
  const pairs = [[{}, { x: [{ y: 1 }] }], [{ x: { y: { z: 1 } } }, { x: { y: {} } }], [{ k: 1 }, { k: { j: 2 } }]];
  for (const [a, b] of pairs) assert.equal(canonicalEqual(applyPatches(a, diffPatches(a, b)), b), true);
});

// ---------- stateMemo（:573） ----------

test('stateMemo：同 state、同 scope、同 inputs 命中；inputs 不同另算；经 writePath 写入或事务回滚后作废', () => {
  const st = { gauge: { gad_one: { level: 1 } } };
  let builds = 0;
  const read = (day) => stateMemo(st, 'lvl', [day], () => { builds++; return st.gauge.gad_one.level * 10 + day; });
  assert.equal(read(1), 11);
  assert.equal(read(1), 11);
  assert.equal(builds, 1);
  assert.equal(read(2), 12);
  assert.equal(builds, 2);
  assert.equal(stateMemo(st, 'other', [1], () => 'o'), 'o');
  assert.deepEqual(runTransaction(st, { node: 'view:g', file: 'sys/gauge.mjs' }, (s) => writePath(s, P.gauge_level('gad_one'), 4)), { ok: true });
  assert.equal(read(1), 41);
  assert.equal(builds, 3);
  assert.deepEqual(runTransaction(st, { node: 'view:x', file: 'sys/other.mjs' }, (s) => writePath(s, P.gauge_level('gad_one'), 7)), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.equal(read(1), 41);
  assert.equal(builds, 4);
  assert.equal(stateMemo(5, 'lvl', [1], () => 'no-cache'), 'no-cache');
});

// ---------- 排除表（K2-04、R27-5.8） ----------

test('排除表生成：display 字段集合 ∪ displayNames.* ∪ playerNotes.*，去重升序', () => {
  assert.deepEqual(digestExcludeOf(merged.merged), ['displayNames.*', 'displayNames.*.text', 'playerNotes.*', 'playerNotes.*.text']);
  assert.deepEqual(digestExcludeOf({ displayPaths: ['gauge.*.label'] }), ['displayNames.*', 'gauge.*.label', 'playerNotes.*']);
});

test('入库排除表与生成器输出逐字节一致；声明表变了而文件没重生成即 E-DIGEST-EXCLUDE-DRIFT', () => {
  const w = loadWorld(ROOT);
  assert.equal(w.ok, true, w.text);
  const file = readFileSync(join(ROOT, 'world/rules/tables/digest-exclude.json'), 'utf8');
  assert.equal(formatExclude(generate(ROOT)), file);
  assert.deepEqual(loadDigestExclude(ROOT, w.owners), ['displayNames.*', 'displayNames.*.text', 'playerNotes.*', 'playerNotes.*.text']);
  assert.throws(() => loadDigestExclude(ROOT, { ...w.owners, displayPaths: [...w.owners.displayPaths, 'created.*.props.basis'] }), (e) => e.code === 'E-DIGEST-EXCLUDE-DRIFT');
  const empty = testTempRoot('dex-');
  assert.throws(() => loadDigestExclude(empty, w.owners), (e) => e.code === 'E-DIGEST-EXCLUDE-DRIFT');
  // loadWorld 收下了真实声明表；换回本文件的夹具。
  installStorage(merged.merged);
  installDigestExclude(digestExcludeOf(merged.merged));
});

// ---------- 存档摘要（R27-4.1） ----------

test('存档摘要：sha256(UTF-8(canonical(五部分，排除表剔除后)))；起名、手记不改摘要，叙述与状态改了摘要就变', () => {
  const small = { doc_data: { base: {}, appends: [] }, doc_state: { gauge: { gad_one: { level: 3 } }, displayNames: { gad_one: { seq: 1 } } }, doc_holdings: {}, doc_ledger: {}, doc_log: [{ request: 1 }] };
  assert.equal(saveDigest(small), digestHex('{"doc_data":{"appends":[],"base":{}},"doc_holdings":{},"doc_ledger":{},"doc_log":[{"request":1}],"doc_state":{"gauge":{"gad_one":{"level":3}}}}'));
  const base = saveDigest(withLog(doc0(), []));
  const renamed = doc0();
  renamed.doc_state.displayNames.gad_one = { text: { bytes: 'aGE=', digest: 'b'.repeat(64) }, seq: 2 };
  renamed.doc_state.playerNotes = { note_1: { text: { ...SEALED_HI } } };
  assert.equal(saveDigest(withLog(renamed, [])), base);
  const unnamed = doc0();
  delete unnamed.doc_state.displayNames;
  assert.equal(saveDigest(withLog(unnamed, [])), base);
  const narrated = doc0();
  narrated.doc_state.narration.nar_2 = { ...SEALED_HI };
  assert.notEqual(saveDigest(withLog(narrated, [])), base);
  const moved = doc0();
  moved.doc_state.gauge.gad_one.level = 4;
  assert.notEqual(saveDigest(withLog(moved, [])), base);
  assert.notEqual(saveDigest(withLog(doc0(), [{ request: 1 }])), base);
});

test('R27-4.4：未在 pathTypes 声明的路径进不了存档（E-PATH-UNDECLARED）；sealed 路径存非 Sealed 值拒收', () => {
  const bad = doc0();
  bad.doc_state.gauge.gad_one.color = 1;
  assert.throws(() => saveDigest(withLog(bad, [])), (e) => e.code === 'E-PATH-UNDECLARED');
  assert.throws(() => createLogBook(LAYOUT, bad), (e) => e.code === 'E-PATH-UNDECLARED');
  const stray = doc0();
  stray.doc_state.stray = { x: 1 };
  assert.throws(() => saveDigest(withLog(stray, [])), (e) => e.code === 'E-PATH-UNDECLARED');
  const plain = doc0();
  plain.doc_state.narration.nar_1 = 'text';
  assert.throws(() => saveDigest(withLog(plain, [])), (e) => e.code === 'E-TEXT-UNGATED');
});

// ---------- 分片表（R27-4.6） ----------

test('分片表：每条 pathTypes 模式恰被一行完全覆盖；没盖、两行盖、只盖一部分、日志行不对、part_by_unit、路径部分用 part_by_segment 都 E-SAVE-SHARD-UNCOVERED', () => {
  assert.equal(compileLayout(LAYOUT).pathRows.length, 4);
  assert.equal(compileLayout(LAYOUT_B).pathRows.length, 3);
  const without = (code) => ({ ...LAYOUT, shards: LAYOUT.shards.filter((r) => r.shard !== code) });
  const plus = (row) => ({ ...LAYOUT, shards: [...LAYOUT.shards, row] });
  const uncovered = (e) => e.code === 'E-SAVE-SHARD-UNCOVERED';
  assert.throws(() => compileLayout(without('shd_purse')), uncovered);
  assert.throws(() => compileLayout(without('shd_log')), uncovered);
  assert.throws(() => compileLayout(plus({ shard: 'shd_x', part: 'doc_state', paths: ['gauge.*.level'], partition: 'part_single' })), uncovered);
  assert.throws(() => compileLayout(plus({ shard: 'shd_x', part: 'doc_log', paths: [], partition: 'part_by_segment' })), uncovered);
  assert.throws(() => compileLayout(plus({ shard: 'shd_x', part: 'doc_data', paths: [], partition: 'part_by_segment' })), uncovered);
  assert.throws(() => compileLayout(plus({ shard: 'shd_x', part: 'doc_state', paths: [], partition: 'part_by_unit' })), uncovered);
  assert.throws(() => compileLayout({ ...without('shd_gauge'), shards: [...without('shd_gauge').shards, { shard: 'shd_g', part: 'doc_state', paths: ['gauge'], partition: 'part_by_segment' }] }), uncovered);
  assert.throws(() => compileLayout({ ...without('shd_gauge'), shards: [...without('shd_gauge').shards, { shard: 'shd_g', part: 'doc_state', paths: ['gauge.gad_one'], partition: 'part_single' }] }), uncovered);
  assert.throws(() => compileLayout({ ...LAYOUT, segmentEvents: 5 }), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => compileLayout({ ...LAYOUT, keepSnapshots: 0 }), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  // 值落在与分片行不同的部分：holdings 的值放进了 doc_state。
  const misplaced = doc0();
  misplaced.doc_state.holdings = misplaced.doc_holdings.holdings;
  misplaced.doc_holdings = {};
  assert.throws(() => createLogBook(LAYOUT, misplaced), uncovered);
});

// ---------- 存读档往返、快照与日志（R27-4.5、R27-4.7、R27-4.8） ----------

test('存读档往返：开局快照存盘读回，四个部分逐值相同、读回文档的存档摘要等于清单里的', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  const s = saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 480 });
  assert.equal(s.ok, true);
  assert.equal(s.written, 5);
  const r = loadSlot({ root, slot: 0, layout: LAYOUT, rulesDigest: RULES });
  assert.equal(r.ok, true);
  assert.deepEqual(r.doc, withLog(doc0(), []));
  assert.equal(r.atEvent, 0);
  assert.deepEqual(r.logTail, []);
  assert.equal(r.clockMinute, 480);
  assert.equal(r.fellBack, false);
  assert.equal(saveDigest(r.doc), s.manifest.saveDigest);
});

test('日志只追加、刻末封段与快照：快照之后的条目作为待重跑的日志尾交回；快照只留 keepSnapshots 个', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  for (const n of [1, 2, 3]) appendLogEntry(book, { request: n });
  assert.deepEqual(tickEnd(book, doc0()), { sealed: true, snapshot: false });
  let s = saveToSlot({ root, slot: 1, book, doc: doc0(), rulesDigest: RULES, clockMinute: 490 });
  assert.equal(s.ok, true);
  let r = loadSlot({ root, slot: 1, layout: LAYOUT, rulesDigest: RULES });
  assert.equal(r.atEvent, 0);
  assert.deepEqual(r.logTail, [{ request: 1 }, { request: 2 }, { request: 3 }]);
  assert.deepEqual(r.doc.doc_state, doc0().doc_state);

  const doc1 = doc0();
  doc1.doc_state.gauge.gad_one.level = 4;
  appendLogEntry(book, { request: 4 });
  assert.deepEqual(tickEnd(book, doc1), { sealed: false, snapshot: true });
  s = saveToSlot({ root, slot: 1, book, doc: doc1, rulesDigest: RULES, clockMinute: 500 });
  assert.deepEqual(s.manifest.logSegments.map((x) => [x.count, x.sealed]), [[3, true], [1, false]]);
  assert.deepEqual(s.manifest.snapshotIndex.map((x) => x.atEvent), [0, 4]);
  r = loadSlot({ root, slot: 1, layout: LAYOUT, rulesDigest: RULES });
  assert.equal(r.atEvent, 4);
  assert.deepEqual(r.logTail, []);
  assert.equal(r.doc.doc_state.gauge.gad_one.level, 4);
  assert.deepEqual(r.doc.doc_log, [{ request: 1 }, { request: 2 }, { request: 3 }, { request: 4 }]);
  assert.equal(saveDigest(r.doc), s.manifest.saveDigest);

  // 读回的日志簿接着用：未封的尾与新条目一起封段；再做两个快照后只留最近两个。
  const book2 = r.book;
  for (const n of [5, 6, 7, 8]) appendLogEntry(book2, { request: n });
  assert.deepEqual(tickEnd(book2, doc1), { sealed: true, snapshot: true });
  for (const n of [9, 10, 11, 12]) appendLogEntry(book2, { request: n });
  assert.deepEqual(tickEnd(book2, doc1), { sealed: true, snapshot: true });
  assert.deepEqual(book2.snapshots.map((x) => x.atEvent), [8, 12]);
  assert.deepEqual(book2.segments.map((x) => x.count), [3, 5, 4]);
});

test('写时复制：没变的分片不重写；只改一个状态值时只多写那一片', () => {
  const root = testTempRoot('save-');
  const book = createLogBook({ ...LAYOUT, snapshotEveryEvents: 2, segmentEvents: 2 }, doc0());
  assert.equal(saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 1 }).written, 5);
  assert.equal(saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 2 }).written, 0);
  const doc1 = doc0();
  doc1.doc_state.gauge.gad_one.level = 9;
  appendLogEntry(book, { request: 1 });
  appendLogEntry(book, { request: 2 });
  tickEnd(book, doc1);
  // 新写：gauge 一片 + 封好的日志段一片；数据、文字、持有、账本四片摘要不变不重写。
  assert.equal(saveToSlot({ root, slot: 0, book, doc: doc1, rulesDigest: RULES, clockMinute: 3 }).written, 2);
});

test('A27-4.2 分片无关：同一逻辑文档换另一张合法分片表存盘读回，存档摘要不变、文档相同', () => {
  const rootA = testTempRoot('save-');
  const rootB = testTempRoot('save-');
  const a = saveToSlot({ root: rootA, slot: 0, book: createLogBook(LAYOUT, doc0()), doc: doc0(), rulesDigest: RULES, clockMinute: 0 });
  const b = saveToSlot({ root: rootB, slot: 0, book: createLogBook(LAYOUT_B, doc0()), doc: doc0(), rulesDigest: RULES, clockMinute: 0 });
  assert.equal(a.manifest.saveDigest, b.manifest.saveDigest);
  assert.notDeepEqual(a.manifest.shardDigests, b.manifest.shardDigests);
  const ra = loadSlot({ root: rootA, slot: 0, layout: LAYOUT, rulesDigest: RULES });
  const rb = loadSlot({ root: rootB, slot: 0, layout: LAYOUT_B, rulesDigest: RULES });
  assert.deepEqual(ra.doc, rb.doc);
});

test('A27-4.5 / R27-4.10：清单字段只有登记的八个、没有墙钟；同一状态写进不同槽位，存档摘要与分片字节相同', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  const s0 = saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 60 });
  const s2 = saveToSlot({ root, slot: 2, book, doc: doc0(), rulesDigest: RULES, clockMinute: 60 });
  assert.deepEqual(MANIFEST_FIELDS, ['clockMinute', 'dataDigest', 'logSegments', 'rulesDigest', 'saveDigest', 'shardDigests', 'slot', 'snapshotIndex']);
  const m0 = JSON.parse(readFileSync(join(root, 'slot-0', 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(m0).sort(), ['clockMinute', 'dataDigest', 'logSegments', 'rulesDigest', 'saveDigest', 'shardDigests', 'slot', 'snapshotIndex']);
  assert.equal(m0.slot, 0);
  assert.equal(s0.manifest.saveDigest, s2.manifest.saveDigest);
  for (const d of s0.manifest.shardDigests) {
    assert.equal(readFileSync(join(root, 'slot-0', 'shards', `${d}.json`), 'utf8'), readFileSync(join(root, 'slot-2', 'shards', `${d}.json`), 'utf8'));
  }
});

test('A27-4.6 / R27-4.3：rulesDigest 不符即 E-SAVE-RULES-MISMATCH 拒读，存档目录下所有文件字节与修改时间不变', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  appendLogEntry(book, { request: 1 });
  assert.equal(saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 0 }).ok, true);
  const before = snapshotDir(root);
  assert.deepEqual(loadSlot({ root, slot: 0, layout: LAYOUT, rulesDigest: 'b'.repeat(64) }), { ok: false, code: 'E-SAVE-RULES-MISMATCH' });
  assert.deepEqual(snapshotDir(root), before);
});

test('R27-4.8：清单引用的分片摘要不符 → 报 E-SAVE-SHARD-DIGEST，回退上一个完好清单并报 E-SAVE-TORN；两份都坏或空槽位 E-SAVE-TORN', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 1 });
  appendLogEntry(book, { request: 1 });
  const s2 = saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 2 });
  // 只被新清单引用的日志尾分片被改坏（内容与文件名摘要不符）。
  const onlyNew = s2.manifest.logSegments[0].digest;
  writeUnderTempRoot(root, `slot-0/shards/${onlyNew}.json`, '[{"request":9}]');
  logs.length = 0;
  const r = loadSlot({ root, slot: 0, layout: LAYOUT, rulesDigest: RULES });
  assert.equal(r.ok, true);
  assert.equal(r.fellBack, true);
  assert.equal(r.clockMinute, 1);
  assert.deepEqual(r.doc.doc_log, []);
  assert.deepEqual(logs.map((x) => [x.code, x.fields.slot]), [['E-SAVE-SHARD-DIGEST', 0], ['E-SAVE-TORN', 0]]);
  const shared = s2.manifest.snapshotIndex[0].shards.shd_gauge;
  writeUnderTempRoot(root, `slot-0/shards/${shared}.json`, '{}');
  assert.deepEqual(loadSlot({ root, slot: 0, layout: LAYOUT, rulesDigest: RULES }), { ok: false, code: 'E-SAVE-TORN' });
  assert.deepEqual(loadSlot({ root, slot: 1, layout: LAYOUT, rulesDigest: RULES }), { ok: false, code: 'E-SAVE-TORN' });
});

test('A27-4.4 中断安全：提交改名之间中断（只剩上一个清单）读到上一个完整状态，不算残缺；分片写了一半的临时文件不影响读档', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  const s = saveToSlot({ root, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 7 });
  // 在槽位 1 摆出"当前清单已改名为上一个清单、新清单还没改名进来"的中断现场，外加一个写了一半的分片临时文件。
  for (const d of s.manifest.shardDigests) writeUnderTempRoot(root, `slot-1/shards/${d}.json`, readFileSync(join(root, 'slot-0', 'shards', `${d}.json`), 'utf8'));
  writeUnderTempRoot(root, 'slot-1/manifest.prev.json', readFileSync(join(root, 'slot-0', 'manifest.json'), 'utf8'));
  writeUnderTempRoot(root, 'slot-1/shards/half.json.tmp', '{"tor');
  logs.length = 0;
  const r = loadSlot({ root, slot: 1, layout: LAYOUT, rulesDigest: RULES });
  assert.equal(r.ok, true);
  assert.equal(r.fellBack, false);
  assert.equal(r.clockMinute, 7);
  assert.deepEqual(logs, []);
  // 接着存档：新清单提交，未被任何保留清单引用的残片被回收。
  appendLogEntry(book, { request: 1 });
  assert.equal(saveToSlot({ root, slot: 1, book, doc: doc0(), rulesDigest: RULES, clockMinute: 8 }).ok, true);
  assert.equal(existsSync(join(root, 'slot-1', 'shards', 'half.json.tmp')), false);
  assert.equal(loadSlot({ root, slot: 1, layout: LAYOUT, rulesDigest: RULES }).clockMinute, 8);
});

test('Sealed 读回重算：存档里的 bytes 与 digest 不符即 E-SEAL-DIGEST 拒读', () => {
  const root = testTempRoot('save-');
  const bad = doc0();
  bad.doc_state.narration.nar_1 = { bytes: 'aGk=', digest: 'c'.repeat(64) };
  saveToSlot({ root, slot: 0, book: createLogBook(LAYOUT, bad), doc: bad, rulesDigest: RULES, clockMinute: 0 });
  assert.deepEqual(loadSlot({ root, slot: 0, layout: LAYOUT, rulesDigest: RULES }), { ok: false, code: 'E-SEAL-DIGEST' });
});

test('槽位编号越界 E-SAVE-SLOT-INVALID；写盘失败 E-SAVE-WRITE-FAIL；启动时自动读档失败先 report', () => {
  const root = testTempRoot('save-');
  const book = createLogBook(LAYOUT, doc0());
  for (const slot of [3, -1, 1.5]) {
    assert.deepEqual(saveToSlot({ root, slot, book, doc: doc0(), rulesDigest: RULES, clockMinute: 0 }), { ok: false, code: 'E-SAVE-SLOT-INVALID' });
    assert.deepEqual(loadSlot({ root, slot, layout: LAYOUT, rulesDigest: RULES }), { ok: false, code: 'E-SAVE-SLOT-INVALID' });
  }
  const file = writeUnderTempRoot(root, 'not-a-dir', 'x');
  assert.deepEqual(saveToSlot({ root: file, slot: 0, book, doc: doc0(), rulesDigest: RULES, clockMinute: 0 }), { ok: false, code: 'E-SAVE-WRITE-FAIL' });
  logs.length = 0;
  assert.deepEqual(autoLoadSlot({ root, slot: 2, layout: LAYOUT, rulesDigest: RULES }), { ok: false, code: 'E-SAVE-TORN' });
  assert.deepEqual(logs.map((x) => [x.code, x.fields.slot]), [['E-SAVE-TORN', 2]]);
});

// ---------- 请求先记 doc_log（R27-7.3、卷二 :503；e11） ----------

test('请求受理时先单独把条目记入 doc_log 再处理；处理事务整笔回滚不抹条目，被拒的请求按编号留在输入序列里', () => {
  const st = { gauge: { gad_one: { level: 1 } } };
  const book = createLogBook(LAYOUT, doc0());
  const seenAtHandle = [];
  installProposalSession({
    state: st, book,
    resolve: (p) => ({ node: 'view:act', file: p.as, handler: (s, q) => { seenAtHandle.push(book.entries.length); writePath(s, P.gauge_level('gad_one'), q.to); } }),
  });
  try {
    assert.deepEqual(submitProposal({ request: 1, reply: {}, as: 'sys/gauge.mjs', to: 2 }), { ok: true });
    assert.deepEqual(submitProposal({ request: 2, reply: {}, as: 'sys/other.mjs', to: 3 }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  } finally {
    installProposalSession(null);
  }
  assert.deepEqual(seenAtHandle, [1, 2]);
  assert.deepEqual(book.entries, [{ request: 1, as: 'sys/gauge.mjs', to: 2 }, { request: 2, as: 'sys/other.mjs', to: 3 }]);
  assert.equal(st.gauge.gad_one.level, 2);
});
