import {vocabulary} from './domain-rules.mjs';
import {toRational,fromRational} from './det-math.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {purse,treasury as treasuryAccount,moveCoins,coinRead,sink,dedicatedCoinAccount,counterCash,depositCounter,booksOpen,mirrorPartyCoins} from './money.mjs';
import {collectTransport} from './transport.mjs';
import {transferItems} from './items.mjs';
import {obligationTransaction} from './transition.mjs';
import {advanceCustomerFlow} from './business.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {employmentActive} from './employment-state.mjs';
import {householdResources,householdBudget,householdOptions,registerHouseholdFoodSources} from './household-budget.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {settlementStock,priceRead,bagStock} from './stock.mjs';
// S1b 补货：本地产出与外路到货来自模拟范围外（src:import，按货价付给来源聚落公账）；聚落库存补货从聚落库存转入店主行囊。
declareLedgerWriter('shop',{sources:{'src:import':{'*':100000}},sinks:['sink:export']});
import {isReputationSettlement}from'./reputation-registry.mjs';
import {standing} from './standing.mjs';
import {marketFactor}from'./promotion.mjs';
import {personBusinesses,personHousehold,personSimulation,placeSettlement,settlementPopulationCount} from './entity-view.mjs';
import {actorPath} from './npc-state.mjs';
import {regionalTradeBase} from './settlement-trade.mjs';
const worldEvent=(state,key)=>{const id=key?.replace(/^world_event:/,'');const row=state.records?.[`world_event:${id}`];return row?.category==='world_event'&&row.id===id?row:null;};
import {digest,recordsWhere,stateMemo,PatchCursor,persistable} from './storage.mjs';
import {derivedBankAt,derivedBankById} from './finance-bank.mjs';
import {facilityRuntime,installFacilityRuntime} from './facility-state.mjs';
import {marketQuote,subjectiveMarketQuote,quoteSupply,recordMarketDeal,goodsClass,registerShopShelves,customerReachMinutes,saleableStock} from './market.mjs';
import {assessTradeTax,taxableSale} from './finance-tax.mjs';
import {recordFinanceSale} from './finance-assets.mjs';
import {currencyRow,currencyTradePrice} from './currency.mjs';
import {tenderQuote} from './tender.mjs';
export {assertMarketDepth,marketQuote,marketExplanation} from './market.mjs';

const agreedKey=id=>`agreed_quote:${id}`;
function quoteSource(state,row){
 const source=worldEvent(state,row.sourceEvent),p=source?.payload;
 return source?.verb==='quoted'&&source.actor===row.actor&&source.minute===row.at&&(row.service==='remittance'
  ?p.subject==='remittance'&&p.principal===row.principal&&p.fee===row.fee
  :p.to===row.to&&p.resource===row.resource&&p.quantity===row.quantity&&p.totalCoins===row.totalCoins);
}
export function recordAgreedQuote(d,engine,row,{actor=row.actor}={}){
 const state=d.get('state');
 if(actor!==row.actor||!state.npcs?.[actor]||row.to!=='player'||typeof row.id!=='string'||!row.id||d.get('state','records',agreedKey(row.id))||!integer(row.at)||row.at>state.minute||!integer(row.expires)||row.expires<=row.at||!quoteSource(state,row))throw Error('Invalid agreed quote actor, source or validity');
 if(row.service==='remittance'){
  const bank=derivedBankAt(engine,state,state.npcs[actor].location),branch=derivedBankById(engine,state,row.destinationBranch);
  if(!integer(row.principal,1)||!integer(row.fee)||!state.npcs?.[row.recipient]||!engine.byId.has(row.destination)||row.recipientIdentityVerified!==true||!bank?.keepers.includes(actor)||!branch||branch.id===bank.id||!bankWithin(engine,branch.location,row.destination))throw Error('Invalid remittance terms or real redeeming branch');
 }else if(!integer(row.quantity,1)||!integer(row.totalCoins)||!['sell_to_player','buy_from_player'].includes(row.direction)||!engine.world.items.some(i=>i.id===row.resource)&&row.resource!==vocabulary(engine,'lodging','agreedResource'))throw Error('Invalid agreed quantity, total or direction');
 const value={...persistable(row),category:'agreed_quote'};
 d.set(['state','records',agreedKey(row.id)],value);
 d.set(['state','records',`${agreedKey(row.id)}:source`],{category:'agreed_quote_receipt',digest:digest(value)});
 return value;
}
export function agreedQuotes(state){
 return recordsWhere(state?.records,'category','agreed_quote').filter(row=>state.records[`${agreedKey(row.id)}:source`]?.digest===digest(row)&&quoteSource(state,row));
}
export function currentAgreedQuotes(state){return agreedQuotes(state).filter(r=>r.at<=state.minute&&state.minute<r.expires&&!state.records[`${agreedKey(r.id)}:used`]);}
installFacilityRuntime({currentAgreedQuotes});
export function agreedTradeQuote(state,{buyer,seller,item,quantity}){
 const direction=buyer==='player'?'sell_to_player':'buy_from_player',actor=buyer==='player'?seller:buyer;
 const matches=agreedQuotes(state).filter(r=>!r.service&&r.actor===actor&&r.direction===direction&&r.resource===item&&r.quantity===quantity&&r.at<=state.minute&&state.minute<r.expires&&!state.records[`${agreedKey(r.id)}:used`]);
 if(matches.length>1)throw Error('Ambiguous agreed quote');
 return matches[0]??null;
}
export function consumeAgreedQuote(d,row,eventId){
 if(!row)return;
 const key=`${agreedKey(row.id)}:used`;
 if(d.get('state','records',key))throw Error('Agreed quote already consumed');
 d.set(['state','records',key],{category:'agreed_quote_used',quote:row.id,sourceEvent:eventId,minute:d.get('state','minute')});
}
function bankWithin(engine,location,target){
 const seen=new Set();for(let at=location;at&&!seen.has(at);at=engine.byId.get(at)?.parent){if(at===target)return true;seen.add(at);}return false;
}
export function resolveRedeemingBranch(engine,state,destination){
 const candidates=engine.world.locations.filter(l=>bankWithin(engine,l.id,destination)).map(l=>derivedBankAt(engine,state,l.id)).filter(Boolean);
 const unique=[...new Map(candidates.map(b=>[b.id,b])).values()];
 if(unique.length!==1)throw Error('No unique real redeeming branch at the requested destination');
 return unique[0];
}
// The ordinary issuer still owns identity, closures, vault accounting and bill
// obligations. Pass the validated fee to that issuer so the quote replaces
// the native fee in the same single payment, including when the fee is zero.
export async function executeAgreedRemittance(d,engine,args,eventId,issue){
 const state=d.get('state'),actor=engine.resolve(args.seller),recipient=args.buyer?engine.resolve(args.buyer,'npc'):null;
 const rows=agreedQuotes(state).filter(r=>r.service==='remittance'&&r.actor===actor&&r.to==='player'&&r.at<=state.minute&&state.minute<r.expires&&!state.records[`${agreedKey(r.id)}:used`]&&r.principal===args.coins&&r.recipient===recipient);
 if(rows.length>1)throw Error('Ambiguous agreed remittance quote');
 const quote=rows[0];if(!quote)return issue(args);
 const bank=derivedBankAt(engine,state,state.location),branch=derivedBankById(engine,state,quote.destinationBranch),destination=engine.resolve(args.location);
 if(!bank?.keepers.includes(actor)||!branch||!bankWithin(engine,branch.location,quote.destination)||destination!==quote.destination&&destination!==branch.location&&destination!==branch.id)throw Error('Agreed remittance branch or keeper mismatch');
 if(state.player.coins<quote.principal+quote.fee)throw Error('Insufficient funds for the agreed remittance total');
 const result=await issue({...args,location:branch.location},{remittanceFee:quote.fee});
 const key=['state','records',result.contract],bill=d.get(...key);
 if(bill?.category!=='bank_bill'||bill.destination!==branch.id)throw Error('Native issuer did not create the agreed bill');
 d.set(key,{...bill,fee:quote.fee,agreedQuote:quote.id});consumeAgreedQuote(d,quote,eventId);
 return {...result,fee:quote.fee,quote:quote.id};
}

