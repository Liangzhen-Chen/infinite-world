// Read-only household budgets. A target is a preference, never a transfer.
import {bagStock,bag,priceRead,itemResource,crop as cropAccount} from './stock.mjs';
import {coinRead,purse,COIN} from './money.mjs';
import {personHousehold} from './entity-view.mjs';
import {obligationRows,obligationClosed} from './obligation-state.mjs';
import {bodyRule} from './primitives-body.mjs';
import {explainDerived} from './derived.mjs';
import {domainRules,privateCropYieldBase} from './domain-rules.mjs';
import {digest,recordsMemo,recordsWhere,stateMemo,PatchCursor} from './storage.mjs';
import {compileRX,evaluateRX,fixedUnits,fixedInteger,FIXED_SCALE} from './rx.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {employmentActive} from './employment-state.mjs';
import {contractTerms,leaseState,tenancyRentAmount} from './contract-state.mjs';
import {householdWorkTime} from './npc-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {physicalItem} from './items.mjs';
import {isItemClass,householdUsage as usageDefinition} from './item-class.mjs';
import {registerMerchandiseResolver} from './npc-life.mjs';

const DAY=1440,qty=v=>typeof v==='number'?v:v?.quantity??0;
const mealCandidates=Symbol('physical meal candidates');
const preferenceRoll=compileRX('roll("thrift")');
const laborPreferenceRoll=compileRX('roll("reservation")'),laborNoiseRoll=compileRX('roll("choice")');
const actor=(s,id)=>id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id];
const inventory=(s,id)=>{
 const a=actor(s,id),m=a?.materialized;
 return id==='player'?s.inventory??{}:m?.folded?s.records?.[`remote-stock:${m.settlement}`]?.members?.[id]?.inventory??{}:a?.inventory??{};
};
const unpaid=r=>Math.max(0,(r.amount??r.quantity??r.coins??0)-(r.paid??r.fulfilled??0));
const debtor=r=>r.debtor??r.promisor,creditor=r=>r.creditor??r.promisee;
const budgetAccounts=Symbol('household inventory account owners');
const seedRecords=Symbol('household seed records'),futureRecords=Symbol('household future records');
const commitmentMemo=Symbol('household commitments');
const seedInputs=[{path:['records'],kinds:['asset_lease']},{path:['records'],categories:['private_farm']},['minute'],['buildings'],['created']];
const seedRecordInputs={kinds:['asset_lease'],categories:['private_farm']};
// Claims, their quote receipts and source events are the only record inputs.
// Daily household/ecology receipts cannot change a promised inventory unit.
const commitmentRecordInputs={categories:['debt','contract','agreed_quote','agreed_quote_used','agreed_quote_receipt','world_event']};
const commitmentRows=Symbol('household commitment rows');
const commitmentInputs=[{path:['records'],categories:commitmentRecordInputs.categories},['obligations'],['minute']];
const promisedRecords=Symbol('household legacy promises');
const budgetReads=new WeakMap();
const budgetValue=Symbol('budget value'),resourceMemo=Symbol('household resources');
// Kernel reads share work only while this exact draft revision is unchanged.
// Subjective views stay uncached: their observer and evidence are independent inputs.
function budgetRead(d,engine,key,build){
 const inputs=Array.isArray(key)?key:[key];
 if(!(d.cursor instanceof PatchCursor)||d.document!==d.cursor.root)return d.memo?d.memo(engine,[budgetValue,...inputs],build):build();
 let cache=budgetReads.get(d.cursor);
 if(!cache||cache.cursor!==d.cursor||cache.revision!==d.cursor.revision||cache.engine!==engine){
  cache={cursor:d.cursor,revision:d.cursor.revision,engine,values:new Map()};budgetReads.set(d.cursor,cache);
 }
 let values=cache.values;
 for(const input of inputs){
  let next=values.get(input);if(!next)values.set(input,next=new Map());values=next;
 }
 if(!values.has(budgetValue))values.set(budgetValue,build());
 return values.get(budgetValue);
}
// The shop domain supplies public opening/replenishment facts and bounded
// local quotes. Keeping the resolver here avoids an economy import cycle.
// Hoisted registry: shop.mjs registers during the same import cycle, before this module body runs.
export function registerHouseholdFoodSources(resolve){registerHouseholdFoodSources.fn=resolve;}
const foodSources=(...a)=>registerHouseholdFoodSources.fn?.(...a)??[];
function bagEntries(d,engine,state,holder,view){
 const raw=view?view.self.inventory:inventory(state,holder),held=new Map();
 for(const [name,value]of Object.entries(raw)){
  const resolved=engine.byId.has(name)?name:itemResource(engine,name),item=engine.byId.has(resolved)?resolved:name;
  held.set(item,(held.get(item)??0)+qty(value));
 }
 const items=new Set(held.keys());
 const accounts=view?view.self.accounts:d.get('ledger','accounts');
 const byOwner=recordsMemo(accounts,budgetAccounts,()=>{
  const groups=new Map();
  for(const key of Object.keys(accounts??{})){
   const [owner,resource,purpose]=key.split('|');if(purpose!=='inventory')continue;
   const rows=groups.get(owner)??[];rows.push(resource);groups.set(owner,rows);
  }
  return groups;
 });
 for(const resource of byOwner.get(holder)??[]){
  const item=engine.byId.has(resource)?resource:(engine.rules.economy?.credit?.coinages??[]).find(c=>c.id.replace(/^coinage_/,'coin_')===resource)?.item;
  if(item)items.add(item);
 }
 return [...items].map(item=>[item,held.get(item)??0]);
}
function fieldAccess(engine,state,owner,location,at=state.minute){
 const leases=recordsWhere(state.records,'kind','asset_lease').filter(r=>r.subject===location&&leaseState(engine,state,r,at).active);
 return !leases.some(r=>contractTerms(r,at).tenant!==owner)&&(state.buildings?.[location]?.owner===owner||leases.some(r=>contractTerms(r,at).tenant===owner));
}

