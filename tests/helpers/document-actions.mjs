import assert from 'node:assert/strict';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {applyIntentSetup} from '../../tools/a3-score.mjs';

export async function documentCall(engine,document,operation,slots={},eventId=`doc-${operation}`){
 const out=await engine.reduce(document,{tool:'world_act',eventId,args:{action:`documents:${operation}`,slots}});
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 return {document:applyPatches(document,out.patches),result:out.result};
}
export async function documentScene(engine,initial,{kind='receipt',content='购得原件所指物品',prefix='document',paperQuantity=2}={}){
 const loaded=applyIntentSetup(engine,initial,{location:'bld_hw_school',minute:600,present:['npc_hw_luqing'],coins:1000,abilitiesByActor:{player:{skills:{skill_literacy:500}}}});
 assert.deepEqual(loaded.setupUnmet,[]);
 const beforePurchase=loaded.document;
 let document=beforePurchase;
 for(const [item,quantity,suffix]of [['item_quill_set',1,'goods'],['item_parchment',paperQuantity,'paper']]){
  const out=await engine.reduce(document,{tool:'world_act',eventId:`${prefix}-${suffix}`,args:{action:'core:trade.trade',slots:{seller:'npc_hw_luqing',item,quantity}}});
  assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));document=applyPatches(document,out.patches);
 }
 const out=await documentCall(engine,document,'issue',{source:`${prefix}-goods`,paper:'item_parchment',kind,text:content},`${prefix}-issue`);
 return {...out,beforePurchase,beforeIssue:document,id:out.result.document,source:`world_event:${prefix}-goods`,target:out.result.describes};
}
