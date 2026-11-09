import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,sink,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('npc-life',{sinks:['sink:export','sink:consume']});
import {npcAgeAt,npcHousehold,householdMembers} from './npc-state.mjs';
import {entityTransition,businessSnapshot,businessTransitions} from './entity-transitions.mjs';
export {npcAgeAt,npcHousehold,householdMembers} from './npc-state.mjs';
// Adult family life: a mutual long relationship may become a marriage, and a
// married couple may have a child who joins a real household and the
// settlement population. Everything is decided once per midnight from the
// state at that boundary and a roll keyed by campaign seed, subject and day,
// so long waits, short waits and reloaded saves give the same family history.
// Authored people and their static past are never rewritten; changes live in
// state.family plus ordinary memories, which then spread only through the
// existing NPC conversation and message channels.
import {digest,stateMemo,canonicalEqual} from './storage.mjs';
import {householdMealPlan,householdMealWithSources,usageCost,registerMerchandiseResolver} from './household-budget.mjs';
import {mouthWeight} from './household-subsistence.mjs';
import {mealMouthsOf,metabolismFactor} from './primitives-body.mjs';
import {supplyHousehold,prepareHouseholdSubsistence,householdSubsistenceGroups} from './household-subsistence.mjs';
import {placeSettlement} from './entity-view.mjs';
import {toRational} from './det-math.mjs';
import {transition} from './transition.mjs';
import {clockRoll} from './world-clock.mjs';
import {derived} from './derived.mjs';
import populationBalance from '../world/rules/tables/balance/population.json' with {type:'json'};
import attributeBalance from '../world/rules/tables/balance/attributes.json' with {type:'json'};
import {relationView,recordLifeRelation} from './npc-relations.mjs';
import {npcSchedule} from './npc-state.mjs';
import {validateNpcSchedules,scheduleAt} from './npc-schedule.mjs';
import {rosterLifeState,lifeRoutine} from './population.mjs';
import {initialNpcState} from './npc-state.mjs';
import {advanceNpcNeeds} from './npc-intelligence.mjs';
import {famineAt} from './hazard-calendar.mjs';
import {personSimulation,personConstraint,personHousehold,personConstraints,personName,personAge,personRelationships} from './entity-view.mjs';
import {actorId,actorPath,householdDefinition} from './npc-state.mjs';
import {finishBusinessContract,refundContractEscrow,releaseBusinessLease} from './contracts.mjs';
import {advanceGuardianships} from './family-inheritance.mjs';
import {marriagePolitics,advanceFamilyAlliances} from './family-diplomacy.mjs';
import {familyEdges} from './family-state.mjs';
import {declareHoldingWriter} from './holdings.mjs';
import {holdingSet,holdingRemove} from './holding-sources.mjs';
import {pow} from './det-math.mjs';
import {heldUnit,wearItem} from './items.mjs';
import {isItemClass,heldOfClass,craftingParam,householdUsage} from './item-class.mjs';
declareHoldingWriter('npc-life',{kinds:['kin','household_member','resides','resident_of','companion','tamed_by','owns','employed_by','leases','operates','lodges','devotee_of','certified'],entities:['estate','wreck','office'],locations:true});

const DAY=1440,YEAR=360*DAY,unable=['濒死'];

// —— K4：日用品按耐用寿命磨损，家户炊事、取暖烧燃料，调味与保存用盐（都按类别，用量见 balance/crafting） ——
const UPKEEP={flow:'sink:consume',writer:'npc-life'};
const grams=(engine,item)=>Math.max(1,Math.round((engine.byId.get(item)?.weight??0)*1000));
// 在用的一件日用品每天按 耐久上限 ÷ 寿命天数 磨损（小数部分按确定的随机取整），另有 1 ÷ 寿命天数 的意外损坏；
// 磨到 0 或损坏即离手（进 sink:consume，用途 wear），同种的下一件接着用。手里没了的工具由 business 的"本行当要用而没有完好工具"需求去买。
function wearHeld(d,engine,who,day,items){
 const lifeDays=craftingParam(engine,'durability.lifeYears')*360,seed=d.get('randomSeed');
 for(const item of items){
  if(engine.quantity(d,who,item)<1)continue;
  const def=engine.byId.get(item),max=def?.durability;if(!(max>0))continue;
  const path=[...engine.bagPath(who),item];
  if(typeof d.get(...path)==='number')d.set(path,{quantity:d.get(...path),quality:def.quality,durability:max,weight:def.weight});
  const rate=max/lifeDays,points=Math.floor(rate)+(clockRoll(seed,`wear:${who}:${item}`,day)<rate-Math.floor(rate)?1:0);
  const broken=clockRoll(seed,`wear-break:${who}:${item}`,day)<1/lifeDays;
  const held=heldUnit(d,engine,who,item),current=held?.durability??max;
  const left=broken?0:Math.max(0,current-points);
  if(left===current)continue;
  if(left>0){wearItem(d,engine,who,item,current-left);continue;}
  const rest=engine.quantity(d,who,item)-1;
  engine.itemDelta(d,who,item,-1,{...UPKEEP,purpose:'wear',eventId:`wear:${day}:${who}:${item}`},held?.instance?{selection:[held.instance]}:{});
  if(rest>0&&typeof d.get(...path)==='object'&&!d.get(...path).instances?.length)d.set([...path,'durability'],max);
 }
}
// 店主货架上待售的货（本店补货清单里的物品）不是在用的日用品，也不是家里的柴盐：不磨损，家户炊事先用自家的，货架上的最后才动。
const merchandise=(engine,state,who)=>new Set(registerMerchandiseResolver.fn?.(engine,state,who)??[]);
export function advanceDurableWear(d,engine,day){
 if((d.get('state','family','wearDay')??-1)>=day)return;
 const state=d.get('state');
 for(const who of Object.keys(state.npcs??{}).sort()){
  if(isPhysicallyDead(engine,state,who))continue;
  const stock=merchandise(engine,state,who);
  wearHeld(d,engine,who,day,Object.keys(d.get(...engine.bagPath(who))??{}).sort().filter(item=>isItemClass(engine,item,'durable')&&!stock.has(item)));
 }
 // 玩家：随身衣物（apparel 类）穿着就磨；工具只在真实使用时磨（制作、采集各自的 toolWear）。
 wearHeld(d,engine,'player',day,Object.keys(d.get(...engine.bagPath('player'))??{}).sort().filter(item=>isItemClass(engine,item,'apparel')));
 d.set(['state','family','wearDay'],day);
}
// 家户每日燃料与盐：从户里各人持有的同类物品按重量扣整份；不足一份的用量记成欠量，下一日累计；手里没有就记短缺日。
function consumeByWeight(d,engine,holders,cls,needG,debtG,eventId,purpose){
 let debt=debtG+needG,short=false;
 const state=d.get('state'),stock=new Map(holders.map(h=>[h,merchandise(engine,state,h)]));
 // 先用户里同类中最便宜的（household-budget.usageCost：价格 ÷ 热值，无热值按 价格 ÷ 克），不按物品编号；家用的先于店主货架上的货。
 const cheapest=rows=>rows.sort((a,b)=>usageCost(engine,a.item)-usageCost(engine,b.item)||a.item.localeCompare(b.item)||a.h.localeCompare(b.h))[0]??null;
 const held=merchandiseToo=>holders.flatMap(h=>heldOfClass(d,engine,h,cls).filter(r=>merchandiseToo||!stock.get(h).has(r.item)).map(r=>({h,item:r.item})));
 for(;;){
  const pick=cheapest(held(false))??cheapest(held(true));
  if(!pick){short=debt>0;debt=Math.min(debt,needG);break;}
  const unit=grams(engine,pick.item);if(debt<unit)break;
  engine.itemDelta(d,pick.h,pick.item,-1,{...UPKEEP,purpose,eventId});debt-=unit;
 }
 return {debt,short};
}
function householdUpkeep(d,engine,day,p){
 const state=d.get('state'),holders=[...new Set([p.owner,...p.members])].filter(id=>state.npcs?.[id]).sort();if(!holders.length)return;
 // 用度按 item-class 的 householdUsage（唯一一份定义）逐类扣：欠量、短缺日按 `${cls}DebtG`、`${cls}ShortDays` 记。
 const usage=householdUsage(engine,day*DAY,p.members),key=['state','family','upkeep',p.key],eventId=`household-upkeep:${day}:${p.household??p.owner}`;
 const zero=Object.fromEntries([...usage.map(u=>[`${u.cls}DebtG`,0]),...usage.map(u=>[`${u.cls}ShortDays`,0])]),old={...zero,...d.get(...key)};
 const done=usage.map(u=>({u,...consumeByWeight(d,engine,holders,u.cls,Math.round(u.gramsPerDay),old[`${u.cls}DebtG`],eventId,u.purpose)}));
 const row={...Object.fromEntries(done.map(r=>[`${r.u.cls}DebtG`,r.debt])),...Object.fromEntries(done.map(r=>[`${r.u.cls}ShortDays`,r.short?old[`${r.u.cls}ShortDays`]+1:0]))};
 if(!canonicalEqual(old,row))d.set(key,row);
}

// Plan all meals against the same revision, then consume physical holdings.
export function advanceHouseholdMeals(d,engine,day,publicMeals=new Map()){
 advanceDurableWear(d,engine,day);
 const groups=householdSubsistenceGroups(engine,d.get('state'));
 // Public population portions cover registered residents, not an extra
 // portion for each unregistered visitor present. A stale aggregate count
 // also cannot distribute more portions than agriculture actually consumed.
 const represented=new Map();
 for(const g of groups)if(g.registered)represented.set(g.settlement,(represented.get(g.settlement)??0)+g.mouths);
 for(const [sid,ration]of publicMeals){ration.mouths=Math.max(ration.mouths,represented.get(sid)??0);ration.missing=ration.mouths-ration.eaten;}
 const plans=[],waterCohorts=new Map();
 for(const group of groups){
  const key=group.key,previous=d.get('state','family','meals',key);
  if(Math.max(d.get('state','family','mealDays',group.settlement??'unregistered')??-1,previous?.day??-1)>=day)continue;
  const ration=publicMeals.get(group.settlement),share=group.registered&&ration?.mouths>0?ration.eaten/ration.mouths:0;
  const plan=householdMealPlan(d,engine,group.owner,{publicShare:share});
  if(plan.members.length)plans.push({...group,key,previous,share,...plan});
 }
 // Replayed/past meal days must not replace today's persisted plan.
 if(plans.length)prepareHouseholdSubsistence(d,engine,day);
 for(const p of plans){
  p.supplied=supplyHousehold(d,engine,p.owner,day,p,{...p,waterCohorts});
  if(p.supplied.sources.length)Object.assign(p,householdMealWithSources(p,p.supplied.nutrition));
 }
 const adjustments=new Map();
 const saved=v=>Number.isInteger(v)?v:toRational(v);
 const nutrients=values=>Object.fromEntries(Object.entries(values).map(([k,v])=>[k,saved(v)]));
 for(const p of plans){
  const consumed=[];
  for(const row of p.rows){
   engine.itemDelta(d,row.holder,row.item,-row.food,{flow:'sink:consume',purpose:'meal',writer:'npc-life',eventId:`household-meal:${day}:${p.household??p.owner}`},{selection:row.selection});
   consumed.push({holder:row.holder,item:row.item,quantity:row.food});
  }
  const mouths=mouthWeight(engine,d.get('state'),p.members),missing=p.needs.satiety>0?mouths*p.shortfall.satiety/p.needs.satiety:0;
  if(p.registered){const adjustment=adjustments.get(p.settlement)??0;adjustments.set(p.settlement,adjustment+missing-mouths*(1-p.share));}
  const record={household:p.household,owner:p.owner,settlement:p.settlement,members:p.members,
   needs:nutrients(p.needs),publicNutrition:nutrients(p.publicNutrition),consumed,shortfall:nutrients(p.shortfall),missingMeals:saved(missing),
   unmetMealDays:(p.previous?.unmetMealDays??0)+(missing>0?1:0),
   // Stable fields precede optional supply receipts. A short-step diff may
   // append newly available receipts; its byte order must match a long wait.
   ...(p.supplied.sources.length?{sources:p.supplied.sources,sourceNutrition:nutrients(p.supplied.nutrition)}:{})};
  if(!canonicalEqual(p.previous,record))d.set(['state','family','meals',p.key],record);
  householdUpkeep(d,engine,day,p);
 }
 for(const settlement of new Set(plans.map(p=>p.settlement??'unregistered')))d.set(['state','family','mealDays',settlement],day);
 return adjustments;
}
const rules=engine=>engine.rules.npcLife;
const key=(...parts)=>digest(parts).slice(0,16);
const pairKey=(a,b)=>[a,b].sort().join('|');

