const panels=new Map(),settingSections=new Map();
let current=null,context={},navigation=null,modulesLoaded=false;
// Independent ui-*.mjs modules export registerUI(shell) and call registerPanel.
export function registerPanel({id,title,render}){panels.set(id,{id,title,render});if(navigation)mountPanelButtons(navigation);}
export function registerSettingsSection({id,title,render}){settingSections.set(id,{id,title,render});}
export function settingsSections(){return [...settingSections.values()];}
export function setPanelContext(next){context=next;if(current)renderCurrent();}
export function mountPanelButtons(container){
    navigation=container;container.replaceChildren();
    for(const panel of panels.values()){
        const button=container.ownerDocument.createElement('button');button.textContent=panel.title;
        button.onclick=()=>openPanel(panel.id);button.dataset.panel=panel.id;container.append(button);
    }
}
function renderCurrent(){
    const content=document.querySelector('#fields-panel-content');
    if(content&&current){
        const panel=panels.get(current);
        try{Promise.resolve(panel?.render(content,context)).catch(error=>{
            if(content.isConnected&&panels.get(current)===panel)content.textContent=`面板读取失败：${error.message}`;
        });}catch(error){content.textContent=`面板读取失败：${error.message}`;}
    }
}
export function openPanel(id){
    const panel=panels.get(id);if(!panel)return;
    const previous=document.querySelector('#fields-dialog');
    const menu=document.querySelector('.fields-menu-toggle');
    const opener=previous?.fieldsOpener??(menu?.getClientRects().length?menu:document.activeElement);previous?.remove();current=id;
    const dialog=document.createElement('dialog');dialog.fieldsOpener=opener;dialog.id='fields-dialog';dialog.className='fields-ledger fields-drawer';dialog.setAttribute('aria-labelledby','fields-panel-title');
    const dismiss=()=>{
        if(!dialog.isConnected)return;
        if(dialog.open)dialog.close();
        if(document.querySelector('#fields-dialog')===dialog)current=null;
        dialog.remove();if(opener?.isConnected)opener.focus();
    };
    // Capture before a focused control can consume Escape. Remove synchronously;
    // the native close event is queued and must not leave a stale drawer in DOM.
    dialog.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}
    },{capture:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
    const header=document.createElement('header');header.className='fields-ledger-header';
    const title=document.createElement('h2');title.id='fields-panel-title';title.textContent=panel.title;
    const close=document.createElement('button');close.textContent='关闭';close.onclick=dismiss;header.append(title,close);
    const tabs=document.createElement('nav');tabs.className='fields-panel-tabs';tabs.setAttribute('aria-label','面板');
    for(const option of panels.values()){const button=document.createElement('button');button.textContent=option.title;button.setAttribute('aria-pressed',String(option.id===id));button.onclick=()=>openPanel(option.id);tabs.append(button);}
    const content=document.createElement('div');content.id='fields-panel-content';dialog.append(header,tabs,content);
    dialog.addEventListener('close',dismiss);
    document.body.append(dialog);renderCurrent();dialog.showModal();
}
export async function loadUIModules(api){
    if(modulesLoaded)return;
    const {modules}=await api('ui/modules');
    for(const name of modules){
        if(!/^ui-[a-z0-9-]+\.mjs$/.test(name))throw Error('界面模块路径无效');
        const module=await import(new URL(`./${name}`,import.meta.url));
        if(module.registerUI)await module.registerUI({registerPanel,registerSettingsSection});
    }
    modulesLoaded=true;
}
