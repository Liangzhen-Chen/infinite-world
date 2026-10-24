import test from 'node:test';
import assert from 'node:assert/strict';
import {assertActionRejected} from './helpers/action-refusal.mjs';
import {emptyLedger,accountKey,withLedger,openLedger} from '../server-plugin/ledger.mjs';
import {emptyHoldings,openHoldings,openHolding,closeHolding,declareHoldingWriter} from '../server-plugin/holdings.mjs';
declareHoldingWriter('a3-transaction-test',{kinds:['guest_of']});
import {applyPatches} from '../server-plugin/storage.mjs';
import {createPrimitiveFrame,planPrimitives,commitPrimitives,queuePrimitiveProposal} from '../server-plugin/primitives.mjs';
import {resolveContest,Scheduler} from '../server-plugin/scheduler.mjs';
import {registerWorldEventSubscriber} from '../server-plugin/world-events.mjs';
import {createRuntimePrimitiveFrame,primitiveContext} from '../server-plugin/primitives-runtime.mjs';
import {consent} from '../server-plugin/action-consent.mjs';
import {authority} from '../server-plugin/action-authority.mjs';
import {legalCodeAt} from '../server-plugin/law-codes.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import fs from 'node:fs/promises';
import {recordLocalContact} from '../server-plugin/environment.mjs';
import {auditLedger} from '../server-plugin/ledger.mjs';
import {isGone} from '../server-plugin/holdings.mjs';
import {petCareRules} from '../world/design/pet-foundation.mjs';
import {primitiveRuntime} from '../server-plugin/primitives-runtime.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import {adjudicateLegalCase} from '../server-plugin/law.mjs';
const a=accountKey('player','coin_river','purse'),b=accountKey('npc_a','coin_river','purse');
function fixture(){
 const document={state:{minute:2,records:{}},ledger:emptyLedger(),holdings:emptyHoldings()};document.ledger.accounts={[a]:10,[b]:0};
 const options={actor:'player',eventId:'tx-one',source:{kind:'open',id:'builder'},canAct:()=>({allowed:true}),authority:()=>({allowed:true}),location:()=> 'loc',mirrorTransfer:()=>{},factPolicy:{project:{condition:{type:'number',min:0,max:100}}},verbs:['tell']};
 document.holdings.entities.project_a={id:'project_a',kind:'project',facts:{condition:20}};
 return {document,options,frame:createPrimitiveFrame(options),effect:{op:'transfer',from:a,to:b,qty:6}};
}
test('A3 transaction: second transfer failure rolls back the whole proposal',()=>{
 const {document,frame,effect}=fixture(),before=structuredClone(document);assert.throws(()=>commitPrimitives(document,[effect,effect],frame),e=>e.code==='E-TRANSFER-BALANCE'&&e.index===1);assert.deepEqual(document,before);
});
test('A3 transaction: commit rechecks facts after preview; no stale authority or balance',()=>{
 const {document,frame,effect,options}=fixture();planPrimitives(document,[effect],frame);document.ledger.accounts[a]=1;
 assert.throws(()=>commitPrimitives(document,[effect],frame),{code:'E-TRANSFER-BALANCE'});
 document.ledger.accounts[a]=10;let permitted=true;const f=createPrimitiveFrame({...options,authority:()=>({allowed:permitted})});planPrimitives(document,[effect],f);permitted=false;
 assert.throws(()=>commitPrimitives(document,[effect],f),{code:'E-AUTHORITY'});
});
test('A3 transaction: duplicate event after JSON save/load is idempotent; changed payload rejects',()=>{
 const {document,frame,effect}=fixture(),first=commitPrimitives(document,[effect],frame),next=JSON.parse(JSON.stringify(applyPatches(document,first.patches))),again=commitPrimitives(next,[effect],frame);
 assert.deepEqual(again.patches,[]);assert.deepEqual(again.events,[]);assert.equal(again.receipt.duplicate,true);
 assert.throws(()=>commitPrimitives(next,[{...effect,qty:1}],frame),{code:'E-PRIMITIVE-DUPLICATE'});
 // Removing the committed patches and recomputing produces identical events.
 assert.deepEqual(commitPrimitives(document,[effect],frame),first);
});
test('A3 transaction: fact.set uses registered writer and whitelist, never accounts or skills',()=>{
 const {document,frame}=fixture(),effect={op:'fact.set',entity:'project_a',field:'condition',delta:5},result=commitPrimitives(document,[effect],frame),next=applyPatches(document,result.patches);
 assert.equal(next.holdings.entities.project_a.facts.condition,25);assert.equal(document.holdings.entities.project_a.facts.condition,20);
 for(const field of ['coin','coins','treasury','inventory','skills','age','belief','minute','__proto__'])assert.throws(()=>commitPrimitives(document,[{...effect,field}],frame),{code:'E-FACT-FIELD'});
 assert.throws(()=>commitPrimitives(document,[{...effect,delta:81}],frame),{code:'E-FACT-RANGE'});
});
test('A3 transaction: reaction-facing event is returned only after all effects succeed',()=>{
 const {document,frame,effect}=fixture(),emit={op:'emit',verb:'tell',target:'npc_a',payload:{text:'hello'},visibility:'private'};
 const result=commitPrimitives(document,[effect,emit],frame);assert.equal(result.events[2].result.visibility,'private');assert.equal(result.events[2].parent,'tx-one');
 assert.throws(()=>commitPrimitives(document,[emit,{...effect,qty:11}],frame),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(document.state.records,{});
});

const runtimeWorld=await loadWorld(),runtimeSeed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function runtimeFixture(){
 const engine=new WorldEngine(structuredClone(runtimeWorld));
 const document=withLedger(engine,engine.createCharacter(runtimeSeed,{},'a3-runtime')).document;
 document.holdings=openHoldings(engine,document);
 const npc=Object.keys(document.state.npcs).find(id=>document.state.npcs[id].location&&document.state.npcs[id].coins>0);
 document.state.location=document.state.npcs[npc].location;
 assert.ok(npc,'requires an actually present recipient');
 return {engine,document,npc};
}

function effectFixture(){
 const f=runtimeFixture();
 f.engine.world.primitiveTables=structuredClone(runtimeWorld.primitiveTables);
 f.engine.world.primitiveTemplates=structuredClone(runtimeWorld.primitiveTemplates);
 f.engine.world.primitiveFacts=structuredClone(runtimeWorld.primitiveFacts);
 const d=f.engine.primitiveDraft(f.document);recordLocalContact(d,f.engine,f.npc,'a3-contact');
 f.document=applyPatches(f.document,d.patches);
 f.frame=(id,limits={})=>createRuntimePrimitiveFrame(f.engine,f.document,{eventId:id,source:{kind:'catalog',id:'test:native'},limits});
 return f;
}
function program(f,action){
 action={slots:[],cost:{owner:'primitives'},...action};
 f.engine.actionRegistry={actions:[action],byId:new Map([[action.id,action]]),errors:[]};
 return {tool:'world_act',eventId:`event-${action.id}`,args:{action:action.id,slots:{}}};
}

function mountedNpcFixture(){
 const f=effectFixture(),{engine,document,npc}=f,id='monster_a3_mount';
 engine.rules.petCare=structuredClone(petCareRules);
 const base={id,name:'夹具驮马',aliases:[],tamingRule:{category:'mount',rideable:true,riderWeightKg:60,carryKg:150,food:[{item:'item_ration',hungerRelief:50,trustGain:5}],skills:[]}};
 engine.world.monsters.push(base);engine.byId.set(id,base);
 document.state.creatures??={};document.state.pets??={};
 document.state.creatures[id]={name:base.name,location:document.state.npcs[npc].location,hp:30,maxHp:30,level:1,status:'正常',owner:npc,care:{version:1,hunger:20,fatigue:0,mood:60,loyalty:50,sickness:false,sickHours:0,neglectHours:0,nextTick:document.state.minute+60,bond:30,skills:{},experience:0}};
 document.state.pets[id]={petFormat:1,creature:id,category:'mount',status:'活跃',following:true};
 document.state.npcs[npc].mount=id;
 // Fixture ownership is mirrored before execution, as in the existing pet tests.
 document.holdings=openHoldings(engine,document);
 const origin=document.state.npcs[npc].location,edge=engine.world.routes.find(r=>(r.from===origin||r.to===origin)&&r.modes.includes('horse')),to=edge.from===origin?edge.to:edge.from;
 return {...f,id,origin,to};
}

test('A3 NPC riding: actual mount travels with rider, accrues care fatigue, preserves player and ledger through reload',()=>{
 const f=mountedNpcFixture(),{engine,npc,id,document,origin,to}=f,route=engine.route(origin,to,'horse',document.state.minute,document.randomSeed),effects=[{op:'move',to,mode:'horse'}];
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'npc-actual-horse',source:{kind:'catalog',id:'test:ride'}}),before=structuredClone(document);
 const preview=planPrimitives(document,effects,frame);assert.deepEqual(document,before);
 const result=commitPrimitives(document,effects,frame),next=JSON.parse(JSON.stringify(applyPatches(document,result.patches)));
 assert.deepEqual(preview.receipt.applied,result.receipt.applied);
 assert.equal(next.state.npcs[npc].location,to);assert.equal(next.state.creatures[id].location,to);assert.equal(next.state.creatures[id].owner,npc);
 assert.equal(next.state.location,origin);assert.equal(next.state.player.mount,undefined);assert.equal(next.state.minute,document.state.minute+route.minutes);
 assert.ok(next.state.creatures[id].care.fatigue>=Math.ceil(route.movingMinutes/30)*engine.rules.petCare.travelFatiguePer30Minutes);
 assert.equal(next.state.npcs[npc].coins,document.state.npcs[npc].coins-route.cost);assert.deepEqual(auditLedger(next.ledger),[]);
 assert.deepEqual(commitPrimitives(next,effects,frame).patches,[]);assert.equal(engine.npcScheduleReservations,undefined);
});

test('A3 NPC riding: move can board an actual owned mount and rolls boarding back when the route fails',()=>{
 const f=mountedNpcFixture(),{engine,document,npc,id,to}=f;delete document.state.npcs[npc].mount;document.state.pets[id].following=false;
 const effects=[{op:'move',to,mode:'horse',mount:id}],frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'npc-board-and-ride',source:{kind:'catalog',id:'test:ride'}}),before=structuredClone(document);
 const preview=planPrimitives(document,effects,frame);assert.deepEqual(document,before);
 const result=commitPrimitives(document,effects,frame),next=applyPatches(document,result.patches);assert.deepEqual(result.receipt.applied,preview.receipt.applied);assert.equal(next.state.npcs[npc].mount,id);assert.equal(next.state.creatures[id].location,to);assert.equal(next.state.pets[id].following,true);
 assert.throws(()=>commitPrimitives(document,[{...effects[0],to:'loc_missing_route'}],frame));assert.deepEqual(document,before);
 document.state.creatures[id].owner='player';assert.throws(()=>commitPrimitives(document,effects,frame),{code:'E-MOVE-MOUNT'});
});

test('A3 NPC riding: missing, remote, alien, overloaded, sick, tired and occupied mounts reject atomically',()=>{
 for(const alter of [f=>delete f.document.state.npcs[f.npc].mount,f=>f.document.state.creatures[f.id].location=f.to,f=>f.document.state.creatures[f.id].owner='player',f=>f.engine.byId.get(f.id).tamingRule.carryKg=1,f=>f.document.state.creatures[f.id].care.sickness=true,f=>f.document.state.creatures[f.id].care.fatigue=100,f=>f.document.state.creatures[f.id].care.hunger=80,f=>f.document.state.creatures[f.id].hp=1,f=>f.document.state.creatures[f.id].status='昏迷',f=>f.document.state.player.mount=f.id]){
  const f=mountedNpcFixture();alter(f);const before=structuredClone(f.document),frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor:f.npc,eventId:'invalid-mount',source:{kind:'catalog',id:'test:ride'}});
  assert.throws(()=>commitPrimitives(f.document,[{op:'move',to:f.to,mode:'horse'}],frame),{code:'E-MOVE-MOUNT'});assert.deepEqual(f.document,before);
 }
});

test('A3 NPC riding: local horseback approach uses actual distance and gives rider and mount the same contact evidence',()=>{
 const f=mountedNpcFixture(),{engine,document,npc,id}=f,place=engine.world.locations.find(l=>l.features?.some(row=>row.position?.some(n=>n!==0))),feature=place.features.find(row=>row.position?.some(n=>n!==0));
 document.state.location=place.id;document.state.npcs[npc].location=place.id;document.state.creatures[id].location=place.id;
 const d=engine.primitiveDraft(document);assert.equal(recordLocalContact(d,engine,npc,'rider-local-start'),true);const start=applyPatches(document,d.patches),effects=[{op:'move',to:feature.id,mode:'horse'}];
 const frame=createRuntimePrimitiveFrame(engine,start,{actor:npc,eventId:'local-horse',source:{kind:'catalog',id:'test:ride'}}),preview=planPrimitives(start,effects,frame),result=commitPrimitives(start,effects,frame),next=applyPatches(start,result.patches);
 assert.deepEqual(preview.receipt.applied,result.receipt.applied);assert.deepEqual(next.state.records[`local_actor_position:${npc}`].point,feature.position);assert.deepEqual(next.state.records[`local_actor_position:${id}`].point,feature.position);
 // S4 A / 01 §1.5: ordinary distance is entry→feature zone plus the final
 // approach, each one generated edge; fine points remain spell/contact evidence.
 assert.equal(next.state.minute,start.state.minute+2*Math.ceil(engine.rules.environment.placeLayout.edgeMetres/(engine.rules.environment.walkingMetresPerMinute*engine.rules.travel.horseMultiplier)));assert.ok(next.state.creatures[id].care.fatigue>0);
 assert.deepEqual(engine.magicAreaTargetFacts(engine.primitiveDraft(next),id,place.id).point,feature.position);assert.deepEqual(auditLedger(next.ledger),[]);
});

test('A3 creature movement: self walking follows actual routes, local contact and capacity without moving the player',()=>{
 const f=mountedNpcFixture(),{engine,document,id,origin,to}=f;delete document.state.npcs[f.npc].mount;document.state.pets[id].following=false;
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:id,eventId:'creature-walk',source:{kind:'catalog',id:'test:walk'}}),route=engine.route(origin,to,'walk',document.state.minute,document.randomSeed);
 const preview=planPrimitives(document,[{op:'move',to}],frame),result=commitPrimitives(document,[{op:'move',to}],frame),next=applyPatches(document,result.patches);
 assert.equal(preview.receipt.applied[0].result.destination,to);assert.equal(next.state.creatures[id].location,to);assert.equal(next.state.location,origin);assert.equal(next.state.minute,document.state.minute+route.minutes);assert.deepEqual(auditLedger(next.ledger),[]);
 const place=engine.world.locations.find(l=>l.features?.some(row=>row.position?.some(n=>n!==0))),feature=place.features.find(row=>row.position?.some(n=>n!==0));
 document.state.location=place.id;document.state.creatures[id].location=place.id;
 const d=engine.primitiveDraft(document);assert.equal(recordLocalContact(d,engine,id,'creature-contact'),true);const local=applyPatches(document,d.patches);
 const approached=commitPrimitives(local,[{op:'move',to:feature.id}],createRuntimePrimitiveFrame(engine,local,{actor:id,eventId:'creature-local',source:{kind:'catalog',id:'test:walk'}}));
 assert.deepEqual(applyPatches(local,approached.patches).state.records[`local_actor_position:${id}`].point,feature.position);
 local.state.creatures[id].status='昏迷';assert.throws(()=>commitPrimitives(local,[{op:'move',to:feature.id}],createRuntimePrimitiveFrame(engine,local,{actor:id,eventId:'creature-unable',source:{kind:'catalog',id:'test:walk'}})),{code:'E-CAPACITY'});
});

