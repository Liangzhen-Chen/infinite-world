import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,auditLedger,parseAccount} from '../server-plugin/ledger.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {prepareOpenAction,executeRoutedOpenAction} from '../server-plugin/open-actions.mjs';
import {assertActionRejected} from './helpers/action-refusal.mjs';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world));
 engine.world.primitiveTables=structuredClone(world.primitiveTables);
 engine.world.primitiveFacts=structuredClone(world.primitiveFacts);
 engine.world.primitiveTemplates=structuredClone(world.primitiveTemplates);
 const document=withLedger(engine,engine.createCharacter(seed,{},'a3-b-route')).document;
 const npc=Object.keys(document.state.npcs).find(id=>document.state.npcs[id].location&&document.state.npcs[id].coins>0);
 assert.ok(npc,'real present recipient');
 document.state.location=document.state.npcs[npc].location;
 const from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse');
 const action={id:'test:gift',label:'递交铜钱',narration:'test.gift',synonyms:[],signature:[JSON.stringify(['transfer','person','coin_river'])],participants:{actor:'player',target:['person']},visibility:{catalog:'target:npc'},slots:[{name:'to',kind:'text',schema:'string',required:true}],cost:{owner:'primitives',time:2},outcomes:[{op:'transfer',from,to:{slot:'to'},qty:5}]};
 // Native authored program fixture; uses the real primitive/ledger/scheduler,
 // not a stub handler. This is not evidence of public world_propose wiring.
 // Refusal alternatives must be real registered actions, not just mark assets.
 engine.world.actionDefinitions={format:1,actions:[action,world.actionDefinitions.actions.find(a=>a.id==='open:leave_mark')]};
 const args={intent:action.label,participants:{target:npc},effects:[{op:'transfer',from,to,qty:9999}]};
 const native={routing:{actor:'player',kindOf:id=>{
  if(typeof id==='string'&&id.includes('|'))id=parseAccount(id).owner;
  return id==='player'||document.state.npcs[id]?'person':null;
 },visible:()=>true,slotsFor:(_action,p)=>({to:p.effects[0].to})},limits:()=>{throw Error('matched actions must use their own rules');}};
 return {engine,document,npc,from,to,args,native};
}
test('A3 open: routed proposal executes registered quantities and time through actual engine',async()=>{
 const f=fixture(),before=structuredClone(f.document),input={args:f.args,eventId:'a3-b-actual'};
 const result=await executeRoutedOpenAction(f.engine,f.document,input,f.native),after=applyPatches(f.document,result.patches);
 assert.equal(result.routing.routed,'test:gift');assert.equal(result.result.receipt.routed,'test:gift');
 assert.equal(after.ledger.accounts[f.from],before.ledger.accounts[f.from]-5);
 assert.equal(after.ledger.accounts[f.to],before.ledger.accounts[f.to]+5);
 assert.equal(after.state.minute,before.state.minute+2);assert.deepEqual(auditLedger(after.ledger),[]);
 assert.deepEqual(f.document,before);
 const duplicate=await executeRoutedOpenAction(f.engine,JSON.parse(JSON.stringify(after)),input,f.native);
 assert.equal(duplicate.result.receipt.duplicate,true);assert.deepEqual(duplicate.patches,[]);
});
test('A3 open: preview is read-only; confirmation rechecks native balance',async()=>{
 const f=fixture(),before=structuredClone(f.document),input={args:f.args,eventId:'a3-b-preview'};
 const preview=await executeRoutedOpenAction(f.engine,f.document,input,f.native,{preview:true});
 assert.equal(preview.receipt.status,'preview');assert.deepEqual(f.document,before);
 f.document.ledger.accounts[f.from]=0;
 // A3 refusal contract: keep the same balance code and require zero effects.
 await assertActionRejected(executeRoutedOpenAction(f.engine,f.document,input,f.native),undefined,'E-TRANSFER-BALANCE');
});
test('A3 open: missing slots and unmatched plans never pretend effects were submitted',async()=>{
 const f=fixture(),input={args:f.args,eventId:'a3-b-needs-slot'},native={...f.native,routing:{...f.native.routing,slotsFor:()=>({})}};
 const waiting=await executeRoutedOpenAction(f.engine,f.document,input,native);
 assert.equal(waiting.prepared.status,'needs_slots');assert.equal(waiting.receipt.status,'not_submitted');assert.deepEqual(waiting.receipt.applied,[]);
 const proposal={intent:'在门旁做一件奇怪的小东西',effects:[{op:'create',kind:'item',facts:{quantity:99}}]};
 const plan=prepareOpenAction(f.engine,f.document,proposal,{...f.native,limits:()=>({actor:'player',sourceFor:()=>null})});
 // A8 archives the real mark assets. An alternative is available, while the
 // requested item/quantity still has no executable effects and is not submitted.
 assert.equal(plan.status,'needs_alternative');assert.deepEqual(plan.effects,[]);assert.equal(plan.fallback.available,true);
 assert.equal(plan.fallback.action,'open:leave_mark');assert.equal(plan.fallback.intent,proposal.intent);
 for(const key of ['openActionRules','openTagging','openReactions']){
  const saved=f.engine.world[key];delete f.engine.world[key];
  const absent=prepareOpenAction(f.engine,f.document,proposal,{...f.native,limits:()=>({actor:'player',sourceFor:()=>null})});
  assert.equal(absent.fallback.available,false);assert.deepEqual(absent.effects,[]);f.engine.world[key]=saved;
 }
});

