// 日常题集第二批（DAILY 卡）：续 daily-b2-exact.test.mjs——天黑、钓鱼、制作、存取钱、睡觉、宠物、存读档。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {readBodyNeed} from '../server-plugin/primitives-body.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {variant,setPrice,openShop,scene,stack,tool,monthDayMinute,conserved,primed,held,legacy,dieOf,baseEngine,baseWorld,SEED,DAY,replayed} from './helpers/daily-b2.mjs';

const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',FORGE='bld_hw_forge',SMITH='npc_hw_duanyan',HOUR=60;

test('D08 天黑了：酉时末杂货铺（辰时至酉时营业）已关门不能交易，钱物不变；次日辰时再来能买；街上没人',async t=>{
 // 杂货铺→铁匠铺（段岩），营业改为辰初到酉初（07:00–17:00，区间左闭右开）；秋季九月二十五，申时到酉时末，本季日落 16:42。
 const world=variant(w=>openShop(w,SMITH,FORGE,7*HOUR,17*HOUR));
 const ui=await uiSession(t,{world,mutate:scene('loc_hw',monthDayMinute(9,25,15,30),s=>{s.player.coins=100;})});
 const before=await primed(ui);
 await ui.choose('time',{until:{dayOffset:0,hour:18,minute:50}});
 const walk=await ui.choose('move',{destination:FORGE},{target:FORGE});assert.ok(walk.ok,walk.error);
 const dusk=await ui.read(),sun=await ui.choose('weather.inspect',{});
 assert.equal(sun.result.weather.daylight,false,'①此刻已过日落（天色已暗）');
 const closed=await ui.choose('trade.buy',{seller:SMITH,item:'item_iron_nail',quantity:2},{target:SMITH,search:true});
 assert.equal(closed.ok,false);assert.match(closed.error,/不提供交易服务/,'②杂货铺已关门，无法交易');assert.match(closed.error,/07:00/,'说明何时再开');
 assert.equal((await ui.read()).state.player.coins,100,'⑤玩家铜钱不变');assert.deepEqual((await ui.read()).state.inventory,before.state.inventory,'⑤背包不变');
 const outdoors=Object.entries(dusk.state.npcs).filter(([id,n])=>n.location==='loc_hw'&&id!==SMITH);assert.equal(outdoors.length,0,'③街上没有村民在逛');
 await ui.choose('time',{until:{dayOffset:1,hour:7,minute:30}});
 const morning=await ui.choose('trade.buy',{item:'item_iron_nail',quantity:2},{target:SMITH});assert.ok(morning.ok,morning.error);
 assert.equal((await ui.read()).state.player.coins,100-morning.result.cost,'④次日辰时可正常交易');
});
test.todo('D08 ①叙述反映天色已暗（黄昏/入夜）——引擎有昼夜数据（weather.inspect 的 daylight: false），但场景头只写“18:50｜晴｜14℃”，不带昼夜/日落标记：缺场景头与感官素材按季节 × 时段的投影（06 §6.9.4；A3 场景投影，S6 空间投影 scene()）');

