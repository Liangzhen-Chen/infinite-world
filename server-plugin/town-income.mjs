// TOWNINC §2/3: opening assets are facts, not an income or survival target.
import {digest,stateMemo} from './storage.mjs';
import {purse} from './money.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {syncObligationClaims} from './transition.mjs';
import attributeBalance from '../world/rules/tables/balance/attributes.json' with {type:'json'};
import {registerAdvanceHook} from './advance-hooks.mjs';
import {fraction,addAccrual} from './obligation-calendar.mjs';

registerAdvanceHook('townIncomeGenesis',initializeTownIncome);

let populationHomes=()=>[];
export function registerTownPopulationHomes(resolve){populationHomes=resolve;}
export const townGroupId=(sid,key='unknown')=>`food-demand:${sid}${key==='unknown'?'':`:${key}`}`;
const quantity=v=>typeof v==='number'?v:v?.quantity??0;
const seedOrder=(seed,id)=>digest([seed,id]);

// Integer largest remainders: the seed only breaks equal fractional claims.
export function allocateTownAssets(total,rows,seed){
 if(!Number.isSafeInteger(total)||total<0||rows.some(r=>typeof r.weight==='bigint'?r.weight<0n:!Number.isSafeInteger(r.weight)||r.weight<0))throw Error('Invalid town asset allocation');
 const sum=rows.reduce((n,r)=>n+BigInt(r.weight),0n),out=Object.fromEntries(rows.map(r=>[r.id,0]));
 if(!sum){if(total)throw Error('Town assets have no registered beneficiary weights');return out;}
 const parts=rows.map(r=>{const n=BigInt(total)*BigInt(r.weight);out[r.id]=Number(n/sum);return {...r,remainder:n%sum,order:seedOrder(seed,r.id)};});
 let left=total-Object.values(out).reduce((n,v)=>n+v,0);
 parts.sort((a,b)=>a.remainder===b.remainder?a.order.localeCompare(b.order):a.remainder>b.remainder?-1:1);
 for(const r of parts){if(!left)break;out[r.id]++;left--;}
 return out;
}

