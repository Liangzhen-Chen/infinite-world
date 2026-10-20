// Initial physical premises, not successful actions. 01 §1.2/§1.3/§1.6,
// 06 §6.3 and A §A.15.7: identity, possession and legal ownership differ.
import {registerSetupLoader} from './index.mjs';
import {declareHoldingWriter,holdingSet,createEntity,setLocation,openHolding,aliveHoldings,isPhysicallyDead} from '../../server-plugin/holdings.mjs';
import {trackTransferUnit,changeItems,writePhysicalItem,equipPhysicalItem,bindPurse,writeLiquidContents,registerPhysicalStock,bindContainerWater} from '../../server-plugin/items.mjs';
import {BOOKED} from '../../server-plugin/stock.mjs';
import {bodyRule,writeBodyNeed} from '../../server-plugin/primitives-body.mjs';
import {derivedStats,monsterStats} from '../../server-plugin/combat.mjs';
import {npcAgeAt} from '../../server-plugin/npc-state.mjs';
import {environmentFeatures,writeEnvironmentPremise,localSightClear,localPlayerPoint} from '../../server-plugin/environment.mjs';
import {createRoutingContext} from '../../server-plugin/action-router.mjs';
import {subjectiveView} from '../../server-plugin/subjective-view.mjs';
import {presentWitnesses} from '../../server-plugin/world-events.mjs';
import {mirrorPartyCoins,partyAccount,legacyMoney} from '../../server-plugin/money.mjs';

