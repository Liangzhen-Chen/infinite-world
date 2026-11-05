// Read-only market projections. Only completed trades are persisted, never quotes.
import {bagStock,priceRead,settlementStock,granary,pledged,freight,crop as cropAccount} from './stock.mjs';
import {privateCropYieldBase} from './domain-rules.mjs';
import {placeSettlement,personBusinesses} from './entity-view.mjs';
import {explainDerived} from './derived.mjs';
import {obligationRows,obligationClosed,currentGrace,institutionOriginal} from './obligation-state.mjs';
import {aliveHoldings,holdingsView} from './holdings.mjs';
import {reject} from './action-rejection.mjs';
import {recordsMemo} from './storage.mjs';
import {householdResources,householdCommitments} from './household-budget.mjs';
import economyBalance from '../world/rules/tables/balance/economy.json' with {type:'json'};
import {ln,pow,fromRational,toRational} from './det-math.mjs';

// 顾客一天在商家花费的上限占其钱袋的比例、居民步行上门的最长分钟：数值参数表 balance/economy 的登记值
// （商店成交、书籍出版的读者、店铺客流共用；不在代码里写字面）。
const balanceParam=(engine,id)=>(engine.world.balance?.economy??economyBalance).params.find(row=>row.id===id).value;
export const customerPurseShare=engine=>balanceParam(engine,'shop.customerPurseShare');
export const customerReachMinutes=engine=>balanceParam(engine,'shop.customerReachMinutes');
// 全部商铺（手工登记的与按人物派生的）在某聚落的货架条目：由 shop.mjs 登记，market 只读。
let shopShelves=()=>null;
export function registerShopShelves(fn){shopShelves=fn;}
const DAY=1440;
const quantity=v=>typeof v==='number'?v:v?.quantity??0;
const clamp=(v,limits)=>Math.max(limits[0],Math.min(limits[1],v));
const stateOf=d=>d.get('state');
const rulesOf=engine=>engine.world.marketRules;
const itemValue=(engine,document,item,base,scarcity,quality)=>explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcity*quality});
// A pure function of the catalog row and the goods-tag table; remembered per row
// object and revalidated against both inputs, so no live state can go stale.
const goodsClasses=new WeakMap();
export function goodsClass(engine,item){
 const row=engine.byId.get(item),table=rulesOf(engine).goodsTags;
 const hit=row&&typeof row==='object'?goodsClasses.get(row):null;
 if(hit&&hit.table===table&&hit.tags===row.tags&&hit.count===row.tags?.length&&hit.item===item&&hit.satiety===row.nutrition?.satiety)return hit.value;
 const tags=row?.tags??[];
 const category=Object.entries(table).find(([tag])=>tags.includes(tag))?.[1];
 const value=tags.find(t=>t.startsWith('goods:'))??`goods:${category??(row?.nutrition?.satiety>0?'food':item)}`;
 if(row&&typeof row==='object')goodsClasses.set(row,{table,tags:row.tags,count:row.tags?.length,item,satiety:row.nutrition?.satiety,value});
 return value;
}
const locationOf=(state,id)=>id==='player'?state.location:state.npcs?.[id]?.location??state.creatures?.[id]?.location;
const settlementOf=(engine,state,location)=>placeSettlement(engine,state,location).value??location;
const inventoryOf=(state,id)=>{
 const actor=state.npcs?.[id]??state.creatures?.[id],mark=actor?.materialized;
 return id==='player'?state.inventory:mark?.folded?state.records[`remote-stock:${mark.settlement}`].members[id].inventory:actor?.inventory??{};
};
function marketDeals(state){
 return recordsMemo(state.records,marketDeals,()=>readMarketDeals(state));
}
function readMarketDeals(state){
 const rows=[];
 for(const [key,row]of Object.entries(state.records??{})){
  if(!key.startsWith('market-trade:')&&row.category!=='market_trade')continue;
  if(row.category!=='market_trade'||!Number.isSafeInteger(row.quantity)||row.quantity<1||!Number.isSafeInteger(row.day)||row.day<0||!Number.isSafeInteger(row.totalCoins)||row.totalCoins<0||!['sell','buy'].includes(row.side))throw Error('市场成交账无效');
  rows.push(row);
 }
 return rows;
}

