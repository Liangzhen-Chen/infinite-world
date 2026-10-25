// 日常题集第二批（DAILY 卡）：赶路天气、传闻、任务、入会、过卡、战斗、诊疗、短离屏。
// 夹具与口径同 daily-b2-trade.test.mjs：题面数值落到世界副本/开局存档，断言来自题面；做不到的条目写 test.todo 并注明缺的机制与阶段。
import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {weatherAt} from '../server-plugin/weather.mjs';
import {standing} from '../server-plugin/standing.mjs';
import {monsterStats} from '../server-plugin/combat.mjs';
import {uiSession} from './helpers/ui-script.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {variant,item,setPrice,scene,stack,tool,monthDayMinute,conserved,primed,held,baseEngine,DAY} from './helpers/daily-b2.mjs';

const INN='bld_hw_qingdeng',LINSUI='npc_hw_linsui',HEZHOU='npc_hw_hezhou',CHENBAI='npc_hw_chenbai',GUCEN='npc_hw_gucen',VILLAGE='loc_hw',TOWN='loc_bs';

test('D09 下雨天赶路：雨天走同一段路比晴天慢（雨速系数）、出路路况与场景写雨，到达地天气与时间线一致',async t=>{
 // 夏季六月二十辰时青石村下雨 → 河湾村（loc_hw）该日按战役种子派生为雨；对照组取次日晴天同一时刻出发。
 const SEED9='daily-b2-d09-98',depart=monthDayMinute(6,20,7,0);
 const rainy=weatherAt(baseEngine,SEED9,VILLAGE,depart),clear=weatherAt(baseEngine,SEED9,VILLAGE,depart+DAY);
 assert.equal(rainy.kind,'rain');assert.equal(clear.kind,'clear');
 const go=async day=>{
  const ui=await uiSession(t,{mutate:scene(VILLAGE,monthDayMinute(6,day,7,0),(s,doc)=>{doc.randomSeed=SEED9;s.player.coins=40;s.inventory.item_ration=stack(3);})});
  const before=await ui.read(),menu=await ui.menu(),exit=menu.objects.exits.find(e=>e.id===TOWN);
  const sceneText=baseEngine.scene(before,'');
  const r=await ui.choose('move',{destination:TOWN},{target:TOWN});assert.ok(r.ok,r.error);
  const after=await ui.read(),arrival=await ui.choose('weather.inspect',{});
  return {before,after,exit,sceneText,r,arrival,ui};
 };
 const wet=await go(20),dry=await go(21);
 assert.equal(wet.exit.condition,'雨');assert.equal(dry.exit.condition,'晴');
 assert.match(wet.sceneText,/雨/,'①场景写明下雨');
 assert.ok(wet.r.result.minutes>dry.r.result.minutes,`②雨天耗时 ${wet.r.result.minutes} > 晴天 ${dry.r.result.minutes}`);
 assert.equal(wet.r.result.minutes,Math.round(dry.r.result.minutes*baseEngine.rules.weather.states.rain.walk),'②雨速系数来自天气表 states.rain.walk');
 assert.equal(wet.after.state.minute-wet.before.state.minute,wet.r.result.minutes);
 assert.equal(wet.after.state.location,TOWN);
 // ⑤到达后天气按区域实际时间线显示：与同一战役种子、同一区域、到达日的派生一致，且同一天的当地天气不因进出而改变。
 const rows=weatherAt(baseEngine,SEED9,TOWN,wet.after.state.minute);
 assert.equal(wet.arrival.result.weather.kind,rows.kind);assert.equal(wet.arrival.result.weather.day,Math.floor(wet.after.state.minute/DAY));
 assert.equal(weatherAt(baseEngine,SEED9,TOWN,depart).kind,wet.arrival.result.weather.kind,'⑤同一天同一区域，出门前与到达后读到同一天气');
 assert.deepEqual(wet.after.state.player.coins,wet.before.state.player.coins,'路上没有花费');
});
test.todo('D09 ③体力消耗比晴天多——引擎没有玩家体力（只有生命）：缺 body.stamina 闭式消耗（S1 vital 原语；A3 move 的 cost.body 读 body.json drainPerHour.travel 与雨天修正项）');
test.todo('D09 ④出现“淋湿”状态——引擎没有暴露状态：缺 core 反应规则 weather_exposure 与状态 wet（S5 修正槽与反应；附录 A §A.18 暴露状态行）');

