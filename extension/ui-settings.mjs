import {registerPanel,settingsSections} from './ui-shell.mjs';
const KEY='infinite-fields-reading';
const defaults={theme:'dark',fontSize:18,highContrast:false,reducedMotion:false,volume:60,muted:false};
let settings={...defaults};
const listeners=new Set();
let stopFormSync=null;
export function normalizeSettings(value={}){
    return {theme:value.theme==='light'?'light':'dark',fontSize:[16,18,20,22,24].includes(value.fontSize)?value.fontSize:18,
        highContrast:value.highContrast===true,reducedMotion:value.reducedMotion===true,
        volume:Number.isFinite(value.volume)?Math.max(0,Math.min(100,value.volume)):60,muted:value.muted===true};
}
export function getSettings(){return {...settings};}
export function subscribeSettings(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export function applySettings(){
    const body=document.body;body.dataset.fieldsTheme=settings.theme;
    body.classList.toggle('fields-high-contrast',settings.highContrast);body.classList.toggle('fields-reduced-motion',settings.reducedMotion);
    body.style.setProperty('--fields-font-size',`${settings.fontSize}px`);
    for(const audio of document.querySelectorAll('[data-fields-audio]')){audio.volume=settings.volume/100;audio.muted=settings.muted;}
    for(const listener of listeners)listener(getSettings());
}
export function updateSettings(patch){
    settings=normalizeSettings({...settings,...patch});applySettings();
    try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{/* Reading controls still work when browser storage is unavailable. */}
}
export function initializeSettings(){
    try{settings=normalizeSettings(JSON.parse(localStorage.getItem(KEY))??defaults);}catch{settings={...defaults};}
    if(!localStorageValue()&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)settings.reducedMotion=true;
    applySettings();registerPanel({id:'settings',title:'阅读设置',render:renderSettings});
}
function localStorageValue(){try{return localStorage.getItem(KEY);}catch{return null;}}
export function renderSettings(container){
    stopFormSync?.();
    const doc=container.ownerDocument;container.replaceChildren();
    const form=doc.createElement('div');form.className='fields-settings';
    function control(text,node){const label=doc.createElement('label');label.append(doc.createTextNode(text),node);form.append(label);}
    for(const [key,title,options]of [['theme','主题',[['dark','夜灯与旧木'],['light','羊皮纸']]],['fontSize','正文字号',[[16,'16 px'],[18,'18 px'],[20,'20 px'],[22,'22 px'],[24,'24 px']]]]){
        const select=doc.createElement('select');select.setAttribute('aria-label',title);
        for(const [value,text]of options){const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option);}
        select.value=settings[key];select.onchange=()=>updateSettings({[key]:key==='fontSize'?Number(select.value):select.value});control(title,select);
    }
    const sharedBoxes=new Map();
    for(const [key,title]of [['highContrast','高对比度'],['reducedMotion','减少动画'],['muted','静音']]){
        const input=doc.createElement('input');input.type='checkbox';input.checked=settings[key];input.onchange=()=>updateSettings({[key]:input.checked});control(title,input);sharedBoxes.set(key,input);
    }
    const volume=doc.createElement('input');volume.type='range';volume.min=0;volume.max=100;volume.value=settings.volume;volume.setAttribute('aria-label','音量');volume.oninput=()=>updateSettings({volume:Number(volume.value)});control('音量',volume);
    const sample=doc.createElement('p');sample.className='fields-reading-sample';sample.textContent='雨停之后，檐角仍在滴水。你收好行囊，沿着石路走向村口。';form.append(sample);
    for(const section of settingsSections()){const node=doc.createElement('section'),title=doc.createElement('h3');title.textContent=section.title;node.append(title);section.render(node,{getSettings,updateSettings});form.append(node);}
    container.append(form);
    stopFormSync=subscribeSettings(value=>{
        if(!container.isConnected){stopFormSync?.();stopFormSync=null;return;}
        volume.value=value.volume;
        for(const [key,input]of sharedBoxes)input.checked=value[key];
    });
}
