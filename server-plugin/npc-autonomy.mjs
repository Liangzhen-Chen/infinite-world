import {applyPatches,digest} from './storage.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {npcPresenceAt,shareNpcMemory,npcCognitionView} from './npc-cognition.mjs';
import {assertNpcObligationAction,npcObligationAt} from './npc-obligations.mjs';
import {changeItems,transferItems,heldUnit,wearItem} from './items.mjs';
import {derivedStats} from './combat.mjs';
import {wildlifePriceFactor} from './wildlife.mjs';

const DAY=1440,clone=x=>structuredClone(x),safe=n=>Number.isSafeInteger(n)&&n>=0;
const awake=n=>n?.location&&!n.scheduleTravel&&!n.cognitionTravel&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const full=(engine,id)=>engine.byId.get(id)?.tier==='full';
const auditGoal=g=>/核清现有(?:铁料|线料)/.test(g.content);
function draft(document,at){const d={document,patches:[],get(...p){if(at!==undefined&&p.join('.')==='state.minute')return at;return p.reduce((x,k)=>x?.[k],this.document);},set(path,value){const p={op:'set',path,value};this.document=applyPatches(this.document,[p]);this.patches.push(p);},remove(path){const p={op:'delete',path};this.document=applyPatches(this.document,[p]);this.patches.push(p);}};return d;}
const commit=(target,work)=>{for(const p of work.patches)p.op==='set'?target.set(p.path,p.value):target.remove(p.path);};
const proficiency=(engine,state,id,skill)=>{const v=state.npcs[id]?.skills?.[skill]??engine.byId.get(id)?.skills?.[skill]??engine.byId.get(id)?.proficiencies?.[skill]??0;return typeof v==='object'?v.proficiency:v;};
function duration(engine,action){if(action.kind==='craft')return engine.byId.get(action.recipe)?.minutes;if(action.kind==='audit_inventory')return 30;if(action.kind==='trade')return 5;return 0;}
function tradeQuote(d,engine,buyer,action,location){const key=`${Math.floor(d.get('state','minute')/DAY)}_${action.seller}_${buyer}_${action.item}`,price=d.get('state','quotes',key)??Math.ceil(engine.byId.get(action.item).basePrice*wildlifePriceFactor(engine,d.document,action.item,location));return {key,price,cost:price*action.quantity};}
export function npcAutonomyBusy(state,id,minute=state.minute){return Object.values(state.npcAutonomy?.tasks??{}).find(t=>t.status==='进行中'&&[t.npc,t.action.seller].includes(id)&&t.start<=minute&&minute<t.finish)??null;}
export function assertNpcAutonomyAction(state,actors,{start=state.minute,minutes=0}={}){
 for(const t of Object.values(state.npcAutonomy?.tasks??{}))if(t.status==='进行中'&&actors.some(id=>[t.npc,t.action.seller].includes(id))&&start<t.finish&&start+Math.max(1,minutes)>t.start)throw Error('人物正在完成已经开始的自主工作');
}
function validateAction(d,engine,id,action,{at=d.get('state','minute'),presence=d.get('state'),ignoreTask=false}={}){
 const state=d.get('state'),actor=presence.npcs[id],base=engine.byId.get(id),minutes=duration(engine,action);
 if(!full(engine,id)||!awake(actor)||state.player.companions?.includes(id))throw Error('人物不具备独立行动条件');
 if(['死亡','濒死','昏迷','患病'].includes(state.npcs[id]?.status))throw Error('人物当前无法完成工作');
 if(ignoreTask)for(const who of [id,action.seller].filter(Boolean))if(!awake(state.npcs[who])||state.npcs[who].location!==presence.npcs[who]?.location)throw Error('工作完成时人物已离开或不能继续行动');
 if(!safe(minutes)||minutes>480)throw Error('行动耗时未登记或超过单日上限');
 if(!ignoreTask)assertNpcAutonomyAction(state,[id,action.seller].filter(Boolean),{start:at,minutes});
 assertNpcObligationAction(d,engine,[id,action.seller].filter(Boolean),{start:at,minutes,location:actor.location,kind:'autonomy'});
 const day=String(Math.floor(at/DAY)),spent=state.npcs[id].autonomy?.minutesByDay?.[day]??0;
 if(spent+minutes>240)throw Error('每日自主工作时间已用尽');
 for(let cursor=at;cursor<at+minutes;){const slot=scheduleAt(engine,id,cursor);if(!slot||slot.location!==actor.location||/睡眠|睡觉|熟睡|赶路|前往|返回/.test(slot.activity))throw Error('实际作息没有完整工作窗口');cursor=slot.until;}
 if(action.kind==='audit_inventory'){
  const goals=state.npcs[id].goals??base.goals,goal=Object.values(goals).flat().find(g=>g.id===action.goal);
  if(!goal||!auditGoal(goal)||goal.progress>=100)throw Error('这项目标不能通过盘点本人库存直接完成');
 }else if(action.kind==='craft'){
  const recipe=engine.world.recipes.find(r=>r.id===action.recipe);if(!recipe)throw Error('配方未登记');
  if(recipe.learningRequired&&!recipe.teachers?.includes(id)&&!state.npcs[id].recipes?.[recipe.id])throw Error('人物没有学会该配方');
  if(proficiency(engine,state,id,recipe.skill)<recipe.minimumProficiency)throw Error('人物技能不足');
  if(recipe.location&&recipe.location!==actor.location)throw Error('不在配方地点');
  const totals=new Map();for(const m of recipe.materials)totals.set(m.item,(totals.get(m.item)??0)+m.amount);
  for(const [item,amount] of totals)if(engine.quantity(d,id,item)<amount)throw Error('实际制造材料不足');
  for(const item of recipe.tools??[]){if(recipe.materials.some(m=>m.item===item))throw Error('工具不能同时消耗');if(engine.quantity(d,id,item)<1||(heldUnit(d,engine,id,item)?.durability??engine.byId.get(item)?.durability??0)<=0)throw Error('没有完好的实际工具');}
  const station=engine.byId.get(actor.location)?.workstations?.find(s=>s.kind===recipe.workstation);
  if(recipe.workstation&&!station||station&&station.access!=='public'&&station.owner!==id||state.buildings?.[actor.location]?.condition===0)throw Error('没有可用且获准的工作台');
  if(station?.thermalRequirement)throw Error('人物尚不能自主维护需要持续热源的工序');
  const fee=station?.owner===id?0:station?.fee??0;if(!safe(fee)||state.npcs[id].coins<fee)throw Error('工坊费用不足');
  if(station?.owner?.startsWith('npc_')&&(!state.npcs[station.owner]||['死亡','濒死'].includes(state.npcs[station.owner].status)))throw Error('工坊收费人无法履约');
  npcToolBonus(d,engine,id,recipe);
 }else if(action.kind==='trade'){
  const seller=presence.npcs[action.seller],sellerBase=engine.byId.get(action.seller),item=engine.byId.get(action.item);
  if(action.seller===id||!awake(seller)||seller.location!==actor.location||!sellerBase?.serviceCatalog?.some(s=>s.kind==='trade'&&s.price.mode==='engineQuote'))throw Error('没有同地且愿意出售现有库存的卖家');
  if(!safe(action.quantity)||action.quantity<1||action.quantity>20||!item?.id.startsWith('item_'))throw Error('交易品种或数量未登记');
  if(engine.quantity(d,action.seller,action.item)<action.quantity||state.npcs[id].coins<tradeQuote(d,engine,id,action,actor.location).cost)throw Error('真实钱款或库存不足');
  for(let cursor=at;cursor<at+minutes;){const s=scheduleAt(engine,action.seller,cursor);if(!s||s.location!==actor.location||!s.services.includes('trade'))throw Error('交易没有完整接待窗口');cursor=s.until;}
 }else throw Error('自主行动类型未实现');
 return {minutes,location:actor.location};
}
function npcToolBonus(d,engine,id,recipe){
 const attribute=recipe.attribute??engine.byId.get(recipe.skill)?.attribute??'智力';let sum=0;
 for(const item of recipe.tools??[]){const definition=engine.byId.get(item),held=heldUnit(d,engine,id,item),grade=engine.rules.equipment.qualities.indexOf(held?.quality??definition.quality);
  if(grade<0||(d.get('state','npcs',id,'level')??engine.byId.get(id).level??1)<engine.rules.equipment.requiredLevels[grade])throw Error('人物等级不足以使用工具');
  const spec=definition.checkBonus;if(spec&&(!spec.attributes?.length||spec.attributes.includes(attribute))&&(!spec.skills?.length||spec.skills.includes(recipe.skill)))sum+=spec.bonus;
 }return Math.min(engine.rules.check.maximumToolBonus??5,sum);
}
function produce(d,engine,id,item,quantity,actionId,recipe,at,workmanship){
 const definition=engine.byId.get(item),instances=[];
 for(let i=0;i<quantity;i++){const unit=`unit_${digest([d.document.randomSeed,actionId,item,i]).slice(0,24)}`;if(d.get('state','itemInstances',unit))throw Error('重复制造单件');instances.push(unit);
  const factor=engine.rules.equipment.workmanship?.find(row=>row.name===workmanship)?.multiplier??1,maxDurability=Math.max(1,Math.round(definition.durability*factor));
  d.set(['state','itemInstances',unit],{id:unit,item,owner:id,status:'持有',maker:id,makerName:engine.byId.get(id).name,recipe,source:actionId,minute:at,quality:definition.quality,durability:maxDurability,maxDurability,workmanship});
 }
 changeItems(d,engine,id,item,quantity);d.set(['state','npcs',id,'inventory',item,'instances'],[...d.get('state','npcs',id,'inventory',item,'instances')??[],...instances]);return instances;
}
function executeAction(target,engine,id,action,{at,presence,actionId,start,ignoreTask=false}){
 const d=draft(target.document,at),checked=validateAction(d,engine,id,action,{at:start,presence,ignoreTask}),base=engine.byId.get(id),minutes=checked.minutes;
 let outcome={success:true},summary,spent={minutes},produced=[];
 if(action.kind==='audit_inventory'){
  const inventory=Object.fromEntries(Object.keys(d.get('state','npcs',id,'inventory')??{}).sort().map(item=>[item,engine.quantity(d,id,item)]));
  const goals=clone(d.get('state','npcs',id,'goals')??base.goals),goal=Object.values(goals).flat().find(g=>g.id===action.goal);
  goal.progress=100;goal.status='已完成';goal.completedAt=at;goal.evidence=actionId;goal.steps=goal.steps.map(s=>({...s,status:'已完成',evidence:actionId}));
  d.set(['state','npcs',id,'goals'],goals);d.set(['state','npcs',id,'autonomy','inventoryAudit'],{minute:at,inventory,sourceEvent:actionId});summary=`盘点了本人现有库存，完成“${goal.content}”。`;
 }else if(action.kind==='trade'){
  const {key,price,cost}=tradeQuote(d,engine,id,action,checked.location);transferItems(d,engine,action.seller,id,action.item,action.quantity);d.set(['state','quotes',key],price);
  d.set(['state','npcs',id,'coins'],d.get('state','npcs',id,'coins')-cost);d.set(['state','npcs',action.seller,'coins'],d.get('state','npcs',action.seller,'coins')+cost);spent.coins=cost;
  summary=`向${engine.byId.get(action.seller).name}支付${cost}铜，购得${engine.byId.get(action.item).name}${action.quantity}份。`;
 }else{
  const r=engine.byId.get(action.recipe),skill=proficiency(engine,d.get('state'),id,r.skill),die=parseInt(digest([d.document.randomSeed,actionId,'npc-craft']).slice(0,8),16)%20+1;
  const attribute=r.attribute??engine.byId.get(r.skill)?.attribute??'智力',score=d.get('state','npcs',id,'attributes',attribute)??base.attributes?.[attribute]??10;
  const modifier=Math.floor((score-10)/2)+Math.floor(skill/(engine.rules.check.skillDivisor??150))+npcToolBonus(d,engine,id,r),total=die+modifier;
  const degree=die===1||total<=r.difficulty-10?'大失败':die===20||total>=r.difficulty+10?'大成功':total<r.difficulty?'失败':total<r.difficulty+5?'勉强成功':'成功';
  outcome={die,modifier,total,degree,difficulty:r.difficulty,success:['勉强成功','成功','大成功'].includes(degree)};
  const station=engine.byId.get(checked.location)?.workstations?.find(s=>s.kind===r.workstation),fee=station?.owner===id?0:station?.fee??0;
  if(fee){d.set(['state','npcs',id,'coins'],d.get('state','npcs',id,'coins')-fee);if(station.owner?.startsWith('npc_'))d.set(['state','npcs',station.owner,'coins'],d.get('state','npcs',station.owner,'coins')+fee);else d.set(['state','workshopFunds',station.id],(d.get('state','workshopFunds',station.id)??0)+fee);}
  spent.fee=fee;spent.materials=clone(r.materials);
  for(const m of r.materials)changeItems(d,engine,id,m.item,-m.amount);
  for(const item of r.tools??[]){changeItems(d,engine,id,item,0);wearItem(d,engine,id,item,r.toolWear??1);}
  if(outcome.success){outcome.workmanship=degree==='勉强成功'?'粗糙':degree==='大成功'?(skill>=2100?'杰作':skill>=1500?'优秀':'精良'):'普通';produced=[{item:r.output.item,amount:r.output.quantity},...r.byproducts??[]];for(const p of produced)produce(d,engine,id,p.item,p.amount,actionId,r.id,at,outcome.workmanship);}
  else{for(const m of r.materials){const recovered=Math.floor(m.amount*(r.failure?.recoverFraction??0));if(recovered)changeItems(d,engine,id,m.item,recovered);}
   if((die===1||die+modifier<=r.difficulty-10)&&r.failure?.injury){const max=d.get('state','npcs',id,'maxHp')??derivedStats({level:base.level??1,attributes:base.attributes,profession:Boolean(base.combatProfession)},engine.rules).maxHp;const hp=Math.max(0,(d.get('state','npcs',id,'hp')??max)-r.failure.injury);d.set(['state','npcs',id,'maxHp'],max);d.set(['state','npcs',id,'hp'],hp);if(!hp)d.set(['state','npcs',id,'status'],'濒死');}
  }
  summary=`尝试${r.name}，耗时${minutes}分钟，${outcome.success?`制成${engine.byId.get(r.output.item).name}${r.output.quantity}份`:'没有得到成品'}，工坊费${fee}铜。`;
 }
 const day=String(Math.floor(start/DAY)),autonomy=d.get('state','npcs',id,'autonomy')??{};
 d.set(['state','npcs',id,'autonomy','minutesByDay',day],(autonomy.minutesByDay?.[day]??0)+minutes);
 const record={id:actionId,npc:id,kind:action.kind,action:clone(action),start,minute:at,location:checked.location,summary,outcome,spent,produced};
 d.set(['state','npcAutonomy','actions',actionId],record);
 const participants=action.seller?[id,action.seller]:[id];
 for(const whom of participants)d.set(['state','npcs',whom,'memoryStream'],[...d.get('state','npcs',whom,'memoryStream')??[],{id:actionId,sourceEvent:actionId,kind:action.kind==='trade'?'trade':'autonomy',minute:at,location:checked.location,participants,content:`${base.name}${summary}`,sourceType:'亲历',salience:3,emotion:outcome.success?'踏实':'失望'}]);
 d.set(['state','npcs',id,'developments'],[...d.get('state','npcs',id,'developments')??[],{type:'自主行动',source:actionId,minute:at,content:summary}]);commit(target,d);return record;
}

