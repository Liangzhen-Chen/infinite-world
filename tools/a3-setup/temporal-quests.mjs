// T1–T4 premises enter native writers; never interpret facts or expected results.
import {registerSetupLoader} from './index.mjs';
import {recordHistoricalEvent,worldEvent} from '../../server-plugin/world-events.mjs';
import {restoreCalendarSnapshot,historicalMinute} from '../../server-plugin/weather.mjs';
import {restoreQuestSnapshot,restoreQuestPublishingOffice,restoreQuestEscrow,verifyQuestEscrowOpening} from '../../server-plugin/quest-board.mjs';
import {restoreOrdinaryFestival} from '../../server-plugin/festival.mjs';
import {openHolding,aliveHoldings,declareHoldingWriter} from '../../server-plugin/holdings.mjs';

const writer='a3-temporal-setup';
declareHoldingWriter(writer,{kinds:['holds_office']});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&!['__proto__','prototype','constructor'].includes(v);
const keys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
const questEvent=r=>['quest_completed','quest_progress_reported','escrow_opened'].includes(r?.verb);
const questObject=r=>r?.kind==='quest';
const ordinary=r=>object(r?.riddle)&&r?.startsAt!==undefined&&r?.endsAt!==undefined;
const office=r=>r?.template==='office'&&r?.monthlyQuotaD!==undefined;
const escrow=r=>r?.template==='instrument'&&r?.purpose==='quest_escrow';
const rows=(ctx,setup,field,fn)=>{
 if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!object(row)){ctx.unmet(item,'expected an object');continue;}
  try{fn(row,item);}catch(error){ctx.unmet(item,error.message);}
 }
};
const require=(condition,message)=>{if(!condition)throw Error(message);};
const initial=row=>({origin:'initial',sourceEvent:`${writer}:${row.id}`});