// ---- D22 打听消息 / D38 听传闻：传闻种子按讲述者登记，听传闻是受校验的交谈（world_remember），固定 10 分钟 ----
const rumorWorld=(extra=[])=>variant(w=>{
 setPrice(w,'item_milk',5);
 w.rumors.push({id:'rumor_d22_ox',claim:'柳溪村东头前几天丢了一头牛。',truth:'true',source:HEZHOU,carriers:[HEZHOU],witnesses:[],fact:'偷牛的是东头的外乡脚夫，已经连夜出村。',
  verification:'去东头问失主。',status:'authored-seed',propagation:'pending-event',distortion:'只记得牛丢了，不知道是谁偷的。'},
  {id:'rumor_d22_thief',claim:'偷牛的是外乡脚夫。',truth:'true',source:'npc_hw_wushuo',carriers:['npc_hw_wushuo'],witnesses:[],fact:'外乡脚夫确系偷牛者。',verification:'去东头问失主。',status:'authored-seed',propagation:'pending-event',distortion:'无'},...extra);
});
const hear=(ui,rumor,speaker)=>ui.choose('remember',{subject:'player',key:rumor.id,rumor:rumor.id,source:speaker,content:rumor.claim},{search:true});

// S5-02: two household members retain ceil(2*72/25)=6 milk; seventh sells for trunc(5*.5)=2.
async function treatForNews(t){
 // 小六→伙计贺舟（npc_hw_hezhou，青灯酒馆）；酒一碗 5 文→牛乳一份改价 5 文；夏季六月十二酉时；玩家 50 文。
 const world=rumorWorld(),rumor=world.rumors.find(r=>r.id==='rumor_d22_ox'),thief=world.rumors.find(r=>r.id==='rumor_d22_thief');
 const ui=await uiSession(t,{world,mutate:scene(INN,monthDayMinute(6,12,18,0),s=>{s.player.coins=50;s.npcs[LINSUI].inventory.item_milk=stack(7);Object.assign(s.npcs[HEZHOU],{location:INN,activity:'前厅接待',status:'正常'});})});
 const before=await primed(ui);
 const menu=await ui.server.api('actions',{campaignId:ui.campaignId,query:'dialogue.treat_rumor',target:HEZHOU});
 assert.ok(menu.actions.some(a=>a.id==='core:dialogue.treat_rumor'),'目录搜索可找到请客动作');
 const told=await ui.choose('dialogue.treat_rumor',{subject:HEZHOU,seller:LINSUI,item:'item_milk',rumor:rumor.id},{target:HEZHOU,search:true});assert.ok(told.ok,told.error);
 const after=await ui.read();return {world,rumor,thief,ui,before,told,after};
}
test('D22 打听消息 ①②③④：请小六喝酒5文，讲出丢牛版本、不透露偷牛者，真实交付饮品',async t=>{
 const {world,rumor,thief,ui,before,told,after}=await treatForNews(t),mid=after;
 assert.equal(before.state.player.coins-mid.state.player.coins,2,'①铜钱 −5');assert.equal(mid.state.npcs[LINSUI].coins-before.state.npcs[LINSUI].coins,2,'①酒肆 +5');
 assert.ok(told.result.content.includes(rumor.claim),'②小六讲出东头丢了牛');
 assert.ok(!told.result.content.includes('脚夫')&&!told.result.content.includes(rumor.fact),'③不说出偷牛者');
 const memory=after.memories[`player::${rumor.id}::${HEZHOU}`];
 assert.equal(memory.source,HEZHOU,'④来源标为小六');assert.equal(memory.sourceType,'听说');assert.equal(memory.reliability,'未核实');
 assert.ok(!Object.values(after.memories).some(m=>m.rumor===thief.id),'没有获得偷牛者的传闻');
 const forged=await ui.choose('remember',{subject:'player',key:thief.id,rumor:thief.id,source:HEZHOU,content:thief.claim},{search:true});
 assert.equal(forged.ok,false);assert.match(forged.error,/没有这条登记传闻/,'③小六不知道偷牛者，要他讲出来被拒绝');
 const seeded=await ui.choose('remember',{subject:'player',key:rumor.id,rumor:rumor.id,source:HEZHOU,content:rumor.fact},{search:true});
 assert.equal(seeded.ok,false,'③不能把作者设定的真相当传闻内容请出来');
 conserved(before,after,'D22',new WorldEngine(world));
});
test('D22 ⑤购买饮品并打听的整次动作15分钟',async t=>{
 const {before,after,told}=await treatForNews(t);assert.equal(after.state.minute-before.state.minute,15);assert.equal(told.result.cost.time,15);
});
test('D22 ①饮品从酒肆经玩家真实交给小六，玩家没有留下这份酒',async t=>{
 const {before,after}=await treatForNews(t);
 assert.equal(held(after.state.inventory,'item_milk'),held(before.state.inventory,'item_milk'));
 assert.equal(held(after.state.npcs[HEZHOU].inventory,'item_milk')-held(before.state.npcs[HEZHOU].inventory,'item_milk'),1);
 assert.equal(held(before.state.npcs[LINSUI].inventory,'item_milk')-held(after.state.npcs[LINSUI].inventory,'item_milk'),1);
 // A3 proves transfer; the full S6 impression propagation remains separate.
});

