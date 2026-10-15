// PR-02 probe replays (run-001 E05, E06, E12, E17): rent, lending, carriage
// and pet slots follow the current state of buildings, borrowers, roads and careers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fixture,cash,host,worker,DAY} from './helpers/finance.mjs';
import * as transportHelper from './helpers/transport.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {bookTransport,advanceTransport,nextTransportMinute} from '../server-plugin/transport.mjs';
import {precipitationAt} from '../server-plugin/weather.mjs';
import {petCapacity,checkPetCareer} from '../server-plugin/pets.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const rec=(doc,id)=>doc.state.records[id];
function draft(document){return {document,get(...p){return p.reduce((o,k)=>o?.[k],this.document);},set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);},remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);},say(){}};}

test('E06 租金随建筑状态：毁损停收、降级减收、修复恢复，停用超期按毁损条款终止',()=>{
 const f=fixture({coins:30000}),shop='bld_hw_mill',lease='asset_lease:probe',t0=600;
 Object.assign(f.doc.state.buildings[shop]??=( {} ),{owner:'player',condition:0});f.doc.state.npcs[host].coins=10000;
 f.doc.state.records[lease]={category:'contract',kind:'asset_lease',id:lease,subject:shop,tenant:host,owner:'player',use:'commercial',monthlyRent:400,paid:400,status:'有效',createdAt:t0,deadline:t0+300*DAY,nextRent:t0+30*DAY,location:shop,source:'probe'};
 const total=cash(f.doc),coins=()=>f.doc.state.player.coins,start=coins();
 assert.equal(facilityView(f.e,f.doc.state,shop).status,'停用');
 f.tick(t0+65*DAY);
 assert.equal(coins(),start,'毁损期间不收租');assert.equal(rec(f.doc,lease).suspensions.length,2);assert.equal(rec(f.doc,lease).status,'有效');
 f.doc.state.buildings[shop].condition=100;f.tick(t0+95*DAY);
 assert.equal(coins(),start+400,'修复后恢复收租');assert.equal(rec(f.doc,lease).resumptions.length,1);assert.equal(rec(f.doc,lease).suspendedSince,null);
 f.doc.state.buildings[shop].condition=50;f.tick(t0+125*DAY);
 assert.equal(coins(),start+600,'降级只按可用比例收租');
 f.doc.state.buildings[shop].condition=100;f.doc.state.buildings[shop].burning=true;f.tick(t0+250*DAY);
 const row=rec(f.doc,lease);assert.equal(row.status,'因毁损终止');assert.equal(row.endedAt,t0+240*DAY);assert.equal(coins(),start+600);
 f.tick(t0+300*DAY);assert.equal(coins(),start+600,'终止后不再计租');
 assert.ok(!Object.values(f.doc.state.records).some(r=>r.kind==='rent'&&r.category==='debt'),'停收不是欠租');
 assert.equal(cash(f.doc),total);
});

test('E12 玩家放贷：按月12期一年，逐期记逾期与约定罚息，连续违约转欠款立案，不自动免除',async()=>{
 const f=fixture({coins:30000});
 await assert.rejects(f.act({operation:'lend',seller:host,coins:1000,days:721,consent:true,quantity:12},'too-long'),/借期/);
 const loan=await f.act({operation:'lend',seller:host,coins:1000,days:360,consent:true,quantity:12},'lend');
 let row=rec(f.doc,loan.debt);assert.equal(row.installments,12);assert.equal(row.deadline-row.createdAt,360*DAY);assert.ok(row.signedTerms.penaltyMonthlyRate>0);
 f.tick(600+10*DAY);
 // 摔伤后断了收入：钱交给玩家保管，总量守恒
 f.doc.state.player.coins+=f.doc.state.npcs[host].coins;f.doc.state.npcs[host].coins=0;const total=cash(f.doc);
 f.tick(600+31*DAY);row=rec(f.doc,loan.debt);
 assert.equal(row.overdue.length,1);assert.equal(row.overdue[0].installment,1);assert.ok(row.overdue[0].penalty>0);assert.equal(row.status,'逾期');
 assert.equal(row.amount,row.principal+row.interest+row.penalty);assert.ok(!row.defaulted);
 f.tick(600+61*DAY);row=rec(f.doc,loan.debt);assert.equal(row.overdue.length,2);assert.ok(row.overdue[1].penalty>row.overdue[0].penalty,'欠额累积后罚息随之增加');
 f.tick(600+92*DAY);row=rec(f.doc,loan.debt);
 assert.equal(row.overdue.length,3);assert.ok(row.accelerated);assert.ok(row.defaulted.case,'连续三期逾期加速到期并立案');
 assert.equal(row.defaulted.remaining,row.amount-row.paid);assert.equal(row.status,'逾期');
 const legal=rec(f.doc,row.defaulted.case);assert.equal(legal.offender,host);assert.equal(legal.victim,'player');
 const amount=row.amount;f.tick(600+200*DAY);row=rec(f.doc,loan.debt);assert.equal(row.amount,amount,'违约后不再滚罚息');assert.notEqual(row.status,'已还清');
 assert.equal(cash(f.doc),total);
 // 失能只读现有状态：昏迷期间不付款，但逾期如实记录，债不免除
 const second=await f.act({operation:'lend',seller:worker,coins:100,days:60,consent:true,quantity:2},'lend-2');
 f.doc.state.npcs[worker].status='昏迷';f.tick(600+232*DAY);const r2=rec(f.doc,second.debt);
 assert.equal(r2.paid,0);assert.equal(r2.overdue[0].reason,'昏迷');assert.ok(r2.amount>r2.principal+r2.interest);
});

