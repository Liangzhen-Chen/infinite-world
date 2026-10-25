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
import {standing,collectivesOf,eventWeight} from '../server-plugin/standing.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {npcDecision} from '../server-plugin/npc-decision.mjs';
import {autonomyCandidates} from '../server-plugin/autonomy-candidates.mjs';
import {digest,applyPatches} from '../server-plugin/storage.mjs';
import {worldEvents} from '../server-plugin/world-events.mjs';

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

test('consumer defaults preserve native decision arithmetic including non-fixed-point fractions',()=>{
 const {engine,document}=scene(),view=subjectiveView(engine,document,'npc_hw_ayan');
 const request={kind:'greet',cost:{coins:0.17,minutes:1,risk:0.13},reward:0.19,needSatisfaction:0.23};
 const basis=npcDecision(view,request).trace.find(r=>r.stage==='cost_benefit').basis;
 const relation=view.self.relations.player??{trust:0,favors:[]};
 assert.equal(basis.cost,0.17+1/30+0.13*(view.self.traits.riskAversion??1)*10);
 assert.equal(basis.benefit,0.19+(relation.trust??0)/10+(relation.favors?.filter(f=>f.status!=='已还').length??0)*3+0.23);
});

test('native decision and standing consumers read registered corrections once',()=>{
 const native=scene(),corrected=scene({modifiers:[
  {id:'time',target:'decision:timeDivisor',stage:'mul',value:2},
  {id:'risk',target:'decision:riskWeight',stage:'mul',value:2},
  {id:'trust',target:'social:standing',stage:'add',value:7,when:"kind == 'trust'"}
 ]});
 const read=f=>subjectiveView(f.engine,f.document,'npc_hw_ayan');
 const before=read(native),after=read(corrected),request={kind:'greet',cost:{minutes:60}};
 const cost=v=>npcDecision(v,request).trace.find(r=>r.stage==='cost_benefit').basis.cost;
 assert.equal(cost(before),2);assert.equal(cost(after),1);
 const risk=v=>npcDecision(v,{kind:'greet',cost:{risk:1}}).trace.find(r=>r.stage==='cost_benefit').basis.cost;
 assert.equal(risk(after),risk(before)*2);
 assert.equal(after.self.relations.player.trust,before.self.relations.player.trust+7);
 assert.equal(standing(corrected.engine,corrected.document.state,'npc_hw_ayan'),standing(native.engine,native.document.state,'npc_hw_ayan')+7);
 assert.deepEqual(structuredClone(after).derived,after.derived);
});

test('standing clamps only after reputation and impression have cancelled',()=>{
 const f=scene(),holder='loc_hw',key=`reputation:${digest(['player','settlement',holder]).slice(0,24)}`;
 const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','records'],value:{...f.document.state.records,[key]:{reputation:30},[`standing:${holder}:player`]:{value:-60}}}]});
 assert.deepEqual(setup.setupUnmet,[]);
 assert.equal(standing(f.engine,setup.document.state,holder),90);
 const corrected=scene({modifiers:[{id:'reputation',target:'social:reputation',stage:'mul',value:0.5},{id:'impression',target:'social:impression',stage:'add',value:10}]});
 assert.equal(standing(corrected.engine,setup.document.state,holder),25);
});

test('existing household and settlement transmission ratios use the conduction slot',()=>{
 const f=scene({modifiers:[{id:'conduction',target:'social:conduction',stage:'mul',value:1.5}]});
 const rows=collectivesOf(f.engine,f.document.state,'npc_hw_linsui');
 assert.equal(rows.find(r=>r.via.startsWith('household:')).ratio,0.75);
 assert.equal(rows.find(r=>r.via==='settlement:loc_hw').ratio,0.45);
 // A loaded world's coefficient table, rather than the process's core import,
 // supplies the baseline before corrections (author data, not campaign setup).
 f.engine.world.derived.consumers={...world.derived.consumers,standing:{transmission:{...world.derived.consumers.standing.transmission,settlement:0.4}}};
 assert.equal(collectivesOf(f.engine,f.document.state,'npc_hw_linsui').find(r=>r.via==='settlement:loc_hw').ratio,0.6);
});

