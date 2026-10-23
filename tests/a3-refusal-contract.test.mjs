import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {ActionRejection,refusalProjection} from '../server-plugin/action-rejection.mjs';
import {PrimitiveRejected} from '../server-plugin/primitive-policy.mjs';
import {actionBoundary,markFallback} from '../server-plugin/action-boundary.mjs';
import {prepareOpenAction,executeOpenSequence} from '../server-plugin/open-actions.mjs';
import {createPrimitiveFrame,commitPrimitives,queuePrimitiveProposal} from '../server-plugin/primitives.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {withLedger,openLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {ActionBuilder,renderActionBuilder,previewLines} from '../extension/action-builder.mjs';
import {actionLines} from '../server-plugin/action-text.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world));
 const document=withLedger(engine,engine.createCharacter(seed,{},'refusal-contract')).document;
 const people=Object.keys(document.state.npcs).slice(0,3);
 for(const id of people)document.state.npcs[id].location=document.state.location;
 return {engine,document,people};
}
const receiptOf=value=>value.receipt??value.result?.receipt;
function shape(value){
 assert.equal(typeof value.reason,'string');assert.ok(value.reason.length);
 for(const field of ['missing','repair','alternatives'])assert.ok(Array.isArray(value[field]),field);
 assert.ok(value.missing.length);assert.ok(value.repair.length);assert.ok(value.alternatives.length);
 assert.ok(Object.hasOwn(value,'fallback'));
 for(const row of value.alternatives)assert.ok(row.available===true||row.missing?.length,'advice must be checked or state its remaining prerequisites');
}
async function checkNext(engine,document,receipt){
 shape(receipt);shape(receipt.routing??receipt);
 for(const row of [...receipt.alternatives,receipt.fallback].filter(Boolean)){
  if(row.available!==true){if(row.action)assert.ok(row.missing?.length);continue;}
  const preview=await engine.previewAction(document,{tool:'world_act',eventId:`check-next:${row.action}`,args:{action:row.action,slots:row.slots}});
  assert.equal(receiptOf(preview).status,'preview',row.label);
 }
}
function install(engine,action){
 const actions=[...(engine.actionRegistry?.actions??engine.world.actionDefinitions.actions).filter(a=>a.id!==action.id),action];
 engine.actionRegistry={actions,byId:new Map(actions.map(a=>[a.id,a]))};return action;
}
const inputFor=(action,slots={},eventId='refusal-input')=>({tool:'world_act',eventId,args:{action,slots}});

test('registered refusal preserves source details and offers only currently previewable actions',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const input=inputFor('core:look'),error=new ActionRejection('E-ACTION-TEST','这扇门锁着',{missing:['门钥匙'],repair:['先取得这扇门的有效钥匙；未取得前可以在外面观察']});
 for(const preview of [true,false]){
  const out=await actionBoundary(engine,document,input,async()=>{throw error;},{preview}),receipt=receiptOf(out);
  assert.equal(receipt.code,error.code);assert.equal(receipt.reason,error.message);
  assert.deepEqual(receipt.missing,error.missing);assert.ok(receipt.repair.includes(error.repair[0]));
  assert.deepEqual(receipt.applied,[]);assert.deepEqual(receipt.events,[]);assert.deepEqual(receipt.cost,{time:0,resources:[]});
  if(!preview){assert.deepEqual(out.patches,[]);assert.equal(out.result.ok,false);}
  await checkNext(engine,document,receipt);assert.deepEqual(document,before);
 }
});

test('native registered primitive refusal keeps failing index; a smaller quantity really previews',async()=>{
 const {engine,document,people}=fixture(),from=accountKey('player','coin_river','purse'),to=accountKey(people[0],'coin_river','purse');
 install(engine,{id:'test:refusal-gift',label:'递交铜钱',slots:[{name:'qty',kind:'quantity',required:true}],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from,to,qty:{slot:'qty'}}]});
 const input=inputFor('test:refusal-gift',{qty:document.state.player.coins+1}),before=structuredClone(document);
 for(const run of [()=>engine.previewAction(document,input),()=>engine.reduce(document,input)]){
  const out=await run(),receipt=receiptOf(out);
  assert.equal(receipt.status,'rejected');assert.equal(receipt.code,'E-TRANSFER-BALANCE');assert.equal(receipt.index,0);
  assert.deepEqual(receipt.applied,[]);assert.deepEqual(receipt.routing.slots,input.args.slots);
  assert.ok(receipt.alternatives.some(row=>row.action==='test:refusal-gift'&&row.slots.qty===1&&row.available));
  await checkNext(engine,document,receipt);assert.deepEqual(document,before);
 }
});

