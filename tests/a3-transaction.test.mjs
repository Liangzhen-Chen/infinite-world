import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLedger,accountKey,withLedger} from '../server-plugin/ledger.mjs';
import {emptyHoldings,openHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {createPrimitiveFrame,planPrimitives,commitPrimitives,queuePrimitiveProposal} from '../server-plugin/primitives.mjs';
import {resolveContest,Scheduler} from '../server-plugin/scheduler.mjs';
import {registerWorldEventSubscriber} from '../server-plugin/world-events.mjs';
import {createRuntimePrimitiveFrame,primitiveContext} from '../server-plugin/primitives-runtime.mjs';
import {consent} from '../server-plugin/action-consent.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import fs from 'node:fs/promises';
const a=accountKey('player','coin_river','purse'),b=accountKey('npc_a','coin_river','purse');
function fixture(){
 const document={state:{minute:2,records:{}},ledger:emptyLedger(),holdings:emptyHoldings()};document.ledger.accounts={[a]:10,[b]:0};
 const options={actor:'player',eventId:'tx-one',source:{kind:'open',id:'builder'},canAct:()=>({allowed:true}),authority:()=>({allowed:true}),location:()=> 'loc',mirrorTransfer:()=>{},factPolicy:{project:{condition:{type:'number',min:0,max:100}}},verbs:['tell']};
 document.holdings.entities.project_a={id:'project_a',kind:'project',facts:{condition:20}};
 return {document,options,frame:createPrimitiveFrame(options),effect:{op:'transfer',from:a,to:b,qty:6}};
}
test('A3 transaction: second transfer failure rolls back the whole proposal',()=>{
 const {document,frame,effect}=fixture(),before=structuredClone(document);assert.throws(()=>commitPrimitives(document,[effect,effect],frame),e=>e.code==='E-TRANSFER-BALANCE'&&e.index===1);assert.deepEqual(document,before);
});
test('A3 transaction: commit rechecks facts after preview; no stale authority or balance',()=>{
 const {document,frame,effect,options}=fixture();planPrimitives(document,[effect],frame);document.ledger.accounts[a]=1;
 assert.throws(()=>commitPrimitives(document,[effect],frame),{code:'E-TRANSFER-BALANCE'});
 document.ledger.accounts[a]=10;let permitted=true;const f=createPrimitiveFrame({...options,authority:()=>({allowed:permitted})});planPrimitives(document,[effect],f);permitted=false;
 assert.throws(()=>commitPrimitives(document,[effect],f),{code:'E-AUTHORITY'});
});
test('A3 transaction: duplicate event after JSON save/load is idempotent; changed payload rejects',()=>{
 const {document,frame,effect}=fixture(),first=commitPrimitives(document,[effect],frame),next=JSON.parse(JSON.stringify(applyPatches(document,first.patches))),again=commitPrimitives(next,[effect],frame);
 assert.deepEqual(again.patches,[]);assert.deepEqual(again.events,[]);assert.equal(again.receipt.duplicate,true);
 assert.throws(()=>commitPrimitives(next,[{...effect,qty:1}],frame),{code:'E-PRIMITIVE-DUPLICATE'});
 // Removing the committed patches and recomputing produces identical events.
 assert.deepEqual(commitPrimitives(document,[effect],frame),first);
});
test('A3 transaction: fact.set uses registered writer and whitelist, never accounts or skills',()=>{
 const {document,frame}=fixture(),effect={op:'fact.set',entity:'project_a',field:'condition',delta:5},result=commitPrimitives(document,[effect],frame),next=applyPatches(document,result.patches);
 assert.equal(next.holdings.entities.project_a.facts.condition,25);assert.equal(document.holdings.entities.project_a.facts.condition,20);
 for(const field of ['coin','coins','treasury','inventory','skills','age','belief','minute','__proto__'])assert.throws(()=>commitPrimitives(document,[{...effect,field}],frame),{code:'E-FACT-FIELD'});
 assert.throws(()=>commitPrimitives(document,[{...effect,delta:81}],frame),{code:'E-FACT-RANGE'});
});
test('A3 transaction: reaction-facing event is returned only after all effects succeed',()=>{
 const {document,frame,effect}=fixture(),emit={op:'emit',verb:'tell',target:'npc_a',payload:{text:'hello'},visibility:'private'};
 const result=commitPrimitives(document,[effect,emit],frame);assert.equal(result.events[2].result.visibility,'private');assert.equal(result.events[2].parent,'tx-one');
 assert.throws(()=>commitPrimitives(document,[emit,{...effect,qty:11}],frame),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(document.state.records,{});
});

const runtimeWorld=await loadWorld(),runtimeSeed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function runtimeFixture(){
 const engine=new WorldEngine(structuredClone(runtimeWorld));
 const document=withLedger(engine,engine.createCharacter(runtimeSeed,{},'a3-runtime')).document;
 document.holdings=openHoldings(engine,document);
 const npc=Object.keys(document.state.npcs).find(id=>document.state.npcs[id].location&&document.state.npcs[id].coins>0);
 document.state.location=document.state.npcs[npc].location;
 assert.ok(npc,'requires an actually present recipient');
 return {engine,document,npc};
}
test('A3 runtime: possessed property transfer retains lifecycle, original edge and legality tags',()=>{
 const {engine,document,npc}=runtimeFixture(),id=`h${++document.holdings.seq}`;
 document.holdings.entities.wreck_a={id:'wreck_a',kind:'wreck',facts:{}};
 document.holdings.locations.wreck_a={mode:'carried',at:'player'};
 document.holdings.rows[id]={id,kind:'owns',holder:npc,subject:'wreck_a',terms:{share:1}};
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'sell-possessed',source:{kind:'catalog',id:'core:sell'}});
 const result=commitPrimitives(document,[{op:'holding.transfer',holding:id,newHolder:'player'}],frame),next=applyPatches(document,result.patches),applied=result.receipt.applied[0];
 assert.equal(document.holdings.rows[id].until,undefined);assert.equal(next.holdings.rows[id].until,document.state.minute);
 assert.equal(next.holdings.rows[applied.result].holder,'player');assert.equal(next.holdings.rows[applied.result].terms.share,1);
 assert.ok(applied.tags.includes('unauthorized_disposition'));assert.ok(next.holdings.rows[applied.result].concluded.tags.includes('unauthorized_disposition'));
 assert.ok(next.state.records['world_event:sell-possessed:0'].tags.includes('unauthorized_disposition'));
 assert.equal(next.state.records['world_event:sell-possessed:0'].actor,'player');
 const ownerFrame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'forged-holding-authority',source:{kind:'catalog',id:'core:lease'}});
 assert.throws(()=>commitPrimitives(document,[{op:'holding.open',holdingKind:'leases',holder:'player',subject:'wreck_a',terms:{authority:[{op:'transfer',target:'player'}]}}],ownerFrame),{code:'E-HOLDING-TERMS'});
 delete document.holdings.locations.wreck_a;
 assert.throws(()=>commitPrimitives(document,[{op:'holding.transfer',holding:id,newHolder:'player'}],frame),{code:'E-AUTHORITY'});
});

