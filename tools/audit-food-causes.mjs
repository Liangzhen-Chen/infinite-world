// S5 closing audit (t-m3 port): attribute every missed meal of the town to harvest / poverty /
// allocation / chain-break from the world state of that noon, and reconcile coins and food against
// the ledger flows. Read-only: drives the real engine day by day, changes no rule and no save field.
// Output is deterministic (no clock values in it).
// Usage: node tools/audit-food-causes.mjs [days=30] [outFile]   (also runnable by the gate run-script)
//
// Definitions (docs/当前状态.md "S5 收尾清单" item 1), applied in this order:
//  harvest    - saleable food within a day's walk is less than the town's demand that day;
//  poverty    - household cash in hand (all members) is less than the price of the cheapest meal within reach;
//  allocation - food and cash exist, but the shelf was bought out first or the customer's own decision refused;
//  chain      - food on sale in own settlement / within a day, shop open, household can pay, still no meal.
// A roster-only household (no member with simulated state) has no purse in state: after the harvest test it is chain
// ("customer flow does not serve roster households"), flagged apart; a household with no known location is chain too ("no location").
// Reach is ONE-WAY: seller within rules.travel.dailyTravelMinutes on foot (engine.route); sellers reachable one way but not
// round trip are reviewed apart. There is no undetermined class. The producer-side clause of chain-break is actually checked
// (surplus > 0, road open, town buyer has coins, 7 consecutive days without a transport/trade record on the route).
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {isEffective} from '../server-plugin/lifecycle-state.mjs';
import {placeSettlement} from '../server-plugin/entity-view.mjs';
import {marketQuote,quoteSupply,saleableStock,customerReachMinutes} from '../server-plugin/market.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {bodyRule,mealMouthsOf} from '../server-plugin/primitives-body.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';
import {auditLedger,driftCounts,parseAccount} from '../server-plugin/ledger.mjs';

const DAY=1440,NOON=720,CAUSES=['harvest','poverty','allocation','chain'],ALL=CAUSES;
const sid='loc_bs';
const num=v=>typeof v==='number'?v:Number(v?.numerator??0)/Number(v?.denominator??1);
const reader=doc=>({document:doc,get:(...p)=>p.reduce((v,k)=>v?.[k],doc)});
const round=(n,k=2)=>Math.round(n*10**k)/10**k;

// file:line of the engine gate behind a verdict; found by text so it never goes stale unnoticed.
const lineCache=new Map();
async function srcLine(file,needle){
 const key=`${file}\u0000${needle}`;if(lineCache.has(key))return lineCache.get(key);
 const text=(await fs.readFile(new URL(`../server-plugin/${file}`,import.meta.url),'utf8')).split('\n');
 const at=text.findIndex(l=>l.includes(needle));
 const out=at<0?`${file}:?(${needle})`:`server-plugin/${file}:${at+1}`;lineCache.set(key,out);return out;
}

// Pure: satiety of everything edible on the given sellers' shelves (itemLists = [[{item,avail}]] per reachable seller).
export function supplySatiety(itemLists,gain){let n=0;for(const items of itemLists)for(const it of items)n+=it.avail*gain(it.item);return n;}

// Pure: demand of every household sharing at least one reachable seller with household `key` (itself always included, even with no seller).
export function demandSharing(list,key,ownDemand){
 const me=list.find(o=>o.key===key);let n=ownDemand;
 for(const o of list)if(o.key!==key&&me&&[...o.sellers].some(id=>me.sellers.has(id)))n+=o.demand;
 return n;
}

