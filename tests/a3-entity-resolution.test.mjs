import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'a3-entity-resolution');
 const people=Object.keys(document.state.npcs).slice(0,3);
 for(const id of people)document.state.npcs[id].location=document.state.location;
 return {engine,document,people};
}
const vital=target=>({intent:'xyzzy',effects:[{op:'vital',target,type:'body:satiety',delta:30}]});

test('A3 entities: self aliases resolve to the native actor in references and account owners',()=>{
 const {engine,document,people}=fixture();
 for(const actor of ['player',people[0]])for(const alias of ['self','me','myself','I','我','自己','本人','自身','$actor',' ＳＥＬＦ ']){
  const context=createRoutingContext(engine,document,{actor});
  const proposal={...vital(alias),participants:{target:alias},effects:[{op:'transfer',resource:'item_ration',from:alias,to:'sink:consume',qty:1},...vital(alias).effects]};
  const before=structuredClone(proposal),result=resolveProposalEntities(proposal,context);
  assert.deepEqual(result.ambiguities,[]);assert.equal(result.proposal.participants.target,actor);
  assert.equal(result.proposal.effects[0].from,actor);assert.equal(result.proposal.effects[0].to,'sink:consume');
  assert.equal(result.proposal.effects[1].target,actor);assert.deepEqual(proposal,before);
  assert.equal(context.resolve(`${alias}|item_ration|inventory`).value,`${actor}|item_ration|inventory`);
 }
});

test('A3 entities: exact ids take precedence over colliding names and aliases',()=>{
 const {engine,document,people}=fixture(),[target,impostor]=people;
 document.state.npcs[impostor].name=target;document.state.npcs[impostor].aliases=[target];
 const context=createRoutingContext(engine,document);
 assert.equal(context.resolve(target).value,target);assert.equal(context.resolve(`${target}|coin_river|purse`).value,`${target}|coin_river|purse`);
 assert.deepEqual(resolveProposalEntities(vital(target),context).ambiguities,[]);
 document.state.npcs[target].location='loc_not_here';
 // Knowing a remote id must not select a local NPC whose name equals that id.
 const fresh=createRoutingContext(engine,document);
 assert.equal(fresh.resolve(target).reason,'not_present');assert.deepEqual(fresh.resolve(target).candidates,[]);
 assert.throws(()=>resolveProposalEntities(vital(target),fresh),{code:'E-OPEN-ENTITY',reason:'not_present'});
});

test('A3 entities: ambiguous names and unresolved descriptions require clarification, exact missing ids reject',()=>{
 const {engine,document,people}=fixture(),[a,b]=people;
 document.state.npcs[a].name='同名来客';document.state.npcs[b].name='同名来客';
 const context=createRoutingContext(engine,document),result=resolveProposalEntities(vital('同名来客'),context);
 assert.equal(result.ambiguities.length,1);assert.equal(result.ambiguities[0].path,'effects.0.target');
 assert.deepEqual(result.ambiguities[0].candidates.map(row=>row.id),[a,b].sort());
 const prepared=prepareOpenAction(engine,document,vital('同名来客'));
 assert.equal(prepared.status,'needs_entities');assert.equal(prepared.ambiguities[0].candidates.length,2);
 // 06 §6.5 / A3-B round 5: an unresolved description asks who was meant;
 // an exact nonexistent id remains a refusal. Both paths stay read-only.
 const unresolved=resolveProposalEntities(vital('没有这个名字'),context);
 assert.equal(unresolved.ambiguities.length,1);assert.deepEqual(unresolved.ambiguities[0].candidates,[]);
 assert.equal(prepareOpenAction(engine,document,vital('没有这个名字')).status,'needs_entities');
 assert.throws(()=>resolveProposalEntities(vital('npc_a3_missing'),context),{code:'E-OPEN-ENTITY',reason:'unknown_entity'});
 document.state.npcs[b].location='loc_not_here';
 assert.equal(createRoutingContext(engine,document).resolve('同名来客').value,a);
});

test('A3 entities: hidden local features, remote and missing ids reject without leaking candidate details',()=>{
 const {engine,document,people}=fixture(),place=engine.byId.get(document.state.location);
 place.features??=[];place.features.push({id:'feature_a3_secret',name:'秘密暗格',hidden:true,private:true});
 document.state.npcs[people[0]].location='loc_not_here';
 const before=structuredClone(document),context=createRoutingContext(engine,document);
 for(const [id,reason] of [['feature_a3_secret','not_perceivable'],[people[0],'not_present'],['npc_a3_nonexistent','unknown_entity']]){
  assert.throws(()=>prepareOpenAction(engine,document,vital(id)),error=>{
   assert.equal(error.code,'E-OPEN-ENTITY');assert.equal(error.reason,reason);
   assert.match(error.message,new RegExp(reason));assert.deepEqual(error.rejections,[{path:'effects.0.target',value:id,reason}]);return true;
  });
  assert.deepEqual(context.resolve(id).candidates,[]);
 }
 assert.deepEqual(document,before);
});

