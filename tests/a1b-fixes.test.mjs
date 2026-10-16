// A1b：A1 动作层三处缺陷修复——同意只来自被作用的一方本人、战斗等回执带上实际效果、长时间推进自动分段。
// 全部走 /execute 的 world_act（与界面同一条路），不调用模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import {MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {translateCall} from '../server-plugin/action-gateway.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,setPrice,scene,monthDayMinute,primed,held,baseWorld} from './helpers/daily-b2.mjs';

const PENDING='需要对方答应（对话功能完成后开放）';
const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',AYAN='npc_hw_ayan';

// ---- 1. 同意：本人同意通，替 NPC 填的同意不通 ----
const CLINIC='bld_hw_herbs',DOCTOR='npc_hw_taozhi';
const clinicSession=async t=>{
 const world=variant(w=>{
  w.rules.economy.wageCopperPerHalfDay=[48,96];setPrice(w,'item_herb',6);
  const d=w.npcs.find(n=>n.id===DOCTOR);d.schedule={default:[{start:0,end:1440,location:CLINIC,activity:'坐诊配药'}]};d.proficiencies={...d.proficiencies,[MEDICAL_SKILL]:1500};
 });
 const bite={bloodMl:4500,pain:3,wounds:[{id:'bite',simple:true,depthMm:2,areaCm2:5,bleedingMlPerMinute:1,contamination:10,infectionRisk:20,toxinUg:0,foreignBody:false,closed:false}],symptoms:[]};
 return uiSession(t,{world,mutate:scene(CLINIC,monthDayMinute(9,19,9,0),s=>{
  Object.assign(s.player,{coins:70,hp:60,maxHp:80,medical:structuredClone(bite)});
  Object.assign(s.npcs[DOCTOR],{location:CLINIC,status:'正常',activity:'坐诊配药',coins:20});s.npcs[DOCTOR].inventory={...s.npcs[DOCTOR].inventory,item_herb:5};
 })});
};

test('本人同意：病人本人求医经 world_act 成功（同意由“被作用方就是自己”派生，不收调用方的），诊金照付、事件存旧调用',async t=>{
 const ui=await clinicSession(t),before=await primed(ui);
 const seek=await ui.choose('settlement.medicine_seek',{},{search:true});assert.ok(seek.ok,seek.error);
 assert.equal(seek.result.fee,30);assert.equal(seek.result.doctor,DOCTOR);
 const bundle=await ui.server.api('export',{campaignId:ui.campaignId}),event=bundle.events.at(-1);
 assert.equal(event.input.tool,'world_settlement');assert.equal(event.input.args.operation,'medicine_seek');assert.equal(event.input.args.consent,true,'旧调用里的同意是派生出来的');
 const accepted=await ui.choose('settlement.medicine_seek',{consent:true},{search:true,eventId:'seek-own-true'});
 assert.equal(accepted.ok,false,'已有一笔诊疗在排，重复求医由引擎自己拒绝，而不是被同意规则挡掉');assert.doesNotMatch(accepted.error,/需要对方答应/);
 await ui.choose('time',{minutes:seek.result.end-(await ui.read()).state.minute});
 const treated=await ui.read();
 assert.equal(before.state.player.coins-treated.state.player.coins,30);assert.equal(treated.state.npcs[DOCTOR].coins-before.state.npcs[DOCTOR].coins,30);
 assert.equal(held(before.state.npcs[DOCTOR].inventory,'item_herb')-held(treated.state.npcs[DOCTOR].inventory,'item_herb'),1);
});

test('本人同意只能填是或否；别人的事（NPC 为受作用方）无论怎么填同意都被拒，状态不变',async t=>{
 const ui=await clinicSession(t),before=await primed(ui);
 const text=await ui.choose('settlement.medicine_seek',{consent:'yes'},{search:true});assert.equal(text.ok,false);assert.match(text.error,/只能填是或否/);
 // 动作数据声明了“谁在同意”：本人动作放行，其余一律不收调用方填的同意。
 const call=(action,slots)=>translateCall('world_act',{action,slots});
 assert.equal(call('settlement.medicine_seek',{consent:true}).args.consent,true);
 assert.equal(call('settlement.medicine_seek',{}).args.consent,true,'求医的同意由动作本身派生');
 assert.equal(call('settlement.festival_cancel',{speaker:'player',festival:'f1'}).args.consent,true,'组织者本人取消节俗：本人同意');
 for(const [action,slots] of [['trade.work',{seller:AYAN,minutes:240,consent:true}],['trade.lodge',{seller:LINSUI,consent:true}],['trade.borrow',{seller:AYAN,coins:50,consent:true}],
  ['settlement.festival_cancel',{speaker:AYAN,festival:'f1',consent:true}],['settlement.family_marry',{speaker:'player',member:AYAN,consent:true}],['settlement.org_join',{member:AYAN,org:'org_x',consent:true}],
  ['promise.create',{promisor:AYAN,promisee:'player',type:'带路',consent:true}],['quest.accept',{quest:'q1',taker:AYAN,consent:true}]])
  assert.throws(()=>call(action,slots),new RegExp(PENDING.replace(/[（）]/g,'.')),`${action} 不收替 NPC 填的同意`);
 assert.deepEqual((await ui.read()).state,before.state,'被拒的调用不改任何状态');
});

test('NPC 为受作用方、同意要等 A2：受雇、借钱拒绝并给世界内原因、状态不变（当班店主出租、钱庄放贷走旧判定，见 a1-daily-probes D04、D29）',async t=>{
 const ui=await uiSession(t,{mutate:scene(INN,monthDayMinute(9,19,10,0),s=>{s.player.coins=300;})}),before=await primed(ui);
 for(const [action,slots] of [['trade.work',{seller:LINSUI,minutes:240}],['trade.borrow',{seller:LINSUI,coins:50,days:10}]]){
  const r=await ui.choose(action,slots,{search:true});assert.equal(r.ok,false,action);assert.equal(r.error,PENDING,`${action} 拒绝并说明原因`);
 }
 assert.deepEqual((await ui.read()).state,before.state);
});
