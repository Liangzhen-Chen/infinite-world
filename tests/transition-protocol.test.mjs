import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {emptyHoldings,openHoldings,openHolding,holdingRow,createEntity,aliveHoldings,setLocation,locationOf,declareHoldingWriter,holdingKind,registerHoldingKind} from '../server-plugin/holdings.mjs';
import {emptyLedger,accountKey} from '../server-plugin/ledger.mjs';
import {Scheduler,compareDue,PHASE} from '../server-plugin/scheduler.mjs';
import {registerAdvance,runAdvance} from '../server-plugin/advance-registry.mjs';
import {advanceOffices} from '../server-plugin/governance.mjs';
import {personOffices,personConstraint,settlementHead} from '../server-plugin/entity-view.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {transition,restoreTransition,transitionState,changeHolding,advanceProcedure,dispatchProtocolEvent} from '../server-plugin/transition.mjs';
import {identify,identities} from '../server-plugin/identity.mjs';
import {reconcileHoldings,reconciled} from '../server-plugin/holding-sources.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {destroyTransportAsset,transportAction} from '../server-plugin/transport.mjs';
import fs from 'node:fs';
const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
declareHoldingWriter('transition-test',{kinds:['*'],entities:['*'],locations:true});
const person='npc_hw_linsui',heir='npc_hw_chenbai',place='loc_hwl_inn';
function draft(document){return {document,original:structuredClone(document),engine,patches:[],messages:[],scheduler:new Scheduler({seed:'transition'}),
    get(...p){return structuredClone(p.reduce((v,k)=>v?.[k],this.document));},peek(...p){return p.reduce((v,k)=>v?.[k],this.document);},
    set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
    remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});},say(s){this.messages.push(s);}};}