// §3; adulthood is necessary, but does not establish physical ability. The
// same calibrated age/body decline as npc-life supplies the reduced budget.
export function townLaborMinutes(engine,person,own={}){
 const age=person?.age;if(!Number.isFinite(age)||age<engine.rules.npcLife.adultAge)return 0;
 if(own.illness?.severity==='重'||['死亡','重伤','昏迷','濒死','重病'].includes(own.status??person.status))return 0;
 const rates=(engine.world.balance?.attributes??attributeBalance).params.find(r=>r.id==='attr.aging').value;
 const base=person.attributes?.['体质']??10,physical=own.attributes?.['体质']??Math.max(1,base-Math.max(0,age-(rates?.bodyFromYear??age))*(rates?.bodyPerYear??0));
 if(base<=0||physical<=0||own.body?.hp===0)return 0;
 return Math.floor(480*Math.min(1,physical/base));
}
export function statisticalLaborMinutes(engine,state,account){
 const payDay=Math.floor(state.minute/1440),used=account.labor?.payDay===payDay?Object.values(account.labor.receipts??{}).reduce((n,r)=>n+r.minutes,0):0;
 return Math.max(0,(account.workCapacity??0)-used);
}
const groupCache=new WeakMap(),definitionCache=new WeakMap();
export function townHouseholds(engine,sid){
 let all=groupCache.get(engine);if(!all)groupCache.set(engine,all=new Map());
 if(all.has(sid))return all.get(sid);
 const facts=engine.world.townIncome?.settlements?.find(r=>r.settlement===sid),classes=new Map((facts?.assetClasses??[]).map(r=>[r.id,r]));
 const authored=new Map((facts?.households??[]).map(r=>[r.household,r]));
 const people=new Map([...(engine.world.residents??[]),...engine.world.npcs].map(p=>[p.id,p]));
 const registered=(engine.world.households??[]).filter(h=>h.settlement===sid).map(h=>({...h,members:h.members.map(id=>people.get(id)??{id}),pending:false}));
 const pending=populationHomes(engine,sid).map(h=>({...h,pending:true}));
 const rows=[...registered,...pending].map(h=>{
  const fact=authored.get(h.id),asset=classes.get(fact?.assetClass),work=h.members.reduce((n,p)=>n+townLaborMinutes(engine,p),0);
  const ability=work===0?'none':work===h.members.filter(p=>p.age>=engine.rules.npcLife.adultAge).length*480?'full':'reduced';
  const livelihood=fact?.livelihood??'unregistered',assetClass=asset?.id??'unregistered';
  return {...h,workCapacity:work,livelihood,assetClass,ability,weightKnown:(fact?.weight?.value??asset?.weight?.value)!=null,weight:fact?.weight?.value??asset?.weight?.value??0,
   group:`${livelihood}~${assetClass}~${ability}`,owner:h.members[0]?.id};
 });
 all.set(sid,rows);return rows;
}
export function townGroupDefinitions(engine,sid){
 let cache=definitionCache.get(engine);if(!cache)definitionCache.set(engine,cache=new Map());
 if(cache.has(sid))return cache.get(sid);
 const groups=new Map();
 for(const h of townHouseholds(engine,sid).filter(h=>h.pending)){
  let row=groups.get(h.group);if(!row)groups.set(h.group,row={key:h.group,livelihood:h.livelihood,assetClass:h.assetClass,ability:h.ability,population:0,workCapacity:0,shares:{}});
  row.shares[h.id]={weight:h.members.length,workCapacity:h.workCapacity};row.population+=h.members.length;row.workCapacity+=h.workCapacity;
 }
 // Keep the established account ID for one real group; it is not a town pool.
 const definitions=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key)).map((r,i)=>({...r,id:townGroupId(sid,i?r.key:'unknown')}));
 cache.set(sid,definitions);return definitions;
}
export function newTownGroup(engine,sid,definition,minute){
 return {category:'money_account',statisticalPopulation:true,owner:definition.id,settlement:sid,account:purse(null,definition.id),purpose:'purse',
  group:definition.key,livelihood:definition.livelihood,assetClass:definition.assetClass,ability:definition.ability,
  shares:structuredClone(definition.shares),workCapacity:definition.workCapacity,
  beneficiaryUnits:definition.population,coins:0,inventory:{},arrears:0,
  incomeIndex:{earned:{numerator:'0',denominator:'1'},paid:{numerator:'0',denominator:'1'}},indexBasis:{earned:0,paid:0},settledAt:minute,
  mealDay:-1,demandSatiety:0,missingSatiety:0,consumedSatiety:0,labor:{day:-1,minutes:0,earned:0,paid:0,wageUnits:0}};
}
export function townGrainBalance(row){
 const keys=['area','historicalYield','seasonFactor','seed','eaten','rentTax','loss'];
 if(keys.some(k=>row[k]?.value===null||row[k]?.value===undefined))return null;
 const v=Object.fromEntries(keys.map(k=>[k,row[k].value]));
 const harvested=Math.floor(v.area*v.historicalYield*v.seasonFactor);
 const balance=harvested-v.seed-v.eaten-v.rentTax-v.loss;
 if(balance<0)throw Error('Opening grain deductions exceed the historical harvest');return balance;
}
export function initializeTownIncome(engine,document){
 if(document.state.records?.['town-income:genesis']||!engine.world.townIncome)return document;
 // This is called only by createCharacter, before the existing ledger opener.
 const doc=structuredClone(document),s=doc.state,openings=[];
 for(const profile of engine.world.settlementProfiles??[]){
  const sid=profile.id;if(!s.settlements?.[sid])continue;
  const homes=townHouseholds(engine,sid),facts=engine.world.townIncome.settlements.find(r=>r.settlement===sid),defs=townGroupDefinitions(engine,sid);
  for(const def of defs)s.records[def.id]=newTownGroup(engine,sid,def,s.minute);
  const groups=new Map(defs.map(r=>[r.key,r.id]));
  // A roster person's authored property remains in that person's account,
  // even before an actor exists. It is not household redistribution capital.
  for(const h of homes.filter(h=>!h.pending))for(const p of h.members)if(!s.npcs[p.id]&&((p.coins??0)>0||Object.keys(p.inventory??{}).length))
   s.records[`town-opening:${p.id}`]={category:'money_account',owner:p.id,account:purse(null,p.id),purpose:'purse',settlement:sid,
    townOpeningPerson:p.id,coins:p.coins??0,inventory:structuredClone(p.inventory??{})};
  const existing=homes.reduce((n,h)=>n+h.members.reduce((n,p)=>n+(s.npcs[p.id]?.coins??p.coins??0),0),0);
  // Public money is part of finite regional M, but is never private income.
  const reserved=s.settlements[sid].treasury??0,total=facts?.money?.value,weights=homes.map(h=>({id:h.id,weight:h.weight}));
  if(total!==null&&total!==undefined&&total<existing+reserved)throw Error('Opening money is less than existing private and public cash');
  if(total>existing+reserved&&homes.some(h=>!h.weightKnown))throw Error('Opening money requires sourced weights for every household');
  const distributed=total===null||total===undefined?Object.fromEntries(homes.map(h=>[h.id,0])):allocateTownAssets(total-existing-reserved,weights,profile.populationSeed??sid);
  const credit=(h,item,n)=>{
   if(!n)return;
   const reserve=h.id;
   if(!h.pending&&!s.npcs[h.owner]&&!s.records[reserve])s.records[reserve]={category:'money_account',owner:reserve,account:purse(null,reserve),purpose:'purse',townOpeningHousehold:h.id,members:h.members.map(p=>p.id),coins:0,inventory:{}};
   const target=h.pending?s.records[groups.get(h.group)]:s.npcs[h.owner]??s.records[reserve];
   if(!target)throw Error(`Opening household owner is absent: ${h.id}`);
   if(item){const old=target.inventory[item];target.inventory[item]={...(typeof old==='object'?old:{}),quantity:quantity(old)+n};}
   else target.coins=(target.coins??0)+n;
  };
  for(const h of homes){credit(h,null,distributed[h.id]);if(h.pending)s.records[groups.get(h.group)].shares[h.id].openingCoins=distributed[h.id];}
  const inventory=[],grainTotals=new Map();
  for(const lot of facts?.grain??[]){const n=townGrainBalance(lot),old=grainTotals.get(lot.item)??0;grainTotals.set(lot.item,n===null||old===null?null:old+n);}
  for(const [item,total]of grainTotals){
   if(total===null)continue;
   const existingStock=homes.reduce((n,h)=>n+h.members.reduce((m,p)=>m+quantity(s.npcs[p.id]?.inventory?.[item]??p.inventory?.[item]),0),0);
   if(total<existingStock)throw Error('Historical grain balance is less than existing private inventory');
   const portions=allocateTownAssets(total-existingStock,weights,`${profile.populationSeed}:${item}`);
   for(const h of homes){credit(h,item,portions[h.id]);if(h.pending){const share=s.records[groups.get(h.group)].shares[h.id];share.openingInventory={...share.openingInventory,[item]:portions[h.id]};}}
   inventory.push({item,existing:existingStock,total});
  }
  openings.push({settlement:sid,existingCoins:existing,reservedCoins:reserved,registeredMoney:total??null,distributedCoins:Object.values(distributed).reduce((n,v)=>n+v,0),inventory});
 }
 s.records['town-income:genesis']={category:'town_income',source:'src:genesis',minute:s.minute,openings};return doc;
}

