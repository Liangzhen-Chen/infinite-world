import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {bookTransport,quoteTransport,transportServices,transportTrace,transportPosition,settleWreckedShipment} from './transport.mjs';
import {memoryFor,permitted,appendHeard} from './npc-cognition.mjs';
import {publishTransitionEvent} from './world-events.mjs';
import {financeBalance} from './finance-bank.mjs';

const path=id=>['state','records',id],clone=x=>structuredClone(x);
const all=s=>(s.records?.['post:active']?.ids??[]).map(id=>s.records[id]).filter(Boolean);
function index(d,id,add=true){const ids=d.get(...path('post:active'),'ids')??[];d.set(path('post:active'),{category:'post_index',ids:add?[...new Set([...ids,id])]:ids.filter(x=>x!==id)});}
const locationOf=(s,id)=>id==='player'?s.location:s.npcs?.[id]?.location;
// The sealed payload is a snapshot of the sender's knowledge at dispatch.
// Possession grants custody; it never grants knowledge of its contents.
export function sendPost(d,e,{from,to,memoryId,legs,sealed=true,receipt=true},eventId){
 const s=d.get('state'),sender=from==='player'?{...s.player,location:s.location}:s.npcs[from],recipient=to==='player'?{...s.player,location:s.location}:s.npcs[to];
 if(!sender?.location||!recipient?.location||from===to)throw preconditionFailure('寄收双方须有可确认的地址');
 if(from==='player'&&(typeof memoryId!=='string'||!memoryId.trim()||memoryId.length>1000))throw preconditionFailure('书信正文须为1至1000字');
 const memory=from==='player'?{id:`letter:${eventId}`,sourceEvent:eventId,kind:'letter',minute:s.minute,content:memoryId,sourceType:'亲历',participants:['player'],private:true,permittedRecipients:[to]}:memoryFor(e,s,from,memoryId,s.minute);if(!permitted(memory,to))throw preconditionFailure('这条私密记忆未许可收件人');
 if(!Array.isArray(legs)||!legs.length||legs.at(-1).to!==recipient.location)throw preconditionFailure('驿传接力须有通往收件地址的真实各段');
 let location=sender.location,at=s.minute,postage=0;
 for(const leg of legs){const quote=quoteTransport(d,e,{asset:leg.asset,from:location,to:leg.to,departAt:Math.ceil(at/60)*60});location=leg.to;at=quote.estimatedArrivalAt;postage+=quote.total;}
 if(financeBalance(d,e,from)<postage*(receipt?2:1))throw preconditionFailure('邮资不足以覆盖接力与回执');
 const id=`post:${eventId}`;if(d.get(...path(id)))throw preconditionFailure('信件编号已存在');
 const row={category:'post',id,from,to,memoryId,payload:clone(memory),sealed,sealBroken:false,receiptRequested:receipt,origin:sender.location,destination:recipient.location,legs:clone(legs),legIndex:0,chain:[],createdAt:s.minute,status:'in-transit'};
 const trip=bookTransport(d,e,{owner:from,recipient:from,asset:legs[0].asset,to:legs[0].to,post:id},`${eventId}:leg:0`);
 row.shipment=trip.id;row.chain.push({shipment:trip.id,carrier:trip.carrier,from:sender.location,to:trip.to,receivedAt:s.minute});d.set(path(id),row);index(d,id);return {id,shipment:trip.id,estimatedArrivalAt:at};
}
export function nextPostMinute(state,now){return all(state).some(r=>['waiting','awaiting-recipient','receipt-waiting'].includes(r.status))?(Math.floor(now/15)+1)*15:Infinity;}
export function advancePost(d,e,minute){
 for(const old of all(d.get('state'))){
  if(['delivered','lost','returned'].includes(old.status))continue;
  const row=clone(old),trip=d.get(...path(row.shipment));
  if(trip?.status==='wrecked'){
   // The carrier's asset was destroyed: settle the shipment (freight refund, notice to the sender), then end the letter.
   // A lost receipt leg leaves the original letter delivered; any earlier leg means the letter never arrived.
   settleWreckedShipment(d,e,trip.id,minute);
   if(['receipt-in-transit','receipt-waiting'].includes(row.status)){row.status='delivered';row.receiptLost=true;row.reason='回执随车船损毁';}
   else{row.status='lost';row.lostAt=minute;row.lastLocation=trip.transport.location;row.reason='承运车船在途中损毁';}
   index(d,row.id,false);d.set(path(row.id),row);continue;
  }
  if(trip?.status==='intercepted'){row.status='intercepted';row.custodian=trip.custodian;d.set(path(row.id),row);continue;}
  if(trip?.status!=='delivered')continue;
  const last=row.chain.at(-1);last.arrivedAt??=trip.arrivedAt;
  if(row.status==='receipt-in-transit'||row.status==='receipt-waiting'){
   if(locationOf(d.get('state'),row.from)===row.origin){row.receiptAt=minute;row.status='delivered';index(d,row.id,false);}
   else row.status='receipt-waiting';d.set(path(row.id),row);continue;
  }
  if(row.legIndex<row.legs.length-1){
   const next=row.legs[row.legIndex+1],services=transportServices(e,d.document,trip.to),service=services.find(s=>s.asset===next.asset);
   if(!service){row.status='waiting';row.reason='接力承运人或资产尚未到站';d.set(path(row.id),row);continue;}
   try{
    const nextTrip=bookTransport(d,e,{owner:row.from,recipient:row.from,asset:next.asset,from:trip.to,to:next.to,post:row.id},`${row.id}:leg:${row.legIndex+1}`);
    row.legIndex++;row.shipment=nextTrip.id;row.chain.push({shipment:nextTrip.id,carrier:nextTrip.carrier,from:trip.to,to:next.to,receivedAt:minute});row.status='in-transit';row.reason=null;
   }catch(error){row.status='waiting';row.reason=error.message;}
   d.set(path(row.id),row);continue;
  }
  const recipient=row.to==='player'?d.get('state','player'):d.get('state','npcs',row.to);
  if(locationOf(d.get('state'),row.to)!==row.destination||isPhysicallyDead(e,d,row.to)||['昏迷','濒死'].includes(recipient?.status)||recipient?.cognitionTravel||recipient?.scheduleTravel||/睡眠|熟睡|睡觉/.test(recipient?.activity??'')){row.status='awaiting-recipient';d.set(path(row.id),row);continue;}
  const current=d.get('state','npcs',row.from,'memoryStream')?.find(m=>m.id===row.memoryId)??row.payload;
  if(!permitted(current,row.to)){row.status='awaiting-recipient';row.reason='披露许可已撤销';d.set(path(row.id),row);continue;}
  if(!row.deliveredAt){
   if(row.to==='player'){
    const id=`post:${row.id}:read`,memory={...clone(row.payload),id,rootMemoryId:row.payload.rootMemoryId??row.payload.id,minute,occurredAt:row.payload.minute,location:row.destination,sourceType:'听说',heardFrom:row.from,channel:'post',messageId:row.id,reliability:'未经亲历核实',transmissionChain:[...row.payload.transmissionChain??[],{from:row.from,to:'player',minute,channel:'post'}],subject:'player',key:id,source:row.from,keywords:['书信'],pinned:false};
    d.set(['memories',`player::${id}`],memory);d.say?.(`收到书信：${row.payload.content}`);
   }else appendHeard(d,e,row.from,row.to,row.payload,minute,'post',row.id,row.destination,{input:row.payload.content,content:row.payload.content,distortion:'书信原文，内容仍是寄信者的陈述'});
   row.deliveredAt=minute;
  }
  row.status='delivered';
  if(row.receiptRequested){
   try{const receipt=bookTransport(d,e,{owner:row.from,recipient:row.from,from:row.destination,to:row.origin,asset:trip.asset,post:row.id,receiptOf:row.id},`${row.id}:receipt`);row.shipment=receipt.id;row.status='receipt-in-transit';}
   catch(error){row.status='awaiting-recipient';row.reason=`回执待寄：${error.message}`;}
  }
  if(row.status==='delivered')index(d,row.id,false);d.set(path(row.id),row);
 }
}
export function openPost(d,e,{letter,actor='player',lose=false},eventId){
 const old=d.get(...path(letter));if(old?.category!=='post'||old.status==='lost')throw preconditionFailure('没有可开封的实信');
 const row=clone(old),trip=d.get(...path(row.shipment)),s=d.get('state'),location=actor==='player'?s.location:s.npcs?.[actor]?.location;
 const onboard=actor===trip?.driver||trip?.passengers.includes(actor),position=trip&&transportPosition(e,s,trip);
 if(row.deliveredAt){if(actor!==row.to||location!==row.destination)throw preconditionFailure('原信已交收件人，返程只携带回执');}
 else if((!onboard&&(position?.location===null||location!==position?.location))||![row.from,row.to,trip.driver,trip.custodian].includes(actor))throw preconditionFailure('没有在现场实际持有这封信');
 if(lose){row.status='lost';row.lostAt=s.minute;row.lastLocation=location;index(d,row.id,false);}
 else{
  row.sealBroken||=row.sealed;row.openedBy=[...new Set([...(row.openedBy??[]),actor])];
  if(actor!=='player')appendHeard(d,e,row.from,actor,{...row.payload,knownBy:[...row.payload.knownBy??[],actor],permittedRecipients:[...row.payload.permittedRecipients??[],actor]},s.minute,'intercepted-letter',row.id,location,{input:row.payload.content,content:row.payload.content,distortion:'拆信所得，未核实内容'});
 }
 d.set(path(row.id),row);
 publishTransitionEvent(d,e,{id:`post:${eventId}`,verb:'rumor',actor,target:row.from,minute:s.minute,location,witnesses:[],tags:['post'],visibility:'private'});
 return lose?{id:row.id,status:'lost'}:{id:row.id,content:row.payload.content,source:row.from,sealBroken:row.sealBroken,reliability:'寄信者陈述，未经独立核实'};
}
export function postAction(d,e,args,eventId){
 if(args.task==='open'||args.task==='lose')return openPost(d,e,{letter:args.business??args.contract,lose:args.task==='lose'},eventId);
 if(args.task==='trace'){
  const row=d.get(...path(args.business??args.contract));if(row?.category!=='post')throw preconditionFailure('信件不存在');
  if(![row.from,row.to].includes('player'))throw preconditionFailure('没有寄收身份');
  return {id:row.id,status:row.status,sealBroken:row.sealBroken,chain:clone(row.chain),deliveredAt:row.deliveredAt??null,receiptAt:row.receiptAt??null,transport:transportTrace(e,d.get('state'),row.shipment,row.from)};
 }
 const to=e.resolve(args.buyer),from=e.resolve(args.business??'player');
 if(from!=='player'&&(args.consent!==true||locationOf(d.get('state'),from)!==d.get('state','location')))throw preconditionFailure('代寄NPC书信须本人在场明确同意');
 const assets=[args.contract,...args.instances??[]],legs=assets.map((asset,i)=>({asset,to:i===assets.length-1?e.resolve(args.location??locationOf(d.get('state'),to)):d.get('state','records',assets[i+1],'location')}));
 return sendPost(d,e,{from,to,memoryId:args.item,legs},eventId);
}
