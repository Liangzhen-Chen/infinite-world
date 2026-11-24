import { getContext } from '../../../extensions.js';
import { createCampaign, commit, cast, roll, addMemory, search, promptFor, restoreToAnchors } from './core.js';

const KEY = 'infinite_fields';
const NAME = '无限原野·世界主持人';
const seed = await (await fetch(new URL('./seed.json', import.meta.url))).json();
let mode = 'normal';
let inFlight = Promise.resolve();
const ctx = () => getContext();
const active = () => ctx().characters[ctx().characterId]?.name === NAME;
const objectSchema = (properties,required=[]) => ({type:'object',properties,required,additionalProperties:false});
const stringSchema = {type:'string'};
const intSchema = {type:'integer'};
const rows = schema => ({type:'array',items:schema});
const memorySchema = objectSchema({subject:stringSchema,key:stringSchema,content:stringSchema,keywords:rows(stringSchema)},['subject','key','content']);

function campaign() {
    if (!active()) throw new Error('请先打开无限原野战役');
    ctx().chatMetadata[KEY] ??= createCampaign(seed);
    return ctx().chatMetadata[KEY];
}

function anchor() {
    const message = [...ctx().chat].reverse().find(v=>v.is_user);
    if (!message) return null;
    message.extra ??= {};
    message.extra.fields_anchor ??= crypto.randomUUID();
    return message.extra.fields_anchor;
}

