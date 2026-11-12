import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {ActionBuilder} from '../extension/action-builder.mjs';
import {builderToolCall} from '../extension/tools.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {environmentCatalog} from '../server-plugin/environment.mjs';
import {acceptReported,submitKnownWitnesses} from './helpers/filing-actions.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {npcRumors} from '../server-plugin/npc-rumors.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
const INN='bld_hw_qingdeng',NPC='npc_hw_linsui',BUCKET='feature_hw_kitchen_bucket';
const row=n=>structuredClone(corpus.find(r=>r.id===`A3V2-${n}`));
function fixture(id='a3-scenes'){
 const w=structuredClone(world);
 // Fixed scene participants, before the first event; no successful outcome is seeded.
 for(const n of w.npcs)if([NPC,'npc_hw_hezhou','npc_hw_gucen','npc_hw_chenbai'].includes(n.id)){
  delete n.schedule;n.tier='full';
  if(n.id==='npc_hw_gucen')n.location=INN;
  if(n.id==='npc_hw_chenbai')n.location='bld_hw_council';
 }
 const engine=new WorldEngine(w);return {engine,document:engine.initialFromLegacy(seed,id)};
}
function clean(engine,document){assert.deepEqual(auditLedger(document.ledger),[]);assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});}
async function act(engine,document,action,slots,eventId){
 const input={tool:'world_act',args:{action,slots},eventId},out=await engine.reduce(document,input);
 assert.notEqual(out.result?.receipt?.status,'rejected',JSON.stringify(out.result));
 return {document:applyPatches(document,out.patches),result:out.result,input};
}
async function built(engine,document,action,slots,eventId){
 let current=document;
 const builder=new ActionBuilder({newEventId:()=>eventId,
  preview:async(a,s,id)=>({...await engine.previewAction(current,{...builderToolCall(a,s),eventId:id}),reference:{sequence:0}}),
  act:async(a,s,{eventId:id})=>{const out=await engine.reduce(current,{...builderToolCall(a,s),eventId:id});current=applyPatches(current,out.patches);return {ok:true,result:out.result};},
 });
 const offer=worldActions(engine.scoped(document),document,{query:action}).actions.find(a=>a.id===action);
 assert.ok(offer,action);builder.choose(offer);
 for(const [key,value] of Object.entries(slots))builder.setSlot(key,value);
 const before=structuredClone(document);await builder.preview();assert.ok(builder.quote,builder.error);assert.deepEqual(document,before);
 const out=await builder.confirm();assert.equal(out.ok,true,out.error);assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 return {document:current,result:out.result};
}

test('F5 净水后出售同一份原水：提案和构造器同 seed 事实等价，钱水与污染守恒',async()=>{
 const f=fixture(),r=row('068'),setup=r.setup;
 // S5-02: retain the player's hydration independently of the examined four
 // water portions. Body3/h *24h =72; three native milk portions *44 (0.5kg*0.881*100, derived) =132.
 // Perishable milk is retained first, so the cleaned original can be sold.
 setup.inventory={item_water:4,item_milk:3};setup.coins=0;
 setup.objects[0]={...setup.objects[0],owner:'player',waterLiters:1,turbidity:40,contents:[{inventoryBinding:{item:'item_water',quantity:4,mode:'same_stock'}}]};
 setup.holdings=[{id:'f5_bucket_title',kind:'owns',holder:'player',subject:BUCKET,terms:{share:1}}];
 const loaded=applyIntentSetup(f.engine,f.document,setup);assert.deepEqual(loaded.setupUnmet,[]);
 const before=loaded.document,raw=structuredClone(before.state.records[`physical_feature:${BUCKET}`].state);
 const untouched=structuredClone(before);
 const input={tool:'world_propose',eventId:'f5-clean',args:r.proposal};
 const preview=await f.engine.previewAction(before,input);assert.notEqual(preview.receipt.status,'rejected');assert.deepEqual(before,untouched);
 const reduced=await f.engine.reduce(before,input),direct=applyPatches(before,reduced.patches);
 assert.equal(reduced.result.receipt.status,'committed');assert.equal(reduced.result.receipt.check.success,true);
 const constructed=await built(f.engine,before,'open:proposal',r.proposal,'f5-clean');
 assert.deepEqual(constructed.document.state,direct.state);assert.deepEqual(constructed.document.ledger,direct.ledger);
 const water=direct.state.records[`physical_feature:${BUCKET}`].state;
 assert.equal(water.turbidity,0);assert.equal(water.waterMl,1000);
 for(const key of ['saltMg','toxinUg','pathogenRisk'])assert.equal(water[key],raw[key]);
 assert.equal(direct.state.player.mp,before.state.player.mp-f.engine.byId.get('spell_water_02').mp);
 assert.ok(direct.state.minute>before.state.minute);
 const unit=Object.values(direct.state.itemInstances).find(u=>u.container===BUCKET&&u.item==='item_water');assert.ok(unit);
 const taken=await act(f.engine,direct,'core:environment.take_contents',{target:BUCKET,instance:unit.id},'f5-decant');
 assert.equal(taken.document.state.itemInstances[unit.id].liquid.waterMl,250);
 assert.equal(taken.document.state.itemInstances[unit.id].liquid.turbidity,0);
 const sale=await built(f.engine,taken.document,'core:trade.sell_to',{buyer:NPC,item:'item_water',quantity:1},'f5-sale'),after=sale.document;
 assert.equal(after.state.itemInstances[unit.id].owner,NPC);assert.equal(after.state.itemInstances[unit.id].liquid.waterMl,250);
 assert.equal(after.state.player.coins-taken.document.state.player.coins,sale.result.cost);
 assert.equal(taken.document.state.npcs[NPC].coins-after.state.npcs[NPC].coins,sale.result.cost);
 assert.equal(after.state.minute-taken.document.state.minute,5);
 assert.equal(after.state.records[`physical_feature:${BUCKET}`].state.waterMl+after.state.itemInstances[unit.id].liquid.waterMl,1000);
 for(const key of ['saltMg','toxinUg'])assert.equal(after.state.records[`physical_feature:${BUCKET}`].state[key]+after.state.itemInstances[unit.id].liquid[key],raw[key]);
 assert.match(environmentCatalog(f.engine,after,{entity:BUCKET}).waterSafety,/不等于/);
 clean(f.engine,after);
 const again=await f.engine.reduce(JSON.parse(JSON.stringify(after)),{tool:'world_act',eventId:'f5-sale',args:{action:'core:trade.sell_to',slots:{buyer:NPC,item:'item_water',quantity:1}}});assert.deepEqual(again.patches,[]);
});

