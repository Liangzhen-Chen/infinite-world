import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import '../server-plugin/primitives-runtime.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {modelActionCatalog,builderToolCall} from '../extension/tools.mjs';
import {deriveOpenSourceLimits} from '../server-plugin/action-limits.mjs';
import {useTool} from '../server-plugin/items.mjs';
import {refusalProjection} from '../server-plugin/action-rejection.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {createRoutingContext,routeAction} from '../server-plugin/action-router.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {checkDie} from '../server-plugin/checks.mjs';
import {bag} from '../server-plugin/stock.mjs';
import {accountKey} from '../server-plugin/ledger.mjs';
import {transferHolding} from '../server-plugin/holdings.mjs';
import {createPlaytestServer} from '../tools/playtest-runner.mjs';
import {createOpenActionContext} from '../server-plugin/open-actions.mjs';
import {limitOpenEffects} from '../server-plugin/action-limits.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const home='bld_hw_qingdeng';
function fixture(kind='item',carried=true){
 const engine=new WorldEngine(structuredClone(world));
 const initial=engine.initialFromLegacy(seed,'affordance-state');
 const setup=applyIntentSetup(engine,initial,{location:home,inventory:{item_staff:1,item_iron_wire:1},objects:[
  {id:'door',template:'thing',kind,name:'待查木门',owner:'player',location:home,...(carried?{carriedBy:'player'}:{}),material:'wood',condition:100,mechanism:'mechanical_lock',locked:true},
 ]});
 assert.deepEqual(setup.setupUnmet,[]);
 const document=setup.document;
 // Same use, different native item stages: a caller's selection must survive.
 for(const [id,stage] of [['item_staff',4],['item_iron_wire',1]]){
  Object.assign(engine.byId.get(id),{tags:['tool','unlock','grip'],stage});
 }
 return {engine,document,door:setup.bindings.door};
}
function menu(f,target=f.door){return worldActions(f.engine.scoped(f.document),f.document,{target});}
function shape(row){
 assert.equal(typeof row.reason,'string');
 for(const key of ['missing','repair','alternatives'])assert.ok(Array.isArray(row[key])&&row[key].length,key);
 assert.ok(Object.hasOwn(row,'fallback'));
}
function criticalId(document,prefix,suffix=''){
 for(let i=0;i<300;i++)if(checkDie(document,`${prefix}-${i}${suffix}`,'d20')===20)return `${prefix}-${i}`;
 throw Error('No deterministic critical roll');
}
async function act(f,action,slots,eventId){
 const out=await f.engine.reduce(f.document,{tool:'world_act',args:{action,slots},eventId});
 f.document=applyPatches(f.document,out.patches);return out.result;
}

test('entity card: current door state, registered tool choice and model projection; reads write nothing',async()=>{
 const f=fixture(),before=structuredClone(f.document),card=menu(f).target;
 assert.equal(card.id,f.door);assert.equal(card.state.locked,true);assert.equal(card.state.material,'wood');
 const unlock=card.relatedActions.find(row=>row.id==='core:environment.unlock');
 assert.ok(unlock);assert.equal(unlock.fill.target,f.door);assert.equal(unlock.tool,'item_iron_wire');
 // A3CP bounds the model projection; the player card still carries every
 // source/tool/permission above. The current identity and state must survive.
 const projected=modelActionCatalog(menu(f)).target;
 assert.equal(projected.id,card.id);assert.deepEqual(projected.state,card.state);
 assert.ok(projected.primitives.some(row=>row.op==='fact.set'&&row.kind==='condition'));
 // a3r1 retains kinds/choices on the first relevant rows. Keep identity and
 // required-slot equality, and verify any retained slot descriptions against
 // the full player-facing card rather than enforce the old lossy key set.
 for(const row of projected.relatedActions){
  const source=card.relatedActions.find(action=>action.id===row.id);
  assert.ok(source);assert.equal(row.label,source.label);
  assert.deepEqual(row.required,source.slots.filter(slot=>slot.required).map(slot=>slot.name));
  if(row.slots)assert.deepEqual(row.slots.map(slot=>[slot.name,slot.kind]),source.slots.map(slot=>[slot.name,slot.kind]));
 }
 assert.deepEqual(f.document,before);
 // The actual registered action owns the check; inspect reflects its receipt.
 const result=await act(f,unlock.id,{...unlock.fill,tool:'item_staff'},criticalId(f.document,'inspect-unlock'));
 assert.equal(result.receipt.status,'committed');
 assert.equal(result.check.tools[0].item,'item_staff');
 assert.equal(menu(f).target.state.locked,result.locked??result.receipt.legacy?.locked??!result.success);
 assert.equal(menu(f).target.state.locked,false,'deterministic fixture unlock succeeds');
});