test('A3 runtime: property grant and close use lifecycle; share issuance requires affected holders consent',()=>{
 const {engine,document,npc}=runtimeFixture(),id=`h${++document.holdings.seq}`;
 document.holdings.entities.wreck_lease={id:'wreck_lease',kind:'wreck',facts:{}};
 document.holdings.rows[id]={id,kind:'owns',holder:npc,subject:'wreck_lease',terms:{share:1}};
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'grant-lease',source:{kind:'catalog',id:'core:lease'}});
 const grant=commitPrimitives(document,[{op:'holding.open',holdingKind:'leases',holder:'player',subject:'wreck_lease'}],frame),leased=applyPatches(document,grant.patches),lease=grant.receipt.applied[0].result;
 assert.equal(leased.holdings.rows[lease].holder,'player');assert.ok(leased.state.records['world_event:grant-lease:0']);
 const closed=applyPatches(leased,commitPrimitives(leased,[{op:'holding.close',holding:lease}],createRuntimePrimitiveFrame(engine,leased,{eventId:'close-lease',source:{kind:'catalog',id:'core:lease.close'}})).patches);
 assert.equal(closed.holdings.rows[lease].until,document.state.minute);assert.ok(closed.state.records['world_event:close-lease:0']);

 const subject='loc_bs_yupo',appointment=`governance_office:${subject}:office_village_head:player`;
 engine.rules.governance.authority.offices.office_village_head.powers.push('holding.rescale');
 document.state.records[appointment]={id:appointment,category:'governance_office',office:'office_village_head',holder:'player',settlement:subject,status:'在任',since:0,until:document.state.minute+1440};
 for(const [holder,share] of [['player',0.6],[npc,0.4]]){const id=`h${++document.holdings.seq}`;document.holdings.rows[id]={id,kind:'share',holder,subject,terms:{share}};}
 const effect={op:'holding.rescale',holdingKind:'share',subject,shares:{player:0.7,[npc]:0.3}},rescale=createRuntimePrimitiveFrame(engine,document,{eventId:'rescale-agreed',source:{kind:'catalog',id:'core:issue'}}),before=structuredClone(document);
 assert.throws(()=>commitPrimitives(document,[effect],rescale),{code:'E-AUTHORITY'});assert.deepEqual(document,before);
 document.state.consentEvents=[{id:'share-agreement',type:'consent_given',from:npc,to:'player',scope:'property',purpose:[`holding.rescale:${subject}`],at:document.state.minute,until:document.state.minute+10}];
 const after=applyPatches(document,commitPrimitives(document,[effect],rescale).patches),shares=Object.values(after.holdings.rows).filter(h=>h.kind==='share'&&h.subject===subject&&h.until===undefined);
 assert.equal(shares.reduce((sum,h)=>sum+h.terms.share,0),1);assert.equal(shares.find(h=>h.holder===npc).terms.share,0.3);
});
test('A3 runtime: real purse projection and obligation opening share one atomic frame',()=>{
 const {engine,document,npc}=runtimeFixture(),before=structuredClone(document),from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse');
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'runtime-contract',source:{kind:'catalog',id:'core:contract'}});
 const effects=[{op:'transfer',from,to,qty:3},{op:'obligation.create',id:'obligation_a3',obligationKind:'loan',debtor:'player',creditor:npc,amount:5}];
 const preview=planPrimitives(document,effects,frame);assert.equal(preview.receipt.status,'preview');assert.deepEqual(document,before);
 const result=commitPrimitives(document,effects,frame),next=applyPatches(document,result.patches);
 assert.equal(next.state.player.coins,before.state.player.coins-3);
 assert.equal(next.state.npcs[npc].coins,before.state.npcs[npc].coins+3);
 assert.equal(next.ledger.accounts[from],before.ledger.accounts[from]-3);
 assert.equal(next.state.obligations.obligation_a3.amount,5);
 assert.ok(Object.values(next.state.records).some(row=>row.category==='world_event'&&row.verb==='obligation_opened'));
 assert.deepEqual(document,before);
 assert.throws(()=>commitPrimitives(document,[effects[0],{...effects[1],debtor:npc}],frame),{code:'E-AUTHORITY'});
 assert.deepEqual(document,before);
});