test('F6 偷窃有无见证：真实案件、立场、私有记忆和可讲传闻；提案与构造器同 seed 等价',async()=>{
 for(const witnessed of [false,true]){
  const f=fixture(),setup={location:INN,minute:600,present:[NPC,'npc_hw_hezhou','npc_hw_gucen'],coins:500};
  const loaded=applyIntentSetup(f.engine,f.document,setup);assert.deepEqual(loaded.setupUnmet,[]);
  const before=loaded.document;
  // Sleep is an input condition, never an inserted witness/outcome.
  if(!witnessed)for(const n of Object.values(before.state.npcs))if(n.location===INN)n.activity='熟睡';
  const intent={intent:'趁林穗不注意偷十铜，成败按实际检定',target:NPC,effects:[{op:'transfer',from:NPC,to:'player',resource:'coin_river',qty:10}],means:{manner:'steal',theft:true}};
  const input={tool:'world_propose',args:intent,eventId:'f6-theft'};
  const out=await f.engine.reduce(before,input),after=applyPatches(before,out.patches);
  assert.equal(out.result.receipt.status,'committed');assert.equal(out.result.receipt.routed,'core:crime.steal');
  const viaBuilder=await built(f.engine,before,'open:proposal',intent,'f6-theft');assert.deepEqual(viaBuilder.document,after);
  const incident=Object.values(after.state.records).find(r=>r.category==='legal_suspicion'&&r.sourceEvent==='f6-theft');assert.ok(incident);
  assert.equal(after.state.minute-before.state.minute,5);
  const stolen=after.state.player.coins-before.state.player.coins;
  assert.ok(stolen===0||stolen===10);assert.equal(before.state.npcs[NPC].coins-after.state.npcs[NPC].coins,stolen);
  if(!witnessed){
   assert.deepEqual(incident.witnesses,[]);assert.equal(incident.status,'未报案');
   assert.equal(standing(f.engine,after.state,NPC,'player'),standing(f.engine,before.state,NPC,'player'));
   assert.ok(!(after.state.npcs[NPC].memoryStream??[]).some(m=>m.sourceEvent==='f6-theft'));
   assert.ok(!npcRumors(f.engine,NPC,after).some(r=>r.id==='rumor_event:f6-theft'));
  }else{
   assert.ok(incident.witnesses.length>0,'固定 seed 必须产生真正见证，不能拿空分支充数');
   const observer=incident.witnesses[0],memories=after.state.npcs[observer].memoryStream??[];
   assert.ok(memories.some(m=>m.sourceEvent==='f6-theft'));
   assert.ok(standing(f.engine,after.state,observer,'player')<standing(f.engine,before.state,observer,'player'));
   const rumor=npcRumors(f.engine,observer,after).find(r=>r.id==='rumor_event:f6-theft');assert.ok(rumor);
   assert.equal(after.state.records['world_event:f6-theft'].visibility,'private');
   for(const id of Object.keys(after.state.npcs).filter(id=>!incident.witnesses.includes(id))){
    assert.ok(!npcRumors(f.engine,id,after).some(r=>r.id===rumor.id),'未见证者不能凭私密嫌疑获得传闻');
   }
   const heardRumor=await act(f.engine,after,'core:remember',{subject:'player',key:rumor.id,rumor:rumor.id,source:observer,content:rumor.claim},'f6-hear-rumor');
   assert.equal(heardRumor.result.rumor,rumor.id);assert.equal(heardRumor.result.reliability,'未核实');
   assert.equal(heardRumor.document.state.player.coins,after.state.player.coins);clean(f.engine,heardRumor.document);
   const confessed=await act(f.engine,heardRumor.document,'core:law.confess',{case:incident.id,authority:'npc_hw_gucen'},'f6-confess');
   const filed=await acceptReported(f.engine,confessed.document,confessed.result,'f6-file');
   assert.equal(filed.document.state.records[incident.id].category,'legal_case');
   const moved=await act(f.engine,filed.document,'core:move',{destination:'bld_hw_council'},'f6-court');
   moved.document=await submitKnownWitnesses(f.engine,moved.document,incident.id,'f6-witness');
   const heard=await act(f.engine,moved.document,'core:law.hear',{case:incident.id,authority:'npc_hw_chenbai'},'f6-hear');
   assert.equal(heard.result.convicted,true);assert.ok(heard.document.state.records[incident.id].judgment);
   const paid=await act(f.engine,heard.document,'core:law.pay',{case:incident.id,authority:'npc_hw_chenbai'},'f6-pay');
   assert.ok(paid.document.state.player.coins<heard.document.state.player.coins);
   assert.ok(paid.document.state.records[incident.id].finePaid>0);clean(f.engine,paid.document);
   assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(paid.document)),paid.input)).patches,[]);
  }
  clean(f.engine,after);assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),input)).patches,[]);
 }
});
