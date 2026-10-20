import test from 'node:test';
import {assertActionRejected} from './helpers/action-refusal.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,parseAccount,auditLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {registerOpenActionContext,createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {riteProjectInterruptions} from '../server-plugin/action-rite.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {registerAdvance} from '../server-plugin/advance-registry.mjs';
import {PHASE} from '../server-plugin/scheduler.mjs';
import {modelActionCatalog} from '../extension/tools.mjs';
import {registerWorldEventSubscriber} from '../server-plugin/world-events.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const from=accountKey('player','coin_river','purse');

test('A9: the production proposal declaration is discoverable and runs the same native path via world_act',async()=>{
 const f=fixture(),action=f.engine.world.actionDefinitions.actions.find(a=>a.id==='open:proposal');assert.ok(action);
 const catalog=worldActions(f.engine,f.document,{query:action.label});
 assert.ok(JSON.stringify(catalog).includes(action.id));
 const gateway=modelActionCatalog(catalog).actions.find(a=>a.id===action.id),effectSchema=gateway.slots.find(s=>s.name==='effects').inputSchema;
 assert.equal(effectSchema.type,'array');assert.equal(effectSchema.maxItems,64);assert.ok(effectSchema.items.properties.op.enum.includes('transfer'));assert.equal(effectSchema.items.additionalProperties,false);
 assert.equal(gateway.slots.find(s=>s.name==='means').inputSchema.type,'object');
 const slots={intent:'用一句独特问候表达平安祝愿',effects:[{op:'emit',verb:'tell',visibility:'witnessed',payload:{text:'祝你路上平安'}}]},input={tool:'world_act',eventId:'a9-real-proposal',args:{action:action.id,slots}};
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.status,'preview');assert.deepEqual(f.document,before);
 const output=await f.engine.reduce(f.document,input),direct=await f.engine.reduce(f.document,{tool:'world_propose',eventId:input.eventId,args:slots});
 assert.deepEqual(output,direct);assert.equal(output.result.receipt.status,'committed');
 const after=applyPatches(f.document,output.patches);assert.deepEqual(output.result.receipt.routing.proposal,slots);
 assert.equal(after.state.minute-before.state.minute,2);assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),input)).patches,[]);
 const configured=await f.engine.reduce(f.document,{type:'config_set',key:'openActions',value:'off'}),off=applyPatches(f.document,configured.patches);
 assert.equal(f.engine.actionPermission(off,input.args).allowed,false);await assert.rejects(f.engine.reduce(off,input),{code:'E-OPEN-DISABLED'});
});

async function activeRite(eventId,{role=false}={}){
 const f=fixture(),item=Object.keys(f.document.state.inventory).find(id=>(f.document.ledger.accounts[accountKey('player',id,'inventory')]??0)>=2);assert.ok(item);
 f.document.state.player.hp=10;f.document.state.player.maxHp=100;
 const action={id:'test:a9-rite',label:'阶段仪式',narration:'rite',synonyms:[],visibility:{catalog:'here'},slots:[{name:'project',kind:'text'}],cost:{owner:'primitives',time:0},outcomes:[{op:'emit',verb:'tell',visibility:'witnessed',payload:{kind:'rite_success'}}],
  rite:{officiant:'actor == "player"',roles:[],expiresWithin:8,limits:{vital:{heal:0,harm:2,rangeMeters:1.5}},stages:[{id:'first',minutes:1,materials:[{resource:item,qty:1}]},{id:'last',minutes:1,materials:[{resource:item,qty:1}]}],interrupt:{effects:[{op:'vital',target:'$actor',delta:-2,type:'physical'}]}}};
 f.engine.world.actionDefinitions={format:1,actions:[action]};
 const slots={};
 if(role){
  action.slots.push({name:'roles',kind:'roles',required:true});action.rite.roles=[{role:'witness',min:1,max:1,filter:'true'}];
  slots.roles={witness:[f.npc]};f.engine.byId.get(f.npc).tier='fixture';delete f.engine.byId.get(f.npc).schedule;
  f.document.state.npcs[f.npc].activity='休息';
  f.document.state.consentEvents=[{id:'a9-role-consent',type:'consent_given',from:f.npc,to:'player',scope:'rite',purpose:[action.id],at:f.document.state.minute,until:f.document.state.minute+4}];
 }
 const input={tool:'world_act',eventId,args:{action:action.id,slots}},first=await f.engine.reduce(f.document,input);
 f.document=applyPatches(f.document,first.patches);f.project=first.result.receipt.rite.project;f.key=accountKey('player',item,'inventory');return f;
}

