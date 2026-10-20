import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {executeIntent,scoreRows,signatureMatches as matchSignature,signatureEffects,applyIntentSetup} from '../tools/a3-score.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {magicStatusStats} from '../server-plugin/magic-status.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const signatureMatches=(expected,effects,receipt,requested)=>matchSignature(expected,effects,receipt,requested,world);
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
test('A3 constructor scorer: dynamic proposal uses the UI tool adapter and real four-step receipts',async()=>{
 // 06 §6.9.5: local composition also includes the dynamic open-proposal duty.
 // The independently supplied proposal, never expected, provides the inputs.
 const before=structuredClone(initial),row={...rows[0],expected:expected('open:proposal',['emit'],{constructor:true})};
 const scored=await scoreRows([row],options),result=scored.results[0];
 assert.equal(result.scores.constructor,true,JSON.stringify(result));
 assert.deepEqual(result.actual.builder.steps,[0,1,2,3]);
 const direct=await executeIntent(engine,initial,{...row,id:'explicit-open-builder',builder:{action:'open:proposal',slots:row.proposal}});
 assert.equal(direct.actual.builder.ok,true,JSON.stringify(direct.actual));
 assert.deepEqual(direct.actual.calls.map(c=>[c.phase,c.tool,c.eventId]),[['preview','world_propose','a3-score-explicit-open-builder'],['confirm','world_propose','a3-score-explicit-open-builder']]);
 assert.deepEqual(direct.actual.signature,['emit']);
 assert.ok(Object.values(direct.document.state.records).some(r=>r.category==='world_event'&&r.payload?.text==='今天路上有一只鸟'));
 const wrong=await scoreRows([{...row,expected:{...row.expected,signature:['vital']}}],options);
 assert.equal(wrong.results[0].actual.builder.ok,true);
 assert.equal(wrong.results[0].scores.constructor,false);
 const refused=await scoreRows([{...rows[1],expected:{...row.expected,constructor:true}}],options);
 assert.equal(refused.results[0].actual.builder.ok,false);
 assert.equal(refused.results[0].scores.constructor,false);
 assert.deepEqual(initial,before);
});

test('A3 constructor scorer: explicit trace alternative selects a catalogued form without fulfilling the original intent',async()=>{
 const proposal={...rows[3].proposal,effects:[{op:'create',kind:'mark',facts:{name:'飞天茶壶',form:'虚构形态'},tags:['mark:art']}]};
 const row={...rows[3],proposal,expected:expected('open:leave_mark',['create(thing:mark,mark:art)'],{fallback:true,constructor:true})};
 const scored=await scoreRows([row],options),result=scored.results[0];
 assert.equal(result.scores.constructor,true,JSON.stringify(result));
 // The separate original execution still fails its invalid form; builder
 // completion is measured from its own committed route, effects and reaction.
 assert.equal(result.scores.route,false);
 const direct=await executeIntent(engine,initial,{...row,id:'trace-builder',builder:{action:'open:proposal',slots:proposal}});
 assert.equal(direct.actual.traceOnly,true);
 assert.equal(direct.actual.fallback,true);
 assert.deepEqual(direct.actual.calls.map(c=>[c.phase,c.tool]),[['preview','world_propose'],['preview','world_act'],['confirm','world_act']]);
 assert.ok(world.openActionRules.mark.forms.includes(direct.document.state.created[direct.actual.entity].form));
});

