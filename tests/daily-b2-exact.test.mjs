// 日常题集第二批（DAILY 卡）：A1 已有关系型测试的日常题，按题面数值再落一遍精确断言（世界副本改价、改作息、改路程，开局存档写场景）。
// A1 的 a1-daily-probes.test.mjs 保持不动；这里只补它没有断言到的题面数值。引擎做不到的条目写 test.todo，注明缺的机制与阶段。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {variant,setPrice,openShop,scene,stack,tool,monthDayMinute,conserved,primed,held,legacy,dieOf,baseEngine,SEED,DAY,replayed} from './helpers/daily-b2.mjs';

const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',HOUR=60;

test('D01 买馒头：基准4文、市场零售2文，100文买3个剩94文，钱货守恒，约5分钟不跨时辰',async t=>{
 // 馒头→面包（item_bread）4 文；早点铺→青灯酒馆，辰初开柜；春季三月初五辰时；玩家 100 文。
 const world=variant(w=>{setPrice(w,'item_bread',4);openShop(w,LINSUI,INN,7*HOUR,19*HOUR);});
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(3,5,7,30),s=>{s.player.coins=100;s.npcs[LINSUI].inventory.item_bread=stack(8);s.inventory={...s.inventory};delete s.inventory.item_bread;})});
 // S5-02: household reserves 4 of 8; base4 * scarcity.5 * depth/grade/standing1 * 3 = 6, one truncation.
 const before=await primed(ui),r=await ui.choose('trade.buy',{item:'item_bread',quantity:3},{target:LINSUI});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(before.state.player.coins,100);assert.equal(after.state.player.coins,94,'①100→94');
 assert.equal(held(after.state.inventory,'item_bread'),3,'②背包 +3，不是 1');
 assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,6,'③钱柜 +6');
 assert.equal(held(before.state.npcs[LINSUI].inventory,'item_bread')-held(after.state.npcs[LINSUI].inventory,'item_bread'),3,'④库存 −3');
 const spent=after.state.minute-before.state.minute;assert.equal(spent,5,'⑤约 5 分钟');assert.equal(Math.floor(before.state.minute%DAY/120),Math.floor(after.state.minute%DAY/120),'⑤不跨时辰');
 conserved(before,after,'D01',new WorldEngine(world));
});

test('D02 卖兽皮：基准6文、供需0.5、收购价差0.6，五张共9文，玩家20→29、钱柜300→291',async t=>{
 // 兔皮→生皮（item_rawhide）6 文；杂货铺赵四→林穗，钱柜 300；秋季九月十二午时；玩家 20 文。
 const world=variant(w=>{setPrice(w,'item_rawhide',6);openShop(w,LINSUI,INN,7*HOUR,19*HOUR);});
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(9,12,12,0),s=>{s.player.coins=20;s.inventory.item_rawhide=stack(5,{weight:0.5});s.npcs[LINSUI].coins=300;})});
 // S5-02: base6 * scarcity.5 * buy spread.6 * depth/grade/standing1 * 5 = 9 copper.
 const before=await primed(ui),r=await ui.choose('trade.sell_to',{item:'item_rawhide',quantity:5},{target:LINSUI});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(after.state.player.coins,29,'①20→29');assert.equal(held(after.state.inventory,'item_rawhide'),0,'②兔皮 5→0');
 assert.equal(after.state.npcs[LINSUI].coins,291,'③钱柜 300→291（确实从钱柜扣）');
 assert.equal(held(after.state.npcs[LINSUI].inventory,'item_rawhide')-held(before.state.npcs[LINSUI].inventory,'item_rawhide'),5,'④库存 +5');
 conserved(before,after,'D02',new WorldEngine(world));
});
test.todo('D02 ⑤按收购价（6 文）而非零售价计算——引擎同一件货买卖同价（一个 basePrice，没有收购/零售价差），无法区分“按零售价多给”这一易错；缺 side 参数的市场投影（S5：settlePrice(side: buy | sell)，spread.buy）');