// Canonical claims and their compatibility projections represent one promise.
function commitmentAllocation(state){
 const amounts=new Map(),represented=new Set();
 const add=(owner,item,amount)=>{const key=`${owner}:${item}`;amounts.set(key,(amounts.get(key)??0)+amount);};
 for(const r of obligationRows(state)){
  if(r.legacyRecord)represented.add(r.legacyRecord);
  if(!obligationClosed(r))add(debtor(r),r.resource??r.item??r.subject,unpaid(r));
 }
 for(const [key,r]of recordsMemo(state.records,commitmentRows,()=>Object.entries(state.records??{}).filter(([,r])=>r.category==='contract'&&r.kind==='procurement'||r.category==='agreed_quote'),{categories:['contract','agreed_quote']})){
  if(represented.has(key)||r.obligation&&state.obligations?.[r.obligation])continue;
  if(r.category==='contract'&&r.kind==='procurement'&&!obligationClosed(r))add(r.parties?.[1],r.subject,unpaid(r));
  // Keep the existing agreed-price receipt/source gate; a quote is not money.
  if(r.category==='agreed_quote'&&r.direction==='sell_to_player'&&r.at<=state.minute&&state.minute<r.expires&&!state.records[`${key}:used`]&&state.records[`${key}:source`]?.digest===digest(r)){
   const source=state.records[`world_event:${r.sourceEvent?.replace(/^world_event:/,'')}`],p=source?.payload;
   if(source?.verb==='quoted'&&source.actor===r.actor&&source.minute===r.at&&p?.to===r.to&&p.resource===r.resource&&p.quantity===r.quantity&&p.totalCoins===r.totalCoins)add(r.actor,r.resource,r.quantity);
  }
 }
 return amounts;
}
export function householdCommitments(state,owner,item){
 return commitmentAllocation(state).get(`${owner}:${item}`)??0;
}

// Stable keyed RX draw: recoverable from campaign seed + identity, independent
// of query minute/order. P prior lives in market.json, not in actor balances.
export function householdBufferTarget(d,engine,owner,{incomeDays=0,risk=0,commonRisk=0,creditCoverage=0,foodDays=null}={}){
 const document=d.document??{state:d.get('state')},r=engine.world.marketRules;
 const roll=evaluateRX(preferenceRoll,{}, {rollKey:{seed:document.randomSeed,pack:'household',rule:'persistent-thrift',object:owner,date:0}});
 // Archived world tables predate the optional preference mixture. Their
 // existing reserve period remains a single ordinary cycle, without writes.
 const configuration=r.householdBuffer;
 const profile=configuration?configuration.profiles.find(p=>roll<=p.through):{id:'ordinary',cycles:1};
 // An affordable single meal must not erase a six-day income gap. Market
 // access lowers physical retention below, in proportion to food actually
 // fundable; the preference horizon itself remains the full income cycle.
 const cycle=Math.max(r.personalReserveDays,incomeDays);
 const exposure=Math.max(0,risk)+Math.max(0,commonRisk);
 const days=Math.max(0,cycle*profile.cycles*(1+exposure)-Math.min(cycle,Math.max(0,creditCoverage)));
 return {days,cycle,foodDays,profile:profile.id,roll,risk,commonRisk,creditCoverage,source:configuration?'seeded-preference':'legacy-reserve-rule',calibration:configuration?.source??r.source};
}

function family(d,engine,owner){
 const s=d.get('state'),h=personHousehold(engine,s,owner).value;
 // Family membership alone is never authority over another purse. Existing
 // registered households share meals; separate households at one address do
 // not become one budget merely by co-residence or kinship.
 const members=h?.members??[owner],shared=members.length>1;
 return {household:h?.id??null,members,holders:members,shared};
}

