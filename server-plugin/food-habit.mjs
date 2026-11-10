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

// 现金口径：户内判定（奢侈里的“单价 > 现金 × share”、宽裕）两条路径都用买方本人的钱包（花钱的是本人的钱包，与 household-budget 的市场替代一致）；
// 聚落统计 p 只在客观路径用各户现金（成员 purse 之和，读账本）；主观视图的 view.self.accounts 只含本人账户，看不到他户成员的钱，p 只看本户（本人钱包）。
const memberCash=(d,engine,m,view=null)=>view?(view.self.accounts?.[purse(engine,m)]?.balance??view.self.coins??0):coinRead(d,{point:'assets.cash',account:purse(engine,m),legacy:()=>d.get('state').npcs?.[m]?.coins??0});
// 各户（有名册人物在场、未死亡/濒死/昏迷的成员才计）的 {household, owner（第一位在场成员）, place, cash（在场成员 purse 之和）}。审计与 foodHabit 共用这一份成员集合与现金。
export function localHouseholds(d,engine){
 const state=d.get('state'),out=[];
 for(const h of engine.world.households??[]){
  const live=h.members.filter(m=>state.npcs?.[m]?.location&&!['死亡','濒死','昏迷'].includes(state.npcs[m].status));
  if(!live.length)continue;
  out.push({household:h.id,owner:live[0],place:placeSettlement(engine,state,state.npcs[live[0]].location).value,cash:live.reduce((n,m)=>n+memberCash(d,engine,m),0)});
 }
 return out;
}
const householdCash=(d,engine,place)=>localHouseholds(d,engine).filter(r=>r.place===place).map(r=>r.cash).sort((a,b)=>a-b);
export const affordableShare=(budgets,price,share)=>budgets.length?budgets.filter(c=>c*share>=price).length/budgets.length:0;

// 返回 {rich, sources}：sources 与入参一一对应，每项多出 habit（0..1）与 luxury（布尔）。规则表缺 foodHabit 时全部按日常品。
export function foodHabit(d,engine,owner,sources,{view=null,read=null}={}){
 const rule=engine.world.marketRules.foodHabit;
 if(!rule||!sources.length)return {rich:true,sources:sources.map(s=>({...s,habit:1,luxury:false}))};
 const state=d.get('state'),document=d.document??{state},location=view?.self.location??(owner==='player'?state.location:state.npcs?.[owner]?.location),place=placeSettlement(engine,state,location).value;
 const members=personHousehold(engine,state,owner).value?.members??[owner];
 const own=memberCash(d,engine,owner,view);
 // 本聚落各户现金只由状态（账本余额、成员名册）与聚落定。游标草稿没有 d.memo，原先每次都重算；
// read 是调用方（household-budget 的 budgetRead）给的同版本记忆：游标按 revision、只读作用域按 state、ledger、randomSeed 三者的对象身份分键，任何状态与账本写入即失效，故值与重算相同。
 const budgets=view?[own]:read?read(['food-habit-cash',place],()=>householdCash(d,engine,place)):d.memo?d.memo(engine,['food-habit-cash',place],()=>householdCash(d,engine,place)):householdCash(d,engine,place);
 const income=members.reduce((n,id)=>n+laborValue(engine,document,{worker:id,observer:null}).daily,0);
 const rich=own>=rule.richCashDays*income;
 const sellers=new Map();
 for(const s of sources){const set=sellers.get(s.item)??new Set();set.add(s.seller);sellers.set(s.item,set);}
 return {rich,sources:sources.map(s=>{
  const affordable=affordableShare(budgets,s.unitPrice,rule.dailyFoodShare);
  const habit=affordable*Math.min(1,sellers.get(s.item).size/rule.habitualSellers);
  // 奢侈 = 聚落里不惯常（habit 低），或超出本户日常预算（单价 > 本户现金 × dailyFoodShare）。
  return {...s,habit,luxury:habit<rule.luxuryBelow||s.unitPrice>own*rule.dailyFoodShare};
 })};
}
