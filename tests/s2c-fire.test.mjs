import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,draft,DAY} from './probes/harness.mjs';
import {applyFacilityInteraction,advanceFacilityFire,damageFacility,completeFacilityProject,advanceFacilities} from '../server-plugin/facilities.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';
import {resolveInteraction} from '../server-plugin/interactions.mjs';
import {traitsOf} from '../server-plugin/traits.mjs';
import {initialThermalState,recordFurnaceDeparture} from '../server-plugin/magic-object.mjs';
import {regionalTradePrice} from '../server-plugin/settlement-trade.mjs';
import {leaseState} from '../server-plugin/contract-state.mjs';
import {isGone} from '../server-plugin/lifecycle-state.mjs';
import {resyncBooks} from './helpers/ledger-sync.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {faithAction,advanceFaith} from '../server-plugin/faith.mjs';
import {adjudicateLegalCase,lawAction,advanceLaw} from '../server-plugin/law.mjs';
import {legalCodeAt} from '../server-plugin/law-codes.mjs';
import {syncHoldingRecord} from '../server-plugin/holding-sources.mjs';
import {transition} from '../server-plugin/transition.mjs';
import {advanceNpcSchedules} from '../server-plugin/npc-schedule.mjs';
import {fixture as faithFixture,draft as faithDraft,SEAT,T,HOST} from './helpers/faith.mjs';

import {fireScene as fixture} from './probes/run-001/e06.mjs';
import {marketSupply} from '../server-plugin/market.mjs';
import {regionalTradeBase} from '../server-plugin/settlement-trade.mjs';
import {handOatsScarcity} from './helpers/hand-targets.mjs';


test('E06-1 真实风向、间距、石材与雨水对照',()=>{
 const {engine,d,forge,warehouse,ignite,w}=fixture();ignite();advanceFacilityFire(d,engine,{after:660});
 assert.equal(facilityView(engine,d.get('state'),warehouse).burning,true);
 for(const id of ['bld_fire_up','bld_fire_far','bld_fire_stone'])assert.equal(facilityView(engine,d.get('state'),id).burning,false,id);
 // A real weather region with rain in every seasonal draw extinguishes fire.
 w.rules.weather=structuredClone(setup().w.rules.weather);w.rules.weather.regions=[{...w.rules.weather.regions[0],locations:['loc_hw'],indoor:[]}];w.rules.weather.seasonalWeights=w.rules.weather.seasonalWeights.map(()=>[0,0,1,0,0,0]);
 advanceFacilityFire(d,engine,{after:720});assert.equal(facilityView(engine,d.get('state'),forge).burning,false);
});

test('E06-2 仓损逐批进 sink，保护种粮与别仓，未签约报价立即重派生',()=>{
 const {engine,d,warehouse}=fixture(),before=d.get('state','settlements','loc_hw','food'),seed=structuredClone(d.get('state','records','agriculture:loc_hw','field'));
 const price=regionalTradePrice(d,engine,'item_oats','loc_hw',600);
 // 价 = 目录基价 3 × 运输因子 1（燕麦产自本聚落，无运费）× 稀缺度；稀缺度 = 需求 ÷ 供给（见 hand-targets.mjs 的 handOatsScarcity，手推，两边折成燕麦件数）。
 // 开局日（年内第 0 日）离收获还有 205 天：公仓目标 = 餐口 58 × (205 + 90) = 17110，仓里 8000 低于目标——收获前粮就是紧的。
 // 前置：库存低于目标，所以稀缺度 > 1，失火让价格更高才有意义。
 const start=handOatsScarcity(engine,d.get('state'),before);assert.ok(start.target>before&&start.ratio>1&&start.ratio<3,'前置：收获前仓里粮低于目标，稀缺度在夹取区间内');
 assert.ok(Math.abs(price-3*start.ratio)<=1e-9,`价 ${price} = 3 × ${start.ratio}`);
 damageFacility(d,engine,warehouse,75,{cause:'火灾',sourceEvent:'grain',minute:660});
 assert.equal(d.get('state','settlements','loc_hw','food'),before-4500);
 assert.equal(d.get('ledger','flows','sink:destroy|item_oats|fire'),4500);
 assert.deepEqual(d.get('state','records','agriculture:loc_hw','field'),seed);
 assert.equal(d.get('state','records','agriculture:loc_hw','batches').find(b=>b.id==='safe_grain').amount,2000);
 damageFacility(d,engine,warehouse,75,{cause:'火灾',sourceEvent:'grain',minute:660});assert.equal(d.get('ledger','flows','sink:destroy|item_oats|fire'),4500);
 // 未签约的读价不是承诺：失火后仓里只剩 8000 − 4500 = 3500，供给 ≈ 3541，需求仍 ≈ 17117（目标不随火灾变），需求 ÷ 供给 ≈ 4.83，超出上限 3，夹到 3；
 // 新价 3 × 3 = 9，同日立即反映；次日没有成交压力，目标天数少一天（17052）但仍远超供给，仍夹在 3，价仍 9。
 const burnt=handOatsScarcity(engine,d.get('state'),before-4500),[,cap]=engine.rules.economy.priceFactorLimits.region;
 assert.ok(burnt.ratio>cap,'前置：失火后需求 ÷ 供给超出上限，被夹到上限');
 for(const at of [700,DAY+600]){const now=regionalTradePrice(d,engine,'item_oats','loc_hw',at);assert.ok(Math.abs(now-3*cap)<=1e-9,`${at}：${now} = 3 × ${cap}`);}
 assert.deepEqual(reconcile(engine,d.document),{mismatches:[],lots:[],drift:[],audit:[]});
});

