// 06 §§6.3/6.5/6.8: bind existing references, retain real ambiguity and
// distinguish a request from the program which would complete it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {canonicalActionId,loadActionRegistry,catalogRow} from '../server-plugin/action-registry.mjs';
import {applySummon} from '../server-plugin/summons.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'a3-r8-references');
 document.state.location='bld_hw_school';document.state.minute=600;
 return {engine,document};
}

test('A3 references: local descriptions bind declared names only; missing and duplicate areas remain questions',()=>{
 const {engine,document}=fixture(),place=engine.byId.get(document.state.location);
 place.zones=[{id:'zone_wall',name:'墙根'},{id:'zone_secret',name:'暗室',private:true}];
 const before=structuredClone(document),context=createRoutingContext(engine,document);
 const proposal={intent:'将陶罐搬到旁边墙根',effects:[{op:'move',entity:'self',to:'旁边墙根',mode:'walk'}]};
 const resolved=resolveProposalEntities(proposal,context);
 assert.deepEqual(resolved.ambiguities,[]);assert.equal(resolved.proposal.effects[0].to,'zone_wall');
 assert.equal(context.resolveDestination('眼前相邻墙根').value,'zone_wall');
 assert.equal(context.resolve('暗室').value,null);assert.deepEqual(context.resolve('暗室').candidates,[]);
 assert.equal(context.resolveDestination('旁边没有登记的空位').value,null);
 place.zones.push({id:'zone_second_wall',name:'墙根'});
 const ambiguous=resolveProposalEntities(proposal,createRoutingContext(engine,document));
 assert.equal(ambiguous.ambiguities.length,1);assert.equal(ambiguous.ambiguities[0].candidates.length,2);
 assert.deepEqual(document,before);
});

test('A3 references: owned descriptive item and full account references retain ownership and ambiguity',()=>{
 const {engine,document}=fixture();
 document.state.inventory.item_clay_pot={quantity:1};
 const name=engine.byId.get('item_clay_pot').name,context=createRoutingContext(engine,document);
 assert.equal(context.resolve(`本人在场的唯一${name}`).value,'item_clay_pot');
 assert.equal(context.resolve('self|item_clay_pot|inventory').value,'player|item_clay_pot|inventory');
 delete document.state.inventory.item_clay_pot;
 assert.equal(createRoutingContext(engine,document).resolve(`本人在场的唯一${name}`).value,null);
});

test('A3 references: known map names permit travel only, duplicate known names never choose a destination',()=>{
 const {engine,document}=fixture();document.state.location='loc_hw_gate';
 document.state.discoveries.loc_bs={minute:600,source:'亲历'};
 const name=engine.byId.get('loc_bs').name,context=createRoutingContext(engine,document);
 assert.equal(context.resolveDestination(name).value,'loc_bs');assert.equal(context.resolve(name).value,null);
 const proposal={intent:`沿路去${name}`,target:name,effects:[{op:'move',entity:'self',to:name,mode:'walk'}]};
 assert.equal(prepareOpenAction(engine,document,proposal).routed,'core:move');
 const other=engine.world.locations.find(row=>row.mapHierarchy&&row.id!=='loc_bs'&&row.id!=='loc_hw_gate');
 assert.ok(other);const originalName=other.name;other.name=name;document.state.discoveries[other.id]={minute:600,source:'亲历'};
 assert.equal(createRoutingContext(engine,document).resolveDestination(name).candidates.length,2);
 other.name=originalName;
 delete document.state.discoveries.loc_bs;delete document.state.discoveries[other.id];
 assert.equal(createRoutingContext(engine,document).resolveDestination(name).value,null);
});

test('A3 references: an actually summoned owned local spirit routes dismissal; no instance is inferred from prose',async()=>{
 const {engine,document}=fixture(),draft=engine.primitiveDraft(document),spell=engine.byId.get('spell_summon_04');
 assert.ok(spell);const result=applySummon.call(engine,draft,{catalog:spell,spec:spell.effectSpec,args:{target:'player'}},'r8-spirit');
 assert.equal(result.summon,'r8-spirit');
 const present=applyPatches(document,draft.patches),before=structuredClone(present),name=spell.name;
 const proposal={intent:'解除契约让役灵和平离开',target:`本人在场的唯一${name}`,effects:[{op:'obligation.cancel',id:'真实维持契约',reason:'peaceful_dismissal'},{op:'transition',entity:`本人在场的唯一${name}`,kind:'gone',cause:'contract_ended'}]};
 const plan=prepareOpenAction(engine,present,proposal);
 assert.equal(plan.routed,'core:summon.dismiss');assert.equal(plan.slots.summon,'r8-spirit');
 const out=await engine.reduce(present,{tool:'world_propose',eventId:'r8-dismiss',args:proposal});
 const after=applyPatches(present,out.patches);
 assert.equal(after.state.effects['r8-spirit'],undefined);
 assert.equal(after.state.records['summon_contract:r8-spirit'].status,'和平解离');
 assert.deepEqual(present,before);
 assert.equal(prepareOpenAction(engine,document,proposal).status,'needs_entities');
 const remote=structuredClone(present);remote.state.effects['r8-spirit'].location='loc_bs';
 assert.equal(createRoutingContext(engine,remote).resolve('r8-spirit').reason,'not_present');
 const duplicate=structuredClone(present);duplicate.state.effects['r8-second']={...duplicate.state.effects['r8-spirit']};
 assert.equal(createRoutingContext(engine,duplicate).resolve(`本人在场的唯一${name}`).candidates.length,2);
});

