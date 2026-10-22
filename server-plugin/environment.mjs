import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {declareHoldingWriter,holdingSet,setLocation,aliveHoldings,locationOf} from './holdings.mjs';
import {physicalItem,writePhysicalItem,equipPhysicalItem,wornItems,physicalLocation,consumeLiquid,purseAccount,containerUnits,takeContainerUnit,reconcileContainerWater,releaseContainerWater} from './items.mjs';
import {authority} from './action-authority.mjs';
import {consent} from './action-consent.mjs';
import {moveCoins,partyAccount,mirrorPartyCoins} from './money.mjs';
declareHoldingWriter('environment',{kinds:[],locations:true});
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('environment',{sinks:['sink:consume']});
import {facilityView,isFacility} from './facility-state.mjs';
import {applyInteraction} from './interactions.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
import {inspectCare}from'./magic-care.mjs';
import {inspectMindSpace,inspectMindCarrier,assertMindSpacePath,unlockMindSpaceDoor,assertMindAwake}from'./magic-mind-space.mjs';
import {normalize}from'./retrieval.mjs';
import {mechanismRule,liquidItem}from'./domain-rules.mjs';
import {prunePhysicalContacts} from './record-cleanup.mjs';
import {waterMechanisms}from'../world/design/water-foundation.mjs';
import {addObjectFuel,inspectObjectProcess,touchWarmObject,douseObjectFire,assertFirePath}from'./magic-object.mjs';
import{inspectMagicMarks}from'./magic-marks.mjs';
import {assertLiquidWater}from'./interactions.mjs';
import {airEnvironmentAction}from'./magic-air.mjs';
import {waterEarthSightClear,waterEarthFlow,waterEarthWalkMinutes,assertWaterEarthMovement,inspectWaterEarth}from'./magic-water-earth.mjs';
import {opticalSightClear,opticalVisibility,inspectLight,normalLightAction,assertLightMovement}from'./magic-light.mjs';

