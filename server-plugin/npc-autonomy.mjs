// NPC request execution belongs to the gameplay adapter, not shared routing ontology.
import {reject} from './action-rejection.mjs';
import {canAct} from './action-capacity.mjs';
import {MemoryIndex} from './retrieval.mjs';
import {saveDialogue} from './dialogue.mjs';
import {initializeFestivalProject} from './routing-programs.mjs';
// Retrieval's world readers can load this adapter before MemoryIndex is initialized.
// Tokenization is only needed for a live request, after the module graph has loaded.
let requestTokenizer;
import {preconditionFailure} from './precondition.mjs';
import {relationView} from './npc-relations.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {currentWorkstationRecipes,stationLicence} from './workstation-services.mjs';
import {purse,workshopFund,moveCoins,coinRead} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {craftInput,craftOutput,recordCraft,bagStock} from './stock.mjs';
// S1b: 人物自治制作是 src:craft 制造守恒对；交易经 items.transferItems 记行囊之间的转移。
declareLedgerWriter('npc-autonomy',{sources:{'src:craft':{'*':100000}},sinks:['sink:consume']});
import {facilityView,facilityRuntime} from './facility-state.mjs';
import {applyPatches,digest,withLegacyUndefinedActivity} from './storage.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {npcPresenceAt,shareNpcMemory} from './npc-cognition.mjs';
import {assertNpcObligationAction,npcObligationAt} from './npc-obligations.mjs';
import {changeItems,transferItems,heldUnit,wearItem,workmanshipTier,lostField,unitLacks} from './items.mjs';
import {resolveMaterials} from './item-class.mjs';
import {derivedStats} from './combat.mjs';
import {recordMarketDeal,assertMarketDepth} from './market.mjs';
import {advanceGovernance} from './governance.mjs';
import {advanceQuestBoard,nextQuestBoardMinute} from './quest-board.mjs';
import {prepareNpcFurnace,prepareThermalWorkstation} from './magic-object.mjs';
import {kilnWorkResult,craftStanding,craftOutcome,materialFloor,toolFactor,materialFloors,returnMaterials} from './manufacturing.mjs';
import {npcProficiency,npcWorkGrowth,switchVocation,npcVocationOptions} from './npc-growth.mjs';
import {intelligenceOf,goalsWithinHorizon,INTELLIGENCE_LEVELS} from './npc-intelligence.mjs';
import {personSimulation,personConstraint}from'./entity-view.mjs';
import {subjectiveView,subjectiveFact,conversationLanguage} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {autonomyCandidates,candidateAction,planFromCandidate,autonomyKind,autonomyRelevant} from './autonomy-candidates.mjs';
export {applyDialogue,dialogueRequest} from './dialogue.mjs';
export {npcDecision} from './npc-decision.mjs';
export {scheduleNpcAutonomy} from './autonomy-candidates.mjs';
import {declareHoldingWriter,holdingSet,holdingRemove} from './holdings.mjs';
import {submitContest,clockDiceKey} from './scheduler.mjs';
// 自治动作在工作草稿里演算后回放，回放可落到被演算动作写的任何持有种类。
declareHoldingWriter('npc-autonomy',{kinds:['*'],entities:['*'],locations:true});

