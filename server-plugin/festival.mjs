import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('festival',{sinks:['sink:consume']});
import {digest} from './storage.mjs';
import {assertActionTime,beginActionActivity,finishActionActivity} from './action-costs.mjs';
import {npcObligationAt} from './npc-obligations.mjs';
import {npcAutonomyBusy} from './npc-autonomy.mjs';
import {recordFestivalRelations} from './npc-relations.mjs';
import {changeItems,transferItems} from './items.mjs';
import {applyEffects,hookedEffects} from './effects.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {minuteForCalendarDate} from './weather.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings} from './holdings.mjs';
declareHoldingWriter('festival',{kinds:[]});

const DAY=1440,path=id=>['state','records',id],safe=n=>Number.isSafeInteger(n)&&n>=0;
const validId=id=>typeof id==='string'&&/^[a-z][a-z0-9_:-]+$/i.test(id)&&!['__proto__','constructor','prototype'].includes(id);
// Ordinary local events use their declared time window, not a religious rite
// or an invented annual calendar entry. Initial restoration does not pay prizes.
export function restoreOrdinaryFestival(d,engine,row,{origin,sourceEvent}={}){
 const {id,name,location,startsAt,endsAt,host,riddle}=row,now=d.get('state','minute');
 if(origin!=='initial'||typeof sourceEvent!=='string'||!sourceEvent||Object.keys(row).some(k=>!['id','name','location','startsAt','endsAt','host','riddle'].includes(k))||
  !validId(id)||d.get(...path(id))||typeof name!=='string'||!name.trim()||!engine.world.locations.some(l=>l.id===location)||
  !d.get('state','npcs',host)||!safe(startsAt)||!safe(endsAt)||startsAt>now||startsAt>=endsAt||endsAt-startsAt>DAY||
  Math.floor(startsAt/DAY)!==Math.floor((endsAt-1)/DAY)||!riddle||Object.keys(riddle).some(k=>!['id','question','answer','reward','claimed'].includes(k))||
  !validId(riddle.id)||typeof riddle.question!=='string'||!riddle.question.trim()||typeof riddle.answer!=='string'||!riddle.answer.trim()||riddle.claimed!==false)throw Error('Invalid ordinary festival initial declaration');
 const unit=d.get('state','itemInstances',riddle.reward),item=unit?.item;
 // A prize is one real inventory unit, with its existing owner and location.
 const owned=aliveHoldings(d,{kind:'owns',holder:host,subject:riddle.reward});
 const actualItem=item??d.get('holdings','entities',riddle.reward,'facts','item');
 if(!owned.length||!engine.world.items.some(i=>i.id===actualItem)||engine.quantity(d,host,actualItem)<1)throw Error('Festival prize is not a real host-owned inventory unit');
 const event={category:'festival',ordinary:true,id,name,location,host,due:startsAt,endsAt,status:now<endsAt?'held':'ended',sourceEvent,
  riddles:[{id:riddle.id,question:riddle.question,answers:[riddle.answer],reward:{item:actualItem,quantity:1,unit:riddle.reward}}]};
 holdingSet(d,engine,path(id),event,'festival');return event;
}

