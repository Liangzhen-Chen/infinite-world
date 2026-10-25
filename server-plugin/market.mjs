// Read-only market projections. Only completed trades are persisted, never quotes.
import {bagStock,priceRead,settlementStock,granary} from './stock.mjs';
import {placeSettlement,personHousehold} from './entity-view.mjs';
import {explainDerived} from './derived.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {reject} from './action-rejection.mjs';
import {digest} from './storage.mjs';
import {bodyRule} from './primitives-body.mjs';

const DAY=1440;
const quantity=v=>typeof v==='number'?v:v?.quantity??0;
const clamp=(v,limits)=>Math.max(limits[0],Math.min(limits[1],v));
const stateOf=d=>d.get('state');
const rulesOf=engine=>engine.world.marketRules;
export function goodsClass(engine,item){
 const row=engine.byId.get(item),tags=row?.tags??[];
 const category=Object.entries(rulesOf(engine).goodsTags).find(([tag])=>tags.includes(tag))?.[1];
 return tags.find(t=>t.startsWith('goods:'))??`goods:${category??(row?.nutrition?.satiety>0?'food':item)}`;
}
const locationOf=(state,id)=>id==='player'?state.location:state.npcs?.[id]?.location??state.creatures?.[id]?.location;
const settlementOf=(engine,state,location)=>placeSettlement(engine,state,location).value??location;
const inventoryOf=(state,id)=>id==='player'?state.inventory:(state.npcs?.[id]??state.creatures?.[id])?.inventory??{};
function marketDeals(state){
 const rows=[];
 for(const [key,row]of Object.entries(state.records??{})){
  if(!key.startsWith('market-trade:')&&row.category!=='market_trade')continue;
  if(row.category!=='market_trade'||!Number.isSafeInteger(row.quantity)||row.quantity<1||!Number.isSafeInteger(row.day)||row.day<0||!Number.isSafeInteger(row.totalCoins)||row.totalCoins<0||!['sell','buy'].includes(row.side))throw Error('市场成交账无效');
  rows.push(row);
 }
 return rows;
}

function personalReserves(d,engine,owner){
 const state=stateOf(d),reserved=new Map();
 // One shared allocation across the current household's actual bags. A shop
 // keeper's shelf is also the family's food; each portion is retained once.
 const members=personHousehold(engine,state,owner).value?.members??[owner];
 const foods=members.flatMap(holder=>Object.entries(inventoryOf(state,holder)).map(([id,held])=>({holder,id,key:`${holder}:${id}`,held,definition:engine.byId.get(id)}))).filter(row=>row.definition?.nutrition).sort((a,b)=>(a.definition.shelfLifeDays??Infinity)-(b.definition.shelfLifeDays??Infinity)||a.id.localeCompare(b.id)||a.holder.localeCompare(b.holder));
 for(const need of ['satiety','hydration']){
  const body=bodyRule(engine,need);
  const base=body.drainPerHour.light*24*rulesOf(engine).personalReserveDays;
  let remaining=members.reduce((sum,id)=>sum+explainDerived(engine,d.document??{state},'body:drain',id,{base}).value,0);
  for(const row of foods)remaining-=(reserved.get(row.key)??0)*(row.definition.nutrition[need]??0);
  for(const row of foods){
   const gain=row.definition.nutrition[need]??0;if(gain<=0||remaining<=0)continue;
   const stock=bagStock(d,engine,{point:'region.material',id:row.holder,item:row.id,legacy:()=>quantity(row.held)}),prior=reserved.get(row.key)??0;
   const count=Math.min(Math.max(0,stock-prior),Math.ceil(remaining/gain));
   reserved.set(row.key,prior+count);remaining-=count*gain;
  }
 }
 return new Map(foods.filter(row=>row.holder===owner).map(row=>[row.id,reserved.get(row.key)??0]));
}