const DAY=1440,clone=x=>structuredClone(x),safe=n=>Number.isSafeInteger(n)&&n>=0;
const awake=(engine,state,id,n)=>n?.location&&!n.scheduleTravel&&!n.cognitionTravel&&!isPhysicallyDead(engine,state,id)&&!['濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const full=(engine,id)=>personSimulation(engine,{},id).value;
const auditGoal=g=>/核清现有(?:铁料|线料)/.test(g.content);
function draft(document,at){const d={document,patches:[],get(...p){if(at!==undefined&&p.join('.')==='state.minute')return at;return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){const p={op:'set',path,value};this.document=applyPatches(this.document,[p]);this.patches.push(p);},remove(path){const p={op:'delete',path};this.document=applyPatches(this.document,[p]);this.patches.push(p);}};return d;}
// S2a: 工作草稿没有引擎，不双写；回放到正式草稿时经持有写入包装双写。
const commit=(target,work)=>{for(const p of work.patches)p.op==='set'?holdingSet(target,null,p.path,p.value,'npc-autonomy'):holdingRemove(target,null,p.path,'npc-autonomy');};
const proficiency=npcProficiency;
function duration(engine,action){if(action.kind==='craft')return engine.byId.get(action.recipe)?.minutes;if(action.kind==='audit_inventory')return 30;if(action.kind==='trade')return 5;return autonomyKind(action.kind)?.minutes(engine,action)??0;}
function tradeQuote(d,engine,buyer,action,location){
 // The installed native quote adapter owns environment and shop policy; NPC
 // execution supplies its actual task minute without crossing gameplay packs.
 const document={...d.document,state:{...d.get('state'),minute:d.get('state','minute')}};
 const quote=facilityRuntime().currentTradeQuote(engine,document,{buyer,seller:action.seller,item:action.item,quantity:action.quantity,location});
 return {...quote,price:quote.listPrice,cost:quote.totalCoins};
}
// A moving task is occupied through market_trip, which must keep advancing
// its body. Only stationary work freezes ordinary schedule settlement.
export function npcAutonomyBusy(state,id,minute=state.minute){return Object.values(state.npcAutonomy?.tasks??{}).find(t=>!t.itinerary&&t.status==='进行中'&&[t.npc,t.action.seller].includes(id)&&t.start<=minute&&minute<t.finish)??null;}
export function assertNpcAutonomyAction(state,actors,{start=state.minute,minutes=0}={}){
 for(const t of Object.values(state.npcAutonomy?.tasks??{}))if(t.status==='进行中'&&actors.some(id=>[t.npc,t.action.seller].includes(id))&&start<t.finish&&start+Math.max(1,minutes)>t.start)throw preconditionFailure('人物正在完成已经开始的自主工作');
}
function validateAction(d,engine,id,action,{at=d.get('state','minute'),presence=d.get('state'),ignoreTask=false,taskId}={}){
 const state=d.get('state'),actor=presence.npcs[id],base=engine.byId.get(id),minutes=Math.ceil(duration(engine,action)/(action.kind==='craft'?(facilityView(engine,state,actor?.location)?.factor||1):1));let furnace,work;
 if(!full(engine,id)||!awake(engine,presence,id,actor)||personConstraint(engine,state,id,at)||state.player.companions?.includes(id))throw preconditionFailure('人物不具备独立行动条件');
 if(isPhysicallyDead(engine,state,id)||['濒死','昏迷','患病'].includes(state.npcs[id]?.status))throw preconditionFailure('人物当前无法完成工作');
 // Moving procurement uses the shared market itinerary rather than a fixed
 // workplace window. The registered kind owns both route and service checks.
 if(autonomyKind(action.kind)?.itinerary){
  if(!safe(minutes)||minutes>480)throw preconditionFailure('行动耗时未登记或超过单日上限');
  const spent=state.npcs[id].autonomy?.minutesByDay?.[String(Math.floor(at/DAY))]??0;
  if(spent+minutes>Math.max(240,intelligenceOf(engine,state,id).dailyMinutes))throw preconditionFailure('每日自主工作时间已用尽');
  autonomyKind(action.kind).validate(d,engine,id,action,{at,presence,actor,ignoreTask,taskId});
  return {minutes,location:action.to};
 }
 if(ignoreTask)for(const who of [id,action.seller].filter(Boolean))if(!awake(engine,state,who,state.npcs[who])||personConstraint(engine,state,who,at)||state.npcs[who].location!==presence.npcs[who]?.location)throw preconditionFailure('工作完成时人物已离开或不能继续行动');
 if(!safe(minutes)||minutes>480)throw preconditionFailure('行动耗时未登记或超过单日上限');
 if(!ignoreTask)assertNpcAutonomyAction(state,[id,action.seller].filter(Boolean),{start:at,minutes});
 assertNpcObligationAction(d,engine,[id,action.seller].filter(Boolean),{start:at,minutes,location:actor.location,kind:'autonomy'});
 const day=String(Math.floor(at/DAY)),spent=state.npcs[id].autonomy?.minutesByDay?.[day]??0,mind=intelligenceOf(engine,state,id);
 if(spent+minutes>Math.max(240,mind.dailyMinutes))throw preconditionFailure('每日自主工作时间已用尽');
 // 觉悟以上的人会在不安排生产的清醒时段另起炉灶；睡眠与赶路仍不可占用。
 for(let cursor=at;cursor<at+minutes;){const slot=scheduleAt(engine,id,cursor,state);if(!slot||slot.production===false&&!mind.offSchedule||slot.location!==actor.location||/睡眠|睡觉|熟睡|赶路|前往|返回/.test(slot.activity))throw preconditionFailure('实际作息没有完整工作窗口');cursor=slot.until;}
 if(action.kind==='audit_inventory'){
  const goals=state.npcs[id].goals??base.goals,goal=Object.values(goals).flat().find(g=>g.id===action.goal);
  if(!goal||!auditGoal(goal)||goal.progress>=100)throw preconditionFailure('这项目标不能通过盘点本人库存直接完成');
 }else if(action.kind==='craft'){
  const recipe=engine.world.recipes.find(r=>r.id===action.recipe);if(!recipe)throw preconditionFailure('配方未登记');
  // 卡 Q：技能不足、没学过配方都不拒绝，照做落低档（npcCraft 经 manufacturing.craftOutcome，与玩家同一条）。
  if(recipe.location&&recipe.location!==actor.location)throw preconditionFailure('不在配方地点');
  // 材料按类别落到本人实际持有的同类物品（与玩家制作同一条 resolveMaterials）。
  const totals=new Map();for(const m of resolveMaterials(d,engine,id,recipe.materials))totals.set(m.item,(totals.get(m.item)??0)+m.amount);
  for(const [item,amount] of totals)if(engine.quantity(d,id,item)<amount)throw preconditionFailure('实际制造材料不足');
  for(const item of recipe.tools??[]){if(recipe.materials.some(m=>m.item===item))throw preconditionFailure('工具不能同时消耗');if(engine.quantity(d,id,item)<1||(heldUnit(d,engine,id,item)?.durability??engine.byId.get(item)?.durability??0)<=0)throw preconditionFailure('没有完好的实际工具');}
  // A working person's own choice: they use a station they hold, rent, were
  // lent or may pay for, and do not take over someone else's.
  const station=facilityView(engine,state,actor.location)?.workstations.find(s=>s.kind===recipe.workstation),licence=station&&stationLicence(engine,d,station,id);
  if(recipe.workstation&&(!station||!licence))throw preconditionFailure('没有可用且获准的工作台');
  const fee=licence?.basis==='paid'?station.fee??0:0;if(!safe(fee)||state.npcs[id].coins<fee)throw preconditionFailure('工坊费用不足');
  if(fee&&station.owner?.startsWith('npc_')&&(!state.npcs[station.owner]||isPhysicallyDead(engine,state,station.owner)||state.npcs[station.owner].status==='濒死'))throw preconditionFailure('工坊收费人无法履约');
  npcToolBonus(d,engine,id,recipe);
  if(station?.thermalRequirement&&!ignoreTask){
   work=draft(d.document,at);work.set(['state','npcs',id,'location'],actor.location);
   const reserved=new Map(totals);for(const item of recipe.tools??[])reserved.set(item,1);
   furnace=prepareNpcFurnace(work,engine,station,minutes,id,reserved);
   // Presence is a forecast for daily actions; never commit it over the real actor.
   work.patches=work.patches.filter(p=>p.path.join('.')!==`state.npcs.${id}.location`);
  }
 }else if(action.kind==='trade'){
  const seller=presence.npcs[action.seller],sellerBase=engine.byId.get(action.seller),item=engine.byId.get(action.item);
  if(action.seller===id||!awake(engine,presence,action.seller,seller)||personConstraint(engine,state,action.seller,at)||seller.location!==actor.location||!sellerBase?.serviceCatalog?.some(s=>s.kind==='trade'&&s.price.mode==='engineQuote'))throw preconditionFailure('没有同地且愿意出售现有库存的卖家');
  if(!safe(action.quantity)||action.quantity<1||action.quantity>20||!item?.id.startsWith('item_'))throw preconditionFailure('交易品种或数量未登记');
  if(bagStock(d,engine,{point:'npc.stock',id:action.seller,item:action.item,legacy:()=>engine.quantity(d,action.seller,action.item)})<action.quantity||coinRead(d,{point:'npc.cash',account:purse(engine,id),legacy:()=>state.npcs[id].coins})<tradeQuote(d,engine,id,action,actor.location).cost)throw preconditionFailure('真实钱款或库存不足');
  for(let cursor=at;cursor<at+minutes;){const s=scheduleAt(engine,action.seller,cursor,state);if(!s||s.location!==actor.location||!s.services.includes('trade'))throw preconditionFailure('交易没有完整接待窗口');cursor=s.until;}
 }else if(autonomyKind(action.kind))autonomyKind(action.kind).validate(d,engine,id,action,{at,presence,actor});
 else throw preconditionFailure('自主行动类型未实现');
 return {minutes,location:actor.location,furnace,work};
}
// R25: a person whose state has no current activity yet (e.g. a fresh save before the first
// schedule step) has no activity key; never write activity:undefined into the save.
function presenceOf(n){return {location:n.location,...(n.activity===undefined?{}:{activity:n.activity}),status:n.status??'正常'};}
function startTask(d,task,checked,engine){
 if(autonomyKind(task.action.kind)?.itinerary)task.itinerary=true;
 autonomyKind(task.action.kind)?.start?.(d,engine,task.npc,task.action,{actionId:task.id});
 if(checked.furnace){commit(d,checked.work);task.furnace={...checked.furnace,checkedUntil:task.start};}
 d.set(['state','npcAutonomy','tasks',task.id],task);
}
export function catchUpFurnaces(d,engine,after){
 for(const task of Object.values(d.get('state','npcAutonomy','tasks')??{}))if(task.status==='进行中'&&task.furnace){
  try{advanceFurnace(d,engine,task,Math.min(after,task.finish));}
  catch(error){d.set(['state','npcAutonomy','tasks',task.id,'status'],'失败');d.set(['state','npcAutonomy','tasks',task.id,'reason'],error.message);}
 }
}
function advanceFurnace(d,engine,task,until){
 const actor=d.get('state','npcs',task.npc),location=task.presence.npcs[task.npc].location;
 if(!awake(engine,d.get('state'),task.npc,actor)||personConstraint(engine,d.get('state'),task.npc,until)||actor.location!==location||d.get('state','player','companions')?.includes(task.npc))throw preconditionFailure('照管炉火的人物已离岗或失能');
 const recipe=engine.byId.get(task.action.recipe),station=facilityView(engine,d.get('state'),location)?.workstations.find(s=>s.kind===recipe.workstation);
 if(!station||!stationLicence(engine,d,station,task.npc))throw preconditionFailure('炉火工坊已不可用');
 const work=draft(d.document,task.furnace.checkedUntil);
 const row=engine.byId.get(location)?.features?.find(f=>f.id===task.furnace.plan.feature);
 if(!row||row.owner!==task.npc&&row.access!=='public')throw preconditionFailure('人物没有热源的使用权限');
 if(until>task.furnace.checkedUntil){
  const projection=prepareThermalWorkstation(work,engine,station,until-task.furnace.checkedUntil,{location});
  if(projection.projectedStress!==undefined)d.set(['state','npcAutonomy','tasks',task.id,'furnace','endStress'],projection.projectedStress);
  d.set(['state','npcAutonomy','tasks',task.id,'furnace','checkedUntil'],until);
 }
}
function npcToolBonus(d,engine,id,recipe){
 const attribute=recipe.attribute??engine.byId.get(recipe.skill)?.attribute??'智力';let sum=0;
 for(const item of recipe.tools??[]){const definition=engine.byId.get(item),held=heldUnit(d,engine,id,item),grade=engine.rules.equipment.qualities.indexOf(held?.quality??definition.quality);
  if(grade<0||(d.get('state','npcs',id,'level')??engine.byId.get(id).level??1)<engine.rules.equipment.requiredLevels[grade])throw preconditionFailure('人物等级不足以使用工具');
  const spec=definition.checkBonus;if(spec&&!unitLacks(engine,{item,...held},'checkBonus')&&(!spec.attributes?.length||spec.attributes.includes(attribute))&&(!spec.skills?.length||spec.skills.includes(recipe.skill)))sum+=spec.bonus;
 }return Math.min(engine.rules.check.maximumToolBonus??5,sum);
}
function produce(d,engine,id,item,quantity,actionId,recipe,at,workmanship,grade,inputs=null){
 const definition=engine.byId.get(item),instances=[];
 for(let i=0;i<quantity;i++){const unit=`unit_${digest([d.document.randomSeed,actionId,item,i]).slice(0,24)}`;if(d.get('state','itemInstances',unit))throw Error('重复制造单件');instances.push(unit);
  const factor=workmanshipTier(engine,workmanship).multiplier,maxDurability=Math.max(1,Math.round(definition.durability*factor*(grade??1)));
  holdingSet(d,null,['state','itemInstances',unit],{id:unit,item,owner:id,status:'持有',maker:id,makerName:engine.byId.get(id).name,recipe,source:actionId,minute:at,quality:definition.quality,durability:maxDurability,maxDurability,workmanship,...(grade===undefined||grade===null?{}:{grade}),...lostField(engine,item,workmanship,inputs)},'npc-autonomy');
 }
 changeItems(d,engine,id,item,quantity,{books:craftOutput('npc-autonomy',actionId)});d.set(['state','npcs',id,'inventory',item,'instances'],[...d.get('state','npcs',id,'inventory',item,'instances')??[],...instances]);return instances;
}
// One real batch of an NPC's craft at `location`: roll, station fee, furnace,
// tool wear, products, ledger.crafts and skill growth. The caller has checked
// the recipe, materials and station (validateAction) and keeps its own action
// record and memories.
// 人物是否学过这个配方：配方不需学、本人是传授者、学过，或所在工位的现行做法里有它。
const knowsRecipe=(engine,state,id,r)=>!r.learningRequired||Boolean(r.teachers?.includes(id)||state.npcs?.[id]?.recipes?.[r.id]||currentWorkstationRecipes(engine,state,id).some(p=>p.id===r.id));
export function npcCraft(d,engine,id,recipeId,{start,at,actionId,location,furnace,minutes}){
 const base=engine.byId.get(id),spent={minutes};let outcome,summary,produced=[];
 minutes??=Math.ceil(engine.byId.get(recipeId).minutes/(facilityView(engine,d.get('state'),location)?.factor||1));spent.minutes=minutes;
  const r=engine.byId.get(recipeId),skill=proficiency(engine,d.get('state'),id,r.skill),die=parseInt(digest([d.document.randomSeed,actionId,'npc-craft']).slice(0,8),16)%20+1;
  const attribute=r.attribute??engine.byId.get(r.skill)?.attribute??'智力',score=d.get('state','npcs',id,'attributes',attribute)??base.attributes?.[attribute]??10;
  const modifier=Math.floor((score-10)/2)+Math.floor(skill/(engine.rules.check.skillDivisor??150))+npcToolBonus(d,engine,id,r),total=die+modifier;
  const degree=die===1||total<=r.difficulty-10?'大失败':die===20||total>=r.difficulty+10?'大成功':total<r.difficulty?'失败':total<r.difficulty+5?'勉强成功':'成功';
  outcome={die,modifier,total,degree,difficulty:r.difficulty,success:['勉强成功','成功','大成功'].includes(degree)};
  const thermal=kilnWorkResult(d,furnace?.plan,outcome,r.output.quantity,actionId,{endStress:furnace?.endStress});if(thermal)outcome.thermal=thermal;
  const station=facilityView(engine,d.get('state'),location)?.workstations.find(s=>s.kind===r.workstation),fee=station&&stationLicence(engine,d,station,id)?.basis==='paid'?station.fee??0:0;
  if(fee){moveCoins(d,{from:purse(null,id),to:station.owner?.startsWith('npc_')?purse(null,station.owner):workshopFund(station.id),amount:fee,writer:'npc-autonomy',eventId:actionId});d.set(['state','npcs',id,'coins'],d.get('state','npcs',id,'coins')-fee);if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+fee);else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+fee);}
  const materials=resolveMaterials(d,engine,id,r.materials).map(({item,amount})=>({item,amount}));
  // 卡 Q：品质链输入（扣料、磨损前读）与技能状况，和玩家制作同一组函数。
  const raw=d.get('state','npcs',id,'skills',r.skill)??base.skills?.[r.skill]??base.proficiencies?.[r.skill],standing=craftStanding(raw!==undefined&&raw!==null,skill,r.minimumProficiency,knowsRecipe(engine,d.get('state'),id,r));
  const floor=materialFloor(d,engine,id,materials.map(m=>[m.item,m.amount])),floors=materialFloors(d,engine,id,materials.map(m=>[m.item,m.amount])),toolsFactor=toolFactor(d,engine,id,r.tools),stationFactor=r.workstation?facilityView(engine,d.get('state'),location)?.factor??1:1;
  spent.fee=fee;spent.materials=clone(materials);if(furnace)spent.fuel=clone(furnace.fuel);
  for(const m of materials)changeItems(d,engine,id,m.item,-m.amount,{books:craftInput('npc-autonomy',actionId)});
  const crafted={recipe:r.id,batches:1,inputs:materials.reduce((o,m)=>({...o,[m.item]:(o[m.item]??0)+m.amount}),{}),outputs:{},writer:'npc-autonomy',eventId:actionId};
  for(const item of r.tools??[]){changeItems(d,engine,id,item,0);wearItem(d,engine,id,item,r.toolWear??1);}
  const result=craftOutcome(engine,{standing,degree,success:outcome.success,proficiency:skill,floor,tools:toolsFactor,station:stationFactor,recoverFraction:r.failure?.recoverFraction??0,seed:d.document.randomSeed,key:actionId});
  if(standing!=='skilled')outcome.standing=standing;if(result.failure)outcome.failure=result.failure;if(result.grade!==undefined)outcome.grade=result.grade;
  if(outcome.success||result.failure==='partial'){outcome.workmanship=result.tier;produced=outcome.success?[{item:r.output.item,amount:r.output.quantity-(thermal?.crackedQuantity??0)},...r.byproducts??[]]:[{item:r.output.item,amount:r.output.quantity}];for(const p of produced){produce(d,engine,id,p.item,p.amount,actionId,r.id,at,outcome.workmanship,result.grade,materials.map(m=>m.item));crafted.outputs[p.item]=(crafted.outputs[p.item]??0)+p.amount;}}
  else{const back=returnMaterials(d,engine,id,materials.map(m=>[m.item,m.amount]),result,{floors,eventId:actionId,cracked:Boolean(thermal?.crackedQuantity),give:(item,n)=>changeItems(d,engine,id,item,n,{books:craftOutput('npc-autonomy',actionId)})});
   // spent.materials is what the batch took in; a failed batch gives part back (spent.returned), so the net draw on the bag is materials - returned.
   for(const m of back)crafted.outputs[m.item]=(crafted.outputs[m.item]??0)+m.amount;
   if(back.length)spent.returned=back.map(m=>({item:m.item,amount:m.amount}));
   if((die===1||die+modifier<=r.difficulty-10)&&r.failure?.injury){const max=d.get('state','npcs',id,'maxHp')??derivedStats({level:base.level??1,attributes:base.attributes,profession:Boolean(base.combatProfession)},engine.rules).maxHp;const hp=Math.max(0,(d.get('state','npcs',id,'hp')??max)-r.failure.injury);d.set(['state','npcs',id,'maxHp'],max);d.set(['state','npcs',id,'hp'],hp);if(!hp)d.set(['state','npcs',id,'status'],'濒死');}
  }
  if(!outcome.success)crafted.failure=result.failure??'ruin';
  recordCraft(d,crafted);
  const gained=npcWorkGrowth(d,engine,id,r.skill,outcome.success,start);if(gained)outcome.growth={skill:r.skill,gained};
  summary=`尝试${r.name}，耗时${minutes}分钟，${outcome.success?`制成${engine.byId.get(r.output.item).name}${produced[0].amount}份`:produced.length?`失败，只做出${produced[0].amount}份${outcome.workmanship}的${engine.byId.get(r.output.item).name}（部分用途不具备）`:'没有得到成品'}，工坊费${fee}铜${gained?`，手艺熟练度提高${gained}`:''}。`;
 return {outcome,spent,produced,summary};
}
function executeAction(target,engine,id,action,{at,presence,actionId,start,ignoreTask=false,furnace}){
 const d=draft(target.document,at),checked=validateAction(d,engine,id,action,{at:start,presence,ignoreTask,taskId:actionId}),base=engine.byId.get(id),minutes=checked.minutes;
 let outcome={success:true},summary,spent={minutes},produced=[];
 if(action.kind==='audit_inventory'){
  const inventory=Object.fromEntries(Object.keys(d.get('state','npcs',id,'inventory')??{}).sort().map(item=>[item,engine.quantity(d,id,item)]));
  const goals=clone(d.get('state','npcs',id,'goals')??base.goals),goal=Object.values(goals).flat().find(g=>g.id===action.goal);
  goal.progress=100;goal.status='已完成';goal.completedAt=at;goal.evidence=actionId;goal.steps=goal.steps.map(s=>({...s,status:'已完成',evidence:actionId}));
  d.set(['state','npcs',id,'goals'],goals);d.set(['state','npcs',id,'autonomy','inventoryAudit'],{minute:at,inventory,sourceEvent:actionId});summary=`盘点了本人现有库存，完成“${goal.content}”。`;
 }else if(action.kind==='trade'){
  const quote=tradeQuote(d,engine,id,action,checked.location),{cost}=quote;
  assertMarketDepth(d,engine,quote,{agreed:quote.agreed});transferItems(d,engine,action.seller,id,action.item,action.quantity);
  moveCoins(d,{from:purse(null,id),to:purse(null,action.seller),amount:cost,writer:'npc-autonomy',eventId:actionId});d.set(['state','npcs',id,'coins'],d.get('state','npcs',id,'coins')-cost);d.set(['state','npcs',action.seller,'coins'],d.get('state','npcs',action.seller,'coins')+cost);spent.coins=cost;
  recordMarketDeal(d,quote,cost,action.quantity,actionId);
  summary=`向${engine.byId.get(action.seller).name}支付${cost}铜，购得${engine.byId.get(action.item).name}${action.quantity}份。`;
 }else if(autonomyKind(action.kind)){
  const done=autonomyKind(action.kind).execute(d,engine,id,action,{at,start,actionId,location:checked.location});
  summary=done.summary;Object.assign(spent,done.spent);
 }else{
  ({outcome,spent,produced,summary}=npcCraft(d,engine,id,action.recipe,{start,at,actionId,location:checked.location,furnace,minutes}));
 }
 const day=String(Math.floor(start/DAY)),autonomy=d.get('state','npcs',id,'autonomy')??{};
 d.set(['state','npcs',id,'autonomy','minutesByDay',day],(autonomy.minutesByDay?.[day]??0)+minutes);
 const record={id:actionId,npc:id,kind:action.kind,action:clone(action),start,minute:at,location:checked.location,summary,outcome,spent,produced};
 d.set(['state','npcAutonomy','actions',actionId],record);
 const counterparty=action.seller??action.supplier,participants=counterparty?[id,counterparty]:[id];
 for(const whom of participants)d.set(['state','npcs',whom,'memoryStream'],[...d.get('state','npcs',whom,'memoryStream')??[],{id:actionId,sourceEvent:actionId,kind:action.kind==='trade'||action.kind==='procure_inputs'?'trade':'autonomy',minute:at,location:checked.location,participants,content:`${base.name}${summary}`,sourceType:'亲历',salience:3,emotion:outcome.success?'踏实':'失望'}]);
 d.set(['state','npcs',id,'developments'],[...d.get('state','npcs',id,'developments')??[],{type:'自主行动',source:actionId,minute:at,content:summary}]);commit(target,d);return record;
}