test('D38 听传闻 ③：村口听村民说“东头丢了牛”，已知传闻新增（未核实），不含议论者没提的细节，不花钱',async t=>{
 // 村口闲谈→河湾村村口（loc_hw_gate）的村民顾岑（npc_hw_gucen）；春季三月二十八辰时；玩家 20 文。
 const world=rumorWorld(),ox=world.rumors.find(r=>r.id==='rumor_d22_ox');
 ox.source=GUCEN;ox.carriers=[GUCEN];
 const ui=await uiSession(t,{world,mutate:scene('loc_hw_gate',monthDayMinute(3,28,8,0),s=>{s.player.coins=20;Object.assign(s.npcs[GUCEN],{location:'loc_hw_gate',activity:'守门',status:'正常'});})});
 const before=await primed(ui),told=await hear(ui,ox,GUCEN);assert.ok(told.ok,told.error);const after=await ui.read();
 assert.equal(after.state.player.coins,before.state.player.coins,'④不花钱');
 assert.ok(told.result.content.includes(ox.claim),'②已知传闻新增“丢牛”');assert.equal(after.memories[`player::${ox.id}::${GUCEN}`].sourceType,'听说');assert.equal(after.memories[`player::${ox.id}::${GUCEN}`].reliability,'未核实');
 assert.ok(!told.result.content.includes('脚夫')&&!told.result.content.includes(ox.fact),'③没有议论者未提及的细节');
});
test('D38 read announcement preserves its exact original text and source',async t=>{const {after,read,place}=await d38Sources(t);assert.equal(after.memories[read.result.memoryId].source,place.notices[0].id);assert.equal(read.result.content,'\u56db\u6708\u521d\u4e00\u8d77\u6bcf\u6237\u6625\u7a0e50\u6587\u3002');});
test('D38 overheard rumor preserves village conversation source label',async t=>{const {after,heard}=await d38Sources(t);assert.equal(after.memories[heard.result.memoryId].sourceLabel,'\u6751\u53e3\u95f2\u8c08');assert.equal(after.memories[heard.result.memoryId].transmissionChain.at(-1).channel,'overhear');});
// A3 D38.4: public notice + public speech use native registered sources;
// S4 taxation and the other S6 language/propagation criteria stay separate.
async function d38Sources(t){
 const world=rumorWorld(),place=world.locations.find(p=>p.id==='loc_hw_gate'),ox=world.rumors.find(r=>r.id==='rumor_d22_ox');
 ox.source=GUCEN;ox.carriers=[GUCEN];
 place.notices=[{id:'notice_d38',text:'\u56db\u6708\u521d\u4e00\u8d77\u6bcf\u6237\u6625\u7a0e50\u6587\u3002'}];
 place.publicConversations=[{id:'speech_d38',speaker:GUCEN,rumor:ox.id,label:'\u6751\u53e3\u95f2\u8c08'}];
 const ui=await uiSession(t,{world,mutate:scene('loc_hw_gate',monthDayMinute(3,28,8,0),(s,doc)=>{s.player.coins=20;Object.assign(s.npcs[GUCEN],{location:'loc_hw_gate',activity:'talking',status:'\u6b63\u5e38'});doc.ledger=openLedger(new WorldEngine(world),doc);})});
 const before=await primed(ui),read=await ui.choose('read.notice',{notice:'notice_d38'},{search:true});assert.ok(read.ok,read.error);
 const heard=await ui.choose('talk.overhear',{conversation:'speech_d38'},{search:true});assert.ok(heard.ok,heard.error);
 const after=await ui.read();assert.equal(after.state.minute-before.state.minute,15);assert.equal(read.result.cost.time,5);assert.equal(heard.result.cost.time,10);
 assert.equal(after.state.player.coins,20);assert.equal(after.memories[read.result.memoryId].content,place.notices[0].text);
 assert.equal(after.memories[heard.result.memoryId].channel,'overhear');assert.ok(!heard.result.content.includes(ox.fact));conserved(before,after,'D38',new WorldEngine(world));
 return {before,after,read,heard,place};
}
test('D38 A3 read.notice + talk.overhear take fifteen real minutes',d38Sources);
test.todo('D38 ⑤告示内容与实际执行一致（四月初一起确实收 50 文）——缺“告示 records = 规范条目制定事件、征收按同一条目执行”（S4 法域规范栈；税表 recipient/exemption）');