test('D15 钓鱼 ①③④⑤：一个时辰钓到 3 条鲫鱼 → 背包 +3 条，溪中鲫鱼存量 −3，约 2 小时，鱼种与淡水小溪相符',async t=>{
 // 鲫鱼→薄鳞银鲫（旧渡口河滩）；一次抛竿 30 分钟、一个时辰四竿；挑一组事件编号让四竿恰中三条（检定骰点由战役种子与事件编号确定）。夏季七月初二卯时。
 const DOCK='loc_hw_dock',HABITAT='habitat_hw_water',SPECIES='monster_silver_crucian',start=monthDayMinute(7,2,6,0);
 const difficulty=baseEngine.rules.extraction.fishing.difficultyBySeason[baseEngine.calendar(start).season];
 const hit=id=>{const roll=dieOf(SEED,id);return roll!==1&&(roll===20||roll>=difficulty);};
 let prefix=null;for(let k=0;k<400&&!prefix;k++){const hits=[0,1,2,3].filter(c=>hit(`d15-${k}-${c}`)).length;if(hits===3)prefix=`d15-${k}`;}
 assert.ok(prefix,'找到四竿恰中三条的事件编号');
 // D05 §5.5 / 已审 S505 绑定：竹竿替代剖洗刀，蚯蚓替代谷粒饵，捕获物是活鱼；四竿三中仍是3条、120分钟和4次磨损。
 const ui=await uiSession(t,{mutate:scene(DOCK,start,(s,doc)=>{
  const loaded=applyIntentSetup(baseEngine,doc,{inventory:{item_bamboo_fishing_rod:1,item_earthworm_bait:10}});
  assert.deepEqual(loaded.setupUnmet,[]);Object.assign(doc,loaded.document);
 })});
 const before=await primed(ui),count=s=>s.state.records[`ecology:${HABITAT}`].populations[SPECIES].count,others=s=>Object.fromEntries(Object.entries(s.state.records[`ecology:${HABITAT}`].populations).filter(([id])=>id!==SPECIES).map(([id,p])=>[id,p.count]));
 let catches=0;for(let c=0;c<4;c++){const r=await ui.choose('wildlife.fish',{species:SPECIES},{eventId:`${prefix}-${c}`});assert.ok(r.ok,r.error);if(r.result.success)catches++;}
 const after=await ui.read();
 assert.equal(catches,3);assert.equal(held(after.state.inventory,'item_live_fish')-held(before.state.inventory,'item_live_fish'),3,'①背包 +3 条（不是 1 或 5）');
 assert.equal(count(before)-count(after),3,'④溪中鲫鱼存量 −3');assert.deepEqual(others(after),others(before),'⑤只钓到淡水小溪里的这个鱼种');
 assert.equal(after.state.minute-before.state.minute,2*HOUR,'③约 2 小时（四竿 × 30 分钟）');
 assert.equal(before.state.inventory.item_bamboo_fishing_rod.durability-after.state.inventory.item_bamboo_fishing_rod.durability,4,'每竿用竹竿一次，耐久 −1');
});
test('D15.2 public fishing really consumes ten bait; an eleventh cast cannot fish without bait and rolls back',async t=>{
 // S505：谷粒饵配方仍按真实材料制作10份，但正式捕鱼只消耗蚯蚓；装备与10条蚯蚓是非考查前提。
 const ui=await uiSession(t,{mutate:scene(INN,monthDayMinute(7,2,9,0),(s,doc)=>{
  s.player.coins=100;s.inventory.item_kitchen_knife=tool();s.inventory.item_water=stack(20);s.inventory.item_oats=stack(1);delete s.inventory.item_fishing_bait;
  const loaded=applyIntentSetup(baseEngine,doc,{inventory:{item_bamboo_fishing_rod:1,item_earthworm_bait:10}});
  assert.deepEqual(loaded.setupUnmet,[]);Object.assign(doc,loaded.document);
 })});
 const opening=await primed(ui);let lesson,craft;
 for(let k=0;k<400;k++){if(dieOf(SEED,`bait-lesson-${k}`)>=16&&!lesson)lesson=`bait-lesson-${k}`;if(dieOf(SEED,`bait-craft-${k}`)===20&&!craft)craft=`bait-craft-${k}`;}
 const learned=await ui.choose('learn',{entity:'recipe_fishing_bait',source:LINSUI,kind:'recipe'},{search:true,eventId:lesson});assert.ok(learned.ok,learned.error);assert.equal(learned.result.success,true);
 const made=await ui.choose('craft.manufacture',{recipe:'recipe_fishing_bait'},{search:true,eventId:craft});assert.ok(made.ok,made.error);assert.equal(made.result.success,true);
 const supplied=await ui.read();assert.equal(held(supplied.state.inventory,'item_fishing_bait'),10);assert.equal(held(supplied.state.inventory,'item_oats'),0);assert.equal(supplied.ledger.flows['src:craft|item_fishing_bait|craft'],10);assert.equal(supplied.ledger.flows['sink:consume|item_oats|craft'],1);conserved(opening,supplied,'D15 bait preparation');
 const walk=await ui.choose('move',{destination:'loc_hw_dock'});assert.ok(walk.ok,walk.error);
 const before=await ui.read();for(let i=0;i<10;i++){const r=await ui.choose('wildlife.fish',{},{eventId:`d15-bait-${i}`});assert.ok(r.ok,r.error);}
 // 10竿 × 1蚯蚓=10，10×30分钟=300；谷粒饵10份不被冒充为钓饵消耗。
 const after=await ui.read();assert.equal(held(before.state.inventory,'item_earthworm_bait'),10);assert.equal(held(after.state.inventory,'item_earthworm_bait'),0);assert.equal(held(after.state.inventory,'item_fishing_bait'),10);assert.equal(after.ledger.flows['sink:consume|item_earthworm_bait|fishing_bait'],10);assert.equal(after.state.minute-before.state.minute,300);conserved(before,after,'D15 bait');
 const bad=await ui.choose('wildlife.fish',{});assert.equal(bad.ok,false);assert.deepEqual(await ui.read(),after);
 await replayed(ui,after);
 const retry=await ui.choose('wildlife.fish',{},{eventId:'d15-bait-9'});assert.ok(retry.ok,retry.error);assert.deepEqual(await ui.read(),after);
});

