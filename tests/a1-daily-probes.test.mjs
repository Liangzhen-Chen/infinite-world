// todo 的阶段与真实前提逐条登记：docs/A3-后续阶段登记.md S5CT CT04/CT05/CT06（保留原阶段边界）。
// A1：docs/probes/daily/events.md 里纯操作类的日常题，挑现有引擎能做的写成可执行测试（界面动作脚本，经 world_act，不调用模型）。
// 结果按引擎现有数值：断言钱物的来源去向、守恒、时间与地点推进，不强求题面数值（数值标定是后续工作）。
// 引擎做不到或要对话的题记为 todo，写明原因；清单见文件末尾。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {legacyTotal,flowDelta,reconcile} from './helpers/ledger-audit.mjs';
import {uiSession,qty} from './helpers/ui-script.mjs';
import {readBodyNeed,bodyRule} from '../server-plugin/primitives-body.mjs';
import {meal,crop,herbs,cooking,shipping} from './helpers/s5ct-actions.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const DAY=1440,INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',AYAN='npc_hw_ayan',MILL='bld_hw_mill',FORGE='bld_hw_forge',SMITH='npc_hw_duanyan',POST='bld_hw_post',CLERK='npc_hw_shendu';
function conserved(before,after,label){
 const flows=before.ledger?flowDelta(before,after,'coin_river'):{sources:0,sinks:0};
 assert.equal(legacyTotal(engine,after.state)-legacyTotal(engine,before.state),flows.sources-flows.sinks,`${label}：铜钱守恒（差额只来自登记的源汇）`);
 assert.deepEqual(reconcile(engine,after).mismatches,[],`${label}：旧字段与账本一致`);
}
const at=(location,minute,extra=()=>{})=>(s,doc)=>{s.location=location;s.minute=minute;extra(s,doc);};
const tool=(id,quality='木')=>({quantity:1,quality,durability:100,weight:0.2});
// Prime the books with one harmless look so later diffs count flows from an opened ledger.
async function primed(ui){await ui.choose('time',{minutes:1});return ui.read();}

test('D01 买馒头（面包）：钱从玩家到店主，货从店主到玩家，数量照实，约5分钟',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.npcs[LINSUI].inventory.item_bread={quantity:8};})}),before=await primed(ui);
 // S5-02: household 2*60/30=4 retained; opening 8 leaves 4 saleable, three cost trunc(2*.5*3)=3.
 const r=await ui.choose('trade.buy',{item:'item_bread',quantity:3},{target:LINSUI});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(r.result.cost,3);assert.equal(before.state.player.coins-after.state.player.coins,r.result.cost);assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,r.result.cost);
 assert.equal(qty(after.state.inventory.item_bread)-qty(before.state.inventory.item_bread),3);assert.equal(qty(before.state.npcs[LINSUI].inventory.item_bread)-qty(after.state.npcs[LINSUI].inventory.item_bread),3);
 assert.equal(after.state.minute-before.state.minute,5);conserved(before,after,'D01');
});

test('D02 卖兽皮：店主从自己钱柜付钱、收进货，玩家交出全部',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.inventory.item_rawhide={quantity:5,quality:'木',durability:100,weight:0.5};})}),before=await primed(ui);
 const r=await ui.choose('trade.sell_to',{item:'item_rawhide',quantity:5},{target:LINSUI});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.player.coins-before.state.player.coins,r.result.cost);assert.equal(before.state.npcs[LINSUI].coins-after.state.npcs[LINSUI].coins,r.result.cost,'从店主钱柜扣');
 assert.equal(qty(after.state.inventory.item_rawhide),0);assert.equal(qty(after.state.npcs[LINSUI].inventory.item_rawhide)-qty(before.state.npcs[LINSUI].inventory.item_rawhide),5);conserved(before,after,'D02');
});