test('domain rejection reaches preview and commit with no money, time, inventory or ledger effects',async()=>{
 const {engine,document}=fixture();
 // The native trade program owns stock, price, authority and cost checks.
 document.state.location=document.state.npcs.npc_hw_linsui.location;document.state.player.coins=0;
 document.ledger.accounts[accountKey('player','coin_river','purse')]=0;
 const input=inputFor('core:trade.buy',{seller:'npc_hw_linsui',item:'item_bread',quantity:1}),before=structuredClone(document);
 for(const preview of [true,false]){
  const out=await (preview?engine.previewAction(document,input):engine.reduce(document,input)),receipt=receiptOf(out);
  assert.equal(receipt.status,'rejected');assert.equal(receipt.code,'E-ACTION-SERVICE');assert.match(receipt.reason,/不提供.*交易.*服务/);
  assert.deepEqual(receipt.applied,[]);if(!preview)assert.deepEqual(out.patches,[]);
  await checkNext(engine,document,receipt);assert.deepEqual(document,before);
 }
});

test('supported core-omitted names retain the canonical rejection contract',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 for(const preview of [true,false]){
  const out=await actionBoundary(engine,document,inputFor('look'),async()=>{throw new PrimitiveRejected('E-CAPACITY','暂时无法行动');},{preview}),receipt=receiptOf(out);
  assert.equal(receipt.routed,'core:look');assert.equal(receipt.code,'E-CAPACITY');assert.deepEqual(receipt.applied,[]);await checkNext(engine,document,receipt);
 }
 assert.deepEqual(document,before);
});

test('open precheck refuses invented displacement and consent in preview and commit, retaining raw intent',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document);
 const proposals=[{intent:'隔空到远处',effects:[{op:'move',entity:'self',to:'未知远方',mode:'teleport'}]},
  {intent:'让他答应',consent:{granted:true},effects:[{op:'emit',verb:'tell',visibility:'private'}]}];
 for(const [index,args]of proposals.entries())for(const preview of [true,false]){
  const input={tool:'world_propose',eventId:`precheck:${index}`,args},out=await(preview?engine.previewAction(document,input):engine.reduce(document,input)),receipt=receiptOf(out);
  assert.equal(receipt.status,'rejected');assert.equal(receipt.code,index?'E-OPEN-CONSENT':'E-OPEN-MOVE');
  assert.deepEqual(receipt.routing.proposal,args);assert.equal(receipt.routing.intent,args.intent);
  assert.equal(receipt.fallback.intent,args.intent);assert.deepEqual(receipt.applied,[]);
  await checkNext(engine,document,receipt);assert.deepEqual(document,before);
 }
 const direct=new PrimitiveRejected('E-TRANSFER-BALANCE','账户余额不足',2);shape(direct);assert.equal(direct.index,2);
});

test('clarification exposes known candidates, requires choice, and never executes a guessed entity',async()=>{
 const {engine,document,people}=fixture(),[a,b,secret]=people;
 document.state.npcs[a].name=document.state.npcs[b].name='同名来客';
 document.state.npcs[secret].name='不应被看见的人';document.state.npcs[secret].location='loc_not_here';
 const args={intent:'给同名来客一点帮助',effects:[{op:'vital',target:'同名来客',type:'body:satiety',delta:1}]},before=structuredClone(document);
 const plan=prepareOpenAction(engine,document,args);shape(plan);assert.equal(plan.status,'needs_entities');
 assert.deepEqual(plan.ambiguities[0].candidates.map(row=>row.id),[a,b].sort());
 assert.equal(plan.alternatives.filter(row=>row.kind==='clarify').length,2);
 const out=await engine.previewAction(document,{tool:'world_propose',eventId:'clarify',args}),receipt=receiptOf(out);
 assert.equal(receipt.status,'not_submitted');assert.deepEqual(receipt.applied,[]);await checkNext(engine,document,receipt);
 assert.ok(!JSON.stringify(receipt).includes(secret));assert.ok(!JSON.stringify(receipt).includes('不应被看见的人'));
 assert.deepEqual(document,before);
});

