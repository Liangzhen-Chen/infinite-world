import {preconditionFailure} from './precondition.mjs';
import {purse,sink,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('seasonal-hazards',{sinks:['sink:export']});
import {allFacilities,within as facilityWithin} from './facility-state.mjs';
// U3 seasonal and disaster world clocks (rules.hazardClock; data in
// world/design/seasonal-hazards.mjs). A separate table and record category
// ('hazard_clock') from the reviewed grain monitors in rules.worldClock, whose
// phases are untouched.
//
// Each clock checks its next stage on fixed days of its season window. Rolls
// are keyed by campaign seed, clock and absolute day, so long and short waits
// and replays agree. Stage effects are K6 effect kinds applied through
// effects.mjs (applyEffects); this module only registers the new kinds:
//   route_closure  flood closes routes (decided purely from seed, see hazard-calendar)
//   flood          soaks place features through the K2 'flood' interaction
//   crop_damage    lowers the standing crop (managed fields) or field output;
//                  cause 'drought' is eased by this season's irrigation (U10)
//   price_shift    scales the seasonal price coefficient of settlement-trade
//   famine         marks a famine: livelihood moves and food needs (npc-life / npc-intelligence)
//   epidemic       starts a named disease spreading between households and along routes
//   epidemic_measure  treatment, quarantine, purified water, ritual (player measures)
import {registerEffect,assertEffect,applyEffects} from './effects.mjs';
import {applyInteraction} from './interactions.mjs';
import {environmentFeatures} from './environment.mjs';
import {waterExposure} from './water-cycle.mjs';
import {contractIllness,householdMembers} from './npc-life.mjs';
import {famineAt} from './hazard-calendar.mjs';
import {droughtRelief,purifiedWaterFactor} from './magic-economy.mjs';
import {hazardClocks,hazardKey,hazardRoll,isPureClock,isHazardTick,pureHazardFires,pureHazardPhase,pureConditionMet,hazardRouteClosed,PURE_CONDITIONS} from './hazard-calendar.mjs';

const DAY=1440,YEAR=360*DAY,int=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const KINDS=['flood','famine','epidemic','price'],WEATHER=['clear','cloudy','rain','storm','snow','fog'];
const CONDITIONS=[...PURE_CONDITIONS,'granary_short','hunger','hazard_phase','epidemic_cases','epidemic_clear','all'];
const CAUSES=['drought','flood','frost','hail','pest'],ROUTES=['water','contact','air'],MEASURES=['quarantine','treatment','purify','ritual'];
const table=engine=>engine.rules.hazardClock;
const locationKnown=(engine,id)=>engine.world.locations.some(l=>l.id===id);
const diseaseOf=(engine,id)=>table(engine)?.diseases?.find(x=>x.id===id);
const span=v=>Array.isArray(v)&&v.length===2&&int(v[0],1,365)&&int(v[1],v[0],365);
const share=v=>Number.isFinite(v)&&v>=0&&v<=1;
const yearOf=minute=>Math.floor(minute/YEAR);
const epidemicKey=(clock,year)=>`epidemic:${clock}:${year+1}`;
const shiftKey=context=>context.clock??context.sourceEvent;

// ---- Effect kinds -----------------------------------------------------------
registerEffect('route_closure',{
 validate(engine,e){if(!Array.isArray(e.routes)||!e.routes.length||e.routes.some(id=>!engine.world.routes.some(r=>r.id===id))||!int(e.minutes,1,90*DAY))throw Error('封路效果路线或时长无效');},
 // The closure itself is read from the seeded stage history (hazardRouteClosed),
 // so route planning, NPC walks and replays agree; this keeps the public notice.
 apply(d,engine,e,context){
  for(const route of e.routes)d.set(['state','records',`hazard-route:${route}`],{category:'hazard_route',route,since:context.minute,until:context.minute+e.minutes,clock:context.clock??null,reason:e.reason??null,sourceEvent:context.sourceEvent});
  return {applied:true,...e,until:context.minute+e.minutes};
 },
});
registerEffect('flood',{
 validate(engine,e){if(!Array.isArray(e.locations)||!e.locations.length||e.locations.some(id=>!locationKnown(engine,id))||!int(e.minutes,1,90*DAY))throw Error('受淹效果地点或时长无效');},
 apply(d,engine,e,context){
  const soaked=[];
  for(const b of allFacilities(engine,d.get('state')))if(e.locations.some(id=>facilityWithin(engine,d.get('state'),b.id,id)))applyInteraction(d,engine,{agent:'flood',target:b.id,minute:context.minute,sourceEvent:context.sourceEvent});
  for(const row of environmentFeatures(engine).filter(f=>e.locations.includes(f.location)))
   if(applyInteraction(d,engine,{agent:'flood',target:row.id}).added.includes('wet'))soaked.push(row.id);
  for(const location of e.locations)d.set(['state','records',`hazard-flood:${location}`],{category:'hazard_flood',location,since:context.minute,until:context.minute+e.minutes,soaked:soaked.filter(id=>environmentFeatures(engine).find(f=>f.id===id).location===location),sourceEvent:context.sourceEvent});
  return {applied:true,...e,soaked};
 },
});
registerEffect('crop_damage',{
 validate(engine,e){if(!locationKnown(engine,e.settlement)||!int(e.percent,1,90)||!int(e.minutes,1,360*DAY)||e.cause!==undefined&&!CAUSES.includes(e.cause))throw Error('减产效果地点、比例、时长或成因无效');},
 apply(d,engine,e,context){
  const ledger=d.get('state','settlements',e.settlement);if(!ledger)return {applied:false,reason:'受灾聚落没有钱粮账'};
  // U10: this season's irrigation (magic-economy) absorbs part of a drought.
  const relief=e.cause==='drought'?droughtRelief(engine,d.get('state'),e.settlement,context.minute):0;
  if(relief)e={...e,percent:Math.round(e.percent*(1000-relief)/1000),irrigationReliefPermille:relief};
  const farm=d.get('state','records',`agriculture:${e.settlement}`),keep=(100-e.percent)/100;
  // Managed fields: the standing crop not yet cut loses quality, so its
  // harvest is lower; grain already harvested is never taken back.
  if(farm?.mode==='managed'){
   const r=structuredClone(farm);let cohorts=0;
   for(const row of r.field.cohorts)if(!row.harvestedUnits){row.qualitySum*=keep;cohorts++;}
   d.set(['state','records',`agriculture:${e.settlement}`],r);
   return {applied:true,...e,managed:true,cohorts};
  }
  const key=`hazard-yield:${e.settlement}`,old=d.get('state','records',key);
  const shifts=Object.fromEntries(Object.entries(old?.shifts??{}).filter(([,s])=>s.until>context.minute));
  shifts[shiftKey(context)]={factor:keep,since:context.minute,until:context.minute+e.minutes,sourceEvent:context.sourceEvent};
  d.set(['state','records',key],{category:'hazard_yield',settlement:e.settlement,shifts});
  return {applied:true,...e,managed:false,factor:keep};
 },
});
registerEffect('price_shift',{
 validate(engine,e){
  if(!locationKnown(engine,e.settlement)||!(Number.isFinite(e.factor)&&e.factor>=0.5&&e.factor<=3)||!int(e.minutes,1,360*DAY))throw Error('物价波动地点、倍率或时长无效');
  if(e.items!==undefined&&(!Array.isArray(e.items)||!e.items.length||e.items.some(id=>!engine.world.items.some(i=>i.id===id))))throw Error('物价波动物品未登记');
 },
 apply(d,engine,e,context){
  const key=`hazard-price:${e.settlement}`,old=d.get('state','records',key);
  const shifts=Object.fromEntries(Object.entries(old?.shifts??{}).filter(([,s])=>s.until>context.minute));
  shifts[shiftKey(context)]={factor:e.factor,...(e.items?{items:e.items}:{}),since:context.minute,until:context.minute+e.minutes,reason:e.reason??null,sourceEvent:context.sourceEvent};
  d.set(['state','records',key],{category:'hazard_price',settlement:e.settlement,shifts});
  return {applied:true,...e};
 },
});
registerEffect('famine',{
 validate(engine,e){if(!locationKnown(engine,e.settlement)||!int(e.minutes,1,360*DAY))throw Error('饥荒效果地点或时长无效');},
 apply(d,engine,e,context){
  if(!d.get('state','settlements',e.settlement))return {applied:false,reason:'受灾聚落没有钱粮账'};
  d.set(['state','records',`hazard-famine:${e.settlement}`],{category:'hazard_famine',settlement:e.settlement,since:context.minute,until:context.minute+e.minutes,clock:context.clock??null,sourceEvent:context.sourceEvent});
  return {applied:true,...e};
 },
});
const housesIn=(engine,settlement)=>(engine.world.households??[]).filter(h=>h.settlement===settlement).map(h=>h.id).sort();
registerEffect('epidemic',{
 validate(engine,e){if(!diseaseOf(engine,e.disease)||!locationKnown(engine,e.settlement)||!int(e.cases,1,10))throw Error('疫病效果病名、地点或病例数无效');},
 apply(d,engine,e,context){
  const year=yearOf(context.minute),key=epidemicKey(shiftKey(context),year),seed=d.document.randomSeed,day=context.minute/DAY;
  if(d.get('state','records',key))return {applied:false,reason:'本年疫病已经起过'};
  const houses=housesIn(engine,e.settlement);if(!houses.length)return {applied:false,reason:'受灾聚落没有登记住户'};
  const ep={category:'epidemic',id:key,clock:context.clock??null,disease:e.disease,origin:e.settlement,since:context.minute,status:'流行',settlements:[e.settlement],households:{},measures:[],sourceEvent:context.sourceEvent};
  for(let i=0;i<e.cases;i++){
   const left=houses.filter(h=>!ep.households[h]);if(!left.length)break;
   infect(engine,seed,ep,left[Math.floor(hazardRoll(seed,`epi-index:${key}:${i}`,day)*left.length)],e.settlement,context.minute,{source:'index'});
  }
  d.set(['state','records',key],ep);
  return {applied:true,...e,epidemic:key,households:Object.keys(ep.households)};
 },
});
registerEffect('epidemic_measure',{
 validate(engine,e){if(!MEASURES.includes(e.measure)||!table(engine)?.measures?.[e.measure]||!int(e.minutes,1,90*DAY))throw Error('防疫办法或时长无效');},
 apply(d,engine,e,context){
  const key=epidemicKey(shiftKey(context),yearOf(context.minute)),ep=structuredClone(d.get('state','records',key)??null);
  if(ep?.category!=='epidemic'||ep.status!=='流行')return {applied:false,reason:'眼下没有正在流行的疫病'};
  const settlement=e.settlement??context.settlement;
  ep.measures.push({measure:e.measure,settlement,since:context.minute,until:context.minute+e.minutes,sourceEvent:context.sourceEvent});
  // Treatment also lowers the odds of the patients already in bed there.
  if(e.measure==='treatment'){
   const f=table(engine).measures.treatment.fatality;
   for(const h of Object.values(ep.households))if(h.settlement===settlement&&h.status==='发病')for(const id of h.patients){
    const ill=Object.values(d.get('state','family','illnesses')??{}).find(r=>r.patient===id&&r.epidemic===key&&r.status==='患病中');
    if(ill&&!ill.treated)d.set(['state','family','illnesses',ill.id],{...ill,treated:context.sourceEvent,fatality:{cared:ill.fatality.cared*f,alone:ill.fatality.alone*f}});
   }
  }
  d.set(['state','records',key],ep);
  return {applied:true,...e,epidemic:key,settlement};
 },
});

// ---- Rules ------------------------------------------------------------------
function assertCondition(engine,r,c,ids,nested=false){
 if(!CONDITIONS.includes(c?.kind)||nested&&c.kind==='all')throw Error(`灾害时钟条件无效：${r.id}`);
 if(c.kind==='all'&&(!Array.isArray(c.conditions)||c.conditions.length<2))throw Error(`灾害时钟组合条件无效：${r.id}`);
 for(const x of c.conditions??[])assertCondition(engine,r,x,ids,true);
 if(c.kind==='weather'&&(!Array.isArray(c.kinds)||!c.kinds.length||c.kinds.some(k=>!WEATHER.includes(k))||c.location!==undefined&&!locationKnown(engine,c.location)))throw Error(`灾害时钟天气条件无效：${r.id}`);
 if(c.kind==='granary_short'&&!int(c.days,1,3600))throw Error(`灾害时钟存粮条件无效：${r.id}`);
 if(c.kind==='hazard_phase'&&(!ids.has(c.clock)||c.clock===r.id||!int(c.minimum,1,20)))throw Error(`灾害时钟前置时钟无效：${r.id}`);
 if(['epidemic_cases','epidemic_clear'].includes(c.kind)&&(r.kind!=='epidemic'||c.kind==='epidemic_cases'&&!int(c.minimum,1,1000)))throw Error(`疫情条件只用于疫病时钟：${r.id}`);
}
const checked=new WeakSet();
export function assertHazardRules(engine){
 const t=table(engine);if(!t||checked.has(t))return;
 if(t.version!==1||!t.source||!Array.isArray(t.clocks)||!Array.isArray(t.diseases??[])||typeof (t.measures??{})!=='object')throw Error('灾害时钟规则版本无效');
 const diseases=new Set();
 for(const x of t.diseases??[]){
  if(!x.id||diseases.has(x.id)||!x.name||!x.symptoms||!ROUTES.includes(x.route)||!span(x.incubationDays)||!span(x.courseDays)||!(Number.isFinite(x.householdRate)&&x.householdRate>=0&&x.householdRate<=10)||!share(x.routeRate)||!share(x.graveShare)||!share(x.fatality?.cared)||!share(x.fatality?.alone)||x.fatality.cared>x.fatality.alone)throw Error(`疫病登记无效：${x.id}`);
  diseases.add(x.id);
 }
 for(const [k,m] of Object.entries(t.measures??{}))if(!MEASURES.includes(k)||Object.entries(m).some(([f,v])=>f==='routes'?!Array.isArray(v)||v.some(r=>!ROUTES.includes(r)):!(Number.isFinite(v)&&v>0&&v<=1)))throw Error(`防疫办法无效：${k}`);
 const ids=new Set(t.clocks.map(r=>r.id));if(ids.size!==t.clocks.length)throw Error('灾害时钟编号重复');
 for(const r of t.clocks){
  if(!r.id||!KINDS.includes(r.kind)||!r.name||!locationKnown(engine,r.settlement)||!Array.isArray(r.seasons)||!r.seasons.length||r.seasons.some((s,i)=>!int(s,0,3)||i&&s!==r.seasons[i-1]+1)||!int(r.intervalDays,1,90)||!Array.isArray(r.stages)||!r.stages.length)throw Error(`灾害时钟地点、季节或间隔无效：${r.id}`);
  if(r.kind==='epidemic'&&(!diseases.has(r.disease)||!Array.isArray(r.spread?.routes)||r.spread.routes.some(id=>!engine.world.routes.some(e=>e.id===id))))throw Error(`疫病时钟病名或传播路线无效：${r.id}`);
  const stages=new Set();
  for(const s of r.stages){
   const c=s.condition;
   if(!s.id||stages.has(s.id)||!s.name||!share(s.probability)||!CONDITIONS.includes(c?.kind)||!Array.isArray(s.effects)||!s.effects.length)throw Error(`灾害时钟阶段无效：${r.id}/${s.id}`);
   stages.add(s.id);
   assertCondition(engine,r,c,ids);
   for(const e of s.effects){
    assertEffect(engine,e,'world');
    if(e.kind==='route_closure'&&!isPureClock(r))throw Error(`封路只能由纯天气与概率推进的时钟触发：${r.id}`);
    if(e.kind==='epidemic'&&r.kind!=='epidemic')throw Error(`疫病只能由疫病时钟引发：${r.id}`);
   }
  }
  const choices=new Set();
  for(const a of r.interventions??[]){
   if(r.kind!=='epidemic'||!a.id||choices.has(a.id)||!a.name||!MEASURES.includes(a.measure)||!Array.isArray(a.phases)||!a.phases.length||a.phases.some(p=>!int(p,1,r.stages.length))||!locationKnown(engine,a.location)||!int(a.minutes,1,720)
    ||a.representative!==undefined&&!engine.world.npcs.some(n=>n.id===a.representative)||a.spell!==undefined&&!engine.world.spells?.some(s=>s.id===a.spell)
    ||Object.entries(a.cost??{}).some(([k,v])=>!['coins','mp'].includes(k)||!int(v,0,100000))||a.difficulty!==undefined&&(!int(a.difficulty,1,40)||!engine.rules.attributes.includes(a.attribute))||!Array.isArray(a.effects)||!a.effects.length)throw Error(`灾害干预办法无效：${r.id}/${a.id}`);
   choices.add(a.id);for(const e of a.effects)assertEffect(engine,e,'world');
  }
 }
 checked.add(t);
}
// World validation entry: the effect validators only read rules, world and ids.
export function validateHazardRules(world){
 if(!world.rules.hazardClock)return [];
 const byId=new Map();for(const key of ['locations','npcs','items','factions','cultures','spells','monsters'])for(const x of world[key]??[])byId.set(x.id,x);
 try{assertHazardRules({world,rules:world.rules,byId});return [];}catch(error){return [error.message];}
}

// ---- Clocks -----------------------------------------------------------------
function conditionMet(d,engine,rule,c,at){
 const state=d.get('state'),seed=d.document.randomSeed,year=yearOf(at);
 switch(c.kind){
 case 'always':case 'weather':return pureConditionMet(engine,seed,rule,c,at/DAY);
 case 'hunger':{const s=state.settlements?.[rule.settlement],value=s?.starvation??0;return {met:value>0||Boolean(famineAt(state,rule.settlement,at)),value,evidence:`settlement:${rule.settlement}`};}
 case 'all':{const parts=c.conditions.map(x=>conditionMet(d,engine,rule,x,at));return {met:parts.every(x=>x.met),value:parts.map(x=>x.value??null),evidence:parts.map(x=>x.evidence??null)};}
 case 'granary_short':{const s=state.settlements?.[rule.settlement];const value=s?.food??null;return {met:Boolean(s)&&s.population>0&&s.food<s.population*c.days,value,evidence:`settlement:${rule.settlement}`};}
 case 'hazard_phase':{const other=hazardClocks(engine).find(r=>r.id===c.clock),value=phaseOf(d,engine,other,at);return {met:value>=c.minimum,value,evidence:hazardKey(c.clock)};}
 case 'epidemic_cases':{const ep=state.records?.[epidemicKey(rule.id,year)],value=ep?Object.keys(ep.households).length:0;return {met:value>=c.minimum,value,evidence:ep?.id??null};}
 case 'epidemic_clear':{const ep=state.records?.[epidemicKey(rule.id,year)];return {met:ep?.status==='平息',value:ep?.status??null,evidence:ep?.id??null};}
 default:throw Error(`灾害时钟不支持条件：${c.kind}`);
 }
}
// Stages passed this year. A pure clock is read from its seeded history so
// it agrees with route closures even before its record is written.
export function phaseOf(d,engine,rule,at=d.get('state','minute')){
 if(isPureClock(rule))return pureHazardPhase(engine,d.document.randomSeed,rule,at);
 const row=d.get('state','records',hazardKey(rule.id));return row?.year===yearOf(at)+1?row.phase:0;
}
function tick(d,engine,rule,at){
 const key=hazardKey(rule.id),seed=d.document.randomSeed,year=yearOf(at),day=at/DAY;
 let row=d.get('state','records',key);
 if(row?.lastTick>=at)return;
 const phase=row?.year===year+1?row.phase:0;
 let stage,trigger,roll,next;
 if(isPureClock(rule)){
  const fire=pureHazardFires(engine,seed,rule,year).find(f=>f.minute===at);if(!fire)return;
  stage=rule.stages[fire.phase-1];trigger=fire.trigger;roll=fire.roll;next=fire.phase;
 }else{
  stage=rule.stages[phase];if(!stage)return;
  trigger=conditionMet(d,engine,rule,stage.condition,at);roll=hazardRoll(seed,rule.id,day);
  if(!(trigger.met&&roll<stage.probability))return;
  next=phase+1;
 }
 const sourceEvent=`hazard:${rule.id}:${at}`;
 const receipt=applyEffects(d,engine,stage.effects,{settlement:rule.settlement,faction:null,minute:at,sourceEvent,clock:rule.id},'world');
 // A refused stage of a stateful clock waits for its next check; a pure
 // clock's stage has happened in the seeded world either way.
 if(!receipt.applied&&!isPureClock(rule))next=phase;
 row=d.get('state','records',key);
 const same=row?.year===year+1;
 d.set(['state','records',key],{category:'hazard_clock',id:rule.id,kind:rule.kind,settlement:rule.settlement,year:year+1,phase:next,lastTick:at,
  interventions:same?row.interventions??[]:[],
  history:[...(same?row.history:[]),{minute:at,phase:next,stage:stage.id,name:stage.name,trigger,roll,sourceEvent,applied:receipt.applied,...(receipt.applied?{effects:receipt.effects.map(e=>e.kind)}:{reason:receipt.reason??'效果条件未满足'})}]});
}

// ---- Epidemic spread ----------------------------------------------------------
const pick=([low,high],r)=>low+Math.floor(r*(high-low+1));
function measureFactor(engine,ep,settlement,at,field,disease){
 let f=1;
 for(const m of ep.measures)if(m.settlement===settlement&&m.since<=at&&at<m.until){
  const rule=table(engine).measures[m.measure];if(rule.routes&&!rule.routes.includes(disease.route))continue;
  f*=rule[field]??1;
 }
 return f;
}
function infect(engine,seed,ep,house,settlement,at,detail){
 const disease=diseaseOf(engine,ep.disease),day=at/DAY;
 const incubation=pick(disease.incubationDays,hazardRoll(seed,`epi-incubation:${ep.id}:${house}`,day));
 let course=pick(disease.courseDays,hazardRoll(seed,`epi-course:${ep.id}:${house}`,day));
 course=Math.max(1,Math.round(course*measureFactor(engine,ep,settlement,at,'course',disease)));
 ep.households[house]={settlement,status:'潜伏',exposedAt:at,infectiousAt:at+incubation*DAY,recoversAt:at+(incubation+course)*DAY,patients:[],...detail};
 if(!ep.settlements.includes(settlement))ep.settlements.push(settlement);
}
const lifeOn=engine=>Boolean(engine.rules.npcLife?.health)&&engine.world.npcs.some(n=>n.tier==='full');
// The settlement (with registered households) a route endpoint belongs to.
function endpoint(engine,location){
 const seen=new Set();
 while(location&&!seen.has(location)){if(engine.world.households?.some(h=>h.settlement===location))return location;seen.add(location);location=engine.byId.get(location)?.parent;}
 return null;
}
function stepEpidemic(d,engine,rule,ep,at){
 const seed=d.document.randomSeed,day=at/DAY,disease=diseaseOf(engine,ep.disease);
 // 1. Course: incubation ends, the sick recover.
 for(const id of Object.keys(ep.households).sort()){
  const h=ep.households[id];
  if(h.status==='潜伏'&&at>=h.infectiousAt){
   h.status='发病';
   if(lifeOn(engine))for(const person of householdMembers(engine,d.get('state'),id).sort()){
    const severity=hazardRoll(seed,`epi-severity:${ep.id}:${person}`,day)<disease.graveShare?'重':'轻';
    const treated=measureFactor(engine,ep,h.settlement,at,'fatality',disease);
    const ill=contractIllness(d,engine,person,at,{severity,days:Math.max(1,Math.round((h.recoversAt-h.infectiousAt)/DAY)),
     disease:{id:disease.id,name:disease.name,symptoms:disease.symptoms,epidemic:ep.id,fatality:{cared:disease.fatality.cared*treated,alone:disease.fatality.alone*treated}}});
    if(ill)h.patients.push(person);
   }
  }else if(h.status==='发病'&&at>=h.recoversAt)h.status='痊愈';
 }
 const sick=s=>Object.values(ep.households).filter(h=>h.settlement===s&&h.status==='发病').length;
 const counts=Object.fromEntries(ep.settlements.map(s=>[s,sick(s)]));
 // 2. Between households of one settlement.
 for(const s of [...ep.settlements].sort()){
  const n=counts[s];if(!n)continue;
  // householdRate: households one sick household reaches per day, spread over the settlement.
  const houses=housesIn(engine,s),beta=Math.min(1,disease.householdRate/houses.length)*measureFactor(engine,ep,s,at,'household',disease)*purifiedWaterFactor(engine,d.get('state'),s,at,'household',disease),p=1-(1-beta)**n;
  for(const house of houses)if(!ep.households[house]&&hazardRoll(seed,`epi:${ep.id}:${house}`,day)<p)infect(engine,seed,ep,house,s,at,{source:'household'});
 }
 // 3. Along open routes to the next settlement.
 const season=engine.calendar(at).season;
 for(const routeId of rule.spread.routes){
  const edge=engine.world.routes.find(e=>e.id===routeId),a=endpoint(engine,edge.from),b=endpoint(engine,edge.to);
  if(!a||!b||a===b||edge.closedSeasons.includes(season)||hazardRouteClosed(engine,seed,edge.id,at))continue;
  for(const [from,to] of [[a,b],[b,a]]){
   const n=counts[from]??0;if(!n)continue;
   const beta=disease.routeRate*Math.min(1,10/Math.max(1,edge.lengthKm))*measureFactor(engine,ep,from,at,'route',disease)*purifiedWaterFactor(engine,d.get('state'),from,at,'route',disease),p=1-(1-beta)**n;
   if(hazardRoll(seed,`epi-route:${ep.id}:${edge.id}:${to}`,day)>=p)continue;
   const left=housesIn(engine,to).filter(h=>!ep.households[h]);if(!left.length)continue;
   infect(engine,seed,ep,left[Math.floor(hazardRoll(seed,`epi-pick:${ep.id}:${to}`,day)*left.length)],to,at,{source:'route',from,via:edge.id});
  }
 }
 if(!Object.values(ep.households).some(h=>['潜伏','发病'].includes(h.status))){ep.status='平息';ep.endedAt=at;}
 d.set(['state','records',ep.id],ep);
}
function advanceEpidemics(d,engine,at){
 for(const ep of Object.values(d.get('state','records')??{}).filter(r=>r.category==='epidemic'&&r.waterExposure&&r.status==='流行'&&r.since<at))stepEpidemic(d,engine,{spread:{routes:[]}},structuredClone(ep),at);
 for(const rule of hazardClocks(engine))if(rule.kind==='epidemic')for(const y of [yearOf(at)-1,yearOf(at)]){
  const ep=y>=0?d.get('state','records',epidemicKey(rule.id,y)):null;
  if(ep?.status==='流行'&&ep.since<at)stepEpidemic(d,engine,rule,structuredClone(ep),at);
 }
}
// Registered with the advance registry after the world clocks. Every
// midnight in (before, after] is settled once, with the state of that midnight.
export function advanceHazardClocks(d,engine,{before,after}){
 const rules=hazardClocks(engine);if(!rules.length&&!engine.rules.forestWater)return;
 assertHazardRules(engine);
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
  const at=day*DAY;
  advanceEpidemics(d,engine,at);
  exposeDrinkingWater(d,engine,day-1,at);
  for(const rule of rules)if(isHazardTick(rule,day))tick(d,engine,rule,at);
 }
}