function calendarDate(minute){const day=Math.floor(minute/DAY);return {year:Math.floor(day/360)+1,month:Math.floor(day/30)%12+1,day:day%30+1};}
// Age follows the authored birth date on the world calendar; a person without
// one ages from the authored age at minute 0.
// No known age counts as a minor unless the profile explicitly says otherwise.
export function npcIsMinor(engine,state,id,minute=state.minute){
 const age=npcAgeAt(engine,state,id,minute);
 if(age===null)return (state.family?.people?.[id]??engine.byId.get(id))?.flags?.minor!==false;
 return age<(rules(engine)?.adultAge??18);
}
const alive=(state,id)=>Boolean(state.npcs[id])&&!isPhysicallyDead(null,state,id)&&!unable.includes(state.npcs[id].status);
// Full catalog people, plus roster people and campaign-born children whom
// family life has brought into the simulation (they carry state.npcs.*.life).
const lifeActor=(engine,state,id)=>Boolean(state.npcs[id])&&(personSimulation(engine,state,id).value||Boolean(state.npcs[id].life));
// Bring a roster housemate or relative into campaign state when a family
// event needs them (see population.mjs); false when they cannot be.
function bring(d,engine,id,minute,reason){
 const state=d.get('state'),row=rosterLifeState(engine,state,id,minute,reason,{minor:npcIsMinor(engine,state,id,minute)});
 if(!row)return false;holdingSet(d,null,['state','npcs',id],row,'npc-life');return true;
}
function withRoster(engine,state,ids,minute){
 const extra={};for(const id of ids){const row=rosterLifeState(engine,state,id,minute,'预检',{minor:npcIsMinor(engine,state,id,minute)});if(row)extra[id]=row;}
 return Object.keys(extra).length?{...state,npcs:{...state.npcs,...extra}}:state;
}
// A child born in this event is addressable by later steps of the same event.
// Only a per-event session map is touched, never the shared world resolver.
function admit(engine,entity){
 const parent=Object.getPrototypeOf(engine);
 if(Object.hasOwn(engine,'byId')&&parent?.byId&&parent.byId!==engine.byId&&!engine.byId.has(entity.id))engine.byId.set(entity.id,entity);
}

// Registered households plus campaign births and moves. The catalog list is
// not edited: a registered member who moved away is listed under `left`.
function setMembership(d,engine,houseId,id,inside){
 const house=householdDefinition(engine,d.get('state'),houseId),row=d.get('state','family','households',houseId)??{};
 const members=(row.members??[]).filter(m=>m!==id),left=(row.left??[]).filter(m=>m!==id);
 if(house.members.includes(id)){if(!inside)left.push(id);}else if(inside)members.push(id);
 holdingSet(d,null,['state','family','households',houseId],{...row,members,...(left.length||row.left?{left}:{})},'npc-life');
}

const staticTie=(engine,a,b)=>[...(engine.byId.get(a)?.relationships??[]).filter(r=>r.with===b),...(engine.byId.get(b)?.relationships??[]).filter(r=>r.with===a)];
// Authored spouses are an existing marriage; campaign marriages are added.
function marriagesOf(engine,state,id){
 const rows=Object.values(state.family?.marriages??{}).filter(m=>m.status==='在婚'&&m.partners.includes(id));
 for(const r of engine.byId.get(id)?.relationships??[])if(r.type==='配偶'&&engine.byId.get(r.with)){
  const mid=staticMarriageId(id,r.with);
  if(!rows.some(m=>m.id===mid)&&state.family?.marriages?.[mid]?.status!=='丧偶')rows.push({id:mid,partners:[id,r.with].sort(),status:'在婚',static:true});
 }
 return rows;
}
const staticMarriageId=(a,b)=>`marriage:static:${pairKey(a,b)}`;
// A roster spouse has no simulated state and is taken as living.
const spouseLiving=(engine,state,id)=>state.npcs[id]?alive(state,id):Boolean(engine.byId.get(id));
function livingSpouse(engine,state,id){return marriagesOf(engine,state,id).some(m=>m.partners.some(p=>p!==id&&spouseLiving(engine,state,p)));}
function kin(engine,state,a,b){
 const links=familyEdges(engine,state).filter(r=>r.kind==='parent'),ancestors=id=>{
  const seen=new Set(),pending=[id];while(pending.length){const p=pending.pop();for(const r of links)if(r.to===p&&!seen.has(r.from)){seen.add(r.from);pending.push(r.from);}}return seen;
 },aa=ancestors(a),bb=ancestors(b);
 if(aa.has(b)||bb.has(a)||[...aa].some(id=>bb.has(id)))return true;
 const types=new Set(rules(engine).kinTypes);
 if(staticTie(engine,a,b).some(r=>types.has(r.type)))return true;
 const parents=id=>Object.values(state.family?.people?.[id]?.parents??{});
 return parents(a).includes(b)||parents(b).includes(a)||parents(a).some(p=>parents(b).includes(p));
}
// Each side decides for itself from its own view of the other person.
export function npcWilling(engine,state,from,to,{minimumTrust,minimumAffection}){
 const flags=engine.byId.get(from)?.flags;
 if(flags?.romanceable===false&&flags?.minor!==true)return false;
 const view=relationView(engine,state,from,to);
 return view.trust>=minimumTrust&&view.affection>=minimumAffection;
}

// Null when both people may court now; otherwise the first unmet condition.
export function marriageBlocker(engine,state,a,b,minute=state.minute,ceremony=false){
 const r=rules(engine);if(!r)return '世界规则没有登记成年家庭关系';
 if(a===b)return '须为两个人';
 for(const id of [a,b]){
  if(!personSimulation(engine,state,id).value||!state.npcs[id])return '须为有独立状态的人物';
  if(npcIsMinor(engine,state,id,minute))return '未成年人不进入恋爱或婚姻';
 }
 for(const id of [a,b])if(!alive(state,id))return '一方已死亡或濒死';
 if(kin(engine,state,a,b))return '双方是亲属';
 if(livingSpouse(engine,state,a)||livingSpouse(engine,state,b))return '一方仍在婚';
 const ha=npcHousehold(engine,state,a),hb=npcHousehold(engine,state,b);
 if(!ha||!hb||ha.settlement!==hb.settlement&&!(ceremony&&state.npcs[a].location===state.npcs[b].location))return '双方不在同一聚落登记居住';
 if(!npcWilling(engine,state,a,b,r.courtship))return `${engine.byId.get(a).name}不愿意`;
 if(!npcWilling(engine,state,b,a,r.courtship))return `${engine.byId.get(b).name}不愿意`;
 return null;
}

// Pairs with an existing tie in either direction; strangers never court.
function candidatePairs(engine,state){
 const pairs=new Map();
 for(const id of Object.keys(state.npcs).sort()){
  if(!personSimulation(engine,state,id).value)continue;
  const others=[...(engine.byId.get(id).relationships??[]).map(r=>r.with),...Object.keys(state.npcs[id].relationships??{})];
  for(const other of others)if(other!==id&&other.startsWith('npc_')&&state.npcs[other])pairs.set(pairKey(id,other),[id,other].sort());
 }
 for(const c of Object.values(state.family?.courtships??{}))pairs.set(pairKey(...c.partners),[...c.partners]);
 return [...pairs.values()].sort((x,y)=>pairKey(...x).localeCompare(pairKey(...y)));
}

const nameOf=(engine,state,id)=>personName(engine,state,id).value??id;
function addMemory(d,who,row){
 const stream=d.get('state','npcs',who,'memoryStream')??[];if(stream.some(m=>(m.rootMemoryId??m.id)===row.rootMemoryId))return;
 holdingSet(d,null,['state','npcs',who,'memoryStream'],[...stream,{...row,id:`${row.rootMemoryId}:${who}`}],'npc-life');
}
// Those involved remember it first-hand; household members who are actually
// with one of them at that moment witness it. Everyone else hears later, if
// at all, through the daily conversations and carried messages.
function witness(d,engine,eventId,principals,houses,{minute,kind,content,salience=3,at:places=null}){
 const state=d.get('state'),at=new Set(places??principals.map(p=>state.npcs[p]?.location).filter(Boolean));
 const memory={rootMemoryId:eventId,sourceEvent:eventId,kind,minute,occurredAt:minute,participants:[...principals],content,emotion:'郑重'};
 for(const p of principals)if(alive(state,p))addMemory(d,p,{...memory,location:state.npcs[p].location??places?.[0]??null,sourceType:'亲历',salience});
 const seen=[...new Set(houses.flatMap(h=>householdMembers(engine,state,h)))].filter(id=>!principals.includes(id)&&alive(state,id)&&at.has(state.npcs[id].location)&&!state.npcs[id].scheduleTravel&&!state.npcs[id].cognitionTravel).sort();
 for(const id of seen)addMemory(d,id,{...memory,location:state.npcs[id].location,sourceType:'目击',salience:Math.max(2,salience-1)});
 // The player standing right there sees it too; nobody else's knowledge is
 // handed to the player (see npcLifeLines and the people panel).
 if(state.location&&at.has(state.location)&&!isPhysicallyDead(engine,state,'player')&&!unable.includes(state.player?.status))holdingSet(d,null,['state','family','seenByPlayer',eventId],minute,'npc-life');
 return seen;
}

export function marry(d,engine,[a,b],courtship,minute){
 const state=d.get('state'),id=`marriage_${key(a,b,minute)}`,ha=npcHousehold(engine,state,a),hb=npcHousehold(engine,state,b);
 const content=`${nameOf(engine,state,a)}与${nameOf(engine,state,b)}在${engine.calendar(minute).text.slice(0,-6)}结为夫妻。`;
 holdingSet(d,null,['state','family','marriages',id],{id,partners:[a,b],since:minute,courtshipSince:courtship.since,settlement:ha.settlement,households:[...new Set([ha.id,hb.id])],status:'在婚',sourceEvent:id},'npc-life');
 holdingRemove(d,null,['state','family','courtships',pairKey(a,b)],'npc-life');
 const delta=rules(engine).marriageRelation;
 for(const [from,to] of [[a,b],[b,a]])recordLifeRelation(d,engine,{key:`${id}:${from}`,sourceEvent:id,eventType:'成婚',from,to,minute,delta},who=>npcIsMinor(engine,d.get('state'),who,minute));
 for(const p of [a,b])holdingSet(d,null,['state','npcs',p,'developments'],[...d.get('state','npcs',p,'developments')??[],{type:'成婚',source:id,minute,with:p===a?b:a}],'npc-life');
 const witnesses=witness(d,engine,id,[a,b],[ha.id,hb.id],{minute,kind:'family',content});
 holdingSet(d,null,['state','family','marriages',id,'witnesses'],witnesses,'npc-life');
 const marriage=d.get('state','family','marriages',id);marriagePolitics(d,engine,marriage);
 entityTransition(d,engine,{id,verb:'marry',actor:a,target:b,minute,location:state.npcs[a]?.location??ha.settlement,witnesses,summary:content});
 return marriage;
}

