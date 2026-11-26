// S1-1 卡 B2 单测：日志簿、存槽、读档与复演（卷二十七 :534、:542–:545、:551、:556–:558、:562、:740、:742；卷二 :545）。
// 全部经 index.mjs 的 init / saveSlot / loadSlot / replay_apply 起，不 mock；存档根目录用系统临时目录。
// 期望值按卷文与数据表推得（时钟 = 提交的分钟数之和；条目数按“输入 1 条 + 结果事件”数）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import express from 'express';
import { useReportSink } from '../../server-plugin/kernel/errors.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { canonical } from '../../server-plugin/kernel/storage.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

/** 临时存档根目录（仓库外，tests/accept/temp-root.mjs 的唯一入口；建在系统临时目录，不在测试里删，删除助手登记交门禁封口卡）。 */
async function withRoot(fn) {
  const root = testTempRoot('s1b2-save-');
  return fn(root, pathToFileURL(join(root, '/')));
}

/** 槽目录与文件名都按数据表 rules.saveLayout.files 取（不在测试里写死）。 */
const layout = (g, root, slot) => {
  const f = g.engine.saveLayout.files;
  const rel = `${f.slotDirPrefix}${slot}`;
  return {
    shards: join(root, rel, f.shardDir), current: join(root, rel, f.manifest), prev: join(root, rel, f.prevManifest),
    shard: (d) => join(root, rel, f.shardDir, `${d}${f.shardExt}`),
    relCurrent: `${rel}/${f.manifest}`, relShard: (d) => `${rel}/${f.shardDir}/${d}${f.shardExt}`,
  };
};

/** 收集 report 的码。 */
function captureReports(fn) {
  const codes = [];
  const prev = useReportSink((rec) => codes.push(rec.code));
  try { return { value: fn(), codes }; } finally { useReportSink(prev); }
}

test('日志不在 state：init 后 state 无 log 顶层键，日志簿有开局快照；提交后条数增加、state 顶层键不变', async () => {
  const g = await init(express.Router());
  assert.equal(Object.hasOwn(g.state, 'log'), false);
  assert.ok(Array.isArray(g.logBook.entries));
  assert.equal(g.logBook.entries.length, 0);
  assert.equal(g.logBook.snapshots.length, 1);
  assert.equal(g.logBook.snapshots[0].atEntry, 0);
  const keys = Object.keys(g.state).sort();
  g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
  assert.equal(g.logBook.entries.length, 2);
  assert.deepEqual(Object.keys(g.state).sort(), keys);
});

test('存读复演：saveDigest 与存盘时逐字相等，时钟相等；心跳推进按序列重放', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    const step = g.engine.host.heartbeatStepMinutes;
    g.submitProposal({ effects: [{ op: 'time', minutes: 2 * step + 5 }] });
    for (let i = 0; i < 3; i++) g.advance(step);
    const saved = saveSlot(g);
    const loaded = loadSlot(saved, { saveRoot: url });
    const replayed = replay_apply(loaded);
    assert.equal(replayed.saveDigest, saved.saveDigest);
    assert.equal(clockMinute(replayed.engine, replayed.state), 2 * step + 5 + 3 * step);
    assert.equal(saved.clockMinute, 2 * step + 5 + 3 * step);
  });
});

test('提交后推进不记 advance 条目；复演后时钟不翻倍', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    g.submitProposal({ effects: [{ op: 'time', minutes: 25 }] });
    assert.equal(g.logBook.entries.filter((e) => e.kind === 'advance').length, 0);
    assert.equal(g.logBook.entries.filter((e) => e.kind === 'command').length, 1);
    const replayed = replay_apply(loadSlot(saveSlot(g), { saveRoot: url }));
    assert.equal(clockMinute(replayed.engine, replayed.state), 25);
  });
});

test('被拒请求留在序列；复演时同一处同样被拒（同一 code）', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    const bad = g.submitProposal({ effects: [{ op: 'no.such.op' }] });
    assert.equal(bad.ok, false);
    g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
    assert.equal(g.logBook.entries.filter((e) => e.kind === 'command').length, 2);
    const saved = saveSlot(g);
    const replayed = replay_apply(loadSlot(saved, { saveRoot: url }));
    assert.equal(replayed.saveDigest, saved.saveDigest);
    const ev = replayed.logBook.entries.find((e) => e.seq === bad.seq && e.kind === 'event');
    assert.equal(ev.ok, false);
    assert.equal(ev.code, bad.code);
  });
});

