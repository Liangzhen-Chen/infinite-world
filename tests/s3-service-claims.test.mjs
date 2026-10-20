import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,host,worker,DAY} from './helpers/finance.mjs';
import {registerEarnedClaim,claimLimitation,recordClaimProcedure,settleClaim,registerLoss,recoverLoss,lossView} from '../server-plugin/obligation-claims.mjs';
import {obligationView} from '../server-plugin/obligation-state.mjs';
import {serviceUrgency,orderServices} from '../server-plugin/service-queue.mjs';
import {advanceMedicine,medicineAction,nextMedicineMinute,bookMedicine} from '../server-plugin/medicine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {medicineSites,MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {educationCourses} from '../server-plugin/education-state.mjs';
import {caseLoss} from '../server-plugin/law.mjs';
function bookedFixture(options){const f=fixture(options);f.doc.ledger=openLedger(f.e,f.doc);return f;}

test('诉讼时效从到期起算，受理暂停、恢复、实际支付重起；超时不抹债',()=>{
 const f=bookedFixture(),d=f.draft();
 registerEarnedClaim(d,f.e,{id:'claim',kind:'compensation',debtor:'player',creditor:host,amount:20,createdAt:0,deadline:100,terms:{limitation:{minutes:50}},source:'care'});
 assert.equal(claimLimitation(d.get('state'),'claim',151).enforceable,false);
 d.set(['state','records','case'],{category:'legal_case',debt:'claim'});
 recordClaimProcedure(d,f.e,{claim:'claim',action:'suspend',minute:140,evidence:'case'},'file');
 assert.equal(claimLimitation(d.get('state'),'claim',600).enforceable,true);
 recordClaimProcedure(d,f.e,{claim:'claim',action:'resume',minute:580,evidence:'case'},'resume');
 assert.equal(claimLimitation(d.get('state'),'claim',600).enforceable,false);
 assert.equal(obligationView(d.get('state'),'claim').owed,20);
 const before=JSON.stringify(d.document);assert.throws(()=>settleClaim(d,f.e,{id:'claim',amount:1},'late'),/enforceable/);assert.equal(JSON.stringify(d.document),before);
 assert.throws(()=>recordClaimProcedure(d,f.e,{claim:'claim',action:'restart',evidence:'invented'},'fake'),/actual/);
});
test('同一货损的保险、返还及法院赔偿共用剩余损失；重试不双付',()=>{
 const f=fixture(),d=f.draft();registerLoss(d,f.e,{id:'loss',victim:worker,amount:100,source:'cargo:one'});
 let transferred=0;recoverLoss(d,f.e,{id:'loss',amount:60,payer:host,kind:'insurance'},'insurance',n=>transferred+=n);
 recoverLoss(d,f.e,{id:'loss',amount:60,payer:host,kind:'insurance'},'insurance',n=>transferred+=n);
 assert.equal(transferred,60);assert.equal(lossView(d.get('state'),'loss').remaining,40);
 const before=JSON.stringify(d.document);assert.throws(()=>recoverLoss(d,f.e,{id:'loss',amount:100,payer:host},'court',()=>{throw Error('must not run');}),/remaining/);assert.equal(JSON.stringify(d.document),before);
 recoverLoss(d,f.e,{id:'loss',amount:40,payer:host,kind:'restitution'},'return',n=>transferred+=n);
 assert.equal(lossView(d.get('state'),'loss').remaining,0);assert.equal(transferred,100);
});
test('实际清偿回执重起时效，重复回执不再改变金额或程序事实',()=>{
 const f=bookedFixture(),d=f.draft();registerEarnedClaim(d,f.e,{id:'acknowledged',kind:'compensation',debtor:'player',creditor:host,amount:20,createdAt:0,deadline:500,terms:{limitation:{minutes:200}},source:'visit'});
 settleClaim(d,f.e,{id:'acknowledged',amount:1},'part');
 assert.equal(obligationView(d.get('state'),'acknowledged').owed,19);
 assert.equal(claimLimitation(d.get('state'),'acknowledged',800).enforceable,true);
 assert.equal(claimLimitation(d.get('state'),'acknowledged',801).enforceable,false);
 const snapshot=JSON.stringify(d.document);settleClaim(d,f.e,{id:'acknowledged',amount:1},'part');assert.equal(JSON.stringify(d.document),snapshot);
});
test('同一物品后来再次被盗属于新损失，不能被上一次返还抹去',()=>{
 const f=fixture(),d=f.draft(),first={id:'case:first',victim:host,value:12,sourceEvent:'theft:first',stolen:{unit:'same-unit'}};
 const loss=caseLoss(d,f.e,first);recoverLoss(d,f.e,{id:loss.id,amount:12,payer:worker,kind:'restitution'},'first-return');
 const second=caseLoss(d,f.e,{...first,id:'case:second',sourceEvent:'theft:second'});assert.notEqual(second.id,loss.id);assert.equal(second.remaining,12);
});
test('医疗旧欠费异地保留，同地重试清偿一次；实际账本守恒',()=>{
 const f=fixture();f.doc.ledger=openLedger(f.e,f.doc);let d=f.draft();
 registerEarnedClaim(d,f.e,{id:'care',kind:'compensation',service:'medicine',debtor:worker,creditor:host,amount:20,createdAt:0,deadline:30*DAY,source:'visit'});
 d.set(['state','npcs',host,'location'],'remote');advanceMedicine(d,f.e,{before:600,after:DAY});assert.equal(obligationView(d.get('state'),'care').owed,20);
 d.set(['state','npcs',host,'location'],d.get('state','npcs',worker,'location'));
 advanceMedicine(d,f.e,{before:600,after:DAY});assert.equal(obligationView(d.get('state'),'care').owed,0);
 const paid=d.get('state','npcs',host,'coins');advanceMedicine(d,f.e,{before:600,after:DAY});assert.equal(d.get('state','npcs',host,'coins'),paid);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
test('旧存档医疗欠费首次收款导入一次并同步旧记录；非法种类开立原子回滚',()=>{
 const f=bookedFixture(),d=f.draft();d.set(['state','records','old-care'],{id:'old-care',category:'debt',kind:'medicine',debtor:worker,creditor:host,amount:12,paid:2,createdAt:0,deadline:30*DAY,status:'待偿还'});
 advanceMedicine(d,f.e,{before:600,after:DAY});assert.equal(d.get('state','records','old-care','paid'),12);assert.equal(d.get('state','records','old-care','status'),'已还清');assert.equal(obligationView(d.get('state'),'old-care').owed,0);
 const snapshot=JSON.stringify(d.document);assert.throws(()=>registerEarnedClaim(d,f.e,{id:'invalid',kind:'not-registered',debtor:worker,creditor:host,amount:1,createdAt:600,deadline:700}),/Undeclared/);assert.equal(JSON.stringify(d.document),snapshot);
});
test('未开账草稿不能扣走镜像现金却报告零清偿',()=>{
 const f=fixture(),d=f.draft();d.set(['state','records','unopened'],{id:'unopened',category:'debt',kind:'medicine',debtor:worker,creditor:host,amount:12,paid:0,createdAt:0,deadline:30*DAY,status:'待偿还'});
 const snapshot=JSON.stringify(d.document);assert.throws(()=>settleClaim(d,f.e,{id:'unopened',amount:12},'pay'),/已开账/);assert.equal(JSON.stringify(d.document),snapshot);
});
test('服务顺序由真实伤势决定，相同紧迫度保持到达和编号顺序；候诊可取消',()=>{
 assert.equal(serviceUrgency([{severity:'轻',record:{bleedingMlPerMinute:1}}]),3);
 assert.deepEqual(orderServices([{id:'b',urgency:1,createdAt:0},{id:'urgent',urgency:3,createdAt:1},{id:'a',urgency:1,createdAt:0}]).map(r=>r.id),['urgent','a','b']);
 const f=fixture(),d=f.draft();d.set(['state','records','waiting'],{id:'waiting',category:'medicine_visit',patient:'player',status:'排队',start:1000});
 const result=medicineAction.call(f.e,d,{operation:'medicine_cancel',contract:'waiting'},'cancel');assert.equal(result.status,'已取消');
});
test('术后护理有独立到期边界，不依赖下一次患者预约',()=>{
 const f=fixture(),d=f.draft();d.set(['state','player','medical'],{wounds:[{careDue:700}]});assert.equal(nextMedicineMinute(f.e,d,600),700);
});
test('医馆实有一名医师时高危伤者先占下一诊次，轻症保留候诊且不能超卖医师时段',()=>{
 const clinic='bld_hw_herbs',f=fixture({at:clinic});f.doc.state.minute=481;
 Object.assign(f.doc.state.npcs[host],{occupation:'医师',workplace:{location:clinic},skills:{[MEDICAL_SKILL]:1500}});
 delete f.doc.state.npcs[host].vocation;f.e.byId.get(host).schedule={default:[{start:0,end:1440,location:clinic,activity:'坐诊'}]};
 f.doc.state.buildings[clinic]={...f.doc.state.buildings[clinic],owner:host};
 f.doc.state.npcs[worker].medical={wounds:[{id:'light',depthMm:1,areaCm2:1,closed:false,contamination:1,bleedingMlPerMinute:0}]};
 f.doc.state.player.medical={wounds:[{id:'urgent',depthMm:1,areaCm2:1,closed:false,contamination:1,bleedingMlPerMinute:2}]};
 const d=f.draft();assert.deepEqual(medicineSites(f.e,d.get('state')).find(s=>s.seat===clinic).doctors,[host]);
 const low=bookMedicine(d,f.e,{patient:worker,clinic,consent:true},'low');
 const high=bookMedicine(d,f.e,{clinic,consent:true},'urgent');assert.equal(high.start,low.start);assert.equal(d.get('state','records',low.id,'status'),'排队');
 advanceMedicine(d,f.e,{before:481,after:482});const rebook=d.get('state','records',low.id);
 assert.equal(rebook.status,'预约');assert.ok(rebook.start>=high.end);
});
