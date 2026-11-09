// 食物来源的“惯常性”：本聚落居民日常会不会买这件东西，只读、全从世界数据推出，不按物品名、不按时代。
//   买得起 p    = 本聚落居民里，一份单价不超过其日均收入 × dailyFoodShare 的人所占比例（收入读 laborValue，价格用来源的实际单价）；
//   卖家广度 b  = min(1, 卖家数 / habitualSellers)，卖家数取本户看得到的同一物品、有可售量的来源；
//   惯常性 habit = p × b，低于 luxuryBelow 的来源是奢侈。
// 不复用 market.mjs 的稀缺比（marketSupply→stockSupply 会回头读每户的 householdResources，在预算内调用即无限递归，shop.mjs 报价处也因此传入固定供需）；
// 稀缺已在手写 basePrice 里，这里也不再折价格。
// 本户现金不超过 richCashDays 天的本户日均收入时，奢侈来源不参与购买；现金远超时，奢侈来源与日常品一样按价值参与挑选。
import {laborValue} from './market.mjs';
import {placeSettlement,personHousehold} from './entity-view.mjs';

const residentIncomes=(d,engine,place)=>{
 const state=d.get('state'),document=d.document??{state},ids=Object.keys(state.npcs??{}).filter(id=>{const n=state.npcs[id];return n?.location&&!['死亡','濒死','昏迷'].includes(n.status)&&placeSettlement(engine,state,n.location).value===place;});
 return ids.map(id=>laborValue(engine,document,{worker:id,observer:null}).daily).sort((a,b)=>a-b);
};

// 返回 {rich, sources}：sources 与入参一一对应，每项多出 habit（0..1）与 luxury（布尔）。规则表缺 foodHabit 时全部按日常品。
export function foodHabit(d,engine,owner,sources,{cash=0,view=null}={}){
 const rule=engine.world.marketRules.foodHabit;
 if(!rule||!sources.length)return {rich:true,sources:sources.map(s=>({...s,habit:1,luxury:false}))};
 const state=d.get('state'),document=d.document??{state},location=view?.self.location??(owner==='player'?state.location:state.npcs?.[owner]?.location),place=placeSettlement(engine,state,location).value;
 const incomes=d.memo?d.memo(engine,['food-habit-incomes',place],()=>residentIncomes(d,engine,place)):residentIncomes(d,engine,place);
 const members=personHousehold(engine,state,owner).value?.members??[owner];
 const income=members.reduce((n,id)=>n+laborValue(engine,document,{worker:id,observer:null}).daily,0);
 const rich=cash>=rule.richCashDays*income;
 const sellers=new Map();
 for(const s of sources){const set=sellers.get(s.item)??new Set();set.add(s.seller);sellers.set(s.item,set);}
 return {rich,sources:sources.map(s=>{
  const affordable=incomes.length?incomes.filter(x=>x*rule.dailyFoodShare>=s.unitPrice).length/incomes.length:0;
  const habit=affordable*Math.min(1,sellers.get(s.item).size/rule.habitualSellers);
  return {...s,habit,luxury:habit<rule.luxuryBelow};
 })};
}