// Shops (guide 3.7, 3.13): each registered shop restocks on its own cycle from
// local production, the settlement's own stock, or trade-route arrivals, never
// beyond its stock ceiling; high qualities restock only where the settlement
// scale or the shop's channel allows them. Player quotes add the shop markup and
// the keeper's and settlement's regard for the player, fixed for the day.
const DAY=1440,SOURCES=['local','settlement','route'],LEDGER_ROWS=40;
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const clamp=(v,[a,b])=>Math.max(a,Math.min(b,v));
export const shopRules=engine=>engine.rules.economy?.shops??null;
// Later stock additions have their own source row; keep the reviewed store
// catalogue intact, and use the combined shelves for quotes and replenishment.
const registeredStores=rules=>(rules.stores??[]).map(store=>{
    const additions=rules.additionalRestock?.[store.id];if(!additions)return store;
    const restock=[...store.restock];
    for(const {after,...row} of additions){
        const index=after===undefined?restock.length:restock.findIndex(r=>r.item===after)+1;
        restock.splice(index,0,row);
    }
    return {...store,restock};
});

const catalogs=new WeakMap();
function catalog(world,rules){
    let byRules=catalogs.get(world.locations);if(!byRules)catalogs.set(world.locations,byRules=new WeakMap());
    let value=rules&&byRules.get(rules);
    if(!value||value.items!==world.items||value.profiles!==world.settlementProfiles){
        value={items:world.items,profiles:world.settlementProfiles,places:new Set([...(world.settlementProfiles??[]).map(p=>p.id),...(rules?.quality?.capitals??[])]),
            locations:new Map(world.locations.map(l=>[l.id,l])),itemById:new Map(world.items.map(i=>[i.id,i])),origins:new Map()};
        if(rules)byRules.set(rules,value);
    }
    return value;
}
function settlementIds(world,rules){return catalog(world,rules).places;}
const held=(npc,item)=>{const v=npc?.inventory?.[item];return typeof v==='number'?v:v?.quantity??0;};
const trades=npc=>(npc.services??[]).includes('trade')||(npc.serviceCatalog??[]).some(s=>s?.kind==='trade');
// Derived shops: a person who offers trade (services or serviceCatalog) and whose
// `shopType` names a type in rules.economy.shops.types becomes a shop with that
// type's channels, markup and cycle. Its settlement is found by walking up from
// the person's settlement, workplace, home or location; its restock is the
// person's `shopRestock` rows, or else each held item produced locally and
// admitted by quality, restocked locally by half the shelf (at least 1) up to
// what the person holds now. Hand-registered stores always win for their keeper.
export function derivedShops(world,rules=world.rules.economy?.shops){
    const types=rules?.types??{},keepers=new Set((rules?.stores??[]).map(s=>s.keeper));
    if(!rules||!Object.keys(types).length)return[];
    const places=settlementIds(world,rules),byId=catalog(world,rules).locations,rows=[];
    const settle=npc=>{for(let at of [npc.settlement,npc.workplace?.location,npc.home?.location??npc.home,npc.location]){const seen=new Set();
        while(typeof at==='string'&&!seen.has(at)){if(places.has(at))return at;seen.add(at);at=byId.get(at)?.parent;}}return null;};
    for(const npc of world.npcs){
        if(typeof npc.shopType!=='string'||keepers.has(npc.id))continue;
        const type=Object.hasOwn(types,npc.shopType)?types[npc.shopType]:null,settlement=settle(npc);
        const shop={id:`shop_${npc.id.replace(/^npc_/,'')}`,name:byId.get(npc.workplace?.location)?.name??npc.occupation??npc.name,keeper:npc.id,settlement,
            channels:[...type?.channels??[]],markup:type?.markup,cycleDays:type?.cycleDays,firstDay:type?.firstDay,shopType:npc.shopType,derived:true,trades:trades(npc),restock:[]};
        shop.restock=Array.isArray(npc.shopRestock)?structuredClone(npc.shopRestock):type&&settlement?Object.keys(npc.inventory??{}).filter(item=>held(npc,item)>0&&world.items.some(i=>i.id===item)
            &&originSettlement(world,item,rules)===settlement&&qualityAllowed(world,shop,item,rules)).sort().map(item=>({item,source:'local',amount:Math.max(1,Math.ceil(held(npc,item)/2)),maximum:held(npc,item)})):[];
        rows.push(shop);
    }
    return rows;
}
// Every shop that restocks and quotes: hand-registered stores, then derived ones.
export function shopStores(world){
    const rules=world.rules.economy?.shops;if(!rules)return[];
    return [...registeredStores(rules),...derivedShops(world,rules).filter(s=>s.trades&&s.restock.length)];
}
// 某聚落全部商铺的货架条目（登记的店 + 按人物派生的店），按世界定义缓存；市场需求读它（market.mjs 的 F026）。
const shelfIndex=new WeakMap();
registerShopShelves((engine,place)=>{
    const rules=engine.rules.economy?.shops;if(!rules)return null;
    let index=shelfIndex.get(rules);
    if(!index||index.npcs!==engine.world.npcs){
        const rows=new Map();
        for(const store of shopStores(engine.world))rows.set(store.settlement,[...rows.get(store.settlement)??[],...(store.restock??[])]);
        shelfIndex.set(rules,index={npcs:engine.world.npcs,rows});
    }
    return index.rows.get(place)??[];
});
const currentShopsMemo=Symbol('current shops');
export function currentShops(engine,state){
    return stateMemo(state,engine,[currentShopsMemo],()=>readCurrentShops(engine,state));
}
function readCurrentShops(engine,state){
    const rules=shopRules(engine);if(!rules)return[];
    // One legal index for the whole pass; people who can never be open are skipped (entity-view.mjs personBusinesses).
    const businesses=personBusinesses(engine,state,(rules.stores??[]).map(s=>s.keeper));
    const projected=[...businesses].map(([id,b])=>b?{...engine.byId.get(id),shopType:b.shopType.value,settlement:b.settlement.value,workplace:{location:b.location.value},services:b.open.value?['trade']:[],serviceCatalog:[]}:null).filter(Boolean);
    const stores=[...registeredStores(rules),...derivedShops({...engine.world,npcs:projected},rules).filter(s=>s.trades&&s.restock.length)],used=new Set(),out=[];
    for(const store of stores){
        let business=businesses.get(store.keeper);
        const original=engine.byId.get(store.keeper),location=original?.workplace?.location??original?.location;
        // An existing trader taking up the former workplace succeeds its keeper.
        if(!business?.open.value)business=[...businesses.values()].find(b=>b?.open.value&&b.location.value===location&&(b.shopType.value===(store.shopType??original?.shopType)||store.channels.includes(b.shopType.value)));
        if(!business?.open.value||used.has(business.keeper.value))continue;
        const keeper=business.keeper.value,settlement=business.settlement.value??store.settlement,type=business.shopType.value;
        if(!settlement)continue;
        const changedType=type&&type!==(store.shopType??original?.shopType)&&!store.channels.includes(type),template=changedType?rules.types?.[type]:null;
        if(changedType&&!template)continue;
        const shop={...store,...template,keeper,settlement,location:business.location.value,shopType:type,channels:template?.channels??store.channels};
        // The keeper's own repricing (restockShop) stands in place of the type's standard markup while it is on record.
        const pricing=state.records?.[`shop_pricing:${keeper}`];
        if(pricing?.category==='shop_pricing'&&pricing.shop===shop.id){shop.baseMarkup=shop.markup;shop.markup=typeof pricing.markup==='number'?pricing.markup:fromRational(pricing.markup);}
        const rows=engine.byId.get(keeper)?.shopRestock??store.restock;
        const population=settlementPopulationCount(engine,state,settlement).value;
        shop.restock=rows.map(row=>{
            if(row.source==='settlement')return {...row};
            const from=originSettlement(engine.world,row.item,rules);
            return from?{...row,source:from===settlement?'local':'route',...(from!==settlement?{from}:{})}:row;
        }).filter(row=>qualityAllowed(engine.world,shop,row.item,rules,population));
        used.add(keeper);out.push(shop);
    }
    return out;
}
export const shopOfKeeper=(engine,keeper,state=null)=>(state?currentShops(engine,state):shopStores(engine.world)).find(s=>s.keeper===keeper)??null;
// Household planning uses a conservative local quote, not a recursive quote
// over the very reserves it is deciding. Maximum scarcity and price impact
// bound the native retail formula; execution always obtains a fresh quote.
const householdSourceReads=new WeakMap();
function nextFoodService(engine,state,shop,minute){
 for(let at=minute;at<minute+31*DAY;){
  const slot=facilityRuntime().scheduleAt?.(engine,shop.keeper,at,state);
  // A keeper without any authored schedule keeps the legacy always-open service.
  if(!slot)return at===minute?{minute:at,location:shop.location}:null;
  if(slot.location===shop.location&&slot.services?.includes('trade'))return {minute:at,location:slot.location};
  at=slot.until;
 }
 return null;
}
registerHouseholdFoodSources((d,engine,owner,{view}={})=>{
 const state=d.get('state'),now=state.minute,location=view?.self.location??(owner==='player'?state.location:state.npcs?.[owner]?.location),place=placeSettlement(engine,state,location).value;
 const members=personHousehold(engine,state,owner).value?.members??[owner];
 // Only cursor revisions are cacheable; plain read adapters may expose a
 // mutable test/import document and deliberately take the uncached path.
 const cursor=d.cursor instanceof PatchCursor&&d.document===d.cursor.root?d.cursor:null;
 let read=cursor?householdSourceReads.get(cursor):null;
 if(!read||read.revision!==cursor?.revision||read.engine!==engine){
  read={revision:cursor?.revision,engine,shops:currentShops(engine,state),physical:new Map()};
  if(cursor)householdSourceReads.set(cursor,read);
 }
 const out=[];
 for(const shop of read.shops){
  if(shop.settlement!==place||shop.keeper!==owner&&members.includes(shop.keeper)||view&&shop.keeper!==owner)continue;
  let travel=0;
  if(location!==shop.location){try{travel=engine.route(location,shop.location,'walk',now,d.document.randomSeed).minutes;}catch{continue;}}
  if(!Number.isFinite(travel)||travel>customerReachMinutes(engine))continue;
  // Buying from another keeper needs their trading hours. One's own restock
  // reaches the shelf on the delivery cycle regardless of one's own hours.
  const opening=shop.keeper===owner?{minute:now+travel,location:shop.location}:nextFoodService(engine,state,shop,now+travel);
  if(!opening||opening.location!==shop.location)continue;
  const ledger=state.records?.[`shop:${shop.id}`];
  let physical=null;
  for(const row of shop.restock){
   if(!(engine.byId.get(row.item)?.nutrition?.satiety>0))continue;
   const own=shop.keeper===owner;
   if(!own){
    physical??=read.physical.get(shop.keeper);
    if(!physical){physical=householdResources(d,engine,shop.keeper,{marketSubstitution:false});read.physical.set(shop.keeper,physical);}
    const stock=physical.rows.find(r=>r.holder===shop.keeper&&r.item===row.item)?.available??0;
    if(!stock)continue;
    const at=Math.max(opening.minute,now+travel);
    const base=regionalTradeBase(d,engine,row.item,shop.settlement,now);
    const quote=marketQuote(d,engine,{item:row.item,location:shop.location,seller:shop.keeper,buyer:owner,business:shop,base,relation:engine.rules.economy.priceFactorLimits.relation[1],supply:{place:shop.settlement,goods:goodsClass(engine,row.item),supply:0,demand:1}});
    out.push({source:shop.id,seller:shop.keeper,item:row.item,at,quantity:stock,unitPrice:Math.max(1,Math.ceil(quote.listPrice*(1+engine.world.marketRules.depthImpact))),priceBasis:'local-retail-ceiling'});
    continue;
   }
   // Own shelves cannot be bought from oneself. Only the next paid upstream
   // delivery, with its actual cycle and source, can replace retained meals.
   const last=ledger?.entries?.filter(e=>e.item===row.item).at(-1);
   if(last&&last.added===0&&last.reason)continue;
   let day=Math.max(Math.floor(now/DAY)+1,shop.firstDay);
   day+=((shop.cycleDays-(day-shop.firstDay)%shop.cycleDays)%shop.cycleDays);
   const at=day*DAY;
   if(row.source==='route'){
    try{engine.route(row.from,shop.settlement,'walk',at,d.document.randomSeed);}catch{continue;}
   }
   let quantity=Math.min(row.amount,row.maximum);
   if(row.source==='settlement'){
    if(view||row.stock==='food'&&managed(d,shop.settlement))continue;
    quantity=Math.min(quantity,Math.max(0,priceRead(d,{point:'shop.supply',account:settlementStock(engine,shop.settlement,row.stock),legacy:()=>state.settlements?.[shop.settlement]?.[row.stock]??0})-(row.reserve??0)));
   }
   // An observed complete upstream bill includes freight and duties. With no
   // such bill, only local production has a known bounded delivery price.
   if(row.source==='route'&&!last?.added)continue;
   const base=view?engine.byId.get(row.item).basePrice:regionalTradeBase(d,engine,row.item,shop.settlement,now);
   const args={item:row.item,location:shop.location,seller:shop.settlement,buyer:owner,business:{keeper:shop.settlement,markup:1},base,supply:{place:shop.settlement,goods:goodsClass(engine,row.item),supply:0,demand:1}};
   const quote=view?subjectiveMarketQuote(engine,d.document,view,args):marketQuote(d,engine,args);
   const unitPrice=Math.max(1,Math.ceil(quote.listPrice*(1+engine.world.marketRules.depthImpact)),last?.added?Math.ceil(last.paidCopper/last.added):0);
   // Repeating a route would require a new route check; repeating a public
   // stock purchase would count the same finite upstream goods twice. Only
   // the domain's regular local-production channel repeats in this forecast.
   out.push({source:shop.id,seller:shop.settlement,item:row.item,at,cycleDays:row.source==='local'?shop.cycleDays:null,quantity,unitPrice,priceBasis:last?.added?'observed-upstream-ceiling':'local-upstream-ceiling'});
  }
 }
 // A subjective planner may use a received, still-valid offer, not another
 // family's current bag or money. A mere belief or catalogue prior is no offer.
 if(view)for(const fact of Object.values(view.knowledge.facts)){
  const q=fact.value;
  if(fact.kind==='belief'||!q||!Number.isSafeInteger(q.quantity)||q.quantity<=0||!(q.unitPrice>0)||!Number.isFinite(q.at)||!Number.isFinite(q.expires)||q.at>q.expires||q.expires<now||members.includes(q.seller))continue;
  const shop=shopStores(engine.world).find(s=>s.keeper===q.seller&&s.settlement===place&&s.restock.some(r=>r.item===q.item));
  if(!shop||!(engine.byId.get(q.item)?.nutrition?.satiety>0))continue;
  // The received offer carries its pickup window; do not query the seller's
  // private current schedule, stock or status to silently correct that offer.
  const pickup=q.location??shop.location??engine.byId.get(shop.keeper)?.workplace?.location??engine.byId.get(shop.keeper)?.location;
  let travel=0;
  if(location!==pickup){try{travel=engine.route(location,pickup,'walk',now,d.document.randomSeed).minutes;}catch{continue;}}
  const at=Math.max(now+travel,q.at);
  if(!Number.isFinite(travel)||travel>customerReachMinutes(engine)||at>q.expires)continue;
  out.push({source:fact.source??shop.id,seller:q.seller,item:q.item,at,quantity:q.quantity,unitPrice:q.unitPrice,priceBasis:'received-offer',expires:q.expires});
 }
 return out;
});
// The settlement an item is produced in: walk its origin up the location tree.
export function originSettlement(world,item,rules=world.rules.economy?.shops){
    const c=catalog(world,rules);if(c.origins.has(item))return c.origins.get(item);
    const ids=c.places,byId=c.locations,seen=new Set();
    let at=c.itemById.get(item)?.origin??null,result=null;
    while(at&&!seen.has(at)){if(ids.has(at)){result=at;break;}seen.add(at);at=byId.get(at)?.parent??null;}
    c.origins.set(item,result);return result;
}
export function settlementScale(world,settlement,rules=world.rules.economy?.shops,population=null){
    if(rules.quality.capitals.includes(settlement))return 'capital';
    const people=population??world.settlementProfiles?.find(p=>p.id===settlement)?.population??0;
    return [...rules.quality.scales].sort((a,b)=>b.minPopulation-a.minPopulation).find(s=>people>=s.minPopulation)?.scale??null;
}
// Up to `open` any shop may stock it; above that a tier must admit the shop by
// settlement scale or by one of its channel tags.
export function qualityAllowed(world,shop,item,rules=world.rules.economy?.shops,population=null){
    const order=world.rules.equipment.qualities,quality=catalog(world,rules).itemById.get(item)?.quality,grade=order.indexOf(quality);
    if(grade<0)return false;if(grade<=order.indexOf(rules.quality.open))return true;
    const tier=rules.quality.tiers.find(t=>t.quality===quality);if(!tier)return false;
    return tier.scales.includes(settlementScale(world,shop.settlement,rules,population))||shop.channels.some(c=>tier.channels.includes(c));
}