test('D17 制作木凳：木料 3→1、铁钉 8→4，背包 +1 个木凳（普通或粗糙），耗时 2 小时，木工熟练度小幅增加，工具耐久 −1',async t=>{
 // 木凳配方（木料 2、铁钉 4）→世界副本里加一条配方，做 1 个斜脚矮凳，工序 120 分钟（1 个时辰）；木匠铺→旧磨坊作台；春季四月十二午时。
 const MILL='bld_hw_mill',recipe={id:'recipe_d17_stool',name:'制作木凳（日常题）',aliases:[],scope:null,skill:'skill_life_6_core',minimumProficiency:0,minutes:120,difficulty:10,
  materials:[{item:'item_wood',amount:2},{item:'item_iron_nail',amount:4}],tools:['item_whittling_knife'],workstation:'woodworking',output:{item:'item_three_leg_stool',quantity:1},byproducts:[],
  learningRequired:true,learnFee:6,learnMinutes:90,teachers:['npc_hw_ayan'],toolWear:1,failure:{recoverFraction:0,injury:0},prerequisites:[],process:'按配方做一个木凳。'};
 const world=variant(w=>w.recipes.push(recipe));
 let event=null;for(let k=0;k<400&&!event;k++){const roll=dieOf(SEED,`d17-${k}`);if(roll>=10&&roll<=17)event=`d17-${k}`;}
 const ui=await uiSession(t,{world,mutate:scene(MILL,monthDayMinute(4,12,12,0),s=>{
  s.inventory.item_wood=stack(3,{weight:1});s.inventory.item_iron_nail=stack(8,{weight:0.02});s.inventory.item_whittling_knife=tool('铁');
  s.skills.skill_life_6_core={proficiency:150,daily:{},breakthroughs:[]};s.recipes={...s.recipes,[recipe.id]:{source:{type:'teacher',id:'npc_hw_ayan'}}};
 })});
 const before=await primed(ui),r=await ui.choose('craft.manufacture',{recipe:recipe.id},{eventId:event});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(r.result.success,true);
 assert.equal(held(before.state.inventory,'item_wood')-held(after.state.inventory,'item_wood'),2);assert.equal(held(after.state.inventory,'item_wood'),1,'①木料 3→1');
 assert.equal(held(after.state.inventory,'item_iron_nail'),4,'①铁钉 8→4');
 assert.equal(held(after.state.inventory,'item_three_leg_stool'),1,'②背包 +1 个木凳');assert.ok(['粗糙','普通'].includes(r.result.workmanship),`②入门技能做出的是${r.result.workmanship}档，不是精品`);
 assert.equal(after.state.minute-before.state.minute,120,'③耗时 2 小时（1 个时辰）');
 const gain=after.state.skills.skill_life_6_core.proficiency-before.state.skills.skill_life_6_core.proficiency;assert.ok(gain>0&&gain<=30,`④木工熟练度小幅增加 +${gain}`);
 assert.equal(before.state.inventory.item_whittling_knife.durability-after.state.inventory.item_whittling_knife.durability,1,'⑤工具耐久小幅下降');
 conserved(before,after,'D17',new WorldEngine(world));
});