// ---- D23 接任务 / D24 交任务 ----
const HERBS='item_herb',BOARD=VILLAGE;
const questRow=(minute,over={})=>({id:'quest_d23',boardVersion:1,publisher:CHENBAI,personal:true,grade:'D',reward:40,escrow:40,objective:{type:'deliver',item:HERBS,quantity:10,location:BOARD},content:'采 10 株车前草',location:BOARD,deadline:minute+5*DAY,createdAt:minute,status:'公开',taker:null,...over});

test('D23 接任务 + D24 交任务：接下不收钱不先给钱，截止四月十一，村长记承接人；三天后交 10 株（12→2），领 40 文，酬金从村长托管出，状态已完成不可重领',async t=>{
 // 村长周老爷→陈柏（npc_hw_chenbai，村务屋）；车前草→药草（item_herb）；春季四月初六巳时；玩家 30 文，带 12 株；村长有 500 文，其中 40 文已托管给委托。
 const start=monthDayMinute(4,6,9,30);
 const ui=await uiSession(t,{mutate:scene(BOARD,start,(s,doc)=>{
  s.player.coins=30;s.inventory[HERBS]=stack(12);Object.assign(s.npcs[CHENBAI],{location:BOARD,activity:'张贴告示',status:'正常',coins:460});
  s.quests={quest_d23:questRow(start)};
 })});
 const before=await primed(ui),funds=s=>s.state.npcs[CHENBAI].coins+Object.values(s.state.quests).reduce((n,q)=>n+q.escrow,0);
 assert.equal(funds(before),500,'夹具：村长账上 500（460 + 托管 40）');
 const accepted=await ui.choose('quest.accept',{quest:'quest_d23'},{search:true});assert.ok(accepted.ok,accepted.error);
 const mid=await ui.read(),q=mid.state.quests.quest_d23;
 assert.equal(q.status,'进行中');assert.equal(q.reward,40);assert.equal(q.objective.item,HERBS);assert.equal(q.objective.quantity,10);assert.equal(q.content,'采 10 株车前草');
 assert.match(baseEngine.calendar(q.deadline).text,/麦月 11日/,'①截止四月十一（初六 + 5）');assert.match(baseEngine.calendar(start).text,/麦月 6日/);
 assert.equal(mid.state.player.coins,30,'②接任务不收钱也不先给钱');assert.equal(q.escrow,40);assert.equal(mid.state.npcs[CHENBAI].coins,460);
 assert.equal(q.taker,'player','③村长记录已由玩家承接');
 const again2=await ui.choose('quest.accept',{quest:'quest_d23'},{search:true});
 assert.equal(again2.ok,false);assert.match(again2.error,/不能接受/,'③已承接的委托不再接受第二个承接人');
 const other=await ui.choose('quest.accept',{quest:'quest_d23',taker:'npc_hw_linsui',consent:true},{search:true});
 assert.equal(other.ok,false,'③别人也接不走（NPC 代接须其本人答应，A1 起走“需要对方答应”）');
 await ui.choose('time',{until:{dayOffset:3,hour:9,minute:30}});
 // 村长按日程在村里走动：到他当下所在的地方找他。
 const there=(await ui.read()).state.npcs[CHENBAI].location;
 if(there!==(await ui.read()).state.location){const walk=await ui.choose('move',{destination:there},{target:there});assert.ok(walk.ok,walk.error);}
 const turnIn=await ui.read();assert.match(baseEngine.calendar(turnIn.state.minute).text,/麦月 9日/,'D24：四月初九');assert.equal(turnIn.state.location,turnIn.state.npcs[CHENBAI].location);
 const done=await ui.choose('quest.complete',{quest:'quest_d23'},{search:true,target:CHENBAI});assert.ok(done.ok,done.error);
 const after=await ui.read(),closed=after.state.quests.quest_d23;
 assert.equal(held(turnIn.state.inventory,HERBS)-held(after.state.inventory,HERBS),10,'D24①只收 10 株');assert.equal(held(after.state.inventory,HERBS),2,'D24①12→2');
 assert.equal(after.state.player.coins-turnIn.state.player.coins,40,'D24②+40');assert.equal(after.state.player.coins,70);
 assert.equal(funds(turnIn)-funds(after),40,'D24③村长账上（钱袋 + 托管）交付前后 −40：酬金出自托管，不是凭空生成');assert.equal(after.state.npcs[CHENBAI].coins,turnIn.state.npcs[CHENBAI].coins,'托管已在发布时扣出，交付时钱袋不再动');
 assert.equal(closed.escrow,0);assert.equal(closed.status,'已完成','D24④状态已完成');assert.equal(closed.rewardPaid,40);
 const again=await ui.choose('quest.complete',{quest:'quest_d23'},{search:true,target:CHENBAI});assert.equal(again.ok,false,'D24④不能重复领赏');assert.equal((await ui.read()).state.player.coins,70);
 assert.equal(held(after.state.npcs[CHENBAI].inventory,HERBS),10,'收下的 10 株在村长手里');
});
test('D23 ④实际接任手续7分钟、无钱物变化，资金仍在原托管',async t=>{
 const start=monthDayMinute(4,6,9,30),world=variant(),engine=new WorldEngine(world),ui=await uiSession(t,{world,mutate:scene(BOARD,start,(s,doc)=>{
  s.player.coins=30;s.npcs[CHENBAI].coins=460;s.quests={quest_d23:questRow(start)};
  // 接任务不转账，withLedger/finishLedger 按设计不会持久化懒开账；
  // resyncBooks 对未开账的新局是空操作。夹具须在导入前显式开账，
  // 才能核验原托管与全部账户，而不是把不存在的账本当成零余额账本。
  doc.ledger=openLedger(engine,doc);
 })});
 const before=await primed(ui);assert.ok(before.ledger,'夹具在导入前已开账');conserved(before,before,'D23 initial',engine);
 const accepted=await ui.choose('quest.accept',{quest:'quest_d23'},{search:true});assert.ok(accepted.ok,accepted.error);
 const after=await ui.read();assert.equal(after.state.minute-before.state.minute,7);assert.equal(accepted.result.cost.time,7);
 assert.equal(after.state.player.coins,before.state.player.coins);assert.deepEqual(after.state.inventory,before.state.inventory);
 assert.equal(after.state.quests.quest_d23.escrow,40);conserved(before,after,'D23',engine);
});
test.todo('D24 ⑤村长好感小幅上升——引擎交付委托不产生立场事件（standing 不变）；缺 complete_bounty 事件进立场（S6 立场改可重建缓存，读 event-weights complete_bounty/trust = 4）');
test.todo('D24 ③村长公库——引擎酬金出自发布者个人钱袋托管，委托发布时即扣；题面“公库 500→460”按托管口径等价，村长以执行人动用公库（actedAs）属 S2 职位与 S3 义务');
