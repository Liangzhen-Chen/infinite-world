import {facilityView,installFacilityRuntime,facilityRuntime} from './facility-state.mjs';
import {knowledgeProficiency} from './education-state.mjs';
const worldEvent=(state,key)=>{const id=key?.replace(/^world_event:/,'');const row=state.records?.[`world_event:${id}`];return row?.category==='world_event'&&row.id===id?row:null;};
import {digest,recordsWhere,persistable} from './storage.mjs';
import {moveCoins,purse} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {aliveHoldings,holdingSet,declareHoldingWriter} from './holdings.mjs';
declareLedgerWriter('workstation-services');
declareHoldingWriter('workstation-services');

export function initializeRecipeDuration(d,engine,row,context){
 const base=engine.world.recipes.find(r=>r.id===row.id);
 if(context?.origin!=='initial'||!context.eventId||!base||!Number.isSafeInteger(row.minutes)||row.minutes<1||row.minutes>43200||typeof row.source!=='string'||!row.source)throw Error('Invalid initial recipe duration');
 d.set(['state','records',`recipe_duration:${row.id}`],{category:'recipe_duration',recipe:row.id,minutes:row.minutes,source:row.source,sourceEvent:context.eventId});
}
export function recipeOverrideCatalog(engine,document){
 return recordsWhere(document.state.records,'category','recipe_duration').map(row=>({...engine.byId.get(row.recipe),minutes:row.minutes}));
}
const serviceKey=id=>`service_quote:${id}`;
export function recordServiceQuote(d,engine,row,{actor=row.actor}={}){
 const s=d.get('state'),source=worldEvent(s,row.sourceEvent),p=source?.payload;
 const whole=n=>Number.isSafeInteger(n)&&n>=0;
 if(actor!==row.actor||!s.npcs?.[actor]||row.to!=='player'||typeof row.id!=='string'||!row.id||s.records?.[serviceKey(row.id)]||!whole(row.at)||row.at>s.minute||!whole(row.expires)||row.expires<=row.at||source?.actor!==actor||source?.verb!=='consented'||source.minute!==row.at||p?.to!==row.to||p.expires!==row.expires||p.revoked!==false)throw Error('Invalid service quote identity or source');
 if(row.resource==='repair'){
  if(p.scope!=='repair'||p.subject!==row.subject||p.terms?.fee!==row.totalCoins||p.terms?.minutes!==row.minutes||p.terms?.conditionAfter!==row.conditionAfter||!whole(row.totalCoins)||!whole(row.minutes)||row.minutes<1||!whole(row.conditionAfter)||row.conditionAfter>100)throw Error('Invalid repair agreement');
 }else{
  if(!engine.world.items.some(i=>i.id===row.resource)||row.direction!=='buy_from_player'||!whole(row.quantity)||row.quantity<1||!whole(row.totalCoins)||!row.conditions||Object.keys(row.conditions).some(k=>k!=='turbidityAtMost')||!whole(row.conditions.turbidityAtMost)||row.conditions.turbidityAtMost>100||p.scope!=='trade'||p.subject!==row.id||p.terms?.resource!==row.resource||p.terms?.quantity!==row.quantity||p.terms?.totalCoins!==row.totalCoins||p.terms?.maxTurbidity!==row.conditions.turbidityAtMost)throw Error('Invalid conditional trade agreement');
 }
 const value={...persistable(row),category:'service_quote'};
 d.set(['state','records',serviceKey(row.id)],value);
 d.set(['state','records',`${serviceKey(row.id)}:source`],{category:'service_quote_receipt',digest:digest(value)});return value;
}
export function currentServiceQuotes(s){
 return recordsWhere(s.records,'category','service_quote').filter(q=>s.records[`${serviceKey(q.id)}:source`]?.digest===digest(q)&&q.at<=s.minute&&s.minute<q.expires&&!s.records[`${serviceKey(q.id)}:used`]&&!s.records[`agreed_quote:${q.id}:used`]);
}
function assertServiceConsent(d,e,q,scope,subject,terms,until){
 if(!facilityRuntime().serviceConsent?.({engine:e,document:d.document},q.actor,'player',scope,{purpose:subject,subject,terms,until,onRefusal:'abort'}).allowed)throw Error('Service agreement is absent, expired or revoked');
}
export function conditionalTradeQuote(d,e,{seller,buyer,item,quantity,eventId,instances}){
 const s=d.get('state');
 const quotes=currentServiceQuotes(s).filter(q=>q.resource===item&&q.direction==='buy_from_player'&&q.actor===buyer&&q.quantity===quantity);
 if(seller!=='player'||!quotes.length)return null;
 if(quotes.length!==1)throw Error('Ambiguous conditional trade quote');
 const q=quotes[0];
 assertServiceConsent(d,e,q,'trade',q.id,{resource:item,quantity,totalCoins:q.totalCoins,maxTurbidity:q.conditions.turbidityAtMost},s.minute+5);
 // Only a unique native container binding identifies the quoted stock. A
 // proposal cannot substitute a water-quality claim for this measured batch.
 const batches=recordsWhere(s.records,'category','physical_liquid_binding').map(binding=>{
  const feature=s.records[`physical_feature:${binding.container}`],units=binding.units.map(id=>s.itemInstances?.[id]).filter(u=>u?.item===item&&u.container===binding.container&&aliveHoldings(d,{kind:'owns',subject:u.id,holder:seller}).length);
  return {binding,feature,units};
 }).filter(batch=>batch.units.length>=quantity);
 if(batches.length!==1||!Number.isFinite(batches[0].feature?.state?.turbidity)||batches[0].feature.state.turbidity>q.conditions.turbidityAtMost)throw Error('The same bound water batch does not satisfy the quote');
 if(s.npcs[buyer].location!==s.location||s.npcs[buyer].coins<q.totalCoins)throw Error('Conditional sale lacks presence or buyer funds');
 const selected=batches[0].units.slice(0,quantity).map(u=>u.id);
 if(instances&&(instances.length!==selected.length||instances.some(id=>!selected.includes(id))))throw Error('Conditional sale must use the quoted batch units');
 for(const id of selected)facilityRuntime().serviceTakeContainerUnit(d,e,batches[0].binding.container,id,seller,eventId);
 return {...q,agreed:true,buyer,seller,item,listPrice:q.totalCoins/quantity,instances:selected};
}
export function executeQuotedRepair(d,e,args,eventId){
 const s=d.get('state'),q=currentServiceQuotes(s).find(row=>row.id===args.quote&&row.resource==='repair');
 if(!q||q.actor!==args.provider||e.resolve(q.subject)!==e.resolve(args.instance))throw Error('Missing exact native repair quote');
 const subject=e.resolve(q.subject);
 const capability=s.records?.[`person_capabilities:${q.actor}`]?.serviceCapability;
 if(capability?.repairMetal!==true||s.npcs[q.actor]?.location!==s.location)throw Error('Repair provider lacks capability or presence');
 const item=facilityRuntime().servicePhysicalItem(d,e,subject),owners=Object.values(d.document.holdings?.rows??{}).filter(h=>h.kind==='owns'&&h.subject===subject&&h.until===undefined);
 if(owners.length!==1||owners[0].holder!=='player'||!(item.maxCondition===100||item.maxDurability>0)||!Number.isFinite(item.condition)||item.condition>=q.conditionAfter||s.player.coins<q.totalCoins)throw Error('Invalid original repair item, condition or funds');
 assertServiceConsent(d,e,q,'repair',q.subject,{fee:q.totalCoins,minutes:q.minutes,conditionAfter:q.conditionAfter},s.minute+q.minutes);
 e.advance(d,q.minutes,eventId);
 if(!aliveHoldings(d,{kind:'owns',subject,holder:'player'}).length)throw Error('The original item left its owner before repair completed');
 const unit=d.get('state','itemInstances',subject);
 if(unit?.maxDurability>0){
  if(unit.owner!=='player'||!d.get(...e.bagPath('player'),unit.item,'instances')?.includes(subject))throw Error('The original repair unit is no longer held');
  const durability=Math.round(unit.maxDurability*q.conditionAfter/100);
  holdingSet(d,e,['state','itemInstances',subject,'durability'],durability,'workstation-services',eventId);
  if(e.quantity(d,'player',unit.item)===1)d.set([...e.bagPath('player'),unit.item,'durability'],durability);
 }
 facilityRuntime().serviceWritePhysicalItem(d,e,subject,{condition:q.conditionAfter},{eventId});
 moveCoins(d,{from:purse(null,'player'),to:purse(null,q.actor),amount:q.totalCoins,writer:'workstation-services',eventId});
 d.set(['state','player','coins'],d.get('state','player','coins')-q.totalCoins);d.set(['state','npcs',q.actor,'coins'],d.get('state','npcs',q.actor,'coins')+q.totalCoins);
 d.set(['state','records',`${serviceKey(q.id)}:used`],{category:'service_quote_used',quote:q.id,sourceEvent:eventId});
 d.set(['state','records',`service_repair:${eventId}`],{category:'service_repair',quote:q.id,provider:q.actor,instance:subject,before:item.condition,after:q.conditionAfter,minutes:q.minutes,fee:q.totalCoins,sourceEvent:eventId});
 return {provider:q.actor,instance:subject,condition:q.conditionAfter,cost:q.totalCoins,minutes:q.minutes};
}
export function installServiceConsumers(e,document){
 const craft=e.craft.serviceOriginal??e.craft,learn=e.learn.serviceOriginal??e.learn,remember=e.remember.serviceOriginal??e.remember;
 e.craft=function(d,args,id){return args.operation==='repair'&&args.maker&&currentServiceQuotes(d.get('state')).some(q=>q.id===args.repairPlan&&q.resource==='repair')?executeQuotedRepair(d,this,{...args,provider:args.maker,quote:args.repairPlan},id):craft.call(this,d,args,id);};
 e.learn=function(d,args,id){
  if(args.operation||args.student!==undefined||!args.entity||!args.source)return learn.call(this,d,args,id);
  const s=d.get('state');let teacher;try{teacher=this.resolve(args.source);}catch{return learn.call(this,d,args,id);}
  if(!s.npcs?.[teacher])return learn.call(this,d,args,id);
  const subject=this.resolve(args.entity,args.kind);
  const offers=(s.consentEvents??[]).filter(c=>c.type==='consent_given'&&c.from===teacher&&c.to==='player'&&c.scope==='teach'&&c.subject===subject&&Number.isSafeInteger(c.terms?.days)&&c.terms.days>=2&&c.terms.days<=30&&Number.isSafeInteger(c.terms.fee)&&c.at<=s.minute&&c.until>s.minute);
  if(!args.operation&&offers.length===1){const c=offers[0],base=this.byId.get(subject);this.byId=new Map(this.byId);this.byId.set(subject,{...base,learnFee:c.terms.fee,learnDays:c.terms.days});this.resolver=Object.create(this.resolver);this.resolver.entities=this.byId;}
  let result=learn.call(this,d,args,id);
  if(this.requestedLearningCompletion&&result.course){
   const firstCost=result.cost,start=s.minute;
   for(let i=1;!result.complete&&i<30;i++){
    const course=d.get('state','records',result.course),until=course.nextDay*1440+start%1440,wait=Math.max(0,until-d.get('state','minute'));
    if(wait)this.advance(d,wait,`${id}:course-wait:${i}`);
    result=learn.call(this,d,args,`${id}:lesson:${i}`);
   }
   result={...result,cost:firstCost,minutes:d.get('state','minute')-start};
  }
  return result;
 };
 e.remember=async function(d,args,id){
  if(args.key!=='dialogue:order_meal'||!args.side)return remember.call(this,d,args,id);
  const s=d.get('state'),seller=this.resolve(args.subject,'npc'),items=[args.item,args.side].map(item=>this.resolve(item,'item'));
  const members=items.map(item=>(facilityRuntime().currentAgreedQuotes?.(s)??[]).filter(q=>q.actor===seller&&q.to==='player'&&q.direction==='sell_to_player'&&q.resource===item&&q.quantity===1));
  // Ordinary menu ordering still works without historical agreed quotes.
  if(members.every(rows=>rows.length===0))return remember.call(this,d,args,id);
  if(members.some(rows=>rows.length!==1)||new Set(items).size!==items.length)throw Error('The meal bundle needs two distinct current native quotes');
  const quotes=members.map(rows=>rows[0]),reference=this.requestedServiceQuote??`meal:${id}`,key=`quote_bundle:${reference}`,old=s.records?.[key];
  if(old&&old.eventId!==id)throw Error('Meal bundle reference is already bound');
  const value={category:'quote_bundle',id:reference,actor:seller,to:'player',quotes:quotes.map(q=>q.id),totalCoins:quotes.reduce((sum,q)=>sum+q.totalCoins,0),eventId:id};
  const result=await remember.call(this,d,args,id);
  if(result.paid!==value.totalCoins)throw Error('Meal payment differs from native quote total');
  d.set(['state','records',key],value);return {...result,quote:reference};
 };
 e.craft.serviceOriginal=craft;e.learn.serviceOriginal=learn;
 e.remember.serviceOriginal=remember;
}
installFacilityRuntime({recipeOverrideCatalog,installServiceConsumers,conditionalTradeQuote});