test('D04 住店一晚 ①②③：单间 40 文/晚，120→80，客栈钱柜 +40，只扣一晚，睡到次日卯时（约 9 小时），随身物品不变',async t=>{
 // 来福客栈单间 40 文→青灯酒馆客房改价 40；秋季九月二十戌时；玩家 120 文。
 const world=variant(w=>{const l=w.locations.find(x=>x.id===INN);l.lodging={...l.lodging,nightlyCopper:40};});
 const start=monthDayMinute(9,20,20,0),ui=await uiSession(t,{world,mutate:scene(INN,start,s=>{s.player.coins=120;s.player.hp=5;})});
 const before=await primed(ui),rent=await ui.choose('trade.lodge',{days:1});assert.ok(rent.ok,rent.error);
 const woke=await ui.choose('time.sleep',{until:{dayOffset:1,hour:5}});assert.ok(woke.ok,woke.error);const after=await ui.read();
 assert.equal(before.state.player.coins,120);assert.equal(after.state.player.coins,80,'①120→80（只扣一晚）');
 assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,40,'②客栈钱柜 +40');
 assert.equal(after.state.minute-start,9*HOUR,'③约 9 小时，到次日卯时');assert.match(baseEngine.calendar(after.state.minute).text,/雁月 21日 05:00/);
 assert.deepEqual(after.state.inventory,before.state.inventory,'随身物品不凭空消失');
 conserved(before,after,'D04',new WorldEngine(world));
});
test('D04.4 public paid lodging sleeps a full 540 minutes and recovers capped stamina, charging the room once',async t=>{
 const world=variant(w=>{w.locations.find(l=>l.id===INN).lodging.nightlyCopper=40;}),start=monthDayMinute(9,20,20,0);
 const ui=await uiSession(t,{world,mutate:scene(INN,start,s=>{s.player.coins=120;s.player.body={stamina:{value:30,asOf:start,activity:'rest'},satiety:{value:100,asOf:start,activity:'rest'}};})});
 const before=await primed(ui),room=await ui.choose('trade.lodge',{days:1});assert.ok(room.ok,room.error);assert.equal(room.result.cost,40);
 const bed=await ui.read(),sleep=await ui.choose('time.sleep',{until:{dayOffset:1,hour:5,minute:11}});assert.ok(sleep.ok,sleep.error);const after=await ui.read();
 assert.equal(after.state.minute-bed.state.minute,540);assert.equal(sleep.result.cost.sleep.minutes,540);assert.equal(sleep.result.cost.sleep.coveredMinutes,540);assert.equal(after.state.player.body.stamina.value,100);assert.equal(after.state.player.coins,80);assert.equal(after.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,40);assert.deepEqual(after.state.inventory,before.state.inventory);conserved(before,after,'D04.4',new WorldEngine(world));
});
test.todo('D04 ⑤该单间当晚被占用，其他住客不能再订同一间——引擎客房只有“间数”(rooms: 3)，无住客占位，NPC 不入住：缺 lodges 持有与 capacity 派生（S2 持有）');

test('D06 赶路：20 里、10 里/时辰，卯时出发约 4 小时后到巳时；位置变柳溪村，钱物不变，青石村照常运转',async t=>{
 // 青石村→河湾村，柳溪村→白石镇；题面速度 10 里/时辰 = 2.5 公里/小时，20 里 = 10 公里（世界副本：步行速度、路程）；春季三月初十卯时。
 const world=variant(w=>{w.rules.travel.walkKmh=2.5;w.routes.find(r=>r.id==='route_hw_bs').lengthKm=10;});
 const ui=await uiSession(t,{world,mutate:scene('loc_hw',monthDayMinute(3,10,5,0),s=>{s.player.coins=40;s.inventory.item_ration=stack(3);})});
 const before=await primed(ui),r=await ui.choose('move',{destination:'loc_bs'},{target:'loc_bs'});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(r.result.minutes,4*HOUR,'①20 里 ÷ 10 里/时辰 = 4 小时');
 const hour=Math.floor(after.state.minute%DAY/HOUR);assert.ok(hour>=9&&hour<11,`①到达钟点 ${hour} 点，属巳时`);
 assert.equal(after.state.location,'loc_bs','②位置更新');
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory,'④钱物不变');
 assert.ok(Object.keys(after.state.npcs).some(id=>after.state.npcs[id].location!==before.state.npcs[id]?.location||after.state.npcs[id].activity!==before.state.npcs[id]?.activity),'⑤出发村照常运转，没有冻结');
});
test.todo('D06 ③体力下降（步行 4 小时，未降到 0）——引擎没有体力：缺 body.stamina（S1 vital；A3 move 的 cost.body 读 body.json drainPerHour.travel 5/小时 → 100→80）');