// A married opposite-sex couple living in a household with a population
// ledger; the bearing parent is an adult within the configured age range.
export function birthBlocker(engine,state,marriage,minute=state.minute){
 const r=rules(engine)?.birth;if(!r)return '世界规则没有登记出生';
 if(marriage.status!=='在婚')return '婚姻已结束';
 const [a,b]=marriage.partners,sex=id=>engine.byId.get(id)?.sex;
 const mother=[a,b].find(id=>sex(id)==='女'),father=[a,b].find(id=>sex(id)==='男');
 if(!mother||!father)return '这对夫妻不会怀孕';
 for(const id of [a,b])if(!alive(state,id)||['昏迷','患病'].includes(state.npcs[id].status))return '一方没有独立人物状态或健康不允许';
 const age=npcAgeAt(engine,state,mother,minute);
 if(age===null||npcIsMinor(engine,state,mother,minute)||npcIsMinor(engine,state,father,minute)||age<r.motherAge[0]||age>r.motherAge[1])return '生育年龄不符';
 if(Object.values(state.family?.pregnancies??{}).some(p=>p.mother===mother&&p.status==='怀孕'))return '已在孕期';
 const last=Math.max(-Infinity,...Object.values(state.family?.births??{}).filter(x=>x.mother===mother).map(x=>x.minute));
 if(minute-last<r.spacingDays*DAY)return '距上次生育太近';
 const house=npcHousehold(engine,state,mother);
 if(!house||!Number.isSafeInteger(state.settlements?.[house.settlement]?.population))return '没有可登记的家户和人口账';
 if(!npcWilling(engine,state,mother,father,r)||!npcWilling(engine,state,father,mother,r))return '夫妻关系不睦';
 return null;
}

function conceive(d,engine,marriage,minute){
 const state=d.get('state'),[a,b]=marriage.partners,mother=engine.byId.get(a).sex==='女'?a:b,father=mother===a?b:a;
 const id=`pregnancy_${key(marriage.id,minute)}`,house=npcHousehold(engine,state,mother);
 holdingSet(d,null,['state','family','pregnancies',id],{id,marriage:marriage.id,mother,father,conceivedAt:minute,dueAt:minute+rules(engine).birth.gestationDays*DAY,household:house.id,status:'怀孕'},'npc-life');
 witness(d,engine,id,[mother,father],[],{minute,kind:'family',content:`${nameOf(engine,state,mother)}有了身孕。`,salience:2});
}

function deliver(d,engine,pregnancy,minute){
 const state=d.get('state'),r=rules(engine).birth;
 if(!alive(state,pregnancy.mother)){holdingSet(d,null,['state','family','pregnancies',pregnancy.id],{...pregnancy,status:'中止',endedAt:minute,reason:'母亲已不在'},'npc-life');return;}
 const house=npcHousehold(engine,state,pregnancy.mother)??{id:pregnancy.household,...engine.world.households.find(h=>h.id===pregnancy.household)};
 const ledger=state.settlements?.[house.settlement];
 if(!Number.isSafeInteger(ledger?.population)){holdingSet(d,null,['state','family','pregnancies',pregnancy.id],{...pregnancy,status:'中止',endedAt:minute,reason:'聚落人口账不存在'},'npc-life');return;}
 const seed=d.get('randomSeed'),day=minute/DAY,sex=clockRoll(seed,`${pregnancy.id}:sex`,day)<0.5?'女':'男';
 const given=r.givenNames[Math.floor(clockRoll(seed,`${pregnancy.id}:name`,day)*r.givenNames.length)];
 const child=`npc_born_${key(pregnancy.id)}`,name=`${nameOf(engine,state,pregnancy.father).slice(0,1)}${given}`,birthId=`birth_${key(pregnancy.id)}`;
 holdingSet(d,null,['state','family','people',child],{id:child,name,sex,birth:calendarDate(minute),bornAt:minute,parents:{mother:pregnancy.mother,father:pregnancy.father},
  marriage:pregnancy.marriage,household:house.id,settlement:house.settlement,location:house.homeLocation,status:'正常',flags:{minor:true,romanceable:false},sourceEvent:birthId},'npc-life');
 holdingSet(d,null,['state','family','households',house.id,'members'],[...state.family?.households?.[house.id]?.members??[],child],'npc-life');
 d.set(['state','settlements',house.settlement,'population'],ledger.population+1);
 holdingSet(d,null,['state','family','pregnancies',pregnancy.id],{...pregnancy,status:'已生产',endedAt:minute,child},'npc-life');
 const content=`${nameOf(engine,state,pregnancy.mother)}在${engine.calendar(minute).text.slice(0,-6)}生下${sex==='女'?'女儿':'儿子'}${name}，入${engine.byId.get(house.homeLocation)?.name??'本'}户。`;
 const witnesses=witness(d,engine,birthId,[pregnancy.mother,pregnancy.father],[house.id],{minute,kind:'family',content});
 // The child is a campaign person: home routine with no work, population,
 // health and moving like everyone else, never courtship or intimacy.
 const entity={id:child,name,aliases:[],tier:'roster',generated:'birth',age:0,sex,settlement:house.settlement,scope:house.settlement,householdId:house.id,
  home:{location:house.homeLocation},location:house.homeLocation,occupation:'幼童',flags:{minor:true,romanceable:false},sourceEvent:birthId};
 holdingSet(d,null,['state','created',child],entity,'npc-life');admit(engine,entity);
 holdingSet(d,null,['state','npcs',child],{...initialNpcState(entity),occupation:'幼童',activity:'由家人照看',routine:lifeRoutine(house.homeLocation,{minor:true}),life:{kind:'born',since:minute,source:birthId}},'npc-life');
 for(const parent of [pregnancy.mother,pregnancy.father])if(d.get('state','npcs',parent))for(const [from,to] of [[parent,child],[child,parent]])
  recordLifeRelation(d,engine,{key:`${birthId}:${from}:${to}`,sourceEvent:birthId,eventType:'出生',from,to,minute,delta:r.childRelation??{trust:50,affection:60}},()=>true);
 holdingSet(d,null,['state','family','births',birthId],{id:birthId,child,mother:pregnancy.mother,father:pregnancy.father,marriage:pregnancy.marriage,minute,household:house.id,settlement:house.settlement,
  population:{before:ledger.population,after:ledger.population+1},witnesses},'npc-life');
}

function familyDay(d,engine,minute){
 const r=rules(engine),seed=d.get('randomSeed'),day=minute/DAY;
 for(const m of Object.values(d.get('state','family','marriages')??{}).sort((x,y)=>x.id.localeCompare(y.id))){
  const state=d.get('state');
  if(m.status==='在婚'&&m.partners.some(p=>!alive(state,p)))holdingSet(d,null,['state','family','marriages',m.id],{...m,status:'丧偶',endedAt:minute},'npc-life');
 }
 for(const p of Object.values(d.get('state','family','pregnancies')??{}).sort((x,y)=>x.id.localeCompare(y.id)))if(p.status==='怀孕'&&p.dueAt<=minute)deliver(d,engine,p,minute);
 // Authored spouses who have died end their marriage in campaign state too.
 for(const [a,b] of candidatePairs(engine,d.get('state'))){
  const state=d.get('state'),k=pairKey(a,b),old=state.family?.courtships?.[k];
  if(staticTie(engine,a,b).some(t=>t.type==='配偶')&&!state.family?.marriages?.[staticMarriageId(a,b)]&&(!alive(state,a)||!alive(state,b)))
   holdingSet(d,null,['state','family','marriages',staticMarriageId(a,b)],{id:staticMarriageId(a,b),partners:[a,b],status:'丧偶',static:true,endedAt:minute},'npc-life');
  if(marriageBlocker(engine,state,a,b,minute)){if(old)holdingRemove(d,null,['state','family','courtships',k],'npc-life');continue;}
  if(!old){holdingSet(d,null,['state','family','courtships',k],{partners:[a,b],since:minute},'npc-life');continue;}
  if(minute-old.since>=r.courtship.days*DAY&&clockRoll(seed,`marriage:${k}`,day)<r.courtship.marriageChancePerDay)marry(d,engine,[a,b],old,minute);
 }
 const seen=new Set();
 for(const id of Object.keys(d.get('state','npcs')).sort())for(const m of marriagesOf(engine,d.get('state'),id)){
  if(seen.has(m.id))continue;seen.add(m.id);
  // A roster spouse is checked as they would be in campaign state and brought
  // in only when the couple actually conceives.
  const state=d.get('state'),missing=m.partners.filter(p=>!state.npcs[p]);
  if(!birthBlocker(engine,missing.length?withRoster(engine,state,missing,minute):state,m,minute)&&clockRoll(seed,`conception:${m.id}`,day)<r.birth.conceptionChancePerDay){
   for(const p of missing)bring(d,engine,p,minute,'生育');
   conceive(d,engine,m,minute);
  }
 }
}

