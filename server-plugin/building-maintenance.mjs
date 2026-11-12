// Owner maintenance is an NPC action, not free healing in the facility clock.
// Use the same material/work specification, project stock and completion hook
// as player repairs. Existing autonomous trade buys genuinely available stock.
import {documentReader} from './read-scope.mjs';
import {registerAutonomyProvider,registerAutonomyKind} from './autonomy-candidates.mjs';
import {facilityView,facilityRepairMaterials,facilityRuntime,installFacilityRuntime,facilityDefinition,facilityWearScale,facilityWearRemainder} from './facility-state.mjs';
import {currentControllers} from './action-authority.mjs';
import {stateReader,goodsWorth} from './valuation.mjs';
import {changeItems} from './items.mjs';
import {BOOKED,holdWorks,settleWorks} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {preconditionFailure} from './precondition.mjs';
import {laborValue,subjectiveMarketQuote,saleableStock,assertMarketDepth,recordMarketDeal} from './market.mjs';
import {rollDice,clockDiceKey} from './scheduler.mjs';
import {weatherAt} from './weather.mjs';
import {safeCarryKg,carriedKg,packItemKg} from './carry.mjs';
import {coinRead,treasury,purse,sink,moveCoins,mirrorPartyCoins} from './money.mjs';
import {priceRead,settlementStock} from './stock.mjs';
import {currentEmployment,projectAssignment} from './employment-state.mjs';
import {npcHousehold,npcAgeAt,householdWorkTime} from './npc-state.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {householdBudget,householdCash,householdPoolTopUp} from './household-budget.mjs';
import {npcDecision} from './npc-decision.mjs';
import {transferItems} from './items.mjs';
import {npcProficiency} from './checks.mjs';
import {assertLocationAccess} from './location-access.mjs';
import {canAct} from './action-capacity.mjs';
import {actionCostRule} from './action-costs.mjs';