const writer='a3-physical-setup';
declareHoldingWriter(writer,{entities:['item','building'],kinds:['owns'],locations:true});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_:-]+$/.test(v);
const finite=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isFinite(v)&&v>=min&&v<=max;
const point=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
const reader=ctx=>({get:(...p)=>p.reduce((v,k)=>v?.[k],ctx.document)});
const location= (ctx,value)=>ctx.engine.world.locations.some(p=>p.id===value);
const actorPath=(ctx,actor)=>actor==='player'?['state','player']:ctx.document.state.npcs?.[actor]?['state','npcs',actor]:ctx.document.state.creatures?.[actor]?['state','creatures',actor]:null;
const physicalFields=['damage','contaminated','appearance','material','scale','wearable','materialTraits','attachedLaces','toxic','medicinalEffect','access','armed','identified','mechanism','locked','reachable','fireIntensity'];
const physicalFacts=row=>Object.fromEntries(physicalFields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
function initialPhysical(ctx,d,nativeId,row){
 const facts={...physicalFacts(row),...(row.condition!==undefined?{condition:row.condition}:{}),...(row.kind==='node'?{physicalKind:'node'}:{})};
 writePhysicalItem(d,ctx.engine,nativeId,facts,{source:row.sourceEvent?ctx.ref(row.sourceEvent):null,alias:row.id,name:row.name??null});
 if(row.wornBy!==undefined&&row.wornBy!==null)equipPhysicalItem(d,ctx.engine,ctx.ref(row.wornBy),nativeId);
 if(row.access!==undefined)bindPurse(d,ctx.engine,nativeId,ctx.ref(row.carriedBy??row.owner));
}
const missing=(ctx,item,接点,章节)=>ctx.unmet(item,`缺少原生接点：${接点}（${章节}）`);
function array(ctx,setup,field,load){
 if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!object(row)){ctx.unmet(item,'expected an object');continue;}
  load(row,item);
 }
}
function extras(ctx,row,item,allowed){
 for(const field of Object.keys(row))if(!allowed.includes(field))missing(ctx,`${item}.${field}`,`${field} 的初始事实写入口及消费者`,['zone','tableSide'].includes(field)?'01 §1.2；S4':'01 §1.2；06 §6.3');
}
function owner(ctx,d,subject,holder,item){
 if(holder===null||holder===undefined)return;
 const existing=aliveHoldings(d,{kind:'owns',subject});
 if(existing.length){if(existing.length!==1||existing[0].holder!==holder)throw Error('conflicting legal ownership');return;}
 openHolding(d,{kind:'owns',holder,subject,terms:{share:1},source:`${writer}:${item}`,writer,engine:ctx.engine});
}
function place(ctx,d,entity,row){
 const carrier=ctx.ref(row.carriedBy??row.wornBy);
 if(carrier){
  if(!ctx.actor(carrier))throw Error('carriedBy/wornBy requires an existing agent');
  const at=carrier==='player'?d.get('state','location'):ctx.actor(carrier).location;
  if(row.location!==undefined&&at!==row.location)throw Error('carrier location conflicts with declared item location');
  setLocation(d,{entity,at:carrier,mode:'carried',writer,engine:ctx.engine});
 }else if(row.location!==undefined){
  if(!location(ctx,row.location))throw Error('unknown physical location');
  setLocation(d,{entity,at:row.location,mode:'place',writer,engine:ctx.engine});
 }
}
function instance(ctx,row,item){
 if(!id(row.id)||row.template!=='thing'||row.kind!=='item'||!location(ctx,row.location)||row.owner!==null&&row.owner!==undefined&&!id(row.owner)||
  row.name!==undefined&&(typeof row.name!=='string'||!row.name.trim())||['carriedBy','wornBy'].some(k=>row[k]!==undefined&&row[k]!==null&&!id(row[k]))){
  ctx.unmet(item,'invalid thing/item identity, owner or location');return;
 }
 if(Object.hasOwn(ctx.bindings,row.id)||ctx.document.state.itemInstances?.[row.id]||ctx.document.holdings?.entities?.[row.id]){
  ctx.unmet(item,'instance ID already exists');return;
 }
 if(row.condition!==undefined&&!finite(row.condition,0,100)||row.moisture!==undefined&&!finite(row.moisture,0,100)||row.quantity!==undefined&&row.quantity!==1){ctx.unmet(item,'condition/moisture must be 0..100; an instance has quantity 1');return;}
 const definition=row.item===undefined?null:ctx.engine.world.items.find(r=>r.id===row.item);
 if(row.item!==undefined&&!definition){ctx.unmet(item,'unknown catalog item');return;}
 const binding=row.inventoryBinding;
 if(binding!==undefined&&(!object(binding)||binding.mode!=='same_stock'||binding.item!==row.item||binding.quantity!==1||Object.keys(binding).some(k=>!['item','quantity','mode'].includes(k)))){
  ctx.unmet(`${item}.inventoryBinding`,'expected same_stock binding to exactly one unit of the same catalog item');return;
 }
 const holder=ctx.ref(row.carriedBy??row.wornBy??(binding?'player':null)),legal=ctx.ref(row.owner);
 let nativeId;
 const ok=ctx.native(item,d=>{
  if(definition&&(binding||ctx.actor(holder))){
   if(!ctx.actor(holder))throw Error('inventory binding requires an existing physical holder');
   // Without same_stock the declaration itself supplies one original item.
   // Reuse existing stock when present; otherwise initialize that one unit
   // through the native item writer. The final opening books count it once.
   if(!binding&&ctx.engine.quantity(d,holder,row.item)<1)ctx.engine.itemDelta(d,holder,row.item,1,BOOKED);
   nativeId=trackTransferUnit(d,ctx.engine,holder,row.item,`${writer}:${row.id}`);
   if(Object.values(ctx.bindings).includes(nativeId))throw Error('same_stock unit already bound to another instance');
   const unit=d.get('state','itemInstances',nativeId),max=unit.maxDurability;
   if(row.condition!==undefined){
    if(!finite(max)||max===0&&row.condition!==100)throw Error('catalog has no usable durability scale');
    const durability=Math.round(max*row.condition/100);
    holdingSet(d,ctx.engine,['state','itemInstances',nativeId,'durability'],durability,writer);
    // The legacy repair reader uses heldUnit, while ordinary tools still read
    // the stack when there is only one unit. Keep that projection consistent.
    if(ctx.engine.quantity(d,holder,row.item)===1)holdingSet(d,ctx.engine,[...ctx.engine.bagPath(holder),row.item,'durability'],durability,writer);
   }
   if(row.moisture!==undefined){
    // Existing carried-item drying reads this amount directly (not a wet flag).
    // A multi-unit stack cannot represent one unit's distinct moisture.
    if(ctx.engine.quantity(d,holder,row.item)!==1)throw Error('individual moisture requires a single-unit inventory stack');
    holdingSet(d,ctx.engine,[...ctx.engine.bagPath(holder),row.item,'moisture'],row.moisture,writer);
   }
   // Native item.owner is custody. Legal title is opened separately below.
   if(row.carriedBy===null){
    // Initial custody, not a performed drop. Remove the SAME selected unit
    // through the item API; applyIntentSetup opens the final initial books.
    changeItems(d,ctx.engine,holder,row.item,-1,{preserve:true,selection:[nativeId],books:BOOKED});
    holdingSet(d,ctx.engine,['state','itemInstances',nativeId],{...d.get('state','itemInstances',nativeId),owner:null,status:'封存',location:row.location},writer);
   }
  }else{
   nativeId=row.id.startsWith('item_')?row.id:`item_${row.id}`;
   if(ctx.engine.byId.has(nativeId))throw Error('instance ID collides with catalog identity');
   const facts={name:row.name??definition?.name??row.id,aliases:[row.id]};
   // These are current facts on the native entity, not successful repair,
   // ignition or consumption receipts. Unsupported semantics stay unmet.
   if(row.condition!==undefined)facts.condition=row.condition;
   if(definition)facts.item=definition.id;
   createEntity(d,{id:nativeId,kind:'item',facts,source:`${writer}:${row.id}`,writer});
   if(definition){
    const bank=(ctx.engine.rules.economy?.credit?.banks??[]).find(b=>b.id===holder);
    if(holder&&(!bank||bank.location!==row.location))throw Error('non-agent custodian needs an existing bank at the declared location');
    // The stock and item view adapters already read these native initial
    // single-unit facts. A sealed/held unit is not also added to an inventory.
    const maximum=definition.durability;
    if(!finite(maximum))throw Error('catalog item has no durability scale');
    holdingSet(d,ctx.engine,['state','itemInstances',nativeId],{
     id:nativeId,item:definition.id,owner:bank?holder:null,status:bank?'保管':'封存',location:row.location,
     quality:definition.quality,maxDurability:maximum,durability:Math.round(maximum*(row.condition??100)/100),
    },writer);
   }
  }
  const bank=definition&&!ctx.actor(holder)&&(ctx.engine.rules.economy?.credit?.banks??[]).some(b=>b.id===holder);
  place(ctx,d,nativeId,bank?{...row,carriedBy:null}:binding&&row.carriedBy===undefined&&row.wornBy===undefined?{...row,carriedBy:holder}:row);
  owner(ctx,d,nativeId,legal,item);
  initialPhysical(ctx,d,nativeId,row);
  if(!definition&&row.quantity!==undefined)registerPhysicalStock(d,ctx.engine,nativeId,holder,row.quantity);
 });
 if(!ok)return;
 ctx.bindings[row.id]=nativeId;
 if(!ctx.actor(holder)&&row.moisture!==undefined)missing(ctx,`${item}.moisture`,'非库存单件的含水量写入口和干燥消费者','01 §1.2；06 §6.3');
 if(row.zone!==undefined)missing(ctx,`${item}.zone`,'物件在局部分区内的位置','01 §1.2；S4');
 if(row.contents!==undefined)contents(ctx,nativeId,row.contents,`${item}.contents`);
 extras(ctx,row,item,['id','template','kind','owner','location','item','inventoryBinding','condition','moisture','carriedBy','wornBy','zone','name','quantity','contents',...physicalFields]);
}