test('A3 NPC checks: action outcomes use current NPC attributes, deterministic opposed dice, helpers and real tools',()=>{
 const f=effectFixture(),{engine,document,npc}=f,attribute=engine.rules.attributes[0],skill=engine.world.skills.find(s=>(s.stage??0)===0).id;
 document.state.npcs[npc].attributes={...document.state.npcs[npc].attributes,[attribute]:30};document.state.npcs[npc].skills={[skill]:300};
 const other=Object.keys(document.state.npcs).find(id=>id!==npc);document.state.npcs[other].location=document.state.npcs[npc].location;document.state.npcs[other].status='正常';document.state.npcs[other].skills={[skill]:300};
 document.state.obligations.a3_help={type:'协助',promisee:npc,promisor:other,status:'待履行',deadline:document.state.minute+100,skill,attribute};
 const args={attribute,skill,opponent:{npc:'player',attribute},helpers:['a3_help'],advantage:true},before=structuredClone(document),d=engine.primitiveDraft(document),result=engine.primitiveCheck(d,args,'npc-opposed',npc);
 assert.equal(result.actor,npc);assert.equal(result.opponent.npc,'player');assert.equal(result.modifier,12+result.helpers[0].bonus);assert.equal(result.die,Math.max(...result.rolls));assert.equal(d.get('state','obligations','a3_help','status'),'已完成');
 assert.deepEqual(engine.primitiveCheck(engine.primitiveDraft(JSON.parse(JSON.stringify(document))),args,'npc-opposed',npc),result);assert.deepEqual(document,before);
 assert.throws(()=>engine.primitiveCheck(engine.primitiveDraft(document),{...args,modifier:100},'forged-modifier',npc),{code:'E-CHECK-BOUND'});
 const unheld=structuredClone(document);delete unheld.state.npcs[npc].inventory.item_ration;
 assert.throws(()=>engine.primitiveCheck(engine.primitiveDraft(unheld),{attribute,difficulty:10,tools:['item_ration']},'absent-npc-tool',npc),{code:'E-CHECK-TOOLS'});
 const input=program(f,{id:'test:npc_checked',check:{attribute,difficulty:10},outcomes:{success:[{op:'emit',verb:'tell',visibility:'private'}],partial:[{op:'emit',verb:'tell',visibility:'private'}],critical:[{op:'emit',verb:'tell',visibility:'private'}],failure:[],fumble:[]}});
 let won,lost;for(let i=0;i<100&&(!won||!lost);i++){const attempt={...input,eventId:`npc-outcome-${i}`},p=primitiveRuntime.execute(engine,document,attempt,{actor:npc,preview:true});if(p.receipt.check.success)won=attempt;else lost=attempt;}
 assert.ok(won);assert.ok(lost);const success=primitiveRuntime.execute(engine,document,won,{actor:npc}),failure=primitiveRuntime.execute(engine,document,lost,{actor:npc});
 assert.equal(success.receipt.applied.length,1);assert.equal(success.receipt.source.kind,'catalog');assert.equal(failure.receipt.applied.length,0);assert.deepEqual(document,before);
});

test('A3 NPC checks: refused support adjudicates NPC versus player with one check and no failed effect',()=>{
 const f=effectFixture(),{engine,document,npc}=f,effect={op:'status',target:'player',status:'stone_skin',duration:2,magnitude:2};
 const make=id=>createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:id,source:{kind:'catalog',id:'test:npc-support'},limits:{status:{statuses:['stone_skin'],duration:2,magnitude:2}}});
 let win,loss;for(let i=0;i<100&&(!win||!loss);i++){const frame=make(`npc-refused-${i}`),p=planPrimitives(document,[effect],frame);if(p.receipt.check.success)win=frame;else loss=frame;}
 assert.ok(win);assert.ok(loss);const yes=commitPrimitives(document,[effect],win),no=commitPrimitives(document,[effect],loss);
 assert.equal(yes.receipt.applied.length,1);assert.ok(yes.receipt.applied[0].tags.includes('unconsented'));assert.equal(no.receipt.applied.length,0);
 const next=applyPatches(document,no.patches);assert.deepEqual(next.state.effects,document.state.effects);assert.equal(Object.keys(next.state.checks).filter(k=>k.startsWith(loss.eventId)).length,1);
});

function npcStudyFixture(){
 const f=effectFixture(),{engine,document,npc}=f,skill=engine.world.skills.find(s=>(s.stage??0)===0&&!s.prerequisites?.length).id;
 document.state.npcs[npc].skills={[skill]:1};document.state.npcs[npc].activity='研习';document.state.npcs[npc].plan=null;
 engine.byId.get(npc).schedule={default:[{start:0,end:1440,location:document.state.location,activity:'研习',services:['teach']}]};
 return {...f,skill,effect:{op:'learn',subject:skill,learningSource:'practice'},studyFrame:(id,doc=document,minutes=60)=>createRuntimePrimitiveFrame(engine,doc,{actor:npc,eventId:id,source:{kind:'catalog',id:'test:npc-study'},limits:{learn:{minutes}}})};
}

test('A3 NPC learning: practice shares fixed-point rate, daily/repeat/growth caps and survives JSON reload',()=>{
 const f=npcStudyFixture(),{engine,npc,skill,effect}=f,before=structuredClone(f.document),preview=planPrimitives(f.document,[effect],f.studyFrame('npc-practice',f.document,60));assert.deepEqual(f.document,before);
 const first=commitPrimitives(f.document,[effect],f.studyFrame('npc-practice')),next=JSON.parse(JSON.stringify(applyPatches(f.document,first.patches))),gain=first.receipt.applied[0].result.gain;
 assert.equal(gain,1);assert.equal(next.state.npcs[npc].skills[skill].proficiency,2);assert.equal(next.state.npcs[npc].skills[skill].practiceCarry,.2);assert.equal(next.state.minute,before.state.minute+60);assert.deepEqual(next.state.skills,before.state.skills);
 assert.deepEqual(first.receipt.applied,preview.receipt.applied);assert.deepEqual(commitPrimitives(next,[effect],f.studyFrame('npc-practice',next)).patches,[]);
 const repeat=commitPrimitives(next,[effect],f.studyFrame('npc-practice-repeat',next));assert.equal(repeat.receipt.applied[0].result.gain,0);
 next.state.npcs[npc].growth.skills[skill].work=engine.rules.npcGrowth.maximumGain;next.state.npcs[npc].skills[skill].practiceCarry=0;
 const capped=commitPrimitives(next,[effect],f.studyFrame('npc-growth-capped',next));assert.equal(capped.receipt.applied[0].result.gain,0);
 assert.throws(()=>commitPrimitives(f.document,[{...effect,learningSource:'missing-book'}],f.studyFrame('npc-phantom-source')));assert.deepEqual(f.document,before);
});

test('A3 NPC learning: teacher consent, visible observation and withdrawn/remote/unconscious sources use actual NPC checks',()=>{
 const make=()=>{const f=npcStudyFixture(),teacher=Object.keys(f.document.state.npcs).find(id=>id!==f.npc);f.document.state.npcs[teacher].location=f.document.state.location;f.document.state.npcs[teacher].status='正常';f.document.state.npcs[teacher].skills={[f.skill]:300};f.document.state.npcs[teacher].activity='授艺演示';f.document.state.npcs[teacher].practicing=f.skill;f.engine.byId.get(teacher).schedule={default:[{start:0,end:1440,location:f.document.state.location,activity:'授艺演示',services:['teach']}]};const d=f.engine.primitiveDraft(f.document);assert.equal(recordLocalContact(d,f.engine,teacher,'npc-teacher-contact'),true);f.document=applyPatches(f.document,d.patches);return {...f,teacher,effect:{op:'learn',subject:f.skill,learningSource:teacher}};};
 const f=make();f.document.state.consentEvents=[{id:'npc-teach-agrees',type:'consent_given',from:f.teacher,to:f.npc,scope:'teach',purpose:[f.skill],at:f.document.state.minute,until:f.document.state.minute+120}];
 const before=structuredClone(f.document),full=commitPrimitives(f.document,[f.effect],f.studyFrame('npc-taught',f.document)),taught=applyPatches(f.document,full.patches),result=full.receipt.applied[0].result;
 assert.equal(result.gain,3);assert.equal(result.observed,false);assert.equal(taught.state.npcs[f.teacher].skills[f.skill],300);assert.deepEqual(f.document,before);
 const g=make(),watch=commitPrimitives(g.document,[g.effect],g.studyFrame('npc-watched',g.document)),watched=applyPatches(g.document,watch.patches),observed=watch.receipt.applied[0].result;
 assert.equal(observed.gain,0);assert.equal(observed.observed,true);assert.equal(watched.state.npcs[g.npc].skills[g.skill].practiceCarry,.85);assert.equal(observed.detection.actor,g.npc);assert.ok(watch.receipt.applied[0].tags.includes('unconsented'));
 f.document.state.consentEvents.push({id:'npc-teach-withdrawn',type:'consent_revoked',consent:'npc-teach-agrees',from:f.teacher,to:f.npc,scope:'teach',at:f.document.state.minute});f.document.state.npcs[f.teacher].practicing=null;
 assert.throws(()=>commitPrimitives(f.document,[f.effect],f.studyFrame('npc-teach-revoked',f.document)),{code:'E-LEARN-OBSERVE'});
 g.document.state.npcs[g.teacher].status='昏迷';assert.throws(()=>commitPrimitives(g.document,[g.effect],g.studyFrame('npc-teach-unable',g.document)),{code:'E-LEARN-SOURCE'});
});

test('A3 NPC learning: real books accumulate acquisition time and enforce physical copies, literacy and prerequisites',()=>{
 const f=npcStudyFixture(),{engine,document,npc,skill}=f,recipe={...engine.world.recipes.find(r=>(r.minimumProficiency??0)===0),id:'recipe_a3_book_lesson',name:'夹具粥方',skill,stage:0,minimumProficiency:1,prerequisites:[],learnMinutes:120};
 engine.world.recipes.push(recipe);engine.byId.set(recipe.id,recipe);
 const item={id:'item_a3_lesson_book',name:'夹具粥方册',weight:1,book:{grade:engine.rules.books.grades[0],teaches:[recipe.id],readingMinutes:60,prerequisites:[]}};engine.world.items.push(item);engine.byId.set(item.id,item);
 document.state.npcs[npc].inventory[item.id]={quantity:1};document.state.npcs[npc].skills.skill_literacy=engine.rules.books.minimumLiteracy;
 document.ledger=openLedger(engine,document);document.holdings=openHoldings(engine,document);
 const effect={op:'learn',subject:recipe.id,learningSource:item.id},before=structuredClone(document),first=commitPrimitives(document,[effect],f.studyFrame('npc-book-first',document)),half=JSON.parse(JSON.stringify(applyPatches(document,first.patches)));
 assert.equal(first.receipt.applied[0].result.learned,false);assert.equal(half.state.npcs[npc].recipes?.[recipe.id],undefined);assert.deepEqual(document,before);
 const second=commitPrimitives(half,[effect],f.studyFrame('npc-book-second',half)),learned=applyPatches(half,second.patches);assert.equal(second.receipt.applied[0].result.learned,true);assert.equal(learned.state.npcs[npc].recipes[recipe.id].source.id,item.id);assert.equal(learned.state.minute,document.state.minute+120);
 assert.deepEqual(learned.state.npcs[npc].inventory,document.state.npcs[npc].inventory);assert.deepEqual(auditLedger(learned.ledger),[]);
 const missing=structuredClone(document);delete missing.state.npcs[npc].inventory[item.id];assert.throws(()=>commitPrimitives(missing,[effect],f.studyFrame('npc-book-missing',missing)),{code:'E-LEARN-SOURCE'});
 const illiterate=structuredClone(document);illiterate.state.npcs[npc].skills.skill_literacy=0;assert.throws(()=>commitPrimitives(illiterate,[effect],f.studyFrame('npc-book-illiterate',illiterate)),{code:'E-LEARN-LITERACY'});
 const copy=structuredClone(document);copy.state.itemInstances??={};copy.state.itemInstances.a3_book_copy={item:item.id,owner:'player',status:'持有',durability:10,book:item.book};assert.throws(()=>commitPrimitives(copy,[{...effect,learningSource:'a3_book_copy'}],f.studyFrame('npc-book-stolen-copy',copy)),{code:'E-LEARN-SOURCE'});
 const recall={id:'test:recall_study_book',slots:[],cost:{owner:'primitives',time:0},outcomes:[{op:'transfer',from:accountKey(npc,item.id,'inventory'),to:accountKey('player',item.id,'inventory'),qty:1}]};engine.world.primitiveRules.rules.push(recall);
 const recalled=commitPrimitives(document,[{op:'schedule',at:document.state.minute+30,rule:recall.id}],createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'recall-book-later',source:{kind:'catalog',id:'test:recall'}})),pending=applyPatches(document,recalled.patches),pendingBefore=structuredClone(pending);
 assert.throws(()=>commitPrimitives(pending,[effect],f.studyFrame('npc-book-recalled-during-study',pending)),{code:'E-LEARN-SOURCE'});assert.deepEqual(pending,pendingBefore);
 recipe.prerequisites=[{skill,minimum:200}];assert.throws(()=>commitPrimitives(document,[effect],f.studyFrame('npc-book-prerequisite',document)),{code:'E-LEARN-PREREQUISITE'});
});

test('A3 NPC learning: teaching another learner requires their current consent and keeps teacher knowledge',()=>{
 const f=npcStudyFixture(),{engine,document,npc,skill}=f;document.state.skills[skill]={proficiency:300,daily:{},breakthroughs:[]};
 const effect={op:'learn',entity:npc,subject:skill,learningSource:'player'},frame=id=>createRuntimePrimitiveFrame(engine,document,{eventId:id,source:{kind:'catalog',id:'test:teach-npc'},limits:{learn:{minutes:60}}});
 assert.throws(()=>commitPrimitives(document,[effect],frame('no-learner-consent')),{code:'E-AUTHORITY'});
 document.state.consentEvents=[{id:'learner-too-short',type:'consent_given',from:npc,to:'player',scope:'learn',purpose:[skill],at:document.state.minute,until:document.state.minute+1}];
 assert.throws(()=>commitPrimitives(document,[effect],frame('short-learner-consent')),{code:'E-AUTHORITY'});
 document.state.consentEvents=[{id:'learner-agrees',type:'consent_given',from:npc,to:'player',scope:'learn',purpose:[skill],at:document.state.minute,until:document.state.minute+120}];
 const result=commitPrimitives(document,[effect],frame('learner-consents')),next=applyPatches(document,result.patches);assert.equal(result.receipt.applied[0].result.gain,3);assert.equal(next.state.skills[skill].proficiency,300);assert.equal(next.state.npcs[npc].skills[skill].proficiency,4);
 document.state.consentEvents.push({type:'consent_revoked',id:'learner-withdraws',consent:'learner-agrees',from:npc,to:'player',scope:'learn',at:document.state.minute});
 assert.throws(()=>commitPrimitives(document,[effect],frame('learner-revokes')),{code:'E-AUTHORITY'});
});

test('A3 NPC learning: a due rule revoking instruction during study prevents the unearned learning write',()=>{
 const f=npcStudyFixture(),{engine,document,npc,skill}=f,teacher=Object.keys(document.state.npcs).find(id=>id!==npc);
 document.state.npcs[teacher].location=document.state.location;document.state.npcs[teacher].status='正常';document.state.npcs[teacher].skills={[skill]:300};
 engine.byId.get(teacher).schedule={default:[{start:0,end:1440,location:document.state.location,activity:'授艺',services:['teach']}]};
 document.state.consentEvents=[{id:'brief-instruction',type:'consent_given',from:teacher,to:npc,scope:'teach',purpose:[skill],at:document.state.minute,until:document.state.minute+120}];
 const rule={id:'test:withdraw_instruction',slots:[],cost:{owner:'primitives',time:0},outcomes:[{op:'emit',verb:'consent_revoked',target:npc,visibility:'private',payload:{consent:'brief-instruction'}}]};engine.world.primitiveRules.rules.push(rule);
 const scheduled=commitPrimitives(document,[{op:'schedule',at:document.state.minute+30,rule:rule.id}],createRuntimePrimitiveFrame(engine,document,{actor:teacher,eventId:'schedule-withdraw-instruction',source:{kind:'catalog',id:'test:withdraw'}})),next=applyPatches(document,scheduled.patches),before=structuredClone(next);
 assert.throws(()=>commitPrimitives(next,[{op:'learn',subject:skill,learningSource:teacher}],f.studyFrame('withdraw-during-study',next)),{code:'E-LEARN-SOURCE'});assert.deepEqual(next,before);
 const due=engine.primitiveDraft(next);engine.advance(due,30,'instruction-withdraws');assert.equal(consent(primitiveContext(engine,due.document),teacher,npc,'teach',{purpose:skill}).allowed,false);assert.equal(due.get('state','npcs',npc,'skills',skill),1);
});

test('A3 scheduled rules: shipped program is archived, private, exactly once after reload and cannot be supplied as a body',()=>{
 const f=effectFixture(),{engine,document}=f;assert.ok(engine.world.primitiveRules.rules.some(r=>r.id==='core:reminder'));
 const effect={op:'schedule',at:document.state.minute+1,rule:'core:reminder',args:{text:'去赴约'}},before=structuredClone(document),preview=planPrimitives(document,[effect],f.frame('rule-reminder'));assert.deepEqual(document,before);
 const scheduled=commitPrimitives(document,[effect],f.frame('rule-reminder')),next=JSON.parse(JSON.stringify(applyPatches(document,scheduled.patches))),id=scheduled.receipt.applied[0].result;
 assert.equal(preview.receipt.applied[0].result,id);assert.equal(next.state.records[id].do[0].op,'primitive.rule');
 const restored=new WorldEngine(JSON.parse(JSON.stringify(engine.world))),d=restored.primitiveDraft(next);restored.advance(d,2,'rule-due');const final=applyPatches(next,d.patches),receipt=final.state.records[`primitive_schedule_result:${id}`].receipt;
 assert.equal(final.state.records[id].status,'completed');assert.equal(receipt.source.kind,'rule');assert.equal(receipt.source.id,'core:reminder');assert.equal(receipt.applied[0].result.payload.text,'去赴约');
 const event=Object.values(final.state.records).find(r=>r.category==='world_event'&&r.parent===receipt.eventId&&r.verb==='tell');assert.ok(event);assert.equal(event.visibility,'private');assert.deepEqual(event.witnesses,[]);
 const again=restored.primitiveDraft(JSON.parse(JSON.stringify(final)));restored.advance(again,1,'rule-after');assert.deepEqual(again.get('state','records',`primitive_schedule_result:${id}`),final.state.records[`primitive_schedule_result:${id}`]);
 assert.throws(()=>commitPrimitives(document,[{...effect,rule:'missing:program'}],f.frame('unknown-rule')),{code:'E-ACTION'});
 assert.throws(()=>commitPrimitives(document,[{...effect,action:'core:reminder'}],f.frame('ambiguous-schedule')),{code:'E-PRIMITIVE-SCHEMA'});
 assert.throws(()=>commitPrimitives(document,[{...effect,rule:{outcomes:[{op:'time',minutes:1}]}}],f.frame('forged-rule-body')),{code:'E-PRIMITIVE-SCHEMA'});
 assert.deepEqual(document,before);
});

