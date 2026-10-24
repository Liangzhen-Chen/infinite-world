import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../../tools/load-world.mjs';
import {WorldEngine} from '../../server-plugin/engine.mjs';
import {applyPatches} from '../../server-plugin/storage.mjs';
import {officeScene} from './office-actions.mjs';
import {documentScene} from './document-actions.mjs';
import {npcPlanFingerprint} from '../../server-plugin/npc-autonomy.mjs';
import {commitNpcCrime} from '../../server-plugin/npc-crime.mjs';

export const trialPeople={judge:'npc_hw_chenbai',reviewer:'npc_hw_luqing',guard:'npc_hw_gucen',handler:'npc_bs_035_1',victim:'npc_hw_linsui',culprit:'npc_hw_hezhou'};
export async function nativeLegalRequestRow(input,n){
 const f=await nativeTrial({paper:n===52,itemTheft:n===52}),row=structuredClone(input);
 if(n===52){
  await trialCall(f,'request_hearing',{case:f.case,authority:trialPeople.judge},'request-premise-hearing');
  await trialCall(f,'submit_evidence',{case:f.case,document:f.paper},'request-premise-paper');
  trialScene(f,'bld_bs_office',['npc_bs_034_1']);
 }else trialScene(f,'bld_bs_watch',[trialPeople.handler]);
 row.setup={};
 const effect=row.proposal.effects[0],target=n===52?'bld_bs_office':trialPeople.handler;
 effect.target=target;row.proposal.target=target;
 effect.payload={...effect.payload,terms:{...effect.payload.terms,case:f.case,...(n===52?{evidence:[f.paper]}:{})}};
 return {...f,row,setupUnmet:[]};
}
export async function trialCall(f,operation,slots={},eventId=operation){
 const action=operation.includes(':')?operation:`law:${operation}`;
 const input={tool:'world_act',eventId,args:{action,slots}};
 const out=await f.engine.reduce(f.document,input);
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 f.document=applyPatches(f.document,out.patches);
 return {input,...out,detail:out.result.receipt?.legacy??out.result};
}
export function trialScene(f,location,present){
 f.document=officeScene(f.engine,f.document,{location,minute:f.document.state.minute,present});
 return f;
}
export async function nativeTrial({confess=true,paper=false,paperQuantity=2,itemTheft=false,advocate=false,npcDefendant=false,stays=true,threshold=2,world:given=null}={}){
 const world=given??structuredClone(await loadWorld()),people=trialPeople;
 const code=world.rules.law.codes.find(c=>c.id==='law_hw_property');
 code.procedure={...code.procedure,appealWindowMinutes:1440,evidence:{weights:{eyewitness:1,statement:0,confession:2,document:3},stanceDiscount:0.5,convictionThreshold:{theft:threshold}},appealStaysExecution:{criminal:stays,civil:false},refundOnReversal:true};
 code.appeal={judges:[people.reviewer],minutes:5};code.hearingMinutes=5;
 // Procedural interviews isolate schedules; actual place and capacity are still checked.
 for(const n of world.npcs)if(Object.values(people).includes(n.id)){delete n.schedule;if(!advocate||n.id!==people.reviewer)delete n.tier;}
 const engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile(new URL('../fixtures/legacy/seed.json',import.meta.url),'utf8'));
 let document=engine.createCharacter(seed,{},'s407-trial');
 document=officeScene(engine,document,{location:'bld_hw_qingdeng',minute:600,present:[people.guard,people.victim,...(npcDefendant?[people.culprit]:[])],coins:1000,abilitiesByActor:{player:{skills:{skill_literacy:1200}}}});
 const f={engine,document,code:engine.rules.law.codes.find(c=>c.id===code.id)};
 if(advocate){
  for(let day=0;day<3;day++){
   trialScene(f,'bld_hw_school',[people.reviewer]);
   const taught=await engine.reduce(f.document,{tool:'world_learn',args:{entity:'skill_literacy',source:'player',student:people.reviewer},eventId:`advocate-teach-${day}`});
   assert.equal(taught.result.ok,true,JSON.stringify(taught.result));f.document=applyPatches(f.document,taught.patches);
   const waited=await engine.reduce(f.document,{tool:'world_time',args:{minutes:1440-f.document.state.minute%1440+600},eventId:`advocate-next-day-${day}`});f.document=applyPatches(f.document,waited.patches);
  }
  const planned=await engine.reduce(f.document,{type:'npc_plan',eventId:'advocate-new-vocation',plan:{kind:'npc-plan',version:1,minute:f.document.state.minute,stateFingerprint:npcPlanFingerprint(f.document),proposals:[{npc:people.reviewer,actions:[{kind:'switch_vocation',vocation:'vocation_advocate'}]}]}});
  assert.equal(planned.result.results[0].status,'已完成',JSON.stringify(planned.result));f.document=applyPatches(f.document,planned.patches);
  trialScene(f,'bld_hw_qingdeng',[people.guard,people.victim]);
 }
 if(paper){const bought=await documentScene(engine,document,{paperQuantity});f.document=bought.document;f.paper=bought.id;f.item=bought.target;trialScene(f,'bld_hw_qingdeng',[people.guard,people.victim]);}
 if(itemTheft)await trialCall(f,'open:proposal',{intent:'transfer owned item',effects:[{op:'transfer',resource:'item_quill_set',from:'player',to:people.victim,qty:1}]},'trial-give-item');
 const before=f.document;
 let incident;
 if(npcDefendant){
  const d=engine.primitiveDraft(f.document),id=commitNpcCrime(d,engine,{actor:people.culprit,victim:people.victim,offense:'theft',need:'money',intelligence:2},f.document.state.minute);
  assert.ok(id);f.document=applyPatches(f.document,d.patches);incident={input:{eventId:f.document.state.records[id].sourceEvent},detail:{case:id}};
 }
 for(let i=0;!incident&&i<40;i++){
  const g={...f,document:before},out=await trialCall(g,'core:crime.steal',{target:people.victim,...(itemTheft?{item:'item_quill_set'}:{coins:1})},`trial-theft-${i}`);
  if(out.detail.success&&(confess||out.detail.witnesses?.includes(people.victim))){f.document=g.document;incident=out;break;}
 }
 assert.ok(incident,'actual successful theft');f.incident=incident.input.eventId;
 trialScene(f,'bld_hw_qingdeng',[people.guard,people.victim]);
 const report=await trialCall(f,confess?'core:law.confess':'core:law.report',{authority:people.guard,...(confess?{request:{kind:'confession',incident:f.incident}}:{reporter:npcDefendant?'player':people.victim,case:incident.detail.case})},'trial-report');
 trialScene(f,'bld_bs_watch',[people.handler]);
 const accepted=await trialCall(f,'law:request_decision',{authority:people.handler,request:report.detail.request},'trial-accept');
 assert.equal(accepted.detail.accepted,true);f.case=accepted.detail.case;
 trialScene(f,f.code.court,[people.judge,people.reviewer,people.guard]);
 return f;
}

export async function nativeDefenceRow(input){
 const f=await nativeTrial({advocate:true});trialScene(f,'bld_bs_office',[trialPeople.reviewer]);
 const row=structuredClone(input);row.setup={};
 const request=row.proposal.effects[0];request.target=trialPeople.reviewer;request.payload.terms={...request.payload.terms,case:f.case,quoteOnly:true};
 return {...f,row,setupUnmet:[]};
}