test('D04 住店一晚：房钱给店主，睡到次日清晨，生命恢复',async t=>{
 // F026: the keeper's only income examined here is the room fee, so every other resident is penniless (nobody walks into the tavern at noon
 // and buys; walk-in customers have their own tests in s5-w4-economy).
 const ui=await uiSession(t,{mutate:at(INN,20*60,s=>{s.player.hp=Math.max(1,s.player.hp-8);for(const [id,npc] of Object.entries(s.npcs))if(id!==LINSUI)npc.coins=0;})}),before=await primed(ui);
 const rent=await ui.choose('trade.lodge',{days:1});assert.ok(rent.ok,rent.error);
 const sleep=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(sleep.ok,sleep.error);const after=await ui.read();
 assert.equal(before.state.player.coins-after.state.player.coins,rent.result.cost,'只扣一晚');assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,rent.result.cost);
 assert.equal(after.state.minute,DAY+6*60);assert.ok(after.state.player.hp>before.state.player.hp);assert.deepEqual(after.state.inventory,before.state.inventory,'随身物品不凭空消失');conserved(before,after,'D04');
});

test('D06 赶路去白石镇：耗时到达、地点更新、钱物不变，村里人照常按作息推进',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw',6*60)}),before=await primed(ui);
 const r=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.location,'loc_bs');assert.ok(after.state.minute-before.state.minute>=4*60);
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory);
 assert.ok(Object.keys(after.state.npcs).some(id=>after.state.npcs[id].location!==before.state.npcs[id]?.location||after.state.npcs[id].activity!==before.state.npcs[id]?.activity),'离开期间村里不冻结');
});

test('D08 天黑：铁匠铺打烊不能交易，次日开门后可以；钱物在打烊时不变',async t=>{
 const ui=await uiSession(t,{mutate:at(FORGE,21*60,s=>{s.player.coins=500;})}),before=await primed(ui);
 const night=await ui.choose('trade.buy',{seller:SMITH,item:'item_iron_nail',quantity:2},{target:SMITH,search:true});assert.equal(night.ok,false);assert.match(night.error,/不提供交易服务/);
 assert.equal((await ui.read()).state.player.coins,before.state.player.coins);
 await ui.choose('time',{until:{dayOffset:1,hour:9}});
 const day=await ui.choose('trade.buy',{item:'item_iron_nail',quantity:2},{target:SMITH});assert.ok(day.ok,day.error);
});

test('D10 打工日结：缺有效同意时界面列出但不可执行，world_act 拒绝且钱物时间不变',async t=>{
 const ui=await uiSession(t,{mutate:at(MILL,8*60)}),before=await primed(ui);
 const row=(await ui.menu(AYAN)).actions.find(a=>a.id==='core:trade.work');
 // A3 统一同意已经接入；只对齐新拒绝原因，仍逐项验证缺同意和伪 consent 均拒绝、状态不变。
 const required='需要对方答应（须有同意事件、有效服务约定或对方当前决策，不能代填同意）';
 assert.equal(row.blocked,required);assert.ok(!row.slots.some(s=>s.name==='consent'),'没有替对方答应的槽位');
 const r=await ui.choose('trade.work',{minutes:240},{target:AYAN});assert.equal(r.ok,false);assert.equal(r.error,required);
 const forged=await ui.choose('trade.work',{minutes:240,consent:true},{target:AYAN});assert.equal(forged.ok,false);assert.equal(forged.error,required);
 assert.deepEqual((await ui.read()).state,before.state,'未经对方同意不会执行');
});

test('D15 钓鱼：渔获来自河滩真实鱼群，种群扣减与背包增加相等，花去时间',async t=>{
 // D05 §5.5 / S505 已审规则：钓具、蚯蚓与活鱼按正式目录计量；非考查的装备由声明前提加载。
 const ui=await uiSession(t,{mutate:at('loc_hw_dock',6*60,(s,doc)=>{
  doc.randomSeed='a1-fish';
  const loaded=applyIntentSetup(engine,doc,{inventory:{item_bamboo_fishing_rod:1,item_earthworm_bait:10}});
  assert.deepEqual(loaded.setupUnmet,[]);Object.assign(doc,loaded.document);
 })}),before=await primed(ui);
 const key='ecology:habitat_hw_water',fish=Object.keys(before.state.records[key].populations).find(k=>/perch|fish|carp|鱼/.test(k))??Object.keys(before.state.records[key].populations)[0];
 const r=await ui.choose('wildlife.fish',{species:fish},{eventId:'catch-11'});assert.ok(r.ok,r.error);const after=await ui.read();
 const caught=qty(after.state.inventory.item_live_fish)-qty(before.state.inventory.item_live_fish),drop=before.state.records[key].populations[fish].count-after.state.records[key].populations[fish].count;
 // 一次成功抛竿 × 正式 yield=1 = 1条；耗1饵、30分钟，账户扣1，真实活鱼个体加1。
 assert.equal(caught,1);assert.equal(drop,1);assert.equal(caught,drop,'钓上几条，水里少几条');
 assert.equal(before.state.inventory.item_earthworm_bait.quantity-after.state.inventory.item_earthworm_bait.quantity,1);
 assert.equal(after.state.minute-before.state.minute,30);
});