test('A3 runtime: zero-balance recipient is a real account, unknown recipients and remote mandates reject',()=>{
 const {engine,document,npc}=runtimeFixture(),from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse');
 document.state.npcs[npc].coins=0;delete document.ledger.accounts[to];
 const frame=createRuntimePrimitiveFrame(engine,document,{eventId:'zero-recipient',source:{kind:'catalog',id:'core:give'}});
 const next=applyPatches(document,commitPrimitives(document,[{op:'transfer',from,to,qty:1}],frame).patches);
 assert.equal(next.ledger.accounts[to],1);assert.equal(next.state.npcs[npc].coins,1);assert.equal(document.ledger.accounts[to],undefined);
 assert.throws(()=>commitPrimitives(document,[{op:'transfer',from,to:accountKey('npc_missing','coin_river','purse'),qty:1}],frame),{code:'E-TRANSFER-ACCOUNT'});
 document.ledger.accounts[to]=10;document.state.npcs[npc].coins=10;
 const other=Object.keys(document.state.npcs).find(id=>id!==npc);document.state.npcs[other].location=document.state.npcs[npc].location;
 document.state.location='loc_elsewhere';
 document.state.obligations.a3_mandate={id:'a3_mandate',kind:'mandate',debtor:'player',creditor:npc,status:'active',terms:{scope:[{op:'transfer',target:npc}]}};
 assert.throws(()=>commitPrimitives(document,[{op:'transfer',from:to,to:accountKey(other,'coin_river','purse'),qty:1}],frame),{code:'E-TRANSFER-REACH'});
});

