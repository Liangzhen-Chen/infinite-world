import {registerSetupLoader} from './index.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=['combats','conversations','rites'];
const shape=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k));
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const fail=message=>{throw Error(message);};
const requireActor=(ctx,id)=>{id=ctx.ref(id);if(typeof id!=='string'||!ctx.actor(id))fail('missing actor');return id;};
const state=ctx=>ctx.document.state;
const sourceEvent=(ctx,alias)=>{
 if(typeof alias!=='string'||!Object.hasOwn(ctx.bindings,alias))fail('unresolved source event binding (05 §5.6; history loader required)');
 const id=ctx.ref(alias),s=state(ctx),event=s.records?.[`world_event:${id}`]??s.records?.[id];
 if(!event||event.id!==id||!integer(event.minute??event.at)||((event.minute??event.at)>s.minute))fail('missing or future native source event');
 return event;
};
function array(ctx,setup,field,keys,load){
 if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');return;}
 for(const [i,row] of setup[field].entries()){
  const item=`${field}[${i}]`;
  if(!shape(row,keys)){ctx.unmet(item,'invalid declaration or unsupported field');continue;}
  // ctx.native discards the whole draft on failure, including partial writes.
  ctx.native(item,d=>load(row,item,d));
 }
}
registerSetupLoader({fields,order:85,load(ctx,setup,selected){
 for(const field of selected){
  if(field==='combats'||field==='conversations')array(ctx,setup,field,field==='combats'?['id','participants','active','playerActedThisRound']:['id','participants','active','mainTopicFinished'],r=>{
   if(typeof r.id!=='string'||!r.id||!Array.isArray(r.participants)||r.participants.length<2||new Set(r.participants.map(ctx.ref)).size!==r.participants.length||r.active!==true)fail('invalid active activity declaration');
   for(const participant of r.participants)requireActor(ctx,participant);
   if(field==='combats'&&r.playerActedThisRound!==false||field==='conversations'&&r.mainTopicFinished!==true)fail('invalid pending activity flags');
   fail(field==='combats'?'no native unfinished encounter/round initializer; combat resolves the encounter (05 §5.4; 06 §6.8)':'no native active conversation/topic-completion initializer; dialogue stores individual replies (05 §5.7; 06 §6.8)');
  });
  if(field==='rites')array(ctx,setup,field,['id','name','location','host','start','end','hostAuthorized','offerings','sourceEvent'],r=>{
   requireActor(ctx,r.host);sourceEvent(ctx,r.sourceEvent);
   if(typeof r.id!=='string'||!ctx.engine.world.locations.some(l=>l.id===r.location)||!integer(r.start)||!integer(r.end,r.start+1)||r.hostAuthorized!==true||!Array.isArray(r.offerings)||r.offerings.some(o=>!shape(o,['item','quantity'])||!ctx.engine.world.items.some(i=>i.id===o.item)||!integer(o.quantity,1)))fail('invalid rite premise');
   fail('no native initializer for an existing hosted rite with schedule, authority and unconsumed offerings; faith_rite executes and consumes, rite_project requires a registered action (13 §13.5; 06 §6.8)');
  });
 }
}});
