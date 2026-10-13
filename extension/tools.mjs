const str={type:'string'},int={type:'integer'},bool={type:'boolean'};
const object=(properties,required=[])=>({type:'object',properties,...(required.length?{required}:{}),additionalProperties:false});
const definitions=[];
const define=(name,description,properties,required=[])=>definitions.push({type:'function',function:{name,description,parameters:object(properties,required)}});
define('world_trade','向实际商家交易或办理经营合同；公共粮仓买粮用world_field的farm_buy。',{operation:{enum:['trade','lease','procure','hire','fulfill','sell','pay','cancel']},business:str,contract:str,location:str,consent:{...bool,description:'当事人在场且明确同意本次条款时才填true'},deposit:int,coins:int,deadline:int,minutes:int,task:{enum:['stocktake']},buyer:str,seller:str,item:str,quantity:int,unitPrice:int,service:{type:'string',enum:['住宿']},days:int,payment:{type:'string',enum:['cash','credit','repay']},creditMinutes:{...int,description:'赊账约定从现在起多少分钟后到期；一小时填60，不另建付款约定'},debt:str,instances:{type:'array',items:str}},['seller']);
define('world_move','用地点中文名称或已知编号沿路线抵达目的地，结算同行者与路费。',{destination:str,mode:{type:'string',enum:['walk','horse','cart','boat']},authorization:{...str,description:'进入私宅时，引用住户已给出的有效进入许可编号；口头叙述不代替许可'}},['destination']);
define('world_time','等待指定时长用 minutes，到指定钟点用 until 交由引擎计算，二者只选一个。',{minutes:{...int,description:'本次完整时长，例如等一小时填60，不减掉此前耗时'},until:object({dayOffset:{...int,description:'相对当前日期：今天0、明天1'},hour:{...int,minimum:0,maximum:23},minute:{...int,minimum:0,maximum:59}},['dayOffset','hour']),activity:{type:'string',enum:['等待','工作','睡眠','休息']}},[]);
define('world_weather','查看当前位置的天气、温度和日出日落时间。',{operation:{enum:['inspect']},location:str},[]);
define('world_farm','查看农田粮仓，或按操作买粮、捐粮、留种、修仓、播种、收获、巡田，或持登记粮约分两地提粮送达并结算税贸账。',{operation:{enum:['inspect','buy','donate','reserve_seed','repair','sow','harvest','guard','adopt','settle_trade']},settlement:str,quantity:int,contract:str,phase:{enum:['pickup','deliver']},authority:str},[]);
define('world_wildlife','观察当地动物、追踪指定物种，或从指定真实尸体取材。',{operation:{enum:['observe','track','gather']},species:str,target:str},[]);
define('world_crime','尝试偷取在场目标的一件物品或指定铜币。',{operation:{enum:['steal']},target:str,item:str,coins:int,instance:str},['operation','target']);
define('world_law','查询法典及分区声望账，或办理报案、审理、上诉、公示、携信、赔付与服役。',{operation:{enum:['inspect','report','confess','search','arrest','hear','appeal','publish','notify','pay','labor','prison','compensate','claim']},case:str,authority:str,reporter:str,claimant:str,from:str,to:str,memory:{...str,description:'传话者已持有的本案法律记忆编号'},channel:{enum:['conversation','carry']}},[]);
define('world_pet','对指定动物执行喂养、接触、驯服、照料、训练、跟随或骑乘操作。',{operation:{enum:['inspect','feed','contact','tame','groom','treat','train','rest','follow','stay','release','mount','dismount']},target:str,item:str,skill:str,minutes:int,authorization:str},[]);
define('world_summon','查看或解除召唤契约，令役灵搬水，或消耗契约守卫的有限防护额度。',{operation:{enum:['inspect','dismiss','carry_water','guard']},summon:str,source:str,destination:str,millilitres:int,authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_revival','在当前神殿或祭坛登记复活点并支付费用。',{location:str},[]);
define('world_check','依据属性技能做难度检定或对抗，可引用工具与协助义务。',{attribute:str,skill:str,difficulty:int,context:int,contextReason:str,advantage:bool,disadvantage:bool,tools:{type:'array',items:str},helpers:{type:'array',items:str},opponent:object({npc:str,attribute:str,skill:str},['npc'])},[]);
define('world_cast','向指定目标施放已学法术，可引用施法许可和本人同意；刻记须给出实际文字。',{spell:str,target:str,authorization:str,permit:str,text:{...str,maxLength:80},authorizations:{type:'array',items:str,maxItems:8}},['spell','target']);
define('world_environment','查看当地环境对象及可见刻记、走近目标、搬运松泥，或检查炉温与添加自有燃料。',{operation:{enum:['inspect','inspect_heat','inspect_marks','load_fuel','approach','carry_silt']},target:str,destination:str,grams:int,item:str,quantity:{...int,description:'添料时为1到100份真实物品；其他操作按各自数量规则'},authorization:str,authorizations:{type:'array',items:str,maxItems:8}},[]);
define('world_learn','向在场导师或通过持有书籍学习指定技能、法术或配方。',{entity:str,source:str,kind:{type:'string',enum:['spell','skill','recipe']}},['entity','source']);
define('world_practice','练习指定技能或凭来源申请阶段突破。',{skill:str,target:str,gain:int,breakthroughSource:str},['skill']);
define('world_profession','申请指定职业的认证、退职或升职。',{profession:str,teacher:str,operation:{type:'string',enum:['certify','abandon','promote']},choice:str},['profession']);
define('world_attributes','按玩家决定分配已有自由属性点。',{attributes:object({'力量':int,'敏捷':int,'体质':int,'智力':int,'精神':int,'魅力':int})},['attributes']);
define('world_relation','查核真实事件造成的关系变化；双方可用npc或from、to指定。',{npc:str,from:str,to:str,eventType:str,sourceEvent:str,romance:bool},['eventType','sourceEvent']);
define('world_promise','登记或取消承诺；办理住户已同意的拜访许可及收回。',{operation:{enum:['create','cancel','grant_access','revoke_access']},promisor:{...str,description:'承诺者；私宅许可填写实际在场并已同意的成年住户'},promisee:str,type:{...str,enum:['带路','送货','付款','等候','会面','协助'],description:'新建承诺必填类别；当面交物也用送货，私宅许可不用此字段'},content:{...str,description:'约定内容，或住户同意的拜访用途'},destination:str,location:{...str,description:'等候/会面或NPC送货的固定交付地点，或获准进入的私宅；送货者不会追踪收件人新位置'},start:{...int,description:'等候/会面开始时间；NPC送货出发时间，默认现在'},deadline:{...int,description:'从开局累计的到期分钟；当前分钟加约定时长'},minutes:{...int,description:'占用时长；私宅许可为从现在起1至1440分钟'},authorization:{...str,description:'撤销私宅许可时填写已签发许可编号'},guests:{type:'array',items:str,maxItems:8,description:'住户另外同意入内的当前同行者，不默认许可全部同行人'},obligation:{...str,description:'取消时填写已登记的约定编号'},actor:str,item:str,quantity:int,coins:int,skill:str,attribute:str},[]);
define('world_remember','记录有来源的长期事实，或登记在场讲述者提供的未核实传闻。',{subject:str,key:str,content:str,source:str,rumor:str,keywords:{type:'array',items:str}},['subject','key','content']);
define('world_combat','与指定目标结算攻击、防守、脱离或推搡交锋。',{target:str,weapon:str,intent:{type:'string',enum:['attack','defend','flee','shove']}},['target']);
define('world_lair','观察当地巢穴或接近巢穴中已有的占据者。',{operation:{enum:['observe','approach']},lair:str},[]);
define('world_craft','按配方制造，或按维修工序修理行囊中已有的物品。',{operation:{enum:['manufacture','repair']},recipe:str,item:{...str,description:'维修物品名称或类型编号；仅有一件时传此字段即可'},instance:{...str,description:'可省略；仅填写行囊 instances 数组中实际存在的单件编号，不填物品名称或 item_ 类型编号'},repairPlan:str,authorization:str,helpers:{type:'array',items:str}},[]);
define('world_research','建立研究项目，或投入经费与时间继续已有研究。',{operation:str,name:str,concept:str,skills:{type:'array',items:str},project:str,coins:int,minutes:int},['operation']);
define('world_settlement','按编号办理经营、户籍贡献或四村议事；意见和公账委托须实际当事人同意。',{operation:{...str,enum:['business_open','business_close','business_bankrupt','business_report','start_project','civic_inspect','civic_residence','civic_sponsor','civic_apply_resident','civic_apply_citizen','civic_contribution','governance_inspect','governance_propose','governance_opinion','governance_close','governance_appointment','governance_grant','governance_revoke','governance_queue','governance_process']},business:str,settlement:str,authorization:str,authority:str,sponsor:str,sourceEvent:str,name:str,wood:int,stone:int,days:int,beneficiaries:{type:'array',items:str},plot:str,issue:str,proposal:str,speaker:str,opinion:{enum:['approve','reject','abstain']},content:str,steward:str,consent:bool,action:{enum:['account_report','housing','public_project']},minutes:int,budget:int,proposedFee:{...int,description:'议案提出的费用；意见记录不代表已批准或实际收费'},taxBps:int,due:int,request:str},['operation']);
define('world_quest','登记委托用publish，玩家承接用accept，当面交货领托管报酬用complete。',{operation:{...str,enum:['publish','accept','complete'],description:'publish仅发布托管，不登记承接；玩家明确接受后另调accept；备齐交付物且委托人在场时调complete'},publisher:{...str,description:'发布时必填：已同意委托并支付托管报酬的NPC'},personal:{...bool,description:'私人委托填true，只能发布D级'},grade:{...str,enum:['D','C','B','A','S'],description:'发布必填；私人委托为D'},reward:{...int,minimum:20,maximum:1000000,description:'发布时托管的铜币报酬'},content:{...str,description:'发布时必填的委托内容'},quest:{...str,description:'接受或完成必填：publish回执的quest编号；可用world_read查询quests，不凭空拼编号'},objective:object({type:{...str,enum:['deliver','visit','build']},item:{...str,description:'deliver必填：约定物品名称或编号；燕麦即带壳燕麦，不能换成干粮'},quantity:{...int,minimum:1,description:'deliver必填：约定交付份数；十份燕麦填10'},location:str,project:str},['type'])},['operation']);
define('world_create','登记原创人物或组织，提供名称、类型和人物资料。',{type:str,name:str,project:str,data:object({age:int,occupation:str,notes:str},[])},['type','name','data']);
define('world_search','按关键词检索长期事实和原始聊天，可指定条数。',{query:str,limit:int},['query']);
define('world_catalog','按名称或编号查公开规则与文化、势力、历史资料，可按类别分页列出。',{entity:str,kind:{type:'string',enum:['profession','skill','spell','item','recipe','feature','location','culture','deity','faction','history']},offset:int});
define('world_read','查看玩家、行囊、人物或约定等已记录状态。',{section:str});
definitions.find(row=>row.function.name==='world_trade').function.parameters.properties.operation.description='交易或办理经营合同：lease租铺，procure托管采购，hire雇工盘点，fulfill到场履约，sell向同意的实际顾客出售，pay还合同债，cancel取消未履约合同。';
definitions.find(row=>row.function.name==='world_remember').function.parameters.properties.rumor.description='记录有来源的长期事实；当面问询登记传闻时填写rumor编号，subject为玩家、key与rumor一致、source为在场讲述者、content原样填写其未核实claim，交谈耗时10分钟。';
definitions.find(row=>row.function.name==='world_settlement').function.parameters.properties.operation.description='用business编号办理business_open开店、business_close停业、business_bankrupt现金破产、business_report期末盈亏；也办理户籍贡献与四村议事，意见和公账委托须实际当事人同意。';
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
const field=group('world_field','公共粮仓买带壳燕麦用farm_buy；也办理农事、采集和天气、动物、环境或巢穴观察。',fieldTools);
field.function.parameters.properties.operation.description='farm_buy在公共粮仓柜台购买带壳燕麦，填settlement和quantity；向实际商家买商品用world_trade；委托交货领报酬用world_quest complete';
field.function.parameters.properties.settlement.description='粮仓所属聚落名称或编号，如河湾村；须本人到柜台且管理员在场清醒';
field.function.parameters.properties.item={...str,description:'粮仓买粮可填燕麦、带壳燕麦或item_oats；仅办理此谷物，不能换货'};
field.function.parameters.properties.quantity.description='farm_buy的半公斤粮食份数，十份填10，按目录单价扣铜钱并入公账';
const companion=group('world_companion','按操作照料、驯服或骑乘动物，或管理召唤契约及搬水。',companionTools);
const law=structuredClone(definitions.find(row=>row.function.name==='world_law'));
law.function.description='偷取目标财物，或指定案件与在场执法者 authority 办理报案、认罪、审理及履行裁决。';
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
