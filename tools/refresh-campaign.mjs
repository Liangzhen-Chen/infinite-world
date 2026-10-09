import fs from 'node:fs';
import path from 'node:path';
import {coreRules,startingFacts,gmName} from './world-content.mjs';
const root=path.resolve(import.meta.dirname,'..');
const url='http://127.0.0.1:8000';
const initial=await fetch(`${url}/csrf-token`);
const token=(await initial.json()).token;
const cookie=initial.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
async function post(endpoint,body) {
    const response=await fetch(`${url}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token,'Cookie':cookie},body:JSON.stringify(body)});
    if(!response.ok) throw new Error(`${endpoint}: ${response.status}`);
    const raw=await response.text();
    try{return JSON.parse(raw);}catch{return raw;}
}
const seedFile=path.join(root,'SillyTavern/public/scripts/extensions/third-party/infinite-fields/seed.json');
const seed=JSON.parse(fs.readFileSync(seedFile,'utf8'));
seed.state.professions ??= {combat:'',life:[],hidden:[]};seed.state.pets ??= {};
seed.memories=Object.fromEntries(startingFacts.map(v=>[`${v.subject}::${v.key}`,{...v,updated:0}]));
fs.writeFileSync(seedFile,JSON.stringify(seed,null,2));
const cardFile=path.join(root,'跑团资料/无限原野主持人.json');
const card=JSON.parse(fs.readFileSync(cardFile,'utf8'));card.data.description=coreRules;
fs.writeFileSync(cardFile,JSON.stringify(card,null,2));
const entry=JSON.parse(fs.readFileSync(path.join(root,'跑团资料/战役入口.json'),'utf8'));
await post('/api/characters/edit-attribute',{avatar_url:entry.avatar,ch_name:gmName,field:'description',value:coreRules});
const settingsFile=path.join(root,'SillyTavern/data/default-user/settings.json');
const settings=JSON.parse(fs.readFileSync(settingsFile,'utf8'));
settings.oai_settings.prompts.find(v=>v.identifier==='jailbreak').content='回答前核对账本与相关长期记忆。不要重置熟人的态度，不要把承诺写成履行。交易、施法与旅行必须实际记账。只叙述玩家这次明确行动的结果，不擅自换位置或安排下一步。只有已有可见、可听或传话渠道，其他NPC才知道屋内行动。重要新经历用记忆工具存储。叙述用简体中文。';
settings.background={name:'cityscape medieval market.jpg',url:'url("backgrounds/cityscape%20medieval%20market.jpg")',isDefault:true};
await post('/api/settings/save',settings);
fs.writeFileSync(path.join(root,'跑团资料/中文跑团预设.json'),JSON.stringify(settings.oai_settings,null,2));
const chats=path.join(root,'SillyTavern/data/default-user/chats',entry.avatar.slice(0,-4));
let upgraded=0;
for(const file of fs.readdirSync(chats).filter(v=>v.endsWith('.jsonl'))) {
    const location=path.join(chats,file);
    const lines=fs.readFileSync(location,'utf8').split('\n').filter(Boolean).map(v=>JSON.parse(v));
    const campaign=lines[0]?.chat_metadata?.infinite_fields;
    if(!campaign) continue;
    campaign.state.professions ??= {combat:'',life:[],hidden:[]};campaign.state.pets ??= {};
    for(const fact of startingFacts) {
        const key=`${fact.subject}::${fact.key}`;
        if(campaign.memories[key]?.updated===0) campaign.memories[key]={...fact,updated:0};
    }
    fs.writeFileSync(location,lines.map(v=>JSON.stringify(v)).join('\n'));
    upgraded++;
}
console.log(JSON.stringify({updated:true,upgradedChats:upgraded}));
