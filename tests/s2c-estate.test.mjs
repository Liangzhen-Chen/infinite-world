import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {legacyMoney} from '../server-plugin/money.mjs';
import {reconcileHoldings,reconciled} from '../server-plugin/holding-sources.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {advanceBankFinance} from '../server-plugin/finance-bank.mjs';
import {settleArrears} from '../server-plugin/labor-market.mjs';
import {transitionState} from '../server-plugin/transition.mjs';
import {reconcile as reconcileBooks,conservation} from './helpers/ledger-audit.mjs';
import {leaseClauses,leaseState} from '../server-plugin/contract-state.mjs';

const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
const person='npc_hw_linsui',creditor='npc_hw_chenbai';
function fresh(prepare){
 const document=engine.createCharacter(seed,{},'s2c-estate');prepare(document.state);
 document.ledger=openLedger(engine,document);
 return {document,original:structuredClone(document),engine,patches:[],messages:[],
  get(...p){return structuredClone(p.reduce((v,k)=>v?.[k],this.document));},peek(...p){return p.reduce((v,k)=>v?.[k],this.document);},
  set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
  remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});},say(){}};
}
function debt(amount,extra={}){return {category:'debt',kind:'player_loan',debtor:person,creditor:'player',amount,paid:0,status:'待偿还',createdAt:0,deadline:1440,nextPayment:1440,installments:1,...extra};}
function reconcile(d){
 assert.deepEqual(d.document.ledger.drift??[],[]);
 const money=legacyMoney(engine,d.document.state);
 // Procedural accounts have no old scalar field. All legacy owners must agree.
 for(const [key,n]of money)assert.equal(d.document.ledger.accounts[key]??0,n,key);
 const h=reconcileHoldings(engine,d.document);assert.ok(reconciled(h),JSON.stringify(h));
 const books=reconcileBooks(engine,d.document);assert.deepEqual(books.mismatches,[]);assert.deepEqual(books.audit,[]);
 assert.deepEqual(conservation(engine,d.original,d.document),[]);
}
test('recorded loan is paid before heirs receive the residue; dual write reconciles',()=>{
 const d=fresh(s=>{s.npcs[person].coins=5000;s.records.probe=debt(3300);});
 const before=d.get('state','player','coins'),receipt=recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','probe','paid'),3300);
 assert.equal(d.get('state','records','probe','status'),'已还清');
 assert.equal(d.get('state','player','coins'),before+3300);
 assert.equal(receipt.estate.coins,1700);
 assert.equal(transitionState(d,person).gone,true);reconcile(d);
});
test('insolvent estate pays peers pro rata, closes the shortfall and never prosecutes the departed borrower',()=>{
 const d=fresh(s=>{s.npcs[person].coins=5;s.records.a=debt(4);s.records.b=debt(4,{creditor});});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','a','paid'),3);assert.equal(d.get('state','records','b','paid'),2);
 for(const id of ['a','b'])assert.equal(d.get('state','records',id,'status'),'坏账');
 const before=structuredClone(d.document.state.records);
 advanceBankFinance(d,engine,d.get('state','minute')+60*1440,['a','b']);
 assert.deepEqual(d.document.state.records,before);reconcile(d);
});
test('recorded deposit is drawn from the bank reserve before estate distribution',()=>{
 const bank=world.rules.economy.credit.banks[0].id;
 const d=fresh(s=>{s.npcs[person].coins=10;s.records.probe=debt(80);s.records[bank]={category:'bank',id:bank,coins:200,accounts:{[person]:100},goods:{}};});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','probe','paid'),80);
 assert.equal(d.get('state','records',bank,'coins'),130);reconcile(d);
});
test('guardian transfer follows the ward parents and updates the legacy record atomically',()=>{
 const ward='npc_hw_duanhe';
 const d=fresh(s=>{s.npcs[creditor].relationships??={};s.npcs[creditor].relationships[ward]={type:'子女'};
  s.records['guardianship:probe']={category:'guardianship',id:'guardianship:probe',ward,guardian:person,status:'代管中',since:0,expires:null};});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','guardianship:probe','guardian'),creditor);
 assert.equal(d.get('state','records','guardianship:probe','status'),'代管中');reconcile(d);
});
test('a deposit at the creditor bank offsets the claim without moving its reserve twice',()=>{
 const bank=world.rules.economy.credit.banks[0].id;
 const d=fresh(s=>{s.npcs[person].coins=10;s.records.probe=debt(80,{creditor:bank});s.records[bank]={category:'bank',id:bank,coins:200,accounts:{[person]:100},goods:{}};});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','probe','paid'),80);
 assert.equal(d.get('state','records',bank,'coins'),210);
 assert.equal(Object.values(d.get('state','records',bank,'accounts')).reduce((n,v)=>n+v,0),30);reconcile(d);
});
test('invalid signed route restores settlement, holdings, events and both balances',()=>{
 const d=fresh(s=>{s.npcs[person].coins=100;s.records.probe=debt(80,{clauses:{onDebtorGone:'undeclared'}});});
 const before=structuredClone(d.document);
 assert.throws(()=>recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命'),/Unknown debtor gone route/);
 assert.deepEqual(d.document,before);assert.deepEqual(d.patches,[]);
});
test('a wage shortfall settled by the estate cannot reopen a complaint against its former employer',()=>{
 const d=fresh(s=>{s.npcs[person].coins=0;s.records.wage=debt(100,{id:'wage',kind:'wage',creditor,contract:'employment:probe'});});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','wage','status'),'坏账');
 const before=structuredClone(d.document);
 assert.equal(settleArrears(d,engine,{id:'employment:probe'},d.get('state','minute')+60*1440),false);
 assert.deepEqual(d.document,before);reconcile(d);
});
test('signed lease state follows clauses and termination facts rather than a mutable status column',()=>{
 const building=world.locations.find(b=>b.id.startsWith('bld_')).id,state={minute:10,buildings:{[building]:{condition:100}}};
 const row={subject:building,createdAt:0,deadline:100,monthlyRent:40,status:'有效'};row.clauses=leaseClauses(row);
 row.status='已到期';row.deadline=1;
 assert.equal(leaseState(engine,state,row).active,true);
 assert.equal(leaseState(engine,state,row,100).active,false);
 row.endedAt=10;assert.equal(leaseState(engine,state,row).active,false);
});
