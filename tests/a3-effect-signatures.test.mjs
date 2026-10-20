import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {ActionBuilder} from '../extension/action-builder.mjs';
import {fixedUnits,fixedNumber} from '../server-plugin/rx.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'a3-effects-regression');
 Object.assign(document.state,{location:'bld_hw_mill',minute:600});
 document.state.player.coins=100;
 document.state.inventory={item_wood:{quantity:2,quality:'木',durability:100,weight:1},item_whittling_knife:{quantity:1,quality:'木',durability:80,weight:.2}};
 document.state.skills.skill_life_6_core={proficiency:100,daily:{},breakthroughs:[]};
 document.state.recipes.recipe_wooden_pegs={learnedAt:600};
 document.ledger=openLedger(engine,document);
 return {engine,document};
}
const craft=(batches,id)=>({tool:'world_act',eventId:id,args:{action:'core:craft.manufacture',slots:{recipe:'recipe_wooden_pegs',batches}}});
function books(engine,document){
 assert.deepEqual(auditLedger(document.ledger),[]);
 const projected=openLedger(engine,document);
 for(const key of new Set([...Object.keys(projected.accounts),...Object.keys(document.ledger.accounts)]))assert.equal(document.ledger.accounts[key]??0,projected.accounts[key]??0,key);
}

test('A3 manufacturing: requested batches clip to actual stock, every successful main/byproduct unit is booked once',async()=>{
 const {engine,document}=fixture(),input=craft(10,'batch-limited'),snapshot=structuredClone(document);
 const preview=await engine.previewAction(document,input);
 assert.deepEqual(document,snapshot);
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches),result=out.result,r=result.receipt;
 assert.equal(result.requestedBatches,10);assert.equal(result.batches,2);assert.equal(result.clipped,8);
 assert.equal(result.results.length,2);assert.equal(after.state.minute,640);
 assert.equal(engine.quantity(engine.primitiveDraft(after),'player','item_wood'),0);assert.equal(after.state.inventory.item_whittling_knife.durability,78);
 assert.equal(after.state.player.coins,96);assert.equal(result.spent.feePaid,4);
 const successes=result.results.filter(row=>row.success).length;
 assert.equal(result.cost.time,40);assert.equal(result.cost.body.stamina.asOf,640);
 assert.equal(result.healthDelta,after.state.player.hp-document.state.player.hp);
 assert.equal(r.check.kind,'batches');assert.deepEqual(r.check.batches.map(row=>row.success),result.results.map(row=>row.success));
 assert.equal(after.state.inventory.item_wooden_peg?.quantity??0,successes*4);
 assert.equal(after.state.inventory.item_wood_shavings?.quantity??0,successes);
 assert.equal(result.instances.length,successes*5);assert.equal(new Set(result.instances).size,result.instances.length);
 for(const resource of ['item_wooden_peg','item_wood_shavings']){
  const quantity=after.state.inventory[resource]?.quantity??0;
  assert.equal(r.applied.filter(e=>e.op==='transfer'&&e.resource===resource&&e.from.startsWith('src:craft|')).reduce((n,e)=>n+e.qty,0),quantity);
 }
 assert.equal(r.cost.resources.length,2);assert.ok(r.cost.resources.every(e=>e.role==='additional_cost'&&e.qty===2));
 assert.equal(r.trimmed.find(row=>row.slot==='batches').applied,2);
 assert.deepEqual(preview.receipt.applied,r.applied);assert.deepEqual(preview.receipt.check,r.check);books(engine,after);
 const retry=await engine.reduce(after,input);assert.deepEqual(retry.patches,[]);assert.equal(retry.result.receipt.duplicate,true);
});

test('A3 manufacturing: both successful and failed batches preserve actual stock and the registered failure rules',async()=>{
 const {engine,document}=fixture();
 const observed=new Set();
 for(let i=0;i<40&&observed.size<2;i++){
  const out=await engine.reduce(document,craft(1,`batch-outcome-${i}`)),after=applyPatches(document,out.patches),result=out.result;
  observed.add(result.success);
  assert.equal(after.state.inventory.item_wood.quantity,1);assert.equal(after.state.player.coins,98);
  assert.equal(after.state.inventory.item_wooden_peg?.quantity??0,result.success?4:0);
  assert.equal(after.state.inventory.item_wood_shavings?.quantity??0,result.success?1:0);
  assert.equal(result.produced.length,result.success?2:0);books(engine,after);
 }
 assert.deepEqual([...observed].sort(),[false,true]);
 const empty=structuredClone(document);empty.state.inventory.item_wood.quantity=0;empty.ledger=openLedger(engine,empty);
 const snapshot=structuredClone(empty);await assert.rejects(engine.reduce(empty,craft(10,'batch-empty')),/不足/);assert.deepEqual(empty,snapshot);
});