export function workstationDefinition(engine,state,id){
 for(const place of [...engine.world.locations,...Object.values(state.created??{})]){
  const station=place.workstations?.find(s=>s.id===id);
  if(station)return {station,location:place.id};
 }
 return null;
}
const accessKey=id=>`workstation_access:${id}`;
function paidSource(state,row){
 const event=worldEvent(state,row.paymentEvent),p=event?.payload;
 return event?.verb==='paid'&&event.actor===row.holder&&event.minute<=row.fromMinute&&p.amount===row.fee&&p.purpose==='workstation_use'&&p.resource==='coin_river'&&(p.subject===row.station||p.to?.role==='fee_recipient'&&p.to.of===row.station);
}
export function recordWorkstationAccess(d,engine,row,{actor=row.holder}={}){
 const state=d.get('state'),found=workstationDefinition(engine,state,row.station);
 if(actor!==row.holder||actor!=='player'&&!state.npcs?.[actor]||typeof row.id!=='string'||!row.id||d.get('state','records',accessKey(row.id))||!found||!Number.isSafeInteger(row.fromMinute)||row.fromMinute<0||!Number.isSafeInteger(row.toMinute)||row.fromMinute>=row.toMinute||!Number.isSafeInteger(row.fee)||row.fee<0||row.fee!==(found.station.fee??0)||typeof row.paid!=='boolean'||row.usable!==undefined&&typeof row.usable!=='boolean')throw Error('Invalid workstation access');
 if(row.usable!==undefined&&row.usable!==((facilityView(engine,state,found.location)?.factor??1)>0))throw Error('Declared workstation usability conflicts with the real facility condition');
 if(found.station.access!=='public'&&found.station.owner!==actor)throw Error('Private workstation requires actual owner permission');
 if(row.paid){
  if(!paidSource(state,row))throw Error('Invalid workstation prepayment source');
  if(recordsWhere(state.records,'category','workstation_access').some(r=>r.paymentEvent===row.paymentEvent))throw Error('Prepayment already assigned');
 }else if(row.paymentEvent!==undefined)throw Error('Unpaid access cannot claim a payment');
 const {usable,...facts}=row,value={...persistable(facts),category:'workstation_access'};
 d.set(['state','records',accessKey(row.id)],value);
 d.set(['state','records',`${accessKey(row.id)}:source`],{category:'workstation_access_receipt',digest:digest(value)});
 return value;
}
export function workstationAccess(state,station,holder='player',minutes=0){
 return recordsWhere(state?.records,'category','workstation_access').filter(r=>r.station===station&&r.holder===holder&&state.records[`${accessKey(r.id)}:source`]?.digest===digest(r)&&(!r.paid||paidSource(state,r))&&r.fromMinute<=state.minute&&state.minute<r.toMinute&&state.minute+minutes<=r.toMinute);
}
export function workstationFee(state,station,holder='player'){
 const receipt=workstationAccess(state,station.id,holder).find(r=>r.paid&&!state.records[`${accessKey(r.id)}:used`]);
 return receipt?Math.max(0,(station.fee??0)-receipt.fee):station.fee??0;
}
export function prepareBookedWorkstation(d,engine,tool,args){
 const repairing=tool==='repair'||tool==='craft'&&args.operation==='repair';
 if(!repairing&&(tool!=='craft'||args.operation!==undefined&&args.operation!=='manufacture'||args.maker!==undefined))return null;
 const state=d.get('state');
 if(!recordsWhere(state.records,'category','workstation_access').some(r=>r.holder==='player'))return null;
 let recipe;
 if(repairing){
  const item=args.item?engine.resolve(args.item,'item'):state.itemInstances?.[args.instance]?.item,plans=(engine.rules.repairs??[]).filter(r=>r.item===item);
  recipe=args.repairPlan?plans.find(r=>r.id===args.repairPlan):plans.length===1?plans[0]:null;
 }else recipe=engine.byId.get(engine.resolve(args.recipe,'recipe'));
 if(!recipe?.workstation)return null;
 const station=(facilityView(engine,state,state.location)?.workstations??engine.byId.get(state.location)?.workstations)?.find(s=>s.kind===recipe.workstation);
 if(!station)return null; // Native manufacture owns the missing-station diagnostic.
 const rows=recordsWhere(state.records,'category','workstation_access').filter(r=>r.station===station.id&&r.holder==='player');
 if(!rows.length)return null;
 const minutes=repairing?recipe.minutes:Math.ceil(recipe.minutes/(facilityView(engine,state,state.location)?.factor??1));
 const valid=workstationAccess(state,station.id,'player',minutes);
 if(!valid.length)throw Error('Workstation booking does not cover the complete production time');
 const receipt=valid.find(r=>r.paid&&!state.records[`${accessKey(r.id)}:used`])??null;
 const native=workstationDefinition(engine,state,station.id)?.station??station;
 const maxByTime=Math.floor((Math.max(...valid.map(r=>r.toMinute))-state.minute)/minutes);
 const maxByMoney=native.fee?Math.floor(state.player.coins/native.fee)+(receipt?1:0):Infinity;
 return {receipt,minutes,maxBatches:Math.min(maxByTime,maxByMoney)};
}
export function consumeWorkstationPrepayment(d,receipt,eventId){
 if(receipt&&!d.get('state','records',`${accessKey(receipt.id)}:used`))d.set(['state','records',`${accessKey(receipt.id)}:used`],{category:'workstation_prepayment_used',access:receipt.id,amount:receipt.fee,sourceEvent:eventId,minute:d.get('state','minute')});
}
installFacilityRuntime({prepareBookedWorkstation,consumeWorkstationPrepayment});