function fresh(){const doc=engine.createCharacter(seed,{},'transition');doc.holdings=emptyHoldings();doc.ledger=emptyLedger();return draft(doc);}
const W={writer:'transition-test',engine};
test('gone transaction: estate, corpse, holdings, accounts and causal sequence',()=>{
    const d=fresh();d.set(['state','npcs',person,'location'],place);
    createEntity(d,{id:'office_test',kind:'office',...W});
    openHolding(d,{kind:'holds_office',holder:person,subject:'office_test',...W});
    openHolding(d,{kind:'owns',holder:person,subject:'bld_test',terms:{share:1},...W});
    d.set(['ledger','accounts',accountKey(person,'coin_river','purse')],17);
    const r=transition(d,engine,{entity:person,basis:'death',origin:'death_rule',successors:[heir]});
    assert.ok(r.successor&&r.wreck);assert.equal(aliveHoldings(d,{holder:person}).length,0);
    assert.equal(aliveHoldings(d,{holder:r.successor}).length,1);
    assert.equal(d.get('ledger','accounts',accountKey(r.successor,'coin_river','purse')),17);
    const events=Object.values(d.get('state','records')).filter(r=>r.tags?.includes('protocol'));
    assert.ok(events.length>=2);assert.deepEqual(events.map(r=>r.seq),[...events.map(r=>r.seq)].sort((a,b)=>a-b));
    advanceProcedure(d,engine,r.successor,d.get('state','minute'));
    assert.equal(aliveHoldings(d,{kind:'owns',holder:heir}).length,1);
});
test('I26: rumors cannot disappear an entity; unsupported hook rolls back every write and seq',()=>{
    const d=fresh(),before=d.document;
    assert.throws(()=>transition(d,engine,{entity:person,basis:'death',origin:'rumor'}),/I26/);assert.deepEqual(d.document,before);
    const k={...holdingKind('member_of'),id:'test_hook',hooks:[{on:'holder.gone',do:[{op:'fact.set',path:['state','test'],value:true},{op:'learn'}]}]};
    registerHoldingKind(k);openHolding(d,{kind:k.id,holder:person,subject:'org_test',...W});
    const snapshot=structuredClone(d.document),seq=d.scheduler.seq;
    assert.throws(()=>transition(d,engine,{entity:person,basis:'death',origin:'death_rule'}),/not installed/);
    assert.deepEqual(d.document,snapshot);assert.equal(d.scheduler.seq,seq);
});
test('declared and revoked round trip preserves vital and does not restore office',()=>{
    const d=fresh(),vital=d.get('state','npcs',person,'status');
    createEntity(d,{id:'office_declared',kind:'office',...W});
    openHolding(d,{kind:'holds_office',holder:person,subject:'office_declared',...W});
    openHolding(d,{kind:'owns',holder:person,subject:'bld_test',terms:{share:1},...W});
    const r=transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment',durations:{notice:100}});
    assert.equal(d.get('state','npcs',person,'status'),vital);assert.equal(r.wreck,null);
    restoreTransition(d,engine,{entity:person,origin:'declaration_revoked'});
    assert.equal(transitionState(d,person).gone,false);assert.equal(aliveHoldings(d,{holder:person,kind:'owns'}).length,1);
    assert.equal(aliveHoldings(d,{holder:person,kind:'holds_office'}).length,0);
});
test('tombstones and generations survive JSON save and cannot reuse a prior estate',()=>{
    const d=fresh(),first=transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment'});
    const restored=draft(JSON.parse(JSON.stringify(d.document)));
    assert.deepEqual(transitionState(restored,person),first);
    restoreTransition(restored,engine,{entity:person,origin:'declaration_revoked'});
    restored.set(['state','npcs',person,'incarnation'],1);
    const second=transition(restored,engine,{entity:person,basis:'death',origin:'death_rule'});
    assert.notEqual(first.successor,second.successor);assert.ok(restored.get('holdings','protocol','tombstones',`${person}:0`));
});
test('holding changes invoke declared hooks and capture conclusion fields',()=>{
    const d=fresh(),base=holdingKind('member_of');registerHoldingKind({...base,id:'test_close',concluded:true,hooks:[{id:'notify',on:'self.closed(vacated)',do:[{op:'fact.set',path:['state','notified'],value:true}]}]});
    const h=changeHolding(d,engine,{op:'open',kind:'test_close',holder:person,subject:'org_test',place,lawVersion:'law:v1',form:'written'});
    changeHolding(d,engine,{op:'close',id:h,reason:'vacated'});assert.equal(d.get('state','notified'),true);
    assert.deepEqual(holdingRow(d,h).concluded,{time:d.get('state','minute'),place,lawVersion:'law:v1',form:'written'});
});
test('pack_removed/rested/reborn/insolvency use the same protocol without a death corpse',()=>{
    for(const [basis,origin,entity]of [['pack_removed','pack_uninstall',person],['rested','rested',person],['reborn','reborn',person],['insolvency','insolvency_judgment','org_test']]){
        const d=fresh(),r=transition(d,engine,{entity,basis,origin});assert.equal(r.wreck,null);assert.ok(r.gone);
        assert.equal(Boolean(r.successor),basis!=='pack_removed');
    }
});
test('identity keys match observed appearances without inventing another entity',()=>{
    const d=fresh();d.set(['state','npcs',person,'identities'],[{key:'alias:stone',name:'石三',look:'face:stone',since:0}]);
    assert.equal(identify(engine,d.document,heir,person),'alias:stone');assert.equal(identities(engine,d.get('state'),person).length,1);
    d.set(['state','npcs',person,'identities'],[{key:person,name:'本名',look:'face:original',since:0},{key:'alias:stone',name:'石三',look:'face:stone',since:0}]);
    d.set(['state','records','old-face'],{category:'knowledge',observer:heir,identityKey:person,look:'face:original'});
    assert.equal(identify(engine,d.document,heir,person),'alias:stone','remembering a different face does not identify a disguise');
});
test('real NPC death retains legacy settlement and reconciles holdings',()=>{
    const doc=engine.createCharacter(seed,{},'real-death');doc.holdings=openHoldings(engine,doc);const d=draft(doc);
    recordEntityDeath(d,engine,person,doc.state.minute,'病故');
    assert.equal(transitionState(d,person)?.basis,'death');
    const result=reconcileHoldings(engine,d.document);assert.ok(reconciled(result),JSON.stringify(result));
});
test('ship destruction reparents carried instances and retains explicit wrecked shipment',()=>{
    const d=fresh(),asset='transport_asset:test';
    d.set(['state','records',asset],{category:'transport_asset',id:asset,kind:'boat',owner:person,location:place,durability:100});
    d.set(['state','itemInstances','item_test'],{id:'item_test',owner:person});
    openHolding(d,{kind:'owns',holder:person,subject:asset,terms:{share:1},...W});
    setLocation(d,{entity:'item_test',at:asset,mode:'container',...W});
    const r=destroyTransportAsset(d,engine,{asset},'ship-sinks');
    assert.equal(locationOf(d,'item_test').at,r.wreck);assert.equal(d.get('state','records',asset,'durability'),0);
});

