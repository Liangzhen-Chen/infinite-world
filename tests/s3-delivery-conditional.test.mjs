import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,asset,finish,DRIVER,SECOND} from './helpers/transport.mjs';
import {bookTransport,nextTransportMinute,advanceTransport,damageTransportCargo,compensateTransportLoss,collectTransport} from '../server-plugin/transport.mjs';
import {settleClaim,lossView} from '../server-plugin/obligation-claims.mjs';
import {openGoodsObligation,performGoodsObligation,extendGoodsObligation} from '../server-plugin/obligation-conditional.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {dueObligation} from '../server-plugin/obligation-runtime.mjs';
import {createNpcObligation,advanceNpcObligations} from '../server-plugin/npc-obligations.mjs';
import {questBoardAction} from '../server-plugin/quest-board.mjs';
import {weatherFoundation} from '../world/design/weather-foundation.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {breakBossAgreement} from '../server-plugin/boss-negotiation.mjs';

function setup(){const f=fixture();f.d.document.ledger=openLedger(f.e,f.d.document);return f;}
function forward(f,extra={}){
 return openGoodsObligation(f.d,f.e,{id:'grain-forward',kind:'forward',debtor:DRIVER,creditor:'player',item:'item_oats',quantity:12,prepayment:40,deadline:2000,...extra},'sign-grain');
}
test('远期预付真实记账、短交留债、展期保留签署快照、分批交货不复制',()=>{
 const f=setup(),{d,e}=f,coins=d.get('state','player','coins');forward(f);
 assert.equal(d.get('state','player','coins'),coins-40);
 assert.equal(dueObligation(d.get('state'),'grain-forward:prepayment').owed,0);
 const terms=structuredClone(d.get('state','obligations','grain-forward','terms'));
 performGoodsObligation(d,e,{id:'grain-forward',quantity:5},'harvest-part');
 assert.equal(dueObligation(d.get('state'),'grain-forward').owed,7);assert.equal(e.quantity(d,'player','item_oats'),5);
 // 产品原则：债务人不能自行改期；债权人的原生同意只覆盖这笔债权和新期限。
 const unchanged=structuredClone(d.document);
 assert.throws(()=>extendGoodsObligation(d,e,{id:'grain-forward',actor:DRIVER,deadline:3000},'crop-delay'));
 assert.deepEqual(d.document,unchanged);
 applyConsentEvent(d,{engine:e,document:d.document},{actor:'player',eventId:'crop-delay-agreed',verb:'consent_given',to:DRIVER,payload:{scope:'amend',subject:'grain-forward',purpose:['grain-forward'],terms:{deadline:3000},until:601}});
 extendGoodsObligation(d,e,{id:'grain-forward',actor:DRIVER,deadline:3000},'crop-delay');
 assert.deepEqual(d.get('state','obligations','grain-forward','terms'),terms);
 const saved=JSON.parse(JSON.stringify(d.document));d.document=saved;
 const result=performGoodsObligation(d,e,{id:'grain-forward',quantity:7},'harvest-rest'),before=structuredClone(d.document);
 assert.equal(result.remaining,0);assert.equal(e.quantity(d,'player','item_oats'),12);
 assert.deepEqual(performGoodsObligation(d,e,{id:'grain-forward',quantity:7},'harvest-rest'),result);assert.deepEqual(d.document,before);
 assert.throws(()=>performGoodsObligation(d,e,{id:'grain-forward',quantity:1},'over-delivery'));assert.deepEqual(d.document,before);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
test('缺钱预付、缺货和异地交付整笔回滚；欠额不因在途或逾期消失',()=>{
 const f=setup(),{d,e}=f;d.set(['state','player','coins'],0);d.document.ledger=openLedger(e,d.document);
 let before=structuredClone(d.document);assert.throws(()=>forward(f));assert.deepEqual(d.document,before);
 forward(f,{prepayment:0});d.set(['state','npcs',DRIVER,'inventory','item_oats','quantity'],0);
 before=structuredClone(d.document);assert.throws(()=>performGoodsObligation(d,e,{id:'grain-forward',quantity:1},'empty'));assert.deepEqual(d.document,before);
 d.set(['state','npcs',DRIVER,'location'],'loc_bs');d.set(['state','minute'],3000);before=structuredClone(d.document);
 assert.throws(()=>performGoodsObligation(d,e,{id:'grain-forward',quantity:1},'remote'));assert.deepEqual(d.document,before);
 assert.equal(dueObligation(d.get('state'),'grain-forward').owed,12);
});
test('实物履行不能绕过正在执行的遗产程序，也不能把货币责任限额当作货物数量',()=>{
 const f=setup(),{d,e}=f;forward(f,{prepayment:0});
 d.set(['state','records',`transition_procedure:${DRIVER}`],{phase:'settlement'});
 let before=structuredClone(d.document);assert.throws(()=>performGoodsObligation(d,e,{id:'grain-forward',quantity:1},'outside-estate'),/程序控制/);assert.deepEqual(d.document,before);
 d.set(['state','records',`transition_procedure:${DRIVER}`,'phase'],'closed');
 performGoodsObligation(d,e,{id:'grain-forward',quantity:1},'after-estate');assert.equal(dueObligation(d.get('state'),'grain-forward').owed,11);
 d.set(['state','obligations','grain-forward','inheritanceFrom'],'departed');d.set(['state','obligations','grain-forward','terms','liabilityCap'],2);
 before=structuredClone(d.document);assert.throws(()=>performGoodsObligation(d,e,{id:'grain-forward',quantity:1},'currency-cap'),/计价接点/);assert.deepEqual(d.document,before);
});
test('实签报恩、还愿和生灵契约按实物履行，不把历史感恩自动变成债务',()=>{
 for(const kind of ['gratitude','vow','pact']){
  const {d,e}=setup();assert.equal(Object.values(d.get('state','obligations')).some(o=>o.kind===kind),false);
  openGoodsObligation(d,e,{id:kind,kind,debtor:DRIVER,creditor:'player',item:'item_oats',quantity:2,deadline:1000},`sign-${kind}`);
  assert.equal(d.get('state','obligations',kind,'terms','onDebtorGone'),'pursue');
  assert.equal(d.get('state','obligations',kind,'terms','onCreditorGone'),'heirs');
  performGoodsObligation(d,e,{id:kind,quantity:2},`perform-${kind}`);
  assert.equal(dueObligation(d.get('state'),kind).owed,0);assert.equal(e.quantity(d,'player','item_oats'),2);
 }
});
test('NPC预约使用规范签署身份，按真实出席履行并保留旧回放形状',()=>{
 const {d,e}=setup();e.byId.get(DRIVER).tier='full';
 const args={type:'会面',promisor:DRIVER,promisee:'player',content:'当面确认运单',start:600,deadline:630,location:'loc_hw'};
 const signed=createNpcObligation(d,e,args,'meeting').obligation;
 assert.equal(signed.runtimeVersion,1);assert.equal(signed.kind,'promise');assert.equal(signed.debtor,DRIVER);
 d.set(['state','minute'],630);advanceNpcObligations(d,e,600,630,'attendance');
 assert.equal(d.get('state','obligations',signed.id,'status'),'已完成');
 const old=setup();old.e.byId.get(DRIVER).tier='full';old.e.replaying=true;old.e.replayResult={obligation:{reservationVersion:1}};
 assert.equal(createNpcObligation(old.d,old.e,args,'legacy').obligation.runtimeVersion,undefined);
});
test('预约互斥先拒绝且不扣款；收约方可取消自己的预约',()=>{
 const {d,e}=setup();e.byId.get(DRIVER).tier='full';
 const args={type:'会面',promisor:DRIVER,promisee:'player',content:'同一时段',start:650,deadline:680,location:'loc_hw'};
 const signed=createNpcObligation(d,e,args,'one').obligation,before=structuredClone(d.document);
 assert.throws(()=>createNpcObligation(d,e,{...args,promisee:SECOND},'two'));assert.deepEqual(d.document,before);
 createNpcObligation(d,e,{operation:'cancel',actor:'player',obligation:signed.id},'cancel');
 assert.equal(d.get('state','obligations',signed.id,'status'),'取消');assert.equal(d.get('state','obligations',signed.id,'endedAt'),600);
});
test('天气停九天仍累计护卫日薪，抵达冲抵原预付，异地欠额不凭空清偿',()=>{
 const {d,e,w}=setup(),vehicle=asset(d,e,DRIVER,'boat');
 const trip=bookTransport(d,e,{asset:vehicle,to:'loc_yp_path',escort:SECOND,escortDailyWage:12},'nine-days');
 const signedWage=structuredClone(d.get('state','obligations',trip.escortWage));
 w.rules.weather={...structuredClone(weatherFoundation),persistence:0,seasonalWeights:Array.from({length:4},()=>[0,0,0,1,0,0])};
 assert.equal(weatherAt(e,d.document.randomSeed,'loc_bs',600).boatClosed,true);
 for(let i=0;i<20;i++){
  const at=nextTransportMinute(d.get('state'),d.get('state','minute'));
  if(at>trip.createdAt+9*1440)break;
  assert.ok(Number.isFinite(at));d.set(['state','minute'],at);advanceTransport(d,e,at);
 }
 assert.equal(d.get('state','records',trip.id,'status'),'delayed');
 assert.deepEqual(d.get('state','obligations',trip.escortWage),signedWage);
 assert.ok(dueObligation(d.get('state'),trip.escortWage).owed>trip.escortTerms.base);
 w.rules.weather={...w.rules.weather,seasonalWeights:Array.from({length:4},()=>[1,0,0,0,0,0])};
 const row=finish(d,e,trip.id),wage=dueObligation(d.get('state'),row.escortWage);
 const earned=row.escortTerms.base+Math.floor((row.arrivedAt-row.createdAt)*12/1440);
 assert.ok(row.arrivedAt-row.createdAt>=9*1440);
 assert.equal(row.escortEarned,earned);assert.equal(row.escortPaid,row.escortTerms.base);assert.equal(wage.owed,earned-row.escortPaid);
 const before=structuredClone(d.document);advanceTransport(d,e,d.get('state','minute'));assert.deepEqual(d.document,before);
 assert.throws(()=>settleClaim(d,e,{id:row.escortWage,payer:'player',amount:wage.owed},'remote-wage'));
 d.set(['state','location'],'loc_yp_path');settleClaim(d,e,{id:row.escortWage,payer:'player',amount:wage.owed},'remaining-wage');
 assert.equal(dueObligation(d.get('state'),row.escortWage).owed,0);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
test('货损消耗实际在途库存并共用损失赔偿上限，重复事件不毁第二次货也不双赔',()=>{
 const {d,e}=setup(),vehicle=asset(d,e);d.set(['state','inventory','item_oats'],{quantity:10});d.document.ledger=openLedger(e,d.document);
 const trip=bookTransport(d,e,{asset:vehicle,to:'loc_bs',cargo:[{item:'item_oats',quantity:10}]},'damage-trip');
 const args={shipment:trip.id,item:'item_oats',quantity:3,actor:DRIVER};
 const untouched=structuredClone(d.document);assert.throws(()=>damageTransportCargo(d,e,{...args,actor:'player'},'owner-claim'));assert.deepEqual(d.document,untouched);
 const loss=damageTransportCargo(d,e,args,'wet-cargo'),before=structuredClone(d.document);
 assert.equal(d.get('state','records',trip.id,'cargo')[0].quantity,7);
 assert.deepEqual(damageTransportCargo(d,e,args,'wet-cargo'),loss);assert.deepEqual(d.document,before);
 assert.throws(()=>compensateTransportLoss(d,e,{loss:loss.id,amount:loss.amount,payer:DRIVER},'in-transit'));
 // The other seven units arrive in custody; absence is not a second loss.
 for(let i=0;i<20&&d.get('state','records',trip.id,'status')!=='arrived';i++){
  const at=nextTransportMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceTransport(d,e,at);
 }
 assert.equal(d.get('state','records',trip.id,'status'),'arrived');assert.equal(e.quantity(d,'player','item_oats'),0);
 d.set(['state','location'],'loc_bs');collectTransport(d,e,trip.id);assert.equal(e.quantity(d,'player','item_oats'),7);
 const part=Math.floor(loss.amount/2),paid=compensateTransportLoss(d,e,{loss:loss.id,amount:part,payer:DRIVER},'compensate');assert.equal(paid.transferred,part);
 compensateTransportLoss(d,e,{loss:loss.id,amount:loss.amount-part,payer:DRIVER},'compensate-rest');
 const done=structuredClone(d.document);assert.deepEqual(compensateTransportLoss(d,e,{loss:loss.id,amount:part,payer:DRIVER},'compensate'),paid);assert.deepEqual(d.document,done);
 assert.throws(()=>compensateTransportLoss(d,e,{loss:loss.id,amount:1,payer:DRIVER},'double'));
 assert.equal(lossView(d.get('state'),loss.id).remaining,0);assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
test('已验证委托报酬转为同一规范债权，托管不双计，取消不能退回已赚报酬',()=>{
 const {d,e}=setup(),coins=d.get('state','player','coins');
 questBoardAction(d,e,{operation:'publish',publisher:DRIVER,grade:'D',personal:true,reward:20,content:'核对到场',objective:{type:'visit',location:'loc_hw'}},'canonical-quest');
 questBoardAction(d,e,{operation:'accept',quest:'quest_canonical-quest'},'take-canonical');
 d.set(['state','discoveries','loc_hw'],{minute:600});
 questBoardAction(d,e,{operation:'complete',quest:'quest_canonical-quest'},'complete-canonical');
 const q=d.get('state','quests','quest_canonical-quest');
 assert.equal(q.escrow,0);assert.equal(q.rewardPaid,20);assert.equal(d.get('state','player','coins'),coins+20);
 assert.equal(dueObligation(d.get('state'),q.rewardClaim).owed,0);assert.equal(d.get('state','obligations',q.rewardClaim,'paid'),20);
 assert.equal(d.get('state','records',q.id,'escrow'),0);
 const before=structuredClone(d.document);assert.throws(()=>questBoardAction(d,e,{operation:'cancel',quest:q.id},'cancel-paid'));assert.deepEqual(d.document,before);
 assert.deepEqual(auditLedger(d.get('ledger')),[]);
});
test('首领实签约定的公开形状兼容，规范pact可回放、换约与实际毁约',async()=>{
 const {d,e,w}=setup(),boss=w.bosses.find(b=>b.id==='boss_shadow_sentinel');
 boss.cognition={goal:'defend_territory',territory:[boss.lair]};
 d.set(['state','location'],boss.lair);d.set(['state','player','hp'],10000);d.set(['state','player','maxHp'],10000);
 const approached=await e.reduce(d.document,{tool:'world_lair',args:{operation:'approach',lair:'lair_shadow_sentinel'},eventId:'pact-approach'});
 const before=applyPatches(d.document,approached.patches),call={tool:'world_lair',args:{operation:'negotiate',lair:'lair_shadow_sentinel',pact:'respect_territory',offer:[],request:[]},eventId:'pact-sign'};
 const signed=await e.reduce(before,call),replay=await e.reduce(before,call,{replay:true,result:signed.result});
 assert.deepEqual(replay,signed);assert.deepEqual(signed.result.relation,{pact:'respect_territory',alliance:false,event:'pact-sign'});
 d.document=applyPatches(before,signed.patches);assert.equal(d.get('state','obligations','boss-pact:pact-sign','kind'),'pact');
 const replacement=await e.reduce(d.document,{...call,eventId:'pact-replace'});d.document=applyPatches(d.document,replacement.patches);
 assert.equal(dueObligation(d.get('state'),'boss-pact:pact-sign').closed,true);
 breakBossAgreement(d,'boss_shadow_sentinel','actual-attack',e);
 assert.equal(d.get('state','obligations','boss-pact:pact-replace','status'),'breached');
 assert.equal(d.get('state','creatures','boss_shadow_sentinel','negotiation','relation'),null);
});
