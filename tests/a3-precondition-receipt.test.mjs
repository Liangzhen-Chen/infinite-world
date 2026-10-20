import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyIntentSetup,executeIntent} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {executeOpenSequence} from '../server-plugin/open-actions.mjs';
import {PrimitiveRejected} from '../server-plugin/primitive-policy.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r5.json','utf8'));
const nativeCorpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const ids=[15,17,18,25,27,28,32,34,39,43,51,52,53,55,56,58,63,64,68,69,71,95,96,97];
const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'a3-precondition-receipt');
const rowFor=n=>corpus.find(row=>row.id===`A3V2-${String(n).padStart(3,'0')}`);
const legalRequests=new Set([51,52,53,55,56,58]);
const nativeRowFor=n=>nativeCorpus.find(row=>row.id===`A3V2-${String(n).padStart(3,'0')}`);
const receiptOf=value=>value.result?.receipt??value.receipt;
function assertRefusal(value){
 const receipt=receiptOf(value);
 assert.equal(receipt.status,'rejected');
 assert.match(receipt.code,/^E-ACTION-/);
 assert.ok(receipt.reason);
 assert.ok(receipt.routed);
 assert.equal(receipt.routing.routed,receipt.routed);
 assert.ok(receipt.missing.length);
 assert.ok(receipt.repair.length);
 assert.deepEqual(receipt.applied,[]);
 assert.deepEqual(receipt.cost,{time:0,resources:[]});
 return receipt;
}

// 06 §6.10.4: these native preconditions must still reject. Natural-language
// setup notes never create a case, a deposit, a permission or spatial facts.
for(const n of ids)test(`A3 refusal ${n}: routed preview and direct commit preserve conditions and zero effects`,async()=>{
 const row=rowFor(n),{document,setupUnmet}=applyIntentSetup(engine,initial,row.setup);
 assert.deepEqual(setupUnmet,[]);
 const before=structuredClone(document),input={tool:'world_propose',eventId:`refusal-${n}`,args:row.proposal};
 const preview=await engine.previewAction(document,input),receipt=assertRefusal(preview);
 assert.notEqual(receipt.code,'E-ACTION-PRECONDITION','the migrated source must supply its own stable code');
 assert.equal(receipt.routing.proposal.intent,row.proposal.intent);
 assert.equal(receipt.routing.fallback.intent,row.proposal.intent);
 const committed=await engine.reduce(document,input);
 assert.equal(assertRefusal(committed).code,receipt.code);
 assert.equal(committed.result.ok,false);
 assert.deepEqual(committed.patches,[]);
 const call={tool:'world_act',eventId:`refusal-direct-${n}`,args:{action:receipt.routed,slots:receipt.routing.slots}};
 assert.equal(assertRefusal(await engine.previewAction(document,call)).code,receipt.code);
 const direct=await engine.reduce(document,call);
 assert.equal(assertRefusal(direct).code,receipt.code);
 assert.deepEqual(direct.patches,[]);
 assert.deepEqual(document,before);
 assert.deepEqual(auditLedger(document.ledger),[]);
});

for(const n of legalRequests)test(`A3 native legal ${n}: original premises submit only a request in routed and direct calls`,async()=>{
 // 05 §5.2.7: current native premises submit requests; the original r5 inputs
 // above still lack those premises and retain every atomic-refusal assertion.
 const row=nativeRowFor(n),{document,setupUnmet}=applyIntentSetup(engine,initial,row.setup);assert.deepEqual(setupUnmet,[]);
 const before=structuredClone(document),input={tool:'world_propose',eventId:`legal-positive-${n}`,args:row.proposal};
 const preview=await engine.previewAction(document,input),quoted=receiptOf(preview);assert.equal(quoted.status,'preview');assert.deepEqual(document,before);
 const result=await engine.reduce(document,input),receipt=receiptOf(result);assert.equal(receipt.status,'committed');assert.equal(receipt.routed,row.expected.route);
 assert.equal(receipt.applied.filter(e=>e.op==='emit').length,1);assert.ok(receipt.applied.every(e=>e.op==='emit'));
 const after=applyPatches(document,result.patches);assert.equal(after.state.player.coins,document.state.player.coins);assert.deepEqual(auditLedger(after.ledger),[]);
 for(const [id,c]of Object.entries(document.state.records).filter(([,c])=>c.category==='legal_case')){
  assert.equal(after.state.records[id].stage,c.stage);assert.deepEqual(after.state.records[id].judgment,c.judgment);assert.equal(after.state.records[id].representation,c.representation);
 }
 const call={tool:'world_act',eventId:`legal-positive-direct-${n}`,args:{action:receipt.routed,slots:receipt.routing.slots}};
 assert.equal(receiptOf(await engine.previewAction(document,call)).status,'preview');
 const direct=await engine.reduce(document,call);assert.equal(receiptOf(direct).status,'committed');assert.deepEqual(document,before);
});

