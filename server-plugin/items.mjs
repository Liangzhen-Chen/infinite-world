import {preconditionFailure} from './precondition.mjs';
import {createHash}from'node:crypto';
import {bag,bookStock,moveStock,BOOKED,registerLegacyStock,placed} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {declareHoldingWriter,holdingSet,updateEntity,locationOf,setLocation,clearLocation,templatesOf,aliveHoldings,runHoldingProtocol} from './holdings.mjs';
import {authority} from './action-authority.mjs';
import {accountKey} from './ledger.mjs';
import {partyAccount} from './money.mjs';
import {handRepairRefused,liquidItem,liquidPortionMl,vocabulary,domainRules} from './domain-rules.mjs';
declareHoldingWriter('items',{kinds:[],entities:['item','building'],locations:true});
declareLedgerWriter('items',{sinks:['sink:consume']});
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
export function transferItems(d,engine,from,to,item,quantity,selection=null,{disposition=false,eventId=null,authorityContext=null}={}){
    const units=validateItemTransfer(d,engine,from,to,item,quantity,selection);
    const chosen=selection?[...selection,...units.filter(unit=>!selection.includes(unit)).slice(0,Math.max(0,quantity-selection.length))]:units.slice(0,quantity);
    // Possession and title are distinct. Only a native sale opts into disposal;
    // gifts, loans and delivery keep the ordinary physical-transfer semantics.
    const dispositions=disposition?chosen.flatMap(unit=>aliveHoldings(d,{kind:'owns',subject:unit}).map(row=>{
        if(!eventId)throw Error('Sale disposition requires its native event');
        const permission=authority({...authorityContext,engine,document:d.document},from,'holding.transfer',unit,{holding:row,kind:'owns',disposition:true});
        if(!permission.allowed)throw Error(permission.reason);
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
    return moved;
}
// S1b: books = 产出的来源（制造为 stock.craftOutput，作品誊抄等同）；缺省未入账。
export function produceItems(d,engine,item,quantity,{eventId,recipe,workmanship,owner='player',maker=owner,books}){
    count(quantity);if(quantity>200)throw preconditionFailure('单次制造产物超过处理上限，应拆分工序');
    const definition=engine.byId.get(item),ids=[];
    if(!definition)throw preconditionFailure('产物未登记');
    for(let index=0;index<quantity;index++){
        const id=`unit_${createHash('sha256').update(`${d.document.randomSeed}:${eventId}:${item}:${index}`).digest('hex').slice(0,24)}`;
        if(d.get('state','itemInstances',id))throw preconditionFailure('此次制造的单件编号已经存在，不能重复制造');
        ids.push(id);
        const factor=engine.rules.equipment.workmanship?.find(row=>row.name===workmanship)?.multiplier??1,maxDurability=Math.max(1,Math.round(definition.durability*factor));
        holdingSet(d,null,['state','itemInstances',id],{id,item,owner,status:'持有',maker,makerName:maker==='player'?d.get('state','player','name'):engine.byId.get(maker)?.name??maker,
            recipe,source:eventId,minute:d.get('state','minute'),quality:definition.quality,durability:maxDurability,maxDurability,workmanship},'items');
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
export function trackTransferUnit(d,engine,owner,item,eventId,requested=null){
    const quantity=engine.quantity(d,owner,item),held=d.get(...engine.bagPath(owner),item),units=held?.instances??[];
    if(quantity<1)throw preconditionFailure('没有可登记转移的库存');
    if(requested&&!units.includes(requested))throw preconditionFailure('所指定单件不属于目标库存');
    const selected=requested??units[0];
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
  if(facts.contaminated===true||facts.toxic===true||facts.condition===0)throw Error('Food or drink is contaminated, toxic or spoiled');
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
 if(!['body','head','feet','hands','waist','back'].includes(slot))throw Error('Invalid wear slot');
 const p=locationOf(d,id),facts=physicalItem(d,engine,id),unit=d.get('state','itemInstances',id);
 if(p?.at!==actor||p.mode!=='carried'||unit&&(unit.owner!==actor||unit.status!=='持有'))throw Error('Only a carried item can be worn');
 if(!remove&&(facts.wearable===false||facts.wearable!==true&&!facts.tags?.some(t=>['clothing','armor','footwear'].includes(t))||facts.condition===0||facts.durability===0))throw Error('This item cannot be worn');
 const slots=wornItems(d,engine,actor);
 if(!remove&&slots[slot]&&slots[slot]!==id)throw Error('Wear slot is occupied');
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
export function consumeLiquid(d,engine,container,resource,quantity,{eventId=null}={}){
 if(!Number.isSafeInteger(quantity)||quantity<1)throw Error('Invalid liquid quantity');
 const key=`contents:${container}`,row=d.get('state','records',key),entry=row?.entries.find(e=>e.resource===resource);
 if(!entry||!entry.drinkable||entry.quantity<quantity)throw Error('No such drinkable quantity');
 moveStock(d,{from:accountKey(container,resource,'contents'),to:accountKey('sink:consume',resource,'drink'),amount:quantity,writer:'items',eventId});
 holdingSet(d,engine,['state','records',key],{...row,entries:row.entries.map(e=>e===entry?{...e,quantity:e.quantity-quantity}:e)},'items');
 return {resource,quantity,nutrition:null};
}
export function containerUnits(d,container){
 return Object.values(d.get('state','itemInstances')??{}).filter(u=>u.container===container&&u.status==='袋内');
}
export function takeContainerUnit(d,engine,container,id,actor,eventId){
 const unit=containerUnits(d,container).find(u=>u.id===id);
 if(!unit||physicalLocation(d,engine,container)!==physicalLocation(d,engine,actor))throw Error('Original container unit is not accessible');
 const {container:oldContainer,...next}=unit;
 const binding=d.get('state','records',`liquid_binding:${container}`),feature=d.get('state','records',`physical_feature:${container}`);
 if(binding?.units.includes(id)){
  const before=feature?.state,amount=binding.unitMl;
  if(!before||before.waterMl<amount)throw Error('The bound water portion has already been used');
  const fraction=amount/before.waterMl,state={...before,waterMl:before.waterMl-amount};
  next.liquid={waterMl:amount,turbidity:before.turbidity,pathogenRisk:before.pathogenRisk,odor:before.odor};
  for(const field of ['saltMg','toxinUg']){next.liquid[field]=(before[field]??0)*fraction;state[field]=(before[field]??0)-next.liquid[field];}
  holdingSet(d,engine,['state','records',`physical_feature:${container}`],{...feature,state},'items');
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
  let item=args.item;if(item)try{item=engine.resolve(item,'item');}catch{return;}
  const id=args.instance??d.get(...engine.bagPath('player'),item)?.instances?.[0]??item,facts=physicalItem(d,engine,id);
  if(facts.damage?.kind!==undefined&&domainRules(engine).handRepair?.refusedDamageKinds?.includes(facts.damage.kind))throw Error('This repair does not restore a cracked vessel body');
  if(handRepairRefused(engine,facts))throw Error('Hand-tool item repair cannot restore a stone city gate');
 }
}
