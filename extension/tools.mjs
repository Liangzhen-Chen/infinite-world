const str={type:'string'},int={type:'integer'},bool={type:'boolean'};
const object=(properties,required=[])=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false});
const definitions=[];
const define=(name,description,properties,required=[])=>definitions.push({type:'function',function:{name,description,parameters:object(properties,required)}});
define('world_trade','实际商家交易/经营合同。',{operation:{enum:['trade','lease','procure','hire','fulfill','sell','pay','cancel']},business:str,contract:str,location:str,consent:{...bool,description:'在场同意本次条款才true'},deposit:int,coins:int,deadline:int,minutes:int,task:{enum:['stocktake']},buyer:str,seller:str,item:str,quantity:int,unitPrice:int,service:{type:'string',enum:['住宿']},days:int,payment:{type:'string',enum:['cash','credit','repay']},creditMinutes:{...int,description:'赊账到期距今分钟，勿另建付款约定'},debt:str,instances:{type:'array',items:str}},['seller']);
define('world_move','沿路移动并结算同行/路费。',{destination:str,mode:{type:'string',enum:['walk','horse','cart','boat']},authorization:{...str,description:'私宅须有效住户入宅许可ID；口述无效'}},['destination']);
define('world_time','时长/钟点等待，二选一。',{minutes:{...int,description:'完整分钟，勿减已耗时'},until:object({dayOffset:{...int,description:'今天0、明天1'},hour:{...int,minimum:0,maximum:23},minute:{...int,minimum:0,maximum:59}},['dayOffset','hour']),activity:{type:'string',enum:['等待','工作','睡眠','休息']}},[]);
define('world_weather','查当地天气、温度及日出日落。',{operation:{enum:['inspect']},location:str},[]);
define('world_farm','查办农田粮仓；按登记粮约分地提送粮，结算税贸。',{operation:{enum:['inspect','buy','donate','reserve_seed','repair','sow','harvest','guard','adopt','settle_trade']},settlement:str,quantity:int,contract:str,phase:{enum:['pickup','deliver']},authority:str},[]);
define('world_wildlife','观察、追踪动物或从真实尸体取材。',{operation:{enum:['observe','track','gather']},species:str,target:str},[]);
define('world_crime','尝试偷取在场目标的一件物品或铜币。',{operation:{enum:['steal']},target:str,item:str,coins:int,instance:str},['operation','target']);
define('world_law','查法典声望，办理案件、上诉、公示携信、赔付服役。',{operation:{enum:['inspect','report','confess','search','arrest','hear','appeal','publish','notify','pay','labor','prison','compensate','claim']},case:str,authority:str,reporter:str,claimant:str,from:str,to:str,memory:{...str,description:'from持有的本案记忆ID'},channel:{enum:['conversation','carry']}},[]);
define('world_pet','照料、驯练、跟随或骑乘指定动物。',{operation:{enum:['inspect','feed','contact','tame','groom','treat','train','rest','follow','stay','release','mount','dismount']},target:str,item:str,skill:str,minutes:int,authorization:str},[]);
define('world_summon','查解召唤契约、役灵搬水或消耗有限守卫额度。',{operation:{enum:['inspect','dismiss','carry_water','guard']},summon:str,source:str,destination:str,millilitres:int,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_revival','当前神殿/祭坛付费登记复活点。',{location:str},[]);
define('world_check','属性/技能检定对抗，可用工具/协助义务。',{attribute:str,skill:str,difficulty:int,context:int,contextReason:str,advantage:bool,disadvantage:bool,tools:{type:'array',items:str},helpers:{type:'array',items:str},opponent:object({npc:str,attribute:str,skill:str},['npc'])},[]);
define('world_cast','施已学法术，许可/同意可用；刻记填文字。',{spell:str,target:str,source:str,destination:str,path:{type:'array',items:str,minItems:2,maxItems:8},authorization:str,permit:str,text:{...str,maxLength:80},authorizations:{type:'array',items:str,maxItems:8}},['spell','target']);
define('world_environment','刻记/接近/搬泥/炉温添自有燃料/翻谷；连通空气传声、实高差下降、现有空气呼吸。',{operation:{enum:['inspect','inspect_heat','inspect_marks','load_fuel','approach','carry_silt','turn_grain','sound','fall','breathe']},target:str,subject:str,destination:str,path:{type:'array',items:str,minItems:2,maxItems:8},text:{...str,maxLength:80},grams:int,item:str,quantity:{...int,description:'添料1-100份真实物品；其他量按操作规则'},authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_learn','在场导师/持书学技能、法术、配方。',{entity:str,source:str,kind:{type:'string',enum:['spell','skill','recipe']}},['entity','source']);
define('world_practice','练技能或有据突破阶段。',{skill:str,target:str,gain:int,breakthroughSource:str},['skill']);
define('world_profession','职业认证/退职/升职。',{profession:str,teacher:str,operation:{type:'string',enum:['certify','abandon','promote']},choice:str},['profession']);
define('world_attributes','依玩家选择分配自由点。',{attributes:object({'力量':int,'敏捷':int,'体质':int,'智力':int,'精神':int,'魅力':int})},['attributes']);
define('world_relation','查真实事件关系；npc或from/to双方。',{npc:str,from:str,to:str,eventType:str,sourceEvent:str,romance:bool},['eventType','sourceEvent']);
define('world_promise','承诺登记/obligation取消；住户同意用途后签入宅许可/authorization撤销。',{operation:{enum:['create','cancel','grant_access','revoke_access']},promisor:{...str,description:'承诺者/同意入宅的在场成年住户'},promisee:str,type:{...str,enum:['带路','送货','付款','等候','会面','协助'],description:'新建必填，交物用送货；私宅免填'},content:str,destination:str,location:{...str,description:'等候/会面/送货地点或获准私宅；不追收件人'},start:{...int,description:'起始/送货出发分，默认现在'},deadline:{...int,description:'绝对到期分=现在+约定时长'},minutes:{...int,description:'占用分；私宅距今1-1440'},authorization:str,guests:{type:'array',items:str,maxItems:8,description:'住户另准同行者，非默认全员'},obligation:str,actor:str,item:str,quantity:int,coins:int,skill:str,attribute:str},[]);
define('world_remember','记有源事实/在场者未核实传闻。',{subject:str,key:str,content:str,source:str,rumor:str,keywords:{type:'array',items:str}},['subject','key','content']);
define('world_combat','目标交锋：攻/防/脱离/推搡。',{target:str,weapon:str,intent:{type:'string',enum:['attack','defend','flee','shove']}},['target']);
define('world_lair','巢穴接近/谈判；offer交物、request索物。',{operation:{enum:['observe','approach','negotiate']},lair:str,pact:{enum:['respect_territory','nonaggression'],description:'守界/互不攻击'},alliance:bool,offer:{type:'array',maxItems:20,items:object({item:str,quantity:int},['item','quantity'])},request:{type:'array',maxItems:20,items:object({item:str,quantity:int},['item','quantity'])}},[]);
define('world_craft','按配方造/按工序修行囊物。',{operation:{enum:['manufacture','repair']},recipe:str,item:{...str,description:'维修名/类型ID；单件足够'},instance:{...str,description:'可选：instances单件ID，非名称/item_类型'},repairPlan:str,authorization:str,helpers:{type:'array',items:str}},[]);
define('world_research','研究立项或投钱耗时续研。',{operation:str,name:str,concept:str,skills:{type:'array',items:str},project:str,coins:int,minutes:int},['operation']);
define('world_settlement','经营/户籍贡献/四村议事；意见、公账委托须当事人同意。',{operation:{...str,enum:['business_open','business_close','business_bankrupt','business_report','start_project','civic_inspect','civic_residence','civic_sponsor','civic_apply_resident','civic_apply_citizen','civic_contribution','governance_inspect','governance_propose','governance_opinion','governance_close','governance_appointment','governance_grant','governance_revoke','governance_queue','governance_process']},business:str,settlement:str,authorization:str,authority:str,sponsor:str,sourceEvent:str,name:str,wood:int,stone:int,days:int,beneficiaries:{type:'array',items:str},plot:str,issue:str,proposal:str,speaker:str,opinion:{enum:['approve','reject','abstain']},content:str,steward:str,consent:bool,action:{enum:['account_report','housing','public_project']},minutes:int,budget:int,proposedFee:{...int,description:'提议费用，意见非批准或实收'},taxBps:int,due:int,request:str},['operation']);
define('world_quest','委托托管/接单/履约/退款；NPC按世界时间履约。',{operation:{...str,enum:['publish','accept','complete','cancel','inspect'],description:'publish仅发布托管，填publisher/grade/reward/content/objective；player默认私人D；另调accept；玩家当面complete，NPC在场consent接单或离屏看告示；cancel退款，inspect查进度'},publisher:{...str,description:'player或付托管报酬的NPC'},personal:bool,taker:{...str,description:'默认player；NPC须在场consent=true'},consent:bool,deadline:{...int,description:'绝对分钟，默认十日；到期退未付报酬，已付路费不退'},grade:{...str,enum:['D','C','B','A','S']},reward:{...int,minimum:20,maximum:1000000,description:'报酬，铜币'},content:str,quest:{...str,description:'回执quest ID；未知world_read查quests'},objective:object({type:{...str,enum:['deliver','visit','build']},item:{...str,description:'deliver必填名称/编号；燕麦=带壳燕麦，不换干粮'},quantity:{...int,minimum:1,description:'deliver份数，必填'},location:{...str,description:'deliver固定交付地，默认发单处；visit目的地'},project:{...str,description:'build已有授权且投入材料的工程ID'}},['type'])},['operation']);
define('world_create','原创人物/组织登记。',{type:str,name:str,project:str,data:object({age:int,occupation:str,notes:str},[])},['type','name','data']);
define('world_search','查长期事实/原聊天，可限条数',{query:str,limit:int},['query']);
define('world_catalog','公开规则/文化/势力/历史分类分页查。',{entity:str,kind:{type:'string',enum:['profession','skill','spell','item','recipe','feature','location','culture','deity','faction','history']},offset:int});
define('world_read','读已记状态',{section:str});
definitions.find(row=>row.function.name==='world_trade').function.parameters.properties.operation.description='枚举依次：交易/租铺/采购托管/盘点雇工/到场履约/售予同意顾客/还合同债/取消未履约合同。';
definitions.find(row=>row.function.name==='world_remember').function.parameters.properties.rumor={...str,description:'rumor填编号；subject=玩家，key=rumor，source=在场讲述者，content=未核实claim原文；10分钟。'};
definitions.find(row=>row.function.name==='world_settlement').function.parameters.properties.operation.description='business编号办开店、停业、现金破产、期末盈亏。';
const festivalParameters=definitions.find(row=>row.function.name==='world_settlement').function.parameters.properties;
festivalParameters.operation.enum.push('festival_inspect','festival_plan','festival_authorize','festival_join','festival_cancel');
Object.assign(festivalParameters,{festival:{...str,description:'plan用inspect的custom ID；后续用plan的festival ID'},year:{...int,minimum:1},cost:{...int,minimum:0,description:'组织者同意的私人服务费，无公共支出授权'},supplier:str});
festivalParameters.operation.description='business办经营；festival_操作：inspect查现场节俗，plan约日期，authorize的speaker分别确认组织者自费/服务者收费，join各speaker同意，cancel组织者述原因。';
const routes=new Map();
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
const fieldTools=['world_weather','world_farm','world_wildlife','world_environment','world_lair'];
const companionTools=['world_pet','world_summon'];
const field=group('world_field','粮仓farm_buy买燕麦；农事采集及环境操作，天气动物巢穴观察。',fieldTools);
field.function.parameters.properties.operation.description='farm_buy填settlement、quantity；商家world_trade，委托交付world_quest complete';
field.function.parameters.properties.settlement={...str,description:'粮仓聚落名/ID；本人柜台，管理员清醒在场'};
field.function.parameters.properties.item={...str,description:'仅买燕麦/带壳燕麦/item_oats，不换货'};
field.function.parameters.properties.quantity={...int,description:'买粮0.5公斤/份；目录扣铜入公账'};
const companion=group('world_companion','动物照料驯骑；召唤契约、搬水、限额守卫。',companionTools);
const law=structuredClone(definitions.find(row=>row.function.name==='world_law'));
law.function.description='法典声望查阅/在场财物偷窃尝试；在场authority办案、公示携信。';
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
export const readOnlyTools=new Set(['world_search','world_catalog','world_read']);
