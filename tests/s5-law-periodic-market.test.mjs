import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {advanceShops,currentShops,tradeQuote,recordAgreedQuote} from '../server-plugin/shop.mjs';
import {advanceCustomerFlow} from '../server-plugin/business.mjs';
import {marketSupply,subjectiveMarketQuote,assertMarketDepth} from '../server-plugin/market.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {scheduleAt,advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {marketTimeWindows,householdWorkTime} from '../server-plugin/npc-state.mjs';
import {moveCoins,purse,mirrorPartyCoins} from '../server-plugin/money.mjs';
import {transferItems} from '../server-plugin/items.mjs';
import {bookTransport,advanceTransport,nextTransportMinute} from '../server-plugin/transport.mjs';
import {fixture as transportFixture,asset,DRIVER} from './helpers/transport.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const DAY=1440,owner='npc_hw_linsui',buyer='npc_hw_luowei',seller='npc_hw_yanzhe',place='bld_hw_qingdeng',item='item_ration';
function fixture({food=false}={}){
 const w=structuredClone(world);
 const ids=[owner,buyer,seller];
 for(const n of w.npcs)if(ids.includes(n.id)){
  delete n.tier;
  if(n.id===buyer&&food)n.tier='full';
  n.schedule={default:[{start:0,end:1440,location:place,activity:'休息',services:n.id===owner?['trade']:[]}]};
 }
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>!ids.includes(id))})).filter(h=>h.members.length);
 for(const id of ids)w.households.push({id:`house_${id}`,members:[id],settlement:'loc_hw',homeLocation:place,tenure:'独立家计'});
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:food?1:0}];
 w.marketRules.customerChoice.noisePermille=0;
 for(const r of w.primitiveTables.body.rows)if(r.selector==='person')r.drainPerHour.light=r.need==='satiety'?10/24:0;
 w.items.find(i=>i.id===item).nutrition={satiety:1};
 const row={item,source:'route',from:'loc_bs',amount:2,maximum:20};
 const shop=w.rules.economy.shops.stores.find(s=>s.keeper===owner);shop.restock=[row];shop.firstDay=1;shop.cycleDays=1;
 w.npcs.find(n=>n.id===owner).shopRestock=[row];
 const e=new WorldEngine(w),doc=e.initialFromLegacy(legacy,'periodic-market');
 doc.state.minute=DAY;doc.state.location=place;doc.state.settlements={};
 doc.state.npcs=Object.fromEntries(ids.map(id=>[id,{...doc.state.npcs[id],coins:id===owner?100:0,inventory:{},location:place,status:'正常',activity:'休息',goals:{},memoryStream:[]}]));
 const sync=()=>{doc.ledger=openLedger(e,doc);return e.primitiveDraft(doc);};
 return {w,e,doc,sync,shop};
}
const visits=d=>Object.values(d.get('state','records')).filter(r=>r.category==='customer_flow').flatMap(r=>r.visits);

test('native noon boundary settles before afternoon income and stock; a daytime keeper can sleep elsewhere at midnight',()=>{
 for(const late of [false,'cash','stock']){
  const f=fixture({food:true}),home='loc_hw';
  f.doc.state.minute=700;f.doc.state.npcs[buyer].coins=late==='cash'?0:100;
  f.doc.state.npcs[owner].inventory={[item]:late==='stock'?0:100};
  f.doc.state.npcs[seller].inventory={[item]:100};
  f.w.npcs.find(n=>n.id===owner).schedule.default=[
   {start:0,end:480,location:home,activity:'睡眠',services:[]},
   {start:480,end:800,location:place,activity:'营业',services:['trade']},
   {start:800,end:1440,location:home,activity:'睡眠',services:[]}];
  const d=f.sync();f.e.advance(d,20,`noon:${late}`);
  const noon=visits(d).filter(v=>v.outcome==='bought');
  assert.equal(noon.length>0,!late,`noon ${late}`);
  f.e.advance(d,60,`afternoon:${late}`);
  if(late==='cash'){
   moveCoins(d,{from:purse(f.e,'player'),to:purse(f.e,buyer),amount:100,writer:'shop',eventId:'afternoon-income'});
   mirrorPartyCoins(d,f.e,'player',-100,'afternoon-income','shop');mirrorPartyCoins(d,f.e,buyer,100,'afternoon-income','shop');
  }
  if(late==='stock')transferItems(d,f.e,seller,owner,item,100);
  f.e.advance(d,DAY-780,`midnight:${late}`);
  assert.equal(d.get('state','npcs',owner,'location'),home);
  assert.deepEqual(visits(d).filter(v=>v.outcome==='bought'),noon);
  assert.equal(f.e.quantity(d,buyer,item)>0,!late);
 }
});