// stock=true (world build) also checks each ceiling covers the keeper's published stock.
export function validateShopRules(world,{stock=true}={}){
    const r=world.rules.economy?.shops;if(!r)return[];
    const errors=[],ids=new Set(),keepers=new Set(),order=world.rules.equipment?.qualities??[],places=settlementIds(world,r);
    const npc=id=>world.npcs.find(n=>n.id===id),item=id=>world.items.find(i=>i.id===id);
    const [shopLow,shopHigh]=world.rules.economy.priceFactorLimits.shop;
    if(r.version!==1||!r.source||!(r.relation?.keeper>=0)||!(r.relation?.settlement>=0)||r.relation.keeper+r.relation.settlement!==1||!(r.relation.span>0)||!Array.isArray(r.stores))errors.push('商店规则版本、来源或关系权重无效');
    const q=r.quality;
    if(!q||!order.includes(q.open)||!Array.isArray(q.scales)||!q.scales.some(s=>s.minPopulation===0)||!Array.isArray(q.capitals)||!Array.isArray(q.tiers)||q.tiers.some(t=>order.indexOf(t.quality)<=order.indexOf(q.open)||!Array.isArray(t.scales)||!Array.isArray(t.channels)))errors.push('商店品质渠道规则无效');
    for(const [stock,id]of Object.entries(r.stockItems??{}))if(!['wood','stone','iron','food'].includes(stock)||!item(id))errors.push(`聚落库存货品无效：${stock}`);
    for(const [name,t]of Object.entries(r.types??{}))
        if(!Array.isArray(t?.channels)||!t.channels.length||!(t.markup>=shopLow&&t.markup<=shopHigh)||!integer(t.cycleDays,1)||!integer(t.firstDay))errors.push(`店铺类型${name}无效`);
    if(errors.length)return errors;
    for(const [id,rows] of Object.entries(r.additionalRestock??{})){
        const store=r.stores.find(s=>s.id===id);
        if(!store||!Array.isArray(rows)||rows.some(row=>row.after!==undefined&&!store.restock.some(r=>r.item===row.after)))errors.push(`商店增补货架无效：${id}`);
    }
    if(errors.length)return errors;
    const derived=derivedShops(world,r);
    for(const s of derived){
        if(!Object.hasOwn(r.types??{},s.shopType))errors.push(`人物${s.keeper}的店铺类型${s.shopType}未登记`);
        else if(!s.trades)errors.push(`人物${s.keeper}登记了店铺类型却没有交易服务`);
    }
    if(errors.length)return errors;
    for(const s of [...registeredStores(r),...derived]){
        const keeper=npc(s.keeper),bad=m=>errors.push(`商店${s.id??'?'}：${m}`);
        if(!s.id||ids.has(s.id))bad('编号缺失或重复');ids.add(s.id);
        if(!keeper||keepers.has(s.keeper))bad('店主缺失或重复登记');keepers.add(s.keeper);
        if(!places.has(s.settlement))bad('所在聚落未登记');
        if(!Array.isArray(s.channels)||!s.channels.length)bad('缺渠道标签');
        if(!(s.markup>=shopLow&&s.markup<=shopHigh))bad('店家加成超出价格系数上下限');
        if(!integer(s.cycleDays,1)||!integer(s.firstDay))bad('补货周期无效');
        if(!Array.isArray(s.restock)||!s.restock.length){bad('缺补货规则');continue;}
        const seen=new Set();
        for(const row of s.restock){
            const it=item(row.item),shelf=keeper?.inventory?.[row.item],held=typeof shelf==='number'?shelf:shelf?.quantity??0;
            if(!it||seen.has(row.item)||!SOURCES.includes(row.source)||!integer(row.amount,1)||!integer(row.maximum,1)||stock&&row.maximum<held){bad(`补货条目无效：${row.item}`);continue;}
            seen.add(row.item);
            if(!qualityAllowed(world,s,row.item,r))bad(`${row.item}品质${it.quality}不在本聚落规模或渠道出现`);
            const origin=originSettlement(world,row.item,r);
            if(row.source==='local'&&origin!==s.settlement)bad(`${row.item}产地不在本地`);
            if(row.source==='route'&&(!places.has(row.from)||row.from===s.settlement||origin!==row.from))bad(`${row.item}到货来源与产地不符`);
            if(row.source==='settlement'&&(r.stockItems?.[row.stock]!==row.item||!integer(row.reserve)))bad(`${row.item}未对应聚落库存或缺保留量`);
        }
    }
    return errors;
}
const checked=new WeakSet();
function assertRules(engine){
    if(checked.has(engine.world))return;
    const errors=validateShopRules(engine.world,{stock:false});if(errors.length)throw Error(errors.join('；'));checked.add(engine.world);
}

