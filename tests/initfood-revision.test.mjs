// INITFOOD：村级公共仓旧初粮修订批（删除型）；取代声明的回执侧路径规范化；计数规律按 classifySupersedes 推导。
// 发布前后都成立：条目读冻结候选（candidate.json，prepare 后存在；之前用 buildEntries 从发布前的世界现算），不依赖正式文件里仍有 food。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {REMOVE,editJSONText,rowOf,getPath,isPublished,preflightEntries} from '../world/design/p1-revision-approval.mjs';
import {parsePublication,classifySupersedes,applySupersedes,revertSuperseded,revertReceiptRow} from '../tools/approved-revisions.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import * as initfood from '../world/design/initfood-approval.mjs';

const world = await loadWorld();
const entries = initfood.frozenEntries() ?? await initfood.buildEntries(world);
const published = isPublished(world, entries);
const toPub = list => parsePublication({revision: 'initfood-1', receipt: 'dir/r', entries: list.map(e => ({id: e.id, target: e.target, file: e.file, field: e.field, before: e.before, after: e.after, supersedes: e.supersedes}))});
const own = /^world\/drafts\/w1\/village-ledgers\/([^/]+)\.json$/;

test('静态预检（不调模型）：条目编号符合流水线安全格式，固定草稿 L1 无错，复核请求可构造；不安全编号会被预检抓到', async () => {
  assert.deepEqual(await preflightEntries(entries), []);
  // 编号由聚落 id 机械推出（initfood-<聚落 id>），不含点、冒号、斜杠。
  for (const e of entries) assert.equal(e.id, `initfood-${e.target}`);
  // 反例：旧编号（含点）、含斜杠、数字开头、重复，预检都报问题（这正是 --review 才抛“条目编号不安全”的那类错误）。
  for (const bad of [`${entries[0].target}-${initfood.FIELD}`, 'a/b', '1abc', 'a:b']) {
    const problems = await preflightEntries([{...entries[0], id: bad}]);
    assert.ok(problems.some(p => p.includes('条目编号不安全')), bad);
  }
  assert.ok((await preflightEntries([entries[0], entries[0]])).some(p => p.includes('重复')));
});

test('批次上限：0.3 元 / 40 次（硬上限由批次自定）', () => {
  assert.equal(initfood.LIMIT_YUAN, 0.3);assert.equal(initfood.MAX_REQUESTS, 40);
});

test('条目：恰为四个村，删除型（after 为 REMOVE），before 是登记过的旧值；发布前正式文件有该值，发布后已无', () => {
  assert.deepEqual(entries.map(e => e.target).sort(), ['loc_bs_liquan', 'loc_bs_sangban', 'loc_bs_weiting', 'loc_bs_yupo']);
  for (const e of entries) {
    assert.deepEqual(e.after, REMOVE, e.id);
    assert.equal(typeof e.before, 'number', e.id);
    const food = rowOf(world, e.file, e.target).details.economy.publicStock.food;
    if (published) assert.equal(food, undefined, `${e.id}：已发布，正式文件不应再有登记值`);
    else assert.equal(food, e.before, `${e.id}：未发布，正式文件值应等于 before`);
  }
});