function seedNeeds(engine,state,holders){
 const needs=new Map(),field=domainRules(engine).privateField;
 if(!field)return needs;
 for(const record of recordsMemo(state.records,seedRecords,()=>Object.values(state.records??{}).filter(r=>r.kind==='asset_lease'||r.category==='private_farm'),seedRecordInputs)){
  const terms=record.kind==='asset_lease'?contractTerms(record,state.minute):record;
  const r={...terms,...(record.kind==='asset_lease'?terms.rentBasis:{})};
  // A growing crop has already consumed seed. Only a signed next sowing or
  // harvested field still used by its owner asks for a new sowing allocation.
  const owner=r.kind==='asset_lease'?r.tenant:r.owner;
  if(!(r.areaMu>0)||!r.seedItem)continue;
  if(r.kind==='asset_lease'){
   if(!leaseState(engine,state,record).active||r.use!=='field')continue;
   // A leased field can be only partly sown. The actual harvested crop's
   // area is the next-cycle basis; the lease's capacity is not a second plan.
   if(recordsWhere(state.records,'category','private_farm').some(f=>f.location===r.subject&&(['growing','ready'].includes(f.status)||f.status==='harvested'&&f.owner===owner)))continue;
  }else if(r.category!=='private_farm'||r.status!=='harvested'||!fieldAccess(engine,state,owner,r.location))continue;
  const binding=field.crops.find(c=>c.seed===r.seedItem);if(!binding)continue;
  const n=binding.yieldSelector==='field:wheat'
   ?Math.ceil(r.areaMu*engine.world.primitiveTables.yields.rows.find(y=>y.key==='field:wheat/seed').seedPerUnit.qty*field.kgPerJin/engine.byId.get(r.seedItem).weight)
   :Math.ceil(r.areaMu*engine.rules.agriculture.crop.seedPerHa/field.muPerHectare);
  const location=r.subject??r.location,lease=r.kind==='asset_lease'?record:recordsWhere(state.records,'kind','asset_lease').find(l=>l.subject===location&&contractTerms(l,state.minute).tenant===owner&&leaseState(engine,state,l).active);
  const signed=lease&&contractTerms(lease,state.minute),t=signed?.tenancy;
  const ownerSeed=t?.inputPayer==='owner'?n:t?.inputPayer==='shared'?Math.ceil(n*t.ownerInputNumerator/t.ownerInputDenominator):0;
  for(const [payer,amount]of [[owner,n-ownerSeed],[signed?.owner,ownerSeed]])if(amount&&holders.includes(payer)){
   const key=`${payer}:${r.seedItem}`;
   // Lease and farm records can refer to the same field; retain each payer once.
   const old=needs.get(key)??new Map();old.set(location,amount);needs.set(key,old);
  }
 }
 return new Map([...needs].map(([key,fields])=>[key,[...fields.values()].reduce((a,b)=>a+b,0)]));
}

function allocateMeals(rows,needs){
 const shortfall={};
 for(const need of ['satiety','hydration']){
  let remaining=needs[need]-rows.reduce((n,r)=>n+r.food*(r.definition?.nutrition?.[need]??0),0);
  for(const r of rows){
   const gain=r.definition?.nutrition?.[need]??0;if(gain<=0||remaining<=0)continue;
   const used=Math.min(Math.max(0,r.stock-r.committed-r.seed-r.food),Math.ceil(remaining/gain));
   r.food+=used;remaining-=used*gain;
  }
  shortfall[need]=Math.max(0,remaining);
 }
 return shortfall;
}

// Public agriculture has already consumed standard daily portions, whose
// satiety follows the body table's base day. Personal drain modifiers change
// need, never the nutrition in that same ration. Private food fills the gap.
export function householdMealPlan(d,engine,owner,{publicShare=0,sourceNutrition={}}={}){
 const state=d.get('state'),f=family(d,engine,owner);
 const members=f.members.filter(id=>id!=='player'&&!isPhysicallyDead(engine,state,id)&&!state.npcs?.[id]?.levy&&!state.npcs?.[id]?.materialized?.folded);
 const needs=Object.fromEntries(['satiety','hydration'].map(need=>[need,members.reduce((sum,id)=>sum+explainDerived(engine,d.document,'body:drain',id,{base:bodyRule(engine,need).drainPerHour.light*24}).value,0)]));
 const publicNutrition={satiety:bodyRule(engine,'satiety').drainPerHour.light*24*members.length*Math.max(0,Math.min(1,publicShare)),hydration:0};
 const seeds=stateMemo(state,engine,[seedRecords,JSON.stringify(members)],()=>seedNeeds(engine,state,members),seedInputs);
 const commitments=stateMemo(state,engine,[commitmentMemo],()=>commitmentAllocation(state),commitmentInputs);
 // Meals need physical food, seeds and promises, not a quote/income horizon
 // or a scan of everyone's production tasks for every inventory row.
 const rows=members.flatMap(holder=>bagEntries(d,engine,state,holder,null).flatMap(([item,held])=>{
  const definition=engine.byId.get(item);if(!definition?.nutrition)return [];
  const stock=bagStock(d,engine,{point:'region.material',id:holder,item,legacy:()=>qty(held)}),key=`${holder}:${item}`;
  const committed=commitments.get(key)??0,seed=Math.min(Math.max(0,stock-committed),seeds.get(key)??0);
  return [{holder,item,definition,stock,committed,seed,food:0}];
 })).sort((a,b)=>(a.definition?.shelfLifeDays??Infinity)-(b.definition?.shelfLifeDays??Infinity)||a.item.localeCompare(b.item)||a.holder.localeCompare(b.holder)).map(r=>{
  const held=d.get(...engine.bagPath(r.holder),r.item),units=held?.instances??[];
  const safe=id=>{const f=physicalItem(d,engine,id);return f.contaminated!==true&&f.toxic!==true&&f.condition!==0;};
  const selection=units.filter(safe),loose=safe(r.item)?Math.max(0,r.stock-units.length):0;
  return {...r,definition:engine.byId.get(r.item),stock:Math.min(r.stock,loose+selection.length),selection,food:0};
 });
 return householdMealWithSources({household:f.household,members,needs,publicNutrition,[mealCandidates]:rows},sourceNutrition);
}

// Midnight reads every household's physical bags against one revision. Source
// withdrawals do not alter those bags, so changing the supplied nutrition can
// reuse the same safe units/seeds/promises without rebuilding ledger indexes.
export function householdMealWithSources(plan,sourceNutrition={}){
 const rows=plan[mealCandidates].map(r=>({...r,food:0}));
 const shortfall=allocateMeals(rows,Object.fromEntries(Object.keys(plan.needs).map(n=>[n,plan.needs[n]-plan.publicNutrition[n]-(sourceNutrition[n]??0)])));
 return {...plan,shortfall,rows:rows.filter(r=>r.food>0).map(({definition,...r})=>({...r,selection:r.selection.slice(0,r.food)}))};
}

