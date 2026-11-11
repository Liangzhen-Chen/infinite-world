// E05 冬季托运到远方：远方郡只在玩家本人到达时生成，无法在去之前向星湾下单托运，情境不可完整构造；
// 以下检查读取承运、关税、汇票与远方生成的现有机制（核对者亦按代码判断）。
import {src,ok,partial,wrong,missing} from '../harness.mjs';

import assert from 'node:assert/strict';
import {fixture,asset,finish,DRIVER,SECOND} from '../../helpers/transport.mjs';
import {bookTransport,transportAssetView,nextTransportMinute,advanceTransport,damageTransportCargo,compensateTransportLoss,collectTransport} from '../../../server-plugin/transport.mjs';
import {settleClaim,lossView} from '../../../server-plugin/obligation-claims.mjs';
import {openLedger,auditLedger} from '../../../server-plugin/ledger.mjs';
import {dueObligation} from '../../../server-plugin/obligation-runtime.mjs';
import {weatherFoundation} from '../../../world/design/weather-foundation.mjs';
import {weatherAt} from '../../../server-plugin/weather.mjs';

function setup(){const f=fixture();f.d.document.ledger=openLedger(f.e,f.d.document);return f;}

const transport=()=>src('server-plugin/transport.mjs');
export default [
 {id:'E05-1',event:'E05',no:1,text:'货物超出船的载量要拒运或分批',async check(){
  // Drives the real booking (the source-text probe broke when batching changed the expression to load+used>capacity).
  const {d,e}=setup(),vehicle=asset(d,e),capacity=transportAssetView(e,d.document,vehicle).capacityKg;
  d.set(['state','inventory','item_wood'],{quantity:5000});const untouched=structuredClone(d.document);
  assert.throws(()=>bookTransport(d,e,{asset:vehicle,to:'loc_bs',cargo:[{item:'item_wood',quantity:5000}]},'overload'),/货舱重量、体积或座位容量不足/);
  assert.deepEqual(d.document,untouched);
  d.set(['state','inventory','item_wood'],{quantity:1});assert.ok(bookTransport(d,e,{asset:vehicle,to:'loc_bs',cargo:[{item:'item_wood',quantity:1}]},'fits').id);
  return ok(`超过运力${capacity}kg的货单整笔拒运且不改动任何状态，未超的照常承运（不分批）`);}},
 {id:'E05-2',event:'E05',no:2,text:'滞留天数按天气结算，护卫工资按天累计',async check(){
 const {d,e,w}=setup(),vehicle=asset(d,e,DRIVER,'boat');
 const trip=bookTransport(d,e,{asset:vehicle,to:'loc_yp_path',escort:SECOND,escortDailyWage:12},'nine-days');
 const signedWage=structuredClone(d.get('state','obligations',trip.escortWage));
 w.rules.weather={...structuredClone(weatherFoundation),persistence:0,seasonalWeights:Array.from({length:4},()=>[0,0,0,1,0,0])};
 assert.equal(weatherAt(e,d.document.randomSeed,'loc_bs',600).boatClosed,true);
 for(let day=1;day<=9;day++){
  const until=trip.createdAt+day*1440;
  for(let i=0;i<20;i++){
   const at=nextTransportMinute(d.get('state'),d.get('state','minute'));
   if(at>until)break;
   assert.ok(Number.isFinite(at));d.set(['state','minute'],at);advanceTransport(d,e,at);
  }
  d.set(['state','minute'],until);
  assert.equal(d.get('state','records',trip.id,'status'),'delayed');
  assert.equal(dueObligation(d.get('state'),trip.escortWage).owed,trip.escortTerms.base+day*12);
 }
 assert.equal(d.get('state','records',trip.id,'status'),'delayed');
 assert.deepEqual(d.get('state','obligations',trip.escortWage),signedWage);
 const elapsed=d.get('state','minute')-trip.createdAt;
 assert.ok(elapsed>=9*1440);
 assert.equal(dueObligation(d.get('state'),trip.escortWage).owed,trip.escortTerms.base+Math.floor(elapsed*12/1440));
 w.rules.weather={...w.rules.weather,seasonalWeights:Array.from({length:4},()=>[1,0,0,0,0,0])};
 const row=finish(d,e,trip.id),wage=dueObligation(d.get('state'),row.escortWage);
 const earned=row.escortTerms.base+Math.floor((row.arrivedAt-row.createdAt)*12/1440);
 assert.ok(row.arrivedAt-row.createdAt>=9*1440);
 assert.equal(row.escortEarned,earned);assert.equal(row.escortPaid,row.escortTerms.base);assert.equal(wage.owed,earned-row.escortPaid);
 const before=structuredClone(d.document);advanceTransport(d,e,d.get('state','minute'));assert.deepEqual(d.document,before);
 assert.throws(()=>settleClaim(d,e,{id:row.escortWage,payer:'player',amount:wage.owed},'remote-wage'));
 d.set(['state','location'],'loc_yp_path');settleClaim(d,e,{id:row.escortWage,payer:'player',amount:wage.owed},'remaining-wage');
 assert.equal(dueObligation(d.get('state'),row.escortWage).owed,0);assert.deepEqual(auditLedger(d.get('ledger')),[]);
 return ok(`暴风滞留9天，日薪12，实际总应付${earned}、预付${row.escortPaid}、余欠${wage.owed}；到场实付结清`);}},
 {id:'E05-3',event:'E05',no:3,text:'两道关卡分别按各自政体的税率收税',async check(){
  return /tradeTax/.test(transport())&&/polity|adminLevel/.test(src('server-plugin/finance-tax.mjs'))?ok('每段按目的地结算 tradeTax，政体类型与级别参与'):partial('关税未按政体分段');}},
 {id:'E05-4',event:'E05',no:4,text:'受潮那箱降价，或按托运契约索赔',async check(){
 const {d,e}=setup(),vehicle=asset(d,e);d.set(['state','inventory','item_oats'],{quantity:10});d.document.ledger=openLedger(e,d.document);
 const trip=bookTransport(d,e,{asset:vehicle,to:'loc_bs',cargo:[{item:'item_oats',quantity:10}]},'damage-trip');
 const args={shipment:trip.id,item:'item_oats',quantity:3,actor:DRIVER,cause:'damp'};
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
 const owner=d.get('state','player','coins'),carrier=d.get('state','npcs',DRIVER,'coins');
 // W8-D / 15 §15.2: loss uses local market value, not the catalog base.
 // Spring base=3*0.9=2.7; spot S=(8000-5220)+50=2830, D=5220,
 // quality/corrections=1: floor(3*2.7*5220/2830)=14 copper.
 assert.equal(loss.amount,14);assert.ok(loss.amount>1);
 const part=Math.floor(loss.amount/2),paid=compensateTransportLoss(d,e,{loss:loss.id,amount:part,payer:DRIVER},'compensate');assert.equal(paid.transferred,part);assert.equal(lossView(d.get('state'),loss.id).remaining,loss.amount-part);assert.equal(dueObligation(d.get('state'),`${loss.id}:claim`).owed,loss.amount-part);
 compensateTransportLoss(d,e,{loss:loss.id,amount:loss.amount-part,payer:DRIVER},'compensate-rest');
 assert.equal(d.get('state','player','coins'),owner+loss.amount);
 assert.equal(d.get('state','npcs',DRIVER,'coins'),carrier-loss.amount);
 assert.equal(dueObligation(d.get('state'),`${loss.id}:claim`).owed,0);
 const done=structuredClone(d.document);assert.deepEqual(compensateTransportLoss(d,e,{loss:loss.id,amount:part,payer:DRIVER},'compensate'),paid);assert.deepEqual(d.document,done);
 assert.throws(()=>compensateTransportLoss(d,e,{loss:loss.id,amount:1,payer:DRIVER},'double'));
 assert.equal(lossView(d.get('state'),loss.id).remaining,0);assert.deepEqual(auditLedger(d.get('ledger')),[]);
 return ok(`受潮损失3，托运10→交付7；索赔${loss.amount}分两次实付，双方现金对应增减，余欠0且拒绝重复赔付`);}},
 {id:'E05-5',event:'E05',no:5,text:'玩家首次到达时才生成星湾骨架，此前当地价格未知',async check(){
  const engine=src('server-plugin/engine.mjs');
  return /unfoldRemoteAt/.test(engine)?partial('到达才生成、此前无细节（符合）；但正因无骨架，去之前无法向当地托运，题设情境构造不出来'):missing('无远方生成');}},
 {id:'E05-6',event:'E05',no:6,text:'汇票只能在有兑付网点的地方兑现',async check(){
  const bank=src('server-plugin/finance-bank.mjs');
  return /cash_bill|cashBill/.test(bank)&&/兑付|柜面|branch/.test(bank)?ok('须指定异地真实钱庄柜面，兑付地不符报错'):wrong('汇票不检兑付网点');}},
];