function ordinaryFestivalAction(d,engine,args,eventId,row){
 const now=d.get('state','minute');
 if(row.status!=='held'||row.location!==d.get('state','location')||now<row.due||now>=row.endsAt)throw preconditionFailure('这里没有正在举行的普通灯会');
 if(args.operation==='festival_answer'){
  if(!available(engine,d.get('state'),row.host,row.location,now))throw preconditionFailure('主办人不在场，无法核对答案并发奖');
  const puzzle=row.riddles.find(p=>p.id===args.request);if(!puzzle)throw preconditionFailure('没有这道灯谜');
  const key=`festival-prize:${row.id}:${puzzle.id}:player`;if(d.get(...path(key)))throw preconditionFailure('这道灯谜已经领奖');
  if(typeof args.choice!=='string'||!puzzle.answers.includes(args.choice.trim()))return {correct:false,festival:row.id,riddle:puzzle.id};
  if(!aliveHoldings(d,{kind:'owns',holder:row.host,subject:puzzle.reward.unit}).length)throw preconditionFailure('原花灯已不属于主办人');
  transferItems(d,engine,row.host,'player',puzzle.reward.item,1,[puzzle.reward.unit],{disposition:true,eventId});
  const result={correct:true,festival:row.id,riddle:puzzle.id,host:row.host,reward:puzzle.reward};
  holdingSet(d,engine,path(key),{category:'festival_prize',...result,sourceEvent:eventId,minute:now},'festival');return result;
 }
 if(args.operation==='festival_watch'){
  const minutes=row.endsAt-now;assertActionTime(d,engine,minutes);const span=beginActionActivity(d,engine,'light');engine.advance(d,minutes,eventId);
  if(d.get('state','location')!==row.location||d.get('state','player','status')!=='正常')throw preconditionFailure('散场前已离开或失去行动能力');
  holdingSet(d,engine,path(row.id),{...row,status:'ended',resolvedAt:row.endsAt},'festival');
  return {festival:row.id,endsAt:row.endsAt,watchedUntil:d.get('state','minute'),cost:finishActionActivity(d,engine,span),actionScope:{kind:'festival',clockManaged:true,minutes}};
 }
 throw preconditionFailure('普通灯会不提供祭仪或其他权限');
}
const awake=(engine,state,id,n)=>n&&!isPhysicallyDead(engine,state,id)&&!['濒死','昏迷','患病','睡眠'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
// Only already published village customs are adapted here. The 24 W5 draft
// candidates are never imported and this adapter does not promote customs.
export function localFestivalCalendar(engine){
 return (engine.world.settlementProfiles??[]).flatMap(p=>(p.details?.calendar?.festivals??[]).map((f,i)=>({
  ...f,id:`custom:${p.id}:${i}`,settlement:p.id,source:`world/geo/settlements.json#${p.id}/calendar/${i}`,kind:'local-custom'
 })));
}
const when=(f,year,engine)=>{
 if(!engine?.calendarId)return ((year-1)*360+(f.month-1)*30+f.day-1)*DAY+(f.runtime?.startMinute??720);
 const offset=f.runtime?.startMinute??720;
 try{return minuteForCalendarDate(engine,{calendar:engine.calendarId,year,month:f.month,day:f.day,hour:Math.floor(offset/60),minute:offset%60});}
 catch{return null;} // A short month does not invent a missing festival date.
};
const occurrence=(f,year)=>`festival:${f.id}:${year}`;
// Published runtime contract: active, host, kind (market/ritual), startMinute,
// durationMinutes, minimumParticipants; resourceNeeds use owner='host' or an
// actual actor ID. sourceCustom links the same published local custom. Drafts
// and regional_unmapped venues never enter this executable calendar.
// Registered person of a world: a full NPC, a roster resident, or someone a
// settlement census (settlementProfiles.residentIds) lists although this edition
// does not carry their record (the occurrence then waits until they are present).
const registeredPerson=(world,id)=>world.npcs.some(n=>n.id===id)||(world.residents??[]).some(n=>n.id===id)||(world.settlementProfiles??[]).some(p=>p.residentIds?.includes(id));
// Whether a published festival belongs to this world edition (engine construction
// builds fixtures of earlier editions from the formal catalogue): its venue is one
// of the edition's locations, and a named host is a registered person — or the
// venue's settlement has no census here at all (an edition from before that
// settlement's roster), so nobody can vouch for the host and the festival is
// simply not held. A missing host in a settlement whose census is here is a data
// fault. Release validation (tools/validate-world) reports every dangling reference.
export function editionFestival(world,f){
 const location=world.locations.find(l=>l.id===f.venue?.location);if(!location)return false;
 const host=f.runtime?.host;if(host==null||registeredPerson(world,host))return true;
 return (world.settlementProfiles??[]).some(p=>p.id===(location.scope??location.id));
}
// edition=true (engine construction): festivals outside this edition (editionFestival)
// are left out of festivalCalendar and nothing of them is checked here. A festival
// of the edition must be fully valid, its host a registered person.
export function validateFestivalRuntime(world,{edition=false}={}){
 const errors=[],ids=new Set(),customs=localFestivalCalendar({world}),linked=new Set();
 for(const f of world.festivals??[]){
  if(!f.id||ids.has(f.id))errors.push(`${f.id}:节日编号重复或缺失`);ids.add(f.id);
  if(f.runtime?.status!=='active')continue;
  const r=f.runtime,c=f.calendar,v=f.venue,location=world.locations.find(l=>l.id===v?.location);
  if(edition&&!editionFestival(world,f))continue;
  const registered=id=>registeredPerson(world,id);
  if(!f.id?.startsWith('festival_')||!f.name||!c||!safe(c.month)||c.month<1||c.month>12||!safe(c.day)||c.day<1||c.day>30||
   v?.precision!=='existing_location'||!location||!registered(r.host)||!['market','ritual'].includes(r.kind)||
   !safe(r.startMinute)||!safe(r.durationMinutes)||r.durationMinutes<1||r.startMinute+r.durationMinutes>DAY||
   !safe(r.minimumParticipants)||r.minimumParticipants<1||!Array.isArray(f.resourceNeeds))errors.push(`${f.id}:正式节日日期、场地或运行参数无效`);
  if(r.effects!==undefined&&(!Array.isArray(r.effects)||r.effects.some(e=>typeof e?.kind!=='string')))errors.push(`${f.id}:节日效果须为效果表条目`);
  if(r.riddles!==undefined&&(!Array.isArray(r.riddles)||new Set(r.riddles.map(p=>p.id)).size!==r.riddles.length||r.riddles.some(p=>typeof p.id!=='string'||!p.id||typeof p.question!=='string'||!Array.isArray(p.answers)||!p.answers.length||p.answers.some(a=>typeof a!=='string'||!a.trim())||!world.items.some(i=>i.id===p.reward?.item)||!safe(p.reward?.quantity)||p.reward.quantity<1||p.reward.quantity>100000)))errors.push(`${f.id}:灯谜与实物奖品登记无效`);
  for(const n of f.resourceNeeds??[])if(!world.items.some(i=>i.id===n.item)||!safe(n.quantity)||n.quantity<1||n.quantity>100000||
   !['host','player',...world.npcs.map(p=>p.id)].includes(n.owner))errors.push(`${f.id}:节日材料或物主无效`);
  if(r.sourceCustom){const old=customs.find(x=>x.id===r.sourceCustom);
   if(!old||linked.has(r.sourceCustom)||old.location!==v?.location||old.host!==r.host||old.month!==c?.month||old.day!==c?.day)errors.push(`${f.id}:地方节俗同源引用无效或重复`);
   linked.add(r.sourceCustom);
  }
 }
 return errors;
}
// D1: a festival waiting for a host runs once a far county generated on the
// player's arrival registers a resident host for it at the venue
// (remote-generation festivalHost); the published row itself is unchanged.
function generatedHost(engine,f){
 if(f.runtime?.status!=='awaiting_host')return null;
 return engine.world.npcs.find(n=>n.generated==='remote'&&n.remoteRole==='festival_host'&&n.festivalHost===f.id&&n.location===f.venue?.location)?.id??null;
}
export function festivalCalendar(engine){
 // A festival outside this world edition (editionFestival) is never held.
 const hosted=(engine.world.festivals??[]).filter(f=>editionFestival(engine.world,f)).map(f=>{if(f.runtime?.status==='active')return f;const host=generatedHost(engine,f);return host?{...f,runtime:{...f.runtime,status:'active',host}}:null;}).filter(Boolean);
 const official=hosted.map(f=>({...f,
  id:f.runtime.sourceCustom??f.id,publishedId:f.id,month:f.calendar.month,day:f.calendar.day,host:f.runtime.host,location:f.venue.location,
  settlement:engine.byId.get(f.venue.location)?.scope,source:`world/lore/festivals.json#${f.id}`,kind:f.runtime.kind,practice:f.custom,formal:true}));
 const linked=new Set(official.map(f=>f.id));return [...localFestivalCalendar(engine).filter(f=>!linked.has(f.id)),...official];
}
function custom(engine,id){const f=festivalCalendar(engine).find(f=>f.id===id||f.publishedId===id);if(!f||!f.formal&&f.status!=='custom-only'||!engine.byId.has(f.location)||!engine.world.npcs.some(n=>n.id===f.host))throw preconditionFailure('节俗没有已发布日期、地点与组织者来源；候选节日不可执行');return f;}
// Borrowed or exchanged materials must be held and shown on the day but are
// not used up; only consume (the default) leaves the owner's stock.
const needs=f=>(f.resourceNeeds??[]).map(n=>({item:n.item,quantity:n.quantity,owner:n.owner==='host'?f.host:n.owner,...(n.use&&n.use!=='consume'?{use:n.use}:{})}));
function visibleFestival(f){
 if(!f.runtime?.riddles)return f;
 return {...f,runtime:{...f.runtime,riddles:f.runtime.riddles.map(({answers,...puzzle})=>puzzle)}};
}
const matches=(f,row,engine)=>row.definition===digest(f)&&row.host===f.host&&row.location===f.location&&row.kind===f.kind&&
 row.due===when(f,row.year,engine)&&row.endsAt===row.due+f.runtime?.durationMinutes&&digest(row.resources)===digest(needs(f));
const required=(engine,f,row)=>[...new Set([row.host,...(row.cost?[row.supplier]:[]),...needs(f).map(n=>n.owner),engine.byId.get(row.location)?.owner].filter(Boolean))];
function venueAvailable(engine,state,f){
 const l=engine.byId.get(f.location),hours=l.openHours,offset=(f.runtime?.startMinute??720),end=offset+(f.runtime?.durationMinutes??1);
 return !(state.buildings?.[f.location]?.condition===0)&&!(l.access?.mode==='private'&&!l.owner)&&
  (!hours||hours[0]===hours[1]||(offset>=hours[0]&&end<=hours[1]));
}
function available(engine,state,id,location,at){
 if(id==='player')return state.location===location&&awake(engine,state,'player',state.player);
 return engine.world.npcs.some(n=>n.id===id)&&state.npcs[id]?.location===location&&awake(engine,state,id,state.npcs[id])&&
  !npcObligationAt(state,id,at)&&!npcAutonomyBusy(state,id)&&!state.player.companions?.includes(id);
}
function obligationOverlaps(state,id,start,end){
 return Object.values(state.obligations??{}).some(o=>o?.reservationVersion===1&&['待履行','进行中'].includes(o.status)&&
  (o.deliveryVersion===1?[o.promisor]:[o.promisor,o.promisee]).includes(id)&&
  ! (o.type==='等待'&&o.promisee===id&&(o.attendance?.[id]??0)>0)&&
  Math.max(start,o.departures?.[id]??o.start)<Math.min(end,o.deadline));
}
function scheduledAt(engine,id,minute){
 const npc=engine.byId.get(id),schedule=npc?.schedule;if(!schedule)return null;
 const c=engine.calendar(minute),variant=c.market?'market':schedule.restDays?.includes(c.day)?'rest':'default';
 const seasonal=schedule.seasonal?.[String(c.season)],slots=seasonal?.[variant]??schedule[variant]??seasonal?.default??schedule.default;
 return slots?.find(row=>row.start<=minute%DAY&&minute%DAY<row.end)??null;
}
function local(d,f){if(d.get('state','location')!==f.location)throw preconditionFailure('须在登记节俗场所办理，远方消息不能代替现场同意');}
function agreement(d,row,who){
 const a=row.agreements.find(a=>a.person===who),source=a&&d.get(...path(`festival-source:${a.sourceEvent}`));
 return a&&source?.category==='festival_agreement'&&source.festival===row.id&&digest(source.agreement)===digest(a)&&a.createdAt<row.due&&a.expires>row.due&&a.budget===row.cost&&(!row.formal||a.definition===row.definition);
}
function enrollment(d,row,who){
 if(!row.formal)return row.enrolled.includes(who);
 const a=row.enrollments?.find(a=>a.person===who),source=a&&d.get(...path(`festival-source:${a.sourceEvent}`));
 return a&&source?.category==='festival_consent'&&source.festival===row.id&&digest(source.agreement)===digest(a)&&a.definition===row.definition&&a.createdAt<row.due;
}
export function festivalScheduleAt(engine,state,npcId,minute,slot,constraints=null){
 // W5: a resident host's festival duty follows their current occupation and
 // residence. Only the existing work slot containing the whole ceremony moves;
 // sleep, care, military service and changed livelihoods keep their routines.
 // A schedule pass hands in its record index (personConstraints.festivals), so
 // the occurrence rows are read once instead of rescanning the records per person.
 const npc=engine.byId.get(npcId),own=state?.npcs?.[npcId];
 for(const f of engine.world.festivals??[]){
  const r=f.runtime,duty=r?.hostDuty;if(r?.status!=='active'||r.host!==npcId||!duty||!slot)continue;
  const occupation=own?.occupation??own?.vocation?.name??npc?.occupation;
  const settlement=own?.residence?.settlement??npc?.settlement??npc?.scope,c=engine.calendar(minute);
  if(occupation!==duty.occupation||settlement!==duty.settlement||slot.activity!==occupation||
   c.month!==f.calendar.month||c.day!==f.calendar.day||slot.start>r.startMinute||slot.end<r.startMinute+r.durationMinutes)continue;
  slot={...slot,location:f.venue.location,services:[],production:false,variant:'festival-duty'};
 }
 if(!state||!engine.world.festivals?.length)return slot;
 const d={get:(...p)=>p.slice(1).reduce((x,k)=>x?.[k],state)};
 for(const row of constraints?.festivals??Object.values(state.records??{})){
  if(row.category!=='festival'||!row.formal||!['planned','held'].includes(row.status)||minute>=row.endsAt)continue;
  if(row.status==='planned'){const f=festivalCalendar(engine).find(f=>f.id===row.custom);if(!f?.formal||!matches(f,row,engine))continue;}
  const attending=row.status==='held'?row.participants.includes(npcId)||row.supplier===npcId:
   (row.host===npcId||row.supplier===npcId||enrollment(d,row,npcId))&&agreement(d,row,row.host);
  if(!attending)continue;
  if(minute<row.due){if(slot)slot={...slot,until:Math.min(slot.until,row.due)};continue;}
  if(row.status==='planned'&&(!awake(engine,state,npcId,state.npcs[npcId])||state.npcs[npcId]?.location!==row.location))continue;
  return {start:row.due%DAY,end:row.endsAt%DAY,location:row.location,activity:row.status==='planned'?state.npcs[npcId].activity:`参加${row.name}${row.kind==='market'?'集市':'仪式'}`,
   services:row.kind==='market'&&engine.byId.get(npcId)?.serviceCatalog?.some(s=>s.kind==='trade')?['trade']:[],
   production:false,festival:row.id,until:row.endsAt,variant:'festival'};
 }
 return slot;
}
export function festivalAction(d,args,eventId){
 const now=d.get('state','minute');
 const ordinary=d.get(...path(args.festival));
 if(ordinary?.category==='festival'&&ordinary.ordinary===true&&['festival_answer','festival_watch'].includes(args.operation))return ordinaryFestivalAction(d,this,args,eventId,ordinary);
 if(args.operation==='festival_answer'){
  const row=d.get(...path(args.festival));
  if(row?.category!=='festival'||!row.formal||row.status!=='held'||row.location!==d.get('state','location')||now<row.due||now>=row.endsAt)throw preconditionFailure('这里没有正在举行的正式节庆');
  const f=custom(this,row.custom);if(!matches(f,row,this))throw preconditionFailure('节庆来源与实际举办记录不一致');
  if(!available(this,d.get('state'),row.host,row.location,now))throw preconditionFailure('主办人不在场，无法核对答案并发奖');
  const puzzle=f.runtime.riddles?.find(r=>r.id===args.request);if(!puzzle)throw preconditionFailure('没有这道灯谜');
  const key=`festival-prize:${row.id}:${puzzle.id}:player`;
  if(d.get(...path(key)))throw preconditionFailure('这道灯谜已经领奖');
  if(!puzzle.answers.includes(String(args.choice??'').trim()))return{correct:false,festival:row.id,riddle:puzzle.id};
  transferItems(d,this,row.host,'player',puzzle.reward.item,puzzle.reward.quantity);
  const result={correct:true,festival:row.id,riddle:puzzle.id,host:row.host,reward:puzzle.reward};
  d.set(path(key),{category:'festival_prize',...result,sourceEvent:eventId,minute:now});return result;
 }
 if(args.operation==='festival_watch'){
  const key=`festival-watch:${eventId}`,old=d.get(...path(key));
  if(old){if(old.festival!==args.festival)throw preconditionFailure('同一事件编号不能更换节庆');return {...old.result,duplicate:true};}
  const row=d.get(...path(args.festival));
  if(row?.category!=='festival'||!row.formal||row.status!=='held'||row.location!==d.get('state','location')||!Number.isSafeInteger(row.endsAt)||now<row.due||now>=row.endsAt)throw preconditionFailure('这里没有正在举行的正式节庆');
  const f=custom(this,row.custom);
  if(!matches(f,row,this))throw preconditionFailure('节庆来源与实际举办记录不一致');
  const minutes=row.endsAt-now;assertActionTime(d,this,minutes);
  const span=beginActionActivity(d,this,'light');this.advance(d,minutes,eventId);
  if(d.get('state','location')!==row.location||d.get('state','player','status')!=='正常')throw preconditionFailure('散场前已离开或失去行动能力');
  const result={festival:row.id,endsAt:row.endsAt,watchedUntil:d.get('state','minute'),cost:finishActionActivity(d,this,span),actionScope:{kind:'festival',clockManaged:true,minutes}};
  d.set(path(key),{category:'festival_watch',festival:row.id,result});return result;
 }
 if(args.operation==='festival_inspect'){
  const calendar=festivalCalendar(this).filter(f=>f.location===d.get('state','location')).map(visibleFestival);
  const records=d.get('state','records')??{},ordinary=Object.values(records).filter(r=>r.category==='festival'&&r.ordinary&&r.location===d.get('state','location')).map(r=>{
   const {riddles,...event}=r;return {...event,riddles:riddles.map(({answers,...p})=>({...p,claimed:Boolean(records[`festival-prize:${r.id}:${p.id}:player`])}))};
  });
  return {calendar,events:[...Object.values(records).filter(r=>r.category==='festival'&&calendar.some(f=>f.id===r.custom)),...ordinary],actionScope:{kind:'instant'}};
 }
 if(args.operation==='festival_plan'){
  const f=custom(this,args.festival);local(d,f);
  const year=args.year??this.calendar(now).year;if(!Number.isSafeInteger(year)||year<1)throw preconditionFailure('节俗年份无效');
  const due=when(f,year,this),id=occurrence(f,year);if(due===null||due<=now||due-now>360*DAY)throw preconditionFailure('只能预约未来一年内的实际节俗日期');
  if(f.formal&&!venueAvailable(this,d.get('state'),f))throw preconditionFailure('节日场地不可用或不在开放窗口');
  if(d.get(...path(id)))throw preconditionFailure('该年节俗已有预约或结果，不能重复组织');
  if(args.authorization!==undefined)throw preconditionFailure('现有公账报告授权没有节庆支出权限，不能扣公款');
  const cost=args.cost??0;if(!safe(cost)||cost>1000000)throw preconditionFailure('组织费无效');
  const supplier=cost?this.resolve(args.supplier,'npc'):null;
  if(cost&&(supplier===f.host||!available(this,d.get('state'),supplier,f.location,now)))throw preconditionFailure('收费服务者须为另一个真实在场人物');
  const row={category:'festival',id,custom:f.id,kind:f.kind,name:f.name,source:f.source,settlement:f.settlement,location:f.location,
   host:f.host,year,due,cost,supplier,status:'planned',agreements:[],enrolled:[],participants:[],paidCopper:0,createdAt:now,sourceEvent:eventId,
   ...(f.formal?{formal:true,publishedId:f.publishedId,definition:digest(f),endsAt:due+f.runtime.durationMinutes,resources:needs(f),enrollments:[]}:{} )};
  d.set(path(id),row);return {festival:id,event:row,note:'组织者、物主及收费者须各自明确授权；每位参加者须在场同意，举办时仍核对场地、物资与实际到场。'};
 }
 const row=d.get(...path(args.festival));if(row?.category!=='festival')throw preconditionFailure('没有该节俗预约');
 const f=args.operation==='festival_cancel'?row:custom(this,row.custom);local(d,f);
 if(row.formal&&args.operation!=='festival_cancel'&&!matches(f,row,this))throw preconditionFailure('已授权节日参数变化，须取消原预约');
 if(row.status!=='planned'||now>=row.due)throw preconditionFailure('该节俗已结束，不能改写结果');
 const who=args.speaker==='player'?'player':this.resolve(args.speaker,'npc');
 if(!available(this,d.get('state'),who,f.location,now))throw preconditionFailure('当事人须真实在场且可以行动');
 if(args.operation==='festival_cancel'){
  if(who!==row.host||args.consent!==true)throw preconditionFailure('只有组织者明确同意才可取消');
  const reason=typeof args.content==='string'?args.content.trim():'';if(!reason||reason.length>1200)throw preconditionFailure('取消需要实际原因');
  const ended={...row,status:'cancelled',reason,resolvedAt:now};d.set(path(row.id),ended);return {festival:row.id,event:ended};
 }
 let decision=null;
 if(args.consent!==true&&args.operation==='festival_authorize'&&who!=='player'){
  const items=row.resources.filter(n=>n.owner===who).reduce((sum,n)=>sum+n.quantity*(this.byId.get(n.item)?.basePrice??0),0);
  const prizes=who===row.host?(f.runtime.riddles??[]).reduce((sum,p)=>sum+p.reward.quantity*(this.byId.get(p.reward.item)?.basePrice??0),0):0;
  decision=npcDecision(subjectiveView(this,d.document,who),{kind:'festival',from:'player',cost:{coins:(who===row.host?row.cost:0)+items+prizes,minutes:f.runtime.durationMinutes}});
  if(decision.outcome!=='agree')throw preconditionFailure(`节庆当事人未同意：${decision.reason}`);
 }else if(args.consent!==true)throw preconditionFailure('需要本人明确同意，不为未到场者代答');
 if(args.operation==='festival_authorize'){
  if(!(row.formal?required(this,f,row):[row.host,row.supplier]).includes(who))throw preconditionFailure('只有组织者、物主、场地主与收费服务者可确认');
  if(row.agreements.some(a=>a.person===who))return {festival:row.id,duplicate:true};
  const a={person:who,budget:row.cost,payer:row.host,payee:row.supplier,scope:row.formal?'own-coins-items-and-venue':'own-coins-only',createdAt:now,expires:row.due+1,sourceEvent:eventId,
   ...(row.formal?{definition:row.definition,resources:row.resources.filter(n=>n.owner===who)}:{}),...(decision?{decision}:{})};
  d.set(path(`festival-source:${eventId}`),{category:'festival_agreement',festival:row.id,agreement:a});
  d.set(path(row.id),{...row,agreements:[...row.agreements,a]});return {festival:row.id,agreement:a};
 }
 if(args.operation==='festival_join'){
  if(row.enrolled.includes(who))return {festival:row.id,duplicate:true};
  const a={person:who,definition:row.definition,createdAt:now,sourceEvent:eventId};
  if(row.formal)d.set(path(`festival-source:${eventId}`),{category:'festival_consent',festival:row.id,agreement:a});
  d.set(path(row.id),{...row,enrolled:[...row.enrolled,who],...(row.formal?{enrollments:[...row.enrollments,a]}:{})});return {festival:row.id,participant:who};
 }
 throw preconditionFailure('未知节俗操作');
}
export function nextFestivalMinute(state,engine,now){
 const pending=Object.values(state.records??{}).filter(r=>r.category==='festival'&&r.status==='planned'&&r.due>now).map(r=>r.due);
 const year=engine.calendar(now).year;
 for(const f of festivalCalendar(engine)){const at=when(f,year,engine),next=at!==null&&at>now?at:when(f,year+1,engine);if(next!==null)pending.push(next);}
 for(const r of Object.values(state.records??{}))if(r.category==='festival'&&r.status==='held'&&r.endsAt>now)pending.push(r.endsAt);
 return Math.min(Infinity,...pending);
}
export function advanceFestivals(d,engine,at){
 for(const row of Object.values(d.get('state','records')??{}))if(row.category==='festival'&&row.ordinary&&row.status==='held'&&row.endsAt<=at)
  holdingSet(d,engine,path(row.id),{...row,status:'ended',resolvedAt:row.endsAt},'festival');
 const year=engine.calendar(at).year;
 const calendar=festivalCalendar(engine);
 for(const old of Object.values(d.get('state','records')??{}))if(old.category==='festival'&&old.status==='planned'&&old.due===at&&!calendar.some(f=>f.id===old.custom)){
  d.set(path(old.id),{...old,status:'unavailable',reason:'已预约节日不再有正式运行来源',resolvedAt:at,resultEvent:`festival-result:${old.id}`});
 }
 for(const f of calendar){
  const state=d.get('state');
  if(when(f,year,engine)!==at)continue;
  const id=occurrence(f,year),old=d.get(...path(id));if(old&&old.status!=='planned')continue;
  const row=old??{category:'festival',id,custom:f.id,kind:f.kind,name:f.name,source:f.source,settlement:f.settlement,location:f.location,host:f.host,year,due:at,cost:0,participants:[],paidCopper:0};
  let reason=null,status='held',participants=[];
  if(!old){status='not-scheduled';reason='只有当地节俗日期，没有组织与费用授权';}
  else if(f.formal&&!row.formal||row.formal&&(!f.formal||!matches(f,row,engine)||!venueAvailable(engine,state,f))){status='unavailable';reason='已授权节日参数变化或场地不可用';}
  else if(!(row.formal?required(engine,f,row):[row.host,...(row.cost?[row.supplier]:[])]).every(who=>agreement(d,row,who))){status='unauthorized';reason='组织、材料、场地或收费授权缺失、到期或来源不成立';}
  else if(!available(engine,state,row.host,row.location,at)||row.cost&&!available(engine,state,row.supplier,row.location,at)){status='unavailable';reason='组织者或收费服务者未实际到场或正忙';}
  else{
   participants=row.enrolled.filter(id=>id!==row.host&&id!==row.supplier&&enrollment(d,row,id)&&available(engine,state,id,row.location,at)&&
    (!row.formal||!obligationOverlaps(state,id,at,at+f.runtime.durationMinutes)&&(!scheduledAt(engine,id,at)||scheduledAt(engine,id,at).location===row.location)));
   if(participants.length<(f.runtime?.minimumParticipants??1)){status='no-attendance';reason='没有足够已同意且实际到场的参加者';}
   else if(!safe(state.npcs[row.host]?.coins)||state.npcs[row.host].coins<row.cost){status='insufficient-funds';reason='组织者自有现金不足，不动公共粮钱或补造库存';}
   else if(row.cost&&!safe(state.npcs[row.supplier]?.coins)){status='unavailable';reason='收费者现金账未知';}
   else if(row.formal){
    const totals=new Map();for(const n of row.resources){const key=`${n.owner}:${n.item}`;totals.set(key,{...n,quantity:(totals.get(key)?.quantity??0)+n.quantity});}
    if([...totals.values()].some(n=>!available(engine,state,n.owner,row.location,at)||!['player',row.host,row.supplier,...participants].includes(n.owner)||engine.quantity(d,n.owner,n.item)<n.quantity)){
     status='insufficient-resources';reason='已同意物主未到场或实际材料不足，不补造库存';
    }else try{
     const actors=[row.host,...participants,...(row.supplier?[row.supplier]:[])];
     engine.assertNpcObligationAction(d,actors,{start:at,minutes:f.runtime.durationMinutes,location:row.location});
     engine.assertNpcAutonomyAction(state,actors,{start:at,minutes:f.runtime.durationMinutes});
    }catch{status='unavailable';reason='参加者在活动窗口已有义务或工作';}
   }
  }
  const consumed=[];
  if(status==='held'&&row.formal)for(const n of row.resources.filter(n=>!n.use)){const result=changeItems(d,engine,n.owner,n.item,-n.quantity,{books:{flow:'sink:consume',purpose:'festival',writer:'festival',eventId:`festival-result:${id}`}});consumed.push({...n,...result});}
  const done={...row,status,reason,participants:status==='held'?[row.host,...participants]:[],paidCopper:status==='held'?row.cost:0,resolvedAt:at,resultEvent:`festival-result:${id}`,...(row.formal?{consumed}:{})};
  // K6: a held festival applies its published runtime effects and any effect-table
  // hooks as one transaction; festivals without effects keep their exact record.
  const festivalEffects=status==='held'?[...f.runtime?.effects??[],...hookedEffects(engine,'festival',f.publishedId??f.id)]:[];
  if(festivalEffects.length){
   const receipt=applyEffects(d,engine,festivalEffects,{settlement:f.settlement,faction:null,minute:at,sourceEvent:done.resultEvent},'festival');
   done.effects=receipt.applied?receipt.effects:[];if(!receipt.applied)done.effectsBlocked=receipt.reason??'效果条件未满足';
  }
  if(done.paidCopper){
   moveCoins(d,{from:purse(null,row.host),to:purse(null,row.supplier),amount:row.cost,writer:'festival',eventId:null});
   d.set(['state','npcs',row.host,'coins'],state.npcs[row.host].coins-row.cost);
   d.set(['state','npcs',row.supplier,'coins'],state.npcs[row.supplier].coins+row.cost);
  }
  d.set(path(id),done);
  if(status==='held'){
   if(row.formal)for(const person of [...done.participants,row.supplier].filter(id=>id&&id!=='player'&&engine.byId.get(id)?.schedule))
    d.set(['state','npcs',person,'activity'],`参加${row.name}${row.kind==='market'?'集市':'仪式'}`);
   recordFestivalRelations(d,engine,done);
   for(const person of done.participants.filter(id=>id!=='player'&&engine.byId.get(id)?.tier==='full')){
    const stream=d.get('state','npcs',person,'memoryStream')??[];
    if(!stream.some(m=>m.id===done.resultEvent))d.set(['state','npcs',person,'memoryStream'],[...stream,{
     id:done.resultEvent,sourceEvent:done.resultEvent,kind:'festival',minute:at,location:row.location,participants:done.participants,
     sourceType:'亲历',content:`参加${row.name}的当地节俗活动。${f.practice}`,salience:3
    }]);
   }
  }
 }
}
export function festivalScene(engine,document){
 const ordinary=Object.values(document.state.records??{}).filter(r=>r.category==='festival'&&r.ordinary&&r.location===document.state.location&&r.due<=document.state.minute)
  .map(r=>`${r.name}：${document.state.minute<r.endsAt?`正在举行，${engine.calendar(r.endsAt).text}散场。${r.riddles.map(p=>`灯谜${p.id}：${p.question}`).join('；')}`:'已散场。'}`);
 return [...ordinary,...Object.values(document.state.records??{}).filter(r=>r.category==='festival'&&!r.ordinary&&r.location===document.state.location&&r.resolvedAt<=document.state.minute)
  .sort((a,b)=>b.resolvedAt-a.resolvedAt).slice(0,3).map(r=>`${engine.calendar(r.due).text} ${r.name}：${r.status==='held'?'已举行当地节俗活动':r.reason}。`)].join('\n');
}
