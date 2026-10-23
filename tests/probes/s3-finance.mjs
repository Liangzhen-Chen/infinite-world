import assert from 'node:assert/strict';
import {fixture,host,worker,DAY} from '../helpers/finance.mjs';
import {obligationView} from '../../server-plugin/obligation-state.mjs';
import {once} from './harness.mjs';

export const annualLoanScenario=once(async()=>{
 const f=fixture({coins:30000});
 // The host has 500 copper but the annual quote charges 507 in interest.
 // Pay for actual stock first so the live NPC decision can accept the terms.
 await f.act({seller:host,item:'item_bread',quantity:10},'annual-probe-buy-bread');
 const loan=await f.act({operation:'lend',seller:host,coins:1000,days:360,quantity:12,consent:true},'annual-probe');
 const row=f.doc.state.records[loan.debt];assert.equal(row.installments,12);assert.equal(row.deadline-row.createdAt,360*DAY);
 f.doc.state.npcs[host].coins=0;
 f.tick(row.createdAt+90*DAY);
 const view=obligationView(f.doc.state,loan.debt);assert.equal(view.overdueCount,3);assert.ok(view.amountDue>0);assert.ok(view.owed>0);
 const before=structuredClone(f.doc.state.records[loan.debt]);f.tick(row.createdAt+90*DAY+1);assert.deepEqual(f.doc.state.records[loan.debt],before);
 return{periods:view.overdueCount,due:view.amountDue,owed:view.owed};
});
export const vacateScenario=once(async()=>{
 const f=fixture({at:'bld_hw_mill'}),subject='bld_hw_mill';f.e.byId.get(subject).purpose='私宅';f.doc.state.buildings[subject]={owner:'player',condition:100};
 const {personHousehold}=await import('../../server-plugin/entity-view.mjs');
 const home=personHousehold(f.e,f.doc.state,worker).value.homeLocation;f.doc.state.buildings[home]={condition:0};
 const rent=await f.act({operation:'rent_out',seller:worker,location:subject,days:90,consent:true},'vacate-sign');
 f.doc.state.npcs[worker].coins=0;f.tick(600+31*DAY);
 const debts=Object.entries(f.doc.state.records).filter(([,r])=>r.kind==='rent');assert.equal(debts.length,1);const old=structuredClone(debts[0][1]);
 const before=structuredClone(f.doc);let tenantVacate=true,error=null;
 try{await f.act({operation:'vacate',seller:worker,actor:worker,contract:rent.contract},'tenant-vacate');}
 catch(e){tenantVacate=false;error=e.message;assert.deepEqual(f.doc,before);await f.act({operation:'dismiss',seller:worker,contract:rent.contract},'owner-terminate');}
 assert.equal(f.doc.state.records[rent.contract].status,'已终止');
 f.tick(600+100*DAY);assert.deepEqual(f.doc.state.records[debts[0][0]],old);assert.equal(Object.values(f.doc.state.records).filter(r=>r.kind==='rent').length,1);
 return{owed:obligationView(f.doc.state,debts[0][0]).owed,tenantVacate,error};
});
