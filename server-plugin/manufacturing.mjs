import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,workshopFund,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {craftInput,craftOutput,recordCraft} from './stock.mjs';
// S1b: 制作是 src:craft 制造守恒对：配方投入进 sink:consume|<物品>|craft，成品、副产品与失败回收的残料来自 src:craft。
declareLedgerWriter('manufacturing',{sources:{'src:craft':{'*':100000}},sinks:['sink:consume']});
import {effectiveProficiency}from'./professions.mjs';
import {toolBonuses}from'./checks.mjs';
import {produceItems,wearItem,heldUnit}from'./items.mjs';
import {milestone}from'./progression.mjs';
import {prepareThermalWorkstation}from'./magic-object.mjs';
import {createHash}from'node:crypto';
import {spiritManufacture}from'./wildlife-society.mjs';
import {recordArtWork}from'./works.mjs';
import {facilityView}from'./facility-state.mjs';
import {regionalTradePrice} from './settlement-trade.mjs';
import {beginActionActivity,finishActionActivity} from './action-costs.mjs';
// Replacement value of actual recipe inputs, shared with market quotations.
// S5 adds labor valuation here; this never charges for already-owned materials.
export function recipeInputCost(d,engine,recipe,location=d.get('state','location')){
 const materials=recipe.materials.map(({item,amount})=>({item,quantity:amount,unitPrice:regionalTradePrice(d,engine,item,location)}));
 return {materials,copper:materials.reduce((n,r)=>n+r.quantity*r.unitPrice,0)};
}
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
    const location=data.location?engine.resolve(data.location):null;
    if(location&&!engine.world.locations.some(row=>row.id===location))throw preconditionFailure('配方工坊地点未登记');
    if(data.workstation!==undefined&&(!data.workstation||typeof data.workstation!=='string'
        ||!engine.world.locations.some(row=>(!location||row.id===location)&&row.workstations?.some(station=>station.kind===data.workstation))))throw preconditionFailure('配方缺少可用工作台');
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
        const roll=createHash('sha256').update(`${d.document.randomSeed}:${eventId}:kiln:${i}`).digest().readUInt32LE(0)%1000;
        if(roll<riskPermille)crackedQuantity++;
    }
    if(outcome.success&&crackedQuantity===quantity){outcome.success=false;outcome.degree='烧制裂损';}
    return{feature:plan.feature,stress,riskPermille,crackedQuantity};
}
export function workstation(d,engine,recipe,args){
    if(!recipe.workstation)return null;
    const location=d.get('state','location'),definition=engine.byId.get(location);
    const station=(facilityView(engine,d.get('state'),location)?.workstations??definition?.workstations)?.find(row=>row.kind===recipe.workstation);
    if(!station)throw preconditionFailure('当前位置没有所需工作台');
    if(facilityView(engine,d.get('state'),location)?.factor===0)throw preconditionFailure('工坊已损毁或停用');
    if(station.access!=='public'){
        const permission=d.get('state','records',args.authorization);
        if(!permission||permission.category!=='authorization'||permission.subject!==station.id||permission.action!=='workshop_use'||permission.expires!==undefined&&permission.expires<=d.get('state','minute'))throw preconditionFailure('工作台需要有效使用许可');
    }
    const fee=integer(station.fee??0,0,100000,'工坊使用费');
    if(d.get('state','player','coins')<fee)reject('E-ACTION-FUNDS','工坊使用费不足',{missing:['需要足额工坊使用费'],repair:['补足工坊使用费后重试']});
    if(station.owner?.startsWith('npc_')){
        const owner=d.get('state','npcs',station.owner);if(!owner||isPhysicallyDead(engine,d,station.owner)||owner.status==='濒死')throw preconditionFailure('工坊主人无法履约');
    }
    const workMinutes=Math.ceil(recipe.minutes/(facilityView(engine,d.get('state'),location)?.factor??1));
    const thermalPlan=prepareThermalWorkstation(d,engine,station,workMinutes);
    return{...station,fee,workMinutes,...(thermalPlan?{thermalPlan}:{})};
}
export function manufacture(d,args,eventId){
    if(args.maker!==undefined)return spiritManufacture.call(this,d,args,eventId,{workstation,kilnWorkResult});
    if(args.batches!==undefined){
        const requested=integer(args.batches,1,100000,'制造批数');
        const recipe=this.byId.get(this.resolve(args.recipe,'recipe'));
        // Preserve the native precondition order before quoting a workstation.
        if(recipe.learningRequired&&!d.get('state','recipes',recipe.id))throw preconditionFailure('尚未学会这个配方');
        if(!d.get('state','skills',recipe.skill))throw preconditionFailure('尚未掌握该配方所需技能');
        if(recipe.location&&recipe.location!==d.get('state','location'))throw preconditionFailure('不在所需工坊');
        if(effectiveProficiency(d,this,recipe.skill)<recipe.minimumProficiency)throw preconditionFailure('技能不足以使用这个配方');
        const materials=new Map();for(const row of recipe.materials)materials.set(row.item,(materials.get(row.item)??0)+row.amount);
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
            spent:{feePaid:results.reduce((n,row)=>n+row.spent.feePaid,0),minutes:results.reduce((n,row)=>n+row.spent.minutes,0),materials:[...materials].map(([item,quantity])=>({item,name:this.byId.get(item).name,quantity:quantity*batches})),toolWear:results.flatMap(row=>row.spent.toolWear)},
            factSummary:`实际制作${batches}批（申请${requested}批）；${results.filter(row=>row.success).length}批成功，成品与副产品按各批检定真实入账。`};
    }
    const recipe=this.byId.get(this.resolve(args.recipe,'recipe'));
    if(recipe.learningRequired&&!d.get('state','recipes',recipe.id))throw preconditionFailure('尚未学会这个配方');
    if(!d.get('state','skills',recipe.skill))throw preconditionFailure('尚未掌握该配方所需技能');
    if(recipe.location&&recipe.location!==d.get('state','location'))throw preconditionFailure('不在所需工坊');
    const proficiency=effectiveProficiency(d,this,recipe.skill);
    if(proficiency<recipe.minimumProficiency)throw preconditionFailure('技能不足以使用这个配方');
    const attribute=recipe.attribute??this.byId.get(recipe.skill).attribute??'智力',station=workstation(d,this,recipe,args),workMinutes=station?.workMinutes??recipe.minutes;
    // Check real required tools before spending material, rent or time.
    toolBonuses(d,this,recipe.tools??[],attribute,recipe.skill);
    const materials=new Map();for(const row of recipe.materials)materials.set(row.item,(materials.get(row.item)??0)+integer(row.amount,1,100000,'材料数量'));
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
    const inputCost=recipeInputCost(d,this,recipe);
    const outcome=this.check(d,{attribute,skill:recipe.skill,difficulty:recipe.difficulty,tools:recipe.tools??[],helpers:args.helpers??[]},eventId);
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
    if(outcome.success){
        workmanship=outcome.degree==='勉强成功'?'粗糙':outcome.degree==='大成功'?(proficiency>=2100?'杰作':proficiency>=1500?'优秀':'精良'):'普通';
        for(const row of products)if(row.amount)ids.push(...produceItems(d,this,row.item,row.amount,{eventId,recipe:recipe.id,workmanship,books:craftOutput('manufacturing',eventId)}));
        work=recordArtWork(d,this,{recipe,instances:ids.filter(unit=>d.get('state','itemInstances',unit,'item')===recipe.output.item),workmanship,eventId});
        this.practice(d,{skill:recipe.skill,gain:3,target:recipe.id},eventId);
        Object.assign(outcome,milestone(d,this,'craft',recipe.id,eventId));d.say(`制成${this.byId.get(recipe.output.item).name}，做工${workmanship}`);
    }else{
        for(const[item,amount]of materials){const returned=thermal?.crackedQuantity?0:Math.floor(amount*recover);if(returned){this.itemDelta(d,'player',item,returned,craftOutput('manufacturing',eventId));salvage.push({item,amount:returned});}}
        if(outcome.degree==='大失败'&&injury)this.health(d,{delta:-injury},eventId);
        d.say(`制造${outcome.degree}，耗时${workMinutes}分钟，按配方回收${salvage.reduce((sum,row)=>sum+row.amount,0)}份材料`);
    }
    const receipt={id:`crafted_${eventId}`,recipe:recipe.id,item:recipe.output.item,quantity:outcome.success?products[0].amount:0,...(thermal?{thermal}:{}),
        maker:'player',name:d.get('state','player','name'),minute:d.get('state','minute'),station:station?.id??null,fee:station?.fee??0,inputCost,
        degree:outcome.degree,workmanship,instances:ids,byproducts:outcome.success?recipe.byproducts??[]:[],salvage};
    d.set(['state','crafted',receipt.id],receipt);
    recordCraft(d,{recipe:recipe.id,batches:1,inputs:Object.fromEntries(materials),outputs:Object.fromEntries((outcome.success?products.filter(row=>row.amount):salvage).map(row=>[row.item,row.amount])),writer:'manufacturing',eventId});
    return{recipe:recipe.id,...outcome,...(cost?{cost}:{}),receipt:receipt.id,instances:ids,workmanship,...(work?{work}:{}),salvage,...(thermal?{thermal}:{}),
        spent:{feePaid:station?.fee??0,minutes:workMinutes,materials:[...materials].map(([item,quantity])=>({item,name:this.byId.get(item).name,quantity})),toolWear},
        healthDelta:d.get('state','player','hp')-hpBefore,produced:outcome.success?products.filter(row=>row.amount).map(row=>({...row,name:this.byId.get(row.item).name})):[],
        factSummary:`${outcome.success?`制成${this.byId.get(recipe.output.item).name}${products[0].amount}件`:'未得到任何成品'}；${salvage.length?`实际回收${salvage.map(row=>`${this.byId.get(row.item).name}${row.amount}份`).join('、')}`:'没有回收到任何可用材料'}；工坊费${station?.fee??0}铜已支付，耗时${workMinutes}分钟。`,
        note:'spent已实际支付及消耗，salvage是实际回收物，produced是实际成品。失败不退款；没有回收时只能描写弃置的废料，不能写回收到刨花或碎屑。'};
}
