import {stripTurn} from './turn.mjs';
import {renderDocumentCard} from './mail-view.mjs';

const listeners=new Set(),presentations=new WeakMap();
const labelFor=(labels,id)=>Object.hasOwn(labels,id)&&typeof labels[id]==='string'?labels[id]:undefined;
export function subscribeMessages(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function setMessagePresentation(context,value){presentations.set(context,value);}
export function unknownSpeakers(context){
    const projection=presentations.get(context),key=`${context.chatId}:${JSON.stringify(context.chatMetadata?.infinite_fields)}`;
    const labels=projection?.key===key?projection.labels:{},aliases=context.chatMetadata?.fields_speakers??{};
    const ids=new Set();
    for(const message of context.chat??[])if(!message.is_user&&!message.is_system&&!message.extra?.tool_invocations&&!message.extra?.fields_invalidated)
        for(const match of String(message.mes).matchAll(/<q\s+who="([^"]+)"\s*>/g))if(!labelFor(labels,match[1])&&!labelFor(aliases,match[1]))ids.add(match[1]);
    return [...ids];
}

export function technicalMessage(message){
    if(message.extra?.tool_invocations||message.role==='tool')return true;
    try{const row=JSON.parse(message.mes);return !!row&&typeof row==='object'&&['ok','patches','tool_calls','eventId','transaction_id'].some(key=>key in row);}catch{return false;}
}
export function playerError(text){
    const technical=/\b(?:EPERM|ENOENT|JSON|TypeError|SyntaxError|token|checksum|sequence|patches|prompt)\b|(?:npc|bld|item|spell)_[a-z0-9_]+|[A-Z]:[\\/]|\/[a-z0-9_-]+\//i.test(text);
    if(!technical&&/^(?:操作未完成|执行结果尚未确认|行动已保存|存档对账失败|回复未验证|历史上下文)/.test(text))return text;
    if(/尚未确认|未确认/.test(text))return '执行结果尚未确认，请重新对账。';
    if(/行动已保存/.test(text))return '行动已保存，显示更新失败，请重新对账。';
    if(/存档对账失败|生成已停止|已阻止生成/.test(text))return '存档尚未核对，生成已停止，请重新对账。';
    if(/回复未验证/.test(text))return '回复未验证，收尾已暂停；已完成的行动保留。';
    if(/历史上下文/.test(text))return '历史上下文未准备好，本次生成已暂停。';
    if(/操作未完成/.test(text))return '操作未完成，请检查输入后重试。';
    return '请求未完成，请稍后重试；当前状态以重新对账结果为准。';
}

export function visibleReply(raw,labels={}){
    return stripTurn(raw).replace(/<q\s+who="([^"]+)"\s*>([\s\S]*?)<\/q>/g,(_all,id,quote)=>`${labelFor(labels,id)??'路人'}：${quote}`);
}

// Derive feedback on every refresh from active ledger events; chat extras are not authoritative.
export function messageFeedback(chat,events=[]){
    const grouped=new Map();
    for(const event of events){
        const notices=grouped.get(event.anchor)??[];notices.push(...event.notices??[]);grouped.set(event.anchor,notices);
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
    debug=debug||context.chatMetadata?.fields_ui?.debug===true;
    // Runtime labels contain the whole catalogue. Use the player projection only.
    const presentation=presentations.get(context),key=`${context.chatId}:${JSON.stringify(context.chatMetadata?.infinite_fields)}`;
    const known=presentation?.key===key?presentation.labels:{};
    const aliases=context.chatMetadata?.fields_speakers??{};
    const feedback=messageFeedback(context.chat,events);let invalidatedTurn=false;
    for(const [index,message] of context.chat.entries()){
        if(message.is_user)invalidatedTurn=Boolean(message.extra?.fields_invalidated);
        const changes=feedback.messages.get(index)??[];
        message.extra??={};message.extra.fields_notices=structuredClone(changes);
        delete message.extra.fields_pending_notices;
        const element=document.querySelector(`.mes[mesid="${index}"]`);if(!element)continue;
        element.hidden=!debug&&technicalMessage(message);
        element.querySelector('.fields-consistency-notice')?.remove();
        element.querySelector('.fields-notices')?.remove();
        if(message.is_user||message.is_system)continue;
        const text=element.querySelector('.mes_text');
        if(text){
            text.replaceChildren();
            const appendProse=value=>{
                if(!value.trim())return;
                const prose=document.createElement('div');prose.className='fields-prose';
                if(context.messageFormatting)prose.innerHTML=context.messageFormatting(value,message.name,false,false,index);
                else prose.textContent=value;
                text.append(prose);
            };
            if(debug)appendProse(message.mes);
            else{
                const raw=stripTurn(message.mes);let offset=0;
                for(const match of raw.matchAll(/<q\s+who="([^"]+)"\s*>([\s\S]*?)<\/q>/g)){
                    appendProse(raw.slice(offset,match.index));offset=match.index+match[0].length;
                    const name=labelFor(known,match[1])??labelFor(aliases,match[1])??'路人';
                    const quote=document.createElement('blockquote');quote.className='fields-dialogue';
                    const badge=document.createElement('div');badge.className='fields-speaker';badge.dataset.speakerId=match[1];
                    badge.dataset.fieldsKnownSpeaker=String(Boolean(labelFor(known,match[1])));
                    let hue=0;for(const char of match[1])hue=(hue*31+char.charCodeAt(0))%360;
                    badge.style.setProperty('--fields-speaker-hue',String(hue));
                    const avatar=document.createElement('span');avatar.className='fields-speaker-avatar';avatar.textContent=name==='路人'?'？':name.slice(0,1);avatar.setAttribute('aria-hidden','true');
                    badge.append(avatar,document.createTextNode(name));
                    const words=document.createElement('p');words.textContent=match[2];quote.append(badge,words);text.append(quote);
                }
                appendProse(raw.slice(offset));
            }
        }
        const reviewNotice=invalidatedTurn?null:consistencyNotice(message);
        if(reviewNotice){
            const box=document.createElement('div');box.className=`fields-consistency-notice fields-consistency-${reviewNotice.kind}`;
            box.setAttribute('aria-label','回复审查状态');box.textContent=reviewNotice.text;
            (element.querySelector('.mes_block')??element).append(box);
        }
        if(changes.length){
            const box=document.createElement('div');box.className='fields-notices';box.setAttribute('aria-label','本回合已提交变化');
            for(const notice of changes){
                if(notice.card)box.append(renderDocumentCard(notice.card,context));
                else{const line=document.createElement('p');line.className='fields-event-card';line.textContent=`${noticeIcon(notice.type)} ${notice.text}`;box.append(line);}
            }
            (element.querySelector('.mes_block')??element).append(box);
        }
    }
    const latestUser=[...context.chat].reverse().find(message=>message.is_user);
    if(latestUser&&feedback.pending.length)latestUser.extra.fields_pending_notices=structuredClone(feedback.pending);
    for(const listener of listeners)listener({context,events,debug});
    return feedback.pending;
}

function noticeIcon(type){return ({level:'☆',xp:'☆',skill:'✧',inventory:'◇',coins:'◉',quests:'⚑',obligations:'⚑',relationship:'♡',announcement:'▤',contract:'▤',letter:'✉'})[type]??'·';}