test('A3 refusal: program errors and non-public legacy calls still throw',async()=>{
 const row=rowFor(15),{document}=applyIntentSetup(engine,initial,row.setup);
 const routed=assertRefusal(await engine.previewAction(document,{tool:'world_propose',eventId:'route-error',args:row.proposal}));
 const call={tool:'world_act',eventId:'program-error',args:{action:routed.routed,slots:routed.routing.slots}};
 const isolated=new WorldEngine(world);
 for(const error of [new TypeError('已经学会识字'),new RangeError('中文程序范围错误'),new Error('unexpected invariant failure'),new PrimitiveRejected('E-POLICY-TEST','原语策略拒绝')]){
  isolated.learn=()=>{throw error;};
  await assert.rejects(isolated.previewAction(document,call),e=>e===error);
  await assert.rejects(isolated.reduce(document,call),e=>e===error);
 }
 await assert.rejects(engine.reduce(document,{tool:'world_learn',eventId:'legacy-error',args:{entity:'skill_literacy',source:'npc_hw_luqing'}}),/已经学会识字/);
});

// These are real, unconverted domain preconditions outside the 24 corpus
// failures: no text entries may be added to the boundary to make them work.
for(const module of ['repair','dialogue','manufacturing'])test(`A3 generic refusal: ${module} legacy precondition is atomic in preview and commit`,async()=>{
 const document=structuredClone(initial);
 let action,slots,legacy,reason;
 if(module==='repair'){
  const item=world.items.find(i=>!document.state.inventory[i.id]);
  assert.ok(item);
  action='core:craft.repair';slots={item:item.id};
  legacy={tool:'world_craft',args:{operation:'repair',...slots}};reason='没有持有这件维修物品';
 }else if(module==='dialogue'){
  const subject='npc_hw_linsui',npc=document.state.npcs[subject];
  Object.assign(npc,{location:document.state.location,activity:'闲坐',scheduleTravel:null,cognitionTravel:null});
  action='core:dialogue.accept';slots={subject};
  legacy={tool:'world_remember',args:{subject,key:'dialogue:accept',content:'接受条件'}};reason='没有待接受的条件';
 }else{
  const recipe=world.recipes.find(r=>r.learningRequired);
  assert.ok(recipe);delete document.state.recipes[recipe.id];
  action='core:craft.manufacture';slots={recipe:recipe.id};
  legacy={tool:'world_craft',args:{operation:'manufacture',...slots}};reason='尚未学会这个配方';
 }
 const before=structuredClone(document);
 await assert.rejects(engine.reduce(document,{...legacy,eventId:`generic-legacy-${module}`}),error=>error.constructor===Error&&error.message===reason);
 const offered=worldActions(engine.scoped(document),document).actions;
 const call={tool:'world_act',eventId:`generic-${module}`,args:{action,slots}};
 for(const preview of [true,false]){
  const result=preview?await engine.previewAction(document,call):await engine.reduce(document,call),receipt=assertRefusal(result);
  assert.equal(receipt.code,'E-ACTION-PRECONDITION');
  assert.equal(receipt.reason,reason);assert.deepEqual(receipt.missing,[reason]);
  assert.ok(receipt.repair.some(s=>s.includes(reason)));
  assert.ok(receipt.routing.alternatives.length);
  for(const alternative of receipt.routing.alternatives){
   const offer=offered.find(a=>a.id===alternative.action);
   assert.ok(offer&&!offer.blocked&&offer.permission?.allowed!==false);
   assert.deepEqual(alternative.slots,offer.fill);
   assert.ok(receipt.repair.some(s=>s.includes(alternative.action)));
  }
  assert.equal(receipt.routing.fallback.action,'open:leave_mark');
  assert.equal(receipt.routing.fallback.available,true);
  if(!preview){assert.equal(result.result.ok,false);assert.deepEqual(result.patches,[]);}
  assert.deepEqual(document,before);assert.deepEqual(auditLedger(document.ledger),[]);
 }
});

