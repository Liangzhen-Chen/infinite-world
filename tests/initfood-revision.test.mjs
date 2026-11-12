// INITFOOD：村级公共仓旧初粮修订批（删除型）；取代声明的回执侧路径规范化；计数规律按 classifySupersedes 推导。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {REMOVE,editJSONText,rowOf} from '../world/design/p1-revision-approval.mjs';
import {parsePublication,classifySupersedes,applySupersedes,revertSuperseded} from '../tools/approved-revisions.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import * as initfood from '../world/design/initfood-approval.mjs';

const world = await loadWorld();
const entries = await initfood.buildEntries(world);
const toPub = list => parsePublication({revision: 'initfood-1', receipt: 'dir/r', entries: list.map(e => ({id: e.id, target: e.target, file: e.file, field: e.field, before: e.before, after: e.after, supersedes: e.supersedes}))});
const own = /^world\/drafts\/w1\/village-ledgers\/([^/]+)\.json$/;
const holders = () => world.settlementProfiles.filter(r => typeof r.details?.economy?.publicStock?.food === 'number');

test('批次上限：0.3 元 / 40 次（硬上限由批次自定）', () => {
  assert.equal(initfood.LIMIT_YUAN, 0.3);assert.equal(initfood.MAX_REQUESTS, 40);
});

test('条目：每个带登记公仓初粮的村一条，删除型（after 为 REMOVE），before 是当前登记值', () => {
  assert.ok(entries.length > 0);
  assert.deepEqual(entries.map(e => e.target).sort(), holders().map(r => r.id).sort());
  for (const e of entries) {
    assert.deepEqual(e.after, REMOVE, e.id);
    assert.equal(e.before, rowOf(world, e.file, e.target).details.economy.publicStock.food);
    assert.ok(e.supersedes.length >= 2);
    for (const s of e.supersedes) { assert.match(s.receipt, /^world\/drafts\/w1\/village-ledgers\/[^/#]+\.json#loc_bs_\w+$/); assert.equal(s.field, initfood.RECEIPT_FIELD); }
  }
});

test('文本删除：只删被修订的键值对，其余逐字不变；回退（补回 before）即原结构', async () => {
  const text = await fs.readFile(initfood.FILE, 'utf8');
  const next = JSON.parse(editJSONText(text, entries)), prev = JSON.parse(text);
  for (const e of entries) {
    const stock = rowOf({settlementProfiles: next}, initfood.FILE, e.target).details.economy.publicStock;
    assert.ok(!Object.hasOwn(stock, 'food'), e.id);
    // 与原结构对比：补回 before 后整体相等（键序除外，deepEqual 不看键序）。
    stock.food = e.before;
  }
  assert.deepEqual(next, prev);
});

test('取代计数（classifySupersedes）：删除型每个被取代回执行算已移除，现存行数 = 总行数 − 移除行数；改值型同一批不减', () => {
  const sups = toPub(entries), total = new Set(sups.map(s => s.receiptFile)).size;
  const del = classifySupersedes(sups, own);
  assert.equal(del.changed.length, 0);
  assert.equal(del.removed.length, sups.length);
  // 手推：每个取代声明指向一个回执文件；现存行数 = 回执文件数 − 被移除的不同回执文件数（此处全部被移除）。
  assert.equal(total - new Set(del.removed.map(x => x.s.receiptFile)).size, 0);
  // 改值型夹具：同样的声明把 after 换成新值，全部算“仍现存、值改了”，现存行数不减。
  const mod = classifySupersedes(toPub(entries.map(e => ({...e, after: 1}))), own);
  assert.equal(mod.removed.length, 0);
  assert.equal(mod.changed.length, sups.length);
  assert.equal(total - new Set(mod.removed.map(x => x.s.receiptFile)).size, total);
});

test('回执侧路径规范化（所有修订批共用）：回执字段是修订字段的整段后缀即可；回执行按回执路径应用，正式行按正式路径回退', () => {
  const sups = toPub(entries), s = sups.find(x => x.receiptFile.endsWith(`/${entries[0].target}.json`));
  assert.deepEqual(s.parts, ['economy', 'publicStock', 'food']);
  assert.deepEqual(s.formalParts, ['details', 'economy', 'publicStock', 'food']);
  // 正式行：键已删（after = REMOVE）→ 按正式路径补回 before。
  const formal = [{id: s.targetId, details: {economy: {publicStock: {seed: 1}}}}];
  const back = revertSuperseded(formal, initfood.FILE, sups);
  assert.equal(back[0].details.economy.publicStock.food, s.before);
  // 草稿回执行（没有 details 前缀）：现值等于 before 时按回执路径应用 REMOVE。
  const draft = [{id: s.targetId, economy: {publicStock: {food: s.before, seed: 1}}}];
  assert.equal(applySupersedes(draft, s.receiptFile, sups).length, 1);
  assert.ok(!Object.hasOwn(draft[0].economy.publicStock, 'food'));
  // 非整段后缀的字段仍被拒绝。
  const e0 = entries[0], bad = field => parsePublication({revision: 'x', receipt: 'dir/r', entries: [{id: 'i', target: e0.target, file: e0.file, field: e0.field, before: 1, after: REMOVE, supersedes: [{receipt: `a.json#${e0.target}`, field}]}]});
  assert.throws(() => bad('conomy.publicStock.food'), /字段不同/);
  assert.throws(() => bad('publicStock.seed'), /字段不同/);
  assert.doesNotThrow(() => bad(e0.field));
});
