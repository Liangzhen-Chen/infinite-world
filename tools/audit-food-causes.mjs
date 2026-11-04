// S5 closing audit AUDIT1: (1) attribute every missed meal of the town (named households and
// statistical groups) to harvest / poverty / allocation / chain-break from the world state of that
// noon, (2) reconcile coins and food against the ledger flows. Read-only: it drives the real engine
// day by day and changes no rule, no save field. Output is deterministic (no clock values in it).
// Usage: node tools/audit-food-causes.mjs [days=30] [outFile]
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {householdBudget,statisticalFoodGroups,statisticalFoodNeed} from '../server-plugin/household-budget.mjs';
import * as householdFood from '../server-plugin/household-food.mjs';
const {householdFoodDemand,householdFoodConversion}=householdFood;
import {currentShops} from '../server-plugin/shop.mjs';
import {openShops} from '../server-plugin/business.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {isEffective} from '../server-plugin/lifecycle-state.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';
import {foodProducerSurplus} from '../server-plugin/food-supply.mjs';
import * as subsistence from '../server-plugin/household-subsistence.mjs';
import {marketQuote,quoteSupply,saleableStock,customerReachMinutes} from '../server-plugin/market.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {bodyRule} from '../server-plugin/primitives-body.mjs';
import {counterCash} from '../server-plugin/money.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';
import {auditLedger,driftCounts,parseAccount} from '../server-plugin/ledger.mjs';

const DAY=1440,NOON=720,CAUSES=['harvest','poverty','allocation','chain'];
const sid='loc_bs';
const num=v=>typeof v==='number'?v:Number(v?.numerator??0)/Number(v?.denominator??1);
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const round=(n,k=2)=>Math.round(n*10**k)/10**k;

// file:line of the engine gate that produced a verdict; found by text so it never goes stale unnoticed.
const lineCache=new Map();
async function srcLine(file,needle){
 const key=`${file}\u0000${needle}`;if(lineCache.has(key))return lineCache.get(key);
 const text=(await fs.readFile(new URL(`../server-plugin/${file}`,import.meta.url),'utf8')).split('\n');
 const at=text.findIndex(l=>l.includes(needle));
 const out=at<0?`${file}:?(${needle})`:`server-plugin/${file}:${at+1}`;lineCache.set(key,out);return out;
}