test('A3 references: translating offered terms preserves the request and cannot find an interpreter or accept a sale',async()=>{
 const {engine,document}=fixture(),interpreter='npc_hw_shendu',buyer='npc_hw_yanzhe';
 for(const id of [interpreter,buyer])Object.assign(document.state.npcs[id],{location:document.state.location,status:'正常',activity:'闲逛',scheduleTravel:null,cognitionTravel:null});
 const before=structuredClone(document),terms={speaker:buyer,listener:'self',goods:'item_clay_cup',quantity:2};
 const proposal={intent:'请现场通译先翻译买家的条款，等我另行确认',target:interpreter,effects:[{op:'emit',actor:'self',target:interpreter,verb:'request',visibility:'present',payload:{kind:'translate_terms',terms}}]};
 const plan=prepareOpenAction(engine,document,proposal);assert.equal(plan.status,'open');
 const out=await engine.reduce(document,{tool:'world_propose',eventId:'r8-translate',args:proposal});
 const receipt=out.result.receipt;
 assert.equal(receipt.source.id,'open:proposal');
 const request=receipt.applied.find(row=>row.op==='emit');assert.equal(request.payload.kind,'translate_terms');assert.deepEqual(request.payload.terms,terms);
 assert.equal(receipt.applied.some(row=>row.op==='transfer'||row.op==='obligation.create'),false);
 const after=applyPatches(document,out.patches);assert.notEqual(after.state.dialogues?.[interpreter]?.action,'interpreter');
 assert.deepEqual(document,before);
});

test('A3 route names: the directory owns practice normalization, while food preparation and guide commitments stay distinct',()=>{
 const registry=loadActionRegistry();assert.deepEqual(registry.errors,[]);
 assert.equal(canonicalActionId(registry,'core:practice.session'),'core:practice');
 assert.equal(canonicalActionId(registry,'practice.session'),'core:practice');
 assert.equal(catalogRow(registry.byId.get('core:practice.session')).canonical,'core:practice');
 assert.notEqual(canonicalActionId(registry,'core:wildlife.eat'),canonicalActionId(registry,'core:eat.meal'));
 assert.notEqual(canonicalActionId(registry,'core:dialogue.guide'),canonicalActionId(registry,'core:dialogue.guide_request'));
});

test('A3 references: an explicit enemy reference binds the single local agent; generic guard and several agents require clarification',()=>{
 const {engine,document}=fixture();document.state.location='loc_hw_northwood';
 for(const row of Object.values(document.state.npcs))row.location='loc_bs';
 document.state.npcs.npc_hw_wushuo.location=document.state.location;
 const proposal={intent:'眼前的对手举刀了，用木杖防守',means:{manner:'guard'},effects:[{op:'status',target:'self',status:'combat_defense',duration:1,magnitude:1}]};
 let plan=prepareOpenAction(engine,document,proposal);
 assert.equal(plan.routed,'core:combat');assert.equal(plan.slots.target,'npc_hw_wushuo');assert.equal(plan.slots.intent,'defend');
 plan=prepareOpenAction(engine,document,{...proposal,intent:'用木杖防守'});assert.deepEqual(plan.needsSlots.missing,['target']);
 document.state.npcs.npc_hw_ayan.location=document.state.location;
 plan=prepareOpenAction(engine,document,proposal);assert.deepEqual(plan.needsSlots.missing,['target']);
 document.state.npcs.npc_hw_ayan.location='loc_bs';
 const retreat={...proposal,intent:'不跟面前的敌人打了，沿小路脱离',means:{manner:'retreat'},effects:[{op:'move',entity:'self',to:'身后可通行小路',mode:'disengage'}]};
 plan=prepareOpenAction(engine,document,retreat);assert.equal(plan.routed,'core:combat');assert.equal(plan.slots.target,'npc_hw_wushuo');assert.equal(plan.slots.intent,'flee');
});

test('A3 references: material descriptions resolve the same real stock for transfer and mark, and cannot manufacture missing materials',async()=>{
 const {engine,document}=fixture();document.state.inventory.item_stone={quantity:1,quality:'木',durability:100};
 const description=`本人携带的唯一${engine.byId.get('item_stone').name}`;
 const proposal={intent:'用自己的石子留下纪念',effects:[{op:'transfer',resource:description,from:'self',to:'sink:consume',qty:1},{op:'create',kind:'mark',tags:['mark:memorial'],facts:{intent:'留下纪念',form:'石子摆成的纪念物'},materials:[{resource:description,qty:1}]}]};
 const before=structuredClone(document),resolved=resolveProposalEntities(proposal,createRoutingContext(engine,document),{accounts:true});
 assert.deepEqual(resolved.ambiguities,[]);assert.equal(resolved.proposal.effects[0].resource,'item_stone');assert.equal(resolved.proposal.effects[1].materials[0].resource,'item_stone');
 const out=await engine.reduce(document,{tool:'world_propose',eventId:'r8-material',args:proposal}),after=applyPatches(document,out.patches);
 assert.equal(engine.quantity(engine.primitiveDraft(after),'player','item_stone'),0);
 assert.ok(out.result.receipt.applied.some(row=>row.op==='create'&&row.kind==='mark'));
 assert.deepEqual(document,before);
 const missing=structuredClone(proposal);missing.effects[0].resource='本人携带的唯一一束野花';missing.effects[1].materials[0].resource=missing.effects[0].resource;
 const clarification=resolveProposalEntities(missing,createRoutingContext(engine,document),{accounts:true});
 assert.equal(clarification.ambiguities.length,2);assert.deepEqual(clarification.ambiguities.map(row=>row.candidates),[[],[]]);
 assert.equal(prepareOpenAction(engine,document,missing).status,'needs_entities');assert.deepEqual(document,before);
});
