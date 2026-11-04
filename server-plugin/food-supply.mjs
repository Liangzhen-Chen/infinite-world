// Producer-to-counter supply. Quotes are carried home by a real, timed scouting
// trip; distant stock and prices never enter a producer's subjective decision.
import {recordsWhere,cloneData} from './storage.mjs';
import {declareLedgerWriter,balance} from './ledger.mjs';
import {cargo,moveStock} from './stock.mjs';
import {treasury,purse,escrow,moveCoins,counterCash,dedicatedCoinAccount} from './money.mjs';
import {currentShops,foodSupplyBid,receiveFoodSupply,foodSupplyNeed} from './shop.mjs';
import {transportServices,quoteTransport,bookTransport,collectTransport,settleWreckedShipment,installExternalTransportCargo} from './transport.mjs';
import {transportSegment,stepTransport} from './transport-route.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {saleableStock} from './market.mjs';
import {safeCarryKg,carriedKg} from './carry.mjs';
import {obligationTransaction} from './transition.mjs';
import {rollDice} from './scheduler.mjs';
import {householdResources,householdCommitments} from './household-budget.mjs';
import {defineHoldingSource,syncHoldings} from './holding-sources.mjs';
import {holdingSet,holdingRemove,declareHoldingWriter} from './holdings.mjs';
import {advanceHook,registerAdvanceHook} from './advance-hooks.mjs';
import {toRational,fromRational} from './det-math.mjs';
import {settlementGovernment,placeSettlement} from './entity-view.mjs';

declareLedgerWriter('food-supply',{sinks:['sink:decay','sink:destroy']});
declareHoldingWriter('food-supply',{kinds:[],locations:true});
const DAY=1440,category='settlement_trade',key=id=>['state','records',id];
// Retail deliveries are a subtype of the existing settlement-trade transit
// account, so stock/cash reconstruction and I6 recognize the same custodian.
const orders=s=>recordsWhere(s.records,'category',category).filter(o=>o.foodSupply);
const statsKey=s=>`food-supply-stats:${s}`;
const amount=o=>(o.batches??[]).reduce((n,b)=>n+b.amount,0);
defineHoldingSource('food-supply',{
 recordCategories:[category],unitOfRecord:(_s,k)=>k,
 units:(_e,s)=>orders(s).map(o=>o.id),
 extract(_e,s,k){const o=s.records?.[k];return o?.foodSupply?{locations:[{entity:o.id,at:o.to,mode:'place'}]}:null;}
});
installExternalTransportCargo('food_supply',{
 read:(_d,_e,o)=>amount(o)?[{item:o.item,quantity:amount(o)}]:[],
 damage(d,e,old,item,quantity,eventId){
  const o=cloneData(old);if(item!==o.item||quantity>amount(o))throw Error('Food supply damage exceeds real cargo');
  let left=quantity;
  for(const b of o.batches){const used=Math.min(left,b.amount);if(used)moveStock(d,{from:cargo(e,o.id,item),to:`sink:destroy|${cargo(e,o.id,item).split('|')[1]}|cargo_loss`,amount:used,writer:'food-supply',eventId,pick:[String(b.id)]});b.amount-=used;left-=used;}
  o.batches=o.batches.filter(b=>b.amount);o.lostFood+=quantity;persist(d,o);
 }
});