test('missing goal, conflicting values and unsupported effects all explain an editable next step',async()=>{
 const {engine,document}=fixture();
 const proposals=[{intent:'我想做点事',effects:[]},
  {intent:'同时要两种结果',effects:[{op:'fact.set',entity:'player',field:'turbidity',value:1},{op:'fact.set',entity:'player',field:'turbidity',value:2}]},
  {intent:'凭空饱腹',effects:[{op:'vital',target:'player',type:'body:satiety',delta:100}]}];
 for(const [i,args]of proposals.entries()){
  const before=structuredClone(document),input={tool:'world_propose',eventId:`needs:${i}`,args};
  const preview=await engine.previewAction(document,input),receipt=receiptOf(preview);
  assert.equal(receipt.status,'not_submitted');assert.deepEqual(receipt.applied,[]);await checkNext(engine,document,receipt);
  assert.deepEqual(receipt.routing.proposal,args);assert.deepEqual(document,before);
  const submitted=receiptOf(await engine.reduce(document,input));assert.equal(submitted.status,'rejected');shape(submitted);assert.deepEqual(document,before);
 }
});

test('fallback checks actual capacity and local restrictions instead of merely finding configuration',async()=>{
 const {engine,document}=fixture(),intent='在这里摆出一幅树枝画',before=structuredClone(document);
 const allowed=markFallback(engine,document,intent);assert.equal(allowed.available,true);assert.equal(allowed.slots.intent,intent);
 assert.equal(receiptOf(await engine.previewAction(document,inputFor(allowed.action,allowed.slots))).status,'preview');
 const blocked=structuredClone(document);blocked.state.player.status='昏迷';
 const asleep=markFallback(engine,blocked,intent);assert.equal(asleep.available,false);assert.ok(asleep.missing.length);
 const place=engine.byId.get(document.state.location),saved=place.primitiveLimits;
 place.primitiveLimits={...saved,create:false};
 try{const refusal=markFallback(engine,document,intent);assert.equal(refusal.available,false);assert.match(refusal.reason,/不允许/);}
 finally{place.primitiveLimits=saved;}
 assert.deepEqual(document,before);
});

test('fallback checks the requested actor rather than borrowing player capacity',()=>{
 const {engine,document,people}=fixture(),actor=people[0],intent='留下求助的痕迹';
 document.state.player.status='昏迷';
 let before=structuredClone(document);
 assert.equal(markFallback(engine,document,intent).available,false);
 const offered=markFallback(engine,document,intent,{actor});
 assert.equal(offered.available,true);assert.equal(offered.slots.intent,intent);
 assert.deepEqual(document,before);
 document.state.player.status='正常';document.state.npcs[actor].status='昏迷';before=structuredClone(document);
 const refused=markFallback(engine,document,intent,{actor});
 assert.equal(refused.available,false);assert.ok(refused.missing.length);
 assert.equal(markFallback(engine,document,intent).available,true);
 assert.deepEqual(document,before);
});

test('sequence failure discards earlier staged effects and rechecks advice after rollback',async()=>{
 const {engine,document,people}=fixture(),from=accountKey('player','coin_river','purse'),to=accountKey(people[0],'coin_river','purse');
 install(engine,{id:'test:stage-transfer',label:'先交一文',slots:[],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from,to,qty:1}]});
 install(engine,{id:'test:stage-refuse',label:'再交铜钱',slots:[],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from,to,qty:document.state.player.coins+1}]});
 const args={intent:'分两次把钱交出去',effects:[{op:'transfer',from:'player',to:people[0],resource:'coin',qty:document.state.player.coins+2}]};
 const prepared={status:'sequence',routed:'open:proposal',steps:[{action:'test:stage-transfer',slots:{}},{action:'test:stage-refuse',slots:{}}]},before=structuredClone(document);
 for(const preview of [true,false]){
  const out=await executeOpenSequence(engine,document,{tool:'world_propose',eventId:'sequence-refusal',args},prepared,{preview}),receipt=receiptOf(out);
  assert.equal(receipt.status,'rejected');assert.equal(receipt.routing.failedStep,1);assert.equal(receipt.index,0);
  assert.equal(receipt.routing.intent,args.intent);assert.deepEqual(receipt.routing.proposal,args);
  assert.equal(receipt.fallback.intent,args.intent);assert.deepEqual(receipt.applied,[]);assert.deepEqual(receipt.cost,{time:0,resources:[]});
  if(!preview)assert.deepEqual(out.patches,[]);await checkNext(engine,document,receipt);assert.deepEqual(document,before);
 }
 assert.deepEqual(auditLedger(document.ledger),[]);
});