// Use U3's household incubation, course and actual illness consumer. Water
// exposure has its own stable outbreak id and does not advance a disaster clock.
function exposeDrinkingWater(d,engine,day,at){
 const r=engine.rules.forestWater?.water,disease=table(engine)?.diseases?.find(x=>x.route==='water');if(!r||!disease)return;
 for(const settlement of Object.keys(d.get('state','settlements')??{})){
  const water=waterExposure(engine,d.get('state'),settlement);if(water?.day!==day||!water.takenMl||water.pathogenRisk<r.diseaseThreshold)continue;
  const rule=hazardClocks(engine).find(c=>c.kind==='epidemic'&&c.settlement===settlement&&c.disease===disease.id);
  const key=rule?epidemicKey(rule.id,yearOf(at)):`epidemic:water:${settlement}:${disease.id}:${yearOf(at)}`,old=d.get('state','records',key);
  const ep=structuredClone(old??{category:'epidemic',id:key,clock:rule?.id??null,waterExposure:!rule,disease:disease.id,origin:settlement,since:at,status:'流行',settlements:[settlement],households:{},measures:[],sourceEvent:`water:${settlement}:${day}`});
  const candidates=housesIn(engine,settlement).filter(h=>!ep.households[h]),chance=Math.min(1,r.exposureRate*water.pathogenRisk/100)*measureFactor(engine,ep,settlement,at,'household',disease);
  for(const house of candidates)if(hazardRoll(d.document.randomSeed,`water:${settlement}:${house}`,day)<chance)infect(engine,d.document.randomSeed,ep,house,settlement,at,{source:'drinking_water',pathogenRisk:water.pathogenRisk});
  if(Object.keys(ep.households).length){ep.status='流行';d.set(['state','records',key],ep);}
 }
}

