import {registerMagicEffect}from'./magic-effects.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear} from './environment.mjs';
import {localWeather} from './weather.mjs';
import {areaTargetFacts} from './magic-area.mjs';
import {normalize} from './retrieval.mjs';
import {advanceAirMinute}from'./magic-air.mjs';
import {precipitationAt} from './weather.mjs';
import {featureTraits} from './traits.mjs';
import {assertSpellConsent}from'./magic-consent.mjs';
import {resolveInteraction,applyInteraction,assertLiquidWater} from './interactions.mjs';

const ops=new Set(['ignite','extinguish','heat','cool','dry','sense_heat','fuel','forge_heat','craft_heat']);
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${label}无效`);return n;};
const clone=x=>structuredClone(x),recordKey=id=>`physical_feature:${id}`;
export function validateObjectCatalog(catalog){
 const s=catalog.effectSpec,errors=[];
 if(s?.kind!=='object'||!ops.has(s.operation))return ['物件工艺操作尚未接入'];
 if(!Number.isSafeInteger(s.power)||s.power<1||s.power>5000)errors.push('物件工艺强度非法');
 if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>3)errors.push('物件工艺距离须在0至3米');
 if(s.operation==='sense_heat'&&catalog.rangeMeters!==0)errors.push('测温须直接接触，不可隔空读取');
 if(['fuel','forge_heat','craft_heat'].includes(s.operation)){
  if(s.operation==='fuel'&&s.power>100)errors.push('节燃上限为百分之十');
  if(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>60)errors.push('节燃持续时间须在1至60分钟');
 }else if(catalog.duration!==0)errors.push('此物件工艺操作是瞬时效果');
 if(['heat','cool','dry','forge_heat','craft_heat'].includes(s.operation)){
  if(!Number.isSafeInteger(s.limitC)||s.limitC<0||s.limitC>1200)errors.push('温度边界须为0至1200摄氏度');
 }else if(s.limitC!==undefined)errors.push('此操作不接受温度参数');
 if(s.surface!==undefined&&(s.operation!=='sense_heat'||s.surface!==true))errors.push('炭纹表面测温参数无效');
 if(s.surface&&!catalog.materials?.some(x=>x.item==='item_charcoal'&&Number.isSafeInteger(x.amount)&&x.amount>=1))errors.push('炭纹测温需要真实炭线耗材');
 return errors;
}
export function validateThermalModel(model){
 if(!model||typeof model!=='object')throw new Error('目标未登记真实热容量与燃料规则');
 integer(model.heatCapacityJPerC,1,10000000,'热容量');integer(model.maximumC,1,1200,'耐热上限');integer(model.ambientC,0,model.maximumC,'环境温度');
 integer(model.passiveExchangeJPerMinute,0,1000000,'散热速度');integer(model.burnMgPerMinute,1,10000000,'燃烧速度');integer(model.fuelJPerMg,1,100,'燃料热值');
 integer(model.efficiencyPermille,1,900,'热效率');integer(model.ashPermille,0,1000,'燃料灰分');integer(model.ignitionMaximumMg,1,5000,'火绒点燃上限');
 if(typeof model.ignitable!=='boolean'||typeof model.dryable!=='boolean')throw new Error('目标缺少材料适用性');
 if(!Array.isArray(model.fuels)||model.fuels.some(f=>typeof f.item!=='string'||!Number.isSafeInteger(f.milligramsPerUnit)||f.milligramsPerUnit<1))throw new Error('燃料目录单位无效');
 if(model.wallOffsetsC!==undefined&&(!Array.isArray(model.wallOffsetsC)||model.wallOffsetsC.length<2||model.wallOffsetsC.length>16||model.wallOffsetsC.some(x=>!Number.isSafeInteger(x)||Math.abs(x)>1200)||model.wallOffsetsC.reduce((a,b)=>a+b,0)!==0))throw new Error('器壁温区数据无效');
 if(model.kiln){
  if(!model.wallOffsetsC)throw new Error('窑炉缺少器壁温区');
  integer(model.kiln.safeGradientC,0,1200,'窑炉安全温差');integer(model.kiln.safeRiseCPerMinute,0,1200,'窑炉安全升温速率');integer(model.kiln.crackPermillePerStress,1,1000,'窑炉裂损系数');
 }
 return model;
}
export function validateObjectWorld(world){
 const errors=[],features=new Map(),items=new Map(world.items.map(x=>[x.id,x]));
 for(const location of world.locations)for(const row of location.features??[])if(row.kind==='object'){
  features.set(row.id,{...row,location:location.id});
  try{validateThermalModel(row.thermalModel);initialThermalState(row.thermalInitial,row.thermalModel,0);
   for(const f of row.thermalModel.fuels){const item=items.get(f.item);if(!item||Math.round(item.weight*1000000)!==f.milligramsPerUnit)throw new Error('燃料物品引用或目录重量不符');}
  }catch(error){errors.push(`${row.id}: ${error.message}`);}
 }
 for(const location of world.locations)for(const station of location.workstations??[])if(station.thermalRequirement){
  const r=station.thermalRequirement,f=features.get(r.feature);
  if(!f||f.location!==location.id)errors.push(`${station.id}: 热源引用不存在或不在工坊所在地`);
  if(r.minimumC>r.maximumC||f&&r.maximumC>f.thermalModel.maximumC)errors.push(`${station.id}: 工序温度界限不符`);
 }
 return errors;
}
export function initialThermalState({temperatureC=20,fuelMg=0,moistureMg=0},model,minute){
 validateThermalModel(model);integer(temperatureC,0,model.maximumC,'初始温度');integer(fuelMg,0,100000000,'初始燃料');integer(moistureMg,0,100000000,'初始水量');integer(minute,0,Number.MAX_SAFE_INTEGER,'初始时刻');
 const energyJ=temperatureC*model.heatCapacityJPerC;
 return{lastMinute:minute,energyJ,initialEnergyJ:energyJ,fuelMg,initialFuelMg:fuelMg,fuelAddedMg:0,burnedFuelMg:0,ashMg:0,exhaustFuelMg:0,moistureMg,initialMoistureMg:moistureMg,evaporatedMg:0,chemicalInputJ:0,spellInputJ:0,ambientInputJ:0,dissipatedJ:0,evaporationJ:0,burning:false,burnRemainder:0,...(model.wallOffsetsC?{zoneOffsetsC:[...model.wallOffsetsC],crackStressUnits:0}: {})};
}
export function validateThermalState(s,m){
 validateThermalModel(m);
 for(const k of ['lastMinute','energyJ','initialEnergyJ','fuelMg','initialFuelMg','fuelAddedMg','burnedFuelMg','ashMg','exhaustFuelMg','moistureMg','initialMoistureMg','evaporatedMg','chemicalInputJ','spellInputJ','ambientInputJ','dissipatedJ','evaporationJ','burnRemainder'])integer(s?.[k],0,Number.MAX_SAFE_INTEGER,`热状态${k}`);
 if(typeof s.burning!=='boolean'||s.burnRemainder>=1000||s.energyJ>m.heatCapacityJPerC*m.maximumC)throw new Error('热状态边界损坏');
 if(s.fuelMg+s.burnedFuelMg!==s.initialFuelMg+s.fuelAddedMg||s.ashMg+s.exhaustFuelMg!==s.burnedFuelMg)throw new Error('燃料质量不守恒');
 if(s.moistureMg+s.evaporatedMg!==s.initialMoistureMg+(s.moistureAddedMg??0))throw new Error('干燥水量不守恒');
 if(s.moistureAddedMg!==undefined)integer(s.moistureAddedMg,0,Number.MAX_SAFE_INTEGER,'外加水量');
 if(s.chemicalInputJ!==s.burnedFuelMg*m.fuelJPerMg||s.ashMg!==Math.floor(s.burnedFuelMg*m.ashPermille/1000)||s.evaporationJ!==s.evaporatedMg*3)throw new Error('材料与热量转换账不一致');
 if(s.energyJ!==s.initialEnergyJ+s.chemicalInputJ+s.spellInputJ+s.ambientInputJ-s.dissipatedJ-s.evaporationJ)throw new Error('物件热量不守恒');
 if(m.wallOffsetsC){
  if(!Array.isArray(s.zoneOffsetsC)||s.zoneOffsetsC.length!==m.wallOffsetsC.length||s.zoneOffsetsC.some(x=>!Number.isSafeInteger(x)||Math.abs(x)>1200)||s.zoneOffsetsC.reduce((a,b)=>a+b,0)!==0)throw new Error('器壁温区状态损坏');
  integer(s.crackStressUnits,0,Number.MAX_SAFE_INTEGER,'窑炉裂损累计');
 }
}
function activeSavings(effects,target,minute){
 let saving=0;
 for(const e of effects)if(e.kind==='object_process'&&e.operation==='fuel'&&e.target===target){
  integer(e.power,1,100,'节燃效果');integer(e.started,0,Number.MAX_SAFE_INTEGER,'节燃起点');integer(e.expires,e.started+1,e.started+60,'节燃期限');
  if(e.started<=minute&&e.expires>minute)saving=Math.max(saving,e.power);
 }
 return saving;
}
export function advanceThermalState(source,model,until,{effects=[],target,burnLimitMg=Number.MAX_SAFE_INTEGER}={}){
 validateThermalState(source,model);integer(until,source.lastMinute,Number.MAX_SAFE_INTEGER,'结算时刻');
 const s=clone(source),capacity=model.heatCapacityJPerC,ambient=capacity*model.ambientC,maximum=capacity*model.maximumC;
 // Canonical minute ticks make long waits and split waits identical, including expiry.
 for(let minute=s.lastMinute;minute<until;minute++){
  if(effects.some(e=>e.kind==='object_process'&&e.operation==='barrier'&&e.target===target&&e.expires<=minute)){s.burning=false;s.burnRemainder=0;}
  const oldEnergy=s.energyJ;
  if(!s.burning&&!model.kiln){
   const exchange=Math.min(Math.abs(s.energyJ-ambient),model.passiveExchangeJPerMinute*(until-minute));
   if(s.energyJ>ambient){s.energyJ-=exchange;s.dissipatedJ+=exchange;}else{s.energyJ+=exchange;s.ambientInputJ+=exchange;}
   break;
  }
  if(s.burning&&s.fuelMg>0){
   const saving=activeSavings(effects,target,minute),budget=model.burnMgPerMinute*(1000-saving)+s.burnRemainder;
   const burned=Math.min(s.fuelMg,burnLimitMg,Math.floor(budget/1000));s.burnRemainder=budget%1000;s.fuelMg-=burned;s.burnedFuelMg+=burned;
   s.ashMg=Math.floor(s.burnedFuelMg*model.ashPermille/1000);s.exhaustFuelMg=s.burnedFuelMg-s.ashMg;
   const chemical=burned*model.fuelJPerMg,efficiency=Math.floor(model.efficiencyPermille*1000/(1000-saving));
   const useful=Math.min(maximum-s.energyJ,Math.floor(chemical*efficiency/1000));s.chemicalInputJ+=chemical;s.energyJ+=useful;s.dissipatedJ+=chemical-useful;
   if(burned)for(const operation of ['forge_heat','craft_heat']){
    const active=effects.filter(e=>e.kind==='object_process'&&e.operation===operation&&e.target===target&&e.started<=minute&&e.expires>minute).sort((a,b)=>b.power-a.power)[0];
    if(!active)continue;
    integer(active.power,1,5000,'炉火强度');integer(active.limitC,0,model.maximumC,'炉火温度上限');integer(active.expires,active.started+1,active.started+60,'炉火期限');
    const input=Math.min(active.power,Math.max(0,active.limitC*capacity-s.energyJ));s.energyJ+=input;s.spellInputJ+=input;
    if(operation==='craft_heat'&&s.zoneOffsetsC){
     const hi=s.zoneOffsetsC.indexOf(Math.max(...s.zoneOffsetsC)),lo=s.zoneOffsetsC.indexOf(Math.min(...s.zoneOffsetsC));
     const moved=Math.min(s.zoneOffsetsC[hi],-s.zoneOffsetsC[lo],Math.max(1,Math.floor(active.power/capacity)));s.zoneOffsetsC[hi]-=moved;s.zoneOffsetsC[lo]+=moved;
    }
   }
  }
  if(!s.fuelMg){s.burning=false;s.burnRemainder=0;}
  const exchange=Math.min(Math.abs(s.energyJ-ambient),model.passiveExchangeJPerMinute);
  if(s.energyJ>ambient){s.energyJ-=exchange;s.dissipatedJ+=exchange;}else{s.energyJ+=exchange;s.ambientInputJ+=exchange;}
  if(model.kiln){
   const gradient=Math.max(...s.zoneOffsetsC)-Math.min(...s.zoneOffsetsC),rise=Math.ceil(Math.max(0,s.energyJ-oldEnergy)/capacity);
   s.crackStressUnits+=Math.max(0,gradient-model.kiln.safeGradientC)+Math.max(0,rise-model.kiln.safeRiseCPerMinute);
  }
 }
 if(effects.some(e=>e.kind==='object_process'&&e.operation==='barrier'&&e.target===target&&e.expires<=until)){s.burning=false;s.burnRemainder=0;}
 s.lastMinute=until;validateThermalState(s,model);return s;
}
function locate(engine,name,location){const matches=environmentFeatures(engine).filter(f=>f.id===name||f.location===location&&[f.name,...f.aliases??[]].some(n=>normalize(n)===normalize(name??'')));if(matches.length!==1)throw new Error('热对象未登记或名称不唯一');const row=matches[0];if(row.kind!=='object')throw new Error('只支持登记的非活体物件，不兼作水源或土壤');validateThermalModel(row.thermalModel);return row;}
function read(d,row){
 const record=d.get('state','records',recordKey(row.id));if(record&&(record.category!=='physical_feature'||record.id!==row.id||record.location!==row.location))throw new Error('物件状态记录键冲突');
 const state=clone(record?.state??row.state);if(!state||typeof state!=='object')throw new Error('缺少物件初始状态');
 if('waterMl' in state)throw new Error('液态水移动与热容量尚未联动，不能套用固体热过程');
 const thermal=state.thermal??initialThermalState(row.thermalInitial??{},row.thermalModel,d.get('state','minute'));
 state.thermal=advanceThermalState(thermal,row.thermalModel,d.get('state','minute'),{effects:Object.values(d.get('state','effects')??{}),target:row.id});return state;
}
function store(d,row,state){d.set(['state','records',recordKey(row.id)],{id:row.id,category:'physical_feature',location:row.location,state});}
// Thermal read/write for the interaction executor (interactions.mjs).
export const readObjectState=read;
export function storeObjectState(d,row,state){validateThermalState(state.thermal,row.thermalModel);store(d,row,state);}
const ignites=(d,row,state)=>resolveInteraction('fire',featureTraits(row,state,d.get('state','minute'))).add.includes('burning');
function access(d,row,args,range){
 if(row.location!==d.get('state','location'))throw new Error('物件不在所在地');
 const position=d.get('state','records','local_player_position'),point=position?.location===row.location?position.point:[0,0];
 if(!Array.isArray(row.position)||!Array.isArray(point)||row.position.length!==2||point.length!==2||[...row.position,...point].some(x=>!Number.isFinite(x))||Math.hypot(point[0]-row.position[0],point[1]-row.position[1])>range)throw new Error('未接触物件或超出实际距离');
 if(row.owner==='player'||row.access==='public')return;
 if(args.authorizations!==undefined&&(!Array.isArray(args.authorizations)||args.authorizations.length>8))throw new Error('环境授权编号列表无效');
 const p=[args.authorization,...args.authorizations??[]].map(id=>d.get('state','records',id)).find(p=>p?.subject===row.id);
 if(!p||p.category!=='authorization'||p.subject!==row.id||p.action!=='environment_use'||p.grantor!==row.owner||p.revoked||p.expires!==undefined&&p.expires<=d.get('state','minute'))throw new Error('物件需要有效所有者授权');
 if(row.owner?.startsWith('npc_')&&['死亡','濒死'].includes(d.get('state','npcs',row.owner,'status')))throw new Error('物件所有者无法继续履约');
}
export function inspectObjectProcess(d,engine,target,args={}){const row=locate(engine,target,d.get('state','location'));access(d,row,args,3);const state=read(d,row),s=state.thermal;return{target:row.id,temperatureC:s.energyJ/row.thermalModel.heatCapacityJPerC,burning:s.burning,fuelMg:s.fuelMg,burnedFuelMg:s.burnedFuelMg,moistureMg:s.moistureMg,energyJ:s.energyJ};}
export function prepareObjectMagic(d,catalog,args){
 const errors=validateObjectCatalog(catalog);if(errors.length)throw new Error(errors.join('；'));
 const row=locate(this,args.target,d.get('state','location')),spec=catalog.effectSpec;access(d,row,args,catalog.rangeMeters);
 if(['forge_heat','craft_heat'].includes(spec.operation)&&!localSightClear(d,this,row.location,localPlayerPoint(d),row.position))throw new Error('炉火调温缺少无遮挡视线');
 const state=read(d,row),s=state.thermal,m=row.thermalModel;
 if(spec.limitC>m.maximumC&&!['forge_heat','craft_heat'].includes(spec.operation))throw new Error('法术温度上限超过目标材料耐热边界');
 if(spec.operation==='ignite'&&(!ignites(d,row,state)||s.fuelMg<1||s.fuelMg>Math.min(spec.power,m.ignitionMaximumMg)))throw new Error('只能点燃未燃、干燥且有限量的真实火绒');
 if(spec.operation==='extinguish'&&!s.burning)throw new Error('目标没有实际燃烧');
 if(spec.operation==='fuel'&&!s.burning)throw new Error('节燃必须作用于现有燃烧');
 if(['forge_heat','craft_heat'].includes(spec.operation)&&(!s.burning||!s.fuelMg))throw new Error('炉火调温必须作用于仍有燃料的实际燃烧');
 if(spec.operation==='craft_heat'&&!m.kiln)throw new Error('釉火调律需要已登记温区与裂损规则的窑炉');
 if(spec.surface&&!s.zoneOffsetsC)throw new Error('目标未登记器壁空间温差');
 if(spec.operation==='dry'&&(!m.dryable||!s.moistureMg||s.energyJ<=spec.limitC*m.heatCapacityJPerC))throw new Error('目标不适合干燥或缺少水分、蒸发所需热量');
 return{target:row.id,catalog,spec,objectArgs:{...args,target:row.id}};
}
// Damage spells aimed at a place feature act through the interaction table:
// fire ignites dry tinder or thaws ice, cold freezes standing water.
export function prepareElementObject(d,catalog,args){
 const spec=catalog.effectSpec,location=d.get('state','location');
 const row=environmentFeatures(this).find(f=>f.id===args.target&&f.location===location);if(!row)throw new Error('元素法术目标必须是所在地登记物件');
 access(d,row,args,catalog.rangeMeters??3);
 if(catalog.targeting?.lineOfSight&&!localSightClear(d,this,row.location,localPlayerPoint(d),row.position))throw new Error('元素法术缺少无遮挡视线');
 const state=row.thermalModel?read(d,row):clone(d.get('state','records',recordKey(row.id))?.state??row.state);
 const outcome=resolveInteraction(spec.damageType,featureTraits(row,state,d.get('state','minute')));
 const s=state.thermal,ignite=outcome.add.includes('burning')&&s&&s.fuelMg>=1&&s.fuelMg<=row.thermalModel.ignitionMaximumMg;
 const lasting=outcome.add.some(t=>t!=='burning')&&!row.thermalModel||outcome.remove.length;
 if(!ignite&&!lasting)throw new Error('此元素对该物件没有可成立的作用');
 return{target:row.id,spec,catalog,elementObject:true,elementArgs:{...args}};
}
export function applyElementObject(d,prepared){
 let p;try{p=prepareElementObject.call(this,d,prepared.catalog,prepared.elementArgs);}catch(error){return{target:prepared.target,effectFailed:error.message};}
 const r=applyInteraction(d,this,{agent:p.spec.damageType,target:p.target});
 return{target:p.target,element:r.agent,added:r.added,removed:r.removed,rules:r.rules};
}
export function applyObjectMagic(d,prepared,eventId){
 let valid;try{valid=prepareObjectMagic.call(this,d,prepared.catalog,prepared.objectArgs);}catch(error){return{target:prepared.target,effectFailed:error.message};}
 const row=locate(this,valid.target,d.get('state','location')),state=read(d,row),s=state.thermal,m=row.thermalModel,{operation,power,limitC}=valid.spec;
 if(operation==='sense_heat'){
  const temperatureC=s.energyJ/m.heatCapacityJPerC;
  if(!valid.spec.surface)return{target:row.id,temperatureC,limits:'只读取已接触对象整体温度，不诊断病变、不透视内部温差'};
  const temperaturesC=s.zoneOffsetsC.map(x=>Math.max(0,Math.min(m.maximumC,temperatureC+x)));
  state.charcoalTrace={source:eventId,minute:d.get('state','minute'),temperaturesC};store(d,row,state);
  return{target:row.id,temperatureC,temperaturesC,gradientC:Math.max(...temperaturesC)-Math.min(...temperaturesC),charcoalTrace:true};
 }
 let result={};
 if(operation==='ignite'||operation==='extinguish'){
  // Element change goes through the interaction table: fire ignites, water douses.
  applyInteraction(d,this,{agent:operation==='ignite'?'fire':'water',target:row.id});
  const t=read(d,row).thermal;
  return{target:row.id,...(operation==='ignite'?{ignited:t.burning,fuelMg:t.fuelMg}:{extinguished:!t.burning,stillHot:t.energyJ>m.ambientC*m.heatCapacityJPerC}),temperatureC:t.energyJ/m.heatCapacityJPerC};
 }
 if(operation==='heat'){const input=Math.min(power,Math.max(0,limitC*m.heatCapacityJPerC-s.energyJ));s.energyJ+=input;s.spellInputJ+=input;result={heatInputJ:input,source:'本次已支付魔力'};}
 else if(operation==='cool'){const removed=Math.min(power,Math.max(0,s.energyJ-limitC*m.heatCapacityJPerC));s.energyJ-=removed;s.dissipatedJ+=removed;result={heatRemovedJ:removed,sink:'周边环境'};}
 else if(operation==='dry'){const removed=Math.min(power,s.moistureMg,Math.floor((s.energyJ-limitC*m.heatCapacityJPerC)/3));s.moistureMg-=removed;s.evaporatedMg+=removed;s.energyJ-=removed*3;s.evaporationJ+=removed*3;result={evaporatedMg:removed,heatUsedJ:removed*3};}
 else if(['fuel','forge_heat','craft_heat'].includes(operation)){
  if(d.get('state','effects',eventId))throw new Error('节燃效果编号冲突');
  const expires=d.get('state','minute')+valid.catalog.duration;
  d.set(['state','effects',eventId],{kind:'object_process',operation,target:row.id,power,...(limitC!==undefined?{limitC:Math.min(limitC,m.maximumC)}:{}),started:d.get('state','minute'),expires,source:eventId});result={effect:eventId,expires,...(operation==='fuel'?{fuelSavingPermille:power}:{heatJPerMinute:power})};
 }
 validateThermalState(s,m);store(d,row,state);return{target:row.id,...result,temperatureC:s.energyJ/m.heatCapacityJPerC};
}
export function advanceMagicObjects(d,engine,afterMinute){
 integer(afterMinute,0,Number.MAX_SAFE_INTEGER,'推进时刻');
 advanceHeatScenes(d,engine,afterMinute);
 for(const row of environmentFeatures(engine).filter(f=>f.thermalModel)){
  const record=d.get('state','records',recordKey(row.id));if(!record?.state?.thermal)continue;
  if(record.category!=='physical_feature'||record.id!==row.id||record.location!==row.location)throw new Error('物件状态记录键冲突');
  const state=clone(record.state);state.thermal=advanceThermalState(state.thermal,row.thermalModel,afterMinute,{effects:Object.values(d.get('state','effects')??{}),target:row.id});store(d,row,state);
  // Outdoor rain douses and wets a fire that is still burning at settlement.
  if(state.thermal.burning&&precipitationAt(engine,d.get('randomSeed'),row.location,afterMinute)==='rain')applyInteraction(d,engine,{agent:'rain',target:row.id});
 }
}
export function addObjectFuel(d,engine,args,eventId){
 const row=locate(engine,args.target,d.get('state','location'));access(d,row,args,1);
 const fuel=row.thermalModel.fuels.find(f=>f.item===args.item);if(!fuel)throw new Error('此物品不是已登记的炉具燃料');
 const item=engine.byId.get(fuel.item);if(!item||!Number.isFinite(item.weight)||Math.round(item.weight*1000000)!==fuel.milligramsPerUnit)throw new Error('燃料目录单位与实际物品重量不符');
 const quantity=integer(args.quantity,1,100,'添料份数'),mass=quantity*fuel.milligramsPerUnit;
 integer(mass,1,100000000,'添料质量');if(engine.quantity(d,'player',fuel.item)<quantity)throw new Error('缺少实际燃料');
 const state=read(d,row),s=state.thermal;s.fuelMg+=mass;s.fuelAddedMg+=mass;validateThermalState(s,row.thermalModel);
 engine.itemDelta(d,'player',fuel.item,-quantity);store(d,row,state);return{target:row.id,fuelMgAdded:mass,item:fuel.item,quantity,source:eventId};
}
// Called after the normal workstation ownership/fee check, before any payment.
// No requirement means exact legacy behavior; no implicit free furnace is created.
export function prepareThermalWorkstation(d,engine,station,minutes,{location=d.get('state','location')}={}){
 const requirement=station?.thermalRequirement;if(!requirement)return null;
 integer(minutes,1,43200,'工序时长');integer(requirement.minimumC,0,1200,'工序最低温度');integer(requirement.maximumC,requirement.minimumC,1200,'工序最高温度');
 if(typeof requirement.burning!=='boolean')throw new Error('工序必须明确是否要求燃烧');
 const row=locate(engine,requirement.feature,location);if(row.location!==location)throw new Error('热源不在工坊所在地');
 const start=d.get('state','minute'),document=clone(d.document);
 const forecast={document,get:(...p)=>p.reduce((value,key)=>value?.[key],document),set:(p,value)=>{let parent=document;for(const key of p.slice(0,-1))parent=parent[key]??={};parent[p.at(-1)]=clone(value);}};
 forecast.set(['state','minute'],start);advanceMagicObjects(forecast,engine,start);
 const initial=read(forecast,row);
 store(forecast,row,initial);let state=initial.thermal;
 const check=()=>{const temperature=state.energyJ/row.thermalModel.heatCapacityJPerC;if(temperature<requirement.minimumC||temperature>requirement.maximumC||requirement.burning&&!state.burning)throw new Error('真实热源无法在整个工序中满足温度或燃烧条件');};
 check();for(let minute=start+1;minute<=start+minutes;minute++){forecast.set(['state','minute'],minute);advanceMagicObjects(forecast,engine,minute);state=forecast.get('state','records',recordKey(row.id),'state','thermal');check();}
 return{feature:row.id,minutes,projectedFuelMg:state.fuelMg,projectedTemperatureC:state.energyJ/row.thermalModel.heatCapacityJPerC,...(row.thermalModel.kiln?{startStress:initial.thermal.crackStressUnits,projectedStress:state.crackStressUnits,crackPermillePerStress:row.thermalModel.kiln.crackPermillePerStress}:{})};
}

// The caller supplies a disposable draft and commits it only when the task starts.
export function prepareNpcFurnace(d,engine,station,minutes,npc,reserved=new Map()){
 const location=d.get('state','npcs',npc,'location'),requirement=station?.thermalRequirement;if(!requirement)return null;
 const row=locate(engine,requirement.feature,location);
 if(row.location!==location||row.owner!==npc&&row.access!=='public')throw new Error('人物没有同地热源的使用权限');
 advanceMagicObjects(d,engine,d.get('state','minute'));
 const state=read(d,row),s=state.thermal,m=row.thermalModel;store(d,row,state);
 const options={location};
 try{return {plan:prepareThermalWorkstation(d,engine,station,minutes,options),fuel:[]};}catch(error){
  // Fuel can sustain a fire; it cannot light a cold furnace or repair a temperature gap.
  if(!s.burning||s.moistureMg||s.fuelMg>minutes*m.burnMgPerMinute)throw error;
 }
 const missing=minutes*m.burnMgPerMinute+1-s.fuelMg;
 const fuel=m.fuels.map(f=>({...f,quantity:Math.ceil(missing/f.milligramsPerUnit)})).find(f=>f.quantity>=1&&f.quantity<=100&&engine.quantity(d,npc,f.item)-(reserved.get(f.item)??0)>=f.quantity);
 if(!fuel)throw new Error('人物缺少维持整个工序的实际燃料');
 const item=engine.byId.get(fuel.item);if(!item||Math.round(item.weight*1000000)!==fuel.milligramsPerUnit)throw new Error('燃料目录单位与实际物品重量不符');
 const mass=integer(fuel.quantity*fuel.milligramsPerUnit,1,100000000,'添料质量');
 s.fuelMg+=mass;s.fuelAddedMg+=mass;validateThermalState(s,m);store(d,row,state);
 const plan=prepareThermalWorkstation(d,engine,station,minutes,options);
 engine.itemDelta(d,npc,fuel.item,-fuel.quantity);
 return {plan,fuel:[{item:fuel.item,quantity:fuel.quantity,milligrams:mass}]};
}

// Thermal scene consumers share the object's existing fuel and energy accounts.
export function validateHeatCatalog(catalog){
 const s=catalog.effectSpec,errors=[];
 if(s?.kind!=='heat'||!['warm','contain_fire','barrier'].includes(s.operation))return ['热场操作尚未接入'];
 if(!Number.isSafeInteger(s.power)||s.power<1||s.power>5000)errors.push('热场功率无效');
 if(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>60)errors.push('热场持续时间须在1至60分钟');
 if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>3)errors.push('热场距离须在0至3米');
 if(s.operation==='warm'&&(catalog.rangeMeters!==0||s.power>1000||s.limitC!==38))errors.push('暖掌须直接接触、低功率且上限38摄氏度');
 if(s.operation==='contain_fire'&&(!Number.isSafeInteger(s.upkeepMp)||s.upkeepMp<1||s.upkeepMp>10))errors.push('封焰须持续支付1至10魔力每分钟');
 if(s.operation!=='contain_fire'&&s.upkeepMp!==undefined||s.operation!=='warm'&&s.limitC!==undefined)errors.push('热场参数与操作不符');
 return errors;
}
function rawFeatureState(d,row,minute){
 const record=d.get('state','records',recordKey(row.id));
 if(record&&(record.category!=='physical_feature'||record.id!==row.id||record.location!==row.location))throw new Error('热场状态记录键冲突');
 const state=clone(record?.state??row.state??{});
 if(row.thermalModel)state.thermal??=initialThermalState(row.thermalInitial??{},row.thermalModel,minute);
 return state;
}
function roomOf(engine,name,location){
 const rows=environmentFeatures(engine).filter(x=>x.id===name||x.location===location&&normalize(x.name)===normalize(name));
 if(rows.length!==1||rows[0].kind!=='room')throw new Error('封焰需要登记的实际房间');
 const row=rows[0],m=row.airModel;
 if(!m)throw new Error('房间没有真实通风与空气容量');
 integer(m.capacityMg,1,100000000,'室内氧气容量');integer(m.ventilationMgPerMinute,0,m.capacityMg,'通风量');
 row.fireLinks??=[];
 if(!Array.isArray(row.fireLinks)||row.fireLinks.some(pair=>!Array.isArray(pair)||pair.length!==2||pair[0]===pair[1]))throw new Error('房间火势连接无效');
 for(const pair of row.fireLinks)for(const id of pair){const f=environmentFeatures(engine).find(x=>x.id===id);if(!f?.thermalModel||f.location!==row.location)throw new Error('火势连接缺少同地真实燃料对象');}
 return row;
}
function validateRoomState(state,row){
 const a=state.air,m=row.airModel;
 for(const k of ['lastMinute','oxygenMg','smokeMg','smokeInputMg','burnedFuelMg','ventedSmokeMg','oxygenUsedMg','oxygenAddedMg','spreadCount'])integer(a[k],0,Number.MAX_SAFE_INTEGER,`室内空气${k}`);
 if(a.oxygenMg>m.capacityMg||a.oxygenMg!==m.capacityMg+a.oxygenAddedMg-a.oxygenUsedMg||a.smokeMg+a.ventedSmokeMg!==a.smokeInputMg)throw new Error('室内空气账不守恒');
 return state;
}
function roomState(d,row,minute){
 const state=rawFeatureState(d,row,minute);
 state.air??={lastMinute:minute,oxygenMg:row.airModel.capacityMg,smokeMg:0,smokeInputMg:0,burnedFuelMg:0,ventedSmokeMg:0,oxygenUsedMg:0,oxygenAddedMg:0,spreadCount:0};
 return validateRoomState(state,row);
}
function livingHand(d,engine,args,catalog){
 const target=args.target??'player',partition=target==='player'?'player':target.startsWith('npc_')?'npcs':null;
 if(!partition)throw new Error('暖掌需要真实活体目标');
 const path=target==='player'?['state','player']:['state',partition,target],actor=d.get(...path);
 if(!actor||actor.status==='死亡'||target!=='player'&&(actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel))throw new Error('暖掌目标不在场或已经死亡');
 if(target!=='player'){
  const facts=areaTargetFacts(d,engine,target,d.get('state','location'),localPlayerPoint(d));
  if(!facts?.lineOfSight||Math.hypot(facts.point[0]-localPlayerPoint(d)[0],facts.point[1]-localPlayerPoint(d)[1])!==0)throw new Error('暖掌须真实接触活体');
  assertSpellConsent(d,engine,catalog,args,target,'support_magic');
 }
 return{target,path,actor};
}
export function prepareHeatMagic(d,catalog,args){
 const errors=validateHeatCatalog(catalog);if(errors.length)throw new Error(errors.join('；'));
 const spec=catalog.effectSpec;
 if(spec.operation==='warm')return{...livingHand(d,this,args,catalog),catalog,spec,heatArgs:clone(args)};
 const row=spec.operation==='contain_fire'?roomOf(this,args.target,d.get('state','location')):locate(this,args.target,d.get('state','location'));
 access(d,row,args,catalog.rangeMeters);
 if(!localSightClear(d,this,row.location,localPlayerPoint(d),row.position))throw new Error('热场缺少无遮挡视线');
 if(spec.operation==='contain_fire'){
  roomState(d,row,d.get('state','minute'));
  if(d.get('state','player','mp')<spec.upkeepMp)throw new Error('缺少维持封焰的魔力');
 }else{
  const end=row.fireLine?.end,state=read(d,row),s=state.thermal;
  if(!Array.isArray(end)||end.length!==2||end.some(x=>!Number.isFinite(x))||Math.abs(Math.hypot(end[0]-row.position[0],end[1]-row.position[1])-2)>1e-6)throw new Error('火线需要登记的两米地面路径');
  if(!ignites(d,row,{...state,thermal:s})||s.fuelMg<1||s.fuelMg>Math.min(spec.power,row.thermalModel.ignitionMaximumMg))throw new Error('火线需要有限、干燥且未燃的真实地面燃料');
 }
 return{target:row.id,catalog,spec,heatArgs:{...args,target:row.id}};
}
export function applyHeatMagic(d,prepared,id){
 let p;try{p=prepareHeatMagic.call(this,d,prepared.catalog,prepared.heatArgs);}catch(error){return{target:prepared.target,effectFailed:error.message};}
 if(d.get('state','effects',id))throw new Error('热场效果编号冲突');
 const now=d.get('state','minute'),expires=now+p.catalog.duration,{operation,power}=p.spec;
 if(operation==='warm'){
  const hand=handState(p.actor,now),input=Math.min(power,Math.max(0,38000-hand.energyJ));hand.energyJ+=input;hand.spellInputJ+=input;
  d.set([...p.path,'handThermal'],hand);d.set(['state','effects',id],{kind:'heat',operation,target:p.target,power,started:now,expires,source:id});
  return{target:p.target,effect:id,expires,handTemperatureC:hand.energyJ/1000,maximumC:38};
 }
 const row=environmentFeatures(this).find(x=>x.id===p.target);
 if(operation==='barrier'){
  const state=read(d,row);state.thermal.burning=true;store(d,row,state);
  d.set(['state','effects',id],{kind:'object_process',operation,target:row.id,power,started:now,expires,source:id});
  return{target:row.id,effect:id,expires,blocksPath:true,fuelMg:state.thermal.fuelMg};
 }
 // Materialize the room and its linked fuel objects at the same clock boundary.
 const state=roomState(d,row,now);store(d,row,state);
 for(const target of new Set(row.fireLinks.flat())){const f=environmentFeatures(this).find(x=>x.id===target);store(d,f,read(d,f));}
 d.set(['state','effects',id],{kind:'heat',operation,target:row.id,location:row.location,upkeepMp:p.spec.upkeepMp,power,started:now,expires,source:id,owner:'player'});
 return{target:row.id,effect:id,expires,ventilationMgPerMinute:0,oxygenMg:state.air.oxygenMg,upkeepMp:p.spec.upkeepMp};
}
function handState(actor,minute){
 const h=clone(actor.handThermal??{lastMinute:minute,energyJ:32000,initialEnergyJ:32000,spellInputJ:0,ambientInputJ:0,dissipatedJ:0,transferredJ:0});
 for(const k of ['lastMinute','energyJ','initialEnergyJ','spellInputJ','ambientInputJ','dissipatedJ','transferredJ'])integer(h[k],0,Number.MAX_SAFE_INTEGER,`手掌热账${k}`);
 if(h.energyJ>38000||h.energyJ!==h.initialEnergyJ+h.spellInputJ+h.ambientInputJ-h.dissipatedJ-h.transferredJ)throw new Error('手掌热量或接触安全边界损坏');
 return h;
}
function advanceHeatScenes(d,engine,after){
 const features=environmentFeatures(engine),effects=Object.entries(d.get('state','effects')??{}).sort(([a],[b])=>a.localeCompare(b));
 const rooms=features.filter(x=>x.kind==='room'&&x.airModel).map(row=>{
  row=roomOf(engine,row.id,row.location);
  const linked=features.filter(f=>row.fireLinks.flat().includes(f.id));
  const cursors=linked.map(f=>d.get('state','records',recordKey(f.id),'state','thermal','lastMinute')).filter(Number.isSafeInteger);
  const airCursors=effects.map(([,e])=>e).filter(e=>e.kind==='air'&&e.location===row.location).map(e=>e.lastMinute);
  const start=d.get('state','records',recordKey(row.id),'state','air','lastMinute')??(cursors.length?Math.min(...cursors):airCursors.length?Math.min(...airCursors):after);
  return{row,recorded:Boolean(d.get('state','records',recordKey(row.id))),state:roomState(d,row,start),objects:linked.map(f=>({row:f,state:rawFeatureState(d,f,start)}))};
 // A registered room nobody has touched stays at its catalogue state; it is
 // materialized only once a fire, air effect or spell actually involves it.
 }).filter(x=>x.recorded||x.state.air.lastMinute<after);
 const hands=[{path:['state','player'],target:'player',actor:d.get('state','player')},...Object.entries(d.get('state','npcs')??{}).map(([target,actor])=>({target,actor,path:['state','npcs',target]}))]
  .filter(x=>x.actor?.handThermal).map(x=>({...x,hand:handState(x.actor,after)}));
 const starts=[...rooms.map(x=>x.state.air.lastMinute),...hands.map(x=>x.hand.lastMinute)];
 if(!starts.length)return;
 for(let minute=Math.min(...starts);minute<after;minute++){
  for(const x of rooms){
   const a=x.state.air,m=x.row.airModel;if(a.lastMinute>minute)continue;
   let sealed=false;
   for(const[id,e]of effects)if(e.kind==='heat'&&e.operation==='contain_fire'&&e.target===x.row.id&&e.started<=minute&&e.expires>minute){
    integer(e.upkeepMp,1,10,'封焰维持魔力');
    if(d.get('state','location')!==e.location||d.get('state','player','status')!=='正常'||d.get('state','player','mp')<e.upkeepMp){e.expires=minute;d.set(['state','effects',id],e);continue;}
    d.set(['state','player','mp'],d.get('state','player','mp')-e.upkeepMp);sealed=true;
   }
   if(!sealed){const added=Math.min(m.ventilationMgPerMinute,m.capacityMg-a.oxygenMg),vented=Math.min(m.ventilationMgPerMinute,a.smokeMg);a.oxygenMg+=added;a.oxygenAddedMg+=added;a.smokeMg-=vented;a.ventedSmokeMg+=vented;}
   const burning=new Set(x.objects.filter(o=>o.state.thermal.burning&&o.state.thermal.fuelMg).map(o=>o.row.id));
   if(!sealed)for(const[from,to]of x.row.fireLinks){
    const o=x.objects.find(o=>o.row.id===to),s=o.state.thermal;
    if(burning.has(from)&&!s.burning&&s.fuelMg&&!s.moistureMg&&o.row.thermalModel.ignitable&&a.oxygenMg){s.burning=true;a.spreadCount++;}
   }
   for(const o of x.objects){
    if(o.state.thermal.lastMinute>minute)continue;
    if(!a.oxygenMg){o.state.thermal.burning=false;o.state.thermal.burnRemainder=0;}
    const before=o.state.thermal.burnedFuelMg,exhaustBefore=o.state.thermal.exhaustFuelMg;
    o.state.thermal=advanceThermalState(o.state.thermal,o.row.thermalModel,minute+1,{effects:effects.map(([,e])=>e),target:o.row.id,burnLimitMg:a.oxygenMg});
    const burned=o.state.thermal.burnedFuelMg-before,smoke=o.state.thermal.exhaustFuelMg-exhaustBefore;
    a.oxygenMg-=burned;a.oxygenUsedMg+=burned;a.burnedFuelMg+=burned;a.smokeMg+=smoke;a.smokeInputMg+=smoke;
    if(!a.oxygenMg){o.state.thermal.burning=false;o.state.thermal.burnRemainder=0;}
   }
   a.lastMinute=minute+1;
  }
  advanceAirMinute(d,engine,rooms,minute);
  for(const x of hands){
   const h=x.hand;if(h.lastMinute>minute)continue;
   const active=effects.map(([,e])=>e).filter(e=>e.kind==='heat'&&e.operation==='warm'&&e.target===x.target&&e.started<=minute&&e.expires>minute&&x.actor.status!=='死亡').sort((a,b)=>b.power-a.power)[0];
   if(active){integer(active.power,1,1000,'暖掌功率');const input=Math.min(active.power,38000-h.energyJ);h.energyJ+=input;h.spellInputJ+=input;}
   const exchange=Math.min(200,Math.abs(h.energyJ-32000));
   if(h.energyJ>32000){h.energyJ-=exchange;h.dissipatedJ+=exchange;}else{h.energyJ+=exchange;h.ambientInputJ+=exchange;}
   h.lastMinute=minute+1;
  }
 }
 for(const x of rooms){validateRoomState(x.state,x.row);store(d,x.row,x.state);for(const o of x.objects)store(d,o.row,o.state);}
 for(const x of hands){handState({...x.actor,handThermal:x.hand},after);d.set([...x.path,'handThermal'],x.hand);}
}
export function touchWarmObject(d,engine,args){
 const row=locate(engine,args.target,d.get('state','location'));access(d,row,args,0);
 const now=d.get('state','minute'),active=Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='heat'&&e.operation==='warm'&&e.target==='player'&&e.started<=now&&e.expires>now).sort((a,b)=>b.power-a.power)[0];
 if(!active)throw new Error('没有仍在维持的真实暖掌');
 const h=handState(d.get('state','player'),now),state=read(d,row),s=state.thermal,m=row.thermalModel;
 if(s.burning||s.energyJ/m.heatCapacityJPerC>=h.energyJ/1000)throw new Error('接触物过热或没有可传递温差');
 const input=Math.min(active.power,h.energyJ-32000,Math.floor((h.energyJ/1000-s.energyJ/m.heatCapacityJPerC)/(1/1000+1/m.heatCapacityJPerC)));
 if(input<=0)throw new Error('手掌没有可传递的热量');
 h.energyJ-=input;h.transferredJ+=input;s.energyJ+=input;s.spellInputJ+=input;
 validateThermalState(s,m);store(d,row,state);d.set(['state','player','handThermal'],h);
 return{target:row.id,transferredJ:input,temperatureC:s.energyJ/m.heatCapacityJPerC,handTemperatureC:h.energyJ/1000};
}
export function douseObjectFire(d,engine,args){
 const row=locate(engine,args.target,d.get('state','location'));access(d,row,args,3);
 const source=environmentFeatures(engine).find(x=>x.id===args.source);
 if(!source||!['water','container'].includes(source.kind))throw new Error('浇火需要真实水源');
 access(d,source,args,3);assertLiquidWater(engine,d,source);const water=rawFeatureState(d,source,d.get('state','minute')),ml=integer(args.millilitres,1,2000,'浇火水量');
 if(!Number.isSafeInteger(water.waterMl)||water.waterMl<ml)throw new Error('浇火水量不足');
 const state=read(d,row),s=state.thermal;if(!s.burning)throw new Error('目标没有实际燃烧');
 // One millilitre wets at most one gram of the remaining registered fuel.
 if(ml*1000<s.fuelMg)throw new Error('水量不足以浇灭全部实际燃料');
 water.waterMl-=ml;store(d,source,water);
 applyInteraction(d,engine,{agent:'water',target:row.id,moistureMg:ml*1000});
 const t=read(d,row).thermal;
 return{target:row.id,extinguished:!t.burning,waterUsedMl:ml,stillHot:t.energyJ>row.thermalModel.ambientC*row.thermalModel.heatCapacityJPerC};
}
function intersects(a,b,c,e){
 const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const within=(p,q,r)=>r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
 const v=[cross(a,b,c),cross(a,b,e),cross(c,e,a),cross(c,e,b)];
 return v[0]*v[1]<0&&v[2]*v[3]<0||v[0]===0&&within(a,b,c)||v[1]===0&&within(a,b,e)||v[2]===0&&within(c,e,a)||v[3]===0&&within(c,e,b);
}
export function assertFirePath(d,engine,from,to,location=d.get('state','location')){
 for(const row of environmentFeatures(engine).filter(f=>f.location===location&&f.fireLine))if(intersects(from,to,row.position,row.fireLine.end)&&read(d,row).thermal.burning)throw new Error('真实火线阻挡行路，须绕行、等待燃尽或浇灭');
}
export function assertFireTravel(d,engine,route){
 let from=d.get('state','location');
 for(const edgeId of route.edges){const edge=engine.world.routes.find(x=>x.id===edgeId),to=edge.from===from?edge.to:edge.from;
  for(const row of environmentFeatures(engine).filter(f=>f.location===from&&f.fireLine?.exitTo?.includes(to)))if(read(d,row).thermal.burning)throw new Error('出口真实火线阻挡行路');
  from=to;
 }
}
export function ambientHeatC(d,engine,location=d.get('state','location')){
 const explicit=d.get('state','weather',location,'temperatureC'),weather=localWeather(engine,d.document,location),definition=engine.byId.get(location);
 const temperature=explicit??definition?.microclimate?.temperatureC??(weather&&!weather.indoors?weather.temperatureC:undefined);
 if(!Number.isFinite(temperature)||temperature< -100||temperature>1200)throw new Error('冰针缺少实际环境温度');
 return temperature;
}
export function coldHeatMultiplier(temperature){return Math.max(0,1-Math.max(0,temperature-20)/100);}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['object'],validate:validateObjectCatalog,prepare(d,c,args){return prepareObjectMagic.call(this,d,c,args);},apply(d,p,id){return applyObjectMagic.call(this,d,p,id);}});
registerMagicEffect({kinds:['heat'],validate:validateHeatCatalog,prepare(d,c,args){return prepareHeatMagic.call(this,d,c,args);},apply(d,p,id){return applyHeatMagic.call(this,d,p,id);}});
