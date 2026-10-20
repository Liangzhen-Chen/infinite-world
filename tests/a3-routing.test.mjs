import test from 'node:test';
import assert from 'node:assert/strict';
import {routeAction,effectSignature,signatureJaccard} from '../server-plugin/action-router.mjs';
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
