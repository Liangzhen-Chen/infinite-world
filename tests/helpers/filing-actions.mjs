import assert from 'node:assert/strict';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {officeScene} from './office-actions.mjs';

// Procedural fixture only: the existing desk receives an actual submission,
// and its NPC makes the decision. No case, evidence or consent is seeded.
export async function acceptReported(engine,document,submission,eventId){
 const location=document.state.location,handler='npc_bs_035_1';
 const desk=officeScene(engine,document,{location:'bld_bs_watch',minute:document.state.minute,present:[handler]});
 const out=await engine.reduce(desk,{tool:'world_act',eventId,args:{action:'law:request_decision',slots:{authority:handler,request:submission.request}}});
 const result=out.result.receipt?.legacy??out.result;
 assert.equal(result.accepted,true,JSON.stringify(out.result));
 assert.equal(result.decision.source.kind,'npc_decision');assert.equal(result.decision.source.actor,handler);
 return {document:officeScene(engine,applyPatches(desk,out.patches),{location,minute:desk.state.minute,present:[]}),result};
}

export async function submitKnownWitnesses(engine,document,id,eventId){
 const row=document.state.records[id],source=row.sourceEvent,event=document.state.records[`world_event:${source}`];
 const witnesses=(event.witnesses??[]).filter(w=>w!=='player'&&w!==row.offender);
 document=officeScene(engine,document,{location:row.court,minute:document.state.minute,present:witnesses});
 for(const witness of witnesses){
  if(document.state.records[id].evidence.some(e=>e.witness===witness&&e.source===source))continue;
  const out=await engine.reduce(document,{tool:'world_act',eventId:`${eventId}:${witness}`,args:{action:'law:submit_evidence',slots:{case:id,witness,source}}});
  assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));document=applyPatches(document,out.patches);
 }
 return document;
}