test('A3 consent: native donor emits actual grant/revoke facts; another actor cannot impersonate consent',()=>{
 const {engine,document,npc}=runtimeFixture(),now=document.state.minute,effect={op:'emit',verb:'consent_given',target:'player',visibility:'private',payload:{scope:'mind',purpose:['diagnose'],until:now+30}};
 const grantFrame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'npc-agrees',source:{kind:'catalog',id:'core:consent.give'}});
 const next=applyPatches(document,commitPrimitives(document,[effect],grantFrame).patches);
 assert.equal(next.state.consentEvents[0].from,npc);assert.equal(next.state.consentEvents[0].id,'npc-agrees:0');
 assert.equal(consent(primitiveContext(engine,next),npc,'player','mind',{purpose:'diagnose'}).kind,'given');
 assert.equal(consent(primitiveContext(engine,next),npc,'player','mind',{purpose:'interrogate'}).allowed,false);
 const forged=createRuntimePrimitiveFrame(engine,document,{eventId:'false-agreement',source:{kind:'catalog',id:'core:consent.give'}});
 assert.throws(()=>commitPrimitives(document,[{...effect,payload:{...effect.payload,from:npc}}],forged),{code:'E-CONSENT'});assert.equal(document.state.consentEvents,undefined);
 const revokeFrame=createRuntimePrimitiveFrame(engine,next,{actor:npc,eventId:'npc-revokes',source:{kind:'catalog',id:'core:consent.revoke'}});
 const revoked=applyPatches(next,commitPrimitives(next,[{op:'emit',verb:'consent_revoked',target:'player',visibility:'private',payload:{consent:'npc-agrees:0'}}],revokeFrame).patches);
 assert.equal(revoked.state.consentEvents[1].type,'consent_revoked');assert.equal(consent(primitiveContext(engine,revoked),npc,'player','mind',{purpose:'diagnose'}).allowed,false);
});

test('A3 consent: existing spell authorization keeps purpose/location/expiry limits and native revocation',()=>{
 const {engine,document,npc}=runtimeFixture(),now=document.state.minute,spell=engine.world.spells[0].id;
 document.state.records.a3_permission={category:'authorization',action:'mental_magic',subject:npc,grantor:npc,grantee:'player',createdAt:now,expires:now+30,scope:{location:document.state.location,spell},content:'specific purpose'};
 const context=primitiveContext(engine,document);
 assert.equal(consent(context,npc,'player','mind',{purpose:spell}).source,'a3_permission');
 assert.equal(consent(context,npc,'player','mind',{purpose:'another spell'}).allowed,false);
 assert.equal(consent(context,npc,'player','mind',{purpose:spell,until:now+30}).allowed,false);
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:npc,eventId:'revoke-legacy-consent',source:{kind:'catalog',id:'core:consent.revoke'}});
 const after=applyPatches(document,commitPrimitives(document,[{op:'emit',verb:'consent_revoked',target:'player',visibility:'private',payload:{consent:'a3_permission'}}],frame).patches);
 assert.equal(after.state.records.a3_permission.revoked,true);assert.equal(document.state.records.a3_permission.revoked,undefined);assert.equal(consent(primitiveContext(engine,after),npc,'player','mind',{purpose:spell}).allowed,false);
});

