import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {useTool,wearItem,validatePhysicalAction,writePhysicalItem,consumeLiquid} from '../server-plugin/items.mjs';
import {ActionRejection} from '../server-plugin/action-rejection.mjs';
import {mapKnowledge} from '../server-plugin/map-state.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,scene,monthDayMinute,primed,stack,tool,held,conserved} from './helpers/daily-b2.mjs';

const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const home='bld_hw_qingdeng';
function fixture(change=()=>{}){
 const world=variant(change),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'domain-properties');
 return {world,engine,document};
}
function rejection(fn,pattern){
 assert.throws(fn,error=>{
  assert.ok(error instanceof ActionRejection);assert.match(error.message,pattern);
  assert.ok(error.missing.length);assert.ok(error.repair.length);return true;
 });
}

test('invalid or unavailable liquid portions are typed business rejections with no stock or time changes',()=>{
 const f=fixture(),d=f.engine.primitiveDraft(f.document),before=structuredClone(d.document);
 for(const quantity of [0,-1,1.5])rejection(()=>consumeLiquid(d,f.engine,'missing','water',quantity),/正整数/);
 rejection(()=>consumeLiquid(d,f.engine,'missing','water',1),/没有足量/);
 assert.deepEqual(d.patches,[]);assert.deepEqual(d.document,before);
});

for(const use of ['grip','unlock','soil_work','harvest']){
 test(`use ${use} follows tags, not item ID; broken and unknown tools refuse without mutation`,()=>{
  const f=fixture(w=>{for(const id of ['item_staff','item_hoe'])w.items.find(x=>x.id===id).tags=[use];});
  for(const id of ['item_staff','item_hoe']){
   const doc=structuredClone(f.document);doc.state.inventory={[id]:tool()};
   const d=f.engine.primitiveDraft(doc);assert.equal(useTool(d,f.engine,use),id);assert.deepEqual(d.patches,[]);
   doc.state.inventory[id].durability=0;
   rejection(()=>useTool(f.engine.primitiveDraft(doc),f.engine,use),new RegExp(use));
   doc.state.inventory[id]={...tool(),tags:[]};
   rejection(()=>useTool(f.engine.primitiveDraft(doc),f.engine,use),new RegExp(use));
  }
  const old=fixture(w=>{delete w.items.find(x=>x.id==='item_staff').tags;});
  old.document.state.inventory={item_staff:tool()};
  const before=structuredClone(old.document),d=old.engine.primitiveDraft(old.document);
  rejection(()=>useTool(d,old.engine,use),/用途未知/);
  assert.deepEqual(d.document,before);assert.deepEqual(d.patches,[]);
 });
}

test('tool choice and wear use the same first intact owned instance; empty stock cannot supply a tool',()=>{
 const f=fixture(w=>{w.items.find(x=>x.id==='item_staff').tags=['soil_work'];});
 f.document.state.inventory={item_staff:{...tool(),quantity:2,instances:['broken','intact']}};
 f.document.state.itemInstances={broken:{id:'broken',item:'item_staff',owner:'player',status:'持有',durability:0},intact:{id:'intact',item:'item_staff',owner:'player',status:'持有',durability:25}};
 const d=f.engine.primitiveDraft(f.document),id=useTool(d,f.engine,'soil_work');wearItem(d,f.engine,'player',id,1);
 assert.equal(d.get('state','itemInstances','intact','durability'),24);
 assert.equal(d.get('state','itemInstances','broken','durability'),0);
 const empty=structuredClone(f.document);empty.state.inventory.item_staff.quantity=0;
 rejection(()=>useTool(f.engine.primitiveDraft(empty),f.engine,'soil_work'),/soil_work/);
});