test('contest failure persists zero effects and gives a conditional, honest next step',async()=>{
 const {engine,document,people}=fixture(),d=engine.primitiveDraft(document),from=accountKey('player','coin_river','purse'),to=accountKey(people[0],'coin_river','purse');
 const effects=[{op:'transfer',from,to,qty:1}],frame=createRuntimePrimitiveFrame(engine,document,{actor:'player',eventId:'contest-refusal',source:{kind:'open',id:'open:proposal'}});
 const out=queuePrimitiveProposal(d,effects,frame,{claims:[{target:from,targetKind:'resource',quantity:1,capacity:1}]});
 d.contestPool[0].reject('同一份资源已先被其他行动取得');
 shape(out.receipt);assert.equal(out.receipt.status,'rejected');assert.deepEqual(out.receipt.applied,[]);assert.equal(out.receipt.cost,undefined);
 assert.equal(d.get('ledger','accounts',from),document.ledger.accounts[from]);assert.equal(d.get('ledger','accounts',to),document.ledger.accounts[to]);
 const saved=d.get('state','records','primitive:contest-refusal').receipt;assert.deepEqual(saved,out.receipt);
 const replay=commitPrimitives(JSON.parse(JSON.stringify(d.document)),effects,frame);assert.equal(replay.receipt.duplicate,true);assert.deepEqual(replay.patches,[]);
 // Public native dispatch initially sets ok:true for a completed reduction;
 // the losing receipt must override that envelope, not claim action success.
 const reduced=await actionBoundary(engine,document,inputFor('core:look'),async()=>({patches:d.patches,result:{ok:true,receipt:out.receipt}}));
 assert.equal(reduced.result.ok,false);assert.equal(reduced.result.receipt.status,'rejected');assert.deepEqual(reduced.result.receipt.applied,[]);
 const disabled=engine.primitiveDraft(document),pending=queuePrimitiveProposal(disabled,effects,frame,{claims:[{target:from,targetKind:'resource',quantity:1,capacity:1}]});
 disabled.set(['state','player','status'],'昏迷');disabled.contestPool[0].execute();
 // Runtime capacity validation occurs before entering an effect, so retain
 // its null index rather than inventing an effect index for the whole action.
 shape(pending.receipt);assert.equal(pending.receipt.code,'E-CAPACITY');assert.equal(pending.receipt.index,null);assert.deepEqual(pending.receipt.applied,[]);
 assert.equal(disabled.get('ledger','accounts',from),document.ledger.accounts[from]);assert.equal(disabled.get('state','minute'),document.state.minute);
 const invalidated=await actionBoundary(engine,document,inputFor('core:look'),async()=>({patches:disabled.patches,result:{ok:true,receipt:pending.receipt}}));
 assert.equal(invalidated.result.receipt.fallback.available,false,'another settled change can remove the ability to leave a mark');
});

test('sequence debt clarification fails at its own step and rolls back earlier transfers',async()=>{
 const {engine,document,people}=fixture(),from=accountKey('player','coin_river','purse'),to=accountKey(people[0],'coin_river','purse');
 install(engine,{id:'test:before-debt',label:'先交一文',slots:[],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from,to,qty:1}]});
 const args={intent:'先交钱再还债',effects:[]},prepared={status:'sequence',routed:'open:proposal',steps:[{action:'test:before-debt',slots:{}},{action:'test:before-debt',slots:{},debtReference:{id:'missing-debt',debtor:'player',creditor:people[0],amount:1}}]},before=structuredClone(document);
 for(const preview of [true,false]){
  const out=await executeOpenSequence(engine,document,{eventId:'sequence-debt-missing',args},prepared,{preview}),receipt=receiptOf(out);
  assert.equal(receipt.status,'rejected');assert.equal(receipt.code,'E-OPEN-OBLIGATION');assert.equal(receipt.routing.failedStep,1);
  assert.deepEqual(receipt.routing.proposal,args);assert.deepEqual(receipt.cost,{time:0,resources:[]});if(!preview)assert.deepEqual(out.patches,[]);
  await checkNext(engine,document,receipt);assert.deepEqual(document,before);
 }
});

