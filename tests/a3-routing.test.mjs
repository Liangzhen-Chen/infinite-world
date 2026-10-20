import {assertActionRejected} from './helpers/action-refusal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAction,effectSignature,signatureJaccard,createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import fs from 'node:fs/promises';
import {localWeather} from '../server-plugin/weather.mjs';
const kindOf=id=>id==='player'||id?.startsWith('npc_')?'person':id?.startsWith('item_')?'item':null;
const effect={op:'emit',target:'npc_one',verb:'request',visibility:'private',payload:{text:'help'}};
const action=(id,label='请求帮助')=>({id,label,synonyms:[],participants:{actor:['person'],target:['person']},visibility:{catalog:'target:npc'},slots:[{name:'target',kind:'entity',entity:'person',required:true}],outcomes:[{...effect,target:{slot:'target'}}]});
const context={actor:'player',kindOf,visible:()=>true,slotsFor:()=>({target:'npc_one'})};
const proposal={intent:'请求帮助',participants:{target:'npc_one'},effects:[effect]};
test('A3 routing: signatures are multisets of op, target kind and field/resource',()=>{
 const a=effectSignature([effect,effect],{kindOf}),b=effectSignature([{...effect,target:'npc_two'}],{kindOf});
 assert.equal(signatureJaccard(a,b),.5);assert.equal(signatureJaccard([],[]),0);
 assert.equal(signatureJaccard(b,effectSignature([{...effect,verb:'tell'}],{kindOf})),0);
});
test('A3 routing: weighted scores route to an authored definition, stable tie by id',()=>{
 const registry={actions:[action('test:z'),action('test:a')]},r=routeAction(proposal,registry,context);
 assert.equal(r.routed,'test:a');assert.equal(r.nearest.signatureScore,1);assert.ok(r.nearest.textScore>0);
 assert.equal(r.nearest.score,.6*r.nearest.signatureScore+.4*r.nearest.textScore);
 assert.deepEqual(r,routeAction(proposal,{actions:registry.actions.toReversed()},context));
});
test('A3 routing: invisible, participant mismatch and projection never become candidates',()=>{
 const hidden=action('test:hidden'),wrong={...action('test:wrong'),participants:{target:['item']}},read={...action('test:read'),projection:'inspect'};
 const r=routeAction(proposal,{actions:[hidden,wrong,read]},{...context,visible:a=>a.id!==hidden.id});
 assert.deepEqual(r.candidates,[]);assert.equal(r.routed,null);
 assert.throws(()=>routeAction(proposal,{actions:[hidden]},{kindOf}),/native visibility/);
});
test('A3 routing: matching action with missing required slots asks for completion',()=>{
 const a={...action('test:ask'),slots:[...action('x').slots,{name:'terms',kind:'text',required:true}]};
 const r=routeAction(proposal,{actions:[a]},context);assert.equal(r.routed,null);assert.deepEqual(r.needsSlots,{action:a.id,missing:['terms']});
});
test('A3 routing: text alone or identical op with unrelated text cannot force a route',()=>{
 const r=routeAction({...proposal,effects:[{op:'move',to:'loc_a'}]},{actions:[action('test:ask')]},context);
 assert.equal(r.routed,null);assert.ok(r.nearest.score<.7);
 const noText=routeAction({...proposal,intent:'xyzzy'},{actions:[action('test:ask')]},context);assert.equal(noText.routed,null);assert.equal(noText.nearest.textScore,0);
});
test('A3 routing: a complete action phrase in a long intent keeps the authored threshold',()=>{
 const candidate=action('test:help');
 const result=routeAction({...proposal,intent:'我背着木料走了一整天，现在想请求帮助，把箱子搬到门边'},{actions:[candidate]},context);
 assert.equal(result.routed,candidate.id);assert.equal(result.nearest.signatureScore,1);
 assert.ok(result.nearest.score>=.7);
 const wrong=routeAction({...proposal,intent:'我背着木料走了一整天，现在打算坐在门边喝水'},{actions:[candidate]},context);
 assert.equal(wrong.routed,null);assert.ok(wrong.nearest.score<.7);
});
test('A3 routing: source resource is part of a transfer signature; native actor cannot be spoofed',()=>{
 const coins=effectSignature([{op:'transfer',from:'player|coin_river|purse',to:'npc_one'}],{kindOf});
 const items=effectSignature([{op:'transfer',from:'player|item_ore|inventory',to:'npc_one'}],{kindOf});
 assert.equal(signatureJaccard(coins,items),0);
 const onlyPlayer={...action('test:player'),participants:{actor:'player',target:['person']}};
 assert.equal(routeAction({...proposal,participants:{...proposal.participants,actor:'player'}},{actions:[onlyPlayer]},{...context,actor:'npc_one'}).candidates.length,0);
});