// The verdict for one missed meal, from facts read at that noon. Order matters and is the card's:
//  harvest    - everything saleable within a day of walking (shelves + producer surplus) is less than the town's demand;
//  poverty    - the household's cash per person cannot buy the cheapest person-day of food (the cheapest one on a
//               reachable shelf, or the catalogue's cheapest when nothing is on sale), so it could not eat even if the chain worked;
//  chain      - food is sellable and the household can pay, yet nothing is on sale where it can buy;
//  allocation - food and cash both exist, but the shelf was bought out first or the customer's own decision refused;
//  chain      - otherwise: shop open, stock, cash, and still no purchase.
// facts: {rawUnusable,supply,demand,best:{cost,sameSettlement}|null,refCost,perCapitaCash,cash,soldOut,declined,servedShops,group,simulated,townShops}
export function verdict(f){
 const need=f.best?.cost??f.refCost;
 if(f.supply<f.demand)return {cause:'harvest',reason:'saleable food within a day (shelves + producer surplus) is less than the town demand',clue:[['food-supply.mjs','function surplus(']]};
 if(f.perCapitaCash<need){
  return {cause:'poverty',reason:`cash per person is less than the cheapest person-day of food${f.best?' within reach':' (none on sale; catalogue price)'}`,
   clue:[['household-budget.mjs','export function householdBudget(']]};
 }
 // A household of unexpanded members keeps its opening money and stock parked in its own opening record; no member is a
 // campaign actor, so nobody walks to a counter for it (walkIns) and the meal plan does not read the record either.
 if(!f.group&&f.simulated===false)return {cause:'chain',reason:'roster-only household: it holds money in its opening record but no member is a campaign actor, so nobody buys food for it',
  clue:[['business.mjs','function walkIns(d,engine,t)','only simulated full persons walk in'],['household-budget.mjs','function family(d,engine,owner)','meal plan reads member bags only, not the opening record']]};
 // I3c: raw grain that is on a reachable shelf (or is the only grain there) but that this household cannot turn into food
 // (no recipe, no fetchable water/fuel, no utensil): separated from "nothing edible on the shelf" so it can be counted to zero.
 if(!f.best&&f.rawUnusable)return {cause:'chain',reason:f.rawWhy==='labour'?'raw grain is on sale and the home recipe route exists (water, fuel, hearth, utensils), but this household has less free time in the afternoon window than one batch takes: its adults are on paid shifts':`raw grain is on sale within reach, but this household cannot make it edible: ${f.rawWhy}`,
  clue:[['household-food.mjs','export function householdFoodConversion(','the household chain from raw grain to food']]};
 if(!f.best){
  const own=f.townShops??{total:0,open:0};
  const why=!own.total?'no food shop is registered in the own settlement':!own.open?'the own settlement\'s shop is not trading in it at noon (closed, or its keeper trades elsewhere)':'the own settlement\'s open shop has nothing edible on its shelf';
  const gate=!own.total?['shop.mjs','export function currentShops','no shop of this settlement is listed']:!own.open?['business.mjs','const keeper=state.npcs?.[shop.keeper],slot=keeper&&scheduleAt(engine,shop.keeper,t,state);','the shop opens only where its keeper stands at noon with a trade slot']:['shop.mjs','export function receiveFoodSupply','shelf stocked only by deliveries'];
  return {cause:'chain',reason:`grain is sellable within a day and the household can pay, but nothing is on sale within reach: ${why}`,
   clue:[['food-supply.mjs','const shop=shops.find(s=>s.keeper===q.buyer&&s.location===q.location&&s.settlement!==p.settlement)','a producer ships only to a shop that quoted it, in another settlement'],gate]};
 }
 if(f.soldOut)return {cause:'allocation',reason:'shelf was bought out before this household',clue:[['business.mjs','let quantity=Math.min(want.quantity,available(item)),quote=null;']]};
 if(f.declined)return {cause:'allocation',reason:`customer decision refused: ${f.declined}`,clue:[['business.mjs',"if(decision.outcome!=='agree')"]]};
 if(!f.servedShops)return {cause:'chain',reason:f.best.sameSettlement?'shop open in own settlement but beyond customer reach':'food is on sale within a day, but no open shop in own settlement (resident customers only serve own-settlement shops)',
  clue:[['business.mjs',f.group?"statisticalFoodGroups(engine,d.get('state'),shop.settlement)":'settlement!==shop.settlement']]};
 return {cause:'chain',reason:'open shop with stock in own settlement, money in hand, no purchase happened',
  clue:f.group?[['business.mjs','if(finishAt>shop.until||finishAt+inbound.minutes>(day+1)*DAY)break;','trip must end inside the keeper\'s trade window'],['business.mjs','const needed=items?Math.max(0,items[item]-scoped.quantity(d,statistical.owner,item)):Math.ceil(householdFoodDemand(','quantity comes from householdFoodDemand']]:[['business.mjs','const want=wants(d,engine,id,item,gaps);','household wants()'],['business.mjs','if(returnAt>(slot.until??(day+1)*DAY)||finishAt>(shop.until??(day+1)*DAY))break;','trip must end inside the keeper\'s trade window']]};
}