test('a real purchase reserves round-trip and service time, moves the actor and blocks overlapping production',()=>{
 const f=fixture({food:true}),home='loc_hw';
 f.doc.state.minute=720;f.doc.state.npcs[buyer].coins=100;
 f.doc.state.npcs[owner].inventory={[item]:100};f.doc.state.npcs[buyer].location=home;
 f.w.npcs.find(n=>n.id===buyer).schedule.default[0].location=home;
 f.w.routes=[{id:'market-roundtrip',from:home,to:place,modes:['walk'],lengthKm:0.1,terrainMultiplier:1,toll:2,closedSeasons:[]}];
 const d=f.sync();advanceCustomerFlow(d,f.e,719,720);
 const v=visits(d).find(v=>v.npc===buyer&&v.outcome==='bought'),trip=v.travel;
 // Two actual routes, five service minutes; time is shared with production,
 // while the four-copper toll is paid once, not again by the scheduler.
 assert.equal(marketTimeWindows(d.get('state'),buyer)[0].end-trip.departAt,trip.returnAt-trip.departAt);
 assert.deepEqual(marketTimeWindows(d.get('state'),owner).map(r=>[r.start,r.end]),[[trip.serviceAt,trip.finishAt]]);
 assert.throws(()=>f.e.assertNpcObligationAction(d,[owner],{start:trip.serviceAt,minutes:1,kind:'autonomy'}),/服务时段/);
 assert.doesNotThrow(()=>f.e.assertNpcObligationAction(d,[owner],{start:trip.departAt,minutes:1,kind:'autonomy'}));
 assert.equal(scheduleAt(f.e,buyer,trip.departAt,d.get('state')).activity,'赶集途中');
 assert.throws(()=>f.e.assertNpcObligationAction(d,[buyer],{start:trip.departAt,minutes:1,kind:'autonomy'}),/赶集/);
 const cash=d.get('state','npcs',buyer,'coins');
 advanceNpcSchedules(d,f.e,trip.departAt,trip.arriveAt);
 assert.equal(d.get('state','npcs',buyer,'location'),place);
 assert.equal(scheduleAt(f.e,buyer,trip.arriveAt,d.get('state')).activity,'赶集采购');
 advanceNpcSchedules(d,f.e,trip.arriveAt,trip.finishAt+1);
 assert.equal(d.get('state','npcs',buyer,'location'),null);
 advanceNpcSchedules(d,f.e,trip.finishAt+1,trip.returnAt);
 assert.equal(d.get('state','npcs',buyer,'location'),home);
 assert.equal(d.get('state','npcs',buyer,'coins'),cash);
 assert.doesNotThrow(()=>f.e.assertNpcObligationAction(d,[buyer],{start:trip.returnAt,minutes:1,kind:'autonomy'}));
});

test('K04 work windows subtract only the actual market overlap, never charge the same minutes twice',()=>{
 const f=fixture({food:true}),home='loc_hw';
 f.doc.state.minute=720;f.doc.state.npcs[buyer].coins=100;
 f.doc.state.npcs[owner].inventory={[item]:100};f.doc.state.npcs[buyer].location=home;
 f.w.npcs.find(n=>n.id===buyer).schedule.default[0].location=home;
 f.w.routes=[{id:'market-long-trip',from:home,to:place,modes:['walk'],lengthKm:2,terrainMultiplier:1,toll:2,closedSeasons:[]}];
 const d=f.sync(),before=householdWorkTime(f.e,d.get('state'),buyer,720);assert.equal(before.workMinutes,480);
 advanceCustomerFlow(d,f.e,719,720);
 const trip=visits(d).find(v=>v.npc===buyer&&v.outcome==='bought').travel;
 const overlap=Math.max(0,Math.min(1020,trip.returnAt)-780);
 assert.ok(overlap>0); // The trip consumes the lunch break plus real afternoon work.
 const after=householdWorkTime(f.e,d.get('state'),buyer,720);
 assert.equal(after.workMinutes,480-overlap);assert.equal(after.reservedMinutes,overlap);
 assert.deepEqual(householdWorkTime(f.e,d.get('state'),buyer,720),after);
 assert.equal(after.workMinutes+after.reservedMinutes,480);
});