const shelf=(engine,d,id,item)=>bagStock(d,engine,{point:'shop.shelf',id,item,legacy:()=>engine.quantity(d,id,item)});
function managed(d,sid){return d.get('state','records',`agriculture:${sid}`)?.mode==='managed';}
// ---- 营运柜台（15 §15.1.1）：人物店主的进货款与雇工工钱出自本店柜台，柜台由店主自己决定从钱袋注资 ----
// 店主的决定都经 npcDecision，取其醒着的上午十点（午夜结算时他在睡觉）的主观视图。
function keeperView(d,engine,keeper,minute){
    const s=d.get('state'),n=s.npcs[keeper],day=Math.floor(minute/DAY)*DAY;
    return subjectiveView(engine,{...d.document,state:{...s,minute:day+600,npcs:{...s.npcs,[keeper]:{...n,activity:'日常起居',status:n.status??'正常'}}}},keeper);
}
const keeperChoice=(d,engine,shop,minute,ctx,request)=>{ctx.view??=keeperView(d,engine,shop.keeper,minute);return npcDecision(ctx.view,{from:shop.settlement,...request});};
// The keeper tops the counter up toward `target` from his own purse if, and only if, he decides to.
export function fundCounter(d,engine,{shop,minute,target,eventId,ctx={}}){
    const n=d.get('state','npcs',shop.keeper);if(!n||!booksOpen(d))return {deposited:0,reason:'店主不是名册人物或账本未开'};
    const have=counterCash(d,shop.keeper),cash=coinRead(d,{point:'shop.cash',account:purse(engine,shop.keeper),legacy:()=>n.coins}),amount=Math.min(Math.max(0,target-have),cash);
    if(amount<1)return {deposited:0};
    const decision=keeperChoice(d,engine,shop,minute,ctx,{kind:'fund_counter',cost:{coins:amount},reward:amount});
    if(decision.outcome!=='agree')return {deposited:0,decision};
    depositCounter(d,engine,{owner:shop.keeper,seat:shop.location??shop.settlement,business:shop.id,amount,eventId,writer:'shop'});
    return {deposited:amount,decision};
}
// One restock row at one boundary. Returns the ledger entry, or null when the
// shelf was already full (nothing to record).
function receivedRouteStock(d,engine,shop,row,minute,want,ctx,{receiveOnly=false}={}){
    const entry={day:Math.floor(minute/DAY),minute,item:row.item,source:'route',wanted:want,added:0,paidCopper:0,shipments:[]};
    // K12 owns movement and loss. A date, quoted freight, or an ETA never
    // credits the shelf. Collection requires the real recipient at arrival.
    for(const trip of recordsWhere(d.get('state','records'),'category','transport')){
        if(trip.recipient!==shop.keeper||trip.to!==shop.location||trip.status!=='arrived'||(trip.arrivedAt??Infinity)>minute||!trip.cargo.some(c=>c.item===row.item))continue;
        if(d.get('state','npcs',shop.keeper,'location')!==trip.to)continue;
        const received=collectTransport(d,engine,trip.id,shop.keeper);
        entry.added+=received.deliveredCargo.filter(c=>c.item===row.item).reduce((n,c)=>n+c.quantity,0);entry.shipments.push(trip.id);
    }
    if(entry.added)return {...entry,reason:'实际到站提货；货款和运费沿原交易与运单结算'};
    if(receiveOnly||want<=0)return null;
    // All rows of one counter share the same observation until a real write.
    // The cursor revision invalidates it after a purchase or shipment receipt.
    const revision=d.cursor?.revision;
    if(!ctx.onSite||!Number.isSafeInteger(revision)||ctx.viewRevision!==revision||!ctx.view){
        ctx.view=ctx.onSite?subjectiveView(engine,d.document,shop.keeper):keeperView(d,engine,shop.keeper,minute);
        ctx.viewRevision=revision;
    }
    const view=ctx.view;
    // A received offer is not omniscient access to distant inventory. This
    // consumer can buy only after its holder has actually brought it here.
    const offers=Object.values(view.knowledge.facts).filter(f=>f.kind!=='belief').map(f=>{
        const price=f.value?.unitPrice,rate=typeof price==='number'?toRational(price):price;
        return {offer:f.value,source:f.source,rate,unitPrice:rate?fromRational(rate):NaN};
    }).filter(({offer:q,unitPrice})=>q?.item===row.item&&q.seller!==shop.keeper&&Number.isSafeInteger(q.quantity)&&q.quantity>0&&Number.isFinite(unitPrice)&&unitPrice>=0&&q.at<=minute&&q.expires>=minute&&q.location===shop.location);
    for(const {offer:q,source,rate}of offers){
        const state=d.get('state'),seller=state.npcs?.[q.seller];
        if(!seller||seller.location!==shop.location||!isEffective(engine,state,q.seller)||!view.observable.people.some(p=>p.id===q.seller))continue;
        const offerKey=`shop-offer:${shop.id}:${q.seller}:${row.item}:${source}`,used=d.get('state','records',offerKey)?.quantity??0;
        const maximum=Math.floor(Math.min(want,q.quantity-used,saleableStock(d,engine,q.seller,row.item).available));
        if(maximum<=0)continue;
        const bill=n=>Number(BigInt(rate.numerator)*BigInt(n)/BigInt(rate.denominator));
        const budget=householdBudget(d,engine,shop.keeper,{view});
        const cap=counterCash(d,shop.keeper)+Math.max(0,Math.min(budget.cash,...budget.timeline.map(r=>r.balance)));
        let low=0,high=maximum;while(low<high){const mid=Math.ceil((low+high)/2);if(bill(mid)<=cap)low=mid;else high=mid-1;}
        const quantity=low,cost=bill(quantity);
        // Counter capital is already assigned to the business; only the extra
        // purse funding competes with the household's reserved cash.
        if(!quantity||!householdOptions(budget,{item:row.item,quantity,totalCoins:Math.max(0,cost-counterCash(d,shop.keeper))}).find(o=>o.operation==='buy').feasible)continue;
        const sale=subjectiveMarketQuote(engine,d.document,view,{item:row.item,seller:shop.keeper,quantity,business:shop});
        // The on-site offer is the landed bill, including any freight/storage
        // its holder passes on. Existing household/land/shop rent remains in
        // the cash budget; it is not a new marginal cost of this particular lot.
        const revenue=sale.totalCoins,net=revenue-cost;
        const tradingView=v=>({...v,self:{...v.self,obligations:v.self.obligations.filter(o=>o.resource!=='coin_river'||o.start!==undefined||o.terms?.service)}});
        const verdict=npcDecision(tradingView(view),{kind:'restock',from:q.seller,cost:{value:cost},reward:revenue});
        const sellerView=subjectiveView(engine,d.document,q.seller),consent=npcDecision(tradingView(sellerView),{kind:'sell',from:shop.keeper,cost:{value:cost},reward:cost});
        if(verdict.outcome!=='agree'||consent.outcome!=='agree')return {...entry,reason:'持货人与店主未同时同意',decision:verdict.outcome,sellerDecision:consent.outcome,expectedNet:net};
        const eventId=`shop:${shop.id}:${minute}:${row.item}:offer`;
        const referenceCopper=Math.round(regionalTradeBase(d,engine,row.item,shop.settlement,minute)*quantity);
        const funded=cost>counterCash(d,shop.keeper)?fundCounter(d,engine,{shop,minute,target:cost,eventId:`${eventId}:fund`,ctx}):null;
        if(funded&&counterCash(d,shop.keeper)<cost)return {...entry,reason:'店主不愿或不能向柜台注资',decision:funded.decision?.outcome};
        obligationTransaction(d,()=>{
            transferItems(d,engine,q.seller,shop.keeper,row.item,quantity,null,{disposition:true,eventId});
            const counter=dedicatedCoinAccount(d.get('state'),shop.keeper,'counter')?.account,payer=counter??purse(engine,shop.keeper);
            moveCoins(d,{from:payer,to:purse(engine,q.seller),amount:cost,writer:'shop',eventId});
            // Without a counter account the keeper's own purse pays, and its mirrored coins move too.
            if(!counter)mirrorPartyCoins(d,engine,shop.keeper,-cost,eventId,'shop');
            mirrorPartyCoins(d,engine,q.seller,cost,eventId,'shop');
            const quote=marketQuote(d,engine,{item:row.item,location:shop.location,seller:q.seller,buyer:shop.keeper,quantity});
            recordMarketDeal(d,quote,cost,quantity,eventId);
            const tax=taxableSale(engine,d.get('state'),q.seller,row.item)?assessTradeTax(d,engine,{seller:q.seller,cost,location:shop.location,sourceEvent:eventId}).amount:0;
            recordFinanceSale(d,engine,{buyer:shop.keeper,seller:q.seller,item:row.item,quantity,cost,tax,eventId});
            d.set(['state','records',offerKey],{category:'shop_offer_used',offer:source,seller:q.seller,buyer:shop.keeper,item:row.item,quantity:used+quantity,sourceEvent:eventId});
        });
        return {...entry,added:quantity,paidCopper:cost,referenceCopper,from:q.seller,offer:source,expectedNet:net,cost:{goods:cost,freight:0,duties:0},reason:'持货人已到场并按本人收到的报价成交'};
    }
    return {...entry,reason:'没有已到场的持货人或可领取运单；集日不生成现货'};
}
function restockRow(d,engine,shop,row,minute,ctx={}){
    // U13: a promoted settlement holds a market; restock amount and ceiling scale with it.
    const market=marketFactor(engine,d.get('state'),shop.settlement),want=Math.min(row.amount*market,row.maximum*market-shelf(engine,d,shop.keeper,row.item));
    if(row.source==='route')return receivedRouteStock(d,engine,shop,row,minute,Math.max(0,want),ctx);
    if(want<=0)return null;
    const from=shop.settlement;
    // Supply and base are read once per call site below; they do not change between the quotes of one binary search.
    let supplyMemo=null,baseMemo=null;
    const quote=quantity=>{
        const business={keeper:from,markup:1};
        supplyMemo??=quoteSupply(d,engine,{item:row.item,location:shop.settlement,business});
        baseMemo??=regionalTradeBase(d,engine,row.item,shop.settlement,minute);
        return marketQuote(d,engine,{item:row.item,location:shop.settlement,minute,seller:from,buyer:shop.keeper,quantity,business,base:baseMemo,supply:supplyMemo});
    };
    // Cross-settlement supply is handled above through real holders and K12 deliveries.
    // 回执写明来源（origin）和费用构成。聚落库存补货是真实上游，从聚落库存转入。
    const imported=row.source!=='settlement';
    const entry={day:Math.floor(minute/DAY),minute,item:row.item,source:row.source,wanted:want,added:0,paidCopper:0,
        origin:imported?{kind:'import',from,reason:'本地产出（模拟范围外）'}:{kind:'settlement_stock',from}};
    // A person keeper lays out stock money (goods, freight, duties) from the counter, funding it from his purse as needed; a creature keeper pays from his own coins.
    const keeperPath=actorPath(engine.world,shop.keeper),keeper=d.get(...keeperPath),person=Boolean(d.get('state','npcs',shop.keeper))&&booksOpen(d),afford=n=>{
        const own=coinRead(d,{point:'shop.cash',account:purse(engine,shop.keeper),legacy:()=>keeper.coins});
        const budget=person?householdBudget(d,engine,shop.keeper,{view:ctx.view=keeperView(d,engine,shop.keeper,minute)}):null;
        const disposable=budget?Math.max(0,Math.min(own,...budget.timeline.map(r=>r.balance))):own,cash=person?disposable+counterCash(d,shop.keeper):own;
        let low=0,high=Math.floor(n);while(low<high){const mid=Math.ceil((low+high)/2);if(quote(mid).totalCoins<=cash)low=mid;else high=mid-1;}return low;
    };
    let books={flow:'src:import',purpose:row.source==='local'?'local_supply':'route_supply',writer:'shop',eventId:`shop:${shop.id}:${minute}`};
    const s=structuredClone(d.get('state','settlements',from));
    // 本地产出的卖方是本聚落的产户：聚落有公账时货款进公账；聚落还没有公账记录时（尚未展开的小镇）货款付给模拟范围外的产户（sink:export），
    // Cross-settlement supply is handled above through real holders and K12 deliveries.
    const outside=!s&&row.source==='local';
    if(!outside&&(!s||!integer(s.treasury)))return{...entry,reason:'来源聚落不在战役账中'};
    if(row.source==='settlement'&&row.stock==='food'&&managed(d,from))return{...entry,reason:'托管聚落粮仓只走周贸易账'};
    const spare=row.source==='settlement'?Math.max(0,priceRead(d,{point:'shop.supply',account:settlementStock(engine,from,row.stock),legacy:()=>s[row.stock]??0})-row.reserve):want,quantity=afford(Math.min(want,spare));
    if(!quantity)return{...entry,reason:spare?'店主现钱不足':'聚落库存已到保留量'};
    const purchase=quote(quantity),cost=purchase.totalCoins,total=cost;
    let payer=purse(engine,shop.keeper);
    if(person){
        // The buy is the keeper's own decision (cost-plus: everything he lays out, haul included, is passed on at his markup); stock that cannot sell back above its cost is not bought.
        const verdict=keeperChoice(d,engine,shop,minute,ctx,{kind:'restock',cost:{value:total},reward:Math.ceil(total*shop.markup)});
        if(verdict.outcome!=='agree')return{...entry,reason:`店主决定暂不进货：${verdict.reason}`,decision:verdict.outcome};
        const funded=total>counterCash(d,shop.keeper)?fundCounter(d,engine,{shop,minute,target:total,eventId:`${books.eventId}:fund:${row.item}`,ctx}):null;
        if(funded&&counterCash(d,shop.keeper)<total)return{...entry,reason:'店主不愿或不能向柜台注资',decision:funded.decision?.outcome};
        // A zero-cost lot needs no counter: none may be open yet, and nothing moves.
        payer=dedicatedCoinAccount(d.get('state'),shop.keeper,'counter')?.account??payer;
    }
    const pay=(to,amount,part)=>moveCoins(d,{from:payer,to,amount,writer:'shop',eventId:person?`${books.eventId}:${row.item}:${part}`:null});
    if(row.source==='settlement'){s[row.stock]-=quantity;books={account:settlementStock(engine,from,row.stock),writer:'shop',eventId:books.eventId};}
    if(outside)pay(sink('export','local_supply'),cost,'goods');
    else{pay(treasuryAccount(from),cost,'goods');s.treasury+=cost;d.set(['state','settlements',from],s);}
    const paid=cost;
    if(!person)d.set([...keeperPath,'coins'],keeper.coins-paid);
    entry.added=quantity;entry.paidCopper=paid;entry.from=from;entry.cost={goods:cost,freight:0,duties:0};
    entry.referenceCopper=Math.round(regionalTradeBase(d,engine,row.item,shop.settlement,minute)*quantity);
    // Cross-settlement supply is handled above through real holders and K12 deliveries.
    if(row.source!=='local')recordMarketDeal(d,purchase,cost,quantity,`restock:${shop.id}:${row.item}:${minute}`);
    engine.itemDelta(d,shop.keeper,row.item,entry.added,books);
    return entry;
}
// Cost-plus: a keeper who pays more (or less) than the reference price for what he stocks passes it on, keeping his type's margin.
// The reference is the regional base price of the same goods, so the ratio is the extra the buy carried (scarcity, haul).
// 改价回执含倍率与决策依据；数值持久化复用世界价格的整数分子/分母，读取仍兼容旧数字。
const pricingRecord=value=>typeof value==='number'?(Number.isInteger(value)?value:toRational(value)):
    Array.isArray(value)?value.map(pricingRecord):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,pricingRecord(v)])):value;
