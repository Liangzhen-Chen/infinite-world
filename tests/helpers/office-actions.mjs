import assert from 'node:assert/strict';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {applyIntentSetup} from '../../tools/a3-score.mjs';

export async function officeCall(engine,document,operation,slots={},eventId=operation){
 const out=await engine.reduce(document,{tool:'world_act',eventId,args:{action:`institutions:office.${operation}`,slots}});
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 return {document:applyPatches(document,out.patches),result:out.result};
}
export function officeScene(engine,initial,{location='bld_bs_office',minute=540,present=['npc_bs_townhead'],...rest}={}){
 const instances=present.filter(id=>!initial.state.npcs?.[id]&&engine.world.factionPeople?.some(p=>p.id===id)).map(id=>({id,kind:'person',template:'agent',location}));
 const loaded=applyIntentSetup(engine,initial,{location,minute,present,...(instances.length?{instances}:{}),...rest});
 assert.deepEqual(loaded.setupUnmet,[]);return loaded.document;
}
export async function appointedClaimClerk(engine,initial,{name='office_bs_claim_desk',authority='npc_bs_townhead'}={}){
 let document=officeScene(engine,initial);
 let out=await officeCall(engine,document,'apply',{name},'claim-apply');document=out.document;
 const request=out.result.application;
 out=await engine.reduce(document,{tool:'world_time',args:{minutes:60},eventId:'claim-review-wait'});document=applyPatches(document,out.patches);
 out=await officeCall(engine,document,'decide',{name,authority,request},'claim-decide');document=out.document;
 assert.equal(out.result.decision.status,'已批准',JSON.stringify(out.result));
 out=await officeCall(engine,document,'appoint',{name,authority,request},'claim-appoint');
 return {document:out.document,name,authority,request};
}