test('sequence advice cannot spend resources which existed only in discarded earlier steps',async()=>{
 const {engine,document,people}=fixture(),from=accountKey('player','coin_river','purse'),to=accountKey(people[0],'coin_river','purse');
 document.state.player.coins=0;document.ledger=openLedger(engine,document);
 install(engine,{id:'test:stage-income',label:'先收一文',slots:[],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from:to,to:from,qty:1}]});
 install(engine,{id:'test:stage-outgoing',label:'再交铜钱',slots:[{name:'qty',kind:'quantity',required:true}],cost:{owner:'primitives',time:1},outcomes:[{op:'transfer',from,to,qty:{slot:'qty'}}]});
 // The NPC, not the player proposal, gives actual limited property consent.
 const grantFrame=createRuntimePrimitiveFrame(engine,document,{actor:people[0],eventId:'income-consent',source:{kind:'catalog',id:'core:consent.grant'}});
 Object.assign(document,applyPatches(document,commitPrimitives(document,[{op:'emit',verb:'consent_given',target:'player',visibility:'private',payload:{scope:'property',purpose:['test:stage-income'],until:document.state.minute+100}}],grantFrame).patches));
 const prepared={status:'sequence',routed:'open:proposal',steps:[{action:'test:stage-income',slots:{}},{action:'test:stage-outgoing',slots:{qty:2}}]},args={intent:'先收后付',effects:[]},before=structuredClone(document);
 const out=await executeOpenSequence(engine,document,{eventId:'rolled-back-resources',args},prepared),receipt=receiptOf(out);
 assert.equal(receipt.status,'rejected');assert.equal(receipt.routing.failedStep,1);assert.deepEqual(out.patches,[]);
 assert.ok(!receipt.alternatives.some(row=>row.action==='test:stage-outgoing'&&row.available));
 assert.ok(!receipt.repair.some(text=>text.includes('再交铜钱')&&text.includes('减为 1')));
 await checkNext(engine,document,receipt);assert.deepEqual(document,before);assert.deepEqual(auditLedger(document.ledger),[]);
});

test('private state cannot add candidates or executable advice; authority and consent remain required',async()=>{
 const {engine,document,people}=fixture(),remote=people[2];document.state.npcs[remote].location='loc_not_here';
 const input={tool:'world_propose',eventId:'private-refusal',args:{intent:'请一个不在眼前的人帮忙',effects:[{op:'vital',target:remote,type:'body:satiety',delta:1}]}},before=structuredClone(document);
 const base=receiptOf(await engine.previewAction(document,input)),other=structuredClone(document);
 other.state.npcs[remote].coins+=10000;other.state.npcs[remote].name='暗中的另一个名字';other.state.records.secret={category:'secret',owner:remote,content:'绝密关系'};
 const changed=receiptOf(await engine.previewAction(other,input));assert.deepEqual(changed,base);assert.ok(!JSON.stringify(base).includes('暗中的另一个名字'));await checkNext(engine,document,base);
 // An exact id guessed by the player must not reveal whether a private entity
 // exists. The raw proposal is their own input, not a discovered entity.
 const hiddenInput={tool:'world_propose',eventId:'hidden-existence',args:{intent:'看看那个暗格',effects:[{op:'vital',target:'feature_refusal_secret',type:'body:satiety',delta:1}]}};
 const unknown=receiptOf(await engine.previewAction(document,hiddenInput)),place=engine.byId.get(document.state.location);
 place.features??=[];place.features.push({id:'feature_refusal_secret',name:'未公开的密室',kind:'feature',position:[0,0],state:{},hidden:true,private:true});
 const hidden=receiptOf(await engine.previewAction(document,hiddenInput));assert.deepEqual(hidden,unknown);assert.ok(!JSON.stringify(hidden).includes('未公开的密室'));
 const denied=await actionBoundary(engine,document,inputFor('core:look'),async()=>{throw new ActionRejection('E-AUTHORITY','没有处置许可');},{preview:true});
 shape(denied.receipt);assert.ok(!denied.receipt.alternatives.some(row=>row.action==='core:consent.grant'));
 assert.match(denied.receipt.repair[0],/取得有效同意或授权/);assert.deepEqual(document,before);
});

test('plain faults and missing native connectors still throw, including during contested commit',async()=>{
 const {engine,document}=fixture(),input=inputFor('core:look');
 for(const error of [new TypeError('broken connector'),new Error('不是世界条件'),new PrimitiveRejected('E-PRIMITIVE-CONNECTOR','missing connector'),new PrimitiveRejected('E-ACTION-COST','broken cost')]){
  await assert.rejects(actionBoundary(engine,document,input,async()=>{throw error;}),actual=>actual===error);
 }
 const d=engine.primitiveDraft(document),effects=[{op:'emit',verb:'tell',visibility:'private'}];let broken=false;
 const frame=createPrimitiveFrame({actor:'player',eventId:'contest-fault',source:{kind:'open',id:'open:proposal'},canAct:()=>{if(broken)throw new TypeError('injected fault');return {allowed:true};},authority:()=>({allowed:true}),location:()=>document.state.location,mirrorTransfer:()=>{},verbs:['tell']});
 queuePrimitiveProposal(d,effects,frame,{claims:[{target:'one-slot',quantity:1,capacity:1}]});broken=true;
 assert.throws(()=>d.contestPool[0].execute(),TypeError);assert.equal(d.get('state','records','primitive:contest-fault'),undefined);
});