test('market trips retain K04 care and levy guarantees; releasing the duty restores a valid purchase',()=>{
 for(const mode of ['care','levy','unattended']){
  const f=fixture({food:true});f.doc.state.minute=720;f.doc.state.npcs[buyer].coins=100;
  f.doc.state.npcs[owner].inventory={[item]:100};
  if(mode==='care')f.doc.state.npcs[buyer].caring={location:place,illness:'dependent'};
  if(mode==='levy')f.doc.state.npcs[buyer].levy={location:place};
  if(mode==='unattended'){
   f.w.households=f.w.households.filter(h=>!h.members.includes(seller));
   f.w.households.find(h=>h.members.includes(buyer)).members.push(seller);
   f.doc.state.family??={};f.doc.state.family.illnesses??={};
   f.doc.state.family.illnesses.dependent={id:'dependent',patient:seller,status:'患病中',severity:'重',since:0,endsAt:2*DAY};
  }
  const d=f.sync();advanceCustomerFlow(d,f.e,719,720);
  assert.equal(visits(d).some(v=>v.npc===buyer&&v.outcome==='bought'),false,mode);
  assert.equal(d.get('state','npcs',buyer,'coins'),100);
  if(mode==='care')d.remove(['state','npcs',buyer,'caring']);
  if(mode==='levy')d.remove(['state','npcs',buyer,'levy']);
  if(mode==='unattended')d.set(['state','family','illnesses','dependent','status'],'已康复');
  advanceCustomerFlow(d,f.e,719,720);
  assert.ok(visits(d).some(v=>v.npc===buyer&&v.outcome==='bought'),mode);
 }
});

test('shopping replaces the overlapping own-farm production minutes, not just the total reserved-time label',()=>{
 const f=fixture({food:true}),home=f.e.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').fieldLocation;
 // K04 derives farm time from registered field rights, never the activity name.
 f.doc.state.buildings[home]={...f.doc.state.buildings[home],owner:buyer};
 f.doc.state.minute=720;f.doc.state.npcs[buyer].coins=100;f.doc.state.npcs[buyer].location=home;
 f.doc.state.npcs[owner].inventory={[item]:100};
 f.w.npcs.find(n=>n.id===buyer).schedule.default[0]={start:0,end:1440,location:home,activity:'arbitrary activity label',services:[]};
 f.w.routes=[{id:'farm-market-trip',from:home,to:place,modes:['walk'],lengthKm:2,terrainMultiplier:1,toll:2,closedSeasons:[]}];
 const d=f.sync(),minutes=(time,activity)=>time.reserved.filter(r=>r.activity===activity).reduce((n,r)=>n+r.end-r.start,0);
 assert.equal(minutes(householdWorkTime(f.e,d.get('state'),buyer,720),'农事'),480);
 advanceCustomerFlow(d,f.e,719,720);
 const time=householdWorkTime(f.e,d.get('state'),buyer,720);
 // Two30-minute routes and service5 occupy the lunch hour plus five farm minutes.
 assert.equal(minutes(time,'农事'),475);assert.equal(minutes(time,'集市行程'),5);
 assert.equal(time.reservedMinutes,480);assert.equal(time.workMinutes,0);
});