// ---- Illness, ageing and natural death -------------------------------------
// Each midnight a living, settled person may fall ill or die of old age with
// the rates of their current age band; a grave illness may end in death on a
// later night, less often when a household member is caring for them. The
// illness only adds its own fever to the medical record and restores only its
// own status, so older wounds and conditions are kept as they were.
const incapable=['濒死','昏迷','患病'];
const incapacitated=(state,id)=>isPhysicallyDead(null,state,id)||incapable.includes(state.npcs[id]?.status);
const healthRules=engine=>rules(engine)?.health;
const perDay=perYear=>1-pow(1-Math.min(1,perYear),1/360);
function ageBand(h,age){let band=null;for(const row of h.bands)if(age>=row.fromAge)band=row;return band;}
const humanLifespan=engine=>(engine.world.balance?.population??populationBalance).params.find(r=>r.id==='lifespan.human').value;
const agingRates=engine=>(engine.world.balance?.attributes??attributeBalance).params.find(r=>r.id==='attr.aging').value;
function lifecycle(engine,state,id){
 const actor=state.npcs?.[id]??state.creatures?.[id],base=state.created?.[id]??engine.byId.get(id);
 return actor?.lifecycle??base?.lifecycle??engine.byId.get(actor?.species??base?.species)?.lifecycle??rules(engine).lifecycle??{};
}
function lifeAge(engine,state,id,minute){
 const actor=state.npcs?.[id]??state.creatures?.[id],base=state.family?.people?.[id]??state.created?.[id]??engine.byId.get(id);
 if(Number.isSafeInteger(actor?.bornAt??base?.bornAt))return Math.max(0,(minute-(actor?.bornAt??base.bornAt))/YEAR);
 if(base?.birth){const b=base.birth;return Math.max(0,((1-b.year)*360-(b.month-1)*30-(b.day-1)+minute/DAY)/360);}
 return Number.isFinite(base?.age)?base.age+minute/YEAR:null;
}
// The existing age-band curve is expressed in human-equivalent years. Above
// its last band, continuing its survival hazard tends to 1 without a death age.
function annualLifeRisk(h,age){
 const band=ageBand(h,age);if(!band)return 0;
 const last=h.bands.at(-1),exposure=last.fromAge>0?Math.max(1,age/last.fromAge):1;
 return 1-pow(1-band.suddenDeathPerYear,exposure);
}
function ageDay(d,engine,id,minute,path){
 // These reads produce only numbers and copied attributes before writing;
 // they must not expose the whole NPC dictionary on every daily clock tick.
 const document=d.peek?d.peek():d.document,state=document.state,actor=path.reduce((v,k)=>v?.[k],document),spec=lifecycle(engine,state,id);
 if(Object.hasOwn(spec,'lifespan')&&spec.lifespan===null){
  const result={minute,lifespan:null,riskAge:actor.aging?.riskAge??0,catchUpRemaining:0,annualRisk:0};
  d.set([...path,'aging'],result);return result;
 }
 const human=humanLifespan(engine),rates=agingRates(engine),base=spec.lifespan??human;
 if(!Number.isFinite(base)||base<=0)throw Error('物种寿命须为正数或不老的 null');
 const lifespan=derived(engine,document,'life:lifespan',id,{base}),age=lifeAge(engine,state,id,minute);
 if(age===null)return null;
 const previous=actor.aging,elapsed=previous?(minute-previous.minute)/YEAR:1/360;
 if(elapsed<0)throw Error('衰老时钟不能倒退');
 if(previous&&elapsed===0)return previous;
 const rate=derived(engine,document,'life:aging',id,{base:1}),target=age*human/lifespan;
 let remaining=previous?.catchUpRemaining??0;
 if(previous&&(previous.lifespan===null||lifespan<previous.lifespan)){
  if(!Number.isFinite(spec.agingCatchUp)||spec.agingCatchUp<=0)throw Error('寿命骤降须由物种声明 agingCatchUp 年数');
  remaining=spec.agingCatchUp;
 }
 const naturalElapsed=elapsed*human/lifespan,ordinary=naturalElapsed*rate,from=previous?.riskAge??Math.max(0,target-naturalElapsed);
 let riskAge=from+ordinary;
 if(previous&&previous.lifespan!==null&&lifespan>previous.lifespan)riskAge=Math.min(target,riskAge);
 if(remaining>0){const used=Math.min(remaining,elapsed*rate);riskAge+=Math.max(0,target-riskAge)*used/remaining;remaining-=used;}
 const attributes={...actor.attributes},baseline=state.created?.[id]??engine.byId.get(id);
 for(const [names,start,loss] of [[['力量','敏捷','体质'],rates.bodyFromYear,rates.bodyPerYear],[['智力','精神'],rates.mindFromYear,rates.mindPerYear]]){
  const years=Math.max(0,riskAge-start)-Math.max(0,from-start);
  if(years>0)for(const name of names)attributes[name]=Math.max(1,(attributes[name]??baseline?.attributes?.[name]??10)-years*loss);
 }
 if(Object.keys(attributes).length)d.set([...path,'attributes'],attributes);
 const result={minute,lifespan,riskAge,catchUpRemaining:remaining,annualRisk:annualLifeRisk(healthRules(engine),riskAge)};
 d.set([...path,'aging'],result);return result;
}
// People away with the player are on screen; off-screen life events wait.
const settled=(state,id)=>{const n=state.npcs[id];return Boolean(n?.location)&&!n.scheduleTravel&&!n.cognitionTravel&&!state.player?.companions?.includes(id);};
// Someone travelling with the player still ages and may fall ill at night,
// where the illness shows as an ordinary fever; but a sudden death and the
// deadly turn of a grave illness are not settled while they are at the
// player's side. Those wait until the person is back on their own.
const withPlayer=(state,id)=>Boolean(state.npcs[id]?.location)&&Boolean(state.player?.companions?.includes(id));
// Present wounds or low health make a new illness more likely to be grave.
function weakened(npc){
 const m=npc.medical;
 return Boolean(m?.wounds?.some(w=>!w.closed||w.infected)||m?.tendon?.ruptured||Number.isFinite(npc.hp)&&Number.isFinite(npc.maxHp)&&npc.maxHp>0&&npc.hp<npc.maxHp/2);
}
export function npcIllness(state,id){return Object.values(state.family?.illnesses??{}).find(r=>r.patient===id&&r.status==='患病中')??null;}

function addFever(d,engine,id,illness){
 const h=healthRules(engine),old=d.get('state','npcs',id,'medical');
 const m=old?structuredClone(old):{bloodMl:h.bloodMl,pain:0,wounds:[],symptoms:[]};
 m.symptoms=[...(m.symptoms??[]),{kind:'fever',observable:true,temperatureC:illness.severity==='重'?h.feverC[1]:h.feverC[0],illness:illness.id}];
 holdingSet(d,null,['state','npcs',id,'medical'],m,'npc-life');return !old;
}
function removeFever(d,id,illness){
 const m=d.get('state','npcs',id,'medical');if(!m)return;
 const symptoms=(m.symptoms??[]).filter(s=>s.illness!==illness.id);
 if(illness.medicalCreated&&!m.wounds?.length&&!symptoms.length&&!m.tendon&&!m.parasites?.length&&!m.lostBloodMl){d.remove(['state','npcs',id,'medical']);return;}
 holdingSet(d,null,['state','npcs',id,'medical'],{...m,symptoms},'npc-life');
}
function release(d,illness){
 for(const id of Object.keys(d.get('state','npcs')).sort())if(d.get('state','npcs',id,'caring')?.illness===illness.id)d.remove(['state','npcs',id,'caring']);
}
// A household adult who is able and not away with the player stays home to
// care for a gravely ill person; the spouse comes first, then by id.
function caregiverFor(engine,state,illness,minute){
 const house=npcHousehold(engine,state,illness.patient);if(!house)return null;
 const spouse=marriagesOf(engine,state,illness.patient).flatMap(m=>m.partners);
 const able=id=>id!==illness.patient&&lifeActor(engine,state,id)&&!incapacitated(state,id)&&!npcIsMinor(engine,state,id,minute)
  &&!state.npcs[id].cognitionTravel&&!state.player?.companions?.includes(id)&&(!state.npcs[id].caring||state.npcs[id].caring.illness===illness.id);
 const current=Object.keys(state.npcs).find(id=>state.npcs[id].caring?.illness===illness.id);
 if(current&&able(current)&&house.members.includes(current))return current;
 return house.members.filter(able).sort((a,b)=>(spouse.includes(b)-spouse.includes(a))||a.localeCompare(b))[0]??null;
}
function assignCare(d,engine,illness,minute){
 if(withPlayer(d.get('state'),illness.patient))return null;
 let state=d.get('state'),who=caregiverFor(engine,state,illness,minute);const house=npcHousehold(engine,state,illness.patient);
 // Nobody with campaign state can nurse them: an adult roster housemate,
 // the spouse first, is brought in to do it.
 if(!who&&house){
  const spouse=new Set(marriagesOf(engine,state,illness.patient).flatMap(m=>m.partners));
  const roster=house.members.filter(id=>id!==illness.patient&&!state.npcs[id]&&engine.byId.get(id)?.tier==='roster'&&!npcIsMinor(engine,state,id,minute)).sort((a,b)=>(spouse.has(b)-spouse.has(a))||a.localeCompare(b));
  for(const id of roster)if(bring(d,engine,id,minute,'照护家人')){state=d.get('state');who=caregiverFor(engine,state,illness,minute);break;}
 }
 for(const id of Object.keys(state.npcs).sort())if(state.npcs[id].caring?.illness===illness.id&&id!==who)d.remove(['state','npcs',id,'caring']);
 if(who&&!state.npcs[who].caring)holdingSet(d,null,['state','npcs',who,'caring'],{patient:illness.patient,illness:illness.id,location:house.homeLocation,since:minute},'npc-life');
 const row=d.get('state','family','illnesses',illness.id);
 if(who&&!row.caregivers.includes(who))holdingSet(d,null,['state','family','illnesses',illness.id,'caregivers'],[...row.caregivers,who],'npc-life');
 return who;
}

function fallIll(d,engine,id,minute,band){
 const h=healthRules(engine),seed=d.get('randomSeed'),day=minute/DAY,state=d.get('state'),npc=state.npcs[id];
 const graveChance=Math.min(1,band.graveShare*(weakened(npc)?h.weakenedGraveMultiplier:1));
 const severity=clockRoll(seed,`illness-severity:${id}`,day)<graveChance?'重':'轻',[low,high]=severity==='重'?h.graveDays:h.mildDays;
 const days=low+Math.floor(clockRoll(seed,`illness-days:${id}`,day)*(high-low+1));
 beginIllness(d,engine,id,minute,{severity,days,illId:`illness_${key(id,minute)}`});
}
function beginIllness(d,engine,id,minute,{severity,days,illId,disease=null}){
 const state=d.get('state'),npc=state.npcs[id];
 const illness={id:illId,patient:id,severity,since:minute,endsAt:minute+days*DAY,status:'患病中',previousStatus:npc.status??null,household:npcHousehold(engine,state,id)?.id??null,caregivers:[],
  ...(disease?{disease:disease.id,diseaseName:disease.name,epidemic:disease.epidemic,...(disease.fatality?{fatality:disease.fatality}:{})}:{})};
 illness.medicalCreated=addFever(d,engine,id,illness);
 holdingSet(d,null,['state','family','illnesses',illId],illness,'npc-life');
 holdingSet(d,null,['state','npcs',id,'status'],'患病','npc-life');holdingSet(d,null,['state','npcs',id,'activity'],'患病','npc-life');
 holdingSet(d,null,['state','npcs',id,'developments'],[...d.get('state','npcs',id,'developments')??[],{type:'患病',source:illId,minute,severity,...(disease?{disease:disease.id}:{})}],'npc-life');
 if(severity==='重')assignCare(d,engine,illness,minute);
 const date=engine.calendar(minute).text.slice(0,-6);
 const content=disease?`${nameOf(engine,state,id)}在${date}染上${disease.name}（${disease.symptoms}），${severity==='重'?'病重卧床':'在家歇着'}。`:`${nameOf(engine,state,id)}在${date}${severity==='重'?'病重卧床':'染病在家歇着'}。`;
 witness(d,engine,illId,[id],illness.household?[illness.household]:[],{minute,kind:'health',content,salience:severity==='重'?3:1});
 return illness;
}
// U3: an epidemic (seasonal-hazards.mjs) gives a named disease with its own
// course and fatality. The person must be in campaign life and not already
// ill or incapable; nursing, recovery and death then follow the rules above.
export function contractIllness(d,engine,id,minute,{severity,days,disease}){
 const state=d.get('state'),npc=state.npcs?.[id];
 if(!healthRules(engine)||!npc||!lifeActor(engine,state,id)||incapacitated(state,id)||npcIllness(state,id))return null;
 return beginIllness(d,engine,id,minute,{severity,days,disease,illId:`illness_${key(id,minute,disease.id)}`});
}
export function recoverIllness(d,engine,illness,minute){
 const id=illness.patient;
 if(id==='player'){
  const row=d.get('state','family','illnesses',illness.id);holdingSet(d,null,['state','family','illnesses',illness.id],{...row,status:'痊愈',endedAt:minute},'npc-life');
  const m=d.get('state','player','medical');if(m)d.set(['state','player','medical'],{...m,symptoms:(m.symptoms??[]).filter(s=>s.illness!==illness.id)});return;
 }
 if(d.get('state','npcs',id,'status')==='患病'){if(illness.previousStatus===null)d.remove(['state','npcs',id,'status']);else holdingSet(d,null,['state','npcs',id,'status'],illness.previousStatus,'npc-life');}
 removeFever(d,id,illness);release(d,illness);
 const row=d.get('state','family','illnesses',illness.id);
 holdingSet(d,null,['state','family','illnesses',illness.id],{...row,status:'痊愈',endedAt:minute},'npc-life');
 // Nursing is help that both remember; the patient's regard grows most.
 const k=rules(engine).kindness?.care;
 if(k)for(const carer of row.caregivers??[])if(alive(d.get('state'),carer)){
  recordLifeRelation(d,engine,{key:`care:${illness.id}:${id}:${carer}`,sourceEvent:illness.id,eventType:'照护',from:id,to:carer,minute,delta:{trust:k.trust,affection:k.affection}},()=>true);
  recordLifeRelation(d,engine,{key:`care:${illness.id}:${carer}:${id}`,sourceEvent:illness.id,eventType:'照护',from:carer,to:id,minute,delta:{affection:k.carerAffection??1}},()=>true);
 }
}

