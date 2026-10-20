import test from 'node:test';
import assert from 'node:assert/strict';
import {limitOpenEffects,openDuration} from '../server-plugin/action-limits.mjs';
const effect={op:'vital',target:'npc_one',delta:100,type:'physical'};
const proposal=effects=>({intent:'推开眼前的目标',effects});
const source={id:'native:item',stage:4,time:10,difficulty:10,bounds:{delta:12}};
const native=(extra={})=>({actor:'player',sourceFor:()=>source,...extra});
test('A3 limits: aggregate native source bound clips split effects and rejects out-of-range stage',()=>{
 const p=proposal([effect,effect]),before=structuredClone(p),r=limitOpenEffects(p,native());
 assert.deepEqual(r.effects,[{...effect,delta:12}]);assert.equal(r.trimmed.length,2);assert.equal(r.cost.time,15);assert.equal(r.difficulty,12);assert.deepEqual(p,before);
 assert.throws(()=>limitOpenEffects(p,native({sourceFor:()=>({...source,stage:9})})),{code:'E-OPEN-BOUND'});
});
test('A3 limits: repeat, daily and nearest caps combine; cost uses max, reward min',()=>{
 const n=native({sourceFor:()=>({...source,rewardFields:['delta'],dailyCap:10}),usage:{repeats:1,produced:6},nearestBounds:{vital:{delta:3}},nearestCost:30});
 const r=limitOpenEffects(proposal([effect,effect]),n);assert.equal(r.effects[0].delta,3);assert.equal(r.effects.length,1);assert.equal(r.cost.time,30);assert.equal(r.difficulty,10);
 assert.deepEqual(limitOpenEffects(proposal([effect]),{...n,usage:{repeats:1,produced:10}}).effects,[]);
});
test('A3 limits: changing native source cannot reset a shared daily production quota',()=>{
 const r=limitOpenEffects(proposal([effect,effect]),native({sourceFor:(_effect,index)=>({...source,id:`native:source-${index}`,rewardFields:['delta'],dailyCap:10,dailyKey:'healing'}),usage:{repeats:0,produced:6}}));
 assert.deepEqual(r.effects,[{...effect,delta:4}]);assert.equal(r.trimmed.length,2);
});
test('A3 limits: fact absolute values become bounded work against current facts',()=>{
 const r=limitOpenEffects(proposal([{op:'fact.set',entity:'item_gate',field:'condition',value:100}]),native({sourceFor:()=>({...source,bounds:{delta:5}}),currentValue:()=>30}));
 assert.deepEqual(r.effects,[{op:'fact.set',entity:'item_gate',field:'condition',delta:5}]);
 assert.throws(()=>limitOpenEffects(proposal([effect]),native({sourceFor:()=>({...source,bounds:{}})})),{code:'E-OPEN-BOUND'});
});
test('A3 limits: context requires reasons; proposal time cannot substitute native cost',()=>{
 for(const p of [{...proposal([effect]),time:1},proposal([{op:'time',minutes:1}])])assert.throws(()=>limitOpenEffects(p,native()),{code:'E-OPEN-TIME'});
 for(const context of [{modifier:6,reason:'because'},{modifier:1},{modifier:.5,reason:'because'}])assert.throws(()=>limitOpenEffects({...proposal([effect]),context},native()),{code:'E-OPEN-CONTEXT'});
 assert.equal(limitOpenEffects({...proposal([effect]),context:{modifier:-5,reason:'darkness'}},native()).difficulty,7);
});
test('A3 limits: persistent duration slots permit only catalog bounds',()=>{
 const definition={cost:{time:10},durationSlot:{slot:'minutes',min:30,max:480}};
 assert.equal(openDuration(definition,{minutes:120}),120);
 for(const minutes of [0,29,481,1.5])assert.throws(()=>openDuration(definition,{minutes}),{code:'E-OPEN-DURATION'});
});
test('A3 limits: manufactured resources need recipes, unauthorized transfers cannot become smaller thefts',()=>{
 const from='npc_one|coin_river|purse',to='player|coin_river|purse';
 assert.throws(()=>limitOpenEffects(proposal([{op:'transfer',from,to,qty:100}]),native()),{code:'E-OPEN-TRANSFER'});
 assert.throws(()=>limitOpenEffects(proposal([{op:'transfer',from:'src:craft|coin_river|work',to,qty:100}]),native()),{code:'E-OPEN-TRANSFER'});
 const own={op:'transfer',from:to,to:from,qty:100};
 assert.throws(()=>limitOpenEffects(proposal([own]),native({accountBalance:()=>2})),{code:'E-TRANSFER-BALANCE'});
 const r=limitOpenEffects(proposal([{op:'create',kind:'item',facts:{quantity:100}}]),native());assert.deepEqual(r.effects,[]);assert.equal(r.blocked[0].alternative,'recipe_or_mark');
});
