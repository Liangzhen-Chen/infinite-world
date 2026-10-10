import fs from 'node:fs/promises';
import path from 'node:path';
import { createCampaign, restoreToAnchors, commit, addMemory, roll } from './legacy/core.js';
import { digest, atomicJSON } from './storage.mjs';

export function legacyDocument(campaign) {
    if (campaign?.version !== 1 || !campaign.state?.player || !Array.isArray(campaign.journal)) throw new Error('旧存档格式不完整');
    return { schemaVersion: 1, state: structuredClone(campaign.state), memories: structuredClone(campaign.memories), manualPins: structuredClone(campaign.manualPins ?? {}), legacySequence: campaign.sequence };
}
export function reconstructLegacyInitial(campaign, oldSeed) {
    if (!campaign.journal.length) return { initial: legacyDocument(campaign), method: '无事件存档直接保留当前状态' };
    const candidate = campaign.initialSnapshot ?? { state: oldSeed.state, memories: oldSeed.memories };
    const valid = new Set(campaign.journal.map(event => event.anchor).filter(Boolean));
    const replayed = restoreToAnchors(candidate, campaign.journal, valid);
    for (const [key, pinned] of Object.entries(campaign.manualPins ?? {})) if (replayed.memories[key]) replayed.memories[key].pinned = pinned;
    if (digest(replayed.state) !== digest(campaign.state) || digest(replayed.memories) !== digest(campaign.memories)) {
        throw new Error('旧存档的原始种子无法核实，拒绝猜测并改写历史。需要恢复创建时备份。');
    }
    return { initial: { schemaVersion: 1, state: structuredClone(candidate.state), memories: structuredClone(candidate.memories), manualPins: structuredClone(campaign.manualPins ?? {}), legacySequence: 0 },
        method: campaign.initialSnapshot ? '存档自己的初始快照' : '冻结原版种子重放与旧档逐项相等' };
}
export function legacyReplayReducer(document, input) {
    if (input.type === 'world_migration') return { patches: input.patches, result: { conflicts: input.conflicts } };
    const campaign = createCampaign({ state: document.state, memories: document.memories });
    campaign.sequence = document.legacySequence ?? 0;
    const event = input.event;
    if (event.type === 'commit') commit(campaign, event.action);
    else if (event.type === 'memory') addMemory(campaign, event.entry);
    else if (event.type === 'roll') roll(campaign, event.result, () => (event.result.die - 0.5) / 20);
    else throw new Error('未知旧事件，停止迁移');
    for (const [key, pinned] of Object.entries(document.manualPins ?? {})) if (campaign.memories[key]) campaign.memories[key].pinned = pinned;
    return { patches: [{ op: 'set', path: ['state'], value: campaign.state }, { op: 'set', path: ['memories'], value: campaign.memories },
        { op: 'set', path: ['legacySequence'], value: campaign.sequence }],
        result: { historical: true, type: input.event.type } };
}

export async function migrateLegacyChat({ source, store, oldSeed, id, worldVersion = 'legacy-frozen-1' }) {
    const bytes = await fs.readFile(source);
    const lines = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const old = lines[0]?.chat_metadata?.infinite_fields;
    const { initial, method } = reconstructLegacyInitial(old, oldSeed);
    await store.create({ id, worldVersion, document: initial, provenance: { sourceHash: digest(bytes.toString('utf8')), method } });
    // Store an exact, read-only source copy before creating any migrated chat.
    await fs.writeFile(path.join(store.directory(id), 'legacy-original.jsonl'), bytes, { flag: 'wx' });
    for (const [i, event] of old.journal.entries()) {
        await store.transact(id, { id: `legacy_${i + 1}`, input: { event }, anchor: event.anchor }, legacyReplayReducer);
    }
    const view = await store.read(id);
    if (digest(view.document.state) !== digest(old.state) || digest(view.document.memories) !== digest(old.memories)) throw new Error('迁移后玩家、关系、物品或记忆不一致，拒绝替换聊天');
    const migrated = structuredClone(lines);
    migrated[0].chat_metadata.infinite_fields = view.reference;
    const target = path.join(store.directory(id), 'migrated-chat.jsonl');
    await fs.writeFile(target, migrated.map(line => JSON.stringify(line)).join('\n') + '\n');
    if (digest(await fs.readFile(source, 'utf8')) !== digest(bytes.toString('utf8'))) throw new Error('迁移期间来源发生变化，拒绝覆盖');
    return { campaignId: id, sourceUnchanged: true, stateEqual: true, memoriesEqual: true, historyEqual: true, method, target, reference: view.reference };
}

export async function migrateWorldVersion(store, id, newWorldVersion, proposedUpdates) {
    const exported = await store.export(id);
    const backup = path.join(store.directory(id), `before-world-migration-${Date.now()}.json`);
    await atomicJSON(backup, exported);
    const view = await store.read(id), conflicts = [], patches = [];
    for (const update of proposedUpdates) {
        const current = update.path.reduce((object, key) => object?.[key], view.document);
        if (digest(current ?? null) !== digest(update.oldValue ?? null)) conflicts.push({ path: update.path, kept: current, proposed: update.newValue });
        else patches.push({ op: 'set', path: update.path, value: update.newValue });
    }
    patches.push({ op: 'set', path: ['worldVersion'], value: newWorldVersion });
    const input = { type: 'world_migration', from: view.worldVersion, to: newWorldVersion, patches, conflicts };
    await store.transact(id, { id: `migration_${newWorldVersion}`, input }, () => ({ patches, result: { conflicts, backup } }));
    return { conflicts, backup };
}