test('A3 scheduled rules: current preconditions/authority reject terminally and multi-effect programs remain atomic',()=>{
 const f=effectFixture(),{engine,document,npc}=f;
 const rule={id:'test:rule_payment',slots:[],cost:{owner:'primitives',time:2},preconditions:['true'],outcomes:[{op:'transfer',from:a,to:accountKey(npc,'coin_river','purse'),qty:1},{op:'transfer',from:a,to:accountKey(npc,'coin_river','purse'),qty:100000}]};engine.world.primitiveRules.rules.push(rule);
 const effect={op:'schedule',at:document.state.minute+1,rule:rule.id},scheduled=commitPrimitives(document,[effect],f.frame('schedule-atomic-rule')),next=applyPatches(document,scheduled.patches),id=scheduled.receipt.applied[0].result;
 const d=engine.primitiveDraft(next);engine.advance(d,2,'fail-rule-due');const final=applyPatches(next,d.patches);
 assert.equal(final.state.records[`primitive_schedule_result:${id}`].status,'rejected');assert.equal(final.state.player.coins,next.state.player.coins);assert.equal(final.state.npcs[npc].coins,next.state.npcs[npc].coins);assert.equal(final.state.records[id].status,'completed');assert.deepEqual(auditLedger(final.ledger),[]);
 rule.outcomes.pop();rule.preconditions=['false'];const d2=engine.primitiveDraft(next);engine.advance(d2,2,'precondition-rule-due');assert.equal(d2.get('state','records',`primitive_schedule_result:${id}`).code,'E-PRECONDITION');
 rule.preconditions=['true'];rule.outcomes[0].from=accountKey(npc,'coin_river','purse');rule.outcomes[0].to=a;const d3=engine.primitiveDraft(next);engine.advance(d3,2,'authority-rule-due');assert.equal(d3.get('state','records',`primitive_schedule_result:${id}`).code,'E-AUTHORITY');
 assert.equal(d3.get('state','player','coins'),next.state.player.coins);assert.equal(d3.get('state','npcs',npc,'coins'),next.state.npcs[npc].coins);
});

test('A3 scheduled rules: an elapsed parent can schedule a child without reentry duplication or clock loss',()=>{
 const f=effectFixture(),{engine,document,npc}=f,at=document.state.minute+1;
 const child={id:'test:nested_child',slots:[],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from:a,to:accountKey(npc,'coin_river','purse'),qty:1}]};
 const parent={id:'test:nested_parent',slots:[],cost:{owner:'primitives',time:3},outcomes:[{op:'schedule',at:at+1,rule:child.id}]};engine.world.primitiveRules.rules.push(parent,child);
 const scheduled=commitPrimitives(document,[{op:'schedule',at,rule:parent.id}],f.frame('nested-rule')),next=JSON.parse(JSON.stringify(applyPatches(document,scheduled.patches))),id=scheduled.receipt.applied[0].result;
 const d=engine.primitiveDraft(next);engine.advance(d,2,'nested-rule-due');const final=applyPatches(next,d.patches),receipt=final.state.records[`primitive_schedule_result:${id}`].receipt,childId=receipt.applied[0].result;
 assert.equal(final.state.records[`primitive_schedule_result:${childId}`].status,'committed');assert.equal(final.state.player.coins,document.state.player.coins-1);assert.equal(final.state.npcs[npc].coins,document.state.npcs[npc].coins+1);assert.ok(final.state.minute>=at+3);assert.deepEqual(auditLedger(final.ledger),[]);
 const again=engine.primitiveDraft(JSON.parse(JSON.stringify(final)));engine.advance(again,1,'nested-rule-after');assert.equal(again.get('state','player','coins'),final.state.player.coins);assert.equal(again.get('state','records',id,'status'),'completed');assert.equal(again.get('state','records',childId,'status'),'completed');
});

test('A3 NPC scheduling: a registered learning action retains its native actor and charges elapsed cost once',()=>{
 const f=npcStudyFixture(),{engine,document,npc,skill}=f,input=program(f,{id:'test:scheduled_npc_study',cost:{owner:'primitives',time:120},outcomes:[f.effect]});
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'schedule-npc-study',source:{kind:'catalog',id:'test:npc-schedule'}}),scheduled=commitPrimitives(document,[{op:'schedule',at:document.state.minute+1,action:input.args.action}],frame),next=JSON.parse(JSON.stringify(applyPatches(document,scheduled.patches))),id=scheduled.receipt.applied[0].result;
 const d=engine.primitiveDraft(next);engine.advance(d,2,'npc-study-due');const final=applyPatches(next,d.patches),receipt=final.state.records[`primitive_schedule_result:${id}`].receipt;
 assert.equal(receipt.actor,npc);assert.equal(receipt.cost.time,120);assert.equal(final.state.npcs[npc].skills[skill].proficiency,3);assert.equal(final.state.npcs[npc].skills[skill].practiceCarry,.4);assert.equal(final.state.minute,document.state.minute+121);assert.deepEqual(final.state.skills,document.state.skills);assert.deepEqual(auditLedger(final.ledger),[]);
});

test('A3 facts: archived kind whitelist and authored work bounds apply through the registered action',async()=>{
 const f=effectFixture(),made=commitPrimitives(f.document,[{op:'create',kind:'item',template:'core:item',facts:{name:'A3事实纸折'}}],f.frame('fact-item'));
 f.document=applyPatches(f.document,made.patches);const item=made.receipt.applied[0].result.entity;
 const input=program(f,{id:'test:fact_work',cost:{owner:'primitives',time:2},outcomes:[{op:'fact.set',entity:item,field:'condition',delta:5}]}),before=structuredClone(f.document);
 const preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.applied[0].result,item);assert.deepEqual(f.document,before);
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches);
 assert.equal(next.holdings.entities[item].facts.condition,5);assert.equal(next.state.minute,before.state.minute+2);assert.equal(result.result.receipt.cost.time,2);
 const frame=createRuntimePrimitiveFrame(f.engine,f.document,{eventId:'fact-budget',source:{kind:'open',id:'native-builder'},limits:{fact:{condition:5}}});
 const work={op:'fact.set',entity:item,field:'condition',delta:3};
 assert.throws(()=>commitPrimitives(f.document,[work,work],frame),{code:'E-FACT-BOUND'});assert.deepEqual(f.document,before);
 const noBound=f.frame('unbounded-fact');assert.throws(()=>commitPrimitives(f.document,[work],noBound),{code:'E-FACT-BOUND'});
 assert.throws(()=>commitPrimitives(f.document,[{...work,field:'coins'}],frame),{code:'E-FACT-FIELD'});
});

test('A3 effects: native time bound, preview isolation, JSON idempotency and rollback',()=>{
 const f=effectFixture(),before=structuredClone(f.document),effects=[{op:'time',minutes:2}],frame=f.frame('two-minutes',{time:2});
 assert.equal(planPrimitives(f.document,effects,frame).receipt.applied[0].result.elapsed,2);assert.deepEqual(f.document,before);
 const result=commitPrimitives(f.document,effects,frame),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.minute,before.state.minute+2);assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),effects,frame).patches,[]);
 assert.throws(()=>commitPrimitives(f.document,[{op:'time',minutes:3}],frame),{code:'E-TIME-BOUND'});
 assert.throws(()=>commitPrimitives(f.document,[...effects,{op:'transfer',from:a,to:b,qty:100000}],frame));assert.deepEqual(f.document,before);
});

test('A3 effects: movement consumes its actual route once and rejects teleportation',()=>{
 const f=effectFixture(),origin=f.document.state.location,edge=f.engine.world.routes.find(r=>r.from===origin||r.to===origin);assert.ok(edge);
 const to=edge.from===origin?edge.to:edge.from,route=f.engine.route(origin,to,'walk',f.document.state.minute,f.document.randomSeed);
 const result=commitPrimitives(f.document,[{op:'move',entity:'player',to,mode:'walk'}],f.frame('walk-route')),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.location,to);assert.equal(next.state.minute,f.document.state.minute+route.minutes);
 for(const npc of f.document.state.player.companions)assert.equal(next.state.npcs[npc].location,to);
 assert.throws(()=>commitPrimitives(f.document,[{op:'move',to:'loc_not_registered'}],f.frame('bad-route')));
 assert.equal(f.document.state.location,origin);assert.deepEqual(auditLedger(next.ledger),[]);
});

test('A3 effects: move can approach a registered local feature using real distance and rejects a remote feature',()=>{
 const f=effectFixture(),place=f.engine.world.locations.find(l=>l.features?.some(row=>row.position?.some(n=>n!==0)));
 const feature=place.features.find(row=>row.position?.some(n=>n!==0));f.document.state.location=place.id;
 // S4 A / 01 §1.5: this published feature has one generated adjacency from
 // entry and one final approach; assert full topology distance and both costs.
 const before=structuredClone(f.document),edgeMetres=f.engine.rules.environment.placeLayout.edgeMetres,metres=2*edgeMetres,minutes=2*Math.ceil(edgeMetres/f.engine.rules.environment.walkingMetresPerMinute);
 const result=commitPrimitives(f.document,[{op:'move',to:feature.id}],f.frame('local-approach')),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.location,place.id);assert.deepEqual(next.state.records.local_player_position.point,feature.position);
 assert.equal(next.state.minute,before.state.minute+minutes);assert.equal(result.receipt.applied[0].result.metres,metres);
 const remote=f.engine.world.locations.find(l=>l.id!==place.id&&l.features?.length);assert.ok(remote);
 assert.throws(()=>commitPrimitives(f.document,[{op:'move',to:remote.features[0].id}],f.frame('remote-approach')));
 assert.deepEqual(f.document,before);
});

test('A3 effects: NPC route movement charges the actual traveller once, preserves player and replays',()=>{
 const f=effectFixture(),npc=f.npc,origin=f.document.state.npcs[npc].location;
 const edge=f.engine.world.routes.find(r=>r.from===origin||r.to===origin);assert.ok(edge);
 const to=edge.from===origin?edge.to:edge.from,route=f.engine.route(origin,to,'walk',f.document.state.minute,f.document.randomSeed);
 const frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor:npc,eventId:'npc-route',source:{kind:'catalog',id:'test:native'}});
 const effects=[{op:'move',to}],before=structuredClone(f.document),preview=planPrimitives(f.document,effects,frame);
 assert.equal(preview.receipt.applied[0].result.destination,to);assert.deepEqual(f.document,before);
 const result=commitPrimitives(f.document,effects,frame),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.npcs[npc].location,to);assert.equal(next.state.npcs[npc].scheduleTravel,undefined);
 assert.equal(next.state.location,origin);assert.equal(next.state.minute,before.state.minute+route.minutes);
 assert.equal(next.state.npcs[npc].coins,before.state.npcs[npc].coins-route.cost);
 assert.deepEqual(auditLedger(next.ledger),[]);assert.equal(f.engine.npcScheduleReservations,undefined);
 assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),effects,frame).patches,[]);
 assert.throws(()=>commitPrimitives(f.document,[{op:'move',to:'loc_not_registered'}],frame));
 assert.deepEqual(f.document,before);
});

test('A3 effects: NPC local approach walks actual distance, retains shared position evidence and rejects remote or unknown origins',()=>{
 const f=effectFixture(),{engine,npc}=f,place=engine.world.locations.find(l=>l.features?.some(row=>row.position?.some(n=>n!==0)));
 const feature=place.features.find(row=>row.position?.some(n=>n!==0));
 f.document.state.location=place.id;f.document.state.npcs[npc].location=place.id;
 const d=engine.primitiveDraft(f.document);assert.equal(recordLocalContact(d,engine,npc,'local-npc-start'),true);f.document=applyPatches(f.document,d.patches);
 const effects=[{op:'move',to:feature.id}],frame=createRuntimePrimitiveFrame(engine,f.document,{actor:npc,eventId:'npc-local-feature',source:{kind:'catalog',id:'test:native'}}),before=structuredClone(f.document);
 const preview=planPrimitives(f.document,effects,frame);assert.deepEqual(f.document,before);
 const result=commitPrimitives(f.document,effects,frame),next=applyPatches(f.document,result.patches);
 assert.deepEqual(preview.receipt.applied[0].result,result.receipt.applied[0].result);
 assert.deepEqual(next.state.records[`local_actor_position:${npc}`].point,feature.position);
 // S4 A: NPCs pay the same adjacency + final approach as players; the
 // unknown-origin, exact contact, replay, coins and ledger assertions stay intact.
 assert.equal(next.state.minute,before.state.minute+2*Math.ceil(engine.rules.environment.placeLayout.edgeMetres/engine.rules.environment.walkingMetresPerMinute));
 assert.equal(next.state.location,place.id);assert.equal(next.state.npcs[npc].location,place.id);assert.equal(next.state.npcs[npc].coins,before.state.npcs[npc].coins);
 assert.deepEqual(engine.magicAreaTargetFacts(engine.primitiveDraft(next),npc,place.id).point,feature.position);
 assert.deepEqual(auditLedger(next.ledger),[]);assert.equal(engine.npcScheduleReservations,undefined);
 assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),effects,frame).patches,[]);
 const unknown=structuredClone(before);delete unknown.state.records[`local_actor_position:${npc}`];
 assert.throws(()=>commitPrimitives(unknown,effects,frame),{code:'E-MOVE-POSITION'});
 const remote=engine.world.locations.find(l=>l.id!==place.id&&l.features?.length);
 assert.throws(()=>commitPrimitives(before,[{op:'move',to:remote.features[0].id}],frame),{code:'E-MOVE-POSITION'});
 const aboard=structuredClone(before);aboard.state.records.a3_transport={category:'transport',status:'moving',passengers:[npc]};
 assert.throws(()=>commitPrimitives(aboard,effects,frame),/active transport/);
 assert.deepEqual(f.document,before);
});

test('A3 effects: walking toward a person consumes distance rather than teleporting; absent coordinates cannot be guessed',()=>{
 const f=effectFixture(),{engine,npc}=f,place=engine.world.locations.find(l=>l.features?.some(row=>row.position?.some(n=>n!==0))),feature=place.features.find(row=>row.position?.some(n=>n!==0));
 f.document.state.location=place.id;f.document.state.npcs[npc].location=place.id;
 const d=engine.primitiveDraft(f.document);recordLocalContact(d,engine,npc,'person-approach-start');f.document=applyPatches(f.document,d.patches);
 const npcFrame=createRuntimePrimitiveFrame(engine,f.document,{actor:npc,eventId:'person-walks-away',source:{kind:'catalog',id:'test:native'}});
 f.document=applyPatches(f.document,commitPrimitives(f.document,[{op:'move',to:feature.id}],npcFrame).patches);
 const before=structuredClone(f.document),effects=[{op:'move',to:npc}],frame=f.frame('approach-person');
 planPrimitives(f.document,effects,frame);assert.deepEqual(f.document,before);
 const result=commitPrimitives(f.document,effects,frame),next=applyPatches(f.document,result.patches);
 assert.deepEqual(next.state.records.local_player_position.point,feature.position);
 // S4 A: the person walked to the feature's zone, so following that person
 // traverses its adjacency and then approaches; it cannot teleport on presence.
 assert.equal(next.state.minute,before.state.minute+2*Math.ceil(engine.rules.environment.placeLayout.edgeMetres/engine.rules.environment.walkingMetresPerMinute));
 assert.equal(next.state.npcs[npc].location,place.id);assert.equal(next.state.location,place.id);assert.deepEqual(auditLedger(next.ledger),[]);
 // S4 permits first approach from a visible zone. An unseen actor with no
 // contact position still supplies no destination and must be rejected.
 const visible=structuredClone(before);delete visible.state.records[`local_actor_position:${npc}`];
 const approached=applyPatches(visible,commitPrimitives(visible,effects,frame).patches);
 assert.deepEqual(engine.magicAreaTargetFacts(engine.primitiveDraft(approached),npc,place.id).point,approached.state.records.local_player_position.point);
 const unknown=structuredClone(visible);unknown.state.npcs[npc].visible=false;
 assert.throws(()=>commitPrimitives(unknown,effects,frame),{code:'E-MOVE-POSITION'});
 const remote=structuredClone(before);remote.state.npcs[npc].location='loc_hw';
 assert.throws(()=>commitPrimitives(remote,effects,frame),{code:'E-MOVE-POSITION'});
 assert.deepEqual(f.document,before);
});