test('D19 拜师学技能 ①②⑤：学费 100（150→50）给师傅 +100，学会后配方入册，师傅好感不降',async t=>{
 // 猎户老韩教设陷阱→木匠阿砚教削制木楔（recipe_wooden_pegs，世界副本把学费改为 100）；春季三月二十辰时；玩家 150 文。
 const MILL='bld_hw_mill',AYAN='npc_hw_ayan',world=variant(w=>{w.recipes.find(r=>r.id==='recipe_wooden_pegs').learnFee=100;w.npcs.find(n=>n.id===AYAN).schedule={default:[{start:0,end:420,location:MILL,activity:'睡眠',services:[]},{start:420,end:1080,location:MILL,activity:'授艺',services:['trade','teach']},{start:1080,end:1440,location:MILL,activity:'睡眠',services:[]}]};});
 let event=null;for(let k=0;k<400&&!event;k++){if(dieOf(SEED,`d19-${k}`)>=16&&dieOf(SEED,`d19-${k}`)<20)event=`d19-${k}`;}
 const ui=await uiSession(t,{world,mutate:scene(MILL,monthDayMinute(3,20,9,0),s=>{s.player.coins=150;s.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};Object.assign(s.npcs[AYAN],{location:MILL,activity:'工作',status:'正常'});})});
 const before=await primed(ui),r=await ui.choose('learn',{entity:'recipe_wooden_pegs',source:AYAN,kind:'recipe'},{search:true,eventId:event});assert.ok(r.ok,r.error);const after=await ui.read();
 assert.equal(r.result.success,true);assert.equal(before.state.player.coins,150);assert.equal(after.state.player.coins,50,'①150→50');
 assert.equal(after.state.npcs[AYAN].coins-before.state.npcs[AYAN].coins,100,'②师傅 +100');
 assert.ok(after.state.recipes.recipe_wooden_pegs,'学会后入册');
 assert.ok(standing(baseEngine,after.state,AYAN,'player')>=standing(baseEngine,before.state,AYAN,'player'),'⑤师傅好感不降');
 conserved(before,after,'D19',new WorldEngine(world));
});
test('D19.3 public three-day service course charges tuition once and credits only real daily lessons',async t=>{
 const TEACHER='npc_hw_ayan',PLACE='bld_hw_mill',ENTITY='recipe_wooden_pegs';
 const world=variant(w=>{const r=w.recipes.find(r=>r.id===ENTITY);r.learnFee=100;r.learnMinutes=270;r.learnDays=3;w.npcs.find(n=>n.id===TEACHER).schedule={default:[{start:0,end:420,location:PLACE,activity:'sleep',services:[]},{start:420,end:1080,location:PLACE,activity:'teach',services:['teach','trade']},{start:1080,end:1440,location:PLACE,activity:'sleep',services:[]}]};});
 const ui=await uiSession(t,{world,mutate:scene(PLACE,monthDayMinute(3,20,9,0),s=>{s.player.coins=150;s.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};Object.assign(s.npcs[TEACHER],{location:PLACE,activity:'teach',trust:100});})});
 const before=await primed(ui),slots={entity:ENTITY,source:TEACHER,kind:'recipe'},receipts=[];
 for(let day=0;day<3;day++){
  if(day){const wait=await ui.choose('time',{until:{dayOffset:1,hour:9,minute:1}});assert.ok(wait.ok,wait.error);}
  let event;for(let k=0;k<400;k++)if(dieOf(SEED,`d19-course-${day}-${k}`)>=16&&dieOf(SEED,`d19-course-${day}-${k}`)<20){event=`d19-course-${day}-${k}`;break;}
  const pre=await ui.read(),r=await ui.choose('learn',slots,{search:true,eventId:event});assert.ok(r.ok,r.error);receipts.push(r.result);const now=await ui.read();assert.equal(now.state.minute-pre.state.minute,90);assert.equal(r.result.cost,day===0?100:0);
  const course=now.state.records[r.result.course],service=now.state.obligations[r.result.service];assert.equal(service.kind,'service');assert.equal(service.debtor,TEACHER);assert.equal(service.creditor,'player');assert.equal(course.lessons.length,day+1);assert.equal(course.minutes,(day+1)*90);
  assert.equal(Boolean(now.state.recipes[ENTITY]),day===2);assert.equal(r.result.complete,day===2);
  const retry=await ui.choose('learn',slots,{search:true,eventId:event});assert.ok(retry.ok,retry.error);assert.deepEqual(await ui.read(),now);
  const bad=await ui.choose('learn',slots,{search:true});assert.equal(bad.ok,false);assert.deepEqual(await ui.read(),now);
 }
 const after=await ui.read();assert.equal(after.state.player.coins,50);assert.equal(after.state.npcs[TEACHER].coins-before.state.npcs[TEACHER].coins,100);assert.ok(after.state.minute-before.state.minute>=2*DAY);assert.ok(after.state.minute-before.state.minute<3*DAY);assert.equal(after.state.obligations[receipts[0].service].endReason,'fulfilled');conserved(before,after,'D19 course',new WorldEngine(world));
 const failed=await uiSession(t,{world,mutate:scene(PLACE,monthDayMinute(3,20,9,0),s=>{s.player.coins=250;s.skills.skill_life_6_core={proficiency:120,daily:{},breakthroughs:[]};Object.assign(s.npcs[TEACHER],{location:PLACE,activity:'teach',trust:100});})});
 await primed(failed);let failedCourse;
 for(let day=0;day<3;day++){
  if(day)assert.ok((await failed.choose('time',{until:{dayOffset:1,hour:9,minute:1}})).ok);
  let event;for(let k=0;k<400;k++)if(dieOf(SEED,`d19-failed-${day}-${k}`)===(day===2?1:20)){event=`d19-failed-${day}-${k}`;break;}
  failedCourse=await failed.choose('learn',slots,{search:true,eventId:event});assert.ok(failedCourse.ok,failedCourse.error);
 }
 const ended=await failed.read();assert.equal(ended.state.player.coins,150);assert.equal(failedCourse.result.success,false);assert.equal(ended.state.recipes[ENTITY],undefined);assert.equal(ended.state.obligations[failedCourse.result.service].endReason,'fulfilled');
 const restart=await failed.choose('learn',slots,{search:true,eventId:lessonEvent(20,'d19-restart')});assert.ok(restart.ok,restart.error);const renewed=await failed.read();assert.equal(restart.result.cost,100);assert.equal(renewed.state.player.coins,50);assert.notEqual(restart.result.service,failedCourse.result.service);assert.equal(renewed.state.records[restart.result.course].lessons.length,1);assert.equal(renewed.state.recipes[ENTITY],undefined);await replayed(failed,renewed);
});
function lessonEvent(roll,prefix){for(let k=0;k<400;k++)if(dieOf(SEED,`${prefix}-${k}`)===roll)return `${prefix}-${k}`;throw Error('no deterministic lesson event');}
test.todo('D19 ④技能列表新增“设陷阱（入门）”——引擎教的是配方/技能条目（本例入册的是配方）；设陷阱技能与入门阶的获得阈值没有数据，“学满 3 天恰好到入门”无法判定：缺 learning.json 的 taught 课时与入门阈值的消费（S1 learn 原语读表；缺省 perHour.taught 3.4 已在表）');
