// Formal-world TOWNFOOD C audit. Every count comes from a transaction/craft/
// meal receipt; raw inventory is never counted as nutrition.
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {loadWorld} from './load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {statisticalFoodGroups} from '../server-plugin/household-budget.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {legacyStock} from '../server-plugin/stock.mjs';

const days=Number(process.argv[2]??30),world=await loadWorld();if(process.env.NOLAW)delete world.rules.householdCrafts;const e=new WorldEngine(world),sid='loc_bs';
const legacy=JSON.parse(await fs.readFile(new URL('../tests/fixtures/legacy/seed.json',import.meta.url),'utf8'));
let doc=e.createCharacter(legacy,{},'TFB-30-day');
const initial=structuredClone(doc.state.settlements),start=doc.state.minute,base=e.world.primitiveTables.body.rows.find(r=>r.selector==='person'&&r.need==='satiety').drainPerHour.light*24;
const townHomes=new Set(world.households.filter(h=>h.settlement===sid).map(h=>h.id)),townPeople=new Set(world.households.filter(h=>townHomes.has(h.id)).flatMap(h=>h.members));
const stats=new Set(statisticalFoodGroups(e,doc.state,sid).map(r=>r.owner)),seenBuys=new Set(),seenCrafts=new Set();
const named={finishedBought:0,rawBought:0,attemptedBatches:0,processedBatches:0,rawProcessed:0,processedFood:0,nutrition:0,missingMeals:0},statistical={...named};let villageMarketSold=0;
const number=v=>typeof v==='number'?v:Number(v?.numerator??0)/Number(v?.denominator??1);
const begin=performance.now();
for(let day=0;day<days;day++){
 const out=await e.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:`food-audit:${day}`});doc=applyPatches(doc,out.patches);
 for(const row of Object.values(doc.state.records)){
  if(row.category==='customer_flow')for(const v of row.visits){
   if(v.outcome!=='bought'||seenBuys.has(v.sourceEvent))continue;seenBuys.add(v.sourceEvent);
   const target=stats.has(v.npc)?statistical:townPeople.has(v.npc)?named:null;
   if(target)target[world.items.find(i=>i.id===v.item)?.nutrition?.satiety>0?'finishedBought':'rawBought']+=v.quantity;
   if(row.foodProducer&&v.item===e.rules.agriculture.grainItem)villageMarketSold+=v.quantity;
  }
  if(row.category==='household_processing'&&['done','failed'].includes(row.status)&&!seenCrafts.has(row.id)){
   seenCrafts.add(row.id);const target=stats.has(row.owner)?statistical:townPeople.has(row.owner)?named:null;if(!target)continue;
   target.attemptedBatches+=row.batches;if(row.status==='done')target.processedBatches+=row.batches;
   target.rawProcessed+=(e.byId.get(row.recipe)?.materials.find(m=>m.item===e.rules.agriculture.grainItem)?.amount??0)*row.batches;
   for(const [item,n]of Object.entries(row.outputs??{}))if(e.byId.get(item)?.nutrition?.satiety>0)target.processedFood+=n;
  }
 }
 for(const meal of Object.values(doc.state.family?.meals??{}))if(townHomes.has(meal.household)){
  named.missingMeals+=number(meal.missingMeals);for(const r of meal.consumed)named.nutrition+=r.quantity*(e.byId.get(r.item)?.nutrition?.satiety??0);
  named.nutrition+=number(meal.sourceNutrition?.satiety)+number(meal.publicNutrition?.satiety);
 }
}
const elapsedMs=performance.now()-begin;
for(const row of statisticalFoodGroups(e,doc.state,sid)){statistical.nutrition+=number(row.consumedSatiety);statistical.missingMeals+=number(row.missingSatiety)/base;}
const publicChanges=Object.fromEntries(Object.entries(doc.state.settlements).filter(([id])=>id===sid||world.rules.agriculture.settlements.some(p=>p.settlement===id)).map(([id,s])=>[id,{money:{before:initial[id]?.treasury??0,after:s.treasury??0},grain:{before:initial[id]?.food??0,after:s.food??0}}]));
const expected=new Map([...legacyMoney(e,doc.state),...legacyStock(e,doc.state).balances]),accounts=doc.ledger?.accounts??{};
const mismatches=[...new Set([...expected.keys(),...Object.keys(accounts)])].filter(k=>(expected.get(k)??0)!==(accounts[k]??0));
const hwHomes=new Set(world.households.filter(h=>h.settlement==='loc_hw').flatMap(h=>h.members)),village={attempted:0,done:0,failed:0,flatbread:0};
for(const row of Object.values(doc.state.records))if(row.category==='household_processing'&&hwHomes.has(row.owner)){village.attempted+=row.batches;row.status==='done'?village.done+=row.batches:village.failed+=row.batches;village.flatbread+=row.outputs?.item_oat_flatbread??0;}
const result={days,start,village,end:doc.state.minute,elapsedMs,named,statistical,villageMarketSold,publicChanges,ledger:{audit:auditLedger(doc.ledger),mismatches},comparison:{missingMeals:17412.5,purchased:0}};
if(process.argv[3]){await fs.writeFile(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({out:process.argv[3],elapsedMs,named,statistical,villageMarketSold}));}
else console.log(JSON.stringify(result,null,2));
