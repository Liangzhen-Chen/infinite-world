// S2-0c1 单测：终止协议第 3、4 步（卷二 §2.6 :556–:558）——账户按资源行 onTerminate 分流到残骸、持有者侧边按种类行「终止」格处置、两域自核、次序、复演。
// 写码方自补，不作验收依据。前提一律经真实提案产生（选来历开局、create 带来历模板的个体、destroy 提案），不直调内部写函数；
// 期望值在测试里从 destroy 前的状态与世界数据取（资源行 onTerminate、种类行 gone），不抄仓库基线计数。世界数据经测试副本改动，不改 world/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners } from '../../server-plugin/rules/load/registry-shards.mjs';
import { holdingsOf, holdersOf } from '../../server-plugin/rules/social/holdings.mjs';
import { controlledEntities } from '../../server-plugin/rules/social/control.mjs';
import { accountsOf, allHolders } from '../../server-plugin/rules/economy/ledger.mjs';
import { conservationCheck } from '../../server-plugin/rules/economy/ledger-check.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const KINDS = json('ontology/dimensions/_vocab.json').families.holding_kind.entries;
const SOCIAL = json('rules/tables/social.json').rows;
const EVENTS = SOCIAL.find((r) => r.key === 'events').value;
const OUTFIT = SOCIAL.find((r) => r.key === 'outfit').value;
const REASON = json('rules/tables/economy/ledger.json').rows.find((r) => r.key === 'terminateReason').value;
const UNBUILT = json('rules/tables/terminate.json').rows.find((r) => r.key === 'unbuilt').value;

