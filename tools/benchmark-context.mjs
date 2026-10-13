import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadWorld } from './load-world.mjs';
import { loadPromptBundle } from './build-card.mjs';
import { WorldEngine } from '../server-plugin/engine.mjs';
import { MemoryIndex } from '../server-plugin/retrieval.mjs';
import { groupHistory, planHistoryWindow } from '../extension/history-window.mjs';
import { assembleMessages } from '../extension/prompt.mjs';
import { toolDefinitions } from '../extension/tools.mjs';

export async function benchmarkContext({ messages = 5000 } = {}) {
    if (!Number.isInteger(messages) || messages < 20 || messages % 2) throw Error('消息数必须是至少20的偶数');
    const world = await loadWorld(), engine = new WorldEngine(world);
    const seed = JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json', import.meta.url), 'utf8'));
    const document = engine.initialFromLegacy({ state: seed.state, memories: seed.memories });
    const bundle = await loadPromptBundle({ world });
    const chat = Array.from({ length: messages }, (_, i) => ({
        is_user: i % 2 === 0, name: i % 2 === 0 ? '旅人' : '主持人',
        mes: i % 2 === 0 ? `第${i / 2}次经过河边，记下路况。` : `河边石路仍有湿痕，旅人把第${(i - 1) / 2}次观察记在本上。`,
        extra: i % 2 === 0 ? { fields_anchor: `turn-${i / 2}` } : {},
    }));
    const originalDocument = JSON.stringify(document);
    // Counts are fixture inputs. Host tokenization and HTTP latency are outside
    // local assembly; these counts never approve a real model request.
    const tokenCounts = chat.map(() => 100), reservedTokens = 12000;
    const index = new MemoryIndex();
    const indexingStart = performance.now(); index.syncChat(chat);
    const initialIndexMs = performance.now() - indexingStart;
    const tokenizations = index.tokenizations, samples = [];
    let payload, retainedMessages, removedTurns, groupingMs, sceneMs, assemblyMs, unchanged = true, scenePresent = true;
    for (let attempt = 0; attempt < 3; attempt++) {
        // Also exercise the normal delta path when a new reply replaces the
        // last message object; the other 4999 messages must not be reindexed.
        if (attempt) chat[messages - 1] = { ...chat.at(-1), mes: `${chat.at(-1).mes}新添一条路况。` };
        const original = JSON.stringify(chat);
        const begin = performance.now();
        index.syncChat(chat);
        const groups = await groupHistory(chat, { tokenCounts });
        const coverage = { anchors: Object.fromEntries(groups.map(group => [group.anchor, { processed: true, indexed: true, complete: true, fingerprint: group.fingerprint }])) };
        const planned = planHistoryWindow(groups, { coverage, contextTokens: reservedTokens + messages * 80, reservedTokens });
        const grouped = performance.now();
        const scene = engine.scene(document, '河边路况', index);
        const sceneDone = performance.now();
        payload = JSON.stringify({ messages: assembleMessages(bundle, planned.messages.map(message => ({ role: message.is_user ? 'user' : 'assistant', content: message.mes })), scene), tools: toolDefinitions() });
        const done = performance.now();
        samples.push(done - begin); groupingMs = grouped - begin; sceneMs = sceneDone - grouped; assemblyMs = done - sceneDone;
        retainedMessages = planned.messages.length; removedTurns = planned.removed.length;
        unchanged &&= original === JSON.stringify(chat);
        scenePresent &&= typeof scene === 'string' && scene.includes('【时间】') && JSON.parse(payload).messages.at(-1).content === scene;
    }
    const assemblyTotalMs = Math.max(...samples);
    unchanged &&= originalDocument === JSON.stringify(document);
    const incrementalIndex = index.tokenizations === tokenizations + 2;
    return { scope: '正式提示与场景消费者、合成聊天；包含完整历史摘要、覆盖裁剪、检索、消息组装和工具序列化；不含宿主分词、网络及模型',
        messages, initialIndexMs, samples, assemblyTotalMs, groupingMs, sceneMs, assemblyMs,
        retainedMessages, removedTurns, requestBytes: Buffer.byteLength(payload), staticEstimatedTokens: bundle.budget.estimatedTokens,
        unchanged, incrementalIndex, scenePresent, pass: assemblyTotalMs <= 150 && unchanged && incrementalIndex && scenePresent && removedTurns === Math.ceil(messages * .15) && retainedMessages === messages - removedTurns * 2 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--messages')) throw Error('用法：benchmark-context.mjs [--messages 5000]');
    const report = await benchmarkContext({ messages: args.length ? Number(args[1]) : 5000 });
    console.log(JSON.stringify(report));
    if (!report.pass) process.exitCode = 1;
}
