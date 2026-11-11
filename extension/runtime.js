import { getContext } from '../../../extensions.js';
import { parseTurn, toolResultWithClock, modelToolResult, lookupToolResult, actionCompletion, modelToolAllowed, actionModes, turnModelAccess, aiProfile } from './turn.mjs';
import { readStateSection } from './state-read.mjs';
import { toolDefinitions, modelActionCatalog, builderToolCall } from './tools.mjs';
import { renderMessages } from './message-view.mjs';
import { renderLedger } from './ledger-view.mjs';
import { isOutOfCharacter, injectToolExamples } from './prompt.mjs';
import {registerPanel,registerSettingsSection,setPanelContext,mountPanelButtons,loadUIModules} from './ui-shell.mjs';
import {initializeSettings,getSettings,updateSettings,subscribeSettings} from './ui-settings.mjs';
import {renderTopbar} from './topbar.mjs';
import {ambientAudio,registerUI as registerAudioUI} from './ambient-audio.mjs';
import {updateBackground,clearBackground} from './background-view.mjs';
import {finishContractTurn,turnFactsPrompt,publishedTurnText} from './turn-contract.mjs';
const KEY='infinite_fields';
const ctx=()=>getContext();
const getActionModes=()=>actionModes(getSettings());
const active=()=>ctx().characters[ctx().characterId]?.name==='无限原野·世界主持人';
let view=null,loadedChat=null,blocked=null,chain=Promise.resolve(),mode='normal',turnStart=null;
let indexedChat=null,indexedMessages=[];
let labels={},feedback=[],ledgerTime='';
let reviewTurn=null;
let controlledRequest=null,savedStreaming;
const WAITING='叙述正在核对；已完成的行动保留，请查看事件流。';
const reviewCurtain=document.createElement('style');reviewCurtain.textContent='.fields-review-active .mes:not(.fields-review-visible) .mes_text{visibility:hidden!important}';document.head.append(reviewCurtain);
function hideUnreviewed(){
    for(const element of document.querySelectorAll('.mes'))element.classList.add('fields-review-visible');
    document.body.classList.add('fields-review-active');
    const settings=ctx().chatCompletionSettings;
    if(settings&&savedStreaming===undefined){savedStreaming=settings.stream_openai;settings.stream_openai=false;}
}
function restoreStreaming(){
    if(savedStreaming!==undefined&&ctx().chatCompletionSettings)ctx().chatCompletionSettings.stream_openai=savedStreaming;
    savedStreaming=undefined;
}
async function controlledGenerate(body,label){
    if(typeof ctx().generateRawData!=='function')throw Error('宿主没有提供受控生成接口');
    if(controlledRequest)throw Error('已有受控工具请求正在进行');
    const settings=ctx().chatCompletionSettings;
    if(typeof ctx().getTokenCountAsync==='function'&&Number.isFinite(settings?.openai_max_context)){
        const tokens=await ctx().getTokenCountAsync(JSON.stringify({messages:body.messages,tools:body.tools}));
        if(tokens>settings.openai_max_context-(settings.openai_max_tokens??0))throw Error('工具补跑上下文超限，保留本轮安全模板');
    }
    controlledRequest=body;const started=Date.now();
    try{
        const response=await ctx().generateRawData({prompt:body.messages,api:'openai'});
        return {...response,measurement:{label,usage:response.usage??null,latencyMs:Date.now()-started}};
    }finally{controlledRequest=null;}
}
const reviewing=new WeakMap(),reviewEdits=new WeakMap();
let historyModule=null;
let startTransition=false;
let actionSuggestion=null;
registerAudioUI({registerSettingsSection});
ambientAudio.onStatus=()=>updateAudioControls(getSettings());
ambientAudio.applySettings(getSettings());
subscribeSettings(settings=>ambientAudio.applySettings(settings));
const unlockAudio=(clear=false)=>{if(clear)ambientAudio.stop();return ambientAudio.unlock();};
window.addEventListener('pagehide',()=>{void ambientAudio.close();});
registerPanel({id:'ledger',title:'世界账本',render:(container,data)=>{
    const book=document.createElement('div');book.id='fields-ledger-content';container.replaceChildren(book);
    if(data.view)renderLedger(book,data.view.document.state,data.labels,data.feedback,data.ledgerTime);
}});
initializeSettings();
const api=async(endpoint,body={})=>{
    const response=await fetch(`/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:{...ctx().getRequestHeaders(),'X-AI-Profile':aiProfile(getSettings())},body:JSON.stringify(body)});
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
    document.querySelector('#fields-dialog')?.remove();
    blocked=error.message;ctx().stopGeneration();
    document.querySelector('#fields-status')?.replaceChildren(document.createTextNode(`存档对账失败，生成已停止：${blocked}`));
}
function render(){
    setPanelContext({view,labels,feedback,ledgerTime,getChatContext:ctx,act,preview:previewUIAction,actionSuggestion,clearActionSuggestion:()=>{actionSuggestion=null;},api:(endpoint,body={})=>api(endpoint,{...body,campaignId:view?.reference.campaignId})});
    const pending=renderMessages(ctx(),labels,feedback);
    for(const [index,message]of ctx().chat.entries())if(message.extra?.fields_narration_pending&&message.extra.fields_pending_safe_text){
        const element=document.querySelector(`.mes[mesid="${index}"]`),text=element?.querySelector('.mes_text');
        if(text){text.hidden=false;text.textContent=message.extra.fields_pending_safe_text;element.classList.add('fields-review-visible');}
    }
    for(const [index,message]of ctx().chat.entries())if(message.extra?.fields_consistency?.status==='pending')renderCandidates(message,message.extra.fields_consistency,index);
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
    if(active()&&view&&getActionModes().intent==='off'&&getActionModes().narration==='off'&&url.pathname==='/api/backends/chat-completions/generate')throw new Error('已关闭输入理解和叙述，请使用可做之事面板');
    const isCompletion=url.pathname==='/api/backends/chat-completions/generate';
    const requestBody=isCompletion&&options?.body?JSON.parse(options.body):null;
    const generatingReply=active()&&view&&mode!=='quiet'&&requestBody?.type!=='quiet'&&isCompletion;
    const session=reviewTurn;
    if(generatingReply&&options?.body){
        if(requestBody.stream)throw Error('本回合必须使用非流式生成，待审正文不能提前展示');
        if(reviewsPending)throw Error('本回合仍在核对，不能开始另一轮生成');
    }
    const response=await originalFetch(input,options);
    if(!generatingReply||!response.ok)return response;
    if(session&&(session!==reviewTurn||session.chatId!==ctx().chatId))throw Error('生成期间回合来源已变化，已丢弃旧回复');
    const data=await response.json();
    for(const choice of data.choices??[]){
        const message=choice.message;if(!message)continue;
        if(session&&session===reviewTurn)session.toolReply=!!message.tool_calls?.length;
        if(!message.tool_calls?.length&&session&&session===reviewTurn)session.draft=message.content??'';
        // The host can save/render the response before MESSAGE_RECEIVED. Never
        // hand it unreviewed prose, including intermediary tool-call prose.
        message.content=message.tool_calls?.length?null:WAITING;
        delete message.reasoning_content;
    }
    return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json'}});
};
async function load(){
    if(!active()){ambientAudio.stop();view=null;loadedChat=null;return;}
    if(view&&loadedChat===ctx().chatId)return;
    ambientAudio.stop();
    reviewTurn=null;
    actionSuggestion=null;
    document.querySelector('#fields-dialog')?.remove();
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
    if(!active()){ambientAudio.stop();clearBackground();restoreStreaming();document.querySelector('#fields-dialog')?.remove();document.body.classList.remove('fields-play-active','fields-review-active');ctx().setExtensionPrompt(KEY,'',1,0);ctx().setExtensionPrompt(`${KEY}_turn`,'',1,0);document.querySelector('#fields-toolbar')?.remove();return;}
    await load();
    document.body.classList.toggle('fields-play-active',!!view);
    if(!view){
        ambientAudio.stop();
        clearBackground();
        document.querySelector('#fields-dialog')?.remove();
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
    const audioChat=ctx().chatId,audioCampaign=view.reference.campaignId;
    await syncHistory();
    const query=document.querySelector('#send_textarea')?.value||[...ctx().chat].reverse().find(message=>message.is_user)?.mes||'';
    const scene=await api('scene',{campaignId:view.reference.campaignId,query});
    labels=scene.labels??{};
    ledgerTime=scene.scene.split('\n')[0].replace('【时间】','');
    feedback=(await api('feedback',{campaignId:view.reference.campaignId})).events;
    const overview=await api('ui/overview',{campaignId:view.reference.campaignId});
    // Read only the current public location, never the NPC catalogue or memories.
    let audioPlace={};
    try{audioPlace=await api('catalog',{campaignId:audioCampaign,kind:'location',entity:view.document.state.location});}
    catch{ambientAudio.status('场景声音暂未更新');}
    if(ctx().chatId!==audioChat||view?.reference.campaignId!==audioCampaign)return;
    ambientAudio.setScene(`${audioChat}:${audioCampaign}`,overview,audioPlace);
    await loadUIModules(api);
    await updateBackground(view,overview,`${ctx().chatId}:${view.reference.campaignId}`);
    ctx().setExtensionPrompt(KEY,scene.scene,1,0,false,0);
    ctx().setExtensionPrompt(`${KEY}_turn`,reviewTurn?.gate?turnFactsPrompt(reviewTurn.gate):'',1,0,false,0);
    let bar=document.querySelector('#fields-toolbar');
    if(!bar?.querySelector('#fields-pending')){
        bar?.remove();
        bar=document.createElement('div');bar.id='fields-toolbar';
        const status=document.createElement('span');status.id='fields-status';bar.append(status);
        const menu=document.createElement('button');menu.className='fields-menu-toggle';menu.textContent='面板';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-controls','fields-toolbar-actions');
        const actions=document.createElement('div');actions.id='fields-toolbar-actions';
        menu.onclick=()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));actions.classList.toggle('fields-menu-open',open);};bar.append(menu,actions);
        actions.addEventListener('click',event=>{if(event.target.closest('[data-panel]')){menu.setAttribute('aria-expanded','false');actions.classList.remove('fields-menu-open');}});
        const panels=document.createElement('nav');panels.className='fields-panel-buttons';panels.setAttribute('aria-label','世界面板');mountPanelButtons(panels);actions.append(panels);
        const reviewLabel=document.createElement('label'),reviewToggle=document.createElement('input');reviewToggle.type='checkbox';reviewToggle.id='fields-consistency-toggle';reviewToggle.checked=ctx().chatMetadata.fields_consistency_enabled!==false;
        reviewToggle.onchange=async()=>{ctx().chatMetadata.fields_consistency_enabled=reviewToggle.checked;await ctx().saveChat();};reviewLabel.append(reviewToggle,document.createTextNode('回复审查'));actions.append(reviewLabel);
        const repair=document.createElement('button');repair.textContent='重新对账';repair.onclick=()=>queue(async()=>{try{view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});blocked=null;await persist();await refresh();}catch(error){fail(error);}});actions.append(repair);
        const mute=document.createElement('button');mute.id='fields-mute';mute.onclick=()=>updateSettings({muted:!getSettings().muted});actions.append(mute);
        const sound=document.createElement('button');sound.id='fields-sound-enable';sound.textContent='开启声音';sound.onclick=async()=>{await unlockAudio();sound.textContent=ambientAudio.unlocked?'声音已开启':'重试声音';sound.title=ambientAudio.message;};actions.append(sound);
        const volume=document.createElement('input');volume.id='fields-volume';volume.type='range';volume.min=0;volume.max=100;volume.setAttribute('aria-label','音量');volume.oninput=()=>updateSettings({volume:Number(volume.value)});actions.append(volume);
        const error=document.createElement('div');error.id='fields-error';error.setAttribute('role','alert');error.hidden=true;bar.append(error);
        const pending=document.createElement('div');pending.id='fields-pending';pending.setAttribute('role','status');pending.setAttribute('aria-live','polite');pending.hidden=true;bar.append(pending);
        (document.querySelector('#sheld')??document.querySelector('#chat')?.parentElement)?.prepend(bar);
    }
    document.querySelector('#fields-consistency-toggle').checked=ctx().chatMetadata.fields_consistency_enabled!==false;
    renderTopbar(document.querySelector('#fields-status'),overview,blocked);
    for(const {name,color}of overview.qualities)document.body.style.setProperty(`--fields-quality-${name}`,color);
    updateAudioControls(getSettings());
    render();
}
async function execute(tool,args,eventId=crypto.randomUUID(),reviewId=null){
    return queue(async()=>{
        let sent=false,committed=false;
        try{
            await load();if(blocked)throw new Error(blocked);if(!view)throw new Error('请先在副本上启用新版');
            // An explicit action after publication is no longer part of that
            // sealed chat turn. Keep it independent, like an interface action.
            const detached=tool!=='world_turn'&&reviewTurn?.completed===true;
            if(tool!=='world_turn'&&!detached)await ensureReviewTurn();
            const startMinute=turnStart??view.document.state.minute;
            const currentUser=[...ctx().chat].reverse().find(message=>message.is_user)?.mes??'';
            if(isOutOfCharacter(currentUser)&&tool!=='world_turn')throw new Error('场外提问不推进时间或写入世界状态');
            if(tool!=='world_turn'&&(getActionModes().intent!=='propose'||!modelToolAllowed(tool,getSettings())))throw new Error('当前模式只允许目录建议或本地动作确认');
            document.querySelector('#fields-error')?.setAttribute('hidden','');
            sent=true;
            const result=await api('execute',{campaignId:view.reference.campaignId,tool,args,eventId,anchor:detached?null:anchor(),expectedSequence:view.reference.sequence,...(reviewId?{reviewId}:{})});committed=true;
            view=await api('read',{campaignId:view.reference.campaignId});
            if(!actionCompletion(result).pending&&result.narration?.lines?.length)recordFeed(result.narration.lines);
            ambientAudio.noteAction(result.result,view.document.state.player,tool);
            await persist();await refresh();
            const completion=result.result?.receipt?actionCompletion(result):{};
            return modelToolResult(toolResultWithClock({...result.result,...completion},{startMinute,minute:view.document.state.minute}));
        }catch(error){
            const uncertain=committed||(sent&&!error.rejected);
            const text=committed?`行动已保存，显示更新失败：${error.message}`:uncertain?`执行结果尚未确认，请重新对账：${error.message}`:`操作未完成：${error.message}`;
            actionError(text);if(uncertain)fail(new Error(text));return {ok:false,error:text};
        }
    });
}
// A1 界面动作（06 §6.9）：不经模型，直接按动作 id 交 /execute 的 world_act 确定性结算；不挂在任何聊天消息上（anchor 为空），
// 删改消息的对账不会撤销它。主持人正在回应或审查本回合时先不动手，免得混进那一回合的证据。
let generating=false,reviewsPending=0;
const FEED='fields_event_feed',FEED_LIMIT=40;
// T0: no model is called, so typed text is matched by the local action catalog (AI-01 section 8) instead of being sent to a chat model.
const noModelProfile=()=>active()&&!!view&&getActionModes().intent==='off'&&getActionModes().narration==='off';
async function localTyping(){
    const text=[...ctx().chat].reverse().find(message=>message.is_user)?.mes?.trim();if(!text)return;
    const found=await api('actions',{campaignId:view.reference.campaignId,query:text,limit:5});
    const options=(found.actions??[]).filter(a=>!a.readOnly&&a.id!=='open:proposal').map(a=>a.label??a.id);
    recordFeed(options.length?['本地规则找到这些做法：'+options.join('、')+'。请在可做之事面板选择并确认。']:['本地规则没有找到对应的做法。请打开可做之事面板，或用构造器组合。'],'look');
    await ctx().saveChat();
}
function recordFeed(lines,kind='action'){
    const metadata=ctx().chatMetadata,rows=Array.isArray(metadata[FEED])?metadata[FEED]:[];
    const entry={minute:view?.document.state.minute??null,kind,lines:lines.slice(0,12)};
    metadata[FEED]=[...rows,entry].slice(-FEED_LIMIT);return entry;
}
async function previewUIAction(action,slots={},eventId=`ui_${crypto.randomUUID()}`){
    if(generating||reviewsPending)return {ok:false,error:'主持人正在回应这一轮，等这一轮结束再动手'};
    return queue(async()=>{
        await load();if(blocked)throw new Error(blocked);if(!view)throw new Error('请先在副本上启用新版');
        const campaignId=view.reference.campaignId,current=await api('read',{campaignId});
        const result=await api('propose',{campaignId,...builderToolCall(action,slots),eventId});
        return {...result,startMinute:current.document.state.minute};
    });
}
// 已发出却没有确认完成的界面动作：提交成功但保存/刷新失败，或请求发出后断线。再次点同一动作时复用原事件编号，
// 服务端按编号取回原回执（duplicate），不会再成交一次。成功收尾或被明确拒绝后移除。
const unsettledActs=new Map();
const UNSETTLED_HINT='再点一次会取回这次回执，不会重复成交；也可点“重新对账”。';
async function act(action,slots={},confirmation={}){
    if(generating||reviewsPending)return {ok:false,error:'主持人正在回应这一轮，等这一轮结束再动手',lines:[]};
    return queue(async()=>{
        const key=`${action}|${JSON.stringify(slots)}`;
        const owed=unsettledActs.get(key);
        let eventId=owed?.eventId??null,sent=false,committed=false,result=null,lines=[],completion={ok:true},fed=owed?.fed===true;
        try{
            await load();if(blocked)throw new Error(blocked);if(!view)throw new Error('请先在副本上启用新版');
            const campaignId=view.reference.campaignId;
            if(confirmation.expectedSequence!==undefined&&!owed){
                const current=await api('read',{campaignId});
                if(current.reference.sequence!==confirmation.expectedSequence)return {ok:false,stale:true,error:'此刻情形已变化，请重新预览后再确认',lines:[]};
                view=current;
            }
            const call=builderToolCall(action,slots);
            const resolved=call.tool==='world_propose'?{tool:call.tool}:await api('actions',{campaignId,resolve:{action,slots}});
            if(resolved.projection){const here=await api('actions',{campaignId});recordFeed(here.scene,'look');await ctx().saveChat();return {ok:true,lines:here.scene};}
            if(resolved.clientRead)return {ok:true,read:readStateSection(view.document.state,resolved.args.section,resolved.args.npc),lines:[]};
            eventId??=confirmation.eventId??`ui_${crypto.randomUUID()}`;
            const uiReview=!owed&&getActionModes().narration==='async'?await api('review/begin',{campaignId,anchor:null,eventId,playerText:`界面行动：${action} ${JSON.stringify(slots)}`,expectedSequence:view.reference.sequence,enabled:ctx().chatMetadata.fields_consistency_enabled!==false,captureSearch:true}):null;
            sent=true;
            result=await api('execute',{campaignId,...call,eventId,anchor:null,expectedSequence:owed?undefined:view.reference.sequence});
            committed=true;
            completion=actionCompletion(result);
            lines=completion.pending?['行动仍在等待裁决，尚未完成。']:(result.narration?.lines?.length?result.narration.lines:owed?.lines)??[];
            unsettledActs.set(key,{eventId,lines,fed});
            view=await api('read',{campaignId});
            const entry=!completion.pending&&!fed&&lines.length?recordFeed(lines):null;
            if(entry)fed=true;
            unsettledActs.set(key,{eventId,lines,fed});
            ambientAudio.noteAction(result.result,view.document.state.player,resolved.tool);
            await persist();await refresh();
            unsettledActs.delete(key);
            if(uiReview&&entry){
                entry.eventId=eventId;entry.sequence=view.reference.sequence;
                void narrateUIAction({session:uiReview,campaignId,eventId,sequence:view.reference.sequence,chatId:ctx().chatId,entry});
            }
            return {...completion,lines,result:result.result,eventId,committed:true,uncertain:false};
        }catch(error){
            if(committed){
                // 引擎已记下这次行动，回执照实保留；只是保存/显示没跟上。不当作“没成交”。
                const note=`行动已成交，但保存或显示更新没有完成（${error.message}）。${UNSETTLED_HINT}`;
                return {...completion,lines:[...lines,note],result:result.result,eventId,committed:true,uncertain:false,needsReconcile:true};
            }
            if(sent&&!error.rejected){
                unsettledActs.set(key,{eventId,lines:[],fed});
                return {ok:false,uncertain:true,committed:false,eventId,error:`执行结果尚未确认：${error.message}。${UNSETTLED_HINT}`,lines:[]};
            }
            if(sent)unsettledActs.delete(key);
            return {ok:false,committed:false,uncertain:false,error:error.message,lines:[]};
        }
    });
}
async function narrateUIAction({session,campaignId,eventId,sequence,chatId,entry}){
    reviewsPending++;
    const current=()=>ctx().chatId===chatId&&view?.reference.campaignId===campaignId&&view.reference.sequence===sequence&&ctx().chatMetadata[FEED]?.includes(entry);
    try{
        const gate=await api('review/gate',{campaignId,token:session.token,expectedSequence:sequence});
        if(!current()||gate.status==='pending')return;
        const response=await controlledGenerate({messages:[{role:'system',content:turnFactsPrompt(gate)+`\n仅叙述界面行动 ${eventId} 的真实回执，不执行工具，不追加时间。`}],tool_choice:'none',stream:false,thinking:{type:'disabled'}},'ui-action-narration');
        if(!current())return;
        const choice=response.choices?.[0];if(choice?.finish_reason==='length'||choice?.message?.tool_calls?.length||!choice?.message?.content)return;
        const review=await api('review/reply',{campaignId,token:session.token,expectedSequence:sequence,draft:choice.message.content});
        if(!current())return;
        entry.lines=publishedTurnText(review,gate).replace(/<回合[^>]*>/g,'').split('\n').filter(Boolean).slice(0,12);
        entry.narration={eventId,sequence,status:review.status,measurement:response.measurement};
        await ctx().saveChat();render();
    }catch{/* The already published engine receipt remains authoritative. */}
    finally{reviewsPending=Math.max(0,reviewsPending-1);}
}
async function modelActions(args){
    const result=await api('actions',{campaignId:view.reference.campaignId,target:args.target,query:args.query,limit:12});
    if(getActionModes().intent!=='propose')result.actions=result.actions.filter(a=>a.id!=='open:proposal');
    return JSON.stringify(modelActionCatalog(result));
}
async function modelAct(args){
    const intent=getActionModes().intent;
    if(intent==='off')return {ok:false,error:'自由输入理解已关闭，请使用可做之事面板'};
    if(intent==='match'){
        if(args.action==='open:proposal')return {ok:false,error:'目录匹配模式只推荐已登记动作'};
        const result=await api('actions',{campaignId:view.reference.campaignId,query:args.action,target:args.slots?.target??args.slots?.seller??args.slots?.buyer,limit:1});
        const action=result.actions.find(a=>a.id===args.action&&!a.readOnly);
        if(!action)return {ok:false,error:'请从当前动作目录选择'};
        if(action.blocked)return {ok:false,error:action.blocked};
        actionSuggestion={action,slots:structuredClone(args.slots??{})};render();
        return {ok:true,status:'suggested',instruction:'只是动作建议，尚未执行；请玩家在可做之事面板预览并确认。'};
    }
    if(args.action==='open:proposal'){
        const offered=await api('actions',{campaignId:view.reference.campaignId,query:'open:proposal',limit:1});
        if(!offered.actions.some(a=>a.id==='open:proposal'))return {ok:false,error:'此战役已关闭开放提案，请使用注册动作'};
        const call=builderToolCall(args.action,args.slots??{});return execute(call.tool,call.args);
    }
    const resolved=await api('actions',{campaignId:view.reference.campaignId,resolve:{action:args.action,slots:args.slots??{}}});
    if(resolved.projection)return JSON.stringify({ok:true,here:(await api('actions',{campaignId:view.reference.campaignId})).scene});
    if(resolved.clientRead){
        if(resolved.tool==='world_read')return JSON.stringify(readStateSection(view.document.state,resolved.args.section,resolved.args.npc));
        if(resolved.tool==='world_catalog')return lookupToolResult(()=>api('catalog',{campaignId:view.reference.campaignId,...resolved.args}));
        return lookupToolResult(()=>api('search',{...resolved.args,campaignId:view.reference.campaignId,token:reviewTurn?.token,anchor:anchor(),expectedSequence:view.reference.sequence}));
    }
    return execute('world_act',{action:args.action,slots:args.slots??{}});
}
for(const definition of toolDefinitions()){
 const {name,description,parameters}=definition.function;
 ctx().registerFunctionTool({name,displayName:name,description,parameters,formatMessage:()=>'',
  shouldRegister:()=>active()&&!!view&&mode!=='quiet'&&!blocked&&modelToolAllowed(name,getSettings()),
  action:async args=>{
   await load();if(!view)throw new Error('请先在副本上启用新版');
   if(!modelToolAllowed(name,getSettings()))return {ok:false,error:'当前输入理解模式不允许执行这个工具'};
   if(name==='world_read')return JSON.stringify(readStateSection(view.document.state,args.section,args.npc));
   if(name==='world_search')return lookupToolResult(()=>api('search',{...args,campaignId:view.reference.campaignId,token:reviewTurn?.token,anchor:anchor(),expectedSequence:view.reference.sequence}));
   if(name==='world_catalog')return lookupToolResult(()=>api('catalog',{campaignId:view.reference.campaignId,...args}));
   if(name==='world_actions')return lookupToolResult(()=>modelActions(args));
   if(name==='world_act')return modelAct(args);
   return execute(name,args);
  }});
}
function updateAudioControls(settings){
    const mute=document.querySelector('#fields-mute'),volume=document.querySelector('#fields-volume');
    if(mute){mute.textContent=settings.muted?'取消静音':'静音';mute.setAttribute('aria-pressed',String(settings.muted));}
    if(volume)volume.value=settings.volume;
    const sound=document.querySelector('#fields-sound-enable');
    if(sound){sound.textContent=ambientAudio.unlocked?'声音已开启':'开启声音';sound.title=ambientAudio.message??'点击后播放环境音与音乐';}
    for(const status of document.querySelectorAll('[data-fields-audio-status]'))status.textContent=ambientAudio.message??'点击后播放环境音与音乐';
}
subscribeSettings(updateAudioControls);
async function ensureReviewTurn(){
    if(!view||mode==='quiet')return;
    const currentAnchor=anchor(),user=[...ctx().chat].reverse().find(message=>message.is_user);
    if(!currentAnchor)return;
    if(!reviewTurn||reviewTurn.anchor!==currentAnchor||reviewTurn.chatId!==ctx().chatId||reviewTurn.completed){
        turnStart=view.document.state.minute;
        reviewTurn={...await api('review/begin',{campaignId:view.reference.campaignId,anchor:currentAnchor,playerText:user?.mes??'',expectedSequence:view.reference.sequence,enabled:ctx().chatMetadata.fields_consistency_enabled!==false,captureSearch:true}),anchor:currentAnchor,chatId:ctx().chatId};
    }
    reviewTurn.gate=await api('review/gate',{campaignId:view.reference.campaignId,token:reviewTurn.token,expectedSequence:view.reference.sequence});
    ctx().setExtensionPrompt(`${KEY}_turn`,turnFactsPrompt(reviewTurn.gate),1,0,false,0);
}
async function historyInterceptor(coreChat,contextSize,abort,type){
    if(!active()||type==='quiet')return;
    return queue(async()=>{
        try{
            await load();if(!view||blocked)throw new Error(blocked??'请先在副本上启用新版');
            await ensureReviewTurn();await syncHistory();
            if(typeof ctx().getTokenCountAsync!=='function')throw new Error('宿主未提供 token 计数，无法安全裁剪历史');
            historyModule??=await import('./history-window.mjs');
            const count=text=>ctx().getTokenCountAsync(text),card=ctx().characters[ctx().characterId]?.data??ctx().characters[ctx().characterId];
            const tokenCounts=await Promise.all(coreChat.map(message=>count(JSON.stringify({role:message.is_user?'user':'assistant',text:message.mes,tools:message.extra?.tool_invocations}))));
            const reservedTokens=1024+await count(JSON.stringify({prompts:ctx().chatCompletionSettings?.prompts??[],card:{description:card?.description,personality:card?.personality,scenario:card?.scenario,examples:card?.mes_example,system:card?.system_prompt},dynamic:ctx().extensionPrompts??{},tools:toolDefinitions()}));
            const groups=await historyModule.groupHistory(coreChat,{format:'host',tokenCounts});
            const coverage=await api('history/coverage',{campaignId:view.reference.campaignId,expectedSequence:view.reference.sequence});
            const planned=historyModule.planHistoryWindow(groups,{cursor:ctx().chatMetadata.fields_history_window,coverage,contextTokens:contextSize,reservedTokens});
            if(!planned.canSend)throw new Error(planned.needsCoverage?'旧历史尚未获得编年史和原文索引覆盖，已停止发送超长上下文':'最近完整回合已经超过上下文预算，已停止生成');
            ctx().chatMetadata.fields_history_window=planned.cursor;
            ctx().chatMetadata.fields_history_usage={reason:planned.reason,reset:planned.reset,beforeTokens:planned.beforeTokens,afterTokens:planned.afterTokens,batch:planned.batch};
            coreChat.splice(0,coreChat.length,...planned.messages);await ctx().saveChat();
        }catch(error){abort(true);actionError(`历史上下文未准备好：${error.message}`);}
    });
}
globalThis.infiniteFieldsHistoryInterceptor=historyInterceptor;
async function reconcile(type,_options,dryRun){
    if(!active()||dryRun)return;mode=type;if(type!=='quiet')generating=true;
    if(type!=='quiet')hideUnreviewed();
    return queue(async()=>{
        try{
            await load();if(!view)throw new Error('请先在副本上启用新版');if(blocked)throw new Error(blocked);
            if(['regenerate','swipe'].includes(type)){
                ambientAudio.noteAction(null);
                view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors(),excludeAnchor:anchor()});await persist();
                reviewTurn=null;
            }
            // The host emits GENERATION_STARTED before sendMessageAsUser.
            // MESSAGE_SENT and the native interceptor capture the new input.
            if(ctx().chat.at(-1)?.is_user)await ensureReviewTurn();
            await refresh();
        }catch(error){fail(error);}
    });
}
async function onDeleted(){
    if(!active())return;ambientAudio.noteAction(null);return queue(async()=>{try{await load();if(!view)return;view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});await persist();await refresh();}catch(error){fail(error);}});
}
async function onEdited(index){
    const message=ctx().chat[index];if(!active()||!message)return;
    if(!message.is_user){
        reviewEdits.set(message,(reviewEdits.get(message)??0)+1);
        if(message.extra?.fields_consistency){delete message.extra.fields_consistency;await ctx().saveChat();}
        render();return;
    }
    await load();if(!view)return;
    for(let i=index;i<ctx().chat.length;i++){ctx().chat[i].extra??={};ctx().chat[i].extra.fields_invalidated=true;}
    message.extra.fields_anchor=crypto.randomUUID();message.extra.fields_invalidated=false;
    indexedMessages=indexedMessages.slice(0,index);
    await onDeleted();if(view)await api('edit-index',{campaignId:view.reference.campaignId,index,message});
}
async function afterReply(index){
    if(!active()||!view||mode==='quiet'||blocked)return;
    const message=ctx().chat[index];
    if(!message||message.is_user||message.is_system||message.extra?.tool_invocations||turnStart===null||message.extra?.fields_turn)return;
    // saveReply emits MESSAGE_RECEIVED before the host executes tool calls.
    // That empty intermediary must not start a second tool phase or seal review.
    if(reviewTurn?.toolReply){reviewTurn.toolReply=false;return;}
    if(reviewing.has(message))return reviewing.get(message);
    const session=reviewTurn,chatId=ctx().chatId,campaignId=view.reference.campaignId;
    const user=[...ctx().chat].reverse().find(row=>row.is_user),editVersion=reviewEdits.get(message)??0;
    const draft=session?.draft??message.mes;if(session)delete session.draft;
    if(session&&message.extra?.fields_tool_retry?.token===session.token&&message.extra.fields_tool_retry.attempted)session.retryStarted=true;
    message.extra??={};message.mes=WAITING;
    if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id))message.swipes[message.swipe_id]=WAITING;
    message.extra.fields_narration_pending=true;
    const element=document.querySelector(`.mes[mesid="${index}"]`);element?.classList.remove('fields-review-visible');
    const current=()=>ctx().chatId===chatId&&session===reviewTurn&&ctx().chat[index]===message&&message.mes===WAITING&&!message.extra?.fields_invalidated&&(reviewEdits.get(message)??0)===editVersion&&session?.anchor===anchor();
    const publish=text=>{
        message.mes=text;
        if(Array.isArray(message.swipes)&&Number.isInteger(message.swipe_id))message.swipes[message.swipe_id]=text;
        delete message.extra.fields_narration_pending;
        element?.classList.add('fields-review-visible');ctx().updateMessageBlock?.(index,message);
    };
    reviewsPending++;render();
    const pending=(async()=>{
        try{
            if(!session||session.chatId!==chatId||session.anchor!==anchor())throw Error('本轮审查快照缺失，尾注未提交');
            const gate=async()=>{
                const data=await api('review/gate',{campaignId,token:session.token,expectedSequence:view.reference.sequence});
                if(current()){
                    session.gate=data;
                    if(getActionModes().narration==='async'){message.extra.fields_pending_safe_text=data.safeText;render();}
                }return data;
            };
            const tools=toolDefinitions().filter(row=>modelToolAllowed(row.function.name,getSettings()));
            const finished=await finishContractTurn({playerText:user?.mes??'',draft,gate,state:session,isCurrent:current,tools,
                messages:[{role:'user',content:user?.mes??''}],
                onMeasurement:row=>(session.measurements??=[]).push(row),
                onRetryStart:async()=>{message.extra.fields_tool_retry={token:session.token,attempted:true};await ctx().saveChat();},
                ...turnModelAccess(getSettings(),controlledGenerate),
                execute:async(name,args)=>{
                    if(name==='world_read')return readStateSection(view.document.state,args.section,args.npc);
                    if(name==='world_search')return api('search',{...args,campaignId,token:session.token,anchor:session.anchor,expectedSequence:view.reference.sequence});
                    if(name==='world_catalog')return api('catalog',{...args,campaignId});
                    if(name==='world_actions')return modelActions(args);
                    if(name==='world_act')return modelAct(args);
                    return execute(name,args);
                },
                onTools:async(assistant,results)=>{
                    if(!current())throw Error('回合来源已变化');
                    const invocations=assistant.tool_calls.map((call,i)=>({id:call.id,name:call.function.name,displayName:call.function.name,
                        parameters:call.function.arguments,result:results[i].content,error:JSON.parse(results[i].content)?.ok===false}));
                    if(ctx().ToolManager?.saveFunctionToolInvocations)await ctx().ToolManager.saveFunctionToolInvocations(invocations);
                    else ctx().chat.push({is_system:true,mes:'',extra:{tool_invocations:invocations}});
                    await ctx().saveChat();
                },
                review:text=>api('review/reply',{campaignId,token:session.token,draft:text,query:user?.mes??'',expectedSequence:view.reference.sequence})});
            if(!current())return;
            const review=finished.review;
            // Do not copy diagnostic originals back into persistent chat extras.
            message.extra.fields_consistency={...Object.fromEntries(['reviewId','status','verified','canCommit','text','safeText','rewritten','attempts','sequence','feedback','candidates'].filter(key=>review[key]!==undefined).map(key=>[key,review[key]])),
                text:finished.text,issues:(review.issues??[]).map(({category,severity})=>({category,severity})),...(review.protocol?{protocol:{changed:review.protocol.changed}}:{})};
            message.extra.fields_tool_retry={token:session.token,...finished.retry,attempted:session.retryStarted===true,measurements:session.measurements??[]};
            if(getActionModes().narration==='off')message.extra.fields_no_narration=true;
            if(review.canCommit&&!review.fallback&&getActionModes().intent==='propose'){// World time is committed from the reviewed turn tail in every proposing profile; narration timing (async/sync) does not decide it.
                const state=view.document.state;
                const parsed=parseTurn(finished.text,{location:state.location,startMinute:turnStart,minute:state.minute,
                    present:Object.entries(state.npcs).filter(([,npc])=>npc.location===state.location&&!npc.scheduleTravel&&!npc.cognitionTravel).map(([id])=>id),outOfCharacter:isOutOfCharacter(user?.mes??'')});
                const result=await execute('world_turn',review.tail?.args??parsed.args,`turn_${session.anchor}`,review.reviewId);
                if(!current())return;
                if(result.ok===false)throw Error(result.error);
                message.extra.fields_turn={valid:parsed.valid,warning:parsed.warning??null};
            }else message.extra.fields_turn={valid:!!review.canCommit,pending:review.status==='pending',fallback:!!review.fallback,extraMinutes:0};
            session.completed=true;publish(finished.text);
            if(review.feedback)actionError(review.feedback);
            await ctx().saveChat();indexedMessages=indexedMessages.slice(0,index);await syncHistory();render();renderCandidates(message,review,index);
        }catch(error){
            if(!current())return;
            const text=publishedTurnText(null,session?.gate);publish(text);
            message.extra.fields_consistency={status:'unverified',verified:false,canCommit:false,text,feedback:error.message};
            if(session)session.completed=true;
            actionError(`回复未验证：${error.message}。已完成的行动保留。`);await ctx().saveChat();indexedMessages=indexedMessages.slice(0,index);await syncHistory();render();
        }finally{
            delete message.extra.fields_narration_pending;
            delete message.extra.fields_pending_safe_text;
            if(chatId===ctx().chatId)render();
        }
    })().finally(()=>{reviewsPending=Math.max(0,reviewsPending-1);});
    reviewing.set(message,pending);return pending;
}
function renderCandidates(message,review,index){
    const element=document.querySelector(`.mes[mesid="${index}"]`);if(!element)return;
    element.querySelector('.fields-turn-candidates')?.remove();
    if(review.status!=='pending')return;
    const box=document.createElement('div');box.className='fields-turn-candidates';
    for(const candidate of review.candidates??[]){
        const action=candidate.action??candidate.id;if(!action)continue;
        const button=document.createElement('button');button.textContent=candidate.label??'预览候选行动';
        button.onclick=async()=>{
            const catalog=await api('actions',{campaignId:view.reference.campaignId,query:action,limit:12});
            const selected=catalog.actions.find(row=>row.id===action);if(!selected)return;
            actionSuggestion={action:selected,slots:candidate.slots??{}};render();
            document.querySelector('[data-panel="actions"]')?.click();
        };box.append(button);
    }
    const builder=document.createElement('button');builder.textContent='打开可做之事，继续构造';builder.onclick=()=>document.querySelector('[data-panel="actions"]')?.click();box.append(builder);
    (element.querySelector('.mes_block')??element).append(box);
}

const context=ctx();
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY,data=>{
    if(!active()||!view)return;
    if(controlledRequest&&data.type==='quiet'){Object.assign(data,controlledRequest);data.tools=controlledRequest.tools??[];data.stream=false;data.include_reasoning=false;data.n=1;}
    else if(mode!=='quiet'){data.n=1;}
});
context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY,({chat})=>{
    if(active()&&view&&!blocked)injectToolExamples(chat,ctx().characters[ctx().characterId]);
});
context.eventSource.on(context.eventTypes.APP_READY,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_CHANGED,()=>{ambientAudio.stop();if(!startTransition)return queue(refresh).catch(fail);});
context.eventSource.on(context.eventTypes.CHAT_LOADED,()=>{ambientAudio.stop();if(!startTransition)return queue(refresh).catch(fail);});
context.eventSource.on(context.eventTypes.GENERATION_STARTED,reconcile);
context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS,()=>{if(blocked||noModelProfile())ctx().stopGeneration();});
context.eventSource.on(context.eventTypes.MESSAGE_SENT,()=>{if(active()&&view&&loadedChat===ctx().chatId)return queue(async()=>{if(noModelProfile())await localTyping();else await ensureReviewTurn();await refresh();}).catch(fail);});
context.eventSource.on(context.eventTypes.MESSAGE_DELETED,onDeleted);
context.eventSource.on(context.eventTypes.MESSAGE_EDITED,onEdited);
context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED,afterReply);
for(const event of [context.eventTypes.CHARACTER_MESSAGE_RENDERED,context.eventTypes.MESSAGE_UPDATED])if(event)context.eventSource.on(event,()=>{if(active()&&view)render();});
context.eventSource.on(context.eventTypes.GENERATION_ENDED,()=>{mode='normal';generating=false;restoreStreaming();});
if(context.eventTypes.GENERATION_STOPPED)context.eventSource.on(context.eventTypes.GENERATION_STOPPED,()=>{generating=false;restoreStreaming();});
async function startSnapshot(){
    await load();if(!view)return null;
    view=await api('read',{campaignId:view.reference.campaignId});await persist();
    return {reference:view.reference,name:view.document.state.player.name,chatId:ctx().chatId,
        chat:structuredClone(ctx().chat),metadata:structuredClone(ctx().chatMetadata),settings:getSettings()};
}
async function enterFromStart({session,opening,settings}){
    if(startTransition)throw Error('正在打开存档，请稍候');
    await chain;startTransition=true;
    try{return await openStartSession({session,opening,settings});}finally{startTransition=false;}
}
async function openStartSession({session,opening,settings}){
    const reference=session?.reference;if(reference?.format!==2)throw Error('存档引用无效');
    const gm=ctx().characters.findIndex(character=>character.name==='无限原野·世界主持人');
    if(gm<0)throw Error('尚未安装无限原野世界主持人角色卡');
    // Validate the selected campaign before opening a chat. A new/imported
    // campaign always gets a fresh chat, leaving existing saves untouched.
    const saved=await api('read',{campaignId:reference.campaignId});
    if(saved.document.releaseVersion!==1)throw Error('这个存档尚未启用新版，请先在副本上启用');
    ctx().stopGeneration();
    if(ctx().characterId!==gm)await ctx().selectCharacterById(gm);
    const fresh=!session.chatId;
    const chatId=session.chatId??`无限原野-${reference.campaignId}-${crypto.randomUUID()}`;
    if(fresh||ctx().chatId!==chatId)await ctx().openCharacterChat(chatId);
    if(!fresh&&ctx().chatMetadata[KEY]?.campaignId!==reference.campaignId)throw Error('所选聊天与存档不一致，请导入备份建立独立聊天');
    if(fresh){
        ctx().chat.splice(0,ctx().chat.length,...structuredClone(session.chat??[]));
        for(const key of Object.keys(ctx().chatMetadata))delete ctx().chatMetadata[key];
        Object.assign(ctx().chatMetadata,structuredClone(session.metadata??{}),{[KEY]:saved.reference});
        if(opening&&!ctx().chat.length)ctx().chat.push({name:'无限原野·世界主持人',is_user:false,is_system:false,mes:opening,send_date:new Date().toISOString(),extra:{fields_opening:true}});
        await ctx().saveChat();
        // Reload from the new file so the host's message DOM and metadata agree.
        await ctx().openCharacterChat(chatId);
    }
    if(settings)updateSettings(settings);
    view=null;loadedChat=null;await refresh();return startSnapshot();
}
const startEndpoints=new Set(['create','read','export','import','ui/history','ui/overview','catalog']);
window.addEventListener('message',event=>{
    if(window.parent===window||event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='fields-start-request')return;
    const {id,action,data={}}=event.data;
    const handleStart=async()=>{
        try{
            let value;
            if(action==='hello')value={ready:true};
            else if(action==='settings'){updateSettings(data);value=getSettings();}
            else if(action==='snapshot')value=await startSnapshot();
            else if(action==='enter')value=await enterFromStart(data);
            else if(action==='api'&&startEndpoints.has(data.endpoint))value=await api(data.endpoint,data.body);
            else throw Error('开始页请求无效');
            event.source.postMessage({type:'fields-start-result',id,value},event.origin);
        }catch(error){event.source.postMessage({type:'fields-start-result',id,error:error.message},event.origin);}
    };
    // Opening a host chat emits awaited CHAT_CHANGED/CHAT_LOADED callbacks.
    // Do not put that transition inside the queue those callbacks normally use.
    if(action==='enter')handleStart();else queue(handleStart);
});
window.infiniteFieldsV2={load,refresh,execute,act,preview:previewUIAction,reconcile,onEdited,onDeleted,historyInterceptor,startSnapshot,enterFromStart,unlockAudio,stopAudio:()=>ambientAudio.stop(),get view(){return view;},get blocked(){return blocked;}};
if(window.parent!==window)window.parent.postMessage({type:'fields-start-ready'},location.origin);
