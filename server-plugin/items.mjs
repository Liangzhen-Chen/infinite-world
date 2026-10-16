import {createHash}from'node:crypto';
import {bag,bookStock,moveStock,BOOKED} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('items');
const count=value=>{if(!Number.isSafeInteger(value)||value<0||value>100000)throw new Error('物品数量无效');return value;};
export function heldUnit(d,engine,owner,item){
    const held=d.get(...engine.bagPath(owner),item),units=typeof held==='object'?held.instances??[]:[];
    const valid=units.map(id=>d.get('state','itemInstances',id)).filter(row=>row&&row.owner===owner&&row.item===item&&row.status==='持有');
    const selected=valid.find(row=>row.durability>0)??(engine.quantity(d,owner,item)>units.length?null:valid[0]);
    return selected?{...held,...selected,instance:selected.id}:held;
}
export function wearItem(d,engine,owner,item,amount){
    const selected=heldUnit(d,engine,owner,item),definition=engine.byId.get(item);
    const durability=Math.max(0,(selected.durability??definition.durability)-amount);
    if(selected.instance)d.set(['state','itemInstances',selected.instance,'durability'],durability);
    if(!selected.instance||engine.quantity(d,owner,item)===1)d.set([...engine.bagPath(owner),item,'durability'],durability);
    return durability;
}
// S1b: books = 对方账户（stock.bookStock）；成对写入中已记过账的一边传 BOOKED。
export function changeItems(d,engine,owner,item,delta,{preserve=false,selection=null,books}={}){
    if(!Number.isSafeInteger(delta))throw new Error('物品数量变化无效');
    const current=engine.quantity(d,owner,item),amount=current+delta;
    if(amount<0)throw new Error(`${engine.byId.get(owner)?.name??'你'}缺少${engine.byId.get(item)?.name}`);
    const path=[...engine.bagPath(owner),item],existing=d.get(...path),definition=engine.byId.get(item);
    const units=typeof existing==='object'?existing.instances??[]:[];
    const removed=delta<0?(selection??units.slice(0,Math.min(-delta,units.length))):[];
    if(removed.length>Math.max(0,-delta)||new Set(removed).size!==removed.length||removed.some(unit=>!units.includes(unit)))throw new Error('单件选择与库存不符');
    for(const unit of removed){
        const record=d.get('state','itemInstances',unit);
        if(!record||record.owner!==owner||record.item!==item||record.status!=='持有')throw new Error('单件归属与库存不符');
        if(!preserve)d.set(['state','itemInstances',unit],{...record,owner:null,status:'已消耗',consumedAt:d.get('state','minute')});
    }
    if(!amount)d.remove(path);
    else{
        const next={...(typeof existing==='object'?existing:{quality:definition.quality,durability:definition.durability,weight:definition.weight}),quantity:amount};
        if(units.length)next.instances=units.filter(unit=>!removed.includes(unit));
        d.set(path,next);
    }
    bookStock(d,engine,bag(engine,owner,item),delta,books);
    return{instances:removed};
}
export function transferItems(d,engine,from,to,item,quantity,selection=null){
    count(quantity);if(!quantity)throw new Error('转移数量必须为正');
    if(from===to)throw new Error('物品转移双方不能相同');
    if(selection!==null&&!Array.isArray(selection))throw new Error('单件选择必须为编号列表');
    const held=d.get(...engine.bagPath(from),item),units=typeof held==='object'?held.instances??[]:[];
    if(selection&&selection.some(unit=>!units.includes(unit)))throw new Error('没有选中的单件');
    if(selection&&new Set(selection).size!==selection.length)throw new Error('单件编号重复');
    if(selection&&selection.length>quantity)throw new Error('单件数超过转移数量');
    const chosen=selection?[...selection,...units.filter(unit=>!selection.includes(unit)).slice(0,Math.max(0,quantity-selection.length))]:units.slice(0,quantity);
    const moved=changeItems(d,engine,from,item,-quantity,{preserve:true,selection:chosen,books:BOOKED});
    changeItems(d,engine,to,item,quantity,{books:BOOKED});
    moveStock(d,{from:bag(engine,from,item),to:bag(engine,to,item),amount:quantity,writer:'items'});
    if(moved.instances.length){
        const path=[...engine.bagPath(to),item,'instances'];
        d.set(path,[...d.get(...path)??[],...moved.instances]);
        for(const unit of moved.instances)d.set(['state','itemInstances',unit,'owner'],to);
    }
    return moved;
}
// S1b: books = 产出的来源（制造为 stock.craftOutput，作品誊抄等同）；缺省未入账。
export function produceItems(d,engine,item,quantity,{eventId,recipe,workmanship,owner='player',maker=owner,books}){
    count(quantity);if(quantity>200)throw new Error('单次制造产物超过处理上限，应拆分工序');
    const definition=engine.byId.get(item),ids=[];
    if(!definition)throw new Error('产物未登记');
    for(let index=0;index<quantity;index++){
        const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:${item}:${index}`).digest('hex').slice(0,24)}`;
        if(d.get('state','itemInstances',id))throw new Error('此次制造的单件编号已经存在，不能重复制造');
        ids.push(id);
        const factor=engine.rules.equipment.workmanship?.find(row=>row.name===workmanship)?.multiplier??1,maxDurability=Math.max(1,Math.round(definition.durability*factor));
        d.set(['state','itemInstances',id],{id,item,owner,status:'持有',maker,makerName:maker==='player'?d.get('state','player','name'):engine.byId.get(maker)?.name??maker,
            recipe,source:eventId,minute:d.get('state','minute'),quality:definition.quality,durability:maxDurability,maxDurability,workmanship});
    }
    engine.itemDelta(d,owner,item,quantity,books);
    const path=[...engine.bagPath(owner),item,'instances'];d.set(path,[...d.get(...path)??[],...ids]);
    return ids;
}

