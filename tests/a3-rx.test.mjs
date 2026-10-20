import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {compileRX,evaluateRX,extractGuards} from '../server-plugin/rx.mjs';
import {createRXLibrary} from '../server-plugin/rx-library.mjs';
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
 // 12 §12.8.1 and 14 §14.6 require log/exp as deterministic math functions.
 // Keep the unknown-function assertion using an actually undeclared function.
 for(const s of ['globalThis.process','actor.constructor','actor[slot]','actor.name = 1','eval(1)','new Function(1)','actor.missing','unknownMath(2)'])assert.throws(()=>compileRX(s,{schema:{actor:{name:'string'},slot:'string'}}));
 assert.throws(()=>evaluateRX(compileRX('actor.name',{schema:{actor:{name:'string'}}}),{actor:{get name(){throw Error('getter executed');}}}),{code:'E-RX-VIEW'});
 for(const source of ["min('text')",'clamp(1, 2)',"'text' < 2",'-true'])assert.throws(()=>compileRX(source),{code:'E-RX-TYPE'});
 assert.throws(()=>compileRX('sum(items, x => x.name)',{schema:{items:[{name:'string'}]}}),{code:'E-RX-TYPE'});
});
test('A3 RX: deterministic fixed log/exp, domain errors and overflow',()=>{
 assert.equal(evaluateRX(compileRX('log(1)')),0);
 assert.equal(evaluateRX(compileRX('log(2)')),0.6931);
 assert.equal(evaluateRX(compileRX('log(0.5)')),-0.6931);
 assert.equal(evaluateRX(compileRX('exp(1)')),2.7182);
 assert.equal(evaluateRX(compileRX('exp(-1)')),0.3678);
 assert.equal(evaluateRX(compileRX('exp(-100)')),0);
 assert.throws(()=>evaluateRX(compileRX('log(0)')),{code:'E-RX-NUMBER'});
 assert.throws(()=>evaluateRX(compileRX('exp(100)')),{code:'E-RX-NUMBER'});
 assert.throws(()=>compileRX('exp(1)',{budget:65}),{code:'E-RX-BUDGET'});
 assert.throws(()=>evaluateRX(compileRX('log(2)'),{},{budget:30}),{code:'E-RX-BUDGET'});
 fc.assert(fc.property(fc.integer({min:1,max:1000000}),n=>{
  const result=evaluateRX(compileRX('log(n)',{schema:{n:'number'}}),{n:n/10000});
  assert.ok(Math.abs(result-Math.log(n/10000))<0.000101);
  return result===evaluateRX(compileRX('log(n)',{schema:{n:'number'}}),{n:n/10000});
 }));
});

test('A3 RX: native library NPC decision uses current subjective facts, without exposing traces',async()=>{
 const {loadWorld}=await import('../tools/load-world.mjs'),{WorldEngine}=await import('../server-plugin/engine.mjs'),fs=await import('node:fs/promises');
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),document=engine.initialFromLegacy(seed,'rx-library');
 const target=Object.keys(document.state.npcs)[0],before=structuredClone(document),library=createRXLibrary(engine,document);
 const compiled=compileRX('npcDecision(target, request).outcome',{schema:{target:'string',request:{kind:'string',from:'string'}},functions:library.signatures});
 const binding={target,request:{kind:'greet',from:'forged-speaker'}};
 const result=evaluateRX(compiled,binding,{functions:library.functions});assert.ok(['agree','refuse','defer','conditional'].includes(result));
 assert.deepEqual(library.functions.npcDecision(target,binding.request),library.functions.npcDecision(target,{...binding.request,from:'player'}));
 assert.deepEqual(Object.keys(library.functions.npcDecision(target,binding.request)).sort(),['outcome','reason']);
 assert.equal(evaluateRX(compileRX('month()',{functions:library.signatures}),{},{functions:library.functions}),engine.calendar(document.state.minute).month);
 assert.throws(()=>compileRX('npcDecision(target, request).trace',{schema:{target:'string',request:{}},functions:library.signatures}),{code:'E-RX-FIELD'});
 assert.deepEqual(document,before);
});

test('A3 RX: templates only render in narration and cannot evaluate code or whole private views',()=>{
 const source='`hello ${actor.name}: ${0.1 + 0.2}`',schema={actor:{name:'string'}};
 assert.throws(()=>compileRX(source,{schema}),{code:'E-RX-TEMPLATE'});
 const compiled=compileRX(source,{schema,mode:'narration'});
 assert.equal(evaluateRX(compiled,{actor:{name:'Lin'}}),'hello Lin: 0.3');
 assert.equal(evaluateRX(compiled,{actor:{name:'${process.exit()}'}}),'hello ${process.exit()}: 0.3');
 assert.equal(evaluateRX(compileRX('`say ${"}"}`',{mode:'narration'})),'say }');
 assert.throws(()=>compileRX('`${actor}`',{schema,mode:'narration'}),{code:'E-RX-TYPE'});
 assert.throws(()=>compileRX('`${globalThis.process}`',{mode:'narration'}),{code:'E-RX-NAME'});
 assert.throws(()=>evaluateRX(compiled,{actor:{name:'x'.repeat(16001)}}),{code:'E-RX-BUDGET'});
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