test('A9: world_time wakes a rite at its exact deadline, commits bounded consequences once and preserves the next material',async()=>{
 const f=await activeRite('a9-deadline-start'),before=structuredClone(f.document),row=before.state.records[`rite_project:${f.project}`];
 const input={tool:'world_time',eventId:'a9-deadline-wait',args:{minutes:12}},wait=await f.engine.reduce(before,input),after=applyPatches(before,wait.patches);
 assert.equal(after.state.records[`rite_project:${f.project}`].status,'unfinished');assert.equal(after.state.records[`rite_project:${f.project}`].updatedAt,row.deadline);
 assert.equal(after.holdings.entities[f.project].facts.status,'unfinished');assert.equal(after.ledger.accounts[f.key],before.ledger.accounts[f.key]);assert.deepEqual(auditLedger(after.ledger),[]);
 const receipts=Object.values(after.state.records).filter(r=>r.category==='primitive_receipt'&&r.receipt.source.id===`rite:${row.action}:interrupt`);assert.equal(receipts.length,1);
 assert.equal(receipts[0].receipt.status,'committed');assert.ok(receipts[0].receipt.applied.some(e=>e.op==='vital'&&e.delta===-2));
 const events=Object.values(after.state.records).filter(r=>r.category==='world_event'&&r.payload?.kind==='rite_unfinished');assert.equal(events.length,1);assert.equal(events[0].minute,row.deadline);assert.ok(Number.isSafeInteger(events[0].seq));
 const d=f.engine.primitiveDraft(JSON.parse(JSON.stringify(after)));f.engine.advance(d,0,'a9-deadline-repeat');assert.equal(d.document.state.player.hp,after.state.player.hp);
 assert.equal(Object.values(d.document.state.records).filter(r=>r.category==='world_event'&&r.payload?.kind==='rite_unfinished').length,1);
 assert.deepEqual(await f.engine.reduce(before,input),wait,'same inputs reproduce the interruption and scheduler sequence');
});

test('A9: native system interruptions handle lost capacity/location and reject forged or stale consequences',async()=>{
 for(const reason of ['sleep','dead','left']){
  const f=await activeRite(`a9-lost-${reason}`),beforeQty=f.document.ledger.accounts[f.key];
  if(reason==='sleep')f.document.state.player.activity='睡眠';else if(reason==='dead')f.document.state.player.status='死亡';else f.document.state.location=f.engine.world.locations.find(p=>p.id!==f.document.state.location).id;
  const plan=riteProjectInterruptions(f.engine,f.document)[0];assert.ok(plan);
  const before=structuredClone(f.document);assert.throws(()=>f.engine.primitiveRiteInterruption(f.document,{...plan,effects:[{op:'vital',target:'player',delta:1000,type:'healing'}]}),{code:'E-RITE-INTERRUPTION'});assert.deepEqual(f.document,before);
  if(reason==='sleep'){
   const effects=f.engine.world.actionDefinitions.actions[0].rite.interrupt.effects;effects[0].delta=-3;
   const invalid=f.engine.primitiveDraft(f.document);assert.throws(()=>f.engine.advance(invalid,0,'a9-overbound'),{code:'E-PRIMITIVE-AMOUNT'});assert.deepEqual(invalid.document,before);effects[0].delta=-2;
  }
  const d=f.engine.primitiveDraft(f.document);f.engine.advance(d,0,`a9-interrupt-${reason}`);
  assert.equal(d.document.state.records[`rite_project:${f.project}`].status,'unfinished');assert.equal(d.document.ledger.accounts[f.key],beforeQty);assert.deepEqual(auditLedger(d.document.ledger),[]);
  assert.throws(()=>f.engine.primitiveRiteInterruption(d.document,plan),{code:'E-RITE-INTERRUPTION'});
  const receipt=Object.values(d.document.state.records).find(r=>r.category==='primitive_receipt'&&r.receipt.source.id==='rite:test:a9-rite:interrupt').receipt;
  if(reason==='dead')assert.ok(receipt.trimmed.some(e=>e.reason==='target_not_living'));
  // The consequence frame never grants the disabled actor a fresh initiative.
  if(reason==='dead')assert.throws(()=>commitPrimitives(before,[{op:'emit',verb:'tell',visibility:'witnessed'}],createRuntimePrimitiveFrame(f.engine,before,{eventId:`a9-no-initiative-${reason}`,source:{kind:'open',id:'test:initiative'}})),{code:'E-CAPACITY'});
  if(reason==='sleep')await assert.rejects(f.engine.reduce(before,{tool:'world_act',eventId:'a9-sleep-no-rite',args:{action:'test:a9-rite',slots:{}}}),{code:'E-RITE-ACTOR'});
 }
});

test('A9: a real public sleep interrupts the rite before resting, without advancing or paying the next stage',async()=>{
 const f=await activeRite('a9-sleep-start'),before=structuredClone(f.document),input={tool:'world_time',eventId:'a9-real-sleep',args:{minutes:2,activity:'睡眠'}};
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches),row=after.state.records[`rite_project:${f.project}`];
 assert.equal(row.status,'unfinished');assert.equal(row.outcome,'E-RITE-ACTOR');assert.equal(row.updatedAt,before.state.minute);
 assert.equal(after.state.minute,before.state.minute+2);assert.equal(out.result.cost.time,2);assert.equal(after.ledger.accounts[f.key],before.ledger.accounts[f.key]);
 assert.equal(f.engine.riteSleepingActors,undefined);assert.deepEqual(auditLedger(after.ledger),[]);
});