test('A3 refusal: explicit mark alternative reacts, never grants the rejected effect',async()=>{
 const row=rowFor(15),{document}=applyIntentSetup(engine,initial,row.setup);
 const before=structuredClone(document),receipt=assertRefusal(await engine.previewAction(document,{tool:'world_propose',eventId:'fallback-quote',args:row.proposal}));
 assert.deepEqual(document,before);
 assert.equal(receipt.routing.fallback.available,true);
 const action=receipt.routing.fallback.action;
 const mark=await engine.reduce(document,{tool:'world_act',eventId:'fallback-confirm',args:{action,slots:{intent:row.intent,form:world.openActionRules.mark.forms[0],tags:['mark:warning']}}});
 assert.equal(mark.result.receipt.status,'committed');
 assert.equal(mark.result.receipt.fallback.originalIntentFulfilled,false);
 assert.ok(mark.result.receipt.mark.reactions.length);
 const after=applyPatches(document,mark.patches);
 assert.deepEqual(after.state.skills,document.state.skills);
 for(const reaction of mark.result.receipt.mark.reactions)assert.equal(after.state.records[`world_event:${reaction.event}`].payload.mark,mark.result.receipt.mark.entity);
});

test('A3 scorer reads refusal details without awarding successful routing or effects',async()=>{
 const row=rowFor(51),run=await executeIntent(engine,initial,row);
 assert.equal(run.actual.refused,true);
 assert.equal(run.actual.committed,false);
 assert.equal(run.actual.route,'reject');
 assert.equal(run.actual.routed,run.receipt.routed);
 // The request consumer now owns this rejection: r5 has no native recipient.
 assert.equal(run.actual.reasonCode,'E-ACTION-LEGAL-REQUEST');
 assert.ok(run.actual.missing.length&&run.actual.repair.length);
 assert.deepEqual(run.effects,[]);
});

test('A3 refusal: rejected proposals do not persist implicit ledger initialization',async()=>{
 const row=rowFor(51),{document}=applyIntentSetup(engine,initial,row.setup);
 delete document.ledger;
 const before=structuredClone(document),result=await engine.reduce(document,{tool:'world_propose',eventId:'no-opening-on-refusal',args:row.proposal});
 assertRefusal(result);
 assert.deepEqual(result.patches,[]);
 assert.deepEqual(document,before);
});

test('A3 refusal: later sequence precondition rolls back earlier time and world changes',async()=>{
 const row=rowFor(15),{document}=applyIntentSetup(engine,initial,row.setup),before=structuredClone(document);
 const input={tool:'world_propose',eventId:'sequence-refusal',args:row.proposal};
 const routed=assertRefusal(await engine.previewAction(document,input));
 const prepared={status:'sequence',steps:[{action:'core:time',slots:{minutes:1}},{action:routed.routed,slots:routed.routing.slots}]};
 for(const preview of [true,false]){
  const result=await executeOpenSequence(engine,document,input,prepared,{preview}),receipt=assertRefusal(result);
  assert.equal(receipt.routing.failedStep,1);
  if(!preview)assert.deepEqual(result.patches,[]);
  assert.deepEqual(document,before);
 }
});
