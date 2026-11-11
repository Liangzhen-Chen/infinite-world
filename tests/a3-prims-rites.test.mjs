import {assertActionRejected} from './helpers/action-refusal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger,accountKey,auditLedger,openLedger} from '../server-plugin/ledger.mjs';
import {openHoldings,createEntity,setLocation,openHolding,declareHoldingWriter} from '../server-plugin/holdings.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {schemaValidator} from '../server-plugin/primitive-schema.mjs';
import {registerEffect} from '../server-plugin/effects.mjs';
import '../server-plugin/primitives-runtime.mjs';

const source=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
// Paid initiation and discipline are tested with the authored ritual providers
// present; source errands are covered separately, not an extra ritual premise.
delete source.rules.householdSubsistence;
const NPC='npc_hw_linsui',WOOD='item_wood',TOOL='item_whittling_knife',OBJECT='item_a3_degree_target';
declareHoldingWriter('a3-prims-test',{entities:['item'],locations:true,kinds:['owns']});
function setup(mutate=()=>{}){
 const world=structuredClone(source);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock','effectTable'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 world.items.push({id:OBJECT,name:'档位用木牌',kind:'item',tags:['wood'],weight:1,basePrice:1});
 mutate(world);
 const engine=new WorldEngine(world),initial=engine.createCharacter(seed,{},'a3-prims-rites');
 Object.assign(initial.state.player,{hp:80,maxHp:100,mp:100,maxMp:100,coins:100,attributes:{力量:10,敏捷:10,体质:10,智力:10,精神:10}});
 initial.state.inventory[WOOD]={quantity:20,quality:'木',durability:100,weight:1};initial.state.inventory[TOOL]={quantity:1,quality:'木',durability:80,weight:.2};
 Object.assign(initial.state.npcs[NPC],{location:initial.state.location,status:'正常',activity:'休息',trust:50,goals:{}});
 let document=withLedger(engine,initial).document;document.holdings=openHoldings(engine,document);
 const d=engine.primitiveDraft(document);createEntity(d,{id:OBJECT,kind:'item',facts:{name:'档位用木牌',condition:60},source:'fixture',writer:'a3-prims-test'});
 setLocation(d,{entity:OBJECT,at:'player',mode:'carried',writer:'a3-prims-test',engine});openHolding(d,{kind:'owns',holder:'player',subject:OBJECT,terms:{share:1},writer:'a3-prims-test',engine});
 document=applyPatches(document,d.patches);
 return {engine,document,world};
}
const action=(id,outcomes,extra={})=>({id:`test:${id}`,label:id,narration:id,synonyms:[],visibility:{catalog:'here'},slots:[],cost:{owner:'primitives',time:2},check:{attribute:'精神',difficulty:10},outcomes,...extra});
const act=(a,eventId,slots={})=>({tool:'world_act',eventId,args:{action:a.id,slots}});
function rollId(document,die,suffix='action-check'){
 for(let i=0;i<10000;i++){const id=`degree-${suffix}-${die}-${i}`,roll=createHash('sha256').update(`${document.randomSeed}:${id}:${suffix}:d20`).digest().readUInt32LE(0)%20+1;if(roll===die)return id;}
 throw Error('missing die');
}
async function run(f,a,die,slots={}){
 f.engine.world.actionDefinitions={format:1,actions:[a]};
 const input=act(a,rollId(f.document,die,a.rite?'rite-check':'action-check'),slots),before=structuredClone(f.document),preview=await f.engine.previewAction(f.document,input);
 assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches),receipt=out.result.receipt;
 assert.equal(receipt.status,'committed');assert.deepEqual(auditLedger(after.ledger),[]);assert.equal(after.state.player.coins,before.state.player.coins);
 assert.deepEqual(f.document,before);assert.equal(preview.receipt.status,'preview');
 const retry=await f.engine.reduce(JSON.parse(JSON.stringify(after)),input);assert.deepEqual(retry.patches,[]);
 return {after,receipt,before,input};
}
const degrees=['大失败','失败','勉强成功','成功','大成功'],dice=[1,5,10,15,20];
test('A3 prims: fact.set five grades change real condition, held tool wear, time and exposure',async()=>{
 for(const [i,die] of dice.entries()){
  const f=setup(),a=action('fact-degree',[{op:'fact.set',entity:OBJECT,field:'condition',delta:-4}],{slots:[{name:'tool',kind:'entity',entity:'item'}]});
  const {after,receipt,before}=await run(f,a,die,{tool:TOOL});
  assert.equal(receipt.check.degree,degrees[i]);assert.equal(after.holdings.entities[OBJECT].facts.condition,[59,60,58,56,56][i]);
  assert.equal(after.state.inventory[TOOL].durability,[78,79,79,79,79][i]);assert.equal(after.state.minute-before.state.minute,[4,2,2,2,1][i]);
  assert.equal(receipt.consequences.some(e=>e.kind==='exposure'),i<2);
 }
});
test('A3 prims: world_propose derives tool wear from its verified held source, not a client-supplied conclusion',async()=>{
 const f=setup(world=>{const tool=world.items.find(i=>i.id===TOOL);tool.tags=[...new Set([...tool.tags??[],'tool'])];});f.engine.world.actionDefinitions={format:1,actions:[action('unrelated',[{op:'emit',verb:'tell',visibility:'private',payload:{text:'无关'}}],{check:null})]};
 const input={tool:'world_propose',eventId:rollId(f.document,20),args:{intent:'xyzzy 以手中刀在自有木牌划一道',means:{tools:[TOOL]},effects:[{op:'fact.set',entity:OBJECT,field:'condition',delta:-1}]}},before=structuredClone(f.document);
 const preview=await f.engine.previewAction(f.document,input);assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);assert.equal(preview.receipt.status,'preview');assert.equal(out.result.receipt.routing.status,'open');
 assert.equal(after.holdings.entities[OBJECT].facts.condition,59);assert.equal(after.state.inventory[TOOL].durability,79);assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(f.document,before);
});
test('A3 prims: vital five grades use actual self injury and combat critical multiplier',async()=>{
 for(const [i,die] of dice.entries()){
  const f=setup(),a=action('vital-degree',[{op:'vital',target:'player',delta:-4,type:'physical'}]),{after,receipt,before}=await run(f,a,die);
  assert.equal(receipt.check.degree,degrees[i]);assert.equal(after.state.player.hp-before.state.player.hp,[-1,0,-2,-4,-4*f.engine.rules.combat.criticalMultiplier][i]);
  for(const row of Object.values(after.state.records).filter(r=>r.category==='primitive_receipt'&&r.receipt.source.id==='m4:magic'))for(const effect of row.receipt.applied.filter(e=>e.op==='vital'))assert.equal(effect.delta,-(effect.result.damage??0));
  assert.equal(after.state.minute-before.state.minute,i===0?4:2);
 }
});
test('A3 prims: request five grades persist NPC decision, refusal memory event and real standing',async()=>{
 for(const [i,die] of dice.entries()){
  const f=setup(),a=action('request-degree',[{op:'emit',verb:'request',target:NPC,visibility:'witnessed',payload:{kind:'greet'}}]);
  const old=standing(f.engine,f.document.state,NPC,'player'),{after,receipt}=await run(f,a,die);
  assert.equal(receipt.check.degree,degrees[i]);assert.equal(receipt.decisions[0].outcome,['refuse','refuse','conditional','agree','agree'][i]);
  assert.equal(standing(f.engine,after.state,NPC,'player')-old,[-2,0,0,0,2][i]);
  assert.ok(Object.values(after.state.records).some(e=>e.category==='world_event'&&e.verb==='request'&&e.target===NPC&&e.payload?.outcome===receipt.decisions[0].outcome));
 }
});
test('A3 prims: a critical request preserves the real NPC red line and never records a false agreement',async()=>{
 const f=setup();f.engine.byId.get(NPC).redLines=['greet'];
 const a=action('request-red-line',[{op:'emit',verb:'request',target:NPC,visibility:'witnessed',payload:{kind:'greet'}}]),old=standing(f.engine,f.document.state,NPC,'player');
 const {after,receipt}=await run(f,a,20);assert.equal(receipt.check.degree,'大成功');assert.equal(receipt.decisions[0].outcome,'refuse');
 assert.equal(standing(f.engine,after.state,NPC,'player'),old);assert.ok(Object.values(after.state.records).some(e=>e.category==='world_event'&&e.verb==='request'&&e.payload?.outcome==='refuse'));
});
test('A3 prims: move five grades preserve route costs, detected failure, fall injury and suspicion',async()=>{
 for(const [i,die] of dice.entries()){
  const f=setup(),to=f.engine.world.locations.find(l=>l.id!==f.document.state.location&&f.engine.route(f.document.state.location,l.id,'walk',f.document.state.minute)?.minutes)?.id;
  assert.ok(to);const a=action('move-degree',[{op:'move',to}]),{after,receipt,before}=await run(f,a,die);
  assert.equal(receipt.check.degree,degrees[i]);assert.equal(after.state.location,i<2?before.state.location:to);
  assert.equal(after.state.player.hp-before.state.player.hp,i===0?-1:0);
  assert.equal(Object.values(after.state.effects).some(e=>e.status==='suspected'),i===2);
  if(i===2)assert.ok(Object.values(after.state.effects).find(e=>e.status==='suspected').expires>after.state.minute);
  assert.equal(receipt.consequences.some(e=>e.kind==='exposure'),i<2);
  if(i>=2)assert.ok(after.state.minute>before.state.minute);
 }
});
test('A3 prims: create five grades consume real full/half material and produce graded objects',async()=>{
 for(const [i,die] of dice.entries()){
  const f=setup(),a=action('create-degree',[{op:'create',kind:'item',template:'core:item',facts:{name:'即兴档位草结'}}],{cost:{owner:'primitives',time:2,resources:[{resource:WOOD,qty:4}]}});
  const {after,receipt,before}=await run(f,a,die),key=accountKey('player',WOOD,'inventory'),created=Object.values(after.state.created).find(e=>e.name==='即兴档位草结');
  assert.equal(receipt.check.degree,degrees[i]);assert.equal(before.ledger.accounts[key]-after.ledger.accounts[key],[4,2,4,4,4][i]);
  assert.equal(before.state.inventory[WOOD].quantity-after.state.inventory[WOOD].quantity,[4,2,4,4,4][i]);
  assert.equal(created?.quality,[undefined,undefined,'crude','ordinary','fine'][i]);
  assert.equal(created?.durability,[undefined,undefined,10,30,50][i]);
 }
});
test('A3 prims: learn five grades use a held readable source, misunderstanding and bounded daily gains',async()=>{
 for(const [i,die] of dice.entries()){
  const subject='skill_a3_self_study',book='item_a3_self_study',f=setup(world=>{
   world.skills.push({id:subject,name:'自学结绳',attribute:'智力',stage:0,profession:null});world.items.push({id:book,name:'结绳读本',weight:1,book:{grade:world.rules.books.grades[0],teaches:[subject],readingMinutes:2}});
  });
  f.document.state.skills[subject]={proficiency:100,daily:{},breakthroughs:[]};f.document.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};f.document.state.inventory[book]={quantity:1,durability:100};
  f.document.ledger=openLedger(f.engine,f.document);
  const a=action('learn-degree',[{op:'learn',entity:'player',subject,learningSource:book,amount:2}],{cost:{owner:'primitives',time:240}}),{after,receipt}=await run(f,a,die);
  assert.equal(receipt.check.degree,degrees[i]);const change=after.state.skills[subject].proficiency-100;
  assert.equal(change,[-1,0,1,2,4][i]);if(i===0)assert.equal(receipt.consequences.find(e=>e.kind==='misunderstanding').delta,-1);
 }
});