// A tiny DOM records the actual rendered controls, without a browser process.
function container(){
 const doc={createElement(tag){return {tag,textContent:'',children:[],append(...nodes){this.children.push(...nodes);},setAttribute(){}};}};
 return {ownerDocument:doc,children:[],append(...nodes){this.children.push(...nodes);},setAttribute(){}};
}
function descendants(root){return root.children.flatMap(row=>[row,...descendants(row)]);}
test('builder renders reason, missing conditions and clickable edits/alternatives after preview and submit refusal',async()=>{
 const action={id:'test:builder-refusal',label:'试着递钱',slots:[{name:'qty',kind:'quantity',required:true}]};
 const details=refusalProjection({reason:'钱不够',missing:['两文铜钱'],repair:['可以先交一文，再安排余款'],alternatives:[{action:action.id,label:'先交一文',slots:{qty:1},available:true,missing:[]}],fallback:{action:'open:leave_mark',available:false,missing:['昏迷时不能留痕']}});
 const receipt={status:'rejected',...details,routing:{...details}},builder=new ActionBuilder({preview:async()=>({receipt}),act:async()=>({result:{ok:false,receipt},patches:[]}),newEventId:()=> 'builder-refusal'});
 builder.choose(action);builder.setSlot('qty',3);builder.step=3;
 assert.equal(await builder.preview(),null);assert.equal(builder.error,'钱不够');assert.deepEqual(builder.feedback.missing,['两文铜钱']);
 let changed=0;const root=container();renderActionBuilder(root,{builder,here:{},api:async()=>({actions:[action]}),onChange:()=>changed++,onClose(){},onResult(){}});
 const nodes=descendants(root),text=nodes.map(n=>n.textContent).join('\n');assert.match(text,/钱不够/);assert.match(text,/两文铜钱/);assert.match(text,/可以先交一文/);
 const next=nodes.find(n=>n.tag==='button'&&n.textContent==='先交一文');assert.ok(next);await next.onclick();assert.equal(builder.slots.qty,1);assert.ok(changed);assert.equal(builder.quote,null);
 builder.quote={args:{action:action.id,slots:{qty:1}},eventId:'confirmed-refusal',revision:builder.revision};
 const result=await builder.confirm();assert.equal(result.result.ok,false);assert.equal(builder.error,'钱不够');assert.deepEqual(builder.feedback.repair,details.repair);
 assert.ok(previewLines({receipt}).some(line=>line.includes('钱不够')));
});

test('refusal narration reports the failure and next step without inventing success',()=>{
 const {engine,document}=fixture(),receipt={status:'rejected',...refusalProjection({reason:'门锁着',missing:['钥匙'],repair:['先取得钥匙；可以在外面观察']})};
 const rendered=actionLines({engine,action:{label:'开门'},before:document,after:document,args:{},result:{receipt}});
 assert.deepEqual(rendered.effects,[]);assert.match(rendered.lines.join('\n'),/门锁着/);assert.match(rendered.lines.join('\n'),/钥匙/);assert.match(rendered.lines.join('\n'),/外面观察/);
});

test('local missing choices and blocked menu choices clear executable quotes and offer an edit',async()=>{
 const builder=new ActionBuilder({preview:async()=>{throw new TypeError('injected UI service fault');},act:async()=>{throw Error('must not execute');}}),action={id:'test:local',label:'递钱',slots:[{name:'qty',kind:'quantity',required:true}]};
 builder.choose(action);await builder.preview();shape(builder.feedback);assert.equal(builder.quote,null);
 builder.setSlot('qty',1);await builder.preview();assert.equal(builder.error,'injected UI service fault');assert.equal(builder.feedback,null);
 builder.quote={revision:builder.revision};builder.choose({...action,blocked:'尚无物品处置权限'});
 shape(builder.feedback);assert.equal(builder.action,null);assert.equal(builder.quote,null);assert.equal(await builder.confirm(),null);
});
