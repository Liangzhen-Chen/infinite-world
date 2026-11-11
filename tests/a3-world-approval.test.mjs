import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {settlementGovernment} from '../server-plugin/entity-view.mjs';
import {ensureHoldings, aliveHoldings} from '../server-plugin/holdings.mjs';
import {reconcileHoldings, reconciled} from '../server-plugin/holding-sources.mjs';
import {readFiles, contentEntries, checkEntry, previewWorld, priorEditions, verifyPublished as verifyOriginalPublished} from '../world/design/a3-world-approval.mjs';
import {sources as useTagSources, verifyPublished as verifyUseTagsPublished} from '../world/design/a3w-props-approval.mjs';
import * as G from '../world/design/a3-world-governance.mjs';

// Gate for the Baishi grassroots judicial/security offices (report, fine collection, custody, case handling,
// arrest, appeal, claim, town head) and for the catalogue entries (items, recipes, nutrition, rules rows) that
// were written into the world files without L1/L2/L4 receipts. Every row carries receipts bound to its exact bytes; a
// later hand edit of any of them fails here. A3W subsequently approved use tags
// on existing items: verify that complete later receipt first, then restore only
// the historical tags when checking the original exact-row receipt. Prices,
// nutrition and every other historical field remain covered by the old gate.
async function verifyPublished(candidateWorld,candidateFiles){
  await verifyUseTagsPublished(candidateFiles.items);
  const prior=structuredClone(candidateFiles);
  for(const entry of contentEntries(prior).filter(e=>e.kind==='item'&&useTagSources[e.id])){
    const receipt=JSON.parse(await fs.readFile(`world/drafts/a3-world-approval/${entry.id}.json`,'utf8'));
    const row=prior.items.find(i=>i.id===entry.id);
    if(Object.hasOwn(receipt.draft.row,'tags'))row.tags=receipt.draft.row.tags;
    else delete row.tags;
  }
  return verifyOriginalPublished(candidateWorld,prior);
}
const world = await loadWorld(), files = await readFiles(), seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));
// The old preview owns the pre-S4 office edition; current charters are verified first.
const priorWorld=(await priorEditions(world)).world;
const make = () => { const engine = new WorldEngine(structuredClone(world)); return {engine, document: engine.createCharacter(seed, {}, 'fix3-world')}; };
const entry = id => contentEntries(files).find(e => e.id === id);

test('fix3-world 条目：每一行都有 L1/L2/L4 回执且与正式文件逐字相同', async () => {
  const result = await verifyPublished(world, files);
  assert.equal(result.entries, contentEntries(files).length);
  // 34 条减去面包、烙饼、鱼汤、炖菜四条已不再手写的营养条目
  assert.equal(result.entries, 30);
});

test('手改已审批的行会使回执失效：职位职权、目录价、营养值、拘禁室、人物归属', async () => {
  const office = structuredClone(files);
  office.factions.find(f => f.id === 'faction_bs_government').offices.find(o => o.id === 'office_bs_fine_collector').authority.operations = ['collect_fine', 'handle_case'];
  await assert.rejects(() => verifyPublished(world, office), /正式文件与已审批的行不同/);
  // The historical projection must never hide an unapproved S4 appointment rule.
  const charter = structuredClone(files);
  charter.factions.find(f => f.id === 'faction_bs_government').offices.find(o => o.id === 'office_bs_fine_collector').appointment.minimumStanding = -100;
  await assert.rejects(() => verifyPublished(world, charter), /正式文件与已审批的行不同/);
  const price = structuredClone(files);
  price.items.find(i => i.id === 'item_hoe').basePrice = 30;
  await assert.rejects(() => verifyPublished(world, price), /发布骨架或引用事实已改变|正式文件/);
  const food = structuredClone(files);
  food.items.find(i => i.id === 'item_ration').nutrition.satiety = 60;
  await assert.rejects(() => verifyPublished(world, food), /发布骨架或引用事实已改变|正式文件/);
  // The historical projection must never conceal an unapproved new tag.
  const tags=structuredClone(files);
  tags.items.find(i=>i.id==='item_hoe').tags.push('unapproved_use');
  await assert.rejects(()=>verifyPublished(world,tags),/发布骨架或引用事实已改变|正式目录/);
  // S5-05 后续审批替换鱼饵：先验证新回执，历史投影仍不得遮住未审的鱼饵改动。
  const bait=structuredClone(files);
  bait.rules.extraction.fishing.bait.quantity=2;
  await assert.rejects(()=>verifyPublished(world,bait),/正式文件与已审批的行不同/);
  const room = structuredClone(files);
  room.locations.find(l => l.id === 'bld_bs_watch').rooms.pop();
  await assert.rejects(() => verifyPublished(world, room), /正式文件与已审批的行不同/);
  const person = structuredClone(files);
  person.baseline.find(n => n.id === 'npc_bs_034_1').faction = 'faction_hw_affairs';
  await assert.rejects(() => verifyPublished(world, person), /正式文件与已审批的行不同/);
});