test('D27 存钱 + D28 取钱（含利息）：存 1000（1200→200，账户 1000，库银 +1000），整三个月单利 15，取出本息 1015，账户归零，库银 −1015',async t=>{
 // D15 section 15.5: lending 1.25% * spread 0.4 = deposit 0.5%; fee 0; three 30-day periods.
 const POST='bld_hw_post',CLERK='npc_hw_shendu';
 // D15 §15.5: .0125 lending rate * .4 deposit spread = .005;
 // 1000 * .005 * 3 = 15. Preserve every original amount assertion.
 const world=variant(w=>{const c=w.rules.economy.credit;c.banks[0].depositFeeCopper=0;c.banks[0].rateTerms={base:0.0125,minRate:0.0125,maxRate:0.0125};c.banks[0].depositSpread=0.4;
  // 三个月里掌柜不能无故病倒（随机疾病关掉），柜台才一直有人。
  w.rules.npcLife.health={...w.rules.npcLife.health,bands:[{fromAge:0,illnessPerYear:0,graveShare:0,suddenDeathPerYear:0}]};});
 const ui=await uiSession(t,{world,mutate:scene(POST,monthDayMinute(3,1,9,30),s=>{s.player.coins=1200;})});
 const before=await primed(ui),bank=s=>Object.values(s.state.records).find(r=>r.category==='bank'),vault=s=>bank(s)?.coins??world.rules.economy.credit.banks[0].reserveCopper,account=s=>bank(s)?.accounts.player??0;
 const dep=await ui.choose('trade.deposit',{coins:1000});assert.ok(dep.ok,dep.error);const mid=await ui.read();
 assert.equal(mid.state.player.coins,200,'D27①1200→200');assert.equal(account(mid),1000,'D27②账户余额 1000');assert.equal(vault(mid)-vault(before),1000,'D27④钱庄库银 +1000');
 conserved(before,mid,'D27',new WorldEngine(world));
 const wait=await ui.choose('time',{minutes:90*DAY});assert.ok(wait.ok,wait.error);assert.equal(wait.result.segments,3,'三个月：A1b 起 world_act 自动拆成 3 段 30 天');

 const look=await ui.choose('trade.bank_inspect',{});assert.ok(look.ok,look.error);
 const pre=await ui.read();assert.equal(account(pre),1015,'D28①利息 = 1000 × 0.5% × 3 = 15');
 const out=await ui.choose('trade.withdraw',{coins:1015});assert.ok(out.ok,out.error);const after=await ui.read();
 assert.equal(after.state.player.coins-pre.state.player.coins,1015,'D28②身上铜钱 +1015');assert.equal(account(after),0,'D28③账户余额归零');assert.equal(vault(pre)-vault(after),1015,'D28④钱庄库银 −1015');
 conserved(pre,after,'D28',new WorldEngine(world));
});
test.todo('D27 ③玩家获得存单/凭据一份；D28 ⑤存单收回/作废、无单不能取——引擎存款只记在钱庄账户上（accounts.player），没有存单物品，取款不要求出示：缺“票据 = 义务 + 代表物品”（S3）');
test('D27.5 public deposit consumes 15 minutes and rejected overdraft rolls back',async t=>{
 const ui=await uiSession(t,{mutate:scene('bld_hw_post',monthDayMinute(3,1,9,30),s=>{s.player.coins=1200;})});
 const before=await primed(ui),r=await ui.choose('trade.deposit',{coins:1000});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.minute-before.state.minute,15);assert.equal(after.state.player.coins,200);conserved(before,after,'D27 time');await replayed(ui,after);
 const bad=await ui.choose('trade.deposit',{coins:1000});assert.equal(bad.ok,false);assert.deepEqual(await ui.read(),after);
});

