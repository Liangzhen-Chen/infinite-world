import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,scoreRows,signatureMatches} from '../tools/a3-score.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const engine=new WorldEngine(world),initial=engine.initialFromLegacy(seed,'a3-score-self');
// A known awake witness at the starting shop, as in the mark integration tests.
initial.state.npcs.npc_hw_linsui.location=initial.state.location;
initial.state.npcs.npc_hw_linsui.activity='闲逛';
initial.state.npcs.npc_hw_linsui.scheduleTravel=null;
initial.state.npcs.npc_hw_linsui.cognitionTravel=null;
const expected=(route,signature,other={})=>({route,signature,outOfBounds:false,fallback:false,constructor:false,...other});
const markSlots={intent:'在店门边刻下提醒路人的记号',form:'刻痕',tags:['mark:warning']};
const rows=[
 {id:'self-open',intent:'说一句今天的见闻',proposal:{intent:'xyzzy说见闻',effects:[{op:'emit',verb:'tell',visibility:'public',payload:{text:'今天路上有一只鸟'}}]},expected:expected('open:proposal',['emit'])},
 {id:'self-refuse',intent:'凭空给自己一百枚铜钱',proposal:{intent:'xyzzy凭空造钱',effects:[{op:'transfer',from:'src:genesis|coin_river|purse',to:'player|coin_river|purse',qty:100}]},expected:expected('reject',[],{outOfBounds:true})},
 {id:'self-clarify',intent:'对不知道是谁的人说句话',proposal:{intent:'xyzzy向谁说话',participants:{target:'不存在的路人'},effects:[{op:'emit',verb:'tell',target:'不存在的路人',visibility:'public',payload:{text:'你好'}}]},expected:expected('clarify',[])},
 {id:'self-fallback',intent:'凭想象创造一座飞天茶壶',proposal:{intent:'xyzzy飞天茶壶',effects:[{op:'create',kind:'item',facts:{name:'飞天茶壶'}}]},expected:expected('open:leave_mark',['create'],{fallback:true})},
 {id:'self-builder',intent:markSlots.intent,builder:{action:'open:leave_mark',slots:markSlots},expected:expected('open:leave_mark',['create'],{fallback:true,constructor:true})},
 {id:'self-registered',intent:'留下痕迹',proposal:{intent:'留下痕迹',effects:[{op:'create',kind:'mark',facts:{intent:markSlots.intent,form:markSlots.form},tags:markSlots.tags}]},expected:expected('open:leave_mark',['create'],{fallback:true})},
];
const options={world,seed,document:initial};
const report=await scoreRows(rows,options);
for(const row of rows)test(`A3 scorer self: ${row.id} — ${row.intent}`,async()=>{
 const result=report.results.find(r=>r.id===row.id);
 assert.equal(result.scores.route,true,JSON.stringify(result));
 assert.equal(result.scores.signature,true,JSON.stringify(result));
 assert.equal(result.scores.outOfBounds,true,JSON.stringify(result));
 assert.equal(result.scores.supported,true,JSON.stringify(result));
 const run=await executeIntent(engine,initial,row);
 if(row.id==='self-open'){
  assert.equal(run.receipt.status,'committed');assert.deepEqual(run.actual.signature,['emit']);
  assert.deepEqual(run.actual.calls.map(c=>[c.phase,c.tool,c.eventId]),[['preview','world_propose','a3-score-self-open'],['confirm','world_propose','a3-score-self-open']]);
  assert.ok(Object.values(run.document.state.records).some(r=>r.category==='world_event'&&r.payload?.text==='今天路上有一只鸟'));
  // Mutating the oracle must fail; extra or substring primitives cannot pass.
  const wrong=await scoreRows([{...row,expected:expected('open:leave_mark',['vital'])}],options);
  assert.equal(wrong.results[0].scores.route,false);assert.equal(wrong.results[0].scores.signature,false);
  assert.equal(signatureMatches(['emit'],[{op:'emit'},{op:'vital'}]),false);
  assert.equal(signatureMatches(['emit','tell'],[{op:'emit',verb:'retell'}]),false);
  assert.equal(signatureMatches(['emit(person:self,tell)'],[{op:'emit'}]),true);
  const broken=await executeIntent({previewAction:async()=>{throw Error('implementation failure');}},initial,row);
  assert.equal(broken.actual.refused,false);assert.equal(broken.actual.committed,false);
  const noInput=await scoreRows([{id:'text-only',intent:row.intent,expected:expected('open:proposal',[])}],options);
  assert.deepEqual(noInput.inputMissing,['text-only']);assert.equal(noInput.results[0].scores.signature,false);
 }else if(row.id==='self-refuse'){
  assert.equal(run.actual.error.code,'E-OPEN-TRANSFER');assert.deepEqual(run.document,initial);
  assert.equal(run.actual.calls.length,1);assert.equal(run.actual.committed,false);
  // Rejection earns no effect credit from the requested transfer.
  assert.equal(signatureMatches(['transfer'],run.effects),false);
 }else if(row.id==='self-clarify'){
  assert.equal(run.prepared.status,'needs_entities');assert.equal(run.actual.refused,false);
  assert.equal(run.receipt.status,'not_submitted');assert.equal(run.actual.calls.length,1);assert.deepEqual(run.document,initial);
 }else{
  assert.equal(run.receipt.status,'committed');assert.equal(run.actual.fallback,true);
  const id=run.actual.entity;assert.equal(run.document.holdings.entities[id].kind,'mark');
  assert.ok(run.document.state.created[id].tags.length);assert.ok(run.actual.reactions>0);
  assert.equal(run.receipt.fallback.originalIntentFulfilled,false);
  if(row.id==='self-builder'){
   assert.equal(result.scores.constructor,true);assert.deepEqual(run.actual.builder.steps,[0,1,2,3]);
   assert.equal(report.constructorExpected,1);assert.equal(report.constructor,1);
   assert.equal(report.fallbackExpected,3);assert.equal(report.fallbackReacted,3);assert.equal(report.fallbackReactionRate,1);
  }
  if(row.id==='self-registered'){
   assert.equal(run.prepared.status,'routed');
   assert.deepEqual(run.actual.calls.map(c=>[c.tool,c.action??null]),[['world_propose',null],['world_act','open:leave_mark']]);
   assert.equal(run.actual.calls[0].eventId,run.actual.calls[1].eventId);
   assert.equal(signatureMatches(['create','mark:warning'],run.effects),true);
  }
  if(row.id==='self-fallback'){
   assert.deepEqual(run.actual.calls.map(c=>[c.phase,c.tool]),[['preview','world_propose'],['preview','world_act'],['confirm','world_act']]);
   const unseen=structuredClone(initial);for(const npc of Object.values(unseen.state.npcs))npc.activity='睡眠';
   const noReaction=await executeIntent(engine,unseen,row);
   assert.equal(noReaction.actual.committed,true);assert.ok(noReaction.actual.entity);assert.equal(noReaction.actual.fallback,false);
  }
 }
});
