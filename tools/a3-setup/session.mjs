import {registerSetupLoader} from './index.mjs';

export const isSessionHistory=row=>row?.verb==='session_fixture'||row?.verb==='trade_completed'&&row.requestId!==undefined;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&Boolean(x.trim());
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const fields={
 append_turns:['count','content'],append_turn:['index','speaker','content'],set_summary:['content','omitTurn'],
 initial_snapshot:['coins','inventory','minute','sellerStock'],execute_turn:['index','intent','seller'],
 edit_turn:['index','intent'],regenerate_turn:['index','sameLogicalAction'],delete_turn:['index'],
 make_old_version_copy:['coins','inventory','knownPerson','relationship','location','present'],upgrade_copy:['preserveOriginal'],
 snapshot_before_departure:['location'],leave_and_advance:['days','useNormalWorldClock'],return:['location','interlocutor']
};
export function sessionHistory(setup){return Array.isArray(setup?.history)?setup.history.filter(isSessionHistory):[];}
export function validateSessionHistory(row,sourceRow){
 if(!object(row)||!text(row.id)||!integer(row.at)||row.source?.kind!=='corpus_premise'||row.source.row!==sourceRow||Object.keys(row.source).some(k=>!['kind','row'].includes(k)))throw Error('Invalid session identity/time/source');
 if(row.verb==='trade_completed'){
  if(Object.keys(row).some(k=>!['id','verb','at','source','actor','to','resource','quantity','totalCoins','requestId'].includes(k))||row.actor!=='player'||!text(row.to)||!text(row.resource)||!integer(row.quantity)||row.quantity<1||!integer(row.totalCoins)||!text(row.requestId)||row.requestId.length>120)throw Error('Invalid original transaction');
  return;
 }
 if(Object.keys(row).some(k=>!['id','verb','at','source','steps'].includes(k))||!Array.isArray(row.steps)||!row.steps.length)throw Error('Invalid session steps');
 for(const step of row.steps){
  if(!object(step)||!fields[step.operation]||Object.keys(step).some(k=>k!=='operation'&&!fields[step.operation].includes(k)))throw Error('Unsupported session operation/field');
  for(const k of ['index','count','days'])if(k in step&&(!integer(step[k])||step[k]<1||step[k]>100000))throw Error(`Invalid session ${k}`);
  for(const k of ['coins','minute','omitTurn'])if(k in step&&!integer(step[k]))throw Error(`Invalid session ${k}`);
  for(const k of ['inventory','sellerStock'])if(k in step&&(!object(step[k])||Object.values(step[k]).some(v=>!integer(v))))throw Error(`Invalid session ${k}`);
  for(const k of ['content','speaker','seller','intent','location','knownPerson','relationship','interlocutor'])if(k in step&&!text(step[k]))throw Error(`Invalid session ${k}`);
 }
}
// Synchronous scene construction cannot execute async storage or host history.
// The scorer adapter consumes these rows; other callers get an explicit gap.
registerSetupLoader({fields:['history'],rows:{history:isSessionHistory},order:9,load(ctx,setup){
 for(const [i,row] of setup.history.entries()){
  try{validateSessionHistory(row,row.source?.row);ctx.unmet(`history[${i}]`,'Session premise requires the asynchronous session execution adapter');}
  catch(error){ctx.unmet(`history[${i}]`,error.message);}
 }
}});
