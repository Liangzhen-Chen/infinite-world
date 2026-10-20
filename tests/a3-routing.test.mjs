import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAction,effectSignature,signatureJaccard,createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import fs from 'node:fs/promises';
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