test('one visit can fill food and water needs with two goods and pays its real round trip once',()=>{
 const f=fixture({food:true}),home='loc_hw',drink='item_bread';
 f.doc.state.minute=720;f.doc.state.npcs[buyer].coins=1000;f.doc.state.npcs[buyer].location=home;
 f.w.npcs.find(n=>n.id===buyer).schedule.default[0].location=home;
 for(const r of f.w.primitiveTables.body.rows)if(r.selector==='person'&&r.need==='hydration')r.drainPerHour.light=10/24;
 f.w.items.find(i=>i.id===drink).nutrition={hydration:1};
 const row={item:drink,source:'local',amount:2,maximum:100};
 f.shop.restock.push(row);f.w.npcs.find(n=>n.id===owner).shopRestock.push(row);
 f.doc.state.npcs[owner].inventory={[item]:100,[drink]:100};
 f.w.routes=[{id:'basket-trip',from:home,to:place,modes:['walk'],lengthKm:0.1,terrainMultiplier:1,toll:2,closedSeasons:[]}];
 const d=f.sync();advanceCustomerFlow(d,f.e,719,720);
 const bought=visits(d).filter(v=>v.npc===buyer&&v.outcome==='bought');
 assert.deepEqual(new Set(bought.map(v=>v.item)),new Set([item,drink]));assert.equal(bought.length,2);
 assert.equal(bought.reduce((n,v)=>n+v.travel.paid,0),4);
 assert.equal(d.get('state','npcs',buyer,'coins'),1000-4-bought.reduce((n,v)=>n+v.paid,0));
 assert.equal(marketTimeWindows(d.get('state'),buyer).length,1);
 const service=marketTimeWindows(d.get('state'),owner);
 assert.equal(service.length,2);assert.equal(service[0].end,service[1].start);
 assert.equal(service.reduce((n,s)=>n+s.end-s.start,0),10);
});

test('集日不生货，非集日真实在场的三份货才构成即时供给',()=>{
 const f=fixture();
 f.doc.state.npcs[owner].inventory={[item]:3};
 const d=f.sync(),before=JSON.stringify(d.document),a=marketSupply(d,f.e,item,place);
 // 手算：本地3份；远处7份、日历和未来承诺都不等于本地实物。
 assert.equal(a.rows.find(r=>r.owner===owner&&r.item===item).available,3);
 assert.equal(a.spotSupply,a.rows.reduce((n,r)=>n+r.available,0));
 f.w.rules.calendar.marketDays=[1,4,7];
 assert.equal(marketSupply(d,f.e,item,place).supply,a.supply);
 assert.equal(JSON.stringify(d.document),before);
 d.set(['state','npcs',owner,'location'],'loc_bs');
 assert.equal(marketSupply(d,f.e,item,place).supply,0);
});

test('无人带货时补货周期不凭空进口、不扣钱；未到场报价也不算货',()=>{
 const f=fixture();
 f.doc.state.npcs[owner].memoryStream=[{id:'offer',minute:0,kind:'knowledge',value:{seller,item,quantity:7,unitPrice:1,at:0,expires:10*DAY,location:place}}];
 f.doc.state.npcs[seller].location='loc_bs';f.doc.state.npcs[seller].inventory={[item]:7};
 const d=f.sync(),coins=d.get('state','npcs',owner,'coins');advanceShops(d,f.e,0,DAY);
 // 手算：目的地0、远处7；等一天仍0，不支付假想运费。
 assert.equal(f.e.quantity(d,owner,item),0);assert.equal(f.e.quantity(d,seller,item),7);
 assert.equal(d.get('state','npcs',owner,'coins'),coins);
 assert.match(d.get('state','records',`shop:${f.shop.id}`).entries[0].reason,/没有已到场/);
});

test('到场行商的有效报价沿真实钱货交易补货；不能重复吃同一报价额度',()=>{
 const f=fixture();
 f.doc.state.npcs[seller].inventory={[item]:7};
 f.doc.state.npcs[owner].memoryStream=[{id:'offer',minute:0,kind:'knowledge',value:{seller,item,quantity:2,unitPrice:1,at:0,expires:10*DAY,location:place}}];
 const d=f.sync(),total=Object.values(d.get('ledger','accounts')).reduce((n,v)=>n+v,0);
 advanceShops(d,f.e,0,DAY);
 // 手算：行商7-2=5，店主0+2=2；店主100-2=98，行商0+2=2。
 assert.equal(f.e.quantity(d,owner,item),2);assert.equal(f.e.quantity(d,seller,item),5);
 assert.equal(d.get('state','npcs',owner,'coins'),98);assert.equal(d.get('state','npcs',seller,'coins'),2);
 assert.equal(Object.values(d.get('ledger','accounts')).reduce((n,v)=>n+v,0),total);
 d.set(['state','minute'],2*DAY);advanceShops(d,f.e,DAY,2*DAY);
 assert.equal(f.e.quantity(d,owner,item),2);assert.equal(f.e.quantity(d,seller,item),5);
});