test('A3 custody: direct self release refuses, current officer release updates the actual law projection and tags its missing basis',()=>{
 const {engine,document}=runtimeFixture(),code=engine.rules.law.codes.find(code=>code.officers?.some(id=>document.state.npcs[id])),officer=code?.officers.find(id=>document.state.npcs[id]);
 assert.ok(officer,'requires a current authored officer');document.state.location=code.court;document.state.npcs[officer].location=code.court;
 document.state.records.a3_custody_case={id:'a3_custody_case',category:'legal_case',law:code.id,location:code.court,offender:'player',status:'已裁决'};
 document.state.records.a3_custody={category:'legal_custody',case:'a3_custody_case',subject:'player',location:code.court,reason:'监禁',status:'生效',started:document.state.minute,expires:document.state.minute+120};
 document.holdings=openHoldings(engine,document);
 const holding=Object.values(document.holdings.rows).find(h=>h.source==='custody:a3_custody'&&h.until===undefined);assert.ok(holding);
 const effect={op:'holding.close',holding:holding.id,reason:'released'},frame=actor=>createRuntimePrimitiveFrame(engine,document,{actor,eventId:`release-${actor}`,source:{kind:'catalog',id:'core:release'}});
 // The default detention regime rejects direct close before authority is read.
 assert.throws(()=>commitPrimitives(document,[effect],frame('player')),{code:'E-CAPACITY'});
 const result=commitPrimitives(document,[effect],frame(officer)),after=applyPatches(document,result.patches);
 assert.equal(after.state.records.a3_custody.status,'已释放');assert.equal(after.holdings.rows[holding.id].until,document.state.minute);
 assert.ok(result.receipt.applied[0].tags.includes('offense:unlawful_release'));
 assert.equal(document.state.records.a3_custody.status,'生效');
});

test('A3 runtime: registered primitive action runs via reduce and preview never writes',async()=>{
 const {engine,document,npc}=runtimeFixture(),before=structuredClone(document),action={id:'test:give',slots:[{name:'to',required:true}],outcomes:[{op:'transfer',from:accountKey('player','coin_river','purse'),to:{slot:'to'},qty:2}],cost:{owner:'primitives'}};
 engine.actionRegistry={byId:new Map([[action.id,action]]),actions:[action]};
 const input={tool:'world_act',eventId:'public-action',args:{action:action.id,slots:{to:accountKey(npc,'coin_river','purse')}}};
 assert.equal((await engine.previewAction(document,input)).receipt.status,'preview');assert.deepEqual(document,before);
 const first=await engine.reduce(document,input),next=applyPatches(document,first.patches);
 assert.equal(first.result.receipt.status,'committed');assert.equal(next.state.player.coins,before.state.player.coins-2);
 assert.equal(first.result.receipt.routed,action.id);assert.equal(first.result.receipt.pending,input.eventId);assert.equal(next.state.records[`primitive:${input.eventId}`].receipt.pending,input.eventId);
 const duplicate=await engine.reduce(JSON.parse(JSON.stringify(next)),input);assert.deepEqual(duplicate.patches,[]);assert.equal(duplicate.result.receipt.duplicate,true);
 await assert.rejects(()=>engine.reduce(document,{...input,args:{...input.args,slots:{...input.args.slots,source:'rule'}}}),{code:'E-ACTION-SLOT'});
});

test('A3 runtime: loaded RX preconditions run at preview and again against current commit facts',async()=>{
 const {engine,document,npc}=runtimeFixture(),action={id:'test:bounded',slots:[{name:'qty',kind:'quantity',required:true}],outcomes:[{op:'transfer',from:accountKey('player','coin_river','purse'),to:accountKey(npc,'coin_river','purse'),qty:{slot:'qty'}}],preconditions:[{value:'slots.qty <= 2 && month() == 1',reason:'bounded registered action'}]};
 engine.actionRegistry={byId:new Map([[action.id,action]]),actions:[action]};
 const input={tool:'world_act',eventId:'bounded-action',args:{action:action.id,slots:{qty:2}}};
 assert.equal((await engine.previewAction(document,input)).receipt.status,'preview');
 await assert.rejects(()=>engine.reduce(document,{...input,args:{...input.args,slots:{qty:3}}}),{code:'E-PRECONDITION'});
 const nextMonth={...document,state:{...document.state,minute:30*1440}};
 await assert.rejects(()=>engine.reduce(nextMonth,input),{code:'E-PRECONDITION'});
 assert.equal(document.state.player.coins,180);
});