function contents(ctx,container,rows,item){
 if(!Array.isArray(rows)){ctx.unmet(item,'expected an array of original contents');return;}
 const liquids=rows.filter(row=>row?.resourceAlias!==undefined);
 if(liquids.length)ctx.native(item,d=>writeLiquidContents(d,ctx.engine,container,liquids));
 for(const [index,row] of rows.entries()){
  const name=`${item}[${index}]`,b=row?.inventoryBinding;
  if(!object(row)){ctx.unmet(name,'invalid content declaration');continue;}
  if(row.resourceAlias!==undefined)continue;
  if(!b){missing(ctx,name,'容器内 resourceAlias 与原生液体账户的绑定（不另造一份液体）','01 §1.2/§1.6');continue;}
  const definition=ctx.engine.world.items.find(i=>i.id===b.item);
  if(!object(b)||b.mode!=='same_stock'||!definition||!Number.isSafeInteger(b.quantity)||b.quantity<1||Object.keys(b).some(k=>!['item','quantity','mode'].includes(k))){ctx.unmet(name,'invalid same_stock content binding');continue;}
  if(row.weightKg!==undefined&&(!finite(row.weightKg)||row.weightKg!==definition.weight*b.quantity)){
   ctx.unmet(`${name}.weightKg`,'content weight conflicts with its native catalog mass');continue;
  }
  ctx.native(name,d=>{
   const path=ctx.engine.bagPath('player'),held=d.get(...path,b.item),tracked=held?.instances??[];
   if(ctx.engine.quantity(d,'player',b.item)<b.quantity)throw Error('insufficient original same_stock contents');
   const selected=tracked.slice(0,b.quantity);
   if(selected.some(unit=>Object.values(ctx.bindings).includes(unit)))throw Error('content unit is already bound as a separate physical premise');
   // Existing identities stay the same; only untracked stock needs identities.
   // The item API removes that exact quantity, then the native placed-stock
   // adapter sees one unit per container entry when the initial books open.
   changeItems(d,ctx.engine,'player',b.item,-b.quantity,{preserve:true,selection:selected,books:BOOKED});
   for(let k=0;k<b.quantity;k++){
    const unit=selected[k]??`item_${container}_content_${index}_${k}`;
    if(!selected[k])createEntity(d,{id:unit,kind:'item',facts:{name:definition.name},source:`${writer}:${name}:${k}`,writer});
    holdingSet(d,ctx.engine,['state','itemInstances',unit],{
     ...(selected[k]?d.get('state','itemInstances',unit):{id:unit,item:b.item,quality:definition.quality,durability:held?.durability??definition.durability,maxDurability:definition.durability}),
     owner:null,status:'袋内',container,
    },writer);
    setLocation(d,{entity:unit,at:container,mode:'container',writer,engine:ctx.engine});
    if(row.owner!==undefined)owner(ctx,d,unit,ctx.ref(row.owner),name);
   }
  });
  extras(ctx,row,name,['inventoryBinding','weightKg','owner']);
 }
}