test('过期报价和负收益报价不消费行商实物或家庭现金',()=>{
 for(const {expires,unitPrice}of [{expires:0,unitPrice:1},{expires:10*DAY,unitPrice:50}]){
  const f=fixture();f.doc.state.npcs[seller].inventory={[item]:7};
  f.doc.state.npcs[owner].memoryStream=[{id:'offer',minute:0,kind:'knowledge',value:{seller,item,quantity:2,unitPrice,at:0,expires,location:place}}];
  const d=f.sync();advanceShops(d,f.e,0,DAY);
  // 手算：过期或2*50的成本大于已知转售价；两种情况实物转移0、付款0。
  assert.equal(f.e.quantity(d,owner,item),0);assert.equal(f.e.quantity(d,seller,item),7);
  assert.equal(d.get('state','npcs',owner,'coins'),100);
 }
});

test('到场有理单价3/2，两份整单付3铜，不能逐份截断或拒绝有效报价',()=>{
 const f=fixture();f.doc.state.npcs[seller].inventory={[item]:7};
 f.doc.state.npcs[owner].memoryStream=[{id:'fraction-offer',minute:0,kind:'knowledge',value:{seller,item,quantity:2,unitPrice:{numerator:3,denominator:2},at:0,expires:10*DAY,location:place}}];
 const d=f.sync();advanceShops(d,f.e,0,DAY);
 // 手算：3/2*2=3，店主100-3=97、行商7-2=5；不是floor(1.5)*2=2。
 assert.equal(f.e.quantity(d,owner,item),2);assert.equal(f.e.quantity(d,seller,item),5);
 assert.equal(d.get('state','npcs',owner,'coins'),97);assert.equal(d.get('state','npcs',seller,'coins'),3);
});

test('现金1可买有理单价3/2的一份，不因买不起原定两份而整批拒绝',()=>{
 const f=fixture();f.doc.state.npcs[owner].coins=1;f.doc.state.npcs[seller].inventory={[item]:7};
 f.doc.state.npcs[owner].memoryStream=[{id:'partial-offer',minute:0,kind:'knowledge',value:{seller,item,quantity:2,unitPrice:{numerator:3,denominator:2},at:0,expires:10*DAY,location:place}}];
 const d=f.sync();advanceShops(d,f.e,0,DAY);
 // 手算：两份总3>现金1；一份总额截断1.5为1，物1、钱1均有真实对手方。
 assert.equal(f.e.quantity(d,owner,item),1);assert.equal(f.e.quantity(d,seller,item),6);
 assert.equal(d.get('state','npcs',owner,'coins'),0);assert.equal(d.get('state','npcs',seller,'coins'),1);
});

test('本人观察到12铜、到场含运储报价9，净预期3；家庭既有租款不重复摊为边际成本',()=>{
 const f=fixture();f.shop.markup=1;f.doc.state.npcs[seller].inventory={[item]:7};
 f.doc.state.npcs[owner].memoryStream=[
  {id:'offer',minute:0,kind:'knowledge',value:{seller,item,quantity:1,unitPrice:9,at:0,expires:10*DAY,location:place}},
  {id:'retail',minute:0,kind:'knowledge',proposition:`market:${place}:${item}`,value:{unitPrice:12}}
 ];
 f.doc.state.obligations.storage={id:'storage',kind:'rent',debtor:owner,creditor:seller,resource:'coin_river',amount:5,paid:0,status:'pending',deadline:2*DAY};
 const d=f.sync();advanceShops(d,f.e,0,DAY);
 const row=d.get('state','records',`shop:${f.shop.id}`).entries[0];
 // 手算：已知零售12-到场含运储9=3；9可覆盖货4+实际运储5。
 // 原家庭租款5独立留款，不是本批货的新增储费，不能再扣一次变成-2。
 assert.deepEqual([row.added,row.paidCopper,row.expectedNet],[1,9,3]);
 assert.equal(d.get('state','npcs',owner,'coins'),91);assert.equal(d.get('state','obligations','storage','paid'),0);
 assert.deepEqual(d.get('state','records',`finance_profit:${owner}`).lots[item],[{quantity:1,price:9}]);
});