test('A9: role consent expires at its own minute, while consent still valid now does not interrupt a waiting stage',async()=>{
 const f=await activeRite('a9-role-start',{role:true}),before=structuredClone(f.document),expiry=before.state.consentEvents[0].until;
 // The next stage would take longer than the remaining consent. Waiting is
 // still legitimate; only a perform request needs consent for that whole span.
 f.engine.world.actionDefinitions.actions[0].rite.stages[1].minutes=5;
 const first=await f.engine.reduce(f.document,{tool:'world_time',eventId:'a9-role-wait',args:{minutes:1}}),a=applyPatches(f.document,first.patches);
 assert.equal(a.state.records[`rite_project:${f.project}`].status,'active');assert.deepEqual(riteProjectInterruptions(f.engine,a),[]);
 const second=await f.engine.reduce(a,{tool:'world_time',eventId:'a9-role-expire',args:{minutes:4}}),b=applyPatches(a,second.patches);
 assert.equal(b.state.records[`rite_project:${f.project}`].status,'unfinished');assert.equal(b.state.records[`rite_project:${f.project}`].updatedAt,expiry);
 assert.equal(b.state.records[`rite_project:${f.project}`].outcome,'E-RITE-ROLE');assert.equal(b.ledger.accounts[f.key],before.ledger.accounts[f.key]);
 const events=Object.values(b.state.records).filter(r=>r.category==='world_event'&&Number.isSafeInteger(r.seq));assert.equal(new Set(events.map(e=>e.seq)).size,events.length);
});

test('A9: a real role-consent revocation interrupts in the same transaction with monotonic event sequence',async()=>{
 const f=await activeRite('a9-role-revoke-start',{role:true}),before=structuredClone(f.document),out=commitPrimitives(before,[{op:'emit',verb:'consent_revoked',target:'player',visibility:'private',payload:{consent:'a9-role-consent'}}],createRuntimePrimitiveFrame(f.engine,before,{actor:f.npc,eventId:'a9-role-revoked',source:{kind:'catalog',id:'test:role-withdraw'}})),after=applyPatches(before,out.patches);
 assert.equal(after.state.records[`rite_project:${f.project}`].status,'unfinished');assert.equal(after.state.records[`rite_project:${f.project}`].outcome,'E-RITE-ROLE');
 assert.equal(after.state.minute,before.state.minute);assert.equal(after.ledger.accounts[f.key],before.ledger.accounts[f.key]);
 const events=Object.values(after.state.records).filter(r=>r.category==='world_event'&&Number.isSafeInteger(r.seq)),termination=events.find(r=>r.payload?.kind==='rite_unfinished');assert.ok(termination);
 assert.equal(new Set(events.map(e=>e.seq)).size,events.length);assert.ok(events.filter(r=>r.verb==='consent_revoked').every(r=>r.seq<termination.seq));assert.deepEqual(auditLedger(after.ledger),[]);
});

test('A9: incapacity during a running stage preserves its actual time and paid material instead of rolling back',async()=>{
 for(const reason of ['coma','death']){
  const f=await activeRite(`a9-stage-start-${reason}`),before=structuredClone(f.document),at=before.state.minute+1;
  const unregister=registerAdvance({id:`a9-stage-${reason}`,order:2801,phase:PHASE.clock,packId:'test',ruleId:`stage-${reason}`,nextMinute:(_e,_d,now)=>now<at?at:Infinity,advance(engine,d){
   if(d.get('state','minute')!==at)return;
   if(reason==='death')engine.death(d);else d.set(['state','player','status'],'昏迷');
  }});
  let out;try{out=await f.engine.reduce(before,{tool:'world_act',eventId:`a9-stage-complete-${reason}`,args:{action:'test:a9-rite',slots:{project:f.project}}});}finally{unregister();}
  const after=applyPatches(before,out.patches);assert.equal(out.result.receipt.rite.status,'unfinished');assert.equal(after.state.minute,at);
  assert.equal(after.state.records[`rite_project:${f.project}`].status,'unfinished');assert.equal(after.holdings.entities[f.project].facts.status,'unfinished');
  const cost=after.state.records[`primitive:${out.result.receipt.cost.resourceEvent}`].receipt;assert.equal(cost.applied[0].qty,1);assert.deepEqual(auditLedger(after.ledger),[]);
  if(reason==='coma')assert.equal(after.ledger.accounts[f.key],before.ledger.accounts[f.key]-1);
  else assert.ok(out.result.receipt.trimmed.some(e=>e.reason==='target_not_living'));
  assert.ok(!out.result.receipt.applied.some(e=>e.payload?.kind==='rite_success'));
 }
});

test('A9: a reaction to stage completion can immediately terminate the continuing rite and its receipt',async()=>{
 const unregister=registerWorldEventSubscriber({id:'a9-rite-collapse',order:998,priorityClass:'social',on(d,_engine,events){
  if(events.some(e=>e.payload?.kind==='rite_attempt'&&e.payload.action==='test:a9-rite'))d.set(['state','player','status'],'昏迷');
 }});
 let f;try{f=await activeRite('a9-post-stage-reaction');}finally{unregister();}
 assert.equal(f.document.state.records[`rite_project:${f.project}`].status,'unfinished');
 const receipt=f.document.state.records['primitive:a9-post-stage-reaction'].receipt;
 assert.equal(receipt.rite.status,'unfinished');assert.ok(receipt.consequences.some(c=>c.type==='rite_unfinished'&&c.project===f.project));assert.ok(receipt.narrate.mustNot.some(c=>c.kind==='rite_fulfilled'));
});