// Like derived shops, recipes are capabilities of current work, never edits to
// a published person. A service-bearing or explicit production slot marks work;
// merely sleeping or eating in a workshop does not put its resident on duty.
// Schedule projections omit presence; actual consumers still require arrival.
export function workstationRecipes(engine,state,id,slot,{present=false}={}){
    if(!state||!slot?.location||!slot.services?.length&&slot.production!==true)return [];
    const actor=state.npcs?.[id];
    if(present&&(!actor||actor.location!==slot.location||actor.scheduleTravel||actor.cognitionTravel||actor.caring||actor.levy||['死亡','濒死','昏迷','患病'].includes(actor.status)))return [];
    const location=state.created?.[slot.location]??engine.byId.get(slot.location);
    const facility=facilityView(engine,state,slot.location);
    if(facility?.factor===0)return [];
    const stations=facility?.workstations??location?.workstations??[];
    if(!stations.length)return [];
    return [...engine.world.recipes??[],...Object.values(state.created??{}).filter(r=>r.id?.startsWith('recipe_'))].filter(r=>
        r.workstation&&(!r.location||r.location===slot.location)&&stations.some(s=>s.kind===r.workstation)&&
        knowledgeProficiency(engine,state,id,r.skill)>=(r.minimumProficiency??0));
}

export function currentWorkstationRecipes(engine,state,id){
    const slot=engine.protocolScheduleAt?.(engine,id,state.minute,state);
    return workstationRecipes(engine,state,id,slot,{present:true});
}
