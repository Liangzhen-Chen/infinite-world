import { getContext } from '../../../extensions.js';
import { parseTurn, toolResultWithClock, lookupToolResult } from './turn.mjs';
import { readStateSection } from './state-read.mjs';
import { toolDefinitions } from './tools.mjs';
import { renderMessages } from './message-view.mjs';
import { isOutOfCharacter, injectToolExamples } from './prompt.mjs';
const KEY='infinite_fields';
const ctx=()=>getContext();
const active=()=>ctx().characters[ctx().characterId]?.name==='无限原野·世界主持人';
let view=null,loadedChat=null,blocked=null,chain=Promise.resolve(),mode='normal',turnStart=null;
let indexedChat=null,indexedMessages=[];
let labels={},feedback=[];
let reviewTurn=null;
const reviewing=new WeakMap();
const api=async(endpoint,body={})=>{
    const response=await fetch(`/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok||data.ok===false){const error=new Error(data.error??`本地存档请求失败${response.status}`);error.rejected=response.status>=400&&response.status<500;throw error;}return data;
};
const anchor=()=>{
    const message=[...ctx().chat].reverse().find(message=>message.is_user);
    if(!message)return null;message.extra??={};message.extra.fields_anchor??=crypto.randomUUID();return message.extra.fields_anchor;
};
const validAnchors=()=>ctx().chat.filter(message=>!message.extra?.fields_invalidated).map(message=>message.extra?.fields_anchor).filter(Boolean);
const queue=task=>{
    const pending=chain.catch(()=>{}).then(task);chain=pending.catch(()=>{});return pending;
};
async function persist(){
    ctx().chatMetadata[KEY]=view.reference;await ctx().saveChat();
}
function fail(error){
    blocked=error.message;ctx().stopGeneration();
    document.querySelector('#fields-status')?.replaceChildren(document.createTextNode(`存档对账失败，生成已停止：${blocked}`));
}
function render(){
    const pending=renderMessages(ctx(),labels,feedback);
    const box=document.querySelector('#fields-pending');if(!box)return;
    box.replaceChildren();box.hidden=!pending.length;
    for(const notice of pending){const line=document.createElement('p');line.textContent=notice.text;box.append(line);}
}
function actionError(message){
    const box=document.querySelector('#fields-error');if(box){box.textContent=message;box.hidden=false;}
}
// SillyTavern catches errors thrown by event listeners and creates a new abort
// controller after GENERATION_STARTED. Guard the generation transport as well
// as stopping its UI; otherwise a failed reconcile can still send a request.
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,options){
    const url=new URL(typeof input==='string'?input:input.url,location.origin);
    if(active()&&blocked&&url.pathname==='/api/backends/chat-completions/generate')throw new Error(`已阻止生成：${blocked}`);
    return originalFetch(input,options);
};
async function load(){
    if(!active()){view=null;loadedChat=null;return;}
    if(view&&loadedChat===ctx().chatId)return;
    reviewTurn=null;
    const chatId=ctx().chatId,reference=ctx().chatMetadata[KEY];
    if(reference?.format!==2){view=null;loadedChat=chatId;labels={};feedback=[];blocked=null;turnStart=null;return;}
    const next=await api('read',{campaignId:reference.campaignId});
    if(ctx().chatId!==chatId)return;
    view=next.document.releaseVersion===1?next:null;loadedChat=chatId;blocked=null;
    if(view)await persist();else{labels={};feedback=[];turnStart=null;}
    indexedChat=null;indexedMessages=[];
}
async function syncHistory(){
    const chat=ctx().chat;if(indexedChat!==ctx().chatId){indexedChat=ctx().chatId;indexedMessages=[];}
    let start=0;while(start<Math.min(chat.length,indexedMessages.length)&&chat[start]===indexedMessages[start])start++;
    if(start===chat.length&&chat.length===indexedMessages.length)return;
    await api('sync-index',{campaignId:view.reference.campaignId,start,messages:chat.slice(start),total:chat.length});
    indexedMessages=[...chat];
}
async function refresh(){
    if(!active()){document.body.classList.remove('fields-play-active');ctx().setExtensionPrompt(KEY,'',1,0);document.querySelector('#fields-toolbar')?.remove();return;}
    await load();
    document.body.classList.toggle('fields-play-active',!!view);
    if(!view){
        ctx().setExtensionPrompt(KEY,'',1,0);
        document.querySelector('#fields-toolbar')?.remove();
        const bar=document.createElement('div');bar.id='fields-toolbar';
        const status=document.createElement('span');status.id='fields-status';status.textContent='当前聊天尚未启用新版';bar.append(status);
        const button=document.createElement('button');button.textContent='在副本上启用新版';
        button.onclick=async()=>{button.disabled=true;try{
            const sourceChat=ctx().chatId;
            const copy=await api('enable-copy',{character:ctx().characters[ctx().characterId].avatar.replace(/\.png$/,''),chatId:sourceChat});
            if(ctx().chatId!==sourceChat)throw new Error(`副本已创建：${copy.chatId}，请从聊天列表打开`);
            await ctx().openCharacterChat(copy.chatId);
        }catch(error){status.textContent=error.message;button.disabled=false;}};
        bar.append(button);(document.querySelector('#sheld')??document.querySelector('#chat')?.parentElement)?.prepend(bar);return;
    }
    await syncHistory();
    const query=document.querySelector('#send_textarea')?.value||[...ctx().chat].reverse().find(message=>message.is_user)?.mes||'';
    const scene=await api('scene',{campaignId:view.reference.campaignId,query});
    labels=scene.labels??{};
    feedback=(await api('feedback',{campaignId:view.reference.campaignId})).events;
    ctx().setExtensionPrompt(KEY,scene.scene,1,0,false,0);
    let bar=document.querySelector('#fields-toolbar');
    if(!bar?.querySelector('#fields-pending')){
        bar?.remove();
        bar=document.createElement('div');bar.id='fields-toolbar';
        const status=document.createElement('span');status.id='fields-status';bar.append(status);
        const book=document.createElement('button');book.textContent='世界账本';book.onclick=showBook;bar.append(book);
        const reviewLabel=document.createElement('label'),reviewToggle=document.createElement('input');reviewToggle.type='checkbox';reviewToggle.id='fields-consistency-toggle';reviewToggle.checked=ctx().chatMetadata.fields_consistency_enabled!==false;
        reviewToggle.onchange=async()=>{ctx().chatMetadata.fields_consistency_enabled=reviewToggle.checked;await ctx().saveChat();};reviewLabel.append(reviewToggle,document.createTextNode('回复审查'));bar.append(reviewLabel);
        const repair=document.createElement('button');repair.textContent='重新对账';repair.onclick=()=>queue(async()=>{try{view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});blocked=null;await persist();await refresh();}catch(error){fail(error);}});bar.append(repair);
        const error=document.createElement('div');error.id='fields-error';error.setAttribute('role','alert');error.hidden=true;bar.append(error);
        const pending=document.createElement('div');pending.id='fields-pending';pending.setAttribute('role','status');pending.setAttribute('aria-live','polite');pending.hidden=true;bar.append(pending);
        (document.querySelector('#sheld')??document.querySelector('#chat')?.parentElement)?.prepend(bar);
    }
    const p=view.document.state.player;
    document.querySelector('#fields-consistency-toggle').checked=ctx().chatMetadata.fields_consistency_enabled!==false;
    document.querySelector('#fields-status').textContent=blocked?`生成已停止：${blocked}`:`${scene.scene.split('\n')[0].replace('【时间】','')} · ${p.coins}铜 · 生命${p.hp}/${p.maxHp} · 魔力${p.mp}/${p.maxMp}`;
    render();
}
async function execute(tool,args,eventId=crypto.randomUUID(),reviewId=null){
    return queue(async()=>{
        let sent=false,committed=false;
        try{
            await load();if(blocked)throw new Error(blocked);if(!view)throw new Error('请先在副本上启用新版');
            const startMinute=turnStart??view.document.state.minute;
            const currentUser=[...ctx().chat].reverse().find(message=>message.is_user)?.mes??'';
            if(isOutOfCharacter(currentUser)&&tool!=='world_turn')throw new Error('场外提问不推进时间或写入世界状态');
            document.querySelector('#fields-error')?.setAttribute('hidden','');
            sent=true;
            const result=await api('execute',{campaignId:view.reference.campaignId,tool,args,eventId,anchor:anchor(),expectedSequence:view.reference.sequence,...(reviewId?{reviewId}:{})});committed=true;
            view=await api('read',{campaignId:view.reference.campaignId});
            await persist();await refresh();return toolResultWithClock(result.result,{startMinute,minute:view.document.state.minute});
        }catch(error){
            const uncertain=committed||(sent&&!error.rejected);
            const text=committed?`行动已保存，显示更新失败：${error.message}`:uncertain?`执行结果尚未确认，请重新对账：${error.message}`:`操作未完成：${error.message}`;
            actionError(text);if(uncertain)fail(new Error(text));return {ok:false,error:text};
        }
    });
}
for(const definition of toolDefinitions()){
 const {name,description,parameters}=definition.function;
 ctx().registerFunctionTool({name,displayName:name,description,parameters,formatMessage:()=>'',
  shouldRegister:()=>active()&&!!view&&mode!=='quiet'&&!blocked,
  action:async args=>{
   await load();if(!view)throw new Error('请先在副本上启用新版');
   if(name==='world_read')return JSON.stringify(readStateSection(view.document.state,args.section));
   if(name==='world_search')return api('search',{campaignId:view.reference.campaignId,...args});
   if(name==='world_catalog')return lookupToolResult(()=>api('catalog',{campaignId:view.reference.campaignId,...args}));
   return execute(name,args);
  }});
}
function showBook(){
    const dialog=document.createElement('dialog');dialog.id='fields-dialog';const title=document.createElement('h2');title.textContent='世界账本';dialog.append(title);
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(close);
    const state=view.document.state,p=state.player,name=id=>labels[id]??'未命名对象';
    const lines=[`${p.name} · ${p.level}级 · ${p.status}`,`钱袋：${p.coins}铜`,
        `生命：${p.hp}/${p.maxHp}　魔力：${p.mp}/${p.maxMp}`,`经验：${p.xp}　待分配属性点：${p.freeAttributePoints??0}`,
        Object.entries(p.attributes??{}).map(([key,value])=>`${key} ${value}`).join('　'),'行囊',
        ...Object.entries(state.inventory).map(([id,item])=>`${name(id)} × ${item.quantity}${item.durability!==undefined?` · 耐久 ${item.durability}`:''}`),
        ...Object.entries(state.skills??{}).map(([id,skill])=>`${name(id)} · 熟练度 ${skill.proficiency}`),
        ...Object.values(state.records??{}).filter(row=>row.category==='debt'&&row.debtor==='player').map(row=>`欠款：${name(row.creditor)} · 未还 ${row.amount-row.paid}铜 · ${row.status}${row.status==='待偿还'?` · ${Math.max(0,row.deadline-state.minute)}分钟后到期`:''}`),
        ...Object.values(state.records??{}).filter(row=>row.category==='contract'&&row.room&&row.parties?.includes('player')).map(row=>`住宿：${row.name} · ${row.status}${row.status==='有效'?` · ${Math.max(0,row.expires-state.minute)}分钟后到期`:''}`),
        ...Object.values(state.obligations??{}).map(row=>`约定：${row.content} · ${row.status}`),
        ...Object.values(state.quests??{}).map(row=>`任务：${row.content??row.name} · ${row.status}`)];
    for(const line of lines){
        const paragraph=document.createElement('p');paragraph.textContent=line;dialog.append(paragraph);
    }
    document.body.append(dialog);dialog.showModal();
}
async function reconcile(type,_options,dryRun){
    if(!active()||dryRun)return;mode=type;
    return queue(async()=>{
        try{
            await load();if(!view)throw new Error('请先在副本上启用新版');if(blocked)throw new Error(blocked);
            if(['regenerate','swipe'].includes(type)){
                view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors(),excludeAnchor:anchor()});await persist();
            }
            const currentAnchor=anchor();
            if(!reviewTurn||reviewTurn.anchor!==currentAnchor||reviewTurn.completed||['regenerate','swipe'].includes(type)){
                turnStart=view.document.state.minute;
                const user=[...ctx().chat].reverse().find(message=>message.is_user);
                reviewTurn={...await api('review/begin',{campaignId:view.reference.campaignId,anchor:currentAnchor,playerText:user?.mes??'',expectedSequence:view.reference.sequence,enabled:ctx().chatMetadata.fields_consistency_enabled!==false}),anchor:currentAnchor,chatId:ctx().chatId};
            }
            await refresh();
        }catch(error){fail(error);}
    });
}
async function onDeleted(){
    if(!active())return;return queue(async()=>{try{await load();if(!view)return;view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});await persist();await refresh();}catch(error){fail(error);}});
}
async function onEdited(index){
    const message=ctx().chat[index];if(!active()||!message?.is_user)return;
    await load();if(!view)return;
    for(let i=index;i<ctx().chat.length;i++){ctx().chat[i].extra??={};ctx().chat[i].extra.fields_invalidated=true;}
    message.extra.fields_anchor=crypto.randomUUID();message.extra.fields_invalidated=false;
    indexedMessages=indexedMessages.slice(0,index);
    await onDeleted();if(view)await api('edit-index',{campaignId:view.reference.campaignId,index,message});
}
async function afterReply(index){
    if(!active()||!view||mode==='quiet'||blocked)return;const message=ctx().chat[index];
    if(!message||message.is_user||message.is_system||message.extra?.tool_invocations||turnStart===null)return;
    if(message.extra?.fields_turn)return;
    if(reviewing.has(message))return reviewing.get(message);
    const pending=(async()=>{
        const user=[...ctx().chat].reverse().find(message=>message.is_user),session=reviewTurn,chatId=ctx().chatId;
        const prose=document.querySelector(`.mes[mesid="${index}"] .mes_text`);if(prose)prose.hidden=true;
        message.extra??={};
        try{
            if(!session||session.chatId!==chatId||session.anchor!==anchor())throw new Error('本轮审查快照缺失，尾注未提交');
            const review=await api('review/reply',{campaignId:view.reference.campaignId,token:session.token,draft:message.mes,query:user?.mes??'',expectedSequence:view.reference.sequence});
            if(chatId!==ctx().chatId||session!==reviewTurn)throw new Error('审查期间聊天已切换，尾注未提交');
            message.extra.fields_consistency=review;
            message.mes=review.text;
            if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id))message.swipes[message.swipe_id]=message.mes;
            ctx().updateMessageBlock?.(index,message);
            if(!review.canCommit){actionError(review.feedback);await ctx().saveChat();render();return;}
            const state=view.document.state;
            const parsed=parseTurn(message.mes,{location:state.location,startMinute:turnStart,minute:state.minute,
                present:Object.entries(state.npcs).filter(([,npc])=>npc.location===state.location&&!npc.scheduleTravel&&!npc.cognitionTravel).map(([id])=>id),outOfCharacter:isOutOfCharacter(user?.mes??'')});
            const result=await execute('world_turn',parsed.args,`turn_${session.anchor}`,review.reviewId);
            if(result.ok===false){actionError(result.error);return;}
            session.completed=true;
            message.extra.fields_turn={valid:parsed.valid,warning:parsed.warning??null};
            if(review.feedback)actionError(review.feedback);
            await ctx().saveChat();render();
        }catch(error){message.extra.fields_consistency={status:'unverified',verified:false,original:message.mes,feedback:error.message};if(chatId===ctx().chatId){actionError(`回复未验证：${error.message}。已完成的行动保留。`);await ctx().saveChat();render();}}
        finally{if(prose)prose.hidden=false;}
    })();reviewing.set(message,pending);return pending;
}
const context=ctx();
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,({chat})=>{
    if(active()&&view&&!blocked)injectToolExamples(chat,ctx().characters[ctx().characterId]);
});
context.eventSource.on(context.eventTypes.APP_READY,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_CHANGED,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_LOADED,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.GENERATION_STARTED,reconcile);
context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS,()=>{if(blocked)ctx().stopGeneration();});
context.eventSource.on(context.eventTypes.MESSAGE_SENT,()=>{if(active()&&view&&loadedChat===ctx().chatId)anchor();});
context.eventSource.on(context.eventTypes.MESSAGE_DELETED,onDeleted);
context.eventSource.on(context.eventTypes.MESSAGE_EDITED,onEdited);
context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED,afterReply);
for(const event of [context.eventTypes.CHARACTER_MESSAGE_RENDERED,context.eventTypes.MESSAGE_UPDATED])if(event)context.eventSource.on(event,()=>{if(active()&&view)render();});
context.eventSource.on(context.eventTypes.GENERATION_ENDED,()=>{mode='normal';});
window.infiniteFieldsV2={load,refresh,execute,reconcile,onEdited,onDeleted,get view(){return view;},get blocked(){return blocked;}};