// Pure: facts of one missed meal from a plain snapshot.
// snap: {supply,demand,refCost,cash(null = no purse in state),declined,townShops:{total,open},
//        reach:[{shopId,sameSettlement,engineServes,toll,items:[{item,avail,units,cost,bought}]}]}
//  supply = null when the household has no known location (day's-walk reach cannot be computed).
//  declined = {outcome,reason} of a refused visit on goods this household could buy, or null.
//  cost = engine price of one meal (units of that item), null when the quote failed or was below 1 coin (the goods still count as stock); walkIn = some member is an adult with coins; noVisit = no customer_flow record of any member; bought = units already sold there that day.
export function buildFacts(snap){
 let best=null;
 for(const r of snap.reach??[])for(const it of r.items){
  if(it.cost===null||it.cost===undefined)continue;// unpriced goods stay in stock/sold-out tests, only the cheapest-price search skips them
  const cost=it.cost+(r.toll??0);
  if(!best||cost<best.cost||(cost===best.cost&&r.shopId<best.shopId))best={shopId:r.shopId,item:it.item,cost,sameSettlement:r.sameSettlement,engineServes:r.engineServes};
 }
 return {supply:snap.supply,demand:snap.demand,refCost:snap.refCost,cashKnown:snap.cash!==null&&snap.cash!==undefined,
  cash:snap.cash,unpriced:(snap.reach??[]).reduce((n,r)=>n+r.items.filter(it=>it.cost===null||it.cost===undefined).length,0),
  walkIn:snap.walkIn??true,noVisit:Boolean(snap.noVisit),
  best:best&&{cost:best.cost,sameSettlement:best.sameSettlement},
  // bought out = every edible item of every reachable seller is sold out or left below one meal (units); a cheaper-tier sell-out with other goods left is not.
  soldOut:Boolean(best&&(snap.reach??[]).every(r=>r.items.every(it=>it.avail-(it.bought??0)<(it.units??1)))),declined:snap.declined??null,
  servedShops:(snap.reach??[]).filter(r=>r.engineServes).length,townShops:snap.townShops??{total:0,open:0}};
}

// Pure: the verdict for one missed meal. Order is the card's. Clues are [file,needle,note] to be resolved to file:line.
export function verdict(f){
 if(f.supply===null)return {cause:'chain',flag:'noLocation',reason:'no location: the household has no known location, so no seller can be reached from it',clue:[['business.mjs','function walkIns(']]};
 if(f.supply<f.demand)return {cause:'harvest',reason:'saleable food within a day (shop shelves) is less than the demand of every household that shares its reachable sellers',clue:[['market.mjs','export function saleableStock']]};
 if(!f.cashKnown)return {cause:'chain',flag:'roster',reason:'customer flow does not serve roster households: no member has simulated state (no purse or stock in state), yet food is sellable within reach; the customer flow only walks in members of state.npcs',
  clue:[['business.mjs','function walkIns(']]};
 const need=f.best?.cost??f.refCost;
 if(f.cash<need)return {cause:'poverty',...(!f.best&&f.unpriced?{flag:'quoteFailedPoverty'}:{}),reason:`household cash is less than the price of the cheapest meal (one person-day of food)${f.best?' within reach':' (none on sale or no quote possible; catalogue price)'}`,clue:[['household-budget.mjs','export function householdBudget(']]};
 if(!f.best){
  const own=f.townShops;
  const unpriced=f.unpriced?` (${f.unpriced} edible goods on reachable shelves could not be quoted: quote failed or price below 1 coin)`:'';
  const why=unpriced?unpriced.trim():!own.total?'no food shop is registered in the own settlement':!own.open?'the own settlement\'s shop is not trading in it at noon (closed, or its keeper stands elsewhere)':'the own settlement\'s open shop has nothing edible on its shelf';
  const gate=!own.total?['shop.mjs','export function currentShops']:!own.open?['business.mjs','function openShops(']:['business.mjs','const shelfOf='];
  return {cause:'chain',reason:`food is sellable within a day and the household can pay, but nothing is on sale within reach: ${why}`,clue:[gate]};
 }
 if(f.soldOut)return {cause:'allocation',reason:'shelf was bought out before this household',clue:[['business.mjs','let quantity=Math.min(want.quantity,available),quote=null;']]};
 // npc-decision.mjs: one branch (cost>benefit || breach history) sets prepay N=max(1,ceil(cost-benefit)). N>=2 forces cost-benefit>1, i.e. cost>benefit: the price exceeds
 // the household's willingness, whichever condition fired. N=1 is reached both by a price just over willingness and by a breach prepay with cost<=benefit, and the visit
 // record keeps only the reason text, so N=1 stays chain, flagged and counted apart.
 if(f.declined?.outcome==='conditional'){
  const n=Number(/(\d+)/.exec(f.declined.reason??'')?.[1]);
  if(Number.isFinite(n)&&n>=2)return {cause:'allocation',reason:`customer decision refused on price: prepay ${n} > 1 means cost exceeds willingness (${f.declined.reason})`,clue:[['npc-decision.mjs',"outcome='conditional'"],['business.mjs',"if(decision.outcome!=='agree')"]]};
  return {cause:'chain',flag:'conditional',reason:`customer decision was conditional with prepay 1 (${f.declined.reason}); a price just over willingness and a breach-history prepay both give 1 and the visit record cannot tell them apart, so not counted as allocation`,clue:[['npc-decision.mjs',"outcome='conditional'"],['business.mjs',"if(decision.outcome!=='agree')"]]};
 }
 if(f.declined)return {cause:'chain',reason:`food, cash and shop were there but the customer decision was not a price refusal: outcome ${f.declined.outcome} (${f.declined.reason})`,clue:[['business.mjs',"if(decision.outcome!=='agree')"]]};
 if(!f.servedShops)return {cause:'chain',reason:f.best.sameSettlement?'shop open in own settlement but beyond customer reach':'food is on sale within a day, but no open shop in own settlement (residents only walk in to own-settlement shops)',clue:[['business.mjs','settlement!==shop.settlement']]};
 const note=f.unpriced?`; ${f.unpriced} edible goods could not be quoted (quote failed or price below 1 coin)`:'';
 if(!f.walkIn)return {cause:'chain',flag:'noWalkIn',reason:'no member is an adult with coins, so nobody walks in to the shop (business.mjs walkIns)'+note,clue:[['business.mjs','function walkIns(']]};
 if(f.noVisit)return {cause:'chain',flag:'noVisit',reason:'budget cap, did not go to the shop (business.mjs leaves no visit record when cap<1 or no affordable quote fits the budget; other no-record gates such as trip windows cannot be excluded from the record)'+note,clue:[['business.mjs','if(cap<1)break;'],['business.mjs','if(!quote)continue;']]};
 return {cause:'chain',reason:'open shop with stock in own settlement, money in hand, visited, no purchase happened'+note,clue:[['business.mjs','const want=wants(d,engine,id,item,gaps);']]};
}

