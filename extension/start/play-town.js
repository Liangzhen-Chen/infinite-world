import {initializeSettings,getSettings,normalizeSettings,updateSettings,subscribeSettings} from '../ui-settings.mjs';
import {openPanel} from '../ui-shell.mjs';

export const SAVE_KEY='infinite-fields-start-saves';
const ANNOTATIONS='fields_people_history';
export const attributes=['力量','敏捷','体质','智力','精神','魅力'];

export function arrivalText(overview,history,{opening=false}={}){
    const p=overview.player;
    if(opening)return {title:'初到河湾',paragraphs:[overview.date.text,
        '你来到西陲的河湾村。村子沿浅河分成两岸，桥头有人卖热面包，旧磨坊的水轮停着，磨坊门口却已经排了三辆装粮的车。',
        '路边的小酒馆叫“青灯”。老板娘林穗正在晾床单，看见你背着行囊，停下手里的活：“住店还是找人？楼上有间空房，一天六枚铜币。要是想长住，可以商量。”',
        '她的弟弟阿砚从河边回来，裤腿湿到膝盖，把一截裂开的木轴放在门槛旁。林穗看了一眼，没有催你帮忙，先把门让开了。',
        `${p.name}，你现在有${p.coins}枚铜币，生命${p.hp}/${p.maxHp}，魔力${p.mp}/${p.maxMp}。你暂时没有正式职业，可以从眼前的生活开始。`]};
    const rows=history.chronicle.items.slice(0,5).reverse();
    return {title:'前情提要',paragraphs:[`${overview.date.text}，${p.name}停留在${overview.locationPath.join(' · ')}。钱袋中有${p.coins}枚铜币。`,
        ...rows.map(row=>`${row.time}：${row.text}`),...(!rows.length?['尚无已登记的经历。']:[])]};
}

export function makeBackup(bundle,session,settings){
    if(session.reference.campaignId!==bundle.metadata.id)throw Error('备份与当前角色不一致，请重新读取');
    return {format:'infinite-fields-play-v1',bundle,session:structuredClone(session),settings:normalizeSettings(settings)};
}
export function unpackBackup(value){
    if(value?.format==='infinite-fields-server-v2')return {bundle:value,session:{chat:[],metadata:{}},settings:null};
    if(value?.format!=='infinite-fields-play-v1'||!value.bundle||!Array.isArray(value.session?.chat)||!value.session?.metadata)throw Error('请选择无限原野的存档备份');
    if(value.session.reference?.campaignId!==value.bundle.metadata?.id)throw Error('备份角色与聊天记录不一致');
    return {bundle:value.bundle,session:structuredClone(value.session),settings:normalizeSettings(value.settings)};
}
export function remapSession(session,reference){
    const next=structuredClone(session);next.reference=reference;next.chatId=null;next.metadata??={};next.metadata.infinite_fields=reference;
    if(next.metadata[ANNOTATIONS])next.metadata[ANNOTATIONS].campaignId=reference.campaignId;
    delete next.metadata.fields_history_window;delete next.metadata.fields_history_usage;
    return next;
}

// The host supplies authenticated local requests. Only the embedded host can
// answer this bridge; no model transport is called by the start page.
export function hostBridge(frame){
    let sequence=0;const pending=new Map();
    window.addEventListener('message',event=>{
        if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='fields-start-result')return;
        const job=pending.get(event.data.id);if(!job)return;pending.delete(event.data.id);clearTimeout(job.timer);
        if(event.data.error)job.reject(Error(event.data.error));else job.resolve(event.data.value);
    });
    return (action,data={})=>new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('本地游戏未就绪，请刷新页面后再试'));},30000);
        pending.set(id,{resolve,reject,timer});frame.contentWindow.postMessage({type:'fields-start-request',id,action,data},location.origin);
    });
}