for(const [operation,use,facts] of [
 ['unlock','unlock',{mechanism:'mechanical_lock',locked:true}],
 ['disarm','grip',{mechanism:'tripwire_falling_log',armed:true,identified:true}],
])test(`${operation}: different IDs with the same use have identical native checks, time and stock effects`,async()=>{
 const results=[];
 for(const item of ['item_iron_wire','item_staff']){
  const f=fixture(w=>{const original=w.items.find(x=>x.id==='item_iron_wire'),row=w.items.find(x=>x.id===item);Object.assign(row,{tags:[use],checkBonus:original.checkBonus,quality:original.quality});});
  const setup=applyIntentSetup(f.engine,f.document,{location:home,inventory:{[item]:1},objects:[{id:'mechanism',template:'thing',kind:'node',name:'mechanism',owner:'player',location:home,carriedBy:'player',...facts}]});
  assert.deepEqual(setup.setupUnmet,[]);
  const input={tool:'environment',eventId:'same-mechanism-work',args:{operation,target:setup.bindings.mechanism}};
  const out=await f.engine.reduce(setup.document,input),after=applyPatches(setup.document,out.patches);
  assert.equal(after.state.minute-setup.document.state.minute,f.world.openActionRules.generic.physicalMinutes);
  assert.equal(held(after.state.inventory,item),held(setup.document.state.inventory,item));
  assert.equal(after.state.inventory[item].durability,setup.document.state.inventory[item].durability);
  const {die,total,difficulty,success}=out.result;assert.ok(Number.isFinite(die));assert.ok(Number.isFinite(total));results.push({die,total,difficulty,success});
  conserved(setup.document,after,operation,f.engine);
  const bad=structuredClone(setup.document);bad.state.inventory[item].tags=[];
  await assert.rejects(f.engine.reduce(bad,input),e=>e instanceof ActionRejection&&e.code==='E-ACTION-TOOL');
  bad.state.inventory[item].tags=[use];bad.state.inventory[item].durability=0;
  await assert.rejects(f.engine.reduce(bad,input),e=>e instanceof ActionRejection&&e.code==='E-ACTION-TOOL');
 }
 assert.deepEqual(results[0],results[1]);
});

test('repair rejects structural damage and gate scale with missing tools/process and a feasible alternative, without time or effects',()=>{
 const f=fixture();
 for(const facts of [{material:'stone',scale:'whole_city_gate',condition:40},{material:'wood',damage:{kind:'cracked_body'},condition:60}]){
  const out=applyIntentSetup(f.engine,f.document,{location:home,objects:[{id:'repair-target',template:'thing',kind:'building',name:'repair-target',location:home,...facts}]});
  assert.deepEqual(out.setupUnmet,[]);const d=f.engine.primitiveDraft(out.document),before=structuredClone(d.document);
  rejection(()=>validatePhysicalAction(d,f.engine,'repair',{instance:out.bindings['repair-target']}),/不能.*瞬间复原/);
  assert.deepEqual(d.patches,[]);assert.deepEqual(d.document,before);
 }
 // A material override cannot silently inherit a process for another material.
 // Stone itself is no longer a blacklist: a catalogue with that material and
 // a registered process may proceed to the existing tool/material/time checks.
 const d=f.engine.primitiveDraft(f.document);writePhysicalItem(d,f.engine,'item_staff',{material:'stone'});
 rejection(()=>validatePhysicalAction(d,f.engine,'repair',{item:'item_staff'}),/stone.*材质/);
 f.engine.byId.get('item_staff').material='stone';
 assert.doesNotThrow(()=>validatePhysicalAction(d,f.engine,'repair',{item:'item_staff'}));
 const faulty={...f.engine,resolve(){throw new TypeError('broken connector');}};
 assert.throws(()=>validatePhysicalAction(d,faulty,'repair',{item:'item_staff'}),TypeError);
});