export function householdResources(d,engine,owner,{days=null,view=null,risk=0,commonRisk=0,marketSubstitution=true}={}){
 const read=()=>readHouseholdResources(d,engine,owner,{days,view,risk,commonRisk,marketSubstitution});
 return view?read():budgetRead(d,engine,[resourceMemo,owner,days,risk,commonRisk,marketSubstitution],read);
}
function readHouseholdResources(d,engine,owner,{days,view,risk,commonRisk,marketSubstitution}){
 const state=d.get('state'),f=family(d,engine,owner),subjective=Boolean(view);
 if(view&&view.observer!==owner)throw Error('Household budget observer mismatch');
 // Knowing the household's mouths does not grant access to their private
 // bags. Subjective needs use known derived facts, with the public body base
 // when another member's private modifiers are unknown.
 const holders=subjective?[owner]:f.holders,members=f.shared?f.members:[owner];
 const seeds=subjective?new Map():stateMemo(state,engine,[seedRecords,JSON.stringify(holders)],()=>seedNeeds(engine,state,holders),seedInputs);
 const promises=subjective?view.self.obligations??[]:[...obligationRows(state),...recordsMemo(state.records,promisedRecords,()=>Object.values(state.records??{}).filter(r=>r.kind==='procurement'||r.category==='agreed_quote'))];
 const rows=holders.flatMap(holder=>{
  const entries=new Map(bagEntries(d,engine,state,holder,view));
  for(const key of seeds.keys())if(key.startsWith(`${holder}:`))entries.set(key.slice(holder.length+1),entries.get(key.slice(holder.length+1)));
  for(const r of promises){
   const item=r.resource??r.item??r.subject;
   if((debtor(r)??(r.kind==='procurement'?r.parties?.[1]:r.actor))===holder&&engine.byId.has(item)&&!obligationClosed(r)&&!entries.has(item))entries.set(item,undefined);
  }
  return [...entries].map(([item,held])=>{
  const definition=engine.byId.get(item),key=`${holder}:${item}`;
  const stock=subjective?(view.self.accounts?.[bag(engine,holder,item)]?.balance??qty(held)):bagStock(d,engine,{point:'region.material',id:holder,item,legacy:()=>qty(held)});
  return {holder,item,key,definition,stock,food:0,seed:0,seedTarget:0,committed:0,inUse:0};
  });
 }).sort((a,b)=>(a.definition?.shelfLifeDays??Infinity)-(b.definition?.shelfLifeDays??Infinity)||a.item.localeCompare(b.item)||a.holder.localeCompare(b.holder));
 const commitments=subjective?null:stateMemo(state,engine,[commitmentMemo],()=>commitmentAllocation(state),commitmentInputs);
 for(const r of rows){
  r.committed=subjective?(view.self.obligations??[]).filter(o=>!obligationClosed(o)&&debtor(o)===owner&&(o.resource??o.item??o.subject)===r.item).reduce((n,o)=>n+unpaid(o),0):commitments.get(r.key)??0;
  r.seedTarget=seeds.get(r.key)??0;
  r.seed=Math.min(Math.max(0,r.stock-r.committed),r.seedTarget);
  r.inUse=subjective?0:Object.values(state.npcAutonomy?.tasks??{}).some(t=>t.npc===r.holder&&t.status==='进行中'&&(engine.world.recipes.find(p=>p.id===t.action?.recipe)?.tools??[]).includes(r.item))?1:0;
 }
 // A quote is future access, never current food or cash. Earmark only this
 // person's cash, net of known payments before acquisition; no family purse.
 const cash=view?(view.self.accounts?.[purse(engine,owner)]?.balance??view.self.coins):coinRead(d,{point:'assets.cash',account:purse(engine,owner),legacy:()=>actor(state,owner)?.coins??0});
 const payments=futureSources(d,engine,owner,view).payments;
 const sources=marketSubstitution&&cash>0&&commonRisk<1?foodSources(d,engine,owner,{view}).filter(r=>r.at>=state.minute&&Math.floor(r.quantity*Math.max(0,1-commonRisk))>0&&r.unitPrice>0&&r.unitPrice<=cash-payments.filter(p=>p.resource===COIN&&p.at<=r.at).reduce((n,p)=>n+p.amount,0)):[];
 const nextFood=sources.length?Math.min(...sources.map(r=>r.at)):null;
 // Resolve each person's target once for both nutrient dimensions.
 const horizons=new Map(members.map(id=>{
  const planner=subjective?owner:id;
  const future=days===null?futureSources(d,engine,planner,view).future:[];
  const next=future.find(r=>r.reliable)??future.find(r=>r.source==='harvest');
  const incomeDays=next?Math.max(0,(next.at-state.minute)/DAY):0;
  const incomeRisk=future.length?future.filter(r=>!r.reliable).length/future.length:0;
  return [id,days??householdBufferTarget(d,engine,planner,{incomeDays,risk:risk+incomeRisk,commonRisk,foodDays:nextFood===null?null:(nextFood-state.minute)/DAY}).days];
 }));
 const needs=Object.fromEntries(['satiety','hydration'].map(need=>[need,members.reduce((n,id)=>n+explainDerived(engine,d.document??{state},'body:drain',id,{base:bodyRule(engine,need).drainPerHour.light*24*horizons.get(id),...(view?{observer:owner,view}:{})}).value,0)]));
 const baseline=rows.map(r=>({...r})),procurementShortfall=allocateMeals(baseline,needs);
 // Shared food is allocated once in a stable order. My cash can release my
 // own retained goods, but cannot silently release another holder's reserve
 // by promising that I will feed them later. That requires an actual transfer.
 for(let i=0;i<rows.length;i++)if(rows[i].holder!==owner)rows[i].food=baseline[i].food;
 const otherFood=Object.fromEntries(Object.keys(needs).map(need=>[need,rows.reduce((n,r)=>n+r.food*(r.definition?.nutrition?.[need]??0),0)]));
 const market={cash,spent:0,coverage:{satiety:0,hydration:0},physicalFloor:{satiety:0,hydration:0},purchases:[],nextFoodAt:nextFood};
 const maxDays=Math.max(0,...horizons.values());
 const deliveries=sources.flatMap(source=>{
  const rows=[source];
  if(source.cycleDays>0)for(let at=source.at+source.cycleDays*DAY;at<=state.minute+maxDays*DAY;at+=source.cycleDays*DAY)rows.push({...source,at});
  return rows;
 });
 for(const source of deliveries.sort((a,b)=>a.at-b.at||a.unitPrice-b.unitPrice||a.item.localeCompare(b.item))){
  const wait=(source.at-state.minute)/DAY;if(wait>maxDays)continue;
  const nutrition=engine.byId.get(source.item)?.nutrition??{};
  const remaining=Object.fromEntries(Object.keys(needs).map(need=>{
   const before=members.reduce((n,id)=>n+explainDerived(engine,d.document??{state},'body:drain',id,{base:bodyRule(engine,need).drainPerHour.light*24*Math.min(wait,horizons.get(id)),...(view?{observer:owner,view}:{})}).value,0);
   market.physicalFloor[need]=Math.max(market.physicalFloor[need],before-otherFood[need]-market.coverage[need]);
   return [need,Math.max(0,needs[need]-otherFood[need]-market.physicalFloor[need]-market.coverage[need])];
  }));
  const wanted=Math.max(0,...Object.keys(needs).filter(n=>nutrition[n]>0).map(n=>Math.ceil(remaining[n]/nutrition[n])));
  const due=payments.filter(r=>r.resource===COIN&&r.at<=source.at).reduce((n,r)=>n+r.amount,0);
  const money=Math.max(0,cash-due-market.spent),quantity=Math.min(wanted,Math.floor(source.quantity*Math.max(0,1-commonRisk)),Math.floor(money/source.unitPrice));
  if(!quantity)continue;
  const cost=quantity*source.unitPrice;market.spent+=cost;
  for(const need of Object.keys(needs))market.coverage[need]+=Math.min(remaining[need],quantity*(nutrition[need]??0));
  market.purchases.push({...source,quantity,cost});
 }
 const shortfall=allocateMeals(rows,Object.fromEntries(Object.keys(needs).map(need=>[need,Math.max(0,needs[need]-market.coverage[need])])));
 reserveUpkeep(engine,state,members,rows);
 // Cash-backed access is not a completed purchase. The real shopping
 // consumer still needs the goods missing from its current physical bags.
 return {owner,household:f.household,members,scope:subjective?'subjective':'kernel',sharedMeals:f.shared,shortfall,procurementShortfall,market,
  seedShortfall:rows.reduce((n,r)=>n+r.seedTarget-r.seed,0),commitmentShortfall:rows.reduce((n,r)=>n+Math.max(0,r.committed-r.stock),0),rows:rows.map(({definition,key,...r})=>{
  const retained=Math.max(r.inUse,r.food+r.seed)+(r.upkeep??0);
  return {...r,consumable:Boolean(definition?.nutrition),retained,available:Math.max(0,r.stock-retained-r.committed)};
 })};
}