test('I31: mutual heirs dying in the same tick follow scheduler keys, not registration order',()=>{
    const run=order=>{
        const d=fresh();d.contestPool=[];
        for(const x of [person,heir])openHolding(d,{kind:'owns',holder:x,subject:`bld_${x}`,terms:{share:1},...W});
        const cleanup=[];
        for(const x of order)cleanup.push(registerAdvance({id:`transition-death:${x}`,order:999999,phase:PHASE.due,ruleId:'death',dueClass:'案件阶段',
            dueItems:()=>[{id:x,anchorId:x,registeredSeq:1,execute:()=>transition(d,engine,{entity:x,basis:'death',origin:'death_rule',successors:[x===person?heir:person]})}],advance(){}}));
        try{runAdvance(engine,d,{before:d.get('state','minute'),after:d.get('state','minute'),days:0,beforeState:d.get('state'),id:'mutual'});}
        finally{for(const f of cleanup)f();}
        for(const x of [person,heir])advanceProcedure(d,engine,transitionState(d,x).successor,d.get('state','minute'));
        return {events:Object.values(d.get('state','records')).filter(r=>r.tags?.includes('protocol')),holdings:d.get('holdings')};
    };
    const a=run([person,heir]),b=run([heir,person]);assert.deepEqual(a,b);
    assert.equal(a.holdings.protocol.procedures[`estate_${person}:0`].phase,'distribution','simultaneous heirs do not inherit');
});

test('real expiry dismissal runs holding protocol and dual writes without drift',()=>{
    const doc=engine.createCharacter(seed,{},'dismiss'),id='governance_office:test',at=doc.state.minute;
    doc.state.records[id]={category:'governance_office',id,holder:'player',settlement:'loc_bs_yupo',office:'office_village_head',status:'在任',since:0,until:at,nextReview:at};
    doc.holdings=openHoldings(engine,doc);const d=draft(doc);
    advanceOffices(d,engine,{after:at});
    assert.ok(Object.values(d.get('state','records')).some(r=>r.verb==='holding_closed'));
    const result=reconcileHoldings(engine,d.document);assert.ok(reconciled(result),JSON.stringify(result));
});

test('real ship loss keeps freight accounted and instances on the wreck across save/restart',()=>{
    const doc=engine.createCharacter(seed,{},'ship'),asset='transport_asset:freight',trip='transport:freight',unit='item_cargo';
    doc.state.records[asset]={category:'transport_asset',id:asset,kind:'boat',owner:'player',location:place,durability:100};
    doc.state.records[trip]={category:'transport',id:trip,asset,status:'moving',driver:person,passengers:[],owner:'player',recipient:heir,cargo:[{item:'item_bread',quantity:3,instances:[unit]}],transport:{location:place,nextAt:doc.state.minute+50},history:[]};
    doc.state.records['transport:active']={category:'transport_index',ids:[trip]};
    doc.state.itemInstances??={};doc.state.itemInstances[unit]={id:unit,owner:trip,status:'托运'};
    doc.holdings=openHoldings(engine,doc);doc.ledger=emptyLedger();const key=accountKey(trip,'item_bread','freight');doc.ledger.accounts[key]=3;
    const d=draft(doc),r=destroyTransportAsset(d,engine,{asset},'sink-freight');
    assert.equal(d.get('state','records',trip,'status'),'wrecked');assert.equal(d.get('state','records',trip,'cargoLocation'),r.wreck);
    assert.equal(d.get('ledger','accounts',key),3);assert.equal(locationOf(d,unit).at,r.wreck);
    assert.ok(d.get('state','records',`world_event:sink-freight:shortfall:${trip}`));
    const saved=draft(JSON.parse(JSON.stringify(d.document))),result=reconcileHoldings(engine,saved.document);
    assert.ok(reconciled(result),JSON.stringify(result));
    saved.set(['state','location'],place);
    assert.throws(()=>transportAction(saved,engine,{task:'repair',contract:asset},'repair-wreck'));
});

