import {registerSetupLoader} from './index.mjs';
import {object,text,integer,keys,gap,rows,requireShape,state,known,eventSource} from './institutions.mjs';
import {bookServiceAppointment} from '../../server-plugin/npc-state.mjs';
import {recordAgreedQuote,resolveRedeemingBranch} from '../../server-plugin/shop.mjs';
import {recordWorkstationAccess,recordServiceQuote,initializeRecipeDuration} from '../../server-plugin/workstation-services.mjs';
import {qualifiedExaminers,bookExaminationSeat} from '../../server-plugin/local-exams.mjs';
import {registerLodgingBed,registerOwnedRestBed,lodgingAvailability} from '../../server-plugin/facility-state.mjs';

function loadExaminations(ctx,setup){rows(ctx,setup,'examinations',(row,item)=>{
 requireShape(keys(row,['id','profession','registrar','examiner','minutes','fee','available','passed'])&&text(row.id)&&ctx.engine.world.professions.some(p=>p.id===row.profession)&&known(ctx,ctx.ref(row.registrar))&&integer(row.minutes)&&row.minutes>0&&integer(row.fee)&&typeof row.available==='boolean'&&row.passed===false&&object(row.examiner)&&keys(row.examiner,['role','profession','at'])&&row.examiner.role==='qualified_examiner'&&row.examiner.profession===row.profession&&ctx.engine.world.locations.some(l=>l.id===row.examiner.at),'invalid pending examination');
 const candidates=qualifiedExaminers(ctx.engine,state(ctx),row.profession,row.examiner.at);
 if(candidates.length!==1){gap(ctx,item,'examinations','无法唯一找到题设地点的合格考官；不能把登记员视为考官');return;}
 ctx.native(item,d=>bookExaminationSeat(d,ctx.engine,{...row,registrar:ctx.ref(row.registrar),examiner:candidates[0],location:row.examiner.at}));
});}
function loadAppointments(ctx,setup){rows(ctx,setup,'appointments',(row,item)=>{
 requireShape(keys(row,['id','actor','location','start','end','services','sourceEvent','subject','fee','minutes'])&&text(row.id)&&known(ctx,ctx.ref(row.actor))&&ctx.engine.world.locations.some(l=>l.id===ctx.ref(row.location))&&integer(row.start)&&integer(row.end)&&row.start<row.end&&Array.isArray(row.services)&&row.services.length>0&&row.services.every(text)&&(row.fee===undefined||integer(row.fee))&&(row.minutes===undefined||integer(row.minutes)&&row.minutes>0),'invalid service appointment');
 const source=eventSource(ctx,row.sourceEvent);
 requireShape(source.verb==='appointment_agreed'&&source.actor===ctx.ref(row.actor)&&row.services.includes(source.payload.service),'appointment source mismatch');
 ctx.native(item,d=>bookServiceAppointment(d,ctx.engine,{...row,actor:ctx.ref(row.actor),location:ctx.ref(row.location),sourceEvent:ctx.ref(row.sourceEvent),...(row.subject?{subject:ctx.ref(row.subject)}:{})}));
});}
function loadQuotes(ctx,setup){rows(ctx,setup,'quotes',(row,item)=>{
 requireShape(keys(row,['id','actor','to','resource','quantity','totalCoins','direction','at','expires','sourceEvent','service','principal','fee','recipient','destination','recipientIdentityVerified','destinationBranch','conditions','subject','minutes','conditionAfter'])&&text(row.id)&&known(ctx,ctx.ref(row.actor))&&known(ctx,ctx.ref(row.to))&&integer(row.at)&&row.at<=state(ctx).minute&&integer(row.expires)&&row.expires>row.at,'invalid quote identity/time');
 if(row.conditions!==undefined||row.resource==='repair'){
  eventSource(ctx,row.sourceEvent);
  ctx.native(item,d=>recordServiceQuote(d,ctx.engine,{...row,actor:ctx.ref(row.actor),to:ctx.ref(row.to),...(row.subject?{subject:ctx.ref(row.subject)}:{}),sourceEvent:ctx.ref(row.sourceEvent)}));return;
 }
 let branch;
 if(row.service==='remittance'){
  requireShape(integer(row.principal)&&row.principal>0&&integer(row.fee)&&known(ctx,ctx.ref(row.recipient))&&ctx.engine.world.locations.some(l=>l.id===row.destination)&&row.recipientIdentityVerified===true&&object(row.destinationBranch)&&keys(row.destinationBranch,['role','at'])&&row.destinationBranch.role==='redeeming_branch'&&row.destinationBranch.at===row.destination,'invalid remittance quote');
  branch=resolveRedeemingBranch(ctx.engine,state(ctx),row.destination);
 }else requireShape(text(row.resource)&&integer(row.quantity)&&row.quantity>0&&integer(row.totalCoins)&&['sell_to_player','buy_from_player'].includes(row.direction),'invalid quote terms');
 eventSource(ctx,row.sourceEvent);
 ctx.native(item,d=>recordAgreedQuote(d,ctx.engine,{...row,actor:ctx.ref(row.actor),to:ctx.ref(row.to),sourceEvent:ctx.ref(row.sourceEvent),...(branch?{destinationBranch:branch.id,recipient:ctx.ref(row.recipient)}:{})}));
});}
function loadWorkstations(ctx,setup){rows(ctx,setup,'workstationAccess',(row,item)=>{
 requireShape(keys(row,['id','station','holder','fromMinute','toMinute','fee','paid','usable','paymentEvent'])&&text(row.id)&&text(row.station)&&known(ctx,ctx.ref(row.holder))&&integer(row.fromMinute)&&integer(row.toMinute)&&row.fromMinute<row.toMinute&&integer(row.fee)&&typeof row.paid==='boolean'&&typeof row.usable==='boolean','invalid workstation access');
 if(row.paid)eventSource(ctx,row.paymentEvent);
 ctx.native(item,d=>recordWorkstationAccess(d,ctx.engine,{...row,station:ctx.ref(row.station),holder:ctx.ref(row.holder),...(row.paymentEvent?{paymentEvent:ctx.ref(row.paymentEvent)}:{})}));
});}
const loaders={examinations:loadExaminations,appointments:loadAppointments,quotes:loadQuotes,workstationAccess:loadWorkstations};
registerSetupLoader({fields:Object.keys(loaders),order:30,load(ctx,setup,fields){for(const field of fields)loaders[field](ctx,setup);}});
registerSetupLoader({fields:['objects'],rows:{objects:row=>row?.kind==='recipe'},order:35,load(ctx,setup){rows(ctx,setup,'objects',(row,item)=>{
 requireShape(keys(row,['id','kind','minutes','source'])&&row.kind==='recipe','invalid recipe override');
 ctx.native(item,d=>initializeRecipeDuration(d,ctx.engine,row,{origin:'initial',eventId:`a3-services:${item}`}));
});}});
registerSetupLoader({fields:['objects'],objectStateFields:['available','lodging'],order:50,load(ctx,setup){rows(ctx,setup,'objects',(row,item)=>{
 if(!Object.hasOwn(row,'available')&&!Object.hasOwn(row,'lodging'))return;
 requireShape(row.available===undefined||typeof row.available==='boolean','invalid object availability');
 const id=ctx.ref(row.id),location=ctx.ref(row.location);
 ctx.native(`${item}.available`,d=>{
  if(row.lodging!==undefined)registerOwnedRestBed(d,ctx.engine,{id,location,lodging:row.lodging},{origin:'initial',eventId:`a3-services:${item}`});
  else registerLodgingBed(d,ctx.engine,{id,location});
  if(row.available!==undefined&&lodgingAvailability(ctx.engine,d.document,location,{bed:id}).available!==row.available)throw Error('Declared availability conflicts with real lodging occupancy');
 });
});}});
