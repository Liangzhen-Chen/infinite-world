// Read-only market projections. Only completed trades are persisted, never quotes.
import {bagStock,priceRead,settlementStock,granary,pledged,freight,crop as cropAccount} from './stock.mjs';
import {privateCropYieldBase} from './domain-rules.mjs';
import {placeSettlement,personBusinesses,personHousehold} from './entity-view.mjs';
import {isItemClass,classItems,workmanshipTier,householdUsage as usageDefinition} from './item-class.mjs';
import {householdUpkeepGap} from './household-budget.mjs';
import {explainDerived} from './derived.mjs';
import {obligationRows,obligationClosed,currentGrace,institutionOriginal} from './obligation-state.mjs';
import {aliveHoldings,holdingsView} from './holdings.mjs';
import {reject} from './action-rejection.mjs';
import {recordsMemo,withReadIndex} from './storage.mjs';
import {budgetRead,householdResources,householdCommitments,householdUsage,householdDailyUse,usageCost,usageItemGrams,upkeepSelfTripsOf} from './household-budget.mjs';
import economyBalance from '../world/rules/tables/balance/economy.json' with {type:'json'};
import {ln,pow,fromRational,toRational} from './det-math.mjs';
import {mealMouthsOf} from './primitives-body.mjs';
import {resupplyDays,itemResupplyDays,isUnreachableSupply} from './supply-interval.mjs';
import {farmTargetFood} from './farm-target.mjs';