// Canonical obligations and their records projections are counted once.
function commitments(state,owner,item){
 let held=0;const represented=new Set();
 for(const row of obligationRows(state)){
  if(obligationClosed(row))continue;
  if(row.legacyRecord)represented.add(row.legacyRecord);
  if((row.debtor??row.promisor)===owner&&(row.item??row.subject)===item)held+=Math.max(0,(row.quantity??0)-(row.fulfilled??0));
 }
 for(const [key,row]of Object.entries(state.records??{})){
  if(represented.has(key)||row.obligation&&state.obligations?.[row.obligation])continue;
  if(row.category==='contract'&&row.kind==='procurement'&&row.parties?.[1]===owner&&row.subject===item&&!obligationClosed(row))held+=Math.max(0,row.quantity-(row.fulfilled??0));
  // The source/receipt gate for agreed prices is owned by shop; a reservation
  // here does not authorize payment or override that gate.
  if(row.category==='agreed_quote'&&row.direction==='sell_to_player'&&row.actor===owner&&row.resource===item&&row.at<=state.minute&&state.minute<row.expires&&!state.records[`${key}:used`]&&state.records[`${key}:source`]?.digest===digest(row)){
   const source=state.records[`world_event:${row.sourceEvent?.replace(/^world_event:/,'')}`],p=source?.payload;
   if(source?.verb==='quoted'&&source.actor===row.actor&&source.minute===row.at&&p?.to===row.to&&p.resource===row.resource&&p.quantity===row.quantity&&p.totalCoins===row.totalCoins)held+=row.quantity;
  }
 }
 return held;
}
export function saleableStock(d,engine,owner,item,{business=false}={}){
 const state=stateOf(d),catalog=engine.byId.get(item),bag=inventoryOf(state,owner),raw=quantity(bag[item]);
 const stock=bagStock(d,engine,{point:'region.material',id:owner,item,legacy:()=>raw});
 if(!stock)return {owner,item,stock:0,retained:0,committed:0,available:0};
 // Native work tasks reserve the recipe tools while the actor is using them.
 const inUse=Object.values(state.npcAutonomy?.tasks??{}).some(task=>task.npc===owner&&task.status==='进行中'&&(engine.world.recipes.find(r=>r.id===task.action?.recipe)?.tools??[]).includes(item))?1:0;
 const reserve=catalog.nutrition?personalReserves(d,engine,owner).get(item)??0:0;
 const committed=commitments(state,owner,item),retained=Math.max(inUse,reserve);
 return {owner,item,stock,retained,committed,available:Math.max(0,stock-retained-committed)};
}
export function marketSupply(d,engine,item,location,{businessOwners=[]}={}){
 const state=stateOf(d),place=settlementOf(engine,state,location),goods=goodsClass(engine,item),rows=[];
 const items=engine.world.items.filter(i=>goodsClass(engine,i.id)===goods);
 const owners=new Set(businessOwners);
 for(const store of engine.rules.economy?.shops?.stores??[])owners.add(store.keeper);
 for(const npc of engine.world.npcs)if(npc.shopType||(npc.services??[]).includes('trade'))owners.add(npc.id);
 for(const id of ['player',...Object.keys(state.npcs??{}),...Object.keys(state.creatures??{})]){
  if(settlementOf(engine,state,locationOf(state,id))!==place)continue;
  for(const it of items){const row=saleableStock(d,engine,id,it.id,{business:owners.has(id)});if(row.stock)rows.push(row);}
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
 const shelf=(engine.rules.economy?.shops?.stores??[]).filter(s=>s.settlement===place).flatMap(s=>s.restock??[]).filter(r=>items.some(i=>i.id===r.item)).reduce((n,r)=>n+r.maximum+(r.reserve??0),0);
 const demand=Math.max(shelf,rows.reduce((n,r)=>n+r.retained+r.committed,0),1);
 return {place,goods,supply,demand,rows};
}
export function marketGrade(engine,document,item,{seller,instances=null,quantity:count=1}={}){
 const state=document.state,catalog=engine.byId.get(item),r=rulesOf(engine),order=engine.rules.equipment.qualities;
 const bag=inventoryOf(state,seller),ids=instances??bag[item]?.instances?.slice(0,count)??[];
 const units=ids.map(id=>state.itemInstances?.[id]).filter(Boolean);
 const grade=unit=>{
  const quality=r.qualityStep**(Math.max(0,order.indexOf(unit?.quality??catalog.quality))-Math.max(0,order.indexOf(catalog.quality)));
  const liquid=unit?.liquid;
  if(!liquid||!liquid.waterMl)return quality;
  const unsafe=(liquid.toxinUg??0)/liquid.waterMl*1000>r.water.toxinUgPerLitre||(liquid.pathogenRisk??0)>0;
  const impaired=(liquid.saltMg??0)/liquid.waterMl*1000>r.water.saltMgPerLitre||(liquid.turbidity??0)>0;
  return quality*(unsafe?r.water.unsafeFactor:impaired?r.water.impairedFactor:1);
 };
 const ordinary=grade(typeof bag[item]==='object'?bag[item]:null);
 return (units.reduce((n,u)=>n+grade(u),0)+Math.max(0,count-units.length)*ordinary)/count;
}
export function marketQuote(d,engine,{item,location,seller,buyer,quantity:count=1,business=null,base=engine.byId.get(item)?.basePrice,relation=1,instances=null,minute=stateOf(d).minute}){
 const document=d.document??{state:stateOf(d)},state=document.state,r=rulesOf(engine),side=business?(business.keeper===seller?'sell':'buy'):seller==='player'?'buy':'sell';
 const supply=marketSupply(d,engine,item,location,{businessOwners:business?[business.keeper]:[]});
 const day=Math.floor(minute/DAY),deals=marketDeals(state).filter(row=>row.day===day&&row.place===supply.place&&row.goods===supply.goods);
 const net=deals.reduce((n,row)=>n+(row.side==='sell'?row.quantity:-row.quantity),0),opening=Math.max(1,supply.supply+net);
 const scarcity=clamp(supply.demand/Math.max(1,supply.supply),engine.rules.economy.priceFactorLimits.region);
 const depth=Math.max(0,1+r.depthImpact*net/opening),quality=marketGrade(engine,document,item,{seller,instances,quantity:count});
 const value=explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcity*quality});
 const spread=business?(side==='sell'?clamp(business.markup,engine.rules.economy.priceFactorLimits.shop):r.spread.buy):1;
 const price=explainDerived(engine,document,'economy:price',item,{base:value.value*depth*spread*relation});
 // 15 §15.2: peer trade has no business stock curve and always uses retail value.
 const retail=!business||count<=Math.max(r.retailFloor,supply.supply*r.retailShare);
 // Integrate the clamped demand/supply curve analytically. Quality, correction
 // and spread are fixed for this lot; stock changes along the executed quantity.
 const limits=engine.rules.economy.priceFactorLimits.region;
 const integral=(a,b)=>{
  if(b<=a)return 0;const D=supply.demand,low=D/limits[1],high=D/limits[0];let sum=0;
  const left=Math.min(b,low);if(left>a)sum+=(left-a)*limits[1];
  const x=Math.max(a,low),y=Math.min(b,high);if(y>x)sum+=D*Math.log(y/x);
  const right=Math.max(a,high);if(b>right)sum+=(b-right)*limits[0];return sum;
 };
 const curve=retail?count*scarcity:side==='sell'?integral(Math.max(0,supply.supply-count),supply.supply):integral(supply.supply,supply.supply+count);
 let exactTotal=price.value*(retail?count:curve/scarcity);
 if(!retail&&(value.contributions.length||price.contributions.length)){
  // Additive corrections and clamps cannot be scaled as a percentage of the
  // initial quote. Integrate the actual corrected marginal price instead.
  const marginal=x=>{
   const available=Math.max(0,supply.supply+(side==='sell'?-x:x));
   const scarcityAt=clamp(supply.demand/Math.max(Number.EPSILON,available),limits);
   const v=explainDerived(engine,document,'economy:value',item,{kind:'item',base:base*scarcityAt*quality});
   return explainDerived(engine,document,'economy:price',item,{base:v.value*depth*spread*relation}).value;
  };
  const simpson=(a,b,fa,fm,fb)=>(b-a)*(fa+4*fm+fb)/6;
  const integrate=(a,b,fa,fm,fb,whole,tolerance,left)=>{
   const m=(a+b)/2,l=marginal((a+m)/2),r=marginal((m+b)/2);
   const first=simpson(a,m,fa,l,fm),second=simpson(m,b,fm,r,fb),delta=first+second-whole;
   if(!left||Math.abs(delta)<=15*tolerance)return first+second+delta/15;
   return integrate(a,m,fa,l,fm,first,tolerance/2,left-1)+integrate(m,b,fm,r,fb,second,tolerance/2,left-1);
  };
  const fa=marginal(0),fm=marginal(count/2),fb=marginal(count);
  exactTotal=integrate(0,count,fa,fm,fb,simpson(0,count,fa,fm,fb),1e-7,16);
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
 if(!quote.retail&&quote.quantity>Math.max(r.retailFloor,quote.supply*r.maxShare)||used+quote.quantity>Math.max(r.retailFloor,quote.opening*r.dailyShare))reject('E-ACTION-PRECONDITION','市场今天没有那么多可成交深度');
 const available=saleableStock(d,engine,quote.seller,quote.item,{business:quote.side==='sell'}).available;
 if(quote.quantity>available)reject('E-ACTION-PRECONDITION','对方库存不足：扣除自用和已承诺存量后不够出售');
}
export function recordMarketDeal(d,quote,totalCoins,quantity,eventId){
 d.set(['state','records',`market-trade:${eventId}`],{category:'market_trade',eventId,day:quote.day,place:quote.place,goods:quote.goods,item:quote.item,seller:quote.seller,buyer:quote.buyer,business:quote.business,side:quote.side,quantity,totalCoins,minute:d.get('state','minute')});
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