test('A3 rest: awake rest recovers body needs at the registered rate and retains rest mode',async()=>{
 const {engine,document}=fixture();document.state.player.body={stamina:{value:60,asOf:600,activity:'rest'},fatigue:{value:40,asOf:600,activity:'rest'}};
 const out=await engine.reduce(document,{tool:'world_act',eventId:'awake-rest',args:{action:'core:time.rest',slots:{minutes:60}}}),after=applyPatches(document,out.patches),r=out.result.receipt;
 assert.equal(readBodyNeed(engine,after,'player','stamina'),67.2);assert.equal(readBodyNeed(engine,after,'player','fatigue'),28);
 assert.equal(r.applied.find(e=>e.op==='time').mode,'rest');
 for(const need of ['stamina','fatigue'])assert.equal(r.applied.find(e=>e.op==='vital'&&e.need===need).delta,fixedNumber(fixedUnits(readBodyNeed(engine,after,'player',need))-fixedUnits(readBodyNeed(engine,document,'player',need))));
 books(engine,after);
});

test('A3 research inception: receipt identifies the real project, without granting unearned knowledge',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document.state.skills);
 const out=await engine.reduce(document,{tool:'world_act',eventId:'research-inception',args:{action:'core:research',slots:{operation:'start',name:'木柄研究',concept:'耐用性',skills:['skill_life_6_core']}}}),after=applyPatches(document,out.patches);
 const created=out.result.receipt.applied.find(e=>e.op==='create');assert.ok(created);assert.equal(created.entity,out.result.project);assert.equal(created.kind,'project');
 assert.deepEqual(created.result.after,after.state.projects[created.entity]);assert.equal(created.result.after.stage,'构想');assert.equal(created.result.after.progress,0);
 assert.deepEqual(after.state.skills,before);assert.ok(!out.result.receipt.applied.some(e=>e.op==='learn'));books(engine,after);
});

test('A3 builder: structured target and consent request survive, boolean impersonation remains prohibited',()=>{
 const {engine,document}=fixture(),action=worldActions(engine.scoped(document),document,{query:'open:proposal'}).actions.find(a=>a.id==='open:proposal');
 const builder=new ActionBuilder({});builder.choose(action);
 builder.setSlot('target','player');builder.setSlot('consent',{from:'player',scope:'trade',onRefusal:'abort'});
 assert.equal(builder.slots.target,'player');assert.deepEqual(builder.slots.consent,{from:'player',scope:'trade',onRefusal:'abort'});
 const native=new ActionBuilder({});native.choose({id:'test',slots:[{name:'consent',kind:'boolean',consent:true}]});
 assert.throws(()=>native.setSlot('consent',true),/没有此项选择/);
});

test('A3 bank receipts: deposit liability and partial withdrawal match the native bank balance with no duplicate debt',async()=>{
 const {engine,document}=fixture(),keeper='npc_hw_shendu';
 document.state.location='bld_hw_post';document.state.player.coins=200;
 Object.assign(document.state.npcs[keeper],{location:'bld_hw_post',activity:'营业',status:'正常',scheduleTravel:null,cognitionTravel:null});
 engine.byId.get(keeper).schedule={default:[{start:0,end:1440,location:'bld_hw_post',activity:'营业',services:[]}]};
 document.ledger=openLedger(engine,document);
 const input={tool:'world_act',eventId:'deposit-claim',args:{action:'core:trade.deposit',slots:{seller:keeper,coins:101}}};
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches),r=out.result.receipt,claim=r.applied.find(e=>e.op==='obligation.create');
 assert.ok(claim);assert.equal(claim.obligationKind,'deposit');assert.equal(claim.from,out.result.bank);assert.equal(claim.to,'player');
 assert.equal(claim.amount,100);assert.equal(claim.result.after,after.state.records[out.result.bank].accounts.player);
 assert.equal(after.state.player.coins,99);assert.equal(r.applied.filter(e=>e.op==='transfer').reduce((n,e)=>n+e.qty,0),101);
 const withdrawal=await engine.reduce(after,{tool:'world_act',eventId:'withdraw-claim',args:{action:'core:trade.withdraw',slots:{seller:keeper,coins:25}}}),withdrawn=applyPatches(after,withdrawal.patches);
 const settled=withdrawal.result.receipt.applied.find(e=>e.op==='obligation.settle');
 assert.equal(settled.id,claim.id);assert.equal(settled.amount,25);assert.equal(settled.result.after,75);assert.equal(withdrawn.state.player.coins,124);
 assert.equal(Object.values(withdrawn.state.obligations??{}).filter(row=>row.kind==='deposit').length,0);
 books(engine,after);books(engine,withdrawn);
 const duplicate=await engine.reduce(after,input);assert.deepEqual(duplicate.patches,[]);
});