const indexes=new WeakMap();
function index(e){
 let v=indexes.get(e.world);
 if(!v||v.npcs!==e.world.npcs||v.profiles!==e.rules.agriculture?.settlements){
  v={npcs:e.world.npcs,profiles:e.rules.agriculture?.settlements,paths:new Map()};indexes.set(e.world,v);
 }
 return v;
}
function route(d,e,from,to,minute){
 const cache=index(e).paths,k=`${from}:${to}:${Math.floor(minute/DAY)}:${d.cursor?.revision??''}`;
 if(!cache.has(k)){try{cache.set(k,e.route(from,to,'walk',minute,d.document.randomSeed));}catch{cache.set(k,null);}}
 return cache.get(k);
}
function producers(d,e){
 const s=d.get('state'),out=[];
 for(const p of e.rules.agriculture?.settlements??[]){
  if(s.records?.[`agriculture:${p.settlement}`]?.mode!=='managed'||!s.settlements?.[p.settlement]||!s.npcs?.[p.manager]||!isEffective(e,s,p.manager))continue;
  out.push({seller:p.settlement,manager:p.manager,settlement:p.settlement,from:p.counter,public:true,profile:p,item:e.rules.agriculture.grainItem});
 }
 const profiles=e.rules.agriculture?.settlements??[];
 if(profiles.length)for(const [sid,stock]of Object.entries(s.settlements??{})){
  if(stock.granary===false||!(stock.food>0)||out.some(p=>p.seller===sid)||s.records?.[`agriculture:${sid}`]?.mode==='managed')continue;
  const government=settlementGovernment(e,s,sid),manager=government.head.value;
  if(!s.npcs?.[manager]||!isEffective(e,s,manager))continue;
  out.push({seller:sid,manager,settlement:sid,from:government.seat.value,public:true,legacy:true,profile:{reserveDays:Math.max(...profiles.map(p=>p.reserveDays))},item:e.rules.agriculture.grainItem});
 }
 // A private producer must actually own harvested stock; standing crops are
 // not saleable inventory. The ordinary saleability projection retains claims.
 for(const farm of recordsWhere(s.records,'category','private_farm')){
  if(!s.npcs?.[farm.owner]||!isEffective(e,s,farm.owner)||out.some(p=>p.seller===farm.owner&&p.item===farm.crop))continue;
  out.push({seller:farm.owner,manager:farm.owner,settlement:farm.settlement,from:s.npcs[farm.owner].location,public:false,item:farm.crop});
 }
 return out;
}
function spareWorkers(d,e,p){
 if(!p.public||p.legacy){const n=d.get('state','npcs',p.manager);return n?.cognitionTravel||n?.scheduleTravel||orders(d.get('state')).some(o=>o.seller===p.seller&&o.transport?.phase!=='home')?0:1;}
 const s=d.get('state'),r=p.profile,pop=s.settlements[p.seller].population;
 const busy=recordsWhere(s.records,'category','settlement_trade').filter(o=>o.seller===p.seller&&!o.carriage&&o.transport&&o.transport.phase!=='home').reduce((n,o)=>n+(o.workers??0),0);
 return Math.max(0,Math.min(e.rules.settlementTrade?.workersMaximum??1,Math.floor(pop*r.workerFraction)-(s.records?.[`levy:${p.seller}`]?.count??0)-r.processingWorkers-r.freshWorkers-r.farmWorkers-2)-busy);
}
function harvestDays(e,record,day){
 const c=e.rules.agriculture.crop;
 const growing=(record?.field?.cohorts??[]).filter(c=>!c.ready).map(row=>Math.max(1,c.growthDays-row.grownDays));
 if(growing.length)return Math.min(...growing);
 const at=day%360,wait=at<=c.sowDays[1]?Math.max(0,c.sowDays[0]-at):360-at+c.sowDays[0];
 return wait+c.growthDays;
}
function surplus(d,e,p,day){
 const s=d.get('state');
 if(!p.public){
  const held=d.get(...e.bagPath(p.seller),p.item);
  if(Number.isSafeInteger(held?.expiresDay)&&held.expiresDay<=day)return 0;
  const farms=recordsWhere(s.records,'category','private_farm').filter(f=>f.owner===p.seller&&f.crop===p.item);
  const family=householdResources(d,e,p.seller,{marketSubstitution:false});
  const next=farms.filter(f=>['growing','ready'].includes(f.status)).map(f=>f.status==='ready'?1:Math.max(1,e.rules.agriculture.crop.growthDays-(f.grownDays??0)));
  const reserve=family.members.length*(next.length?Math.min(...next):harvestDays(e,null,day));
  // The household allocator already retains actual seed and signed claims.
  // Do not subtract those a second time from its available grain.
  return Math.max(0,saleableStock(d,e,p.seller,p.item).available-reserve);
 }
 if(p.legacy){
  const source=s.settlements[p.seller],days=source.foodPerDay>0?1:harvestDays(e,null,day);
  return Math.max(0,source.food-source.population*Math.max(p.profile.reserveDays,days)-householdCommitments(s,p.seller,p.item));
 }
 const r=s.records[`agriculture:${p.seller}`],stock=r.batches.filter(b=>b.kind==='grain'&&b.expiresDay>day).reduce((n,b)=>n+b.amount,0);
 const c=e.rules.agriculture.crop,seedShortfall=Math.max(0,Math.ceil(r.field.areaUnits*c.seedPerHa/c.areaUnitsPerHa)-r.field.seedBank);
 // No expected crop yield is counted as stock. Conservatively keep every
 // local ration until the next possible harvest, and the existing winter floor.
 const reserve=s.settlements[p.seller].population*Math.max(p.profile.reserveDays,harvestDays(e,r,day));
 const contract=p.profile.tradeContract,committed=(contract&&!s.records[`village-trade:${contract.id}`]?contract.quantity:0)+householdCommitments(s,p.seller,p.item);
 return Math.max(0,stock-reserve-seedShortfall-committed);
}
// C uses the identical seed/claims/next-harvest reserve as counter supply.
// A villager must actually follow a market-day trade slot; this exposes no
// remote inventory and does not create a second consignment or grain account.
export function periodicFoodStalls(d,e,minute,{scheduleAt}={}){
 if(!scheduleAt)return [];
 if(!e.calendar(minute).market)return [];
 const state=d.get('state'),out=[],privateSources=producers(d,e).filter(p=>!p.public),villages=new Set((e.rules.agriculture?.settlements??[]).map(p=>p.settlement));
 // A village household may own stored grain without having a currently sown
 // private plot. Its next-harvest gap still uses the same conservative rule.
 for(const h of e.world.households??[])if(villages.has(h.settlement))for(const id of h.members){
  if(!state.npcs?.[id]||!isEffective(e,state,id)||privateSources.some(p=>p.seller===id))continue;
  const item=e.rules.agriculture.grainItem;if(e.quantity(d,id,item)>0)privateSources.push({seller:id,manager:id,settlement:h.settlement,from:state.npcs[id].location,public:false,item});
 }
 for(const p of privateSources){
  const n=state.npcs[p.seller],slot=scheduleAt(e,p.seller,minute,state);
  if(!slot?.services?.includes('trade')||n.location!==slot.location||n.scheduleTravel||n.cognitionTravel)continue;
  // Also return a zero-surplus household to constrain an existing native
  // stall. Omitting it would let the native storefront sell its last ration.
  out.push({kind:'npc',id:`village-market:${p.seller}`,keeper:p.seller,location:slot.location,until:slot.until,settlement:placeSettlement(e,state,slot.location).value,markup:1,goods:[p.item],producer:p});
 }
 return out;
}
export function foodProducerSurplus(d,e,producer,minute){return surplus(d,e,producer,Math.floor(minute/DAY));}
function quotes(d,e,p,minute){
 const view=subjectiveView(e,d.document,p.manager),known=Object.values(view.knowledge.facts).filter(f=>f.kind!=='belief').map(f=>f.value);
 if(p.public)known.push(...d.get(...key(statsKey(p.settlement)))?.quotes??[]);
 return known.filter(q=>q?.item===p.item&&q.buyer&&q.at<=minute&&q.expires>=minute&&Number.isSafeInteger(q.unitPrice)&&q.unitPrice>0&&Number.isSafeInteger(q.quantity)&&q.quantity>0);
}
function cash(d,e,p){return p.public?d.get('state','settlements',p.seller,'treasury'):balance(d,purse(e,p.seller));}
const demand=foodSupplyNeed;
export function planFoodSupply(d,e,minute=d.get('state','minute')){
 return planProducers(d,e,minute,producers(d,e));
}
function planProducers(d,e,minute,production){
 if(!e.rules.foodSupply)return [];
 index(e).paths.clear();
 const plans=[],day=Math.floor(minute/DAY);
 const shops=currentShops(e,d.get('state'));
 for(const p of production){
  if(orders(d.get('state')).some(o=>o.seller===p.seller&&o.item===p.item&&o.scout&&o.transport?.phase!=='home'))continue;
  const spare=spareWorkers(d,e,p),extra=surplus(d,e,p,day);if(!extra)continue;
  const known=quotes(d,e,p,minute),candidates=[];
  for(const q of known){
   const shop=shops.find(s=>s.keeper===q.buyer&&s.location===q.location&&s.settlement!==p.settlement);if(!shop)continue;
   const path=route(d,e,p.from,shop.location,minute);if(!path?.edges.length)continue;
   const unit=e.byId.get(p.item)?.weight;if(!(unit>0))continue;
   const services=transportServices(e,d.document,p.from);
   const bodyRoom=()=>Math.max(0,safeCarryKg(d,e,p.manager)-carriedKg(d,e,p.manager));
   const kg=p.public?Math.min(spare*(e.rules.settlementTrade?.carryKgPerWorker??0),p.legacy?bodyRoom():Infinity):bodyRoom();
   for(const service of [...services,null]){
   const capacity=service?Math.floor(Math.min(service.capacityKg/unit,service.capacityM3/(e.byId.get(p.item).volumeM3??unit/250))):Math.floor(kg/unit);
   let quantity=Math.min(extra,capacity,q.quantity,demand(d,e,shop,p.item),Math.floor(counterCash(d,shop.keeper)/q.unitPrice));
   if(!quantity)continue;
   let freight=0,quote=null;
   if(service){try{quote=quoteTransport(d,e,{asset:service.asset,from:p.from,to:shop.location,owner:p.seller,cargo:[{item:p.item,quantity}]});freight=quote.total;}catch{continue;}}
   else if(path.cost||!spare)continue; // No invented toll collector or free porter.
   if(!service&&(!p.public||p.legacy)){
    try{e.assertNpcAutonomyAction(d.get('state'),[p.manager],{start:minute,minutes:path.minutes*2});e.assertNpcObligationAction(d,[p.manager],{start:minute,minutes:path.minutes*2,location:shop.location,kind:'move'});}catch{continue;}
   }
   if(cash(d,e,p)<freight)continue;
   const tax=p.public?Math.floor(quantity*q.unitPrice*(q.taxBps??0)/10000):0;
   const workers=service?0:Math.ceil(quantity*unit/(e.rules.settlementTrade?.carryKgPerWorker??kg));
   const time=service?0:(path.movingMinutes??path.minutes)*2*workers,net=quantity*q.unitPrice-freight-tax;
   const noise=e.world.marketRules.customerChoice?.noisePermille??0;
   const draw=rollDice(d.document.randomSeed,'food-supply:sale',`${p.seller}:${shop.id}:${p.item}`,minute,0,2*noise+1)-1-noise;
   const decision=npcDecision(subjectiveView(e,d.document,p.manager),{kind:'sell',from:shop.keeper,cost:{minutes:time,value:freight+tax},reward:Math.trunc(quantity*q.unitPrice*(1000+draw)/1000)});
   if(decision.outcome!=='agree'||net<=0)continue;
   const basis=decision.trace.find(t=>t.stage==='cost_benefit').basis;
   candidates.push({...p,shop,q,quantity,path,service:service?.asset??null,freight,quote,workers,net,utility:basis.benefit-basis.cost,decision:decision.outcome});
   }
  }
  // Evaluate every usable vehicle, not just the first one at the loading
  // place. The dispatcher re-plans after each real reservation/payment.
  candidates.sort((a,b)=>b.quantity-a.quantity||b.utility-a.utility||(a.quote?.estimatedArrivalAt??minute+a.path.minutes)-(b.quote?.estimatedArrivalAt??minute+b.path.minutes)||String(a.service??'').localeCompare(String(b.service??'')));
  if(candidates.length){plans.push(candidates[0]);continue;}
  // Unknown prices permit an information trip, never a speculative sale.
  if(!known.length&&p.public&&spare){
   const shop=shops.filter(s=>s.settlement!==p.settlement&&s.restock.some(r=>r.item===p.item)&&route(d,e,p.from,s.location,minute)?.edges.length).sort((a,b)=>route(d,e,p.from,a.location,minute).minutes-route(d,e,p.from,b.location,minute).minutes||a.id.localeCompare(b.id))[0];
   if(shop){const path=route(d,e,p.from,shop.location,minute);
    if(path.cost)continue;
    if(p.legacy){try{e.assertNpcAutonomyAction(d.get('state'),[p.manager],{start:minute,minutes:path.minutes*2});e.assertNpcObligationAction(d,[p.manager],{start:minute,minutes:path.minutes*2,location:shop.location,kind:'move'});}catch{continue;}}
    const potential=Math.min(extra,spare*(e.rules.settlementTrade?.carryKgPerWorker??0)/(e.byId.get(p.item).weight))*e.byId.get(p.item).basePrice;
    const choice=npcDecision(subjectiveView(e,d.document,p.manager),{kind:'observe_market',from:shop.keeper,cost:{minutes:(path.movingMinutes??path.minutes)*2},reward:Math.floor(potential)});
    if(choice.outcome==='agree')plans.push({...p,shop,path,quantity:0,workers:1,scout:true});
   }
  }
 }
 return plans;
}
function stored(o){
 const value=cloneData(o),t=value.transport;
 value.unitPriceCopper=value.unitPrice;
 for(const [object,field]of [[t,'remainingKm'],[t?.segment,'distanceKm']])if(object&&typeof object[field]==='number'&&!Number.isSafeInteger(object[field]))object[field]=toRational(object[field]);
 return value;
}
function moving(o){
 const value=cloneData(o),t=value.transport;
 for(const [object,field]of [[t,'remainingKm'],[t?.segment,'distanceKm']])if(object?.[field]?.numerator!==undefined)object[field]=fromRational(object[field]);
 return value;
}
function persist(d,o){holdingSet(d,null,key(o.id),stored(o),'food-supply');}
function assertOrder(d,e,o){
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 const quantities=['quantity','unitPrice','escrowCopper','paidCopper','refundCopper','deliveredFood','spoiledFood','lostFood','workers'];
 const invalid=quantities.some(k=>!integer(o[k]))||!Array.isArray(o.batches)||o.batches.some(b=>!integer(b.amount)||!((o.legacy||!o.public)&&b.expiresDay===null)&&!Number.isSafeInteger(b.expiresDay))
  ||o.unitPriceCopper!==o.unitPrice||o.quantity!==amount(o)+o.deliveredFood+o.spoiledFood+o.lostFood
  ||o.quantity*o.unitPrice!==o.escrowCopper+o.paidCopper+o.refundCopper
  ||balance(d,escrow(o.id))!==o.escrowCopper||balance(d,cargo(e,o.id,o.item))!==amount(o)
  ||!d.get(...key(o.id))||!['outbound','returning','home'].includes(o.transport?.phase);
 if(invalid)throw Error('Food supply cargo or locked money does not conserve');
}
function journey(path,from){return {phase:'outbound',edges:path.edges,edgeIndex:0,location:from,remainingKm:null,movingMinutes:0,restedBudgets:0,nextAt:null};}
function schedule(d,e,o,minute){
 const t=o.transport;
 if(t.edgeIndex===t.edges.length){t.nextAt=minute;return;}
 t.segment=transportSegment(e,d.get('state'),d.document.randomSeed,t,'walk',minute);t.nextAt=minute+t.segment.minutes;
}
function dispatch(d,e,p,minute){
 const stats=d.get(...key(statsKey(p.settlement)))??{category:'food_supply_stats',settlement:p.settlement,quotes:[]},sequence=stats.nextOrder??0;
 const id=`food-supply:${p.seller}:${p.shop.id}:${minute}:${sequence}`,o={category,foodSupply:true,id,seller:p.seller,manager:p.manager,buyer:p.shop.keeper,shop:p.shop.id,settlement:p.settlement,from:p.from,to:p.shop.location,item:p.item,public:p.public,quantity:p.quantity,workers:p.workers,scout:Boolean(p.scout),status:'in-transit',dispatchAt:minute,unitPrice:p.q?.unitPrice??0,escrowCopper:0,batches:[],deliveredFood:0,spoiledFood:0,lostFood:0,rejectedFood:0,paidCopper:0,refundCopper:0,taxCopper:0,taxBps:0,transport:journey(p.path,p.from)};
 o.legacy=Boolean(p.legacy);o.personCarrier=!p.public||o.legacy;
 if(p.quantity){
  // Re-plan against live stock, money and capacity immediately before locking.
  if(surplus(d,e,p,Math.floor(minute/DAY))<p.quantity||counterCash(d,p.shop.keeper)<p.quantity*p.q.unitPrice||demand(d,e,p.shop,p.item)<p.quantity)return;
  const privateStock=!p.public?d.get(...e.bagPath(p.seller),p.item):null;
  o.batches=p.legacy?[{id:'stock',amount:p.quantity,harvestDay:null,expiresDay:null,kind:null}]:p.public?cloneData(d.get('state','records',`agriculture:${p.seller}`,'batches')).filter(b=>b.kind==='grain'&&b.expiresDay>Math.floor(minute/DAY)): [{id,amount:p.quantity,harvestDay:privateStock?.harvestDay??null,expiresDay:privateStock?.expiresDay??null,kind:'grain'}];
  let left=p.quantity;for(const b of o.batches){const n=Math.min(left,b.amount);b.amount=n;left-=n;}o.batches=o.batches.filter(b=>b.amount);
  persist(d,o);
  if(p.public){const draw=advanceHook('foodSupplyDrawGranary');if(!draw)throw Error('Agriculture supply adapter is not installed');const n=draw(d,e,p.seller,p.quantity,{to:{account:cargo(e,id,p.item)},eventId:id,minimumReserve:p.legacy?d.get('state','settlements',p.seller,'population')*p.profile.reserveDays:undefined});if(n!==p.quantity)throw Error('Food supply surplus changed at pickup');}
  else e.itemDelta(d,p.seller,p.item,-p.quantity,{account:cargo(e,id,p.item),writer:'food-supply',eventId:id,lot:{id,day:o.batches[0].harvestDay,expiresDay:o.batches[0].expiresDay,kind:'grain'}});
  o.escrowCopper=p.quantity*p.q.unitPrice;
  moveCoins(d,{from:dedicatedCoinAccount(d.get('state'),p.shop.keeper,'counter').account,to:escrow(id),amount:o.escrowCopper,writer:'food-supply',eventId:id});
  persist(d,o);
  if(p.service){
   const trip=bookTransport(d,e,{owner:p.seller,recipient:p.shop.keeper,from:p.from,to:p.shop.location,asset:p.service,cargo:[{item:p.item,quantity:p.quantity}],externalOrder:id},id);
   o.carriage=trip.id;o.estimatedArrivalAt=trip.estimatedArrivalAt;o.transport.nextAt=null;
  }
 }
 if(!o.carriage){schedule(d,e,o,minute);
  if(o.personCarrier)holdingSet(d,e,['state','npcs',o.manager,'cognitionTravel'],{transport:id,from:o.from,to:o.to,depart:minute,arrive:minute+p.path.minutes*2},'food-supply');
 }
 persist(d,o);
 d.set(key(statsKey(p.settlement)),{...d.get(...key(statsKey(p.settlement)))??stats,nextOrder:sequence+1});
 return o.id;
}
registerAdvanceHook('advanceFoodSupply',advanceFoodSupply);
registerAdvanceHook('nextFoodSupplyMinute',nextFoodSupplyMinute);
function spoil(d,e,o,minute,lost=false){
 const day=Math.floor(minute/DAY);
 for(const b of o.batches){if(!lost&&(b.expiresDay===null||b.expiresDay>day))continue;moveStock(d,{from:cargo(e,o.id,o.item),to:`sink:${lost?'destroy':'decay'}|${cargo(e,o.id,o.item).split('|')[1]}|${lost?'cargo_loss':'spoil'}`,amount:b.amount,writer:'food-supply',eventId:o.id,pick:[String(b.id)]});o[lost?'lostFood':'spoiledFood']+=b.amount;b.amount=0;}
 o.batches=o.batches.filter(b=>b.amount);
}
function refundBill(d,o){
 if(!o.escrowCopper)return;
 moveCoins(d,{from:escrow(o.id),to:dedicatedCoinAccount(d.get('state'),o.buyer,'counter').account,amount:o.escrowCopper,writer:'food-supply',eventId:o.id});
 o.refundCopper+=o.escrowCopper;o.escrowCopper=0;
}
function arrive(d,e,o,minute){
 // An empty consignment needs no recipient to authorize its failed-delivery
 // refund. The crew still finishes the physical route and return journey.
 if(!o.scout&&!amount(o)){refundBill(d,o);o.status=o.lostFood?'lost':'spoiled';o.arrivedAt=minute;return true;}
 const shop=currentShops(e,d.get('state')).find(s=>s.id===o.shop&&s.keeper===o.buyer&&s.location===o.to);
 if(!shop||d.get('state','npcs',o.buyer,'location')!==o.to||!isEffective(e,d.get('state'),o.buyer))return false;
 if(o.scout){
  const bid=foodSupplyBid(d,e,shop,o.item,minute);if(bid)o.observedQuote=bid;
 }else{
  if(o.carriage&&d.get('state','records',o.carriage,'status')==='arrived')collectTransport(d,e,o.carriage,o.buyer);
  const result=receiveFoodSupply(d,e,shop,o,amount(o),minute);
  if(!result)return false;
  o.deliveredFood=result.quantity;o.paidCopper=result.cost;o.taxCopper=result.tax;o.taxBps=result.taxBps??0;o.escrowCopper-=result.cost;o.batches=[];
  refundBill(d,o);o.status=o.deliveredFood?'delivered':'spoiled';o.arrivedAt=minute;
 }
 return true;
}
function home(d,o,minute){
 o.transport.phase='home';o.transport.nextAt=null;o.homeAt=minute;
 if(o.scout){
  const k=statsKey(o.settlement),s=cloneData(d.get(...key(k))??{category:'food_supply_stats',settlement:o.settlement,quotes:[]});
  if(o.observedQuote)s.quotes=[...s.quotes.filter(q=>q.buyer!==o.buyer||q.item!==o.item),o.observedQuote];
  d.set(key(k),s);o.status='observed';
 }
 if(o.personCarrier&&d.get('state','npcs',o.manager,'cognitionTravel')?.transport===o.id)holdingRemove(d,null,['state','npcs',o.manager,'cognitionTravel'],'food-supply');
 const k=statsKey(o.settlement),stats=cloneData(d.get(...key(k))??{category:'food_supply_stats',settlement:o.settlement,quotes:[]});
 const total=stats.destinations??={},dest=total[o.shop]??{arrived:0,spoiled:0,lost:0,paidCopper:0,refundCopper:0,shipments:0};
 if(!o.scout){dest.arrived+=o.deliveredFood;dest.spoiled+=o.spoiledFood;dest.lost+=o.lostFood;dest.paidCopper+=o.paidCopper??0;dest.refundCopper+=o.refundCopper??0;dest.shipments++;total[o.shop]=dest;stats.destinations=total;}
 stats.lastReturnAt=minute;d.set(key(k),stats);
}
export function nextFoodSupplyMinute(state,now){
 const decision=Math.floor(now/DAY)*DAY+600;
 return Math.min(decision>now?decision:decision+DAY,...orders(state).filter(o=>o.transport?.phase!=='home').map(o=>o.transport.nextAt??Infinity).filter(at=>at>now));
}
export function advanceFoodSupply(d,e,minute=d.get('state','minute'),{plan=true,onReturn=false}={}){
 if(!e.rules.foodSupply)return;
 const returned=new Set();
 for(const old of orders(d.get('state'))){
  assertOrder(d,e,old);
  if(old.transport.phase==='home')continue;
  const o=moving(old),t=o.transport;spoil(d,e,o,minute);
  if(!o.scout&&!amount(o)&&o.escrowCopper){refundBill(d,o);o.status=o.lostFood?'lost':'spoiled';}
  if(JSON.stringify(stored(o))!==JSON.stringify(old))persist(d,o);
  if(o.carriage){
   const trip=d.get('state','records',o.carriage);
   if(trip?.status==='wrecked'){settleWreckedShipment(d,e,trip.id,minute);Object.assign(o,cloneData(d.get(...key(o.id))));spoil(d,e,o,minute,true);o.status='lost';
    refundBill(d,o);home(d,o,minute);
   }else if(['arrived','delivered'].includes(trip?.status)){
    if(arrive(d,e,o,minute))home(d,o,minute);else t.nextAt=(Math.floor(minute/720)+1)*720;
   }
  }else if(t.nextAt<=minute){
   if(t.segment){const reached=stepTransport(e,t,t.segment);t.segment=null;if(reached&&o.personCarrier)holdingSet(d,e,['state','npcs',o.manager,'location'],t.location,'food-supply');}
   if(t.edgeIndex===t.edges.length){
    if(t.phase==='outbound'){
     if(arrive(d,e,o,minute)){t.phase='returning';t.edges=[...t.edges].reverse();t.edgeIndex=0;t.remainingKm=null;schedule(d,e,o,minute);}else t.nextAt=(Math.floor(minute/720)+1)*720;
    }else home(d,o,minute);
   }else schedule(d,e,o,minute);
  }
  if(JSON.stringify(stored(o))!==JSON.stringify(old))persist(d,o);
  if(o.transport.phase==='home'&&old.transport.phase!=='home'&&(!o.scout||o.observedQuote))returned.add(o.seller);
 }
 if(plan||onReturn&&returned.size){
  // Completed trips are represented by settlement totals, not an unbounded
  // daily order history. Live cargo and cash always keep their own record.
  for(const o of orders(d.get('state')))if(o.transport.phase==='home'&&o.homeAt<minute&&!amount(o)&&!o.escrowCopper){
   holdingRemove(d,e,key(o.id),'food-supply');
   // A trip may be created and deleted within one long engine action. The
   // generic observer cannot infer its category from that action's original
   // snapshot after deletion; explicitly clear this source's projection too.
   syncHoldings(d,e,'food-supply',o.id,{writer:'food-supply'});
  }
  for(const producer of producers(d,e).filter(p=>plan||returned.has(p.seller))){
   // Each iteration consumes actual stock, cash, workers or one vehicle's
   // remaining batch room. No daily seller lock limits independent vehicles.
   for(;;){const p=planProducers(d,e,minute,[producer])[0];if(!p)break;
    const id=obligationTransaction(d,()=>dispatch(d,e,p,minute));if(!id||p.scout)break;
   }
  }
 }
 for(const o of orders(d.get('state')))assertOrder(d,e,o);
}
