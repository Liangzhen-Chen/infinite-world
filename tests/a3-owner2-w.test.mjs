import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage} from '../server-plugin/storage.mjs';
import {aliveHoldings} from '../server-plugin/holdings.mjs';
import {consent, applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {authority, currentControllers, grantLimitedPermit, limitedPermit, resolveAuthoritySelector} from '../server-plugin/action-authority.mjs';
import {recordHistoricalEvent} from '../server-plugin/world-events.mjs';
import {itemResource} from '../server-plugin/stock.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {people, contentEntries, pending} from '../world/design/a3-owner2-w.mjs';
import {checkFoundation, previewWorld, validateDraft, draftFor} from '../world/design/a3-owner2-w-content.mjs';

const originalWorld = await loadWorld();
const entries = contentEntries(originalWorld);
// 未发布时明确测试候选世界；不会把候选写进正式目录或篡改评分语料。
const world = previewWorld(originalWorld, entries), engine = new WorldEngine(world);
const seed = JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json', 'utf8'));
const corpus = JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json', 'utf8'));
const initial = () => engine.initialFromLegacy(seed, 'a3-owner2-w');
const child = 'npc_a3_herb_apprentice', father = 'npc_a3_apprentice_father', uncle = 'npc_a3_apprentice_uncle';
const context = document => ({engine, document});

function familySetup() {
  return {location: 'bld_hw_herbs', minute: 600,
    instances: people.map(row => ({id: row.id, name: row.name, age: row.age,
      kind: 'person', template: 'agent', location: row.location})),
    holdings: [{id: 'w-guardian', kind: 'guardian_of', holder: father, subject: child, terms: {}}]};
}

test('W: 世界 L1、原人物不变；候选不携带历史财产或已同意的结论', async () => {
  assert.deepEqual((await checkFoundation(originalWorld, entries)).existingWorldErrors, []);
  for (const row of originalWorld.npcs) assert.deepEqual(world.npcs.find(n => n.id === row.id), row);
  assert.equal(world.npcs.find(n => n.id === 'npc_hw_ayan').age, 19);
  assert.equal(world.npcs.find(n => n.id === 'npc_hw_ayan').occupation, '修理学徒');
  for (const row of people) {
    assert.deepEqual(row.inventory, {});
    assert.deepEqual(row.services, []);
    assert.equal(row.birth, undefined);
  }
  for (const row of pending.filter(p => p.person)) assert.ok(!world.npcs.some(p => p.id === row.person.id));
  assert.equal(world.factions.filter(f => f.id === 'faction_forestcouncil').length, 1);
});

test('W1/W2: 原生 setup 物化真实人物；未成年恋爱被拒、叔叔没有监护代同意权', () => {
  const loaded = applyIntentSetup(engine, initial(), familySetup());
  assert.deepEqual(loaded.setupUnmet, []);
  for (const row of people) assert.equal(loaded.document.state.created[row.id].age, row.age);
  const c = context(loaded.document);
  assert.equal(consent(c, child, 'player', 'romance').allowed, false);
  assert.equal(consent(c, 'npc_a3_repair_apprentice', 'player', 'intimacy').allowed, false);
  assert.equal(authority(c, father, 'consent', child, {consentScope: 'mind'}).allowed, true);
  assert.equal(authority(c, uncle, 'consent', child, {consentScope: 'mind'}).allowed, false);
  assert.equal(aliveHoldings(engine.primitiveDraft(loaded.document), {kind: 'guardian_of', holder: uncle, subject: child}).length, 0);
  assert.throws(() => applyConsentEvent(engine.primitiveDraft(loaded.document), c, {
    actor: uncle, to: 'player', eventId: 'w-forged-proxy', verb: 'consent_given',
    payload: {from: child, scope: 'mind', purpose: ['test'], until: 720},
  }), {code: 'E-CONSENT'});
  assert.throws(() => applyConsentEvent(engine.primitiveDraft(loaded.document), c, {
    actor: child, to: 'player', eventId: 'w-minor-intimacy', verb: 'consent_given',
    payload: {scope: 'intimacy', until: 720},
  }), {code: 'E-CONSENT'});
});

test('W: 假年龄/假职业不能借人物实例输入覆盖已定身份，非法定稿不获 L1', () => {
  const entry = entries.find(e => e.id === child), forged = draftFor(entry);
  forged.row.age = 19;
  assert.ok(validateDraft(forged, entry).errors.length > 0);
  const setup = familySetup();
  setup.instances[1].age = 19;
  setup.instances[1].name = '冒充成年药师';
  const loaded = applyIntentSetup(engine, initial(), setup);
  assert.ok(loaded.setupUnmet.some(row => row.item === 'instances[1]'));
  assert.equal(loaded.document.state.created?.[child], undefined);
  assert.equal(engine.byId.get(child).age, 15);
});

test('W5: 引擎解析独立麦种/蚯蚓/竹竿/药锄，不改旧谷粒饵与净麦粒', () => {
  for (const [name, id] of [['麦种', 'item_wheat_seed'], ['蚯蚓饵', 'item_earthworm_bait'],
    ['竹竿', 'item_bamboo_fishing_rod'], ['药锄', 'item_herb_hoe']]) {
    assert.equal(engine.resolve(name, 'item'), id);
    // stock.mjs 的 itemResource 原生键就是 item_<id>，不是 item:<id>。
    // 保留“目录物能成为真实库存资源”的断言，不另造资源命名规则。
    assert.equal(itemResource(engine, id), id);
  }
  for (const id of ['item_fishing_bait', 'item_wheat_grain', 'item_hoe'])
    assert.deepEqual(world.items.find(row => row.id === id), originalWorld.items.find(row => row.id === id));
  assert.equal(world.items.find(row => row.id === 'item_earthworm_bait').unit, '条');
  assert.equal(world.items.find(row => row.id === 'item_wheat_seed').unit, '斤');
});

function grant(document, {actor = 'npc_hw_chenbai', id = 'w-mill-display', subject = 'bld_hw_mill'} = {}) {
  const d = engine.primitiveDraft(document), c = context(d.document);
  recordHistoricalEvent(d, engine, {id, verb: 'permission_granted', actor, minute: 600,
    source: {kind: 'corpus_premise', row: 'A3V2-230'}, payload: {subject, to: 'player', scope: 'display_or_perform'}});
  grantLimitedPermit(d, c, {id, actor, holder: 'player', subject, scope: 'display_or_perform',
    fromMinute: 600, toMinute: 720, sourceEvent: `world_event:${id}`});
  return {patches: d.patches, result: {id}};
}

test('W6: 旧磨坊共同体产权由现有代表签有限许可；阿砚及集会处旁观者不能越权', () => {
  const document = applyIntentSetup(engine, initial(), {location: 'bld_hw_mill', minute: 600}).document;
  assert.deepEqual(currentControllers(context(document), 'bld_hw_mill'), ['npc_hw_chenbai']);
  assert.equal(resolveAuthoritySelector(context(document), {role: 'authorized_manager', of: 'bld_hw_mill'}), 'npc_hw_chenbai');
  assert.throws(() => grant(document, {actor: 'npc_hw_ayan', id: 'w-ayan-forgery'}), {code: 'E-PERMIT-AUTHORITY'});
  assert.throws(() => grant(document, {actor: 'npc_hw_wushuo', subject: 'loc_hw', id: 'w-wushuo-forgery'}), {code: 'E-PERMIT-AUTHORITY'});
  assert.throws(() => resolveAuthoritySelector(context(document), {role: 'authorized_manager', of: 'missing'}), {code: 'E-AUTHORITY-SELECTOR'});
});

test('W6: 原始 230 setup 以真实管理者导入展示许可，不改原题或 expected', () => {
  const row = corpus.find(row => row.id === 'A3V2-230');
  const loaded = applyIntentSetup(engine, initial(), row.setup);
  assert.deepEqual(loaded.setupUnmet, []);
  assert.equal(limitedPermit(context(loaded.document), 'player', 'bld_hw_mill', 'display_or_perform').id, 'a3v2_230_display');
  assert.equal(limitedPermit(context(loaded.document), 'player', 'bld_hw_mill', 'destroy'), null);
});

test('W: 人物/监护与真实许可事件经存档、重放、导入保留，权限不扩大', async t => {
  const directory = await fs.mkdtemp(path.join(tmpRoot(), 'a3-owner2-w-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const loaded = applyIntentSetup(engine, initial(), familySetup());
  assert.deepEqual(loaded.setupUnmet, []);
  const store = new CampaignStorage(directory);
  await store.create({id: 'w', worldVersion: world.version, document: loaded.document});
  const reducer = document => grant(document);
  await store.transact('w', {id: 'grant', input: {}}, reducer);
  const fresh = new CampaignStorage(directory, {reducer});
  const replayed = (await fresh.read('w')).document;
  const imported = (await fresh.import(await fresh.export('w'), 'w-copy')).document;
  for (const document of [replayed, imported]) {
    assert.equal(document.state.created[child].age, 15);
    const d = engine.primitiveDraft(document);
    assert.equal(aliveHoldings(d, {kind: 'guardian_of', holder: father, subject: child}).length, 1);
    assert.equal(aliveHoldings(d, {kind: 'guardian_of', holder: uncle, subject: child}).length, 0);
    assert.equal(limitedPermit(context(document), 'player', 'bld_hw_mill', 'display_or_perform').id, 'w-mill-display');
    assert.equal(limitedPermit(context(document), 'player', 'bld_hw_mill', 'destroy'), null);
    assert.equal(limitedPermit(context(document), 'player', 'loc_hw', 'display_or_perform'), null);
    assert.equal(consent(context(document), child, 'player', 'romance').allowed, false);
  }
});