export function townShareAmount(row,house,amount,seed,asset=null){
 const shares=Object.entries(row.shares),initial=s=>asset==='coins'?s.openingCoins??0:s.openingInventory?.[asset]??0;
 if(!asset)return allocateTownAssets(amount,shares.map(([id,s])=>({id,weight:s.weight})),seed)[house]??0;
 // The opening Hamilton remainder belongs to its original household. Only
 // subsequent common income/expense is shared; pooling must not erase that
 // integer property right. Zero claims bound losses when the pool runs out.
 const opening=shares.reduce((n,[,s])=>n+initial(s),0),units=BigInt(row.beneficiaryUnits),delta=BigInt(amount-opening);
 const weights=shares.map(([id,s])=>{const claim=BigInt(initial(s))*units+delta*BigInt(s.weight);return {id,weight:claim>0n?claim:0n};});
 return allocateTownAssets(amount,weights,seed)[house]??0;
}
// Only earned claims are divided, never reissued as cash. Canonical debt and
// its legacy projection stay linked and retain the same summed principal.
export function transferTownClaims(d,engine,group,house,owner){
 const claims=[];
 for(const row of obligationRows(d.get('state'))){
  if(![row.creditor,row.debtor].includes(group.owner)||obligationView(d.get('state'),row).closed)continue;
  const units=group.shares[house].weight,total=group.beneficiaryUnits;
  const take=n=>Number(BigInt(n)*BigInt(units)/BigInt(total)),part={...row,id:`${row.id}:house:${house}`},rest={...row};
  for(const k of ['amount','coins','paid','remaining','accrualSettled'])if(Number.isSafeInteger(row[k])){part[k]=take(row[k]);rest[k]=row[k]-part[k];}
  if(row.creditor===group.owner)part.creditor=owner;if(row.debtor===group.owner)part.debtor=owner;
  if(row.promisee===group.owner)part.promisee=owner;if(row.promisor===group.owner)part.promisor=owner;
  if(row.legacyRecord){part.originalLegacyRecord=row.legacyRecord;part.legacyRecord=`${row.legacyRecord}:house:${house}`;}
  if(row.terms?.accrual){
   part.accrualAllocation={...(row.accrualAllocation?{previous:row.accrualAllocation}:{}),units,total,taken:true};
   rest.accrualAllocation={...(row.accrualAllocation?{previous:row.accrualAllocation}:{}),units,total,taken:false};
  }
  if(row.terms?.liabilityCap!==undefined){part.terms={...part.terms,liabilityCap:take(row.terms.liabilityCap)};rest.terms={...rest.terms,liabilityCap:row.terms.liabilityCap-part.terms.liabilityCap};}
  part.materializedFrom=row.id;
  d.set(['state','obligations',row.id],rest);d.set(['state','obligations',part.id],part);claims.push(part.id);
 }
 if(claims.length)syncObligationClaims(d,engine);return claims;
}