test('A3 effects: both travellers re-read current route closures rather than planning against an empty state',()=>{
 const f=effectFixture(),origin=f.document.state.location,edge=f.engine.world.routes.find(r=>r.from===origin||r.to===origin),to=edge.from===origin?edge.to:edge.from;
 f.document.state.records.a3_closed_routes={category:'war_disruption',since:f.document.state.minute,until:f.document.state.minute+1440,routes:f.engine.world.routes.map(r=>r.id)};
 const effects=[{op:'move',to}],before=structuredClone(f.document);
 assert.throws(()=>commitPrimitives(f.document,effects,f.frame('blocked-player-route')),/没有当前季节/);
 const frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor:f.npc,eventId:'blocked-npc-route',source:{kind:'catalog',id:'test:native'}});
 assert.throws(()=>commitPrimitives(f.document,effects,frame),/没有当前季节/);
 assert.equal(f.engine.airDraft,undefined);assert.deepEqual(f.document,before);
});

test('A3 effects: moving another NPC requires real authority and rechecks detention',()=>{
 const f=effectFixture(),npc=f.npc,origin=f.document.state.npcs[npc].location;
 const edge=f.engine.world.routes.find(r=>r.from===origin||r.to===origin),to=edge.from===origin?edge.to:edge.from;
 const effects=[{op:'move',entity:npc,to}],frame=f.frame('npc-no-authority');
 assert.throws(()=>commitPrimitives(f.document,effects,frame),{code:'E-AUTHORITY'});
 const own=createRuntimePrimitiveFrame(f.engine,f.document,{actor:npc,eventId:'npc-detained',source:{kind:'catalog',id:'test:native'}});
 // A3-A round 6 installs riding: absent mounts must still fail, now at the
 // actual mount/load/care gate rather than the former missing-connector gate.
 assert.throws(()=>commitPrimitives(f.document,[{op:'move',to,mode:'horse'}],own),{code:'E-MOVE-MOUNT'});
 // Detention is written through the holdings interface (which advances holdings.seq and so
 // invalidates the read-view index); a row slipped into the document would be invisible to it.
 const custodyDraft=f.engine.primitiveDraft(f.document);const custody=openHolding(custodyDraft,{kind:'guest_of',variant:'detained',holder:npc,subject:Object.keys(f.document.state.npcs).find(id=>id!==npc),writer:'a3-transaction-test',eventId:'a3-custody',engine:f.engine});
 f.document=applyPatches(f.document,custodyDraft.patches);
 const detained=createRuntimePrimitiveFrame(f.engine,f.document,{actor:npc,eventId:'npc-detained-now',source:{kind:'catalog',id:'test:native'}});
 assert.throws(()=>commitPrimitives(f.document,[{op:'move',to}],detained),{code:'E-CAPACITY'});
 const releaseDraft=f.engine.primitiveDraft(f.document);closeHolding(releaseDraft,{id:custody,reason:'released',writer:'a3-transaction-test',eventId:'a3-release'});
 f.document=applyPatches(f.document,releaseDraft.patches);f.document.state.npcs[npc].scheduleTravel={from:origin,to,depart:0,arrive:f.document.state.minute+1,edges:[]};
 assert.throws(()=>commitPrimitives(f.document,[{op:'move',to}],createRuntimePrimitiveFrame(f.engine,f.document,{actor:npc,eventId:'npc-travelling',source:{kind:'catalog',id:'test:native'}})),/already travelling/);
});

test('A3 effects: core narrative templates reject resources; destruction uses actual lifecycle and wreck',()=>{
 const f=effectFixture(),effect={op:'create',kind:'item',template:'core:item',facts:{name:'A3无价纸折',description:'只是叙述登记，没有库存'}};
 const result=commitPrimitives(f.document,[effect],f.frame('describe-item')),created=applyPatches(f.document,result.patches),id=result.receipt.applied[0].result.entity;
 assert.equal(created.holdings.entities[id].kind,'item');assert.equal(created.holdings.locations[id].at,f.document.state.location);
 assert.equal(created.state.inventory[id],undefined);assert.ok(!Object.keys(created.ledger.accounts).some(key=>key.startsWith(`${id}|`)));
 assert.throws(()=>commitPrimitives(f.document,[{...effect,facts:{...effect.facts,coins:'100'}}],f.frame('mint-description')),{code:'E-CREATE-FACT'});
 assert.throws(()=>commitPrimitives(f.document,[{...effect,template:'not-core'}],f.frame('bad-template')),{code:'E-CREATE-TEMPLATE'});
 assert.throws(()=>commitPrimitives(f.document,[{...effect,facts:{name:f.document.state.player.name}}],f.frame('duplicate-player-name')),{code:'E-CREATE-NAME'});
 const destroyed=commitPrimitives(created,[{op:'destroy',entity:id}],createRuntimePrimitiveFrame(f.engine,created,{eventId:'destroy-paper',source:{kind:'catalog',id:'test:destroy'}})),gone=applyPatches(created,destroyed.patches);
 assert.equal(isGone(f.engine,gone,id),true);assert.ok(gone.holdings.protocol.entities[id].wreck);assert.deepEqual(auditLedger(gone.ledger),[]);
 assert.throws(()=>commitPrimitives(created,[{op:'destroy',entity:'player'}],f.frame('destroy-person')),{code:'E-DESTROY-KIND'});
 assert.throws(()=>commitPrimitives(created,[{op:'transition',entity:'player',kind:'gone',cause:'declared'}],f.frame('fake-judgment')),{code:'E-TRANSITION-PROOF'});
 const dying=structuredClone(f.document);dying.state.player.hp=0;dying.state.player.status='濒死';dying.state.player.dyingSince=dying.state.minute;
 assert.throws(()=>commitPrimitives(dying,[{op:'transition',entity:'player',kind:'gone',cause:'death'}],createRuntimePrimitiveFrame(f.engine,dying,{eventId:'premature-death',source:{kind:'catalog',id:'test:death'}})),{code:'E-TRANSITION-PROOF'});
 assert.equal(dying.state.player.status,'濒死');assert.equal(dying.state.player.xp,f.document.state.player.xp);
});

test('A3 effects: vital uses native amount, healing, protection and actual target distance',()=>{
 const f=effectFixture();f.document.state.player.hp=Math.max(1,f.document.state.player.maxHp-5);
 const healed=commitPrimitives(f.document,[{op:'vital',target:'player',delta:3,type:'physical'}],f.frame('heal-self',{vital:{heal:3}})),next=applyPatches(f.document,healed.patches);
 assert.equal(next.state.player.hp,f.document.state.player.hp+3);assert.equal(healed.receipt.applied[0].result.permission.kind,'self');
 assert.ok(next.state.records['world_event:heal-self:0']);assert.equal(next.state.records['world_event:heal-self:0'].verb,'heal');
 assert.throws(()=>commitPrimitives(f.document,[{op:'vital',target:'player',delta:4}],f.frame('excess-heal',{vital:{heal:3}})),{code:'E-PRIMITIVE-AMOUNT'});
 const remote=structuredClone(f.document);delete remote.state.records[`local_actor_position:${f.npc}`];
 assert.throws(()=>commitPrimitives(remote,[{op:'vital',target:f.npc,delta:-1,type:'physical'}],createRuntimePrimitiveFrame(f.engine,remote,{eventId:'no-distance',source:{kind:'catalog',id:'test:vital'},limits:{vital:{harm:1,rangeMeters:3}}})),{code:'E-PRIMITIVE-REACH'});
 const protectedDoc=structuredClone(f.document);protectedDoc.state.effects.shield={kind:'protection',target:'player',power:5,remaining:5,damageTypes:['physical'],stacking:'strongest',expires:protectedDoc.state.minute+10};
 const protectedNext=applyPatches(protectedDoc,commitPrimitives(protectedDoc,[{op:'vital',target:'player',delta:-3,type:'physical'}],createRuntimePrimitiveFrame(f.engine,protectedDoc,{eventId:'protected',source:{kind:'catalog',id:'test:vital'},limits:{vital:{harm:3}}})).patches);
 assert.equal(protectedNext.state.player.hp,protectedDoc.state.player.hp);assert.equal(protectedNext.state.effects.shield.remaining,2);
});

test('A3 effects: status uses registered limits and native strongest stacking/expiry consumers',()=>{
 const f=effectFixture(),effect={op:'status',target:'player',status:'stone_skin',duration:2,magnitude:3};
 const result=commitPrimitives(f.document,[effect],f.frame('self-stone',{status:{statuses:['stone_skin'],duration:2,magnitude:3}})),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.effects['self-stone:0'].kind,'status');assert.equal(next.state.effects['self-stone:0'].power,3);assert.equal(next.state.effects['self-stone:0'].expires,next.state.minute+2);
 assert.throws(()=>commitPrimitives(f.document,[{...effect,magnitude:4}],f.frame('too-strong',{status:{statuses:['stone_skin'],duration:2,magnitude:3}})),{code:'E-PRIMITIVE-AMOUNT'});
 const expired=applyPatches(next,commitPrimitives(next,[{op:'time',minutes:3}],createRuntimePrimitiveFrame(f.engine,next,{eventId:'status-expiry',source:{kind:'catalog',id:'test:time'},limits:{time:3}})).patches);
 assert.ok(!expired.state.effects['self-stone:0']||expired.state.effects['self-stone:0'].expires<=expired.state.minute);
});

test('A3 effects: K2 weakness cannot amplify vital beyond the native final cap',()=>{
 const f=effectFixture(),target='monster_resin_lump';
 f.document.state.creatures??={};
 f.document.state.creatures[target]={id:target,species:target,level:1,hp:100,maxHp:100,status:'正常',location:f.document.state.location};
 const d=f.engine.primitiveDraft(f.document);recordLocalContact(d,f.engine,target,'a3-weak-body');f.document=applyPatches(f.document,d.patches);
 const result=commitPrimitives(f.document,[{op:'vital',target,delta:-10,type:'fire'}],f.frame('weakness-cap',{vital:{harm:10,rangeMeters:3}})),next=applyPatches(f.document,result.patches),effect=result.receipt.applied[0];
 assert.equal(effect.result.interaction.multiplier,1.5);assert.ok(effect.result.damage>0&&effect.result.damage<=10);assert.equal(next.state.creatures[target].hp,100-effect.result.damage);assert.equal(result.receipt.trimmed[0].reason,'final_vital_limit');
 assert.equal(next.state.creatures[target].status,'正常');
});

test('A3 effects: an NPC uses the same physical facts and actual player consent to heal the player',()=>{
 const f=effectFixture(),source={kind:'catalog',id:'test:npc-care'};f.document.state.player.hp=f.document.state.player.maxHp-4;
 f.document.state.consentEvents=[{id:'player-agrees-care',type:'consent_given',from:'player',to:f.npc,scope:'healing',purpose:[source.id],at:f.document.state.minute,until:f.document.state.minute+120}];
 const frame=createRuntimePrimitiveFrame(f.engine,f.document,{actor:f.npc,eventId:'npc-care-player',source,limits:{vital:{heal:3,rangeMeters:3}}});
 const result=commitPrimitives(f.document,[{op:'vital',target:'player',delta:3}],frame),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.player.hp,f.document.state.player.hp+3);assert.equal(result.receipt.applied[0].result.permission.source,'player-agrees-care');assert.equal(next.state.records['world_event:npc-care-player:0'].actor,f.npc);
});

test('A3 pending: commit-time incapacity rejects only the proposal and persists an idempotent final receipt',()=>{
 const f=effectFixture(),d=f.engine.primitiveDraft(f.document),effects=[{op:'transfer',from:a,to:accountKey(f.npc,'coin_river','purse'),qty:1}],frame=f.frame('revoked-before-contest');
 const pending=queuePrimitiveProposal(d,effects,frame,{claims:[{target:'test:one-coin',quantity:1,capacity:1}]}),coins=d.get('state','player','coins');
 d.set(['state','player','capacity'],'none');
 assert.doesNotThrow(()=>d.contestPool[0].execute());assert.equal(pending.receipt.status,'rejected');assert.equal(pending.receipt.code,'E-CAPACITY');assert.deepEqual(pending.receipt.applied,[]);assert.equal(d.get('state','player','coins'),coins);assert.equal(d.get('state','player','capacity'),'none');
 const again=commitPrimitives(JSON.parse(JSON.stringify(d.document)),effects,frame);assert.equal(again.receipt.status,'rejected');assert.equal(again.receipt.duplicate,true);assert.deepEqual(again.patches,[]);
});

test('A3 pending: a contest loser keeps its final receipt across JSON reload',()=>{
 const f=effectFixture(),d=f.engine.primitiveDraft(f.document),effects=[{op:'transfer',from:a,to:accountKey(f.npc,'coin_river','purse'),qty:1}],frame=f.frame('lost-resource');
 const pending=queuePrimitiveProposal(d,effects,frame,{claims:[{target:'test:one-coin',quantity:1,capacity:1}]});d.contestPool[0].reject('another buyer arrived first');
 assert.equal(pending.receipt.status,'rejected');assert.equal(d.get('state','player','coins'),f.document.state.player.coins);
 const again=commitPrimitives(JSON.parse(JSON.stringify(d.document)),effects,frame);assert.equal(again.receipt.duplicate,true);assert.equal(again.receipt.reason,'another buyer arrived first');
});

test('A3 effects: practice reads the actual learning table, spends time and retains daily decay',()=>{
 const f=effectFixture(),skill=f.engine.world.skills.find(s=>(s.stage??0)===0).id;
 f.document.state.skills[skill]={proficiency:0,grade:'初级1等',breakthroughs:[],daily:{}};
 const before=f.document.state.skills[skill].proficiency,effect={op:'learn',entity:'player',subject:skill,learningSource:'practice',amount:10000};
 const result=commitPrimitives(f.document,[effect],f.frame('bounded-practice',{learn:{minutes:120}})),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.minute,f.document.state.minute+120);assert.ok(result.receipt.applied[0].result.gain<=2);assert.equal(next.state.skills[skill].proficiency,before+result.receipt.applied[0].result.gain);
 const again=commitPrimitives(next,[effect],createRuntimePrimitiveFrame(f.engine,next,{eventId:'repeat-practice',source:{kind:'catalog',id:'test:practice'},limits:{learn:{minutes:120}}}));
 assert.ok(again.receipt.applied[0].result.gain<=result.receipt.applied[0].result.gain);
 assert.throws(()=>commitPrimitives(f.document,[{...effect,learningSource:'missing-book'}],f.frame('bad-learning-source',{learn:{minutes:120}})),{code:'E-LEARN-SOURCE'});
});

test('A3 effects: sub-point practice accumulates across save/load instead of rounding every session to zero',()=>{
 const f=effectFixture(),skill=f.engine.world.skills.find(s=>(s.stage??0)===0).id;
 f.document.state.skills[skill]={proficiency:0,grade:'初级1等',breakthroughs:[],daily:{}};
 let current=f.document;const gains=[];
 for(let i=0;i<3;i++){
  const result=commitPrimitives(current,[{op:'learn',entity:'player',subject:skill,learningSource:'practice'}],createRuntimePrimitiveFrame(f.engine,current,{eventId:`fractional-${i}`,source:{kind:'catalog',id:'test:practice'},limits:{learn:{minutes:30}}}));
  gains.push(result.receipt.applied[0].result.gain);current=JSON.parse(JSON.stringify(applyPatches(current,result.patches)));
 }
 assert.deepEqual(gains,[0,0,1]);assert.equal(current.state.skills[skill].proficiency,1);assert.equal(current.state.skills[skill].practiceCarry,.05);
 const d=f.engine.primitiveDraft(current),legacy=f.engine.practice(d,{skill,gain:0,target:'legacy',nativeGain:10000},'json-cannot-supply-native-gain');
 assert.equal(legacy.gain,0);assert.equal(d.get('state','skills',skill,'practiceCarry'),.05);
});

test('A3 effects: willing teacher gives full instruction; visible unwilling demonstration gives one quarter and may be noticed',()=>{
 const make=()=>{
  const f=effectFixture(),skill=f.engine.world.skills.find(s=>(s.stage??0)===0).id;
  f.document.state.skills[skill]={proficiency:0,grade:'初级1等',breakthroughs:[],daily:{}};
  f.document.state.npcs[f.npc].skills={[skill]:100};f.document.state.npcs[f.npc].activity='授艺演示';f.document.state.npcs[f.npc].practicing=skill;
  f.engine.byId.get(f.npc).schedule={default:[{start:0,end:1440,location:f.document.state.location,activity:'授艺演示',services:['teach']}]};
  return {...f,skill,effect:{op:'learn',entity:'player',subject:skill,learningSource:f.npc}};
 };
 const f=make();f.document.state.consentEvents=[{id:'teacher-agrees',type:'consent_given',from:f.npc,to:'player',scope:'teach',purpose:[f.skill],at:f.document.state.minute,until:f.document.state.minute+120}];
 const full=commitPrimitives(f.document,[f.effect],f.frame('full-instruction',{learn:{minutes:60}})),taught=applyPatches(f.document,full.patches);
 assert.equal(full.receipt.applied[0].result.gain,3);assert.equal(taught.state.skills[f.skill].practiceCarry,.4);assert.equal(full.receipt.applied[0].result.observed,false);
 const g=make(),observed=commitPrimitives(g.document,[g.effect],g.frame('observe-instruction',{learn:{minutes:60}})),watched=applyPatches(g.document,observed.patches),result=observed.receipt.applied[0].result;
 assert.equal(result.observed,true);assert.equal(result.gain,0);assert.equal(watched.state.skills[g.skill].practiceCarry,.85);assert.ok(observed.receipt.applied[0].tags.includes('unconsented'));
 assert.deepEqual(watched.state.records['world_event:observe-instruction:0'].witnesses,result.detection.success?[]:[g.npc]);
 const before=structuredClone(g.document);g.document.state.npcs[g.npc].status='昏迷';
 assert.throws(()=>commitPrimitives(g.document,[g.effect],g.frame('incapable-teacher',{learn:{minutes:60}})),{code:'E-LEARN-SOURCE'});assert.equal(g.document.state.skills[g.skill].proficiency,before.state.skills[g.skill].proficiency);
});

