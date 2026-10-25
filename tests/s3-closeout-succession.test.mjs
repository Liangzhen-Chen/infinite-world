import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,clerk,post,inn,seed} from './helpers/finance.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {partyAccount,legacyMoney} from '../server-plugin/money.mjs';
import {openObligation,settleObligation} from '../server-plugin/obligation-runtime.mjs';
import {openLoan} from '../server-plugin/credit.mjs';
import {obligationGoneRoute} from '../server-plugin/obligation-kinds.mjs';
import {transition,advanceProcedure} from '../server-plugin/transition.mjs';

function balanced(f,d){
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
 for(const [key,value] of legacyMoney(f.e,d.get('state')))assert.equal(d.get('ledger','accounts',key),value,key);
}
test('N10: a local third payer emits its actual source, place and private participants, retaining the remote debtor',()=>{
 const f=fixture(),s=f.doc.state;
 for(const person of [host,worker,clerk])s.npcs[person].languages=['lang:common'];
 f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 openObligation(d,f.e,{id:'third-party',kind:'loan',debtor:host,creditor:worker,actor:host,amount:30},'open');
 d.set(['state','npcs',host,'location'],inn);
 const debtorCoins=d.get('state','npcs',host,'coins'),args={id:'third-party',payer:clerk,amount:20};
 const paid=settleObligation(d,f.e,args,'pay'),event=d.get('state','records','world_event:obligation:third-party:pay');
 assert.equal(event.location,post);assert.equal(event.actor,clerk);assert.equal(event.visibility,'private');
 assert.deepEqual(new Set(event.participants),new Set([host,worker,clerk]));
 assert.equal(event.payment.debtor,host);assert.equal(event.payment.payer,clerk);
 assert.deepEqual(event.payment.accounts,{from:partyAccount(f.e,s,clerk),to:partyAccount(f.e,s,worker)});
 assert.equal(d.get('state','npcs',host,'coins'),debtorCoins);
 assert.equal(d.get('state','obligations','third-party','debtor'),host);
 const before=JSON.stringify(d.document);assert.deepEqual(settleObligation(d,f.e,args,'pay'),paid);assert.equal(JSON.stringify(d.document),before);
 d.set(['state','npcs',clerk,'location'],inn);const remote=JSON.stringify(d.document);
 assert.throws(()=>settleObligation(d,f.e,{...args,amount:10},'remote'),/physical presence/);assert.equal(JSON.stringify(d.document),remote);balanced(f,d);
});
test('N10: a payment representative is recorded only after current authorization at the actual assets',()=>{
 const f=fixture(),s=f.doc.state;
 for(const person of [host,worker,clerk])s.npcs[person].languages=['lang:common'];
 s.records.authority={category:'authorization',grantor:host,grantee:clerk,actions:['payment']};
 f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 openObligation(d,f.e,{id:'represented',kind:'loan',debtor:host,creditor:worker,actor:host,amount:30},'open');
 const args={id:'represented',payer:host,actor:clerk,actedAs:{source:'authority'},amount:10};
 settleObligation(d,f.e,args,'pay');
 const event=d.get('state','records','world_event:obligation:represented:pay');
 assert.equal(event.actor,clerk);assert.equal(event.location,post);assert.equal(event.payment.payer,host);
 assert.deepEqual(event.payment.actedAs,{source:'authority'});
 d.set(['state','records','authority','revoked'],true);const before=JSON.stringify(d.document);
 assert.throws(()=>settleObligation(d,f.e,args,'revoked'),/authority/);assert.equal(JSON.stringify(d.document),before);balanced(f,d);
});
test('N07: new twelve-installment loans keep paid amounts, collateral and deadlines after succession; historical loans accelerate',async()=>{
 const f=fixture();
 // Retain the whole live world for the real estate protocol and its invariants.
 f.doc=f.e.createCharacter(seed, {}, 'succession');
 const s=f.doc.state;s.minute=600;s.location=post;s.player.coins=3000;
 for(const person of [host,worker,clerk])Object.assign(s.npcs[person],{location:post,status:'正常',activity:'休息',coins:500,languages:['lang:common'],inventory:{item_bread:{quantity:100}}});
 s.player.languages=['lang:common'];
 f.doc.ledger=openLedger(f.e,f.doc);
 const loan=await f.act({operation:'lend',seller:host,coins:100,days:360,quantity:12,consent:true},'new-loan');
 const d=f.draft();
 const secured=openLoan(d,f.e,{lender:clerk,debtor:host,actor:host,principal:20,days:30,collateral:{item:'item_bread',quantity:20},eventId:'secured'});
 const id=`finance:${loan.debt}`,signed=structuredClone(d.get('state','obligations',id));
 assert.equal(signed.installments,12);assert.equal(signed.terms.onDebtorGone,'assume_by_heirs');
 assert.equal(signed.signedTerms.onDebtorGone,'assume_by_heirs');
 assert.equal(obligationGoneRoute({kind:'loan'},'debtor'),'accelerate');
 settleObligation(d,f.e,{id,payer:host,amount:2},'first-payment');
 const r=transition(d,f.e,{entity:host,basis:'death',origin:'death_rule',successors:['player']});
 advanceProcedure(d,f.e,r.successor);
 const inherited=d.get('state','obligations',id);
 assert.equal(inherited.debtor,'player');assert.equal(inherited.goneRoute,'assume_by_heirs');
 assert.equal(inherited.installments,12);assert.equal(inherited.deadline,signed.deadline);
 assert.equal(inherited.paid,2);assert.equal(inherited.amount,signed.amount);
 assert.equal(inherited.pledgeRecord,signed.pledgeRecord);assert.deepEqual(inherited.originalTerms,signed.terms);
 assert.equal(d.get('state','obligations',`finance:${secured.debt}`,'pledgeRecord'),`pledge:${secured.debt}`);
 assert.equal(inherited.acceleratedAt,undefined);balanced(f,d);
});
test('N10: escrow receipts use the local recipient even when old escrow records omit a location',()=>{
 const f=fixture(),s=f.doc.state;
 s.records.escrow={id:'escrow',category:'contract',parties:[host,worker],debt:'escrow-claim',escrow:20};
 f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
 openObligation(d,f.e,{id:'escrow-claim',kind:'wage',debtor:host,creditor:worker,actor:host,amount:20},'open');
 d.set(['state','npcs',host,'location'],inn);const coins=d.get('state','npcs',host,'coins');
 const paid=settleObligation(d,f.e,{id:'escrow-claim',escrowContract:'escrow'},'escrow-pay');
 assert.equal(paid.payment.location,post);assert.equal(paid.accounts.from,'escrow|coin_river|escrow');
 assert.equal(d.get('state','npcs',host,'coins'),coins);assert.equal(d.get('state','records','escrow','escrow'),0);balanced(f,d);
});
test('N07/N10: replay retains inheritance clauses and actual payment receipts',()=>{
  const f=fixture();f.e.replaying=true;f.e.replayResult={};
  f.doc.ledger=openLedger(f.e,f.doc);const d=f.draft();
  const loan=openLoan(d,f.e,{lender:clerk,debtor:host,principal:20,days:30,collateral:{item:'item_bread',quantity:10},eventId:'replayed'});
  const id=`finance:${loan.debt}`,row=d.get('state','obligations',id);
  assert.equal(obligationGoneRoute(row,'debtor'),'assume_by_heirs');
  const paid=settleObligation(d,f.e,{id,amount:1},'repay');
  assert.equal(Boolean(paid.payment),true);balanced(f,d);
});
