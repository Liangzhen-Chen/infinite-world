// 日常题集第二批（DAILY 卡）：现有引擎缺机制、整题无法结算的题。每条 todo 写明缺的机制与迁移阶段（docs/架构设计/10-现状映射与迁移路线.md §10.4）。
// 参数表里这些题要的缺省值已补入 world/rules/tables/balance/（见 daily-b2-tables.test.mjs 的表级验证）；等机制落地后把 todo 改成可执行测试。
import test from 'node:test';
import assert from 'node:assert/strict';
import {uiSession} from './helpers/ui-script.mjs';
import {baseWorld,variant,scene,monthDayMinute,primed,held,conserved,stack,tool,safeEventId} from './helpers/daily-b2.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';

// ---- D07 问路（对话类，A2）----
test.todo('D07 问路 ①②③④⑤——引擎没有“向人打听地点”的动作：NPC 按自己的主观视图答复方位/距离并写入玩家“已知地点”（A2 对话动作组与主观视图 API；S6 知情集合与地图迷雾“可靠转述”）。数据已备：action-costs talk.direction = 3 分钟（题面 2–5），event-weights ask_way/affinity = +0.5（不变或微升）');

// ---- D10 打工日结、D11 月结工钱（受雇，A2 / S3）----
test.todo('D10 打工日结 ①–④——受雇须对方答应：world_act 列出但拒绝（“需要对方答应”，a1-daily-probes 的 D10 测试守着这条）；缺 NPC 决策规则骨架（A2）与 employed_by + wage 义务按日 30 文清偿（S3 义务统一：雇主账户转出）；体力下降缺 S1 body');
test('D10⑤ 自家真实锄播推进耕作面积，留有劳动来源',async t=>{
 const {ui}=await privateField(t),sow=await ui.choose('farm.private_sow',{areaMu:2},{search:true,eventId:'d10-tillage'});assert.ok(sow.ok,sow.error);
 // 2 亩 = 2 × 10000 / 15 = 4000/3 平方米；锄播 0.5 工日/亩 × 2 = 480 分钟。
 const fact=(await ui.read()).state.records['cultivation:private-farm:loc_hw_fields'];
 assert.deepEqual(fact.tilledAreaM2,{numerator:'4000',denominator:'3'});assert.equal(fact.sourceEvent,'d10-tillage');assert.equal(sow.result.laborMinutes,480);
});
test.todo('D11 月结工钱 ①–⑤——引擎只有按工时日结的受雇（labor-market），没有月薪雇佣：缺 wage 义务 per: anchor（每月初一）与 accruedTo 闭式（附录 A §A.15 期间与折算：八月满勤 → 600，钱柜 2000→1400，同一个月不领两次）、雇佣关系 settle 后继续有效（S3 义务统一）');

