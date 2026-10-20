import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,parseAccount,auditLedger} from '../server-plugin/ledger.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {registerOpenActionContext,createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const from=accountKey('player','coin_river','purse');
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
  await assert.rejects(f.engine.reduce(f.document,{tool:'world_act',eventId:action,args:{action,slots:{}}}),/羁押|custody|detain|拘/);
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