test('A3 signature: adopted effects exclude only receipt-proven derived resource costs',async()=>{
 const requested={op:'emit',actor:'player',verb:'tell',visibility:'public',payload:{text:'hello'}};
 const cost={op:'transfer',from:'player|item_charcoal|inventory',to:'sink:consume|item_charcoal|action',qty:1};
 const receipt={status:'committed',source:{id:'open:proposal'},actor:'player',applied:[{index:0,...cost,result:{transferred:1}},{index:1,...requested}],cost:{time:5,body:{stamina:{value:98}},resources:[cost]}};
 assert.equal(signatureMatches(['emit(person:self,tell)'],receipt.applied,receipt),true);
 assert.deepEqual(signatureEffects(receipt.applied,receipt).excluded,[receipt.applied[0]]);
 // No provenance means no exclusion, even for a plausible material sink.
 assert.equal(signatureMatches(['emit'],receipt.applied),false);
 const explicitConsumption=[requested,{op:'transfer',resource:'item_charcoal',from:'self',to:'sink:consume',qty:1}];
 assert.equal(signatureMatches(['emit','transfer(resource:item_charcoal,self->sink:consume)'],receipt.applied,receipt,explicitConsumption),true);
 assert.equal(signatureMatches(['emit'],receipt.applied,receipt,explicitConsumption),false);
 assert.equal(signatureMatches(['emit'],[...receipt.applied,{...cost}],receipt),false);
 // Authority evidence is unrelated to cost provenance.
 assert.equal(signatureMatches(['emit'],[requested,{op:'vital',target:'player',delta:-1,actedAs:{kind:'office',id:'test'}}]),false);
 // A wrong requested primitive must survive filtering and fail exact equality.
 assert.equal(signatureMatches(['emit'],[...receipt.applied,{op:'status',target:'player',status:'fear'}],receipt),false);
 const mock={previewAction:async()=>({receipt:{status:'preview'}}),reduce:async()=>({patches:[],result:{receipt}})};
 const run=await executeIntent(mock,initial,{id:'cost-provenance',proposal:{intent:'hello',effects:[requested]}});
 assert.deepEqual(run.actual.signature,['emit']);assert.equal(run.actual.excludedCosts.length,1);
 assert.equal(signatureMatches(['emit'],run.effects,run.receipt),true);
});
test('A3 signature: qualifiers belong to the same adopted primitive, never prose or authority',()=>{
 const effects=[{op:'emit',target:'npc_hw_linsui',signatureKind:'person',verb:'tell',payload:{text:'npc_hw_wushuo greet'}},{op:'status',target:'player',status:'fear'}];
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,tell)','status(person:self,fear)'],effects),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_wushuo,tell)','status'],effects),false);
 // Round 5 rule 4: greet/tell are descriptions; the same real NPC is the evidence.
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,greet)','status'],effects),true);
 assert.equal(signatureMatches(['emit(person:self,tell)','status'],effects),false);
 // Round 5 rules 2/4: type labels and fear are descriptions, not registered IDs.
 assert.equal(signatureMatches(['emit(thing:npc_hw_linsui,tell)','status'],effects),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_linsui,fear)','status'],effects),true);
 assert.equal(signatureMatches(['create(thing:mark,mark:warning+mark:art)'],[{op:'create',kind:'mark',tags:['mark:warning','mark:art']}]),true);
 // Round 5 rule 4: mark tags in parentheses are descriptive, not world IDs.
 assert.equal(signatureMatches(['create(thing:mark,mark:warning+mark:art)'],[{op:'create',kind:'mark',tags:['mark:warning']}]),true);
});
test('A3 signature v2: real references, initiator and direction are machine checked',()=>{
 const effect={op:'transfer',resource:'coin_river',from:'player|coin_river|purse',to:'npc_hw_linsui|coin_river|purse'};
 const signature=['transfer(resource:coin,self->npc_hw_linsui)'];
 assert.equal(signatureMatches(signature,[effect]),true);
 assert.equal(signatureMatches(signature,[{...effect,to:'npc_hw_wushuo|coin_river|purse'}]),false);
 assert.equal(signatureMatches(signature,[{...effect,from:effect.to,to:effect.from}]),false);
 assert.equal(signatureMatches(['transfer(resource:item_bread,self->npc_hw_linsui)'],[effect]),false);
 assert.equal(signatureMatches(['transfer(resource:coin,self->npc_hw_linsui:30)'],[effect]),true);
 const emit={op:'emit',target:'npc_hw_xuling',verb:'tell',payload:{kind:'different_description'}};
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:teach_spell_light)'],[emit]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:teach_spell_light)'],[{...emit,payload:{spell:'spell_light'}}]),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,other_description)'],[emit]),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:spell_light)'],[emit]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:spell_light)'],[{...emit,payload:{spell:'spell_light'}}]),true);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling,request:spell_light)'],[emit,{op:'emit',payload:{spell:'spell_light'}}]),false);
 assert.equal(signatureMatches(['emit(person:npc_hw_xuling)'],[{op:'emit',payload:{text:'npc_hw_xuling'},actedAs:{id:'npc_hw_xuling'},result:{target:'npc_hw_xuling'}}]),false);
 assert.equal(signatureMatches(['emit(person:self)'],[{op:'emit',actor:'npc_hw_xuling'}],{actor:'npc_hw_xuling'}),true);
 assert.equal(signatureMatches(['emit(person:self)'],[{op:'emit',target:'npc_hw_linsui'}],{actor:'npc_hw_xuling'}),false);
 assert.equal(signatureMatches(['emit(person:self)'],[{op:'emit',actor:'player'}],{actor:'npc_hw_xuling'}),false);
 // Embedded book_/teacher_ prefixes still carry real IDs; similar longer IDs
 // must not accidentally require their shorter registered prefix as well.
 assert.equal(signatureMatches(['learn(person:self,teacher_npc_hw_luqing)'],[{op:'learn',target:'player',source:'npc_hw_luqing'}]),true);
 assert.equal(signatureMatches(['transfer(resource:item_wood_shavings)'],[{op:'transfer',resource:'item_wood_shavings'}]),true);
 assert.equal(signatureMatches(['transfer(resource:item_wood_shavings)'],[{op:'transfer',resource:'item_wood'}]),false);
});
test('A3 signature: real registered action pays derived costs without adding them to the requested signature',async()=>{
 const action={id:'test:score_cost',label:'说一句话',narration:'test.score_cost',slots:[],cost:{owner:'primitives',time:1,resources:[{resource:'coin_river',qty:1}]},outcomes:[{op:'emit',actor:'player',verb:'tell',visibility:'public',payload:{text:'hello'}}]};
 const costWorld=structuredClone(world);costWorld.actionDefinitions={format:1,actions:[action]};
 const costEngine=new WorldEngine(costWorld);
 const row={id:'real-cost',action:action.id,setup:{coins:5},expected:expected(action.id,['emit(person:self,tell)'])};
 const run=await executeIntent(costEngine,initial,row);
 assert.equal(run.receipt.status,'committed');
 assert.deepEqual(run.receipt.applied.map(e=>e.op),['transfer','emit']);
 assert.equal(run.receipt.cost.resources.length,1);assert.equal(run.receipt.cost.time,1);
 assert.equal(run.document.state.player.coins,4);
 assert.equal(signatureMatches(row.expected.signature,run.effects,run.receipt),true);
 assert.deepEqual(run.actual.signature,['emit']);
 const scored=await scoreRows([row],{...options,world:costWorld});
 assert.equal(scored.results[0].scores.signature,true);
});
test('A3 setup: two independent scenes execute the two-phase protocol with balanced opening books',async()=>{
 const baseline=structuredClone(initial),asleep=structuredClone(initial);
 asleep.state.npcs.npc_hw_linsui.activity='睡眠';
 asleep.state.npcs.npc_hw_linsui.status='昏迷';
 asleep.state.npcs.npc_hw_linsui.scheduleTravel={to:'loc_hw'};
 const locations=world.locations.filter(l=>l.id!==initial.state.location).slice(0,2).map(l=>l.id);
 assert.equal(locations.length,2);
 const setups=locations.map((location,i)=>({location,present:['npc_hw_linsui'],inventory:{item_ration:i+2},coins:41+i,minute:initial.state.minute+10+i,status:'正常',facts:[{path:['state','player','hp'],value:initial.state.player.maxHp-1}]}));
 const cases=[{...rows[0],id:'setup-say',setup:setups[0]},{...rows[5],id:'setup-mark',setup:setups[1]}];
 const scored=await scoreRows(cases,{...options,document:asleep});
 assert.equal(scored.setupUnmetCount,0);assert.deepEqual(scored.setupUnmet,[]);
 for(const [i,row] of cases.entries()){
  const result=scored.results[i],run=await executeIntent(engine,asleep,row);
  assert.equal(result.scores.route,true,JSON.stringify(result));
  assert.equal(result.scores.signature,true,JSON.stringify(result));
  assert.equal(result.scores.supported,true,JSON.stringify(result));
  assert.equal(result.actual.preview.status,'preview');
  assert.equal(result.actual.calls[0].phase,'preview');assert.equal(result.actual.calls.at(-1).phase,'confirm');
  assert.equal(run.document.state.location,setups[i].location);
  assert.equal(run.document.state.npcs.npc_hw_linsui.location,setups[i].location);
  assert.equal(run.document.state.npcs.npc_hw_linsui.status,'正常');
  assert.equal(run.document.state.npcs.npc_hw_linsui.scheduleTravel,null);
  assert.equal(run.document.state.inventory.item_ration.quantity,i+2);
  assert.equal(run.document.state.player.coins,41+i);
  assert.equal(run.document.state.player.hp,initial.state.player.maxHp-1);
  assert.equal(run.document.ledger.accounts['player|coin_river|purse'],41+i);
  assert.equal(run.document.ledger.accounts['player|item_ration|inventory'],i+2);
  assert.deepEqual(reconcile(engine,run.document),{mismatches:[],lots:[],drift:[],audit:[]});
  const fixture=applyIntentSetup(engine,asleep,setups[i]);
  assert.equal(fixture.document.state.minute,setups[i].minute);
 }
 assert.deepEqual(initial,baseline);assert.equal(asleep.state.npcs.npc_hw_linsui.status,'昏迷');
 // The builder replay must receive the same setup as the initial execution.
 const built=await scoreRows([{...rows[4],setup:setups[0]}],{...options,document:asleep});
 assert.equal(built.results[0].scores.constructor,true,JSON.stringify(built.results[0]));
});

