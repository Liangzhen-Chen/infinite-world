const str={type:'string'},int={type:'integer'},bool={type:'boolean'};
const object=(properties,required=[])=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false});
const definitions=[];
const define=(name,description,properties,required=[])=>definitions.push({type:'function',function:{name,description,parameters:object(properties,required)}});
define('world_trade','交易/经营合同',{operation:{enum:['trade','lease','procure','hire','fulfill','sell','pay','cancel','borrow','deposit','withdraw','exchange','work','partner']},business:str,contract:str,location:str,consent:{...bool,description:'本次在场同意=true'},deposit:int,coins:int,deadline:int,minutes:int,task:{enum:['stocktake']},buyer:str,seller:str,item:str,quantity:int,unitPrice:int,service:{type:'string',enum:['住宿']},days:int,payment:{type:'string',enum:['cash','credit','repay']},creditMinutes:{...int,description:'赊账距今分，勿另约付款'},debt:str,instances:{type:'array',items:str}},['seller']);
define('world_move','沿路移动/同行路费',{destination:str,mode:{type:'string',enum:['walk','horse','cart','boat']},authorization:{...str,description:'私宅有效住户许可ID'}},['destination']);
define('world_time','时长/钟点等待二选一',{minutes:{...int,description:'完整分，不抵已耗时'},until:object({dayOffset:{...int,description:'今天0、明天1'},hour:{...int,minimum:0,maximum:23},minute:{...int,minimum:0,maximum:59}},['dayOffset','hour']),activity:{type:'string',enum:['等待','工作','睡眠','休息']}},[]);
define('world_weather','查当地天气、温度及日出日落。',{operation:{enum:['inspect']},location:str},[]);
define('world_farm','农田粮仓；按粮约提送、税贸结算。',{operation:{enum:['inspect','buy','donate','reserve_seed','repair','sow','harvest','guard','adopt','settle_trade']},settlement:str,quantity:int,contract:str,phase:{enum:['pickup','deliver']},authority:str},[]);
define('world_wildlife','观察、追踪动物，真实尸体取材；喂灵物、凭仪式资格点化或与已立意者结缘。',{operation:{enum:['observe','track','gather','nurture','enlighten','pact','talk','follow','stay','settle','leave','borrow_form']},species:str,target:str,item:str,permit:str},[]);
define('world_crime','尝试偷在场者一件物品/铜币。',{operation:{enum:['steal']},target:str,item:str,coins:int,instance:str},['operation','target']);
define('world_law','办案/有权机构发放限时施法许可',{operation:{enum:['inspect','report','confess','search','arrest','hear','appeal','publish','notify','pay','labor','prison','compensate','claim','grant_magic_permit','bribe','hire_advocate']},case:str,coins:int,authority:str,location:str,subject:str,action:{enum:['mental_magic']},minutes:int,reporter:str,claimant:str,from:str,to:str,memory:{...str,description:'from持有的本案记忆ID'},channel:{enum:['conversation','carry']}},[]);
define('world_pet','动物照料/驯练/跟随/骑乘。',{operation:{enum:['inspect','feed','contact','tame','groom','treat','train','rest','follow','stay','release','mount','dismount']},target:str,item:str,skill:str,minutes:int,authorization:str},[]);
define('world_summon','召唤查解/搬水/限额守卫。',{operation:{enum:['inspect','dismiss','carry_water','guard']},summon:str,source:str,destination:str,millilitres:int,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_revival','神殿/祭坛付费定复活点',{location:str},[]);
define('world_check','属性技能对抗/工具协助',{attribute:str,skill:str,difficulty:int,context:int,contextReason:str,advantage:bool,disadvantage:bool,tools:{type:'array',items:str},helpers:{type:'array',items:str},opponent:object({npc:str,attribute:str,skill:str},['npc'])},[]);
define('world_cast','已学法术；force强施入法；刻记填字',{spell:str,target:str,source:str,destination:str,path:{type:'array',items:str,minItems:2,maxItems:8},authorization:str,permit:str,force:bool,text:{...str,maxLength:80},authorizations:{type:'array',items:str,maxItems:8}},['spell','target']);
define('world_environment','刻记/接近/搬泥/炉温添自有燃料/翻谷；连通空气传声、实高差下降、现有空气呼吸。',{operation:{enum:['inspect','inspect_heat','inspect_marks','load_fuel','approach','carry_silt','turn_grain','sound','fall','breathe']},target:str,subject:str,destination:str,path:{type:'array',items:str,minItems:2,maxItems:8},text:{...str,maxLength:80},grams:int,item:str,quantity:{...int,description:'添料1-100份真实物品；其他量按操作规则'},authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_learn','师授/读书/研究；student受教，book_give/study',{operation:str,entity:str,source:str,kind:{type:'string',enum:['spell','skill','recipe']},student:str},[]);
define('world_practice','练技能/有据突破',{skill:str,target:str,gain:int,breakthroughSource:str},['skill']);
define('world_profession','认证/入门守戒/仪式资格/退职/升职',{profession:str,student:str,teacher:str,institution:str,rule:str,deity:str,minutes:int,operation:{type:'string',enum:['certify','abandon','promote','initiate','ritual_officiate','examine']},choice:str},['profession']);
define('world_attributes','依玩家选自由点',{attributes:object({'力量':int,'敏捷':int,'体质':int,'智力':int,'精神':int,'魅力':int})},['attributes']);
define('world_relation','据实改双方关系',{npc:str,from:str,to:str,eventType:str,sourceEvent:str,romance:bool},['eventType','sourceEvent']);
define('world_promise','承诺/私宅许可/施法同意：location类别，skill法术，consent确认',{operation:{enum:['create','cancel','grant_access','revoke_access']},consent:bool,promisor:{...str,description:'在场成年本人'},promisee:str,type:{...str,enum:['带路','送货','付款','等候','会面','协助'],description:'新建必填，交物用送货；私宅免填'},content:str,destination:str,location:{...str,description:'地点或mental_magic/support_magic/healing；不追收件人'},start:{...int,description:'起始绝对分，默认现在'},deadline:{...int,description:'到期绝对分'},minutes:{...int,description:'占用分；私宅1-1440'},authorization:str,guests:{type:'array',items:str,maxItems:8,description:'同行须住户另准'},obligation:str,actor:str,item:str,quantity:int,coins:int,skill:str,attribute:str},[]);
define('world_remember','有源事实/在场传闻/谎言与揭穿',{subject:str,key:str,content:str,source:str,rumor:str,truth:str,motive:str,knowers:{type:'array',items:str},keywords:{type:'array',items:str}},['subject','key','content']);
const sitePermitType=definitions.find(row=>row.function.name==='world_promise').function.parameters.properties.type;
sitePermitType.enum.push('site_visit','site_disarm','site_gather');
sitePermitType.description='承诺必填；据点参观/机关/采集，私宅免填';
definitions.find(row=>row.function.name==='world_promise').function.parameters.properties.location.description='约定/许可地点，勿追人';
define('world_combat','攻/防/脱离/推搡',{target:str,actor:str,weapon:str,intent:{type:'string',enum:['attack','defend','flee','shove']}},['target']);
define('world_lair','巢穴接近/谈判；offer交物、request索物；term立约，contract按期履约',{operation:{enum:['observe','approach','negotiate']},lair:str,term:{enum:['trade','tribute','passage'],description:'贸易/朝贡/通行'},days:int,pact:{enum:['respect_territory','nonaggression'],description:'守界/互不攻击'},alliance:bool,offer:{type:'array',maxItems:20,items:object({item:str,quantity:int},['item','quantity'])},request:{type:'array',maxItems:20,items:object({item:str,quantity:int},['item','quantity'])}},[]);
define('world_site','本地据点进入/调查/解机关/有限采集。',{operation:{enum:['inspect','enter','investigate','disarm','gather','infiltrate']},target:str,quantity:int,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_craft','配方制造/工序维修',{operation:{enum:['manufacture','repair']},recipe:str,item:{...str,description:'维修名/类型ID'},instance:{...str,description:'instances单件ID'},repairPlan:str,authorization:str,helpers:{type:'array',items:str},maker:{...str,description:'结缘精怪代工'}},[]);
define('world_research','立项/投钱续研；write/publish/copy/perform/survey(project稿或书)，fuse融合',{operation:str,name:str,concept:str,skills:{type:'array',items:str},entities:{type:'array',items:str},project:str,coins:int,minutes:int},['operation']);
define('world_settlement','聚落事务；委托须同意',{operation:{...str,enum:['business_open','business_close','business_bankrupt','business_report','start_project','civic_inspect','civic_residence','civic_sponsor','civic_apply_resident','civic_apply_citizen','civic_contribution','governance_inspect','governance_propose','governance_opinion','governance_close','governance_appointment','governance_grant','governance_revoke','governance_queue','governance_process','governance_apply','project_abort','title_petition','title_service','title_inspect','notable_petition','notable_audience','notable_inspect','promotion_petition','promotion_inspect','school_open','school_fund','school_inspect','school_close']},business:str,project:str,workers:{type:'array',items:str},settlement:str,authorization:str,authority:str,sponsor:str,sourceEvent:str,name:str,wood:int,stone:int,days:int,beneficiaries:{type:'array',items:str},plot:str,issue:str,proposal:str,speaker:str,opinion:{enum:['approve','reject','abstain']},content:str,steward:str,consent:bool,action:{enum:['account_report','housing','public_project']},minutes:int,budget:int,proposedFee:{...int,description:'拟费，非批准/实收'},taxBps:int,due:int,request:str},['operation']);
define('world_quest','托管/接单/履约/退款；NPC按世界钟履约',{operation:{...str,enum:['publish','accept','complete','cancel','inspect'],description:'publish仅发布托管；player私人D；另调accept；当面complete；NPC在场同意/离屏看告示；cancel退款/inspect进度'},publisher:{...str,description:'player/付报酬NPC'},personal:bool,cultural:{...bool,description:'名士文化委托'},settlement:{...str,description:'官职公款托管村'},taker:str,consent:bool,deadline:int,grade:{...str,enum:['D','C','B','A','S']},reward:{...int,minimum:20,maximum:1000000,description:'报酬，铜币'},content:str,quest:{...str,description:'回执ID；未知world_read quests'},objective:object({type:{...str,enum:['deliver','visit','build']},item:{...str,description:'deliver必填名/ID；燕麦非干粮'},quantity:{...int,minimum:1,description:'deliver必填份数'},location:{...str,description:'deliver默认发单处/visit目的地'},project:{...str,description:'build已授权投料工程ID'}},['type'])},['operation']);
const ingredient=object({item:str,amount:int},['item','amount']);
define('world_create','登记；研究法术template原型、spec规则JSON；产物用已有ID',{type:str,name:str,project:str,data:object({template:str,power:int,spec:str,age:int,occupation:str,notes:str,skill:str,minimumProficiency:int,materials:{type:'array',items:ingredient},minutes:int,difficulty:int,output:object({item:str,quantity:int},['item','quantity']),tools:{type:'array',items:str},workstation:str,location:str,byproducts:{type:'array',items:ingredient},toolWear:int,failure:object({recoverFraction:{type:'number'},injury:int},[])},[])},['type','name','data']);
define('world_search','查长期事实/原聊天',{query:str,limit:int},['query']);
define('world_catalog','规则/文化/势力/历史/地区分页查',{entity:str,kind:{type:'string',enum:['profession','skill','spell','item','recipe','feature','location','culture','deity','faction','history','region']},offset:int});
define('world_read','查现账/人物库存',{section:{...str,description:'人物/npcs、行囊/inventory、约定/obligations'},npc:{...str,description:'人物ID先查目录；无私密认知'}});
// A1 动作目录（06 §6.10.1）：目录检索与按 id 执行；动作说明放检索结果，不进静态区。
define('world_actions','查此处或对某人某物可做之事',{target:str,query:str},[]);
define('world_act','按动作id执行，id与槽位先用world_actions查',{action:str,slots:{type:'object'}},['action']);
definitions.find(row=>row.function.name==='world_trade').function.parameters.properties.operation.description='依次交易/租铺/采购/雇盘点/当面履约/同意收购/还债/取消未履约/借款(coins,days,item押)/钱庄存取兑币(buyer=player买)/受雇/合伙(quantity分成%)';
definitions.find(row=>row.function.name==='world_remember').function.parameters.properties.rumor={...str,description:'编号；玩家/rumor键/在场来源/未核实原文；10分'};
const festivalParameters=definitions.find(row=>row.function.name==='world_settlement').function.parameters.properties;
festivalParameters.operation.enum.push('medicine_inspect','medicine_seek','medicine_fund','medicine_hire','medicine_health');
festivalParameters.action.enum.push('credit','charity');
festivalParameters.operation.enum.push('festival_inspect','festival_plan','festival_authorize','festival_join','festival_cancel');
Object.assign(festivalParameters,{festival:str,year:{...int,minimum:1},cost:{...int,minimum:0,description:'同意自费，非公款'},supplier:str});
festivalParameters.operation.enum.push('faction_inspect','faction_contribute','faction_intervene');
festivalParameters.operation.enum.push('org_inspect','org_join','org_leave','org_deposit','org_propose','org_vote');
festivalParameters.operation.enum.push('family_inspect','family_marry','family_adopt','family_foster','family_split','family_manage','family_dispute','family_alliance');
festivalParameters.operation.enum.push('faith_inspect','faith_convert','faith_give','faith_use','faith_rite','faith_pilgrim');
festivalParameters.operation.enum.push('nation_inspect','nation','domain_inspect','domain_appoint','domain_steward','domain_request');
festivalParameters.operation.enum.push('title_grant','title_strip');
Object.assign(festivalParameters,{reason:str});
festivalParameters.action.enum.push('commercial','customs');
festivalParameters.operation.enum.push('war_inspect','war_join','diplomacy');
festivalParameters.operation.enum.push('army_inspect','army_enlist','army_duty','army_recruit','army_dismiss');
festivalParameters.action.enum.push('expel','appoint','withdraw','charter');
Object.assign(festivalParameters,{org:str,member:str});
Object.assign(festivalParameters,{clock:str,choice:str,item:str,quantity:int,coins:int});
Object.assign(festivalParameters,{facilityType:{enum:['house','workshop','bridge','road','clinic','school','granary','public']},route:str,funding:str});
festivalParameters.action.enum.push('repair','expand');
const routes=new Map();
definitions.find(r=>r.function.name==='world_wildlife').function.parameters.properties.operation.enum.push('fish','eat');
definitions.find(r=>r.function.name==='world_site').function.parameters.properties.operation.enum.push('mine');
definitions.find(r=>r.function.name==='world_site').function.parameters.properties.operation.enum.push('woodcut');
const transport=definitions.find(r=>r.function.name==='world_trade').function.parameters.properties;
transport.operation.enum.push('smuggle','deliver_smuggled','bank_inspect','extend','prepay','lend','collect','pawn','redeem','auction','remit','cash_bill','asset_inspect','invest','dividend','share_transfer','rent_out','workshop','workshop_terms','dismiss');transport.mode=str;
festivalParameters.operation.enum.push('duel_challenge','duel_answer','duel_yield','election_start','election_campaign','election_finish','election_expose','mining_permit');
transport.operation.description='trade/business/bank/asset/transport/post';
transport.operation.enum.push('transport','post');
transport.task.enum.push('destroy','register','book','trace','lease','repair','intercept','recover','open','lose','collect');
transport.service.enum.push('passage');
transport.escort=str;
transport.authorization=str;
transport.operation.enum.push('labor_inspect','labor_guarantee','labor_mediate','labor_poach');
function group(name,description,members){
    const selected=definitions.filter(row=>members.includes(row.function.name)),properties={},operations=[],mapping=new Map();
    for(const row of selected){
        const tool=row.function.name,prefix=tool.slice(6),schema=row.function.parameters;
        Object.assign(properties,schema.properties);
        for(const operation of schema.properties.operation.enum){
            const key=`${prefix}_${operation}`;operations.push(key);mapping.set(key,{tool,operation,required:schema.required??[]});
        }
    }
    properties.operation={type:'string',enum:operations};routes.set(name,mapping);
    return {type:'function',function:{name,description,parameters:object(properties,['operation'])}};
}
const fieldTools=['world_weather','world_farm','world_wildlife','world_environment','world_lair','world_site'];
const companionTools=['world_pet','world_summon'];
const field=group('world_field','粮仓farm_buy燕麦；农事/环境/采集及天气动物巢穴',fieldTools);
field.function.parameters.properties.operation.description='先move；许可promise';
field.function.parameters.properties.settlement={...str,description:'粮仓名/ID；柜台管理员本人清醒在场'};
field.function.parameters.properties.item={...str,description:'farm_buy仅燕麦；mine矿石'};
field.function.parameters.properties.quantity={...int,description:'买粮0.5公斤/份；采集份数'};
const companion=group('world_companion','照料驯骑；召唤契约/搬水/限额守卫',companionTools);
const law=structuredClone(definitions.find(row=>row.function.name==='world_law'));
law.function.description='法典声望/在场偷窃；在场authority办案/公示携信';
Object.assign(law.function.parameters.properties,definitions.find(row=>row.function.name==='world_crime').function.parameters.properties);
law.function.parameters.properties.operation={type:'string',enum:['steal',...definitions.find(row=>row.function.name==='world_law').function.parameters.properties.operation.enum]};
const hidden=new Set([...fieldTools,...companionTools,'world_crime','world_law']);
const publicDefinitions=[...definitions.filter(row=>!hidden.has(row.function.name)),field,companion,law];
export function toolDefinitions(){return structuredClone(publicDefinitions);}
// Pure routing is shared by the engine and report assertions. Stored old calls
// remain valid; grouped calls execute exactly the same domain operations.
export function resolveToolCall(tool,args={}){
    if(tool==='world_law'&&args.operation==='steal')return{tool:'world_crime',args};
    const mapping=routes.get(tool);if(!mapping)return{tool,args};
    const route=mapping.get(args.operation);
    if(!route)throw new Error(`未知操作；${tool} 的 operation 可选：${[...mapping.keys()].join('、')}`);
    const absent=route.required.filter(key=>key!=='operation'&&args[key]===undefined);
    if(absent.length)throw new Error(`${args.operation} 缺少参数：${absent.join('、')}`);
    return{tool:route.tool,args:{...args,operation:route.operation}};
}
export function modelToolCall(tool,args={}){
    if(tool==='world_crime')return{tool:'world_law',args};
    for(const[group,mapping]of routes)for(const[operation,route]of mapping){
        if(route.tool===tool&&route.operation===args.operation)return{tool:group,args:{...args,operation}};
    }
    return{tool,args};
}
export const readOnlyTools=new Set(['world_search','world_catalog','world_read','world_actions']);
// The two catalog tools are the gateway to the registered actions, not actions themselves.
export const catalogTools=new Set(['world_actions','world_act']);
// Per-tool schemas before grouping (world_farm, world_pet …): the action registry
// reads a grouped operation's own parameters from here instead of the group union.
export function memberDefinitions(){return structuredClone(definitions);}