test('A8: archived open assets drive public leave_mark, with real reactions, one cost and JSON retry',async()=>{
 const f=fixture(),input={tool:'world_act',eventId:'a8-mark',args:{action:'open:leave_mark',slots:{intent:'向过路人问好',form:'刻痕',tags:['问候']}}};
 // Use the archived vocabulary rather than inventing a tag for the fixture.
 input.args.slots.tags=[f.engine.world.openTagging.default];
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);
 assert.equal(preview.receipt.status,'preview');assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.equal(after.state.minute-before.state.minute,f.engine.world.openActionRules.mark.minutes);
 assert.ok(after.state.created[out.result.receipt.mark.entity]);assert.ok(out.result.receipt.mark.triggered);
 assert.equal(out.result.receipt.fallback.originalIntentFulfilled,false);
 const again=await f.engine.reduce(JSON.parse(JSON.stringify(after)),input);assert.deepEqual(again.patches,[]);
});

test('A8: native unmatched proposal commits bounded transfers, persists usage/routing, and rechecks funds',async()=>{
 const f=fixture();f.engine.world.actionDefinitions={format:1,actions:[]};
 const to=accountKey(f.npc,'coin_river','purse'),input={tool:'world_propose',eventId:'a8-unmatched',args:{intent:'一项未登记的递钱安排',effects:[{op:'transfer',from,to,qty:3}]}};
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);assert.deepEqual(f.document,before);
 assert.equal(preview.receipt.status,'preview');
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches),receipt=out.result.receipt;
 assert.equal(after.ledger.accounts[from],before.ledger.accounts[from]-3);assert.equal(after.ledger.accounts[to],before.ledger.accounts[to]+3);
 assert.equal(after.state.minute-before.state.minute,2);assert.deepEqual(auditLedger(after.ledger),[]);
 assert.deepEqual(receipt.routing.proposal,input.args);assert.ok(receipt.openUsage);
 assert.deepEqual(after.state.records['primitive:a8-unmatched'].receipt,receipt);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),input)).patches,[]);
 f.document.ledger.accounts[from]=0;await assert.rejects(f.engine.reduce(f.document,{...input,eventId:'a8-no-funds'}),{code:'E-TRANSFER-BALANCE'});
});

test('A8: openActions config is archived and enforced at execution while leave_mark stays available',async()=>{
 const f=fixture(),input={tool:'world_propose',eventId:'a8-disabled',args:{intent:'告知',effects:[{op:'emit',verb:'tell',payload:{text:'你好'}}]}};
 let change=await f.engine.reduce(f.document,{type:'config_set',key:'openActions',value:'off'});f.document=applyPatches(f.document,change.patches);
 await assert.rejects(f.engine.reduce(f.document,input),{code:'E-OPEN-DISABLED'});
 const mark=await f.engine.reduce(f.document,{tool:'world_act',eventId:'a8-off-mark',args:{action:'open:leave_mark',slots:{intent:'问好',form:'刻痕'}}});assert.equal(mark.result.receipt.status,'committed');
 change=await f.engine.reduce(f.document,{type:'config_set',key:'openActions',value:'limited'});f.document=applyPatches(f.document,change.patches);
 await assert.rejects(f.engine.reduce(f.document,{...input,args:{...input.args,effects:[{op:'transfer',from,to:accountKey(f.npc,'coin_river','purse'),qty:1}]}}),{code:'E-OPEN-MODE'});
 await assert.rejects(f.engine.reduce(f.document,{type:'config_set',key:'openActions',value:'invalid'}));
});

test('A8: legacy practice now consumes native duration and ignores caller gain; old no-cost replay stays exact',async()=>{
 const f=fixture(),skill='skill_light';f.document.state.skills[skill]={proficiency:10,breakthroughs:[],daily:{}};
 const input={tool:'world_practice',eventId:'a8-practice',args:{skill,gain:100000}},before=structuredClone(f.document);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.equal(after.state.minute-before.state.minute,120);assert.ok(out.result.gain<100000);assert.equal(out.result.cost.time,120);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),input)).patches,[]);
 const historical=await f.engine.reduce(before,{...input,args:{skill,gain:1}},{replay:true,result:{}}),old=applyPatches(before,historical.patches);
 assert.equal(old.state.minute,before.state.minute);assert.equal(historical.result.gain,1);
});

test('A8: public sleep charges body once and preserves historical no-cost replay',async()=>{
 const f=fixture(),now=f.document.state.minute;f.document.state.player.body={stamina:{value:20,asOf:now,activity:'rest'}};
 const input={tool:'world_time',eventId:'a8-sleep',args:{minutes:60,activity:'睡眠'}},before=structuredClone(f.document);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.equal(after.state.minute-now,60);assert.equal(out.result.cost.sleep.minutes,60);assert.equal(out.result.cost.sleep.coveredMinutes,0);
 assert.equal(after.state.player.body.stamina.value,27.2);
 const old=await f.engine.reduce(before,input,{replay:true,result:{}});assert.equal(old.result.cost,undefined);
});