function environmentalObject(ctx,row,item,feature){
 const record=ctx.document.state.records?.[`physical_feature:${feature.id}`];
 if(record&&(record.category!=='physical_feature'||record.id!==feature.id||record.location!==feature.location)){ctx.unmet(item,'native physical feature record key conflicts');return;}
 const state=structuredClone(record?.state??feature.state);
 if(!object(state)){ctx.unmet(item,'catalog feature has no physical state');return;}
 let valid=true,changed=false;
 const fail=(field,reason)=>{ctx.unmet(`${item}.${field}`,reason);valid=false;};
 const put=(field,key,value)=>{
  if(!Object.hasOwn(state,key)){missing(ctx,`${item}.${field}`,`${feature.kind}.${key} 状态消费者`,'01 §1.2；06 §6.3');return;}
  if(!finite(value)){fail(field,'expected a nonnegative finite amount');return;}
  state[key]=value;changed=true;
 };
 if(row.waterLiters!==undefined){if(!finite(row.waterLiters))fail('waterLiters','expected nonnegative numeric litres');else put('waterLiters','waterMl',row.waterLiters*1000);}
 if(row.capacityLiters!==undefined){if(!finite(row.capacityLiters))fail('capacityLiters','expected nonnegative numeric litres');else put('capacityLiters','capacityMl',row.capacityLiters*1000);}
 if(row.turbidity!==undefined){if(!finite(row.turbidity,0,100))fail('turbidity','expected 0..100');else put('turbidity','turbidity',row.turbidity);}
 if(row.blockagePercent!==undefined){if(!finite(row.blockagePercent,0,100))fail('blockagePercent','expected 0..100');else put('blockagePercent','blockagePercent',row.blockagePercent);}
 if(row.availableCapacityLiters!==undefined){
  if(!finite(row.availableCapacityLiters))fail('availableCapacityLiters','expected a nonnegative finite capacity');
  else if(!Number.isFinite(state.capacityMl)||!Number.isFinite(state.waterMl))missing(ctx,`${item}.availableCapacityLiters`,'容器可用容量','01 §1.2；06 §6.3');
  else{
   const capacity=state.waterMl+(state.reservedWaterMl??0)+row.availableCapacityLiters*1000;
   if(row.capacityLiters!==undefined&&capacity!==state.capacityMl)fail('availableCapacityLiters','declared total capacity and available capacity conflict');
   else{state.capacityMl=capacity;changed=true;}
  }
 }
 if(Number.isFinite(state.waterMl)&&(!Number.isSafeInteger(state.waterMl)||state.waterMl>state.capacityMl-(state.reservedWaterMl??0)))fail('waterLiters','water exceeds actual available capacity or millilitre precision');
 if(Number.isFinite(state.capacityMl)&&(!Number.isSafeInteger(state.capacityMl)||state.capacityMl<=0))fail('capacityLiters','capacity must be positive integral millilitres');
 for(const [field,key] of [['fromObject','source'],['toObject','destination']])if(row[field]!==undefined&&ctx.ref(row[field])!==feature.links?.[key])missing(ctx,`${item}.${field}`,'环境连接重设（当前消费者只读目录 links）','01 §1.2；S4');
 const pendingOwner=Array.isArray(ctx.setup.holdings)&&ctx.setup.holdings.some(h=>h.kind==='owns'&&ctx.ref(h.subject)===feature.id&&ctx.ref(h.holder)===ctx.ref(row.owner));
 // The shared setup driver opens these original holdings after materializing
 // physical endpoints. Its native openHolding validation remains authoritative.
 if(row.owner!==undefined&&ctx.ref(row.owner)!==feature.owner&&!pendingOwner)missing(ctx,`${item}.owner`,'环境操作权限需要真实 owns 持有，不能只凭 owner 声明','01 §1.3；06 §6.3');
 // Do not translate "turbid" into an invented numeric turbidity.
 if(row.waterState!==undefined){
  if(row.waterState==='turbid'&&state.turbidity>0)ctx.note(`${item}.waterState: verified native turbidity > 0; salt/toxin/pathogens preserved`);
  else missing(ctx,`${item}.waterState`,'有明确数值的水体状态','01 §1.2；06 §6.3');
 }
 if(row.sourceEvent!==undefined){
  const source=ctx.ref(row.sourceEvent);
  if(!ctx.document.state.records?.[source])ctx.unmet(`${item}.sourceEvent`,'unresolved native history event binding');
 }
 if(valid&&(changed||row.location!==undefined||row.carriedBy!==undefined||row.sourceEvent!==undefined))ctx.native(item,d=>writeEnvironmentPremise(d,ctx.engine,feature.id,{location:row.location,carriedBy:ctx.ref(row.carriedBy),state,source:row.sourceEvent?ctx.ref(row.sourceEvent):undefined}));
 ctx.bindings[row.id]=feature.id;
 if(row.contents!==undefined)contents(ctx,feature.id,row.contents,`${item}.contents`);
 if(row.contents!==undefined)ctx.native(`${item}.contents`,d=>bindContainerWater(d,ctx.engine,feature.id,{declaredMl:row.waterLiters===undefined?undefined:row.waterLiters*1000}));
 extras(ctx,row,item,['id','location','owner','waterLiters','capacityLiters','turbidity','blockagePercent','availableCapacityLiters','fromObject','toObject','carriedBy','waterState','sourceEvent','contents']);
}
function physicalObject(ctx,row,item){
 if(!id(row.id)){ctx.unmet(item,'missing object ID');return;}
 const feature=environmentFeatures(ctx.engine,ctx.document).find(f=>f.id===row.id);
 if(feature){environmentalObject(ctx,row,item,feature);return;}
 const existing=ctx.ref(row.id),entity=ctx.document.holdings?.entities?.[existing];
 if(entity||ctx.document.state.itemInstances?.[existing]){
  ctx.native(item,d=>initialPhysical(ctx,d,existing,row));
  if(row.contents!==undefined)contents(ctx,existing,row.contents,`${item}.contents`);
  if(row.sourceEvent!==undefined){
   const source=ctx.ref(row.sourceEvent);
   if(!ctx.document.state.records?.[source])ctx.unmet(`${item}.sourceEvent`,'unresolved native history event binding');
  }
  extras(ctx,row,item,['id','contents','sourceEvent',...physicalFields]);return;
 }
 if(row.template!=='thing'||!['item','building','node'].includes(row.kind)||typeof row.name!=='string'||!row.name.trim()||!location(ctx,row.location)){
  ctx.unmet(item,'new object requires thing template, native kind, name and location');return;
 }
 const kind=row.kind==='node'?'item':row.kind;
 const nativeId=row.id.startsWith(`${kind}_`)?row.id:`${kind}_${row.id}`;
 if(row.condition!==undefined&&!finite(row.condition,0,100)){ctx.unmet(`${item}.condition`,'expected 0..100');return;}
 if(ctx.native(item,d=>{
  if(ctx.engine.byId.has(nativeId))throw Error('object ID collides with catalog identity');
  createEntity(d,{id:nativeId,kind,facts:{name:row.name,aliases:[row.id],...(row.condition!==undefined?{condition:row.condition}:{})},source:`${writer}:${row.id}`,writer});
  place(ctx,d,nativeId,row);
  owner(ctx,d,nativeId,ctx.ref(row.owner),item);
  initialPhysical(ctx,d,nativeId,row);
 }))ctx.bindings[row.id]=nativeId;
 extras(ctx,row,item,['id','template','kind','name','location','condition','carriedBy','owner',...physicalFields]);
}

