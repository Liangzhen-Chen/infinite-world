// K2 分销：持货人卖空（或低于本人平常的存货）后，向本聚落真实持有这件货的人进货。
// 货源是活人的可售存货（扣除本人与家户自留、已承诺的部分；对方若本身也是这件货的经营者，只出让超过他平常存货的余量），
// 不从模拟范围外补进。进货双方各自经 npcDecision 决定：买方看转卖所得能否抵过进价，卖方看所得。
// 价格是同一市场的报价：经营者进货走买入价差（business 的 buy 侧），转卖走卖出侧，价差就是他的毛利。
// 店铺（shop.mjs）与没有铺面的经营者共用这一条：店铺的本地货架按货架上限进货，其余经营者按开局时手上的存货量进货。
import {isEffective} from './lifecycle-state.mjs';
import {placeSettlement,personHousehold} from './entity-view.mjs';
import {marketQuote,recordMarketDeal,saleableStock} from './market.mjs';
import {transferItems} from './items.mjs';
import {purse,moveCoins,mirrorPartyCoins,coinRead} from './money.mjs';
import {obligationTransaction} from './transition.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {householdBudget} from './household-budget.mjs';
import {assessTradeTax,taxableSale} from './finance-tax.mjs';
import {recordFinanceSale} from './finance-assets.mjs';
import {recordsWhere} from './storage.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {declareHoldingWriter} from './holdings.mjs';
import {collectTransport} from './transport.mjs';
declareLedgerWriter('distribution',{});
declareHoldingWriter('distribution',{kinds:[]});

const DAY=1440;
const quantityOf=v=>typeof v==='number'?v:v?.quantity??0;
// 可交易物：物品目录里有定价、不是钱币类的货（按目录与类别，不按编号前缀）。
const catalogItems=new WeakMap();
const tradeable=(engine,item)=>{let ids=catalogItems.get(engine.world.items);if(!ids)catalogItems.set(engine.world.items,ids=new Map(engine.world.items.map(i=>[i.id,i])));const it=ids.get(item);return Boolean(it&&it.basePrice>0&&!(it.tags??[]).includes('coin'));};
const settlementOf=(engine,state,id)=>{const n=state.npcs?.[id];return n?placeSettlement(engine,state,n.location).value??null:null;};
const usable=(engine,state,id)=>{const n=state.npcs?.[id];return Boolean(n&&isEffective(engine,state,id)&&!['死亡','濒死','昏迷'].includes(n.status));};
// 午夜结算时双方都在睡觉；决定取本人当天醒着的上午十点的主观视图（与店主进货同一口径，shop.mjs keeperView）。
export function wakingView(d,engine,id,minute){
 const s=d.get('state'),n=s.npcs[id],day=Math.floor(minute/DAY)*DAY;
 return subjectiveView(engine,{...d.document,state:{...s,minute:day+600,npcs:{...s.npcs,[id]:{...n,activity:'日常起居',status:n.status??'正常'}}}},id);
}
const trades=base=>(base?.services??[]).includes('trade')||(base?.serviceCatalog??[]).some(s=>s?.kind==='trade');