declareLedgerWriter('building-maintenance',{sinks:['sink:consume','sink:export']});
const writer='building-maintenance',MINUTES=240;
const key=(who,building)=>`owner_repair:${who}:${building}`;
function owns(engine,document,who,building){return currentControllers({engine,document},building,{ownerOnly:true,principals:true}).includes(who);}
function pending(state,who,building){return Object.values(state.projects??{}).find(p=>p.type==='业主修缮'&&p.creator===who&&p.building===building&&p.status==='施工中')??null;}
function materials(view){const m=facilityRepairMaterials(view);return {wood:m.wood,stone:m.stone,requiredMinutes:m.work*480};}
// Even the worst registered weather cannot cross the full-service threshold
// within this horizon. Both paths then have factorUnits=2 on every compared
// day: avoidedLoss=0. Materials, purchase quotes and labor are nonnegative,
// so neither repair nor procurement can have positive utility. This is only
// an empty-candidate proof; other providers still run whenever one is relevant.
function noServiceLoss(e,state,building,view){
 const {rule,denominator,numerator}=facilityWearScale(e);
 const horizon=e.rules.facilities.maintenance.horizonDays??e.rules.calendar.daysPerMonth;
 const wear=((rule?.material[view.material]??(view.material==='stone'?1:3))+(rule?.occupied??1)+Math.max(0,...Object.values(rule?.weather??{})))*numerator;
 const remainder=facilityWearRemainder(state.buildings?.[building]??{},denominator);
 return view.condition>=60&&wear>=0&&view.condition-Math.floor((remainder+Math.max(0,horizon-1)*wear)/denominator)>=60;
}
const items=p=>[['item_wood',p.wood],['item_stone',p.stone]];
const reader=documentReader;
const scheduleAt=(...args)=>facilityRuntime().scheduleAt(...args);
const serviceMinutes=e=>actionCostRule(e,'trade.retail').timeMin;
const trades=n=>(n?.serviceCatalog??[]).some(s=>s.kind==='trade'&&s.price?.mode==='engineQuote');
function shortfall(e,document,who,inputs){
 const totals=new Map();for(const [item,n]of inputs)totals.set(item,(totals.get(item)??0)+n);
 return [...totals].map(([item,n])=>({item,quantity:Math.max(0,n-e.quantity(stateReader(document.state),who,item))})).filter(r=>r.quantity>0);
}
// Knowing a market or an acquaintance's public workplace permits a visit,
// never a read of their present purse, stock, private orders or whereabouts.
function knownSuppliers(e,view){
 const places=new Map([[view.self.location,'present']]),people=new Map(view.observable.people.map(p=>[p.id,'present']));
 for(const m of view.knowledge.memories){
  if(m.retracted)continue;
  const source=m.sourceEvent??m.id??m.proposition??m.key;if(!source)continue;
  if(m.location)places.set(m.location,source);
  if(m.value?.location)places.set(m.value.location,source);
  if(m.seller??m.value?.seller)people.set(m.seller??m.value.seller,source);
  for(const id of m.participants??[])people.set(id,source);
  const match=/^market:(.+):item_[^:]+$/.exec(m.proposition??m.key??'');if(match)places.set(match[1],source);
 }
 for(const id of Object.keys(view.self.relations))people.set(id,`acquaintance:${id}`);
 return e.world.npcs.filter(n=>n.id!==view.observer&&trades(n)).flatMap(n=>{
  const locations=new Set([n.workplace?.location,...(n.schedule?.default??[]).filter(s=>s.services?.includes('trade')).map(s=>s.location)].filter(Boolean));
  if(view.observable.people.some(p=>p.id===n.id))locations.add(view.self.location);
  return [...locations].filter(location=>(places.has(location)||people.has(n.id))&&(location!==view.self.location||view.observable.people.some(p=>p.id===n.id))).map(location=>({seller:n.id,location,knownFrom:people.get(n.id)??places.get(location)}));
 });
}
function route(e,document,from,to,at){
 try{return from===to?{minutes:0,cost:0,edges:[]}:e.route(from,to,'walk',at,document.randomSeed);}
 catch{throw preconditionFailure('没有可达筹料路线');}
}
function spendable(e,document,who,view){
 const budget=householdBudget(reader(document),e,who,{view});
 return Math.max(0,Math.min(view.self.coins,budget.cash,...budget.timeline.map(r=>r.balance))-budget.resources.market.spent);
}
function procurement(e,document,view,{purpose,inputs,benefit,cost,delayPermille=0,noisePermille=0,steps=[]}){
 const who=view.observer,missing=shortfall(e,document,who,inputs),out=[],blocked=new Set();
 if(!missing.length)return {candidates:out,missing,blocked:[]};
 const read=reader(document),suppliers=knownSuppliers(e,view),cash=spendable(e,document,who,view);
 if(!suppliers.length)blocked.add('no_known_supply');
 for(const source of suppliers){
  try{
   const from=view.self.location,departAt=view.minute,outbound=route(e,document,from,source.location,departAt);
   const arriveAt=departAt+outbound.minutes,finishAt=arriveAt+serviceMinutes(e)*missing.length,inbound=route(e,document,source.location,from,finishAt),returnAt=finishAt+inbound.minutes;
   const minutes=returnAt-departAt,travelCoins=(outbound.cost??0)+(inbound.cost??0);
   if(!Number.isSafeInteger(minutes)||minutes>480||householdWorkTime(e,document.state,who,departAt).unattended){blocked.add('time');continue;}
   // Only subjective prices enter comparison. Current remote shelves are
   // checked at the visit, not used to select a supplier omnisciently.
   const local=source.location===from;
   if(local&&missing.some(r=>saleableStock(read,e,source.seller,r.item,{business:true}).available<r.quantity)){blocked.add('stock');continue;}
   const quotes=missing.map(r=>local?facilityRuntime().currentTradeQuote(e,document,{...r,buyer:who,seller:source.seller,location:source.location}):subjectiveMarketQuote(e,document,view,{...r,buyer:who,seller:source.seller,location:source.location}));
   if(quotes.some(q=>!q)){blocked.add('no_known_quote');continue;}
   const coins=quotes.reduce((n,q)=>n+q.totalCoins,travelCoins);
   if(coins>cash){blocked.add('budget');continue;}
   if(carriedKg(read,e,who)+missing.reduce((n,r)=>n+r.quantity*(e.byId.get(r.item)?.weight??0),0)>safeCarryKg(read,e,who)){blocked.add('carry');continue;}
   const estimated=missing.reduce((n,r)=>n+(goodsWorth(stateReader(document.state),e,{...r,holder:who,location:from})??Infinity),0);
   const otherCost=cost-estimated+Math.ceil(laborValue(e,document,{worker:who,observer:who,view}).daily*minutes/480),actualCost=otherCost+coins;
   const utility=benefit-actualCost-Math.floor(actualCost*delayPermille/1000)+Math.trunc(benefit*noisePermille/1000);
   if(!Number.isFinite(utility)||utility<=0){blocked.add('unprofitable');continue;}
   const trip={kind:'procure_inputs',purpose,supplier:source.seller,inputs:missing,from,to:source.location,departAt,arriveAt,finishAt,returnAt,travelCoins,
    outboundEdges:outbound.edges??[],inboundEdges:inbound.edges??[],knownFrom:source.knownFrom,maximum:cash,basis:{benefit,otherCost,delayPermille,noisePermille}};
   const id=source.location===from&&purpose.startsWith('repair:')?`repair_material:${who}:${from}:${missing[0].item}:${source.seller}`:`procure:${who}:${purpose}:${source.seller}:${source.location}`;
   out.push({id,kind:'purchase',legacy:trip,horizon:steps.length+1,goal:'input_procurement',steps:[{legacy:trip,done:false},...steps.map(legacy=>({legacy,done:false}))],
    cost:{coins,value:Math.max(0,actualCost-coins+Math.floor(actualCost*delayPermille/1000))},reward:Math.floor(benefit/Math.max(1,steps.length)),needSatisfaction:Math.max(0,benefit+Math.trunc(benefit*noisePermille/1000)),utility});
  }catch(error){if(error.code!=='E-ACTION-PRECONDITION'&&error.code!=='E-ROUTE')throw error;blocked.add('route');}
 }
 return {candidates:out,missing,blocked:[...blocked]};
}
// Diagnosis and candidate collection share this exact immutable observer
// projection within one decision. A later query constructs a new view, so
// it cannot retain yesterday's stock, routes or budget.
const repairProcurementReads=new WeakMap();
function repairProcurement(e,document,view,building){
 const cached=repairProcurementReads.get(view);
 if(cached?.engine===e&&cached.document===document&&cached.building===building)return cached.result;
 const wantedRepair=wanted(e,document,view.observer,building);if(!wantedRepair||wantedRepair.project)return null;
 // One daily autonomy choice is spent buying, so construction starts with
 // tomorrow's shift. Compare that lost service day as well as travel labor.
 const w=compareMaintenance(e,document,view.observer,building,wantedRepair,{view,leadDays:1});
 if(!Number.isFinite(w.cost))return null;
 const steps=[];for(let n=w.remaining;n>0;n-=MINUTES)steps.push({kind:'repair_building',building,minutes:Math.min(MINUTES,n)});
 const result=procurement(e,document,view,{purpose:`repair:${building}`,inputs:items(w.required),benefit:w.avoidedLoss,cost:w.cost,delayPermille:w.delayPermille,noisePermille:w.noisePermille,steps});
 repairProcurementReads.set(view,{engine:e,document,building,result});return result;
}
// Continue only a real completed purchase's remaining work. The trip itself
// (outbound, purchase windows, return) is kept in the shared market schedule.
function continuedPlan(view,candidates){
 const plan=view.self.plan;
 if(plan?.goal!=='input_procurement'||plan.status==='completed'||!plan.steps[0]?.done)return candidates;
 const next=plan.steps.find(s=>!s.done)?.legacy;
 const c=candidates.find(c=>c.legacy?.kind===next?.kind&&(next.kind==='craft'?c.legacy.recipe===next.recipe:c.legacy.building===next.building));
 return c?[{...c,id:plan.candidate,horizon:plan.steps.length,steps:plan.steps},...candidates.filter(row=>row!==c)]:candidates;
}
function wanted(engine,document,who,building){
 const view=facilityView(engine,document.state,building);
 if(!view||view.burning||view.condition<=0||!owns(engine,document,who,building))return null;
 const project=pending(document.state,who,building);
 if(!project&&view.condition>=100)return null;
 if(Object.values(document.state.projects??{}).some(p=>p.building===building&&p.status==='施工中'&&p.id!==project?.id))return null;
 return {view,project,required:project??materials(view)};
}
// A fixed subject key is the recoverable allocation for an old NPC. Reading a
// preview never consumes a random stream. Only real repair work stores it.
function delayPreference(e,document,who){
 const saved=document.state.npcs[who]?.maintenanceDelayPermille;if(saved!==undefined)return saved;
 const r=e.rules.facilities.maintenance;
 return rollDice(document.randomSeed,'maintenance:tail',who,0,0,1000)<=r.stubbornPermille?r.stubbornDelayPermille:
  rollDice(document.randomSeed,'maintenance:patience',who,0,0,r.delayMaxPermille+1)-1;
}
function rememberPreference(d,e,who){
 if(d.get('state','npcs',who,'maintenanceDelayPermille')===undefined)d.set(['state','npcs',who,'maintenanceDelayPermille'],delayPreference(e,d.document,who));
}
function choiceNoise(e,document,who,subject){
 const noise=e.rules.facilities.maintenance.noisePermille;
 return rollDice(document.randomSeed,'maintenance:choice',`${who}:${subject}`,Math.floor(document.state.minute/1440)*1440,0,2*noise+1)-1-noise;
}
// Service value is a potential daily use, not invented cash income. Lodgings
// use real rooms/night prices, stations their fee and recipe duration; other
// private premises use the existing weekly rental alternative-use value.
function serviceDaily(e,document,building,intact){
 const base=facilityDefinition(e,document.state,building);
 let daily=base.lodging?intact.capacity*e.rules.economy.rentalCopperPerNight:0;
 for(const station of intact.workstations){
  const recipes=e.world.recipes.filter(r=>r.workstation===station.kind&&r.minutes>0);
  if(recipes.length)daily+=(station.fee??0)*Math.floor(480/Math.min(...recipes.map(r=>r.minutes)));
 }
 return daily||Math.ceil(e.rules.economy.rentalCopperPerWeek/7);
}
export function maintenanceOptions(e,document,who,building,{view=null}={}){
 const w=wanted(e,document,who,building);if(!w)return null;
 return compareMaintenance(e,document,who,building,w,{view});
}
// Public proposals use the same condition, weather, material and preference
// comparison. The existing public project supplies its wage and workday.
function compareMaintenance(e,document,who,building,w,{laborDaily=null,shiftMinutes=MINUTES,materialHolder=who,view=null,leadDays=0}={}){
 const state=document.state,rule=e.rules.facilities.maintenance,read=stateReader(state);
 const remaining=w.required.requiredMinutes-(w.project?.minutesDone??0);
 const intact=facilityView(e,{...state,buildings:{...state.buildings,[building]:{...state.buildings?.[building],condition:100}}},building);
 const daily=serviceDaily(e,document,building,intact),{rule:wear,denominator,numerator}=facilityWearScale(e);
 let place=building,weather=null;const seen=new Set();
 while(place&&!seen.has(place)){seen.add(place);weather=weatherAt(e,document.randomSeed,place,state.minute);if(weather)break;place=facilityDefinition(e,state,place)?.parent;}
 const dailyWear=((wear?.material[w.view.material]??(w.view.material==='stone'?1:3))+(wear?.occupied??1)+(wear?.weather[weather?.kind]??0))*numerator;
 const remainder=facilityWearRemainder(state.buildings?.[building]??{},denominator);
 // npc-autonomy offers this action once per day, one MINUTES-sized shift.
 // Labor cost counts worked minutes; elapsed days must count actual shifts.
 const horizon=rule.horizonDays??e.rules.calendar.daysPerMonth,completionDays=Math.ceil(remaining/shiftMinutes)+leadDays;
 let avoidedLoss=0,lossUnits=0;
 const factorUnits=condition=>condition<25?0:condition<60?1:2;
 // Compare equal future days. Before completion the two options provide the
 // same service. Afterwards the repaired path also wears; no free upkeep.
 for(let day=completionDays;day<horizon;day++){
  const deferred=w.view.condition-Math.floor((remainder+day*dailyWear)/denominator);
  const repaired=100-Math.floor((day-completionDays)*dailyWear/denominator);
  lossUnits+=factorUnits(repaired)-factorUnits(deferred);
 }
 avoidedLoss=Math.floor(daily*lossUnits/2);
 const materialCost=w.project?0:items(w.required).reduce((sum,[item,quantity])=>{
  const value=goodsWorth(read,e,{item,quantity,holder:materialHolder,location:building});return value===null?NaN:sum+value;
 },0);
 const laborCost=Math.ceil((laborDaily??laborValue(e,document,{worker:who,observer:who,view}).daily)*remaining/480);
 const cost=materialCost+laborCost,delayPermille=delayPreference(e,document,who);
 const noisePermille=choiceNoise(e,document,who,building);
 const net=avoidedLoss-cost,utility=net-Math.floor(cost*delayPermille/1000)+Math.trunc(avoidedLoss*noisePermille/1000);
 return {...w,remaining,daily,dailyWear,denominator,horizon,completionDays,avoidedLoss,materialCost,laborCost,cost,net,delayPermille,noisePermille,
  options:[{kind:'repair_building',utility},{kind:'defer_maintenance',utility:0}]};
}
export function publicMaintenanceOptions(e,document,who,building){
 const state=document.state,view=facilityView(e,state,building);
 if(!view||view.burning||view.condition<=0||view.condition>=100||Object.values(state.projects??{}).some(p=>p.building===building&&p.status==='施工中'))return null;
 const inputs=facilityRuntime().publicMaintenanceInputs?.(e,document,who,building);if(!inputs)return null;
 const {office,wage}=inputs;
 const w=compareMaintenance(e,document,who,building,{view,project:null,required:materials(view)},{laborDaily:wage,shiftMinutes:480,materialHolder:office.settlement});
 return {...w,...inputs,settlement:office.settlement,options:[{kind:'public_maintenance',utility:w.options[0].utility},w.options[1]]};
}
function publicProposal(e,document,who,building){
 // Physical inspection supplies damage knowledge. Holding public office does
 // not reveal every building in the jurisdiction, or make its manager owner.
 if(!knownPublicBuildings(document.state,who).includes(building))return null;
 const physical=facilityView(e,document.state,building);if(physical&&noServiceLoss(e,document.state,building,physical))return null;
 const w=publicMaintenanceOptions(e,document,who,building);if(!w||!Number.isFinite(w.cost)||w.options[0].utility<=0)return null;
 const state=document.state,read=documentReader(document),s=state.settlements[w.settlement];
 const bill=w.laborCost,cap=w.office.monthlyBudgetCopper;
 if(!s||!Number.isSafeInteger(cap)||w.used+bill>cap||
    coinRead(read,{point:'public.treasury',account:treasury(w.settlement),legacy:()=>s.treasury})-bill<w.reserve||
    [['wood',w.required.wood],['stone',w.required.stone]].some(([material,n])=>priceRead(read,{point:'projects.supply',account:settlementStock(e,w.settlement,material),legacy:()=>s[material]??0})<n))return null;
 const crewKey=id=>clockDiceKey(document.randomSeed,'public_maintenance:crew',`${who}:${building}:${id}`,Math.floor(state.minute/1440)*1440);
 const worker=subjectiveView(e,document,who).observable.people.map(p=>p.id).sort((a,b)=>crewKey(a).localeCompare(crewKey(b))||a.localeCompare(b)).find(id=>{
  const n=state.npcs[id];
  if(id===who||n.location!==state.npcs[who]?.location||n.scheduleTravel||n.cognitionTravel||['濒死','昏迷','患病'].includes(n.status)||/睡眠|睡觉|熟睡/.test(n.activity??'')||
     !isEffective(e,state,id)||currentEmployment(state,id)||projectAssignment(state,id)||npcHousehold(e,state,id)?.settlement!==w.settlement||(npcAgeAt(e,state,id)??0)<18)return false;
  return facilityRuntime().publicProjectWorkerDecision(e,document,id,{actor:who,location:facilityDefinition(e,state,building).parent,wage:w.wage})?.outcome==='agree';
 });
 if(!worker)return null;
 return {w,args:{name:`修缮${facilityDefinition(e,state,building).name}`,projectWork:'repair',building,days:w.completionDays,
  wood:w.required.wood,stone:w.required.stone,workers:[worker],funding:'public'}};
}
registerAutonomyProvider('public_maintenance',{
 relevant:(e,state,id,presence)=>knownPublicBuildings(state,id,presence.location).some(b=>{const v=facilityView(e,state,b);return v&&!v.burning&&v.condition>0&&v.condition<100;}),
 candidateRelevant:(e,document,id,presence)=>knownPublicBuildings(document.state,id,presence.location).some(building=>{const state=document.state,v=facilityView(e,state,building);return Boolean(v&&!v.burning&&v.condition>0&&v.condition<100&&!noServiceLoss(e,state,building,v)&&facilityRuntime().publicMaintenanceInputs?.(e,document,id,building));}),
 candidates(e,view,document){
  const who=view.observer;
  return knownPublicBuildings(document.state,who).flatMap(building=>{
  const p=publicProposal(e,document,who,building);if(!p)return [];
  const w=p.w;
  return [{id:`public_maintenance:${who}:${building}`,kind:'public_maintenance',legacy:{kind:'public_maintenance',building},
   cost:{value:w.cost+Math.floor(w.cost*w.delayPermille/1000)},needSatisfaction:Math.max(0,w.avoidedLoss+Math.trunc(w.avoidedLoss*w.noisePermille/1000)),utility:w.options[0].utility}];
  });
 }
});
function knownPublicBuildings(state,who,location=state.npcs[who]?.location){
 return [...new Set([location,...(state.npcs[who]?.memoryStream??[]).filter(m=>m.kind==='facility_maintenance'&&m.minute<=state.minute).flatMap(m=>m.entities??[])].filter(Boolean))];
}
const tripKey=task=>`market_trip:procurement:${task}`;
// A visit owns a moving window, so the fixed-workplace validator delegates
// its route and service checks here. No stock or money moves in validation.
registerAutonomyKind('procure_inputs',{
 itinerary:true,
 minutes:(e,a)=>a.finishAt-a.departAt,
 validate(d,e,who,a,{at,ignoreTask=false,taskId}={}){
  const state=d.get('state'),n=state.npcs[who],trip=ignoreTask?state.records[tripKey(taskId)]:null;
  if(!a.inputs?.length||a.inputs.some(r=>!e.byId.get(r.item)||!Number.isSafeInteger(r.quantity)||r.quantity<1)||a.departAt!==at||a.arriveAt<at||a.finishAt!==a.arriveAt+serviceMinutes(e)*a.inputs.length||a.returnAt<a.finishAt||a.returnAt-at>480)throw preconditionFailure('筹料行程或数量无效');
  if(n.caring||n.levy||householdWorkTime(e,state,who,at).unattended||!trades(e.byId.get(a.supplier)))throw preconditionFailure('筹料缺少可用劳力或合法卖家');
  if(!ignoreTask){
   if(n.location!==a.from||n.scheduleTravel||n.cognitionTravel)throw preconditionFailure('筹料者不在出发地点');
   const permission=canAct({engine:e,document:d.document},who,'move',{to:a.to});if(!permission.allowed)throw preconditionFailure(permission.reason);
   const view=subjectiveView(e,d.document,who);
   if(!knownSuppliers(e,view).some(s=>s.seller===a.supplier&&s.location===a.to))throw preconditionFailure('本人不知道这个供给来源');
   const outbound=route(e,d.document,a.from,a.to,at),inbound=route(e,d.document,a.to,a.from,a.finishAt);
   if(outbound.minutes!==a.arriveAt-at||inbound.minutes!==a.returnAt-a.finishAt||(outbound.cost??0)+(inbound.cost??0)!==a.travelCoins)throw preconditionFailure('真实路线已改变');
   for(const [from,edges,arrivalMinute]of [[a.from,outbound.edges??[],a.arriveAt],[a.to,inbound.edges??[],a.returnAt]]){
    let location=from;
    for(const id of edges){const edge=e.world.routes.find(r=>r.id===id);location=edge.from===location?edge.to:edge.from;assertLocationAccess(d,e,location,{actor:who,arrivalMinute});}
   }
   for(let cursor=at;cursor<a.returnAt;){const s=scheduleAt(e,who,cursor,state);if(!s||s.location!==a.from||/睡眠|睡觉|熟睡|赶路|前往|返回/.test(s.activity??''))throw preconditionFailure('没有完整筹料空档');cursor=s.until;}
  }else if(!trip||trip.actor!==who||trip.to!==a.to||state.minute<a.finishAt||scheduleAt(e,who,a.finishAt-1,state)?.marketTrip!==trip.id||
   !(n.location===a.to||n.location===null&&n.scheduleTravel?.from===a.to&&n.scheduleTravel.depart===a.finishAt))throw preconditionFailure('筹料者没有实际完成到店行程');
  // Remove only this visit from the read projection, so it cannot conflict
  // with itself. All other trips, obligations and actual work still bind.
  const projected=trip?{...d.document,state:{...state,records:Object.fromEntries(Object.entries(state.records).filter(([id])=>id!==trip.id))}}:d.document;
  const read=reader(projected);
  if(!ignoreTask)e.assertNpcAutonomyAction(state,[who],{start:at,minutes:a.returnAt-at});
  e.assertNpcObligationAction(read,[who],{start:at,minutes:a.returnAt-at,location:a.from,kind:'autonomy'});
  e.assertNpcAutonomyAction(state,[a.supplier],{start:a.arriveAt,minutes:a.finishAt-a.arriveAt});
  e.assertNpcObligationAction(read,[a.supplier],{start:a.arriveAt,minutes:a.finishAt-a.arriveAt,location:a.to,kind:'trade'});
  for(let cursor=a.arriveAt;cursor<a.finishAt;){const s=scheduleAt(e,a.supplier,cursor,read.get('state'));if(!s||s.location!==a.to||!s.services?.includes('trade'))throw preconditionFailure('卖家没有实际接待窗口');cursor=s.until;}
  if(!isEffective(e,state,a.supplier)||['死亡','濒死','昏迷','患病'].includes(state.npcs[a.supplier]?.status))throw preconditionFailure('卖家不能接待');
  if(!ignoreTask&&a.travelCoins>householdCash(d,e,who))throw preconditionFailure('筹料路费不足');
 },
 start(d,e,who,a,{actionId}){
  const id=tripKey(actionId);
  d.set(['state','records',id],{id,category:'market_trip',actor:who,keeper:a.supplier,from:a.from,to:a.to,departAt:a.departAt,arriveAt:a.arriveAt,finishAt:a.finishAt,returnAt:a.returnAt,
   outboundEdges:a.outboundEdges,inboundEdges:a.inboundEdges,serviceWindows:[{start:a.arriveAt,end:a.finishAt}],paid:a.travelCoins,sourceEvent:actionId,purpose:a.purpose,knownFrom:a.knownFrom});
  if(a.travelCoins){householdPoolTopUp(d,e,who,a.travelCoins,actionId);moveCoins(d,{from:purse(e,who),to:sink('export','travel'),amount:a.travelCoins,writer,eventId:actionId});mirrorPartyCoins(d,e,who,-a.travelCoins,actionId,writer);}
 },
 contest(d,e,who,a){
  const quotes=a.inputs.map(r=>facilityRuntime().currentTradeQuote(e,d.document,{...r,buyer:who,seller:a.supplier,location:a.to}));
  return {claims:a.inputs.map(r=>({target:`goods:${a.supplier}:${r.item}`,targetKind:'goods',quantity:r.quantity,capacity:saleableStock(reader(d.document),e,a.supplier,r.item,{business:true}).available})),
   bid:quotes.reduce((n,q)=>n+q.totalCoins,0)};
 },
 execute(d,e,who,a,{actionId}){
  const state=d.get('state'),supplier=state.npcs[a.supplier];
  // A schedule forecast cannot substitute for the seller's actual body.
  // At finishAt the reserved service window has just ended.
  if(!supplier||supplier.location!==a.to||supplier.cognitionTravel||supplier.scheduleTravel)throw preconditionFailure('卖家实际不在店内');
  const read=reader(d.document),quotes=a.inputs.map(r=>{
   if(saleableStock(read,e,a.supplier,r.item,{business:true}).available<r.quantity)throw preconditionFailure('筹料卖家可售库存不足');
   const quote=facilityRuntime().currentTradeQuote(e,d.document,{...r,buyer:who,seller:a.supplier,location:a.to});
   assertMarketDepth(d,e,quote,{agreed:quote.agreed});return quote;
  });
  const total=quotes.reduce((n,q)=>n+q.totalCoins,0),view=subjectiveView(e,d.document,who);
  if(total>householdCash(d,e,who)||total+a.travelCoins>a.maximum||total>spendable(e,d.document,who,view))throw preconditionFailure('筹料真实付款超出家户可用预算');
  const {benefit,otherCost,delayPermille,noisePermille}=a.basis,cost=otherCost+total+a.travelCoins;
  if(benefit-cost-Math.floor(cost*delayPermille/1000)+Math.trunc(benefit*noisePermille/1000)<=0)throw preconditionFailure('实际报价下筹料已不划算');
  if(carriedKg(read,e,who)+a.inputs.reduce((n,r)=>n+r.quantity*packItemKg(read,e,a.supplier,r.item),0)>safeCarryKg(read,e,who))throw preconditionFailure('筹料超过实际负重');
  const sellerView=subjectiveView(e,d.document,a.supplier);
  if(npcDecision(sellerView,{kind:'sell',from:who,cost:{value:total},reward:total}).outcome!=='agree')throw preconditionFailure('卖家不同意本次筹料交易');
  householdPoolTopUp(d,e,who,total,`${actionId}:inputs`);// 本人钱袋不够时先从户池补足
  for(let i=0;i<a.inputs.length;i++){
   const r=a.inputs[i],q=quotes[i],eventId=`${actionId}:${r.item}`;
   transferItems(d,e,a.supplier,who,r.item,r.quantity);
   moveCoins(d,{from:purse(e,who),to:purse(e,a.supplier),amount:q.totalCoins,writer,eventId});
   mirrorPartyCoins(d,e,who,-q.totalCoins,eventId,writer);mirrorPartyCoins(d,e,a.supplier,q.totalCoins,eventId,writer);
   recordMarketDeal(d,q,q.totalCoins,r.quantity,eventId);
  }
  d.set(['state','records',tripKey(actionId),'purchasedAt'],a.finishAt);
  return {summary:'按真实行程到店筹料，双方同意后付款取货，按原行程返回。',spent:{minutes:a.finishAt-a.departAt,coins:total}};
 }
});
function productionProcurement(e,document,view,choices){
 const read=stateReader(document.state),candidates=[],constraints=[];
 for(const action of choices.filter(a=>a.kind==='craft')){
  const recipe=e.byId.get(action.recipe),inputs=recipe.materials.map(m=>[m.item,m.amount]);
  const missing=shortfall(e,document,view.observer,inputs);if(!missing.length)continue;
  const station=facilityView(e,document.state,view.self.location)?.workstations.find(s=>s.kind===recipe.workstation);
  if(npcProficiency(reader(document),e,view.observer,recipe.skill)<recipe.minimumProficiency||recipe.location&&recipe.location!==view.self.location||
     recipe.workstation&&(!station||station.access!=='public'&&station.owner!==view.observer)||
     (recipe.tools??[]).some(item=>e.quantity(read,view.observer,item)<1))continue;
  const benefit=goodsWorth(read,e,{item:recipe.output.item,quantity:recipe.output.quantity,holder:view.observer,location:view.self.location});
  const cost=inputs.reduce((n,[item,quantity])=>n+(goodsWorth(read,e,{item,quantity,holder:view.observer,location:view.self.location})??Infinity),0)+Math.ceil(laborValue(e,document,{worker:view.observer,observer:view.observer,view}).daily*recipe.minutes/480);
  const result=procurement(e,document,view,{purpose:`craft:${recipe.id}`,inputs,benefit,cost,delayPermille:delayPreference(e,document,view.observer),noisePermille:choiceNoise(e,document,view.observer,recipe.id),steps:[action]});
  candidates.push(...result.candidates);if(!result.candidates.length)constraints.push({purpose:`craft:${recipe.id}`,missing,blocked:result.blocked});
 }
 return {candidates,constraints};
}
installFacilityRuntime({
 inputProcurement(e,document,view,choices){
  const production=productionProcurement(e,document,view,choices),building=view.self.location,physical=facilityView(e,document.state,building);
  if(physical&&physical.condition<100&&!noServiceLoss(e,document.state,building,physical)&&owns(e,document,view.observer,building)){
   const result=repairProcurement(e,document,view,building);
   if(result?.missing.length&&!result.candidates.length)production.constraints.push({purpose:`repair:${building}`,missing:result.missing,blocked:result.blocked});
  }
  return production;
 },
 continueInputPlan:continuedPlan
});
registerAutonomyProvider('report_maintenance',{
 relevant:(e,state,id,presence)=>{const b=facilityDefinition(e,state,presence.location),v=facilityView(e,state,presence.location);return (b?.site?.manager??b?.lodging?.host)===id&&v?.condition>0&&v.condition<60;},
 candidateRelevant:(e,document,id,presence)=>Boolean(facilityRuntime().publicMaintenanceReport?.(e,document,id,presence.location)),
 candidates(e,view,document){
  const building=view.self.location,report=facilityRuntime().publicMaintenanceReport?.(e,document,view.observer,building);
  const quote=report&&publicMaintenanceOptions(e,document,report.officer,building);
  return quote?[{id:`report_maintenance:${view.observer}:${building}`,kind:'report_maintenance',legacy:{kind:'report_maintenance',building},cost:{minutes:30},needSatisfaction:quote.avoidedLoss,utility:quote.net}]:[];
 }
});
registerAutonomyKind('report_maintenance',{
 minutes:()=>30,
 validate(d,e,who,action){if(!facilityRuntime().publicMaintenanceReport?.(e,d.document,who,action.building))throw preconditionFailure('没有可报知的现场失修');},
 execute(d,e,who,action,{actionId}){const report=facilityRuntime().reportPublicMaintenance(d,e,who,action.building,actionId);return {summary:'按亲见失修情况向在任负责人报知。',report,spent:{minutes:30}};}
});
registerAutonomyKind('public_maintenance',{
 minutes:()=>30,
 validate(d,e,who,action){if(!publicProposal(e,d.document,who,action.building))throw preconditionFailure('公共维修缺少现任权限、预算、材料或同意做工的人');},
 execute(d,e,who,action,{actionId}){
  const proposal=publicProposal(e,d.document,who,action.building);
  if(!proposal)throw preconditionFailure('公共维修前提已改变');
  const result=facilityRuntime().startPublicProject(d,e,proposal.args,actionId,proposal.w.settlement,{actor:who});
  rememberPreference(d,e,who);
  return {summary:`按现任职权发起${proposal.args.name}，材料与工钱进入公共工程。`,project:result.project,spent:{minutes:30}};
 }
});
registerAutonomyProvider('building_maintenance',{
 // Use the same projected document as candidates, including current native
 // title overrides and the actor's daily presence, never catalog ownership.
 relevant:(e,state,id,presence)=>{const v=facilityView(e,state,presence.location);return Boolean(v&&!v.burning&&v.condition>0&&(v.condition<100||pending(state,id,presence.location)));},
 candidateRelevant:(e,document,id,presence)=>{const state=document.state,building=presence.location,v=facilityView(e,state,building);return Boolean(v&&!v.burning&&v.condition>0&&(v.condition<100||pending(state,id,building))&&!noServiceLoss(e,state,building,v)&&owns(e,document,id,building));},
 candidates(e,view,document){
  const who=view.observer,building=view.self.location,physical=facilityView(e,document.state,building);
  if(physical&&noServiceLoss(e,document.state,building,physical))return [];
  const required=wanted(e,document,who,building);if(!required)return [];
  if(!required.project&&shortfall(e,document,who,items(required.required)).length)return repairProcurement(e,document,view,building)?.candidates??[];
  const w=compareMaintenance(e,document,who,building,required,{view}),minutes=Math.min(MINUTES,w.remaining);
  if(!Number.isFinite(w.cost))return [];
  const reward=Math.floor(w.avoidedLoss*minutes/w.remaining),utility=w.options[0].utility;
  // Labor is already valued in coins; do not charge npcDecision's generic
  // minutes penalty a second time. The real duration and obligation conflicts
  // are enforced by validateAction using legacy.minutes at start and finish.
  if(utility<=0)return [];
  return [{id:`maintain:${who}:${building}`,kind:'repair_building',legacy:{kind:'repair_building',building,minutes},cost:{value:w.cost+Math.floor(w.cost*w.delayPermille/1000)},reward,needSatisfaction:Math.max(0,w.avoidedLoss+Math.trunc(w.avoidedLoss*w.noisePermille/1000)),utility}];
 }
});
registerAutonomyKind('repair_building',{
 minutes:(e,action)=>action.minutes,
 validate(d,e,who,action){
  const w=wanted(e,d.document,who,action.building);
  if(!w||d.get('state','npcs',who,'location')!==action.building)throw preconditionFailure('业主不在本人可修缮的建筑内');
  if(!Number.isSafeInteger(action.minutes)||action.minutes<1||action.minutes>MINUTES||action.minutes>w.required.requiredMinutes-(w.project?.minutesDone??0))throw preconditionFailure('修缮工时无效');
  if(!w.project&&items(w.required).some(([item,n])=>e.quantity(d,who,item)<n))throw preconditionFailure('业主修缮材料不足');
 },
 execute(d,e,who,action,{at,actionId}){
  rememberPreference(d,e,who);
  const w=wanted(e,d.document,who,action.building),id=w.project?.id??`${key(who,action.building)}:${actionId}`;
  let p=w.project;
  if(!p){
   p={id,type:'业主修缮',building:action.building,creator:who,projectWork:'repair',status:'施工中',...w.required,minutesDone:0,started:at-action.minutes};
   for(const [item,n]of items(p))changeItems(d,e,who,item,-n,{books:BOOKED});
   holdWorks(d,e,id,p,{from:{party:who},writer,eventId:actionId});
  }
  p={...p,minutesDone:p.minutesDone+action.minutes};
  if(p.minutesDone>=p.requiredMinutes){
   facilityRuntime().completeFacilityProject(d,e,p,at);
   settleWorks(d,e,p,{writer,eventId:actionId});p={...p,status:'已完成',closedAt:at};
  }
  d.set(['state','projects',id],p);
  return {summary:`修缮本人建筑${action.building}，实际做工${action.minutes}分钟，${p.status}。`,spent:{minutes:action.minutes,...(!w.project?{materials:items(p).map(([item,amount])=>({item,amount}))}:{})}};
 }
});