test('A3 pending: a multi-resource proposal settles once; the loser leaves no transfer or receipt',()=>{
 const {document,options,effect}=fixture();
 const c=accountKey('player','item_oats','inventory'),to=accountKey('npc_a','item_oats','inventory');document.ledger.accounts[c]=3;document.ledger.accounts[to]=0;
 const d={document:structuredClone(document),patches:[],contestPool:[],scheduler:new Scheduler({seed:'pending'}),get(...p){return p.reduce((v,k)=>v?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});}};
 const effects=[effect,{op:'transfer',from:c,to,qty:3}],claims=[{target:'money',capacity:10,quantity:6,contest:'price'},{target:'goods',capacity:3,quantity:3,contest:'price'}];
 const first=queuePrimitiveProposal(d,effects,createPrimitiveFrame({...options,eventId:'winner'}),{claims,bid:20});
 const second=queuePrimitiveProposal(d,effects,createPrimitiveFrame({...options,eventId:'loser'}),{claims,bid:10});
 assert.equal(first.receipt.status,'pending');assert.deepEqual(first.receipt.applied,[]);assert.deepEqual(d.patches,[]);
 const outcomes=resolveContest(d.contestPool,{seed:'pending',minute:2});
 assert.equal(outcomes.flatMap(o=>o.winners).length,1);assert.equal(outcomes.flatMap(o=>o.losers).length,1);
 for(const o of outcomes){for(const winner of o.winners)winner.execute();for(const loser of o.losers)loser.reject(o.reason);}
 assert.equal(first.receipt.status,'committed');assert.equal(second.receipt.status,'rejected');assert.deepEqual(second.receipt.applied,[]);
 assert.equal(d.get('ledger','accounts',a),4);assert.equal(d.get('ledger','accounts',c),0);
 assert.equal(d.get('state','records','primitive:loser'),undefined);assert.equal(d.get('state','records','primitive:winner').receipt.applied.length,2);
 assert.deepEqual(resolveContest([...d.contestPool].reverse(),{seed:'pending',minute:2}).map(o=>o.winners.map(w=>w.id)),outcomes.map(o=>o.winners.map(w=>w.id)));
});

test('A3 pending: real loan and transfer settle in phase 3, reactions see the final winner',()=>{
 const {engine,document,npc}=runtimeFixture(),before=structuredClone(document),from=accountKey('player','coin_river','purse'),to=accountKey(npc,'coin_river','purse'),quantity=document.state.player.coins;
 const d=engine.primitiveDraft(structuredClone(document)),claims=[{target:'a3-real-money',quantity,capacity:quantity,contest:'price'}],observed=[];
 const remove=registerWorldEventSubscriber({id:'a3-real-pending',order:99999,priorityClass:'core',on(d,e,events){
  for(const event of events.filter(event=>event.parent==='pending-loan-a')){
   assert.ok(Object.values(d.get('state','records')).some(r=>r.verb==='contest_win'&&r.actor==='player'));
   assert.ok(d.get('state','obligations','obligation_a3_winner'));assert.equal(d.get('state','obligations','obligation_a3_loser'),undefined);observed.push(event.id);
  }
 }});
 try{
  const make=(eventId,id,bid)=>queuePrimitiveProposal(d,[{op:'transfer',from,to,qty:quantity},{op:'obligation.create',id,obligationKind:'loan',debtor:'player',creditor:npc,amount:5}],createRuntimePrimitiveFrame(engine,document,{eventId,source:{kind:'catalog',id:'core:loan'}}),{claims,bid});
  const winner=make('pending-loan-a','obligation_a3_winner',20),loser=make('pending-loan-b','obligation_a3_loser',10);
  assert.deepEqual(observed,[]);assert.equal(winner.receipt.status,'pending');assert.equal(loser.receipt.status,'pending');
  engine.advance(d,0,'a3-pending-tick');
  assert.equal(winner.receipt.status,'committed');assert.equal(loser.receipt.status,'rejected');
  assert.equal(d.get('state','player','coins'),0);assert.equal(d.get('state','npcs',npc,'coins'),before.state.npcs[npc].coins+quantity);
  assert.equal(d.get('state','obligations','obligation_a3_loser'),undefined);assert.deepEqual(observed.sort(),['obligation:obligation_a3_winner:pending-loan-a:1','pending-loan-a:0']);
  assert.deepEqual(document,before);
 }finally{remove();}
});

