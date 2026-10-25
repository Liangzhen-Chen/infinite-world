// 日常题集第二批（DAILY 卡）：买卖类。把题面数值落成世界副本与开局存档，经界面动作（world_act）结算，断言题面的精确预期。
// 不能由现有引擎结算的条目不在此断言，写成 test.todo，注明缺的机制与迁移阶段；清单见 docs/probes/daily/executable-status.md。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {facilityRuntime} from '../server-plugin/facility-state.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,setPrice,scene,stack,tool,monthDayMinute,conserved,primed,held,safeEventId,SEED,DAY} from './helpers/daily-b2.mjs';

const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',WEAVING='bld_hw_weaving',SULAN='npc_hw_sulan';
// S5-02 / 15 §15.2: fixture prices are baselines. Expected current totals
// use the native read projection; no saved quote is authoritative.
const projected=(world,document,seller,item,quantity=1)=>facilityRuntime().currentTradeQuote(new WorldEngine(world),document,{seller,item,quantity});

test('D03 议价在市场区间内成交；钱货守恒、基准不变、次日重报，好感变化在 ±2 以内',async t=>{
 // 粗布 50 文/匹（世界副本把窄幅麻布标价改为 50）；孙二→苏岚，好感 +20；玩家 200 文；夏季六月初八巳时。
 const world=variant(w=>setPrice(w,'item_linen_cloth',50)),engine=new WorldEngine(world);
 const ui=await uiSession(t,{world,mutate:scene(WEAVING,monthDayMinute(6,8,9,30),s=>{s.player.coins=200;s.npcs[SULAN].trust=20;s.npcs[SULAN].affection=20;})});
 const before=await primed(ui),stockBefore=held(before.state.npcs[SULAN].inventory,'item_linen_cloth'),regard=standing(engine,before.state,SULAN,'player');
 assert.equal(regard,20,'夹具：好感 +20');
 const quote=projected(world,before,SULAN,'item_linen_cloth'),[lo]=world.rules.economy.priceFactorLimits.bargain,offered=Math.ceil(quote.listPrice*lo);
 // Cloth D=1, S=7 → .5 floor; regard 20 × keeper weight .7 gives
 // relation 1-.15*.7*.2=.979. 50*.5*.979=24.475; min ceil(*.9)=23.
 assert.equal(offered,23);
 const low=await ui.choose('trade.trade',{seller:SULAN,item:'item_linen_cloth',quantity:1,unitPrice:offered-1},{search:true,target:SULAN});
 assert.equal(low.ok,false);assert.match(low.error,new RegExp(`单价必须在${offered}到`),'低于投影议价下限：不成交');
 assert.deepEqual((await ui.read()).state.player,before.state.player,'没谈拢，钱物不动');
 const deal=await ui.choose('trade.trade',{seller:SULAN,item:'item_linen_cloth',quantity:1,unitPrice:offered},{search:true,target:SULAN});assert.ok(deal.ok,deal.error);
 const after=await ui.read();
 assert.equal(deal.result.cost,offered,'①最终成交价等于接受的还价');
 assert.equal(before.state.player.coins,200);assert.equal(after.state.player.coins,200-offered,'①按实际总额扣款');
 assert.equal(held(after.state.inventory,'item_linen_cloth')-held(before.state.inventory,'item_linen_cloth'),1,'②背包 +1 匹');
 assert.equal(after.state.npcs[SULAN].coins-before.state.npcs[SULAN].coins,offered,'③店主收到同一总额');
 assert.equal(stockBefore-held(after.state.npcs[SULAN].inventory,'item_linen_cloth'),1,'库存 −1');
 assert.equal(quote.explanation.baseline,50,'④讨价不改目录基准');assert.equal(quote.listPrice,quote.explanation.price.value,'报价包含供需、立场与修正项');assert.equal(Object.values(after.state.records).find(r=>r.category==='market_trade').totalCoins,offered);
 assert.equal(world.items.find(i=>i.id==='item_linen_cloth').basePrice,50,'④货物标价没有被永久改成 45');
 const change=standing(engine,after.state,SULAN,'player')-regard;assert.ok(Math.abs(change)<=2,`⑤好感变化 ${change} 在 ±2 以内`);
 conserved(before,after,'D03',engine);
 // 讨价只管本次：次日再买同一匹，按地区标价 50 乘熟客系数结算，不是 45。
 await ui.choose('time',{until:{dayOffset:1,hour:9,minute:30}});
 const next=await ui.read(),nextQuote=projected(world,next,SULAN,'item_linen_cloth'),again=await ui.choose('trade.buy',{item:'item_linen_cloth',quantity:1},{target:SULAN});assert.ok(again.ok,again.error);
 assert.equal(nextQuote.explanation.baseline,50,'④次日基准仍 50');assert.equal(again.result.cost,nextQuote.totalCoins);assert.notEqual(again.result.cost,offered,'讨价只影响本次成交');assert.ok(again.result.cost>=Math.ceil(nextQuote.listPrice*lo));
});
test.todo('D03 议价过程：玩家开价、孙二还价并同意 45（NPC 决策与对话）——引擎只校验成交价在议价区间 [0.9, 1.1]×标价内；NPC 自己决定接不接受归 A2（NPC 决策规则骨架）');

