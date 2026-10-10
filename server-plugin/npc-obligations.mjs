import {scheduleAt,advanceNpcSchedules} from './npc-schedule.mjs';

const live=o=>o?.reservationVersion===1&&['待履行','进行中'].includes(o.status);
const full=(engine,id)=>engine.byId.get(id)?.tier==='full';
const capable=row=>row&&!['死亡','濒死','昏迷','患病'].includes(row.status);
const integer=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${label}必须在${min}到${max}之间`);return n;};
const parties=o=>[o.promisor,o.promisee];
const released=(o,id)=>o.type==='等候'&&o.promisee===id&&o.attendance?.[id]>0;
const locationOf=(state,id)=>id==='player'?state.location:state.npcs[id]?.location;
export function npcObligationAt(state,id,minute=state.minute){
 return Object.values(state.obligations??{}).filter(live).filter(o=>parties(o).includes(id)&&!released(o,id)&&(o.departures[id]??o.start)<=minute&&minute<o.deadline).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id))[0]??null;
}
export function assertNpcObligationAction(d,engine,actors,{start=d.get('state','minute'),minutes=0,location,kind='action'}={}){
 if(kind==='wait'||kind==='meeting')return;
 const finish=start+minutes;
 for(const o of Object.values(d.get('state','obligations')??{}).filter(live))for(const actor of actors){
  if(!parties(o).includes(actor))continue;
  if(released(o,actor))continue;
  const arriving=kind==='move'&&location===o.location&&(o.type==='等候'&&actor===o.promisee?finish<o.deadline:finish<=o.start);
  if(arriving)continue;
  const begin=o.departures[actor]??o.start;
  if(start<o.deadline&&(minutes?finish>begin:start>=begin))throw new Error(`与${o.id}的${o.type}时段冲突；需先取消约定`);
  if(kind==='move'&&finish<=begin&&location&&location!==o.location){
   let route;try{route=engine.route(location,o.location,'walk',finish,d.document.randomSeed);}catch{throw new Error('行程结束后无法赶赴约定地点');}
   if(finish+route.minutes>o.start)throw new Error('行程结束后无法按时赴约');
  }
 }
}
export function createNpcObligation(d,engine,args,eventId){
 if(args.operation==='cancel'){
  const old=d.get('state','obligations',args.obligation);if(!live(old))throw new Error('需要尚有效的等候或会面约定');
  const actor=engine.resolve(args.actor??'player');if(!parties(old).includes(actor))throw new Error('只有约定当事人能取消');
  const now=d.get('state','minute'),begun=now>=old.start;
  const obligation={...old,status:begun?'违约':'取消',reason:begun?'约定开始后单方取消':'当事人提前取消',resolvedAt:now,breachedBy:begun?[actor]:[],cancelledBy:actor};
  d.set(['state','obligations',old.id],obligation);return {obligation};
 }
 if(!['等候','会面'].includes(args.type))return null;
 const promisor=engine.resolve(args.promisor),promisee=engine.resolve(args.promisee??'player');
 if(![promisor,promisee].some(id=>full(engine,id)))return null;
 if(promisor===promisee)throw new Error('不能向自己登记会面约定');
 const state=d.get('state'),now=state.minute,start=integer(args.start??now,now,now+30*1440,'开始时间');
 const deadline=integer(args.deadline??start+(args.minutes??30),start+1,start+1440,'结束时间');
 const location=engine.resolve(args.location??args.destination??state.location);
 if(!engine.world.locations.some(row=>row.id===location))throw new Error('约定地点必须是正式地点');
 if(typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw new Error('约定内容为空或过长');
 const departures={};
 for(const actor of [promisor,promisee]){
  const row=engine.actor(d,actor);if(!capable(row)||/(睡眠|熟睡|睡觉)/.test(row.activity??''))throw new Error('义务当事人无法清醒履约');
  if(actor!=='player'&&(row.scheduleTravel||state.player.companions?.includes(actor)))throw new Error('在途或同行人物不能另占会面时段');
  const from=locationOf(state,actor);if(!from)throw new Error('当事人没有可用的出发地点');
  const route=from===location?{minutes:0,cost:0}:engine.route(from,location,'walk',now,d.document.randomSeed);
  if(now+route.minutes>start)throw new Error('剩余时间不足以按真实路线赴约');
  if(row.coins<route.cost)throw new Error('赴约路费不足');
  departures[actor]=start-route.minutes;
  for(const o of Object.values(state.obligations??{})){
   if(['待履行','进行中'].includes(o.status)&&o.type==='带路'&&parties(o).includes(actor))throw new Error('已有带路承诺，不能另占会面时段');
   if(live(o)&&parties(o).includes(actor)&&departures[actor]<o.deadline&&deadline>(o.departures[actor]??o.start))throw new Error('约定时间或赶路时段冲突');
  }
 }
 if(locationOf(state,promisor)!==locationOf(state,promisee))throw new Error('登记约定时双方必须实际在同一地点');
 const id=`obl_${eventId}`;if(state.obligations?.[id])throw new Error('义务编号已存在');
 const obligation={id,reservationVersion:1,type:args.type,promisor,promisee,content:args.content.trim(),location,start,deadline,departures,createdAt:now,
  status:start===now?'进行中':'待履行',attendance:{[promisor]:0,[promisee]:0},togetherMinutes:0};
 d.set(['state','obligations',id],obligation);return {obligation};
}

// A reserved actor follows the same route/coin rules as the routine scheduler.
// Record occupied intervals so an endpoint or a trip never counts as attendance.
function simulateNpc(d,engine,id,before,after,bookings){
 const old=d.get('state','npcs',id),npc=structuredClone(old),segments=[];let t=before;
 const add=(end,available=true)=>{if(end>t)segments.push({start:t,end,location:npc.location,available});t=end;};
 const visited=o=>(o.attendance[id]??0)+segments.filter(s=>s.available&&s.location===o.location).reduce((n,s)=>n+Math.max(0,Math.min(s.end,o.deadline)-Math.max(s.start,o.start)),0)>0;
 while(t<=after){
  if(!capable(npc)){npc.activity=npc.status;add(after,false);break;}
  if(d.get('state','player','companions')?.includes(id)){npc.activity='同行';add(after,false);break;}
  if(npc.scheduleTravel){const trip=npc.scheduleTravel;
   if(trip.arrive>after){add(after,false);break;}
   add(Math.max(t,trip.arrive),false);npc.location=trip.to;delete npc.scheduleTravel;continue;
  }
  const pending=bookings.filter(o=>!(o.type==='等候'&&o.promisee===id&&visited(o)));
  const active=pending.find(o=>(o.departures[id]??o.start)<=t&&t<o.deadline);
  const upcoming=pending.map(o=>o.departures[id]??o.start).filter(n=>n>t);
  const slot=active?{location:active.location,activity:active.type,until:active.deadline}:scheduleAt(engine,id,t);
  if(!slot){add(after);break;}
  const visitEnd=active?.type==='等候'&&active.promisee===id?Math.max(t,active.start)+1:Infinity;
  const end=Math.min(after,slot.until,visitEnd,...upcoming);
  if(npc.location!==slot.location){
   let route;try{route=engine.route(npc.location,slot.location,'walk',t,d.document.randomSeed);}catch{npc.activity='行程受阻';}
   if(route&&npc.coins<route.cost){route=null;npc.activity='路费不足，暂留原处';}
   if(route){npc.coins-=route.cost;npc.scheduleTravel={from:npc.location,to:slot.location,depart:t,arrive:t+route.minutes,edges:route.edges};npc.location=null;npc.activity='赶路';continue;}
   if(end<=t)break;add(end,false);
  }else{npc.activity=slot.activity;if(end<=t)break;add(end,!/(睡眠|熟睡|睡觉)/.test(npc.activity));}
 }
 for(const key of ['location','activity','coins','scheduleTravel'])if(JSON.stringify(old[key])!==JSON.stringify(npc[key])){
  if(npc[key]===undefined)d.remove(['state','npcs',id,key]);else d.set(['state','npcs',id,key],npc[key]);
 }
 return segments;
}
export function advanceNpcObligations(d,engine,before,after,eventId){
 before=Math.max(before,d.get('state','npcObligationClock')??before);
 if(after<=before)return;
 const state=d.get('state'),bookings=Object.values(state.obligations??{}).filter(live).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
 if(!bookings.length){if(state.npcObligationClock!==undefined)d.set(['state','npcObligationClock'],after);advanceNpcSchedules(d,engine,before,after);return;}
 d.set(['state','npcObligationClock'],after);
 const ids=new Set(bookings.flatMap(parties).filter(id=>id!=='player'));
 const previous=engine.npcScheduleReservations;engine.npcScheduleReservations=new Set([...previous??[],...ids]);
 try{advanceNpcSchedules(d,engine,before,after);}finally{engine.npcScheduleReservations=previous;}
 const occupied=new Map(),action=engine.npcObligationAction;
 const playerAvailable=capable(state.player)&&action?.tool!=='move'&&!['睡眠','休息'].includes(action?.args?.activity)&&(!action||['time','turn'].includes(action.tool));
 occupied.set('player',[{start:before,end:after,location:state.location,available:playerAvailable}]);
 for(const id of ids){
  if(previous?.has(id))occupied.set(id,[{start:before,end:after,location:state.npcs[id]?.location,available:false}]);
  else occupied.set(id,simulateNpc(d,engine,id,before,after,bookings.filter(o=>parties(o).includes(id))));
 }
 const span=(segment,o)=>segment.available&&segment.location===o.location?Math.max(0,Math.min(segment.end,o.deadline)-Math.max(segment.start,o.start)):0;
 for(const old of bookings){
  const o=structuredClone(old),people=parties(o);if(after<o.start)continue;
  o.status='进行中';
  for(const actor of people)o.attendance[actor]+=(occupied.get(actor)??[]).reduce((n,s)=>n+span(s,o),0);
  for(const a of occupied.get(o.promisor)??[])for(const b of occupied.get(o.promisee)??[]){
   if(a.available&&b.available&&a.location===o.location&&b.location===o.location)o.togetherMinutes+=Math.max(0,Math.min(a.end,b.end,o.deadline)-Math.max(a.start,b.start,o.start));
  }
  if(after>=o.deadline){
   const duration=o.deadline-o.start;
   o.keptBy=people.filter(actor=>o.attendance[actor]>=duration);
   o.breachedBy=people.filter(actor=>!o.keptBy.includes(actor));
   // Waiting promises require the promisor to stay; the other party may arrive
   // anywhere inside the agreed window, but absence is explicitly remembered.
   if(o.type==='等候'&&o.attendance[o.promisee]>0){o.breachedBy=o.breachedBy.filter(id=>id!==o.promisee);if(!o.keptBy.includes(o.promisee))o.keptBy.push(o.promisee);}
   o.status=o.breachedBy.length?'违约':'已完成';o.resolvedAt=o.deadline;
   o.reason=o.status==='违约'?'当事人未在约定地点完成约定占时':'按约定地点和时段履行';
  }
  d.set(['state','obligations',o.id],o);
 }
}