const tcash=d=>d.get('state','player','coins')+Object.values(d.get('state','npcs')).reduce((n,p)=>n+(p.coins??0),0)+Object.values(d.get('state','settlements')).reduce((n,s)=>n+(s.treasury??0),0)+Object.values(d.get('state','quests')).reduce((n,q)=>n+(q.escrow??0),0);
test('E05 冬季托运：雨雪露天按天受潮降价并按托运契约索赔，护卫费按实际在途与滞留天数累计',()=>{
 const {e,d,w}=transportHelper.fixture();w.rules.weather=structuredClone(world.rules.weather);
 const wet=day=>precipitationAt(e,d.document.randomSeed,'loc_hw',day*DAY+600);
 let day=1;while(day<720&&!(wet(day)&&wet(day+1)&&wet(day+2)))day++;assert.ok(day<720,'找到连续雨雪天');
 d.set(['state','minute'],day*DAY+600);
 const id=transportHelper.asset(d,e);d.set(['state','inventory','item_oats'],{quantity:200});
 d.set(['state','npcs',transportHelper.RECIPIENT,'location'],'loc_bs');
 const total=tcash(d),trip=bookTransport(d,e,{asset:id,to:'loc_bs',recipient:transportHelper.RECIPIENT,cargo:[{item:'item_oats',quantity:100}],escort:transportHelper.SECOND},'winter');
 assert.ok(trip.carriageTerms.sensitiveTags.includes('grain'));assert.equal(trip.escortTerms.plannedDays,1);
 // 车在村口坏了三天：货物露天滞留
 d.set(['state','records',id,'durability'],10);
 for(let i=0;i<3;i++){const at=nextTransportMinute(d.get('state'),d.get('state','minute'));d.set(['state','minute'],at);advanceTransport(d,e,at);}
 let row=d.get('state','records',trip.id);assert.equal(row.status,'delayed');assert.ok(row.exposure.length>=2,'雨雪中露天按天记受潮');
 assert.ok(row.escortAccrued.days>=3,'滞留期间护卫费继续累计');assert.ok(d.get('state','quests',row.escortQuest).deadline>d.get('state','minute'),'滞留不使护送委托逾期作废');
 d.set(['state','records',id,'durability'],100);
 const player=d.get('state','player','coins'),escortCoins=d.get('state','npcs',transportHelper.SECOND,'coins');
 row=transportHelper.finish(d,e,trip.id);
 const line=row.deliveredCargo[0],damage=Math.min(0.6,0.1*row.exposure.length);
 assert.equal(line.damage,damage);assert.ok(line.arrivalValue<line.value,'受潮货物到货折价');assert.equal(row.claim.loss,line.loss);
 assert.equal(row.claim.claim,line.loss);assert.equal(row.claim.paid,row.claim.claim,'承运人按托运契约赔付');
 assert.ok(row.escortLedger.days>row.escortLedger.plannedDays);assert.ok(row.escortLedger.extraPaid>0,'超出预计天数的护卫费由托运人补付');
 assert.equal(d.get('state','npcs',transportHelper.SECOND,'coins')-escortCoins,row.escortLedger.due);
 assert.equal(d.get('state','player','coins')-player,row.claim.paid-row.escortLedger.extraPaid);
 assert.equal(e.quantity(d,'player','item_oats'),100);assert.equal(e.quantity(d,transportHelper.RECIPIENT,'item_oats'),150,'货物实物交到收货人');assert.equal(tcash(d),total);
});

test('E17 宠物上限由当前职业被动与等级派生，不写死职业编号',()=>{
 const w=structuredClone(world),e=new WorldEngine(w),doc=e.createCharacter(seed,{},'pet-slots'),s=doc.state;
 s.professions={combat:'',life:[],hidden:[]};s.player.level=40;
 assert.equal(petCapacity(e,s,'mount'),w.rules.pets.mount);assert.equal(petCapacity(e,s,'combat'),w.rules.pets.combat);
 s.professions.combat='profession_knight';assert.equal(petCapacity(e,s,'mount'),20,'骑士被动给坐骑名额');
 s.professions.combat='profession_summoner';assert.equal(petCapacity(e,s,'combat'),0,'召唤师被动不养战斗宠');
 // 换成另一职业：只要其定义带同样的被动，就得到同样名额
 const ranger=w.professions.find(p=>p.kind==='combat'&&!p.passive);ranger.passive={domain:'pet_slots',petSlots:{mount:7}};s.professions.combat=ranger.id;assert.equal(petCapacity(e,s,'mount'),7);
 s.professions.combat='';s.professions.hidden=['profession_hidden_11'];s.careers={profession_hidden_11:{certification:{minute:0}}};s.creatures={};s.pets={};
 assert.equal(petCapacity(e,s,'support'),w.rules.pets.support+2,'砾骨驯者被动按等级加名额');
 s.player.level=10;assert.equal(petCapacity(e,s,'support'),w.rules.pets.support+1);
 s.creatures={c1:{owner:'player',status:'正常',care:{hunger:95,sickness:true}}};s.pets={c1:{petFormat:1,status:'活跃',category:'support'}};
 assert.equal(petCapacity(e,s,'support'),w.rules.pets.support,'放任宠物饥病时被动停用');
 const d=draft(doc);d.set(['state','pets'],Object.fromEntries(Array.from({length:12},(_,i)=>[`p${i}`,{petFormat:1,status:'活跃',category:'mount'}])));
 assert.doesNotThrow(()=>checkPetCareer(d,e,'profession_knight'));assert.throws(()=>checkPetCareer(d,e,'profession_summoner'),/名额/);
});