test('A8: unmatched known magic pays its real MP/materials on every grade and cannot exceed its native healing source',async()=>{
 const f=fixture(),spell=f.engine.world.spells.find(s=>s.id==='spell_s3_mend_palm');
 f.engine.world.actionDefinitions={format:1,actions:[]};
 f.document.state.skills[spell.skill]={proficiency:10,breakthroughs:[],daily:{}};f.document.state.spells[spell.id]={};
 f.document.state.inventory[spell.materials[0].item]={quantity:2};delete f.document.ledger;
 f.document=withLedger(f.engine,f.document).document;
 f.document.state.player.mp=20;f.document.state.player.hp=10;f.document.state.player.maxHp=100;
 const input={tool:'world_propose',eventId:'a8-magic',args:{intent:'用掌心的术法抚平我身上的伤',means:{spell:spell.id},effects:[{op:'vital',target:'player',delta:999,type:'healing'}]}};
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches),receipt=out.result.receipt,key=accountKey('player',spell.materials[0].item,'inventory');
 assert.equal(after.state.player.mp,before.state.player.mp-spell.mp);assert.equal(after.ledger.accounts[key],before.ledger.accounts[key]-1);
 assert.ok(after.state.player.hp-before.state.player.hp<=spell.effectSpec.power);assert.deepEqual(auditLedger(after.ledger),[]);
 assert.equal(receipt.requirements.mp,spell.mp);assert.equal(receipt.check.degree,preview.receipt.check.degree);
 assert.equal(receipt.openUsage.produced['vital:heal']??0,receipt.applied.filter(e=>e.op==='vital'&&e.delta>0).reduce((n,e)=>n+(e.result.healed??0),0));
 f.document.state.player.mp=0;await assert.rejects(f.engine.reduce(f.document,{...input,eventId:'a8-no-mp'}),{code:'E-OPEN-MP'});
 assert.equal(f.document.ledger.accounts[key],before.ledger.accounts[key]);
});

test('A8: a catalog call to world_propose uses the native open executor through world_act and permission/preview',async()=>{
 const f=fixture(),action={id:'test:proposal',label:'提出行动',narration:'proposal',synonyms:[],visibility:{catalog:'search'},slots:[{name:'intent',kind:'text',required:true},{name:'effects',kind:'object',required:true}],call:{tool:'world_propose'}};
 f.engine.world.actionDefinitions={format:1,actions:[action]};
 const slots={intent:'向身边的人报信',effects:[{op:'emit',verb:'tell',target:f.npc,visibility:'witnessed',payload:{text:'路上平安'}}]},input={tool:'world_act',eventId:'a8-catalog-proposal',args:{action:action.id,slots}};
 assert.equal(f.engine.actionPermission(f.document,input.args).allowed,true);
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.status,'preview');assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.equal(out.result.receipt.status,'committed');assert.equal(out.result.receipt.routing.proposal.intent,slots.intent);assert.equal(after.state.minute-before.state.minute,2);
});

test('A8: public rite dispatch uses the archived stage and true daylight once, retaining no-cost preview and retry',async()=>{
 const f=fixture(),action={id:'test:a8-rite',label:'祈愿',narration:'rite',synonyms:[],visibility:{catalog:'here'},slots:[],cost:{owner:'primitives',time:0},outcomes:[{op:'emit',verb:'tell',visibility:'witnessed',payload:{kind:'prayer'}}],rite:{officiant:'actor == "player"',roles:[],stages:[{id:'prayer',minutes:2,window:f.engine.primitiveRiteDaylight(f.document,f.document.state.location)?'day':'night',materials:[]}]}};
 f.engine.world.actionDefinitions={format:1,actions:[action]};
 const input={tool:'world_act',eventId:'a8-public-rite',args:{action:action.id,slots:{}}},before=structuredClone(f.document);
 assert.equal(f.engine.actionPermission(f.document,input.args).allowed,true);
 const preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.cost.time,2);assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.equal(out.result.receipt.rite.status,'completed');assert.equal(after.state.minute-before.state.minute,2);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),input)).patches,[]);
});
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=withLedger(engine,engine.createCharacter(seed,{},'a3-connectors')).document;
 document.holdings=openHoldings(engine,document);
 const npc=Object.keys(document.state.npcs).find(id=>document.state.npcs[id].location&&document.state.npcs[id].coins>0);
 document.state.location=document.state.npcs[npc].location;
 return {engine,document,npc};
}
function registered(f){
 const to=accountKey(f.npc,'coin_river','purse');
 const action={id:'test:gift',label:'递交铜钱',verb:'transfer',narration:'test.gift',synonyms:[],signature:[JSON.stringify(['transfer','person','coin_river'])],participants:{actor:'player',target:['person']},visibility:{catalog:'target:npc'},slots:[{name:'to',kind:'text',schema:'string',required:true}],cost:{owner:'primitives',time:2},outcomes:[{op:'transfer',from,to:{slot:'to'},qty:5}]};
 f.engine.world.actionDefinitions={format:1,actions:[action]};
 return {tool:'world_propose',eventId:'a3-proposal',args:{intent:action.label,participants:{target:f.npc},effects:[{op:'transfer',from,to,qty:9999}],source:{kind:'catalog',id:'forged'},bounds:{qty:9999},transferAuthorized:true}};
}
function install(t){
 const previous=registerOpenActionContext((engine,document)=>({routing:{actor:'player',kindOf:id=>{
  if(typeof id==='string'&&id.includes('|'))id=parseAccount(id).owner;
  return id==='player'||document.state.npcs[id]?'person':null;
 },visible:(_action,participants)=>!participants.target||document.state.npcs[participants.target]?.location===document.state.location,
 slotsFor:(action,proposal)=>action.slots.some(slot=>slot.name==='to')&&proposal.effects[0]?.op==='transfer'?{to:proposal.effects[0].to}:{}},
 limits:()=>({actor:'player',sourceFor:()=>null})}));
 t.after(()=>registerOpenActionContext(previous));
}

