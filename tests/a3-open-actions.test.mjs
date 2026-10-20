import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withLedger,accountKey,auditLedger,parseAccount} from '../server-plugin/ledger.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {prepareOpenAction,executeRoutedOpenAction} from '../server-plugin/open-actions.mjs';
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
 engine.world.actionDefinitions={format:1,actions:[action]};
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
 await assert.rejects(executeRoutedOpenAction(f.engine,f.document,input,f.native),{code:'E-TRANSFER-BALANCE'});
});
test('A3 open: missing slots and unmatched plans never pretend effects were submitted',async()=>{
 const f=fixture(),input={args:f.args,eventId:'a3-b-needs-slot'},native={...f.native,routing:{...f.native.routing,slotsFor:()=>({})}};
 const waiting=await executeRoutedOpenAction(f.engine,f.document,input,native);
 assert.equal(waiting.prepared.status,'needs_slots');assert.equal(waiting.receipt.status,'not_submitted');assert.deepEqual(waiting.receipt.applied,[]);
 const proposal={intent:'在门旁做一件奇怪的小东西',effects:[{op:'create',kind:'item',facts:{quantity:99}}]};
 const plan=prepareOpenAction(f.engine,f.document,proposal,{...f.native,limits:()=>({actor:'player',sourceFor:()=>null})});
 assert.equal(plan.status,'needs_alternative');assert.deepEqual(plan.effects,[]);assert.equal(plan.fallback.available,false);
});
