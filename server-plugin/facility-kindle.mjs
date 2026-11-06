import {preconditionFailure} from './precondition.mjs';
import {environmentFeatures} from './environment-state.mjs';
import {isDerivedFirebox} from './facility-heat.mjs';
import {advanceMagicObjects,advanceThermalState,readObjectState,storeObjectState,prepareThermalWorkstation,prepareNpcFurnace} from './magic-object.mjs';
import {isItemClass} from './item-class.mjs';

// 卡 HB：用热工位的人对设备自带炉膛的照管，玩家和人物同一条。
// 炉膛烧着就按工序长度补够燃料；冷炉要用的人点火：点火后等炉温升到工序要求，
// 等的分钟数（warm）算在这次工作里，燃料从本人行囊里出（不动配方要用的料），没有燃料就做不了。
// 一份燃料够不够，按真实热账（advanceThermalState）逐分钟推：升温、再撑完整个工序。
const limit=2880;
function trial(model,source,minute,req,process){
 let s=source,t=minute;
 while(s.energyJ/model.heatCapacityJPerC<req.minimumC){
  if(!s.burning||t-minute>limit)return null;
  s=advanceThermalState(s,model,++t);
 }
 const warm=t-minute;
 for(let i=0;i<process;i++){
  s=advanceThermalState(s,model,++t);
  const c=s.energyJ/model.heatCapacityJPerC;
  if(c<req.minimumC||c>req.maximumC||req.burning&&!s.burning)return null;
 }
 return {warm,end:s};
}
// 返回 {plan,fuel,warm}；缺燃料、炉膛受潮等做不了时抛 preconditionFailure。
export function prepareStationHeat(d,engine,station,minutes,{holder,reserved=new Map(),location}){
 const req=station?.thermalRequirement;if(!req)return null;
 const row=environmentFeatures(engine).find(f=>f.id===req.feature&&f.location===location&&f.thermalModel);
 if(!isDerivedFirebox(row)){
  // 显式登记的热源（丹炉等）沿用原口径：人物只续不点，玩家自己照管。
  if(holder==='player')return {plan:prepareThermalWorkstation(d,engine,station,minutes,{location}),fuel:[],warm:0};
  return {...prepareNpcFurnace(d,engine,station,minutes,holder,reserved),warm:0};
 }
 const now=d.get('state','minute');
 advanceMagicObjects(d,engine,now);
 const state=readObjectState(d,row),s=state.thermal,m=row.thermalModel;
 if(s.moistureMg)throw preconditionFailure('炉膛受潮，点不着');
 const options=[0,...Array.from({length:100},(_,i)=>i+1)];
 for(const f of m.fuels.filter(f=>isItemClass(engine,f.item,'fuel'))){
  const have=engine.quantity(d,holder,f.item)-(reserved.get(f.item)??0);
  for(const q of options){
   if(q>have)break;
   if(!q&&!s.burning)continue;
   const mass=q*f.milligramsPerUnit;
   const start={...s,burning:s.burning||q>0,fuelMg:s.fuelMg+mass,fuelAddedMg:s.fuelAddedMg+mass};
   if(!start.fuelMg)continue;
   const out=trial(m,start,now,req,minutes);
   if(!out)continue;
   const planned={feature:row.id,minutes,warm:out.warm,projectedFuelMg:out.end.fuelMg,projectedTemperatureC:out.end.energyJ/m.heatCapacityJPerC};
   if(q){
    state.thermal=start;storeObjectState(d,row,state);
    engine.itemDelta(d,holder,f.item,-q,{flow:'sink:consume',purpose:'fuel',writer:'magic-object',eventId:`furnace:${station.id}:${now}`});
   }
   return {plan:planned,warm:out.warm,fuel:q?[{item:f.item,quantity:q,milligrams:mass}]:[]};
  }
 }
 throw preconditionFailure(s.burning?'缺少维持整个工序的实际燃料':'炉子是冷的，也没有足够的燃料点火升温');
}