// The resolver reads place.zones/areas from the authored catalog; movement
// reads environment geometry. No runtime zone/path graph consumer exists.
function verifiedSpatial(ctx,setup,field,row,item){
 const d=ctx.engine.primitiveDraft(ctx.document),routing=createRoutingContext(ctx.engine,ctx.document);
 if(field==='zones'){
  const result=routing.resolve(row.id,'zone'),named=routing.resolve(row.name,'zone');
  const zone=ctx.engine.byId.get(row.location)?.zones?.find(z=>z.id===(result.value??named.value))??ctx.engine.byId.get(row.location)?.areas?.find(z=>z.id===(result.value??named.value));
  if(zone){ctx.bindings[row.id]=zone.id;ctx.note(`${item}: verified native local area ${zone.id}`);return true;}
 }else if(field==='placements'){
  const entity=ctx.ref(row.entity),zone=ctx.ref(row.zone),position=entity==='player'?ctx.document.state.records?.local_player_position:ctx.document.state.records?.[`local_actor_position:${entity}`];
  if(!row.blocksPassage&&position?.anchor===zone){ctx.note(`${item}: verified native position anchor`);return true;}
 }else if(field==='paths'){
  const from=ctx.ref(row.fromZone),to=ctx.ref(row.toZone);
  // Existing authored exits remain real paths; no inferred lock bypass.
  if(row.passable&&!row.blockedBy&&ctx.engine.world.locations.some(p=>p.id===from)&&ctx.engine.world.locations.some(p=>p.id===to)){
   try{const route=ctx.engine.route(from,to,'walk',ctx.document.state.minute,ctx.document.randomSeed),edge=ctx.engine.world.routes.find(e=>e.id===route.edges?.[0]);if(route.edges?.length===1&&edge?.lengthKm*1000===row.distanceMeters){ctx.note(`${item}: verified native route and distance`);return true;}}catch{}
  }
 }else if(field==='positions'){
  const observer=ctx.ref(row.observer),target=ctx.ref(row.target),view=createRoutingContext(ctx.engine,ctx.document,{actor:observer});
  const visible=view.resolve(target).value===target;
  if(row.lineOfSight!==visible)return false;
  let actual=ctx.engine.primitiveTargetFacts(d,observer,target);
  const feature=environmentFeatures(ctx.engine,ctx.document).find(f=>f.id===target);
  if(observer==='player'&&feature?.location===ctx.document.state.location&&Array.isArray(feature.position)){
   const from=localPlayerPoint(d),to=feature.position;
   actual={distanceMeters:Math.hypot(from[0]-to[0],from[1]-to[1]),lineOfSight:localSightClear(d,ctx.engine,feature.location,from,to)};
  }
  const carried=ctx.document.holdings?.locations?.[target];
  if(carried?.mode==='carried'&&carried.at===observer)actual={distanceMeters:0,lineOfSight:true};
  const spells=Array.isArray(setup.abilities?.spells)?setup.abilities.spells:[];
  const touch=(Array.isArray(setup.objects)?setup.objects:[]).some(o=>ctx.ref(o?.id)===target&&(o?.fireIntensity>0||o?.armed===true))||(Array.isArray(setup.itemInstances)?setup.itemInstances:[]).some(o=>ctx.ref(o?.carriedBy)===target&&o?.access==='loose_open');
  const precise=!!row.rayMeters||touch||spells.some(id=>{const spell=ctx.engine.byId.get(id);return spell?.rangeMeters!==undefined&&!['dry','repair','light'].includes(spell.effectSpec?.kind);});
  if(precise&&(!actual||actual.lineOfSight!==row.lineOfSight||!Number.isFinite(actual.distanceMeters)||touch&&(row.distanceMeters<=1.5)!==(actual.distanceMeters<=1.5)||spells.some(id=>{const range=ctx.engine.byId.get(id)?.rangeMeters;return Number.isFinite(range)&&(row.distanceMeters<=range)!==(actual.distanceMeters<=range);})||row.rayMeters&&Math.abs(actual.distanceMeters-row.distanceMeters)>1e-9))return false;
  const targetBody=ctx.actor(target),at=observer==='player'?ctx.document.state.location:ctx.actor(observer)?.location;
  if(row.audible!==undefined){
   if(!targetBody)return false;
   const heard=target==='player'?subjectiveView(ctx.engine,ctx.document,observer).observable.location===ctx.document.state.location:presentWitnesses(ctx.document.state,at).includes(target);
   if(heard!==row.audible)return false;
  }
  const listeners=presentWitnesses(ctx.document.state,at);
  if(ctx.document.state.location===at)listeners.push('player');
  if(row.audibleTo?.some(id=>!listeners.includes(ctx.ref(id))))return false;
  if(row.thirdPartyListeners&&JSON.stringify(listeners.filter(id=>![observer,target].includes(id)).sort())!==JSON.stringify(row.thirdPartyListeners.map(ctx.ref).sort()))return false;
  if(visible){ctx.note(`${item}: verified native perception${precise?' and range boundary':''}; no contact evidence created`);return true;}
 }
 return false;
}
function spatial(ctx,setup,fields){
 for(const field of fields)array(ctx,setup,field,(row,item)=>{
  let valid=false,接点;
  if(field==='zones'){
   valid=id(row.id)&&typeof row.name==='string'&&!!row.name.trim()&&location(ctx,row.location);
   接点='运行期局部分区登记与区域解析（当前解析只读目录 zones/areas）';
  }else if(field==='paths'){
   valid=id(row.id)&&id(row.fromZone)&&id(row.toZone)&&finite(row.distanceMeters)&&typeof row.passable==='boolean'&&(row.blockedBy===undefined||id(row.blockedBy));
   接点='局部路径图、锁/门与拘禁约束的通行消费者';
  }else if(field==='placements'){
   valid=id(row.entity)&&id(row.zone)&&(row.blocksPassage===undefined||typeof row.blocksPassage==='boolean');
   接点='实体的局部分区占位及阻路消费者';
  }else if(field==='positions'){
   valid=id(row.observer)&&id(row.target)&&finite(row.distanceMeters)&&typeof row.lineOfSight==='boolean'&&(row.rayMeters===undefined||Array.isArray(row.rayMeters)&&row.rayMeters.length===2&&row.rayMeters.every(point)&&Math.abs(Math.hypot(row.rayMeters[1][0]-row.rayMeters[0][0],row.rayMeters[1][1]-row.rayMeters[0][1])-row.distanceMeters)<1e-9)&&
    (row.audible===undefined||typeof row.audible==='boolean')&&['audibleTo','thirdPartyListeners'].every(k=>row[k]===undefined||Array.isArray(row[k])&&row[k].every(id));
   // areaTargetFacts requires physical_contact evidence from a real melee or
   // arrival, with a ten-minute expiry. Never forge that occurred event here.
   接点='非接触距离/视线的初始测量证据（magic-context/areaTargetFacts 只接受实际接触证据或目录几何）；听觉范围';
  }else if(field==='obstacles'){
   valid=id(row.id)&&row.kind==='stone_wall'&&Array.isArray(row.segmentMeters)&&row.segmentMeters.length===2&&row.segmentMeters.every(point);
   接点='墙体线段登记与射线遮挡（localSightClear 只读目录环境对象/已有法术几何）';
  }else if(field==='hazards'){
   valid=id(row.id)&&id(row.zone)&&row.kind==='falling_rocks'&&typeof row.active==='boolean';
   接点='局部落石危险区登记及进入危险区的结算消费者';
  }
  if(!valid){ctx.unmet(item,`invalid ${field} declaration`);return;}
  if(verifiedSpatial(ctx,setup,field,row,item))return;
  missing(ctx,item,接点,'01 §1.2；S4');
 });
}

