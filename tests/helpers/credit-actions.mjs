import assert from 'node:assert/strict';
import {applyIntentSetup} from '../../tools/a3-score.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';

export async function creditCall(f,args,eventId){
 const out=await f.engine.reduce(f.document,{tool:'world_trade',args:{seller:'npc_hw_shendu',...args},eventId});
 f.document=applyPatches(f.document,out.patches);return out.result;
}
export async function nativeDeposit(engine,initial,{prefix='deposit',vaultCash}={}){
 // Opening cash, literacy, blank paper and teller availability are premises;
 // the deposit, its canonical debt and the named original are real actions.
 const setup=applyIntentSetup(engine,initial,{minute:600,location:'bld_hw_post',coins:101,inventory:{item_parchment:1},abilitiesByActor:{player:{skills:{skill_literacy:500}}}});
 assert.deepEqual(setup.setupUnmet,[]);
 const f={engine,document:setup.document};
 const deposited=await creditCall(f,{operation:'deposit',coins:101},`${prefix}-fund`);
 const issued=await engine.reduce(f.document,{tool:'world_act',args:{action:'documents:issue',slots:{source:`${prefix}-fund`,paper:'item_parchment',kind:'receipt'}},eventId:`${prefix}-paper`});
 assert.notEqual(issued.result.receipt?.status,'rejected',JSON.stringify(issued.result));
 f.document=applyPatches(f.document,issued.patches);f.claim=deposited.claim;f.paper=issued.result.document;
 assert.ok(f.paper);assert.equal(f.document.state.obligations[f.claim].amount,100);
 if(vaultCash!==undefined){
  const depleted=applyIntentSetup(engine,f.document,{facts:[{path:['state','records','bank_hw_post','coins'],value:vaultCash}]});
  assert.deepEqual(depleted.setupUnmet,[]);f.document=depleted.document;
 }
 return f;
}