// Natural death uses the status every module already settles: services,
// schedules, contracts, quests and marriages read '死亡'. In addition the
// person's open appointments end without blame, the household ledger loses a
// mouth. Local law distributes the estate and appoints time-limited care
// for minors without moving their property into the guardian's ownership.
export function recordMilitaryDeath(d,engine,id,minute){return recordEntityDeath(d,engine,id,minute,'战死');}
export function recordEntityDeath(d,engine,id,minute,cause,illness=null){
 id=actorId(engine.world,id);const path=actorPath(engine.world,id),actor=d.get(...path);
 if(!actor)return null;
 if(id==='player'){
  engine.death(d);return d.get('holdings','protocol','entities','player');
 }
 const previous=Object.values(d.get('state','family','deaths')??{}).find(r=>r.person===id&&(r.incarnation??0)===(actor.incarnation??0));
 if(previous||actor.diedAt!==undefined)return previous??null;
 let result;
 const shops=businessSnapshot(engine,d.get('state'));
 const life=actor.incarnation??0,deathId=`death_${key(id,minute)}${life?`_${life}`:''}`;
 transition(d,engine,{entity:id,basis:'death',origin:'death_rule',generation:life,legacyReceipt:`estate_${deathId}`,location:actor.location,causes:[cause],durations:engine.rules.law?.estate?.durations??{notice:DAY,filing:DAY},
  legacy:()=>{result=recordLegacyEntityDeath(d,engine,id,minute,cause,illness);businessTransitions(d,engine,shops,deathId,minute);}});
 return result;
}
function recordLegacyEntityDeath(d,engine,id,minute,cause,illness=null){
 id=actorId(engine.world,id);const path=actorPath(engine.world,id),actor=d.get(...path);
 if(!actor||id==='player')return null;
 // A death row belongs to one life: a wild body's id comes back as a new
 // incarnation (state.creatures[id].incarnation) once its corpse is gone, and
 // that body dies once more; the registry keeps each life's row.
 const life=actor.incarnation??0,previous=Object.values(d.get('state','family','deaths')??{}).find(r=>r.person===id&&(r.incarnation??0)===life);
 if(previous||actor.diedAt!==undefined)return previous??null;
 const npc=path[1]==='npcs',household=personHousehold(engine,d.get('state'),id).value;
 // Roster housemates are the ones who inherit, mourn and may later have to
 // move to kin; they enter campaign state now.
 for(const x of household?.members??[])if(x!==id&&!d.get('state','npcs',x))bring(d,engine,x,minute,'家中有人去世');
 const state=d.get('state'),house=household,deathId=`death_${key(id,minute)}${life?`_${life}`:''}`,name=nameOf(engine,state,id);
 d.set([...path,'status'],'死亡');d.set([...path,'activity'],'已故');d.set([...path,'diedAt'],minute);
 if(actor.hp!==undefined)d.set([...path,'hp'],0);
 for(const field of ['caring','scheduleTravel','cognitionTravel'])if(actor[field])d.remove([...path,field]);
 if(state.player.companions?.includes(id))holdingSet(d,null,['state','player','companions'],state.player.companions.filter(x=>x!==id),'npc-life');
 for(const row of Object.values(state.family?.illnesses??{}).filter(r=>r.patient===id&&r.status==='患病中')){
  release(d,row);holdingSet(d,null,['state','family','illnesses',row.id],{...d.get('state','family','illnesses',row.id),status:cause==='病故'?'病故':'中止',endedAt:minute},'npc-life');
 }
 const obligations=Object.values(d.get('state','obligations')??{}).filter(o=>o.endedByDeath===deathId).map(o=>o.id).sort();
 const protocol=d.get('holdings','protocol','entities',id),estate={id:protocol?.successor,heir:null,heirs:[],coins:actor.coins??0,items:structuredClone(actor.inventory??{}),allocations:[],debts:[],guardianships:[]};
 const contracts=[],pets=[];
 const ledger=house?state.settlements?.[house.settlement]:null,population=Number.isSafeInteger(ledger?.population)?{before:ledger.population,after:Math.max(0,ledger.population-1)}:null;
 if(population)d.set(['state','settlements',house.settlement,'population'],population.after);
 const content=`${name}在${engine.calendar(minute).text.slice(0,-6)}${cause}。`;
 const witnesses=witness(d,engine,deathId,[id],house?[house.id]:[],{minute,kind:'health',content,salience:4,...(!npc?{at:[actor.location].filter(Boolean)}:{})});
 const result={id:deathId,person:id,...(life?{incarnation:life}:{}),minute,cause,illness:illness?.id??null,household:house?.id??null,settlement:house?.settlement??null,population,estate,obligations,witnesses,
  ...(contracts.length?{contracts}:{}),...(pets.length?{pets}:{})};
 holdingSet(d,null,['state','family','deaths',deathId],result,'npc-life');
 entityTransition(d,engine,{id:deathId,verb:'die',actor:id,minute,location:actor.location??house?.settlement,witnesses,cause,summary:content});
 return result;
}

function healthDay(d,engine,minute){
 // A repeated interval must not age someone retroactively after their arrival.
 // The daily health decision uses presence at the original midnight, once.
 const clock=['state','records','npc_life:health'];
 if((d.get(...clock)?.minute??-1)>=minute)return;
 const h=healthRules(engine);if(!h)return;
 const seed=d.get('randomSeed'),day=minute/DAY,ended=new Set();
 for(const illness of Object.values(d.get('state','family','illnesses')??{}).filter(r=>r.status==='患病中').sort((a,b)=>a.id.localeCompare(b.id))){
  if(illness.patient==='player')continue;
  const npc=d.get('state','npcs',illness.patient);
  if(!npc||isPhysicallyDead(engine,d,illness.patient)){release(d,illness);holdingSet(d,null,['state','family','illnesses',illness.id],{...d.get('state','family','illnesses',illness.id),status:'中止',endedAt:minute},'npc-life');continue;}
  if(minute>=illness.endsAt){recoverIllness(d,engine,illness,minute);ended.add(illness.patient);continue;}
  if(illness.severity!=='重'||npc.status!=='患病'||withPlayer(d.get('state'),illness.patient))continue;
  const carer=assignCare(d,engine,illness,minute);
  if(minute<=illness.since)continue;
  const odds=illness.fatality??h.graveFatality,fatality=carer?odds.cared:odds.alone,daily=1-pow(1-fatality,DAY/(illness.endsAt-illness.since));
  if(clockRoll(seed,`illness-death:${illness.id}`,day)<daily)recordEntityDeath(d,engine,illness.patient,minute,'病故',illness);
 }
 for(const id of Object.keys(d.get('state','npcs')).sort()){
  const state=d.peek?d.peek('state'):d.get('state'),npc=state.npcs[id];
  const along=withPlayer(state,id);
  if(!lifeActor(engine,state,id)||incapacitated(state,id)||!(settled(state,id)||along)||ended.has(id))continue;
  const aging=ageDay(d,engine,id,minute,['state','npcs',id]);
  const age=npcAgeAt(engine,state,id,minute),band=age===null?null:ageBand(h,age);if(!band)continue;
  if(clockRoll(seed,`natural-death:${id}`,day)<perDay(aging?.annualRisk??0)&&!along){recordEntityDeath(d,engine,id,minute,'寿终');continue;}
  if(clockRoll(seed,`illness:${id}`,day)<Math.min(1,band.illnessPerYear/360))fallIll(d,engine,id,minute,band);
 }
 for(const [id,actor] of Object.entries(d.get('state','creatures')??{})){
  if(isPhysicallyDead(engine,d,id)||!(actor.hp>0)||!Object.hasOwn(lifecycle(engine,d.get('state'),id),'lifespan'))continue;
  const aging=ageDay(d,engine,id,minute,['state','creatures',id]);
  if(aging&&clockRoll(seed,`natural-death:${id}`,day)<perDay(aging.annualRisk??0))recordEntityDeath(d,engine,id,minute,'寿终');
 }
 holdingSet(d,engine,clock,{category:'npc_life_clock',minute},'npc-life');
}

