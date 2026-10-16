import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export function canonical(value) {
    return canonicalValue(value);
}
function canonicalValue(value, serialized = null) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (serialized?.has(value)) return serialized.get(value);
    if (Array.isArray(value)) return `[${value.map(item => canonicalValue(item, serialized)).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalValue(value[key], serialized)}`).join(',')}}`;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const validId = id => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('无效战役编号');
    return id;
};
// The value JSON persists: what a reload, export or import sees.
export const persistable = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
// R25 legacy saves: before the fix, NPC autonomy wrote task presence snapshots as
// {location, activity: undefined, status} and hashed them with the undefined key,
// which JSON then dropped. Re-adding activity:undefined to presence entries that lack
// it reproduces exactly the hashed form; undefined holds no data, so nothing is lost.
// Only this known shape is restored; any other mismatch still fails verification.
const presenceEntry = path => path.length >= 3 && path.at(-3) === 'presence' && path.at(-2) === 'npcs';
function restoreActivity(value, path, state) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((item, i) => restoreActivity(item, [...path, String(i)], state));
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = restoreActivity(value[key], [...path, key], state);
    if (presenceEntry(path) && path.includes('tasks') && !Object.hasOwn(copy, 'activity')) { copy.activity = undefined; state.changed = true; }
    return copy;
}
export function withLegacyUndefinedActivity(value, path = []) {
    const state = { changed: false }, restored = restoreActivity(value, path, state);
    return state.changed ? restored : null;
}
function legacyEventForm(payload) {
    if (!Array.isArray(payload?.patches)) return null;
    let changed = false;
    const patches = payload.patches.map(patch => {
        if (!patch || patch.op !== 'set' || !Array.isArray(patch.path)) return patch;
        if (!Object.hasOwn(patch, 'value') && patch.path.at(-1) === 'activity' && presenceEntry(patch.path.slice(0, -1)) && patch.path.includes('tasks')) { changed = true; return { ...patch, value: undefined }; }
        const value = withLegacyUndefinedActivity(patch.value, patch.path);
        if (!value) return patch;
        changed = true; return { ...patch, value };
    });
    return changed ? { ...payload, patches } : null;
}
function eventHashMatches(payload, hash) {
    if (digest(payload) === hash) return true;
    const legacy = legacyEventForm(payload);
    return Boolean(legacy) && digest(legacy) === hash;
}
export async function atomicJSON(file, value) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, file);
}

// P2: the same result as structuredClone for plain data (objects, arrays,
// primitives, undefined, -0, NaN and shared references), several times faster
// for the small records written every simulated minute. Anything else
// (class instances, Date, Map, holes, functions) goes to structuredClone.
const UNPLAIN = Symbol('unplain');
function cloneWalk(value, seen) {
    if (value === null) return value;
    const type = typeof value;
    if (type === 'function' || type === 'symbol') return UNPLAIN;
    if (type !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
        if (proto !== Array.prototype) return UNPLAIN;
        const length = value.length;
        if (Object.keys(value).length !== length) return UNPLAIN;
        const copy = new Array(length); seen.set(value, copy);
        for (let i = 0; i < length; i++) {
            if (!Object.hasOwn(value, i)) return UNPLAIN;
            const item = cloneWalk(value[i], seen); if (item === UNPLAIN) return UNPLAIN; copy[i] = item;
        }
        return copy;
    }
    if (proto !== Object.prototype && proto !== null) return UNPLAIN;
    const copy = {}; seen.set(value, copy);
    for (const key of Object.keys(value)) {
        if (key === '__proto__') return UNPLAIN;
        const item = cloneWalk(value[key], seen); if (item === UNPLAIN) return UNPLAIN; copy[key] = item;
    }
    return copy;
}
let cloneSeen = null;
export function cloneData(value) {
    if (value === null || typeof value !== 'object' && typeof value !== 'function' && typeof value !== 'symbol') return value;
    const seen = cloneSeen ?? new Map(); cloneSeen = null;
    try {
        const copy = cloneWalk(value, seen);
        return copy === UNPLAIN ? structuredClone(value) : copy;
    } finally { seen.clear(); cloneSeen = seen; }
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
    const next = writable(document), dead = deadPatchValues(patches);
    let index = -1;
    for (const patch of patches) {
        index++;
        if (!['set', 'delete'].includes(patch.op) || !Array.isArray(patch.path) || !patch.path.length || patch.path.length > 12) throw new Error('补丁格式无效');
        if (patch.path.some(key => typeof key !== 'string' || unsafe.has(key))) throw new Error('补丁含不安全路径');
        let target = next;
        for (const key of patch.path.slice(0, -1)) {
            // Resolve through the current draft, including earlier replacements.
            target[key] = writable(target[key] ?? {}); target = target[key];
        }
        const key = patch.path.at(-1);
        if (patch.op === 'delete') delete target[key];
        else target[key] = dead?.[index] ? patch.value : cloneData(patch.value);
    }
    return next;
}
// P2: a value is dead when a later patch sets or deletes exactly the same path
// and nothing in between writes inside it. Such a value is never read, written
// through or returned, so applyPatches places it without copying; the result
// is unchanged. Long elapsed-time events rewrite the same records each minute.
function deadPatchValues(patches) {
    if (!Array.isArray(patches) || patches.length < 2) return null;
    const root = { children: null }, dead = new Array(patches.length).fill(false);
    const child = (node, key) => {
        if (!node.children) node.children = new Map();
        let next = node.children.get(key);
        if (!next) { next = { children: null, later: false, inside: false }; node.children.set(key, next); }
        return next;
    };
    for (let i = patches.length - 1; i >= 0; i--) {
        const path = patches[i]?.path;
        if (!Array.isArray(path) || !path.length || path.some(key => typeof key !== 'string')) continue;
        let node = root;
        for (let d = 0; d < path.length - 1; d++) { node = child(node, path[d]); node.inside = true; }
        node = child(node, path[path.length - 1]);
        dead[i] = node.later && !node.inside;
        node.later = true; node.inside = false;
    }
    return dead;
}

// P2: one patch at a time over a working document, with the same result as
// applyPatches. Copies made here stay writable across later patches until a
// reference to them escapes (expose), so a long simulation does not recopy
// the document root, state and records on every write. Every reference that
// escaped, and everything below it, is copied before it would change.
export class PatchCursor {
    constructor(document) { this.reset(document); }
    // marks: 1 = this cursor's own copy, writable in place; 2 = own copy whose
    // reference escaped. Anything unmarked is never written in place.
    // chain: the own copies along the last written path. While none of them
    // has escaped since and each still hangs where it did, they are still
    // writable, so consecutive writes below them skip the mark lookups.
    reset(document) { this.root = document; this.marks = new WeakMap(); this.chain = null; }
    // Only this cursor's own copies are ever written in place, so only they need marking.
    expose(value) {
        if (value && typeof value === 'object' && this.marks.get(value) === 1) {
            this.marks.set(value, 2);
            if (this.chain?.nodes.includes(value)) this.chain = null;
        }
        return value;
    }
    take(value) {
        const mark = this.marks.get(value);
        if (mark === 1) return value;
        const copy = Array.isArray(value) ? [...value] : { ...value };
        // An escaped copy's children are now reachable from the escaped original too.
        if (mark === 2) { this.chain = null; for (const key in copy) { const child = copy[key]; if (child && typeof child === 'object' && this.marks.get(child) === 1) this.marks.set(child, 2); } }
        this.marks.set(copy, 1);
        return copy;
    }
    // clone=false only for a value the caller knows a later patch replaces.
    apply(patch, clone = true) {
        const root = this.root, path = patch.path;
        if (!root || typeof root !== 'object') throw new Error('补丁路径无法解析');
        if ((patch.op !== 'set' && patch.op !== 'delete') || !Array.isArray(path) || !path.length || path.length > 12) throw new Error('补丁格式无效');
        if (path.some(key => typeof key !== 'string' || unsafe.has(key))) throw new Error('补丁含不安全路径');
        // Resolve the whole path before writing, so a rejected patch leaves no trace.
        const last = path.length - 1;
        let probe = root;
        for (let i = 0; i < last; i++) {
            const child = probe[path[i]];
            if (child === null || child === undefined) break;
            if (typeof child !== 'object') throw new Error('补丁路径无法解析');
            probe = child;
        }
        const value = patch.op === 'delete' ? undefined : clone ? cloneData(patch.value) : patch.value;
        const chain = this.chain;
        let target, reused = 0;
        if (chain && chain.nodes[0] === root) {
            target = root;
            while (reused < last && reused < chain.keys.length && chain.keys[reused] === path[reused] && target[path[reused]] === chain.nodes[reused + 1]) target = chain.nodes[++reused];
        } else target = this.root = this.take(root);
        const nodes = reused ? chain.nodes.slice(0, reused + 1) : [target];
        for (let i = reused; i < last; i++) {
            const key = path[i], child = target[key];
            let next;
            if (child === null || child === undefined) { next = {}; this.marks.set(next, 1); }
            else next = this.take(child);
            if (next !== child) target[key] = next;
            target = next; nodes.push(next);
        }
        const key = path[last];
        if (patch.op === 'delete') delete target[key];
        else target[key] = value;
        this.chain = { nodes, keys: path.slice(0, last) };
        return this.root;
    }
}

export class CampaignStorage {
    constructor(root, { snapshotEvery = 200, segmentSize = 1000, reducer = null } = {}) {
        this.root = path.resolve(root); this.snapshotEvery = snapshotEvery; this.segmentSize = segmentSize;
        this.cache = new Map(); this.queues = new Map(); this.snapshots = new Map(); this.reducer = reducer;
    }
    directory(id) { return path.join(this.root, validId(id)); }
    async exclusive(id, task) {
        validId(id);
        const previous = this.queues.get(id) ?? Promise.resolve();
        // A scheduled snapshot (see transact) finishes before the next operation on this campaign.
        const next = previous.catch(() => {}).then(() => this.snapshots.get(id)).catch(() => {}).then(task);
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
                if (event.sequence !== events.length + 1 || event.previous !== head || !eventHashMatches(payload, hash)) throw new Error(`事件${event.sequence}校验失败`);
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
    // The receipt a given event id already produced, or null (lets a caller that split one request into several events tell a retry).
    async recorded(id, eventId) {
        return this.exclusive(id, async () => {
            const state = await this.load(id), old = state.transactions.get(eventId);
            return old ? { sequence: old.sequence, result: structuredClone(state.events[old.sequence - 1].result) } : null;
        });
    }
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
    // The snapshot is a replay accelerator: the event that triggered it is already durable.
    // Capture the immutable state now and build/write the file after the commit returns;
    // the next operation on the campaign waits for it (exclusive). A failed write only
    // costs a longer replay, so it does not fail the committed action.
    scheduleSnapshot(id, state) {
        const frozen = { document: state.document, sequence: state.sequence, revision: state.revision, head: state.head, active: new Set(state.active) };
        const job = new Promise(resolve => setImmediate(resolve)).then(() => this.snapshot(id, frozen)).catch(() => {});
        this.snapshots.set(id, job);
        job.then(() => { if (this.snapshots.get(id) === job) this.snapshots.delete(id); });
    }
    async snapshot(id, state) {
        // Reuse serialization only within this snapshot. Both hashes retain
        // their existing canonical format, with no cache across mutations.
        // Hash the form written to disk (R25: a set-to-undefined key does not survive JSON).
        const document = persistable(state.document), documentText = canonical(document);
        const data = { sequence: state.sequence, revision: state.revision, document, checksum: digest(documentText), head: state.head, activeSequences: [...state.active] };
        data.envelopeHash = digest(canonicalValue(data, new Map([[document, documentText]])));
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
            // R25: a snapshot written before the fix hashed task presence with activity:undefined.
            const legacy = envelopeHash && digest(envelope) !== envelopeHash || data.checksum !== digest(data.document) ? withLegacyUndefinedActivity(data.document) : null;
            if (envelopeHash && digest(envelope) !== envelopeHash && !(legacy && digest({ ...envelope, document: legacy }) === envelopeHash)) throw new Error('快照元数据校验失败');
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
            if (data.checksum !== digest(data.document) && !(legacy && data.checksum === digest(legacy)) || data.head !== expectedHead) throw new Error('快照校验失败');
            document = data.document; after = seq; break;
        }
        document ??= JSON.parse(await fs.readFile(path.join(this.directory(id), 'initial.json'), 'utf8'));
        for (const event of state.events) if (event.sequence > after && state.active.has(event.sequence)) {
            if (before !== Infinity && !this.reducer) throw new Error('缺少事件重放处理器，不能只重放旧的绝对数值补丁');
            const patches = this.reducer ? persistable((await this.reducer(document, event.input, { replay: true, result: event.result })).patches) : event.patches;
            document = applyPatches(document, patches);
        }
        return document;
    }
    // R25: the event is hashed in the form JSON persists (undefined keys dropped,
    // undefined array items null), so the disk log, exports and replays verify.
    prepare(state, payload) {
        const event = persistable({ ...payload, sequence: state.sequence + 1, previous: state.head });
        event.hash = digest(event);
        return event;
    }
    async append(id, state, payload) { return this.write(id, state, this.prepare(state, payload)); }
    async write(id, state, event) {
        if (event.sequence !== state.sequence + 1 || event.previous !== state.head) throw new Error('事件链已变化，请重新提交');
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
            // Patches likewise: the live document is built from the persisted form, so a
            // restart or import replays to the same fields.
            const prepared = this.prepare(state, { kind: 'action', id: request.id, signature, input: request.input,
                anchor: request.anchor ?? null, patches, result: receipt });
            const document = applyPatches(state.document, prepared.patches);
            const event = await this.write(id, state, prepared);
            state.document = document; state.active.add(event.sequence);
            state.transactions.set(request.id, { signature, sequence: event.sequence });
            if (state.sequence % this.snapshotEvery === 0) this.scheduleSnapshot(id, state);
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
            if (event.sequence !== i + 1 || event.previous !== head || !eventHashMatches(body, hash)) throw new Error('导入事件校验失败');
            head = hash;
            if (event.kind === 'reconcile') for (const seq of event.removed) active.delete(seq);
            else active.add(event.sequence);
        }
        const branched = bundle.events.some(event => event.kind === 'reconcile');
        if (branched && !this.reducer) throw new Error('导入分支存档需要事件重放处理器');
        for (const event of bundle.events) if (active.has(event.sequence)) {
            const patches = this.reducer ? persistable((await this.reducer(document, event.input, { replay: true, result: event.result })).patches) : event.patches;
            document = applyPatches(document, patches);
        }
        const legacyDocument = digest(document) === bundle.documentHash ? null : withLegacyUndefinedActivity(document);
        if (head !== bundle.checksum || digest(document) !== bundle.documentHash && !(legacyDocument && digest(legacyDocument) === bundle.documentHash)) throw new Error('导入重放结果不一致');
        // Imported events are rehashed in the persisted form, so a legacy chain becomes a current one.
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
