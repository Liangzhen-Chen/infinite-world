import {effectiveProficiency}from'./professions.mjs';
import {toolBonuses}from'./checks.mjs';
import {heldUnit,wearItem,trackSingleItem}from'./items.mjs';
import {workstation}from'./manufacturing.mjs';

const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${label}无效`);return value;};

// Repair is an action on an existing unit. No inventory output or new maker is created.
export function repair(d,args,eventId){
    if(args.recipe!==undefined)throw new Error('维修不能同时提交制造配方');
    const registered=args.instance?d.get('state','itemInstances',args.instance):null;
    if(args.instance&&!registered)throw new Error('维修单件编号不存在；instance 只能取自所持物品的 instances 列表。若只有一件且没有单件编号，请省略 instance，仅传 item 物品名称或类型编号');
    const item=args.item?this.resolve(args.item,'item'):registered?.item;
    if(!item)throw new Error('维修需要物品或单件编号');
    if(registered&&registered.item!==item)throw new Error('维修物品与单件编号不一致');
    const quantity=this.quantity(d,'player',item),held=d.get(...this.bagPath('player'),item),definition=this.byId.get(item);
    if(quantity<1)throw new Error('没有持有这件维修物品');
    if(!args.instance&&quantity!==1)throw new Error('有多件同类物品，维修须明确单件编号');
    const instance=args.instance??held?.instances?.[0],unit=instance?d.get('state','itemInstances',instance):null;
    if(instance&&(!unit||unit.owner!=='player'||unit.item!==item||unit.status!=='持有'||!held?.instances?.includes(instance)))throw new Error('维修单件归属与库存不符');
    const plans=(this.rules.repairs??[]).filter(row=>row.item===item);
    const plan=args.repairPlan?plans.find(row=>row.id===args.repairPlan):plans.length===1?plans[0]:null;
    if(args.repairPlan&&!plan&&plans.length)throw new Error(`维修工序编号未识别；此物品已登记：${plans.map(row=>row.id).join('、')}。请使用已登记编号${plans.length===1?'，或省略repairPlan让唯一工序自动匹配':''}`);
    if(!plan)throw new Error(plans.length>1?'需要明确维修工序':'该物品没有可用维修工序');
    const before={durability:unit?.durability??held?.durability??definition.durability,
        maxDurability:unit?.maxDurability??held?.maxDurability??definition.durability};
    integer(before.maxDurability,1,100000,'单件耐久上限');integer(before.durability,0,before.maxDurability,'单件耐久');
    if(before.durability===0)throw new Error('物品已经折断或严重损坏，这种修整工序无法修复');
    const maxLoss=integer(plan.maxLoss,0,100,'维修上限损耗'),restore=integer(plan.restore,1,10000,'维修恢复量');
    const newMaximum=before.maxDurability-maxLoss;
    if(newMaximum<=before.durability)throw new Error('这次修整已没有可恢复的耐久空间');
    if(!d.get('state','skills',plan.skill))throw new Error('尚未掌握维修所需技能');
    if(effectiveProficiency(d,this,plan.skill)<plan.minimumProficiency)throw new Error('技能不足以使用这项维修工序');
    const attribute=plan.attribute??this.byId.get(plan.skill)?.attribute??'智力',station=workstation(d,this,plan,args);
    toolBonuses(d,this,plan.tools,attribute,plan.skill);
    if(plan.tools.includes(item))throw new Error('维修对象不能同时作为这项工序的工具');
    const materials=new Map();
    for(const row of plan.materials)materials.set(row.item,(materials.get(row.item)??0)+integer(row.amount,1,100000,'维修材料数量'));
    if(materials.has(item)||plan.tools.some(tool=>materials.has(tool)))throw new Error('维修耗材不能同时是对象或工具');
    for(const[material,amount]of materials)if(this.quantity(d,'player',material)<amount)throw new Error(`缺少${this.byId.get(material)?.name??material}`);
    const minutes=integer(plan.minutes,1,43200,'维修耗时'),wear=integer(plan.toolWear,0,10,'维修工具损耗');
    const outcome=this.check(d,{attribute,skill:plan.skill,difficulty:plan.difficulty,tools:plan.tools,helpers:args.helpers??[]},eventId);
    const target=instance??trackSingleItem(d,this,'player',item,eventId);
    for(const[material,amount]of materials)this.itemDelta(d,'player',material,-amount);
    if(station?.fee){
        d.set(['state','player','coins'],d.get('state','player','coins')-station.fee);
        if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+station.fee);
        else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+station.fee);
    }
    const toolWear=plan.tools.map(tool=>{
        const current=heldUnit(d,this,'player',tool).durability??this.byId.get(tool).durability;
        return{item:tool,name:this.byId.get(tool).name,before:current,after:wearItem(d,this,'player',tool,wear)};
    });
    this.advance(d,minutes,eventId);
    // Due deliveries can transfer the target during the elapsed work. Do not recreate a removed bag entry.
    const latest=d.get('state','itemInstances',target),stillHeld=latest?.owner==='player'&&latest.status==='持有'&&
        d.get(...this.bagPath('player'),item)?.instances?.includes(target);
    const completed=outcome.success&&Boolean(stillHeld),completionFailure=stillHeld?null:'维修完成前物品已经交付或离开行囊';
    const after=completed?{durability:Math.min(newMaximum,before.durability+restore),maxDurability:newMaximum}:before;
    if(completed){
        d.set(['state','itemInstances',target,'durability'],after.durability);
        d.set(['state','itemInstances',target,'maxDurability'],after.maxDurability);
        if(quantity===1){d.set([...this.bagPath('player'),item,'durability'],after.durability);d.set([...this.bagPath('player'),item,'maxDurability'],after.maxDurability);}
        this.practice(d,{skill:plan.skill,gain:2,target:`${plan.id}:${target}`},eventId);
    }
    const receipt=`repaired_${eventId}`,fee=station?.fee??0;
    const provenance={maker:latest?.maker??null,makerName:latest?.makerName??null,recipe:latest?.recipe??null,source:latest?.source??null};
    const makerText=provenance.maker?`原制作者${provenance.makerName??this.byId.get(provenance.maker)?.name??provenance.maker}`:'原制作者未知';
    d.set(['state','records',receipt],{id:receipt,category:'repair',instance:target,item,plan:plan.id,mechanic:'player',
        minute:d.get('state','minute'),degree:outcome.degree,checkSuccess:outcome.success,success:completed,completionFailure,station:station?.id??null,fee,minutes,before,after,provenance});
    const resultText=completionFailure?`未完成，${completionFailure}`:outcome.degree;
    d.say(`修整${resultText}，${definition.name}耐久${before.durability}→${after.durability}，上限${before.maxDurability}→${after.maxDurability}`);
    return{operation:'repair',item,instance:target,plan:plan.id,receipt,...outcome,checkSuccess:outcome.success,success:completed,completionFailure,before,after,provenance,restored:after.durability-before.durability,
        spent:{feePaid:fee,minutes,materials:[...materials].map(([id,quantity])=>({item:id,name:this.byId.get(id).name,quantity})),toolWear},
        factSummary:`${definition.name}修整${resultText}；耐久${before.durability}变为${after.durability}，上限${before.maxDurability}变为${after.maxDurability}；工坊费${fee}铜已支付，耗时${minutes}分钟；${makerText}，你仅负责这次维修，保留原物品和编号，没有制造新物品。`};
}