test('governs transfer retains governance under conquest clause and creates the fief dispute once',()=>{
    const d=fresh();const gov=changeHolding(d,engine,{op:'open',kind:'governs',holder:'org_old',subject:place});
    d.set(['state','npcs',person,'location'],place);
    openHolding(d,{kind:'wanted',holder:'org_old',subject:person,...W});
    openHolding(d,{kind:'wanted',holder:'org_other',subject:person,...W});
    openHolding(d,{kind:'administers',holder:'org_council',subject:place,...W});
    openHolding(d,{kind:'fief',holder:person,subject:place,...W});
    changeHolding(d,engine,{op:'transfer',id:gov,holder:'org_new',conquest:{governance:'retain',fief:'retain_disputed'}});
    assert.equal(aliveHoldings(d,{kind:'administers',holder:'org_council'}).length,1);
    assert.equal(Object.values(d.get('state','records')).filter(r=>r.category==='transition_claim').length,1);
    assert.equal(aliveHoldings(d,{kind:'wanted',holder:'org_old'}).length,0);assert.equal(aliveHoldings(d,{kind:'wanted',holder:'org_other'}).length,1);
});

test('world_trade transport destruction reaches the protocol through the real tool route',async()=>{
    const doc=engine.createCharacter(seed,{},'tool-destroy'),asset='transport_asset:tool';
    doc.state.location=place;doc.state.records[asset]={category:'transport_asset',id:asset,kind:'boat',owner:'player',location:place,durability:100};
    const result=await engine.reduce(doc,{tool:'world_trade',args:{operation:'transport',task:'destroy',contract:asset,seller:'player'},eventId:'destroy-tool'});
    const after=draft(applyPatches(doc,result.patches));assert.equal(transitionState(after,asset)?.basis,'destruction');
    assert.equal(after.get('state','records',asset,'durability'),0);
    const reconciledResult=reconcileHoldings(engine,after.document);assert.ok(reconciled(reconciledResult),JSON.stringify(reconciledResult));
});

test('estate settlement honors priority and proportional shares, with bad debt rather than a dead debtor default',()=>{
    const d=fresh();d.set(['ledger','accounts',accountKey(person,'coin_river','purse')],17);
    for(const id of ['a','b'])d.set(['state','obligations',id],{id,kind:'loan',debtor:person,creditor:id==='a'?heir:'player',amount:12,priority:3,status:'pending'});
    const r=transition(d,engine,{entity:person,basis:'death',origin:'death_rule'});advanceProcedure(d,engine,r.successor);
    assert.equal(d.get('state','obligations','a','paid'),9);assert.equal(d.get('state','obligations','b','paid'),8);
    assert.equal(d.get('state','obligations','a','status'),'bad_debt');assert.equal(d.get('holdings','protocol','procedures',r.successor,'phase'),'closed');
});

test('long-term inherited debt retains its schedule and cap; revoked declaration creates a limited restitution claim',()=>{
    const d=fresh(),deadline=d.get('state','minute')+1000;
    d.set(['ledger','accounts',accountKey(person,'coin_river','purse')],20);
    d.set(['state','obligations','loan'],{id:'loan',kind:'loan',debtor:person,creditor:'player',amount:10,status:'pending',deadline,onDebtorGone:'assume_by_heirs'});
    const r=transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment',successors:[heir]});advanceProcedure(d,engine,r.successor);
    assert.equal(d.get('state','obligations','loan','deadline'),deadline);assert.equal(d.get('state','obligations','loan','terms','liabilityCap'),20);
    assert.equal(d.get('state','obligations','loan','debtor'),heir);
    restoreTransition(d,engine,{entity:person,origin:'declaration_revoked'});
    assert.equal(d.get('state','obligations','loan','debtor'),person);
    const claims=Object.values(d.get('state','obligations')).filter(o=>o.kind==='compensation');assert.equal(claims.length,1);assert.equal(claims[0].amount,20);
});