registerSetupLoader({fields:['date'],order:0,load(ctx,setup){
 ctx.native('date',d=>restoreCalendarSnapshot(d,ctx.engine,{date:setup.date,minute:setup.minute,origin:'initial',sourceEvent:`${writer}:date`}));
}});
registerSetupLoader({fields:['history'],order:1,load(ctx,setup){
 // The history owner reports malformed containers/entries once. This pass
 // validates only the explicit relative-time field it is responsible for.
 if(!Array.isArray(setup.history))return;
 for(const [i,row] of setup.history.entries())if(object(row)&&row.daysAgo!==undefined)
  try{historicalMinute(ctx.document,row);}catch(error){ctx.unmet(`history[${i}].at`,error.message);}
}});
registerSetupLoader({fields:['history'],rows:{history:questEvent},order:10,load(ctx,setup){
 rows(ctx,setup,'history',(row,item)=>{
  require(text(row.id)&&!Object.hasOwn(ctx.bindings,row.id)&&object(row.source)&&keys(row.source,['kind','row'])&&row.source.kind==='corpus_premise'&&text(row.source.row),'Invalid task history identity or corpus source');
  require(keys(row,['id','verb','at','source','actor','to','subject','progress','owner'])&&Number.isSafeInteger(row.at)&&row.at>=0&&row.at<=ctx.document.state.minute,'Invalid task history time or fields');
  if(row.verb==='escrow_opened')require(text(row.owner)&&row.actor===undefined&&row.to===undefined&&row.subject===undefined&&row.progress===undefined,'Invalid quest escrow source');
  else require(ctx.actor(ctx.ref(row.actor))&&ctx.actor(ctx.ref(row.to))&&row.actor!==row.to&&text(row.subject)&&
   (row.verb==='quest_completed'?row.progress===undefined:text(row.progress)),'Invalid quest event parties or progress');
  const payload={...row};for(const k of ['actor','to','subject','owner'])if(typeof row[k]==='string')payload[k]=ctx.ref(row[k]);
  if(ctx.native(item,d=>recordHistoricalEvent(d,ctx.engine,{id:row.id,verb:row.verb,actor:payload.actor??null,minute:row.at,location:ctx.document.state.location,
   witnesses:row.verb==='quest_progress_reported'?[payload.to]:[],source:row.source,payload})))ctx.bindings[row.id]=`world_event:${row.id}`;
 });
}});
registerSetupLoader({fields:['objects'],rows:{objects:questObject},order:50,load(ctx,setup){
 rows(ctx,setup,'objects',(row,item)=>{
  require(text(row.id)&&!Object.hasOwn(ctx.bindings,row.id)&&row.kind==='quest','Invalid quest alias');
  if(ctx.native(item,d=>restoreQuestSnapshot(d,ctx.engine,{...row,issuer:ctx.ref(row.issuer),assignee:ctx.ref(row.assignee),sourceEvent:ctx.ref(row.sourceEvent)},{origin:'initial'})))ctx.bindings[row.id]=row.id;
 });
}});
registerSetupLoader({fields:['knowledge'],rows:{knowledge:r=>r?.source==='private_report'},order:80,load(ctx,setup){
 rows(ctx,setup,'knowledge',(row,item)=>{
  const event=worldEvent(ctx.document.state,ctx.ref(row.event)),holder=ctx.ref(row.holder);
  require(keys(row,['holder','event','source'])&&event?.verb==='quest_progress_reported'&&event.payload?.to===holder&&event.witnesses?.includes(holder)&&
   Object.values(ctx.document.state.quests??{}).some(q=>q.sourceEvent===event.id&&q.publisher===holder&&q.status==='进行中'),'Private report is not established by a matching native quest/source');
  ctx.note(`${item}: native quest report delivered only to its named recipient`);
 });
}});
// Q owns early generic instance/holding dispatch. Preserve the supplied input
// shape so that integration needs only to defer rows claimed by these loaders.
registerSetupLoader({fields:['instances'],rows:{instances:office},order:2,load(ctx,setup){
 rows(ctx,setup,'instances',(row,item)=>{
  require(text(row.id)&&!Object.hasOwn(ctx.bindings,row.id),'Invalid quest office alias');
  let id;
  if(ctx.native(item,d=>{id=restoreQuestPublishingOffice(d,ctx.engine,row,initial(row));}))ctx.bindings[row.id]=id;
 });
}});
registerSetupLoader({fields:['holdings'],rows:{holdings:r=>r?.kind==='holds_office'&&Object.hasOwn(r?.terms??{},'quotaUsed')},order:3,load(ctx,setup){
 rows(ctx,setup,'holdings',(row,item)=>{
  require(keys(row,['id','kind','holder','subject','terms'])&&text(row.id)&&row.kind==='holds_office'&&ctx.actor(ctx.ref(row.holder))&&
   object(row.terms)&&keys(row.terms,['quotaUsed'])&&row.terms.quotaUsed===0,'Invalid initial quest office term; used quota needs real publication history');
  let id;
  if(ctx.native(item,d=>{
   const subject=ctx.ref(row.subject),definition=d.get('holdings','entities',subject);
   require(definition?.facts?.questPublishing,'Unknown limited quest office');
   require(!aliveHoldings(d,{kind:'holds_office',subject}).length,'Quest office already has an incumbent');
   id=openHolding(d,{kind:'holds_office',holder:ctx.ref(row.holder),subject,terms:{},source:`${writer}:${row.id}`,writer,engine:ctx.engine});
  }))ctx.bindings[row.id]=id;
 });
}});
registerSetupLoader({fields:['instances'],rows:{instances:escrow},order:15,load(ctx,setup){
 rows(ctx,setup,'instances',(row,item)=>{
  require(text(row.id)&&!Object.hasOwn(ctx.bindings,row.id),'Invalid quest escrow alias');
  const source=(setup.history??[]).filter(h=>h.verb==='escrow_opened'&&h.owner===row.id);
  require(source.length===1,'Quest escrow requires exactly one matching opening event');
  if(ctx.native(item,d=>restoreQuestEscrow(d,ctx.engine,row,{origin:'initial',sourceEvent:ctx.ref(source[0].id)})))ctx.bindings[row.id]=row.id;
 });
}});
registerSetupLoader({fields:['accounts'],rows:{accounts:r=>r?.purpose==='quest_escrow'},order:20,load(ctx,setup){
 rows(ctx,setup,'accounts',(row,item)=>{
  require(keys(row,['owner','resource','purpose','balance','sourceEvent']),'Unsupported quest escrow account fields');
  ctx.native(item,d=>verifyQuestEscrowOpening(d,ctx.engine,{...row,owner:ctx.ref(row.owner),sourceEvent:ctx.ref(row.sourceEvent)}));
 });
}});
registerSetupLoader({fields:['rites'],rows:{rites:ordinary},order:75,load(ctx,setup){
 rows(ctx,setup,'rites',(row,item)=>{
  require(text(row.id)&&!Object.hasOwn(ctx.bindings,row.id),'Invalid ordinary festival alias');
  const value={...row,host:ctx.ref(row.host),riddle:{...row.riddle,reward:ctx.ref(row.riddle?.reward)}};
  if(ctx.native(item,d=>restoreOrdinaryFestival(d,ctx.engine,value,initial(row)))){
   ctx.bindings[row.id]=row.id;ctx.bindings[row.riddle.id]=row.riddle.id;
  }
 });
}});