// ---- Moving house -----------------------------------------------------------
// A person moves only for a reason found in campaign state: to live with a new
// spouse, to join kin after the household was left empty by a death, to make a
// living elsewhere while the settlement goes hungry, or to get away from
// someone who harmed them and still lives there. A willing host household is
// required. The decision is taken at midnight and told first-hand; the walk
// starts at a fixed hour after the notice days and follows the real route; household, population, schedule and remaining
// appointments change on arrival. Coins and goods travel with the person, and
// no new person is created: the same campaign record simply lives elsewhere.
const migrationRules=engine=>rules(engine)?.migration;
const REASON_TEXT={成婚:'成婚后搬去与配偶同住',投亲:'家中已无人照应，去投靠亲属',谋生:'本地缺粮，去外乡亲友处谋生',避祸:'为避开加害自己的人，离乡暂避'};
const STRANGER_TEXT={谋生:'本地缺粮，去外乡肯收留人的人家谋生',避祸:'为避开加害自己的人，去外乡肯收留人的人家暂避'};
const reasonText=m=>m.with?`随${m.withName??'家人'}${m.reason==='谋生'?'外出谋生':'离乡'}`:(m.stranger?STRANGER_TEXT[m.reason]:null)??REASON_TEXT[m.reason];
function within(engine,location,place){
 const seen=new Set();
 while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}
 return false;
}
export function npcMigration(state,id){return Object.values(state.family?.migrations??{}).find(m=>m.person===id&&['待出发','在途'].includes(m.status))??null;}
const placeName=(engine,id)=>engine.byId.get(id)?.name??id;
// U3: a declared winter famine (hazard clock) counts as going hungry too.
const hungry=(engine,state,settlement,minute)=>(state.settlements?.[settlement]?.starvation??0)>=migrationRules(engine).livelihood.starvationDays||Boolean(famineAt(state,settlement,minute));
const present=(engine,state,x)=>state.npcs[x]?alive(state,x):Boolean(engine.byId.get(x));
// The daily migration pass hands in one shared record index (personConstraints)
// so each person's legal, employment and lease reads do not rescan the records.
function mobile(engine,state,id,constraints=null){
 if(personConstraint(engine,state,id,undefined,constraints))return false;
 if(state.npcs[id]?.levy)return false;
 const n=state.npcs[id];
 return lifeActor(engine,state,id)&&Boolean(npcSchedule(engine,state,id,undefined,constraints))&&settled(state,id)&&!incapacitated(state,id)&&!n.caring&&!npcMigration(state,id);
}
// With no relative or friend to take them, a household elsewhere may still
// take in someone fleeing hunger or harm: the settlement is not short of food
// and has stores for one more mouth, the house is not full, and an adult
// there bears the newcomer no grudge. Ties of any kind are not required.
function strangerHost(engine,state,id,from,minute){
 const s=migrationRules(engine).stranger;if(!s)return null;
 const rows=[];
 for(const house of engine.world.households??[]){
  if(house.settlement===from?.settlement||hungry(engine,state,house.settlement))continue;
  const ledger=state.settlements?.[house.settlement];
  if(!Number.isSafeInteger(ledger?.population)||!((ledger.food??0)>=(mealMouthsOf(engine,state,house.settlement,ledger.population)+metabolismFactor(engine,state,id,'satiety'))*s.foodDays))continue;
  const members=householdMembers(engine,state,house.id).filter(x=>present(engine,state,x));
  const coming=Object.values(state.family?.migrations??{}).filter(m=>m.to.household===house.id&&m.status!=='中止');
  if(members.length+coming.filter(m=>['待出发','在途'].includes(m.status)).length>=s.maxHousehold||coming.filter(m=>m.stranger&&!m.with).length>=s.perHousehold)continue;
  const host=members.filter(x=>lifeActor(engine,state,x)&&alive(state,x)&&!incapacitated(state,x)&&!npcIsMinor(engine,state,x,minute)&&!npcMigration(state,x)
   &&npcHousehold(engine,state,x)?.id===house.id&&relationView(engine,state,x,id).trust>=s.minimumTrust&&relationView(engine,state,x,id).affection>=s.minimumAffection).sort()[0];
  if(host)rows.push({host,house:npcHousehold(engine,state,host),related:false,stranger:true});
 }
 return rows.sort((a,b)=>key(id,a.house.id).localeCompare(key(id,b.house.id)))[0]??null;
}
// Relatives first, then friends who want the person; the host decides.
function hostFor(engine,state,id,{elsewhere,kinOnly=false},minute){
 const r=migrationRules(engine),from=npcHousehold(engine,state,id);
 const people=new Set([...(engine.byId.get(id)?.relationships??[]).map(x=>x.with),...Object.keys(state.npcs[id].relationships??{}),
  ...Object.keys(state.npcs).filter(x=>(engine.byId.get(x)?.relationships??[]).some(y=>y.with===id)),...Object.values(state.family?.people?.[id]?.parents??{})]);
 const rows=[];
 for(const host of [...people].sort()){
  if(host===id||!alive(state,host)||!lifeActor(engine,state,host)||npcIsMinor(engine,state,host,minute)||npcMigration(state,host))continue;
  const house=npcHousehold(engine,state,host);
  if(!house||house.id===from?.id||elsewhere&&(house.settlement===from?.settlement||hungry(engine,state,house.settlement)))continue;
  const related=kin(engine,state,id,host);
  if(kinOnly&&!related)continue;
  if(related?relationView(engine,state,host,id).trust<r.joinKin.minimumTrust:!(npcWilling(engine,state,host,id,r.host)&&npcWilling(engine,state,id,host,r.host)))continue;
  rows.push({host,house,related});
 }
 return rows.sort((a,b)=>b.related-a.related||a.host.localeCompare(b.host))[0]??null;
}
function migrationReason(engine,state,id,minute,seed){
 const r=migrationRules(engine),day=minute/DAY,house=npcHousehold(engine,state,id);if(!house)return null;
 for(const m of Object.values(state.family?.marriages??{}).filter(m=>m.status==='在婚'&&!m.static&&m.partners.includes(id)).sort((a,b)=>a.id.localeCompare(b.id))){
  if(minute-m.since<r.marriageMoveDays*DAY)continue;
  const spouse=m.partners.find(p=>p!==id),other=npcHousehold(engine,state,spouse);
  if(!other||other.id===house.id||!alive(state,spouse)||npcMigration(state,spouse))continue;
  // The partner whose household keeps more people is the one who moves.
  const keep=h=>h.members.filter(x=>![id,spouse].includes(x)&&present(engine,state,x)).length;
  const mover=keep(house)!==keep(other)?(keep(house)>keep(other)?id:spouse):[...m.partners].sort()[1];
  if(mover===id)return {reason:'成婚',host:spouse,house:other,cause:m.id};
 }
 const others=house.members.filter(x=>x!==id&&present(engine,state,x)),age=npcAgeAt(engine,state,id,minute);
 if(!others.length&&(npcIsMinor(engine,state,id,minute)||age!==null&&age>=r.joinKin.elderAge)){
  const death=Object.values(state.family?.deaths??{}).filter(x=>x.household===house.id&&x.person!==id).sort((a,b)=>b.minute-a.minute)[0];
  if(death&&minute-death.minute>=r.joinKin.afterDeathDays*DAY){const h=hostFor(engine,state,id,{elsewhere:false,kinOnly:true},minute);if(h)return {reason:'投亲',host:h.host,house:h.house,cause:death.id};}
 }
 if(npcIsMinor(engine,state,id,minute))return null;
 if(hungry(engine,state,house.settlement,minute)&&clockRoll(seed,`migration:livelihood:${id}`,day)<r.livelihood.chancePerDay){
  const h=hostFor(engine,state,id,{elsewhere:true},minute)??(clockRoll(seed,`migration:stranger:${id}`,day)<(r.stranger?.chancePerDay??0)?strangerHost(engine,state,id,house,minute):null);
  if(h)return {reason:'谋生',host:h.host,house:h.house,cause:`starvation:${house.settlement}`,stranger:Boolean(h.stranger)};
 }
 const harm=(state.npcs[id].memoryStream??[]).filter(m=>['conflict','crime'].includes(m.kind)&&m.sourceType==='亲历'&&m.participants?.[1]===id&&m.participants[0]!==id&&m.minute<=minute&&minute-m.minute<=r.refuge.withinDays*DAY).sort((a,b)=>b.minute-a.minute);
 for(const m of harm){
  const actor=m.participants[0],place=actor==='player'?(!isPhysicallyDead(engine,state,'player')?state.location:null):alive(state,actor)?state.npcs[actor].location??npcHousehold(engine,state,actor)?.homeLocation:null;
  const danger=state.records?.[`war-danger:${house.settlement}`],warThreat=danger&&danger.since<=minute&&minute<danger.until&&danger.actor===actor;
  if(!warThreat&&(!place||!within(engine,place,house.settlement)))continue;
  if(clockRoll(seed,`migration:refuge:${id}`,day)>=r.refuge.chancePerDay)break;
  const h=hostFor(engine,state,id,{elsewhere:true},minute)??(clockRoll(seed,`migration:stranger:${id}`,day)<(r.stranger?.chancePerDay??0)?strangerHost(engine,state,id,house,minute):null);
  if(h)return {reason:'避祸',host:h.host,house:h.house,cause:m.sourceEvent??m.id,fleeing:actor,stranger:Boolean(h.stranger)};
  break;
 }
 return null;
}
// A roster spouse and the mover's young children in the same household go
// with someone leaving for a living or for safety; a full adult spouse makes
// their own decision. Roster family enter campaign state for the move.
const CHILD_TYPES=new Set(['子女','女儿','儿子']);
function followers(engine,d,id,from,minute){
 const state=d.get('state'),spouses=new Set(marriagesOf(engine,state,id).flatMap(m=>m.partners));
 const childOf=x=>(engine.byId.get(id)?.relationships??[]).some(r=>r.with===x&&CHILD_TYPES.has(r.type))||Object.values(state.family?.people?.[x]?.parents??{}).includes(id);
 const out=[];
 for(const x of [...from.members].sort()){
  const minor=npcIsMinor(engine,state,x,minute);
  if(x===id||engine.byId.get(x)?.tier==='full'&&!minor)continue;
  if(!(spouses.has(x)&&!minor||minor&&childOf(x)))continue;
  if(!d.get('state','npcs',x)&&!bring(d,engine,x,minute,'随家人迁居'))continue;
  const now=d.get('state');if(!alive(now,x)||incapacitated(now,x)||now.npcs[x].caring||npcMigration(now,x)||!settled(now,x))continue;
  // A roster child already in state only for a school bell (or another
  // earlier event) now lives in state because the family is moving; school
  // at the new home is re-derived from the new household after arrival.
  const life=now.npcs[x].life;
  if(life?.kind==='roster'&&life.reason!=='随家人迁居')holdingSet(d,null,['state','npcs',x,'life'],{...life,since:minute,reason:'随家人迁居',earlier:[...life.earlier??[],{since:life.since,reason:life.reason}]},'npc-life');
  out.push(x);
 }
 return out;
}
function migrationDay(d,engine,minute){
 const r=migrationRules(engine);if(!r)return;
 // Migration plans are written under state.family, never records, so the
 // record index built once here stays exact for the whole pass.
 const constraints=personConstraints(engine,d.get('state'));
 for(const id of Object.keys(d.get('state','npcs')).sort()){
  const state=d.get('state');if(!mobile(engine,state,id,constraints))continue;
  const why=migrationReason(engine,state,id,minute,d.get('randomSeed'));if(!why)continue;
  const from=npcHousehold(engine,state,id,constraints),mid=`migration_${key(id,minute)}`;
  const row={id:mid,person:id,reason:why.reason,cause:why.cause,...(why.fleeing?{fleeing:why.fleeing}:{}),...(why.stranger?{stranger:true}:{}),host:why.host,
   from:{household:from.id,settlement:from.settlement,home:from.homeLocation},to:{household:why.house.id,settlement:why.house.settlement,home:why.house.homeLocation},
   decidedAt:minute,departAt:minute+r.noticeDays*DAY+r.departMinute,postponed:0,status:'待出发'};
  holdingSet(d,null,['state','family','migrations',mid],row,'npc-life');
  // The plan is the person's own knowledge first; neighbours learn it the
  // ordinary way, from them or their household, before the day they leave.
  const content=`${nameOf(engine,state,id)}${reasonText(row)}，打算${engine.calendar(row.departAt).text.slice(0,-6)}动身，迁往${placeName(engine,why.house.settlement)}${nameOf(engine,state,why.host)}家。`;
  witness(d,engine,`${mid}:plan`,[id],[from.id],{minute,kind:'migration',content});
  if(['谋生','避祸'].includes(why.reason))for(const f of followers(engine,d,id,from,minute)){
   const now=d.get('state');
   holdingSet(d,null,['state','family','migrations',`${mid}:${f}`],{...row,id:`${mid}:${f}`,person:f,with:id,withName:nameOf(engine,now,id)},'npc-life');
  }
 }
}
// Home slots go to the new home; work outside the new settlement is replaced
// by the host's work at that hour there (helping, no services of one's own),
// or by staying home.
function residenceSchedule(engine,state,m){
 const own=npcSchedule(engine,state,m.person),hostDay=npcSchedule(engine,state,m.host)?.default??[],host=nameOf(engine,state,m.host);
 let changed=false;
 const slot=s=>{
  if(s.location===m.from.home)return {...s,location:m.to.home};
  if(within(engine,s.location,m.to.settlement))return {...s};
  changed=true;const h=hostDay.find(x=>x.start<=s.start&&s.start<x.end);
  return h&&within(engine,h.location,m.to.settlement)&&h.location!==m.to.home?{...s,location:h.location,activity:`帮${host}：${h.activity}`,services:[]}:{...s,location:m.to.home,activity:'在新家帮衬家务',services:[]};
 };
 const variants=v=>Object.fromEntries(Object.entries(v).map(([k,x])=>[k,Array.isArray(x)&&k!=='restDays'?x.map(slot):structuredClone(x)]));
 const schedule={...variants(own),...(own.seasonal?{seasonal:Object.fromEntries(Object.entries(own.seasonal).map(([k,v])=>[k,variants(v)]))}:{})};
 const errors=validateNpcSchedules({locations:engine.world.locations,npcs:[{id:m.person,schedule}]});if(errors.length)throw Error(errors[0]);
 return {schedule,changed};
}
function endObligations(d,engine,id,test,reason,mid,minute){
 const ended=[];
 for(const o of Object.values(d.get('state','obligations')??{}).sort((a,b)=>a.id.localeCompare(b.id)))if(['待履行','进行中'].includes(o.status)&&[o.promisor,o.promisee].includes(id)&&test(o)){
  // Relocation does not forgive money or goods. Their normal performance
  // consumer retains the same deadline, cargo and eventual breach decision.
  if(['付款','送货'].includes(o.type))continue;
  d.set(['state','obligations',o.id],{...o,status:'取消',reason,resolvedAt:minute,endedByMigration:mid});ended.push(o.id);
 }
 return ended;
}
function postpone(d,engine,m,why){
 const next=m.postponed+1;
 holdingSet(d,null,['state','family','migrations',m.id],next>migrationRules(engine).maxPostponeDays?{...m,status:'中止',reason:why,endedAt:m.departAt}:{...m,departAt:m.departAt+DAY,postponed:next,lastDelay:why},'npc-life');
}
function depart(d,engine,m,at){
 const state=d.get('state'),npc=state.npcs[m.person],name=nameOf(engine,state,m.person);
 // Family going along set out with the person they follow.
 const lead=m.with?state.family.migrations[m.id.slice(0,m.id.lastIndexOf(':'))]:null;
 if(lead?.status==='中止'){holdingSet(d,null,['state','family','migrations',m.id],{...m,status:'中止',reason:'同行的家人没有动身',endedAt:at},'npc-life');return;}
 if(lead?.status==='待出发'){holdingSet(d,null,['state','family','migrations',m.id],{...m,departAt:lead.departAt,lastDelay:'等同行家人动身'},'npc-life');return;}
 if(!alive(state,m.person)){holdingSet(d,null,['state','family','migrations',m.id],{...m,status:'中止',reason:'本人已不在',endedAt:at},'npc-life');return;}
 if(!alive(state,m.host)||npcHousehold(engine,state,m.host)?.id!==m.to.household){holdingSet(d,null,['state','family','migrations',m.id],{...m,status:'中止',reason:'投奔的人家已不在原处',endedAt:at},'npc-life');return;}
 if(!settled(state,m.person)||incapacitated(state,m.person)||npc.caring||engine.npcAutonomyBusy?.(state,m.person,at)){postpone(d,engine,m,'动身时不得空');return;}
 let route;try{route=engine.route(npc.location,m.to.home,'walk',at,d.get('randomSeed'));}catch{postpone(d,engine,m,'路线暂不可通行');return;}
 if((npc.coins??0)<route.cost){postpone(d,engine,m,'路费不足');return;}
 const arriveAt=at+route.minutes,{schedule,changed}=residenceSchedule(engine,state,m);
 const early=endObligations(d,engine,m.person,o=>(o.start??o.due??0)<arriveAt,`${name}迁居途中，无法赴约`,m.id,at);
 const shops=businessSnapshot(engine,d.get('state'));
 holdingSet(d,null,['state','npcs',m.person,'residence'],{household:m.to.household,settlement:m.to.settlement,home:m.to.home,since:at,migration:m.id,schedule,workChanged:changed},'npc-life');
 moveCoins(d,{from:purse(null,m.person),to:sink('export','travel'),amount:route.cost,writer:'npc-life',eventId:m.id});holdingSet(d,null,['state','npcs',m.person,'coins'],(npc.coins??0)-route.cost,'npc-life');
 holdingSet(d,null,['state','npcs',m.person,'scheduleTravel'],{from:npc.location,to:m.to.home,depart:at,arrive:arriveAt,edges:route.edges,migration:m.id},'npc-life');
 holdingSet(d,null,['state','npcs',m.person,'location'],null,'npc-life');holdingSet(d,null,['state','npcs',m.person,'activity'],'迁居赶路','npc-life');
 const content=`${name}${reasonText(m)}，${engine.calendar(at).text.slice(0,-6)}从${placeName(engine,npc.location)}动身，迁往${placeName(engine,m.to.settlement)}${nameOf(engine,state,m.host)}家。`;
 const witnesses=witness(d,engine,`${m.id}:depart`,[m.person],[m.from.household],{minute:at,kind:'migration',content,at:[npc.location]});
 holdingSet(d,null,['state','family','migrations',m.id],{...m,status:'在途',departedAt:at,arriveAt,routeMinutes:route.minutes,routeCost:route.cost,routeEdges:route.edges,origin:npc.location,obligations:early,witnesses:{depart:witnesses}},'npc-life');
 entityTransition(d,engine,{id:`${m.id}:depart`,verb:'migrate',actor:m.person,minute:at,location:npc.location,witnesses,from:m.from,to:m.to,stage:'depart',summary:content});
 businessTransitions(d,engine,shops,`${m.id}:depart`,at);
}
function arrive(d,engine,m,at){
 const state=d.get('state'),npc=state.npcs[m.person];
 if(npc?.scheduleTravel?.migration===m.id){holdingSet(d,null,['state','npcs',m.person,'location'],m.to.home,'npc-life');d.remove(['state','npcs',m.person,'scheduleTravel']);}
 if(!alive(state,m.person)){holdingSet(d,null,['state','family','migrations',m.id],{...m,status:'中止',reason:'途中出事，未能抵达',endedAt:at},'npc-life');return;}
 const name=nameOf(engine,state,m.person);
 setMembership(d,engine,m.from.household,m.person,false);setMembership(d,engine,m.to.household,m.person,true);
 let population=null;
 const a=state.settlements?.[m.from.settlement]?.population,b=state.settlements?.[m.to.settlement]?.population;
 if(m.from.settlement!==m.to.settlement){
  population={};
  if(Number.isSafeInteger(a)){population.from={before:a,after:Math.max(0,a-1)};d.set(['state','settlements',m.from.settlement,'population'],population.from.after);}
  if(Number.isSafeInteger(b)){population.to={before:b,after:b+1};d.set(['state','settlements',m.to.settlement,'population'],population.to.after);}
 }
 const late=endObligations(d,engine,m.person,o=>!within(engine,o.location,m.to.settlement),`${name}已迁居${placeName(engine,m.to.settlement)}，原约定作罢`,m.id,at);
 holdingSet(d,null,['state','npcs',m.person,'residence','arrivedAt'],at,'npc-life');
 if(npc.residence?.workChanged)holdingSet(d,null,['state','npcs',m.person,'occupation'],`迁居后帮衬${nameOf(engine,state,m.host)}家（原${npc.occupation??engine.byId.get(m.person).occupation??''}）`,'npc-life');
 holdingSet(d,null,['state','npcs',m.person,'developments'],[...d.get('state','npcs',m.person,'developments')??[],{type:'迁居',source:m.id,minute:at,reason:m.reason,from:m.from.household,to:m.to.household}],'npc-life');
 const content=`${name}${engine.calendar(at).text.slice(0,-6)}迁到${placeName(engine,m.to.home)}，与${nameOf(engine,state,m.host)}家同住。`;
 const witnesses=witness(d,engine,`${m.id}:arrive`,[m.person],[m.to.household],{minute:at,kind:'migration',content,at:[m.to.home]});
 holdingSet(d,null,['state','family','migrations',m.id],{...d.get('state','family','migrations',m.id),status:'已抵达',arrivedAt:at,population,obligations:[...m.obligations??[],...late],witnesses:{...m.witnesses,arrive:witnesses}},'npc-life');
 entityTransition(d,engine,{id:`${m.id}:arrive`,verb:'migrate',actor:m.person,minute:at,location:m.to.home,witnesses,from:m.from,to:m.to,stage:'arrive',summary:content});
}
function migrationsDue(d,engine,before,after){
 for(;;){
  const rows=Object.values(d.get('state','family','migrations')??{}).map(m=>({m,at:m.status==='待出发'?m.departAt:m.status==='在途'?m.arriveAt:Infinity})).filter(x=>x.at>before&&x.at<=after).sort((x,y)=>x.at-y.at||x.m.id.localeCompare(y.m.id));
  if(!rows.length)return;
  const {m,at}=rows[0];if(m.status==='待出发')depart(d,engine,m,at);else arrive(d,engine,m,at);
 }
}
export function nextNpcLifeMinute(state,after){
 return Math.min(Infinity,...Object.values(state.family?.migrations??{}).map(m=>m.status==='待出发'?m.departAt:m.status==='在途'?m.arriveAt:Infinity).filter(t=>t>after));
}
// What a person can tell others about local life, newest first: only the
// family, health and moving news actually in their own memory.
export function npcLifeNews(engine,document,id){
 const state=document.state,npc=state.npcs[id],days=migrationRules(engine)?.newsDays??90;
 if(!npc||isPhysicallyDead(engine,state,id))return [];
 return (npc.memoryStream??[]).filter(m=>['family','health','migration'].includes(m.kind)&&m.minute<=state.minute&&state.minute-m.minute<=days*DAY&&!m.private&&!['private','secret'].includes(m.visibility)&&!npc.cognition?.blurred?.[m.id])
  .sort((a,b)=>b.minute-a.minute||a.id.localeCompare(b.id)).slice(0,3)
  .map(m=>({id:m.id,rootMemoryId:m.rootMemoryId??m.id,minute:m.occurredAt??m.minute,content:m.content,sourceType:m.sourceType,heardFrom:m.heardFrom??null}));
}

