// A1b：A1 动作层三处缺陷修复——同意只来自被作用的一方本人、战斗等回执带上实际效果、长时间推进自动分段。
// 全部走 /execute 的 world_act（与界面同一条路），不调用模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import {monsterStats} from '../server-plugin/combat.mjs';
import {appliedEffects} from '../server-plugin/applied-effects.mjs';
import {MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {translateCall} from '../server-plugin/action-gateway.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,setPrice,scene,monthDayMinute,primed,held,legacy,baseWorld} from './helpers/daily-b2.mjs';

// 06 §6.10.4 / A3：同意现在来自真实事件、有效约定或当前决策。
// 保留原先的拒绝反例与状态不变要求，不再期待“以后开放”的旧文案。
const PENDING='需要对方答应（须有同意事件、有效服务约定或对方当前决策，不能代填同意）';
const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',AYAN='npc_hw_ayan';

// ---- 1. 同意：本人同意通，替 NPC 填的同意不通 ----
const CLINIC='bld_hw_herbs',DOCTOR='npc_hw_taozhi';
const clinicSession=async t=>{
 const world=variant(w=>{
  // W8D：诊费里的药材成本读草药在医馆所在地的市场估值（不再读目录基价）。河湾村本地草药估值 = 目录基价 × 0.5，
  // 要让「药价 6」成立，目录基价设 12：诊费 = 工钱半日 48/2 + round(12 × 0.5 × (1 + 0)) = 24 + 6 = 30。
  w.rules.economy.wageCopperPerHalfDay=[48,96];setPrice(w,'item_herb',12);
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

test('NPC 为受作用方：未取得有效同意时受雇、借钱拒绝并给世界内原因、状态不变（当班店主出租、钱庄放贷走旧判定，见 a1-daily-probes D04、D29）',async t=>{
 const ui=await uiSession(t,{mutate:scene(INN,monthDayMinute(9,19,10,0),s=>{s.player.coins=300;})}),before=await primed(ui);
 for(const [action,slots] of [['trade.work',{seller:LINSUI,minutes:240}],['trade.borrow',{seller:LINSUI,coins:50,days:10}]]){
  const r=await ui.choose(action,slots,{search:true});assert.equal(r.ok,false,action);assert.equal(r.error,PENDING,`${action} 拒绝并说明原因`);
 }
 assert.deepEqual((await ui.read()).state,before.state);
});

// ---- 2. 战斗回执：applied 与事件流带上引擎实际应用的效果 ----
const WOOD='loc_hw_northwood',HABITAT='habitat_hw_wood',WOLF='monster_instance_a1b',SPECIES='monster_grey_ridge_wolf',SWORD='item_steel_arming_sword';
const fightSession=async t=>{
 const stats=monsterStats({level:7,template:1},baseWorld.rules);
 return uiSession(t,{mutate:scene(WOOD,monthDayMinute(9,18,16,0),s=>{
  Object.assign(s.player,{level:1,hp:80,maxHp:80});s.inventory[SWORD]={quantity:1,quality:'铁',durability:100,weight:1.5};
  const p=s.records[`ecology:${HABITAT}`].populations[SPECIES];p.count--;p.withdrawn++;
  s.created={...s.created,[WOLF]:{id:WOLF,name:'灰脊林狼',aliases:[],monster:SPECIES,template:1,scope:WOOD}};
  s.creatures={...s.creatures,[WOLF]:{name:'灰脊林狼',species:SPECIES,location:WOOD,hp:stats.maxHp,maxHp:stats.maxHp,level:7,status:'正常',ecology:HABITAT,owner:null}};
 })});
};
const delta=(applied,holder,need)=>applied.filter(e=>e.op==='vital'&&e.holder===holder&&e.need===need).reduce((n,e)=>n+e.delta,0);
const lost=(applied,holder)=>0-delta(applied,holder,'hp');

test('战斗经 world_act：回执 applied 列出对方受伤、己方受伤、武器磨损；事件流据此显示，不再写“什么也没有改变”',async t=>{
 const ui=await fightSession(t);await primed(ui);
 let hit=null;
 for(let i=0;i<300&&!hit;i++){
  const b=await ui.read(),r=await ui.choose('combat',{target:WOLF,weapon:SWORD},{search:true});assert.ok(r.ok,r.error);const a=await ui.read();
  assert.ok(r.applied.length>0,'每一回合至少有武器磨损，applied 不为空');assert.ok(!r.lines.includes('什么也没有改变。'),r.lines.join('|'));
  assert.equal(delta(r.applied,'player','hp'),a.state.player.hp-b.state.player.hp,'己方受伤 = 状态差');assert.equal(lost(r.applied,'player'),r.result.received);
  assert.equal(lost(r.applied,WOLF),b.state.creatures[WOLF].hp-a.state.creatures[WOLF].hp,'对方受伤 = 状态差');assert.equal(a.state.creatures[WOLF].hp,r.result.targetHp);
  const wear=r.applied.find(e=>e.op==='durability');assert.deepEqual([wear.item,wear.from-wear.to],[SWORD,1]);assert.ok(r.lines.some(l=>l.includes('耐久')));
  if(lost(r.applied,WOLF)>0)assert.ok(r.lines.some(l=>l.includes('灰脊林狼受了伤')&&l.includes(String(lost(r.applied,WOLF)))),r.lines.join('|'));
  if(r.result.received>0)assert.ok(r.lines.some(l=>l.includes('你受了伤')));
  if(r.result.targetHp===0)hit={r,b,a};
 }
 assert.ok(hit,'打到野狼毙命');
 const {r,a}=hit;
 assert.deepEqual(r.applied.filter(e=>e.op==='status'),[{op:'status',holder:WOLF,from:'正常',to:'死亡'}]);assert.ok(r.lines.includes('灰脊林狼死了。'));
 const xp=r.applied.find(e=>e.op==='xp');assert.equal(xp.delta,r.result.experience);assert.ok(xp.delta>0);assert.ok(r.lines.some(l=>l.includes(`获得了${xp.delta}点经验`)));
 const corpse=r.applied.find(e=>e.op==='corpse');assert.deepEqual(corpse.items,a.state.creatures[WOLF].corpse.items.map(i=>({item:i.item,amount:i.amount})));assert.ok(r.lines.some(l=>l.includes('留下了尸体')&&l.includes('×')));
 assert.deepEqual(r.applied,appliedEffects(hit.b,a,{result:r.result}),'回执 = 同一对前后状态的已应用效果（可复算）');
});

test('已应用效果只列被作用者的身体：时间流逝里别的生物伤愈不算，没有 target 的回执不带对方的血量',()=>{
 const base={minute:0,location:'x',player:{hp:10,xp:0,level:1},inventory:{},creatures:{wolf:{hp:5,status:'正常'},deer:{hp:3,status:'正常'}},npcs:{}};
 const later={...base,minute:60,creatures:{wolf:{hp:9,status:'正常'},deer:{hp:1,status:'死亡'}}};
 assert.deepEqual(appliedEffects(base,later),[{op:'time',minutes:60,minute:60}]);
 assert.deepEqual(appliedEffects(base,later,{result:{target:'wolf'}}),[{op:'time',minutes:60,minute:60},{op:'vital',holder:'wolf',need:'hp',delta:4}]);
 const up={...later,player:{hp:10,xp:3,level:2}};
 assert.deepEqual(appliedEffects(base,up,{result:{experience:42}}).filter(e=>e.op==='xp'||e.op==='level'),[{op:'xp',holder:'player',delta:42},{op:'level',holder:'player',from:1,to:2}],'升级时经验从余数重算，取回执里的获得量');
});

// ---- 3. 长等待：单次推进上限 30 天是引擎的界（最初版本的约定），world_act 层自动分段 ----
const DAY=1440;
const events=async ui=>(await ui.server.api('export',{campaignId:ui.campaignId})).events.filter(e=>e.input?.tool==='world_time');

test('一次等三个月（dayOffset 90）：world_act 拆成 3 条 30 天的 world_time 事件，到点钟、时间照实走过，与玩家自己分三次等完全一致',async t=>{
 const start=monthDayMinute(3,5,9,0),mutate=scene('loc_hw',start);
 const split=await uiSession(t,{mutate}),manual=await uiSession(t,{mutate});
 await primed(split);await primed(manual);
 const a=await split.choose('time',{until:{dayOffset:90,hour:9,minute:1}});assert.ok(a.ok,a.error);
 const sa=await split.read();
 assert.equal(sa.state.minute,(Math.floor((start+1)/DAY)+90)*DAY+9*60+1,'到第 90 天同一钟点');assert.equal(a.result.segments,3);
 assert.equal(a.result.elapsed,sa.state.minute-(start+1),'回执的耗时是三段之和');
 const waits=(await events(split)).slice(1);
 const total=sa.state.minute-(start+1);
 assert.deepEqual(waits.map(e=>e.input.args),[{minutes:43200},{minutes:43200},{minutes:total-2*43200}],'每段不超过一界，余下的归最后一段');
 assert.ok(waits.every(e=>e.input.args.minutes<=43200&&/^ui-\d+#\d$/.test(e.id)),'事件编号带段号，旧调用原样存账');
 // 对照：同样的三段由玩家自己（旧工具）一段一段等。
 const sizes=waits.map(e=>e.input.args.minutes);
 for(const [i,minutes] of sizes.entries())await legacy(manual,'world_time',{minutes},`ui-2#${i+1}`);
 const sm=await manual.read();
 assert.equal(sm.state.minute,sa.state.minute);assert.deepEqual(sm.state,sa.state,'分段结算的世界与逐段结算完全相同');
});

test('一次等的分钟数超过一界也自动分段；一年封顶（360 天）；重试同一请求不再多等；不超一界的等待仍是一条事件',async t=>{
 const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(3,5,9,0))});await primed(ui);
 const t0=(await ui.read()).state.minute;
 const small=await ui.choose('time',{minutes:60});assert.ok(small.ok);assert.equal(small.result.segments,undefined);
 const first=await ui.choose('time',{minutes:43200+100},{eventId:'long-wait'});assert.ok(first.ok,first.error);assert.equal(first.result.segments,2);
 const mid=await ui.read();assert.equal(mid.state.minute,t0+60+43200+100);
 const again=await ui.retry('time',{minutes:43200+100},'long-wait');assert.equal(again.duplicate,true);
 assert.equal((await ui.read()).state.minute,mid.state.minute,'重试同一请求不会再等一遍');
 const before=await ui.read(),n=(await events(ui)).length;
 const tooLong=await ui.choose('time',{until:{dayOffset:400,hour:6}});assert.equal(tooLong.ok,false);assert.match(tooLong.error,/一次最多等一年/);
 assert.deepEqual((await ui.read()).state,before.state);assert.equal((await events(ui)).length,n,'被拒的长等待不留事件');
 const edge=await ui.choose('time',{minutes:360*DAY+1});assert.equal(edge.ok,false);assert.match(edge.error,/一次最多等一年/,'封顶是 360 天整');
});