function rite(f,{stages=1,culture='any',costs={}}={}){
 return action('rite-shape',[{op:'vital',target:'player',delta:8,type:'healing'}],{slots:[{name:'project',kind:'text'},{name:'operation',kind:'text'}],cost:{owner:'primitives',time:0},
  rite:{family:'rite:test',culture,officiant:'actor == "player"',roles:[],costs,limits:{vital:{heal:8,harm:2,rangeMeters:1.5}},expiresWithin:30,
   stages:Array.from({length:stages},(_,i)=>({id:`s${i}`,minutes:2,materials:[{resource:WOOD,qty:4}]})),backlash:{effects:[{op:'vital',target:'$actor',delta:-2,type:'physical'}]},interrupt:{status:'rite_unfinished',effects:[]}}});
}
test('A3 prims: rite five grades spend materials, report unfinished status, scale partial and save critical material',async()=>{
 for(const [i,die] of dice.entries()){
  const f=setup(),a=rite(f),{after,receipt,before}=await run(f,a,die),key=accountKey('player',WOOD,'inventory');
  assert.equal(receipt.check.degree,degrees[i]);assert.equal(after.state.player.hp-before.state.player.hp,[-2,0,4,8,8][i]);
  assert.equal(before.ledger.accounts[key]-after.ledger.accounts[key],[4,4,4,4,2][i]);assert.equal(after.state.minute-before.state.minute,i===0?4:2);
  assert.equal(receipt.rite.status,i<3?'unfinished':'completed');assert.equal(Object.values(after.state.effects).some(e=>e.kind==='rite_status'&&e.status==='rite_unfinished'),i<3);
 }
});
test('A3 prims: rite culture is read at use time, foreign efficacy halves, any is neutral',async()=>{
 for(const [culture,actual,delta] of [['culture:river','culture_river',8],['culture:river','culture_north',4],['any','culture_north',8]]){
  const f=setup();f.document.state.player.culture=actual;const a=rite(f,{culture}),{after,receipt,before}=await run(f,a,15);
  assert.equal(after.state.player.hp-before.state.player.hp,delta);assert.equal(receipt.rite.culture.affinity,delta/8);assert.equal(receipt.rite.status,delta===8?'completed':'unfinished');
 }
});
test('A3 prims: rite vow uses obligation protocol once per project; discipline loss interrupts without next fee',async()=>{
 const f=setup(),a=rite(f,{stages:2,costs:{vow:{creditor:NPC,terms:{promise:'守约还愿'}},discipline:'discipline:quiet'}});
 a.check=null;f.document.state.player.tags=['discipline:quiet'];f.engine.world.actionDefinitions={format:1,actions:[a]};
 const previewBefore=structuredClone(f.document),preview=await f.engine.previewAction(f.document,act(a,'rite-vow-start'));
 assert.equal(preview.receipt.cost.vow[0].obligationKind,'vow');assert.equal(preview.receipt.cost.vow[0].debtor,'player');assert.equal(preview.receipt.cost.discipline[0].label,'discipline:quiet');assert.deepEqual(f.document,previewBefore);
 const first=await f.engine.reduce(f.document,act(a,'rite-vow-start')),after=applyPatches(f.document,first.patches),r=first.result.receipt;
 const vow=r.cost.vow[0].result.id;assert.equal(after.state.obligations[vow].kind,'vow');assert.equal(after.state.obligations[vow].debtor,'player');assert.equal(after.state.obligations[vow].creditor,NPC);
 assert.equal(r.cost.discipline[0].label,'discipline:quiet');
 const second=await f.engine.reduce(after,act(a,'rite-vow-end',{project:r.rite.project})),completed=applyPatches(after,second.patches);
 assert.equal(second.result.receipt.rite.status,'completed');assert.equal(Object.values(completed.state.obligations).filter(o=>o.kind==='vow').length,1);
 const broken=structuredClone(after);broken.state.player.tags=[];const before=structuredClone(broken),stop=await f.engine.reduce(broken,{tool:'world_time',eventId:'rite-discipline-lost',args:{minutes:1}}),stopped=applyPatches(broken,stop.patches);
 assert.equal(stopped.state.records[`rite_project:${r.rite.project}`].status,'unfinished');assert.equal(stopped.ledger.accounts[accountKey('player',WOOD,'inventory')],before.ledger.accounts[accountKey('player',WOOD,'inventory')]);
 assert.ok(Object.values(stopped.state.effects).some(e=>e.status==='rite_unfinished'&&e.project===r.rite.project));assert.deepEqual(broken,before);assert.deepEqual(auditLedger(stopped.ledger),[]);
});
test('A3 prims: rite missing discipline and invalid vow refuse before money, material or time; failed final outcome rolls back vow',async()=>{
 const f=setup(),a=rite(f,{costs:{discipline:'discipline:quiet',vow:{creditor:NPC,terms:{promise:'还愿'}}}});a.check=null;f.engine.world.actionDefinitions={format:1,actions:[a]};
 // A3 refusal: preserve the original business code and require a zero-effects receipt.
 const before=structuredClone(f.document);await assertActionRejected(f.engine.reduce(f.document,act(a,'rite-no-discipline')),undefined,'E-RITE-DISCIPLINE');assert.deepEqual(f.document,before);
 f.document.state.player.tags=['discipline:quiet'];a.rite.costs.vow.debtor=NPC;
 await assert.rejects(f.engine.reduce(f.document,act(a,'rite-forged-vow')),{code:'E-RITE-DATA'});
 delete a.rite.costs.vow.debtor;a.outcomes=[{op:'transfer',from:accountKey('player',WOOD,'inventory'),to:accountKey(NPC,WOOD,'inventory'),qty:1000}];
 // The failed material transfer still rolls back both the outcome and vow.
 const snapshot=structuredClone(f.document);await assertActionRejected(f.engine.reduce(f.document,act(a,'rite-final-fails')),undefined,'E-TRANSFER-BALANCE');assert.deepEqual(f.document,snapshot);assert.equal(Object.values(f.document.state.obligations).filter(o=>o.kind==='vow').length,0);
});
test('A3 prims: rite discipline reads the actual paid initiation proof obtained through world_act',async()=>{
 const f=setup(),entry=f.engine.rules.training.institutions.find(i=>i.ritual),teacher=entry.teacher;
 f.document.state.location=entry.institution;Object.assign(f.document.state.npcs[teacher],{location:entry.institution,activity:'闲谈',status:'正常'});
 const input={tool:'world_act',eventId:'rite-real-initiation',args:{action:'core:profession.initiate',slots:{profession:entry.profession,teacher,institution:entry.institution}}};
 const before=structuredClone(f.document),start=await f.engine.reduce(f.document,input);f.document=applyPatches(f.document,start.patches);
 assert.equal(f.document.state.player.coins,before.state.player.coins-entry.initiationFee);assert.equal(f.document.state.minute,before.state.minute+entry.initiationMinutes);
 const a=rite(f,{costs:{discipline:entry.rule}});a.check=null;f.engine.world.actionDefinitions={format:1,actions:[a]};
 const out=await f.engine.reduce(f.document,act(a,'rite-from-initiation')),after=applyPatches(f.document,out.patches),evidence=out.result.receipt.cost.discipline[0];
 assert.equal(evidence.source,f.document.state.careers[entry.profession].initiation.record);assert.equal(after.state.player.hp,f.document.state.player.hp+8);assert.deepEqual(auditLedger(after.ledger),[]);
});

