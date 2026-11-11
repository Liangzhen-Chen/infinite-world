import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {relationView,applyNpcRelation} from '../server-plugin/npc-relations.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {executeLeaveMark} from '../server-plugin/mark-actions.mjs';
import {reactToMark} from '../server-plugin/mark-reactions.mjs';
import {publishTransitionEvent} from '../server-plugin/world-events.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world));
 // These causal-evidence cases enumerate the initial observers. Source
 // errands are outside that premise; their real movement is tested by K16.
 delete engine.rules.householdSubsistence;
 return {engine,document:engine.createCharacter(seed,{},'a3-causal')};
}
async function act(f,tool,args,eventId){
 const out=await f.engine.reduce(f.document,{tool,args,eventId});
 f.document=applyPatches(f.document,out.patches);return out;
}
const markInput=(eventId,tag='mark:insult')=>({eventId,args:{intent:'在这里刻下令人不快的话',form:'刻痕',tags:[tag]}});
const leave=(f,id,tag)=>{
 const out=executeLeaveMark(f.engine,f.document,markInput(id,tag));
 f.document=applyPatches(f.document,out.patches);return out.receipt.mark;
};
const reload=f=>{f.document=JSON.parse(JSON.stringify(f.document));};

test('A3 causal2: old-save trust is an immutable initial value; verified change then non-full attack use one view',async()=>{
 const f=fixture(),npc=Object.keys(f.document.state.npcs).find(id=>f.document.state.npcs[id].location===f.document.state.location&&f.engine.byId.get(id)?.tier!=='full');
 assert.ok(npc);
 // Supported legacy-save input, rather than a new gameplay relationship write.
 f.document.state.npcs[npc].trust=17;delete f.document.state.npcs[npc].relationships?.player;
 const initial=structuredClone(f.document);
 assert.equal(relationView(f.engine,f.document.state,npc,'player').trust,17);assert.deepEqual(f.document,initial);
 const mark=leave(f,'causal2-nonfull-mark'),reaction=mark.reactions.find(r=>r.observer===npc);assert.ok(reaction);
 assert.equal(relationView(f.engine,f.document.state,npc,'player').trust,15);
 reload(f);const out=await act(f,'world_combat',{target:npc,intent:'shove'},'causal2-nonfull-attack');
 assert.equal(relationView(f.engine,f.document.state,npc,'player').trust,10);
 assert.equal(f.document.state.npcs[npc].trust,17);
 assert.equal(subjectiveView(f.engine,f.document,npc).self.relations.player.trust,10);
 assert.ok(out.result.notices.some(n=>n.type==='relationship'));
 const row=relationView(f.engine,f.document.state,npc,'player');
 assert.ok(row.evidenceKeys.includes(`conflict:causal2-nonfull-attack:${npc}`));
 assert.ok(f.document.state.records['world_event:causal2-nonfull-attack']);
 const d=f.engine.primitiveDraft(f.document);
 assert.ok(applyNpcRelation(d,f.engine,{npc,eventType:'冲突',sourceEvent:'causal2-nonfull-attack'},'cite').changes.every(r=>r.duplicate));
 assert.deepEqual(d.patches,[]);
});

test('A3 causal2: credit consults verified trust rather than the unchanged legacy scalar',async()=>{
 const f=fixture();await act(f,'world_move',{destination:'bld_hw_qingdeng'},'causal2-credit-enter');
 const npc='npc_hw_linsui',before=structuredClone(f.document),args={seller:npc,item:'item_bread',quantity:1,payment:'credit'};
 const allowed=await f.engine.reduce(f.document,{tool:'world_trade',args,eventId:'causal2-credit-baseline'});assert.equal(allowed.result.ok,true);
 assert.deepEqual(f.document,before);
 const initial=f.document.state.npcs[npc].trust;leave(f,'causal2-credit-insult');
 assert.equal(f.document.state.npcs[npc].trust,initial);
 assert.equal(relationView(f.engine,f.document.state,npc,'player').trust,-2);
 const saved=structuredClone(f.document);
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_trade',args,eventId:'causal2-credit-refused'}),/不信任/);
 assert.deepEqual(f.document,saved);
});

