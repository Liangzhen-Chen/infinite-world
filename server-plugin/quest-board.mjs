import {standing,HOSTILE} from './standing.mjs';
import {transferItems,heldUnit,wearItem,changeItems} from './items.mjs';
import {awardExperience} from './progression.mjs';
import {scheduleAt} from './npc-schedule.mjs';
import {assertNpcObligationAction,assertCourierRouteAccess} from './npc-obligations.mjs';
import {bountyQuestAction} from './bounty.mjs';
import {spendPublic,refundPublic} from './governance.mjs';
import {personQuestRights} from './entity-view.mjs';
import {refundQuestFunding,settleQuestOutcome} from './quest-sources.mjs';
import {wildlifeQuestEvidence,claimWildlifeQuest,existingWildlifeEvidence} from './quest-wildlife.mjs';

const DAY=1440,active=q=>['公开','进行中'].includes(q.status);
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}必须在${min}到${max}之间`);return n;};
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>1200)throw Error('任务内容为空或过长');return n.trim();};
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/(睡眠|睡觉|熟睡)/.test(n.activity??'');
const place=(s,id)=>id==='player'?s.location:s.npcs[id]?.location;
const actorPath=id=>id==='player'?['state','player']:['state','npcs',id];

// The player's quota comes only from offices actually held (appointed by the
// Baishi office and still in term) and a granted title, the larger of the two;
// a self-declared office adds none. A notable's quota covers cultural quests only.
export function questPublishingRights(engine,state,publisher='player',{cultural=false}={}){
 return personQuestRights(engine,state,publisher,{cultural});
}
function notice(d,engine,q,minute,stage,location=q.location){
 const id=`${q.id}:${stage}`,participants=[q.publisher,q.taker].filter(Boolean);
 for(const who of participants){if(engine.byId.get(who)?.tier!=='full')continue;
  const stream=d.get('state','npcs',who,'memoryStream')??[];if(stream.some(m=>m.id===id))continue;
  d.set(['state','npcs',who,'memoryStream'],[...stream,{id,sourceEvent:id,kind:'quest',private:true,minute,location,participants,
   content:`委托“${q.content}”：${q.status}${q.reason?`，${q.reason}`:''}`,sourceType:'亲历',salience:3}]);
 }
 d.set(['state','records',id],{category:'quest_receipt',quest:q.id,parties:participants,minute,location,status:q.status,reason:q.reason??null,
  escrow:q.escrow,refund:q.refund??0,rewardPaid:q.rewardPaid??0,...(q.source?{source:q.source.generator}:{}),sourceEvent:id});
}
function close(d,engine,q,status,reason,minute){
 const paid=status==='已完成',amount=q.escrow,who=paid?q.taker:q.publisher;
 // A publicly funded reward goes back to the village treasury, not to the official.
 // U17: commissions escrowed from a faction treasury or a settlement account go back there.
 if(!paid&&refundQuestFunding(d,engine,q,amount,minute));
 else if(!paid&&q.fundedBy)refundPublic(d,{settlement:q.fundedBy.settlement,copper:amount,month:q.fundedBy.month,purpose:`委托退款 ${q.id}`,sourceEvent:`${q.id}:refund`});
 else d.set([...actorPath(who),'coins'],engine.actor(d,who).coins+amount);
 const row={...q,status,reason,escrow:0,resolvedAt:minute,...(paid?{rewardPaid:amount}:{refund:amount})};
 d.set(['state','quests',q.id],row);
 const booking=d.get('state','obligations',q.reservation);
 if(booking&&['待履行','进行中'].includes(booking.status))d.set(['state','obligations',booking.id],{...booking,status:paid?'已完成':status==='取消'?'取消':'违约',reason,resolvedAt:minute});
 if(paid)settleQuestOutcome(d,engine,row,minute);
 notice(d,engine,row,minute,status);return row;
}
function objective(engine,d,args,publisher){
 const o=args.objective;if(!o||!['deliver','visit','build'].includes(o.type))throw Error('任务完成条件必须可验证');
 if(o.type==='deliver'||o.type==='visit'){
  const location=engine.resolve(o.location??(o.type==='deliver'?d.get('state','location'):undefined));
  if(!engine.world.locations.some(l=>l.id===location))throw Error('委托目的地必须已登记');
  return o.type==='deliver'?{type:o.type,item:engine.resolve(o.item,'item'),quantity:integer(o.quantity,1,100000,'任务数量'),location}:{type:o.type,location};
 }
 const project=text(o.project),p=d.get('state','projects',project);if(!p)throw Error('任务工程未登记');
 if(publisher==='player'&&(p.creator!=='player'||p.type!=='工程'||p.status!=='施工中'||!((p.wood??0)+(p.stone??0)>0)))throw Error('私人建造委托需要本人已授权且已投入材料的在建工程');
 return {type:o.type,project};
}
function construction(engine,d,q,id){
 const p=d.get('state','projects',q.objective.project);if(!p||!['施工中','已完成'].includes(p.status))throw Error('委托工程已停止或不存在');
 const value=d.get('state','npcs',id,'skills','skill_life_6_core')??engine.byId.get(id)?.proficiencies?.skill_life_6_core??0;
 if((typeof value==='object'?value.proficiency:value)<100)throw Error('承接工程的木工能力不足');
 if(!((p.wood??0)+(p.stone??0)>0)||engine.quantity(d,id,'item_whittling_knife')<1||(heldUnit(d,engine,id,'item_whittling_knife')?.durability??engine.byId.get('item_whittling_knife')?.durability??0)<=0)throw Error('工程材料或完好工具不足');
 return p;
}
function acceptNpc(d,engine,q,id,now,state=d.get('state')){
 if(!['deliver','visit','build'].includes(q.objective.type))throw Error('NPC尚无执行这种目标的能力，不能接单');
 const actor=state.npcs[id];
 if(engine.byId.get(id)?.tier!=='full'||!awake(actor)||actor.scheduleTravel||actor.cognitionTravel||state.player.companions?.includes(id))throw Error('承接者须是可独立行动的现有full人物');
 if(id===q.publisher||actor.location!==q.location)throw Error('承接者没有实际看到该地点告示');
 const target=q.objective.type==='build'?(construction(engine,d,q,id).location??d.get('state','projects',q.objective.project,'settlement')):q.objective.location;
 if(!engine.world.locations.some(l=>l.id===target))throw Error('委托目的地必须已登记');
 const route=actor.location===target?{minutes:0,cost:0,edges:[]}:engine.route(actor.location,target,'walk',now,d.document.randomSeed);
 assertCourierRouteAccess(engine,id,actor.location,target,route);
 const work=q.objective.type==='build'?30:1,finish=now+route.minutes+work;
 if(finish>q.deadline)throw Error('无法在期限内按实际路线履约');
 if(actor.coins<route.cost)throw Error('履约路费不足');
 if(q.objective.type==='deliver'&&engine.quantity(d,id,q.objective.item)<q.objective.quantity)throw Error('承接者实际交付材料不足');
 if(route.minutes+work>240)throw Error('委托超过单日自主工作窗口');
 const spent=d.get('state','npcs',id,'autonomy','minutesByDay',String(Math.floor(now/DAY)))??0;
 if(spent+route.minutes+work>240)throw Error('每日自主工作时间已用尽');
 for(let t=now;t<finish;){const slot=scheduleAt(engine,id,t,state);if(!slot||slot.production===false||/(睡眠|睡觉|熟睡|前往|返回|赶路)/.test(slot.activity))throw Error('实际作息没有清醒履约窗口');t=slot.until;}
 assertNpcObligationAction(d,engine,[id],{start:now,minutes:finish-now,kind:'quest'});
 engine.assertNpcAutonomyAction?.(d.get('state'),[id],{start:now,minutes:finish-now});
 if(Object.values(d.get('state','obligations')??{}).some(o=>o.type==='带路'&&['待履行','进行中'].includes(o.status)&&[o.promisor,o.promisee].includes(id)))throw Error('承接者已有带路义务');
 const reservation=`obl_${q.id}`,booking={id:reservation,quest:q.id,reservationVersion:1,deliveryVersion:1,type:'委托履约',promisor:id,promisee:q.publisher,
  content:q.content,location:target,start:now,deadline:finish,departures:{[id]:now},createdAt:now,status:'进行中',workMinutes:0};
 d.set(['state','obligations',reservation],booking);
 const row={...q,status:'进行中',taker:id,acceptedAt:now,reservation,workRequired:work};
 d.set(['state','quests',q.id],row);notice(d,engine,row,now,'accept');return row;
}

export function questBoardAction(d,engine,args,eventId){
 const now=d.get('state','minute');
 if(!['publish','accept','complete','cancel','inspect'].includes(args.operation))throw Error('未知任务操作；发布用publish，接受用accept，完成用complete');
 if(args.operation==='publish'){
  const publisher=args.publisher==='player'?'player':engine.resolve(args.publisher,'npc'),actor=engine.actor(d,publisher),grade=args.grade;
  if(!awake(actor))throw Error('任务发布者无法清醒履约');
  if(!(grade in engine.rules.quests.quotaUnits))throw Error('任务等级无效');
  const rights=questPublishingRights(engine,d.get('state'),publisher,{cultural:args.cultural===true}),personal=args.personal===true||publisher==='player'&&args.personal!==false;
  if(!personal&&rights.usedD+engine.rules.quests.quotaUnits[grade]>rights.limitD)throw Error('身份或本月任务发布额度不足');
  if(personal&&grade!=='D')throw Error('未登记官职的私人任务只能发布D级，身份额度不足');
  const reward=integer(args.reward,20,1e6,'报酬'),publicFund=publisher==='player'&&!personal&&args.settlement!==undefined;
  if(!publicFund&&actor.coins<reward)throw Error('发布者无法托管报酬');
  const verified=objective(engine,d,args,publisher),content=text(args.content),location=d.get('state','location');
  if(publisher==='player'&&engine.byId.get(location)?.access?.mode==='private')throw Error('私人发单须在合法公共地点张贴');
  const deadline=integer(args.deadline??now+10*DAY,now+1,now+30*DAY,'期限'),quest=`quest_${eventId}`;
  let fundedBy=null;
  if(publicFund){const settlement=engine.resolve(args.settlement,'loc'),spend=spendPublic(d,engine,{settlement,copper:reward,power:'quest_publish',purpose:`委托托管 ${quest}`,sourceEvent:quest});fundedBy={settlement,month:spend.month,spend:spend.id};}
  else d.set([...actorPath(publisher),'coins'],actor.coins-reward);
  const row={id:quest,boardVersion:1,publisher,personal,grade,reward,escrow:reward,objective:verified,content,location,deadline,createdAt:now,status:'公开',taker:null,...(fundedBy?{fundedBy}:{}),...(args.cultural===true?{cultural:true}:{})};
  d.set(['state','quests',quest],row);
  if(!personal)d.set(['state','questQuota',`${rights.month}_${publisher}`],rights.usedD+engine.rules.quests.quotaUnits[grade]);
  notice(d,engine,row,now,'publish');return {quest,status:row.status};
 }
 const q=d.get('state','quests',args.quest);if(!q)throw Error('不存在这个任务');
 // Court bounties: rewards sit in the code treasury; capture goes through world_law arrest.
 if(q.bounty)return bountyQuestAction(d,engine,q,args,eventId);
 if(args.operation==='inspect'){
  if(![q.publisher,q.taker].includes('player')&&q.location!==d.get('state','location'))throw Error('没有获知该委托进度的渠道');
  return {quest:q.id,...([q.publisher,q.taker].includes('player')?{status:q.status,reason:q.reason??null,escrow:q.escrow,refund:q.refund??0}:{status:'告示',content:q.content,grade:q.grade,reward:q.reward,...(q.sourceLabel?{source:q.sourceLabel}:{})})};
 }
 if(args.operation==='cancel'){
  if(![q.publisher,q.taker].includes('player'))throw Error('只有委托当事人能取消');
  if(!active(q))throw Error('任务不在可取消状态');
  return {quest:q.id,...close(d,engine,q,'取消','当事人取消；未付报酬退回发布者，已付路费不退',now)};
 }
 if(q.deadline!==undefined&&now>=q.deadline)throw Error('任务已超期');
 if(args.operation==='accept'){
  if(q.status!=='公开')throw Error('任务当前不能接受');
  const taker=args.taker?engine.resolve(args.taker):'player';
  if(taker===q.publisher)throw Error('不能承接本人发布的任务');
  if(taker!=='player'){
   if(args.consent!==true||place(d.get('state'),taker)!==d.get('state','location'))throw Error('NPC接单须实际在场并同意');
   const row=acceptNpc(d,engine,q,taker,now);return {quest:q.id,status:row.status,taker};
  }
  if(q.publisher!=='player'&&standing(engine,d.get('state'),q.publisher)<=HOSTILE)throw Error('委托人对你怀有敌意，不肯把委托交给你');
  d.set(['state','quests',q.id],{...q,status:'进行中',taker:'player',...(['creature','pact'].includes(q.objective.type)?{acceptedAt:now,evidenceBefore:existingWildlifeEvidence(d.get('state'),q.objective)}:{})});return {quest:q.id,status:'进行中'};
 }
 if(q.status!=='进行中'||q.taker!=='player')throw Error('任务不在可结算状态；NPC履约由世界时间验证');
 const o=q.objective;let done=false;
 if(['creature','pact'].includes(o.type)){
  const evidence=wildlifeQuestEvidence(d,q);done=Boolean(evidence);
  if(evidence)claimWildlifeQuest(d,q,evidence);
 }
 if(o.type==='visit')done=Boolean(d.get('state','discoveries',engine.resolve(o.location)));
 if(o.type==='build')done=d.get('state','projects',o.project,'status')==='已完成';
 // U17 generated quests: a world record reaching the stated state (a lair cleared, a motion decided).
 if(o.type==='record')done=o.equals.includes(d.get('state','records',o.record,o.field));
 if(o.type==='deliver'){
  const target=engine.actor(d,q.publisher);if(['死亡','濒死'].includes(target?.status))throw Error('委托人无法接收交付，需先处理委托变更');
  if(place(d.get('state'),q.publisher)!==d.get('state','location'))throw Error('委托人不在场，不能交付');
  if(engine.quantity(d,'player',o.item)<o.quantity)throw Error('任务交付物品不足');transferItems(d,engine,'player',q.publisher,o.item,o.quantity);done=true;
 }
 if(!done)throw Error('没有可验证的完成证据');
 close(d,engine,q,'已完成','已验证目标',now);d.say(`任务完成，获得${q.reward}铜`);
 const experience=awardExperience(d,engine,{kind:'quest',subject:`${q.publisher}:${o.type}:${o.item??o.location??o.project??o.record}`,source:`quest:${q.id}`,base:engine.rules.quests.experienceRanges[q.grade][0],repeat:true},eventId);
 return {quest:q.id,reward:q.reward,...experience};
}

export function advanceQuestBoard(d,engine,before,after,{beforeState}={}){
 const results=[];
 for(const q of Object.values(d.get('state','quests')??{})){
  if(q.boardVersion!==1||!active(q))continue;
  if(q.status==='进行中'&&q.taker!=='player'){
   const booking=d.get('state','obligations',q.reservation);
   try{
    if(!booking||['取消','违约'].includes(booking.status))throw Error(booking?.reason??'委托占时记录失效');
    if(q.workEvidence){const p=d.get('state','projects',q.objective.project);if(!p||!['施工中','已完成'].includes(p.status))throw Error('委托工程已停止或不存在');if(p.status==='已完成'){results.push(close(d,engine,q,'已完成','实际施工记录与工程完成状态已核对',after));continue;}}
    else if(booking.deadline<=after){
     const actor=d.get('state','npcs',q.taker);if(!awake(actor)||actor.scheduleTravel||actor.cognitionTravel||actor.location!==booking.location||booking.workMinutes<q.workRequired)throw Error('未能清醒到场完成约定工作');
     if(q.objective.type==='deliver'){
      const recipient=engine.actor(d,q.publisher),action=engine.npcObligationAction;
      if(place(d.get('state'),q.publisher)!==booking.location||!awake(recipient)||recipient.scheduleTravel||recipient.cognitionTravel||q.publisher==='player'&&action?.args?.activity==='睡眠')throw Error('收件人未在约定地点清醒接收，货物仍由承接者持有');
      if((q.publisher==='player'||d.get('state','player','companions')?.includes(q.publisher))&&action?.tool==='move'&&after<action.arrivalMinute)throw Error('收件人仍在途中，货物仍由承接者持有');
      if(engine.quantity(d,q.taker,q.objective.item)<q.objective.quantity)throw Error('承接者实际交付材料不足');
      transferItems(d,engine,q.taker,q.publisher,q.objective.item,q.objective.quantity);
     }
     const day=String(Math.floor(booking.start/DAY)),spent=d.get('state','npcs',q.taker,'autonomy','minutesByDay',day)??0;
     d.set(['state','npcs',q.taker,'autonomy','minutesByDay',day],spent+booking.deadline-booking.start);
     if(q.objective.type==='build'){
      const p=construction(engine,d,q,q.taker);changeItems(d,engine,q.taker,'item_whittling_knife',0);wearItem(d,engine,q.taker,'item_whittling_knife',1);
      const evidence={npc:q.taker,minute:booking.deadline,minutes:booking.workMinutes,sourceEvent:booking.id};
      d.set(['state','projects',p.id??q.objective.project,'questWork',q.id],evidence);
      d.set(['state','quests',q.id],{...q,workEvidence:evidence});d.set(['state','obligations',booking.id],{...booking,status:'已完成',resolvedAt:booking.deadline});
      if(p.status==='已完成')results.push(close(d,engine,{...q,workEvidence:evidence},'已完成','实际施工与完成状态已验证',booking.deadline));
     }else results.push(close(d,engine,q,'已完成',q.objective.type==='deliver'?'到场实物交付':'实际抵达目标地点',booking.deadline));
     continue;
    }
   }catch(error){results.push(close(d,engine,q,'失败',error.message,after));continue;}
  }
  const current=d.get('state','quests',q.id);
  if(active(current)&&current.deadline<=after)results.push(close(d,engine,current,'超期','期限内未完成，未付报酬退回发布者',current.deadline));
 }
 if(!beforeState)return results;
 // The existing autonomy clock visits 10:00. Only people who actually reach
 // this board read it; a distant quest never enters their private memories.
 for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
  const at=day*DAY+600;if(at<before||at!==after)continue;
  for(const q of Object.values(d.get('state','quests')??{}).sort((a,b)=>a.id.localeCompare(b.id))){
   if(q.boardVersion!==1||q.publisher!=='player'||q.status!=='公开'||q.deadline<=at)continue;
   for(const id of Object.keys(d.get('state','npcs')).sort()){
    if(d.get('state','npcs',id,'location')===beforeState.location)continue;
    try{const row=acceptNpc(d,engine,q,id,at);results.push({quest:row.id,taker:id,status:row.status});break;}catch{/* Ineligible readers do not claim a job or its reward. */}
   }
  }
 }
 return results;
}
export function nextQuestBoardMinute(state,after){return Math.min(Infinity,...Object.values(state.quests??{}).filter(q=>q.boardVersion===1&&active(q)&&q.deadline>after).map(q=>q.deadline));}
