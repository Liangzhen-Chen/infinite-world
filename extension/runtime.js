import { getContext } from '../../../extensions.js';
import { parseTurn, toolResultWithClock, lookupToolResult } from './turn.mjs';
import { readStateSection } from './state-read.mjs';
const KEY='infinite_fields';
const ctx=()=>getContext();
const active=()=>ctx().characters[ctx().characterId]?.name==='无限原野·世界主持人';
let view=null,loadedChat=null,blocked=null,chain=Promise.resolve(),mode='normal',turnStart=null;
let indexedChat=null,indexedMessages=[];
const api=async(endpoint,body={})=>{
    const response=await fetch(`/api/plugins/infinite-fields/${endpoint}`,{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error??`本地存档请求失败${response.status}`);return data;
};
const anchor=()=>{
    const message=[...ctx().chat].reverse().find(message=>message.is_user);
    if(!message)return null;message.extra??={};message.extra.fields_anchor??=crypto.randomUUID();return message.extra.fields_anchor;
};
const validAnchors=()=>ctx().chat.filter(message=>!message.extra?.fields_invalidated).map(message=>message.extra?.fields_anchor).filter(Boolean);
const queue=task=>{
    const pending=chain.catch(()=>{}).then(task);chain=pending.catch(()=>{});return pending;
};
async function persist(){
    ctx().chatMetadata[KEY]=view.reference;await ctx().saveChat();
}
function fail(error){
    blocked=error.message;ctx().stopGeneration();
    document.querySelector('#fields-status')?.replaceChildren(document.createTextNode(`存档对账失败，生成已停止：${blocked}`));
}
// SillyTavern catches errors thrown by event listeners and creates a new abort
// controller after GENERATION_STARTED. Guard the generation transport as well
// as stopping its UI; otherwise a failed reconcile can still send a request.
const originalFetch=window.fetch.bind(window);
window.fetch=async function(input,options){
    const url=new URL(typeof input==='string'?input:input.url,location.origin);
    if(active()&&blocked&&url.pathname==='/api/backends/chat-completions/generate')throw new Error(`已阻止生成：${blocked}`);
    return originalFetch(input,options);
};
async function load(){
    if(!active()){view=null;loadedChat=null;return;}
    if(view&&loadedChat===ctx().chatId)return;
    const chatId=ctx().chatId,reference=ctx().chatMetadata[KEY];
    const next=reference?.format===2 ? await api('read',{campaignId:reference.campaignId}) : await api('migrate',{character:ctx().characters[ctx().characterId].avatar.replace(/\.png$/,''),chatId});
    if(ctx().chatId!==chatId)return;
    view=next;loadedChat=chatId;blocked=null;await persist();
    indexedChat=null;indexedMessages=[];
}
async function syncHistory(){
    const chat=ctx().chat;if(indexedChat!==ctx().chatId){indexedChat=ctx().chatId;indexedMessages=[];}
    let start=0;while(start<Math.min(chat.length,indexedMessages.length)&&chat[start]===indexedMessages[start])start++;
    if(start===chat.length&&chat.length===indexedMessages.length)return;
    await api('sync-index',{campaignId:view.reference.campaignId,start,messages:chat.slice(start),total:chat.length});
    indexedMessages=[...chat];
}
async function refresh(){
    if(!active()){ctx().setExtensionPrompt(KEY,'',1,0);document.querySelector('#fields-toolbar')?.remove();return;}
    await load();if(!view)return;
    await syncHistory();
    const query=document.querySelector('#send_textarea')?.value||[...ctx().chat].reverse().find(message=>message.is_user)?.mes||'';
    const scene=await api('scene',{campaignId:view.reference.campaignId,query});
    ctx().setExtensionPrompt(KEY,scene.scene,1,0,false,0);
    let bar=document.querySelector('#fields-toolbar');
    if(!bar){
        bar=document.createElement('div');bar.id='fields-toolbar';
        const status=document.createElement('span');status.id='fields-status';bar.append(status);
        const book=document.createElement('button');book.textContent='世界账本';book.onclick=showBook;bar.append(book);
        const repair=document.createElement('button');repair.textContent='重新对账';repair.onclick=()=>queue(async()=>{try{view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});blocked=null;await persist();await refresh();}catch(error){fail(error);}});bar.append(repair);
        (document.querySelector('#sheld')??document.querySelector('#chat')?.parentElement)?.prepend(bar);
    }
    const p=view.document.state.player;
    document.querySelector('#fields-status').textContent=blocked?`生成已停止：${blocked}`:`${scene.scene.split('\n')[0].replace('【时间】','')} · ${p.coins}铜 · 生命${p.hp}/${p.maxHp} · 魔力${p.mp}/${p.maxMp}`;
}
async function execute(tool,args,eventId=crypto.randomUUID()){
    return queue(async()=>{
        try{
            await load();if(blocked)throw new Error(blocked);
            const startMinute=turnStart??view.document.state.minute;
            const currentUser=[...ctx().chat].reverse().find(message=>message.is_user)?.mes??'';
            if(/^[（(]场外[）)]/.test(currentUser)&&tool!=='world_turn')throw new Error('场外提问不推进时间或写入世界状态');
            const result=await api('execute',{campaignId:view.reference.campaignId,tool,args,eventId,anchor:anchor(),expectedSequence:view.reference.sequence});
            view=await api('read',{campaignId:view.reference.campaignId});
            await persist();await refresh();return toolResultWithClock(result.result,{startMinute,minute:view.document.state.minute});
        }catch(error){return {ok:false,error:error.message,note:'核对存档后再叙述结果，不可将失败操作写成成功。'};}
    });
}
const str={type:'string'},int={type:'integer'},bool={type:'boolean'};
const object=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const register=(name,description,properties,required)=>ctx().registerFunctionTool({name,displayName:name,description,parameters:object(properties,required),
    action:args=>execute(name,args),formatMessage:()=>'',shouldRegister:()=>active()&&mode!=='quiet'&&!blocked});