test('D17 制作：按配方在磨坊作台做木楔，材料扣减、成品入包、作台费给作台主',async t=>{
 const ui=await uiSession(t,{mutate:at(MILL,9*60,s=>{s.inventory.item_wood={quantity:3,quality:'木',durability:100,weight:1};s.inventory.item_whittling_knife=tool('item_whittling_knife');
  s.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};s.recipes={...s.recipes,recipe_wooden_pegs:{source:{type:'teacher',id:AYAN}}};})}),before=await primed(ui);
 const menu=await ui.menu();assert.ok(menu.actions.find(a=>a.id==='core:craft.manufacture').slots.find(s=>s.name==='recipe').options.some(o=>o.value==='recipe_wooden_pegs'),'制作菜单列出学会且此处有作台的配方');
 const r=await ui.choose('craft.manufacture',{recipe:'recipe_wooden_pegs'});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(qty(before.state.inventory.item_wood)-qty(after.state.inventory.item_wood),1);
 if(r.result.success)assert.equal(qty(after.state.inventory.item_wooden_peg)-qty(before.state.inventory.item_wooden_peg),4);
 assert.ok(after.state.minute-before.state.minute>=20);conserved(before,after,'D17');
});

test('D18 修理：按修理方案修好旧木杖，耐久回升，仍是同一件',async t=>{
 const ui=await uiSession(t,{mutate:at(MILL,9*60,s=>{s.inventory.item_staff={...s.inventory.item_staff,durability:50};s.inventory.item_whittling_knife=tool('item_whittling_knife');s.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};})});
 const plan=world.rules.repairs.find(row=>row.item==='item_staff').id;
 const before=await primed(ui),r=await ui.choose('craft.repair',{item:'item_staff',repairPlan:plan},{target:'item_staff'});assert.ok(r.ok,r.error);
 const after=await ui.read();assert.equal(r.result.plan,plan);assert.ok(after.state.minute>before.state.minute);
 assert.ok(r.result.success?after.state.inventory.item_staff.durability>50:after.state.inventory.item_staff.durability<=50,'成功则耐久回升，失败不回升');assert.equal(qty(after.state.inventory.item_staff),1,'仍是同一件');conserved(before,after,'D18');
});

test('D19 拜师学配方：在阿砚当班时付学费学会木楔，钱给师傅，配方入册，花去学时',async t=>{
 const ui=await uiSession(t,{mutate:at(MILL,9*60,s=>{s.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};})}),before=await primed(ui);
 // 学习有检定：没学会照样花钱花时间，像玩家一样再学，直到学会（事件编号固定，结果确定）。
 let r,tries=0;do{r=await ui.choose('learn',{entity:'recipe_wooden_pegs',source:AYAN,kind:'recipe'},{search:true});assert.ok(r.ok,r.error);tries++;}while(!r.result.success&&tries<8);
 const after=await ui.read();assert.equal(r.result.success,true);
 assert.ok(after.state.recipes.recipe_wooden_pegs,'配方入册');const fee=before.state.player.coins-after.state.player.coins;assert.equal(fee,tries*r.result.cost,'每次学都付学费');
 assert.ok(fee>0);assert.equal(after.state.npcs[AYAN].coins-before.state.npcs[AYAN].coins,fee,'学费给师傅');assert.ok(after.state.minute-before.state.minute>=30*tries);conserved(before,after,'D19');
});

