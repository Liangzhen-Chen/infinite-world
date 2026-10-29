// Owner maintenance is an NPC action, not free healing in the facility clock.
// Use the same material/work specification, project stock and completion hook
// as player repairs. Existing autonomous trade buys genuinely available stock.
import {registerAutonomyProvider,registerAutonomyKind} from './autonomy-candidates.mjs';
import {facilityView,facilityRepairMaterials,facilityRuntime,facilityDefinition,facilityWearScale,facilityWearRemainder} from './facility-state.mjs';
import {currentControllers} from './action-authority.mjs';
import {stateReader,goodsWorth} from './valuation.mjs';
import {changeItems} from './items.mjs';
import {BOOKED,holdWorks,settleWorks} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {preconditionFailure} from './precondition.mjs';
import {laborValue} from './market.mjs';
import {rollDice} from './scheduler.mjs';
import {weatherAt} from './weather.mjs';
import {safeCarryKg,carriedKg,packItemKg} from './carry.mjs';

declareLedgerWriter('building-maintenance',{sinks:['sink:consume']});
const writer='building-maintenance',MINUTES=240;
const key=(who,building)=>`owner_repair:${who}:${building}`;
function owns(engine,document,who,building){return currentControllers({engine,document},building,{ownerOnly:true,principals:true}).includes(who);}
function pending(state,who,building){return Object.values(state.projects??{}).find(p=>p.type==='业主修缮'&&p.creator===who&&p.building===building&&p.status==='施工中')??null;}
function materials(view){const m=facilityRepairMaterials(view);return {wood:m.wood,stone:m.stone,requiredMinutes:m.work*480};}
const items=p=>[['item_wood',p.wood],['item_stone',p.stone]];
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
export function maintenanceOptions(e,document,who,building){
 const w=wanted(e,document,who,building);if(!w)return null;
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
 const horizon=rule.horizonDays??e.rules.calendar.daysPerMonth,completionDays=Math.ceil(remaining/MINUTES);
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
  const value=goodsWorth(read,e,{item,quantity,holder:who,location:building});return value===null?NaN:sum+value;
 },0);
 const laborCost=Math.ceil(laborValue(e,document,{worker:who,observer:who}).daily*remaining/480);
 const cost=materialCost+laborCost,delayPermille=delayPreference(e,document,who);
 const noisePermille=rollDice(document.randomSeed,'maintenance:choice',`${who}:${building}`,Math.floor(state.minute/1440)*1440,0,2*rule.noisePermille+1)-1-rule.noisePermille;
 const net=avoidedLoss-cost,utility=net-Math.floor(cost*delayPermille/1000)+Math.trunc(avoidedLoss*noisePermille/1000);
 return {...w,remaining,daily,dailyWear,denominator,horizon,completionDays,avoidedLoss,materialCost,laborCost,cost,net,delayPermille,noisePermille,
  options:[{kind:'repair_building',utility},{kind:'defer_maintenance',utility:0}]};
}
registerAutonomyProvider('building_maintenance',{
 // Relevance is only a cheap damage check. Ownership is checked against the
 // full document below, including native titles that override catalog owners.
 relevant:(e,state,id,presence)=>{const v=facilityView(e,state,presence.location);return Boolean(v&&!v.burning&&v.condition>0&&(v.condition<100||pending(state,id,presence.location)));},
 candidates(e,view,document){
  const who=view.observer,building=view.self.location,w=maintenanceOptions(e,document,who,building);if(!w)return [];
  const read=stateReader(document.state),minutes=Math.min(MINUTES,w.remaining);
  if(!Number.isFinite(w.cost))return [];
  const reward=Math.floor(w.avoidedLoss*minutes/w.remaining),utility=w.options[0].utility;
  const missing=w.project?null:items(w.required).find(([item,n])=>e.quantity(read,who,item)<n);
  if(missing){
   const [item,n]=missing,quantity=n-e.quantity(read,who,item);
   // No remote stock, treasury grant, invented merchant, or automatic delivery.
   // Career services list taught recipes/skills, not generic stock sales.
   // Inspect only observed people and their public engine-quoted trade offer.
   return view.observable.people.filter(p=>p.id!==who&&e.byId.get(p.id)?.serviceCatalog?.some(s=>s.kind==='trade'&&s.price?.mode==='engineQuote')).flatMap(p=>{
    const seller=p.id;if(document.state.npcs[seller]?.location!==building||e.quantity(read,seller,item)<quantity)return [];
    try{
     const quote=facilityRuntime().currentTradeQuote(e,document,{buyer:who,seller,item,quantity,location:building});
     const carry={document,get:(...path)=>path.reduce((v,k)=>v?.[k],document)};
     if(quote.totalCoins>view.self.coins||carriedKg(carry,e,who)+quantity*packItemKg(carry,e,seller,item)>safeCarryKg(carry,e,who))return [];
     const estimated=goodsWorth(read,e,{item,quantity,holder:who,location:building});
     const value=w.cost-estimated,actualCost=value+quote.totalCoins;
     const actualUtility=w.avoidedLoss-actualCost-Math.floor(actualCost*w.delayPermille/1000)+Math.trunc(w.avoidedLoss*w.noisePermille/1000);
     if(actualUtility<=0)return [];
     return [{id:`repair_material:${who}:${building}:${item}:${seller}`,kind:'purchase',legacy:{kind:'trade',seller,item,quantity},cost:{coins:quote.totalCoins,value:value+Math.floor(actualCost*w.delayPermille/1000)},reward,needSatisfaction:Math.max(0,w.avoidedLoss+Math.trunc(w.avoidedLoss*w.noisePermille/1000)),utility:actualUtility}];
    }catch{return [];}
   });
  }
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