test('entity card: per-source bounds equal the same native source and proposal clipping; existing query/propose/receipt flow',async()=>{
 const f=fixture(),card=menu(f).target;
 const row=card.primitives.find(row=>row.effect.op==='fact.set'&&row.effect.field==='condition'&&row.tool==='item_staff');
 assert.ok(row);assert.equal(row.blocked,undefined);
 const proposal={intent:'一边打磨一边说话',means:row.means,effects:[{...row.effect,delta:-99},{op:'emit',verb:'tell',visibility:'witnessed',payload:{text:'正在打磨'}}]};
 assert.deepEqual(row.source,deriveOpenSourceLimits(f.engine,f.document,proposal,proposal.effects[0]));
 const before=structuredClone(f.document),input={...builderToolCall('open:proposal',proposal),eventId:criticalId(f.document,'inspect-work',':action-check')};
 const preview=await f.engine.previewAction(f.document,input);
 assert.equal(preview.receipt.routing.status,'open');
 assert.ok(preview.receipt.trimmed.some(t=>t.requested===-99&&t.applied===-row.bounds.delta));
 assert.deepEqual(f.document,before);
 const out=await f.engine.reduce(f.document,input);f.document=applyPatches(f.document,out.patches);
 assert.equal(out.result.receipt.status,'committed');
 assert.ok(menu(f).target.state.condition<card.state.condition);
 assert.ok(menu(f).target.state.condition>=card.state.condition-row.bounds.delta);
});

test('specified tools have priority; invalid, broken and wrong-use choices refuse without changing state',async()=>{
 const f=fixture(),d=f.engine.primitiveDraft(f.document),before=structuredClone(d.document);
 assert.equal(useTool(d,f.engine,'unlock'),'item_iron_wire');
 assert.equal(useTool(d,f.engine,'unlock','item_staff'),'item_staff');
 for(const id of ['missing','item_hoe',null,''])assert.throws(()=>useTool(d,f.engine,'unlock',id),e=>{shape(refusalProjection(e));assert.equal(e.code,'E-ACTION-TOOL');assert.match(e.message,/指定工具/);return true;});
 assert.deepEqual(d.patches,[]);assert.deepEqual(d.document,before);
 for(const change of [bag=>{bag.durability=0;},bag=>{bag.tags=['food'];}]){
  const copy=fixture();change(copy.document.state.inventory.item_staff);
  const old=structuredClone(copy.document);
  const result=await act(copy,'core:environment.unlock',{target:copy.door,tool:'item_staff'},'inspect-bad-tool');
  assert.equal(result.receipt.status,'rejected');assert.equal(result.receipt.code,'E-ACTION-TOOL');shape(result.receipt);
  assert.deepEqual(copy.document,old);
 }
});

test('means.tools is extracted only into the authorized registered tool slot',()=>{
 const f=fixture(),proposal={intent:'打开锁',means:{tools:['item_staff']},effects:[{op:'fact.set',entity:f.door,field:'locked',value:false}]};
 const registry=f.engine.world.actionDefinitions??loadActionRegistry(),context=createRoutingContext(f.engine,f.document);
 const routed=routeAction(proposal,registry,context);
 const unlock=routed.candidates.find(row=>row.id==='core:environment.unlock');
 assert.ok(unlock);assert.equal(unlock.slots.tool,'item_staff');
 const explicit=routeAction({...proposal,means:{tool:'item_iron_wire',tools:['item_staff']}},registry,context).candidates.find(row=>row.id===unlock.id);
 assert.equal(explicit.slots.tool,'item_iron_wire');
});