test('D33 休息睡觉 ①④⑤：亥时睡到次日卯时 8 小时，夜里村子照常运转，钱物不变',async t=>{
 // 冬季十一月二十亥时（22:00），睡自家床→青灯酒馆客房；玩家 100 文。
 const start=monthDayMinute(11,20,22,0);
 const ui=await uiSession(t,{mutate:scene(INN,start,s=>{s.player.coins=100;s.player.hp=3;})});
 const before=await primed(ui),r=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6}});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.minute-start,8*HOUR,'①约 8 小时到次日卯时');
 assert.ok(Object.keys(after.state.npcs).some(id=>after.state.npcs[id].location!==before.state.npcs[id].location||after.state.npcs[id].activity!==before.state.npcs[id].activity),'④夜里其他人的日程照常推进');
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory,'⑤钱物不变');
});
test('D33.2 public eight-hour paid sleep restores stamina 20 to 100 and consumes eight satiety, with no second room charge',async t=>{
 const start=monthDayMinute(11,20,20,0),ui=await uiSession(t,{mutate:scene(INN,start,s=>{s.player.coins=100;s.player.body={stamina:{value:20,asOf:start,activity:'rest'},satiety:{value:100,asOf:start,activity:'rest'}};})});
 await primed(ui);const room=await ui.choose('trade.lodge',{days:1});assert.ok(room.ok,room.error);assert.ok((await ui.choose('time',{until:{dayOffset:0,hour:22}})).ok);const before=await ui.read(),satiety=readBodyNeed(baseEngine,before,'player','satiety');
 const r=await ui.choose('time.sleep',{until:{dayOffset:1,hour:6,minute:0}});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.minute-before.state.minute,480);assert.equal(r.result.cost.sleep.coveredMinutes,480);assert.equal(readBodyNeed(baseEngine,after,'player','stamina'),100);assert.ok(Math.abs(readBodyNeed(baseEngine,after,'player','satiety')-(satiety-8))<.0002);assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory);conserved(before,after,'D33.2');
});

test('D34 养宠物与喂食：骨头 2→1，饱食度 30→60（饥饿 70→40），忠诚度不降，几分钟，阿黄仍在身边；放着不喂会重新饿',async t=>{
 // 阿黄→登记驯养伙伴；骨头→干粮（可喂食，缓饥 30）；春季四月十五；饱食度 30 = 饥饿 70。
 const pet='monster_m4r_pet';
 const ui=await uiSession(t,{mutate:scene(INN,monthDayMinute(4,15,10,0),s=>{
  s.created[pet]={id:pet,name:'阿黄',aliases:[],template:0,levelRange:[1,1],tamingRule:{category:'support',minimumSkill:100,minimumPlayerLevel:1,trustThreshold:20,minutes:60,difficulty:10,food:[{item:'item_ration',hungerRelief:30,trustGain:5}],skills:[],rideable:false}};
  s.creatures={...s.creatures,[pet]:{name:'阿黄',location:s.location,hp:30,maxHp:30,level:1,status:'正常',owner:'player',care:{version:1,hunger:70,fatigue:0,mood:60,loyalty:60,sickness:false,sickHours:0,neglectHours:0,nextTick:s.minute+60,bond:30,feedDay:-1,skills:{},experience:0}}};
  s.pets={...s.pets,[pet]:{petFormat:1,creature:pet,category:'support',status:'活跃'}};s.inventory.item_ration=stack(2);
 })});
 const before=await primed(ui),r=await ui.choose('pet.feed',{target:pet,item:'item_ration'},{search:true});assert.ok(r.ok,r.error);const after=await ui.read(),care=s=>s.state.creatures[pet].care;
 assert.equal(held(before.state.inventory,'item_ration')-held(after.state.inventory,'item_ration'),1,'①骨头 2→1');
 assert.equal(100-care(before).hunger,30);assert.equal(100-care(after).hunger,60,'②饱食度 30→60');
 assert.ok(care(after).loyalty>=care(before).loyalty,'③忠诚度小幅上升或不变');assert.equal(after.state.minute-before.state.minute,5,'④几分钟');
 assert.equal(after.state.creatures[pet].location,after.state.location,'⑤阿黄仍在身边');assert.equal(after.state.creatures[pet].status,'正常');
 await ui.choose('time',{minutes:DAY});assert.ok(care(await ui.read()).hunger>care(after).hunger,'饱食度随时间下降（放着不喂会重新饿）');
});