export async function mountStart(doc=document){
    initializeSettings();
    const frame=doc.querySelector('#game-host'),bridge=hostBridge(frame),status=doc.querySelector('#start-status');
    const request=(endpoint,body={})=>bridge('api',{endpoint,body});
    let saves=[],selected=null,busy=false;
    try{saves=JSON.parse(localStorage.getItem(SAVE_KEY))??[];if(!Array.isArray(saves))saves=[];}catch{status.textContent='本机存档列表未能读取。可以导入备份。';}
    const persist=()=>{localStorage.setItem(SAVE_KEY,JSON.stringify(saves));};
    const remember=session=>{
        const found=saves.findIndex(row=>row.reference.campaignId===session.reference.campaignId);
        const next={...session,savedAt:new Date().toISOString()};if(found<0)saves.unshift(next);else saves[found]=next;
        selected=next;persist();renderSaves();doc.querySelector('#backup-button').disabled=false;
    };
    const run=async task=>{
        if(busy)return;busy=true;doc.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{await task();}catch(error){status.textContent=error.message;}
        finally{busy=false;doc.querySelectorAll('button').forEach(b=>b.disabled=false);doc.querySelector('#backup-button').disabled=!selected;}
    };
    const snapshot=async()=>{const current=await bridge('snapshot');if(current?.reference){remember(current);if(doc.body.classList.contains('fields-start-playing'))updateSettings(current.settings);}return current;};
    subscribeSettings(settings=>{if(doc.body.classList.contains('fields-start-playing'))bridge('settings',settings).catch(error=>status.textContent=error.message);});
    const showHome=()=>{frame.hidden=true;doc.querySelector('#arrival').hidden=true;doc.querySelector('#start-home').hidden=false;doc.body.classList.remove('fields-start-playing');};
    const prepare=async(session,opening=false)=>{
        const campaignId=session.reference.campaignId;status.textContent='正在读取已发生的经历。';
        const current=await request('read',{campaignId});
        const overview=await request('ui/overview',{campaignId}),history=await request('ui/history',{campaignId,level:'scenes',pageSize:5});
        if(current.reference.head!==overview.reference.head||overview.reference.head!==history.reference.head)throw Error('读取期间存档已变化，请重新选择继续');
        const knowledge=await request('catalog',{campaignId,kind:'location',entity:current.document.state.location});
        const text=arrivalText(overview,history,{opening});selected={...session,name:overview.player.name};
        doc.querySelector('#arrival-title').textContent=text.title;
        const box=doc.querySelector('#arrival-text');box.replaceChildren();
        for(const paragraph of text.paragraphs){const p=doc.createElement('p');p.textContent=paragraph;box.append(p);}
        doc.querySelector('#loading-knowledge').textContent=`${knowledge.name}：${knowledge.description}`;
        doc.querySelector('#start-home').hidden=true;doc.querySelector('#arrival').hidden=false;frame.hidden=true;
        status.textContent='存档已读取。';
        doc.querySelector('#enter-button').onclick=()=>run(async()=>{
            await bridge('enter',{session:selected,opening:opening?text.paragraphs.join('\n\n'):null,settings:getSettings()});
            await snapshot();doc.querySelector('#arrival').hidden=true;frame.hidden=false;doc.body.classList.add('fields-start-playing');status.textContent='行动会自动记入本地存档。';
        });
    };
    const download=async session=>{
        const bundle=await request('export',{campaignId:session.reference.campaignId}),backup=makeBackup(bundle,session,getSettings());
        const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));
        const link=doc.createElement('a');link.href=url;link.download=`无限原野-${session.name??'旅人'}-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='备份已保存。';
    };
    function renderSaves(){
        const box=doc.querySelector('#saved-games');box.replaceChildren();
        if(!saves.length){const p=doc.createElement('p');p.textContent='尚无本机记录。可以创建角色或导入备份。';box.append(p);}
        for(const session of saves){
            const card=doc.createElement('article');card.className='start-save';const p=doc.createElement('p');p.textContent=`${session.name??'旅人'} · ${new Date(session.savedAt).toLocaleString('zh-CN')}`;card.append(p);
            for(const [title,task]of [['继续',()=>prepare(session)],['导出备份',async()=>{const current=await snapshot();await download(current?.reference?.campaignId===session.reference.campaignId?current:session);}],['移除本机记录',async()=>{saves=saves.filter(row=>row!==session);if(selected?.reference.campaignId===session.reference.campaignId)selected=null;persist();renderSaves();status.textContent='本机记录已移除，已保存的备份仍可导入。';}]]){
                const button=doc.createElement('button');button.textContent=title;button.onclick=()=>run(task);card.append(button);
            }box.append(card);
        }
    }
    const inputs=attributes.map(name=>{
        const label=doc.createElement('label');label.textContent=name;const input=doc.createElement('input');input.name=name;input.type='number';input.min=8;input.max=16;input.value=10;input.required=true;label.append(input);doc.querySelector('#attributes').append(label);return input;
    });
    const total=()=>doc.querySelector('#attribute-total').textContent=`已分配 ${inputs.reduce((sum,i)=>sum+Number(i.value),0)} / 60 点`;
    inputs.forEach(input=>input.oninput=total);total();renderSaves();
    doc.querySelector('#character-form').onsubmit=event=>{event.preventDefault();run(async()=>{
        const form=new FormData(event.target),values=Object.fromEntries(inputs.map(i=>[i.name,Number(i.value)]));
        if(Object.values(values).reduce((a,b)=>a+b,0)!==60)throw Error('请将六项属性分配为60点');
        status.textContent='正在创建角色。';const created=await request('create',{character:{name:form.get('name'),gender:form.get('gender'),appearance:form.get('appearance'),attributes:values,birthplace:'loc_hw'}});
        const session={reference:created.reference,chat:[],metadata:{infinite_fields:created.reference},name:created.document.state.player.name};remember(session);await prepare(session,true);
    });};
    doc.querySelector('#import-file').onchange=event=>run(async()=>{
        const file=event.target.files[0];if(!file)return;const backup=unpackBackup(JSON.parse(await file.text()));status.textContent='正在校验并导入备份。';
        const imported=await request('import',{bundle:backup.bundle}),session=remapSession(backup.session,imported.reference);
        session.name=imported.document.state.player.name;remember(session);if(backup.settings)updateSettings(backup.settings);event.target.value='';await prepare(session);
    });
    doc.querySelector('#home-button').onclick=()=>run(async()=>{await snapshot();showHome();status.textContent='已保存当前进度。';});
    doc.querySelector('#settings-button').onclick=()=>openPanel('settings');
    doc.querySelector('#backup-button').onclick=()=>run(async()=>{const target=selected,current=await snapshot();await download(current?.reference?.campaignId===target.reference.campaignId?current:target);});
    const ready=()=>run(async()=>{await bridge('hello');status.textContent='可以继续游戏或创建角色。';});
    frame.addEventListener('load',ready,{once:true});
    if(frame.contentWindow?.infiniteFieldsV2)ready();
}
if(typeof document!=='undefined'&&document.querySelector('#start-home'))mountStart();
