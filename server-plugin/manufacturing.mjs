import {preconditionFailure} from './precondition.mjs';
import {noteUnlicensedUse} from './offense-notes.mjs';
import {reject} from './action-rejection.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,workshopFund,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {craftInput,craftOutput} from './stock.mjs';
import {recordCraft} from './craft-record.mjs';
import {placeSettlement} from './entity-view.mjs';
// S1b: 制作是 src:craft 制造守恒对：配方投入进 sink:consume|<物品>|craft，成品、副产品与失败回收的残料来自 src:craft。
declareLedgerWriter('manufacturing',{sources:{'src:craft':{'*':100000}},sinks:['sink:consume']});
import {effectiveProficiency}from'./professions.mjs';
import {toolBonuses}from'./checks.mjs';
import {produceItems,wearItem,heldUnit,workmanshipTier,markReturnedUnits}from'./items.mjs';
import {milestone}from'./progression.mjs';
import {prepareThermalWorkstation}from'./magic-object.mjs';
import {createHash}from'node:crypto';
import {spiritManufacture}from'./wildlife-society.mjs';
import {recordArtWork}from'./works.mjs';
import {facilityView}from'./facility-state.mjs';
import {fixtureStations,stationLicence}from'./workstation-services.mjs';
import {regionalTradePrice} from './settlement-trade.mjs';
import {resolveMaterials,workmanshipNames,craftingParam} from './item-class.mjs';
import {beginActionActivity,finishActionActivity} from './action-costs.mjs';
// Replacement value of actual recipe inputs, shared with market quotations.
// S5 adds labor valuation here; this never charges for already-owned materials.
export function recipeInputCost(d,engine,recipe,location=d.get('state','location')){
 const materials=recipe.materials.map(({item,amount})=>({item,quantity:amount,unitPrice:regionalTradePrice(d,engine,item,location)}));
 return {materials,copper:materials.reduce((n,r)=>n+r.quantity*r.unitPrice,0)};
}
// —— 卡 Q：制作结果的共用规律（玩家、NPC、精怪同一条，参数在 balance/crafting） ——
// 技能状况：没掌握所需技能 noSkill；掌握了但有效熟练度不到配方门槛、或没学过这个配方（learningRequired 而未学会）underProficient；否则 skilled。
// 缺技能、没学过配方都不再拒绝：照配方动手（看样学样），成品落在低档（workmanship.shortfall 封顶）。
const FAILURE_LABEL={intact:'无损',wear:'损耗',ruin:'报废',partial:'只剩部分功能'};
export const craftStanding=(hasSkill,proficiency,minimum,knowsRecipe=true)=>!hasSkill?'noSkill':!knowsRecipe||proficiency<(minimum??0)?'underProficient':'skilled';
const unitRoll=(seed,key)=>createHash('sha256').update(`${seed}:${key}`).digest().readUInt32LE(0)/2**32;
// 成功时的手艺档：检定档与熟练度定档；技能不足时封顶，勉强成功再落一档（不低于最低档）。
export function craftTier(engine,{standing,degree,proficiency}){
    const tier=degree==='勉强成功'?'粗糙':degree==='大成功'?(proficiency>=2100?'杰作':proficiency>=1500?'优秀':'精良'):'普通';
    if(standing==='skilled')return tier;
    const names=workmanshipNames(engine),cap=names.indexOf(craftingParam(engine,'workmanship.shortfall')[standing]);
    const index=Math.min(names.indexOf(tier),cap);
    return names[degree==='勉强成功'?Math.max(0,index-1):index];
}
// 检定失败落到哪一类：intact 无损（原样全退）、wear 损耗（退回但品质降，参数 rules.equipment.failureWear）、
// ruin 报废（按配方 failure.recoverFraction 回收残料）、partial 只剩部分功能；分布按检定档与技能状况取。
// 不在表里的失败（烧制裂损、工坊停用）返回 null，由调用方按物理原因处理。
export function craftFailure(engine,{standing,degree,seed,key}){
    const weights=craftingParam(engine,'failure.outcomes')[degree]?.[standing];
    if(!weights)return null;
    const x=unitRoll(seed,`${key}:craft-failure`);let sum=0;
    for(const [kind,w] of Object.entries(weights)){sum+=w;if(x<sum)return kind;}
    return Object.keys(weights).at(-1);
}
// 投入品质下限：按 changeItems 实际会先扣的单件（行囊 instances 前若干件）取品质，未登记单件的余量取行囊品质（缺省标准件 1）。
export function materialFloor(d,engine,holder,materials){
    let floor=1;
    for(const [item,amount] of materials){
        const held=d.get(...engine.bagPath(holder),item),units=(typeof held==='object'?held.instances??[]:[]).slice(0,amount);
        for(const id of units)floor=Math.min(floor,d.get('state','itemInstances',id,'grade')??1);
        if(amount>units.length)floor=Math.min(floor,(typeof held==='object'?held.grade:undefined)??1);
    }
    return floor;
}
// 工具乘子：所用工具实际那一件的手艺倍率 × 品质，取平均；没有工具为 1。
export function toolFactor(d,engine,holder,tools){
    if(!tools?.length)return 1;
    return tools.reduce((n,item)=>{const unit=heldUnit(d,engine,holder,item);return n+workmanshipTier(engine,unit?.workmanship).multiplier*(unit?.grade??1);},0)/tools.length;
}
// 成品品质 = 投入下限 × 达成度；达成度 = 1 −（1 − 本档 attain）÷（工具乘子 × 工位乘子），截在 [min, 1]：
// 材料定上限，技能（手艺档）定达成多少，工具与工位按乘法修正，对高手递减。
export function craftGrade(engine,{floor,tier,tools=1,station=1}){
    const attain=workmanshipTier(engine,tier).attain,m=tools*station,min=craftingParam(engine,'quality.attainment').min;
    const reached=m>0?Math.min(1,Math.max(min,1-(1-attain)/m)):min;
    return Math.round(floor*reached*10000)/10000;
}
// 失败类别的退料规则（单一来源）：intact 全退，wear 按 failureWear.returnFraction（并带 gradeFactor），其余按配方 recoverFraction；partial 不退。
export function failureRecover(engine,failure,recoverFraction){
    if(failure==='wear'){const {returnFraction,gradeFactor}=engine.rules.equipment.failureWear;return {recover:returnFraction,gradeFactor};}
    if(failure==='partial')return {recover:0};
    return {recover:failure==='intact'?1:recoverFraction};
}
// 退回份数（returnMaterials 与账本对账共用）：损耗向上取整、至少一份且不超过投入，其余向下取整。
export const refundCount=(amount,result)=>result.gradeFactor!==undefined?Math.min(amount,Math.max(1,Math.ceil(amount*result.recover))):Math.floor(amount*result.recover);
// 一批制作的结果（检定之后、产出之前）：成功给手艺档与品质；失败给失败类别、回收比例，partial 另给最低档与其品质。
export function craftOutcome(engine,{standing,degree,success,proficiency,floor,tools,station,recoverFraction,seed,key}){
    if(success){
        // 材料定上限：品质够不上检定档的达成度时，手艺档落到品质所及的那一档（劣料、劣工具、坏工位都会把档拉下来）。
        const names=workmanshipNames(engine);let tier=craftTier(engine,{standing,degree,proficiency});const grade=craftGrade(engine,{floor,tier,tools,station});
        for(let i=names.indexOf(tier);i>0&&workmanshipTier(engine,names[i]).attain>grade+1e-9;i--)tier=names[i-1];
        return {tier,grade};
    }
    const failure=craftFailure(engine,{standing,degree,seed,key});
    if(!failure)return {failure:null,recover:recoverFraction};
    if(failure!=='partial')return {failure,...failureRecover(engine,failure,recoverFraction)};
    const tier=workmanshipNames(engine)[0];
    return {failure,recover:0,tier,grade:craftGrade(engine,{floor,tier,tools,station})};
}
// 失败退回的材料（玩家、NPC、精怪同一条）：退回份数按 craftOutcome 的 recover（损耗向上取整、至少一份，其余向下取整），
// 损耗退回的那几份登记为单件、品质 = 该材料投入品质 × gradeFactor（记在 materialFloor 读品质的单件 grade 上）。
// give(item, n) 是调用方的入库写法；floors 是扣料前各材料的投入品质。烧制裂损不退。
export function returnMaterials(d,engine,holder,materials,result,{floors,eventId,give,cracked=false}){
    const back=[];if(cracked)return back;
    for(const [item,amount] of materials){
        const n=refundCount(amount,result);
        if(!n)continue;
        give(item,n);
        if(result.gradeFactor!==undefined)markReturnedUnits(d,engine,holder,item,n,{eventId,grade:Math.round((floors.get(item)??1)*result.gradeFactor*10000)/10000});
        back.push({item,amount:n});
    }
    return back;
}
// 各材料扣料前的投入品质（逐种取 materialFloor）。
export const materialFloors=(d,engine,holder,materials)=>new Map([...materials].map(([item,amount])=>[item,materialFloor(d,engine,holder,[[item,amount]])]));
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}无效`);return value;};
export function registerRecipe(d,engine,data,project,maximumStage){
    if(!data||typeof data!=='object')throw preconditionFailure('配方数据无效');
    const skill=engine.resolve(data.skill,'skill');
    if(!project.skills.includes(skill)||!d.get('state','skills',skill))throw preconditionFailure('配方技能必须来自已掌握的研究知识');
    const minimumProficiency=integer(data.minimumProficiency??0,0,2699,'配方熟练度'),stage=Math.floor(minimumProficiency/300);
    if(stage>maximumStage)throw preconditionFailure('配方阶段不能超过相关技能最高阶段减一');
    const materials=(rows,label)=>{
        if(!Array.isArray(rows))throw preconditionFailure(`${label}列表无效`);
        return rows.map(row=>({item:engine.resolve(row?.item,'item'),amount:integer(row?.amount,1,100000,`${label}数量`)}));
    };
    const ingredients=materials(data.materials,'材料');
    if(!ingredients.length)throw preconditionFailure('配方必须消耗真实材料');
    if(!Array.isArray(data.tools??[])||(data.tools??[]).length>8)throw preconditionFailure('配方工具列表无效');
    const tools=(data.tools??[]).map(item=>engine.resolve(item,'item'));
    if(new Set(tools).size!==tools.length||tools.some(item=>ingredients.some(row=>row.item===item)))throw preconditionFailure('配方工具重复或与耗材重叠');
    const output={item:engine.resolve(data.output?.item,'item'),quantity:integer(data.output?.quantity,1,200,'成品数量')};
    const byproducts=materials(data.byproducts??[],'副产品');
    for(const row of byproducts)integer(row.amount,1,200,'副产品数量');
    if(new Set([output.item,...byproducts.map(row=>row.item)]).size!==1+byproducts.length)throw preconditionFailure('主产物与副产品不能重复登记');
    // G0 §11: only same-resource self-production without a conversion is forbidden. Anything else is judged
    // by materials, tools, labour hours and skill stage; there is no ceiling derived from value.
    for(const row of [output,...byproducts.map(b=>({item:b.item,quantity:b.amount}))]){
        const consumed=ingredients.filter(m=>m.item===row.item).reduce((n,m)=>n+m.amount,0);
        if(consumed&&row.quantity>=consumed)throw preconditionFailure(`世上没有凭空多出同一种东西的做法：投入${consumed}份${engine.byId.get(row.item)?.name??row.item}不可能做出${row.quantity}份同样的东西；须经不同材料转化`);
    }
    const minutes=integer(data.minutes,1,43200,'制造时间'),difficulty=data.difficulty;
    if(!Object.values(engine.rules.check.difficulties).includes(difficulty))throw preconditionFailure('难度不在规则档位');
    const toolWear=integer(data.toolWear??1,0,10,'工具损耗'),recoverFraction=data.failure?.recoverFraction??0;
    if(typeof recoverFraction!=='number'||!Number.isFinite(recoverFraction)||recoverFraction<0||recoverFraction>1)throw preconditionFailure('失败回收率无效');
    const failure={recoverFraction,injury:integer(data.failure?.injury??0,0,50,'失败伤害')};
    // K5: a recipe that needs a kind of station is made wherever such a station stands; only a
    // station-free recipe may be bound to one place.
    const location=data.location&&!data.workstation?engine.resolve(data.location):null;
    if(location&&!engine.world.locations.some(row=>row.id===location))throw preconditionFailure('配方工坊地点未登记');
    if(data.workstation!==undefined&&(!data.workstation||typeof data.workstation!=='string'
        ||![...engine.world.locations,...Object.values(d.get('state','created')??{})].some(row=>(!location||row.id===location)&&fixtureStations(row).some(station=>station.kind===data.workstation))))throw preconditionFailure('配方缺少可用工作台');
    return{skill,stage,minimumProficiency,materials:ingredients,output,tools,minutes,difficulty,toolWear,failure,byproducts,learningRequired:true,
        ...(location?{location}:{}),...(data.workstation?{workstation:data.workstation}:{})};
}
export function kilnWorkResult(d,plan,outcome,quantity,eventId,{endStress}={}){
    if(plan?.startStress===undefined)return null;
    const state=d.get('state','records',`physical_feature:${plan.feature}`,'state','thermal');
    const finalStress=endStress??state?.crackStressUnits;
    if(!Number.isSafeInteger(finalStress)||finalStress<plan.startStress)throw Error('烧制裂损状态缺失或回退');
    const stress=finalStress-plan.startStress,riskPermille=Math.min(1000,stress*plan.crackPermillePerStress);
    let crackedQuantity=0;
    if(outcome.success)for(let i=0;i<quantity;i++){
        const roll=createHash('sha256').update(`${d.get('randomSeed')}:${eventId}:kiln:${i}`).digest().readUInt32LE(0)%1000;
        if(roll<riskPermille)crackedQuantity++;
    }
    if(outcome.success&&crackedQuantity===quantity){outcome.success=false;outcome.degree='烧制裂损';}
    return{feature:plan.feature,stress,riskPermille,crackedQuantity};
}
export function workstation(d,engine,recipe,args){
    if(!recipe.workstation)return null;
    const location=d.get('state','location'),facility=facilityView(engine,d.get('state'),location);
    const station=facility?.workstations.find(row=>row.kind===recipe.workstation);
    if(!station)throw preconditionFailure(facility?.factor===0&&fixtureStations(d.get('state','created',location)??engine.byId.get(location)).some(row=>row.kind===recipe.workstation)?'工坊已损毁或停用':'当前位置没有所需工作台');
    // K5: title, a lease, the owner's consent or the posted fee license the use;
    // knowing the recipe or having learned it from the owner does not. Without
    // a licence the work still happens and is noted as unlicensed use (K6).
    const licence=stationLicence(engine,d,station,'player',{authorization:args.authorization});
    if(!licence)noteUnlicensedUse(d,station,{kind:'workstation'});
    const fee=licence?.basis==='paid'?integer(station.fee??0,0,100000,'工坊使用费'):0;
    if(d.get('state','player','coins')<fee)reject('E-ACTION-FUNDS','工坊使用费不足',{missing:['需要足额工坊使用费'],repair:['补足工坊使用费后重试']});
    // A paid service is the owner's to perform; a loan or a lease asks nothing more of them.
    if(licence?.basis==='paid'&&station.owner?.startsWith('npc_')){
        const owner=d.get('state','npcs',station.owner);if(!owner||isPhysicallyDead(engine,d,station.owner)||owner.status==='濒死')throw preconditionFailure('工坊主人无法履约');
    }
    const workMinutes=Math.ceil(recipe.minutes/facility.factor);
    const thermalPlan=prepareThermalWorkstation(d,engine,station,workMinutes);
    return{...station,fee,workMinutes,factor:facility.factor,...(thermalPlan?{thermalPlan}:{})};
}
export function manufacture(d,args,eventId){
    if(args.maker!==undefined)return spiritManufacture.call(this,d,args,eventId,{workstation,kilnWorkResult,craftStanding,craftOutcome,materialFloor,toolFactor,materialFloors,returnMaterials});
    if(args.batches!==undefined){
        const requested=integer(args.batches,1,100000,'制造批数');
        const recipe=this.byId.get(this.resolve(args.recipe,'recipe'));
        // 卡 Q：缺技能、熟练度不够、没学过配方都不拒绝（各批照做、落在低档）；只有物理上做不了的才拒绝。
        if(recipe.location&&recipe.location!==d.get('state','location'))throw preconditionFailure('不在所需工坊');
        // 材料按类别落到实际持有物（与单批同一条 resolveMaterials）：批数按第一批实际要用的物品算，各批再各自落实。
        const materials=new Map();for(const row of resolveMaterials(d,this,'player',recipe.materials))materials.set(row.item,(materials.get(row.item)??0)+row.amount);
        const station=workstation(d,this,recipe,args),minutes=station?.workMinutes??recipe.minutes;
        let batches=Math.min(requested,Math.floor(43200/minutes));
        for(const [item,amount] of materials)batches=Math.min(batches,Math.floor(this.quantity(d,'player',item)/amount));
        if(station?.fee)batches=Math.min(batches,Math.floor(d.get('state','player','coins')/station.fee));
        if(recipe.toolWear)for(const item of recipe.tools??[])batches=Math.min(batches,Math.ceil((heldUnit(d,this,'player',item).durability??this.byId.get(item).durability)/recipe.toolWear));
        if(!batches)throw preconditionFailure('材料、工坊费、工具或可用工时不足以制作一批');
        const single={...args};delete single.batches;
        const results=[];
        for(let i=0;i<batches;i++){
            if(i&&(isPhysicallyDead(this,d,'player')||d.get('state','player','status')!=='正常'))break;
            results.push(manufacture.call(this,d,single,i?`${eventId}:batch:${i}`:eventId));
        }
        batches=results.length;
        const produced=new Map(),salvage=new Map();
        for(const row of results){for(const product of row.produced)produced.set(product.item,{...product,amount:(produced.get(product.item)?.amount??0)+product.amount});for(const product of row.salvage)salvage.set(product.item,(salvage.get(product.item)??0)+product.amount);}
        const successful=results.filter(row=>row.success).length;
        return {...results[0],requestedBatches:requested,batches,clipped:requested-batches,results,
            success:successful>0,degree:batches===1?results[0].degree:successful===batches?'成功':successful?'部分成功':'失败',receipts:results.map(row=>row.receipt),
            healthDelta:results.reduce((n,row)=>n+row.healthDelta,0),
            ...(results.at(-1).cost?{cost:{time:results.reduce((n,row)=>n+row.spent.minutes,0),body:results.at(-1).cost.body}}:{}),
            ...(results.some(row=>row.experience!==undefined)?{experience:results.reduce((n,row)=>n+(row.experience??0),0)}:{}),
            produced:[...produced.values()],salvage:[...salvage].map(([item,amount])=>({item,amount})),instances:results.flatMap(row=>row.instances),
            spent:{feePaid:results.reduce((n,row)=>n+row.spent.feePaid,0),minutes:results.reduce((n,row)=>n+row.spent.minutes,0),materials:[...results.reduce((m,row)=>{for(const r of row.spent.materials)m.set(r.item,(m.get(r.item)??0)+r.quantity);return m;},new Map())].map(([item,quantity])=>({item,name:this.byId.get(item).name,quantity})),toolWear:results.flatMap(row=>row.spent.toolWear)},
            factSummary:`实际制作${batches}批（申请${requested}批）；${results.filter(row=>row.success).length}批成功，成品与副产品按各批检定真实入账。`};
    }
    const recipe=this.byId.get(this.resolve(args.recipe,'recipe'));
    if(recipe.location&&recipe.location!==d.get('state','location'))throw preconditionFailure('不在所需工坊');
    // 卡 Q：没掌握技能、熟练度不到门槛或没学过配方都照样动手，结果按技能状况落档（craftOutcome）。
    const hasSkill=Boolean(d.get('state','skills',recipe.skill)),proficiency=hasSkill?effectiveProficiency(d,this,recipe.skill):0;
    const standing=craftStanding(hasSkill,proficiency,recipe.minimumProficiency,!recipe.learningRequired||Boolean(d.get('state','recipes',recipe.id)));
    const attribute=recipe.attribute??this.byId.get(recipe.skill).attribute??'智力',station=workstation(d,this,recipe,args),workMinutes=station?.workMinutes??recipe.minutes;
    // Check real required tools before spending material, rent or time.
    toolBonuses(d,this,recipe.tools??[],attribute,recipe.skill);
    // 材料按类别（item-use-tags.substitutable，如燃料）落到实际持有的同类物品；检查、扣料、回收、记账都用落实后的物品。
    const resolved=resolveMaterials(d,this,'player',recipe.materials);
    const materials=new Map();for(const row of resolved)materials.set(row.item,(materials.get(row.item)??0)+integer(row.amount,1,100000,'材料数量'));
    for(const[item,amount]of materials)if(this.quantity(d,'player',item)<amount)throw preconditionFailure(`缺少${this.byId.get(item).name}`);
    if(recipe.tools?.some(item=>materials.has(item)))throw preconditionFailure('同一物品不能同时作为耗材与保留工具');
    const products=[{item:recipe.output.item,amount:recipe.output.quantity},...recipe.byproducts??[]];
    for(const row of products){integer(row.amount,1,200,'产物数量');if(!this.byId.has(row.item))throw preconditionFailure('产物未登记');}
    if(new Set(products.map(row=>row.item)).size!==products.length)throw preconditionFailure('主产物与副产品不能重复登记');
    const wear=integer(recipe.toolWear??1,0,10,'工具损耗');
    const failure=recipe.failure??{},recover=failure.recoverFraction??0;
    if(typeof recover!=='number'||recover<0||recover>1)throw preconditionFailure('失败回收率无效');
    const injury=integer(failure.injury??0,0,50,'失败伤害');
    const hpBefore=d.get('state','player','hp');
    const inputCost=recipeInputCost(d,this,{...recipe,materials:resolved});
    const outcome=this.check(d,{attribute,skill:recipe.skill,difficulty:recipe.difficulty,tools:recipe.tools??[],helpers:args.helpers??[]},eventId);
    // 品质链的三个输入，在扣料、磨损工具之前读：投入下限、工具乘子、工位乘子（设施完好 1、降级 0.5）。
    const floor=materialFloor(d,this,'player',materials),floors=materialFloors(d,this,'player',materials),tools=toolFactor(d,this,'player',recipe.tools),
        stationFactor=station?.factor??1;
    for(const[item,amount]of materials)this.itemDelta(d,'player',item,-amount,craftInput('manufacturing',eventId));
    if(station?.fee){
        moveCoins(d,{from:purse(null,'player'),to:station.owner?.startsWith('npc_')?purse(null,station.owner):workshopFund(station.id),amount:station.fee,writer:'manufacturing',eventId:eventId});
        d.set(['state','player','coins'],d.get('state','player','coins')-station.fee);
        if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+station.fee);
        else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+station.fee);
    }
    const span=beginActionActivity(d,this,'heavy');
    this.advance(d,workMinutes,eventId);
    const cost=finishActionActivity(d,this,span);
    if(facilityView(this,d.get('state'),d.get('state','location'))?.factor===0){outcome.success=false;outcome.degree='工坊停用，未能完成';}
    const thermal=kilnWorkResult(d,station?.thermalPlan,outcome,recipe.output.quantity,eventId);
    if(thermal)products[0].amount-=thermal.crackedQuantity;
    const toolWear=[];
    for(const item of recipe.tools??[]){const before=heldUnit(d,this,'player',item).durability??this.byId.get(item).durability;
        toolWear.push({item,name:this.byId.get(item).name,before,after:wearItem(d,this,'player',item,wear)});}
    const ids=[],salvage=[];
    let workmanship=null,work=null;
    const result=craftOutcome(this,{standing,degree:outcome.degree,success:outcome.success,proficiency,floor,tools,station:stationFactor,recoverFraction:recover,seed:d.get('randomSeed'),key:eventId});
    const grade=result.grade??null,partial=result.failure==='partial'?[{...products[0]}]:[];
    if(outcome.success){
        workmanship=result.tier;
        for(const row of products)if(row.amount)ids.push(...produceItems(d,this,row.item,row.amount,{eventId,recipe:recipe.id,workmanship,grade,inputs:[...materials.keys()],books:craftOutput('manufacturing',eventId)}));
        work=recordArtWork(d,this,{recipe,instances:ids.filter(unit=>d.get('state','itemInstances',unit,'item')===recipe.output.item),workmanship,eventId});
        // 没掌握的技能无从练起（练习只加在已有技能上）。
        if(hasSkill)this.practice(d,{skill:recipe.skill,gain:3,target:recipe.id},eventId);
        Object.assign(outcome,milestone(d,this,'craft',recipe.id,eventId));d.say(`制成${this.byId.get(recipe.output.item).name}，做工${workmanship}`);
    }else{
        // 卡 Q：失败有结构——无损全收回、损耗按配方回收、报废不回收、只剩部分功能得到最低档成品（投入耗尽）。
        if(partial.length){workmanship=result.tier;ids.push(...produceItems(d,this,partial[0].item,partial[0].amount,{eventId,recipe:recipe.id,workmanship,grade,inputs:[...materials.keys()],books:craftOutput('manufacturing',eventId)}));}
        else salvage.push(...returnMaterials(d,this,'player',materials,result,{floors,eventId,cracked:Boolean(thermal?.crackedQuantity),give:(item,n)=>this.itemDelta(d,'player',item,n,craftOutput('manufacturing',eventId))}));
        if(outcome.degree==='大失败'&&injury)this.health(d,{delta:-injury},eventId);
        d.say(partial.length?`制造${outcome.degree}，只做出${partial[0].amount}件${workmanship}的${this.byId.get(partial[0].item).name}，部分用途不具备`:`制造${outcome.degree}${result.failure?`（${FAILURE_LABEL[result.failure]}）`:''}，耗时${workMinutes}分钟，回收${salvage.reduce((sum,row)=>sum+row.amount,0)}份材料`);
    }
    const receipt={id:`crafted_${eventId}`,recipe:recipe.id,item:recipe.output.item,quantity:outcome.success?products[0].amount:partial[0]?.amount??0,...(thermal?{thermal}:{}),
        maker:'player',name:d.get('state','player','name'),minute:d.get('state','minute'),station:station?.id??null,fee:station?.fee??0,inputCost,
        degree:outcome.degree,workmanship,...(grade!==null?{grade}:{}),...(result.failure?{failure:result.failure}:{}),...(standing!=='skilled'?{standing}:{}),instances:ids,byproducts:outcome.success?recipe.byproducts??[]:[],salvage};
    d.set(['state','crafted',receipt.id],receipt);
    // 行为人 = 玩家（receipt.maker），发生地 = 玩家所在地的聚落。
    recordCraft(d,{engine:this,actor:'player',place:placeSettlement(this,d.get('state'),d.get('state','location')).value,recipe:recipe.id,batches:1,inputs:Object.fromEntries(materials),outputs:Object.fromEntries((outcome.success?products.filter(row=>row.amount):partial.length?partial:salvage).map(row=>[row.item,row.amount])),...(!outcome.success?{failure:result.failure??'ruin'}:{}),writer:'manufacturing',eventId});
    return{recipe:recipe.id,...outcome,...(cost?{cost}:{}),receipt:receipt.id,instances:ids,workmanship,...(grade!==null?{grade}:{}),...(result.failure?{failure:result.failure}:{}),...(standing!=='skilled'?{standing}:{}),...(work?{work}:{}),salvage,...(thermal?{thermal}:{}),
        spent:{feePaid:station?.fee??0,minutes:workMinutes,materials:[...materials].map(([item,quantity])=>({item,name:this.byId.get(item).name,quantity})),toolWear},
        healthDelta:d.get('state','player','hp')-hpBefore,produced:(outcome.success?products.filter(row=>row.amount):partial).map(row=>({...row,name:this.byId.get(row.item).name})),
        factSummary:`${outcome.success?`制成${this.byId.get(recipe.output.item).name}${products[0].amount}件`:partial.length?`失败，只做出${partial[0].amount}件${workmanship}的${this.byId.get(partial[0].item).name}（部分用途不具备）`:'未得到任何成品'}；${salvage.length?`实际回收${salvage.map(row=>`${this.byId.get(row.item).name}${row.amount}份`).join('、')}`:'没有回收到任何可用材料'}；工坊费${station?.fee??0}铜已支付，耗时${workMinutes}分钟。`,
        note:'spent已实际支付及消耗，salvage是实际回收物，produced是实际成品。失败不退款；没有回收时只能描写弃置的废料，不能写回收到刨花或碎屑。'};
}