test('registered event hooks close adult guardianship and companions when custody opens',()=>{
    const d=fresh();openHolding(d,{kind:'guardian_of',holder:person,subject:heir,...W});
    dispatchProtocolEvent(d,engine,{id:'adult',verb:'threshold_crossed',thresholdId:'capacity:adult',entity:heir});
    assert.equal(aliveHoldings(d,{kind:'guardian_of'}).length,0);
    openHolding(d,{kind:'companion',holder:person,subject:heir,...W});
    changeHolding(d,engine,{op:'open',kind:'guest_of',variant:'detained',holder:person,subject:'org_guard'});
    assert.equal(aliveHoldings(d,{kind:'companion',holder:person}).length,0);
});

test('actual death after a declaration changes vital facts without a second estate or duplicated inheritance',()=>{
    const d=fresh();d.set(['ledger','accounts',accountKey(person,'coin_river','purse')],17);
    const declared=transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment'});
    const died=transition(d,engine,{entity:person,basis:'death',origin:'death_rule'});
    assert.equal(died.successor,declared.successor);assert.ok(died.wreck);assert.equal(d.get('state','npcs',person,'status'),'死亡');
    assert.equal(d.get('ledger','accounts',accountKey(declared.successor,'coin_river','purse')),17);
    assert.throws(()=>restoreTransition(d,engine,{entity:person,origin:'declaration_revoked'}));
});

test('declared actors lose schedules and offices immediately; revocation restores capacity but not their old appointment',()=>{
    const doc=engine.createCharacter(seed,{},'declare-office'),id='governance_office:declared',at=doc.state.minute;
    doc.state.records[id]={category:'governance_office',id,holder:person,settlement:'loc_bs_yupo',office:'office_village_head',status:'在任',since:0,until:at+10000};
    doc.holdings=openHoldings(engine,doc);const d=draft(doc);
    assert.equal(personOffices(engine,d.get('state'),person).length,1);
    transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment'});
    assert.equal(personOffices(engine,d.get('state'),person).length,0);assert.equal(scheduleAt(engine,person,at,d.get('state')),null);
    assert.ok(personConstraint(engine,d.get('state'),person));
    restoreTransition(d,engine,{entity:person,origin:'declaration_revoked'});
    assert.equal(personOffices(engine,d.get('state'),person).length,0);assert.equal(settlementHead(engine,d.get('state'),'loc_bs_yupo').value,null);
    assert.equal(personConstraint(engine,d.get('state'),person),null);
});

test('real engine advances persisted estate due stages after JSON reload and continues scheduler sequence',async()=>{
    const doc=engine.createCharacter(seed,{},'procedure-reload');doc.holdings=openHoldings(engine,doc);const d=draft(doc);
    recordEntityDeath(d,engine,person,doc.state.minute,'寿终');const estate=transitionState(d,person).successor;
    const saved=JSON.parse(JSON.stringify(d.document)),previousSeq=Math.max(...Object.values(saved.state.records).filter(e=>e.category==='world_event').map(e=>e.seq??0));
    const r=await engine.reduce(saved,{tool:'world_time',args:{minutes:1},eventId:'resume-estate'}),after=applyPatches(saved,r.patches);
    assert.equal(after.holdings.protocol.procedures[estate].phase,'closed');
    assert.ok(Object.values(after.state.records).some(e=>e.verb==='protocol_stage'&&e.seq>previousSeq));
    const result=reconcileHoldings(engine,after);assert.ok(reconciled(result),JSON.stringify(result));
});

test('declaration/revocation with the actual household, sibling and certification sources reconciles after save',()=>{
    const doc=engine.createCharacter(seed,{},'civil-return');doc.holdings=openHoldings(engine,doc);const d=draft(doc);
    transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment'});
    restoreTransition(d,engine,{entity:person,origin:'declaration_revoked'});
    const saved=JSON.parse(JSON.stringify(d.document)),result=reconcileHoldings(engine,saved);assert.ok(reconciled(result),JSON.stringify(result));
});
