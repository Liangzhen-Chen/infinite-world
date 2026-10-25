// T1–T4 premises. Dates, quests, quest offices/escrows and ordinary festivals
// are created by real game actions, so their old state forms are prelude-only.
import {registerSetupLoader,preludeOnly,PRELUDE_REASON} from './index.mjs';
import {recordHistoricalEvent,worldEvent} from '../../server-plugin/world-events.mjs';
import {historicalMinute} from '../../server-plugin/weather.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0&&!['__proto__','prototype','constructor'].includes(v);
const keys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
const questEvent=r=>['quest_completed','quest_progress_reported','escrow_opened'].includes(r?.verb);
const rows=(ctx,setup,field,fn)=>{
 if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!object(row)){ctx.unmet(item,'expected an object');continue;}
  try{fn(row,item);}catch(error){ctx.unmet(item,error.message);}
 }
};
const require=(condition,message)=>{if(!condition)throw Error(message);};

registerSetupLoader({fields:['date'],order:0,load(ctx){ctx.unmet('date',PRELUDE_REASON);}});
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
registerSetupLoader({fields:['knowledge'],rows:{knowledge:r=>r?.source==='private_report'},order:80,load(ctx,setup){
 rows(ctx,setup,'knowledge',(row,item)=>{
  const event=worldEvent(ctx.document.state,ctx.ref(row.event)),holder=ctx.ref(row.holder);
  require(keys(row,['holder','event','source'])&&event?.verb==='quest_progress_reported'&&event.payload?.to===holder&&event.witnesses?.includes(holder)&&
   Object.values(ctx.document.state.quests??{}).some(q=>q.sourceEvent===event.id&&q.publisher===holder&&q.status==='进行中'),'Private report is not established by a matching native quest/source');
  ctx.note(`${item}: native quest report delivered only to its named recipient`);
 });
}});
for(const [field,selector] of [['objects',r=>r?.kind==='quest'],['holdings',r=>r?.kind==='holds_office'&&Object.hasOwn(r?.terms??{},'quotaUsed')],['accounts',r=>r?.purpose==='quest_escrow'],['rites',r=>object(r?.riddle)&&r?.startsAt!==undefined&&r?.endsAt!==undefined]])
 registerSetupLoader({fields:[field],rows:{[field]:selector},order:50,load:(ctx,setup)=>preludeOnly(ctx,setup,field)});
