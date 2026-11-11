import {registerPanel,settingsSections} from './ui-shell.mjs';
import {aiProfile,DEFAULT_AI_PROFILE} from './turn.mjs';
const KEY='infinite-fields-reading';
const defaults={theme:'dark',fontSize:18,highContrast:false,reducedMotion:false,volume:60,muted:false,aiProfile:DEFAULT_AI_PROFILE};
// Card text per profile; T0 wording is fixed by AI-01 section 8.
const AI_PROFILE_CARDS=[['T0','无 AI','不用任何模型。所有玩法都能玩，用菜单、构造器和打字（打字由本地规则理解，不如模型准）。费用 0。'],
    ['T1','轻理解','模型只负责理解你的输入并推荐已登记的做法，需手动确认；不叙述，不提出开放动作。需要自备密钥并产生费用。'],
    ['T2','叙述','模型理解自由输入并提出开放动作，结算后补叙。需要自备密钥并产生费用。'],
    ['T3','全开','在叙述档之上开放更多模型辅助。需要自备密钥并产生费用。']];
let settings={...defaults};
const listeners=new Set();
let stopFormSync=null;
export function normalizeSettings(value={}){
    return {theme:value.theme==='light'?'light':'dark',fontSize:[16,18,20,22,24].includes(value.fontSize)?value.fontSize:18,
        highContrast:value.highContrast===true,reducedMotion:value.reducedMotion===true,
        volume:Number.isFinite(value.volume)?Math.max(0,Math.min(100,value.volume)):60,muted:value.muted===true,
        aiProfile:aiProfile(value)};
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
export function renderSettings(container,data={}){
    stopFormSync?.();
    const doc=container.ownerDocument;container.replaceChildren();
    const form=doc.createElement('div');form.className='fields-settings';
    function control(text,node){const label=doc.createElement('label');label.append(doc.createTextNode(text),node);form.append(label);}
    const selects=new Map();
    for(const [key,title,options]of [['theme','主题',[['dark','夜灯与旧木'],['light','羊皮纸']]],['fontSize','正文字号',[[16,'16 px'],[18,'18 px'],[20,'20 px'],[22,'22 px'],[24,'24 px']]]]){
        const select=doc.createElement('select');select.setAttribute('aria-label',title);
        for(const [value,text]of options){const option=doc.createElement('option');option.value=value;option.textContent=text;select.append(option);}
        select.value=settings[key];select.onchange=()=>updateSettings({[key]:key==='fontSize'?Number(select.value):select.value});control(title,select);selects.set(key,select);
    }
    const profileBox=doc.createElement('fieldset');profileBox.className='fields-ai-profile';
    const legend=doc.createElement('legend');legend.textContent='AI 档位';profileBox.append(legend);const profileRadios=new Map();
    for(const [id,title,text]of AI_PROFILE_CARDS){
        const label=doc.createElement('label'),radio=doc.createElement('input'),words=doc.createElement('span');
        radio.type='radio';radio.name='fields-ai-profile';radio.value=id;radio.checked=settings.aiProfile===id;radio.onchange=()=>{if(radio.checked)updateSettings({aiProfile:id});};
        words.textContent=title+'：'+text;label.append(radio,words);profileBox.append(label);profileRadios.set(id,radio);
    }
    form.append(profileBox);
    const sharedBoxes=new Map();
    for(const [key,title]of [['highContrast','高对比度'],['reducedMotion','减少动画'],['muted','静音']]){
        const input=doc.createElement('input');input.type='checkbox';input.checked=settings[key];input.onchange=()=>updateSettings({[key]:input.checked});control(title,input);sharedBoxes.set(key,input);
    }
    const volume=doc.createElement('input');volume.type='range';volume.min=0;volume.max=100;volume.value=settings.volume;volume.setAttribute('aria-label','音量');volume.oninput=()=>updateSettings({volume:Number(volume.value)});control('音量',volume);
    const sample=doc.createElement('p');sample.className='fields-reading-sample';sample.textContent='雨停之后，檐角仍在滴水。你收好行囊，沿着石路走向村口。';form.append(sample);
    if(data.view){const level=doc.createElement('p');level.textContent=`战役开放动作：${{off:'关闭（仍可留下痕迹）',limited:'受限原语',full:'全部原语，仍校验权限'}[data.view.document.state.records?.action_config?.openActions??'full']}。此设置由存档决定；当前服务未提供配置写入口。`;form.append(level);}
    for(const section of settingsSections()){const node=doc.createElement('section'),title=doc.createElement('h3');title.textContent=section.title;node.append(title);section.render(node,{getSettings,updateSettings});form.append(node);}
    container.append(form);
    stopFormSync=subscribeSettings(value=>{
        if(!container.isConnected){stopFormSync?.();stopFormSync=null;return;}
        volume.value=value.volume;for(const [id,radio]of profileRadios)radio.checked=value.aiProfile===id;
        for(const [key,select]of selects)select.value=value[key];
        for(const [key,input]of sharedBoxes)input.checked=value[key];
    });
}