register('world_trade','双方必须在场，库存和钱足够；价钱与物品实际转移。玩家编号player，buyer省略时默认玩家。instances可选指定持有单件，署名不会丢失。住宿用service住宿和days，房价由引擎确定。',{buyer:str,seller:str,item:str,quantity:int,unitPrice:int,service:str,days:int,instances:{type:'array',items:str}},['seller']);
register('world_move','按路线和季节移动玩家与同行者，实际计时扣路费。',{destination:str,mode:{type:'string',enum:['walk','horse','cart','boat']}},['destination']);
register('world_time','等待、工作、睡眠等耗时，触发日结。',{minutes:int,activity:str},['minutes']);
register('world_weather','观察本人所在地的实际天气、温度、湿度、昼长和旬日；天气按战役种子与日期生成。不能凭叙事改变天气，也不能远程观察异地。观察本身即时；心情修正是环境倾向，不等于关系变化。',{operation:{enum:['inspect']},location:str},[]);
register('world_farm','inspect观察本地农田和粮仓。buy/donate/reserve_seed/repair须本人到粮仓柜台且管理员在场；buy实际付钱购买可售谷物，过冬粮和种粮不售；donate从实际背包交item_oats；reserve_seed把已有谷物转为种粮。sow/harvest须亲到公共田志愿劳动，90分钟和检定，只播实种或收成熟作物，产物进入公共仓而非玩家行囊。guard须亲到有生长作物的登记田地巡守，实际耗时和检定，成功后在回执时段内减轻害兽活动时的损失，不杀动物、不恢复此前损失、不收报酬；白昼巡护不能替代夜间护田。adopt仅玩家明确要求将旧日产账切到农事账，保留旧粮且不补种子或历史收成。',{operation:{enum:['inspect','buy','donate','reserve_seed','repair','sow','harvest','guard','adopt']},settlement:str,quantity:int},[]);
register('world_wildlife','observe即时观察所在地的真实动物及尸体；track花60分钟追踪登记物种species，需要真实种群和活动时段，检定成功后接触一个有独立编号的个体，不自动攻击或驯服。gather仅处理真实死尸target，耗时耗刀具及登记材料，失败也有成本，腐坏与已处理尸体不能重复取材。不得直接生成怪物、掉落或种群数量。',{operation:{enum:['observe','track','gather']},species:str,target:str},[]);
register('world_crime','尝试在场NPC财物偷窃，用steal并给target及item或coins，两者只能给一种。一次一件不超过2公斤或最多20铜，实际检定和5分钟；失败不转财物，另判真实在场目击。不会自动让异地守卫知情或凭空取得物品。instance可选择已有单件。',{operation:{enum:['steal']},target:str,item:str,coins:int,instance:str},['operation','target']);
register('world_law','inspect查本地法典与本人案件。其他操作引用真实case及在场authority：report需亲见reporter在场，confess仅玩家明确自认；search需报案，arrest需充分证据并实际沿路押到法院，hear需登记审判者在法院。pay交罚款及赔偿或原物进法院托管，不瞬间交给异地受害人；claim须受害人claimant到场领取。labor/prison只能按玩家明确选择开始服役，时间未过就未完成，赔偿债务仍保留；compensate处理服役后赔偿。不得凭全局记录让不知情NPC报官，不重复作证或缴款。',{operation:{enum:['inspect','report','confess','search','arrest','hear','pay','labor','prison','compensate','claim']},case:str,authority:str,reporter:str,claimant:str},[]);
register('world_pet','操作真实在场动物。inspect查看；feed需实际持有且符合食性的item；contact每天建立一次信任，tame需足够技能/信任/等级及名额，首领还需有效特殊条件authorization。自有宠物可groom、treat、train指定动物目录技能、rest指定minutes、follow、stay、release、mount、dismount。照料实际耗时，病死不能复活，不可直接给信任、血量或经验。召唤物不登记为宠物。',{operation:{enum:['inspect','feed','contact','tame','groom','treat','train','rest','follow','stay','release','mount','dismount']},target:str,item:str,skill:str,minutes:int,authorization:str},[]);
register('world_summon','inspect查自有有效召唤实例和契约编号；dismiss和平结束。水盏役灵carry_water需summon实例或契约编号，也可用唯一匹配的名称；同名多只时必须选编号。source水源或容器、destination容器、millilitres最多250；同场景三米内且有所有者授权，搬运5分钟并实际支付维持魔力。编号未匹配时先inspect，不推断没有役灵。不能净化水、额外召出宠物或扩展契约能力。',{operation:{enum:['inspect','dismiss','carry_water']},summon:str,source:str,destination:str,millilitres:int,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
register('world_revival','亲自到神殿或祭坛登记复活点，检查等级，实际支付登记费。只能登记，不能修改生命或复活别人。',{location:str},[]);
register('world_check','d20修正由属性技能和真实工具计算，情境修正限±5且需理由。固定检定给difficulty；对抗给opponent，不同时给difficulty。helpers只能引用已成立的协助义务编号。',{attribute:str,skill:str,difficulty:int,context:int,contextReason:str,advantage:bool,disadvantage:bool,tools:{type:'array',items:str},helpers:{type:'array',items:str},opponent:object({npc:str,attribute:str,skill:str},['npc'])},[]);
register('world_cast','仅已学法术，扣魔力与材料，判定失败，计熟练度；有规则效果的法术会实际改变目标。治疗正常NPC时authorization引用本人同意记录。水法术target用已登记feature编号，所有相关私人设施都需确切所有者许可，多个设施可用authorizations编号列表。',{spell:str,target:str,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},['spell','target']);
register('world_environment','查看当前位置已登记水源、容器、沟渠和田垄用inspect；approach走到同场景对象旁，实际计时。carry_silt将已松动泥搬到指定堆泥处，需target沟渠、destination堆泥处、grams最多1000，耗时检定。私人设施需所有者授权，可用authorizations引用多个设施许可。不凭空造水、挖渠或直接写数值。',{operation:{enum:['inspect','approach','carry_silt']},target:str,destination:str,grams:int,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
register('world_learn','学习目录内技能、法术或配方。source用合格在场导师编号或持有的技能书编号；引擎检查识字、前置和认证，实际计时并保留失败记录。',{entity:str,source:str,kind:{type:'string',enum:['spell','skill','recipe']}},['entity','source']);
register('world_practice','有意义的练习、每日上限、重复递减与阶段突破。',{skill:str,target:str,gain:int,breakthroughSource:str},['skill']);
register('world_profession','正式职业用certify认证；abandon支付退职费、保留技能且限制有效熟练度；promote引用当前30级升职方向。资格、费用和名额由引擎核对。',{profession:str,teacher:str,operation:{type:'string',enum:['certify','abandon','promote']},choice:str},['profession']);
register('world_attributes','仅按玩家明确决定分配已有自由属性点，不发经验、不修改幸运，也不替玩家选属性。',{attributes:object({'力量':int,'敏捷':int,'体质':int,'智力':int,'精神':int,'魅力':int})},['attributes']);
register('world_relation','按具体事件变化关系，基础人设不可覆盖。',{npc:str,eventType:str,sourceEvent:str,trustDelta:int},['npc','eventType','sourceEvent']);
register('world_promise','带路承诺加入同行，送货付款到期执行或记录违约。协助承诺须在场且技能合格，引用skill和attribute，随后用返回义务编号参加检定。',{promisor:str,promisee:str,type:str,content:str,destination:str,deadline:int,item:str,quantity:int,coins:int,skill:str,attribute:str},['promisor','type','content']);
register('world_remember','长期事实保留，使用实体编号，不写系统用语。',{subject:str,key:str,content:str,source:str,keywords:{type:'array',items:str}},['subject','key','content']);
register('world_turn','回合工具原型，与尾注方案比较合规率；仅补尚未推进的时间。',{startMinute:int,minutes:int,location:str,present:{type:'array',items:str},outOfCharacter:bool},['startMinute']);
register('world_combat','结算一次交锋，数值由引擎计算。攻击、防守、脱离和推搡用intent，无法自行指定伤害。',{target:str,weapon:str,intent:{type:'string',enum:['attack','defend','flee','shove']}},['target']);
register('world_lair','observe即时观察所在地巢穴及已经接触的实际占据者，不透露未见首领或其记忆。approach耗登记时间，接触已有占据者，不自动交锋或掉落；空巢不会召回已死首领。lair必须是所在地巢穴名称或编号。',{operation:{enum:['observe','approach']},lair:str},[]);
register('world_craft','operation默认manufacture，需recipe，检查工具和工作台，扣料收费计时检定，生成单件署名。维修用operation repair和item或instance，可选repairPlan；只按登记工序处理实际持有的损坏单件，成功恢复有限耐久并降低上限，失败也收费耗时磨损工具，保留原编号及制作者。多件物品须给instance。helpers引用有效协助义务，非公开台需authorization。',{operation:{enum:['manufacture','repair']},recipe:str,item:str,instance:str,repairPlan:str,authorization:str,helpers:{type:'array',items:str}},[]);
register('world_research','记录构想与多日研究，投入资金、时间，失败也保留记录。',{operation:str,name:str,concept:str,skills:{type:'array',items:str},project:str,coins:int,minutes:int},['operation']);
register('world_settlement','动用公共物资需有效授权，工程实际扣料并计工期。',{operation:str,settlement:str,authorization:str,name:str,wood:int,stone:int,days:int,beneficiaries:{type:'array',items:str}},['operation','settlement','authorization']);
register('world_quest','发布任务需额度和托管报酬，完成条件可验证，不重复奖励。',{operation:str,publisher:str,personal:bool,grade:str,reward:int,content:str,quest:str,objective:object({type:str,item:str,quantity:int,location:str,project:str},['type'])},['operation']);
register('world_create','登记原创的新人物或组织，不能凭空制造物品、建筑或法术。',{type:str,name:str,project:str,data:object({age:int,occupation:str,notes:str},[])},['type','name','data']);
ctx().registerFunctionTool({name:'world_search',displayName:'查阅旧事',description:'检索长期事实和原始聊天，别名繁简与近义词归一。',parameters:object({query:str,limit:int},['query']),
    action:async args=>{await load();return api('search',{campaignId:view.reference.campaignId,...args});},shouldRegister:()=>active()&&!blocked});
ctx().registerFunctionTool({name:'world_catalog',displayName:'查阅规则目录',description:'按稳定编号查公开职业、技能、法术、物品或配方的真实规则。entity查单条，kind查最多40条列表。feature查询当前可见环境对象及实际容量，不透露未检验毒素或病原。未取得的隐藏身份不会透露触发条件。',parameters:object({entity:str,kind:{type:'string',enum:['profession','skill','spell','item','recipe','feature']}}),
    action:async args=>{await load();return lookupToolResult(()=>api('catalog',{campaignId:view.reference.campaignId,...args}));},shouldRegister:()=>active()&&!blocked});
ctx().registerFunctionTool({name:'world_read',displayName:'查看状态',description:'读取玩家、行囊、人物或约定，返回长度有限。',parameters:object({section:str}),
    action:async args=>{await load();return JSON.stringify(readStateSection(view.document.state,args.section));},shouldRegister:()=>active()&&!blocked});
function showBook(){
    const dialog=document.createElement('dialog');dialog.id='fields-dialog';const title=document.createElement('h2');title.textContent='世界账本';dialog.append(title);
    const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(close);
    for(const line of [JSON.stringify(view.document.state.player),...Object.entries(view.document.state.inventory).map(([id,item])=>`${id} × ${item.quantity}`)]){
        const paragraph=document.createElement('p');paragraph.textContent=line;dialog.append(paragraph);
    }
    const note=document.createElement('p');note.textContent='界面仍在重构，当前显示已提交的账目。';dialog.append(note);document.body.append(dialog);dialog.showModal();
}
async function reconcile(type,_options,dryRun){
    if(!active()||dryRun)return;mode=type;
    return queue(async()=>{
        try{
            await load();if(blocked)throw new Error(blocked);
            if(['regenerate','swipe'].includes(type)){
                view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors(),excludeAnchor:anchor()});await persist();
            }
            turnStart=view.document.state.minute;await refresh();
        }catch(error){fail(error);}
    });
}
async function onDeleted(){
    if(!active())return;return queue(async()=>{try{await load();view=await api('reconcile',{campaignId:view.reference.campaignId,validAnchors:validAnchors()});await persist();await refresh();}catch(error){fail(error);}});
}
async function onEdited(index){
    const message=ctx().chat[index];if(!active()||!message?.is_user)return;
    for(let i=index;i<ctx().chat.length;i++){ctx().chat[i].extra??={};ctx().chat[i].extra.fields_invalidated=true;}
    message.extra.fields_anchor=crypto.randomUUID();message.extra.fields_invalidated=false;
    indexedMessages=indexedMessages.slice(0,index);
    await onDeleted();await api('edit-index',{campaignId:view.reference.campaignId,index,message});
}
async function afterReply(index){
    if(!active()||mode==='quiet'||blocked)return;const message=ctx().chat[index];
    if(!message||message.is_user||message.is_system||message.extra?.tool_invocations||turnStart===null)return;
    const user=[...ctx().chat].reverse().find(message=>message.is_user);
    const parsed=parseTurn(message.mes,{location:view.document.state.location,startMinute:turnStart,outOfCharacter:/^[（(]场外[）)]/.test(user?.mes??'')});
    const result=await execute('world_turn',parsed.args,`turn_${anchor()}`);
    if(result.ok===false)fail(new Error(result.error));
    message.extra??={};message.extra.fields_turn={valid:parsed.valid,warning:parsed.warning??null};
}
const context=ctx();
context.eventSource.on(context.eventTypes.APP_READY,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_CHANGED,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.CHAT_LOADED,()=>queue(refresh).catch(fail));
context.eventSource.on(context.eventTypes.GENERATION_STARTED,reconcile);
context.eventSource.on(context.eventTypes.GENERATION_AFTER_COMMANDS,()=>{if(blocked)ctx().stopGeneration();});
context.eventSource.on(context.eventTypes.MESSAGE_SENT,()=>{if(active())anchor();});
context.eventSource.on(context.eventTypes.MESSAGE_DELETED,onDeleted);
context.eventSource.on(context.eventTypes.MESSAGE_EDITED,onEdited);
context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED,afterReply);
context.eventSource.on(context.eventTypes.GENERATION_ENDED,()=>{mode='normal';});
window.infiniteFieldsV2={load,refresh,execute,reconcile,onEdited,onDeleted,get view(){return view;},get blocked(){return blocked;}};
