// TOWNFOOD C: finite household recipe chains, timed against the existing
// subsistence shifts. A cohort owns a bag and labor account, never extra people.
import {statisticalFoodAccount,statisticalFoodEngine,statisticalFoodGroups,statisticalFoodNeed,householdMealPlan,householdBudget,householdResources,householdCommitments} from './household-budget.mjs';
import {prepareHouseholdSubsistence,householdSourceJourney,drawHouseholdWater,cutHouseholdWood} from './household-subsistence.mjs';
import {liquidPortionMl} from './domain-rules.mjs';
import {safeCarryKg} from './carry.mjs';
import {householdWorkTime} from './npc-state.mjs';
import {personHousehold,personSimulation} from './entity-view.mjs';
import {facilityView} from './facility-state.mjs';
import {heldUnit,changeItems,wearItem,transferItems} from './items.mjs';
import {craftInput,craftOutput,recordCraft,bag,BOOKED} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {purse,workshopFund,moveCoins} from './money.mjs';
import {recordsWhere} from './storage.mjs';
import {statisticalLaborMinutes} from './town-income.mjs';
import {validateAutonomyAction,executeAutonomyAction,craftOutcome,npcToolBonus} from './npc-autonomy.mjs';
import {npcProficiency,npcWorkGrowth} from './npc-growth.mjs';
import {rollDice} from './scheduler.mjs';
import {laborValue} from './market.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {employmentReservation} from './employment-state.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {homeCraftKnown,homeCraftFloor,isHomeCraft,householdHearth} from './household-crafts.mjs';