test('A3 adjudication: registered duration/body cost, preview and duplicate calls use one transaction',async()=>{
 const f=effectFixture(),input=program(f,{id:'test:rest',outcomes:[{op:'emit',verb:'tell',target:'player',visibility:'private',payload:{text:'rest'}}],cost:{owner:'primitives',time:30},activity:'light'}),before=structuredClone(f.document);
 const preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.cost.time,30);assert.deepEqual(f.document,before);
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches);
 assert.equal(result.result.minute,before.state.minute+30);assert.equal(next.state.minute,before.state.minute+30);
 assert.equal(next.state.player.body.stamina.value,98.5);assert.equal(next.state.player.body.satiety.value,98.75);assert.equal(next.state.player.body.fatigue.value,1);assert.equal(next.state.player.body.stamina.asOf,next.state.minute);
 assert.deepEqual((await f.engine.reduce(JSON.parse(JSON.stringify(next)),input)).patches,[]);
});

test('A3 adjudication: bounded outcome slots reject amplification and checks select real failure outcomes',async()=>{
 const f=effectFixture(),input=program(f,{id:'test:check',slots:[{name:'gain',kind:'quantity',required:true,max:2}],check:{attribute:'精神',difficulty:30},outcomes:{success:[{op:'vital',target:'player',delta:{slot:'gain'}}],failure:[{op:'emit',verb:'tell',visibility:'private',payload:{text:'failed'}}],fumble:[{op:'emit',verb:'tell',visibility:'private',payload:{text:'fumbled'}}]},cost:{owner:'primitives',time:1}});
 // A3 refusal contract: bounded slot violation keeps its code and zero effects.
 input.args.slots={gain:3};await assertActionRejected(f.engine.reduce(f.document,input),undefined,'E-ACTION-SLOT');
 input.args.slots={gain:2};
 // Search an event id for a natural failed check, with every preview isolated.
 let preview;for(let i=0;i<40;i++){input.eventId=`failed-check-${i}`;preview=await f.engine.previewAction(f.document,input);if(!preview.receipt.check.success)break;}
 assert.equal(preview.receipt.check.success,false);assert.ok(['failure','fumble'].includes(preview.receipt.outcome));assert.ok(preview.receipt.applied.every(e=>e.op!=='vital'));
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.player.hp,f.document.state.player.hp);assert.equal(next.state.minute,f.document.state.minute+1);assert.deepEqual(result.result.receipt.check,preview.receipt.check);
});

test('A3 effects: scheduling runs the registered action at due time and rechecks revoked authority',()=>{
 const f=effectFixture(),action={id:'test:scheduled',slots:[],outcomes:[{op:'transfer',from:a,to:accountKey(f.npc,'coin_river','purse'),qty:1}],preconditions:['slots.enabled == true']};
 // A real current-fact precondition changes between registration and execution.
 action.slots=[{name:'enabled',kind:'flag',schema:'boolean'}];action.preconditions=['canAct(actor, "talk")'];program(f,action);
 const effect={op:'schedule',at:f.document.state.minute+1,action:action.id,args:{enabled:true}},scheduled=commitPrimitives(f.document,[effect],f.frame('defer-gift')),next=applyPatches(f.document,scheduled.patches),id=scheduled.receipt.applied[0].result;
 assert.equal(next.state.records[id].status,'pending');assert.equal(next.state.player.coins,f.document.state.player.coins);
 next.state.player.status='昏迷';
 const d=f.engine.primitiveDraft(next);f.engine.advance(d,2,'due-step');const final=applyPatches(next,d.patches);
 assert.equal(final.state.records[id].status,'completed');assert.equal(final.state.records[`primitive_schedule_result:${id}`].status,'rejected');assert.equal(final.state.player.coins,next.state.player.coins);
 assert.ok(!Object.values(final.state.records).some(r=>r.category==='primitive_receipt'&&r.receipt.source.id===action.id));
});

test('A3 adjudication: resource costs and elapsed body costs commit atomically after contest',async()=>{
 const f=effectFixture(),input=program(f,{id:'test:paid',slots:[{name:'fee',kind:'coins',max:3}],outcomes:[{op:'emit',verb:'tell',visibility:'private',payload:{text:'paid'}}],cost:{owner:'primitives',time:2,resources:[{resource:'coin_river',qty:'slots.fee'}]}});
 input.args.slots={fee:2};const start=f.document.state.minute,coins=f.document.state.player.coins;
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.player.coins,coins-2);assert.equal(next.state.minute,start+2);assert.equal(result.result.minute,start+2);assert.equal(result.result.receipt.cost.time,2);
 assert.equal(next.ledger.flows[accountKey('sink:consume','coin_river','action')],2);assert.deepEqual(auditLedger(next.ledger),[]);
 assert.deepEqual((await f.engine.reduce(next,input)).patches,[]);
 await assert.rejects(f.engine.reduce(next,{...input,args:{...input.args,slots:{fee:3}}}),{code:'E-PRIMITIVE-DUPLICATE'});
 const before=structuredClone(f.document);f.document.state.player.coins=0;f.document.ledger.accounts[a]=0;
 // Insufficient funds is a world refusal; preserve time/record rollback checks.
 await assertActionRejected(f.engine.reduce(f.document,{...input,eventId:'no-cost-funds'}),undefined,'E-TRANSFER-BALANCE');assert.equal(f.document.state.minute,before.state.minute);assert.ok(!f.document.state.records['primitive:no-cost-funds']);
});

test('A3 adjudication: a committed receipt survives changed preconditions after preview',async()=>{
 const f=effectFixture(),input=program(f,{id:'test:one-time',outcomes:[{op:'emit',verb:'tell',visibility:'private',payload:{text:'once'}}],preconditions:['canAct(actor, "talk").allowed']});
 const next=applyPatches(f.document,(await f.engine.reduce(f.document,input)).patches);next.state.player.status='昏迷';
 assert.deepEqual((await f.engine.reduce(next,input)).patches,[]);
 // Replayed success stays above; a new attempt must refuse the changed condition.
 await assertActionRejected(f.engine.reduce(next,{...input,eventId:'different-id'}),undefined,'E-PRECONDITION');
});

test('A3 adjudication: theft needs an actual successful catalog check and clips the entire proposal',async()=>{
 const f=effectFixture();f.document.state.npcs[f.npc].coins=100;const from=accountKey(f.npc,'coin_river','purse');f.document.ledger=openLedger(f.engine,f.document);
 const input=program(f,{id:'test:theft',theft:true,check:{attribute:'敏捷',difficulty:10},outcomes:[{op:'transfer',from,to:a,qty:15},{op:'transfer',from,to:a,qty:15}]});
 let preview;for(let i=0;i<40;i++){input.eventId=`theft-check-${i}`;preview=await f.engine.previewAction(f.document,input);if(preview.receipt.check.success)break;}
 assert.equal(preview.receipt.check.success,true);assert.equal(preview.receipt.applied.reduce((n,e)=>n+(e.op==='transfer'?e.qty:0),0),f.engine.rules.law.maximumTheftCoins);assert.equal(preview.receipt.trimmed[0].reason,'theft_limit');
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.player.coins,f.document.state.player.coins+20);assert.equal(next.state.npcs[f.npc].coins,80);assert.deepEqual(auditLedger(next.ledger),[]);assert.ok(result.result.receipt.applied.every(e=>e.actedAs.kind==='theft'&&e.tags.includes('unconsented')));
 for(const i of [0,1]){assert.equal(next.state.records[`world_event:${input.eventId}:${i}`].verb,'steal');assert.equal(next.state.records[`world_event:${input.eventId}:${i}`].target,f.npc);}
 const checkDraft=f.engine.primitiveDraft(f.document);f.engine.check(checkDraft,{attribute:'敏捷',difficulty:10},`${input.eventId}:action-check`);
 const proofDocument=applyPatches(f.document,checkDraft.patches),nativeFrame=createRuntimePrimitiveFrame(f.engine,proofDocument,{eventId:input.eventId,source:{kind:'catalog',id:input.args.action}});
 const direct=commitPrimitives(proofDocument,[{op:'transfer',from,to:a,qty:15},{op:'transfer',from,to:a,qty:15}],nativeFrame);
 assert.equal(direct.receipt.applied.reduce((n,e)=>n+e.qty,0),20,'native frame also owns the cumulative cap');
 assert.throws(()=>commitPrimitives(proofDocument,[{op:'transfer',from:accountKey(f.npc,f.engine.world.items[0].id,'inventory'),to:accountKey('player',f.engine.world.items[0].id,'inventory'),qty:1}],nativeFrame),{code:'E-PRIMITIVE-CONNECTOR'});
 const raw=createRuntimePrimitiveFrame(f.engine,f.document,{eventId:'false-theft',source:{kind:'open',id:'player-proposal'}});
 assert.throws(()=>commitPrimitives(f.document,[{op:'transfer',from,to:a,qty:1}],raw),{code:'E-AUTHORITY'});
});

test('A3 adjudication: NPC agreement is a purpose-scoped native event, never a caller boolean',async()=>{
 const f=effectFixture();
 const base=f.engine.byId.get(f.npc);base.redLines=[];f.document.state.npcs[f.npc].relationships={player:{trust:100}};
 f.document.state.npcs[f.npc].activity='';f.document.state.npcs[f.npc].plan=null;f.document.state.npcs[f.npc].goals={};
 const input=program(f,{id:'test:agreed-support',slots:[{name:'target',kind:'entity',required:true}],consent:{from:'target',scope:'support_magic',onRefusal:'abort'},outcomes:[{op:'status',target:{slot:'target'},status:'stone_skin',duration:2,magnitude:2}]});input.args.slots={target:f.npc};
 const preview=await f.engine.previewAction(f.document,input);assert.equal(preview.receipt.decisions[0].outcome,'agree');assert.equal(f.document.state.consentEvents,undefined);
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches),grant=next.state.consentEvents.find(e=>e.from===f.npc);
 assert.ok(grant);assert.equal(grant.to,'player');assert.notDeepEqual(grant.purpose,[input.args.action]);assert.equal(next.state.effects[`${input.eventId}:0`].target,f.npc);
 assert.equal(next.state.records[`world_event:${grant.id}`].actor,f.npc);assert.equal(next.state.records[`world_event:${grant.id}`].parent,input.eventId);
 assert.equal(consent(primitiveContext(f.engine,next),f.npc,'player','support_magic',{purpose:'test:agreed-support'}).allowed,false,'one request does not authorize every later invocation');
 // Forged consent still fails with the same code, now in a zero-effects receipt.
 await assertActionRejected(f.engine.reduce(f.document,{...input,args:{...input.args,slots:{target:f.npc,consent:true}}}),undefined,'E-ACTION-SLOT');
});

test('A3 adjudication: refused healing reuses its one native opposed check inside the vital effect',async()=>{
 const f=effectFixture();f.engine.byId.get(f.npc).redLines=['healing'];f.document.state.npcs[f.npc].hp=1;f.document.state.npcs[f.npc].maxHp=10;
 const input=program(f,{id:'test:opposed-care',slots:[{name:'target',kind:'entity',required:true}],consent:{from:'target',scope:'healing',onRefusal:'contest'},outcomes:[{op:'vital',target:{slot:'target'},delta:3}]});input.args.slots={target:f.npc};
 const d=f.engine.primitiveDraft(f.document);let success=false;
 for(let i=0;i<100;i++){input.eventId=`one-contest-${i}`;if(f.engine.check(d,{attribute:'精神',opponent:{npc:f.npc,attribute:'精神'}},`${input.eventId}:action-check`).success){success=true;break;}}
 assert.equal(success,true);
 const result=await f.engine.reduce(f.document,input),next=applyPatches(f.document,result.patches),receipt=result.result.receipt;
 assert.equal(receipt.check.success,true);assert.equal(receipt.applied[0].op,'vital');assert.deepEqual(receipt.applied[0].result.check,receipt.check);assert.ok(next.state.npcs[f.npc].hp>1);
 assert.equal(next.state.checks[`${input.eventId}:0:consent`],undefined);assert.equal(Object.keys(next.state.checks).filter(id=>id.startsWith(input.eventId)).length,1);
});

test('A3 effects: scheduled successful action executes exactly once after JSON reload',()=>{
 const f=effectFixture(),action={id:'test:due-gift',slots:[],outcomes:[{op:'transfer',from:a,to:accountKey(f.npc,'coin_river','purse'),qty:1}]};program(f,action);
 const scheduled=commitPrimitives(f.document,[{op:'schedule',at:f.document.state.minute+1,action:action.id}],f.frame('once-schedule')),next=JSON.parse(JSON.stringify(applyPatches(f.document,scheduled.patches))),id=scheduled.receipt.applied[0].result;
 const d=f.engine.primitiveDraft(next);f.engine.advance(d,2,'deliver-schedule');const final=applyPatches(next,d.patches);
 assert.equal(final.state.records[`primitive_schedule_result:${id}`].status,'committed');assert.equal(final.state.player.coins,next.state.player.coins-1);
 const later=f.engine.primitiveDraft(JSON.parse(JSON.stringify(final)));f.engine.advance(later,1,'deliver-again');const again=applyPatches(final,later.patches);
 assert.equal(again.state.player.coins,final.state.player.coins);assert.equal(again.state.records[id].status,'completed');assert.deepEqual(auditLedger(again.ledger),[]);
});

test('A3 effects: a scheduled action with elapsed cost commits once without losing its clock or ledger during reentry',()=>{
 const f=effectFixture(),action={id:'test:long_scheduled',slots:[],cost:{owner:'primitives',time:3},outcomes:[{op:'transfer',from:a,to:accountKey(f.npc,'coin_river','purse'),qty:1}]};
 program(f,action);
 const effect={op:'schedule',at:f.document.state.minute+1,action:action.id},scheduled=commitPrimitives(f.document,[effect],f.frame('schedule-long-gift')),next=JSON.parse(JSON.stringify(applyPatches(f.document,scheduled.patches))),id=scheduled.receipt.applied[0].result;
 const d=f.engine.primitiveDraft(next);f.engine.advance(d,2,'run-long-gift');const final=applyPatches(next,d.patches),receipt=final.state.records[`primitive_schedule_result:${id}`];
 assert.equal(receipt.status,'committed');assert.equal(receipt.receipt.cost.time,3);
 assert.ok(final.state.minute>=next.state.minute+4,'the nested action must retain the three minutes after its due time');
 assert.equal(final.state.player.coins,next.state.player.coins-1);assert.equal(final.state.npcs[f.npc].coins,next.state.npcs[f.npc].coins+1);assert.deepEqual(auditLedger(final.ledger),[]);
 const again=f.engine.primitiveDraft(final);f.engine.advance(again,1,'after-long-gift');
 assert.equal(again.get('state','player','coins'),final.state.player.coins);assert.ok(again.get('state','minute')>final.state.minute);
});

test('A3 body: timestamped closed-form needs are equivalent across split durations',async()=>{
 const f=effectFixture(),action={id:'test:body-travel',slots:[{name:'minutes',kind:'minutes',min:1,max:60}],durationSlot:{slot:'minutes',min:1,max:60},activity:'travel',cost:{owner:'primitives'},outcomes:[{op:'emit',verb:'tell',visibility:'private',payload:{text:'working'}}]},input=program(f,action);
 const whole=applyPatches(f.document,(await f.engine.reduce(f.document,{...input,eventId:'whole-body',args:{action:action.id,slots:{minutes:3}}})).patches);
 let split=structuredClone(f.document);for(let i=0;i<3;i++)split=applyPatches(split,(await f.engine.reduce(split,{...input,eventId:`part-body-${i}`,args:{action:action.id,slots:{minutes:1}}})).patches);
 for(const need of ['stamina','satiety','hydration','fatigue'])assert.deepEqual(split.state.player.body[need],whole.state.player.body[need]);
 assert.equal(readBodyNeed(f.engine,whole,'player','satiety'),99.825);
 const later=structuredClone(whole);later.state.minute+=60;
 assert.equal(readBodyNeed(f.engine,later,'player','satiety'),98.825);assert.deepEqual(whole.state.player.body.satiety,{value:99.825,asOf:whole.state.minute,activity:'rest'});
});