export function advanceNpcAutonomy(d,engine,before,after,eventId,{beforeState}={}){
 const results=[];
 const settle=()=>{for(const task of Object.values(d.get('state','npcAutonomy','tasks')??{}).sort((a,b)=>a.finish-b.finish||a.id.localeCompare(b.id))){
  if(task.status!=='进行中'||task.finish>after)continue;
  try{const row=executeAction(d,engine,task.npc,task.action,{at:task.finish,start:task.start,presence:task.presence,actionId:task.id,ignoreTask:true});d.set(['state','npcAutonomy','tasks',task.id,'status'],row.outcome.success?'已完成':'失败');results.push(row);}
  catch(error){d.set(['state','npcAutonomy','tasks',task.id,'status'],'失败');d.set(['state','npcAutonomy','tasks',task.id,'reason'],error.message);}
 }};settle();
 if(!beforeState)return results;
 for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
  const start=day*DAY+600;if(start<before||start>after)continue;
  const presence=start===after?d.get('state'):npcPresenceAt(engine,beforeState,before,start,d.document.randomSeed);
  for(const id of Object.keys(presence.npcs).sort()){
   const actor=presence.npcs[id],base=engine.byId.get(id),actionId=`npc_daily_${day}_${id}`;
   if(!full(engine,id)||!awake(actor)||actor.location===beforeState.location||beforeState.player.companions?.includes(id)||npcObligationAt(beforeState,id,start))continue;
   if(d.get('state','npcAutonomy','tasks',actionId))continue;
   const goal=Object.values(d.get('state','npcs',id,'goals')??base.goals??{}).flat().find(g=>auditGoal(g)&&g.progress<100);
   const recipes=engine.world.recipes.filter(r=>r.teachers?.includes(id)&&r.minutes<=30).sort((a,b)=>a.id.localeCompare(b.id));
   const choices=goal?[{kind:'audit_inventory',goal:goal.id}]:recipes.map(r=>({kind:'craft',recipe:r.id}));
   for(const action of choices){try{
    const checked=validateAction(d,engine,id,action,{at:start,presence});
    const actorPresence={npcs:{[id]:{location:actor.location,activity:actor.activity,status:actor.status??'正常'}}};
    d.set(['state','npcAutonomy','tasks',actionId],{id:actionId,npc:id,action:clone(action),start,finish:start+checked.minutes,presence:actorPresence,status:'进行中',rule:true});break;
   }catch{/* Missing resources or occupied time is a skipped action, never success. */}}
  }
  settle();
 }
 return results;
}
export function npcPlanFingerprint(document){return digest({minute:document.state.minute,npcs:document.state.npcs,location:document.state.location,companions:document.state.player.companions,obligations:document.state.obligations,actions:document.state.npcAutonomy});}
export function npcPlanningContext(engine,document,{limit=12}={}){
 if(!Number.isInteger(limit)||limit<8||limit>20)throw Error('智能层人数须在8到20之间');
 const ranked=engine.world.npcs.filter(n=>n.tier==='full'&&document.state.npcs[n.id]).sort((a,b)=>{
  const score=n=>{const s=document.state.npcs[n.id];return Math.abs(s.trust??0)+Math.abs(s.affection??0)+(s.memoryStream??[]).filter(m=>m.participants?.includes('player')).length*5;};return score(b)-score(a)||a.id.localeCompare(b.id);
 }).slice(0,limit);
 return {minute:document.state.minute,day:Math.floor(document.state.minute/DAY),stateFingerprint:npcPlanFingerprint(document),people:ranked.map(n=>({id:n.id,name:n.name,location:document.state.npcs[n.id].location,coins:document.state.npcs[n.id].coins,inventory:clone(document.state.npcs[n.id].inventory),values:n.personality.values,redLines:n.redLines,goals:clone(document.state.npcs[n.id].goals??n.goals),memories:npcCognitionView(engine,document,n.id).memories.slice(-5),knownRecipes:engine.world.recipes.filter(r=>r.teachers?.includes(n.id)||document.state.npcs[n.id].recipes?.[r.id]).map(r=>({id:r.id,minutes:r.minutes,materials:r.materials})),relations:n.relationships.map(r=>({with:r.with,type:r.type,trust:r.trust}))}))};
}
export function applyNpcPlan(d,engine,input,eventId){
 if(input.kind!=='npc-plan'||input.version!==1||input.minute!==d.get('state','minute')||input.stateFingerprint!==npcPlanFingerprint(d.document))throw Error('智能层计划不是当前状态的冻结输入');
 if(!Array.isArray(input.proposals)||input.proposals.length>20)throw Error('计划人数超限');
 const ids=new Set(),results=[];
 for(const proposal of input.proposals){if(ids.has(proposal.npc)||!full(engine,proposal.npc)||!Array.isArray(proposal.actions)||proposal.actions.length>2)throw Error('计划人物重复或单人行动超限');ids.add(proposal.npc);}
 for(const proposal of input.proposals)for(const [index,action]of proposal.actions.entries()){
  const id=`npc_plan_${digest([input.stateFingerprint,proposal.npc,index,action]).slice(0,24)}`;
  try{
   const allowed={craft:['kind','recipe'],audit_inventory:['kind','goal'],trade:['kind','seller','item','quantity'],share:['kind','to','memoryId','channel']}[action.kind];
   if(!allowed||Object.keys(action).some(k=>!allowed.includes(k)))throw Error('计划包含未实现字段或直接改账请求');
   if(action.kind==='share'){const detail=shareNpcMemory(d,engine,{from:proposal.npc,to:action.to,memoryId:action.memoryId,channel:action.channel,eventId:id});results.push({id,status:detail.delivered?'已完成':'进行中',detail});continue;}
   const checked=validateAction(d,engine,proposal.npc,action),start=d.get('state','minute');
   const task={id,npc:proposal.npc,action:clone(action),start,finish:start+checked.minutes,presence:{npcs:Object.fromEntries([proposal.npc,action.seller].filter(Boolean).map(who=>{const n=d.get('state','npcs',who);return [who,{location:n.location,activity:n.activity,status:n.status??'正常'}];}))},status:'进行中',planEvent:eventId};
   d.set(['state','npcAutonomy','tasks',id],task);results.push({id,status:'进行中',finish:task.finish});
  }catch(error){results.push({id,status:'拒绝',reason:error.message});}
 }
 return {proposed:results.length,results};
}
export function nextNpcAutonomyMinute(state,after){const today=Math.floor(after/DAY)*DAY+600,daily=today>after?today:today+DAY;return Math.min(daily,...Object.values(state.npcAutonomy?.tasks??{}).filter(t=>t.status==='进行中'&&t.finish>after).map(t=>t.finish));}
export function npcLocalChanges(document,location,since=0){return Object.values(document.state.npcAutonomy?.actions??{}).filter(r=>r.location===location&&r.minute>since&&r.minute<=document.state.minute).map(r=>({npc:r.npc,minute:r.minute,summary:r.summary,outcome:clone(r.outcome)}));}
