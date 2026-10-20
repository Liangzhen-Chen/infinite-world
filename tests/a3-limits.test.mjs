import test from 'node:test';
import assert from 'node:assert/strict';
import {limitOpenEffects,openDuration,deriveOpenLimits,openUsage,openUsageEntry} from '../server-plugin/action-limits.mjs';
import {createRoutingContext} from '../server-plugin/action-router.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {npcProficiency} from '../server-plugin/checks.mjs';
import {actionReader} from '../server-plugin/action-capacity.mjs';
import fs from 'node:fs/promises';
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

test('A3 limits: splitting a reward across sources cannot reset the nearest action total ceiling',()=>{
 const r=limitOpenEffects(proposal([effect,effect]),native({sourceFor:(_effect,index)=>({...source,id:`native:source-${index}`,rewardFields:['delta']}),nearestBounds:{vital:{delta:3}},nearestCost:30}));
 assert.deepEqual(r.effects,[{...effect,delta:3}]);assert.equal(r.trimmed.length,2);assert.equal(r.cost.time,30);
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

test('A3 limits: real held source stage is independent of the actor skill tier',async()=>{
 const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 engine.world.openActionRules=JSON.parse(await fs.readFile('world/rules/tables/open-actions.json','utf8'));
 const document=engine.createCharacter(seed,{},'a3-source-stage'),item=engine.byId.get('item_staff');
 // Authored high-stage weapon fixture: source stage belongs to this item.
 item.stage=4;item.tags=['weapon'];document.state.inventory.item_staff={quantity:1,durability:100,quality:'木'};
 const p={intent:'用持有的器物攻击',means:{item:item.id},effects:[{...effect,delta:-9999,type:'physical'}]},routing=createRoutingContext(engine,document);
 const r=limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{routing}));
 assert.equal(r.sources[0].stage,4);assert.equal(r.effects[0].delta,-engine.world.openActionRules.sourceCaps.vital[4]);
 document.state.inventory.item_staff.quantity=0;
 const unheld=limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{routing:createRoutingContext(engine,document)}));
 assert.equal(unheld.sources[0].stage,0);assert.ok(Math.abs(unheld.effects[0].delta)<Math.abs(r.effects[0].delta));
 item.stage=0;document.state.inventory.item_staff.quantity=1;document.state.skills.skill_light={proficiency:2699};
 assert.equal(limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{routing})).sources[0].stage,0);
});

test('A3 limits: known spell sources preserve fixed power, materials and mana requirements',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 engine.world.openActionRules=JSON.parse(await fs.readFile('world/rules/tables/open-actions.json','utf8'));
 const document=engine.createCharacter(seed,{},'a3-spell-source'),spell=engine.byId.get('spell_s3_mend_palm');
 document.state.skills[spell.skill]={proficiency:0};document.state.spells[spell.id]={known:true};
 const p={intent:'施展已学的治疗手段',means:{spell:spell.id},effects:[{op:'vital',target:'player',delta:999,type:'healing'}]},routing=createRoutingContext(engine,document);
 const r=limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{routing}));
 assert.equal(r.effects[0].delta,spell.effectSpec.power);assert.equal(r.sources[0].requirements.mp,spell.mp);assert.deepEqual(r.sources[0].requirements.materials,spell.materials);
 delete document.state.spells[spell.id];
 assert.equal(limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{routing})).blocked.length,1);
});

test('A3 limits: an NPC can use authored knowledge while live overrides revoke that source',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 engine.world.openActionRules=JSON.parse(await fs.readFile('world/rules/tables/open-actions.json','utf8'));
 const document=engine.createCharacter(seed,{},'a3-npc-sources'),actor=Object.keys(document.state.npcs)[0],base=engine.byId.get(actor),spell=engine.byId.get('spell_s3_mend_palm');
 base.skills=[spell.skill];base.proficiencies={[spell.skill]:0};base.spells=[spell.id];document.state.npcs[actor].skills={};document.state.npcs[actor].spells={};
 const p={intent:'施展所知法术',means:{spell:spell.id},effects:[{op:'vital',target:actor,delta:999,type:'healing'}]},routing=createRoutingContext(engine,document,{actor});
 assert.equal(routing.resolve(spell.skill,'skill').value,spell.skill);assert.equal(routing.resolve(spell.id,'spell').value,spell.id);
 for(const proficiency of [0,300]){
  base.proficiencies[spell.skill]=proficiency;
  const out=limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{actor,routing}));
  assert.equal(out.effects[0].delta,spell.effectSpec.power);assert.equal(out.sources[0].stage,Math.floor(proficiency/300));
  assert.equal(npcProficiency(actionReader(document),engine,actor,spell.skill),proficiency);
 }
 document.state.npcs[actor].skills[spell.skill]={proficiency:600};
 assert.equal(npcProficiency(actionReader(document),engine,actor,spell.skill),600);
 assert.equal(limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{actor,routing})).sources[0].stage,2);
 document.state.npcs[actor].spells[spell.id]=false;
 const fresh=createRoutingContext(engine,document,{actor});assert.equal(fresh.resolve(spell.id,'spell').value,null);
 assert.equal(limitOpenEffects(p,deriveOpenLimits(engine,document,p,null,{actor,routing:fresh})).blocked.length,1);
});