test('a real dialogue gift reaches event weight and collective standing through the slot',async()=>{
 const f=scene({modifiers:[{id:'gift-weight',target:'social:eventWeight',stage:'mul',value:2}]});
 const setup=applyIntentSetup(f.engine,f.document,{location:'bld_hw_qingdeng',present:['npc_hw_linsui'],minute:600,inventory:{item_ration:1}});
 assert.deepEqual(setup.setupUnmet,[]);
 const out=await f.engine.reduce(setup.document,{tool:'world_act',args:{action:'core:dialogue.ask',slots:{subject:'npc_hw_linsui',content:'weather',source:'item_ration'}},eventId:'derived-gift'});
 const document=applyPatches(setup.document,out.patches),event=worldEvents(document.state,e=>e.verb==='gift'&&e.target==='npc_hw_linsui').at(-1);
 assert.ok(event);assert.ok(event.value>0);
 const baseline=Math.min(15,3+Math.floor(event.value/10));
 assert.equal(eventWeight(event,f.engine.scoped(document),document.state),baseline*2);
 assert.equal(standing(f.engine,document.state,'loc_hw'),Math.round(baseline*2*0.3));
});

test('private correction sources stay absent from projected coefficients and decision traces',()=>{
 const f=scene({modifiers:[{id:'private-risk',target:'decision:riskWeight',stage:'mul',value:1.5,source:'fact:npc_hw_linsui:trust'}]});
 const read=value=>{
  const setup=applyIntentSetup(f.engine,f.document,{facts:[{path:['state','npcs','npc_hw_linsui','trust'],value}]});
  assert.deepEqual(setup.setupUnmet,[]);
  const view=subjectiveView(f.engine,setup.document,'npc_hw_ayan');
  assert.equal(JSON.stringify(view.derived).includes('private-risk'),false);
  return npcDecision(view,{kind:'greet',cost:{risk:0.1}}).trace;
 };
 assert.deepEqual(read(40),read(80));
});

test('autonomy scoring reads utility and risk slots through the native subjective projection',()=>{
 const f=scene({modifiers:[{id:'utility',target:'autonomy:utilityWeight',stage:'mul',value:1.5},{id:'risk',target:'autonomy:riskWeight',stage:'mul',value:0.5}]});
 // Availability and goals are unrelated premises, declared natively.
 const npc='npc_hw_ayan',setup=applyIntentSetup(f.engine,f.document,{facts:[
  {path:['state','npcs',npc],value:{...f.document.state.npcs[npc],goals:{},activity:'idle'}}
 ]});
 assert.deepEqual(setup.setupUnmet,[]);
 const view=subjectiveView(f.engine,setup.document,npc);
 const candidate={id:'derived-craft',action:'core:craft.manufacture',utility:10,risk:2,urgency:100};
 const result=autonomyCandidates(f.engine,view,{fallback:[candidate]}).find(r=>r.id===candidate.id);
 assert.ok(result);assert.equal(result.score,15-(view.self.traits.riskAversion??1));
});

test('new consumer slots and divisor baselines reject invalid bounds at world loading',()=>{
 for(const target of [...['moneyWeight','timeDivisor','riskWeight','riskAversion','familyWeight','reputationWeight','rewardWeight','trustDivisor','favorWeight','needWeight'].map(key=>`decision:${key}`),'autonomy:utilityWeight','autonomy:riskWeight','social:eventWeight','social:conduction']){
  assert.throws(()=>scene({modifiers:[{id:'outside',target,stage:'mul',value:3}]}),e=>e.code==='E-DERIVED-BOUNDS');
 }
 for(const target of ['social:relation','social:reputation','social:impression','social:standing'])assert.throws(()=>scene({modifiers:[{id:'outside',target,stage:'add',value:101}]}),e=>e.code==='E-DERIVED-BOUNDS');
 const invalid={...world,derived:{...world.derived,consumers:{...world.derived.consumers,decision:{timeDivisor:{slot:'decision:timeDivisor',base:0}}}}};
 assert.throws(()=>loadDerivedRegistry(invalid),e=>e.code==='E-DERIVED-BOUNDS');
});
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