// ---- Everyday kindness -------------------------------------------------------
// Two people who already know each other and spent a long stretch of the day
// just ended at the same place, awake and working, come to like each other a
// little: once per period and only up to a modest level. Larger regard comes
// from help, gifts, nursing and shared festivals (npc-relations, recover()).
// Children do no such work and are left out.
const RESTING=/睡|歇息|休息|赶路|前往|返回|照护/;
const tied=(engine,state,a,b)=>staticTie(engine,a,b).length>0||Boolean(state.npcs[a]?.relationships?.[b]||state.npcs[b]?.relationships?.[a]);
function coworkDay(d,engine,minute){
 const k=rules(engine).kindness?.cowork;if(!k)return;
 const state=d.get('state'),period=Math.floor(minute/DAY/k.everyDays),start=minute-DAY,at=new Map(),constraints=personConstraints(engine,state);
 for(const id of Object.keys(state.npcs).sort()){
  const n=state.npcs[id];
  if(!lifeActor(engine,state,id)||incapacitated(state,id)||!settled(state,id)||n.caring||npcIsMinor(engine,state,id,minute))continue;
  try{
   for(let cursor=start;cursor<minute;){
    const slot=scheduleAt(engine,id,cursor,state,constraints);if(!slot)break;
    const end=Math.min(slot.until,minute);
    if(!RESTING.test(slot.activity??'')){const rows=at.get(slot.location)??[];rows.push({id,start:cursor,end});at.set(slot.location,rows);}
    cursor=end;
   }
  }catch{continue;}
 }
 for(const rows of [...at.values()]){
  const people=[...new Set(rows.map(r=>r.id))];
  for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
   const a=people[i],b=people[j];if(!tied(engine,state,a,b))continue;
   let together=0;
   for(const x of rows)if(x.id===a)for(const y of rows)if(y.id===b)together+=Math.max(0,Math.min(x.end,y.end)-Math.max(x.start,y.start));
   if(together<k.minutes)continue;
   // Routine regard is kept as a compact tally on the relation itself rather
   // than one ledger entry per period, so a long campaign does not swell.
   for(const [from,to] of [[a,b],[b,a]]){
    const view=relationView(engine,d.get('state'),from,to);
    if(view.affection>=k.cap||view.routine?.cowork>=period)continue;
    holdingSet(d,null,['state','npcs',from,'relationships',to],{...view,trust:Math.min(100,view.trust+k.trust),affection:Math.min(k.cap,view.affection+k.affection),
     routine:{...view.routine,cowork:period,coworkTimes:(view.routine?.coworkTimes??0)+1}},'npc-life');
   }
  }
 }
}

