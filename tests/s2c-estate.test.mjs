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
import {settleArrears,advanceLaborMarket} from '../server-plugin/labor-market.mjs';
import {transition,transitionState,advanceProcedure} from '../server-plugin/transition.mjs';
import {recordEmploymentAttendance} from '../server-plugin/employment-state.mjs';
import {snapshotContractTerms} from '../server-plugin/contract-state.mjs';
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
function settle(d){const p=transitionState(d,person);d.set(['state','minute'],d.get('state','minute')+2*1440);advanceProcedure(d,engine,p.successor);advanceProcedure(d,engine,p.successor,d.get('state','minute')+1);}
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
 settle(d);
 assert.equal(d.get('state','records','probe','paid'),3300);
 assert.equal(d.get('state','records','probe','status'),'已还清');
 assert.equal(d.get('state','player','coins'),before+3300);
 assert.equal(d.get('holdings','protocol','procedures',transitionState(d,person).successor,'distribution','accounts').filter(a=>a.resource==='coin_river').reduce((n,a)=>n+a.amount,0),1700);
 assert.equal(transitionState(d,person).gone,true);reconcile(d);
});
test('insolvent estate pays peers pro rata, closes the shortfall and never prosecutes the departed borrower',()=>{
 const d=fresh(s=>{s.npcs[person].coins=5;s.records.a=debt(4);s.records.b=debt(4,{creditor});});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 settle(d);
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
 settle(d);
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
 settle(d);
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
 settle(d);
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

test('death leaves an actual operating estate before distribution, never an NPC impersonation',()=>{
 const d=fresh(s=>{s.npcs[person].coins=5000; s.records.distillery={id:'distillery',category:'business',owner:person,status:'营业',location:s.npcs[person].location};});
 const death=recordEntityDeath(d,engine,person,d.get('state','minute'),'fatal-rule');
 const estate=transitionState(d,person).successor;
 assert.equal(d.get('state','npcs',person,'coins'),0);
 assert.equal(d.get('state','records','distillery','owner'),estate);
 assert.equal(d.get('state','records',`protocol_assets:${estate}`,'coins'),5000);
 assert.equal(d.get('state','npcs',estate),undefined);
 assert.equal(death.estate.id,estate); reconcile(d);
});

test('the same recorded and canonical loan is one claim; both projections close after one payment',()=>{
 const d=fresh(s=>{s.npcs[person].coins=100;s.records.loan=debt(80);s.obligations.loan={id:'loan',kind:'loan',debtor:person,creditor:'player',amount:80,paid:0,status:'pending'};});
 const before=d.get('state','player','coins');recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');settle(d);
 assert.equal(d.get('state','player','coins'),before+80);
 assert.equal(d.get('state','records','loan','paid'),80);assert.equal(d.get('state','obligations','loan','status'),'settled');
 assert.equal(Object.values(d.get('state','obligations')).filter(o=>o.legacyRecord==='loan').length,1);reconcile(d);
});

test('recorded inherited debt is split once, stays collectible and is capped by each heir receipt',()=>{
 const d=fresh(s=>{s.npcs[person].coins=10;s.npcs[person].inventory={};s.records.loan=debt(80,{clauses:{onDebtorGone:'assume_by_heirs',onCreditorGone:'estate'}});});
 const r=transition(d,engine,{entity:person,basis:'death',origin:'death_rule',successors:[creditor,'player']});advanceProcedure(d,engine,r.successor);
 const debts=Object.values(d.get('state','obligations')).filter(o=>o.legacyRecord);
 assert.equal(debts.reduce((n,o)=>n+o.remaining,0),10);assert.equal(debts.reduce((n,o)=>n+o.amount,0),80);
 assert.ok(debts.every(o=>['player',creditor].includes(o.debtor)&&o.terms.liabilityCap===5));
 const records=Object.values(d.get('state','records')).filter(o=>o.category==='debt'&&o.obligation);
 assert.equal(records.reduce((n,o)=>n+o.amount,0),10);reconcile(d);
});

function employedEstate(cash){
 let workers;
 const d=fresh(s=>{
  s.minute=0;s.npcs[person].coins=cash;
  s.npcs[person].relationships??={};s.npcs[person].relationships[creditor]={type:'子女'};
  const location=s.location;
  s.records.distillery={id:'distillery',category:'business',owner:person,status:'营业',location};
  s.buildings.bld_distillery={owner:person,condition:100};s.created.bld_distillery={id:'bld_distillery',kind:'building',parent:location,name:'试验酒坊'};
  workers=Object.keys(s.npcs).filter(id=>![person,creditor].includes(id)&&!world.npcs.find(n=>n.id===id)?.flags?.minor).slice(0,4);
  assert.equal(workers.length,4);
  for(const [i,worker]of workers.entries()){
   Object.assign(s.npcs[worker],{location,status:'正常',activity:'打扫酒坊'});
   s.records[`job:${i}`]=snapshotContractTerms({id:`job:${i}`,category:'contract',kind:'workshop',laborMarket:1,owner:person,worker,parties:[worker,person],location,task:'打扫酒坊',wage:20,starts:0,createdAt:0,deadline:10*1440,nextWork:1020,status:'有效',paid:0,produced:0,targetQuantity:1000,workedMinutes:0,attendance:{},shifts:[],source:'estate-test'});
  }
 });
 recordEntityDeath(d,engine,person,0,'规则致命');
 for(const worker of workers)recordEmploymentAttendance(d,worker,480,1020,d.get('state','location'));
 d.set(['state','minute'],1020);advanceLaborMarket(d,engine,{before:480,after:1020,id:'estate-shift',beforeState:d.original.state});
 return {d,workers,estate:transitionState(d,person).successor};
}
test('four existing wage contracts continue for attended hours under the estate, then transfer to the heir',()=>{
 const {d,workers,estate}=employedEstate(1000);
 for(let i=0;i<4;i++){const row=d.get('state','records',`job:${i}`);assert.equal(row.owner,estate);assert.equal(row.workedMinutes,480);assert.equal(row.paid,20);assert.equal(row.shifts.length,1);}
 assert.equal(d.get('state','records',`protocol_assets:${estate}`,'coins'),920);
 settle(d);for(let i=0;i<4;i++)assert.equal(d.get('state','records',`job:${i}`,'owner'),creditor);
 assert.equal(d.get('state','records','distillery','owner'),creditor);assert.equal(d.get('state','buildings','bld_distillery','owner'),creditor);reconcile(d);
});
test('insufficient operating cash pays only real cash and retains each earned wage shortfall',()=>{
 const {d,estate}=employedEstate(5);
 const rows=Array.from({length:4},(_,i)=>d.get('state','records',`job:${i}`));
 assert.equal(rows.reduce((n,r)=>n+r.paid,0),5);assert.ok(rows.every(r=>r.workedMinutes===480));
 const debts=Object.values(d.get('state','records')).filter(r=>r.kind==='wage'&&r.debtor===estate);
 assert.equal(debts.reduce((n,r)=>n+r.amount-r.paid,0),75);assert.equal(d.get('state','npcs',person,'coins'),0);reconcile(d);
});
test('an unclaimed estate seals its real business and does not manufacture attendance or wages',()=>{
 const d=fresh(s=>{s.npcs[person].coins=20;s.records.distillery={id:'distillery',category:'business',owner:person,status:'营业',location:s.location};});
 const r=transition(d,engine,{entity:person,basis:'death',origin:'death_rule',successors:[],law:{noHeir:{mode:'seal',recipient:'loc_hw',notice:1}}});
 advanceProcedure(d,engine,r.successor);advanceProcedure(d,engine,r.successor,d.get('state','minute')+1);
 assert.equal(d.get('state','records','distillery','status'),'封存');
 assert.equal(Object.values(d.get('state','records')).filter(r=>r.kind==='wage').length,0);reconcile(d);
});

test('a signed termination clause ends employment without paying unworked hours',()=>{
 const d=fresh(s=>{s.records.job=snapshotContractTerms({id:'job',category:'contract',kind:'workshop',owner:person,worker:creditor,parties:[creditor,person],wage:20,starts:0,createdAt:0,deadline:10000,status:'有效',onEmployerGone:'terminate',paid:0});});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 const row=d.get('state','records','job');assert.equal(row.status,'已终止');assert.equal(row.endedAt,d.get('state','minute'));assert.equal(row.paid,0);reconcile(d);
});

test('an absent creditor inherits the same recorded receivable without accelerating the borrower',()=>{
 const d=fresh(s=>{s.records.loan=debt(80,{debtor:creditor,creditor:person,clauses:{onDebtorGone:'accelerate',onCreditorGone:'estate'}});});
 const before=d.get('state','npcs',creditor,'coins');recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 const estate=transitionState(d,person).successor;
 assert.equal(d.get('state','records','loan','creditor'),estate);assert.equal(d.get('state','npcs',creditor,'coins'),before);
 settle(d);assert.ok(d.get('state','records','loan','creditor')!==person);assert.equal(d.get('state','records','loan','paid'),0);reconcile(d);
});

test('inventory instances divide with their quantities and physical locations remain valid',()=>{
 const units=['unit_estate_a','unit_estate_b'];
 const d=fresh(s=>{s.npcs[person].inventory={item_bread:{quantity:2,instances:units}};for(const id of units)s.itemInstances[id]={id,item:'item_bread',owner:person,status:'持有'};});
 const r=transition(d,engine,{entity:person,basis:'death',origin:'death_rule',successors:[creditor,'player']});advanceProcedure(d,engine,r.successor);
 for(const owner of [creditor,'player']){
  const ids=d.get(...engine.bagPath(owner),'item_bread','instances');assert.equal(ids.filter(id=>units.includes(id)).length,1);
  for(const id of ids.filter(id=>units.includes(id))){assert.equal(d.get('state','itemInstances',id,'owner'),owner);assert.equal(d.get('holdings','locations',id,'at'),owner);}
 }
 reconcile(d);
});

test('a loaded orphan guardianship waits for appointment without confiscating the ward property',()=>{
 const ward='npc_estate_orphan';
 const d=fresh(s=>{s.created[ward]={id:ward,age:8};s.npcs[ward]={age:8,status:'正常',coins:7,inventory:{}};s.records.orphan={id:'orphan',category:'guardianship',ward,guardian:person,status:'代管中',since:0,expires:null};});
 d.document=JSON.parse(JSON.stringify(d.document));d.original=structuredClone(d.document);
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','records','orphan','guardian'),null);assert.equal(d.get('state','records','orphan','status'),'待指定');assert.equal(d.get('state','npcs',ward,'coins'),7);reconcile(d);
});

test('a deceased hire worker refunds escrow once and earns no fictitious wage',()=>{
 const d=fresh(s=>{s.records.hire=snapshotContractTerms({id:'hire',category:'contract',version:1,kind:'hire',parties:['player',person],subject:'item_bread',quantity:1,cost:30,escrow:30,paid:0,fulfilled:0,status:'待履行',createdAt:0,deadline:10000,performance:[],breaches:[]});});
 const before=d.get('state','player','coins');recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');
 assert.equal(d.get('state','player','coins'),before+30);assert.equal(d.get('state','records','hire','escrow'),0);assert.equal(d.get('state','records','hire','paid'),0);
 const snapshot=structuredClone(d.document);recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');assert.deepEqual(d.document,snapshot);reconcile(d);
});

test('a recorded loan settlement releases the original pledge and closes its existing default case',()=>{
 const d=fresh(s=>{s.npcs[person].coins=100;s.records.loan=debt(80,{pledgeRecord:'pledge:probe',defaulted:{case:'case:probe'}});s.records['pledge:probe']={category:'pledge',owner:person,item:'item_bread',quantity:2,instances:[],value:20,status:'质押中'};s.records['case:probe']={id:'case:probe',category:'legal_case',debt:'loan',status:'已报案',location:s.location};});
 recordEntityDeath(d,engine,person,d.get('state','minute'),'规则致命');settle(d);
 assert.equal(d.get('state','records','loan','paid'),80);assert.equal(d.get('state','records','pledge:probe','status'),'已退还');assert.equal(d.get('state','records','case:probe','compensationPaid'),true);assert.equal(d.get('state','records','case:probe','status'),'已结案');reconcile(d);
});