test('a locally visible runtime building has a state card and tool route without inventing contact range',async()=>{
 const f=fixture('building',false),card=menu(f).target;
 assert.equal(card.kind,'building');assert.equal(card.state.locked,true);
 const unlock=card.relatedActions.find(row=>row.id==='core:environment.unlock');assert.ok(unlock);shape(unlock.blocked);
 const proposal={intent:'尝试开锁',means:{tools:['item_staff']},effects:[{op:'fact.set',entity:f.door,field:'locked',value:false}]};
 const route=routeAction(proposal,f.engine.world.actionDefinitions,createRoutingContext(f.engine,f.document));
 assert.equal(route.routed,'core:environment.unlock');assert.equal(route.candidates[0].slots.tool,'item_staff');
 const before=structuredClone(f.document),out=await f.engine.previewAction(f.document,{tool:'world_propose',args:proposal,eventId:'inspect-building'});
 assert.equal(out.receipt.status,'rejected');assert.equal(out.receipt.code,'E-ACTION-REACH');assert.deepEqual(f.document,before);
});

test('an unavailable explicitly proposed tool is not discarded in favour of a held automatic choice',async()=>{
 const f=fixture(),before=structuredClone(f.document);
 for(const means of [{tools:['item_hoe']},{tool:'item_hoe'},{tools:['missing-tool']},{tools:['item_hoe'],tool:'item_staff'}]){
  const selected=means.tool??means.tools[0];
  const out=await f.engine.previewAction(f.document,{tool:'world_propose',eventId:'inspect-invalid-proposed-tool',args:{intent:'尝试开锁',means,effects:[{op:'fact.set',entity:f.door,field:'locked',value:false}]}});
  if(selected==='item_staff')assert.equal(out.receipt.status,'preview');
  else {assert.equal(out.receipt.status,'rejected');assert.equal(out.receipt.code,'E-ACTION-TOOL');shape(out.receipt);}
  assert.deepEqual(f.document,before);
 }
});

test('old query gives no authority: move the selected tool away, then submission rechecks possession',async()=>{
 const f=fixture(),choice=menu(f).target.relatedActions.find(row=>row.id==='core:environment.unlock');
 assert.equal(choice.tool,'item_iron_wire');
 const dropped=await f.engine.reduce(f.document,{tool:'world_propose',eventId:'inspect-remove',args:{intent:'消耗自己的铁丝并说明',effects:[{op:'transfer',from:bag(f.engine,'player',choice.tool),to:accountKey('sink:consume',choice.tool,'action'),qty:1},{op:'emit',verb:'tell',target:'player',visibility:'private',payload:{text:'铁丝已经消耗'}}]}});
 f.document=applyPatches(f.document,dropped.patches);
 assert.equal(dropped.result.receipt.status,'committed');
 const before=structuredClone(f.document),result=await act(f,choice.id,choice.fill,'inspect-stale-tool');
 assert.equal(result.receipt.status,'rejected');shape(result.receipt);assert.deepEqual(f.document,before);
 assert.equal(menu(f).target.relatedActions.find(row=>row.id===choice.id).tool,'item_staff');
});

test('hidden entity and hidden state do not change either player or model cards',()=>{
 const f=fixture(),base=menu(f),other=structuredClone(f.document);
 const physical=other.state.records[`physical_item:${f.door}`];
 physical.facts.toxic=true;physical.facts.secret='secret-value';physical.facts.contaminated=true;
 const twin={...f,document:other};
 assert.deepEqual(menu(twin),base);assert.deepEqual(modelActionCatalog(menu(twin)),modelActionCatalog(base));
 physical.facts.hidden=true;
 assert.equal(menu(twin).target,undefined);assert.equal(modelActionCatalog(menu(twin)).target,undefined);
 assert.equal(JSON.stringify(menu(twin)).includes(f.door),false);
 assert.equal(menu(twin,'nonexistent-hidden-object').target,undefined);
});