test('A3 connectors: public proposal persists native routing in its atomic receipt; JSON retry and recomputation agree',async t=>{
 install(t);const f=fixture(),input=registered(f),before=structuredClone(f.document);
 const preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.status,'preview');assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches),receipt=out.result.receipt;
 assert.equal(after.ledger.accounts[from],before.ledger.accounts[from]-5);assert.equal(after.state.minute,before.state.minute+2);assert.deepEqual(auditLedger(after.ledger),[]);
 assert.equal(receipt.routing.intent,input.args.intent);assert.deepEqual(receipt.routing.proposal,input.args);assert.ok(receipt.candidates.length);assert.deepEqual(receipt.signature,preview.receipt.signature);
 assert.deepEqual(after.state.records[`primitive:${input.eventId}`].receipt.routing,receipt.routing);
 assert.deepEqual(after.state.records[`open_proposal:${input.eventId}`].result.receipt,receipt);
 assert.deepEqual(await f.engine.reduce(f.document,input),out,'same archived inputs recompute the same patches and explanations');
 const loaded=JSON.parse(JSON.stringify(after));loaded.state.npcs[f.npc].location=null;
 const duplicate=await f.engine.reduce(loaded,input);assert.equal(duplicate.result.receipt.duplicate,true);assert.deepEqual(duplicate.patches,[]);
 await assert.rejects(f.engine.reduce(loaded,{...input,args:{...input.args,intent:'另一个意图'}}),{code:'E-PRIMITIVE-DUPLICATE'});
});

test('A3 connectors: native context is rebuilt at confirmation; unmatched and missing-slot submissions do not write',async t=>{
 install(t);const f=fixture(),input=registered(f);
 await f.engine.previewAction(f.document,input);
 f.document.ledger.accounts[from]=0;const before=structuredClone(f.document);
 await assert.rejects(f.engine.reduce(f.document,input),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(f.document,before);
 f.document.state.npcs[f.npc].location=null;
 const hidden=await f.engine.previewAction(f.document,input);assert.equal(hidden.receipt.status,'not_submitted');assert.deepEqual(hidden.receipt.applied,[]);
 await assert.rejects(f.engine.reduce(f.document,input),{code:'E-OPEN-NOT-ROUTED'});
 f.document.state.npcs[f.npc].location=f.document.state.location;
 // Preserve the target-kind signature while a separate required slot is absent.
 f.engine.world.actionDefinitions.actions[0].slots.push({name:'purpose',kind:'text',schema:'string',required:true});
 const noSlot=input;
 const missing=await f.engine.previewAction(f.document,noSlot);assert.equal(missing.prepared.status,'needs_slots');
 await assert.rejects(f.engine.reduce(f.document,noSlot),{code:'E-OPEN-NOT-ROUTED'});
});

test('A3 connectors: legacy routed actions execute through their original handler with structured preview costs',async t=>{
 install(t);const f=fixture();
 f.engine.world.actionDefinitions={format:1,actions:[{id:'test:wait',label:'等待片刻',narration:'test.wait',synonyms:[],signature:[JSON.stringify(['time','person',''])],participants:{actor:'player'},visibility:{catalog:'here'},slots:[],call:{tool:'world_time',fixed:{minutes:2}}}]};
 const input={tool:'world_propose',eventId:'legacy-proposal',args:{intent:'等待片刻',effects:[{op:'time',entity:'player',minutes:999}]}};
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);
 assert.equal(preview.receipt.cost.time,2);assert.equal(preview.receipt.cost.coins,null);assert.equal(preview.receipt.witnesses,null);assert.equal(preview.receipt.permission.allowed,true);assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
 assert.equal(after.state.minute,before.state.minute+2);assert.equal(out.result.receipt.status,'committed');assert.deepEqual(out.result.receipt.routing.proposal,input.args);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(after)),input)).patches,[]);
});

test('A3 connectors: permission query uses normalized legacy families and primitive regime checks without changing state',async()=>{
 const f=fixture(),destination=f.engine.world.locations.find(l=>l.id!==f.document.state.location).id;
 const legacy={id:'test:legacy-move',label:'move',slots:[],call:{tool:'world_move',fixed:{destination}}};
 const primitive={id:'test:primitive-move',label:'move',slots:[],outcomes:[{op:'move',to:destination}]};
 f.engine.world.actionDefinitions={format:1,actions:[legacy,primitive]};
 f.document.holdings.rows.a3_detained={id:'a3_detained',kind:'guest_of',variant:'detained',holder:'player',subject:f.document.state.location};
 const before=structuredClone(f.document);
 for(const action of [legacy.id,primitive.id]){
  const result=f.engine.actionPermission(f.document,{action});assert.equal(result.allowed,false);assert.equal(result.checks[0].family,'move');assert.equal(result.checks[0].regime,'a3_detained');
  const execution=f.engine.reduce(f.document,{tool:'world_act',eventId:action,args:{action,slots:{}}});
  // Legacy business Error follows 06 §6.10.4; the primitive policy exception
  // retains its existing thrown contract and custody reason.
  if(action===legacy.id)await assertActionRejected(execution,/羁押|custody|detain|拘/);
  else await assert.rejects(execution,/羁押|custody|detain|拘/);
 }
 assert.deepEqual(f.document,before);
});