test('D20 练习技能：熟练度小幅增加，不凭空得物',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw',9*60,s=>{s.skills.skill_life_6_core={proficiency:20,daily:{},breakthroughs:[]};})}),before=await primed(ui);
 const r=await ui.choose('practice',{skill:'skill_life_6_core'});assert.ok(r.ok,r.error);const after=await ui.read();
 const gain=after.state.skills.skill_life_6_core.proficiency-20;assert.ok(gain>0&&gain<100,`小幅增加：${gain}`);
 assert.deepEqual(after.state.inventory,before.state.inventory);assert.equal(after.state.player.coins,before.state.player.coins);
});
// A3 §6.6: practice with a duration slot (practice.session) is deterministic
// growth. Same small-gain, inventory and money guarantees; elapsed time and
// body cost are derived from the request and the body table, not pinned.
test('D20 练习一个时辰：熟练度小幅增加，时间和体力落地，不凭空得物',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw',9*60,s=>{s.skills.skill_life_6_core={proficiency:20,daily:{},breakthroughs:[]};})}),before=await primed(ui);
 const r=await ui.choose('practice.session',{skill:'skill_life_6_core',minutes:120});assert.ok(r.ok,r.error);const after=await ui.read();
 const gain=after.state.skills.skill_life_6_core.proficiency-20;assert.ok(gain>0&&gain<100,`小幅增加：${gain}`);
 assert.deepEqual(after.state.inventory,before.state.inventory);assert.equal(after.state.player.coins,before.state.player.coins);
 assert.equal(after.state.minute-before.state.minute,120);
 // practice.session is light work: stamina falls by the body table's light hourly rate for the elapsed minutes.
 const stamina=bodyRule(engine,'stamina').drainPerHour.light*120/60;
 assert.ok(Math.abs(readBodyNeed(engine,before,'player','stamina')-stamina-readBodyNeed(engine,after,'player','stamina'))<1e-9);
});
test('D27 存钱 / D28 三个月后取钱：存入进钱庄账户，利息出自钱庄，取回本息守恒',async t=>{
 const ui=await uiSession(t,{mutate:at(POST,10*60,s=>{s.player.coins=1200;})}),before=await primed(ui);
 const menu=await ui.menu();assert.ok(menu.actions.some(a=>a.id==='core:trade.deposit'),'驿站钱庄柜面可存钱');
 const dep=await ui.choose('trade.deposit',{coins:1000});assert.ok(dep.ok,dep.error);const mid=await ui.read();
 assert.equal(before.state.player.coins-mid.state.player.coins,1000);assert.ok(dep.result.balance>0&&dep.result.balance<=1000,'账户余额（扣存入手续费）');conserved(before,mid,'D27');
 const wait=await ui.choose('time',{until:{dayOffset:90,hour:10}});assert.ok(wait.ok,wait.error);// 单次上限 30 天：A1b 起 world_act 自动拆成三段
 assert.equal((await ui.read()).state.minute,(Math.floor(mid.state.minute/DAY)+90)*DAY+10*60,'真的过了三个月');
 const look=await ui.choose('trade.bank_inspect',{});assert.ok(look.ok,look.error);
 const balance=look.result.balance;assert.ok(balance>=dep.result.balance,'三个月后余额不少于存入时');
 const pre=await ui.read(),out=await ui.choose('trade.withdraw',{coins:balance});assert.ok(out.ok,out.error);const after=await ui.read();
 assert.equal(after.state.player.coins-pre.state.player.coins,balance);conserved(pre,after,'D28');
});