export function advanceNpcAutonomy(d,engine,before,after,eventId,{beforeState}={}){
 const results=[...advanceGovernance(d,engine,before,after,{beforeState}),...advanceQuestBoard(d,engine,before,after,{beforeState})];
 const settle=()=>{for(const task of Object.values(d.get('state','npcAutonomy','tasks')??{}).sort((a,b)=>a.finish-b.finish||a.id.localeCompare(b.id))){
  if(task.status!=='进行中')continue;
  try{if(task.furnace)advanceFurnace(d,engine,task,Math.min(after,task.finish));if(task.finish>after)continue;
   const execute=()=>{const row=executeAction(d,engine,task.npc,task.action,{at:task.finish,start:task.start,presence:task.presence,actionId:task.id,ignoreTask:true,furnace:d.get('state','npcAutonomy','tasks',task.id,'furnace')});d.set(['state','npcAutonomy','tasks',task.id,'status'],row.outcome.success?'已完成':'失败');
    const plan=d.get('state','npcs',task.npc,'plan');
    if(task.candidate&&plan?.candidate===task.candidate&&row.outcome.success){
     const steps=clone(plan.steps),index=steps.findIndex(s=>!s.done);if(index>=0)steps[index].done=true;
     const complete=steps.every(s=>s.done);d.set(['state','npcs',task.npc,'plan'],{...plan,steps,...(complete?{status:'completed'}:{})});
     if(complete&&d.get('state','autonomyCandidates',task.candidate))d.remove(['state','autonomyCandidates',task.candidate]);
    }
    results.push(row);};
   const contest=autonomyKind(task.action.kind)?.contest;
   if(d.scheduler&&contest){
    if(!d.contestPool.some(p=>p.id===task.id)){
     validateAction(d,engine,task.npc,task.action,{at:task.start,presence:task.presence,ignoreTask:true,taskId:task.id});
     submitContest(d,{id:task.id,...contest(d,engine,task.npc,task.action),ruleId:'npc_autonomy:trade',objectId:task.npc,execute,reject:reason=>{
      d.set(['state','npcAutonomy','tasks',task.id,'status'],'失败');d.set(['state','npcAutonomy','tasks',task.id,'reason'],reason);
      if(d.get('state','npcs',task.npc,'plan','candidate')===task.candidate)d.set(['state','npcs',task.npc,'plan'],null);
     }});
    }
   }else if(d.scheduler&&task.action.kind==='trade'){
    if(!d.contestPool.some(p=>p.id===task.id)){
     validateAction(d,engine,task.npc,task.action,{at:task.start,presence:task.presence,ignoreTask:true});
     const {price}=tradeQuote(d,engine,task.npc,task.action,d.get('state','npcs',task.npc,'location'));
     submitContest(d,{id:task.id,target:`goods:${task.action.seller}:${task.action.item}`,targetKind:'goods',ruleId:'npc_autonomy:trade',objectId:task.npc,bid:price,quantity:task.action.quantity,capacity:engine.quantity(d,task.action.seller,task.action.item),execute,reject:reason=>{d.set(['state','npcAutonomy','tasks',task.id,'status'],'失败');d.set(['state','npcAutonomy','tasks',task.id,'reason'],reason);}});
    }
   }else execute();}
  catch(error){d.set(['state','npcAutonomy','tasks',task.id,'status'],'失败');d.set(['state','npcAutonomy','tasks',task.id,'reason'],error.message);
   if(task.candidate&&d.get('state','npcs',task.npc,'plan','candidate')===task.candidate)d.set(['state','npcs',task.npc,'plan'],null);
  }
 }};settle();
 if(!beforeState)return results;
 for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
  const start=day*DAY+600;if(start<before||start>after)continue;
  const presence=start===after?d.get('state'):npcPresenceAt(engine,beforeState,before,start,d.document.randomSeed);
  const objectKey=id=>clockDiceKey(d.document.randomSeed,'npc_autonomy:daily',id,start);
  for(const id of Object.keys(presence.npcs).sort((a,b)=>d.scheduler?objectKey(a).localeCompare(objectKey(b)):a.localeCompare(b))){
   const actor=presence.npcs[id],base=engine.byId.get(id),actionId=`npc_daily_${day}_${id}`;
   if(!full(engine,id)||!awake(engine,beforeState,id,actor)||actor.location===beforeState.location||beforeState.player.companions?.includes(id)||npcObligationAt(beforeState,id,start)||npcAutonomyBusy(beforeState,id,start))continue;
   if(d.get('state','npcAutonomy','tasks',actionId))continue;
   const goal=Object.values(d.get('state','npcs',id,'goals')??base.goals??{}).flat().find(g=>auditGoal(g)&&g.progress<100);
   const reach=Math.max(30,intelligenceOf(engine,d.get('state'),id).recipeMinutes);
   const recipes=engine.world.recipes.filter(r=>(r.teachers?.includes(id)||d.get('state','npcs',id,'recipes',r.id))&&r.minutes<=reach).sort((a,b)=>a.id.localeCompare(b.id));
   const choices=goal?[{kind:'audit_inventory',goal:goal.id}]:recipes.map(r=>({kind:'craft',recipe:r.id}));
   const queued=Object.values(d.get('state','autonomyCandidates')??{}).filter(c=>c.npc===id);
   const currentPlan=d.get('state','npcs',id,'plan');
   // An empty candidate set cannot decide or abandon a plan. Avoid building
   // the full subjective projection for every resident with nothing to do.
   let projected;
   const projectDocument=()=>projected??=({...d.document,state:{...d.get('state'),minute:start,npcs:{...d.get('state','npcs'),[id]:{...d.get('state','npcs',id),...presenceOf(actor)}}}});
   if(!choices.length&&!queued.length&&!currentPlan&&!(engine.world.autonomy?.candidates?.length)&&!(engine.rules.npcAutonomy?.candidates?.length)&&!autonomyRelevant(engine,d.get('state'),id,actor,projectDocument))continue;
   projectDocument();
   const view=subjectiveView(engine,projected,id);
   const procurement=facilityRuntime().inputProcurement?.(engine,projected,view,choices);
   for(const row of procurement?.constraints??[]){
    const key=`input_constraint:${id}:${row.purpose}`;
    d.set(['state','records',key],{category:'input_constraint',npc:id,minute:start,...row});
   }
   let candidates=autonomyCandidates(engine,view,{document:projected,scheduled:queued,fallback:[...choices.map((legacy,i)=>({id:`core:routine:${i}`,legacy,kind:legacy.kind,utility:-i})),...(procurement?.candidates??[])]});
   candidates=facilityRuntime().continueInputPlan?.(view,candidates)??candidates;
   if(currentPlan&&currentPlan.status!=='completed'&&!candidates.some(c=>c.id===currentPlan.candidate)){
    d.set(['state','npcs',id,'plan'],null);d.set(['state','records',`plan_abandoned:${actionId}`],{category:'plan_abandoned',npc:id,minute:start,reason:'原先的主观前提或收益已不成立',basis:currentPlan.basis});
   }
   for(const candidate of candidates){let action;try{
    let selected=candidate,planToStart=null;
    if((candidate.horizon??1)>1){
     let plan=d.get('state','npcs',id,'plan');
     if(!plan||plan.status==='completed'||plan.candidate!==candidate.id)plan=planFromCandidate(view,candidate);
     if(plan.deadline<start){d.set(['state','npcs',id,'plan'],null);d.set(['state','records',`plan_abandoned:${actionId}`],{category:'plan_abandoned',npc:id,minute:start,reason:'期限已过',basis:candidate.decision.trace});continue;}
     const step=plan.steps.find(s=>!s.done);if(!step)continue;selected={...candidate,...step};planToStart=plan;
    }
    action=candidateAction(engine,selected);
    const checked=validateAction(d,engine,id,action,{at:start,presence});
    // Native daily purchases need the same two-party presence snapshot as
    // frozen NPC plans; otherwise settlement rejects every real seller.
    const actorPresence={npcs:Object.fromEntries([id,action.seller].filter(Boolean).map(who=>[who,presenceOf(presence.npcs[who])]))};
    startTask(d,{id:actionId,npc:id,action:clone(action),start,finish:start+checked.minutes,presence:actorPresence,status:'进行中',rule:true,...(!candidate.legacy?{candidate:candidate.id,decision:candidate.decision}:(candidate.horizon??1)>1?{candidate:candidate.id}:{} )},checked,engine);
    // Procurement's saved explanation is its actual integer cost/noise and
    // knowledge basis, not a duplicate of transient derived personality math.
    if(planToStart&&autonomyKind(action.kind)?.itinerary)planToStart={...planToStart,basis:[{stage:'input_procurement',basis:{knownFrom:action.knownFrom,...action.basis}}]};
    if(planToStart)d.set(['state','npcs',id,'plan'],planToStart);
    if((candidate.horizon??1)<=1&&queued.some(c=>c.id===candidate.id))d.remove(['state','autonomyCandidates',candidate.id]);break;
   }catch(error){
    // Keep the actual unmet input and failure, without freezing an unstarted
    // itinerary into tomorrow's plan or reporting a successful transaction.
    if(autonomyKind(action?.kind)?.itinerary){
     // An itinerary that declares no input purpose (a profession labour trip) is recorded under its kind with an empty input list: a record never carries undefined fields, which do not survive a save.
     const purpose=action.purpose??action.kind;
     d.set(['state','records',`input_constraint:${id}:${purpose}`],{category:'input_constraint',npc:id,minute:start,purpose,missing:action.inputs??[],blocked:['feasibility'],reason:error.message});
     if(d.get('state','npcs',id,'plan','candidate')===candidate.id)d.set(['state','npcs',id,'plan'],null);
    }
   }}
  }
  settle();
 }
 return results;
}
export function npcPlanFingerprint(document){return digest({minute:document.state.minute,npcs:document.state.npcs,location:document.state.location,companions:document.state.player.companions,obligations:document.state.obligations,actions:document.state.npcAutonomy});}
// R25: a plan frozen before the fix fingerprinted task presence with activity:undefined.
function legacyPlanFingerprint(document){const actions=withLegacyUndefinedActivity(document.state.npcAutonomy,['state','npcAutonomy']);return actions?digest({minute:document.state.minute,npcs:document.state.npcs,location:document.state.location,companions:document.state.player.companions,obligations:document.state.obligations,actions}):null;}
export function npcPlanningContext(engine,document,{limit=12}={}){
 if(!Number.isInteger(limit)||limit<8||limit>20)throw preconditionFailure('智能层人数须在8到20之间');
 const ranked=Object.keys(document.state.npcs).filter(id=>personSimulation(engine,document.state,id).value&&!personConstraint(engine,document.state,id)).map(id=>document.state.created?.[id]??engine.byId.get(id)).sort((a,b)=>{
  const score=n=>{const s=document.state.npcs[n.id],r=relationView(engine,document.state,n.id,'player');return Math.abs(r.trust)+Math.abs(r.affection)+(s.memoryStream??[]).filter(m=>m.participants?.includes('player')).length*5;};return score(b)-score(a)||a.id.localeCompare(b.id);
 }).slice(0,limit);
 const day=Math.floor(document.state.minute/DAY);
 return {minute:document.state.minute,day,stateFingerprint:npcPlanFingerprint(document),people:ranked.map(n=>{const mind=intelligenceOf(engine,document.state,n.id),view=subjectiveView(engine,document,n.id);return {id:n.id,name:view.self.name,location:view.self.location,coins:view.self.coins,inventory:view.self.inventory,values:view.self.traits.values,redLines:view.self.redLines,
  intelligence:{maxActions:mind.maxActions,horizonDays:mind.horizonDays,breaksRoutine:mind.offSchedule},goals:clone(goalsWithinHorizon(view.self.goals,mind.horizonDays,day)),memories:view.knowledge.memories.slice(-5),knownRecipes:engine.world.recipes.filter(r=>r.teachers?.includes(n.id)||document.state.npcs[n.id].recipes?.[r.id]).map(r=>({id:r.id,minutes:r.minutes,materials:r.materials})),relations:Object.entries(view.self.relations).map(([withId,r])=>({with:withId,trust:r.trust})),vocations:npcVocationOptions(engine,document.state,n.id)};})};
}
export function applyNpcPlan(d,engine,input,eventId){
 if(input.kind!=='npc-plan'||input.version!==1||input.minute!==d.get('state','minute')||input.stateFingerprint!==npcPlanFingerprint(d.document)&&input.stateFingerprint!==legacyPlanFingerprint(d.document))throw preconditionFailure('智能层计划不是当前状态的冻结输入');
 if(!Array.isArray(input.proposals)||input.proposals.length>20)throw preconditionFailure('计划人数超限');
 const ids=new Set(),results=[];
 // 计划长度由灵智决定：超出本人谋算的后续步骤逐条拒绝；旧事件重放仍按每人两步。
 const most=INTELLIGENCE_LEVELS[5].maxActions;
 for(const proposal of input.proposals){if(ids.has(proposal.npc)||!full(engine,proposal.npc)||!Array.isArray(proposal.actions)||proposal.actions.length>most)throw preconditionFailure('计划人物重复或单人行动超限');ids.add(proposal.npc);}
 for(const proposal of input.proposals){const reach=intelligenceOf(engine,d.get('state'),proposal.npc).maxActions;for(const [index,action]of proposal.actions.entries()){
  const id=`npc_plan_${digest([input.stateFingerprint,proposal.npc,index,action]).slice(0,24)}`;
  try{
   if(index>=reach)throw preconditionFailure('计划步数超出本人灵智所及');
   const allowed={craft:['kind','recipe'],audit_inventory:['kind','goal'],trade:['kind','seller','item','quantity'],share:['kind','to','memoryId','channel'],switch_vocation:['kind','vocation']}[action.kind];
   if(!allowed||Object.keys(action).some(k=>!allowed.includes(k)))throw preconditionFailure('计划包含未实现字段或直接改账请求');
   if(action.kind==='switch_vocation'&&!d.get('state','npcs',proposal.npc))throw preconditionFailure('人物没有独立成长记录');
   const decision=npcDecision(subjectiveView(engine,d.document,proposal.npc),{kind:action.kind,from:proposal.npc,needSatisfaction:100});
   if(decision.outcome!=='agree')throw Error(decision.reason);
   if(action.kind==='switch_vocation'){results.push({id,status:'已完成',detail:switchVocation(d,engine,proposal.npc,action.vocation,id)});continue;}
   if(action.kind==='share'){const detail=shareNpcMemory(d,engine,{from:proposal.npc,to:action.to,memoryId:action.memoryId,channel:action.channel,eventId:id});results.push({id,status:detail.delivered?'已完成':'进行中',detail});continue;}
   const checked=validateAction(d,engine,proposal.npc,action),start=d.get('state','minute');
   const task={id,npc:proposal.npc,action:clone(action),start,finish:start+checked.minutes,presence:{npcs:Object.fromEntries([proposal.npc,action.seller].filter(Boolean).map(who=>{const n=d.get('state','npcs',who);return [who,presenceOf(n)];}))},status:'进行中',planEvent:eventId};
   startTask(d,task,checked,engine);results.push({id,status:'进行中',finish:task.finish});
  }catch(error){results.push({id,status:'拒绝',reason:error.message});}
 }}
 return {proposed:results.length,results};
}
export function nextNpcAutonomyMinute(state,after){const today=Math.floor(after/DAY)*DAY+600,daily=today>after?today:today+DAY;return Math.min(daily,nextQuestBoardMinute(state,after),...Object.values(state.npcAutonomy?.tasks??{}).filter(t=>t.status==='进行中'&&t.finish>after).map(t=>t.finish));}
export function npcLocalChanges(document,location,since=0){return Object.values(document.state.npcAutonomy?.actions??{}).filter(r=>r.location===location&&r.minute>since&&r.minute<=document.state.minute).map(r=>({npc:r.npc,minute:r.minute,summary:r.summary,outcome:clone(r.outcome)}));}

