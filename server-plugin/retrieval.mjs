import * as OpenCC from 'opencc-js';
const convert = OpenCC.Converter({ from: 'tw', to: 'cn' });
const groups = [ ['账簿', '账本', '帐本', '帐簿'], ['厨房', '灶台', '炉灶'], ['承诺', '答应', '约定'], ['酒馆', '客栈'] ];
export const normalize = text => convert(String(text)).toLowerCase().replaceAll('帐', '账').normalize('NFKC');
const systemLanguage = /账本|工具|事件编号|裁定|模型|提示词|主持人/;
export function validateMemory(content) {
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) throw new Error('记忆正文为空或过长');
    if (systemLanguage.test(content)) throw new Error('记忆包含系统用语，请改写成世界内发生的具体事实');
    return content.trim();
}
export class EntityResolver {
    constructor(entities) {
        this.entities = new Map(); this.aliases = new Map();
        for (const entity of entities) {
            if (this.entities.has(entity.id)) throw new Error(`重复实体编号${entity.id}`);
            this.entities.set(entity.id, entity);
            for (const alias of [entity.id, entity.name, ...entity.aliases ?? []]) {
                const name = normalize(alias);
                if (!name.trim()) throw new Error('空实体名称');
                const entries = this.aliases.get(name) ?? new Set(); entries.add(entity.id); this.aliases.set(name, entries);
            }
        }
        this.names = [...this.aliases.keys()].sort((a, b) => b.length - a.length);
    }
    resolve(name, scope = null, kind = null) {
        const candidates = [...this.aliases.get(normalize(name)) ?? []].filter(id => !kind || id.startsWith(kind + '_'));
        const scoped = scope ? candidates.filter(id => this.entities.get(id).scope === scope || this.entities.get(id).location === scope) : candidates;
        if (scoped.length === 1) return scoped[0];
        if (!scoped.length && candidates.length === 1) return candidates[0];
        if (candidates.length > 1) throw new Error(`称呼“${name}”有歧义，请用编号：${candidates.join('、')}`);
        throw new Error(`未登记“${name}”，候选：${this.names.filter(alias => alias.includes(normalize(name))).slice(0, 5).join('、') || '无'}；新建实体请使用world_create`);
    }
    mentions(text, scope = null) {
        const source = normalize(text), found = new Set();
        for (const alias of this.names) if (source.includes(alias)) {
            try { found.add(this.resolve(alias, scope)); } catch {}
        }
        return found;
    }
}