test('E06-3 可修损坏停租、修缮后按签约条款恢复；实体毁灭不能写耐久复活',()=>{
 const {engine,d,warehouse}=fixture(),row={subject:warehouse,createdAt:0,deadline:120*DAY,monthlyRent:400,status:'有效'};
 damageFacility(d,engine,warehouse,80,{sourceEvent:'repairable'});assert.equal(leaseState(engine,d.get('state'),row).monthlyRent,0);
 completeFacilityProject(d,engine,{id:'repairable:repair',building:warehouse,projectWork:'repair'},700);assert.equal(leaseState(engine,d.get('state'),row).monthlyRent,400);
 damageFacility(d,engine,warehouse,100,{sourceEvent:'destroyed'});assert.equal(isGone(engine,d,warehouse),true);
 assert.throws(()=>completeFacilityProject(d,engine,{id:'invalid:repair',building:warehouse,projectWork:'repair'},800),/重建/);
});

test('E06-4 寺观停用无供献，逐笔募捐扣真实钱粮，工期与主持劳动完成修缮',async()=>{
 const s=faithFixture();s.doc.state.buildings??={};s.doc.state.buildings[SEAT]={condition:20};const d=faithDraft(s);
 assert.throws(()=>faithAction.call(s.engine,d,{operation:'faith_give',org:T,coins:30},'closed'),/停用/);
 // Damage below full capacity can still receive an actual donor at the open hall.
 s.doc.state.buildings[SEAT].condition=50;const cash=s.doc.state.player.coins;
 const material='item_wood';s.doc.state.inventory[material]={quantity:10};s.doc.state.inventory.item_stone={quantity:10};resyncBooks(s.engine,s.doc);
 await s.faith('give',{coins:100,item:material,quantity:10});
 await s.faith('give',{item:'item_stone',quantity:10});
 assert.equal(s.doc.state.player.coins,cash-100);
 const p=await s.faith('use',{choice:'repair',consent:true});assert.equal(p.status,'施工中');
 const paid=s.doc.state.player.coins;assert.equal(s.doc.state.buildings[SEAT].condition,50);
 const tx=faithDraft(s);advanceFaith(tx,s.engine,{before:540,after:DAY,id:'repair-day'});assert.equal(s.doc.state.buildings[SEAT].condition,50);
 advanceFaith(tx,s.engine,{before:DAY,after:2*DAY,id:'repair-day2'});assert.equal(s.doc.state.buildings[SEAT].condition,100);
 assert.equal(s.doc.state.player.coins,paid);
});

test('E06-6 收工离开未熄炉产生火源；熄灭与有人看守不产生建筑火',()=>{
 for(const mode of ['unattended','extinguished','attended']){
  const {engine,d,forge}=fixture(),model={heatCapacityJPerC:1000,maximumC:1000,ambientC:20,passiveExchangeJPerMinute:50,burnMgPerMinute:100,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:false,fuels:[{item:'item_charcoal',milligramsPerUnit:250000}]};
  const thermal=initialThermalState({fuelMg:4000},model,600);thermal.burning=mode!=='extinguished';
  engine.advanceFeatures=[{id:'feature_test_furnace',location:forge,kind:'object',thermalModel:model,state:{thermal},unattendedFire:{responsible:'npc_hw_duanyan'}}];
  if(mode==='attended'){d.set(['state','npcs','npc_hw_duanhe','location'],forge);d.set(['state','npcs','npc_hw_duanhe','activity'],'值守');const n=engine.byId.get('npc_hw_duanhe');n.schedule={default:[{start:0,end:1440,location:forge,activity:'值守',services:[]}]};}
  else for(const [id,n]of Object.entries(d.get('state','npcs')))if(id!=='npc_hw_duanyan'&&n.location===forge)d.set(['state','npcs',id,'location'],'loc_hw');
  recordFurnaceDeparture(d,engine,'npc_hw_duanyan',forge,600);
  assert.equal(facilityView(engine,d.get('state'),forge).burning,mode==='unattended',mode);
 }
});

