// 只读诊断：目标持有规律（farmTargetFood）改后，几个冒烟失败夹具里各聚落、各食物池/货类的 supply / demand / target。只向 stdout 打印 JSON；不写文件、不调模型。
// 用法：node tools/mktw-diag-market.mjs
// 场景：A = shop-restock / ke-upkeep 夹具口径（legacy 存档开局，minute 改 600，原样存粮）；B = s2c-fire 的 fireScene（loc_hw 粮存写死 8000）。
// 每个场景按 (地点, 物品) 打印：
//   settlement：state.settlements[place] 的 food、population；farm：农事记录的仓容、种粮；
//   target.farmTargetFood（被测原语，仅作对照）与 target.hand（按规则数据手推：餐口 × (距收获天数 + reserveDays)，上限 容量 − 种粮）、openingStockFood（日 0）；
//   market：marketSupply 的 supply、demand、scarcity=min(3,max(0.5,demand/max(1,supply)))，以及 rows（owner、item、stock、target、committed、available、unit）。
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {farmTargetFood,openingStockFood} from '../server-plugin/farm-target.mjs';
import {fireScene} from '../tests/probes/run-001/e06.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const read=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const limits=world.rules.economy.priceFactorLimits.region;
function report(engine,doc,label,pairs){
 const state=doc.state,out={label,minute:state.minute,items:[]};
 const crop=engine.rules.agriculture.crop,harvest=crop.sowDays[1]+crop.growthDays,doy=Math.floor(state.minute/1440)%360;
 for(const [place,item] of pairs){
  const s=state.settlements?.[place],profile=engine.rules.agriculture.settlements.find(p=>p.settlement===place),rec=state.records?.[`agriculture:${place}`];
  const row={place,item,settlement:s?{food:s.food,population:s.population,foodPerDay:s.foodPerDay,granary:s.granary}:null};
  if(profile){
   const days=((harvest-doy)%360+360)%360+profile.reserveDays;
   row.farm={capacity:rec?.granary?.capacity,seedBank:rec?.field?.seedBank,profileCapacity:profile.granaryCapacity,initialSeed:profile.initialSeed,reserveDays:profile.reserveDays};
   row.target={farmTargetFood:farmTargetFood(engine,state,profile,state.minute),targetDays:days,hand:Math.min(Math.ceil((s?.population??0)*days),Math.max(0,(rec?.granary?.capacity??profile.granaryCapacity)-(rec?.field?.seedBank??profile.initialSeed))),openingStockFood:openingStockFood(engine,profile,0)};
  }
  try{const m=marketSupply(read(doc),engine,item,place);row.market={supply:m.supply,demand:m.demand,scarcity:Math.min(limits[1],Math.max(limits[0],m.demand/Math.max(1,m.supply))),shelf:m.shelf,consumption:m.consumption,rows:m.rows.map(r=>({owner:r.owner,item:r.item,stock:r.stock,target:r.target,committed:r.committed,available:r.available,unit:r.unit}))};}
  catch(error){row.market={error:error.message};}
  out.items.push(row);
 }
 return out;
}
const results=[];
{
 const w=structuredClone(world),engine=new WorldEngine(w),doc=engine.initialFromLegacy(seed,'diag-market'),openingMinute=doc.state.minute;
 doc.state.minute=600;doc.state.location='bld_hw_qingdeng';
 const r=report(engine,doc,'A shop-restock/ke-upkeep（legacy 开局，minute→600）',[['loc_hw','item_oats'],['loc_hw','item_bread'],['loc_hw','item_mutton'],['loc_hw','item_charcoal'],['loc_hw','item_wood'],['loc_bs_yupo','item_oats'],['loc_bs','item_bread']]);
 r.legacyOpeningMinute=openingMinute;results.push(r);
}
{
 const S=fireScene();
 results.push(report(S.engine,S.d.document,'B s2c-fire（fireScene，loc_hw 粮存=8000）',[['loc_hw','item_oats'],['loc_hw','item_bread']]));
}
console.log(JSON.stringify(results,null,1));
