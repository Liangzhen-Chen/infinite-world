export function collectedDocuments(context,documents=[]){
    const saved=new Set(context.chatMetadata?.fields_mail??[]);
    // A saved ID is a bookmark, never a second copy of rolled-back content.
    return documents.filter(row=>saved.has(row.id));
}
export function renderDocumentCard(card,context){
    const node=document.createElement('article');node.className='fields-document-card';
    const title=document.createElement('h3');title.textContent=`${card.kind==='letter'?'✉':card.kind==='announcement'?'▤':'⚑'} ${card.title}`;
    const body=document.createElement('p');body.textContent=card.text;
    node.append(title,body);
    const now=globalThis.infiniteFieldsV2?.view?.document.state.minute;
    const deadline=card.deadline!==undefined&&Number.isFinite(now)?`期限${card.deadline>now?`还剩 ${card.deadline-now} 分钟`:'已到'}`:'';
    const details=[card.from?`来自 ${card.from}`:'',card.status??'',card.cost!==undefined?`费用 ${card.cost}${card.unit??'铜'}`:'',deadline].filter(Boolean);
    if(details.length){const info=document.createElement('p');info.className='fields-note';info.textContent=details.join(' · ');node.append(info);}
    const button=document.createElement('button');
    const saved=()=>context.chatMetadata?.fields_mail?.includes(card.id);
    const update=()=>{button.textContent=saved()?'取消收藏':'收藏到邮件';button.setAttribute('aria-pressed',String(saved()));};update();
    button.onclick=async()=>{
        context.chatMetadata??={};const previous=[...context.chatMetadata.fields_mail??[]],ids=new Set(previous);
        if(ids.has(card.id))ids.delete(card.id);else ids.add(card.id);
        context.chatMetadata.fields_mail=[...ids];button.disabled=true;
        try{await context.saveChat();update();node.querySelector('[role=alert]')?.remove();}
        catch{context.chatMetadata.fields_mail=previous;const error=document.createElement('p');error.setAttribute('role','alert');error.textContent='收藏未保存，请重试。';node.append(error);}
        finally{button.disabled=false;}
    };
    node.append(button);return node;
}
export function renderMail(container,context,documents=[]){
    container.replaceChildren();container.className='fields-mail';
    const intro=document.createElement('p');intro.textContent='收件与本人合同来自当前存档；收藏随聊天保存。';container.append(intro);
    const filter=document.createElement('input');filter.type='checkbox';filter.setAttribute('aria-label','只看收藏');
    const label=document.createElement('label');label.append(filter,document.createTextNode('只看收藏'));container.append(label);
    const list=document.createElement('div');container.append(list);
    const show=()=>{
        list.replaceChildren();const rows=filter.checked?collectedDocuments(context,documents):documents;
        for(const card of rows)list.append(renderDocumentCard(card,context));
        if(!rows.length){const empty=document.createElement('p');empty.textContent=filter.checked?'暂无有效收藏。':'暂无已收到的信件、公告或本人合同。';list.append(empty);}
    };filter.onchange=show;show();
}