test('D05 酒馆买两种食物，按当前零售价各付各的；钱柜收到同一总额',async t=>{
 // 阳春面→燕麦薄饼（item_oat_flatbread）8 文，卤肉→羊肉（item_mutton）15 文；掌柜林穗；冬季十二月初三午时；玩家 60 文。
 const world=variant(w=>{setPrice(w,'item_oat_flatbread',8);setPrice(w,'item_mutton',15);});
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(12,3,12,0),s=>{s.player.coins=60;})});
 const before=await primed(ui);
 const firstPrice=projected(world,before,LINSUI,'item_oat_flatbread'),noodle=await ui.choose('trade.buy',{item:'item_oat_flatbread',quantity:1},{target:LINSUI});
 const secondPrice=projected(world,await ui.read(),LINSUI,'item_mutton'),meat=await ui.choose('trade.buy',{item:'item_mutton',quantity:1},{target:LINSUI});
 assert.ok(noodle.ok,noodle.error);assert.ok(meat.ok,meat.error);assert.equal(noodle.result.cost,firstPrice.totalCoins);assert.equal(meat.result.cost,secondPrice.totalCoins);
 // Food is abundant (D=14, S>28): 8*.5*1=4; 15*.5 times the
 // second-sale depth near 1 remains between 7 and 8, truncating to 7.
 // Quality, spread, regard and registered corrections are all 1.
 assert.equal(noodle.result.cost,4);assert.equal(meat.result.cost,7);
 const after=await ui.read();
 const total=firstPrice.totalCoins+secondPrice.totalCoins;
 assert.equal(before.state.player.coins,60);assert.equal(after.state.player.coins,60-total,'①两笔总额各自取整后扣款');
 assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,total,'④酒肆收到实际总额');
 conserved(before,after,'D05',new WorldEngine(world));
});
async function dine(t){
 // A3: use an actually cooked meat dish rather than the original raw-mutton
 // purchase fixture. S5-02 keeps 8/15 as baselines and derives the actual bill.
 const world=variant(w=>{setPrice(w,'item_oat_flatbread',8);setPrice(w,'item_mutton_turnip_stew',15);});
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(12,3,12,0),s=>{
  s.player.coins=60;s.player.body={satiety:{value:30,asOf:monthDayMinute(12,3,12,0),activity:'rest'}};
  // S5-02: two people *60 daily satiety /35 per stew rounds up to
  // four retained portions; the fifth is the examined customer's meal.
  s.npcs[LINSUI].inventory.item_mutton_turnip_stew=stack(5);
 })});
 const before=await primed(ui),menu=await ui.server.api('actions',{campaignId:ui.campaignId,query:'eat.order',target:LINSUI});
 assert.ok(menu.actions.some(a=>a.id==='core:eat.order'),'新目录动作可经真实搜索找到（对象菜单限24行）');
 const r=await ui.choose('eat.order',{subject:LINSUI,item:'item_oat_flatbread',side:'item_mutton_turnip_stew'},{target:LINSUI,search:true});
 assert.ok(r.ok,r.error);const after=await ui.read();
 const paid=r.result.purchases.reduce((n,p)=>n+p.cost,0);for(const p of r.result.purchases)assert.equal(p.cost,Math.trunc(p.pricing.unroundedTotal));
 // Same abundant-food floor: first 8*.5=4, next 15*.5*day-depth
 // lies in [7,8); neutral grade/spread/regard/correction. Total 4+7=11.
 assert.equal(paid,11);
 assert.equal(r.result.paid,paid);assert.equal(before.state.player.coins-after.state.player.coins,paid);conserved(before,after,'D05用餐',new WorldEngine(world));
 return {before,after,r};
}
test('D05 ②用餐的真实 nutrition 增加饱食并解除 hungry 阈值',async t=>{
 const {after}=await dine(t);assert.ok(after.state.player.body.satiety.value>30);assert.ok(after.state.player.body.satiety.value<=100);
});
test('D05 ③当场吃完，原存粮保留、没有新增食物，食物进入 sink:consume',async t=>{
 const {before,after}=await dine(t);
 for(const id of ['item_oat_flatbread','item_mutton_turnip_stew']){
  assert.equal(held(after.state.inventory,id),held(before.state.inventory,id));
  assert.equal(after.ledger.flows[`sink:consume|${id}|meal`]-(before.ledger.flows[`sink:consume|${id}|meal`]??0),1);
 }
});
test('D05 ⑤整次点餐与用餐25分钟，不叠加成35分钟',async t=>{
 const {before,after,r}=await dine(t);assert.equal(after.state.minute-before.state.minute,25);assert.equal(r.result.cost.time,25);
});