test('L1：持有人的作息必须覆盖接待时段，席位与持有人同一聚落，营养值须落在 body 表范围', () => {
  const candidate = previewWorld(priorWorld);
  assert.deepEqual(checkEntry(candidate, entry('office_bs_report_desk')).errors, []);
  const away = structuredClone(entry('office_bs_report_desk'));
  away.row.receptionHours = [[480, 1200]];
  assert.match(checkEntry(candidate, away).errors.join(';'), /不全在席位|超出席位营业时间/);
  const far = structuredClone(entry('office_bs_appeal_desk'));
  far.row.seat = 'loc_hw_gate';
  assert.match(checkEntry(candidate, far).errors.join(';'), /不在同一聚落/);
  const bad = structuredClone(entry('nutrition_item_water'));
  bad.row.nutrition.hydration = 40;
  assert.match(checkEntry(candidate, bad).errors.join(';'), /hydration/);
  const gone = structuredClone(entry('office_bs_claim_desk'));
  gone.row.holder = 'npc_nobody';
  assert.match(checkEntry(candidate, gone).errors.join(';'), /持有人不存在/);
});

test('白石镇：受理报案、罚款代收、拘禁看守、案件经办、拘捕执行、受理上诉、受理索赔各有现任，职权互不兼', () => {
  const offices = Object.fromEntries(world.factions.find(f => f.id === 'faction_bs_government').offices.map(o => [o.authority.operations.join('+'), o]));
  for (const op of ['receive_report', 'collect_fine', 'keep_custody', 'handle_case', 'execute_arrest', 'receive_appeal', 'receive_claim'])
    assert.ok(offices[op], `缺 ${op}`);
  // 五个值房职位分属五个不同的现任；受理上诉与索赔同在公署前厅。
  const watch = ['receive_report', 'collect_fine', 'keep_custody', 'handle_case', 'execute_arrest'].map(op => offices[op]);
  assert.equal(new Set(watch.map(o => o.holder)).size, 5);
  assert.ok(watch.every(o => o.seat === 'bld_bs_watch'));
  assert.equal(offices.receive_appeal.seat, 'bld_bs_office');
  assert.equal(offices.receive_claim.seat, 'bld_bs_office');
  for (const o of Object.values(offices)) {
    const holder = world.npcs.find(n => n.id === o.holder);
    assert.ok(holder && holder.age >= 18, `${o.id} 的现任必须是成年已落实人物`);
    assert.ok(o.authority.limits?.length, `${o.id} 必须写明职权界限`);
  }
  assert.ok(world.locations.find(l => l.id === 'bld_bs_watch').rooms.some(r => r.id === 'room_bs_watch_lockup'));
});

test('镇长是白石镇公署的首领，合法现任经聚落治理选择器取得；其余官职不替镇长', () => {
  const {engine, document} = make();
  const gov = settlementGovernment(engine, document.state, 'loc_bs');
  assert.equal(gov.head.value, 'npc_bs_townhead');
  assert.deepEqual(gov.enforcers.value, ['npc_bs_034_2']);
  const org = world.factions.find(f => f.id === 'faction_bs_government');
  assert.equal(org.leader, 'npc_bs_townhead');
  const head = org.offices.find(o => o.id === 'office_bs_town_head');
  assert.equal(head.holder, org.leader);
  assert.ok(!org.offices.some(o => o.id !== head.id && o.authority.operations.some(p => ['tax', 'steward', 'public_project'].includes(p))));
});

test('新职位在持有协议里是真实的 holds_office，持有人对账一致', () => {
  const {engine, document} = make();
  const d = engine.primitiveDraft(document); ensureHoldings(d, engine);
  for (const {row} of G.newOffices) assert.equal(aliveHoldings(d, {kind: 'holds_office', holder: row.holder, subject: row.id}).length, 1, row.id);
  const reconciliation = reconcileHoldings(engine, d.document);
  assert.ok(reconciled(reconciliation), JSON.stringify(reconciliation));
});

test('候选叠加世界在发布前后一致：正式世界已含候选，叠加不改变任何行', () => {
  const candidate = previewWorld(priorWorld);
  assert.deepEqual(candidate.factions.map(f => f.id), world.factions.map(f => f.id));
  assert.deepEqual(candidate.npcs.length, world.npcs.length);
});