const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw preconditionFailure(`${label}无效`);return value;};
const key=id=>`physical_feature:${id}`;
import {environmentFeatures,localPlayerPoint} from './environment-state.mjs';
import {initialKnowledgeAction} from './primitives-learning.mjs';
export {environmentFeatures,localPlayerPoint} from './environment-state.mjs';
// Native restoration of a catalog object's current placement and state. The
// source is retained as provenance; restoring it does not replay the event.
export function writeEnvironmentPremise(d,engine,id,{location,carriedBy,state,source}={}){
 const row=environmentFeatures(engine,d.document).find(r=>r.id===id);
 if(!row)throw Error('Unknown catalog environment object');
 if(source){
  const event=d.get('state','records',source);
  if(event?.category!=='world_event'||!Number.isSafeInteger(event.minute)||event.minute>d.get('state','minute')||(event.payload?.subject??event.target)!==id||location!==undefined&&event.payload?.location!==location)throw Error('Unknown or mismatched environment source event');
 }
 if(location!==undefined&&!engine.world.locations.some(p=>p.id===location))throw Error('Unknown object location');
 if(state!==undefined){
  if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Invalid environment state');
  for(const field of ['capacityMl','waterMl','reservedWaterMl','saltMg','toxinUg','pathogenRisk','turbidity','blockagePercent'])if(state[field]!==undefined&&(!Number.isFinite(state[field])||state[field]<0))throw Error(`Invalid environment ${field}`);
  if(state.waterMl!==undefined&&(!Number.isSafeInteger(state.waterMl)||!Number.isSafeInteger(state.capacityMl)||state.capacityMl<=0||state.waterMl+(state.reservedWaterMl??0)>state.capacityMl))throw Error('Invalid environment water capacity');
  if(['pathogenRisk','turbidity','blockagePercent'].some(k=>state[k]>100))throw Error('Invalid environment percentage');
 }
 const identity=d.get('state','itemInstances',id);
 if(identity&&!identity.physicalFeature)throw Error('Catalog endpoint conflicts with an inventory unit');
 if(!identity)holdingSet(d,engine,['state','itemInstances',id],{id,physicalFeature:true,name:row.name},'environment');
 if(carriedBy!==undefined&&carriedBy!==null){
  const at=carriedBy==='player'?d.get('state','location'):d.get('state','npcs',carriedBy,'location');
  if(!at||location!==undefined&&at!==location)throw Error('Object carrier and location conflict');
  setLocation(d,{entity:id,at:carriedBy,mode:'carried',writer:'environment',source,engine});
 }else if(location!==undefined)setLocation(d,{entity:id,at:location,mode:'place',writer:'environment',source,engine});
 const previous=d.get('state','records',key(id));
 holdingSet(d,engine,['state','records',key(id)],{...previous,id,category:'physical_feature',location:location??row.location,state:structuredClone(state??previous?.state??row.state),...(source?{source}:{})},'environment');
 return id;
}
function interactPhysicalItem(d,engine,args,eventId){
 const id=args.target,record=d.get('state','records',`physical_item:${id}`),operation=args.operation??'inspect';
 if(!record&&operation==='take_contents'&&d.get('state','records',key(id))){
  const row=environmentFeatures(engine,d.document).find(f=>f.id===id);if(!row)throw Error('Unknown container');
  inReach(d,row,1.5);permission(d,engine,row,args);
  return {id,...takeContainerUnit(d,engine,id,args.instance,'player',eventId)};
 }
 if(!record)return null;
 const facts=physicalItem(d,engine,id),here=physicalLocation(d,engine,id)===d.get('state','location');
 if(!here)throw Error('Physical item is not present');
 if(operation==='inspect'){
  const purse=d.get('state','records',`purse:${id}`),contents=d.get('state','records',`contents:${id}`);
  return {id,name:facts.name,physical:structuredClone(record.facts),worn:Object.entries(wornItems(d,engine,'player')).find(([,v])=>v===id)?.[0]??null,
   ...(purse?{account:purseAccount(d,engine,id),access:facts.access}:{}),
   ...(contents?{contents:contents.entries.map(e=>({quantity:e.quantity,drinkable:e.drinkable,...(e.identityKnownToPlayer?{resource:e.resource}:{identity:'unknown'})}))}:{}),units:containerUnits(d,id).map(u=>({instance:u.id,item:u.item})),actionScope:{kind:'instant',instantaneous:true}};
 }
 if(!['wear','unwear','disarm','unlock','tie','drink_contents','take_contents','transfer_purse','douse_fire'].includes(operation))return null;
 if(args.actor!==undefined||args.success!==undefined||args.difficulty!==undefined)throw Error('Physical action cannot supply actor or outcome');
 let mutationAuthority=authority({engine,document:d.document},'player','fact.set',id);
 if(!mutationAuthority.allowed)mutationAuthority=authority({engine,document:d.document},'player',operation,id);
 if(!mutationAuthority.allowed)throw Error(mutationAuthority.reason??'Physical item authority required');
 if(operation==='wear'||operation==='unwear')return {id,slots:equipPhysicalItem(d,engine,'player',id,{slot:args.slot,remove:operation==='unwear',eventId})};
 const p=locationOf(d,id),contact=p?.mode==='carried'&&p.at==='player'?{lineOfSight:true,distanceMeters:0}:engine.primitiveTargetFacts(d,'player',id);
 if(!contact?.lineOfSight||!Number.isFinite(contact.distanceMeters)||contact.distanceMeters>1.5)throw Error('Physical contact distance is not established');
 if(operation==='drink_contents')return {id,...consumeLiquid(d,engine,id,args.resource,args.quantity??1,{eventId})};
 if(operation==='take_contents')return {id,...takeContainerUnit(d,engine,id,args.instance,'player',eventId)};
 if(operation==='transfer_purse'){
  const from=purseAccount(d,engine,id),to=args.to;
  if(facts.access!=='loose_open')throw Error('Purse is not open for access');
  if(!authority({engine,document:d.document},'player','transfer',from).allowed)throw Error('The original cash account requires its own authority');
  if(to!=='player'&&!d.get('state','npcs',to)||physicalLocation(d,engine,to)!==d.get('state','location'))throw Error('Cash recipient is not present');
  integer(args.coins,1,100000,'现金数量');
  const destination=partyAccount(engine,d.document.state,to),owner=d.get('state','records',`purse:${id}`,'actor');
  if(from===destination)throw Error('Cash transfer endpoints must differ');
  moveCoins(d,{from,to:destination,amount:args.coins,writer:'environment',eventId});
  mirrorPartyCoins(d,engine,owner,-args.coins,eventId,'environment');
  mirrorPartyCoins(d,engine,to,args.coins,eventId,'environment');
  return {id,from,to,coins:args.coins};
 }
 if(operation==='tie'){
  const branch=physicalItem(d,engine,args.destination);
  if(!facts.attachedLaces||branch.reachable!==true||physicalLocation(d,engine,args.destination)!==d.get('state','location'))throw Error('Tying requires attached laces and a reachable physical support');
  const allowed=authority({engine,document:d.document},'player','fact.set',args.destination);
  if(!allowed.allowed)throw Error('Support authority required');
  setLocation(d,{entity:id,at:args.destination,mode:'container',writer:'environment',engine,source:eventId});return {id,attachedTo:args.destination};
 }
 if(operation==='douse_fire'){
  const water=liquidItem(engine,'water');
  if(facts.fireIntensity!==1||!water||engine.quantity(d,'player',water)<1)throw Error('This dousing action requires a microfire and one existing water unit; larger fires require the thermal model');
  engine.itemDelta(d,'player',water,-1,{flow:'sink:consume',purpose:'douse',writer:'environment',eventId});
  writePhysicalItem(d,engine,id,{fireIntensity:0},{eventId});engine.advance(d,1,eventId);return {id,fireIntensity:0,minutes:1};
 }
 const mechanism=mechanismRule(engine,facts.mechanism),field=mechanism?.state;
 if(!mechanism||mechanism.operation!==operation||facts[field]!==true||mechanism.requiresIdentified&&facts.identified!==true)throw Error('No identified supported mechanism');
 const tool=mechanism.tool;
 if(engine.quantity(d,'player',tool)<1)throw Error('Mechanism requires its actual tool');
 const rules=engine.world.openActionRules?.generic;
 if(!rules)throw Error('Missing native physical work rules');
 const check=engine.check(d,{attribute:'敏捷',difficulty:rules.physicalDifficulty,tools:[tool]},eventId);
 engine.advance(d,rules.physicalMinutes,eventId);
 if(check.success&&physicalLocation(d,engine,id)===d.get('state','location'))writePhysicalItem(d,engine,id,{[field]:false},{eventId});
 const current=physicalItem(d,engine,id)[field],success=check.success&&current===false;
 return {id,target:id,...check,check,success,status:success?'已解除':'未解除',[field]:current,minutes:rules.physicalMinutes};
}
// The existing registered site-disarm action consumes an authored generic
// mechanism as well as the site's older fixed mechanism catalog. Do not turn
// an unknown or ambiguous name into a replacement trap.
export function physicalSiteAction(d,engine,tool,args,eventId){
 if(tool!=='site'||args.operation!=='disarm')return null;
 const nodes=Object.values(d.get('state','records')??{}).filter(r=>r.category==='physical_item'&&r.facts.physicalKind==='node'&&physicalLocation(d,engine,r.id)===d.get('state','location'));
 const matches=nodes.filter(r=>{
  const item=physicalItem(d,engine,r.id);return [r.id,item.name,...item.aliases??[]].includes(args.target);
 });
 if(matches.length>1)throw Error('Ambiguous physical mechanism target');
 if(!matches.length)return null;
 initialKnowledgeAction(d,engine,tool,{...args,target:matches[0].id});
 return interactPhysicalItem(d,engine,{...args,operation:'disarm',target:matches[0].id},eventId);
}
function feature(engine,name,location,document){
    const matches=environmentFeatures(engine,document).filter(row=>row.id===name||row.location===location&&[row.name,...row.aliases??[]].some(label=>normalize(label)===normalize(name??'')));
    if(matches.length!==1)throw new Error(matches.length?'环境对象称呼有歧义':'环境对象未登记');return matches[0];
}
const stateOf=(d,row)=>{
    const record=d.get('state','records',key(row.id));
    if(record&&(record.category!=='physical_feature'||record.id!==row.id))throw Error('环境动态状态的登记键发生冲突，拒绝覆盖');
    return record?.state??row.state;
};
const store=(d,row,state)=>{if(state.waterMl!==undefined)reconcileContainerWater(d,row.id,state.waterMl);d.set(['state','records',key(row.id)],{id:row.id,category:'physical_feature',location:row.location,state});};
const point=localPlayerPoint;
// A successful melee exchange supplies contact evidence, never mere co-presence.
export function recordLocalContact(d,engine,target,eventId){
    const location=d.get('state','location'),actor=d.get('state',target.startsWith('npc_')?'npcs':'creatures',target),position=point(d);
    if(!actor||actor.location!==location||actor.scheduleTravel||actor.cognitionTravel||!localSightClear(d,engine,location,position,position))return false;
    const source=`physical_contact:${eventId}:${target}`,minute=d.get('state','minute'),expires=minute+10;
    const elevation=d.get('state','records','local_player_position','elevationMeters');
    const height=Number.isFinite(elevation)?{elevationMeters:elevation}:{};
    const evidence={category:'physical_contact',subject:target,location,point:[...position],visibleFrom:[...position],event:eventId,minute,expires,activity:actor.activity??null,...height};
    d.set(['state','records',source],evidence);
    prunePhysicalContacts(d);
    d.set(['state','records',`local_actor_position:${target}`],{category:'local_position',subject:target,location,point:[...position],source,minute,expires,activity:actor.activity??null,...height});
    return true;
}
export function localSightClear(d,engine,location,from,to,{waterCurtain=true,optical=true,fog=true}={}){
    if(waterCurtain&&!waterEarthSightClear(d,location,from,to))return false;
    if(optical&&!opticalSightClear(d,engine,location,from,to))return false;
    if(fog&&!opticalVisibility(d,engine,location,from,to))return false;
    for(const row of environmentFeatures(engine,d.document).filter(f=>f.location===location)){
        const state=stateOf(d,row);if(state?.blocksSight!==true)continue;
        const radius=state.sightRadiusMeters;
        if(!Number.isFinite(radius)||radius<0)return false;
        const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
        const t=length?Math.max(0,Math.min(1,((row.position[0]-from[0])*dx+(row.position[1]-from[1])*dy)/length)):0;
        if(Math.hypot(row.position[0]-from[0]-t*dx,row.position[1]-from[1]-t*dy)<=radius)return false;
    }
    return true;
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function inReach(d,row,range){
    if(row.location!==d.get('state','location'))throw preconditionFailure('环境对象不在当前位置');
    if(distance(point(d),row.position)>range)throw preconditionFailure('环境对象超过实际施法距离');
}
function permission(d,engine,row,args,{spell=null,until=d.get('state','minute')}={}){
    if(row.owner==='player'||row.access==='public')return;
    if(spell&&consent({engine,document:d.document},row.owner,'player','cast',{purpose:spell,subject:row.id,terms:{spell,waterBatch:'current'},until,onRefusal:'abort'}).allowed)return;
    const keys=args.authorizations??[];
    if(!Array.isArray(keys)||keys.length>8)throw preconditionFailure('环境授权编号列表无效');
    const authorization=[args.authorization,...keys].filter(Boolean).map(id=>d.get('state','records',id)).find(record=>record?.subject===row.id);
    if(!authorization||authorization.category!=='authorization'||authorization.subject!==row.id||authorization.action!=='environment_use'||
        authorization.grantor!==row.owner||authorization.expires!==undefined&&authorization.expires<=d.get('state','minute'))reject('E-ACTION-OWNER-AUTHORITY','私人环境对象需要有效所有者授权',{missing:['需要所有者的有效授权'],repair:['先取得所有者对该环境对象的有效授权']});
    if(row.owner.startsWith('npc_')&&(!isEffective(engine,d,row.owner)||d.get('state','npcs',row.owner,'status')==='濒死'))throw preconditionFailure('对象所有者无法继续履约');
}
function visible(row,state){
    const out={id:row.id,name:row.name,kind:row.kind,owner:row.owner,access:row.access,position:[...row.position],links:{...row.links??{}}};
    for(const name of['capacityMl','waterMl','nutrientMg','growthConsumedWaterMl','growthConsumedNutrientMg','turbidity','odor','siltGrams','loosenedSiltGrams','blockagePercent','flowLimitMl','moisturePercent'])if(state[name]!==undefined)out[name]=state[name];
    if(state.air)out.air=structuredClone(state.air);
    for(const field of ['looseDustMg','stainMg','moistureMg','evaporatedMg','turned','exposed','heightMeters','displacementMeters','integrity','material','deployed','torn','fallHeightMeters'])if(state[field]!==undefined)out[field]=state[field];
    if(state.charcoalTrace)out.charcoalTrace=structuredClone(state.charcoalTrace);
    if(state.waterMl!==undefined)out.waterSafety='毒素和病原尚未检验；外观清澈不等于可安全饮用';return out;
}
import {forestView} from './forest-water.mjs';
import {basinForLocation,basinState,waterBasins} from './water-cycle.mjs';
export function environmentCatalog(engine,document,{entity}={}){
    const d={get:(...path)=>path.reduce((v,k)=>v?.[k],document)},location=document.state.location;
    if(entity){
        const row=environmentFeatures(engine,document).find(r=>r.id===entity);
        if(!row)throw preconditionFailure('环境对象未登记');inReach(d,row,Number.POSITIVE_INFINITY);return visible(row,stateOf(d,row));
    }
    const forest=forestView(engine,document.state,location),basin=basinForLocation(engine,location,waterBasins(engine,document.state)),water=basin&&basinState(engine,document.state,basin);
    return{kind:'feature',entries:environmentFeatures(engine,document).filter(row=>row.location===location).map(row=>visible(row,stateOf(d,row))),
        ...(forest?{forest}:{}),...(basin?{watershed:{id:basin.id,location:basin.location,waterMl:water.waterMl,capacityMl:water.capacityMl}}:{})};
}
export function servantCarryWater(d,args,maximumMl,inspectOnly=false){
    const source=feature(this,args.source,d.get('state','location'),d.document),destination=feature(this,args.destination,d.get('state','location'),d.document);
    if(source.id===destination.id)throw preconditionFailure('源与目标容器不能相同');
    if(!['water','container'].includes(source.kind)||destination.kind!=='container')throw preconditionFailure('役灵只能从水源或容器搬水到真实容器');
    for(const row of[source,destination]){inReach(d,row,3);permission(d,this,row,args);}
    assertLiquidWater(this,d,source);
    const src=structuredClone(stateOf(d,source)),dst=structuredClone(stateOf(d,destination));
    const amount=integer(args.millilitres,1,maximumMl,'搬水量');
    if(src.waterMl<amount||dst.capacityMl-dst.waterMl-(dst.reservedWaterMl??0)<amount)throw preconditionFailure('水源不足或目标容器容量不足');
    if(inspectOnly)return{source:source.id,destination:destination.id,amountMl:amount};
    for(const field of['saltMg','toxinUg']){const moved=src[field]*amount/src.waterMl;src[field]-=moved;dst[field]+=moved;}
    dst.turbidity=(dst.turbidity*dst.waterMl+src.turbidity*amount)/(dst.waterMl+amount);
    dst.pathogenRisk=Math.max(dst.pathogenRisk,src.pathogenRisk);dst.odor=src.odor;
    src.waterMl-=amount;dst.waterMl+=amount;store(d,source,src);store(d,destination,dst);
    return{source:source.id,destination:destination.id,amountMl:amount,sourceRemainingMl:src.waterMl,destinationWaterMl:dst.waterMl,
        safety:'仅搬运原水，污染随水移动，未净化或消毒'};
}
export function validateEnvironmentCatalog(catalog){
    const spec=catalog.effectSpec,mechanic=waterMechanisms[spec?.operation],errors=[];
    if(!mechanic)return['环境法术机制尚未接入'];
    if(catalog.mechanism!==spec.operation)errors.push('环境法术机制与处理器不一致');
    if(spec.power>mechanic.power||spec.unit!==mechanic.unit)errors.push('环境法术强度或计量单位越过机制边界');
    if(catalog.duration!==mechanic.duration)errors.push('环境法术持续时间与机制不符');
    if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>40)errors.push('环境法术距离无效');
    return errors;
}
function watering(d,engine,row,operation,args,range,power){
    // A bucket beside a working channel is a real destination too. Derive the
    // unique existing channel from its source; never invent a water account.
    const intoContainer=operation==='irrigate'&&row.kind==='container';
    const channels=intoContainer?environmentFeatures(engine,d.document).filter(f=>f.kind==='channel'&&f.location===row.location&&f.links?.source===args.source):[];
    const channel=intoContainer?(channels.length===1?channels[0]:{}):operation==='irrigate'?row:feature(engine,row.links?.channel,d.get('state','location'),d.document);
    if(channel.kind!=='channel')reject('E-ACTION-CHANNEL','缺少真实引水沟',{missing:['需要真实存在的引水沟'],repair:['先修建引水沟，再选择其真实编号引水']});
    const source=feature(engine,channel.links?.source,d.get('state','location'),d.document),
        destination=intoContainer?row:feature(engine,channel.links?.destination,d.get('state','location'),d.document);
    if(source.kind!=='water'||!['soil',...(intoContainer?['container']:[])].includes(destination.kind)||operation==='soil_water'&&destination.id!==row.id||args.source&&args.source!==source.id)throw preconditionFailure('沟渠源头或目标田垄不匹配');
    for(const target of[channel,source,destination]){inReach(d,target,range);permission(d,engine,target,args);}
    assertLiquidWater(engine,d,source);
    const ch=stateOf(d,channel),src=stateOf(d,source),dst=stateOf(d,destination);
    if(operation==='soil_water'&&!dst.worked)throw preconditionFailure('回潮前需要耕作者实际处理土壤');
    const requested=args.millilitres===undefined?power*1000:integer(args.millilitres,1,power*1000,'引水量');
    const amountMl=Math.floor(Math.min(requested,src.waterMl,dst.capacityMl-dst.waterMl-(dst.reservedWaterMl??0),waterEarthFlow(d,channel,ch)*(1-ch.blockagePercent/100)));
    if(amountMl<=0)reject('E-ACTION-WATER-FLOW','水源不足、田垄已满或沟渠被堵住',{missing:['需要足够的原水、目标余量与畅通沟渠'],repair:['先检查水源和目标容量，实际清淤后再引水']});
    return{channel,source,destination,amountMl};
}
export function prepareEnvironmentMagic(d,catalog,args){
    if(!this.rules.environment)throw preconditionFailure('此世界尚无环境规则');
    const row=feature(this,args.target,d.get('state','location'),d.document),spec=catalog.effectSpec;
    inReach(d,row,catalog.rangeMeters);if(spec.operation!=='sense_water')permission(d,this,row,args,{spell:catalog.id,until:d.get('state','minute')+(catalog.minutes??0)});
    const current=stateOf(d,row),operation=spec.operation;
    if(['condense','clean_water','sense_water'].includes(operation)&&!['container','water'].includes(row.kind))throw preconditionFailure('法术需要实际水源或容器');
    if(operation==='condense'){
        if(row.kind!=='container')throw preconditionFailure('凝露需要有杯壁的真实容器');
        const humidity=humidityAt(this,d.document,row.location);
        if(!Number.isFinite(humidity)||humidity<this.rules.environment.minimumCondensationHumidity||humidity>100)throw preconditionFailure('空气湿度不足或没有可靠湿度数据');
        if(current.waterMl+(current.reservedWaterMl??0)>=current.capacityMl)throw preconditionFailure('容器已满');
    }
    if(['clean_water','sense_water'].includes(operation)&&current.waterMl<=0)throw preconditionFailure('对象中没有实际水');
    if(operation==='clear_silt'&&(row.kind!=='channel'||current.loosenedSiltGrams>=current.siltGrams))throw preconditionFailure('沟渠没有可继续松动的淤泥');
    if(['irrigate','soil_water'].includes(operation))watering(d,this,row,operation,args,catalog.rangeMeters,spec.power);
    return{target:row.id,spec,catalog,environment:{...args,target:row.id}};
}
export function applyEnvironmentMagic(d,prepared,eventId){
    let valid;try{valid=prepareEnvironmentMagic.call(this,d,prepared.catalog,prepared.environment);}catch(error){return{target:prepared.target,effectFailed:error.message};}
    const row=feature(this,valid.target,d.get('state','location'),d.document),current=structuredClone(stateOf(d,row)),{operation,power}=valid.spec;
    if(operation==='sense_water')return{target:row.id,observation:{salinityPpt:current.saltMg/current.waterMl,odor:current.odor,turbidity:current.turbidity,
        limits:'只辨盐分与气味，未检验毒素或病原，不能据此判断饮水安全'}};
    const before=visible(row,current);let result;
    if(operation==='condense'){
        const humidity=humidityAt(this,d.document,row.location);
        const amountMl=Math.min(current.capacityMl-current.waterMl-(current.reservedWaterMl??0),Math.floor(power*humidity/100));
        current.turbidity=current.waterMl?current.turbidity*current.waterMl/(current.waterMl+amountMl):0;current.waterMl+=amountMl;
        current.atmosphericInputsMl=(current.atmosphericInputsMl??0)+amountMl;result={condensedMl:amountMl};
    }else if(operation==='clean_water'){
        const removed=Math.min(current.turbidity,power);current.turbidity-=removed;result={removedTurbidity:removed,safety:'仅去悬浮污物；毒素和病原未被清除'};
    }else if(operation==='clear_silt'){
        const loosened=Math.min(power,current.siltGrams-current.loosenedSiltGrams);current.loosenedSiltGrams+=loosened;
        result={loosenedGrams:loosened,removedGrams:0,note:'泥仍在沟中，实际搬运后才减少堵塞'};
    }else{
        const transfer=watering(d,this,row,operation,prepared.environment,prepared.catalog.rangeMeters,power),src=structuredClone(stateOf(d,transfer.source)),dst=structuredClone(stateOf(d,transfer.destination)),amount=transfer.amountMl;
        const salt=src.saltMg*amount/src.waterMl,toxin=src.toxinUg*amount/src.waterMl;
        dst.turbidity=(dst.turbidity*dst.waterMl+src.turbidity*amount)/(dst.waterMl+amount);
        dst.pathogenRisk=Math.max(dst.pathogenRisk,src.pathogenRisk);dst.waterMl+=amount;dst.saltMg+=salt;dst.toxinUg+=toxin;
        if(transfer.destination.kind==='soil')dst.moisturePercent=Math.min(100,dst.baseMoisturePercent+100*dst.waterMl/dst.capacityMl);
        src.waterMl-=amount;src.saltMg-=salt;src.toxinUg-=toxin;
        store(d,transfer.source,src);store(d,transfer.destination,dst);
        return{target:row.id,movedMl:amount,source:transfer.source.id,destination:transfer.destination.id,destinationOwner:transfer.destination.owner,
            sourceWaterMl:src.waterMl,destinationWaterMl:dst.waterMl,...(transfer.destination.kind==='soil'?{moisturePercent:dst.moisturePercent}:{}),
            factSummary:`实际只移动${amount}毫升水到${transfer.destination.name}，剩余${src.waterMl}毫升仍留在原水源。沟渠未另存任何水；目标现在${dst.waterMl}毫升${transfer.destination.kind==='soil'?`，湿度${dst.moisturePercent}%`:''}。`,
            note:'只转移既有水；污染物随水转移，未获得消毒或净化效果'};
    }
    store(d,row,current);return{target:row.id,...result,before,after:visible(row,current),sourceEvent:eventId};
}