function repriceShop(d,engine,shop,minute,entries,ctx){
    const paid=entries.reduce((n,e)=>n+(e.paidCopper??0),0),reference=entries.reduce((n,e)=>n+(e.referenceCopper??0),0);
    if(!paid||!reference||!d.get('state','npcs',shop.keeper))return;
    const [low,high]=engine.rules.economy.priceFactorLimits.shop,standard=shop.baseMarkup??shop.markup;
    const markup=Math.min(high,Math.max(low,Math.round(standard*paid/reference*100)/100));
    if(markup===shop.markup)return;
    const decision=keeperChoice(d,engine,shop,minute,ctx,{kind:'reprice',cost:{},reward:Math.abs(markup-shop.markup)});
    if(decision.outcome!=='agree')return;
    d.set(['state','records',`shop_pricing:${shop.keeper}`],pricingRecord({category:'shop_pricing',shop:shop.id,keeper:shop.keeper,markup,previous:shop.markup,standard,minute,
        sourceEvent:`shop:${shop.id}:${minute}`,basis:{paidCopper:paid,referenceCopper:reference},decision:{outcome:decision.outcome,trace:decision.trace}}));
}
function restockShop(d,engine,shop,minute,{receiveOnly=false,onSite=false}={}){
    const keeper=d.get('state','npcs',shop.keeper)??d.get('state','creatures',shop.keeper);
    if(!isEffective(engine,d,shop.keeper)||!keeper||['濒死'].includes(keeper.status))return;
    const ctx={onSite},entries=shop.restock.map(row=>{
        if(!receiveOnly)return restockRow(d,engine,shop,row,minute,ctx);
        if(row.source!=='route')return null;
        if(onSite)return restockRow(d,engine,shop,row,minute,ctx);
        return receivedRouteStock(d,engine,shop,row,minute,0,ctx,{receiveOnly:true});
    }).filter(entry=>entry&&(!onSite||entry.added>0));
    // The wages of the hands he already employs are backed from the counter for the days until his next cycle.
    if(!receiveOnly&&d.get('state','npcs',shop.keeper)){
        const bill=recordsWhere(d.get('state','records'),'kind','workshop').filter(r=>r.laborMarket===1&&r.owner===shop.keeper&&employmentActive(r)).reduce((n,r)=>n+r.wage,0);
        if(bill)fundCounter(d,engine,{shop,minute,target:bill*Math.min(7,shop.cycleDays),eventId:`shop:${shop.id}:${minute}:wages`,ctx});
    }
    if(!receiveOnly||onSite)repriceShop(d,engine,shop,minute,entries,ctx);
    if(!entries.length)return;
    const key=`shop:${shop.id}`,old=d.get('state','records',key);
    if(old&&old.category!=='shop_ledger')throw Error('商店账编号冲突，拒绝覆盖');
    d.set(['state','records',key],{category:'shop_ledger',shop:shop.id,keeper:shop.keeper,settlement:shop.settlement,lastRestockAt:minute,entries:[...old?.entries??[],...entries].slice(-LEDGER_ROWS)});
}
// Registered with the advance registry. Restock happens at the midnight that opens
// a cycle day; each boundary inside (before,after] is settled once, in order.
export function advanceShops(d,engine,before,after){
    // At noon a physically present recipient may collect already-arrived K12
    // goods or buy a known on-site lot before serving customers. Neither a
    // cycle date nor a quoted distant shipment creates physical stock.
    if(Math.floor((before-720)/DAY)<Math.floor((after-720)/DAY)){
        const minute=Math.floor((after-720)/DAY)*DAY+720;
        for(const shop of currentShops(engine,d.get('state')))restockShop(d,engine,shop,minute,{receiveOnly:true,onSite:true});
    }
    // Consumers settle at noon; dated restocking remains at midnight.
    advanceCustomerFlow(d,engine,before,after);
    const stores=currentShops(engine,d.get('state'));if(!stores.length)return;
    assertRules(engine);
    for(let day=Math.floor(before/DAY)+1;day<=Math.floor(after/DAY);day++)
        for(const shop of stores)restockShop(d,engine,shop,day*DAY,{receiveOnly:day<shop.firstDay||(day-shop.firstDay)%shop.cycleDays!==0});
}
// Force a clock boundary before afternoon receipts or deliveries can enter
// the noon consumer budget. Restocking keeps its own midnight boundary.
export function nextShopMinute(engine,d,now){
    const state=d.get('state'),consumers=Object.keys(state.npcs??{}).some(id=>personSimulation(engine,{},id).value);
    const deliveries=recordsWhere(state.records,'category','transport').filter(r=>r.status==='arrived'&&state.npcs?.[r.recipient]);
    const collecting=deliveries.length&&currentShops(engine,state).some(s=>deliveries.some(r=>r.recipient===s.keeper&&r.to===s.location));
    const interval=consumers||collecting?720:DAY;
    return (Math.floor(now/interval)+1)*interval;
}

