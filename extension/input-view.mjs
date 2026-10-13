export function inputForMode(text,mode){
    const body=String(text).replace(/^我说：“([\s\S]*)”$/, '$1').replace(/^我准备/, '');
    return mode==='say'?`我说：“${body}”`:`我准备${body}`;
}
export function prepareInput(input,text){
    input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
    const caret=text==='我说：“”'?4:text.length;input.setSelectionRange(caret,caret);
}
export function mountInput(context){
    const input=document.querySelector('#send_textarea');if(!input)return;
    let bar=document.querySelector('#fields-input-actions');
    if(bar?.fieldsContext===context&&bar.fieldsChat===context.chatId)return;
    bar?.remove();bar=document.createElement('div');bar.id='fields-input-actions';bar.fieldsContext=context;bar.fieldsChat=context.chatId;
    bar.setAttribute('aria-label','准备行动');
    const modes=[];
    const choose=mode=>{prepareInput(input,inputForMode(input.value,mode));for(const button of modes)button.setAttribute('aria-pressed',String(button.dataset.mode===mode));};
    for(const [mode,title]of [['say','说'],['do','做']]){
        const button=document.createElement('button');button.type='button';button.textContent=title;button.dataset.mode=mode;button.setAttribute('aria-pressed','false');button.onclick=()=>choose(mode);modes.push(button);bar.append(button);
    }
    for(const [title,text]of [['观察','我仔细观察周围。'],['问候','我说：“你好。”'],['问价','我说：“请问要多少钱？”'],['休息','我想找个合适的地方休息。']]){
        const button=document.createElement('button');button.type='button';button.textContent=title;
        button.onclick=()=>prepareInput(input,input.value?`${input.value}\n${text}`:text);bar.append(button);
    }
    const status=document.createElement('span');status.className='fields-note';status.textContent='只填入输入框，由你确认发送。';bar.append(status);
    input.before(bar);
    // One handler on the current input; stale chat contexts do not handle keys.
    if(input.fieldsShortcuts)input.removeEventListener('keydown',input.fieldsShortcuts);
    input.fieldsShortcuts=event=>{
        if(!document.body.classList.contains('fields-play-active')||context.chatMetadata?.fields_ui?.shortcuts===false||event.isComposing||event.repeat||!event.altKey||event.ctrlKey||event.metaKey)return;
        if(event.code==='Digit1'||event.code==='Digit2'){event.preventDefault();choose(event.code==='Digit1'?'say':'do');}
    };input.addEventListener('keydown',input.fieldsShortcuts);
}
