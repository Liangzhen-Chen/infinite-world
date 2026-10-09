import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { coreRules,firstMessage,lore,residents,startingFacts,worldName,gmName } from './world-content.mjs';
import { createCampaign } from '../SillyTavern/public/scripts/extensions/third-party/infinite-fields/core.js';

const root=path.resolve(import.meta.dirname,'..');
const st=path.join(root,'SillyTavern');
const url='http://127.0.0.1:8000';
const init=await fetch(`${url}/csrf-token`);
const token=(await init.json()).token;
const cookies=init.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
async function post(endpoint,payload) {
    const headers={'Cookie':cookies,'X-CSRF-Token':token};
    const form=payload instanceof FormData;
    if(!form) headers['Content-Type']='application/json';
    const response=await fetch(`${url}${endpoint}`,{method:'POST',headers,body:form?payload:JSON.stringify(payload)});
    if(!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    return response.json();
}

const state={
    minute:540,location:'河湾村·青灯酒馆',
    player:{name:'旅人',level:1,xp:0,coins:180,hp:12,maxHp:12,mp:10,maxMp:10,revivalAnchor:'河湾村'},
    inventory:{干粮:3,旧木杖:1,行囊:1,普通衣服:1},
    skills:{照明术:{proficiency:10,grade:'初级1等'}},
    spells:{照明术:{name:'照明术',mp:1,materials:[],duration:60,effect:'近处一个物体发出柔光一小时，不造成伤害。'}},
    npcs:Object.fromEntries(residents.map(([name,occupation,notes,location])=>[name,{occupation,trust:0,affection:0,notes,location}])),
    records:{},
    settlement:{name:'河湾村',population:58,food:420,wood:28,stone:12,iron:4,treasury:640,foodPerDay:45,woodPerDay:2,simulationEnabled:true,unmetMeals:0},
};
const seed={state,memories:Object.fromEntries(startingFacts.map(v=>[`${v.subject}::${v.key}`,{...v,updated:0}]))};
const extensionDir=path.join(st,'public/scripts/extensions/third-party/infinite-fields');
fs.writeFileSync(path.join(extensionDir,'seed.json'),JSON.stringify(seed,null,2));

const entries=Object.fromEntries(lore.map(([comment,key,content,constant=false],index)=>[index,{
    uid:index,key,keysecondary:[],comment,content,constant,selective:false,order:100-index,position:0,disable:false,
    displayIndex:index,addMemo:true,group:'',groupOverride:false,groupWeight:100,sticky:0,cooldown:0,delay:0,
    probability:100,useProbability:true,depth:4,role:null,vectorized:false,excludeRecursion:false,preventRecursion:false,
    delayUntilRecursion:false,scanDepth:6,caseSensitive:false,matchWholeWords:false,useGroupScoring:false,automationId:'',
} ]));
const world={name:worldName,entries,extensions:{description:'参照《再生勇士》的系统方向设计，原创地图与NPC；可作为独立世界书导入。'}};
await post('/api/worldinfo/edit',{name:worldName,data:world});
fs.mkdirSync(path.join(root,'跑团资料'),{recursive:true});
fs.writeFileSync(path.join(root,'跑团资料','无限原野世界书.json'),JSON.stringify(world,null,2));

const card={spec:'chara_card_v2',spec_version:'2.0',data:{
    name:gmName,description:coreRules,
    personality:'公平、细致、有持续记忆的世界主持人。根据具体社会关系和经济条件塑造人物，不迎合所有请求。叙述自然克制，尊重玩家行动。',
    scenario:'玩家是一名成年再生者，刚来到河湾村。当前世界状态以本地账本为准；世界不限于村庄，八大地区可按合理路线探索。',
    first_mes:firstMessage,
    mes_example:`<START>\n{{user}}: 我问林穗，能不能先看看空房。\n{{char}}: “可以。”林穗从柜台下拿出钥匙，沿木梯上楼。她打开朝河的房门：一张窄床，一张桌子，窗框上贴着防风布。“屋顶去年补过，雨大时这面墙有点潮。住一天六铜，住一周可以三十五铜。你先看看，不合适也没关系。”\n<START>\n{{user}}: 我说既然帮过他，那我应该能进他家吧。\n{{char}}: 先核对与这位居民的共同经历及进门约定，再按当时关系回答。曾经帮助过他会改变判断，但不能凭空断定拥有全部私人空间的使用权。`,
    creator_notes:'本地中文单人开放世界跑团。世界书、账本与历史检索相互配合。重要事实存入长期记忆；规则仍由AI裁定，不是完整自治世界模拟器。',
    system_prompt:'',post_history_instructions:'',alternate_greetings:[],tags:['中文','单人跑团','剑与魔法','生活','长期记忆'],creator:'本地配置',character_version:'1.0',
    extensions:{world:worldName,fav:true,talkativeness:0.5},
}};
fs.writeFileSync(path.join(root,'跑团资料','无限原野主持人.json'),JSON.stringify(card,null,2));
const existing=await post('/api/characters/all',{});
if(existing.some(v=>v.name===gmName)) throw new Error('该主持人已存在。为保护存档，本配置脚本不覆盖现有角色。');
const form=new FormData();
form.append('avatar',new Blob([JSON.stringify(card)],{type:'application/json'}),'infinite-fields.json');
form.append('file_type','json');
const imported=await post('/api/characters/import',form);
const avatar=`${imported.file_name}.png`;
const character=await post('/api/characters/get',{avatar_url:avatar});
const chatFile=character.chat;
await post('/api/chats/save',{avatar_url:avatar,file_name:chatFile,force:true,chat:[
    {user_name:'旅人',character_name:gmName,chat_metadata:{integrity:randomUUID(),["infinite_fields"]:createCampaign(seed)}},
    {name:gmName,is_user:false,is_system:false,send_date:new Date().toISOString(),mes:firstMessage,extra:{}},
]});

const userPath=path.join(st,'data/default-user');
const settingsPath=path.join(userPath,'settings.json');
const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
fs.copyFileSync(settingsPath,path.join(root,'跑团资料','安装前设置.json'));
settings.firstRun=false;settings.currentVersion='1.19.0';settings.username='旅人';
settings.main_api='openai';settings.active_character=avatar;settings.active_group=null;
settings.amount_gen=1500;settings.max_context=65536;settings.swipes=false;
Object.assign(settings.power_user,{auto_load_chat:true,auto_connect:true,play_message_sound:false,persona_description:'{{user}}是一名成年再生者。初到河湾村，有魔法入门经历，没有已认证职业。玩家后续提供的背景修正覆盖这项默认背景。',persona_description_position:0});
settings.world_info_settings.world_info.globalSelect=[];
settings.world_info_settings.world_info_budget=20;
settings.world_info_settings.world_info_budget_cap=10000;
settings.world_info_settings.world_info_match_whole_words=false;
Object.assign(settings.oai_settings,{
    chat_completion_source:'deepseek',deepseek_model:'deepseek-flash',
    openai_max_context:65536,openai_max_tokens:1800,temp_openai:0.8,top_p_openai:1,
    stream_openai:true,function_calling:true,tool_call_recurse_limit:5,
    show_thoughts:false,reasoning_effort:'low',send_if_empty:'请根据当前场景继续，保留我的行动空间。',
    new_chat_prompt:'[开始新的中文战役]',new_example_chat_prompt:'[主持示例]',
    continue_nudge_prompt:'继续未完成的叙述，不替玩家行动，不重复已提交的交易。',
});
const main=settings.oai_settings.prompts.find(v=>v.identifier==='main');
main.content='你是中文开放世界跑团主持人。依据角色定义、世界书和持久账本主持；公平裁定，尊重玩家意图。使用可用工具实际更新状态和重要记忆，不能只口头宣称执行了操作。';
settings.oai_settings.prompts.find(v=>v.identifier==='jailbreak').content='回答前核对账本与相关长期记忆。不要重置熟人的态度，不要把承诺写成履行。交易、施法与旅行必须实际记账；重要新经历用记忆工具存储。叙述用简体中文，不替玩家作决定。';
settings.extension_settings ??= {};
Object.assign(settings.extension_settings,{
    disabledExtensions:[],autoConnect:false,notifyUpdates:false,
    memory:{source:'main',memoryFrozen:false,SkipWIAN:true,promptInterval:24,promptWords:700,maxMessagesPerRequest:48,overrideResponseLength:1800,prompt_builder:0,position:1,role:0,depth:2,scan:false,
        prompt:'用简体中文更新近期剧情摘要。已有摘要仅作近期背景，独立长期记忆和账本是更高优先级事实依据。明确区分亲历事实、人物声称和待履行承诺。保存当前地点、正在进行的谈话、近期人物态度原因、未解线索和下一步约定。不要压缩成泛泛的关系良好，不要臆造事件，不输出工具调用或继续故事。只输出摘要，约700汉字。',
        template:'[近期剧情摘要，可能遗漏细节；与持久账本或检索原文冲突时必须核实：{{summary}}]'},
});
await post('/api/settings/save',settings);
// Keep a portable preset without keys or unrelated account data.
fs.writeFileSync(path.join(root,'跑团资料','中文跑团预设.json'),JSON.stringify(settings.oai_settings,null,2));
fs.writeFileSync(path.join(root,'跑团资料','战役入口.json'),JSON.stringify({avatar,chatFile,world:worldName,entries:lore.length,npcs:residents.length},null,2));
console.log(JSON.stringify({installed:true,avatar,chatFile,loreEntries:lore.length,startingNPCs:residents.length,context:65536,model:'deepseek-flash'}));
