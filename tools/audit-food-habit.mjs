// 回归守护：贫户（本聚落户现金分位 ≤ poorQuantile 的户）在预算期内的市场替代购买里，奢侈来源（food-habit 的惯常性判定，不按物品名）的花费占比（只统计有日常来源可买的户；只有奢侈来源时补缺口的购买不计）不超过规则表 foodHabit.poorPurchaseLuxuryShareMax。
// 只读：对每户调用 householdResources，不推进、不写状态。
import {householdResources} from '../server-plugin/household-budget.mjs';
import {coinRead,purse} from '../server-plugin/money.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';

export function poorLuxuryShare(engine,doc,{poorQuantile=0.5}={}){
 const d=engine.primitiveDraft(doc),state=doc.state,max=engine.world.marketRules.foodHabit?.poorPurchaseLuxuryShareMax??1;
 const rows=[];
 for(const h of engine.world.households){
  const id=h.members.find(m=>state.npcs?.[m]?.location);if(!id)continue;
  rows.push({household:h.id,owner:id,place:placeSettlement(engine,state,state.npcs[id].location).value,cash:h.members.reduce((n,m)=>n+coinRead(d,{point:'assets.cash',account:purse(engine,m),legacy:()=>state.npcs?.[m]?.coins??0}),0)});
 }
 const cut=new Map();
 for(const place of new Set(rows.map(r=>r.place))){
  const cash=rows.filter(r=>r.place===place).map(r=>r.cash).sort((a,b)=>a-b);
  cut.set(place,cash[Math.max(0,Math.ceil(cash.length*poorQuantile)-1)]);
 }
 let luxury=0,total=0,poor=0;const byItem={};
 for(const r of rows){
  if(r.cash>cut.get(r.place))continue;
  poor++;
  // 只计“有日常来源可买”的户（至少买了一件日常来源）：只有奢侈来源时补缺口的购买不算违规。
  const buys=householdResources(d,engine,r.owner).market.purchases;
  if(!buys.some(p=>!p.luxury))continue;
  for(const p of buys){
   total+=p.cost;if(p.luxury){luxury+=p.cost;byItem[p.item]=(byItem[p.item]??0)+p.cost;}
  }
 }
 const share=total>0?luxury/total:0;
 return {poor,total,luxury,share,max,ok:share<=max,byItem};
}