// Pure: books reconciliation. start/end = {money:Map,stock:Map} (legacy fields as ledger account keys);
// ledger = document.ledger; edible = Set of food resource ids. Differences must all be 0.
export function reconcileBooks({start,end,ledger,edible}){
 const byRes=map=>{const out={};for(const [k,n] of map){const r=parseAccount(k).resource;out[r]=(out[r]??0)+n;}return out;};
 const flowsBy=res=>{const out={sources:{},sinks:{},genesis:0};for(const [k,n] of Object.entries(ledger?.flows??{})){const a=parseAccount(k);if(a.resource!==res)continue;
  if(k.startsWith('src:genesis|'))out.genesis+=n;else if(a.owner.startsWith('src:'))out.sources[`${a.owner}|${a.purpose}`]=n;else out.sinks[`${a.owner}|${a.purpose}`]=n;}return out;};
 const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
 const startM=byRes(start.money),endM=byRes(end.money),startS=byRes(start.stock),endS=byRes(end.stock);
 const money={};
 for(const res of Object.keys({...startM,...endM}).filter(r=>r.startsWith('coin_')).sort()){
  const f=flowsBy(res),late=f.genesis-(startM[res]??0),delta=(endM[res]??0)-(startM[res]??0),net=sum(f.sources)+late-sum(f.sinks);
  money[res]={start:startM[res]??0,end:endM[res]??0,delta,sources:sum(f.sources),lateGenesis:late,sinks:sum(f.sinks),flowNet:net,difference:delta-net,
   ledgerEnd:Object.entries(ledger?.accounts??{}).filter(([k])=>parseAccount(k).resource===res).reduce((n,[,v])=>n+v,0),
   topSources:Object.entries(f.sources).sort((a,b)=>b[1]-a[1]).slice(0,8),topSinks:Object.entries(f.sinks).sort((a,b)=>b[1]-a[1]).slice(0,8)};
 }
 const rows={};
 for(const res of [...edible].sort()){
  const f=flowsBy(res),late=f.genesis-(startS[res]??0),delta=(endS[res]??0)-(startS[res]??0),net=sum(f.sources)+late-sum(f.sinks);
  if(!delta&&!net&&!(startS[res]))continue;
  rows[res]={start:startS[res]??0,end:endS[res]??0,delta,lateGenesis:late,sources:f.sources,sinks:f.sinks,difference:delta-net};
 }
 const total={start:0,end:0,delta:0,lateGenesis:0,in:{},out:{},difference:0};
 for(const row of Object.values(rows)){
  total.start+=row.start;total.end+=row.end;total.delta+=row.delta;total.lateGenesis+=row.lateGenesis;total.difference+=row.difference;
  for(const [k,n] of Object.entries(row.sources))total.in[k]=(total.in[k]??0)+n;
  for(const [k,n] of Object.entries(row.sinks))total.out[k]=(total.out[k]??0)+n;
 }
 total.in=Object.fromEntries(Object.entries(total.in).sort());total.out=Object.fromEntries(Object.entries(total.out).sort());
 // Accounts on which the legacy fields and the ledger disagree at the end.
 const expected=new Map([...end.money,...end.stock]),accounts=ledger?.accounts??{},mismatches=[];
 for(const k of new Set([...expected.keys(),...Object.keys(accounts)])){const a=expected.get(k)??0,b=accounts[k]??0;if(a!==b)mismatches.push({account:k,legacy:a,ledger:b});}
 mismatches.sort((a,b)=>a.account<b.account?-1:1);
 return {money,food:{rows,total},mismatches:{count:mismatches.length,first:mismatches.slice(0,20)}};
}