test('A3 adjudication: default five degrees apply half damage, critical, fumble time and actual exposure',async()=>{
 const f=effectFixture(),input=program(f,{id:'test:degrees',check:{attribute:'精神',difficulty:10},cost:{owner:'primitives',time:2},outcomes:[{op:'vital',target:'player',delta:-4,type:'physical'}]}),ids=new Map(),d=f.engine.primitiveDraft(f.document);
 for(let i=0;i<500&&ids.size<5;i++){
  const id=`degree-case-${i}`,check=f.engine.check(d,{attribute:'精神',difficulty:10},`${id}:action-check`);if(!ids.has(check.degree))ids.set(check.degree,id);
 }
 assert.equal(ids.size,5);
 for(const [degree,eventId]of ids){
  const result=await f.engine.reduce(f.document,{...input,eventId}),next=applyPatches(f.document,result.patches),receipt=result.result.receipt;
  const damage={'大失败':1,'失败':0,'勉强成功':2,'成功':4,'大成功':6}[degree];
  assert.equal(next.state.player.hp,f.document.state.player.hp-damage,degree);assert.equal(next.state.minute,f.document.state.minute+(degree==='大失败'?4:2),degree);
  if(['大失败','失败'].includes(degree)){
   assert.ok(receipt.narrate.mustNot.some(e=>e.op==='vital'));assert.ok(receipt.consequences.some(e=>e.kind==='exposure'));
   const exposed=Object.values(next.state.records).find(e=>e.category==='world_event'&&e.payload?.kind==='action_exposed');assert.ok(exposed);assert.equal(exposed.visibility,'witnessed');assert.ok(exposed.witnesses.includes(f.npc));
  }
 }
});
test('A3 runtime: possessed property transfer retains lifecycle, original edge and legality tags',()=>{
 const {engine,document,npc}=runtimeFixture(),id=`h${++document.holdings.seq}`;
 document.holdings.entities.wreck_a={id:'wreck_a',kind:'wreck',facts:{}};
 document.holdings.locations.wreck_a={mode:'carried',at:'player'};
 document.holdings.rows[id]={id,kind:'owns',holder:npc,subject:'wreck_a',terms:{share:1}};
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'sell-possessed',source:{kind:'catalog',id:'core:sell'}});
 const result=commitPrimitives(document,[{op:'holding.transfer',holding:id,newHolder:'player'}],frame),next=applyPatches(document,result.patches),applied=result.receipt.applied[0];
 assert.equal(document.holdings.rows[id].until,undefined);assert.equal(next.holdings.rows[id].until,document.state.minute);
 assert.equal(next.holdings.rows[applied.result].holder,'player');assert.equal(next.holdings.rows[applied.result].terms.share,1);
 assert.ok(applied.tags.includes('unauthorized_disposition'));assert.ok(next.holdings.rows[applied.result].concluded.tags.includes('unauthorized_disposition'));
 assert.ok(next.state.records['world_event:sell-possessed:0'].tags.includes('unauthorized_disposition'));
 assert.equal(next.state.records['world_event:sell-possessed:0'].actor,'player');
 const ownerFrame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'forged-holding-authority',source:{kind:'catalog',id:'core:lease'}});
 assert.throws(()=>commitPrimitives(document,[{op:'holding.open',holdingKind:'leases',holder:'player',subject:'wreck_a',terms:{authority:[{op:'transfer',target:'player'}]}}],ownerFrame),{code:'E-HOLDING-TERMS'});
 delete document.holdings.locations.wreck_a;
 assert.throws(()=>commitPrimitives(document,[{op:'holding.transfer',holding:id,newHolder:'player'}],frame),{code:'E-AUTHORITY'});
});

test('A3 runtime: property grant and close use lifecycle; share issuance requires affected holders consent',()=>{
 const {engine,document,npc}=runtimeFixture(),id=`h${++document.holdings.seq}`;
 document.holdings.entities.wreck_lease={id:'wreck_lease',kind:'wreck',facts:{}};
 document.holdings.rows[id]={id,kind:'owns',holder:npc,subject:'wreck_lease',terms:{share:1}};
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'grant-lease',source:{kind:'catalog',id:'core:lease'}});
 const grant=commitPrimitives(document,[{op:'holding.open',holdingKind:'leases',holder:'player',subject:'wreck_lease'}],frame),leased=applyPatches(document,grant.patches),lease=grant.receipt.applied[0].result;
 assert.equal(leased.holdings.rows[lease].holder,'player');assert.ok(leased.state.records['world_event:grant-lease:0']);
 const closed=applyPatches(leased,commitPrimitives(leased,[{op:'holding.close',holding:lease}],createRuntimePrimitiveFrame(engine,leased,{eventId:'close-lease',source:{kind:'catalog',id:'core:lease.close'}})).patches);
 assert.equal(closed.holdings.rows[lease].until,document.state.minute);assert.ok(closed.state.records['world_event:close-lease:0']);

 const subject='loc_bs_yupo',appointment=`governance_office:${subject}:office_village_head:player`;
 engine.rules.governance.authority.offices.office_village_head.powers.push('holding.rescale');
 document.state.records[appointment]={id:appointment,category:'governance_office',office:'office_village_head',holder:'player',settlement:subject,status:'在任',since:0,until:document.state.minute+1440};
 for(const [holder,share] of [['player',0.6],[npc,0.4]]){const id=`h${++document.holdings.seq}`;document.holdings.rows[id]={id,kind:'share',holder,subject,terms:{share}};}
 const effect={op:'holding.rescale',holdingKind:'share',subject,shares:{player:0.7,[npc]:0.3}},rescale=createRuntimePrimitiveFrame(engine,document,{eventId:'rescale-agreed',source:{kind:'catalog',id:'core:issue'}}),before=structuredClone(document);
 assert.throws(()=>commitPrimitives(document,[effect],rescale),{code:'E-AUTHORITY'});assert.deepEqual(document,before);
 document.state.consentEvents=[{id:'share-agreement',type:'consent_given',from:npc,to:'player',scope:'property',purpose:[`holding.rescale:${subject}`],at:document.state.minute,until:document.state.minute+10}];
 const after=applyPatches(document,commitPrimitives(document,[effect],rescale).patches),shares=Object.values(after.holdings.rows).filter(h=>h.kind==='share'&&h.subject===subject&&h.until===undefined);
 assert.equal(shares.reduce((sum,h)=>sum+h.terms.share,0),1);assert.equal(shares.find(h=>h.holder===npc).terms.share,0.3);
});
test('A3 runtime: real purse projection and obligation opening share one atomic frame',()=>{
 const {engine,document,npc}=runtimeFixture(),before=structuredClone(document),from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse');
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'runtime-contract',source:{kind:'catalog',id:'core:contract'}});
 const effects=[{op:'transfer',from,to,qty:3},{op:'obligation.create',id:'obligation_a3',obligationKind:'loan',debtor:'player',creditor:npc,amount:5}];
 const preview=planPrimitives(document,effects,frame);assert.equal(preview.receipt.status,'preview');assert.deepEqual(document,before);
 const result=commitPrimitives(document,effects,frame),next=applyPatches(document,result.patches);
 assert.equal(next.state.player.coins,before.state.player.coins-3);
 assert.equal(next.state.npcs[npc].coins,before.state.npcs[npc].coins+3);
 assert.equal(next.ledger.accounts[from],before.ledger.accounts[from]-3);
 assert.equal(next.state.obligations.obligation_a3.amount,5);
 assert.ok(Object.values(next.state.records).some(row=>row.category==='world_event'&&row.verb==='obligation_opened'));
 assert.deepEqual(document,before);
 assert.throws(()=>commitPrimitives(document,[effects[0],{...effects[1],debtor:npc}],frame),{code:'E-AUTHORITY'});
 assert.deepEqual(document,before);
});

function normativeFixture(){
 const f=effectFixture(),org=f.engine.world.factions[0].id,office=`office_org:${org}:executor`;
 f.document.state.records[`organization:${org}`]={id:org,category:'organization',charter:{offices:[{id:'executor',powers:['execute']}],authority:[{offices:['executor'],scope:[{op:'obligation.create',target:org}]}]}};
 f.document.holdings.entities[office]={id:office,kind:'office',facts:{org,role:'executor'}};
 f.document.holdings.rows.a3_executor={id:'a3_executor',kind:'holds_office',holder:'player',subject:office};
 return {...f,org,office};
}

test('A3 authority: current law delegation, issuer recognition and charter powers expose their sources',()=>{
 const f=normativeFixture(),{engine,document,npc,org}=f;
 const c=primitiveContext(engine,document),grant=authority(c,'player','obligation.create',org);
 assert.equal(grant.actedAs.kind,'charter');assert.ok(grant.actedAs.version);
 assert.deepEqual(authority(c,'player','transfer',org).tags,['ultra_vires']);
 assert.equal(authority(c,'player','transfer',npc).allowed,false);
 const code=legalCodeAt(engine,document.state.location,document.state);assert.ok(code);
 const definition=engine.rules.law.codes.find(row=>row.id===code.id);assert.ok(definition);
 definition.delegation=[{id:'a3_native_grant',actor:'player',scope:[{op:'transfer',target:npc}],until:document.state.minute+5}];
 const permission=authority(c,'player','transfer',npc);
 assert.equal(permission.actedAs.kind,'delegation');assert.ok(permission.actedAs.version);
 definition.delegation[0].revoked=true;assert.equal(authority(c,'player','transfer',npc).allowed,false);
 definition.recognition={issuers:{mint:['player'],notes:[f.office]}};
 assert.equal(authority(c,'player','mint','coin_river').actedAs.kind,'recognition');
 assert.equal(authority(c,'player','issue','coin_river').actedAs.kind,'recognition');
 document.holdings.rows.a3_executor.until=document.state.minute;
 assert.equal(authority(c,'player','issue','coin_river').allowed,false);
 assert.equal(authority(c,'player','obligation.create',org).allowed,false);
});

test('A3 authority: approved execution binds action and slots, consumes resolution atomically and preserves replay',async()=>{
 const f=normativeFixture(),{engine,org,office}=f;
 const created=commitPrimitives(f.document,[{op:'create',kind:'item',template:'core:item',facts:{name:'A3决议纸折'}}],f.frame('resolution-item'));
 f.document=applyPatches(f.document,created.patches);
 const item=created.receipt.applied[0].result.entity;
 Object.values(f.document.holdings.rows).find(h=>h.kind==='owns'&&h.subject===item&&h.until===undefined).holder=org;
 const input=program(f,{id:'test:execute_resolution',outcomes:[{op:'destroy',entity:item}]}),motion='motion_a3_execution';
 f.document.holdings.entities[motion]={id:motion,kind:'motion',facts:{body:org,phase:'approved',resolution:{kind:'execute',action:input.args.action,args:{}}}};
 const before=structuredClone(f.document),preview=await engine.previewAction(f.document,input);
 assert.equal(preview.receipt.applied[0].actedAs.kind,'resolution');assert.deepEqual(f.document,before);
 const frame=createRuntimePrimitiveFrame(engine,f.document,{eventId:input.eventId,source:{kind:'catalog',id:input.args.action},identity:{action:input.args.action,slots:{}}});
 assert.throws(()=>commitPrimitives(f.document,[{op:'destroy',entity:item},{op:'destroy',entity:'missing'}],frame));
 assert.equal(f.document.holdings.entities[motion].facts.phase,'approved');
 const committed=commitPrimitives(f.document,[{op:'destroy',entity:item}],frame),next=applyPatches(f.document,committed.patches);
 assert.equal(committed.receipt.applied[0].actedAs.id,motion);assert.equal(next.holdings.entities[motion].facts.phase,'executed');
 assert.equal(next.holdings.entities[motion].facts.executionEvent,input.eventId);assert.equal(isGone(engine,next,item),true);
 assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),[{op:'destroy',entity:item}],frame).patches,[]);
 const context=primitiveContext(engine,before,{source:{kind:'catalog',id:input.args.action},identity:{action:input.args.action,slots:{wrong:1}}});
 assert.ok(!authority(context,'player','destroy',item).sources.some(s=>s.kind==='resolution'));
 assert.ok(office);
});

test('A3 transition: dissolution consumes a real approved resolution and uses the existing liquidation protocol atomically',async()=>{
 const f=normativeFixture(),{engine,org}=f,effect={op:'transition',entity:org,kind:'gone',cause:'dissolution'},input=program(f,{id:'test:dissolve_org',outcomes:[effect]}),motion='motion_a3_dissolution';
 assert.throws(()=>commitPrimitives(f.document,[effect],f.frame('unapproved-dissolution')),{code:'E-AUTHORITY'});
 f.document.holdings.entities[motion]={id:motion,kind:'motion',facts:{body:org,phase:'approved',resolution:{kind:'execute',action:input.args.action,args:{}}}};
 const before=structuredClone(f.document),preview=await engine.previewAction(f.document,input);
 assert.equal(preview.receipt.applied[0].actedAs.id,motion);assert.deepEqual(f.document,before);
 const frame=createRuntimePrimitiveFrame(engine,f.document,{eventId:input.eventId,source:{kind:'catalog',id:input.args.action},identity:{action:input.args.action,slots:{}}});
 assert.throws(()=>commitPrimitives(f.document,[effect,{op:'destroy',entity:'missing'}],frame));
 assert.equal(f.document.holdings.entities[motion].facts.phase,'approved');assert.equal(isGone(engine,f.document,org),false);
 const result=commitPrimitives(f.document,[effect],frame),next=applyPatches(f.document,result.patches),transition=result.receipt.applied[0].result;
 assert.equal(transition.basis,'dissolution');assert.ok(transition.successor);assert.equal(isGone(engine,next,org),true);
 assert.equal(next.holdings.entities[transition.successor].kind,'liquidation');assert.equal(next.holdings.entities[motion].facts.phase,'executed');
 assert.deepEqual(auditLedger(next.ledger),[]);assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),[effect],frame).patches,[]);
 assert.deepEqual(f.document,before);
});

test('A3 transition: judicial declaration and revocation require the real case event and current court authority',()=>{
 const f=effectFixture(),{engine}=f,person='npc_hw_linsui',code=legalCodeAt(engine,f.document.state.location,f.document.state),judge=code.judges[0];
 assert.notEqual(person,judge);f.document.state.npcs[judge].location=code.court;
 const d=engine.primitiveDraft(f.document),row={id:'legal_case:a3_declare',category:'legal_case',law:code.id,subject:person,offender:person,civilMatter:'declared',evidence:[],procedure:{successors:['player']}};
 d.set(['state','records',row.id],row);adjudicateLegalCase(d,engine,row,{...code,evidenceRequired:0},judge,'a3-declare-judgment');f.document=applyPatches(f.document,d.patches);
 assert.equal(isGone(engine,f.document,person),true);
 const effect={op:'transition',entity:person,kind:'gone',cause:'declared',id:row.id},frame=createRuntimePrimitiveFrame(engine,f.document,{actor:judge,eventId:'a3-apply-declaration',source:{kind:'catalog',id:'test:judgment'}}),before=structuredClone(f.document);
 const preview=planPrimitives(f.document,[effect],frame);assert.equal(preview.receipt.applied[0].actedAs.kind,'judgment');assert.deepEqual(f.document,before);
 const result=commitPrimitives(f.document,[effect],frame),next=applyPatches(f.document,result.patches);
 assert.equal(result.receipt.applied[0].result.replayed,true,'the existing judgment hook already applied its lifecycle effect');
 assert.deepEqual(next.holdings.protocol.entities,before.holdings.protocol.entities);assert.deepEqual(next.ledger,before.ledger);
 assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),[effect],frame).patches,[]);
 for(const mutate of [doc=>{delete doc.state.records['world_event:a3-declare-judgment:judgment'];},doc=>{doc.state.records[row.id].judgment.effect='insolvency';},doc=>{doc.state.npcs[judge].location='loc_hw';}]){
  const changed=structuredClone(before);mutate(changed);assert.throws(()=>commitPrimitives(changed,[effect],frame),{code:'E-AUTHORITY'});
 }
 const revoke={...row,id:'legal_case:a3_revoke',civilMatter:'declaration_revoked'},r=engine.primitiveDraft(next);
 r.set(['state','records',revoke.id],revoke);adjudicateLegalCase(r,engine,revoke,{...code,evidenceRequired:0},judge,'a3-revoke-judgment');
 const restored=applyPatches(next,r.patches),restore={...effect,id:revoke.id,kind:'restored',cause:'declaration_revoked'},restoreFrame=createRuntimePrimitiveFrame(engine,restored,{actor:judge,eventId:'a3-apply-revocation',source:{kind:'catalog',id:'test:judgment'}});
 assert.equal(isGone(engine,restored,person),false);assert.equal(commitPrimitives(restored,[restore],restoreFrame).receipt.applied[0].actedAs.kind,'judgment');
 // A fresh event requests reapplication; the original event must retain its
 // immutable duplicate receipt for replay (06 §6.3 / I31).
 const reapplyFrame=createRuntimePrimitiveFrame(engine,restored,{actor:judge,eventId:'a3-reapply-old-declaration',source:{kind:'catalog',id:'test:judgment'}});
 assert.throws(()=>commitPrimitives(restored,[effect],reapplyFrame),{code:'E-TRANSITION-PROOF'},'a revoked declaration cannot be reapplied to claim the living person is gone');
 assert.throws(()=>commitPrimitives(restored,[{...restore,kind:'gone'}],restoreFrame),{code:'E-TRANSITION-KIND'});
});

