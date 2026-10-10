import {environmentFeatures} from './environment.mjs';
import {normalize} from './retrieval.mjs';

const ops=new Set(['ignite','extinguish','heat','cool','dry','sense_heat','fuel']);
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${label}无效`);return n;};
const clone=x=>structuredClone(x),recordKey=id=>`physical_feature:${id}`;
export function validateObjectCatalog(catalog){
 const s=catalog.effectSpec,errors=[];
 if(s?.kind!=='object'||!ops.has(s.operation))return ['物件工艺操作尚未接入'];
 if(!Number.isSafeInteger(s.power)||s.power<1||s.power>5000)errors.push('物件工艺强度非法');
 if(!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>3)errors.push('物件工艺距离须在0至3米');
 if(s.operation==='sense_heat'&&catalog.rangeMeters!==0)errors.push('测温须直接接触，不可隔空读取');
 if(s.operation==='fuel'){
  if(s.power>100)errors.push('节燃上限为百分之十');
  if(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>60)errors.push('节燃持续时间须在1至60分钟');
 }else if(catalog.duration!==0)errors.push('此物件工艺操作是瞬时效果');
 if(['heat','cool','dry'].includes(s.operation)){
  if(!Number.isSafeInteger(s.limitC)||s.limitC<0||s.limitC>1200)errors.push('温度边界须为0至1200摄氏度');
 }else if(s.limitC!==undefined)errors.push('此操作不接受温度参数');
 return errors;
}
export function validateThermalModel(model){
 if(!model||typeof model!=='object')throw new Error('目标未登记真实热容量与燃料规则');
 integer(model.heatCapacityJPerC,1,10000000,'热容量');integer(model.maximumC,1,1200,'耐热上限');integer(model.ambientC,0,model.maximumC,'环境温度');
 integer(model.passiveExchangeJPerMinute,0,1000000,'散热速度');integer(model.burnMgPerMinute,1,10000000,'燃烧速度');integer(model.fuelJPerMg,1,100,'燃料热值');
 integer(model.efficiencyPermille,1,900,'热效率');integer(model.ashPermille,0,1000,'燃料灰分');integer(model.ignitionMaximumMg,1,5000,'火绒点燃上限');
 if(typeof model.ignitable!=='boolean'||typeof model.dryable!=='boolean')throw new Error('目标缺少材料适用性');
 if(!Array.isArray(model.fuels)||model.fuels.some(f=>typeof f.item!=='string'||!Number.isSafeInteger(f.milligramsPerUnit)||f.milligramsPerUnit<1))throw new Error('燃料目录单位无效');
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
 return{lastMinute:minute,energyJ,initialEnergyJ:energyJ,fuelMg,initialFuelMg:fuelMg,fuelAddedMg:0,burnedFuelMg:0,ashMg:0,exhaustFuelMg:0,moistureMg,initialMoistureMg:moistureMg,evaporatedMg:0,chemicalInputJ:0,spellInputJ:0,ambientInputJ:0,dissipatedJ:0,evaporationJ:0,burning:false,burnRemainder:0};
}
export function validateThermalState(s,m){
 validateThermalModel(m);
 for(const k of ['lastMinute','energyJ','initialEnergyJ','fuelMg','initialFuelMg','fuelAddedMg','burnedFuelMg','ashMg','exhaustFuelMg','moistureMg','initialMoistureMg','evaporatedMg','chemicalInputJ','spellInputJ','ambientInputJ','dissipatedJ','evaporationJ','burnRemainder'])integer(s?.[k],0,Number.MAX_SAFE_INTEGER,`热状态${k}`);
 if(typeof s.burning!=='boolean'||s.burnRemainder>=1000||s.energyJ>m.heatCapacityJPerC*m.maximumC)throw new Error('热状态边界损坏');
 if(s.fuelMg+s.burnedFuelMg!==s.initialFuelMg+s.fuelAddedMg||s.ashMg+s.exhaustFuelMg!==s.burnedFuelMg)throw new Error('燃料质量不守恒');
 if(s.moistureMg+s.evaporatedMg!==s.initialMoistureMg)throw new Error('干燥水量不守恒');
 if(s.chemicalInputJ!==s.burnedFuelMg*m.fuelJPerMg||s.ashMg!==Math.floor(s.burnedFuelMg*m.ashPermille/1000)||s.evaporationJ!==s.evaporatedMg*3)throw new Error('材料与热量转换账不一致');
 if(s.energyJ!==s.initialEnergyJ+s.chemicalInputJ+s.spellInputJ+s.ambientInputJ-s.dissipatedJ-s.evaporationJ)throw new Error('物件热量不守恒');
}
function activeSavings(effects,target,minute){
 let saving=0;
 for(const e of effects)if(e.kind==='object_process'&&e.operation==='fuel'&&e.target===target){
  integer(e.power,1,100,'节燃效果');integer(e.started,0,Number.MAX_SAFE_INTEGER,'节燃起点');integer(e.expires,e.started+1,e.started+60,'节燃期限');
  if(e.started<=minute&&e.expires>minute)saving=Math.max(saving,e.power);
 }
 return saving;
}
export function advanceThermalState(source,model,until,{effects=[],target}={}){
 validateThermalState(source,model);integer(until,source.lastMinute,Number.MAX_SAFE_INTEGER,'结算时刻');
 const s=clone(source),capacity=model.heatCapacityJPerC,ambient=capacity*model.ambientC,maximum=capacity*model.maximumC;
 // Canonical minute ticks make long waits and split waits identical, including expiry.
 for(let minute=s.lastMinute;minute<until;minute++){
  if(!s.burning){
   const exchange=Math.min(Math.abs(s.energyJ-ambient),model.passiveExchangeJPerMinute*(until-minute));
   if(s.energyJ>ambient){s.energyJ-=exchange;s.dissipatedJ+=exchange;}else{s.energyJ+=exchange;s.ambientInputJ+=exchange;}
   break;
  }
  if(s.burning&&s.fuelMg>0){
   const saving=activeSavings(effects,target,minute),budget=model.burnMgPerMinute*(1000-saving)+s.burnRemainder;
   const burned=Math.min(s.fuelMg,Math.floor(budget/1000));s.burnRemainder=budget%1000;s.fuelMg-=burned;s.burnedFuelMg+=burned;
   s.ashMg=Math.floor(s.burnedFuelMg*model.ashPermille/1000);s.exhaustFuelMg=s.burnedFuelMg-s.ashMg;
   const chemical=burned*model.fuelJPerMg,efficiency=Math.floor(model.efficiencyPermille*1000/(1000-saving));
   const useful=Math.min(maximum-s.energyJ,Math.floor(chemical*efficiency/1000));s.chemicalInputJ+=chemical;s.energyJ+=useful;s.dissipatedJ+=chemical-useful;
  }
  if(!s.fuelMg){s.burning=false;s.burnRemainder=0;}
  const exchange=Math.min(Math.abs(s.energyJ-ambient),model.passiveExchangeJPerMinute);
  if(s.energyJ>ambient){s.energyJ-=exchange;s.dissipatedJ+=exchange;}else{s.energyJ+=exchange;s.ambientInputJ+=exchange;}
 }
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
function access(d,row,args,range){
 if(row.location!==d.get('state','location'))throw new Error('物件不在所在地');
 const position=d.get('state','records','local_player_position'),point=position?.location===row.location?position.point:[0,0];
 if(!Array.isArray(row.position)||!Array.isArray(point)||row.position.length!==2||point.length!==2||[...row.position,...point].some(x=>!Number.isFinite(x))||Math.hypot(point[0]-row.position[0],point[1]-row.position[1])>range)throw new Error('未接触物件或超出实际距离');
 if(row.owner==='player'||row.access==='public')return;
 const p=d.get('state','records',args.authorization);
 if(!p||p.category!=='authorization'||p.subject!==row.id||p.action!=='environment_use'||p.grantor!==row.owner||p.expires!==undefined&&p.expires<=d.get('state','minute'))throw new Error('物件需要有效所有者授权');
 if(row.owner?.startsWith('npc_')&&['死亡','濒死'].includes(d.get('state','npcs',row.owner,'status')))throw new Error('物件所有者无法继续履约');
}
export function inspectObjectProcess(d,engine,target,args={}){const row=locate(engine,target,d.get('state','location'));access(d,row,args,3);const state=read(d,row),s=state.thermal;return{target:row.id,temperatureC:s.energyJ/row.thermalModel.heatCapacityJPerC,burning:s.burning,fuelMg:s.fuelMg,burnedFuelMg:s.burnedFuelMg,moistureMg:s.moistureMg,energyJ:s.energyJ};}
export function prepareObjectMagic(d,catalog,args){
 const errors=validateObjectCatalog(catalog);if(errors.length)throw new Error(errors.join('；'));
 const row=locate(this,args.target,d.get('state','location')),spec=catalog.effectSpec;access(d,row,args,catalog.rangeMeters);
 const state=read(d,row),s=state.thermal,m=row.thermalModel;
 if(spec.limitC>m.maximumC)throw new Error('法术温度上限超过目标材料耐热边界');
 if(spec.operation==='ignite'&&(!m.ignitable||s.moistureMg>0||s.fuelMg<1||s.fuelMg>Math.min(spec.power,m.ignitionMaximumMg)||s.burning))throw new Error('只能点燃未燃、干燥且有限量的真实火绒');
 if(spec.operation==='extinguish'&&!s.burning)throw new Error('目标没有实际燃烧');
 if(spec.operation==='fuel'&&!s.burning)throw new Error('节燃必须作用于现有燃烧');
 if(spec.operation==='dry'&&(!m.dryable||!s.moistureMg||s.energyJ<=spec.limitC*m.heatCapacityJPerC))throw new Error('目标不适合干燥或缺少水分、蒸发所需热量');
 return{target:row.id,catalog,spec,objectArgs:{...args,target:row.id}};
}
export function applyObjectMagic(d,prepared,eventId){
 let valid;try{valid=prepareObjectMagic.call(this,d,prepared.catalog,prepared.objectArgs);}catch(error){return{target:prepared.target,effectFailed:error.message};}
 const row=locate(this,valid.target,d.get('state','location')),state=read(d,row),s=state.thermal,m=row.thermalModel,{operation,power,limitC}=valid.spec;
 if(operation==='sense_heat')return{target:row.id,temperatureC:s.energyJ/m.heatCapacityJPerC,limits:'只读取已接触对象整体温度，不诊断病变、不透视内部温差'};
 let result={};
 if(operation==='ignite'){s.burning=true;result={ignited:true,fuelMg:s.fuelMg};}
 else if(operation==='extinguish'){s.burning=false;s.burnRemainder=0;result={extinguished:true,stillHot:s.energyJ>m.ambientC*m.heatCapacityJPerC};}
 else if(operation==='heat'){const input=Math.min(power,Math.max(0,limitC*m.heatCapacityJPerC-s.energyJ));s.energyJ+=input;s.spellInputJ+=input;result={heatInputJ:input,source:'本次已支付魔力'};}
 else if(operation==='cool'){const removed=Math.min(power,Math.max(0,s.energyJ-limitC*m.heatCapacityJPerC));s.energyJ-=removed;s.dissipatedJ+=removed;result={heatRemovedJ:removed,sink:'周边环境'};}
 else if(operation==='dry'){const removed=Math.min(power,s.moistureMg,Math.floor((s.energyJ-limitC*m.heatCapacityJPerC)/3));s.moistureMg-=removed;s.evaporatedMg+=removed;s.energyJ-=removed*3;s.evaporationJ+=removed*3;result={evaporatedMg:removed,heatUsedJ:removed*3};}
 else if(operation==='fuel'){
  if(d.get('state','effects',eventId))throw new Error('节燃效果编号冲突');
  const expires=d.get('state','minute')+valid.catalog.duration;
  d.set(['state','effects',eventId],{kind:'object_process',operation:'fuel',target:row.id,power,started:d.get('state','minute'),expires,source:eventId});result={effect:eventId,expires,fuelSavingPermille:power};
 }
 validateThermalState(s,m);store(d,row,state);return{target:row.id,...result,temperatureC:s.energyJ/m.heatCapacityJPerC};
}
export function advanceMagicObjects(d,engine,afterMinute){
 integer(afterMinute,0,Number.MAX_SAFE_INTEGER,'推进时刻');
 for(const row of environmentFeatures(engine).filter(f=>f.thermalModel)){
  const record=d.get('state','records',recordKey(row.id));if(!record?.state?.thermal)continue;
  if(record.category!=='physical_feature'||record.id!==row.id||record.location!==row.location)throw new Error('物件状态记录键冲突');
  const state=clone(record.state);state.thermal=advanceThermalState(state.thermal,row.thermalModel,afterMinute,{effects:Object.values(d.get('state','effects')??{}),target:row.id});store(d,row,state);
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
export function prepareThermalWorkstation(d,engine,station,minutes){
 const requirement=station?.thermalRequirement;if(!requirement)return null;
 integer(minutes,1,43200,'工序时长');integer(requirement.minimumC,0,1200,'工序最低温度');integer(requirement.maximumC,requirement.minimumC,1200,'工序最高温度');
 if(typeof requirement.burning!=='boolean')throw new Error('工序必须明确是否要求燃烧');
 const row=locate(engine,requirement.feature,d.get('state','location'));if(row.location!==d.get('state','location'))throw new Error('热源不在工坊所在地');
 let state=read(d,row).thermal;const effects=Object.values(d.get('state','effects')??{}),start=d.get('state','minute');
 const check=()=>{const temperature=state.energyJ/row.thermalModel.heatCapacityJPerC;if(temperature<requirement.minimumC||temperature>requirement.maximumC||requirement.burning&&!state.burning)throw new Error('真实热源无法在整个工序中满足温度或燃烧条件');};
 check();for(let minute=start+1;minute<=start+minutes;minute++){state=advanceThermalState(state,row.thermalModel,minute,{effects,target:row.id});check();}
 return{feature:row.id,minutes,projectedFuelMg:state.fuelMg,projectedTemperatureC:state.energyJ/row.thermalModel.heatCapacityJPerC};
}
