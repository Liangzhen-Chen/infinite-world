import {classItems} from './item-class.mjs';

// 卡 HB：需要明火的设备类（锻炉、窑）自带炉膛。热源绑定由设备类派生，
// 不逐个工位手填：world/meta/mechanics/heat-fixtures.json 写每一类的工序
// 炉温要求与炉膛物理参数，这里把它们变成工位的 thermalRequirement 和一条
// 属于该设备的炉膛物件（燃料表按物品的 fuel 类别与目录重量派生）。
// 规律数据由通用加载器挂在 runtime world 上（world/meta/mechanics/heat-fixtures.json -> world.heatFixtures）。
export const heatClass=(world,fixture)=>world?.heatFixtures?.classes?.[fixture]??null;
export const fireboxId=stationId=>`feature_firebox_${stationId}`;
// 设备类要求的工序炉温；已显式登记热源的设备不套用（行里自己的 thermalRequirement 优先）。
export const derivedRequirement=(world,stationId,fixture)=>{const c=heatClass(world,fixture);return c?{feature:fireboxId(stationId),...c.requirement}:null;};
export const isDerivedFirebox=row=>row?.derivedFrom==='fixture';
export function fireboxRow(world,station,owner){
 const c=heatClass(world,station.fixture),items=new Map((world.items??[]).map(i=>[i.id,i]));
 const fuels=classItems({world},'fuel').map(id=>({item:id,milligramsPerUnit:Math.round(items.get(id).weight*1000000)})).filter(f=>f.milligramsPerUnit>=1);
 return {id:fireboxId(station.id),name:`${c.label}炉膛`,kind:'object',position:[0,0],state:{},owner,access:'public',derivedFrom:'fixture',
  thermalModel:{...c.firebox,fuels},thermalInitial:{temperatureC:c.firebox.ambientC,fuelMg:0,moistureMg:0}};
}
// 工位的热源是不是设备自带的炉膛（而不是显式登记的热源）。
export const hasOwnFirebox=station=>Boolean(station?.thermalRequirement)&&station.thermalRequirement.feature===fireboxId(station.id);