export function interactEnvironment(d,args,eventId){
    const location=d.get('state','location'),operation=args.operation??'inspect';
    const physical=interactPhysicalItem(d,this,args,eventId);if(physical)return physical;
    const building=args.target&&(d.get('state','created',args.target)??this.byId.get(args.target));
    if(isFacility(building)){
        if(building.id!==location&&building.parent!==location)throw preconditionFailure('建筑不在近旁');
        if(operation==='inspect')return {facility:facilityView(this,d.get('state'),building.id),actionScope:{kind:'instant',instantaneous:true}};
        if(operation==='douse_fire'){
            const water=liquidItem(this,'water');
            if(!water||this.quantity(d,'player',water)<1)throw preconditionFailure('没有可用来灭火的水');
            this.itemDelta(d,'player',water,-1,{flow:'sink:consume',purpose:'douse',writer:'environment',eventId});
            const changed=applyInteraction(d,this,{agent:'water',target:building.id});this.advance(d,1,eventId);return {target:building.id,...changed,minutes:1};
        }
    }
    const lightAction=normalLightAction.call(this,d,args);if(lightAction)return lightAction;
    if(['turn_grain','sound','fall','breathe'].includes(operation))return airEnvironmentAction.call(this,d,args,eventId);
    if(operation==='inspect'){
        const carrier=inspectMindCarrier(d,this,args);if(carrier)return carrier;
        if(args.target){const care=inspectCare(d,this,args);if(care)return{care,actionScope:{kind:'instant',instantaneous:true}};}
        const result=environmentCatalog(this,d.document,{entity:args.target});
        if(!args.target)return result;
        const row=feature(this,args.target,location,d.document),check=Object.values(d.get('state','effects')??{}).some(e=>e.kind==='water_earth'&&e.operation==='mud_seal'&&e.target===row.id&&e.expires>d.get('state','minute'));
        if(check){inReach(d,row,3);permission(d,this,row,args);}
        return{...result,waterEarth:inspectWaterEarth(d,this,row,{check}),light:inspectLight(d,this,row),mindSpace:inspectMindSpace(d,this,row),actionScope:{kind:'instant',instantaneous:true}};
    }
    if(operation==='inspect_heat')return{...inspectObjectProcess(d,this,args.target,args),actionScope:{kind:'instant',instantaneous:true}};
    if(operation==='warm_touch')return{...touchWarmObject(d,this,args),actionScope:{kind:'instant',instantaneous:true}};
    if(operation==='douse_fire'){
        if(args.source)releaseContainerWater(d,args.source,eventId);
        const result=douseObjectFire(d,this,args);this.advance(d,1,eventId);return{...result,minutes:1};
    }
    if(operation==='inspect_marks'){
        const target=args.target?.startsWith('feature_')?args.target:this.resolve(args.target,'item');
        return{marks:inspectMagicMarks(d,this,{...args,target},this.magicStatusContext(d,'player')),actionScope:{kind:'instant',instantaneous:true}};
    }
    if(!this.rules.environment)throw preconditionFailure('此世界尚无环境操作规则');
    if(operation==='load_fuel'){
        const item=this.resolve(args.item,'item'),result=addObjectFuel(d,this,{...args,item},eventId);
        this.advance(d,1,eventId);return{...result,minutes:1,note:'燃料已从自有库存转入炉具；搬放经过一分钟，燃烧按实际时间继续'};
    }
    const row=feature(this,args.target,location,d.document);inReach(d,row,Number.POSITIVE_INFINITY);
    if(operation==='approach'){
        assertMindAwake(d);
        unlockMindSpaceDoor(d,this,args);
        assertMindSpacePath(d,this,location,point(d),row.position);
        assertWaterEarthMovement(d);
        assertLightMovement(d,this);
        assertFirePath(d,this,point(d),row.position);
        const metres=distance(point(d),row.position),mudMinutes=waterEarthWalkMinutes(d,this,point(d),row.position),minutes=Math.ceil(metres/this.rules.environment.walkingMetresPerMinute)+mudMinutes;
        this.advance(d,minutes,eventId);
        if(d.get('state','location')!==location||d.get('state','player','status')!=='正常')return{target:row.id,metres,minutes,arrived:false};
        assertFirePath(d,this,point(d),row.position);
        const height=row.kind==='ledge'?{elevationMeters:stateOf(d,row).fallHeightMeters}:{};
        assertMindSpacePath(d,this,location,point(d),row.position,{eventId,signal:true});
        d.set(['state','records','local_player_position'],{category:'local_position',subject:'player',location,point:[...row.position],source:eventId,anchor:row.id,minute:d.get('state','minute'),...height});
        return{target:row.id,metres,minutes,mudMinutes,position:[...row.position]};
    }
    if(operation!=='carry_silt')throw preconditionFailure('环境操作需为inspect、inspect_heat、load_fuel、approach或carry_silt');
    const destination=feature(this,args.destination,location,d.document),range=3;
    if(row.kind!=='channel'||destination.kind!=='silt_heap')throw preconditionFailure('搬泥需要引水沟及登记堆泥处');
    for(const target of[row,destination]){inReach(d,target,range);permission(d,this,target,args);}
    const amount=integer(args.grams??this.rules.environment.carrySiltMaximumGrams,1,this.rules.environment.carrySiltMaximumGrams,'单次搬泥重量');
    if(stateOf(d,row).loosenedSiltGrams<amount)throw preconditionFailure('没有足够松动的淤泥可以搬走');
    const outcome=this.check(d,{attribute:'力量',difficulty:10},eventId),minutes=this.rules.environment.carrySiltMinutes;
    this.advance(d,minutes,eventId);
    if(outcome.success){
        try{for(const target of[row,destination])permission(d,this,target,args);}
        catch(error){return{operation,...outcome,checkSuccess:true,success:false,removedGrams:0,minutes,completionFailure:error.message};}
        const src=structuredClone(stateOf(d,row)),dst=structuredClone(stateOf(d,destination));
        src.siltGrams-=amount;src.loosenedSiltGrams-=amount;dst.siltGrams+=amount;
        src.blockagePercent=src.initialSiltGrams?Math.min(100,src.initialBlockagePercent*src.siltGrams/src.initialSiltGrams):0;
        store(d,row,src);store(d,destination,dst);
    }
    return{operation,...outcome,removedGrams:outcome.success?amount:0,minutes,target:row.id,destination:destination.id};
}
import {humidityAt}from'./weather.mjs';
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['environment'],validate:validateEnvironmentCatalog,prepare(d,c,args){return prepareEnvironmentMagic.call(this,d,c,args);},apply(d,p,id){return applyEnvironmentMagic.call(this,d,p,id);}});