function teachingFixture(){
 const local=structuredClone(world),teacher='npc_hw_luqing',skill='skill_a3_native_lesson',place='bld_hw_school';
 for(const npc of local.npcs){npc.tier='fixture';delete npc.schedule;}
 const tutor=local.npcs.find(n=>n.id===teacher);tutor.profileStatus='full';tutor.services.push(skill);
 local.skills.push({id:skill,name:'接点工艺',attribute:'智力',stage:0,profession:null,prerequisites:[],learnMinutes:120,learnFee:12});
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete local.rules[key];
 for(const faction of local.factions)delete faction.clock;
 const engine=new WorldEngine(local),document=withLedger(engine,engine.initialFromLegacy(seed,'a3-native-learning')).document;
 document.holdings=openHoldings(engine,document);document.state.location=place;
 Object.assign(document.state.npcs[teacher],{location:place,status:'健康',activity:'休息',trust:80,goals:{},skills:{[skill]:500}});
 const d=engine.primitiveDraft(document);recordLocalContact(d,engine,teacher,'contact');
 return {engine,document:applyPatches(document,d.patches),teacher,skill,tutor};
}
function lesson(f,id,minutes){
 return commitPrimitives(f.document,[{op:'learn',entity:'player',subject:f.skill,learningSource:f.teacher}],createRuntimePrimitiveFrame(f.engine,f.document,{eventId:id,source:{kind:'catalog',id:'test:lesson'},limits:{learn:{minutes}}}));
}
test('A3 connectors: known-skill instruction asks the willing teacher; refusal retains real quarter-rate observation',()=>{
 const f=teachingFixture();f.document.state.skills[f.skill]={proficiency:0,grade:'初级1等',breakthroughs:[],daily:{}};
 const full=lesson(f,'native-instruction',60),taught=applyPatches(f.document,full.patches),result=full.receipt.applied[0].result;
 assert.equal(result.permission.kind,'decision');assert.equal(result.permission.decision.outcome,'agree');assert.equal(result.observed,false);assert.equal(result.gain,3);assert.equal(taught.state.skills[f.skill].practiceCarry,.4);assert.equal(taught.state.minute-f.document.state.minute,60);
 f.tutor.redLines=['teach'];f.document.state.npcs[f.teacher].activity='授艺演示';f.document.state.npcs[f.teacher].practicing=f.skill;
 const partial=lesson(f,'observe-native-instruction',60),observed=applyPatches(f.document,partial.patches),part=partial.receipt.applied[0].result;
 assert.equal(part.permission.decision.outcome,'refuse');assert.equal(part.observed,true);assert.equal(part.gain,0);assert.equal(observed.state.skills[f.skill].practiceCarry,.85);assert.ok(part.detection);
 delete f.document.state.npcs[f.teacher].practicing;
 const before=structuredClone(f.document);assert.throws(()=>lesson(f,'no-demonstration',60),{code:'E-LEARN-OBSERVE'});assert.deepEqual(f.document,before);
});

test('A3 connectors: first acquisition preserves the existing price, duration and decision, with atomic refusal',()=>{
 const f=teachingFixture(),before=structuredClone(f.document),out=lesson(f,'initial-native-lesson',120),after=applyPatches(f.document,out.patches),result=out.receipt.applied[0].result;
 assert.equal(result.source.consent.kind,'decision');assert.equal(after.state.minute-before.state.minute,120);assert.equal(before.state.player.coins-after.state.player.coins,12);
 assert.equal(after.ledger.accounts[from],before.ledger.accounts[from]-12);assert.deepEqual(after.state.npcs[f.teacher].skills,before.state.npcs[f.teacher].skills);
 f.tutor.redLines=['teach'];assert.throws(()=>lesson(f,'refused-initial-native-lesson',120),/导师未同意/);assert.deepEqual(f.document,before);
});

test('A3 connectors: legacy preview exposes the actual check and observable witnesses, never unrelated span events',async()=>{
 const f=teachingFixture(),observer=Object.keys(f.document.state.npcs).find(id=>id!==f.teacher);
 Object.assign(f.document.state.npcs[observer],{location:f.document.state.location,status:'健康',activity:'休息'});
 f.engine.world.actionDefinitions={format:1,actions:[{id:'test:legacy-lesson',label:'learn',slots:[],call:{tool:'world_learn',fixed:{entity:f.skill,source:f.teacher}}}]};
 const before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,{tool:'world_act',eventId:'preview-legacy-lesson',args:{action:'test:legacy-lesson',slots:{}}});
 assert.equal(preview.receipt.cost.time,120);assert.equal(preview.receipt.cost.coins,12);assert.equal(preview.receipt.check.difficulty,10);assert.ok(preview.receipt.witnesses.includes(observer));
 assert.deepEqual(preview.receipt.consequences.map(row=>row.type),['learn']);assert.deepEqual(f.document,before);
});