test('transit is a known real junction: no hidden stops, parallel-edge fiction, or authored-list fallback',()=>{
 const locations=['a','b','junction','hidden','single','fake'].map(id=>({id,name:id,...(['a','b'].includes(id)?{mapHierarchy:[]}:{} )}));
 const routes=[['a','junction'],['junction','b'],['a','hidden'],['hidden','b'],['a','single'],['a','single']].map(([from,to],i)=>({id:`r${i}`,from,to}));
 const engine={world:{locations,routes,domainRules:{map:{transitPlaces:['fake']}}},resolver:{mentions:()=>[]}};
 const document={state:{location:'a',minute:10,discoveries:{junction:{minute:1},single:{minute:1},fake:{minute:1},hidden:{minute:11}}},memories:{}};
 let map=mapKnowledge(engine,document);
 assert.ok(map.known.has('junction'));for(const id of ['hidden','single','fake'])assert.equal(map.known.has(id),false,id);
 document.state.discoveries.hidden={minute:1,private:true,knownBy:['npc_any']};assert.equal(mapKnowledge(engine,document).known.has('hidden'),false);
 document.state.discoveries.hidden={minute:1};assert.ok(mapKnowledge(engine,document).known.has('hidden'));
 engine.world.routes=[];map=mapKnowledge(engine,document);assert.equal(map.known.has('junction'),false);
});

async function farm(t,replacement){
 const world=variant(w=>{
  delete w.rules.weather;w.rules.agriculture.crop.growthDays=2;w.rules.agriculture.crop.sowDays=[0,359];
  w.rules.agriculture.settlements.find(x=>x.settlement==='loc_hw').farmWorkers=0;
  if(replacement){w.items.find(x=>x.id==='item_staff').tags=['soil_work'];w.items.find(x=>x.id==='item_kitchen_knife').tags=['harvest'];}
 });
 const sowTool=replacement?'item_staff':'item_hoe',harvestTool=replacement?'item_kitchen_knife':'item_sickle';
 const ui=await uiSession(t,{world,mutate:scene('loc_hw_fields',monthDayMinute(1,8,8),s=>{
  s.buildings.loc_hw_fields={...s.buildings.loc_hw_fields,owner:'player',condition:100};
  s.inventory.item_oats=stack(20);s.inventory[sowTool]=tool();s.inventory[harvestTool]=tool();
 })});
 const before=await primed(ui),sow=await ui.choose('farm.private_sow',{areaMu:2},{search:true,eventId:'domain-sow'});
 assert.ok(sow.ok,sow.error);const sown=await ui.read();
 assert.equal(before.state.inventory[sowTool].durability-sown.state.inventory[sowTool].durability,1);
 assert.equal(sow.result.laborMinutes,480);conserved(before,sown,'sow',new WorldEngine(world));
 assert.ok((await ui.choose('time',{minutes:3*1440})).ok);
 const ripe=await ui.read(),harvest=await ui.choose('farm.private_harvest',{},{search:true,eventId:'domain-harvest'});
 assert.ok(harvest.ok,harvest.error);const after=await ui.read();
 assert.equal(ripe.state.inventory[harvestTool].durability-after.state.inventory[harvestTool].durability,1);
 assert.equal(harvest.result.laborMinutes,960);conserved(ripe,after,'harvest',new WorldEngine(world));
 return {seed:held(before.state.inventory,'item_oats')-held(sown.state.inventory,'item_oats'),yield:harvest.result.harvested,sowTime:sown.state.minute-before.state.minute,harvestTime:after.state.minute-ripe.state.minute,
  seedFlow:sown.ledger.flows['sink:consume|item_oats|private_sow'],harvestFlow:after.ledger.flows['src:regrowth|item_oats|private_harvest']};
}
test('substitute farming tools preserve real seed/grain ledgers, work time, harvest yield and tool wear',async t=>{
 const original=await farm(t,false),substitute=await farm(t,true);assert.deepEqual(substitute,original);
 assert.equal(original.seed,4);assert.equal(original.seedFlow,4);assert.equal(original.harvestFlow,original.yield);
});