function personalReserves(d,engine,owner){return reserveAllocation(d,engine,owner).reserved;}
// 一户人按储备天数需要的口粮、饮水中，目前行囊里的存粮没能覆盖的缺口（营养单位）：居民自己的真实采购需求。
export function reserveShortfall(d,engine,owner){return reserveAllocation(d,engine,owner).shortfall;}
function reserveAllocation(d,engine,owner){
 const budget=householdResources(d,engine,owner);
 return {shortfall:budget.procurementShortfall,reserved:new Map(budget.rows.filter(r=>r.holder===owner).map(r=>[r.item,r.retained]))};
}
const commitments=householdCommitments;
// D15 §15.6: reliability is a projection of actual performances, never a
// reputation counter written when a quote happens to be read.
export function forwardReliability(d,engine,debtor){
 const state=stateOf(d),rules=rulesOf(engine).forward;let fulfilled=0,cancelled=0,defaults=0,blockedUntil=0;
 for(const row of obligationRows(state).filter(r=>r.kind==='forward'&&r.debtor===debtor)){
  const remaining=Math.max(0,row.amount-(row.paid??0));
  const deadline=row.deadline+currentGrace(engine,state,row,state.minute).minutes;
  const late=(remaining>0?Math.min(state.minute,row.endedAt??Infinity):row.resolvedAt)>deadline;
  if(late){defaults++;blockedUntil=Math.max(blockedUntil,deadline+rules.defaultQuarters*rules.quarterMinutes);}
  else if(row.endedAt!==undefined||row.status==='cancelled')cancelled++;
  else if(row.status==='completed'&&!remaining)fulfilled++;
 }
 const cancellationWeight=explainDerived(engine,d.document??{state},'economy:forwardCancellation',debtor,{base:rules.cancellationWeight}).value;
 const attempts=fulfilled+defaults+cancelled*cancellationWeight;
 const reliability=state.minute<blockedUntil?0:attempts?fulfilled/attempts:0;
 return {debtor,fulfilled,cancelled,defaults,blockedUntil,reliability};
}
export function forwardSupply(d,engine,item,location){
 const state=stateOf(d),document=d.document??{state},place=settlementOf(engine,state,location),allocations=new Map(),rows=[];
 const forwards=obligationRows(state).filter(r=>r.kind==='forward'&&engine.byId.has(r.resource)&&!obligationClosed(r)&&r.endedAt===undefined&&r.deadline>state.minute)
  .sort((a,b)=>a.deadline-b.deadline||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 for(const row of forwards){
  const resource=row.resource,remaining=Math.max(0,row.amount-(row.paid??0)),key=`${row.debtor}:${resource}`;
  // All destinations share one stock budget, including promises outside this market.
  const promised=forwards.filter(r=>r.debtor===row.debtor&&r.resource===resource).reduce((sum,r)=>sum+Math.max(0,r.amount-(r.paid??0)),0);
  const otherCommitments=Math.max(0,commitments(state,row.debtor,resource)-promised);
  const retained=personalReserves(d,engine,row.debtor).get(resource)??0;
  const production=Object.values(state.records??{}).filter(f=>f.category==='private_farm'&&f.owner===row.debtor&&f.crop===resource&&['growing','ready'].includes(f.status)).reduce((sum,farm)=>{
   const title=state.buildings?.[farm.location];
   if(title?.owner!==row.debtor||title.condition<=0||Object.values(state.records??{}).some(r=>r.kind==='asset_lease'&&r.subject===farm.location&&r.tenant!==row.debtor&&r.status==='有效'&&r.deadline>state.minute))return sum;
   if(farm.status==='ready')return (farm.expiresDay*DAY>row.deadline)?sum+priceRead(d,{point:'region.material',account:cropAccount(engine,farm.location,resource),lots:{id:`private:${farm.seedEvent}`,after:Math.floor(row.deadline/DAY)},legacy:()=>farm.yield}):sum;
   const remainingDays=Math.max(0,engine.rules.agriculture.crop.growthDays-farm.grownDays);
   const maturesAt=state.minute+remainingDays*DAY,storageDays=engine.rules.agriculture.settlements.find(p=>p.settlement===farm.settlement)?.normalStorageDays??0;
   if(maturesAt>row.deadline||row.deadline>=maturesAt+storageDays*DAY)return sum;
   return sum+Math.floor(explainDerived(engine,document,'economy:yield',farm.location,{holder:farm.owner,base:privateCropYieldBase(engine,farm)}).value);
  },0);
  const capacity=Math.max(0,bagStock(d,engine,{point:'region.material',id:row.debtor,item:resource,legacy:()=>quantity(inventoryOf(state,row.debtor)[resource])})+production-retained-otherCommitments-(allocations.get(key)??0));
  const backed=Math.min(remaining,capacity);allocations.set(key,(allocations.get(key)??0)+backed);
  if(resource!==item||settlementOf(engine,state,row.terms?.performance?.location)!==place)continue;
  const consideration=row.terms?.forward?.consideration;
  const payment=state.obligations?.[`${row.id}:prepayment`];
  const paidRatio=consideration>0?Math.min(1,(payment?.paid??0)/consideration):0;
  const threshold=explainDerived(engine,document,'economy:forwardPaidThreshold',row.debtor,{base:rulesOf(engine).forward.paidThreshold}).value;
  const history=forwardReliability(d,engine,row.debtor);
  let securedValue=0;
  for(const pledge of aliveHoldings(holdingsView(document),{kind:'pledged',holder:row.id})){
   // A template id or a quoted collateral value is not a physical guarantee.
   // Shared pledges divide the same backing, rather than multiplying its value.
   const claimants=aliveHoldings(holdingsView(document),{kind:'pledged',subject:pledge.subject}).length;
   const record=state.records?.[pledge.subject],unit=institutionOriginal(engine,document,pledge.subject);
   const definition=engine.byId.get(record?.category==='pledge'?record.item:unit?.item);
   if(!definition)continue;
   const units=record?.category==='pledge'&&record.owner===row.debtor&&record.status==='质押中'
    ?priceRead(d,{point:'region.material',account:pledged(engine,pledge.subject,record.item),legacy:()=>record.quantity})
    :unit&&unit.destroyedAt===undefined?1:0;
   if(units>0){
    // A pledge cannot obtain its own backing value from the forwards it backs.
    // Use the shared item valuation with current stock/demand and actual grade.
    const stock=stockSupply(d,engine,definition.id,row.terms?.performance?.location),scarcity=clamp(stock.demand/Math.max(1,stock.supply),engine.rules.economy.priceFactorLimits.region);
    const quality=marketGrade(engine,document,definition.id,{seller:row.debtor,instances:record?.instances??[pledge.subject],quantity:units});
    // 保留目录基准价：这里正是估值投影的基准输入（再乘稀缺与品质）；若走 goods 估值会经 marketSupply→forwardSupply 回到本函数，循环取数。
    securedValue+=itemValue(engine,document,definition.id,definition.basePrice,scarcity,quality).value*units/claimants;
   }
  }
  const unitValue=consideration/row.amount;
  const secured=unitValue>0?Math.min(backed,securedValue/unitValue):0;
  const horizon=rulesOf(engine).forward.timeDiscountMinutes??rulesOf(engine).forward.quarterMinutes;
  const timeDiscount=horizon/(horizon+Math.max(0,row.deadline-state.minute));
  const expected=paidRatio>=threshold&&state.minute>=history.blockedUntil?Math.min(backed,Math.max(backed*history.reliability,secured))*paidRatio*timeDiscount:0;
  rows.push({id:row.id,debtor:row.debtor,item,remaining,production,capacity:backed,paidRatio,secured,reliability:history.reliability,timeDiscount,expected});
 }
 return {expected:rows.reduce((sum,row)=>sum+row.expected,0),rows};
}
function budgetStock(budget,owner,item){
 const row=budget.rows.find(r=>r.holder===owner&&r.item===item);
 return row?{owner,item,stock:row.stock,retained:row.retained,committed:row.committed,available:row.available}:{owner,item,stock:0,retained:0,committed:0,available:0};
}
export function saleableStock(d,engine,owner,item,{business=false}={}){
 return budgetStock(householdResources(d,engine,owner),owner,item);
}

// 家户日用（柴、盐……）的欠量是采买需求，进本地需求、抬高稀缺价，也进顾客的采买意愿（business.wants）。
// 接口位置：F 卡 npc-life 的 householdUpkeepGap(state,key) 合入 t-int 后在这里读它（按持有人的家户与物品折成件数）；在那之前为 0。
export function upkeepDemand(state,engine,id,item){return 0;}
function stockSupply(d,engine,item,location,{businessOwners=[]}={}){
 const state=stateOf(d),place=settlementOf(engine,state,location),goods=goodsClass(engine,item),rows=[];
 let personalDemand=0;
 const items=engine.world.items.filter(i=>goodsClass(engine,i.id)===goods);
 const owners=new Set(businessOwners);
 for(const store of engine.rules.economy?.shops?.stores??[])owners.add(store.keeper);
 for(const npc of engine.world.npcs)if(npc.shopType||(npc.services??[]).includes('trade'))owners.add(npc.id);
 // 15 §15.2：本地可售存量来自市场经营者，不是每个人“可以被买走”的行囊。
 // 当前转业/承租后开张的商家也属于供给，不能只认目录里的原店主。
 // 通用 serviceCatalog.trade 只允许人对人交易，不等于开店；经营类型才是营业身份。
 for(const [id,business]of personBusinesses(engine,state))if(business?.open.value&&business.shopType.value)owners.add(id);
 for(const id of ['player',...Object.keys(state.npcs??{}),...Object.keys(state.creatures??{})]){
  if(settlementOf(engine,state,locationOf(state,id))!==place)continue;
  // One read-only household allocation serves all items in this quote. No
  // writes occur in the loop; repeated allocation cannot change the budget.
  const budget=householdResources(d,engine,id);
  for(const it of items)personalDemand+=upkeepDemand(state,engine,id,it.id);
  for(const it of items){const row=budgetStock(budget,id,it.id);if(!row.stock)continue;
   if(owners.has(id))rows.push(row);
   else personalDemand+=row.retained+row.committed; // 只排除私人供给，保留原有消费与承诺需求。
  }
 }
 const profile=engine.rules.agriculture?.settlements.find(p=>p.settlement===place),settlement=state.settlements?.[place];
 for(const it of items){
  const stockName=Object.entries(engine.rules.economy?.shops?.stockItems??{}).find(([,id])=>id===it.id)?.[0];
  if(!settlement||!stockName)continue;
  const farm=state.records?.[`agriculture:${place}`],day=Math.floor(state.minute/DAY);
  const stock=stockName==='food'
   ?priceRead(d,{point:'region.grain',account:granary(engine,place),lots:{kind:'grain',after:day},legacy:()=>farm?.batches?.filter(b=>b.kind==='grain'&&b.expiresDay>day).reduce((n,b)=>n+b.amount,0)??settlement.food??0})
   :priceRead(d,{point:'region.material',account:settlementStock(engine,place,stockName),legacy:()=>settlement[stockName]??0});
  const retained=stockName==='food'?(settlement.population??0)*(profile?.reserveDays??1):0;
  const committed=commitments(state,place,it.id);rows.push({owner:place,item:it.id,stock,retained,committed,available:Math.max(0,stock-retained-committed)});
 }
 const supply=rows.reduce((n,r)=>n+r.available,0);
 // Shelf ceilings and household retention are actual demand inputs.
 // F026：货架读全部商铺（含按人物派生的），不再只读登记的几家静态店；居民口粮需求是每位持有人（含户内成员）的储备目标，
 // 已在上面 rows.retained 与 personalDemand 中逐户计入，聚落粮仓另计全村储备——这里不再重复计入口粮需求。
 const shelf=(shopShelves(engine,place)??(engine.rules.economy?.shops?.stores??[]).filter(s=>s.settlement===place).flatMap(s=>s.restock??[])).filter(r=>items.some(i=>i.id===r.item)).reduce((n,r)=>n+r.maximum+(r.reserve??0),0);
 const demand=Math.max(shelf,personalDemand+rows.reduce((n,r)=>n+r.retained+r.committed,0),1);
 return {place,goods,supply,demand,rows};
}
export function marketSupply(d,engine,item,location,options={}){
 const current=stockSupply(d,engine,item,location,options);
 const forward=engine.world.items.filter(it=>goodsClass(engine,it.id)===current.goods).map(it=>forwardSupply(d,engine,it.id,location));
 const state=stateOf(d),horizon=rulesOf(engine).forward.timeDiscountMinutes??rulesOf(engine).forward.quarterMinutes,consignments=[];
 for(const row of Object.values(state.records??{})){
  if(row.category!=='transport'||!['booked','moving','delayed','arrived'].includes(row.status)||settlementOf(engine,state,row.to)!==current.place)continue;
  // K12 debits the goods and prepays carriage at booking. Only the remaining
  // physical freight account backs this secured expectation, never a quote.
  const allocated=new Map();
  for(const cargo of row.cargo??[]){
   if(goodsClass(engine,cargo.item)!==current.goods)continue;
   const held=priceRead(d,{point:'region.material',account:freight(engine,row.id,cargo.item),legacy:()=>row.cargo.filter(c=>c.item===cargo.item).reduce((n,c)=>n+c.quantity,0)});
   const capacity=Math.min(cargo.quantity,Math.max(0,held-(allocated.get(cargo.item)??0)));allocated.set(cargo.item,(allocated.get(cargo.item)??0)+capacity);
   const at=row.status==='arrived'?state.minute:Math.max(row.estimatedArrivalAt,row.transport?.nextAt??0);
   const timeDiscount=horizon/(horizon+Math.max(0,at-state.minute));
   consignments.push({id:row.id,item:cargo.item,capacity,secured:capacity,paidRatio:1,reliability:0,timeDiscount,expected:capacity*timeDiscount});
  }
 }
 const expected=forward.reduce((sum,row)=>sum+row.expected,0)+consignments.reduce((n,r)=>n+r.expected,0);
 // 15 §15.2: backed, discounted promises affect prices, not spot delivery.
 return {...current,spotSupply:current.supply,supply:current.supply+expected,expected,forwards:forward.flatMap(row=>row.rows),consignments};
}
export function marketGrade(engine,document,item,{seller,instances=null,quantity:count=1}={}){
 const state=document.state,catalog=engine.byId.get(item),r=rulesOf(engine),order=engine.rules.equipment.qualities;
 const bag=inventoryOf(state,seller),ids=instances??bag[item]?.instances?.slice(0,count)??[];
 const units=ids.map(id=>state.itemInstances?.[id]).filter(Boolean);
 const grade=unit=>{
  const quality=pow(r.qualityStep,Math.max(0,order.indexOf(unit?.quality??catalog.quality))-Math.max(0,order.indexOf(catalog.quality)));
  const liquid=unit?.liquid;
  if(!liquid||!liquid.waterMl)return quality;
  const unsafe=(liquid.toxinUg??0)/liquid.waterMl*1000>r.water.toxinUgPerLitre||(liquid.pathogenRisk??0)>0;
  const impaired=(liquid.saltMg??0)/liquid.waterMl*1000>r.water.saltMgPerLitre||(liquid.turbidity??0)>0;
  return quality*(unsafe?r.water.unsafeFactor:impaired?r.water.impairedFactor:1);
 };
 const ordinary=grade(typeof bag[item]==='object'?bag[item]:null);
 return (units.reduce((n,u)=>n+grade(u),0)+Math.max(0,count-units.length)*ordinary)/count;
}
// The supply a quote reads. Callers pricing several quantities of one item in a row (no writes in between)
// compute it once and pass it back as `supply`; the value is identical to what marketQuote derives itself.
export function quoteSupply(d,engine,{item,location,business=null}){return marketSupply(d,engine,item,location,{businessOwners:business?[business.keeper]:[]});}
// 不含某持有人自己那批货的供给：海关估入境货值时，货物自身不压低入境地的价格。
export function supplyApart(d,engine,{item,location,owner}){
 const all=quoteSupply(d,engine,{item,location}),own=all.rows.filter(r=>r.owner===owner).reduce((n,r)=>n+r.available,0);
 return {...all,supply:all.supply-own,spotSupply:(all.spotSupply??all.supply)-own,rows:all.rows.filter(r=>r.owner!==owner)};
}
// Integrate the same clamped demand/supply curve for a trade or a liquidation.
function scarcityIntegral(supply,limits,a,b){
 if(b<=a)return 0;const D=supply.demand,low=D/limits[1],high=D/limits[0];let sum=0;
 const left=Math.min(b,low);if(left>a)sum+=(left-a)*limits[1];
 const x=Math.max(a,low),y=Math.min(b,high);if(y>x)sum+=D*ln(y/x);
 const right=Math.max(a,high);if(b>right)sum+=(b-right)*limits[0];return sum;
}
function integrateMarginal(marginal,count){
 const simpson=(a,b,fa,fm,fb)=>(b-a)*(fa+4*fm+fb)/6;
 const integrate=(a,b,fa,fm,fb,whole,tolerance,left)=>{
  const m=(a+b)/2,l=marginal((a+m)/2),r=marginal((m+b)/2);
  const first=simpson(a,m,fa,l,fm),second=simpson(m,b,fm,r,fb),delta=first+second-whole;
  if(!left||Math.abs(delta)<=15*tolerance)return first+second+delta/15;
  return integrate(a,m,fa,l,fm,first,tolerance/2,left-1)+integrate(m,b,fm,r,fb,second,tolerance/2,left-1);
 };
 const fa=marginal(0),fm=marginal(count/2),fb=marginal(count);
 return integrate(0,count,fa,fm,fb,simpson(0,count,fa,fm,fb),1e-7,16);
}
// Collateral is valued by selling the lot into this market: each unit adds to
// public supply. Small retail lots retain unit value; no shop spread/day price.
export function liquidationValue(d,engine,{item,location,holder,quantity:count,base,supply}){
 const document=d.document??{state:stateOf(d)},r=rulesOf(engine),limits=engine.rules.economy.priceFactorLimits.region;
 const quality=marketGrade(engine,document,item,{seller:holder,quantity:count});
 const scarcity=clamp(supply.demand/Math.max(1,supply.supply),limits);
 const projection=explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcity*quality});
 if(count<=Math.max(r.retailFloor,supply.supply*r.retailShare))return count*projection.value;
 if(!projection.contributions.length)return base*quality*scarcityIntegral(supply,limits,supply.supply,supply.supply+count);
 return integrateMarginal(x=>explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*quality*clamp(supply.demand/Math.max(Number.EPSILON,supply.supply+x),limits)}).value,count);
}
export function marketQuote(d,engine,{item,location,seller,buyer,quantity:count=1,business=null,base=engine.byId.get(item)?.basePrice,relation=1,instances=null,minute=stateOf(d).minute,observer=null,view=null,supply:given=null}){
 const document=d.document??{state:stateOf(d)},state=document.state,r=rulesOf(engine),side=business?(business.keeper===seller?'sell':'buy'):seller==='player'?'buy':'sell';
 const supply=given??quoteSupply(d,engine,{item,location,business});
 const day=Math.floor(minute/DAY),deals=marketDeals(state).filter(row=>row.day===day&&row.place===supply.place&&row.goods===supply.goods);
 const spotSupply=supply.spotSupply??supply.supply;
 const net=deals.reduce((n,row)=>n+(row.side==='sell'?row.quantity:-row.quantity),0),opening=Math.max(1,spotSupply+net);
 const scarcity=clamp(supply.demand/Math.max(1,supply.supply),engine.rules.economy.priceFactorLimits.region);
 const depth=Math.max(0,1+r.depthImpact*net/opening),quality=marketGrade(engine,document,item,{seller,instances,quantity:count});
 const value=explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcity*quality,observer,view});
 const spread=business?(side==='sell'?clamp(business.markup,engine.rules.economy.priceFactorLimits.shop):r.spread.buy):1;
 const price=explainDerived(engine,document,'economy:price',item,{base:value.value*depth*spread*relation,observer,view});
 // 15 §15.2: peer trade has no business stock curve and always uses retail value.
 const retail=!business||count<=Math.max(r.retailFloor,spotSupply*r.retailShare);
 // Integrate the clamped demand/supply curve analytically. Quality, correction
 // and spread are fixed for this lot; stock changes along the executed quantity.
 const limits=engine.rules.economy.priceFactorLimits.region;
 const integral=(a,b)=>scarcityIntegral(supply,limits,a,b);
 const curve=retail?count*scarcity:side==='sell'?integral(Math.max(0,supply.supply-count),supply.supply):integral(supply.supply,supply.supply+count);
 let exactTotal=price.value*(retail?count:curve/scarcity);
 if(!retail&&(value.contributions.length||price.contributions.length)){
  // Additive corrections and clamps cannot be scaled as a percentage of the
  // initial quote. Integrate the actual corrected marginal price instead.
  const marginal=x=>{
   const available=Math.max(0,supply.supply+(side==='sell'?-x:x));
   const scarcityAt=clamp(supply.demand/Math.max(Number.EPSILON,available),limits);
   const v=explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcityAt*quality,observer,view});
   return explainDerived(engine,document,'economy:price',item,{base:v.value*depth*spread*relation,observer,view}).value;
  };
  exactTotal=integrateMarginal(marginal,count);
 }
 // 15 §15.2 / 14 §14.6: truncate the complete bill once, never each unit.
 const totalCoins=Math.trunc(exactTotal);
 return {...supply,day,side,item,buyer,seller,business:business?.keeper??null,quantity:count,listPrice:price.value,totalCoins,exactTotal,retail,dynamic:true,opening,
  explanation:{baseline:engine.byId.get(item).basePrice,environment:base/engine.byId.get(item).basePrice,base,scarcity,quality,depth,spread,relation,value,price,curve,rounding:totalCoins-exactTotal}};
}
export function assertMarketDepth(d,engine,quote,{agreed=false}={}){
 if(agreed)return;
 const r=rulesOf(engine),state=stateOf(d),deals=marketDeals(state).filter(row=>row.day===quote.day&&row.goods===quote.goods&&(quote.business?row.business===quote.business:row.seller===quote.seller&&row.buyer===quote.buyer));
 const used=deals.reduce((n,row)=>n+row.quantity,0);
 // 15 §15.2：商号另有渠道日限额；人对人没有商号存量，不能把私人持货排除供给后再按零存量限购。
 // K08: executable lot depth reads physical spot stock, never discounted forwards.
 if(!quote.retail&&quote.quantity>Math.max(r.retailFloor,(quote.spotSupply??quote.supply)*r.maxShare)||quote.business&&used+quote.quantity>Math.max(r.retailFloor,quote.opening*r.dailyShare))reject('E-ACTION-PRECONDITION','市场今天没有那么多可成交深度');
 const stock=saleableStock(d,engine,quote.seller,quote.item,{business:quote.side==='sell'});
 // Household food retention models an NPC's own judgement (05 §5.1.3); it is
 // never a hard limit on what the player chooses to sell. Only goods already
 // promised to someone else are excluded from the player's saleable stock.
 const available=quote.seller==='player'?Math.max(0,stock.stock-stock.committed):stock.available;
 if(quote.quantity>available)reject('E-ACTION-PRECONDITION',quote.seller==='player'?'你的可售数量不足：已经答应交给别人的存量不能再卖':'对方库存不足：扣除自用和已承诺存量后不够出售');
}
// settled (S5-F): the resource and amount a deal was actually settled in, when not the reference coin.
export function recordMarketDeal(d,quote,totalCoins,quantity,eventId,settled=null){
 d.set(['state','records',`market-trade:${eventId}`],{category:'market_trade',eventId,day:quote.day,place:quote.place,goods:quote.goods,item:quote.item,seller:quote.seller,buyer:quote.buyer,business:quote.business,side:quote.side,quantity,totalCoins,minute:d.get('state','minute'),...(settled?{settled}:{})});
}
export function marketExplanation(quote,{bargainFactor=1,totalCoins=quote.totalCoins,unitPrice=quote.listPrice*bargainFactor,exactTotal=quote.exactTotal*bargainFactor}={}){
 const e=quote.explanation,exact=exactTotal;
 return {shop:quote.shop??null,listPrice:quote.listPrice,unitPrice,bargainFactor,averageUnitPrice:exact/quote.quantity,unroundedTotal:exact,retail:quote.retail,baseline:e.baseline,environment:e.environment,scarcity:e.scarcity,quality:e.quality,depth:e.depth,spread:e.spread,relation:e.relation,
  valueCorrection:e.value.base?e.value.value/e.value.base:1,priceCorrection:e.price.base?e.price.value/e.price.base:1,curve:e.curve,rounding:totalCoins-exact};
}
export function purchasingPower(d,engine,location,coins=1){
 const basket=rulesOf(engine).basket.map(row=>{
  const item=engine.world.items.find(i=>(i.tags??[]).includes(row.tag));
  const quote=item?marketQuote(d,engine,{item:item.id,location,quantity:1}):null;
  return {...row,item:item?.id,value:quote?.listPrice??0};
 });
 const ppi=basket.reduce((n,row)=>n+row.weight*row.value,0);
 return {basket,ppi,realValue:ppi?coins/ppi:0};
}