test('D29 借小额钱款 / D30 按时还钱：向邻居借须有效同意；钱庄柜面按抵押放贷照旧判定，到期前还清无逾期',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.inventory.item_bread={quantity:4,quality:'木',durability:100,weight:0.2};})}),before=await primed(ui);
 const asked=await ui.choose('trade.borrow',{seller:LINSUI,coins:40,days:10,item:'item_bread',quantity:2},{search:true});
 // 同 D10：A3 同意接点替代“未开放”措辞，拒绝及钱物/时间不变的保证完整保留。
 assert.equal(asked.ok,false);assert.equal(asked.error,'需要对方答应（须有同意事件、有效服务约定或对方当前决策，不能代填同意）');assert.deepEqual((await ui.read()).state,before.state,'未经对方同意不会借出');
 // D15 15.3: metal value, not stamped face. Copper14/.2*.005*.5=.175;
 // silver38/.05*.005*.85=3.23; floor(4*3.23/.175)=73 >=100*.7=70.
 const bank=await uiSession(t,{mutate:at(POST,10*60,s=>{s.player.coins=300;s.inventory.item_coin_coast={quantity:4,quality:'铜',durability:100,weight:0.005};})}),b0=await primed(bank);
 const row=(await bank.menu()).actions.find(a=>a.id==='core:trade.borrow');assert.ok(row&&!row.blocked,'钱庄借款由柜面规则判定，不等人物决策');
 const loan=await bank.choose('trade.borrow',{coins:100,days:30,item:'item_coin_coast',quantity:4});assert.ok(loan.ok,loan.error);const mid=await bank.read();
 assert.equal(mid.state.player.coins-b0.state.player.coins,100);const debt=mid.state.records[loan.result.debt];assert.equal(debt.debtor,'player');assert.ok(debt.deadline>mid.state.minute);conserved(b0,mid,'D29');
 await bank.choose('time',{minutes:2*DAY});
 const pre=await bank.read(),repay=await bank.choose('trade.repay',{debt:loan.result.debt,seller:CLERK});assert.ok(repay.ok,repay.error);const after=await bank.read();
 assert.equal(mid.state.records[`pledge:${loan.result.debt}`].value,73);
 const done=after.state.records[loan.result.debt];assert.equal(done.status,'已还清');assert.equal(done.overdueAt,undefined,'按时还清没有逾期');
 assert.ok(pre.state.player.coins>after.state.player.coins);conserved(pre,after,'D30');
});

test('D33 休息睡觉：睡到次日卯时，生命恢复，钱物不变',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,22*60,s=>{s.player.hp=3;})}),before=await primed(ui);
 const r=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.minute,DAY+6*60);assert.ok(after.state.player.hp>3);assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory);
});

test('D34 喂宠物：食物从行囊扣一份，宠物饥饿下降',async t=>{
 const pet='monster_m4r_pet';
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{
  s.created[pet]={id:pet,name:'阿黄',aliases:[],template:0,levelRange:[1,1],tamingRule:{category:'support',minimumSkill:100,minimumPlayerLevel:1,trustThreshold:20,minutes:60,difficulty:10,food:[{item:'item_ration',hungerRelief:50,trustGain:5}],skills:[],rideable:false}};
  s.creatures={...s.creatures,[pet]:{name:'阿黄',location:s.location,hp:30,maxHp:30,level:1,status:'正常',owner:'player',care:{version:1,hunger:70,fatigue:0,mood:60,loyalty:60,sickness:false,sickHours:0,neglectHours:0,nextTick:s.minute+60,bond:30,feedDay:-1,skills:{},experience:0}}};
  s.pets={...s.pets,[pet]:{petFormat:1,creature:pet,category:'support',status:'活跃'}};s.inventory.item_ration={quantity:2,quality:'木',durability:100,weight:0.2};})}),before=await primed(ui);
 const r=await ui.choose('pet.feed',{target:pet,item:'item_ration'},{search:true});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(qty(before.state.inventory.item_ration)-qty(after.state.inventory.item_ration),1);assert.ok(after.state.creatures[pet].care.hunger<before.state.creatures[pet].care.hunger);
 assert.equal(after.state.creatures[pet].location,after.state.location);
});

test('D39 存档读档后继续：导出再导入，状态逐字相同，继续买卖结果一致',async t=>{
 // 开局场景（09:00 酒馆）：导出再导入。10:00 人物自治开工当刻的同一操作见下一题（R25）。
 // S5-02: retain four household loaves plus the three bought across the save boundary.
 const ui=await uiSession(t,{mutate:at(INN,9*60,s=>{s.npcs[LINSUI].inventory.item_bread={quantity:8};})});
 await ui.choose('trade.buy',{item:'item_bread',quantity:1},{target:LINSUI});
 const bundle=await ui.server.api('export',{campaignId:ui.campaignId}),copy=await ui.server.api('import',{bundle});
 assert.deepEqual(copy.document,(await ui.server.api('read',{campaignId:ui.campaignId})).document);
 const run=async campaignId=>{const v=await ui.server.api('read',{campaignId});return ui.server.api('execute',{campaignId,tool:'world_act',args:{action:'trade.buy',slots:{seller:LINSUI,item:'item_bread',quantity:2}},eventId:'after-load',anchor:null,expectedSequence:v.reference.sequence});};
 const a=await run(ui.campaignId),b=await run(copy.reference.campaignId);assert.deepEqual(a.result,b.result);assert.deepEqual(a.narration.lines,b.narration.lines);
});