// 家户用度自留（K2，与 npc-life 的家户用度同一口径）：npc-life 每天从户里扣的消耗类（householdUsage 的燃料、调味按重量），
// 按一户的日用量 × 一个交易周期（economy.tradeCycleDays）留在家里。书、工具等耐用品（durable）不是按日消耗的，
// 不按“日用量 × 周期”留；正在干活用着的工具由 inUse 留。店主货架上待售的货（本店补货清单）不是家用，不留。读 saleableStock/householdResources 的地方都据此只卖余量。
// 用度定义只有 item-class.mjs 的 householdUsage 一份，这里按状态时刻读它。
export function householdUsage(engine,state,members){return usageDefinition(engine,state.minute,members);}
const itemGrams=(engine,item)=>Math.max(1,Math.round((engine.byId.get(item)?.weight??0)*1000));
// 家户用度先用同类里最便宜的：有热值属性（heatValue）的燃料按 价格 ÷ 热值，否则按 价格 ÷ 克。数据里目前没有物品登记热值，都按克算。
export function usageCost(engine,item){const it=engine.byId.get(item);return (it?.basePrice??0)/(it?.heatValue>0?it.heatValue:itemGrams(engine,item));}
// 一户一日用掉这件货多少件（不属于消耗类的为 0）。
export function householdDailyUse(engine,state,members,item){
 return householdUsage(engine,state,members).filter(u=>isItemClass(engine,item,u.cls)).reduce((n,u)=>n+u.gramsPerDay,0)/itemGrams(engine,item);
}
function reserveUpkeep(engine,state,members,rows){
 const cycle=engine.rules.economy?.tradeCycleDays??1,stock=new Map();
 const merchandise=holder=>{if(!stock.has(holder))stock.set(holder,new Set(registerMerchandiseResolver.fn?.(engine,state,holder)??[]));return stock.get(holder);};
 for(const u of householdUsage(engine,state,members)){
  let grams=u.gramsPerDay*cycle;
  // 家里留着用的是同类里最便宜的那些（usageCost，与 npc-life 实际先用的顺序同一个函数），贵的（如引火包）才是可出让的余货。
  for(const r of [...rows].sort((a,b)=>usageCost(engine,a.item)-usageCost(engine,b.item)||a.item.localeCompare(b.item)||a.holder.localeCompare(b.holder))){
   if(grams<=0)break;
   if(!isItemClass(engine,r.item,u.cls)||merchandise(r.holder).has(r.item))continue;
   const free=Math.max(0,r.stock-r.committed-r.food-r.seed-(r.upkeep??0)),take=Math.min(free,Math.ceil(grams/itemGrams(engine,r.item)));
   if(take>0){r.upkeep=(r.upkeep??0)+take;grams-=take*itemGrams(engine,r.item);}
  }
 }
}
function futureSources(d,engine,owner,view){
 return view?buildFutureSources(d,engine,owner,view):budgetRead(d,engine,`future:${owner}`,()=>buildFutureSources(d,engine,owner,null));
}
function buildFutureSources(d,engine,owner,view){
 const s=d.get('state'),rows=view?view.self.obligations??[]:obligationRows(s),future=[],payments=[];
 for(const r of rows){
  if(obligationClosed(r)||!Number.isFinite(r.deadline))continue;
  const resource=r.resource??r.item??(r.category==='debt'||r.debtor||r.coins!==undefined?COIN:null),amount=unpaid(r);
  if(!amount||!resource)continue;
  const at=Math.max(s.minute,r.dueAt??r.deadline),entry={id:r.id,resource,amount,at,day:at/DAY,source:r.kind??r.type,reliable:resource===COIN&&['wage','rent'].includes(r.kind??r.type)&&r.deadline>=s.minute};
  if(creditor(r)===owner)future.push(entry);
  if(debtor(r)===owner)payments.push(entry);
 }
 for(const r of recordsMemo(s.records,futureRecords,()=>{
  const owners=new Map();
  for(const r of Object.values(s.records??{})){
   if(r.kind!=='workshop'&&r.category!=='private_farm')continue;
   const lease=r.lease&&s.records?.[r.lease],terms=lease&&contractTerms(lease,s.minute);
   const ids=new Set([...(r.kind==='workshop'?[r.worker]:[]),...(r.category==='private_farm'?[r.owner,...(terms?.tenancy?.rentMode==='share'?[terms.owner]:[])]:[])]);
   for(const id of ids){const rows=owners.get(id)??[];rows.push(r);owners.set(id,rows);}
  }
  return owners;
 }).get(owner)??[]){
  // Own signed terms are known; a remote farm's current condition is not.
  if(view&&(r.kind==='workshop'||view.self.location!==r.location||!r.lease||contractTerms(s.records?.[r.lease]??{}).tenancy?.rentMode!=='share'))continue;
  if(r.kind==='workshop'&&r.worker===owner){
   const job=contractTerms(r,s.minute);
   if(employmentActive(job,s)&&job.status!=='罢工'&&job.nextWork>s.minute&&job.nextWork<job.deadline&&job.wage>0)
    future.push({id:job.id,resource:COIN,amount:job.wage,at:job.nextWork,day:job.nextWork/DAY,source:'employment',reliable:true});
  }
  if(r.category!=='private_farm'||!['growing','ready'].includes(r.status))continue;
  const lease=r.lease&&s.records?.[r.lease],terms=lease&&contractTerms(lease,s.minute),t=terms?.tenancy;
  const tenant=r.owner===owner,landlord=t?.rentMode==='share'&&terms.owner===owner;
  if(!tenant&&!landlord)continue;
  const at=s.minute+Math.max(0,engine.rules.agriculture.crop.growthDays-r.grownDays)*DAY;
  if(!(fieldAccess(engine,s,r.owner,r.location,at)||t?.unharvestedCrops==='tenant'||r.cropDisposition?.policy==='tenant')||s.buildings?.[r.location]?.condition<=0)continue;
  const base=privateCropYieldBase(engine,r);
  const amount=r.status==='ready'?priceRead(d,{point:'region.material',account:cropAccount(engine,r.location,r.crop),lots:{id:`private:${r.seedEvent}`,after:Math.floor(s.minute/DAY)},legacy:()=>Math.max(0,r.yield-(r.harvestedQty??0))}):Math.floor(view?base:explainDerived(engine,d.document??{state:s},'economy:yield',r.location,{holder:r.owner,base}).value);
  let disposable=amount;
  if(t?.rentMode==='share'&&terms.tenant===r.owner){
   const past=(lease.harvests??[]).filter(h=>h.seedEvent===r.seedEvent).at(-1)?.assessed??0;
   const predicted=(lease.shareAssessed??0)+tenancyRentAmount(t,(r.harvestedQty??0)+amount,r.inputs??[])-past,advance=terms.prepayment??0;
   const owed=Math.max(0,predicted-advance)-Math.max(0,(lease.shareAssessed??0)-advance);
   if(landlord){if(owed)future.push({id:lease.id,resource:t.rentPayment==='kind'?r.crop:COIN,amount:owed,at:Math.max(at,terms.rentDueAt??at),day:Math.max(at,terms.rentDueAt??at)/DAY,source:'harvest-rent',reliable:false});continue;}
   if(t.rentPayment==='kind')disposable=Math.max(0,amount-owed);
   else if(owed)payments.push({id:lease.id,resource:COIN,amount:owed,at:Math.max(at,terms.rentDueAt??at),day:Math.max(at,terms.rentDueAt??at)/DAY,source:'harvest-rent',reliable:false});
  }
  future.push({id:r.id,resource:r.crop,amount:disposable,at,day:at/DAY,source:'harvest',reliable:false});
 }
 return {future:future.sort((a,b)=>a.at-b.at),payments:payments.sort((a,b)=>a.at-b.at)};
}