test('A3 causal: every tier rejects missing/unrelated sources with zero writes; real observer evidence is idempotent after save',async()=>{
 const f=fixture(),nonfull=Object.keys(f.document.state.npcs).find(id=>f.engine.byId.get(id)?.tier!=='full');
 assert.ok(nonfull);
 for(const npc of [nonfull,'npc_hw_linsui']){
  const before=structuredClone(f.document);
  for(let i=0;i<2;i++)await assert.rejects(f.engine.reduce(f.document,{tool:'world_relation',args:{npc,eventType:'帮助',sourceEvent:'never-happened'},eventId:`fake-${npc}-${i}`}),{code:'E-ACTION-PRECONDITION'});
  assert.deepEqual(f.document,before);
 }
 // The initial village observer is a real skeleton-tier resident. No fake
 // relation evidence or historical event is inserted to build this premise.
 const marks=leave(f,'causal-village-mark'),observation=marks.reactions.find(r=>f.engine.byId.get(r.observer)?.tier!=='full');
 assert.ok(observation);
 const npc=observation.observer,sourceEvent=observation.event,eventType='间接受害';
 const before=structuredClone(f.document);
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_relation',args:{npc:'npc_hw_linsui',eventType,sourceEvent},eventId:'wrong-person'}),{code:'E-ACTION-PRECONDITION'});
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_relation',args:{npc,eventType:'帮助',sourceEvent},eventId:'wrong-type'}),{code:'E-ACTION-PRECONDITION'});
 await assert.rejects(f.engine.reduce(f.document,{tool:'world_relation',args:{npc,eventType,sourceEvent,trustDelta:10},eventId:'arbitrary-delta'}),{code:'E-ACTION-PRECONDITION'});
 assert.deepEqual(f.document,before);
 reload(f);
 for(const id of ['repeat-source-1','repeat-source-2']){
  const out=await act(f,'world_relation',{npc,eventType,sourceEvent},id);
  assert.ok(out.result.changes.every(c=>c.duplicate));
 }
 assert.deepEqual(f.document.state.npcs[npc],before.state.npcs[npc]);
 assert.deepEqual(f.document.state.relationEvidence,before.state.relationEvidence);
 assert.ok(f.document.state.records[`world_event:${sourceEvent}`]);
});

test('A3 causal: an open vital wound changes full NPC trust/fear from actual HP loss, with replayable source',async()=>{
 const f=fixture();await act(f,'world_move',{destination:'bld_hw_qingdeng'},'causal-enter-tavern');
 const target='npc_hw_linsui';assert.equal(f.document.state.npcs[target].location,f.document.state.location);
 // A real shove supplies contact evidence (co-presence supplies no range).
 await act(f,'world_combat',{target,intent:'shove'},'causal-contact');
 assert.ok(f.document.state.records[`local_actor_position:${target}`]);
 // Exercise the open executor without a matching authored action; all native
 // source bounds, checks, defenses, health and event consumers remain real.
 f.engine.world.actionDefinitions={format:1,actions:[]};
 let eventId;for(let i=0;;i++){
  const id=`causal-open-wound-${i}`;
  if(createHash('sha256').update(`${f.document.randomSeed}:${id}:d20`).digest().readUInt32LE(0)%20+1===20){eventId=id;break;}
 }
 const before=structuredClone(f.document),old=relationView(f.engine,before.state,target,'player');
 const input={tool:'world_propose',eventId,args:{intent:'用手掌击打眼前这个人',effects:[{op:'vital',target,delta:-9,type:'physical'}]}};
 const out=await f.engine.reduce(f.document,input);f.document=applyPatches(f.document,out.patches);
 const applied=out.result.receipt.applied.find(e=>e.op==='vital'&&e.target===target);
 assert.ok(applied);assert.ok(applied.result.damage>0);
 const now=relationView(f.engine,f.document.state,target,'player');
 assert.equal(now.trust,old.trust-5);assert.equal(now.affection,old.affection-3);
 assert.equal(now.fear,old.fear+Math.min(5,Math.max(1,Math.ceil(applied.result.damage/5))));
 const sourceEvent=`${eventId}:${applied.index}`,event=f.document.state.records[`world_event:${sourceEvent}`];
 assert.equal(event.verb,'harm');assert.equal(event.primitive,'vital');assert.equal(event.harm,applied.result.damage);
 assert.equal(event.result.targetHp,f.document.state.npcs[target].hp);
 assert.ok(now.evidenceKeys.includes(`conflict:${sourceEvent}:${target}`));
 assert.ok(f.document.state.npcs[target].developments.some(d=>d.source===sourceEvent&&d.delta?.fear>0));
 assert.deepEqual(f.document.state.inventory,before.state.inventory);
 reload(f);const saved=structuredClone(f.document),again=await f.engine.reduce(f.document,input);
 assert.equal(again.result.receipt.duplicate,true);assert.deepEqual(again.patches,[]);
 const d=f.engine.primitiveDraft(f.document);assert.equal(publishTransitionEvent(d,f.engine,event),false);assert.deepEqual(d.patches,[]);
 const cite=f.engine.primitiveDraft(f.document),repeat=applyNpcRelation(cite,f.engine,{npc:target,eventType:'冲突',sourceEvent},'causal-cite-wound');
 assert.ok(repeat.changes.every(c=>c.duplicate));assert.deepEqual(cite.patches,[]);
 assert.deepEqual(f.document.state.npcs[target],saved.state.npcs[target]);
});