test('D39 存档读档后继续：五月二十午时，135 文、馒头 3 个、车前草 6 株的任务、阿黄饱食 50——导出再导入后逐字段一致，继续推进与原档一致',async t=>{
 const pet='monster_m4r_pet',HERBS='item_herb',CHEN='npc_hw_chenbai',start=monthDayMinute(5,20,12,0);
 const ui=await uiSession(t,{mutate:scene('loc_hw',start,s=>{
  s.player.coins=135;s.inventory.item_bread=stack(3);s.inventory[HERBS]=stack(6);Object.assign(s.npcs[CHEN],{location:'loc_hw',activity:'张贴告示',status:'正常'});
  s.quests={quest_d39:{id:'quest_d39',boardVersion:1,publisher:CHEN,personal:true,grade:'D',reward:40,escrow:40,objective:{type:'deliver',item:HERBS,quantity:10,location:'loc_hw'},content:'采 10 株车前草',location:'loc_hw',deadline:monthDayMinute(5,22,12,0),createdAt:monthDayMinute(5,17,12,0),status:'进行中',taker:'player'}};
  s.created[pet]={id:pet,name:'阿黄',aliases:[],template:0,levelRange:[1,1],tamingRule:{category:'support',minimumSkill:100,minimumPlayerLevel:1,trustThreshold:20,minutes:60,difficulty:10,food:[],skills:[],rideable:false}};
  s.creatures={...s.creatures,[pet]:{name:'阿黄',location:s.location,hp:30,maxHp:30,level:1,status:'正常',owner:'player',care:{version:1,hunger:50,fatigue:0,mood:60,loyalty:60,sickness:false,sickHours:0,neglectHours:0,nextTick:s.minute+60,bond:30,feedDay:-1,skills:{},experience:0}}};
  s.pets={...s.pets,[pet]:{petFormat:1,creature:pet,category:'support',status:'活跃'}};
 })});
 const saved=await primed(ui),stamp=Date.now();
 const bundle=await ui.server.api('export',{campaignId:ui.campaignId}),imported=await ui.server.api('import',{bundle});
 await new Promise(resolve=>setTimeout(resolve,300));      // 现实里“稍后”读档：世界不按现实时间推进
 const loaded=(await ui.server.api('read',{campaignId:imported.reference.campaignId})).document;
 assert.deepEqual(loaded,saved,'读档后整份存档逐字段一致');
 assert.equal(loaded.state.minute,saved.state.minute,'①时间仍是五月二十午时');
 assert.equal(loaded.state.player.coins,135);assert.equal(held(loaded.state.inventory,'item_bread'),3);assert.equal(held(loaded.state.inventory,HERBS),6,'②钱物一致');
 assert.equal(loaded.state.quests.quest_d39.status,'进行中');assert.equal(loaded.state.quests.quest_d39.deadline,saved.state.quests.quest_d39.deadline,'③任务进度与截止日期不变');
 assert.equal(100-loaded.state.creatures[pet].care.hunger,50,'④阿黄饱食度 50');assert.deepEqual(Object.fromEntries(Object.entries(loaded.state.npcs).map(([id,n])=>[id,[n.location,n.trust??0]])),Object.fromEntries(Object.entries(saved.state.npcs).map(([id,n])=>[id,[n.location,n.trust??0]])),'④NPC 位置与好感不变');
 const step=async campaignId=>{const view=await ui.server.api('read',{campaignId});await ui.server.api('execute',{campaignId,tool:'world_act',args:{action:'core:time',slots:{minutes:120}},eventId:'after-load',anchor:null,expectedSequence:view.reference.sequence});return (await ui.server.api('read',{campaignId})).document;};
 const original=await step(ui.campaignId),copy=await step(imported.reference.campaignId);
 assert.ok(original.state.minute>saved.state.minute,'⑤继续玩，世界从该时间点正常推进');assert.deepEqual(copy,original,'⑤读档后继续与原档继续一致');
 assert.ok(Date.now()-stamp>=300);
});
