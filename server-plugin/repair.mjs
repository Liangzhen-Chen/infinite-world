import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {purse,workshopFund,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('repair',{sinks:['sink:consume']});
import {effectiveProficiency}from'./professions.mjs';
import {toolBonuses}from'./checks.mjs';
import {heldUnit,wearItem,trackSingleItem}from'./items.mjs';
import {workstation}from'./manufacturing.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {facilityView} from './facility-state.mjs';
declareHoldingWriter('repair',{kinds:[],locations:true});

const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}无效`);return value;};

// Repair is an action on an existing unit. No inventory output or new maker is created.
export function repair(d,args,eventId){
    if(args.recipe!==undefined)throw preconditionFailure('维修不能同时提交制造配方');
    const registered=args.instance?d.get('state','itemInstances',args.instance):null;
    if(args.instance&&!registered)throw preconditionFailure('维修单件编号不存在；instance 只能取自所持物品的 instances 列表。若只有一件且没有单件编号，请省略 instance，仅传 item 物品名称或类型编号');
    const item=args.item?this.resolve(args.item,'item'):registered?.item;
    if(!item)throw preconditionFailure('维修需要物品或单件编号');
    if(registered&&registered.item!==item)throw preconditionFailure('维修物品与单件编号不一致');
    const quantity=this.quantity(d,'player',item),held=d.get(...this.bagPath('player'),item),definition=this.byId.get(item);
    if(quantity<1)throw preconditionFailure('没有持有这件维修物品');
    if(!args.instance&&quantity!==1)throw preconditionFailure('有多件同类物品，维修须明确单件编号');
    const instance=args.instance??held?.instances?.[0],unit=instance?d.get('state','itemInstances',instance):null;
    if(instance&&(!unit||unit.owner!=='player'||unit.item!==item||unit.status!=='持有'||!held?.instances?.includes(instance)))throw preconditionFailure('维修单件归属与库存不符');
    const plans=(this.rules.repairs??[]).filter(row=>row.item===item);
    const plan=args.repairPlan?plans.find(row=>row.id===args.repairPlan):plans.length===1?plans[0]:null;
    if(args.repairPlan&&!plan&&plans.length)throw preconditionFailure(`维修工序编号未识别；此物品已登记：${plans.map(row=>row.id).join('、')}。请使用已登记编号${plans.length===1?'，或省略repairPlan让唯一工序自动匹配':''}`);
    if(!plan)reject('E-ACTION-REPAIR-PROCESS',plans.length>1?'需要明确维修工序':'该物品没有可用维修工序',{missing:['需要适用于该物品的维修工序'],repair:['选择已登记维修工序的物品']});
    if(args.quote&&!plan.service)throw preconditionFailure('此工序没有修理服务报价');
    const before={durability:unit?.durability??held?.durability??definition.durability,
        maxDurability:unit?.maxDurability??held?.maxDurability??definition.durability};
    integer(before.maxDurability,1,100000,'单件耐久上限');integer(before.durability,0,before.maxDurability,'单件耐久');
    if(before.durability===0)throw preconditionFailure('物品已经折断或严重损坏，这种修整工序无法修复');
    const maxLoss=integer(plan.maxLoss,0,100,'维修上限损耗'),restore=integer(plan.restore,1,10000,'维修恢复量');
    const newMaximum=before.maxDurability-maxLoss;
    if(newMaximum<=before.durability)reject('E-ACTION-DURABILITY','这次修整已没有可恢复的耐久空间',{missing:['物品需要存在可恢复的耐久损耗'],repair:['选择有可恢复耐久损耗的物品']});
    if(plan.service){
        const maker=this.resolve(args.maker,'npc'),spec=plan.service;
        const facility=facilityView(this,d.get('state'),d.get('state','location'));
        const station=(facility?.workstations??this.byId.get(d.get('state','location'))?.workstations)?.find(s=>s.kind===plan.workstation&&(s.owner===maker||s.access==='public'));
        if(!station||facility?.factor===0)throw preconditionFailure('修理者没有此处可用的登记工坊');
        if(knowledgeProficiency(this,d.get('state'),maker,plan.skill)<plan.minimumProficiency)throw preconditionFailure('修理者没有所需技艺');
        this.assertNpcService(d,maker,'trade',args.quote?0:plan.minutes);
        const restored=Math.min(newMaximum,before.durability+restore);
        const quote={item,instance:instance??null,maker,fee:spec.fee,minutes:plan.minutes,before,after:{durability:restored,maxDurability:newMaximum}};
        if(args.quote)return{quote};
        if(d.get('state','player','coins')<spec.fee)throw preconditionFailure('修理费不足');
        const target=instance??trackSingleItem(d,this,'player',item,eventId);
        moveCoins(d,{from:purse(null,'player'),to:purse(null,maker),amount:spec.fee,writer:'repair',eventId});
        d.set(['state','player','coins'],d.get('state','player','coins')-spec.fee);d.set(['state','npcs',maker,'coins'],d.get('state','npcs',maker,'coins')+spec.fee);
        this.advance(d,plan.minutes,eventId);
        if(isPhysicallyDead(this,d,maker)||d.get('state','npcs',maker,'location')!==d.get('state','location'))throw preconditionFailure('维修完成前服务者已无法履行');
        const latest=d.get('state','itemInstances',target);
        if(latest?.owner!=='player'||latest.status!=='持有'||!d.get(...this.bagPath('player'),item)?.instances?.includes(target))throw preconditionFailure('维修完成前物品已经离开行囊');
        holdingSet(d,null,['state','itemInstances',target,'durability'],restored,'repair');holdingSet(d,null,['state','itemInstances',target,'maxDurability'],newMaximum,'repair');
        if(quantity===1){d.set([...this.bagPath('player'),item,'durability'],restored);d.set([...this.bagPath('player'),item,'maxDurability'],newMaximum);}
        const result={operation:'repair',success:true,item,instance:target,maker,quote,before,after:quote.after,spent:{feePaid:spec.fee,minutes:plan.minutes,materials:[],toolWear:[]}};
        d.set(['state','records',`repaired_${eventId}`],{category:'repair',...result,minute:d.get('state','minute')});return result;
    }
    if(!d.get('state','skills',plan.skill))throw preconditionFailure('尚未掌握维修所需技能');
    if(effectiveProficiency(d,this,plan.skill)<plan.minimumProficiency)throw preconditionFailure('技能不足以使用这项维修工序');
    const attribute=plan.attribute??this.byId.get(plan.skill)?.attribute??'智力',station=workstation(d,this,plan,args);
    toolBonuses(d,this,plan.tools,attribute,plan.skill);
    if(plan.tools.includes(item))throw preconditionFailure('维修对象不能同时作为这项工序的工具');
    const materials=new Map();
    for(const row of plan.materials)materials.set(row.item,(materials.get(row.item)??0)+integer(row.amount,1,100000,'维修材料数量'));
    if(materials.has(item)||plan.tools.some(tool=>materials.has(tool)))throw preconditionFailure('维修耗材不能同时是对象或工具');
    for(const[material,amount]of materials)if(this.quantity(d,'player',material)<amount)throw preconditionFailure(`缺少${this.byId.get(material)?.name??material}`);
    const minutes=integer(plan.minutes,1,43200,'维修耗时'),wear=integer(plan.toolWear,0,10,'维修工具损耗');
    const outcome=this.check(d,{attribute,skill:plan.skill,difficulty:plan.difficulty,tools:plan.tools,helpers:args.helpers??[]},eventId);
    const target=instance??trackSingleItem(d,this,'player',item,eventId);
    for(const[material,amount]of materials)this.itemDelta(d,'player',material,-amount,{flow:'sink:consume',purpose:'repair',writer:'repair',eventId});
    if(station?.fee){
        moveCoins(d,{from:purse(null,'player'),to:station.owner?.startsWith('npc_')?purse(null,station.owner):workshopFund(station.id),amount:station.fee,writer:'repair',eventId:eventId});
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
        holdingSet(d,null,['state','itemInstances',target,'durability'],after.durability,'repair');
        holdingSet(d,null,['state','itemInstances',target,'maxDurability'],after.maxDurability,'repair');
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
