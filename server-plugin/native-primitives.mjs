// Adapters retain their physical formulas and source gates, while sharing the
// primitive transaction, idempotency, receipt and all-or-nothing commit.
import {createPrimitiveFrame,commitPrimitives} from './primitives.mjs';
import {applyPatches,digest} from './storage.mjs';

class Refused extends Error{constructor(result){super(result.reason??'Native effect refused');this.code='E-NATIVE-REFUSED';this.result=result;}}
const savedData=value=>value===undefined?null:JSON.parse(JSON.stringify(value));
export function nativePrimitiveTransaction(d,{family,sourceEvent,actor='player',program,primitives,apply,describe=null,engine=d.engine}){
 const eventId=`native:${digest({family,sourceEvent,program,minute:d.get('state','minute'),ordinal:[d.patches?.length??0,Object.keys(d.get('state','records')??{}).length]}).slice(0,56)}`;
 const results=[],messages=[];let refused=null,child=null;
 const frame=createPrimitiveFrame({actor,eventId,source:{kind:'rule',id:family},identity:program,
  canAct:()=>({allowed:true,tags:[]}),authority:()=>({allowed:true,tags:[]}),location:doc=>doc.state.location,mirrorTransfer(){},
  createDraft:document=>{child=engine?.primitiveDraft?engine.primitiveDraft(document):{document,patches:[],messages,get(...path){return path.reduce((v,k)=>v?.[k],this.document);},peek(...path){return this.get(...path);},
   set(path,value){const patch={op:'set',path,value:structuredClone(value)};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},
   remove(path){const patch={op:'delete',path};this.document=applyPatches(this.document,[patch]);this.patches.push(patch);},say(message){messages.push(message);}};
   if(child.scheduler&&d.scheduler){child.scheduler.seq=Math.max(child.scheduler.seq,d.scheduler.seq);child.scheduler.lastSettled=d.scheduler.lastSettled;}
   if(d.reactionTick)child.reactionTick={...d.reactionTick,queue:[],active:d.reactionTick.active?{...d.reactionTick.active}:null};
   return child;},
  applyNative(tx,effect,{index}){const result=apply(tx,index);if(result?.applied===false){refused=result;throw new Refused(result);}results.push(result);return result;},
  finish(_d,{receipt}){for(const effect of receipt.applied){if(describe)Object.assign(effect,describe(effect,effect.result));effect.source=receipt.source;effect.appliedEvent=eventId;effect.role='outcome';effect.result=savedData(effect.result);}receipt.consequences.push({kind:'native_program',family,program:savedData(program)});}
 });
 let committed;
 try{committed=commitPrimitives(d.document,primitives,frame);}catch(error){if(refused&&error.code==='E-NATIVE-REFUSED')return {applied:false,result:refused};throw error;}
 for(const patch of committed.patches)if(patch.op==='set')d.set(patch.path,patch.value);else d.remove(patch.path);
 if(d.scheduler&&child?.scheduler)d.scheduler.seq=Math.max(d.scheduler.seq,child.scheduler.seq);
 if(child?.reactionTick?.queue.length){if(!d.reactionTick)d.reactionTick={...child.reactionTick,queue:[]};d.reactionTick.queue.push(...child.reactionTick.queue);}
 for(const message of child?.messages??[])if(child!==d)d.messages?d.messages.push(message):d.say?.(message);
 return {applied:true,results:committed.receipt.duplicate?committed.receipt.applied.map(effect=>effect.result):results,receipt:committed.receipt};
}
