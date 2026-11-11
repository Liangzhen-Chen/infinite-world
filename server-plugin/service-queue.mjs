// 通用服务排队（附录 A §A.16 槽 service:capacity；05 §5.x 服务容量与分诊）。
// 容量属于真实的诊所/学堂/讼师/匠人；排队只决定谁先拿到下一个名额：
// 紧迫度高者先，同紧迫度先到先得（登记时刻），再按编号稳定排序。
// 日容量 = 技能阶表 × (1 + 助手数 × 助手份额) × 设施完好系数，经槽 service:capacity 的修正项后取整；
// 服务者当班才有容量（由调用者传入在岗事实），没有任何手填数。
import {recordsWhere} from './storage.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {derived} from './derived.mjs';
import healthBalance from '../world/rules/tables/balance/health.json' with {type:'json'};
declareHoldingWriter('service-queue',{kinds:[]});

const DAY=1440;
const param=(e,id)=>(e.world.balance?.health??healthBalance).params.find(p=>p.id===id).value;

export function serviceUrgency(conditions){
    return conditions.reduce((n,c)=>Math.max(n,c.record?.bleedingMlPerMinute>0?3:c.severity==='重'||c.record?.infected?2:1),0);
}
export function orderServices(rows){
    return [...rows].sort((a,b)=>(b.urgency??0)-(a.urgency??0)||(a.createdAt??0)-(b.createdAt??0)||(a.arrivalOrder??0)-(b.arrivalOrder??0)||a.id.localeCompare(b.id));
}
export const nextServiceOrder=rows=>rows.reduce((n,r)=>Math.max(n,r.arrivalOrder??0),0)+1;
// 比新请求更不紧迫、尚未开始的已排期项：紧急请求可以顶掉它们（回到排队，保留原登记时刻），最不紧迫者先被顶。
export function displaceable(rows,{urgency,now,same,urgencyOf}){
    return orderServices(rows).reverse().filter(r=>same(r)&&r.status==='预约'&&r.depart>now&&urgencyOf(r)<urgency);
}
export const waitingInOrder=rows=>orderServices(rows.filter(r=>r.status==='排队'));
// 回执上的位次：与本项同一服务点、尚未开始者里，按优先序排在它前面的人数 + 1。
export function queuePosition(rows,row,{same,now}){
    const live=rows.filter(r=>same(r)&&['预约','排队'].includes(r.status)&&(r.status==='排队'||(r.start??Infinity)>now||r.id===row.id));
    return orderServices(live).findIndex(r=>r.id===row.id)+1;
}

export const serviceTier=proficiency=>Math.max(0,Math.floor((proficiency??0)/300));
// 日可接次数。seats：设施本身的座位/诊位数（学堂、诊所按设施），否则按技能阶表。
export function serviceCapacity(e,d,{provider,service,proficiency=0,helpers=0,factor=1,seats=null}){
    return serviceCapacityView(e,d,{provider,service,proficiency,helpers,factor,seats}).capacity;
}
// The same derivation supplies a receipt/view: callers never reconstruct an explanation from a capacity number.
export function serviceCapacityView(e,d,{provider,service,proficiency=0,helpers=0,factor=1,seats=null}){
    const rule=param(e,'service.capacity')[service],base=seats??rule.base+rule.perTier*serviceTier(proficiency);
    const helperShare=param(e,'service.helperShare'),raw=Math.floor(base*(1+helpers*helperShare)*factor);
    const capacity=Math.max(0,Math.floor(derived(e,d.document,'service:capacity',provider,{base:raw})));
    return {capacity,provider,service,sources:{table:'service.capacity',rule:seats===null?{base:rule.base,perTier:rule.perTier}:null,proficiency,tier:serviceTier(proficiency),base,seats,helpers,helperShare,facilityFactor:factor,raw,slot:'service:capacity'}};
}

// ---- 排队号（讼师、匠人等需要当事人在场办理的服务）-----------------------------------
export const serviceTickets=(s,service,provider)=>recordsWhere(s.records,'category','service_ticket').filter(t=>t.service===service&&t.provider===provider);
const holdDays=e=>param(e,'service.ticket').holdDays,openMinute=e=>param(e,'service.ticket').openMinute;
const alive=(e,s,t)=>t.status==='排队'&&t.createdAt+holdDays(e)*DAY>s.minute;
export const servedOn=(s,service,provider,day)=>serviceTickets(s,service,provider).filter(t=>t.status==='已受理'&&Math.floor(t.servedAt/DAY)===day).length;
export const ticketKey=(service,provider,requester,subject)=>`service_ticket:${service}:${provider}:${requester}:${subject}`;
// 预计受理时刻：今天还有空位（free）的排前面几位今天受理；其余按每日 capacity 个依次顺延到后面的开门钟点。
export function serviceEta(e,now,{rank,free,capacity}){
    if(rank<free)return now;
    return (Math.floor(now/DAY)+1+Math.floor((rank-free)/capacity))*DAY+openMinute(e);
}
// 只判断、必要时登记排队号，不消耗名额。capacity 为 0（服务者不在岗）由调用者先拒绝，不进队。
export function deskRequest(d,e,{service,provider,requester,subject,urgency=1,capacity},{write=true}={}){
    const s=d.get('state'),now=s.minute,day=Math.floor(now/DAY),key=ticketKey(service,provider,requester,subject);
    const mine=s.records?.[key],keep=mine&&alive(e,s,mine)?mine:null;
    const waiting=serviceTickets(s,service,provider).filter(t=>t.id!==key&&alive(e,s,t));
    const arrivalOrder=keep?.arrivalOrder??nextServiceOrder(serviceTickets(s,service,provider));
    const order=orderServices([...waiting,{id:key,urgency,createdAt:keep?.createdAt??now,arrivalOrder}]),rank=order.findIndex(r=>r.id===key);
    const free=Math.max(0,capacity-servedOn(s,service,provider,day)),eta=serviceEta(e,now,{rank,free,capacity});
    if(rank<free)return {admitted:true,key,position:rank+1,eta,capacity,free};
    const row={category:'service_ticket',id:key,service,provider,requester,subject,urgency,createdAt:keep?.createdAt??now,arrivalOrder,status:'排队',position:rank+1,eta,capacity};
    if(write)holdingSet(d,null,['state','records',key],row,'service-queue');
    return {admitted:false,key,position:rank+1,eta,capacity,free,ticket:key};
}
// 服务确已办成时登记受理（占用当日名额）；取代同键的排队号。
export function deskServed(d,{service,provider,requester,subject,urgency=1,eventId}){
    const s=d.get('state'),key=ticketKey(service,provider,requester,subject),old=s.records?.[key];
    holdingSet(d,null,['state','records',key],{category:'service_ticket',id:key,service,provider,requester,subject,urgency,createdAt:old?.createdAt??s.minute,arrivalOrder:old?.arrivalOrder??nextServiceOrder(serviceTickets(s,service,provider)),status:'已受理',servedAt:s.minute,source:eventId},'service-queue');
}
export const queueReceipt=r=>({queued:true,ticket:r.key,position:r.position,eta:r.eta,capacity:r.capacity});