test('A3 setup: unmet items are reported separately and earn no credit, even empty signatures',async()=>{
 const row={...rows[0],id:'setup-missing',setup:{location:'missing:place',present:['missing:person'],inventory:{missing_item:1},coins:-1,minute:-1,status:{missing_actor:'正常'},facts:[{path:['state','player','invented'],value:true}]}},before=structuredClone(initial);
 const failed=await scoreRows([row],options),result=failed.results[0];
 assert.equal(failed.setupUnmetCount,1);assert.equal(failed.setupUnmet[0].id,row.id);
 for(const key of ['location','present[0]','inventory.missing_item','coins','minute','status.missing_actor','facts[0]'])assert.ok(result.setupUnmet.some(x=>x.item===key),key);
 assert.ok(Object.values(result.scores).every(x=>x===false));
 assert.deepEqual(result.actual.calls,[]);assert.equal(result.actual.preview,null);
 assert.equal(result.actual.error.code,'A3-SCORE-SETUP');assert.deepEqual(initial,before);
 const empty=await scoreRows([{...rows[2],setup:{location:'missing:place'}}],options);
 assert.equal(empty.signature,0);assert.equal(empty.route,0);
});

test('A3 setup: existing creature instances and native special statuses are real state',()=>{
 const baseline=structuredClone(initial);
 baseline.state.creatures={test_creature:{name:'fixture creature',species:world.monsters[0].id,location:initial.state.location,hp:20,maxHp:20,status:'正常',activity:'睡眠'}};
 const setup={location:world.locations.find(l=>l.id!==initial.state.location).id,present:['test_creature'],minute:initial.state.minute+30,status:[{target:'player',status:'fear',power:2,duration:60}]};
 const built=applyIntentSetup(engine,baseline,setup);
 assert.deepEqual(built.setupUnmet,[]);
 assert.equal(built.document.state.creatures.test_creature.location,setup.location);
 assert.equal(built.document.state.creatures.test_creature.activity,'闲逛');
 assert.equal(magicStatusStats(engine.primitiveDraft(built.document),'player').hit,-0.04);
 assert.equal(built.document.state.effects['a3-score:setup-status:0'].expires,setup.minute+60);
 assert.equal(baseline.state.creatures.test_creature.activity,'睡眠');
 const bad=applyIntentSetup(engine,baseline,{status:[{target:'player',status:'invented',power:2,duration:60}]});
 assert.equal(bad.setupUnmet[0].item,'status[0]');
});

test('A3 preview: clarification, rejection and fallback retain original diagnostics',async()=>{
 const clarification=await executeIntent(engine,initial,rows[2]);
 assert.equal(clarification.actual.preview.status,'not_submitted');
 assert.equal(clarification.actual.preview.routingStatus,'needs_entities');
 assert.ok(clarification.actual.preview.ambiguities.length);
 const refusal=await executeIntent(engine,initial,rows[1]);
 assert.equal(refusal.actual.preview.status,'rejected');assert.ok(refusal.actual.preview.reason);
 const fallback=await executeIntent(engine,initial,rows[3]);
 assert.equal(fallback.actual.preview.status,'not_submitted');
 assert.equal(fallback.actual.previews.length,2);assert.equal(fallback.actual.previews[1].status,'preview');
});

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
  // 06 §6.8: a qualified signature requires evidence for subject and field.
  assert.equal(signatureMatches(['emit(person:self,tell)'],[{op:'emit'}]),false);
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
