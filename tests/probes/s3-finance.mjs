import assert from 'node:assert/strict';
import {fixture,host,worker,DAY} from '../helpers/finance.mjs';
import {obligationView} from '../../server-plugin/obligation-state.mjs';
import {once} from './harness.mjs';

export const annualLoanScenario=once(async()=>{
 const f=fixture({coins:30000});
 // W8-E1 负重：通用夹具行囊 265 公斤（木料 200 + 燕麦 50 + 面包 15）超安全负重 30 公斤，买面包入囊被拒。
 // 本情境只向店家买 10 份面包，行囊原有货物都不用：只留面包 100 份 = 15 公斤。
 f.doc.state.inventory={item_bread:{quantity:100}};
 // The host starts with 500 copper. Actual stock purchases fund the interest
 // under the live annual quote so the NPC can genuinely accept its terms.
 // W8-E6 excludes private packs from public supply: S=20, so a ten-portion
 // lot exceeds max(5,20*0.3)=6. Two native retail lots of five deliver the
 // same ten portions; the second still fits max(5,15*0.3)=5.
 for(let lot=0;lot<2;lot++)await f.act({seller:host,item:'item_bread',quantity:5},`annual-probe-buy-bread:${lot}`);
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