test('A3 open: native routing executes an actual registered transfer without injected resolvers',async()=>{
 const f=fixture(),input={args:f.args,eventId:'a3-native-route'},out=await executeRoutedOpenAction(f.engine,f.document,input);
 const after=applyPatches(f.document,out.patches);
 assert.equal(out.routing.routed,'test:gift');assert.equal(after.ledger.accounts[f.to],f.document.ledger.accounts[f.to]+5);
 assert.equal(after.state.minute,f.document.state.minute+2);assert.deepEqual(auditLedger(after.ledger),[]);
});

test('A3 open: routed leave_mark uses the real mark adapter and native costs',async()=>{
 const engine=new WorldEngine(structuredClone(world));
 Object.assign(engine.world,{openActionRules:JSON.parse(await fs.readFile('world/rules/tables/open-actions.json','utf8')),openTagging:JSON.parse(await fs.readFile('world/rules/open-tagging.json','utf8')),openReactions:JSON.parse(await fs.readFile('world/rules/open-reactions.json','utf8'))});
 const document=withLedger(engine,engine.createCharacter(seed,{},'a3-routed-mark')).document;
 const args={intent:'留下痕迹',effects:[{op:'create',kind:'mark',facts:{intent:'留下一个提醒路人的记号',form:'刻痕'},tags:['mark:warning']}]},before=structuredClone(document);
 const preview=await executeRoutedOpenAction(engine,document,{eventId:'a3-routed-mark',args},undefined,{preview:true});
 assert.equal(preview.receipt.status,'preview');assert.deepEqual(document,before);
 const out=await executeRoutedOpenAction(engine,document,{eventId:'a3-routed-mark',args}),after=applyPatches(document,out.patches);
 assert.equal(out.routing.routed,'open:leave_mark');assert.equal(after.state.created[out.receipt.mark.entity].intent,args.effects[0].facts.intent);
 assert.equal(after.state.minute,before.state.minute+engine.world.openActionRules.mark.minutes);
 assert.equal(out.receipt.fallback.originalIntentFulfilled,false);assert.deepEqual(after.ledger.accounts,before.ledger.accounts);
 const duplicate=await executeRoutedOpenAction(engine,after,{eventId:'a3-routed-mark',args});assert.equal(duplicate.receipt.duplicate,true);assert.deepEqual(duplicate.patches,[]);
});

test('A3 open: primitive learning subject routes to real timed practice without injecting slot extraction',async()=>{
 const engine=new WorldEngine(structuredClone(world)),document=withLedger(engine,engine.createCharacter(seed,{},'a3-route-practice')).document;
 const action=engine.world.actionDefinitions.actions.find(a=>a.id==='core:practice.session');assert.ok(action);
 // Isolate this authored program from other catalogue candidates; all source,
 // learning, body and time writers remain the real engine's implementations.
 engine.world.actionDefinitions={format:1,actions:[action]};
 const skill='skill_light';assert.ok(engine.byId.has(skill));document.state.skills[skill]={proficiency:0};
 const input={eventId:'a3-learn-route',args:{intent:action.label,means:{minutes:120},effects:[{op:'learn',entity:'player',subject:skill,learningSource:'practice',amount:99999}]}},before=structuredClone(document);
 const preview=await executeRoutedOpenAction(engine,document,input,undefined,{preview:true});
 assert.equal(preview.routing.routed,action.id);assert.deepEqual(document,before);
 const out=await executeRoutedOpenAction(engine,document,input),after=applyPatches(document,out.patches);
 assert.equal(out.routing.slots.skill,skill);assert.equal(after.state.minute,before.state.minute+120);
 assert.ok(after.state.skills[skill].proficiency>before.state.skills[skill].proficiency);
 assert.ok(after.state.skills[skill].proficiency-before.state.skills[skill].proficiency<99999);
 assert.deepEqual(auditLedger(after.ledger),[]);
 const duplicate=await executeRoutedOpenAction(engine,JSON.parse(JSON.stringify(after)),input);
 assert.equal(duplicate.result.receipt.duplicate,true);assert.deepEqual(duplicate.patches,[]);
});

test('A3 open: a fully exhausted reward bound offers a trace instead of an empty executable plan',async()=>{
 const f=fixture(),native={...f.native,limits:()=>({actor:'player',sourceFor:()=>({id:'native:heal',stage:0,time:1,bounds:{delta:4},rewardFields:['delta'],dailyCap:4}),usage:{repeats:0,produced:4}})};
 const args={intent:'xyzzy',effects:[{op:'vital',target:'player',delta:4,type:'healing'}]},before=structuredClone(f.document);
 const plan=prepareOpenAction(f.engine,f.document,args,native);
 assert.equal(plan.status,'needs_alternative');assert.deepEqual(plan.effects,[]);assert.ok(plan.trimmed.length);
 assert.equal(plan.fallback.action,'open:leave_mark');assert.ok(plan.fallback.reason);assert.equal(plan.fallback.intent,args.intent);
 const out=await executeRoutedOpenAction(f.engine,f.document,{args,eventId:'a3-empty-cap'},native);
 assert.equal(out.receipt.status,'not_submitted');assert.deepEqual(out.receipt.applied,[]);assert.deepEqual(f.document,before);
});