// Default is the actor's knowledge. Kernel consumers must opt in explicitly.
export function householdBudget(d,engine,owner,{kernel=false,view=null,risk=0,commonRisk=0,creditCoverage=0}={}){
 const state=d.get('state'),document=d.document??{state};
 if(!kernel)view??=subjectiveView(engine,document,owner);
 if(view&&view.observer!==owner)throw Error('Household budget observer mismatch');
 const cash=view?(view.self.accounts?.[purse(engine,owner)]?.balance??view.self.coins):coinRead(d,{point:'assets.cash',account:purse(engine,owner),legacy:()=>actor(state,owner)?.coins??0});
 const {future,payments}=futureSources(d,engine,owner,view),reliable=future.find(r=>r.reliable),next=reliable??future.find(r=>r.source==='harvest'),until=next?.at??state.minute+engine.world.marketRules.personalReserveDays*DAY;
 const incomeRisk=future.length?future.filter(r=>!r.reliable).length/future.length:0;
 const purchasable=cash>0&&commonRisk<1?foodSources(d,engine,owner,{view}).filter(r=>r.at>=state.minute&&Math.floor(r.quantity*Math.max(0,1-commonRisk))>0&&r.unitPrice>0&&r.unitPrice<=cash-payments.filter(p=>p.resource===COIN&&p.at<=r.at).reduce((n,p)=>n+p.amount,0)):[];
 const foodDays=purchasable.length?Math.max(0,(Math.min(...purchasable.map(r=>r.at))-state.minute)/DAY):null;
 const target=householdBufferTarget(d,engine,owner,{incomeDays:(until-state.minute)/DAY,risk:risk+incomeRisk,commonRisk,creditCoverage,foodDays});
 const resources=householdResources(d,engine,owner,{days:target.days,view,risk,commonRisk});
 // Simultaneous contractual receipts precede payments in this projection;
 // nothing is spendable now until its actual transfer has occurred.
 const times=[...new Set([...future,...payments].filter(r=>r.resource===COIN&&r.at<=until).map(r=>r.at))].sort((a,b)=>a-b);
 let balance=cash,gap=0;const timeline=[];
 const net=at=>future.filter(r=>r.resource===COIN&&r.reliable&&r.at===at).reduce((n,r)=>n+r.amount,0)-payments.filter(r=>r.resource===COIN&&r.at===at).reduce((n,r)=>n+r.amount,0);
 for(const at of times){balance+=net(at);gap=Math.max(gap,-balance);timeline.push({at,balance,shortfall:Math.max(0,-balance)});}
 // Hypothetical purchases are a separate scenario, not new obligations or
 // already-spent cash. K09 can compare its gap with the contractual timeline.
 const foodPlan=resources.market.purchases.filter(r=>r.at<=until),foodTimeline=[];
 let plannedBalance=cash,plannedCashShortfall=0;
 for(const at of [...new Set([...times,...foodPlan.map(r=>r.at)])].sort((a,b)=>a-b)){
  const plannedFood=foodPlan.filter(r=>r.at===at).reduce((n,r)=>n+r.cost,0);
  plannedBalance+=net(at)-plannedFood;plannedCashShortfall=Math.max(plannedCashShortfall,-plannedBalance);
  foodTimeline.push({at,balance:plannedBalance,plannedFood,shortfall:Math.max(0,-plannedBalance)});
 }
 return {owner,scope:view?'subjective':'kernel',cash,future,payments,until,nextReliableIncome:reliable??null,horizonSource:next?.id??'short-window-fallback',target,resources,timeline,cashShortfall:gap,foodTimeline,plannedCashShortfall,expectations:view?view.knowledge.facts:{},mutualAidAvailable:0};
}

