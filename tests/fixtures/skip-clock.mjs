import {factionClockRules} from '../../server-plugin/faction-clock.mjs';
import {farmTargetFood} from '../../server-plugin/farm-target.mjs';
const DAY=1440,YEAR=360;
// Fixtures that jump state.minute instead of simulating the gap must also move faction
// clocks (T159 added daily clocks) to their next boundary, as if no clock day elapsed.
export function skipTo(engine,doc,minute){
 doc.state.minute=minute;
 for(const rule of factionClockRules(engine)){
  const key=Object.keys(doc.state.records??{}).find(k=>doc.state.records[k]?.category==='faction_clock'&&doc.state.records[k].id===rule.id);
  if(!key)continue;const row=doc.state.records[key];
  if(row.nextAt<minute)doc.state.records[key]={...row,nextAt:Math.ceil(minute/DAY/rule.intervalDays)*rule.intervalDays*DAY};
 }
 skipGranaries(engine,doc,minute);
 return doc;
}
// 跳日不经过日结，也就不经过收获日：开局那批公仓粮（收于开局前，到期日 = initialHarvestDay + 保质天数）在目标日已过期，价格读数里公仓粮就成了 0，
// 状态与真实世界不一致（真实世界里收获日补上新批次，开局规律对任意日期成立：存粮 = 该日的目标持有）。
// 本函数把已过期的公仓批次换成"按现行规律在该日应有"的状态：
//  · 最近一次收获日 = 作物收获日（agriculture.crop.sowDays[1] + growthDays，一年 360 日）在目标日之前最近的一天；
//  · 存量 = 该日的目标持有（farm-target.farmTargetFood，与开局存粮同一函数：餐口 × 距下次收获天数与保留天数，被容量 − 种粮封顶），批次到期 = 收获日 + 粮仓保质天数（好粮仓 protectedStorageDays，差粮仓 normalStorageDays，agriculture.mjs 的 storageDays 同一规则）；
//  · 种粮批次同样换成最近收获日的批次，种粮量不变；
//  · 农事账的守恒式补一笔：存量增加记入 harvested，减少记入 spoiled。
// 范围：只补公仓粮与种粮；作物生长（田里的 cohorts）、人口变化、商人库存等不推演（需要时应真实推进日结）。
function skipGranaries(engine,doc,minute){
 const rules=engine.rules.agriculture;if(!rules)return;
 const day=Math.floor(minute/DAY),harvest=rules.crop.sowDays[1]+rules.crop.growthDays;
 for(const p of rules.settlements){
  const r=doc.state.records?.[`agriculture:${p.settlement}`],s=doc.state.settlements?.[p.settlement];if(!r||!s)continue;
  const expired=r.batches.some(b=>b.expiresDay<=day)||(r.field.seedBatches??[]).some(b=>b.expiresDay<=day);
  if(!expired||day<harvest)continue;
  const harvestDay=harvest+YEAR*Math.floor((day-harvest)/YEAR),life=r.granary.condition>=50?p.protectedStorageDays:p.normalStorageDays,expiresDay=harvestDay+life;
  const food=farmTargetFood(engine,doc.state,p,minute),old=s.food;
  r.batches=food>0?[{id:`skip_harvest:${harvestDay}`,amount:food,harvestDay,expiresDay,source:'夹具跳日（按目标持有推出）',kind:'grain'}]:[];
  s.food=food;
  if(food>=old)r.ledger.harvested+=food-old;else r.ledger.spoiled+=old-food;
  r.field.seedBatches=r.field.seedBank>0?[{amount:r.field.seedBank,harvestDay,expiresDay}]:[];
 }
}
