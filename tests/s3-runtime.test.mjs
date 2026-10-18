import test from 'node:test';
import assert from 'node:assert/strict';
import {scaleFixture,fixtureDraft} from '../tools/scale-bench.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {fileClosedObligation} from '../server-plugin/transition.mjs';
import {wageQuote} from '../server-plugin/obligation-state.mjs';
import {personRemuneration} from '../server-plugin/entity-view.mjs';
import {openObligation,amendObligation,closeObligation,settleObligation,adoptLegacyObligation,dueObligation,obligationCommunication} from '../server-plugin/obligation-runtime.mjs';
const fixture=await scaleFixture({counties:0});
function setup(){
    const document=structuredClone(fixture.document),engine=fixture.engine.scoped(document);
    const creditor=Object.keys(document.state.npcs)[0];
    document.state.npcs[creditor].location=document.state.location;
    delete document.state.npcs[creditor].scheduleTravel;delete document.state.npcs[creditor].cognitionTravel;
    document.state.player.coins=1000;document.state.player.languages=['lang:common'];document.state.npcs[creditor].languages=['lang:common'];
    document.ledger=openLedger(engine,document);
    const d=fixtureDraft(document);d.engine=engine;return {d,engine,creditor};
}
function open(f,extra={}){return openObligation(f.d,f.engine,{id:'claim',debtor:'player',creditor:f.creditor,actor:'player',kind:'loan',amount:100,deadline:f.d.get('state','minute')+1440,...extra},'open');}
test('open and settlement are idempotent and preserve ledger and legacy claims',()=>{
    const f=setup();open(f,{legacyRecord:'old'});
    const before=JSON.stringify(f.d.document);open(f,{legacyRecord:'old'});assert.equal(JSON.stringify(f.d.document),before);
    const result=settleObligation(f.d,f.engine,{id:'old',payer:'player',amount:40},'payment');
    assert.equal(result.transferred,40);assert.equal(result.remaining,60);
    const paid=JSON.stringify(f.d.document);assert.deepEqual(settleObligation(f.d,f.engine,{id:'old',payer:'player',amount:40},'payment'),result);
    assert.equal(JSON.stringify(f.d.document),paid);assert.equal(f.d.get('state','records','old','paid'),40);
    assert.equal(dueObligation(f.d.get('state'),'old').owed,60);
    assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
    for(const [key,value]of legacyMoney(f.engine,f.d.get('state')))assert.equal(f.d.get('ledger','accounts',key),value,key);
});
test('failed settlement and changed event input roll back the whole transaction',()=>{
    const f=setup();open(f);let before=JSON.stringify(f.d.document);
    assert.throws(()=>settleObligation(f.d,f.engine,{id:'claim',amount:101},'bad'));assert.equal(JSON.stringify(f.d.document),before);
    settleObligation(f.d,f.engine,{id:'claim',amount:10},'once');before=JSON.stringify(f.d.document);
    assert.throws(()=>settleObligation(f.d,f.engine,{id:'claim',amount:20},'once'));assert.equal(JSON.stringify(f.d.document),before);
    f.d.set(['state','npcs',f.creditor,'location'],'remote');before=JSON.stringify(f.d.document);
    assert.throws(()=>settleObligation(f.d,f.engine,{id:'claim',amount:10},'remote'));assert.equal(JSON.stringify(f.d.document),before);
});
test('close retains owed amount, amendment cannot replace signing identity, and exclusive rejection writes nothing',()=>{
    const f=setup();open(f,{subject:'pet',exclusive:{family:'custody',scope:'subject',policy:'forbid'}});
    const before=JSON.stringify(f.d.document);
    assert.throws(()=>openObligation(f.d,f.engine,{id:'clash',debtor:'player',creditor:f.creditor,actor:'player',kind:'service',subject:'pet',exclusive:{family:'custody',scope:'subject',policy:'forbid'}},'clash'));
    assert.equal(JSON.stringify(f.d.document),before);
    assert.throws(()=>amendObligation(f.d,f.engine,{id:'claim',actor:'player',changes:{inName:'other'}},'identity'));
    closeObligation(f.d,f.engine,{id:'claim',actor:'player'},'close');
    assert.equal(dueObligation(f.d.get('state'),'claim').closed,true);assert.equal(dueObligation(f.d.get('state'),'claim').owed,100);
    settleObligation(f.d,f.engine,{id:'claim',amount:100},'final');assert.equal(dueObligation(f.d.get('state'),'claim').owed,0);
});
test('legacy import has one identity and no second payment path',()=>{
    const f=setup();f.d.set(['state','records','old'],{category:'debt',debtor:'player',creditor:f.creditor,createdAt:0,deadline:100000,amount:70,paid:20,status:'履行中'});
    adoptLegacyObligation(f.d,f.engine,'old');assert.equal(dueObligation(f.d.get('state'),'old').owed,50);
    settleObligation(f.d,f.engine,{id:'old',amount:50},'pay');assert.equal(f.d.get('state','records','old','paid'),70);
    const before=JSON.stringify(f.d.document);assert.throws(()=>settleObligation(f.d,f.engine,{id:'old',amount:50},'again'));assert.equal(JSON.stringify(f.d.document),before);
});
test('zero language cannot sign and forged acting authority cannot sign for another party',()=>{
    const f=setup();f.d.set(['state','npcs',f.creditor,'languages'],{'lang:other':100});
    assert.equal(obligationCommunication(f.engine,f.d.get('state'),'player',f.creditor).degree,0);
    const before=JSON.stringify(f.d.document);assert.throws(()=>open(f));assert.equal(JSON.stringify(f.d.document),before);
    assert.throws(()=>open(f,{actor:f.creditor,actedAs:{source:'invented'}}));assert.equal(JSON.stringify(f.d.document),before);
});
test('late claims reserve a single inheritance cap across creditors and repeated filings',()=>{
    const f=setup(),estate='late-estate';
    f.d.set(['holdings','protocol','procedures',estate],{phase:'closed',entity:'departed',eventId:'death',distribution:{heirs:[{heir:'player',share:1,value:50}]}});
    f.d.set(['state','obligations','first'],{id:'first',kind:'loan',debtor:'departed',creditor:f.creditor,amount:30,paid:0,createdAt:0,deadline:1,status:'pending'});
    const args={estate,obligation:'first',eventId:'late-first'};
    const result=fileClosedObligation(f.d,f.engine,args),before=JSON.stringify(f.d.document);
    assert.deepEqual(fileClosedObligation(f.d,f.engine,args),result);assert.equal(JSON.stringify(f.d.document),before);
    settleObligation(f.d,f.engine,{id:'first',payer:'player',amount:30},'late-pay');
    f.d.set(['state','obligations','second'],{id:'second',kind:'loan',debtor:'departed',creditor:f.creditor,amount:40,paid:0,createdAt:0,deadline:1,status:'pending'});
    fileClosedObligation(f.d,f.engine,{estate,obligation:'second',eventId:'late-second'});
    assert.equal(dueObligation(f.d.get('state'),'second').owed,20);
    assert.equal(f.d.get('state','obligations','second','badDebt'),20);
    assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('labor quote reuses existing skill and regard factors and keeps a signed wage fixed',()=>{
    assert.deepEqual(wageQuote({baseHalfDay:10,proficiency:300,regard:-1}),{daily:27,amount:27,minutes:480});
    assert.equal(wageQuote({baseHalfDay:100,proficiency:2600,regard:-1,signedWage:27}).amount,27);
});
test('accrual payments preserve rounding carry and a third payer does not change the debtor',()=>{
    const f=setup(),at=f.d.get('state','minute');
    open(f,{amount:0,deadline:at+43200,terms:{accrual:{per:'day',value:1}}});
    f.d.set(['state','minute'],at+720);assert.equal(dueObligation(f.d.get('state'),'claim').owed,0);
    f.d.set(['state','minute'],at+1440);settleObligation(f.d,f.engine,{id:'claim',amount:1},'one');
    f.d.set(['state','minute'],at+3600);assert.equal(dueObligation(f.d.get('state'),'claim').owed,1);
    settleObligation(f.d,f.engine,{id:'claim',amount:1},'two');
    assert.equal(dueObligation(f.d.get('state'),'claim').owed,0);
    f.d.set(['state','minute'],at+4320);assert.equal(dueObligation(f.d.get('state'),'claim').owed,1);
    const payer=Object.keys(f.d.get('state','npcs')).find(id=>id!==f.creditor);
    f.d.set(['state','npcs',payer,'location'],f.d.get('state','location'));
    settleObligation(f.d,f.engine,{id:'claim',payer,actor:payer,amount:1},'third');
    assert.equal(f.d.get('state','obligations','claim','debtor'),'player');assert.equal(dueObligation(f.d.get('state'),'claim').owed,0);
});
test('late claims split by recorded inheritance shares without duplicating principal or paid',()=>{
    const f=setup(),estate='split-estate',heir=Object.keys(f.d.get('state','npcs')).find(id=>id!==f.creditor);
    f.d.set(['holdings','protocol','procedures',estate],{phase:'closed',entity:'departed',eventId:'death',distribution:{heirs:[{heir:'player',share:2,value:100},{heir,share:1,value:50}]}});
    f.d.set(['state','obligations','late'],{id:'late',kind:'loan',debtor:'departed',creditor:f.creditor,amount:17,paid:3,createdAt:0,deadline:1,status:'pending'});
    const result=fileClosedObligation(f.d,f.engine,{estate,obligation:'late',eventId:'file'});
    const claims=result.claims.map(id=>f.d.get('state','obligations',id));
    assert.equal(claims.length,2);assert.equal(claims.reduce((n,r)=>n+r.amount,0),17);
    assert.equal(claims.reduce((n,r)=>n+r.paid,0),3);assert.equal(claims.reduce((n,r)=>n+r.remaining,0),14);
    assert.equal(claims.find(o=>o.debtor==='player').remaining,9);
    assert.equal(claims.find(o=>o.debtor===heir).remaining,5);
});
test('remuneration reads one canonical earned salary after the office has ended',()=>{
    const f=setup();
    f.d.set(['state','obligations','salary'],{id:'salary',kind:'salary',debtor:f.creditor,creditor:'player',amount:17,paid:4,endedAt:1,createdAt:0,deadline:1,status:'pending',legacyRecord:'salary-old'});
    f.d.set(['state','records','salary-old'],{category:'office_salary',holder:'player',arrears:17,obligation:'salary'});
    const before=JSON.stringify(f.d.document),view=personRemuneration(f.engine,f.d.get('state'),'player');
    assert.equal(view.value.monthlyCopper,0);assert.equal(view.value.arrearsCopper,13);
    assert.equal(JSON.stringify(f.d.document),before);
});
test('signing resolves current legal capacity, a real guardianship, and the actual signing place',()=>{
    const f=setup(),ward=Object.keys(f.d.get('state','npcs')).find(id=>id!==f.creditor);
    f.d.set(['state','records','guardian'],{category:'guardianship',guardian:'player',ward,status:'代管中',since:0});
    const args={id:'ward-claim',kind:'loan',debtor:ward,creditor:f.creditor,actor:'player',actedAs:{source:'guardian'},amount:10};
    openObligation(f.d,f.engine,args,'ward-sign');
    assert.equal(f.d.get('state','obligations','ward-claim','terms','signingPlace'),f.d.get('state','location'));
    f.d.set(['state','records','guardian','status'],'已结束');
    let before=JSON.stringify(f.d.document);
    assert.throws(()=>openObligation(f.d,f.engine,{...args,id:'revoked'},'revoked'));assert.equal(JSON.stringify(f.d.document),before);
    assert.throws(()=>open(f,{signingPlace:'remote'}));assert.equal(JSON.stringify(f.d.document),before);
    f.d.set(['state','records','transition:player'],{gone:true,basis:'declared',generation:0});before=JSON.stringify(f.d.document);
    assert.throws(()=>open(f));assert.equal(JSON.stringify(f.d.document),before);
});
test('bank claims reach the actual vault and completion side effects run once',()=>{
    const f=setup(),bank=f.engine.rules.economy.credit.banks[0];
    f.d.set(['state','location'],bank.location);
    f.d.set(['state','records','loan'],{category:'debt',kind:'loan',debtor:'player',creditor:bank.id,amount:10,paid:0,createdAt:0,deadline:100000,status:'待偿还',pledgeRecord:'pledge'});
    adoptLegacyObligation(f.d,f.engine,'loan');
    let calls=0;f.engine.protocolDebtSettled=()=>{calls++;};
    const before=f.d.get('ledger','accounts',`${bank.id}|coin_river|vault`);
    settleObligation(f.d,f.engine,{id:'loan',amount:10},'bank-payment');
    assert.equal(f.d.get('ledger','accounts',`${bank.id}|coin_river|vault`),before+10);
    assert.equal(f.d.get('state','records',bank.id,'coins'),before+10);
    settleObligation(f.d,f.engine,{id:'loan',amount:10},'bank-payment');assert.equal(calls,1);
    assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
    for(const [key,value]of legacyMoney(f.engine,f.d.get('state')))assert.equal(f.d.get('ledger','accounts',key),value,key);
});