function owners() {
  const dir = new URL('ontology/state-owners.d/', W);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `world/ontology/state-owners.d/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return mergeOwners({ file: 'world/ontology/state-owners.json', doc: json('ontology/state-owners.json') }, shards).doc;
}
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: clone(owners()),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (tag) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot(tag), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const persons = (g) => Object.keys(g.state.created).filter((id) => g.state.created[id].kind === 'person');
const resourceRows = (raw) => raw.tableDocs.economyResources.rows;

/** 选来历开局得化身，再用它的来历模板经 create 提案建一个 NPC（来历给钱与起始物、开穿戴边）。返回 NPC id。 */
function spawnNpc(g) {
  const r = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge: 0 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  const a = controlledEntities(g.engine, g.state)[0];
  const c = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: g.state.created[a].template, facts: { species: g.state.created[a].props.species } }] });
  assert.equal(c.ok, true, JSON.stringify(c));
  return persons(g).find((p) => p !== a);
}
/** 各资源种类的世界总量（全部账户余额之和）。 */
function totals(g) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const { book } of allHolders(g.engine, g.state)) {
    for (const byRes of Object.values(book)) for (const [res, byKey] of Object.entries(byRes)) for (const v of Object.values(byKey)) out[res] = (out[res] || 0) + v;
  }
  return out;
}
const snapshot = (g) => clone({ accounts: g.state.accounts, holdings: g.state.holdings, created: g.state.created, terminated: g.state.terminated, ledgerTotals: g.state.ledgerTotals });
const destroy = (g, id) => g.submitProposal({ effects: [{ op: 'destroy', entity: id }] });

test('1 守恒与零残留：带来历 NPC 被 destroy，非零余额整笔转进残骸同用途同资源同键账户，各资源世界总量不变；穿戴边按 gone 格关闭，物→物边不动；死者不再是任何边的两端', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2-0c1-settle-') });
  const b = spawnNpc(g);
  const before = accountsOf(g.engine, g.state, b).filter((x) => x.balance !== 0);
  assert.ok(before.length > 0, 'origin gives the NPC money or goods');
  const sumBefore = totals(g);
  const owned = holdingsOf(g.engine, g.state, b);
  assert.ok(owned.length > 0, 'origin opens edges held by the NPC');
  const itemSide = Object.values(g.state.holdings).flatMap((book) => Object.keys(book)).filter((id) => !owned.some((e) => e.id === id) && !holdersOf(g.engine, g.state, b).some((e) => e.id === id));
  const d = destroy(g, b);
  assert.equal(d.ok, true, JSON.stringify(d));
  const wreck = g.state.terminated[b] && Object.keys(g.state.created).find((id) => g.state.created[id].kind === 'item' && g.state.created[id].props.ofPerson === b);
  assert.ok(wreck, 'the wreck is the corpse item');
  // 余额：死者全零；残骸名下同用途、同资源、同键账户等于死前余额（现数据 onTerminate 全为 successor，后继即残骸）。
  assert.deepEqual(accountsOf(g.engine, g.state, b).filter((x) => x.balance !== 0), []);
  const after = accountsOf(g.engine, g.state, wreck);
  for (const x of before) {
    assert.equal(after.find((y) => y.purpose === x.purpose && y.resource === x.resource && y.key === x.key).balance, x.balance, x.account);
  }
  assert.deepEqual(totals(g), sumBefore);
  assert.deepEqual(conservationCheck(g.engine, g.state), []);
  // 边：死者持有的边各按种类行 gone 格处置（来历只开 ho_close 的种类），每条恰一条 ended 事件；与死者无关的边原样在。
  for (const e of owned) assert.equal(KINDS[e.kind].gone, 'ho_close', e.kind);
  assert.deepEqual(holdingsOf(g.engine, g.state, b), []);
  assert.deepEqual(holdersOf(g.engine, g.state, b), []);
  const ended = g.logBook.entries.filter((x) => x.seq === d.seq && x.verb === EVENTS.verb && x.payload.change === EVENTS.change.ended).map((x) => x.payload.edge).sort();
  assert.deepEqual(ended, owned.map((e) => e.id).sort());
  const still = Object.values(g.state.holdings).flatMap((book) => Object.keys(book));
  for (const id of itemSide) assert.ok(still.includes(id), `${id} untouched`);
  // 分流只记一笔账本事件，事由为 rules.economyLedger.terminateReason。
  assert.notEqual(REASON, 'verb_entity_terminated');
  assert.equal(g.logBook.entries.filter((x) => x.seq === d.seq && x.verb === REASON && Array.isArray(Object(x.payload).legs)).length, 1);
});

test('2 次序：同一事务内尸体维度（settleBody）先于账户分流，分流先于持有边关闭，终止事件最后', async () => {
  const g = await init(express.Router(), { saveRoot: testTempRoot('s2-0c1-order-') });
  const b = spawnNpc(g);
  const d = destroy(g, b);
  assert.equal(d.ok, true, JSON.stringify(d));
  const evs = g.logBook.entries.filter((x) => x.seq === d.seq);
  const ledgerAt = evs.findIndex((x) => x.verb === REASON);
  const edgeAt = evs.findIndex((x) => x.verb === EVENTS.verb);
  // 终止事件动词名照卷二 :557（内核登记的 verb 族条目）。
  const termAt = evs.findIndex((x) => x.verb === 'verb_entity_terminated' && Object(x.payload).id === b);
  assert.ok(ledgerAt >= 0 && edgeAt > ledgerAt && termAt > edgeAt, JSON.stringify([ledgerAt, edgeAt, termAt]));
  // 残骸作账本持有人时尸体维度已在（settleBody 在前）。
  const wreck = Object.keys(g.state.accounts).find((h) => g.state.created[h] && g.state.created[h].kind === 'item');
  assert.equal(g.state.created[wreck].props.ofPerson, b);
});

test('3 账户分流按数据：资源行 onTerminate 改 sink（rules.terminate.unbuilt）即整笔拒 E-ACT-WRITER-NOT-READY、状态不变；remains 且 salvageFraction 1 留在残骸，比例不足 1 同拒', async () => {
  const probe = mountKernel(rawWorld(), caps('s2-0c1-probe-'));
  const held = accountsOf(probe.engine, probe.state, spawnNpc(probe)).filter((x) => x.balance !== 0).map((x) => x.resource);
  const res = held[0];
  // sink
  const raw = rawWorld();
  const row = (r) => resourceRows(r).find((x) => x.key === res).value;
  assert.ok(UNBUILT.onTerminate.includes('sink'));
  row(raw).onTerminate = 'sink';
  let g = mountKernel(raw, caps('s2-0c1-sink-'));
  let b = spawnNpc(g);
  const pre = snapshot(g);
  const d = destroy(g, b);
  assert.equal(d.code, 'E-ACT-WRITER-NOT-READY', JSON.stringify(d));
  assert.deepEqual(snapshot(g), pre);
  // remains，salvageFraction 0：其余入汇，汇未建，同拒
  const raw2 = rawWorld();
  row(raw2).onTerminate = 'remains';
  row(raw2).salvageFraction = 0;
  g = mountKernel(raw2, caps('s2-0c1-remains0-'));
  b = spawnNpc(g);
  assert.equal(destroy(g, b).code, 'E-ACT-WRITER-NOT-READY');
  // remains，salvageFraction 1：全部留在残骸
  const raw3 = rawWorld();
  row(raw3).onTerminate = 'remains';
  row(raw3).salvageFraction = 1;
  g = mountKernel(raw3, caps('s2-0c1-remains1-'));
  b = spawnNpc(g);
  const want = accountsOf(g.engine, g.state, b).filter((x) => x.resource === res && x.balance !== 0);
  const sum = totals(g);
  const r = destroy(g, b);
  assert.equal(r.ok, true, JSON.stringify(r));
  const wreck = Object.keys(g.state.accounts).find((h) => g.state.created[h] && g.state.created[h].kind === 'item' && g.state.created[h].props.ofPerson === b);
  for (const x of want) assert.equal(accountsOf(g.engine, g.state, wreck).find((y) => y.key === x.key && y.purpose === x.purpose).balance, x.balance);
  assert.deepEqual(totals(g), sum);
});

test('4 持有者侧按种类行处置：穿戴种类「终止」格改未建取值即 destroy 整笔拒 E-ACT-WRITER-NOT-READY，边与余额原样', async () => {
  const raw = rawWorld();
  const wear = OUTFIT.placement[0].holdingKind;
  raw.vocabDoc.families.holding_kind.entries[wear].gone = 'ho_revert';
  const g = mountKernel(raw, caps('s2-0c1-unbuilt-'));
  const b = spawnNpc(g);
  assert.ok(holdingsOf(g.engine, g.state, b, wear).length > 0);
  const pre = snapshot(g);
  const d = destroy(g, b);
  assert.equal(d.code, 'E-ACT-WRITER-NOT-READY', JSON.stringify(d));
  assert.deepEqual(snapshot(g), pre);
});

test('5 复演：建 NPC → destroy → 推进 60 分钟后存槽读档，saveDigest 相同，账户、持有、终止标记逐位相同', async () => {
  const dir = testTempRoot('s2-0c1-replay-');
  const g = await init(express.Router(), { saveRoot: dir });
  const b = spawnNpc(g);
  assert.equal(destroy(g, b).ok, true);
  assert.equal(g.advance(60).ok, true);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  for (const k of ['accounts', 'holdings', 'terminated', 'created', 'ledgerTotals']) assert.deepEqual(r.state[k], g.state[k], k);
});
