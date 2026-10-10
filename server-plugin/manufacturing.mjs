import {effectiveProficiency}from'./professions.mjs';
import {toolBonuses}from'./checks.mjs';
import {produceItems,wearItem,heldUnit}from'./items.mjs';
import {milestone}from'./progression.mjs';
import {prepareThermalWorkstation}from'./magic-object.mjs';
const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}无效`);return value;};
export function workstation(d,engine,recipe,args){
    if(!recipe.workstation)return null;
    const location=d.get('state','location'),definition=engine.byId.get(location);
    const station=definition?.workstations?.find(row=>row.kind===recipe.workstation);
    if(!station)throw new Error('当前位置没有所需工作台');
    if(d.get('state','buildings',location,'condition')===0)throw new Error('工坊已损毁');
    if(station.access!=='public'){
        const permission=d.get('state','records',args.authorization);
        if(!permission||permission.category!=='authorization'||permission.subject!==station.id||permission.action!=='workshop_use'||permission.expires!==undefined&&permission.expires<=d.get('state','minute'))throw new Error('工作台需要有效使用许可');
    }
    const fee=integer(station.fee??0,0,100000,'工坊使用费');
    if(d.get('state','player','coins')<fee)throw new Error('工坊使用费不足');
    if(station.owner?.startsWith('npc_')){
        const owner=d.get('state','npcs',station.owner);if(!owner||['死亡','濒死'].includes(owner.status))throw new Error('工坊主人无法履约');
    }
    const thermalPlan=prepareThermalWorkstation(d,engine,station,recipe.minutes);
    return{...station,fee,...(thermalPlan?{thermalPlan}:{})};
}
export function manufacture(d,args,eventId){
    const recipe=this.world.recipes.find(row=>row.id===args.recipe||row.name===args.recipe||row.aliases?.includes(args.recipe));
    if(!recipe)throw new Error('未登记这个配方');
    if(recipe.learningRequired&&!d.get('state','recipes',recipe.id))throw new Error('尚未学会这个配方');
    if(!d.get('state','skills',recipe.skill))throw new Error('尚未掌握该配方所需技能');
    if(recipe.location&&recipe.location!==d.get('state','location'))throw new Error('不在所需工坊');
    const proficiency=effectiveProficiency(d,this,recipe.skill);
    if(proficiency<recipe.minimumProficiency)throw new Error('技能不足以使用这个配方');
    const attribute=recipe.attribute??this.byId.get(recipe.skill).attribute??'智力',station=workstation(d,this,recipe,args);
    // Check real required tools before spending material, rent or time.
    toolBonuses(d,this,recipe.tools??[],attribute,recipe.skill);
    const materials=new Map();for(const row of recipe.materials)materials.set(row.item,(materials.get(row.item)??0)+integer(row.amount,1,100000,'材料数量'));
    for(const[item,amount]of materials)if(this.quantity(d,'player',item)<amount)throw new Error(`缺少${this.byId.get(item).name}`);
    if(recipe.tools?.some(item=>materials.has(item)))throw new Error('同一物品不能同时作为耗材与保留工具');
    const products=[{item:recipe.output.item,amount:recipe.output.quantity},...recipe.byproducts??[]];
    for(const row of products){integer(row.amount,1,200,'产物数量');if(!this.byId.has(row.item))throw new Error('产物未登记');}
    if(new Set(products.map(row=>row.item)).size!==products.length)throw new Error('主产物与副产品不能重复登记');
    const wear=integer(recipe.toolWear??1,0,10,'工具损耗');
    const failure=recipe.failure??{},recover=failure.recoverFraction??0;
    if(typeof recover!=='number'||recover<0||recover>1)throw new Error('失败回收率无效');
    const injury=integer(failure.injury??0,0,50,'失败伤害');
    const hpBefore=d.get('state','player','hp');
    const outcome=this.check(d,{attribute,skill:recipe.skill,difficulty:recipe.difficulty,tools:recipe.tools??[],helpers:args.helpers??[]},eventId);
    for(const[item,amount]of materials)this.itemDelta(d,'player',item,-amount);
    if(station?.fee){
        d.set(['state','player','coins'],d.get('state','player','coins')-station.fee);
        if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+station.fee);
        else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+station.fee);
    }
    this.advance(d,recipe.minutes,eventId);
    const toolWear=[];
    for(const item of recipe.tools??[]){const before=heldUnit(d,this,'player',item).durability??this.byId.get(item).durability;
        toolWear.push({item,name:this.byId.get(item).name,before,after:wearItem(d,this,'player',item,wear)});}
    const ids=[],salvage=[];
    let workmanship=null;
    if(outcome.success){
        workmanship=outcome.degree==='勉强成功'?'粗糙':outcome.degree==='大成功'?(proficiency>=2100?'杰作':proficiency>=1500?'优秀':'精良'):'普通';
        for(const row of products)ids.push(...produceItems(d,this,row.item,row.amount,{eventId,recipe:recipe.id,workmanship}));
        this.practice(d,{skill:recipe.skill,gain:3,target:recipe.id},eventId);
        Object.assign(outcome,milestone(d,this,'craft',recipe.id,eventId));d.say(`制成${this.byId.get(recipe.output.item).name}，做工${workmanship}`);
    }else{
        for(const[item,amount]of materials){const returned=Math.floor(amount*recover);if(returned){this.itemDelta(d,'player',item,returned);salvage.push({item,amount:returned});}}
        if(outcome.degree==='大失败'&&injury)this.health(d,{delta:-injury},eventId);
        d.say(`制造${outcome.degree}，耗时${recipe.minutes}分钟，按配方回收${salvage.reduce((sum,row)=>sum+row.amount,0)}份材料`);
    }
    const receipt={id:`crafted_${eventId}`,recipe:recipe.id,item:recipe.output.item,quantity:outcome.success?recipe.output.quantity:0,
        maker:'player',name:d.get('state','player','name'),minute:d.get('state','minute'),station:station?.id??null,fee:station?.fee??0,
        degree:outcome.degree,workmanship,instances:ids,byproducts:outcome.success?recipe.byproducts??[]:[],salvage};
    d.set(['state','crafted',receipt.id],receipt);
    return{recipe:recipe.id,...outcome,receipt:receipt.id,instances:ids,workmanship,salvage,
        spent:{feePaid:station?.fee??0,minutes:recipe.minutes,materials:[...materials].map(([item,quantity])=>({item,name:this.byId.get(item).name,quantity})),toolWear},
        healthDelta:d.get('state','player','hp')-hpBefore,produced:outcome.success?products.map(row=>({...row,name:this.byId.get(row.item).name})):[],
        factSummary:`${outcome.success?`制成${this.byId.get(recipe.output.item).name}${recipe.output.quantity}件`:'未得到任何成品'}；${salvage.length?`实际回收${salvage.map(row=>`${this.byId.get(row.item).name}${row.amount}份`).join('、')}`:'没有回收到任何可用材料'}；工坊费${station?.fee??0}铜已支付，耗时${recipe.minutes}分钟。`,
        note:'spent已实际支付及消耗，salvage是实际回收物，produced是实际成品。失败不退款；没有回收时只能描写弃置的废料，不能写回收到刨花或碎屑。'};
}
