// D12 材料属性 L4（人读抽样）按批处理：每批各抽各记、verify 逐批都要求；小批 wave 取全部；D 卡只抽仍属本卡的条目；batch-0 旧选择文件兼容。
// 注入点是生产代码自己的参数：card 档案（reviewRoot、entries）、sampleL4/verifyPublished 的 approval 与 checkL1 选项。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {hashContent} from '../tools/content-pipeline.mjs';
import {sampleL4, recordL4, checkWave, waveSize, verifyPublished, readSelection, selectionFileOf} from '../world/design/matprops-approval.mjs';

const approval = async () => ({unresolved: [], l2: [], manual: []});
const mkRoot = async t => { const dir = await fs.mkdtemp(path.join(tmpRoot(), 'matprops-l4-')); t.after(() => fs.rm(dir, {recursive: true, force: true})); return dir; };
const write = (dir, name, data) => fs.writeFile(path.join(dir, name), JSON.stringify(data));
const read = (dir, name) => fs.readFile(path.join(dir, name), 'utf8').then(JSON.parse);
// batches：[[id, ...], ...]；ownIds：本卡条目（默认全部）。每批带 sample（前 2 条）与 flagged（第 3 条）
async function fixture(t, batches, ownIds = null) {
  const dir = await mkRoot(t), all = batches.flat(), summary = {batches: []};
  for (const id of all) await write(dir, `${id}.json`, {id, draft: {id, row: {}}, review: {contradictions: []}, status: 'passed'});
  for (const [index, ids] of batches.entries()) {
    const rows = ids.map(id => ({id, draft: {id, row: {}}, review: {contradictions: []}, status: 'passed'}));
    const batch = {index, fingerprint: hashContent(rows), count: ids.length, ids, sample: ids.slice(0, 2), flagged: ids.slice(2, 3), l4: {approved: false, notes: []}};
    await write(dir, `batch-${index}.json`, batch); summary.batches.push(batch);
  }
  await write(dir, 'summary.json', summary);
  const own = ownIds ?? all;
  return {dir, card: {name: 'T', revision: 'r', reviewRoot: dir, manualFile: path.join(dir, 'manual.json'), entries: async () => own.map(id => ({id}))}};
}
const notesFor = sel => ({notes: sel.read.map(id => ({id, note: '读过'})), wave: sel.wave.map(id => ({id, scores: [4, 4, 4, 4, 4, 4], note: 'ok'}))});
const record = async (dir, card, sel, batch) => { await write(dir, `notes-${batch}.json`, notesFor(sel)); return recordL4(path.join(dir, `notes-${batch}.json`), 'r', card, {batch}); };
const ids = (p, n) => Array.from({length: n}, (_, i) => `${p}${i}`);

test('每批都要求 L4：只记一批 verify 报另一批尚未完成；--sample 不带批号时每批各抽一份（选择文件按批分开）', async t => {
  const {dir, card} = await fixture(t, [ids('a', 12), ids('b', 12)]);
  const sels = await sampleL4(card, {approval});
  assert.deepEqual(sels.map(s => s.batch), [0, 1]);
  assert.ok((await fs.stat(selectionFileOf(card, 0))) && (await fs.stat(selectionFileOf(card, 1))));
  assert.ok(sels.every(s => s.wave.length === 10 && s.read.length >= 10));   // wave 10 条，read ⊇ wave
  await record(dir, card, sels[0], 0);
  await assert.rejects(() => verifyPublished(card, {checkL1: false, approval}), /批 1 尚未完成 L4/);
  await record(dir, card, sels[1], 1);
  const r = await verifyPublished(card, {checkL1: false, approval});
  assert.equal(r.total, 24);
  // 已记录 L4 的批：不带批号时跳过；点名重抽则拒绝（会使已记录的 L4 与选择不符）
  assert.deepEqual((await sampleL4(card, {approval})).map(s => s.skipped), ['已记录 L4', '已记录 L4']);
  await assert.rejects(() => sampleL4(card, {batch: 1, approval}), /已记录 L4/);
  await assert.rejects(() => sampleL4(card, {batch: 7, approval}), /没有批 7/);
});