// 顾客一天在商家花费的上限占其钱袋的比例、居民步行上门的最长分钟：数值参数表 balance/economy 的登记值
// （商店成交、书籍出版的读者、店铺客流共用；不在代码里写字面）。
const balanceParam=(engine,id)=>(engine.world.balance?.economy??economyBalance).params.find(row=>row.id===id).value;
export const customerPurseShare=engine=>balanceParam(engine,'shop.customerPurseShare');
export const customerReachMinutes=engine=>balanceParam(engine,'shop.customerReachMinutes');
// 全部商铺（手工登记的与按人物派生的）在某聚落的货架条目：由 shop.mjs 登记，market 只读。
// Hoisted registry: shop.mjs registers while the module graph is still in a cycle (market -> household-budget -> ... -> finance-tax -> shop).
export function registerShopShelves(fn){registerShopShelves.fn=fn;}
const shopShelves=(...a)=>registerShopShelves.fn?.(...a)??null;
const DAY=1440;
const quantity=v=>typeof v==='number'?v:v?.quantity??0;
const clamp=(v,limits)=>Math.max(limits[0],Math.min(limits[1],v));
const stateOf=d=>d.get('state');
const rulesOf=engine=>engine.world.marketRules;
const itemValue=(engine,document,item,base,scarcity,quality)=>explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcity*quality});
// 可食物资池：能吃的货（自身 nutrition.satiety>0，或生料经现有配方链能加工成这样的货）同属一池，按饱腹计量；
// 池内每件货的权重 = 它的饱腹（生料沿链折算）。不看物品 id、聚落、季节，也不手填任何饱腹数。
const recipeConsumers=new WeakMap();
function consumersOf(engine){
 const recipes=engine.world.recipes;if(!Array.isArray(recipes))return new Map();
 const hit=recipeConsumers.get(recipes);if(hit&&hit.count===recipes.length)return hit.map;
 const map=new Map();
 for(const r of recipes)for(const m of r.materials??[]){const rows=map.get(m.item);if(rows)rows.push(r);else map.set(m.item,[r]);}
 recipeConsumers.set(recipes,{count:recipes.length,map});return map;
}
// 物品本身所含的能量（K4 加载期派生的 nutrientContent，含生料）：只用来判断一件原料是否真是配方里供能的成分（水、盐、刨花不供能），并在多种原料间分摊产物饱腹。
const calories=(engine,id)=>engine.byId.get(id)?.nutrientContent?.satiety??0;
// 一件货的饱腹当量：自身 satiety>0 取自身；否则取它经配方加工成可食产物后的饱腹 = 产物饱腹 × 配方产出份数 ×（本料能量 ÷ 配方全部原料能量），沿链递归；
// 多条配方取最小（保守，与 deriveItemAttributes 取最小饱腹的配方一致）。没有任何可食去路则为 0。
export function foodSatiety(engine,item,path=new Set()){
 const row=engine.byId.get(item),own=row?.nutrition?.satiety;
 if(own>0)return own;
 if(!row||path.has(item)||!(calories(engine,item)>0))return 0;
 path.add(item);
 let best=0;
 for(const r of consumersOf(engine).get(item)??[]){
  const out=r.output;if(!(out?.quantity>0)||path.has(out.item))continue;
  const product=foodSatiety(engine,out.item,path);if(!(product>0))continue;
  const total=(r.materials??[]).reduce((n,m)=>n+m.amount*calories(engine,m.item),0);
  if(!(total>0))continue;
  const share=product*out.quantity*calories(engine,item)/total;
  if(!best||share<best)best=share;
 }
 path.delete(item);
 return best;
}
// A function of the catalog row (tags, weight, own props, nutrition), the goods-tag table, the recipe table, the material-property table
// and the crafting balance params (household usage, fuel heat); no live state is read. Remembered per row object and revalidated
// against every one of those inputs (identity of each table, values of the row's own fields), so a changed input never returns a stale entry.
const goodsClasses=new WeakMap();
function goodsEntry(engine,item){
 const row=engine.byId.get(item),table=rulesOf(engine).goodsTags,recipes=engine.world.recipes,props=engine.world.materialProps,balance=engine.world.balance?.crafting;
 const hit=row&&typeof row==='object'?goodsClasses.get(row):null;
 if(hit&&hit.table===table&&hit.tags===row.tags&&hit.count===row.tags?.length&&hit.item===item&&hit.satiety===row.nutrition?.satiety&&hit.calories===row.nutrientContent?.satiety&&hit.recipes===recipes&&hit.weight===row.weight&&hit.own===row.props&&hit.props===props&&hit.balance===balance&&hit.items===engine.world.items)return hit.entry;
 const tags=row?.tags??[],satiety=foodSatiety(engine,item);
 // 可食池只收能吃的货；不能吃的货即使标签或表映射到 food，也退回下一个非 food 的派生类：自身其他 goods: 标签，再表中非 food 的映射，最后用物品自己。
 const goodsTag=tags.find(t=>t.startsWith('goods:')&&t!=='goods:food');
 const category=Object.entries(table).find(([tag,cls])=>cls!=='food'&&tags.includes(tag))?.[1];
 // 家户用度类（燃料、盐……，item-class.householdUsage 的 cls）：同一用度类的货互为替代品，进同一个池，按"顶多少基准克"计量（燃料按有效热值折算，
 // 见 household-budget.usageItemGrams；缺热值时按重量）。类需求只在池里算一次，与全类供给比较，不按每件替代品各算一份。有效克数不为正（烧不出净热）的退回按件。
 const use=satiety>0?null:usageDefinition(engine,0,[]).map(u=>u.cls).find(cls=>isItemClass(engine,item,cls))??null,useGrams=use?usageItemGrams(engine,item,use):0;
 const entry=use&&useGrams>0?{value:`use:${use}`,weight:useGrams,edible:false,use}:{value:satiety>0?'goods:food':goodsTag??`goods:${category??item}`,weight:satiety>0?satiety:1,edible:satiety>0,use:null};
 if(row&&typeof row==='object')goodsClasses.set(row,{table,tags:row.tags,count:row.tags?.length,item,satiety:row.nutrition?.satiety,calories:row.nutrientContent?.satiety,recipes,weight:row.weight,own:row.props,props,balance,items:engine.world.items,entry});
 return entry;
}
export function goodsClass(engine,item){return goodsEntry(engine,item).value;}
// 池内计量权重：可食池 = 饱腹当量；其余货 = 1（按件）。
export function goodsWeight(engine,item){return goodsEntry(engine,item).weight;}
function goodsEdible(engine,item){return goodsEntry(engine,item).edible;}
export function goodsUse(engine,item){return goodsEntry(engine,item).use;}
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
 return row?{owner,item,stock:row.stock,retained:row.retained,upkeep:row.upkeep??0,committed:row.committed,available:row.available}:{owner,item,stock:0,retained:0,upkeep:0,committed:0,available:0};
}
export function saleableStock(d,engine,owner,item,{business=false}={}){
 return budgetStock(householdResources(d,engine,owner),owner,item);
}