// ---- D12 春播、D13 秋收、D14 采草药（农事与采集，S1 / S5）----
// D05 5.5 / S505C approved binding: wheat uses item_wheat_seed, yielding item_wheat_grain.
 async function privateField(t,tools=true){
 const world=variant(w=>{delete w.rules.weather;w.rules.agriculture.crop.growthDays=2;w.rules.agriculture.crop.sowDays=[0,359];w.rules.agriculture.settlements.find(p=>p.settlement==='loc_hw').farmWorkers=0;});
 const ui=await uiSession(t,{world,mutate:scene('loc_hw_fields',monthDayMinute(1,8,8,0),s=>{
  s.buildings.loc_hw_fields={...s.buildings.loc_hw_fields,owner:'player',condition:100};s.inventory.item_wheat_seed=stack(20);if(tools){s.inventory.item_hoe=tool();s.inventory.item_sickle=tool();}
 })});return {ui,world};
}
test('D12.3/.5 public sow: two mu use four seed units and 480 labor minutes, wear a real hoe; missing/broken tools roll back',async t=>{
 const {ui,world}=await privateField(t),before=await primed(ui);
 const omitted=await ui.choose('farm.private_sow',{quantity:2},{search:true});assert.equal(omitted.ok,false);assert.deepEqual(await ui.read(),before);
 const sow=await ui.choose('farm.private_sow',{areaMu:2},{search:true,eventId:'d12-sow'});assert.ok(sow.ok,sow.error);const after=await ui.read(),farm=after.state.records['private-farm:loc_hw_fields'];
 assert.equal(farm.areaMu,2);assert.equal(farm.status,'growing');assert.equal(sow.result.laborMinutes,480);assert.equal(after.state.minute-before.state.minute,480);
 assert.equal(held(before.state.inventory,'item_wheat_seed')-held(after.state.inventory,'item_wheat_seed'),4);assert.equal(farm.seed,4);
 assert.equal(before.state.inventory.item_hoe.durability-after.state.inventory.item_hoe.durability,1);assert.equal(after.ledger.flows['sink:consume|item_wheat_seed|private_sow']-(before.ledger?.flows['sink:consume|item_wheat_seed|private_sow']??0),4);conserved(before,after,'D12',new WorldEngine(world));
 const retry=await ui.choose('farm.private_sow',{areaMu:2},{search:true,eventId:'d12-sow'});assert.ok(retry.ok,retry.error);assert.deepEqual(await ui.read(),after);
 const duplicate=await ui.choose('farm.private_sow',{areaMu:2},{search:true});assert.equal(duplicate.ok,false);assert.deepEqual(await ui.read(),after);
 {
  const f=await privateField(t,false);
  const b=await primed(f.ui),bad=await f.ui.choose('farm.private_sow',{areaMu:2},{search:true});assert.equal(bad.ok,false);assert.deepEqual(await f.ui.read(),b);
 }
 const badWorld=variant(w=>{delete w.rules.weather;w.rules.agriculture.crop.sowDays=[0,359];});
 const broken=await uiSession(t,{world:badWorld,mutate:scene('loc_hw_fields',monthDayMinute(1,8,8,0),s=>{s.buildings.loc_hw_fields={owner:'player',condition:100};s.inventory.item_wheat_seed=stack(20);s.inventory.item_hoe={...tool(),durability:0};})});
 const b=await primed(broken),bad=await broken.choose('farm.private_sow',{areaMu:2},{search:true});assert.equal(bad.ok,false);assert.deepEqual(await broken.read(),b);
});
test('D13.3/.4 public harvest: 960 labor minutes over one to two days, sickle wear, real stock source and no second harvest',async t=>{
 const {ui,world}=await privateField(t),opening=await primed(ui),sow=await ui.choose('farm.private_sow',{areaMu:2},{search:true});assert.ok(sow.ok,sow.error);
 const grow=await ui.choose('time',{minutes:3*1440});assert.ok(grow.ok,grow.error);const before=await ui.read();assert.equal(before.state.records['private-farm:loc_hw_fields'].status,'ready');
 const forged=await ui.choose('farm.private_harvest',{areaMu:1},{search:true});assert.equal(forged.ok,false);assert.deepEqual(await ui.read(),before);
 const r=await ui.choose('farm.private_harvest',{},{search:true,eventId:'d13-harvest'});assert.ok(r.ok,r.error);const after=await ui.read(),elapsed=after.state.minute-before.state.minute;
 assert.equal(r.result.laborMinutes,960);assert.ok(elapsed>=1440&&elapsed<=2880,`elapsed ${elapsed}`);assert.equal(elapsed,r.result.elapsed);
 assert.equal(after.state.records['private-farm:loc_hw_fields'].status,'harvested');assert.ok(r.result.harvested>0);assert.equal(held(after.state.inventory,'item_wheat_grain')-held(before.state.inventory,'item_wheat_grain'),r.result.harvested);
 // yields.json declares jin/mu/season, not kg. Retain the exact original
 // two-mu band (200–600 jin), converting the native food portions explicitly.
 const jin=r.result.harvested*world.items.find(i=>i.id==='item_wheat_grain').weight/.5;assert.ok(jin>=200&&jin<=600);
 // D05 §5.5: harvest transfers the mature field stock; it cannot mint grain.
 const field='loc_hw_fields|item_wheat_grain|crop';
 assert.equal(before.ledger.accounts[field]-after.ledger.accounts[field],r.result.harvested);
 assert.equal(after.ledger.flows['src:regrowth|item_wheat_grain|private_crop'],before.ledger.flows['src:regrowth|item_wheat_grain|private_crop']);
 assert.equal(before.state.inventory.item_sickle.durability-after.state.inventory.item_sickle.durability,1);conserved(before,after,'D13',new WorldEngine(world));
 const bad=await ui.choose('farm.private_harvest',{},{search:true});assert.equal(bad.ok,false);assert.deepEqual(await ui.read(),after);
 const again=await ui.choose('farm.private_harvest',{},{search:true,eventId:'d13-harvest'});assert.ok(again.ok,again.error);assert.deepEqual(await ui.read(),after);
});
// A3 D14.3/.4 now execute; S5's complete flora/population model is separate.
test('D14 A3 two hours of local herb work transfer stock and train deterministically',async t=>{
 const world=variant(w=>{w.primitiveTables.yields=structuredClone(baseWorld.balance.yields);});
 const ui=await uiSession(t,{world,mutate:scene('loc_hw_northwood',monthDayMinute(5,10,9,0),s=>{s.skills.skill_life_9_core={proficiency:10,breakthroughs:[],daily:{}};})});
 const entered=await ui.choose('site.enter',{}, {search:true});assert.ok(entered.ok,entered.error);
 const before=await primed(ui),gathered=await ui.choose('site.gather_session',{target:'nw_herb',minutes:120},{search:true});assert.ok(gathered.ok,gathered.error);
 const after=await ui.read();assert.equal(after.state.minute-before.state.minute,120);assert.equal(gathered.result.cost.time,120);
 assert.equal(held(after.state.inventory,'item_herb')-held(before.state.inventory,'item_herb'),5);
 assert.equal(after.state.records['site:loc_hw_northwood'].remaining.nw_herb,15);
 assert.equal(after.state.skills.skill_life_9_core.proficiency-before.state.skills.skill_life_9_core.proficiency,3);
 assert.equal(after.state.skills.skill_life_9_core.practiceCarry,.4);conserved(before,after,'D14',new WorldEngine(world));
});
test('D14 S5 草药分种读取独立季节密度，并分别累计不足一份的采集量',async t=>{
 const ui=await uiSession(t,{mutate:scene('loc_hw_northwood',monthDayMinute(3,10,9,0),s=>{s.skills.skill_life_9_core={proficiency:10,breakthroughs:[],daily:{}};})});
 assert.ok((await ui.choose('site.enter',{}, {search:true})).ok);
 const before=await primed(ui);
 for(const target of ['nw_plantain','nw_honeysuckle']){const r=await ui.choose('site.gather_session',{target,minutes:120},{search:true});assert.ok(r.ok,r.error);}
 const after=await ui.read(),site=after.state.records['site:loc_hw_northwood'];
 // 20份/480分钟：春季车前密度1，120分钟=5份；金银花密度1/2，=2份余1/2。
 assert.equal(held(after.state.inventory,'item_plantain')-held(before.state.inventory,'item_plantain'),5);
 assert.equal(held(after.state.inventory,'item_honeysuckle')-held(before.state.inventory,'item_honeysuckle'),2);
 assert.equal(site.remaining.nw_plantain,15);assert.equal(site.remaining.nw_honeysuckle,18);assert.equal(site.remaining.nw_herb,20);
 const next=await ui.choose('site.gather_session',{target:'nw_honeysuckle',minutes:120},{search:true});assert.ok(next.ok,next.error);
 assert.equal(next.result.quantity,3,'前次余半份+本次两份半=3份，且不借用车前的余数');
 conserved(before,await ui.read(),'D14 S5',new WorldEngine(baseWorld));
});

