import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const validId = id => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('无效战役编号');
    return id;
};
export async function atomicJSON(file, value) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
}

// Each path clones only its ancestors. The original document stays untouched
// even if a later patch is rejected; logs and transaction indexes live elsewhere.
export function applyPatches(document, patches) {
    const copies = new WeakMap(), owned = new WeakSet();
    const writable = value => {
        if (!value || typeof value !== 'object') throw new Error('补丁路径无法解析');
        if (owned.has(value)) return value;
        if (!copies.has(value)) {
            const copy = Array.isArray(value) ? [...value] : { ...value };
            copies.set(value, copy); owned.add(copy);
        }
        return copies.get(value);
    };
    const next = writable(document);
    for (const patch of patches) {
        if (!['set', 'delete'].includes(patch.op) || !Array.isArray(patch.path) || !patch.path.length || patch.path.length > 12) throw new Error('补丁格式无效');
        if (patch.path.some(key => typeof key !== 'string' || unsafe.has(key))) throw new Error('补丁含不安全路径');
        let target = next;
        for (const key of patch.path.slice(0, -1)) {
            // Resolve through the current draft, including earlier replacements.
            target[key] = writable(target[key] ?? {}); target = target[key];
        }
        const key = patch.path.at(-1);
        if (patch.op === 'delete') delete target[key];
        else target[key] = structuredClone(patch.value);
    }
    return next;
}