test('old query gives no authority after the native ownership transfer protocol removes the right',async()=>{
 const f=fixture(),ability=menu(f).target.primitives.find(row=>row.effect.field==='condition'&&row.tool==='item_staff');
 assert.ok(ability);assert.equal(ability.blocked,undefined);
 const owned=Object.values(f.document.holdings.rows).find(row=>row.kind==='owns'&&row.subject===f.door&&row.holder==='player'&&row.until===undefined);
 assert.ok(owned);
 // Use the real lifecycle operation, retaining its declared writer and hooks;
 // the submission below still enters through the existing proposal gateway.
 const d=f.engine.primitiveDraft(f.document);
 transferHolding(d,{id:owned.id,holder:Object.keys(f.document.state.npcs)[0],writer:owned.writer,reason:'transferred',eventId:'inspect-ownership-transfer',engine:f.engine});
 f.document=applyPatches(f.document,d.patches);
 const now=menu(f).target.primitives.find(row=>row.effect.field==='condition'&&row.tool==='item_staff');shape(now.blocked);
 // K6 (76365571, legality is a consequence): the stale query confers no right. Working the door that now
 // belongs to someone else still physically happens; the missing title is committed as an offense against
 // the new owner under this act's event, not ignored as if the old right still held.
 const holder=Object.keys(f.document.state.npcs)[0];
 const out=await f.engine.reduce(f.document,{tool:'world_propose',eventId:'inspect-stale-authority',args:{intent:'一边打磨一边说话',means:ability.means,effects:[ability.effect,{op:'emit',verb:'tell',visibility:'witnessed',payload:{text:'正在打磨'}}]}});
 assert.equal(out.result.receipt.status,'committed');const after=applyPatches(f.document,out.patches);
 const offense=out.result.receipt.consequences.find(c=>c.type==='offense'),row=after.state.records[offense?.record];
 assert.ok(offense,'acting on the transferred door is an offense');assert.equal(offense.victim,holder);
 assert.equal(row.sourceEvent,'inspect-stale-authority');assert.equal(row.offender,'player');assert.equal(row.subject.id,f.door);
});

test('hidden NPCs never enter scene text, selectors, target cards or the model projection',()=>{
 const f=fixture(),[id,npc]=Object.entries(f.document.state.npcs)[0];f.document.state.location=npc.location;
 npc.hidden=true;npc.name='不可知的人名';
 const result=menu(f,id),encoded=JSON.stringify(result);
 assert.equal(result.target,undefined);assert.equal(encoded.includes('不可知的人名'),false);
 const paths=(value,path='')=>typeof value==='string'&&value.includes(id)?[path]:value&&typeof value==='object'?Object.entries(value).flatMap(([key,child])=>paths(child,`${path}.${key}`)):[];
 assert.equal(encoded.includes(id),false,paths(result).join(', '));assert.equal(JSON.stringify(modelActionCatalog(result)).includes(id),false);
});

test('known spell caps use the same current reward limits and resource prerequisites as submission',()=>{
 const f=fixture(),spell=f.engine.byId.get('spell_s3_mend_palm');
 const setup=applyIntentSetup(f.engine,f.document,{abilities:{skills:{[spell.skill]:600},spells:[spell.id]}});
 assert.deepEqual(setup.setupUnmet,[]);f.document=setup.document;
 const before=structuredClone(f.document),row=menu(f,'player').target.primitives.find(row=>row.source.id===spell.id&&row.effect.delta>0);
 assert.ok(row);assert.ok(row.requirements.mp>=0);
 const proposal={intent:'查看当前手段',means:row.means,effects:[{...row.effect,delta:row.source.bounds.delta}]};
 const native=createOpenActionContext(f.engine,f.document,proposal),routing=routeAction(proposal,f.engine.world.actionDefinitions,native.routing);
 const actual=limitOpenEffects(proposal,native.limits(f.document,routing.nearest,routing.candidates));
 assert.equal(row.bounds.delta,actual.effects[0]?.delta??0);assert.deepEqual(f.document,before);
 f.document.state.player.mp=0;
 const blocked=menu(f,'player').target.primitives.find(value=>value.source.id===spell.id&&value.effect.delta>0);
 assert.ok(spell.mp>0);shape(blocked.blocked);
});

