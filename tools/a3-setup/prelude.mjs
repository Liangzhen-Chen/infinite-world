// setup.prelude: [{tool, args, eventId?, minute?}]. Premises that only a real
// game action can create (a filed case, a loan, an office appointment ...) are
// produced by running those actions, in order, through the engine's public
// preview + reduce entry points exactly as a player call would. A rejected or
// failing step stops the prelude and the row is setupUnmet: nothing is skipped,
// retried or rewritten. `minute` waits through core:time (never back) before
// the step, so elapsed time still runs the ordinary engine settlements.
import {applyPatches} from '../../server-plugin/storage.mjs';

const PRELUDE_TOOLS=['world_act','world_propose'];
const receiptOf=value=>value?.result?.receipt??value?.receipt??null;
const why=receipt=>`${receipt?.status??'no receipt'}${receipt?.code?` ${receipt.code}`:''}${receipt?.reason?`: ${receipt.reason}`:''}`;

async function commit(engine,document,call){
 const preview=receiptOf(await engine.previewAction(document,call));
 if(preview?.status!=='preview')throw Error(why(preview));
 const reduced=await engine.reduce(document,call),receipt=receiptOf(reduced);
 if(reduced.result?.ok===false||receipt?.status!=='committed')throw Error(why(receipt));
 return applyPatches(document,reduced.patches);
}

export async function runPrelude(engine,document,prelude){
 if(!Array.isArray(prelude))return {document,unmet:[{item:'prelude',reason:'expected an array of {tool,args,eventId?,minute?}'}]};
 for(const [i,step] of prelude.entries()){
  try{
   if(step===null||typeof step!=='object'||Array.isArray(step)||Object.keys(step).some(k=>!['tool','args','eventId','minute'].includes(k))||
    !PRELUDE_TOOLS.includes(step.tool)||step.args===null||typeof step.args!=='object'||Array.isArray(step.args)||
    step.eventId!==undefined&&(typeof step.eventId!=='string'||!step.eventId)||step.minute!==undefined&&!Number.isSafeInteger(step.minute))throw Error('expected {tool: world_act|world_propose, args, eventId?, minute?}');
   const eventId=step.eventId??`a3-prelude-${i}`;
   if(step.minute!==undefined){
    if(step.minute<document.state.minute)throw Error(`minute ${step.minute} is before the scene clock ${document.state.minute}`);
    if(step.minute>document.state.minute)document=await commit(engine,document,{tool:'world_act',args:{action:'core:time',slots:{minutes:step.minute-document.state.minute}},eventId:`${eventId}:wait`});
   }
   document=await commit(engine,document,{tool:step.tool,args:structuredClone(step.args),eventId});
  }catch(error){return {document,unmet:[{item:`prelude[${i}]`,reason:`prelude step failed: ${error.message}`}]};}
 }
 return {document,unmet:[]};
}