function stats(ctx,actor){
 const body=ctx.actor(actor),base=ctx.document.state.created?.[actor]??ctx.engine.byId.get(actor)??{};
 if(actor==='player')return {...derivedStats(body,ctx.engine.rules),maxHp:body.maxHp,maxMp:body.maxMp};
 if(ctx.document.state.npcs?.[actor])return derivedStats({level:body.level??base.level??1,attributes:base.attributes,profession:!!base.combatProfession},ctx.engine.rules);
 const species=ctx.engine.byId.get(body.species??base.monster);
 return monsterStats({level:body.level??base.level??base.levelRange?.[0]??1,template:base.template??species?.template??2,bossTier:base.tier??0},ctx.engine.rules);
}
function bodies(ctx,setup){
 if(!object(setup.body)){ctx.unmet('body','expected actor to body mapping');return;}
 for(const [alias,row] of Object.entries(setup.body)){
  const actor=ctx.ref(alias),path=actorPath(ctx,actor),item=`body.${alias}`;
  if(!path||!object(row)){ctx.unmet(item,'unknown actor or invalid body mapping');continue;}
  const ordered=Object.entries(row).sort(([a],[b])=>Number(b==='level')-Number(a==='level'));
  for(const [field,value] of ordered){
   const name=`${item}.${field}`;
   if(['satiety','stamina','fatigue','hydration'].includes(field)){
    if(!finite(value,0,100)){ctx.unmet(name,'expected a 0..100 body scale');continue;}
    ctx.native(name,d=>writeBodyNeed(d,ctx.engine,actor,field,value*bodyRule(ctx.engine,field).max/100));
   }else if(field==='mp'||field==='hpDeficit'){
    const derived=stats(ctx,actor),max=field==='mp'?derived.maxMp:ctx.actor(actor).maxHp??derived.maxHp;
    if(!Number.isSafeInteger(value)||!finite(value,0,max)){ctx.unmet(name,'amount exceeds the actual native vital maximum');continue;}
    ctx.native(name,d=>{
     if(field==='mp')holdingSet(d,ctx.engine,[...path,'mp'],value,writer);
     else{
      holdingSet(d,ctx.engine,[...path,'maxHp'],max,writer);
      holdingSet(d,ctx.engine,[...path,'hp'],max-value,writer);
     }
    });
   }else if(field==='level'){
    if(!Number.isSafeInteger(value)||value<0){ctx.unmet(name,'expected a nonnegative integer level');continue;}
    if(actor!=='player'){missing(ctx,name,'非玩家身体等级的完整初始派生','01 §1.2；A §A.15.7');continue;}
    ctx.native(name,d=>{
     const before=ctx.actor(actor),derived=derivedStats({...before,level:value},ctx.engine.rules);
     holdingSet(d,ctx.engine,[...path,'level'],value,writer);
     for(const vital of ['Hp','Mp']){
      const key=vital.toLowerCase(),max=`max${vital}`,deficit=Math.max(0,before[max]-before[key]);
      holdingSet(d,ctx.engine,[...path,max],derived[max],writer);
      holdingSet(d,ctx.engine,[...path,key],Math.max(0,derived[max]-deficit),writer);
     }
    });
   }else if(field==='age'){
    if(!Number.isSafeInteger(value)||value<0){ctx.unmet(name,'expected a nonnegative integer age');continue;}
    const age=actor==='player'?ctx.actor(actor).age:npcAgeAt(ctx.engine,ctx.document.state,actor);
    if(age!==value)missing(ctx,name,'不改作者身份/出生日期的年龄覆盖','01 §1.2；A §A.15.7');
   }else if(field==='conscious'){
    if(typeof value!=='boolean'){ctx.unmet(name,'expected a boolean');continue;}
    const body=ctx.actor(actor),awake=!isPhysicallyDead(ctx.engine,reader(ctx),actor)&&!['昏迷','失能'].includes(body.status)&&!/睡|昏迷/.test(body.activity??'')&&body.capacity!=='none';
    if(value!==awake)missing(ctx,name,'保留死亡、能力与睡眠原因的意识初态设置','01 §1.2；06 §6.3');
   }else if(field==='safeCarryKg'){
    if(!finite(value)){ctx.unmet(name,'expected a nonnegative carry capacity');continue;}
    if(stats(ctx,actor).carryKg!==value)missing(ctx,name,'安全负重上限覆盖（原生上限从力量派生）','01 §1.2；A §A.15.7');
   }else missing(ctx,name,`${field} 身体初态`,'01 §1.2；A §A.15.7');
  }
 }
}
function actors(ctx,setup){
 if(!object(setup.actorStates)){ctx.unmet('actorStates','expected actor to state mapping');return;}
 for(const [alias,row] of Object.entries(setup.actorStates)){
  const actor=ctx.ref(alias),path=actorPath(ctx,actor),item=`actorStates.${alias}`;
  if(!path||!object(row)){ctx.unmet(item,'unknown actor or invalid state mapping');continue;}
  for(const [field,value] of Object.entries(row)){
   const name=`${item}.${field}`;
   if(field==='activity'){
    if(typeof value!=='string'||!value.trim()){ctx.unmet(name,'expected nonempty initial activity');continue;}
    ctx.native(name,d=>holdingSet(d,ctx.engine,[...path,'activity'],value,writer));
   }else if(field==='location'){
    if(!location(ctx,value)){ctx.unmet(name,'unknown actor location');continue;}
    if(ctx.actor(actor).scheduleTravel||ctx.actor(actor).cognitionTravel){ctx.unmet(name,'actor has an active journey; location alone cannot cancel it');continue;}
    ctx.native(name,d=>{
     holdingSet(d,ctx.engine,actor==='player'?['state','location']:[...path,'location'],value,writer);
     setLocation(d,{entity:actor,at:value,mode:'place',writer,engine:ctx.engine});
    });
   }else missing(ctx,name,`${field} 的活动/朝向/听觉初态及感知消费者（不授予服务权）`,'06 §6.3；S4');
  }
 }
}

