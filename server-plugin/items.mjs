import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {createHash}from'node:crypto';
import {bag,bookStock,moveStock,BOOKED,registerLegacyStock,placed} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {declareHoldingWriter,holdingSet,updateEntity,locationOf,setLocation,clearLocation,templatesOf,aliveHoldings,runHoldingProtocol} from './holdings.mjs';
import {authority} from './action-authority.mjs';
import {accountKey} from './ledger.mjs';
import {partyAccount} from './money.mjs';
import {handRepairRefused,liquidItem,liquidPortionMl,vocabulary} from './domain-rules.mjs';
import {transferWaterState} from './water-volume.mjs';
declareHoldingWriter('items',{kinds:[],entities:['item','building'],locations:true});
// Harvested portions are minted only from an already conserved physical water
// transfer. The feature volume and liquid_binding remain their authority.
declareLedgerWriter('items',{sources:{'src:harvest':{item_water:Infinity}},sinks:['sink:consume']});
const count=value=>{if(!Number.isSafeInteger(value)||value<0||value>100000)throw preconditionFailure('物品数量无效');return value;};
export function heldUnit(d,engine,owner,item){
    const held=d.get(...engine.bagPath(owner),item),units=typeof held==='object'?held.instances??[]:[];
    const valid=units.map(id=>d.get('state','itemInstances',id)).filter(row=>row&&row.owner===owner&&row.item===item&&row.status==='持有');
    const selected=valid.find(row=>row.durability>0)??(engine.quantity(d,owner,item)>units.length?null:valid[0]);
    return selected?{...held,...selected,instance:selected.id}:held;
}
export function wearItem(d,engine,owner,item,amount){
    const selected=heldUnit(d,engine,owner,item),definition=engine.byId.get(item);
    const durability=Math.max(0,(selected.durability??definition.durability)-amount);
    if(selected.instance)holdingSet(d,null,['state','itemInstances',selected.instance,'durability'],durability,'items');
    if(!selected.instance||engine.quantity(d,owner,item)===1)d.set([...engine.bagPath(owner),item,'durability'],durability);
    return durability;
}
// Stable choice: catalogue ID order, then heldUnit's first intact owned unit.
// Explicit stored tags override the catalogue, including an empty tag list.
// Untagged legacy items have unknown uses; names and IDs never supply abilities.
export function useTool(d,engine,requiresUse,selected=undefined){
 if(typeof requiresUse!=='string'||!requiresUse)throw Error('Missing tool use requirement');
 let unknown=false;
 const specified=selected!==undefined;
 const candidates=specified?[selected]:Object.keys(d.get(...engine.bagPath('player'))??{}).sort();
 for(const item of candidates){
  if(typeof item!=='string'||!item)continue;
  if(engine.quantity(d,'player',item)<1)continue;
  const held=heldUnit(d,engine,'player',item),facts=physicalItem(d,engine,held?.instance??item);
  if(held?.instances?.length&&!held.instance&&held.instances.length>=engine.quantity(d,'player',item))continue;
  const tags=held?.tags??facts.tags;
  if(!Array.isArray(tags)){unknown=true;continue;}
  if(tags.includes(requiresUse)&&(held?.durability??facts.durability??0)>0&&(held?.condition??facts.condition)!==0)return item;
 }
 reject('E-ACTION-TOOL',`${specified?'指定工具未实际持有、用途不符或已经损坏；':''}需要完好且具备 ${requiresUse} 用途的工具${unknown?'；部分旧物品用途未知':''}`,{
  missing:[`实际持有、耐久大于零且标有 ${requiresUse} 的工具`],
  repair:[`取得具备 ${requiresUse} 用途的完好工具后再试`],
 });
}
// S1b: books = 对方账户（stock.bookStock）；成对写入中已记过账的一边传 BOOKED。
export function changeItems(d,engine,owner,item,delta,{preserve=false,selection=null,books}={}){
    if(!Number.isSafeInteger(delta))throw preconditionFailure('物品数量变化无效');
    const current=engine.quantity(d,owner,item),amount=current+delta;
    if(amount<0)throw preconditionFailure(`${engine.byId.get(owner)?.name??'你'}缺少${engine.byId.get(item)?.name}`);
    const path=[...engine.bagPath(owner),item],existing=d.get(...path),definition=engine.byId.get(item);
    const units=typeof existing==='object'?existing.instances??[]:[];
    const removed=delta<0?(selection??units.slice(0,Math.min(-delta,units.length))):[];
    if(removed.length>Math.max(0,-delta)||new Set(removed).size!==removed.length||removed.some(unit=>!units.includes(unit)))throw preconditionFailure('单件选择与库存不符');
    // The safety check reads the units actually being consumed, not whichever instance is listed first.
    if(delta<0&&['meal','drink','eat'].includes(books?.purpose))assertEdibleItem(d,engine,owner,item,removed);
    for(const unit of removed){
        const record=d.get('state','itemInstances',unit);
        if(!record||record.owner!==owner||record.item!==item||record.status!=='持有')throw preconditionFailure('单件归属与库存不符');
        if(!preserve){
            holdingSet(d,null,['state','itemInstances',unit],{...record,owner:null,status:'已消耗',consumedAt:d.get('state','minute')},'items');
            clearLocation(d,{entity:unit,writer:'items'});
        }
        if(d.get('state','records',`worn:${owner}`)?.slots)clearWornItem(d,owner,unit);
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
export function validateItemTransfer(d,engine,from,to,item,quantity,selection=null){
    count(quantity);if(!quantity)throw preconditionFailure('转移数量必须为正');
    if(from===to)throw preconditionFailure('物品转移双方不能相同');
    if(selection!==null&&!Array.isArray(selection))throw preconditionFailure('单件选择必须为编号列表');
    const held=d.get(...engine.bagPath(from),item),units=typeof held==='object'?held.instances??[]:[];
    if(selection&&selection.some(unit=>!units.includes(unit)))throw preconditionFailure('没有选中的单件');
    if(selection&&new Set(selection).size!==selection.length)throw preconditionFailure('单件编号重复');
    if(selection&&selection.length>quantity)throw preconditionFailure('单件数超过转移数量');
    return units;
}
export function transferItems(d,engine,from,to,item,quantity,selection=null,{disposition=false,documentSource=false,eventId=null,authorityContext=null}={}){
    // Give a single purchased object an identity before it changes hands.
    // Its receipt can then describe that original, rather than a catalogue row.
    if(documentSource&&quantity===1&&!selection?.length)trackTransferUnit(d,engine,from,item,eventId);
    const units=validateItemTransfer(d,engine,from,to,item,quantity,selection);
    const chosen=selection?[...selection,...units.filter(unit=>!selection.includes(unit)).slice(0,Math.max(0,quantity-selection.length))]:units.slice(0,quantity);
    // Possession and title are distinct. Only a native sale opts into disposal;
    // gifts, loans and delivery keep the ordinary physical-transfer semantics.
    const dispositions=disposition?chosen.flatMap(unit=>aliveHoldings(d,{kind:'owns',subject:unit}).map(row=>{
        if(!eventId)throw Error('Sale disposition requires its native event');
        const permission=authority({...authorityContext,engine,document:d.document},from,'holding.transfer',unit,{holding:row,kind:'owns',disposition:true});
        if(!permission.allowed)reject('E-ACTION-AUTHORITY',permission.reason,{missing:['物品处置权限'],repair:['取得所有者有效授权后再交易']});
        return {holding:row.id,subject:unit,from:row.holder,to,tags:permission.tags??[],actedAs:permission.actedAs??null};
    })):[];
    const moved=changeItems(d,engine,from,item,-quantity,{preserve:true,selection:chosen,books:BOOKED});
    changeItems(d,engine,to,item,quantity,{books:BOOKED});
    moveStock(d,{from:bag(engine,from,item),to:bag(engine,to,item),amount:quantity,writer:'items'});
    if(moved.instances.length){
        const path=[...engine.bagPath(to),item,'instances'];
        d.set(path,[...d.get(...path)??[],...moved.instances]);
        for(const unit of moved.instances){
            holdingSet(d,null,['state','itemInstances',unit,'owner'],to,'items');
            const context=engine.world?engine:d.engine;
            if(templatesOf(d,to,context)?.includes('agent'))setLocation(d,{entity:unit,at:to,mode:'carried',writer:'items',engine:context});
            else clearLocation(d,{entity:unit,writer:'items'});
        }
    }
    for(const row of dispositions){
        const cause=`${eventId}:ownership:${row.holding}`;
        row.newHolding=runHoldingProtocol(d,engine,{op:'transfer',id:row.holding,holder:to,reason:'transferred',eventId:cause});
        if(!row.newHolding)throw Error('Sale ownership protocol is not installed');
        const key=`world_event:${cause}`,event=d.get('state','records',key);
        if(event){
            const annotated={...event,actor:from,parent:eventId,tags:[...new Set([...event.tags??[],...row.tags])],...(row.actedAs?{actedAs:row.actedAs}:{})};
            holdingSet(d,engine,['state','records',key],annotated,'items',eventId);
            for(const pending of d.reactionTick?.queue??[])pending.events=pending.events.map(e=>e.id===cause?annotated:e);
        }
    }
    if(disposition)moved.dispositions=dispositions;
    if(documentSource){

        holdingSet(d,engine,['state','records',`item_sale:${eventId}`],{category:'item_sale',sourceEvent:eventId,buyer:to,seller:from,item,quantity,instances:[...moved.instances]},'items');
    }
    return moved;
}
// S1b: books = 产出的来源（制造为 stock.craftOutput，作品誊抄等同）；缺省未入账。
export function produceItems(d,engine,item,quantity,{eventId,recipe,workmanship,owner='player',maker=owner,books,producedAt=d.get('state','minute')}){
    if(!Number.isSafeInteger(producedAt)||producedAt<0||producedAt>d.get('state','minute'))throw preconditionFailure('产出日期无效');
    count(quantity);if(quantity>200)throw preconditionFailure('单次制造产物超过处理上限，应拆分工序');
    const definition=engine.byId.get(item),ids=[];
    if(!definition)throw preconditionFailure('产物未登记');
    for(let index=0;index<quantity;index++){
        const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:${item}:${index}`).digest('hex').slice(0,24)}`;
        if(d.get('state','itemInstances',id))throw preconditionFailure('此次制造的单件编号已经存在，不能重复制造');
        ids.push(id);
        const factor=engine.rules.equipment.workmanship?.find(row=>row.name===workmanship)?.multiplier??1,maxDurability=Math.max(1,Math.round(definition.durability*factor));
        holdingSet(d,null,['state','itemInstances',id],{id,item,owner,status:'持有',maker,makerName:maker==='player'?d.get('state','player','name'):engine.byId.get(maker)?.name??maker,
            ...(recipe===undefined?{}:{recipe}),source:eventId,minute:producedAt,quality:definition.quality,durability:maxDurability,maxDurability,...(workmanship===undefined?{}:{workmanship})},'items');
    }
    engine.itemDelta(d,owner,item,quantity,books);
    const path=[...engine.bagPath(owner),item,'instances'];d.set(path,[...d.get(...path)??[],...ids]);
    return ids;
}

export function trackSingleItem(d,engine,owner,item,eventId){
    const held=d.get(...engine.bagPath(owner),item);
    if(engine.quantity(d,owner,item)!==1)throw preconditionFailure('需要单件物品才能确定受术对象');
    if(held.instances?.length){const unit=heldUnit(d,engine,owner,item);if(!unit.instance)throw Error('单件登记缺失');return unit.instance;}
    const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:existing:${owner}:${item}`).digest('hex').slice(0,24)}`;
    if(d.get('state','itemInstances',id))throw Error('既有物品的编号重复');
    const definition=engine.byId.get(item);
    holdingSet(d,null,['state','itemInstances',id],{id,item,owner,status:'持有',maker:null,makerName:null,source:eventId,
        origin:'既有物品登记，制作者未知',quality:held.quality??definition.quality,durability:held.durability??definition.durability,maxDurability:held.maxDurability??definition.durability},'items');
    d.set([...engine.bagPath(owner),item,'instances'],[id]);return id;
}

// Register exactly one existing unit in a stack. This creates identity, never stock.
export function trackTransferUnit(d,engine,owner,item,eventId,requested=null,{untracked=false}={}){
    const quantity=engine.quantity(d,owner,item),held=d.get(...engine.bagPath(owner),item),units=held?.instances??[];
    if(quantity<1)throw preconditionFailure('没有可登记转移的库存');
    if(requested&&!units.includes(requested))throw preconditionFailure('所指定单件不属于目标库存');
    const selected=requested??(untracked?null:units[0]);
    if(selected){
        const record=d.get('state','itemInstances',selected);
        if(!record||record.owner!==owner||record.item!==item||record.status!=='持有')throw preconditionFailure('单件归属与库存不符');
        return selected;
    }
    if(units.length>=quantity)throw preconditionFailure('没有未登记的单件');
    const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:transfer:${owner}:${item}`).digest('hex').slice(0,24)}`;
    if(d.get('state','itemInstances',id))throw Error('既有单件登记编号冲突');
    const definition=engine.byId.get(item),properties=typeof held==='object'?held:{quantity,quality:definition.quality,durability:definition.durability,weight:definition.weight};
    holdingSet(d,null,['state','itemInstances',id],{id,item,owner,status:'持有',maker:null,makerName:null,source:eventId,
        origin:'既有库存单件登记，制作者未知',quality:properties.quality??definition.quality,durability:properties.durability??definition.durability,maxDurability:properties.maxDurability??definition.durability},'items');
    d.set([...engine.bagPath(owner),item],{...properties,quantity,instances:[...units,id]});return id;
}

// Native initial/current physical facts. These do not grant title, skill or a
// successful action. Runtime callers must pass the ordinary authority checks.
const physicalKey=id=>`physical_item:${id}`;
const booleanFacts=new Set(['contaminated','wearable','attachedLaces','toxic','medicinalEffect','armed','identified','locked','reachable']);
const textFacts=new Set(['appearance','material','scale','mechanism','physicalKind','access']);
const token=v=>typeof v==='string'&&/^[a-zA-Z0-9_:-]+$/.test(v)&&v.length<=120;
export function physicalItem(d,engine,id){
 const unit=d.get('state','itemInstances',id),entity=d.get('holdings','entities',id),base=engine.byId.get(unit?.item??id);
 const stored=d.get('state','records',physicalKey(id));
 const facts={...base,...entity?.facts,...unit,...stored?.facts,...(stored?.aliases?{aliases:stored.aliases}:{}),...(stored?.name?{name:stored.name}:{})};
 if(unit?.maxDurability>0)facts.condition=100*unit.durability/unit.maxDurability;
 const held=unit?.owner&&unit.item?d.get(...engine.bagPath(unit.owner),unit.item):null;
 if(held?.quantity===1&&held.moisture!==undefined)facts.moisture=held.moisture;
 if(unit?.liquid){
  facts.contaminated=facts.contaminated===true||unit.liquid.toxinUg>0||unit.liquid.pathogenRisk>0||unit.liquid.turbidity>0;
  facts.toxic=facts.toxic===true||unit.liquid.toxinUg>0;
 }
 return facts;
}
export function writePhysicalItem(d,engine,id,facts,{source=null,eventId=null,alias=null,name=null}={}){
 if(!d.get('state','itemInstances',id)&&!d.get('holdings','entities',id)&&!engine.byId.has(id))throw Error('Unknown physical item');
 if(!facts||typeof facts!=='object'||Array.isArray(facts))throw Error('Invalid physical facts');
 for(const [field,value] of Object.entries(facts)){
  if(booleanFacts.has(field)){if(typeof value!=='boolean')throw Error(`Invalid ${field}`);}
  else if(textFacts.has(field)){if(!token(value))throw Error(`Invalid ${field}`);}
  else if(field==='materialTraits'){if(!Array.isArray(value)||value.length>16||value.some(v=>!token(v)))throw Error('Invalid material traits');}
  else if(field==='damage'){
   if(!value||typeof value!=='object'||Array.isArray(value)||!vocabulary(engine,'damageKinds')?.includes(value.kind)||Object.keys(value).some(k=>!['kind','part'].includes(k))||value.part!==undefined&&!token(value.part))throw Error('Invalid damage');
  }else if(['condition','moisture'].includes(field)){if(!Number.isFinite(value)||value<0||value>100)throw Error(`Invalid ${field}`);}
  else if(field==='fireIntensity'){if(!Number.isSafeInteger(value)||value<0||value>100)throw Error('Invalid fire intensity');}
  else throw Error(`Unknown physical fact ${field}`);
 }
 if(source){
  const event=d.get('state','records',source),subject=event?.payload?.subject??event?.target;
  if(event?.category!=='world_event'||event.minute>d.get('state','minute')||![id,alias,...d.get('state','records',physicalKey(id))?.aliases??[]].includes(subject))throw Error('Unknown or mismatched physical source event');
  if(facts.fireIntensity!==undefined&&(event.verb!=='ignited'||event.payload?.fireIntensity!==facts.fireIntensity))throw Error('Ignition source does not establish this fire state');
 }
 if(alias!==null&&!token(alias)||name!==null&&(typeof name!=='string'||!name.trim()||name.length>120))throw Error('Invalid physical identity alias');
 const old=d.get('state','records',physicalKey(id));
 holdingSet(d,engine,['state','records',physicalKey(id)],{...old,category:'physical_item',id,facts:{...old?.facts,...structuredClone(facts)},...(alias?{aliases:[...new Set([...old?.aliases??[],alias])]}:{}),...(name?{name}:{}),...(source?{source}:{}),...(eventId?{eventId}:{})},'items');
 const entity=d.get('holdings','entities',id);
 if(entity&&['item','building'].includes(entity.kind))updateEntity(d,{id,facts,writer:'items',eventId});
 return id;
}
export function assertEdibleItem(d,engine,actor,item,units=null){
 const chosen=units?.length?units:[d.get(...engine.bagPath(actor),item)?.instances?.[0]??item];
 let facts;
 for(const unit of chosen){
  facts=physicalItem(d,engine,unit);
  if(facts.contaminated===true||facts.toxic===true||facts.condition===0)reject('E-ACTION-FOOD','食物或饮料受到污染、有毒或腐坏',{missing:['安全可食用的食物或饮料'],repair:['换用安全食物；可处理的污染请先净化并确认安全']});
 }
 return facts;
}
function clearWornItem(d,actor,id){
 const key=`worn:${actor}`,row=d.get('state','records',key);if(!row)return;
 const slots=Object.fromEntries(Object.entries(row.slots).filter(([,unit])=>unit!==id));
 if(Object.keys(slots).length!==Object.keys(row.slots).length)d.set(['state','records',key],{...row,slots});
}
export function wornItems(d,engine,actor){
 const slots=d.get('state','records',`worn:${actor}`)?.slots??{};
 return Object.fromEntries(Object.entries(slots).filter(([,id])=>{
  const p=locationOf(d,id),unit=d.get('state','itemInstances',id);
  return p?.mode==='carried'&&p.at===actor&&(!unit||unit.owner===actor&&unit.status==='持有')&&physicalItem(d,engine,id).wearable!==false;
 }));
}
export function equipPhysicalItem(d,engine,actor,id,{slot='body',remove=false,eventId=null}={}){
 if(!['body','head','feet','hands','waist','back'].includes(slot))reject('E-ACTION-WEAR','没有这样的穿戴部位',{missing:['可穿戴部位'],repair:['选择身体、头、脚、手、腰或背部']});
 const p=locationOf(d,id),facts=physicalItem(d,engine,id),unit=d.get('state','itemInstances',id);
 if(p?.at!==actor||p.mode!=='carried'||unit&&(unit.owner!==actor||unit.status!=='持有'))reject('E-ACTION-WEAR','只能穿戴自己携带的物品',{missing:['实际携带的物品'],repair:['先取得并携带该物品']});
 if(!remove&&(facts.wearable===false||facts.wearable!==true&&!facts.tags?.some(t=>['clothing','armor','footwear'].includes(t))||facts.condition===0||facts.durability===0))reject('E-ACTION-WEAR','这件物品不具备可用的穿戴结构',{missing:['完好可穿戴的物品'],repair:['修好物品或换用衣物、护甲、鞋履']});
 const slots=wornItems(d,engine,actor);
 if(!remove&&slots[slot]&&slots[slot]!==id)reject('E-ACTION-WEAR','该部位已经穿戴了其他物品',{missing:['空出的穿戴部位'],repair:['先卸下该部位原有物品']});
 clearWornItem(d,actor,id);
 const next={...d.get('state','records',`worn:${actor}`)?.slots};
 if(!remove)next[slot]=id;
 holdingSet(d,engine,['state','records',`worn:${actor}`],{category:'worn',actor,slots:next,...(eventId?{eventId}:{})},'items');
 return wornItems(d,engine,actor);
}
export function bindPurse(d,engine,id,actor){
 const p=locationOf(d,id);
 if(!p||p.mode!=='carried'||p.at!==actor||actor!=='player'&&!d.get('state','npcs',actor)&&!d.get('state','creatures',actor))throw Error('Purse must bind its actual carrier account');
 const key=partyAccount(engine,d.document.state,actor);
 holdingSet(d,engine,['state','records',`purse:${id}`],{category:'physical_purse',id,actor,account:key},'items');return key;
}
export function purseAccount(d,engine,id){
 const row=d.get('state','records',`purse:${id}`),p=locationOf(d,id);
 if(!row||p?.mode!=='carried'||p.at!==row.actor||row.account!==partyAccount(engine,d.document.state,row.actor))throw Error('Stale or forged purse account binding');
 return row.account;
}
// Unknown liquids have original identities and quantities, never an invented
// water/medicine identity. Stock's existing opening/upgrade registry books them.
registerLegacyStock('physical-contents',(engine,state,add)=>{
 for(const row of Object.values(state.records??{}))if(row.category==='physical_contents')for(const entry of row.entries)add(accountKey(row.container,entry.resource,'contents'),entry.quantity);
});
export function writeLiquidContents(d,engine,container,entries){
 if(!d.get('holdings','entities',container)&&!d.get('state','itemInstances',container))throw Error('Unknown container');
 if(d.get('state','records',`contents:${container}`))throw Error('Container contents already declared');
 if(!Array.isArray(entries)||!entries.length)throw Error('Missing liquid entries');
 const seen=new Set();
 for(const row of entries){
  if(!row||Object.keys(row).some(k=>!['resourceAlias','quantity','drinkable','identityKnownToPlayer'].includes(k))||!token(row.resourceAlias)||engine.byId.has(row.resourceAlias)||row.resourceAlias.startsWith('coin_')||seen.has(row.resourceAlias)||!Number.isSafeInteger(row.quantity)||row.quantity<1||typeof row.drinkable!=='boolean'||typeof row.identityKnownToPlayer!=='boolean')throw Error('Invalid original liquid declaration');
  if(Object.values(d.get('state','records')??{}).some(r=>r.category==='physical_contents'&&r.entries.some(e=>e.resource===row.resourceAlias)))throw Error('Liquid alias already bound');
  seen.add(row.resourceAlias);
 }
 const rows=entries.map(e=>({resource:e.resourceAlias,quantity:e.quantity,drinkable:e.drinkable,identityKnownToPlayer:e.identityKnownToPlayer}));
 holdingSet(d,engine,['state','records',`contents:${container}`],{category:'physical_contents',container,entries:rows},'items');
 return rows;
}
export function consumeLiquid(d,engine,container,resource,quantity,{eventId=null,millilitres}={}){
 if(!Number.isSafeInteger(quantity)||quantity<1)reject('E-ACTION-LIQUID','饮用量必须是实际可计量的正整数份',{missing:['有效的饮用份数'],repair:['按容器里实际存在的份数取用']});
 const binding=d.get('state','records',`liquid_binding:${container}`);
 if(binding&&(resource===undefined||resource==='water'||resource===binding.item)){
  const feature=d.get('state','records',`physical_feature:${container}`),water=feature.state;
  if(millilitres!==undefined||water.waterMl<binding.unitMl&&quantity===1){
   const amount=millilitres??water.waterMl;
   if(!Number.isSafeInteger(amount)||amount<1||amount>water.waterMl)reject('E-ACTION-LIQUID','没有足量可饮用的实际水量',{missing:['实际存在的正整数毫升数'],repair:['按容器现有水量减少饮用量，或先补水']});
   if(water.toxinUg>0||water.pathogenRisk>0||water.turbidity>0)reject('E-ACTION-LIQUID','当前原水受到污染，不能当成可饮用清水',{missing:['可安全饮用的水'],repair:['取得真正可饮用的水；外观清澈不等于已经消毒']});
   const split=transferWaterState(water,{waterMl:0,capacityMl:amount},amount,{odor:true});
   holdingSet(d,engine,['state','records',`physical_feature:${container}`],{...feature,state:split.source},'items');
   reconcileContainerWater(d,container,split.source.waterMl,eventId);
   return {resource:binding.item,quantity:amount/binding.unitMl,nutrition:{hydration:(engine.byId.get(binding.item)?.nutrition?.hydration??0)*amount/binding.unitMl},consumed:[]};
  }
  const units=containerUnits(d,container).filter(u=>u.item===binding.item);
  if(units.length<quantity)reject('E-ACTION-LIQUID','容器里没有足量可饮用的液体',{missing:['实际可饮用水量'],repair:['补充原水或减少饮用量']});
  const selected=units.slice(0,quantity).map(u=>u.id);
  for(const id of selected)takeContainerUnit(d,engine,container,id,'player',eventId);
  changeItems(d,engine,'player',binding.item,-quantity,{selection:selected,books:{flow:'sink:consume',purpose:'drink',writer:'items',eventId}});
  const gain=(engine.byId.get(binding.item)?.nutrition?.hydration??0)*quantity;
  return {resource:binding.item,quantity,nutrition:{hydration:gain},consumed:selected};
 }
 const key=`contents:${container}`,row=d.get('state','records',key),entry=row?.entries.find(e=>e.resource===resource);
 if(!entry||!entry.drinkable||entry.quantity<quantity)reject('E-ACTION-LIQUID','容器里没有足量可饮用的液体',{missing:['足量可饮用液体'],repair:['检查容器内容，补充可饮用液体或减少饮用量']});
 moveStock(d,{from:accountKey(container,resource,'contents'),to:accountKey('sink:consume',resource,'drink'),amount:quantity,writer:'items',eventId});
 holdingSet(d,engine,['state','records',key],{...row,entries:row.entries.map(e=>e===entry?{...e,quantity:e.quantity-quantity}:e)},'items');
 return {resource,quantity,nutrition:null};
}
export function containerUnits(d,container){
 return Object.values(d.get('state','itemInstances')??{}).filter(u=>u.container===container&&u.status==='袋内');
}
export function stockContainerWater(d,engine,container,eventId){
 const feature=d.get('state','records',`physical_feature:${container}`),water=liquidItem(engine,'water'),unitMl=liquidPortionMl(engine,'water');
 if(!water||!unitMl)throw Error('Missing registered water portion');
 const old=d.get('state','records',`liquid_binding:${container}`),current=containerUnits(d,container).filter(u=>u.item===water);
 const quantity=Math.floor(feature.state.waterMl/unitMl)-current.length;
 const ids=[];
 for(let offset=0;offset<quantity;offset+=200){
  const count=Math.min(200,quantity-offset),made=produceItems(d,engine,water,count,{eventId:`${eventId}:water:${offset}`,books:{flow:'src:harvest',purpose:'draw_water',writer:'items',eventId}});
  changeItems(d,engine,'player',water,-count,{selection:made,preserve:true,books:BOOKED});
  moveStock(d,{from:bag(engine,'player',water),to:placed(engine,container,water),amount:count,writer:'items',eventId});
  for(const id of made){
   const unit=d.get('state','itemInstances',id);
   holdingSet(d,engine,['state','itemInstances',id],{...unit,container,status:'袋内'},'items');
   setLocation(d,{entity:id,at:container,mode:'container',writer:'items',engine});
  }
  ids.push(...made);
 }
 holdingSet(d,engine,['state','records',`liquid_binding:${container}`],{category:'physical_liquid_binding',container,item:water,unitMl,units:[...new Set([...old?.units??[],...current.map(u=>u.id),...ids])]},'items');
 return ids;
}
export function takeContainerUnit(d,engine,container,id,actor,eventId){
 const unit=containerUnits(d,container).find(u=>u.id===id);
 if(!unit||physicalLocation(d,engine,container)!==physicalLocation(d,engine,actor))reject('E-ACTION-CONTAINER','取不到该容器里的物品',{missing:['同地点可取出的实际物品'],repair:['靠近容器并确认物品仍在其中']});
 const {container:oldContainer,...next}=unit;
 const binding=d.get('state','records',`liquid_binding:${container}`),feature=d.get('state','records',`physical_feature:${container}`);
 if(binding?.units.includes(id)){
  const before=feature?.state,amount=binding.unitMl;
  if(!before||before.waterMl<amount)reject('E-ACTION-WATER','这份容器水已被用掉',{missing:['尚未消耗的水'],repair:['补充实际水量后再取用']});
  const split=transferWaterState(before,{waterMl:0,capacityMl:amount},amount,{odor:true});
  const {capacityMl,...liquid}=split.destination;next.liquid=liquid;
  holdingSet(d,engine,['state','records',`physical_feature:${container}`],{...feature,state:split.source},'items');
 }
 changeItems(d,engine,actor,unit.item,1,{books:BOOKED});
 const path=[...engine.bagPath(actor),unit.item,'instances'];d.set(path,[...d.get(...path)??[],id]);
 moveStock(d,{from:placed(engine,container,unit.item),to:bag(engine,actor,unit.item),amount:1,writer:'items',eventId});
 holdingSet(d,engine,['state','itemInstances',id],{...next,owner:actor,status:'持有'},'items');
 setLocation(d,{entity:id,at:actor,mode:'carried',writer:'items',engine});
 return {item:unit.item,instance:id,quantity:1};
}
// A catalog water portion (the item tagged water; weight x density gives its ml), not the bucket's authored
// default fill. Full contents declarations restore that SAME original water.
export function bindContainerWater(d,engine,container,{declaredMl}={}){
 const feature=d.get('state','records',`physical_feature:${container}`);
 if(!feature||feature.state?.waterMl===undefined)return;
 const water=liquidItem(engine,'water'),units=water?containerUnits(d,container).filter(u=>u.item===water):[];if(!units.length)return;
 if(d.get('state','records',`liquid_binding:${container}`))throw Error('Container water is already bound');
 const unitMl=liquidPortionMl(engine,'water');
 if(!unitMl)throw Error('This water portion has no registered millilitre conversion');
 const waterMl=units.length*unitMl,before=feature.state;
 if(declaredMl!==undefined&&declaredMl!==waterMl||waterMl+(before.reservedWaterMl??0)>before.capacityMl)throw Error('Original stock water conflicts with declared volume or capacity');
 const state={...before,waterMl};
 for(const field of ['saltMg','toxinUg'])state[field]=before.waterMl?(before[field]??0)*waterMl/before.waterMl:before[field]??0;
 holdingSet(d,engine,['state','records',`physical_feature:${container}`],{...feature,state},'items');
 holdingSet(d,engine,['state','records',`liquid_binding:${container}`],{category:'physical_liquid_binding',container,item:water,unitMl,units:units.map(u=>u.id)},'items');
}
// A partly poured original portion becomes loose liquid. Retire the item
// token once, retaining the measured remainder in the existing fluid state.
export function reconcileContainerWater(d,container,waterMl,eventId=null){
 const binding=d.get('state','records',`liquid_binding:${container}`);if(!binding)return;
 const units=containerUnits(d,container).filter(u=>binding.units.includes(u.id)),keep=Math.floor(waterMl/binding.unitMl);
 for(const unit of units.slice(Math.max(0,keep))){
  moveStock(d,{from:accountKey(container,binding.item??unit.item,'placed'),to:accountKey('sink:consume',binding.item??unit.item,'decant'),amount:1,writer:'items',eventId});
  holdingSet(d,null,['state','itemInstances',unit.id],{...unit,status:'散装液体',convertedAt:d.get('state','minute'),...(eventId?{conversionEvent:eventId}:{})},'items');
  clearLocation(d,{entity:unit.id,writer:'items'});
 }
}
export function releaseContainerWater(d,container,eventId){
 if(d.get('state','records',`liquid_binding:${container}`))reconcileContainerWater(d,container,0,eventId);
}
export function physicalLocation(d,engine,id){
 const seen=new Set();let x=id;
 while(x&&!seen.has(x)){
  seen.add(x);
  if(x==='player')return d.get('state','location');
  const body=d.get('state','npcs',x)??d.get('state','creatures',x);
  if(body)return body.location??null;
  const at=locationOf(d,x);
  if(!at)return d.get('state','created',x)?.location??engine?.byId?.get(x)?.location??null;
  if(at.mode==='place')return at.at;
  x=at.at;
 }
 return null;
}
// Explicit original quantities of non-catalog objects use the ordinary item
// accounts and transfer protocol. Their definition comes from this saved
// entity, without adding a product, skill, price or nutrition to the world.
export function physicalCatalog(engine,document){
 const d={get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
 return Object.values(document.state.itemInstances??{}).filter(u=>u.physicalOnly&&!engine.world.items.some(i=>i.id===u.item)).map(u=>{
  const facts=physicalItem(d,engine,u.id);
  return {id:u.item,name:facts.name??u.id,aliases:facts.aliases??[],physicalOnly:true,...(facts.private?{private:true}:{}),...(facts.hidden?{hidden:true}:{}),...(facts.condition!==undefined?{durability:facts.condition}:{}),...(facts.material?{material:facts.material}:{})};
 });
}
export function registerPhysicalStock(d,engine,id,actor,quantity){
 if(quantity!==1||!d.get('holdings','entities',id)||d.get('state','itemInstances',id)||locationOf(d,id)?.at!==actor||locationOf(d,id)?.mode!=='carried')throw Error('Original physical stock requires one existing carried entity');
 if(d.get(...engine.bagPath(actor),id))throw Error('Original physical stock already exists');
 holdingSet(d,engine,['state','itemInstances',id],{id,item:id,owner:actor,status:'持有',physicalOnly:true},'items');
 d.set([...engine.bagPath(actor),id],{quantity:1,instances:[id]});
 return id;
}
export function validatePhysicalAction(d,engine,tool,args){
 if(tool==='repair'){
  const item=args.item?engine.resolve(args.item,'item'):d.get('state','itemInstances',args.instance)?.item;
  const id=args.instance??d.get(...engine.bagPath('player'),item)?.instances?.[0]??item,facts=physicalItem(d,engine,id);
  const plans=(engine.rules.repairs??[]).filter(row=>row.item===item),plan=args.repairPlan?plans.find(row=>row.id===args.repairPlan):plans.length===1?plans[0]:null;
  if(handRepairRefused(engine,facts)){
   const structural=facts.damage?.kind==='cracked_body';
   reject('E-ACTION-REPAIR-WORK',`${facts.material??'材质未知'}物件${structural?'本体裂损':'规模为 '+facts.scale}，不能用随身物品的修整工序瞬间复原`,{
    missing:[`${facts.material??'该材质'}的结构修复工具与补配材料`,`${structural?'裂损':'该规模'}工程的技能、工时及施工工序`],
    repair:['请相应工匠现场勘查，准备支撑、补配材料及施工工具，再按工程工时修复；暂时避用或更换损坏部件'],
   });
  }
  // Existing processes remain responsible for skill, actual tools/materials,
  // wear and elapsed time. Without a process no amount of bare-hand work is invented.
  if(!plan)reject('E-ACTION-REPAIR-PROCESS','尚无适用于该物件材质和损伤的修理工序',{
   missing:[`${facts.material??'未知材质'}、${facts.damage?.kind??'当前损耗'}的工具、材料与工时工序`],
   repair:['请工匠勘查材质与损伤并确定工序，或更换损坏部件'],
  });
  const definition=engine.byId.get(item);
  // A process for the original catalogue item is not evidence that it also
  // works after its material changes. Missing material facts stay unknown.
  if(facts.material&&definition?.material!==facts.material&&!definition?.tags?.includes(facts.material))reject('E-ACTION-REPAIR-MATERIAL',`现有修理工序尚不能确认适用于 ${facts.material} 材质`,{
   missing:[`${facts.material} 材质适用的修理工具、补配材料与工时依据`],
   repair:['请相应材质的工匠勘查并确定工具与工序，或更换损坏部件'],
  });
 }
}
