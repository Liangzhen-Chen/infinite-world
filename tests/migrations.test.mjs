import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCampaign, commit, addMemory } from './fixtures/legacy/core.js';
import { CampaignStorage, digest } from '../server-plugin/storage.mjs';
import { legacyReplayReducer, migrateLegacyChat, reconstructLegacyInitial, migrateWorldVersion } from '../server-plugin/migrations.mjs';
const seed = JSON.parse(await fs.readFile(new URL('fixtures/legacy/seed.json', import.meta.url), 'utf8'));
test('迁移：保留钱、物品、人物、固定记忆、历史，并可删旧支线', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-fields-migrate-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const campaign = createCampaign(seed);
    addMemory(campaign, { subject: '林穗', key: '承诺', content: '允许借厨房', pinned: true }, null);
    commit(campaign, { transaction_id: 'rent', reason: '住店', player: { coins_delta: -6 }, relationships: [{ name: '林穗', trust_delta: 5 }] }, 'a');
    addMemory(campaign, { subject: '林穗', key: '房钱', content: '按时付过房钱' }, 'a');
    const source = path.join(directory, 'original.jsonl');
    const bytes = [{ chat_metadata: { infinite_fields: campaign } }, { is_user: true, mes: '住店', extra: { fields_anchor: 'a' } }].map(value => JSON.stringify(value)).join('\n');
    await fs.writeFile(source, bytes);
    const store = new CampaignStorage(path.join(directory, 'saves'), { reducer: legacyReplayReducer });
    await migrateLegacyChat({ source, store, oldSeed: seed, id: 'migrated' });
    const view = await store.read('migrated');
    assert.deepEqual(view.document.state, campaign.state); assert.deepEqual(view.document.memories, campaign.memories);
    assert.equal(await fs.readFile(source, 'utf8'), bytes);
    const deleted = await store.reconcile('migrated', []);
    assert.equal(deleted.document.state.player.coins, 180);
    assert.ok(deleted.document.memories['林穗::承诺'].pinned);
    const originalHash = digest(bytes);
    assert.equal(digest(await fs.readFile(source, 'utf8')), originalHash);
});
test('迁移：无法证明种子正确时拒绝，不用当前世界覆盖玩家状态', () => {
    const campaign = createCampaign(seed);
    commit(campaign, { transaction_id: 'spend', reason: '买东西', player: { coins_delta: -6 } }, 'a');
    const changed = structuredClone(seed); changed.state.player.coins = 150;
    assert.throws(() => reconstructLegacyInitial(campaign, changed), /拒绝/);
    assert.equal(campaign.state.player.coins, 174);
});
test('世界迁移：冲突字段保留，备份可回退，重启与导入保留新版本', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-fields-world-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const store = new CampaignStorage(directory, { reducer: legacyReplayReducer });
    await store.create({ id: 'world', worldVersion: 'v1', document: { state: { coins: 174, untouched: 'old' } } });
    const changed = await migrateWorldVersion(store, 'world', 'v2', [
        { path: ['state', 'coins'], oldValue: 180, newValue: 200 },
        { path: ['state', 'untouched'], oldValue: 'old', newValue: 'new' },
    ]);
    assert.equal(changed.conflicts.length, 1);
    const read = await new CampaignStorage(directory, { reducer: legacyReplayReducer }).read('world');
    assert.equal(read.document.state.coins, 174); assert.equal(read.document.state.untouched, 'new'); assert.equal(read.worldVersion, 'v2');
    const restored = await store.import(JSON.parse(await fs.readFile(changed.backup, 'utf8')), 'rollback');
    assert.equal(restored.worldVersion, 'v1'); assert.equal(restored.document.state.untouched, 'old');
});