test('D35 参加节庆 ①④：按当前市场买 2 份，实付总额一次取整，村民好感不降',async t=>{
 // 月饼→燕麦薄饼（item_oat_flatbread）6 文；秋季八月十五（中秋）晒谷场摊位 → 青灯酒馆掌柜代摊；玩家 50 文。
 const world=variant(w=>setPrice(w,'item_oat_flatbread',6));
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(8,15,19,0),s=>{s.player.coins=50;})});
 const before=await primed(ui),expected=projected(world,before,LINSUI,'item_oat_flatbread',2),r=await ui.choose('trade.buy',{item:'item_oat_flatbread',quantity:2},{target:LINSUI});assert.ok(r.ok,r.error);
 const after=await ui.read();
 assert.equal(r.result.cost,expected.totalCoins);assert.equal(before.state.player.coins,50);assert.equal(after.state.player.coins,50-expected.totalCoins,'①按实付总额扣款');
 // Opening food scarcity .5; 6 × .5 × 2, all other factors 1 = 6.
 assert.equal(r.result.cost,6);
 assert.equal(held(after.state.inventory,'item_oat_flatbread')-held(before.state.inventory,'item_oat_flatbread'),2,'②背包 +2 个月饼');
 const engine=new WorldEngine(world);assert.ok(standing(engine,after.state,LINSUI,'player')>=standing(engine,before.state,LINSUI,'player'),'④在场村民对玩家的好感没有下降（题面“可小幅上升”，不变也符合）');
 conserved(before,after,'D35',engine);
});
test('D35.2 true riddle answer transfers one host-stock lantern, preserves two bought mooncakes and cannot award twice',async t=>{
 const HOST=LINSUI,FESTIVAL='festival_daily_lantern';
 const world=variant(w=>{setPrice(w,'item_oat_flatbread',6);w.festivals=[{id:FESTIVAL,name:'Lantern riddles',calendar:{month:8,day:15},venue:{location:INN,precision:'existing_location'},custom:'Riddles at the inn',resourceNeeds:[],runtime:{status:'active',host:HOST,kind:'market',startMinute:19*60,durationMinutes:120,minimumParticipants:1,riddles:[{id:'moon',question:'A round mirror in the sky',answers:['moon'],reward:{item:'item_lantern',quantity:1}}]}}];const host=w.npcs.find(n=>n.id===HOST);host.schedule={default:[{start:0,end:1440,location:INN,activity:'market',services:['trade']}]};});
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(8,15,18,0),s=>{s.player.coins=50;s.npcs[HOST].trust=100;s.npcs[HOST].inventory.item_lantern=stack(1);})});
 // S5-02: the riddle examines original reward stock, not a forced old price.
 const before=await primed(ui),expected=projected(world,before,HOST,'item_oat_flatbread',2),buy=await ui.choose('trade.trade',{seller:HOST,item:'item_oat_flatbread',quantity:2},{target:HOST,search:true});assert.ok(buy.ok,buy.error);assert.equal(buy.result.cost,expected.totalCoins);
 // trust=100 → regard 100; weighted .7 gives relation .895.
 // 6*.5*1*.895*2 = 5.37 → 5; other factors 1.
 assert.equal(buy.result.cost,5);
 const plan=await ui.choose('settlement.festival_plan',{festival:FESTIVAL,cost:0},{search:true});assert.ok(plan.ok,plan.error);const id=plan.result.festival;
 const permission=await ui.choose('settlement.festival_authorize',{festival:id,speaker:HOST},{search:true});assert.ok(permission.ok,permission.error);assert.equal(permission.result.agreement.decision.outcome,'agree');
 const join=await ui.choose('settlement.festival_join',{festival:id,speaker:'player'},{search:true});assert.ok(join.ok,join.error);const wait=await ui.choose('time',{until:{dayOffset:0,hour:19}});assert.ok(wait.ok,wait.error);
 const heldEvent=await ui.read();assert.equal(heldEvent.state.records[id].status,'held');
 const wrong=await ui.choose('settlement.festival_answer',{festival:id,request:'moon',choice:'sun'},{search:true});assert.ok(wrong.ok,wrong.error);assert.equal(wrong.result.correct,false);assert.equal(held((await ui.read()).state.npcs[HOST].inventory,'item_lantern'),1);
 const pre=await ui.read();
 const inspected=await new WorldEngine(world).reduce(pre,{tool:'world_settlement',args:{operation:'festival_inspect'},eventId:'d35-inspect'}),visible=inspected.result.calendar.find(f=>f.publishedId===FESTIVAL).runtime.riddles[0];
 assert.equal(visible.question,'A round mirror in the sky');assert.equal(visible.answers,undefined,'public festival inspection must not disclose the host answer');
 const slots={festival:id,request:'moon',choice:'moon'},win=await ui.choose('settlement.festival_answer',slots,{search:true,eventId:'d35-prize'});assert.ok(win.ok,win.error);const after=await ui.read();
 assert.equal(win.result.correct,true);assert.equal(held(after.state.inventory,'item_lantern')-held(pre.state.inventory,'item_lantern'),1);assert.equal(held(after.state.npcs[HOST].inventory,'item_lantern'),0);assert.equal(held(after.state.inventory,'item_oat_flatbread'),2);assert.equal(after.state.player.coins,50-expected.totalCoins);assert.equal(after.state.minute,pre.state.minute);conserved(before,after,'D35 riddle',new WorldEngine(world));
 const retry=await ui.choose('settlement.festival_answer',slots,{search:true,eventId:'d35-prize'});assert.ok(retry.ok,retry.error);assert.deepEqual(await ui.read(),after);
 const again=await ui.choose('settlement.festival_answer',slots,{search:true});assert.equal(again.ok,false);assert.deepEqual(await ui.read(),after);
});
test.todo('D35 ③节庆只在八月十五当晚出现，次日恢复平常——引擎有按历法日期运行的节庆（festival-runtime.test.mjs），但没有中秋灯会与摊位的节庆数据（C1 内容接入；摊位随节庆开闭属 S4 营业时间 schedule 表）');
test.todo('D35 ④好感可小幅上升——引擎无参节庆的立场事件（S6 立场事件权重表 event-weights 增 attend_festival 行后读表）');
test.todo('D35 lantern-festival end-to-end content remains: festival_watch now consumes a real held event endsAt (A3 integration covered), while the specific eighth-month fifteenth lantern event and award data are still absent');

