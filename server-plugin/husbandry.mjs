import {derived} from './derived.mjs';
import {accrueStock,registerLegacyStock,moveStock} from './stock.mjs';
import {declareLedgerWriter,accountKey} from './ledger.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings,ensureHoldings} from './holdings.mjs';
import {addPopulation,populationHealth,advancePopulationDisease,takePopulation} from './population-health.mjs';
import {monsterStats} from './combat-state.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {digest} from './storage.mjs';
import {spiritStateFor} from './creature-nature.mjs';
import {preconditionFailure} from './precondition.mjs';
import {produceItems} from './items.mjs';
import {isPhysicallyDead} from './holdings.mjs';
import {yearDays} from './husbandry-traits.mjs';
import {wearItem} from './items.mjs';
import {householdTool} from './household-tools.mjs';
import {npcGradedCheck,npcProficiency} from './checks.mjs';
import {craftOutcome,craftStanding,toolFactor} from './manufacturing.mjs';
import {effectiveProficiency} from './professions.mjs';
import {propertyOwners} from './action-authority.mjs';
import {recordEntityDeath} from './npc-life.mjs';
import {recordWildlifeDeath} from './wildlife.mjs';
import {carryRoomKg} from './carry.mjs';

declareLedgerWriter('husbandry',{sources:{'src:birth':{'*':100000},'src:husbandry':{'*':100000},'src:genesis':{'item_pasture_forage':Infinity},'src:regrowth':{'item_pasture_forage':Infinity}},sinks:['sink:consume','sink:decay','sink:death','sink:individuated']});
// SL: slaughtering an owned individual closes its body (the wreck) as dressed.
declareHoldingWriter('husbandry',{kinds:['owns'],entities:['population','creature','wreck'],locations:true});
const path=id=>['state','records',`husbandry:${id}`];
const resource=species=>`population_${species}`;
const animals=row=>accountKey(row.id,resource(row.species),'population');
const produce=(row,item)=>accountKey(row.id,item,'yield');
const profile=(e,species)=>e.byId.get(species)?.husbandry;
const table=(e,id)=>e.world.primitiveTables?.yields?.params?.find(p=>p.id===id)?.value;
const pastureKey=settlement=>['state','records',`husbandry_pasture:${settlement}`];
const pastureAccount=(row,item)=>accountKey(row.location,item,'pasture');
registerLegacyStock('husbandry',(e,state,add)=>{
 for(const row of Object.values(state.records??{}).filter(r=>r.category==='husbandry')){
  add(animals(row),row.count);for(const [item,n]of Object.entries(row.produce??{}))add(produce(row,item),n);
 }
 const forage=table(e,'husbandry.pasture')?.item;
 for(const row of Object.values(state.records??{}).filter(r=>r.category==='husbandry_pasture'))add(pastureAccount(row,forage),row.reserve);
});
// An NPC owner tends the herd as daily household work: herding it out to
// graze and deciding to cull. The player's own herd waits for the player.
const tendedBy=(d,e,row)=>row.owner&&row.owner!=='player'&&d.get('state','npcs',row.owner)&&!isPhysicallyDead(e,d,row.owner)?row.owner:null;
const grazes=s=>/草|杂/.test(String(s.diet??''));
// Settlement commons: area x commons share x standing biomass. Grass grows
// back each day by season; what exceeds the standing stock withers.
function pasture(d,e,location,day,eventId){
 const r=table(e,'husbandry.pasture');if(!r)return null;
 const place=e.byId.get(location),settlement=place?.scope??location,key=pastureKey(settlement);
 let row=structuredClone(d.get(...key)??null);
 if(!row){
  const area=e.byId.get(settlement)?.areaKm2??e.rules.habitatDerivation?.referenceAreaKm2;
  const capacity=Math.floor((area??0)*r.commonsShare*r.standingKgPerKm2/e.byId.get(r.item).weight);
  if(!capacity)return null;
  row={category:'husbandry_pasture',location:settlement,capacity,reserve:capacity,grown:0,grazed:0,withered:0,updatedDay:day};
  moveStock(d,{from:`src:genesis|${r.item}|opening`,to:pastureAccount(row,r.item),amount:capacity,writer:'husbandry',eventId});
 }
 for(let at=row.updatedDay;at<day;at++){
  const recovery=e.rules.wildlife?.seasonRecovery?.[e.calendar((at+1)*1440).season]??1;
  const grown=accrueStock(row,'growth',row.capacity*r.dailyGrowthFraction*recovery);
  const withered=Math.max(0,row.reserve+grown-row.capacity);
  row.reserve+=grown-withered;row.grown+=grown;row.withered+=withered;
  moveStock(d,{from:`src:regrowth|${r.item}|pasture`,to:pastureAccount(row,r.item),amount:grown,writer:'husbandry',eventId});
  moveStock(d,{from:pastureAccount(row,r.item),to:`sink:decay|${r.item}|pasture`,amount:withered,writer:'husbandry',eventId});
 }
 row.updatedDay=day;d.set(key,row);return {row,key,r};
}
function graze(d,e,row,s,heads,day,eventId){
 const mass=s.husbandry.bodyMassKg??s.bodyMassKg;
 if(!heads||!grazes(s)||!(mass>0)||!tendedBy(d,e,row))return 0;
 const p=pasture(d,e,row.location,day,eventId);if(!p)return 0;
 const need=Math.ceil(heads*mass*p.r.intakePerBodyKg/e.byId.get(p.r.item).weight),eaten=Math.min(need,p.row.reserve);
 if(eaten){
  p.row.reserve-=eaten;p.row.grazed+=eaten;d.set(p.key,p.row);
  moveStock(d,{from:pastureAccount(p.row,p.r.item),to:`sink:consume|${p.r.item}|husbandry_grazing`,amount:eaten,writer:'husbandry',eventId});
 }
 return eaten/need;
}
// A dated product lot in the herd's store; it spoils by the item's shelf life.
// A lot taken by a craft keeps its workmanship and grade until it is collected.
function store(e,row,item,quantity,day,made={}){
 row.produce[item]=(row.produce[item]??0)+quantity;
 if(quantity){const days=e.byId.get(item).shelfLifeDays;
  row.batches.push({item,quantity,day:day+1,expiresDay:days===null||days===undefined?null:day+1+days,...made});
 }
}
// Every herd death (culled, starved, diseased, aged) leaves a body dressed
// into the species' body-derived carcass parts (yields.carcass). A tending NPC
// keeper takes them into the household bag at once; otherwise they lie in the
// herd's store for the owner to collect, and spoil like any other product.
function carcass(d,e,row,s,n,day,eventId){
 if(!n)return;
 row.carcasses=(row.carcasses??0)+n;
 const keeper=tendedBy(d,e,row);
 for(const part of s.husbandry.yields?.carcass??[]){
  const quantity=part.amount*n;
  if(keeper){e.itemDelta(d,keeper,part.item,quantity,{flow:'src:husbandry',purpose:'husbandry_carcass',writer:'husbandry',eventId});continue;}
  store(e,row,part.item,quantity,day);
  moveStock(d,{from:`src:husbandry|${part.item}|carcass`,to:produce(row,part.item),amount:quantity,writer:'husbandry',eventId});
 }
}
function shed(d,row,item,excess,eventId){
 if(!excess)return;
 row.produce[item]-=excess;row.shed=(row.shed??0)+excess;
 let left=excess;
 for(const batch of row.batches){if(batch.item!==item||!left)continue;const n=Math.min(left,batch.quantity);batch.quantity-=n;left-=n;}
 if(left)throw Error('脱落毛被与批次不守恒');
 row.batches=row.batches.filter(b=>b.quantity);
 moveStock(d,{from:produce(row,item),to:`sink:decay|${item}|shed`,amount:excess,writer:'husbandry',eventId});
}
function die(d,e,row,s,n,cause,day,eventId){
 if(!n)return;
 takePopulation(row,n);
 moveStock(d,{from:animals(row),to:`sink:death|${resource(row.species)}|${cause}`,amount:n,writer:'husbandry',eventId});
 carcass(d,e,row,s,n,day,eventId);
}
// A tending NPC keeper culls by slaughtering (SL): the same take law as the
// player's (household tool, own skill standing and check, craftOutcome for tier
// and kept share). Without a cutting tool in the household no head is culled.
function cull(d,e,row,s,n,day,eventId){
 if(!n)return;
 const keeper=tendedBy(d,e,row);
 let take;try{take=prepareTake(d,e,takeRule(e,'carcass'),undefined,keeper);}
 catch(error){if(error?.code!=='E-ACTION-TOOL')throw error;row.cullWithoutTool=(row.cullWithoutTool??0)+n;return;}
 const key=`${eventId}:cull:${row.culled??0}`,settled=settleTake(d,e,take,key);
 if(take.rule.toolWearPerHead)wearItem(d,e,take.holder,take.tool,take.rule.toolWearPerHead*n);
 takePopulation(row,n);row.culled=(row.culled??0)+n;
 moveStock(d,{from:animals(row),to:`sink:death|${resource(row.species)}|cull`,amount:n,writer:'husbandry',eventId});
 const tier=settled.workmanship??(settled.result.failure?`失败:${settled.result.failure}`:'标准');
 row.cullTakes={...row.cullTakes,[tier]:(row.cullTakes?.[tier]??0)+1};
 for(const part of s.husbandry.yields?.carcass??[]){
  const total=part.amount*n,kept=settled.kept(total);
  if(total>kept)row.cullLost={...row.cullLost,[part.item]:(row.cullLost?.[part.item]??0)+total-kept};
  if(kept)produceChunked(d,e,part.item,kept,{eventId:`${key}:${part.item}`,owner:keeper,maker:row.id,recipe:{kind:'husbandry_slaughter',population:row.id,species:s.id,owner:keeper,day},workmanship:settled.workmanship,grade:settled.grade,books:{flow:'src:husbandry',purpose:'husbandry_slaughter',writer:'husbandry',eventId}});
 }
}
// Natural death: one over the species' lifespan per head and day. Without an
// authored lifespan it follows body mass (lifespan ~ mass^1/4).
function lifespanDays(e,s){
 const rule=table(e,'husbandry.lifespan'),mass=s.husbandry.bodyMassKg??s.bodyMassKg;
 const years=s.husbandry.lifespanYears??(rule&&mass>0?rule.yearsPerQuarterPowerKg*mass**0.25:null);
 return years>0?years*yearDays(e.world):null;
}
export function advanceHusbandry(d,e,day){
 if(!e.world.monsters.some(s=>s.husbandry))return;
 ensureHoldings(d,e);
 const rows=Object.values(d.get('state','records')??{}).filter(r=>r.category==='husbandry').map(r=>structuredClone(r)).sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const groups=new Map();
 for(const row of rows){
  if(row.lastDay!==day-1)throw Error('家畜日结不连续');
  if(!profile(e,row.species))throw Error('家畜物种养殖参数缺失');
  const species=e.byId.get(row.species),key=JSON.stringify([row.location,row.species,row.disease??species.ecology?.disease??null]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 // No pen/isolation model exists here: co-located herds of one species share
 // contact space regardless of ownership or how many account rows store them.
 const deaths=new Map();
 for(const group of groups.values()){
  const opening=group.map(row=>row.count);
  advancePopulationDisease(d,e,group,group.map(row=>row.id),e.byId.get(group[0].species),group.reduce((n,row)=>n+row.capacity,0));
  group.forEach((row,i)=>deaths.set(row.id,opening[i]-row.count));
 }
 for(const row of rows){
  const p=profile(e,row.species);
  // A genuine title transfer changes who must supply feed. Synchronize the
  // source projection with the native owns edge before settling this day.
  const owners=aliveHoldings(d,{kind:'owns',subject:row.id});
  row.owner=owners.length===1?owners[0].holder:null;
  populationHealth(row);const eventId=`husbandry:${row.id}:${day}`;
  for(const batch of row.batches)if(batch.quantity&&batch.expiresDay!==null&&batch.expiresDay<=day+1){
   row.produce[batch.item]-=batch.quantity;
   moveStock(d,{from:produce(row,batch.item),to:`sink:decay|${batch.item}|husbandry`,amount:batch.quantity,writer:'husbandry',eventId});
   batch.quantity=0;
  }
  row.batches=row.batches.filter(b=>b.quantity);
  const died=deaths.get(row.id),species=e.byId.get(row.species),keeper=tendedBy(d,e,row);
  moveStock(d,{from:animals(row),to:`sink:death|${resource(row.species)}|herd`,amount:died,writer:'husbandry',eventId});
  carcass(d,e,row,species,died,day,eventId);
  const life=lifespanDays(e,species);
  if(life&&row.count){const aged=Math.min(row.count,accrueStock(row,'natural',row.count/life));row.naturalDeaths=(row.naturalDeaths??0)+aged;die(d,e,row,species,aged,'natural',day,eventId);}
  const heads=row.count;
  const feed=Math.ceil(derived(e,d.document,'husbandry:feed',row.id,{base:heads*p.feed.perHead,target:row.species}));
  // Grazing on the commons replaces the same share of stored feed; the rest
  // comes from the owner's real inventory (crops, gathered or bought feed).
  const grazed=graze(d,e,row,species,heads,day,eventId),stored=Math.ceil(feed*(1-grazed));
  const taken=Math.min(stored,row.owner?e.quantity(d,row.owner,p.feed.item):0);
  if(taken)e.itemDelta(d,row.owner,p.feed.item,-taken,{flow:'sink:consume',purpose:'husbandry_feed',writer:'husbandry',eventId});
  // Fed share scales births and live products; unfed head go hungry.
  const fed=!heads||feed===0?1:Math.min(1,grazed+taken/feed);
  row.fed=fed;
  if(fed<1){
   const hunger=table(e,'husbandry.starvation'),cullRule=table(e,'husbandry.cull');
   row.hungryDays=(row.hungryDays??0)+1;row.hungerHeadDays=(row.hungerHeadDays??0)+Math.ceil(heads*(1-fed));
   // A tending NPC owner culls the head it cannot feed rather than watch them starve.
   if(keeper&&cullRule)cull(d,e,row,species,Math.min(row.count,Math.floor(heads*(1-fed)*cullRule.feedShortfall)),day,eventId);
   if(hunger&&row.hungryDays>hunger.graceDays&&row.count){
    const starved=Math.min(row.count,accrueStock(row,'starvation',row.count*(1-fed)*hunger.deathFractionPerDay));
    if(starved){row.starvationDeaths=(row.starvationDeaths??0)+starved;die(d,e,row,species,starved,'starvation',day,eventId);}
   }
  }else row.hungryDays=0;
  if(fed>0){
   const alive=row.count;
   const expected=alive>=2?derived(e,d.document,'population:birthRate',row.id,{base:alive*p.birthPerHeadDay*fed,target:row.species}):0;
   const accrued=accrueStock(row,'birth',expected),penFull=keeper?table(e,'husbandry.cull')?.penFull??0:0;
   // A full pen does not grow. A tending owner keeps the young and culls the
   // surplus; an untended full pen simply raises none.
   const born=penFull?accrued:Math.min(Math.max(0,row.capacity-alive),accrued);
   addPopulation(row,{S:born,I:0,R:0});row.born+=born;
   moveStock(d,{from:`src:birth|${resource(row.species)}|herd`,to:animals(row),amount:born,writer:'husbandry',eventId});
   if(row.count>row.capacity)cull(d,e,row,species,Math.min(row.count-row.capacity,Math.ceil((row.count-row.capacity)*penFull)),day,eventId);
   for(const yieldRow of p.yields.alive){
    // A take rule with a seasonal rhythm (a coat) grows by season; its year mean is one.
    const rule=takeRule(e,yieldRow.from),base=alive*yieldRow.perHeadDay*fed*(rule?.seasonGrowth?rule.seasonGrowth[e.calendar(day*1440).season]:1);
    const quantity=accrueStock(row,`yield:${yieldRow.item}`,derived(e,d.document,'economy:yield',row.id,{base,holder:row.owner,target:yieldRow.item}));
    store(e,row,yieldRow.item,quantity,day);
    moveStock(d,{from:`src:husbandry|${yieldRow.item}|alive`,to:produce(row,yieldRow.item),amount:quantity,writer:'husbandry',eventId});
    // A product that stays on the living animal (a coat) holds at most holdDays
    // of growth per head; past that it sheds, oldest first.
    if(rule?.holdDays>0)shed(d,row,yieldRow.item,Math.max(0,(row.produce[yieldRow.item]??0)-Math.floor(row.count*yieldRow.perHeadDay*rule.holdDays)),eventId);
   }
  }
  row.lastDay=day;holdingSet(d,e,path(row.id),row,'husbandry',eventId);
 }
}
// SL: taking from a living animal (world/meta/mechanics/husbandry-takes.json,
// one row per product source) is a craft: a tool chosen by use class, the
// row's skill check, and Q's craftOutcome for how much of what is taken
// survives and how well it is done. Sources without a row are picked up.
const takeRule=(e,from)=>from?e.world.husbandryTakes?.takes?.[from]??null:null;
// The same take for the player and an NPC: the tool (own or a household
// member's at home), the actor's skill standing, the actor's graded check.
function prepareTake(d,e,rule,selected,actor='player'){
 if(!rule)throw Error('缺宰杀取出规律（husbandry-takes）');
 const {item:tool,holder}=householdTool(d,e,rule.requiresUse,selected,actor);
 const raw=actor==='player'?d.get('state','skills',rule.skill):d.get('state','npcs',actor,'skills',rule.skill)??e.byId.get(actor)?.skills?.[rule.skill]??e.byId.get(actor)?.proficiencies?.[rule.skill];
 const hasSkill=raw!==undefined&&raw!==null,proficiency=!hasSkill?0:actor==='player'?effectiveProficiency(d,e,rule.skill):npcProficiency(d,e,actor,rule.skill);
 return {rule,actor,tool,holder,hasSkill,proficiency,standing:craftStanding(hasSkill,proficiency,rule.minimumProficiency)};
}
function settleTake(d,e,take,eventId){
 const {rule,tool,actor,holder}=take,tools=toolFactor(d,e,holder,[tool]),own=holder===actor?[tool]:[];
 const args={attribute:rule.attribute,...(take.hasSkill?{skill:rule.skill}:{}),difficulty:rule.difficulty,tools:own};
 const check=actor==='player'?e.check(d,args,eventId):npcGradedCheck(d,e,actor,{...args,skill:take.hasSkill?rule.skill:null},eventId);
 const result=craftOutcome(e,{standing:take.standing,degree:check.degree,success:check.success,proficiency:take.proficiency,floor:1,tools,station:1,recoverFraction:rule.recoverFraction,seed:d.document.randomSeed,key:eventId});
 const whole=check.success||result.failure==='partial';
 // The kept share follows returnMaterials: a worn take keeps ceil (at least one), others floor.
 const kept=n=>whole?n:result.gradeFactor!==undefined?Math.min(n,Math.max(1,Math.ceil(n*result.recover))):Math.floor(n*result.recover);
 const grade=result.grade??result.gradeFactor;
 return {check,result,kept,workmanship:result.tier,grade};
}
const takeReceipt=(take,settled)=>({degree:settled.check.degree,standing:take.standing,tool:take.tool,...(take.holder!==take.actor?{toolHolder:take.holder}:{}),...(settled.workmanship?{workmanship:settled.workmanship}:{}),...(settled.grade!==undefined?{grade:settled.grade}:{}),...(settled.result.failure?{failure:settled.result.failure}:{})});
function produceChunked(d,e,item,quantity,options){
 const ids=[];for(let i=0;i<quantity;i+=200)ids.push(...produceItems(d,e,item,Math.min(200,quantity-i),{...options,eventId:`${options.eventId}:${i}`}));
 return ids;
}
// Slaughter: the owner kills and dresses whole animals, heads of a herd or an
// owned individual. The parts are the species' body-derived carcass
// (husbandry-traits). Another's beast is refused as theirs: killing it would
// be destroying their property (K6), not dressing one's own. Not combat, no XP.
function slaughter(d,args,eventId){
 const e=this,here=d.get('state','location'),target=args.target;
 const creature=typeof target==='string'?d.get('state','creatures',target):null;
 const row=creature||typeof target!=='string'?null:d.get(...path(target));
 if(!creature&&(!row||row.category!=='husbandry'||row.location!==here))throw preconditionFailure('这里没有该家畜种群或牲口');
 if(creature&&(creature.location!==here||creature.hp<=0||isPhysicallyDead(e,d,target)))throw preconditionFailure('这里没有这头活着的牲口');
 const owners=creature?propertyOwners({engine:e,document:d.document},target):aliveHoldings(d,{kind:'owns',subject:target}).map(h=>h.holder);
 const label=creature?.name??row.name;
 if(!owners.includes('player')){
  const owner=owners[0],name=owner?d.get('state','npcs',owner,'name')??e.byId.get(owner)?.name??owner:null;
  throw preconditionFailure(owner?`${label}归${name}所有；宰杀别人的牲口等于毁坏他人财物，不能当自家牲口宰。可以先向主人买下，或请主人自己宰`:`${label}不归你所有，不能当自家牲口宰`);
 }
 const species=e.byId.get(creature?.species??row.species),parts=species?.husbandry?.yields?.carcass??[];
 if(!parts.length)throw preconditionFailure('这种动物没有可由体型推出的胴体部分');
 const heads=creature?1:args.quantity??1;
 if(!Number.isSafeInteger(heads)||heads<1||heads>(creature?1:row.count))throw preconditionFailure(`${label}只有${creature?1:row.count}头`);
 const take=prepareTake(d,e,takeRule(e,'carcass'),args.tool),minutes=heads*parts.reduce((n,part)=>n+part.collectMinutes,0);
 const settled=settleTake(d,e,take,eventId);
 e.advance(d,minutes,eventId);
 const current=creature?d.get('state','creatures',target):d.get(...path(target));
 const stillOwned=creature?propertyOwners({engine:e,document:d.document},target).includes('player'):aliveHoldings(d,{kind:'owns',holder:'player',subject:target}).length>0;
 if(d.get('state','location')!==here||!stillOwned||(creature?isPhysicallyDead(e,d,target):current.count<heads))return {success:false,obtained:[],reason:'宰杀完成前现场或权利已改变'};
 if(take.rule.toolWearPerHead)wearItem(d,e,take.holder,take.tool,take.rule.toolWearPerHead*heads);
 const day=Math.floor(d.get('state','minute')/1440);
 if(creature){
  d.set(['state','creatures',target,'hp'],0);recordEntityDeath(d,e,target,d.get('state','minute'),'宰杀');
  recordWildlifeDeath(d,e,target,eventId);
 }else{
  const next=structuredClone(current);takePopulation(next,heads);next.slaughtered=(next.slaughtered??0)+heads;
  moveStock(d,{from:animals(next),to:`sink:death|${resource(next.species)}|slaughter`,amount:heads,writer:'husbandry',eventId});
  holdingSet(d,e,path(target),next,'husbandry',eventId);
 }
 const obtained=[],lost=[],left=[],made={...(settled.workmanship?{workmanship:settled.workmanship}:{}),...(settled.grade!==undefined?{grade:settled.grade}:{})};
 // What the pack cannot take stays where it was cut: a herd's parts in the
 // herd's store (collected like any herd product, spoiling by shelf life), an
 // individual's on its dressed body (picked up from the carcass). Both stay the owner's.
 let room=carryRoomKg(d,e,'player');
 const herdRow=creature?null:structuredClone(d.get(...path(target)));
 for(const part of parts){
  const total=part.amount*heads,kept=settled.kept(total),weight=e.byId.get(part.item).weight;
  if(total>kept)lost.push({item:part.item,quantity:total-kept});
  const quantity=Math.min(kept,weight>0?Math.floor((room+1e-9)/weight):kept),rest=kept-quantity;room-=quantity*weight;
  if(rest&&creature)left.push({item:part.item,quantity:rest});
  else if(rest){
   store(e,herdRow,part.item,rest,day-1,made);
   moveStock(d,{from:`src:husbandry|${part.item}|slaughter`,to:produce(herdRow,part.item),amount:rest,writer:'husbandry',eventId});
   left.push({item:part.item,quantity:rest});
  }
  if(!quantity)continue;
  const instances=produceChunked(d,e,part.item,quantity,{eventId:`${eventId}:${part.item}`,recipe:{kind:'husbandry_slaughter',[creature?'creature':'population']:target,species:species.id,owner:'player',day},maker:target,workmanship:settled.workmanship,grade:settled.grade,books:{flow:'src:husbandry',purpose:'husbandry_slaughter',writer:'husbandry',eventId}});
  obtained.push({item:part.item,quantity,instances});
 }
 if(herdRow&&left.length)holdingSet(d,e,path(target),herdRow,'husbandry',eventId);
 if(creature){
  const corpse=d.get('state','creatures',target,'corpse');
  if(!corpse&&left.length)throw Error('宰杀个体没有尸体可留分割部分');
  if(corpse)holdingSet(d,null,['state','creatures',target,'corpse'],{...corpse,status:left.length?'已分割':'已取材',items:left.map(r=>({item:r.item,amount:r.quantity})),
   dressed:{recipe:{kind:'husbandry_slaughter',creature:target,species:species.id,owner:'player',day},maker:target,...made},processedBy:'player',processedAt:d.get('state','minute'),processingEvent:eventId},'husbandry');
 }
 if(take.hasSkill&&settled.check.success)e.practice(d,{skill:take.rule.skill,gain:take.rule.practiceGain,target:species.id},eventId);
 return {success:settled.check.success,target,species:species.id,heads,obtained,lost,...(left.length?{leftBehind:left}:{}),minutes,...takeReceipt(take,settled),experience:0,note:'宰杀自家牲口不是交锋，不计野外战果；lost 是下刀失误损掉、没有入库的部分。'};
}
export function husbandryAction(d,args,eventId){
 ensureHoldings(d,this);
 if(args.operation==='husbandry_slaughter')return slaughter.call(this,d,args,eventId);
 if(args.operation==='husbandry_inspect'&&!args.target)return {herds:Object.values(d.get('state','records')??{}).filter(r=>r.category==='husbandry'&&r.location===d.get('state','location')&&aliveHoldings(d,{kind:'owns',holder:'player',subject:r.id}).length).map(r=>({target:r.id,name:r.name,species:r.species,count:r.count,produce:structuredClone(r.produce)}))};
 const id=args.target,row=d.get(...path(id));
 if(!row||row.category!=='husbandry'||row.location!==d.get('state','location'))throw preconditionFailure('这里没有该家畜种群');
 if(!aliveHoldings(d,{kind:'owns',holder:'player',subject:id}).length)throw preconditionFailure('没有这群家畜的所有权');
 if(args.operation==='husbandry_inspect')return {target:id,name:row.name,species:row.species,count:row.count,produce:structuredClone(row.produce)};
 const item=args.item,amount=args.quantity??1,p=profile(this,row.species),yieldRow=[...p?.yields.alive??[],...p?.yields.carcass??[]].find(r=>r.item===item);
 if(!yieldRow||!Number.isSafeInteger(amount)||amount<1||amount>200||(row.produce[item]??0)<amount)throw preconditionFailure('没有足量已产生的畜产物');
 // A product taken off the living animal by a craft (a coat is shorn) needs its tool and skill.
 const rule=p.yields.alive.includes(yieldRow)?takeRule(this,yieldRow.from):null,take=rule?prepareTake(d,this,rule,args.tool):null,settled=take?settleTake(d,this,take,eventId):null;
 this.advance(d,yieldRow.collectMinutes*amount,eventId);
 const current=d.get(...path(id));
 if(d.get('state','location')!==row.location||!aliveHoldings(d,{kind:'owns',holder:'player',subject:id}).length||(current.produce[item]??0)<amount)return {success:false,obtained:[],reason:'采集完成前现场或权利已改变'};
 const next=structuredClone(current),instances=[],kept=settled?settled.kept(amount):amount;let left=amount,keep=kept;
 if(take?.rule.toolWearPerHead)wearItem(d,this,take.holder,take.tool,take.rule.toolWearPerHead);
 for(const batch of next.batches){
  if(batch.item!==item||!batch.quantity)continue;
  const n=Math.min(left,batch.quantity),k=Math.min(n,keep);
  if(k)instances.push(...produceItems(d,this,item,k,{eventId:`${eventId}:${batch.day}`,recipe:{kind:'husbandry',population:id,owner:'player',day:batch.day},maker:id,producedAt:batch.day*1440,...(settled?{workmanship:settled.workmanship,grade:settled.grade}:{workmanship:batch.workmanship,grade:batch.grade}),books:{account:produce(row,item),writer:'husbandry',eventId}}));
  if(n>k)moveStock(d,{from:produce(row,item),to:`sink:decay|${item}|husbandry_take`,amount:n-k,writer:'husbandry',eventId});
  batch.quantity-=n;left-=n;keep-=k;if(!left)break;
 }
 if(left)throw Error('活体产物批次与储量不守恒');
 next.produce[item]-=amount;next.batches=next.batches.filter(b=>b.quantity);
 holdingSet(d,this,path(id),next,'husbandry',eventId);
 if(take?.hasSkill&&settled.check.success)this.practice(d,{skill:rule.skill,gain:rule.practiceGain,target:row.species},eventId);
 return {success:settled?settled.check.success:true,target:id,obtained:kept?[{item,quantity:kept,instances}]:[],...(amount>kept?{lost:[{item,quantity:amount-kept}]}:{}),minutes:yieldRow.collectMinutes*amount,...(take?takeReceipt(take,settled):{})};
}

// Population stock adapter (01 §1.6 sink:individuated): the only open writer of
// a herd's count. In one transaction n head leave the herd account for
// sink:individuated, the S/I/R subaccounts follow them, and n creatures of the
// species stand where the herd is, owned by the herd's owner. Living bodies
// then share every individual law (vital, death, carcass, gather).
export function individuateHerd(d,engine,{population,count,eventId}){
 ensureHoldings(d,engine);
 const row=d.get(...path(population));
 if(!row||row.category!=='husbandry')throw preconditionFailure('这里没有该家畜种群');
 if(!Number.isSafeInteger(count)||count<1||count>row.count)throw preconditionFailure(`${row.name}只有${row.count}头`);
 const next=structuredClone(row),taken=takePopulation(next,count),species=engine.byId.get(row.species);
 if(!species)throw Error('家畜物种定义缺失');
 moveStock(d,{from:animals(row),to:`sink:individuated|${resource(row.species)}|herd`,amount:count,writer:'husbandry',eventId});
 holdingSet(d,engine,path(population),next,'husbandry',eventId);
 const owners=aliveHoldings(d,{kind:'owns',subject:population}),owner=owners.length===1?owners[0].holder:row.owner??null;
 const level=species.levelRange?.[0]??species.level??1,stats=monsterStats({level,template:species.template??2},engine.rules),ids=[];
 // Infected head leave first only in proportion (takePopulation); mark them.
 const sick=[...Array(taken.I).fill('I'),...Array(taken.R).fill('R')];
 for(let i=0;i<count;i++){
  // Same identity shape as a wild individual (wildlife.mjs createWildlifeInstance).
  const hash=digest([d.document.randomSeed,eventId,population,i]).slice(0,16),id=`monster_instance_${hash}`,name=`${species.name}·${hash.slice(0,4)}`;
  if(d.get('state','created',id)||d.get('state','creatures',id))throw Error('个体化编号重复');
  holdingSet(d,null,['state','created',id],{id,name,aliases:[],monster:species.id,template:species.template,scope:row.location},'husbandry',eventId);
  holdingSet(d,null,['state','creatures',id],{name,species:species.id,herd:population,location:row.location,level,hp:stats.maxHp,maxHp:stats.maxHp,status:'正常',owner,individuatedAt:d.get('state','minute'),...(sick[i]?{populationHealth:sick[i]}:{}),...spiritStateFor(species)},'husbandry',eventId);
  ids.push(id);
 }
 return ids;
}
registerAdvanceHook('individuateHerd',individuateHerd);