// New terms use the common S5-01 valuation slot. Signed contracts keep their amount.
export function laborValue(engine,document,{worker='player',observer=null,proficiency=0,view=null}={}){
 // D15 §15.2: a skill stage is 300 proficiency. The midpoint of its
 // authored daily-income range is the neutral typical-day valuation.
 const table=engine.rules.economy.dailyIncomeBySkillStage;
 const [low,high]=table[Math.min(table.length-1,Math.floor(proficiency/300))];
 const quote=explainDerived(engine,document,'economy:wage',worker,{base:(low+high)/2,observer,view});
 return {...quote,daily:Math.max(1,Math.ceil(quote.value))};
}

// Candidate estimates use the same quote formula over the observer's own
// stock and remembered trades. Unknown bags, granaries and market depth are
// absent from this projection; execution still rechecks the actual market.
export function subjectiveMarketQuote(engine,document,view,args){
 const observer=view.observer,location=args.location??view.self.location,place=settlementOf(engine,document.state,location);
 const known=marketDeals(document.state).filter(r=>[r.seller,r.buyer].includes(observer)&&r.minute<=view.minute&&r.place===place);
 const fact=view.knowledge.facts[`market:${location}:${args.item}`];
 const remembered=fact&&!(fact.value?.expires<view.minute)?fact:null;
 const last=known.filter(r=>r.item===args.item).sort((a,b)=>b.minute-a.minute).at(0);
 const stored=remembered?.value?.unitPrice,rate=stored!=null?(typeof stored==='number'?toRational(stored):stored):(last?{numerator:last.totalCoins,denominator:last.quantity}:null),observed=rate?fromRational(rate):undefined,hasPrice=Number.isFinite(observed)&&observed>=0;
 const price=hasPrice?observed:engine.byId.get(args.item)?.basePrice;
 const local=place===settlementOf(engine,document.state,view.self.location);
 if(!local&&!hasPrice)return null;
 const body=observer==='player'?document.state.player:document.state.npcs[observer];
 const state={...document.state,minute:view.minute,location:view.self.location,inventory:observer==='player'?view.self.inventory:{},player:observer==='player'?body:{coins:0},npcs:{},creatures:{},settlements:{},obligations:Object.fromEntries(view.self.obligations.map(o=>[o.id,o])),records:Object.fromEntries(known.map((r,i)=>[`market-trade:known:${i}`,r]))};
 if(location===view.self.location)for(const p of view.observable.people)state.npcs[p.id]={...p,location,coins:0,inventory:{}};
 if(observer!=='player')state.npcs[observer]={...body,location:view.self.location,inventory:view.self.inventory};
 const projected={randomSeed:document.randomSeed,state},reader={document:projected,get:(...p)=>p.reduce((x,k)=>x?.[k],projected)};
 const quote=marketQuote(reader,engine,{...args,location,base:price,observer,view});
 if(hasPrice){
  // An observed unit price already includes that market's scarcity, grade
  // and spread. Unknown current shelves cannot multiply it a second time.
  const count=toRational(quote.quantity),numerator=BigInt(rate.numerator)*BigInt(count.numerator),denominator=BigInt(rate.denominator)*BigInt(count.denominator),totalCoins=Number(numerator/denominator),exact=Number(numerator)/Number(denominator);
  const explanation={...quote.explanation,base:price,scarcity:1,quality:1,depth:1,spread:1,relation:1,curve:quote.quantity,
   value:{base:price,value:price,contributions:[]},price:{base:price,value:price,contributions:[]},rounding:totalCoins-exact};
  return {...quote,listPrice:price,totalCoins,exactTotal:exact,explanation,knownFrom:stored!=null?remembered.source:last.eventId,estimate:true};
 }
 return {...quote,knownFrom:'catalog_prior',estimate:true};
}
// 活体行情（K2）：一头牲畜值多少，按它这一物种的身体与产出派生（husbandry-traits 装到物种上的 yields）：
// 屠宰后的胴体各部分（肉、皮、骨……）按本地行情的现值，加上它活着一年的产出（奶、蛋、毛……）按本地行情的现值。
// 没有登记体重、因而没有任何产出的物种，没有可作价的依据，返回 null。
export function livestockValue(d,engine,{species,location,seller=null}){
 const s=engine.byId.get(species),yields=s?.husbandry?.yields;
 if(!yields||!(yields.carcass?.length||yields.alive?.length))return null;
 const c=engine.rules.calendar,year=c.daysPerMonth*c.monthsPerYear;
 const unit=item=>marketQuote(d,engine,{item,location,seller,quantity:1}).listPrice;
 const carcass=(yields.carcass??[]).map(r=>({item:r.item,quantity:r.amount,value:r.amount*unit(r.item)}));
 const products=(yields.alive??[]).map(r=>({item:r.item,quantity:r.perHeadDay*year,value:r.perHeadDay*year*unit(r.item)}));
 const value=[...carcass,...products].reduce((n,r)=>n+r.value,0);
 return {species,value,carcass,products,horizonDays:year};
}
