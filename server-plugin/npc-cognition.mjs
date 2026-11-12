import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {sink} from './money.mjs';
import {npcCanPay,payFromNpc} from './npc-payment.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('npc-cognition',{sinks:['sink:export']});
import {advanceMagicMessages,nextMagicMessageMinute}from'./magic-message.mjs';
import {memoryBlurMinute}from'./npc-memory.mjs';
import {PatchCursor,cloneData,digest} from './storage.mjs';
import {advanceNpcSchedules} from './npc-schedule.mjs';
import {waterEarthHeldUntil}from'./magic-water-earth.mjs';
import {relationView} from './npc-relations.mjs';
import {assertNpcObligationAction} from './npc-obligations.mjs';
import {observeLegalReputation} from './reputation.mjs';
import {npcRumorSeeds,rumorChainView} from './npc-rumors.mjs';
import {personSimulation,personConstraint}from'./entity-view.mjs';
import {transportServices,quoteTransport} from './transport.mjs';
import {sendPost} from './post.mjs';
import {installFacilityRuntime} from './facility-state.mjs';
installFacilityRuntime({shareMaintenanceMemory:shareNpcMemory});

const DAY=1440,clone=value=>cloneData(value); // P2: same result as structuredClone, faster
const awake=(engine,state,id,n)=>n&&n.location&&!n.scheduleTravel&&!n.cognitionTravel&&!isPhysicallyDead(engine,state,id)&&!['濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const key=(...parts)=>digest(parts).slice(0,24);
const relation=(engine,state,from,to)=>state.npcs[from]?.relationships?.[to]||engine.byId.get(from)?.relationships?.some(r=>r.with===to)?relationView(engine,state,from,to):null;
const originalId=row=>row.rootMemoryId??row.id;
const known=(engine,state,id,memory)=>state.npcs[id]?.memoryStream?.some(row=>originalId(row)===originalId(memory))||memory.kind==='rumor'&&npcRumorSeeds(engine,id).some(row=>originalId(row)===originalId(memory));
export function permitted(memory,to){
 const privateFact=memory.private===true||memory.visibility==='private'||memory.visibility==='secret'||['secret','debt','obligation','quest'].includes(memory.kind)||memory.sourceType==='约定核对';
 return !privateFact||(memory.permittedRecipients??memory.knownBy??[]).includes(to);
}
export function memoryFor(engine,state,from,id,at){
 const row=state.npcs[from]?.memoryStream?.find(x=>x.id===id)??npcRumorSeeds(engine,from).find(x=>x.id===id);
 if(!row||row.minute>at||!['亲历','目击','听说','约定核对'].includes(row.sourceType))throw preconditionFailure('传话者没有这条已发生的个人记忆');
 return row;
}
function retell(engine,state,from,memory){
 const forgotten=state.npcs[from]?.cognition?.blurred?.[memory.id];
 const text=forgotten?.content??memory.content,base=engine.byId.get(from),flaws=(base?.personality?.flaws??[]).join('');
 const hops=(memory.transmissionChain?.length??0)+1;
 const omit=hops>=2||/夸|急|偏|先下判断/.test(flaws);
 return {input:text,content:omit?`听来的大意：${text.replace(/[0-9]+(?:\.\d+)?(?:铜|份|件|分钟)/g,'若干')}`:`转述：${text}`,distortion:omit?'省略数量，需核实':'保留来源的转述',hops};
}
export function appendHeard(d,engine,from,to,memory,minute,channel,messageId,location=d.get('state','npcs',to,'location'),version=null){
 if(known(engine,d.get('state'),to,memory))return false;
 const told=version??retell(engine,d.get('state'),from,memory),row={id:`heard_${key(originalId(memory),to)}`,rootMemoryId:originalId(memory),sourceEvent:memory.sourceEvent,
  kind:memory.kind,minute,occurredAt:memory.occurredAt??memory.minute,location,participants:clone(memory.participants??[]),
  content:told.content,sourceType:'听说',heardFrom:from,channel,messageId,salience:memory.kind==='rumor'?2:Math.max(1,(memory.salience??2)-1),emotion:'待核实',
  transmissionChain:[...memory.transmissionChain??[],{from,to,minute,channel,messageId,input:told.input,content:told.content,distortion:told.distortion}],distortion:told.distortion,reliability:'未经亲历核实',
  ...(memory.rumor?{rumor:memory.rumor,rumorSource:memory.rumorSource,...(memory.eventRumor?{eventRumor:true}:{})}:{}),
  ...(memory.legalCase?{legalCase:memory.legalCase,legalStage:memory.legalStage}:{}),
  ...(memory.entities?{entities:clone(memory.entities)}:{}),...(memory.visibility?{visibility:memory.visibility}:{}),...(memory.private?{private:true}:{}),...(memory.permittedRecipients?{permittedRecipients:clone(memory.permittedRecipients)}:{}),...(memory.knownBy?{knownBy:clone(memory.knownBy)}:{})};
 d.set(['state','npcs',to,'memoryStream'],[...d.get('state','npcs',to,'memoryStream')??[],row]);
 observeLegalReputation(d,engine,to,row,location);return true;
}
// Used only on an immutable interval-start snapshot. Obligations are checked by
// callers; actors carrying messages or following the player are not simulated.
export function npcPresenceAt(engine,state,before,minute,randomSeed){
 const cursor=new PatchCursor({state,randomSeed});
 const d={cursor,get document(){return cursor.expose(cursor.root);},get:(...p)=>cursor.expose(p.reduce((x,k)=>x?.[k],cursor.root)),peek:(...p)=>p.reduce((x,k)=>x?.[k],cursor.root),set:(p,v)=>cursor.apply({op:'set',path:p,value:v}),remove:p=>cursor.apply({op:'delete',path:p})};
 if(minute>before)advanceNpcSchedules(d,Object.assign(Object.create(engine),{educationAttendance:null}),before,minute);
 return cursor.root.state;
}
function working(state,id,start,end){return Object.values(state.npcAutonomy?.tasks??{}).some(t=>t.status==='进行中'&&[t.npc,t.action.seller].includes(id)&&start<t.finish&&end>t.start);}
function occupied(state,id,start,end){return state.player.companions?.includes(id)||state.npcs[id]?.cognitionTravel||working(state,id,start,end)||Object.values(state.obligations??{}).some(o=>
 [o.promisor,o.promisee].includes(id)&&!['已完成','违约','取消'].includes(o.status)&&Math.max(o.departures?.[id]??o.starts??o.start??o.due??0,start)<Math.min(o.deadline??o.ends??o.end??o.due??Number.MAX_SAFE_INTEGER,end));}

export function shareNpcMemory(d,engine,{from,to,memoryId,channel='conversation',eventId}){
 const state=d.get('state'),at=state.minute,a=state.npcs[from],b=state.npcs[to];
 if(working(state,from,at,at+1)||channel==='conversation'&&working(state,to,at,at+1))throw preconditionFailure('人物正在完成已经开始的自主工作');
 if(from===to||!a||!b||!personSimulation(engine,state,to).value||!awake(engine,state,from,a)||personConstraint(engine,state,from))throw preconditionFailure('传话双方须是可行动的已登记人物');
 if(!relation(engine,state,from,to)||(relation(engine,state,from,to).trust??0)<0)throw preconditionFailure('没有可传话的人物关系渠道');
 const memory=memoryFor(engine,state,from,memoryId,at);if(!permitted(memory,to))throw preconditionFailure('这条私密记忆没有向收件人披露的渠道');
 if(known(engine,state,to,memory))return {duplicate:true};
 const messageId=`message_${key(originalId(memory),from,to,channel)}`;
 if(channel==='conversation'){
  assertNpcObligationAction(d,engine,[from,to],{start:at,minutes:0,location:a.location,kind:'conversation'});
  if(!awake(engine,state,to,b)||a.location!==b.location)throw preconditionFailure('当面转述需要同一地点且双方清醒');
  appendHeard(d,engine,from,to,memory,at,'conversation',messageId);return {messageId,delivered:true,minute:at};
 }
 if(channel!=='carry')throw preconditionFailure('未登记的消息渠道');
 // NPCs purchase an available carrier before taking the letter themselves.
 // The ordinary walking path remains available when no paid service can run.
 if(b.location&&a.location!==b.location){
  const existing=state.records?.[`post:${messageId}`];if(existing)return {duplicate:true,messageId:existing.id};
  for(const service of transportServices(engine,d.document,a.location).filter(s=>s.driver!==from)){
   let quote;try{quote=quoteTransport(d,engine,{asset:service.asset,from:a.location,to:b.location,departAt:service.nextDeparture});}catch(error){if(!error.message.startsWith('没有当前季节'))throw error;continue;}
   if(a.coins<quote.total)continue;
   const posted=sendPost(d,engine,{from,to,memoryId,legs:[{asset:service.asset,to:b.location}],receipt:false},messageId);
   return {messageId:posted.id,delivered:false,arrive:posted.estimatedArrivalAt,channel:'post'};
  }
 }
 if(waterEarthHeldUntil(state,from,at)>at)throw preconditionFailure('水绳束缚期间不能携信离开');
 if(occupied(state,from,at,at+1))throw preconditionFailure('携信者正受同行或义务占用');
 if(!b.location)throw preconditionFailure('收件人正在途中，没有可确认的投递地址');
 const messages=state.npcCognition?.messages??{};if(messages[messageId])return {duplicate:true,messageId};
 const route=engine.route(a.location,b.location,'walk',at,d.get('randomSeed'));
 assertNpcObligationAction(d,engine,[from],{start:at,minutes:route.minutes,location:b.location,kind:'move'});
 if(!npcCanPay(d,engine,from,route.cost,a.coins))throw preconditionFailure('携信者路费不足');
 if(occupied(state,from,at,at+route.minutes+1))throw preconditionFailure('携信路线与既有义务冲突');
 const trip={from:a.location,to:b.location,depart:at,arrive:at+route.minutes,edges:route.edges,messageId};
 payFromNpc(d,engine,{payer:from,to:sink('export','travel'),amount:route.cost,writer:'npc-cognition',eventId:eventId});d.set(['state','npcs',from,'coins'],d.get('state','npcs',from,'coins')-route.cost);d.set(['state','npcs',from,'cognitionTravel'],trip);d.set(['state','npcs',from,'location'],null);d.set(['state','npcs',from,'activity'],'携信赶路');
 d.set(['state','npcCognition','messages',messageId],{id:messageId,from,to,memoryId,rootMemoryId:originalId(memory),channel,depart:at,arrive:trip.arrive,destination:b.location,status:'在途',sourceEvent:eventId,routeCost:route.cost,
  memory:clone(memory),version:retell(engine,state,from,memory),routeEdges:clone(route.edges),origin:a.location});
 return {messageId,delivered:false,arrive:trip.arrive,routeCost:route.cost};
}

export function settleNpcReflection(d,engine,npcId,now){
 const npc=d.get('state','npcs',npcId),old=npc.cognition??{},stream=npc.memoryStream??[];
 if(!stream.length&&old.blurred&&old.reflections)return;
 // Non-player memories only depend on their blur deadlines and memory guards.
 // Player evidence (including debts) keeps the complete live obligation read.
 const scope=engine.scheduleReadCache,prior=scope?.reflections?.get(npcId);
 const effects=typeof d.peek==='function'?d.peek('state','effects'):d.get('state','effects');
 const guarded=Object.values(effects??{}).some(e=>e.kind==='mind_space'&&e.operation==='memory_guard'&&e.target===npcId);
 if(!guarded&&prior?.old===old&&prior.stream===stream&&now>=prior.minute&&now<prior.until)return;
 const cacheable=scope&&!guarded&&!stream.some(row=>row.participants?.includes('player'));
 // Most clock ticks neither blur a memory nor add a reflection. Delay the
 // copy until a real change; old cognition and the evidence stream stay read-only.
 let next=old;
 const edit=()=>{if(next===old)next=clone(old);return next;};
 if(next.blurred==null)edit().blurred={};
 if(next.reflections==null)edit().reflections=[];
 for(const memory of stream){
  const ttl=({1:7,2:30,3:90})[memory.salience];if(!ttl||now<memoryBlurMinute(d,npcId,memory,ttl,now)||next.blurred[memory.id])continue;
  edit().blurred[memory.id]={minute:memory.minute+ttl*DAY,content:`记得${memory.kind==='trade'?'曾有财物往来':memory.kind==='learn'?'曾有学习经历':'曾发生过一件事'}，细节已经模糊。`};
 }
 const player=stream.filter(row=>row.participants?.includes('player')&&row.minute<=now&&['亲历','目击','约定核对'].includes(row.sourceType));
 const payments=player.filter(row=>['trade','debt'].includes(row.kind)&&(row.payer===undefined||row.payer==='player')&&/支付|偿还/.test(row.content)),breaches=player.filter(row=>/违约|逾期|偷取/.test(row.content));
 if(payments.length>=3){
  const latest=payments.at(-1),bad=breaches.at(-1);
  const state=d.get('state'),unpaid=obligationRows(state).filter(r=>r.debtor==='player'&&r.creditor===npcId&&obligationView(state,r,now).overdueCount>0).map(r=>[r.id,r]);
  const caution=Boolean(bad||unpaid.length),evidence=[...new Set([...(bad?[...payments.slice(-3),bad]:payments.slice(-3)).map(row=>row.id),...unpaid.map(([id])=>id)])];
  const reflection={id:`reflection_${key(npcId,evidence)}`,minute:Math.max(bad?.minute??0,latest.minute,...unpaid.map(([,r])=>r.overdueAt??r.deadline)),about:'player',content:caution?'近期付款没有抹去失信经历或未清欠款，我仍怀疑他能否按约付清。':'几次付款都实际发生，我对他按约结款比较放心。',sourceType:'反思',certainty:'个人判断，可被新证据推翻',evidence};
  if(!next.reflections.some(row=>row.id===reflection.id))edit().reflections.push(reflection);
 }
 if(next!==old&&JSON.stringify(old)!==JSON.stringify(next))d.set(['state','npcs',npcId,'cognition'],next);
 if(cacheable){
  const current=typeof d.peek==='function'?d.peek('state','npcs',npcId):d.get('state','npcs',npcId);
  let until=Infinity;
  for(const memory of stream){const ttl=({1:7,2:30,3:90})[memory.salience];if(ttl&&!next.blurred[memory.id])until=Math.min(until,memory.minute+ttl*DAY);}
  (scope.reflections??=new Map()).set(npcId,{old:current.cognition,stream:current.memoryStream,minute:now,until});
 }
}

export function advanceNpcCognition(d,engine,before,after,eventId,{beforeState}={}){
 if(after<=before)return {delivered:0,shared:0};let delivered=advanceMagicMessages(d,engine,before,after),shared=0;
 for(const message of Object.values(d.get('state','npcCognition','messages')??{}).sort((a,b)=>a.arrive-b.arrive||a.id.localeCompare(b.id))){
  if(message.channel==='magic'||!['在途','待交付'].includes(message.status)||message.arrive>after)continue;
  // Arrival is checked at its real boundary; a missed recipient is sought at
  // fixed quarter-hours, independent of how a player splits wait commands.
  if(message.status==='待交付'&&after%15!==0)continue;
  const carrier=d.get('state','npcs',message.from),trip=carrier?.cognitionTravel;
  if(trip?.messageId===message.id&&(isPhysicallyDead(engine,d.get('state'),message.from)||['濒死','昏迷','患病'].includes(carrier.status)||personConstraint(engine,d.get('state'),message.from))){
   d.set(['state','npcCognition','messages',message.id,'status'],'中止');d.set(['state','npcCognition','messages',message.id,'reason'],`携信者${carrier.status}，未抵达`);
   d.set(['state','npcs',message.from,'interruptedTravel'],{...trip,interruptedAt:after});d.remove(['state','npcs',message.from,'cognitionTravel']);continue;
  }
  if(trip?.messageId===message.id){d.set(['state','npcs',message.from,'location'],trip.to);d.remove(['state','npcs',message.from,'cognitionTravel']);d.set(['state','npcs',message.from,'activity'],'等待交付消息');d.set(['state','npcCognition','messages',message.id,'status'],'待交付');}
  const a=d.get('state','npcs',message.from),b=d.get('state','npcs',message.to);
  const current=a?.memoryStream?.find(row=>row.id===message.memoryId)??npcRumorSeeds(engine,message.from).find(row=>row.id===message.memoryId);
  if(!current||!permitted(current,message.to))continue;
  const memory=message.memory??current;
  if(awake(engine,d.get('state'),message.from,a)&&awake(engine,d.get('state'),message.to,b)&&a.location===b.location){
   appendHeard(d,engine,message.from,message.to,memory,after,'carry',message.id,b.location,message.version);d.set(['state','npcCognition','messages',message.id,'status'],'已交付');d.set(['state','npcCognition','messages',message.id,'deliveredAt'],after);delivered++;
  }
 }
 if(beforeState)for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
  const at=day*DAY+600;if(at<=before||at>after)continue;
  const presence=at===after?d.get('state'):npcPresenceAt(engine,beforeState,before,at,d.get('randomSeed'));
  const sourceStreams=d.get('state','npcs');
  for(const from of Object.keys(presence.npcs).sort()){
   if(!awake(engine,presence,from,presence.npcs[from])||occupied(beforeState,from,at,at+1))continue;
   const relations=(engine.byId.get(from)?.relationships??[]).filter(r=>(relation(engine,d.get('state'),from,r.with)?.trust??0)>=20).slice(0,3);
   const memories=(sourceStreams[from]?.memoryStream??[]).filter(m=>m.minute<=at&&m.salience>=2&&at-m.minute<=30*DAY).slice(-3);
   for(const rel of relations){const to=rel.with;if(!awake(engine,presence,to,presence.npcs[to])||presence.npcs[from].location!==presence.npcs[to].location||occupied(beforeState,to,at,at+1))continue;
    for(const memory of memories){if(!permitted(memory,to)||known(engine,d.get('state'),to,memory))continue;if(appendHeard(d,engine,from,to,memory,at,'conversation',`message_${key(originalId(memory),from,to,'conversation')}`,presence.npcs[to].location))shared++;}
   }
  }
 }
 // This selector returns a scalar projection and retains no state reference.
 // Reading it must not expose the whole tree before the next NPC's write.
 const peekState=()=>typeof d.peek==='function'?d.peek('state'):d.get('state');
 for(const id of Object.keys(peekState().npcs))if(personSimulation(engine,peekState(),id).value)settleNpcReflection(d,engine,id,after);
 return {delivered,shared};
}
export function npcCognitionView(engine,document,id){
 const npc=document.state.npcs[id],c=npc?.cognition??{};
 return {memories:[...npcRumorSeeds(engine,id),...npc?.memoryStream??[]].map(row=>({...clone(row),...(c.blurred?.[row.id]?{content:c.blurred[row.id].content,blurred:true,entities:[]}:{}),...(row.transmissionChain?{transmissionChain:rumorChainView(row.transmissionChain)}:{})})),reflections:clone(c.reflections??[])};
}
export function nextNpcCognitionMinute(state,after){const today=Math.floor(after/DAY)*DAY+600,daily=today>after?today:today+DAY,messages=Object.values(state.npcCognition?.messages??{});return Math.min(daily,nextMagicMessageMinute(state,after),...messages.filter(m=>m.status==='在途'&&m.arrive>after).map(m=>m.arrive),messages.some(m=>m.status==='待交付')?(Math.floor(after/15)+1)*15:Infinity);}
import {obligationRows,obligationView} from './obligation-state.mjs';