registerSetupLoader({fields:['itemInstances','objects'],order:40,load(ctx,setup,fields){
 for(const field of fields)array(ctx,setup,field,(row,item)=>(field==='itemInstances'?instance:physicalObject)(ctx,row,item));
}});
registerSetupLoader({fields:['accounts'],rows:{accounts:row=>object(row)&&row.container!==undefined},order:45,load(ctx,setup){
 array(ctx,setup,'accounts',(row,item)=>{
  const actor=ctx.ref(row.owner),container=ctx.ref(row.container),source=ctx.document.state.records?.[ctx.ref(row.sourceEvent)];
  if(Object.keys(row).some(k=>!['owner','resource','purpose','balance','sourceEvent','container','balanceMode'].includes(k))||row.resource!=='coin_river'||row.purpose!=='purse'||!Number.isSafeInteger(row.balance)||row.balance<0||!ctx.actor(actor)||![undefined,'ensure_existing'].includes(row.balanceMode)||source?.category!=='world_event'||source.verb!=='opening_balance'||source.payload?.owner!==actor||source.payload.resource!==row.resource||source.payload.balance!==row.balance){ctx.unmet(item,'invalid purse snapshot or mismatched native opening balance event');return;}
  ctx.native(item,d=>{
   const account=bindPurse(d,ctx.engine,container,actor);
   if(account!==partyAccount(ctx.engine,d.document.state,actor))throw Error('Purse does not refer to the original cash account');
   if(row.balanceMode!=='ensure_existing')mirrorPartyCoins(d,ctx.engine,actor,row.balance-(legacyMoney(ctx.engine,d.document.state).get(account)??0),source.id,writer);
  });
 });
}});
registerSetupLoader({fields:['zones','paths','placements','positions','obstacles','hazards'],order:90,load:spatial});
registerSetupLoader({fields:['body','actorStates'],order:60,load(ctx,setup,fields){
 for(const field of fields)(field==='body'?bodies:actors)(ctx,setup);
}});
