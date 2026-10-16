// A1：docs/probes/daily/events.md 里纯操作类的日常题，挑现有引擎能做的写成可执行测试（界面动作脚本，经 world_act，不调用模型）。
// 结果按引擎现有数值：断言钱物的来源去向、守恒、时间与地点推进，不强求题面数值（数值标定是后续工作）。
// 引擎做不到或要对话的题记为 todo，写明原因；清单见文件末尾。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {legacyTotal,flowDelta,reconcile} from './helpers/ledger-audit.mjs';
import {uiSession,qty} from './helpers/ui-script.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const DAY=1440,INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',AYAN='npc_hw_ayan',MILL='bld_hw_mill',FORGE='bld_hw_forge',SMITH='npc_hw_duanyan',POST='bld_hw_post',CLERK='npc_hw_shendu';
function conserved(before,after,label){
 const flows=before.ledger?flowDelta(before,after):{sources:0,sinks:0};
 assert.equal(legacyTotal(engine,after.state)-legacyTotal(engine,before.state),flows.sources-flows.sinks,`${label}：铜钱守恒（差额只来自登记的源汇）`);
 assert.deepEqual(reconcile(engine,after).mismatches,[],`${label}：旧字段与账本一致`);
}
const at=(location,minute,extra=()=>{})=>(s,doc)=>{s.location=location;s.minute=minute;extra(s,doc);};
const tool=(id,quality='木')=>({quantity:1,quality,durability:100,weight:0.2});
// Prime the books with one harmless look so later diffs count flows from an opened ledger.
async function primed(ui){await ui.choose('time',{minutes:1});return ui.read();}

test('D01 买馒头（面包）：钱从玩家到店主，货从店主到玩家，数量照实，约5分钟',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60)}),before=await primed(ui);
 const r=await ui.choose('trade.buy',{item:'item_bread',quantity:3},{target:LINSUI});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(before.state.player.coins-after.state.player.coins,r.result.cost);assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,r.result.cost);
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
 const ui=await uiSession(t,{mutate:at(INN,20*60,s=>{s.player.hp=Math.max(1,s.player.hp-8);})}),before=await primed(ui);
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
 const night=await ui.choose('trade.buy',{item:'item_iron_nail',quantity:2},{target:SMITH});assert.equal(night.ok,false);assert.match(night.error,/不提供交易服务/);
 assert.equal((await ui.read()).state.player.coins,before.state.player.coins);
 await ui.choose('time',{until:{dayOffset:1,hour:9}});
 const day=await ui.choose('trade.buy',{item:'item_iron_nail',quantity:2},{target:SMITH});assert.ok(day.ok,day.error);
});

test('D10 打工日结：受雇须对方答应——界面列出但不可执行，world_act 拒绝且钱物时间不变（A2 接入人物决策后开放）',async t=>{
 const ui=await uiSession(t,{mutate:at(MILL,8*60)}),before=await primed(ui);
 const row=(await ui.menu(AYAN)).actions.find(a=>a.id==='core:trade.work');
 assert.equal(row.blocked,'需要对方答应（对话功能完成后开放）');assert.ok(!row.slots.some(s=>s.name==='consent'),'没有替对方答应的槽位');
 const r=await ui.choose('trade.work',{minutes:240},{target:AYAN});assert.equal(r.ok,false);assert.equal(r.error,'需要对方答应（对话功能完成后开放）');
 const forged=await ui.choose('trade.work',{minutes:240,consent:true},{target:AYAN});assert.equal(forged.ok,false);assert.equal(forged.error,'需要对方答应（对话功能完成后开放）');
 assert.deepEqual((await ui.read()).state,before.state,'未经对方同意不会执行');
});