export async function runAudit({days=30,progress=()=>{},dayTripMinutes=null}={}){
 const world=await loadWorld(),e=new WorldEngine(world);
 const legacy=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
 let doc=e.createCharacter(legacy,{},'TFB-30-day');
 globalThis.__LEDGER_TRACE__=[];
 const grain=e.rules.agriculture.grainItem,seed=doc.randomSeed;
 const baseMeal=bodyRule(e,'satiety').drainPerHour.light*24,reach=customerReachMinutes(e),dayTrip=dayTripMinutes??e.rules.travel.dailyTravelMinutes;
 // Every settlement that keeps a household roster or has an unexpanded population (statistical groups), from the world data.
 const sids=[...new Set([...world.households.map(h=>h.settlement),...(world.settlementProfiles??[]).filter(p=>p.registrationMode==='seeded-on-demand').map(p=>p.id)])].sort();
 const homesOf=new Map(sids.map(sid=>[sid,new Map(world.households.filter(h=>h.settlement===sid).map(h=>[h.id,h]))]));
 const gain=item=>e.byId.get(item)?.nutrition?.satiety??0;
 const refCost=Math.min(...world.items.filter(i=>gain(i.id)>0&&i.basePrice>0).map(i=>Math.ceil(baseMeal/gain(i.id))*i.basePrice));
 const start={minute:doc.state.minute,money:legacyMoney(e,doc.state),stock:legacyStock(e,doc.state).balances};
 const advance=async(to,id)=>{const out=await e.reduce(doc,{tool:'world_time',args:{minutes:to-doc.state.minute},eventId:id});doc=applyPatches(doc,out.patches);};

 const rawGrainSample=[];
 // the shortest cooking step that takes the raw grain straight to a food item: a household with less free time than this cannot run a batch
 const grainCook=Math.min(...world.recipes.filter(r=>r.materials.some(m=>m.item===grain)&&gain(r.output.item)>0).map(r=>r.minutes),Infinity);
 const daily=[],incidents=[],chainRows=[],chainSpread=[],spreadDays=new Set(),stalls=[];// stalls = producer chain-break rows
 const tally=Object.fromEntries(sids.map(sid=>[sid,Object.fromEntries(CAUSES.map(c=>[c,{incidents:0,meals:0,people:0,households:new Set(),reasons:{}}]))]));
 const total=Object.fromEntries(sids.map(sid=>[sid,{named:{incidents:0,meals:0},statistical:{incidents:0,meals:0}}]));
 const prevUnmet=new Map(),prevMissing=new Map(),dispatchSeen=new Map(),dispatchCount=new Map(),idleDays=new Map();
 const routeMemo=new Map();
 const route=(from,to,minute)=>{
  const key=`${from}|${to}|${Math.floor(minute/DAY)}`;
  if(!routeMemo.has(key)){try{const r=e.route(from,to,'walk',minute,seed);routeMemo.set(key,{minutes:r.minutes,cost:r.cost??0});}catch{routeMemo.set(key,null);}}
  return routeMemo.get(key);
 };

 for(let j=0;j<days;j++){
  const noon=Math.floor(doc.state.minute/DAY)*DAY+NOON;
  await advance(noon-1,`audit:pre:${j}`);
  const P=doc,rd=reader(P),ps=P.state;
  const day=Math.floor(noon/DAY);

  // ---- shops open at noon (the engine's own opening rule), their food shelf and the price of one person-day of it ----
  const shopRows=[];
  const slots=new Map();
  const slotOf=id=>{if(!slots.has(id))slots.set(id,scheduleAt(e,id,noon,ps)??null);return slots.get(id);};
  const registered=currentShops(e,ps),opened=openShops(rd,e,noon);
  const shops=[...registered.map(s=>({id:s.id,keeper:s.keeper,markup:s.markup??1,settlement:s.settlement,fixed:s.location,goods:s.restock.map(r=>r.item),open:opened.find(o=>o.id===s.id)})),
   ...opened.filter(o=>!registered.some(s=>s.id===o.id)).map(o=>({id:o.id,keeper:o.keeper,markup:o.markup??1,settlement:o.settlement,goods:o.goods,open:o}))];
  for(const shop of shops){
   const o=shop.open,open=Boolean(o),location=o?.location??shop.fixed??ps.npcs?.[shop.keeper]?.location;
   const items=[];
   if(open)for(const item of [...new Set(o.goods)]){
    const stock=saleableStock(rd,e,shop.keeper,item,{business:true}).available,cap=o.producer?.item===item?foodProducerSurplus(rd,e,o.producer,noon):Infinity,avail=Math.min(stock,cap);
    const edible=gain(item)>0;
    if(avail>0&&(edible||item===grain||e.world.recipes.some(r=>r.materials.some(m=>m.item===item))))items.push({item,avail,edible});
   }
   shopRows.push({id:shop.id,keeper:shop.keeper,markup:o?.markup??shop.markup,registered:shop.settlement,settlement:open?o.settlement:shop.settlement,location,open,until:o?.until??null,items,producer:Boolean(o?.producer)});
  }
  const chainGain=(item,seen=new Set())=>{let best=0;for(const r of world.recipes)if(!seen.has(r.id)){const m=r.materials.find(x=>x.item===item);if(!m)continue;const out=gain(r.output.item)>0?gain(r.output.item)*r.output.quantity/m.amount:chainGain(r.output.item,new Set([...seen,r.id]))*r.output.quantity/m.amount;best=Math.max(best,out);}return best;};
  const convGain=(owner,item)=>{if(!owner)return 0;try{return householdFoodConversion(rd,e,owner,item,noon)?.gainPerUnit??0;}catch{return 0;}};
  const quoteMemo=new Map();
  const unitPrice=(shop,item,units,buyer)=>{
   const key=`${shop.id}|${item}|${units}`;
   if(!quoteMemo.has(key)){
    let out=null;
    try{
     const business={keeper:shop.keeper,markup:shop.markup},supply=quoteSupply(rd,e,{item,location:shop.location,business});
     const base=regionalTradeBase(rd,e,item,shop.location,noon)*wildlifePriceFactor(e,P,item,shop.location);
     out=marketQuote(rd,e,{seller:shop.keeper,buyer,item,quantity:units,location:shop.location,minute:noon,base,business,supply}).totalCoins;
    }catch{out=null;}
    quoteMemo.set(key,out);
   }
   return quoteMemo.get(key);
  };

  // ---- producer-side chain, per settlement: surplus, an open road to it, a buyer with money, and cargo shipped TO it ----
  const shopPlace=new Map(registered.map(s=>[s.id,s.settlement]));
  const grainGain=chainGain(grain);
  const pre={},chainIdle=new Map();
  for(const sid of sids){
   const cargoOrders=Object.values(ps.records??{}).filter(r=>r.category==='settlement_trade'&&r.foodSupply&&!r.scout&&shopPlace.get(r.shop)===sid);
   const townShopRows=shopRows.filter(s=>s.registered===sid);
   const buyerCash=statisticalFoodGroups(e,ps,sid).reduce((n,g)=>n+(g.coins??0),0)+townShopRows.reduce((n,s)=>n+counterCash(rd,s.keeper),0);
   const producerRows=[];
   for(const p of e.rules.agriculture?.settlements??[]){
    const rec=ps.records?.[`agriculture:${p.settlement}`];
    if(rec?.mode!=='managed'||!ps.settlements?.[p.settlement]||!ps.npcs?.[p.manager]||!isEffective(e,ps,p.manager))continue;
    const desc={seller:p.settlement,manager:p.manager,settlement:p.settlement,from:p.counter,public:true,profile:p,item:grain};
    const surplus=foodProducerSurplus(rd,e,desc,noon);
    const own=p.settlement===sid,toTown=own?{minutes:0,cost:0}:route(p.counter,sid,noon),back=own?{minutes:0,cost:0}:route(sid,p.counter,noon);
    const ck=`${sid}|${p.settlement}`,seen=dispatchSeen.get(ck)??new Set();
    for(const o of cargoOrders)if(o.seller===p.settlement)seen.add(o.id);dispatchSeen.set(ck,seen);
    const done=Object.entries(ps.records?.[`food-supply-stats:${p.settlement}`]?.destinations??{}).filter(([shop])=>shopPlace.get(shop)===sid).reduce((n,[,d])=>n+d.shipments,0);
    const roadOpen=Boolean(toTown&&back&&!toTown.cost&&!back.cost);
    producerRows.push({settlement:p.settlement,own,surplus,roadOpen,buyerCash,dispatched:Math.max(seen.size,done),tripMinutes:toTown?toTown.minutes+(back?.minutes??0):null});
   }
   // "Zero transport" = the cumulative count of cargo orders to the settlement did not grow, day after day.
   const chainOpenToday=new Map();
   for(const row of producerRows){
    const key=`${sid}|${row.settlement}`,last=dispatchCount.get(key);
    const moved=last!==undefined&&row.dispatched>last;dispatchCount.set(key,row.dispatched);
    const can=!row.own&&row.surplus>0&&row.roadOpen&&row.buyerCash>0;
    const idle=can&&!moved?(idleDays.get(key)??0)+1:0;idleDays.set(key,idle);
    chainOpenToday.set(row.settlement,idle);
    if(idle>=7)stalls.push({day,sid,settlement:row.settlement,idleDays:idle,surplus:row.surplus,buyerCash:row.buyerCash,tripMinutes:row.tripMinutes});
   }
   pre[sid]={townShopRows,producerRows,chainOpenToday};
  }

  // ---- run the rest of the day (noon customers, afternoon, midnight meal) ----
  const next=Math.floor((day+1)*DAY)+540;
  await advance(next,`audit:post:${j}`);
  const E=doc,es=E.state;
  const visitsOf=(shopId)=>es.records?.[`customer_flow:${shopId}:${day}`]?.visits??[];
  const boughtAt=(shop,item)=>[...Object.values(es.records??{})].filter(r=>r.category==='customer_flow'&&r.shop===shop&&r.day===day).flatMap(r=>r.visits).filter(v=>v.outcome==='bought'&&v.item===item).reduce((n,v)=>n+v.quantity,0);
  const dailyRow={day,settlements:{},producers:[...new Map(Object.values(pre).flatMap(x=>x.producerRows).map(r=>[r.settlement,{settlement:r.settlement,surplus:r.surplus}])).values()]};

  for(const sid of sids){
  const {townShopRows,producerRows,chainOpenToday}=pre[sid];
  // ---- today's demand of the whole settlement and the food within a day of walking of it ----
  const hungryNamed=[];
  for(const [hid,h] of homesOf.get(sid)){
   // A household whose members have no simulated state owns no purse and no stock: its need is last meal's need.
   const meal=ps.family?.meals?.[hid]??Object.values(ps.family?.meals??{}).find(m=>m.household===hid);
   const owner=meal?.owner??h.members.find(m=>ps.npcs?.[m])??h.members[0];
   hungryNamed.push({hid,owner,members:h.members,home:h.homeLocation,simulated:Boolean(ps.npcs?.[owner]),lastNeed:meal?num(meal.needs?.satiety):h.members.length*baseMeal});
  }
  // The group accounts are created by the first noon customer flow, so day 0 only has them after the step.
  const groups=statisticalFoodGroups(e,es,sid);
  const demandOf=(entity)=>entity.group?statisticalFoodNeed(e,ps,sid,rd,entity.group):entity.simulated?householdFoodDemand(rd,e,entity.owner,noon):entity.lastNeed;
  const entities=[...hungryNamed.map(h=>({...h,kind:'named'})),...groups.map(g=>({hid:g.owner,owner:g.owner,group:g,kind:'statistical'}))];
  let townDemand=0;for(const en of entities){en.demand=demandOf(en);townDemand+=en.demand;}
  const homeLocation=en=>en.group?sid:en.simulated?(slotOf(en.owner)?.location??ps.npcs?.[en.owner]?.location):en.home;
  const reachable=(en)=>{
   const from=homeLocation(en),out=[];
   for(const shop of shopRows){
    if(!shop.open||!shop.items.length)continue;
    const a=from===shop.location?{minutes:0,cost:0}:route(from,shop.location,noon),b=from===shop.location?{minutes:0,cost:0}:route(shop.location,from,noon);
    if(!a||!b||a.minutes+b.minutes>dayTrip)continue;
    out.push({shop,out:a.minutes,back:b.minutes,toll:a.cost+b.cost,sameSettlement:shop.settlement===sid,engineServes:shop.settlement===sid&&a.minutes<=reach});
   }
   return out;
  };
  // Supply is counted once per shop and item for the settlement (every household can reach the same ones from the
  // same settlement, within the engine route function); the first entity's reach stands for the settlement.
  const townReach=entities.length?reachable(entities[0]):[];
  let townSupplySatiety=0;
  for(const r of townReach)for(const it of r.shop.items){
   const g=it.edible?gain(it.item):(convGain(entities.find(x=>x.kind==='named'&&x.simulated)?.owner,it.item));
   townSupplySatiety+=it.avail*g;
  }
  const shelfSatiety=townSupplySatiety;
  // Public granaries within a day's round trip: their surplus beyond reserve is sellable grain (turned to satiety by the recipe chain).
  let granarySatiety=0;
  for(const row of producerRows)if(row.surplus>0&&row.tripMinutes!==null&&row.tripMinutes<=dayTrip)granarySatiety+=row.surplus*grainGain;
  townSupplySatiety+=granarySatiety;

  // ---- missed meals of this day ----
  const missed=[];
  for(const en of entities){
   if(en.kind==='named'){
    const m=Object.values(es.family?.meals??{}).find(x=>x.household===en.hid);if(!m)continue;
    const missing=num(m.missingMeals),before=prevUnmet.get(en.hid)??0;prevUnmet.set(en.hid,m.unmetMealDays??0);
    if(missing>0&&(m.unmetMealDays??0)>before)missed.push({en,meals:missing,people:en.members.length});
   }else{
    const rec=es.records?.[en.owner],cum=num(rec?.missingSatiety),before=prevMissing.get(en.owner)??0;prevMissing.set(en.owner,cum);
    const meals=(cum-before)/baseMeal;if(meals>0&&rec.mealDay!==undefined)missed.push({en,meals,people:en.group.beneficiaryUnits});
   }
  }
  for(const {en,meals,people} of missed){
   total[sid][en.kind].incidents++;total[sid][en.kind].meals+=meals;
   const where=homeLocation(en),reach1=reachable(en);
   const cash=en.group?(en.group.coins??0):en.simulated?householdBudget(rd,e,en.owner).cash:(ps.records?.[en.hid]?.townOpeningHousehold?ps.records[en.hid].coins??0:0)+en.members.reduce((n,m)=>n+(ps.npcs?.[m]?.coins??0)+(ps.records?.[`town-opening:${m}`]?.coins??0),0);
   const unitsCash=en.group?cash/Math.max(1,en.group.beneficiaryUnits):cash/Math.max(1,en.members.length);
   // cheapest listed food, priced for one person-day of satiety through the engine quote
   let best=null;
   for(const r of reach1)for(const it of r.shop.items){
    const g=it.edible?gain(it.item):((en.simulated||en.group)?convGain(en.owner,it.item):0);if(!(g>0))continue;
    const units=Math.max(1,Math.ceil(baseMeal/g)),price=unitPrice(r.shop,it.item,units,en.owner);if(price===null||price<1)continue;
    const cost=price+r.toll;
    if(!best||cost<best.cost||(cost===best.cost&&r.shop.id<best.shop.id))best={shop:r.shop,item:it.item,units,cost,reach:r,avail:it.avail};
   }
   const idleMax=Math.max(0,...[...chainOpenToday.values()]);
   const granariesNear=producerRows.filter(r=>r.surplus>0&&r.tripMinutes!==null&&r.tripMinutes<=dayTrip);
   const mine=reach1.filter(r=>r.engineServes),names=[...en.members??[en.owner]];
   const declined=mine.flatMap(r=>visitsOf(r.shop.id)).find(v=>names.includes(v.npc)&&v.outcome!=='bought');
   const soldOut=Boolean(best&&best.reach.engineServes&&boughtAt(best.shop.id,best.item)>0&&boughtAt(best.shop.id,best.item)>=best.avail);
   const rawUnusable=(en.simulated||en.group)&&reach1.some(r=>r.shop.items.some(it=>!it.edible&&chainGain(it.item)>0&&!(convGain(en.owner,it.item)>0)));
   // Which input of the home chain is missing: read from the same journey functions the cook uses.
   let rawWhy=null;
   if(rawUnusable&&!best){
    // Older engines have no home provisioning at all: then the home chain simply has no route from raw grain.
    const journey=subsistence.householdSourceJourney,cookHome=en.group?sid:en.home,wj=journey?.(e,ps,cookHome,'water',noon,0),fj=journey?.(e,ps,cookHome,'fuel',noon,1);
    rawWhy=!journey?'no home recipe route from raw grain (no water/fuel provisioning, the only chain needs a mill, salt and shavings)':!wj?'no usable water source within a day of walking':!fj?'no forest with wood within a day of walking (fuel)':!en.group&&en.simulated&&householdFood.freeMinutes(rd,e,en.owner,Math.floor(noon/DAY)*DAY+780)<grainCook?'labour':'water and fuel are reachable, but a utensil, the hearth or the afternoon window does not allow a batch';
   }
   const v=verdict({rawUnusable,rawWhy,supply:townSupplySatiety,demand:townDemand,best:best&&{cost:best.cost,sameSettlement:best.reach.sameSettlement},perCapitaCash:unitsCash,cash,soldOut,declined:declined&&(declined.reason??declined.outcome),servedShops:mine.length,group:Boolean(en.group),simulated:en.simulated,refCost,townShops:{total:townShopRows.length,open:townShopRows.filter(s=>s.open&&s.settlement===sid).length}});
   if(rawWhy&&rawGrainSample.length<12)rawGrainSample.push({day,settlement:sid,household:en.hid,kind:en.kind,owner:en.owner,simulated:en.simulated,home:en.group?sid:en.home,reason:rawWhy});
   const cause=v.cause,reason=v.reason,clue=(await Promise.all(v.clue.map(([f,n,note])=>srcLine(f,n).then(l=>note?`${l} (${note.replace('$sid',sid)})`:l)))).join('; ');
   const t=tally[sid][cause];t.incidents++;t.meals+=meals;t.reasons[reason]=(t.reasons[reason]??0)+1;
   if(!t.households.has(en.hid)){t.households.add(en.hid);t.people+=people;}
   const spread=cause==='chain'&&en.kind==='statistical'&&!spreadDays.has(`${sid}|${day}`)&&chainSpread.length<10;
   if(cause==='chain'&&(chainRows.length<20||spread)){
    const row={settlement:sid,household:en.hid,day,location:where,
     nearbyGranaries:granariesNear.map(r=>({settlement:r.settlement,surplusOats:r.surplus,roundTripMinutes:r.tripMinutes,idleDays:chainOpenToday.get(r.settlement)??0})),townShops:townShopRows.map(s=>({shop:s.id,openInTown:s.open&&s.settlement===sid,keeperNoonSettlement:s.settlement,keeperNoonLocation:s.location,tradeUntilMinute:s.until,keeper:s.keeper,keeperNoonActivity:slotOf(s.keeper)?.activity??null,stock:s.items.map(i=>`${i.item}:${i.avail}`)})),shopsElsewhereOpen:shopRows.filter(s=>s.open&&s.settlement!==sid).map(s=>({shop:s.id,settlement:s.settlement,stock:s.items.map(i=>`${i.item}:${i.avail}`)})),shopsNearby:reach1.map(r=>({shop:r.shop.id,settlement:r.shop.settlement,roundTripMinutes:r.out+r.back,engineServes:r.engineServes,stock:r.shop.items.map(i=>`${i.item}:${i.avail}`)})),
     longestProducerIdleDays:idleMax,stockNote:`settlement supply satiety ${round(townSupplySatiety)} vs demand ${round(townDemand)}`,cash:round(cash),cheapestPersonDay:best?{shop:best.shop.id,item:best.item,coins:best.cost}:null,
     missingMeals:round(meals),reason,clue};
    if(chainRows.length<20)chainRows.push(row);
    if(spread){spreadDays.add(`${sid}|${day}`);chainSpread.push(row);}
   }
   if(incidents.length<400)incidents.push({day,settlement:sid,household:en.hid,cause,meals:round(meals),reason});
  }
  dailyRow.settlements[sid]={townDemand:round(townDemand),shelfSatiety:round(shelfSatiety),granarySatiety:round(granarySatiety),missedNamed:round(missed.filter(m=>m.en.kind==='named').reduce((n,m)=>n+m.meals,0)),missedStatistical:round(missed.filter(m=>m.en.kind==='statistical').reduce((n,m)=>n+m.meals,0))};
  }
  daily.push(dailyRow);
  progress(j,doc.state.minute);
 }

 // ---- conservation ----
 const end={minute:doc.state.minute,money:legacyMoney(e,doc.state),stock:legacyStock(e,doc.state).balances};
 const ledger=doc.ledger,trace=globalThis.__LEDGER_TRACE__;globalThis.__LEDGER_TRACE__=undefined;
 const byRes=(map)=>{const out={};for(const [k,n] of map){const r=parseAccount(k).resource;out[r]=(out[r]??0)+n;}return out;};
 const flowsBy=(res)=>{const out={sources:{},sinks:{},genesis:0};for(const [k,n] of Object.entries(ledger?.flows??{})){const a=parseAccount(k);if(a.resource!==res)continue;
  if(k.startsWith('src:genesis|'))out.genesis+=n;else if(a.owner.startsWith('src:'))out.sources[`${a.owner}|${a.purpose}`]=n;else out.sinks[`${a.owner}|${a.purpose}`]=n;}return out;};
 // food resources: edible items plus every ancestor in a recipe chain that ends in an edible item
 const edible=new Set(world.items.filter(i=>i.nutrition?.satiety>0).map(i=>i.id));
 for(let grew=true;grew;){grew=false;for(const r of world.recipes)if(edible.has(r.output.item))for(const m of r.materials)if(!edible.has(m.item)){edible.add(m.item);grew=true;}}
 const resources=Object.keys({...byRes(start.money),...byRes(end.money)});
 const coinRes=resources.filter(r=>r.startsWith('coin_'));
 const sum=(o)=>Object.values(o).reduce((a,b)=>a+b,0);
 const moneyRows={};
 const startM=byRes(start.money),endM=byRes(end.money),startS=byRes(start.stock),endS=byRes(end.stock);
 for(const res of coinRes){
  const f=flowsBy(res),late=f.genesis-(startM[res]??0),delta=(endM[res]??0)-(startM[res]??0),net=sum(f.sources)+late-sum(f.sinks);
  moneyRows[res]={start:startM[res]??0,end:endM[res]??0,delta,sources:sum(f.sources),lateGenesis:late,sinks:sum(f.sinks),flowNet:net,difference:delta-net,
   ledgerEnd:Object.entries(ledger?.accounts??{}).filter(([k])=>parseAccount(k).resource===res).reduce((n,[,v])=>n+v,0),
   topSources:Object.entries(f.sources).sort((a,b)=>b[1]-a[1]).slice(0,8),topSinks:Object.entries(f.sinks).sort((a,b)=>b[1]-a[1]).slice(0,8)};
 }
 const foodRows={};
 for(const res of [...edible].sort()){
  const f=flowsBy(res),late=f.genesis-(startS[res]??0),delta=(endS[res]??0)-(startS[res]??0),net=sum(f.sources)+late-sum(f.sinks);
  if(!delta&&!net&&!(startS[res]))continue;
  foodRows[res]={start:startS[res]??0,end:endS[res]??0,delta,lateGenesis:late,sources:f.sources,sinks:f.sinks,difference:delta-net};
 }
 // Food in = production (src:regrowth/birth/craft), world-boundary imports and stock first opened lazily;
 // food out = meals, sowing, army rations, craft inputs, decay and exports. Satiety units are not mixed: these are item counts.
 const foodTotal={start:0,end:0,delta:0,lateGenesis:0,in:{},out:{},difference:0};
 for(const row of Object.values(foodRows)){
  foodTotal.start+=row.start;foodTotal.end+=row.end;foodTotal.delta+=row.delta;foodTotal.lateGenesis+=row.lateGenesis;foodTotal.difference+=row.difference;
  for(const [k,n] of Object.entries(row.sources))foodTotal.in[k]=(foodTotal.in[k]??0)+n;
  for(const [k,n] of Object.entries(row.sinks))foodTotal.out[k]=(foodTotal.out[k]??0)+n;
 }
 foodTotal.in=Object.fromEntries(Object.entries(foodTotal.in).sort());foodTotal.out=Object.fromEntries(Object.entries(foodTotal.out).sort());
 // Which accounts and which writers made the two books disagree at the end (legacy fields vs ledger)
 const mismatches=[];
 const expected=new Map([...end.money,...end.stock]),accounts=ledger?.accounts??{};
 for(const k of new Set([...expected.keys(),...Object.keys(accounts)])){const a=expected.get(k)??0,b=accounts[k]??0;if(a!==b)mismatches.push({account:k,legacy:a,ledger:b});}
 mismatches.sort((a,b)=>a.account<b.account?-1:1);
 const writers={};
 for(const t of trace??[]){const toFlow=/^(src|sink):/.test(t.to.split('|')[0]),fromFlow=/^(src|sink):/.test(t.from.split('|')[0]);
  if(!toFlow&&!fromFlow)continue;const k=`${t.writer}|${toFlow?t.to:t.from}`;writers[k]=(writers[k]??0)+t.amount;}
 const writerRows=Object.entries(writers).map(([k,n])=>{const [w,...rest]=k.split('|');return {writer:w,flow:rest.join('|'),amount:n};}).sort((a,b)=>a.writer<b.writer?-1:a.writer>b.writer?1:a.flow<b.flow?-1:1);
 const writerSample=new Map();
 for(const row of Object.keys(ledger?.flows??{}).length?writerRows:[])writerSample.set(row.writer,true);
 const writerFiles={};
 for(const w of writerSample.keys()){
  const found=(await fs.readdir(new URL('../server-plugin/',import.meta.url))).filter(f=>f.endsWith('.mjs'));
  for(const f of found){const text=await fs.readFile(new URL(`../server-plugin/${f}`,import.meta.url),'utf8');const at=text.split('\n').findIndex(l=>l.includes(`declareLedgerWriter('${w}'`));if(at>=0){writerFiles[w]=`server-plugin/${f}:${at+1}`;break;}}
 }

 const section=(t)=>Object.fromEntries(CAUSES.map(c=>[c,{incidents:t[c].incidents,meals:round(t[c].meals),households:t[c].households.size,people:t[c].people,reasons:t[c].reasons}]));
 const bySettlement=Object.fromEntries(sids.map(sid=>[sid,{...section(tally[sid]),named:{incidents:total[sid].named.incidents,meals:round(total[sid].named.meals)},statistical:{incidents:total[sid].statistical.incidents,meals:round(total[sid].statistical.meals)}}]));
 const attribution=Object.fromEntries(CAUSES.map(c=>{
  const rows=sids.map(sid=>tally[sid][c]),reasons={};
  for(const r of rows)for(const [k,n] of Object.entries(r.reasons))reasons[k]=(reasons[k]??0)+n;
  return [c,{incidents:rows.reduce((n,r)=>n+r.incidents,0),meals:round(rows.reduce((n,r)=>n+r.meals,0)),households:rows.reduce((n,r)=>n+r.households.size,0),people:rows.reduce((n,r)=>n+r.people,0),reasons}];
 }));
 const tot=(k)=>({incidents:sids.reduce((n,s)=>n+total[s][k].incidents,0),meals:round(sids.reduce((n,s)=>n+total[s][k].meals,0))});
 return {days,start:start.minute,end:end.minute,settlements:sids,
  totals:{named:tot('named'),statistical:tot('statistical')},
  attribution,bySettlement,daily,chainBreakFirst20:chainRows,chainBreakStatisticalSpread:chainSpread,rawGrainSample,producerStalls:{rows:stalls.length,first:stalls.slice(0,10),last:stalls.slice(-3)},
  conservation:{money:moneyRows,food:{rows:foodRows,total:foodTotal},ledger:{audit:auditLedger(ledger),drift:driftCounts(doc),transfers:ledger?.transfers??0},mismatches:{count:mismatches.length,first:mismatches.slice(0,20)},
   writerFlows:writerRows,writerFiles},
  incidentsSample:incidents.slice(0,40)};
}

if(import.meta.url===new URL(process.argv[1],'file:///').href||process.argv[1]?.endsWith('audit-food-causes.mjs')){
 const days=Number(process.argv[2]??30),out=process.argv[3],begin=performance.now();
 const result=await runAudit({days,progress:(j)=>process.stderr.write(`day ${j+1}/${days}\n`)});
 const text=JSON.stringify(result,null,2)+'\n';
 if(out){await fs.writeFile(out,text);console.log(JSON.stringify({out,elapsedMs:Math.round(performance.now()-begin),attribution:Object.fromEntries(Object.entries(result.attribution).map(([k,v])=>[k,{incidents:v.incidents,meals:v.meals,people:v.people}]))}));}
 else process.stdout.write(text);
}