async function cookFish(t){
 // 鲫鱼汤→清煮鱼汤配方（鱼 1 水 2 盐 1 柴 1）；柴→干木刨屑；秋季九月初三酉时；玩家有鱼 2、盐 3、柴 3、水 2。
 const world=variant(),engine=new WorldEngine(world),recipe=world.recipes.find(r=>r.id==='recipe_w3_fish_broth');
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(9,3,17,30),s=>{
  s.inventory.item_fish=stack(2);s.inventory.item_salt=stack(3);s.inventory.item_wood_shavings=stack(3);s.inventory.item_water=stack(2);
  for(const id of recipe.tools)s.inventory[id]=tool('铁');
  s.skills.skill_life_3_core={proficiency:300,daily:{},breakthroughs:[]};s.recipes={...s.recipes,recipe_w3_fish_broth:{source:{type:'teacher',id:LINSUI}}};
 })});
 const before=await primed(ui),r=await ui.choose('craft.manufacture',{recipe:'recipe_w3_fish_broth'},{eventId:safeEventId('d16')});assert.ok(r.ok,r.error);
 const after=await ui.read();return {world,engine,recipe,ui,before,r,after};
}
test('D16 做饭 ①②③④：清煮鱼汤按配方扣鱼1、水2、盐1、柴1，成品入背包，盐包没用完；耗时等于配方',async t=>{
 const {recipe,before,r,after}=await cookFish(t),inv=(s,id)=>held(s.state.inventory,id);
 assert.equal(r.result.success,true,'检定通过（高熟练度）');
 assert.equal(inv(before,'item_fish')-inv(after,'item_fish'),1,'①鲫鱼按菜谱用量减少（2→1）');
 assert.equal(inv(before,'item_wood_shavings')-inv(after,'item_wood_shavings'),1,'②柴减少 1 份');
 assert.equal(inv(before,'item_salt')-inv(after,'item_salt'),1,'③盐用量减少');assert.ok(inv(after,'item_salt')>0,'③盐包没用完');
 assert.equal(inv(after,'item_fish_broth')-inv(before,'item_fish_broth'),1,'④背包 +1 份鱼汤');
 assert.equal(inv(before,'item_water')-inv(after,'item_water'),2);
 assert.equal(after.state.minute-before.state.minute,recipe.minutes,'耗时 = 配方登记的制作分钟');
 assert.equal(after.state.player.coins,before.state.player.coins-3,'灶台是酒馆的，付 3 文灶台费');
});
test('D16 ⑤半个时辰为60分钟，真实配方与执行回执一致',async t=>{
 // events.md D16.5: 时间过去约半个时辰 = 60 分钟（一时辰 2 小时，A3-astra-plan 第四节 D16.5）；配方 minutes 是依据，其余断言都从配方派生。
 const {recipe,before,r,after}=await cookFish(t);assert.equal(recipe.minutes,60);
 assert.equal(after.state.minute-before.state.minute,recipe.minutes);assert.equal(r.result.spent.minutes,recipe.minutes);
});
test('D16 ④成品可实际食用，鱼汤消耗而饱食增加',async t=>{
 const {ui,after}=await cookFish(t),r=await ui.choose('eat.meal',{item:'item_fish_broth'});assert.ok(r.ok,r.error);
 const eaten=await ui.read();assert.equal(held(after.state.inventory,'item_fish_broth')-held(eaten.state.inventory,'item_fish_broth'),1);
 assert.ok(eaten.state.player.body.satiety.value>after.state.player.body.satiety.value);
});