// ---- Player measures (world_settlement faction_inspect / faction_intervene) --
export const isHazardClock=(engine,id)=>hazardClocks(engine).some(r=>r.id===id);
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}
export function hazardClockAction(d,args,eventId){
 assertHazardRules(this);
 const rule=hazardClocks(this).find(r=>r.id===args.clock),minute=d.get('state','minute'),phase=phaseOf(d,this,rule,minute),here=d.get('state','location');
 const ep=rule.kind==='epidemic'?d.get('state','records',epidemicKey(rule.id,yearOf(minute))):null;
 if(args.operation==='faction_inspect'){
  if(!within(this,here,rule.settlement))throw preconditionFailure('须在受灾聚落内打听灾情');
  const disease=ep?diseaseOf(this,ep.disease):null;
  return {clock:rule.id,kind:rule.kind,name:rule.name,phase,stage:rule.stages[phase-1]?.name??null,
   ...(ep?{epidemic:{disease:disease.name,route:disease.route,symptoms:disease.symptoms,status:ep.status,households:Object.keys(ep.households).length,sick:Object.values(ep.households).filter(h=>h.status==='发病').length,settlements:ep.settlements}}:{}),
   choices:(rule.interventions??[]).filter(a=>a.phases.includes(phase)).map(a=>({id:a.id,name:a.name,location:a.location,cost:a.cost??{},minutes:a.minutes}))};
 }
 if(args.operation!=='faction_intervene')throw preconditionFailure('灾害时钟只能查看或干预');
 const action=rule.interventions?.find(a=>a.id===args.choice);
 if(!action)throw preconditionFailure('这场灾害没有该干预办法');
 if(!action.phases.includes(phase))throw preconditionFailure('当前灾情阶段不能用这个办法');
 if(here!==action.location)throw preconditionFailure('干预需要到登记地点');
 if(action.representative){
  const actor=d.get('state','npcs',action.representative);
  if(!actor||actor.location!==action.location||actor.scheduleTravel||actor.cognitionTravel||(actor.status??'正常')!=='正常'||/睡眠|睡觉|熟睡/.test(actor.activity??''))throw preconditionFailure('主事的人不在场或不能理事');
  this.assertNpcObligationAction(d,[action.representative],{minutes:action.minutes});
 }
 if(action.spell&&!d.get('state','spells',action.spell))throw preconditionFailure(`尚未学会${this.byId.get(action.spell)?.name??action.spell}`);
 const cost=action.cost??{},p=d.get('state','player');
 if((p.coins??0)<(cost.coins??0)||(p.mp??0)<(cost.mp??0))throw preconditionFailure('干预所需钱或魔力不足');
 if(cost.coins){moveCoins(d,{from:purse(this,'player'),to:sink('export','hazard_intervention'),amount:cost.coins,writer:'seasonal-hazards',eventId:eventId});d.set(['state','player','coins'],p.coins-cost.coins);}
 if(cost.mp)d.set(['state','player','mp'],p.mp-cost.mp);
 const check=action.difficulty===undefined?{success:true}:this.check(d,{attribute:action.attribute,difficulty:action.difficulty},eventId);
 let receipt=null;
 if(check.success){
  receipt=applyEffects(d,this,action.effects,{settlement:rule.settlement,faction:null,minute,sourceEvent:eventId,clock:rule.id},'world');
  if(!receipt.applied)throw Error(receipt.reason??'干预没有可作用的对象');
 }
 const key=hazardKey(rule.id),row=d.get('state','records',key),same=row?.year===yearOf(minute)+1;
 const entry={choice:action.id,measure:action.measure,minute,sourceEvent:eventId,cost,success:check.success};
 d.set(['state','records',key],{category:'hazard_clock',id:rule.id,kind:rule.kind,settlement:rule.settlement,year:yearOf(minute)+1,phase:same?row.phase:phase,lastTick:row?.lastTick??null,
  history:same?row.history:[],interventions:[...(same?row.interventions??[]:[]),entry]});
 this.advance(d,action.minutes,eventId);
 return {clock:rule.id,...entry,...check,
  // K3 world event: a successful measure is help to the settlement, so the
  // ordinary memory, rumor and standing subscribers see it.
  workEvent:check.success?{verb:'help',target:action.representative??null,value:cost.coins??0,tags:['hazard',rule.kind,action.measure],hazard:rule.id}:{verb:'hazard',target:null,tags:['hazard',rule.kind,action.measure,'attempt'],hazard:rule.id}};
}