const arrearsMemo=Symbol('town wage arrears'),arrearsInputs=[['obligations'],{path:['records'],categories:['debt']}];
export function settleTownGroup(d,engine,id){
 const row=d.get('state','records',id);if(!row?.statisticalPopulation)return row;
 const earned=row.labor?.earned??0,paid=row.labor?.paid??0;
 const state=d.get('state'),byCreditor=stateMemo(state,engine,[arrearsMemo,state.minute],()=>{
  const sums=new Map();for(const r of obligationRows(state))if(r.kind==='wage')sums.set(r.creditor,(sums.get(r.creditor)??0)+obligationView(state,r).owed);return sums;
 },arrearsInputs),arrears=byCreditor.get(id)??0;
 const increment=(prior,delta)=>{
  if(!delta||!row.beneficiaryUnits)return prior;
  const value=addAccrual(fraction(BigInt(prior.numerator),BigInt(prior.denominator)),fraction(BigInt(delta),BigInt(row.beneficiaryUnits)));
  return {numerator:String(value.numerator),denominator:String(value.denominator)};
 };
 const index={earned:increment(row.incomeIndex.earned,earned-row.indexBasis.earned),paid:increment(row.incomeIndex.paid,paid-row.indexBasis.paid)};
 if(row.settledAt!==state.minute)d.set(['state','records',id,'settledAt'],state.minute);
 if(row.arrears!==arrears)d.set(['state','records',id,'arrears'],arrears);
 if(row.indexBasis.earned!==earned||row.indexBasis.paid!==paid){
  d.set(['state','records',id,'incomeIndex'],index);d.set(['state','records',id,'indexBasis'],{earned,paid});
 }
 return d.get('state','records',id);
}