test('environment features and runtime entities resolve by visible name and always use fresh state',()=>{
 const f=fixture(),feature=f.engine.world.locations.find(row=>row.features?.some(x=>!x.hidden&&!x.private));
 assert.ok(feature);f.document.state.location=feature.id;
 const row=feature.features.find(x=>!x.hidden&&!x.private);
 const initial=menu(f,row.id).target;assert.equal(initial.kind,'feature');
 // The fallback now previews a real mark (including time advancement). Keep
 // the existing physical-feature identity contract: id + location, as written
 // by the native environment handlers. State/privacy assertions stay intact.
 f.document.state.records[`physical_feature:${row.id}`]={category:'physical_feature',id:row.id,location:feature.id,state:{...row.state,integrity:37,toxinUg:900000}};
 const changed=menu(f,row.name).target;assert.equal(changed.id,row.id);assert.equal(changed.state.integrity,37);
 assert.equal(changed.state.toxinUg,undefined);assert.notDeepEqual(changed.state,initial.state);
});

test('present NPC summary updates without disclosing private mental state or relationship numbers',()=>{
 const f=fixture(),[id,npc]=Object.entries(f.document.state.npcs).find(([,row])=>!row.hidden&&!row.private);
 f.document.state.location=npc.location;
 const before=menu(f,id).target;assert.equal(before.state.present,true);assert.equal(typeof before.state.awake,'boolean');assert.equal(typeof before.state.stance,'string');
 npc.activity='睡眠';npc.trust=-80;
 const after=menu(f,id).target;assert.equal(after.state.awake,false);assert.notEqual(after.state.stance,before.state.stance);
 const copy=structuredClone(f.document);copy.state.npcs[id].mental={stress:99,secretThought:'hidden'};
 assert.deepEqual(menu({...f,document:copy},id).target,after);
 npc.location=home===npc.location?'loc_hw':home;
 assert.equal(menu(f,id).target,undefined);
});

test('existing HTTP actions/propose/execute transport carries the entity card through to a committed receipt',async t=>{
 const server=await createPlaytestServer({aiProfile:'T0'/*no model client: local rules only*/,world});t.after(()=>server.close());
 const created=await server.api('create',{}),campaignId=created.reference.campaignId;
 const initial=await server.api('read',{campaignId}),query=await server.api('actions',{campaignId,target:'player'});
 const speech=query.target.primitives.find(row=>row.effect.op==='emit'&&row.effect.verb==='tell');assert.ok(speech);
 // The compact model card keeps the same live state and the usable speech
 // class; the full card remains the submission source for the native preview.
 const projected=modelActionCatalog(query).target;
 assert.equal(projected.id,query.target.id);assert.deepEqual(projected.state,query.target.state);
 assert.ok(projected.primitives.some(row=>row.op==='emit'&&row.verb==='tell'&&row.available));
 const input=builderToolCall('open:proposal',{intent:'对自己说明先查再提',means:speech.means,effects:[{...speech.effect,payload:{text:'先查再提'}}]});
 const preview=await server.api('propose',{campaignId,...input,eventId:'inspect-http'});
 assert.equal(preview.receipt.status,'preview');
 assert.deepEqual((await server.api('read',{campaignId})).document,initial.document);
 const result=await server.api('execute',{campaignId,...input,eventId:'inspect-http',expectedSequence:initial.reference.sequence,anchor:null});
 assert.equal(result.result.receipt.status,'committed');
 assert.ok(result.result.receipt.applied.some(row=>row.op==='emit'));
});