test('A3 entities: an inaccessible reference rejects even when another reference is ambiguous',()=>{
 const {engine,document,people}=fixture();
 for(const id of people.slice(0,2))document.state.npcs[id].name='同名来客';
 document.state.npcs[people[2]].location='loc_not_here';
 const proposal={intent:'xyzzy',participants:{target:'同名来客'},effects:[{op:'vital',target:people[2],delta:-1}]};
 assert.throws(()=>prepareOpenAction(engine,document,proposal),{code:'E-OPEN-ENTITY',reason:'not_present'});
});

test('A3 entities: public proposal preview resolves self and rejects unavailable exact ids without writes',async()=>{
 const {engine,document,people}=fixture(),before=structuredClone(document);
 const preview=await engine.previewAction(document,{tool:'world_propose',eventId:'a3-self-preview',args:vital('self')});
 assert.equal(preview.receipt.routing.status,'needs_alternative');
 // The routing receipt preserves the original proposal for replay. Satiety
 // without a native food source offers an alternative after resolving self.
 assert.deepEqual(preview.receipt.routing.proposal,vital('self'));assert.deepEqual(document,before);
 document.state.npcs[people[0]].location='loc_not_here';const remote=structuredClone(document);
 for(const [target,reason] of [[people[0],'not_present'],['npc_a3_nonexistent','unknown_entity']]){
  const input={tool:'world_propose',eventId:`a3-refused-${target}`,args:vital(target)};
  await assert.rejects(engine.previewAction(document,input),{code:'E-OPEN-ENTITY',reason});
  await assert.rejects(engine.reduce(document,input),{code:'E-OPEN-ENTITY',reason});
  assert.deepEqual(document,remote);
 }
});

test('A3 entities: public self-account proposals preview and commit the resolved actor, preserving the raw proposal',async()=>{
 const {engine,document,people}=fixture(),target=people[0];
 // Isolate an unmatched proposal; use the actual native transfer executor.
 engine.world.actionDefinitions={format:1,actions:[]};
 const input={tool:'world_propose',eventId:'a3-self-transfer',args:{intent:'xyzzy',effects:[{op:'transfer',from:'me|coin_river|purse',to:`${target}|coin_river|purse`,qty:1}]}},before=structuredClone(document);
 const preview=await engine.previewAction(document,input);
 assert.equal(preview.receipt.status,'preview');assert.equal(preview.receipt.routing.status,'open');
 assert.equal(preview.receipt.routing.effects[0].from,'player|coin_river|purse');
 assert.deepEqual(preview.receipt.routing.proposal,input.args);assert.deepEqual(document,before);
 const out=await engine.reduce(document,input);
 assert.equal(out.result.receipt.status,'committed');
 assert.equal(out.result.receipt.applied.find(effect=>effect.op==='transfer').from,'player|coin_river|purse');
 assert.deepEqual(out.result.receipt.routing.proposal,input.args);assert.deepEqual(document,before);
});

test('A3 entities: resource and owner shorthand uses native accounts, malformed accounts reject read-only',async()=>{
 const {engine,document,people}=fixture(),target=people[0];
 engine.world.actionDefinitions={format:1,actions:[]};
 const before=structuredClone(document),args={intent:'xyzzy',effects:[{op:'transfer',resource:'coin',from:'self',to:target,qty:1}]};
 const input={tool:'world_propose',eventId:'a3-short-account',args};
 const preview=await engine.previewAction(document,input);
 assert.equal(preview.receipt.status,'preview');
 assert.equal(preview.receipt.routing.effects[0].from,'player|coin_river|purse');
 assert.equal(preview.receipt.routing.effects[0].to,`${target}|coin_river|purse`);
 assert.deepEqual(preview.receipt.routing.proposal,args);assert.deepEqual(document,before);
 const committed=await engine.reduce(document,input);
 assert.equal(committed.result.receipt.status,'committed');
 await assert.rejects(engine.previewAction(document,{...input,eventId:'a3-bad-account',args:{...args,effects:[{...args.effects[0],from:'self||purse'}]}}),{code:'E-OPEN-ACCOUNT'});
 assert.deepEqual(document,before);
});

