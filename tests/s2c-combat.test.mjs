import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,draft} from './probes/harness.mjs';
import {adjustStanding} from '../server-plugin/standing.mjs';
import {isGone} from '../server-plugin/lifecycle-state.mjs';
import {assertTransitionInvariants} from '../server-plugin/transition.mjs';
import {actionLines} from '../server-plugin/action-text.mjs';
const A='npc_hw_ayan',B='npc_hw_chenbai',W='npc_hw_gucen';
async function fight(rule,attackerLevel,targetLevel){
 const S=setup();let doc=S.doc;doc.state.minute=540;doc.state.location='bld_hw_qingdeng';
 for(const id of [A,B,W]){
  Object.assign(doc.state.npcs[id],{location:doc.state.location,status:'正常',activity:'闲谈'});
  S.engine.byId.get(id).personality={traits:['尚武','争强']};
 }
 doc.state.npcs[A].level=attackerLevel;doc.state.npcs[B].level=targetLevel;
 // A level advantage alone cannot guarantee the first touch: a miss followed
 // by a countertouch is a legal loss. Give the clamp fixture the explicit
 // accuracy advantage its first-hit assertion requires, retaining the RNG.
 if(rule==='touch')doc.state.npcs[A].attributes={...Object.fromEntries(S.engine.rules.attributes.map(k=>[k,10])),敏捷:30};
 const d=draft(doc);
 for(const [a,b] of [[A,B],[B,A]])adjustStanding(d,S.engine,a,b,-100,{sourceEvent:`rival:${a}`,reason:'宿敌'});
 doc=d.document;
 const started=await S.run(doc,'world_settlement',{operation:'duel_challenge',speaker:A,member:B,authority:W,choice:rule},`challenge:${rule}`);doc=started.document;
 assert.equal(started.result.status,'已接受');
 const before=structuredClone(doc),exchanges=[];
 for(let i=0;i<30;i++){
  const out=await S.run(doc,'world_combat',{actor:A,target:B},`exchange:${rule}:${i}`);doc=out.document;exchanges.push(out.result);
  if(out.result.duelResult)return {S,before,doc,exchanges,result:out.result};
 }
 assert.fail('已接受的实战未结束');
}
test('双 NPC 点到为止复用真实实力、伤害、时钟，双方保命且玩家不受伤',async()=>{
 const {S,before,doc,exchanges,result}=await fight('touch',25,1);
 assert.equal(result.duelResult.winner,A,JSON.stringify({seed:doc.randomSeed,exchanges}));assert.equal(result.duelResult.reason,'点到为止');
 assert.equal(doc.state.npcs[B].hp,1);assert.ok(result.damage>0);
 assert.equal(isGone(S.engine,doc,A),false);assert.equal(isGone(S.engine,doc,B),false);
 assert.equal(doc.state.player.hp,before.state.player.hp);assert.equal(doc.state.player.xp,before.state.player.xp);
 const event=doc.state.records[`world_event:exchange:touch:${exchanges.length-1}`];
 assert.equal(event.actor,A);assert.equal(event.target,B);assert.equal(event.verb,'duel');
 const text=actionLines({engine:S.engine,action:{narration:'combat'},before,after:doc,args:{actor:A,target:B},result}).lines[0];
 assert.equal(text,`${doc.state.npcs[A].name}对${doc.state.npcs[B].name}出手。`);
 // D31.4 / action-costs combat.bout: preserve exact total time for every
 // real exchange, including sub-minute carry, at the new one-minute rate.
 assert.equal((doc.state.minute-before.state.minute)*60+(doc.state.subMinuteSeconds??0)-(before.state.subMinuteSeconds??0),exchanges.length*60);
});
test('双 NPC 生死战与反击均走死亡协议，仅有一个终止回执且玩家无经验收益',async()=>{
 for(const [a,b,winner,loser] of [[25,1,A,B],[1,25,B,A]]){
  const {S,before,doc,result}=await fight('death',a,b);
  assert.equal(result.duelResult.winner,winner);assert.equal(result.duelResult.reason,'生死已分');
  assert.equal(isGone(S.engine,doc,loser),true);assert.equal(isGone(S.engine,doc,winner),false);
  assert.equal(doc.state.npcs[loser].hp,0);assert.equal(doc.state.player.xp,before.state.player.xp);
  assert.equal(Object.values(doc.state.records).filter(r=>r.category==='transition'&&r.entity===loser).length,1);
  assert.ok(Object.values(doc.state.records).filter(r=>r.category==='legal_case').every(r=>r.offender!=='player'));
  const d=draft(doc);d.engine=S.engine;
  assertTransitionInvariants(d,S.engine,loser);
  const refused=await S.attempt(doc,'world_combat',{actor:A,target:B},'already-ended');assert.ok(refused.error);
 }
});
test('不能指定未同意约斗的 NPC 代替玩家攻击',async()=>{
 const S=setup();for(const id of [A,B])Object.assign(S.doc.state.npcs[id],{location:S.doc.state.location,status:'正常',activity:'闲谈'});
 const out=await S.attempt(S.doc,'world_combat',{actor:A,target:B},'no-consent');assert.match(out.error,/已接受/);
});