test('A3 spell receipts: drying, illumination and summon/upkeep describe actual native writes, including mana and practice',async()=>{
 for(const spell of ['spell_fire_03','spell_light','spell_summon_05']){
  const {engine,document}=fixture(),definition=engine.byId.get(spell),target=spell==='spell_fire_03'?'item_clothes':spell==='spell_light'?'item_staff':'player';
  document.state.player.mp=80;document.state.player.maxMp=80;
  document.state.spells[spell]={learnedAt:600};document.state.skills[definition.skill]={proficiency:100,daily:{},breakthroughs:[]};
  if(target!=='player')document.state.inventory[target]={quantity:1,quality:'木',durability:80,moisture:20,weight:1};
  document.ledger=openLedger(engine,document);
  let out;
  for(let i=0;i<40;i++){out=await engine.reduce(document,{tool:'world_act',eventId:`effect-${spell}-${i}`,args:{action:'core:cast',slots:{spell,target}}});if(out.result.success)break;}
  assert.equal(out.result.success,true,spell);
  const after=applyPatches(document,out.patches),r=out.result.receipt;
  assert.equal(r.applied.find(e=>e.op==='vital'&&e.need==='mp').delta,after.state.player.mp-document.state.player.mp);
  assert.ok(r.applied.some(e=>e.op==='learn'&&e.subject===definition.skill));
  if(spell==='spell_fire_03'){
   const fact=r.applied.find(e=>e.op==='fact.set'&&e.field==='moisture');assert.ok(fact);assert.equal(fact.value,after.state.inventory[target].moisture);assert.equal(20-fact.value,out.result.dried);
  }else if(spell==='spell_light'){
   const status=r.applied.find(e=>e.op==='status'&&e.target===target);assert.equal(status.status,'light');assert.deepEqual(status.result.after,after.state.effects[out.result.effect]);
  }else{
   const created=r.applied.find(e=>e.op==='create'),upkeep=r.applied.find(e=>e.op==='obligation.create');
   assert.equal(created.entity,out.result.summon);assert.equal(created.kind,'creature');assert.deepEqual(created.result.after,after.state.effects[out.result.summon]);
   assert.equal(upkeep.to,created.entity);assert.equal(upkeep.obligationKind,'upkeep');assert.deepEqual(upkeep.result.after,after.state.records[out.result.contract]);
   assert.ok(!r.applied.some(e=>e.op==='status'&&e.status==='summon'));
  }
  books(engine,after);
 }
});

test('A3 shove: the shield probe never damages the opponent',async()=>{
 const {engine,document}=fixture(),target='npc_hw_linsui';
 document.state.location='bld_hw_qingdeng';document.state.player.hp=1000;document.state.player.maxHp=1000;
 Object.assign(document.state.npcs[target],{location:'bld_hw_qingdeng',hp:1000,maxHp:1000,status:'正常'});
 document.ledger=openLedger(engine,document);
 const out=await engine.reduce(document,{tool:'world_combat',eventId:'shove-without-damage',args:{target,intent:'shove'}}),after=applyPatches(document,out.patches);
 assert.equal(out.result.damage,0);assert.equal(after.state.npcs[target].hp,1000);
 assert.ok(!out.result.receipt.applied.some(e=>e.op==='vital'&&e.target===target&&e.delta<0));books(engine,after);
});