test('A3 causal: only actual mark observers change standing; same author/tag/place decays and survives save',async()=>{
 const f=fixture();await act(f,'world_move',{destination:'bld_hw_qingdeng'},'causal-enter-for-marks');
 const before=structuredClone(f.document),first=leave(f,'causal-mark-first');
 assert.ok(first.reactions.length);
 const observed=new Set(first.reactions.map(r=>r.observer));
 for(const r of first.reactions){
  assert.equal(r.delta,-2);
  assert.equal(standing(f.engine,f.document.state,r.observer),standing(f.engine,before.state,r.observer)-2);
  assert.equal(f.document.state.npcs[r.observer].location,first.location);
  assert.ok(f.document.state.relationEvidence[`standing:${r.event}:${r.observer}:player`]);
 }
 const away=Object.keys(before.state.npcs).find(id=>before.state.npcs[id].location!==before.state.location);
 assert.ok(away);assert.equal(standing(f.engine,f.document.state,away),standing(f.engine,before.state,away));
 reload(f);const afterFirst=structuredClone(f.document),second=leave(f,'causal-mark-second');
 for(const r of second.reactions.filter(r=>observed.has(r.observer))){
  assert.equal(r.delta,-1);assert.equal(standing(f.engine,f.document.state,r.observer),standing(f.engine,afterFirst.state,r.observer)-1);
 }
 const afterSecond=structuredClone(f.document),third=leave(f,'causal-mark-third');assert.equal(third.suppressed,false);
 for(const r of third.reactions.filter(r=>observed.has(r.observer))){
  assert.equal(r.delta,0);assert.equal(standing(f.engine,f.document.state,r.observer),standing(f.engine,afterSecond.state,r.observer));
 }
 reload(f);const d=f.engine.primitiveDraft(f.document),entity=f.document.state.created[second.entity];
 assert.equal(reactToMark(d,f.engine,entity,{eventId:'causal-see-again'}).triggered,false);assert.deepEqual(d.patches,[]);
 // Moving to a different real location gives that location its own exposure
 // budget, while the observers left in the tavern receive no remote reaction.
 const saved=structuredClone(f.document);
 await act(f,'world_move',{destination:'loc_hw'},'causal-leave-tavern');
 const elsewhere=leave(f,'causal-mark-elsewhere');assert.ok(elsewhere.reactions.length);
 assert.ok(elsewhere.reactions.every(r=>r.delta===-2));
 for(const id of observed)assert.equal(standing(f.engine,f.document.state,id),standing(f.engine,saved.state,id));
});
