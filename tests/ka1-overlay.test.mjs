// 卡 A1：已审内容只经审批管线。盘上的已审行与审批回执一致；规律读的机制字段放在 world/meta/mechanics/，
// 只在运行时世界里合并；合并不改写任何已审的值，重复合并结果不变。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {loadWorld, loadRuntimeWorld} from '../tools/load-world.mjs';
import {materializeRuntimeWorld, mechanicsCollections} from '../server-plugin/runtime-world.mjs';
import {canonical} from '../server-plugin/storage.mjs';
import {readApprovedSupersedes, revertSuperseded} from '../tools/approved-revisions.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {entriesFor as matpropsEntries, draftRoot as matpropsDraftRoot, condimentCard, cardProfiles, summarizeApproval, verifyAll} from '../world/design/matprops-approval.mjs';

const J = rel => JSON.parse(fs.readFileSync(rel, 'utf8'));
// 覆盖层的值被运行时值包含：对象逐字段包含，数组的每个元素都在运行时数组里有一个包含它的元素
const contains = (have, want) => Array.isArray(want) ? Array.isArray(have) && want.every(w => have.some(h => contains(h, w)))
  : want && typeof want === 'object' ? have && typeof have === 'object' && Object.entries(want).every(([k, v]) => contains(have[k], v)) : have === want;
const rowFiles = ['meta/items.json', 'meta/recipes.json', 'geo/locations.json', 'meta/professions.json', 'meta/skills.json', 'meta/spells.json', 'people/baseline.json', 'people/residents.json', 'people/households.json'];
const formal = new Map(rowFiles.flatMap(f => J(`world/${f}`).map(r => [r.id, r])));
// 审批回执里是审批当时的行：后来经审批的修订回执（如正文修订批）取代过的字段回退到 before 再比；回执之外的改动不回退，仍会使整行比对失败。
const supersedes = await readApprovedSupersedes();
const formalAsApproved = new Map(rowFiles.flatMap(f => revertSuperseded(J(`world/${f}`), `world/${f}`, supersedes).map(r => [r.id, r])));
const overlay = Object.fromEntries(mechanicsCollections.map(n => [n, J(`world/meta/mechanics/${n}.json`)]));
const species = new Map(J('world/ecology/species.json').species.map(s => [s.id, s]));
const careers = J('world/meta/careers.json');
const fileRow = (collection, id) => collection === 'species' ? species.get(id) : collection === 'careers' ? careers[id] : formal.get(id);

test('每个审批批次里通过的整行回执，正式文件里的行与其中一份（同一行后来再审的取最新）逐字一致；D12 材料属性记录按其自己的口径校验', async () => {
  const approved = new Map();
  // D12 材料属性的审批对象是类别行（class_*）与物品的 props 覆盖行（mechanics/items.json#id.props），不是 items.json 的整行：
  // 这两张卡（matprops-approval 的 D 卡与调味佐餐卡）的记录按它自己的口径校验（validateDraft：候选须与 entriesFor() 给出的盘上条目完全一致且带 basis），其余照旧比整行。
  const d12Roots = [matpropsDraftRoot, condimentCard.draftRoot].map(r => r.split(path.sep).join('/') + '/');
  const d12Entries = new Map((await matpropsEntries()).map(e => [e.id, e]));
  for (const summary of execSync('git ls-files world/drafts', {encoding: 'utf8'}).trim().split('\n').filter(f => /(^|\/)summary\.json$/.test(f))) {
    const dir = path.dirname(summary);
    for (const batch of J(summary).batches ?? []) for (const id of batch.ids ?? []) {
      const file = path.join(dir, `${id}.json`);
      if (!fs.existsSync(file)) continue;
      const record = J(file);
      if (d12Roots.some(r => summary.startsWith(r))) {
        continue;
      }
      if (record.status === 'passed' && record.draft?.row && formal.has(id)) approved.set(id, [...approved.get(id) ?? [], JSON.stringify(record.draft.row)]);
    }
  }
  assert.ok(approved.size > 50);
  const changed = [...approved].filter(([id, rows]) => !rows.includes(JSON.stringify(formalAsApproved.get(id)))).map(([id]) => id);
  assert.deepEqual(changed, []);
  // D12 的判定口径是 matprops-approval 的正式判定（L2 通过或人工核定），这里不另写规则：
  // ① 每个 D12 目录里出现的记录，entriesFor 没覆盖到的一律失败并列出；② 两张卡逐条用 summarizeApproval 的结论对账（未决为空，通过+人工 = 该卡条目数）；③ verifyAll 整体通过。
  const d12Uncovered = [], d12Ids = new Set(d12Entries.keys());
  for (const summary of execSync('git ls-files world/drafts', {encoding: 'utf8'}).trim().split('\n').filter(f => /(^|\/)summary\.json$/.test(f) && d12Roots.some(r => f.startsWith(r)))) {
    for (const batch of J(summary).batches ?? []) for (const id of batch.ids ?? []) if (fs.existsSync(path.join(path.dirname(summary), `${id}.json`)) && !d12Ids.has(id)) d12Uncovered.push(`${path.dirname(summary)}/${id}`);
  }
  assert.deepEqual(d12Uncovered, []);
  const judged = [];
  for (const card of Object.values(cardProfiles)) {
    const entries = await card.entries(), st = await summarizeApproval(entries, card);
    assert.deepEqual(st.unresolved, [], `${card.name} 有未决条目`);
    assert.equal(st.l2.length + st.manual.length, entries.length, `${card.name} 通过+人工核定 ≠ 条目数`);
    judged.push(...entries.map(e => e.id));
  }
  assert.deepEqual([...judged].sort(), [...d12Ids].sort());
  assert.equal((await verifyAll()).ok, true);
});