test('A3 limits: usage is derived from committed receipts within rolling 24 hours and actual daily gains',()=>{
 const signature=['vital:person:healing'],document={state:{minute:3000,records:{}}};
 const record=(id,minute,produced,extra={})=>document.state.records[id]={category:'primitive_receipt',receipt:{actor:'player',status:'committed',openUsage:{minute,signature,produced},...extra}};
 record('old',1560,{'vital:heal':100});record('recent',1561,{'vital:heal':4});record('today',2900,{'vital:heal':3});record('future',3001,{'vital:heal':99});record('preview',2950,{'vital:heal':88},{status:'preview'});record('other',2950,{'vital:heal':77},{actor:'npc_one'});
 assert.deepEqual(openUsage(document,signature),{repeats:2,produced:0,producedByKey:{'vital:heal':3}});
 const prepared={signature,effects:[{op:'vital',target:'player',delta:9}],sources:[{rewardFields:['delta'],dailyKey:'vital:heal'}]};
 const entry=openUsageEntry(prepared,{applied:[{op:'vital',target:'player',delta:9,result:{healed:2}}]},3000);
 assert.deepEqual(entry.produced,{'vital:heal':2});
 assert.deepEqual(openUsageEntry(prepared,{applied:[{op:'vital',target:'player',delta:9,result:{applied:false}}]},3000).produced,{});
});

test('A3 limits: an unmatched nearest duration-slot action retains its actual time floor',async()=>{
 const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
 engine.world.openActionRules=JSON.parse(await fs.readFile('world/rules/tables/open-actions.json','utf8'));
 const document=engine.createCharacter(seed,{},'a3-nearest-duration');
 const action={id:'test:long-work',durationSlot:{slot:'minutes',min:30,max:480},cost:{time:0},outcomes:[{op:'vital',target:'player',delta:-1,type:'physical'}]};
 engine.world.actionDefinitions={format:1,actions:[action]};
 const p=proposal([{op:'vital',target:'player',delta:-1,type:'physical'}]),nearest={id:action.id,signatureScore:1,slots:{minutes:120}};
 assert.equal(limitOpenEffects(p,deriveOpenLimits(engine,document,p,nearest)).cost.time,120);
 assert.throws(()=>deriveOpenLimits(engine,document,p,{...nearest,slots:{minutes:1}}),{code:'E-OPEN-DURATION'});
});

test('A3 limits: usage matches effect identity and sign, never charging a backlash as healing',()=>{
 const p={signature:['vital:person:healing'],effects:[{op:'vital',target:'player',delta:9,type:'healing'}],sources:[{rewardFields:['delta'],dailyKey:'vital:heal'}]};
 assert.deepEqual(openUsageEntry(p,{applied:[{op:'vital',target:'player',delta:-2,type:'physical',result:{damage:2}}]},3000).produced,{});
 const practice={signature:['learn'],effects:[{op:'learn',entity:'player',subject:'skill_light',amount:2,learningSource:'practice'}],sources:[{rewardFields:['amount'],dailyKey:'learn:skill_light'}]};
 const receipt={applied:[{op:'learn',entity:'player',subject:'skill_literacy',learningSource:'practice',amount:3,result:{gain:3}},{op:'learn',entity:'player',subject:'skill_light',learningSource:'practice',amount:2,result:{gain:1}}]};
 assert.deepEqual(openUsageEntry(practice,receipt,3000).produced,{'learn:skill_light':1});
});
