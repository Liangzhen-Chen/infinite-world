// TFB audit: real deliveries and registered customers, no nutrition credited
// to unprocessed grain. Usage: node tools/audit-food-supply.mjs [days] [place]
import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {toRational} from '../server-plugin/det-math.mjs';
import {legacyMoney,counterCash} from '../server-plugin/money.mjs';
import {currentShops} from '../server-plugin/shop.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
const days=Number(process.argv[2]??30),place=process.argv[3]??'loc_bs';
const world=await loadWorld(),engine=new WorldEngine(world);
const legacy=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
let doc=engine.createCharacter(legacy,{},'TFB-30-day');
const start=doc.state.minute;
for(let day=0;day<days;day++){
 const out=await engine.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:`food-audit:${day}`});doc=applyPatches(doc,out.patches);
}
const records=Object.values(doc.state.records),shops=world.rules.economy.shops.stores.filter(s=>s.settlement===place),ids=new Set(shops.map(s=>s.id));
const orders=records.filter(r=>r.category==='settlement_trade'&&r.foodSupply&&ids.has(r.shop));
const settled=records.filter(r=>r.category==='food_supply_stats').reduce((n,s)=>n+Object.entries(s.destinations??{}).filter(([id])=>ids.has(id)).reduce((sum,[,v])=>sum+v.arrived,0),0);
const arrivals=settled+orders.filter(o=>o.transport.phase!=='home').reduce((n,o)=>n+(o.deliveredFood??0),0);
const visits=records.filter(r=>r.category==='customer_flow'&&ids.has(r.shop)).flatMap(r=>r.visits);
const bought=visits.filter(v=>v.outcome==='bought'&&v.item===world.rules.agriculture.grainItem);
const registered=new Set(world.households.filter(h=>h.settlement===place).map(h=>h.id)),meals=Object.values(doc.state.family?.meals??{}).filter(m=>registered.has(m.household));
const number=v=>typeof v==='number'?v:v?.numerator/v?.denominator||0;
const nutrition={registeredHouseholds:registered.size,unmetHouseholdDays:meals.reduce((n,m)=>n+m.unmetMealDays,0),finalDayMissingSatiety:toRational(meals.reduce((n,m)=>n+number(m.shortfall?.satiety),0))};
const expected=new Map([...legacyMoney(engine,doc.state),...legacyStock(engine,doc.state).balances]),accounts=doc.ledger?.accounts??{};
const ledger={mismatches:[...new Set([...expected.keys(),...Object.keys(accounts)])].filter(k=>(expected.get(k)??0)!==(accounts[k]??0)),drift:doc.ledger?.drift??[],audit:auditLedger(doc.ledger)};
const d={document:doc,get(...path){return path.reduce((v,k)=>v?.[k],doc);}},grain=world.rules.agriculture.grainItem;
const counters=currentShops(engine,doc.state).filter(s=>ids.has(s.id)).map(s=>({id:s.id,keeper:s.keeper,intervalDays:s.cycleDays,target:s.restock.find(r=>r.item===grain)?.amount??0,shelf:engine.quantity(d,s.keeper,grain),counterCopper:counterCash(d,s.keeper),purseCopper:doc.state.npcs[s.keeper]?.coins??0}));
const grainPerDay=counters.reduce((n,c)=>n+c.target/c.intervalDays,0);
const demand={weeklyGrain:grainPerDay*7,thirtyDayGrain:grainPerDay*days,counters,observedBids:records.filter(r=>r.category==='food_supply_stats').flatMap(r=>(r.quotes??[]).filter(q=>counters.some(c=>c.keeper===q.buyer)).map(q=>({source:r.settlement,...q})))};
const result={days,place,start,end:doc.state.minute,grain:world.rules.agriculture.grainItem,arrived:arrivals,registeredHouseholdsBought:bought.reduce((n,v)=>n+v.quantity,0),buyers:[...new Set(bought.map(v=>v.npc))],creditedSatiety:0,nutrition,orders:orders.map(({id,seller,scout,status,quantity,deliveredFood,spoiledFood,lostFood,escrowCopper})=>({id,seller,scout,status,quantity,deliveredFood,spoiledFood,lostFood,escrowCopper})),note:'Raw grain has no nutrition. K08 correctly does not buy it as ready-to-eat food; household processing belongs to card C.'};
console.log(JSON.stringify({...result,demand,ledger},null,2));