test('A3 transition: a personal bankruptcy judgment preserves the living body and cannot transfer the assets twice',()=>{
 const f=effectFixture(),{engine}=f,person='npc_hw_linsui',code=legalCodeAt(engine,f.document.state.location,f.document.state),judge=code.judges[0];
 f.document.state.npcs[judge].location=code.court;
 const body=structuredClone(f.document.state.npcs[person]),d=engine.primitiveDraft(f.document),row={id:'legal_case:a3_bankruptcy',category:'legal_case',law:code.id,subject:person,offender:person,civilMatter:'insolvency',evidence:[],procedure:{exemptAmount:2,discharge:false,durations:{notice:10,acceptance:10,claims:10}}};
 d.set(['state','records',row.id],row);adjudicateLegalCase(d,engine,row,{...code,evidenceRequired:0},judge,'a3-bankruptcy-judgment');f.document=applyPatches(f.document,d.patches);
 const effect={op:'transition',entity:person,kind:'gone',cause:'insolvency',id:row.id},frame=createRuntimePrimitiveFrame(engine,f.document,{actor:judge,eventId:'a3-apply-bankruptcy',source:{kind:'catalog',id:'test:judgment'}}),before=structuredClone(f.document);
 const result=commitPrimitives(f.document,[effect],frame),next=applyPatches(f.document,result.patches);
 assert.equal(result.receipt.applied[0].actedAs.kind,'judgment');assert.equal(isGone(engine,next,person),false);
 assert.equal(next.state.npcs[person].hp,body.hp);assert.equal(next.state.npcs[person].status,body.status);
 assert.ok(next.ledger.accounts[accountKey(person,'coin_river','purse')]<=2);assert.deepEqual(next.ledger,before.ledger);assert.deepEqual(auditLedger(next.ledger),[]);
 assert.deepEqual(commitPrimitives(JSON.parse(JSON.stringify(next)),[effect],frame).patches,[]);
});

test('A3 signing: an agent cannot manufacture its own mandate; the principal really authorizes the commission',()=>{
 const f=runtimeFixture(),{engine,npc}=f,purpose='test:mandate.accept';
 const effect={op:'obligation.create',id:'a3_real_mandate',obligationKind:'mandate',debtor:'player',creditor:npc,terms:{scope:[{op:'transfer',target:npc}]}},frame=doc=>createRuntimePrimitiveFrame(engine,doc,{eventId:'accept-real-mandate',source:{kind:'catalog',id:purpose}}),before=structuredClone(f.document);
 assert.throws(()=>commitPrimitives(f.document,[effect],frame(f.document)),{code:'E-CONSENT'});assert.deepEqual(f.document,before);
 const donor=createRuntimePrimitiveFrame(engine,f.document,{actor:npc,eventId:'principal-grant',source:{kind:'catalog',id:'test:consent'}});
 f.document=applyPatches(f.document,commitPrimitives(f.document,[{op:'emit',verb:'consent_given',target:'player',visibility:'private',payload:{scope:'mandate',purpose:[purpose],until:f.document.state.minute+10}}],donor).patches);
 const result=commitPrimitives(f.document,[effect,{op:'transfer',from:accountKey(npc,'coin_river','purse'),to:a,qty:1}],frame(f.document)),next=applyPatches(f.document,result.patches);
 assert.equal(next.state.obligations.a3_real_mandate.terms.principalConsent.source,'principal-grant:0');
 assert.equal(result.receipt.applied[1].actedAs.kind,'mandate');assert.equal(next.state.npcs[npc].coins,f.document.state.npcs[npc].coins-1);assert.deepEqual(auditLedger(next.ledger),[]);
});

test('A3 signing: current mandate reaches the S3 protocol with its source and revocation is rechecked',()=>{
 const {engine,document,npc}=runtimeFixture(),effects=[{op:'obligation.create',id:'a3_proxy_loan',obligationKind:'loan',debtor:npc,creditor:'player',amount:5}];
 document.state.obligations.a3_signing={id:'a3_signing',kind:'mandate',debtor:'player',creditor:npc,status:'active',createdAt:document.state.minute,terms:{scope:[{op:'obligation.create',target:npc}]}};
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'proxy-sign',source:{kind:'catalog',id:'test:loan'}}),before=structuredClone(document);
 planPrimitives(document,effects,frame);assert.deepEqual(document,before);
 const result=commitPrimitives(document,effects,frame),next=applyPatches(document,result.patches),loan=next.state.obligations.a3_proxy_loan;
 assert.equal(loan.debtor,npc);assert.equal(loan.terms.actor,'player');assert.equal(loan.terms.actedAs.kind,'mandate');assert.equal(loan.terms.actedAs.id,'a3_signing');
 assert.equal(result.receipt.applied[0].actedAs.id,'a3_signing');
 document.state.obligations.a3_signing.revoked=true;
 assert.throws(()=>commitPrimitives(document,effects,frame),{code:'E-AUTHORITY'});
 assert.equal(document.state.obligations.a3_proxy_loan,undefined);
});

test('A3 signing: subdelegation preserves parent scope, expiry, actual consent and live revocation',()=>{
 const f=effectFixture(),{engine,npc}=f,agent='npc_hw_gucen',now=f.document.state.minute,purpose='test:subdelegate';
 assert.notEqual(npc,agent);assert.ok(f.document.state.npcs[agent]);
 f.document.state.npcs[agent].location=f.document.state.location;
 const scope=[{op:'transfer',target:npc}],parent={id:'a3_parent',kind:'mandate',debtor:'player',creditor:npc,status:'active',createdAt:now,terms:{scope,subdelegate:true,until:now+100}};
 f.document.state.obligations.a3_parent=parent;
 const grantFrame=createRuntimePrimitiveFrame(engine,f.document,{eventId:'delegate-consent',source:{kind:'catalog',id:'test:consent'}});
 const grant=commitPrimitives(f.document,[{op:'emit',verb:'consent_given',target:agent,visibility:'private',payload:{from:npc,scope:'mandate',purpose:[purpose],until:now+100}}],grantFrame);
 f.document=applyPatches(f.document,grant.patches);
 assert.equal(f.document.state.consentEvents.at(-1).by,'player');
 const effect={op:'obligation.create',id:'a3_child',obligationKind:'mandate',debtor:agent,creditor:npc,terms:{scope,parentMandate:parent.id,until:now+50}},frame=createRuntimePrimitiveFrame(engine,f.document,{actor:agent,eventId:'accept-subdelegate',source:{kind:'catalog',id:purpose}}),before=structuredClone(f.document);
 planPrimitives(f.document,[effect],frame);assert.deepEqual(f.document,before);
 for(const terms of [{...effect.terms,scope:['transfer']},{...effect.terms,scope:[{op:'transfer',target:'player'}]},{...effect.terms,until:now+101},{scope}]){
  assert.throws(()=>commitPrimitives(f.document,[{...effect,terms}],frame),{code:'E-MANDATE-SCOPE'});
 }
 const accepted=commitPrimitives(f.document,[effect],frame),next=applyPatches(f.document,accepted.patches);
 assert.equal(next.state.obligations.a3_child.terms.parentMandate,parent.id);
 assert.equal(next.state.obligations.a3_child.terms.principalConsent.source,'delegate-consent:0');
 assert.equal(authority(primitiveContext(engine,next),agent,'transfer',accountKey(npc,'coin_river','purse')).actedAs.id,'a3_child');
 const saved=JSON.parse(JSON.stringify(next));saved.state.obligations.a3_parent.revoked=true;
 assert.equal(authority(primitiveContext(engine,saved),agent,'transfer',accountKey(npc,'coin_river','purse')).allowed,false);
 for(const mutate of [p=>{p.revoked=true;},p=>{p.terms.subdelegate=false;},p=>{p.terms.scope=[{op:'transfer',target:'player'}];},p=>{p.terms.until=now;}]){
  const changed=structuredClone(before);mutate(changed.state.obligations.a3_parent);
  assert.throws(()=>commitPrimitives(changed,[effect],frame),{code:'E-MANDATE-SCOPE'});
 }
 assert.deepEqual(f.document,before);
});

test('A3 signing: property guardianship can bind a loan but cannot bind personal service or move its ward',()=>{
 const f=runtimeFixture(),{engine,document,npc}=f;
 document.holdings.rows.a3_property_guardian={id:'a3_property_guardian',kind:'guardian_of',holder:'player',subject:npc,terms:{scope:'property_only'}};
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'guardian-sign',source:{kind:'catalog',id:'test:loan'}});
 const effect={op:'obligation.create',id:'a3_guardian_loan',obligationKind:'loan',debtor:npc,creditor:'player',amount:1};
 const result=commitPrimitives(document,[effect],frame),next=applyPatches(document,result.patches);
 assert.equal(next.state.obligations.a3_guardian_loan.terms.actedAs.kind,'guardian_of');
 assert.throws(()=>commitPrimitives(document,[{...effect,obligationKind:'service'}],frame),{code:'E-AUTHORITY'});
 assert.equal(authority(primitiveContext(engine,document),'player','move',npc).allowed,false);
 document.holdings.rows.a3_property_guardian.until=document.state.minute;
 assert.throws(()=>commitPrimitives(document,[effect],frame),{code:'E-AUTHORITY'});
});

test('A3 signing: legacy payment authorization reaches settlement and does not expand contract permission',()=>{
 const f=runtimeFixture(),{engine,npc}=f,create=createRuntimePrimitiveFrame(engine,f.document,{actor:npc,eventId:'proxy-pay-loan',source:{kind:'catalog',id:'test:loan'}});
 f.document=applyPatches(f.document,commitPrimitives(f.document,[{op:'obligation.create',id:'a3_proxy_payment',obligationKind:'loan',debtor:npc,creditor:'player',amount:1}],create).patches);
 f.document.state.records.a3_payment_permission={category:'authorization',grantor:npc,grantee:'player',action:'payment',createdAt:f.document.state.minute,expires:f.document.state.minute+10};
 const effects=[{op:'obligation.settle',id:'a3_proxy_payment',amount:1}],frame=createRuntimePrimitiveFrame(engine,f.document,{eventId:'proxy-pay',source:{kind:'catalog',id:'test:payment'}});
 planPrimitives(f.document,effects,frame);
 const result=commitPrimitives(f.document,effects,frame),next=applyPatches(f.document,result.patches);
 assert.equal(result.receipt.applied[0].actedAs.kind,'authorization');assert.equal(next.state.npcs[npc].coins,f.document.state.npcs[npc].coins-1);
 assert.equal(next.state.player.coins,f.document.state.player.coins+1);assert.deepEqual(auditLedger(next.ledger),[]);
 f.document.state.records.a3_payment_permission.action='contract';
 assert.throws(()=>commitPrimitives(f.document,effects,frame),{code:'E-AUTHORITY'});
});

test('A3 signing: limited capacity can sign and remains tagged; no-source proxy cannot sign',()=>{
 const {engine,document,npc}=runtimeFixture();document.state.player.age=10;
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'limited-sign',source:{kind:'catalog',id:'test:loan'}});
 const effect={op:'obligation.create',id:'a3_limited_loan',obligationKind:'loan',debtor:'player',creditor:npc,amount:1};
 const result=commitPrimitives(document,[effect],frame),next=applyPatches(document,result.patches);
 assert.equal(next.state.obligations.a3_limited_loan.amount,1);assert.ok(result.receipt.applied[0].tags.includes('capacity:limited'));
 assert.throws(()=>commitPrimitives(document,[{...effect,debtor:npc,creditor:'player'}],frame),{code:'E-AUTHORITY'});
});

test('A3 runtime: zero-balance recipient is a real account, unknown recipients and remote mandates reject',()=>{
 const {engine,document,npc}=runtimeFixture(),from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse');
 document.state.npcs[npc].coins=0;delete document.ledger.accounts[to];
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'zero-recipient',source:{kind:'catalog',id:'core:give'}});
 const next=applyPatches(document,commitPrimitives(document,[{op:'transfer',from,to,qty:1}],frame).patches);
 assert.equal(next.ledger.accounts[to],1);assert.equal(next.state.npcs[npc].coins,1);assert.equal(document.ledger.accounts[to],undefined);
 assert.throws(()=>commitPrimitives(document,[{op:'transfer',from,to:accountKey('npc_missing','coin_river','purse'),qty:1}],frame),{code:'E-TRANSFER-ACCOUNT'});
 document.ledger.accounts[to]=10;document.state.npcs[npc].coins=10;
 const other=Object.keys(document.state.npcs).find(id=>id!==npc);document.state.npcs[other].location=document.state.npcs[npc].location;
 document.state.location='loc_elsewhere';
 document.state.obligations.a3_mandate={id:'a3_mandate',kind:'mandate',debtor:'player',creditor:npc,status:'active',terms:{scope:[{op:'transfer',target:npc}]}};
 assert.throws(()=>commitPrimitives(document,[{op:'transfer',from:to,to:accountKey(other,'coin_river','purse'),qty:1}],frame),{code:'E-TRANSFER-REACH'});
});

test('A3 consent: native donor emits actual grant/revoke facts; another actor cannot impersonate consent',()=>{
 const {engine,document,npc}=runtimeFixture(),now=document.state.minute,effect={op:'emit',verb:'consent_given',target:'player',visibility:'private',payload:{scope:'mind',purpose:['diagnose'],until:now+30}};
 const grantFrame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'npc-agrees',source:{kind:'catalog',id:'core:consent.give'}});
 const next=applyPatches(document,commitPrimitives(document,[effect],grantFrame).patches);
 assert.equal(next.state.consentEvents[0].from,npc);assert.equal(next.state.consentEvents[0].id,'npc-agrees:0');
 assert.equal(consent(primitiveContext(engine,next),npc,'player','mind',{purpose:'diagnose'}).kind,'given');
 assert.equal(consent(primitiveContext(engine,next),npc,'player','mind',{purpose:'interrogate'}).allowed,false);
 const forged=createRuntimePrimitiveFrame(engine,document,{eventId:'false-agreement',source:{kind:'catalog',id:'core:consent.give'}});
 assert.throws(()=>commitPrimitives(document,[{...effect,payload:{...effect.payload,from:npc}}],forged),{code:'E-CONSENT'});assert.equal(document.state.consentEvents,undefined);
 const revokeFrame=createRuntimePrimitiveFrame(engine,next,{actor:npc,eventId:'npc-revokes',source:{kind:'catalog',id:'core:consent.revoke'}});
 const revoked=applyPatches(next,commitPrimitives(next,[{op:'emit',verb:'consent_revoked',target:'player',visibility:'private',payload:{consent:'npc-agrees:0'}}],revokeFrame).patches);
 assert.equal(revoked.state.consentEvents[1].type,'consent_revoked');assert.equal(consent(primitiveContext(engine,revoked),npc,'player','mind',{purpose:'diagnose'}).allowed,false);
});

test('A3 consent: existing spell authorization keeps purpose/location/expiry limits and native revocation',()=>{
 const {engine,document,npc}=runtimeFixture(),now=document.state.minute,spell=engine.world.spells[0].id;
 document.state.records.a3_permission={category:'authorization',action:'mental_magic',subject:npc,grantor:npc,grantee:'player',createdAt:now,expires:now+30,scope:{location:document.state.location,spell},content:'specific purpose'};
 const context=primitiveContext(engine,document);
 assert.equal(consent(context,npc,'player','mind',{purpose:spell}).source,'a3_permission');
 assert.equal(consent(context,npc,'player','mind',{purpose:'another spell'}).allowed,false);
 assert.equal(consent(context,npc,'player','mind',{purpose:spell,until:now+30}).allowed,false);
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'revoke-legacy-consent',source:{kind:'catalog',id:'core:consent.revoke'}});
 const after=applyPatches(document,commitPrimitives(document,[{op:'emit',verb:'consent_revoked',target:'player',visibility:'private',payload:{consent:'a3_permission'}}],frame).patches);
 assert.equal(after.state.records.a3_permission.revoked,true);assert.equal(document.state.records.a3_permission.revoked,undefined);assert.equal(consent(primitiveContext(engine,after),npc,'player','mind',{purpose:spell}).allowed,false);
});

test('A3 capacity: an unconscious actor cannot roll or pay a failed action with empty effects',async()=>{
 const f=effectFixture();f.document.state.player.status='昏迷';
 const input=program(f,{id:'test:incapacitated',check:{attribute:'精神',difficulty:10},outcomes:{success:[{op:'emit',verb:'tell',visibility:'private'}],failure:[],fumble:[]},cost:{owner:'primitives',time:1}}),before=structuredClone(f.document);
 // Incapacity remains a refusal and cannot consume time or roll a check.
 await assertActionRejected(f.engine.reduce(f.document,input),undefined,'E-CAPACITY');assert.deepEqual(f.document,before);
});