function refresh() {
    if (!active()) {
        ctx().setExtensionPrompt(KEY,'',1,0);
        document.querySelector('#fields-toolbar')?.remove();
        return;
    }
    const store = campaign();
    const input = document.querySelector('#send_textarea')?.value;
    const history = input ? [...ctx().chat,{is_user:true,mes:input,name:ctx().name1}] : ctx().chat;
    ctx().setExtensionPrompt(KEY,promptFor(store,history),1,1,false,0);
    let bar = document.querySelector('#fields-toolbar');
    if (!bar) {
        bar=document.createElement('div');bar.id='fields-toolbar';
        const label=document.createElement('span');label.id='fields-status';
        const button=document.createElement('button');button.textContent='世界账本';button.type='button';button.addEventListener('click',showBook);
        bar.append(label,button);
        const host=document.querySelector('#sheld') ?? document.querySelector('#chat')?.parentElement;
        host?.prepend(bar);
    }
    const p=store.state.player;
    const minute=store.state.minute;
    const clock=`第${Math.floor(minute/1440)+1}日 ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
    document.querySelector('#fields-status').textContent=`${clock} · ${store.state.location} · ${p.coins}铜 · HP ${p.hp}/${p.maxHp} · MP ${p.mp}/${p.maxMp} · 记忆${Object.keys(store.memories).length}`;
}

async function persist() {
    refresh();
    await ctx().saveChat();
    const c=ctx();
    const response=await fetch('/api/chats/get',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({avatar_url:c.characters[c.characterId].avatar,file_name:c.chatId})});
    const saved=await response.json();
    if(!response.ok || saved[0]?.chat_metadata?.[KEY]?.sequence !== campaign().sequence) throw new Error('本地存档写入尚未确认，请重试保存。');
}

function serialized(task) {
    const next=inFlight.then(async()=>{
        const store=campaign();
        const old=structuredClone(store);
        try {
            const result=await task(store);
            await persist();
            return result;
        } catch(e) {
            ctx().chatMetadata[KEY]=old;
            refresh();
            return {ok:false,error:e.message,note:'本次操作没有提交。不要把它叙述为已发生。'};
        }
    });
    inFlight=next.catch(()=>{});
    return next;
}

function register(name,displayName,description,parameters,action) {
    ctx().registerFunctionTool({name,displayName,description,parameters,action,formatMessage:()=>displayName,shouldRegister:()=>active() && mode!=='quiet'});
}

register('world_commit','更新世界账本','所有金币、物品、技能、关系、契约、工程、旅行与重要世界状态变化必须实际提交。transaction_id每个新事件唯一，同一事件重试沿用编号。口头承诺记录待履行。所有变更是原子事务，余额不足会全部拒绝。用memories同时存储新长期事实。',objectSchema({
    transaction_id:stringSchema,reason:stringSchema,minutes:intSchema,location:stringSchema,
    player:objectSchema({name:stringSchema,coins_delta:intSchema,hp_delta:intSchema,mp_delta:intSchema,xp_delta:intSchema}),
    items:rows(objectSchema({item:stringSchema,delta:intSchema},['item','delta'])),
    relationships:rows(objectSchema({name:stringSchema,trust_delta:intSchema,affection_delta:intSchema,notes:stringSchema,location:stringSchema,activity:stringSchema},['name'])),
    professions:objectSchema({combat:stringSchema,life:rows(stringSchema),hidden:rows(stringSchema)}),
    pets:rows(objectSchema({name:stringSchema,category:{type:'string',enum:['辅助','战斗','坐骑']},status:{type:'string',enum:['活跃','放养','寄养','解除','死亡']},notes:stringSchema},['name','category','status','notes'])),
    skills:rows(objectSchema({name:stringSchema,gain:intSchema},['name','gain'])),
    records:rows(objectSchema({category:{type:'string',enum:['contract','property','project','pet','discovery','faction','quest','profession','world_event','craft','knowledge','rule']},name:stringSchema,content:stringSchema,status:stringSchema},['category','name','content'])),
    spells:rows(objectSchema({name:stringSchema,mp:intSchema,effect:stringSchema,duration:intSchema,materials:rows(objectSchema({item:stringSchema,amount:intSchema},['item','amount']))},['name','mp','effect'])),
    settlement:objectSchema({food_delta:intSchema,wood_delta:intSchema,stone_delta:intSchema,iron_delta:intSchema,treasury_delta:intSchema,population_delta:intSchema,foodPerDay:intSchema,woodPerDay:intSchema}),
    memories:rows(memorySchema),
},['transaction_id','reason']),args=>serialized(store=>commit(store,args,anchor())));

register('world_cast','实际施法','只有已学会并写入账本的法术可施放。实际扣除MP和材料，推进一分钟。成功表示资源已提交，环境是否允许与效果范围仍需依已知规则裁定。',objectSchema({transaction_id:stringSchema,spell:stringSchema,target:stringSchema},['transaction_id','spell','target']),args=>serialized(store=>cast(store,args,anchor())));

register('world_roll','本地掷骰','为真实有风险的行动掷d20。先确定难度和有根据的修正，再调用。相同check_id不会重掷，不能为想要的结果更改条件。普通聊天与购买不必掷骰。',objectSchema({check_id:stringSchema,purpose:stringSchema,difficulty:intSchema,modifier:intSchema},['check_id','purpose','difficulty']),args=>serialized(store=>roll(store,args,()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296,anchor())));

register('world_remember','写入长期记忆','独立持久保存重要事实、关系经历、NPC已知信息或稳定规则，不随摘要覆盖。subject和key一致时更新当前事实，旧版本仍在事件历史。不要把未履行承诺记为已完成。',memorySchema,args=>serialized(store=>addMemory(store,args,anchor())));

register('world_search','检索完整历史','从当前战役的全部原始聊天、长期事实和世界记录搜索旧事，能够找回不在当前上下文中的原话。使用人名、地点或事件相关词检索；没有找到时说明不确定。',objectSchema({query:stringSchema,limit:intSchema},['query']),args=>({results:search(campaign(),ctx().chat,args.query,args.limit),note:'原始对话中的角色说法不一定是客观事实；对照事件账本。'}));

register('world_read','读取当前状态','查看资源、已会法术、技能、人物关系和契约的完整本地状态。',objectSchema({section:{type:'string',enum:['all','player','inventory','skills','spells','professions','pets','npcs','records','settlement','memories']}}),args=>args.section && args.section!=='all' ? (args.section==='memories' ? campaign().memories : campaign().state[args.section]) : campaign().state);

function download(value,filename) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function showBook() {
    document.querySelector('#fields-dialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='fields-dialog';
    const title=document.createElement('h2');title.textContent='世界账本与长期记忆';dialog.append(title);
    const note=document.createElement('p');note.className='fields-note';note.textContent='重要记忆独立保存。摘要不会删除原始聊天。固定的事实每次都提供给主持人；其他历史按当前话题检索。已提交的事件可在账本中核对。';dialog.append(note);
    const actions=document.createElement('div');dialog.append(actions);
    for (const [label,fn] of [
        ['保存',async()=>{await persist();note.textContent='已保存到本地战役文件。';}],
        ['导出完整存档',()=>download({format:'infinite-fields-backup-v1',exported:new Date().toISOString(),campaign:campaign(),chatMetadata:ctx().chatMetadata,chat:ctx().chat,chatId:ctx().chatId},`无限原野-${new Date().toISOString().slice(0,10)}.json`)],
        ['关闭',()=>dialog.close()],
    ]) {const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;actions.append(b);}
    const file=document.createElement('input');file.type='file';file.accept='.json';file.hidden=true;
    const restore=document.createElement('button');restore.textContent='导入为另一个存档';
    restore.onclick=()=>file.click();
    file.onchange=async()=>{
        try {
            const selected=file.files?.[0];if(!selected)return;
            const data=JSON.parse(await selected.text());
            if(data.format!=='infinite-fields-backup-v1' || data.campaign?.version!==1 || !Array.isArray(data.chat) || !data.campaign?.state?.player || !data.campaign?.memories) throw new Error('这不是完整的无限原野存档');
            const c=ctx();
            const metadata=structuredClone(data.chatMetadata ?? {});metadata[KEY]=data.campaign;metadata.integrity=crypto.randomUUID();
            const name=`导入存档-${Date.now()}-${crypto.randomUUID().slice(0,6)}`;
            const response=await fetch('/api/chats/save',{method:'POST',headers:c.getRequestHeaders(),body:JSON.stringify({avatar_url:c.characters[c.characterId].avatar,file_name:name,force:true,chat:[{user_name:c.name1,character_name:c.name2,chat_metadata:metadata},...data.chat]})});
            if(!response.ok)throw new Error('导入存档写入失败');
            dialog.close();await c.openCharacterChat(name);refresh();
        } catch(e) {note.textContent=e.message;}
    };
    actions.append(restore,file);
    const current=campaign().state;
    const overview=document.createElement('p');
    overview.textContent=`${current.player.name} · 等级${current.player.level} · 经验${current.player.xp} · ${current.player.coins}铜 · 生命${current.player.hp}/${current.player.maxHp} · 魔力${current.player.mp}/${current.player.maxMp}`;dialog.append(overview);
    const section=(heading,lines)=>{
        const h=document.createElement('h3');h.textContent=heading;dialog.append(h);
        for(const line of lines){const p=document.createElement('p');p.textContent=line;dialog.append(p);}
    };
    section('随身物品',Object.entries(current.inventory).map(([name,count])=>`${name} × ${count}`));
    section('已会法术',Object.values(current.spells).map(v=>`${v.name}：消耗${v.mp}魔力。${v.effect}`));
    section('技艺',Object.entries(current.skills).map(([name,v])=>`${name}：${v.grade}，熟练度${v.proficiency}`));
    const profession=current.professions ?? {combat:'',life:[],hidden:[]};
    section('正式职业',[`战斗职业：${profession.combat || '尚未认证'}。生活职业：${profession.life.join('、') || '尚未认证'}。隐藏职业：${profession.hidden.join('、') || '尚未取得'}。`]);
    if(Object.keys(current.pets ?? {}).length) section('宠物与坐骑',Object.values(current.pets).map(v=>`${v.name} · ${v.category} · ${v.status}：${v.notes}`));
    const changed=Object.entries(current.npcs).filter(([,v])=>v.trust || v.affection);
    section('已有关系变化',changed.length?changed.map(([name,v])=>`${name}：信任${v.trust}，亲近${v.affection}`):['刚刚抵达，尚无共同经历。']);
    const records=Object.values(current.records);
    section('约定与世界变化',records.length?records.map(v=>`${v.name} · ${v.status}：${v.content}`):['尚无已成立的约定。']);
    const s=current.settlement;
    section(`${s.name}公共账目`,[`人口${s.population}；粮食${s.food}份；木料${s.wood}份；石料${s.stone}份；铁料${s.iron}份；公款${s.treasury}铜。公共物资须获得使用授权。`]);
    const searchLabel=document.createElement('label');searchLabel.textContent='检索旧经历';dialog.append(searchLabel);
    const searchInput=document.createElement('input');searchInput.placeholder='人名、地点或事情';dialog.append(searchInput);
    const searchResult=document.createElement('pre');searchResult.hidden=true;
    searchInput.addEventListener('input',()=>{searchResult.hidden=!searchInput.value;searchResult.textContent=JSON.stringify(search(campaign(),ctx().chat,searchInput.value,8),null,2);});dialog.append(searchResult);
    const label=document.createElement('label');label.textContent='手动固定重要记忆';dialog.append(label);
    const input=document.createElement('textarea');input.rows=3;input.placeholder='例如：第三天我帮林穗找回遗失的账簿，她允许我借用酒馆厨房。';dialog.append(input);
    const save=document.createElement('button');save.textContent='保存为固定记忆';save.onclick=async()=>{
        if (!input.value.trim()) return;
        const result=await serialized(store=>addMemory(store,{subject:'玩家固定',key:`手记-${crypto.randomUUID().slice(0,8)}`,content:input.value,keywords:[],pinned:true},null));
        if (result.ok===false) note.textContent=result.error;
        else {dialog.close();showBook();}
    };dialog.append(save);
    for (const [id,fact] of Object.entries(campaign().memories)) {
        const row=document.createElement('div');row.className='fields-memory';
        const content=document.createElement('p');content.textContent=`${fact.pinned?'★ ':''}${fact.subject} / ${fact.key}：${fact.content}`;row.append(content);
        const pin=document.createElement('button');pin.textContent=fact.pinned?'取消固定':'每次都提醒主持人';
        pin.onclick=async()=>{
            const store=campaign();store.memories[id].pinned=!store.memories[id].pinned;
            store.manualPins ??= {};store.manualPins[id]=store.memories[id].pinned;
            await persist();dialog.close();showBook();
        };row.append(pin);dialog.append(row);
    }
    document.body.append(dialog);dialog.showModal();
}

async function reconcile(type,options,dryRun) {
    if (!active() || dryRun) return;
    mode=type;
    if (['regenerate','swipe'].includes(type)) {
        const id=anchor();
        const old=campaign();
        const rebuilt=restoreToAnchors(seed,old.journal.filter(v=>v.anchor!==id || id===null),new Set(ctx().chat.map(v=>v.extra?.fields_anchor).filter(Boolean)));
        rebuilt.manualPins=old.manualPins;
        for (const [key,value] of Object.entries(old.manualPins ?? {})) if (rebuilt.memories[key]) rebuilt.memories[key].pinned=value;
        ctx().chatMetadata[KEY]=rebuilt;
        await persist();
    }
    refresh();
}

async function onDeleted() {
    if (!active()) return;
    const old=campaign();
    const valid=new Set(ctx().chat.map(v=>v.extra?.fields_anchor).filter(Boolean));
    if (old.journal.some(v=>v.anchor && !valid.has(v.anchor))) {
        const rebuilt=restoreToAnchors(seed,old.journal,valid);
        rebuilt.manualPins=old.manualPins;
        for (const [key,value] of Object.entries(old.manualPins ?? {})) if (rebuilt.memories[key]) rebuilt.memories[key].pinned=value;
        ctx().chatMetadata[KEY]=rebuilt;
        await persist();
    }
    refresh();
}

const context=ctx();
context.eventSource.on(context.eventTypes.APP_READY,refresh);
context.eventSource.on(context.eventTypes.CHAT_CHANGED,refresh);
context.eventSource.on(context.eventTypes.CHAT_LOADED,refresh);
context.eventSource.on(context.eventTypes.MESSAGE_SENT,()=>{if(active()){anchor();refresh();}});
context.eventSource.on(context.eventTypes.GENERATION_STARTED,reconcile);
context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS,refresh);
context.eventSource.on(context.eventTypes.GENERATION_ENDED,()=>{mode='normal';refresh();});
context.eventSource.on(context.eventTypes.MESSAGE_DELETED,onDeleted);
// Debug access uses public, non-secret state only and lets local smoke tests
// exercise the same operations registered with the model.
window.infiniteFields={campaign,refresh,showBook};