// All ordinary quotes read current supply; only signed terms stay frozen.
// S5-F: the quote also names the bill in the place's legal-tender unit (derived, never stored).
export function tradeQuote(d,engine,args){
    const quote=baseTradeQuote(d,engine,args);
    if(currencyRow(engine,args.item))return quote;
    return {...quote,tender:tenderQuote(d,engine,{location:args.location,copper:quote.totalCoins,side:args.buyer==='player'?'buy':'sell'})};
}
function baseTradeQuote(d,engine,{buyer,seller,item,quantity,location,base,instances=null}){
    const agreed=agreedTradeQuote(d.get('state'),{buyer,seller,item,quantity});
    if(agreed){
        const state=d.get('state'),npc=buyer==='player'?seller:buyer;
        return {...agreed,agreed:true,buyer,seller,item,listPrice:agreed.totalCoins/agreed.quantity,
            day:Math.floor(state.minute/DAY),place:placeSettlement(engine,state,location).value??location,goods:goodsClass(engine,item),side:buyer==='player'?'sell':'buy',business:shopOfKeeper(engine,npc,state)?.keeper??null};
    }
    const rules=shopRules(engine),limits=engine.rules.economy.priceFactorLimits,price=base();
    const state=d.get('state'),sellerShop=shopOfKeeper(engine,seller,state),buyerShop=shopOfKeeper(engine,buyer,state);
    const npc=buyer==='player'?seller:seller==='player'?buyer:sellerShop?seller:buyerShop?buyer:null;
    const shop=buyer==='player'?sellerShop:seller==='player'?buyerShop:sellerShop??buyerShop;
    let relation=1,keeperRegard=null,settlementRegard=null;
    const place=shop?.settlement??placeSettlement(engine,d.get('state'),location).value;
    if(npc&&rules){
        const customer=npc===seller?buyer:seller;keeperRegard=standing(engine,state,npc,customer);
        settlementRegard=place&&isReputationSettlement(engine,place)?standing(engine,state,place,customer):0;
        const regard=rules.relation.keeper*keeperRegard+rules.relation.settlement*settlementRegard;
        relation=clamp(1+(npc===seller?-1:1)*rules.relation.span*regard/100,limits.relation);
    }
    const quote=marketQuote(d,engine,{buyer,seller,item,quantity,location,business:shop,instances,relation,
        base:price*medicinePriceFactor(engine,d.get('state'),item,location,d)}),money=currencyRow(engine,item);
    if(money){
        const spread=shop?(shop.keeper===seller?clamp(shop.markup,limits.shop):engine.world.marketRules.spread.buy):1;
        const converted=currencyTradePrice(d,engine,{currency:money.resource,quantity:quote.quantity,location,spread,relation});
        Object.assign(quote,converted,{retail:true});
        quote.explanation={...quote.explanation,baseline:converted.pricing.rate,environment:1,base:converted.pricing.rate,scarcity:1,quality:1,depth:1,spread,relation,curve:quote.quantity,
            value:{base:converted.pricing.rate,value:converted.pricing.rate,contributions:[]},price:{base:converted.listPrice,value:converted.listPrice,contributions:[]},currency:converted.pricing};
    }
    return {...quote,shop:shop?.id??null,settlement:place,keeperRegard,settlementRegard};
}
export function recordDeal(d,quote,price,quantity,eventId,settled=null){
    if(quote.agreed)consumeAgreedQuote(d,quote,eventId);
    recordMarketDeal(d,quote,price,quantity,eventId,settled);
}
import {medicinePriceFactor} from './medicine-state.mjs';