// 家户日用（柴、盐）的短缺是采买需求，进本地需求、抬高稀缺价，也进顾客的采买意愿（business.wants）。
// 读 npc-life 的 householdUpkeepGap（连续短缺日数）：缺了几天就想补回几天的用量（至多一个交易周期 economy.tradeCycleDays），
// 按这件货的重量折成件数；每日用量与 npc-life 扣用的口径相同（balance/crafting household.*）。一户只算一次，记在户里编号最小的在世成员名下。
export function upkeepDemand(state,engine,id,item){
 const h=personHousehold(engine,state,id).value,members=(h?.members??[id]).filter(m=>state.npcs?.[m]).sort();
 if(members[0]!==id)return 0;
 const daily=householdDailyUse(engine,state,members,item);if(!(daily>0))return 0;
 // householdUpkeepGap 按用度类给连续短缺日数（fuelShortDays、saltShortDays……）：这件货所属用度类的短缺日数取最长的。
 const usage=householdUsage(engine,state,members).filter(u=>isItemClass(engine,item,u.cls));
 const gap=householdUpkeepGap(state,h?.id??id),days=Math.min(Math.max(0,...usage.map(u=>gap[`${u.cls}ShortDays`]??0)),engine.rules.economy.tradeCycleDays??1);
 if(!(days>0))return 0;
 // 户里缺柴要买的是本聚落买得到的同类里最便宜的那种（household-budget.usageCost），不是同类每种货各买一份：
 // 先看本聚落商铺货架上摆的同类货，没有就看本聚落有人持有的，都没有就记在目录里同类最便宜的那件上。
 const place=settlementOf(engine,state,locationOf(state,id));
 if(!usage.every(u=>cheapestOfClass(state,engine,place,u.cls)===item))return 0;
 return Math.ceil(daily*days);
}
function cheapestOfClass(state,engine,place,cls){
 const memo=cheapestMemo.get(state)??new Map();cheapestMemo.set(state,memo);
 const key=`${place}|${cls}`;if(memo.has(key))return memo.get(key);
 // I12：只读公开的货架与目录，不读居民私户背包——有货架取货架上最便宜的；没有货架就取目录里同类最便宜的（usageCost = 目录基价 ÷ 顶多少基准克）。
 const items=classItems(engine,cls),shelved=new Set((shopShelves(engine,place)??[]).map(r=>r.item).filter(item=>items.includes(item)));
 const pool=shelved.size?[...shelved]:items,best=pool.sort((a,b)=>usageCost(engine,a)-usageCost(engine,b)||a.localeCompare(b))[0]??null;
 memo.set(key,best);return best;
}
const cheapestMemo=new WeakMap();
// TODO（合入前必做，待 EC-1 合入 master、t-mktw 变基后）：需求加一项缺口信号 = 本聚落近一个交易周期内 EC-1b customer_flow 访问记录里 outcome 非 bought 的未满足量（店主亲见，公开可知），全品类（食物与非食物货）一律接入；现在不计。
// 稀缺度 = 目标持有 ÷ 实际持有，两边同一口径（持有量，存量对存量），随覆盖率连续单调（存量恰在目标时为 1）。
// 这是世界客观的价格输入，不是某个 NPC 的主观视图；按 02-不变量 I12，只计定价方能公开知道的量：
//  实际持有（供给）= 聚落粮仓/仓库公账的全部库存 + 经营者与居民卖方的存货（店铺货架、公开在售）；
//  目标持有（需求）= 粮仓储备目标（农事聚落 = min(餐口 × (距下次收获 + reserveDays)，容量 − 种粮)；不在农事表里的聚落 = 餐口 × 补给间隔天数 resupplyDays）+ 货架目标（maximum+reserve）+ 合同承诺 + 非食物货一个补给间隔内的实际消耗（户用日耗与自主制造耗料记录）。
// 非经营者私户的背包（实际持有、目标留存、柴盐缺口、饱腹缺口）两边都不计：他人背包的客观余量不是定价方知道的事，也没有公开的求购/下单记录可读。
// 供给近 0 时由调用方的分母保护（max(1,supply)）与 priceFactorLimits.region 夹取封顶，不会除零。
// 非农事聚落的补给间隔 resupplyDays 见 primitives-body.mjs（与远方聚落开局存粮共用）。
function stockSupply(d,engine,item,location,{businessOwners=[]}={}){
 const state=stateOf(d),place=settlementOf(engine,state,location),goods=goodsClass(engine,item),rows=[];
 // 供给与需求都按报价这件货的件数表达：池内每件货按权重（可食物资 = 饱腹）折算后再除以报价货的权重。
 // 非可食池权重全为 1，等于按件数，与此前一致。
 const unit=goodsWeight(engine,item),items=engine.world.items.filter(i=>goodsClass(engine,i.id)===goods),weight=new Map(items.map(i=>[i.id,goodsWeight(engine,i.id)]));
 const owners=new Set(businessOwners);
 for(const store of engine.rules.economy?.shops?.stores??[])owners.add(store.keeper);
 for(const npc of engine.world.npcs)if(npc.shopType||(npc.services??[]).includes('trade'))owners.add(npc.id);
 // 15 §15.2：本地可售存量来自市场经营者，不是每个人“可以被买走”的行囊。
 // 当前转业/承租后开张的商家也属于供给，不能只认目录里的原店主。
 // 通用 serviceCatalog.trade 只允许人对人交易，不等于开店；经营类型才是营业身份。
 for(const [id,business]of personBusinesses(engine,state))if(business?.open.value&&business.shopType.value)owners.add(id);
 for(const id of ['player',...Object.keys(state.npcs??{}),...Object.keys(state.creatures??{})]){
  if(!owners.has(id)||settlementOf(engine,state,locationOf(state,id))!==place)continue;
  // One read-only household allocation serves all items in this quote. No writes occur in the loop.
  const budget=householdResources(d,engine,id);
  // 卖方存货按全部持有计（不先扣自用留存：留存是私人目标，不公开）。
  for(const it of items){const row=budgetStock(budget,id,it.id);if(!row.stock)continue;rows.push({...row,available:row.stock,unit:weight.get(it.id)/unit});}
 }
 const profile=engine.rules.agriculture?.settlements.find(p=>p.settlement===place),settlement=state.settlements?.[place];
 for(const it of items){
  const stockName=Object.entries(engine.rules.economy?.shops?.stockItems??{}).find(([,id])=>id===it.id)?.[0];
  if(!settlement||!stockName)continue;
  // 没有公仓的聚落（D1 公库账）没有公仓行。
  if(stockName==='food'&&settlement.granary===false)continue;
  // 不在农事表里、又没有日产粮（foodPerDay 缺失或为 0，如觉醒部族聚落的骨架账）的聚落没有可定价的粮仓目标：与原 forest-water 分支同一语义，价格因子中性（不计该行的存量与目标）。
  if(stockName==='food'&&!profile&&!(settlement.foodPerDay>0))continue;
  const farm=state.records?.[`agriculture:${place}`],day=Math.floor(state.minute/DAY);
  const stock=stockName==='food'
   ?priceRead(d,{point:'region.grain',account:granary(engine,place),lots:{kind:'grain',after:day},legacy:()=>farm?.batches?.filter(b=>b.kind==='grain'&&b.expiresDay>day).reduce((n,b)=>n+b.amount,0)??settlement.food??0})
   :priceRead(d,{point:'region.material',account:settlementStock(engine,place,stockName),legacy:()=>settlement[stockName]??0});
  // 粮仓实际持有 = 全部库存；目标持有 = 餐口 × 目标日数。
  // 农事聚落：目标日数 = 距下次收获天数 + reserveDays（farmTargetDays：刚收完要撑到下次收获，再留结转储备，随季节变）。
  // 不在农事表里的聚落：粮靠外来补给，目标日数 = 实际补给间隔（resupplyDays：最近供粮聚落的往返路程天数）。
  const mouths=stockName==='food'?mealMouthsOf(engine,state,place,settlement.population??0):0;
  // 农事聚落的目标还受粮仓容量限制（farmTargetFood：min(餐口 × 目标日数, 容量 − 种粮)），所有农事聚落一律适用。
  const target=stockName==='food'?(profile?farmTargetFood(engine,state,profile,state.minute):Math.ceil(mouths*resupplyDays(engine,d.get('randomSeed'),place,state))):0;
  const committed=commitments(state,place,it.id);rows.push({owner:place,item:it.id,stock,target,committed,available:stock,unit:weight.get(it.id)/unit});
 }
 const supply=rows.reduce((n,r)=>n+r.available*r.unit,0);
 // F026：货架读全部商铺（含按人物派生的），不再只读登记的几家静态店。货架目标 = 各店各货 maximum+reserve。
 const shelf=(shopShelves(engine,place)??(engine.rules.economy?.shops?.stores??[]).filter(s=>s.settlement===place).flatMap(s=>s.restock??[])).filter(r=>items.some(i=>i.id===r.item)).reduce((n,r)=>n+(r.maximum+(r.reserve??0))*weight.get(r.item),0)/unit;
 // 非食物货的目标持有还含"一个补给间隔内聚落对这件货的实际消耗"（行为显露的需求，聚落里公开可见的活动，符合 I12）：
 //  户用 = 聚落各户经市场取得的用度（柴、盐等；日用度扣掉户内自给，加已欠量，见下）× 补给间隔天数（itemResupplyDays）；
 //  生产投入 = 近一个补给间隔内聚落里实际制造的耗料：recordCraft（stock.mjs）按（聚落，物品）滚动记日桶，所有制造写入方（玩家作坊、NPC 自主制造、雇工、野生社会等）统一写入。
 // 食物货另有粮仓目标，不在此叠加。没有任何消耗记录的货，目标持有就是货架目标加承诺，仍为 0 时按下限 1。
 let consumption=0;
 if(place&&settlement&&!items.some(i=>goodsEdible(engine,i.id))){
  // 补给间隔按货物区分（itemResupplyDays：往返该货产地的天数；产地就在本聚落取本地生产周期）。
  const dayMemo=new Map(),daysOf=item=>{if(!dayMemo.has(item))dayMemo.set(item,itemResupplyDays(engine,state,d.get('randomSeed'),item,place));return dayMemo.get(item);};
  // 户用（只有家户用度类的货：柴、盐……，goodsEntry 把同一用度类的货并成一个池，池内每件按"基准克"计量，weight 即基准克）：
  //  经市场取得的部分 = 补给间隔 × (日用度 − 户内自给) + 本户已欠的量；整类只算一次，不按替代品逐件各算一份。
  //  · 日用度：household-budget.householdUsage（与 npc-life 每日扣用同一定义）；
  //  · 户内自给：household-subsistence 既有采集规划能采回的量（upkeepSelfSupplyOf：公共林地与无主资源点的可采量、往返、本户空闲工时；没有来源或没有空闲劳力的户得 0，全额走市场），封顶于日用度；
  //  · 已欠量：npc-life 记在 state.family.upkeep 的 `${cls}DebtG`（前几日缺的，仍要买），与"补给间隔内的新用度"是不同时段，不重复；缺着的户因此推高需求。
  // 补给间隔：整类取各成员货补给间隔里最短的（类里最快能补上的那条渠道），不随报价的是哪一件而变。
  // 率按名册户给出人均（名册户只给比例，没上名册的人口也要烧柴吃盐），乘聚落人口（公开量，与粮的餐口同一来源 settlement.population）。
  const use=goodsUse(engine,item);
  if(use){
   // 不可达的成员（产地与本聚落不通，itemResupplyDays 抛 E-SUPPLY-UNREACHABLE）不是补货渠道，跳过；全不可达就走既有路径（按本件取，照常报错）。
   const reachable=[];
   for(const it of items)try{reachable.push(daysOf(it.id));}catch(error){if(!isUnreachableSupply(error))throw error;}
   // 补给不会比一个交易周期更勤：类的间隔 = max(类内最短往返, 一个交易周期 economy.tradeCycleDays)（本地产的货本来就以交易周期为下限，进口货同一口径；
   // 否则近处进口的几克引火包会把整类间隔压到半天，柴的户用被低估一个量级）。
   const horizon=Math.max(engine.rules.economy.tradeCycleDays,reachable.length?Math.min(...reachable):daysOf(item)),seen=new Set(),drawn=new Map();
   const perOf=usageDefinition(engine,0,[]).find(u=>u.cls===use)?.per;
   let rosterPersons=0,rosterHouses=0,viaMarket=0,owed=0;
   for(const id of Object.keys(state.npcs??{})){
    if(settlementOf(engine,state,locationOf(state,id))!==place)continue;
    const h=personHousehold(engine,state,id).value,key=h?.id??id;if(seen.has(key))continue;seen.add(key);
    const members=(h?.members??[id]).filter(m=>state.npcs?.[m]);rosterPersons+=members.length;rosterHouses++;
    const need=householdUsage(engine,state,members).find(u=>u.cls===use)?.gramsPerDay??0;
    // 自给：本户规划的各趟采集，按来源累计分摊余量——同一片林、同一处资源点的可采量是各户共用的一份，先到的户先采，后面的户只能采剩下的。
    let got=0;
    for(const t of upkeepSelfTripsOf(engine,state,id))if(t.cls===use){
     const take=Math.max(0,Math.min(t.units,t.remaining-(drawn.get(t.source)??0)));drawn.set(t.source,(drawn.get(t.source)??0)+take);got+=take*t.unitGrams;
    }
    viaMarket+=(need-Math.min(need,got))*horizon;owed+=state.family?.upkeep?.[key]?.[`${use}DebtG`]??0;
   }
   // 日用度与自给是速率，名册户的均值可外推到聚落；外推的单位由用度定义决定（usage.per）：按户的类（柴）按 聚落户数 ÷ 名册户数，按人的类（盐）按 人口 ÷ 名册人数。
   // 聚落户数读聚落档案的 householdCount（entity-view.settlementPopulation 的同一来源；这里不整套重算，免得每次报价扫全体居民），没有档案时不外推（按名册户数）。欠量是名册户账上实际欠着的，只计实际量，不放大。
   const people=settlement.population??0,houses=engine.world.settlementProfiles?.find(p=>p.id===place)?.householdCount||rosterHouses;
   if(rosterPersons>0)consumption+=(perOf==='household'?viaMarket/rosterHouses*houses:viaMarket/rosterPersons*people)+owed;
   else consumption+=(usageDefinition(engine,state.minute,[null]).find(u=>u.cls===use)?.gramsPerDay??0)*horizon*(perOf==='household'?houses:people);
  }
  // 生产耗料读 recordCraft 的滚动日桶（state.records['craft-use:<聚落>']，stock.mjs accrueCraftUse）：所有制造写入方统一经它记账，这里不再读各写入方自己的记录。
  // 窗口按整数天取（ceil(补给间隔) 个日桶，含当天），跨午夜保持连续，不按当天截断。
  // 替代只单向合池：燃料用度（户用）才合入燃料池；制造耗料（建材、配方投入）只进该物品自己的需求，不跨货推高同池的别件（木料做建材不抬木炭的价）。
  const today=Math.floor(state.minute/DAY),quoted=item;
  for(const [k,bucket] of Object.entries(state.records?.[`craft-use:${place}`]?.days??{}))
   for(const [made,amount] of Object.entries(bucket))if(weight.has(made)&&(!use||made===quoted)&&Number(k)>today-Math.ceil(daysOf(made)))consumption+=amount*weight.get(made);
  consumption=Math.max(0,consumption)/unit;
 }
 const demand=Math.max(shelf+consumption+rows.reduce((n,r)=>n+((r.target??0)+r.committed)*r.unit,0),1);
 return {place,goods,supply,demand,consumption,rows};
}
// 同一状态版本内（游标 revision / 只读作用域内同一状态对象，任何状态与账本写入即换版本）marketSupply 是 (item, location, businessOwners)
// 的纯函数：它只读 state、账本、引擎规则，不写任何东西、不抽随机数，且所读的 householdResources 本来就按同一版本记忆。
// 估值、报价、经营者各自重复询问同一组参数（同一物品、同一地点），故按版本记忆整张结果；命中时返回的是同一份只读数据，调用方只读不改。
// options 带有 businessOwners 以外的字段时不记忆（当前没有这样的调用）。
const supplyMemo=Symbol('market supply');
export function marketSupply(d,engine,item,location,options={}){
 const keys=Object.keys(options);
 if(keys.some(k=>k!=='businessOwners'))return withReadIndex(()=>readMarketSupply(d,engine,item,location,options));
// readMarketSupply 全程只读（没有写入）：固定状态下推进之外也走记录索引与状态记忆。
 return {...withReadIndex(()=>budgetRead(d,engine,[supplyMemo,item,location,JSON.stringify(options.businessOwners??[])],()=>readMarketSupply(d,engine,item,location,options)))};
}
function readMarketSupply(d,engine,item,location,options){
 const current=stockSupply(d,engine,item,location,options);
 const unit=goodsWeight(engine,item),forward=engine.world.items.filter(it=>goodsClass(engine,it.id)===current.goods).map(it=>({...forwardSupply(d,engine,it.id,location),scale:goodsWeight(engine,it.id)/unit}));
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
   consignments.push({id:row.id,item:cargo.item,capacity,secured:capacity,paidRatio:1,reliability:0,timeDiscount,expected:capacity*timeDiscount,scale:goodsWeight(engine,cargo.item)/unit});
  }
 }
 const expected=forward.reduce((sum,row)=>sum+row.expected*row.scale,0)+consignments.reduce((n,r)=>n+r.expected*r.scale,0);
 // 15 §15.2: backed, discounted promises affect prices, not spot delivery.
 return {...current,spotSupply:current.supply,supply:current.supply+expected,expected,forwards:forward.flatMap(row=>row.rows),consignments};
}
export function marketGrade(engine,document,item,{seller,instances=null,quantity:count=1}={}){
 const state=document.state,catalog=engine.byId.get(item),r=rulesOf(engine),order=engine.rules.equipment.qualities;
 const bag=inventoryOf(state,seller),ids=instances??bag[item]?.instances?.slice(0,count)??[];
 const units=ids.map(id=>state.itemInstances?.[id]).filter(Boolean);
 const grade=unit=>{
  // 卡 Q：单件按实例品质（grade，标准件 1）与手艺档的价格倍率（balance/crafting price）报价。
  const quality=pow(r.qualityStep,Math.max(0,order.indexOf(unit?.quality??catalog.quality))-Math.max(0,order.indexOf(catalog.quality)))*(unit?.grade??1)*workmanshipTier(engine,unit?.workmanship).price;
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
 const all=quoteSupply(d,engine,{item,location}),own=all.rows.filter(r=>r.owner===owner).reduce((n,r)=>n+r.available*(r.unit??1),0);
 return {...all,supply:all.supply-own,spotSupply:(all.spotSupply??all.supply)-own,rows:all.rows.filter(r=>r.owner!==owner)};
}
// Integrate the same clamped demand/supply curve for a trade or a liquidation.
export function scarcityIntegral(supply,limits,a,b){
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
 const unitQ=goodsWeight(engine,item),net=deals.reduce((n,row)=>n+(row.side==='sell'?row.quantity:-row.quantity)*goodsWeight(engine,row.item)/unitQ,0),opening=Math.max(1,spotSupply+net);
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
