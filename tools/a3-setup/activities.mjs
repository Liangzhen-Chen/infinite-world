import {registerSetupLoader} from './index.mjs';
import {initializeEncounter} from '../../server-plugin/combat.mjs';
import {initializeConversation} from '../../server-plugin/dialogue.mjs';
import {initializeHostedRite} from '../../server-plugin/faith.mjs';
import {worldEvent} from '../../server-plugin/world-events.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const declarations={
 combats:{keys:['id','participants','active','playerActedThisRound'],write:initializeEncounter},
 conversations:{keys:['id','participants','active','mainTopicFinished'],write:initializeConversation},
 rites:{keys:['id','name','location','host','start','end','hostAuthorized','offerings','sourceEvent'],write:initializeHostedRite}
};
registerSetupLoader({fields:Object.keys(declarations),order:85,load(ctx,setup,selected){
 for(const field of selected){
  if(!Array.isArray(setup[field])){ctx.unmet(field,'expected an array');continue;}
  const {keys,write}=declarations[field];
  for(const [i,row] of setup[field].entries()){
   const item=`${field}[${i}]`;
   if(!object(row)||Object.keys(row).some(k=>!keys.includes(k))){ctx.unmet(item,'invalid declaration or unsupported field');continue;}
   ctx.native(item,d=>{
    const value=structuredClone(row);
    if(value.participants)value.participants=value.participants.map(ctx.ref);
    if(field==='rites'){
     if(typeof row.sourceEvent!=='string'||!Object.hasOwn(ctx.bindings,row.sourceEvent))throw Error('Unresolved source event binding');
     const event=worldEvent(d.get('state'),ctx.ref(row.sourceEvent));
     if(!event||event.minute>d.get('state','minute'))throw Error('Missing or future native source event');
     value.host=ctx.ref(row.host);value.sourceEvent=`world_event:${event.id}`;
    }
    write(d,ctx.engine,value,{origin:'initial',eventId:`a3-setup:${field}:${row.id}`});
   });
  }
 }
}});
