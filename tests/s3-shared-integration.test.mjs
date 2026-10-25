import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,clerk,DAY} from './helpers/finance.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney,partyAccount} from '../server-plugin/money.mjs';
import {openObligation,closeObligation,settleObligation,performObligation,obligationRepresentative,receiveObligationCollection} from '../server-plugin/obligation-runtime.mjs';
import {registerEarnedClaim} from '../server-plugin/obligation-claims.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {legalCodeAt} from '../server-plugin/law-codes.mjs';
import {settleEmploymentPay} from '../server-plugin/labor-market.mjs';
function balanced(f,d){assert.deepEqual(auditLedger(d.get('ledger')),[]);for(const [k,v]of legacyMoney(f.e,d.get('state')))assert.equal(d.get('ledger','accounts',k),v,k);}
test('current bank teller can sign for its vault; a replaced or absent teller cannot',()=>{
 const f=fixture(),s=f.doc.state,bank=f.e.rules.economy.credit.banks[0];
 bank.keepers=[host];s.npcs[host].location=bank.location;s.npcs[worker].location=bank.location;
 const d=f.draft();assert.equal(obligationRepresentative(f.e,s,bank.id),host);
 openObligation(d,f.e,{id:'bank-service',debtor:bank.id,creditor:worker,actor:host,kind:'service',amount:0},'sign');
 assert.equal(d.get('state','obligations','bank-service','terms','actor'),host);
 bank.keepers=[clerk];const before=JSON.stringify(d.document);
 assert.throws(()=>openObligation(d,f.e,{id:'forged',debtor:bank.id,creditor:worker,actor:host,kind:'service'},'forged'),/authority/);
 assert.equal(JSON.stringify(d.document),before);
});
test('creditor cancellation ends future service and preserves already earned money',()=>{
 const f=fixture(),d=f.draft();openObligation(d,f.e,{id:'service',debtor:host,creditor:worker,actor:host,kind:'service',amount:20},'open');
 closeObligation(d,f.e,{id:'service',actor:worker,party:worker},'cancel');assert.equal(obligationView(d.get('state'),'service').owed,20);
 assert.equal(obligationView(d.get('state'),'service').closed,true);
});
test('a current teller receives collection into its real local vault while a remote principal remains unreachable',()=>{
 const f=fixture(),bank=f.e.rules.economy.credit.banks[0],s=f.doc.state;bank.keepers=[host];s.npcs[host].location=bank.location;
 const account=`${bank.location}|coin_river|collected:claim`;
 s.records.collected={category:'obligation_collection',creditor:bank.id,seat:bank.location,account,coins:20};f.doc.ledger=openLedger(f.e,f.doc);
 const d=f.draft(),initial=d.get('ledger','accounts',partyAccount(f.e,s,bank.id));
 bank.location='remote';const before=JSON.stringify(d.document);assert.throws(()=>receiveObligationCollection(d,f.e,{id:'collected',actor:host},'remote'));assert.equal(JSON.stringify(d.document),before);
 bank.location=s.npcs[host].location;assert.equal(receiveObligationCollection(d,f.e,{id:'collected',actor:host},'receive').transferred,20);
 assert.equal(d.get('ledger','accounts',partyAccount(f.e,d.get('state'),bank.id)),initial+20);balanced(f,d);
 assert.throws(()=>receiveObligationCollection(d,f.e,{id:'collected',actor:host},'again'),/No collected/);
});
test('runtime and late-claim consumers use the engine limitation adapter without a local wrapper',()=>{
 const f=fixture();f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 registerEarnedClaim(d,f.e,{id:'expired',kind:'wage',debtor:host,creditor:worker,amount:20,createdAt:0,deadline:1,terms:{limitation:1}});
 const before=JSON.stringify(d.document);assert.throws(()=>settleObligation(d,f.e,{id:'expired'},'late'),/enforceable/);
 assert.equal(JSON.stringify(d.document),before);assert.equal(obligationView(d.get('state'),'expired').owed,20);
});
test('a mirror balance cannot turn an unbooked or insufficient source into a paid receipt',()=>{
 const f=fixture();let d=f.draft();d.set(['state','obligations','cash'],{id:'cash',kind:'loan',debtor:host,creditor:worker,amount:20,paid:0,status:'pending'});
 assert.throws(()=>settleObligation(d,f.e,{id:'cash'},'unopened'),/opened ledger/);d.done();
 f.doc.ledger=openLedger(f.e,f.doc);d=f.draft();d.set(['ledger','accounts',partyAccount(f.e,d.get('state'),host)],0);
 const before=JSON.stringify(d.document);assert.throws(()=>settleObligation(d,f.e,{id:'cash'},'short'),/booked cash/);assert.equal(JSON.stringify(d.document),before);
});
test('a real employment guarantee settles its earned claim once and rejects another contract',()=>{
 const f=fixture(),s=f.doc.state;s.records.job={id:'job',category:'contract',kind:'workshop',owner:host,worker,escrow:20,location:s.location};
 f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();registerEarnedClaim(d,f.e,{id:'wage',kind:'wage',debtor:host,creditor:worker,amount:20,contract:'job',createdAt:0,deadline:DAY});
 const before=JSON.stringify(d.document);assert.throws(()=>settleObligation(d,f.e,{id:'wage',fundingContract:'fake'},'fake'));assert.equal(JSON.stringify(d.document),before);
 const args={id:'wage',fundingContract:'job'},paid=settleObligation(d,f.e,args,'pay');assert.equal(paid.transferred,20);assert.equal(d.get('state','records','job','escrow'),0);
 assert.deepEqual(settleObligation(d,f.e,args,'pay'),paid);balanced(f,d);
});
test('court execution takes local assets of an incapacitated debtor into a real deposit for an absent creditor',async()=>{
 const f=fixture(),s=f.doc.state,code=legalCodeAt(f.e,s.location,s),officer=code.officers[0];
 s.location=code.court;s.npcs[host].location=code.court;s.npcs[host].status='昏迷';s.npcs[worker].location='remote';
 s.npcs[officer]={...s.npcs[officer],location:code.court,status:'正常',activity:'办公',coins:s.npcs[officer]?.coins??0};
 s.records.case={id:'case',category:'legal_case',law:code.id,status:'已裁定',offender:host,victim:worker,debt:'wage',judgment:{compensation:20,fine:0}};
 f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();registerEarnedClaim(d,f.e,{id:'wage',kind:'wage',debtor:host,creditor:worker,amount:20,createdAt:0,deadline:1});
 const before=JSON.stringify(d.document);assert.throws(()=>settleObligation(d,f.e,{id:'wage',judicial:{case:'case',authority:worker}},'forged'));assert.equal(JSON.stringify(d.document),before);
 const args={id:'wage',judicial:{case:'case',authority:officer}},result=settleObligation(d,f.e,args,'execute');assert.equal(result.transferred,20);
 assert.equal(d.get('state','records','legal_deposit:case','coins'),20);assert.equal(d.get('state','npcs',worker,'coins'),s.npcs[worker].coins);
 assert.deepEqual(settleObligation(d,f.e,args,'execute'),result);balanced(f,d);
 d.done();f.doc.state.npcs[worker].location=code.court;
 const claimed=await f.act({operation:'claim',case:'case',authority:officer,claimant:worker},'receive','world_law');
 assert.equal(claimed.coins,20);assert.equal(f.doc.state.records['legal_deposit:case'].coins,0);
 assert.equal(f.doc.state.npcs[worker].coins,s.npcs[worker].coins+20);
 await assert.rejects(()=>f.act({operation:'claim',case:'case',authority:officer,claimant:worker},'receive-again','world_law'),/领取/);
});
test('delivery performance moves the actual stock and cannot pay twice or complete remotely',()=>{
 const f=fixture();f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 d.set(['state','obligations','goods'],{id:'goods',type:'送货',kind:'delivery',promisor:host,promisee:worker,debtor:host,creditor:worker,item:'item_bread',quantity:2,amount:0,location:f.doc.state.location,status:'待履行'});
 const before=f.e.quantity(d,worker,'item_bread');const result=performObligation(d,f.e,{id:'goods',actor:host},'deliver');assert.equal(result.delivered,2);assert.equal(f.e.quantity(d,worker,'item_bread'),before+2);
 assert.deepEqual(performObligation(d,f.e,{id:'goods',actor:host},'deliver'),result);assert.throws(()=>performObligation(d,f.e,{id:'goods',actor:host},'again'),/closed/);balanced(f,d);
});
test('wage receipts retain fractions across segments',()=>{
 const make=()=>{const f=fixture();f.doc.ledger=openLedger(f.e,f.doc);const row={id:'job',category:'contract',kind:'workshop',owner:host,worker,wage:7,createdAt:0,starts:0,deadline:DAY,status:'有效'};f.doc.state.records.job=row;return {f,row,d:f.draft()};};
 const fresh=make();const c=settleEmploymentPay(fresh.d,fresh.f.e,fresh.row,600,1),e=settleEmploymentPay(fresh.d,fresh.f.e,fresh.row,601,239);assert.equal(c.earned+e.earned,4);balanced(fresh.f,fresh.d);
});