export function executeRoutingProgram(d,engine,tool,args,eventId){
 if(tool==='settlement'&&args.operation==='festival_plan'&&args.festival===undefined){
  if(args.project!==undefined){
   const project=d.get('state','projects',args.project);
   if(project?.type!=='节庆筹办'||project.actor!=='player'||project.stage!=='征询'||project.location!==d.get('state','location'))reject('E-ACTION-FESTIVAL-PROJECT','须在筹办地点继续本人的征询项目');
   const answer=executeRoutingProgram(d,engine,'remember',{key:'dialogue:ask_request',subject:args.speaker,content:args.content??`是否愿意参与${project.name}或商议场地；尚未承诺付费与参加`},eventId);
   holdingSet(d,engine,['state','projects',args.project,'requests'],[...project.requests??[],{target:answer.dialogue.npc,sourceEvent:eventId,minute:d.get('state','minute')}],'routing-programs');
   return {...answer,project:args.project};
  }
  if(args.authorization!==undefined||args.sponsor&&args.sponsor!=='player'||args.supplier!==undefined||args.cost!==undefined||args.consent!==undefined)reject('E-ACTION-FESTIVAL-SOURCE','筹办构想不能代填公款、收费或参与者同意');
  if(!Number.isSafeInteger(args.budget)||args.budget<0||args.budget>d.get('state','player','coins'))reject('E-ACTION-FESTIVAL-BUDGET','筹办预算须在自己的实际钱袋以内');
  if(args.settlement!==undefined&&args.settlement!==d.get('state','location'))reject('E-ACTION-FESTIVAL-LOCATION','请在拟征询场地提出构想');
  const key=`festival_project:${eventId}`;
  const project={id:key,type:'节庆筹办',name:args.name??'邻里节庆构想',actor:'player',location:d.get('state','location'),budget:args.budget,spent:0,stage:'征询',venueConsent:null,participants:[],sourceEvent:eventId};
  initializeFestivalProject(d,engine,project,{origin:'action',eventId});
  return {project:key,stage:project.stage,actionScope:{kind:'instant'}};
 }
 if(tool!=='remember')return null;
 const kind=({'dialogue:delivery_request':'delivery','dialogue:ask_request':'ask','dialogue:persuade_request':'make_way','dialogue:self_tell':'tell'})[args.key];
 if(!kind)return null;
 const npc=engine.resolve(args.subject,'npc'),state=d.get('state'),body=state.npcs?.[npc];
 if(!body||body.location!==state.location||body.scheduleTravel||body.cognitionTravel||isPhysicallyDead(engine,d,npc)||['昏迷','濒死'].includes(body.status))reject('E-ACTION-TALK-PRESENT','对方须清醒且真实在场');
 for(const actor of ['player',npc]){const permission=canAct({engine,document:d.document},actor,'talk');if(!permission.allowed)reject('E-ACTION-TALK-CAPACITY',permission.reason);}
 if(typeof args.content!=='string'||!args.content.trim()||args.content.length>4000)reject('E-ACTION-TALK-CONTENT','请说明要说的话');
 const view=subjectiveView(engine,d.document,npc),language=conversationLanguage(view,engine,d);
 const decision=npcDecision(view,{kind:kind==='guide'?'带路':kind==='delivery'?'送货':kind,from:'player'});
 let text=language?'已听到你的请求，具体条款仍须另行约定。':'言语不通，需要手势或通译。';
 if(language&&kind==='ask'){
  const playerView=subjectiveView(engine,d.document,'player'),sources=new Set(playerView.knowledge.memories.flatMap(m=>[m.id,m.sourceEvent].filter(Boolean)));
  const shared=m=>m.participants?.includes('player')||sources.has(m.sourceEvent??m.id);
  const candidate=subjectiveFact(view,args.content),known=candidate&&(candidate.kind==='prior'||sources.has(candidate.source))?candidate:null;
  text=known?`我知道：${typeof known.value==='string'?known.value:JSON.stringify(known.value)}`:'这件事我不知道。';
  if(!known){
   const tokenizer=requestTokenizer??=new MemoryIndex();
   const terms=new Set(tokenizer.terms(args.content));
   const recalled=view.knowledge.memories.filter(m=>shared(m)&&typeof m.content==='string').map(m=>({m,score:tokenizer.terms(m.content).filter(t=>terms.has(t)).length})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||(b.m.minute??0)-(a.m.minute??0))[0]?.m;
   if(recalled)text=`我记得：${recalled.content}。至于眼下的情况，还需要看看。`;
  }
 }
 if(kind==='tell')text=language?'我听到你这样说了，尚未核实。':text;
 const action=kind==='tell'?'tell':kind==='ask'?'ask':kind==='make_way'?'persuade':'request';
 const judgement=language&&kind==='make_way'?engine.check(d,{attribute:'魅力',opponent:{npc,attribute:'精神'}},eventId):null;
 const {dialogue}=saveDialogue(d,npc,eventId,action,decision,text,{content:args.content,requestKind:kind,...(judgement?{judgement}:{})});
 holdingSet(d,engine,['state','records',`speech:${eventId}`],{category:'speech',actor:'player',target:npc,content:args.content,kind,minute:state.minute,sourceEvent:eventId,verified:false},'routing-programs');
 return {dialogue,actionScope:{kind:'instant'},socialEvent:{verb:kind==='tell'?'tell':'request',target:npc,visibility:kind==='tell'?'witnessed':'private',witnesses:[npc],tags:['dialogue',kind],payload:{kind,content:args.content,source:'player',verified:false}}};
}
