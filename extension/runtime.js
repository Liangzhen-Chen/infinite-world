import { getContext } from '../../../extensions.js';
import { parseTurn } from './turn.mjs';
const KEY='infinite_fields';
const ctx=()=>getContext();
const active=()=>ctx().characters[ctx().characterId]?.name==='无限原野·世界主持人';
let view=null,loadedChat=null,blocked=null,chain=Promise.resolve(),mode='normal',turnStart=null;
let indexedChat=null,indexedMessages=[];
const api=async(endpoint,body={})=>{
    const response=await fetch(`/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error??`本地存档请求失败${response.status}`);return data;
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
    const chatId=ctx().chatId,reference=ctx().chatMetadata[KEY];
    const next=reference?.format===2 ? await api('read',{campaignId:reference.campaignId}) : await api('migrate',{character:ctx().characters[ctx().characterId].avatar.replace(/\.png$/,''),chatId});
    if(ctx().chatId!==chatId)return;
    view=next;loadedChat=chatId;blocked=null;await persist();
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
    if(!active()){ctx().setExtensionPrompt(KEY,'',1,0);document.querySelector('#fields-toolbar')?.remove();return;}
    await load();if(!view)return;
    await syncHistory();
    const query=document.querySelector('#send_textarea')?.value||[...ctx().chat].reverse().find(message=>message.is_user)?.mes||'';
    const scene=await api('scene',{campaignId:view.reference.campaignId,query});
    ctx().setExtensionPrompt(KEY,scene.scene,1,0,false,0);
    let bar=document.querySelector('#fields-toolbar');
    if(!bar){
        bar=document.createElement('div');bar.id='fields-toolbar';
        const status=document.createElement('span');status.id='fields-status';bar.append(status);
        const book=document.createElement('button');book.textContent='世界账本';book.onclick=showBook;bar.append(book);
        const repair=document.createElement('button');repair.textContent='重新对账';repair.onclick=()=>queue(async()=>{try{view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});blocked=null;await persist();await refresh();}catch(error){fail(error);}});bar.append(repair);
        (document.querySelector('#sheld')??document.querySelector('#chat')?.parentElement)?.prepend(bar);
    }
    const p=view.document.state.player;
    document.querySelector('#fields-status').textContent=blocked?`生成已停止：${blocked}`:`${scene.scene.split('\n')[0].replace('【时间】','')} · ${p.coins}铜 · 生命${p.hp}/${p.maxHp} · 魔力${p.mp}/${p.maxMp}`;
}
async function execute(tool,args,eventId=crypto.randomUUID()){
    return queue(async()=>{
        try{
            await load();if(blocked)throw new Error(blocked);
            const currentUser=[...ctx().chat].reverse().find(message=>message.is_user)?.mes??'';
            if(/^[（(]场外[）)]/.test(currentUser)&&tool!=='world_turn')throw new Error('场外提问不推进时间或写入世界状态');
            const result=await api('execute',{campaignId:view.reference.campaignId,tool,args,eventId,anchor:anchor(),expectedSequence:view.reference.sequence});
            view=await api('read',{campaignId:view.reference.campaignId});
            await persist();await refresh();return result.result;
        }catch(error){return {ok:false,error:error.message,note:'核对存档后再叙述结果，不可将失败操作写成成功。'};}
    });
}
const str={type:'string'},int={type:'integer'},bool={type:'boolean'};
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const register=(name,description,properties,required)=>ctx().registerFunctionTool({name,displayName:name,description,parameters:object(properties,required),
    action:args=>execute(name,args),formatMessage:()=>'',shouldRegister:()=>active()&&mode!=='quiet'&&!blocked});
register('world_trade','双方必须在场，库存和钱足够；价钱与物品实际转移。住宿用service住宿和days，房价由引擎确定。',{buyer:str,seller:str,item:str,quantity:int,unitPrice:int,service:str,days:int},['seller']);
register('world_move','按路线和季节移动玩家与同行者，实际计时扣路费。',{destination:str,mode:{type:'string',enum:['walk','horse','cart','boat']}},['destination']);
register('world_time','等待、工作、睡眠等耗时，触发日结。',{minutes:int,activity:str},['minutes']);
register('world_check','d20修正由属性技能计算，情境修正限±5，需理由。',{attribute:str,skill:str,difficulty:int,context:int,contextReason:str,advantage:bool,disadvantage:bool},['difficulty']);
register('world_cast','仅已学法术，扣魔力与材料，判定失败，计熟练度。',{spell:str,target:str},['spell','target']);
register('world_learn','引用在场且有资格的导师，付费花时间后学习。',{entity:str,source:str,kind:str},['entity','source']);
register('world_practice','有意义的练习、每日上限、重复递减与阶段突破。',{skill:str,target:str,gain:int,breakthroughSource:str},['skill']);
register('world_profession','正式职业需注册导师认证，并校验费用、等级与名额。',{profession:str,teacher:str},['profession','teacher']);
register('world_relation','按具体事件变化关系，基础人设不可覆盖。',{npc:str,eventType:str,sourceEvent:str,trustDelta:int},['npc','eventType','sourceEvent']);
register('world_promise','带路承诺加入同行，送货付款到期执行或记录违约。',{promisor:str,promisee:str,type:str,content:str,destination:str,deadline:int,item:str,quantity:int,coins:int},['promisor','type','content']);
register('world_remember','长期事实保留，使用实体编号，不写系统用语。',{subject:str,key:str,content:str,source:str,keywords:{type:'array',items:str}},['subject','key','content']);
register('world_turn','回合工具原型，与尾注方案比较合规率；仅补尚未推进的时间。',{startMinute:int,minutes:int,location:str,present:{type:'array',items:str},outOfCharacter:bool},['startMinute']);
register('world_combat','结算一次近身交锋，数值由引擎计算，不可自行指定伤害。',{target:str,weapon:str},['target']);
register('world_craft','按已登记配方扣材料、花时间、检定并记录署名成品。',{recipe:str},['recipe']);
register('world_research','记录构想与多日研究，投入资金、时间，失败也保留记录。',{operation:str,name:str,concept:str,skills:{type:'array',items:str},project:str,coins:int,minutes:int},['operation']);
register('world_settlement','动用公共物资需有效授权，工程实际扣料并计工期。',{operation:str,settlement:str,authorization:str,name:str,wood:int,stone:int,days:int,beneficiaries:{type:'array',items:str}},['operation','settlement','authorization']);
register('world_quest','发布任务需额度和托管报酬，完成条件可验证，不重复奖励。',{operation:str,publisher:str,personal:bool,grade:str,reward:int,content:str,quest:str,objective:object({type:str,item:str,quantity:int,location:str,project:str},['type'])},['operation']);
register('world_create','登记原创的新人物或组织，不能凭空制造物品、建筑或法术。',{type:str,name:str,project:str,data:object({age:int,occupation:str,notes:str},[])},['type','name','data']);
ctx().registerFunctionTool({name:'world_search',displayName:'查阅旧事',description:'检索长期事实和原始聊天，别名繁简与近义词归一。',parameters:object({query:str,limit:int},['query']),
    action:async args=>{await load();return api('search',{campaignId:view.reference.campaignId,...args});},shouldRegister:()=>active()&&!blocked});
ctx().registerFunctionTool({name:'world_read',displayName:'查看状态',description:'读取玩家、行囊、人物或约定，返回长度有限。',parameters:object({section:str}),
    action:async args=>{await load();const state=view.document.state;const selected=args.section?state[args.section]:{player:state.player,location:state.location};return JSON.stringify(selected).slice(0,8000);},shouldRegister:()=>active()&&!blocked});
function showBook(){
    const dialog=document.createElement('dialog');dialog.id='fields-dialog';const title=document.createElement('h2');title.textContent='世界账本';dialog.append(title);
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(close);
    for(const line of [JSON.stringify(view.document.state.player),...Object.entries(view.document.state.inventory).map(([id,item])=>`${id} × ${item.quantity}`)]){
        const paragraph=document.createElement('p');paragraph.textContent=line;dialog.append(paragraph);
    }
    const note=document.createElement('p');note.textContent='界面仍在重构，当前显示已提交的账目。';dialog.append(note);document.body.append(dialog);dialog.showModal();
}
async function reconcile(type,_options,dryRun){
    if(!active()||dryRun)return;mode=type;
    return queue(async()=>{
        try{
            await load();if(blocked)throw new Error(blocked);
            if(['regenerate','swipe'].includes(type)){
                view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors(),excludeAnchor:anchor()});await persist();
            }
            turnStart=view.document.state.minute;await refresh();
        }catch(error){fail(error);}
    });
}
async function onDeleted(){
    if(!active())return;return queue(async()=>{try{await load();view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});await persist();await refresh();}catch(error){fail(error);}});
}
async function onEdited(index){
    const message=ctx().chat[index];if(!active()||!message?.is_user)return;
    for(let i=index;i<ctx().chat.length;i++){ctx().chat[i].extra??={};ctx().chat[i].extra.fields_invalidated=true;}
    message.extra.fields_anchor=crypto.randomUUID();message.extra.fields_invalidated=false;
    indexedMessages=indexedMessages.slice(0,index);
    await onDeleted();await api('edit-index',{campaignId:view.reference.campaignId,index,message});
}
async function afterReply(index){
    if(!active()||mode==='quiet'||blocked)return;const message=ctx().chat[index];
    if(!message||message.is_user||message.is_system||message.extra?.tool_invocations||turnStart===null)return;
    const user=[...ctx().chat].reverse().find(message=>message.is_user);
    const parsed=parseTurn(message.mes,{location:view.document.state.location,startMinute:turnStart,outOfCharacter:/^[（(]场外[）)]/.test(user?.mes??'')});
    const result=await execute('world_turn',parsed.args,`turn_${anchor()}`);
    if(result.ok===false)fail(new Error(result.error));
    message.extra??={};message.extra.fields_turn={valid:parsed.valid,warning:parsed.warning??null};
}
const context=ctx();
context.eventSource.on(context.eventTypes.APP_READY,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_CHANGED,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_LOADED,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.GENERATION_STARTED,reconcile);
context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS,()=>{if(blocked)ctx().stopGeneration();});
context.eventSource.on(context.eventTypes.MESSAGE_SENT,()=>{if(active())anchor();});
context.eventSource.on(context.eventTypes.MESSAGE_DELETED,onDeleted);
context.eventSource.on(context.eventTypes.MESSAGE_EDITED,onEdited);
context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED,afterReply);
context.eventSource.on(context.eventTypes.GENERATION_ENDED,()=>{mode='normal';});
window.infiniteFieldsV2={load,refresh,execute,reconcile,onEdited,onDeleted,get view(){return view;},get blocked(){return blocked;}};
