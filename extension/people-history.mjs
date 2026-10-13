const pending=new WeakMap(),drafts=new WeakMap();
const KEY='fields_people_history';

export function renderHistoryPanel(container,data,kind,{query='',page=1,level='scenes',reload=()=>{},chatContext=null,isCurrent=()=>true}={}){
    const doc=container.ownerDocument,fragment=doc.createDocumentFragment();
    const node=(tag,text,cls)=>{const element=doc.createElement(tag);if(text!==undefined)element.textContent=String(text);if(cls)element.className=cls;return element;};
    const form=node('form',undefined,'fields-history-search'),input=node('input');input.type='search';input.value=query;input.placeholder='搜索已知的人与经历';input.setAttribute('aria-label','搜索历史');
    const search=node('button','搜索');search.type='submit';form.append(input,search);
    let scope;
    if(kind==='chronicle'){
        scope=node('select');scope.setAttribute('aria-label','历史层级');
        for(const [value,title]of [['scenes','场景'],['facts','事件'],['days','日记'],['weeks','周记'],['chapters','篇章']]){const option=node('option',title);option.value=value;scope.append(option);}scope.value=level;form.append(scope);
    }
    form.onsubmit=event=>{event.preventDefault();reload({query:input.value,page:1,level:scope?.value??level});};
    fragment.append(form);
    const collection=data[kind],summary=node('p',`共${collection.total}条 · 第${collection.page}页`,'fields-note');fragment.append(summary);
    const saved=chatContext?.chatMetadata?.[KEY];
    const annotations=saved?.campaignId===data.reference?.campaignId?saved:null;
    const editor=(card,id,judgment=false)=>{
        const label=node('label',judgment?'我的判断':'人物笔记'),field=node(judgment?'select':'textarea');
        const group=judgment?'judgments':'notes',draftKey=`${data.reference?.campaignId}:${group}:${id}`;
        if(judgment)for(const text of ['尚未判断','可信','存疑','不可信']){const option=node('option',text);option.value=text;field.append(option);}
        field.value=drafts.get(container)?.get(draftKey)??annotations?.[group]?.[id]??(judgment?'尚未判断':'');
        field.setAttribute('aria-label',judgment?'我的判断':'人物笔记');if(!judgment)field.rows=3;
        field.oninput=()=>{let cache=drafts.get(container);if(!cache){cache=new Map();drafts.set(container,cache);}cache.set(draftKey,field.value);};
        const button=node('button','保存'),status=node('span',undefined,'fields-note');button.type='button';label.append(field);card.append(label,button,status);
        button.onclick=async()=>{
            if(!chatContext?.chatMetadata||!chatContext.saveChat){status.textContent='当前聊天不能保存笔记。';return;}
            if(!isCurrent()||chatContext.chatMetadata.infinite_fields?.campaignId!==data.reference?.campaignId){status.textContent='聊天已切换，请重新打开面板。';return;}
            button.disabled=true;
            const previous=chatContext.chatMetadata[KEY],next=previous?.campaignId===data.reference.campaignId?structuredClone(previous):{campaignId:data.reference.campaignId,notes:{},judgments:{}};
            next[group]??={};next[group][id]=field.value;chatContext.chatMetadata[KEY]=next;
            try{await chatContext.saveChat();status.textContent='已保存';drafts.get(container)?.delete(draftKey);}
            catch{if(chatContext.chatMetadata[KEY]===next)chatContext.chatMetadata[KEY]=previous;status.textContent='保存失败，内容仍保留，请重试。';}
            finally{button.disabled=false;}
        };
    };
    const list=node('div',undefined,'fields-history-list');fragment.append(list);
    if(!collection.items.length)list.append(node('p',query?'没有找到相符记录。':{people:'尚无已记录的相遇。',chronicle:'尚无已记录的经历。',rumors:'尚未听到登记传闻。'}[kind],'fields-note'));
    for(const row of collection.items){
        const card=node('article',undefined,'fields-history-card');list.append(card);
        if(kind==='people'){
            const avatar=node('span',row.identity.slice(0,1),'fields-history-avatar');avatar.setAttribute('aria-hidden','true');card.append(avatar,node('h3',row.name),node('p',row.identity));
            card.append(node('p',`最后获知位置：${row.location} · ${row.locationTime}`,'fields-note'),node('p',row.description));
            card.append(node('p',`信任 ${row.relationship.trust} · 亲近 ${row.relationship.affection} · 敬重 ${row.relationship.respect} · 畏惧 ${row.relationship.fear}`));
            card.append(node('h4','共同经历'));if(!row.shared.length)card.append(node('p','尚无共同经历摘记。','fields-note'));
            for(const event of row.shared)card.append(node('p',`${event.time}：${event.text}`));
            card.append(node('h4','彼此的承诺'));if(!row.promises.length)card.append(node('p','尚无彼此的承诺。','fields-note'));
            for(const promise of row.promises)card.append(node('p',`${promise.text}${promise.deadline?` · 期限 ${promise.deadline}`:''}`));
            editor(card,row.id);
        }else{
            card.append(node('p',row.time,'fields-note'),node('p',row.text));
            if(kind==='rumors'){card.append(node('p',`听自：${row.source} · ${row.reliability}`,'fields-note'));editor(card,row.id,true);}
        }
    }
    const navigation=node('nav',undefined,'fields-history-pages');navigation.setAttribute('aria-label','记录翻页');
    for(const [text,next,disabled]of [['上一页',page-1,page<=1],['下一页',page+1,page*collection.pageSize>=collection.total]]){const button=node('button',text);button.type='button';button.disabled=disabled;button.onclick=()=>reload({query,page:next,level});navigation.append(button);}fragment.append(navigation);
    container.classList.add('fields-history');container.replaceChildren(fragment);
}

export function registerHistoryPanels({registerPanel},getChatContext=null){
    for(const [id,title]of [['people','人物'],['chronicle','编年史'],['rumors','传闻']])registerPanel({id,title,render:(container,context)=>{
        const getCurrent=getChatContext??context.getChatContext??(()=>null),chatContext=getCurrent();
        const load=async options=>{
            const request={};pending.set(container,request);container.textContent='正在读取已知经历…';
            try{
                const data=await context.api('ui/history',options);
                if(container.isConnected&&pending.get(container)===request)renderHistoryPanel(container,data,id,{...options,reload:load,chatContext,isCurrent:()=>{const current=getCurrent();return current?.chatId===chatContext?.chatId&&current?.chatMetadata===chatContext?.chatMetadata;}});
            }catch{if(container.isConnected&&pending.get(container)===request)container.textContent='经历读取失败，请关闭面板后重试。';}
        };
        return load({query:'',page:1,level:'scenes'});
    }});
}