test('机制字段只在覆盖层：已审行不带覆盖层给的字段与条目，loadWorld 返回的行就是盘上的行', async () => {
  for (const [collection, rows] of Object.entries(overlay)) for (const [id, patch] of Object.entries(rows)) {
    const row = fileRow(collection, id);
    assert.ok(row, `${collection}.${id} 不在正式文件`);
    const target = collection === 'species' ? row.husbandry : row, fields = collection === 'species' ? patch.husbandry : patch;
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value) && Array.isArray(target[key])) assert.ok(!value.some(v => target[key].some(h => JSON.stringify(h) === JSON.stringify(v))), `${collection}.${id}.${key} 已写进正式文件`);
      else assert.equal(target[key], undefined, `${collection}.${id}.${key} 已写进正式文件`);
    }
  }
  const world = await loadWorld();
  for (const key of ['items', 'recipes', 'professions']) for (const row of world[key]) if (formal.has(row.id)) assert.deepEqual(row, formal.get(row.id), `${key}.${row.id}`);
  // 地点另并入 geo/biomes.json 的群落标签（D1，旧有的加载步骤），其余字段与盘上一致
  const biomes = J('world/geo/biomes.json').locations ?? {};
  for (const row of world.locations) assert.deepEqual(row, {...formal.get(row.id), ...biomes[row.id]}, `locations.${row.id}`);
});

test('运行时世界带上全部机制字段；据点不再生制成品；重复合并不变；注释改写已审值时拒绝', async () => {
  const runtime = await loadRuntimeWorld();
  const rows = {items: runtime.items, locations: runtime.locations, professions: runtime.professions, species: runtime.monsters};
  for (const [collection, patches] of Object.entries(overlay)) for (const [id, patch] of Object.entries(patches)) {
    const row = collection === 'careers' ? runtime.careers[id] : rows[collection].find(r => r.id === id);
    const target = collection === 'species' ? row.husbandry : row, fields = collection === 'species' ? patch.husbandry : patch;
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value)) assert.ok(value.every(v => target[key].some(h => JSON.stringify(h) === JSON.stringify(v))), `${collection}.${id}.${key}`);
      // 据点（site）是作者给的部分加上加载期规律（再生、本栖地原生资源）派生的部分：覆盖层写的每个字段都必须原样出现在运行时据点里，规律另加的条目不在此比较
      else if (key === 'site') assert.ok(contains(target[key], value), `${collection}.${id}.${key}`);
      else assert.deepEqual(target[key], value, `${collection}.${id}.${key}`);
    }
  }
  const made = new Set(runtime.recipes.flatMap(r => [r.output.item, ...(r.byproducts ?? []).map(b => b.item)]));
  for (const l of runtime.locations) {
    const items = new Map((l.site?.resources ?? []).map(r => [r.id, r.item]));
    for (const c of l.site?.changes ?? []) if (c.kind === 'regrow') assert.ok(!made.has(items.get(c.resource)), `${l.id}:${c.id}`);
  }
  assert.equal(runtime.mechanics, undefined);
  const before = canonical(runtime);
  materializeRuntimeWorld(runtime);
  assert.equal(canonical(runtime), before);
  // 盘上直接读出的已审世界经引擎同一步合并，得到同一份运行时行
  const reviewed = materializeRuntimeWorld(await loadWorld());
  // （运行时世界另有 F 派生的营养与生熟，这里只比合并出来的字段）
  for (const [i, row] of reviewed.items.entries()) for (const key of Object.keys(row)) assert.equal(canonical(row[key]), canonical(runtime.items[i][key]), `${row.id}.${key}`);
  assert.equal(canonical(reviewed.locations.map(l => [l.id, l.fixtures, l.site])), canonical(runtime.locations.map(l => [l.id, l.fixtures, l.site])));
  assert.throws(() => materializeRuntimeWorld({items: [{id: 'item_x', basePrice: 3, tags: ['a']}], locations: [], recipes: [], mechanics: {items: {item_x: {basePrice: 5}}}}), /不能改写已审字段/);
  const joined = materializeRuntimeWorld({items: [{id: 'item_x', tags: ['a']}], locations: [], recipes: [], mechanics: {items: {item_x: {tags: ['a', 'b'], animalProduct: {from: 'coat'}}}}});
  assert.deepEqual(joined.items[0], {id: 'item_x', tags: ['a', 'b'], animalProduct: {from: 'coat'}});
});

test('同一份世界浅拷贝后连建两次引擎：覆盖层按 id 合并，产地行与库存不重复、不变', async () => {
  const world = await loadWorld();
  const copy = {...world};
  const first = new WorldEngine(world);
  const places = engine => engine.world.locations.filter(l => l.id.startsWith('site_ms_') && l.site?.resources?.length);
  const snapshot = engine => JSON.stringify(places(engine).map(l => [l.id, l.site.resources, l.site.changes]));
  const before = snapshot(first);
  assert.ok(places(first).length > 0);
  const second = new WorldEngine(copy);
  assert.equal(snapshot(second), before);
  for (const l of places(second)) {
    const ids = l.site.resources.map(r => r.id);
    assert.equal(new Set(ids).size, ids.length, l.id);
    for (const r of l.site.resources) assert.ok(Number.isFinite(r.quantity) && r.quantity > 0, `${l.id}:${r.id}`);
  }
});
