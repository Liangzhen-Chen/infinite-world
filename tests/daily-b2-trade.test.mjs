// 日常题集第二批（DAILY 卡）：买卖类。把题面数值落成世界副本与开局存档，经界面动作（world_act）结算，断言题面的精确预期。
// 不能由现有引擎结算的条目不在此断言，写成 test.todo，注明缺的机制与迁移阶段；清单见 docs/probes/daily/executable-status.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,setPrice,scene,stack,tool,monthDayMinute,conserved,primed,held,safeEventId,SEED,DAY} from './helpers/daily-b2.mjs';

const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',WEAVING='bld_hw_weaving',SULAN='npc_hw_sulan';

test('D03 讨价还价：开价 40 不成，45 成交；扣 45、得 1 匹、店主 +45；标价仍 50（次日照旧），好感变化在 ±2 以内',async t=>{
 // 粗布 50 文/匹（世界副本把窄幅麻布标价改为 50）；孙二→苏岚，好感 +20；玩家 200 文；夏季六月初八巳时。
 const world=variant(w=>setPrice(w,'item_linen_cloth',50)),engine=new WorldEngine(world);
 const ui=await uiSession(t,{world,mutate:scene(WEAVING,monthDayMinute(6,8,9,30),s=>{s.player.coins=200;s.npcs[SULAN].trust=20;s.npcs[SULAN].affection=20;})});
 const before=await primed(ui),stockBefore=held(before.state.npcs[SULAN].inventory,'item_linen_cloth'),regard=standing(engine,before.state,SULAN,'player');
 assert.equal(regard,20,'夹具：好感 +20');
 const low=await ui.choose('trade.trade',{seller:SULAN,item:'item_linen_cloth',quantity:1,unitPrice:40},{search:true,target:SULAN});
 assert.equal(low.ok,false);assert.match(low.error,/单价必须在45到/,'40 文低于议价下限：不成交');
 assert.deepEqual((await ui.read()).state.player,before.state.player,'没谈拢，钱物不动');
 const deal=await ui.choose('trade.trade',{seller:SULAN,item:'item_linen_cloth',quantity:1,unitPrice:45},{search:true,target:SULAN});assert.ok(deal.ok,deal.error);
 const after=await ui.read();
 assert.equal(deal.result.cost,45,'①最终成交价 45');
 assert.equal(before.state.player.coins,200);assert.equal(after.state.player.coins,155,'①200→155');
 assert.equal(held(after.state.inventory,'item_linen_cloth')-held(before.state.inventory,'item_linen_cloth'),1,'②背包 +1 匹');
 assert.equal(after.state.npcs[SULAN].coins-before.state.npcs[SULAN].coins,45,'③孙二钱柜 +45');
 assert.equal(stockBefore-held(after.state.npcs[SULAN].inventory,'item_linen_cloth'),1,'库存 −1');
 const quote=after.state.records[`trade-quote:${Math.floor(after.state.minute/DAY)}:${SULAN}:player:item_linen_cloth`];
 assert.equal(quote.regionalPrice,50,'④标价牌仍 50（地区价，未因讨价变动）');assert.equal(quote.listPrice,Math.round(50*quote.relationFactor),'好感 +20 的熟客折扣只来自立场系数（50→49），与讨价无关');assert.equal(quote.dealPrice,45);
 assert.equal(world.items.find(i=>i.id==='item_linen_cloth').basePrice,50,'④货物标价没有被永久改成 45');
 const change=standing(engine,after.state,SULAN,'player')-regard;assert.ok(Math.abs(change)<=2,`⑤好感变化 ${change} 在 ±2 以内`);
 conserved(before,after,'D03',engine);
 // 讨价只管本次：次日再买同一匹，按地区标价 50 乘熟客系数结算，不是 45。
 await ui.choose('time',{until:{dayOffset:1,hour:9,minute:30}});
 const next=await ui.read(),again=await ui.choose('trade.buy',{item:'item_linen_cloth',quantity:1},{target:SULAN});assert.ok(again.ok,again.error);
 const nextQuote=(await ui.read()).state.records[`trade-quote:${Math.floor(next.state.minute/DAY)}:${SULAN}:player:item_linen_cloth`];
 assert.equal(nextQuote.regionalPrice,50,'④次日标价仍 50');assert.equal(again.result.cost,nextQuote.listPrice);assert.notEqual(again.result.cost,45,'讨价只影响本次成交，没有变成新标价');assert.ok(again.result.cost>=49);
});
test.todo('D03 议价过程：玩家开价、孙二还价并同意 45（NPC 决策与对话）——引擎只校验成交价在议价区间 [0.9, 1.1]×标价内；NPC 自己决定接不接受归 A2（NPC 决策规则骨架）');

test('D05 酒馆吃饭 ①④：阳春面 8 + 卤肉 15，按零售价各付各的：铜钱 60→37，酒肆钱柜 +23',async t=>{
 // 阳春面→燕麦薄饼（item_oat_flatbread）8 文，卤肉→羊肉（item_mutton）15 文；掌柜林穗；冬季十二月初三午时；玩家 60 文。
 const world=variant(w=>{setPrice(w,'item_oat_flatbread',8);setPrice(w,'item_mutton',15);});
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(12,3,12,0),s=>{s.player.coins=60;})});
 const before=await primed(ui);
 const noodle=await ui.choose('trade.buy',{item:'item_oat_flatbread',quantity:1},{target:LINSUI}),meat=await ui.choose('trade.buy',{item:'item_mutton',quantity:1},{target:LINSUI});
 assert.ok(noodle.ok,noodle.error);assert.ok(meat.ok,meat.error);assert.equal(noodle.result.cost,8);assert.equal(meat.result.cost,15);
 const after=await ui.read();
 assert.equal(before.state.player.coins,60);assert.equal(after.state.player.coins,37,'①60→37（8+15=23）');
 assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,23,'④酒肆钱柜 +23');
 conserved(before,after,'D05',new WorldEngine(world));
});
test.todo('D05 ②饥饿度明显下降、不再饥饿——引擎没有玩家饥饿/饱食（只有生命）：缺身体需求量 body.satiety 与阈值状态 hungry（S1 vital 原语 + A3 进食动作 cost.body；参数 body.json person/satiety）');
test.todo('D05 ③当场吃完、背包无新增食物——引擎买到的熟食直接进背包，没有“当场进食 → sink:consume”：缺进食动作（A3；守恒对 S1）');
test.todo('D05 ⑤时间过去 20–30 分钟——引擎两笔交易各 5 分钟共 10 分钟；缺点菜 + 进食的动作耗时（A3：action-costs 增 eat/meal 行，cost.time 读表）');