export async function runAudit({days=30,progress=()=>{}}={}){
 const world=await loadWorld(),e=new WorldEngine(world);
 const legacy=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
 let doc=e.createCharacter(legacy,{},'TFB-30-day');
 const grain=e.rules.agriculture?.grainItem,seed=doc.randomSeed;
 const baseMeal=bodyRule(e,'satiety').drainPerHour.light*24,reach=customerReachMinutes(e),dayTrip=e.rules.travel.dailyTravelMinutes;
 const homeOf=new Map((world.households??[]).map(h=>[h.id,h.homeLocation]));
 const gain=item=>e.byId.get(item)?.nutrition?.satiety??0;
 const refCost=Math.min(...world.items.filter(i=>gain(i.id)>0&&i.basePrice>0).map(i=>Math.ceil(baseMeal/gain(i.id))*i.basePrice));
 const start={minute:doc.state.minute,money:legacyMoney(e,doc.state),stock:legacyStock(e,doc.state).balances};
 const advance=async(to,id)=>{const out=await e.reduce(doc,{tool:'world_time',args:{minutes:to-doc.state.minute},eventId:id});doc=applyPatches(doc,out.patches);};

 const routeSeen=new Set(),idleDays=new Map(),producerStalls=[];
 const daily=[],tally={},incidents=[],chainRows=[];
 for(const c of ALL)tally[c]={incidents:0,meals:0,people:0,households:new Set(),reasons:{}};
 const townOnly={incidents:0,meals:0,keys:new Set()},flagSplit={};
 const oneWayInvolved={incidents:0,meals:0,keys:new Set()},oneWayChanged={incidents:0,meals:0,keys:new Set(),changes:{}};
 const condSplit={incidents:0,meals:0,keys:new Set()};
 const total={named:{incidents:0,meals:0},roster:{incidents:0,meals:0}};
 const prevUnmet=new Map();
 const routeMemo=new Map();
 const route=(from,to,minute)=>{
  const key=`${from}|${to}|${Math.floor(minute/DAY)}`;
  if(!routeMemo.has(key)){try{const r=e.route(from,to,'walk',minute,seed);routeMemo.set(key,{minutes:r.minutes,cost:r.cost??0});}catch{routeMemo.set(key,null);}}
  return routeMemo.get(key);
 };

 for(const rec of Object.values(doc.state.records??{}))if(rec?.id&&(rec.category==='settlement_trade'||rec.category==='transport'))routeSeen.add(rec.id);
 for(let j=0;j<days;j++){
  const noon=Math.floor(doc.state.minute/DAY)*DAY+NOON;
  await advance(noon-1,`audit:pre:${j}`);
  const P=doc,rd=reader(P),ps=P.state,day=Math.floor(noon/DAY);

  // ---- shops open at noon and their edible shelf (same open test as business.openShops for native shops) ----
  const slots=new Map();
  const slotOf=id=>{if(!slots.has(id))slots.set(id,scheduleAt(e,id,noon,ps)??null);return slots.get(id);};
  const openKeeper=keeper=>{
   const n=ps.npcs?.[keeper],slot=n&&slotOf(keeper);
   return Boolean(n&&isEffective(e,ps,keeper)&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&slot?.services?.includes('trade')&&!n.scheduleTravel&&!n.cognitionTravel);
  };
  const shopRows=[];
  for(const shop of currentShops(e,ps)){
   const open=openKeeper(shop.keeper),slot=slotOf(shop.keeper),location=open?slot.location:shop.location;
   const items=[];
   if(open)for(const item of [...new Set(shop.restock.map(r=>r.item))]){
    const avail=saleableStock(rd,e,shop.keeper,item,{business:true}).available;
    if(avail>0&&gain(item)>0)items.push({item,avail});
   }
   shopRows.push({id:shop.id,keeper:shop.keeper,markup:shop.markup??1,registered:shop.settlement,settlement:open?placeSettlement(e,ps,location).value:shop.settlement,location,open,items});
  }
  // Non-shop sellers: open NPC business records not already listed as a registered shop (business.openShops sells their carried goods).
  for(const rec of Object.values(ps.records??{})){
   if(rec?.category!=='business'||rec.owner==='player'||rec.suspended||rec.status!=='营业'||(rec.openedAt??Infinity)>noon)continue;
   if(shopRows.some(s=>s.keeper===rec.owner&&s.location===rec.location))continue;
   const slot=slotOf(rec.owner),open=openKeeper(rec.owner)&&slot.location===rec.location&&ps.buildings?.[rec.location]?.owner===rec.owner&&(ps.buildings?.[rec.location]?.condition??1)>0&&!ps.buildings?.[rec.location]?.burning;
   const items=[];
   if(open)for(const item of Object.keys(ps.npcs[rec.owner].inventory??{}).sort()){
    const avail=saleableStock(rd,e,rec.owner,item,{business:true}).available;
    if(avail>0&&gain(item)>0)items.push({item,avail});
   }
   shopRows.push({id:rec.id??rec.owner,keeper:rec.owner,markup:rec.markup??1,registered:null,settlement:open?placeSettlement(e,ps,rec.location).value:null,location:rec.location,open,items,nonShop:true});
  }
  const townShopRows=shopRows.filter(s=>s.registered===sid);
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
  // Granary surplus beyond the winter reserve: sold only to the player or the army in t-m3, so it is reported, not counted as saleable.
  const producers=[];
  for(const p of e.rules.agriculture?.settlements??[]){
   const rec=ps.records?.[`agriculture:${p.settlement}`],s=ps.settlements?.[p.settlement];
   if(rec?.mode!=='managed'||!s)continue;
   const stock=rec.batches.filter(b=>b.kind==='grain').reduce((n,b)=>n+b.amount,0);
   producers.push({settlement:p.settlement,counter:p.counter,surplus:round(Math.max(0,stock-mealMouthsOf(e,ps,p.settlement,s.population)*p.reserveDays))});
  }

  // ---- run the rest of the day (noon customers, afternoon, midnight meal) ----
  await advance((day+1)*DAY+540,`audit:post:${j}`);
  const E=doc,es=E.state;

  // ---- today's town meal records: one per household or lone resident registered to the town ----
  const entities=Object.entries(es.family?.meals??{}).filter(([,m])=>m.settlement===sid).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,m])=>{
   const members=m.members??[],simulated=members.filter(id=>ps.npcs?.[id]);
   const owner=simulated[0]??null;
   const location=owner?(slotOf(owner)?.location??ps.npcs[owner].location):(homeOf.get(m.household)??null);
   return {key,meal:m,members,owner,location,demand:num(m.needs?.satiety),
    cash:owner?simulated.reduce((n,id)=>n+(ps.npcs[id].coins??0),0):null};
  });
  let townDemand=0;for(const en of entities)townDemand+=en.demand;
  const reachable=location=>{
   const out=[];
   if(location)for(const shop of shopRows){
    if(!shop.open||!shop.items.length)continue;
    const a=location===shop.location?{minutes:0,cost:0}:route(location,shop.location,noon),b=location===shop.location?{minutes:0,cost:0}:route(shop.location,location,noon);
    if(!a||a.minutes>dayTrip)continue;// one way, rules travel.dailyTravelMinutes
    out.push({shop,roundTrip:Boolean(b&&a.minutes+b.minutes<=dayTrip),toll:a.cost+(b?.cost??0),sameSettlement:shop.settlement===sid,engineServes:shop.settlement===sid&&a.minutes<=reach});
   }
   return out;
  };
  // The town's saleable supply: edible stock of every open seller (shops and non-shop traders) within a day's one-way walk (rules travel.dailyTravelMinutes, engine.route on foot) of the first resident whose home is known; without a known home, every open seller.
  const reachMemo=new Map(),reachOf=location=>{if(!reachMemo.has(location))reachMemo.set(location,reachable(location));return reachMemo.get(location);};
  const sellerIdsRT=new Map(entities.filter(en=>en.location).map(en=>[en.key,new Set(reachOf(en.location).filter(r=>r.roundTrip).map(r=>r.shop.id))]));
  const sellerIds=new Map(entities.filter(en=>en.location).map(en=>[en.key,new Set(reachOf(en.location).map(r=>r.shop.id))]));
  // demand of every household sharing at least one reachable seller with this one (itself always included)
  const localDemandOf=(en,ids)=>demandSharing(entities.filter(o=>ids.has(o.key)).map(o=>({key:o.key,demand:o.demand,sellers:ids.get(o.key)})),en.key,en.demand);
  const supplyOf=reachRows=>supplySatiety(reachRows.map(r=>r.shop.items),gain);
  let shelfSatiety=0;for(const r of shopRows)for(const it of r.items)shelfSatiety+=it.avail*gain(it.item);// all open sellers, for the daily row only

  const visitsOf=shopId=>es.records?.[`customer_flow:${shopId}:${day}`]?.visits??[];
  const boughtAt=(shop,item)=>visitsOf(shop).filter(v=>v.outcome==='bought'&&v.item===item).reduce((n,v)=>n+v.quantity,0);

  // ---- missed meals of this day ----
  const missed=[];
  for(const en of entities){
   const before=prevUnmet.get(en.key)??0,now=en.meal.unmetMealDays??0;prevUnmet.set(en.key,now);
   const meals=num(en.meal.missingMeals);
   if(meals>0&&now>before)missed.push({en,meals,people:en.members.length});
  }
  for(const {en,meals,people} of missed){
   const kind=en.owner?'named':'roster';
   total[kind].incidents++;total[kind].meals+=meals;
   const evaluate=(reach1,ids)=>{
   const supply=en.location?supplyOf(reach1):null;// anchored on this household's own location
   // price of one person-day of each edible item on every reachable shelf, through the engine quote
   const reachRows=reach1.map(r=>({shopId:r.shop.id,sameSettlement:r.sameSettlement,engineServes:r.engineServes,toll:r.toll,
    items:r.shop.items.flatMap(it=>{const units=Math.max(1,Math.ceil(baseMeal/gain(it.item))),price=en.owner?unitPrice(r.shop,it.item,units,en.owner):null;
     return [{item:it.item,avail:it.avail,units,cost:price===null||price<1?null:price,bought:boughtAt(r.shop.id,it.item)}];})})).filter(r=>r.items.length);
   // a refusal counts only on goods this household could buy: an item priced on that same reachable shelf
   const buyable=new Map(reachRows.filter(r=>r.engineServes).map(r=>[r.shopId,new Set(r.items.filter(i=>i.cost!==null).map(i=>i.item))]));
   const declined=[...buyable.keys()].flatMap(id=>visitsOf(id).filter(v=>buyable.get(id).has(v.item))).find(v=>en.members.includes(v.npc)&&v.outcome!=='bought');
   const localDemand=localDemandOf(en,ids);
   const adult=id=>(e.byId.get(id)?.age??e.rules.npcLife.adultAge)>=e.rules.npcLife.adultAge;
   const walkIn=en.members.some(id=>ps.npcs?.[id]&&adult(id)&&(ps.npcs[id].coins??0)>=1);
   const noVisit=!reachRows.filter(r=>r.engineServes).some(r=>visitsOf(r.shopId).some(v=>en.members.includes(v.npc)));
   const facts=buildFacts({supply,demand:localDemand,walkIn,noVisit,refCost,cash:en.cash,declined:declined&&{outcome:declined.outcome,reason:declined.reason??declined.outcome},
    townShops:{total:townShopRows.length,open:townShopRows.filter(s=>s.open&&s.settlement===sid).length},reach:reachRows});
   return {facts,supply,localDemand,v:verdict(facts)};
   };
   const reachAll=en.location?reachOf(en.location):[];
   const {facts,supply,localDemand,v}=evaluate(reachAll,sellerIds),cause=v.cause;
   // review: sellers reachable one way but not round trip; does dropping them change the verdict?
   if(reachAll.some(r=>!r.roundTrip)){oneWayInvolved.incidents++;oneWayInvolved.meals+=meals;oneWayInvolved.keys.add(en.key);
    const alt=evaluate(reachAll.filter(r=>r.roundTrip),sellerIdsRT).v.cause;
    if(alt!==cause){oneWayChanged.incidents++;oneWayChanged.meals+=meals;oneWayChanged.keys.add(en.key);oneWayChanged.changes[`${alt}->${cause}`]=(oneWayChanged.changes[`${alt}->${cause}`]??0)+1;}}
   // review list: harvest would have been judged on the whole-town demand but is not on the local one
   if(supply!==null&&supply<townDemand&&supply>=localDemand){townOnly.incidents++;townOnly.meals+=meals;townOnly.keys.add(en.key);}
   if(v.flag&&v.flag!=='conditional'){const u=(flagSplit[v.flag]??={incidents:0,meals:0,keys:new Set()});u.incidents++;u.meals+=meals;u.keys.add(en.key);}
   const clue=(await Promise.all(v.clue.map(([f,n])=>srcLine(f,n)))).join('; ');
   const t=tally[cause];t.incidents++;t.meals+=meals;t.reasons[v.reason]=(t.reasons[v.reason]??0)+1;
   if(v.flag==='conditional'){condSplit.incidents++;condSplit.meals+=meals;condSplit.keys.add(en.key);}
   if(!t.households.has(en.key)){t.households.add(en.key);t.people+=people;}
   const row={household:en.key,day,kind,location:en.location,cash:en.cash===null?null:round(en.cash),missingMeals:round(meals),reason:v.reason,clue,
    supplySatiety:supply===null?null:round(supply),townDemandSatiety:round(townDemand),cheapestPersonDay:facts.best?{coins:facts.best.cost}:null};
   if(cause==='chain'&&chainRows.length<20)chainRows.push(row);
   if(incidents.length<400)incidents.push({day,household:en.key,cause,meals:round(meals),reason:v.reason});
  }
  // ---- producer side: surplus > 0, road open to the town, a buyer with coins in town, and no transport/trade record on the route ----
  // Route records: settlement_trade rows (seller = producer settlement, buyer = the town, one of its shops or their keepers) and transport rows from the producer
  // settlement to the town, counted by first appearance of their id.
  const townBuyers=new Set([sid,...townShopRows.map(r=>r.id),...townShopRows.map(r=>r.keeper)]);
  const buyerCash=entities.reduce((n,en)=>n+(en.cash??0),0)+townShopRows.reduce((n,r)=>n+(es.npcs?.[r.keeper]?.coins??0),0);
  const placeOf=loc=>{try{return placeSettlement(e,es,loc).value;}catch{return null;}};
  const seenNow=new Map(producers.map(p=>[p.settlement,0]));
  for(const rec of Object.values(es.records??{})){
   if(!rec||(rec.category!=='settlement_trade'&&rec.category!=='transport')||!rec.id)continue;
   const to=rec.category==='settlement_trade'?(townBuyers.has(rec.buyer)?sid:null):placeOf(rec.to),from=rec.category==='settlement_trade'?rec.seller:placeOf(rec.from);
   if(to!==sid||!seenNow.has(from)||routeSeen.has(rec.id))continue;
   routeSeen.add(rec.id);seenNow.set(from,seenNow.get(from)+1);
  }
  const stalledToday=[];
  for(const pr of producers){
   const toTown=route(pr.counter,sid,noon),back=route(sid,pr.counter,noon),roadOpen=Boolean(toTown&&back);
   const can=pr.surplus>0&&roadOpen&&buyerCash>0,idle=can&&seenNow.get(pr.settlement)===0?(idleDays.get(pr.settlement)??0)+1:0;
   idleDays.set(pr.settlement,idle);
   pr.roadOpen=roadOpen;pr.idleDays=idle;
   if(idle>=7){producerStalls.push({day,producer:pr.settlement,town:sid,idleDays:idle,surplus:pr.surplus,buyerCash:round(buyerCash)});stalledToday.push(pr.settlement);}
  }
  daily.push({day,townDemand:round(townDemand),shelfSatiety:round(shelfSatiety),missedNamed:round(missed.filter(m=>m.en.owner).reduce((n,m)=>n+m.meals,0)),missedRoster:round(missed.filter(m=>!m.en.owner).reduce((n,m)=>n+m.meals,0)),granarySurplusNotCounted:producers});
  progress(j,doc.state.minute);
 }

 // ---- conservation ----
 const end={minute:doc.state.minute,money:legacyMoney(e,doc.state),stock:legacyStock(e,doc.state).balances};
 const edible=new Set(world.items.filter(i=>i.nutrition?.satiety>0).map(i=>i.id));
 for(let grew=true;grew;){grew=false;for(const r of world.recipes)if(edible.has(r.output.item))for(const m of r.materials)if(!edible.has(m.item)){edible.add(m.item);grew=true;}}
 const books=reconcileBooks({start,end,ledger:doc.ledger,edible});

 const attribution={};
 const producerRoute={stalledPairs:[...new Set(producerStalls.map(r=>`${r.producer}->${r.town}`))].sort().length,stalledRows:producerStalls.length};
 for(const c of ALL)attribution[c]={incidents:tally[c].incidents,meals:round(tally[c].meals),households:tally[c].households.size,people:tally[c].people,reasons:tally[c].reasons,...(c==='chain'?{producerRoute}:{})};
 return {days,start:start.minute,end:end.minute,grainItem:grain??null,
  totals:{named:{incidents:total.named.incidents,meals:round(total.named.meals)},statistical:{incidents:total.roster.incidents,meals:round(total.roster.meals),note:'roster-only households (no member in state.npcs)'}},
  harvestOnTownDemandOnly:{households:townOnly.keys.size,incidents:townOnly.incidents,meals:round(townOnly.meals),note:'supply covers the demand of households sharing the same sellers but not the whole town; classified by the other causes, listed for review'},
  chainSubflags:Object.fromEntries(Object.entries(flagSplit).map(([k,u])=>[k,{households:u.keys.size,incidents:u.incidents,meals:round(u.meals)}])),
  conditionalNotDistinguished:{households:condSplit.keys.size,incidents:condSplit.incidents,meals:round(condSplit.meals),note:'prepay 1 only; counted in chain. prepay >=2 is price refusal (allocation)'},
  oneWayOnlySellers:{involved:{households:oneWayInvolved.keys.size,incidents:oneWayInvolved.incidents,meals:round(oneWayInvolved.meals)},verdictChanged:{households:oneWayChanged.keys.size,incidents:oneWayChanged.incidents,meals:round(oneWayChanged.meals),changes:oneWayChanged.changes},note:'events whose reach includes a seller reachable one way but not round trip, and the subset whose cause differs when such sellers are dropped; for review'},
  attribution,daily,chainBreakFirst20:chainRows,
  producerChainBreak:{rule:'surplus > 0 (granary grain minus the settlement\'s own meal reserve), road open both ways (engine.route), a buyer with coins in town, and 7 consecutive days with no new settlement_trade or transport record from the producer to the town',
   surplusSource:await srcLine('agriculture.mjs','const surplus=r.batches.filter'),routeSources:[await srcLine('settlement-trade.mjs',"category:'settlement_trade'"),await srcLine('transport.mjs',"category:'transport'")],
   stalledRows:producerStalls.length,stalledPairs:[...new Set(producerStalls.map(r=>`${r.producer}->${r.town}`))].sort(),first:producerStalls.slice(0,10),last:producerStalls.slice(-3)},
  conservation:{money:books.money,food:books.food,ledger:{audit:auditLedger(doc.ledger),drift:driftCounts(doc),transfers:doc.ledger?.transfers??0},mismatches:books.mismatches},
  incidentsSample:incidents.slice(0,40)};
}

if(process.argv[1]?.endsWith('audit-food-causes.mjs')){
 const days=Number(process.argv[2]??30),out=process.argv[3],begin=performance.now();
 const result=await runAudit({days,progress:j=>process.stderr.write(`day ${j+1}/${days}\n`)});
 const text=JSON.stringify(result,null,2)+'\n';
 if(out){await fs.writeFile(out,text);console.log(JSON.stringify({out,elapsedMs:Math.round(performance.now()-begin),attribution:Object.fromEntries(Object.entries(result.attribution).map(([k,v])=>[k,{incidents:v.incidents,meals:v.meals,people:v.people}]))}));}
 else process.stdout.write(text);
}