test('D15 钓鱼：渔获来自河滩真实鱼群，种群扣减与背包增加相等，花去时间',async t=>{
 const ui=await uiSession(t,{mutate:at('loc_hw_dock',6*60,s=>{s.inventory.item_kitchen_knife=tool('item_kitchen_knife','铁');s.inventory.item_water={quantity:4,quality:'木',durability:100,weight:0.5};})}),before=await primed(ui);
 const key='ecology:habitat_hw_water',fish=Object.keys(before.state.records[key].populations).find(k=>/perch|fish|carp|鱼/.test(k))??Object.keys(before.state.records[key].populations)[0];
 const r=await ui.choose('wildlife.fish',{species:fish});assert.ok(r.ok,r.error);const after=await ui.read();
 const caught=qty(after.state.inventory.item_fish)-qty(before.state.inventory.item_fish),drop=before.state.records[key].populations[fish].count-after.state.records[key].populations[fish].count;
 assert.equal(caught,drop,'钓上几条，水里少几条');assert.ok(after.state.minute>before.state.minute);
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

test('D27 存钱 / D28 三个月后取钱：存入进钱庄账户，利息出自钱庄，取回本息守恒',async t=>{
 const ui=await uiSession(t,{mutate:at(POST,10*60,s=>{s.player.coins=1200;})}),before=await primed(ui);
 const menu=await ui.menu();assert.ok(menu.actions.some(a=>a.id==='core:trade.deposit'),'驿站钱庄柜面可存钱');
 const dep=await ui.choose('trade.deposit',{coins:1000});assert.ok(dep.ok,dep.error);const mid=await ui.read();
 assert.equal(before.state.player.coins-mid.state.player.coins,1000);assert.ok(dep.result.balance>0&&dep.result.balance<=1000,'账户余额（扣存入手续费）');conserved(before,mid,'D27');
 await ui.choose('time',{until:{dayOffset:90,hour:10}});
 const look=await ui.choose('trade.bank_inspect',{});assert.ok(look.ok,look.error);
 const balance=look.result.balance;assert.ok(balance>=dep.result.balance,'三个月后余额不少于存入时');
 const pre=await ui.read(),out=await ui.choose('trade.withdraw',{coins:balance});assert.ok(out.ok,out.error);const after=await ui.read();
 assert.equal(after.state.player.coins-pre.state.player.coins,balance);conserved(pre,after,'D28');
});

test('D29 借小额钱款 / D30 按时还钱：向邻居借须对方答应（未开放）；钱庄柜面按抵押放贷照旧判定，到期前还清无逾期',async t=>{
 const ui=await uiSession(t,{mutate:at(INN,10*60,s=>{s.inventory.item_bread={quantity:4,quality:'木',durability:100,weight:0.2};})}),before=await primed(ui);
 const asked=await ui.choose('trade.borrow',{seller:LINSUI,coins:40,days:10,item:'item_bread',quantity:2},{search:true});
 assert.equal(asked.ok,false);assert.equal(asked.error,'需要对方答应（对话功能完成后开放）');assert.deepEqual((await ui.read()).state,before.state,'未经对方同意不会借出');
 const bank=await uiSession(t,{mutate:at(POST,10*60,s=>{s.player.coins=300;s.inventory.item_coin_coast={quantity:2,quality:'铜',durability:100,weight:0.005};})}),b0=await primed(bank);
 const row=(await bank.menu()).actions.find(a=>a.id==='core:trade.borrow');assert.ok(row&&!row.blocked,'钱庄借款由柜面规则判定，不等人物决策');
 const loan=await bank.choose('trade.borrow',{coins:100,days:30,item:'item_coin_coast',quantity:2});assert.ok(loan.ok,loan.error);const mid=await bank.read();
 assert.equal(mid.state.player.coins-b0.state.player.coins,100);const debt=mid.state.records[loan.result.debt];assert.equal(debt.debtor,'player');assert.ok(debt.deadline>mid.state.minute);conserved(b0,mid,'D29');
 await bank.choose('time',{minutes:2*DAY});
 const pre=await bank.read(),repay=await bank.choose('trade.repay',{debt:loan.result.debt,seller:CLERK});assert.ok(repay.ok,repay.error);const after=await bank.read();
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
 // 开局场景（09:00 酒馆）：导出再导入。10:00 起的同一操作见文末 todo（人物自治任务快照带 undefined 字段，导出后事件校验失败）。
 const ui=await uiSession(t);
 await ui.choose('trade.buy',{item:'item_bread',quantity:1},{target:LINSUI});
 const bundle=await ui.server.api('export',{campaignId:ui.campaignId}),copy=await ui.server.api('import',{bundle});
 assert.deepEqual(copy.document,(await ui.server.api('read',{campaignId:ui.campaignId})).document);
 const run=async campaignId=>{const v=await ui.server.api('read',{campaignId});return ui.server.api('execute',{campaignId,tool:'world_act',args:{action:'trade.buy',slots:{seller:LINSUI,item:'item_bread',quantity:2}},eventId:'after-load',anchor:null,expectedSequence:v.reference.sequence});};
 const a=await run(ui.campaignId),b=await run(copy.reference.campaignId);assert.deepEqual(a.result,b.result);assert.deepEqual(a.narration.lines,b.narration.lines);
});

// 未写成可执行测试的日常题（原因）
for(const [id,reason]of [
 ['D03 讨价还价','还价是对话交涉（A2）；同日报价一致与讨价不改标价由 L3 覆盖'],['D05 酒馆吃饭','引擎没有玩家饥饿与当场进食的结算'],
 ['D07 问路','对话（A2）'],['D09 下雨天','步行耗时已按天气路况结算（T2），但“淋湿”状态与体力消耗引擎没有'],['D11 月结工钱','引擎只有按工时日结的受雇，没有月薪雇佣'],
 ['D12 春播 / D13 秋收','农事按聚落公田结算，没有玩家自家田地'],['D14 采草药','没有野生草药存量与采集动作（采集只对猎物尸体与据点）'],['D16 做饭','烹饪配方需另备燕麦粉等材料与作台主许可，留待配方数据标定'],
 ['D21–D25 寒暄、打听、接交委托、送信','对话与委托交付（A2）'],['D26 托运货物','托运走承运合同多步流程（订、交接、到货），留待 A3 原语'],
 ['D31 普通打斗 / D32 受伤求医','战斗与诊疗非本卡范围（有专门测试）'],['D35 节庆 / D36 加入组织','需要组织者同意（A2）'],['D37 交税过关卡','没有路上关卡与过境货物税'],
 ['D38 看告示听传闻','对话与告示投影（A2）'],['D39（10:00 后的存档）','人物自治日常任务的 presence 快照写入 activity:undefined，事件哈希经 JSON 往返后对不上，导出再导入（及重启后读盘）报“事件校验失败”；见 docs/问题.md'],['D40 离开几天再回来','回程见闻（A2/S6）'],
])test.todo(`${id}：${reason}`);