export class MemoryIndex {
    constructor({ entities = [], dictionary = [] } = {}) {
        this.resolver = new EntityResolver(entities); this.dictionary = [...dictionary, ...groups.flat()];
        this.documents = new Map(); this.postings = new Map(); this.totalLength = 0; this.tokenizations = 0;
        this.chatMessages = []; this.messageRefs = new WeakMap();
    }
    terms(text, expand = false, scope = null) {
        let value = normalize(text);
        if (expand) for (const variants of groups) if (variants.some(word => value.includes(normalize(word)))) value += ' ' + variants.join(' ');
        const terms = value.match(/[a-z0-9_]{2,}/g) ?? [];
        for (const word of this.dictionary) if (value.includes(normalize(word))) terms.push(normalize(word));
        for (const span of value.match(/[\u3400-\u9fff]{2,}/g) ?? []) for (let i = 0; i < span.length - 1; i++) terms.push(span.slice(i, i + 2));
        terms.push(...this.resolver.mentions(value, scope));
        return terms;
    }
    remove(id) {
        const old = this.documents.get(id); if (!old) return;
        for (const term of old.frequencies.keys()) { const set = this.postings.get(term); set.delete(id); if (!set.size) this.postings.delete(term); }
        this.totalLength -= old.length; this.documents.delete(id);
    }
    upsert(record) {
        if (typeof record.id !== 'string' || !record.id) throw new Error('检索记录缺少编号');
        if (this.documents.get(record.id)?.revision === record.revision && record.revision !== undefined) return;
        this.remove(record.id); this.tokenizations++;
        const frequencies = new Map();
        const terms = this.terms(`${record.text} ${(record.keywords ?? []).join(' ')}`, false, record.scope);
        for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
        const document = { ...record, frequencies, length: terms.length, salience: record.salience ?? 3, minute: record.minute ?? 0 };
        this.documents.set(record.id, document); this.totalLength += terms.length;
        for (const term of frequencies.keys()) { const set = this.postings.get(term) ?? new Set(); set.add(record.id); this.postings.set(term, set); }
    }
    syncChat(chat) {
        // Edits invalidate their message through editChat; ordinary refreshes
        // only inspect message references and append/delete changes.
        for (let i = chat.length; i < this.chatMessages.length; i++) this.remove(`chat_${i}`);
        this.chatMessages.length = chat.length;
        for (let i = 0; i < chat.length; i++) {
            const message = chat[i];
            if (this.chatMessages[i] === message) continue;
            this.chatMessages[i] = message;
            if (message.is_system || message.extra?.tool_invocations || message.extra?.fields_invalidated || !message.mes) { this.remove(`chat_${i}`); continue; }
            this.upsert({ id: `chat_${i}`, source: '原始对话', text: message.mes, speaker: message.name,
                entities: [...this.resolver.mentions(message.mes)], eventId: message.extra?.fields_event_id ?? null });
        }
    }
    editChat(index, message) {
        if (!Number.isInteger(index) || index < 0 || index >= this.chatMessages.length || !message || typeof message !== 'object') throw new Error('编辑的消息不在已同步聊天内');
        const chat = [...this.chatMessages]; chat[index] = message; this.chatMessages[index] = null; this.syncChat(chat);
    }
    syncDelta(start,messages,total){
        if(!Number.isInteger(start)||start<0||!Number.isInteger(total)||total<0||total>100000||!Array.isArray(messages)||start+messages.length>total)throw new Error('聊天索引增量范围非法');
        const combined=this.chatMessages.slice(0,total);
        for(let i=0;i<messages.length;i++)combined[start+i]=messages[i];
        for(let i=0;i<total;i++)if(!combined[i]||typeof combined[i]!=='object')throw new Error('聊天索引缺少前序消息，请从头同步一次');
        this.syncChat(combined);
    }
    search(query, { limit = 8, now = 0, scope = null, present = [] } = {}) {
        const terms = new Set(this.terms(query, true, scope)), candidates = new Set();
        for (const term of terms) for (const id of this.postings.get(term) ?? []) candidates.add(id);
        const entities = new Set([...this.resolver.mentions(query, scope), ...present]);
        for (const document of this.documents.values()) if (document.entities?.some(id => entities.has(id))) candidates.add(document.id);
        const n = this.documents.size, average = this.totalLength / Math.max(1, n), rows = [];
        for (const id of candidates) {
            const doc = this.documents.get(id); let relevance = 0;
            for (const term of terms) {
                const tf = doc.frequencies.get(term) ?? 0; if (!tf) continue;
                const df = this.postings.get(term)?.size ?? 0;
                relevance += Math.log(1 + (n - df + 0.5) / (df + 0.5)) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * doc.length / Math.max(1, average)));
            }
            if (doc.entities?.some(id => entities.has(id))) relevance += 2;
            const decay = 0.5 + 0.5 * Math.exp(-Math.max(0, now - doc.minute) / (1440 * 30));
            const score = relevance * (0.5 + doc.salience / 5) * decay;
            if (score > 0) rows.push({ id, source: doc.source, eventId: doc.eventId, minute: doc.minute, text: doc.text, score });
        }
        const seen = new Set();
        return rows.sort((a, b) => b.score - a.score).filter(row => {
            const key = row.eventId || row.text; if (seen.has(key)) return false; seen.add(key); return true;
        }).slice(0, Math.max(1, Math.min(12, limit)));
    }
}