// K08/K09 get marginal physical/cash budgets, not permission to execute a
// transfer. Raising money remains a request until consent AND actual payment.
export function householdMarginalBudget(budget,{operation,item,quantity=1,unitPrice=0,totalCoins=null,fundingOffer=null}={}){
 if(!Number.isSafeInteger(quantity)||quantity<0||!Number.isFinite(unitPrice)||unitPrice<0||totalCoins!==null&&(!Number.isSafeInteger(totalCoins)||totalCoins<0))throw Error('Invalid marginal budget');
 const price=fixedUnits(unitPrice),cost=totalCoins??fixedInteger(price*BigInt(quantity));
 const own=budget.resources.rows.filter(r=>r.holder===budget.owner&&r.item===item),available=own.reduce((n,r)=>n+r.available,0);
 const consumptionMaximum=own.filter(r=>r.consumable).reduce((n,r)=>n+Math.max(0,r.stock-r.seed-r.committed-r.inUse),0);
 if(!Number.isSafeInteger(cost))throw Error('Invalid marginal budget total');
 if(operation==='sell')return {operation,item,quantity,feasible:quantity<=available,cashDelta:cost,stockDelta:-quantity,maximum:available};
 if(operation==='consume')return {operation,item,quantity,feasible:quantity<=consumptionMaximum,cashDelta:0,stockDelta:-quantity,maximum:consumptionMaximum};
 if(operation==='retain')return {operation,item,quantity,feasible:quantity<=available,cashDelta:0,stockDelta:0,maximum:available};
 if(operation==='buy')return {operation,item,quantity,feasible:cost<=budget.cash,cashDelta:-cost,stockDelta:quantity,maximum:price>0n&&totalCoins===null?Number(BigInt(budget.cash)*FIXED_SCALE/price):null};
 if(operation==='raise'){
  // K09 supplies a quote visible to this actor. Feasibility is conditional
  // on that offer, not proof of consent or permission over the lender's purse.
  const neededAt=budget.timeline.find(r=>r.shortfall>0)?.at??budget.until;
  const timely=Number.isFinite(fundingOffer?.at)&&fundingOffer.at<=neededAt;
  const maximum=timely&&Number.isSafeInteger(fundingOffer?.amount)&&fundingOffer.amount>=0?fundingOffer.amount:0;
  const feasible=quantity>0&&quantity<=maximum;
  return {operation,quantity,feasible,conditional:true,source:fundingOffer?.id??null,at:fundingOffer?.at??null,requires:['consent','transfer'],cashDelta:0,conditionalCashDelta:feasible?quantity:0,stockDelta:0,maximum};
 }
 throw Error('Unknown household operation');
}
export function householdOptions(budget,{item,quantity=1,unitPrice=0,totalCoins=null,fundingOffer=null}={}){
 return ['consume','sell','retain','buy','raise'].map(operation=>householdMarginalBudget(budget,{operation,item,quantity,unitPrice,totalCoins,fundingOffer}));
}

