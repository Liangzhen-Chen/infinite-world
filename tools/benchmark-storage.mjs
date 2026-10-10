import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CampaignStorage } from '../server-plugin/storage.mjs';
import { MemoryIndex } from '../server-plugin/retrieval.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {loadWorld}from'./load-world.mjs';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'infinite-fields-perf-'));
const document = { state: { player: { coins: 1000000 }, npcs: {}, inventory: {}, records: {} }, memories: {} };
for (let i = 0; i < 800; i++) document.state.npcs[`npc_${i}`] = { name: `居民${i}`, trust: 0, location: '河湾村', notes: '种田、缴税、照顾家人，担心粮食收成。'.repeat(5) };
for (let i = 0; i < 400; i++) document.state.inventory[`item_${i}`] = { quantity: 1, quality: '木', durability: 100, weight: 0.5 };
const reducer = (state, input) => ({ patches: [{ op: 'set', path: ['state', 'player', 'coins'], value: state.state.player.coins - input.cost }], result: { cost: input.cost } });
const store = new CampaignStorage(directory, { reducer });
try {
    await store.create({ id: 'benchmark', worldVersion: 'perf-1', document });
    for (let i = 0; i < 10000; i++) {
        await store.transact('benchmark', { id: `evt${i}`, input: { cost: 1 }, anchor: `a${i}` }, reducer);
        if ((i + 1) % 2000 === 0) console.log(`${i + 1}个事件已保存`);
    }
    const file = path.join(directory, 'benchmark', 'events', '00000000.jsonl');
    const before = await fs.readFile(file);
    let begin = performance.now();
    await store.transact('benchmark', { id: 'evt10000', input: { cost: 1 }, anchor: 'last' }, reducer);
    const commitMs = performance.now() - begin;
    const firstSegmentUnchanged = before.equals(await fs.readFile(file));
    begin = performance.now();
    await store.reconcile('benchmark', Array.from({ length: 10000 }, (_, i) => `a${i}`));
    const reconcileMs = performance.now() - begin;
    const index = new MemoryIndex();
    const chat = Array.from({ length: 5000 }, (_, i) => ({ mes: `第${i}次经过河边，记下路况。`, name: '旅人', is_user: true }));
    index.syncChat(chat);
    const world=await loadWorld(),engine=new WorldEngine(world);
    const source=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
    const sceneDocument=engine.initialFromLegacy({state:source.state,memories:source.memories});
    begin = performance.now(); index.syncChat(chat); engine.scene(sceneDocument,'河边路况',index);
    const retrievalMs = performance.now() - begin;
    let bytes = 0;
    async function size(folder) { for (const name of await fs.readdir(folder)) { const target = path.join(folder, name), stat = await fs.stat(target); if (stat.isDirectory()) await size(target); else bytes += stat.size; } }
    await size(path.join(directory, 'benchmark'));
    const report = { date: '2026-10-10', scope: '存储、增量检索与新版场景提示词组装；尚非模型运行性能', events: 10000,
        representativeEntities: { npcs: 800, items: 400 }, messages: 5000,
        commitMs, saveMs: commitMs, reconcileMs, retrievalMs, firstSegmentUnchanged,
        bytesPer1000Events: bytes / 10, bytes,
        pass: commitMs <= 10 && reconcileMs <= 500 && retrievalMs <= 150 && commitMs <= 200 && bytes / 10 <= 30e6 && firstSegmentUnchanged };
    await fs.writeFile('docs/测试报告/阶段1存储性能.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (!report.pass) process.exitCode = 1;
} finally { await fs.rm(directory, { recursive: true, force: true }); }