test('文本删除：只删被修订的键值对，其余逐字不变（用夹具文本，不依赖正式文件是否已发布）', () => {
  const rows = entries.map(e => ({id: e.target, details: {economy: {publicStock: {openingDay: 0, food: e.before, seed: 7}}}}));
  for (const text of [JSON.stringify(rows), JSON.stringify(rows, null, 2) + '\n']) {
    const out = editJSONText(text, entries);
    assert.deepEqual(JSON.parse(out), entries.map(e => ({id: e.target, details: {economy: {publicStock: {openingDay: 0, seed: 7}}}})));
    assert.ok(out.includes(text.includes('\n') ? '"openingDay": 0,' : '"openingDay":0,'));
  }
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

test('真实回执：每条取代声明的回执侧路径确实指向回执里存在的键，且值等于 before（路径写错会“静默不删”，这里必须报错）', async () => {
  const sups = toPub(entries);
  assert.ok(sups.length > 0);
  for (const s of sups) {
    const file = JSON.parse(await fs.readFile(s.receiptFile, 'utf8'));
    // 分件回执的行在 draft 里；candidate.json 的行在 profiles 数组里。
    const row = file.draft ?? file.profiles?.find(r => r.id === s.targetId);
    assert.ok(row, `${s.receiptFile}：找不到行 ${s.targetId}`);
    assert.equal(row.id, s.targetId);
    const parent = getPath(row, s.parts.slice(0, -1));
    assert.ok(parent && Object.hasOwn(parent, s.parts.at(-1)), `${s.receiptFile}#${s.targetId}：回执里没有 ${s.label} 这个键（路径写错）`);
    assert.equal(getPath(row, s.parts), s.before, `${s.receiptFile}#${s.targetId}：回执里的值不等于 before`);
    // 真实行上 applySupersedes 能删掉它，删后键不存在。
    const copy = structuredClone(row);
    assert.equal(applySupersedes([copy], s.receiptFile, sups).length, 1);
    assert.equal(getPath(copy, s.parts), undefined);
  }
});

test('删除型的父对象检查：回执路径中间段写错（父对象不存在）时报错而不是当成“已删”', () => {
  const s = toPub(entries).find(x => x.receiptFile.endsWith(`/${entries[0].target}.json`));
  assert.throws(() => applySupersedes([{id: s.targetId}], s.receiptFile, [s]), /父对象/);
  assert.throws(() => applySupersedes([{id: s.targetId, economy: 5}], s.receiptFile, [s]), /父对象/);
});

test('回执侧路径规范化（所有修订批共用）：回执字段是修订字段的整段后缀即可；回执行按回执路径应用，正式行按正式路径回退', () => {
  const sups = toPub(entries), s = sups.find(x => x.receiptFile.endsWith(`/${entries[0].target}.json`));
  assert.deepEqual(s.parts, ['economy', 'publicStock', 'food']);
  assert.deepEqual(s.formalParts, ['details', 'economy', 'publicStock', 'food']);
  // 正式行：键已删（after = REMOVE）→ 按正式路径补回 before。
  const formal = [{id: s.targetId, details: {economy: {publicStock: {seed: 1}}}}];
  assert.equal(revertSuperseded(formal, initfood.FILE, sups)[0].details.economy.publicStock.food, s.before);
  // 草稿回执行（没有 details 前缀）：现值等于 before 时按回执路径应用 REMOVE。
  const draft = [{id: s.targetId, economy: {publicStock: {food: s.before, seed: 1}}}];
  assert.equal(applySupersedes(draft, s.receiptFile, sups).length, 1);
  assert.ok(!Object.hasOwn(draft[0].economy.publicStock, 'food'));
  // 生成器已不产出该字段：生成的行（没有 food）还原成审批当时的行（有 food）再比指纹；不改入参，别的回执文件的行不动。
  const generated = {id: s.targetId, economy: {publicStock: {seed: 1}}};
  const restored = revertReceiptRow(generated, s.receiptFile, sups);
  assert.equal(restored.economy.publicStock.food, s.before);
  assert.ok(!Object.hasOwn(generated.economy.publicStock, 'food'));
  assert.deepEqual(revertReceiptRow(generated, 'world/drafts/other.json', sups), generated);
  // 非整段后缀的字段仍被拒绝。
  const e0 = entries[0], bad = field => parsePublication({revision: 'x', receipt: 'dir/r', entries: [{id: 'i', target: e0.target, file: e0.file, field: e0.field, before: 1, after: REMOVE, supersedes: [{receipt: `a.json#${e0.target}`, field}]}]});
  assert.throws(() => bad('conomy.publicStock.food'), /字段不同/);
  assert.throws(() => bad('publicStock.seed'), /字段不同/);
  assert.doesNotThrow(() => bad(e0.field));
});