test('E06-5 失火事实与证人经法院判决赔偿；无过失、无证据均不自动定罪',()=>{
 const {engine,d,forge,warehouse}=fixture(),offender='npc_hw_duanyan',officer='npc_hw_gucen';
 d.set(['state','npcs',offender,'coins'],100000);resyncBooks(engine,d.document);
 const origin='unattended_furnace:court:600';d.set(['state','records',origin],{category:'unattended_furnace',responsible:offender,building:forge,burning:true,attendants:[],witnesses:[officer],minute:600});
 const playerBefore=d.get('state','player','coins'),before=d.get('state','npcs',offender,'coins');
 damageFacility(d,engine,warehouse,25,{cause:'火灾',sourceEvent:'negligence',minute:660,fireOrigin:origin});
 // 立案时（烧毁的粮已扣、建筑已受损）当地的供需与环境系数：
 const supply=marketSupply(d,engine,'item_oats',warehouse),scarcity=Math.max(0.5,Math.min(3,supply.demand/Math.max(1,supply.supply))),regional=regionalTradeBase(d,engine,'item_oats',warehouse);
 const row=Object.values(d.get('state','records')).find(r=>r.category==='legal_case'&&r.offense==='negligent_fire');assert.ok(row);
 const code=legalCodeAt(engine,warehouse,d.get('state')),judge=code.judges[0];
 const judgment=adjudicateLegalCase(d,engine,row,code,judge,'fire:judgment');assert.equal(judgment.convicted,true); // W8-A：赔偿额读市场估值。手算——烧毁燕麦 1500 份：基价 3 × 环境系数（regionalTradeBase，此处 0.9）× 稀缺（= clamp(需求/供给, 0.5, 3)，取该处当下的供需）× 1500；
 // 仓库损毁 25%：月租 35×4=140 文，按月息中值 (0.01+0.08)/2=0.045 资本化 = 3111（取整），受损前完整价值 × 25% = 777（取整）。旧：1500×3=4500，建筑项恒为 0。
 assert.equal(judgment.judgment.compensation,Math.floor(1500*regional*scarcity)+Math.floor(Math.floor(140/0.045)*25/100));

 d.set(['state','location'],code.court);d.set(['state','npcs',officer,'location'],code.court);d.set(['state','npcs',officer,'activity'],'执勤');
 const paid=lawAction.call(engine,d,{operation:'pay',case:row.id,authority:officer},'fire:payment');assert.equal(paid.remaining,0);assert.equal(d.get('state','player','coins')-playerBefore,paid.recovered);assert.equal(before-d.get('state','npcs',offender,'coins'),paid.recovered);
 const again=lawAction.call(engine,d,{operation:'pay',case:row.id,authority:officer},'fire:payment:repeat');assert.equal(again.recovered,0);
 const unsupported={...row,id:'legal_case:no-evidence',witnesses:[],evidence:[]};d.set(['state','records',unsupported.id],unsupported);assert.equal(adjudicateLegalCase(d,engine,unsupported,code,judge,'no-evidence').convicted,false);
 const cases=Object.values(d.get('state','records')).filter(r=>r.category==='legal_case').length;
 damageFacility(d,engine,warehouse,10,{cause:'火灾',sourceEvent:'natural',minute:700});assert.equal(Object.values(d.get('state','records')).filter(r=>r.category==='legal_case').length,cases);
 assert.deepEqual(reconcile(engine,d.document),{mismatches:[],lots:[],drift:[],audit:[]});
});

test('E06-6 实际日程收工触发炉火，不依赖玩家位置',()=>{
 const {engine,d,forge}=fixture(),who='npc_hw_duanyan',template=engine.world.locations.find(b=>b.id===forge).features.find(f=>f.id==='feature_hw_forge_hearth');
 const thermal=initialThermalState({fuelMg:4000},template.thermalModel,600);thermal.burning=true;
 d.set(['state','records',`physical_feature:${template.id}`],{id:template.id,category:'physical_feature',location:forge,state:{thermal}});
 for(const [id,n]of Object.entries(d.get('state','npcs')))if(id!==who&&n.location===forge)d.set(['state','npcs',id,'location'],'loc_hw');
 const base=engine.byId.get(who);base.schedule={default:[{start:0,end:620,location:forge,activity:'打铁',services:['craft']},{start:620,end:1440,location:forge,activity:'休息',services:[]}]};
 d.set(['state','npcs',who,'location'],forge);d.set(['state','location'],'loc_capital');
 advanceNpcSchedules(d,engine,600,620);assert.equal(facilityView(engine,d.get('state'),forge).burning,true);assert.ok(d.get('state','records',`unattended_furnace:${template.id}:620`));
});