test('顾客按十份口粮缺口采购，保留已知付款，不按钱袋固定比例花钱',()=>{
 const f=fixture({food:true});f.doc.state.npcs[buyer].coins=100;
 f.doc.state.npcs[owner].inventory={[item]:100};
 // 顾客已知的双方在场义务：下一日付租8，随后第六日收工资10。
 for(const r of [{id:'rent',kind:'rent',debtor:buyer,creditor:owner,amount:8,deadline:2*DAY},{id:'wage',kind:'wage',debtor:owner,creditor:buyer,amount:10,deadline:6*DAY}])f.doc.state.obligations[r.id]={...r,resource:'coin_river',paid:0,status:'pending'};
 const d=f.sync();advanceCustomerFlow(d,f.e,0,DAY);
 const bought=visits(d).filter(r=>r.npc===buyer&&r.outcome==='bought');
 // 手算：可靠收入距正午5.5日 -> 55份，不是按100*1/4=25铜硬花；
 // 实际量还受现货和深度约束，现金至少留下已知租款8。
 assert.ok(bought.length,JSON.stringify(visits(d)));assert.ok(bought.every(r=>r.budget.maximum===92));
 // 现货100-储备10=90，单笔深度90*0.3=27；单价3*0.5=1.5，总额截断40。
 assert.deepEqual(bought.map(r=>[r.quantity,r.paid]),[[27,40]]);
 assert.ok(d.get('state','npcs',buyer,'coins')>=8);
 assert.ok(f.e.quantity(d,buyer,item)<=55);assert.ok(f.e.quantity(d,buyer,item)>0);
 const before=JSON.stringify(d.document);advanceCustomerFlow(d,f.e,0,DAY);assert.equal(JSON.stringify(d.document),before);
});

test('吃用已足的顾客不会因为钱多就继续买；付不起已知义务也不消费',()=>{
 for(const mode of ['fed','due']){
  const f=fixture({food:true});f.doc.state.npcs[buyer].coins=5;f.doc.state.npcs[owner].inventory={[item]:100};
  if(mode==='fed')f.doc.state.npcs[buyer].inventory={[item]:100};
  else f.doc.state.obligations.rent={id:'rent',kind:'rent',debtor:buyer,creditor:owner,resource:'coin_river',amount:8,paid:0,status:'pending',deadline:DAY};
  const d=f.sync();advanceCustomerFlow(d,f.e,0,DAY);
  // 手算：已有100份足供一天10份；另案5-8=-3，无可花预算。
  assert.equal(visits(d).filter(r=>r.npc===buyer&&r.outcome==='bought').length,0);
  assert.equal(d.get('state','npcs',buyer,'coins'),5);
 }
});

test('营业表不能代替到场；实际带货到场的非集日商人可营业',()=>{
 for(const arrived of [false,true]){
  const f=fixture({food:true});f.doc.state.npcs[buyer].coins=100;f.doc.state.npcs[owner].inventory={[item]:100};
  if(!arrived){f.doc.state.npcs[owner].location='loc_bs';f.w.npcs.find(n=>n.id===owner).schedule.default[0].location='loc_bs';}
  const d=f.sync();advanceCustomerFlow(d,f.e,0,DAY);
  // 手算：有日程无到场，成交0；在场100份减保留10，有真实可售存量。
  assert.equal(visits(d).some(v=>v.npc===buyer&&v.outcome==='bought'),arrived);
 }
});

test('真实往返路费进入账本和顾客预算；不足五分钟不能占用店家服务',()=>{
 const f=fixture({food:true}),home='bld_hw_forge';
 f.doc.state.npcs[buyer].coins=100;f.doc.state.npcs[buyer].location=home;f.doc.state.npcs[owner].inventory={[item]:100};
 f.w.npcs.find(n=>n.id===buyer).schedule.default[0].location=home;
 f.w.routes=[{id:'market-walk',from:home,to:place,modes:['walk'],lengthKm:0.1,terrainMultiplier:1,toll:2,closedSeasons:[]}];
 const d=f.sync();advanceCustomerFlow(d,f.e,0,DAY);
 const v=visits(d).find(v=>v.npc===buyer&&v.outcome==='bought');
 // 手算：往返各2铜，服务5分钟；钱袋100-商品款-4，路费不伪装成商家销售收入。
 assert.ok(v);assert.equal(v.travel.paid,4);assert.equal(v.travel.finishAt-v.travel.serviceAt,5);
 assert.equal(d.get('state','npcs',buyer,'coins'),100-v.paid-4);
 assert.equal(v.budget.maximum,96);assert.ok(v.travel.returnAt>v.travel.finishAt);
 const g=fixture({food:true});g.doc.state.npcs[buyer].coins=100;g.doc.state.npcs[owner].inventory={[item]:100};
 const n=g.w.npcs.find(n=>n.id===owner);n.schedule.default=[{start:0,end:722,location:place,activity:'营业',services:['trade']},{start:722,end:1440,location:place,activity:'休息',services:[]}];
 const gd=g.sync();advanceCustomerFlow(gd,g.e,0,DAY);
 assert.equal(visits(gd).some(v=>v.outcome==='bought'),false);
});

