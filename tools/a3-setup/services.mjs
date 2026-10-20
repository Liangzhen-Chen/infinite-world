import {registerSetupLoader} from './index.mjs';
import {object,text,alias,integer,keys,gap,rows,requireShape,state,known,selector,eventSource} from './institutions.mjs';
import {npcServices} from '../../server-plugin/npc-state.mjs';
import {facilityView} from '../../server-plugin/facility-state.mjs';

function loadExaminations(ctx,setup){rows(ctx,setup,'examinations',(row,item)=>{
 requireShape(keys(row,['id','profession','registrar','examiner','minutes','fee','available','passed'])&&text(row.id)&&ctx.engine.world.professions.some(p=>p.id===row.profession)&&known(ctx,ctx.ref(row.registrar))&&integer(row.minutes)&&row.minutes>0&&integer(row.fee)&&typeof row.available==='boolean'&&row.passed===false&&object(row.examiner)&&keys(row.examiner,['role','profession','at'])&&row.examiner.role==='qualified_examiner'&&row.examiner.profession===row.profession&&ctx.engine.world.locations.some(l=>l.id===row.examiner.at),'invalid pending examination');
 const candidates=Object.entries(state(ctx).npcs??{}).filter(([id,n])=>n.location===row.examiner.at&&npcServices(ctx.engine,state(ctx),id).includes(row.profession)).map(([id])=>id);
 if(candidates.length!==1){gap(ctx,item,'examinations','无法唯一解析当地已有合格考官；不能把登记员授为考官');return;}
 gap(ctx,item,'examinations','缺少未考试席位及 minutes/fee/available 的原生登记接点；不能调用认证动作预先通过考试');
});}
function loadAppointments(ctx,setup){rows(ctx,setup,'appointments',(row,item)=>{
 requireShape(keys(row,['id','actor','location','start','end','services','sourceEvent','subject','fee','minutes'])&&text(row.id)&&known(ctx,ctx.ref(row.actor))&&ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.location))&&integer(row.start)&&integer(row.end)&&row.start<row.end&&Array.isArray(row.services)&&row.services.length>0&&row.services.every(text)&&(row.fee===undefined||integer(row.fee))&&(row.minutes===undefined||integer(row.minutes)&&row.minutes>0),'invalid service appointment');
 const source=eventSource(ctx,row.sourceEvent);requireShape(source.verb==='appointment_agreed'&&source.actor===ctx.ref(row.actor)&&row.services.includes(source.payload.service),'appointment source mismatch');
 gap(ctx,item,'appointments','缺少服务预约时段的原生导入接点；createNpcObligation 的会面会占用双方且关闭服务，不能替代柜台服务或新增职业');
});}
function loadQuotes(ctx,setup){rows(ctx,setup,'quotes',(row,item)=>{
 requireShape(keys(row,['id','actor','to','resource','quantity','totalCoins','direction','at','expires','sourceEvent','service','principal','fee','recipient','destination','recipientIdentityVerified','destinationBranch'])&&text(row.id)&&known(ctx,ctx.ref(row.actor))&&known(ctx,ctx.ref(row.to))&&integer(row.at)&&row.at<=state(ctx).minute&&integer(row.expires)&&row.expires>row.at,'invalid quote identity/time');
 if(row.service==='remittance')requireShape(integer(row.principal)&&integer(row.fee)&&known(ctx,ctx.ref(row.recipient))&&ctx.engine.world.locations.some(l=>l.id===row.destination)&&row.recipientIdentityVerified===true&&object(row.destinationBranch)&&keys(row.destinationBranch,['role','at'])&&row.destinationBranch.role==='redeeming_branch'&&row.destinationBranch.at===row.destination,'invalid remittance quote');
 else requireShape(text(row.resource)&&integer(row.quantity)&&row.quantity>0&&integer(row.totalCoins)&&['sell_to_player','buy_from_player'].includes(row.direction),'invalid quote terms');
 const source=eventSource(ctx,row.sourceEvent);requireShape(source.verb==='quoted'&&source.actor===ctx.ref(row.actor)&&(row.service==='remittance'?source.payload.subject==='remittance'&&source.payload.principal===row.principal&&source.payload.fee===row.fee:source.payload.to===ctx.ref(row.to)&&source.payload.resource===row.resource&&source.payload.quantity===row.quantity&&source.payload.totalCoins===row.totalCoins),'quote source mismatch');
 gap(ctx,item,'quotes','缺少限定总量/总价/方向/有效期（汇兑另含费用及真实网点）的原生报价导入接点；tradeQuote 仅计算当日目录单价，不能记作完整报价');
});}
function loadWorkstations(ctx,setup){rows(ctx,setup,'workstationAccess',(row,item)=>{
 requireShape(keys(row,['id','station','holder','fromMinute','toMinute','fee','paid','usable','paymentEvent'])&&text(row.id)&&text(row.station)&&known(ctx,ctx.ref(row.holder))&&integer(row.fromMinute)&&integer(row.toMinute)&&row.fromMinute<row.toMinute&&integer(row.fee)&&typeof row.paid==='boolean'&&typeof row.usable==='boolean','invalid workstation access');
 const place=ctx.engine.world.locations.find(l=>l.workstations?.some(s=>s.id===ctx.ref(row.station))),station=place&&facilityView(ctx.engine,state(ctx),place.id)?.workstations?.find(s=>s.id===ctx.ref(row.station));
 requireShape(station,'unknown or unavailable workstation');
 if(row.paid){const paid=eventSource(ctx,row.paymentEvent);requireShape(paid.verb==='paid'&&paid.actor===ctx.ref(row.holder)&&paid.payload.subject===ctx.ref(row.station),'workstation payment source mismatch');}
 else requireShape(row.paymentEvent===undefined,'unpaid workstation cannot have a paymentEvent');
 // A public, usable, unpaid station with exactly its native fee is already
 // represented. Nothing is purchased, waived or added to the player's purse.
 if(row.usable&&station.access==='public'&&station.fee===row.fee&&!row.paid&&row.fromMinute<=state(ctx).minute&&state(ctx).minute<row.toMinute){ctx.note(`${item}: existing public workstation and unpaid native fee retained`);return;}
 gap(ctx,item,'workstationAccess','缺少有时限工位可用性/旧预付抵扣的原生接点，不能重扣预付费或改写工位目录');
});}

const loaders={examinations:loadExaminations,appointments:loadAppointments,quotes:loadQuotes,workstationAccess:loadWorkstations};
registerSetupLoader({fields:Object.keys(loaders),order:30,load(ctx,setup,fields){for(const field of fields)loaders[field](ctx,setup);}});