// Cash, meals and the household's retained time remain separate facts. A meal
// offer is only a possible benefit here; settlement still transfers real stock.
export function householdLaborBudget(d,engine,owner,{minute=d.get('state','minute'),wage=0,workMinutes=480,commuteMinutes=0,travelCost=0,outsideWage=0,meals=[],employer=null,seed=d.document?.randomSeed,decisionKey='employment',kernel=false,view=null}={}){
 const state=d.get('state'),time=householdWorkTime(engine,state,owner,minute,{workMinutes,commuteMinutes});
 const config=engine.world.primitiveTables?.yields?.params?.find(r=>r.id==='labor.choice')?.value;
 const draw=(expression,rule,date,object=owner)=>evaluateRX(expression,{}, {rollKey:{seed,pack:'household',rule,object,date}});
 const preference=draw(laborPreferenceRoll,'persistent-reservation',0);
 const percent=config?config.reservationLowPercent+Math.floor((config.reservationHighPercent-config.reservationLowPercent)*(preference-1)/19):100;
 const noise=config?Math.trunc((draw(laborNoiseRoll,'labor-choice',minute,`${owner}:${decisionKey}`)*2-21)*config.noisePercent/19):0;
 if(!kernel)view??=subjectiveView(engine,d.document??{state},owner);
 const resources=householdResources(d,engine,owner,{days:1,marketSubstitution:false,view});
 const foodMissing=resources.procurementShortfall.satiety>0;
 const food=[],allocated=new Map();let remaining=resources.procurementShortfall.satiety;
 for(const meal of meals){
  const nutrition=engine.byId.get(meal.item)?.nutrition?.satiety??0;
  if(!employer||nutrition<=0||!Number.isSafeInteger(meal.quantity)||meal.quantity<=0)continue;
  // Advertised meals are a promise, not knowledge of the employer's purse or
  // pantry. The kernel checks and transfers the actual stock at settlement.
  const stock=kernel?bagStock(d,engine,{point:'labor.stock',id:employer,item:meal.item,legacy:()=>qty(inventory(state,employer)[meal.item])}):meal.quantity;
  const quantity=Math.min(Math.floor(meal.quantity*time.workMinutes/480),Math.max(0,stock-(allocated.get(meal.item)??0)),Math.ceil(Math.max(0,remaining)/nutrition));
  if(!quantity)continue;
  const unitPrice=engine.byId.get(meal.item)?.basePrice??0;
  allocated.set(meal.item,(allocated.get(meal.item)??0)+quantity);
  food.push({item:meal.item,quantity,nutrition:quantity*nutrition,value:quantity*unitPrice});remaining-=quantity*nutrition;
 }
 const cash=Math.ceil(wage*time.workMinutes/480),foodValue=food.reduce((n,r)=>n+r.value,0);
 const alternative=Math.ceil(outsideWage*time.workMinutes/480),commuteCost=Math.ceil(outsideWage*time.commuteMinutes/480)+travelCost;
 const reservation=Math.ceil(alternative*percent/100)+commuteCost;
 const noiseValue=Math.trunc(Math.max(alternative,cash)*noise/100);
 return {time,cash,food,foodValue,foodMissing,alternative,commuteCost,reservation,preferencePercent:percent,noisePercent:noise,noiseValue,net:cash+foodValue-reservation+noiseValue,feasible:time.workMinutes>0&&!time.unattended};
}