test('同种子含噪声的客流决定与账本可完整重放',()=>{
 const run=()=>{
  const f=fixture({food:true});f.w.marketRules.customerChoice.noisePermille=100;
  f.doc.state.npcs[buyer].coins=100;f.doc.state.npcs[owner].inventory={[item]:100};
  const d=f.sync();advanceCustomerFlow(d,f.e,0,DAY);return d.document;
 };
 // 手算：重放不增加一次选择事件；同一决定键的噪声和全部转移逐字段相同。
 assert.deepEqual(run(),run());
});

test('即将开始的真实预约占用往返窗口；纯租款仍只占现金',()=>{
 const f=fixture({food:true});f.doc.state.npcs[buyer].coins=100;f.doc.state.npcs[owner].inventory={[item]:100};
 f.doc.state.obligations.meeting={id:'meeting',kind:'promise',reservationVersion:1,type:'会面',status:'待履行',promisor:buyer,promisee:owner,start:722,deadline:780,departures:{[buyer]:722,[owner]:722},location:place};
 const d=f.sync();advanceCustomerFlow(d,f.e,0,DAY);
 // 手算：采购720-725与预约722-780相交，买0份、付0铜，预约不被消费覆盖。
 assert.equal(visits(d).some(v=>v.outcome==='bought'),false);assert.equal(d.get('state','npcs',buyer,'coins'),100);
 assert.equal(d.get('state','obligations','meeting','status'),'待履行');
});

test('未知远方报价不从本地成交或远处真相补齐；收到报价后才可作预期',()=>{
 const f=fixture(),d=f.sync(),view=subjectiveView(f.e,d.document,owner),args={item,location:'loc_bs',seller:owner,quantity:1};
 // 手算：本人远方信息0 -> 无报价；他人库存+700不提供本人信息。
 assert.equal(subjectiveMarketQuote(f.e,d.document,view,args),null);
 d.set(['state','npcs',seller,'inventory'],{[item]:700});
 assert.equal(subjectiveMarketQuote(f.e,d.document,subjectiveView(f.e,d.document,owner),args),null);
 d.set(['state','npcs',owner,'memoryStream'],[{id:'price',minute:0,kind:'knowledge',proposition:`market:loc_bs:${item}`,value:{unitPrice:12}}]);
 const quote=subjectiveMarketQuote(f.e,d.document,subjectiveView(f.e,d.document,owner),args);
 assert.equal(quote.knownFrom,'price');assert.equal(quote.explanation.base,12);
 assert.equal(quote.listPrice,12);assert.equal(quote.totalCoins,12);
 // 手算：持久化有理单价25/2，两份总额25；已知报价不重复乘未知稀缺。
 d.set(['state','npcs',owner,'memoryStream'],[{id:'fraction-price',minute:0,kind:'knowledge',proposition:`market:loc_bs:${item}`,value:{unitPrice:{numerator:25,denominator:2}}}]);
 assert.equal(subjectiveMarketQuote(f.e,d.document,subjectiveView(f.e,d.document,owner),{...args,quantity:2}).totalCoins,25);
 // 手算：29/100*100=29，不能因IEEE乘法28.999999999999996而少算1铜。
 d.set(['state','npcs',owner,'memoryStream'],[{id:'decimal-price',minute:0,kind:'knowledge',proposition:`market:loc_bs:${item}`,value:{unitPrice:{numerator:29,denominator:100}}}]);
 assert.equal(subjectiveMarketQuote(f.e,d.document,subjectiveView(f.e,d.document,owner),{...args,quantity:100}).totalCoins,29);
});