const VAT='feature_a3_unified_vat';
function physicalFixture(kind,{failure=false}={}){
 const f=setup(world=>{
  const place=world.locations.find(l=>l.id==='bld_hw_qingdeng');place.features??=[];
  place.features.push({id:VAT,name:'事务试验水缸',aliases:[],kind:'container',owner:'player',access:'public',position:[0,0],state:{capacityMl:5000,waterMl:4000,turbidity:0,saltMg:0,toxinUg:0,pathogenRisk:0,odor:''}});
  world.skills.push({id:'skill_a3_freeze',name:'冻水试验',attribute:'精神',profession:null,stage:0});
  const faction=world.factions.find(f=>f.id==='faction_saltboat');faction.resources??={};faction.resources.items={...faction.resources.items,[WOOD]:10};
  world.spells.push({...world.spells[0],id:'spell_a3_freeze',name:'事务冻水',skill:'skill_a3_freeze',stage:0,mp:2,minutes:1,materials:[],duration:0,difficulty:10,rangeMeters:3,targeting:{lineOfSight:true},effectSpec:{kind:'damage',power:4,damageType:'cold'}});
  if(kind!=='m4')world.rules.factionClock={version:1,clocks:[{id:'a3_unified',faction:'faction_saltboat',settlement:'loc_hw',source:'A3 shared primitive',intervalDays:1,probability:1,
   stages:[{id:'freeze',name:'冻水',condition:{kind:'always'},...(failure?{cost:{items:{[WOOD]:1}}}:{}),effects:[kind==='k2'?{kind:'interaction',agent:'cold',target:VAT,minutes:120}:{kind:'environment',state:'frozen',locations:[place.id],minutes:120},...(failure?[{kind:'a3_refuse',id:'after-freeze'}]:[])]}]}]};
 });
 f.document.state.location='bld_hw_qingdeng';f.document.state.minute=1439;
 f.document.state.spells.spell_a3_freeze={source:{type:'fixture'}};f.document.state.skills.skill_a3_freeze={proficiency:10,daily:{},breakthroughs:[]};
 return f;
}
test('A3 prims: public K2 physical program, K6 effect and M4 cast yield identical conserved water state and shared primitive receipts',async()=>{
 const states=[],contacts=[];
 for(const kind of ['k2','k6','m4']){
  const f=physicalFixture(kind),before=structuredClone(f.document),eventId=kind==='m4'?rollId(f.document,15,'cast'): `shared-${kind}`;
  // Legacy cast's check uses eventId:d20 (the registered action retains it).
  let input={tool:'world_act',eventId,args:{action:'core:cast',slots:{spell:'spell_a3_freeze',target:VAT}}};
  if(kind==='m4'){
   for(let i=0;i<1000;i++){const id=`shared-magic-${i}`,die=createHash('sha256').update(`${f.document.randomSeed}:${id}:d20`).digest().readUInt32LE(0)%20+1;if(die===15){input.eventId=id;break;}}
  }else input={tool:'world_act',eventId,args:{action:'core:time.rest',slots:{minutes:1}}};
  const out=await f.engine.reduce(f.document,input),after=applyPatches(f.document,out.patches);
  const row=after.state.records[`physical_feature:${VAT}`];assert.equal(row.state.waterMl,4000);assert.equal(row.state.frozenUntil,1560);assert.equal(after.state.minute,1440);
  assert.equal(after.state.player.coins,before.state.player.coins);assert.equal(after.state.inventory[WOOD].quantity,before.state.inventory[WOOD].quantity);assert.deepEqual(auditLedger(after.ledger),[]);
  if(kind==='m4'){assert.equal(out.result.success,true);assert.equal(after.state.player.mp,before.state.player.mp-2);}
  const native=Object.values(after.state.records).filter(r=>r.category==='primitive_receipt'&&r.receipt.source.id==='k2:interaction'&&r.receipt.applied.some(e=>e.target===VAT));
  assert.equal(native.length,1);const receipt=native[0].receipt,valid=schemaValidator('receipt');assert.equal(valid(receipt),true,JSON.stringify(valid.errors));
  assert.equal(receipt.status,'committed');assert.equal(receipt.applied[0].op,'status');assert.equal(receipt.applied[0].status,'frozen');assert.equal(receipt.applied[0].duration,120);assert.equal(receipt.applied[0].magnitude,1);assert.equal(receipt.applied[0].result.agent,'cold');assert.equal(receipt.applied[0].result.minutes,120);
  contacts.push(receipt.applied[0].result);states.push(row.state);assert.deepEqual(f.document,before);
  const retry=await f.engine.reduce(JSON.parse(JSON.stringify(after)),input);assert.deepEqual(retry.patches,[]);
 }
 assert.deepEqual(states[0],states[1]);assert.deepEqual(states[1],states[2]);assert.deepEqual(contacts[0],contacts[1]);assert.deepEqual(contacts[1],contacts[2]);
});
test('A3 prims: a late K6 refusal rolls back earlier K2 writes, child receipts and stage material/coin postings through world_time',async()=>{
 const off=registerEffect('a3_refuse',{validate(){},apply:()=>({applied:false,reason:'late refusal'})});
 try{
  const f=physicalFixture('k2',{failure:true}),before=structuredClone(f.document),out=await f.engine.reduce(f.document,{tool:'world_time',eventId:'shared-late-refusal',args:{minutes:1}}),after=applyPatches(f.document,out.patches);
  assert.equal(after.state.records[`physical_feature:${VAT}`],undefined);assert.equal(after.state.records['faction-clock:a3_unified'].phase,0);assert.equal(after.state.records['faction-clock:a3_unified'].blocked,'late refusal');
  assert.ok(!Object.values(after.state.records).some(r=>r.category==='primitive_receipt'&&['k2:interaction','k6:faction'].includes(r.receipt.source.id)));
  assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(f.document,before);
  const control=physicalFixture('k2');delete control.engine.rules.factionClock;
  const unclocked=await control.engine.reduce(control.document,{tool:'world_time',eventId:'shared-late-refusal',args:{minutes:1}}),baseline=applyPatches(control.document,unclocked.patches);
  assert.deepEqual(after.ledger,baseline.ledger);assert.deepEqual(after.state.inventory,baseline.state.inventory);assert.equal(after.state.player.coins,baseline.state.player.coins);assert.equal(after.state.minute,baseline.state.minute);
 }finally{off();}
});
