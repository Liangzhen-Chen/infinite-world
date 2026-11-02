// TOWNINC §1/3: work consumes time and finite inputs; an occupation earns nothing.
import {householdWorkTime} from './npc-state.mjs';
import {currentEmployment} from './employment-state.mjs';
import {townLaborMinutes} from './town-income.mjs';
import {statisticalFoodAccount,statisticalFoodEngine} from './household-budget.mjs';
import {employmentProductionPlan,settleEmploymentProduction} from './finance-assets.mjs';
import {preconditionFailure} from './precondition.mjs';
import {personConstraint,placeSettlement} from './entity-view.mjs';
import {currentShops} from './shop.mjs';
import {recordsWhere} from './storage.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';

const DAY=1440,key=id=>`town-work:${id}`;
const read=(state,id)=>statisticalFoodAccount(state,id)?.labor??state.records?.[key(id)];

// One current-day receipt book, shared by production, services and chores.
// Wages have their own accounting; a work receipt is never spendable money.
export function townWorkMinutes(e,state,id,minute=state.minute,{commuteMinutes=0}={}){
 const group=statisticalFoodAccount(state,id),day=Math.floor(minute/DAY),book=read(state,id);
 const used=book?.workDay===day?book.usedMinutes??0:0;
 if(group){
  return Math.max(0,group.workCapacity-used);
 }
 const own=state.npcs?.[id],person=state.created?.[id]??e.byId.get(id);
 if(!own||own.levy||own.caring||own.scheduleTravel||own.cognitionTravel||personConstraint(e,state,id,minute))return 0;
 const time=householdWorkTime(e,state,id,minute,{commuteMinutes,workMinutes:townLaborMinutes(e,person,own)});
 const job=currentEmployment(state,id,minute);
 // Signed attendance already owns these windows, even before payday.
 if(job&&job.status!=='罢工'&&minute>=job.starts)return 0;
 let employed=0;
 for(const row of recordsWhere(state.records,'kind','workshop'))if(row.worker===id){
  const minutes=row.attendance?.[String(day)]??(row.shifts??[]).filter(r=>!r.aggregate&&Math.floor((r.start??r.minute)/DAY)===day).reduce((n,r)=>n+r.minutes,0);
  employed+=minutes+(minutes?2*(row.commuteMinutes??0):0);
 }
 return Math.max(0,time.workMinutes-used-employed);
}

export function recordTownWork(d,e,{worker,minute=d.get('state','minute'),minutes,kind,source,commuteMinutes=0}){
 if(!['employment','self','service','cooking','commute'].includes(kind)||!source||!Number.isSafeInteger(minutes)||minutes<0)throw preconditionFailure('工作必须有来源和非负整数工时');
 const state=d.get('state'),day=Math.floor(minute/DAY),group=statisticalFoodAccount(state,worker),old=read(state,worker)??{};
 if((old.workDay??-1)>day)throw preconditionFailure('不能回头占用已结算的工作日');
 const receipts=old.workDay===day?old.workReceipts??{}:{},previous=receipts[source];
 if(previous){if(previous.minutes!==minutes||previous.kind!==kind)throw preconditionFailure('同一工作来源不能改写完成量');return previous;}
 if(minutes>townWorkMinutes(e,state,worker,minute,{commuteMinutes}))throw preconditionFailure('当天可用工时不足');
 const receipt={source,kind,minutes,day};
 const totals={...old.sources,[kind]:(old.sources?.[kind]??0)+minutes};
 const next={...old,workDay:day,usedMinutes:(old.workDay===day?old.usedMinutes??0:0)+minutes,workReceipts:{...receipts,[source]:receipt},sources:totals};
 d.set(group?['state','records',worker,'labor']:['state','records',key(worker)],group?next:{...next,category:'town_work',owner:worker});
 return receipt;
}

// I3's shop/market callers use this before the existing K08 sale. The output
// stays in the material owner's bag; no wage, revenue or profit is invented.
export function produceTownWork(d,e,{worker,recipe,location,minutes=480,maximum=Infinity,minute=d.get('state','minute'),source}){
 const state=d.get('state'),group=statisticalFoodAccount(state,worker),scoped=group?statisticalFoodEngine(e,state):e;
 if(group&&placeSettlement(e,state,location).value!==group.settlement)return {reason:'工位不在本聚落'};
 const id=source??`self:${worker}:${recipe}:${minute}`,book=read(state,worker);
 const previous=book?.workDay===Math.floor(minute/DAY)?book.workReceipts?.[id]:null;
 if(previous)return previous.production;
 const definition=e.byId.get(recipe),own=group??state.npcs?.[worker];
 if(!definition)return {reason:'配方已不存在'};
 if(definition.learningRequired&&!definition.teachers?.includes(worker)&&!own?.recipes?.[recipe]&&!currentWorkstationRecipes(e,state,worker).some(r=>r.id===recipe))return {reason:'尚未学会配方'};
 let commuteMinutes=0;
 if(!group&&own?.location!==location){
  try{commuteMinutes=e.route(own?.location,location,'walk',minute,d.document.randomSeed).minutes;}catch{return {reason:'无法到达工位'};}
  // Paid travel needs I3's real trip; production cannot silently pay a toll.
  return {reason:'尚未到岗'};
 }
 const available=Math.min(minutes,townWorkMinutes(e,state,worker,minute,{commuteMinutes}));
 const row={id,owner:worker,worker,recipe,location};
 const plan=employmentProductionPlan(d,scoped,row,{minutes:available,maximum});
 if(plan.reason)return plan;
 const spent=Math.ceil(plan.batches*plan.recipe.minutes/(1+plan.skill/3000));
 recordTownWork(d,e,{worker,minute,minutes:spent,kind:'self',source:id,commuteMinutes});
 const production=settleEmploymentProduction(d,scoped,row,minute,plan);
 const path=group?['state','records',worker,'labor','workReceipts',id]:['state','records',key(worker),'workReceipts',id];
 d.set([...path,'production'],production);
 return production;
}

// Demand is read from real contracts and live restocking policies, never from
// a livelihood label. I3 may use the same list when arranging a sale/trip.
export function townProductionDemand(e,state,minute=state.minute){
 const out=[];
 for(const shop of currentShops(e,state))for(const stock of shop.restock){
  const value=state.npcs?.[shop.keeper]?.inventory?.[stock.item],held=typeof value==='number'?value:value?.quantity??0;
  if(stock.maximum>held)out.push({owner:shop.keeper,location:shop.location,item:stock.item,quantity:stock.maximum-held,source:`shop:${shop.id}:${stock.item}`});
 }
 for(const order of recordsWhere(state.records,'category','contract'))if(['order','procurement'].includes(order.kind)&&['待履行','履行中','有效'].includes(order.status)&&order.deadline>minute){
  const owner=order.parties?.[1]??order.owner,value=state.npcs?.[owner]?.inventory?.[order.subject]??state.records?.[owner]?.inventory?.[order.subject];
  const quantity=order.quantity-(order.fulfilled??0)-(typeof value==='number'?value:value?.quantity??0);
  if(quantity>0)out.push({owner,location:order.location??state.npcs?.[owner]?.location,item:order.subject,quantity,source:order.id});
 }
 return out;
}