test('A3 public: HTTP preview, archived program execution, JSON import replay and anchor rollback',async t=>{
 const {default:express}=await import('express'),{once}=await import('node:events'),{init}=await import('../server-plugin/index.mjs'),{tmpRoot}=await import('../tools/tmp-root.mjs'),path=await import('node:path');
 const root=await fs.mkdtemp(path.join(tmpRoot(),'a3-public-'));
 const action={id:'test:spend',label:'spend',verb:'transfer',group:'test',narration:'test',slots:[{name:'qty',kind:'quantity',required:true}],synonyms:[],visibility:{catalog:'here'},participants:{actor:'player'},preconditions:['slots.qty <= 2'],outcomes:[{op:'transfer',from:accountKey('player','coin_river','purse'),to:accountKey('sink:consume','coin_river','use'),qty:{slot:'qty'}}],cost:{owner:'primitives'}};
 const world={...structuredClone(runtimeWorld),actionDefinitions:{format:1,actions:[action]}};
 const app=express();app.use(express.json({limit:'100mb'}));const router=express.Router();await init(router,{world,baseRoot:root,npcPlanningEnabled:false,consistencyEnabled:false,populationProfilesEnabled:false});app.use(router);
 const server=app.listen(0,'127.0.0.1');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 await once(server,'listening');
 const request=async(endpoint,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const created=await request('/create',{character:{}});assert.equal(created.status,200,created.body.error);
 const campaignId=created.body.reference.campaignId,before=(await request('/read',{campaignId})).body;
 const args={action:action.id,slots:{qty:2}},input={campaignId,eventId:'http-spend',anchor:'a3-anchor',args};
 const resolved=await request('/actions',{campaignId,resolve:args});assert.equal(resolved.body.tool,'world_act');
 const preview=await request('/propose',input);assert.equal(preview.status,200,preview.body.error);assert.equal(preview.body.receipt.status,'preview');
 assert.deepEqual((await request('/read',{campaignId})).body,before);
 const rejected=await request('/execute',{...input,tool:'world_act',args:{action:action.id,slots:{qty:3}}});assert.equal(rejected.status,400);assert.deepEqual((await request('/read',{campaignId})).body,before);
 const committed=await request('/execute',{...input,tool:'world_act'});assert.equal(committed.status,200,committed.body.error);assert.equal(committed.body.result.receipt.status,'committed');
 const after=(await request('/read',{campaignId})).body;assert.equal(after.document.state.player.coins,before.document.state.player.coins-2);
 const duplicate=await request('/execute',{...input,tool:'world_act'});assert.equal(duplicate.body.duplicate,true);assert.deepEqual((await request('/read',{campaignId})).body,after);
 const bundle=(await request('/export',{campaignId})).body,imported=await request('/import',{bundle});assert.equal(imported.status,200,imported.body.error);
 assert.deepEqual(imported.body.document,after.document);
 const rolled=await request('/reconcile',{campaignId,validAnchors:[]});assert.equal(rolled.status,200,rolled.body.error);assert.equal(rolled.body.document.state.player.coins,before.document.state.player.coins);
 assert.equal(rolled.body.document.state.records['primitive:http-spend'],undefined);
});