// ---- D18 修理装备（服务，S3）----
test('D18.2 public smith repair quotes 25 and a maximum before charging, restores the same sword to that maximum',async t=>{
 const SWORD='item_steel_arming_sword',SMITH='npc_hw_duanyan',FORGE='bld_hw_forge';
 const world=variant(w=>{const n=w.npcs.find(n=>n.id===SMITH);n.proficiencies={...n.proficiencies,skill_life_5_core:500};n.schedule={default:[{start:0,end:1440,location:FORGE,activity:'repair',services:['trade']}]};});
 const ui=await uiSession(t,{world,mutate:scene(FORGE,monthDayMinute(4,10,10,0),s=>{s.player.coins=100;s.inventory[SWORD]={...tool(),durability:50,maxDurability:100,instances:['sword-d18']};s.itemInstances={...s.itemInstances,'sword-d18':{id:'sword-d18',item:SWORD,owner:'player',status:'持有',durability:50,maxDurability:100,maker:'npc_hw_duanyan',source:'fixture'}};})});
 const before=await primed(ui),slots={item:SWORD,instance:'sword-d18',maker:SMITH};
 const quote=await ui.choose('craft.repair',{...slots,quote:true},{search:true});assert.ok(quote.ok,quote.error);assert.equal(quote.result.quote.fee,25);assert.equal(quote.result.quote.after.maxDurability,100);assert.equal(quote.result.quote.after.durability,100);assert.deepEqual(await ui.read(),before);
 const r=await ui.choose('craft.repair',slots,{search:true,eventId:'d18-repair'});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.player.coins,75);assert.equal(after.state.npcs[SMITH].coins-before.state.npcs[SMITH].coins,25);const rule=world.rules.repairs.find(x=>x.id==='repair_sword_service');assert.equal(rule.minutes,60,'D18.2 events.md: 修理耗时按铁匠说的时间推进（如半个时辰）= 60 分钟');assert.equal(after.state.minute-before.state.minute,rule.minutes);
 assert.equal(r.result.instance,'sword-d18');assert.deepEqual(after.state.inventory[SWORD].instances,['sword-d18']);assert.equal(after.state.itemInstances['sword-d18'].durability,quote.result.quote.after.maxDurability);assert.equal(after.state.itemInstances['sword-d18'].maker,before.state.itemInstances['sword-d18'].maker);assert.equal(held(after.state.inventory,SWORD),1);conserved(before,after,'D18',new WorldEngine(world));
 const again=await ui.choose('craft.repair',slots,{search:true,eventId:'d18-repair'});assert.ok(again.ok,again.error);assert.deepEqual(await ui.read(),after);
 const extra=await ui.choose('craft.repair',slots,{search:true});assert.equal(extra.ok,false);assert.deepEqual(await ui.read(),after);
});