// ---- What others can see -----------------------------------------------------
// A person's marriage, children, illness, nursing, death and move as of a
// moment, from campaign records only. Anything after `asOf` shows only when
// `known(rootEventId)` says the viewer learned of it. Lines are short and
// plain, for the scene card and the people panel.
export function npcLifeLines(engine,state,id,{asOf=state.minute,known=()=>false,changedOnly=false}={}){
 const f=state.family??{},seen=(event,minute)=>Number.isFinite(minute)&&(minute<=asOf||known(event));
 const when=minute=>engine.calendar(minute).text.slice(0,-6),lines=[];let changed=false;
 const deathOf=x=>{const r=Object.values(f.deaths??{}).find(r=>r.person===x&&seen(r.id,r.minute))??null;if(r)changed=true;return r;};
 const own=deathOf(id);
 if(own)lines.push(`已于${when(own.minute)}${own.cause}`);
 const spouses=[];
 const ties=asOf===state.minute?personRelationships(engine,state,id).value:engine.byId.get(id)?.relationships??[];
 for(const r of ties)if(r.type==='配偶')spouses.push({id:r.with});
 for(const m of Object.values(f.marriages??{}).sort((a,b)=>(a.since??0)-(b.since??0)))if(!m.static&&m.partners.includes(id)&&seen(m.id,m.since)){spouses.push({id:m.partners.find(p=>p!==id),since:m.since});changed=true;}
 if(spouses.length)lines.push(`配偶：${[...new Map(spouses.map(x=>[x.id,x])).values()].map(x=>`${nameOf(engine,state,x.id)}${deathOf(x.id)?'（已故）':x.since!==undefined?`（${when(x.since)}成婚）`:''}`).join('、')}`);
 const children=new Map();
 for(const r of ties)if(CHILD_TYPES.has(r.type))children.set(r.with,null);
 for(const b of Object.values(f.births??{}))if([b.mother,b.father].includes(id)&&seen(b.id,b.minute)){children.set(b.child,b.minute);changed=true;}
 if(children.size)lines.push(`子女：${[...children].map(([c,born])=>{const age=personAge(engine,state,c,Math.max(asOf,born??0)).value;return `${nameOf(engine,state,c)}${deathOf(c)?'（已故）':born!==null&&age<1?`（${when(born)}出生）`:age!==null?`（${age}岁）`:''}`;}).join('、')}`);
 const pregnant=Object.values(f.pregnancies??{}).find(p=>p.mother===id&&p.status==='怀孕'&&p.conceivedAt<=asOf&&asOf-p.conceivedAt>=90*DAY);
 if(pregnant&&!own)lines.push('有孕在身');
 const during=r=>r.since<=asOf&&!(r.endedAt<=asOf);
 const ill=Object.values(f.illnesses??{}).find(r=>r.patient===id&&during(r));
 if(ill&&!own)lines.push(ill.diseaseName?`${when(ill.since)}起染上${ill.diseaseName}${ill.severity==='重'?'，病重卧床':'，在家歇着'}`:ill.severity==='重'?`${when(ill.since)}起病重卧床`:`${when(ill.since)}起染病在家歇着`);
 const caring=Object.values(f.illnesses??{}).find(r=>r.patient!==id&&r.caregivers?.includes(id)&&during(r));
 if(caring&&!own)lines.push(`在家照护${nameOf(engine,state,caring.patient)}`);
 for(const m of Object.values(f.migrations??{}).filter(m=>m.person===id).sort((a,b)=>a.decidedAt-b.decidedAt)){
  const to=`${placeName(engine,m.to.settlement)}${nameOf(engine,state,m.host)}家`;
  if(m.status==='已抵达'&&seen(`${m.id}:arrive`,m.arrivedAt))lines.push(`${when(m.arrivedAt)}自${placeName(engine,m.from.settlement)}迁到${to}（${m.reason}）`);
  else if(['在途','已抵达'].includes(m.status)&&seen(`${m.id}:depart`,m.departedAt))lines.push(`${when(m.departedAt)}动身迁往${to}（${m.reason}）`);
  else if(seen(`${m.id}:plan`,m.decidedAt)&&(m.status==='待出发'||m.decidedAt<=asOf&&!(m.endedAt<=asOf)))lines.push(m.status==='中止'&&m.endedAt<=asOf?`原打算迁往${to}，已作罢`:`打算迁往${to}（${m.reason}）`);
 }
 if(lines.length>(own?1:0)+(spouses.length?1:0)+(children.size?1:0))changed=true;
 return changedOnly&&!changed?[]:lines;
}

// Every midnight in (before, after] is processed once with the state of that
// boundary; the engine already stops at each midnight while time passes.
// Health comes first so a death that night already ends the marriage; moves
// due on the way are settled at their own minute, then new moves are decided.
export function advanceNpcLife(d,engine,before,after){
 if(!rules(engine))return;
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
  migrationsDue(d,engine,before,day*DAY);before=day*DAY;
  healthDay(d,engine,day*DAY);coworkDay(d,engine,day*DAY);familyDay(d,engine,day*DAY);migrationDay(d,engine,day*DAY);
  advanceGuardianships(d,engine,day*DAY);advanceFamilyAlliances(d,engine,day*DAY);
  // 饥饿之外的需求（钱、安全、地位）按灵智生成或了结目标。
  advanceNpcNeeds(d,engine,day*DAY);
 }
 migrationsDue(d,engine,before,after);
}

export function validateNpcLifeRules(world){
 const r=world.rules.npcLife,errors=[];if(!r)return errors;
 for(const row of [r,...world.npcs??[],...world.monsters??[]])if(row.lifecycle!==undefined){
  const l=row.lifecycle;
  if(!l||typeof l!=='object'||Array.isArray(l)||Object.hasOwn(l,'lifespan')&&l.lifespan!==null&&(!Number.isFinite(l.lifespan)||l.lifespan<=0)||l.agingCatchUp!==undefined&&(!Number.isFinite(l.agingCatchUp)||l.agingCatchUp<=0))errors.push('lifecycle 须声明正数寿命或 null，agingCatchUp 须为正年数');
 }
 const chance=v=>Number.isFinite(v)&&v>0&&v<=1,whole=v=>Number.isSafeInteger(v)&&v>0,level=v=>Number.isSafeInteger(v)&&v>=-100&&v<=100;
 if(!whole(r.adultAge)||r.adultAge<18)errors.push('npcLife.adultAge须为不小于18的整数');
 if(!Array.isArray(r.kinTypes)||!r.kinTypes.includes('配偶'))errors.push('npcLife.kinTypes须列出亲属关系类型');
 if(!level(r.courtship?.minimumTrust)||!level(r.courtship?.minimumAffection)||!whole(r.courtship?.days)||!chance(r.courtship?.marriageChancePerDay))errors.push('npcLife.courtship参数无效');
 if(!['trust','affection','romance'].every(k=>Number.isSafeInteger(r.marriageRelation?.[k])))errors.push('npcLife.marriageRelation参数无效');
 const b=r.birth;
 if(!level(b?.minimumTrust)||!level(b?.minimumAffection)||!chance(b?.conceptionChancePerDay)||!whole(b?.gestationDays)||!whole(b?.spacingDays))errors.push('npcLife.birth参数无效');
 if(!Array.isArray(b?.motherAge)||!(b.motherAge[0]>=r.adultAge&&b.motherAge[0]<b.motherAge[1]))errors.push('npcLife.birth.motherAge须为成年后的年龄区间');
 if(!b?.givenNames?.length||b.givenNames.some(n=>typeof n!=='string'||!n))errors.push('npcLife.birth.givenNames须为非空名字列表');
 const h=r.health,rate=v=>Number.isFinite(v)&&v>=0,share=v=>Number.isFinite(v)&&v>=0&&v<=1,span=v=>Array.isArray(v)&&whole(v[0])&&Number.isSafeInteger(v[1])&&v[0]<=v[1];
 if(h){
  if(!Array.isArray(h.bands)||!h.bands.length||h.bands[0].fromAge!==0||h.bands.some((x,i)=>!Number.isSafeInteger(x.fromAge)||i&&x.fromAge<=h.bands[i-1].fromAge||!rate(x.illnessPerYear)||x.illnessPerYear>360||!share(x.graveShare)||!share(x.suddenDeathPerYear)))errors.push('npcLife.health.bands须从0岁起按年龄递增，发病率、重病比例与猝亡率有效');
  if(!span(h.mildDays)||!span(h.graveDays))errors.push('npcLife.health病程天数区间无效');
  if(!share(h.graveFatality?.cared)||!share(h.graveFatality?.alone)||h.graveFatality.cared>h.graveFatality.alone)errors.push('npcLife.health.graveFatality须有照护时不高于无人照护');
  if(!(h.weakenedGraveMultiplier>=1)||!whole(h.bloodMl)||!Array.isArray(h.feverC)||h.feverC.length!==2||h.feverC.some(t=>!(t>37&&t<43)))errors.push('npcLife.health体弱倍数、血量或发热温度无效');
 }
 const g=r.migration;
 if(g){
  const days=v=>Number.isSafeInteger(v)&&v>=0;
  if(!(Number.isSafeInteger(g.departMinute)&&g.departMinute>0&&g.departMinute<DAY)||!days(g.noticeDays)||!days(g.marriageMoveDays)||!whole(g.maxPostponeDays)||!whole(g.newsDays))errors.push('npcLife.migration动身钟点、预告天数、婚后搬迁天数、推迟上限或消息天数无效');
  if(!days(g.joinKin?.afterDeathDays)||!(whole(g.joinKin?.elderAge)&&g.joinKin.elderAge>r.adultAge)||!level(g.joinKin?.minimumTrust))errors.push('npcLife.migration.joinKin参数无效');
  if(!whole(g.livelihood?.starvationDays)||!share(g.livelihood?.chancePerDay)||!whole(g.refuge?.withinDays)||!share(g.refuge?.chancePerDay))errors.push('npcLife.migration谋生或避祸参数无效');
  if(!level(g.host?.minimumTrust)||!level(g.host?.minimumAffection))errors.push('npcLife.migration.host参数无效');
  if(g.stranger&&(!whole(g.stranger.foodDays)||!whole(g.stranger.maxHousehold)||!whole(g.stranger.perHousehold)||!share(g.stranger.chancePerDay)||!level(g.stranger.minimumTrust)||!level(g.stranger.minimumAffection)))errors.push('npcLife.migration.stranger参数无效');
 }
 // Everyday kindness: small whole increments; routine co-work stops at a
 // modest cap so only real help, gifts and nursing carry regard further.
 const k=r.kindness,small=v=>v===undefined||Number.isSafeInteger(v)&&v>=0&&v<=10;
 if(k){
  if(['help','gift','festival','care'].some(x=>k[x]&&(typeof k[x]!=='object'||!Object.values(k[x]).every(small))))errors.push('npcLife.kindness各项增量须为0到10的整数');
  const c=k.cowork;
  if(c&&(!whole(c.minutes)||c.minutes>DAY||!whole(c.everyDays)||!small(c.trust)||!small(c.affection)||!level(c.cap)||c.cap>=r.courtship.minimumAffection+20))errors.push('npcLife.kindness.cowork参数无效');
 }
 return errors;
}
