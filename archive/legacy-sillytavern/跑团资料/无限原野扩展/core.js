const clone = value => structuredClone(value);
const safeKey = value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 120 || ['__proto__','constructor','prototype'].includes(value)) throw new Error('无效记录名称');
    return value.trim();
};
const integer = (value, min, max, name) => {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name}超出允许范围`);
    return value;
};
const text = (value, max = 1200) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('记录文本为空或过长');
    return value.trim();
};

export function createCampaign(seed) {
    return {version:1,state:clone(seed.state),memories:clone(seed.memories),journal:[],transactions:{},rolls:{},sequence:0};
}

export function xpRequired(level) {
    return level < 10 ? level * 100 : Math.ceil(level ** 4 / 10);
}

export function skillGrade(proficiency) {
    const stages = ['初级','中级','高级','特级','专家级','大师级','宗师级','圣级','神级'];
    return `${stages[Math.min(8, Math.floor(proficiency / 300))]}${Math.floor(proficiency % 300 / 100) + 1}等`;
}

function applyItems(state, items) {
    for (const row of items ?? []) {
        const item = safeKey(row.item);
        const delta = integer(row.delta, -100000, 100000, '物品数量');
        const amount = (state.inventory[item] ?? 0) + delta;
        if (amount < 0) throw new Error(`背包中的${item}不足`);
        if (amount === 0) delete state.inventory[item];
        else state.inventory[item] = amount;
    }
}

function tick(state, minutes) {
    const previousDay = Math.floor(state.minute / 1440);
    state.minute += minutes;
    const days = Math.floor(state.minute / 1440) - previousDay;
    if (days > 0 && state.settlement.simulationEnabled) {
        const s = state.settlement;
        const available = s.food + s.foodPerDay * days;
        const needed = s.population * days;
        s.food = Math.max(0, available - needed);
        s.unmetMeals = (s.unmetMeals ?? 0) + Math.max(0, needed - available);
        s.wood += s.woodPerDay * days;
    }
    return days;
}

function remember(store, entry) {
    const subject = safeKey(entry.subject);
    const key = safeKey(entry.key);
    const id = `${subject}::${key}`;
    const previous = store.memories[id];
    const memory = {subject,key,content:text(entry.content),keywords:(entry.keywords ?? []).slice(0,16).map(v => safeKey(v)),pinned:previous?.pinned ?? false,updated:store.sequence + 1};
    // A model cannot unpin a user-pinned memory.
    if (entry.pinned === true) memory.pinned = true;
    store.memories[id] = memory;
    return memory;
}

export function commit(store, action, anchor = null) {
    const id = safeKey(action.transaction_id);
    const signature = JSON.stringify(action);
    const old = store.transactions[id];
    if (old) {
        if (old.signature !== signature) throw new Error('同一事件编号不能用于不同操作');
        return {...clone(old.result),duplicate:true};
    }
    const reason = text(action.reason);
    const next = clone(store);
    const state = next.state;
    const player = state.player;
    const change = action.player ?? {};
    if(change.name !== undefined) player.name=safeKey(change.name);
    for (const [key,min,max] of [['coins',0,1000000000],['hp',0,player.maxHp],['mp',0,player.maxMp],['xp',0,1000000000]]) {
        const delta = integer(change[`${key}_delta`] ?? 0, -1000000000, 1000000000, key);
        player[key] = integer(player[key] + delta, min, max, key);
    }
    while (player.level < 200 && player.xp >= xpRequired(player.level + 1)) {
        player.xp -= xpRequired(player.level + 1);
        player.level++;
        player.maxHp+=2;player.maxMp+=1;
    }
    if (action.location !== undefined) state.location = safeKey(action.location);
    applyItems(state, action.items);
    for (const row of action.relationships ?? []) {
        const name = safeKey(row.name);
        const npc = state.npcs[name] ?? {trust:0,affection:0,notes:''};
        npc.trust = Math.max(-100, Math.min(100, npc.trust + integer(row.trust_delta ?? 0, -20, 20, '信任变化')));
        npc.affection = Math.max(-100, Math.min(100, npc.affection + integer(row.affection_delta ?? 0, -20, 20, '亲近变化')));
        if (row.notes !== undefined) npc.notes = text(row.notes);
        if (row.location !== undefined) npc.location = safeKey(row.location);
        if (row.activity !== undefined) npc.activity = text(row.activity,300);
        state.npcs[name] = npc;
    }
    if(action.professions) {
        const previous=state.professions ?? {combat:'',life:[],hidden:[]};
        const p=action.professions;
        state.professions={
            combat:p.combat===undefined?previous.combat:p.combat===''?'':safeKey(p.combat),
            life:p.life===undefined?previous.life:[...new Set(p.life.map(safeKey))],
            hidden:p.hidden===undefined?previous.hidden:[...new Set(p.hidden.map(safeKey))],
        };
        if(state.professions.life.length>2) throw new Error('正式生活职业名额最多两个，不能新增第三个');
    }
    state.pets ??= {};
    for(const pet of action.pets ?? []) {
        const name=safeKey(pet.name);
        if(!['辅助','战斗','坐骑'].includes(pet.category)) throw new Error('宠物类别无效');
        if(!['活跃','放养','寄养','解除','死亡'].includes(pet.status)) throw new Error('宠物状态无效');
        state.pets[name]={name,category:pet.category,status:pet.status,notes:text(pet.notes)};
    }
    const role=state.professions?.combat ?? '';
    const limits={辅助:3,战斗:role==='元素召唤师'?0:5,坐骑:role==='骑士'?20:10};
    for(const category of Object.keys(limits)) {
        const count=Object.values(state.pets).filter(v=>v.category===category && !['解除','死亡'].includes(v.status)).length;
        if(count>limits[category]) throw new Error(`${category}宠物数量超过职业允许上限${limits[category]}`);
    }
    for (const row of action.skills ?? []) {
        const name = safeKey(row.name);
        const value = state.skills[name] ?? {proficiency:0};
        value.proficiency = integer(value.proficiency + integer(row.gain,0,100,'技能增量'),0,2699,'熟练度');
        value.grade = skillGrade(value.proficiency);
        state.skills[name] = value;
    }
    for (const row of action.records ?? []) {
        const category = safeKey(row.category);
        if (!['contract','property','project','pet','discovery','faction','quest','profession','world_event','craft','knowledge','rule'].includes(category)) throw new Error('未知记录类型');
        const key = `${category}::${safeKey(row.name)}`;
        const old = state.records[key];
        state.records[key] = {category,name:row.name,content:text(row.content,3000),status:text(row.status ?? '有效',100),created:old?.created ?? state.minute,updated:state.minute};
    }
    for (const spell of action.spells ?? []) {
        const name = safeKey(spell.name);
        state.spells[name] = {name,mp:integer(spell.mp,1,10000,'MP消耗'),materials:(spell.materials ?? []).map(v => ({item:safeKey(v.item),amount:integer(v.amount,1,100000,'材料数量')})),effect:text(spell.effect),duration:integer(spell.duration ?? 0,0,10080,'持续分钟')};
    }
    const settlement = action.settlement ?? {};
    for (const key of ['food','wood','stone','iron','treasury','population']) {
        const delta = integer(settlement[`${key}_delta`] ?? 0,-1000000,1000000,key);
        state.settlement[key] = integer(state.settlement[key] + delta,0,1000000000,key);
    }
    for (const key of ['foodPerDay','woodPerDay']) {
        if (settlement[key] !== undefined) state.settlement[key] = integer(settlement[key],0,1000000,key);
    }
    const minutes = integer(action.minutes ?? 0,0,43200,'推进时间');
    const days = tick(state,minutes);
    for (const fact of action.memories ?? []) remember(next, fact);
    next.sequence++;
    const result = {ok:true,event:next.sequence,transaction_id:id,reason,minute:state.minute,elapsed_days:days,player:clone(player),inventory:clone(state.inventory),location:state.location};
    next.transactions[id] = {signature,result};
    next.journal.push({sequence:next.sequence,type:'commit',anchor,action:clone(action),minute:state.minute});
    Object.assign(store,next);
    return result;
}

export function cast(store, request, anchor = null) {
    const spell = store.state.spells[request.spell];
    if (!spell) throw new Error('尚未学会这个法术，不能施放');
    const result = commit(store,{
        transaction_id:request.transaction_id,
        reason:`施放${spell.name}，目标：${text(request.target,200)}`,
        minutes:1,
        player:{mp_delta:-spell.mp},
        items:spell.materials.map(v => ({item:v.item,delta:-v.amount})),
        records:[{category:'world_event',name:request.transaction_id,content:`已施放${spell.name}，目标${request.target}。规则效果：${spell.effect}。持续${spell.duration}分钟；具体环境效果仍需裁定，不能超出已知术式。`,status:'已消耗施法资源'}],
    },anchor);
    return {...result,spell:clone(spell),note:'施法资源已实际扣除；目标是否满足条件和效果范围仍需依规则裁定。'};
}

export function roll(store, request, rng = () => Math.random(), anchor = null) {
    const id = safeKey(request.check_id);
    const difficulty = integer(request.difficulty,1,40,'难度');
    const modifier = integer(request.modifier ?? 0,-15,15,'修正');
    const purpose = text(request.purpose,300);
    if (store.rolls[id]) {
        const previous = store.rolls[id];
        if (previous.difficulty !== difficulty || previous.modifier !== modifier || previous.purpose !== purpose) throw new Error('不能用旧检定编号更换检定条件');
        return {...clone(previous),duplicate:true};
    }
    const die = Math.floor(rng() * 20) + 1;
    const result = {check_id:id,die,modifier,total:die+modifier,difficulty,purpose,success:die+modifier>=difficulty};
    store.rolls[id] = result;
    store.sequence++;
    store.journal.push({sequence:store.sequence,type:'roll',anchor,result:clone(result),minute:store.state.minute});
    return clone(result);
}

export function addMemory(store, entry, anchor = null) {
    const fact = remember(store,entry);
    store.sequence++;
    store.journal.push({sequence:store.sequence,type:'memory',anchor,entry:clone(entry),minute:store.state.minute});
    return clone(fact);
}

// Retrieval indexes Chinese bigrams as well as Latin words. Nothing is deleted
// because it falls below the prompt budget; original text remains in chat JSONL.
export function terms(value) {
    const normalized = String(value).toLowerCase();
    const result = new Set(normalized.match(/[a-z0-9_]{2,}/g) ?? []);
    for (const span of normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []) {
        result.add(span);
        for (let i=0;i<span.length-1;i++) result.add(span.slice(i,i+2));
    }
    return result;
}

function score(query, candidate) {
    const a = terms(query), b = terms(candidate);
    if (!a.size) return 0;
    let overlap = 0;
    for (const term of a) if (b.has(term)) overlap += term.length > 2 ? 2 : 1;
    return overlap / Math.sqrt(Math.max(1,b.size));
}

export function search(store, chat, query, limit = 6, oldOnly = false) {
    limit = Math.max(1,Math.min(12,Number(limit) || 6));
    const candidates = Object.entries(store.memories).map(([id,v]) => ({type:'长期事实',id,text:`${v.subject} / ${v.key}：${v.content}`,score:score(query,`${v.subject} ${v.key} ${v.content} ${v.keywords.join(' ')}`)}));
    candidates.push(...Object.values(store.state.records).map(v => ({type:'世界记录',text:`${v.name}：${v.content}；状态${v.status}`,score:score(query,`${v.name} ${v.content}`)})));
    const end = oldOnly ? Math.max(0,chat.length-8) : chat.length;
    for (let i=0;i<end;i++) {
        const m = chat[i];
        if (m.is_system || m.extra?.tool_invocations || !m.mes) continue;
        candidates.push({type:'原始对话',message:i,time:m.send_date,speaker:m.name,text:m.mes,score:score(query,m.mes)});
    }
    const seen=new Set();
    return candidates.filter(v => v.score > 0).sort((a,b) => b.score-a.score).filter(v=>{
        if(seen.has(v.text)) return false;
        seen.add(v.text);return true;
    }).slice(0,limit).map(v => ({...v,text:v.text.length>2400 ? relevantExcerpt(v.text,query,2400) : v.text}));
}

function relevantExcerpt(content, query, maximum) {
    const segments = content.split(/(?<=[。！？\n])/);
    const ranked = segments.map((text,index) => ({text,index,score:score(query,text)})).sort((a,b)=>b.score-a.score);
    const selected = [];
    let used = 0;
    for (const row of ranked) {
        if (used + row.text.length > maximum) continue;
        selected.push(row);used+=row.text.length;
    }
    return selected.sort((a,b)=>a.index-b.index).map(v=>v.text).join('') || content.slice(0,maximum);
}

export function promptFor(store, chat) {
    const state = store.state;
    const recent=chat.filter(v=>!v.is_system && !v.extra?.tool_invocations);
    const query = [...recent].reverse().find(v=>v.is_user)?.mes ?? recent.at(-1)?.mes ?? '';
    const important = Object.values(store.memories).filter(v=>v.pinned).map(v=>`${v.subject}/${v.key}：${v.content}`);
    const selected = search(store,chat,query,8,true);
    const activeNpcs = Object.fromEntries(Object.entries(state.npcs).filter(([name,npc])=>query.includes(name) || npc.trust || npc.affection));
    const activeRecords = Object.fromEntries(Object.entries(state.records).filter(([key,v])=>['contract','property','profession','pet','rule'].includes(v.category) || v.status.includes('待') || query.includes(v.name)));
    const compact = {...state,npcs:activeNpcs,records:activeRecords};
    return `[本地持久账本，事件序号${store.sequence}。这是事实依据，摘要不得覆盖它。]\n${JSON.stringify(compact)}\n[用户固定的重要事实]\n${important.join('\n')}\n[按当前话题从长期事实与完整历史检索的记录，原始对话不是全知旁白，开局记录为历史状态，不可覆盖较新事件]\n${JSON.stringify(selected)}\n[执行要求] 使用world_commit实际记账后才宣布财物或长期状态已改变；使用world_remember记录值得长期保留的新事实；需要旧细节就world_search。口头承诺没有履行时状态为待履行。职业与宠物使用专门的professions和pets字段以验证名额；NPC带路或行动应更新其location/activity，不能只说答应了。`;
}

export function restoreToAnchors(seed, journal, validAnchors) {
    const fresh = createCampaign(seed);
    for (const row of journal) {
        if (row.anchor && !validAnchors.has(row.anchor)) continue;
        if (row.type==='commit') commit(fresh,row.action,row.anchor);
        if (row.type==='memory') addMemory(fresh,row.entry,row.anchor);
        if (row.type==='roll') {
            const r=row.result;
            roll(fresh,r,()=> (r.die-.5)/20,row.anchor);
        }
    }
    return fresh;
}
