import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {compileRX,evaluateRX,extractGuards} from '../server-plugin/rx.mjs';
test('A3 RX: fixed four-place arithmetic and truncation toward zero',()=>{
 assert.equal(evaluateRX(compileRX('0.1 + 0.2 == 0.3')),true);
 assert.equal(evaluateRX(compileRX('-1 / 3')),-0.3333);
 assert.equal(evaluateRX(compileRX('0.00019 * 3')),0.0003);
 assert.equal(evaluateRX(compileRX('floor(-1.2)')),-2);
 assert.equal(evaluateRX(compileRX('clamp(12, 0, 10)')),10);
 assert.throws(()=>evaluateRX(compileRX('1 / 0')),{code:'E-RX-NUMBER'});
});
test('A3 RX: bounded lambda collections, views, conditional and null coalescing',()=>{
 const schema={items:[{qty:'number',ok:'boolean'}],actor:{name:'string'},value:'number'};
 const c=compileRX("sum(filter(items, x => x.ok), x => x.qty) + (value ?? 2)",{schema});
 const before={items:[{qty:3,ok:true},{qty:9,ok:false}],actor:{name:'A'},value:null};
 assert.equal(evaluateRX(c,before),5);assert.equal(before.items[0].qty,3);
 assert.equal(evaluateRX(compileRX("actor.name == 'A' ? 1 : 2",{schema}),before),1);
 assert.throws(()=>compileRX('items.map(x => x.qty)',{schema}),{code:'E-RX-CALL'});
});
test('A3 RX: host escape, dynamic properties, assignment, unknown fields/functions reject',()=>{
 for(const s of ['globalThis.process','actor.constructor','actor[slot]','actor.name = 1','eval(1)','new Function(1)','actor.missing','log(2)'])assert.throws(()=>compileRX(s,{schema:{actor:{name:'string'},slot:'string'}}));
 assert.throws(()=>evaluateRX(compileRX('actor.name',{schema:{actor:{name:'string'}}}),{actor:{get name(){throw Error('getter executed');}}}),{code:'E-RX-VIEW'});
 for(const source of ["min('text')",'clamp(1, 2)',"'text' < 2",'-true'])assert.throws(()=>compileRX(source),{code:'E-RX-TYPE'});
 assert.throws(()=>compileRX('sum(items, x => x.name)',{schema:{items:[{name:'string'}]}}),{code:'E-RX-TYPE'});
});
test('A3 RX: compile/runtime budgets and collection bounds are enforced',()=>{
 assert.throws(()=>compileRX('sum(items, x => x.qty)',{schema:{items:[{qty:'number'}]},budget:20}),{code:'E-RX-BUDGET'});
 const c=compileRX('sum(items, x => x.qty)',{schema:{items:[{qty:'number'}]},maxCollection:2});
 assert.throws(()=>evaluateRX(c,{items:[{qty:1},{qty:2},{qty:3}]}),{code:'E-RX-BUDGET'});
 assert.throws(()=>evaluateRX(c,{items:[{qty:1}]},{budget:1}),{code:'E-RX-BUDGET'});
});
test('A3 RX: deterministic native domain function and complete kernel roll keys',()=>{
 const c=compileRX('standing(actor, target) + roll("contest")',{schema:{actor:'string',target:'string'},functions:{standing:{returns:'number'}}});
 const options={functions:{standing:()=>10},rollKey:{seed:1,pack:'core',rule:'test',object:'player',date:2},explain:true};
 const r=evaluateRX(c,{actor:'player',target:'npc_a'},options);assert.deepEqual(evaluateRX(c,{actor:'player',target:'npc_a'},options),r);assert.ok(r.value>=11&&r.value<=30);assert.equal(r.trace.length,2);
 assert.throws(()=>evaluateRX(c,{actor:'player',target:'npc_a'},{functions:options.functions}),{code:'E-RX-ROLL'});
});
test('A3 RX: guards never exclude a matching full predicate (property test)',()=>{
 const schema={event:{verb:'string',qty:'number'}},compiled=compileRX("event.verb == 'tell' && (event.qty > 2 || event.qty < 0)",{schema}),guards=extractGuards(compiled);
 assert.deepEqual(guards,[{path:'event.verb',value:'tell'}]);
 assert.deepEqual(extractGuards(compileRX("event.verb == 'tell' || event.verb == 'claim'",{schema})),[]);
 fc.assert(fc.property(fc.constantFrom('tell','claim','request'),fc.integer({min:-100,max:100}),(verb,qty)=>{const binding={event:{verb,qty}};return !evaluateRX(compiled,binding)||guards.every(g=>g.path.split('.').reduce((v,k)=>v[k],binding)===g.value);}));
 fc.assert(fc.property(fc.integer({min:-10000,max:10000}),n=>evaluateRX(compileRX('n / 3 * 3',{schema:{n:'number'}}),{n})===Math.trunc(n*10000/3)*3/10000));
});