// 经营者平常的存货：有交易服务的人开局手上为出售而持有的货。店铺另按货架上限（shop.mjs 传入）。
export function dealingStock(engine,id){
 const base=engine.byId.get(id);if(!trades(base))return {};
 return Object.fromEntries(Object.entries(base.inventory??{}).map(([item,v])=>[item,quantityOf(v)]).filter(([item,n])=>n>0&&tradeable(engine,item)));
}
// 某人手上这件货能出让给经营者的量：可售存货减去他自己作为经营者平常要留的那份。
export function holderSpare(d,engine,id,item){return spare(d,engine,id,item);}
function spare(d,engine,id,item){
 const available=saleableStock(d,engine,id,item).available;if(!(available>0))return 0;
 return Math.max(0,Math.floor(available-(dealingStock(engine,id)[item]??0)));
}
// 本聚落里这件货的真实持有人（按编号定序，确定性）。
function residentsOf(d,engine,settlement){
 const state=d.get('state');
 return Object.keys(state.npcs??{}).sort().filter(id=>usable(engine,state,id)&&settlementOf(engine,state,id)===settlement);
}
// 同一户的人不是彼此的货源：户里的东西本来就共用，向自家人“进货”不是从上游来的货。
function holdersIn(d,engine,settlement,item,buyer,residents=residentsOf(d,engine,settlement)){
 const home=new Set(personHousehold(engine,d.get('state'),buyer).value?.members??[buyer]);home.add(buyer);
 return residents.filter(id=>!home.has(id)&&engine.quantity(d,id,item)>0);
}
// 本聚落持货人眼下能出让给 buyer 的这件货合计（店主盘算下一次本地补货能补多少时读它）。
export function localSpare(d,engine,{settlement,item,buyer}){
 return holdersIn(d,engine,settlement,item,buyer).reduce((n,id)=>n+spare(d,engine,id,item),0);
}
// 向本聚落真实持货人进货，至多 want 件。pay/budget 由调用方给出（店铺柜台或本人钱袋）。
// 返回 {added,paidCopper,deals:[{seller,quantity,cost}],reason}。
export function buyFromHolders(d,engine,{buyer,settlement,item,want,minute,eventPrefix,view=null,cash=null,pay=null,decide=null,residents=undefined}){
 const out={added:0,paidCopper:0,deals:[],reason:null};
 if(!(want>=1))return out;
 const state=d.get('state'),location=state.npcs?.[buyer]?.location;
 const sellers=holdersIn(d,engine,settlement,item,buyer,residents);
 if(!sellers.length){out.reason='本聚落没有人持有这件货';return out;}
 const business={keeper:buyer,markup:1};
 for(const seller of sellers){
  if(out.added>=want)break;
  const can=Math.min(want-out.added,spare(d,engine,seller,item));if(can<1)continue;
  const sellerAt=d.get('state','npcs',seller,'location');
  const bill=n=>marketQuote(d,engine,{item,location:sellerAt,seller,buyer,quantity:n,business,minute});
  const budget=cash?cash():coinRead(d,{point:'npc.cash',account:purse(engine,buyer),legacy:()=>d.get('state','npcs',buyer,'coins')??0});
  let low=0,high=can;while(low<high){const mid=Math.ceil((low+high)/2);if(bill(mid).totalCoins<=budget)low=mid;else high=mid-1;}
  if(!low){out.reason??='进货钱不够';break;}
  const quote=bill(low),cost=quote.totalCoins;
  // 不到一文的批量不是买卖：持货人不会白送，这一批不成交（量大到值一文才成交）。
  if(cost<1){out.reason??='这批货不值一文';continue;}
  const resale=marketQuote(d,engine,{item,location:location??sellerAt,seller:buyer,quantity:low,business,minute}).totalCoins;
  const own=view??wakingView(d,engine,buyer,minute);
  const verdict=decide?decide({cost,resale,seller,quantity:low}):npcDecision(own,{kind:'restock',from:seller,cost:{value:cost},reward:resale});
  if(verdict.outcome!=='agree'){out.reason??=`买方决定不进：${verdict.reason??verdict.outcome}`;continue;}
  const consent=npcDecision(wakingView(d,engine,seller,minute),{kind:'sell',from:buyer,cost:{value:cost},reward:cost});
  if(consent.outcome!=='agree'){out.reason??='持货人不愿出让';continue;}
  const eventId=`${eventPrefix}:${item}:${seller}`;
  obligationTransaction(d,()=>{
   transferItems(d,engine,seller,buyer,item,low,null,{disposition:true,eventId});
   if(pay)pay({to:purse(engine,seller),amount:cost,eventId});
   else{moveCoins(d,{from:purse(engine,buyer),to:purse(engine,seller),amount:cost,writer:'distribution',eventId});mirrorPartyCoins(d,engine,buyer,-cost,eventId,'distribution');}
   mirrorPartyCoins(d,engine,seller,cost,eventId,'distribution');
   recordMarketDeal(d,quote,cost,low,eventId);
   const tax=taxableSale(engine,d.get('state'),seller,item)?assessTradeTax(d,engine,{seller,cost,location:sellerAt,sourceEvent:eventId}).amount:0;
   recordFinanceSale(d,engine,{buyer,seller,item,quantity:low,cost,tax,eventId});
  });
  out.added+=low;out.paidCopper+=cost;out.deals.push({seller,quantity:low,cost});
 }
 if(!out.added)out.reason??='持货人都没有可出让的余量';
 return out;
}
// 卡 E2：外地进的货托运到家（npc-labor 贩运行程在货源地订的运单）：收货人在到货地点，就提取已到站的实货。
// 只认 transport 记成 arrived 的真实运单；运单上记着承运人、运费与途中经过。
function collectArrivals(d,engine){
 const state=d.get('state');
 for(const trip of recordsWhere(state.records,'category','transport').filter(r=>r.status==='arrived'&&state.npcs?.[r.recipient]).sort((a,b)=>a.id.localeCompare(b.id))){
  if(!usable(engine,state,trip.recipient)||state.npcs[trip.recipient].location!==trip.to)continue;
  collectTransport(d,engine,trip.id,trip.recipient);
 }
}
// 没有铺面的经营者：每天一次，低于平常存货的货向本聚落持货人补进。店主由 shop.mjs 自己的周期补货负责。
export function advanceDealers(d,engine,minute,{keepers=new Set()}={}){
 collectArrivals(d,engine);
 const state=d.get('state'),day=Math.floor(minute/DAY),bySettlement=new Map();
 const residents=s=>{if(!bySettlement.has(s))bySettlement.set(s,residentsOf(d,engine,s));return bySettlement.get(s);};
 for(const id of Object.keys(state.npcs??{}).sort()){
  if(keepers.has(id)||!usable(engine,state,id))continue;
  const stock=dealingStock(engine,id),items=Object.keys(stock).filter(item=>engine.quantity(d,id,item)<stock[item]);
  if(!items.length)continue;
  const settlement=settlementOf(engine,d.get('state'),id);if(!settlement)continue;
  let view=null;
  const cash=()=>{
   view??=wakingView(d,engine,id,minute);
   const budget=householdBudget(d,engine,id,{view});
   return Math.max(0,Math.min(budget.cash,...budget.timeline.map(r=>r.balance)));
  };
  const rows=[];
  for(const item of items.sort()){
   const want=stock[item]-engine.quantity(d,id,item);
   if(!holdersIn(d,engine,settlement,item,id,residents(settlement)).some(s=>spare(d,engine,s,item)>0))continue;
   view??=wakingView(d,engine,id,minute);
   const r=buyFromHolders(d,engine,{buyer:id,settlement,item,want,minute,eventPrefix:`dealer:${id}:${day}`,view,cash,residents:residents(settlement)});
   rows.push({item,wanted:want,added:r.added,paidCopper:r.paidCopper,deals:r.deals,...(r.reason&&!r.added?{reason:r.reason}:{})});
   if(r.added)view=null;
  }
  if(rows.length)d.set(['state','records',`dealer_restock:${id}:${day}`],{category:'dealer_restock',dealer:id,settlement,minute,day,rows});
 }
}
export const dealerRestockRecords=state=>recordsWhere(state.records,'category','dealer_restock');
