import fs from 'node:fs/promises';
import{tmpRoot}from'./tmp-root.mjs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CampaignStorage } from '../server-plugin/storage.mjs';

async function directoryBytes(folder) {
    let bytes = 0;
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const target = path.join(folder, entry.name);
        bytes += entry.isDirectory() ? await directoryBytes(target) : (await fs.stat(target)).size;
    }
    return bytes;
}

export async function benchmarkStorage({ events = 10000 } = {}) {
    const directory = await fs.mkdtemp(path.join(tmpRoot(), 'infinite-fields-perf-'));
    const document = { state: { player: { coins: 1000000 }, npcs: {}, inventory: {}, records: {} }, memories: {} };
    for (let i = 0; i < 800; i++) document.state.npcs[`npc_${i}`] = { name: `居民${i}`, trust: 0, location: '河湾村', notes: '种田、缴税、照顾家人，担心粮食收成。'.repeat(5) };
    for (let i = 0; i < 400; i++) document.state.inventory[`item_${i}`] = { quantity: 1, quality: '木', durability: 100, weight: 0.5 };
    const reducer = (state, input) => ({ patches: [{ op: 'set', path: ['state', 'player', 'coins'], value: state.state.player.coins - input.cost }], result: { cost: input.cost } });
    const store = new CampaignStorage(directory, { reducer });
    try {
        await store.create({ id: 'benchmark', worldVersion: 'perf-1', document });
        const initialBytes = await directoryBytes(path.join(directory, 'benchmark'));
        const growth = [];
        let previousBytes = initialBytes;
        for (let i = 0; i < events; i++) {
            await store.transact('benchmark', { id: `evt${i}`, input: { cost: 1 }, anchor: `a${i}` }, reducer);
            if ((i + 1) % 1000 === 0) {
                await store.read('benchmark'); // let the scheduled snapshot finish before sizing the folder
                const bytes = await directoryBytes(path.join(directory, 'benchmark'));
                growth.push(bytes - previousBytes); previousBytes = bytes;
            }
        }
        const file = path.join(directory, 'benchmark', 'events', '00000000.jsonl');
        const before = await fs.readFile(file);
        // Single samples are dominated by disk/CPU contention when many test processes run at once,
        // so report the median of several. The 10ms limits are unchanged.
        const median = values => [...values].sort((x, y) => x - y)[values.length >> 1];
        const extraAnchors = [];
        const commit = async (id) => {
            const start = performance.now();
            await store.transact('benchmark', { id, input: { cost: 1 }, anchor: id }, reducer);
            extraAnchors.push(id);
            return performance.now() - start;
        };
        const plain = [];
        for (let i = 0; i < 5; i++) plain.push(await commit(i === 0 ? 'last' : `plain${i}`));
        const commitMs = median(plain);
        const firstSegmentUnchanged = before.equals(await fs.readFile(file));
        // Each sample commits the event that triggers the scheduled snapshot.
        const snapshots = [];
        for (let round = 0; round < 5; round++) {
            let n = 0;
            while ((events + extraAnchors.length + 1) % 200 !== 0) await commit(`extra${round}_${n++}`);
            snapshots.push(await commit(`snapshot${round}`));
        }
        const snapshotCommitMs = median(snapshots);
        const anchors = Array.from({ length: events }, (_, i) => `a${i}`).concat(extraAnchors);
        let begin;
        begin = performance.now();
        await store.reconcile('benchmark', anchors);
        const unchangedReconcileMs = performance.now() - begin;
        begin = performance.now();
        const reconciled = await store.reconcile('benchmark', anchors, 'a0');
        const reconcileMs = performance.now() - begin;
        const expectedCoins = document.state.player.coins - events - extraAnchors.length + 1; // the undone first event is refunded
        const restored = await new CampaignStorage(directory, { reducer }).read('benchmark');
        const replayCorrect = reconciled.document.state.player.coins === expectedCoins && restored.document.state.player.coins === expectedCoins;
        const bytes = await directoryBytes(path.join(directory, 'benchmark'));
        const bytesPer1000Events = Math.max(...growth);
        return { scope: '隔离合成战役；含同步落盘、快照提交、撤销首个事件及冷加载', events,
            representativeEntities: { npcs: 800, items: 400 }, commitMs, snapshotCommitMs,
            unchangedReconcileMs, reconcileMs, firstSegmentUnchanged, replayCorrect,
            initialBytes, bytes, bytesPer1000Events, growth,
            pass: commitMs <= 10 && snapshotCommitMs <= 10 && unchangedReconcileMs <= 500 && reconcileMs <= 500 && bytesPer1000Events <= 30e6 && firstSegmentUnchanged && replayCorrect };
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const report = await benchmarkStorage();
    console.log(JSON.stringify(report));
    if (!report.pass) process.exitCode = 1;
}