test('E06-6 world_time 调用链按收工刻点燃建筑，切片推进结果一致',async()=>{
 const make=()=>{
  const s=fixture(),who='npc_hw_duanyan',f=s.engine.world.locations.find(b=>b.id===s.forge).features.find(f=>f.id==='feature_hw_forge_hearth');
  const thermal=initialThermalState({fuelMg:4000},f.thermalModel,600);thermal.burning=true;
  s.d.set(['state','records',`physical_feature:${f.id}`],{id:f.id,category:'physical_feature',location:s.forge,state:{thermal}});
  for(const [id,n]of Object.entries(s.d.get('state','npcs')))if(id!==who&&n.location===s.forge)s.d.set(['state','npcs',id,'location'],'loc_hw');
  s.engine.byId.get(who).schedule={default:[{start:0,end:620,location:s.forge,activity:'打铁',services:['craft']},{start:620,end:1440,location:'loc_hw',activity:'休息',services:[]}]};
  s.d.set(['state','npcs',who,'location'],s.forge);s.d.set(['state','location'],'loc_hw');return s;
 };
 const a=make(),b=make();
 const run=async(s,minutes,id)=>{const out=await s.engine.reduce(s.d.document,{tool:'world_time',args:{minutes},eventId:id});for(const p of out.patches){if(p.op==='delete')s.d.remove(p.path);else s.d.set(p.path,p.value);}};
 await run(a,240,'whole');await run(b,20,'part1');await run(b,220,'part2');
 assert.equal(a.d.get('state','buildings',a.forge,'fireSince'),620);
 assert.ok(a.d.get('state','settlements','loc_hw','food')<8000);
 assert.deepEqual(a.d.get('state','buildings'),b.d.get('state','buildings'));
 assert.deepEqual(a.d.get('state','records','agriculture:loc_hw'),b.d.get('state','records','agriculture:loc_hw'));
});

test('拘押死亡、逃脱与到期关闭持有，未服刑罚与赔偿保留',()=>{
 for(const mode of ['death','escaped','expired']){
  const {engine,d}=fixture(),subject='npc_hw_duanhe',court='bld_hw_council',key=`legal_custody:${mode}`,caseId=`legal_case:${mode}`;
  d.set(['state','records',caseId],{category:'legal_case',id:caseId,law:'law_hw_property',offender:subject,status:'服役中',value:20,compensationPaid:false,judgment:{fine:5,compensation:20}});
  d.set(['state','records',key],{category:'legal_custody',case:caseId,subject,reason:'劳役',location:court,status:'生效',started:0,expires:900});syncHoldingRecord(d,engine,key,{writer:'law'});
  assert.equal(Object.values(d.get('holdings','rows')).filter(h=>h.source===`custody:${key}`&&h.until===undefined).length,1);
  d.set(['state','npcs',subject,'location'],mode==='escaped'?'loc_hw':court);if(mode==='death')transition(d,engine,{entity:subject,basis:'death',origin:'death_rule',eventId:'custody:death'});
  advanceLaw(d,mode==='expired'?900:700,engine,[key]);assert.equal(d.get('state','records',key,'endReason'),mode);
  assert.equal(Object.values(d.get('holdings','rows')??{}).filter(h=>h.source===`custody:${key}`&&h.until===undefined).length,0);
  if(mode!=='expired')assert.equal(d.get('state','records',caseId,'remainingSentence','minutes'),200);
  assert.equal(d.get('state','records',caseId,'compensationPaid'),false);
 }
});

test('E06 长等待与逐小时火势、库存、协议一致；磨损归零进入毁灭协议',()=>{
 const a=fixture(),b=fixture();a.ignite();b.ignite();advanceFacilityFire(a.d,a.engine,{after:840});for(const after of [660,720,780,840])advanceFacilityFire(b.d,b.engine,{after});
 assert.deepEqual(a.d.get('state','buildings'),b.d.get('state','buildings'));assert.deepEqual(a.d.get('state','records','agriculture:loc_hw'),b.d.get('state','records','agriculture:loc_hw'));assert.deepEqual(a.d.get('ledger'),b.d.get('ledger'));
 // 现有仓库的磨损分母为5400；用真实建筑并置于归零前一个磨损单位，保留毁灭协议断言。
 const id=a.place(a.warehouse,100,100);a.d.set(['state','buildings',id],{condition:1,wearUnits:5399,wearDenominator:5400});advanceFacilities(a.d,a.engine,{before:0,after:DAY});assert.equal(isGone(a.engine,a.d,id),true);
});
