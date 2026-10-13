import {subscribeMessages,setMessagePresentation,renderMessages,unknownSpeakers,playerError} from './message-view.mjs';
import {mountInput} from './input-view.mjs';
import {renderMail} from './mail-view.mjs';

let latest=null,loadedKey=null,inFlight=null;
const errorText=new WeakMap();
const savedNotices=new WeakMap();
const keyFor=context=>`${context.chatId}:${JSON.stringify(context.chatMetadata?.infinite_fields)}`;
const request=async(context)=>{
    const response=await fetch('/api/plugins/infinite-fields/ui/messages',{method:'POST',headers:context.getRequestHeaders(),body:JSON.stringify({campaignId:context.chatMetadata.infinite_fields.campaignId})});
    const data=await response.json();if(!response.ok||data.ok===false)throw Error('消息读取失败');return data;
};
function displayErrors(){
    const debug=latest?.context.chatMetadata?.fields_ui?.debug===true;
    document.body.classList.toggle('fields-debug',debug);
    for(const node of document.querySelectorAll('#fields-error,.fields-topbar-blocked,#fields-status:not(:has(*))')){
        if(node.id==='fields-status'&&!/失败|停止|未确认/.test(node.textContent))continue;
        if(!node.textContent)continue;
        const previous=errorText.get(node),text=node.textContent;
        const raw=previous&&(text===previous.visible||text===previous.raw)?previous.raw:text;
        const visible=debug?raw:playerError(raw);errorText.set(node,{raw,visible});
        if(node.textContent!==visible)node.textContent=visible;
    }
}
async function savePreference(context,key,value){
    context.chatMetadata.fields_ui??={};const old=context.chatMetadata.fields_ui[key];context.chatMetadata.fields_ui[key]=value;
    try{await context.saveChat();}
    catch{context.chatMetadata.fields_ui[key]=old;throw Error('设置未保存，请重试。');}
}
export function registerUI({registerPanel,registerSettingsSection}){
    registerPanel({id:'mail',title:'邮件',render:async(container,data)=>{
        const current=latest?.context;if(!current){container.textContent='当前聊天尚未准备好。';return;}
        container.textContent='正在读取邮件…';
        try{const projection=await data.api('ui/messages');if(container.isConnected&&current===latest?.context)renderMail(container,current,projection.documents);}
        catch{if(container.isConnected)container.textContent='邮件读取未完成，请关闭后重试。';}
    }});
    registerPanel({id:'speakers',title:'说话人登记',render:container=>{
        const context=latest?.context;container.replaceChildren();container.className='fields-speaker-registry';if(!context)return;
        const ids=unknownSpeakers(context),intro=document.createElement('p');intro.textContent='路人名牌可以记下你的称呼；备注只保存在此聊天。';container.append(intro);
        if(!ids.length)container.append(document.createTextNode('暂无待登记说话人。'));
        for(const [index,id]of ids.entries()){
            const row=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button');
            label.textContent=`路人 ${index+1} 的称呼`;input.maxLength=40;label.append(input);button.textContent='保存称呼';
            button.onclick=async()=>{
                const value=input.value.trim();if(!value)return;context.chatMetadata.fields_speakers={...context.chatMetadata.fields_speakers,[id]:value};button.disabled=true;
                try{await context.saveChat();renderMessages(context,{},latest.events);row.remove();}
                catch{delete context.chatMetadata.fields_speakers[id];button.disabled=false;button.textContent='未保存，重试';}
            };row.append(label,button);container.append(row);
        }
    }});
    registerSettingsSection({id:'messages',title:'消息与输入',render:container=>{
        const context=latest?.context;if(!context)return;
        for(const [key,title,checked]of [['debug','调试模式',context.chatMetadata.fields_ui?.debug===true],['shortcuts','输入快捷键 Alt+1 说、Alt+2 做',context.chatMetadata.fields_ui?.shortcuts!==false]]){
            const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=checked;label.append(document.createTextNode(title),input);container.append(label);
            input.onchange=async()=>{
                try{await savePreference(context,key,input.checked);renderMessages(context,{},latest.events);displayErrors();}
                catch(error){input.checked=checked;const text=document.createElement('p');text.setAttribute('role','alert');text.textContent=error.message;container.append(text);}
            };
        }
    }});
    subscribeMessages(value=>{
        latest=value;mountInput(value.context);displayErrors();
        const signature=JSON.stringify([value.context.chatId,value.context.chat.map(message=>[message.extra?.fields_notices,message.extra?.fields_pending_notices])]);
        if(savedNotices.get(value.context)!==signature){
            savedNotices.set(value.context,signature);
            Promise.resolve().then(()=>value.context.saveChat()).catch(()=>{savedNotices.delete(value.context);const node=document.querySelector('#fields-error');if(node){node.hidden=false;node.textContent='消息提示尚未保存，请重新对账。';}});
        }
        const key=keyFor(value.context);if(key===loadedKey||inFlight===key)return;
        inFlight=key;
        request(value.context).then(projection=>{
            if(latest?.context!==value.context||keyFor(value.context)!==key)return;
            loadedKey=key;setMessagePresentation(value.context,{...projection,key});
            renderMessages(value.context,{},latest.events);
            // Refresh persists the current projection, never immutable receipts.
            return value.context.saveChat();
        }).catch(()=>{
            if(keyFor(value.context)===key){const node=document.querySelector('#fields-error');if(node){node.hidden=false;node.textContent='消息读取未完成，状态尚未确认，请重新对账。';}}
        }).finally(()=>{if(inFlight===key)inFlight=null;});
    });
    new MutationObserver(displayErrors).observe(document.body,{subtree:true,childList:true,characterData:true});
}
