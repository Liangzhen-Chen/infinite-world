import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {derived,explainDerived,loadDerivedRegistry,selectDerivedBaseline,derivedConduction,knownDerivedHoldings} from '../server-plugin/derived.mjs';
import {wageQuote} from '../server-plugin/obligation-state.mjs';
import {registerHoldingKinds} from '../server-plugin/holding-kinds.mjs';
import {holdingKind,registerHoldingKind} from '../server-plugin/holdings.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initialEngine=new WorldEngine(world),initial=initialEngine.createCharacter(seed,{},'s501-derived');
function scene({slots=[],modifiers=[],rulesModifiers=[]}={}){
 // These are author rule declarations, not fabricated campaign prerequisites.
 const w={...world,rules:{...world.rules,modifiers:rulesModifiers},derived:{...world.derived,slots:[...world.derived.slots,...slots],modifiers}};
 loadDerivedRegistry(w);const engine=new WorldEngine(w);
 return {engine,document:structuredClone(initial)};
}
const slot={id:'sample:flow',stages:['add','mul','max','min','clamp'],bounds:[0,100],relative:false,stageBounds:{mul:[0,5]}};
const mods=[
 {pack:'b',id:'add',target:slot.id,stage:'add',value:5,source:'rule:increment'},
 {pack:'a',id:'mul',target:slot.id,stage:'mul',value:2},
 {pack:'c',id:'max',target:slot.id,stage:'max',value:40},
 {pack:'a',id:'min',target:slot.id,stage:'min',value:35}
];
test('native world loader supplies slots and aliases; all modifier permutations give identical values and explanations',()=>{
 assert.ok(world.derived.slots.some(r=>r.id==='economy:wage'));
 function permutations(rows){return rows.length?rows.flatMap((r,i)=>permutations(rows.filter((_,j)=>i!==j)).map(t=>[r,...t])):[[]];}
 const outputs=permutations(mods).map(modifiers=>{const f=scene({slots:[slot],modifiers});return explainDerived(f.engine,f.document,slot.id,'player',{base:10});});
 for(const out of outputs)assert.deepEqual(out,outputs[0]);
 assert.equal(outputs[0].value,35);
 assert.deepEqual(outputs[0].contributions.map(r=>[r.stage,r.before,r.after]),[['add',10,15],['mul',15,30],['max',30,40],['min',40,35]]);
});
test('clamp runs last; add, mul, max and min are distinct stages and retain rule provenance',()=>{
 const f=scene({slots:[{...slot,bounds:[0,32]}],modifiers:mods});
 const result=explainDerived(f.engine,f.document,slot.id,'player',{base:10});
 assert.equal(result.value,32);assert.equal(result.clamp.before,35);
 assert.equal(result.contributions.find(r=>r.id==='add').source,'rule:increment');
 assert.equal(result.base,10);assert.equal(result.clamp.after,32);
});
test('multiple fixed-point multipliers in the same stage are sorted independently of loading order',()=>{
 const rows=[{pack:'z',id:'third',value:0.6667},{pack:'a',id:'first',value:1.1111},{pack:'a',id:'second',value:1.3333}].map(r=>({...r,target:'new:projection',stage:'mul'}));
 const results=[rows,[...rows].reverse(),[rows[1],rows[0],rows[2]]].map(modifiers=>{const f=scene({modifiers});return explainDerived(f.engine,f.document,'new:projection','player',{base:10.001});});
 assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
 assert.deepEqual(results[0].contributions.map(r=>r.id),['first','second','third']);
});
test('undeclared slots are open; closed slots reject at load time with a world reason',()=>{
 const f=scene({rulesModifiers:[{id:'open',target:'new:projection',stage:'mul',value:1.5}]});
 assert.equal(derived(f.engine,f.document,'new:projection','player',{base:10}),15);
 assert.throws(()=>scene({modifiers:[{id:'denied',target:'effective',stage:'mul',value:1}]}),e=>e.code==='E-DERIVED-CLOSED'&&e.reason.includes('职能'));
});
test('numeric and expression bounds are rejected while loading, never silently clipped to the modifier budget',()=>{
 for(const modifier of [{value:3},{value:'3',bounds:[0.5,3]},{value:'1.2'},{value:1,bounds:[2,1]}])assert.throws(()=>scene({modifiers:[{id:'wide',target:'new:projection',stage:'mul',...modifier}]}),e=>e.code==='E-DERIVED-BOUNDS');
 assert.throws(()=>scene({slots:[{id:'bad:bounds',bounds:[2,1]}]}),e=>e.code==='E-DERIVED-BOUNDS');
 assert.throws(()=>scene({slots:[{id:'bad:kind-bounds',kindBounds:{labor:[5,1]}}]}),e=>e.code==='E-DERIVED-BOUNDS');
 assert.throws(()=>scene({modifiers:[{id:'random',target:'new:projection',stage:'mul',value:'roll("die")',bounds:[0.5,2]}]}),/roll/);
});
test('extension facts use native campaign facts and expose their contribution and source',()=>{
 const f=scene({modifiers:[{id:'body',target:'new:projection',stage:'mul',when:"fact(subject, 'hp') != null",value:"1 + fact(subject, 'hp') / 100",bounds:[0.5,2],source:'rule:body'}]});
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','player','hp'],value:40}]});assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
 const result=explainDerived(f.engine,f.document,'new:projection','player',{base:10});
 assert.equal(result.value,14);assert.deepEqual(result.contributions[0].facts,['fact:player:hp']);
 assert.equal(result.contributions[0].source,'rule:body');
});
test('unknown fact sources cannot affect either the subjective value or its explanation',()=>{
 const source='npc_hw_linsui';
 const f=scene({modifiers:[{id:'hidden',target:'new:projection',stage:'mul',value:`1 + fact('${source}', 'trust') / 1000`,bounds:[0.5,2],source:'rule:private-health'}]});
 // Native NPCs have trust facts, not the player's hp field (D05: actual facts).
 const left=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',source,'trust'],value:40}]}),right=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs',source,'trust'],value:80}]});
 assert.deepEqual(left.setupUnmet,[]);assert.deepEqual(right.setupUnmet,[]);
 const read=document=>explainDerived(f.engine,document,'new:projection','player',{base:10,observer:'player'});
 assert.deepEqual(read(left.document),read(right.document));assert.deepEqual(read(left.document).contributions,[]);
 assert.equal(JSON.stringify(read(left.document)).includes('private-health'),false);
 assert.notEqual(derived(f.engine,left.document,'new:projection','player',{base:10}),derived(f.engine,right.document,'new:projection','player',{base:10}));
});
test('baseline selectors read matching culture/holding facts and carry provenance',()=>{
 const f=scene(),culture=f.engine.byId.get('npc_hw_linsui').culture;
 const rows=[{id:'culture',holder:{culture},value:7,source:'rule:culture'},{id:'absent',holder:{culture:'other'},value:99}];
 const selected=selectDerivedBaseline(f.engine,f.document,rows,'npc_hw_linsui');
 assert.equal(selected.length,1);assert.equal(selected[0].value,7);assert.equal(selected[0].source,'rule:culture');
 assert.deepEqual(selected[0].facts,['fact:npc_hw_linsui:culture']);
 assert.deepEqual(selectDerivedBaseline(f.engine,f.document,rows,'npc_hw_linsui',{observer:'player'}),[]);
 const g=scene({slots:[{...slot,baselines:[{id:'health',fact:'hp'}]}]});
 assert.equal(derived(g.engine,g.document,slot.id,'player'),Math.min(100,g.document.state.player.hp));
});
test('constant corrections sourced from private facts are gated, and known snapshots do not dereference changed truth',()=>{
 const f=scene({modifiers:[{id:'fact-source',target:'new:projection',stage:'mul',value:1.5,source:'fact:npc_hw_linsui:trust'}]});
 const read=document=>explainDerived(f.engine,document,'new:projection','player',{base:10,observer:'player'});
 assert.equal(read(f.document).value,10);assert.deepEqual(read(f.document).contributions,[]);
 // Knowledge is a non-examined premise, declared through the native setup.
 const records={...f.document.state.records,derived_knowledge:{id:'derived_knowledge',category:'knowledge',observer:'player',key:'fact:npc_hw_linsui:trust',value:20,sourceEvent:'tell:trust',minute:f.document.state.minute}};
 const known=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:records}]});assert.deepEqual(known.setupUnmet,[]);
 assert.equal(read(known.document).value,15);
 assert.ok(read(known.document).contributions[0].facts.includes('tell:trust'));
});
test('holding conduction reads kind declarations and inherited declarations, with private holdings gated by knowledge',()=>{
 const original=holdingKind('owns');
 // A package can declare conduction on any kind, inherited from its parent
 // (D01 §1.3). Use a supported native setup holding for the unrelated title.
 registerHoldingKinds([{...original,id:'sample:connected_title',derives:{conduction:0.5}}]);
 registerHoldingKind({...original,parent:'sample:connected_title',visibility:'parties',derives:{}});
 try{
  const f=scene();
  // Use a building nobody owns at the campaign start; an extra share on an
  // owned building is (correctly) rejected by the share-sum invariant.
  const owned=new Set(Object.values(f.document.holdings?.rows??{}).filter(r=>r.kind==='owns'&&r.until===undefined).map(r=>r.subject));
  const subject=f.engine.world.locations.find(l=>l.id.startsWith('bld_')&&!owned.has(l.id)).id;
  const setup=applyIntentSetup(f.engine,f.document,{holdings:[{id:'title',kind:'owns',holder:'npc_hw_linsui',subject,terms:{share:1}}]});
  assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
  const truth=derivedConduction(f.engine,f.document,'npc_hw_linsui',{[subject]:20});
  assert.ok(truth.some(r=>r.value===10&&r.coefficient===0.5));
  const hidden=derivedConduction(f.engine,f.document,'npc_hw_linsui',{[subject]:20},{observer:'player'});
  assert.deepEqual(hidden,[]);
  assert.equal(knownDerivedHoldings(f.engine,f.document,'player').some(h=>h.kind==='owns'&&h.subject===subject),false);
 }finally{registerHoldingKinds();}
});
test('wage and artifact valuation are selector aliases of value and preserve native unmodified values',()=>{
 const f=scene(),options={baseHalfDay:25,proficiency:600,regard:-1,minutes:480};
 assert.equal(derived(f.engine,f.document,'economy:wage','player',options),wageQuote(options).daily);
 for(const item of f.engine.world.items.slice(0,20))if(Number.isFinite(item.basePrice))assert.equal(derived(f.engine,f.document,'economy:artifactValue',item.id),item.basePrice);
 const g=scene({modifiers:[{id:'labor',target:'economy:wage',stage:'mul',value:2}]});
 assert.equal(derived(g.engine,g.document,'economy:wage','player',options),2*wageQuote(options).daily);
 const chained=scene({slots:[{id:'sample:wage',alias:'economy:wage'}],modifiers:[{id:'chain',target:'sample:wage',stage:'mul',value:2}]});
 // Aliases retain their selector through another package's alias (A.16).
 assert.equal(derived(chained.engine,chained.document,'sample:wage','player',options),2*wageQuote(options).daily);
 const item=g.engine.world.items.find(i=>i.basePrice>0);
 assert.equal(derived(g.engine,g.document,'economy:artifactValue',item.id),item.basePrice);
 // Native physical premises use itemInstances; generic instances initialize agents.
 const setup=applyIntentSetup(g.engine,g.document,{itemInstances:[{id:'artifact',kind:'item',template:'thing',item:item.id,location:g.document.state.location,owner:'player',carriedBy:'player'}]});
 assert.deepEqual(setup.setupUnmet,[]);
 assert.equal(derived(g.engine,setup.document,'economy:artifactValue',setup.bindings.artifact),item.basePrice);
 assert.equal(wageQuote(options).daily,72); // Existing consumer keeps its native formula despite the installed modifier.
});
