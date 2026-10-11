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

// Review metadata describes this exact reply, never a submitted world change.
// Only fixed public labels are rendered; reviewer evidence may contain private facts.
export function consistencyNotice(message){
    if(message.is_user||message.is_system||message.extra?.tool_invocations||message.extra?.fields_invalidated)return null;
    const review=message.extra?.fields_consistency;if(!review)return null;
    const reviewedText=review.text??review.original;
    if(typeof reviewedText!=='string'||reviewedText!==message.mes)return null;
    if(review.canCommit===false)return {kind:'blocked',text:review.status==='unverified'
        ?'回复未验证，本次收尾已暂停；已完成的行动仍保留。'
        :'回复需复核，本次收尾已暂停；已完成的行动仍保留。'};
    if(review.status==='disabled')return {kind:'unverified',text:'本条回复未审查；实际变化以已提交记录为准。'};
    if(review.status==='unverified'||review.verified===false)return {kind:'unverified',text:'回复未验证；实际变化以已提交记录为准。'};
    if(review.status==='issues'||review.issues?.some(issue=>['warning','error'].includes(issue.severity)))return {kind:'review',text:'回复仍需复核；实际变化以已提交记录为准。'};
    return null;
}

export function renderMessages(context,labels={},events=[],debug=false){
    const feedback=messageFeedback(context.chat,events);let invalidatedTurn=false;
    for(const [index,message] of context.chat.entries()){
        if(message.is_user)invalidatedTurn=Boolean(message.extra?.fields_invalidated);
        const element=document.querySelector(`.mes[mesid="${index}"]`);if(!element)continue;
        element.hidden=!debug&&!!message.extra?.tool_invocations;
        element.querySelector('.fields-consistency-notice')?.remove();
        if(message.is_user||message.is_system)continue;
        const text=element.querySelector('.mes_text');
        if(text){
            const visible=debug?message.mes:visibleReply(message.mes,labels);
            if(context.messageFormatting)text.innerHTML=context.messageFormatting(visible,message.name,false,false,index);
            else text.textContent=visible;
        }
        const reviewNotice=invalidatedTurn?null:consistencyNotice(message);
        if(reviewNotice){
            const box=document.createElement('div');box.className=`fields-consistency-notice fields-consistency-${reviewNotice.kind}`;
            box.setAttribute('aria-label','回复审查状态');box.textContent=reviewNotice.text;
            (element.querySelector('.mes_block')??element).append(box);
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