test('小批 wave 取全部（min(10, 批内条数)），checkWave 按批内条数校验，其他要求不放宽', async t => {
  assert.equal(waveSize(25), 10); assert.equal(waveSize(8), 8); assert.equal(waveSize(1), 1);
  const {dir, card} = await fixture(t, [ids('a', 12), ids('s', 4)]);
  const [big, small] = await sampleL4(card, {approval});
  assert.deepEqual([...small.wave].sort(), ids('s', 4));   // 批内 4 条：wave 全取
  assert.equal(big.wave.length, 10);
  await record(dir, card, big, 0); await record(dir, card, small, 1);
  await verifyPublished(card, {checkL1: false, approval});
  const own = ids('s', 4), good = own.map(id => ({id, scores: [4, 4, 4, 4, 4, 4], note: 'n'}));
  checkWave(good, own, 4);
  assert.throws(() => checkWave(good.slice(0, 3), own, 4), /不达标/);                                   // 少一条
  assert.throws(() => checkWave([...good.slice(0, 3), {...good[3], scores: [4, 4, 4, 4, 4, 2]}], own, 4), /不达标/);   // 分数越界（<3）
  assert.throws(() => checkWave(good.map(x => ({...x, scores: [3, 3, 3, 3, 3, 3]})), own, 4), /不达标/);   // 均分 <4
  assert.throws(() => checkWave([...good.slice(0, 3), {...good[3], note: ''}], own, 4), /不达标/);          // 缺评语
  assert.throws(() => checkWave([...good.slice(0, 3), {...good[3], id: 'zz'}], own, 4), /不达标/);          // 不在批内
  assert.throws(() => checkWave([...good.slice(0, 3), good[0]], own, 4), /不达标/);                        // 重复
  assert.throws(() => checkWave(good, own), /不达标/);                                                    // 默认仍是 10 条
  // verify 对小批也要求评分：把 wave 评分改低 → 报错
  const b1 = await read(dir, 'batch-1.json'); b1.l4.wave[0].scores = [3, 3, 3, 3, 3, 3]; b1.l4.wave[1].scores = [3, 3, 3, 3, 3, 3]; await write(dir, 'batch-1.json', b1);
  await assert.rejects(() => verifyPublished(card, {checkL1: false, approval}), /不达标/);
});

test('D 卡抽样不含已移交条目：只抽、只读仍属本卡的条目；整批都已移交的批不需要 L4；verify 同口径', async t => {
  // 批 0：d0 d1 + 已移交 m0 m1 m2；批 1：全是已移交
  const {dir, card} = await fixture(t, [['d0', 'd1', 'm0', 'm1', 'm2'], ['m3', 'm4']], ['d0', 'd1']);
  const sels = await sampleL4(card, {approval});
  assert.equal(sels[0].batch, 0);
  assert.deepEqual([...sels[0].wave].sort(), ['d0', 'd1']);                      // 小批：wave 取本卡全部
  assert.ok([...sels[0].read, ...sels[0].wave].every(id => ['d0', 'd1'].includes(id)));   // 不含 m*
  assert.match(sels[1].skipped, /已移交/);
  await assert.rejects(() => fs.stat(selectionFileOf(card, 1)));               // 全移交的批不写选择文件
  await record(dir, card, sels[0], 0);
  const r = await verifyPublished(card, {checkL1: false, approval});   // 批 1 没有 L4 也通过；批 0 只要求本卡条目的阅读与评分
  assert.equal(r.total, 2);
  // 把已移交条目写进 L4 记录不算数、也不被要求：批 0 的阅读记录里没有 m0 也通过（上面已是如此）；去掉 d0 的阅读记录则报错
  const b0 = await read(dir, 'batch-0.json'); b0.l4.notes = b0.l4.notes.filter(n => n.id !== 'd0'); await write(dir, 'batch-0.json', b0);
  await assert.rejects(() => verifyPublished(card, {checkL1: false, approval}), /缺少 L4 阅读记录 d0/);
});

test('batch-0 旧选择文件 l4-selection.json 兼容：没有新命名文件时 batch 0 读旧文件；新命名文件优先', async t => {
  const {dir, card} = await fixture(t, [ids('a', 12)]);
  const batch = await read(dir, 'batch-0.json');
  const legacy = {fingerprint: batch.fingerprint, wave: ids('a', 12).slice(0, 10), read: ids('a', 12).slice(0, 10)};
  await write(dir, 'l4-selection.json', legacy);
  assert.deepEqual(await readSelection(card, 0), legacy);
  await record(dir, card, legacy, 0);   // 只有旧文件也能记 L4
  assert.equal((await read(dir, 'batch-0.json')).l4.approved, true);
  await verifyPublished(card, {checkL1: false, approval});
  // 旧文件只对 batch 0 有效；batch 1 没有选择文件时报错
  const two = await fixture(t, [ids('a', 12), ids('b', 12)]);
  await write(two.dir, 'l4-selection.json', {fingerprint: 'x', wave: [], read: []});
  assert.equal(await readSelection(two.card, 1), null);
  await assert.rejects(() => recordL4(path.join(dir, 'notes-0.json'), 'r', two.card, {batch: 1}), /还没有抽样选择文件/);
  // 新命名文件优先于旧文件
  await sampleL4(two.card, {batch: 0, approval});
  assert.notEqual((await readSelection(two.card, 0)).fingerprint, 'x');
  // 选择文件与批指纹不符（批内容变了）→ 拒绝记录
  const stale = await fixture(t, [ids('a', 12)]);
  const [sel] = await sampleL4(stale.card, {approval});
  await write(stale.dir, 'l4-selection-0.json', {...sel, fingerprint: 'changed'});
  await assert.rejects(() => record(stale.dir, stale.card, {...sel}, 0), /缺少实际抽样阅读或评分/);
});