declareLedgerWriter('household-food',{sources:{'src:craft':{'*':100000},'src:harvest':{item_water:Infinity}},sinks:['sink:consume']});
const DAY=1440,START=780,END=1020,quantity=v=>typeof v==='number'?v:v?.quantity??0;
const jobs=state=>recordsWhere(state.records,'category','household_processing');
const foodRecipes=new WeakMap();
function recipeIndex(e){
 let found=foodRecipes.get(e.world.recipes);if(found)return found;
 const outputs=new Set(e.world.items.filter(i=>i.nutrition?.satiety>0).map(i=>i.id)),selected=new Set();
 for(let changed=true;changed;){changed=false;for(const r of e.world.recipes)if(!selected.has(r)&&outputs.has(r.output.item)){selected.add(r);for(const m of r.materials)outputs.add(m.item);changed=true;}}
 found=[...selected];foodRecipes.set(e.world.recipes,found);return found;
}
const ownerRow=(state,id)=>statisticalFoodAccount(state,id)??state.npcs?.[id];
// Home provisioning (law: world/rules/household-crafts.json "provisions"): an input of a home recipe that the
// household does not hold is fetched by the cook from the world's own source, on foot, at a cost in minutes.
// water -> the nearest usable basin (household-subsistence.mjs, finite basin ledger); fuel -> the nearest forest
// with wood in its ledger (forest-water.mjs). Where no source is in reach the input simply does not exist.
const provisionRule=(e,item)=>e.rules.householdCrafts?.provisions?.find(p=>p.item===item);
// One wood run brings back what one body can carry (carry.mjs, safe load) and serves that many batches, so each
// batch pays the run's cost divided by what a run carries (the average over days; the household does not keep a
// woodpile record). A cohort of homes has no single body and uses the load of an unencumbered adult.
function carryUnits(d,e,scoped,id,item){
 let spare;
 try{spare=safeCarryKg(d,e,id);}catch{spare=NaN;}
 if(!(spare>=0))spare=e.rules.combat.character.carryBase;
 return Math.floor(spare/e.byId.get(item).weight);
}
// need = units one batch uses; returns the journey and the minutes one batch pays, or null when nothing reachable can supply it.
function provisionJourney(d,e,scoped,id,s,home,item,need,at,group){
 const p=provisionRule(e,item);if(!p||!home)return null;
 if(p.source==='water'){
  const journey=householdSourceJourney(e,s,home,'water',at,0);if(!journey)return null;
  return {...p,journey,minutes:journey.travelMinutes+e.rules.householdSubsistence.waterMinutes,reserve:Infinity};
 }
 const carry=carryUnits(d,e,scoped,id,item);if(carry<need)return null;
 const journey=householdSourceJourney(e,s,home,'fuel',at,need);if(!journey)return null;
 const forest=e.rules.forestWater.forest,run=journey.travelMinutes+Math.ceil(carry/forest.maximumCut)*forest.minutes;
 return {...p,journey,minutes:Math.ceil(run*need/carry),reserve:journey.reserve};
}
// Members of one household share its kitchen: materials and utensils are read
// from every holder of that household in member-id order (the same order the
// transfers below use), so who happens to carry the salt does not matter.
function stocks(d,e,id,item){
 return householdResources(d,e,id,{marketSubstitution:false}).rows.filter(r=>r.item===item).map(r=>({holder:r.holder,free:Math.max(0,r.stock-r.seed-r.committed)})).sort((a,b)=>a.holder.localeCompare(b.holder));
}
function inputStock(d,e,id,item){
 if(statisticalFoodAccount(d.get('state'),id))return Math.max(0,e.quantity(d,id,item)-householdCommitments(d.get('state'),id,item));
 return stocks(d,e,id,item).reduce((n,r)=>n+r.free,0);
}
function homeOf(e,s,id){return statisticalFoodAccount(s,id)?.settlement??personHousehold(e,s,id).value?.homeLocation??s.npcs?.[id]?.location;}
function recipesFor(e,s,id,home){
 const row=ownerRow(s,id),facility=facilityView(e,s,home),group=statisticalFoodAccount(s,id),law=e.rules.householdCrafts;
 // A statistical cohort is a set of registered homes: each has the derived hearth.
 const hearth=group?(law&&group.beneficiaryUnits>0?{kind:law.hearth.kind,access:'public'}:null):householdHearth(e,home,id),own=facility?.workstations??e.byId.get(home)?.workstations??[];
 const stations=[...own,...(hearth&&!own.some(w=>w.kind===hearth.kind)?[hearth]:[])];
 if(!row||facility?.factor===0)return [];
 const accessible=recipeIndex(e).filter(r=>(!r.location||r.location===home)&&(!r.workstation||stations.some(w=>w.kind===r.workstation&&(w.access==='public'||w.owner===id||w.members?.includes(id))&&!w.thermalRequirement)));
 if(!accessible.length)return [];
 // Most household bags have no known food recipe. Only ask the workstation
 // adapter for those whose actual workplace is their processing location.
 const offered=!group&&s.npcs?.[id]?.location===home?currentWorkstationRecipes(e,s,id):[];
 const known=r=>group?Boolean(law&&isHomeCraft(e.world,r.id)&&group.workCapacity>0):homeCraftKnown(e,s,id,r,s.minute);
 return accessible.filter(r=>
  (!r.learningRequired||r.teachers?.includes(id)||row.recipes?.[r.id]||offered.some(p=>p.id===r.id)||known(r))&&
  (group?row.skills?.[r.skill]??0:Math.max(npcProficiency(e,s,id,r.skill),known(r)?homeCraftFloor(e,s,id,r.skill,s.minute):0))>=(r.minimumProficiency??0));
}
function toolCapacity(d,e,id,r){
 let capacity=Infinity;
 const group=statisticalFoodAccount(d.get('state'),id);
 for(const item of r.tools??[]){
  // A household lends one utensil within its home: take the best-kept holder.
  let best=0;
  for(const holder of group?[id]:[...new Set([id,...stocks(d,e,id,item).map(x=>x.holder)])]){
   const held=heldUnit(d,e,holder,item),def=e.byId.get(item),durability=held?.durability??def?.durability??0;
   if(!(durability>0)||!(e.quantity(d,holder,item)>0))continue;
   best=Math.max(best,Math.floor((e.quantity(d,holder,item)*durability-(held?.wearRemainder??0))/(r.toolWear??1)));
  }
  if(!best)return 0;
  capacity=Math.min(capacity,best);
 }
 return capacity;
}
export function freeMinutes(d,e,id,at){
 const s=d.get('state'),group=statisticalFoodAccount(s,id);
 if(group)return statisticalLaborMinutes(e,{...s,minute:at},group);
 if(employmentReservation(s,id,at,Math.max(1,END-at%DAY),e.byId.get(id)?.schedule?.restDays??[]))return 0;
 const time=householdWorkTime(e,s,id,at,{workMinutes:0});
 return time.unattended?0:time.unused.filter(w=>w.end>at%DAY).reduce((n,w)=>n+w.end-Math.max(w.start,at%DAY),0);
}
// Find a bounded acyclic chain from an actual input to an edible output. Only
// learned recipes and accessible facilities/tools enter the buyer's estimate.
export function householdFoodConversion(d,e,id,item,at=d.get('state','minute')){
 // Fetched inputs (water, wood) are never the food being converted: only the grain counts as raw food.
 if(e.byId.get(item)?.nutrition?.satiety>0||provisionRule(e,item))return null;
 const candidates=recipeIndex(e).filter(r=>r.materials.some(m=>m.item===item));if(!candidates.length)return null;
 const s=d.get('state'),scoped=statisticalFoodEngine(e,s),tools=new Map(),toolsOf=r=>{if(!tools.has(r.id))tools.set(r.id,toolCapacity(d,scoped,id,r));return tools.get(r.id);};
 // Cheapest test first: a household whose free time is shorter than the shortest step that takes this input cannot start any batch.
 const free=freeMinutes(d,e,id,Math.max(at,Math.floor(at/DAY)*DAY+START)),speed=Math.max(1,facilityView(e,s,homeOf(e,s,id))?.factor||1);
 if(free<Math.ceil(Math.min(...candidates.map(r=>r.minutes))/speed))return null;
 if(!candidates.some(r=>toolsOf(r)>0))return null;
 const home=homeOf(e,s,id),group=statisticalFoodAccount(s,id),recipes=recipesFor(e,s,id,home);
 const search=(input,path,seen)=>{
  for(const r of recipes.filter(r=>r.materials.some(m=>m.item===input))){
   if(seen.has(r.id)||!toolsOf(r))continue;
   const next=[...path,r],nutrition=e.byId.get(r.output.item)?.nutrition?.satiety??0;
   if(nutrition>0)return next;
   const found=search(r.output.item,next,new Set([...seen,r.id]));if(found)return found;
  }
  return null;
 };
 const chain=search(item,[],new Set());if(!chain)return null;
 const stock=new Map(),inputs=new Map();let minutes=0,fees=0,max=Infinity;
 const stations=facilityView(e,s,home)?.workstations??e.byId.get(home)?.workstations??[];
 for(const r of chain){
  for(const m of r.materials){const held=stock.get(m.item)??0,used=Math.min(held,m.amount);stock.set(m.item,held-used);if(m.amount>used)inputs.set(m.item,(inputs.get(m.item)??0)+m.amount-used);}
  stock.set(r.output.item,(stock.get(r.output.item)??0)+r.output.quantity);
  minutes+=Math.ceil(r.minutes/(facilityView(e,s,home)?.factor||1));
  max=Math.min(max,toolsOf(r));
  const station=stations.find(w=>w.kind===r.workstation);fees+=station?.owner===id?0:station?.fee??0;
 }
 const raw=inputs.get(item)??0;if(!raw)return null;
 // Labour and the afternoon window bound the batches whatever is fetched: with no room for even the cooking
 // minutes there is no estimate, and no errand needs to be routed.
 const parallel=group?Math.max(1,Math.min(Math.floor(group.workCapacity/480),...chain.flatMap(r=>(r.tools??[]).map(i=>scoped.quantity(d,id,i))))):1;
 if(!(Math.floor(free/minutes)>0&&Math.floor(Math.max(0,END-Math.max(START,at%DAY))/minutes)*parallel>0))return null;
 const pool=group?null:householdResources(d,scoped,id,{marketSubstitution:false}).rows,haveOf=m=>pool?pool.filter(r=>r.item===m).reduce((n,r)=>n+Math.max(0,r.stock-r.seed-r.committed),0):inputStock(d,scoped,id,m);
 const provided=new Set();let prep=0;
 for(const [material,n]of inputs){
  if(material===item)continue;
  const have=haveOf(material),via=provisionJourney(d,e,scoped,id,s,home,material,n,at);
  if(via){provided.add(material);max=Math.min(max,Math.floor(via.reserve/n));if(have<n)prep+=via.minutes;}
  else max=Math.min(max,Math.floor(have/n));
 }
 minutes+=prep;
 max=Math.min(max,Math.floor(free/minutes));
 max=Math.min(max,Math.floor(Math.max(0,END-Math.max(START,at%DAY))/minutes)*parallel);
 if(!(max>0))return null;
 const last=chain.at(-1),gain=(stock.get(last.output.item)??0)*(e.byId.get(last.output.item)?.nutrition?.satiety??0);
 // An estimate reserves labor and inputs, never credits nutrition before a
 // successful craft. The same wage table prices opportunity for both owners.
 const skills={...e.byId.get(id)?.proficiencies,...e.byId.get(id)?.skills,...ownerRow(s,id)?.skills},proficiency=Math.max(0,...Object.values(skills).map(v=>typeof v==='number'?v:v?.proficiency??0));
 const daily=group?e.rules.economy.dailyIncomeBySkillStage[Math.min(e.rules.economy.dailyIncomeBySkillStage.length-1,Math.floor(proficiency/300))].reduce((a,b)=>a+b,0)/2:laborValue(e,d.document,{worker:id,proficiency}).daily;
 const extra=fees+minutes*daily/480+[...inputs].filter(([m])=>m!==item&&!provided.has(m)).reduce((n,[m,q])=>n+q*(e.byId.get(m)?.basePrice??0),0);
 return {item,home,chain:chain.map(r=>r.id),raw,gain,gainPerUnit:gain/raw,minutes,prep,provided:[...provided],extraPerUnit:extra/raw,maximum:max*raw};
}
export function householdFoodDemand(d,e,id,at=d.get('state','minute'),knownNeed=null){
 const s=d.get('state'),group=statisticalFoodAccount(s,id);
 let need=knownNeed??(group?statisticalFoodNeed(e,s,group.settlement,d,group):householdBudget(d,e,id).resources.procurementShortfall.satiety);
 for(const [item,v]of Object.entries(ownerRow(s,id)?.inventory??{})){
  if(e.byId.get(item)?.nutrition?.satiety>0||!quantity(v))continue;
  const p=householdFoodConversion(d,e,id,item,at);if(p)need-=Math.min(quantity(v),p.maximum)*p.gainPerUnit;
 }
 return Math.max(0,need);
}
registerAdvanceHook('householdFoodConversion',householdFoodConversion);
registerAdvanceHook('householdFoodDemand',householdFoodDemand);
export function planHouseholdFood(d,e,minute=d.get('state','minute')){
 if(!e.rules.householdSubsistence)return;
 const day=Math.floor(minute/DAY),at=day*DAY+START;if(minute>=at)return;
 const s=d.get('state'),owners=Object.keys(s.npcs??{});
 for(const sid of Object.keys(s.settlements??{}))owners.push(...statisticalFoodGroups(e,s,sid).map(r=>r.owner));
 const inputs=new Set(recipeIndex(e).flatMap(r=>r.materials.map(m=>m.item)).filter(id=>!(e.byId.get(id)?.nutrition?.satiety>0)&&!provisionRule(e,id)));
 const eligible=owners.filter(id=>Object.entries(ownerRow(s,id)?.inventory??{}).some(([item,v])=>quantity(v)>0&&inputs.has(item)&&householdFoodConversion(d,e,id,item,at))&&(statisticalFoodAccount(s,id)||personSimulation(e,s,id).value)).sort();
 const starts=eligible.flatMap(id=>{
  if(statisticalFoodAccount(s,id))return [[id,at]];
  const span=householdWorkTime(e,s,id,at,{workMinutes:0}).unused.find(w=>w.end>START);
  return span?[[id,day*DAY+Math.max(START,span.start)]]:[];
 });
 if(starts.length)d.set(['state','family','foodProcessing'],[day,starts]);
}
registerAdvanceHook('planHouseholdFood',planHouseholdFood);
export function householdFoodBusy(state,id,start,minutes=0){return jobs(state).some(j=>j.status==='working'&&j.owner===id&&start<j.finish&&start+Math.max(1,minutes)>j.start);}
export function nextHouseholdFoodMinute(state,now){
 return Math.min(...(state.family?.foodProcessing?.[1]??[]).map(([,at])=>at).filter(at=>at>now),...jobs(state).filter(j=>j.status==='working'&&j.finish>now).map(j=>j.finish));
}
function reserve(d,e,id,at,minutes,location){
 const day=Math.floor(at/DAY),s=d.get('state'),group=statisticalFoodAccount(s,id);
 if(group){
  const labor=group.labor,payDay=day,receipts=labor.payDay===payDay?labor.receipts??{}:{};
  d.set(['state','records',id,'labor'],{...labor,payDay,receipts:{...receipts,[`food:${at}`]:{minutes,earned:0,paid:0}}});return;
 }
 const entry=s.family?.subsistence?.[1]?.[id];if(!entry)return;
 const key=`subsistence-plan:${entry[0]}`,old=d.get('state','records',key),worker=old.workers[id]??{duties:[],chores:[]};
 const duty={worker:id,start:at%DAY,end:at%DAY+minutes,location,activity:'加工家户口粮',services:[]};
 d.set(['state','records',key,'workers',id],{...worker,duties:[...worker.duties,duty],chores:[...worker.chores,duty]});
}
// The cook borrows what housemates hold (member-id order, only free stock), so
// the existing craft path can spend it from one bag. Nothing is created.
function gather(work,e,id,r,key){
 const need=new Map();
 for(const m of r.materials)need.set(m.item,(need.get(m.item)??0)+m.amount);
 for(const t of r.tools??[])if(!need.has(t))need.set(t,1);
 for(const [item,amount]of need){
  let lack=amount-e.quantity(work,id,item);
  for(const donor of stocks(work,e,id,item)){
   if(lack<=0)break;if(donor.holder===id)continue;
   const n=Math.min(lack,donor.free,e.quantity(work,donor.holder,item));
   if(n>0){transferItems(work,e,donor.holder,id,item,n,null,{eventId:`${key}:gather:${item}`});lack-=n;}
  }
 }
}
// The cook walks to the source and brings back what the recipe still lacks. Water comes out of the basin's
// physical ledger and enters the bag as a harvest (src:harvest); wood leaves the forest's reserve account
// for the bag account, so both flows are ledgered and the job is refused when the source cannot give it.
function fetchInputs(work,e,scoped,id,home,r,batches,at,key){
 for(const m of r.materials){
  if(!provisionRule(e,m.item))continue;
  const lack=m.amount*batches-scoped.quantity(work,id,m.item);if(lack<=0)continue;
  const via=provisionJourney(work,e,scoped,id,work.get('state'),home,m.item,m.amount,at);if(!via)throw Error(`no source for ${m.item}`);
  const units=lack;
  const eventId=`${key}:fetch:${m.item}`;
  if(via.source==='water'){
   const unit=liquidPortionMl(e,'water');
   if(drawHouseholdWater(work,e,via.journey,units*unit,Math.floor(at/DAY))<units*unit)throw Error('取水不足');
   changeItems(work,scoped,id,m.item,units,{books:{flow:'src:harvest',purpose:'draw_water',writer:'household-food',eventId}});
  }else{
   // The bag count is written first (it reads the stock before the wood arrives); the forest ledger then books the move.
   changeItems(work,scoped,id,m.item,units,{books:BOOKED});
   if(cutHouseholdWood(work,e,via.journey.location,units,at,bag(scoped,id,m.item),eventId)!==units)throw Error('林木存量不足');
  }
 }
}
function start(d,e,id,at){
 const s=d.get('state'),row=ownerRow(s,id),group=statisticalFoodAccount(s,id),home=homeOf(e,s,id);
 if(!row||at%DAY<START||at%DAY>=END||householdFoodBusy(s,id,at)||!group&&!s.family?.subsistence?.[1]?.[id])return;
 // One cook per household at a time: housemates share the same free stock and utensils.
 if(!group){const mates=new Set(householdResources(d,e,id,{marketSubstitution:false}).rows.map(r=>r.holder));if(jobs(s).some(j=>j.status==='working'&&j.owner!==id&&mates.has(j.owner)&&j.start<at+1&&at<j.finish))return;}
 const need=group?statisticalFoodNeed(e,s,group.settlement,d,group):householdMealPlan(d,e,id).shortfall.satiety;
 if(!(need>0))return;
 const scoped=statisticalFoodEngine(e,s);
 for(const [item,v]of Object.entries(row.inventory??{}).sort(([a],[b])=>a.localeCompare(b))){
  if(!quantity(v)||e.byId.get(item)?.nutrition?.satiety>0)continue;
  const plan=householdFoodConversion(d,e,id,item,at);if(!plan)continue;
  const r=e.byId.get(plan.chain[0]);
  let batches=Math.min(Math.ceil(need/plan.gain),Math.floor(quantity(v)/plan.raw),Math.floor(plan.maximum/plan.raw));
  for(const m of r.materials)if(!plan.provided.includes(m.item))batches=Math.min(batches,Math.floor(inputStock(d,scoped,id,m.item)/m.amount));
  if(!group)batches=Math.min(batches,1);
  const workers=group?Math.max(1,Math.min(Math.floor(group.workCapacity/480),...(r.tools??[]).map(i=>scoped.quantity(d,id,i)))):1;
  const minutes=Math.ceil(r.minutes/(facilityView(e,s,home)?.factor||1))+plan.prep,elapsed=Math.ceil(batches/workers)*minutes;
  if(!batches||at%DAY+elapsed>END)continue;
  let borrowed=null;
  if(!group){const work=e.primitiveDraft(d.document);
   try{gather(work,e,id,r,`household-food:${id}:${at}`);fetchInputs(work,e,scoped,id,home,r,batches,at,`household-food:${id}:${at}`);validateAutonomyAction(work,e,id,{kind:'craft',recipe:r.id},{at,household:true});borrowed=work;}catch{continue;}
   const time=householdWorkTime(e,s,id,at,{workMinutes:0});if(!time.unused.some(w=>w.start<=at%DAY&&w.end>=at%DAY+minutes))continue;
  }else if(plan.provided.length){const work=e.primitiveDraft(d.document);
   try{fetchInputs(work,e,scoped,id,home,r,batches,at,`household-food:${id}:${at}`);borrowed=work;}catch{continue;}
  }
  const key=`household-food:${id}:${at}`,job={id:key,category:'household_processing',owner:id,home,recipe:r.id,batches,day:Math.floor(at/DAY),start:at,finish:at+elapsed,status:'working'};
  if(borrowed)for(const p of borrowed.patches)p.op==='delete'?d.remove(p.path):d.set(p.path,p.value);
  reserve(d,e,id,at,batches*minutes,home);d.set(['state','records',key],job);return;
 }
}
function groupCraft(d,e,id,j,key){
 const s=d.get('state'),row=statisticalFoodAccount(s,id),r=e.byId.get(j.recipe),scoped=statisticalFoodEngine(e,s);
 if(!recipesFor(e,s,id,j.home).some(v=>v.id===r.id)||toolCapacity(d,scoped,id,r)<j.batches)throw Error('加工工具或设施已不可用');
 for(const m of r.materials)if(inputStock(d,scoped,id,m.item)<m.amount*j.batches)throw Error('加工材料不足');
 const station=(facilityView(e,s,j.home)?.workstations??e.byId.get(j.home)?.workstations??[]).find(w=>w.kind===r.workstation),fee=station?.owner===id?0:(station?.fee??0)*j.batches;
 if(row.coins<fee)throw Error('工坊费用不足');
 const die=rollDice(d.document.randomSeed,'npc-craft',key,j.start,0,20),outcome=craftOutcome(e,{skill:row.skills?.[r.skill]??0,score:row.attributes?.[r.attribute??e.byId.get(r.skill)?.attribute??'智力']??10,toolBonus:npcToolBonus(d,scoped,id,r),difficulty:r.difficulty,die});
 if(fee){moveCoins(d,{from:purse(e,id),to:station.owner?.startsWith('npc_')?purse(e,station.owner):workshopFund(station.id),amount:fee,writer:'household-food',eventId:key});d.set(['state','records',id,'coins'],row.coins-fee);if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+fee);else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+fee);}
 const inputs={},outputs={};
 for(const m of r.materials){const amount=m.amount*j.batches;changeItems(d,scoped,id,m.item,-amount,{books:craftInput('household-food',key)});inputs[m.item]=(inputs[m.item]??0)+amount;
  if(!outcome.success){const n=Math.floor(m.amount*(r.failure?.recoverFraction??0))*j.batches;if(n)outputs[m.item]=(outputs[m.item]??0)+n;}}
 if(outcome.success)for(const p of [r.output,...r.byproducts??[]])outputs[p.item]=(outputs[p.item]??0)+(p.quantity??p.amount)*j.batches;
 for(const [item,n]of Object.entries(outputs))changeItems(d,scoped,id,item,n,{books:craftOutput('household-food',key)});
 for(const tool of r.tools??[]){
  changeItems(d,scoped,id,tool,0);const held=heldUnit(d,scoped,id,tool),count=scoped.quantity(d,id,tool),wear=(r.toolWear??1)*j.batches;
  if(held?.instance){let left=wear;while(left>0){const unit=heldUnit(d,scoped,id,tool),used=Math.min(left,unit?.durability??0);if(!used)throw Error('工具耐久不足');wearItem(d,scoped,id,tool,used);left-=used;}}
  else {const total=count*(held?.durability??e.byId.get(tool).durability)-(held?.wearRemainder??0)-wear,durability=Math.ceil(total/count);d.set([...scoped.bagPath(id),tool,'durability'],durability);d.set([...scoped.bagPath(id),tool,'wearRemainder'],durability*count-total);}
 }
 recordCraft(d,{recipe:r.id,batches:j.batches,inputs,outputs,writer:'household-food',eventId:key});
 // Reuse the existing daily/skill practice caps through a storage projection;
 // the cohort remains a collective and is never admitted as a campaign NPC.
 const growthDraft={get(...p){if(p.length===1&&p[0]==='state'){const state=d.get('state');return {...state,npcs:{...state.npcs,[id]:state.records[id]}};}return d.get(...(p[0]==='state'&&p[1]==='npcs'&&p[2]===id?['state','records',...p.slice(2)]:p));},set(p,v){d.set(p[0]==='state'&&p[1]==='npcs'&&p[2]===id?['state','records',...p.slice(2)]:p,v);}};
 npcWorkGrowth(growthDraft,e,id,r.skill,outcome.success,j.start);
 return {outcome,outputs};
}
export function advanceHouseholdFood(d,e,before,after){
 if(!e.rules.householdSubsistence)return;
 if(after%DAY===600)planHouseholdFood(d,e,after);
 const completed=[];
 for(const j of jobs(d.get('state')).filter(j=>j.status==='working'&&j.finish<=after)){
  const key=j.id;
  // Remove only the live lock; its actual chore/labor debit stays for the day.
  d.set(['state','records',key,'status'],'settling');
  try{
   let result;
   if(statisticalFoodAccount(d.get('state'),j.owner)){
    const work=e.primitiveDraft(d.document);result=groupCraft(work,e,j.owner,j,key);
    for(const p of work.patches)p.op==='delete'?d.remove(p.path):d.set(p.path,p.value);
   }else result=executeAutonomyAction(d,e,j.owner,{kind:'craft',recipe:j.recipe},{at:j.finish,start:j.start,actionId:key,presence:d.get('state'),ignoreTask:true,household:true});
   d.set(['state','records',key],{...j,status:result.outcome.success?'done':'failed',outcome:result.outcome,outputs:result.outputs??Object.fromEntries(result.produced.map(p=>[p.item,p.amount]))});
  }catch(error){d.set(['state','records',key],{...j,status:'failed',reason:error.message});}
  completed.push(j.owner);
 }
 const planned=d.get('state','family','foodProcessing');
 if(planned?.[0]===Math.floor(after/DAY))for(const [id,at]of planned[1])if(before<at&&at<=after){prepareHouseholdSubsistence(d,e,Math.floor(at/DAY));start(d,e,id,at);}
 for(const id of new Set(completed))start(d,e,id,after);
}