test('A3 legacy: exact registered identity and appended guards survive dispatch and preview',async()=>{
 const {engine,document}=runtimeFixture(),loose={id:'test:loose_wait',label:'wait',slots:[{name:'minutes',kind:'minutes',required:true}],call:{tool:'world_time'},preconditions:[]};
 const strict={...loose,id:'test:guarded_wait',preconditions:[{value:'false',source:'test:restriction',reason:'restricted by the second package'}]};
 engine.actionRegistry={actions:[loose,strict],byId:new Map([[loose.id,loose],[strict.id,strict]]),errors:[]};
 const input={tool:'world_act',eventId:'legacy-guarded',args:{action:strict.id,slots:{minutes:1}}},before=structuredClone(document);
 // Both public entries project the exact same typed guard rejection.
 await assertActionRejected(engine.reduce(document,input),undefined,'E-PRECONDITION');
 await assertActionRejected(engine.previewAction(document,input),undefined,'E-PRECONDITION');
 assert.deepEqual(document,before);
 strict.preconditions[0].value='true';
 const accepted=await engine.reduce(document,input),next=applyPatches(document,accepted.patches);
 assert.equal(next.state.minute,document.state.minute+1,'legacy handler retains sole time ownership');
 strict.cost={owner:'primitives',time:1};
 await assert.rejects(()=>engine.reduce(document,input),{code:'E-ACTION-COST'});
});

test('A3 custody: native escape check closes custody; failure, wrong guard and forged old check cannot release',async()=>{
 const f=effectFixture(),{engine,document}=f,code=engine.rules.law.codes.find(code=>code.officers?.some(id=>document.state.npcs[id]));
 const officer=code.officers.find(id=>document.state.npcs[id]);
 document.state.location=code.court;document.state.npcs[officer].location=code.court;
 document.state.records.a3_escape_case={id:'a3_escape_case',category:'legal_case',law:code.id,location:code.court,offender:'player',status:'服役中'};
 document.state.records.a3_escape_custody={category:'legal_custody',case:'a3_escape_case',subject:'player',location:code.court,reason:'监禁',status:'生效',started:document.state.minute,expires:document.state.minute+120};
 document.holdings=openHoldings(engine,document);
 const holding=Object.values(document.holdings.rows).find(h=>h.source==='custody:a3_escape_custody'&&h.until===undefined);assert.ok(holding);
 const effect={op:'holding.close',holding:holding.id,reason:'escaped'};
 const input=program(f,{id:'test:escape',check:{attribute:'敏捷',opponent:{npc:officer,attribute:'敏捷'}},outcomes:{success:[effect],partial:[effect],critical:[effect],failure:[],fumble:[]},cost:{owner:'primitives',time:1}});
 let won,lost;
 for(let i=0;i<40&&(!won||!lost);i++){
  const attempt={...input,eventId:`a3-escape-${i}`},preview=await engine.previewAction(document,attempt);
  if(preview.receipt.check.success)won=attempt;else lost=attempt;
 }
 assert.ok(won&&lost,'requires both native contest outcomes');
 const before=structuredClone(document),failure=await engine.reduce(document,lost),failed=applyPatches(document,failure.patches);
 assert.equal(failure.result.receipt.applied.length,0);assert.equal(failed.holdings.rows[holding.id].until,undefined);assert.equal(failed.state.records.a3_escape_custody.status,'生效');
 const success=await engine.reduce(document,won),next=applyPatches(document,success.patches);
 assert.equal(next.holdings.rows[holding.id].until,document.state.minute);assert.equal(next.holdings.rows[holding.id].reason,'escaped');
 assert.equal(next.state.records.a3_escape_custody.status,'已中断');assert.equal(next.state.records.a3_escape_case.remainingSentence.minutes,120);
 assert.ok(success.result.receipt.applied[0].tags.includes('escaped'));assert.equal(success.result.receipt.applied[0].actedAs.kind,'escape');assert.deepEqual(document,before);
 const forged=createRuntimePrimitiveFrame(engine,document,{eventId:'forged-escape',source:{kind:'catalog',id:input.args.action}});
 document.state.checks['forged-escape:action-check']={success:true,opponent:{npc:officer}};
 assert.throws(()=>commitPrimitives(document,[effect],forged),{code:'E-CAPACITY'});
 // A registered escape must oppose the actual present jailer, not an ally.
 const outsider=Object.keys(document.state.npcs).find(id=>!code.officers.includes(id));document.state.npcs[outsider].location=code.court;
 engine.actionRegistry.byId.get(input.args.action).check.opponent.npc=outsider;
 const dishonest={...won,eventId:'wrong-jailer'};
 // A forged jailer does not grant release authority; public refusal has no effects.
 await assertActionRejected(engine.reduce(document,dishonest),undefined,'E-CAPACITY');
});

test('A3 custody: direct self release refuses, current officer release updates the actual law projection and tags its missing basis',()=>{
 const {engine,document}=runtimeFixture(),code=engine.rules.law.codes.find(code=>code.officers?.some(id=>document.state.npcs[id])),officer=code?.officers.find(id=>document.state.npcs[id]);
 assert.ok(officer,'requires a current authored officer');document.state.location=code.court;document.state.npcs[officer].location=code.court;
 document.state.records.a3_custody_case={id:'a3_custody_case',category:'legal_case',law:code.id,location:code.court,offender:'player',status:'已裁决'};
 document.state.records.a3_custody={category:'legal_custody',case:'a3_custody_case',subject:'player',location:code.court,reason:'监禁',status:'生效',started:document.state.minute,expires:document.state.minute+120};
 document.holdings=openHoldings(engine,document);
 const holding=Object.values(document.holdings.rows).find(h=>h.source==='custody:a3_custody'&&h.until===undefined);assert.ok(holding);
 const effect={op:'holding.close',holding:holding.id,reason:'released'},frame=actor=>createRuntimePrimitiveFrame(engine,document,{actor,eventId:`release-${actor}`,source:{kind:'catalog',id:'core:release'}});
 // The default detention regime rejects direct close before authority is read.
 assert.throws(()=>commitPrimitives(document,[effect],frame('player')),{code:'E-CAPACITY'});
 const result=commitPrimitives(document,[effect],frame(officer)),after=applyPatches(document,result.patches);
 assert.equal(after.state.records.a3_custody.status,'已释放');assert.equal(after.holdings.rows[holding.id].until,document.state.minute);
 assert.ok(result.receipt.applied[0].tags.includes('offense:unlawful_release'));
 assert.equal(document.state.records.a3_custody.status,'生效');
});

test('A3 runtime: registered primitive action runs via reduce and preview never writes',async()=>{
 const {engine,document,npc}=runtimeFixture(),before=structuredClone(document),action={id:'test:give',slots:[{name:'to',required:true}],outcomes:[{op:'transfer',from:accountKey('player','coin_river','purse'),to:{slot:'to'},qty:2}],cost:{owner:'primitives'}};
 engine.actionRegistry={byId:new Map([[action.id,action]]),actions:[action]};
 const input={tool:'world_act',eventId:'public-action',args:{action:action.id,slots:{to:accountKey(npc,'coin_river','purse')}}};
 assert.equal((await engine.previewAction(document,input)).receipt.status,'preview');assert.deepEqual(document,before);
 const first=await engine.reduce(document,input),next=applyPatches(document,first.patches);
 assert.equal(first.result.receipt.status,'committed');assert.equal(next.state.player.coins,before.state.player.coins-2);
 assert.equal(first.result.receipt.routed,action.id);assert.equal(first.result.receipt.pending,input.eventId);assert.equal(next.state.records[`primitive:${input.eventId}`].receipt.pending,input.eventId);
 const duplicate=await engine.reduce(JSON.parse(JSON.stringify(next)),input);assert.deepEqual(duplicate.patches,[]);assert.equal(duplicate.result.receipt.duplicate,true);
 // Public caller still cannot supply a native source through a slot.
 await assertActionRejected(engine.reduce(document,{...input,args:{...input.args,slots:{...input.args.slots,source:'rule'}}}),undefined,'E-ACTION-SLOT');
});

test('A3 runtime: loaded RX preconditions run at preview and again against current commit facts',async()=>{
 const {engine,document,npc}=runtimeFixture(),action={id:'test:bounded',slots:[{name:'qty',kind:'quantity',required:true}],outcomes:[{op:'transfer',from:accountKey('player','coin_river','purse'),to:accountKey(npc,'coin_river','purse'),qty:{slot:'qty'}}],preconditions:[{value:'slots.qty <= 2 && month() == 1',reason:'bounded registered action'}]};
 engine.actionRegistry={byId:new Map([[action.id,action]]),actions:[action]};
 const input={tool:'world_act',eventId:'bounded-action',args:{action:action.id,slots:{qty:2}}};
 assert.equal((await engine.previewAction(document,input)).receipt.status,'preview');
 // Quantity guard remains enforced, now as a typed public refusal receipt.
 await assertActionRejected(engine.reduce(document,{...input,args:{...input.args,slots:{qty:3}}}),undefined,'E-PRECONDITION');
 const nextMonth={...document,state:{...document.state,minute:30*1440}};
 // The current month is still rechecked at commit and cannot be bypassed.
 await assertActionRejected(engine.reduce(nextMonth,input),undefined,'E-PRECONDITION');
 assert.equal(document.state.player.coins,180);
});

test('A3 pending: a multi-resource proposal settles once; the loser leaves no transfer or successful receipt',()=>{
 const {document,options,effect}=fixture();
 const c=accountKey('player','item_oats','inventory'),to=accountKey('npc_a','item_oats','inventory');document.ledger.accounts[c]=3;document.ledger.accounts[to]=0;
 const d={document:structuredClone(document),patches:[],contestPool:[],scheduler:new Scheduler({seed:'pending'}),get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});}};
 const effects=[effect,{op:'transfer',from:c,to,qty:3}],claims=[{target:'money',capacity:10,quantity:6,contest:'price'},{target:'goods',capacity:3,quantity:3,contest:'price'}];
 const first=queuePrimitiveProposal(d,effects,createPrimitiveFrame({...options,eventId:'winner'}),{claims,bid:20});
 const second=queuePrimitiveProposal(d,effects,createPrimitiveFrame({...options,eventId:'loser'}),{claims,bid:10});
 assert.equal(first.receipt.status,'pending');assert.deepEqual(first.receipt.applied,[]);assert.deepEqual(d.patches,[]);
 const outcomes=resolveContest(d.contestPool,{seed:'pending',minute:2});
 assert.equal(outcomes.flatMap(o=>o.winners).length,1);assert.equal(outcomes.flatMap(o=>o.losers).length,1);
 for(const o of outcomes){for(const winner of o.winners)winner.execute();for(const loser of o.losers)loser.reject(o.reason);}
 assert.equal(first.receipt.status,'committed');assert.equal(second.receipt.status,'rejected');assert.deepEqual(second.receipt.applied,[]);
 assert.equal(d.get('ledger','accounts',a),4);assert.equal(d.get('ledger','accounts',c),0);
 // A3-A checkpoint 6 / 06 §6.5 requires the final pending result to survive
 // reload. Keep a rejected receipt, while retaining every no-payment/no-goods
 // assertion above and prohibiting successful effects or charged costs here.
 const rejected=d.get('state','records','primitive:loser').receipt;
 assert.equal(rejected.status,'rejected');assert.deepEqual(rejected.applied,[]);assert.equal(rejected.cost,undefined);
 assert.equal(d.get('state','records','primitive:winner').receipt.applied.length,2);
 assert.deepEqual(resolveContest([...d.contestPool].reverse(),{seed:'pending',minute:2}).map(o=>o.winners.map(w=>w.id)),outcomes.map(o=>o.winners.map(w=>w.id)));
});

test('A3 pending: real loan and transfer settle in phase 3, reactions see the final winner',()=>{
 const {engine,document,npc}=runtimeFixture(),before=structuredClone(document),from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse'),quantity=document.state.player.coins;
 const d=engine.primitiveDraft(structuredClone(document)),claims=[{target:'a3-real-money',quantity,capacity:quantity,contest:'price'}],observed=[];
 const remove=registerWorldEventSubscriber({id:'a3-real-pending',order:99999,priorityClass:'core',on(d,e,events){
  for(const event of events.filter(event=>event.parent==='pending-loan-a')){
   assert.ok(Object.values(d.get('state','records')).some(r=>r.verb==='contest_win'&&r.actor==='player'));
   assert.ok(d.get('state','obligations','obligation_a3_winner'));assert.equal(d.get('state','obligations','obligation_a3_loser'),undefined);observed.push(event.id);
  }
 }});
 try{
  const make=(eventId,id,bid)=>queuePrimitiveProposal(d,[{op:'transfer',from,to,qty:quantity},{op:'obligation.create',id,obligationKind:'loan',debtor:'player',creditor:npc,amount:5}],createRuntimePrimitiveFrame(engine,document,{eventId,source:{kind:'catalog',id:'core:loan'}}),{claims,bid});
  const winner=make('pending-loan-a','obligation_a3_winner',20),loser=make('pending-loan-b','obligation_a3_loser',10);
  assert.deepEqual(observed,[]);assert.equal(winner.receipt.status,'pending');assert.equal(loser.receipt.status,'pending');
  engine.advance(d,0,'a3-pending-tick');
  assert.equal(winner.receipt.status,'committed');assert.equal(loser.receipt.status,'rejected');
  assert.equal(d.get('state','player','coins'),0);assert.equal(d.get('state','npcs',npc,'coins'),before.state.npcs[npc].coins+quantity);
  assert.equal(d.get('state','obligations','obligation_a3_loser'),undefined);assert.deepEqual(observed.sort(),['obligation:obligation_a3_winner:pending-loan-a:1','pending-loan-a:0']);
  assert.deepEqual(document,before);
 }finally{remove();}
});

test('A3 public: HTTP preview, archived program execution, JSON import replay and anchor rollback',async t=>{
 const {default:express}=await import('express'),{once}=await import('node:events'),{init}=await import('../server-plugin/index.mjs'),{tmpRoot}=await import('../tools/tmp-root.mjs'),path=await import('node:path');
 const root=await fs.mkdtemp(path.join(tmpRoot(),'a3-public-'));
 // Extend the same replay/rollback case to the new time/body cost contract;
 // the original coin, privacy, duplicate and anchor assertions remain intact.
 const action={id:'test:spend',label:'spend',verb:'transfer',group:'test',narration:'test',slots:[{name:'qty',kind:'quantity',required:true}],synonyms:[],visibility:{catalog:'here'},participants:{actor:'player'},preconditions:['slots.qty <= 2'],outcomes:[{op:'transfer',from:accountKey('player','coin_river','purse'),to:accountKey('sink:consume','coin_river','use'),qty:{slot:'qty'}}],cost:{owner:'primitives',time:1}};
 const world={...structuredClone(runtimeWorld),primitiveTables:structuredClone(runtimeWorld.primitiveTables),primitiveTemplates:structuredClone(runtimeWorld.primitiveTemplates),actionDefinitions:{format:1,actions:[action]}};
 const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();await init(router,{world,baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false,populationProfilesEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 await once(server,'listening');
 const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const created=await request('/create',{character:{}});assert.equal(created.status,200,created.body.error);
 const campaignId=created.body.reference.campaignId,before=(await request('/read',{campaignId})).body;
 const args={action:action.id,slots:{qty:2}},input={campaignId,eventId:'http-spend',anchor:'a3-anchor',args};
 const resolved=await request('/actions',{campaignId,resolve:args});assert.equal(resolved.body.tool,'world_act');
 const preview=await request('/propose',input);assert.equal(preview.status,200,preview.body.error);assert.equal(preview.body.receipt.status,'preview');
 assert.deepEqual((await request('/read',{campaignId})).body,before);
 // A3 refusal contract: storage already archives returned receipts (including
 // ActionRejection). Assert the exact unchanged world plus one refusal event;
 // only a thrown transport/internal fault leaves the event chain untouched.
 const rejected=await request('/execute',{...input,eventId:'http-refused',tool:'world_act',args:{action:action.id,slots:{qty:3}}});assert.equal(rejected.status,200);assert.equal(rejected.body.result.receipt.status,'rejected');assert.equal(rejected.body.result.receipt.code,'E-PRECONDITION');
 const refusedView=(await request('/read',{campaignId})).body;assert.deepEqual(refusedView.document,before.document);assert.equal(refusedView.reference.sequence,before.reference.sequence+1);
 const refusedEvent=(await request('/export',{campaignId})).body.events.at(-1);assert.deepEqual(refusedEvent.patches,[]);assert.equal(refusedEvent.result.receipt.status,'rejected');assert.deepEqual(refusedEvent.result.receipt.applied,[]);
 const committed=await request('/execute',{...input,tool:'world_act'});assert.equal(committed.status,200,committed.body.error);assert.equal(committed.body.result.receipt.status,'committed');
 const after=(await request('/read',{campaignId})).body;assert.equal(after.document.state.player.coins,before.document.state.player.coins-2);
 assert.equal(after.document.state.minute,before.document.state.minute+1);assert.equal(after.document.state.player.body.stamina.asOf,after.document.state.minute);
 const duplicate=await request('/execute',{...input,tool:'world_act'});assert.equal(duplicate.body.duplicate,true);assert.deepEqual((await request('/read',{campaignId})).body,after);
 const bundle=(await request('/export',{campaignId})).body,imported=await request('/import',{bundle});assert.equal(imported.status,200,imported.body.error);
 assert.deepEqual(imported.body.document,after.document);
 const rolled=await request('/reconcile',{campaignId,validAnchors:[]});assert.equal(rolled.status,200,rolled.body.error);assert.equal(rolled.body.document.state.player.coins,before.document.state.player.coins);
 assert.equal(rolled.body.document.state.records['primitive:http-spend'],undefined);
 assert.deepEqual(rolled.body.document.state.player.body,before.document.state.player.body);
});
