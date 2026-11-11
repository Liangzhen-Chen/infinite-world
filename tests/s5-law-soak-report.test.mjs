import test from 'node:test';
import assert from 'node:assert/strict';
import {observedFlows,persistentReserves,groupObservations,publicTransportObservations,shopLifecycleObservations,facilityExposure} from '../tools/s5-law-soak-report.mjs';

test('external flood losses stay separate from unshocked deterioration and degradation is not closure',()=>{
 const facilities=[{id:'normal',condition:70,factor:1},{id:'flooded',condition:100,factor:1}];
 const month={facilities:[{id:'normal',condition:50,factor:.5},{id:'flooded',condition:20,factor:0}]};
 const out=facilityExposure([{facilities},month,month,month],[{category:'facility_damage',building:'flooded',amount:80,cause:'洪水',minute:3,sourceEvent:'f'}]);
 assert.deepEqual(out.rows.map(r=>[r.externalDamage,r.persistent,r.persistentlyClosed]),[[0,true,false],[80,true,true]]);
 assert.equal(out.groups.hazardClass['无外部损伤记录'].n,1);assert.equal(out.groups.hazardClass['有外部损伤记录'].n,1);assert.equal(out.closedTail.proportion,.5);
});

test('catalog labels cannot prove no closures and newly opened businesses remain in the cohort',()=>{
 const native={id:'catalog',native:true,status:'营业'},business={id:'shop',status:'营业'},newShop={id:'new',status:'营业'};
 const out=shopLifecycleObservations([{shops:[native,business]},{shops:[native,{...business,suspended:true},newShop]},{shops:[native,business,{...newShop,status:'退出'}]}]);
 assert.deepEqual(out.rows.map(r=>[r.id,r.count]),[['catalog',null],['shop',2],['new',1]]);
 assert.deepEqual([out.distribution.n,out.distribution.measured,out.distribution.missing],[3,2,1]);
});

test('month-end duplicate receipts and intra-household transfers cannot inflate cash income',()=>{
 // Outsider pays5; wage earned10 pays4 with6 owed; salary earned12 pays8.
 // Received cash17, never29. Family transfer7 is neither income nor expense.
 const households=[{id:'h',memberIds:['a','b'],members:2,cash:20}],job={id:'job',category:'contract',kind:'workshop',worker:'a',owner:'employer'};
 const trade={category:'market_trade',eventId:'sale',minute:2,buyer:'outside',seller:'a',quantity:1,totalCoins:5,item:'grain'};
 const family={...trade,eventId:'family',buyer:'a',seller:'b',totalCoins:7};
 const wage={id:'pay',category:'employment_pay',contract:'job',minutes:480,wage:10,result:{earned:10,paid:4,arrears:6}};
 const salary={id:'salary',category:'office_salary',holder:'b',settlement:'town',assessedAt:2,monthlyCopper:12,paid:8};
 const first={minute:0,households,financial:[]},facts=[job,trade,family,wage,salary];
 const out=observedFlows([first,{minute:30,households,financial:facts},{minute:60,households:[{...households[0],cash:37}],financial:facts}]);
 assert.equal(out.households[0].observedReceipts,17);assert.equal(out.households[0].observedPayments,0);
 assert.equal(out.households[0].wageEarned,10);assert.equal(out.households[0].salaryEarned,12);
 assert.equal(out.households[0].unexplainedCashChange,0);assert.equal(out.wages.length,1);assert.equal(out.wages[0].balanced,true);
 assert.equal(out.households[0].observedCashFlowRatio,null,'no expense evidence is not an infinite/healthy ratio');
});
test('public delivery keeps labor occupied through the return trip without counting hired carriage twice',()=>{
 //40kg/2workers/25kg=.8. Two workers away1440minutes =2worker-days;
 // delivery at noon does not release them before returning at minute1440.
 const rows=[{category:'settlement_trade',id:'a',seller:'v',buyer:'w',quantity:40,workers:2,dispatchAt:0,arrivedAt:720,homeAt:1440},
  {category:'settlement_trade',id:'b',seller:'v',buyer:'w',quantity:20,workers:1,dispatchAt:800,homeAt:1600},
  {category:'settlement_trade',id:'c',seller:'v',buyer:'w',quantity:40,workers:2,dispatchAt:900,homeAt:1500,carriage:'real-cart'},
  {category:'settlement_trade',id:'refused',seller:'v',buyer:'w',quantity:0,dispatchAt:950,status:'refused'}];
 const out=publicTransportObservations(rows,{unitKg:1,carryKgPerWorker:25,workersMaximum:2},2000);
 assert.equal(out.rows[0].occupancy,.8);assert.equal(out.rows[0].workerDays,2);
 assert.equal(out.rows[2].workerDays,0);assert.deepEqual(out.peaks.v,{peak:3,upperLimit:2,overLimit:true});
 assert.equal(out.rows[3].workerDays,0);assert.equal(out.rows[3].occupancy,null);assert.equal(out.statusCounts.refused,1);assert.ok(Number.isFinite(out.workerDays),'refused dispatches have no workforce and must not poison occupancy totals');
});
test('grouped distributions keep zero-supply and unobserved groups in their own denominator',()=>{
 // Poor group: one observed persistent shortage and one missing observation;
 // 1/1 known, n2, missing1. Wealthy group: one measured healthy subject.
 const rows=[{region:'poor',v:0,bad:true,known:true},{region:'poor',v:null,bad:false,known:false},{region:'rich',v:2,bad:false,known:true}];
 const g=groupObservations(rows,{dimensions:['region'],value:r=>r.v,abnormal:r=>r.bad,observed:r=>r.known}).region;
 assert.deepEqual([g.poor.n,g.poor.measured,g.poor.unobserved,g.poor.tail.numerator,g.poor.tail.denominator],[2,1,1,1,1]);
 assert.equal(g.poor.median,0);assert.equal(g.rich.median,2);assert.equal(g.rich.tail.proportion,0);
});
test('three consecutive month-end shortages differ from isolated episodes and missing observations',()=>{
 // h1 is short three consecutive snapshots; h2 short twice separated by
 // a healthy observation; h3 is entirely unobserved, not a healthy zero.
 const households=['h1','h2','h3'].map(id=>({id,region:'r'})),first={households};
 const sample=(a,b)=>({reserves:[{id:'h1',shortfall:{satiety:a}},{id:'h2',shortfall:{satiety:b}}]});
 const out=persistentReserves([first,sample(1,1),sample(1,0),sample(1,1)]);
 assert.deepEqual(out.map(r=>[r.observed,r.longest,r.persistent]),[[3,3,true],[3,1,false],[0,0,false]]);
});