export function trackSingleItem(d,engine,owner,item,eventId){
    const held=d.get(...engine.bagPath(owner),item);
    if(engine.quantity(d,owner,item)!==1)throw new Error('需要单件物品才能确定受术对象');
    if(held.instances?.length){const unit=heldUnit(d,engine,owner,item);if(!unit.instance)throw new Error('单件登记缺失');return unit.instance;}
    const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:existing:${owner}:${item}`).digest('hex').slice(0,24)}`;
    if(d.get('state','itemInstances',id))throw new Error('既有物品的编号重复');
    const definition=engine.byId.get(item);
    d.set(['state','itemInstances',id],{id,item,owner,status:'持有',maker:null,makerName:null,source:eventId,
        origin:'既有物品登记，制作者未知',quality:held.quality??definition.quality,durability:held.durability??definition.durability,maxDurability:held.maxDurability??definition.durability});
    d.set([...engine.bagPath(owner),item,'instances'],[id]);return id;
}

// Register exactly one existing unit in a stack. This creates identity, never stock.
export function trackTransferUnit(d,engine,owner,item,eventId,requested=null){
    const quantity=engine.quantity(d,owner,item),held=d.get(...engine.bagPath(owner),item),units=held?.instances??[];
    if(quantity<1)throw new Error('没有可登记转移的库存');
    if(requested&&!units.includes(requested))throw new Error('所指定单件不属于目标库存');
    const selected=requested??units[0];
    if(selected){
        const record=d.get('state','itemInstances',selected);
        if(!record||record.owner!==owner||record.item!==item||record.status!=='持有')throw new Error('单件归属与库存不符');
        return selected;
    }
    if(units.length>=quantity)throw new Error('没有未登记的单件');
    const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:transfer:${owner}:${item}`).digest('hex').slice(0,24)}`;
    if(d.get('state','itemInstances',id))throw new Error('既有单件登记编号冲突');
    const definition=engine.byId.get(item),properties=typeof held==='object'?held:{quantity,quality:definition.quality,durability:definition.durability,weight:definition.weight};
    d.set(['state','itemInstances',id],{id,item,owner,status:'持有',maker:null,makerName:null,source:eventId,
        origin:'既有库存单件登记，制作者未知',quality:properties.quality??definition.quality,durability:properties.durability??definition.durability,maxDurability:properties.maxDurability??definition.durability});
    d.set([...engine.bagPath(owner),item],{...properties,quantity,instances:[...units,id]});return id;
}
