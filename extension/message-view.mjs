import {stripTurn} from './turn.mjs';

export function visibleReply(raw,labels={}){
    return stripTurn(raw).replace(/<q\s+who="([^"]+)"\s*>([\s\S]*?)<\/q>/g,(_all,id,quote)=>`${labels[id]??'路人'}：${quote}`);
}

// Derive feedback on every refresh from active ledger events; chat extras are not authoritative.
export function messageFeedback(chat,events=[]){
    const grouped=new Map();
    for(const event of events){
        const notices=grouped.get(event.anchor)??[];notices.push(...event.notices);grouped.set(event.anchor,notices);
    }
    const targets=new Map();let anchor=null;
    for(const [index,message] of chat.entries()){
        if(message.is_user){anchor=message.extra?.fields_invalidated?null:message.extra?.fields_anchor;continue;}
        if(anchor&&!message.is_system&&!message.extra?.tool_invocations&&!message.extra?.fields_invalidated)targets.set(anchor,index);
    }
    const messages=new Map(),pending=[];
    for(const [key,notices] of grouped){
        if(targets.has(key))messages.set(targets.get(key),notices);
        else if(key===anchor)pending.push(...notices);
    }
    return {messages,pending};
}

export function renderMessages(context,labels={},events=[],debug=false){
    const feedback=messageFeedback(context.chat,events);
    for(const [index,message] of context.chat.entries()){
        const element=document.querySelector(`.mes[mesid="${index}"]`);if(!element)continue;
        element.hidden=!debug&&!!message.extra?.tool_invocations;
        if(message.is_user||message.is_system)continue;
        const text=element.querySelector('.mes_text');
        if(text){
            const visible=debug?message.mes:visibleReply(message.mes,labels);
            if(context.messageFormatting)text.innerHTML=context.messageFormatting(visible,message.name,false,false,index);
            else text.textContent=visible;
        }
        element.querySelector('.fields-notices')?.remove();
        const changes=feedback.messages.get(index)??[];
        if(changes.length){
            const box=document.createElement('div');box.className='fields-notices';box.setAttribute('aria-label','本回合已提交变化');
            for(const notice of changes){const line=document.createElement('p');line.textContent=notice.text;box.append(line);}
            (element.querySelector('.mes_block')??element).append(box);
        }
    }
    return feedback.pending;
}