test('D39 存档读档后继续（10:00）：人物自治开工当刻导出再导入，时间、钱物与人物逐字段不变，继续推进与原档一致（重启读盘见 save-roundtrip）',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60)});
 const r=await ui.choose('trade.buy',{item:'item_bread',quantity:1},{target:LINSUI});assert.ok(r.ok,r.error);const saved=await ui.read();
 assert.ok(Object.keys(saved.state.npcAutonomy.tasks).length>0,'存档里有当刻开工的人物自治任务');
 const bundle=await ui.server.api('export',{campaignId:ui.campaignId}),{reference}=await ui.server.api('import',{bundle});
 const loaded=(await ui.server.api('read',{campaignId:reference.campaignId})).document;assert.deepEqual(loaded,saved,'读档后一切照旧');
 const step=async(campaignId,eventId)=>{const view=await ui.server.api('read',{campaignId});await ui.server.api('execute',{campaignId,tool:'world_act',args:{action:'core:time',slots:{minutes:120}},eventId,anchor:null,expectedSequence:view.reference.sequence});return (await ui.server.api('read',{campaignId})).document;};
 const after=await step(ui.campaignId,'later');assert.ok(after.state.minute>saved.state.minute);
 assert.deepEqual(await step(reference.campaignId,'later'),after,'读档后继续推进与原档一致');
});

// D37 过关税已由 daily-b2-events2 的真实通关用例覆盖；D40 离乡回访见同文件的往返与回程见闻用例。
// 未写成可执行测试的日常题（原因）
for(const [id,reason]of [
 ['D03 议价过程','成交价仅校验在标价区间；缺 NPC 对报价作决定并同意成交（A2 NPC 决策与对话）'],
 ['D07 问路','缺问路动作、NPC 按主观视图回答和玩家获得地点知识（A2 对话与 NPC 决策；S6 知情集合/地图投影）'],
 ['D09 下雨天','淋湿暴露已由真实等待/赶路覆盖；现有 move 未接 body.stamina 的 travel 消费，432分钟实测损失0，仍缺雨晴体力对照（A3 身体消费者；S5 暴露已实现；登记：docs/A3-后续阶段登记.md S5CT）'],
 ['D11 月结工钱','只有按工时日结；缺按月锚定结算的工资义务及结算后持续有效的雇佣关系（S3 义务统一）'],
 ['D21–D25 寒暄、打听、接交委托、送信','缺对应 NPC 对话/决策与委托承接交付（A2）；信件代表物归 S3，知情传播归 S6'],
 ['D31 普通打斗 / D32 受伤求医','普通战斗与预置咬伤的真实诊疗已分别覆盖；本组合仍缺指定遭遇产生真实病程伤势、再连续就医的动作前提（S1/A3 身体与战斗消费者；S5 服务已实现；登记：docs/A3-后续阶段登记.md S5CT CT06）'],
 ['D35 节庆 / D36 加入组织','节庆缺指定活动内容与参加结算（C1 内容、S4 场地/时段、S6 立场）；入会缺组织者真实同意和成员权利派生（A2 决策、S2 持有）'],
 ['D38 看告示听传闻','缺告示的规范来源与执行一致性（S4 法域规范）；传闻需遵守来源和知情边界（S6 知情与投影）'],
])test.todo(`${id}：${reason}`);

// S5CT：原 todo 转正；真实动作与手算锚点见 helpers/s5ct-actions。
test('D05 酒馆吃饭：真实购买与食用，钱物及饱食同笔结算',meal);
test('D12 / D13：真实租入田地，再播种成熟并从田间账户收割',crop);
test('D14 采药：真实进入林地后采集，有限存量与所得相抵',herbs);
test('D16 做饭：真实消耗材料生成鱼汤，再实际食用',cooking);
test('D26 托运：实际造车、订运、到货并亲自提取，货物不复制',shipping);