test('A3 entities: learning catalog subjects do not require prior knowledge, source aliases preserve the raw proposal',()=>{
 const {engine,document}=fixture(),before=structuredClone(document),context=createRoutingContext(engine,document);
 const subject=world.spells.find(row=>!document.state.spells[row.id])?.id;
 assert.ok(subject);
 const proposal={intent:'xyzzy',effects:[{op:'learn',entity:'self',subject,source:'practice',amount:1}]};
 const result=resolveProposalEntities(proposal,context);
 assert.deepEqual(result.ambiguities,[]);assert.equal(result.proposal.effects[0].subject,subject);
 assert.equal(result.proposal.effects[0].entity,'player');assert.equal(result.proposal.effects[0].learningSource,'practice');
 assert.equal(Object.hasOwn(result.proposal.effects[0],'source'),false);
 assert.equal(proposal.effects[0].source,'practice');assert.deepEqual(document,before);
});

test('A3 entities: a compound shorthand transfer cannot spend the same coin twice or leave partial writes',async()=>{
 const {engine,document,people}=fixture(),[a,b]=people;
 engine.world.actionDefinitions={format:1,actions:[]};
 document.state.player.coins=1;
 const before=structuredClone(document),input={tool:'world_propose',eventId:'a3-double-spend',args:{intent:'xyzzy',effects:[a,b].map(to=>({op:'transfer',resource:'coin',from:'self',to,qty:1}))}};
 await assert.rejects(engine.previewAction(document,input),{code:'E-TRANSFER-BALANCE'});
 await assert.rejects(engine.reduce(document,input),{code:'E-TRANSFER-BALANCE'});
 assert.deepEqual(document,before);
});

test('A3 entities: a native bank counter is perceivable locally, not from another location',()=>{
 const {engine,document}=fixture(),bank=engine.rules.economy.credit.banks[0];
 assert.ok(bank);document.state.location=bank.location;
 const before=structuredClone(document),context=createRoutingContext(engine,document);
 assert.equal(context.resolve(bank.id).value,bank.id);assert.equal(context.resolve(bank.name).value,bank.id);
 assert.equal(context.kindOf(bank.id),'organization');
 const proposal={intent:'xyzzy',effects:[{op:'transfer',resource:'coin',from:'self',to:bank.id,qty:1}]};
 const resolved=resolveProposalEntities(proposal,context,{accounts:true});
 assert.equal(resolved.proposal.effects[0].to,`${bank.id}|coin_river|vault`);
 assert.deepEqual(document,before);
 document.state.location='loc_hw_gate';
 assert.throws(()=>resolveProposalEntities(proposal,createRoutingContext(engine,document)),{code:'E-OPEN-ENTITY',reason:'not_present'});
});

test('A3 entities: an existing remote contractual party grants neither physical access nor proxy consent',()=>{
 const {engine,document,people}=fixture(),target=people[0];
 document.state.npcs[target].location='loc_not_here';const before=structuredClone(document),context=createRoutingContext(engine,document);
 const proposal={intent:'xyzzy',effects:[{op:'obligation.create',id:'test-remote-party',obligationKind:'loan',debtor:'self',creditor:target,terms:{principal:1}}]};
 const result=resolveProposalEntities(proposal,context);
 assert.deepEqual(result.ambiguities,[]);assert.equal(result.proposal.effects[0].creditor,target);
 assert.equal(context.resolve(target).reason,'not_present');
 assert.throws(()=>resolveProposalEntities(vital(target),context),{code:'E-OPEN-ENTITY',reason:'not_present'});
 assert.throws(()=>prepareOpenAction(engine,document,proposal),{code:'E-OPEN-OBLIGATION'});
 assert.deepEqual(document,before);
});

test('A3 entities: a learned map destination can route travel without becoming a perceivable physical target',()=>{
 const {engine,document}=fixture();document.state.location='loc_hw_gate';
 const proposal={intent:'沿路前往白石镇',target:'loc_bs',effects:[{op:'move',entity:'self',to:'loc_bs',mode:'walk'}]};
 assert.throws(()=>resolveProposalEntities(proposal,createRoutingContext(engine,document)),{code:'E-OPEN-ENTITY',reason:'not_perceivable'});
 document.state.discoveries??={};document.state.discoveries.loc_bs={minute:document.state.minute,source:'亲历'};
 const before=structuredClone(document),context=createRoutingContext(engine,document);
 assert.equal(context.resolveDestination('loc_bs').value,'loc_bs');
 assert.equal(context.resolve('loc_bs').reason,'not_perceivable');
 const prepared=prepareOpenAction(engine,document,proposal);
 assert.equal(prepared.status,'routed');assert.equal(prepared.routed,'core:move');assert.equal(prepared.slots.destination,'loc_bs');
 assert.throws(()=>resolveProposalEntities(vital('loc_bs'),context),{code:'E-OPEN-ENTITY',reason:'not_perceivable'});
 assert.deepEqual(document,before);
});