// ---- D21 寒暄（对话类，A2）----
test.todo('D21 寒暄 ①–⑤——引擎没有“与人聊天”的动作：陈伯按性格与季节谈秋收、天气与实际一致、好感 +1~+3、约 15 分钟、无钱物变化（A2 对话动作组、对话模板 when: season()；S6 立场事件权重）。数据已备：action-costs talk.greet = 15 分钟，event-weights greet/affinity = +1（饱和 5 次 × 0.5，累计不超过 +5）');

// ---- D29 借小额钱款、D30 按时还钱（同意类，A2 / S3 / S6）----
test.todo('D29 借小额钱款 ①–⑤——向邻居借须对方答应：world_act 拒绝（“需要对方答应”，a1-daily-probes 的 D29 测试守着），钱庄借款走抵押旧判定，不是题面流程；缺 NPC 决策（A2）与 loan 义务无息条款 rate: 0（S3；附录 A §A.18 借贷利率区间 [0, 0.05]）。数据已备：event-weights borrow/trust = 0');
test.todo('D30 按时还钱 ①–⑤——同上；钱庄借款的按时还清（状态已还清、无逾期）由 a1-daily-probes 覆盖，但“陈伯 +100、250→150、好感小幅上升（守信）”缺 NPC 间借贷与 settle_on_time 立场事件（S3；S6 立场事件权重）。数据已备：event-weights settle_on_time/trust = +2');