test('A3 routing: native names, aliases and slots use currently accessible entities, preserve ambiguity',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 const document=engine.createCharacter(seed,{},'a3-routing-native');
 const people=Object.keys(document.state.npcs).slice(0,3);assert.equal(people.length,3);
 for(const id of people.slice(0,2)){document.state.npcs[id].location=document.state.location;document.state.npcs[id].name='同名来客';}
 const remote=people[2];document.state.npcs[remote].location='loc_inaccessible';
 const context=createRoutingContext(engine,document);
 const ambiguous=resolveProposalEntities({...proposal,participants:{target:'同名来客'},effects:[{...effect,target:'同名来客'}]},context);
 assert.equal(ambiguous.ambiguities.length,2);assert.deepEqual(ambiguous.ambiguities[0].candidates.map(c=>c.id),people.slice(0,2).sort());
 assert.equal(context.resolve(remote).value,null);assert.deepEqual(context.resolve(remote).candidates,[]);
 assert.equal(context.kindOf(`${people[0]}|coin_river|purse`),'person');
 const concrete={...proposal,participants:{target:people[0]},effects:[{...effect,target:people[0]}]};
 const a=action('test:actual');
 const result=routeAction(concrete,{actions:[a]},context);
 assert.equal(result.routed,a.id);assert.equal(result.candidates[0].slots.target,people[0]);
 document.state.npcs[people[0]].location='loc_inaccessible';
 const fresh=createRoutingContext(engine,document);
 assert.equal(routeAction(concrete,{actions:[a]},fresh).routed,null);
});

test('A3 routing: primitive movement destination and learning source fill declared domain slots',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=engine.createCharacter(seed,{},'a3-structural-slots');
 document.state.skills.skill_light={proficiency:0};const context=createRoutingContext(engine,document);
 const next=context.entities.find(e=>e.kind==='place'&&e.id!==document.state.location);assert.ok(next);
 const move={slots:[{name:'destination',entity:'place',required:true}]};
 assert.deepEqual(context.slotsFor(move,{effects:[{op:'move',to:next.id}]}),{destination:next.id});
 const skill=Object.keys(document.state.skills)[0];assert.ok(skill);
 const learn={slots:[{name:'skill',entity:'skill',required:true},{name:'source',required:true}]};
 assert.deepEqual(context.slotsFor(learn,{effects:[{op:'learn',subject:skill,learningSource:'practice'}]}),{skill,source:'practice'});
 assert.equal(context.slotsFor(learn,{effects:[{op:'learn',subject:'skill_nonexistent',learningSource:'practice'}]}).skill,undefined);
});

test('A3 routing: catalog spell slots reach execution, which still refuses missing spell knowledge',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=engine.createCharacter(seed,{},'a3-cast-slots');
 document.state.inventory.item_staff={quantity:1};
 document.state.skills.skill_light={proficiency:100};document.state.spells.spell_light={};
 const before=structuredClone(document),proposal={intent:'让手里的木杖施展照明术',means:{spell:'spell_light'},effects:[{op:'status',target:'item_staff',status:'light',duration:60,magnitude:2}]};
 const registry={actions:engine.world.actionDefinitions.actions},context=createRoutingContext(engine,document),resolved=resolveProposalEntities(proposal,context).proposal;
 const result=routeAction(resolved,registry,context);
 assert.equal(result.routed,'core:cast');assert.equal(result.nearest.slots.spell,'spell_light');assert.equal(result.nearest.slots.target,'item_staff');
 assert.deepEqual(document,before);
 delete document.state.spells.spell_light;
 const missing=routeAction(resolved,registry,createRoutingContext(engine,document));
 // Routing establishes public catalog identity; the registered cast program
 // owns learned-knowledge validation. Keep the original no-free-spell guarantee
 // by requiring that program to reject and leave the document unchanged.
 assert.equal(missing.routed,'core:cast');assert.equal(missing.nearest.slots.spell,'spell_light');
 const withoutSpell=structuredClone(document);
 await assertActionRejected(engine.previewAction(document,{tool:'world_act',eventId:'a3-unknown-spell',args:{action:missing.routed,slots:missing.nearest.slots}}),/尚未学会这个法术/);
 assert.deepEqual(document,withoutSpell);
});

test('A3 routing: payment promise slots use the requested terms and the actual next-day sunset',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=engine.createCharacter(seed,{},'a3-promise-slots');
 const target='npc_hw_linsui';document.state.location='bld_hw_qingdeng';document.state.npcs[target].location=document.state.location;
 const proposal={intent:'我当面保证明天日落前把十铜交给你',target,effects:[{op:'obligation.create',obligationKind:'promise',debtor:'self',creditor:target,terms:{resource:'coin',amount:10,due:'明天日落前'}}]};
 const context=createRoutingContext(engine,document),resolved=resolveProposalEntities(proposal,context).proposal,registry={actions:engine.world.actionDefinitions.actions};
 const result=routeAction(resolved,registry,context),tomorrow=(Math.floor(document.state.minute/1440)+1)*1440;
 assert.equal(result.routed,'core:dialogue.promise');
 assert.equal(result.nearest.slots.coins,10);assert.equal(result.nearest.slots.type,'付款');
 assert.equal(result.nearest.slots.deadline,tomorrow+localWeather(engine,document,document.state.location,tomorrow).sunsetMinute);
 assert.equal(result.nearest.slots.promisee,target);assert.equal(result.nearest.slots.content,proposal.intent);
});

test('A3 routing: guarding without an identified opponent asks for that target, never fights the actor',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=engine.createCharacter(seed,{},'a3-guard-target');
 document.state.inventory.item_staff={quantity:1};
 const proposal={intent:'用手里的木杖防守',means:{manner:'guard',tools:['item_staff']},effects:[{op:'status',target:'self',status:'combat_defense',duration:1,magnitude:1}]};
 const context=createRoutingContext(engine,document),resolved=resolveProposalEntities(proposal,context).proposal;
 const result=routeAction(resolved,{actions:engine.world.actionDefinitions.actions},context);
 assert.equal(result.routed,null);assert.deepEqual(result.needsSlots,{action:'core:combat',missing:['target']});
 assert.equal(result.nearest.slots.intent,'defend');assert.equal(result.nearest.slots.weapon,'item_staff');
});