test('D35 参加节庆 ①②：摊位月饼 6 文/个买 2 个：铜钱 50→38，背包 +2 个月饼',async t=>{
 // 月饼→燕麦薄饼（item_oat_flatbread）6 文；秋季八月十五（中秋）晒谷场摊位 → 青灯酒馆掌柜代摊；玩家 50 文。
 const world=variant(w=>setPrice(w,'item_oat_flatbread',6));
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(8,15,19,0),s=>{s.player.coins=50;})});
 const before=await primed(ui),r=await ui.choose('trade.buy',{item:'item_oat_flatbread',quantity:2},{target:LINSUI});assert.ok(r.ok,r.error);
 const after=await ui.read();
 assert.equal(r.result.cost,12);assert.equal(before.state.player.coins,50);assert.equal(after.state.player.coins,38,'①50→38');
 assert.equal(held(after.state.inventory,'item_oat_flatbread')-held(before.state.inventory,'item_oat_flatbread'),2,'②背包 +2 个月饼');
 conserved(before,after,'D35',new WorldEngine(world));
});
test.todo('D35 ②猜灯谜答对奖 1 盏花灯——引擎没有“答对即奖”的动作 outcomes（谜面判定属对话 A2，奖品转移属动作 outcomes A3）');
test.todo('D35 ③节庆只在八月十五当晚出现，次日恢复平常——引擎有按历法日期运行的节庆（festival-runtime.test.mjs），但没有中秋灯会与摊位的节庆数据（C1 内容接入；摊位随节庆开闭属 S4 营业时间 schedule 表）');
test.todo('D35 ④好感可小幅上升——引擎无参节庆的立场事件（S6 立场事件权重表 event-weights 增 attend_festival 行后读表）');
test.todo('D35 ⑤时间推进到灯会散场（亥时）——引擎节庆有 endsAt，但“看完灯会回家”没有对应动作（A3 动作耗时/持续动作 durationSlot）');

test('D16 做饭 ①②③④：清煮鱼汤按配方扣鱼 1、水 2、盐 1、柴 1，成品入背包，盐包没用完；耗时 = 配方登记的 30 分钟',async t=>{
 // 鲫鱼汤→清煮鱼汤配方（鱼 1 水 2 盐 1 柴 1）；柴→干木刨屑；秋季九月初三酉时；玩家有鱼 2、盐 3、柴 3、水 2。
 const world=variant(),engine=new WorldEngine(world),recipe=world.recipes.find(r=>r.id==='recipe_w3_fish_broth');
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(9,3,17,30),s=>{
  s.inventory.item_fish=stack(2);s.inventory.item_salt=stack(3);s.inventory.item_wood_shavings=stack(3);s.inventory.item_water=stack(2);
  for(const id of recipe.tools)s.inventory[id]=tool('铁');
  s.skills.skill_life_3_core={proficiency:300,daily:{},breakthroughs:[]};s.recipes={...s.recipes,recipe_w3_fish_broth:{source:{type:'teacher',id:LINSUI}}};
 })});
 const before=await primed(ui),r=await ui.choose('craft.manufacture',{recipe:'recipe_w3_fish_broth'},{eventId:safeEventId('d16')});assert.ok(r.ok,r.error);
 const after=await ui.read(),inv=(s,id)=>held(s.state.inventory,id);
 assert.equal(r.result.success,true,'检定通过（高熟练度）');
 assert.equal(inv(before,'item_fish')-inv(after,'item_fish'),1,'①鲫鱼按菜谱用量减少（2→1）');
 assert.equal(inv(before,'item_wood_shavings')-inv(after,'item_wood_shavings'),1,'②柴减少 1 份');
 assert.equal(inv(before,'item_salt')-inv(after,'item_salt'),1,'③盐用量减少');assert.ok(inv(after,'item_salt')>0,'③盐包没用完');
 assert.equal(inv(after,'item_fish_broth')-inv(before,'item_fish_broth'),1,'④背包 +1 份鱼汤');
 assert.equal(inv(before,'item_water')-inv(after,'item_water'),2);
 assert.equal(after.state.minute-before.state.minute,recipe.minutes,'耗时 = 配方登记的制作分钟');
 assert.equal(after.state.player.coins,before.state.player.coins-3,'灶台是酒馆的，付 3 文灶台费');
});
test.todo('D16 ⑤时间过去约半个时辰——引擎鱼汤配方登记 30 分钟，题面“半个时辰”按 D06 约定（一时辰 = 2 小时）为 60 分钟，不符；配方 laborMinutes 是世界配方数据，不在 balance 表（A3 配方耗时读 action-costs craft.recipe 行时对齐）');
test.todo('D16 ④二者择一：当场食用后饥饿下降——缺身体需求量与进食动作（S1 body + A3 进食）；现状只有“成品入背包”这一支');
