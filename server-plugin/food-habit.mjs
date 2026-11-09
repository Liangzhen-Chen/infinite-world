// 食物来源的“惯常性”：本聚落居民日常会不会买这件东西，只读、全从世界数据推出，不按物品名、不按时代。
//   买得起 p    = 本聚落各户中，日常食物预算（户现金余额 × dailyFoodShare，读账本 purse 余额按户聚合）≥ 该来源单价的户数占比。
//                 laborValue 对所有居民给同一个数（默认熟练度 0），无区分度；没有可读的户收入口径，现金余额是世界里真实有差异的量，暂代收入；
//                 主观视图只看得到本户：本户预算 ≥ 单价则 p=1，否则 0，不读他户。
//   卖家广度 b  = min(1, 卖家数 / habitualSellers)，卖家数取本户看得到的同一物品、有可售量的来源；
//   惯常性 habit = p × b，低于 luxuryBelow 的来源是奢侈。
// 不复用 market.mjs 的稀缺比（marketSupply→stockSupply 会回头读每户的 householdResources，在预算内调用即无限递归，shop.mjs 报价处也因此传入固定供需）；
// 稀缺已在手写 basePrice 里，这里也不再折价格。
// 本户现金不超过 richCashDays 天的本户日均收入时，奢侈来源排在日常来源之后（household-budget 的 deferred），只补日常补不满的缺口；现金远超时与日常品一样按价值参与挑选。
import {laborValue} from './market.mjs';
import {coinRead,purse} from './money.mjs';
import {placeSettlement,personHousehold} from './entity-view.mjs';

// 本聚落各户的现金（户内成员的 purse 余额之和），有名册人物在场的户才计。
const householdCash=(d,engine,place)=>{
 const state=d.get('state'),out=[];
 for(const h of engine.world.households??[]){
  const live=h.members.filter(m=>state.npcs?.[m]?.location&&!['死亡','濒死','昏迷'].includes(state.npcs[m].status));
  if(!live.length||placeSettlement(engine,state,state.npcs[live[0]].location).value!==place)continue;
  out.push(live.reduce((n,m)=>n+coinRead(d,{point:'assets.cash',account:purse(engine,m),legacy:()=>state.npcs[m]?.coins??0}),0));
 }
 return out.sort((a,b)=>a-b);
};
export const affordableShare=(budgets,price,share)=>budgets.length?budgets.filter(c=>c*share>=price).length/budgets.length:0;

// 返回 {rich, sources}：sources 与入参一一对应，每项多出 habit（0..1）与 luxury（布尔）。规则表缺 foodHabit 时全部按日常品。
export function foodHabit(d,engine,owner,sources,{cash=0,view=null}={}){
 const rule=engine.world.marketRules.foodHabit;
 if(!rule||!sources.length)return {rich:true,sources:sources.map(s=>({...s,habit:1,luxury:false}))};
 const state=d.get('state'),document=d.document??{state},location=view?.self.location??(owner==='player'?state.location:state.npcs?.[owner]?.location),place=placeSettlement(engine,state,location).value;
 const budgets=view?[cash]:d.memo?d.memo(engine,['food-habit-cash',place],()=>householdCash(d,engine,place)):householdCash(d,engine,place);
 const members=personHousehold(engine,state,owner).value?.members??[owner];
 const income=members.reduce((n,id)=>n+laborValue(engine,document,{worker:id,observer:null}).daily,0);
 const rich=cash>=rule.richCashDays*income;
 const sellers=new Map();
 for(const s of sources){const set=sellers.get(s.item)??new Set();set.add(s.seller);sellers.set(s.item,set);}
 return {rich,sources:sources.map(s=>{
  const affordable=affordableShare(budgets,s.unitPrice,rule.dailyFoodShare);
  const habit=affordable*Math.min(1,sellers.get(s.item).size/rule.habitualSellers);
  // 奢侈 = 聚落里不惯常（habit 低），或超出本户日常预算（单价 > 本户现金 × dailyFoodShare）。
  return {...s,habit,luxury:habit<rule.luxuryBelow||s.unitPrice>cash*rule.dailyFoodShare};
 })};
}