test('非集日现场私约保留MKT01例外，且不取消实际自用储备',()=>{
 const f=fixture();f.doc.state.npcs[owner].inventory={[item]:20};
 const d=f.sync(),at=d.get('state','minute'),id='agreed';
 d.set(['state','records','world_event:offer'],{category:'world_event',id:'offer',verb:'quoted',actor:owner,minute:at,payload:{to:'player',resource:item,quantity:20,totalCoins:12}});
 recordAgreedQuote(d,f.e,{id,actor:owner,to:'player',direction:'sell_to_player',resource:item,quantity:20,totalCoins:12,sourceEvent:'world_event:offer',at,expires:at+60});
 const quote=tradeQuote(d,f.e,{buyer:'player',seller:owner,item,quantity:20,location:place,base:()=>1});
 // 手算：约价20份共12铜；不受5份零售深度拦截，库存仍恰为20份。
 assert.equal(quote.agreed,true);assert.equal(quote.totalCoins,12);assert.doesNotThrow(()=>assertMarketDepth(d,f.e,quote,{agreed:true}));
 assert.equal(f.e.quantity(d,owner,item),20);
});

test('真实运单在途不入货架；到站无人不交付，非集日到场领取不等下一补货周期',()=>{
 const {e,d,w}=transportFixture(),vehicle=asset(d,e),recipient=owner;
 w.routes.push({id:'market-door',from:'loc_hw',to:place,modes:['walk','cart'],lengthKm:1,terrainMultiplier:1,toll:0,closedSeasons:[]});
 w.marketRules.householdBuffer.profiles=[{id:'spendthrift',through:20,cycles:0}];
 d.set(['state','npcs',recipient,'location'],'loc_yp_path');
 d.set(['state','npcs',recipient,'inventory'],{});d.set(['state','inventory',item],{quantity:7});
 d.set(['state','npcs',seller,'location'],place);d.set(['state','npcs',seller,'inventory'],{[item]:{quantity:3}});
 d.set(['ledger'],openLedger(e,d.document));
 const store=w.rules.economy.shops.stores.find(s=>s.keeper===recipient),row={item,source:'route',from:'loc_bs',amount:2,maximum:20};
 store.restock=[row];store.cycleDays=30;store.firstDay=30;
 w.npcs.find(n=>n.id===recipient).shopRestock=[row];
 const trip=bookTransport(d,e,{asset:vehicle,recipient,to:place,cargo:[{item,quantity:7}]},'market-delivery');
 const spot=()=>marketSupply(d,e,item,place).rows.filter(r=>r.item===item).reduce((n,r)=>n+r.available,0);
 const expected=()=>marketSupply(d,e,item,place).consignments.filter(r=>r.id===trip.id&&r.item===item).reduce((n,r)=>n+r.expected,0);
 assert.ok(expected()>0&&expected()<=7); // prepaid carriage with actual seven-unit custody backing.
 // 手算：目的地在场商人3份、货舱另有7；到站前可售3，领取后才变为10。
 assert.equal(e.quantity(d,recipient,item),0);assert.equal(spot(),3);assert.equal(d.get('state','records',trip.id).cargo[0].quantity,7);
 for(let i=0;i<100&&d.get('state','records',trip.id).status!=='arrived';i++){
  const at=nextTransportMinute(d.get('state'),d.get('state','minute'));assert.ok(Number.isFinite(at));d.set(['state','minute'],at);advanceTransport(d,e,at);
 }
 assert.equal(d.get('state','records',trip.id).status,'arrived');assert.equal(e.quantity(d,recipient,item),0);assert.equal(spot(),3);assert.equal(expected(),7);
 d.set(['state','npcs',recipient,'location'],place);
 const day=Math.floor(d.get('state','minute')/DAY)+1;d.set(['state','minute'],day*DAY);advanceShops(d,e,(day-1)*DAY,day*DAY);
 assert.equal(e.quantity(d,recipient,item),7);assert.equal(spot(),10);assert.equal(d.get('state','records',trip.id).status,'delivered');
 const before=e.quantity(d,recipient,item);advanceShops(d,e,(day-1)*DAY,day*DAY);assert.equal(e.quantity(d,recipient,item),before);
 assert.equal(d.get('state','records',trip.id).driver,DRIVER);
});