test('A3 connectors: HTTP proposals preserve intent through export/import replay and anchor rollback',async t=>{
 install(t);
 const {default:express}=await import('express'),{once}=await import('node:events'),{init}=await import('../server-plugin/index.mjs'),{tmpRoot}=await import('../tools/tmp-root.mjs'),path=await import('node:path');
 const root=await fs.mkdtemp(path.join(tmpRoot(),'a3-proposal-http-')),to=accountKey('sink:consume','coin_river','action');
 const action={id:'test:spend',label:'递交铜钱',narration:'test.spend',synonyms:[],signature:[JSON.stringify(['transfer','*','coin_river'])],participants:{actor:'player'},visibility:{catalog:'here'},slots:[],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from,to,qty:2}]};
 const local={...structuredClone(world),actionDefinitions:{format:1,actions:[action]}};
 const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();await init(router,{world:local,baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false,populationProfilesEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});await once(server,'listening');
 const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const created=await request('/create',{character:{}});assert.equal(created.status,200,created.body.error);const campaignId=created.body.reference.campaignId;
 const before=(await request('/read',{campaignId})).body,input={campaignId,tool:'world_propose',eventId:'http-open-spend',anchor:'open-anchor',expectedSequence:before.reference.sequence,args:{intent:action.label,effects:[{op:'transfer',from,to,qty:9999}]}};
 const permission=await request('/actions/permission',{campaignId,action:action.id});assert.equal(permission.status,200,permission.body.error);assert.equal(permission.body.allowed,true);
 const preview=await request('/propose',input);assert.equal(preview.status,200,preview.body.error);assert.equal(preview.body.receipt.status,'preview');assert.deepEqual((await request('/read',{campaignId})).body,before);
 const committed=await request('/execute',input);assert.equal(committed.status,200,committed.body.error);assert.deepEqual(committed.body.result.receipt.routing.proposal,input.args);
 const after=(await request('/read',{campaignId})).body;assert.equal(after.document.state.player.coins,before.document.state.player.coins-2);assert.equal(after.document.state.minute,before.document.state.minute+1);
 const duplicate=await request('/execute',input);assert.equal(duplicate.body.duplicate,true);assert.deepEqual((await request('/read',{campaignId})).body,after);
 const bundle=(await request('/export',{campaignId})).body,imported=await request('/import',{bundle});assert.equal(imported.status,200,imported.body.error);assert.deepEqual(imported.body.document,after.document);
 const rolled=await request('/reconcile',{campaignId,validAnchors:[]});assert.equal(rolled.status,200,rolled.body.error);assert.equal(rolled.body.document.state.player.coins,before.document.state.player.coins);assert.equal(rolled.body.document.state.records['open_proposal:http-open-spend'],undefined);assert.equal(rolled.body.document.state.records['primitive:http-open-spend'],undefined);
});

test('A9: production HTTP exposes and executes the archived proposal gateway and mark assets',async t=>{
 const {default:express}=await import('express'),{once}=await import('node:events'),{init}=await import('../server-plugin/index.mjs'),{tmpRoot}=await import('../tools/tmp-root.mjs'),path=await import('node:path');
 const root=await fs.mkdtemp(path.join(tmpRoot(),'a9-production-http-')),app=express();app.use(express.json({limit:'100mb'}));
 const router=express.Router();await init(router,{world:structuredClone(world),baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false,populationProfilesEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});await once(server,'listening');
 const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,data.error);return data;};
 const created=await request('/create',{character:{}}),campaignId=created.reference.campaignId,before=await request('/read',{campaignId});
 const catalog=await request('/actions',{campaignId,query:'提出创意行动'});assert.ok(JSON.stringify(catalog).includes('open:proposal'));
 const input={campaignId,tool:'world_act',eventId:'a9-http-proposal',anchor:'a9-proposal',expectedSequence:before.reference.sequence,args:{action:'open:proposal',slots:{intent:'用一声独特问候传递好意',effects:[{op:'emit',verb:'tell',visibility:'witnessed',payload:{text:'祝你平安'}}]}}};
 const preview=await request('/propose',input);assert.equal(preview.receipt.status,'preview');assert.deepEqual(await request('/read',{campaignId}),before);
 const committed=await request('/execute',input);assert.equal(committed.result.receipt.status,'committed');assert.deepEqual(committed.result.receipt.routing.proposal,input.args.slots);
 const after=await request('/read',{campaignId});assert.equal(after.document.state.minute-before.document.state.minute,2);
 const mark={campaignId,tool:'world_act',eventId:'a9-http-mark',anchor:'a9-mark',expectedSequence:after.reference.sequence,args:{action:'open:leave_mark',slots:{intent:'向旅人问好',form:'刻痕',tags:[world.openTagging.default]}}};
 const markPreview=await request('/propose',mark);assert.equal(markPreview.receipt.status,'preview');assert.deepEqual(await request('/read',{campaignId}),after);
 const placed=await request('/execute',mark),last=await request('/read',{campaignId});assert.equal(placed.result.receipt.status,'committed');assert.ok(last.document.state.created[placed.result.receipt.mark.entity]);
 assert.equal(last.document.state.minute-after.document.state.minute,world.openActionRules.mark.minutes);assert.equal(placed.result.receipt.fallback.originalIntentFulfilled,false);assert.deepEqual(auditLedger(last.document.ledger),[]);
 assert.equal((await request('/execute',mark)).duplicate,true);assert.deepEqual(await request('/read',{campaignId}),last);
});