export class CampaignStorage {
    constructor(root, { snapshotEvery = 200, segmentSize = 1000, reducer = null } = {}) {
        this.root = path.resolve(root); this.snapshotEvery = snapshotEvery; this.segmentSize = segmentSize;
        this.cache = new Map(); this.queues = new Map(); this.reducer = reducer;
    }
    directory(id) { return path.join(this.root, validId(id)); }
    async exclusive(id, task) {
        validId(id);
        const previous = this.queues.get(id) ?? Promise.resolve();
        const next = previous.catch(() => {}).then(task);
        this.queues.set(id, next);
        try { return await next; } finally { if (this.queues.get(id) === next) this.queues.delete(id); }
    }
    async create({ id = `campaign_${randomUUID()}`, worldVersion, document, provenance = null }) {
        return this.exclusive(id, async () => {
            const directory = this.directory(id);
            await fs.mkdir(this.root, { recursive: true });
            await fs.mkdir(directory); // A conflicting ID cannot overwrite a campaign.
            await fs.mkdir(path.join(directory, 'snapshots')); await fs.mkdir(path.join(directory, 'events'));
            const initial = structuredClone(document);
            const metadata = { format: 2, id, worldVersion, initialHash: digest(initial), created: new Date().toISOString(), provenance };
            await atomicJSON(path.join(directory, 'initial.json'), initial);
            await atomicJSON(path.join(directory, 'meta.json'), metadata);
            const state = { metadata, document: initial, events: [], active: new Set(), transactions: new Map(), sequence: 0, head: metadata.initialHash, revision: 0 };
            this.cache.set(id, state);
            await this.snapshot(id, state);
            return this.view(state);
        });
    }
    view(state) {
        return { reference: this.reference(state),
            worldVersion: state.document.worldVersion ?? state.metadata.worldVersion, document: structuredClone(state.document) };
    }
    async load(id) {
        if (this.cache.has(id)) return this.cache.get(id);
        const directory = this.directory(id);
        const metadata = JSON.parse(await fs.readFile(path.join(directory, 'meta.json'), 'utf8'));
        if (metadata.format !== 2 || metadata.id !== id) throw new Error('战役格式或编号不一致');
        const initial = JSON.parse(await fs.readFile(path.join(directory, 'initial.json'), 'utf8'));
        if (digest(initial) !== metadata.initialHash) throw new Error('战役初始快照校验失败');
        const events = []; let head = metadata.initialHash;
        const names = (await fs.readdir(path.join(directory, 'events'))).filter(name => /^\d{8}\.jsonl$/.test(name)).sort();
        for (const name of names) {
            const raw = await fs.readFile(path.join(directory, 'events', name), 'utf8');
            if (raw && !raw.endsWith('\n')) throw new Error(`事件日志不完整：${name}，已停止加载，原文件保留`);
            for (const line of raw.split('\n').filter(Boolean)) {
                const event = JSON.parse(line), { hash, ...payload } = event;
                if (event.sequence !== events.length + 1 || event.previous !== head || digest(payload) !== hash) throw new Error(`事件${event.sequence}校验失败`);
                head = hash; events.push(event);
            }
        }
        const active = new Set(), transactions = new Map(); let revision = 0;
        for (const event of events) {
            if (event.kind === 'reconcile') { for (const seq of event.removed) active.delete(seq); revision++; }
            else active.add(event.sequence);
        }
        const document = await this.replay(id, { metadata, events, active, revision }, Infinity);
        for (const event of events) if (active.has(event.sequence)) transactions.set(event.id, { signature: event.signature, sequence: event.sequence });
        const state = { metadata, events, active, transactions, document, head, sequence: events.length, revision };
        this.cache.set(id, state); return state;
    }
    async read(id) { return this.exclusive(id, async () => this.view(await this.load(id))); }
    async feedback(id) {
        return this.exclusive(id, async () => {
            const state = await this.load(id);
            // A surviving action can have a different balance after an earlier action is removed.
            // Recompute its display result from the branch instead of reusing the immutable receipt.
            let projection=state.feedbackProjection;
            if(projection?.sequence===state.sequence)return {reference:this.reference(state),events:structuredClone(projection.events)};
            if(!projection||projection.revision!==state.revision){
                projection={revision:state.revision,sequence:0,events:[],
                    document:JSON.parse(await fs.readFile(path.join(this.directory(id),'initial.json'),'utf8'))};
            }else projection={...projection,events:[...projection.events]};
            for(const event of state.events){
                if(event.sequence<=projection.sequence||!state.active.has(event.sequence))continue;
                const output=this.reducer?await this.reducer(projection.document,event.input,{replay:true,result:event.result}):event;
                projection.document=applyPatches(projection.document,output.patches);
                if(event.anchor&&output.result?.notices?.length)projection.events.push({sequence:event.sequence,anchor:event.anchor,notices:output.result.notices});
            }
            projection.sequence=state.sequence;state.feedbackProjection=projection;
            return {reference:this.reference(state),events:structuredClone(projection.events)};
        });
    }
    async snapshot(id, state) {
        const data = { sequence: state.sequence, revision: state.revision, document: state.document, checksum: digest(state.document), head: state.head, activeSequences: [...state.active] };
        data.envelopeHash = digest(data);
        await atomicJSON(path.join(this.directory(id), 'snapshots', `${String(state.sequence).padStart(10, '0')}-${state.revision}.json`), data);
    }
    async replay(id, state, before) {
        const names = (await fs.readdir(path.join(this.directory(id), 'snapshots'))).filter(name => /^\d{10}-\d+\.json$/.test(name)).sort().reverse();
        let document, after = 0;
        for (const name of names) {
            const [seq, rev] = name.split(/[-.]/).map(Number);
            if (seq >= before || rev > state.revision) continue;
            // A snapshot is usable only if no event included in it has since been removed.
            const data = JSON.parse(await fs.readFile(path.join(this.directory(id), 'snapshots', name), 'utf8'));
            const { envelopeHash, ...envelope } = data;
            if (envelopeHash && digest(envelope) !== envelopeHash) throw new Error('快照元数据校验失败');
            if (data.sequence !== seq || data.revision !== rev || !Array.isArray(data.activeSequences)) throw new Error('快照编号或格式校验失败');
            const atSnapshot = new Set(); let expectedRevision = 0;
            for (const event of state.events) {
                if (event.sequence > seq) break;
                if (event.kind === 'reconcile') { for (const removed of event.removed) atSnapshot.delete(removed); expectedRevision++; }
                else atSnapshot.add(event.sequence);
            }
            if (rev !== expectedRevision || canonical([...atSnapshot]) !== canonical(data.activeSequences)) throw new Error('快照分支校验失败');
            if (data.activeSequences.some(sequence => !state.active.has(sequence))) continue;
            const expectedHead = seq === 0 ? state.metadata.initialHash : state.events[seq - 1]?.hash;
            if (data.checksum !== digest(data.document) || data.head !== expectedHead) throw new Error('快照校验失败');
            document = data.document; after = seq; break;
        }
        document ??= JSON.parse(await fs.readFile(path.join(this.directory(id), 'initial.json'), 'utf8'));
        for (const event of state.events) if (event.sequence > after && state.active.has(event.sequence)) {
            if (before !== Infinity && !this.reducer) throw new Error('缺少事件重放处理器，不能只重放旧的绝对数值补丁');
            const patches = this.reducer ? (await this.reducer(document, event.input, { replay: true, result: event.result })).patches : event.patches;
            document = applyPatches(document, patches);
        }
        return document;
    }
    async append(id, state, payload) {
        const event = { ...payload, sequence: state.sequence + 1, previous: state.head };
        event.hash = digest(event);
        const segment = String(Math.floor(state.sequence / this.segmentSize)).padStart(8, '0');
        const handle = await fs.open(path.join(this.directory(id), 'events', `${segment}.jsonl`), 'a');
        try { await handle.writeFile(`${JSON.stringify(event)}\n`); await handle.sync(); }
        catch(error){this.cache.delete(id);throw error;}
        finally { await handle.close(); }
        state.events.push(event); state.sequence = event.sequence; state.head = event.hash;
        return event;
    }
    async transact(id, request, reducer) {
        return this.exclusive(id, async () => {
            const state = await this.load(id), signature = digest(request.input);
            if (typeof request.id !== 'string' || !request.id.trim() || request.id.length > 120) throw new Error('事件编号无效');
            const old = state.transactions.get(request.id);
            if (old) {
                if (old.signature !== signature) throw new Error('同一事件编号不能用于不同操作');
                const previous = state.events[old.sequence - 1];
                return { ok: true, duplicate: true, result: structuredClone(previous.result), reference: this.reference(state) };
            }
            if (request.expectedSequence !== undefined && request.expectedSequence !== state.sequence) throw new Error('存档已被另一页面更新，请重新读取后操作');
            const { patches, result: receipt } = await reducer(state.document, request.input);
            // Hash and retain the same receipt that JSON can persist and return.
            const result = JSON.parse(JSON.stringify(receipt));
            const document = applyPatches(state.document, patches);
            const event = await this.append(id, state, { kind: 'action', id: request.id, signature, input: request.input,
                anchor: request.anchor ?? null, patches, result });
            state.document = document; state.active.add(event.sequence);
            state.transactions.set(request.id, { signature, sequence: event.sequence });
            if (state.sequence % this.snapshotEvery === 0) await this.snapshot(id, state);
            return { ok: true, result: structuredClone(event.result), reference: this.reference(state) };
        });
    }
    reference(state) {
        // Checksum is the event chain head; hashing the full save on every write
        // would undo the constant-size commit improvement.
        return { format: 2, campaignId: state.metadata.id, sequence: state.sequence, checksum: state.head, head: state.head };
    }
    async reconcile(id, validAnchors, excludeAnchor = null) {
        return this.exclusive(id, async () => {
            const state = await this.load(id), valid = new Set(validAnchors);
            const removed = state.events.filter(event => state.active.has(event.sequence) && event.anchor &&
                (!valid.has(event.anchor) || event.anchor === excludeAnchor)).map(event => event.sequence);
            if (!removed.length) return this.view(state);
            const active = new Set(state.active); for (const seq of removed) active.delete(seq);
            let document;
            try { document = await this.replay(id, { ...state, active, revision: state.revision + 1 }, Math.min(...removed)); }
            catch (error) { throw new Error(`对账失败，禁止继续生成：${error.message}`); }
            await this.append(id, state, { kind: 'reconcile', removed });
            state.active = active; state.document = document; state.revision++;
            for (const [key, value] of state.transactions) if (!active.has(value.sequence)) state.transactions.delete(key);
            await this.snapshot(id, state);
            return this.view(state);
        });
    }
    async export(id) {
        return this.exclusive(id, async () => {
            const state = await this.load(id);
            const initial = JSON.parse(await fs.readFile(path.join(this.directory(id), 'initial.json'), 'utf8'));
            return { format: 'infinite-fields-server-v2', metadata: state.metadata, initial, events: structuredClone(state.events), checksum: state.head, documentHash: digest(state.document) };
        });
    }
    async import(bundle, id = `campaign_${randomUUID()}`) {
        if (bundle.format !== 'infinite-fields-server-v2' || digest(bundle.initial) !== bundle.metadata.initialHash) throw new Error('导入文件校验失败');
        // Validate the complete chain and replay before creating any destination.
        let head = bundle.metadata.initialHash, document = structuredClone(bundle.initial); const active = new Set();
        for (const [i, event] of bundle.events.entries()) {
            const { hash, ...body } = event;
            if (event.sequence !== i + 1 || event.previous !== head || digest(body) !== hash) throw new Error('导入事件校验失败');
            head = hash;
            if (event.kind === 'reconcile') for (const seq of event.removed) active.delete(seq);
            else active.add(event.sequence);
        }
        const branched = bundle.events.some(event => event.kind === 'reconcile');
        if (branched && !this.reducer) throw new Error('导入分支存档需要事件重放处理器');
        for (const event of bundle.events) if (active.has(event.sequence)) {
            const patches = this.reducer ? (await this.reducer(document, event.input, { replay: true, result: event.result })).patches : event.patches;
            document = applyPatches(document, patches);
        }
        if (head !== bundle.checksum || digest(document) !== bundle.documentHash) throw new Error('导入重放结果不一致');
        await this.create({ id, worldVersion: bundle.metadata.worldVersion, document: bundle.initial, provenance: { importedFrom: bundle.metadata.id } });
        const state = this.cache.get(id);
        for (const event of bundle.events) {
            const { sequence, previous, hash, ...payload } = event;
            await this.append(id, state, payload);
        }
        this.cache.delete(id);
        return this.read(id);
    }
}