test('篡改结果事件（片摘要自洽）即 E-REPLAY-DIVERGE，fields 带首处分歧 seq', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
    g.submitProposal({ effects: [{ op: 'time', minutes: 7 }] });
    const saved = saveSlot(g);
    const L = layout(g, root, saved.slot);
    const log = JSON.parse(readFileSync(L.shard(saved.shardDigests.doc_log), 'utf8'));
    const i = log.findIndex((e) => e.kind === 'event' && e.advanceMinutes === 7);
    log[i] = { ...log[i], advanceMinutes: 8 };
    const text = canonical(log);
    const digest = createDigestCap().sha256Hex(text, 'utf8');
    writeUnderTempRoot(root, L.relShard(digest), text);
    const manifest = JSON.parse(readFileSync(L.current, 'utf8'));
    manifest.shardDigests.doc_log = digest;
    writeUnderTempRoot(root, L.relCurrent, canonical(manifest));
    const loaded = loadSlot(saved, { saveRoot: url });
    assert.throws(() => replay_apply(loaded), (/** @type {any} */ e) => e.code === 'E-REPLAY-DIVERGE' && e.fields.seq === log[i].seq);
  });
});

test('当前清单引用的片损坏（摘要不符）：回退上一份清单并报 E-SAVE-TORN，复演得第一次存档的 saveDigest；两份清单都无的槽即 E-SAVE-EMPTY', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
    const first = saveSlot(g);
    g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
    const second = saveSlot(g);
    assert.notEqual(second.saveDigest, first.saveDigest);
    const L = layout(g, root, 0);
    writeUnderTempRoot(root, L.relShard(second.shardDigests.doc_log), '[]');
    const { value: loaded, codes } = captureReports(() => loadSlot(second, { saveRoot: url }));
    assert.ok(codes.includes('E-SAVE-SHARD-DIGEST') && codes.includes('E-SAVE-TORN'), codes.join(','));
    assert.equal(replay_apply(loaded).saveDigest, first.saveDigest);
    assert.throws(() => loadSlot({ slot: second.slot + 1 }, { saveRoot: url }), /E-SAVE-EMPTY/);
  });
});

test('指纹不符（engineRulesDigest 或 dataPacksDigest）即 E-SAVE-RULES-MISMATCH，存档文件字节不变', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    const saved = saveSlot(g);
    const L = layout(g, root, 0);
    for (const field of ['engineRulesDigest', 'dataPacksDigest']) {
      const m = JSON.parse(readFileSync(L.current, 'utf8'));
      m[field] = createDigestCap().sha256Hex(field, 'utf8');
      writeUnderTempRoot(root, L.relCurrent, canonical(m));
      const before = readFileSync(L.current, 'utf8');
      const files = readdirSync(L.shards).sort();
      assert.throws(() => loadSlot(saved, { saveRoot: url }), /E-SAVE-RULES-MISMATCH/, field);
      assert.equal(readFileSync(L.current, 'utf8'), before);
      assert.deepEqual(readdirSync(L.shards).sort(), files);
      m[field] = saved[field];
      writeUnderTempRoot(root, L.relCurrent, canonical(m));
    }
  });
});

test('槽位越界（saveSlotCount、-1、1.5）即 E-SAVE-SLOT-INVALID，不写任何文件', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    for (const slot of [g.engine.host.saveSlotCount, -1, 1.5]) {
      assert.throws(() => saveSlot(g, slot), /E-SAVE-SLOT-INVALID/, String(slot));
    }
    assert.deepEqual(readdirSync(root), []);
  });
});

test('清单无墙钟：键集合恰为八个字段；不同时刻存同一世界，清单逐字节相同', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
    const a = saveSlot(g);
    assert.deepEqual(Object.keys(a).sort(), ['clockMinute', 'dataPacksDigest', 'engineRulesDigest', 'logSegments', 'saveDigest', 'shardDigests', 'slot', 'snapshotIndex']);
    const L = layout(g, root, 0);
    const textA = readFileSync(L.current, 'utf8');
    await new Promise((r) => setTimeout(r, 20));
    saveSlot(g);
    assert.equal(readFileSync(L.current, 'utf8'), textA);
  });
});

test('同一世界不变连存两次，第二次不新增片文件', async () => {
  await withRoot(async (root, url) => {
    const g = await init(express.Router(), { saveRoot: url });
    g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
    saveSlot(g);
    const L = layout(g, root, 0);
    const before = readdirSync(L.shards).sort();
    saveSlot(g);
    assert.deepEqual(readdirSync(L.shards).sort(), before);
  });
});

test('saveRoot 传路径字串（不带结尾分隔符）：存读复演 saveDigest 相等', async () => {
  const root = testTempRoot('s1b2-path-');
  const g = await init(express.Router(), { saveRoot: root });
  g.submitProposal({ effects: [{ op: 'time', minutes: 5 }] });
  g.advance(g.engine.host.heartbeatStepMinutes);
  const saved = saveSlot(g);
  assert.ok(readdirSync(root).length > 0);
  const replayed = replay_apply(loadSlot(saved, { saveRoot: root }));
  assert.equal(replayed.saveDigest, saved.saveDigest);
});
